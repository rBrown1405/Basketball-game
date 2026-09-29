/* Pro BBALL Coach — match view: rebounds read off the rim (extends PBC.Match.Director; Trial 11).
 * Built on the Director's rebound planning (choreo.js: planRebound picks where a miss would go, near the engine's
 * rebounder, and releaseShot flies the shot at the rim or the glass). A missed shot's carom is the ball's own flight from
 * there: once it comes off, nothing steers it (it used to bend up to ~2 ft onto the rebounder's hands, and he used to be on
 * his way to where it would come down before it had hit the rim). Nobody knows where it is going until it comes off:
 *  - while it is up (the release to the rim) the defense finds its men and boxes them out and the offense crashes
 *    (choreo.js crashBoards); the engine's rebounder is one of them;
 *  - as it hits the rim or the glass its way off is settled (settleCarom): of the caroms a miss like this makes (NBA
 *    tracking: misses at the rim come off within ~4 ft about half the time; long rebounds follow ~20 % of missed twos and
 *    ~40 % of missed threes; the average carom ~8 ft even from deep), off the side it was going to, the one the engine's
 *    rebounder can get to from where he really is, as near the natural one as can be;
 *  - a reaction later (Tune.glass.readS) the players near it read it (readCarom): the rebounder runs to where it will come
 *    down to his hands and jumps (a running jump over what is left) so that his hands meet it at the top of his jump, both
 *    of them on the ball, and brings it down under his chin with the elbows out; a long carom he runs to and catches on the
 *    way down; the others near it go after it, the nearest of the other side up with him;
 *  - not in his hands in time, it goes on down on its own flight and bounces, and he runs it down and picks it up. */
(function () {
  'use strict';
  const M = window.PBC.Match, U = M.U;
  const Dir = M.Director;
  if (!Dir) return;
  const P = Dir.prototype;
  const base = { planRebound: P.planRebound, p_rebound: P.p_rebound };
  const R = 0.39, G = 32.2;
  const TMP = new Float64Array(3), TMP2 = new Float64Array(3);
  const TG = () => M.Tune.glass;

  P.planRebound = function (ev, sh, spot, fireAt, result) {
    base.planRebound.call(this, ev, sh, spot, fireAt, result);
    const pr = this.pendingRebound;
    if (pr) pr.shotD = Math.hypot(spot.x - this.rim.x, spot.y - this.rim.y);
    if (pr && pr.actor) this.reboundStyle(pr);
  };
  /** a miss's natural carom distance from the rim by the shot's (NBA optical tracking: ~3-4 ft off shots at the rim, ~5 from
   *  mid range, ~6 from a long two, ~8 from three) */
  P.caromMean = function (shotD) { return shotD < 8 ? 3.6 : shotD < 16 ? 5 : shotD < 22.5 ? 6.2 : 8; };
  /** how he takes it, as first planned (settled as it comes off, settleCarom): by how far out it comes down and whether
   *  anyone of the other side is there with him */
  P.reboundStyle = function (pr) {
    const a = pr.actor, rim = this.rim, T = TG();
    const d = Math.hypot(pr.x - rim.x, pr.y - rim.y);
    let near = !!pr.ev.off;
    for (const o of (a.team === this.off ? this.defActors() : this.offActors())) if (Math.hypot(o.x - pr.x, o.y - pr.y) < T.contestFt) near = true;
    pr.style = d >= T.longFt ? 'long' : near && d < T.highFt ? 'high' : 'mid';
    pr.floor = false;
    pr.z = this.takeZ(a, pr.style);
    pr.jumpH = pr.style === 'long' ? null : this.jumpFor(a, pr.style);
  };
  /** the rebound move's jump for him: a full one (a contested board) or a smaller one */
  P.jumpFor = function (a, style) {
    const clip = M.Anims.get('rebound'), full = clip.jump.h * a.H * (0.85 + (a.rVert || 0.5) * 0.3);
    return style === 'high' ? full : Math.min(full, TG().midJumpFt);
  };
  /** the height of his hands at the take: the rebound move's ball at the top of its jump, or at the chest for a long carom
   *  caught on the way down */
  P.takeZ = function (a, style) {
    const T = TG(), clip = M.Anims.get('rebound');
    if (style === 'long') return T.longTakeH * a.H;
    const kz = clip.ballKeys ? clip.ballKeys[2](clip.events.grab) : 1.42;
    return kz * a.H + this.jumpFor(a, style);
  };
  /** how far `a` gets toward (x, y) in `t` seconds: from his speed toward it, accelerating to his top speed */
  P.runReach = function (a, t, x, y) {
    const dx = x - a.x, dy = y - a.y, dl = Math.hypot(dx, dy) || 1;
    const v0 = Math.max(0, (a.vx * dx + a.vy * dy) / dl), A = (a.accel || 20) * 0.8, V = (a.maxSpeed || 22) * 0.9;
    const tA = Math.max(0, (V - v0) / A);
    return t <= tA ? v0 * t + 0.5 * A * t * t : v0 * tA + 0.5 * A * tA * tA + V * (t - tA);
  };
  /** how long a run of d ft the way (ux, uy) takes him: runStartS to get going, then braking what he has going the other
   *  way, and his push up to Tune.glass.runK of his top speed */
  P.runTime = function (a, d, ux, uy) {
    const T = TG();
    if (d < 0.3) return 0;
    const V = (a.maxSpeed || 22) * T.runK, A = (a.accel || 20) * 0.9, Ab = (a.decel || A * 1.35) * 0.9;
    const v0 = ux != null ? (a.vx || 0) * ux + (a.vy || 0) * uy : 0;
    let t = T.runStartS, dd = d;
    if (v0 < 0) { t += -v0 / Ab; dd += v0 * v0 / (2 * Ab); }
    const vs = U.clamp(v0, 0, V), tA = (V - vs) / A, dA = vs * tA + 0.5 * A * tA * tA;
    return t + (dd <= dA ? (Math.sqrt(vs * vs + 2 * A * dd) - vs) / A : tA + (dd - dA) / V);
  };

  /** the shot is up: when it comes off the rim or the glass (the last touch of either: a rattle's hops come first), its way
   *  off is settled a frame before, and a reaction after, the players near it read it. Until then he is in the box-outs and
   *  the crash with everyone else (crashBoards) */
  P.scheduleRebounder = function (pr, tGrabBall) {
    const a = pr.actor, b = this.v.ball;
    if (!a) return;
    const segs = b.segs;
    let ci = -1;
    if (segs) for (let i = 0; i < segs.length; i++) if (segs[i].rim || segs[i].board || (pr.blocked && i === 1)) ci = i;
    pr.tGrabT = this.T + (tGrabBall - b.time);
    b.passTarget = null; // (nobody's catch: it goes where it goes)
    const lock = (dur) => { if (a.team === this.off) this.lockOff(a, dur); else this.lockDef(a, dur); };
    if (ci < 0) { pr.style = 'floor'; pr.floor = true; pr.tContactT = this.T; lock(2.5); return; }
    const sC = segs[ci];
    pr.segs = segs; pr.ci = ci;
    pr.tContactT = this.T + (sC.t0 - b.time);
    lock(pr.tGrabT - this.T + 1.5);
    this.at(Math.max(this.T, pr.tContactT - 1 / 60), () => this.settleCarom(pr), 'settle the carom');
    this.at(pr.tContactT + TG().readS, () => this.readCarom(pr), 'read the carom');
  };

  /** as it hits: the way it comes off. Of the natural caroms of a miss like this (off within Tune.glass.coneDeg of the way it
   *  was going to go, round the shot's own distance), the one the engine's rebounder can get to from where he will be as he
   *  reads it (a run after the reaction, a running jump, his hands at the top of it), as near the natural one as can be and
   *  as soon; no faster off the rim than it came in allows. From there the ball's flight is its own: through where his
   *  hands will meet it, on down to the floor and its bounces */
  P.settleCarom = function (pr) {
    const b = this.v.ball, a = pr.actor, T = TG();
    if (this.pendingRebound !== pr || !a || b.holder || b.segs !== pr.segs) return;
    const segs = b.segs, sC = segs[pr.ci];
    // (already on its way off: left as it is)
    if (b.segI > pr.ci || (b.segI === pr.ci && b.time > sC.t0 + 1e-6)) return;
    const C = sC.p0, H = a.H;
    // (off the rim or the glass, where it goes is measured from the rim; off a blocker's hand, from the hand, the way the swat
    // goes)
    const blk = !!pr.blocked, rim = blk ? { x: C[0], y: C[1] } : this.rim;
    // (the speed the shot came in with: a rattle's hops on the rim come in slower, but the ball can pop off it)
    const s0 = segs[0], vIn = s0 && !s0.roll ? b._segVel(s0, s0.t1, TMP) : [0, 0, -15];
    const sIn = Math.max(12, Math.hypot(vIn[0], vIn[1], vIn[2]) || 15);
    // (the way it was going to go, and the natural distance for a shot from where this one came: off a block, the way the swat
    // goes and as far as it was going to)
    const a0 = blk && pr.swat != null ? pr.swat : Math.atan2(pr.y - rim.y, pr.x - rim.x);
    const d0 = blk ? U.clamp(Math.hypot(pr.x - rim.x, pr.y - rim.y), 3, 16) : this.caromMean(pr.shotD != null ? pr.shotD : 15);
    // (where he will be as he reads it: boxing out or crashing, going on the way he is going)
    const lead = Math.max(0, pr.tContactT - this.T) + T.readS;
    const ax = a.x + (a.vx || 0) * lead, ay = a.y + (a.vy || 0) * lead;
    const opp = a.team === this.off ? this.defActors() : this.offActors();
    const clip = M.Anims.get('rebound'), gEv = clip.events.grab, kf = (clip.ballKeys ? clip.ballKeys[1](gEv) : 0.08) * H;
    const NA = 15, ND = 11, cone = (blk ? T.blockConeDeg : T.coneDeg) * U.DEG, spMax = blk ? T.blockSpeedK : T.caromSpeedK[1];
    let best = null;
    for (let i = 0; i < NA; i++) {
      const ang = a0 + (i / (NA - 1) * 2 - 1) * cone;
      for (let j = 0; j < ND; j++) {
        const dist = U.clamp(d0 * Math.pow(T.distK, j / (ND - 1) * 2 - 1), 2.2, 18);
        const x = rim.x + Math.cos(ang) * dist, y = rim.y + Math.sin(ang) * dist;
        if ((x - this.rim.x) * this.dir > 0.6 || x < 1 || x > 93 || y < 1 || y > 49) continue;
        let near = !!pr.ev.off;
        for (const o of opp) if (Math.hypot(o.x - x, o.y - y) < T.contestFt) { near = true; break; }
        const style = dist >= T.longFt ? 'long' : near && dist < T.highFt ? 'high' : 'mid';
        const tz = this.takeZ(a, style);
        // (his spot: the take a little in front of him, facing where it comes from)
        const f = Math.atan2(this.rim.y - y, this.rim.x - x), kw = style === 'long' ? 0.3 * H : kf;
        const jx = x - Math.cos(f) * kw, jy = y - Math.sin(f) * kw;
        const dRun = Math.hypot(jx - ax, jy - ay), trav = style === 'long' ? 0 : Math.min(T.travelFt, dRun);
        const need = T.readS + this.runTime(a, dRun - trav, (jx - ax) / (dRun || 1), (jy - ay) / (dRun || 1)) + (style === 'long' ? T.catchLeadS : gEv);
        const tMin = T.caromT[0] + T.caromT[1] * dist, tMax = T.caromT[2] + T.caromT[3] * dist;
        const tC = Math.max(tMin, need);
        if (tC > tMax) continue;
        const v0 = M.Ball.aim(C, [x, y, tz], tC), sp = Math.hypot(v0[0], v0[1], v0[2]);
        if (sp > spMax * sIn || sp < T.caromSpeedK[0] * sIn || (v0[2] > 0 && v0[2] * v0[2] / (2 * G) > T.caromUpFt)) continue;
        const score = Math.abs(ang - a0) / cone + Math.abs(Math.log(dist / d0)) / Math.log(T.distK) + 0.3 * tC;
        if (!best || score < best.score) best = { x, y, tz, style, tC, f, jx, jy, v0, score };
      }
    }
    if (!best) {
      // (nowhere he can get to it in the air: of the natural caroms down to the floor, a small pop off the rim, Tune.glass.popFtps
      // up, and down d0 away, the one that comes down nearest him, and he runs it down)
      const tL = (T.popFtps + Math.sqrt(T.popFtps * T.popFtps + 2 * G * Math.max(0, C[2] - R))) / G;
      for (let i = 0; i < NA; i++) {
        const ang = a0 + (i / (NA - 1) * 2 - 1) * cone, x = rim.x + Math.cos(ang) * d0, y = rim.y + Math.sin(ang) * d0;
        if ((x - this.rim.x) * this.dir > 0.6 || x < 1 || x > 93 || y < 1 || y > 49) continue;
        const dd = Math.hypot(x - ax, y - ay);
        if (!best || dd < best.dd) best = { x, y, tz: R, style: 'floor', tC: tL, f: 0, jx: x, jy: y, v0: M.Ball.aim(C, [x, y, R], tL), dd };
      }
      if (!best) { const x = rim.x + Math.cos(a0) * d0, y = rim.y + Math.sin(a0) * d0; best = { x, y, tz: R, style: 'floor', tC: tL, f: 0, jx: x, jy: y, v0: M.Ball.aim(C, [x, y, R], tL) }; }
    }
    // the carom from the contact: through the take, on down to the floor, then its bounces
    const vz = best.v0[2], tF = (vz + Math.sqrt(vz * vz + 2 * G * Math.max(0, C[2] - R))) / G;
    const s1 = M.Ball.seg(sC.t0, C, best.v0, Math.max(0.05, tF));
    s1.rim = sC.rim; s1.board = sC.board; s1.soft = sC.soft; s1.w = sC.w;
    segs.length = pr.ci;
    segs.push(s1);
    b._bounceTail(segs);
    pr.x = best.x; pr.y = best.y; pr.z = best.tz; pr.style = best.style; pr.floor = best.style === 'floor';
    // (for the debug tools: how it was settled)
    b.caromPlan = { style: best.style, tC: +best.tC.toFixed(3), dRun: +Math.hypot(best.jx - ax, best.jy - ay).toFixed(2), d0: +d0.toFixed(2), dist: +Math.hypot(best.x - rim.x, best.y - rim.y).toFixed(2), actor: a.id };
    pr.f = best.f; pr.jx = best.jx; pr.jy = best.jy;
    pr.tGrabT = pr.tContactT + best.tC;
    pr.jumpH = best.style === 'high' || best.style === 'mid' ? this.jumpFor(a, best.style) : null;
    if (this.pendingRebound.tGrab != null) this.pendingRebound.tGrab = sC.t0 + best.tC;
  };

  /** a reaction after it comes off: the players near it go after it, and the rebounder runs to his spot and goes up for it
   *  (or runs to a long one and catches it on the way down, or runs down one that will bounce) */
  P.readCarom = function (pr) {
    if (this.pendingRebound !== pr) return;
    pr.readT = this.T;
    const a = pr.actor, b = this.v.ball, T = TG();
    if (!a || b.holder) return;
    this.chaseCarom(pr);
    const lock = (dur) => { if (a.team === this.off) this.lockOff(a, dur); else this.lockDef(a, dur); };
    lock(Math.max(0.5, pr.tGrabT - this.T) + 1.5);
    a.lookAt(b, { hold: Math.max(0.2, pr.tGrabT - this.T) });
    if (pr.style === 'floor') { pr.floor = true; return; }
    const rimA = () => Math.atan2(this.rim.y - a.y, this.rim.x - a.x);
    // (running to his spot facing the way he runs, then turned to where it comes from for the last steps)
    const face = (me) => (Math.hypot(pr.jx - me.x, pr.jy - me.y) > 3 && me.speed > 3 ? Math.atan2(me.vy, me.vx) : rimA());
    if (pr.style === 'long') {
      a.moveTo(pr.jx, pr.jy, { by: pr.tGrabT - T.catchLeadS, speed: a.maxSpeed, stance: 'ready', face });
      const cev = M.Anims.get('catch').events.catch;
      this.at(Math.max(this.T, pr.tGrabT - cev), () => { if (this.pendingRebound === pr && !b.holder && !a.isBusy()) a.play('catch', { mirror: false }); }, 'long rebound catch');
      a.reachFor(b, pr.tGrabT - T.reachEarlyS);
      this.takeWatch(pr);
      return;
    }
    const clip = M.Anims.get('rebound'), gEv = clip.events.grab, start = pr.tGrabT - gEv;
    a.moveTo(pr.jx, pr.jy, { by: start - 0.02, speed: a.maxSpeed, stance: 'ready', face });
    this.at(Math.max(this.T, start), () => {
      if (this.pendingRebound !== pr || b.holder) return;
      // (up from where he is: a running jump over what is left to his spot, as far as a jump carries him)
      const dx = pr.jx - a.x, dy = pr.jy - a.y, dl = Math.hypot(dx, dy);
      const ox = dl > T.travelFt ? a.x + dx / dl * T.travelFt : pr.jx, oy = dl > T.travelFt ? a.y + dy / dl * T.travelFt : pr.jy;
      const j = clip.jump;
      a.stopClip(0);
      a.play('rebound', { x: ox, y: oy, facing: pr.f, mirror: false, fadeIn: 0.06, jumpH: pr.jumpH, travel: dl > 0.05 ? { ta: Math.max(0, j.t0 - T.pushS), t0: j.t0, tg: gEv, t1: j.t1 } : null, blendT: 0.2 });
      a.reachFor(b, pr.tGrabT - T.reachEarlyS);
    }, 'rebound jump');
    this.takeWatch(pr);
  };
  /** his hands at the ball: taken as both palms are on it (Tune.glass.takeGapIn), from just before it gets to his spot; up to
   *  takeLateS late, then it goes on down on its own and he runs it down */
  P.takeWatch = function (pr) {
    const b = this.v.ball, T = TG(), a = pr.actor;
    const tick = () => {
      if (this.pendingRebound !== pr || b.holder || pr.grabbed || pr.style === 'floor') return;
      if (this.handsOn(a, b, T.takeGapIn)) { b.give(a, 'chest', { absorb: true }); pr.grabbed = true; return; }
      if (this.T > pr.tGrabT + T.takeLateS) { this.dropCarom(pr); return; }
      this.at(this.T + 1 / 60, tick, 'take');
    };
    this.at(Math.max(this.T, pr.tGrabT - 0.12), tick, 'take');
  };
  /** both of a's palms within gapIn (in) of the ball's surface (the hands and the ball as the last step left them) */
  P.handsOn = function (a, b, gapIn) {
    const Pj = a.sk.P, J = M.Rig.J, pal = M.Tune.debug.palmOffsetH * a.H, lim = gapIn / 12;
    for (const j of [J.L_HD, J.R_HD]) { const k = j * 3; if (Math.hypot(Pj[k] - b.x, Pj[k + 1] - b.y, Pj[k + 2] - b.z) - R - pal > lim) return false; }
    return true;
  };
  /** not in his hands: it goes on down on its own flight and bounces (nothing is changed about it), and he runs it down */
  P.dropCarom = function (pr) {
    pr.style = 'floor'; pr.floor = true;
    const a = pr.actor;
    if (a) { a._reach = null; pr.tGrabT = Math.max(pr.tGrabT || 0, this.T + 0.2); }
  };
  /** where `a` running at his top speed first meets the loose or bouncing ball within his hands' reach: the soonest point
   *  on its way (in steps of 0.05 s, 3 s on at most) low enough for him to take (Tune.glass) that he can get to by then;
   *  none, where it is 3 s on */
  P.interceptPt = function (a, out) {
    const b = this.v.ball, T = TG(), zMax = T.longTakeH * a.H * 1.25, reach = T.catchReachFt;
    for (let t = 0.05; t <= 3; t += 0.05) {
      const p = b.posAt(b.time + t, out);
      if (p[2] > zMax) continue;
      const d = Math.hypot(p[0] - a.x, p[1] - a.y);
      if (d - reach <= this.runReach(a, t, p[0], p[1])) return p;
    }
    return b.posAt(b.time + 3, out);
  };
  /** how long a run of d ft the way (ux, uy) takes him to be there and stopped: runStartS to get going, braking what he has
   *  going the other way (and sideways), up toward Tune.glass.runK of his top speed and down to a stop at the steering's own
   *  arrival rate (Actor._steer: brakeK of his braking; planned with a margin, Tune.glass.gatherBrakeK); too fast to stop in
   *  it, on past and back (noOver: not to be had). rel: { vx, vy, V } his speed and his top speed as seen from something
   *  moving (a run onto a point that moves) */
  P.arriveTime = function (a, d, ux, uy, rel, noOver, brakeK) {
    const T = TG();
    const V = rel ? rel.V : (a.maxSpeed || 22) * T.runK, A = (a.accel || 20) * 0.9, Ab = (a.decel || A * 1.35) * (brakeK || T.gatherBrakeK);
    const vx = rel ? rel.vx : a.vx || 0, vy = rel ? rel.vy : a.vy || 0, v0 = vx * ux + vy * uy, vs = U.clamp(v0, 0, V);
    let t = T.runStartS, dd = d;
    if (v0 < 0) { t += -v0 / Ab; dd += v0 * v0 / (2 * Ab); }
    const dStop = vs * vs / (2 * Ab);
    if (noOver && dStop > dd + 0.3) return Infinity;
    if (dStop >= dd) t += vs / Ab + 2 * Math.sqrt((dStop - dd) / A);
    else {
      const dA = (V * V - vs * vs) / (2 * A), dB = V * V / (2 * Ab);
      if (dA + dB <= dd) t += (V - vs) / A + V / Ab + (dd - dA - dB) / V;
      else { const vp = Math.sqrt((dd + vs * vs / (2 * A)) / (1 / (2 * A) + 1 / (2 * Ab))); t += (vp - vs) / A + vp / Ab; }
    }
    return Math.max(t, Math.abs(vy * ux - vx * uy) / Ab);
  };
  /** where and when he takes the loose or bouncing ball: the soonest moment on its way (steps of 0.05 s, 3 s on at most)
   *  that it is at a height his hands take it at (caught with both hands from Tune.glass.gatherCatchLoH of his height up to
   *  chest height, or picked up off the floor below gatherPickHiH), going along the floor no faster than he takes it at
   *  (gatherCatchFtps, gatherPickFtps), and he can be a reach short of it by then (the move's own ball, in front of him),
   *  going with it: the spot he takes it from, and a point that moves with the ball and gets there at the take, which he
   *  runs onto (pursuit and arrival, Reynolds' steering behaviours, as seen from the ball going away from him; one coming
   *  at him he waits for); null: none */
  P.gatherPlan = function (a) {
    const b = this.v.ball, T = TG(), H = a.H;
    const cc = M.Anims.get('catch'), cev = cc.events.catch, cK = (cc.ballKeys ? cc.ballKeys[1](cev) : 0.3) * H;
    const pc = M.Anims.get('pickup'), g = pc.events.grab, pK = (pc.ballKeys ? pc.ballKeys[1](g) : 0.3) * H;
    const zHi = T.longTakeH * H * 1.25, zLo = T.gatherCatchLoH * H, zPick = T.gatherPickHiH * H;
    const V0 = (a.maxSpeed || 22) * T.runK;
    // (in a move of his own, he is after it once it is over)
    const busy = a.isBusy() ? Math.max(0, (a.clip.clip.dur - a.clip.t) / (a.clip.speed || 1)) : 0;
    for (let t = 0.05; t <= 3 + 1e-9; t += 0.05) {
      const p = b.posAt(b.time + t, TMP), px = p[0], py = p[1], pz = p[2];
      const kind = pz >= zLo && pz <= zHi ? 'catch' : pz <= zPick ? 'pick' : null;
      if (!kind) continue;
      const k = kind === 'catch' ? cK : pK, lead = kind === 'catch' ? cev : g;
      if (t < lead) continue;
      const dx = px - a.x, dy = py - a.y, dl = Math.hypot(dx, dy);
      const ux = dl > 1e-3 ? dx / dl : Math.cos(a.facing), uy = dl > 1e-3 ? dy / dl : Math.sin(a.facing);
      // (its speed along the floor then: no faster than he takes it at; caught, he goes with it away from him and across,
      // and waits for it coming at him; picked up, he is stopped on the spot as it gets there)
      const q = b.posAt(b.time + t + 0.03, TMP2);
      let vbx = (q[0] - px) / 0.03, vby = (q[1] - py) / 0.03;
      if (Math.hypot(vbx, vby) > (kind === 'pick' ? T.gatherPickFtps : T.gatherCatchFtps)) continue;
      const along = vbx * ux + vby * uy;
      if (kind === 'pick') { vbx = 0; vby = 0; } else if (along < 0) { vbx -= ux * along; vby -= uy * along; }
      const vb = Math.hypot(vbx, vby);
      let sx = px - ux * k, sy = py - uy * k, fx = ux, fy = uy, need;
      // (picked up off a ball rolling on along the floor: cut off, from beside its way ahead of it on his side, facing across
      // it as it comes to his hands; from behind it he would have to be there after it has gone through his spot and before
      // it is out of his reach)
      const rx = q[0] - px, ry = q[1] - py, rl = Math.hypot(rx, ry);
      if (kind === 'pick' && rl > T.gatherCutFtps * 0.03) {
        let nx = -ry / rl, ny = rx / rl;
        if (nx * (a.x - px) + ny * (a.y - py) < 0) { nx = -nx; ny = -ny; }
        sx = px + nx * k; sy = py + ny * k; fx = -nx; fy = -ny;
        const dc = Math.hypot(sx - a.x, sy - a.y);
        need = busy + this.arriveTime(a, dc, dc > 1e-3 ? (sx - a.x) / dc : fx, dc > 1e-3 ? (sy - a.y) / dc : fy, null, true);
      } else {
        const qx = sx - vbx * t, qy = sy - vby * t;
        const dq = Math.hypot(qx - a.x, qy - a.y), wx = dq > 1e-3 ? (qx - a.x) / dq : ux, wy = dq > 1e-3 ? (qy - a.y) / dq : uy;
        need = busy + this.arriveTime(a, dq, wx, wy, { vx: (a.vx || 0) - vbx, vy: (a.vy || 0) - vby, V: Math.max(3, V0 - vb) }, true);
      }
      if (kind === 'pick') need += lead * T.gatherPickStopK + T.gatherEarlyS;
      if (need > t) continue;
      return { t: this.T + t, x: px, y: py, z: pz, kind, lead, sx, sy, vbx, vby, f: Math.atan2(fy, fx), segs: b.segs };
    }
    return null;
  };
  /** after the loose or bouncing ball: he runs to where he takes it (gatherPlan) onto the point that goes with it there, and
   *  catches it with both hands or bends down and picks it up off the floor, the hands onto it (reachFor); it is his as they
   *  get there (Tune.glass.takeGapIn). A plan holds while he can make it (gatherSlackS) and the ball's way is the same;
   *  otherwise a new one (none within 3 s: after it at full speed to where it will be a second on). Called on every tick of
   *  a chase; true once it is his.
   *  (He used to run to the ball's own point at full speed, through it, and the catch's hands were 2-4 ft off it) */
  P.runDown = function (a, pk) {
    const b = this.v.ball, T = TG();
    if (pk.t != null) {
      if (this.T >= pk.t - 0.1 && this.handsOn(a, b, T.takeGapIn * (pk.low ? 2 : 1))) {
        this.giveBall(a, 'chest', { absorb: true });
        // (the run onto it ends with it: on a step or two and stopped)
        if (!a.isBusy() && a.goal.mode === 'track') a.moveTo(a.x + (a.vx || 0) * 0.25, a.y + (a.vy || 0) * 0.25, { speed: Math.max(2, a.speed || 0), face: a.facing });
        return true;
      }
      if (this.T <= pk.t + T.gatherLateS && b.segs === pk.segs) return false;
      pk.t = null; pk.plan = null; a._reach = null;
    }
    let pl = pk.plan;
    if (pl && (pl.segs !== b.segs || this.T > pl.t)) pl = null;
    if (pl) {
      const left = pl.t - this.T, qx = pl.sx - pl.vbx * left, qy = pl.sy - pl.vby * left, dq = Math.hypot(qx - a.x, qy - a.y);
      const V = Math.max(3, (a.maxSpeed || 22) * T.runK - Math.hypot(pl.vbx, pl.vby));
      if (dq > 0.3 && this.arriveTime(a, dq, (qx - a.x) / dq, (qy - a.y) / dq, { vx: (a.vx || 0) - pl.vbx, vy: (a.vy || 0) - pl.vby, V }, false, 0.8) > left + T.gatherSlackS + (pl.kind === 'pick' ? 0 : pl.lead)) pl = null;
    }
    if (!pl) pl = pk.plan = this.gatherPlan(a);
    if (!pl) {
      // (none to be had yet, too fast along the floor or out of reach: after it and on it a reach behind it, going with it,
      // until it can be had)
      if (!a.isBusy()) {
        const k = 0.3 * a.H;
        a.track(() => {
          const p = b.posAt(b.time, TMP), q = b.posAt(b.time + 0.05, TMP2), vx = (q[0] - p[0]) / 0.05, vy = (q[1] - p[1]) / 0.05;
          const dx = p[0] - a.x, dy = p[1] - a.y, dl = Math.hypot(dx, dy) || 1, lead = U.clamp(dl / Math.max(4, a.maxSpeed || 20), 0, 1);
          return { x: U.clamp(p[0] + vx * lead - dx / dl * k, -4, 98), y: U.clamp(p[1] + vy * lead - dy / dl * k, -4, 54), vx, vy };
        }, { speed: a.maxSpeed, face: 'move', stance: 'ready' });
      }
      return false;
    }
    if (!a.isBusy()) {
      const face = (me) => { const d = Math.hypot(pl.sx - me.x, pl.sy - me.y); return d > 3 && me.speed > 4 ? Math.atan2(me.vy, me.vx) : pl.f; };
      // (onto the point that goes with the ball and gets to his spot at the take: its speed is his as he gets there; still, to
      // his spot, paced to be there and stopped by then)
      if (Math.hypot(pl.vbx, pl.vby) > 0.5) a.track(() => { const left = Math.max(0, pl.t - this.T), on = left > 0 ? 1 : 0; return { x: pl.sx - pl.vbx * left, y: pl.sy - pl.vby * left, vx: pl.vbx * on, vy: pl.vby * on }; }, { speed: a.maxSpeed, face, stance: 'ready' });
      else a.moveTo(pl.sx, pl.sy, { speed: a.maxSpeed, face, stance: 'ready', arrive: true, brakeK: T.gatherStopK });
    }
    // (the move, its catch or its grab at the take)
    if (this.T >= pl.t - pl.lead - 1e-3) {
      if (pl.kind === 'pick' && a.isBusy()) { pk.plan = null; return false; }
      if (pl.kind === 'catch') { if (!a.upper && !a.isBusy()) a.play('catch', { mirror: false }); a.reachFor(b, pl.t); pk.low = false; }
      else { a.play('pickup', { x: pl.sx, y: pl.sy, facing: pl.f, mirror: false, blendT: pl.lead }); a.reachFor(b, pl.t, { until: pl.t + 0.3 }); pk.low = true; }
      pk.t = pl.t; pk.segs = b.segs;
    }
    return false;
  };
  /** the old name (callers from before runDown) */
  P.pickUp = function (a, pk) { return this.runDown(a, pk); };

  /** the rebound beat waits until the ball is in his hands: taken in the air, caught on the run, or picked up off the
   *  floor after he runs it down (the ball never goes to him from where it is) */
  P.p_rebound = function (ev, beat, gap) {
    const pr = this.pendingRebound && this.pendingRebound.ev === ev ? this.pendingRebound : null;
    const a = ev.player != null ? this.A(ev.player) : null;
    if (!pr || !a || pr.tGrabT == null) return base.p_rebound.call(this, ev, beat, gap);
    const b = this.v.ball;
    const lock = (dur) => { if (a.team === this.off) this.lockOff(a, dur); else this.lockDef(a, dur); };
    const pk = {};
    const chase = () => {
      if (this.pendingRebound !== pr || b.holder || beat.fired) return;
      // (a ball whose flight ended in the air never floats there: it falls)
      if (b.state !== 'flight' && b.state !== 'loose' && b.z > R + 0.3 && !pr.grabbed) { b.loose([0, 0, 0]); pr.style = 'floor'; pr.floor = true; }
      if (pr.style === 'floor' && this.T >= (pr.tContactT || 0) + TG().readS) {
        lock(0.4); // (chasing it: nothing else moves him meanwhile)
        if (this.runDown(a, pk)) return;
      }
      this.at(this.T + (pk.t != null ? 1 / 60 : 0.05), chase, 'chase the ball');
    };
    this.at(Math.max(this.T + 0.05, (pr.tContactT || this.T) + TG().readS), chase, 'chase the ball');
    beat.onFire = () => this.secureRebound(ev, a);
    // (in his hands; the engine's clock still sets the earliest moment, and the beat loop's own 3 s limit the latest)
    beat.waitFor = () => !!b.holder || this.T > pr.tGrabT + 4;
    return Math.max(0.05, pr.tGrabT - this.T);
  };
})();
