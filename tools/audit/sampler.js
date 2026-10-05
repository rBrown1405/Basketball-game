/* Gameplay audit sampler: loaded into index.html by tools/audit/run.js.
 * window.PBCAudit.playGame(seed) makes a league from the seed, opens its first user game in the Live view and plays
 * it from the tip to the final buzzer headless (no rendering), exactly as the Live view plays it. It watches every
 * player: every frame for the ball (catches, passes, shots, rebounds) and every 0.1 s for positions, and returns
 * counts and examples of the behaviour the report checks. Nothing in the game is changed; the ball's give / pass /
 * shoot are wrapped on this one ball only to see when they happen.
 *
 * Coordinates in the examples are (u, v): u = feet from the baseline the offense attacks, v = feet from the near
 * sideline (the rim is at u 5.25, v 25).
 */
(function () {
  'use strict';
  const TAU = Math.PI * 2;
  const wrapPi = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
  const DT = 1 / 60, EVERY = 6, SDT = DT * EVERY; // positions every 0.1 s
  const LIVE_BEATS = { pass: 1, set: 1, screen: 1, move: 1, handoff: 1, shot: 1, advance: 1, step: 1 };
  const ZONES = ['rim', 'paint', 'short', 'mid', 'corner3', 'arc3', 'deep'];
  const isZone = (s) => /zone|boxone/.test(s || '');
  const bucket3 = (r) => (r < 40 ? '<40' : r < 50 ? '40-49' : r < 60 ? '50-59' : r < 70 ? '60-69' : r < 80 ? '70-79' : '80+');
  const inc = (o, k, n) => { o[k] = (o[k] || 0) + (n == null ? 1 : n); };
  const r1 = (x) => Math.round(x * 10) / 10;

  /** plays drawn in the play designer's format (js/ui/playdesigner.js), as a coach would draw them */
  function addDrawnPlays(PBC, S) {
    const PB = PBC.Playbook;
    const TOP = [30.5, 25], WING_L = [23, 7], WING_R = [23, 43], CORNER_L = [2.5, 2], CORNER_R = [2.5, 48], ELBOW_L = [19, 17], ELBOW_R = [19, 33], BLOCK_L = [7.5, 17], BLOCK_R = [7.5, 33];
    const P = (p1, p2, p3, p4, p5) => ({ p1: { role: p1[0], at: p1[1] }, p2: { role: p2[0], at: p2[1] }, p3: { role: p3[0], at: p3[1] }, p4: { role: p4[0], at: p4[1] }, p5: { role: p5[0], at: p5[1] } });
    let n = 0;
    const A = (a) => Object.assign({ id: 'a' + (++n) }, a);
    const defs = {
      my_1: { name: 'Audit Elbow Roll', kind: 'half', family: 'auto', tags: ['ato'], ball: 'p1',
        players: P(['pnr', TOP], ['shooter', WING_R], ['spacer', WING_L], ['screener', CORNER_L], ['spacer', CORNER_R]),
        steps: [{ acts: [A({ t: 'move', p: 'p4', to: ELBOW_L }), A({ t: 'move', p: 'p2', to: [8, 47] })] },
          { acts: [A({ t: 'screen', p: 'p4', on: 'p1' }), A({ t: 'dribble', p: 'p1', to: [26, 35] }), A({ t: 'move', p: 'p4', to: [6, 23] })] }] },
      my_2: { name: 'Audit Floppy', kind: 'half', family: 'auto', tags: [], ball: 'p1',
        players: P(['handler', TOP], ['shooter', [4, 25]], ['spacer', WING_L], ['screen2', BLOCK_R], ['screener', BLOCK_L]),
        steps: [{ acts: [A({ t: 'screen', p: 'p4', on: 'p2' }), A({ t: 'move', p: 'p2', to: WING_R })] },
          { acts: [A({ t: 'pass', p: 'p1', to: 'p2' })] }] },
      my_3: { name: 'Audit Give and Go', kind: 'half', family: 'auto', tags: [], ball: 'p1',
        players: P(['handler', [30, 18]], ['scorer', WING_L], ['spacer', WING_R], ['spacer', CORNER_R], ['dunker', [3, 36]]),
        steps: [{ acts: [A({ t: 'pass', p: 'p1', to: 'p2' }), A({ t: 'move', p: 'p1', to: [6, 22] })] },
          { acts: [A({ t: 'pass', p: 'p2', to: 'p1' })] }] },
      my_4: { name: 'Audit Box Lob', kind: 'blob', family: 'blob', tags: [], ball: 'p3',
        players: P(['handler', ELBOW_L], ['shooter', BLOCK_R], ['inbounder', [-1.5, 17]], ['dunker', BLOCK_L], ['screen2', ELBOW_R]),
        steps: [{ acts: [A({ t: 'screen', p: 'p5', on: 'p2' }), A({ t: 'move', p: 'p2', to: [2.5, 47] }), A({ t: 'move', p: 'p4', to: [4, 23] }), A({ t: 'move', p: 'p1', to: [30, 25] })] }] },
    };
    S.customPlays = {};
    for (const id in defs) S.customPlays[id] = Object.assign({ id, desc: '', reads: {}, seq: n }, defs[id]);
    // and a library play the coach made their own
    S.customPlays.my_5 = Object.assign(PB.defFromPlay(PB.get('hornsTwist'), 'my_5'), { name: 'Audit Horns Twist' });
    PB.syncCustom(S);
    const book = PB.ensure(S, S.userTid);
    for (const id in S.customPlays) if (PB.get(id) && !book.off.includes(id)) book.off.push(id);
    book.auto = false;
  }

  function playGame(seed, opt) {
    opt = opt || {};
    if (window.__reseed) window.__reseed((seed * 2654435761) >>> 0 || 1);
    const PBC = window.PBC;
    const S = PBC.League.create({ leagueKey: opt.league || 'men', seed });
    S.userTid = 0; PBC.Coach.create(S, 'Audit Coach', 0); PBC.League.preseasonProjections(S); PBC.AI.autoRotation(S, 0);
    S.teams[0].rot.auto = true; PBC.UI.setState(S); PBC.Season.startRegularSeason(S); PBC.Season.prepareToday(S);
    const ug = PBC.Season.userGameToday(S) || PBC.Season.advanceToUserGame(S);
    Object.assign(S.settings, { gameIntro: false, replays: false, commentary: false, tvGraphics: false, gimEnabled: false, arenaSound: opt.audio !== false });
    // the coach's calls (Phase 4, --calls 1): plays drawn on the whiteboard go into the user's playbook, and the
    // coach calls plays, inbound plays and defensive schemes during the game (below)
    const CALLS = !!opt.calls;
    if (CALLS) addDrawnPlays(PBC, S);
    PBC.UI.go('live', { gid: ug.gid });
    const LG = PBC.UI._liveDebug.state();
    LG.alive = false; cancelAnimationFrame(LG.raf);
    const v = LG.view, g = LG.g, b = v.ball, d = v.director;
    v.onSound = null; v.opts.record = false;
    const L = g.L, THREE = L.threePt || { arc: 23.75, corner: 22 };

    // ------------------------------------------------------------ who is who
    const info = {};
    g.t.forEach((T, ti) => T.players.forEach((c) => {
      const r = c.r || c.p.r;
      info[c.id] = { t: ti, name: c.name, pos: c.pos, arch: c.p.arch || '', hgt: c.hgt, ovr: c.p.ovr, three: r.three, mid: r.mid, close: r.close, layup: r.layup, dunk: r.dunk, post: r.post, perD: r.perD, helpD: r.helpD, intD: r.intD };
    }));
    const big = (id) => { const p = info[id]; return !!p && (p.pos === 'C' || p.pos === 'PF'); };
    const stretch = (id) => { const p = info[id]; return !!p && (/Stretch/.test(p.arch) || p.three >= 70); };
    const posKey = (id) => { const p = info[id]; if (!p) return '?'; if (big(id)) return p.pos + (stretch(id) ? ' (stretch)' : ''); return p.pos; };

    // ------------------------------------------------------------ geometry (u, v from the attacked basket)
    const uv = (a) => ({ u: d.U_(a.x), v: a.y });
    const rimDist = (a) => Math.hypot(a.x - d.rim.x, a.y - d.rim.y);
    const beyondArc = (p) => (p.u < 14 ? Math.abs(p.v - 25) >= THREE.corner : Math.hypot(p.u - 5.25, p.v - 25) >= THREE.arc);
    const zoneOf = (a) => {
      const p = uv(a), dr = Math.hypot(p.u - 5.25, p.v - 25);
      if (dr < 4) return 'rim';
      if (Math.abs(p.v - 25) <= 8 && p.u <= 19) return 'paint';
      if (beyondArc(p)) return dr >= 28 ? 'deep' : p.u < 14 ? 'corner3' : 'arc3';
      if (p.u < 10) return 'short';
      return 'mid';
    };
    const rating = (id, a) => { const p = info[id]; if (!p) return 50; const dr = rimDist(a); return beyondArc(uv(a)) ? p.three : dr > 12 ? p.mid : Math.max(p.close, p.layup); };
    const nearestDef = (a) => { let best = null, bd = 1e9; for (const id of v.onCourt[d.def]) { const o = v.actor(id); if (!o) continue; const q = Math.hypot(o.x - a.x, o.y - a.y); if (q < bd) { bd = q; best = o; } } return { a: best, d: bd }; };
    const clockStr = () => { const c = Math.max(0, d.clock()); const m = Math.floor(c / 60), s = Math.floor(c - m * 60); return 'Q' + (d.period || g.period) + ' ' + m + ':' + String(s).padStart(2, '0'); };
    const snap = (flags) => {
      const pl = [];
      for (const t of [d.off, d.def]) for (const id of v.onCourt[t]) { const a = v.actor(id); if (!a) continue; const p = uv(a); pl.push([String(id), t === d.off ? 'o' : 'd', r1(p.u), r1(p.v), r1(a.vx * (d.dir > 0 ? -1 : 1)), r1(a.vy), Math.round(((a.facing * 180 / Math.PI) + 360) % 360), info[id] ? info[id].pos : '']); }
      const bp = uv(b);
      return { players: pl, ball: [r1(bp.u), r1(bp.v)], holder: b.holder ? String(b.holder.id) : null, flags: flags || {}, dir: d.dir, matchup: Object.assign({}, d.matchup) };
    };

    // ------------------------------------------------------------ results
    const R = {
      seed, teams: [g.t[0].abbr || (S.teams[g.tids[0]] || {}).abbr, g.t[1].abbr || (S.teams[g.tids[1]] || {}).abbr],
      strat: [0, 1].map((i) => { const s = g.t[i].strat || {}; return { off: s.off, def: s.def }; }),
      poss: 0, frames: 0, stuck: 0, samplerErrors: 0, warns: {}, schemes: {}, systems: {}, plays: {},
      hc: { n: 0 },
      onball: { n: 0, man: 0, between: 0, beaten: 0, lowStance: 0, upright: 0, backTurned: 0, turnAway: 0, backpedal: 0, retreat: 0, runClose: 0, far: 0, cushion: {}, eps: { retreat: [], turnAway: [], far: [] } },
      offball: { n: 0, one: 0, deny: 0, two: 0, help: 0, sag: 0, sees: 0, tightTwo: 0, rimHelp: 0, crowd: 0, path: 0, abandoned: 0, crowd3: 0, eps: { crowd: [], abandoned: [] } },
      idle: { offSec: 0, stillSec: 0, loiterSec: 0, jobs: {}, jobByPos: {}, noJobZone: {}, noJobSpot: {}, byPos: {}, eps: { '2-3': 0, '3-5': 0, '5-8': 0, '8+': 0 }, epsByZone: {}, loiterByZone: {}, clumpSec: 0, pairClose: 0 },
      spacing: { n: 0, byPos: {}, nOut: [0, 0, 0, 0, 0, 0], noInside: 0, fiveOut: 0 },
      openOff: { n: 0, found: 0, sec: 0 }, shots: [], catches: [], rebounds: [], boxouts: [], gives: { catch: [], rebound: [], steal: [], other: [] }, hang: [],
      examples: [], players: {}, causes: {},
      // called plays (js/core/playbook.js): the engine's records, how close the players get to the play's spots, and
      // the pick-and-roll coverage the court's defenders actually play
      pb: { poss: 0, withCall: 0, calls: 0, ends: {}, early: 0, done: 0, steps: 0, stepsOf: 0, byPlay: {}, byFam: {}, byBase: {}, flow: { n: 0, pts: 0 }, all: { n: 0, pts: 0 }, cov: {}, reads: {}, inb: { n: 0, safety: 0 }, spot: { n: 0, lt2: 0, lt5: 0, lt10: 0, far: 0 }, covSeen: {},
        // the head coach's calls (Phase 4): the coach's own calls, the drawn plays (the coach's or the staff's calls)
        user: { n: 0, pts: 0, done: 0, early: 0, to: 0 }, mine: { n: 0, pts: 0, done: 0, early: 0, to: 0 }, spotMine: { n: 0, lt2: 0, lt5: 0, lt10: 0, far: 0 } },
      calls: null,
    };
    if (CALLS) R.calls = { made: 0, used: 0, inbMade: 0, inbUsed: 0, defMade: 0, defPoss: 0, defHonored: 0, covPoss: 0, covHonored: 0, defEnded: 0, defReverted: 0 };
    const ex = {}; const EX_MAX = 2;
    const example = (kind, text, flags) => { if ((ex[kind] = (ex[kind] || 0) + 1) > EX_MAX) return; R.examples.push({ kind, seed, poss: cur && cur.n, when: clockStr(), text, snap: snap(flags) }); };

    // console warnings from the match code ([match] ...)
    const cw = console.warn;
    console.warn = function (...a) { try { if (a[0] === '[match]') inc(R.warns, String(a[1]).slice(0, 60)); } catch (e) { /* */ } return cw.apply(console, a); };

    // ------------------------------------------------------------ ball hooks (this ball only)
    const proto = Object.getPrototypeOf(b), TMP = new Float64Array(3), TMP2 = new Float64Array(3);
    let lastSegs = null, lastSegsT = -1;
    let lastFlight = null, catchRec = null, missRec = null, looseSince = null;
    b.pass = function (p1, dur, o) { lastFlight = { kind: 'pass', from: this.holder, t: v.time, swing: !!d.swing, beat: d.beat && !d.beat.fired ? d.beat.type : null }; if (catchRec && catchRec.a === this.holder && !catchRec.out) { catchRec.out = 'pass'; catchRec.passSwing = !!d.swing; } return proto.pass.call(this, p1, dur, o); };
    b.shoot = function (o) {
      const ev = d.lastShot;
      if (!lastFlight || lastFlight.kind !== 'shot' || lastFlight.ev !== ev) lastFlight = { kind: 'shot', ev, t: v.time, rim: 0, board: 0, floor: 0 };
      if (catchRec && ev && String(catchRec.id) === String(ev.shooter) && !catchRec.out) catchRec.out = 'shot';
      return proto.shoot.call(this, o);
    };
    b.loose = function (vel, o) { if (lastFlight && lastFlight.kind === 'shot') lastFlight.loosed = true; else lastFlight = { kind: 'loose', t: v.time }; return proto.loose.call(this, vel, o); };
    b._enterSeg = function (s) {
      const f = lastFlight;
      if (f && f.kind === 'shot') { if (s.rim) f.rim++; if (s.board) f.board++; if (s.bounce && !s.rim && !s.board && this.z < 1.5) f.floor++; }
      return proto._enterSeg.call(this, s);
    };
    b.give = function (actor, hold) {
      const prev = this.holder, bx = this.x, by = this.y, bz = this.z, st = this.state;
      const segs = this.segs || (this.time - lastSegsT < 0.05 ? lastSegs : null), last = segs && segs[segs.length - 1];
      const r = proto.give.call(this, actor, hold);
      if (!actor || actor === prev || actor.kind !== 'player') return r;
      try {
        const p = actor.heldBallPos(TMP);
        const jump = Math.hypot(p[0] - bx, p[1] - by, p[2] - bz), horiz = Math.hypot(actor.x - bx, actor.y - by);
        let bend = 0;
        if (last && last.target) { const e = proto._segPos.call(this, last, last.t1, TMP2), live = last.target(); if (live) bend = Math.hypot(live[0] - e[0], live[1] - e[1], live[2] - e[2]); }
        const f = lastFlight;
        let kind = 'other';
        if (f && f.kind === 'pass' && (st === 'flight' || st === 'loose') && (!prev || prev === f.from)) kind = 'catch';
        else if (f && f.kind === 'shot' && !prev) kind = 'rebound';
        else if (prev && prev.team !== actor.team) kind = 'steal';
        R.gives[kind].push([r1(jump), r1(bend)]);
        if (kind === 'rebound') {
          const hang = looseSince != null ? v.time - looseSince : 0;
          const ev = f.ev || {};
          R.rebounds.push({ id: String(actor.id), side: actor.team === d.off ? 'off' : 'def', jump: r1(jump), bend: r1(bend), horiz: r1(horiz), z: r1(bz), air: r1(v.time - f.t), hang: r1(hang), rim: f.rim, board: f.board, floor: f.floor, state: st, shotDist: ev.dist != null ? +ev.dist : null });
          if (jump > 3 || bend > 3) example('rebound_teleport', `${info[actor.id] ? info[actor.id].name : actor.id} secures the rebound: ${bend > 3 ? 'the carom bends ' + r1(bend) + ' ft in the air to reach his hands' : 'the ball jumps ' + r1(jump) + ' ft into his hands'} (grabbed ${r1(bz)} ft up${hang > 0.05 ? ', after hanging still in the air ' + r1(hang) + ' s' : ''}).`, { reb: String(actor.id) });
          lastFlight = null;
        }
        if (kind === 'catch') onCatch(actor, f);
      } catch (e) { R.samplerErrors++; }
      return r;
    };

    // ------------------------------------------------------------ catches: what an open shooter does with the ball
    function onCatch(a, f) {
      closeCatch('lost');
      openFound(String(a.id));
      if (!halfCourt() || a.team !== d.off) return;
      const nd = nearestDef(a), p = uv(a);
      const gd = d.guardOf(a.id), gl = gd && d.dtask[gd.id] && d.dtask[gd.id].until > d.T;
      catchRec = { a, id: String(a.id), t: v.time, open: r1(nd.d), rim: r1(rimDist(a)), three: beyondArc(p), rating: rating(a.id, a), sc: r1(d.shotClock()), u0: rimDist(a), out: null, passSwing: null, fromSwing: !!f.swing, snap: null,
        guard: gd ? r1(Math.hypot(gd.x - a.x, gd.y - a.y)) : null, guardJob: gd ? (gl ? 'locked' : (gd._dRole || (gd.goal && gd.goal.track === gd._defTrack ? 'tracker' : 'other'))) : 'none', scheme: d.scheme };
      if (nd.d >= 10 && catchRec.rating >= 70 && catchRec.sc > 4) catchRec.snap = snap({ catcher: String(a.id) });
    }
    function closeCatch(out) {
      const c = catchRec; if (!c) return;
      catchRec = null;
      const o = c.out || out;
      const held = v.time - c.t, drove = c.u0 - rimDist(c.a) > 6;
      R.catches.push({ id: c.id, open: c.open, rim: c.rim, three: c.three, rating: c.rating, sc: c.sc, out: o, held: r1(held), drove, swing: c.passSwing, fromSwing: c.fromSwing, guard: c.guard, guardJob: c.guardJob, scheme: c.scheme });
      if (o === 'pass' && c.snap && (ex.open_pass || 0) < EX_MAX) {
        ex.open_pass = (ex.open_pass || 0) + 1;
        const p = info[c.id] || {};
        R.examples.push({ kind: 'open_pass', seed, poss: cur && cur.n, when: clockStr(), text: `${p.name} (${p.pos}, ${c.three ? '3PT' : 'mid-range'} ${c.rating}) catches with the nearest defender ${c.open} ft away and ${c.sc} s on the shot clock, then passes it on after ${r1(held)} s${c.passSwing ? ' (a flow swing pass)' : ' (the engine\'s next pass)'}.`, snap: c.snap });
      }
    }

    // ------------------------------------------------------------ possession state
    let cur = null, prevOB = null, obEp = {}, stillT = {}, crowdT = {}, abandT = {}, trail = {}, openT = {}, openWait = {};
    const halfCourt = () => {
      if (!d.active || d.frozen || d.phase !== 'front' || d.ftSetup) return false;
      const h = b.holder;
      if (!h || h.team !== d.off || h.kind !== 'player' || (b.state !== 'held' && b.state !== 'dribble')) return false;
      if (d.U_(h.x) > 42 || d.U_(h.x) < 0.3 || h.y < 0.3 || h.y > 49.7) return false; // (an inbounder out of bounds)
      const bt = d.beat;
      return !(bt && !bt.fired && !LIVE_BEATS[bt.type]);
    };
    const endEp = (store, key, list, minDur, text) => {
      const e = store[key]; if (!e) return; store[key] = null;
      const dur = e.n * SDT; if (dur < minDur) return;
      list.push(r1(dur));
      if (text && e.snap && (ex[text.kind] || 0) < EX_MAX) { ex[text.kind] = (ex[text.kind] || 0) + 1; R.examples.push({ kind: text.kind, seed, poss: e.poss, when: e.when, text: text.fn(e, dur), snap: e.snap }); }
    };

    // what was moving a flagged defender at that moment: his defensive tracker (guardPos), another planner's move or
    // track, a clip; the engine beat under way; the handler's distance from the rim (counts by kind of flag)
    const cause = (X, h, tag) => {
      const g0 = X.goal || {}, tracker = g0.mode === 'track' && g0.track === X._defTrack;
      const lock = d.dtask[X.id] && d.dtask[X.id].until > d.T;
      const mover = (tracker ? 'defensive tracker' : g0.mode === 'track' ? 'other track' : g0.mode === 'move' ? 'planner move' : g0.mode || '?') + (lock ? ' (locked by a planner)' : '');
      const dr = rimDist(h), band = dr < 10 ? 'under 10 ft' : dr < 17 ? '10-17 ft' : dr < 23 ? '17-23 ft' : dr < 28 ? '23-28 ft' : dr < 35 ? '28-35 ft' : '35+ ft';
      const C = R.causes[tag] || (R.causes[tag] = { mover: {}, job: {}, beat: {}, shotCall: {}, handlerDist: {}, clip: {}, handlerClip: {}, scheme: {} });
      inc(C.job, X._dRole || 'none');
      const bt = d.beat && !d.beat.fired ? d.beat : null;
      inc(C.mover, mover); inc(C.beat, bt ? bt.type : 'none'); inc(C.handlerDist, band);
      if (bt && bt.type === 'shot') inc(C.shotCall, (bt.ev.contest || '?') + (String(bt.ev.shooter) === String(h.id) ? ' (his man shoots)' : ' (another shooter)'));
      inc(C.clip, X.clip && !X.clip.done ? X.clip.clip.name : 'none'); inc(C.handlerClip, h.clip && !h.clip.done ? h.clip.clip.name : 'none'); inc(C.scheme, d.scheme || '?');
    };
    function sample() {
      const hc = halfCourt();
      const h = b.holder;
      if (!hc) {
        prevOB = null;
        for (const k in obEp) endOB(k);
        for (const k in stillT) endStill(k);
        for (const k in openT) openEnd(k, false);
        trail = {};
        for (const k in crowdT) endEp(crowdT, k, R.offball.eps.crowd, 0.3, EP_TEXT.crowd);
        for (const k in abandT) endEp(abandT, k, R.offball.eps.abandoned, 0.5, EP_TEXT.abandoned);
        return;
      }
      R.hc.n++;
      if (R.hc.n === 600 || R.hc.n === 2400 || R.hc.n === 4800) R.examples.push({ kind: 'moment', seed, poss: cur && cur.n, when: clockStr(), text: 'A half-court moment (' + (d.scheme || 'man') + ' defense, ' + ((cur && cur.sys) || 'balanced') + ' offense).', snap: snap({}) });
      const scheme = d.scheme, zone = isZone(scheme);
      const rim = d.rim, dRimH = rimDist(h), driving = d.driving(h);
      const hid = String(h.id);
      // ---- on-ball: his man's defender (man schemes), the nearest defender in a zone
      let D = null;
      if (!zone) { for (const k in d.matchup) if (String(d.matchup[k]) === hid) { D = v.actor(k); break; } }
      if (!D) D = nearestDef(h).a;
      if (D) {
        const OB = R.onball;
        OB.n++; if (!zone) OB.man++;
        const dx = D.x - h.x, dy = D.y - h.y, dist = Math.hypot(dx, dy) || 0.01;
        const rx = rim.x - h.x, ry = rim.y - h.y, rl = Math.hypot(rx, ry) || 1;
        const along = (dx * rx + dy * ry) / rl, cosB = along / dist;
        const between = cosB > 0.5, beaten = along < -1;
        if (between) OB.between++;
        if (beaten) OB.beaten++;
        const low = D.stance === 'defense' || D.stance === 'defenseWide';
        if (low) OB.lowStance++; else if (D.stance === 'ready' || D.stance === 'stand') OB.upright++;
        const toH = Math.atan2(-dy, -dx), faceOff = Math.abs(wrapPi(D.facing - toH));
        const backTurned = faceOff > 1.75;
        if (backTurned) OB.backTurned++;
        const vAway = (D.vx * dx + D.vy * dy) / dist; // his own speed away from the handler
        const sep = prevOB && prevOB.D === D && prevOB.h === h ? (dist - prevOB.dist) / SDT : 0;
        const slowH = h.speed < 4;
        const backdown = h.stance === 'postUp' || (h.clip && !h.clip.done && /backdown/.test(h.clip.clip.name));
        const retreat = !beaten && slowH && sep > 2.5 && vAway > 2 && dRimH < 32 && !backdown;
        const hIn = (h.vx * rx + h.vy * ry) / rl; // the handler's speed toward the rim: running with a driver is fine
        const turnAway = !beaten && backTurned && D.speed > 1.5 && vAway > 1 && dRimH < 32 && hIn < 5;
        if (retreat) { OB.retreat++; if (!backTurned) OB.backpedal++; cause(D, h, 'retreat'); }
        if (turnAway) { OB.turnAway++; cause(D, h, 'turnAway'); }
        if (D._runMode && dist < 10 && !beaten) OB.runClose++;
        const far = dist > 10 && dRimH < 28 && !beaten;
        if (far) OB.far++;
        if (dRimH >= 22 && dRimH < 30 && info[hid]) { const k = bucket3(info[hid].three), c = OB.cushion[k] || (OB.cushion[k] = [0, 0]); c[0] += dist; c[1]++; }
        epStep(obEp, 'retreat', retreat, { D: String(D.id), h: hid, d0: dist });
        epStep(obEp, 'turnAway', turnAway, { D: String(D.id), h: hid, d0: dist });
        epStep(obEp, 'far', far, { D: String(D.id), h: hid, d0: dist });
        for (const k of ['retreat', 'turnAway', 'far']) if (obEp[k]) obEp[k].d1 = dist;
        prevOB = { D, h, dist };
      }
      // ---- off-ball defenders (man schemes)
      if (!zone) {
        const OF = R.offball;
        let near10 = 0;
        const hSide = Math.sign(h.y - 25);
        for (const id of v.onCourt[d.def]) {
          const X = v.actor(id); if (!X) continue;
          if (Math.hypot(X.x - h.x, X.y - h.y) < 10) near10++;
          const M = v.actor(d.matchup[id]);
          if (!M || M === h || X === D) { crowdStep(String(id), false); abandStep(String(id), false); continue; }
          OF.n++;
          const dMan = Math.hypot(X.x - M.x, X.y - M.y), dBallM = Math.hypot(M.x - h.x, M.y - h.y);
          // (the ball in the middle of the floor: both wings are one pass away)
          const twoAway = dBallM > 28 || (Math.abs(h.y - 25) > 4 && Math.sign(M.y - 25) !== hSide && Math.abs(M.y - 25) > 6 && dBallM > 16);
          if (!twoAway) {
            OF.one++;
            // deny: in the passing lane, between the ball and his man (the last ~45 % of the way), close to the man
            const lx = M.x - h.x, ly = M.y - h.y, ll = Math.hypot(lx, ly) || 1;
            const t = ((X.x - h.x) * lx + (X.y - h.y) * ly) / (ll * ll), perp = Math.abs((X.x - h.x) * ly - (X.y - h.y) * lx) / ll;
            if (t > 0.55 && t < 1.05 && perp < 4.5 && dMan < 7) OF.deny++;
          } else {
            OF.two++;
            // help side: sagged toward the rim from his man (not glued to him) and able to see man and ball
            const mx = rim.x - M.x, my = rim.y - M.y, ml = Math.hypot(mx, my) || 1;
            const tr = ((X.x - M.x) * mx + (X.y - M.y) * my) / (ml * ml);
            const aM = Math.atan2(M.y - X.y, M.x - X.x), aB = Math.atan2(h.y - X.y, h.x - X.x);
            const sees = Math.abs(wrapPi(aM - aB)) < 2.6;
            if (sees) OF.sees++;
            if (tr > 0.2 && tr < 0.85) OF.sag++;
            // help position: in or next to the lane ("a foot in the paint") or on the line from the ball to the rim
            const xu = d.U_(X.x), bxl = rim.x - h.x, byl = rim.y - h.y, bl = Math.hypot(bxl, byl) || 1;
            const tb = U01(((X.x - h.x) * bxl + (X.y - h.y) * byl) / (bl * bl));
            if ((Math.abs(X.y - 25) <= 11 && xu <= 22) || Math.hypot(X.x - (h.x + bxl * tb), X.y - (h.y + byl * tb)) < 5) OF.help++;
            if (dMan < 3.5 && !d.inPaint(M, -2)) { OF.tightTwo++; cause(X, h, 'tightTwo'); } // (a man in the lane area is where the help is anyway)
          }
          // crowding: an extra defender on the ball (his man far away, the ball already guarded, no drive to help on)
          const dH = Math.hypot(X.x - h.x, X.y - h.y);
          const guarded = D && Math.hypot(D.x - h.x, D.y - h.y) < 7;
          const nearRim = dRimH < 12;
          // (two on the ball because the coverage says so: the two defenders of the last ball screen or hand-off, for
          // 2.5 s after it: a hedge, a show, a blitz or ice, then getting back to his man)
          const covTwo = covWin && d.T - covWin.t < 2.5 && covWin.ids[String(id)];
          const crowd = dH < 6 && dMan > 8 && guarded && !driving && !nearRim && !covTwo;
          if (crowd) {
            OF.crowd++; cause(X, h, 'crowd');
            // (staying there: his own spot is on the ball; else passing by on his way to a spot away from it)
            const tg = X._dTgt;
            if (tg && d.T - tg.T < 0.2 && Math.hypot(tg.x - h.x, tg.y - h.y) < 6) OF.crowdStay = (OF.crowdStay || 0) + 1;
          }
          const hx = rim.x - h.x, hy = rim.y - h.y, hl = Math.hypot(hx, hy) || 1;
          const inPath = !driving && !nearRim && dH < 8 && ((X.x - h.x) * hx + (X.y - h.y) * hy) / (hl * dH || 1) > 0.8 && dMan > 8;
          if ((dH < 6 && dMan > 8 && guarded && !driving && !nearRim || inPath) && covTwo) OF.covTwo = (OF.covTwo || 0) + 1;
          if (dH < 6 && dMan > 8 && nearRim) OF.rimHelp++;
          if (inPath && !covTwo) OF.path++;
          // abandoned: far from his man and neither helping (lane / between ball and rim) nor on the ball
          const segT = U01(((X.x - h.x) * hx + (X.y - h.y) * hy) / (hl * hl)), sx = h.x + hx * segT, sy = h.y + hy * segT;
          // (a drive's rotation, the low man in front of the rim or the man sinking to the low man's man, is help)
          const helping = d.inPaint(X, -2) || Math.hypot(X.x - sx, X.y - sy) < 6 || dH < 8 || X._dRole === 'sink' || X._dRole === 'lowman';
          // (his man just came off an off-ball screen: the screen did its job, he is chasing)
          const screened = screenedT[String(M.id)] != null && d.T - screenedT[String(M.id)] < 2.2;
          const aband = dMan > 12 && !helping && d.U_(M.x) < 40 && !screened;
          if (aband) { OF.abandoned++; cause(X, h, 'abandoned'); }
          if (dMan > 12 && !helping && d.U_(M.x) < 40 && screened) OF.screenedOff = (OF.screenedOff || 0) + 1;
          crowdStep(String(id), crowd, { X: String(id), h: hid, m: String(M.id) });
          abandStep(String(id), aband, { X: String(id), m: String(M.id), dMan });
        }
        if (near10 >= 3 && !driving) OF.crowd3++;
      } else inc(R.offball, 'zoneN');
      // ---- offense: standing still, spacing by position
      const SP = R.spacing; SP.n++;
      let nOut = 0, inside = 0;
      const offs = v.onCourt[d.off].map((id) => v.actor(id)).filter(Boolean);
      for (const a of offs) {
        const id = String(a.id), pk = posKey(id), z = zoneOf(a);
        const bp = SP.byPos[pk] || (SP.byPos[pk] = { n: 0 }); bp.n++; inc(bp, z);
        if (z === 'corner3' || z === 'arc3' || z === 'deep') nOut++;
        if (rimDist(a) < 12) inside++;
        if (a === h) { trail[id] = null; openEnd(id, true); continue; }
        // his job right now: an engine event's move (screen, cut, catch), a half-court flow action, a clip, or holding
        // a spot; a spot is spacing only beyond the arc (or, for a big, by the rim), anywhere else he has no job
        const r = d.role[a.id];
        let job = a.isBusy() ? 'clip' : !r ? 'spot' : r.mode === 'locked' || r.until > d.T ? 'engine' : r.path ? 'flow' : 'spot';
        if (job === 'spot' && r && r.phase === 'out') job = 'flow'; // (a v-cut: dip in, come back out)
        if (job === 'spot' && r && r.pb && d.pbRun) job = 'play'; // (holding or moving around his spot in a called play)
        if (job === 'spot') {
          // judged by where he is going: on his way to a spot (3+ ft from it), by that spot; at it, by where he stands
          let zz = z, rd = rimDist(a);
          if (r && r.spot) { const tx = r.spot.x + (r.jx || 0), ty = r.spot.y + (r.jy || 0); if (Math.hypot(tx - a.x, ty - a.y) > 3 && a.speed > 3) { const q = { x: tx, y: ty }; zz = zoneOf(q); rd = rimDist(q); } }
          job = zz === 'corner3' || zz === 'arc3' || (zz === 'deep' && rd < 31) ? 'spacing' : big(id) && !stretch(id) && (zz === 'rim' || zz === 'paint' || zz === 'short') ? 'spacing' : 'none';
        }
        { const J = R.idle.jobs, jp = R.idle.jobByPos[pk] || (R.idle.jobByPos[pk] = {}); inc(J, job, SDT); inc(jp, job, SDT);
          if (job === 'none') { inc(R.idle.noJobZone, z, SDT); inc(R.idle.noJobSpot, (r && r.phase === 'out' ? 'v-cut ' : '') + ((r && r.spotName) || '?') + ' @' + z, SDT); } }
        // a wide-open shooter off the ball (nearest defender 10+ ft, rated 70+ for a shot from there, within 26 ft)
        const ndA = nearestDef(a);
        if (ndA.d >= 10 && rimDist(a) <= 26 && rating(a.id, a) >= 70 && d.shotClock() > 4) { const o = openT[id] || (openT[id] = { n: 0, snap: null, poss: cur && cur.n, when: clockStr(), r: rating(a.id, a), z }); o.n++; if (o.n === 10) o.snap = snap({ open: id, handler: hid }); }
        else openEnd(id, false);
        const I = R.idle; I.offSec += SDT; I.speedSum = (I.speedSum || 0) + Math.min(a.speed, 30) * SDT; if (a.speed >= 6) I.jogSec = (I.jogSec || 0) + SDT;
        const ip = I.byPos[pk] || (I.byPos[pk] = [0, 0]); ip[1] += SDT;
        let nn = 99; for (const o of offs) if (o !== a) nn = Math.min(nn, Math.hypot(o.x - a.x, o.y - a.y));
        if (nn < 6) I.pairClose += SDT / 2;
        const tr3 = trail[id] || (trail[id] = []);
        tr3.push(a.x, a.y); if (tr3.length > 60) tr3.splice(0, 2);
        let loiter = false;
        if (tr3.length === 60) { let mx = 0; for (let k = 0; k < 60; k += 2) mx = Math.max(mx, Math.hypot(tr3[k] - a.x, tr3[k + 1] - a.y)); loiter = mx < 3; }
        if (loiter) { I.loiterSec += SDT; ip[2] = (ip[2] || 0) + SDT; const lz = I.loiterByZone[z] || (I.loiterByZone[z] = {}); inc(lz, pk, SDT); }
        if (a.speed < 1 && !a.isBusy()) {
          I.stillSec += SDT; ip[0] += SDT;
          if (nn < 8) I.clumpSec += SDT;
          const s = stillT[id] || (stillT[id] = { n: 0, z, pk, nn, poss: cur && cur.n, when: clockStr(), snap: null });
          s.n++;
          if (s.n === 30) s.snap = snap({ still: id });
        } else endStill(id);
      }
      SP.nOut[nOut]++; if (nOut === 5) SP.fiveOut++; if (!inside) SP.noInside++;
    }
    const U01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
    function epStep(store, key, on, o) {
      if (on) {
        const e = store[key] || (store[key] = Object.assign({ n: 0, poss: cur && cur.n, when: clockStr(), snap: null }, o));
        e.n++;
        if (e.n === 4) e.snap = snap({ [key]: e.D || e.X, handler: e.h });
      } else endOB(key);
    }
    const endOB = (key) => endEp(obEp, key, R.onball.eps[key], key === 'far' ? 1 : 0.3, EP_TEXT[key]);
    function crowdStep(id, on, o) {
      if (on) { const e = crowdT[id] || (crowdT[id] = Object.assign({ n: 0, poss: cur && cur.n, when: clockStr(), snap: null }, o)); e.n++; if (e.n === 4) e.snap = snap({ crowd: id, handler: o.h }); }
      else endEp(crowdT, id, R.offball.eps.crowd, 0.3, EP_TEXT.crowd);
    }
    function abandStep(id, on, o) {
      if (on) { const e = abandT[id] || (abandT[id] = Object.assign({ n: 0, poss: cur && cur.n, when: clockStr(), snap: null }, o)); e.n++; if (e.n === 6) e.snap = snap({ lost: id, man: o.m }); }
      else endEp(abandT, id, R.offball.eps.abandoned, 0.5, EP_TEXT.abandoned);
    }
    // (a stretch that ends unfound waits 0.6 s: the pass to him may already be in the air when his man closes out)
    function openEnd(id, found) {
      const o = openT[id]; if (!o) return; openT[id] = null;
      if (o.n * SDT < 1) return;
      if (found) openFinal(o, id, true);
      else { o.endT = v.time; openWait[id] = o; }
    }
    function openFlush(all) {
      for (const id in openWait) { const o = openWait[id]; if (o && (all || v.time - o.endT > 0.6)) { openWait[id] = null; openFinal(o, id, false); } }
    }
    function openFound(id) {
      if (openT[id]) openEnd(id, true);
      else if (openWait[id]) { const o = openWait[id]; openWait[id] = null; openFinal(o, id, true); }
    }
    function openFinal(o, id, found) {
      const dur = o.n * SDT;
      const W = R.openOff; W.n++; if (found) W.found++; W.sec += dur;
      if (!found && dur >= 2 && o.snap && (ex.open_ignored || 0) < EX_MAX) {
        ex.open_ignored = (ex.open_ignored || 0) + 1;
        const p = info[id] || {};
        R.examples.push({ kind: 'open_ignored', seed, poss: o.poss, when: o.when, text: `${p.name} (${p.pos}, rated ${o.r} from there) is wide open (nobody within 10 ft) for ${r1(dur)} s and never gets the ball.`, snap: o.snap });
      }
    }
    function endStill(id) {
      const s = stillT[id]; if (!s) return; stillT[id] = null;
      const dur = s.n * SDT; if (dur < 2) return;
      const I = R.idle;
      inc(I.eps, dur < 3 ? '2-3' : dur < 5 ? '3-5' : dur < 8 ? '5-8' : '8+');
      if (dur >= 3) { const zz = I.epsByZone[s.z] || (I.epsByZone[s.z] = {}); inc(zz, s.pk); }
      if (dur >= 5 && s.snap && (ex.still || 0) < EX_MAX) {
        ex.still = (ex.still || 0) + 1;
        const p = info[id] || {};
        const where = { rim: 'at the rim', paint: 'in the paint', short: 'in the short corner', mid: 'in the mid-range', corner3: 'in the corner', arc3: 'at the arc', deep: 'well beyond the arc' }[s.z] || '';
        R.examples.push({ kind: 'still', seed, poss: s.poss, when: s.when, text: `${p.name} (${p.pos}) stands still for ${r1(dur)} s ${where} while his team runs its half-court offense.`, snap: s.snap });
      }
    }
    const nm = (id) => (info[id] ? info[id].name + ' (' + info[id].pos + ')' : id);
    const EP_TEXT = {
      retreat: { kind: 'retreat', fn: (e, dur) => `${nm(e.D)} backs away from ${nm(e.h)} for ${r1(dur)} s while the ball handler is not attacking (gap ${r1(e.d0)} -> ${r1(e.d1)} ft).` },
      turnAway: { kind: 'turn_away', fn: (e, dur) => `${nm(e.D)} turns his back on the ball handler ${nm(e.h)} and walks away for ${r1(dur)} s (gap ${r1(e.d0)} -> ${r1(e.d1)} ft).` },
      far: { kind: 'far', fn: (e, dur) => `${nm(e.D)} is more than 10 ft off the ball handler ${nm(e.h)} inside 28 ft for ${r1(dur)} s.` },
      crowd: { kind: 'crowd', fn: (e, dur) => `${nm(e.X)} leaves his man ${nm(e.m)} to crowd the ball handler ${nm(e.h)} for ${r1(dur)} s (the ball is already guarded, 12+ ft from the rim, no drive).` },
      abandoned: { kind: 'abandoned', fn: (e, dur) => `${nm(e.X)} is more than 12 ft from his man ${nm(e.m)} for ${r1(dur)} s without being in a help spot.` },
    };

    // ------------------------------------------------------------ engine events (shots) and box-outs
    // ------------------------------------------------------------ called plays
    function pbRecord(P, pts) {
      const pb = R.pb;
      const half = P.play !== 'transition' && P.play !== 'putback' && P.play !== 'none';
      if (!half && !P.pbs.length) return;
      // half-court possessions: with a call or played in flow (points of the whole possession)
      pb.poss++; pb.all.n++; pb.all.pts += pts;
      if (P.pbs.length) pb.withCall++; else { pb.flow.n++; pb.flow.pts += pts; }
      for (const r of P.pbs) {
        pb.calls++;
        inc(pb.ends, r.end || '?');
        const got = (o) => { o.n++; o.pts += r.pts || 0; if (r.early) o.early++; if (r.end === 'shot' || r.end === 'safety') o.done++; if (r.end === 'turnover') o.to++; };
        if (r.user) got(pb.user);
        if (/^my_/.test(r.id)) got(pb.mine);
        const fam = r.family || '?';
        const bp = pb.byPlay[r.id] || (pb.byPlay[r.id] = { n: 0, pts: 0, early: 0, done: 0, name: r.name, fam });
        const bf = pb.byFam[fam] || (pb.byFam[fam] = { n: 0, pts: 0, early: 0, done: 0 });
        bp.n++; bf.n++; bp.pts += r.pts || 0; bf.pts += r.pts || 0;
        if (r.base) { const bb = pb.byBase[r.base] || (pb.byBase[r.base] = { n: 0, pts: 0 }); bb.n++; bb.pts += r.pts || 0; }
        if (fam === 'blob' || fam === 'slob') { pb.inb.n++; if (r.end === 'safety') pb.inb.safety++; }
        if (r.early) { pb.early++; bp.early++; bf.early++; }
        // got to its read (early or at the end) = the play worked through; a turnover or a foul stopped it
        if (r.end === 'shot' || r.end === 'safety') { pb.done++; bp.done++; bf.done++; }
        if (r.step >= 0 && r.last >= 0) { pb.steps += r.step + 1; pb.stepsOf += r.last + 1; }
        if (r.cov) inc(pb.cov, r.cov);
        if (r.opt) inc(pb.reads, (r.early ? 'early: ' : '') + r.opt);
      }
    }
    let pbSeen = null, pbCheckAt = -1, covChecks = [], covWin = null;
    const screenedT = {};
    function pbSample() {
      const run = d.pbRun;
      // (the screener's man before the screen fires: a switch swaps the matchups when it does)
      const bt = d.beat;
      if (bt && !bt.fired && bt.type === 'screen' && bt.ev && bt.ev.kind === 'ball' && bt.ev._audSd == null) {
        for (const id in d.matchup) { if (String(d.matchup[id]) === String(bt.ev.screener)) bt.ev._audSd = id; if (String(d.matchup[id]) === String(bt.ev.user)) bt.ev._audUd = id; }
      }
      if (run && !run.inbound && (!pbSeen || pbSeen.run !== run || pbSeen.k !== run.k) && run.k >= 0) { pbSeen = { run, k: run.k }; pbCheckAt = d.T + 1.2; }
      if (run && pbCheckAt > 0 && d.T >= pbCheckAt) {
        pbCheckAt = -1;
        for (const id in run.ids) {
          const r = d.role[id], a = v.actor(id);
          if (!r || !a || !r.pb || !r.spot || b.holder === a || a.isBusy() || r.until > d.T + 0.5) continue;
          const dd = Math.hypot(r.spot.x - a.x, r.spot.y - a.y);
          for (const sp of /^my_/.test(run.id) ? [R.pb.spot, R.pb.spotMine] : [R.pb.spot]) {
            sp.n++;
            if (dd < 2) sp.lt2++; else if (dd < 5) sp.lt5++; else if (dd < 10) sp.lt10++; else sp.far++;
          }
        }
      }
      // 0.6 s after a ball screen in a play: where the screener's man is (dropped, level, hedged above, trapping)
      for (let i = covChecks.length - 1; i >= 0; i--) {
        const c = covChecks[i];
        if (d.T < c.at) continue;
        covChecks.splice(i, 1);
        const sd = v.actor(c.sd), h = v.actor(c.h);
        if (!sd || !h) continue;
        const su = d.U_(sd.x), hu = d.U_(h.x);
        let k;
        if (String(d.matchup[c.sd]) === String(c.h)) k = 'switched';
        else if (Math.hypot(sd.x - h.x, sd.y - h.y) < 4.5) k = 'on the ball';
        else if (su < c.u - 5) k = 'back in the lane';
        else k = 'at the screen';
        const o = R.pb.covSeen[c.cov] || (R.pb.covSeen[c.cov] = {});
        inc(o, k);
      }
    }
    function onEvent(e) {
      if (e && e.type === 'screen') {
        // the defenders of a ball screen (for the crowding check), the man coming off an off-ball screen
        if (e.kind === 'ball') { covWin = { t: d.T, ids: {} }; if (e._audSd != null) covWin.ids[String(e._audSd)] = 1; if (e._audUd != null) covWin.ids[String(e._audUd)] = 1; }
        else screenedT[String(e.user)] = d.T;
      }
      if (e && e.type === 'handoff') {
        // the defenders of a hand-off: the giver's (on the ball until the hand-off) and the receiver's
        covWin = { t: d.T, ids: {} };
        for (const id in d.matchup) if (String(d.matchup[id]) === String(e.from) || String(d.matchup[id]) === String(e.to)) covWin.ids[String(id)] = 1;
      }
      if (e && e.type === 'screen' && e.kind === 'ball' && e.cov && d.pbRun) {
        const scr = v.actor(e.screener);
        const sd = e._audSd;
        if (scr && sd != null) covChecks.push({ at: d.T + 0.6, sd, h: e.user, cov: e.cov, u: d.U_(scr.x) });
      }
      if (!e || e.type !== 'shot' || e.pending) return;
      const sh = v.actor(e.shooter);
      const nd = sh ? nearestDef(sh) : { d: null };
      const p = info[e.shooter] || {};
      R.shots.push({ id: String(e.shooter), pos: p.pos, big: big(e.shooter), stretch: stretch(e.shooter), three: p.three, mid: p.mid, pts: e.pts, zone: e.zone, kind: e.kind, contest: e.contest, made: !!e.made, dist: e.dist, live: nd.d != null ? r1(nd.d) : null, sc: r1(d.shotClock()), clk: r1(d.clock()), play: cur && cur.play, sys: cur && cur.sys });
      if (e.pts === 3 && p.three < 50 && e.kind !== 'heave') example('bad_three', `${p.name} (${p.pos}, 3PT rating ${p.three}) takes a three (${e.contest}, ${e.made ? 'made' : 'missed'}).`, { shooter: String(e.shooter) });
      if (!e.made && !e.fouled && !e.blocked) {
        missRec = { t: v.time, ev: e };
        const t0 = v.time;
        d.at(d.T + 0.7, () => { if (missRec && missRec.t === t0) boxoutCheck(e); }, 'audit boxout');
      }
    }
    function boxoutCheck(e) {
      let boxing = 0, perim = 0, nearRim = 0, offNear = 0;
      for (const id of v.onCourt[d.def]) {
        const X = v.actor(id); if (!X) continue;
        if (rimDist(X) < 10) nearRim++;
        const M = v.actor(d.matchup[id]); if (!M) continue;
        const dMan = Math.hypot(X.x - M.x, X.y - M.y);
        const rx = d.rim.x - M.x, ry = d.rim.y - M.y, rl = Math.hypot(rx, ry) || 1;
        const along = ((X.x - M.x) * rx + (X.y - M.y) * ry) / rl;
        if (dMan < 4.5 && along > 0.5) { boxing++; if (rimDist(M) > 20) perim++; }
      }
      for (const id of v.onCourt[d.off]) { const a = v.actor(id); if (a && rimDist(a) < 10) offNear++; }
      R.boxouts.push({ boxing, perim, nearRim, offNear, shotDist: e.dist });
    }

    // ------------------------------------------------------------ play the game
    const t0 = performance.now();
    const u = g.userIdx >= 0 ? g.userIdx : 0, UT = g.t[u];
    const CALL_LIST = ['my_1', 'my_2', 'my_3', 'my_5'];
    let callK = 0;
    for (let guard = 0; guard < (opt.maxPoss || 600); guard++) {
      const s0 = g.score.slice();
      let dc = null;
      if (CALLS) {
        // a play for the next half-court possession every few possessions (drawn plays and the book's), an inbound
        // play for the next throw-in under the basket now and then, and two defensive calls a game
        if (!UT.userCall && guard % 4 === 1) {
          const bookIds = UT.pb ? UT.pb.plays.filter((p) => !p.inbound && !p.custom).map((p) => p.id) : [];
          const id = callK % 5 === 4 && bookIds.length ? bookIds[callK % bookIds.length] : CALL_LIST[callK % CALL_LIST.length];
          callK++;
          if (PBC.Sim.callPlay(g, u, id, 1) !== false) R.calls.made++;
        }
        if (guard % 30 === 5 && UT.pb && UT.pb.inb.blob.some((p) => p.id === 'my_4') && !(UT.userInb && UT.userInb.blob)) { PBC.Sim.callInbound(g, u, 'blob', 'my_4'); R.calls.inbMade++; }
        if (guard === 20 || guard === 90) {
          // man-to-man with a blitz on ball screens, then a 2-3 zone (a switch for a zone team)
          if (guard === 20) PBC.Sim.callDefense(g, u, 'man', 'blitz', 6);
          else PBC.Sim.callDefense(g, u, /zone|boxone/.test(UT.strat.def) ? 'switch' : 'zone23', null, 6);
          R.calls.defMade++;
        }
        dc = UT.defCall ? { def: UT.defCall.def, cov: UT.defCall.cov, left: UT.defCall.left, prev: UT.defCall.prev } : null;
        // the matchup orders (js/core/adjust.js, the huddle): deny their best, sag off their worst shooter, double their
        // best post scorer, and the best defender on their best; cleared after a while
        if (guard === 40 && PBC.Sim.setOrders) {
          const OT = g.t[1 - u], on = OT.on;
          const best = on.reduce((a, c) => (!a || c.p.ovr > a.p.ovr ? c : a), null);
          const poor = on.filter((c) => c !== best).reduce((a, c) => (!a || c.r.three < a.r.three ? c : a), null);
          const post = on.filter((c) => c !== best && c !== poor).reduce((a, c) => (!a || c.r.post > a.r.post ? c : a), null);
          const o = {}; if (best) o[best.id] = 'deny'; if (poor) o[poor.id] = 'sag'; if (post) o[post.id] = 'double';
          PBC.Sim.setOrders(g, u, o);
          const stopper = UT.on.reduce((a, c) => (!a || c.r.perD > a.r.perD ? c : a), null);
          if (best && stopper) PBC.Sim.setMatchups(g, u, { [best.id]: stopper.id });
          R.calls.orders = (R.calls.orders || 0) + 1;
        }
        if (guard === 160 && PBC.Sim.setOrders) { PBC.Sim.setOrders(g, u, null); PBC.Sim.setMatchups(g, u, null); }
      }
      const P = PBC.Sim.nextPossession(g);
      if (!P) break;
      if (CALLS) {
        if (P.userCall && P.off === u) { if (/^my_4$/.test(P.userCall) || (UT.pb && UT.pb.inb.blob.some((p) => p.id === P.userCall))) R.calls.inbUsed++; else R.calls.used++; }
        // (a defensive call counts down at the start of each defensive possession; at 0 the team goes back to its own)
        if (dc && P.off !== u && dc.left > 0) {
          R.calls.defPoss++;
          if (P.defScheme === dc.def) R.calls.defHonored++;
          if (dc.cov) { R.calls.covPoss++; if (P.defCov === dc.cov) R.calls.covHonored++; }
        } else if (dc && P.off !== u && dc.left === 0 && !UT.defCall) { R.calls.defEnded++; if (P.defScheme === dc.prev.def) R.calls.defReverted++; }
      }
      if (g.pending) PBC.Sim.resolvePending(g, P, { quality: 'good' });
      R.poss++;
      cur = { n: (P.n || 0) + 1, play: P.play || 'none', sys: P.offSystem, scheme: P.defScheme };
      if (P.pbs) pbRecord(P, g.score[P.off] - s0[P.off]);
      inc(R.schemes, P.defScheme || '?'); inc(R.systems, P.offSystem || '?'); inc(R.plays, P.play || 'none');
      let done = false;
      prevOB = null; lastFlight = null; catchRec = null; missRec = null; looseSince = null;
      v.play(P, { onEvent: (e) => { try { onEvent(e); } catch (err) { R.samplerErrors++; } }, onDone() { done = true; } });
      let i = 0;
      for (; i < 60 * 120 && !done; i++) {
        v.update(DT);
        R.frames++;
        try {
          // a ball left hanging in the air after a flight (loose, no flight segments, off the floor)
          if (b.state === 'loose' && !b.segs && b.z > 1.5) { if (looseSince == null) looseSince = v.time; }
          else if (b.state !== 'loose') { if (looseSince != null && lastFlight && lastFlight.kind === 'shot') R.hang.push(r1(v.time - looseSince)); looseSince = null; }
          if (catchRec && b.holder !== catchRec.a) closeCatch(b.state === 'flight' ? 'pass' : 'lost');
          if (b.segs) { lastSegs = b.segs; lastSegsT = b.time; }
          if (b.state === 'flight' && lastFlight && lastFlight.kind === 'pass' && b.passTarget && !lastFlight.tgt) { lastFlight.tgt = b.passTarget; openFound(String(b.passTarget.id)); }
          openFlush(false);
          if (i % EVERY === 0) { sample(); pbSample(); }
        } catch (err) { R.samplerErrors++; if (R.samplerErrors < 3) console.log('sampler', err && err.stack); }
      }
      if (!done) { R.stuck++; d.forceFinish(); }
      closeCatch('end');
      for (const k in openT) openEnd(k, false);
      openFlush(true);
    }
    console.warn = cw;
    R.ms = Math.round(performance.now() - t0);
    R.score = v.score ? v.score.slice() : null;
    R.engineScore = g.score.slice();
    R.final = !!g.final;
    // dribble combos (the dribble work, js/match/choreo.js comboPlan, defense.js defBite / ankleBreak): the chains, their
    // moves, what the man on the ball bought, the counters, the men broken down, the falls, the bursts out of a move he bought
    // (and the size-up's body: the rock steps with its moves, the retreats, the size-ups in place a handler probes with)
    { const dr = v.director; R.combo = { chains: dr.chains || 0, moves: dr.chainMoves || 0, bites: dr.bites || 0, counters: dr.counters || 0, breaks: dr.breaks || 0, falls: dr.falls || 0, breakdowns: dr.breakdowns || 0, rocks: dr.rocks || 0, retreats: dr.retreats || 0, sizeups: dr.probeSizeups || 0 }; }
    // the fast break's rim cuts (a wing ahead of the defense cutting to the rim) and the post fight (the back-down's shoves, the
    // fight for position before the entry, the post moves worked)
    { const dr = v.director; R.fight = { rimCuts: dr.rimCuts || 0, postShoves: dr.postShoves || 0, postFights: dr.postFights || 0, postMoves: dr.postLog ? dr.postLog.n || 0 : 0, postContacts: dr.postContacts || 0 }; }
    // play tracking (Phase 5, js/core/playstats.js): the game's tallies, to check them against the game itself
    const PSt = window.PBC.PlayStats;
    if (g.pstats && PSt) {
      R.track = {
        teams: g.pstats.map((a, i) => {
          const tot = new Array(Object.keys(PSt.F).length).fill(0);
          for (const id in a.p) a.p[id].forEach((x, j) => { tot[j] += x || 0; });
          const why = {}, at = { entry: 0, step: 0 };
          for (const id in a.b) for (const k in a.b[id]) { const [st, w] = k.split('|'); why[w] = (why[w] || 0) + a.b[id][k]; at[+st < 0 ? 'entry' : 'step'] += a.b[id][k]; }
          return { poss: a.poss, pts: a.pts, gamePoss: g.t[i].poss, gamePts: g.score[i], k: a.k, fl: a.fl, d: a.d, c: a.c, dt: a.dt, vc: a.vc, tot, why, at };
        }),
        logN: g.plog ? g.plog.length : 0,
        kb: [JSON.stringify(g.pstats).length / 1024, g.plog ? JSON.stringify(g.plog).length / 1024 : 0],
      };
    }
    // players who played (for the offender lists)
    g.t.forEach((T) => T.players.forEach((c) => { if (c.st && (c.st.fga || c.st.min || c.sec)) { const p = info[c.id]; R.players[c.id] = { name: p.name, pos: p.pos, arch: p.arch, three: p.three, mid: p.mid, min: r1((c.sec || 0) / 60), fga: c.st.fga, tpa: c.st.tpa, tpm: c.st.tpm, pts: c.st.pts }; } }));
    return R;
  }

  window.PBCAudit = { playGame };
})();
