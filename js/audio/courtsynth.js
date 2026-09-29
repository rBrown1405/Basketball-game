/* Pro BBALL Coach: the court's sounds, made from small physical models (PBC.CourtSynth), Trial 2 of the audio
 * gauntlet. No free sound library could be reached to build this, so every sound here is made by this project (its
 * license is the game's own); a recorded pack (assets/audio/court, CC0 or CC BY, see tools/audio/README.md) takes
 * over any sound it has, through the same path.
 *
 * What each sound is made of (the numbers are in PBC.AudioConfig.courtSynth):
 *   the ball     a thump as it meets the floor, then its pressurised air cavity rings in the modes of a sphere, and
 *                the pebbled cover slaps (dribble, bounce; its ring is also in a catch, a block, the rim, the glass)
 *   a sneaker    a stick-slip pulse train at a few kHz through the sole's resonance, its pitch gliding with the slide
 *   bodies       footsteps (a rubber sole on sprung wood), landings, torsos meeting, a body hitting the floor
 *   the rim      a steel ring's bending modes, each split in two by the clamp at the back; the front rings longest,
 *                the back is near the mount (shorter, the support's thunk with it); a soft touch, a rattle
 *   the glass    the plate's low modes (a thwack), the frame's rattle, the ball's ring
 *   the net      nylon dragged over the ball (a swish sweeping up), the net's whip (a snap); softer off the rim
 *   a dunk       the slam on the rim, the breakaway rim rattling on its spring, the glass and stanchion shaking
 *   rolling      the floor (a rumble with the seams) and the rim (its modes, rubbed)
 *   officials    a pealess whistle (three chambers beating), the shot clock's buzzer, the arena horn
 *
 * Variation: every sound has a fixed set of takes (AudioConfig.court.takes; each take is its own draw of every random
 * part of the model, the same every game, like a set of recordings), a hit picks a take that is not the last one
 * played, then gets a small random change of pitch and level (court.jitter) and its own physics: how hard, how high,
 * where on the floor, how far from the camera. A pack's recordings of a sound are its takes instead. */
(function () {
  'use strict';
  const PBC = window.PBC;

  // the takes' fixed random numbers: a seeded generator (xorshift32) from the sound's name
  function rng(seed) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
  function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
  const TAKE_N = 48;   // random numbers per take (the models read them in a fixed order)

  function create(mx) {
    const C = PBC.AudioConfig, CS = C.courtSynth, CC = C.court;
    const R = PBC.AudioRandom;
    const banks = Object.create(null);   // 'rim.front' → { takes: [Float64Array], last }
    let fixedNoise = false;              // (a test's fixed hit: the same stretch of noise every time too)
    const perCtx = new WeakMap();        // AudioContext → { white, pink, squeakWave, buzzerWave }

    // ------------------------------------------------------------ takes
    function bank(name) {
      let b = banks[name];
      if (!b) {
        const r = rng(hash('court:' + name)), takes = [];
        for (let i = 0; i < Math.max(2, CC.takes); i++) { const t = new Float64Array(TAKE_N); for (let k = 0; k < TAKE_N; k++) t[k] = r(); takes.push(t); }
        b = banks[name] = { takes, last: -1 };
      }
      return b;
    }
    /** a take of a sound: a shuffled round robin, never one of the last court.noRepeat played (with 12 takes and 9,
     *  any 10 hits in a row are 10 different takes) */
    function take(name) {
      const b = bank(name), n = b.takes.length, keep = Math.min(n - 1, CC.noRepeat);
      const recent = b.recent || (b.recent = []);
      const free = [];
      for (let i = 0; i < n; i++) if (!recent.includes(i)) free.push(i);
      const i = free[Math.floor(R.random() * free.length)];
      recent.push(i); while (recent.length > keep) recent.shift();
      b.last = i;
      return i;
    }
    /** the take's numbers, one after another (a model reads them in a fixed order, so a take always sounds alike) */
    function cursor(arr) { let k = 0; return () => arr[(k++) % TAKE_N]; }

    // ------------------------------------------------------------ building blocks
    function shared(ctx) {
      let s = perCtx.get(ctx);
      if (!s) {
        const r = rng(hash('court:noise'));
        const mk = (secs, pink) => {
          const n = Math.floor(ctx.sampleRate * secs), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
          let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
          for (let i = 0; i < n; i++) {
            const w = r() * 2 - 1;
            if (!pink) { d[i] = w; continue; }
            b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
            b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
            d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
          }
          return buf;
        };
        const wave = (amps) => {
          const real = new Float32Array(amps.length + 1), imag = new Float32Array(amps.length + 1);
          for (let i = 0; i < amps.length; i++) imag[i + 1] = amps[i];
          return ctx.createPeriodicWave(real, imag);
        };
        s = { white: mk(2, false), pink: mk(2, true), squeakWave: wave(CS.squeak.harmonics), buzzerWave: wave(CS.buzzer.harmonics) };
        perCtx.set(ctx, s);
      }
      return s;
    }
    /** a decaying sine (one mode of a body): f in Hz, or [from, to] gliding over sweepS; attack a, then e^(-t/tau) */
    function mode(V, ctx, dest, f, amp, tau, t, a, sweepS) {
      if (!(amp > 1e-6) || !(tau > 0)) return null;
      const o = ctx.createOscillator(), g = ctx.createGain();
      const f0 = Array.isArray(f) ? f[0] : f;
      o.frequency.setValueAtTime(f0, t);
      if (Array.isArray(f)) o.frequency.exponentialRampToValueAtTime(f[1], t + (sweepS || tau * 3));
      a = a || 0.0015;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(amp, t + a);
      g.gain.setTargetAtTime(0, t + a, tau);
      o.connect(g); g.connect(dest);
      const stop = t + a + tau * 7;
      o.start(t); o.stop(stop);
      V.src(o, stop);
      return o;
    }
    /** filtered noise: attack a, held for hold, then e^(-t/tau); f in Hz or [from, to] over the whole burst */
    function burst(V, ctx, dest, kind, type, f, q, amp, tau, t, a, hold) {
      if (!(amp > 1e-6) || !(tau > 0)) return null;
      const S = shared(ctx);
      const s = ctx.createBufferSource(), flt = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = kind === 'pink' ? S.pink : S.white; s.loop = true;
      a = a || 0.001; hold = hold || 0;
      const len = a + hold + tau * 6;
      flt.type = type;
      const f0 = Array.isArray(f) ? f[0] : f;
      flt.frequency.setValueAtTime(f0, t);
      if (Array.isArray(f)) flt.frequency.exponentialRampToValueAtTime(f[1], t + len);
      flt.Q.value = q;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(amp, t + a);
      if (hold) g.gain.setValueAtTime(amp, t + a + hold);
      g.gain.setTargetAtTime(0, t + a + hold, tau);
      s.connect(flt); flt.connect(g); g.connect(dest);
      const stop = t + len + tau;
      s.start(t, fixedNoise ? 0.37 : R.random() * 1.9); s.stop(stop);   // (every hit a different stretch of the noise)
      V.src(s, stop);
      return flt;
    }

    // ------------------------------------------------------------ the ball
    // P: e (energy 0..1.2), pm (pitch), lm (level), u (the take), and multipliers: thump, thumpHz, thumpTau, ring,
    // ringTau, click, clickHz
    function ball(V, ctx, dest, t, P) {
      const B = CS.ball, u = P.u, e = Math.max(0.02, P.e), pm = P.pm, pk = B.peak * P.lm;
      const m = (k, d) => (P[k] == null ? d : P[k]);
      // where the ball meets the floor: a pebbled panel, or (in seamShare of the takes) one of its seams, which rings
      // less and slaps lower and harder
      const seam = u() < B.seamShare;
      const th = pk * B.thumpShare * Math.pow(e, 0.7) * m('thump', 1) * lerp(0.8, 1.2, u());
      const thHz = pm * m('thumpHz', 1);
      mode(V, ctx, dest, [B.thumpHz[0] * thHz * lerp(0.88, 1.12, u()), B.thumpHz[1] * thHz * lerp(0.9, 1.1, u())], th, B.thumpTau * m('thumpTau', 1) * lerp(0.8, 1.25, u()), t, 0.002, B.thumpS * lerp(0.8, 1.2, u()));
      mode(V, ctx, dest, B.floorHz * thHz * lerp(0.85, 1.15, u()), th * B.floorAmp * lerp(0.5, 1.5, u()), B.floorTau * m('thumpTau', 1) * lerp(0.8, 1.25, u()), t, 0.001);
      // the cavity rings: harder hits ring more, the high modes most
      const rg = pk * B.ringShare * Math.pow(e, 1.15) * m('ring', 1) * (seam ? B.seamRing : 1) * lerp(0.75, 1.25, u()), n = B.modes.length;
      for (let i = 0; i < n; i++) {
        const f = B.modes[i] * pm * (1 + (u() * 2 - 1) * B.detune);
        const amp = rg * B.modeAmp[i] * (1 + (u() * 2 - 1) * B.ampRand) * Math.pow(Math.min(1.2, e), 0.4 * i / (n - 1));
        const tau = B.modeTau[i] * m('ringTau', 1) * (1 + (u() * 2 - 1) * B.tauRand);
        mode(V, ctx, dest, f, amp, tau, t + 0.0008, 0.0012);
      }
      // the cover's slap on the floor
      const ck = pk * Math.pow(e, 1.5) * m('click', 1) * (seam ? B.seamClick : 1);
      burst(V, ctx, dest, 'white', 'bandpass', B.clickHz * m('clickHz', 1) * (seam ? B.seamClickHz : 1) * lerp(0.85, 1.15, u()), B.clickQ, ck * B.clickAmp, B.clickTau * lerp(0.8, 1.25, u()), t, 0.0005);
      burst(V, ctx, dest, 'white', 'highpass', B.slapHz, 0.7, ck * B.slapAmp, B.slapTau, t, 0.0003);
    }

    // ------------------------------------------------------------ the sounds: SND[name](V, ctx, p)
    // p: e (how hard, 0..1.2), pm, lm, u (the take's numbers), plus each sound's own (tight, kind, part, mass...)
    const SND = {
      dribble(V, ctx, p) {
        const D = CS.dribble, S = p.surf || {}, tt = clamp01(p.tight == null ? 0.5 : p.tight);
        ball(V, ctx, V.out, V.t0, {
          e: p.e, pm: p.pm * (S.pitch || 1), lm: p.lm * D.level, u: p.u,
          thump: lerp(D.tightThump[0], D.tightThump[1], tt) * (S.thump || 1), thumpHz: S.thumpHz || 1, thumpTau: lerp(1.15, 0.8, tt) * (S.thumpTau || 1),
          ring: S.ring || 1, ringTau: lerp(D.tightRing[0], D.tightRing[1], tt) * (S.ringTau || 1),
          click: lerp(D.tightClick[0], D.tightClick[1], tt) * (S.click || 1), clickHz: S.clickHz || 1,
        });
      },
      bounce(V, ctx, p) {
        const S = p.surf || {};
        ball(V, ctx, V.out, V.t0, {
          e: p.e, pm: p.pm * (S.pitch || 1), lm: p.lm * CS.bounce.level, u: p.u,
          thump: S.thump || 1, thumpHz: S.thumpHz || 1, thumpTau: S.thumpTau || 1, ring: S.ring || 1, ringTau: 1.25 * (S.ringTau || 1), click: S.click || 1, clickHz: S.clickHz || 1,
        });
      },
      catch(V, ctx, p) {
        const K = CS.catch, u = p.u, t = V.t0, e = Math.max(0.05, p.e), pk = K.peak * p.lm;
        burst(V, ctx, V.out, 'white', 'bandpass', K.slapHz * p.pm * lerp(0.85, 1.15, u()), K.slapQ, pk * K.slapAmp * Math.pow(e, 1.1), K.slapTau * lerp(0.8, 1.25, u()), t, 0.0006);
        mode(V, ctx, V.out, [K.thumpHz * p.pm, K.thumpHz * 0.6 * p.pm], pk * K.thumpAmp * Math.pow(e, 0.8), K.thumpTau, t, 0.0015);
        ball(V, ctx, V.out, t, { e, pm: p.pm, lm: p.lm * K.ring, u, thump: 0, click: 0, ringTau: K.ringTau });
      },
      pass(V, ctx, p) {
        const K = CS.pass, u = p.u, t = V.t0, e = Math.max(0.05, p.e), pk = K.peak * p.lm;
        burst(V, ctx, V.out, 'white', 'bandpass', K.slapHz * p.pm * lerp(0.75, 1.3, u()), K.slapQ, pk * Math.pow(e, 1.1) * lerp(0.7, 1.3, u()), K.slapTau * lerp(0.7, 1.4, u()), t, 0.0012);
        mode(V, ctx, V.out, [K.thumpHz * p.pm * lerp(0.85, 1.15, u()), K.thumpHz * 0.65 * p.pm], pk * 0.5 * e * lerp(0.6, 1.4, u()), K.thumpTau, t, 0.002);
        if (p.whoosh) burst(V, ctx, V.out, 'pink', 'bandpass', [K.whooshHz[0] * lerp(0.8, 1.2, u()), K.whooshHz[1] * lerp(0.85, 1.15, u())], K.whooshQ, pk * K.whooshAmp * e * lerp(0.6, 1.4, u()), K.whooshS * 0.35, t + 0.01, 0.04, K.whooshS * lerp(0.2, 0.4, u()));
      },
      // a squeak: kind 'cut' | 'stop' | 'pivot' | 'slide' | 'jumpstop'
      squeak(V, ctx, p) {
        const Q = CS.squeak, kind = Q[p.kind] ? p.kind : 'cut';
        if (kind === 'jumpstop') {
          const J = Q.jumpstop;
          squeakOne(V, ctx, p, J, V.t0, 1);
          squeakOne(V, ctx, p, J, V.t0 + J.gap * lerp(0.7, 1.3, R.random()), 0.8);
        } else squeakOne(V, ctx, p, Q[kind], V.t0, 1);
      },
      step(V, ctx, p) {
        const S = CS.step, u = p.u, t = V.t0, e = Math.max(0.05, p.e), pk = S.peak * p.lm * Math.pow(e, 0.9);
        const fm = Math.pow(p.mass || 1, -0.25) * p.pm;   // a heavier body: a lower thud
        // heel then forefoot a few ms apart (or the forefoot alone, up on the toes: the takes with no second)
        const gap = lerp(S.gap[0], S.gap[1], u()), second = lerp(S.second[0], S.second[1], u());
        const hit = (tt, k) => {
          mode(V, ctx, V.out, [S.thumpHz[0] * fm * lerp(0.85, 1.15, u()), S.thumpHz[1] * fm * lerp(0.9, 1.1, u())], pk * k, S.thumpTau * lerp(0.75, 1.3, u()), tt, 0.002, S.thumpS);
          burst(V, ctx, V.out, 'white', 'bandpass', S.tapHz * lerp(0.7, 1.35, u()) * p.pm, S.tapQ, pk * k * S.tapAmp * e * lerp(0.5, 1.5, u()), S.tapTau * lerp(0.7, 1.4, u()), tt, 0.0008);
        };
        hit(t, 1);
        if (second > 0.1) hit(t + gap, second);
        // the board under it knocks, the rubber scuffs
        mode(V, ctx, V.out, lerp(S.knockHz[0], S.knockHz[1], u()) * p.pm, pk * S.knockAmp * e * lerp(0.3, 1.3, u()), S.knockTau * lerp(0.7, 1.4, u()), t, 0.001);
        burst(V, ctx, V.out, 'white', 'highpass', S.scuffHz * lerp(0.8, 1.25, u()), 0.7, pk * S.scuffAmp * e * lerp(0.4, 1.6, u()), S.scuffTau, t + 0.004, 0.002);
      },
      land(V, ctx, p) {
        const L = CS.land, u = p.u, t = V.t0, e = Math.max(0.05, p.e), pk = L.peak * p.lm * Math.pow(e, 0.85);
        const fm = Math.pow(p.mass || 1, -0.25) * p.pm;
        const one = (tt, k) => {
          mode(V, ctx, V.out, [L.thumpHz[0] * fm * lerp(0.85, 1.15, u()), L.thumpHz[1] * fm * lerp(0.9, 1.1, u())], pk * k, L.thumpTau * lerp(0.75, 1.3, u()), tt, 0.003, L.thumpS);
          mode(V, ctx, V.out, L.floorHz * fm * lerp(0.8, 1.2, u()), pk * k * L.floorAmp * lerp(0.5, 1.5, u()), L.floorTau * lerp(0.7, 1.4, u()), tt, 0.002);
          burst(V, ctx, V.out, 'white', 'bandpass', L.slapHz * lerp(0.7, 1.35, u()), L.slapQ, pk * k * L.slapAmp * e * lerp(0.5, 1.5, u()), L.slapTau * lerp(0.7, 1.4, u()), tt, 0.001);
        };
        // one foot, then the other (how far apart and how hard the second comes down is the take's)
        one(t, 1);
        if (p.both !== false) one(t + lerp(L.second[0], L.second[1], u()), L.secondAmp * lerp(0.55, 1.35, u()));
      },
      // two bodies: kind 'bump' | 'screen' | 'boxout' | 'post'
      body(V, ctx, p) {
        const Bd = CS.body, K = CC.body, u = p.u, t = V.t0, e = Math.max(0.05, p.e);
        const k = p.kind === 'screen' ? K.screenK : p.kind === 'boxout' ? K.boxoutK : p.kind === 'post' ? K.postK : 1;
        const pk = Bd.peak * p.lm * Math.pow(e, 0.9) * k;
        const fm = (p.kind === 'screen' ? 0.85 : p.kind === 'post' ? 1.12 : 1) * p.pm;
        const one = (tt, k) => {
          mode(V, ctx, V.out, [Bd.thumpHz[0] * fm * lerp(0.8, 1.2, u()), Bd.thumpHz[1] * fm * lerp(0.85, 1.15, u())], pk * k, Bd.thumpTau * lerp(0.75, 1.3, u()), tt, 0.003, Bd.thumpS);
          burst(V, ctx, V.out, 'pink', 'lowpass', Bd.fleshHz * lerp(0.7, 1.3, u()), 0.7, pk * k * Bd.fleshAmp * lerp(0.6, 1.4, u()), Bd.fleshTau * lerp(0.7, 1.3, u()), tt, 0.002);
        };
        // chest into chest, and in some takes a hip or shoulder a moment later
        one(t, 1);
        const second = lerp(Bd.second[0], Bd.second[1], u());
        if (second > 0.15) one(t + lerp(0.02, 0.06, u()), second);
        burst(V, ctx, V.out, 'white', 'bandpass', Bd.clothHz * lerp(0.7, 1.35, u()), Bd.clothQ, pk * Bd.clothAmp * lerp(0.3, 1.6, u()), Bd.clothTau * (p.kind === 'boxout' ? 1.6 : 1) * lerp(0.7, 1.4, u()), t, 0.005);
      },
      fall(V, ctx, p) {
        const F = CS.fall, u = p.u, t = V.t0, e = Math.max(0.2, p.e), pk = F.peak * p.lm * e;
        const fm = Math.pow(p.mass || 1, -0.2) * p.pm;
        mode(V, ctx, V.out, [F.thumpHz[0] * fm * lerp(0.85, 1.15, u()), F.thumpHz[1] * fm * lerp(0.9, 1.1, u())], pk, F.thumpTau * lerp(0.75, 1.3, u()), t, 0.004, F.thumpS);
        // the seat first, then the back (how long between them is the take's)
        mode(V, ctx, V.out, [F.thumpHz[0] * fm * lerp(0.9, 1.25, u()), F.thumpHz[1] * fm], pk * lerp(F.second[0], F.second[1], u()), F.thumpTau * lerp(0.7, 1.1, u()), t + lerp(F.secondAt[0], F.secondAt[1], u()), 0.004, F.thumpS);
        burst(V, ctx, V.out, 'pink', 'lowpass', F.rumbleHz * lerp(0.75, 1.3, u()), 0.7, pk * F.rumbleAmp * lerp(0.6, 1.4, u()), F.rumbleTau, t, 0.004);
        burst(V, ctx, V.out, 'white', 'bandpass', F.handsHz * lerp(0.85, 1.15, u()), F.handsQ, pk * F.handsAmp, F.handsTau, t + F.handsAt * lerp(0.6, 1.4, u()), 0.001);
        burst(V, ctx, V.out, 'white', 'bandpass', F.skidHz, 1.2, pk * F.skidAmp, F.skidTau, t + 0.02, 0.01);
      },
      // the rim: part 'front' | 'back' | 'side' | 'soft' | 'rattle'
      rim(V, ctx, p) { rimHit(V, ctx, V.out, V.t0, p, p.part, p.e, 1); },
      board(V, ctx, p) {
        const Bo = CS.board, u = p.u, t = V.t0, e = Math.max(0.1, p.e), pk = Bo.peak * p.lm * Math.pow(e, 0.9);
        // where on the glass it hits sets which of the plate's modes it drives (the take's pattern)
        for (let i = 0; i < Bo.modes.length; i++) {
          mode(V, ctx, V.out, Bo.modes[i] * p.pm * (1 + (u() * 2 - 1) * Bo.detune), pk * Bo.amp[i] * (1 + (u() * 2 - 1) * Bo.ampRand), Bo.tau[i] * (1 + (u() * 2 - 1) * Bo.tauRand), t, 0.002);
        }
        for (const f of Bo.frame) mode(V, ctx, V.out, f * lerp(0.95, 1.05, u()), pk * Bo.frameAmp * lerp(0.5, 1.2, u()) * e, Bo.frameTau * lerp(0.8, 1.2, u()), t + 0.002, 0.001);
        burst(V, ctx, V.out, 'white', 'bandpass', Bo.clickHz * lerp(0.85, 1.15, u()), Bo.clickQ, pk * Bo.clickAmp * Math.pow(e, 1.3), Bo.clickTau, t, 0.0005);
        ball(V, ctx, V.out, t, { e, pm: p.pm, lm: p.lm * Bo.ball, u, thump: 0.25, click: 0.3 });
      },
      swish(V, ctx, p) { netHit(V, ctx, V.out, V.t0, p, CS.swish, p.e, true); },
      net(V, ctx, p) { netHit(V, ctx, V.out, V.t0, p, CS.net, p.e, false); },
      dunk(V, ctx, p) {
        const D = CS.dunk, u = p.u, t = V.t0, lm = p.lm * D.peak;
        // the slam: the front of the rim, rung hard and cut short by the hands on it
        rimHit(V, ctx, V.out, t, Object.assign({}, p, { lm }), 'front', D.slamE, D.slamTau);
        // the breakaway rim rattling on its spring, twice
        const rattle = (t0, amp, n) => {
          const hz = lerp(D.rattle.hz[0], D.rattle.hz[1], u());
          for (let k = 0; k < n; k++) {
            const tk = t0 + k / hz * lerp(0.88, 1.12, R.random()), a = amp * Math.pow(D.rattle.decay, k);
            for (let i = 1; i <= 3; i++) mode(V, ctx, V.out, CS.rim.modes[i] * p.pm * lerp(0.98, 1.02, u()), CS.rim.peak * lm * a * CS.rim.front.amp[i], 0.03 * lerp(0.8, 1.2, u()), tk, 0.001);
            burst(V, ctx, V.out, 'white', 'bandpass', CS.rim.tickHz, CS.rim.tickQ, CS.rim.peak * lm * a * CS.rim.tickAmp, CS.rim.tickTau, tk, 0.0005);
          }
        };
        rattle(t + 0.02, D.rattle.amp, Math.round(lerp(D.rattle.n[0], D.rattle.n[1], u())));
        rattle(t + D.rattle2.at, D.rattle2.amp, 3);
        // the glass and the stanchion shaking: the plate's lowest modes, the frame's buzz
        const Sh = D.shake, bpk = CS.board.peak * lm;
        mode(V, ctx, V.out, Sh.hz[0] * lerp(0.95, 1.05, u()), bpk * Sh.amp, Sh.tau, t + 0.005, 0.01);
        mode(V, ctx, V.out, Sh.hz[1] * lerp(0.95, 1.05, u()), bpk * Sh.amp * 0.7, Sh.tau * 0.8, t + 0.005, 0.01);
        const fo = ctx.createOscillator(), ff = ctx.createBiquadFilter(), fg = ctx.createGain(), am = ctx.createOscillator(), amg = ctx.createGain();
        fo.type = 'sawtooth'; fo.frequency.value = lerp(Sh.frameHz[0], Sh.frameHz[1], u());
        ff.type = 'lowpass'; ff.frequency.value = 700;
        am.frequency.value = Sh.frameAm; amg.gain.value = bpk * Sh.frameAmp * 0.5;
        fg.gain.setValueAtTime(0, t); fg.gain.linearRampToValueAtTime(bpk * Sh.frameAmp * 0.5, t + 0.01); fg.gain.setTargetAtTime(0, t + 0.01, Sh.tau * 0.6);
        am.connect(amg); amg.connect(fg.gain); fo.connect(ff); ff.connect(fg); fg.connect(V.out);
        const st = t + 0.01 + Sh.tau * 0.6 * 7;
        for (const o of [fo, am]) { o.start(t); o.stop(st); V.src(o, st); }
        // the net whipped
        netHit(V, ctx, V.out, t + 0.03, Object.assign({}, p, { lm }), CS.swish, D.net, true);
      },
      block(V, ctx, p) {
        const K = CS.block, u = p.u, t = V.t0, e = Math.max(0.3, p.e), pk = K.peak * p.lm;
        burst(V, ctx, V.out, 'white', 'bandpass', K.slapHz * p.pm * lerp(0.85, 1.15, u()), K.slapQ, pk * K.slapAmp * e, K.slapTau, t, 0.0006);
        mode(V, ctx, V.out, [K.thumpHz * p.pm, K.thumpHz * 0.6], pk * K.thumpAmp * e, K.thumpTau, t, 0.0015);
        ball(V, ctx, V.out, t, { e, pm: p.pm, lm: p.lm * K.ring, u, thump: 0, click: 0.4 });
      },
      // rolling on the floor: v0 (ft/s) slowing to a stop over T (s)
      roll(V, ctx, p) {
        const Ro = CS.roll, t = V.t0, T = Math.max(0.2, p.T || 1), v0 = Math.max(0.5, p.v0 || 4);
        const pk = Ro.peak * p.lm * Math.pow(Math.min(1.2, v0 / CC.roll.fullSpeed), 1.1);
        const S = shared(ctx);
        const s = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), bp = ctx.createBiquadFilter(), g = ctx.createGain(), am = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
        s.buffer = S.pink; s.loop = true;
        lp.type = 'lowpass'; lp.frequency.value = Ro.lpHz * p.pm * lerp(0.75, 1.3, p.u());
        bp.type = 'peaking'; bp.frequency.value = Ro.bpHz * p.pm * lerp(0.75, 1.3, p.u()); bp.Q.value = Ro.bpQ; bp.gain.value = lerp(3, 9, p.u());
        // the seams going round: the level beats at the ball's turning rate (v / 2 pi r) times the seams, slowing down
        const rot = (v) => Math.max(0.2, Ro.seams * v / (2 * Math.PI * 0.39));
        lfo.frequency.setValueAtTime(rot(v0), t); lfo.frequency.linearRampToValueAtTime(rot(0.3), t + T);
        const dep = Ro.amDepth * lerp(0.6, 1.3, p.u());
        lg.gain.value = dep * 0.5; am.gain.value = 1 - dep * 0.5;
        lfo.connect(lg); lg.connect(am.gain);
        // the level follows the speed (linear slowing: level ~ speed)
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(pk, t + 0.03); g.gain.linearRampToValueAtTime(pk * 0.08, t + T); g.gain.setTargetAtTime(0, t + T, 0.05);
        s.connect(lp); lp.connect(bp); bp.connect(g); g.connect(am); am.connect(V.out);
        const stop = t + T + 0.4;
        s.start(t, R.random() * 1.5); s.stop(stop); lfo.start(t); lfo.stop(stop);
        V.src(s, stop); V.src(lfo, stop);
      },
      // rolling round the rim: T (s), slowing
      rimroll(V, ctx, p) {
        const Rr = CS.rimroll, t = V.t0, T = Math.max(0.15, p.T || 0.5), u = p.u, pk = Rr.peak * p.lm * Math.max(0.3, p.e);
        const S = shared(ctx);
        const s = ctx.createBufferSource(), g = ctx.createGain(), am = ctx.createGain(), sum = ctx.createGain();
        s.buffer = S.white; s.loop = true;
        for (const f of Rr.modes) { const b = ctx.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = f * p.pm * lerp(0.98, 1.02, u()); b.Q.value = Rr.q; s.connect(b); b.connect(sum); }
        sum.gain.value = 4;
        const lfos = Rr.am.map((hz) => { const o = ctx.createOscillator(), lg = ctx.createGain(); o.frequency.value = hz * lerp(0.85, 1.15, u()); lg.gain.value = Rr.amDepth * 0.25; o.connect(lg); lg.connect(am.gain); return o; });
        am.gain.value = 1 - Rr.amDepth * 0.5;
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(pk, t + 0.02); g.gain.linearRampToValueAtTime(pk * 0.45, t + T); g.gain.setTargetAtTime(0, t + T, 0.03);
        sum.connect(g); g.connect(am); am.connect(V.out);
        const stop = t + T + 0.25;
        s.start(t, R.random() * 1.5); s.stop(stop); V.src(s, stop);
        for (const o of lfos) { o.start(t); o.stop(stop); V.src(o, stop); }
      },
      // the whistle: len (s), e
      whistle(V, ctx, p) {
        const W = CS.whistle, u = p.u, t = V.t0, len = Math.max(0.15, p.len || 0.4), pk = W.peak * p.lm * Math.max(0.5, p.e);
        const f = lerp(W.hz[0], W.hz[1], u()) * p.pm;
        const g = ctx.createGain(), wob = ctx.createOscillator(), wg = ctx.createGain();
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(pk, t + W.a); g.gain.setValueAtTime(pk, t + len - W.rel); g.gain.linearRampToValueAtTime(0, t + len);
        wob.frequency.value = lerp(W.wobble[0], W.wobble[1], u()); wg.gain.value = pk * W.wobbleDepth; wob.connect(wg); wg.connect(g.gain);
        g.connect(V.out);
        const stop = t + len + 0.02;
        // the blast's shape is the take's: how deep the chirp in, and whether the pitch sags as the breath runs out
        const chirp = lerp(W.chirp[0], 0.98, u()), sag = u() < W.sagShare ? lerp(W.sag[0], W.sag[1], u()) : 0;
        const osc = (hz, amp) => {
          const o = ctx.createOscillator(), og = ctx.createGain();
          o.frequency.setValueAtTime(hz * chirp, t); o.frequency.exponentialRampToValueAtTime(hz, t + W.chirp[1]);
          if (sag) { o.frequency.setValueAtTime(hz, t + Math.max(W.chirp[1], len - W.sagS)); o.frequency.linearRampToValueAtTime(hz * (1 - sag), t + len); }
          og.gain.value = amp; o.connect(og); og.connect(g); o.start(t); o.stop(stop); V.src(o, stop);
        };
        for (let i = 0; i < W.chambers.length; i++) osc(f * W.chambers[i] * (1 + (u() - 0.5) * 0.004), W.chamberAmp[i] * lerp(0.7, 1.3, u()));
        osc(f * 2, W.h2);
        wob.start(t); wob.stop(stop); V.src(wob, stop);
        burst(V, ctx, V.out, 'white', 'bandpass', W.breathHz, W.breathQ, pk * W.breathAmp, 0.02, t, W.a, Math.max(0, len - W.a - 0.05));
      },
      buzzer(V, ctx, p) {
        const Bz = CS.buzzer, u = p.u, t = V.t0, len = lerp(Bz.s[0], Bz.s[1], u()), pk = Bz.peak * p.lm;
        const S = shared(ctx);
        const g = ctx.createGain(), lp = ctx.createBiquadFilter(), am = ctx.createOscillator(), amg = ctx.createGain();
        lp.type = 'lowpass'; lp.frequency.value = Bz.lpHz;
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(pk, t + Bz.a); g.gain.setValueAtTime(pk, t + len - Bz.rel); g.gain.linearRampToValueAtTime(0, t + len);
        am.frequency.value = Bz.am * lerp(0.85, 1.15, u()); amg.gain.value = pk * Bz.amDepth * lerp(0.6, 1.3, u()); am.connect(amg); amg.connect(g.gain);
        const f = lerp(Bz.hz[0], Bz.hz[1], u()) * p.pm;
        const stop = t + len + 0.02;
        for (const hz of [f, f + Bz.beat * lerp(0.6, 1.4, u())]) { const o = ctx.createOscillator(); o.setPeriodicWave(S.buzzerWave); o.frequency.value = hz; o.connect(lp); o.start(t); o.stop(stop); V.src(o, stop); }
        lp.connect(g); g.connect(V.out);
        am.start(t); am.stop(stop); V.src(am, stop);
      },
      horn(V, ctx, p) {
        const H = CS.horn, u = p.u, t = V.t0, len = lerp(H.s[0], H.s[1], u()), pk = H.peak * p.lm;
        const g = ctx.createGain(), lp = ctx.createBiquadFilter(), vib = ctx.createOscillator();
        lp.type = 'lowpass'; lp.frequency.value = H.lpHz;
        const att = lerp(H.attack[0], H.attack[1], u()), swell = lerp(H.swellDepth[0], H.swellDepth[1], u());
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(pk, t + att); g.gain.setValueAtTime(pk, t + len); g.gain.linearRampToValueAtTime(0, t + len + H.rel);
        vib.frequency.value = H.vib[0];
        const stop = t + len + H.rel + 0.05;
        const top = u() < H.topShare;   // (some horns have a fourth, higher voice)
        for (let i = 0; i < H.hz.length; i++) {
          const [hz, k] = H.hz[i];
          if (i === H.hz.length - 1 && !top) continue;
          const f = hz * p.pm * (1 + (u() - 0.5) * 2 * H.take);
          const o = ctx.createOscillator(), og = ctx.createGain(), vg = ctx.createGain();
          o.type = 'sawtooth';
          o.frequency.setValueAtTime(f * swell, t); o.frequency.exponentialRampToValueAtTime(f, t + H.swell[1] + att);
          vg.gain.value = f * H.vib[1]; vib.connect(vg); vg.connect(o.frequency);
          og.gain.value = k; o.connect(og); og.connect(lp);
          o.start(t); o.stop(stop); V.src(o, stop);
        }
        lp.connect(g); g.connect(V.out);
        vib.start(t); vib.stop(stop); V.src(vib, stop);
      },
    };

    function squeakOne(V, ctx, p, K, t, k) {
      const Q = CS.squeak, u = p.u, e = clamp01(p.e);
      const S = shared(ctx);
      const dur = lerp(K.s[0], K.s[1], clamp01(0.25 + 0.6 * e + 0.15 * u())) * lerp(0.9, 1.1, R.random());
      const f0 = lerp(Q.hz[0], Q.hz[1], e) * (1 + (u() * 2 - 1) * Q.takePitch) * p.pm;
      const pk = Q.peak * p.lm * lerp(0.35, 1, e) * k;
      const o = ctx.createOscillator(), hp = ctx.createBiquadFilter(), res = ctx.createBiquadFilter(), g = ctx.createGain();
      const jit = ctx.createOscillator(), jg = ctx.createGain(), rough = ctx.createOscillator(), rg = ctx.createGain();
      o.setPeriodicWave(S.squeakWave);
      o.frequency.setValueAtTime(f0 * K.shape[0], t);
      o.frequency.linearRampToValueAtTime(f0 * K.shape[1], t + dur * lerp(0.3, 0.5, u()));
      o.frequency.linearRampToValueAtTime(f0 * K.shape[2], t + dur);
      // stick-slip is never steady: the rate wanders and the level chatters
      jit.frequency.value = lerp(Q.jitterHz[0], Q.jitterHz[1], u()); jg.gain.value = f0 * Q.jitterDepth; jit.connect(jg); jg.connect(o.frequency);
      rough.frequency.value = lerp(Q.rough[0], Q.rough[1], u()); rg.gain.value = pk * Q.roughDepth; rough.connect(rg); rg.connect(g.gain);
      hp.type = 'highpass'; hp.frequency.value = Q.hpHz;
      res.type = 'peaking'; res.frequency.value = Q.resHz * lerp(0.85, 1.15, u()); res.Q.value = Q.resQ; res.gain.value = 9;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(pk, t + Q.a);
      if (p.kind === 'stop') g.gain.linearRampToValueAtTime(pk * 0.55, t + Math.max(Q.a, dur - Q.rel));
      else g.gain.setValueAtTime(pk, t + Math.max(Q.a, dur - Q.rel));
      g.gain.linearRampToValueAtTime(0, t + dur);
      o.connect(hp); hp.connect(res); res.connect(g); g.connect(V.out);
      const stop = t + dur + 0.02;
      for (const n of [o, jit, rough]) { n.start(t); n.stop(stop); V.src(n, stop); }
    }
    // the rim: part's mode amplitudes and decays, split modes, the tick of contact, the mount's thunk, the ball's ring
    function rimHit(V, ctx, dest, t, p, part, e, tauK) {
      const Rm = CS.rim, K = Rm[part] || Rm.side, u = p.u;
      e = Math.max(0.1, e);
      const pk = Rm.peak * p.lm * K.level * Math.pow(e, 0.9), n = Rm.modes.length;
      for (let i = 0; i < n; i++) {
        const f = Rm.modes[i] * p.pm * (1 + (u() * 2 - 1) * Rm.detune);
        const amp = pk * K.amp[i] * (1 + (u() * 2 - 1) * Rm.ampRand) * Math.pow(Math.min(1.3, e), 0.5 * i / (n - 1));
        const tau = K.tau[i] * (tauK || 1) * (1 + (u() * 2 - 1) * Rm.tauRand);
        mode(V, ctx, dest, f, amp, tau, t, 0.0008);
        if (i < n - 2) mode(V, ctx, dest, f * (1 + lerp(Rm.split[0], Rm.split[1], u())), amp * lerp(0.35, 0.8, u()), tau * 0.9, t, 0.0008);
      }
      burst(V, ctx, dest, 'white', 'bandpass', Rm.tickHz * lerp(0.85, 1.15, u()), Rm.tickQ, pk * Rm.tickAmp * Math.pow(e, 1.3), Rm.tickTau, t, 0.0004);
      mode(V, ctx, dest, [Rm.mountHz[0] * lerp(0.92, 1.08, u()), Rm.mountHz[1]], pk * K.mount * 1.6, Rm.mountTau, t + 0.001, 0.002);
      ball(V, ctx, dest, t, { e: Math.min(1.1, e), pm: p.pm, lm: p.lm * Rm.ball * K.level, u, thump: 0.15, click: 0.25 });
    }
    // the net: W = CS.swish or CS.net
    function netHit(V, ctx, dest, t, p, W, e, snap) {
      const u = p.u;
      e = Math.max(0.2, e);
      const pk = W.peak * p.lm * e;
      const hold = lerp(W.hold[0], W.hold[1], u()), rel = lerp(W.rel[0], W.rel[1], u());
      burst(V, ctx, dest, 'white', 'bandpass', [W.hz[0] * lerp(0.9, 1.1, u()), W.hz[1] * lerp(0.9, 1.1, u())], W.q, pk, rel / 3, t, W.a, hold);
      burst(V, ctx, dest, 'white', 'highpass', W.airHz, 0.7, pk * W.airAmp, rel / 3, t + W.a * 0.5, W.a, hold * 0.8);
      const Sw = CS.swish;
      if (W.snapAmp > 0) burst(V, ctx, dest, 'white', 'bandpass', Sw.snapHz * lerp(0.85, 1.15, u()), Sw.snapQ, pk * W.snapAmp * (snap ? 1 : 0.6), Sw.snapTau, t + lerp(Sw.snapAt[0], Sw.snapAt[1], u()), 0.001);
    }

    /** a pack's recording as a take: its pitch and level (and a tight dribble's tail cut shorter) */
    function sampleHit(V, ctx, buf, p) {
      const s = ctx.createBufferSource(), g = ctx.createGain();
      s.buffer = buf;
      s.playbackRate.value = p.pm;
      const lv = p.lm * Math.max(0.05, Math.min(1.3, p.e == null ? 1 : p.e));
      g.gain.setValueAtTime(lv, V.t0);
      if (p.tight != null) g.gain.setTargetAtTime(0, V.t0 + lerp(0.12, 0.05, clamp01(p.tight)), 0.03);
      s.connect(g); g.connect(V.out);
      const stop = V.t0 + buf.duration / p.pm + 0.02;
      s.start(V.t0); s.stop(stop);
      V.src(s, stop);
    }

    /**
     * play a court sound. name: a key of SND (and of AudioConfig.sounds); p: its physics (e: how hard 0..1.2, and the
     * sound's own: tight, surf, kind, part, mass, len, T, v0, whoosh...; variant: the bank, e.g. the rim's part);
     * o: the mixer's options (when, place, force). Returns the voice, or null.
     */
    function play(name, p, o) {
      const recipe = SND[name];
      if (!recipe || !mx.ctx) return null;
      p = p || {};
      const bankName = p.variant ? name + '.' + p.variant : name;
      const J = CC.jitter;
      // (p.fixed, for tests: always the first take with no pitch or level change, so only the physics differs)
      const ti = p.fixed ? 0 : take(bankName);
      const q = Object.assign({}, p);
      q.pm = (p.fixed ? 1 : 1 + (R.random() * 2 - 1) * J.pitch) * (p.pitch || 1);
      q.lm = (p.fixed ? 1 : Math.pow(10, ((R.random() * 2 - 1) * J.gainDb) / 20)) * (p.level == null ? 1 : p.level);
      q.u = cursor(bank(bankName).takes[ti]);
      q.e = p.e == null ? 1 : p.e;
      const Assets = PBC.AudioAssets;
      const buf = Assets ? (Assets.get('court', bankName) || (p.variant ? Assets.get('court', name) : null)) : null;
      const opts = Object.assign({}, o || {});
      opts.tag = (p.variant ? p.variant + ' ' : '') + (buf ? 'rec' : 'take ' + (ti + 1));
      fixedNoise = !!p.fixed;
      let vo;
      try { vo = mx.play(name, q.e, buf ? (V) => sampleHit(V, mx.ctx, buf, q) : (V) => recipe(V, mx.ctx, q), opts); } finally { fixedNoise = false; }
      // (what this hit was, for the tests: the take, and the pitch and level it got on top)
      if (vo) vo.meta = { bank: bankName, take: ti + 1, pitch: q.pm, level: q.lm, rec: !!buf };
      return vo;
    }

    return {
      play,
      has: (name) => !!SND[name],
      names: () => Object.keys(SND),
      /** for tests: which take a bank played last */
      lastTake: (bankName) => (banks[bankName] ? banks[bankName].last : -1),
    };
  }

  PBC.CourtSynth = { create };
})();
