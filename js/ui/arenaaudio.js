/* Pro BBALL Coach — arena audio for live games (PBC.ArenaAudio).
 * Everything is synthesized with WebAudio (no sound files): a living crowd bed that swells with close games and
 * playoff stakes, cheers / groans / "ooohs" / boos, rhythmic DE-FENSE claps, dribbles, sneaker squeaks, swishes,
 * rim clanks, backboard thuds, dunks, the ref's pea whistle and the horn. A small generated reverb puts it in a
 * big building. The commentary booth ducks the crowd while an announcer talks.
 * No AudioContext is created before the first user gesture on the live screen. */
(function () {
  'use strict';
  const PBC = window.PBC;
  const U = PBC.U;

  function create(host) {
    const S = host.S;
    const st = S.settings;
    const A = {
      muted: st.arenaSound === false, enabled: st.arenaSound !== false, vol: st.volume == null ? 0.7 : st.volume,
      ctx: null, paused: false, ducking: 0, crowdLevel: 0.2, excite: 0, exciteTeam: 0, chantT: 0, squeakT: 1.5,
      lastPlay: {}, destroyed: false,
    };
    const homeUser = host.uIdx === 0;
    void homeUser;

    // ------------------------------------------------------------ graph
    function ensure() {
      if (A.ctx || A.destroyed) return A.ctx;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { A.ctx = new AC(); } catch (e) { return null; }
      const c = A.ctx;
      A.master = c.createGain(); A.master.gain.value = A.enabled ? A.vol : 0;
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -18; comp.ratio.value = 3.5; comp.attack.value = 0.01; comp.release.value = 0.25;
      A.master.connect(comp); comp.connect(c.destination);
      // arena reverb (generated impulse)
      A.verb = c.createConvolver();
      A.verb.buffer = impulse(c, 2.2, 2.6);
      A.verbGain = c.createGain(); A.verbGain.gain.value = 0.32;
      A.verb.connect(A.verbGain); A.verbGain.connect(A.master);
      A.dry = c.createGain(); A.dry.gain.value = 1; A.dry.connect(A.master);
      A.sfx = c.createGain(); A.sfx.gain.value = 0.9; A.sfx.connect(A.dry); A.sfx.connect(A.verb);
      A.crowdBus = c.createGain(); A.crowdBus.gain.value = 0.9; A.crowdBus.connect(A.dry); A.crowdBus.connect(A.verb);
      A.noise = noiseBuffer(c, 3);
      A.pink = pinkBuffer(c, 4);
      startBed();
      return c;
    }
    function impulse(c, secs, decay) {
      const n = Math.floor(c.sampleRate * secs), buf = c.createBuffer(2, n, c.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = buf.getChannelData(ch);
        for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay) * (i < 400 ? i / 400 : 1);
      }
      return buf;
    }
    function noiseBuffer(c, secs) {
      const n = Math.floor(c.sampleRate * secs), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      return buf;
    }
    function pinkBuffer(c, secs) {
      const n = Math.floor(c.sampleRate * secs), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < n; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
      }
      return buf;
    }
    function src(buf, loop) { const s = A.ctx.createBufferSource(); s.buffer = buf; s.loop = !!loop; return s; }

    // crowd bed: three band-limited noise layers (rumble, murmur, chatter) with slow random movement
    function startBed() {
      const c = A.ctx;
      A.bed = [];
      const layer = (buf, type, f, q, gain) => {
        const s = src(buf, true), flt = c.createBiquadFilter(), g = c.createGain();
        flt.type = type; flt.frequency.value = f; flt.Q.value = q; g.gain.value = gain;
        s.connect(flt); flt.connect(g); g.connect(A.crowdBus);
        s.start(0, Math.random() * 2);
        const L = { s, flt, g, base: gain, f };
        A.bed.push(L);
        return L;
      };
      layer(A.pink, 'lowpass', 380, 0.7, 0.55);
      layer(A.pink, 'bandpass', 900, 0.8, 0.28);
      layer(A.noise, 'bandpass', 1900, 1.2, 0.06);
      A.bedGain = c.createGain();
      // bed gains are driven in update()
    }

    // ------------------------------------------------------------ one-shots
    function now() { return A.ctx.currentTime; }
    function env(g, t0, a, peak, hold, rel) {
      g.gain.cancelScheduledValues(t0);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + a);
      g.gain.setValueAtTime(Math.max(0.0002, peak), t0 + a + hold);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + hold + rel);
    }
    function noiseHit(bus, type, f, q, peak, a, hold, rel, fEnd, when) {
      const c = A.ctx, t0 = (when || now()) + 0.005;
      const s = src(Math.random() < 0.5 ? A.noise : A.pink, false), flt = c.createBiquadFilter(), g = c.createGain();
      flt.type = type; flt.frequency.setValueAtTime(f, t0); flt.Q.value = q;
      if (fEnd) flt.frequency.exponentialRampToValueAtTime(fEnd, t0 + a + hold + rel);
      s.connect(flt); flt.connect(g); g.connect(bus || A.sfx);
      env(g, t0, a, peak, hold, rel);
      s.start(t0, Math.random() * 1.5); s.stop(t0 + a + hold + rel + 0.05);
    }
    function tone(bus, type, f, peak, a, hold, rel, fEnd, when, detune) {
      const c = A.ctx, t0 = (when || now()) + 0.005;
      const o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t0);
      if (detune) o.detune.value = detune;
      if (fEnd) o.frequency.exponentialRampToValueAtTime(fEnd, t0 + a + hold + rel);
      o.connect(g); g.connect(bus || A.sfx);
      env(g, t0, a, peak, hold, rel);
      o.start(t0); o.stop(t0 + a + hold + rel + 0.05);
      return o;
    }
    const SFX = {
      dribble(v) { // floor thump + slap
        tone(A.sfx, 'sine', 120, 0.34 * v, 0.004, 0.01, 0.12, 55);
        noiseHit(A.sfx, 'bandpass', 900, 1.1, 0.12 * v, 0.002, 0.005, 0.05);
      },
      bounce(v) { tone(A.sfx, 'sine', 110, 0.3 * v, 0.004, 0.01, 0.14, 50); noiseHit(A.sfx, 'bandpass', 700, 1, 0.1 * v, 0.002, 0.005, 0.06); },
      squeak(v) {
        const f = 1900 + Math.random() * 900;
        const o = tone(A.sfx, 'sine', f, 0.05 * v, 0.01, 0.04 + Math.random() * 0.05, 0.03, f * (1.1 + Math.random() * 0.25));
        const lfo = A.ctx.createOscillator(), lg = A.ctx.createGain();
        lfo.frequency.value = 45 + Math.random() * 30; lg.gain.value = 60; lfo.connect(lg); lg.connect(o.frequency); lfo.start(); lfo.stop(now() + 0.25);
      },
      rim(v) { // metallic clank: inharmonic partials
        for (const [f, k] of [[520, 1], [1334, 0.7], [2130, 0.45], [3190, 0.3], [4270, 0.18]]) tone(A.sfx, 'sine', f * (0.98 + Math.random() * 0.04), 0.13 * k * v, 0.002, 0.01, 0.35 + Math.random() * 0.2);
        noiseHit(A.sfx, 'highpass', 2500, 0.7, 0.08 * v, 0.002, 0.01, 0.12);
      },
      board(v) { tone(A.sfx, 'sine', 170, 0.22 * v, 0.004, 0.02, 0.25, 120); noiseHit(A.sfx, 'bandpass', 420, 1.4, 0.14 * v, 0.003, 0.02, 0.2); },
      swish() { noiseHit(A.sfx, 'bandpass', 5200, 1.6, 0.1, 0.03, 0.08, 0.22, 7200); noiseHit(A.sfx, 'highpass', 6500, 0.7, 0.04, 0.02, 0.06, 0.15); },
      net() { noiseHit(A.sfx, 'bandpass', 4200, 1.2, 0.08, 0.02, 0.05, 0.18, 6000); SFX.rim(0.35); },
      dunk() { SFX.rim(1.5); SFX.board(1.2); tone(A.sfx, 'sine', 80, 0.3, 0.005, 0.03, 0.35, 45); },
      block() { tone(A.sfx, 'sine', 140, 0.25, 0.003, 0.01, 0.12, 70); noiseHit(A.sfx, 'bandpass', 1300, 1.3, 0.2, 0.002, 0.01, 0.08); },
      whistle() { // pea whistle trill
        const c = A.ctx, t0 = now() + 0.005, dur = 0.34 + Math.random() * 0.14;
        const o1 = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain(), am = c.createOscillator(), amg = c.createGain();
        o1.type = 'sine'; o2.type = 'sine'; o1.frequency.value = 2950 + Math.random() * 120; o2.frequency.value = o1.frequency.value * 1.012;
        am.frequency.value = 28 + Math.random() * 8; amg.gain.value = 0.045;
        am.connect(amg); amg.connect(g.gain);
        o1.connect(g); o2.connect(g); g.connect(A.sfx);
        g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.09, t0 + 0.02); g.gain.setValueAtTime(0.09, t0 + dur - 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        [o1, o2, am].forEach(o => { o.start(t0); o.stop(t0 + dur + 0.05); });
      },
      horn() { // arena horn
        for (const [f, k] of [[233, 1], [466, 0.5], [349, 0.6]]) {
          const c = A.ctx, t0 = now() + 0.005, o = c.createOscillator(), g = c.createGain(), flt = c.createBiquadFilter();
          o.type = 'sawtooth'; o.frequency.value = f; flt.type = 'lowpass'; flt.frequency.value = 1400;
          o.connect(flt); flt.connect(g); g.connect(A.sfx);
          env(g, t0, 0.03, 0.07 * k, 1.05, 0.2);
          o.start(t0); o.stop(t0 + 1.35);
        }
      },
      clap(v, when) { noiseHit(A.crowdBus, 'bandpass', 1500 + Math.random() * 600, 0.8, 0.22 * v, 0.004, 0.02, 0.09, null, when); },
    };

    // crowd reactions: a swell of band-limited noise shaped like a roar, an "ooh", a groan or boos
    function crowd(kind, amt) {
      if (!A.ctx) return;
      const lvl = U.clamp(amt, 0.1, 1.4) * (0.8 + host.stakes.level * 0.35);
      if (kind === 'roar') {
        noiseHit(A.crowdBus, 'bandpass', 1100, 0.55, 0.55 * lvl, 0.12, 0.6 + lvl * 0.8, 1.8);
        noiseHit(A.crowdBus, 'lowpass', 700, 0.6, 0.45 * lvl, 0.1, 0.5 + lvl * 0.8, 1.6);
        noiseHit(A.crowdBus, 'bandpass', 2600, 1.4, 0.12 * lvl, 0.15, 0.4, 1.2);
      } else if (kind === 'ooh') {
        noiseHit(A.crowdBus, 'bandpass', 480, 3.5, 0.5 * lvl, 0.12, 0.35, 0.8, 380);
        noiseHit(A.crowdBus, 'bandpass', 900, 4, 0.22 * lvl, 0.12, 0.35, 0.8, 700);
      } else if (kind === 'groan') {
        noiseHit(A.crowdBus, 'bandpass', 420, 3, 0.35 * lvl, 0.2, 0.4, 1.0, 260);
      } else if (kind === 'boo') {
        noiseHit(A.crowdBus, 'bandpass', 300, 5, 0.4 * lvl, 0.3, 0.9, 1.2, 250);
        noiseHit(A.crowdBus, 'bandpass', 620, 5, 0.18 * lvl, 0.3, 0.9, 1.2, 520);
      } else if (kind === 'murmur') {
        noiseHit(A.crowdBus, 'bandpass', 800, 1.2, 0.18 * lvl, 0.3, 0.6, 0.9);
      }
    }
    // "DE-FENSE" clap rhythm from the home crowd
    function chant() {
      if (!A.ctx) return;
      const t = now() + 0.05;
      for (let r = 0; r < 3; r++) {
        const b = t + r * 1.1;
        SFX.clap(0.8, b); SFX.clap(0.9, b + 0.36);
        noiseHit(A.crowdBus, 'bandpass', 520, 2.4, 0.14, 0.04, 0.12, 0.2, null, b);
        noiseHit(A.crowdBus, 'bandpass', 700, 2.4, 0.16, 0.04, 0.16, 0.25, null, b + 0.36);
      }
    }

    // ------------------------------------------------------------ public
    const api = {
      get muted() { return A.muted || !A.enabled; },
      unlock() { const c = ensure(); if (c && c.state === 'suspended') c.resume().catch(() => {}); },
      play(name, v) {
        if (!A.enabled || A.muted || A.paused || !A.ctx || A.ctx.state !== 'running') return;
        const f = SFX[name];
        if (!f) return;
        // rate-limit identical sounds (16x playback would machine-gun them)
        const t = performance.now(), gap = name === 'dribble' ? 90 : name === 'squeak' ? 120 : 45;
        if (A.lastPlay[name] && t - A.lastPlay[name] < gap * Math.max(1, host.speed() / 2)) return;
        A.lastPlay[name] = t;
        if (host.speed() >= 8 && (name === 'dribble' || name === 'squeak')) return;
        try { f(v == null ? 1 : v); } catch (e) { /* ignore */ }
      },
      onEvent(ev, P) {
        if (!A.ctx || !A.enabled) return;
        const homeTeam = 0;
        if (ev.type === 'score') {
          const sh = ev.shotEvent || {};
          const big = sh.kind === 'dunk' || sh.kind === 'alley' || ev.pts === 3 || sh.andOne;
          if (ev.team === homeTeam) { crowd('roar', big ? 1.1 : 0.65); A.excite = Math.min(1.4, A.excite + (big ? 0.5 : 0.25)); A.exciteTeam = 0; }
          else crowd(big ? 'groan' : 'murmur', big ? 0.8 : 0.5);
        } else if (ev.type === 'shot' && ev.blocked) {
          crowd(ev.team === homeTeam ? 'groan' : 'roar', 0.9);
          if (ev.team !== homeTeam) A.excite = Math.min(1.4, A.excite + 0.35);
        } else if (ev.type === 'shot' && ev.made === false && ev.pts === 3) {
          crowd(ev.team === homeTeam ? 'ooh' : 'murmur', 0.6);
        } else if (ev.type === 'turnover' && ev.stealer) {
          crowd(ev.team === homeTeam ? 'groan' : 'roar', 0.7);
        } else if (ev.type === 'foul') {
          // the home crowd lets the refs hear it on calls against the home team
          const onHome = ev.team === homeTeam;
          if (onHome && Math.random() < 0.55) setTimeout(() => crowd('boo', 0.6 + host.stakes.level * 0.3), 250);
        } else if (ev.type === 'ft') {
          if (ev.team !== homeTeam && Math.random() < 0.5) crowd('murmur', 0.35);
          else if (ev.made && ev.team === homeTeam) crowd('roar', 0.35);
        } else if (ev.type === 'timeout') {
          crowd('murmur', 0.5);
        }
        void P;
      },
      update(dt, s) {
        if (!A.ctx || A.destroyed) return;
        const c = A.ctx;
        const target = !A.enabled || A.muted ? 0 : A.vol;
        A.master.gain.setTargetAtTime(A.paused ? target * 0.35 : target, c.currentTime, 0.15);
        // crowd bed level: base + closeness late in games + playoff stakes + recent excitement
        A.excite = Math.max(0, A.excite - dt * 0.35);
        let lvl = 0.16 + s.stakes * 0.14 + (s.late && s.close ? 0.14 : 0) + A.excite * 0.2;
        if (!s.playing) lvl *= 0.75;
        lvl *= 1 - A.ducking * 0.45;
        A.crowdLevel += (lvl - A.crowdLevel) * Math.min(1, dt * 2);
        const t = c.currentTime;
        for (const L of A.bed) {
          const wob = 1 + Math.sin(t * (0.21 + L.f / 9000) + L.f) * 0.12 + Math.sin(t * 0.07 + L.f * 0.3) * 0.08;
          L.g.gain.setTargetAtTime(L.base * A.crowdLevel * wob, t, 0.25);
        }
        // DE-FENSE claps when the home team defends in close / big games
        A.chantT -= dt;
        if (s.playing && s.off === 1 && A.chantT <= 0 && (s.close || s.stakes > 0.5) && host.speed() <= 4) {
          if (Math.random() < 0.18 + s.stakes * 0.2) chant();
          A.chantT = 9 + Math.random() * 10;
        }
        // sneaker squeaks during live play
        A.squeakT -= dt * (s.playing ? Math.min(4, s.speed) : 0);
        if (A.squeakT <= 0) { api.play('squeak', 0.6 + Math.random() * 0.5); A.squeakT = 0.7 + Math.random() * 2.4; }
      },
      duck(on) { A.ducking = on ? 1 : 0; },
      onFinal(winner, uIdx) {
        if (!A.ctx) return;
        SFX.horn();
        if (winner === 0) { crowd('roar', 1.35); setTimeout(() => crowd('roar', 1.1), 900); A.excite = 1.4; }
        else crowd('groan', 1);
        void uIdx;
      },
      setEnabled(b) { A.enabled = !!b; if (b) api.unlock(); },
      setVolume(v) { A.vol = U.clamp(+v, 0, 1); },
      setPaused(p) { A.paused = !!p; },
      toggleMute() { A.muted = !A.muted; S.settings.arenaSound = !A.muted; if (!A.muted) api.unlock(); },
      destroy() {
        A.destroyed = true;
        try { if (A.ctx) A.ctx.close(); } catch (e) { /* ignore */ }
        A.ctx = null;
      },
    };
    // try right away (the click on "Watch Live" usually counts as the user gesture)
    if (A.enabled) api.unlock();
    return api;
  }

  PBC.ArenaAudio = { create };
})();
