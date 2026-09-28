/* Pro BBALL Coach — arena audio for live games (PBC.ArenaAudio).
 * Everything is synthesized with WebAudio (no sound files yet): a living crowd bed that swells with close games and
 * playoff stakes, cheers / groans / "ooohs" / boos, rhythmic DE-FENSE claps, dribbles, sneaker squeaks, swishes,
 * rim clanks, backboard thuds, dunks, the ref's pea whistle and the horn.
 * It plays through the broadcast mixer (js/audio/mixer.js): court sounds on the court bus, whistles and horns on the
 * arena bus, the crowd on the crowd bus, each one-shot in a voice slot from the mixer's voice manager. It listens to
 * the audio event bus for court sounds (dribble contacts, rim hits, ...) and gets sim events through onEvent().
 * Tunable values are in PBC.AudioConfig. No AudioContext is created before the first user gesture. */
(function () {
  'use strict';
  const PBC = window.PBC;
  const U = PBC.U;

  function create(host) {
    const S = host.S;
    const st = S.settings;
    const AU = host.audio;              // the live game's audio session (bus + mixer)
    const mixer = AU.mixer;
    const CFG = () => PBC.AudioConfig;
    const A = {
      muted: st.arenaSound === false, enabled: st.arenaSound !== false, vol: st.volume == null ? 0.7 : st.volume,
      paused: false, crowdLevel: 0.2, excite: 0, chantT: 0, squeakT: 1.5, destroyed: false, ready: false, out: null,
    };
    const offs = [];

    // ------------------------------------------------------------ graph
    function ensure() {
      if (A.destroyed) return null;
      const c = AU.unlock();
      if (!c) return null;
      applyVolume();
      if (!A.building) {
        // noise buffers are filled in small slices between frames, then the bed starts
        A.building = true;
        const t0 = performance.now();
        const white = c.createBuffer(1, Math.floor(c.sampleRate * 3), c.sampleRate), wd = white.getChannelData(0);
        const pink = c.createBuffer(1, Math.floor(c.sampleRate * 4), c.sampleRate), pd = pink.getChannelData(0);
        mixer.sliced(wd.length, (a, b) => { for (let i = a; i < b; i++) wd[i] = Math.random() * 2 - 1; }, () => {
          const pf = pinkFiller(pd);
          mixer.sliced(pd.length, pf, () => {
            if (A.destroyed) return;
            A.noise = white; A.pink = pink; A.ready = true;
            startBed();
            AU.arenaInitMs = performance.now() - t0;
          });
        });
      }
      return c;
    }
    /** Paul Kellet's pink noise filter, resumable across slices */
    function pinkFiller(d) {
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      return (a, bEnd) => {
        for (let i = a; i < bEnd; i++) {
          const w = Math.random() * 2 - 1;
          b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
          b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
          d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
        }
      };
    }
    const ctx = () => mixer.ctx;
    // the volume setting is the master level; "arena sound off" silences the arena buses but not the booth
    const ARENA_BUSES = ['court', 'players', 'crowd', 'arena'];
    function applyVolume() {
      if (!ctx()) return;
      mixer.setMaster(A.vol, A.paused);
      const off = !A.enabled || A.muted;
      if (off !== A.offApplied) { A.offApplied = off; mixer.setUserOff(ARENA_BUSES, off); }
    }
    function src(buf, loop) { const s = ctx().createBufferSource(); s.buffer = buf; s.loop = !!loop; return s; }

    // crowd bed: band-limited noise layers (rumble, murmur, chatter) with slow random movement, on the crowd bus
    function startBed() {
      const c = ctx(), into = mixer.busInput('crowd');
      A.bed = [];
      for (const [bufName, type, f, q, gain] of CFG().crowd.bedLayers) {
        const s = src(bufName === 'pink' ? A.pink : A.noise, true), flt = c.createBiquadFilter(), g = c.createGain();
        flt.type = type; flt.frequency.value = f; flt.Q.value = q; g.gain.value = gain;
        s.connect(flt); flt.connect(g); g.connect(into);
        s.start(0, Math.random() * 2);
        A.bed.push({ s, flt, g, base: gain, f });
      }
    }

    // ------------------------------------------------------------ one-shots (recipes play into A.out, the voice slot)
    function now() { return ctx().currentTime; }
    function env(g, t0, a, peak, hold, rel) {
      g.gain.cancelScheduledValues(t0);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + a);
      g.gain.setValueAtTime(Math.max(0.0002, peak), t0 + a + hold);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + hold + rel);
    }
    function noiseHit(out, type, f, q, peak, a, hold, rel, fEnd, when) {
      const c = ctx(), t0 = (when || now()) + 0.005;
      const s = src(Math.random() < 0.5 ? A.noise : A.pink, false), flt = c.createBiquadFilter(), g = c.createGain();
      flt.type = type; flt.frequency.setValueAtTime(f, t0); flt.Q.value = q;
      if (fEnd) flt.frequency.exponentialRampToValueAtTime(fEnd, t0 + a + hold + rel);
      s.connect(flt); flt.connect(g); g.connect(out || A.out);
      env(g, t0, a, peak, hold, rel);
      s.start(t0, Math.random() * 1.5); s.stop(t0 + a + hold + rel + 0.05);
    }
    function tone(out, type, f, peak, a, hold, rel, fEnd, when, detune) {
      const c = ctx(), t0 = (when || now()) + 0.005;
      const o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t0);
      if (detune) o.detune.value = detune;
      if (fEnd) o.frequency.exponentialRampToValueAtTime(fEnd, t0 + a + hold + rel);
      o.connect(g); g.connect(out || A.out);
      env(g, t0, a, peak, hold, rel);
      o.start(t0); o.stop(t0 + a + hold + rel + 0.05);
      return o;
    }
    // [recipe, voice length in seconds]
    const SFX = {
      dribble: [(v) => { // floor thump + slap
        tone(A.out, 'sine', 120, 0.34 * v, 0.004, 0.01, 0.12, 55);
        noiseHit(A.out, 'bandpass', 900, 1.1, 0.12 * v, 0.002, 0.005, 0.05);
      }, 0.2],
      bounce: [(v) => { tone(A.out, 'sine', 110, 0.3 * v, 0.004, 0.01, 0.14, 50); noiseHit(A.out, 'bandpass', 700, 1, 0.1 * v, 0.002, 0.005, 0.06); }, 0.2],
      squeak: [(v) => {
        const f = 1900 + Math.random() * 900;
        const o = tone(A.out, 'sine', f, 0.05 * v, 0.01, 0.04 + Math.random() * 0.05, 0.03, f * (1.1 + Math.random() * 0.25));
        const lfo = ctx().createOscillator(), lg = ctx().createGain();
        lfo.frequency.value = 45 + Math.random() * 30; lg.gain.value = 60; lfo.connect(lg); lg.connect(o.frequency); lfo.start(); lfo.stop(now() + 0.25);
      }, 0.3],
      rim: [(v) => { // metallic clank: inharmonic partials
        for (const [f, k] of [[520, 1], [1334, 0.7], [2130, 0.45], [3190, 0.3], [4270, 0.18]]) tone(A.out, 'sine', f * (0.98 + Math.random() * 0.04), 0.13 * k * v, 0.002, 0.01, 0.35 + Math.random() * 0.2);
        noiseHit(A.out, 'highpass', 2500, 0.7, 0.08 * v, 0.002, 0.01, 0.12);
      }, 0.65],
      board: [(v) => { tone(A.out, 'sine', 170, 0.22 * v, 0.004, 0.02, 0.25, 120); noiseHit(A.out, 'bandpass', 420, 1.4, 0.14 * v, 0.003, 0.02, 0.2); }, 0.35],
      swish: [() => { noiseHit(A.out, 'bandpass', 5200, 1.6, 0.1, 0.03, 0.08, 0.22, 7200); noiseHit(A.out, 'highpass', 6500, 0.7, 0.04, 0.02, 0.06, 0.15); }, 0.4],
      net: [() => { noiseHit(A.out, 'bandpass', 4200, 1.2, 0.08, 0.02, 0.05, 0.18, 6000); SFX.rim[0](0.35); }, 0.65],
      dunk: [() => { SFX.rim[0](1.5); SFX.board[0](1.2); tone(A.out, 'sine', 80, 0.3, 0.005, 0.03, 0.35, 45); }, 0.7],
      block: [() => { tone(A.out, 'sine', 140, 0.25, 0.003, 0.01, 0.12, 70); noiseHit(A.out, 'bandpass', 1300, 1.3, 0.2, 0.002, 0.01, 0.08); }, 0.2],
      whistle: [() => { // pea whistle trill
        const c = ctx(), t0 = now() + 0.005, dur = 0.34 + Math.random() * 0.14;
        const o1 = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain(), am = c.createOscillator(), amg = c.createGain();
        o1.type = 'sine'; o2.type = 'sine'; o1.frequency.value = 2950 + Math.random() * 120; o2.frequency.value = o1.frequency.value * 1.012;
        am.frequency.value = 28 + Math.random() * 8; amg.gain.value = 0.045;
        am.connect(amg); amg.connect(g.gain);
        o1.connect(g); o2.connect(g); g.connect(A.out);
        g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.09, t0 + 0.02); g.gain.setValueAtTime(0.09, t0 + dur - 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        [o1, o2, am].forEach(o => { o.start(t0); o.stop(t0 + dur + 0.05); });
      }, 0.55],
      horn: [() => { // arena horn
        for (const [f, k] of [[233, 1], [466, 0.5], [349, 0.6]]) {
          const c = ctx(), t0 = now() + 0.005, o = c.createOscillator(), g = c.createGain(), flt = c.createBiquadFilter();
          o.type = 'sawtooth'; o.frequency.value = f; flt.type = 'lowpass'; flt.frequency.value = 1400;
          o.connect(flt); flt.connect(g); g.connect(A.out);
          env(g, t0, 0.03, 0.07 * k, 1.05, 0.2);
          o.start(t0); o.stop(t0 + 1.35);
        }
      }, 1.4],
    };
    const clap = (out, v, when) => noiseHit(out, 'bandpass', 1500 + Math.random() * 600, 0.8, 0.22 * v, 0.004, 0.02, 0.09, null, when);

    /** play a court / arena one-shot through a voice slot */
    function fire(name, v) {
      if (!A.enabled || A.muted || A.paused || !A.ready) return;
      const r = SFX[name];
      if (!r) return;
      const slot = mixer.voice(name, { dur: r[1] });
      if (!slot) return;
      A.out = slot.out;
      try { r[0](v == null ? 1 : v); } catch (e) { /* audio must never break the game */ }
    }

    // crowd reactions: a swell of band-limited noise shaped like a roar, an "ooh", a groan or boos
    function crowd(kind, amt) {
      if (!A.ready || !A.enabled || A.muted) return;
      const cc = CFG().crowd;
      const lvl = U.clamp(amt, 0.1, 1.4) * (0.8 + host.stakes.level * cc.reactionStakes);
      const len = { roar: 0.12 + 0.6 + lvl * 0.8 + 1.8, ooh: 1.3, groan: 1.6, boo: 2.4, murmur: 1.8 }[kind] || 2;
      const slot = mixer.voice(kind, { dur: len });
      if (!slot) return;
      const o = slot.out;
      if (kind === 'roar') {
        noiseHit(o, 'bandpass', 1100, 0.55, 0.55 * lvl, 0.12, 0.6 + lvl * 0.8, 1.8);
        noiseHit(o, 'lowpass', 700, 0.6, 0.45 * lvl, 0.1, 0.5 + lvl * 0.8, 1.6);
        noiseHit(o, 'bandpass', 2600, 1.4, 0.12 * lvl, 0.15, 0.4, 1.2);
        mixer.pushThrough(lvl * cc.roarPushThrough);
      } else if (kind === 'ooh') {
        noiseHit(o, 'bandpass', 480, 3.5, 0.5 * lvl, 0.12, 0.35, 0.8, 380);
        noiseHit(o, 'bandpass', 900, 4, 0.22 * lvl, 0.12, 0.35, 0.8, 700);
      } else if (kind === 'groan') {
        noiseHit(o, 'bandpass', 420, 3, 0.35 * lvl, 0.2, 0.4, 1.0, 260);
      } else if (kind === 'boo') {
        noiseHit(o, 'bandpass', 300, 5, 0.4 * lvl, 0.3, 0.9, 1.2, 250);
        noiseHit(o, 'bandpass', 620, 5, 0.18 * lvl, 0.3, 0.9, 1.2, 520);
      } else if (kind === 'murmur') {
        noiseHit(o, 'bandpass', 800, 1.2, 0.18 * lvl, 0.3, 0.6, 0.9);
      }
    }
    // "DE-FENSE" clap rhythm from the home crowd
    function chant() {
      if (!A.ready) return;
      const ch = CFG().crowd.chant;
      const slot = mixer.voice('chant', { dur: ch.bars * ch.barLen + 0.6 });
      if (!slot) return;
      const o = slot.out, t = now() + 0.05;
      for (let r = 0; r < ch.bars; r++) {
        const b = t + r * ch.barLen;
        clap(o, 0.8, b); clap(o, 0.9, b + ch.beat2);
        noiseHit(o, 'bandpass', 520, 2.4, 0.14, 0.04, 0.12, 0.2, null, b);
        noiseHit(o, 'bandpass', 700, 2.4, 0.16, 0.04, 0.16, 0.25, null, b + ch.beat2);
      }
    }

    // ------------------------------------------------------------ court sounds from the event bus
    const COURT = { dribble_contact: 'dribble', ball_bounce: 'bounce', rim_hit: 'rim', board_hit: 'board', dunk_contact: 'dunk', block_contact: 'block', whistle: 'whistle', horn: 'horn' };
    offs.push(AU.bus.on(Object.keys(COURT).concat('net'), (e) => {
      const name = e.type === 'net' ? (e.swish ? 'swish' : 'net') : COURT[e.type];
      fire(name, e.vol);
    }, 'arena court'));

    // ------------------------------------------------------------ public
    const api = {
      get muted() { return A.muted || !A.enabled; },
      unlock() { ensure(); },
      /** direct play (kept for callers outside the bus) */
      play(name, v) { fire(name, v); },
      onEvent(ev, P) {
        if (!A.ready || !A.enabled) return;
        const cc = CFG().crowd;
        const homeTeam = 0;
        if (ev.type === 'score') {
          const sh = ev.shotEvent || {};
          const big = sh.kind === 'dunk' || sh.kind === 'alley' || ev.pts === 3 || sh.andOne;
          if (ev.team === homeTeam) { crowd('roar', big ? 1.1 : 0.65); A.excite = Math.min(cc.exciteMax, A.excite + (big ? cc.exciteHomeBig : cc.exciteHomeScore)); }
          else crowd(big ? 'groan' : 'murmur', big ? 0.8 : 0.5);
        } else if (ev.type === 'shot' && ev.blocked) {
          crowd(ev.team === homeTeam ? 'groan' : 'roar', 0.9);
          if (ev.team !== homeTeam) A.excite = Math.min(cc.exciteMax, A.excite + cc.exciteBlock);
        } else if (ev.type === 'shot' && ev.made === false && ev.pts === 3) {
          crowd(ev.team === homeTeam ? 'ooh' : 'murmur', 0.6);
        } else if (ev.type === 'turnover' && ev.stealer) {
          crowd(ev.team === homeTeam ? 'groan' : 'roar', 0.7);
        } else if (ev.type === 'foul') {
          // the home crowd lets the refs hear it on calls against the home team
          const onHome = ev.team === homeTeam;
          if (onHome && Math.random() < cc.booChance) setTimeout(() => { if (!A.destroyed) AU.bus.emitWith('crowd_boo', { team: 0, detail: 'call against home' }, () => crowd('boo', 0.6 + host.stakes.level * 0.3)); }, cc.booDelayMs);
        } else if (ev.type === 'ft') {
          if (ev.team !== homeTeam && Math.random() < cc.awayFtMurmurChance) crowd('murmur', 0.35);
          else if (ev.made && ev.team === homeTeam) crowd('roar', 0.35);
        } else if (ev.type === 'timeout') {
          crowd('murmur', 0.5);
        }
        void P;
      },
      update(dt, s) {
        if (!A.ready || A.destroyed || !ctx()) return;
        const cc = CFG().crowd;
        applyVolume();
        // crowd bed level: base + closeness late in games + playoff stakes + recent excitement
        // (the commentary duck is now the mixer's job, on the whole crowd bus)
        A.excite = Math.max(0, A.excite - dt * cc.exciteDecay);
        let lvl = cc.bedBase + s.stakes * cc.bedStakes + (s.late && s.close ? cc.bedLateClose : 0) + A.excite * cc.bedExcite;
        if (!s.playing) lvl *= cc.bedPausedMul;
        A.crowdLevel += (lvl - A.crowdLevel) * Math.min(1, dt * cc.bedFollow);
        const t = ctx().currentTime;
        for (const L of A.bed) {
          const wob = 1 + Math.sin(t * (0.21 + L.f / 9000) + L.f) * cc.bedWobble[0] + Math.sin(t * 0.07 + L.f * 0.3) * cc.bedWobble[1];
          L.g.gain.setTargetAtTime(L.base * A.crowdLevel * wob, t, 0.25);
        }
        // DE-FENSE claps when the home team defends in close / big games
        const ch = cc.chant;
        A.chantT -= dt;
        if (s.playing && s.off === 1 && A.chantT <= 0 && (s.close || s.stakes > ch.stakesMin) && host.speed() <= ch.maxSpeed) {
          if (Math.random() < ch.chanceBase + s.stakes * ch.chanceStakes) AU.bus.emitWith('chant_start', { team: 0, detail: 'DE-FENSE claps' }, chant);
          A.chantT = ch.minGap + Math.random() * ch.randGap;
        }
        // sneaker squeaks during live play (still on a random timer: Trial 2 ties them to real plants and cuts)
        // (only while a possession is actually being played: never during the intro, a hold or a break)
        A.squeakT -= dt * (s.live ? Math.min(4, s.speed) : 0);
        if (A.squeakT <= 0) {
          const sv = cc.squeakVol;
          A.squeakT = cc.squeakTimer[0] + Math.random() * cc.squeakTimer[1];
          AU.bus.emitWith('squeak_timer', { detail: 'random, not tied to a plant yet' }, () => fire('squeak', sv[0] + Math.random() * sv[1]));
        }
      },
      duck(on) { mixer.setTalking(on); },
      onFinal(winner, uIdx) {
        if (!A.ready) return;
        fire('horn');
        if (winner === 0) { crowd('roar', 1.35); setTimeout(() => { if (!A.destroyed) AU.bus.emitWith('crowd_roar2', { team: 0, detail: 'final' }, () => crowd('roar', 1.1)); }, 900); A.excite = CFG().crowd.exciteMax; }
        else crowd('groan', 1);
        void uIdx;
      },
      setEnabled(b) { A.enabled = !!b; if (b) api.unlock(); },
      setVolume(v) { A.vol = U.clamp(+v, 0, 1); },
      setPaused(p) { A.paused = !!p; },
      toggleMute() { A.muted = !A.muted; S.settings.arenaSound = !A.muted; if (!A.muted) api.unlock(); },
      destroy() {
        A.destroyed = true;
        for (const off of offs) off();
        for (const L of A.bed || []) { try { L.s.stop(); } catch (e) { /* ignore */ } }
      },
    };
    // try right away (the click on "Watch Live" usually counts as the user gesture)
    if (A.enabled) api.unlock();
    return api;
  }

  PBC.ArenaAudio = { create };
})();
