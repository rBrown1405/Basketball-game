/* Pro BBALL Coach — the broadcast mixer (PBC.AudioMixer).
 * One AudioContext for the whole broadcast. Every sound goes through a bus:
 *
 *   voice -> bus input -> duck -> fader -> mute/solo -> meter ----------------> master
 *                                                    \-> reverb send -> reverb -> return -> master
 *   master -> glue compressor -> limiter -> out -> speakers
 *                                              \-> meter, rolling recorder ("last 30 seconds")
 *
 * Buses: court, players, crowd, arena, commentary (PBC.AudioConfig.buses).
 * Voices: every one-shot asks mixer.voice(name) for a slot. Limits per sound, per bus and overall; when full, the
 * least important (then oldest) voice is faded out and stolen, or the new sound is dropped if everything playing
 * matters more. Nothing important is ever cut off by something minor.
 * Ducking: mixer.setTalking(true) dips the crowd and arena buses smoothly while a commentator speaks;
 * mixer.pushThrough(amount) lets a big crowd moment rise back over the dip.
 * No AudioContext is created before mixer.ensure() (called on the first user gesture). */
(function () {
  'use strict';
  const PBC = window.PBC = window.PBC || {};
  const dbToGain = db => Math.pow(10, db / 20);
  const gainToDb = g => (g > 1e-7 ? 20 * Math.log10(g) : -140);

  // rolling recorder processor (runs on the audio thread; loaded from a data: URL so it works from file://)
  const REC_SRC = `class PbcRing extends AudioWorkletProcessor {
  constructor(o) { super(); const n = o.processorOptions.frames; this.n = n; this.ch = [new Float32Array(n), new Float32Array(n)]; this.w = 0; this.filled = 0;
    this.port.onmessage = (e) => { if (e.data !== 'dump') return; const f = this.filled, s = (this.w - f + this.n) % this.n;
      const out = this.ch.map(c => { const a = new Float32Array(f); for (let i = 0; i < f; i++) a[i] = c[(s + i) % this.n]; return a; });
      this.port.postMessage({ ch: out, sr: sampleRate }, out.map(a => a.buffer)); }; }
  process(inputs) { const inp = inputs[0]; if (inp && inp.length) { const L = inp[0], R = inp[1] || inp[0];
    for (let i = 0; i < L.length; i++) { this.ch[0][this.w] = L[i]; this.ch[1][this.w] = R[i]; this.w = (this.w + 1) % this.n; }
    this.filled = Math.min(this.n, this.filled + L.length); } return true; }
}
registerProcessor('pbc-ring', PbcRing);`;

  function create(opts) {
    opts = opts || {};
    const C = () => PBC.AudioConfig;
    const bus = opts.bus || null;
    const speed = opts.speed || (() => 1);
    const M = {
      ctx: null, destroyed: false, buses: {}, master: null, talking: false, push: 0,
      muted: {}, soloed: {}, userOff: {}, active: [], dead: [], lastPlay: {},
      stats: { ms: 0, voices: 0, stolen: 0, dropped: 0, played: 0 }, recorder: null, duckTarget: {},
    };

    // ---------------------------------------------------------- graph
    function ensure() {
      if (M.ctx || M.destroyed) return M.ctx;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { M.ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { return null; }
      const c = M.ctx, cfg = C();
      const mc = cfg.master;
      M.masterIn = c.createGain(); M.masterIn.gain.value = mc.level;
      M.comp = c.createDynamicsCompressor();
      setComp(M.comp, mc.comp);
      M.limiter = c.createDynamicsCompressor();
      setComp(M.limiter, mc.limiter);
      M.out = c.createGain(); M.out.gain.value = 1;
      M.masterIn.connect(M.comp); M.comp.connect(M.limiter); M.limiter.connect(M.out); M.out.connect(c.destination);
      M.masterMeter = analyser(c); M.out.connect(M.masterMeter);
      // shared arena reverb
      M.verb = c.createConvolver();
      M.verbReturn = c.createGain(); M.verbReturn.gain.value = cfg.reverb.returnLevel;
      M.verb.connect(M.verbReturn); M.verbReturn.connect(M.masterIn);
      for (const name of cfg.buses) {
        const bc = cfg.bus[name] || { level: 1, reverbSend: 0 };
        const b = { name, input: c.createGain(), duck: c.createGain(), fader: c.createGain(), mute: c.createGain(), send: c.createGain(), meter: analyser(c) };
        b.fader.gain.value = bc.level; b.send.gain.value = bc.reverbSend || 0;
        b.input.connect(b.duck); b.duck.connect(b.fader); b.fader.connect(b.mute); b.mute.connect(M.masterIn); b.mute.connect(b.meter);
        if (bc.reverbSend) { b.mute.connect(b.send); b.send.connect(M.verb); }
        M.buses[name] = b;
      }
      applyMutes();
      // the heavy parts (the reverb impulse, the recorder) are built in small slices after this frame, so the click that
      // starts the audio never stalls the picture
      buildImpulse(c, cfg.reverb, (buf) => {
        if (M.destroyed) return;
        M.verb.buffer = buf;
        if (cfg.recorder.enabled) startRecorder();
      });
      return c;
    }
    /** run fn(from, to) over [0, n) in slices of at most `sliceMs`, yielding between them; then done() */
    function sliced(n, fn, done) {
      const budget = C().assets.decodeBudgetMs || 4;
      let i = 0;
      const step = () => {
        if (M.destroyed) return;
        const t0 = performance.now();
        while (i < n && performance.now() - t0 < budget) { const j = Math.min(n, i + 4096); fn(i, j); i = j; }
        if (i < n) setTimeout(step, 0); else done();
      };
      setTimeout(step, 0);
    }
    function buildImpulse(c, rv, done) {
      const n = Math.floor(c.sampleRate * rv.seconds), buf = c.createBuffer(2, n, c.sampleRate);
      const d0 = buf.getChannelData(0), d1 = buf.getChannelData(1), fade = rv.fadeInSamples, decay = rv.decay;
      sliced(n, (a, b) => {
        for (let i = a; i < b; i++) {
          const env = Math.pow(1 - i / n, decay) * (i < fade ? i / fade : 1);
          d0[i] = (Math.random() * 2 - 1) * env; d1[i] = (Math.random() * 2 - 1) * env;
        }
      }, () => done(buf));
    }
    function setComp(n, o) {
      n.threshold.value = o.thresholdDb; n.ratio.value = o.ratio; n.attack.value = o.attack; n.release.value = o.release;
      if (o.kneeDb != null) n.knee.value = o.kneeDb;
    }
    function analyser(c) { const a = c.createAnalyser(); a.fftSize = 1024; a.smoothingTimeConstant = 0; return a; }

    // ---------------------------------------------------------- voices
    function prune() {
      const t = M.ctx.currentTime;
      for (let i = M.active.length - 1; i >= 0; i--) {
        const v = M.active[i];
        if (t > v.t1 + 0.1) { M.active.splice(i, 1); try { v.out.disconnect(); } catch (e) { /* gone */ } }
      }
      for (let i = M.dead.length - 1; i >= 0; i--) {
        const v = M.dead[i];
        if (t > v.killAt) { M.dead.splice(i, 1); try { v.out.disconnect(); } catch (e) { /* gone */ } }
      }
    }
    /** pick the voice to steal from a pool: lowest priority first, then the oldest */
    function victim(pool) {
      let best = null;
      for (const v of pool) if (!best || v.pri < best.pri || (v.pri === best.pri && v.t0 < best.t0)) best = v;
      return best;
    }
    function steal(v) {
      const i = M.active.indexOf(v);
      if (i >= 0) M.active.splice(i, 1);
      const t = M.ctx.currentTime, f = C().voices.stealFade;
      v.out.gain.cancelScheduledValues(t);
      v.out.gain.setValueAtTime(v.out.gain.value, t);
      v.out.gain.linearRampToValueAtTime(0, t + f);
      v.killAt = t + f + 0.05;
      M.dead.push(v);
      M.stats.stolen++;
    }
    /**
     * Ask for a voice slot. name: a key of AudioConfig.voices.sounds. o.dur: how long the sound lasts (seconds,
     * including anything scheduled ahead). Returns { out: GainNode to connect the sound into, when } or null when the
     * sound should not play (muted context, too soon after the last one, or everything playing matters more).
     */
    function voice(name, o) {
      o = o || {};
      if (!M.ctx || M.ctx.state !== 'running' || M.destroyed) return null;
      const t0p = performance.now();
      const vc = C().voices, sc = vc.sounds[name] || { bus: o.bus || 'court', pri: 5, max: 4, gapMs: 0 };
      const busName = o.bus || sc.bus, b = M.buses[busName];
      const rec = { name, bus: busName, pri: sc.pri };
      let result = null;
      try {
        if (!b) { rec.dropped = 'no bus'; return null; }
        const sp = speed();
        if (sc.dropAtSpeed && sp >= sc.dropAtSpeed) { rec.dropped = 'speed'; return null; }
        const now = performance.now();
        if (sc.gapMs && M.lastPlay[name] && now - M.lastPlay[name] < sc.gapMs * Math.max(1, sp / 2)) { rec.dropped = 'gap'; return null; }
        prune();
        const pri = o.pri != null ? o.pri : sc.pri;
        rec.pri = pri;
        // the tightest pool that is full decides who has to make room
        const pools = [
          [v => v.name === name, sc.max],
          [v => v.bus === busName, (vc.maxPerBus || {})[busName] || 16],
          [() => true, vc.maxTotal],
        ];
        for (const [inPool, max] of pools) {
          let pool = M.active.filter(inPool);
          while (pool.length >= max) {
            const v = victim(pool);
            if (!v || v.pri > pri) { rec.dropped = 'full'; M.stats.dropped++; return null; }
            steal(v);
            rec.stolen = v.name;
            pool = M.active.filter(inPool);
          }
        }
        const out = M.ctx.createGain();
        out.gain.value = sc.gain != null ? sc.gain : 1;
        out.connect(b.input);
        const t = M.ctx.currentTime;
        const v = { name, bus: busName, pri, t0: t, t1: t + (o.dur || 1), out };
        M.active.push(v);
        M.lastPlay[name] = now;
        M.stats.played++;
        result = { out, when: t + 0.005, ctx: M.ctx };
        return result;
      } finally {
        if (bus && !o.silentLog) bus.noteSound(rec);
        M.stats.ms += performance.now() - t0p;
      }
    }

    // ---------------------------------------------------------- mute / solo / ducking
    function applyMutes() {
      if (!M.ctx) return;
      const anySolo = Object.keys(M.soloed).some(k => M.soloed[k]);
      const t = M.ctx.currentTime, r = C().muteRamp;
      for (const name in M.buses) {
        const on = !M.userOff[name] && !M.muted[name] && (!anySolo || M.soloed[name]);
        M.buses[name].mute.gain.setTargetAtTime(on ? 1 : 0, t, r);
        M.buses[name].audible = on;
      }
    }
    function update(dt) {
      if (!M.ctx || M.destroyed) return;
      const t0p = performance.now();
      const dc = C().duck;
      M.push = Math.max(0, M.push - dt / Math.max(0.05, dc.pushThroughDecay));
      const t = M.ctx.currentTime;
      const talking = M.talking || (M.talkOff != null && performance.now() - M.talkOff < dc.hold * 1000);
      for (const name in M.buses) {
        const db = (dc.targets[name] || 0) * (talking ? 1 : 0) * (1 - Math.min(dc.pushThroughMax, M.push));
        const g = dbToGain(db);
        if (Math.abs((M.duckTarget[name] == null ? 1 : M.duckTarget[name]) - g) > 0.004) {
          const down = g < (M.duckTarget[name] == null ? 1 : M.duckTarget[name]);
          M.duckTarget[name] = g;
          M.buses[name].duck.gain.setTargetAtTime(g, t, down ? dc.attack : M.push > 0.05 ? dc.pushThroughRise : dc.release);
        }
      }
      if (M.active.length) prune();
      M.stats.voices = M.active.length;
      M.stats.ms += performance.now() - t0p;
    }

    // ---------------------------------------------------------- meters
    const tmp = new Float32Array(1024);
    function readMeter(a) {
      a.getFloatTimeDomainData(tmp);
      let sum = 0, peak = 0;
      for (let i = 0; i < tmp.length; i++) { const x = tmp[i]; sum += x * x; const ax = x < 0 ? -x : x; if (ax > peak) peak = ax; }
      return { rms: gainToDb(Math.sqrt(sum / tmp.length)), peak: gainToDb(peak) };
    }
    function meters() {
      if (!M.ctx) return null;
      const o = { master: readMeter(M.masterMeter) };
      for (const name in M.buses) o[name] = readMeter(M.buses[name].meter);
      o.duck = {}; for (const name in M.buses) o.duck[name] = gainToDb(M.duckTarget[name] == null ? 1 : M.duckTarget[name]);
      return o;
    }

    // ---------------------------------------------------------- rolling recorder
    function startRecorder() {
      const c = M.ctx, rc = C().recorder;
      const frames = Math.ceil(c.sampleRate * rc.seconds);
      const sink = c.createGain(); sink.gain.value = 0; sink.connect(c.destination);
      const R = { kind: null, node: null, sink, pending: null };
      M.recorder = R;
      const fallback = () => {
        // main-thread fallback for browsers without AudioWorklet
        const n = frames, ch = [new Float32Array(n), new Float32Array(n)];
        let w = 0, filled = 0;
        const sp = c.createScriptProcessor(4096, 2, 2);
        sp.onaudioprocess = (e) => {
          const L = e.inputBuffer.getChannelData(0), Rr = e.inputBuffer.numberOfChannels > 1 ? e.inputBuffer.getChannelData(1) : L;
          for (let i = 0; i < L.length; i++) { ch[0][w] = L[i]; ch[1][w] = Rr[i]; w = (w + 1) % n; }
          filled = Math.min(n, filled + L.length);
        };
        M.out.connect(sp); sp.connect(sink);
        R.kind = 'script'; R.node = sp;
        R.dump = () => Promise.resolve({ ch: ch.map(c0 => { const a = new Float32Array(filled), s = (w - filled + n) % n; for (let i = 0; i < filled; i++) a[i] = c0[(s + i) % n]; return a; }), sr: c.sampleRate });
      };
      if (c.audioWorklet && typeof AudioWorkletNode !== 'undefined') {
        const url = 'data:application/javascript;base64,' + btoa(REC_SRC);
        c.audioWorklet.addModule(url).then(() => {
          if (M.destroyed) return;
          const node = new AudioWorkletNode(c, 'pbc-ring', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], processorOptions: { frames } });
          M.out.connect(node); node.connect(sink);
          R.kind = 'worklet'; R.node = node;
          R.dump = () => new Promise((res) => { node.port.onmessage = (e) => res(e.data); node.port.postMessage('dump'); });
        }).catch((e) => { console.warn('recorder worklet unavailable, using fallback', e); try { fallback(); } catch (e2) { R.kind = 'none'; } });
      } else { try { fallback(); } catch (e) { R.kind = 'none'; } }
    }
    function wav(data) {
      const ch = data.ch, n = ch[0].length, sr = data.sr, nc = ch.length;
      const buf = new ArrayBuffer(44 + n * nc * 2), dv = new DataView(buf);
      const str = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
      str(0, 'RIFF'); dv.setUint32(4, 36 + n * nc * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
      dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, nc, true); dv.setUint32(24, sr, true);
      dv.setUint32(28, sr * nc * 2, true); dv.setUint16(32, nc * 2, true); dv.setUint16(34, 16, true); str(36, 'data'); dv.setUint32(40, n * nc * 2, true);
      let o = 44;
      for (let i = 0; i < n; i++) for (let k = 0; k < nc; k++) { const x = Math.max(-1, Math.min(1, ch[k][i])); dv.setInt16(o, x < 0 ? x * 0x8000 : x * 0x7fff, true); o += 2; }
      return new Blob([buf], { type: 'audio/wav' });
    }
    /** the last N seconds of the master output as a WAV blob: { blob, seconds, peakDb } */
    function grabClip() {
      const R = M.recorder;
      if (!R || !R.dump) return Promise.reject(new Error('recorder not running'));
      return R.dump().then(d => {
        let peak = 0; for (const c0 of d.ch) for (let i = 0; i < c0.length; i++) { const a = Math.abs(c0[i]); if (a > peak) peak = a; }
        return { blob: wav(d), seconds: d.ch[0].length / d.sr, peakDb: gainToDb(peak), sampleRate: d.sr };
      });
    }

    // ---------------------------------------------------------- public
    return {
      ensure,
      get ctx() { return M.ctx; },
      get running() { return !!(M.ctx && M.ctx.state === 'running'); },
      busInput(name) { ensure(); return M.buses[name] ? M.buses[name].input : null; },
      /** do heavy setup work in small slices between frames: fn(from, to) over [0, n), then done() */
      sliced: (n, fn, done) => sliced(n, fn, done),
      /** a short sine tone into one bus: proves a bus is wired end to end (used by the trace test) */
      testTone(name, secs, freq) {
        const slot = voice('testTone', { bus: name, dur: (secs || 1) + 0.1 });
        if (!slot) return false;
        const c = M.ctx, o = c.createOscillator(), g = c.createGain(), t = c.currentTime;
        o.frequency.value = freq || 440; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.1, t + 0.02);
        g.gain.setValueAtTime(0.1, t + (secs || 1) - 0.03); g.gain.linearRampToValueAtTime(0, t + (secs || 1));
        o.connect(g); g.connect(slot.out); o.start(t); o.stop(t + (secs || 1) + 0.02);
        return true;
      },
      voice,
      update,
      setMaster(level, paused) {
        if (!M.ctx) return;
        const mc = C().master;
        M.masterIn.gain.setTargetAtTime(paused ? level * mc.pausedLevel : level, M.ctx.currentTime, mc.levelSmoothing);
      },
      setTalking(on) { if (M.talking && !on) M.talkOff = performance.now(); M.talking = !!on; },
      get talking() { return M.talking; },
      pushThrough(amount) { M.push = Math.max(M.push, Math.min(1, amount)); },
      mute(name, on) { M.muted[name] = on == null ? !M.muted[name] : !!on; applyMutes(); return M.muted[name]; },
      solo(name, on) { M.soloed[name] = on == null ? !M.soloed[name] : !!on; applyMutes(); return M.soloed[name]; },
      clearSolo() { M.soloed = {}; applyMutes(); },
      /** the player's own switches (the M key turns arena sound off): separate from the debug mute/solo */
      setUserOff(names, off) { for (const n of names) M.userOff[n] = !!off; applyMutes(); },
      busState() {
        const o = {};
        for (const name of C().buses) o[name] = { muted: !!M.muted[name], soloed: !!M.soloed[name], audible: M.buses[name] ? M.buses[name].audible !== false : true };
        return o;
      },
      meters,
      /** the ducking gain each bus is at right now (dB), read from the live audio parameter */
      duckNow() { const o = {}; for (const name in M.buses) o[name] = gainToDb(M.buses[name].duck.gain.value); return o; },
      stats: M.stats,
      activeVoices() { return M.active.map(v => ({ name: v.name, bus: v.bus, pri: v.pri })); },
      grabClip,
      recorderKind() { return M.recorder ? M.recorder.kind : null; },
      resume() { if (M.ctx && M.ctx.state === 'suspended') M.ctx.resume().catch(() => {}); },
      suspend() { if (M.ctx && M.ctx.state === 'running') M.ctx.suspend().catch(() => {}); },
      destroy() {
        M.destroyed = true;
        try { if (M.ctx) M.ctx.close(); } catch (e) { /* ignore */ }
        M.ctx = null;
      },
    };
  }

  PBC.AudioMixer = { create, dbToGain, gainToDb };
})();
