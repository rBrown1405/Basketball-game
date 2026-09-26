/* Pro BBALL Coach — match view: animated person (PBC.Match.Actor).
 * Steering (accel-limited, timed arrivals) -> body facing -> locomotion with a foot controller
 * (gait-phase stepping with predicted landings so feet never skate, heel-rise, stance stepping)
 * -> pose layering (stance, gait curves, upper-body overlays, full-body clips, look-at) -> IK. */
(function () {
  'use strict';
  const M = window.PBC.Match, U = M.U, RG = M.Rig, A = M.Anims, CH = RG.CH;
  const PL = M.Poses.lib;
  const BALL_R = 0.39;
  const D = U.DEG;

  let _uid = 1;

  class Foot {
    constructor(side) {
      this.side = side; // 0 left, 1 right
      this.x = 0; this.y = 0; this.yaw = 0; this.pitch = 0;
      this.state = 'plant'; // plant | swing | air
      this.ax = 0; this.ay = 0; this.az = 0; // current ankle target
      this.s = 0; this.dur = 0.25; this.h = 0.1; this.mode = 'step';
      this.x0 = 0; this.y0 = 0; this.z0 = 0; this.yaw0 = 0; this.p0 = 0;
      this.tx = 0; this.ty = 0; this.tyaw = 0; // landing ball-of-foot target
      this.planted = true;
    }
  }

  class ClipState {
    constructor(clip, o) {
      this.clip = clip; this.t = o.t0 || 0; this.speed = o.speed || 1;
      this.w = o.fadeIn === 0 ? 1 : 0; this.fadeIn = o.fadeIn == null ? 0.12 : o.fadeIn; this.fadeOut = o.fadeOut == null ? 0.18 : o.fadeOut;
      this.mirror = !!o.mirror;
      this.ox = o.x; this.oy = o.y; this.ofacing = o.facing;
      this.offX = 0; this.offY = 0; this.blendT = o.blendT == null ? 0.35 : o.blendT;
      this.onEvent = o.onEvent || null; this.fired = {};
      this.done = false; this.ending = false;
      this.hold = o.hold == null ? null : o.hold; // freeze at this clip time (GIM)
      this.jumpH = o.jumpH || null; // override jump height (ft)
      this.noHang = !!o.noHang;
      this.lastT = this.t;
      this.data = o.data || null;
      // reaching for a spot in the world (the rim): { x, y, z, t0, t1 } eases the held ball there over the rise;
      // { hx, hy, hz, h0, h1, hands } holds the hand(s) on it (a dunker's grip on the rim)
      this.reach = o.reach || null;
    }
  }

  // torso, neck and head channels (and the pose's hip shift) smoothed by inertialization
  const TORSO_INERT = ['rootX', 'rootY', 'pelPitch', 'pelRoll', 'pelTwist', 'spFlex', 'spLat', 'spTwist', 'chFlex', 'chLat', 'chTwist',
    'nkFlex', 'nkLat', 'nkTwist', 'hdFlex', 'hdLat', 'hdTwist'].map(k => RG.CH[k]);
  // (with the arms' authored channels: stance, clip and overlay poses never flip Euler branches, so smoothing them in
  // angle space is safe; the arms' IK is smoothed on its inputs, see _armTargets)
  const POSE_INERT = TORSO_INERT.concat(['ClvE', 'ClvP', 'ShF', 'ShA', 'ShT', 'ElF', 'Pro', 'WrF', 'WrD', 'Fing'].reduce((a, k) => a.concat([RG.CH['l' + k], RG.CH['r' + k]]), []));
  const POSE_INERT_LIN = { [RG.CH.rootX]: 0.02, [RG.CH.rootY]: 0.02, [RG.CH.lClvE]: 0.3, [RG.CH.rClvE]: 0.3, [RG.CH.lClvP]: 0.3, [RG.CH.rClvP]: 0.3, [RG.CH.lFing]: 0.3, [RG.CH.rFing]: 0.3 };
  const POSE_INERT_ARM = new Set(['ShF', 'ShA', 'ShT', 'ElF', 'Pro', 'WrF', 'WrD'].reduce((a, k) => a.concat([RG.CH['l' + k], RG.CH['r' + k]]), []));
  const GAIT_SMOOTH = ['beta', 'lift', 'reach', 'halfW', 'liftPow', 'drop', 'toePitch', 'heelOff', 'landPitch', 'roll'];
  const IDLE_SHIFT = { stand: 1, ready: 1, handsHips: 1, handsKnees: 0.5, holdChest: 1, triple: 0.6, refStand: 1 };

  class Actor {
    constructor(view, look, team, kind) {
      this.uid = _uid++;
      this.view = view;
      this.look = look || {};
      this.id = this.look.id != null ? this.look.id : 'a' + this.uid;
      this.team = team;
      this.kind = kind || 'player';
      this.dims = RG.makeDims(this.look);
      this.H = this.dims.H;
      this.sk = new RG.Skeleton(this.dims);
      const teamLook = view && view.teamLook ? view.teamLook(team) : null;
      this.style = M.Figure.makeStyle(this.look, teamLook, this.kind);
      this.lefty = this.look.hand === 'L';
      const r = (k, d) => U.clamp(((this.look[k] == null ? d : this.look[k]) - 25) / 74, 0, 1);
      this.rSpeed = r('speed', 70); this.rAgi = r('agility', 70); this.rVert = r('vert', 65);
      this.maxSpeed = this.kind === 'ref' ? 16 : 19 + this.rSpeed * 7;
      this.accel = this.kind === 'ref' ? 12 : 14 + this.rAgi * 7;
      this.decel = this.accel * 1.5;
      // state
      this.x = 47; this.y = 25; this.vx = 0; this.vy = 0; this.facing = 0; this.speed = 0;
      this.ax = 0; this.ay = 0;
      this.goal = { mode: 'idle', x: 47, y: 25, by: 0, speed: 0, face: null, arrive: true, track: null };
      this.faceMode = 'move';
      this.faceAngle = 0;
      this.stance = 'stand';
      this.stanceTarget = 'stand';
      this.stanceBlend = 1;
      this.prevStancePose = new Float32Array(RG.NCH);
      this.prevStance = 'stand';
      // stance settings blended with the stance crossfade (a stance switch used to swap the arm swing, torso
      // motion and step width in a single frame)
      this.stP = { gaitArms: 1, gaitTorso: 1, slide: 0, def: 0, idle: 1 };
      this.prevStP = { gaitArms: 1, gaitTorso: 1, slide: 0, def: 0, idle: 1 };
      this._inTorso = new RG.Inert(POSE_INERT, POSE_INERT.map(i => (POSE_INERT_LIN[i] != null ? 0 : 1)), POSE_INERT.map(i => (POSE_INERT_LIN[i] != null ? POSE_INERT_LIN[i] : POSE_INERT_ARM.has(i) ? 0.165 : 0.12)), 0.07);
      // arm IK inputs, smoothed: weight, target (body frame) and elbow pole
      this._armS = [0, 1].map(() => ({ w: 0, t: new RG.Inert([0, 1, 2], [0, 0, 0], [0.2, 0.2, 0.2], 0.07), v: new Float64Array(3), pole: null, lx: 0, ly: 0, lz: 0, has: false }));
      this._inT = null;
      this.phase = 0; this.gaitOn = false; this.gaitK = 0;
      this.gp = {};
      this.moveDirX = 1; this.moveDirY = 0;
      this.feet = [new Foot(0), new Foot(1)];
      this.lastStep = 1;
      this.clip = null;
      this.upper = null; // upper-body overlay clip state
      this.over = null; // procedural overlay: {type:'dribble'|'hands'|..., ...}
      this.look_ = null; // look-at target {x,y,z}
      this.pose = new Float32Array(RG.NCH);
      this.tmpPose = new Float32Array(RG.NCH);
      this.clipPose = new Float32Array(RG.NCH);
      this.time = 0;
      this.breath = Math.random() * 10;
      this.hidden = false;
      this.alpha = 1;
      this.lean = 0; this.leanF = 0;
      this.hasBall = false;
      this.ballHold = null; // 'chest' | 'triple' | 'over' | 'pocket' | null
      this.dribble = null; // set by ball controller: {hand:0|1, u (0..1 phase), top:[x,y,z]}
      this.handTarget = [null, null]; // explicit hand IK targets {x,y,z,w}
      this.tag = null;
      this.airZ = 0;
      this.jumpZ = 0;
      this.onGround = true;
      this.fall = 0; // 0..1 knocked down (charge)
    }

    // ============================================================ commands
    place(x, y, facing) {
      this.x = x; this.y = y; this.vx = 0; this.vy = 0; this.speed = 0;
      if (facing != null) { this.facing = facing; this.faceAngle = facing; }
      this.goal.mode = 'idle'; this.goal.x = x; this.goal.y = y;
      this.gaitOn = false; this.gaitK = 0;
      this.resetFeet();
      this._inT = null;
    }
    resetFeet() {
      const st = A.STANCE[this.stance] || A.STANCE.stand;
      for (const f of this.feet) {
        const o = f.side ? st.R : st.L;
        const c = Math.cos(this.facing), s = Math.sin(this.facing);
        const rx = s, ry = -c;
        f.x = this.x + rx * o[0] * this.H + c * o[1] * this.H;
        f.y = this.y + ry * o[0] * this.H + s * o[1] * this.H;
        f.yaw = this.facing + (f.side ? -1 : 1) * st.yaw * D;
        f.pitch = 0; f.state = 'plant'; f.planted = true;
      }
    }
    /** move to (x,y). o: {by (abs time), speed (cap), face ('move'|angle|{x,y}), stance, arrive(bool)} */
    moveTo(x, y, o) {
      o = o || {};
      const g = this.goal;
      g.mode = 'move'; g.x = x; g.y = y;
      g.by = o.by == null ? null : o.by;
      g.speed = o.speed || this.maxSpeed * 0.85;
      g.arrive = o.arrive !== false;
      g.track = null;
      // timed moves: never slower than this natural pace (walk there and wait instead of creeping in slow motion)
      g.pace = o.pace || 0;
      if (o.face !== undefined) this.setFace(o.face);
      if (o.stance) this.setStance(o.stance);
      return this;
    }
    /** follow a target function returning {x,y,vx,vy} each update */
    track(fn, o) {
      o = o || {};
      const g = this.goal;
      g.mode = 'track'; g.track = fn; g.speed = o.speed || this.maxSpeed; g.arrive = true; g.by = null; g.pace = 0;
      if (o.face !== undefined) this.setFace(o.face);
      if (o.stance) this.setStance(o.stance);
      return this;
    }
    stop(face) {
      this.goal.mode = 'idle';
      if (face !== undefined) this.setFace(face);
      return this;
    }
    setFace(f) {
      this.faceLock = false;
      if (f == null || f === 'move') { this.faceMode = 'move'; return; }
      if (typeof f === 'number') { this.faceMode = 'angle'; this.faceAngle = f; return; }
      if (typeof f === 'function') { this.faceMode = 'fn'; this.faceFn = f; return; }
      this.faceMode = 'point'; this.facePoint = f;
    }
    setStance(name) {
      if (!A.STANCE[name] || name === this.stanceTarget) return;
      const cur = this._stancePose(this.stance);
      if (this.stanceBlend < 1) {
        const w = U.smooth(this.stanceBlend);
        for (let i = 0; i < RG.NCH; i++) this.prevStancePose[i] += (cur[i] - this.prevStancePose[i]) * w;
      } else this.prevStancePose.set(cur);
      this._stanceParams();
      Object.assign(this.prevStP, this.stP);
      this.prevStance = this.stance;
      this.stanceTarget = name; this.stance = name; this.stanceBlend = 0;
      this._stanceParams();
    }
    lookAt(p) { this.look_ = p; }

    /**
     * play a clip. o: {x,y,facing (origin; default current), mirror, speed, onEvent(name, actor), hold, fadeIn, fadeOut, jumpH, data}
     */
    play(name, o) {
      const clip = typeof name === 'string' ? A.get(name) : name;
      if (!clip) return null;
      o = Object.assign({}, o || {});
      if (o.mirror == null) o.mirror = this.lefty && clip.handed !== false;
      const cs = new ClipState(clip, Object.assign({ x: this.x, y: this.y, facing: this.facing }, o));
      cs.v0x = this.vx; cs.v0y = this.vy;
      if (clip.mask === 'full') {
        cs.offX = this.x - cs.ox; cs.offY = this.y - cs.oy;
        // make the offset relative to the clip's root at t0
        const r0 = this._clipRoot(cs, cs.t);
        cs.offX = this.x - r0.x; cs.offY = this.y - r0.y;
        // large corrections are spread over more time (less skating)
        const off = Math.hypot(cs.offX, cs.offY);
        if (off > 1.5 && o.blendT == null) cs.blendT = Math.max(cs.blendT, Math.min(0.9, off / 7));
        this.clip = cs;
        this.vx *= 0.3; this.vy *= 0.3;
        this.goal.mode = 'idle';
        this._clipFeetStart(cs);
      } else {
        this.upper = cs;
      }
      return cs;
    }
    stopClip(fade) {
      if (this.clip) { this.clip.ending = true; if (fade === 0) this._endClip(); }
    }
    isBusy() { return !!(this.clip && !this.clip.done); }
    /**
     * Square the upper body to a point for a moment (a pass: the chest and arms go at the receiver while the feet
     * turn the rest of the way): the trunk twists up to ~70 deg, easing in over ~0.15 s and out after `until`.
     */
    aimAt(pt, until) {
      if (!pt) { if (this.aim_) this.aim_.until = 0; return; }
      const w = this.aim_ && this.aim_.w > 0 ? this.aim_.w : 0;
      this.aim_ = { x: pt.x, y: pt.y, until, w };
    }

    // ============================================================ update
    update(dt, now) {
      this.time = now;
      if (this.clip) this._updateClip(dt);
      if (this.upper) this._updateUpper(dt);
      if (!this.clip) {
        this._steer(dt);
        this._turn(dt);
        this._locomote(dt);
      }
      if (this.stanceBlend < 1) this.stanceBlend = Math.min(1, this.stanceBlend + dt / 0.28);
      if (this.aim_) {
        const a = this.aim_;
        a.w = this.time < a.until ? Math.min(1, a.w + dt / 0.15) : a.w - dt / 0.25;
        if (a.w <= 0) this.aim_ = null;
      }
      this._stanceParams();
      for (const f of this.feet) if (f.land) this._settleLanding(f, dt);
      if (this.fall > 0 && !this.clip) this.fall = Math.max(0, this.fall - dt * 0.5);
      this.stillT = (!this.clip && this.speed < 0.6) ? (this.stillT || 0) + dt : 0;
    }

    _steer(dt) {
      const g = this.goal;
      let dvx = 0, dvy = 0;
      if (g.mode === 'idle') { dvx = 0; dvy = 0; }
      else {
        let tx = g.x, ty = g.y, tvx = 0, tvy = 0;
        if (g.mode === 'track' && g.track) {
          const t = g.track(this);
          if (t) { tx = t.x; ty = t.y; tvx = t.vx || 0; tvy = t.vy || 0; g.x = tx; g.y = ty; }
        }
        const dx = tx - this.x, dy = ty - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        let want = g.speed;
        if (g.by != null) {
          const left = g.by - this.time;
          want = left > 0.05 ? Math.min(g.speed * 1.25, Math.max(dist / left * 1.12, dist > 0.5 ? 2.5 : 0)) : g.speed * 1.2;
          if (g.pace && dist > 1) want = Math.max(want, Math.min(g.pace, g.speed));
        }
        want = Math.min(want, this.maxSpeed * 1.08);
        if (g.arrive) want = Math.min(want, Math.sqrt(2 * this.decel * 0.8 * Math.max(0, dist - 0.05)));
        if (dist < 0.15 && Math.hypot(tvx, tvy) < 0.5) want = 0;
        if (dist > 1e-4) { dvx = dx / dist * want; dvy = dy / dist * want; }
        dvx += tvx; dvy += tvy;
        const dl = Math.hypot(dvx, dvy);
        if (dl > this.maxSpeed * 1.1) { dvx *= this.maxSpeed * 1.1 / dl; dvy *= this.maxSpeed * 1.1 / dl; }
      }
      // acceleration limits
      let ex = dvx - this.vx, ey = dvy - this.vy;
      const el = Math.sqrt(ex * ex + ey * ey);
      const spd = Math.hypot(this.vx, this.vy);
      const slowing = (dvx * this.vx + dvy * this.vy) < spd * spd;
      // how hard a player pushes off depends on how fast he wants to go: a walk starts gently (walking speed within
      // a step or two), a sprint with everything he has (every start used to be a sprinter's push, even into a
      // walk, and the upper body lurched ahead of the legs)
      const accelNow = Math.min(this.accel, 3 + 1.4 * Math.max(Math.hypot(dvx, dvy), spd));
      const amax = (slowing ? this.decel : accelNow) * dt;
      if (el > amax) { ex *= amax / el; ey *= amax / el; }
      this.ax = ex / Math.max(dt, 1e-4); this.ay = ey / Math.max(dt, 1e-4);
      // a smoothed copy for predicting where the feet land (the raw value flips sign as a player settles to a stop)
      const kA = 1 - Math.exp(-dt / 0.1);
      this.axF = (this.axF || 0) + (this.ax - (this.axF || 0)) * kA; this.ayF = (this.ayF || 0) + (this.ay - (this.ayF || 0)) * kA;
      this.vx += ex; this.vy += ey;
      this.x += this.vx * dt; this.y += this.vy * dt;
      this.speed = Math.hypot(this.vx, this.vy);
      // lean into acceleration / turns (smoothed): only part of the tilt a push-off needs is the trunk bending at the
      // hips (most of it is the legs driving from behind the body), ~12 deg at most; it used to reach ~23 deg even on a
      // walk start and read as the head and shoulders being dragged ahead of the legs
      const c = Math.cos(this.facing), s = Math.sin(this.facing);
      const aF = this.ax * c + this.ay * s, aR = this.ax * s - this.ay * c;
      this.leanF = U.damp(this.leanF, U.clamp(aF / 32.2 * 0.5, -0.18, 0.21), 6, dt);
      this.lean = U.damp(this.lean, U.clamp(aR / 32.2 * 0.6, -0.2, 0.2), 6, dt);
    }

    _desiredFacing() {
      const sp = this.speed;
      let face = this.facing;
      if (this.faceMode === 'angle') face = this.faceAngle;
      else if (this.faceMode === 'point' && this.facePoint) face = Math.atan2(this.facePoint.y - this.y, this.facePoint.x - this.x);
      else if (this.faceMode === 'fn' && this.faceFn) { const f = this.faceFn(this); if (f != null) face = f; }
      if (this.faceMode === 'move' || this.faceMode == null) {
        if (sp > 1.5) face = Math.atan2(this.vy, this.vx);
        return face;
      }
      // explicit facing but moving fast: open up and run unless sliding stance allows it (a defender locked on
      // his man keeps squared up while sliding / backpedalling; his planner decides when he has to turn and run)
      const moveA = Math.atan2(this.vy, this.vx);
      const diff = Math.abs(U.wrapPi(moveA - face));
      const st = A.STANCE[this.stance] || A.STANCE.stand;
      const slideMax = this.faceLock && this.faceMode === 'fn' ? 16 : st.slide ? 13 : 7.5;
      if (sp > slideMax && diff > 0.9) {
        const k = U.smooth((sp - slideMax) / 4);
        face = U.angLerp(face, moveA, k);
      }
      return face;
    }
    _turn(dt) {
      const want = this._desiredFacing();
      const rate = this.speed > 8 ? 5.5 : 7.5;
      this.facing = U.angApproach(this.facing, want, rate * dt);
      this.facing = U.wrapPi(this.facing);
    }

    // ============================================================ locomotion / feet
    /** ankle position for a foot whose ball (when flat) is at (bx, by). pitch > 0: heel raised, the foot pivots about
     *  the ball (push-off); pitch < 0: toes up, the foot pivots about the heel (heel strike, then the forefoot lowers). */
    _ankleFromBall(bx, by, yaw, pitch, out) {
      const d = this.dims;
      const c = Math.cos(yaw), s = Math.sin(yaw);
      const cp = Math.cos(pitch), sp = Math.sin(pitch);
      let ry, rz;
      if (pitch >= 0) {
        // vector ball->ankle in foot-local (y fwd, z up) = (-ball, ankH) rotated about the ball
        ry = -d.ball * cp + d.ankH * sp;
        rz = d.ball * sp + d.ankH * cp;
      } else {
        // heel contact point (flat foot) = ball - (heel + ball); heel->ankle = (heel, ankH) rotated toes-up by -pitch
        const a = -pitch, ca = Math.cos(a), sa = Math.sin(a);
        ry = -(d.heel + d.ball) + d.heel * ca - d.ankH * sa;
        rz = d.heel * sa + d.ankH * ca;
      }
      out[0] = bx + c * ry; out[1] = by + s * ry; out[2] = rz;
      return out;
    }

    _locomote(dt) {
      const sp = this.speed;
      const st = A.STANCE[this.stance] || A.STANCE.stand;
      if (!this.gaitOn && sp > 1.4) this._startGait();
      else if (this.gaitOn && sp < 0.6 && this._feetSettled()) this.gaitOn = false;
      this.gaitK = U.damp(this.gaitK, this.gaitOn ? U.smooth(sp / 3) : 0, 8, dt);
      if (this.gaitOn) {
        const H = this.H;
        const vx = this.vx, vy = this.vy;
        if (sp > 0.3) { this.moveDirX = vx / sp; this.moveDirY = vy / sp; }
        const gp = A.gaitParams(sp, this.gp);
        // sideways / backwards movement: shorter lifts, quicker steps
        const c = Math.cos(this.facing), s = Math.sin(this.facing);
        const fwdDot = this.moveDirX * c + this.moveDirY * s;
        this.fwdDot = fwdDot;
        // accelerating hard: quicker, shorter steps (sprinter's start)
        const accF = Math.max(0, this.ax * this.moveDirX + this.ay * this.moveDirY);
        let sps = A.stepsPerSec(Math.min(this.maxSpeed, sp + accF * 0.3), H);
        // (blended, not switched: a hard switch changed the swing foot's lift and timing in a single frame)
        const nfw = U.smooth((0.6 - fwdDot) / 0.2);
        if (nfw > 0) { sps *= 1 + 0.12 * nfw; gp.lift *= 1 - 0.45 * nfw; gp.beta = U.lerp(gp.beta, Math.max(gp.beta, 0.45), nfw); gp.toePitch *= 1 - 0.4 * nfw; }
        // lateral movement: step-slide (lead foot lands ahead, trail foot behind; feet never cross)
        const latK = U.smooth((0.88 - Math.abs(fwdDot)) / 0.4);
        if (latK > 0) {
          const slideW = U.lerp(0.12, 0.2, this.stP.slide);
          // cadence checked against a motion-captured defensive slide (CMU 102_27): at 10-12 ft/s it is a lateral
          // bound (both feet land nearly together, ~2 bounds/s) with the gap between the feet swinging from ~0.14 H to
          // ~0.66 H; with alternating steps that width range needs ~5 steps/s at 10 ft/s (the old ~7 was a pitter-patter)
          // (only the defensive slide: a sidestep in any other stance keeps the quicker, shorter steps)
          const ks = this.stP.slide;
          const slideSps = U.lerp(2 * U.clamp(1.7 + 0.19 * sp, 1.9, 3.6), U.clamp(2.8 + 0.24 * sp, 3.4, 5.4), ks);
          gp.halfW = U.lerp(gp.halfW, slideW, latK);
          gp.reach = U.lerp(gp.reach, 0.5, latK);
          gp.lift = U.lerp(gp.lift, 0.035 + 0.02 * ks * U.smooth((sp - 6) / 6), latK);
          gp.beta = U.lerp(gp.beta, 0.56, latK);
          gp.toePitch = U.lerp(gp.toePitch, 12 * D, latK);
          gp.landPitch = U.lerp(gp.landPitch, 4 * D, latK);
          sps = U.lerp(sps, slideSps, latK);
        }
        this.latK = latK;
        // the stride's shape follows speed changes over ~0.1 s: a sudden speed change (a bump) re-scaled the swing
        // share against a new stance share in one frame and threw the swing foot backwards
        const gs = this.gpS || (this.gpS = {});
        const kg = gs.beta == null ? 1 : 1 - Math.exp(-dt / 0.08), kb = gs.beta == null ? 1 : 1 - Math.exp(-dt / 0.035);
        for (const k of GAIT_SMOOTH) { gs[k] = gs[k] == null ? gp[k] : gs[k] + (gp[k] - gs[k]) * (k === 'beta' ? kb : kg); gp[k] = gs[k]; }
        const dphi = sps * 0.5 * dt;
        const ph0 = this.phase, ph1 = ph0 + dphi;
        this.phase = ph1 - Math.floor(ph1);
        const cycleT = 2 / sps;
        const strideLen = sp * cycleT;
        // one leg at a time: a foot leaves the floor only while the other one is down, or has been in its stride for
        // over half a step, and never twice running while the other has not moved (a catch-up step of one foot
        // starting with the other's stride, or two lifts in one frame, read as a two-footed hop)
        const stepT = cycleT / 2, minLag = 0.55 * stepT;
        const canLift = (f) => {
          const o = this.feet[1 - f.side];
          if (o.state !== 'plant' && (o.mode !== 'gait' || this.time - (o.liftT == null ? -9 : o.liftT) < minLag)) return false;
          return !(this._lastSwing === f.side && this.time - (f.liftT == null ? -9 : f.liftT) < 1.6 * stepT);
        };
        for (const f of this.feet) {
          const cph = f.side ? 0 : 0.5;
          const lph = cph + gp.beta;
          let tooFar = false;
          if (f.state === 'plant') {
            // A foot inside its own contact window is where the stride put it: it lifts at toe-off on schedule.
            // Only a foot planted outside its window (after a stop, a turn or a clip) and left far behind gets a
            // recovery step. (Measuring from the ankle here fired a panic step on almost every stride, which broke
            // the rhythm into double plants and shuffles.)
            const inWindow = frac(this.phase - cph) < gp.beta;
            const side = f.side ? 1 : -1;
            const hx = this.x + s * side * this.dims.hipX, hy = this.y - c * side * this.dims.hipX;
            const d = Math.hypot(f.x - hx, f.y - hy);
            tooFar = inWindow ? d > 0.5 * H : d > 0.3 * H;
          }
          if (f.state === 'plant' && tooFar && !crossed(ph0, ph1, lph) && this.feet[1 - f.side].state === 'plant' && canLift(f)) {
            // recovery step: foot left too far behind (sharp speed change / turn)
            const side = f.side ? 1 : -1, rx = s, ry = -c;
            const lead = 0.18;
            // targets place the ankle; the ball of the foot (f.x, f.y) is one foot-length-to-ball further along the foot
            const tx = this.x + vx * lead + this.moveDirX * gp.reach * gp.beta * strideLen + rx * side * gp.halfW * H + c * this.dims.ball;
            const ty = this.y + vy * lead + this.moveDirY * gp.reach * gp.beta * strideLen + ry * side * gp.halfW * H + s * this.dims.ball;
            this._beginStep(f, tx, ty, this.facing + (f.side ? -1 : 1) * 7 * D, 0.17, Math.max(0.03, gp.lift * 0.5));
          }
          // a stance foot left behind the hip and out of the leg's reach even up on its toes lifts now, a little
          // before its scheduled toe-off (dragging it on the toes read as skating)
          const relNow = frac(this.phase - cph);
          const early = f.state === 'plant' && !tooFar && relNow < gp.beta && relNow > 0.45 * gp.beta &&
            (sp > 9 || this.feet[1 - f.side].state === 'plant') && this._stanceOutOfReach(f, c, s);
          // (a toe-off held back by the one-leg-at-a-time rule goes as soon as it is allowed, while there is still
          // most of a swing left before the contact; later than that the foot waits for its next stride)
          if (f.liftPending && (f.state !== 'plant' || relNow < gp.beta || relNow > 0.82)) f.liftPending = false;
          const due = crossed(ph0, ph1, lph);
          if (f.state === 'plant' && (early || due || f.liftPending)) {
            if (canLift(f)) {
              // lift off
              const a = this._ankleFromBall(f.x, f.y, f.yaw, f.pitch, TA);
              f.state = 'swing'; f.mode = 'gait';
              f.x0 = a[0]; f.y0 = a[1]; f.z0 = a[2]; f.yaw0 = f.yaw; f.p0 = f.pitch;
              f.nSwing = (f.nSwing || 0) + 1;
              // the swing runs from here to the contact (its share of the stride fixed now, so later changes of
              // speed do not move the foot)
              f.liftRel = early || f.liftPending ? relNow : Math.min(relNow, gp.beta);
              f.liftPending = false; f.liftT = this.time; this._lastSwing = f.side;
            } else if (due) f.liftPending = true;
          }
          if (crossed(ph0, ph1, cph) && f.state === 'swing' && f.mode === 'gait') {
            // walkers (and most joggers) land heel first with the toes up, then roll the forefoot down
            f.state = 'plant'; f.x = f.tx; f.y = f.ty; f.yaw = f.tyaw; f.pitch = Math.min(0, gp.landPitch); f.hs = f.pitch < 0;
            f.sw = 0; f.tPlant = this.time; f.liftRel = null;
          }
          const rel = frac(this.phase - cph);
          if (f.state === 'swing' && f.mode === 'gait') {
            const b0 = f.liftRel != null ? f.liftRel : gp.beta;
            const sw = rel < b0 ? 0 : U.clamp((rel - b0) / (1 - b0), 0, 1);
            // predicted landing
            const tLeft = (1 - sw) * (1 - b0) * cycleT;
            const axc = U.clamp(this.axF || 0, -25, 25), ayc = U.clamp(this.ayF || 0, -25, 25);
            let px = this.x + vx * tLeft + 0.5 * axc * tLeft * tLeft, py = this.y + vy * tLeft + 0.5 * ayc * tLeft * tLeft;
            // a body that is braking stops; it does not reverse (the quadratic sent the landing spot a foot or more
            // behind a player settling to a stop, and the swing foot flew back and forth)
            const aPar = sp > 0.05 ? (axc * vx + ayc * vy) / sp : 0;
            if (aPar < 0) {
              const ux = vx / sp, uy = vy / sp, tS = Math.min(tLeft, sp / -aPar);
              const dPar = sp * tS + 0.5 * aPar * tS * tS, apx = axc - aPar * ux, apy = ayc - aPar * uy;
              px = this.x + ux * dPar + 0.5 * apx * tLeft * tLeft; py = this.y + uy * dPar + 0.5 * apy * tLeft * tLeft;
            }
            const reach = gp.reach * gp.beta * strideLen;
            const side = f.side ? 1 : -1;
            const rx = s, ry = -c;
            f.tyaw = this.facing + (f.side ? -1 : 1) * 7 * D;
            // `reach` places the ankle ahead of the body at contact; the ball of the foot lies d.ball further along the foot
            let ntx = px + this.moveDirX * reach + rx * side * gp.halfW * H + Math.cos(f.tyaw) * this.dims.ball;
            let nty = py + this.moveDirY * reach + ry * side * gp.halfW * H + Math.sin(f.tyaw) * this.dims.ball;
            // a foot in the air can re-aim, but only so fast (no teleporting landing spot on a cut or a stop)
            if (f.swT === this._swingId(f) && f.swLastT != null) {
              const mv = (14 + sp) * Math.max(dt, 1 / 240), ddx = ntx - f.tx, ddy = nty - f.ty, dl = Math.hypot(ddx, ddy);
              if (dl > mv) { ntx = f.tx + ddx * mv / dl; nty = f.ty + ddy * mv / dl; }
            }
            f.swT = this._swingId(f); f.swLastT = this.time;
            f.tx = ntx; f.ty = nty;
            const a1 = this._ankleFromBall(f.tx, f.ty, f.tyaw, Math.min(0, gp.landPitch), TB);
            f.sw = sw; f.lax = a1[0]; f.lay = a1[1]; f.laz = a1[2]; f.lpx = px; f.lpy = py;
            const e = U.smooth(sw);
            // sin^2 starts with zero vertical speed (the old sin^1.1 of sw^0.62 threw the foot up ~0.4 ft in the first
            // frame after toe-off, snapping the knee), and still peaks early in the swing (~40 %)
            const lift = gp.lift * H * Math.pow(Math.sin(Math.PI * Math.pow(sw, Math.max(0.75, gp.liftPow || 0.8))), 2);
            f.ax = f.x0 + (a1[0] - f.x0) * e;
            f.ay = f.y0 + (a1[1] - f.y0) * e;
            f.az = f.z0 + (a1[2] - f.z0) * e + lift;
            f.yawNow = U.angLerp(f.yaw0, f.tyaw, e);
            f.pitchNow = U.lerp(f.p0 || gp.toePitch, gp.landPitch, U.smooth(sw * 1.15)) + Math.sin(Math.PI * sw) * gp.toePitch * 0.25;
          } else if (f.state === 'plant') {
            if (rel < gp.beta) {
              if (f.hs && rel < gp.roll) {
                // heel rocker: the forefoot comes down to the floor after a heel strike
                f.pitch = Math.min(0, gp.landPitch) * (1 - U.smooth(rel / gp.roll));
              } else {
                // heel rise toward toe-off (ankle rocker -> forefoot rocker)
                if (f.hs) { f.hs = false; f.pitch = 0; }
                const k = U.clamp((rel - gp.beta * gp.heelOff) / (gp.beta * (1 - gp.heelOff)), 0, 1);
                f.pitch = Math.max(f.pitch, gp.toePitch * k * k);
              }
            }
          }
        }
      } else {
        this._stanceFeet(dt);
      }
      // advance explicit steps (stance stepping and clip steps)
      for (const f of this.feet) {
        if (f.state === 'swing' && f.mode === 'step') this._advanceStep(f, dt);
      }
    }

    _swingId(f) { return f.nSwing || 0; }
    /** is a planted foot behind the hip and beyond the leg's reach even with the heel fully up? (last solve's pelvis) */
    _stanceOutOfReach(f, c, s) {
      const P = this.sk.P, H = this.H, side = f.side ? 1 : -1;
      const hx = this.x + s * side * this.dims.hipX, hy = this.y - c * side * this.dims.hipX;
      const mx = this.speed > 0.5 ? this.vx / this.speed : c, my = this.speed > 0.5 ? this.vy / this.speed : s;
      if ((f.x - hx) * mx + (f.y - hy) * my > -0.1) return false;
      const a = this._ankleFromBall(f.x, f.y, f.yaw, (this.speed > 9 ? 68 : 58) * D, TC);
      const hz = P[RG.J.PEL * 3 + 2] - 0.012 * H;
      return Math.hypot(a[0] - hx, a[1] - hy, a[2] - hz) > (this.dims.th + this.dims.sh) * 0.995;
    }
    /** plant an airborne foot where the animated foot is: its own heading, toes first with the heel still up, and
     *  the last bit of height let down over a few frames (planting it flat on the floor at once popped the leg) */
    _landFoot(f, yawDefault) {
      const P = this.sk.P, jb = (f.side ? RG.J.R_BALL : RG.J.L_BALL) * 3, jh = (f.side ? RG.J.R_HEEL : RG.J.L_HEEL) * 3;
      f.x = P[jb]; f.y = P[jb + 1];
      const fx = P[jb] - P[jh], fy = P[jb + 1] - P[jh + 1], fl = Math.hypot(fx, fy);
      let yaw = fl > 0.05 ? Math.atan2(fy, fx) : yawDefault;
      // keep it near a natural stance angle for the body's heading
      const rel = U.wrapPi(yaw - this.facing);
      yaw = this.facing + U.clamp(rel, -35 * D, 35 * D);
      f.yaw = yaw;
      const L = this.dims.heel + this.dims.ball;
      f.pitch = U.clamp(Math.asin(U.clamp((P[jh + 2] - P[jb + 2]) / L, -1, 1)), 0, 40 * D);
      f.lz = U.clamp(P[jb + 2], 0, 0.8);
      f.land = true; f.state = 'plant'; f.tPlant = this.time; f.sw = 0;
    }
    _settleLanding(f, dt) {
      if (!f.land) return;
      if (f.state !== 'plant') { f.land = false; f.lz = 0; return; }
      f.lz = f.lz > 0.004 ? f.lz * Math.exp(-dt / 0.035) : 0;
      f.pitch = f.pitch > 0 ? Math.max(0, f.pitch - dt * 5.5) : f.pitch;
      if (!f.lz && f.pitch <= 0) f.land = false;
    }
    _feetSettled() {
      return this.feet[0].state === 'plant' && this.feet[1].state === 'plant';
    }
    _startGait() {
      this.gaitOn = true;
      this.gpS = null;
      // choose the foot that is further behind (relative to movement) to lift first
      const mx = this.vx / (this.speed || 1), my = this.vy / (this.speed || 1);
      const f0 = this.feet[0], f1 = this.feet[1];
      if (f0.state !== 'plant' || f1.state !== 'plant') {
        // mid-step: land the step quickly, from where the foot is (planting it on its target at once teleported it)
        for (const f of this.feet) {
          if (f.state !== 'swing') continue;
          if (f.mode === 'step') { const left = 1 - (f.s || 0); if (left > 1e-3) f.dur = Math.min(f.dur, 0.08 / left); }
          else { f.mode = 'step'; f.s = 0; f.dur = 0.08; f.x0 = f.ax; f.y0 = f.ay; f.z0 = f.az; f.yaw0 = f.yawNow != null ? f.yawNow : f.yaw; f.p0 = f.pitchNow || 0; f.h = 0.01 * this.H; }
        }
      }
      const d0 = (f0.x - this.x) * mx + (f0.y - this.y) * my;
      const d1 = (f1.x - this.x) * mx + (f1.y - this.y) * my;
      // (from a standstill either foot may go first; one still finishing a step keeps the other down meanwhile)
      if (f0.state === 'plant' && f1.state === 'plant' && this.time - Math.max(f0.liftT == null ? -9 : f0.liftT, f1.liftT == null ? -9 : f1.liftT) > 0.15) this._lastSwing = -1;
      const gp = A.gaitParams(this.speed, this.gp);
      // right lifts at beta, left at 0.5+beta
      this.phase = d1 < d0 ? gp.beta - 0.001 : frac(0.5 + gp.beta - 0.001);
    }

    _stanceFeet(dt) {
      const st = A.STANCE[this.stance] || A.STANCE.stand;
      const H = this.H;
      const c = Math.cos(this.facing), s = Math.sin(this.facing);
      const rx = s, ry = -c;
      // any foot still in a gait swing: retarget to stance spot and finish as a step
      for (const f of this.feet) {
        if (f.state === 'swing' && f.mode === 'gait') {
          f.mode = 'step'; f.s = 0; f.dur = 0.16;
          const o = f.side ? st.R : st.L;
          f.tx = this.x + rx * o[0] * H + c * o[1] * H;
          f.ty = this.y + ry * o[0] * H + s * o[1] * H;
          f.tyaw = this.facing + (f.side ? -1 : 1) * st.yaw * D;
          f.x0 = f.ax; f.y0 = f.ay; f.z0 = f.az; f.yaw0 = f.yawNow || f.yaw; f.p0 = f.pitchNow || 0; f.h = 0.02 * H;
        }
        if (f.state === 'plant' && f.pitch > 0) f.pitch = Math.max(0, f.pitch - dt * 4);
        else if (f.state === 'plant' && f.pitch < 0) { f.pitch = Math.min(0, f.pitch + dt * 4); f.hs = false; }
      }
      if (this.feet[0].state === 'swing' || this.feet[1].state === 'swing') return;
      if (this.clip) return;
      // error-driven stepping
      let worst = null, worstE = 0;
      for (const f of this.feet) {
        const o = f.side ? st.R : st.L;
        const ix = this.x + rx * o[0] * H + c * o[1] * H;
        const iy = this.y + ry * o[0] * H + s * o[1] * H;
        const iyaw = this.facing + (f.side ? -1 : 1) * st.yaw * D;
        const de = Math.hypot(f.x - ix, f.y - iy) / H;
        const ye = Math.abs(U.wrapPi(f.yaw - iyaw));
        const err = de / 0.075 + ye / (32 * D);
        f._ix = ix; f._iy = iy; f._iyaw = iyaw;
        if (err > 1 && err > worstE) { worst = f; worstE = err; }
      }
      if (worst && this.time - (this._lastStepT || 0) > 0.05) {
        // prefer alternating feet when both are off
        const other = this.feet[1 - worst.side];
        if (this._lastFoot === worst.side && other._ix != null) {
          const de = Math.hypot(other.x - other._ix, other.y - other._iy) / H;
          if (de > 0.05) worst = other;
        }
        this._beginStep(worst, worst._ix + this.vx * 0.12, worst._iy + this.vy * 0.12, worst._iyaw, 0.24, 0.035);
      }
    }

    _beginStep(f, tx, ty, tyaw, dur, lift) {
      const a = this._ankleFromBall(f.x, f.y, f.yaw, f.pitch, TA);
      f.state = 'swing'; f.mode = 'step'; f.s = 0; f.dur = dur;
      f.liftT = this.time; this._lastSwing = f.side; f.liftPending = false;
      f.x0 = a[0]; f.y0 = a[1]; f.z0 = a[2]; f.yaw0 = f.yaw; f.p0 = f.pitch;
      f.tx = tx; f.ty = ty; f.tyaw = tyaw; f.h = lift * this.H;
      this._lastStepT = this.time; this._lastFoot = f.side;
    }
    _advanceStep(f, dt) {
      f.s = Math.min(1, f.s + dt / Math.max(0.05, f.dur));
      const a1 = this._ankleFromBall(f.tx, f.ty, f.tyaw, 0, TB);
      const e = U.smooth(f.s);
      f.ax = f.x0 + (a1[0] - f.x0) * e;
      f.ay = f.y0 + (a1[1] - f.y0) * e;
      f.az = f.z0 + (a1[2] - f.z0) * e + f.h * Math.sin(Math.PI * f.s);
      f.yawNow = U.angLerp(f.yaw0, f.tyaw, e);
      f.pitchNow = U.lerp(f.p0, 0, e) + Math.sin(Math.PI * f.s) * 0.18;
      if (f.s >= 1) { f.state = 'plant'; f.x = f.tx; f.y = f.ty; f.yaw = f.tyaw; f.pitch = 0; }
    }

    // ============================================================ clips
    _clipRoot(cs, t) {
      const clip = cs.clip;
      let fwd = 0, lat = 0;
      if (clip.rootKeys) { fwd = clip.rootKeys[0](t); lat = clip.rootKeys[1](t); }
      if (cs.mirror) lat = -lat;
      const c = Math.cos(cs.ofacing), s = Math.sin(cs.ofacing);
      const out = RT;
      out.x = cs.ox + c * fwd + s * lat;
      out.y = cs.oy + s * fwd - c * lat;
      out.yaw = cs.ofacing + (clip.yawKeys ? (cs.mirror ? -1 : 1) * clip.yawKeys(t) : 0);
      return out;
    }
    _clipJumpZ(cs, t) {
      const j = cs.clip.jump;
      if (!j || t <= j.t0 || t >= j.t1) return 0;
      const u = (t - j.t0) / (j.t1 - j.t0);
      const h = cs.jumpH != null ? cs.jumpH : j.h * this.H * (0.85 + this.rVert * 0.3);
      if (j.hang && !cs.noHang && t > j.hang[0] && t < j.hang[1]) {
        const uh = (j.hang[0] - j.t0) / (j.t1 - j.t0);
        return 4 * h * uh * (1 - uh);
      }
      return 4 * h * u * (1 - u);
    }
    _clipFeetStart(cs) {
      // settle feet toward the clip's stance positions (quick gather steps)
      for (const f of this.feet) {
        if (f.state === 'swing') {
          // finish the step from where the foot is now (restarting it half way from the lift-off spot made the foot
          // jump at the start of every shot, block or rebound taken on the move)
          const rem = f.mode === 'step' ? (1 - (f.s || 0)) * (f.dur || 0.12) : 0.12;
          f.mode = 'step'; f.s = 0; f.dur = U.clamp(rem, 0.06, 0.14);
          f.x0 = f.ax; f.y0 = f.ay; f.z0 = f.az; f.yaw0 = f.yawNow != null ? f.yawNow : f.yaw; f.p0 = f.pitchNow || 0; f.h = 0.015 * this.H;
        }
      }
    }
    _updateClip(dt) {
      const cs = this.clip;
      const clip = cs.clip;
      if (cs.hold != null && cs.t >= cs.hold) { cs.t = cs.hold; }
      else cs.t += dt * cs.speed;
      // fade
      if (cs.ending) { cs.w -= dt / Math.max(0.05, cs.fadeOut); if (cs.w <= 0) { this._endClip(); return; } }
      else if (cs.w < 1) cs.w = Math.min(1, cs.w + dt / Math.max(0.01, cs.fadeIn));
      // events
      if (clip.events) {
        for (const k in clip.events) {
          const et = clip.events[k];
          if (!cs.fired[k] && cs.t >= et) { cs.fired[k] = true; if (cs.onEvent) U.safe(() => cs.onEvent(k, this, cs), null, 'clip event'); }
        }
      }
      // root motion
      const r = this._clipRoot(cs, Math.min(cs.t, clip.dur));
      const bt = Math.max(cs.blendT, 0.3);
      const bl = 1 - U.smooth(cs.t / bt);
      const bo = cs.blendT > 0 ? 1 - U.smooth(cs.t / cs.blendT) : 0;
      // carry the entry momentum and fade it out (no velocity pop at the clip start)
      const tau = 0.12, mk = tau * (1 - Math.exp(-cs.t / tau));
      const clipV0 = clip.rootKeys ? 0 : 1;
      const nx = r.x + cs.offX * bo + (cs.v0x || 0) * mk * bl * clipV0, ny = r.y + cs.offY * bo + (cs.v0y || 0) * mk * bl * clipV0;
      const idt = 1 / Math.max(dt, 1e-4);
      this.vx = (nx - this.x) * idt; this.vy = (ny - this.y) * idt;
      if (!isFinite(this.vx)) { this.vx = 0; this.vy = 0; }
      this.x = nx; this.y = ny; this.speed = Math.hypot(this.vx, this.vy);
      this.facing = U.angApproach(this.facing, r.yaw, 9 * dt);
      this.jumpZ = this._clipJumpZ(cs, cs.t);
      // feet
      const mode = A.clipFeet(clip, cs.t);
      if (mode === 'air') {
        for (const f of this.feet) f.state = 'air';
      } else {
        for (const f of this.feet) {
          if (f.state === 'air') this._landFoot(f, this.facing + (f.side ? -1 : 1) * 10 * D);
          if (f.state === 'swing' && f.mode === 'step') this._advanceStep(f, dt);
          else if (f.state === 'plant' && this.feet[1 - f.side].state !== 'air') {
            const c = Math.cos(this.facing), s = Math.sin(this.facing), side = f.side ? 1 : -1;
            const hx = this.x + s * side * this.dims.hipX, hy = this.y - c * side * this.dims.hipX;
            const dist = Math.hypot(f.x - hx, f.y - hy);
            // a scripted step for this foot starting very soon takes care of it
            let soon = false;
            if (clip.steps) for (const stp of clip.steps) { const sd = (stp.foot === 'r') !== cs.mirror ? 1 : 0; if (sd === f.side && stp.t0 >= cs.t - 0.02 && stp.t0 - cs.t < 0.1) soon = true; }
            if (!soon && (dist > 0.33 * this.H || (!clip.steps && dist > 0.28 * this.H && (this.feet[1 - f.side].state === 'plant' || dist > 0.4 * this.H)))) {
              const w = 0.1 * this.H;
              this._beginStep(f, this.x + s * side * w + c * 0.02 * this.H, this.y - c * side * w + s * 0.02 * this.H, this.facing + (f.side ? -1 : 1) * 10 * D, 0.16, 0.04);
            }
          }
        }
        // scripted steps
        if (clip.steps) {
          for (const stp of clip.steps) {
            const key = 'step' + stp.t0 + stp.foot;
            if (!cs.fired[key] && cs.t >= stp.t0) {
              cs.fired[key] = true;
              const side = (stp.foot === 'r') !== cs.mirror ? 1 : 0;
              const f = this.feet[side];
              const c = Math.cos(cs.ofacing), s = Math.sin(cs.ofacing);
              const lat = cs.mirror ? -stp.to[1] : stp.to[1];
              const tx = cs.ox + cs.offX * (1 - U.smooth(stp.t1 / Math.max(0.01, cs.blendT))) + c * stp.to[0] + s * lat;
              const ty = cs.oy + cs.offY * (1 - U.smooth(stp.t1 / Math.max(0.01, cs.blendT))) + s * stp.to[0] - c * lat;
              if (f.state !== 'air') this._beginStep(f, tx, ty, cs.ofacing + (stp.yaw || 0) * D * (cs.mirror ? -1 : 1), stp.t1 - stp.t0, stp.lift || 0.06);
            }
          }
        }
        // generic planted-stance correction when the clip holds a stance for long
      }
      // hands on the spot (a dunker grabbing the rim): an explicit IK target, eased in and out
      const rh = cs.reach;
      if (rh && rh.h0 != null) {
        const w = cs.t < rh.h0 ? 0 : cs.t < rh.h0 + 0.07 ? (cs.t - rh.h0) / 0.07 : cs.t < rh.h1 ? 1 : Math.max(0, 1 - (cs.t - rh.h1) / 0.16);
        const hands = rh.hands || [cs.mirror ? 0 : 1];
        for (const side of hands) {
          if (w <= 0.001) { if (this.handTarget[side] && this.handTarget[side].reach) this.handTarget[side] = null; continue; }
          const off = hands.length > 1 ? (side ? 1 : -1) * 0.34 : 0;
          const c = Math.cos(this.facing), s = Math.sin(this.facing);
          const t = this.handTarget[side] || (this.handTarget[side] = { x: 0, y: 0, z: 0, w: 0, reach: true });
          t.x = rh.hx + s * off; t.y = rh.hy - c * off; t.z = rh.hz; t.w = w; t.reach = true;
        }
      }
      if (cs.t >= clip.dur && !clip.loop && cs.hold == null) {
        cs.done = true;
        this._endClip();
      }
    }
    _endClip() {
      const cs = this.clip;
      this.clip = null;
      if (!cs) return;
      for (let side = 0; side < 2; side++) if (this.handTarget[side] && this.handTarget[side].reach) this.handTarget[side] = null;
      this.jumpZ = 0;
      for (const f of this.feet) if (f.state === 'air') this._landFoot(f, this.facing);
      this.vx *= 0.5; this.vy *= 0.5;
      // keep any goal issued while the clip was playing (play() cleared the old one)
      if (cs.onEnd) U.safe(() => cs.onEnd(this), null, 'clip end');
    }
    _updateUpper(dt) {
      const cs = this.upper;
      cs.t += dt * cs.speed;
      if (cs.ending) { cs.w -= dt / Math.max(0.05, cs.fadeOut); if (cs.w <= 0) { this.upper = null; return; } }
      else if (cs.w < 1) cs.w = Math.min(1, cs.w + dt / Math.max(0.01, cs.fadeIn));
      const clip = cs.clip;
      if (clip.events) for (const k in clip.events) {
        if (!cs.fired[k] && cs.t >= clip.events[k]) { cs.fired[k] = true; if (cs.onEvent) U.safe(() => cs.onEvent(k, this, cs), null, 'upper event'); }
      }
      if (!clip.loop && cs.t >= clip.dur) { cs.ending = true; }
    }

    // ============================================================ ball-hold geometry (no FK needed)
    /** world position of a body-local point (x right, y fwd, z up; feet) at the current root */
    local(x, y, z, out) {
      const c = Math.cos(this.facing), s = Math.sin(this.facing);
      out[0] = this.x + s * x + c * y; out[1] = this.y - c * x + s * y; out[2] = z + this.jumpZ;
      return out;
    }
    /** where the ball is while held (clip-driven or by hold mode) */
    heldBallPos(out) {
      const H = this.H;
      const cs = this.clip && this.clip.clip.ballKeys ? this.clip : (this.upper && this.upper.clip.ballKeys ? this.upper : null);
      if (cs) {
        const bk = cs.clip.ballKeys;
        const t = Math.min(cs.t, cs.clip.dur);
        let bx = bk[0](t), by = bk[1](t), bz = bk[2](t);
        if (cs.mirror) bx = -bx;
        const w = cs.w;
        const base = this._holdLocalS(HL);
        this.local(U.lerp(base[0], bx * H, w), U.lerp(base[1], by * H, w), U.lerp(base[2], bz * H, w), out);
        // going up to the rim: the ball ends the rise at the spot, as close as the arm reaches
        const r = cs.reach;
        if (r && r.t1 != null) {
          const k = cs.t <= r.t0 ? 0 : cs.t >= r.t1 ? 1 : U.smooth((cs.t - r.t0) / Math.max(0.01, r.t1 - r.t0));
          if (k > 0.001) {
            const tg = this._reachClamp(r.x, r.y, r.z, cs.mirror ? 0 : 1, 0.1 * H, RT2);
            out[0] += (tg[0] - out[0]) * k; out[1] += (tg[1] - out[1]) * k; out[2] += (tg[2] - out[2]) * k;
          }
        }
        return out;
      }
      const l = this._holdLocalS(HL);
      return this.local(l[0], l[1], l[2], out);
    }
    /** a world point pulled in to within an arm's length (plus `extra`) of the shoulder on `side`. The shoulder is
     *  placed from the root (glenohumeral centre ~0.80 H up, a touch forward, plus any jump), not read from the last
     *  solve, so where a held ball goes never depends on whether a frame was drawn */
    _reachClamp(x, y, z, side, extra, out) {
      const sh = this.local((side ? 1 : -1) * this.dims.shX, 0.02 * this.H, 0.8 * this.H, RT3);
      const sx = sh[0], sy = sh[1], sz = sh[2];
      const L = (this.dims.ua + this.dims.fa) * 0.97 + extra;
      const dx = x - sx, dy = y - sy, dz = z - sz, d = Math.hypot(dx, dy, dz);
      const k = d > L && d > 1e-6 ? L / d : 1;
      out[0] = sx + dx * k; out[1] = sy + dy * k; out[2] = sz + dz * k;
      return out;
    }
    /** the hold position eased over ~0.1 s, so switching how the ball is held (chest, pocket, overhead...)
     *  moves it through the hands instead of teleporting it */
    _holdLocalS(out) {
      const tg = this._holdLocal(out);
      const t = this.time || 0;
      let s = this._holdS;
      if (!s) s = this._holdS = { x: tg[0], y: tg[1], z: tg[2], t };
      const dt = U.clamp(t - s.t, 0, 0.1); s.t = t;
      const k = 1 - Math.exp(-dt / 0.09);
      s.x += (tg[0] - s.x) * k; s.y += (tg[1] - s.y) * k; s.z += (tg[2] - s.z) * k;
      out[0] = s.x; out[1] = s.y; out[2] = s.z;
      return out;
    }
    _holdLocal(out) {
      const H = this.H, m = this.lefty ? -1 : 1;
      switch (this.ballHold) {
        case 'triple': out[0] = 0.13 * H * m; out[1] = 0.06 * H; out[2] = 0.5 * H; break;
        case 'over': out[0] = 0; out[1] = 0.05 * H; out[2] = 1.1 * H; break;
        case 'pocket': out[0] = 0.07 * H * m; out[1] = 0.14 * H; out[2] = 0.53 * H; break;
        case 'low': out[0] = 0.02 * H * m; out[1] = 0.17 * H; out[2] = 0.36 * H; break;
        default: out[0] = 0; out[1] = 0.16 * H; out[2] = 0.66 * H;
      }
      // the holds are set for a player standing tall: sitting lower and leaning in, the chest (and the ball held in
      // front of it) comes down and forward with him (a fixed spot ended up inside a crouched player's chest)
      const q = this.pose;
      if (q) {
        const drop = Math.max(0, -q[CH.rootZ] - 0.03) * H;
        const lean = Math.max(0, q[CH.pelPitch] + q[CH.spFlex] - 14 * D);
        out[2] -= drop * 0.85;
        out[1] += Math.sin(lean) * 0.3 * H;
      }
      return out;
    }
    /** how low he dribbles (0..1): sitting down in the dribbling stance keeps the ball at the lowered hips (a speed
     *  dribble on the run comes back up), deeper still when protecting it */
    dribbleDepth() {
      const st = this.stance === 'dribble' ? 0.35 * (1 - U.smooth((this.speed - 5) / 7)) : 0;
      return Math.max(this.dribbleLow || 0, st);
    }
    /** where the ball sits at the top of the dribble: hip height, outside the dribble-side foot, a little in front */
    dribbleTop(hand, out) {
      const H = this.H, side = hand ? 1 : -1;
      const low = this.dribbleDepth();
      const spK = U.smooth((this.speed - 6) / 12);
      return this.local(side * 0.2 * H, (0.13 + 0.14 * spK) * H, (0.5 - low * 0.2 + 0.09 * spK) * H, out);
    }

    // ============================================================ pose
    /** stance settings blended over the stance crossfade */
    _stanceParams() {
      const st = A.STANCE[this.stance] || A.STANCE.stand, q = this.prevStP, o = this.stP;
      const w = this.stanceBlend < 1 ? U.smooth(this.stanceBlend) : 1;
      o.gaitArms = U.lerp(q.gaitArms, st.gaitArms, w);
      o.gaitTorso = U.lerp(q.gaitTorso, st.gaitTorso, w);
      o.slide = U.lerp(q.slide, st.slide ? 1 : 0, w);
      o.def = U.lerp(q.def, this.stance === 'defense' || this.stance === 'defenseWide' ? 1 : 0, w);
      o.idle = U.lerp(q.idle, IDLE_SHIFT[this.stance] || 0, w);
      return o;
    }
    _stancePose(name) {
      const st = A.STANCE[name] || A.STANCE.stand;
      return PL[st.pose] || PL.stand;
    }

    buildPose() {
      const p = this.pose;
      const H = this.H;
      // 1. stance (with crossfade)
      const sp = this._stancePose(this.stance);
      if (this.stanceBlend < 1) {
        const w = U.smooth(this.stanceBlend);
        for (let i = 0; i < RG.NCH; i++) p[i] = this.prevStancePose[i] + (sp[i] - this.prevStancePose[i]) * w;
      } else p.set(sp);
      // the dribble picked up (holding the ball to pass or shoot): he comes partway up out of the dribbling crouch
      const tNow = this.time || 0, dtB = U.clamp(tNow - (this._bpT != null ? this._bpT : tNow), 0, 0.1); this._bpT = tNow;
      const holdUp = this.stance === 'dribble' && this.hasBall && !this.dribble ? 1 : 0;
      this._holdRise = (this._holdRise || 0) + (holdUp - (this._holdRise || 0)) * (1 - Math.exp(-dtB / 0.18));
      if (this._holdRise > 0.001) {
        const k = 0.45 * U.smooth(this._holdRise);
        p[CH.rootZ] *= 1 - k; p[CH.pelPitch] *= 1 - k * 0.8;
        for (const c of ['lHipF', 'rHipF', 'lKnee', 'rKnee', 'lAnk', 'rAnk']) p[CH[c]] *= 1 - k;
        p[CH.nkFlex] *= 1 - k * 0.8;
      }
      // breathing
      const br = Math.sin(this.time * 1.7 + this.breath);
      p[CH.chFlex] += br * 0.8 * D; p[CH.lClvE] += br * 0.08; p[CH.rClvE] += br * 0.08;
      // live stance: defenders stay bouncy on the balls of their feet with active hands
      const stp = this.stP;
      const kDef = stp.def * (1 - U.smooth((this.speed - 2.2) / 1.6));
      if (kDef > 0.001) {
        const tt = this.time * 6.2 + this.breath;
        p[CH.rootZ] += Math.sin(tt) * 0.006 * kDef;
        p[CH.rShF] += Math.sin(tt * 0.37) * 8 * D * kDef; p[CH.lShF] += Math.sin(tt * 0.29 + 1) * 7 * D * kDef;
        p[CH.rElF] += Math.sin(tt * 0.31 + 2) * 6 * D * kDef;
      }
      // idle weight shift when standing still for a while (planted feet: the IK bends the unloaded knee)
      if (this.stillT > 0.8 && stp.idle > 0.001) {
        const k = U.smooth(Math.min(1, (this.stillT - 0.8) / 1.2)) * stp.idle;
        const ph = this.time * 1.15 + this.breath * 3.1;
        const sh = (Math.sin(ph) + 0.25 * Math.sin(ph * 2.3 + 1)) * k;
        p[CH.rootX] += sh * 0.11;
        p[CH.pelRoll] += sh * 2.2 * D; p[CH.spLat] -= sh * 1.6 * D; p[CH.chLat] -= sh * 0.8 * D;
        p[CH.rootZ] -= Math.abs(sh) * 0.004;
      }
      // 2. gait
      const st = A.STANCE[this.stance] || A.STANCE.stand;
      if (this.gaitK > 0.001) {
        // moving sideways (a shuffle) or backwards the arms stop pumping and the torso stays quiet; all blended
        // by direction so nothing pops when a player turns his hips while moving
        const fd = this.fwdDot == null ? 1 : this.fwdDot;
        const back = U.smooth((-fd - 0.15) / 0.3);
        const lat = this.latK || 0;
        const kT = this.gaitK * U.lerp(U.lerp(stp.gaitTorso, 1, U.smooth((this.speed - 6) / 6)), U.lerp(0.35, 0.25, stp.slide), lat);
        const kA = this.gaitK * U.lerp(U.lerp(stp.gaitArms, 1, U.smooth((this.speed - 7) / 6)), U.lerp(0.16, 0.1, stp.slide), Math.max(lat, back * 0.6));
        A.applyGait(p, this.phase, this.speed, kT, back, kA);
        if (lat > 0.001) A.applySlide(p, this.phase, this.gaitK * lat);
        if (back > 0.001) { p[CH.spFlex] -= 6 * D * this.gaitK * back; p[CH.pelPitch] -= 4 * D * this.gaitK * back; }
      }
      // lean from acceleration and turns: the trunk tilts mostly at the hips, and the neck and head take most of it
      // back so the eyes stay level (runners hold the head steady; a head nodding with every change of pace looked
      // like it was being pulled along)
      if (!this.clip) {
        p[CH.pelPitch] += this.leanF * 0.6; p[CH.spFlex] += this.leanF * 0.4;
        p[CH.nkFlex] -= this.leanF * 0.5; p[CH.hdFlex] -= this.leanF * 0.3;
        p[CH.pelRoll] += -this.lean * 0.6; p[CH.spLat] += -this.lean * 0.4;
        p[CH.nkLat] += this.lean * 0.4;
      }
      // 3. upper-body overlay clip
      if (this.upper) {
        const cs = this.upper;
        A.sampleClip(cs.clip, cs.t, this.clipPose);
        if (cs.mirror) { RG.mirrorPose(this.clipPose, this.tmpPose); this.clipPose.set(this.tmpPose); }
        const w = U.smooth(cs.w);
        const mask = maskOf(cs.clip.mask);
        for (const i of mask) p[i] += (this.clipPose[i] - p[i]) * w;
      }
      // 3b. squared up to a pass target: the trunk takes the turn the feet have not made yet
      if (this.aim_ && this.aim_.w > 0.001 && !this.clip) {
        const a = this.aim_;
        const rel = U.clamp(U.wrapPi(Math.atan2(a.y - this.y, a.x - this.x) - this.facing), -1.25, 1.25) * U.smooth(a.w);
        p[CH.pelTwist] += rel * 0.22; p[CH.spTwist] += rel * 0.34; p[CH.chTwist] += rel * 0.3; p[CH.nkTwist] += rel * 0.08;
      }
      // 4. full-body clip
      if (this.clip) {
        const cs = this.clip;
        A.sampleClip(cs.clip, Math.min(cs.t, cs.clip.dur), this.clipPose);
        if (cs.mirror) { RG.mirrorPose(this.clipPose, this.tmpPose); this.clipPose.set(this.tmpPose); }
        const w = U.smooth(cs.w);
        const mask = maskOf(cs.clip.mask);
        for (const i of mask) p[i] += (this.clipPose[i] - p[i]) * w;
      }
      // knocked down (charge)
      if (this.fall > 0) {
        const f = U.smooth(this.fall);
        p[CH.rootZ] = U.lerp(p[CH.rootZ], -0.4, f); p[CH.pelPitch] = U.lerp(p[CH.pelPitch], -70 * D, f);
        p[CH.spFlex] = U.lerp(p[CH.spFlex], 20 * D, f); p[CH.nkFlex] = U.lerp(p[CH.nkFlex], 25 * D, f);
      }
      // 5. head look-at
      if (this.look_) this._applyLook(p);
      // 6. procedural overlays (dribble arm etc.) handled in IK stage
    }

    _applyLook(p) {
      const t = this.look_;
      const tx = t.x != null ? t.x : 0, ty = t.y != null ? t.y : 0;
      const ang = Math.atan2(ty - this.y, tx - this.x);
      let rel = U.wrapPi(ang - this.facing);
      rel = U.clamp(rel, -1.35, 1.35);
      p[CH.chTwist] += rel * 0.2; p[CH.nkTwist] += rel * 0.35; p[CH.hdTwist] += rel * 0.35;
    }

    /** final solve: sets IK requests from feet / ball and runs the skeleton */
    solve() {
      this.buildPose();
      const sk = this.sk, p = this.pose, H = this.H;
      // time since the last frame (0 when solved again in the same frame: recording, render, dribble fix-ups)
      const tNow = this.time || 0;
      const dtI = this._inT == null ? -1 : tNow - this._inT;
      this._inT = tNow;
      this._inDt = dtI;
      const fall = this.fall;
      // feet
      let minRootZ = Infinity;
      const c = Math.cos(this.facing), s = Math.sin(this.facing);
      for (const f of this.feet) {
        const ik = sk.legIK[f.side];
        if (f.state === 'air' || fall > 0.5) { ik.on = 0; continue; }
        ik.on = 1;
        if (f.state === 'plant') {
          const a = this._ankleFromBall(f.x, f.y, f.yaw, f.pitch, TA);
          ik.x = a[0]; ik.y = a[1]; ik.z = a[2] + (f.land ? f.lz || 0 : 0); ik.yaw = f.yaw; ik.pitch = f.pitch; ik.soft = false;
        } else {
          ik.x = f.ax; ik.y = f.ay; ik.z = f.az; ik.yaw = f.yawNow != null ? f.yawNow : f.yaw; ik.pitch = f.pitchNow || 0;
          // (fully soft in mid-swing; a walker's leg reaches its heel strike exactly so the plant does not jump,
          // a runner's landing is kept reachable by the pelvis settling instead)
          ik.soft = true; ik.softW = U.lerp(0.02, 0.06, U.smooth((this.speed - 6) / 2.5));
          ik.softK = f.mode === 'gait' && f.sw != null ? U.lerp(1 - U.smooth((f.sw - 0.72) / 0.26), 1, U.smooth((this.speed - 6) / 2.5)) : 1;
          // late in a gait swing the pelvis already settles so the leg meets the floor with the knee a little bent
          // (runners land at ~15-20 deg of knee flexion) instead of locking straight and dropping at contact
          if (f.mode === 'gait' && f.sw > 0.55 && f.lax != null && this.gaitOn && !this.clip) {
            // (measured from where the hip will be at contact, not where it is now)
            const side = f.side ? 1 : -1;
            const hx = f.lpx + s * side * this.dims.hipX, hy = f.lpy - c * side * this.dims.hipX;
            const runK = U.smooth((this.speed - 6) / 2.5);
            const Lr = (this.dims.th + this.dims.sh) * U.lerp(0.9986, 0.975, runK), dh = Math.hypot(f.lax - hx, f.lay - hy);
            const zl = f.laz + Math.sqrt(Math.max(0.01, Lr * Lr - dh * dh));
            minRootZ = Math.min(minRootZ, zl + (1 - U.smooth((f.sw - 0.55) / 0.45)) * 0.6);
          }
        }
        // hip reach constraint -> maximum pelvis height (only planted feet support the body)
        if (f.state !== 'plant') continue;
        const side = f.side ? 1 : -1;
        const hx = this.x + s * side * this.dims.hipX, hy = this.y - c * side * this.dims.hipX;
        let dh = Math.hypot(ik.x - hx, ik.y - hy);
        // a stance leg may straighten to ~6 deg of knee flexion (walking midstance / heel strike), no further; just
        // after a running contact it stays as bent as the landing was (no pop up onto a straight leg)
        const sinceLand = f.tPlant != null ? this.time - f.tPlant : 9;
        const Lk = this.gaitOn ? U.lerp(0.9986, U.lerp(0.975, 0.9986, U.smooth(sinceLand / 0.14)), U.smooth((this.speed - 6) / 2.5)) : 0.9986;
        const L = (this.dims.th + this.dims.sh) * Lk;
        let zmax = ik.z + Math.sqrt(Math.max(0.01, L * L - dh * dh));
        // push-off: a stance foot behind the hip rolls onto the ball of the foot (heel rise) so the leg stays long,
        // the way real runners and walkers do, instead of the pelvis sinking to reach a flat foot
        // (zmax is the highest the hip JOINT can be; the pelvis root sits 0.012 H above it)
        const wantZ = this.dims.hipH + p[CH.rootZ] * H + this.jumpZ - 0.012 * H;
        const behind = (f.x - hx) * c + (f.y - hy) * s < 0;
        if (zmax < wantZ && behind && this.gaitOn && !this.clip) {
          const maxPitch = (this.speed > 9 ? 68 : 58) * D;
          let pitch = Math.max(0, f.pitch);
          // the heel comes up progressively (a real push-off takes a few frames), not in one jump
          const dtS = U.clamp((this.time || 0) - (f.tRise != null ? f.tRise : (this.time || 0) - 1 / 60), 1 / 240, 0.1);
          f.tRise = this.time || 0;
          const pCap = Math.min(maxPitch, pitch + 300 * D * dtS);
          while (zmax < wantZ && pitch < pCap) {
            pitch = Math.min(pCap, pitch + 2 * D);
            const a = this._ankleFromBall(f.x, f.y, f.yaw, pitch, TA);
            dh = Math.hypot(a[0] - hx, a[1] - hy);
            zmax = a[2] + Math.sqrt(Math.max(0.01, L * L - dh * dh));
            ik.x = a[0]; ik.y = a[1]; ik.z = a[2];
          }
          f.pitch = pitch; ik.pitch = pitch;
        }
        minRootZ = Math.min(minRootZ, zmax);
      }
      // pelvis height: pose + jump; clamp for reach when on the ground
      let rootZ = this.dims.hipH + p[CH.rootZ] * H + this.jumpZ;
      if (minRootZ < Infinity && this.jumpZ < 0.05) rootZ = Math.max(Math.min(rootZ, minRootZ + 0.012 * H), rootZ - 0.12 * H);
      p[CH.rootZ] = (rootZ - this.dims.hipH) / H;
      // arms: ball / explicit targets
      this._armTargets();
      // pose channels that jump between frames (stance and clip switches, dribble arm poses, look-at flips) glide
      this._inTorso.apply(p, dtI);
      sk.solve(p, this.x, this.y, this.facing);
      // holding the ball up high (dunks, lobs, rebounds, overhead holds) where the grip is out of the arms'
      // reach: the ball goes where the hands can actually hold it instead of floating above them
      const gr = this._grip, vb = this.view && this.view.ball;
      const cr = this._carry || (this._carry = { x: 0, y: 0, z: 0, t: this.time || 0 });
      const cdt = U.clamp((this.time || 0) - cr.t, 0, 0.1); cr.t = this.time || 0;
      if (gr && (gr[0] || gr[1]) && vb && vb.holder === this && vb.state === 'held') {
        let ex = 0, ey = 0, ez = 0, n = 0;
        for (let side = 0; side < 2; side++) {
          if (!gr[side]) continue;
          const ik = sk.armIK[side], j = (side ? RG.J.R_WR : RG.J.L_WR) * 3;
          ex += sk.P[j] - ik.x; ey += sk.P[j + 1] - ik.y; ez += sk.P[j + 2] - ik.z; n++;
        }
        const w = U.smooth((vb.z - 0.4 * H) / (0.2 * H)) / n;
        // eased so a grip change or the ball rising past the hips never snaps it
        const k = 1 - Math.exp(-cdt / 0.05);
        cr.x += (ex * w - cr.x) * k; cr.y += (ey * w - cr.y) * k; cr.z += (ez * w - cr.z) * k;
        vb.x += cr.x; vb.y += cr.y; vb.z += cr.z;
      } else { cr.x = cr.y = cr.z = 0; }
      // dribbling: the target is where the palm must touch the ball; move the wrist by the miss and re-solve
      const d = this.dribble;
      if (d && d.palm && d.wx != null && sk.armIK[d.hand ? 1 : 0].on > 0.01) {
        const ik = sk.armIK[d.hand ? 1 : 0], j = (d.hand ? RG.J.R_HD : RG.J.L_HD) * 3;
        // (not while the hand is still crossfading into the dribble from a grip)
        const xf = this._armS[d.hand ? 1 : 0].xf, kc = xf ? U.smooth(Math.min(1, xf.t / 0.14)) : 1;
        for (let it = 0; it < 2 && kc > 0.001; it++) {
          ik.x += (d.wx - sk.P[j]) * kc; ik.y += (d.wy - sk.P[j + 1]) * kc; ik.z += (d.wz - sk.P[j + 2]) * kc;
          sk.solve(p, this.x, this.y, this.facing);
        }
      }
      // legs leaving the floor (take-off): the IK pose eases into the clip's air pose instead of switching in one frame
      sk.inertLegs(dtI, this.feet[0].state === 'air' || this.fall > 0.5, this.feet[1].state === 'air' || this.fall > 0.5);
    }

    _armTargets() {
      const sk = this.sk, H = this.H;
      const grip = this._grip || (this._grip = [0, 0]);
      grip[0] = grip[1] = 0;
      const src = this._armSrc || (this._armSrc = [null, null]);
      for (let side = 0; side < 2; side++) { sk.armIK[side].on = 0; sk.armIK[side].pole = null; src[side] = null; }
      // explicit
      for (let side = 0; side < 2; side++) {
        const t = this.handTarget[side];
        if (t && t.w > 0) { const ik = sk.armIK[side]; ik.on = Math.min(1, t.w); ik.x = t.x; ik.y = t.y; ik.z = t.z; src[side] = 'tgt'; }
      }
      // dribble: the hand rides the ball up, pushes it down with an extending elbow, follows through and waits
      // low for the catch (targets planned by the ball); elbow back and a little out (pole), palm down
      if (this.dribble && this.view && this.view.ball && this.dribble.wx != null) {
        const d = this.dribble;
        const wAll = d.w == null ? 1 : d.w;
        const hand = d.hand ? 1 : 0, pre = hand ? 'r' : 'l';
        const ik = sk.armIK[hand];
        ik.on = Math.max(ik.on, 0.98 * wAll * (d.act == null ? 1 : d.act));
        ik.x = d.wx; ik.y = d.wy; ik.z = d.wz; ik.pole = DRIB_POLE; src[hand] = 'drib';
        const pp = this.pose;
        pp[CH[pre + 'WrF']] = U.lerp(pp[CH[pre + 'WrF']], (d.wrF || 0) * D, wAll);
        pp[CH[pre + 'Pro']] = U.lerp(pp[CH[pre + 'Pro']], 150 * D, wAll);
        pp[CH[pre + 'WrD']] = U.lerp(pp[CH[pre + 'WrD']], 8 * D, wAll);
        pp[CH[pre + 'Fing']] = U.lerp(pp[CH[pre + 'Fing']], 0.12, wAll);
        // off arm: an "arm bar" guard, forearm up in front toward the defender, elbow ~90 deg (not pushing)
        const off = hand ? 'l' : 'r';
        const wOff = 0.8 * wAll;
        pp[CH[off + 'ShF']] = U.lerp(pp[CH[off + 'ShF']], 42 * D, wOff);
        pp[CH[off + 'ShA']] = U.lerp(pp[CH[off + 'ShA']], 26 * D, wOff);
        pp[CH[off + 'ShT']] = U.lerp(pp[CH[off + 'ShT']], -6 * D, wOff);
        pp[CH[off + 'ElF']] = U.lerp(pp[CH[off + 'ElF']], 88 * D, wOff);
        pp[CH[off + 'Pro']] = U.lerp(pp[CH[off + 'Pro']], 60 * D, wOff);
        pp[CH[off + 'WrF']] = U.lerp(pp[CH[off + 'WrF']], -10 * D, wOff);
        pp[CH[off + 'Fing']] = U.lerp(pp[CH[off + 'Fing']], 0.2, wOff);
        // shoulders turn a little toward the ball side; the dribbling shoulder dips as the push goes down
        pp[CH.chTwist] += (hand ? -1 : 1) * 5 * D * wAll;
        if (d.ph === 'push') pp[CH.chLat] += (hand ? 1 : -1) * 2.5 * D * Math.sin(Math.PI * (d.s || 0)) * wAll;
      }
      // about to catch: the hands go out to meet the ball, a pass in its last ~0.3 s or a loose ball within reach
      // just before a clip's catch or grab (a grip that only switched on at the catch left the hands behind the ball)
      if (!this.hasBall && !this.dribble && this.view && this.view.ball) {
        const b = this.view.ball;
        let w = 0;
        if (b.state === 'flight' && b.passTarget === this) {
          const left = b.flightEnd() - b.time;
          if (left < 0.3) w = U.smooth(U.clamp(1 - left / 0.3, 0, 1));
        } else if (this.clip && !b.holder && this.clip.clip.events) {
          const cs = this.clip, ev = cs.clip.events, tev = ev.grab != null ? ev.grab : ev.catch;
          if (tev != null && !cs.fired.grab && !cs.fired.catch) {
            const left = (tev - cs.t) / (cs.speed || 1);
            const dB = Math.hypot(b.x - this.x, b.y - this.y, b.z - (this.jumpZ + 0.7 * this.H));
            if (left < 0.25 && dB < 4) w = U.smooth(U.clamp(1 - left / 0.25, 0, 1)) * U.smooth((4 - dB) / 1.5);
          }
        }
        if (w > 0.001) {
          const grip = A.GRIP[b.z > this.jumpZ + 0.95 * this.H ? 'over' : 'hold'];
          const c = Math.cos(this.facing), s = Math.sin(this.facing);
          for (let side = 0; side < 2; side++) {
            const g = side ? grip.r : grip.l, ik = sk.armIK[side];
            if (ik.on >= w) continue;
            ik.on = w; src[side] = 'grip';
            ik.x = b.x + (s * g[0] + c * g[1]) * BALL_R; ik.y = b.y + (-c * g[0] + s * g[1]) * BALL_R; ik.z = b.z + g[2] * BALL_R;
          }
        }
      }
      // holding the ball: grips from the active clip or hold mode
      if (this.hasBall && this.view && this.view.ball && !this.dribble) {
        const b = this.view.ball;
        let gripName = null, pole = null;
        const cs = this.clip || this.upper;
        if (cs && cs.clip.ballKeys) gripName = A.clipGrip(cs.clip, Math.min(cs.t, cs.clip.dur));
        // (a plain hold: elbows down and out, palms on the sides of the ball; clips keep their authored elbows)
        if (!gripName) { gripName = this.ballHold === 'triple' ? 'hip' : this.ballHold === 'over' ? 'over' : 'hold'; pole = HOLD_POLE[gripName] || null; }
        let grip = A.GRIP[gripName];
        if (grip) {
          const mir = cs ? cs.mirror : this.lefty;
          const c = Math.cos(this.facing), s = Math.sin(this.facing);
          for (let side = 0; side < 2; side++) {
            let g = mir ? (side ? grip.l : grip.r) : (side ? grip.r : grip.l);
            if (!g) continue;
            const gx = mir ? -g[0] : g[0];
            const ik = sk.armIK[side];
            ik.on = 1; this._grip[side] = 1; src[side] = 'grip'; ik.pole = pole;
            ik.x = b.x + (s * gx + c * g[1]) * BALL_R;
            ik.y = b.y + (-c * gx + s * g[1]) * BALL_R;
            ik.z = b.z + g[2] * BALL_R;
          }
        }
      }
      this._smoothArmIK();
    }

    /** arm IK requests switch on and off, jump between grips, and hand over from a grip to the dribble in a single
     *  frame; the arm eases instead: the IK weight ramps (~0.12 s), a grip change moves the hand around the ball
     *  (the grip offset is inertialized relative to the ball, so a hand never lags a ball it holds), a hand that
     *  changes task crossfades from where it was, and a hand letting go keeps reaching for its last spot while
     *  the weight fades */
    _smoothArmIK() {
      const sk = this.sk, dt = this._inDt, b = this.view && this.view.ball;
      const c = Math.cos(this.facing), s = Math.sin(this.facing);
      const src = this._armSrc || [null, null];
      const bl = (x, y, z, o) => { const rx = x - this.x, ry = y - this.y; o[0] = rx * s - ry * c; o[1] = rx * c + ry * s; o[2] = z - this.jumpZ; return o; };
      const bx = b ? b.x : this.x, by = b ? b.y : this.y, bz = b ? b.z : 0;
      const fresh = !(dt >= 0) || dt > 0.12;
      for (let side = 0; side < 2; side++) {
        const ik = sk.armIK[side], st = this._armS[side], want = ik.on, v = st.v;
        if (fresh) { st.w = want; st.has = false; st.src = null; st.xf = null; st.t.reset(); }
        else if (dt > 0) st.w = want > st.w ? Math.min(want, st.w + dt / 0.12) : Math.max(want, st.w - dt / 0.12);
        if (want > 0.001) {
          const cur = src[side] || 'tgt';
          // relative to the ball (body frame) while holding or dribbling it, else relative to the body
          const onBall = cur !== 'tgt';
          bl(ik.x - (onBall ? bx - this.x : 0), ik.y - (onBall ? by - this.y : 0), ik.z - (onBall ? bz - this.jumpZ : 0), v);
          if (st.has && st.src && st.src !== cur && !fresh) {
            // changing task (grip <-> dribble, hand-over): crossfade from where the hand was
            st.xf = { t: 0, x: st.ox, y: st.oy, z: st.oz, ball: st.onBall };
            st.t.reset();
          }
          if (cur === 'grip') st.t.apply(v, st.has && st.src === 'grip' ? dt : -1);
          else st.t.reset();
          let wx, wy, wz;
          const toW = (lx, ly, lz, ball) => { wx = this.x + s * lx + c * ly + (ball ? bx - this.x : 0); wy = this.y - c * lx + s * ly + (ball ? by - this.y : 0); wz = lz + this.jumpZ + (ball ? bz - this.jumpZ : 0); };
          toW(v[0], v[1], v[2], onBall);
          if (st.xf) {
            st.xf.t += Math.max(0, dt);
            const e = U.smooth(Math.min(1, st.xf.t / 0.14));
            const nx = wx, ny = wy, nz = wz;
            toW(st.xf.x, st.xf.y, st.xf.z, st.xf.ball);
            wx += (nx - wx) * e; wy += (ny - wy) * e; wz += (nz - wz) * e;
            if (e >= 1) st.xf = null;
          }
          ik.x = wx; ik.y = wy; ik.z = wz;
          // remember the hand's spot (body frame) for a later hand-over or release
          bl(wx, wy, wz, v); st.ox = v[0]; st.oy = v[1]; st.oz = v[2]; st.onBall = false;
          st.has = true; st.src = cur; st.pole = ik.pole;
        } else if (st.w > 0.001 && st.has) {
          // letting go: hold the last spot in the body frame while the weight fades
          ik.pole = st.pole;
          ik.x = this.x + s * st.ox + c * st.oy; ik.y = this.y - c * st.ox + s * st.oy; ik.z = st.oz + this.jumpZ;
          st.src = null; st.xf = null;
        } else { st.has = false; st.src = null; st.xf = null; st.t.reset(); }
        ik.on = st.w;
      }
    }

    // ============================================================ draw
    draw(g, cam, fr, o) {
      if (this.hidden) return;
      fr.draw(g, cam, this.sk, this.style, o);
    }
    depth(cam) { return cam.depth(this.y, 3); }
  }

  const TA = new Float64Array(3), TB = new Float64Array(3), TC = new Float64Array(3), HL = new Float64Array(3);
  // dribbling elbow swivel: behind the elbow with a small outward bias (x = outward, y = forward, z = up)
  const DRIB_POLE = [0.28, -0.85, -0.45];
  // holding the ball without a clip: elbows down and out (chest), out and forward (overhead), back (hip pocket)
  const HOLD_POLE = { hold: [0.62, -0.25, -0.75], over: [0.75, 0.25, -0.3], hip: [0.35, -0.8, -0.5] };
  const RT = { x: 0, y: 0, yaw: 0 };
  function frac(v) { return v - Math.floor(v); }
  /** did phase go through point p while moving from a to b (b>=a, may exceed 1)? */
  function crossed(a, b, p) {
    p = frac(p);
    let pa = p; if (pa < a) pa += 1;
    return pa > a && pa <= b;
  }
  const RT2 = new Float64Array(3), RT3 = new Float64Array(3);
  const MASKS = {};
  function maskOf(name) {
    if (MASKS[name]) return MASKS[name];
    const G = RG.GROUP;
    let m;
    switch (name) {
      case 'upper': m = [].concat(G.arms, G.head, [CH.spFlex, CH.spLat, CH.spTwist, CH.chFlex, CH.chLat, CH.chTwist]); break;
      case 'arms': m = G.arms.slice(); break;
      case 'rarm': m = G.rarm.slice(); break;
      case 'larm': m = G.larm.slice(); break;
      case 'armsHead': m = [].concat(G.arms, G.head); break;
      default: m = []; for (let i = 0; i < RG.NCH; i++) m.push(i);
    }
    MASKS[name] = m;
    return m;
  }

  M.Actor = Actor;
  M.Actor.maskOf = maskOf;
})();
