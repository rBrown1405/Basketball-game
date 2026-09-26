/* Pro BBALL Coach — match view: the basketball (PBC.Match.Ball).
 * States: held (follows the holder's hands), dribble (rectified-cosine bounce synced to the hand),
 * flight (a chain of time-parameterised ballistic segments: passes, shots, rim/board caroms,
 * bounces - exact at any playback speed), loose (bouncing/rolling), dead (held by a referee).
 * Drawn as a lit sphere with rotating seams, squash on floor contact and a soft shadow. */
(function () {
  'use strict';
  const M = window.PBC.Match, U = M.U;
  const R = 0.39, G = U.G;
  const RIM_Z = 10, RIM_R = 0.75;

  function seg(t0, p0, v0, dur, grav) {
    return { t0, t1: t0 + dur, p0: p0.slice(), v0: v0.slice(), g: grav == null ? G : grav, ev: null };
  }
  /** ballistic velocity to go from p0 to p1 in time T */
  function aim(p0, p1, T, grav) {
    grav = grav == null ? G : grav;
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
        if (jump > 1.2 && isFinite(jump)) { this.blend = { x: this.x, y: this.y, z: this.z, t: 0, dur: U.clamp(jump / 16, 0.26, 0.55), arc: 1 }; }
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
      this.state = 'dribble';
      // continue any hand-over toss that is still in progress; otherwise a short settle
      const pb = this.blend;
      const top = actor.dribbleTop(hand == null ? (actor.lefty ? 0 : 1) : hand, TA);
      const far = Math.hypot(top[0] - this.x, top[1] - this.y, top[2] - this.z);
      const dur = Math.max(0.14, U.clamp(far / 26, 0.14, 0.45), pb ? pb.dur - pb.t : 0);
      this.blend = { x: this.x, y: this.y, z: this.z, t: 0, dur, drib: true };
      this.dr = {
        actor, hand: hand == null ? (actor.lefty ? 0 : 1) : hand,
        // a relaxed control dribble is ~1.4 bounces per second (0.70-0.74 s); players differ a little
        u: prev ? prev.u : 0.02, period: o.period || 0.64 + ((actor.uid * 37) % 10) * 0.008, low: o.low || 0,
        move: o.move || null, // {type:'cross'|'btl'|'btb', toHand, t}
        cx: 0, cy: 0, planned: false, pickup: false,
        tx: 0, ty: 0,
      };
      actor.dribble = { hand: this.dr.hand, w: 1 };
    }
    /** perform a dribble move: crossover / between the legs / behind the back (switches hands) */
    dribbleMove(type, o) {
      const d = this.dr;
      if (!d) return;
      d.pendingMove = { type, toHand: 1 - d.hand, onDone: o && o.onDone, period: (o && o.period) || 0.36 };
    }
    /** flight through the given list of waypoints builder: returns the segment list */
    flight(segs, onEnd) {
      this.release();
      this.state = 'flight';
      this.segs = segs; this.segI = 0; this.onEnd = onEnd || null;
      this.dr = null;
      this.flightStart = this.time;
      for (const s of segs) s.fired = false;
    }
    /** pass: from current position to a (possibly moving) target */
    pass(p1, dur, o) {
      o = o || {};
      const t0 = this.time;
      const p0 = [this.x, this.y, this.z];
      const segs = [];
      if (o.bounce) {
        // bounce pass: floor contact ~2/3 of the way
        const f = 0.62;
        const pb = [U.lerp(p0[0], p1[0], f), U.lerp(p0[1], p1[1], f), R];
        const d1 = dur * 0.58, d2 = dur - d1;
        segs.push(seg(t0, p0, aim(p0, pb, d1, G * 0.9), d1, G * 0.9));
        const s2 = seg(t0 + d1, pb, aim(pb, p1, d2, G * 1.1), d2, G * 1.1);
        s2.bounce = true;
        segs.push(s2);
      } else {
        // slight arc (lob: big arc)
        const grav = o.lob ? G : G * (o.flat ? 0.35 : 0.6);
        segs.push(seg(t0, p0, aim(p0, p1, dur, grav), dur, grav));
      }
      segs[segs.length - 1].target = o.target || null; // function returning live target [x,y,z]
      this.flight(segs, o.onArrive);
      const sp = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) / dur;
      this.setSpinAlong(p1[0] - p0[0], p1[1] - p0[1], -sp / R * 0.3);
    }
    /** backspin/forward roll about the horizontal axis perpendicular to travel */
    setSpinAlong(dx, dy, rate) {
      const l = Math.hypot(dx, dy) || 1;
      // axis perpendicular to travel in the floor plane: (-dy, dx)
      this.spin[0] = -dy / l * rate; this.spin[1] = dx / l * rate; this.spin[2] = 0;
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
      if (res === 'swish' || res === 'rim_in' || res === 'miss' || res === 'airball') {
        let target = rim.slice();
        if (res === 'rim_in') target = [rim[0] - toShooter[0] * 0.5, rim[1] - toShooter[1] * 0.5, RIM_Z + 0.12];
        if (res === 'miss') {
          const c = (o.miss && o.miss.contact) || 'front';
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
        segs.push(seg(t0, p0, aim(p0, target, T), T));
        contact = target;
      } else if (res === 'bank') {
        const hit = [hoop.bx - s * R * 1.02, rim[1] + (p0[1] - rim[1]) * 0.05, RIM_Z + 1.25];
        const dd = Math.hypot(hit[0] - p0[0], hit[1] - p0[1]);
        T = timeForAngle(dd, hit[2] - p0[2], theta - 6 * U.DEG) || Math.max(0.5, dd / 20);
        segs.push(seg(t0, p0, aim(p0, hit, T), T));
        const s1 = seg(t0 + T, hit, aim(hit, [rim[0], rim[1], RIM_Z], 0.22), 0.22);
        s1.board = true;
        segs.push(s1);
        contact = hit;
      }
      segs[0].shot = true;
      let tAt = t0 + T;
      const last = () => segs[segs.length - 1];
      // result tail
      if (res === 'swish' || res === 'bank') {
        const s0 = last();
        const pRim = res === 'bank' ? [rim[0], rim[1], RIM_Z] : contact;
        const tRim = s0.t1;
        this._throughNet(segs, pRim, tRim, hoop, o, res === 'swish');
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
      const sp = 5 + d * 0.15;
      this.setSpinAlong(rim[0] - p0[0], rim[1] - p0[1], -sp * 2.2);
      return { tContact: tAt, tEnd: segs[segs.length - 1].t1, segs };
    }
    _throughNet(segs, pRim, tRim, hoop, o, swish) {
      // drop through the net: slowed, almost vertical
      const pNet = [hoop.rx + (pRim[0] - hoop.rx) * 0.2, hoop.ry + (pRim[1] - hoop.ry) * 0.2, RIM_Z - 1.6];
      const s1 = seg(tRim, pRim, aim(pRim, pNet, 0.2, G * 0.4), 0.2, G * 0.4);
      s1.score = true; s1.swish = swish;
      segs.push(s1);
      // fall to the floor, bounce toward the baseline side
      const out = hoop.side;
      const pF = [hoop.rx + out * 0.4 + (Math.random() - 0.5) * 1.5, hoop.ry + (Math.random() - 0.5) * 3, R];
      const tf = Math.sqrt(2 * (pNet[2] - R) / G) * 0.95;
      segs.push(seg(s1.t1, pNet, aim(pNet, pF, tf), tf));
      this._bounceTail(segs, out * 0.35);
    }
    /** append decaying bounces after the last segment which must end on the floor */
    _bounceTail(segs, drift) {
      let s = segs[segs.length - 1];
      let p = this._segPos(s, s.t1, [0, 0, 0]);
      let v = [s.v0[0], s.v0[1], s.v0[2] - s.g * (s.t1 - s.t0)];
      p[2] = R;
      for (let i = 0; i < 5; i++) {
        const vz = Math.abs(v[2]) * 0.72;
        if (vz < 2.2) break;
        const T = 2 * vz / G;
        const vx = v[0] * 0.8 + (drift || 0), vy = v[1] * 0.8;
        const ns = seg(s.t1, p, [vx, vy, vz], T);
        ns.bounce = true;
        segs.push(ns);
        p = [p[0] + vx * T, p[1] + vy * T, R];
        v = [vx, vy, -vz];
        s = ns;
      }
      // roll
      const roll = seg(s.t1, p, [v[0] * 0.6, v[1] * 0.6, 0], 1.6, 0);
      roll.roll = true; roll.bounce = true;
      segs.push(roll);
    }
    /** loose ball from current position with a velocity: bounces and rolls */
    loose(vel, o) {
      const p0 = [this.x, this.y, Math.max(R, this.z)];
      const segs = [];
      const vz = vel[2];
      const tUp = (vz + Math.sqrt(vz * vz + 2 * G * (p0[2] - R))) / G;
      segs.push(seg(this.time, p0, vel, Math.max(0.05, tUp)));
      this._bounceTail(segs);
      this.flight(segs, o && o.onEnd);
      this.state = 'loose';
      this.setSpinAlong(vel[0], vel[1], -Math.hypot(vel[0], vel[1]) / R);
    }
    /** place dead ball in the hands of a ref or on the floor */
    placeAt(x, y, z) { this.release(); this.state = 'dead'; this.segs = null; this.x = x; this.y = y; this.z = z; }

    _segPos(s, t, out) {
      const dt = Math.max(0, Math.min(t, s.t1) - s.t0);
      out[0] = s.p0[0] + s.v0[0] * dt;
      out[1] = s.p0[1] + s.v0[1] * dt;
      out[2] = s.p0[2] + s.v0[2] * dt - 0.5 * s.g * dt * dt;
      if (s.roll) { // rolling friction
        const k = 1 - Math.exp(-dt * 1.4);
        out[0] = s.p0[0] + s.v0[0] / 1.4 * k; out[1] = s.p0[1] + s.v0[1] / 1.4 * k; out[2] = R;
      }
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
          this.x = U.lerp(bl.x, this.x, e); this.y = U.lerp(bl.y, this.y, e); this.z = U.lerp(bl.z, this.z, e);
          if (bl.t >= bl.dur) this.blend = null;
        }
      } else if ((this.state === 'flight' || this.state === 'loose') && this.segs) {
        this._flight();
      }
      if (dt > 0) {
        this.vx = (this.x - px) / dt; this.vy = (this.y - py) / dt; this.vz = (this.z - pz) / dt;
        if (!isFinite(this.vx) || Math.abs(this.vx) > 200) { this.vx = this.vy = this.vz = 0; }
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
      if (s.bounce && !s.roll) { this.squash = 1; this.onBounce && this.onBounce(this); if (v && v.sound) v.sound('bounce', U.clamp(Math.abs(this.vz) / 18, 0.2, 1)); }
      if (s.rim && this.shotHoop) { this.shotHoop.hitRim(1); this.onRim && U.safe(() => this.onRim(this), null, 'onRim'); this.spin[2] += (Math.random() - 0.5) * 20; if (v && v.sound) v.sound('rim', 1); }
      if (s.board && this.shotHoop) { this.shotHoop.hitBoard(1); if (v && v.sound) v.sound('board', 1); }
    }
    _fireSeg(s) {
      if (s.fired) return;
      s.fired = true;
      if (s.score) {
        if (s.swish && this.shotHoop) this.shotHoop.swish(1);
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
      // cadence: control dribble ~0.64-0.72 s; when moving, a bounce every step or every other step
      let period = d.period;
      if (a.gaitOn && a.speed > 2) {
        const sps = M.Anims.stepsPerSec(a.speed, H);
        const n = U.clamp(Math.round(0.68 * sps), 1, 3);
        period = U.clamp(n / sps, 0.42, 0.9);
      }
      if (d.pendingMove && d.u < 0.08) { d.move = d.pendingMove; d.pendingMove = null; d.moveStarted = false; }
      if (d.move && !d.moveStarted && d.u < 0.1) { d.moveStarted = true; d.planned = false; }
      if (d.move && d.moveStarted) period = d.move.period;
      d.curPeriod = period;
      const u0 = d.u;
      d.u += dt / period;
      if (d.u >= 1) {
        d.u -= 1;
        if (d.move && d.moveStarted) {
          d.hand = d.move.toHand;
          const cb = d.move.onDone; d.move = null;
          if (cb) U.safe(cb, null, 'dribble move');
        }
        d.planned = false;
      }
      if (!d.planned) { this._planBounce(d, a); d.planned = true; }
      const pl = d.plan;
      const u = d.u;
      const moving = d.move && d.moveStarted;
      const endHand = moving ? d.move.toHand : d.hand;
      // --- ball, body-local (x toward the dribble hand side of the body, y forward, z up; feet)
      let lx, ly, lz, ph, s;
      const uP = pl.uP, uB = pl.uB, uC = pl.uC;
      if (u < uP) {
        ph = 'push'; s = u / uP;
        // starts where the last ride ended (no pop when the height changes between bounces)
        lz = pl.top0 - (pl.top0 - pl.rel) * s * s;
        lx = U.lerp(pl.tx0, pl.rx, s * s); ly = U.lerp(pl.ty0, pl.ry, s * s);
      } else if (u < uB) {
        ph = 'down'; s = (u - uP) / (uB - uP);
        const t = s * pl.tD;
        lz = Math.max(R, pl.rel - pl.vRel * t - 0.5 * pl.g * t * t);
        const k0 = (pl.top - pl.rel) / Math.max(0.01, pl.top - R);
        const k = U.lerp(k0, 1, s);
        lx = U.lerp(pl.tx, pl.cx, k); ly = U.lerp(pl.ty, pl.cy, k);
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
      const wp = a.local(sd * lx, ly, lz, TB);
      this.x = wp[0]; this.y = wp[1]; this.z = wp[2];
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
      hd.ball = this; hd.w = 1; hd.u = u; hd.ph = ph; hd.s = s;
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
        const rel = handOn(sd * pl.rx, pl.ry, pl.rel, sd, RCV);
        const rx0 = rel.x, ry0 = rel.y, rz0 = rel.z;
        const cat = handOn(sd * pl.qx, pl.qy, pl.ccatch, pl.rside, ACT);
        if (moving && d.move.toHand !== d.hand) {
          // crossover / between the legs / behind the back: the old hand lets go, the new hand meets the ball
          hd.hand = f < 0.5 ? d.hand : endHand;
          const e = U.smooth((f - 0.25) / 0.65);
          ACT.x = cat.x; ACT.y = cat.y; ACT.z = cat.z - 0.04 * H * (1 - e);
          hd.act = f < 0.5 ? 1 - U.smooth(f / 0.5) * 0.9 : 0.1 + 0.9 * U.smooth((f - 0.5) / 0.4);
          if (f < 0.5) { ACT.x = rx0; ACT.y = ry0; ACT.z = rz0 - 0.03 * H * Math.sin(Math.PI * Math.min(1, f * 2)); }
        } else {
          const e = U.smooth(U.clamp((f - 0.12) / 0.78, 0, 1));
          const dip = 0.035 * H * Math.sin(Math.PI * U.clamp(f / 0.3, 0, 1));
          ACT.x = U.lerp(rx0, cat.x, e); ACT.y = U.lerp(ry0, cat.y, e); ACT.z = U.lerp(rz0, cat.z, e) - dip;
          hd.hand = d.hand; hd.act = 1;
        }
        wr = f < 0.3 ? U.lerp(26, 8, f / 0.3) : U.lerp(8, -18, U.smooth((f - 0.3) / 0.7));
      }
      const w = a.local(ACT.x, ACT.y, ACT.z, TC);
      hd.wx = w[0]; hd.wy = w[1]; hd.wz = w[2]; hd.wrF = wr; hd.palm = 1;
    }
    /** geometry and physics of the next bounce (heights in feet, body-local) */
    _planBounce(d, a) {
      const H = a.H;
      const moving = d.move && (d.move.type === 'cross' || d.move.type === 'btl' || d.move.type === 'btb');
      const side = d.hand ? 1 : -1;
      const recv = moving ? d.move.toHand : d.hand;
      const rside = recv ? 1 : -1;
      const low = U.clamp(Math.max(d.low || 0, a.dribbleLow || 0), 0, 1);
      const spK = U.smooth((a.speed - 6) / 12);
      // heights of the ball centre: top of the ride ~hip height (0.52 H), catch ~0.07 H lower, release
      // ~0.14 H below the top; low/protect dribble at the knees; speed dribble waist to chest
      let top = (0.5 - 0.2 * low + 0.09 * spK) * H;
      let ride = (0.07 - 0.035 * low) * H;
      let push = (0.14 - 0.06 * low + 0.02 * spK) * H;
      // ball placement: outside the dribble-side foot (>= 0.2 H from the midline), a little in front;
      // pushed out ahead of the body when running
      const tx = 0.2 * H, ty = (0.13 + 0.14 * spK) * H;
      let cx = 0.21 * H, cy = ty + (0.05 + 0.22 * spK) * H;
      let qx = 0.2 * H, qy = (0.13 + 0.14 * spK) * H; // catch point (receiving hand side)
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
      const rel = Math.max(R + 0.05 * H, top - push);
      const ccatch = ctop - ride;
      const pl = d.plan || (d.plan = {});
      // where the previous bounce's ride ended (in this bounce's side convention): the push starts there
      const hadPrev = pl.ctop != null && d.planActor === a;
      const top0 = U.clamp(hadPrev ? pl.ctop : top, rel + 0.02 * H, top + 0.12 * H);
      pl.tx0 = hadPrev ? Math.abs(pl.qtx) : tx; pl.ty0 = hadPrev ? pl.qty : ty;
      d.planActor = a;
      const e = 0.77; // FIBA: a ball dropped from 1.8 m rebounds 1.035-1.085 m
      const g = G;
      const vc = (moving ? 5.5 : 4.5 + 2 * spK); // ball speed when the hand meets it (ft/s)
      // upward speed off the floor needed to reach the catch height at speed vc
      const vUp = Math.sqrt(vc * vc + 2 * g * Math.max(0.05, ccatch - R));
      const vImp = vUp / e;
      const vRel = Math.sqrt(Math.max(4, vImp * vImp - 2 * g * Math.max(0.05, rel - R)));
      const tP = 2 * (top0 - rel) / vRel; // push: constant acceleration from rest
      const tD = (vImp - vRel) / g, tU = (vUp - vc) / g;
      const tR = 2 * (ride) / vc; // ride: decelerate to rest at the top
      const T = tP + tD + tU + tR;
      // time-scale the physical cycle to the cadence: positions keep their shape, "gravity" scales
      const k = T / Math.max(0.2, d.curPeriod || d.period);
      pl.side = side; pl.rside = rside;
      pl.top = top; pl.top0 = top0; pl.rel = rel; pl.ctop = ctop; pl.ccatch = ccatch;
      pl.uP = tP / T; pl.uB = (tP + tD) / T; pl.uC = (tP + tD + tU) / T;
      pl.tD = tD / k; pl.tU = tU / k; pl.g = g * k * k; pl.vRel = vRel * k; pl.vUp = vUp * k;
      pl.tx = tx; pl.ty = ty; pl.cx = cx; pl.cy = cy;
      // release point (along the push line) and catch point, x in the old hand's side convention
      const kr = (top - rel) / Math.max(0.01, top - R);
      pl.rx = U.lerp(tx, cx, kr); pl.ry = U.lerp(ty, cy, kr);
      // catch / ride points are on the receiving hand's side: convert to the old hand's convention
      pl.qx = qx * rside * side; pl.qy = qy; pl.qtx = tx * rside * side; pl.qty = ty;
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

  const TA = new Float64Array(3), TB = new Float64Array(3), TC = new Float64Array(3), TMP3 = [0, 0, 0];
  const HO1 = { x: 0, y: 0, z: 0 }, HO2 = { x: 0, y: 0, z: 0 };
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
  Ball.aim = aim; Ball.seg = seg; Ball.timeForAngle = timeForAngle;
  M.Ball = Ball;
})();
