/* Pro BBALL Coach: match view debug tools (PBC.Match.Debug).
 *
 * Meters: pure measurement, shared by the live overlay, the Animation Lab and the headless quarter audit
 * (tools/audit/quarter.js), so every number means the same thing everywhere:
 *   - foot contact slide per heel / ball / toe point (a point on the floor may not move until it lifts; a pivot is
 *     legal only on the ball of the foot with the heel up), feet through the floor, planted feet floating
 *   - joint limits: final pose past a human range (a violation), requested past the range (clamped), limb out of reach
 *   - hand to ball gaps: dribble contact, holds, shots, passes, and how far the ball was from the hands at a catch
 *   - look targets: none, stale (a snapshot left behind by the ball), the ball, a point, watching over the shoulder
 *   - body acceleration snaps, instant turn starts, joint pops, torso overlaps and hands inside other bodies
 *   - centre of mass (segment masses in Tune.segMass) and the base of support
 * Session (browser): per-player overlays, playback 0.1x to 4x with pause and frame stepping, a rewind recorder to
 * step backwards, isolate one player (dim or hide the rest), a free orbit camera, a live panel and a copyable report.
 * Shift+D opens and closes it in the harness (match_test.html) and in the live game. It costs nothing while closed. */
(function () {
  'use strict';
  const PBC = window.PBC, M = PBC.Match, U = M.U, RG = M.Rig, J = RG.J, CH = RG.CH;
  const TU = () => M.Tune.debug;
  const IN = 12; // inches per foot

  // ---------------------------------------------------------------- helpers
  const POINTS = [['HEEL', 'L_HEEL', 0], ['BALL', 'L_BALL', 0], ['TOE', 'L_TOE', 0], ['HEEL', 'R_HEEL', 1], ['BALL', 'R_BALL', 1], ['TOE', 'R_TOE', 1]].map(([k, j, s]) => ({ kind: k, j: J[j], side: s }));
  const POP_J = [J.L_HD, J.R_HD, J.L_TOE, J.R_TOE, J.HT, J.L_EL, J.R_EL, J.L_KN, J.R_KN];
  const POP_NAME = ['L_HD', 'R_HD', 'L_TOE', 'R_TOE', 'HT', 'L_EL', 'R_EL', 'L_KN', 'R_KN'];
  const CHNAME = {}; for (const k in CH) CHNAME[CH[k]] = k;
  const LIMK = Object.keys(RG.LIM);
  // joint each pose channel moves (for drawing a limit warning at the right spot)
  const JOINT_OF = {};
  for (const k in CH) {
    const s = k[0] === 'l' ? 'L_' : k[0] === 'r' ? 'R_' : '';
    let j = null;
    if (/^(sp)/.test(k)) j = J.SPN; else if (/^(ch)/.test(k)) j = J.CHS; else if (/^(nk)/.test(k)) j = J.NCK; else if (/^(hd)/.test(k)) j = J.HC; else if (/^pel/.test(k)) j = J.PEL;
    else if (/(Clv|Sh)/.test(k)) j = J[s + 'SH']; else if (/(ElF|Pro)/.test(k)) j = J[s + 'EL']; else if (/(Wr|Fing)/.test(k)) j = J[s + 'WR'];
    else if (/Hip/.test(k)) j = J[s + 'HIP']; else if (/Knee/.test(k)) j = J[s + 'KN']; else if (/(Ank|Toe)/.test(k)) j = J[s + 'AN'];
    JOINT_OF[CH[k]] = j;
  }
  const SEG = () => (M.Tune.segMass || []).map(([a, b, m, c]) => [J[a], J[b], m, c]);
  // the spine's two joints per axis (lumbar sp, thoracic ch), and every spine and neck angle watched for pops
  const SPINE_AX = [['spFlex', 'chFlex'], ['spLat', 'chLat'], ['spTwist', 'chTwist']].map(q => q.map(k => CH[k]));
  const POP_CH = ['spFlex', 'spLat', 'spTwist', 'chFlex', 'chLat', 'chTwist', 'nkFlex', 'nkLat', 'nkTwist', 'hdFlex', 'hdLat', 'hdTwist'].map(k => CH[k]);
  const wrap = (a) => U.wrapPi(a);
  function pct(sorted, p) { return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : 0; }
  function summ(arr, k) {
    const s = Float64Array.from(arr).sort();
    let mx = arr.length ? -Infinity : 0; for (const v of arr) if (v > mx) mx = v;
    const r = (v) => +(+v).toFixed(k == null ? 2 : k);
    return { n: arr.length, p50: r(pct(s, 0.5)), p90: r(pct(s, 0.9)), p99: r(pct(s, 0.99)), max: r(mx) };
  }
  function over(arr, v) { if (!arr.length) return 0; let n = 0; for (const x of arr) if (x > v) n++; return +(n / arr.length * 100).toFixed(2); }
  function segDist(P, a, b, x, y, z) {
    const ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2];
    const bx = P[b * 3] - ax, by = P[b * 3 + 1] - ay, bz = P[b * 3 + 2] - az, l2 = bx * bx + by * by + bz * bz;
    const t = l2 > 1e-9 ? U.clamp(((x - ax) * bx + (y - ay) * by + (z - az) * bz) / l2, 0, 1) : 0;
    return Math.hypot(x - ax - bx * t, y - ay - by * t, z - az - bz * t);
  }
  function segSeg(PA, a0, a1, PB, b0, b1) {
    let best = 1e9;
    for (let i = 0; i <= 6; i++) {
      const u = i / 6, x = PA[a0 * 3] + (PA[a1 * 3] - PA[a0 * 3]) * u, y = PA[a0 * 3 + 1] + (PA[a1 * 3 + 1] - PA[a0 * 3 + 1]) * u, z = PA[a0 * 3 + 2] + (PA[a1 * 3 + 2] - PA[a0 * 3 + 2]) * u;
      const d = segDist(PB, b0, b1, x, y, z); if (d < best) best = d;
    }
    return best;
  }
  /** convex hull of 2D points [[x,y],...] (monotone chain) */
  function hull(pts) {
    if (pts.length < 3) return pts.slice();
    const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
    for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
    lo.pop(); up.pop();
    return lo.concat(up);
  }
  /** signed distance of point q outside polygon h (<= 0 inside); degenerate hulls use the distance to the points/segment */
  function outside(h, q) {
    if (!h.length) return Infinity;
    if (h.length === 1) return Math.hypot(q[0] - h[0][0], q[1] - h[0][1]);
    let inside = h.length >= 3, dmin = Infinity;
    for (let i = 0; i < h.length; i++) {
      const a = h[i], b = h[(i + 1) % h.length];
      const ex = b[0] - a[0], ey = b[1] - a[1], l2 = ex * ex + ey * ey || 1e-9;
      const t = U.clamp(((q[0] - a[0]) * ex + (q[1] - a[1]) * ey) / l2, 0, 1);
      dmin = Math.min(dmin, Math.hypot(q[0] - a[0] - ex * t, q[1] - a[1] - ey * t));
      if (h.length >= 3 && ex * (q[1] - a[1]) - ey * (q[0] - a[0]) < 0) inside = false;
    }
    return inside ? -dmin : dmin;
  }

  /** what a person is doing, in a few words (the state label): side, move or gait and speed, stance, why, ball, look */
  function stateLabel(a, view) {
    if (!a) return '';
    const d = view && view.director;
    const side = a.kind === 'ref' ? 'REF' : d && d.active ? (a.team === d.off ? 'OFF' : 'DEF') : a.team === 0 ? 'HOME' : 'AWAY';
    const parts = [side];
    if (a.clip && a.clip.clip) parts.push((a.clip.clip.name || 'move') + ' ' + a.clip.t.toFixed(2) + 's');
    else if (a.gaitOn && a.speed > 0.8) {
      const mode = (a.latK || 0) > 0.5 ? 'slide' : (a.fwdDot != null && a.fwdDot < -0.3) ? 'backpedal' : a.speed < 6.2 ? 'walk' : a.speed < 13 ? 'jog' : a.speed < 21 ? 'run' : 'sprint';
      parts.push(mode + ' ' + a.speed.toFixed(1) + ' ft/s');
    } else parts.push('still');
    if (a.upper && a.upper.clip) parts.push('+' + (a.upper.clip.name || 'upper'));
    parts.push(a.stance);
    if (a.intent && a.intent.why) parts.push('why: ' + a.intent.why);
    const b = view && view.ball;
    if (b && b.holder === a) parts.push(b.state === 'dribble' ? 'dribbling' : 'ball');
    return parts.join(' · ');
  }

  // ---------------------------------------------------------------- meters
  class Meters {
    /** src: () => ({ people: [actors], ball, time, director }) */
    constructor(src) {
      this.src = src;
      this.tr = new Map();
      this.reset();
    }
    reset() {
      this.tr.clear();
      this.S = {
        frames: 0, playerFrames: 0, stepDt: 1 / 60,
        slide: { HEEL: [], BALL: [], TOE: [] }, slideCtx: {}, slideWorst: 0, slideWorstAt: '', slideCause: {},
        sinkFrames: 0, sinkDepth: [], sinkBy: {}, sinkWorst: 0, sinkWorstAt: '', hoverFrames: 0, plantFrames: 0,
        limBadFrames: 0, limBadChan: {}, limClampFrames: 0, limClampChan: {}, limReachFrames: 0, limWorst: '',
        accelSnaps: 0, accelSnapCtx: {}, turnOnsets: 0, turnInstant: 0, jointSnaps: 0, jointSnapBy: {},
        lookNone: 0, lookStale: 0, lookBall: 0, lookPoint: 0, lookWatch: 0,
        gap: { dribble: [], hold: [], shot: [], pass: [], catch: [] },
        torsoOverlap: 0, handInBody: 0, closePairs: 0, offBalance: 0, groundFrames: 0,
        knee: [], kneeCave: 0, kneeOff: 0, kneeCtx: {},
        cr: { pp: 0, ss: 0, ps: 0, n: 0, opp: 0, hip: [], sh: [] },
        spShare: [[], [], []], spKink: [0, 0, 0], spinePops: 0, spinePopBy: {}, spineAcc: [],
        cad: new Map(), guardFrames: 0, guardShift: [], guardAnk: 0, guardSlip: 0,
        step: {}, headTravel: [], headTravelOff: 0, speedBins: {},
        wt: { cut: { n: 0, plant: 0, drop: 0, dropIn: [], peak: [], miss: {} }, brake: { n: 0, plant: 0, drop: 0, dropIn: [], peak: [], miss: {} }, turnSnaps: 0, byMass: {}, hipJumps: 0, hipJumpBy: {}, hipJumpWorst: 0, hipJumpWorstAt: '' },
        gt: { cls: {}, trans: 0, transBy: {}, transPops: 0, transPopBy: {}, transPopAt: [], popBy: {}, after: { frames: 0, pops: 0 } },
      };
    }
    tracker(a) {
      let t = this.tr.get(a);
      if (!t) {
        t = { a, pts: POINTS.map(() => ({ on: false, lx: 0, ly: 0, max: 0, cur: 0, frames: 0, ctx: '', yaw0: 0, dyaw: 0 })), sink: [0, 0], hover: [false, false],
          lim: { bad: [], clamp: [], reach: [] }, com: [0, 0, 0], sup: [], bal: 0, air: false,
          kin: null, look: { state: 'none', x: 0, y: 0, z: 0, obj: null, ox: 0, oy: 0, since: 0 }, gap: null, gapKind: '', label: '', pops: 0 };
        this.tr.set(a, t);
      }
      return t;
    }
    /** call once per simulation step, after every body is solved */
    frame() {
      const s = this.src(), S = this.S, Tn = TU();
      const dt = s.dt || S.stepDt;
      S.frames++;
      const ball = s.ball;
      const list = s.people;
      for (const a of list) {
        if (!a || a.hidden || !a.sk) continue;
        if (!a.sk.limHits) a.sk.limHits = new Uint8Array(RG.NCH);
        const onCourt = a.x > -1 && a.x < 95 && a.y > -1 && a.y < 51;
        const t = this.tracker(a);
        // (the Lab and the scripted audits count a body anywhere, s.countAll: their runs and slides go off the court
        // lines; a game counts the players on the floor, not the bench)
        const count = a.kind === 'player' && (onCourt || !!s.countAll);
        if (count) S.playerFrames++;
        // (a body placed somewhere new, a substitute put on the floor, is a new start: its feet were not dragged there;
        // over 3 ft in one step, as in _kin)
        if (t.rootX != null && Math.hypot(a.x - t.rootX, a.y - t.rootY) > 3) for (const st of t.pts) { st.on = false; st.cur = 0; }
        t.rootX = a.x; t.rootY = a.y;
        this._feet(a, t, count, s);
        this._limits(a, t, count);
        this._com(a, t, count);
        this._kin(a, t, count, dt);
        this._look(a, t, count, ball, s.time);
        this._hands(a, t, count, ball);
        this._body(a, t, count, dt);
        this._steps(a, t, count, s.time || 0);
        this._weight(a, t, count, dt, s.time || 0);
        this._gait(a, t, count, s.time || 0, ball);
        t.label = stateLabel(a, s.view);
      }
      this._pairs(list);
      for (const a of list) { const t = this.tr.get(a); if (t) t.ballState = ball ? ball.state : null; }
    }
    ctx(a) {
      if (a.clip && a.clip.clip) return 'clip:' + (a.clip.clip.name || '?');
      if (a.gaitOn) return ((a.latK || 0) > 0.5 ? 'slide' : a.fwdDot != null && a.fwdDot < -0.3 ? 'back' : 'gait') + (a.speed > 13 ? ':fast' : a.speed > 7 ? ':run' : ':walk');
      return 'stance:' + a.stance;
    }
    _feet(a, t, count, s) {
      const P = a.sk.P, Tn = TU(), S = this.S;
      const enter = Tn.contactEnterFt, exit = Tn.contactExitFt, sink = Tn.sinkIn / IN, hov = Tn.hoverIn / IN;
      const c = count ? this.ctx(a) : '';
      for (let i = 0; i < 6; i++) {
        const pt = POINTS[i], st = t.pts[i], f = a.feet[pt.side], j = pt.j * 3, z = P[j + 2];
        if (z < -sink && count) {
          S.sinkFrames++;
          const k = pt.kind + ':' + f.state; S.sinkBy[k] = (S.sinkBy[k] || 0) + 1; S.sinkDepth.push(-z * IN);
          if (-z * IN > S.sinkWorst) { S.sinkWorst = -z * IN; S.sinkWorstAt = c + ' ' + pt.kind + ' ' + f.state + ' t=' + (s.time || 0).toFixed(2); }
        }
        const planted = f.state === 'plant';
        const on = planted && (st.on ? z <= exit : z < enter);
        if (on) {
          if (!st.on) { st.on = true; st.lx = P[j]; st.ly = P[j + 1]; st.max = 0; st.frames = 0; st.ctx = c; st.yaw0 = f.yaw; st.dyaw = 0; }
          let d = Math.hypot(P[j] - st.lx, P[j + 1] - st.ly);
          if (pt.kind === 'TOE') {
            // a legal pivot: the ball of the foot on its spot and the heel up; the forefoot turns about the ball, and
            // where the toes end up is their new spot (they must stay there once the heel is down again)
            const bi = pt.side * 3 + 1, hi = pt.side * 3, bst = t.pts[bi], hj = POINTS[hi].j * 3, bj = POINTS[bi].j * 3;
            if (bst.on && P[hj + 2] > Tn.pivotHeelUpFt) {
              const r0 = Math.hypot(st.lx - bst.lx, st.ly - bst.ly), r1 = Math.hypot(P[j] - P[bj], P[j + 1] - P[bj + 1]);
              d = Math.max(bst.cur, Math.abs(r1 - r0));
              st.lx = bst.lx + (P[j] - P[bj]) * (r0 / (r1 || 1)); st.ly = bst.ly + (P[j + 1] - P[bj + 1]) * (r0 / (r1 || 1));
            }
          }
          st.cur = d; st.frames++;
          st.dyaw = Math.max(st.dyaw, Math.abs(wrap(f.yaw - st.yaw0)));
          if (d > st.max) { st.max = d; st.ctx = c; }
        } else if (st.on) {
          if (st.frames >= 2 && count) {
            const v = st.max * IN;
            S.slide[pt.kind].push(v);
            const k2 = st.ctx.split(':').slice(0, 2).join(':');
            (S.slideCtx[k2] || (S.slideCtx[k2] = [])).push(v);
            if (v > 1) { const why = pt.kind + ':' + (st.dyaw > 10 * U.DEG ? 'footTurned' : 'noTurn'); S.slideCause[why] = (S.slideCause[why] || 0) + 1; }
            if (v > S.slideWorst) { S.slideWorst = v; S.slideWorstAt = st.ctx + ' ' + pt.kind + ' t=' + (s.time || 0).toFixed(2) + ' id=' + a.id; }
          }
          st.on = false; st.cur = 0;
        }
      }
      for (let side = 0; side < 2; side++) {
        const f = a.feet[side], b = side * 3;
        let zmin = Infinity;
        for (let k = 0; k < 3; k++) zmin = Math.min(zmin, P[POINTS[b + k].j * 3 + 2]);
        t.sink[side] = zmin < -sink ? -zmin : 0;
        t.hover[side] = f.state === 'plant' && !f.land && zmin > hov;
        if (count && f.state === 'plant') { S.plantFrames++; if (t.hover[side]) S.hoverFrames++; }
      }
    }
    _limits(a, t, count) {
      const p = a.sk.pose, S = this.S, tol = TU().limitTolDeg * U.DEG, L = RG.LIM;
      const bad = t.lim.bad; bad.length = 0;
      // (a planted ankle carries weight: its own, wider range; the actor writes the planted ankle's real bend)
      const AL = M.Tune.limits && M.Tune.limits.ankleLoaded, al = AL ? [AL[0] * U.DEG, AL[1] * U.DEG] : null;
      for (const k of LIMK) {
        let r = L[k];
        if (al && (k === 'lAnk' || k === 'rAnk') && a.feet && a.feet[k[0] === 'l' ? 0 : 1].state === 'plant') r = al;
        const v = p[CH[k]];
        if (v < r[0] - tol || v > r[1] + tol) bad.push([CH[k], v, r[0], r[1]]);
      }
      for (const tp of RG.TORSO_PAIRS || []) {
        const sum = p[tp[0]] + p[tp[1]];
        if (sum < tp[2] - tol || sum > tp[3] + tol) bad.push([tp[0], sum, tp[2], tp[3]]);
      }
      const hits = a.sk.limHits, clamp = t.lim.clamp, reach = t.lim.reach;
      clamp.length = 0; reach.length = 0;
      if (hits) for (let i = 0; i < hits.length; i++) { if (hits[i] === 1) clamp.push(i); else if (hits[i] === 2) reach.push(i); }
      if (!count) return;
      if (bad.length) {
        S.limBadFrames++;
        for (const q of bad) S.limBadChan[CHNAME[q[0]]] = (S.limBadChan[CHNAME[q[0]]] || 0) + 1;
        if (!S.limWorst) S.limWorst = CHNAME[bad[0][0]] + ' ' + (bad[0][1] / U.DEG).toFixed(1) + ' deg (range ' + (bad[0][2] / U.DEG).toFixed(0) + '..' + (bad[0][3] / U.DEG).toFixed(0) + ') ' + this.ctx(a);
      }
      if (clamp.length) { S.limClampFrames++; for (const i of clamp) S.limClampChan[CHNAME[i]] = (S.limClampChan[CHNAME[i]] || 0) + 1; }
      if (reach.length) S.limReachFrames++;
    }
    _com(a, t, count) {
      const P = a.sk.P;
      let x = 0, y = 0, z = 0, m = 0;
      for (const [ja, jb, ms, cf] of this._seg || (this._seg = SEG())) {
        x += ms * (P[ja * 3] + (P[jb * 3] - P[ja * 3]) * cf);
        y += ms * (P[ja * 3 + 1] + (P[jb * 3 + 1] - P[ja * 3 + 1]) * cf);
        z += ms * (P[ja * 3 + 2] + (P[jb * 3 + 2] - P[ja * 3 + 2]) * cf);
        m += ms;
      }
      t.com[0] = x / m; t.com[1] = y / m; t.com[2] = z / m;
      const pts = [], ex = TU().contactExitFt;
      for (const pt of POINTS) { const j = pt.j * 3; if (P[j + 2] < ex) pts.push([P[j], P[j + 1]]); }
      t.sup = hull(pts);
      t.air = !pts.length;
      t.bal = t.air ? 0 : outside(t.sup, t.com);
      if (count && !t.air) { this.S.groundFrames++; if (t.bal > 0.1 && !a.clip && a.speed < 1.5) this.S.offBalance++; }
    }
    _kin(a, t, count, dt) {
      const S = this.S, Tn = TU();
      const k = t.kin || (t.kin = { px: a.x, py: a.y, pf: a.facing, vx: 0, vy: 0, w: 0, ax: 0, ay: 0, n: 0, loc: null, loc1: null });
      // (a body placed somewhere new between plays is a new start, not a motion: over 3 ft in one step)
      if (Math.hypot(a.x - k.px, a.y - k.py) > 3) { k.px = a.x; k.py = a.y; k.pf = a.facing; k.vx = 0; k.vy = 0; k.w = 0; k.ax = 0; k.ay = 0; k.n = 0; if (t.wt) t.wt.ev = null; }
      const vx = (a.x - k.px) / dt, vy = (a.y - k.py) / dt, w = wrap(a.facing - k.pf) / dt;
      if (k.n >= 1) {
        k.ax = (vx - k.vx) / dt; k.ay = (vy - k.vy) / dt;
        const acc = Math.hypot(k.ax, k.ay);
        if (count && k.n >= 2 && acc > Tn.accelSnapFtps2) { S.accelSnaps++; const c = this.ctx(a).split(':').slice(0, 2).join(':') + (a.hit ? '+hit' : ''); S.accelSnapCtx[c] = (S.accelSnapCtx[c] || 0) + 1; }
        if (count && k.n >= 2 && Math.abs(k.w) < Tn.turnStillRadps) {
          if (Math.abs(w) > Tn.turnSnapRadps) { S.turnOnsets++; S.turnInstant++; } else if (Math.abs(w) > 1.5) S.turnOnsets++;
        }
      }
      k.vx = vx; k.vy = vy; k.w = w; k.px = a.x; k.py = a.y; k.pf = a.facing; k.n++;
      // joint pops: second difference of joint positions in the body frame (turning and travel taken out)
      const P = a.sk.P, c = Math.cos(a.facing), s = Math.sin(a.facing);
      const loc = k.loc2buf || (k.loc2buf = [new Float64Array(POP_J.length * 3), new Float64Array(POP_J.length * 3), new Float64Array(POP_J.length * 3)]);
      const cur = loc[k.n % 3], p1 = loc[(k.n + 2) % 3], p2 = loc[(k.n + 1) % 3];
      for (let i = 0; i < POP_J.length; i++) {
        const j = POP_J[i] * 3, rx = P[j] - a.x, ry = P[j + 1] - a.y;
        cur[i * 3] = rx * s - ry * c; cur[i * 3 + 1] = rx * c + ry * s; cur[i * 3 + 2] = P[j + 2];
      }
      t.pops = 0; t.popJ = 0;
      if (k.n >= 3) {
        for (let i = 0; i < POP_J.length; i++) {
          const ax = cur[i * 3] - 2 * p1[i * 3] + p2[i * 3], ay = cur[i * 3 + 1] - 2 * p1[i * 3 + 1] + p2[i * 3 + 1], az = cur[i * 3 + 2] - 2 * p1[i * 3 + 2] + p2[i * 3 + 2];
          const am = Math.hypot(ax, ay, az) / (dt * dt);
          if (am > Tn.jointSnapFtps2) { t.pops++; t.popJ |= 1 << i; if (count) { S.jointSnaps++; S.jointSnapBy[POP_NAME[i]] = (S.jointSnapBy[POP_NAME[i]] || 0) + 1; } }
        }
      }
    }
    _look(a, t, count, ball, time) {
      const S = this.S, Tn = TU(), L = t.look, lk = a.look_;
      if (lk) {
        const x = lk.x != null ? lk.x : 0, y = lk.y != null ? lk.y : 0, z = lk.z != null ? lk.z : (ball ? ball.z : 4);
        if (lk !== L.obj || Math.abs(x - L.ox) > 1e-4 || Math.abs(y - L.oy) > 1e-4) { L.obj = lk; L.ox = x; L.oy = y; L.since = time || 0; }
        L.x = x; L.y = y; L.z = z;
        const db = ball ? Math.hypot(ball.x - x, ball.y - y) : 99;
        if ((time || 0) - L.since > Tn.staleLookSec && db > Tn.staleLookFt) L.state = 'stale';
        else L.state = db < 1.5 ? 'ball' : 'point';
      } else if (a._watchK > 0.05 && a._watch != null) {
        L.state = 'watch';
        const ang = a._watch;
        L.x = a.x + Math.cos(ang) * 10; L.y = a.y + Math.sin(ang) * 10; L.z = a.H * 0.9;
      } else {
        L.state = 'none';
        L.obj = null;
      }
      if (!count) return;
      if (L.state === 'none') S.lookNone++; else if (L.state === 'stale') S.lookStale++; else if (L.state === 'ball') S.lookBall++; else if (L.state === 'watch') S.lookWatch++; else S.lookPoint++;
    }
    _hands(a, t, count, ball) {
      t.gap = null; t.gapKind = '';
      if (!ball) return;
      const P = a.sk.P, R = M.Ball.R, pal = TU().palmOffsetH * a.H;
      const gapOf = (side) => { const j = (side ? J.R_HD : J.L_HD) * 3; return (Math.hypot(P[j] - ball.x, P[j + 1] - ball.y, P[j + 2] - ball.z) - R - pal) * IN; };
      let g = null, kind = '';
      if (ball.state === 'dribble' && ball.dr && ball.dr.actor === a && a.dribble && (a.dribble.ph === 'push' || a.dribble.ph === 'ride') && (a.dribble.act == null || a.dribble.act > 0.95)) {
        g = gapOf(a.dribble.hand ? 1 : 0); kind = 'dribble';
      } else if (ball.state === 'held' && ball.holder === a) {
        const prev = t.ballState;
        if (prev === 'flight') { g = Math.min(gapOf(0), gapOf(1)); kind = 'catch'; }
        else if (a._grip && (a._grip[0] > 0.95 || a._grip[1] > 0.95)) {
          g = -1e9;
          for (let side = 0; side < 2; side++) if (a._grip[side] > 0.95) g = Math.max(g, gapOf(side));
          kind = a.clip && a.clip.clip.events && a.clip.clip.events.release != null ? 'shot' : a.upper && a.upper.clip.events && a.upper.clip.events.release != null ? 'pass' : 'hold';
        }
      }
      if (g == null) return;
      t.gap = g; t.gapKind = kind;
      if (count) this.S.gap[kind].push(g);
    }
    /** the body (Trial 2): knees over the toes of planted legs, hips and shoulders counter-rotating in a run, a bend
     *  or twist shared through the spine's joints, spine and neck angles that pop, cadence by body size */
    _body(a, t, count, dt) {
      const S = this.S, Tn = TU(), P = a.sk.P, R = a.sk.R, p = a.sk.pose, D = U.DEG;
      const B = t.body || (t.body = { kn: [0, 0], run: 0, pm: 0, sm: 0, ang: [new Float64Array(POP_CH.length), new Float64Array(POP_CH.length), new Float64Array(POP_CH.length)], n: 0 });
      // knees over toes: the way a bent knee points (its bulge off the hip-ankle line) against the heel-to-toe line
      for (let side = 0; side < 2; side++) {
        B.kn[side] = 0;
        const f = a.feet && a.feet[side];
        if (!f || f.state !== 'plant' || !t.pts[side * 3 + 1].on) continue;
        if (p[CH[side ? 'rKnee' : 'lKnee']] < Tn.kneeTrackMinFlexDeg * D) continue;
        const h = (side ? J.R_HIP : J.L_HIP) * 3, k = (side ? J.R_KN : J.L_KN) * 3, an = (side ? J.R_AN : J.L_AN) * 3;
        const he = (side ? J.R_HEEL : J.L_HEEL) * 3, to = (side ? J.R_TOE : J.L_TOE) * 3;
        const lx = P[an] - P[h], ly = P[an + 1] - P[h + 1], lz = P[an + 2] - P[h + 2], l2 = lx * lx + ly * ly + lz * lz || 1e-9;
        const qx = P[k] - P[h], qy = P[k + 1] - P[h + 1], qz = P[k + 2] - P[h + 2], u = (qx * lx + qy * ly + qz * lz) / l2;
        const kx = qx - u * lx, ky = qy - u * ly, fx = P[to] - P[he], fy = P[to + 1] - P[he + 1];
        if (Math.hypot(kx, ky) < 0.02 * a.H || Math.hypot(fx, fy) < 1e-3) continue;
        // (+ = the knee turned inside the foot's line, toward the other leg: caving in)
        const med = (side ? 1 : -1) * Math.atan2(fx * ky - fy * kx, fx * kx + fy * ky);
        B.kn[side] = med;
        if (!count) continue;
        S.knee.push(Math.abs(med) / D);
        if (med > Tn.kneeCaveDeg * D) S.kneeCave++;
        if (Math.abs(med) > Tn.kneeOffDeg * D) { S.kneeOff++; const c = this.ctx(a).split(':').slice(0, 2).join(':'); S.kneeCtx[c] = (S.kneeCtx[c] || 0) + 1; }
      }
      // counter-rotation: in a forward run the hips and the shoulder line swing opposite ways about the travel line
      const run = a.gaitOn && a.speed > Tn.counterRunFtps && !(a.clip && a.clip.clip) && (a.latK || 0) < 0.5 && !(a.fwdDot != null && a.fwdDot < -0.3);
      if (run) {
        const hy = wrap(Math.atan2(R[4], R[1]) - a.facing);
        const ls = J.L_SH * 3, rs = J.R_SH * 3, sy = wrap(Math.atan2(P[rs] - P[ls], -(P[rs + 1] - P[ls + 1])) - a.facing);
        // (the slow part, a turn or a lean, comes out: each yaw is measured from its own running mean)
        const kk = B.run > 0 ? 1 - Math.exp(-dt / Tn.counterMeanS) : 1;
        B.pm += (hy - B.pm) * kk; B.sm += (sy - B.sm) * kk; B.run += dt;
        if (count && B.run > Tn.counterSettleS) {
          const dp = hy - B.pm, ds = sy - B.sm, cr = S.cr;
          cr.pp += dp * dp; cr.ss += ds * ds; cr.ps += dp * ds; cr.n++;
          if (dp * ds < 0) cr.opp++;
          cr.hip.push(Math.abs(dp) / D); cr.sh.push(Math.abs(ds) / D);
        }
      } else B.run = 0;
      // the spine as a chain: a bend or twist shared by the lumbar (sp) and thoracic (ch) joints, not one kink
      for (let ax = 0; ax < 3; ax++) {
        const v1 = Math.abs(p[SPINE_AX[ax][0]]), v2 = Math.abs(p[SPINE_AX[ax][1]]), tot = v1 + v2;
        if (!count || tot < Tn.spineShareMinDeg * D) continue;
        const sh = Math.max(v1, v2) / tot;
        S.spShare[ax].push(sh);
        if (sh > Tn.spineKinkShare) S.spKink[ax]++;
      }
      // spine and neck angles that pop: the step-to-step change of rate (second difference), deg/s^2
      const A0 = B.ang[B.n % 3], A1 = B.ang[(B.n + 2) % 3], A2 = B.ang[(B.n + 1) % 3];
      for (let i = 0; i < POP_CH.length; i++) A0[i] = p[POP_CH[i]];
      if (B.n >= 2 && count) {
        let worst = 0;
        for (let i = 0; i < POP_CH.length; i++) {
          const acc = Math.abs(wrap(A0[i] - A1[i]) - wrap(A1[i] - A2[i])) / (dt * dt) / D;
          if (acc > worst) worst = acc;
          if (acc > Tn.spinePopDegps2) { S.spinePops++; const nm = CHNAME[POP_CH[i]]; S.spinePopBy[nm] = (S.spinePopBy[nm] || 0) + 1; }
        }
        S.spineAcc.push(worst);
      }
      B.n++;
      // the planted-leg guard at work: the pelvis held over a planted foot to keep its hip in range (in), heels moved
      const hg = a._hg;
      if (count && hg) {
        const shv = Math.hypot(hg.x, hg.y) * IN;
        if (shv > 0.1) { S.guardFrames++; S.guardShift.push(shv); }
        if (hg.ank) S.guardAnk++;
        if (hg.slip) S.guardSlip += hg.slip;
      }
      // cadence by body size: steps per second at a steady 12-16 ft/s run
      if (count && run && a.speed >= 12 && a.speed <= 16 && a.gaitDbg && a.gaitDbg.sps) {
        let c = S.cad.get(a);
        if (!c) S.cad.set(a, c = { H: a.H, n: 0, sps: 0, v: 0 });
        c.n++; c.sps += a.gaitDbg.sps; c.v += a.speed;
      }
    }
    /** the floor (Trial 3): every step's lift, swing, landing and stance (how long each lasts, how high the foot
     *  clears the floor, heel or forefoot first, the ankle at contact, at its deepest and at toe-off, how far the
     *  landing moved from where it was aimed at lift-off), the toes against the way he is going, and cadence and step
     *  length by speed */
    _steps(a, t, count, time) {
      const S = this.S, Tn = TU(), P = a.sk.P, p = a.sk.pose, D = U.DEG;
      if (!a.feet) return;
      const st = t.steps || (t.steps = [0, 1].map(() => ({ state: null, t0: 0, clear: 0, dorsi: -9, stanceT: null, tx: null, ty: null, mode: '', n: 0 })));
      const mode = count ? this.ctx(a).split(':').slice(0, 2).join(':') : '';
      const bin = (m) => S.step[m] || (S.step[m] = { steps: 0, clear: 0, why: { stance: 0, swing: 0, lift: 0 }, stance: [], swing: [], clearIn: [], heelFirst: 0, foreFirst: 0, flat: 0, ankContact: [], ankDeep: [], ankToeOff: [], landErrIn: [] });
      for (let side = 0; side < 2; side++) {
        const f = a.feet[side], s = st[side];
        const ank = p[CH[side ? 'rAnk' : 'lAnk']];
        const zH = P[(side ? J.R_HEEL : J.L_HEEL) * 3 + 2], zB = P[(side ? J.R_BALL : J.L_BALL) * 3 + 2], zT = P[(side ? J.R_TOE : J.L_TOE) * 3 + 2];
        const zmin = Math.min(zH, zB, zT);
        // (the first stance seen is only part of one: it started before the meter did)
        if (s.state == null) { s.state = f.state; s.t0 = time; s.part = true; continue; }
        if (f.state !== s.state) {
          const dur = time - s.t0;
          if (s.state === 'plant' && f.state === 'swing') {
            // lift-off: the stance that ends, its deepest ankle bend and the ankle at toe-off
            // (the spot it is aimed at is read on the swing's next step: at lift-off it still holds the last landing)
            s.stanceT = s.part ? null : dur; s.part = false; s.clear = 0; s.tx = null; s.ty = null; s.aim = true; s.mode = mode;
            if (count && s.n > 0) { const b = bin(mode); b.ankDeep.push(s.dorsi / D); b.ankToeOff.push(ank / D); }
          } else if (s.state === 'swing' && f.state === 'plant') {
            // a landing ends a step: lift, swing, landing; it is clear with a real stance before it, a real swing and
            // the foot visibly off the floor
            if (count && s.stanceT != null) {
              const b = bin(s.mode || mode), clearIn = s.clear * IN;
              b.steps++; b.stance.push(s.stanceT); b.swing.push(dur); b.clearIn.push(clearIn);
              // (times are whole steps of the clock: 3 steps of 1/60 s add up to a hair under 0.05)
              const okSt = s.stanceT + 1e-6 >= Tn.stepMinStanceS, okSw = dur + 1e-6 >= Tn.stepMinSwingS;
              if (okSt && okSw && clearIn >= Tn.stepMinClearIn) b.clear++;
              else { if (!okSt) b.why.stance++; if (!okSw) b.why.swing++; if (clearIn < Tn.stepMinClearIn) b.why.lift++; }
              const dz = (zH - zB) * IN;
              if (dz < -Tn.landFirstIn) b.heelFirst++; else if (dz > Tn.landFirstIn) b.foreFirst++; else b.flat++;
              b.ankContact.push(ank / D);
              if (s.tx != null && f.tx != null) b.landErrIn.push(Math.hypot(f.x - s.tx, f.y - s.ty) * IN);
            }
            s.dorsi = -9; s.n++; s.part = false;
          }
          s.state = f.state; s.t0 = time;
        }
        if (f.state === 'swing') {
          s.clear = Math.max(s.clear, zmin);
          if (s.aim && time > s.t0) { s.tx = f.tx; s.ty = f.ty; s.aim = false; }
        } else if (f.state === 'plant') s.dorsi = Math.max(s.dorsi, ank);
      }
      if (!count) return;
      // the toes point the way he is going (running or walking forward, a planted foot past its heel strike)
      if (a.gaitOn && !a.clip && a.speed > 3 && a.fwdDot != null && a.fwdDot > 0.9 && (a.latK || 0) < 0.2) {
        const mv = Math.atan2(a.vy, a.vx);
        for (let side = 0; side < 2; side++) {
          const f = a.feet[side];
          // (not while it pivots: a pivot is the foot turning to its new heading)
          if (f.state !== 'plant' || f.hs || (f.pvK || 0) > 0.05) continue;
          const e = Math.abs(wrap(f.yaw - mv - (side ? -1 : 1) * Tn.toeOutDeg * D)) / D;
          S.headTravel.push(e);
          if (e > Tn.toeTravelOffDeg) S.headTravelOff++;
        }
      }
      // cadence and step length by speed (walking or running forward, no move playing)
      if (a.gaitOn && !a.clip && a.gaitDbg && a.gaitDbg.sps && (a.latK || 0) < 0.5 && a.fwdDot != null && a.fwdDot > 0.5) {
        const v = a.speed, k = v < 3 ? null : v < 6 ? 'walk 3-6' : v < 9 ? 'jog 6-9' : v < 13 ? 'run 9-13' : v < 18 ? 'run 13-18' : 'sprint 18+';
        if (k) { const b = S.speedBins[k] || (S.speedBins[k] = { n: 0, v: 0, sps: 0 }); b.n++; b.v += v; b.sps += a.gaitDbg.sps; }
      }
    }
    /** the weight (Trial 4), from each body's own measured root motion: a hard cut or brake (the push across or
     *  against the way he goes past Tune.debug.cutFtps2 at speed) should show a foot planted where it pushes from (the
     *  outside of the cut, ahead of him braking) and the hips dropping (below where they rode before it); the facing's
     *  turn rate should never jump (turn snaps); and a heavier body should push and turn less */
    _weight(a, t, count, dt, time) {
      const S = this.S, Tn = TU(), k = t.kin;
      if (!k || a.kind !== 'player' || !(dt > 0)) return;
      const W = t.wt || (t.wt = { zRef: null, ev: null, wPrev: null, zBuf: null, zN: 0 });
      const z = a.sk.P[2] - (a.jumpZ || 0);
      const air = a.feet[0].state === 'air' || a.feet[1].state === 'air' || (a.jumpZ || 0) > 0.02;
      const sp = Math.hypot(k.vx, k.vy);
      // hip jumps: the pelvis going up or down more than Tune.debug.hipJumpIn in one step with the body on the floor
      // (not a jump's own flight, not a body placed somewhere new)
      if (W.hz != null && !air && !W.hAir && Math.hypot(a.x - W.hx, a.y - W.hy) < 3) {
        const dz = Math.abs(z - W.hz) * IN;
        if (count && dz > Tn.hipJumpIn) {
          S.wt.hipJumps++;
          const c = this.ctx(a).split(':').slice(0, 2).join(':');
          S.wt.hipJumpBy[c] = (S.wt.hipJumpBy[c] || 0) + 1;
          if (dz > S.wt.hipJumpWorst) { S.wt.hipJumpWorst = dz; S.wt.hipJumpWorstAt = c + ' #' + a.id + ' t' + (+time).toFixed(2); }
        }
      }
      W.hz = z; W.hAir = air; W.hx = a.x; W.hy = a.y;
      // turn snaps: the facing's rate jumping (the angular acceleration past Tune.debug.turnSnapRadps2)
      if (k.n >= 3 && W.wPrev != null) {
        const alpha = Math.abs(k.w - W.wPrev) / dt;
        if (count && alpha > Tn.turnSnapRadps2) S.wt.turnSnaps++;
        if (count && alpha > 5) this._wtClass(a).turn.push(alpha);
      }
      W.wPrev = k.n >= 1 ? k.w : null;
      if (k.n < 3) return;
      const am = Math.hypot(k.ax, k.ay);
      if (count && am > 5 && !a.clip) this._wtClass(a).push.push(am);
      const ux = sp > 0.1 ? k.vx / sp : 0, uy = sp > 0.1 ? k.vy / sp : 0;
      const aPar = k.ax * ux + k.ay * uy, aLat = k.ay * ux - k.ax * uy;
      // the level the hips ride at, the reference a cut or brake drops them from: their average over the last
      // Tune.debug.hipRefS on the floor (a running stride, its bob averaged out), with whatever the body has them held
      // down for a push already taken back out, and a stretched leg's pull on them (Actor._rz: a cut begun as a long
      // stride's leg had them 2-3 in down read as no drop with the hips 3 in under their running height all through it)
      // (Actor._hipDrop: through a long curve, a run of cuts or a light brake
      // before one, a level of the hips as they were sank with the hips it measures, and one kept only while no push
      // held them down went stale for seconds; a slowly followed level lagged far behind hips coming up out of a crouch)
      if (!air && !W.ev && !a.clip) {
        const nb = Math.max(1, Math.round(Tn.hipRefS / dt));
        if (!W.zBuf || W.zBuf.length !== nb) { W.zBuf = new Float64Array(nb); W.zN = 0; }
        W.zBuf[W.zN % nb] = z + (a._hipDrop || 0) - (a._rz ? Math.min(0, a._rz.d) : 0); W.zN++;
        let sum = 0; const m = Math.min(W.zN, nb);
        for (let i = 0; i < m; i++) sum += W.zBuf[i];
        W.zRef = sum / m;
      }
      // (one starts at speed; once going it lasts as long as the push does, a brake down to a stop)
      const push = a.clip ? null : Math.abs(aLat) >= Tn.cutFtps2 ? 'cut' : -aPar >= Tn.cutFtps2 ? 'brake' : null;
      const kind = push && (sp >= Tn.hardMoveFtps || (W.ev && sp > 1)) ? push : null;
      let ev = W.ev;
      if (kind && !ev) ev = W.ev = { kind, z0: W.zRef == null ? z : W.zRef, drop: 0, plantCut: false, plantBrake: false, n: 0, quiet: 0, peakCut: 0, peakBrake: 0, impCut: 0, impBrake: 0, h0: Math.atan2(k.vy, k.vx), turn: 0, v0: sp, vMin: sp };
      if (!ev) return;
      // (how far the way he goes turns, and how much speed he sheds, over it: a cut changes direction, a curve only
      // leans round; a brake sheds speed)
      if (sp > 1) ev.turn = Math.max(ev.turn, Math.abs(wrap(Math.atan2(k.vy, k.vx) - ev.h0)));
      ev.vMin = Math.min(ev.vMin, sp);
      if (kind) { ev.quiet = 0; ev.n++; } else ev.quiet++;
      // (a cut or a stop by which push it mostly is over the whole of it: a push across that turns into a stop to a
      // walk is a stop with a turn, and plants the way a stop does)
      ev.peakCut = Math.max(ev.peakCut, Math.abs(aLat)); ev.peakBrake = Math.max(ev.peakBrake, -aPar);
      ev.impCut += Math.abs(aLat) * dt; ev.impBrake += Math.max(0, -aPar) * dt;
      if (!air) ev.drop = Math.max(ev.drop, (ev.z0 - z) * IN);
      // (a foot on the floor where the push comes from, the floor pushing the body away from it: in a cut on the side
      // the push comes from, outside the cut or, braking into it, out ahead; braking, out ahead)
      for (const f of a.feet) {
        if (f.state !== 'plant') continue;
        const dx = f.x - a.x, dy = f.y - a.y;
        if (dx * k.ax + dy * k.ay < 0) ev.plantCut = true;
        if (dx * ux + dy * uy > 0.05 * a.H) ev.plantBrake = true;
      }
      // (one push through a running stride's flight, when a foot cannot push: Tune.debug.pushGapS)
      if (ev.quiet * dt >= Tn.pushGapS - 1e-6) {
        W.ev = null;
        // (a hard one: a real plant and push, not a lean round a curve: a cut turns his way by Tune.debug.cutTurnDeg in
        // under cutMaxS, a brake sheds brakeShed of his speed)
        ev.kind = ev.impCut >= ev.impBrake ? 'cut' : 'brake';
        const cut = ev.kind === 'cut', peak = cut ? ev.peakCut : ev.peakBrake, plant = cut ? ev.plantCut : ev.plantBrake;
        if (!count || ev.n * dt < Tn.hardMinS - 1e-6 || peak < Tn.hardPeakFtps2) return;
        if (cut ? ev.turn < Tn.cutTurnDeg * U.DEG || (ev.n + ev.quiet) * dt > Tn.cutMaxS : ev.vMin > ev.v0 * (1 - Tn.brakeShed)) return;
        const b = S.wt[ev.kind];
        b.n++; if (plant) b.plant++; if (ev.drop >= Tn.hipDropIn) b.drop++;
        b.dropIn.push(ev.drop); b.peak.push(peak);
        // (which kinds of move miss the plant or the drop, for the report)
        if (!plant || ev.drop < Tn.hipDropIn) { const c = this.ctx(a).split(':').slice(0, 2).join(':') + (!plant ? ' no-plant' : '') + (ev.drop < Tn.hipDropIn ? ' no-drop' : ''); b.miss[c] = (b.miss[c] || 0) + 1; }
      }
    }
    _wtClass(a) {
      const S = this.S, Tn = TU(), m = a.mass || 215, c = m < Tn.massClassLb[0] ? 'light' : m < Tn.massClassLb[1] ? 'mid' : 'heavy';
      const b = S.wt.byMass[c] || (S.wt.byMass[c] = { push: [], turn: [], players: new Set(), lb: 0, n: 0 });
      if (!b.players.has(a)) { b.players.add(a); b.lb += m; b.n++; }
      return b;
    }
    /** the gait a body is in (Trial 5): walk, jog, run, sprint, slide, back or stand; null in a move, with an arm move
     *  over the legs, or with the ball (those are the later trials') */
    gaitClass(a, ball) {
      if (a.clip && a.clip.clip) return null;
      if (a.upper && a.upper.clip) return null;
      if (ball && (ball.holder === a || (ball.state === 'dribble' && ball.dr && ball.dr.actor === a))) return null;
      if (!a.gaitOn) return 'stand';
      if ((a.latK || 0) > 0.5) return 'slide';
      if (a.fwdDot != null && a.fwdDot < -0.3) return 'back';
      const v = a.speed, TG = TU();
      return v < TG.gaitWalkFtps ? 'walk' : v < TG.gaitJogFtps ? 'jog' : v < TG.gaitRunFtps ? 'run' : 'sprint';
    }
    /** the gaits (Trial 5): pops by gait and around a change of gait, and each arm against the opposite leg (the
     *  shoulders' flexion split against the hips', which a contralateral swing keeps in step) */
    _gait(a, t, count, time, ball) {
      if (!count) return;
      const S = this.S, G = S.gt, Tn = TU(), cls = this.gaitClass(a, ball);
      const g = t.gt || (t.gt = { c: null, tc: -9, from: '', nt: -9 });
      if (cls == null) { g.c = null; g.nt = time; return; }
      // (the first moments out of a move or with the ball just gone are the arms and legs coming off it: counted apart,
      // they are the later trials')
      if (time - g.nt < Tn.gaitAfterMoveS) { G.after.frames++; G.after.pops += t.pops; g.c = cls; return; }
      if (g.c != null && g.c !== cls) { G.trans++; g.from = g.c + '>' + cls; G.transBy[g.from] = (G.transBy[g.from] || 0) + 1; g.tc = time; }
      g.c = cls;
      const b = G.cls[cls] || (G.cls[cls] = { frames: 0, pops: 0, n: 0, sh: 0, sf: 0, shh: 0, sff: 0, shf: 0, elb: 0, ag: 0, agOk: 0, agA: 0, agAOk: 0, sw: 0, hs: 0, hss: 0 });
      b.frames++;
      if (t.pops) {
        b.pops += t.pops;
        for (let i = 0; i < POP_NAME.length; i++) if (t.popJ & (1 << i)) { const k = cls + ':' + POP_NAME[i]; G.popBy[k] = (G.popBy[k] || 0) + 1; }
        if (time - g.tc < Tn.gaitTransWindowS) {
          G.transPops += t.pops;
          G.transPopBy[g.from] = (G.transPopBy[g.from] || 0) + t.pops;
          if (G.transPopAt.length < 12) G.transPopAt.push(g.from + ' ' + (a.id || '') + ' t=' + time.toFixed(2));
        }
      }
      if (cls === 'stand' || cls === 'slide' || a.speed < 3) return;
      // each arm against the opposite leg, as a gait lab measures it: the shoulders' flexion split (left minus right)
      // against the hips' (right minus left), which a contralateral swing keeps in step (the split takes out what both
      // sides share, a stance's arms held up or a crouch)
      const q = a.sk.pose, dh = q[CH.lShF] - q[CH.rShF], df = q[CH.rHipF] - q[CH.lHipF];
      b.n++; b.sh += dh; b.sf += df; b.shh += dh * dh; b.sff += df * df; b.shf += dh * df;
      // (and, where the gait swings the arms, whether the arm forward is the one opposite the thigh forward, each taken
      // about the middle of its swing over the last stride and counted with both past Tune.debug.gaitSyncBand of that
      // swing's half-range, as a gait lab counts it: a stance may hold one hand out ahead of the other, and a stance's
      // arms held up or out take only a little of the swing)
      const swingK = (a.gaitArmK || 0) >= Tn.gaitSyncArmK;
      if (swingK) b.sw++;
      const dtS = this.S.stepDt || 1 / 60, NB = 120;
      if (!g.bh || g.pT == null || Math.abs(time - g.pT - dtS) > 1e-6) { g.bh = new Float32Array(NB); g.bf = new Float32Array(NB); g.bi = 0; g.bn = 0; }
      g.pT = time;
      g.bh[g.bi] = dh; g.bf[g.bi] = df; g.bi = (g.bi + 1) % NB; g.bn = Math.min(NB, g.bn + 1);
      const cyc = a.gaitDbg && a.gaitDbg.cycle > 0 ? a.gaitDbg.cycle : 1, nW = Math.min(NB, Math.round(U.clamp(cyc, 0.4, 1.9) / dtS));
      if (g.bn >= nW) {
        let h0 = Infinity, h1 = -Infinity, f0 = Infinity, f1 = -Infinity;
        for (let k = 1; k <= nW; k++) { const j = (g.bi - k + NB) % NB; const x = g.bh[j], y = g.bf[j]; if (x < h0) h0 = x; if (x > h1) h1 = x; if (y < f0) f0 = y; if (y > f1) f1 = y; }
        const xh = dh - (h0 + h1) / 2, xf = df - (f0 + f1) / 2, rh = (h1 - h0) / 2, rf = (f1 - f0) / 2;
        const apart = rh > Tn.gaitSyncArmDeg * U.DEG && rf > Tn.gaitSyncLegDeg * U.DEG && Math.abs(xh) > Tn.gaitSyncBand * rh && Math.abs(xf) > Tn.gaitSyncBand * rf;
        if (swingK && apart) { b.ag++; if (xh * xf > 0) b.agOk++; }
        if (apart) { b.agA++; if (xh * xf > 0) b.agAOk++; }
      }
      // (how far the hands swing: their fore-aft split in the body frame)
      const P = a.sk.P, c = Math.cos(a.facing), s = Math.sin(a.facing), fw = (j) => (P[j * 3] - a.x) * c + (P[j * 3 + 1] - a.y) * s;
      const hs = fw(J.L_HD) - fw(J.R_HD);
      b.hs += hs; b.hss += hs * hs;
      b.elb += (q[CH.lElF] + q[CH.rElF]) * 0.5;
    }
    /** the Trial 5 gait scorecard */
    gaitSummary() {
      const S = this.S, G = S.gt, top = (o, n) => Object.entries(o).sort((p, q) => q[1] - p[1]).slice(0, n || 8);
      const cls = {};
      let lf = 0, lp = 0;
      for (const k of ['stand', 'walk', 'jog', 'run', 'sprint', 'back', 'slide']) {
        const b = G.cls[k]; if (!b) continue;
        lf += b.frames; lp += b.pops;
        const o = { frames: b.frames, pops: b.pops, popsPerMin: +(b.pops / Math.max(1e-9, b.frames * S.stepDt / 60)).toFixed(2) };
        if (b.n >= 30) {
          const mh = b.sh / b.n, mf = b.sf / b.n, vh = b.shh / b.n - mh * mh, vf = b.sff / b.n - mf * mf, cv = b.shf / b.n - mh * mf;
          o.armLegSync = +(cv / Math.sqrt(Math.max(1e-12, vh * vf))).toFixed(3);
          const mhs = b.hs / b.n;
          o.handSwingIn = +(Math.sqrt(Math.max(0, b.hss / b.n - mhs * mhs)) * 2 * 1.4142 * 12).toFixed(1);
          o.elbowDeg = +(b.elb / b.n / U.DEG).toFixed(1);
          o.armsSwingingPct = +(b.sw / b.n * 100).toFixed(1);
          if (b.ag) { o.armOppositePct = +(b.agOk / b.ag * 100).toFixed(2); o.armOppositeFrames = b.ag; }
          if (b.agA) o.armOppositeAllPct = +(b.agAOk / b.agA * 100).toFixed(2);
        }
        cls[k] = o;
      }
      return { byGait: cls, locoFrames: lf, locoPops: lp, locoPopsPerMin: +(lp / Math.max(1e-9, lf * S.stepDt / 60)).toFixed(2), popsBy: top(G.popBy, 12),
        afterMove: { frames: G.after.frames, pops: G.after.pops, popsPerMin: +(G.after.pops / Math.max(1e-9, G.after.frames * S.stepDt / 60)).toFixed(2) },
        transitions: G.trans, transitionsBy: top(G.transBy, 12), transitionPops: G.transPops, transitionPopsBy: top(G.transPopBy, 60), transitionPopAt: G.transPopAt };
    }
    /** the Trial 4 weight scorecard */
    weightSummary() {
      const S = this.S, W = S.wt, pf = (n, d) => +(n / Math.max(1, d) * 100).toFixed(1);
      const top = (o) => Object.entries(o).sort((p, q) => q[1] - p[1]).slice(0, 8);
      const ev = (b) => ({ events: b.n, footPlantedPct: pf(b.plant, b.n), hipDropPct: pf(b.drop, b.n), hipDropIn: summ(b.dropIn, 2), peakFtps2: summ(b.peak, 1), missing: top(b.miss) });
      const byMass = {};
      for (const c of ['light', 'mid', 'heavy']) {
        const b = W.byMass[c]; if (!b) continue;
        byMass[c] = { players: b.n, avgLb: Math.round(b.lb / Math.max(1, b.n)), pushFtps2: summ(b.push, 1), turnRadps2: summ(b.turn, 1) };
      }
      const pm = S.playerFrames * S.stepDt / 60;
      return { cuts: ev(W.cut), brakes: ev(W.brake), turnSnapsPerPlayerMin: +(W.turnSnaps / Math.max(1e-9, pm)).toFixed(2), byMass,
        hipJumpsPerPlayerMin: +(W.hipJumps / Math.max(1e-9, pm)).toFixed(3), hipJumps: W.hipJumps, hipJumpsBy: top(W.hipJumpBy), hipJumpWorstIn: +W.hipJumpWorst.toFixed(2), hipJumpWorstAt: W.hipJumpWorstAt };
    }
    /** the Trial 3 floor scorecard */
    floorSummary() {
      const S = this.S, pf = (n, d) => +(n / Math.max(1, d) * 100).toFixed(2), r2 = (v) => +(+v).toFixed(2);
      const steps = {};
      for (const m in S.step) {
        const b = S.step[m];
        if (b.steps < 10) continue;
        steps[m] = {
          steps: b.steps, clearPct: pf(b.clear, b.steps), unclearWhy: b.why, stanceS: summ(b.stance, 3), swingS: summ(b.swing, 3), clearanceIn: summ(b.clearIn, 2),
          landing: { heelFirstPct: pf(b.heelFirst, b.steps), forefootFirstPct: pf(b.foreFirst, b.steps), flatPct: pf(b.flat, b.steps) },
          ankleContactDeg: summ(b.ankContact, 1), ankleDeepestDeg: summ(b.ankDeep, 1), ankleToeOffDeg: summ(b.ankToeOff, 1), landingMovedIn: summ(b.landErrIn, 2),
        };
      }
      let all = 0, clear = 0;
      for (const m in S.step) { all += S.step[m].steps; clear += S.step[m].clear; }
      const bins = {};
      for (const k of ['walk 3-6', 'jog 6-9', 'run 9-13', 'run 13-18', 'sprint 18+']) {
        const b = S.speedBins[k]; if (!b || b.n < 30) continue;
        const v = b.v / b.n, sps = b.sps / b.n;
        bins[k] = { frames: b.n, speed: r2(v), stepsPerSec: r2(sps), stepLengthFt: r2(v / sps) };
      }
      return { steps: all, clearStepPct: pf(clear, all), byMode: steps, toesVsTravelDeg: Object.assign(summ(S.headTravel, 1), { offPct: pf(S.headTravelOff, S.headTravel.length) }), cadenceBySpeed: bins };
    }
    _pairs(list) {
      const S = this.S, Tn = TU();
      for (const a of list) { const t = this.tr.get(a); if (t) { t.overlap = false; t.handIn = false; } }
      for (let i = 0; i < list.length; i++) {
        const A = list[i]; if (!A || A.hidden || A.y < -1 || A.y > 51) continue;
        for (let k = i + 1; k < list.length; k++) {
          const B = list[k]; if (!B || B.hidden || B.y < -1 || B.y > 51) continue;
          if (Math.hypot(A.x - B.x, A.y - B.y) > 5) continue;
          S.closePairs++;
          const PA = A.sk.P, PB = B.sk.P;
          const d = segSeg(PA, J.PEL, J.NCK, PB, J.PEL, J.NCK);
          if (d < Tn.torsoOverlapFt) { S.torsoOverlap++; this.tracker(A).overlap = true; this.tracker(B).overlap = true; }
          for (const [X, PX, PY] of [[A, PA, PB], [B, PB, PA]]) {
            for (const jh of [J.L_HD, J.R_HD]) {
              if (segDist(PY, J.PEL, J.NCK, PX[jh * 3], PX[jh * 3 + 1], PX[jh * 3 + 2]) < Tn.handInBodyFt) { S.handInBody++; this.tracker(X).handIn = true; }
            }
          }
        }
      }
    }
    /** the scorecard: every counter as rates and distributions (the same keys the Trial 0 audit used) */
    summary() {
      const S = this.S, min = S.frames * S.stepDt / 60, pm = (n) => +(n / Math.max(1e-9, S.playerFrames * S.stepDt / 60)).toFixed(2);
      const pf = (n) => +(n / Math.max(1, S.playerFrames) * 100).toFixed(3);
      const slideAll = S.slide.HEEL.concat(S.slide.BALL, S.slide.TOE);
      const top = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n || 8);
      const ctx = {};
      for (const k in S.slideCtx) { const v = S.slideCtx[k]; if (v.length >= 20) ctx[k] = Object.assign(summ(v), { over1in: over(v, 1) }); }
      const Tn = TU();
      return {
        frames: S.frames, minutes: +min.toFixed(2), playerMinutes: +(S.playerFrames * S.stepDt / 60).toFixed(1),
        feet: {
          slideIn_all: Object.assign(summ(slideAll), { overOk: over(slideAll, Tn.slideOkIn), overBad: over(slideAll, Tn.slideBadIn) }),
          slideIn_heel: Object.assign(summ(S.slide.HEEL), { overOk: over(S.slide.HEEL, Tn.slideOkIn), overBad: over(S.slide.HEEL, Tn.slideBadIn) }),
          slideIn_ball: Object.assign(summ(S.slide.BALL), { overOk: over(S.slide.BALL, Tn.slideOkIn), overBad: over(S.slide.BALL, Tn.slideBadIn) }),
          slideIn_toe: Object.assign(summ(S.slide.TOE), { overOk: over(S.slide.TOE, Tn.slideOkIn), overBad: over(S.slide.TOE, Tn.slideBadIn) }),
          slideOver1in_cause: S.slideCause, slideWorst: +S.slideWorst.toFixed(2), slideWorstAt: S.slideWorstAt, slideByContext: ctx,
          sinkPointFrames: S.sinkFrames, sinkPctPlayerFrames: pf(S.sinkFrames), sinkIn: summ(S.sinkDepth), sinkBy: S.sinkBy, sinkWorstAt: S.sinkWorstAt,
          hoverPctPlantFrames: +(S.hoverFrames / Math.max(1, S.plantFrames) * 100).toFixed(3),
        },
        limits: {
          badPctPlayerFrames: pf(S.limBadFrames), badFrames: S.limBadFrames, badChannels: top(S.limBadChan), firstBad: S.limWorst,
          clampedPctPlayerFrames: pf(S.limClampFrames), clampedChannels: top(S.limClampChan), outOfReachPctPlayerFrames: pf(S.limReachFrames),
        },
        motion: {
          accelSnapsPerPlayerMin: pm(S.accelSnaps), accelSnapContexts: top(S.accelSnapCtx), turnOnsets: S.turnOnsets, instantTurnPct: +(S.turnInstant / Math.max(1, S.turnOnsets) * 100).toFixed(1), instantTurnsPerPlayerMin: pm(S.turnInstant),
          jointSnapsPerPlayerMin: pm(S.jointSnaps), jointSnapsBy: S.jointSnapBy, offBalanceStillPct: +(S.offBalance / Math.max(1, S.groundFrames) * 100).toFixed(3),
        },
        look: { nonePct: pf(S.lookNone), stalePct: pf(S.lookStale), ballPct: pf(S.lookBall), pointPct: pf(S.lookPoint), watchPct: pf(S.lookWatch) },
        hands: {
          dribbleGapIn: Object.assign(summ(S.gap.dribble), { overOk: over(S.gap.dribble, Tn.handGapOkIn) }),
          holdGapIn: Object.assign(summ(S.gap.hold), { overOk: over(S.gap.hold, Tn.handGapOkIn) }),
          shotGapIn: Object.assign(summ(S.gap.shot), { overOk: over(S.gap.shot, Tn.handGapOkIn) }),
          passGapIn: Object.assign(summ(S.gap.pass), { overOk: over(S.gap.pass, Tn.handGapOkIn) }),
          catchGapIn: Object.assign(summ(S.gap.catch), { overOk: over(S.gap.catch, Tn.handGapOkIn) }),
        },
        contact: { torsoOverlapPairFrames: S.torsoOverlap, handInOtherBodyFrames: S.handInBody, closePairFrames: S.closePairs },
        body: this.bodySummary(),
        floor: this.floorSummary(),
        weight: this.weightSummary(),
        gait: this.gaitSummary(),
      };
    }
    /** the Trial 2 body scorecard */
    bodySummary() {
      const S = this.S, cr = S.cr, pf = (n, d) => +(n / Math.max(1, d) * 100).toFixed(2);
      const top = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n || 8);
      const cad = [];
      for (const c of S.cad.values()) if (c.n >= 30) cad.push({ heightIn: +(c.H * 12).toFixed(1), stepsPerSec: +(c.sps / c.n).toFixed(3), speed: +(c.v / c.n).toFixed(2), frames: c.n });
      cad.sort((a, b) => a.heightIn - b.heightIn);
      const grp = (lo, hi) => { const g = cad.filter(c => c.heightIn >= lo && c.heightIn < hi); if (!g.length) return null; const w = g.reduce((s, c) => s + c.frames, 0); return { players: g.length, heightIn: +(g.reduce((s, c) => s + c.heightIn * c.frames, 0) / w).toFixed(1), stepsPerSec: +(g.reduce((s, c) => s + c.stepsPerSec * c.frames, 0) / w).toFixed(3), speed: +(g.reduce((s, c) => s + c.speed * c.frames, 0) / w).toFixed(2) }; };
      return {
        kneeOverToeDeg: Object.assign(summ(S.knee, 1), { cavePct: pf(S.kneeCave, S.knee.length), offPct: pf(S.kneeOff, S.knee.length), offContexts: top(S.kneeCtx) }),
        counterRotation: {
          frames: cr.n, hipShoulderCorrelation: cr.n ? +(cr.ps / Math.sqrt(cr.pp * cr.ss || 1e-12)).toFixed(3) : null,
          oppositePct: pf(cr.opp, cr.n), hipYawDeg: summ(cr.hip, 1), shoulderYawDeg: summ(cr.sh, 1),
        },
        spineShare: {
          flex: Object.assign(summ(S.spShare[0], 3), { kinkPct: pf(S.spKink[0], S.spShare[0].length) }),
          lat: Object.assign(summ(S.spShare[1], 3), { kinkPct: pf(S.spKink[1], S.spShare[1].length) }),
          twist: Object.assign(summ(S.spShare[2], 3), { kinkPct: pf(S.spKink[2], S.spShare[2].length) }),
        },
        spinePopsPerPlayerMin: +(S.spinePops / Math.max(1e-9, S.playerFrames * S.stepDt / 60)).toFixed(2), spinePopsBy: top(S.spinePopBy), spineAccelDegps2: summ(S.spineAcc, 0),
        cadence12to16: { short: grp(0, 76), mid: grp(76, 82), tall: grp(82, 99), players: cad },
        plantedGuard: { pelvisShiftPctPlayerFrames: pf(S.guardFrames, S.playerFrames), pelvisShiftIn: summ(S.guardShift, 2), heelMovedPctPlayerFrames: pf(S.guardAnk, S.playerFrames), lastResortSlips: S.guardSlip },
      };
    }
  }

  // ---------------------------------------------------------------- rewind recorder
  const FSZ = 40; // per-person overlay floats per frame
  class Recorder {
    constructor(seconds, maxP) {
      this.cap = Math.max(60, Math.round(seconds / M.Tune.clock.step));
      this.maxP = maxP || 18;
      this.frames = new Array(this.cap);
      this.head = 0; this.count = 0;
    }
    push(view, meters) {
      const people = [];
      for (const id in view.actors) { const a = view.actors[id]; if (!a.hidden) people.push(a); }
      for (const r of view.refs) people.push(r);
      let f = this.frames[this.head];
      if (!f) {
        const n = this.maxP;
        f = this.frames[this.head] = { t: 0, n: 0, who: new Array(n), P: new Float32Array(n * 81), R: new Float32Array(n * 153), pose: new Float32Array(n * RG.NCH), ov: new Float32Array(n * FSZ), labels: new Array(n), sup: new Array(n), ball: new Float32Array(16), net: new Float32Array(M.Hoop.SNAP * 2), pts: new Uint8Array(n * 6) };
      }
      f.t = view.time;
      const n = Math.min(people.length, this.maxP);
      f.n = n;
      for (let i = 0; i < n; i++) {
        const a = people[i], t = meters ? meters.tracker(a) : null;
        f.who[i] = a;
        f.P.set(a.sk.P, i * 81); f.R.set(a.sk.R, i * 153); f.pose.set(a.sk.pose, i * RG.NCH);
        const o = i * FSZ, ov = f.ov;
        ov.fill(0, o, o + FSZ);
        if (t) {
          ov[o] = t.com[0]; ov[o + 1] = t.com[1]; ov[o + 2] = t.com[2]; ov[o + 3] = t.bal; ov[o + 4] = t.air ? 1 : 0;
          const k = t.kin || {};
          ov[o + 5] = k.vx || 0; ov[o + 6] = k.vy || 0; ov[o + 7] = k.ax || 0; ov[o + 8] = k.ay || 0;
          ov[o + 9] = a.facing; ov[o + 10] = a._wantFace != null ? a._wantFace : a.facing;
          ov[o + 11] = t.look.x; ov[o + 12] = t.look.y; ov[o + 13] = t.look.z; ov[o + 14] = ['none', 'stale', 'ball', 'point', 'watch'].indexOf(t.look.state);
          for (let q = 0; q < 6; q++) { ov[o + 15 + q] = t.pts[q].on ? t.pts[q].cur : -1; }
          ov[o + 21] = t.sink[0]; ov[o + 22] = t.sink[1]; ov[o + 23] = t.hover[0] ? 1 : 0; ov[o + 24] = t.hover[1] ? 1 : 0;
          ov[o + 25] = t.lim.bad.length; ov[o + 26] = t.lim.clamp.length; ov[o + 27] = t.lim.reach.length;
          ov[o + 28] = t.gap == null ? -1e4 : t.gap; ov[o + 29] = ['', 'dribble', 'hold', 'shot', 'pass', 'catch'].indexOf(t.gapKind);
          ov[o + 30] = a.x; ov[o + 31] = a.y; ov[o + 32] = t.overlap ? 1 : 0; ov[o + 33] = t.handIn ? 1 : 0;
          if (t.body) { ov[o + 34] = t.body.kn[0]; ov[o + 35] = t.body.kn[1]; }
          f.labels[i] = t.label;
          f.sup[i] = t.sup.map(q => q.slice());
          f.limBad = f.limBad || new Array(this.maxP); f.limBad[i] = t.lim.bad.map(q => q.slice());
        }
      }
      const b = view.ball;
      f.ball[0] = b.x; f.ball[1] = b.y; f.ball[2] = b.z; f.ball[3] = b.squash || 0; f.ball[4] = b.hidden ? 1 : 0;
      for (let k = 0; k < 9; k++) f.ball[5 + k] = b.rot[k];
      view.hoops.forEach((ho, i) => ho.snapshot(f.net, i * M.Hoop.SNAP));
      this.head = (this.head + 1) % this.cap; this.count = Math.min(this.cap, this.count + 1);
    }
    /** the frame `back` steps behind the newest (0 = newest) */
    at(back) {
      if (back < 0 || back >= this.count) return null;
      return this.frames[(this.head - 1 - back + this.cap * 2) % this.cap];
    }
  }

  // ---------------------------------------------------------------- session (browser)
  const LAYERS = [
    ['feet', 'Foot contacts and slide (F)', 'f'], ['com', 'Centre of mass and balance (M)', 'm'], ['vel', 'Velocity and acceleration (V)', 'v'],
    ['face', 'Facing: hips, chest, wanted (A)', 'a'], ['look', 'Head look target (L)', 'l'], ['label', 'State label (B)', 'b'],
    ['limits', 'Joint limit warning (J)', 'j'], ['hands', 'Hand to ball meter (H)', 'h'], ['skel', 'Skeleton (K)', 'k'],
  ];
  class Session {
    constructor(view, host) {
      this.v = view; this.host = host || {};
      view.debug = this;
      this.meters = new Meters(() => ({ people: this.people(), ball: view.ball, time: view.time, view, dt: M.Tune.clock.step }));
      this.rec = new Recorder(TU().recorderSeconds, 18);
      this.show = { feet: true, com: true, vel: true, face: true, look: true, label: true, limits: true, hands: true, skel: false };
      this.rate = 1; this.paused = false; this.pending = 0; this.back = 0;
      this.sel = null; this.iso = 'off';
      this.orbit = null;
      this.pt = { x: 0, y: 0, s: 0, d: 0 };
      this.lastMs = { step: 0, render: 0 };
      if (typeof document !== 'undefined' && this.host.panel !== false) this._buildPanel();
    }
    people() {
      const v = this.v, out = [];
      for (const id in v.actors) { const a = v.actors[id]; if (!a.hidden) out.push(a); }
      for (const r of v.refs) out.push(r);
      return out;
    }
    destroy() {
      if (this.el) this.el.remove();
      if (this._tick) clearInterval(this._tick);
      if (this._onKey) document.removeEventListener('keydown', this._onKey, true);
      if (this._cv) { this._cv.removeEventListener('pointerdown', this._onDown); this._cv.removeEventListener('wheel', this._onWheel); }
      if (this.v.debug === this) this.v.debug = null;
    }

    // ---- time control (called by View.update)
    scrubbing() { return this.back > 0; }
    /** game time to run this update (0 while paused or rewound) */
    simDt(dt) { return this.paused || this.back > 0 ? 0 : dt * this.rate; }
    /** frame steps requested while paused */
    takeSteps() { const n = this.pending; this.pending = 0; return n; }
    /** step n frames: forward runs the simulation (or walks back up the rewind buffer), backward walks the buffer */
    step(n) {
      this.paused = true;
      if (n < 0) this.back = Math.min(this.rec.count - 1, this.back - n);
      else {
        const up = Math.min(this.back, n);
        this.back -= up;
        this.pending += n - up;
      }
      this.sync();
    }
    setRate(r) { this.rate = r; this.sync(); }
    togglePause() { this.paused = !this.paused; if (!this.paused) this.back = 0; this.sync(); }
    /** after each simulation step: measure and record */
    afterStep() {
      this.meters.frame();
      this.rec.push(this.v, this.meters);
    }
    /** a rewound frame, shaped like View.replayFrame() so the view draws it the same way */
    scrubFrame() {
      const f = this.rec.at(this.back);
      if (!f) return null;
      const out = this._sf || (this._sf = { ghosts: [], bx: 0, by: 0, bz: 0, sq: 0, hidden: 0, rot: new Float64Array(9), net: new Float32Array(M.Hoop.SNAP * 2), f: null });
      out.ghosts.length = 0;
      for (let i = 0; i < f.n; i++) {
        const who = f.who[i];
        const gh = (this._gh || (this._gh = []))[i] || (this._gh[i] = { P: new Float64Array(81), R: new Float64Array(153), pose: new Float32Array(RG.NCH), dims: null, style: null, who: null });
        gh.dims = who.sk.dims; gh.style = who.style; gh.who = who;
        for (let k = 0; k < 81; k++) gh.P[k] = f.P[i * 81 + k];
        for (let k = 0; k < 153; k++) gh.R[k] = f.R[i * 153 + k];
        for (let k = 0; k < RG.NCH; k++) gh.pose[k] = f.pose[i * RG.NCH + k];
        out.ghosts.push(gh);
      }
      out.bx = f.ball[0]; out.by = f.ball[1]; out.bz = f.ball[2]; out.sq = f.ball[3]; out.hidden = f.ball[4];
      for (let k = 0; k < 9; k++) out.rot[k] = f.ball[5 + k];
      out.net.set(f.net);
      out.f = f;
      return out;
    }

    // ---- selection and isolation
    select(a) { this.sel = a; this.sync(); }
    cycle(dir) {
      const list = this.people().filter(a => a.kind === 'player' && a.y > -1).sort((p, q) => (p.team - q.team) || String(p.look.num).localeCompare(String(q.look.num)));
      if (!list.length) return;
      const i = list.indexOf(this.sel);
      this.select(list[(i + (dir || 1) + list.length * 2) % list.length]);
    }
    /** 1 = normal, <1 dimmed, 0 = hidden (for people other than the selected one) */
    alphaFor(a) {
      if (!this.sel || this.iso === 'off' || a === this.sel) return 1;
      return this.iso === 'hide' ? 0 : 0.22;
    }

    // ---- drawing on top of the broadcast frame
    drawOverlay(g, cam, frame) {
      const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
      const T = TU(), C = T.colors, v = this.v;
      const f = frame ? frame.f : null;
      const items = [];
      if (f) {
        for (let i = 0; i < f.n; i++) items.push({ a: f.who[i], P: f.P.subarray(i * 81, i * 81 + 81), R: f.R.subarray(i * 153, i * 153 + 153), ov: f.ov.subarray(i * 40, i * 40 + 40), label: f.labels[i], sup: f.sup[i] || [], bad: f.limBad ? f.limBad[i] || [] : [] });
      } else {
        for (const a of this.people()) {
          const t = this.meters.tracker(a);
          items.push({ a, P: a.sk.P, R: a.sk.R, t, label: t.label, sup: t.sup, bad: t.lim.bad });
        }
      }
      const proj = (x, y, z) => { cam.project(x, y, z, this.pt); return { x: this.pt.x, y: this.pt.y, s: this.pt.s }; };
      g.save();
      g.lineCap = 'round'; g.lineJoin = 'round';
      for (const it of items) {
        const a = it.a;
        if (this.alphaFor(a) === 0) continue;
        if (this.sel && this.iso !== 'off' && a !== this.sel) continue;
        const P = it.P, ov = it.ov, t = it.t;
        const val = (k, live) => (ov ? ov[k] : live);
        if (this.show.skel) this._skel(g, proj, P);
        if (this.show.feet) {
          for (let q = 0; q < 6; q++) {
            const pt = POINTS[q], j = pt.j * 3;
            const on = ov ? ov[15 + q] >= 0 : t.pts[q].on;
            const cur = (ov ? ov[15 + q] : t.pts[q].cur) * IN;
            const p = proj(P[j], P[j + 1], Math.max(0, P[j + 2]));
            const sunk = P[j + 2] < -T.sinkIn / IN;
            if (sunk) { g.fillStyle = C.sink; g.beginPath(); g.arc(p.x, p.y, 4.5, 0, U.TAU); g.fill(); continue; }
            if (!on) continue;
            g.fillStyle = cur < T.slideOkIn ? C.ok : cur < T.slideBadIn ? C.warn : C.bad;
            g.beginPath(); g.arc(p.x, p.y, pt.kind === 'BALL' ? 3.6 : 2.8, 0, U.TAU); g.fill();
            if (cur >= T.slideOkIn) { g.font = '10px ui-monospace, monospace'; g.fillText(cur.toFixed(2) + '"', p.x + 5, p.y - 3); }
          }
          for (let side = 0; side < 2; side++) {
            const hov = ov ? ov[23 + side] : t.hover[side];
            if (hov) { const j = (side ? J.R_BALL : J.L_BALL) * 3, p = proj(P[j], P[j + 1], 0); g.strokeStyle = C.hover; g.lineWidth = 2; g.beginPath(); g.arc(p.x, p.y, 7, 0, U.TAU); g.stroke(); }
          }
        }
        if (this.show.com) {
          const cx = val(0, t && t.com[0]), cy = val(1, t && t.com[1]), cz = val(2, t && t.com[2]), bal = val(3, t && t.bal), air = ov ? ov[4] > 0.5 : t.air;
          const sup = it.sup || [];
          if (sup.length >= 2) {
            g.fillStyle = bal > 0.1 && !air ? C.supportOff : C.support; g.strokeStyle = bal > 0.1 ? C.bad : C.ok; g.lineWidth = 1;
            g.beginPath(); sup.forEach((q, i) => { const p = proj(q[0], q[1], 0.01); if (i) g.lineTo(p.x, p.y); else g.moveTo(p.x, p.y); }); g.closePath(); g.fill(); g.stroke();
          }
          const pc = proj(cx, cy, cz), pg = proj(cx, cy, 0);
          g.strokeStyle = 'rgba(255,225,77,0.5)'; g.lineWidth = 1; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(pc.x, pc.y); g.lineTo(pg.x, pg.y); g.stroke(); g.setLineDash([]);
          g.fillStyle = C.com; g.beginPath(); g.arc(pc.x, pc.y, 4, 0, U.TAU); g.fill();
          g.strokeStyle = '#000'; g.lineWidth = 1; g.stroke();
          g.fillStyle = air ? 'rgba(255,225,77,0.4)' : bal > 0.1 ? C.bad : C.com; g.beginPath(); g.arc(pg.x, pg.y, 3, 0, U.TAU); g.fill();
        }
        if (this.show.vel) {
          const x = ov ? ov[30] : a.x, y = ov ? ov[31] : a.y;
          const vx = val(5, t && t.kin ? t.kin.vx : 0), vy = val(6, t && t.kin ? t.kin.vy : 0), ax = val(7, t && t.kin ? t.kin.ax : 0), ay = val(8, t && t.kin ? t.kin.ay : 0);
          this._arrow(g, proj, x, y, x + vx * T.velArrowS, y + vy * T.velArrowS, C.vel, 2.5);
          this._arrow(g, proj, x, y, x + ax * T.accArrowS2, y + ay * T.accArrowS2, C.acc, 1.8);
        }
        if (this.show.face) {
          const x = ov ? ov[30] : a.x, y = ov ? ov[31] : a.y, wf = val(10, a._wantFace != null ? a._wantFace : a.facing);
          const L = a.H * 0.32, R = it.R;
          this._arrow(g, proj, x, y, x + Math.cos(wf) * L * 1.3, y + Math.sin(wf) * L * 1.3, C.want, 1.2);
          // hips (pelvis frame forward) and chest (chest frame forward) from the solved skeleton: counter-rotation shows
          const yawOf = (fi) => Math.atan2(R[fi * 9 + 4], R[fi * 9 + 1]);
          const hq = J.PEL * 3, cq = J.CHS * 3, hy = yawOf(RG.F.PEL), cyw = yawOf(RG.F.CHS);
          this._arrow3(g, proj, P[hq], P[hq + 1], P[hq + 2], P[hq] + Math.cos(hy) * L, P[hq + 1] + Math.sin(hy) * L, P[hq + 2], C.face, 2);
          this._arrow3(g, proj, P[cq], P[cq + 1], P[cq + 2], P[cq] + Math.cos(cyw) * L, P[cq + 1] + Math.sin(cyw) * L, P[cq + 2], C.chest, 2);
        }
        if (this.show.look) {
          const st = ov ? ['none', 'stale', 'ball', 'point', 'watch'][ov[14]] || 'none' : t.look.state;
          const h = J.HC * 3, ph = proj(P[h], P[h + 1], P[h + 2]);
          if (st === 'none') {
            g.fillStyle = C.lookNone; g.font = 'bold 10px system-ui, sans-serif';
            g.beginPath(); g.arc(ph.x, ph.y - 14, 4, 0, U.TAU); g.fill();
          } else {
            const lx = val(11, t && t.look.x), ly = val(12, t && t.look.y), lz = val(13, t && t.look.z);
            let dx = lx - P[h], dy = ly - P[h + 1], dz = lz - P[h + 2]; const dl = Math.hypot(dx, dy, dz) || 1, k = Math.min(1, T.lookRayFt / dl);
            const pe = proj(P[h] + dx * k, P[h + 1] + dy * k, P[h + 2] + dz * k);
            g.strokeStyle = st === 'stale' ? C.lookStale : C.look; g.lineWidth = 1.2; g.setLineDash(st === 'watch' ? [2, 4] : []);
            g.beginPath(); g.moveTo(ph.x, ph.y); g.lineTo(pe.x, pe.y); g.stroke(); g.setLineDash([]);
            g.beginPath(); g.arc(pe.x, pe.y, 3, 0, U.TAU); g.stroke();
          }
        }
        if (this.show.limits) {
          const bad = it.bad || [];
          const nClamp = ov ? ov[26] : t.lim.clamp.length, nReach = ov ? ov[27] : t.lim.reach.length;
          const seen = new Set();
          for (const q of bad) {
            const j = JOINT_OF[q[0]]; if (j == null || seen.has(j)) continue; seen.add(j);
            const p = proj(P[j * 3], P[j * 3 + 1], P[j * 3 + 2]);
            g.strokeStyle = C.limitBad; g.lineWidth = 2.5; g.beginPath(); g.arc(p.x, p.y, 8, 0, U.TAU); g.stroke();
            g.fillStyle = C.limitBad; g.font = 'bold 10px ui-monospace, monospace';
            g.fillText(CHNAME[q[0]] + ' ' + (q[1] / U.DEG).toFixed(0) + '° (' + (q[2] / U.DEG).toFixed(0) + '..' + (q[3] / U.DEG).toFixed(0) + ')', p.x + 10, p.y);
          }
          if (!ov) {
            for (const i of t.lim.clamp) { const j = JOINT_OF[i]; if (j == null || seen.has(j)) continue; seen.add(j); const p = proj(P[j * 3], P[j * 3 + 1], P[j * 3 + 2]); g.strokeStyle = C.limitClamp; g.lineWidth = 1.5; g.beginPath(); g.arc(p.x, p.y, 6, 0, U.TAU); g.stroke(); }
            for (const i of t.lim.reach) { const j = JOINT_OF[i]; if (j == null || seen.has(j)) continue; seen.add(j); const p = proj(P[j * 3], P[j * 3 + 1], P[j * 3 + 2]); g.strokeStyle = C.limitReach; g.lineWidth = 1.5; g.setLineDash([2, 2]); g.beginPath(); g.arc(p.x, p.y, 6, 0, U.TAU); g.stroke(); g.setLineDash([]); }
          } else if (nClamp + nReach > 0) { /* (rewound frames keep only the violations) */ }
          // knees not over their toes (Trial 2): orange ring and the angle, "in" when caving in
          for (let side = 0; side < 2; side++) {
            const kn = ov ? ov[34 + side] : t.body ? t.body.kn[side] : 0;
            if (Math.abs(kn) <= T.kneeOffDeg * U.DEG) continue;
            const j = (side ? J.R_KN : J.L_KN) * 3, p = proj(P[j], P[j + 1], P[j + 2]);
            g.strokeStyle = C.limitClamp; g.lineWidth = 2; g.beginPath(); g.arc(p.x, p.y, 7, 0, U.TAU); g.stroke();
            g.fillStyle = C.limitClamp; g.font = 'bold 10px ui-monospace, monospace';
            g.fillText('knee ' + (kn > 0 ? 'in ' : 'out ') + Math.abs(kn / U.DEG).toFixed(0) + '°', p.x + 9, p.y + 10);
          }
        }
        if (this.show.hands) {
          const gap = ov ? (ov[28] > -1e3 ? ov[28] : null) : t.gap, kind = ov ? ['', 'dribble', 'hold', 'shot', 'pass', 'catch'][ov[29]] : t.gapKind;
          if (gap != null && kind) {
            const b = frame ? { x: frame.bx, y: frame.by, z: frame.bz } : v.ball;
            const p = proj(b.x, b.y, b.z);
            g.fillStyle = gap < T.handGapOkIn ? C.ok : gap < T.handGapBadIn ? C.warn : C.bad;
            g.font = 'bold 11px ui-monospace, monospace';
            g.fillText(kind + ' ' + gap.toFixed(2) + '"', p.x + 9, p.y + 4);
          }
        }
        if (this.show.label) {
          const h = J.HT * 3, p = proj(P[h], P[h + 1], P[h + 2] + 0.5);
          // (the selected player's full label; everyone else's first two parts, so a crowd stays readable)
          const full = it.label || '', short = full.split(' · ').slice(0, 2).join(' · ');
          const txt = (a.look && a.look.num != null ? '#' + a.look.num + ' ' : '') + (a === this.sel ? full : short);
          g.font = '10.5px system-ui, sans-serif';
          const w = g.measureText(txt).width + 8;
          g.fillStyle = C.labelBg; g.fillRect(p.x - w / 2, p.y - 14, w, 13);
          g.fillStyle = a === this.sel ? '#ffd24a' : C.label; g.textAlign = 'center'; g.fillText(txt, p.x, p.y - 4); g.textAlign = 'left';
        }
        if (a === this.sel) {
          const q = J.PEL * 3, p = proj(P[q], P[q + 1], 0);
          g.strokeStyle = '#ffd24a'; g.lineWidth = 2; g.beginPath(); g.ellipse(p.x, p.y, a.H * 0.3 * p.s, a.H * 0.3 * p.s * Math.max(0.3, cam.sp || 0.35), 0, 0, U.TAU); g.stroke();
        }
      }
      // playback status in the corner
      g.font = 'bold 12px system-ui, sans-serif';
      const st = (this.back > 0 ? 'REWIND -' + this.back + 'f' : this.paused ? 'PAUSED' : this.rate + 'x') + '  f' + this.meters.S.frames;
      const w = g.measureText(st).width + 14;
      g.fillStyle = 'rgba(8,10,16,0.8)'; g.fillRect(cam.W - w - 10, 8, w, 20);
      g.fillStyle = this.back > 0 ? '#ffb000' : this.paused ? '#ff6b6b' : '#8fe3a8'; g.fillText(st, cam.W - w - 3, 22);
      g.restore();
      if (t0) this.lastMs.overlay = performance.now() - t0;
    }
    _skel(g, proj, P) {
      const bones = [[J.PEL, J.SPN], [J.SPN, J.CHS], [J.CHS, J.NCK], [J.NCK, J.HC], [J.L_SH, J.L_EL], [J.L_EL, J.L_WR], [J.L_WR, J.L_HD], [J.R_SH, J.R_EL], [J.R_EL, J.R_WR], [J.R_WR, J.R_HD],
        [J.CHS, J.L_SH], [J.CHS, J.R_SH], [J.PEL, J.L_HIP], [J.PEL, J.R_HIP], [J.L_HIP, J.L_KN], [J.L_KN, J.L_AN], [J.L_AN, J.L_HEEL], [J.L_HEEL, J.L_BALL], [J.L_BALL, J.L_TOE],
        [J.R_HIP, J.R_KN], [J.R_KN, J.R_AN], [J.R_AN, J.R_HEEL], [J.R_HEEL, J.R_BALL], [J.R_BALL, J.R_TOE]];
      g.strokeStyle = 'rgba(120,200,255,0.9)'; g.lineWidth = 1.6; g.beginPath();
      for (const [i, k] of bones) { const p = proj(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]), q = proj(P[k * 3], P[k * 3 + 1], P[k * 3 + 2]); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y); }
      g.stroke();
    }
    _arrow(g, proj, x0, y0, x1, y1, col, w) { this._arrow3(g, proj, x0, y0, 0.03, x1, y1, 0.03, col, w); }
    _arrow3(g, proj, x0, y0, z0, x1, y1, z1, col, w) {
      const p = proj(x0, y0, z0), q = proj(x1, y1, z1);
      const hx = q.x - p.x, hy = q.y - p.y, hl = Math.hypot(hx, hy);
      if (hl < 3) return;
      const ux = hx / hl, uy = hy / hl;
      g.strokeStyle = col; g.fillStyle = col; g.lineWidth = w;
      g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y); g.stroke();
      g.beginPath(); g.moveTo(q.x, q.y); g.lineTo(q.x - ux * 8 - uy * 4, q.y - uy * 8 + ux * 4); g.lineTo(q.x - ux * 8 + uy * 4, q.y - uy * 8 - ux * 4); g.closePath(); g.fill();
    }

    // ---- free orbit camera around the selected player (the broadcast camera cannot turn, so the world is turned
    // for display about the player, the way the Animation Lab does it; the floor becomes court lines and a grid)
    toggleOrbit() {
      if (this.orbit) { this.orbit = null; this.sync(); return; }
      if (!this.sel) this.cycle(1);
      this.orbit = { yaw: -40 * U.DEG, pitch: 18 * U.DEG, dist: 16, cam: new M.Camera(), fx: this.sel ? this.sel.x : 47, fy: this.sel ? this.sel.y : 25, fz: 3 };
      this.sync();
    }
    orbitRender(g, W, H, dpr, frame) {
      const o = this.orbit, v = this.v, cam = o.cam, a = this.sel;
      // follow the selected player (eased)
      const ax = a ? a.x : o.fx, ay = a ? a.y : o.fy;
      o.fx += (ax - o.fx) * 0.25; o.fy += (ay - o.fy) * 0.25;
      if (Math.hypot(ax - o.fx, ay - o.fy) > 8) { o.fx = ax; o.fy = ay; }
      o.vc = Math.cos(o.yaw); o.vs = Math.sin(o.yaw);
      cam.setSize(W, H);
      const camZ = Math.max(0.6, 3 + Math.sin(o.pitch) * o.dist), horiz = Math.cos(o.pitch) * o.dist;
      cam.setPose(o.fx, o.fy - horiz, camZ, Math.atan2(camZ - 3, horiz), 1.2 * H);
      const xf = (x, y, z, out) => { const dx = x - o.fx, dy = y - o.fy; out[0] = o.fx + dx * o.vc - dy * o.vs; out[1] = o.fy + dx * o.vs + dy * o.vc; out[2] = z; return out; };
      const q = [0, 0, 0];
      const proj = (x, y, z) => { xf(x, y, z, q); cam.project(q[0], q[1], q[2], this.pt); return { x: this.pt.x, y: this.pt.y, s: this.pt.s, d: this.pt.d }; };
      this._oproj = proj;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const grd = g.createLinearGradient(0, 0, 0, H); grd.addColorStop(0, '#0b0d12'); grd.addColorStop(1, '#1a1d25');
      g.fillStyle = grd; g.fillRect(0, 0, W, H);
      this._orbitFloor(g, cam, proj, xf);
      // people: skeletons turned with the world (display copies), drawn far to near
      const src = frame ? frame.ghosts.map(gh => ({ sk: gh, a: gh.who })) : this.people().map(p => ({ sk: p.sk, a: p }));
      const people = [];
      for (const s of src) {
        const al = this.alphaFor(s.a); if (al === 0) continue;
        const ds = this._disp(s.a, s.sk, xf);
        people.push({ sk: ds, style: s.a.style, a: s.a, alpha: al, y: ds.P[1] });
      }
      people.sort((p1, p2) => cam.depth(p2.sk.P[1], 3) - cam.depth(p1.sk.P[1], 3));
      const R3 = v.opts.models !== '2d' && M.GL3D ? M.GL3D.get() : null;
      const b = v.ball;
      const bx = frame ? frame.bx : b.x, by = frame ? frame.by : b.y, bz = frame ? frame.bz : b.z;
      const hb = frame ? null : (b.state === 'held' || b.state === 'dead') && b.holder ? b.holder : b.state === 'dribble' && b.dr && b.dr.actor ? b.dr.actor : null;
      let heldBall = null;
      if (hb && R3) {
        const hp = people.find(p => p.a === hb);
        if (hp) { xf(bx, by, bz, q); const rot = this._brot || (this._brot = new Float64Array(9)); for (let k = 0; k < 3; k++) { const r0 = b.rot[k], r1 = b.rot[3 + k]; rot[k] = o.vc * r0 - o.vs * r1; rot[3 + k] = o.vs * r0 + o.vc * r1; rot[6 + k] = b.rot[6 + k]; } heldBall = { sk: hp.sk, x: q[0], y: q[1], z: q[2], R: M.Ball.R, rot, squash: b.squash }; }
      }
      if (R3) U.safe(() => R3.render(cam, people, { dpr, ball: heldBall }), this, 'orbit 3d');
      for (const p of people) v.fr.drawShadow(g, cam, p.sk, 1);
      let ballDrawn = false;
      for (const p of people) {
        g.save(); if (p.alpha < 1) g.globalAlpha = p.alpha;
        if (!(R3 && R3.blit(g, p.sk))) v.fr.draw(g, cam, p.sk, p.style, { dpr, alpha: p.alpha });
        g.restore();
        const c = R3 && R3.cells && R3.cells.get(p.sk); if (c && c.hasBall) ballDrawn = true;
      }
      if (!ballDrawn && !(frame ? frame.hidden : b.hidden)) {
        const p = proj(bx, by, bz), r = M.Ball.R * p.s;
        g.fillStyle = '#e9772a'; g.beginPath(); g.arc(p.x, p.y, r, 0, U.TAU); g.fill(); g.strokeStyle = '#3a1804'; g.lineWidth = 1; g.stroke();
      }
      // overlays in the turned view
      const oc = { W, H, sp: cam.sp, project: (x, y, z, out) => { const p = proj(x, y, z); out.x = p.x; out.y = p.y; out.s = p.s; out.d = p.d; return out; } };
      this.drawOverlay(g, oc, frame);
      g.fillStyle = 'rgba(8,10,16,0.8)'; g.fillRect(10, H - 30, 330, 22);
      g.fillStyle = '#cfd6e6'; g.font = '12px system-ui, sans-serif';
      g.fillText('ORBIT  drag or arrows to turn, wheel or +/- to zoom, O to exit', 16, H - 15);
    }
    _disp(a, sk, xf) {
      const m = this._dmap || (this._dmap = new Map());
      let ds = m.get(a);
      if (!ds) { ds = { P: new Float64Array(81), R: new Float64Array(153), dims: sk.dims, pose: null }; m.set(a, ds); }
      const o = this.orbit, c = o.vc, s = o.vs, q = [0, 0, 0];
      for (let j = 0; j < 81; j += 3) { xf(sk.P[j], sk.P[j + 1], sk.P[j + 2], q); ds.P[j] = q[0]; ds.P[j + 1] = q[1]; ds.P[j + 2] = q[2]; }
      for (let f = 0; f < 153; f += 9) for (let k = 0; k < 3; k++) { const r0 = sk.R[f + k], r1 = sk.R[f + 3 + k]; ds.R[f + k] = c * r0 - s * r1; ds.R[f + 3 + k] = s * r0 + c * r1; ds.R[f + 6 + k] = sk.R[f + 6 + k]; }
      ds.pose = sk.pose; ds.dims = sk.dims;
      return ds;
    }
    _orbitFloor(g, cam, proj, xf) {
      const o = this.orbit, q = [0, 0, 0];
      const line = (pts, col, w) => {
        g.strokeStyle = col; g.lineWidth = w; g.beginPath();
        let on = false;
        for (const [x, y, z] of pts) { xf(x, y, z || 0, q); if (cam.depth(q[1], q[2]) < 1.0) { on = false; continue; } cam.project(q[0], q[1], q[2], this.pt); if (on) g.lineTo(this.pt.x, this.pt.y); else { g.moveTo(this.pt.x, this.pt.y); on = true; } }
        g.stroke();
      };
      const seg = (x0, y0, x1, y1, col, w, n) => { const pts = []; n = n || 16; for (let i = 0; i <= n; i++) pts.push([x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, 0]); line(pts, col, w); };
      const R = 24, x0 = Math.floor(o.fx - R), x1 = Math.ceil(o.fx + R), y0 = Math.floor(o.fy - R), y1 = Math.ceil(o.fy + R);
      for (let x = x0; x <= x1; x++) seg(x, y0, x, y1, x % 5 === 0 ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)', 1);
      for (let y = y0; y <= y1; y++) seg(x0, y, x1, y, y % 5 === 0 ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)', 1);
      const L = 'rgba(240,230,210,0.75)';
      seg(0, 0, 94, 0, L, 2, 40); seg(0, 50, 94, 50, L, 2, 40); seg(0, 0, 0, 50, L, 2, 20); seg(94, 0, 94, 50, L, 2, 20); seg(47, 0, 47, 50, L, 2, 20);
      const arc = (cx, cy, r, a0, a1, z) => { const pts = []; for (let i = 0; i <= 32; i++) { const t = a0 + (a1 - a0) * i / 32; pts.push([cx + Math.cos(t) * r, cy + Math.sin(t) * r, z || 0]); } return pts; };
      line(arc(47, 25, 6, 0, U.TAU), L, 1.5);
      for (const side of [0, 1]) {
        const bx = side ? 94 : 0, dir = side ? -1 : 1, rx = side ? 88.75 : 5.25;
        seg(bx, 17, bx + dir * 19, 17, L, 1.5); seg(bx, 33, bx + dir * 19, 33, L, 1.5); seg(bx + dir * 19, 17, bx + dir * 19, 33, L, 1.5);
        line(arc(bx + dir * 19, 25, 6, -Math.PI / 2, Math.PI / 2).map(p => [bx + dir * 19 + (p[0] - (bx + dir * 19)) * dir, p[1], 0]), L, 1.5);
        const tp = this.v.ctx && this.v.ctx.threePt ? this.v.ctx.threePt : { arc: 23.75, corner: 22 };
        const ang = Math.asin(U.clamp(tp.corner / tp.arc, -1, 1));
        const pts = [[bx, 25 - tp.corner, 0]]; for (let i = 0; i <= 40; i++) { const t = -ang + 2 * ang * i / 40; pts.push([rx + dir * Math.cos(t) * tp.arc, 25 - Math.sin(t) * tp.arc * -1, 0]); } pts.push([bx, 25 + tp.corner, 0]);
        line(pts, L, 1.5);
        line(arc(rx, 25, 0.75, 0, U.TAU, 10), '#ff7a2a', 2.5);
        const bb = side ? 90 : 4;
        line([[bb, 22, 9.5], [bb, 28, 9.5], [bb, 28, 13], [bb, 22, 13], [bb, 22, 9.5]], 'rgba(200,220,255,0.7)', 1.5);
      }
    }

    // ---- panel (DOM)
    _buildPanel() {
      const cv = this.v.canvas;
      const parent = (this.host.parent) || (cv && cv.parentElement) || document.body;
      if (parent && getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
      const el = this.el = document.createElement('div');
      el.className = 'pbc-debug';
      el.style.cssText = 'position:absolute;left:8px;top:8px;z-index:40;width:278px;max-height:calc(100% - 16px);overflow:auto;background:rgba(10,12,18,0.9);color:#dfe5f1;font:11.5px system-ui,sans-serif;border:1px solid #2b3140;border-radius:8px;padding:8px 10px;box-shadow:0 4px 18px rgba(0,0,0,.5)';
      const btn = (txt, fn, title) => { const b = document.createElement('button'); b.textContent = txt; if (title) b.title = title; b.style.cssText = 'background:#1d2230;color:#dfe5f1;border:1px solid #394154;border-radius:5px;padding:2px 7px;margin:2px 3px 2px 0;font:inherit;cursor:pointer'; b.onclick = (e) => { e.stopPropagation(); fn(); }; return b; };
      const row = () => { const d = document.createElement('div'); d.style.margin = '4px 0'; el.appendChild(d); return d; };
      const h = document.createElement('div'); h.innerHTML = '<b style="color:#ffb000">ANIMATION DEBUG</b> <span style="color:#8c95a8">Shift+D closes</span>'; el.appendChild(h);
      const r1 = row(); this.speedBtns = TU().speeds.map(s => { const b = btn(s + 'x', () => this.setRate(s)); r1.appendChild(b); return [s, b]; });
      const r2 = row();
      this.pauseBtn = btn('Pause', () => this.togglePause(), 'Space');
      r2.appendChild(this.pauseBtn); r2.appendChild(btn('◀◀', () => this.step(-10), 'Shift+,')); r2.appendChild(btn('◀', () => this.step(-1), ',')); r2.appendChild(btn('▶', () => this.step(1), '.')); r2.appendChild(btn('▶▶', () => this.step(10), 'Shift+.')); r2.appendChild(btn('Live', () => { this.back = 0; this.paused = false; this.sync(); }));
      const r3 = row();
      r3.appendChild(btn('Prev', () => this.cycle(-1), 'Shift+Tab')); r3.appendChild(btn('Next player', () => this.cycle(1), 'Tab'));
      this.isoBtn = btn('Isolate: off', () => { this.iso = this.iso === 'off' ? 'dim' : this.iso === 'dim' ? 'hide' : 'off'; this.sync(); }, 'I');
      r3.appendChild(this.isoBtn);
      this.orbitBtn = btn('Orbit', () => this.toggleOrbit(), 'O');
      r3.appendChild(this.orbitBtn);
      const r4 = row();
      this.checks = {};
      for (const [k, label] of LAYERS) {
        const lab = document.createElement('label'); lab.style.cssText = 'display:block;cursor:pointer;margin:1px 0';
        const c = document.createElement('input'); c.type = 'checkbox'; c.checked = !!this.show[k]; c.onchange = () => { this.show[k] = c.checked; };
        lab.appendChild(c); lab.appendChild(document.createTextNode(' ' + label)); r4.appendChild(lab); this.checks[k] = c;
      }
      this.info = document.createElement('pre'); this.info.style.cssText = 'white-space:pre-wrap;margin:6px 0;font:10.5px ui-monospace,monospace;color:#c9d2e3'; el.appendChild(this.info);
      const r5 = row();
      r5.appendChild(btn('Copy report', () => this.copyReport())); r5.appendChild(btn('Reset counters', () => this.meters.reset()));
      parent.appendChild(el);
      this._onKey = (e) => this._key(e);
      document.addEventListener('keydown', this._onKey, true);
      if (cv) {
        this._cv = cv;
        this._onDown = (e) => this._down(e);
        this._onWheel = (e) => { if (this.orbit) { e.preventDefault(); this.orbit.dist = U.clamp(this.orbit.dist * (e.deltaY > 0 ? 1.1 : 1 / 1.1), 4, 60); } };
        cv.addEventListener('pointerdown', this._onDown);
        cv.addEventListener('wheel', this._onWheel, { passive: false });
      }
      this.sync();
      this._tick = setInterval(() => this.refreshInfo(), 250);
    }
    _down(e) {
      const cv = this._cv, r = cv.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      if (this.orbit) {
        const o = this.orbit, sx = e.clientX, sy = e.clientY, y0 = o.yaw, p0 = o.pitch;
        const move = (ev) => { o.yaw = y0 + (ev.clientX - sx) * 0.01; o.pitch = U.clamp(p0 + (ev.clientY - sy) * 0.006, 0.02, 1.45); };
        const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
        window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
        return;
      }
      // pick the nearest player to the click (projected pelvis and head)
      const cam = this.v.cam;
      let best = null, bd = 60;
      for (const a of this.people()) {
        if (a.kind !== 'player') continue;
        for (const jj of [J.PEL, J.HC, J.CHS]) {
          cam.project(a.sk.P[jj * 3], a.sk.P[jj * 3 + 1], a.sk.P[jj * 3 + 2], this.pt);
          const d = Math.hypot(this.pt.x - x, this.pt.y - y);
          if (d < bd) { bd = d; best = a; }
        }
      }
      if (best) this.select(best);
    }
    _key(e) {
      if (e.target && e.target.closest && e.target.closest('input[type=text],select,textarea')) return;
      const k = e.key;
      let used = true;
      if (k === ' ') this.togglePause();
      else if (k === ',' || k === '<') this.step(e.shiftKey ? -10 : -1);
      else if (k === '.' || k === '>') this.step(e.shiftKey ? 10 : 1);
      else if (k === '[' || k === ']') { const sp = TU().speeds, i = sp.indexOf(this.rate); this.setRate(sp[U.clamp((i < 0 ? 3 : i) + (k === ']' ? 1 : -1), 0, sp.length - 1)]); }
      else if (k === 'Tab') this.cycle(e.shiftKey ? -1 : 1);
      else if (k === 'i' || k === 'I') { this.iso = this.iso === 'off' ? 'dim' : this.iso === 'dim' ? 'hide' : 'off'; this.sync(); }
      else if (k === 'o' || k === 'O') this.toggleOrbit();
      else if (this.orbit && (k === 'ArrowLeft' || k === 'ArrowRight')) this.orbit.yaw += (k === 'ArrowLeft' ? -1 : 1) * 0.12;
      else if (this.orbit && (k === 'ArrowUp' || k === 'ArrowDown')) this.orbit.pitch = U.clamp(this.orbit.pitch + (k === 'ArrowUp' ? 0.08 : -0.08), 0.02, 1.45);
      else if (this.orbit && (k === '+' || k === '=' || k === '-')) this.orbit.dist = U.clamp(this.orbit.dist * (k === '-' ? 1.12 : 1 / 1.12), 4, 60);
      else {
        used = false;
        for (const [key, , hk] of LAYERS) if (k.toLowerCase() === hk && !e.ctrlKey && !e.metaKey && !e.altKey && !(k === 'D' && e.shiftKey)) { this.show[key] = !this.show[key]; if (this.checks) this.checks[key].checked = this.show[key]; used = true; }
      }
      if (used) { e.preventDefault(); e.stopPropagation(); }
    }
    sync() {
      if (!this.el) return;
      if (this.checks) for (const k in this.checks) this.checks[k].checked = !!this.show[k];
      for (const [s, b] of this.speedBtns) b.style.background = s === this.rate ? '#2f5bd8' : '#1d2230';
      this.pauseBtn.textContent = this.paused ? 'Play' : 'Pause';
      this.isoBtn.textContent = 'Isolate: ' + this.iso;
      this.orbitBtn.style.background = this.orbit ? '#2f5bd8' : '#1d2230';
      this.refreshInfo();
    }
    refreshInfo() {
      if (!this.info) return;
      const a = this.sel, lines = [];
      const S = this.meters.S, Tn = TU();
      if (a) {
        const t = this.meters.tracker(a);
        lines.push((a.look.num != null ? '#' + a.look.num + ' ' : '') + (a.look.last || a.id) + '  ' + (a.H * 12).toFixed(0) + ' in');
        lines.push(t.label || '');
        const k = t.kin || {};
        lines.push('speed ' + a.speed.toFixed(1) + ' ft/s  accel ' + Math.hypot(k.ax || 0, k.ay || 0).toFixed(0) + ' ft/s² (' + (Math.hypot(k.ax || 0, k.ay || 0) / 32.17).toFixed(2) + ' g)');
        lines.push('turn ' + ((k.w || 0) / U.DEG).toFixed(0) + ' deg/s   centre of mass ' + (t.air ? 'in the air' : t.bal > 0.1 ? (a.speed < 1.5 && !a.clip ? 'OFF BALANCE ' : 'outside the base ') + (t.bal * 12).toFixed(1) + ' in' : 'over the base'));
        // (the weight, Trial 4: how hard he is braking and cutting, and how far that has his hips down)
        lines.push('weight ' + Math.round(a.mass || 0) + ' lb   brake ' + (a.brakeK || 0).toFixed(2) + ' cut ' + (a.cutK || 0).toFixed(2) + '   hips down ' + ((a._hipDrop || 0) * 12).toFixed(1) + ' in');
        lines.push('feet L ' + a.feet[0].state + ' R ' + a.feet[1].state + '   slide ' + t.pts.map(p => p.on ? (p.cur * 12).toFixed(2) : '-').join(' '));
        // (the gait, Trial 5: which one, its cadence, and how much of its arm swing the stance lets through)
        { const gd = a.gaitDbg || {}, cls = a.gaitOn ? this.meters.gaitClass(a, null) : null;
          lines.push('gait ' + (cls || '-') + (a.gaitOn && gd.sps ? '   ' + gd.sps.toFixed(2) + ' steps/s, stance ' + Math.round((gd.beta || 0) * 100) + '% of the stride' : '') + '   arm swing ' + Math.round((a.gaitArmK || 0) * 100) + '%'); }
        lines.push('look ' + t.look.state + (t.gap != null ? '   hand-ball ' + t.gap.toFixed(2) + ' in (' + t.gapKind + ')' : ''));
        if (t.lim.bad.length) lines.push('LIMIT ' + t.lim.bad.map(q => CHNAME[q[0]] + ' ' + (q[1] / U.DEG).toFixed(0) + '°').join(', '));
        if (t.lim.clamp.length) lines.push('clamped ' + t.lim.clamp.map(i => CHNAME[i]).join(', '));
        if (t.body) {
          const kn = t.body.kn.map(v => (v ? (v > 0 ? 'in ' : 'out ') + Math.abs(v / U.DEG).toFixed(0) + '°' : '-'));
          const p = a.sk.pose, dg = (k) => (p[CH[k]] / U.DEG).toFixed(0);
          lines.push('knees vs toes L ' + kn[0] + ' R ' + kn[1] + '   ' + (a.H * 12).toFixed(0) + ' in, span ' + (a.look.wing ? a.look.wing + ' in' : '-'));
          lines.push('spine twist ' + dg('pelTwist') + '/' + dg('spTwist') + '/' + dg('chTwist') + '  flex ' + dg('pelPitch') + '/' + dg('spFlex') + '/' + dg('chFlex') + ' (pelvis/lumbar/thoracic)');
        }
      } else lines.push('Click a player (or Tab) to select.');
      lines.push('');
      lines.push('this session: ' + (S.playerFrames * S.stepDt / 60).toFixed(1) + ' player-min');
      const all = S.slide.HEEL.concat(S.slide.BALL, S.slide.TOE);
      lines.push('foot contacts ' + all.length + ', slide > ' + Tn.slideOkIn + ' in: ' + over(all, Tn.slideOkIn) + '%, > ' + Tn.slideBadIn + ' in: ' + over(all, Tn.slideBadIn) + '%');
      lines.push('through floor ' + S.sinkFrames + ' pt-frames, limits past range ' + S.limBadFrames + ' frames');
      lines.push('instant turns ' + S.turnInstant + '/' + S.turnOnsets + ', accel snaps ' + S.accelSnaps + ', look none ' + (S.lookNone / Math.max(1, S.playerFrames) * 100).toFixed(1) + '%');
      { const W = S.wt, pc = (n, d) => d ? Math.round(n / d * 100) + '%' : '-';
        lines.push('hard cuts ' + W.cut.n + ' (plant ' + pc(W.cut.plant, W.cut.n) + ', hips ' + pc(W.cut.drop, W.cut.n) + '), hard stops ' + W.brake.n + ' (plant ' + pc(W.brake.plant, W.brake.n) + ', hips ' + pc(W.brake.drop, W.brake.n) + '), turn snaps ' + W.turnSnaps + ', hip jumps ' + W.hipJumps); }
      // (the gaits, Trial 5: pops per minute in each, pops just after a change of gait, and the arms against the legs)
      { const G = S.gt; let lf = 0, lp = 0, ag = 0, ok = 0; const per = [];
        for (const k of ['walk', 'jog', 'run', 'sprint', 'back', 'slide']) { const b = G.cls[k]; if (!b) continue; lf += b.frames; lp += b.pops; ag += b.ag || 0; ok += b.agOk || 0; per.push(k + ' ' + (b.pops / Math.max(1e-9, b.frames * S.stepDt / 60)).toFixed(1)); }
        lines.push('gait pops/min ' + (lf ? (lp / (lf * S.stepDt / 60)).toFixed(1) : '-') + (per.length ? ' (' + per.join(', ') + ')' : ''));
        lines.push('gait changes ' + G.trans + ', pops after one ' + G.transPops + ', arm opposite the leg ' + (ag ? (ok / ag * 100).toFixed(1) + '%' : '-')); }
      if (this.lastMs.overlay != null) lines.push('overlay ' + this.lastMs.overlay.toFixed(2) + ' ms');
      this.info.textContent = lines.join('\n');
    }
    report() {
      const v = this.v, a = this.sel;
      const out = { when: new Date().toISOString(), time: +v.time.toFixed(3), frame: this.meters.S.frames, back: this.back, rate: this.rate, seed: this.host.seed || null, clock: v.clock ? +v.clock().toFixed(2) : null, period: v.period };
      if (a) { const t = this.meters.tracker(a); out.selected = { id: a.id, num: a.look.num, label: t.label, x: +a.x.toFixed(2), y: +a.y.toFixed(2), speed: +a.speed.toFixed(2), look: t.look.state, handGap: t.gap, limits: t.lim.bad.map(q => [CHNAME[q[0]], +(q[1] / U.DEG).toFixed(1)]) }; }
      out.scorecard = this.meters.summary();
      return JSON.stringify(out, null, 1);
    }
    copyReport() {
      const txt = this.report();
      try { navigator.clipboard.writeText(txt); } catch (e) { /* ignore */ }
      if (typeof console !== 'undefined') console.log(txt);
    }
  }

  /** open or close the tools on a view; host: { seed, parent, panel:false } */
  function toggle(view, host) {
    if (!view) return null;
    if (view.debug) { view.debug.destroy(); return null; }
    return new Session(view, host);
  }
  /** Shift+D opens and closes the tools on whatever view getView() returns */
  function install(getView, host) {
    if (typeof document === 'undefined') return;
    document.addEventListener('keydown', (e) => {
      if ((e.key === 'D' || e.key === 'd') && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.target && e.target.closest && e.target.closest('input,select,textarea')) return;
        e.preventDefault(); e.stopPropagation();
        toggle(getView(), typeof host === 'function' ? host() : host);
      }
    }, true);
  }

  M.Debug = { Meters, Recorder, Session, toggle, install, stateLabel, summ, hull, POINTS };
})();
