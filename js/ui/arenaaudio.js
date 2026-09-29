/* Pro BBALL Coach — arena audio for live games (PBC.ArenaAudio).
 * The crowd: a living crowd bed that swells with close games and playoff stakes, cheers / groans / "ooohs" / boos,
 * rhythmic DE-FENSE claps. Everything is synthesized with Web Audio until recordings replace it (a sound pack loaded by
 * js/audio/assets.js takes over a sound when it has it).
 * It listens on the audio event bus (js/audio/bus.js): game.* events for the crowd's reactions (a miss or a block only
 * once the ball gets there: game.shotResult), live.final for the horn and the last roar.
 * The court's sounds (the ball, the sneakers, the bodies, the rim, the net, the whistle, the shot clock and the horn)
 * are js/audio/court.js and courtsynth.js since Trial 2; play(name) here still plays one (the tests use it).
 * Every sound goes through the mixer (js/audio/mixer.js) on its bus: the crowd on Crowd. Every number is in
 * PBC.AudioConfig. */
(function () {
  'use strict';
  const PBC = window.PBC;
  const U = PBC.U;

  function create(host) {
    const S = host.S;
    const st = S.settings;
    const C = PBC.AudioConfig, CC = C.crowd, RE = C.crowd.react, SY = C.synth;
    const R = PBC.AudioRandom, Bus = PBC.AudioBus, Assets = PBC.AudioAssets;
    const mx = host.mx;
    const A = {
      enabled: st.arenaSound !== false, crowdLevel: 0.2, excite: 0, chantT: 0,
      noise: null, pink: null, bed: null, destroyed: false,
    };
    const HOME = 0;
    const offs = [];
    mx.setSfx(A.enabled);

    // ------------------------------------------------------------ the crowd's noise and the bed
    function ensure() {
      const c = mx.ensure();
      if (!c || A.destroyed) return null;
      if (!A.noise) {
        A.noise = noiseBuffer(c, CC.noiseSeconds);
        A.pink = pinkBuffer(c, CC.pinkSeconds);
        startBed(c);
      }
      return c;
    }
    function noiseBuffer(c, secs) {
      const n = Math.floor(c.sampleRate * secs), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = R.random() * 2 - 1;
      return buf;
    }
    function pinkBuffer(c, secs) {
      const n = Math.floor(c.sampleRate * secs), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < n; i++) {
        const w = R.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
      }
      return buf;
    }
    function src(buf, loop) { const s = mx.ctx.createBufferSource(); s.buffer = buf; s.loop = !!loop; return s; }
    // three band-limited noise layers (rumble, murmur, chatter) with slow movement, into the Crowd bus
    function startBed(c) {
      A.bed = [];
      const into = mx.input('crowd');
      for (const [kind, type, f, q, gain] of CC.bedLayers) {
        const s = src(kind === 'pink' ? A.pink : A.noise, true), flt = c.createBiquadFilter(), g = c.createGain();
        flt.type = type; flt.frequency.value = f; flt.Q.value = q; g.gain.value = gain;
        s.connect(flt); flt.connect(g); g.connect(into);
        s.start(0, R.random() * 2);
        A.bed.push({ s, flt, g, base: gain, f });
      }
    }

    // ------------------------------------------------------------ recipes (each builds one voice from voice.t0)
    function env(g, t0, a, peak, hold, rel) {
      // (the gain's own value starts where the envelope does: a GainNode is at 1 until its first event, and at a start
      // between two samples a noise burst's first sample went through at full level, a click)
      g.gain.value = 0.0001;
      g.gain.cancelScheduledValues(t0);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + a);
      g.gain.setValueAtTime(Math.max(0.0002, peak), t0 + a + hold);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + hold + rel);
    }
    function noiseHit(V, type, f, q, peak, a, hold, rel, fEnd, dt) {
      const c = mx.ctx, t0 = V.t0 + (dt || 0);
      const s = src(R.random() < 0.5 ? A.noise : A.pink, false), flt = c.createBiquadFilter(), g = c.createGain();
      flt.type = type; flt.frequency.setValueAtTime(f, t0); flt.Q.value = q;
      if (fEnd) flt.frequency.exponentialRampToValueAtTime(fEnd, t0 + a + hold + rel);
      s.connect(flt); flt.connect(g); g.connect(V.out);
      env(g, t0, a, peak, hold, rel);
      const stop = t0 + a + hold + rel + 0.05;
      s.start(t0, R.random() * 1.5); s.stop(stop);
      V.src(s, stop);
    }
    function tone(V, type, f, peak, a, hold, rel, fEnd, dt, detune) {
      const c = mx.ctx, t0 = V.t0 + (dt || 0);
      const o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t0);
      if (detune) o.detune.value = detune;
      if (fEnd) o.frequency.exponentialRampToValueAtTime(fEnd, t0 + a + hold + rel);
      o.connect(g); g.connect(V.out);
      env(g, t0, a, peak, hold, rel);
      const stop = t0 + a + hold + rel + 0.05;
      o.start(t0); o.stop(stop);
      V.src(o, stop);
      return o;
    }
    /** a recording from a pack, with the configured pitch and level jitter */
    function sample(V, buf, v) {
      const c = mx.ctx, s = c.createBufferSource(), g = c.createGain(), J = C.sampleJitter;
      s.buffer = buf;
      s.playbackRate.value = 1 + (R.random() * 2 - 1) * J.pitch;
      g.gain.value = v * Math.pow(10, ((R.random() * 2 - 1) * J.gainDb) / 20);
      s.connect(g); g.connect(V.out);
      const stop = V.t0 + buf.duration / s.playbackRate.value + 0.02;
      s.start(V.t0); s.stop(stop);
      V.src(s, stop);
    }
    function clap(V, v, dt) { const D = SY.clap; noiseHit(V, 'bandpass', D.hzMin + R.random() * D.hzRand, D.q, D.peak * v, D.a, D.hold, D.rel, null, dt); }
    // crowd reactions: a swell of band-limited noise shaped like a roar, an "ooh", a groan or boos
    const CROWD = {
      roar(V, l) { for (const [type, f, q, k, a, hold, holdK, rel] of SY.roar) noiseHit(V, type, f, q, k * l, a, hold + l * holdK, rel); },
      ooh(V, l) { for (const [f, q, k, fEnd] of SY.ooh) noiseHit(V, 'bandpass', f, q, k * l, SY.oohA, SY.oohHold, SY.oohRel, fEnd); },
      groan(V, l) { const D = SY.groan; noiseHit(V, 'bandpass', D.hz, D.q, D.peak * l, D.a, D.hold, D.rel, D.hzEnd); },
      boo(V, l) { for (const [f, q, k, fEnd] of SY.boo) noiseHit(V, 'bandpass', f, q, k * l, SY.booA, SY.booHold, SY.booRel, fEnd); },
      murmur(V, l) { const D = SY.murmur; noiseHit(V, 'bandpass', D.hz, D.q, D.peak * l, D.a, D.hold, D.rel); },
    };

    // ------------------------------------------------------------ playing
    /** a court sound (js/audio/courtsynth.js; the tests and the voice checks play them from here) */
    let synth = null;
    function playSfx(name, v, o) {
      if (!ensure() || !PBC.CourtSynth) return null;
      if (!synth) synth = PBC.CourtSynth.create(mx);
      return synth.play(name, { e: v == null ? 1 : v }, o);
    }
    /** a crowd reaction: amt is its size (crowd.react), grown by the playoff stakes */
    function crowd(kind, amt, o) {
      if (!ensure()) return null;
      const lvl = U.clamp(amt, CC.levelMin, CC.levelMax) * (0.8 + host.stakes.level * CC.levelStakes);
      const buf = Assets ? Assets.get('crowd', kind) : null;
      return mx.play('crowd.' + kind, lvl, buf ? (V, l) => sample(V, buf, l) : CROWD[kind], Object.assign({ level: amt }, o));
    }
    // "DE-FENSE" clap rhythm from the home crowd
    function chant() {
      if (!ensure()) return null;
      const H = C.chant, sy = SY.chantSyl;
      return mx.play('crowd.chant', 1, (V) => {
        for (let r = 0; r < H.bars; r++) {
          const b = r * H.barGap;
          clap(V, 0.8, b); clap(V, 0.9, b + H.clapGap);
          noiseHit(V, 'bandpass', sy[0][0], sy[0][1], sy[0][2], sy[0][3], sy[0][4], sy[0][5], null, b);
          noiseHit(V, 'bandpass', sy[1][0], sy[1][1], sy[1][2], sy[1][3], sy[1][4], sy[1][5], null, b + H.clapGap);
        }
      }, { when: mx.now() + 0.05 });
    }
    /** a test tone on a bus (the debug console): the test pack's tone when loaded, else a sine */
    function testTone(bus) {
      if (!ensure()) return null;
      const buf = Assets ? Assets.get('test', 'tone') : null;
      const D = SY.testTone;
      return mx.play('test.tone', 1, buf ? (V) => sample(V, buf, 1) : (V) => tone(V, 'sine', D.hz, D.peak, D.a, D.hold, D.rel), { bus });
    }

    // ------------------------------------------------------------ what the arena hears
    offs.push(Bus.on('game.score', (ev) => {
      const e = ev.e, sh = e.shotEvent || {};
      const big = sh.kind === 'dunk' || sh.kind === 'alley' || e.pts === 3 || sh.andOne;
      if (e.team === HOME) { crowd('roar', big ? RE.homeBig : RE.homeScore); A.excite = Math.min(CC.exciteMax, A.excite + (big ? CC.exciteHomeBig : CC.exciteHomeScore)); }
      else crowd(big ? 'groan' : 'murmur', big ? RE.awayBig : RE.awayScore);
    }));
    // a block or a missed three only once the ball gets to the blocker's hand or the rim
    offs.push(Bus.on('game.shotResult', (ev) => {
      const e = ev.e;
      if (ev.blocked) {
        crowd(e.team === HOME ? 'groan' : 'roar', RE.block);
        if (e.team !== HOME) A.excite = Math.min(CC.exciteMax, A.excite + CC.exciteHomeBlock);
      } else if (!ev.made && +e.pts === 3) crowd(e.team === HOME ? 'ooh' : 'murmur', RE.missedThree);
    }));
    offs.push(Bus.on('game.turnover', (ev) => { if (ev.e.stealer) crowd(ev.e.team === HOME ? 'groan' : 'roar', RE.steal); }));
    // the home crowd lets the refs hear it on calls against the home team (a beat after the whistle)
    offs.push(Bus.on('game.foul', (ev) => {
      if (ev.e.team === HOME && R.chance(RE.booChance)) crowd('boo', RE.boo + host.stakes.level * RE.booStakes, { when: mx.now() + RE.booDelay });
    }));
    offs.push(Bus.on('game.ft', (ev) => {
      const e = ev.e;
      if (e.team !== HOME && R.chance(RE.ftAwayMurmurChance)) crowd('murmur', RE.ftAway);
      else if (e.made && e.team === HOME) crowd('roar', RE.ftHomeMade);
    }));
    offs.push(Bus.on('game.timeout', () => crowd('murmur', RE.timeout)));
    offs.push(Bus.on('live.final', (ev) => {
      if (!ensure()) return;
      if (host.court) host.court.finalHorn(); else playSfx('horn', 1, { force: true });
      if (ev.winner === HOME) { crowd('roar', RE.finalWin, { force: true }); crowd('roar', RE.finalWin2, { force: true, when: mx.now() + RE.finalWin2Delay }); A.excite = CC.exciteFinalWin; }
      else crowd('groan', RE.finalLoss, { force: true });
    }));

    // ------------------------------------------------------------ public
    const api = {
      get muted() { return !A.enabled; },
      unlock() { if (A.enabled) ensure(); mx.unlock(); },
      /** a court sound by name, now, unplaced (tests) */
      play(name, v) { return playSfx(name, v); },
      crowd, chant, testTone,
      update(dt, s) {
        if (A.destroyed || !mx.ctx || !A.bed) return;
        const t = mx.now();
        // crowd bed level: base + closeness late in games + playoff stakes + recent excitement
        A.excite = Math.max(0, A.excite - dt * CC.exciteDecay);
        let lvl = CC.bedBase + s.stakes * CC.bedStakes + (s.late && s.close ? CC.bedLateClose : 0) + A.excite * CC.bedExcite;
        if (!s.playing) lvl *= CC.bedNotPlaying;
        A.crowdLevel += (lvl - A.crowdLevel) * Math.min(1, dt * CC.bedFollow);
        const [w1, w2] = CC.bedWobble;
        for (const L of A.bed) {
          const wob = 1 + Math.sin(t * (0.21 + L.f / 9000) + L.f) * w1 + Math.sin(t * 0.07 + L.f * 0.3) * w2;
          L.g.gain.setTargetAtTime(L.base * A.crowdLevel * wob, t, CC.bedTc);
        }
        // DE-FENSE claps when the home team defends in close / big games (a timer until Trial 4)
        const H = C.chant;
        A.chantT -= dt;
        if (s.playing && s.off === 1 && A.chantT <= 0 && (s.close || s.stakes > H.stakesMin) && host.speed() <= H.maxSpeed) {
          if (R.chance(H.chance + s.stakes * H.chanceStakes)) Bus.emit('timer.chant', {}, () => chant());
          A.chantT = H.gapMin + R.random() * H.gapRand;
        }
      },
      setEnabled(b) { A.enabled = !!b; mx.setSfx(A.enabled); if (b) api.unlock(); },
      setVolume(v) { mx.setVolume(U.clamp(+v, 0, 1)); },
      setPaused(p) { mx.setPaused(p); },
      toggleMute() { api.setEnabled(!A.enabled); S.settings.arenaSound = A.enabled; },
      destroy() {
        A.destroyed = true;
        offs.forEach((f) => f()); offs.length = 0;
        if (A.bed) for (const L of A.bed) { try { L.s.stop(); } catch (e) { /* ignore */ } }
      },
    };
    // try right away (the click on "Watch Live" usually counts as the user gesture)
    if (A.enabled) api.unlock();
    return api;
  }

  PBC.ArenaAudio = { create };
})();
