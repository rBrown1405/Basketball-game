/* Pro BBALL Coach — match view: rebounds the rebounder really gets to (extends PBC.Match.Director).
 * Built on the Director's rebound planning (choreo.js: planRebound picks where a miss really goes, near the engine's
 * rebounder; releaseShot flies the carom off the rim or the board): the ball is no longer pulled through the air to
 * his hands wherever he is. By where the carom goes (NBA tracking: misses at the rim come off within ~4 ft about
 * half the time, long rebounds follow ~20 % of missed twos and ~40 % of missed threes):
 *  - a contested board near the rim: he goes up and takes it with two hands at the top of his jump (~10-11 ft);
 *  - an uncontested one: a small hop, arms up (~9-10 ft);
 *  - a long carom (9+ ft from the rim): he runs to it and catches it on the way down, hands up at his face;
 *  - if he is not at the spot when the ball gets there, it keeps falling and bounces, and he runs it down (a loose
 *    ball, not a ball that bends toward him in the air); the ball only slides the last inches into his hands. */
(function () {
  'use strict';
  const M = window.PBC.Match, U = M.U;
  const Dir = M.Director;
  if (!Dir) return;
  const P = Dir.prototype;
  const base = { planRebound: P.planRebound, scheduleRebounder: P.scheduleRebounder, p_rebound: P.p_rebound, caromTime: P.caromTime };
  const R = 0.39, G = 32.2;
  const TMP = new Float64Array(3), TMP2 = new Float64Array(3);

  P.planRebound = function (ev, sh, spot, fireAt, result) {
    base.planRebound.call(this, ev, sh, spot, fireAt, result);
    const pr = this.pendingRebound;
    if (pr && pr.actor) this.reboundStyle(pr);
  };
  /** how he takes it: by how far out it comes down and whether anyone is there with him */
  P.reboundStyle = function (pr) {
    const a = pr.actor, rim = this.rim;
    const d = Math.hypot(pr.x - rim.x, pr.y - rim.y);
    // contested: an offensive rebound, or anyone from the other team near where it comes down
    let contested = !!pr.ev.off;
    for (const o of (a.team === this.off ? this.defActors() : this.offActors())) if (Math.hypot(o.x - pr.x, o.y - pr.y) < 7) contested = true;
    pr.style = d >= 9 ? 'long' : contested && d < 7 ? 'high' : 'mid';
    pr.floor = false; pr.jumpH = null;
    if (pr.style === 'long') pr.z = 0.8 * a.H; // (caught on the way down, hands up at the face)
    else if (pr.style === 'mid') { pr.jumpH = 0.35; pr.z = 1.42 * a.H + 0.35; }
    else pr.z = U.clamp(1.33 * a.H + 1.3 + (a.rVert || 0.5) * 0.8, 8.2, 11.2);
  };
  /** how far `a` gets toward (x, y) in `t` seconds: from his speed toward it, accelerating to his top speed */
  P.runReach = function (a, t, x, y) {
    const dx = x - a.x, dy = y - a.y, dl = Math.hypot(dx, dy) || 1;
    const v0 = Math.max(0, (a.vx * dx + a.vy * dy) / dl), A = (a.accel || 20) * 0.8, V = (a.maxSpeed || 22) * 0.9;
    const tA = Math.max(0, (V - v0) / A);
    return t <= tA ? v0 * t + 0.5 * A * t * t : v0 * tA + 0.5 * A * tA * tA + V * (t - tA);
  };
  /**
   * The carom's time off the rim, set when the shot goes up (the Director's timing), and where it comes down: of the
   * natural caroms, one he can get to in the time until it comes down (a quick run in traffic, less his reaction and,
   * for a jump, the jump's lead); a carom beyond that comes off longer toward him.
   */
  P.caromTime = function (pr, tToContact) {
    let tC = base.caromTime.call(this, pr, tToContact);
    const a = pr && pr.actor;
    if (!a) return tC;
    const rim = this.rim;
    for (let pass = 0; pass < 3; pass++) {
      const air = pr.style !== 'floor';
      const tRun = Math.max(0.1, tToContact + tC - (air ? 0.5 : -0.25) - 0.15);
      const reach = this.runReach(a, tRun, pr.x, pr.y);
      const ex = pr.x - a.x, ey = pr.y - a.y, el = Math.hypot(ex, ey);
      if (el <= reach + 0.8) break;
      let nx = a.x + ex / el * reach, ny = a.y + ey / el * reach;
      if ((nx - rim.x) * this.dir > 0.6) nx = rim.x - this.dir * 0.6; // (never behind the backboard)
      const rl = Math.hypot(nx - rim.x, ny - rim.y);
      if (rl < 2.2) { const k = 2.2 / Math.max(rl, 0.01); nx = rim.x + (nx - rim.x) * k; ny = rim.y + (ny - rim.y) * k; }
      pr.x = U.clamp(nx, 1, 93); pr.y = U.clamp(ny, 1, 49);
      this.reboundStyle(pr);
      // (still out of his reach, next to the rim: it comes down and he gets it off the bounce)
      if (pass === 2 && Math.hypot(pr.x - a.x, pr.y - a.y) > reach + 0.8 && pr.style !== 'floor') { pr.style = 'floor'; pr.floor = true; pr.z = R; pr.jumpH = null; }
      tC = base.caromTime.call(this, pr, tToContact);
    }
    return tC;
  };

  P.scheduleRebounder = function (pr, tGrabBall) {
    const a = pr.actor;
    if (!a) return;
    const b = this.v.ball;
    const tGrab = this.T + (tGrabBall - b.time);
    const lock = (dur) => { if (a.team === this.off) this.lockOff(a, dur); else this.lockDef(a, dur); };
    pr.tGrabT = tGrab;
    if (pr.style === 'floor') {
      // it comes down to the floor: he runs to where it lands and gathers it off the bounce
      lock(tGrab - this.T + 2.5);
      a.moveTo(pr.x, pr.y, { by: tGrab + 0.2, speed: a.maxSpeed, face: 'move', stance: 'ready' });
      return;
    }
    // (his hands meet the ball at the spot, a little in front of him as he faces the rim: his body stops that much
    // short of it)
    const off = pr.style === 'long' ? 0.9 : 0.5;
    { const ux = this.rim.x - pr.x, uy = this.rim.y - pr.y, ul = Math.hypot(ux, uy) || 1; pr.bx = pr.x - ux / ul * off; pr.by = pr.y - uy / ul * off; }
    if (pr.style === 'long') {
      // a long carom: he runs to it and catches it on the way down (a catch, no jump), or it bounces if he is not there
      lock(tGrab - this.T + 1.2);
      const rimA0 = () => Math.atan2(this.rim.y - a.y, this.rim.x - a.x);
      a.moveTo(pr.bx, pr.by, { by: tGrab - 0.25, speed: a.maxSpeed, stance: 'stand', face: (me) => (Math.hypot(pr.bx - me.x, pr.by - me.y) > 3 && me.speed > 3 ? Math.atan2(me.vy, me.vx) : rimA0()) });
      this.at(tGrab - 0.3, () => {
        if (this.pendingRebound !== pr) return;
        if (Math.hypot(a.x - pr.bx, a.y - pr.by) > 1.6 || (a.isBusy() && !(a.clip && a.clip.ending))) { this.dropCarom(pr); return; }
        a.ballHold = 'chest';
        a.play('catch', { mirror: false });
        const s = b.segs && b.segs.length ? b.segs[b.segs.length - 1] : null;
        if (s) s.target = () => { const p = a.heldBallPos(TMP); return [p[0], p[1], p[2]]; };
      }, 'long rebound catch');
      return;
    }
    const clip = M.Anims.get('rebound');
    const clipStart = tGrab - clip.events.grab;
    lock(tGrab - this.T + 1.2);
    // (he runs there, turning to the rim for the last steps: squared up to the rim from the start he would slide and
    // backpedal to it and never get there in time)
    const rimA = () => Math.atan2(this.rim.y - a.y, this.rim.x - a.x);
    a.moveTo(pr.bx, pr.by, { by: clipStart - 0.05, speed: a.maxSpeed, stance: 'stand', face: (me) => (Math.hypot(pr.bx - me.x, pr.by - me.y) > 3 && me.speed > 3 ? Math.atan2(me.vy, me.vx) : rimA()) });
    this.at(clipStart, () => {
      if (this.pendingRebound !== pr) return;
      // (not there in time: the ball keeps falling and bounces, and he runs it down)
      if (Math.hypot(a.x - pr.bx, a.y - pr.by) > 1.4 || (a.isBusy() && !(a.clip && a.clip.ending))) { this.dropCarom(pr); return; }
      a.stopClip(0);
      a.play('rebound', { x: a.x, y: a.y, facing: Math.atan2(this.rim.y - a.y, this.rim.x - a.x), mirror: false, fadeIn: 0.06, blendT: 0.2, jumpH: pr.jumpH != null ? pr.jumpH : undefined });
      const s = b.segs && b.segs.length ? b.segs[b.segs.length - 1] : null;
      if (s) s.target = () => { const p = a.heldBallPos(TMP); return [p[0], p[1], p[2]]; }; // (the last inches into his hands)
    }, 'rebound jump');
  };

  /** the carom was aimed at hands that are not there: carry the flight on to the floor, let it bounce, and have the
   *  rebounder run it down */
  P.dropCarom = function (pr) {
    const b = this.v.ball, segs = b.segs;
    pr.style = 'floor';
    if (!segs || !segs.length || b.holder) return;
    const s = segs[segs.length - 1];
    s.target = null;
    const p = b._segPos(s, s.t1, [0, 0, 0]), v = b._segVel(s, s.t1, [0, 0, 0]);
    if (s.roll || p[2] < R + 0.2) return; // (already on its way down to the floor)
    const tf = (v[2] + Math.sqrt(v[2] * v[2] + 2 * G * Math.max(0, p[2] - R))) / G;
    if (tf > 0.02) segs.push(M.Ball.seg(s.t1, p, v, tf));
    b._bounceTail(segs);
    const a = pr.actor;
    if (a) {
      const e = b.posAt(b.flightEnd() - 0.001, TMP2);
      const lx = U.clamp(e[0], 1, 93), ly = U.clamp(e[1], 1, 49);
      a.stopClip(0.1);
      a.moveTo(lx, ly, { speed: a.maxSpeed, face: 'move', stance: 'ready' });
      pr.tGrabT = Math.max(pr.tGrabT || 0, this.T + 0.4);
    }
  };

  /** a ball coming down to the floor: the rebound beat waits until it is at his hands (chasing it meanwhile) */
  P.p_rebound = function (ev, beat, gap) {
    const pr = this.pendingRebound && this.pendingRebound.ev === ev ? this.pendingRebound : null;
    const a = ev.player != null ? this.A(ev.player) : null;
    if (!pr || !a || pr.tGrabT == null) return base.p_rebound.call(this, ev, beat, gap);
    const b = this.v.ball;
    const floor = () => pr.style === 'floor';
    const chase = () => {
      if (this.pendingRebound !== pr || b.holder || beat.fired) return;
      if (floor() && !a.isBusy()) {
        const p = b.posAt(b.time + 0.25, TMP);
        a.moveTo(U.clamp(p[0], 1, 93), U.clamp(p[1], 1, 49), { speed: a.maxSpeed, face: 'move', stance: 'ready' });
      }
      this.at(this.T + 0.12, chase, 'chase the ball');
    };
    this.at(Math.max(this.T + 0.05, pr.tGrabT - 0.4), chase, 'chase the ball');
    beat.onFire = () => {
      if (floor() && b.holder !== a && !a.isBusy() && Math.hypot(b.x - a.x, b.y - a.y) < 2.5) a.play('catch', { mirror: false });
      this.secureRebound(ev, a);
    };
    beat.waitFor = () => {
      if (b.holder) return true;
      if (!floor()) return b.state !== 'flight' || Math.hypot(b.x - a.x, b.y - a.y) < 1.2 || this.T > pr.tGrabT + 0.4;
      const near = Math.hypot(b.x - a.x, b.y - a.y) < 2.2;
      return (near && b.z > 1.8 && b.z < 5.5) || (near && b.z < 5.5 && this.T > pr.tGrabT + 0.9) || this.T > pr.tGrabT + 2.2;
    };
    return Math.max(0.05, pr.tGrabT - this.T);
  };
})();
