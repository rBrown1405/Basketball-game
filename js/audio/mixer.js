/* Pro BBALL Coach: the mixer (PBC.AudioMixer), one AudioContext for everything a live game plays.
 *   Court, Players, Crowd, Arena and Commentary buses → Master (volume, the arena's glue compressor, a limiter) →
 *   speakers. Each bus: two inputs, each with its own duck (continuous sources such as the crowd bed, and the
 *   one-shots) → fader → mute/solo gate → the master and a send to the arena reverb, with a meter on the gate's
 *   output (what you hear from it).
 * Every one-shot sound goes through play(): the sound's cooldown and its own limit, the bus's cap and the global cap
 * (all in PBC.AudioConfig); when a cap is hit a sound only takes the place of a lower-priority one, which fades out in
 * voices.stealFade, so a whistle, the horn or a big crowd reaction is never cut off by a dribble. Each request's
 * outcome (played, or why not: cooldown, cap, muted, paused, speed) is written into the bus event that asked for it.
 * The booth's browser voice cannot enter any Web Audio graph: the Commentary bus sets its volume (speechVolume()),
 * the booth says when it talks (speaking()), and that ducks the Crowd bus.
 * A rolling recorder keeps the last debug.recorderSeconds of the master output (saveWav()). */
(function () {
  'use strict';
  const PBC = window.PBC;
  const BUSES = ['court', 'players', 'crowd', 'arena', 'commentary'];
  const dbToGain = (db) => Math.pow(10, db / 20);
  const gainToDb = (g) => (g > 1e-7 ? 20 * Math.log10(g) : -140);

  // the recorder tap: keeps the last N frames of its input in the audio thread, hands them over on 'dump' with the
  // audio clock's frame just after the last one (so every recorded sample has its exact time on the context's clock)
  const REC_WORKLET = `class PbcRecTap extends AudioWorkletProcessor {
  constructor(o) { super(); const n = o.processorOptions.frames; this.n = n; this.L = new Float32Array(n); this.R = new Float32Array(n); this.w = 0; this.filled = 0; this.end = 0;
    this.port.onmessage = (e) => { if (e.data !== 'dump') return; const f = this.filled, L = new Float32Array(f), R = new Float32Array(f); let j = (this.w - f + this.n) % this.n;
      for (let i = 0; i < f; i++) { L[i] = this.L[j]; R[i] = this.R[j]; j = (j + 1) % this.n; } this.port.postMessage({ L, R, end: this.end }, [L.buffer, R.buffer]); }; }
  process(inputs) { const inp = inputs[0]; if (!inp || !inp.length) return true; const l = inp[0], r = inp[1] || inp[0], n = l.length;
    for (let i = 0; i < n; i++) { this.L[this.w] = l[i]; this.R[this.w] = r[i]; this.w = (this.w + 1) % this.n; } this.filled = Math.min(this.n, this.filled + n); this.end = currentFrame + n; return true; }
}
registerProcessor('pbc-rec-tap', PbcRecTap);`;

  /** a playing one-shot: the recipe adds its nodes into out and registers its sources */
  function Voice(M, id, name, bus, prio, t0, out) {
    this.M = M; this.id = id; this.name = name; this.bus = bus; this.prio = prio; this.t0 = t0; this.end = t0; this.out = out; this.srcs = []; this.stolen = false;
  }
  /** register a source node that stops at `stop` (audio time) */
  Voice.prototype.src = function (node, stop) { this.srcs.push(node); if (stop > this.end) this.end = stop; return node; };

  function create(opts) {
    opts = opts || {};
    const C = PBC.AudioConfig, Bus = PBC.AudioBus;
    const M = {
      ctx: null, destroyed: false, vol: opts.volume == null ? C.master.volume : opts.volume, sfxOn: opts.sfxOn !== false,
      paused: false, speed: 1, buses: {}, voices: [], dying: [], lastPlay: {}, nextId: 1,
      speaking: false, speechHold: 0, pushUntil: 0, duckOn: false, masterTarget: -1,
      soloN: 0, rec: null, recFrames: 0, cpu: 0,
      stats: { played: 0, stolen: 0, suppressed: {}, peakTotal: 0, peakBus: {}, peakSound: {} },
    };
    const speedMul = () => Math.max(1, M.speed / C.speedDiv);

    // ------------------------------------------------------------ graph
    function ensure() {
      if (M.ctx || M.destroyed) return M.ctx;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { M.ctx = new AC(); } catch (e) { return null; }
      const c = M.ctx;
      // master: level → glue compressor → limiter → (the limiter's automatic makeup gain taken back out) → speakers
      M.masterIn = c.createGain(); M.masterIn.gain.value = masterLevel();
      M.masterTarget = M.masterIn.gain.value;
      const comp = (o) => { const n = c.createDynamicsCompressor(); n.threshold.value = o.threshold; n.knee.value = o.knee; n.ratio.value = o.ratio; n.attack.value = o.attack; n.release.value = o.release; return n; };
      M.glue = comp(C.master.glue);
      M.limiter = comp(C.master.limiter);
      // (a DynamicsCompressorNode adds makeup gain of 0.6 x the gain it takes off a full-scale signal: for a limiter
      // with no knee that is 0.6 x -T x (1 - 1/R) dB; it is taken back so everything under the threshold is unchanged)
      const L = C.master.limiter, mk = L.threshold < 0 ? -0.6 * L.threshold * (1 - 1 / L.ratio) : 0;
      M.makeup = c.createGain(); M.makeup.gain.value = dbToGain(-mk);
      M.out = c.createGain();
      M.masterIn.connect(M.glue); M.glue.connect(M.limiter); M.limiter.connect(M.makeup); M.makeup.connect(M.out); M.out.connect(c.destination);
      M.masterAn = c.createAnalyser(); M.masterAn.fftSize = 2048; M.out.connect(M.masterAn);
      // the arena reverb (generated impulse), fed by each bus's send
      M.verb = c.createConvolver();
      M.verb.buffer = impulse(c, C.reverb.seconds, C.reverb.decay, C.reverb.fadeInSamples);
      M.verbIn = c.createGain(); M.verbIn.gain.value = 1;
      M.verbRet = c.createGain(); M.verbRet.gain.value = C.reverb.returnGain;
      M.verbIn.connect(M.verb); M.verb.connect(M.verbRet); M.verbRet.connect(M.masterIn);
      for (const name of BUSES) {
        const cfg = C.buses[name];
        const B = { name, cfg, fader: 1, mute: false, solo: false, n: 0, gateOn: true };
        // two ways in, each with its own duck: continuous sources (the crowd bed) and one-shots (the reactions)
        B.input = c.createGain();
        B.duck = c.createGain();
        B.shots = c.createGain();
        B.duckShots = c.createGain();
        B.fade = c.createGain(); B.fade.gain.value = cfg.gain;
        B.gate = c.createGain(); B.gate.gain.value = 1;
        B.send = c.createGain(); B.send.gain.value = cfg.reverbSend;
        B.an = c.createAnalyser(); B.an.fftSize = 2048;
        B.input.connect(B.duck); B.duck.connect(B.fade);
        B.shots.connect(B.duckShots); B.duckShots.connect(B.fade);
        B.fade.connect(B.gate);
        B.gate.connect(M.masterIn); B.gate.connect(B.send); B.send.connect(M.verbIn); B.gate.connect(B.an);
        // a placed sound's own extra reverb (the further from the camera, the more room): through the bus's level
        // and its mute / solo gate like everything else on the bus
        B.wetIn = c.createGain();
        B.wetFade = c.createGain(); B.wetFade.gain.value = cfg.gain;
        B.wetGate = c.createGain(); B.wetGate.gain.value = 1;
        B.wetIn.connect(B.wetFade); B.wetFade.connect(B.wetGate); B.wetGate.connect(M.verbIn);
        M.buses[name] = B;
        M.stats.peakBus[name] = 0;
      }
      // a silent source into both inputs of every bus keeps each path running when nothing plays into it: when the
      // last sound leaves a path Chrome switches it off and its duck stops following its automation, so a cheer after
      // a quiet spell started from wherever the duck had been left (and the console read a stale duck)
      if (c.createConstantSource) {
        M.keep = c.createConstantSource(); M.keep.offset.value = 0;
        for (const name of BUSES) { M.keep.connect(M.buses[name].input); M.keep.connect(M.buses[name].shots); M.keep.connect(M.buses[name].wetIn); }
        M.keep.start();
      }
      M.buf = new Float32Array(2048);
      applyGates(true);
      startRecorder();
      // the sound packs that exist load and decode in the background (the synthesized sounds play until then)
      if (PBC.AudioAssets) PBC.AudioAssets.loadAll(c).catch(() => {});
      return c;
    }
    // the arena's impulse: noise under the decay envelope, darker as it decays (an arena's air and seats take the high
    // end first: a one-pole lowpass gliding from reverb.hzStart to reverb.hzEnd; it passes the lows at full level, so
    // the reverb of anything low or middle, the crowd's bed, is what it was, and only the highs die away sooner)
    function impulse(c, secs, decay, fadeIn) {
      const R = PBC.AudioRandom.random, RV = C.reverb, sr = c.sampleRate;
      const n = Math.floor(sr * secs), buf = c.createBuffer(2, n, sr), blk = Math.floor(sr * 0.01);
      for (let ch = 0; ch < 2; ch++) {
        const d = buf.getChannelData(ch);
        let y = 0;
        for (let b0 = 0; b0 < n; b0 += blk) {
          const b1 = Math.min(n, b0 + blk), f = RV.hzStart * Math.pow(RV.hzEnd / RV.hzStart, b0 / n), a = 1 - Math.exp(-2 * Math.PI * f / sr);
          for (let i = b0; i < b1; i++) { y += a * (R() * 2 - 1 - y); d[i] = y * Math.pow(1 - i / n, decay) * (i < fadeIn ? i / fadeIn : 1); }
        }
      }
      return buf;
    }
    function masterLevel() { return M.vol * (M.paused ? C.master.pausedLevel : 1); }

    // ------------------------------------------------------------ mute, solo, the arena sound switch
    /** can this bus be heard? (its mute, the solo buttons, and for the arena buses the Arena sound setting / M key) */
    function audible(name) {
      const B = M.buses[name];
      if (!B) return false;
      if (B.mute) return false;
      if (M.soloN > 0 && !B.solo) return false;
      if (name !== 'commentary' && !M.sfxOn) return false;
      return true;
    }
    function applyGates(now) {
      if (!M.ctx) return;
      const t = M.ctx.currentTime;
      M.soloN = BUSES.filter((n) => M.buses[n] && M.buses[n].solo).length;
      for (const name of BUSES) {
        const B = M.buses[name];
        const on = audible(name);
        if (on === B.gateOn && !now) continue;
        B.gateOn = on;
        for (const g of [B.gate.gain, B.wetGate.gain]) {
          g.cancelScheduledValues(t);
          if (now) g.value = on ? 1 : 0;
          else g.setTargetAtTime(on ? 1 : 0, t, C.muteRampTc);
        }
      }
    }

    // ------------------------------------------------------------ voices
    function prune(now) {
      const V = M.voices;
      for (let i = V.length - 1; i >= 0; i--) {
        const v = V[i];
        // (its sources stop at `end`: from then on it holds no place under the caps)
        if (v.end < now) { V.splice(i, 1); M.buses[v.bus].n--; try { v.out.disconnect(); } catch (e) { /* gone */ } }
      }
      const D = M.dying;
      for (let i = D.length - 1; i >= 0; i--) if (D[i].end < now) { try { D[i].out.disconnect(); } catch (e) { /* gone */ } D.splice(i, 1); }
    }
    function steal(v) {
      const now = M.ctx.currentTime, f = C.voices.stealFade;
      const i = M.voices.indexOf(v);
      if (i >= 0) { M.voices.splice(i, 1); M.buses[v.bus].n--; }
      v.stolen = true;
      try { const g = v.out.gain; g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(0, now + f); } catch (e) { /* ignore */ }
      for (const s of v.srcs) { try { s.stop(now + f + 0.01); } catch (e) { /* not started or already stopped */ } }
      v.end = now + f + 0.01;
      M.dying.push(v);
      M.stats.stolen++;
    }
    /** end a playing voice early with a short fade (a ball rolling on the floor that somebody picks up) */
    function stop(v, fade) {
      if (!v || v.stolen || !M.ctx) return false;
      const now = M.ctx.currentTime;
      if (v.end < now) return false;
      const f = Math.max(0.005, fade == null ? 0.04 : fade);
      const i = M.voices.indexOf(v);
      if (i >= 0) { M.voices.splice(i, 1); M.buses[v.bus].n--; }
      v.stolen = true;
      const at = Math.max(now, v.t0);
      try { const g = v.out.gain; g.cancelScheduledValues(at); g.setValueAtTime(g.value, at); g.linearRampToValueAtTime(0, at + f); } catch (e) { /* ignore */ }
      for (const s of v.srcs) { try { s.stop(at + f + 0.01); } catch (e) { /* not started or already stopped */ } }
      v.end = at + f + 0.01;
      M.dying.push(v);
      M.stats.stopped = (M.stats.stopped || 0) + 1;
      return true;
    }
    /** the lowest-priority voice (the oldest of those) in the list, if its priority is below prio */
    function victim(list, prio) {
      let best = null;
      for (const v of list) if (v.prio < prio && (!best || v.prio < best.prio || (v.prio === best.prio && v.id < best.id))) best = v;
      return best;
    }
    function refuse(rec, why) {
      rec.s = why;
      M.stats.suppressed[why] = (M.stats.suppressed[why] || 0) + 1;
      Bus.note(rec);
      return null;
    }
    /**
     * play a one-shot sound. name: a key of AudioConfig.sounds (its bus, priority, cooldown, limit); v: its level
     * (0..1+); build(voice, v): the recipe, which adds its nodes into voice.out from voice.t0 and registers its sources
     * with voice.src(node, stopTime). o: { when (audio time to start), bus (another bus, for test tones), level
     * (a crowd reaction's size: big ones lift the duck), force (plays while paused: the final horn), place (where it
     * is from the camera, js/audio/court.js: { pan -1..1, db, lp (Hz), wet (extra reverb send) }) }
     */
    function play(name, v, build, o) {
      const t00 = performance.now();
      o = o || {};
      const sc = C.sounds[name] || { bus: 'court', prio: 50, cooldownMs: 0, max: 4 };
      const busName = o.bus || sc.bus;
      const rec = { n: name, b: busName, p: sc.prio, s: 'play', v: Math.round((v == null ? 1 : v) * 100) / 100 };
      if (o.tag) rec.tag = o.tag;
      try {
        const c = M.ctx;
        if (!c || M.destroyed || c.state !== 'running') return refuse(rec, 'no audio');
        if (!audible(busName)) return refuse(rec, 'muted');
        if (M.paused && !o.force) return refuse(rec, 'paused');
        if (sc.cutAtSpeed && M.speed >= sc.cutAtSpeed) return refuse(rec, 'speed');
        const tNow = performance.now();
        if (sc.cooldownMs > 0) {
          const last = M.lastPlay[name];
          if (last != null && tNow - last < sc.cooldownMs * speedMul()) return refuse(rec, 'cooldown');
        }
        const now = c.currentTime;
        prune(now);
        // its own limit: the oldest of the same sound makes room
        let same = 0, oldest = null;
        for (const x of M.voices) if (x.name === name) { same++; if (!oldest || x.id < oldest.id) oldest = x; }
        if (same >= sc.max && oldest) { steal(oldest); rec.stole = name; }
        // the bus cap, then the global cap: only a lower priority sound gives way
        const B = M.buses[busName];
        if (B.n >= B.cfg.cap) {
          const w = victim(M.voices.filter((x) => x.bus === busName), sc.prio);
          if (!w) return refuse(rec, 'bus cap');
          steal(w); rec.stole = w.name;
        }
        if (M.voices.length >= C.voices.globalCap) {
          const w = victim(M.voices, sc.prio);
          if (!w) return refuse(rec, 'voice cap');
          steal(w); rec.stole = w.name;
        }
        M.lastPlay[name] = tNow;
        const t0 = Math.max(now, o.when || 0) + 0.005;
        const out = c.createGain();
        const voice = new Voice(M, M.nextId++, name, busName, sc.prio, t0, out);
        // where it is: its distance level on out, then the air (a lowpass) and the pan, and its own extra reverb
        let tail = out;
        const P = o.place;
        if (P) {
          // (a mono sound through the panner is 3 dB down on each side in the middle, the equal-power law: given back
          // here, so a placed sound in the middle of the picture is as loud as it was unplaced)
          out.gain.value = dbToGain((P.db || 0) + (c.createStereoPanner ? 3.01 : 0));
          // (a lowpass's Q is in dB in Web Audio: -3.01 is the flat Butterworth, no bump under the cutoff)
          if (P.lp && P.lp < 19000) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = P.lp; f.Q.value = -3.01; tail.connect(f); tail = f; }
          if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, P.pan || 0)); tail.connect(p); tail = p; }
          if (P.wet > 0.001) { const w = c.createGain(); w.gain.value = P.wet; tail.connect(w); w.connect(B.wetIn); }
          rec.pl = [Math.round((P.pan || 0) * 100) / 100, Math.round((P.db || 0) * 10) / 10];
        }
        tail.connect(B.shots);
        try { build(voice, v == null ? 1 : v); } catch (e) { try { out.disconnect(); } catch (e2) { /* ignore */ } console.error('audio recipe ' + name, e); return refuse(rec, 'error'); }
        M.voices.push(voice); B.n++;
        M.stats.played++;
        if (M.voices.length > M.stats.peakTotal) M.stats.peakTotal = M.voices.length;
        if (B.n > M.stats.peakBus[busName]) M.stats.peakBus[busName] = B.n;
        let nSame = 0; for (const x of M.voices) if (x.name === name) nSame++;
        if (nSame > (M.stats.peakSound[name] || 0)) M.stats.peakSound[name] = nSame;
        if (o.when && o.when > now + 0.01) rec.at = Math.round((o.when - now) * 1000);
        Bus.note(rec);
        if (o.level != null && o.level >= C.duck.pushThrough) pushThrough(t0);
        return voice;
      } finally { M.cpu += performance.now() - t00; }
    }

    // ------------------------------------------------------------ ducking
    // while the booth talks the Crowd bus (and any arena music bus) drops, its bed more than its reactions; a big
    // crowd reaction lifts it for its swell and then hands back to the voice slowly
    function pushThrough(t0) {
      if (!M.ctx) return;
      M.pushUntil = Math.max(M.pushUntil, t0 + C.duck.pushHold);
      updateDuck();
    }
    function updateDuck() {
      if (!M.ctx) return;
      const now = M.ctx.currentTime, D = C.duck;
      const talk = M.speaking || now < M.speechHold;
      const push = now < M.pushUntil;
      const on = talk && !push;
      if (on === M.duckOn) return;
      M.duckOn = on;
      // down: at once when the booth starts, slowly when a push-through just ended (the roar is still ringing);
      // up: at once for a push-through, slowly when the booth is done
      const T = on ? (now - M.pushUntil < 0.25 ? D.pushReturn : D.attack) : (push ? D.attack : D.release);
      const tc = T / 3; // (setTargetAtTime: about 95 % of the way in three time constants)
      const set = (name, db, dbShots) => {
        const B = M.buses[name]; if (!B) return;
        B.duck.gain.cancelScheduledValues(now); B.duck.gain.setTargetAtTime(on ? dbToGain(db) : 1, now, tc);
        B.duckShots.gain.cancelScheduledValues(now); B.duckShots.gain.setTargetAtTime(on ? dbToGain(dbShots) : 1, now, tc);
      };
      set('crowd', D.crowdDb, D.crowdReactDb);
      for (const n of D.arenaBuses || []) set(n, D.arenaDb, D.arenaDb);
    }

    // ------------------------------------------------------------ the recorder
    function startRecorder() {
      const c = M.ctx;
      const frames = Math.ceil(C.debug.recorderSeconds * c.sampleRate);
      M.recFrames = frames;
      const sink = c.createGain(); sink.gain.value = 0; sink.connect(c.destination);
      const viaScript = () => {
        // fallback (older browsers): a ScriptProcessor on the main thread
        if (!c.createScriptProcessor) return;
        const sp = c.createScriptProcessor(4096, 2, 2);
        const L = new Float32Array(frames), R = new Float32Array(frames);
        const r = { kind: 'script', w: 0, filled: 0 };
        sp.onaudioprocess = (e) => {
          const a = e.inputBuffer.getChannelData(0), b = e.inputBuffer.numberOfChannels > 1 ? e.inputBuffer.getChannelData(1) : a;
          for (let i = 0; i < a.length; i++) { L[r.w] = a[i]; R[r.w] = b[i]; r.w = (r.w + 1) % frames; }
          r.filled = Math.min(frames, r.filled + a.length);
        };
        r.dump = () => {
          const f = r.filled, l = new Float32Array(f), rr = new Float32Array(f);
          let j = (r.w - f + frames) % frames;
          for (let i = 0; i < f; i++) { l[i] = L[j]; rr[i] = R[j]; j = (j + 1) % frames; }
          // (on the main thread the last block's time is only known roughly: now)
          return Promise.resolve({ L: l, R: rr, end: Math.round(c.currentTime * c.sampleRate) });
        };
        M.out.connect(sp); sp.connect(sink);
        M.rec = r;
      };
      if (!c.audioWorklet || typeof AudioWorkletNode === 'undefined') { viaScript(); return; }
      // the worklet's code from a data: URL (a page opened as a file cannot load a worklet from a blob: URL), else a
      // blob: URL, else the ScriptProcessor
      const dataUrl = 'data:application/javascript;base64,' + btoa(REC_WORKLET);
      let blobUrl = null;
      const tryBlob = () => { blobUrl = URL.createObjectURL(new Blob([REC_WORKLET], { type: 'application/javascript' })); return c.audioWorklet.addModule(blobUrl); };
      c.audioWorklet.addModule(dataUrl).catch(tryBlob).then(() => {
        if (M.destroyed) return;
        const node = new AudioWorkletNode(c, 'pbc-rec-tap', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], processorOptions: { frames } });
        const r = { kind: 'worklet', node, waiting: [] };
        node.port.onmessage = (e) => { const w = r.waiting.shift(); if (w) w(e.data); };
        r.dump = () => new Promise((res) => { r.waiting.push(res); node.port.postMessage('dump'); });
        M.out.connect(node); node.connect(sink);
        M.rec = r;
      }).catch(() => { if (!M.destroyed) viaScript(); }).then(() => { if (blobUrl) { try { URL.revokeObjectURL(blobUrl); } catch (e) { /* ignore */ } } });
    }
    function wav(L, R, sr) {
      const n = L.length, buf = new ArrayBuffer(44 + n * 4), d = new DataView(buf);
      const str = (o, s) => { for (let i = 0; i < s.length; i++) d.setUint8(o + i, s.charCodeAt(i)); };
      str(0, 'RIFF'); d.setUint32(4, 36 + n * 4, true); str(8, 'WAVE'); str(12, 'fmt '); d.setUint32(16, 16, true);
      d.setUint16(20, 1, true); d.setUint16(22, 2, true); d.setUint32(24, sr, true); d.setUint32(28, sr * 4, true);
      d.setUint16(32, 4, true); d.setUint16(34, 16, true); str(36, 'data'); d.setUint32(40, n * 4, true);
      let o = 44;
      for (let i = 0; i < n; i++) {
        d.setInt16(o, Math.max(-1, Math.min(1, L[i])) * 32767, true); o += 2;
        d.setInt16(o, Math.max(-1, Math.min(1, R[i])) * 32767, true); o += 2;
      }
      return buf;
    }

    // ------------------------------------------------------------ public
    const api = {
      get ctx() { return M.ctx; },
      BUSES,
      ensure,
      unlock() { const c = ensure(); if (c && c.state === 'suspended') c.resume().catch(() => {}); return c; },
      running() { return !!(M.ctx && M.ctx.state === 'running' && !M.destroyed); },
      now() { return M.ctx ? M.ctx.currentTime : 0; },
      /** the input of a bus, for continuous sources (the crowd bed) and the booth's premium voices */
      input(name) { ensure(); return M.buses[name] ? M.buses[name].input : null; },
      play,
      stop,
      audible,
      /** the booth is talking (true) or done (false): ducks the crowd */
      speaking(on) {
        if (!M.ctx) { M.speaking = !!on; return; }
        if (M.speaking && !on) M.speechHold = M.ctx.currentTime + C.duck.hold;
        M.speaking = !!on;
        updateDuck();
      },
      isSpeaking() { return M.speaking; },
      /** the browser voice's volume: master volume plus speechBoost, times the Commentary bus (0 muted or not soloed) */
      speechVolume() {
        const B = M.buses.commentary;
        const bus = M.ctx ? (audible('commentary') ? B.fader : 0) : 1;
        return Math.max(0, Math.min(1, (M.vol + C.speechBoost) * bus));
      },
      setVolume(v) { M.vol = Math.max(0, Math.min(1, +v)); },
      volume() { return M.vol; },
      /** the Arena sound setting and the M key: court, players, crowd and arena buses on or off */
      setSfx(on) { M.sfxOn = !!on; applyGates(); },
      sfxOn() { return M.sfxOn; },
      setPaused(p) { M.paused = !!p; },
      setSpeed(s) { M.speed = +s || 1; },
      speed() { return M.speed; },
      // debug console: fader (0..1.5 of the bus's level), mute, solo
      setFader(name, g) { const B = M.buses[name]; if (!B) return; B.fader = Math.max(0, Math.min(1.5, +g)); for (const n of [B.fade, B.wetFade]) n.gain.setTargetAtTime(B.cfg.gain * B.fader, M.ctx.currentTime, C.muteRampTc); },
      mute(name, on) { const B = M.buses[name]; if (!B) return; B.mute = on == null ? !B.mute : !!on; applyGates(); },
      solo(name, on) { const B = M.buses[name]; if (!B) return; B.solo = on == null ? !B.solo : !!on; applyGates(); },
      clearSolo() { for (const n of BUSES) if (M.buses[n]) M.buses[n].solo = false; applyGates(); },
      busState(name) { const B = M.buses[name]; return B ? { name, label: B.cfg.label, fader: B.fader, mute: B.mute, solo: B.solo, audible: audible(name), voices: B.n, cap: B.cfg.cap, duckDb: gainToDb(B.duck.gain.value), duckShotsDb: gainToDb(B.duckShots.gain.value) } : null; },
      /** meter of a bus (or 'master'): rms and peak in dBFS over the last ~43 ms */
      meter(name) {
        if (!M.ctx) return { rms: -140, peak: -140 };
        const an = name === 'master' ? M.masterAn : M.buses[name] && M.buses[name].an;
        if (!an) return { rms: -140, peak: -140 };
        an.getFloatTimeDomainData(M.buf);
        let s = 0, p = 0;
        for (let i = 0; i < M.buf.length; i++) { const x = M.buf[i]; s += x * x; const a = x < 0 ? -x : x; if (a > p) p = a; }
        return { rms: gainToDb(Math.sqrt(s / M.buf.length)), peak: gainToDb(p) };
      },
      limiterDb() { return M.limiter ? M.limiter.reduction : 0; },
      /** the crowd's duck now (dB): the bed's, and with reactions: true the reactions' */
      duckDb(reactions) { const B = M.buses.crowd; return B ? gainToDb((reactions ? B.duckShots : B.duck).gain.value) : 0; },
      voiceCount() { return M.voices.length; },
      voiceList() { return M.voices.map((v) => ({ id: v.id, name: v.name, bus: v.bus, prio: v.prio })); },
      stats() { return JSON.parse(JSON.stringify(M.stats)); },
      cpuMs() { return M.cpu; },
      /** the last `secs` (default all, up to recorderSeconds) of the master as a 16-bit stereo WAV */
      saveWav(secs) {
        return api.recording(secs).then((d) => (d ? { wav: wav(d.L, d.R, d.sampleRate), seconds: d.L.length / d.sampleRate, sampleRate: d.sampleRate, kind: d.kind, start: d.start } : null));
      },
      /** the last `secs` of the master as samples, with the audio time of the first one (start): the tests line
       *  sounds up against what was scheduled with it */
      recording(secs) {
        if (!M.rec) return Promise.resolve(null);
        return M.rec.dump().then((d) => {
          let L = d.L, R = d.R;
          const sr = M.ctx.sampleRate;
          if (secs && L.length > secs * sr) { const k = L.length - Math.floor(secs * sr); L = L.subarray(k); R = R.subarray(k); }
          return { L, R, sampleRate: sr, start: (d.end - L.length) / sr, kind: M.rec.kind };
        });
      },
      recorderKind() { return M.rec ? M.rec.kind : null; },
      /** once a frame: finished voices are let go, the duck and the master level follow their targets */
      update() {
        if (!M.ctx || M.destroyed) return;
        const t00 = performance.now();
        const now = M.ctx.currentTime;
        prune(now);
        updateDuck();
        const lvl = masterLevel();
        if (lvl !== M.masterTarget) { M.masterTarget = lvl; M.masterIn.gain.setTargetAtTime(lvl, now, C.master.fadeTc); }
        M.cpu += performance.now() - t00;
      },
      destroy() {
        M.destroyed = true;
        try { if (M.ctx) M.ctx.close(); } catch (e) { /* ignore */ }
        M.voices = []; M.dying = [];
      },
    };
    return api;
  }

  PBC.AudioMixer = { create, BUSES, dbToGain, gainToDb };
})();
