/* Pro BBALL Coach, match view: motion capture clips (PBC.Match.Mocap).
 * Clips retargeted onto the rig by tools/mocap (the rig's pose channels, 30 frames a second, a ground track and heading,
 * and the times each foot is on the floor), loaded from js/mocap/*.js. A clip plays on an actor (attach): the pose comes
 * from its frames (cubic between them), the body follows the clip's track (scaled to the player's height and turned to
 * where the actor faced when it started), and each foot on the floor is held where it landed by the legs' IK: on its
 * heel while the toes are still up, on its ball once the foot is flat and as the heel comes up (turning on it as the
 * clip turns it), let go over Tune.mocap.liftS as it lifts off. */
(function () {
  'use strict';
  const M = window.PBC.Match, U = M.U, RG = M.Rig, CH = RG.CH;
  const LIB = {}, ORDER = [];
  let synced = 0;

  function decode(d) {
    const n = d.n, nch = RG.NCH, w = d.ch.length, fr = new Float32Array(n * nch);
    const idx = d.ch.map(k => CH[k]);
    for (let i = 0; i < n; i++) for (let k = 0; k < w; k++) { const c = idx[k]; if (c != null) fr[i * nch + c] = d.f[i * w + k] / d.q[k]; }
    const sc = (a) => Float32Array.from(a, v => v / 1e4);
    const ct = (r) => r.map(q => [q[0] / d.fps, q[1] / d.fps]);
    return {
      name: d.name, label: d.label || d.name, group: d.group, src: d.src, fps: d.fps, n, dur: (n - 1) / d.fps, H: d.H / 12,
      frames: fr, tx: sc(d.tx), ty: sc(d.ty), yaw: sc(d.yaw), yaw0: d.yaw0, contacts: [ct(d.c.l), ct(d.c.r)], ball: d.ball || null,
    };
  }
  /** take in the clips the data scripts have loaded (they load after this one) */
  function sync() {
    const D = window.PBC.MocapData;
    if (!D || D.length === synced) return;
    for (let i = synced; i < D.length; i++) { const d = D[i]; if (!LIB[d.name]) { LIB[d.name] = decode(d); ORDER.push(d.name); } }
    synced = D.length;
  }
  function get(name) { sync(); return LIB[name] || null; }
  function list() { sync(); return ORDER.map(n => LIB[n]); }

  /** the pose at clip time t (Catmull-Rom through the frames) */
  function sample(c, t, out) {
    const nch = RG.NCH, f = c.frames;
    const u = U.clamp(t, 0, c.dur) * c.fps;
    let i = Math.floor(u); if (i > c.n - 2) i = c.n - 2;
    const s = u - i, s2 = s * s, s3 = s2 * s;
    const a0 = Math.max(0, i - 1) * nch, a1 = i * nch, a2 = (i + 1) * nch, a3 = Math.min(c.n - 1, i + 2) * nch;
    for (let k = 0; k < nch; k++) {
      const p0 = f[a0 + k], p1 = f[a1 + k], p2 = f[a2 + k], p3 = f[a3 + k];
      out[k] = 0.5 * (2 * p1 + (p2 - p0) * s + (2 * p0 - 5 * p1 + 4 * p2 - p3) * s2 + (3 * p1 - p0 - 3 * p2 + p3) * s3);
    }
    return out;
  }
  /** the track at clip time t: { x, y } (fractions of the clip's height, the take's own axes) and yaw, from its start */
  function trackAt(c, t, out) {
    const u = U.clamp(t, 0, c.dur) * c.fps;
    let i = Math.floor(u); if (i > c.n - 2) i = c.n - 2;
    const s = u - i;
    out.x = c.tx[i] + (c.tx[i + 1] - c.tx[i]) * s; out.y = c.ty[i] + (c.ty[i + 1] - c.ty[i]) * s; out.yaw = c.yaw[i] + (c.yaw[i + 1] - c.yaw[i]) * s;
    return out;
  }

  const TK = { x: 0, y: 0, yaw: 0 };
  class Player {
    /** o: { delay (s before it starts, the first frame held), rate, mirror } */
    constructor(actor, clip, o) {
      o = o || {};
      this.a = actor; this.c = clip; this.t = 0; this.rate = o.rate || 1; this.delay = o.delay || 0; this.mirror = !!o.mirror;
      // where it starts, and which way the actor faces there
      this.ox = actor.x; this.oy = actor.y; this.of = actor.facing;
      this.pose = new Float32Array(RG.NCH); this.tmp = new Float32Array(RG.NCH);
      this.lock = [null, null]; this.out = [0, 0, 0];
      this.place();
    }
    get done() { return this.t >= this.c.dur; }
    /** the body's spot and facing at the clip's time */
    place() {
      const a = this.a, c = this.c, tk = trackAt(c, this.t, TK);
      // (the take's displacement read along its own start heading, forward and to the right, and laid out from the
      // actor's start heading; mirrored, to the left)
      const H = a.H, fc = Math.cos(c.yaw0), fs = Math.sin(c.yaw0);
      const fwd = (tk.x * fc + tk.y * fs) * H, lat = (tk.x * fs - tk.y * fc) * H * (this.mirror ? -1 : 1);
      const c0 = Math.cos(this.of), s0 = Math.sin(this.of);
      a.x = this.ox + fwd * c0 + lat * s0; a.y = this.oy + fwd * s0 - lat * c0;
      a.facing = U.wrapPi(this.of + (this.mirror ? -tk.yaw : tk.yaw));
    }
    step(dt) {
      const a = this.a;
      if (this.delay > 0) { this.delay -= dt; a.vx = a.vy = a.speed = 0; return; }
      const x0 = a.x, y0 = a.y;
      this.dt = dt;
      this.t = Math.min(this.c.dur, this.t + dt * this.rate);
      this.place();
      if (dt > 0) { a.vx = (a.x - x0) / dt; a.vy = (a.y - y0) / dt; a.speed = Math.hypot(a.vx, a.vy); }
      if (this.ball) this._placeBall();
    }
    /** the dribbled ball where the plan has it now (rendered with the player, as a held ball is) */
    _placeBall() {
      const b = this.ball.b, q = ballAt(this.ball, this.t, this.out);
      b.x = q[0]; b.y = q[1]; b.z = q[2]; b.vx = b.vy = b.vz = 0;
      b.state = 'dead'; b.holder = this.a; b.hidden = false;
    }
    /** how far foot `side` is on the floor (1 planted, easing to 0 over Tune.mocap.liftS after it lifts) and which
     *  contact: { w, i } */
    footW(side) {
      const list = this.c.contacts[this.mirror ? 1 - side : side], t = this.t, L = M.Tune.mocap.liftS;
      for (let i = 0; i < list.length; i++) {
        const r = list[i];
        if (t >= r[0] && t <= r[1]) return { w: 1, i };
        if (t > r[1] && t < r[1] + L) return { w: 1 - U.smooth((t - r[1]) / L), i };
      }
      return { w: 0, i: -1 };
    }
    solve() {
      const a = this.a, sk = a.sk, p = this.pose;
      if (this.mirror) { sample(this.c, this.t, this.tmp); RG.mirrorPose(this.tmp, p); } else sample(this.c, this.t, p);
      // (the pelvis's sway was measured in feet on the clip's body)
      const k = a.H / this.c.H;
      p[CH.rootX] *= k; p[CH.rootY] *= k;
      for (const ik of sk.legIK) ik.on = 0;
      for (const ik of sk.armIK) ik.on = 0;
      sk.dt = 0;
      sk.solve(p, a.x, a.y, a.facing);
      let any = false;
      for (let side = 0; side < 2; side++) {
        const fw = this.footW(side), f = a.feet && a.feet[side];
        if (fw.w > 0) { this._plant(side, fw); any = true; } else this.lock[side] = null;
        // (the actor's feet say which is planted, for the lab's slide meter and footprints)
        if (f) { f.state = fw.w >= 1 ? 'plant' : 'air'; if (this.lock[side]) f.yaw = this.lock[side].yaw; }
      }
      if (any) sk.solve(p, a.x, a.y, a.facing);
    }
    /** hold foot `side` on its spot: on its heel while the clip has the toes clearly up (a heel strike: Tune.mocap.heelDeg,
     *  let go at half of it), on its ball otherwise (flat, the heel coming up, and pivots, which turn on the ball); the
     *  point not held follows the held one, so the hold passes from the heel to the ball without a jump */
    _plant(side, fw) {
      const a = this.a, sk = a.sk, d = a.dims, P = sk.P, R = sk.R, J = RG.J, TM = M.Tune.mocap;
      const ft = (side ? RG.F.R_FT : RG.F.L_FT) * 9;
      const fx = R[ft + 1], fy = R[ft + 4], fz = R[ft + 7];
      // the clip's foot heading and pitch (+ = heel up, the rig's planted convention)
      const yaw = Math.atan2(fy, fx), pitch = -Math.asin(U.clamp(fz / (Math.hypot(fx, fy, fz) || 1), -1, 1));
      const fl = d.heel + d.ball, hd = TM.heelDeg * U.DEG;
      let L = this.lock[side];
      if (!L || L.i !== fw.i) {
        const jb = (side ? J.R_BALL : J.L_BALL) * 3, jh = (side ? J.R_HEEL : J.L_HEEL) * 3;
        const heel = pitch < -hd;
        L = this.lock[side] = { i: fw.i, heel, bx: P[jb], by: P[jb + 1], hx: P[jh], hy: P[jh + 1], yaw, pitch: heel ? Math.min(0, pitch) : Math.max(0, pitch) };
        // (the flat foot's ball spot in front of a heel that has landed)
        if (heel) { L.bx = L.hx + fl * Math.cos(yaw); L.by = L.hy + fl * Math.sin(yaw); }
      }
      // (lifting off, the hold keeps the spot it had and only lets go)
      if (fw.w >= 1) {
        L.heel = L.heel ? pitch < -hd / 2 : pitch < -hd;
        if (L.heel) { L.bx = L.hx + fl * Math.cos(yaw); L.by = L.hy + fl * Math.sin(yaw); L.pitch = Math.min(0, pitch); }
        else { L.hx = L.bx - fl * Math.cos(yaw); L.hy = L.by - fl * Math.sin(yaw); L.pitch = Math.max(0, pitch); }
        L.yaw = yaw;
      }
      const o = a._ankleFromBall(L.bx, L.by, L.yaw, L.pitch, this.out);
      const ik = sk.legIK[side];
      ik.on = fw.w; ik.x = o[0]; ik.y = o[1]; ik.z = o[2]; ik.yaw = L.yaw; ik.pitch = L.pitch;
      ik.soft = false; ik.swv = 0; ik.swRef = null; ik.swNew = false;
    }
  }

  // ------------------------------------------------------------ the ball of a dribbling clip
  /** where the ball goes through a dribbling clip on this body: in a hand from where that hand takes it to where it
   *  pushes it down (a push: the hand's fastest drop, faster than Tune.mocap.pushFtps), and between the two off the
   *  floor, one bounce (FIBA's restitution by impact speed, Ball.eFloor), launched so it meets the hand that takes it
   *  next Tune.mocap.catchLeadS before that hand's highest point. The ball's middle rides a radius out from the palm. */
  function dribblePlan(pl) {
    const a = pl.a, c = pl.c, TM = M.Tune.mocap, R = M.Ball.R;
    const sk = new RG.Skeleton(a.dims), p = new Float32Array(RG.NCH), n = c.n, fps = c.fps, spot = [[], []];
    sk.dt = 0;
    const keep = { t: pl.t, x: a.x, y: a.y, f: a.facing };
    for (let i = 0; i < n; i++) {
      pl.t = i / fps; pl.place();
      if (pl.mirror) { sample(c, pl.t, pl.tmp); RG.mirrorPose(pl.tmp, p); } else sample(c, pl.t, p);
      const k = a.H / c.H; p[CH.rootX] *= k; p[CH.rootY] *= k;
      sk.solve(p, a.x, a.y, a.facing);
      for (let s = 0; s < 2; s++) {
        const j = (s ? RG.J.R_HD : RG.J.L_HD) * 3, f = (s ? RG.F.R_HD : RG.F.L_HD) * 9;
        spot[s].push([sk.P[j] + R * sk.R[f + 1], sk.P[j + 1] + R * sk.R[f + 4], sk.P[j + 2] + R * sk.R[f + 7]]);
      }
    }
    pl.t = keep.t; a.x = keep.x; a.y = keep.y; a.facing = keep.f;
    const vz = (s, i) => { const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1); return (spot[s][i1][2] - spot[s][i0][2]) * fps / Math.max(1, i1 - i0); };
    // the pushes, in order (two closer than minFlightS: the faster one)
    let pushes = [];
    for (let s = 0; s < 2; s++) for (let i = 1; i < n - 1; i++) { const v = vz(s, i); if (v < -TM.pushFtps && v <= vz(s, i - 1) && v < vz(s, i + 1)) pushes.push({ i, s, v }); }
    pushes.sort((x, y) => x.i - y.i);
    const gap = Math.round(TM.minFlightS * fps), pu = [];
    for (const q of pushes) { const l = pu[pu.length - 1]; if (l && q.i - l.i < gap) { if (q.v < l.v) pu[pu.length - 1] = q; } else pu.push(q); }
    pushes = pu;
    const plan = { spot, fps, n, segs: [] };
    if (!pushes.length) { plan.segs.push({ hand: 0, t0: 0, t1: Infinity }); return plan; }
    let from = 0;
    for (let k = 0; k < pushes.length; k++) {
      const q = pushes[k], nx = pushes[k + 1], tr = q.i / fps;
      plan.segs.push({ hand: q.s, t0: from, t1: tr });
      // the hand that takes it: the next push's, at its last highest point before that push; after the last push, the
      // pushing hand's next highest point
      const hs = nx ? nx.s : q.s, lim = nx ? nx.i : n - 1;
      let top = -1;
      for (let i = q.i + gap; i < lim; i++) if (vz(hs, i) > 0 && vz(hs, i + 1) <= 0) { top = i; if (!nx) break; }
      const p0 = spotAt(plan, q.s, tr);
      if (top < 0) {
        // (no hand rises to take it before the clip ends: the pushing hand meets it at the end, if that comes soon, or
        // it bounces on its own)
        const te = (n - 1) / fps;
        if (te - tr < 0.8 && te - tr >= TM.minFlightS) plan.segs.push(flight(p0, tr, spotAt(plan, q.s, te), te));
        else plan.segs.push(flight(p0, tr, null, Infinity, [0, 0, vz(q.s, q.i)]));
        from = Infinity; break;
      }
      const tc = Math.max(tr + TM.minFlightS, top / fps - TM.catchLeadS);
      plan.segs.push(flight(p0, tr, spotAt(plan, hs, tc), tc));
      from = tc;
      if (!nx) { plan.segs.push({ hand: hs, t0: tc, t1: Infinity }); from = Infinity; }
    }
    return plan;
  }
  /** a hand's ball spot at time t (between the frames) */
  function spotAt(plan, s, t) {
    const u = U.clamp(t, 0, (plan.n - 1) / plan.fps) * plan.fps;
    let i = Math.floor(u); if (i > plan.n - 2) i = plan.n - 2;
    const f = u - i, A = plan.spot[s][i], B = plan.spot[s][i + 1];
    return [A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f, A[2] + (B[2] - A[2]) * f];
  }
  /** the ball's height dt after leaving z0 at vertical speed v, bouncing off the floor (its middle at a radius) */
  function heightAfter(z0, v, dt) {
    const G = U.G, R = M.Ball.R;
    let z = z0, t = 0;
    for (let k = 0; k < 6; k++) {
      const tau = (v + Math.sqrt(Math.max(0, v * v + 2 * G * (z - R)))) / G;
      if (t + tau >= dt) { const r = dt - t; return z + v * r - G * r * r / 2; }
      const vi = v - G * tau;
      v = -M.Ball.eFloor(-vi) * vi; z = R; t += tau;
    }
    return R;
  }
  /** a flight from p0 at t0 to p1 at t1: straight across the floor, and the launch speed down that brings it to p1's
   *  height after the bounce (p1 null: launched at v0 and left to bounce) */
  function flight(p0, t0, p1, t1, v0) {
    if (!p1) return { fly: true, t0, t1, p0, vx: 0, vy: 0, v: v0[2] };
    const T = Math.max(1e-3, t1 - t0), want = p1[2];
    const f = (v) => heightAfter(p0[2], v, T) - want;
    // (scan from a gentle drop to a hard push for the sign change, then halve it down)
    let lo = null, hi = null, best = 0, bestE = Infinity;
    for (let v = 2; v >= -45; v -= 1) {
      const e = f(v);
      if (Math.abs(e) < bestE) { bestE = Math.abs(e); best = v; }
      if (hi !== null && Math.sign(e) !== Math.sign(f(hi))) { lo = v; break; }
      hi = v;
    }
    let v = best;
    if (lo !== null) { let a = lo, b = hi; for (let k = 0; k < 40; k++) { const m = (a + b) / 2; if (Math.sign(f(m)) === Math.sign(f(a))) a = m; else b = m; } v = (a + b) / 2; }
    return { fly: true, t0, t1, p0, vx: (p1[0] - p0[0]) / T, vy: (p1[1] - p0[1]) / T, v };
  }
  /** the ball's middle at clip time t */
  function ballAt(plan, t, out) {
    for (const g of plan.segs) {
      if (t < g.t0 || t > g.t1) continue;
      if (!g.fly) { const q = spotAt(plan, g.hand, t); out[0] = q[0]; out[1] = q[1]; out[2] = q[2]; return out; }
      const dt = t - g.t0;
      out[0] = g.p0[0] + g.vx * dt; out[1] = g.p0[1] + g.vy * dt; out[2] = heightAfter(g.p0[2], g.v, dt);
      return out;
    }
    const q = spotAt(plan, plan.segs[plan.segs.length - 1].hand || 0, t); out[0] = q[0]; out[1] = q[1]; out[2] = q[2];
    return out;
  }

  /** play clip `name` on actor `a` from where it stands (the lab: the actor's own update and solve hand over to it) */
  function attach(a, name, o) {
    const c = get(name);
    if (!c) return null;
    const pl = new Player(a, c, o);
    a.mocap = pl;
    // (a dribbling clip brings its ball: off the floor between the hand's pushes and catches, its own physics off)
    const b = a.view && a.view.ball;
    if (c.ball === 'dribble' && b) { pl.ball = dribblePlan(pl); pl.ball.b = b; b.update = function () {}; pl._placeBall(); }
    a.update = function (dt, now) { this.time = now; pl.step(dt); };
    a.solve = function () { pl.solve(); this._inDt = pl.dt || 0; pl.dt = 0; if (this._cacheBody) this._cacheBody(); };
    return pl;
  }

  M.Mocap = { get, list, sample, trackAt, Player, attach, sync, dribblePlan, ballAt };
})();
