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
      frames: fr, tx: sc(d.tx), ty: sc(d.ty), yaw: sc(d.yaw), yaw0: d.yaw0, contacts: [ct(d.c.l), ct(d.c.r)],
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

  /** play clip `name` on actor `a` from where it stands (the lab: the actor's own update and solve hand over to it) */
  function attach(a, name, o) {
    const c = get(name);
    if (!c) return null;
    const pl = new Player(a, c, o);
    a.mocap = pl;
    a.update = function (dt, now) { this.time = now; pl.step(dt); };
    a.solve = function () { pl.solve(); this._inDt = pl.dt || 0; pl.dt = 0; if (this._cacheBody) this._cacheBody(); };
    return pl;
  }

  M.Mocap = { get, list, sample, trackAt, Player, attach, sync };
})();
