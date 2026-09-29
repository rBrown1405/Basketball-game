/* Pro BBALL Coach: the court's sounds (PBC.CourtAudio), Trial 2 of the audio gauntlet.
 *
 * It hears the court the way the court already reports it and reads (never changes) what else it needs from the view:
 *   view.sound(name, v, at, who)   the ball's contacts as they happen: a dribble's bounce, a floor bounce, the rim,
 *                                  the glass, the net; a block and a dunk as they start; the whistle and the horn
 *   view.cue(type, a, d)           a foot planting (the body's speed, braking and turning), a landing, a catch, a pass
 *   every frame (frame())          the ball's flight (the net as the ball enters it, the ball rolling on the floor or
 *                                  round the rim), bodies coming into contact, how high a player jumped, a fall hitting
 *                                  the floor, a post-up's bump, which referee is signalling
 * and decides what sounds and how: a dribble by how hard and high it bounced and where on the floor, a squeak only on
 * a hard plant (never more than a player's and the floor's share), footsteps from running bodies (the loudest first),
 * the rim's front, back or side, a swish that is only the net, a make off the rim, an air ball with nothing at the hoop.
 * Every rule's numbers are in PBC.AudioConfig.court; the sounds themselves are js/audio/courtsynth.js.
 *
 * Where: each sound is placed from the broadcast camera (pan by where it is in the picture, level by its distance,
 * duller and roomier further off, lower still off the picture). When: the court runs fixed 1/60 s steps and draws the
 * picture between the last two, so the exact game time of a contact (a segment's start, the dribble's phase crossing
 * the floor) is turned into the audio time at which that moment is on screen.
 * Every sound goes out on the bus as court.<name> with what made it (the plant's numbers, the rim part, the dribble's
 * height), where it is and how long it waited, and what the mixer did with it.
 *
 * What it reads from the court (read only; the animation is not touched): view.time, _acc, debug, replay, cam, ball,
 * actors, refs, director.off, clock(), period, attacksRight(); the ball's segs, segI, state, dr (u, plan, curPeriod),
 * shotHoop, vx/vy/vz; an actor's x, y, vx, vy, axF, ayF, speed, facing, H, dims.bulk, stance, kind, jumpZ, hit, clip
 * and upper (clip.name, clip.events, t, fired). */
(function () {
  'use strict';
  const PBC = window.PBC;
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
  const wrapPi = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
  function rng(seed) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
  function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  // the officials' signals and the call each one is
  const CALL = { refFoul: 'foul', refDef3: 'foul', refCharge: 'charge', refTravel: 'violation', refThreeSec: 'violation', refShotClock: 'violation', refEight: 'violation', refBackcourt: 'violation', refOut: 'out' };
  const DEF = { defense: 1, defenseWide: 1, contest: 1, postD: 1 };

  function create(host) {
    const C = PBC.AudioConfig, K = C.court, Bus = PBC.AudioBus, R = PBC.AudioRandom;
    const mx = host.mx;
    const synth = PBC.CourtSynth.create(mx);
    try { synth.warm(); } catch (e) { /* no audio yet: built on the first sound */ }
    const viewOf = () => (typeof host.view === 'function' ? host.view() : host.view);
    const speedOf = () => (host.speed ? +host.speed() || 1 : 1);
    const A = {
      q: [],                   // contacts heard in this frame's steps, played at frame()
      seen: new WeakSet(),     // ball segments already sounded
      rimHits: new WeakMap(),  // a flight's segments → rim hits so far (the second and later are a rattle)
      ballSegs: null, ballIdx: 0,
      roll: null,              // the ball rolling on the floor: { voice, seg, segs }
      dunk: null, block: null, // a dunk or block on its way (the sound waits for the contact)
      act: new Map(),          // per body: air peak, last land / squeak / body sound, facing, yaw rate, hit seen
      pairs: new Map(),        // two players' contact state
      clipSeen: new WeakMap(), // a clip's events already sounded
      squeaks: [],             // audio times of recent squeaks (the floor's window, as their plants happen)
      sqHeard: [],             // and when they are heard
      tokens: K.step.perSecond, tokenT: null,
      lastShow: null, rate: 1,
      hornAt: -1e9,
      floorKey: null, dead: [], field: null,
      destroyed: false,
      stats: { heard: {}, played: {}, skip: {} },
    };
    const note = (k, what) => { const o = A.stats[k]; o[what] = (o[what] || 0) + 1; };

    // ------------------------------------------------------------ the floor
    function arenaKey() {
      const t = host.teams && host.teams[0];
      return t ? String(t.abbr || t.name || t.id || 'home') : 'home';
    }
    /** an arena's floor: its random field's phases and its dead spots (the same every game in that arena) */
    function floorSetup() {
      const key = arenaKey();
      if (A.floorKey === key) return;
      A.floorKey = key;
      const r = rng(hash('floor:' + key)), F = K.floor;
      A.field = [0, 1, 2].map(() => ({ kx: (r() * 2 - 1) / F.fieldScaleFt, ky: (r() * 2 - 1) / F.fieldScaleFt, ph: r() * 6.283, ph2: r() * 6.283 }));
      A.dead = [];
      const n = Math.floor(r() * (F.deadSpots + 1));
      for (let i = 0; i < n; i++) {
        // somewhere a ball is dribbled, off the paint: the wings, the top, the backcourt
        const x = 22 + r() * 50, y = 6 + r() * 38;
        if (Math.abs(y - 25) < 9 && (x < 22 || x > 72)) continue;
        A.dead.push({ x, y });
      }
    }
    /** what the floor sounds like here: the ball's model's multipliers, a level change and a lowpass off the court */
    function floorAt(x, y) {
      floorSetup();
      const F = K.floor;
      let f = 0;
      for (const w of A.field) f += Math.sin(x * w.kx * 6.283 + w.ph) * Math.cos(y * w.ky * 6.283 + w.ph2);
      f /= A.field.length;   // about -1..1, smooth over ~fieldScaleFt
      const s = { zone: 'wood', pitch: 1 + f * F.fieldPitch, db: f * F.fieldDb, thump: 1, thumpHz: 1, thumpTau: 1, ring: 1, ringTau: 1, click: 1, clickHz: 1, lp: 0 };
      const out = x < 0 || x > 94 || y < 0 || y > 50;
      if (out) {
        const past = Math.max(-x, x - 94, -y, y - 50);
        if (past > F.apronFt) { s.zone = 'courtside'; s.lp = F.sideLpHz; s.db += F.sideDb; s.ring = F.sideRing; s.click = 0.4; s.thumpTau = 1.3; return s; }
        s.zone = 'apron';
        return s;
      }
      // the painted lanes and the centre logo
      if ((Math.abs(y - 25) < 8 && (x < 19 || x > 75)) || Math.hypot(x - 47, y - 25) < 6) { s.zone = 'paint'; s.click = F.paintClick; s.clickHz = F.paintHz; }
      for (const d of A.dead) {
        const k = 1 - Math.hypot(x - d.x, y - d.y) / F.deadRadiusFt;
        if (k > 0) {
          const q = Math.min(1, k * 1.6);
          s.zone = 'dead'; s.thumpHz *= lerp(1, F.deadThump, q); s.ring *= lerp(1, F.deadRing, q); s.db += F.deadDb * q; s.thumpTau *= lerp(1, F.deadDecay, q); s.ringTau *= lerp(1, 0.8, q);
        }
      }
      return s;
    }

    // ------------------------------------------------------------ where: the broadcast camera
    const PT = { x: 0, y: 0, s: 0, d: 0 };
    /** pan, level (dB), air (lowpass Hz) and extra reverb of a sound at x, y, z (ft) from the camera now */
    function place(v, x, y, z) {
      const P = K.place, cam = v && v.cam;
      if (!cam || x == null || !isFinite(x)) return null;
      cam.project(x, y, z || 0, PT);
      const half = (cam.W || 1600) / 2, sx = (PT.x - (cam.ox != null ? cam.ox : half)) / half;
      const over = Math.max(0, Math.abs(sx) - 1);
      const pan = Math.max(-P.panMax, Math.min(P.panMax, sx * P.panWidth));
      const d = Math.hypot(x - cam.x, y - cam.y, (z || 0) * P.height - cam.z);
      let db = 20 * Math.log10(P.refFt / Math.max(1, d)) * P.rolloff + P.offDb * Math.min(1, over / P.offSpan);
      db = Math.max(P.minDb, Math.min(P.maxDb, db));
      const k = clamp01((d - P.nearFt) / (P.farFt - P.nearFt));
      return { pan, db, lp: P.airNearHz * Math.pow(P.airFarHz / P.airNearHz, k), wet: P.wetFar * k, d, sx };
    }

    // ------------------------------------------------------------ when: the moment it is on screen
    function showTime(v) {
      const Tn = PBC.Match && PBC.Match.Tune, h = Tn && Tn.clock ? Tn.clock.step : 1 / 60;
      if (v.debug || v.replay) return v.time;   // (the animation tools draw the last step itself)
      return v.time - h + Math.min(h, Math.max(0, v._acc || 0));
    }
    function queue(h) { note('heard', h.name); A.q.push(h); }

    // ------------------------------------------------------------ bodies
    function st(a) {
      let s = A.act.get(a);
      if (!s) { s = { peak: 0, lastLand: -1e9, lastSqueak: -1e9, lastBody: -1e9, face: null, faceT: 0, yaw: 0, hit: a.hit || null, vs: [] }; A.act.set(a, s); }
      return s;
    }
    /** how much of the body's movement is sideways to the way it faces (0 running forward or back, 1 sliding) */
    const sideways = (a, sp) => (sp > 0.3 ? Math.abs(-Math.sin(a.facing) * a.vx + Math.cos(a.facing) * a.vy) / sp : 0);
    /** the body's top speed over the last squeak.recentS of game time (a stop is judged by how fast it was going) */
    function recentSpeed(s, gt, sp) {
      let m = sp;
      for (const [t, v] of s.vs) if (gt - t <= K.squeak.recentS && v > m) m = v;
      return m;
    }
    const massOf = (a) => Math.pow((a.H || 6.6) / 6.6, 3) * ((a.dims && a.dims.bulk) || 1);
    const onFloor = (a) => a && !a.hidden && a.y > -3 && a.y < 53;
    /** how hard the body is braking and turning (ft/s², the actor's smoothed acceleration against its velocity) */
    function forces(a) {
      const sp = a.speed || 0;
      let brake = 0, turn = 0;
      if (sp > 0.3) { const ux = a.vx / sp, uy = a.vy / sp, ax = a.axF || 0, ay = a.ayF || 0; brake = Math.max(0, -(ax * ux + ay * uy)); turn = Math.abs(ax * uy - ay * ux); }
      return { sp, brake, turn };
    }
    /** the floor's squeak budget (a sliding second of audio time) and the player's own gap */
    function squeakGate(s, gt, why) {
      const Q = K.squeak, now = mx.now();
      while (A.squeaks.length && A.squeaks[0] < now - 1) A.squeaks.shift();
      if (gt - s.lastSqueak < Q.playerGapS) { note('skip', 'squeak: same player'); return false; }
      if (A.squeaks.length >= Q.perSecond) { note('skip', 'squeak: floor window'); return false; }
      if (why != null && !R.chance(why)) { note('skip', 'squeak: odds'); return false; }
      s.lastSqueak = gt; A.squeaks.push(now);
      return true;
    }
    function onPlant(a, f, v) {
      const s = st(a), { sp, brake, turn } = forces(a);
      if (Bus.wants('anim.plant')) Bus.emit('anim.plant', { pid: a.id, team: a.team, ref: a.kind === 'ref', foot: f.side ? 'R' : 'L', x: f.x, y: f.y, speed: sp, brake, turn, mode: f.mode || null });
      if (!onFloor(a)) return;
      const gt = v.time, isRef = a.kind === 'ref', mass = massOf(a);
      // a footstep: running bodies only (walking is left silent), heavier for bigger bodies
      const S = K.step;
      if (sp >= S.minSpeed && (!isRef || S.refs > 0)) {
        let e = lerp(S.eMin, S.eMax, clamp01((sp - S.minSpeed) / (S.fullSpeed - S.minSpeed))) * Math.pow(mass, S.massK);
        if (isRef) e *= S.refs;
        if (e >= S.minE) queue({ name: 'step', gt, e, mass, x: f.x, y: f.y, z: 0, pid: a.id, team: a.team, src: 'speed ' + sp.toFixed(1) });
        else note('skip', 'step: quiet');
      }
      // a squeak: a hard plant only
      const Q = K.squeak;
      if (isRef && !Q.refs) return;
      const acc = Math.hypot(brake, turn), vr = recentSpeed(s, gt, sp);
      // a defender going sideways to the way the body faces (the animation's slide): its push-off is a slide's chirp
      const sliding = DEF[a.stance] && (f.mode === 'step' || sideways(a, sp) >= Q.slideSideways);
      let kind = null, e = 0, odds = 0;
      if (sp < Q.pivotMaxSpeed && vr < Q.pivotMaxSpeed * 2 && s.yaw > Q.pivotYawRate) { kind = 'pivot'; e = clamp01((s.yaw - Q.pivotYawRate) / Q.pivotYawRate); odds = Q.pivotChance; }
      else if (sliding && vr >= Q.slideMinSpeed && acc >= Q.slideMinAccel) {
        // a slide: a hard push from jogging speed (a change of direction) as likely as a hard cut, a slide step at
        // speed now and then
        kind = 'slide';
        if (acc >= Q.minAccel && vr >= Q.minSpeed) { e = clamp01((acc - Q.minAccel) / (Q.fullAccel - Q.minAccel)); odds = lerp(Q.chanceMin, Q.chanceMax, e); e = lerp(0.6, 1, e); }
        else { e = clamp01((acc - Q.slideMinAccel) / (Q.minAccel - Q.slideMinAccel)) * 0.6; odds = Q.slideChance; }
      } else if (acc >= Q.minAccel && (turn > brake ? sp : vr) >= Q.minSpeed) {
        // a cut at jogging speed or faster, or a stop out of it (by then the body may already be slower)
        kind = turn > brake ? 'cut' : 'stop'; e = clamp01((acc - Q.minAccel) / (Q.fullAccel - Q.minAccel)); odds = lerp(Q.chanceMin, Q.chanceMax, e);
      }
      if (!kind) return;
      e = Math.max(Q.eMin, clamp01(e * Math.pow(mass, Q.massK)));
      if (!squeakGate(s, gt, odds)) return;
      queue({ name: 'squeak', kind, gt, e, x: f.x, y: f.y, z: 0, pid: a.id, team: a.team, src: `${f.mode || ''} speed ${sp.toFixed(1)}${vr > sp + 0.5 ? ' (was ' + vr.toFixed(1) + ')' : ''} brake ${brake.toFixed(1)} turn ${turn.toFixed(1)}${kind === 'pivot' ? ' yaw ' + s.yaw.toFixed(1) : ''}${a.stance ? ' ' + a.stance : ''}` });
    }
    function onLand(a, f, v) {
      const s = st(a), { sp, brake, turn } = forces(a);
      if (Bus.wants('anim.land')) Bus.emit('anim.land', { pid: a.id, team: a.team, ref: a.kind === 'ref', foot: f.side ? 'R' : 'L', x: f.x, y: f.y, speed: sp, brake, turn, mode: 'land' });
      if (!onFloor(a) || a.kind === 'ref') return;
      const L = K.land, gt = v.time;
      if (gt - s.lastLand < L.pairS) return;   // (the other foot of the same landing)
      s.lastLand = gt;
      const h = s.peak; s.peak = 0;
      if (!(h >= L.hMin)) { note('skip', 'land: low hop'); return; }
      const mass = massOf(a), e = lerp(L.eMin, L.eMax, clamp01((h - L.hMin) / (L.hMax - L.hMin))) * Math.pow(mass, L.massK);
      queue({ name: 'land', gt, e, mass, x: a.x, y: a.y, z: 0, pid: a.id, team: a.team, src: 'jump ' + h.toFixed(1) + ' ft' });
      // landing on the move (a layup): both feet skid (a jump stop's own landing: see its clip in pollBodies)
      const Q = K.squeak;
      if (sp >= Q.jumpStopSpeed && squeakGate(s, gt, Q.jumpStopChance)) queue({ name: 'squeak', kind: 'jumpstop', gt, e: Math.max(Q.eMin, clamp01(sp / 20)), x: a.x, y: a.y, z: 0, pid: a.id, team: a.team, src: 'landing on the move at ' + sp.toFixed(1) });
    }
    function onCatch(a, d, v) {
      if (Bus.wants('anim.catch')) Bus.emit('anim.catch', { pid: a ? a.id : null, team: a ? a.team : null, x: d.x, y: d.y, z: d.z, from: d.from || null });
      const b = v.ball, K2 = K.catch;
      const spd = b ? Math.hypot(b.vx || 0, b.vy || 0, b.vz || 0) : 20;
      let e = lerp(K2.eMin, K2.eMax, clamp01((spd - K2.vMin) / (K2.vMax - K2.vMin)));
      if (d.from === 'loose' && spd < 8) e *= K2.looseSoft;
      queue({ name: 'catch', gt: v.time, e, x: d.x, y: d.y, z: d.z, pid: a ? a.id : null, team: a ? a.team : null, src: 'ball ' + spd.toFixed(0) + ' ft/s' + (d.from === 'loose' && spd < 8 ? ' (a loose ball, picked up)' : '') });
    }
    function onPass(a, d, v) {
      if (Bus.wants('anim.pass')) Bus.emit('anim.pass', { pid: a ? a.id : null, team: a ? a.team : null, x: d.x, y: d.y, z: d.z, dur: d.dur, bounce: d.bounce });
      const b = v.ball, s0 = b && b.segs && b.segs[0], P = K.pass;
      const spd = s0 ? Math.hypot(s0.v0[0], s0.v0[1], s0.v0[2]) : 30;
      queue({ name: 'pass', gt: v.time, e: lerp(0.3, 1, clamp01((spd - P.vMin) / (P.vMax - P.vMin))), level: P.level, whoosh: spd >= P.whooshSpeed, x: d.x, y: d.y, z: d.z, pid: a ? a.id : null, team: a ? a.team : null, src: 'ball ' + spd.toFixed(0) + ' ft/s' + (d.bounce ? ' bounce pass' : '') });
    }

    // ------------------------------------------------------------ the ball
    const V3 = [0, 0, 0];
    /** the segment the ball just entered (in _enterSeg the index has already moved to it) */
    const segOf = (b) => (b && b.segs ? b.segs[b.segI] : null);
    /** the ball's velocity coming into the segment it just entered: the end of the one before */
    function inVel(b) {
      const prev = b.segs && b.segI > 0 ? b.segs[b.segI - 1] : null;
      if (prev && b._segVel) { try { return b._segVel(prev, prev.t1, V3); } catch (e) { /* fall through */ } }
      V3[0] = b.vx || 0; V3[1] = b.vy || 0; V3[2] = b.vz || 0;
      return V3;
    }
    function netAt(v, b, s, late) {
      const p = s.p0;
      if (A.dunk && s.t0 - A.dunk.t < 1.2) { queue({ name: 'dunk', gt: late ? v.time : s.t0, e: 1, x: p[0], y: p[1], z: p[2], pid: A.dunk.pid, src: 'through the rim' }); A.dunk = null; return; }
      queue({ name: s.swish ? 'swish' : 'net', gt: late ? v.time : s.t0, e: 1, x: p[0], y: p[1], z: p[2], src: s.swish ? 'nothing but net' : 'in off the rim' + (late ? ' (heard late)' : '') });
    }
    // what the court says as it happens (during its steps)
    const ON = {
      dribble(lv, b, a, v) {
        const d = b && b.dr, pl = d && d.plan;
        let gt = v.time, top = null, vi = null, per = null;
        if (pl && d.curPeriod > 0 && pl.uB != null) {
          per = d.curPeriod;
          const Tn = PBC.Match && PBC.Match.Tune, h = Tn && Tn.clock ? Tn.clock.step : 1 / 60;
          gt = (b.time != null ? b.time : v.time) - Math.min(h, Math.max(0, (d.u - pl.uB) * per));
          top = pl.top; vi = pl.vRel != null && pl.g != null && pl.tD != null ? pl.vRel + pl.g * pl.tD : null;
        }
        queue({ name: 'dribble', gt, x: b.x, y: b.y, z: 0, top, vi, per, move: d && d.move && d.moveStarted ? d.move.type : null, pid: a ? a.id : null, team: a ? a.team : null });
      },
      bounce(lv, b, a, v) {
        const s = segOf(b);
        if (s) { if (A.seen.has(s)) return; A.seen.add(s); }
        const p = s ? s.p0 : [b.x, b.y, b.z], gt = s ? s.t0 : v.time;
        // above the floor this is the ball meeting a hand in the air: a block's slap, or nothing
        if (p[2] > K.bounce.airZ) {
          if (A.block && gt - A.block.t < 1) { queue({ name: 'block', gt, e: 1, x: p[0], y: p[1], z: p[2], pid: A.block.pid, src: "the blocker's hand" }); A.block = null; }
          else note('skip', 'bounce: in the air');
          return;
        }
        const vin = s ? inVel(b) : [0, 0, -Math.abs(b.vz || 10)];
        queue({ name: 'bounce', gt, vz: Math.abs(vin[2]), x: p[0], y: p[1], z: 0, src: 'down at ' + Math.abs(vin[2]).toFixed(1) + ' ft/s' });
      },
      rim(lv, b, a, v) {
        const s = segOf(b);
        if (!s || A.seen.has(s)) return;
        A.seen.add(s);
        const p = s.p0, gt = s.t0;
        if (s.orbit) { queue({ name: 'rimroll', gt, e: clamp01(Math.abs(s.orbit.w || 5) / 6), T: s.orbit.T, x: p[0], y: p[1], z: p[2], src: 'round the rim ' + (s.orbit.T || 0).toFixed(2) + ' s' }); return; }
        const vin = inVel(b), spd = Math.hypot(vin[0], vin[1], vin[2]);
        const n = (A.rimHits.get(b.segs) || 0) + 1; A.rimHits.set(b.segs, n);
        let part = 'side', along = 0;
        const hoop = b.shotHoop, o = b.segs[0] && b.segs[0].p0;
        if (s.soft) part = 'soft';
        else if (n > 1) part = 'rattle';
        else if (hoop && o) {
          let ux = hoop.rx - o[0], uy = hoop.ry - o[1];
          const ul = Math.hypot(ux, uy) || 1; ux /= ul; uy /= ul;
          along = (p[0] - hoop.rx) * ux + (p[1] - hoop.ry) * uy;
          part = along < K.rim.frontFt ? 'front' : along > K.rim.backFt ? 'back' : 'side';
        }
        queue({ name: 'rim', part, gt, spd, x: p[0], y: p[1], z: p[2], src: `${part} at ${spd.toFixed(0)} ft/s${part === 'front' || part === 'back' || part === 'side' ? ' (' + along.toFixed(2) + ' ft along the shot)' : ''}` });
      },
      board(lv, b, a, v) {
        const s = segOf(b);
        if (!s || A.seen.has(s)) return;
        A.seen.add(s);
        const vin = inVel(b), spd = Math.hypot(vin[0], vin[1], vin[2]);
        queue({ name: 'board', gt: s.t0, spd, x: s.p0[0], y: s.p0[1], z: s.p0[2], src: 'glass at ' + spd.toFixed(0) + ' ft/s' });
      },
      // (the court says 'swish' / 'net' as the ball leaves the net; the sound starts as it enters, from frame(): only
      // a segment frame() never saw is sounded here, late)
      swish(lv, b, a, v) { const s = segOf(b); if (s && s.score && !A.seen.has(s)) { A.seen.add(s); netAt(v, b, s, true); } },
      net(lv, b, a, v) { ON.swish(lv, b, a, v); },
      dunk(lv, b, sh, v) { A.dunk = { t: v.time, pid: sh ? sh.id : null }; },
      block(lv, b, bl, v) { A.block = { t: v.time, pid: bl ? bl.id : null }; },
      whistle(lv, at, who, v) {
        // who blew it: the official whose signal just started (the court starts the signal right before the whistle)
        let ref = null, call = 'other';
        for (const r of v.refs || []) {
          const cs = r.upper || r.clip, nm = cs && cs.clip && cs.clip.name;
          if (nm && CALL[nm] && (cs.t || 0) < 0.15) { ref = r; call = CALL[nm]; break; }
        }
        const b = v.ball;
        if (!ref && v.nearestRef && b) ref = v.nearestRef(b.x, b.y);
        queue({ name: 'whistle', gt: v.time, call, x: ref ? ref.x : b ? b.x : 47, y: ref ? ref.y : 25, z: K.whistle.mouthZ, pid: ref ? ref.id : null, src: call + (ref ? '' : ' (no official found)') });
      },
      horn(lv, at, who, v) {
        const clk = v.clock ? +v.clock() : 0;
        if (clk > 0.05) {
          // the shot clock ran out with the game clock still going: its buzzer, over the basket the offense attacks
          const off = v.director && v.director.off === 1 ? 1 : 0;
          let right = off === 0;
          try { if (v.attacksRight) right = !!v.attacksRight(off, v.period); } catch (e) { /* default */ }
          queue({ name: 'buzzer', gt: v.time, e: 1, x: right ? 90.5 : 3.5, y: 25, z: K.buzzer.z, src: 'shot clock, game clock ' + clk.toFixed(1) });
        } else { A.hornAt = mx.now(); queue({ name: 'horn', gt: v.time, e: 1, center: true, src: 'end of the period' }); }
      },
    };

    // ------------------------------------------------------------ every frame: what the court does not announce
    function pollBall(v) {
      const b = v.ball;
      if (!b) return;
      const segs = b.segs;
      if (segs && segs !== A.ballSegs) { A.ballSegs = segs; A.ballIdx = 0; }
      if (segs) {
        // every segment entered since the last frame, in order (at speed several go by in one frame)
        for (let i = A.ballIdx + 1; i <= b.segI && i < segs.length; i++) {
          const s = segs[i];
          if (A.seen.has(s)) continue;
          if (s.score) { A.seen.add(s); netAt(v, b, s, false); }
          else if (s.roll) { A.seen.add(s); rollAt(b, s); }
        }
        A.ballIdx = Math.max(A.ballIdx, b.segI);
      }
      // a roll ends when the ball leaves it (picked up, kicked away)
      if (A.roll && (b.segs !== A.roll.segs || segOf(b) !== A.roll.seg || b.state === 'held' || b.state === 'dribble')) {
        if (A.roll.voice) mx.stop(A.roll.voice, 0.05);
        A.roll = null;
      }
      if (A.dunk && v.time - A.dunk.t > 1.5) A.dunk = null;
      if (A.block && v.time - A.block.t > 1.5) A.block = null;
    }
    function rollAt(b, s) {
      const vh = Math.hypot(s.v0[0], s.v0[1]);
      if (vh < K.roll.minSpeed) { note('skip', 'roll: too slow'); return; }
      const T = Math.max(0.2, Math.min(s.t1 - s.t0, vh / (s.a || 5)));
      queue({ name: 'roll', gt: s.t0, e: clamp01(vh / K.roll.fullSpeed), v0: vh, T, x: s.p0[0], y: s.p0[1], z: 0, seg: s, segs: b.segs, src: 'rolling at ' + vh.toFixed(1) + ' ft/s for ' + T.toFixed(1) + ' s' });
    }
    function clipEvent(a, cs, name) {
      let seen = A.clipSeen.get(cs);
      if (!seen) { seen = {}; A.clipSeen.set(cs, seen); }
      if (seen[name] || !cs.fired || !cs.fired[name]) return null;
      seen[name] = true;
      const at = cs.clip.events ? cs.clip.events[name] : null;
      return at == null ? 0 : Math.max(0, (cs.t || 0) - at);
    }
    function pollBodies(v) {
      const gt = v.time, list = [];
      const all = [];
      for (const id in v.actors || {}) all.push(v.actors[id]);
      for (const r of v.refs || []) all.push(r);
      for (const a of all) {
        if (!a || a.hidden) continue;
        const s = st(a);
        // turning on the spot (a pivot): the facing's rate, smoothed
        if (s.face != null && gt > s.faceT) { const w = Math.abs(wrapPi(a.facing - s.face)) / (gt - s.faceT); s.yaw += (w - s.yaw) * 0.5; }
        s.face = a.facing; s.faceT = gt;
        // its speed lately (for a stop's squeak)
        s.vs.push([gt, a.speed || 0]);
        while (s.vs.length && gt - s.vs[0][0] > K.squeak.recentS) s.vs.shift();
        // how high a jump went (for its landing)
        if ((a.jumpZ || 0) > K.land.airZ) s.peak = Math.max(s.peak, a.jumpZ);
        if (a.kind !== 'player' || !onFloor(a)) continue;
        list.push(a);
        // a fall's floor contact, a charge's collision, a post-up's bump, a jab step, a jump stop's landing
        const cs = a.clip;
        if (cs && cs.clip && cs.fired) {
          const nm = cs.clip.name;
          let ago;
          if (nm === 'fall') {
            if ((ago = clipEvent(a, cs, 'contact')) != null) bodyHit(a, null, gt - ago, 0.9, 'bump', 'charge');
            if ((ago = clipEvent(a, cs, 'floor')) != null) queue({ name: 'fall', gt: gt - ago, e: K.fall.level, mass: massOf(a), x: a.x, y: a.y, z: 0, pid: a.id, team: a.team, src: 'down on the floor' });
          } else if (nm === 'backdown') {
            if ((ago = clipEvent(a, cs, 'bump')) != null) bodyHit(a, null, gt - ago, 0.7, 'post', 'backing down');
          } else if (nm === 'jumpStop') {
            // a jump stop: the hop lands on both feet as the clip's own steps (not a jump's landing), still moving
            if ((ago = clipEvent(a, cs, 'land')) != null) {
              const Q = K.squeak, vr = recentSpeed(s, gt, a.speed || 0);
              if (vr >= Q.jumpStopSpeed && squeakGate(s, gt - ago, Q.jumpStopChance)) queue({ name: 'squeak', kind: 'jumpstop', gt: gt - ago, e: Math.max(Q.eMin, clamp01(vr / 20)), x: a.x, y: a.y, z: 0, pid: a.id, team: a.team, src: 'jump stop at ' + vr.toFixed(1) });
            }
          } else if (nm === 'jab') {
            if ((ago = clipEvent(a, cs, 'jab')) != null) {
              queue({ name: 'step', gt: gt - ago, e: 0.55 * Math.pow(massOf(a), K.step.massK), mass: massOf(a), x: a.x, y: a.y, z: 0, pid: a.id, team: a.team, src: 'jab step' });
              if (squeakGate(s, gt - ago, 0.6)) queue({ name: 'squeak', kind: 'stop', gt: gt - ago, e: 0.45, x: a.x, y: a.y, z: 0, pid: a.id, team: a.team, src: 'jab step' });
            }
          }
        }
        // knocked off balance by a hit (the court's own collision response): one sound for the two bodies in it
        if (a.hit && a.hit !== s.hit) {
          s.hit = a.hit;
          const hs = +a.hit.s || 0;
          if (hs >= 3) {
            let other = null, od = 3.5;
            for (const id in v.actors) { const b = v.actors[id]; if (b && b !== a && !b.hidden && b.kind === 'player') { const d = Math.hypot(b.x - a.x, b.y - a.y); if (d < od) { od = d; other = b; } } }
            if (other) st(other).hit = other.hit;   // (its side of the same hit)
            bodyHit(a, other, gt, clamp01((hs - 3) / 9), null, 'hit at ' + hs.toFixed(1) + ' ft/s');
          }
        }
      }
      // two players coming into contact
      const B = K.body;
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i], b = list[j];
          const dx = b.x - a.x, dy = b.y - a.y;
          if (Math.abs(dx) > 4 || Math.abs(dy) > 4) { const k0 = a.id < b.id ? a.id + ':' + b.id : b.id + ':' + a.id, p0 = A.pairs.get(k0); if (p0) p0.on = false; continue; }
          const d = Math.hypot(dx, dy), rs = (a.H + b.H) * 0.15 * B.radiusK;
          const key = a.id < b.id ? a.id + ':' + b.id : b.id + ':' + a.id;
          let p = A.pairs.get(key);
          if (!p) { p = { on: false, last: -1e9 }; A.pairs.set(key, p); }
          if (d < rs) {
            if (!p.on) {
              const nx = dx / (d || 1), ny = dy / (d || 1), vn = ((a.vx || 0) - (b.vx || 0)) * nx + ((a.vy || 0) - (b.vy || 0)) * ny;
              const kind = a.stance === 'screen' || b.stance === 'screen' ? 'screen' : a.stance === 'boxout' || b.stance === 'boxout' ? 'boxout' : a.stance === 'postUp' || b.stance === 'postUp' || a.stance === 'postD' || b.stance === 'postD' ? 'post' : 'bump';
              // (a box-out is a slow push into the man: heard from a lower closing speed)
              const minC = kind === 'boxout' && B.boxoutMinClosing != null ? B.boxoutMinClosing : B.minClosing;
              if (vn >= minC && gt - p.last >= B.pairGapS) {
                if (bodyHit(a, b, gt, clamp01((vn - minC) / (B.fullClosing - minC)), kind, 'closing at ' + vn.toFixed(1) + ' ft/s')) p.last = gt;
              } else if (vn < minC) note('skip', 'body: soft ' + kind + (vn >= 2 ? ' 2-' + minC + ' ft/s' : ' under 2 ft/s'));
            }
            p.on = true;
          } else if (d > rs * 1.15) p.on = false;
        }
      }
    }
    function bodyHit(a, b, gt, e, kind, why) {
      const B = K.body, sa = st(a), sb = b ? st(b) : null;
      if (gt - sa.lastBody < B.playerGapS || (sb && gt - sb.lastBody < B.playerGapS)) { note('skip', 'body: same player'); return false; }
      sa.lastBody = gt; if (sb) sb.lastBody = gt;
      if (!kind) kind = a.stance === 'screen' ? 'screen' : a.stance === 'boxout' ? 'boxout' : a.stance === 'postUp' || a.stance === 'postD' ? 'post' : 'bump';
      queue({ name: 'body', kind, gt, e: Math.max(0.15, e), x: b ? (a.x + b.x) / 2 : a.x, y: b ? (a.y + b.y) / 2 : a.y, z: 4, pid: a.id, team: a.team, src: kind + ', ' + why + (b ? ' with #' + b.id : '') });
      return true;
    }

    // ------------------------------------------------------------ playing
    const CENTER = { pan: 0, db: 0, lp: 20000, wet: 0.25 };
    /** the physics of a heard contact → the sound's parameters */
    function params(h) {
      const D = K.dribble;
      switch (h.name) {
        case 'dribble': {
          const e = h.vi == null ? 0.7 : lerp(D.eMin, D.eMax, clamp01((h.vi - D.vMin) / (D.vMax - D.vMin)));
          const low = h.top == null ? 0.5 : clamp01((D.topHigh - h.top) / (D.topHigh - D.topLow));
          const quick = h.per == null ? 0.5 : clamp01((D.periodSlow - h.per) / (D.periodSlow - D.periodQuick));
          return { e, tight: D.heightShare * low + (1 - D.heightShare) * quick, surf: floorAt(h.x, h.y) };
        }
        case 'bounce': { const Bn = K.bounce; return { e: lerp(Bn.eMin, Bn.eMax, clamp01((h.vz - Bn.vMin) / (Bn.vMax - Bn.vMin))), surf: floorAt(h.x, h.y) }; }
        case 'rim': { const Rm = K.rim; let e = lerp(Rm.eMin, Rm.eMax, clamp01((h.spd - Rm.vMin) / (Rm.vMax - Rm.vMin))); if (h.part === 'soft') e = Math.min(e, Rm.softE); if (h.part === 'rattle') e *= Rm.rattleE; return { e, part: h.part, variant: h.part }; }
        case 'board': { const Bo = K.board; return { e: lerp(Bo.eMin, Bo.eMax, clamp01((h.spd - Bo.vMin) / (Bo.vMax - Bo.vMin))) }; }
        case 'squeak': return { e: h.e, kind: h.kind, variant: h.kind };
        case 'body': return { e: h.e, kind: h.kind, variant: h.kind };
        case 'whistle': { const L = K.whistle.len[h.call] || K.whistle.len.other; return { e: 1, len: lerp(L[0], L[1], R.random()), variant: h.call }; }
        case 'roll': { const f = floorAt(h.x, h.y); return { e: h.e, T: h.T, v0: h.v0, surf: f.zone === 'courtside' ? f : null }; }
        default: return { e: h.e == null ? 1 : h.e, mass: h.mass, T: h.T, v0: h.v0, whoosh: h.whoosh, level: h.level };
      }
    }
    function playHit(h, when, v, late) {
      let pl = h.center ? CENTER : place(v, h.x, h.y, h.z);
      const p = params(h);
      if (p.surf) {
        // the floor's own level and, courtside, its muffle (on top of the camera's placement)
        pl = pl ? Object.assign({}, pl) : { pan: 0, db: 0, lp: 20000, wet: 0 };
        pl.db += p.surf.db;
        if (p.surf.lp) pl.lp = Math.min(pl.lp, p.surf.lp);
      }
      const data = { v: Math.round((p.e == null ? 1 : p.e) * 100) / 100, x: h.x, y: h.y, z: h.z, pid: h.pid, team: h.team, gt: Math.round(h.gt * 1000) / 1000, dly: Math.round((h.dly || 0) * 1000), when };
      if (late != null) data.late = Math.round(late * 1000);
      if (h.kind || h.part || h.call) data.kind = h.kind || h.part || h.call;
      if (p.surf) data.floor = p.surf.zone;
      if (p.tight != null) data.tight = Math.round(p.tight * 100) / 100;
      if (h.top != null) data.top = Math.round(h.top * 100) / 100;
      if (h.per != null) data.per = Math.round(h.per * 1000) / 1000;
      if (h.src) data.src = h.src;
      if (pl) data.pl = [Math.round(pl.pan * 100) / 100, Math.round(pl.db * 10) / 10];
      Bus.emit('court.' + h.name, data, () => {
        const vo = synth.play(h.name, p, { when, place: pl, force: h.force });
        if (vo) note('played', h.name);
        if (h.name === 'roll' && vo) A.roll = { voice: vo, seg: h.seg, segs: h.segs };
      });
    }
    function flush(v, ts, rate) {
      if (!A.q.length) return;
      const S = K.sync, now = mx.now(), list = A.q;
      A.q = [];
      list.sort((a, b) => a.gt - b.gt);
      // footsteps: the floor's budget a second of audio time; the loudest (and nearest the camera) go first
      const T = K.step;
      if (A.tokenT == null) A.tokenT = now;
      A.tokens = Math.min(T.perSecond, A.tokens + (now - A.tokenT) * T.perSecond); A.tokenT = now;
      const steps = list.filter((h) => h.name === 'step');
      if (steps.length) {
        for (const h of steps) { const pl = place(v, h.x, h.y, 0); h.rank = h.e * (pl ? Math.pow(10, pl.db / 20) : 1); }
        steps.sort((a, b) => b.rank - a.rank);
        const keep = Math.floor(A.tokens);
        for (let i = 0; i < steps.length; i++) { if (i < keep) { A.tokens -= 1; } else { steps[i].cut = true; note('skip', 'step: floor budget'); } }
      }
      for (const h of list) {
        if (h.cut) continue;
        let d = rate > 1e-4 ? (h.gt - ts) / rate : 0;
        if (d < -S.staleS) { note('skip', h.name + ': stale'); continue; }
        const late = d < 0 ? -d : null;
        d = Math.max(0, Math.min(S.maxAheadS, d + S.avOffsetMs / 1000));
        // the floor's squeaks, counted again when they will be heard (a squeak let through as its plant happened can
        // still sound a frame later than the one before it: the window is what the ear gets)
        if (h.name === 'squeak') {
          const at = now + d, Q = K.squeak;
          while (A.sqHeard.length && A.sqHeard[0] <= at - 1) A.sqHeard.shift();
          if (A.sqHeard.length >= Q.perSecond) { note('skip', 'squeak: floor window (heard)'); continue; }
          A.sqHeard.push(at);
        }
        h.dly = d;
        playHit(h, now + d, v, late);
      }
    }
    function frame(dtReal) {
      if (A.destroyed) return;
      const v = viewOf();
      // (the broadcast court only: the retro court keeps no game time or camera to hear it by, text mode has no court)
      if (!v || !mx.ctx || typeof v.time !== 'number' || !v.cam || typeof v.cam.project !== 'function') { A.q.length = 0; return; }
      if (v.replay) { A.q.length = 0; A.lastShow = null; return; }
      const ts = showTime(v);
      // game seconds a real second: the game's speed, or measured while the animation tools run their own clock
      let rate = speedOf();
      if (v.debug) rate = A.lastShow != null && dtReal > 0 ? Math.max(0, (ts - A.lastShow) / dtReal) : 0;
      A.lastShow = ts;
      try { pollBall(v); } catch (e) { console.error('court audio: ball', e); }
      try { pollBodies(v); } catch (e) { console.error('court audio: bodies', e); }
      flush(v, ts, rate);
    }

    // ------------------------------------------------------------ public
    const api = {
      /** the view's onSound (through the host): a contact as the court makes it */
      sound(name, lv, at, who) {
        if (A.destroyed) return;
        const v = viewOf();
        if (!v || v.replay) return;
        const f = ON[name];
        if (!f) { note('skip', name + ': unknown'); return; }
        try { f(lv, at, who, v); } catch (e) { console.error('court audio ' + name, e); }
      },
      /** the view's onCue (through the host): plant, land, catch, pass */
      cue(type, a, d) {
        if (A.destroyed) return;
        const v = viewOf();
        if (!v || v.replay || !d) return;
        try {
          if (type === 'plant') onPlant(a, d, v);
          else if (type === 'land') onLand(a, d, v);
          else if (type === 'catch') onCatch(a, d, v);
          else if (type === 'pass') onPass(a, d, v);
        } catch (e) { console.error('court audio ' + type, e); }
      },
      frame,
      /** the game's end: the horn over the arena, unless the period's horn is still sounding */
      finalHorn() {
        if (mx.now() - A.hornAt < K.hornFinalS) return null;
        A.hornAt = mx.now();
        let vo = null;
        Bus.emit('court.horn', { v: 1, src: 'end of the game' }, () => { vo = synth.play('horn', { e: 1 }, { place: CENTER, force: true }); });
        return vo;
      },
      /** tests and the console: play a court sound at a spot now (p: its physics, as params() makes them) */
      test(name, p, x, y, z, o) {
        const v = viewOf();
        const pl = x == null ? null : place(v, x, y, z || 0);
        return synth.play(name, p || {}, Object.assign({ place: pl || undefined }, o || {}));
      },
      place: (x, y, z) => place(viewOf(), x, y, z),
      floorAt,
      synth,
      stats: () => JSON.parse(JSON.stringify(A.stats)),
      destroy() {
        A.destroyed = true;
        if (A.roll && A.roll.voice) mx.stop(A.roll.voice, 0.02);
        A.q.length = 0;
      },
    };
    return api;
  }

  PBC.CourtAudio = { create };
})();
