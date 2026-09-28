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
        const count = a.kind === 'player' && onCourt;
        if (count) S.playerFrames++;
        this._feet(a, t, count, s);
        this._limits(a, t, count);
        this._com(a, t, count);
        this._kin(a, t, count, dt);
        this._look(a, t, count, ball, s.time);
        this._hands(a, t, count, ball);
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
            // a legal pivot: the ball of the foot on its spot and the heel up; the forefoot turns about the ball
            const bi = pt.side * 3 + 1, hi = pt.side * 3, bst = t.pts[bi], hj = POINTS[hi].j * 3, bj = POINTS[bi].j * 3;
            if (bst.on && P[hj + 2] > Tn.pivotHeelUpFt) {
              const r0 = Math.hypot(st.lx - bst.lx, st.ly - bst.ly), r1 = Math.hypot(P[j] - P[bj], P[j + 1] - P[bj + 1]);
              d = Math.max(bst.cur, Math.abs(r1 - r0));
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
      for (const k of LIMK) {
        const v = p[CH[k]], r = L[k];
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
      t.pops = 0;
      if (k.n >= 3) {
        for (let i = 0; i < POP_J.length; i++) {
          const ax = cur[i * 3] - 2 * p1[i * 3] + p2[i * 3], ay = cur[i * 3 + 1] - 2 * p1[i * 3 + 1] + p2[i * 3 + 1], az = cur[i * 3 + 2] - 2 * p1[i * 3 + 2] + p2[i * 3 + 2];
          const am = Math.hypot(ax, ay, az) / (dt * dt);
          if (am > Tn.jointSnapFtps2) { t.pops++; if (count) { S.jointSnaps++; S.jointSnapBy[POP_NAME[i]] = (S.jointSnapBy[POP_NAME[i]] || 0) + 1; } }
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
        lines.push('feet L ' + a.feet[0].state + ' R ' + a.feet[1].state + '   slide ' + t.pts.map(p => p.on ? (p.cur * 12).toFixed(2) : '-').join(' '));
        lines.push('look ' + t.look.state + (t.gap != null ? '   hand-ball ' + t.gap.toFixed(2) + ' in (' + t.gapKind + ')' : ''));
        if (t.lim.bad.length) lines.push('LIMIT ' + t.lim.bad.map(q => CHNAME[q[0]] + ' ' + (q[1] / U.DEG).toFixed(0) + '°').join(', '));
        if (t.lim.clamp.length) lines.push('clamped ' + t.lim.clamp.map(i => CHNAME[i]).join(', '));
      } else lines.push('Click a player (or Tab) to select.');
      lines.push('');
      lines.push('this session: ' + (S.playerFrames * S.stepDt / 60).toFixed(1) + ' player-min');
      const all = S.slide.HEEL.concat(S.slide.BALL, S.slide.TOE);
      lines.push('foot contacts ' + all.length + ', slide > ' + Tn.slideOkIn + ' in: ' + over(all, Tn.slideOkIn) + '%, > ' + Tn.slideBadIn + ' in: ' + over(all, Tn.slideBadIn) + '%');
      lines.push('through floor ' + S.sinkFrames + ' pt-frames, limits past range ' + S.limBadFrames + ' frames');
      lines.push('instant turns ' + S.turnInstant + '/' + S.turnOnsets + ', accel snaps ' + S.accelSnaps + ', look none ' + (S.lookNone / Math.max(1, S.playerFrames) * 100).toFixed(1) + '%');
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
