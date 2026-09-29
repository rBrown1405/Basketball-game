/* Pro BBALL Coach — match view: the basketball (PBC.Match.Ball).
 * States: held (follows the holder's hands), dribble (rectified-cosine bounce synced to the hand),
 * flight (a chain of time-parameterised segments: passes, shots, rim/board caroms, bounces, a roll around the
 * rim - exact at any playback speed), loose (bouncing/rolling), dead (held by a referee).
 * Physics: air drag on shots and passes, floor bounces with restitution falling with impact speed and friction
 * that turns spin into speed (and back), a glass that returns ~70 % of the normal speed, rolling resistance.
 * Drawn as a lit sphere with rotating seams, squash on floor contact and a soft shadow. */
(function () {
  'use strict';
  const M = window.PBC.Match, U = M.U;
  const R = 0.39, G = U.G;
  const RIM_Z = 10, RIM_R = 0.75;

  // ------------------------------------------------------------ contact physics (docs/ANIMATION_RESEARCH.md)
  const ALPHA = 2 / 3;      // I / (m R^2): a basketball is close to a thin shell
  const MU_FLOOR = 0.55;    // ball-floor friction (no measured value found; 0.5-0.6 assumed)
  const MU_BOARD = 0.45;
  const E_BOARD = 0.7;      // glass (no direct measurement found; 0.65-0.75)
  const DRAG = 0.15;        // linear drag rate (1/s) standing in for Cd ~0.5 drag: 10-17 % of the weight at shot speeds
  const ROLL_DECEL = 1.3;   // ft/s^2: rolling resistance on hardwood, rounded up
  const UP = [0, 0, 1];
  /**
   * Floor restitution by impact speed (ft/s): FIBA's drop test (1.8 m, rebound to 1.035-1.085 m measured to the
   * underside) puts it at ~0.77 at 19 ft/s; tracking data has it falling ~0.013 per ft/s of impact speed.
   */
  function eFloor(vn) { return U.clamp(0.77 + 0.0135 * (19.4 - vn), 0.7, 0.84); }
  /**
   * Rigid-body bounce off a surface with outward unit normal n: the normal velocity reverses with restitution e;
   * friction drives the contact point toward rolling (tangential restitution ~0, Cross) unless it slides (the
   * impulse is capped at mu (1 + e) |vn|). With a thin shell backspin turns into topspin on an angled bounce.
   * v (ft/s) and w (rad/s) are updated in place.
   */
  function bounceOff(v, w, n, e, mu) {
    const vn = v[0] * n[0] + v[1] * n[1] + v[2] * n[2];
    if (vn >= 0) return false;
    // contact point velocity v + w x r (r = -R n), tangential part
    const rx = -R * n[0], ry = -R * n[1], rz = -R * n[2];
    let ux = v[0] + (w[1] * rz - w[2] * ry), uy = v[1] + (w[2] * rx - w[0] * rz), uz = v[2] + (w[0] * ry - w[1] * rx);
    const un = ux * n[0] + uy * n[1] + uz * n[2];
    ux -= un * n[0]; uy -= un * n[1]; uz -= un * n[2];
    let k = -ALPHA / (1 + ALPHA);
    const ul = Math.hypot(ux, uy, uz), cap = mu * (1 + e) * -vn;
    if (ul * -k > cap && ul > 1e-9) k = -cap / ul;
    const jx = ux * k, jy = uy * k, jz = uz * k;
    v[0] += -(1 + e) * vn * n[0] + jx; v[1] += -(1 + e) * vn * n[1] + jy; v[2] += -(1 + e) * vn * n[2] + jz;
    const q = 1 / (ALPHA * R);
    w[0] -= (n[1] * jz - n[2] * jy) * q; w[1] -= (n[2] * jx - n[0] * jz) * q; w[2] -= (n[0] * jy - n[1] * jx) * q;
    return true;
  }
  /** spin about the horizontal axis across the travel (dx, dy): rate < 0 is backspin, > 0 topspin (rad/s) */
  function spinAlong(dx, dy, rate) { const l = Math.hypot(dx, dy) || 1; return [-dy / l * rate, dx / l * rate, 0]; }
  /** distance factor of linear drag: (1 - e^-kt) / k (t without drag) */
  function dragF(k, t) { return k > 1e-6 ? (1 - Math.exp(-k * t)) / k : t; }
  function velAt(v0, t, g, k) {
    if (k > 1e-6) { const e = Math.exp(-k * t), gk = g / k; return [v0[0] * e, v0[1] * e, (v0[2] + gk) * e - gk]; }
    return [v0[0], v0[1], v0[2] - g * t];
  }

  /** a flight segment: gravity grav (default G), optional linear air drag k */
  function seg(t0, p0, v0, dur, grav, k) {
    return { t0, t1: t0 + dur, p0: p0.slice(), v0: v0.slice(), g: grav == null ? G : grav, k: k || 0, ev: null };
  }
  /** launch velocity to go from p0 to p1 in time T (with drag k when given) */
  function aim(p0, p1, T, grav, k) {
    grav = grav == null ? G : grav;
    if (k > 1e-6) {
      const f = dragF(k, T), gk = grav / k;
      return [(p1[0] - p0[0]) / f, (p1[1] - p0[1]) / f, (p1[2] - p0[2] + gk * T) / f - gk];
    }
    return [(p1[0] - p0[0]) / T, (p1[1] - p0[1]) / T, (p1[2] - p0[2]) / T + 0.5 * grav * T];
  }
  /** flight time for a launch angle theta (rad) over horizontal distance d and rise dz */
  function timeForAngle(d, dz, theta) {
    const c = Math.cos(theta), t = Math.tan(theta);
    const den = 2 * c * c * (d * t - dz);
    if (den <= 0.01) return null;
    const v = Math.sqrt(G * d * d / den);
    return d / (v * c);
  }

  // seam curves on the unit sphere (local frame)
  const SEAMS = [];
  (function () {
    const n = 40;
    const eq = [], mer = [], s1 = [], s2 = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n * U.TAU;
      eq.push([Math.cos(t), Math.sin(t), 0]);
      mer.push([0, Math.cos(t), Math.sin(t)]);
      let x = Math.cos(t) * 0.62, y = Math.sin(t) * 0.62, z = 0.78 * Math.cos(2 * t) * 0.5 + 0.55;
      let l = Math.hypot(x, y, z); s1.push([x / l, y / l, z / l]);
      z = -z; l = Math.hypot(x, y, z); s2.push([x / l, y / l, z / l]);
    }
    SEAMS.push(eq, mer, s1, s2);
  })();

  class Ball {
    constructor(view) {
      this.view = view;
      this.x = 47; this.y = 25; this.z = 5; this.vx = 0; this.vy = 0; this.vz = 0;
      this.state = 'dead';
      this.holder = null;
      this.segs = null; this.segI = 0; this.onEnd = null;
      this.rot = new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
      this.spin = [0, 0, 0]; // angular velocity (world axis * rad/s)
      this.squash = 0;
      this.dr = null; // dribble state
      this.hidden = false;
      this.inHoop = null; // hoop reference when passing through the rim zone
      this.time = 0;
      this._pt = { x: 0, y: 0, s: 0, d: 0 };
      this._tmp = new Float64Array(3);
      this.loose_ = null;
      this.lastBounceT = -1;
      this.trail = null;
    }

    // ------------------------------------------------------------ control
    give(actor, hold) {
      if (this.holder && this.holder !== actor) { this.holder.hasBall = false; this.holder.dribble = null; }
      this.holder = actor;
      this.state = actor ? 'held' : 'dead';
      this.segs = null; this.dr = null; this.loose_ = null;
      if (actor) {
        actor.hasBall = true; actor.dribble = null;
        if (hold !== undefined) actor.ballHold = hold;
        actor._holdS = null; // a new hold starts where it belongs (the toss below covers the distance)
        const p = actor.heldBallPos(this._tmp);
        const jump = Math.hypot(p[0] - this.x, p[1] - this.y, p[2] - this.z);
        // never pop: a far hand-over becomes a short toss into the hands, a near one a quick slide into them
        // (a ball gathered on its way up from the floor, the pick-up of a dribble, rises straight into the hands at
        // bounce speed; only a hand-over across the floor gets the lobbed arc)
        if (jump > 1.2 && isFinite(jump)) {
          const rising = p[2] > this.z + 0.4 && Math.hypot(p[0] - this.x, p[1] - this.y) < 3;
          this.blend = rising ? { x: this.x, y: this.y, z: this.z, t: 0, dur: U.clamp(jump / 22, 0.1, 0.24), arc: 0 } : { x: this.x, y: this.y, z: this.z, t: 0, dur: U.clamp(jump / 16, 0.26, 0.55), arc: 1 };
        }
        else if (jump > 0.2 && isFinite(jump)) { this.blend = { x: this.x, y: this.y, z: this.z, t: 0, dur: U.clamp(jump / 8, 0.06, 0.15), arc: 0 }; }
        else { this.blend = null; this.x = p[0]; this.y = p[1]; this.z = p[2]; }
      }
      this.spin[0] = this.spin[1] = this.spin[2] = 0;
    }
    release() {
      if (this.holder) { this.holder.hasBall = false; this.holder.dribble = null; }
      this.holder = null;
    }
    /** start (or continue) dribbling with hand 0/1 */
    dribble(actor, hand, o) {
      o = o || {};
      if (this.holder !== actor) this.give(actor);
      actor.hasBall = true;
      const prev = this.dr && this.dr.actor === actor ? this.dr : null;
      const held = this.state === 'held' && !prev;
      this.state = 'dribble';
      // continue any hand-over toss that is still in progress; otherwise a short settle
      const pb = this.blend;
      const hd = hand == null ? (actor.lefty ? 0 : 1) : hand;
      // out of his hands (Trial 8): the first push starts where the ball is, the hand on top of it, and takes it down
      // and out to the dribble's side (it used to ease over onto the dribble's path first, the hand waiting on the path,
      // up to ~3 ft off the ball)
      let from = null;
      if (held && !(pb && pb.t < pb.dur)) {
        // (in the dribble's frame, the actor's localD)
        const f = actor.facing + (actor.dribbleYaw || 0), c = Math.cos(f), sn = Math.sin(f), rx = this.x - actor.x, ry = this.y - actor.y, sd = hd ? 1 : -1;
        from = { x: (rx * sn - ry * c) * sd, y: rx * c + ry * sn, z: this.z - (actor.jumpZ || 0) };
        this.blend = null;
      } else {
        const top = actor.dribbleTop(hd, TA);
        const far = Math.hypot(top[0] - this.x, top[1] - this.y, top[2] - this.z);
        const dur = Math.max(0.14, U.clamp(far / 26, 0.14, 0.45), pb ? pb.dur - pb.t : 0);
        this.blend = { x: this.x, y: this.y, z: this.z, t: 0, dur, drib: true };
      }
      this.dr = {
        actor, hand: hd,
        // a relaxed control dribble is ~1.4 bounces per second (0.70-0.74 s); players differ a little
        u: prev ? prev.u : from ? 0 : 0.02, period: o.period || 0.64 + ((actor.uid * 37) % 10) * 0.008, low: o.low || 0,
        move: o.move || null, // {type:'cross'|'btl'|'btb', toHand, t}
        cx: 0, cy: 0, planned: false, pickup: false,
        tx: 0, ty: 0, from,
      };
      actor.dribble = { hand: this.dr.hand, w: 1 };
      // (into a stance he can dribble in, if he was standing around: see the actor's setStance)
      if (actor.setStance) actor.setStance(actor.stanceTarget || actor.stance);
      // (an upper-body clip about holding the ball, a catch or a pass he did not make, has nothing left to do: it fades,
      // Trial 8; still playing, a catch's lean put his shoulder over the ball, out of the dribbling hand's reach)
      const up = actor.upper;
      if (up && up.clip.ballKeys && !up.ending) { up.ending = true; up.fadeOut = M.Tune.handle.upperOutS; }
    }
    /** perform a dribble move: crossover / between the legs / behind the back (switches hands) */
    dribbleMove(type, o) {
      const d = this.dr;
      if (!d) return;
      d.pendingMove = { type, toHand: 1 - d.hand, onDone: o && o.onDone, period: (o && o.period) || 0.36 };
    }
    /**
     * the spin move's pull: the dribbling hand takes the ball as it comes up and keeps it on top, pulled back tight
     * to the hip while the body turns (it goes around with him); after `hold` s it is pushed down and crosses to the
     * other hand, a bounce that stays where it hits the floor instead of swinging around with the body
     */
    spinPull(hold, period) {
      const d = this.dr;
      if (!d) return;
      d.pendingMove = null;
      d.pull = { t: 0, hold, period: period || 0.34, on: false, k: 0, q0: null };
    }
    /** flight through the given list of waypoints builder: returns the segment list */
    flight(segs, onEnd) {
      this.release();
      this.state = 'flight';
      this.segs = segs; this.segI = 0; this.onEnd = onEnd || null;
      this.dr = null;
      this.flightStart = this.time;
      for (const s of segs) s.fired = false;
      if (segs[0] && segs[0].w) { this.spin[0] = segs[0].w[0]; this.spin[1] = segs[0].w[1]; this.spin[2] = segs[0].w[2]; }
    }
    /** pass: from current position to a (possibly moving) target */
    pass(p1, dur, o) {
      o = o || {};
      const t0 = this.time;
      const p0 = [this.x, this.y, this.z];
      const segs = [];
      const sp = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) / dur;
      const bp = o.bounce ? this._bouncePass(p0, p1, dur) : null;
      if (bp) segs.push(bp[0], bp[1]);
      else if (o.bounce) {
        // (no real bounce fits: floor contact ~2/3 of the way)
        const f = 0.62;
        const pb = [U.lerp(p0[0], p1[0], f), U.lerp(p0[1], p1[1], f), R];
        const d1 = dur * 0.58, d2 = dur - d1;
        segs.push(seg(t0, p0, aim(p0, pb, d1, G * 0.9), d1, G * 0.9));
        const s2 = seg(t0 + d1, pb, aim(pb, p1, d2, G * 1.1), d2, G * 1.1);
        s2.bounce = true;
        segs.push(s2);
      } else {
        // real gravity and air drag: a quick pass is nearly flat, a long one arcs
        segs.push(seg(t0, p0, aim(p0, p1, dur, G, DRAG), dur, G, DRAG));
      }
      // backspin off the fingers
      if (!segs[0].w) segs[0].w = spinAlong(p1[0] - p0[0], p1[1] - p0[1], -sp / R * 0.3);
      segs[segs.length - 1].target = o.target || null; // function returning live target [x,y,z]
      this.flight(segs, o.onArrive);
    }
    /**
     * Bounce pass with a real floor bounce: the floor contact time is found so that after the bounce (restitution
     * by impact speed, friction against the backspin) it rises to the receiver's hands at `dur` (nearest ~58 % of
     * the flight when two fit), and the release speed so that it still covers the distance after the bounce takes
     * some of its speed. Returns the two segments, or null when none fits.
     */
    _bouncePass(p0, p1, dur) {
      const D = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
      if (D < 3 || dur < 0.3 || p0[2] < R) return null;
      const ux = (p1[0] - p0[0]) / D, uy = (p1[1] - p0[1]) / D;
      const drop = (t1) => {
        const v0z = (R - p0[2] + 0.5 * G * t1 * t1) / t1, vi = v0z - G * t1, t2 = dur - t1;
        if (vi > -2) return null;
        const vu = -vi * eFloor(-vi);
        return { v0z, vi, f: R + vu * t2 - 0.5 * G * t2 * t2 - p1[2] };
      };
      let best = null, prev = null, top = null;
      for (let k = 0; k <= 30; k++) {
        const t1 = dur * (0.25 + 0.67 * k / 30), r = drop(t1);
        if (r && (!top || r.f > top.f)) top = { t1, f: r.f };
        if (r && prev && (prev.f > 0) !== (r.f > 0)) {
          let a = prev.t1, b = t1, fa = prev.f;
          for (let it = 0; it < 30; it++) { const m = 0.5 * (a + b), rm = drop(m); if (!rm) break; if ((rm.f > 0) === (fa > 0)) { a = m; fa = rm.f; } else b = m; }
          const tt = 0.5 * (a + b);
          if (best == null || Math.abs(tt - dur * 0.58) < Math.abs(best - dur * 0.58)) best = tt;
        }
        prev = r ? { t1, f: r.f } : null;
      }
      // (a long, slow one comes up short of the hands: take the highest it gets there if that is close; the catch
      // homes the last bit)
      if (best == null && top && top.f > -1.2) best = top.t1;
      if (best == null) return null;
      const t1 = best, r = drop(t1), t2 = dur - t1;
      if (!r) return null;
      const after = (vh) => { const v = [ux * vh, uy * vh, r.vi], w = spinAlong(ux, uy, -vh / R * 0.3); bounceOff(v, w, UP, eFloor(-r.vi), MU_FLOOR); return { v, w }; };
      let lo = D / dur * 0.5, hi = D / dur * 4;
      for (let it = 0; it < 40; it++) {
        const m = 0.5 * (lo + hi), a = after(m);
        if (m * t1 + (a.v[0] * ux + a.v[1] * uy) * t2 < D) lo = m; else hi = m;
      }
      const vh = 0.5 * (lo + hi), a = after(vh);
      const pb = [p0[0] + ux * vh * t1, p0[1] + uy * vh * t1, R];
      const s1 = seg(this.time, p0, [ux * vh, uy * vh, r.v0z], t1); s1.w = spinAlong(ux, uy, -vh / R * 0.3);
      const s2 = seg(this.time + t1, pb, a.v, t2); s2.bounce = true; s2.w = a.w;
      return [s1, s2];
    }
    /** backspin/forward roll about the horizontal axis perpendicular to travel */
    setSpinAlong(dx, dy, rate) {
      const w = spinAlong(dx, dy, rate);
      this.spin[0] = w[0]; this.spin[1] = w[1]; this.spin[2] = w[2];
    }

    /**
     * shot: from the current ball position at the hoop.
     * o: {hoop, result:'swish'|'rim_in'|'bank'|'miss'|'airball'|'blocked', miss:{contact:'front'|'back'|'left'|'right'|'board'}, rebound:{x,y,z,t}, angle,
     *     onScore(), onRim(), onEnd()}
     * Returns {tRim (time the ball reaches the rim plane or contact), tEnd}
     */
    shoot(o) {
      const hoop = o.hoop;
      const s = hoop.side;
      const t0 = this.time;
      const p0 = [this.x, this.y, this.z];
      const rim = [hoop.rx, hoop.ry, RIM_Z];
      const segs = [];
      const d = Math.hypot(rim[0] - p0[0], rim[1] - p0[1]);
      const theta = (o.angle || (d < 6 ? 58 : 50)) * U.DEG;
      const res = o.result || 'swish';
      let contact, T;
      const toShooter = [(p0[0] - rim[0]) / (d || 1), (p0[1] - rim[1]) / (d || 1)];
      // backspin off the fingertips: ~1.7 rev/s measured on jump shots and free throws (1.1-2.4)
      const wShot = spinAlong(rim[0] - p0[0], rim[1] - p0[1], -U.TAU * (1.45 + Math.random() * 0.6));
      // a make that rolls around the rim before it drops (the rest bounce up off the rim and in)
      let orbit = null;
      if (res === 'rim_in' && (o.roll != null ? o.roll : Math.random() < 0.3)) {
        // it lands on the front of the ring a little to one side and rides around it that way: the centre ~0.17 ft
        // inside the ring and ~0.36 ft above it, friction taking about half its speed before it falls in
        const dir = Math.random() < 0.5 ? 1 : -1, To = 0.35 + Math.random() * 0.45, w0 = dir * (4.5 + Math.random() * 2);
        orbit = { cx: rim[0], cy: rim[1], r: RIM_R - 0.17, z: RIM_Z + 0.36, a0: Math.atan2(toShooter[1], toShooter[0]) + dir * (0.35 + Math.random() * 0.5), w: w0, dw: -w0 * 0.55 / To, T: To };
      }
      if (res === 'swish' || res === 'rim_in' || res === 'miss' || res === 'airball') {
        let target = rim.slice();
        if (res === 'rim_in') target = orbit ? [orbit.cx + Math.cos(orbit.a0) * orbit.r, orbit.cy + Math.sin(orbit.a0) * orbit.r, orbit.z] : [rim[0] - toShooter[0] * 0.5, rim[1] - toShooter[1] * 0.5, RIM_Z + 0.12];
        if (res === 'miss') {
          let c = (o.miss && o.miss.contact) || 'front';
          // a side miss comes off to the side it hit
          if ((c === 'left' || c === 'right') && o.rebound) {
            const lat = (o.rebound.x - rim[0]) * -toShooter[1] + (o.rebound.y - rim[1]) * toShooter[0];
            if (Math.abs(lat) > 1) c = lat > 0 ? 'left' : 'right';
          }
          let ox = 0, oy = 0;
          if (c === 'front') { ox = toShooter[0] * 0.62; oy = toShooter[1] * 0.62; }
          else if (c === 'back') { ox = -toShooter[0] * 0.66; oy = -toShooter[1] * 0.66; }
          else if (c === 'left' || c === 'right') { const sg = c === 'left' ? 1 : -1; ox = -toShooter[1] * 0.62 * sg; oy = toShooter[0] * 0.62 * sg; }
          target = [rim[0] + ox, rim[1] + oy, RIM_Z + R * 0.75];
          if (c === 'board') target = [hoop.bx + s * -R * 1.02, rim[1] + (Math.random() - 0.5) * 1.2, RIM_Z + 1.4 + Math.random() * 0.8];
        }
        if (res === 'airball') target = [rim[0] - toShooter[0] * 1.4, rim[1] + (Math.random() - 0.5) * 2.5, RIM_Z - 0.4];
        const dd = Math.hypot(target[0] - p0[0], target[1] - p0[1]);
        T = timeForAngle(dd, target[2] - p0[2], theta) || Math.max(0.5, dd / 20);
        if (o.duration) T = o.duration;
        segs.push(seg(t0, p0, aim(p0, target, T, G, DRAG), T, G, DRAG));
        contact = target;
      } else if (res === 'bank') {
        // off the glass: the spot on the board is found whose carom (the glass returns ~70 % of the speed into it,
        // friction with the backspin adds downward speed) drops through the middle of the rim
        const n = [-s, 0, 0], xh = hoop.bx - s * R * 1.02;
        let hy = rim[1] + (p0[1] - rim[1]) * 0.3, hz = RIM_Z + 1.3, sol = null;
        for (let it = 0; it < 10 && !sol; it++) {
          const hit = [xh, hy, hz];
          const dd = Math.hypot(hit[0] - p0[0], hit[1] - p0[1]);
          const Tb = timeForAngle(dd, hit[2] - p0[2], theta - 4 * U.DEG) || Math.max(0.5, dd / 20);
          const v0 = aim(p0, hit, Tb, G, DRAG), vi = velAt(v0, Tb, G, DRAG), wi = wShot.slice();
          bounceOff(vi, wi, n, E_BOARD, MU_BOARD);
          const t2 = (rim[0] - xh) / vi[0];
          if (!(t2 > 0.04 && t2 < 0.5)) break;
          const ey = rim[1] - (hy + vi[1] * t2), ez = RIM_Z + 0.2 - (hz + vi[2] * t2 - 0.5 * G * t2 * t2);
          if (Math.abs(ey) < 0.02 && Math.abs(ez) < 0.02) { sol = { hit, Tb, v0, vi, wi, t2 }; break; }
          hy += ey; hz += ez;
          if (hz < RIM_Z + 0.75 || hz > RIM_Z + 3 || Math.abs(hy - rim[1]) > 2.9) break;
        }
        if (sol) {
          T = sol.Tb;
          segs.push(seg(t0, p0, sol.v0, T, G, DRAG));
          const s1 = seg(t0 + T, sol.hit, sol.vi, sol.t2); s1.board = true; s1.w = sol.wi;
          segs.push(s1);
          contact = sol.hit;
        } else {
          const hit = [hoop.bx - s * R * 1.02, rim[1] + (p0[1] - rim[1]) * 0.05, RIM_Z + 1.25];
          const dd = Math.hypot(hit[0] - p0[0], hit[1] - p0[1]);
          T = timeForAngle(dd, hit[2] - p0[2], theta - 6 * U.DEG) || Math.max(0.5, dd / 20);
          segs.push(seg(t0, p0, aim(p0, hit, T, G, DRAG), T, G, DRAG));
          const s1 = seg(t0 + T, hit, aim(hit, [rim[0], rim[1], RIM_Z], 0.22), 0.22);
          s1.board = true;
          segs.push(s1);
          contact = hit;
        }
      }
      segs[0].shot = true; segs[0].w = wShot;
      let tAt = t0 + T;
      const last = () => segs[segs.length - 1];
      // result tail
      if (res === 'swish' || res === 'bank') {
        const s0 = last();
        const pRim = res === 'bank' ? this._segPos(s0, s0.t1, [0, 0, 0]) : contact;
        const tRim = s0.t1;
        this._throughNet(segs, pRim, tRim, hoop, o, res === 'swish');
      } else if (orbit) {
        const s0 = last();
        const so = seg(s0.t1, contact, [0, 0, 0], orbit.T, 0); so.orbit = orbit; so.rim = true; so.soft = true;
        segs.push(so);
        // off the ring and in
        const pe = this._segPos(so, so.t1, [0, 0, 0]);
        const ae = Math.atan2(pe[1] - rim[1], pe[0] - rim[0]);
        const pin = [rim[0] + Math.cos(ae) * 0.22, rim[1] + Math.sin(ae) * 0.22, RIM_Z - 0.05];
        const sd = seg(so.t1, pe, aim(pe, pin, 0.16), 0.16);
        segs.push(sd);
        this._throughNet(segs, pin, sd.t1, hoop, o, false);
      } else if (res === 'rim_in') {
        const s0 = last();
        const up = [rim[0] - toShooter[0] * 0.15, rim[1] - toShooter[1] * 0.15, RIM_Z + 0.95];
        const s1 = seg(s0.t1, contact, aim(contact, up, 0.26), 0.26); s1.rim = true;
        segs.push(s1);
        const s2 = seg(s1.t1, up, aim(up, [rim[0], rim[1], RIM_Z], 0.22), 0.22);
        segs.push(s2);
        this._throughNet(segs, [rim[0], rim[1], RIM_Z], s2.t1, hoop, o, false);
      } else if (res === 'miss' || res === 'airball') {
        const s0 = last();
        const rb = o.rebound || { x: rim[0] + toShooter[0] * 8, y: rim[1] + toShooter[1] * 4, z: 8.5, t: s0.t1 + 1.0 };
        const tC = Math.max(0.35, rb.t - s0.t1);
        if (res === 'miss' && (o.miss && o.miss.rattle)) {
          // rattle: small hop on the rim first
          const hop = [rim[0] + (Math.random() - 0.5) * 0.8, rim[1] + (Math.random() - 0.5) * 0.8, RIM_Z + 0.9];
          const s1 = seg(s0.t1, contact, aim(contact, hop, 0.24), 0.24); s1.rim = true;
          segs.push(s1);
          const hop2 = [rim[0] + (contact[0] - rim[0]) * -0.9, rim[1] + (contact[1] - rim[1]) * -0.9, RIM_Z + R * 0.8];
          const s2 = seg(s1.t1, hop, aim(hop, hop2, 0.2), 0.2);
          segs.push(s2);
          const tLeft = Math.max(0.3, tC - 0.44);
          const s3 = seg(s2.t1, hop2, aim(hop2, [rb.x, rb.y, rb.z], tLeft), tLeft); s3.rim = true;
          segs.push(s3);
        } else {
          const s1 = seg(s0.t1, contact, aim(contact, [rb.x, rb.y, rb.z], tC), tC);
          if (res === 'miss') { if (o.miss && o.miss.contact === 'board') s1.board = true; else s1.rim = true; }
          segs.push(s1);
        }
        if (rb.floor) this._bounceTail(segs);
      }
      this.flight(segs, o.onEnd);
      this.shotHoop = hoop;
      this.onScore = o.onScore || null;
      this.onRim = o.onRim || null;
      return { tContact: tAt, tEnd: segs[segs.length - 1].t1, segs };
    }
    _throughNet(segs, pRim, tRim, hoop, o, swish) {
      // drop through the net: it checks the ball for a moment (slowed, almost vertical) and takes most of its spin
      const pNet = [hoop.rx + (pRim[0] - hoop.rx) * 0.2, hoop.ry + (pRim[1] - hoop.ry) * 0.2, RIM_Z - 1.6];
      const s1 = seg(tRim, pRim, aim(pRim, pNet, 0.2, G * 0.4), 0.2, G * 0.4);
      s1.score = true; s1.swish = swish;
      const w0 = segs[0] && segs[0].w ? segs[0].w : [0, 0, 0];
      s1.w = [w0[0] * 0.35, w0[1] * 0.35, w0[2] * 0.35];
      segs.push(s1);
      // fall to the floor, bounce toward the baseline side
      const out = hoop.side;
      const pF = [hoop.rx + out * 0.4 + (Math.random() - 0.5) * 1.5, hoop.ry + (Math.random() - 0.5) * 3, R];
      const tf = Math.sqrt(2 * (pNet[2] - R) / G) * 0.95;
      const s2 = seg(s1.t1, pNet, aim(pNet, pF, tf), tf); s2.w = [w0[0] * 0.2, w0[1] * 0.2, (Math.random() - 0.5) * 4];
      segs.push(s2);
      this._bounceTail(segs, out * 0.35);
    }
    /**
     * Append the bounces after the last segment (which must end on the floor): each one with the floor's
     * restitution for its impact speed and friction working the spin (a ball with backspin checks up, one with
     * topspin skips on), then the roll until rolling resistance stops it.
     */
    _bounceTail(segs, drift) {
      let s = segs[segs.length - 1];
      const p = this._segPos(s, s.t1, [0, 0, 0]);
      const v = this._segVel(s, s.t1, [0, 0, 0]);
      const w = s.w ? s.w.slice() : [0, 0, 0];
      p[2] = R;
      if (drift) v[0] += drift;
      for (let i = 0; i < 12; i++) {
        if (v[2] > -1) break;
        bounceOff(v, w, UP, eFloor(-v[2]), MU_FLOOR);
        if (v[2] < 3) break;
        const T = 2 * v[2] / G;
        const ns = seg(s.t1, p, v, T); ns.bounce = true; ns.w = w.slice();
        segs.push(ns);
        p[0] += v[0] * T; p[1] += v[1] * T; p[2] = R;
        v[2] = -v[2];
        s = ns;
      }
      const vh = Math.hypot(v[0], v[1]);
      const roll = seg(s.t1, p, [v[0], v[1], 0], U.clamp(vh / ROLL_DECEL, 0.4, 3.2), 0);
      roll.roll = true; roll.bounce = true; roll.a = ROLL_DECEL;
      segs.push(roll);
    }
    /** loose ball from current position with a velocity: bounces and rolls */
    loose(vel, o) {
      const p0 = [this.x, this.y, Math.max(R, this.z)];
      const segs = [];
      const vz = vel[2];
      const tUp = (vz + Math.sqrt(vz * vz + 2 * G * (p0[2] - R))) / G;
      const s0 = seg(this.time, p0, vel, Math.max(0.05, tUp));
      // knocked loose it tumbles, with some topspin or backspin
      s0.w = spinAlong(vel[0], vel[1], Math.hypot(vel[0], vel[1]) / R * (Math.random() - 0.5) * 1.2);
      segs.push(s0);
      this._bounceTail(segs);
      this.flight(segs, o && o.onEnd);
      this.state = 'loose';
    }
    /** place dead ball in the hands of a ref or on the floor */
    placeAt(x, y, z) { this.release(); this.state = 'dead'; this.segs = null; this.x = x; this.y = y; this.z = z; }

    _segPos(s, t, out) {
      const dt = Math.max(0, Math.min(t, s.t1) - s.t0);
      if (s.orbit) {
        // riding around the ring
        const o = s.orbit, a = o.a0 + (o.w + 0.5 * o.dw * dt) * dt;
        out[0] = o.cx + Math.cos(a) * o.r; out[1] = o.cy + Math.sin(a) * o.r; out[2] = o.z;
        return out;
      }
      if (s.roll) {
        // rolling resistance: a constant deceleration until it stops
        const vh = Math.hypot(s.v0[0], s.v0[1]), a = s.a || ROLL_DECEL;
        const tt = vh > 1e-6 ? Math.min(dt, vh / a) : 0, d = vh * tt - 0.5 * a * tt * tt, k = vh > 1e-6 ? d / vh : 0;
        out[0] = s.p0[0] + s.v0[0] * k; out[1] = s.p0[1] + s.v0[1] * k; out[2] = R;
        return out;
      }
      if (s.k > 1e-6) {
        const f = dragF(s.k, dt), gk = s.g / s.k;
        out[0] = s.p0[0] + s.v0[0] * f; out[1] = s.p0[1] + s.v0[1] * f; out[2] = s.p0[2] + (s.v0[2] + gk) * f - gk * dt;
        return out;
      }
      out[0] = s.p0[0] + s.v0[0] * dt;
      out[1] = s.p0[1] + s.v0[1] * dt;
      out[2] = s.p0[2] + s.v0[2] * dt - 0.5 * s.g * dt * dt;
      return out;
    }
    _segVel(s, t, out) {
      const dt = Math.max(0, Math.min(t, s.t1) - s.t0);
      if (s.orbit) {
        const o = s.orbit, a = o.a0 + (o.w + 0.5 * o.dw * dt) * dt, wv = o.w + o.dw * dt;
        out[0] = -Math.sin(a) * o.r * wv; out[1] = Math.cos(a) * o.r * wv; out[2] = 0;
        return out;
      }
      if (s.roll) {
        const vh = Math.hypot(s.v0[0], s.v0[1]), a = s.a || ROLL_DECEL, k = vh > 1e-6 ? Math.max(0, vh - a * dt) / vh : 0;
        out[0] = s.v0[0] * k; out[1] = s.v0[1] * k; out[2] = 0;
        return out;
      }
      const v = velAt(s.v0, dt, s.g, s.k);
      out[0] = v[0]; out[1] = v[1]; out[2] = v[2];
      return out;
    }
    /** remaining flight time (to end of all segments) */
    flightEnd() { return this.segs ? this.segs[this.segs.length - 1].t1 : this.time; }
    /** position at an absolute time along the current flight */
    posAt(t, out) {
      if (!this.segs) { out[0] = this.x; out[1] = this.y; out[2] = this.z; return out; }
      let s = this.segs[this.segs.length - 1];
      for (const q of this.segs) if (t <= q.t1) { s = q; break; }
      return this._segPos(s, t, out);
    }

    // ------------------------------------------------------------ update
    update(dt, now) {
      this.time = now != null ? now : this.time + dt;
      const px = this.x, py = this.y, pz = this.z;
      if (this.state === 'held' && this.holder) {
        const p = this.holder.heldBallPos(this._tmp);
        const bl = this.blend;
        if (bl) {
          bl.t += dt;
          const u = U.clamp(bl.t / bl.dur, 0, 1), e = U.smooth(u);
          this.x = U.lerp(bl.x, p[0], e); this.y = U.lerp(bl.y, p[1], e);
          this.z = U.lerp(bl.z, p[2], e) + (bl.arc === 0 ? 0 : Math.sin(Math.PI * u) * Math.min(2.5, bl.dur * 5));
          if (u >= 1) this.blend = null;
        } else { this.x = p[0]; this.y = p[1]; this.z = p[2]; }
      } else if (this.state === 'dribble' && this.dr) {
        this._dribble(dt);
        const bl = this.blend;
        if (bl && bl.drib) {
          bl.t += dt;
          const e = U.smooth(bl.t / bl.dur);
          const x0 = this.x, y0 = this.y, z0 = this.z;
          this.x = U.lerp(bl.x, this.x, e); this.y = U.lerp(bl.y, this.y, e); this.z = U.lerp(bl.z, this.z, e);
          // (a hand on the ball goes where the ball really is: planned on the dribble's path while the ball was still
          // easing onto it from the hold, it was up to ~3 ft off it, Trial 8)
          const hd = this.dr.actor && this.dr.actor.dribble;
          if (hd && hd.wx != null && (hd.ph === 'push' || hd.ph === 'ride')) { hd.wx += this.x - x0; hd.wy += this.y - y0; hd.wz += this.z - z0; }
          if (bl.t >= bl.dur) this.blend = null;
        }
      } else if ((this.state === 'flight' || this.state === 'loose') && this.segs) {
        this._flight();
      }
      if (dt > 0) {
        this.vx = (this.x - px) / dt; this.vy = (this.y - py) / dt; this.vz = (this.z - pz) / dt;
        if (!isFinite(this.vx) || Math.abs(this.vx) > 200) { this.vx = this.vy = this.vz = 0; }
        // rolling on the floor or around the ring: the spin matches the travel (no skating)
        const cs = this.segs && this.segs[this.segI];
        if (cs && (cs.roll || cs.orbit)) { this.spin[0] = -this.vy / R; this.spin[1] = this.vx / R; this.spin[2] = 0; }
        else if (this.state === 'loose' && !this.segs) { this.spin[0] *= 0.9; this.spin[1] *= 0.9; this.spin[2] *= 0.9; }
      }
      // spin integration
      const w = this.spin, wl = Math.hypot(w[0], w[1], w[2]);
      if (wl > 1e-3 && dt > 0) {
        rotMul(this.rot, w[0] / wl, w[1] / wl, w[2] / wl, wl * dt);
      }
      if (this.state === 'held') { this.spin[0] *= 0.9; this.spin[1] *= 0.9; this.spin[2] *= 0.9; }
      this.squash = Math.max(0, this.squash - dt * 9);
    }

    _flight() {
      const segs = this.segs;
      const t = this.time;
      while (this.segI < segs.length - 1 && t >= segs[this.segI].t1) {
        this._fireSeg(segs[this.segI]);
        this.segI++;
        this._enterSeg(segs[this.segI]);
      }
      const s = segs[this.segI];
      const p = this._segPos(s, t, this._tmp);
      // homing toward a live target during the last part of a pass
      if (s.target) {
        const u = U.clamp((t - s.t0) / (s.t1 - s.t0), 0, 1);
        const end = this._segPos(s, s.t1, TMP3);
        const live = s.target();
        if (live) {
          const k = U.smooth((u - 0.35) / 0.65);
          p[0] += (live[0] - end[0]) * k; p[1] += (live[1] - end[1]) * k; p[2] += (live[2] - end[2]) * k;
        }
      }
      this.x = p[0]; this.y = p[1]; this.z = Math.max(R * 0.85, p[2]);
      if (t >= s.t1 && this.segI === segs.length - 1) {
        this._fireSeg(s);
        const cb = this.onEnd;
        this.segs = null; this.onEnd = null;
        this.state = 'loose';
        if (cb) U.safe(() => cb(this), null, 'ball onEnd');
      }
    }
    _enterSeg(s) {
      const v = this.view;
      if (s.w) { this.spin[0] = s.w[0]; this.spin[1] = s.w[1]; this.spin[2] = s.w[2]; }
      if (s.bounce && !s.roll) { this.squash = U.clamp(Math.abs(this.vz) / 20, 0.2, 1); this.onBounce && this.onBounce(this); if (v && v.sound) v.sound('bounce', U.clamp(Math.abs(this.vz) / 18, 0.2, 1)); }
      if (s.rim && this.shotHoop) {
        // (the rim rings and the net jumps as hard as the ball came in: a flat line drive clangs, a soft touch ticks)
        const hit = s.soft ? 0.4 : U.clamp(Math.hypot(this.vx, this.vy, this.vz) / 22, 0.55, 1.6);
        this.shotHoop.hitRim(hit); this.onRim && U.safe(() => this.onRim(this), null, 'onRim');
        if (!s.w && !s.orbit) this.spin[2] += (Math.random() - 0.5) * 20;
        if (v && v.sound) v.sound('rim', s.soft ? 0.5 : U.clamp(hit, 0.6, 1));
      }
      if (s.board && this.shotHoop) { this.shotHoop.hitBoard(1); if (v && v.sound) v.sound('board', 1); }
    }
    _fireSeg(s) {
      if (s.fired) return;
      s.fired = true;
      if (s.score) {
        // (a swish whips the net up hard, a make off the rim gives it a lighter snap)
        if (this.shotHoop) this.shotHoop.swish(s.swish ? 1.3 : 0.6);
        if (this.view && this.view.sound) this.view.sound(s.swish ? 'swish' : 'net', 1);
        const cb = this.onScore; this.onScore = null;
        if (cb) U.safe(() => cb(this), null, 'onScore');
      }
    }

    /**
     * Dribble cycle (u = 0..1), modelled on measured dribbling:
     *  push   - the hand drives the ball down ~0.14 H from the top of the bounce (elbow extends, wrist snaps)
     *  flight - release ~4 m/s, floor bounce (FIBA restitution ~0.77), rise to the waiting hand
     *  ride   - the hand catches it below the waist and rides it up ~0.07 H to hip height (elbow flexes)
     * Phase shares come from the ball's physics at real gravity, then the whole cycle is time-scaled to the
     * cadence (bounce per step or per two steps when moving). Ball and hand paths are body-local so the
     * ball stays in the hand at release and catch whatever the dribbler does.
     */
    _dribble(dt) {
      const d = this.dr, a = d.actor;
      if (!a) return;
      const H = a.H;
      // (each cycle takes the time its plan solved for at real gravity, d.T; see _planBounce)
      // the spin move's pull (spinPull): once the ball is in the hand at the top of its bounce, it stays there
      const pu = d.pull;
      if (pu) {
        pu.t += dt;
        if (!pu.on && d.plan && d.u >= d.plan.uC && !(d.move && d.moveStarted)) { pu.on = true; pu.q0 = [d.plan.qtx, d.plan.qty]; }
        if (pu.t >= pu.hold) {
          d.pull = null;
          d.pendingMove = { type: 'cross', toHand: 1 - d.hand, period: pu.period, spin: true };
          if (pu.on) d.u = Math.max(d.u, 0.999);
        }
      }
      if (d.pendingMove && d.u < 0.08) { d.move = d.pendingMove; d.pendingMove = null; d.moveStarted = false; }
      if (d.move && !d.moveStarted && d.u < 0.1) { d.moveStarted = true; d.planned = false; }
      const period = d.T || (d.move && d.moveStarted ? d.move.period : d.period);
      d.curPeriod = period;
      const u0 = d.u;
      // (the carry out of the hands takes its own time first; the cycle waits at its start)
      const cr0 = d.planned && d.plan && d.plan.carry && d.plan.carry.t < d.plan.carry.dur ? d.plan.carry : null;
      let adv = dt;
      if (cr0) { adv = Math.max(0, cr0.t + dt - cr0.dur); cr0.t = Math.min(cr0.dur, cr0.t + dt); }
      d.u += adv / period;
      if (d.pull && d.pull.on) {
        // held at the top of the ride, the hand on top, drawn back beside the hip
        const pl0 = d.plan, q = d.pull;
        if (d.u > 0.998) d.u = 0.998;
        q.k = Math.min(1, q.k + dt / 0.12);
        const e = U.smooth(q.k);
        pl0.qtx = U.lerp(q.q0[0], Math.abs(q.q0[0]) < 1e-6 ? 0.2 * H : Math.sign(q.q0[0]) * 0.2 * H, e);
        pl0.qty = U.lerp(q.q0[1], -0.02 * H, e);
      }
      if (d.u >= 1) {
        d.u -= 1;
        if (d.move && d.moveStarted) {
          d.hand = d.move.toHand;
          const cb = d.move.onDone; d.move = null;
          if (cb) U.safe(cb, null, 'dribble move');
        }
        d.planned = false;
      }
      if (!d.planned) {
        this._planBounce(d, a); d.planned = true;
        if (d.plan.carry) { d.u = 0; d.plan.carry.t = Math.min(dt, d.plan.carry.dur); }
      }
      const pl = d.plan;
      const u = d.u;
      const cr = pl.carry && pl.carry.t < pl.carry.dur ? pl.carry : null;
      const moving = d.move && d.moveStarted;
      const endHand = moving ? d.move.toHand : d.hand;
      // --- ball, body-local (x toward the dribble hand side of the body, y forward, z up; feet)
      let lx, ly, lz, ph, s;
      const uP = pl.uP, uB = pl.uB, uC = pl.uC;
      if (cr) {
        // carried out of the hands to the push's start (the hand on it, the push not yet begun), from a start that goes with
        // his shoulders
        ph = 'push'; s = 0;
        const e = U.smooth(cr.t / cr.dur);
        let x0 = cr.x0, y0 = cr.y0, z0 = cr.z0;
        if (cr.sh0 && a.armReach) { const sh = a.armReach(d.hand, AR), sd0 = pl.side; x0 += (sh[0] - cr.sh0[0]) * sd0; y0 += sh[1] - cr.sh0[1]; z0 += sh[2] - cr.sh0[2]; }
        lx = U.lerp(x0, pl.tx0, e); ly = U.lerp(y0, pl.ty0, e); lz = U.lerp(z0, pl.top0, e);
      } else if (u < uP) {
        ph = 'push'; s = u / uP;
        // starts where the last ride ended (no pop when the height changes between bounces)
        lz = pl.top0 - (pl.top0 - pl.rel) * s * s;
        lx = U.lerp(pl.tx0, pl.rx, s * s); ly = U.lerp(pl.ty0, pl.ry, s * s);
      } else if (u < uB) {
        ph = 'down'; s = (u - uP) / (uB - uP);
        const t = s * pl.tD;
        lz = Math.max(R, pl.rel - pl.vRel * t - 0.5 * pl.g * t * t);
        // (from the release to the bounce spot along the push's line: from its top at the release's share, k0, to the floor)
        const k0 = (pl.top - pl.rel) / Math.max(0.01, pl.top - R);
        const k = U.lerp(k0, 1, s), kk = (k - k0) / Math.max(1e-3, 1 - k0);
        lx = U.lerp(pl.rx, pl.cx, kk); ly = U.lerp(pl.ry, pl.cy, kk);
      } else if (u < uC) {
        ph = 'up'; s = (u - uB) / (uC - uB);
        const t = s * pl.tU;
        lz = Math.min(pl.ctop, R + pl.vUp * t - 0.5 * pl.g * t * t);
        lx = U.lerp(pl.cx, pl.qx, s); ly = U.lerp(pl.cy, pl.qy, s);
      } else {
        ph = 'ride'; s = (u - uC) / (1 - uC);
        lz = pl.ctop - (pl.ctop - pl.ccatch) * (1 - s) * (1 - s);
        lx = U.lerp(pl.qx, pl.qtx, s); ly = U.lerp(pl.qy, pl.qty, s);
      }
      const sd = pl.side; // +1: right hand side of the body
      // the ball never gets behind the shoulder whose hand has it (Trial 8: leaning into a start, or the trunk turned to a
      // pass, the shoulder went past a ball planned in the hips' frame and the arm was at the end of its reach back):
      // a smooth floor under its forward, Tune.handle.aheadFt ahead of that shoulder (none on a move behind the back or
      // between the legs, which go there on purpose)
      const TH = M.Tune.handle, beh = moving && (d.move.type === 'btb' || d.move.type === 'btl') && ph !== 'ride';
      const shA = !beh && a.armReach ? a.armReach(ph === 'push' || ph === 'down' ? d.hand : endHand, AR)[1] + TH.aheadFt : null;
      const fwd = (y) => shA == null ? y : y + TH.aheadSoftFt * Math.log1p(Math.exp((shA - y) / TH.aheadSoftFt));
      ly = fwd(ly);
      // the spin's crossover: once out of the hand the ball is on its own, so the bounce spot stays put on the floor
      // (where the body will be facing when it lands) while he turns, and it comes up to wherever the new hand is
      const anchored = moving && d.move.spin && (ph === 'down' || ph === 'up');
      if (anchored && !d.anch) {
        const fp = a.predictFrame(Math.max(0, (uB - u) * (d.curPeriod || period)), PF);
        const cf = Math.cos(fp.facing), sf = Math.sin(fp.facing), bx = sd * pl.cx, by = pl.cy;
        d.anch = { x0: this.x, y0: this.y, bx: fp.x + sf * bx + cf * by, by: fp.y - cf * bx + sf * by };
      } else if (!anchored) d.anch = null;
      if (anchored) {
        const an = d.anch;
        if (ph === 'down') {
          const k0 = (pl.top - pl.rel) / Math.max(0.01, pl.top - R), k = U.lerp(k0, 1, s), kk = (k - k0) / Math.max(1e-3, 1 - k0);
          this.x = U.lerp(an.x0, an.bx, kk); this.y = U.lerp(an.y0, an.by, kk);
        } else {
          const cq = a.local(sd * pl.qx, pl.qy, 0, TB);
          this.x = U.lerp(an.bx, cq[0], s); this.y = U.lerp(an.by, cq[1], s);
        }
        this.z = lz + a.jumpZ;
      } else {
        // never through the dribbler himself (a knee coming through, a crossover in front of the shins): the ball
        // keeps out of his legs and trunk, except going between the legs on purpose, and the hand meets it where it is
        const lb = TL;
        lb[0] = sd * lx; lb[1] = ly; lb[2] = lz;
        if (a.clearBall(lb, R, !(moving && d.move.type === 'btl'), a.dribbleYaw || 0) > 1e-6) { lx = lb[0] * sd; ly = lb[1]; lz = Math.max(R, lb[2]); }
        let wp = (a.localD || a.local).call(a, sd * lx, ly, lz, TB);
        // and out of everyone else's, across the floor (a defender up on him, a screener), the hand going with it
        const acts = this.view && this.view.actors;
        if (acts) {
          let wx = wp[0], wy = wp[1], moved = false;
          for (const id in acts) {
            const o = acts[id];
            if (!o || o === a || o.hidden || o.kind !== 'player' || !o.clearBallOf || Math.abs(o.x - wx) > 4 || Math.abs(o.y - wy) > 4) continue;
            if (o.clearBallOf(wx, wy, wp[2], R, TO2) > 1e-6) { wx = TO2[0]; wy = TO2[1]; moved = true; }
          }
          if (moved) {
            const f = a.facing + (a.dribbleYaw || 0), c = Math.cos(f), sn = Math.sin(f), dx = wx - wp[0], dy = wy - wp[1];
            lx += (dx * sn - dy * c) * sd; ly += dx * c + dy * sn;
            wp = (a.localD || a.local).call(a, sd * lx, ly, lz, TB);
          }
        }
        this.x = wp[0]; this.y = wp[1]; this.z = wp[2];
      }
      if (u0 < uB && d.u >= uB) { this.squash = 1; if (this.onBounce) this.onBounce(this); if (this.view && this.view.sound) this.view.sound('dribble', U.clamp(0.45 + a.speed / 30, 0.4, 1)); }
      // forward roll spin
      this.setSpinAlong(a.vx || 0.01, a.vy || 0, -(a.speed + 3) / R * 0.4);
      // --- the dribbling hand (wrist IK target + wrist angle); the other hand takes over on a crossover
      const pr = R + 0.01 * H;
      const handOn = (bx, by, bz, handSign, o) => {
        // palm (finger pads) on the top-back-outside of the ball; the actor corrects its wrist so the hand
        // lands exactly here (bx is the signed body-local x of the ball centre)
        o.x = bx + handSign * 0.3 * pr; o.y = by - 0.28 * pr; o.z = bz + 0.91 * pr;
        return o;
      };
      const hd = a.dribble && a.dribble.ball === this ? a.dribble : (a.dribble = { ball: this, w: 1 });
      hd.ball = this; hd.w = 1; hd.u = u; hd.ph = ph; hd.s = s; hd.carry = cr ? cr.t / cr.dur : null;
      const ACT = HO1, RCV = HO2;
      let wr; // wrist flexion (deg; + = flexed / fingers down, - = cocked back)
      if (ph === 'push') {
        handOn(sd * lx, ly, lz, sd, ACT);
        wr = U.lerp(-32, 26, U.smooth(s));
        hd.hand = d.hand; hd.act = 1;
      } else if (ph === 'ride') {
        handOn(sd * lx, ly, lz, pl.rside, ACT);
        wr = U.lerp(-18, -34, U.smooth(s));
        hd.hand = endHand; hd.act = 1;
      } else {
        // free flight: the hand follows through a little, then waits low and rises to meet the ball
        const f = (u - uP) / (uC - uP);
        const rel = handOn(sd * pl.rx, fwd(pl.ry), pl.rel, sd, RCV);
        const rx0 = rel.x, ry0 = rel.y, rz0 = rel.z;
        const cat = handOn(sd * pl.qx, fwd(pl.qy), pl.ccatch, pl.rside, ACT);
        if (moving && d.move.toHand !== d.hand) {
          // crossover / between the legs / behind the back: from the release the new hand has the dribble, on its way to
          // the catch since the push (_moveHands), and the old hand follows through and lets go (hd.aux)
          hd.hand = endHand;
          this._moveHand(d, pl, a, u, uC, cat, ACT);
        } else {
          const e = U.smooth(U.clamp((f - 0.12) / 0.78, 0, 1));
          const dip = 0.035 * H * Math.sin(Math.PI * U.clamp(f / 0.3, 0, 1));
          ACT.x = U.lerp(rx0, cat.x, e); ACT.y = U.lerp(ry0, cat.y, e); ACT.z = U.lerp(rz0, cat.z, e) - dip;
          hd.hand = d.hand; hd.act = 1;
        }
        wr = f < 0.3 ? U.lerp(26, 8, f / 0.3) : U.lerp(8, -18, U.smooth((f - 0.3) / 0.7));
        if (moving && d.move.toHand !== d.hand) { wr = -18; hd.act = 1; }
      }
      const w = (a.localD || a.local).call(a, ACT.x, ACT.y, ACT.z, TC);
      hd.wx = w[0]; hd.wy = w[1]; hd.wz = w[2]; hd.wrF = wr; hd.palm = 1;
      // a move from hand to hand, the other hand (hd.aux, Trial 8): before the release the receiving hand reaching for
      // the catch on the path it then keeps as the dribbling hand; after it the old hand following through and letting
      // go over the ball's flight (they used to trade the dribble halfway through the flight, each in ~0.08 s)
      let aux = null;
      if (moving && d.move.toHand !== d.hand && ph !== 'ride') {
        aux = hd.aux || (hd.aux = { x: 0, y: 0, z: 0 });
        if (ph === 'push') {
          // (where the pushing palm is, frame by frame, for its follow-through from the release)
          const mv = d.move, hp = a.handLocal ? a.handLocal(d.hand, TD) : null;
          if (hp) mv.hp = [hp[0], hp[1], hp[2]];
          const cat = handOn(sd * pl.qx, fwd(pl.qy), pl.ccatch, pl.rside, HO3);
          this._moveHand(d, pl, a, u, uC, cat, HO4);
          const wq = (a.localD || a.local).call(a, HO4.x, HO4.y, HO4.z, TD);
          aux.hand = endHand; aux.act = HO4.act; aux.wrF = -18;
          aux.x = wq[0]; aux.y = wq[1]; aux.z = wq[2];
        } else {
          // (the old hand: from where it let the ball go, carried on by its speed there and slowing (Tune.handle.followS),
          // a little on down, its weight going over the flight)
          const mv = d.move, f = (u - uP) / (uC - uP), TH = M.Tune.handle;
          if (!mv.rel0) {
            // (the palm as the body's last solve left it, the push's last frame, and its speed then)
            const cur = a.handLocal ? a.handLocal(d.hand, TD) : null, hp = cur ? [cur[0], cur[1], cur[2]] : [sd * pl.rx, pl.ry, pl.rel];
            const hq = mv.hp || hp, iv = 1 / Math.max(1e-3, dt);
            mv.rel0 = [hp[0], hp[1], hp[2], (hp[0] - hq[0]) * iv, (hp[1] - hq[1]) * iv, (hp[2] - hq[2]) * iv, (u - uP) * (d.curPeriod || 0.4) - dt];
          }
          const r0 = mv.rel0, tr = (u - uP) * (d.curPeriod || 0.4) - r0[6], k = TH.followS * (1 - Math.exp(-tr / TH.followS));
          const wq = (a.localD || a.local).call(a, r0[0] + r0[3] * k, r0[1] + r0[4] * k, r0[2] + r0[5] * k - 0.04 * H * U.smooth(f), TD);
          aux.hand = d.hand; aux.act = 1 - U.smooth(f); aux.wrF = U.lerp(26, 8, U.smooth(f));
          aux.x = wq[0]; aux.y = wq[1]; aux.z = wq[2];
        }
      }
      else if (cr && a.handLocal) {
        // out of the hands: the other hand lets go of the ball as it is carried away (Trial 8: held where it had the ball,
        // its fingers were in the ball's way), from where it held it and never inside it (Tune.handle.offLetGoK,
        // offClearFt), then to wherever the off arm goes
        const TH = M.Tune.handle, oh = 1 - d.hand, k = cr.t / cr.dur, act = 1 - U.smooth(Math.min(1, k / TH.offLetGoK));
        if (!cr.off0) { const hp = a.handLocal(oh, TD); cr.off0 = [hp[0], hp[1], hp[2]]; }
        if (act > 0.001) {
          aux = hd.aux || (hd.aux = { x: 0, y: 0, z: 0 });
          const bx = sd * lx, dx = cr.off0[0] - bx, dy = cr.off0[1] - ly, dz = cr.off0[2] - lz, dl = Math.hypot(dx, dy, dz), need = pr + TH.offClearFt;
          const q = dl < need ? need / Math.max(1e-4, dl) : 1;
          const wq = (a.localD || a.local).call(a, bx + dx * q, ly + dy * q, lz + dz * q, TD);
          aux.hand = oh; aux.act = act; aux.wrF = null;
          aux.x = wq[0]; aux.y = wq[1]; aux.z = wq[2];
        }
      }
      if (!aux) hd.aux = null;
    }
    /** a move from hand to hand, the receiving hand (Trial 8): from where it was when the move's push began (its spot
     *  on the other side, body frame) to the catch, eased over the push and the flight so it is there
     *  Tune.handle.moveReachK of the way to the catch; its IK weight all there by moveActK of that way. o (body frame,
     *  like handOn's) gets the spot and o.act the weight */
    _moveHand(d, pl, a, u, uC, cat, o) {
      const TH = M.Tune.handle, H = a.H, mv = d.move;
      if (!mv.h0) {
        // (where the receiving hand is now, in the dribble's body frame: the actor's last solve)
        const hp = a.handLocal ? a.handLocal(mv.toHand, TD) : null;
        mv.h0 = hp ? [hp[0], hp[1], hp[2]] : [cat.x, cat.y, cat.z];
      }
      const uR = uC * TH.moveReachK, k = U.smooth(Math.min(1, u / uR));
      const dip = 0.04 * H * (1 - U.smooth(Math.min(1, u / uC)));
      o.x = U.lerp(mv.h0[0], cat.x, k); o.y = U.lerp(mv.h0[1], cat.y, k); o.z = U.lerp(mv.h0[2], cat.z - dip, k);
      o.act = U.smooth(Math.min(1, u / (uR * TH.moveActK)));
      return o;
    }
    /** geometry and physics of the next bounce (heights in feet, body-local) */
    _planBounce(d, a) {
      const H = a.H;
      const moving = d.move && (d.move.type === 'cross' || d.move.type === 'btl' || d.move.type === 'btb');
      const side = d.hand ? 1 : -1;
      const recv = moving ? d.move.toHand : d.hand;
      const rside = recv ? 1 : -1;
      // the dribble's shape for how he is moving (the actor's dribbleShape: wide of the hip sizing up, low and outside
      // the foot driving, pushed out ahead at thigh height running)
      const sh = a.dribbleShape ? a.dribbleShape(DSH) : { tx: 0.2, ty: 0.13, cx: 0.21, cy: 0.18, top: 0.5, low: 0, spK: 0 };
      const low = U.clamp(Math.max(d.low || 0, sh.low), 0, 1), spK = sh.spK;
      // heights of the ball centre: top of the ride ~hip height, catch ~0.07 H lower, release ~0.14 H below the top;
      // low/protect dribble at the knees
      let top = (sh.top - 0.2 * Math.max(0, low - sh.low)) * H;
      let ride = (0.07 - 0.035 * low) * H;
      let push = (0.14 - 0.06 * low + 0.02 * spK) * H;
      const tx = sh.tx * H, ty = sh.ty * H;
      let cx = sh.cx * H, cy = sh.cy * H;
      let qx = sh.tx * H, qy = sh.ty * H; // catch point (receiving hand side)
      let ctop = top;
      if (moving) {
        // crossovers stay low (a sharp "V" below the knees): the new hand catches the ball at the knees and
        // rides it up to the thigh, then the dribble climbs back to its normal height
        push = Math.max(push, (0.2 - 0.05 * low) * H);
        ctop = (0.4 - 0.12 * low) * H;
        ride = ctop - (0.28 - 0.06 * low) * H;
        // the ball crosses the midline: in front (crossover), under the body (between the legs), behind the back
        cx = 0;
        cy = d.move.type === 'cross' ? ty + 0.06 * H : d.move.type === 'btl' ? 0.06 * H : -0.14 * H;
      }
      let rel = Math.max(R + 0.05 * H, top - push);
      let ccatch = ctop - ride;
      // the release along the push's line (x in this hand's side convention) and the catch (x in the old hand's)
      const kr0 = (top - rel) / Math.max(0.01, top - R);
      let rx = U.lerp(tx, cx, kr0), ry = U.lerp(ty, cy, kr0), qxo = qx * rside * side;
      // both where the hand can get to them (Trial 8: running, the ball pushed out ahead was released past the reach of
      // the arm pushing it, and below it, the palm inches off the ball): each palm spot is brought toward its shoulder
      // until it is in reach (the release higher and nearer: out in front at the waist), before the timing is solved
      if (a.armReach) {
        const pr = R + 0.01 * H, P3 = TP3;
        P3[0] = side * (rx + 0.3 * pr); P3[1] = ry - 0.28 * pr; P3[2] = rel + 0.91 * pr;
        if (toReach(a.armReach(d.hand, AR), P3) > 0) { rx = P3[0] * side - 0.3 * pr; ry = P3[1] + 0.28 * pr; rel = Math.max(R + 0.05 * H, P3[2] - 0.91 * pr); }
        P3[0] = side * qxo + rside * 0.3 * pr; P3[1] = qy - 0.28 * pr; P3[2] = ccatch + 0.91 * pr;
        if (toReach(a.armReach(recv, AR), P3) > 0) { qxo = (P3[0] - rside * 0.3 * pr) * side; qy = P3[1] + 0.28 * pr; ccatch = Math.min(ctop - 0.02 * H, P3[2] - 0.91 * pr); }
      }
      const pl = d.plan || (d.plan = {});
      // where the previous bounce's ride ended (in this bounce's side convention): the push starts there
      const hadPrev = pl.ctop != null && d.planActor === a;
      // (the first push out of his hands starts where the ball is)
      const fr = d.from, TH0 = M.Tune.handle;
      d.from = null;
      const top0 = U.clamp(hadPrev ? pl.ctop : top, rel + 0.02 * H, top + 0.12 * H);
      pl.tx0 = hadPrev ? Math.abs(pl.qtx) : tx; pl.ty0 = hadPrev ? pl.qty : ty;
      // out of the hands: first carried from where it was held to where the push starts, the palm coming over the top
      // as the body sinks into its stance (see _dribble); pushed from up at the chest the ball stayed at the shoulders
      // of a body going down ~1 ft, out of the dribbling hand's reach
      if (fr) {
        const far = Math.hypot(fr.x - pl.tx0, fr.y - pl.ty0, fr.z - top0);
        // (the ball in his hands goes with his shoulders: where it starts from follows them as he sinks and leans into his
        // stance, or they came down onto a ball held where it was, out of the dribbling arm's reach)
        const s0 = a.armReach ? a.armReach(d.hand, AR) : null;
        pl.carry = { t: 0, dur: U.clamp(far / TH0.carryFtps, TH0.carryMinS, TH0.carryMaxS), x0: fr.x, y0: fr.y, z0: fr.z, sh0: s0 ? [s0[0], s0[1], s0[2]] : null };
      } else pl.carry = null;
      d.planActor = a;
      // --- the timing, at real gravity (Trial 8: the cycle used to be time-scaled to its cadence, and gravity with it,
      // from ~23 to ~51 ft/s^2): the ball's speed into the hand at the catch is solved so the cycle takes the period asked
      // of it, a harder push and a faster ball for a quicker dribble; FIBA's restitution by impact speed
      const TH = M.Tune.handle, g = G, cz = Math.max(0.05, ccatch - R), rz = Math.max(0.05, rel - R), pz = Math.max(0.01, top0 - rel), rd = Math.max(0.01, ride);
      const cyc = (vc) => {
        const vUp0 = Math.sqrt(vc * vc + 2 * g * cz);
        let e = eFloor(vUp0 / 0.77); e = eFloor(vUp0 / e);
        // (the hand always pushes: a dribble too soft for its height is pushed at the least release speed and comes up
        // faster into the hand)
        const vRel = Math.sqrt(Math.max(TH.vRelMin * TH.vRelMin, (vUp0 / e) * (vUp0 / e) - 2 * g * rz));
        const vImp = Math.sqrt(vRel * vRel + 2 * g * rz), vUp = vImp * eFloor(vImp), vc2 = Math.sqrt(Math.max(0.25, vUp * vUp - 2 * g * cz));
        const tP = 2 * pz / vRel, tD = (vImp - vRel) / g, tU = (vUp - vc2) / g, tR = 2 * rd / vc2;
        return { vc: vc2, vUp, vImp, vRel, tP, tD, tU, tR, T: tP + tD + tU + tR };
      };
      const solve = (P) => {
        let lo = TH.vcMin, hi = TH.vcMax;
        const cHi = cyc(hi), cLo = cyc(lo);
        if (cHi.T >= P) return cHi;
        if (cLo.T <= P) return cLo;
        for (let it = 0; it < 24; it++) { const m = 0.5 * (lo + hi); if (cyc(m).T > P) lo = m; else hi = m; }
        return cyc(0.5 * (lo + hi));
      };
      // the period asked: a move's own; moving, a bounce every n steps (the fewest that keep the catch under vcComfort),
      // steered so the bounce comes with the inside foot's landing (the foot on the other side from the hand); standing,
      // from relaxed to quick as a man closes in on him
      const walking = a.gaitOn && a.speed > 2 && !moving && !d.pull;
      let P;
      if (d.move && d.moveStarted) P = d.move.period;
      else if (walking) {
        const sps = a.gaitDbg && a.gaitDbg.sps > 0 ? a.gaitDbg.sps : M.Anims.stepsPerSec(a.speed, H), stepT = 1 / sps, tMin = cyc(TH.vcComfort).T;
        let n = d.n || 2;
        if (n * stepT < tMin * 0.92 && n < 3) n++;
        else if (n > 1 && (n - 1) * stepT >= tMin * 1.08) n--;
        d.n = n;
        P = n * stepT;
        // (the bounce in this cycle, against the nearest landing of the inside foot: n = 1, either foot, every step)
        const s0 = solve(P), tb = (s0.tP + s0.tD) - Math.max(0, d.u) * s0.T;
        const span = n === 1 ? stepT : 2 * stepT, cph = n === 1 ? 0 : (side > 0 ? 0.5 : 0);
        const fr = (v) => v - Math.floor(v), ph = n === 1 ? fr(2 * (a.phase || 0)) : a.phase || 0;
        const tL0 = (n === 1 ? fr(-ph) : fr(cph - ph)) * span;
        const err = tb - (tL0 + Math.round((tb - tL0) / span) * span);
        P = U.clamp(P - TH.syncGain * err, P * (1 - TH.syncMaxK), P * (1 + TH.syncMaxK));
      } else {
        const pr = a.pressure ? a.pressure() : 0;
        P = U.lerp(TH.periodOpenS, TH.periodPressedS, pr) * (d.period / 0.68);
      }
      const c = solve(P);
      const tP = c.tP, tD = c.tD, tU = c.tU, T = c.T;
      // (the hand carries the ball along the push no faster than Tune.handle.pushHFtps across the floor: speeding up, the
      // dribble's shape grows between bounces and a push from the last ride's end to the new release had the ball, and the
      // hand, go ~1 ft in 3 frames; the rest of the way is the ball's, falling)
      {
        const hx = rx - pl.tx0, hy = ry - pl.ty0, hl = Math.hypot(hx, hy), hm = TH.pushHFtps * tP;
        if (hl > hm) { rx = pl.tx0 + hx * hm / hl; ry = pl.ty0 + hy * hm / hl; }
      }
      d.T = T; d.vc = c.vc;
      pl.side = side; pl.rside = rside;
      pl.top = top; pl.top0 = top0; pl.rel = rel; pl.ctop = ctop; pl.ccatch = ccatch;
      pl.uP = tP / T; pl.uB = (tP + tD) / T; pl.uC = (tP + tD + tU) / T;
      pl.tD = tD; pl.tU = tU; pl.g = g; pl.vRel = c.vRel; pl.vUp = c.vUp;
      pl.tx = tx; pl.ty = ty; pl.cx = cx; pl.cy = cy;
      // release and catch points (x in the old hand's side convention; the catch and the ride on the receiving hand's side)
      pl.rx = rx; pl.ry = ry;
      pl.qx = qxo; pl.qy = qy; pl.qtx = tx * rside * side; pl.qty = ty;
    }

    // ------------------------------------------------------------ drawing
    depth(cam) { return cam.depth(this.y, this.z); }
    drawShadow(g, cam) {
      if (this.hidden) return;
      const p = cam.project(this.x, this.y, 0, this._pt);
      const h = Math.max(0, this.z - R);
      const a = U.clamp(0.55 - h * 0.035, 0.08, 0.55);
      const w = R * 2.4 * p.s * (1 + h * 0.05);
      const sh = M.Figure.shadowSprite();
      g.globalAlpha = a;
      g.drawImage(sh, p.x - w / 2, p.y - w * 0.18, w, w * 0.36);
      g.globalAlpha = 1;
    }
    draw(g, cam) {
      if (this.hidden) return;
      const p = cam.project(this.x, this.y, this.z, this._pt);
      const r = Math.max(1.6, R * p.s);
      if (p.x < -r * 3 || p.x > cam.W + r * 3) return;
      const sq = this.squash * U.clamp(1 - (this.z - R) * 3, 0, 1);
      const rx = r * (1 + 0.12 * sq), ry = r * (1 - 0.16 * sq);
      const cx = p.x, cy = p.y + (r - ry);
      const gr = g.createRadialGradient(cx - rx * 0.38, cy - ry * 0.42, r * 0.08, cx, cy, r * 1.05);
      gr.addColorStop(0, '#f7a661'); gr.addColorStop(0.45, '#dc6d2c'); gr.addColorStop(0.85, '#a8481b'); gr.addColorStop(1, '#6e2c10');
      g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, U.TAU);
      g.fillStyle = gr; g.fill();
      // seams
      if (r > 2.5) {
        const m = this.rot;
        const upY = cam.sp, upZ = cam.cp, tcY = -cam.cp, tcZ = cam.sp;
        g.strokeStyle = 'rgba(25,12,6,0.85)';
        g.lineWidth = Math.max(0.6, r * 0.075);
        g.beginPath();
        for (const curve of SEAMS) {
          let pen = false;
          for (const q of curve) {
            const wx = m[0] * q[0] + m[1] * q[1] + m[2] * q[2];
            const wy = m[3] * q[0] + m[4] * q[1] + m[5] * q[2];
            const wz = m[6] * q[0] + m[7] * q[1] + m[8] * q[2];
            const vis = wy * tcY + wz * tcZ;
            const X = cx + wx * rx * 0.98, Y = cy - (wy * upY + wz * upZ) * ry * 0.98;
            if (vis > 0) { if (!pen) { g.moveTo(X, Y); pen = true; } else g.lineTo(X, Y); } else pen = false;
          }
        }
        g.stroke();
      }
      g.strokeStyle = 'rgba(40,15,5,0.7)';
      g.lineWidth = Math.max(0.6, r * 0.06);
      g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, U.TAU); g.stroke();
    }
  }

  const TA = new Float64Array(3), TB = new Float64Array(3), TC = new Float64Array(3), TL = new Float64Array(3), TMP3 = [0, 0, 0], DSH = {};
  const AR = new Float64Array(4), TP3 = new Float64Array(3), TO2 = [0, 0];
  /** a palm spot p (body frame) brought straight toward the arm's shoulder until it is within Tune.handle.reachK of the
   *  arm's reach (ar: armReach); returns how far it was moved (0: already in reach) */
  function toReach(ar, p) {
    const lim = ar[3] * M.Tune.handle.reachK, dx = p[0] - ar[0], dy = p[1] - ar[1], dz = p[2] - ar[2], dl = Math.hypot(dx, dy, dz);
    if (dl <= lim) return 0;
    const k = lim / dl;
    p[0] = ar[0] + dx * k; p[1] = ar[1] + dy * k; p[2] = ar[2] + dz * k;
    return dl - lim;
  }
  const HO1 = { x: 0, y: 0, z: 0 }, HO2 = { x: 0, y: 0, z: 0 }, HO3 = { x: 0, y: 0, z: 0 }, HO4 = { x: 0, y: 0, z: 0, act: 0 }, PF = { x: 0, y: 0, facing: 0 }, TD = new Float64Array(3);
  const RM = new Float64Array(9);
  /** rot = R(axis, ang) * rot */
  function rotMul(m, ax, ay, az, ang) {
    const c = Math.cos(ang), s = Math.sin(ang), t = 1 - c;
    RM[0] = t * ax * ax + c; RM[1] = t * ax * ay - s * az; RM[2] = t * ax * az + s * ay;
    RM[3] = t * ax * ay + s * az; RM[4] = t * ay * ay + c; RM[5] = t * ay * az - s * ax;
    RM[6] = t * ax * az - s * ay; RM[7] = t * ay * az + s * ax; RM[8] = t * az * az + c;
    const a = m.slice ? Array.from(m) : m;
    for (let r = 0; r < 3; r++) for (let q = 0; q < 3; q++) {
      m[r * 3 + q] = RM[r * 3] * a[q] + RM[r * 3 + 1] * a[3 + q] + RM[r * 3 + 2] * a[6 + q];
    }
    // re-orthonormalise occasionally
    if (Math.random() < 0.02) M.Rig.orthoCols(m, 0);
  }

  Ball.R = R;
  Ball.aim = aim; Ball.seg = seg; Ball.timeForAngle = timeForAngle; Ball.contact = bounceOff; Ball.eFloor = eFloor;
  M.Ball = Ball;
})();
