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
      this.shotCue = null; // a missed shot waiting for its first contact (the audio hears the result then)
      this.time = 0;
      this._pt = { x: 0, y: 0, s: 0, d: 0 };
      this._tmp = new Float64Array(3);
      this.loose_ = null;
      this.lastBounceT = -1;
      this.trail = null;
    }

    // ------------------------------------------------------------ control
    give(actor, hold, o) {
      // (a ball in the air or loose arriving in someone's hands: a catch, for the audio)
      if (actor && (this.state === 'flight' || this.state === 'loose') && this.view && this.view.onCue) this.view.cue('catch', actor, { from: this.state, x: this.x, y: this.y, z: this.z });
      if (this.holder && this.holder !== actor) { this.holder.hasBall = false; this.holder.dribble = null; }
      this.holder = actor;
      this.state = actor ? 'held' : 'dead';
      this.segs = null; this.dr = null; this.loose_ = null;
      // (a hold asked for outright wins over a dribble still waiting for the catch to be secured: a jump shot started off the
      // catch had the ball dribbled out of the shooter's hands in the middle of it, Trial 9)
      this._dribSoon = null;
      if (actor) {
        actor.hasBall = true; actor.dribble = null;
        if (hold !== undefined) actor.ballHold = hold;
        actor._holdS = null; // a new hold starts where it belongs (the toss below covers the distance)
        const p = actor.heldBallPos(this._tmp);
        const jump = Math.hypot(p[0] - this.x, p[1] - this.y, p[2] - this.z);
        // a catch (Trial 10): the ball goes on at part of the speed it came in with (Tune.pass.catchKeep: the hands take the
        // rest as it hits them, and give with it), into the hold on a critically damped spring, quick enough that it never
        // goes on past the hold into the chest (it used to stop dead in the hands and ease from there: a stop from ~35 ft/s
        // in one frame; going on at all of its speed, the hands waiting still for it jumped to it in a frame)
        if (o && o.absorb) actor._caughtAt = this.time;
        if (o && o.absorb && isFinite(this.vx) && isFinite(jump)) {
          const T = M.Tune.pass, ox = this.x - p[0], oy = this.y - p[1], oz = this.z - p[2], ol = Math.hypot(ox, oy, oz);
          const rvx = this.vx - (actor.vx || 0), rvy = this.vy - (actor.vy || 0), rvz = this.vz || 0;
          // (a ball going on away from the chest, caught on the run from behind: the hands take nearly all of it, Tune.pass.
          // catchKeepAway; kept at half, it went on ~1 ft past the catch before it came back in, ~2600 ft/s^2)
          const k = ol > 1e-3 && rvx * ox + rvy * oy + rvz * oz > 0 ? T.catchKeepAway : T.catchKeep;
          const vx = rvx * k, vy = rvy * k, vz = rvz * k;
          const into = ol > 1e-3 ? -(vx * ox + vy * oy + vz * oz) / ol : 0;
          const w = U.clamp(ol > 0.05 ? 1.05 * into / ol : T.absorbMaxOmega, T.absorbOmega, T.absorbMaxOmega);
          this.blend = { absorb: true, ox, oy, oz, vx, vy, vz, w, t: 0 };
        } else if (jump > 1.2 && isFinite(jump)) {
          // never pop: a far hand-over becomes a short toss into the hands, a near one a quick slide into them
          // (a ball gathered on its way up from the floor, the pick-up of a dribble, rises straight into the hands at
          // bounce speed; only a hand-over across the floor gets the lobbed arc)
          const rising = p[2] > this.z + 0.4 && Math.hypot(p[0] - this.x, p[1] - this.y) < 3;
          this.blend = rising ? { x: this.x, y: this.y, z: this.z, t: 0, dur: U.clamp(jump / 22, 0.1, 0.24), arc: 0 } : { x: this.x, y: this.y, z: this.z, t: 0, dur: U.clamp(jump / 16, 0.26, 0.55), arc: 1 };
        }
        else if (jump > 0.2 && isFinite(jump)) { this.blend = { x: this.x, y: this.y, z: this.z, t: 0, dur: U.clamp(jump / 8, 0.06, 0.15), arc: 0 }; }
        else { this.blend = null; this.x = p[0]; this.y = p[1]; this.z = p[2]; }
      }
      this.spin[0] = this.spin[1] = this.spin[2] = 0;
    }
    /** end the dribble into a hold the next time the ball comes up into the hand (Trial 10: a pass off the dribble; picked
     *  up wherever it was as the pass began, a ball on its way to the floor was lifted into the hands at ~28 ft/s through
     *  the windup). Taken at once if it is in the hand now; cb once it is held */
    gatherSoon(actor, hold, cb, cond) {
      if (this.state !== 'dribble' || !this.dr || this.dr.actor !== actor) return false;
      // (cond: taken only while it holds, the layup's zero-step foot down, Trial 9; otherwise the ball goes on bouncing)
      this.dr.gather = { actor, hold, cb: cb || null, cond: cond || null };
      this._gatherNow();
      return true;
    }
    /** the gather asked for, once the ball is in the hand (its ride up to the top, no move under way) */
    _gatherNow() {
      const d = this.dr, g = d && d.gather;
      if (!g || !d.plan || !(d.u >= d.plan.uC) || (d.move && d.moveStarted) || (g.cond && !g.cond())) return;
      d.gather = null;
      this.give(g.actor, g.hold);
      if (g.cb) U.safe(g.cb, null, 'gather');
    }
    /** spin the ball in the holder's hands for dur (s): backspin toward where the holder faces, rps turns a second */
    spinHeld(actor, dur, rps) {
      if (this.holder !== actor || this.state !== 'held') return;
      this.heldSpin = { actor, until: this.time + dur, w: spinAlong(Math.cos(actor.facing), Math.sin(actor.facing), -U.TAU * rps) };
    }
    release() {
      if (this.holder) { this.holder.hasBall = false; this.holder.dribble = null; }
      this.holder = null;
    }
    /** start (or continue) dribbling with hand 0/1 */
    dribble(actor, hand, o) {
      o = o || {};
      // (a pass just caught is secured first, Tune.pass.secureS: the catch gives, the hands taking it in toward the chest,
      // and the dribble goes from that hold; started on the next frame, the dribbling hand was still out at the catch spot
      // and reached for its spot ~5-10 in behind it through the first push, and over half of the first pushes after a
      // catch on the move missed the ball in games, Trial 10. A move asked for meanwhile goes with it)
      if (this.holder === actor && this.state === 'held' && actor._caughtAt != null && !o.now) {
        const at = actor._caughtAt + M.Tune.pass.secureS;
        if (this.time < at - 1e-6) {
          const ds = this._dribSoon;
          this._dribSoon = { actor, hand, o, at, moves: ds && ds.actor === actor ? ds.moves : [] };
          return;
        }
      }
      this._dribSoon = null;
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
      if (!d) { if (this._dribSoon) this._dribSoon.moves.push([type, o]); return; }
      // (a move asked for on its own replaces what is left of a combo)
      d.combo = null; d.comboDone = null;
      this._queueMove(d, type, o);
    }
    /** a move into the dribble: after the one waiting for its beat if there is one (a combination), or at once if
     *  `urgent` (getting the ball away from a reach: it goes at the next bounce, not waiting for a footfall) */
    _queueMove(d, type, o) {
      // (an in and out and a hesitation keep the ball in the same hand)
      const same = type === 'inout' || type === 'hesi', TH = M.Tune.handle, urgent = !!(o && o.urgent);
      const mv = { type, same, urgent, onDone: o && o.onDone, period: (o && o.period) || (type === 'hesi' ? TH.hesiPeriodS : type === 'inout' ? TH.inoutPeriodS : 0.36) };
      // (one waiting for its beat already: this one goes after it, a combination, Trial 8; it used to replace it, the move
      // asked for first never made. The hand it goes to is set as it becomes the next one. An urgent one goes first)
      if (d.pendingMove && !d.pendingMove.spin && !urgent) { d.nextMove = mv; return; }
      if (urgent) d.nextMove = null;
      mv.toHand = same ? d.hand : 1 - d.hand;
      d.pendingMove = mv;
    }
    /**
     * a combo: dribble moves back to back, each from the hand the one before left the ball in (crossovers, between
     * the legs, behind the back, a hesitation that keeps it in the same hand). list: types or {type, period};
     * o.onDone(ball) when the last one is done (the moment to go). A move asked for meanwhile replaces the rest
     */
    dribbleCombo(list, o) {
      const d = this.dr;
      if (!d || !list || !list.length) return;
      d.combo = list.map((m) => typeof m === 'string' ? { type: m } : m);
      d.comboDone = (o && o.onDone) || null;
      this._comboNext(d);
    }
    _comboNext(d) {
      if (this.dr !== d) return;
      const m = d.combo && d.combo.shift();
      if (!m) { d.combo = null; const cb = d.comboDone; d.comboDone = null; if (cb) U.safe(() => cb(this), null, 'combo'); return; }
      // (through the same queue as a single move: the hand it goes to, its beat on the feet, Trial 8)
      // (one bounce per move, Tune.handle.comboPeriodS; a hesitation hangs as long as one on its own, Tune.handle.hesiPeriodS)
      this._queueMove(d, m.type, { period: m.period || M.Tune.handle.comboPeriodS[m.type], onDone: () => this._comboNext(d) });
    }
    /** is a combo (or a single move) under way or waiting to go? */
    working() { const d = this.dr; return !!(d && (d.move || d.pendingMove || d.nextMove || (d.combo && d.combo.length))); }
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
      this.shotCue = null;
      this.state = 'flight';
      // (a pass, pass(), or anything else in the air: a shot, a block, a deflection, whose rebounder is its passTarget)
      this.isPass = false;
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
      let segs;
      if (o.segs && o.segs.length) {
        // (a pass planned as the push began, Director.planThrow: the flight as planned, from the release point the push takes
        // the ball to (Actor.heldBallPos) at its release time. Not moved onto where the ball is now: thrown between steps,
        // the ball's clock is still at the step before, the push a frame short of the release, and moved there the whole
        // flight came up ~3.5 in short of the hands waiting for it)
        segs = o.segs;
      } else segs = this.planPass(p0, p1, dur, { bounce: o.bounce, t0 });
      segs[segs.length - 1].target = o.target || null; // function returning live target [x,y,z]
      const passer = this.holder;
      this.passKind = o.kind || (o.bounce ? 'bounce' : 'chest');
      this.flight(segs, o.onArrive);
      this.isPass = true;
      if (this.view && this.view.onCue) this.view.cue('pass', passer, { x: p0[0], y: p0[1], z: p0[2], dur, bounce: !!o.bounce });
    }
    /** a pass's flight from p0 to p1 in dur, starting at o.t0: a bounce pass off the floor (o.bounce), else a ballistic
     *  flight with drag; with the backspin off the fingers. Returns the segments */
    planPass(p0, p1, dur, o) {
      o = o || {};
      const t0 = o.t0 != null ? o.t0 : this.time;
      p0 = [p0[0], p0[1], p0[2]];
      const segs = [];
      const sp = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) / dur;
      const bp = o.bounce ? this._bouncePass(p0, p1, dur, t0) : null;
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
      return segs;
    }
    /**
     * Bounce pass with a real floor bounce: the floor contact time is found so that after the bounce (restitution
     * by impact speed, friction against the backspin) it rises to the receiver's hands at `dur` (nearest ~58 % of
     * the flight when two fit), and the release speed so that it still covers the distance after the bounce takes
     * some of its speed. Returns the two segments, or null when none fits.
     */
    _bouncePass(p0, p1, dur, t0) {
      if (t0 == null) t0 = this.time;
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
      const s1 = seg(t0, p0, [ux * vh, uy * vh, r.v0z], t1); s1.w = spinAlong(ux, uy, -vh / R * 0.3);
      const s2 = seg(t0 + t1, pb, a.v, t2); s2.bounce = true; s2.w = a.w;
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
      // (a dribble asked for as a pass was caught, started once the catch is secured: dribble)
      const ds = this._dribSoon;
      if (ds) {
        if (this.state !== 'held' || this.holder !== ds.actor || (ds.actor.throwing && ds.actor.throwing())) this._dribSoon = null;
        else if (this.time >= ds.at - 1e-6) {
          this._dribSoon = null;
          this.dribble(ds.actor, ds.hand, Object.assign({}, ds.o, { now: true }));
          for (const m of ds.moves) this.dribbleMove(m[0], m[1]);
        }
      }
      const px = this.x, py = this.y, pz = this.z;
      if (this.state === 'held' && this.holder) {
        const p = this.holder.heldBallPos(this._tmp);
        const bl = this.blend;
        if (bl && bl.absorb) {
          // (the catch's give, see give: x(t) = (x0 + (v0 + w x0) t) e^-wt on each axis, from where it was caught)
          // (a throw or a move started out of it, a clip with its own ball path: the give is taken up quicker, from where it
          // has got to, Tune.pass.absorbClipOmega; at its own pace the ball was still ~0.5 ft out when the next pass began,
          // and the arms, set for the ball at the chest, went ~1 in into it)
          const hc = this.holder, cs = hc.upper && hc.upper.clip.ballKeys ? hc.upper : hc.clip && hc.clip.clip.ballKeys ? hc.clip : null, wq = M.Tune.pass.absorbClipOmega;
          if (cs && bl.w < wq) {
            const e0 = Math.exp(-bl.w * bl.t), k0 = bl.t, ax = ['x', 'y', 'z'];
            for (const q of ax) {
              const o = bl['o' + q], v = bl['v' + q];
              bl['o' + q] = (o + (v + bl.w * o) * k0) * e0;
              bl['v' + q] = (v - bl.w * (v + bl.w * o) * k0) * e0;
            }
            bl.t = 0; bl.w = wq;
          }
          bl.t += dt;
          const e = Math.exp(-bl.w * bl.t), k = bl.t;
          this.x = p[0] + (bl.ox + (bl.vx + bl.w * bl.ox) * k) * e;
          this.y = p[1] + (bl.oy + (bl.vy + bl.w * bl.oy) * k) * e;
          this.z = p[2] + (bl.oz + (bl.vz + bl.w * bl.oz) * k) * e;
          if (bl.t * bl.w > 9) this.blend = null;
        } else if (bl) {
          bl.t += dt;
          const u = U.clamp(bl.t / bl.dur, 0, 1), e = U.smooth(u);
          this.x = U.lerp(bl.x, p[0], e); this.y = U.lerp(bl.y, p[1], e);
          this.z = U.lerp(bl.z, p[2], e) + (bl.arc === 0 ? 0 : Math.sin(Math.PI * u) * Math.min(2.5, bl.dur * 5));
          if (u >= 1) this.blend = null;
        } else { this.x = p[0]; this.y = p[1]; this.z = p[2]; }
      } else if (this.state === 'dribble' && this.dr) {
        this._dribble(dt);
        if (this.dr && this.dr.gather) this._gatherNow();
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
      // (spun in the hands, Trial 9's free throw routine: kept turning until the spin is let go of)
      if (this.state === 'held' && this.heldSpin && this.time < this.heldSpin.until && this.holder === this.heldSpin.actor) { this.spin[0] = this.heldSpin.w[0]; this.spin[1] = this.heldSpin.w[1]; this.spin[2] = this.heldSpin.w[2]; }
      else if (this.state === 'held') { this.spin[0] *= 0.9; this.spin[1] *= 0.9; this.spin[2] *= 0.9; }
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
      if (s.bounce && !s.roll) { this.squash = U.clamp(Math.abs(this.vz) / 20, 0.2, 1); this.onBounce && this.onBounce(this); if (v && v.sound) v.sound('bounce', U.clamp(Math.abs(this.vz) / 18, 0.2, 1), this); }
      if (s.rim && this.shotHoop) {
        // (the rim rings and the net jumps as hard as the ball came in: a flat line drive clangs, a soft touch ticks)
        const hit = s.soft ? 0.4 : U.clamp(Math.hypot(this.vx, this.vy, this.vz) / 22, 0.55, 1.6);
        this.shotHoop.hitRim(hit); this.onRim && U.safe(() => this.onRim(this), null, 'onRim');
        if (!s.w && !s.orbit) this.spin[2] += (Math.random() - 0.5) * 20;
        if (v && v.sound) v.sound('rim', s.soft ? 0.5 : U.clamp(hit, 0.6, 1), this);
      }
      if (s.board && this.shotHoop) { this.shotHoop.hitBoard(1); if (v && v.sound) v.sound('board', 1, this); }
      // a missed shot's first contact (the rim, the glass, the blocker's hand, or the ball going by on an air ball):
      // that is when the result is out (the choreographer set shotCue; a make is reported with its score)
      if (this.shotCue) {
        const c = this.shotCue;
        this.shotCue = null;
        if (v && v.onCue) v.cue('shotResult', null, { ev: c.ev, contact: s.rim ? 'rim' : s.board ? 'board' : c.blocked ? 'hand' : 'air', x: s.p0[0], y: s.p0[1], z: s.p0[2] });
      }
    }
    _fireSeg(s) {
      if (s.fired) return;
      s.fired = true;
      if (s.score) {
        // (a swish whips the net up hard, a make off the rim gives it a lighter snap)
        if (this.shotHoop) this.shotHoop.swish(s.swish ? 1.3 : 0.6);
        if (this.view && this.view.sound) this.view.sound(s.swish ? 'swish' : 'net', 1, this);
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
      // (a move asked for starts where a cycle is planned, its start: taken on a frame or two into a push, the push already
      // begun was planned again from there, and with a hang at the top the ball went back up to it, Trial 8)
      if (d.move && !d.moveStarted && d.u < 0.1) { d.moveStarted = true; d.planned = false; }
      const period = d.T || (d.move && d.moveStarted ? d.move.period : d.period);
      d.curPeriod = period;
      const u0 = d.u;
      // (the carry out of the hands takes its own time first, and a hang at the top its own; the cycle waits at its start)
      const cr0 = d.planned && d.plan && d.plan.carry && d.plan.carry.t < d.plan.carry.dur ? d.plan.carry : null;
      const hg0 = !cr0 && d.planned && d.plan && d.plan.hang && d.plan.hang.t < d.plan.hang.dur ? d.plan.hang : null;
      let adv = dt;
      if (cr0) { adv = Math.max(0, cr0.t + dt - cr0.dur); cr0.t = Math.min(cr0.dur, cr0.t + dt); }
      else if (hg0) { adv = Math.max(0, hg0.t + dt - hg0.dur); hg0.t = Math.min(hg0.dur, hg0.t + dt); }
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
        d.u -= 1; d.cycle = (d.cycle || 0) + 1;
        if (d.move && d.moveStarted) {
          d.hand = d.move.toHand;
          if (d.move.type === 'hesi') d.burst = true;
          const cb = d.move.onDone; d.move = null;
          if (cb) U.safe(cb, null, 'dribble move');
        }
        // (a move asked for while one waited: its turn)
        if (!d.pendingMove && !d.move && d.nextMove) { const nm = d.nextMove; d.nextMove = null; nm.toHand = nm.same ? d.hand : 1 - d.hand; d.pendingMove = nm; }
        d.planned = false;
      }
      if (!d.planned && d.pendingMove && !d.move && !(d.pull && d.pull.on) && (d.pendingMove.urgent || this._moveOnBeat(d, a))) { d.move = d.pendingMove; d.pendingMove = null; d.moveStarted = true; }
      if (!d.planned) {
        if (d.plan) d.plan.hang = null;
        this._planBounce(d, a); d.planned = true;
        if (d.plan.carry) { d.u = 0; d.plan.carry.t = Math.min(dt, d.plan.carry.dur); }
        else if (d.plan.hang) {
          // (a hang: held at the top for its time, counted from the cycle's start, the push after it)
          const hg = d.plan.hang, T0 = d.T || period;
          hg.t = Math.max(0, d.u) * T0; d.u = 0;
          if (hg.t >= hg.dur) { d.u = (hg.t - hg.dur) / T0; hg.t = hg.dur; }
        }
      }
      const pl = d.plan;
      const u = d.u;
      const cr = pl.carry && pl.carry.t < pl.carry.dur ? pl.carry : null;
      const moving = d.move && d.moveStarted;
      const endHand = moving ? d.move.toHand : d.hand;
      // moving, where it bounces is chosen again every frame while the hand still pushes it, and where it is caught while
      // it falls, against where his legs will be as it goes by (_clearPath): neither shows until the ball leaves the
      // hand or comes off the floor (Trial 8: planned once at the cycle's start and the legs not looked at, a move's
      // path went through a shin and the ball was shoved out of it in the air, up to a foot in a frame)
      if (a.gaitOn && a.speed > 2 && a.legsAt && !cr && !(moving && d.move.spin) && !(a.clip && a.clip.clip && a.clip.clip.name === 'spinMove')) {
        if (u < pl.uP) this._clearPath(d, a, pl, u, true);
        else if (u < pl.uB) this._clearPath(d, a, pl, u, false);
      }
      // --- ball, body-local (x toward the dribble hand side of the body, y forward, z up; feet)
      let lx, ly, lz, ph, s;
      const uP = pl.uP, uB = pl.uB, uC = pl.uC;
      // (in the air the ball goes its own way across the floor (_airW), except while a spin turns him: the body's facing
      // lags the spin clip's, 20-47 deg 0.2 s on, and a flight fixed where he was to be came down behind him; there the
      // ball goes round with his trunk as before, the spin's footwork is Trial 7's)
      const worldAir = !(moving && d.move.spin) && !(a.clip && a.clip.clip && a.clip.clip.name === 'spinMove');
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
        if (worldAir) { const q = this._airW(d, a, pl, true, s, u, TW2); lx = q[0]; ly = q[1]; }
      } else if (u < uC) {
        ph = 'up'; s = (u - uB) / (uC - uB);
        const t = s * pl.tU;
        lz = Math.min(pl.ctop, R + pl.vUp * t - 0.5 * pl.g * t * t);
        lx = U.lerp(pl.cx, pl.qx, s); ly = U.lerp(pl.cy, pl.qy, s);
        if (worldAir) { const q = this._airW(d, a, pl, false, s, u, TW2); lx = q[0]; ly = q[1]; }
      } else {
        ph = 'ride'; s = (u - uC) / (1 - uC);
        lz = pl.ctop - (pl.ctop - pl.ccatch) * (1 - s) * (1 - s);
        // (from where it was caught: where the ball is as the hand takes it, in the frame then, eased from the hand's own
        // standstill there to the top: at a steady speed from the first frame the hand jumped to it, ~10 ft/s when a retreat
        // had moved the top back beside the hip, Trial 8)
        if (pl.qxA == null) {
          const f = a.facing + (a.dribbleYaw || 0), cf = Math.cos(f), sf = Math.sin(f), rx = this.x - a.x, ry = this.y - a.y;
          pl.qxA = (rx * sf - ry * cf) * pl.side; pl.qyA = rx * cf + ry * sf;
        }
        const es = U.smooth(s);
        lx = U.lerp(pl.qxA, pl.qtx, es); ly = U.lerp(pl.qyA, pl.qty, es);
      }
      const sd = pl.side; // +1: right hand side of the body
      // (in the air, eased round where his legs are about to be, Trial 8: _airAvoid)
      if ((ph === 'down' || ph === 'up') && a.legsAt && worldAir) {
        const av = this._airAvoid(d, a, pl, u, dt), f = a.facing + (a.dribbleYaw || 0), cf = Math.cos(f), sf = Math.sin(f);
        lx += (av[0] * sf - av[1] * cf) * sd; ly += av[0] * cf + av[1] * sf;
      } else if (d.av) { d.av.x = d.av.y = d.av.vx = d.av.vy = 0; }
      // the ball never gets behind the shoulder whose hand has it (Trial 8: leaning into a start, or the trunk turned to a
      // pass, the shoulder went past a ball planned in the hips' frame and the arm was at the end of its reach back):
      // a smooth floor under its forward, Tune.handle.aheadFt ahead of that shoulder (none on a move behind the back or
      // between the legs, which go there on purpose)
      const TH = M.Tune.handle, beh = moving && (d.move.type === 'btb' || d.move.type === 'btl') && ph !== 'ride';
      const shA = !beh && a.armReach ? a.armReach(ph === 'push' || ph === 'down' ? d.hand : endHand, AR)[1] + TH.aheadFt : null;
      const fwd = (y) => shA == null ? y : y + TH.aheadSoftFt * Math.log1p(Math.exp((shA - y) / TH.aheadSoftFt));
      // (only with the hand on it, the push and the ride: in the air the ball goes its own way, and pushed on by a trunk
      // turning or leaning over it, it jolted across the floor, Trial 8; its catch spot is kept ahead as it bounces, and
      // the floor comes in over the ride from where it was taken: all at once, a ball taken behind the hip, behind the
      // back or between the legs, jumped with the hand ~0.8 ft forward at the catch)
      // (the spin's catch is behind him as he comes round, ~1.3 ft: eased over its ride the hand could not keep up with the
      // ball, and it is taken there at once, as before; the spin's footwork is Trial 7's)
      if (ph === 'ride') ly = moving && d.move.spin ? fwd(ly) : U.lerp(ly, fwd(ly), U.smooth(s));
      else if (ph === 'push' || !worldAir) ly = fwd(ly);
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
          const cq = (a.localD || a.local).call(a, sd * pl.qx, pl.qy, 0, TB);
          this.x = U.lerp(an.bx, cq[0], s); this.y = U.lerp(an.by, cq[1], s);
        }
        this.z = lz + a.jumpZ;
        // (and out of his legs as he turns round it, Trial 8: it stayed put while his shins came through it)
        const f = a.facing + (a.dribbleYaw || 0), cf = Math.cos(f), sf = Math.sin(f), rx = this.x - a.x, ry = this.y - a.y, lb = TL;
        lb[0] = rx * sf - ry * cf; lb[1] = rx * cf + ry * sf; lb[2] = lz;
        if (a.clearBall(lb, R, true, a.dribbleYaw || 0, true) > 1e-6) { this.x = a.x + sf * lb[0] + cf * lb[1]; this.y = a.y - cf * lb[0] + sf * lb[1]; }
      } else {
        // never through the dribbler himself (a knee coming through, a crossover in front of the shins): the ball
        // keeps out of his legs and trunk, except going between the legs on purpose, and the hand meets it where it is
        const lb = TL;
        lb[0] = sd * lx; lb[1] = ly; lb[2] = lz;
        if (a.clearBall(lb, R, true, a.dribbleYaw || 0, ph === 'down' || ph === 'up') > 1e-6) { lx = lb[0] * sd; ly = lb[1]; lz = Math.max(R, lb[2]); }
        let wp = (a.localD || a.local).call(a, sd * lx, ly, lz, TB);
        // and out of everyone else's, across the floor (a defender up on him, a screener), the hand going with it
        const acts = this.view && this.view.actors;
        if (acts) {
          // (in the air across the floor only, keeping its fall; in the hand any way out)
          const flat = ph === 'down' || ph === 'up';
          let wx = wp[0], wy = wp[1], wz = wp[2], moved = false;
          for (const id in acts) {
            const o = acts[id];
            if (!o || o === a || o.hidden || o.kind !== 'player' || !o.clearBallOf || Math.abs(o.x - wx) > 4 || Math.abs(o.y - wy) > 4) continue;
            if (o.clearBallOf(wx, wy, wz, R, TO2, flat) > 1e-6) { wx = TO2[0]; wy = TO2[1]; wz = TO2[2]; moved = true; }
          }
          if (moved) {
            const f = a.facing + (a.dribbleYaw || 0), c = Math.cos(f), sn = Math.sin(f), dx = wx - wp[0], dy = wy - wp[1];
            lx += (dx * sn - dy * c) * sd; ly += dx * c + dy * sn; lz = Math.max(R, lz + wz - wp[2]);
            wp = (a.localD || a.local).call(a, sd * lx, ly, lz, TB);
          }
        }
        this.x = wp[0]; this.y = wp[1]; this.z = wp[2];
      }
      if (u0 < uB && d.u >= uB) { this.squash = 1; if (this.onBounce) this.onBounce(this); if (this.view && this.view.sound) this.view.sound('dribble', U.clamp(0.45 + a.speed / 30, 0.4, 1), this, a); }
      // forward roll spin
      this.setSpinAlong(a.vx || 0.01, a.vy || 0, -(a.speed + 3) / R * 0.4);
      // --- the dribbling hand (wrist IK target + wrist angle); the other hand takes over on a crossover
      const pr = R + 0.01 * H;
      const handOn = (bx, by, bz, handSign, o) => {
        // palm (finger pads) on the top-back-outside of the ball; the actor corrects its wrist so the hand
        // lands exactly here (bx is the signed body-local x of the ball centre); handSign between -1 and 1 (a palm
        // rolling over the top), the spot kept on the ball's surface
        const hx = handSign * 0.3, k = pr / Math.sqrt(hx * hx + 0.28 * 0.28 + 0.91 * 0.91);
        o.x = bx + hx * k; o.y = by - 0.28 * k; o.z = bz + 0.91 * k;
        return o;
      };
      const hd = a.dribble && a.dribble.ball === this ? a.dribble : (a.dribble = { ball: this, w: 1 });
      hd.ball = this; hd.w = 1; hd.u = u; hd.ph = ph; hd.s = s; hd.carry = cr ? cr.t / cr.dur : null;
      // (an in and out's fake with the shoulders, toward the hand it is not going to: up through the push, gone by the catch)
      hd.fake = pl.inout && ph !== 'ride' ? Math.sin(Math.PI * Math.min(1, u / Math.max(0.01, pl.uC))) : 0;
      hd.hesi = d.move && d.move.type === 'hesi' ? 1 : 0;
      const ACT = HO1, RCV = HO2;
      let wr; // wrist flexion (deg; + = flexed / fingers down, - = cocked back)
      // the fingers (curl 0 open .. 1 fist): spread to take the ball as it comes up, snapping down with the wrist through the
      // push, easing off after the release (Tune.handle.fingSpread, fingSnap, fingRest)
      const THf = M.Tune.handle;
      let fing;
      if (ph === 'push') {
        handOn(sd * lx, ly, lz, sd, ACT);
        // (carried out of the hands the wrist is near straight, cocking back as the carry ends: fully cocked with the palm
        // rolling over the top, the forearm angled down into the ball, Trial 8)
        wr = cr ? U.lerp(THf.carryWrF, -32, U.smooth(cr.t / cr.dur)) : U.lerp(-32, 26, U.smooth(s));
        fing = U.lerp(THf.fingSpread, THf.fingSnap, U.smooth(s));
        hd.hand = d.hand; hd.act = 1;
      } else if (ph === 'ride') {
        // (in and out: the palm from the inside of the ball, where it took it, back over the top as it rides it out)
        handOn(sd * lx, ly, lz, pl.inout ? pl.rside * U.lerp(-1, 1, U.smooth(s)) : pl.rside, ACT);
        wr = U.lerp(-18, -34, U.smooth(s));
        fing = THf.fingSpread;
        hd.hand = endHand; hd.act = 1;
      } else {
        // free flight: the hand follows through a little, then waits low and rises to meet the ball
        const f = (u - uP) / (uC - uP);
        const rel = handOn(sd * pl.rx, fwd(pl.ry), pl.rel, sd, RCV);
        const rx0 = rel.x, ry0 = rel.y, rz0 = rel.z;
        // (the hand goes to where the ball will be caught, the floor ahead of the shoulder already in it: see _airW)
        const cq = this._catchLocal(d, a, pl, TW3), cat = handOn(sd * cq[0], worldAir ? cq[1] : fwd(cq[1]), pl.ccatch, pl.inout ? -pl.rside : pl.rside, ACT);
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
        fing = f < 0.3 ? U.lerp(THf.fingSnap, THf.fingRest, U.smooth(f / 0.3)) : U.lerp(THf.fingRest, THf.fingSpread, U.smooth((f - 0.3) / 0.7));
        if (moving && d.move.toHand !== d.hand) { wr = -18; fing = THf.fingSpread; hd.act = 1; }
      }
      const w = (a.localD || a.local).call(a, ACT.x, ACT.y, ACT.z, TC);
      // (in the ball's flight the hand's path goes round it, not through it: a hand waiting for a crossover's catch was
      // in its way as it fell, Trial 8)
      if (ph === 'down' || ph === 'up') keepOff(w, this, pr + M.Tune.handle.offClearFt);
      hd.wx = w[0]; hd.wy = w[1]; hd.wz = w[2]; hd.wrF = wr; hd.fing = fing; hd.palm = 1;
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
          const cq = this._catchLocal(d, a, pl, TW3), cat = handOn(sd * cq[0], worldAir ? cq[1] : fwd(cq[1]), pl.ccatch, pl.rside, HO3);
          this._moveHand(d, pl, a, u, uC, cat, HO4);
          const wq = (a.localD || a.local).call(a, HO4.x, HO4.y, HO4.z, TD);
          keepOff(wq, this, pr + M.Tune.handle.offClearFt);
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
          // (its speed at the release carried on no further than Tune.handle.followMaxFt in all: a crossover's push ends at
          // 30-40 ft/s, and carried ~1.5 ft on the arm went past its reach and straightened in a frame, Trial 8)
          const r0 = mv.rel0, tr = (u - uP) * (d.curPeriod || 0.4) - r0[6], vr = Math.hypot(r0[3], r0[4], r0[5]);
          const k = TH.followS * (1 - Math.exp(-tr / TH.followS)) * Math.min(1, TH.followMaxFt / Math.max(1e-6, vr * TH.followS));
          const wq = (a.localD || a.local).call(a, r0[0] + r0[3] * k, r0[1] + r0[4] * k, r0[2] + r0[5] * k - 0.04 * H * U.smooth(f), TD);
          keepOff(wq, this, pr + M.Tune.handle.offClearFt);
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
    /** whether a pending move starts with this bounce (Trial 8): standing, at once; moving, when a footfall comes within
     *  reach of its bounce (a move's period stretched or shortened by Tune.handle.moveSyncK), else it waits a bounce, once */
    _moveOnBeat(d, a) {
      const pm = d.pendingMove;
      if (!(a.gaitOn && a.speed > 2) || pm.waited != null && d.cycle - pm.waited >= (footOf(d, pm) != null ? 2 : 1)) return true;
      const TH = M.Tune.handle, sps = a.gaitDbg && a.gaitDbg.sps > 0 ? a.gaitDbg.sps : M.Anims.stepsPerSec(a.speed, a.H), stepT = 1 / sps;
      // (a move's bounce comes ~0.45 of its period after its push starts; behind the back and between the legs, with one
      // foot's landing (footOf), which comes every other step)
      const ft = footOf(d, pm), span = ft != null ? 2 * stepT : stepT;
      const fr = (v) => v - Math.floor(v), P0 = pm.period || 0.36;
      const tL = ft != null ? fr((ft ? 0 : 0.5) - (a.phase || 0)) * span : fr(-2 * (a.phase || 0)) * stepT;
      // (and a footfall later than that by up to a hang at the top, Tune.handle.hangMaxS, the push waiting for it; not the
      // spin's crossover, whose pull held it at the top already)
      const lo = 0.45 * P0 * (1 - TH.moveSyncK), hi = 0.45 * P0 * (1 + TH.moveSyncK) + (pm.spin ? 0 : TH.hangMaxS);
      if ((tL >= lo && tL <= hi) || (tL + span >= lo && tL + span <= hi)) return true;
      if (pm.waited == null) pm.waited = d.cycle;
      return false;
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
    /** the ball in the air goes on its own across the floor, not with his trunk (Trial 8: planned in the dribble's frame,
     *  which turns with the chest, a crossover's turn of the shoulders, ~20 deg in four frames, swung the ball in the air
     *  with it): falling, straight from where the hand let it go to its bounce spot where the body will be then (fixed at
     *  the release); rising, straight from where it bounced to its catch spot where the body will be as it gets there.
     *  Returns the spot in the dribble's frame now (x in the hand's side convention, like lx), into o */
    _airW(d, a, pl, down, s, u, o) {
      const T = d.curPeriod || d.T || 0.6, yawD = a.dribbleYaw || 0, sd = pl.side;
      let fl = d.fl;
      if (!fl || fl.serial !== pl.serial) fl = d.fl = { serial: pl.serial, r: null, b: null, q: null };
      const at = (lx, ly, dt, out) => {
        const pf = dt > 0 ? a.predictFrame(dt, PF) : null, x0 = pf ? pf.x : a.x, y0 = pf ? pf.y : a.y, f = (pf ? pf.facing : a.facing) + yawD;
        const cf = Math.cos(f), sf = Math.sin(f), x = sd * lx;
        out[0] = x0 + sf * x + cf * ly; out[1] = y0 - cf * x + sf * ly;
        return out;
      };
      // (its spots kept ahead of the shoulder whose hand has it, as the push and the ride keep it, unless a move goes behind on
      // purpose: the floor is not applied in the air)
      const TH = M.Tune.handle, behind = d.move && d.moveStarted && (d.move.type === 'btb' || d.move.type === 'btl');
      const ahead = (y, hand) => { if (behind || !a.armReach) return y; const shA = a.armReach(hand, AR)[1] + TH.aheadFt; return y + TH.aheadSoftFt * Math.log1p(Math.exp((shA - y) / TH.aheadSoftFt)); };
      let wx, wy;
      if (down) {
        // (from where the push let it go, the floor ahead of the shoulder in it as the push had it)
        if (!fl.r) fl.r = at(pl.rx, ahead(pl.ry, d.hand), 0, [0, 0]);
        if (!fl.b) fl.b = at(pl.cx, ahead(pl.cy, d.hand), Math.max(0, (pl.uB - u) * T), [0, 0]);
        wx = U.lerp(fl.r[0], fl.b[0], s); wy = U.lerp(fl.r[1], fl.b[1], s);
      } else {
        // (and where it comes up to is fixed there too, where the hand was to be then: the hand goes to it, not it to the
        // hand; aimed again every frame, a body speeding up into a retreat bent the ball in the air)
        if (!fl.b) fl.b = [this.x, this.y];
        if (!fl.q) fl.q = at(pl.qx, ahead(pl.qy, d.move && d.moveStarted ? d.move.toHand : d.hand), Math.max(0, (pl.uC - u) * T), [0, 0]);
        wx = U.lerp(fl.b[0], fl.q[0], s); wy = U.lerp(fl.b[1], fl.q[1], s);
      }
      const f = a.facing + yawD, cf = Math.cos(f), sf = Math.sin(f), rx = wx - a.x, ry = wy - a.y;
      o[0] = (rx * sf - ry * cf) * sd; o[1] = rx * cf + ry * sf;
      return o;
    }
    /** where the ball is caught, in the dribble's frame as it will be then (x in the hand's side convention; the hand's
     *  target, which goes with the body): fixed across the floor from the bounce on (_airW), the plan's spot before it
     *  (in the frame now, it ran ahead of the hand by how far the body goes before the catch, ~0.7 ft running). Into o */
    _catchLocal(d, a, pl, o) {
      const fl = d.fl;
      if (fl && fl.serial === pl.serial && fl.q) {
        const T = d.curPeriod || d.T || 0.6, dt = Math.max(0, (pl.uC - d.u) * T), pf = dt > 0 ? a.predictFrame(dt, PF) : null;
        const x0 = pf ? pf.x : a.x, y0 = pf ? pf.y : a.y, f = (pf ? pf.facing : a.facing) + (a.dribbleYaw || 0);
        const cf = Math.cos(f), sf = Math.sin(f), rx = fl.q[0] - x0, ry = fl.q[1] - y0;
        o[0] = (rx * sf - ry * cf) * pl.side; o[1] = rx * cf + ry * sf;
      } else { o[0] = pl.qx; o[1] = pl.qy; }
      return o;
    }
    /** the ball in the air eased round his legs (Trial 8): looking ahead along the rest of its flight (_airW's straight
     *  path across the floor, its fall or rise) against where his legs will be (Actor.legsAt), the push across the floor
     *  that would keep it clear the most it will need soonest (Tune.handle.avoidAheadS) is where an offset goes, on a
     *  critically damped spring (avoidHz) whose acceleration is capped (avoidAccel): shoved out of a shin only in the
     *  frame it got there, a move's ball went through it or jumped. Gone by the last of the rise, the hand there to take
     *  it. World offset [x, y] into AVO */
    _airAvoid(d, a, pl, u, dt) {
      const TH = M.Tune.handle, H = a.H, T = d.curPeriod || d.T || 0.6, av = d.av || (d.av = { x: 0, y: 0, vx: 0, vy: 0 });
      const fl = d.fl, rTh = 0.044 * H, rSh = 0.032 * H, rFt = 0.02 * H, mg = TH.clearMarginFt + R;
      let tx = 0, ty = 0, need = 0;
      const nA = Math.max(1, Math.round(TH.avoidAheadS * 60));
      for (let k = 1; k <= nA && fl && fl.b; k++) {
        const dtk = k / 60, uu = u + dtk / T;
        if (uu >= pl.uC - 0.3 * (pl.uC - pl.uB)) break;
        // (the ball's spot then: straight across the floor, its height from its fall or rise)
        let bx, by, bz;
        if (uu < pl.uB) {
          if (!fl.r) break;
          const s = U.clamp((uu - pl.uP) / Math.max(1e-6, pl.uB - pl.uP), 0, 1), t = s * pl.tD;
          bx = U.lerp(fl.r[0], fl.b[0], s); by = U.lerp(fl.r[1], fl.b[1], s); bz = Math.max(R, pl.rel - pl.vRel * t - 0.5 * pl.g * t * t);
        } else {
          const s = U.clamp((uu - pl.uB) / Math.max(1e-6, pl.uC - pl.uB), 0, 1), t = s * pl.tU;
          const pf = a.predictFrame(Math.max(0, (pl.uC - u) * T), PF), f = pf.facing + (a.dribbleYaw || 0), cf = Math.cos(f), sf = Math.sin(f), x = pl.side * pl.qx;
          bx = U.lerp(fl.b[0], pf.x + sf * x + cf * pl.qy, s); by = U.lerp(fl.b[1], pf.y - cf * x + sf * pl.qy, s); bz = Math.min(pl.ctop, R + pl.vUp * t - 0.5 * pl.g * t * t);
        }
        bx += av.x; by += av.y;
        const L = AV_L;
        a.legsAt(dtk, L);
        // (the push across the floor out of each thigh, shin and foot it would be in)
        let px = 0, py = 0;
        for (let side = 0; side < 2; side++) {
          const o = side * 15;
          for (let q = 0; q < 4; q++) {
            const i = o + q * 3, j = i + 3, rr = (q === 0 ? rTh : q === 1 ? rSh : rFt) + mg;
            const ax = L[i], ay = L[i + 1], az = L[i + 2], sx = L[j] - ax, sy = L[j + 1] - ay, sz = L[j + 2] - az;
            const l2 = sx * sx + sy * sy + sz * sz, tt = l2 > 1e-9 ? U.clamp(((bx - ax) * sx + (by - ay) * sy + (bz - az) * sz) / l2, 0, 1) : 0;
            const vx = bx - ax - sx * tt, vy = by - ay - sy * tt, vz = bz - az - sz * tt, dv = Math.hypot(vx, vy, vz), dh = Math.hypot(vx, vy);
            if (dv >= rr || dh < 1e-4) continue;
            const h = Math.min(0.5, (rr - dv) * dv / dh);
            px += vx / dh * h; py += vy / dh * h;
          }
        }
        const pn = Math.hypot(px, py);
        if (pn > need) { need = pn; tx = av.x + px; ty = av.y + py; }
      }
      if (!(need > 0)) { tx = 0; ty = 0; }
      // (the spring, its acceleration capped)
      const w = 2 * Math.PI * TH.avoidHz;
      let ax = w * w * (tx - av.x) - 2 * w * av.vx, ay = w * w * (ty - av.y) - 2 * w * av.vy;
      const am = Math.hypot(ax, ay), cap = TH.avoidAccel;
      if (am > cap) { ax *= cap / am; ay *= cap / am; }
      if (dt > 0) { av.vx += ax * dt; av.vy += ay * dt; av.x += av.vx * dt; av.y += av.vy * dt; }
      AVO[0] = av.x; AVO[1] = av.y;
      return AVO;
    }
    /** the bounce spot (bounce true, while the hand pushes) or the catch spot (while the ball falls) moved, a little,
     *  to where the ball's path from there on stays clear of his legs as they will be (Actor.legsAt): candidates round the
     *  plan's own spot, each scored by how deep the ball would go into a thigh, shin or foot at samples along the rest of
     *  its flight, plus how far it moved (Tune.handle.clearSpotFt at most) (Trial 8) */
    _clearPath(d, a, pl, u, bounce) {
      const TH = M.Tune.handle, H = a.H, T = d.T || d.curPeriod || 0.6, sd = pl.side;
      const hang = pl.hang && pl.hang.t < pl.hang.dur ? pl.hang.dur - pl.hang.t : 0;
      // (the plan's own spots, kept: every frame's choice is made from them)
      if (bounce) { if (pl.cx0 == null) { pl.cx0 = pl.cx; pl.cy0 = pl.cy; } }
      else if (pl.qx0 == null) { pl.qx0 = pl.qx; pl.qy0 = pl.qy; }
      const yawD = a.dribbleYaw || 0, rTh = 0.044 * H, rSh = 0.032 * H, rFt = 0.02 * H, mg = TH.clearMarginFt + R;
      // the frames at the release, the bounce and the catch (the ball's path across the floor is straight between its
      // spots then, as _airW flies it), and the fall's and the rise's samples: their times, heights and legs
      const tOf = (uu) => Math.max(0, hang + (uu - u) * T);
      const fr = (dt, k) => { const pf = dt > 0 ? a.predictFrame(dt, PF) : null; CP_K[k * 3] = pf ? pf.x : a.x; CP_K[k * 3 + 1] = pf ? pf.y : a.y; CP_K[k * 3 + 2] = (pf ? pf.facing : a.facing) + yawD; };
      const wAt = (k, lx, ly, o, j) => { const f = CP_K[k * 3 + 2], cf = Math.cos(f), sf = Math.sin(f), x = sd * lx; o[j] = CP_K[k * 3] + sf * x + cf * ly; o[j + 1] = CP_K[k * 3 + 1] - cf * x + sf * ly; };
      const fl = d.fl && d.fl.serial === pl.serial ? d.fl : null;
      fr(tOf(pl.uP), 0); fr(tOf(pl.uB), 1); fr(tOf(pl.uC), 2);
      const US = CP_U; let n = 0;
      if (bounce) for (let k = 1; k <= 4; k++) US[n++] = k / 4;
      const nD = n;
      for (let k = 1; k <= 4; k++) US[n++] = k / 5;
      for (let k = 0; k < n; k++) {
        const down = k < nD, sk = US[k], uu = down ? U.lerp(pl.uP, pl.uB, sk) : U.lerp(pl.uB, pl.uC, sk), t = down ? sk * pl.tD : sk * pl.tU;
        CP_Z[k] = down ? Math.max(R, pl.rel - pl.vRel * t - 0.5 * pl.g * t * t) : Math.min(pl.ctop, R + pl.vUp * t - 0.5 * pl.g * t * t);
        a.legsAt(tOf(uu), CP_L[k]);
      }
      // (the spots that stay put: the release while the hand pushes, the release and the bounce once it falls)
      const W = CP_W;
      if (bounce) wAt(0, pl.rx, pl.ry, W, 0);
      else { W[0] = fl && fl.r ? fl.r[0] : 0; W[1] = fl && fl.r ? fl.r[1] : 0; if (fl && fl.b) { W[2] = fl.b[0]; W[3] = fl.b[1]; } else wAt(1, pl.cx, pl.cy, W, 2); }
      const score = (dx, dy) => {
        if (bounce) { wAt(1, pl.cx0 + dx, pl.cy0 + dy, W, 2); wAt(2, pl.qx, pl.qy, W, 4); } else wAt(2, pl.qx0 + dx, pl.qy0 + dy, W, 4);
        let c = 0;
        for (let k = 0; k < n; k++) {
          const down = k < nD, sk = US[k];
          const bx = down ? U.lerp(W[0], W[2], sk) : U.lerp(W[2], W[4], sk), by = down ? U.lerp(W[1], W[3], sk) : U.lerp(W[3], W[5], sk), bz = CP_Z[k], L = CP_L[k];
          let pen = 0;
          for (let side = 0; side < 2; side++) {
            const o = side * 15;
            pen = Math.max(pen, rTh + mg - segDist3(L, o, o + 3, bx, by, bz), rSh + mg - segDist3(L, o + 3, o + 6, bx, by, bz),
              rFt + mg - segDist3(L, o + 6, o + 9, bx, by, bz), rFt + mg - segDist3(L, o + 9, o + 12, bx, by, bz));
          }
          if (pen > 0) c += pen * pen;
        }
        return 100 * c + dx * dx + dy * dy;
      };
      const lim = TH.clearSpotFt;
      let best = score(0, 0), bx = 0, by = 0;
      if (best > 1e-9) {
        for (const g of CP_G) for (const h of CP_G) { const v = score(g * lim, h * lim); if (v < best) { best = v; bx = g * lim; by = h * lim; } }
        const st = 0.25 * lim, x0 = bx, y0 = by;
        for (const g of [-1, 0, 1]) for (const h of [-1, 0, 1]) {
          if (!g && !h) continue;
          const nx = U.clamp(x0 + g * st, -lim, lim), ny = U.clamp(y0 + h * st, -lim, lim), v = score(nx, ny);
          if (v < best) { best = v; bx = nx; by = ny; }
        }
      }
      if (bounce) { pl.cx = pl.cx0 + bx; pl.cy = pl.cy0 + by; }
      else {
        // (the catch spot is where the other hand is going: it moves there no faster than Tune.handle.catchMoveFtps)
        const mv = TH.catchMoveFtps / 60, qx = pl.qxC != null ? pl.qxC : pl.qx0, qy = pl.qyC != null ? pl.qyC : pl.qy0;
        const ex = pl.qx0 + bx - qx, ey = pl.qy0 + by - qy, el = Math.hypot(ex, ey), k = el > mv ? mv / el : 1;
        pl.qx = pl.qxC = qx + ex * k; pl.qy = pl.qyC = qy + ey * k;
      }
    }
    /** geometry and physics of the next bounce (heights in feet, body-local) */
    _planBounce(d, a) {
      const H = a.H;
      const moving = d.move && (d.move.type === 'cross' || d.move.type === 'btl' || d.move.type === 'btb' || d.move.type === 'inout');
      const hesi = d.move && d.move.type === 'hesi';
      const side = d.hand ? 1 : -1;
      const recv = moving ? d.move.toHand : d.hand;
      const rside = recv ? 1 : -1;
      // the dribble's shape for how he is moving (the actor's dribbleShape: wide of the hip sizing up, low and outside
      // the foot driving, pushed out ahead at thigh height running)
      const sh = a.dribbleShape ? a.dribbleShape(DSH, !!d.from) : { tx: 0.2, ty: 0.13, cx: 0.21, cy: 0.18, top: 0.5, low: 0, spK: 0 };
      // (the bounce after a hesitation: low and quick, the burst past him)
      const burst = !!d.burst && !d.move;
      const low = U.clamp(Math.max(d.low || 0, sh.low, burst ? M.Tune.handle.burstLow : 0), 0, 1), spK = sh.spK;
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
        // in and out: the one bounce in front, in toward the middle as if crossing over, and the same hand, come round to
        // the inside of the ball, takes it there and rides it back out (coaching: the hand rolls from the outside over the
        // top to the inside, then pushes the ball back out, the ball never changing hands)
        if (d.move.type === 'inout') { cx = M.Tune.handle.inoutInK * tx; cy = ty + 0.06 * H; qx = M.Tune.handle.inoutCatchK * tx; qy = ty + 0.03 * H; }
        // behind the back and between the legs (front to back), the ball comes up behind the hip on the other side and
        // is taken there, then ridden forward (Trial 8: caught out in front, its way up went under him, through a thigh)
        if (d.move.type === 'btb' || d.move.type === 'btl') qy = M.Tune.handle.behindCatchH * H;
      }
      // a hesitation: the bounce comes up higher, into a hand that rides it up as he rises, slower (the hang)
      if (hesi) { top += M.Tune.handle.hesiTopH * H; ctop = top; }
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
      if (d.move && d.moveStarted) {
        P = d.move.period;
        // moving, a move's bounce lands with the footfall of the receiving hand's foot (Trial 8: they were timed without the
        // feet, one bounce in four with a step): the ball goes across as that foot plants, and between the legs it goes
        // between the feet then (the other one still down behind or in front); the period within Tune.handle.moveSyncK
        d.moveFoot = null;
        if (a.gaitOn && a.speed > 2 && a.feet) {
          // (the footfall nearest the move's own bounce, either foot: a step can be longer than the move; behind the back,
          // the ball side foot's (coaching: step with the foot on the ball's side and push the ball behind as it goes, so
          // that leg is out in front, not trailing where the ball goes by; with the other foot's landing the ball went
          // over the trailing ankle); between the legs, the receiving side's (front to back, the foot on the other side
          // stepping out in front: with the ball side's, the other knee, bent in the stance and trailing, was in the way
          // of the ball coming up to the other hand)
          const sps = a.gaitDbg && a.gaitDbg.sps > 0 ? a.gaitDbg.sps : M.Anims.stepsPerSec(a.speed, H), stepT = 1 / sps;
          const fr = (v) => v - Math.floor(v), ft = footOf(d), span = ft != null ? 2 * stepT : stepT;
          const tL0 = ft != null ? fr((ft ? 0 : 0.5) - (a.phase || 0)) * span : fr(-2 * (a.phase || 0)) * stepT;
          const P0 = P, lo = P0 * (1 - TH.moveSyncK), hi = P0 * (1 + TH.moveSyncK), u0 = Math.max(0, d.u);
          let tL = null;
          // (from now: the plan is made up to a frame into the cycle, Trial 8)
          for (let it = 0; it < 2; it++) {
            const s0 = solve(P), tb = s0.tP + s0.tD - u0 * s0.T;
            if (tL == null) tL = tL0 + Math.max(0, Math.round((tb - tL0) / span)) * span;
            P = U.clamp(P - (tb - tL) * s0.T / Math.max(0.05, tb + u0 * s0.T), lo, hi);
          }
          // a bounce the period cannot put that late, the cycle as slow as the ball's fall lets it be (a hesitation's, up
          // high): the push waits at the top, the hand on the ball, for the rest (the hang), up to Tune.handle.hangMaxS
          // (Trial 8: a hesitation's bounce came ~0.08 s before the footfall)
          // (not the spin's crossover, whose pull already held it at the top through the turn)
          const s1 = solve(P), late = tL - (s1.tP + s1.tD - u0 * s1.T);
          if (late > 0.01 && !d.move.spin) pl.hang = { t: 0, dur: Math.min(TH.hangMaxS, late) };
          // (which foot lands then: the right at the stride's start, the left halfway)
          d.moveFoot = fr((a.phase || 0) + tL * sps * 0.5 + 0.25) < 0.5 ? 1 : 0;
        }
      }
      else if (walking) {
        const sps = a.gaitDbg && a.gaitDbg.sps > 0 ? a.gaitDbg.sps : M.Anims.stepsPerSec(a.speed, H), stepT = 1 / sps, tMin = cyc(TH.vcComfort).T;
        let n = d.n || 2;
        if (n * stepT < tMin * 0.92 && n < 3) n++;
        else if (n > 1 && (n - 1) * stepT >= tMin * 1.08) n--;
        // (a behind the back or between the legs asked for: a bounce every step till it goes, the bounces then with either
        // foot, so one comes with the landing of the foot it waits for, footOf)
        if (d.pendingMove && footOf(d, d.pendingMove) != null) n = 1;
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
      if (burst) { P *= TH.burstK; d.burst = false; }
      const c = solve(P);
      const tP = c.tP, tD = c.tD, tU = c.tU, T = c.T;
      // between the legs: the bounce between his feet as they will be then (the receiving foot where it lands, the other
      // where it is), in the dribble's frame then (Trial 8: at a fixed spot under him it went through a leg)
      if (moving && d.move.type === 'btl' && a.feet && a.predictFrame) {
        const lf = d.moveFoot != null ? d.moveFoot : recv ? 1 : 0, fR = a.feet[lf], fO = a.feet[1 - lf];
        const ax = fR.state === 'plant' ? fR.x : fR.tx, ay = fR.state === 'plant' ? fR.y : fR.ty;
        // (between the ankles, where the shins come down: a foot's spot is the ball of the foot, dims.ball on along it,
        // and between those the ball went into the front shin, Trial 8)
        const bl = a.dims ? a.dims.ball : 0.084 * H, yR = fR.state === 'plant' ? fR.yaw : fR.tyaw, yO = fO.yaw;
        const mx = 0.5 * (ax + fO.x - bl * (Math.cos(yR || 0) + Math.cos(yO || 0))), my = 0.5 * (ay + fO.y - bl * (Math.sin(yR || 0) + Math.sin(yO || 0)));
        // (then: after any hang at the top, from the cycle's start)
        const pf = a.predictFrame((pl.hang ? pl.hang.dur : 0) + tP + tD - Math.max(0, d.u) * T, PF), f = pf.facing + (a.dribbleYaw || 0), cf = Math.cos(f), sf = Math.sin(f);
        const lx = (mx - pf.x) * sf - (my - pf.y) * cf, ly = (mx - pf.x) * cf + (my - pf.y) * sf;
        cx = lx * side; cy = ly;
      }
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
      pl.tx = tx; pl.ty = ty; pl.cx = cx; pl.cy = cy; pl.cx0 = pl.cy0 = pl.qx0 = pl.qy0 = pl.qxC = pl.qyC = null;
      pl.serial = (pl.serial || 0) + 1; pl.qxA = pl.qyA = null;
      // release and catch points (x in the old hand's side convention; the catch and the ride on the receiving hand's side)
      pl.rx = rx; pl.ry = ry;
      pl.qx = qxo; pl.qy = qy; pl.qtx = tx * rside * side; pl.qty = ty;
      pl.inout = !!(moving && d.move.type === 'inout');
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
  const AR = new Float64Array(4), TP3 = new Float64Array(3), TO2 = [0, 0, 0], TW2 = [0, 0], TW3 = [0, 0];
  /** the foot whose landing a move's bounce waits for (1 right, 0 left), or null for either (Trial 8): behind the back,
   *  the ball side's; between the legs, the receiving side's */
  function footOf(d, mv) {
    const m = mv || d.move;
    if (!m || m.spin) return null;
    return m.type === 'btb' ? (d.hand ? 1 : 0) : m.type === 'btl' ? (m.toHand != null ? m.toHand : 1 - d.hand) : null;
  }
  /** a hand's spot w (world) moved straight out from the ball's centre to at least `min` from it (not on the ball) */
  function keepOff(w, b, min) {
    const dx = w[0] - b.x, dy = w[1] - b.y, dz = w[2] - b.z, dl = Math.hypot(dx, dy, dz);
    if (dl >= min || dl < 1e-6) return;
    const k = min / dl;
    w[0] = b.x + dx * k; w[1] = b.y + dy * k; w[2] = b.z + dz * k;
  }
  /** a palm spot p (body frame) brought straight toward the arm's shoulder until it is within Tune.handle.reachK of the
   *  arm's reach (ar: armReach); returns how far it was moved (0: already in reach) */
  function toReach(ar, p) {
    const lim = ar[3] * M.Tune.handle.reachK, dx = p[0] - ar[0], dy = p[1] - ar[1], dz = p[2] - ar[2], dl = Math.hypot(dx, dy, dz);
    if (dl <= lim) return 0;
    const k = lim / dl;
    p[0] = ar[0] + dx * k; p[1] = ar[1] + dy * k; p[2] = ar[2] + dz * k;
    return dl - lim;
  }
  // (_clearPath's scratch: sample fractions, legs, frames, a point, the candidate grid)
  const CP_U = new Float64Array(8), CP_L = Array.from({ length: 8 }, () => new Float64Array(30)), CP_K = new Float64Array(9), CP_W = new Float64Array(6), CP_Z = new Float64Array(8);
  const CP_G = [-1, -0.5, 0, 0.5, 1];
  const AV_L = new Float64Array(30), AVO = [0, 0];
  /** distance from (x, y, z) to the segment between points i and j of the flat array L */
  function segDist3(L, i, j, x, y, z) {
    const ax = L[i], ay = L[i + 1], az = L[i + 2], bx = L[j] - ax, by = L[j + 1] - ay, bz = L[j + 2] - az;
    const l2 = bx * bx + by * by + bz * bz, t = l2 > 1e-9 ? U.clamp(((x - ax) * bx + (y - ay) * by + (z - az) * bz) / l2, 0, 1) : 0;
    return Math.hypot(x - ax - bx * t, y - ay - by * t, z - az - bz * t);
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
  Ball.aim = aim; Ball.seg = seg; Ball.timeForAngle = timeForAngle; Ball.contact = bounceOff; Ball.eFloor = eFloor; Ball.DRAG = DRAG; Ball.RIM_Z = RIM_Z;
  M.Ball = Ball;
})();
