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
  /** the Player Speed live AI slider (League Settings, 0..100, 50 = default) as a multiplier, 0.8 .. 1.25 */
  function paceOf(view) {
    const ai = view && view.opts && view.opts.ai;
    const x = ai && ai.moveSpeed != null ? U.clamp(+ai.moveSpeed, 0, 100) : 50;
    return x < 50 ? U.lerp(0.8, 1, x / 50) : U.lerp(1, 1.25, (x - 50) / 50);
  }

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
      // a running jump (Trial 11: a rebounder's, from where they are to where the move is set, o.x, o.y): the body stays over its
      // feet through the load, pushes off toward it from ta to the take-off t0 (clip times), and carries on in the air at the
      // speed it took off with, over the spot at tg (where the hands meet the ball) and on until it lands at t1
      this.travel = o.travel || null;
    }
  }

  // the spine's two joints per axis (lumbar sp, thoracic ch): forward bend, side bend, twist
  const SPINE_AX = [['spFlex', 'chFlex'], ['spLat', 'chLat'], ['spTwist', 'chTwist']];
  /** when a foot last came down (a stride, a step or a landing) */
  const landedAt = (f) => Math.max(f.tPlant == null ? -9 : f.tPlant, f.tStep == null ? -9 : f.tStep);
  // spine and neck joints (a second, finer inertialization: see the constructor)
  const SPINE_INERT = ['spFlex', 'spLat', 'spTwist', 'chFlex', 'chLat', 'chTwist', 'nkFlex', 'nkLat', 'nkTwist', 'hdFlex', 'hdLat', 'hdTwist'].map(k => RG.CH[k]);
  // planted-leg hip channels the hip guard keeps in range
  const HG_KEYS = ['HipF', 'HipA'];
  // torso, neck and head channels (and the pose's hip shift) smoothed by inertialization
  const TORSO_INERT = ['rootX', 'rootY', 'pelPitch', 'pelRoll', 'pelTwist', 'spFlex', 'spLat', 'spTwist', 'chFlex', 'chLat', 'chTwist',
    'nkFlex', 'nkLat', 'nkTwist', 'hdFlex', 'hdLat', 'hdTwist'].map(k => RG.CH[k]);
  // (with the arms' authored channels: stance, clip and overlay poses never flip Euler branches, so smoothing them in
  // angle space is safe; the arms' IK is smoothed on its inputs, see _armTargets)
  const POSE_INERT = TORSO_INERT.concat(['ClvE', 'ClvP', 'ShF', 'ShA', 'ShT', 'ElF', 'Pro', 'WrF', 'WrD', 'Fing'].reduce((a, k) => a.concat([RG.CH['l' + k], RG.CH['r' + k]]), []));
  const POSE_INERT_LIN = { [RG.CH.rootX]: 0.02, [RG.CH.rootY]: 0.02, [RG.CH.lClvE]: 0.3, [RG.CH.rClvE]: 0.3, [RG.CH.lClvP]: 0.3, [RG.CH.rClvP]: 0.3, [RG.CH.lFing]: 0.3, [RG.CH.rFing]: 0.3 };
  const POSE_INERT_ARM = new Set(['ShF', 'ShA', 'ShT', 'ElF', 'Pro', 'WrF', 'WrD'].reduce((a, k) => a.concat([RG.CH['l' + k], RG.CH['r' + k]]), []));
  const GAIT_SMOOTH = ['beta', 'lift', 'reach', 'halfW', 'liftPow', 'drop', 'toePitch', 'heelOff', 'landPitch', 'roll', 'run'];
  const IDLE_SHIFT = { stand: 1, ready: 1, handsHips: 1, handsKnees: 0.5, holdChest: 1, triple: 0.6, refStand: 1 };
  // off-ball stances that turn and run when going somewhere, instead of shuffling there squared up to the ball
  const TURN_EARLY = { stand: 1, ready: 1, handsKnees: 1, handsHips: 1 };

  class Actor {
    constructor(view, look, team, kind) {
      this.uid = _uid++;
      this.view = view;
      this.look = look || {};
      this.id = this.look.id != null ? this.look.id : 'a' + this.uid;
      this.team = team;
      this.kind = kind || 'player';
      this.dims = RG.makeDims(this.look, this.kind);
      this.H = this.dims.H;
      this.sk = new RG.Skeleton(this.dims);
      const teamLook = view && view.teamLook ? view.teamLook(team) : null;
      this.style = M.Figure.makeStyle(this.look, teamLook, this.kind);
      this.lefty = this.look.hand === 'L';
      const r = (k, d) => U.clamp(((this.look[k] == null ? d : this.look[k]) - 25) / 74, 0, 1);
      this.rSpeed = r('speed', 70); this.rAgi = r('agility', 70); this.rVert = r('vert', 65); this.rHandle = r('handle', 55);
      // top speed 20-28 ft/s by rating (NBA tracking: game peaks ~22 ft/s, the fastest ~29), first-step push 16-24
      // ft/s^2, braking harder than that (players decelerate faster than they accelerate); all scaled by the Player
      // Speed live AI slider, which also scales how fast the director moves them (goalK)
      this.paceK = this.kind === 'ref' ? 1 : paceOf(view);
      // (every speed an order asks for, times this: Tune.urgency.baseK, and in a game its goalK, setUrgency)
      this.urgK = 1;
      this.goalK = this.kind === 'ref' ? 1 : M.Tune.urgency.baseK * this.paceK;
      this.maxSpeed = this.kind === 'ref' ? 16 : (20 + this.rSpeed * 8) * this.paceK;
      // (Trial 4: a heavier body pushes and turns less for its weight, Tune.weight)
      const TW = M.Tune.weight;
      this.mass = this.dims.mass || TW.refLb;
      this.kMass = Math.pow(this.mass / TW.refLb, TW.massExp);
      this.accel = (this.kind === 'ref' ? 12 : (16 + this.rAgi * 8) * this.paceK) * this.kMass;
      this.decel = this.accel * TW.decelRatio;
      this.turnAcc = TW.turnAccel * this.kMass * Math.pow(this.H / TW.refHeightFt, TW.turnHeightExp) * (0.85 + 0.3 * this.rAgi);
      this.acx = 0; this.acy = 0; this.faceW = 0;
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
      // (and the spine and neck on their own, catching the smaller jumps too: Tune.spine.jumpDeg)
      const TS = M.Tune.spine;
      this._inSpine = new RG.Inert(SPINE_INERT, SPINE_INERT.map(() => 1), SPINE_INERT.map(() => TS.jumpDeg * D), TS.jumpHalfLifeS, TS.jumpCoolS);
      // (and the pose's own pelvis height, before the legs' reach is worked out from it: Tune.weight.hipJumpH)
      this._inHip = new RG.Inert([CH.rootZ], [0], [M.Tune.weight.hipJumpH], M.Tune.weight.hipJumpS);
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
      this.lean = 0; this.leanF = 0; this.leanv = 0; this.leanFv = 0;
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
      this.x = x; this.y = y; this.vx = 0; this.vy = 0; this.speed = 0; this.acx = 0; this.acy = 0; this.faceW = 0;
      if (facing != null) { this.facing = facing; this.faceAngle = facing; }
      this.goal.mode = 'idle'; this.goal.x = x; this.goal.y = y;
      this.gaitOn = false; this.gaitK = 0;
      this.resetFeet();
      this._inT = null;
    }
    resetFeet() {
      const st = stanceOf(this, this.stance);
      for (const f of this.feet) {
        const o = f.side ? st.R : st.L;
        const c = Math.cos(this.facing), s = Math.sin(this.facing);
        const rx = s, ry = -c;
        f.x = this.x + rx * o[0] * this.H + c * o[1] * this.H;
        f.y = this.y + ry * o[0] * this.H + s * o[1] * this.H;
        f.yaw = this.facing + (f.side ? -1 : 1) * st.yaw * D;
        f.pitch = 0; f.state = 'plant'; f.planted = true; f.lp = 0; f.lpV = 0; f.reachP = 0; f.pvW = 0;
        // (nothing of a swing from before the placement is kept: its spot and aim are from somewhere else)
        const a = this._ankleFromBall(f.x, f.y, f.yaw, 0, TA);
        f.ax = a[0]; f.ay = a[1]; f.az = a[2]; f.tx = f.x; f.ty = f.y; f.swT = null; f.swLastT = null; f.pax = null;
      }
    }
    /** move to (x,y). o: {by (abs time), speed (cap), face ('move'|angle|{x,y}), stance, arrive(bool), brakeK (the share of
     *  their braking the arrival plans on, 0.8: a gentler stop starts braking sooner and is there stopped, Trial 11)} */
    moveTo(x, y, o) {
      o = o || {};
      if (this._rcHold(x, y)) return this;
      this._note('move');
      const g = this.goal;
      // (a standing turn gives way to a move: it fades out and the run starts from where the turn got to)
      if (this.clip && this.clip.autoTurn && !this.clip.ending && Math.hypot(x - this.x, y - this.y) > 0.8) this.stopClip();
      g.mode = 'move'; g.x = x; g.y = y;
      g.by = o.by == null ? null : o.by;
      g.speed = o.speed ? o.speed * this.goalK : this.maxSpeed * 0.85;
      g.arrive = o.arrive !== false;
      g.brakeK = o.brakeK || 0;
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
      if (this._rcHold(null, null)) return this;
      this._note('track');
      const g = this.goal;
      g.mode = 'track'; g.track = fn; g.speed = o.speed ? o.speed * this.goalK : this.maxSpeed; g.arrive = true; g.by = null; g.pace = 0;
      if (o.face !== undefined) this.setFace(o.face);
      if (o.stance) this.setStance(o.stance);
      return this;
    }
    /** a pass in the air to him (Trial 10): he keeps going to where it was thrown to him, and an order to go somewhere
     *  else (x, y; null: follow something) more than Tune.pass.holdFt off it waits for the catch (it is dropped: the
     *  catch gives him his next job). Sent off elsewhere mid-flight, a receiver ran away from the ball, caught ~2-5 ft
     *  from his hands */
    _rcHold(x, y) {
      const rc = this._rc, b = this.view && this.view.ball;
      if (!rc || !rc.ball || rc.caught != null || !rc.C || !b || b.state !== 'flight' || b.passTarget !== this) return false;
      if (x != null && Math.hypot(x - rc.C[0], y - rc.C[1]) <= M.Tune.pass.holdFt) return false;
      rc.held = (rc.held || 0) + 1;
      return true;
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
      // (a man dribbling is never upright: a stance for standing around becomes the dribble's, Trial 8; standing tall, the
      // dribble's catch was out of his arm's reach)
      if (this.dribble && this.hasBall && !DRIB_STANCES.has(name)) name = 'dribble';
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
    /** where the eyes go (a point {x, y, z?} or an actor; null: nowhere in particular). o.hold (s): nothing else moves
     *  them for that long, save another held look (Trial 10: the offense's spacing and paths turned a receiver's eyes to
     *  where the ball had been, flat on the floor, or to nothing, every step while the pass was in the air to him) */
    lookAt(p, o) {
      const t = this.time || 0, h = this._lkHold;
      if (o && o.hold > 0) this._lkHold = { p, until: t + o.hold };
      else if (h && t < h.until && p !== h.p) return;
      this.look_ = p;
    }
    /** a contest (Trial 11): the hand nearer the ball goes up at the shooter's release point (o.sh: where their shot lets the
     *  ball go, Actor.releasePoint; without them, at the ball), along the line from its shoulder, as far as the arm reaches and
     *  never onto it (Tune.glass.contestGapFt short of it), and stays up where the ball left their hands; up over
     *  Tune.glass.contestLeadS before tRel, held contestHoldS after, then let down. (It used to follow the ball itself, through
     *  the shooter's dip and push and on up after it in the air at ~25 ft/s, and the arm popped.) o: { sh, lead, hold, both
     *  (both hands: verticality at the rim), at (a point in the world to go up at instead: a late contest, where the ball will be
     *  as the hand gets there) } */
    contestBall(b, tRel, o) {
      o = o || {};
      const TG = M.Tune.glass, side = o.side != null ? o.side : this.contestSide(b);
      this._contest = { b, sh: o.sh || null, at: o.at || null, fr: null, t1: tRel, lead: o.lead || TG.contestLeadS, hold: o.hold != null ? o.hold : TG.contestHoldS, sides: o.both ? [0, 1] : [side] };
    }
    /** where the ball leaves their hands in the shot they are in: the move's ball at its release, the body where the move has it
     *  then, up in its jump; not in a shot, over their head. out: [x, y, z] */
    releasePoint(out) {
      const cs = this.clip, ev = cs && cs.clip.events, H = this.H;
      if (cs && ev && ev.release != null && cs.clip.ballKeys && cs.t <= ev.release + 1e-6) {
        const tr = ev.release, bk = cs.clip.ballKeys;
        const bx = (cs.mirror ? -1 : 1) * bk[0](tr) * H, by = bk[1](tr) * H, bz = bk[2](tr) * H;
        const yaw = this._clipRoot(cs, Math.min(tr, cs.clip.dur)).yaw, r = this.clipBodyAt(cs, tr, RP2);
        const c = Math.cos(yaw), sn = Math.sin(yaw);
        out[0] = r.x + sn * bx + c * by; out[1] = r.y - c * bx + sn * by; out[2] = bz + this._clipJumpZ(cs, tr);
        // (a finish reaching the ball up to the rim ends there, as far as the arm goes: heldBallPos)
        const rc = cs.reach;
        if (rc && rc.t1 != null) {
          const k = tr <= rc.t0 ? 0 : tr >= rc.t1 ? 1 : U.smooth((tr - rc.t0) / Math.max(0.01, rc.t1 - rc.t0));
          if (k > 0.001) { const tg = this._reachClamp(rc.x, rc.y, rc.z, cs.mirror ? 0 : 1, 0.1 * H, RT2); for (let i = 0; i < 3; i++) out[i] += (tg[i] - out[i]) * k; }
        }
        return out;
      }
      out[0] = this.x; out[1] = this.y; out[2] = (this.jumpZ || 0) + 1.25 * H;
      return out;
    }
    /** the hand on the ball's side (1 the right, 0 the left): the one whose shoulder is nearer it */
    contestSide(b) {
      const P = this.sk.P, J = RG.J, dl = (j) => Math.hypot(P[j * 3] - b.x, P[j * 3 + 1] - b.y, P[j * 3 + 2] - b.z);
      return dl(J.R_SH) <= dl(J.L_SH) ? 1 : 0;
    }
    /** meant to be in contact with b now (Trial 11: a box-out, the boxer's back into their man; set on either, until a time) */
    touching(b) {
      const t = this.time || 0, c = this._contact, d = b && b._contact;
      return !!((c && c.with === b && t < c.until) || (d && d.with === this && t < d.until));
    }
    /** reach for a ball in the air or on the floor (Trial 11: a rebound, a long rebound's catch, a loose ball's pick-up, a
     *  block, a tip): the hands go onto it where it is, on its sides as a hold has them (over it above the head), over the
     *  last o.lead (Tune.glass.reachS) before tTake, and stay on it until it is taken or o.until. o: { hands: [0, 1] or one
     *  side, lead (s), until (s), touch (the palm onto the near side of it: a block, a poke, a tip), other (a ball in someone
     *  else's hands or dribble: reached for all the same) } */
    reachFor(b, tTake, o) {
      o = o || {};
      const TG = M.Tune.glass;
      this._reach = { b, t1: tTake, lead: o.lead || TG.reachS, until: o.until != null ? o.until : tTake + TG.takeLateS + 0.1, hands: o.hands || [0, 1], w: o.w == null ? 1 : o.w, touch: !!o.touch, other: !!o.other };
    }
    /** a pass is coming (Trial 10), from the moment the passer commits to it (the choreographer: as the passer turns to
     *  the catch spot): the hands come up in front of the chest toward the passer as a target, the eyes on the passer.
     *  o: { kind } */
    expectPass(from, o) {
      const rc = this._rc;
      if (rc && rc.from === from && !rc.caught) { if (o && o.kind) rc.kind = o.kind; return; }
      this._rc = { from, kind: (o && o.kind) || 'chest', t0: this.time || 0, ball: null, tEnd: null, P: null, caught: null, exp: true };
      // (the hands free for it, the gameplay pass: out of a box-out's or a screen's arms into the ready stance; an outlet's man
      // ran up the floor for it with his arms still spread from the box-out under the other basket)
      if (!this.clip && (this.stance === 'boxout' || this.stance === 'screen')) { this._contact = null; this.setStance('ready'); }
      if (!this.look_) this.lookAt(from);
      // (standing, he turns to the passer now: turned only as the ball came, a man facing away was still turning, and
      // stepping round, as it got to him)
      const g = this.goal;
      if (!this.clip && this.speed < 2 && (!g || g.mode === 'idle' || Math.hypot(g.x - this.x, g.y - this.y) < 0.6)) this.setFace({ x: from.x, y: from.y, passer: true });
    }
    /** the ball is in the air to him (Trial 10, from Director.passBall): it gets to the catch point P (world) at tEnd; the
     *  eyes follow it and the hands go to where it will be, there before it is. o: { from, kind, tEnd, P, rel (where it
     *  left the passer's hands) } */
    receive(b, o) {
      let rc = this._rc;
      if (!rc || rc.from !== o.from || rc.caught) rc = this._rc = { from: o.from, t0: this.time || 0 };
      rc.kindE = rc.kind; rc.ball = b; rc.kind = o.kind || 'chest'; rc.tEnd = o.tEnd; rc.P = [o.P[0], o.P[1], o.P[2]]; rc.rel = [o.rel[0], o.rel[1]];
      rc.C = o.C ? [o.C[0], o.C[1]] : null; rc.Cs = rc.C ? [rc.C[0], rc.C[1]] : null; rc.cpT = null; rc.g = o.g || null;
      // (where the ball really ends up against where it was planned to: the passer's hands let it go a little off the planned
      // release point, the whole flight with it, ~0.3 ft; the hands wait there from the start rather than go over late)
      const pe = b.segs ? b.posAt(o.tEnd, RT3) : null;
      rc.Ep = pe ? [pe[0] - o.P[0], pe[1] - o.P[1], pe[2] - o.P[2]] : [0, 0, 0];
      rc.tRel = this.time || 0; rc.caught = null; rc.runOn = !!o.runOn; rc.E = null;
      // (the eyes on the ball a moment ahead of it, where it is going: they lag it by as much, see _rcStep)
      rc.eye = { x: b.x, y: b.y, z: b.z };
      this.lookAt(rc.eye, { hold: Math.max(0.05, o.tEnd - (this.time || 0)) + 0.05 });
    }
    /** once a step: the pass still coming to him (or caught a moment ago), the step toward it */
    _rcStep() {
      const rc = this._rc;
      if (!rc) return;
      const T = M.Tune.pass, t = this.time || 0, b = this.view && this.view.ball;
      if (rc.caught != null) { if (t - rc.caught > T.afterS) this._rc = null; return; }
      if (b && b.holder === this && rc.ball) { rc.caught = t; return; }
      // (the pass went to someone else, was knocked away, or never came)
      if (rc.ball ? !(b && b.state === 'flight' && b.passTarget === this) : t - rc.t0 > 2.5 || (b && b.holder === this)) { this._rc = null; return; }
      if (rc.eye && b.segs) {
        // (as he will see it: where it will be against where he will be by then, so a man running on past the catch point
        // keeps it in view; looked at in the world, a cutter's head was left ~40 deg behind a catch point he ran up to)
        const te = Math.min(rc.tEnd, t + T.eyeLeadS), q = b.posAt(te, RT3), ld = Math.max(0, te - t);
        rc.eye.x = q[0] - (this.vx || 0) * ld; rc.eye.y = q[1] - (this.vy || 0) * ld; rc.eye.z = q[2];
      }
    }
    /** where the hands take the ball (Trial 10): the catch point relative to a body at (x, y) with the ball coming from
     *  (fx, fy), for a pass of this kind (out in front toward it, at chest height; a bounce pass lower, a lob higher). A body
     *  facing `facing` (running on, a ball from behind) takes it out to the side, no further round than catchSideDeg */
    catchPoint(x, y, fx, fy, kind, out, facing, sideDeg, trk) {
      const T = M.Tune.pass, H = this.H;
      let a = Math.atan2(fy - y, fx - x);
      if (facing != null) {
        const m = (sideDeg || T.catchSideDeg) * D;
        let r = U.wrapPi(a - facing);
        if (Math.abs(r) > m) r = Math.sign(r) * m;
        a = trk ? this._rcSide(trk, facing, r) : facing + r;
      }
      const z = kind === 'bounce' || kind === 'entry' ? T.catchZBounceH : kind === 'lob' || kind === 'alley' ? T.catchZLobH : T.catchZH;
      out[0] = x + Math.cos(a) * T.catchFwdH * H; out[1] = y + Math.sin(a) * T.catchFwdH * H; out[2] = (this.jumpZ || 0) + z * H;
      return out;
    }
    /** the target hands' way round (Trial 10): the world angle they are shown at for a body facing f, wanted r round from
     *  it (within the side limit), as kept in trk. It goes with the way to the passer as that moves, but a jump (the passer
     *  crossing behind a turning man, from one side's limit to the other's; the limit itself, running on or not) is swung
     *  round the front at a limited rate, Tune.pass.sideDps and sideDps2: taken at once, the hands went from one side of
     *  the body to the other in a frame, ~4 ft */
    _rcSide(trk, f, r) {
      const T = M.Tune.pass, t = this.time || 0, aw = f + r;
      let s = trk.side;
      if (!s) s = trk.side = { a: aw, v: 0, aw, t };
      const dt = t - s.t;
      if (dt > 0 && dt < 0.12) {
        const dw = U.wrapPi(aw - s.aw);
        if (Math.abs(dw) < T.sideJumpDeg * D) s.a += dw;
        s.aw = aw;
        // (what is left, round the front: both measured from the facing, the one shown where the body's turn has left it)
        const e = r - U.wrapPi(s.a - f), A = T.sideDps2 * D, ae = Math.abs(e);
        const vd = Math.sign(e) * Math.min(T.sideDps * D, Math.sqrt(2 * A * ae), ae / dt);
        s.v += U.clamp(vd - s.v, -A * dt, A * dt);
        let st = s.v * dt;
        if (st * e > 0 && Math.abs(st) > ae) { st = e; s.v = e / dt; }
        s.a = U.wrapPi(s.a + st); s.t = t;
      } else if (dt !== 0) { s.a = s.aw = aw; s.v = 0; s.t = t; }
      return s.a;
    }
    /** the way the body will face at a catch it runs on through: its run (a runner's facing follows it), else null */
    _runFacing(vx, vy) { return Math.hypot(vx, vy) > M.Tune.pass.runOnFtps && (this.faceMode === 'move' || this._runMode) ? Math.atan2(vy, vx) : null; }
    /** remember why the director last told him to do something (the debug state label shows it) */
    _note(what) {
      const d = this.view && this.view.director, w = d && d._why;
      if (w) this.intent = { why: w, what, t: this.time };
    }

    /**
     * play a clip. o: {x,y,facing (origin; default current), mirror, speed, onEvent(name, actor), hold, fadeIn, fadeOut, jumpH, data}
     */
    play(name, o) {
      const clip = typeof name === 'string' ? A.get(name) : name;
      if (!clip) return null;
      this._note(clip.name || 'move');
      // reaching for the ball commits the body: a lunge onto the front foot toward it, the off arm back for balance,
      // and back out; the man with the ball protects it
      if (clip.name === 'swipe' && this.kind === 'player') {
        const b = this.view && this.view.ball, bh = b && b.holder && b.holder !== this ? b.holder : null;
        const tx = bh ? bh.x : b ? b.x : this.x + Math.cos(this.facing), ty = bh ? bh.y : b ? b.y : this.y + Math.sin(this.facing);
        this._lunge = { t: this.time, a: Math.atan2(ty - this.y, tx - this.x), stepped: false };
        if (bh && Math.hypot(bh.x - this.x, bh.y - this.y) < 7 && bh.protectBall) bh.protectBall(this.x, this.y, 0.08);
      }
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
        this.goal.mode = 'idle';
        // (its root's speed at the start against the body's own that way: much faster, and its clock starts slow)
        if (clip.rootKeys) {
          const q0 = this._clipRoot(cs, cs.t), x0 = q0.x, y0 = q0.y, q1 = this._clipRoot(cs, cs.t + 0.03);
          const ux = (q1.x - x0) / 0.03, uy = (q1.y - y0) / 0.03, vc = Math.hypot(ux, uy);
          const vin = vc > 1e-3 ? (this.vx * ux + this.vy * uy) / vc : 0;
          if (vc > Math.max(0, vin) + M.Tune.weight.clipWarpFtps) cs.warp0 = U.clamp((Math.max(0, vin) + M.Tune.weight.clipWarpFtps) / vc, 0.25, 1);
        }
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
    /** a retreat dribble (Trial 8): two or three dribbles straight back from the nearest man on the other team (or
     *  back, with nobody near), turned side-on with the dribbling shoulder away from him, the ball low beside the back
     *  knee, the off arm barred toward him (coaching: the escape dribble). o.dist (ft) */
    retreat(o) {
      o = o || {};
      const b = this.view && this.view.ball, TH = M.Tune.handle;
      if (!(b && b.state === 'dribble' && b.dr && b.dr.actor === this)) return false;
      // (with the ball in his hand: asked for while it is in the air, the step back waits for the catch, a bounce at most;
      // taken at once, the drop step's knee came up into the ball rising to the hand, Trial 8)
      const ph = this.dribble && this.dribble.ph;
      if (ph === 'down' || ph === 'up') { this._retreatWait = o; return true; }
      this._retreatWait = null;
      let dfd = null, bd = 1e9;
      const v = this.view;
      if (v.onCourt && v.actors && this.team >= 0) for (const id of v.onCourt[1 - this.team] || []) { const q = v.actors[id]; if (!q) continue; const dd = Math.hypot(q.x - this.x, q.y - this.y); if (dd < bd) { bd = dd; dfd = q; } }
      let ax = -Math.cos(this.facing), ay = -Math.sin(this.facing);
      if (dfd && bd < 12) { ax = (this.x - dfd.x) / (bd || 1); ay = (this.y - dfd.y) / (bd || 1); }
      const dist = o.dist || TH.retreatFt, toD = Math.atan2(-ay, -ax);
      this.moveTo(this.x + ax * dist, this.y + ay * dist, { speed: TH.retreatFtps, face: toD + (b.dr.hand ? -1 : 1) * TH.retreatTurnDeg * D, stance: 'dribble' });
      this._retreat = { t: this.time || 0, dur: dist / TH.retreatFtps + 0.25 };
      return true;
    }
    /** how far into a retreat dribble he is, 0 to 1 (eased in and out) */
    _retreatK() {
      const r = this._retreat;
      if (!r) return 0;
      const t = (this.time || 0) - r.t;
      if (t > r.dur + 0.3) { this._retreat = null; return 0; }
      return U.smooth(t / 0.15) * (1 - U.smooth((t - r.dur) / 0.3));
    }
    /** a hesitation (Trial 8): the body rises and the eyes come up (the 'hesi' clip) while the dribble floats up higher
     *  and slower into the hand, then a low quick bounce goes with the burst (coaching: slow the dribble, raise up a
     *  little, look up to sell it, then explode with the ball pushed out in front) */
    hesitate() {
      const b = this.view && this.view.ball;
      if (b && b.state === 'dribble' && b.dr && b.dr.actor === this && !b.dr.move && !b.dr.pendingMove) {
        b.dribbleMove('hesi');
        // (the clip raises the body: the pose a combo's hesitation rises with stays out of it)
        if (b.dr.pendingMove) b.dr.pendingMove.withClip = true;
      }
      return this.play('hesi');
    }
    /** in the middle of throwing the ball (an upper-body pass clip before it ends): not a time to start dribbling it
     *  (Trial 8: the pass windup picked the dribble up and the rule "the holder dribbles when moving" put it straight back
     *  down in the same frame, the throw then made from the dribble) */
    throwing() { const u = this.upper; return !!(u && !u.ending && u.clip.events && u.clip.events.release != null); }
    /** a body contact: pushed along (nx, ny) with `speed` ft/s of the closing speed. The body is knocked a little off
     *  its line and thrown off balance (the torso goes with the push, the arms come out, the head lags), then he
     *  recovers; in the air too, where it does not stop the shot, only how it looks getting there */
    impact(nx, ny, speed) {
      if (!(speed > 3)) return;
      const s = Math.min(speed, 12), h = this.hit;
      if (h && h.t < 0.2 && h.s >= s) return;
      // (how much it shows: a brush barely, a real collision clearly; up to ~0.5 ft off his line)
      const air = (this.jumpZ || 0) > 0.15;
      this.hit = { nx, ny, s, k: U.smooth((s - 2.5) / 7), t: 0, air };
      // knocked hard enough, he has to catch his balance: a quick step the way he was pushed (in the air, when he
      // comes down)
      // (not leaning on a man on purpose, a box-out, a post-up or a screen, where the bodies push all the time)
      const lean = this.stance === 'boxout' || this.stance === 'postD' || this.stance === 'postUp' || this.stance === 'screen';
      if (s > 6.5 && !lean && (air || !this.clip)) this._stumble = { nx, ny, k: U.smooth((s - 6) / 6), t: air ? null : this.time + 0.06 };
    }
    /** a defender reaching for the ball: he protects it, the near shoulder turned into the reach and the ball pulled
     *  away to the far side and down (a dribble drops toward the knees), the head up to see the reach; ~0.6 s.
     *  Dribbling, the off shoulder turns into the reach instead and the off arm comes up as a bar against it */
    protectBall(fx, fy, delay) {
      if (!this.hasBall) return;
      const rel = U.wrapPi(Math.atan2(fy - this.y, fx - this.x) - this.facing);
      let t = this.time + (delay || 0);
      // dribbling, a reach at the ball side takes the ball away from it first: a quick crossover to the other hand,
      // between the legs when he is close in front (the legs guard it), so the other arm is between him and the ball
      // (an off arm can't bar a reach on the far side of the body)
      const b = this.view && this.view.ball, d = b && b.dr && b.dr.actor === this ? b.dr : null;
      if (d && !d.move && !d.pendingMove && Math.abs(rel) < 2.2 && (d.hand ? rel < 0.15 : rel > -0.15)) {
        const dist = Math.hypot(fx - this.x, fy - this.y);
        b.dribbleMove(dist < 5.5 && Math.abs(rel) < 0.6 ? 'btl' : 'cross', { period: 0.3, urgent: true });
        t += 0.12;
      }
      // (a reach from behind gets the body turned, not the ball swung round in front)
      this._protect = { t, sgn: rel >= 0 ? 1 : -1, k: 1 - 0.6 * U.smooth((Math.abs(rel) - 2.2) / 0.6), fx, fy, rel };
    }
    _protectK() {
      const pr = this._protect;
      if (!pr) return 0;
      const t = this.time - pr.t;
      if (t > 0.7) { this._protect = null; return 0; }
      return t < 0 ? 0 : U.smooth(t / 0.1) * (1 - U.smooth((t - 0.4) / 0.3)) * pr.k;
    }
    /**
     * pivot to face `angle` on a planted foot (a face-up after a catch, the post turn): the pivot foot keeps its spot
     * and turns on its ball, the body swings around it and the free foot steps around (two steps for a big turn, so
     * it never crosses the pivot foot). Turning left pivots on the left foot, right on the right. The ball stays in
     * the triple threat at the hip. Returns false when the turn is small enough to just face that way
     */
    pivotTo(angle, o) {
      o = o || {};
      const delta = U.wrapPi(angle - this.facing);
      if (Math.abs(delta) < 0.55) { this.setFace(angle); return false; }
      const side = delta > 0 ? 0 : 1; // turning left: pivot on the left foot
      const pf = this.feet[side], ff = this.feet[1 - side];
      if (pf.state !== 'plant' || ff.state === 'air') { this.setFace(angle); return false; }
      const c = Math.cos(this.facing), s = Math.sin(this.facing);
      const loc = (x, y) => [(x - this.x) * c + (y - this.y) * s, (x - this.x) * s - (y - this.y) * c]; // [fwd, lat]
      const P = loc(pf.x, pf.y), F0 = loc(ff.x, ff.y);
      // rotate a clip-frame point about the pivot by phi (+ = left): in (fwd, lat), a left turn takes fwd toward -lat
      const rot = (q, phi) => { const dx = q[0] - P[0], dy = q[1] - P[1], cp = Math.cos(phi), sp = Math.sin(phi); return [P[0] + dx * cp + dy * sp, P[1] - dx * sp + dy * cp]; };
      const dur = 0.2 + 0.26 * Math.abs(delta) / Math.PI * (1.15 - 0.3 * (this.rAgi || 0.5));
      const n = 4, root = [], yaw = [];
      for (let i = 0; i <= n; i++) {
        const u = i / n, ue = U.smooth(u), phi = delta * ue;
        const r = rot([0, 0], phi);
        root.push([dur * u, r[0], r[1]]);
        yaw.push([dur * u, phi / D]);
      }
      root.push([dur + 0.12, root[n][1], root[n][2]]); yaw.push([dur + 0.12, delta / D]);
      const big = Math.abs(delta) > 2.0;
      const steps = [];
      const fSide = side ? 'l' : 'r';
      if (big) {
        const m = rot(F0, delta * 0.5), e = rot(F0, delta);
        steps.push({ t0: 0.03, t1: dur * 0.5, foot: fSide, to: m, yaw: delta * 0.5 / D, lift: 0.05 });
        steps.push({ t0: dur * 0.52, t1: dur, foot: fSide, to: e, yaw: delta / D, lift: 0.05 });
      } else {
        steps.push({ t0: 0.03, t1: dur, foot: fSide, to: rot(F0, delta), yaw: delta / D, lift: 0.06 });
      }
      const noBall = o.ball === false;
      const hold0 = noBall ? this.stance : o.hold || 'triple';
      const hold = noBall ? (A.STANCE[hold0] || A.STANCE.stand).pose : this.lefty && HANDED[hold0] ? HANDED[hold0] : hold0, bm = this.lefty ? -1 : 1;
      const tw = delta > 0 ? 1 : -1;
      const clip = A.buildClip({
        name: noBall ? 'turn' : 'pivot', dur: dur + 0.12, events: {}, root, yaw, steps,
        pivot: { side, t0: 0, t1: dur + 0.12 },
        // (the whole body goes round together: the head and shoulders a little ahead, the hips with the feet)
        keys: noBall ? [
          { t: 0, p: hold },
          { t: dur * 0.5, p: { base: hold, rootZ: -0.04, chTwist: tw * 9, nkTwist: tw * 12, hdTwist: tw * 4 } },
          { t: dur + 0.12, p: hold },
        ] : [
          { t: 0, p: hold, ball: [0.13 * bm, 0.2, 0.53], grip: this.lefty ? 'hipL' : 'hip' },
          { t: dur * 0.5, p: { base: hold, rootZ: -0.06, chTwist: tw * 12, nkTwist: tw * 10 }, ball: [0.13 * bm, 0.21, 0.55], grip: this.lefty ? 'hipL' : 'hip' },
          { t: dur + 0.12, p: hold, ball: [0.13 * bm, 0.2, 0.53], grip: this.lefty ? 'hipL' : 'hip' },
        ],
      });
      if (!noBall) this.ballHold = 'triple';
      // (built for this player's own feet and turn: never mirrored for a lefty)
      const cs = this.play(clip, { x: this.x, y: this.y, facing: this.facing, fadeIn: 0.08, mirror: false });
      if (cs && noBall) { cs.autoTurn = true; cs.onEnd = () => { this.setStance(hold0); }; }
      else if (cs) cs.onEnd = () => { this.setStance(hold0); this.setFace(o.faceAfter != null ? o.faceAfter : angle); };
      return !!cs;
    }
    /**
     * The spin move off the dribble, built for this player's own feet (no canned motion): a hard plant of the foot on
     * the far side from the ball (a right-hand dribble plants the left foot) in front of his man, a reverse pivot on
     * the ball of that foot with his back into him (the free leg whips around behind on an arc, the off arm tucked in
     * so the turn is quick, the head leading), then a second pivot on the foot that just landed while the first swings
     * through and he comes out past his man, low; the ball is pulled tight to the hip with the hand on top through the
     * first half turn, then bounced across to the other hand at about 180 degrees.
     * o: { exitFacing (default: the facing now, a full turn), onEnd }. Returns the clip state (null: not now).
     */
    spinMove(o) {
      o = o || {};
      const b = this.view && this.view.ball;
      const dr = b && b.dr && b.dr.actor === this ? b.dr : null;
      const hand = dr ? dr.hand : (this.lefty ? 0 : 1);
      // built for a right-hand dribble (plant the left foot, turn right: clockwise from above); a left-hand one is
      // its mirror image
      const mir = hand === 0, m = mir ? -1 : 1;
      const Lg = this.dims.th + this.dims.sh;
      const f0 = this.facing, c = Math.cos(f0), s = Math.sin(f0);
      // [fwd, lat (+ = right)] of a world point in the right-hand build
      const loc = (x, y) => [(x - this.x) * c + (y - this.y) * s, m * ((x - this.x) * s - (y - this.y) * c)];
      // rotate a build-frame point q about p by phi (+ = left, counter-clockwise from above)
      const rot = (q, p, phi) => { const dx = q[0] - p[0], dy = q[1] - p[1], cp = Math.cos(phi), sp = Math.sin(phi); return [p[0] + dx * cp + dy * sp, p[1] - dx * sp + dy * cp]; };
      // keep a foot's landing spot at a stride's distance from the foot it turns around
      const reach = (q, p, lo, hi) => { const dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1, k = U.clamp(l, lo, hi) / l; return [p[0] + dx * k, p[1] + dy * k]; };
      const fr = this.feet[mir ? 0 : 1]; // the free foot (the right in the build)
      const quick = this._spinQuick();
      const tA = 0.15, dB = 0.3 * quick, dC = 0.26 * quick;
      const tB = tA + dB, tC = tB + dC, dur = tC + 0.16;
      // the whole turn: a full circle back to the facing he had, or round to exitFacing (clockwise in the build)
      const exitRel = o.exitFacing != null ? U.wrapPi(o.exitFacing - f0) * m : 0;
      const turn = -2 * Math.PI + U.clamp(exitRel, -0.5, 0.9);
      // the hips over the foot he stands on: the pelvis centre sits about a hip's width to the inside of it
      const hw = 0.85 * this.dims.hipX;
      const inside = (foot, ph, sgn) => [foot[0] + sgn * hw * Math.sin(ph) - 0.06 * Lg * Math.cos(ph), foot[1] + sgn * hw * Math.cos(ph) + 0.06 * Lg * Math.sin(ph)];
      // 1. the plant: the left foot lands ahead and a little across, in front of his man, as the body brakes onto it
      const v0 = Math.min(this.speed, 14), ph0 = -8 * D;
      const P = [0.26 * Lg + 0.1 * v0, -0.05 * Lg];
      // (the foot lands ahead of the hips, which are still coming on, braking, as it plants)
      const R1 = [0.85 * v0 * tA, 0.02 * Lg];
      // 2. the reverse pivot: the right foot swings around behind him to the far side of the pivot
      const q0 = fr.state === 'swing' && fr.tx != null ? loc(fr.tx, fr.ty) : loc(fr.x, fr.y);
      const F1 = reach(rot(q0, P, -Math.PI), P, 0.3 * Lg, 0.44 * Lg);
      // 3. the second pivot, on the right foot: the left swings through past his man
      const F2 = reach(rot(P, F1, turn + Math.PI), F1, 0.32 * Lg, 0.48 * Lg);
      const ease = (u) => u * u * (3 - 2 * u);
      const root = [[0, 0, 0]], yaw = [[0, 0]];
      root.push([tA, R1[0], R1[1]]); yaw.push([tA, ph0 / D]);
      const mid1 = [(P[0] + F1[0]) / 2, (P[1] + F1[1]) / 2], mid2 = [(F1[0] + F2[0]) / 2, (F1[1] + F2[1]) / 2];
      const n1 = 8, n2 = 8;
      let last = R1;
      // (on one foot the hips circle it closely; as the other foot lands the weight moves across between the two)
      for (let i = 1; i <= n1; i++) {
        const u = i / n1, ph = ph0 + (-Math.PI - ph0) * ease(u);
        const q = inside(P, ph, 1), d0 = 1 - U.smooth(u / 0.35), dk = U.smooth((u - 0.45) / 0.55) * 0.5;
        const r0 = [q[0] + (R1[0] - q[0]) * d0, q[1] + (R1[1] - q[1]) * d0];
        last = [r0[0] + (mid1[0] - r0[0]) * dk, r0[1] + (mid1[1] - r0[1]) * dk];
        root.push([tA + dB * u, last[0], last[1]]); yaw.push([tA + dB * u, ph / D]);
      }
      const R2 = last;
      for (let i = 1; i <= n2; i++) {
        const u = i / n2, ph = -Math.PI + (turn + Math.PI) * ease(u);
        const q = inside(F1, ph, -1), d0 = 1 - U.smooth(u / 0.5), dk = U.smooth((u - 0.45) / 0.55) * 0.5;
        const r0 = [q[0] + (R2[0] - q[0]) * d0, q[1] + (R2[1] - q[1]) * d0];
        last = [r0[0] + (mid2[0] - r0[0]) * dk, r0[1] + (mid2[1] - r0[1]) * dk];
        root.push([tB + dC * u, last[0], last[1]]); yaw.push([tB + dC * u, ph / D]);
      }
      // 4. out of it: the momentum carries him on toward where he now faces
      const fe = [Math.cos(turn), -Math.sin(turn)];
      root.push([dur, last[0] + fe[0] * 0.75, last[1] + fe[1] * 0.75]); yaw.push([dur, turn / D]);
      const steps = [
        { t0: 0, t1: tA, foot: 'l', to: P, yaw: -2, lift: 0.035 },
        { t0: tA + 0.02, t1: tB - 0.015, foot: 'r', to: F1, yaw: -188, lift: 0.075, arc: { at: P, dir: -1 } },
        { t0: tB + 0.01, t1: tC - 0.015, foot: 'l', to: F2, yaw: turn / D + 8, lift: 0.06, arc: { at: F1, dir: -1 } },
      ];
      // the body: low through it, the head and shoulders leading the turn, the off arm tucked in to spin fast, then
      // out to the side for balance and to protect the ball in the other hand
      const low = { base: 'dribbleLow' };
      const K = (t, o2) => ({ t, p: Object.assign({}, low, o2) });
      const keys = [
        K(0, {}),
        K(tA, { rootZ: -0.155, pelPitch: 27, spFlex: 5, chTwist: -8, nkTwist: -14, lShF: 26, lShA: 18, lShT: 6, lElF: 100, lPro: 70 }),
        K(tA + dB * 0.5, { rootZ: -0.15, pelPitch: 23, spFlex: 3, chTwist: -18, nkTwist: -34, hdTwist: -8, lShF: 20, lShA: 14, lShT: 4, lElF: 106, lPro: 72 }),
        K(tB, { rootZ: -0.145, pelPitch: 22, spFlex: 3, chTwist: -14, nkTwist: -30, hdTwist: -6, lShF: 22, lShA: 16, lShT: 4, lElF: 104, lPro: 70 }),
        K(tB + dC * 0.5, { rootZ: -0.145, pelPitch: 24, spFlex: 4, chTwist: -8, nkTwist: -18, rShF: 24, rShA: 16, rShT: 4, rElF: 100, rPro: 70, lShF: 36, lShA: 26, lElF: 80 }),
        K(tC, { rootZ: -0.14, pelPitch: 28, spFlex: 6, chTwist: 4, nkTwist: 0, rShF: 38, rShA: 42, rShT: -8, rElF: 62, rPro: 62 }),
        K(dur, {}),
      ];
      const clip = A.buildClip({
        name: 'spinMove', dur, events: { plant: tA, turn: tB, out: tC }, root, yaw, steps, keys,
        pivots: [{ side: 0, t0: tA, t1: tB }, { side: 1, t0: tB, t1: tC }],
        turnRate: 40, offArm: 1, keepV: 1,
      });
      const cs = this.play(clip, { x: this.x, y: this.y, facing: f0, fadeIn: 0.1, mirror: mir, onEvent: o.onEvent });
      if (!cs) return null;
      // the ball: taken on top as it comes up, pulled to the hip, then across to the other hand as he comes around
      if (dr) b.spinPull(tA + dB * 0.62, 0.34);
      cs.onEnd = () => {
        this.setStance('dribble');
        // out of it he keeps going: on to the spot given, else a couple of steps on the way he now faces
        const ex = o.exitTo || { x: this.x + Math.cos(this.facing) * 6, y: this.y + Math.sin(this.facing) * 6 };
        if (!o.stay) this.moveTo(ex.x, ex.y, { speed: o.exitSpeed || 9, stance: 'dribble' });
        if (o.onEnd) o.onEnd(this);
      };
      return cs;
    }
    /**
     * A jump stop off a run or a drive, built for this player's own speed: a small hop off the last step (~0.16 s in
     * the air, barely off the floor) and both feet land together, about shoulder width apart and a touch staggered,
     * out ahead of the hips so the legs brake the body; the knees give, the hips sink and stay back, chest up and
     * balanced over the feet (not leaning in), the ball chinned if he has it (a dribble is picked up on the hop).
     * Then he settles into the stance, free to pivot on either foot.
     * o: { faceTo: {x, y} (turns toward it in the air, up to ~60 deg), stance (after it; default holdChest with the
     * ball, ready without), onEnd }. Returns the clip state (null: not now).
     */
    jumpStop(o) {
      o = o || {};
      const b = this.view && this.view.ball;
      const has = !!(b && b.holder === this);
      const v = U.clamp(this.speed, 3, 16), H = this.H, Lg = this.dims.th + this.dims.sh;
      const f0 = this.facing, c = Math.cos(f0), s = Math.sin(f0);
      // the way he is going, in the clip's frame [fwd, lat (+ = right)]
      const ux = this.speed > 0.5 ? this.vx / this.speed : c, uy = this.speed > 0.5 ? this.vy / this.speed : s;
      const mf = ux * c + uy * s, ml = ux * s - uy * c;
      // the last push (on at speed), the hop (a little slower in the air), the brake onto both feet (to a stop in
      // ~0.2 s, ~2 g from a 12 ft/s drive) and the settle
      const tA = 0.08, tB = tA + 0.16, tC = tB + 0.2, dur = tC + 0.22;
      const dA = v * tA, dB = dA + 0.9 * v * 0.16, dC = dB + 0.8 * v * 0.2 * 0.5;
      const along = (d) => [mf * d, ml * d];
      const turn = o.faceTo ? U.clamp(U.wrapPi(Math.atan2(o.faceTo.y - this.y, o.faceTo.x - this.x) - f0), -1.05, 1.05) : 0;
      const root = [[0, 0, 0], [tA, ...along(dA)], [tB, ...along(dB)], [tB + 0.1, ...along(dB + (dC - dB) * 0.75)], [tC, ...along(dC)], [dur, ...along(dC)]];
      const yaw = [[0, 0], [tA, 0], [tB, turn / D], [dur, turn / D]];
      // both feet land where the hips come to rest, square to the way he ends up facing: ~0.22 H apart, the right a
      // touch back; at touchdown they are out ahead of the hips by the braking distance
      const land = along(dC + 0.03 * Lg), cf = Math.cos(turn), sf = Math.sin(turn);
      const spot = (lat, fwd) => [land[0] + fwd * cf + lat * sf, land[1] - fwd * sf + lat * cf];
      const steps = [
        { t0: tA - 0.02, t1: tB, foot: 'l', to: spot(-0.11 * H, 0.015 * H), yaw: turn / D + 12, lift: 0.03, easeOut: 1 },
        { t0: tA, t1: tB, foot: 'r', to: spot(0.11 * H, -0.02 * H), yaw: turn / D - 12, lift: 0.03, easeOut: 1 },
      ];
      const st = o.stance || (has ? 'holdChest' : 'ready');
      const base = (A.STANCE[st] || A.STANCE.ready).pose;
      const K = (t, p2) => ({ t, p: Object.assign({ base }, p2) });
      const keys = [
        K(0, {}),
        K(tA, { rootZ: -0.035, pelPitch: 14, spFlex: 4 }),
        K(tA + 0.08, { rootZ: -0.01, pelPitch: 8, spFlex: 2, both: { HipF: 38, Knee: 42, Ank: -6 } }),
        K(tB, { rootZ: -0.06, pelPitch: 14, spFlex: 2, nkFlex: -6, both: { HipF: 42, Knee: 48, Ank: 10 } }),
        K(tB + 0.09, { rootZ: -0.1, pelPitch: 20, spFlex: 3, nkFlex: -10, both: { HipF: 55, Knee: 70, Ank: 20 } }),
        K(tC, { rootZ: -0.085, pelPitch: 18, spFlex: 3, nkFlex: -8 }),
        K(dur, {}),
      ];
      const clip = A.buildClip({ name: 'jumpStop', dur, events: { hop: tA, land: tB }, root, yaw, steps, keys, jump: { t0: tA, t1: tB, h: 0.015 } });
      const cs = this.play(clip, { x: this.x, y: this.y, facing: f0, fadeIn: 0.06, mirror: false });
      if (!cs) return null;
      if (has && b.state === 'dribble') b.give(this, 'chest');
      else if (has) this.ballHold = this.ballHold || 'chest';
      cs.onEnd = () => {
        this.setStance(st);
        if (o.faceTo) this.setFace(o.faceTo);
        if (o.onEnd) o.onEnd(this);
      };
      return cs;
    }
    /** how long a jump stop takes */
    jumpStopDur() { return 0.08 + 0.16 + 0.2 + 0.22; }
    _spinQuick() { return 1.12 - 0.24 * (this.rAgi == null ? 0.5 : this.rAgi); }
    /** how long this player's spin move takes (quicker for the agile) */
    spinDur() { return 0.15 + 0.56 * this._spinQuick() + 0.16; }
    /** where the body will be in dt seconds (the playing clip's root motion, else straight on at this velocity) */
    predictFrame(dt, out) {
      const cs = this.clip;
      if (cs && cs.clip.rootKeys && !cs.done) {
        const r = this._clipRoot(cs, Math.min(cs.t + dt * cs.speed, cs.clip.dur));
        out.x = r.x; out.y = r.y; out.facing = r.yaw;
      } else { out.x = this.x + this.vx * dt; out.y = this.y + this.vy * dt; out.facing = this._faceAhead(dt); }
      return out;
    }
    /** where the steering will have taken the body dur s on (a pass's catch, Trial 10): the steering run ahead on a copy
     *  of the body (the prototype's fields read through, every write the copy's own) with its goal as it is now, the feet
     *  and the other bodies as they are now; a body in a move with root motion goes the move's own way. (A straight line
     *  on at its speed missed a man braking into his catch spot by ~0.8 ft) */
    predictSteer(dur, out) {
      const cs = this.clip;
      if (cs && cs.clip.rootKeys && !cs.done) { const r = this._clipRoot(cs, Math.min(cs.t + dur * cs.speed, cs.clip.dur)); out.x = r.x; out.y = r.y; return out; }
      const h = M.Tune.clock.step, n = Math.min(240, Math.round(dur / h)), t0 = this.time || 0;
      const sim = Object.create(this);
      sim._simOf = this;
      sim.goal = Object.assign({}, this.goal);
      // (with the feet as they are now for the whole run ahead, a body caught with both feet in the air braked as if it
      // never came down: the push is taken whole, as over the plants and flights of a stride)
      sim.gaitOn = false;
      for (let i = 0; i < n; i++) { sim.time = t0 + (i + 1) * h; sim._steer(h); }
      out.x = sim.x; out.y = sim.y; out.vx = sim.vx; out.vy = sim.vy;
      // (still running on at the catch, not arriving where he was going)
      const g = sim.goal;
      out.runOn = Math.hypot(sim.vx, sim.vy) > M.Tune.pass.runOnFtps && !(g && g.mode !== 'idle' && Math.hypot(g.x - sim.x, g.y - sim.y) < 2.5);
      return out;
    }
    /** where the body will face dt s on, turning as _faceStep turns it: from the turn it has on, building up and braking
     *  to the facing wanted (Trial 8: the dribble planned the ball as if the body kept facing the way it faced, and turning
     *  at ~200 deg/s it had turned 60-80 deg more by the catch: the hand missed the ball in 16% of contact frames turning
     *  faster than 150 deg/s, up to ~10 in, against 2% turning slowly) */
    _faceAhead(dt) {
      if (!(dt > 0) || this._wantFace == null || this.clip || (this.time || 0) - (this._wantT == null ? -9 : this._wantT) > 0.05) return this.facing;
      const want = this._wantFace, rate = this._turnRate || 10, alpha = Math.min(this.turnAcc * (this.paceK || 1), M.Tune.weight.turnAccelMax);
      if (!(alpha > 0)) return this.facing;
      const h = M.Tune.clock.step, n = Math.min(90, Math.ceil(dt / h - 1e-9));
      let f = this.facing, w = this.faceW || 0;
      for (let i = 0; i < n; i++) {
        const st = Math.min(h, dt - i * h), dA = U.wrapPi(want - f);
        if (Math.abs(dA) < 2e-3 && Math.abs(w) < alpha * st) return want;
        const wDes = Math.sign(dA) * Math.min(rate, Math.sqrt(2 * alpha * 0.85 * Math.abs(dA)));
        w += U.clamp(wDes - w, -alpha * st, alpha * st);
        f += w * st;
      }
      return f;
    }
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
      if (this._rc) this._rcStep();
      if (this._retreatWait && !(this.dribble && (this.dribble.ph === 'down' || this.dribble.ph === 'up'))) { const o = this._retreatWait; this._retreatWait = null; this.retreat(o); }
      // (the speed a knock's push gave the body last step, for a move starting this step to carry on from, see _updateClip)
      this._hitPrevVx = this._hitVx || 0; this._hitPrevVy = this._hitVy || 0;
      const hit = this.hit;
      if (hit) {
        const t0 = hit.t;
        hit.t += dt;
        if (hit.t > 0.6) this.hit = null;
        else {
          // knocked off his line: up to ~0.5 ft over Tune.weight.hitPushS, the push building up and easing off
          // (smootherstep: no jump in speed; before, the whole knock started at full speed in one step, Trial 4)
          const T = M.Tune.weight.hitPushS, S = (u) => { u = U.clamp(u, 0, 1); return u * u * u * (u * (u * 6 - 15) + 10); };
          const push = hit.k * 0.5 * (S(hit.t / T) - S(t0 / T));
          if (this.clip) { this.clip.ox += hit.nx * push; this.clip.oy += hit.ny * push; }
          else { this.x += hit.nx * push; this.y += hit.ny * push; }
          // (its speed, for a move starting now to carry on from: see _updateClip)
          this._hitVx = !this.clip && dt > 0 ? hit.nx * push / dt : 0; this._hitVy = !this.clip && dt > 0 ? hit.ny * push / dt : 0;
          // (the push's own acceleration this step comes out of what the steering may use, Actor._steer: on top of a
          // full push of his own it made ~65 ft/s^2)
          this._hitA = dt > 0 ? Math.abs(push - (hit.lastPush || 0)) / (dt * dt) : 0;
          hit.lastPush = push;
        }
      }
      if (!this.hit) { this._hitA = 0; this._hitVx = 0; this._hitVy = 0; }
      // (a move that moves and turns the body this step: the steering takes over next step, or the body moved and
      // turned twice in one step, a jump in its speed and its turn; a move that ends before it moves the body, its
      // fade done, leaves this step to the steering, or the body stood still for a step, Trial 4)
      const clipMoved = this.clip ? this._updateClip(dt) : false;
      // (the pushes of bodies it touched while in a move are not saved up for when it ends, and the braking and cutting
      // shape it went in with dies away: the steering sets it again after)
      if (this.clip) {
        this.extAx = 0; this.extAy = 0; this.extHx = 0; this.extHy = 0;
        const e = Math.exp(-dt / M.Tune.weight.poseHalfLifeS * Math.LN2);
        this.brakeK = (this.brakeK || 0) * e; this.cutK = (this.cutK || 0) * e; this.brakeKv = 0; this.cutKv = 0;
        this.dropK = (this.dropK || 0) * e; this._dHold = (this._dHold || 0) * e; this.dropKv = 0;
      }
      // how hard a jump comes down: the legs give on landing in proportion (see buildPose)
      if (dt > 0) {
        const jz = this.jumpZ || 0, pz = this._jzPrev == null ? jz : this._jzPrev;
        if (pz > 0.03 && jz <= 0.03 && (this._jzV || 0) < -3) {
          this._absorb = { v: -this._jzV, t: this.time };
          // (knocked in the air: he comes down off balance and has to catch himself)
          if (this._stumble && this._stumble.t == null) this._stumble.t = this.time + 0.05;
        }
        this._jzV = (jz - pz) / dt; this._jzPrev = jz;
      }
      if (this.upper) this._updateUpper(dt);
      if (!this.clip) {
        this._steer(clipMoved ? 0 : dt);
        this._turn(clipMoved ? 0 : dt);
        this._locomote(dt);
      }
      this._contactSteps();
      this._moveSteps();
      if (this.stanceBlend < 1) this.stanceBlend = Math.min(1, this.stanceBlend + dt / 0.28);
      if (this.aim_) {
        const a = this.aim_;
        a.w = this.time < a.until ? Math.min(1, a.w + dt / 0.15) : a.w - dt / 0.25;
        if (a.w <= 0) this.aim_ = null;
      }
      this._stanceParams();
      for (const f of this.feet) if (f.land) this._settleLanding(f, dt);
      // a pivot's heel comes back down when nothing turns the foot any more (a move took over, the foot left the floor)
      for (const f of this.feet) {
        if (f.state !== 'plant') { f.pvK = 0; f.pvPitch = 0; f.pvOn = false; }
        else if (f.pvT !== this.time && f.pvK > 0) { f.pvOn = false; f.pvK = Math.max(0, f.pvK - dt / M.Tune.floor.pivot.downS); f.pvPitch = M.Tune.floor.pivot.pitchDeg * D * U.smooth(f.pvK); }
      }
      if (this.fall > 0 && !this.clip) this.fall = Math.max(0, this.fall - dt * 0.5);
      this.stillT = (!this.clip && this.speed < 0.6) ? (this.stillT || 0) + dt : 0;
    }

    /** dribble moves standing (sizing a man up): between the legs, the foot opposite the hand the ball leaves steps
     *  forward as the ball goes under it (right to left, the left foot), so a run of them scissors the feet; the
     *  stagger is held while the moves go on and let go after (the stance steps the feet back square) */
    _moveSteps() {
      const b = this.view && this.view.ball, d = b && b.dr && b.dr.actor === this ? b.dr : null;
      const mv = d && d.move && d.moveStarted ? d.move : null;
      if (mv && mv !== this._mvSeen) {
        this._mvSeen = mv;
        if (mv.type === 'btl' && !this.clip && this.speed < 2.5) {
          const lead = d.hand ? 0 : 1, f = this.feet[lead], o = this.feet[1 - lead];
          this._stag = { lead, until: this.time + mv.period + 0.9 };
          if (f.state === 'plant' && o.state === 'plant') {
            const H = this.H, st = stanceOf(this, this.stance), c = Math.cos(this.facing), s = Math.sin(this.facing), so = lead ? st.R : st.L;
            const tx = this.x + s * so[0] * H + c * (so[1] + STAG_F) * H, ty = this.y - c * so[0] * H + s * (so[1] + STAG_F) * H;
            this._sepTarget(f, tx, ty, TD);
            this._beginStep(f, TD[0], TD[1], this.facing + (lead ? -1 : 1) * st.yaw * D, Math.min(0.2, mv.period * 0.45), 0.03);
          }
        }
      }
      if (this._stag && (this.time > this._stag.until || this.speed > 4 || this.clip)) this._stag = null;
    }
    /** steps forced by contact: the lunge of a reach (the front foot toward the ball, standing) and the step that
     *  catches the balance after a hard bump (the foot furthest the way he was pushed goes further that way) */
    _contactSteps() {
      const H = this.H;
      const lg = this._lunge;
      if (lg) {
        const t = this.time - lg.t;
        if (t > 0.7) this._lunge = null;
        else if (!lg.stepped && t > 0.02) {
          lg.stepped = true;
          const f = this.feet[1];
          if (!this.clip && !this.gaitOn && f.state === 'plant') {
            const c = Math.cos(lg.a), s = Math.sin(lg.a), d = 0.12 * H;
            this._sepTarget(f, f.x + c * d, f.y + s * d, TD);
            this._beginStep(f, TD[0], TD[1], f.yaw, 0.16, 0.03);
          }
        }
      }
      const sb = this._stumble;
      if (sb && sb.t != null && this.time >= sb.t) {
        this._stumble = null;
        // (on the move the stride takes the push; a forced step in the middle of it tangled the feet)
        if (this.clip || (this.gaitOn && this.speed > 2)) return;
        let best = null, bd = -1e9;
        for (const f of this.feet) {
          if (f.state !== 'plant') continue;
          const d = (f.x - this.x) * sb.nx + (f.y - this.y) * sb.ny;
          if (d > bd) { bd = d; best = f; }
        }
        if (!best) return;
        const L = (0.05 + 0.07 * sb.k) * H;
        this._sepTarget(best, best.x + sb.nx * L, best.y + sb.ny * L, TD);
        this._beginStep(best, TD[0], TD[1], best.yaw, 0.15, 0.03);
      }
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
          // (how fast what he follows is going: read by the facing, a man on the move is followed at a run)
          g.tv = Math.hypot(tvx, tvy); g.tvx = tvx; g.tvy = tvy;
        } else if (dt > 0) {
          // (a spot that keeps being moved on, the way a spacing spot follows the ball, goes as fast as it is moved:
          // measured over ~0.25 s, a jump to a new spot aside)
          const jx = g.x - (g.px == null ? g.x : g.px), jy = g.y - (g.py == null ? g.y : g.py), jl = Math.hypot(jx, jy);
          const k = 1 - Math.exp(-dt / 0.25), mx = jl < 1 ? jx / dt : 0, my = jl < 1 ? jy / dt : 0;
          g.tvx = (g.tvx || 0) + (mx - (g.tvx || 0)) * k; g.tvy = (g.tvy || 0) + (my - (g.tvy || 0)) * k;
          g.tv = Math.hypot(g.tvx, g.tvy); g.px = g.x; g.py = g.y;
        }
        // the lines (the gameplay pass: a dribbler sent toward a spot past a sideline or a baseline went on out with it and
        // nothing was called): dribbling, he keeps his feet Tune.rules.lineFt inside them, a spot past them taken at that
        // margin and braked for, unless a play means him to go out (this.oobOK: the out-of-bounds turnover's walk over it)
        // (me: the body itself, when this is its copy run ahead by predictSteer)
        let edge = false;
        const me = this._simOf || this;
        if (me.hasBall && !(this.oobOK > this.time)) {
          const vb = this.view && this.view.ball;
          if (vb && vb.state === 'dribble' && vb.dr && vb.dr.actor === me && this.view.director && this.view.director.active && this.view.director.liveBall && this.view.director.liveBall()) {
            const mg = M.Tune.rules.lineFt, cx = U.clamp(tx, mg, 94 - mg), cy = U.clamp(ty, mg, 50 - mg);
            if (cx !== tx) { if ((tvx > 0) === (tx > cx)) tvx = 0; tx = cx; edge = true; }
            if (cy !== ty) { if ((tvy > 0) === (ty > cy)) tvy = 0; ty = cy; edge = true; }
          }
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
        // the traveling rule (the gameplay pass): his dribble picked up and the ball in his hands, he gets the steps it
        // takes to stop (Tune.rules: gather steps, a stride or two past the pick-up) and then only pivots; an order to go
        // somewhere with it is not taken (walking on with it was a travel), a clip's own steps aside (a layup, a jumper)
        if (this.dribUsed && this.hasBall && !this.clip) {
          const vb = this.view && this.view.ball, TR = M.Tune.rules;
          if (vb && vb.holder === this && vb.state === 'held' && (this.time - (this.dribUsedAt || 0) > TR.gatherS || Math.hypot(this.x - (this.dribUsedX == null ? this.x : this.dribUsedX), this.y - (this.dribUsedY == null ? this.y : this.dribUsedY)) > TR.gatherFt)) {
            if (want > 0.5 && dist > 0.5 && !this._travelHeld) { vb.rules.travelStopped++; this._travelHeld = true; }
            want = 0; tvx = 0; tvy = 0;
          } else this._travelHeld = false;
        }
        if (g.arrive || edge) want = Math.min(want, Math.sqrt(2 * this.decel * (g.mode === 'move' && g.brakeK ? g.brakeK : 0.8) * Math.max(0, dist - 0.05)));
        if (dist < 0.15 && Math.hypot(tvx, tvy) < 0.5) want = 0;
        if (dist > 1e-4) { dvx = dx / dist * want; dvy = dy / dist * want; }
        dvx += tvx; dvy += tvy;
        const dl = Math.hypot(dvx, dvy);
        if (dl > this.maxSpeed * 1.1) { dvx *= this.maxSpeed * 1.1 / dl; dvy *= this.maxSpeed * 1.1 / dl; }
        const av = this._avoid(dvx, dvy);
        dvx = av[0]; dvy = av[1];
        // the lines ahead (the gameplay pass): with the ball he brakes for a sideline or a baseline in time to stop
        // Tune.rules.stopFt inside it, the part of his run toward it held to what he can still stop from there on
        // Tune.rules.brakeK of his brake; along it and away from it he goes as he wants (a catch at a run into a corner slid
        // on over the line, the dribble started on the way). Not a man a pass is on its way to: the throw was planned on the
        // run he is on (Director.catchFor), and braking in the air he was ~5-10 ft short of an outlet at the catch; he is kept
        // from running on through a spot into a line instead (Director.toCatchSpot)
        // (the speed he can still stop from in the room left, the brake a moment late in coming, Tune.rules.brakeLagS: a body
        // running on the balls of its feet brakes only on a plant, and on the full brake a sprinter went ~4 ft on past it)
        if (this._lineAware(me)) {
          const TR = M.Tune.rules, ab = this.decel * TR.brakeK, m = TR.stopFt, lag = TR.brakeLagS;
          const vmax = (room) => room > 0 ? ab * (Math.sqrt(lag * lag + 2 * room / ab) - lag) : 0;
          dvx = U.clamp(dvx, -vmax(this.x - m), vmax(94 - m - this.x));
          dvy = U.clamp(dvy, -vmax(this.y - m), vmax(50 - m - this.y));
        }
      }
      // (the pace wanted, for the facing: a defender who needs more than a slide can give opens up now, see
      // _desiredFacing; and until his hips have come round he goes no faster sideways or backwards than a slide
      // (Tune.gait.slideMaxFtps, a crossover step turns him, Trial 5: he slid on at 15-16 ft/s while turning, and the
      // foot left out wide was torn off the floor)
      this._wantSp = Math.hypot(dvx, dvy); this._wantVx = dvx; this._wantVy = dvy;
      {
        const stS = A.STANCE[this.stance];
        if (stS && stS.slide && !this.clip && this._wantSp > 1e-6) {
          const c = Math.cos(this.facing), s = Math.sin(this.facing), along = (dvx * c + dvy * s) / this._wantSp;
          const cap = U.lerp(M.Tune.gait.slideMaxFtps, 99, U.smooth((along - 0.5) / 0.35));
          if (this._wantSp > cap) { dvx *= cap / this._wantSp; dvy *= cap / this._wantSp; }
        }
      }
      // acceleration limits
      let ex = dvx - this.vx, ey = dvy - this.vy;
      const el = Math.sqrt(ex * ex + ey * ey);
      const spd = Math.hypot(this.vx, this.vy);
      const slowing = (dvx * this.vx + dvy * this.vy) < spd * spd;
      // how hard a player pushes off depends on how fast he wants to go: a walk starts gently (walking speed within
      // a step or two), a sprint with everything he has (every start used to be a sprinter's push, even into a
      // walk, and the upper body lurched ahead of the legs)
      // (the harder push of Tune.urgency's starts is for a player on the move; one sliding or backpedalling out of the
      // defensive stance keeps the gentler one his footwork was built on, Trial 5: pushed harder, a hip popped)
      const TUr = M.Tune.urgency, stA = A.STANCE[this.stance], hard = this.urgK > 1 && !(stA && stA.slide);
      const accelNow = Math.min(this.accel, (hard ? TUr.startFtps2 : TUr.slideStartFtps2) + (hard ? TUr.startPerFtps : TUr.slideStartPerFtps) * Math.max(Math.hypot(dvx, dvy), spd));
      // the body is a mass (Trial 4): the push toward the wanted velocity builds up and eases off at a human rate of
      // force development (Tune.weight.jerkFtps3) instead of switching on and off in one step, and eases off as the
      // velocity gets there so it is spent just as it arrives (a little overshoot, then it settles)
      const TW = M.Tune.weight, J = (slowing ? TW.brakeJerkFtps3 : TW.jerkFtps3) * this.kMass * (this.paceK || 1);
      // (only a foot on the floor can push: running, with both feet in the air for a moment between strides, the body
      // barely changes its course, so a cut or a stop happens on the plant, Tune.weight.airPushK)
      // (not braking: the stop is planned on the full brake, and braking the steps come too quick to leave the floor)
      const inAir = this.gaitOn && this.speed > 8 && this.feet[0].state === 'swing' && this.feet[1].state === 'swing', air = inAir && !slowing;
      // (both feet off the floor longer than a step's own flight, Tune.weight.airSlackS, a skip off a foot the body ran
      // away from: nothing pushes it, braking or not, until a foot is down (Tune.weight.skipPushK); a body braked and cut
      // in the air for a third of a second, Trial 4)
      const both = this.gaitOn && this.feet[0].state === 'swing' && this.feet[1].state === 'swing';
      if (dt > 0) this._airT = both ? (this._airT || 0) + dt : 0;
      const skip = both ? U.smooth(((this._airT || 0) - (this._flightS || 0) - TW.airSlackS) / 0.04) : 0;
      const kAir = air ? TW.airPushK : 1, kPush = kAir + (Math.min(kAir, TW.skipPushK) - kAir) * skip;
      // (and near the wanted velocity a push in proportion, Tune.weight.velGain: bang-bang to the end, it chattered about
      // a standstill at ~4 ft/s^2)
      const aMag = el > 1e-6 ? Math.min((slowing ? this.decel : accelNow) * kPush, Math.sqrt(2 * J * el), el * TW.velGain) : 0;
      let wax = el > 1e-6 ? ex / el * aMag : 0, way = el > 1e-6 ? ey / el * aMag : 0;
      // (braking in the air, the push across still waits for a foot: a cut made while braking turned him between his
      // plants, with no foot down outside it, Trial 4)
      if (inAir && slowing && spd > 0.1) { const ux = this.vx / spd, uy = this.vy / spd, lat = way * ux - wax * uy, k = (1 - TW.airBrakeLatK) * lat; wax += uy * k; way -= ux * k; }
      // (running, a cut is pushed off the outside foot: with only the inside foot down the push across is less, so the
      // turn comes on the outside plant, Tune.weight.insidePushK)
      // (from a jog up: at 7 ft/s a cut pushed ~0.3 s off the inside foot alone, both feet on the inside of the turn)
      // (only a foot on the floor pushes across: in the air a push across cannot start or grow, it carries on only what
      // the last foot down gave, and a foot planted outside the cut pushes Tune.weight.plantPushK harder, a real cut's
      // force going down through the plant; a cut made in a stride's flight off a foot under the body landed on the
      // inside foot with no plant outside at all, Trial 4)
      if (this.gaitOn && spd > 4) {
        const ux = this.vx / spd, uy = this.vy / spd, lat = way * ux - wax * uy, am = Math.hypot(wax, way);
        // (how far the best planted foot is on the side the push comes from: full support Tune.weight.plantFullH out)
        let best = null;
        for (const f of this.feet) {
          if (f.state !== 'plant' || am < 1e-6) continue;
          const d = -((f.x - this.x) * wax + (f.y - this.y) * way) / am;
          if (best == null || d > best) best = d;
        }
        const kR = U.smooth((spd - 4) / 3);
        let latN = lat;
        if (best != null) {
          const sup = U.smooth(best / (TW.plantFullH * this.H)), kL = TW.insidePushK + (TW.plantPushK - TW.insidePushK) * sup;
          // (no more than the velocity error's own proportional push, so it never overshoots)
          const eLat = Math.abs(ey * ux - ex * uy);
          latN = Math.sign(lat) * Math.min(Math.abs(lat) * (1 + (kL - 1) * kR), Math.max(Math.abs(lat), eLat * TW.velGain));
        } else if (both) {
          const g = this._latG || 0;
          latN = lat * g > 0 ? Math.sign(lat) * Math.min(Math.abs(lat), Math.abs(g)) : lat * (1 - kR);
        }
        if (!both) this._latG = latN;
        if (latN !== lat) { const k = latN - lat; wax -= uy * k; way += ux * k; }
      } else this._latG = 0;
      if (dt > 0) {
        const jx = wax - this.acx, jy = way - this.acy, jl = Math.hypot(jx, jy), jm = J * dt;
        if (jl > jm) { this.acx += jx * jm / jl; this.acy += jy * jm / jl; } else { this.acx = wax; this.acy = way; }
      }
      // (and the push of a body it is touching, from the last step's separation: together never past a body's limit,
      // Tune.weight.totalAccelMax; added straight to the speed, a bump and a brake together made 60-200 ft/s^2)
      // (a body pressed deep into another is pushed out of it first, out of the same limit, and whatever is left goes
      // to the rest; less a knock's own push this step, see update)
      const TL = Math.max(0, TW.totalAccelMax - (this._hitA || 0));
      const hx = this.extHx || 0, hy = this.extHy || 0, hm = Math.hypot(hx, hy), hk = hm > TL ? TL / hm : 1;
      const rest = TL - hm * hk;
      let tax = this.acx + (this.extAx || 0), tay = this.acy + (this.extAy || 0);
      this.extAx = 0; this.extAy = 0; this.extHx = 0; this.extHy = 0;
      const tam = Math.hypot(tax, tay);
      if (tam > rest) { tax *= rest / tam; tay *= rest / tam; }
      tax += hx * hk; tay += hy * hk;
      ex = tax * dt; ey = tay * dt;
      this.ax = tax; this.ay = tay;
      // a smoothed copy for predicting where the feet land (the raw value flips sign as a player settles to a stop)
      const kA = 1 - Math.exp(-dt / 0.1);
      this.axF = (this.axF || 0) + (this.ax - (this.axF || 0)) * kA; this.ayF = (this.ayF || 0) + (this.ay - (this.ayF || 0)) * kA;
      this.vx += ex; this.vy += ey;
      this.x += this.vx * dt; this.y += this.vy * dt;
      this.speed = Math.hypot(this.vx, this.vy);
      // how hard he is braking and cutting (the push against and across the way he is going), read by the stride (quick
      // braking steps, feet out ahead or to the outside) and the pose (the hips drop), Trial 4
      const sp1 = this.speed;
      let bkT = 0, ctT = 0;
      if (sp1 > 0.05) {
        // (from the push he wants as well as the one he has: the hips start down as he commits to the cut, while the
        // push is still building)
        const ux = this.vx / sp1, uy = this.vy / sp1;
        const aPar = Math.min(this.ax * ux + this.ay * uy, wax * ux + way * uy), aLat = Math.max(Math.abs(this.ay * ux - this.ax * uy), Math.abs(way * ux - wax * uy));
        bkT = U.smooth((-aPar - TW.brakeFrom) / TW.brakeSpan) * U.smooth((sp1 - 1) / 2);
        ctT = U.smooth((aLat - TW.cutFrom) / TW.cutSpan) * U.smooth((sp1 - 5) / 4);
      }
      // (eased on critically damped springs, Tune.weight.poseHalfLifeS: read straight off the push they switched the
      // hips and the step rate in two steps, and the knees and toes popped)
      if (dt > 0) {
        const y = 2 * Math.LN2 / TW.poseHalfLifeS, e = Math.exp(-y * dt);
        let j0 = (this.brakeK || 0) - bkT, j1 = (this.brakeKv || 0) + j0 * y;
        this.brakeK = e * (j0 + j1 * dt) + bkT; this.brakeKv = e * ((this.brakeKv || 0) - j1 * y * dt);
        j0 = (this.cutK || 0) - ctT; j1 = (this.cutKv || 0) + j0 * y;
        this.cutK = e * (j0 + j1 * dt) + ctT; this.cutKv = e * ((this.cutKv || 0) - j1 * y * dt);
        // and how far the hips drop for it (heights, see solve): held at its deepest for Tune.weight.dropHoldS, then let
        // back up no faster than a full drop in dropRiseS, on the same spring (the push comes and goes with each plant
        // and eases at the slowest point of a plant-and-go: followed straight, the hips bobbed up between the plants of
        // one cut, and a spring on the push alone never got them all the way down)
        // (a defender's slide is low already: its quick reversals do not pump the hips; a fast one stopping does drop them)
        const latD = 1 - (this.latK || 0) * (1 - U.smooth((sp1 - TW.slideDropFrom) / TW.slideDropSpan));
        const dT = (TW.brakeDropH * bkT + TW.cutDropH * ctT) * latD;
        if (dT >= (this._dHold || 0)) { this._dHold = dT; this._dHoldT = 0; }
        else if ((this._dHoldT = (this._dHoldT || 0) + dt) > TW.dropHoldS) this._dHold = Math.max(dT, this._dHold - dt * Math.max(TW.brakeDropH, TW.cutDropH) / TW.dropRiseS);
        j0 = (this.dropK || 0) - this._dHold; j1 = (this.dropKv || 0) + j0 * y;
        this.dropK = e * (j0 + j1 * dt) + this._dHold; this.dropKv = e * ((this.dropKv || 0) - j1 * y * dt);
      }
      // lean into acceleration / turns (smoothed): only part of the tilt a push-off needs is the trunk bending at the
      // hips (most of it is the legs driving from behind the body), ~12 deg at most; it used to reach ~23 deg even on a
      // walk start and read as the head and shoulders being dragged ahead of the legs
      const c = Math.cos(this.facing), s = Math.sin(this.facing);
      const aF = this.ax * c + this.ay * s, aR = this.ax * s - this.ay * c;
      // (on critically damped springs, ~0.1 s half-life: the lean builds and eases off smoothly with no overshoot;
      // eased toward the push directly, it started and stopped with a kink every time the push changed)
      if (dt > 0) {
        const y = 2 * Math.LN2 / 0.1, e = Math.exp(-y * dt);
        const tF = U.clamp(aF / 32.2 * 0.5, -0.18, 0.21), tR = U.clamp(aR / 32.2 * 0.6, -0.2, 0.2);
        let j0 = this.leanF - tF, j1 = this.leanFv + j0 * y;
        this.leanF = e * (j0 + j1 * dt) + tF; this.leanFv = e * (this.leanFv - j1 * y * dt);
        j0 = this.lean - tR; j1 = this.leanv + j0 * y;
        this.lean = e * (j0 + j1 * dt) + tR; this.leanv = e * (this.leanv - j1 * y * dt);
      }
    }

    /** other bodies in the way (Trial 4). A body on a collision course with another steers round it in time: the
     *  velocity it wants gets a sideways part, enough to pass Tune.weight.passFt clear at the closest approach, shared
     *  with the other body (all of it if the other is in a move); not a man with the ball driving into a defender, and
     *  not bodies meant to lean on each other (box-outs, posts, screens). And a body touching another never tries to go
     *  on through it: the part of the velocity it wants that goes into the other is taken out as they touch, so it
     *  leans on him and slides round him (before, two players crossing ran into each other at full speed, and a
     *  box-out or a screen pushed on until the separation shoved them apart in a step). Returns the velocity wanted. */
    /** whether he minds the lines as he moves (_steer): in a game with the ball in play (Director.liveBall: not an inbounder
     *  taking it out for the throw), with it in his hands or dribbling it; not when the engine sends him out (oobOK, the
     *  out-of-bounds turnover's walk over it). me: the body (this may be its copy run ahead) */
    _lineAware(me) {
      if (this.oobOK > (this.time || 0)) return false;
      const v = this.view, d = v && v.director, b = v && v.ball;
      if (!d || !d.active || !b || !(d.liveBall && d.liveBall())) return false;
      return b.holder === me && (b.state === 'held' || b.state === 'dribble');
    }
    _avoid(dvx, dvy) {
      const out = this._avOut || (this._avOut = [0, 0]);
      out[0] = dvx; out[1] = dvy;
      const v = this.view, TW = M.Tune.weight;
      if (!v || !v.actors || this.fall > 0) return out;
      const lean = (a) => a.stance === 'boxout' || a.stance === 'postD' || a.stance === 'postUp' || a.stance === 'screen';
      const steer = !this.hasBall && !lean(this);
      let ax = 0, ay = 0;
      // (players and the officials: an official ran through the players at up to 13 ft/s)
      const others = this._avList || (this._avList = []);
      others.length = 0;
      for (const id in v.actors) others.push(v.actors[id]);
      if (v.refs) for (const r of v.refs) others.push(r);
      for (const b of others) {
        // (and a look ahead, predictSteer, never steers round the body it is the look ahead of: it did, and a man braking to
        // a spot ~1 ft ahead was seen running ~1.2 ft past it and ~1.5 ft to the side, Trial 10)
        if (b === this || b === this._simOf || b.hidden) continue;
        const rx = b.x - this.x, ry = b.y - this.y, r2 = rx * rx + ry * ry;
        // (two bodies meant to touch, a box-out's, Trial 11: the torsos' own depth apart, not the room kept between players)
        const touch = this.touching(b) ? (this.H + b.H) * M.Tune.glass.touchH : (this.H + b.H) * 0.15;
        // (as far off as the two can close in Tune.weight.avoidAheadS, 10 ft at least: two bodies running at each other
        // at full speed, ~35 ft/s between them, were seen too late to steer or stop and ran into each other)
        const reach = Math.max(10, (this.speed + (b.speed || 0)) * TW.avoidAheadS + touch);
        if (r2 > reach * reach) continue;
        const far = r2 > 100;
        if (steer && !b.hasBall && !lean(b)) {
          // (relative to where this one wants to go and where the other is going)
          const wx = b.vx - dvx, wy = b.vy - dvy, w2 = wx * wx + wy * wy;
          if (w2 >= 1) {
            const tca = -(rx * wx + ry * wy) / w2;
            if (tca > 0 && tca < TW.avoidAheadS) {
              const cx = rx + wx * tca, cy = ry + wy * tca, dca = Math.hypot(cx, cy), R = touch + TW.passFt;
              if (dca < R) {
                // (sideways, away from where the other will be at the closest approach; straight at each other, to
                // the right)
                let nx = -cx, ny = -cy, nl = dca;
                if (nl < 1e-3) { const ww = Math.sqrt(w2); nx = wy / ww; ny = -wx / ww; nl = 1; }
                const share = b.isBusy && b.isBusy() ? 1 : 0.5;
                const k = Math.min(TW.avoidMaxFtps, (R - dca) / Math.max(0.15, tca)) * share;
                ax += nx / nl * k; ay += ny / nl * k;
              }
            }
          }
        }
        // closing on him: no faster than a body can stop by the time they touch (braking at Tune.weight.leanBrake,
        // meeting at Tune.weight.meetFtps at most, a little more for a man with the ball going into a defender), and
        // touching, not on through him
        const r = Math.sqrt(r2);
        if (r > 1e-3) {
          const nx = rx / r, ny = ry / r, into = (out[0] + ax) * nx + (out[1] + ay) * ny - (b.vx * nx + b.vy * ny);
          // (past 10 ft only a body it would run into: one it passes clear of is not braked for)
          let hit = !far;
          if (far && into > 0) {
            const wx = b.vx - out[0] - ax, wy = b.vy - out[1] - ay, w2 = wx * wx + wy * wy;
            const tca = w2 > 1e-6 ? -(rx * wx + ry * wy) / w2 : 0;
            hit = tca > 0 && Math.hypot(rx + wx * tca, ry + wy * tca) < touch + TW.passFt;
          }
          if (hit && into > 0) {
            const v0 = this.hasBall ? TW.meetBallFtps : TW.meetFtps, gap = r - touch;
            const allow = gap <= 0 ? v0 * U.smooth(1 + gap / TW.leanFt) : Math.sqrt(v0 * v0 + 2 * TW.leanBrake * gap);
            if (into > allow) { ax -= nx * (into - allow); ay -= ny * (into - allow); }
          }
        }
      }
      out[0] += ax; out[1] += ay;
      return out;
    }

    /** where the body wants to face, turned toward a pass in the air to him (Trial 10): not running on through the catch,
     *  never further round from the way to the passer than Tune.pass.faceBallDeg, faceBallRunDeg on the move (coaching:
     *  face the passer, show a target, meet the ball). Walking off to his spot turned away, a man had the ball tossed to
     *  him from behind, and one jogging to his opened up to run with it in the air: the body went round with the passer
     *  behind it, and the hands held out toward the ball went from one side of him to the other. (Not before it is
     *  thrown: a man starting a run up the floor for an outlet was turned back to the passer, then round again as he got
     *  going) */
    _desiredFacing() {
      const face = this._desiredFacing0(), rc = this._rc, T = M.Tune.pass;
      if (!rc || !rc.ball || rc.runOn || rc.caught != null || this.clip || !rc.from) return face;
      const fx = rc.rel ? rc.rel[0] : rc.from.x, fy = rc.rel ? rc.rel[1] : rc.from.y;
      if (Math.hypot(fx - this.x, fy - this.y) < 1) return face;
      const ap = Math.atan2(fy - this.y, fx - this.x), r = U.wrapPi(face - ap);
      const m = U.lerp(T.faceBallDeg, T.faceBallRunDeg, U.smooth((this.speed - T.runOnFtps + 1) / 2)) * D;
      if (Math.abs(r) <= m) return face;
      // (turned further away than that, he comes round into it the short way, the passer coming round in front of him:
      // sent to the edge nearer where he wanted to face, the body went the other way round, the passer behind it)
      const r0 = U.wrapPi(this.facing - ap);
      return ap + Math.sign(Math.abs(r0) > m ? r0 : r) * m;
    }
    _desiredFacing0() {
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
      this._watchTo = 0;
      const locked = this.faceLock && this.faceMode === 'fn';
      if (st.slide && !this._runMode) {
        // (the defensive stance slides and backpedals, opening up and running only past ~12 ft/s, ~13.5 locked on
        // his man. A run already under way carries on into it until it ends as a run does: a help defender near
        // the edge of the stance's range switched stance back and forth and turned with it)
        // (judged on the pace he needs, not the pace he has: sliding up to it first, he turned at ~16 ft/s over a foot
        // left far out, Trial 5; and he slides no faster than Tune.gait.slideMaxFtps meanwhile, see _steer)
        const slideMax = Math.min(locked ? 13.5 : 12, M.Tune.gait.slideMaxFtps), need = Math.max(sp, this._wantSp || 0);
        const wantA = this._wantSp > 1 && this.goal && this.goal.mode !== 'idle' ? Math.atan2(this._wantVy || this.vy, this._wantVx || this.vx) : moveA;
        const diffW = Math.abs(U.wrapPi(wantA - face));
        if (need > slideMax && diffW > 0.9) face = U.angLerp(face, wantA, U.smooth((need - slideMax) / 3));
        return face;
      }
      // anyone else shuffles sideways or backwards only a couple of quick steps: going further at pace he opens up
      // and runs (the coaches' "turn and run": the hips and legs go the way he is going, the upper body and eyes
      // stay on what he was facing), and squares up again when he gets there or slows. It is a decision held until
      // then (a threshold on speed alone flipped the body back and forth as his pace crossed it, and the feet
      // tangled). He goes when he is headed somewhere over ~6 ft off, or has shuffled ~0.3 s after a man (or a
      // spot) on the move; the last few feet to a spot are shuffled. Off-ball players go from ~4.5 ft/s (they
      // shuffled across the floor at up to 13.5 ft/s shadowing their man, like crabs), a man sealing, posting,
      // screening or with the ball from ~8.5 ft/s. Either way the body holds it for ~0.3 s at least (switched on and
      // off as he neared his spot, it turned back and forth every frame)
      const early = TURN_EARLY[this.stance] && !this.hasBall;
      const g = this.goal, gd = g.mode === 'idle' ? 0 : Math.hypot(g.x - this.x, g.y - this.y), tv = g.mode === 'idle' ? 0 : g.tv || 0;
      const off = sp > (early ? 4.5 : 8.5) && diff > 1.0;
      if (!off) this._offT = null; else if (this._offT == null) this._offT = this.time;
      let rm = !!this._runMode;
      const held = this.time - (this._rmT == null ? -9 : this._rmT) < 0.3;
      // (he squares up while he still has pace to step round on: braking to a stop, nearing the spot, or when his
      // man turns back. Left running until he had all but stopped, the body swung round over feet that had stopped
      // stepping, and the legs crossed)
      const brake = sp > 0.1 ? -((this.axF || 0) * this.vx + (this.ayF || 0) * this.vy) / sp : 0, braking = brake > 6 && sp < (early ? 6 : 8);
      if (!rm) {
        // (following a man, or a spot on the move: once he has shuffled ~0.3 s with it really going that way,
        // ~0.5 s when it drifts: a man's jabs and fakes turned a defender back and forth)
        const offT = this._offT == null ? 0 : this.time - this._offT;
        const withIt = ((g.tvx || 0) * this.vx + (g.tvy || 0) * this.vy) > 0.7 * tv * sp;
        if (!held) rm = off && !braking && g.mode !== 'idle' && (gd > 6 || (withIt && ((offT > 0.3 && (gd > 4 || tv > 4)) || (offT > 0.5 && tv > 2))));
        this._rmAl = false;
      } else if (g.mode === 'idle' || sp < (early ? 3.5 : 5)) rm = false;
      else {
        // (the man turning back counts once the body has come round into the run: before that it read as a
        // reversal, and the run was called off and started again while he was still turning)
        const run = Math.abs(U.wrapPi(moveA - this.facing));
        if (run < 0.5) this._rmAl = true;
        if (!held) rm = !(diff < 0.5 || (gd < 3 && tv <= 2) || braking || (this._rmAl && run > 1.75));
      }
      if (rm !== !!this._runMode) this._rmT = this.time;
      this._runMode = rm;
      if (rm) { this._watch = face; this._watchTo = 1; face = moveA; }
      return face;
    }
    /** where the body will face in `dt` seconds, turning toward where it wants to face at its turn rate */
    faceIn(dt) {
      if (this._wantFace == null) return this.facing;
      const rate = this._turnRate || 10;
      return this.facing + U.clamp(U.wrapPi(this._wantFace - this.facing), -rate * dt, rate * dt);
    }
    _turn(dt) {
      const want = this._desiredFacing();
      // (the eyes come round to what he was facing, and back, over ~0.15 s)
      this._watchK = (this._watchK || 0) + ((this._watchTo || 0) - (this._watchK || 0)) * (1 - Math.exp(-dt / 0.12));
      this._wantFace = want; this._wantT = this.time;
      // standing and turning far (to face the ball, a man, the other way): the whole body goes round together on a
      // pivot foot while the other foot steps round it, instead of the upper body turning first and the feet
      // catching up with a step across (the legs crossed)
      const g = this.goal, settled = g.mode === 'idle' || (g.mode === 'move' && Math.hypot(g.x - this.x, g.y - this.y) < 0.6);
      // (not while the body is already turning: the move starts from a standstill; started part way into a turn it
      // stopped the turn dead for a step, Trial 4)
      if (this.kind === 'player' && !this.clip && this.speed < 1.2 && settled && !(this.hasBall && !this.dribble) && Math.abs(this.faceW || 0) < 1.5 &&
          this.feet[0].state === 'plant' && this.feet[1].state === 'plant' && Math.abs(U.wrapPi(want - this.facing)) > 0.96 &&
          this.time - (this._pivotT || -9) > 0.35) {
        this._pivotT = this.time;
        // (the turn it had going carries on this step: the pivot takes it from the next, Trial 4)
        if (this.pivotTo(want, { ball: false })) { if (dt > 0) this.facing = U.wrapPi(this.facing + (this.faceW || 0) * dt); return; }
      }
      // (a 180 in ~0.3 s standing, ~0.4 s on the run; quicker for the agile)
      let rate = (this.speed > 8 ? 8 : 11) * (0.9 + 0.25 * this.rAgi) * (this.paceK || 1);
      // a big turn on the move (opening up to run, squaring up out of it, facing a new man) goes round over the
      // right foot: turning left over a right foot planted ahead of him (or a left one behind), the way a player
      // plants the outside foot to open up, cut or stop. Over the other foot it would end up across the other leg,
      // and the next step had to come round it (the legs touched on most of these turns). So the turn waits for a
      // stride to put the right foot down (a quarter of the pace meanwhile, ~0.3 s at most). (Not at a sprint: held
      // back there, the body ran on sideways with the feet stretched out and dragging)
      const dA = U.wrapPi(want - this.facing);
      // (a box-out's turn is a reverse pivot into the man, the back to them at once: not held back to wait for a stride, nor to
      // a defender's opening-up rate, Trial 11: turned at those, it took ~1 s to get their back to their man)
      const boxing = this.stance === 'boxout';
      if (this.kind === 'player' && !this.clip && this.gaitOn && this.speed > 1.5 && this.speed < 9 && Math.abs(dA) > 0.6 && !boxing) {
        // (judged over the next ~60 deg: a bigger turn goes round in stages, a step at a time, the way a player
        // drop-steps to go the other way; judged over all of it, a half turn could never go, the feet change sides)
        const dC = U.clamp(dA, -1.05, 1.05);
        const c = Math.cos(this.facing), s = Math.sin(this.facing), cd = Math.cos(dC), sd = Math.sin(dC);
        let ok = true;
        for (const f of this.feet) {
          if (f.state !== 'plant') continue;
          const dx = f.x - this.x, dy = f.y - this.y, fwd = dx * c + dy * s, lat = dx * s - dy * c;
          if ((f.side ? 1 : -1) * (lat * cd + fwd * sd) < 0.02 * this.H) ok = false;
        }
        this._turnWait = ok ? 0 : (this._turnWait || 0) + dt;
        if (!ok && this._turnWait < 0.3) rate *= 0.25;
      } else this._turnWait = 0;
      // (a defender opening up out of a slide or a backpedal turns his hips over a crossover step, ~90 deg in ~0.35 s,
      // Tune.gait.openUpRate: swung round at the run's 8 rad/s over a foot planted out wide, the hip ran out of range
      // and the foot was torn off the floor, the ankle jumping ~2 ft, Trial 5)
      const stO = A.STANCE[this.stance];
      if (stO && stO.slide && this.gaitOn && !this.clip && !boxing && Math.max(this.latK || 0, this.backK || 0) > 0.3) rate = Math.min(rate, M.Tune.gait.openUpRate);
      this._turnRate = rate;
      this._faceStep(want, rate, this.turnAcc * (this.paceK || 1), dt);
    }
    /** the facing turns as a body does (Trial 4): the turn rate builds up and eases off at the body's angular
     *  acceleration (`alpha`, rad/s^2; less for a bigger, heavier body) up to `rate`, braking so it stops at `want`
     *  (before, it turned at its full rate from the first step to the last: 59% of turns started instantly) */
    _faceStep(want, rate, alpha, dt) {
      if (!(dt > 0)) return;
      // (never past a body's own limit, Tune.weight.turnAccelMax: a move's quicker turn, clipTurnK, on a light body
      // reached ~210 rad/s^2)
      alpha = Math.min(alpha, M.Tune.weight.turnAccelMax);
      const dA = U.wrapPi(want - this.facing), w0 = this.faceW || 0;
      const wDes = Math.sign(dA) * Math.min(rate, Math.sqrt(2 * alpha * 0.85 * Math.abs(dA)));
      const w = w0 + U.clamp(wDes - w0, -alpha * dt, alpha * dt);
      // (settled on the target, from a turn slow enough to stop in one step: settled from any turn it still had after
      // braking this step, a turn at ~3 rad/s stopped dead in one step when its target came back to meet it; now it
      // goes a little past and comes back, Trial 4)
      if (Math.abs(dA) < 2e-3 && Math.abs(w0) < alpha * dt) { this.faceW = 0; this.facing = U.wrapPi(want); return; }
      this.faceW = w;
      this.facing = U.wrapPi(this.facing + w * dt);
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
      // how fast the body is turning (smoothed): a foot landing on a curve is set down already turned the way the
      // body will face while it is on the floor, instead of being left behind as the body turns over it
      if (dt > 0) {
        const fr = this._facePrev == null ? 0 : U.clamp(U.wrapPi(this.facing - this._facePrev) / dt, -4, 4);
        this.faceRate = (this.faceRate || 0) + (fr - (this.faceRate || 0)) * (1 - Math.exp(-dt / 0.12));
        this._facePrev = this.facing;
      }
      if (!this.gaitOn && sp > 1.4) this._startGait();
      else if (this.gaitOn && sp < 0.6 && this._feetSettled()) this.gaitOn = false;
      // (stopped with a foot still in a gait swing: at a standstill the gait's clock barely moves and the foot hung in the air
      // ~0.4 s, the feet a walk's width apart meanwhile; it comes down now in a quick step to its stance spot, Trial 11)
      if (this.gaitOn && sp < 0.6) for (const f of this.feet) if (f.state === 'swing' && f.mode === 'gait' && f.liftT != null && this.time - f.liftT > M.Tune.gait.stopSwingS) this._swingToStance(f, stanceOf(this, this.stance));
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
        // accelerating hard: quicker, shorter steps (a sprinter's step rate is near its top within the first few
        // steps out of a start while the step length keeps growing for many more)
        const accF = Math.max(0, this.ax * this.moveDirX + this.ay * this.moveDirY);
        let sps = A.stepsPerSec(Math.min(this.maxSpeed, sp + accF * 0.3), H);
        // running, the foot is on the floor over about the same distance at any pace (the leg sweeps a set arc under
        // the hips, ~0.82 of its length: from ~0.8 ft ahead of them to ~1.8 ft behind), so the faster the run, the
        // shorter the contact: ~0.25 s jogging, ~0.19 s at 15 ft/s, ~0.1 s sprinting. (A set share of the stride kept
        // the foot down longer than the leg could reach at speed: it landed reaching out ahead, the hips sank to meet
        // it through the end of each flight, and the foot behind had to leave early)
        const runW = gp.w.jog + gp.w.sprint;
        if (runW > 0.001 && sp > 1) {
          const bGeo = U.clamp(0.82 * (this.dims.th + this.dims.sh) * sps / (2 * sp), 0.15, 0.37);
          gp.beta = gp.w.walk * 0.6 + runW * bGeo;
        }
        // (blended, not switched: a hard switch changed the swing foot's lift and timing in a single frame)
        // (and the blends follow the way he goes over Tune.gait.dirBlendS, not frame by frame: a defender opening up
        // out of a slide turns his hips 90 deg in ~0.25 s, and the slide's stepping and pose went to a run's in four
        // frames, the hands, toes and knees popping, Trial 5)
        const kDir = dt > 0 ? 1 - Math.exp(-dt / M.Tune.gait.dirBlendS) : 0, fresh = this._dirT !== this._gaitN;
        this._dirT = this._gaitN;
        const nfw0 = U.smooth((0.6 - fwdDot) / 0.2), lat0 = U.smooth((0.88 - Math.abs(fwdDot)) / 0.4), back0 = U.smooth((-fwdDot - 0.15) / 0.3);
        this._nfw = fresh || this._nfw == null ? nfw0 : this._nfw + (nfw0 - this._nfw) * kDir;
        this._latS = fresh || this._latS == null ? lat0 : this._latS + (lat0 - this._latS) * kDir;
        this.backK = fresh || this.backK == null ? back0 : this.backK + (back0 - this.backK) * kDir;
        const nfw = this._nfw;
        if (nfw > 0) { sps *= 1 + 0.12 * nfw; gp.lift *= 1 - M.Tune.floor.backLiftCut * nfw; gp.beta = U.lerp(gp.beta, Math.max(gp.beta, 0.45), nfw); gp.toePitch *= 1 - 0.4 * nfw; }
        // going backwards the foot comes down toes first, the heel lowering after (backward walking's initial contact is
        // the toe, not the heel); reaching back heel first held the ankle at the end of its bend in the air, the toes
        // through the floor and the lift out of it jumping about, the toes popping as each step came down (Trial 5)
        if (this.backK > 0) gp.landPitch = U.lerp(gp.landPitch, M.Tune.gait.backLandDeg * D, this.backK);
        // lateral movement: step-slide (lead foot lands ahead, trail foot behind; feet never cross)
        const latK = this._latS;
        if (latK > 0) {
          // (a quick sidestep out of a narrow stance widens it, so the closing foot stays clear of the other)
          const slideW = U.lerp(0.12 + 0.05 * U.smooth((sp - 4) / 4), 0.2, this.stP.slide);
          // cadence checked against a motion-captured defensive slide (CMU 102_27): at 10-12 ft/s it is a lateral
          // bound (both feet land nearly together, ~2 bounds/s) with the gap between the feet swinging from ~0.14 H to
          // ~0.66 H; with alternating steps that width range needs ~5 steps/s at 10 ft/s (the old ~7 was a pitter-patter)
          const ks = this.stP.slide;
          // (a slide is a push and a reach, not a patter. The feet never cross, so a step can only open the gap
          // between them from nearly together to a wide reach: the body goes ~0.3 H per step at most, and past that
          // the steps have to come quicker. A slow slide takes ~1.2 ft steps ~4 times a second, a quick one (~11-12
          // ft/s, the top pace elite players hold over a 5 m shuffle test) ~2 ft steps ~6 times a second)
          // (a sidestep out of any other stance is a smaller version: ~0.75 ft steps ~2.7 times a second at a slow
          // shuffle, ~1 ft ~4 times a second at 4 ft/s; the old ~4-5 half-foot steps a second at a walking pace read
          // as a spider. Steps no longer than ~0.15 H: from a stance this narrow a longer one brings the closing foot
          // in against the other; going faster, the steps quicken until he turns and runs instead)
          const slideStep = U.clamp(0.75 + 0.1 * sp, 0.9, 0.3 * H), sideStep = U.clamp(0.55 + 0.1 * sp, 0.7, 0.15 * H);
          const slideSps = U.lerp(U.clamp(sp / sideStep, 2.2, 5.6), U.clamp(sp / slideStep, 2.6, 6.4), ks);
          gp.halfW = U.lerp(gp.halfW, slideW, latK);
          gp.reach = U.lerp(gp.reach, 0.5, latK);
          // (a slide's shuffle clears the floor by a couple of inches: at 0.035 H the lowest 1-2% of steps at a slow
          // slide scraped under 0.75 in, and any lower hips took more under, Trials 3 and 4)
          gp.lift = U.lerp(gp.lift, M.Tune.floor.slideLiftH + 0.02 * ks * U.smooth((sp - 6) / 6), latK);
          // (a slide's feet share the floor for long, but faster than a slide goes, a shuffle's ground contact
          // shortens like a runner's: at 0.56 a foot stayed down over ~3 ft at 16 ft/s)
          gp.beta = U.lerp(gp.beta, U.lerp(0.56, 0.36, U.smooth((sp - 8) / 6)), latK);
          gp.toePitch = U.lerp(gp.toePitch, 12 * D, latK);
          gp.landPitch = U.lerp(gp.landPitch, 4 * D, latK);
          // (and its swing is a shuffle's, not a runner's: no heel kick drawn in under the hip, no push off the toes into
          // the swing; a quick slide took them from its pace, and the foot swung in toward the hip and back out to its
          // wide landing mid-swing, the toes popping, Trial 5)
          gp.run = U.lerp(gp.run, 0, latK);
          sps = U.lerp(sps, slideSps, latK);
        }
        this.latK = latK;
        // braking hard: short, quick steps (a player chops his feet to stop: Tune.weight.brakeSps)
        const bkS = (this.brakeK || 0) * (1 - latK);
        if (bkS > 0) sps = U.lerp(sps, Math.max(sps, M.Tune.weight.brakeSps * Math.sqrt(6.6 / H)), bkS);
        // the stride's shape follows speed changes over ~0.1 s: a sudden speed change (a bump) re-scaled the swing
        // share against a new stance share in one frame and threw the swing foot backwards
        const gs = this.gpS || (this.gpS = {});
        const kg = gs.beta == null ? 1 : 1 - Math.exp(-dt / 0.08), kb = gs.beta == null ? 1 : 1 - Math.exp(-dt / 0.035);
        for (const k of GAIT_SMOOTH) { gs[k] = gs[k] == null ? gp[k] : gs[k] + (gp[k] - gs[k]) * (k === 'beta' ? kb : kg); gp[k] = gs[k]; }
        // a planted foot falling behind (a cut, a burst out of a stop): the steps quicken, the way a player's feet
        // hurry to get back under him, so the swinging foot lands and the one behind can go
        let lagMax = 0;
        for (const f of this.feet) {
          if (f.state !== 'plant') continue;
          const side = f.side ? 1 : -1;
          const an = this._ankleFromBall(f.x, f.y, f.yaw, f.pitch, TD);
          lagMax = Math.max(lagMax, -((an[0] - this.x - s * side * this.dims.hipX) * this.moveDirX + (an[1] - this.y + c * side * this.dims.hipX) * this.moveDirY));
        }
        // (measured against where this stride's toe-off normally is, so a steady run is never hurried; eased: it
        // used to drop back in one frame as the foot behind lifted, and the swinging foot lurched)
        const lagOn = Math.min(0.26 * H, (1 - gp.reach) * gp.beta * sp * 2 / sps + 0.05 * H);
        // (not in a slide: its trailing foot is meant to be behind, and hurrying it made the feet patter)
        const bT = 1 + 0.8 * U.smooth((lagMax - lagOn) / (0.1 * H)) * (1 - latK);
        this._boost = (this._boost || 1) + (bT - (this._boost || 1)) * (1 - Math.exp(-dt / (bT > (this._boost || 1) ? 0.05 : 0.15)));
        // (however hurried, never quicker than ~4.8 steps/s, about the most a sprinter's legs turn over; a slide keeps
        // its own rhythm)
        sps = Math.min(sps * this._boost, Math.max(4.8 * Math.sqrt(6.6 / H), latK > 0.5 ? sps : 0));
        // the stride cycle runs on the distance the body travels: a stride is two steps of speed / cadence, so a
        // cycle is (distance / stride length) = cadence x time / 2, and the feet step exactly as far as the body goes.
        // (written on the clock so a foot already in the air still lands on time when the body stops under it: run
        // on the distance alone, a swing hung in the air beside the other leg as the speed ran out)
        const dphi = sps * 0.5 * dt;
        let ph0 = this.phase, ph1 = ph0 + dphi;
        this.phase = ph1 - Math.floor(ph1);
        // (whole cycles since the gait started: which stride a foot's toe-off belongs to)
        this.phaseN = (this.phaseN || 0) + Math.floor(ph1);
        const cycleT = 2 / sps;
        const strideLen = sp * cycleT;
        // (the stride time the landing spots are predicted with follows the cadence on a critically damped spring,
        // Tune.gait.predictCycleS: the cadence quickening for a foot left behind moved the time to landing, and with it
        // where the body will be, by up to ~5 in a frame, and a folded knee turned ~26 deg with it, Trial 5)
        if (!(this._cyP > 0) || !(dt > 0) || dt > 0.12) { this._cyP = cycleT; this._cyV = 0; }
        else {
          const w = 1 / M.Tune.gait.predictCycleS, ek = Math.exp(-w * dt), x = this._cyP - cycleT, j = this._cyV + w * x;
          this._cyP = cycleT + (x + j * dt) * ek; this._cyV = (this._cyV - j * w * dt) * ek;
        }
        const cycleP = this._cyP;
        // (a step's own flight, both feet off the floor: longer than that is a skip, see _steer)
        this._flightS = Math.max(0, 0.5 - gp.beta) * cycleT;
        // (read by the animation lab's gait readout)
        const gd = this.gaitDbg || (this.gaitDbg = {});
        gd.sps = sps; gd.stride = strideLen; gd.cycle = cycleT; gd.beta = gp.beta;
        // one leg at a time: a foot leaves the floor only while the other one is down, or has been in its stride for
        // over half a step, and never twice running while the other has not moved (a catch-up step of one foot
        // starting with the other's stride, or two lifts in one frame, read as a two-footed hop)
        const stepT = cycleT / 2, minLag = 0.55 * stepT;
        // (a runner's feet are both off the floor for a moment between strides, so running a foot may leave once the
        // other is well into its swing; a quick step of the other foot (a recovery or stance step) counts once most
        // of it is done)
        // (a runner's rear foot leaves as the front one reaches out to land, ~2/3 through its swing; a walker's
        // only as the front one comes down)
        // (a sprinter's stance is short: the rear foot's toe-off comes when the front one is only half way through
        // its swing, 0.5 / (1 - stance share) of it; held for a set 60 % it stayed down past its reach and dragged)
        const swOk = Math.min(U.lerp(0.85, 0.6, U.smooth((sp - 5) / 5)), 0.5 / (1 - gp.beta) - 0.05);
        const behindOf = (q) => -((q.x - this.x) * this.moveDirX + (q.y - this.y) * this.moveDirY);
        // the same foot twice running: never two strides; after a small stance or clip step only if it is clearly
        // the foot left behind (blocking it outright kept it planted behind for most of the first stride)
        const repeat = (f) => {
          if (this._lastSwing !== f.side || this.time - (f.liftT == null ? -9 : f.liftT) >= 1.6 * stepT) return false;
          if (f.liftKind === 'gait') return true;
          const o = this.feet[1 - f.side];
          return o.state === 'plant' && behindOf(f) < behindOf(o) + 0.06 * H;
        };
        // (`hurry`: a foot left behind at a sprint, the leg at full stretch, goes once the other one is a third of
        // the way through its swing: a runner's feet are both off the floor there anyway, and held down it dragged)
        const canLift = (f, hurry) => {
          const o = this.feet[1 - f.side];
          if (o.state !== 'plant') {
            const since = this.time - (o.liftT == null ? -9 : o.liftT);
            if (o.mode === 'gait' ? since < Math.max(minLag, 0.09) || (o.sw || 0) < (hurry ? Math.min(swOk, 0.35) : swOk) : (o.s || 0) < 0.92) return false;
            // (and it really is out in front: a swing that started far back, a foot catching up, can be most of the
            // way through its time still level with this one, and both feet were in the air side by side)
            if (o.mode === 'gait' && (o.sw || 0) < 0.92) {
              const a = this._ankleFromBall(f.x, f.y, f.yaw, f.pitch, TF);
              if ((o.ax - a[0]) * this.moveDirX + (o.ay - a[1]) * this.moveDirY < 0.14 * H) return false;
            }
          }
          return !repeat(f);
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
          // recovery step: a quick step on its own clock that joins the stride where it lands
          const recover = (f, why) => {
            const side = f.side ? 1 : -1, rx = s, ry = -c;
            const lead = 0.18;
            // targets place the ankle; the ball of the foot (f.x, f.y) is one foot-length-to-ball further along the foot
            const tx = this.x + vx * lead + this.moveDirX * gp.reach * gp.beta * strideLen + rx * side * gp.halfW * H + c * this.dims.ball;
            const ty = this.y + vy * lead + this.moveDirY * gp.reach * gp.beta * strideLen + ry * side * gp.halfW * H + s * this.dims.ball;
            this._sepTarget(f, tx, ty, TD);
            this._beginStep(f, TD[0], TD[1], this.facing + (f.side ? -1 : 1) * 7 * D, 0.17, Math.max(0.03, gp.lift * 0.5));
            // (the spot keeps up with the body while the foot is in the air: a player speeding up left a step aimed
            // at where he was going to be behind him)
            f.trk = { reach: gp.reach * gp.beta * strideLen, lat: side * gp.halfW * H }; f.liftKind = 'gait'; f.liftWhy = why;
          };
          if (f.state === 'plant' && tooFar && !crossed(ph0, ph1, lph) && this.feet[1 - f.side].state === 'plant' && canLift(f) && this.time - landedAt(f) >= M.Tune.floor.minStanceS) {
            // (a foot left too far behind: a sharp speed change or turn)
            recover(f, 'recover');
          }
          // a stance foot left behind the hip and out of the leg's reach even up on its toes lifts now, a little
          // before its scheduled toe-off (dragging it on the toes read as skating)
          const relNow = frac(this.phase - cph);
          const early = f.state === 'plant' && !tooFar && relNow < gp.beta && relNow > 0.45 * gp.beta &&
            (sp > 9 || this.feet[1 - f.side].state === 'plant') && (this._stanceOutOfReach(f, c, s) || this._hipAtRange(f));
          // a planted foot the body has run away from (a burst, a cut, a stride planned for a slower speed) goes now
          // instead of dragging behind with the leg stretched out: a walker's toe-off is ~0.24 H behind the hip, a
          // runner's ~0.2 H; past ~0.3 H it lifts, once the other foot is down (running: well into its swing)
          let late = false;
          if (f.state === 'plant' && sp > 2.5) {
            const side = f.side ? 1 : -1;
            const hx = this.x + s * side * this.dims.hipX, hy = this.y - c * side * this.dims.hipX;
            const an = this._ankleFromBall(f.x, f.y, f.yaw, f.pitch, TD);
            const behind = -((an[0] - hx) * this.moveDirX + (an[1] - hy) * this.moveDirY);
            late = behind > U.lerp(0.3, 0.27, U.smooth((sp - 6) / 6)) * H;
          }
          // (a toe-off held back by the one-leg-at-a-time rule goes as soon as it is allowed, while there is still
          // most of a swing left before the contact; later than that the foot waits for its next stride)
          if (f.liftPending && (f.state !== 'plant' || relNow > 0.82)) f.liftPending = false;
          // the toe-off is due when the phase passes it, or when the toe-off point passed the phase: speeding up
          // shortens the stance share faster than the phase moves, and the lift was skipped (the foot stayed down
          // for a whole stride while the body ran away from it)
          const cyc = (this.phaseN || 0) + Math.floor(this.phase - cph);
          const due = crossed(ph0, ph1, lph) || (f.state === 'plant' && f.liftCyc !== cyc && relNow >= gp.beta && relNow < gp.beta + 0.2 &&
            !(f.tStep != null && this.time - f.tStep < 0.15));
          // a planted foot the body has run away from while the other was in the air: its hip at the end of its range
          // even with the pelvis held back over it (the hip guard's shift past Tune.hipGuard.stepAtH) steps now
          const strained = f.state === 'plant' && (f.strain || 0) > M.Tune.hipGuard.stepAtH;
          // (and a foot that just landed stays down a moment first, unless the body has run away from it)
          // (never under Tune.floor.hardMinStanceS, though: lifted a frame or two after landing, a step never showed a stance)
          const onFloor = this.time - landedAt(f);
          const settled = onFloor >= M.Tune.floor.minStanceS || ((strained || sp > 18) && onFloor >= M.Tune.floor.hardMinStanceS - 1e-6);
          if (f.state === 'plant' && settled && (early || late || due || f.liftPending || strained)) {
            // the stride's turn says this foot, but the other one is planted further behind: that one goes (the
            // stride flips half a cycle), else it would be dragged through this whole swing
            const o = this.feet[1 - f.side];
            if (due && !late && o.state === 'plant' && sp > 1) {
              // (also when this one just made a small step and the other is no further ahead: the other goes)
              const bF = behindOf(f), bO = behindOf(o);
              if ((bO > bF + 0.1 * H || (repeat(f) && bO > bF - 0.05 * H)) && canLift(o) && this.time - landedAt(o) >= M.Tune.floor.minStanceS) {
                this.phase = frac(this.phase + 0.5);
                ph0 = frac(ph0 + 0.5); ph1 = ph0 + dphi;
                this._liftStart(o);
                o.state = 'swing'; o.mode = 'gait'; o.pax = null;
                // (its swing is worked out from the next step on: until then it is where it leaves the floor, not where
                // its last swing ended, which after a placement was up to 55 in away, Trial 4)
                o.ax = o.x0; o.ay = o.y0; o.az = o.z0;
                o.nSwing = (o.nSwing || 0) + 1;
                o.liftRel = frac(this.phase - (o.side ? 0 : 0.5));
                o.liftPending = false; o.liftT = this.time; this._lastSwing = o.side; o.liftKind = 'gait'; o.liftWhy = 'flip';
                o.liftCyc = (this.phaseN || 0) + Math.floor(this.phase - (o.side ? 0 : 0.5));
                f.liftPending = false;
                continue;
              }
            }
            // (held back far past that, it goes even with the other foot still in the air: a quick skip, the way a
            // body run past its foot really springs off it)
            if (canLift(f, (late && sp > 9) || strained) || (f.strain || 0) > M.Tune.hipGuard.forceStepAtH) {
              // (a foot going this close to its own contact point in the stride would have to land almost at once: it
              // takes a quick step instead; Trial 3: lifted late in the same frame the stride landed it, it jumped to
              // the spot of an old step, 19 in)
              // (the same for a foot still down as the stride passes its contact point: its swing would start and end now)
              if ((1 - relNow) * cycleT < M.Tune.floor.minSwingS || crossed(ph0, ph1, cph)) { recover(f, early ? 'early' : late ? 'late' : strained ? 'strain' : 'short'); continue; }
              // lift off
              this._liftStart(f);
              f.state = 'swing'; f.mode = 'gait'; f.pax = null;
              f.nSwing = (f.nSwing || 0) + 1;
              // the swing runs from here to the contact (its share of the stride fixed now, so later changes of
              // speed do not move the foot)
              // (a lift whose toe-off point the phase had passed, 'missed', is timed from that point only for the last
              // couple of frames, as a sprinter's is, the ankle already moving as the heel came up: timed from it after
              // a longer wait, a first step began up to ~45% through its swing, the foot 8 in along in one frame, Trial 5)
              const onTime = crossed(ph0, ph1, lph);
              f.liftRel = early || late || strained || f.liftPending ? relNow : onTime ? Math.min(relNow, gp.beta) : Math.max(gp.beta, relNow - 2 * dphi);
              // (why it went, for the audits)
              f.liftWhy = early ? 'early' : late ? 'late' : strained ? 'strain' : f.liftPending ? 'pend' : crossed(ph0, ph1, lph) ? 'due' : 'missed';
              f.liftPending = false; f.liftT = this.time; this._lastSwing = f.side; f.liftCyc = cyc; f.liftKind = 'gait';
            } else if (due) f.liftPending = true;
          }
          // (a swing on its own clock, a late lift's, lands when its time is up instead: see below)
          const ownClock = f.state === 'swing' && f.mode === 'gait' && f.swDur > 0 && f.tsSw === this._swingId(f);
          if ((ownClock ? this.time - f.liftT >= f.swDur - 1e-9 : crossed(ph0, ph1, cph)) && f.state === 'swing' && f.mode === 'gait' && f.liftT !== this.time) {
            // walkers (and most joggers) land heel first with the toes up, then roll the forefoot down; a sprinter lands
            // on the ball of the foot with the heel up, which then settles (Trial 3: held at flat, no landing was ever
            // forefoot first)
            f.state = 'plant'; f.x = f.tx; f.y = f.ty; f.yaw = f.tyaw; f.pitch = gp.landPitch; f.hs = f.pitch < 0; f.fs = f.pitch > 0;
            f.sw = 0; f.tPlant = this.time; f.liftRel = null;
            this._plantHere(f);
            if (this.view && this.view.onCue) this.view.cue('plant', this, f);
          }
          const rel = frac(this.phase - cph);
          // (a foot put down by a quick step in the stride too: Trial 3, left pointing where the body faced when the step
          // began, it stayed up to ~100 deg off a body still turning, the knee far off its toes)
          if (f.state === 'plant') {
            // turning hard over a planted foot (a cut, a reversal): it pivots on its ball past ~30 deg instead of
            // staying pointed the old way while the hips and knee go round (the leg twisted, the knee far off line);
            // the heel comes up for it (Trial 3: turned flat on the floor, the heel and toes swept the floor)
            // (Trial 3: with the heel up for it the pivot starts at ~18 deg; at 30 a foot on a curve stayed ~30 deg off
            // the way he was going for most of its time on the floor)
            const ye = U.wrapPi(this.facing + (f.side ? -1 : 1) * 7 * D - f.yaw), pz = M.Tune.floor.pivot.gaitFreeDeg * D;
            this._pivotFoot(f, Math.abs(ye) > pz ? f.yaw + Math.sign(ye) * (Math.abs(ye) - pz) : f.yaw, dt, 14);
          }
          if (f.state === 'swing' && f.mode === 'gait') {
            const b0 = f.liftRel != null ? f.liftRel : gp.beta;
            // (a foot lifted so late that the stride leaves it less than Tune.gait.lateSwingS to reach its contact, or
            // less than most of its gait's own swing if that is shorter, swings on its own clock for that long and lands
            // a little after the stride's contact point, the rhythm going on: thrown forward in the time left, 0.16 s,
            // a late lift at a turn swung the knee from 60 to 99 deg in a frame, Trial 5)
            if (f.tsSw !== this._swingId(f)) {
              f.tsSw = this._swingId(f);
              const tMin = Math.min(M.Tune.gait.lateSwingS, 0.9 * (1 - gp.beta) * cycleT);
              f.swDur = (1 - b0) * cycleT < tMin ? tMin : 0;
            }
            const own = f.swDur > 0;
            const sw = own ? U.clamp((this.time - f.liftT) / f.swDur, 0, 1) : rel < b0 ? 0 : U.clamp((rel - b0) / (1 - b0), 0, 1);
            // predicted landing
            const tLeft = own ? (1 - sw) * f.swDur : (1 - sw) * (1 - b0) * cycleP;
            const axc = U.clamp(this.axF || 0, -25, 25), ayc = U.clamp(this.ayF || 0, -25, 25);
            let px = this.x + vx * tLeft + 0.5 * axc * tLeft * tLeft, py = this.y + vy * tLeft + 0.5 * ayc * tLeft * tLeft;
            // a body that is braking stops; it does not reverse (the quadratic sent the landing spot a foot or more
            // behind a player settling to a stop, and the swing foot flew back and forth)
            const aPar = sp > 0.05 ? (axc * vx + ayc * vy) / sp : 0;
            if (aPar < 0) {
              const ux = vx / sp, uy = vy / sp, tS = Math.min(tLeft, sp / -aPar);
              const dPar = sp * tS + 0.5 * aPar * tS * tS, apx = axc - aPar * ux, apy = ayc - aPar * uy;
              px = this.x + ux * dPar + 0.5 * apx * tLeft * tLeft; py = this.y + uy * dPar + 0.5 * apy * tLeft * tLeft;
            } else if (sp <= 0.05 && axc * this.moveDirX + ayc * this.moveDirY <= 0) {
              // (just stopped: what is left of the braking is not a start the other way; Trial 3: the spot the hip would
              // be at contact was put ~4 ft behind him, and the pelvis dropped a foot to reach the landing from there)
              px = this.x; py = this.y;
            }
            const reach = gp.reach * gp.beta * strideLen;
            const side = f.side ? 1 : -1;
            // (turning: aimed where the body will face half way through the foot's time on the floor, its heading and
            // which side of the body it lands on: set out to the side of a body still turning, opening up out of a
            // shuffle, the step landed behind him)
            const turnAhead = U.clamp((this.faceRate || 0) * (tLeft + 0.5 * gp.beta * cycleT), -0.5, 0.5);
            const rx = Math.sin(this.facing + turnAhead), ry = -Math.cos(this.facing + turnAhead);
            // (going forward, the toes point where he is going, not only where his hips face: a body turned a little
            // off its path, watching the ball, still runs on feet pointed down the path; Trial 3: 20% of forward
            // stance frames had the toes over 20 deg off the path)
            const kTr = M.Tune.floor.toesFollowTravel * U.smooth((fwdDot - 0.7) / 0.2) * U.smooth((sp - 3) / 3) * (1 - latK);
            const trA = kTr > 0 ? U.wrapPi(Math.atan2(this.moveDirY, this.moveDirX) - this.facing - turnAhead) * kTr : 0;
            f.tyaw = this.facing + turnAhead + trA + (f.side ? -1 : 1) * 7 * D;
            // `reach` places the ankle ahead of the body at contact; the ball of the foot lies d.ball further along the foot
            let ntx = px + this.moveDirX * reach + rx * side * gp.halfW * H + Math.cos(f.tyaw) * this.dims.ball;
            let nty = py + this.moveDirY * reach + ry * side * gp.halfW * H + Math.sin(f.tyaw) * this.dims.ball;
            // (the foot goes down where the leg can push the body the way it has to go, out against the push: out ahead
            // braking, to the outside of a cut, a share of the lean a body needs for it, tan = a / g from the foot to the
            // hips; speeding up the stride already puts it under him. Tune.weight.footLead, Trial 4)
            {
              const TW = M.Tune.weight, fax = this.axF || 0, fay = this.ayF || 0, along = fax * this.moveDirX + fay * this.moveDirY;
              const lx = fax - Math.max(0, along) * this.moveDirX, ly = fay - Math.max(0, along) * this.moveDirY;
              const kk = TW.footLead * 0.55 * H / 32.2, ol = Math.hypot(lx, ly) * kk, om = TW.footLeadMaxH * H;
              let ox = 0, oy = 0;
              if (ol > 1e-4) { const q = Math.min(1, om / ol); ox = -lx * kk * q; oy = -ly * kk * q; }
              // (decided early in the swing and eased, then held: moved with the push all the way down, the landing
              // spot twitched and the knees and toes popped)
              const sid = this._swingId(f);
              if (f.leadSw !== sid) { f.leadSw = sid; f.leadX = ox; f.leadY = oy; }
              const kl = (1 - Math.exp(-dt / TW.poseHalfLifeS)) * (1 - U.smooth((sw - TW.leadFreezeSw) / 0.3));
              f.leadX += (ox - f.leadX) * kl; f.leadY += (oy - f.leadY) * kl;
              ntx += f.leadX; nty += f.leadY;
            }
            // (on its own side of the other foot: moving sideways or on a diagonal the stride used to land it across)
            this._sepTarget(f, ntx, nty, TD); ntx = TD[0]; nty = TD[1];
            // (never further from where the hip will be at contact than the leg reaches with the pelvis settled a little,
            // Tune.floor.landSettleH: turning hard, the aim swung out wide and the pelvis dropped up to a foot to reach
            // it, Trial 3)
            if (this._hipZPose != null) {
              const hx = px + rx * side * this.dims.hipX, hy = py + ry * side * this.dims.hipX;
              const a0 = this._ankleFromBall(ntx, nty, f.tyaw, gp.landPitch, TB);
              const vz = this._hipZPose - 0.012 * H - M.Tune.floor.landSettleH * H - a0[2];
              const Lr = (this.dims.th + this.dims.sh) * U.lerp(0.9986, 0.975, U.smooth((sp - 6) / 2.5));
              const dhMax = Math.sqrt(Math.max(0.01, Lr * Lr - vz * vz)), ex = a0[0] - hx, ey = a0[1] - hy, dh = Math.hypot(ex, ey);
              if (dh > dhMax) { ntx -= ex * (1 - dhMax / dh); nty -= ey * (1 - dhMax / dh); f.aimCut = (f.aimCut || 0) + 1; }
            }
            // a foot in the air can re-aim, but only so fast (no teleporting landing spot on a cut or a stop), and less
            // and less over the end of the swing (Tune.gait.strideAimFreezeSw: re-aimed to the last frame, it came down
            // still moving and the toes popped, Trial 5)
            if (f.swT === this._swingId(f) && f.swLastT != null) {
              const TGa = M.Tune.gait.strideAimFreezeSw;
              const mv = (14 + sp) * Math.max(dt, 1 / 240) * (1 - U.smooth((sw - TGa) / (1 - TGa))), ddx = ntx - f.tx, ddy = nty - f.ty, dl = Math.hypot(ddx, ddy);
              if (dl > mv) { ntx = f.tx + ddx * mv / Math.max(dl, 1e-9); nty = f.ty + ddy * mv / Math.max(dl, 1e-9); }
            }
            f.swT = this._swingId(f); f.swLastT = this.time;
            f.tx = ntx; f.ty = nty;
            // (aimed with the pitch it lands at: a forefoot landing's heel is up, and aimed flat its ankle jumped up on
            // contact)
            const a1 = this._ankleFromBall(f.tx, f.ty, f.tyaw, gp.landPitch, TB);
            f.sw = sw; f.lax = a1[0]; f.lay = a1[1]; f.laz = a1[2]; f.lpx = px; f.lpy = py;
            // (a runner's ankle is already moving forward as the foot rolls off the toes, at about a third of the
            // body's speed; eased out of a standstill, the foot hung back behind the body at speed and pulled the hip
            // past its range just after toe-off)
            const e = U.smooth(sw) + 0.35 * (gp.run || 0) * sw * (1 - sw) * (1 - sw);
            // sin^2 starts with zero vertical speed (the old sin^1.1 of sw^0.62 threw the foot up ~0.4 ft in the first
            // frame after toe-off, snapping the knee), and still peaks early in the swing (~40 %)
            // a runner's heel comes up behind first (the knee folds toward the buttock), stays up while the foot passes
            // under the hip (the knee drives through high), then the shank reaches forward and down to land under
            // the hips with no vertical speed left; a walker keeps a low arc
            const pw = Math.pow(Math.sin(Math.PI * Math.pow(sw, Math.max(0.75, gp.liftPow || 0.8))), 2);
            // (the rise eases in with no jolt at toe-off: smootherstep starts with zero acceleration)
            const ur = Math.min(1, sw / 0.36), pr = sw < 0.36 ? ur * ur * ur * (ur * (ur * 6 - 15) + 10) : 1 - Math.pow(U.smooth((sw - 0.36) / 0.64), 1.5);
            // (the hips dropped for a cut or a brake take a runner's heel kick down with them, up to half of it: at full
            // height the leg folded tight under a low hip and the knee swept up ~20 in in two frames as the ankle passed
            // under it; a walk's or a slide's low arc keeps its clearance)
            const hd = this._hipDrop || 0, lk = hd > 0 ? 1 - (gp.run || 0) * (1 - (this.latK || 0)) * Math.min(0.5, hd / Math.max(1e-3, gp.lift * H)) : 1;
            const lift = gp.lift * H * U.lerp(pw, pr, gp.run || 0) * lk;
            f.ax = f.x0 + (a1[0] - f.x0) * e;
            f.ay = f.y0 + (a1[1] - f.y0) * e;
            f.pdL = tLeft; f.pdS = sw; f.pdX = a1[0]; f.pdY = a1[1]; f.pdT = this.time;
            this._swingClear(f, e, f.x0, f.y0, a1[0], a1[1], lift, dt);
            // a runner's heel comes up behind its own hip, not out to the side: the shank folds in the leg's own
            // plane while the foot passes under the body, so the ankle eases over toward the hip's line as the heel
            // rises and back out to where it lands as it comes down
            // (following the heel's own rise and fall, the swing's lift shape, and never further than Tune.gait.foldMaxH:
            // switched in over the lift from 0.05 to 0.15 H, it came in over a frame or two, and a foot leaving the floor
            // wide of the hip, out of a cut or a turn, was pulled up to ~13 in sideways in them, the toes popping, Trial 5)
            const fold = U.lerp(pw, pr, gp.run || 0) * (gp.run || 0);
            if (fold > 0.001) {
              const side = f.side ? 1 : -1, fm = M.Tune.gait.foldMaxH * H;
              const lat = (f.ax - this.x) * s - (f.ay - this.y) * c, dl = U.clamp(side * this.dims.hipX * 0.85 - lat, -fm, fm) * fold;
              f.ax += s * dl; f.ay -= c * dl;
            }
            f.az = f.z0 + (a1[2] - f.z0) * e + lift;
            this._liftReach(f, sw);
            // (off the floor the foot, and the knee with it, comes round to the body's heading early in the swing,
            // left at the old heading a foot planted before a turn carried its knee out to the side; on a curve it
            // turns on into the landing heading only as it comes down)
            const r0 = U.wrapPi(f.yaw0 - this.facing), rb = (f.side ? -1 : 1) * 7 * D, rt = U.clamp(U.wrapPi(f.tyaw - this.facing), -0.7, 0.7);
            f.yawNow = this.facing + U.clamp(U.lerp(U.lerp(r0, rb, U.smooth(sw / 0.3)), rt, U.smooth((sw - 0.55) / 0.45)), -0.7, 0.7);
            // (from the pitch it left the floor with, a foot that left flat tipping toes-down as a foot off the floor hangs,
            // no faster than an ankle turns, Tune.floor.toeTipDegps: tipped in one frame, a first step from a standstill
            // threw the foot 57 deg toes-down and the floor its ankle up ~6.5 in, Trial 4)
            const p0 = f.p0 != null ? f.p0 : gp.toePitch, tip = Math.max(0, gp.toePitch - p0);
            const pS = p0 + Math.min(tip, M.Tune.floor.toeTipDegps * D * Math.max(0, this.time - (f.liftT != null ? f.liftT : this.time) + dt));
            f.pitchNow = U.lerp(pS, gp.landPitch, U.smooth(sw * 1.15)) + Math.sin(Math.PI * sw) * gp.toePitch * 0.25;
          } else if (f.state === 'plant') {
            if (rel < gp.beta) {
              if (f.hs && rel < gp.roll) {
                // heel rocker: the forefoot comes down to the floor after a heel strike
                f.pitch = Math.min(0, gp.landPitch) * (1 - U.smooth(rel / gp.roll));
              } else if (f.fs && rel < gp.roll * 2) {
                // a forefoot landing: the heel settles toward the floor on the ball of the foot
                f.pitch = Math.max(0, gp.landPitch) * (1 - U.smooth(rel / (gp.roll * 2)));
              } else {
                // heel rise toward toe-off (ankle rocker -> forefoot rocker)
                if (f.hs) { f.hs = false; f.pitch = 0; }
                if (f.fs) { f.fs = false; f.pitch = 0; }
                const k = U.clamp((rel - gp.beta * gp.heelOff) / (gp.beta * (1 - gp.heelOff)), 0, 1);
                f.pitch = Math.max(f.pitch, gp.toePitch * k * k);
                // (and far enough that at toe-off the ankle is inside the range it has off the floor: a deep stance's
                // shin leans past it over a flat foot, the weight on it, and a foot lifted that way tipped its toes
                // ~15 deg into the floor in the first frame off it, Trial 5; a foot leaves the floor from its toes)
                const over = this.sk.pose[CH[f.side ? 'rAnk' : 'lAnk']] - (RG.LIM[f.side ? 'rAnk' : 'lAnk'][1] - M.Tune.floor.liftAnkleMarginDeg * D);
                if (over > 0) f.pitch = Math.max(f.pitch, ((f.pitchUsed != null ? f.pitchUsed : f.pitch) + over) * k * k);
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
    /** keeps a foot's landing spot (ball of the foot) on its own side of the other foot: never across it (the left
     *  foot lands left of the right one) and ~6 in apart sideways where the two would sit side by side (feet a
     *  stride apart may land nearly in line, as a runner's do) */
    _sepTarget(f, tx, ty, out) {
      out[0] = tx; out[1] = ty;
      const o = this.feet[1 - f.side];
      // (against where the other foot is, its ankle carried forward to the ball of the foot along its heading, on the
      // floor or in the air: taken from where it stood and then, as it left the floor, from where it was aimed a stride
      // on, the rule moved this foot's landing spot up to ~4 in in one frame and the toes popped, Trial 5)
      let ax, ay, yw;
      if (o.state === 'plant') { const a = this._ankleFromBall(o.x, o.y, o.yaw, o.pitchUsed != null ? o.pitchUsed : o.pitch, TF); ax = a[0]; ay = a[1]; yw = o.yaw; }
      else if (o.state === 'swing' && o.ax != null) { ax = o.ax; ay = o.ay; yw = o.yawNow != null ? o.yawNow : o.yaw; }
      else return out;
      const ox = ax + Math.cos(yw) * this.dims.ball, oy = ay + Math.sin(yw) * this.dims.ball;
      const H = this.H, c = Math.cos(this.facing), s = Math.sin(this.facing), side = f.side ? 1 : -1;
      const dx = tx - ox, dy = ty - oy;
      const fwd = dx * c + dy * s, lat = dx * s - dy * c;
      const need = U.lerp(0.075, 0.025, U.smooth((Math.abs(fwd) - 0.12 * H) / (0.16 * H))) * H;
      const def = need - side * lat;
      if (def > 0) { out[0] += s * side * def; out[1] -= c * side * def; }
      return out;
    }
    /** a swinging foot goes around the planted one: where its straight path (x0,y0 -> x1,y1, ankle) would pass
     *  closer than ~6 in beside it (or through it: a turn, a cut, a sidestep), the whole path bows out to its own
     *  side, sin-shaped over the swing (e: 0..1 along the path), just enough to clear it everywhere; one smooth
     *  bow instead of a nudge where the feet pass (at a sprint that nudge came and went in two frames) */
    _swingClear(f, e, x0, y0, x1, y1, liftNow, dt) {
      const o = this.feet[1 - f.side];
      const H = this.H, c = Math.cos(this.facing), s = Math.sin(this.facing), side = f.side ? 1 : -1;
      // (only a foot low enough to meet the other one needs to go around it: a heel kicked up behind passes over
      // the planted foot, and pushing it out there fanned the folded leg's knee out to the side)
      const hK = liftNow == null ? 1 : 1 - U.smooth((liftNow - 0.06 * this.H) / (0.1 * this.H));
      let Dt = 0;
      if (o.state === 'plant' && hK > 0.001) {
        const a = this._ankleFromBall(o.x, o.y, o.yaw, o.pitch, TE);
        let D = 0;
        for (let i = 1; i < 10; i++) {
          const u = i / 10, dx = x0 + (x1 - x0) * u - a[0], dy = y0 + (y1 - y0) * u - a[1];
          const fwd = dx * c + dy * s, lat = dx * s - dy * c;
          const def = U.lerp(0.08, 0, U.smooth((Math.abs(fwd) - 0.1 * H) / (0.18 * H))) * H - side * lat;
          if (def > 0) D = Math.max(D, def / Math.sin(Math.PI * u));
        }
        Dt = Math.min(D, 0.14 * H) * hK;
      }
      // (how far round it goes eases to what is needed on a critically damped spring, Tune.gait.clearS: the other foot
      // leaving the floor took it all away in one frame and the swinging foot jumped up to ~11 in sideways, Trial 5)
      const id = this._swingId(f);
      if (f.clrSw !== id || !(dt >= 0) || dt > 0.12) { f.clrSw = id; f.clrD = Dt; f.clrV = 0; }
      else if (dt > 0) {
        const w = 1 / M.Tune.gait.clearS, ek = Math.exp(-w * dt), ex = f.clrD - Dt, j = f.clrV + w * ex;
        f.clrD = Dt + (ex + j * dt) * ek; f.clrV = (f.clrV - j * w * dt) * ek;
      }
      if (!(f.clrD > 1e-5)) return;
      const D = f.clrD * Math.sin(Math.PI * U.clamp(e, 0, 1));
      f.ax += s * side * D; f.ay -= c * side * D;
    }
    /** is a planted leg's hip at the end of its range (last solve): spread out past ~46 deg, crossed in past ~26, or
     *  stretched back past ~28 deg? Then the foot steps now (a person steps before the hip gives out) */
    _hipAtRange(f) {
      const p = this.sk.pose, pre = f.side ? 'r' : 'l';
      const A = p[CH[pre + 'HipA']], F = p[CH[pre + 'HipF']];
      return A > 46 * D || A < -26 * D || F < -28 * D;
    }
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
      f.lz = U.clamp(P[jb + 2], 0, 0.8); f.lp = 0; f.lpV = 0;
      f.land = true; f.landKeep = false; f.state = 'plant'; f.tPlant = this.time; f.sw = 0; f.pax = null;
      if (this.view && this.view.onCue) this.view.cue('land', this, f);
    }
    _settleLanding(f, dt) {
      if (!f.land) return;
      if (f.state !== 'plant') { f.land = false; f.lz = 0; f.lp = 0; f.lpV = 0; return; }
      f.lz = f.lz > 0.004 ? f.lz * Math.exp(-dt / 0.035) : 0;
      // (the landing's pitch off the stride's plan eases out on a critically damped spring, Tune.gait.landPitchS)
      if (f.lp) {
        const w = 1 / M.Tune.gait.landPitchS, e = Math.exp(-w * dt), j = (f.lpV || 0) + w * f.lp;
        f.lp = (f.lp + j * dt) * e; f.lpV = ((f.lpV || 0) - j * w * dt) * e;
        if (Math.abs(f.lp) < 0.1 * D && Math.abs(f.lpV) < 2 * D) { f.lp = 0; f.lpV = 0; }
      }
      // (a step's landing keeps the pitch its stride gave it: the heel rocker or a forefoot landing's heel settle)
      if (!f.landKeep) f.pitch = f.pitch > 0 ? Math.max(0, f.pitch - dt * 5.5) : f.pitch;
      if (!f.lz && !f.lp && (f.pitch <= 0 || f.landKeep)) f.land = false;
    }
    _feetSettled() {
      return this.feet[0].state === 'plant' && this.feet[1].state === 'plant';
    }
    _startGait() {
      this.gaitOn = true;
      this.gpS = null;
      // (a new run of steps: the direction blends start where they are, see _locomote)
      this._gaitN = (this._gaitN || 0) + 1;
      this.phaseN = 0; this.feet[0].liftCyc = this.feet[1].liftCyc = null;
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
      // right lifts at beta, left at 0.5+beta (a foot still finishing a small step lands and the planted one makes the
      // first stride: the stepping foot going again at once read as a stutter)
      const rFirst = f0.state !== 'plant' && f1.state === 'plant' ? true : f1.state !== 'plant' && f0.state === 'plant' ? false : d1 < d0;
      this.phase = rFirst ? gp.beta - 0.001 : frac(0.5 + gp.beta - 0.001);
    }

    /**
     * A planted foot turns only as a pivot: on the ball of the foot with the heel up, never flat on the floor (a heel
     * turned on the floor slides; coaching: pivot on the ball). The heel comes up first, the foot turns about its ball
     * (which stays on its spot) at up to `rate` (rad/s) while the heel is clear of the floor, and the heel comes back
     * down once the turn is done (Tune.floor.pivot). Called every frame a foot is planted, with the heading it should
     * have (its own heading: no turn, and a raised heel comes down).
     */
    _pivotFoot(f, want, dt, rate) {
      const T = M.Tune.floor.pivot;
      f.pvT = this.time;
      const e = U.wrapPi(want - f.yaw);
      if (Math.abs(e) > T.startDeg * D) f.pvOn = true;
      else if (Math.abs(e) < T.doneDeg * D) f.pvOn = false;
      f.pvK = U.clamp((f.pvK || 0) + (f.pvOn ? dt / T.upS : -dt / T.downS), 0, 1);
      f.pvPitch = T.pitchDeg * D * U.smooth(f.pvK);
      // (and the heel really was up at the last solve: the hip guard can bring it down to keep the ankle in range, and
      // a foot turning with its heel down slides, Trial 4)
      // (the turn gathers speed and brakes into its heading at an ankle's angular acceleration, Tune.floor.pivot.accel:
      // started at full rate in one frame, a foot landing turned off its heading swung ~13 deg in its first frame on
      // the floor and the toes popped, Trial 5)
      let w = 0;
      if (f.pvOn && Math.max(f.pitch, f.pvPitch, f.heelFloor || 0) >= T.turnAtDeg * D && !(f.pitchUsed < T.turnAtDeg * D) && dt > 0) {
        const al = T.accel, w0 = f.pvW || 0, wWant = Math.sign(e) * Math.min(rate, Math.sqrt(2 * al * Math.abs(e)));
        w = w0 + U.clamp(wWant - w0, -al * dt, al * dt);
        const step = Math.abs(w * dt) > Math.abs(e) && Math.sign(w) === Math.sign(e) ? e : w * dt;
        if (step !== 0) { f.pvPrevYaw = f.yaw; f.pvTurned = this.time; f.yaw = U.wrapPi(f.yaw + step); }
      }
      if (dt > 0) f.pvW = w;
    }

    _stanceFeet(dt) {
      const st = stanceOf(this, this.stance);
      const H = this.H;
      const c = Math.cos(this.facing), s = Math.sin(this.facing);
      const rx = s, ry = -c;
      // any foot still in a gait swing: retarget to stance spot and finish as a step
      for (const f of this.feet) {
        if (f.state === 'swing' && f.mode === 'gait') this._swingToStance(f, st);
        if (f.state === 'plant' && f.pitch > 0) f.pitch = Math.max(0, f.pitch - dt * 4);
        else if (f.state === 'plant' && f.pitch < 0) { f.pitch = Math.min(0, f.pitch + dt * 4); f.hs = false; }
      }
      if (this.clip) return;
      // turning on the spot: the planted feet pivot on the balls of the feet with the body (the heels swing round)
      // instead of staying put while the hips turn away above them (the legs twisted into each other); steps take
      // up the rest. (Also while the other foot is stepping: the foot left down used to stay pointing the old way
      // through a whole turn, its knee 45-55 deg off the leg's line.)
      for (const f of this.feet) {
        if (f.state !== 'plant') continue;
        const iyaw = this.facing + (f.side ? -1 : 1) * st.yaw * D;
        const ye = U.wrapPi(iyaw - f.yaw);
        const pz = M.Tune.floor.pivot.standFreeDeg * D;
        this._pivotFoot(f, Math.abs(ye) > pz ? f.yaw + Math.sign(ye) * (Math.abs(ye) - pz) : f.yaw, dt, 13);
      }
      if (this.feet[0].state === 'swing' || this.feet[1].state === 'swing') return;
      // error-driven stepping
      let worst = null, worstE = 0;
      const stag = this._stag;
      for (const f of this.feet) {
        const o = f.side ? st.R : st.L;
        // (a stagger held for moves between the legs: the lead foot forward, the other a little back)
        const of = o[1] + (stag ? (stag.lead === f.side ? STAG_F : -STAG_B) : 0);
        const ix = this.x + rx * o[0] * H + c * of * H;
        const iy = this.y + ry * o[0] * H + s * of * H;
        const iyaw = this.facing + (f.side ? -1 : 1) * st.yaw * D;
        const de = Math.hypot(f.x - ix, f.y - iy) / H;
        const ye = Math.abs(U.wrapPi(f.yaw - iyaw));
        // (a foot whose hip the guard is holding at the end of its range over it steps first)
        const err = de / 0.075 + ye / (32 * D) + ((f.strain || 0) > M.Tune.hipGuard.stepAtH ? 2 : 0);
        f._ix = ix; f._iy = iy; f._iyaw = iyaw;
        if (err > 1 && err > worstE) { worst = f; worstE = err; }
      }
      // (a foot that just landed stays down a moment before it steps again: a clear plant, stance and lift for each
      // step, Tune.floor.minStanceS; before, a foot could land and lift again within two frames)
      // (held back by the hip guard it may go sooner, but never under Tune.floor.hardMinStanceS)
      const onFloor = worst ? this.time - landedAt(worst) : 9;
      if (worst && onFloor < M.Tune.floor.minStanceS && (!((worst.strain || 0) > M.Tune.hipGuard.stepAtH) || onFloor < M.Tune.floor.hardMinStanceS - 1e-6)) {
        const other = this.feet[1 - worst.side];
        worst = other.state === 'plant' && this.time - landedAt(other) >= M.Tune.floor.minStanceS && other._ix != null &&
          Math.hypot(other.x - other._ix, other.y - other._iy) / H / 0.075 + Math.abs(U.wrapPi(other.yaw - other._iyaw)) / (32 * D) > 0.6 ? other : null;
      }
      if (worst && this.time - (this._lastStepT || 0) > 0.05) {
        // prefer alternating feet when both are off
        const other = this.feet[1 - worst.side];
        if (this._lastFoot === worst.side && other._ix != null && this.time - landedAt(other) >= M.Tune.floor.minStanceS) {
          const de = Math.hypot(other.x - other._ix, other.y - other._iy) / H;
          if (de > 0.05) worst = other;
        }
        // (turning: the step goes to the foot's place for where the body will face when it lands, and keeps
        // re-aiming as the body comes round; aimed where it faced at lift-off, it landed pointing the old way)
        const fe = this.faceIn(0.24), ce = Math.cos(fe), se = Math.sin(fe), oo = worst.side ? st.R : st.L;
        const ex = this.x + se * oo[0] * H + ce * oo[1] * H, ey = this.y - ce * oo[0] * H + se * oo[1] * H;
        this._sepTarget(worst, ex + this.vx * 0.12, ey + this.vy * 0.12, TD);
        this._beginStep(worst, TD[0], TD[1], fe + (worst.side ? -1 : 1) * st.yaw * D, 0.24, M.Tune.floor.stanceStepLiftH);
        worst.stanceStep = true;
      }
    }

    /** a foot in a gait swing finished as a quick step onto its stance spot */
    _swingToStance(f, st) {
      const H = this.H, c = Math.cos(this.facing), s = Math.sin(this.facing), o = f.side ? st.R : st.L;
      f.mode = 'step'; f.s = 0; f.dur = 0.16;
      f.tx = this.x + s * o[0] * H + c * o[1] * H;
      f.ty = this.y - c * o[0] * H + s * o[1] * H;
      f.tyaw = this.facing + (f.side ? -1 : 1) * st.yaw * D;
      f.x0 = f.ax; f.y0 = f.ay; f.z0 = f.az; f.yaw0 = f.yawNow != null ? f.yawNow : f.yaw; f.p0 = f.pitchNow || 0; f.h = 0.02 * H;
    }
    _beginStep(f, tx, ty, tyaw, dur, lift) {
      // (a foot still in the air goes on from where it is: restarted from the spot it last stood on, it jumped back
      // there for a frame)
      const inAir = f.state === 'swing' && f.ax != null;
      f.v0x = 0; f.v0y = 0;
      if (inAir) {
        f.x0 = f.ax; f.y0 = f.ay; f.z0 = f.az; f.yaw0 = f.yawNow != null ? f.yawNow : f.yaw; f.p0 = f.pitchNow || 0; f.l0 = null;
        // (and at the speed it was going: started from rest it stopped dead in the air and set off again, the toes and knee
        // popping, as a layup's first step took over a running stride's foot, Trial 9)
        const dv = (f.paT || 0) - (f.paT2 || 0);
        if (f.pax != null && f.pax2 != null && dv > 1e-4 && dv < 0.05 && this.time - f.paT < 0.05) {
          const vx = (f.pax - f.pax2) / dv, vy = (f.pay - f.pay2) / dv, vl = Math.hypot(vx, vy), k = vl > 30 ? 30 / vl : 1;
          f.v0x = vx * k; f.v0y = vy * k;
        }
      } else this._liftStart(f);
      f.state = 'swing'; f.mode = 'step'; f.s = 0; f.dur = dur; f.trk = null; f.liftKind = 'step';
      f.liftT = this.time; this._lastSwing = f.side; f.liftPending = false;
      f.tx = tx; f.ty = ty; f.tyaw = tyaw; f.h = lift * this.H; f.arc = null; f.stanceStep = false; f.easeOut = false;
      this._lastStepT = this.time; this._lastFoot = f.side;
    }
    _advanceStep(f, dt) {
      f.s = Math.min(1, f.s + dt / Math.max(0.05, f.dur));
      const tk = f.trk;
      if (tk && this.gaitOn && !this.clip) {
        const tLeft = (1 - f.s) * f.dur, c = Math.cos(this.facing), s = Math.sin(this.facing);
        // (turned the way the body will face as it lands, like a stride's landing)
        f.tyaw = this.facing + U.clamp((this.faceRate || 0) * (tLeft + 0.1), -0.5, 0.5) + (f.side ? -1 : 1) * 7 * D;
        let tx = this.x + this.vx * tLeft + this.moveDirX * tk.reach + s * tk.lat + Math.cos(f.tyaw) * this.dims.ball;
        let ty = this.y + this.vy * tLeft + this.moveDirY * tk.reach - c * tk.lat + Math.sin(f.tyaw) * this.dims.ball;
        this._sepTarget(f, tx, ty, TD); tx = TD[0]; ty = TD[1];
        // (and less and less as it comes down, set by Tune.gait.aimFreezeS: aimed at the moving body to the last frame,
        // a quick step in a fast slide came down still moving ~20 ft/s and stopped dead, the toes popping, Trial 5)
        const mv = (14 + this.speed) * Math.max(dt, 1 / 240) * (1 - U.smooth((f.s - M.Tune.gait.aimFreezeS) / (1 - M.Tune.gait.aimFreezeS))), ddx = tx - f.tx, ddy = ty - f.ty, dl = Math.hypot(ddx, ddy);
        if (dl > mv) { tx = f.tx + ddx * mv / Math.max(dl, 1e-9); ty = f.ty + ddy * mv / Math.max(dl, 1e-9); }
        f.tx = tx; f.ty = ty;
      } else if (f.stanceStep && !this.gaitOn && !this.clip && f.s < 0.85) {
        // a step to the stance place while the body turns: re-aimed at where the body will face when it lands
        const st = stanceOf(this, this.stance), H = this.H, o = f.side ? st.R : st.L;
        const fe = this.faceIn((1 - f.s) * f.dur), ce = Math.cos(fe), se = Math.sin(fe);
        let tx = this.x + se * o[0] * H + ce * o[1] * H, ty = this.y - ce * o[0] * H + se * o[1] * H;
        this._sepTarget(f, tx, ty, TD); tx = TD[0]; ty = TD[1];
        const mv = 10 * Math.max(dt, 1 / 240), ddx = tx - f.tx, ddy = ty - f.ty, dl = Math.hypot(ddx, ddy);
        if (dl > mv) { tx = f.tx + ddx * mv / dl; ty = f.ty + ddy * mv / dl; }
        f.tx = tx; f.ty = ty; f.tyaw = fe + (f.side ? -1 : 1) * st.yaw * D;
      }
      const a1 = this._ankleFromBall(f.tx, f.ty, f.tyaw, 0, TB);
      const e = f.easeOut ? f.s * (2 - f.s) : U.smooth(f.s);
      f.ax = f.x0 + (a1[0] - f.x0) * e;
      f.ay = f.y0 + (a1[1] - f.y0) * e;
      f.pdL = (1 - f.s) * f.dur; f.pdS = f.s; f.pdX = a1[0]; f.pdY = a1[1]; f.pdT = this.time;
      const arc = f.arc;
      if (arc) {
        // round the pivot foot (angle and radius eased from where it left to where it lands)
        const r0 = Math.hypot(f.x0 - arc.x, f.y0 - arc.y), r1 = Math.hypot(a1[0] - arc.x, a1[1] - arc.y);
        const th0 = Math.atan2(f.y0 - arc.y, f.x0 - arc.x);
        let dth = U.wrapPi(Math.atan2(a1[1] - arc.y, a1[0] - arc.x) - th0);
        if (arc.dir && dth * arc.dir < 0 && Math.abs(dth) > 0.35) dth += arc.dir * 2 * Math.PI;
        const th = th0 + dth * e, r = r0 + (r1 - r0) * e;
        f.ax = arc.x + Math.cos(th) * r; f.ay = arc.y + Math.sin(th) * r;
      } else this._swingClear(f, e, f.x0, f.y0, a1[0], a1[1], f.h * Math.sin(Math.PI * f.s), dt);
      // (a step taken over from a foot already moving carries its speed on and eases it out: Hermite, s(1 - s)^2)
      if ((f.v0x || f.v0y) && !f.easeOut) { const h = f.s * (1 - f.s) * (1 - f.s) * f.dur; f.ax += f.v0x * h; f.ay += f.v0y * h; }
      f.az = f.z0 + (a1[2] - f.z0) * e + f.h * Math.sin(Math.PI * f.s);
      if (f.stanceStep) {
        // (in the body's own terms: a foot in the air comes round with the hips the short way and never points more
        // than ~40 deg off the body's heading; interpolated as world angles, a 180 turn sent it round the wrong way)
        const r0 = U.wrapPi(f.yaw0 - this.facing), r1 = U.clamp(U.wrapPi(f.tyaw - this.facing), -0.56, 0.56);
        f.yawNow = this.facing + U.clamp(U.lerp(r0, r1, U.smooth(f.s / 0.5)), -0.7, 0.7);
      } else f.yawNow = U.angLerp(f.yaw0, f.tyaw, e);
      // (the toes dip in the air in proportion to the step: a small stance step keeps the foot nearly level, or its
      // toes scraped along ~1 in off the floor)
      f.pitchNow = U.lerp(f.p0, 0, e) + Math.sin(Math.PI * f.s) * Math.min(0.18, 1.5 * f.h / this.H);
      if (f.s >= 1) {
        f.state = 'plant'; f.x = f.tx; f.y = f.ty; f.yaw = f.tyaw; f.pitch = 0; f.tStep = this.time; f.arc = null; this._plantHere(f);
        if (this.view && this.view.onCue) this.view.cue('plant', this, f);
      }
    }
    /** a foot in the air comes down where the leg really put it: the spot moves by how far the ankle was from its path at
     *  the last solve (a leg out of reach, a soft leg trailing, the floor lifting the foot), and whatever height is left
     *  is let down over a few frames, instead of the planted leg's target jumping there at contact (Trial 3: at a hard
     *  turn at a run the landing spot jumped up to 18 in, out of reach, the pelvis dropped a foot to reach it and the
     *  foot went through the floor) */
    _plantHere(f) {
      f.lp = 0; f.lpV = 0;
      if (f.pax == null || !(this.time - f.paT < 0.05)) return;
      const P = this.sk.P, an = (f.side ? RG.J.R_AN : RG.J.L_AN) * 3;
      f.x += P[an] - f.pax; f.y += P[an + 1] - f.pay; f.pax = null;
      // (and the knee where it was, see the solve's ik.swRef)
      const kn = (f.side ? RG.J.R_KN : RG.J.L_KN) * 3, hp = (f.side ? RG.J.R_HIP : RG.J.L_HIP) * 3;
      f.swRef = [P[kn] - P[hp], P[kn + 1] - P[hp + 1], P[kn + 2] - P[hp + 2]];
      // (it comes down at the pitch and heading it was shown at, the difference from the stride's landing easing out as
      // the weight comes on, see _settleLanding: under a deep knee bend (a slide's) the ankle's range had tipped the foot
      // ~45 deg toes-down in the air, and set at the stride's landing pitch in one frame the toes popped up ~2.6 in,
      // Trial 5)
      const jb = (f.side ? RG.J.R_BALL : RG.J.L_BALL) * 3, jh = (f.side ? RG.J.R_HEEL : RG.J.L_HEEL) * 3;
      const L = this.dims.heel + this.dims.ball, fx = P[jb] - P[jh], fy = P[jb + 1] - P[jh + 1];
      const pr = Math.asin(U.clamp((P[jh + 2] - P[jb + 2]) / L, -1, 1));
      if (Math.abs(pr - f.pitch) > 2 * D && Math.hypot(fx, fy) > 0.3 * L) {
        f.lp = pr - f.pitch; f.yaw = Math.atan2(fy, fx);
        const a = this._ankleFromBall(f.x, f.y, f.yaw, pr, TA);
        f.x += P[an] - a[0]; f.y += P[an + 1] - a[1];
      }
      const a = this._ankleFromBall(f.x, f.y, f.yaw, f.pitch + f.lp, TA), gap = P[an + 2] - a[2];
      if (gap > 0.01 || f.lp) { f.land = true; f.landKeep = true; f.lz = U.clamp(gap, 0, 0.8); }
    }
    /** a foot leaving the floor while its landing pitch is still easing out goes from the pitch it is shown at */
    _foldLand(f) {
      if (f.land && f.lp) f.pitch += f.lp;
      f.lp = 0; f.lpV = 0;
    }
    /** where a planted foot's swing starts (x0, y0, z0: its ankle; yaw0, p0): the foot as it was shown, its heel up for a
     *  push-off, a pivot or the ankle's range, a landing still settling (Trial 5: taken from the foot's own spot and
     *  pitch without those, the ankle started up to a few inches off and the knee snapped straight at the lift) */
    _liftStart(f) {
      this._foldLand(f);
      f.reachP = 0; f.pvW = 0;
      const a = this._ankleFromBall(f.x, f.y, f.yaw, f.pitch, TA);
      f.x0 = a[0]; f.y0 = a[1]; f.z0 = a[2]; f.yaw0 = f.yaw; f.p0 = f.pitch; f.l0 = null;
      const P = this.sk.P, J = RG.J, an = (f.side ? J.R_AN : J.L_AN) * 3, jb = (f.side ? J.R_BALL : J.L_BALL) * 3, jh = (f.side ? J.R_HEEL : J.L_HEEL) * 3;
      // (only when the last solve shows this foot where it stands: not after a placement)
      if (Math.hypot(P[jb] - f.x, P[jb + 1] - f.y) > 0.25 || Math.abs(P[jb + 2]) > 0.3) return;
      const L = this.dims.heel + this.dims.ball, fx = P[jb] - P[jh], fy = P[jb + 1] - P[jh + 1];
      f.x0 = P[an]; f.y0 = P[an + 1]; f.z0 = P[an + 2];
      f.p0 = Math.asin(U.clamp((P[jh + 2] - P[jb + 2]) / L, -1, 1));
      if (Math.hypot(fx, fy) > 0.3 * L) f.yaw0 = Math.atan2(fy, fx);
      // (and how long the leg was, hip to ankle: see _liftReach)
      const hp = (f.side ? J.R_HIP : J.L_HIP) * 3;
      f.l0 = Math.hypot(P[an] - P[hp], P[an + 1] - P[hp + 1], P[an + 2] - P[hp + 2]);
    }
    /** early in a swing the leg gets no longer than it was as the foot left the floor, coming back to its full length
     *  by Tune.gait.liftReachSw of the swing: a foot the body had run away from, its leg stretched, was left on its lift
     *  spot while the hips went on and the knee snapped straight for a frame before it folded (Trial 5) */
    _liftReach(f, sw) {
      if (f.l0 == null || !(sw < M.Tune.gait.liftReachSw)) return;
      const sk = this.sk, P = sk.P, hp = (f.side ? RG.J.R_HIP : RG.J.L_HIP) * 3;
      const hx = P[hp] + this.x - sk.x, hy = P[hp + 1] + this.y - sk.y, hz = P[hp + 2];
      const dx = f.ax - hx, dy = f.ay - hy, dz = f.az - hz, d = Math.hypot(dx, dy, dz);
      const Lf = this.dims.th + this.dims.sh, dm = f.l0 + Math.max(0, Lf - f.l0) * U.smooth(sw / M.Tune.gait.liftReachSw);
      if (d > dm) { const k = dm / d; f.ax = hx + dx * k; f.ay = hy + dy * k; f.az = hz + dz * k; }
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
    /** where the body will be at clip time t of a move (its root, with a running jump's travel and the move's placement
     *  eased off), for planning; out: { x, y } */
    clipBodyAt(cs, t, out) {
      const r = this._clipRoot(cs, Math.min(t, cs.clip.dur)), tv = cs.travel;
      const bo = tv ? 1 - this._travelF(tv, t) : cs.blendT > 0 ? 1 - U.smooth(t / cs.blendT) : 0;
      out.x = r.x + cs.offX * bo; out.y = r.y + cs.offY * bo;
      return out;
    }
    /** a running jump's share of its way to the move's spot at clip time t (see ClipState.travel): the push accelerates it
     *  evenly from ta to the take-off t0, the air carries it on at that speed, over the spot at tg and past it to t1 */
    _travelF(tv, t) {
      const T1 = Math.max(1e-3, tv.t0 - tv.ta), T2 = Math.max(1e-3, tv.tg - tv.t0), N = T1 / 2 + T2;
      if (t <= tv.ta) return 0;
      if (t < tv.t0) { const u = t - tv.ta; return u * u / (2 * T1) / N; }
      return (T1 / 2 + (Math.min(t, tv.t1) - tv.t0)) / N;
    }
    _clipJumpZ(cs, t) {
      const j = cs.clip.jump;
      if (!j || t <= j.t0 || t >= j.t1) return 0;
      const u = (t - j.t0) / (j.t1 - j.t0);
      const h = cs.jumpH != null ? cs.jumpH : j.h * this.H * (0.85 + this.rVert * 0.3);
      if (j.hang && !cs.noHang && t > j.hang[0]) {
        const uh = (j.hang[0] - j.t0) / (j.t1 - j.t0);
        if (t < j.hang[1]) return 4 * h * uh * (1 - uh);
        // (let go of the rim: the rest of the drop from the hang, down by the landing; picked up where the clock was, the
        // body fell ~1 ft in a frame as the hang ended, every joint popping, Trial 9)
        const v = uh + (1 - uh) * (t - j.hang[1]) / Math.max(1e-3, j.t1 - j.hang[1]);
        return 4 * h * v * (1 - v);
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
          // (aimed where the leg reaches from where the hip will be as it lands, with the pelvis settled a little: kept
          // on the stride's aim, a spot the stride had put out ahead of a body speeding up, as far as 7 ft, was reached
          // for in a tenth of a second and the pelvis dropped ~10 in in one frame at contact, Trial 4)
          if (f.tx != null) {
            const H = this.H, side = f.side ? 1 : -1, c = Math.cos(this.facing), s = Math.sin(this.facing);
            const hx = this.x + this.vx * f.dur + s * side * this.dims.hipX, hy = this.y + this.vy * f.dur - c * side * this.dims.hipX;
            const a0 = this._ankleFromBall(f.tx, f.ty, f.tyaw, 0, TB);
            const vz = (this._hipZPose != null ? this._hipZPose : this.dims.hipH) - (0.012 + M.Tune.floor.landSettleH) * H - a0[2];
            const L = (this.dims.th + this.dims.sh) * 0.9986, dhMax = Math.sqrt(Math.max(0.01, L * L - vz * vz));
            const ex = a0[0] - hx, ey = a0[1] - hy, dh = Math.hypot(ex, ey);
            if (dh > dhMax) { f.tx -= ex * (1 - dhMax / dh); f.ty -= ey * (1 - dhMax / dh); }
          }
        }
      }
    }
    _updateClip(dt) {
      const cs = this.clip;
      const clip = cs.clip;
      // (a move whose root leaves faster than the body is going starts on a slow clock that comes up to speed over
      // Tune.weight.clipWarpS: the body pushes off into it instead of being at the move's speed in one step)
      let wk = 1;
      if (cs.warp0 != null && cs.warp0 < 1) { cs.realT = (cs.realT || 0) + dt; wk = cs.warp0 + (1 - cs.warp0) * U.smooth(cs.realT / M.Tune.weight.clipWarpS); }
      if (cs.hold != null && cs.t >= cs.hold) { cs.t = cs.hold; }
      else cs.t += dt * cs.speed * wk;
      // fade
      if (cs.ending) { cs.w -= dt / Math.max(0.05, cs.fadeOut); if (cs.w <= 0) { this._endClip(); return false; } }
      else if (cs.w < 1) cs.w = Math.min(1, cs.w + dt / Math.max(0.01, cs.fadeIn));
      // events
      if (clip.events) {
        for (const k in clip.events) {
          const et = clip.events[k];
          if (!cs.fired[k] && cs.t >= et) { cs.fired[k] = true; if (cs.onEvent) U.safe(() => cs.onEvent(k, this, cs), null, 'clip event'); }
        }
      }
      // (a move bent off a man in its way, View.separate: the push asked of it kept as a speed of its origin, dying away
      // at Tune.weight.yieldDecay once nothing pushes, Trial 4)
      if (cs.yax || cs.yay || cs.yvx || cs.yvy) {
        const TW = M.Tune.weight;
        cs.yvx = (cs.yvx || 0) + (cs.yax || 0) * dt; cs.yvy = (cs.yvy || 0) + (cs.yay || 0) * dt;
        if (!cs.yax && !cs.yay) {
          const yv = Math.hypot(cs.yvx, cs.yvy), dv = TW.yieldDecay * dt;
          if (yv <= dv) { cs.yvx = 0; cs.yvy = 0; } else { cs.yvx *= 1 - dv / yv; cs.yvy *= 1 - dv / yv; }
        }
        cs.ox += cs.yvx * dt; cs.oy += cs.yvy * dt; cs.yax = 0; cs.yay = 0;
      }
      // root motion
      const r = this._clipRoot(cs, Math.min(cs.t, clip.dur));
      const bt = Math.max(cs.blendT, 0.3);
      const bl = 1 - U.smooth(cs.t / bt);
      const tv = cs.travel;
      const bo = tv ? 1 - this._travelF(tv, cs.t) : cs.blendT > 0 ? 1 - U.smooth(cs.t / cs.blendT) : 0;
      // carry the entry momentum and fade it out (no velocity pop at the clip start; a running jump's own push is its travel)
      const tau = 0.12, mk = tau * (1 - Math.exp(-cs.t / tau));
      const clipV0 = clip.rootKeys || tv ? 0 : 1;
      const nx = r.x + cs.offX * bo + (cs.v0x || 0) * mk * bl * clipV0, ny = r.y + cs.offY * bo + (cs.v0y || 0) * mk * bl * clipV0;
      // the body follows the move's root as a mass (Trial 4): exactly, as long as that takes no more than a body's
      // push (Tune.weight.clipAccelMax); a move whose root changes speed harder than that between its keys is caught up
      // with over a few steps (Tune.weight.clipCatchUp) instead of jumping (the start of a move is eased separately:
      // its clock starts slow, see play)
      // (starting from the speed the body really had, a knock's push included: without it a move started on a knocked
      // body changed its speed ~70 ft/s^2 in a step, Trial 4)
      const rs = cs.rs || (cs.rs = { x: this.x, y: this.y, vx: this.vx + (this._hitPrevVx || 0), vy: this.vy + (this._hitPrevVy || 0), tx: nx, ty: ny });
      if (dt > 0) {
        const TW = M.Tune.weight;
        const tvx = (nx - rs.tx) / dt + TW.clipCatchUp * (nx - rs.x), tvy = (ny - rs.ty) / dt + TW.clipCatchUp * (ny - rs.y);
        rs.tx = nx; rs.ty = ny;
        let ax = (tvx - rs.vx) / dt, ay = (tvy - rs.vy) / dt;
        const am = Math.hypot(ax, ay);
        if (am > TW.clipAccelMax) { ax *= TW.clipAccelMax / am; ay *= TW.clipAccelMax / am; }
        rs.vx += ax * dt; rs.vy += ay * dt;
        rs.x += rs.vx * dt; rs.y += rs.vy * dt;
      }
      this.vx = rs.vx; this.vy = rs.vy;
      if (!isFinite(this.vx) || !isFinite(rs.x)) { rs.x = nx; rs.y = ny; rs.vx = 0; rs.vy = 0; this.vx = 0; this.vy = 0; }
      this.x = rs.x; this.y = rs.y; this.speed = Math.hypot(this.vx, this.vy);
      this._faceStep(r.yaw, clip.turnRate || 9, this.turnAcc * M.Tune.weight.clipTurnK * (this.paceK || 1), dt);
      this.jumpZ = this._clipJumpZ(cs, cs.t);
      // feet
      const mode = A.clipFeet(clip, cs.t);
      if (mode === 'air') {
        for (const f of this.feet) f.state = 'air';
      } else {
        for (const f of this.feet) {
          // (a foot the move lifts off the floor early: the swing leg of a one-foot take-off, its knee driving up as the other
          // foot plants and pushes off; put down on its step, the take-off came off both feet, Trial 9)
          if (clip.lifts && (!clip.jump || cs.t < clip.jump.t0) && clip.lifts.some(q => ((q.foot === 'r') !== !!cs.mirror ? 1 : 0) === f.side && cs.t >= q.t)) { f.state = 'air'; continue; }
          if (f.state === 'air') this._landFoot(f, this.facing + (f.side ? -1 : 1) * 10 * D);
          if (f.state === 'swing' && f.mode === 'step') this._advanceStep(f, dt);
          else if (f.state === 'plant' && this.feet[1 - f.side].state !== 'air') {
            const c = Math.cos(this.facing), s = Math.sin(this.facing), side = f.side ? 1 : -1;
            const hx = this.x + s * side * this.dims.hipX, hy = this.y - c * side * this.dims.hipX;
            const dist = Math.hypot(f.x - hx, f.y - hy);
            // a scripted step for this foot starting very soon takes care of it
            let soon = false;
            // (the zero step: a foot planted at the gather stays down until its own step, strained or not, when that step is near,
            // Tune.shot.zeroHoldS: corrected as the move got going, the layup's steps went three, Trial 9)
            if (clip.steps) for (const stp of clip.steps) { const sd = (stp.foot === 'r') !== cs.mirror ? 1 : 0; if (sd === f.side && stp.t0 >= cs.t - 0.02 && (stp.t0 - cs.t < 0.1 || (stp.t0 - cs.t < M.Tune.shot.zeroHoldS && dist < 0.45 * this.H))) soon = true; }
            // (nor the first step's foot before the move lifts it into the knee drive: squared up again on a slow start, the steps
            // went three)
            if (clip.lifts) for (const q of clip.lifts) { const sd = (q.foot === 'r') !== cs.mirror ? 1 : 0; if (sd === f.side && q.t >= cs.t - 0.02 && q.t - cs.t < M.Tune.shot.zeroHoldS && dist < 0.45 * this.H) soon = true; }
            // (and none in the last moments before a jump: the legs are pushing off; a foot squared up ~0.03 s before a jump
            // shot's take-off left the floor twice, popping, Trial 9)
            if (clip.jump && cs.t > clip.jump.t0 - M.Tune.shot.noStepBeforeJumpS && cs.t < clip.jump.t0) soon = true;
            // (or its hip held at the end of its range over it by the hip guard, Trial 3: dragged, it slipped)
            const strained = (f.strain || 0) > M.Tune.hipGuard.stepAtH && this.jumpZ < 0.05;
            if (!soon && this.time - landedAt(f) >= M.Tune.floor.hardMinStanceS - 1e-6 && (strained || dist > 0.33 * this.H || (!clip.steps && dist > 0.28 * this.H && (this.feet[1 - f.side].state === 'plant' || dist > 0.4 * this.H)))) {
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
              if (f.state !== 'air') {
                this._beginStep(f, tx, ty, cs.ofacing + (stp.yaw || 0) * D * (cs.mirror ? -1 : 1), stp.t1 - stp.t0, stp.lift || 0.06);
                // (a hop off the run: the foot leaves already moving and slows into the landing)
                if (stp.easeOut) f.easeOut = true;
                // swinging around a pivot (a spin): the foot travels round it on an arc, the given way round
                if (stp.arc) {
                  const at = stp.arc.at, al = cs.mirror ? -at[1] : at[1];
                  f.arc = { x: cs.ox + c * at[0] + s * al, y: cs.oy + s * at[0] - c * al, dir: (stp.arc.dir || 0) * (cs.mirror ? -1 : 1) };
                }
              }
            }
          }
        }
        // generic planted-stance correction when the clip holds a stance for long
        // pivoting: the pivot foot keeps its spot and turns on the ball of the foot with the body
        // (side 2: both feet turn on their balls, the turnaround of a post fade)
        const pv = clip.pivot;
        if (pv && cs.t >= pv.t0 && cs.t <= pv.t1) {
          if (!cs.pivotYaw0) { cs.pivotYaw0 = [this.feet[0].yaw, this.feet[1].yaw]; cs.pivotFace0 = this.facing; }
          const turn = U.wrapPi(this.facing - cs.pivotFace0);
          for (const f of this.feet) if ((pv.side === 2 || f.side === pv.side) && f.state === 'plant') this._pivotFoot(f, cs.pivotYaw0[f.side] + turn, dt, 30);
        }
        // a list of pivots in the clip's own (right-handed) terms, one foot after the other (a spin); the turn is
        // summed frame by frame, so one past 180 degrees keeps going the same way
        const pvs = clip.pivots;
        if (pvs) {
          const st = cs.pivotSt || (cs.pivotSt = []);
          for (let i = 0; i < pvs.length; i++) {
            const q = pvs[i];
            if (cs.t < q.t0 || cs.t > q.t1) continue;
            const f = this.feet[cs.mirror ? 1 - q.side : q.side];
            if (!st[i]) st[i] = { yaw: f.yaw, prev: this.facing, acc: 0 };
            const e = st[i];
            e.acc += U.wrapPi(this.facing - e.prev); e.prev = this.facing;
            // (spinning on the ball of the foot: the heel comes up off the floor as it turns)
            if (f.state === 'plant') { f.pitch = Math.max(f.pitch, 22 * D * U.smooth((cs.t - q.t0) / 0.06)); this._pivotFoot(f, e.yaw + e.acc, dt, 40); }
          }
        }
        // any other planted foot the move turns the hips away from pivots on its ball past Tune.floor.pivot.clipFreeDeg,
        // as a standing turn's does (a pull-up turned to the rim out of a run, a wall-up turned to the shooter: the foot
        // stayed pointed the old way, up to ~90 deg off the hips, and the knee caved in ~25-45 deg over it)
        const pvNow = (pv && cs.t >= pv.t0 && cs.t <= pv.t1) || (pvs && pvs.some(q => cs.t >= q.t0 && cs.t <= q.t1));
        if (!pvNow) {
          const pz = M.Tune.floor.pivot.clipFreeDeg * D;
          for (const f of this.feet) {
            if (f.state !== 'plant') continue;
            const ye = U.wrapPi(this.facing + (f.side ? -1 : 1) * 10 * D - f.yaw);
            if (Math.abs(ye) > pz || f.pvOn) this._pivotFoot(f, Math.abs(ye) > pz ? f.yaw + Math.sign(ye) * (Math.abs(ye) - pz) : f.yaw, dt, 13);
          }
        }
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
      return true;
    }
    _endClip() {
      const cs = this.clip;
      this.clip = null;
      if (!cs) return;
      for (let side = 0; side < 2; side++) if (this.handTarget[side] && this.handTarget[side].reach) this.handTarget[side] = null;
      this.jumpZ = 0;
      for (const f of this.feet) if (f.state === 'air') this._landFoot(f, this.facing);
      // (the body leaves the move with the speed it has: the steering takes it from there at a body's push; halved in
      // one step at the end of every move that did not go somewhere, Trial 4)
      this.acx = 0; this.acy = 0;
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
    /** local() in the dribble's frame (Trial 8): turned from the hips' by this.dribbleYaw, a share of the chest's own turn,
     *  so the ball goes with the shoulder dribbling it when the trunk leads a turn or squares up to a pass (in the hips'
     *  frame the shoulder swung past it, the arm at the end of its reach back) */
    localD(x, y, z, out) {
      const f = this.facing + (this.dribbleYaw || 0), c = Math.cos(f), s = Math.sin(f);
      out[0] = this.x + s * x + c * y; out[1] = this.y - c * x + s * y; out[2] = z + this.jumpZ;
      return out;
    }
    /** where a hand (its palm point) is, in localD()'s frame (x right, y forward, z up from the floor under a jump), as
     *  the last solve left it (Trial 8) */
    handLocal(hand, out) {
      const f = this.facing + (this.dribbleYaw || 0), P = this.sk.P, o = (hand ? RG.J.R_HD : RG.J.L_HD) * 3, c = Math.cos(f), s = Math.sin(f);
      const rx = P[o] - this.x, ry = P[o + 1] - this.y;
      out[0] = rx * s - ry * c; out[1] = rx * c + ry * s; out[2] = P[o + 2] - this.jumpZ;
      return out;
    }
    /** the arm's reach (Trial 8): its shoulder in localD()'s frame (x right, y forward, z up from the floor under a jump)
     *  as the last solve left it, and how far its palm reaches from there with the arm straight (ft), in out[3] */
    armReach(hand, out) {
      const f = this.facing + (this.dribbleYaw || 0), sk = this.sk, P = sk.P, o = (hand ? RG.J.R_SH : RG.J.L_SH) * 3, c = Math.cos(f), s = Math.sin(f);
      const rx = P[o] - this.x, ry = P[o + 1] - this.y;
      out[0] = rx * s - ry * c; out[1] = rx * c + ry * s; out[2] = P[o + 2] - this.jumpZ;
      out[3] = sk.dims.ua + sk.dims.fa + 0.75 * sk.dims.hand;
      return out;
    }
    /** where his legs will be dt s on (Trial 8: the dribble's moves are planned round them, not shoved out of them in the
     *  air): the hips carried with the body's predicted frame, each foot planted where it is or going on along its swing
     *  (its own easing) to where it lands, the knee between them bent forward. out (30): the left hip, knee, ankle, ball
     *  of the foot and toe (world, z up from the floor), then the right's */
    legsAt(dt, out) {
      // (the model's own error cancels: the legs as solved now, moved on by how far the model says they move in dt; the
      // model alone was 1-4 in off the solved legs at dt 0, the feet's targets and a knee bent straight forward)
      const P = this.sk.P;
      this._legModel(0, LG0);
      this._legModel(dt, out);
      for (let side = 0; side < 2; side++) {
        const js = side ? LEG_JR : LEG_JL, o = side * 15;
        for (let k = 0; k < 5; k++) { const j = js[k] * 3, i = o + k * 3; out[i] += P[j] - LG0[i]; out[i + 1] += P[j + 1] - LG0[i + 1]; out[i + 2] += P[j + 2] - LG0[i + 2]; }
      }
      return out;
    }
    /** legsAt's model: the hips with the body's predicted frame, the feet planted or on along their swings, the knees
     *  solved between, bent forward */
    _legModel(dt, out) {
      const P = this.sk.P, dm = this.dims, pf = this.predictFrame(dt, LPF);
      const c0 = Math.cos(this.facing), s0 = Math.sin(this.facing), c1 = Math.cos(pf.facing), s1 = Math.sin(pf.facing);
      const th = dm.th, sh = dm.sh, t = this.time || 0;
      for (let side = 0; side < 2; side++) {
        const o = side * 15, f = this.feet[side], hj = (side ? RG.J.R_HIP : RG.J.L_HIP) * 3;
        const rx = P[hj] - this.x, ry = P[hj + 1] - this.y, bx = rx * s0 - ry * c0, by = rx * c0 + ry * s0;
        const hx = pf.x + s1 * bx + c1 * by, hy = pf.y - c1 * bx + s1 * by, hz = P[hj + 2] - (this.jumpZ || 0);
        let ax = f.ax, ay = f.ay, az = f.az, yaw = f.yawNow != null ? f.yawNow : f.yaw;
        if (f.state === 'swing' && f.pdT === t && f.pdL > 0 && f.x0 != null) {
          const s2 = dt >= f.pdL ? 1 : f.pdS + dt * (1 - f.pdS) / f.pdL, e2 = U.smooth(Math.min(1, s2));
          ax = f.x0 + (f.pdX - f.x0) * e2; ay = f.y0 + (f.pdY - f.y0) * e2; az = U.lerp(az, dm.ankH, e2);
          yaw = U.lerp(yaw, yaw + U.wrapPi(f.tyaw - yaw), e2);
        }
        out[o] = hx; out[o + 1] = hy; out[o + 2] = hz;
        out[o + 6] = ax; out[o + 7] = ay; out[o + 8] = az;
        const cy = Math.cos(yaw), sy = Math.sin(yaw);
        out[o + 9] = ax + cy * dm.ball; out[o + 10] = ay + sy * dm.ball; out[o + 11] = Math.max(0, az - dm.ankH) + 0.02 * this.H;
        out[o + 12] = out[o + 9] + cy * dm.toe; out[o + 13] = out[o + 10] + sy * dm.toe; out[o + 14] = out[o + 11];
        // (the knee: two bones from the hip to the ankle, bent toward where he will face)
        let vx = ax - hx, vy = ay - hy, vz = az - hz;
        const vl = Math.hypot(vx, vy, vz) || 1, dl = Math.min(vl, (th + sh) * 0.999);
        vx /= vl; vy /= vl; vz /= vl;
        const a = (th * th - sh * sh + dl * dl) / (2 * dl), h = Math.sqrt(Math.max(0, th * th - a * a));
        let nx = c1, ny = s1, nz = 0;
        const dn = nx * vx + ny * vy + nz * vz; nx -= dn * vx; ny -= dn * vy; nz -= dn * vz;
        const nl = Math.hypot(nx, ny, nz) || 1;
        out[o + 3] = hx + vx * a + nx / nl * h; out[o + 4] = hy + vy * a + ny / nl * h; out[o + 5] = hz + vz * a + nz / nl * h;
      }
      return out;
    }
    /** where the ball is while held (clip-driven or by hold mode) */
    /** where a pass clip's ball will be at its release (Trial 10, Director.planThrow): the clip's ball key at clip time
     *  `rel`, on the body where the steering and the turn will have it `lead` s from now */
    ballAtRelease(rel, lead, out) {
      const cs = this.upper && this.upper.clip.ballKeys ? this.upper : this.clip && this.clip.clip.ballKeys ? this.clip : null;
      if (!cs) return this.heldBallPos(out);
      const bk = cs.clip.ballKeys, t = Math.min(rel, cs.clip.dur), H = this.H;
      let bx = bk[0](t) * H, by = bk[1](t) * H, bz = bk[2](t) * H;
      if (cs.mirror) bx = -bx;
      // (the body as the upper-body clip's ball path sets it: sitting lower than the clip's body, the ball comes down with the
      // chest and forward with a lean, as heldBallPos)
      const q = this.pose;
      if (cs !== this.clip) { bz -= Math.max(0, -q[CH.rootZ] - 0.03) * H * 0.85; by += Math.sin(Math.max(0, q[CH.pelPitch] + q[CH.spFlex] - 14 * D)) * 0.3 * H; }
      const fr = this.predictSteer(lead, {}), f = this._faceAhead(lead), c = Math.cos(f), s = Math.sin(f);
      out[0] = fr.x + s * bx + c * by; out[1] = fr.y - c * bx + s * by; out[2] = bz + (this.jumpZ || 0);
      return out;
    }
    /** the planned catch point (Trial 10) about a body at (x, y) facing `facing`: the plan's offset from where the body was
     *  to be, in the world's axes, never further round from the facing than Tune.pass.holdSideDeg */
    _rcAt(x, y, rc, facing, out) {
      // (no further out than the arms reach, Tune.pass.catchReachH: a body run on past where it was planned to be had the
      // hands held ~3 ft out for the ball, the far arm straight across the chest flipping over and under; the last moment
      // onto the ball's path, _rcHands, takes them to it wherever it comes)
      const P = rc.P, C = rc.Cs || rc.C, Ep = rc.Ep, ox = P[0] + Ep[0] - C[0], oy = P[1] + Ep[1] - C[1], ol = Math.min(Math.hypot(ox, oy), M.Tune.pass.catchReachH * this.H);
      let a = Math.atan2(oy, ox);
      const r = U.wrapPi(a - facing), m = M.Tune.pass.holdSideDeg * D;
      if (Math.abs(r) > m) a = facing + Math.sign(r) * m;
      out[0] = x + Math.cos(a) * ol; out[1] = y + Math.sin(a) * ol; out[2] = P[2] + Ep[2];
      return out;
    }
    /** the hands for a pass coming (Trial 10, see _armTargets): fills q with where the ball will be taken (world) and
     *  this._rcA with the way it comes from, returns the arms' weight */
    _rcHands(rc, b, q) {
      const T = M.Tune.pass, t = this.time || 0;
      const fx = rc.rel ? rc.rel[0] : rc.from.x, fy = rc.rel ? rc.rel[1] : rc.from.y;
      // (carried by the body: the catch point as it will be when the ball gets there, if the body is where it was planned;
      // running on through the catch, out to the side of the run for a ball from behind)
      // (running on through the catch as it was planned, or not: decided once, a runner squaring up at the last moment
      // had the hands jump from the side of his run round to the passer, ~1.3 ft in a frame)
      // (the target is shown where this kind of pass will be caught: a bounce pass's low, a lob's high; never further round
      // from the way the body faces than a runner's hands go, Tune.pass.catchSideDeg: a man running away from the passer
      // with the ball still to come, or turned away, held them out behind his back, the arms twisted through themselves.
      // Standing, no further than Tune.pass.targetSideDeg: out at the side the far hand could not reach its place on the
      // ball, and the arm, straight across the chest, flipped between reaching over and under)
      const rf = this._runFacing(this.vx, this.vy);
      if (rc.ball && rc.C && b && b.segs && rc.tEnd != null && t > (rc.cpT == null ? -1e9 : rc.cpT)) {
        // (where the body will be as the ball gets there: as planned, unless he has been sent somewhere else since, when it
        // is taken again each step and eased onto, Tune.pass.catchBodyS. The plan's guess was made before the ball left,
        // and a man the offense gave another spot had his hands held up to ~1.6 ft off and brought over in the last tenth
        // of a second; taken again every step whatever, a man stepping into it had them wander ~0.2 ft)
        const g = this.goal, g0 = rc.g;
        const moved = !!g0 !== !!g || (g && (g.mode !== g0.mode || (g.mode !== 'idle' && Math.hypot(g.x - g0.x, g.y - g0.y) > T.catchReplanFt)));
        let tx = rc.C[0], ty = rc.C[1];
        if (moved) { const fr = this.predictSteer(Math.max(0, rc.tEnd - t), RT5); tx = fr.x; ty = fr.y; }
        const cs = rc.Cs, k = rc.cpT == null ? 1 : 1 - Math.exp(-(t - rc.cpT) / T.catchBodyS);
        cs[0] += (tx - cs[0]) * k; cs[1] += (ty - cs[1]) * k; rc.cpT = t;
      }
      if (rc.ball && rc.C) {
        // (in the air: where it was planned to be taken about where the body was planned to be, carried along with the body
        // in the world's axes, not turned with it: turned with a body still squaring up to the passer, the hands came round
        // ~1.7 ft over the last 0.15 s. A runner running on through it takes it out to the side of the run, as planned)
        this._rcAt(this.x, this.y, rc, this.facing, q);
      } else this.catchPoint(this.x, this.y, fx, fy, rc.kind, q, rf != null ? rf : this.facing, rf != null ? 0 : rc.ball ? T.holdSideDeg : T.targetSideDeg, rc);
      // (from the target to the catch point over the first moment of the flight, T.fullS: switched in a frame, a runner's
      // hands jumped from the side of his run round toward the passer, or a target shown for another kind of pass up or down)
      this._rcK = 1;
      if (rc.ball && rc.exp) {
        const k = U.smooth((t - rc.tRel) / T.fullS);
        if (k < 1) {
          const qe = this.catchPoint(this.x, this.y, rc.from.x, rc.from.y, rc.kindE || rc.kind, RT4, rf != null ? rf : this.facing, rf != null ? 0 : T.targetSideDeg, rc);
          for (let i = 0; i < 3; i++) q[i] = qe[i] + (q[i] - qe[i]) * k;
          this._rcK = k;
        }
      }
      this._rcA = Math.atan2(fy - q[1], fx - q[0]);
      // (the target: running, all the way up, clear of the arms' swing)
      const tw = U.lerp(T.targetW, 1, U.smooth((this.speed - 4) / 4));
      if (!rc.ball) return tw * U.smooth((t - rc.t0) / T.targetS);
      const fl = Math.max(0.05, rc.tEnd - rc.tRel), left = rc.tEnd - t;
      // (a pass nobody warned him of comes up from nothing, over part of its flight)
      const up = U.smooth((t - rc.t0) / Math.max(0.05, Math.min(T.targetS, 0.45 * fl)));
      let w = U.lerp(tw, 1, U.smooth((t - rc.tRel) / Math.max(0.05, Math.min(T.fullS, fl - T.setBeforeS)))) * up;
      // (over the last moment onto the ball's own path: by what the body, run ahead to the catch, will still be off where it
      // was planned; pulled onto the ball's end point itself, the hands went ahead of a body still stepping into the catch
      // and came back with it, ~0.3 ft)
      if (left < T.meetS && b && b.segs) {
        if (!rc.E) {
          const fr = this.predictSteer(Math.max(0, left), {}), pe = b.posAt(rc.tEnd, RT3), fa = this._faceAhead(Math.max(0, left));
          const c0 = rc.C ? this._rcAt(fr.x, fr.y, rc, fa, [0, 0, 0]) : this.catchPoint(fr.x, fr.y, fx, fy, rc.kind, [0, 0, 0], rc.runOn && Math.hypot(fr.vx, fr.vy) > 1 ? Math.atan2(fr.vy, fr.vx) : fa, rc.runOn ? 0 : T.holdSideDeg);
          rc.E = [pe[0] - c0[0], pe[1] - c0[1], pe[2] - c0[2]];
        }
        const e = U.smooth(1 - Math.max(0, left) / T.meetS);
        q[0] += rc.E[0] * e; q[1] += rc.E[1] * e; q[2] += rc.E[2] * e;
      }
      return Math.min(1, w);
    }
    /** the catching hands' shape (Trial 10): forearms turned so the palms face the ball with the thumbs behind it, the
     *  wrists back, the fingers up and spread; weight w */
    _rcShape(w) {
      if (!(w > 0.001)) return;
      const pp = this.pose;
      for (const pre of ['l', 'r']) {
        pp[CH[pre + 'Pro']] = U.lerp(pp[CH[pre + 'Pro']], 125 * D, w);
        pp[CH[pre + 'WrF']] = U.lerp(pp[CH[pre + 'WrF']], -35 * D, w);
        pp[CH[pre + 'WrD']] = U.lerp(pp[CH[pre + 'WrD']], 8 * D, w);
        pp[CH[pre + 'Fing']] = U.lerp(pp[CH[pre + 'Fing']], 0.12, w);
      }
    }
    heldBallPos(out) {
      const H = this.H;
      const cs = this.clip && this.clip.clip.ballKeys ? this.clip : (this.upper && this.upper.clip.ballKeys ? this.upper : null);
      // the push of a pass (Trial 10): from where the ball was as the pass was planned, at the speed it had, onto the flight
      // at the release point at the launch speed (Director.planThrow; the clip's own path slowed into its release key
      // and the ball left the hands ~20 ft/s faster than it had been going, in one frame)
      const th = this._throw, tn = this.time || 0;
      if (th && cs && tn >= th.tp && tn <= th.tRel + 1e-6 && th.tRel > th.tp) {
        const T = th.tRel - th.tp, u = U.clamp((tn - th.tp) / T, 0, 1), u2 = u * u, u3 = u2 * u;
        const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2, v1 = th.segs[0].v0;
        for (let i = 0; i < 3; i++) out[i] = h00 * th.p0[i] + h10 * T * th.v0[i] + h01 * th.pRel[i] + h11 * T * v1[i];
        // (never through the body on the way: the curve from a behind-the-back windup to its release bowed into the small
        // of the back, ~0.5 in; the release point itself is kept, the flight starts there. Only for a release behind him:
        // an overhead push brushing the head was bent round it)
        if (u < 0.999 && th.behind) {
          const c = Math.cos(this.facing), sn = Math.sin(this.facing), rx = out[0] - this.x, ry = out[1] - this.y, L = BL;
          L[0] = rx * sn - ry * c; L[1] = rx * c + ry * sn; L[2] = out[2] - (this.jumpZ || 0);
          if (this.clearBall(L, BALL_R, true) > 1e-6) this.local(L[0], L[1], L[2], out);
        }
        return out;
      }
      if (cs) {
        const bk = cs.clip.ballKeys;
        const t = Math.min(cs.t, cs.clip.dur);
        let bx = bk[0](t), by = bk[1](t), bz = bk[2](t);
        if (cs.mirror) bx = -bx;
        const w = cs.w;
        const base = this._holdLocalS(HL);
        // the ball path is set for the body the clip was made with: when the body sits lower than that (the pelvis let
        // down so the legs reach planted feet, a crouched stance under an upper-body clip) the ball comes down with
        // the chest, and forward with a lean, instead of ending up in the chest or the face
        const q = this.pose;
        let dz = 0, dy = 0;
        if (cs === this.clip) dz = Math.min(0, q[CH.rootZ] - this.clipPose[CH.rootZ]) * H * 0.9;
        else { dz = -Math.max(0, -q[CH.rootZ] - 0.03) * H * 0.85; dy = Math.sin(Math.max(0, q[CH.pelPitch] + q[CH.spFlex] - 14 * D)) * 0.3 * H; }
        const L = BL;
        L[0] = U.lerp(base[0], bx * H, w); L[1] = U.lerp(base[1], by * H + dy, w); L[2] = U.lerp(base[2], bz * H + dz, w);
        this.clearBall(L, BALL_R, true);
        this.local(L[0], L[1], L[2], out);
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
      this.clearBall(l, BALL_R, true);
      return this.local(l[0], l[1], l[2], out);
    }
    /** where the nearest opponent is for a ball handler: w = threat (0 beyond ~8 ft, 1 inside ~4 ft, less when he
     *  is behind), side = 0 in front .. 1 out on the off-hand side; eased so the guard arm does not twitch */
    _guardDir(dt) {
      const g = this._gd || (this._gd = { w: 0, side: 0 });
      let best = null, bd = 1e9;
      const v = this.view;
      if (v && v.onCourt && v.actors && this.team >= 0) {
        for (const id of v.onCourt[1 - this.team] || []) {
          const o = v.actors[id]; if (!o) continue;
          const d = Math.hypot(o.x - this.x, o.y - this.y);
          if (d < bd) { bd = d; best = o; }
        }
      }
      let w = 0, side = 0;
      if (best && bd < 9) {
        const c = Math.cos(this.facing), s = Math.sin(this.facing);
        const dx = best.x - this.x, dy = best.y - this.y;
        const fwd = (dx * c + dy * s) / (bd || 1), lat = (dx * s - dy * c) / (bd || 1);
        // (lat > 0: he is to the right; the off arm is on the left while the right hand dribbles)
        const offDir = this.dribble && this.dribble.hand ? -1 : 1;
        w = U.smooth((8 - bd) / 4) * U.clamp(0.4 + fwd, 0, 1);
        side = U.clamp(offDir * lat * 1.4, 0, 1);
      }
      const k = dt > 0 ? 1 - Math.exp(-dt / 0.18) : 1;
      g.w += (w - g.w) * k; g.side += (side - g.side) * k;
      return g;
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
        // (on the front of the right hip, in toward the middle a little: the other hand reaches across to it from the
        // crouch and clears the belly)
        case 'triple': out[0] = 0.13 * H * m; out[1] = 0.2 * H; out[2] = 0.53 * H; break;
        case 'over': out[0] = 0; out[1] = 0.05 * H; out[2] = 1.1 * H; break;
        // (on the shot's line: ~6 in off the belly and a little more, so the straight line up clears the face; just
        // right of the middle)
        case 'pocket': out[0] = 0.06 * H * m; out[1] = 0.19 * H; out[2] = 0.55 * H; break;
        case 'low': out[0] = 0.02 * H * m; out[1] = 0.17 * H; out[2] = 0.36 * H; break;
        default: out[0] = 0; out[1] = 0.16 * H; out[2] = 0.66 * H;
      }
      // (protecting it from a reach: pulled away to the far side and down)
      const pk = this._protectK();
      if (pk > 0.001) { out[0] += this._protect.sgn * 0.07 * H * pk; out[1] -= 0.05 * H * pk; out[2] -= 0.06 * H * pk; }
      // the holds are set for a player standing tall: sitting lower and leaning in, the chest (and the ball held in
      // front of it) comes down and forward with him (a fixed spot ended up inside a crouched player's chest)
      const q = this.pose;
      if (q) {
        const drop = Math.max(0, -q[CH.rootZ] - 0.03) * H;
        const lean = Math.max(0, q[CH.pelPitch] + q[CH.spFlex] - 14 * D);
        out[2] -= drop * 0.85;
        out[1] += Math.sin(lean) * 0.3 * H;
      }
      // and it stays in front of the chest as the chest turns from the hips (a receiver running on with it, the chest still
      // turned back to the passer: held in front of the hips, the far hand reached across past its length and its twist,
      // ~5 in off the ball, Trial 10); the triple threat's at the hip stays with the hips
      const yw = (this.chestYaw || 0) * (HOLD_YAW_K[this.ballHold] != null ? HOLD_YAW_K[this.ballHold] : 1);
      if (Math.abs(yw) > 1e-4) { const cy = Math.cos(yw), sy = Math.sin(yw), x = out[0], y = out[1]; out[0] = x * cy - y * sy; out[1] = x * sy + y * cy; }
      return out;
    }
    /** how far a held ball's grips are turned from the hips' frame, with the ball (_holdLocal) */
    _holdYaw() { return (this.chestYaw || 0) * (HOLD_YAW_K[this.ballHold] != null ? HOLD_YAW_K[this.ballHold] : 1); }
    /** how low he dribbles (0..1): sitting down in the dribbling stance keeps the ball at the lowered hips (a speed
     *  dribble on the run comes back up), deeper still when protecting it */
    dribbleDepth() {
      // (driving he stays down in it; only running it out in the open does the dribble come back up)
      const st = this.stance === 'dribble' ? 0.35 * (1 - U.smooth((this.speed - 10) / 8)) : 0;
      // (and with a man up on him it goes lower, Trial 8)
      return Math.max(this.dribbleLow || 0, st, this._protectK(), M.Tune.handle.pressLow * this.pressure(), M.Tune.handle.retreatLow * this._retreatK());
    }
    /** how closely he is guarded, 0 to 1 (Trial 8): the nearest man on the other team on the floor, none from
     *  Tune.handle.pressFarFt, fully at pressNearFt, eased on a critically damped spring (pressS) */
    pressure() {
      const v = this.view, TH = M.Tune.handle, t = this.time || 0;
      const pr = this._press || (this._press = { k: 0, v: 0, t: null });
      if (pr.t === t) return pr.k;
      let bd = 1e9;
      if (v && v.onCourt && v.actors && this.team >= 0) for (const id of v.onCourt[1 - this.team] || []) { const o = v.actors[id]; if (o && !o.hidden) bd = Math.min(bd, Math.hypot(o.x - this.x, o.y - this.y)); }
      const want = U.smooth((TH.pressFarFt - bd) / (TH.pressFarFt - TH.pressNearFt)), dt = pr.t == null ? -1 : t - pr.t;
      pr.t = t;
      if (!(dt > 0) || dt > 0.12) { pr.k = want; pr.v = 0; return pr.k; }
      const w = 1 / TH.pressS, e = Math.exp(-w * dt), x = pr.k - want, j = pr.v + w * x;
      pr.k = U.clamp(want + (x + j * dt) * e, 0, 1); pr.v = (pr.v - j * w * dt) * e;
      return pr.k;
    }
    /** the dribble's shape for how he is moving (H-fractions, body frame, x toward the dribble hand): tx/ty = where
     *  the hand has the ball at the top, cx/cy = where it meets the floor, top = its height at the top. Sizing up
     *  (standing): the ball out wide of the hip with the arm long (the reference guard setup); driving: low, outside
     *  the foot; running it up the floor: pushed out ahead at thigh height, where he runs onto it */
    dribbleShape(o, fresh) {
      const low = this.dribbleDepth();
      const spK = U.smooth((this.speed - 6) / 12), still = 1 - U.smooth((this.speed - 1) / 4);
      o.tx = U.lerp(0.2, 0.27, still) - 0.03 * spK;
      o.ty = 0.12 + 0.2 * spK - 0.02 * still;
      o.cx = o.tx + 0.01;
      o.cy = o.ty + 0.05 + 0.22 * spK;
      o.top = 0.5 - 0.2 * low - 0.03 * spK;
      // (protecting it from a reach: the dribble pulled back beside the hip, a little wider; retreating, beside the back
      // knee, Trial 8)
      const pk = Math.max(this._protectK(), this._retreatK());
      if (pk > 0.001) { o.ty -= 0.12 * pk; o.cy -= 0.12 * pk; o.tx += 0.03 * pk; o.cx += 0.03 * pk; }
      // (a man up on him, not running: the control dribble, back beside the hip and in closer, the body between it and
      // him, Trial 8; coaching: "keep the ball low to the floor, behind and close to your body". Out in front it went
      // into the hands of a defender up on him. Not for the first bounce out of his hands, fresh: carried from the chest
      // to there, under the shoulder, the palm could not stay on top of it; he settles into it over that bounce)
      const TH = M.Tune.handle, pb = fresh ? 0 : TH.pressBackK * this.pressure() * (1 - spK) * (1 - pk);
      if (pb > 0.001) { o.ty -= 0.12 * pb; o.cy -= 0.12 * pb; o.tx -= TH.pressInK * pb; o.cx -= TH.pressInK * pb; }
      o.low = low; o.spK = spK; o.still = still;
      return o;
    }
    /** where the ball sits at the top of the dribble (see dribbleShape) */
    dribbleTop(hand, out) {
      const H = this.H, side = hand ? 1 : -1, g = this.dribbleShape(DSH);
      return this.localD(side * g.tx * H, g.ty * H, g.top * H, out);
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
      const st = stanceOf(this, name);
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
      // a pass coming to him and he steps in to meet it at a walk (Trial 10): the walk's torso takes less of his stance,
      // so he stays down in it with the hands held out where the ball will be; eased in and out (Tune.pass.meetLowS)
      const TP = M.Tune.pass, rcLowG = this._rc && this._rc.caught == null && this._rcW > 0.001 ? TP.meetLowK * (1 - U.smooth((this.speed - 5) / 3)) : 0;
      this._rcLow = (this._rcLow || 0) + (rcLowG - (this._rcLow || 0)) * (1 - Math.exp(-dtB / TP.meetLowS));
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
      // (how much of the gait's arm swing is shown, for the gait meter: a stance's arms held up or out swing little)
      this.gaitArmK = 0;
      if (this.gaitK > 0.001) {
        // moving sideways (a shuffle) or backwards the arms stop pumping and the torso stays quiet; all blended
        // by direction so nothing pops when a player turns his hips while moving
        const fd = this.fwdDot == null ? 1 : this.fwdDot;
        const back = this.backK != null ? this.backK : U.smooth((-fd - 0.15) / 0.3);
        const lat = this.latK || 0;
        // (stepping in to meet a pass he stays down in his stance, Trial 10: _rcLow, below)
        const kT = this.gaitK * U.lerp(U.lerp(stp.gaitTorso, 1, U.smooth((this.speed - 6) / 6)), U.lerp(0.35, 0.25, stp.slide), lat) * (1 - (this._rcLow || 0));
        const kA = this.gaitK * U.lerp(U.lerp(stp.gaitArms, 1, U.smooth((this.speed - 7) / 6)), U.lerp(0.16, 0.1, stp.slide), Math.max(lat, back * 0.6));
        this.gaitArmK = kA;
        // (the pose's mix of walk, jog and sprint follows the pace on a critically damped spring, Tune.gait.poseMixS:
        // walking into a jog the arms go from hanging to bent at 90 deg over ~1.2 ft/s of pace, and a quick start or
        // stop crossed that in a frame or two, the elbows swinging ~37 deg in one frame, Trial 5; people change gait
        // over a step or two)
        const tP = this.time || 0, dtP = this._poseT == null ? -1 : tP - this._poseT;
        this._poseT = tP;
        const gwT = A.gaitWeights(this.speed, this._gwT || (this._gwT = {}));
        const gm = this._gwS || (this._gwS = { jog: gwT.jog, sprint: gwT.sprint, vj: 0, vs: 0, walk: gwT.walk });
        if (!(dtP >= 0) || dtP > 0.12) { gm.jog = gwT.jog; gm.sprint = gwT.sprint; gm.vj = gm.vs = 0; }
        else if (dtP > 0) {
          const y = 2 * Math.LN2 / M.Tune.gait.poseMixS, e = Math.exp(-y * dtP);
          for (const [kx, kv] of [['jog', 'vj'], ['sprint', 'vs']]) {
            const j0 = gm[kx] - gwT[kx], j1 = gm[kv] + j0 * y;
            gm[kx] = e * (j0 + j1 * dtP) + gwT[kx]; gm[kv] = e * (gm[kv] - j1 * y * dtP);
          }
        }
        gm.jog = U.clamp(gm.jog, 0, 1); gm.sprint = U.clamp(gm.sprint, 0, 1 - gm.jog); gm.walk = 1 - gm.jog - gm.sprint;
        A.applyGait(p, this.phase, this.speed, kT, back, kA, this.gaitDbg ? this.gaitDbg.beta : null, gm);
        if (lat > 0.001) A.applySlide(p, this.phase, this.gaitK * lat);
        if (back > 0.001) { p[CH.spFlex] -= 6 * D * this.gaitK * back; p[CH.pelPitch] -= 4 * D * this.gaitK * back; }
      }
      // a single step (not the running cycle): the weight goes over the other foot while this one is up, the
      // stepping side's hip drops a little and comes through with the leg (a step taken by the leg alone, the hips
      // parked over the middle, looked like the leg was not part of the body)
      if (this.gaitK < 0.999 && this.fall <= 0) {
        const c = Math.cos(this.facing), s = Math.sin(this.facing);
        for (const f of this.feet) {
          if (f.state !== 'swing' || f.mode !== 'step') continue;
          const o = this.feet[1 - f.side];
          if (o.state !== 'plant') continue;
          const b = Math.sin(Math.PI * U.clamp(f.s || 0, 0, 1)) * (1 - U.clamp(this.gaitK, 0, 1)) * (this.clip ? 0.5 : 1);
          if (b <= 0.001) continue;
          const sg = f.side ? 1 : -1;
          // (the standing foot's offset to the right, feet)
          const lat = (o.x - this.x) * s - (o.y - this.y) * c;
          p[CH.rootX] += U.clamp(lat * 0.3, -0.12, 0.12) * b;
          p[CH.pelRoll] += sg * 2 * D * b;
          const fwd = ((f.tx - f.x) * c + (f.ty - f.y) * s) / H;
          p[CH.pelTwist] += sg * U.clamp(fwd * 0.5, -0.1, 0.1) * b;
          p[CH.chTwist] -= sg * U.clamp(fwd * 0.2, -0.04, 0.04) * b;
        }
      }
      // driving with the ball: he stays down in it (the dribble drive reference: low, knees bent, leaning into it);
      // only running it out in the open does he come up
      if (this.dribble && this.gaitK > 0.001 && !this.clip) {
        const drvK = U.smooth((this.speed - 3) / 4) * (1 - U.smooth((this.speed - 13) / 5)) * this.gaitK;
        p[CH.rootZ] -= 0.055 * drvK; p[CH.pelPitch] += 9 * D * drvK; p[CH.spFlex] += 4 * D * drvK; p[CH.nkFlex] -= 9 * D * drvK;
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
      // 3a. the body goes with the pass: the weight comes forward and the hips hinge and dip as the arms extend (the
      // upper-body clips leave the pelvis to the stance, so a pass was thrown by the arms alone with the legs and
      // hips standing still); a catch gives a little the other way
      if (this.upper && !this.clip) {
        const cs = this.upper, ev = cs.clip.events || {}, w = U.smooth(cs.w), t = cs.t;
        if (ev.release != null) {
          const r = Math.max(0.05, ev.release);
          const k = (t < r ? U.smooth(t / r) : Math.exp(-(t - r) / 0.16)) * w;
          p[CH.rootY] += 0.2 * k; p[CH.rootZ] -= 0.014 * k; p[CH.pelPitch] += 6 * D * k; p[CH.spFlex] += 3 * D * k;
        } else if (ev.catch != null) {
          const k = t < ev.catch ? 0 : U.smooth(Math.min(1, (t - ev.catch) / 0.07)) * Math.exp(-Math.max(0, t - ev.catch - 0.07) / 0.18) * w;
          p[CH.rootY] -= 0.08 * k; p[CH.rootZ] -= 0.01 * k; p[CH.pelPitch] += 2 * D * k; p[CH.spFlex] += 3 * D * k;
        }
      }
      // 3b. squared up to a pass target: the trunk takes the turn the feet have not made yet
      if (this.aim_ && this.aim_.w > 0.001 && !this.clip) {
        const a = this.aim_;
        // (a target nearly behind him gets less of it and none at all straight behind: past 180 the turn's way flips, and
        // the trunk swung ~60 deg from one side to the other in a frame, Trial 3)
        const r0 = U.wrapPi(Math.atan2(a.y - this.y, a.x - this.x) - this.facing);
        const rel = U.clamp(r0, -1.25, 1.25) * U.smooth(a.w) * U.smooth((Math.PI - Math.abs(r0)) / 0.9);
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
      // landing from a jump: the legs give under the weight, deeper the harder he comes down (~0.1 ft at 10 ft/s, the
      // lowest ~0.08 s after touching down, then back up) with the trunk folding a little over the hips, on top of
      // the landing the move itself is drawn with
      const ab = this._absorb;
      if (ab) {
        const t = this.time - ab.t;
        if (t > 0.7 || t < 0) this._absorb = null;
        else {
          const k = Math.min(1.3, ab.v / 10) * (t / 0.08) * Math.exp(1 - t / 0.08);
          p[CH.rootZ] -= 0.015 * k; p[CH.pelPitch] += 5 * D * k; p[CH.spFlex] += 3 * D * k; p[CH.nkFlex] -= 3 * D * k;
        }
      }
      // a crossover (between the legs, behind the back) moves the body with the ball: the weight down on the outside
      // foot as the ball is pushed across (the hips over it, the shoulder on the ball side dipped), over the middle as
      // the ball crosses and onto the other foot by the catch, the way he pushes off, the head staying level. (Only
      // the hands and the ball moved: the body stood still over a ball going side to side)
      const dr = this.dribble && this.dribble.ball && this.dribble.ball.dr;
      if (dr && dr.actor === this && dr.move && dr.moveStarted && (!this._xo || this._xo.mv !== dr.move)) {
        this._xo = { mv: dr.move, t: this.time, dur: Math.max(0.2, dr.move.period || 0.36), from: dr.hand === 1 ? 1 : -1, k: dr.move.type === 'cross' ? 1 : dr.move.type === 'hesi' ? 0 : 0.7 };
      }
      const xo = this._xo;
      if (xo) {
        const sx = (this.time - xo.t) / xo.dur;
        if (sx > 1.6 || sx < 0) this._xo = null;
        else if (!this.clip) {
          // (standing or walking into it; on the move, a drive's crossover, the weight shows in the lean into the
          // push instead: the hips shifted over one foot at speed pulled the other out of its reach)
          const env = U.smooth(sx / 0.2) * (1 - U.smooth((sx - 0.9) / 0.7)) * xo.k * (1 - U.smooth((this.speed - 5) / 6));
          const side = xo.from * Math.cos(Math.PI * U.smooth(U.clamp(sx, 0, 1))) * env, dip = Math.sin(Math.PI * U.clamp(sx, 0, 1)) * env;
          p[CH.rootX] += 0.2 * side; p[CH.rootZ] -= 0.03 * dip;
          p[CH.pelRoll] += 4 * D * side; p[CH.spLat] += 7 * D * side; p[CH.chLat] += 4 * D * side;
          p[CH.nkLat] -= 7 * D * side; p[CH.hdLat] -= 3 * D * side;
          p[CH.pelPitch] += 5 * D * dip; p[CH.spFlex] += 4 * D * dip;
        }
      }
      // the moves standing, sizing a man up: between the legs the weight goes forward onto the front foot as the ball
      // goes under it; behind the back the shoulders turn with the arm that wraps it round (that shoulder back); a
      // hesitation comes up out of the stance, trunk up and eyes up at the rim as if to shoot, and hangs there
      if (dr && dr.actor === this && dr.move && dr.moveStarted && !this.clip) {
        // (standing only: the weight goes onto the front foot as far as _moveSteps steps it forward, which it does
        // below 2.5 ft/s; walking, with the feet square, the hips forward over them took the ball through a thigh. The
        // shoulders' turn behind the back too: on the move it put a hand or elbow pop back into Trial 8's walking move)
        const mu = U.clamp(dr.u || 0, 0, 1), still = 1 - U.smooth((this.speed - 1.5) / 1), ty = dr.move.type;
        if (ty === 'btl') {
          const e = Math.sin(Math.PI * mu) * still;
          p[CH.rootY] += 0.08 * e; p[CH.rootZ] -= 0.035 * e; p[CH.pelPitch] += 5 * D * e; p[CH.spFlex] += 3 * D * e;
        } else if (ty === 'btb') {
          const e = Math.sin(Math.PI * mu) * still, tw = -(dr.hand ? 1 : -1) * 16 * D * e;
          p[CH.chTwist] += tw * 0.6; p[CH.spTwist] += tw * 0.4; p[CH.spFlex] += 4 * D * e;
        } else if (ty === 'hesi' && !dr.move.withClip) {
          // (a hesitation from hesitate() rises with the 'hesi' clip, Trial 8: this one is for a hesitation in a combo)
          const e = U.smooth(mu / 0.35) * (1 - U.smooth((mu - 0.8) / 0.2));
          p[CH.rootZ] += 0.07 * e; p[CH.pelPitch] -= 10 * D * e; p[CH.spFlex] -= 5 * D * e; p[CH.chFlex] -= 3 * D * e;
          p[CH.nkFlex] -= 6 * D * e; p[CH.hdFlex] -= 3 * D * e;
        }
      }
      // knocked down (charge)
      if (this.fall > 0) {
        const f = U.smooth(this.fall);
        p[CH.rootZ] = U.lerp(p[CH.rootZ], -0.4, f); p[CH.pelPitch] = U.lerp(p[CH.pelPitch], -70 * D, f);
        p[CH.spFlex] = U.lerp(p[CH.spFlex], 20 * D, f); p[CH.nkFlex] = U.lerp(p[CH.nkFlex], 25 * D, f);
      }
      // 5. head look-at, or, turned to run somewhere, watching the ball (or whatever he was facing) over his shoulder;
      // the head gets there at a human pace
      this._applyLook(p);
      // 5b. knocked off balance by a contact: the torso goes with the push, the head lags, the arms come out
      const hit = this.hit;
      if (hit) {
        const a = hit.t < 0.07 ? hit.t / 0.07 : Math.exp(-(hit.t - 0.07) / 0.18);
        const k = hit.k * a;
        const c = Math.cos(this.facing), sn = Math.sin(this.facing);
        const lat = hit.nx * sn - hit.ny * c, fwd = hit.nx * c + hit.ny * sn;
        p[CH.spLat] += lat * 9 * D * k; p[CH.chLat] += lat * 7 * D * k; p[CH.pelRoll] += lat * 3 * D * k;
        p[CH.spFlex] += fwd * 8 * D * k; p[CH.chFlex] += fwd * 5 * D * k;
        p[CH.nkLat] -= lat * 7 * D * k; p[CH.nkFlex] -= fwd * 6 * D * k;
        p[CH.lShA] += 16 * D * k; p[CH.rShA] += 16 * D * k; p[CH.lElF] += 10 * D * k; p[CH.rElF] += 10 * D * k;
        // in the air nothing holds the legs: the body turns about its middle, the hips and legs swinging the other
        // way from the shoulders
        if (hit.air) {
          p[CH.pelRoll] -= lat * 10 * D * k; p[CH.pelPitch] -= fwd * 6 * D * k;
          p[CH.lHipA] += lat * 6 * D * k; p[CH.rHipA] -= lat * 6 * D * k;
        }
      }
      // reaching for the ball: the weight goes onto the front foot toward it (the hips forward and down, the trunk
      // over), the other arm back, and he comes back out of it
      const lg = this._lunge;
      if (lg) {
        const t = this.time - lg.t, e = t < 0.2 ? U.smooth(t / 0.2) : 1 - U.smooth((t - 0.2) / 0.4);
        if (e > 0.001) {
          const rel = U.wrapPi(lg.a - this.facing), f = Math.cos(rel), r = -Math.sin(rel);
          p[CH.rootY] += 0.35 * f * e; p[CH.rootX] += 0.35 * r * e; p[CH.rootZ] -= 0.05 * e;
          p[CH.pelPitch] += 10 * D * e; p[CH.spFlex] += 4 * D * e;
          p[CH.lShF] -= 25 * D * e; p[CH.lShA] += 15 * D * e;
        }
      }
      // protecting the ball from a reach: the near shoulder turned into it, leaning away, a little lower, eyes on it.
      // Dribbling, it is the off shoulder that goes into the reach: the body turns side-on so it is between the reach
      // and the ball (up to ~45 deg, over the planted feet), the off arm comes up as a bar (the arm targets) and the
      // eyes stay on the reach
      const pk = this._protectK();
      if (pk > 0.001) {
        const pr = this._protect, sg = pr.sgn;
        if (this.dribble && pr.rel != null) {
          const offS = this.dribble.hand ? 1 : -1, tw = U.clamp(U.wrapPi(pr.rel - offS * Math.PI / 2), -0.8, 0.8) * pk;
          p[CH.pelTwist] += tw * 0.3; p[CH.spTwist] += tw * 0.3; p[CH.chTwist] += tw * 0.4;
          p[CH.spLat] -= offS * 5 * D * pk; p[CH.rootZ] -= 0.03 * pk; p[CH.pelPitch] += 4 * D * pk;
          p[CH.nkTwist] -= tw * 0.45; p[CH.hdTwist] -= tw * 0.25;
        } else {
          p[CH.chTwist] -= sg * 18 * D * pk; p[CH.spTwist] -= sg * 10 * D * pk; p[CH.pelTwist] -= sg * 6 * D * pk;
          p[CH.spLat] += sg * 5 * D * pk; p[CH.rootZ] -= 0.025 * pk;
          p[CH.nkTwist] += sg * 16 * D * pk; p[CH.hdTwist] += sg * 6 * D * pk;
        }
      }
      // 6. procedural overlays (dribble arm etc.) handled in IK stage
    }

    /** the head turns to what the player looks at (Tune.look): the turn it asks for (eased into its ends, no dead stop)
     *  is followed by a critically damped spring driven through a short lag, so a new target draws the head round in
     *  a smooth, human-paced turn (fast at first, settling in) instead of snapping there in one frame, and letting go
     *  of a target lets the head come back the same way. Split chest 0.2, neck 0.35, head 0.35 */
    _applyLook(p) {
      const TL = M.Tune.look, t = this.look_;
      let want = 0;
      // (from where the head is: for a target close by, the ball coming into the hands, the body's centre is off by a lot)
      const P0 = this.sk.P, hc0 = RG.J.HC * 3, hOk = P0 && isFinite(P0[hc0]) && P0[hc0 + 2] > 0;
      const ex = hOk ? P0[hc0] : this.x, ey = hOk ? P0[hc0 + 1] : this.y;
      if (t) {
        const tx = t.x != null ? t.x : 0, ty = t.y != null ? t.y : 0;
        want = U.wrapPi(Math.atan2(ty - ey, tx - ex) - this.facing);
      } else if (this._watchK > 0.05 && !this.clip && this._watch != null) want = U.wrapPi(this._watch - this.facing) * this._watchK;
      want = RG.softClamp(want, -TL.maxRad, TL.maxRad, TL.softRad);
      const lk = this._lk || (this._lk = { y: want, v: 0, u: want, t: this.time || 0 });
      const dt = (this.time || 0) - lk.t;
      lk.t = this.time || 0;
      if (!(dt >= 0) || dt > 0.12) { lk.y = want; lk.u = want; lk.v = 0; lk.w = null; }
      else if (dt > 0 && t && this._lkHold && (this.time || 0) < this._lkHold.until) {
        // a target held (a pass coming, a decoy): the gaze is held on it in the world while the body turns under it, the
        // spring on where it looks in the world (Trial 10: sprung relative to the body, a body turning into a catch took the
        // head off the ball with it). Only then: every look held in the world, each turn the steering snapped into went into
        // the neck in a frame, the head and neck popping ~23 times a player-minute in games (~2 before)
        const wantW = Math.atan2((t.y != null ? t.y : 0) - ey, (t.x != null ? t.x : 0) - ex);
        // (started going the way the gaze was going, the body's turn and the head's on it: started still, a look held as the
        // body turned ~5.7 rad/s jolted the neck and head the other way, ~12,000 to 15,000 deg/s^2)
        const lw = lk.w || (lk.w = { y: this.facing + lk.y, v: (this.faceW || 0) + (lk.v || 0), u: this.facing + lk.y });
        lw.u += U.wrapPi(wantW - lw.u) * (1 - Math.exp(-dt / TL.leadS));
        const w = TL.omega, e = Math.exp(-w * dt), j0 = U.wrapPi(lw.y - lw.u), j1 = lw.v + j0 * w;
        lw.y = lw.u + e * (j0 + j1 * dt); lw.v = e * (lw.v - j1 * w * dt);
        lk.raw = U.wrapPi(lw.y - this.facing);
        const r = RG.softClamp(lk.raw, -TL.maxRad, TL.maxRad, TL.softRad);
        lk.v = (r - lk.y) / dt; lk.y = r; lk.u = r;
      } else if (dt > 0) {
        lk.w = null;
        // (a target jumping across behind the head: the short way round is through the front, never the back)
        lk.u += (want - lk.u) * (1 - Math.exp(-dt / TL.leadS));
        const w = TL.omega, e = Math.exp(-w * dt), j0 = lk.y - lk.u, j1 = lk.v + j0 * w;
        lk.y = e * (j0 + j1 * dt) + lk.u; lk.v = e * (lk.v - j1 * w * dt);
      }
      let rel = lk.y;
      // a pass coming from the side: the chest opens toward where the hands take it, and for one from further round than the
      // head turns (a ball from behind a runner) the trunk turns as far as the eyes need, Tune.pass.chestTurnDeg at most
      // (Trial 10: square to the run, the far hand could not reach a ball taken out to the side); the neck and head turn
      // that much less, so the eyes stay where they look
      let twY = 0;
      if (t && lk.w && this._rcW > 0.001 && lk.raw != null) {
        const cm = M.Tune.pass.chestTurnDeg * D, x1 = U.clamp(lk.raw - rel, -cm, cm), x2 = this._rcA != null ? U.clamp(U.wrapPi(this._rcA - this.facing) * 0.7, -cm, cm) : 0;
        const x = (Math.abs(x1) > Math.abs(x2) ? x1 : x2) * this._rcW;
        const tw = this._rcTw || (this._rcTw = { y: 0, v: 0 });
        if (dt > 0 && dt <= 0.12) { const w = TL.omega, e = Math.exp(-w * dt), j0 = tw.y - x, j1 = tw.v + j0 * w; tw.y = x + e * (j0 + j1 * dt); tw.v = e * (tw.v - j1 * w * dt); } else { tw.y = x; tw.v = 0; }
        twY = tw.y;
      } else if (this._rcTw) {
        const tw = this._rcTw;
        if (dt > 0 && dt <= 0.12) { const w = TL.omega, e = Math.exp(-w * dt), j0 = tw.y, j1 = tw.v + j0 * w; tw.y = e * (j0 + j1 * dt); tw.v = e * (tw.v - j1 * w * dt); } else { tw.y = 0; tw.v = 0; }
        if (Math.abs(tw.y) < 1e-4 && Math.abs(tw.v) < 1e-3) this._rcTw = null; else twY = tw.y;
      }
      // (the look as it is now: after a held look, from where the free look has it; from the held look's last angle, kept while
      // the chest's turn eased off after a catch, the head stood still and then jumped to where the look had gone, ~19,000
      // deg/s^2)
      if (twY) { p[CH.spTwist] += twY * 0.4; p[CH.chTwist] += twY * 0.6; rel = RG.softClamp(U.wrapPi((lk.w && lk.raw != null ? lk.raw : lk.y) - twY), -TL.maxRad, TL.maxRad, TL.softRad); }
      // (all of it: at 0.35 and 0.35 the head came 10% short of what it looked at, Trial 10)
      if (Math.abs(rel) >= 1e-5) { p[CH.chTwist] += rel * 0.2; p[CH.nkTwist] += rel * 0.4; p[CH.hdTwist] += rel * 0.4; }
      // a target with a height (the ball in the air, Trial 10): the head tips up or down to it, from where the head is
      let wantP = 0;
      const lp0 = this._lkP;
      if (t && t.z != null && t.x != null) {
        const P = this.sk.P, hc = RG.J.HC * 3, has = P && isFinite(P[hc + 2]) && P[hc + 2] > 0;
        const hx = has ? P[hc] : this.x, hy = has ? P[hc + 1] : this.y, hz = has ? P[hc + 2] : (this.jumpZ || 0) + 0.9 * this.H;
        const el = Math.atan2(t.z - hz, Math.max(0.3, Math.hypot(t.x - hx, t.y - hy)));
        // (from where the face points in the pose, the tip this look gave it last time taken back out: a stance bent
        // over points the face ~15 deg at the floor, and the tip added to that left the eyes low)
        const R = this.sk.R, j = RG.J.HJ * 9, fl = has && R ? Math.hypot(R[j + 1], R[j + 4], R[j + 7]) : 0;
        const face = fl > 0.5 ? Math.asin(U.clamp(R[j + 7] / fl, -1, 1)) : 0;
        wantP = U.clamp(el - (face - (lp0 && lp0.app ? lp0.app : 0)), -TL.maxPitchRad, TL.maxPitchRad);
      }
      const lp = lp0 || (this._lkP = { y: wantP, v: 0, u: wantP, app: 0 });
      if (!(dt >= 0) || dt > 0.12) { lp.y = wantP; lp.u = wantP; lp.v = 0; }
      else if (dt > 0) {
        lp.u += (wantP - lp.u) * (1 - Math.exp(-dt / TL.leadS));
        const w = TL.omega, e = Math.exp(-w * dt), j0 = lp.y - lp.u, j1 = lp.v + j0 * w;
        lp.y = e * (j0 + j1 * dt) + lp.u; lp.v = e * (lp.v - j1 * w * dt);
      }
      lp.app = lp.y * TL.pitchK;
      if (Math.abs(lp.app) >= 1e-5) { p[CH.nkFlex] -= lp.app * 0.5; p[CH.hdFlex] -= lp.app * 0.5; }
    }

    /** one body, turning: (1) the hips take about a third of any turn of the upper body over planted feet (a pass,
     *  a look, squaring up), spread so the lower spine sits between the hips and the chest instead of the chest
     *  twisting on still hips; (2) a turn of the whole body starts at the head: the head and neck lead the facing by
     *  its turn rate, the chest a little, and the hips come round last (standing and walking turns go eyes, head,
     *  trunk, pelvis, feet). dt: time since the last solve (0 = the same frame again) */
    _bodyTurn(p, dt) {
      const kt = this._kt || (this._kt = { f: this.facing, wf: 0, wv: 0, ld: 0, lv: 0 });
      // the rest of the turn the body is making (where the steering wants it to face), while it steers itself
      const lead = !this.clip && this._wantT != null && this.time - this._wantT < 0.1 ? U.clamp(U.wrapPi(this._wantFace - this.facing), -0.9, 0.9) : 0;
      if (!(dt >= 0) || dt > 0.12) { kt.f = this.facing; kt.wf = 0; kt.wv = 0; kt.ld = lead; kt.lv = 0; }
      else if (dt > 0) {
        const raw = U.clamp(U.wrapPi(this.facing - kt.f) / dt, -14, 14);
        kt.f = this.facing;
        // (the turn rate and the lead eased by critically damped springs, ~40 and ~60 ms, so neither twitches)
        let y = 2 * Math.LN2 / 0.04, j0 = kt.wf - raw, j1 = kt.wv + j0 * y, e = Math.exp(-y * dt);
        kt.wf = e * (j0 + j1 * dt) + raw; kt.wv = e * (kt.wv - j1 * y * dt);
        // (only while the body is really turning: a facing held off its target - a pivot foot, a lock - would
        // otherwise leave the chest twisted and the hands off a held ball)
        const leadT = lead * U.smooth((Math.abs(kt.wf) - 0.3) / 1.2);
        y = 2 * Math.LN2 / 0.06; j0 = kt.ld - leadT; j1 = kt.lv + j0 * y; e = Math.exp(-y * dt);
        kt.ld = e * (j0 + j1 * dt) + leadT; kt.lv = e * (kt.lv - j1 * y * dt);
      }
      // (not boxing out, where the hips stay square to the man sealed behind while the head and chest find the ball,
      // and half of it in a defensive stance, squared up to the ball handler)
      const stK = this.stance === 'boxout' ? 0 : this.stance === 'defense' || this.stance === 'defenseWide' ? 0.5 : 1;
      const kT = 0.3 * (1 - U.clamp(this.gaitK, 0, 1)) * (this.fall > 0 ? 0 : 1) * stK;
      if (kT > 0.001) {
        const T = p[CH.spTwist] + p[CH.chTwist];
        const add = U.clamp(kT * T, -0.1, 0.1), k = Math.abs(T) > 1e-6 ? add / T : 0;
        p[CH.pelTwist] += add; p[CH.spTwist] *= 1 - k; p[CH.chTwist] *= 1 - k;
      }
      // the head and neck turn toward the new direction first, the chest part of the way, the hips last (they
      // follow the feet); a clip animates its own head and turn, so it gets none of this. Nor does a head whose gaze is
      // held on something in the world (_applyLook, lk.w): it is already where it looks while the body turns under it
      // (Trial 10: added to it, the eyes swung ~45 deg past a ball coming to a man turning into the catch); eased in and
      // out over ~0.1 s as a look starts and ends
      const gz = this.look_ && this._lk && this._lk.w ? 1 : 0;
      kt.gz = kt.gz == null || !(dt > 0 && dt <= 0.12) ? gz : kt.gz + (gz - kt.gz) * (1 - Math.exp(-dt / 0.1));
      const ld = kt.ld, wf = this.clip ? 0 : kt.wf, hg = 1 - kt.gz;
      if (Math.abs(ld) > 0.002 || Math.abs(wf) > 0.05) {
        p[CH.hdTwist] += (0.35 * ld + U.clamp(0.02 * wf, -0.12, 0.12)) * hg;
        p[CH.nkTwist] += (0.3 * ld + U.clamp(0.015 * wf, -0.1, 0.1)) * hg;
        p[CH.chTwist] += (0.18 * ld + U.clamp(0.008 * wf, -0.05, 0.05)) * hg;
        p[CH.spTwist] += 0.07 * ld * hg;
        p[CH.pelTwist] -= U.clamp(0.012 * wf, -0.08, 0.08);
      }
    }
    /** one body, follow-through and overlap: each segment out along a chain (lower spine, chest, neck, head; upper
     *  arm, forearm) carries a small lag spring on its world angle, driven by how the animated angle accelerates,
     *  so it trails a little as a motion starts and carries on a little as it stops ("successive breaking of
     *  joints"). A landing or a take-off (the pelvis' vertical acceleration) nods the head and neck a touch. Arms
     *  held on the ball by IK keep their hands there (only their elbows' bulge follows). dt as in _bodyTurn */
    _followThrough(p, dt) {
      const kc = this._kc || (this._kc = new KChain(10));
      const fresh = !(dt >= 0) || dt > 0.12;
      if (fresh) kc.reset();
      const go = !fresh && dt > 0;
      // vertical acceleration of the pelvis, and the body's forward and sideways acceleration (ft/s^2)
      const hz = p[CH.rootZ] * this.H;
      let aUp = 0, aF = 0, aL = 0;
      if (go) {
        const vz = (hz - kc.hz) / dt; if (kc.warm >= 2) aUp = U.clamp((vz - kc.vz) / dt, -200, 200); kc.vz = vz;
        if (kc.warm >= 1) {
          const c = Math.cos(this.facing), s = Math.sin(this.facing), ax = (this.vx - kc.pvx) / dt, ay = (this.vy - kc.pvy) / dt;
          aF = U.clamp(ax * c + ay * s, -40, 40); aL = U.clamp(ax * s - ay * c, -40, 40);
        }
      } else if (fresh) kc.vz = 0;
      kc.hz = hz; kc.pvx = this.vx; kc.pvy = this.vy;
      let W = p[CH.pelPitch], prev = 0, chestW = 0;
      for (let k = 0; k < 4; k++) {
        const ch = KC_PITCH[k];
        W += p[ch];
        if (k === 1) chestW = W;
        // (landing: the head nods; braking: it tips forward a touch, speeding up: back)
        const ext = k === 3 ? 0.18 * aUp - 0.12 * aF : k === 2 ? 0.1 * aUp - 0.06 * aF : 0;
        const o = kc.at(k, W, dt, go, KC_SPINE[k], ext);
        p[ch] += o - prev; prev = o;
      }
      for (let side = 0; side < 2; side++) {
        const pre = side ? 'r' : 'l', b = 4 + side * 3;
        const iF = CH[pre + 'ShF'], iE = CH[pre + 'ElF'], iA = CH[pre + 'ShA'];
        const wUa = chestW + p[iF], wFa = wUa + p[iE];
        // (the arms hang from the shoulders: braking swings them forward, speeding up leaves them behind, a cut to
        // one side swings them the other way)
        const sgA = side ? 1 : -1;
        const oU = kc.at(b, wUa, dt, go, KC_UA, -0.45 * aF), oF = kc.at(b + 1, wFa, dt, go, KC_FA, 0), oA = kc.at(b + 2, p[iA], dt, go, KC_AB, -0.4 * sgA * aL);
        p[iF] += oU; p[iE] += oF - oU; p[iA] += oA;
      }
      if (go) kc.warm++;
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
      // one body: the hips take their share of a turn of the upper body, and a turn starts at the head
      this._bodyTurn(p, dtI);
      // the pose's own pelvis height glides over a jump: a stance, stride or move switching it in one step dropped or
      // lifted the hips up to ~5 in in one frame (Trial 4: ~60 times a quarter past 3 in)
      this._inHip.apply(p, dtI);
      // (and it moves no faster than Tune.weight.hipPoseFtps: a move fading in over its first 0.06 s from a slide's low
      // hips lifted them ~12 in in four frames, and a stance lowering into a slide at a run dropped them 2 in a frame)
      {
        const zIn = p[CH.rootZ] * H, hp = this._hpz;
        if (hp == null || !(dtI >= 0) || dtI > 0.12) this._hpz = zIn;
        else if (dtI > 0) { const m = M.Tune.weight.hipPoseFtps * dtI; this._hpz = hp + U.clamp(zIn - hp, -m, m); }
        p[CH.rootZ] = this._hpz / H;
      }
      const fall = this.fall;
      // feet
      let minRootZ = Infinity;
      const c = Math.cos(this.facing), s = Math.sin(this.facing);
      for (const f of this.feet) {
        const ik = sk.legIK[f.side];
        f.reachZ = null;
        if (f.state === 'air' || fall > 0.5) { ik.on = 0; continue; }
        ik.on = 1;
        if (f.state === 'plant') {
          // (the heel comes up off the floor when the shin leans further over the foot than an ankle bends)
          // (the heel up for a pivot or a deep ankle; a heel strike's toes-up pitch is kept as it is, the heel rocker:
          // held at flat, every walking step landed flat-footed)
          // (a heel strike's toes-up pitch and a heel coming up (a pivot, the ankle's range) add: taken as the larger,
          // the first hair of heel rise set the toes-up foot flat at once and the forefoot slapped down ~3 in in a frame
          // on a walking turn, Trial 5)
          const up = Math.max(f.heelFloor || 0, f.pvPitch || 0), fp = f.pitch + (f.land && f.lp ? f.lp : 0);
          const pu = fp < 0 ? fp + up : Math.max(fp, up);
          const a = this._ankleFromBall(f.x, f.y, f.yaw, pu, TA);
          ik.x = a[0]; ik.y = a[1]; ik.z = a[2] + (f.land ? f.lz || 0 : 0); ik.yaw = f.yaw; ik.pitch = pu; ik.soft = false; f.pitchUsed = pu;
          // (a leg that has just landed: its knee's turn about the hip-ankle line from where it was in the air, measured
          // by the first solve, see _plantHere, eases out on a critically damped spring, Tune.gait.landSwivelS)
          if (ik.swNew) { f.swv = ik.swv; f.swvV = 0; ik.swNew = false; }
          if (f.swv && dtI > 0) {
            const w = 1 / M.Tune.gait.landSwivelS, e = Math.exp(-w * dtI), j = (f.swvV || 0) + w * f.swv;
            f.swv = (f.swv + j * dtI) * e; f.swvV = ((f.swvV || 0) - j * w * dtI) * e;
            if (Math.abs(f.swv) < 0.05 * D && Math.abs(f.swvV) < 1 * D) { f.swv = 0; f.swvV = 0; }
          } else if (!(dtI >= 0) || dtI > 0.12) { f.swv = 0; f.swvV = 0; }
          ik.swv = f.swv || 0; ik.swRef = f.swRef || null; f.swRef = null;
        } else {
          f.swv = 0; f.swvV = 0; f.swRef = null; ik.swv = 0; ik.swRef = null; ik.swNew = false;
          ik.x = f.ax; ik.y = f.ay; ik.z = f.az; ik.yaw = f.yawNow != null ? f.yawNow : f.yaw; ik.pitch = f.pitchNow || 0;
          if (f.paT !== this.time) { f.pax2 = f.pax; f.pay2 = f.pay; f.paT2 = f.paT; }
          f.pax = f.ax; f.pay = f.ay; f.paT = this.time;
          // (fully soft in mid-swing; a walker's leg reaches its heel strike exactly so the plant does not jump,
          // a runner's landing is kept reachable by the pelvis settling instead)
          ik.soft = true; ik.softW = U.lerp(0.02, 0.06, U.smooth((this.speed - 6) / 2.5));
          ik.softK = f.mode === 'gait' && f.sw != null ? U.lerp(1 - U.smooth((f.sw - 0.72) / 0.26), 1, U.smooth((this.speed - 6) / 2.5)) : 1;
          // (and it comes in over the first fifth of the swing: at toe-off the leg is at full stretch, and a soft leg
          // there left the ankle ~1 in short of where the planted leg had it, a pop at every lift-off, Trial 3)
          if (f.mode === 'gait' && f.sw != null) ik.softK *= U.smooth(f.sw / 0.2);
          else if (f.mode === 'step' && f.s != null) ik.softK *= U.smooth(f.s / 0.2);
          // (the guide that holds a leg in the air with its knee over its own line comes in over the same first part: a
          // planted leg may be far past it, its foot held on its spot out to the side in a hard turn, and at lift-off it
          // snapped the leg in, the ankle up to ~17 in in one frame, Trial 4)
          const tf = M.Tune.floor.airGuardSw;
          ik.guardK = M.Tune.floor.airGuideK * (f.mode === 'gait' && f.sw != null ? U.smooth(f.sw / tf) : f.mode === 'step' && f.s != null ? U.smooth(f.s / tf) : 1);
          // late in a gait swing the pelvis already settles so the leg meets the floor with the knee a little bent
          // (runners land at ~15-20 deg of knee flexion) instead of locking straight and dropping at contact
          if (f.mode === 'gait' && f.sw > 0.55 && f.lax != null && this.gaitOn && !this.clip) {
            // (measured from where the hip will be at contact, not where it is now)
            const side = f.side ? 1 : -1;
            const hx = f.lpx + s * side * this.dims.hipX, hy = f.lpy - c * side * this.dims.hipX;
            const runK = U.smooth((this.speed - 6) / 2.5);
            const Lr = (this.dims.th + this.dims.sh) * U.lerp(0.9986, 0.975, runK), dh = Math.hypot(f.lax - hx, f.lay - hy);
            const zl = f.laz + Math.sqrt(Math.max(0.01, Lr * Lr - dh * dh));
            // (never lower than Tune.floor.landSettleH under the pose for it: a landing spot still out of reach (aimed
            // before a stop or a turn, re-aimed only so fast) is met where the foot gets to, see _plantHere; reaching
            // for it the pelvis dropped up to a foot in two frames, Trial 3)
            const zFloor = this.dims.hipH + p[CH.rootZ] * H - (0.012 + M.Tune.floor.landSettleH) * H;
            minRootZ = Math.min(minRootZ, Math.max(zl, zFloor) + (1 - U.smooth((f.sw - 0.55) / 0.45)) * 0.6);
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
        // (behind the hips as he faces, or as he goes: a body sliding or running sideways, or backpedalling, leaves a
        // foot at his side or in front of him; held flat, the leg ran out of reach and the pelvis dropped 3 to 6 in in a
        // frame, Trial 4)
        const behind = (f.x - hx) * c + (f.y - hy) * s < 0 || (this.speed > 3 && (f.x - hx) * this.vx + (f.y - hy) * this.vy < 0);
        // (how far it needs to come up, from the pitch in use)
        let need = 0;
        if (zmax < wantZ && behind && this.gaitOn && !this.clip) {
          const maxPitch = (this.speed > 9 ? 68 : 58) * D;
          let pitch = Math.max(0, ik.pitch), zm = zmax;
          while (zm < wantZ && pitch < maxPitch) {
            pitch = Math.min(maxPitch, pitch + 2 * D);
            const a = this._ankleFromBall(f.x, f.y, f.yaw, pitch, TA), d2 = Math.hypot(a[0] - hx, a[1] - hy);
            zm = a[2] + Math.sqrt(Math.max(0.01, L * L - d2 * d2));
          }
          need = pitch;
        }
        // the heel comes up for it progressively (a real push-off takes a few frames) and back down the same way, held
        // apart from the stride's own pitch, Tune.floor.heelRiseDegps / heelDropDegps (Trial 5: raised as far as the time
        // since its last rise allowed, up to 0.1 s of it, a slide's landing foot had its heel come up ~30 deg in one
        // frame, and the stride's own pitch put it back down the next; the knee popped both times)
        // (faster the faster he goes: a sprinter's ankle is the last and quickest joint to extend at push-off; held to a
        // walker's rate at a top-speed chase, the leg the body was running away from snapped straight, Trial 5)
        if (dtI > 0 && dtI <= 0.12) {
          const r = f.reachP || 0, TF0 = M.Tune.floor, up = U.lerp(TF0.heelRiseDegps, TF0.heelRiseSprintDegps, U.smooth((this.speed - 6) / 14));
          f.reachP = need > r ? Math.min(need, r + up * D * dtI) : Math.max(need, r - TF0.heelDropDegps * D * dtI);
        } else if (!(dtI >= 0) || dtI > 0.12) f.reachP = 0;
        const pitchR = ik.pitch < 0 ? ik.pitch + (f.reachP || 0) : Math.max(ik.pitch, f.reachP || 0);
        if (pitchR > ik.pitch + 1e-6) {
          const pitch = pitchR, a = this._ankleFromBall(f.x, f.y, f.yaw, pitch, TA);
          dh = Math.hypot(a[0] - hx, a[1] - hy);
          zmax = a[2] + Math.sqrt(Math.max(0.01, L * L - dh * dh));
          ik.x = a[0]; ik.y = a[1]; ik.z = a[2] + (f.land ? f.lz || 0 : 0); ik.pitch = pitch; f.pitchUsed = pitch;
        }
        minRootZ = Math.min(minRootZ, zmax);
        f.reachZ = zmax;
      }
      // pelvis height: pose + jump; clamp for reach when on the ground
      let rootZ = this.dims.hipH + p[CH.rootZ] * H + this.jumpZ;
      this._hipZPose = this.dims.hipH + p[CH.rootZ] * H;
      // (how far each planted foot pulls the pelvis down to reach it, in heights: a foot the body has run away from
      // steps, see _hipGuard's strain)
      for (const f of this.feet) f.reachDrop = f.state === 'plant' && f.reachZ != null && this.jumpZ < 0.05 ? Math.max(0, rootZ - 0.012 * H - f.reachZ) / H : 0;
      const rootZ0 = rootZ;
      if (minRootZ < Infinity && this.jumpZ < 0.05) rootZ = Math.max(Math.min(rootZ, minRootZ + 0.012 * H), rootZ - 0.12 * H);
      // the pelvis goes down at once as far as a planted leg needs, but comes back up on a spring (Tune.floor.pelvisUpHz):
      // let go in one frame when the foot that held it down left the floor, it popped up to 10 in (Trial 3)
      const rz = this._rz || (this._rz = { d: 0, v: 0 });
      const want = rootZ - rootZ0;
      if (!(dtI >= 0) || dtI > 0.12) { rz.d = want; rz.v = 0; }
      else if (dtI > 0) {
        if (want < rz.d) { rz.v = (want - rz.d) / dtI; rz.d = want; }
        else {
          const w = 2 * Math.PI * M.Tune.floor.pelvisUpHz, a = w * w * (want - rz.d) - 2 * w * rz.v;
          rz.v = Math.min(rz.v + a * dtI, M.Tune.floor.pelvisUpFtps); rz.d += rz.v * dtI;
          if (rz.d > want) { rz.d = want; rz.v = Math.min(rz.v, 0); }
        }
      }
      rootZ = rootZ0 + Math.min(rz.d, want);
      // braking and cutting, the hips drop (the knees bend to take the push), below wherever the legs put them and below
      // the level they rode at before the push (Tune.weight.rideS): on the pose alone it hid under the running legs' own
      // settle, and on the legs alone the short quick steps of a brake carried the hips up about as far as it dropped
      // them (Trial 4); eased out going into a move or off the floor, and back in after
      {
        const TW = M.Tune.weight, on = this.clip || this.jumpZ >= 0.05 ? 0 : 1, z0 = rootZ - this.jumpZ;
        const fresh = this._dropW == null || !(dtI >= 0) || dtI > 0.12;
        if (fresh) { this._dropW = on; this._ride = z0; }
        else if (dtI > 0) this._dropW += (on - this._dropW) * (1 - Math.exp(-dtI / 0.08));
        const dk = (this.dropK || 0) * H * this._dropW;
        if (!fresh && dtI > 0 && dk < 0.004 * H) this._ride += (z0 - this._ride) * (1 - Math.exp(-dtI / TW.rideS));
        // (and during a real push it still follows the hips down, never up, over Tune.weight.rideDownS: held from before a
        // defender's slide or a set stance, it stayed at the running height, and a cut out of the crouch let the hips
        // rise 4 to 6 in through it, Trial 4)
        else if (!fresh && dtI > 0 && z0 < this._ride && dk >= TW.rideDownH * H) this._ride += (z0 - this._ride) * (1 - Math.exp(-dtI / TW.rideDownS));
        // (how far the legs carry the hips over that level taken off smoothly, over Tune.weight.rideBlendH, and only as
        // the drop comes in: a hard minimum kinked the hips' path at the top of every stride's bob, and one switched on
        // with the drop jumped; the knees and toes popped with both)
        if (dk > 0) {
          const kb = TW.rideBlendH * H, ex = z0 - this._ride, over = 0.5 * (ex + Math.sqrt(ex * ex + kb * kb));
          rootZ = z0 - dk - over * U.smooth(dk / (TW.rideInH * H)) + this.jumpZ;
        }
        // (how far down that put the hips, for the swinging foot's arc next step, see _locomote)
        if (dtI !== 0) this._hipDrop = Math.max(0, z0 + this.jumpZ - rootZ);
      }
      // the pelvis never goes down faster than Tune.weight.hipDropFtps, whatever takes it there (the legs' reach, a
      // brake's or cut's drop, the pose; a jump's own flight aside): past that a leg left short of its foot has its heel
      // come up, then steps (see _hipGuard, which gets what is left of it). A body run away from a planted foot (a
      // sideways run, a move's step) dropped it 3 to 9 in in a frame, Trial 4
      {
        const cz = this._cz || (this._cz = { prev: null, base: null, lo: -Infinity, cap: Infinity, used: 0 });
        if (cz.prev == null || !(dtI >= 0) || dtI > 0.12) { cz.base = null; cz.lo = -Infinity; cz.cap = Infinity; }
        else if (dtI > 0) { cz.base = cz.prev; cz.cap = M.Tune.weight.hipDropFtps * dtI; cz.lo = cz.base - cz.cap; }
        const zNow = rootZ - this.jumpZ, z1 = Math.max(zNow, cz.lo);
        this._dropCap = zNow < cz.lo - 1e-9;
        cz.used = cz.base != null ? Math.max(0, cz.base - z1) : 0;
        // (kept from the step's own solve only: solved again in the same frame (recording, drawing, dribble fix-ups) it
        // must not change the next step, or the game would depend on the frame rate)
        if (dtI !== 0) cz.prev = z1;
        rootZ = z1 + this.jumpZ;
      }
      p[CH.rootZ] = (rootZ - this.dims.hipH) / H;
      // arms: ball / explicit targets
      this._armTargets(dtI);
      // pose channels that jump between frames (stance and clip switches, dribble arm poses, look-at flips) glide
      this._inTorso.apply(p, dtI);
      this._inSpine.apply(p, dtI);
      // one body: each segment out along the spine and the arms trails and follows through a little
      this._followThrough(p, dtI);
      // the spine bends and twists as a chain, and a hip held in range over a planted foot keeps its pelvis shift
      this._spineChain(p);
      const hg = this._hipShift(p, dtI);
      sk.dt = dtI;
      sk.solve(p, this.x, this.y, this.facing);
      sk.dt = 0;
      // holding the ball up high (dunks, lobs, rebounds, overhead holds) where the grip is out of the arms'
      // reach: the ball goes where the hands can actually hold it instead of floating above them
      const gr = this._grip, vb = this.view && this.view.ball;
      const cr = this._carry || (this._carry = { x: 0, y: 0, z: 0, t: this.time || 0 });
      const cdt = U.clamp((this.time || 0) - cr.t, 0, 0.1); cr.t = this.time || 0;
      if (gr && (gr[0] || gr[1]) && vb && vb.holder === this && vb.state === 'held') {
        // (the hands that hold it: a hand letting go of it, or still coming onto it, reaches from where it was and holds
        // nothing up; counted, a one-handed pass's other hand letting go took the ball off toward where that hand was,
        // ~4 in off a kick pass's push and ~15 in off an outlet's, and the flight then left from the push's own path,
        // Trial 10)
        let ex = 0, ey = 0, ez = 0, n = 0;
        for (let side = 0; side < 2; side++) {
          const ik = sk.armIK[side], q = gr[side] ? Math.min(1, gr[side]) * U.smooth((ik.on - 0.8) / 0.2) : 0;
          if (q <= 0) continue;
          const j = (side ? RG.J.R_WR : RG.J.L_WR) * 3;
          ex += (sk.P[j] - ik.x) * q; ey += (sk.P[j + 1] - ik.y) * q; ez += (sk.P[j + 2] - ik.z) * q; n += q;
        }
        const w = n > 0 ? U.smooth((vb.z - 0.4 * H) / (0.2 * H)) * Math.min(1, n) / n : 0;
        // eased so a grip change or the ball rising past the hips never snaps it
        const k = 1 - Math.exp(-cdt / 0.05);
        cr.x += (ex * w - cr.x) * k; cr.y += (ey * w - cr.y) * k; cr.z += (ez * w - cr.z) * k;
        vb.x += cr.x; vb.y += cr.y; vb.z += cr.z;
      } else { cr.x = cr.y = cr.z = 0; }
      // (dribbling: the palm is put on its spot once the body is final, _handOnBall)
      // a foot in the air never goes through the floor
      this._swingFloor(p, dtI);
      // planted legs never pass the hip's range: the pelvis goes over the foot instead
      this._hipGuard(p, hg);
      // (a foot set by the floor or by its steering is not placed by its ankle channel: the pose is told the real bend)
      this._footAnkles();
      // legs leaving the floor (take-off): the IK pose eases into the clip's air pose instead of switching in one frame
      sk.limitSwivel(dtI);
      sk.inertLegs(dtI, this.feet[0].state === 'air' || this.fall > 0.5, this.feet[1].state === 'air' || this.fall > 0.5);
      this._airFloor();
      this._ankleRange(dtI);
      this._handOnBall();
      this._gripOnBall(dtI);
      this._cacheBody();
      this._ballOffLegs();
      // the dribble's frame: a share of the chest's turn from the hips' (Tune.handle.trunkYawK; see localD); the chest's
      // own turn for a ball held in front of it (_holdLocal)
      { const R = sk.R, ch = Math.atan2(R[22], R[19]); this.chestYaw = U.wrapPi(ch - this.facing); this.dribbleYaw = M.Tune.handle.trunkYawK * this.chestYaw; }
    }
    /** the dribbling hand on its spot (Trial 8): every frame of the dribble the palm is where the ball's plan puts it
     *  (on the ball through the push and the ride, on its path between), whatever moved the body after the arm was
     *  solved (the hips held over a planted foot, the spine's chain, the arm's own ranges); so is the other hand's while
     *  it reaches for the catch of a move from hand to hand. A hand coming into the dribble from a grip slides over the
     *  ball onto its spot (Tune.handle) */
    _handOnBall() {
      const d = this.dribble, vb = this.view && this.view.ball, sk = this.sk;
      const hw = this._hw || (this._hw = [null, null]);
      this.palmMiss = null;
      if (!d || !d.palm || d.wx == null || !vb || vb.state !== 'dribble' || !vb.dr || vb.dr.actor !== this) { hw[0] = hw[1] = null; this._slide = null; return; }
      const side = d.hand ? 1 : 0, rv = d.aux, rs = rv && rv.act > 0.001 && (rv.hand ? 1 : 0) !== side ? (rv.hand ? 1 : 0) : -1;
      if (rs < 0) hw[1 - side] = null;
      // (the other hand on a move, reaching for the catch or letting go: not on the ball)
      if (rs >= 0 && sk.armIK[rs].on > 0.01) this._palmTo(rs, rv.x, rv.y, rv.z, false);
      if (!(sk.armIK[side].on > 0.01)) { hw[side] = null; this._slide = null; return; }
      const TH = M.Tune.handle, c = Math.cos(this.facing), s = Math.sin(this.facing);
      // the spot: the plan's, or, while the ball is carried out of a grip to where the push starts, part way there over the
      // ball from where the hand held it (the direction and the distance from the ball's centre eased with the carry: the
      // hand rolls over the top as it brings the ball down from the chest)
      let tx = d.wx, ty = d.wy, tz = d.wz;
      const sl = this._slide;
      if (sl && (sl.side !== side || d.carry == null)) this._slide = null;
      else if (sl) {
        // (the distance eases in the carry's first part: a hold not yet settled on the ball does not stay off it)
        const e = U.smooth(d.carry), er = U.smooth(Math.min(1, d.carry / TH.slideRadK));
        const rx = d.wx - vb.x, ry = d.wy - vb.y, rz = d.wz - vb.z;
        const b0 = sl.h, b1x = rx * s - ry * c, b1y = rx * c + ry * s, b1z = rz;
        let ix = b0[0] + (b1x - b0[0]) * e, iy = b0[1] + (b1y - b0[1]) * e, iz = b0[2] + (b1z - b0[2]) * e;
        const il = Math.hypot(ix, iy, iz), want = Math.hypot(b0[0], b0[1], b0[2]) * (1 - er) + Math.hypot(b1x, b1y, b1z) * er;
        if (il > 1e-4) { ix *= want / il; iy *= want / il; iz *= want / il; }
        tx = vb.x + s * ix + c * iy; ty = vb.y - c * ix + s * iy; tz = vb.z + iz;
      }
      this.palmMiss = this._palmTo(side, tx, ty, tz, d.ph === 'push' || d.ph === 'ride');
      // (the palm facing the ball with the wrist bent back can bring the forearm down into it, the ball carried out of the
      // hands at the chest above all: the wrist flexed on until the forearm clears it, _forearmClear)
      if (d.face) this._forearmClear(side, tx, ty, tz, vb, d.ph === 'push' || d.ph === 'ride');
    }
    /** the dribbling forearm off the ball (a gameplay pass: the palm facing the ball, _faceBall, with the wrist bent back
     *  brought the forearm ~0.5 in into it as the ball came down from the chest): from the arm as solved, the wrist flexed
     *  on in steps until the forearm is Tune.handle.faceClearIn clear of the ball (a capsule of Tune.debug.bodyR.forearm),
     *  the palm put back on its spot each time; the flexion kept for the next frames (this._lift, eased off in _armTargets
     *  over Tune.handle.faceLiftS) so it is there before the solve */
    _forearmClear(side, tx, ty, tz, vb, onB) {
      const TH = M.Tune.handle, P = this.sk.P, p = this.sk.pose, iW = CH[(side ? 'r' : 'l') + 'WrF'];
      const e = (side ? RG.J.R_EL : RG.J.L_EL) * 3, w = (side ? RG.J.R_WR : RG.J.L_WR) * 3;
      const need = M.Ball.R + M.Tune.debug.bodyR.forearm * this.H + TH.faceClearIn / 12;
      const clear = () => {
        const ax = P[e], ay = P[e + 1], az = P[e + 2], bx = P[w] - ax, by = P[w + 1] - ay, bz = P[w + 2] - az, l2 = bx * bx + by * by + bz * bz;
        const t = l2 > 1e-9 ? U.clamp(((vb.x - ax) * bx + (vb.y - ay) * by + (vb.z - az) * bz) / l2, 0, 1) : 0;
        return Math.hypot(vb.x - ax - bx * t, vb.y - ay - by * t, vb.z - az - bz * t);
      };
      if (clear() >= need) return;
      const w0 = p[iW], lift = this._lift || (this._lift = [0, 0]);
      let best = 0, bestD = -1;
      for (const dg of TH.faceClearStepsDeg) {
        p[iW] = w0 + dg * D;
        this._palmTo(side, tx, ty, tz, onB);
        const dd = clear();
        if (dd > bestD) { bestD = dd; best = dg; }
        if (dd >= need) break;
      }
      if (p[iW] !== w0 + best * D) { p[iW] = w0 + best * D; this.palmMiss = this._palmTo(side, tx, ty, tz, onB); }
      else this.palmMiss = this._palmTo(side, tx, ty, tz, onB);
      lift[side] = Math.min(TH.faceLiftMaxDeg, lift[side] + best);
    }
    /** one arm's palm onto a spot (Trial 8): the arm's IK target is the wrist and the palm is most of a hand's length on,
     *  turned with the forearm, so the wrist is solved for: damped Newton steps on that arm alone (its 3x3 Jacobian by
     *  finite differences; moving the wrist by the palm's miss, as it used to, ran away where the forearm turns fast, the
     *  ball up at the chest), warm-started from the last frame's wrist-to-palm offset (_armTargets). onB: the spot is on
     *  the ball. Returns the palm's miss (ft) */
    _palmTo(side, tx, ty, tz, onB) {
      const sk = this.sk, ik = sk.armIK[side], vb = this.view.ball, hw = this._hw;
      const TH = M.Tune.handle, P = sk.P, j = (side ? RG.J.R_HD : RG.J.L_HD) * 3, pre = side ? 'r' : 'l', p = sk.pose;
      const c = Math.cos(this.facing), s = Math.sin(this.facing);
      // (an arm only partly on the IK, a hand letting go or taking over on a move, is solved for where its wrist would go
      // with all of it, then given its own weight: moving the wrist by the palm's miss ran away, the hand barely following)
      const w0 = ik.on;
      const dt0 = sk.dt, lh = sk.limHits, tol2 = TH.solveTolFt * TH.solveTolFt;
      ik.on = 1;
      const iF = CH[pre + 'ShF'], iA = CH[pre + 'ShA'], iT = CH[pre + 'ShT'], iE = CH[pre + 'ElF'];
      // on the ball (the push and the ride), being on its surface comes first: the miss along the spot's radius counts
      // fully and across the surface only in part, so where the spot itself is out of the arm's reach the palm still
      // lands on the ball, as near the spot as the arm goes, instead of short of it or in it
      let nx = tx - vb.x, ny = ty - vb.y, nz = tz - vb.z;
      { const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl; }
      const wt = onB ? TH.tanW : 1, wr = 1 - wt;
      // (the weighted miss: wt e + (1 - wt) (n.e) n)
      const wmiss = (o, ex, ey, ez) => { const k = wr * (nx * ex + ny * ey + nz * ez); o[0] = wt * ex + k * nx; o[1] = wt * ey + k * ny; o[2] = wt * ez + k * nz; return o[0] * o[0] + o[1] * o[1] + o[2] * o[2]; };
      const WE = WEV;
      // (every solve below starts from the same arm state, the angles and the choice between the shoulder's two equivalent
      // solutions as the body's solve left them: the arm's solve reads its last angles, for the shoulder blade's slide,
      // so the palm's response is otherwise not a function of the wrist target alone)
      const F0 = p[iF], A0 = p[iA], T0 = p[iT], E0 = p[iE], hf0 = ik.hf, hb0 = ik.hb;
      const armAt = () => { p[iF] = F0; p[iA] = A0; p[iT] = T0; p[iE] = E0; ik.hf = hf0; ik.hb = hb0; sk._arm(side); };
      // (the wrist target kept inside the arm's reach from the shoulder: past it the arm is straight whatever the target
      // does, no step can tell which way to go, and a target left out there held a palm that could reach its spot with
      // the elbow bent inches off it, the ball pushed out ahead running)
      // (with soft IK the target goes on past the reach while the wrist comes on ever slower: capped where the arm is all
      // but straight, three softening lengths out)
      const so = (side ? RG.J.R_SH : RG.J.L_SH) * 3, reach = (sk.dims.ua + sk.dims.fa) * (ik.soft > 0 ? 0.9995 + 2 * ik.soft : 0.999);
      const inReach = () => {
        const rx = ik.x - P[so], ry = ik.y - P[so + 1], rz = ik.z - P[so + 2], rl = Math.hypot(rx, ry, rz);
        if (rl > reach) { const k = reach / rl; ik.x = P[so] + rx * k; ik.y = P[so + 1] + ry * k; ik.z = P[so + 2] + rz * k; }
      };
      sk.dt = 0;
      inReach(); armAt();
      for (let it = 0; it < TH.solveIters; it++) {
        const ex0 = tx - P[j], ey0 = ty - P[j + 1], ez0 = tz - P[j + 2];
        if (ex0 * ex0 + ey0 * ey0 + ez0 * ez0 < tol2) break;
        const e2 = wmiss(WE, ex0, ey0, ez0), ex = WE[0], ey = WE[1], ez = WE[2];
        // the palm's response to the wrist target, one axis at a time (the range meter left alone)
        const h0x = P[j], h0y = P[j + 1], h0z = P[j + 2];
        const eps = TH.jacFt, Jm = JAC;
        sk.limHits = null;
        for (let k = 0; k < 3; k++) {
          if (k === 0) ik.x += eps; else if (k === 1) ik.y += eps; else ik.z += eps;
          armAt();
          // (the weighted response)
          wmiss(WE, (P[j] - h0x) / eps, (P[j + 1] - h0y) / eps, (P[j + 2] - h0z) / eps);
          Jm[k] = WE[0]; Jm[3 + k] = WE[1]; Jm[6 + k] = WE[2];
          if (k === 0) ik.x -= eps; else if (k === 1) ik.y -= eps; else ik.z -= eps;
        }
        sk.limHits = lh;
        // damped least squares: dx = J^T (J J^T + l^2 I)^-1 e (a direction the palm cannot go, the arm at full reach or
        // a joint at its range, gets a small step instead of a huge one)
        const l2 = TH.dampFt * TH.dampFt;
        const a00 = Jm[0] * Jm[0] + Jm[1] * Jm[1] + Jm[2] * Jm[2] + l2, a01 = Jm[0] * Jm[3] + Jm[1] * Jm[4] + Jm[2] * Jm[5], a02 = Jm[0] * Jm[6] + Jm[1] * Jm[7] + Jm[2] * Jm[8];
        const a11 = Jm[3] * Jm[3] + Jm[4] * Jm[4] + Jm[5] * Jm[5] + l2, a12 = Jm[3] * Jm[6] + Jm[4] * Jm[7] + Jm[5] * Jm[8], a22 = Jm[6] * Jm[6] + Jm[7] * Jm[7] + Jm[8] * Jm[8] + l2;
        const c00 = a11 * a22 - a12 * a12, c01 = a02 * a12 - a01 * a22, c02 = a01 * a12 - a02 * a11;
        const det = a00 * c00 + a01 * c01 + a02 * c02;
        let dx = ex, dy = ey, dz = ez;
        if (Math.abs(det) > 1e-12) {
          const c11 = a00 * a22 - a02 * a02, c12 = a01 * a02 - a00 * a12, c22 = a00 * a11 - a01 * a01;
          const yx = (c00 * ex + c01 * ey + c02 * ez) / det, yy = (c01 * ex + c11 * ey + c12 * ez) / det, yz = (c02 * ex + c12 * ey + c22 * ez) / det;
          dx = Jm[0] * yx + Jm[3] * yy + Jm[6] * yz; dy = Jm[1] * yx + Jm[4] * yy + Jm[7] * yz; dz = Jm[2] * yx + Jm[5] * yy + Jm[8] * yz;
        }
        const dl = Math.hypot(dx, dy, dz);
        if (dl > TH.stepMaxFt) { const k = TH.stepMaxFt / dl; dx *= k; dy *= k; dz *= k; }
        // (a step that makes it worse is halved, and then not taken: the arm is never moved further off, nor onto the
        // other branch of a joint's range)
        let ok = false;
        const bx0 = ik.x, by0 = ik.y, bz0 = ik.z;
        for (let h = 1; h >= 0.5 && !ok; h -= 0.5) {
          ik.x = bx0 + dx * h; ik.y = by0 + dy * h; ik.z = bz0 + dz * h; inReach(); armAt();
          if (wmiss(WE, tx - P[j], ty - P[j + 1], tz - P[j + 2]) < e2) ok = true;
          else { ik.x = bx0; ik.y = by0; ik.z = bz0; }
        }
        if (!ok) { armAt(); break; }
      }
      if (w0 < 0.999) { ik.on = w0; armAt(); }
      sk.dt = dt0;
      // the wrist's offset from the spot, body frame, for the next frame's first guess
      const ox = ik.x - tx, oy = ik.y - ty;
      const w = hw[side] || (hw[side] = new Float64Array(4));
      w[0] = ox * s - oy * c; w[1] = ox * c + oy * s; w[2] = ik.z - tz; w[3] = this.time || 0;
      return Math.hypot(tx - P[j], ty - P[j + 1], tz - P[j + 2]);
    }
    /** the fingers on a ball held (Trial 8: in a plain hold at the chest they were ~4 in inside it, in the triple threat
     *  ~2 in off it, at a catch 1-2 in inside, and the first dribble started from there): a plain hold, or a clip holding
     *  it without throwing it (a catch, a pick-up, a jab). The grip is where the wrist goes; after each step's solve, the
     *  wrist flexion nearest the hold's that puts the palm on the ball's surface is found (the gap along the wrist's
     *  range, its root nearest the pose), and the flexion added to the pose (_armTargets) goes after it on a critically
     *  damped spring (Tune.handle.gripHz), back to none when it lets go: the hands wrap the ball instead of sinking into
     *  it, and nothing jumps (dt 0, a same-frame solve, changes nothing) */
    _gripOnBall(dt) {
      const wf = this._wrFix;
      if (!wf || !(dt > 0) || dt > 0.12) return;
      const sk = this.sk, P = sk.P, p = sk.pose, vb = this.view && this.view.ball, TH = M.Tune.handle;
      // (through a pass's own quick wrist motion the bend follows faster: Tune.handle.gripPassHz)
      const pc = this.upper && this.upper.clip.ballKeys && /^pass/.test(this.upper.clip.name);
      const pr = BALL_R + M.Tune.debug.palmOffsetH * this.H, w = 2 * Math.PI * (pc ? TH.gripPassHz : TH.gripHz);
      for (let side = 0; side < 2; side++) {
        const f = wf[side];
        let goal = 0;
        // (the ball in the hands, or the ball coming to where the hands wait for it, Trial 10)
        // (from the moment the hands come up as a target: fitted only once they were all the way out, the wrists bent ~45 deg
        // over the last 0.3 s and the hands tipped down as the ball came)
        const rq = this._rcW > 0.001 && !this.hasBall && this._rcQ ? this._rcQ : null;
        const held = vb && vb.holder === this && vb.state === 'held' && this._grip[side] >= 0.999;
        if (f[2] && (held || rq) && sk.armIK[side].on >= (rq ? Math.min(0.999, this._rcW) - 1e-3 : 0.999)) {
          const bx = rq ? rq[0] : vb.x, by = rq ? rq[1] : vb.y, bz = rq ? rq[2] : vb.z;
          const pre = side ? 'r' : 'l', iW = CH[pre + 'WrF'], j = (side ? RG.J.R_HD : RG.J.L_HD) * 3, lim = RG.LIM[pre + 'WrF'];
          const th0 = p[iW];
          const gapAt = (th) => { p[iW] = th; sk._armFK(side); return Math.hypot(P[j] - bx, P[j + 1] - by, P[j + 2] - bz) - pr; };
          let best = th0, g0 = gapAt(th0), bestG = Math.abs(g0);
          // (a fit going on keeps to its own root, the one nearest where the wrist is; a new one takes the root nearest a
          // hold's wrist bent back, Tune.handle.gripRefDeg, and so does one whose other root is about as near (the palm just
          // come onto the ball: the two roots are born at one flexion and part either way). Taken nearest the pose, the hands
          // coming up for a pass took the one bent forward and followed it on round the ball into a claw ~70 deg forward,
          // the fingers curled back round its far side, until it ran out and the hand jumped to the other, Trial 10)
          const REF = TH.gripRefDeg * U.DEG, near = f.act ? th0 : REF, split = TH.gripSplitDeg * U.DEG;
          if (bestG > TH.solveTolFt) {
            // (the range in steps: the sign changes, each halved down; none, the nearest miss)
            const n = Math.max(2, Math.ceil((lim[1] - lim[0]) / (TH.gripStepDeg * U.DEG)));
            let ta = lim[0], ga = gapAt(ta), root = null, alt = null;
            for (let k = 1; k <= n; k++) {
              const tb = lim[0] + (lim[1] - lim[0]) * k / n, gb = gapAt(tb);
              if (Math.abs(gb) < bestG) { bestG = Math.abs(gb); best = tb; }
              if (ga * gb <= 0) {
                let lo = ta, hi = tb, glo = ga;
                for (let it = 0; it < 10; it++) { const m = 0.5 * (lo + hi), gm = gapAt(m); if (glo * gm <= 0) hi = m; else { lo = m; glo = gm; } }
                const r = 0.5 * (lo + hi);
                if (root == null || Math.abs(r - near) < Math.abs(root - near)) { alt = root; root = r; } else if (alt == null || Math.abs(r - near) < Math.abs(alt - near)) alt = r;
              }
              ta = tb; ga = gb;
            }
            if (root != null && alt != null && f.act && Math.abs(alt - th0) < Math.abs(root - th0) + split && Math.abs(alt - REF) < Math.abs(root - REF)) root = alt;
            // (and a hold never stays with one bent round the ball's far side while the one bent back is there,
            // Tune.handle.gripBandDeg; the hands waiting for a pass keep theirs)
            if (!rq && root != null && alt != null && Math.abs(root - REF) > TH.gripBandDeg * U.DEG && Math.abs(alt - REF) < Math.abs(root - REF)) root = alt;
            if (root != null) best = root;
            // (a fit on a root; the nearest miss, the palm short of the ball, is none: the hands coming up to a target short
            // of where the ball will be have none to keep to)
            f.act = root != null;
          } else f.act = true;
          gapAt(th0);
          goal = f[0] + (best - th0);
          f.c0 = null;
        } else if (this.dribble && this.dribble.carry != null && (this.dribble.hand ? 1 : 0) === side) {
          // (the hand that dribbles, carrying the ball out of the hold: its bend goes early in the carry, Tune.handle.carryWristK;
          // let go of at the spring's pace, the wrist still bent back as the palm rolled over the ball, the forearm dipped
          // into it, Trial 8)
          if (f.c0 == null) f.c0 = f[0];
          goal = f.c0 * (1 - U.smooth(Math.min(1, this.dribble.carry / M.Tune.handle.carryWristK)));
          f.act = false;
        } else { f.c0 = null; f.act = false; }
        // (a critically damped spring, stepped exactly; f[1] its speed. Stepped as f' += a dt it blew up past ~9.5 Hz at
        // 60 steps a second)
        { const e0 = f[0] - goal, j = f[1] + w * e0, ex = Math.exp(-w * dt); f[0] = goal + (e0 + j * dt) * ex; f[1] = (f[1] - w * j * dt) * ex; }
        if (!goal && Math.abs(f[0]) < 1e-5 && Math.abs(f[1]) < 1e-4) f[0] = f[1] = 0;
        f[2] = 0;
      }
    }
    /** the spine as a chain (Tune.spine): however the layers asked for a bend or twist of the trunk, the lumbar (sp) and
     *  thoracic (ch) joints share it the way a spine does (a twist mostly thoracic, a forward bend a little more
     *  lumbar), part way from the authored split; a joint at the end of its own range hands the rest to the other */
    _spineChain(p) {
      const T = M.Tune.spine, L = RG.LIM, sh = T.lumbarShare, bl = T.blend, sz = M.Tune.limits.softDeg * D;
      for (let ax = 0; ax < 3; ax++) {
        const k1 = SPINE_AX[ax][0], k2 = SPINE_AX[ax][1], i1 = CH[k1], i2 = CH[k2];
        const a = p[i1], tot = a + p[i2];
        const w = ax === 0 ? (tot >= 0 ? sh.flex : sh.ext) : ax === 1 ? sh.lat : sh.twist, k = ax === 0 ? bl.flex : ax === 1 ? bl.lat : bl.twist;
        // (the lumbar joint eases into the end of its own range and the thoracic one takes the rest: smooth, so a
        // growing twist never has one joint stop dead while the other speeds up)
        const r1 = L[k1], lo = RG.softClamp(a + (tot * w - a) * k, r1[0], r1[1], sz);
        p[i1] = lo; p[i2] = tot - lo;
      }
    }
    /** the hip guard's pelvis shift from earlier frames (body frame: rootX right, rootY forward, rootZ in heights),
     *  easing away with Tune.hipGuard.releaseS, added to the pose */
    _hipShift(p, dt) {
      const G = M.Tune.hipGuard, hg = this._hg || (this._hg = { x: 0, y: 0, z: 0, n: 0 });
      // (where it held the pelvis down to last frame: it goes no lower this frame than the legs' reach left room for,
      // Tune.weight.hipDropFtps)
      // (and across, no faster than Tune.hipGuard.shiftFtps: see _hipGuard)
      if (!(dt >= 0) || dt > 0.12) { hg.x = hg.y = hg.z = 0; hg.zPrev = null; hg.xPrev = null; hg.yPrev = null; }
      else if (dt > 0) { hg.zPrev = hg.z; hg.xPrev = hg.x; hg.yPrev = hg.y; hg.capXY = G.shiftFtps * dt; const k = Math.exp(-Math.LN2 * dt / G.releaseS); hg.x *= k; hg.y *= k; hg.z *= k; }
      if (Math.abs(hg.x) + Math.abs(hg.y) + Math.abs(hg.z) < 1e-5) { hg.x = hg.y = hg.z = 0; }
      p[CH.rootX] += hg.x; p[CH.rootY] += hg.y; p[CH.rootZ] += hg.z;
      return hg;
    }
    /**
     * Planted legs stay inside the hip's range (Tune.hipGuard). A body that has moved on over a foot that stays put
     * (the other foot still in the air, so this one cannot step yet) would stretch the hip past what it can do; the
     * pelvis goes toward that foot instead, the weight over it, just enough to stay in range, and lowers if a planted
     * leg could no longer reach its foot. The feet never move. The shift eases away once it is not needed.
     */
    _hipGuard(p, hg) {
      // (p: the pose asked for, where the shift goes; the solved leg angles are in the skeleton's own pose)
      const G = M.Tune.hipGuard, sk = this.sk, q = sk.pose, L = RG.LIM, P = sk.P, H = this.H, m = G.marginDeg * D;
      const AL = M.Tune.limits.ankleLoaded, aLo = AL[0] * D + m, aHi = AL[1] * D - m;
      hg.ank = 0;
      // (the leg's full reach, as the IK allows it; not while a jump lifts the body off planted feet at take-off)
      const c = Math.cos(this.facing), s = Math.sin(this.facing), Lmax = (this.dims.th + this.dims.sh) * 0.9995, reach = this.jumpZ < 0.05;
      hg.n = 0;
      const need = [false, false], drop = [false, false], cz = this._cz;
      let capHit = false;
      const zLo = Math.max(-G.maxDropH, (hg.zPrev != null ? hg.zPrev : hg.z) - (cz && cz.cap !== Infinity ? Math.max(0, cz.cap - cz.used) : Infinity) / H);
      for (let it = 0; it < G.iterations; it++) {
        let wx = 0, wy = 0, dz = 0, any = false, ank = 0;
        for (let side = 0; side < 2; side++) {
          const ik = sk.legIK[side];
          if (ik.on < 0.999 || ik.soft) continue;
          const pre = side ? 'r' : 'l', o = (side ? RG.J.R_HIP : RG.J.L_HIP) * 3;
          // the planted ankle inside its weight-bearing range: the heel comes up about the ball of the foot, which stays
          // on its spot, or the toes come up off the floor about the heel
          const f = this.feet[side], an = this._ankleBend(side);
          if (f && f.state === 'plant' && (an > aHi || an < aLo)) {
            // (a heel down with the shank leaning far back over it lifts the toes: the foot rocks on its heel)
            // (a little over the excess: the leg's answer to a higher heel gives some of it back)
            const pit = U.clamp(ik.pitch + 1.3 * (an > aHi ? an - aHi : an - aLo), -30 * D, 75 * D);
            if (Math.abs(pit - ik.pitch) > 1e-4) {
              // (a foot that turned this step as a pivot and now has its heel brought down does not turn this step)
              if (f.pvTurned === this.time && pit < M.Tune.floor.pivot.turnAtDeg * D && f.pvPrevYaw != null) { f.yaw = f.pvPrevYaw; ik.yaw = f.yaw; f.pvTurned = null; }
              const t = this._ankleFromBall(f.x, f.y, f.yaw, pit, TA);
              ik.x = t[0]; ik.y = t[1]; ik.z = t[2] + (f.land ? f.lz || 0 : 0); ik.pitch = pit; f.pitchUsed = pit;
              if (an > aHi) f.heelFloor = Math.max(f.heelFloor || 0, pit);
              hg.ank++; any = true; ank |= 1 << side;
            }
          }
          let ex = 0;
          for (const kk of HG_KEYS) {
            const r = L[pre + kk], v = q[CH[pre + kk]];
            if (v > r[1] - m) ex = Math.max(ex, v - (r[1] - m)); else if (v < r[0] + m) ex = Math.max(ex, r[0] + m - v);
          }
          const hx = ik.x - P[o], hy = ik.y - P[o + 1], hz = P[o + 2] - ik.z, dh = Math.hypot(hx, hy);
          // (it holds the hip the margin inside its limit: acting every frame it is needed, the pelvis moves smoothly)
          if (ex > 1e-3 && dh > 1e-4) { const mag = ex * Math.max(0.5, hz) * G.gain; wx += hx / dh * mag; wy += hy / dh * mag; any = true; need[side] = true; }
          // a planted leg that cannot reach its foot (the pelvis's sway, roll and twist, or a shift above, carried the
          // hip off it; Trial 3: planted feet floated ~0.5 in in 0.13% of frames): the heel comes up over the ball of
          // the foot to lengthen the leg, then the pelvis comes down for the rest
          const dist = Math.hypot(dh, hz);
          if (reach && dist > Lmax && dh < Lmax) {
            // (the heel only rises for a foot under or behind the hip, and never past the ankle's range: for a foot out
            // in front the ankle would only move further away, and the ankle would bend past its range)
            const fwdF = (ik.x - P[o]) * c + (ik.y - P[o + 1]) * s;
            if (f && f.state === 'plant' && ik.pitch >= 0 && ik.pitch < G.reachHeelDeg * D && fwdF < 0.05 * H && an - (G.reachHeelDeg * D - ik.pitch) > aLo) {
              const pit = Math.min(G.reachHeelDeg * D, ik.pitch + 1.2 * (dist - Lmax) / (this.dims.ball * Math.cos(ik.pitch)));
              const t = this._ankleFromBall(f.x, f.y, f.yaw, pit, TA);
              ik.x = t[0]; ik.y = t[1]; ik.z = t[2] + (f.land ? f.lz || 0 : 0); ik.pitch = pit; f.pitchUsed = pit;
              f.heelFloor = Math.max(f.heelFloor || 0, pit);
              any = true; ank |= 1 << side;
            } else { dz = Math.max(dz, hz - Math.sqrt(Lmax * Lmax - dh * dh)); any = true; drop[side] = true; }
          }
        }
        if (!any) break;
        // (world to body frame)
        let bx = wx * s - wy * c, by = wx * c + wy * s;
        const lim = G.maxShiftH * H, nx = hg.x + bx, ny = hg.y + by, nl = Math.hypot(nx, ny);
        if (nl > lim) { bx = nx * lim / nl - hg.x; by = ny * lim / nl - hg.y; }
        // (no faster than Tune.hipGuard.shiftFtps from where it held the pelvis last frame: a defender opening his
        // hips at ~500 deg/s over a planted foot had it thrown ~6 in in one frame, every joint above popping, Trial 5;
        // past that the planted hip goes to the end of its range and the foot steps, see the last resort below)
        if (hg.xPrev != null && hg.capXY != null) {
          const cx = hg.x + bx - hg.xPrev, cy = hg.y + by - hg.yPrev, cl = Math.hypot(cx, cy);
          if (cl > hg.capXY) { const kc = hg.capXY / cl; bx = hg.xPrev + cx * kc - hg.x; by = hg.yPrev + cy * kc - hg.y; }
        }
        // (the pelvis goes down only so far for a foot out of reach, and only so fast: past that the foot steps, see the
        // strain and the last resort below)
        const bz = Math.max(-dz / H, Math.min(0, zLo - hg.z));
        if (-dz / H < zLo - hg.z - 1e-9 && zLo > -G.maxDropH + 1e-9) capHit = true;
        const moved = Math.abs(bx) + Math.abs(by) + Math.abs(bz) >= 1e-5;
        if (!moved && !ank) break;
        // (the pelvis moved: the whole body is solved again; only a heel moved: just that leg)
        if (moved) { hg.x += bx; hg.y += by; hg.z += bz; hg.n++; p[CH.rootX] += bx; p[CH.rootY] += by; p[CH.rootZ] += bz; sk.solve(p, this.x, this.y, this.facing); }
        else for (let side = 0; side < 2; side++) if (ank & (1 << side)) sk._leg(side);
      }
      // (how far the pelvis is held back over each planted foot: a foot the body has run away from steps, see _locomote)
      // (and how far a planted foot pulls the pelvis down to reach it: the body has run away from it, and it steps too)
      const sh = Math.hypot(hg.x, hg.y) / H;
      for (let side = 0; side < 2; side++) {
        const f = this.feet[side];
        f.strain = Math.max(need[side] ? sh : 0, ((f.reachDrop || 0) + (drop[side] ? Math.max(0, -hg.z) : 0)) * G.dropStrain);
      }
      // last resort (the pelvis held back as far as it goes, and the hip still past its range): the foot steps now,
      // leaving the floor from where it is, even with the other foot in the air (a quick skip), and the leg, off the
      // floor this frame, is held to the hip's range (Trial 3: dragged along the floor instead, it slid up to 2-3 ft)
      hg.slip = 0;
      const past = (pre) => HG_KEYS.some(kk => { const r = L[pre + kk], v = q[CH[pre + kk]]; return v > r[1] || v < r[0]; });
      for (let side = 0; side < 2; side++) {
        const ik = sk.legIK[side], f = this.feet[side];
        if (ik.on < 0.999 || ik.soft || f.state !== 'plant') continue;
        const pre = side ? 'r' : 'l', an = (side ? RG.J.R_AN : RG.J.L_AN) * 3;
        // (or the leg cannot hold its ankle where the foot is: out of reach with the pelvis down as far as it goes, or the
        // hip's twist at its end; Trial 3: the foot hung off its spot or went through the floor)
        // (a leg left short because the pelvis may go down only so fast steps at a smaller miss, before the foot slides:
        // Tune.weight.hipDropMissFt)
        const miss = this._dropCap || capHit ? Math.min(G.missFt, M.Tune.weight.hipDropMissFt) : G.missFt;
        if (!past(pre) && !(reach && Math.hypot(P[an] - ik.x, P[an + 1] - ik.y, P[an + 2] - ik.z) > miss)) continue;
        // (aimed where the body will face as it lands, and kept on it in the air as the stride's own recovery steps are,
        // f.trk: aimed where it faced as it left, turning at ~200 deg/s, the foot came down 50-80 deg pigeon-toed, the hip
        // at once past its range, and it stepped again 0-2 frames after landing, a step with no stance; Trial 8)
        const sgn = side ? 1 : -1, w = 0.1 * H, fe = this.faceIn(0.16), ce = Math.cos(fe), se = Math.sin(fe);
        this._sepTarget(f, this.x + this.vx * 0.15 + se * sgn * w + ce * this.dims.ball, this.y + this.vy * 0.15 - ce * sgn * w + se * this.dims.ball, TD);
        this._beginStep(f, TD[0], TD[1], fe - sgn * 7 * D, 0.16, 0.04);
        f.trk = { reach: 0, lat: sgn * w };
        ik.soft = true; ik.softK = 0; ik.softW = 0.02;
        sk._leg(side);
        // (the step goes on from where the held leg put the foot)
        f.x0 = P[an]; f.y0 = P[an + 1]; f.z0 = P[an + 2];
        hg.slip++;
      }
      // (a foot that has just left the floor this way is kept out of it too, and so is a swinging foot the pelvis moved:
      // lowered over a planted leg, it took the other foot, just clear of the floor, into it; Trial 3)
      if (hg.slip || hg.n) this._swingFloor(p, 0);
    }
    /** a foot in the air never goes through the floor: hanging from its ankle (toes down as the swing starts, or held
     *  in the ankle's range against the shank), its lowest point (heel, ball or toe) below the floor lifts the ankle
     *  target by that much, and the leg is solved again */
    _swingFloor(p, dt) {
      // (a correction kept from frame to frame and eased away when not needed, so the foot's path stays smooth: worked
      // out afresh each frame, the lift and pull jumped about and popped the toes and knees, Trial 3)
      const sk = this.sk, P = sk.P, J = RG.J, Lr = (this.dims.th + this.dims.sh) * 0.97;
      for (let side = 0; side < 2; side++) {
        const ik = sk.legIK[side], f = this.feet[side];
        const fc = f.fc || (f.fc = { x: 0, y: 0, z: 0 });
        if (ik.on < 0.999 || !ik.soft) { fc.x = fc.y = fc.z = 0; fc.bx = null; continue; }
        if (!(dt >= 0) || dt > 0.12) { fc.x = fc.y = fc.z = 0; fc.bx = null; }
        else if (dt > 0) {
          const k = Math.exp(-Math.LN2 * dt / M.Tune.floor.swingFixReleaseS); fc.x *= k; fc.y *= k; fc.z *= k;
          // (the pull toward the hip grows no faster than Tune.floor.swingPullFtps from where it was: a quick step in a
          // fast slide, out of reach as it came down, was pulled ~0.5 ft in one frame and the ankle jumped a foot,
          // Trial 5; the lift out of the floor stays immediate)
          fc.bx = fc.x; fc.by = fc.y; fc.cap = M.Tune.floor.swingPullFtps * dt;
        }
        const tx = ik.x, ty = ik.y, tz = ik.z;
        if (fc.x || fc.y || fc.z) { ik.x = tx + fc.x; ik.y = ty + fc.y; ik.z = tz + fc.z; sk._leg(side); }
        const an = (side ? J.R_AN : J.L_AN) * 3, h = (side ? J.R_HIP : J.L_HIP) * 3;
        const lowZ = () => Math.min(P[(side ? J.R_HEEL : J.L_HEEL) * 3 + 2], P[(side ? J.R_BALL : J.L_BALL) * 3 + 2], P[(side ? J.R_TOE : J.L_TOE) * 3 + 2]);
        // (and clear of it by Tune.floor.swingMinClearFt at mid-swing, sin^2 over the swing so nothing jumps at the lift or
        // the landing: a small slow step, its toes hanging down from a low ankle, cleared the floor by 0.2 to 0.7 in and
        // read as a foot dragged; people clear it by ~1.3 cm at the lowest point of a swing and far more early in it)
        const prog = f.state === 'swing' ? (f.mode === 'step' ? f.s : f.sw) : null;
        const clr = prog != null && prog > 0 && prog < 1 ? M.Tune.floor.swingMinClearFt * Math.pow(Math.sin(Math.PI * prog), 2) : 0;
        // (the pull's rate cap gives way when it would leave the foot in the floor: the hips going down fast into a
        // box-out over a leg reaching nearly straight for its landing left a foot ~1 in through it for a frame, Trial 5)
        for (let pass = 0; pass < 2; pass++) {
          if (pass === 1) { if (!(lowZ() < -0.004)) break; fc.bx = null; }
          for (let it = 0; it < M.Tune.floor.swingFixIters; it++) {
            const z = lowZ() - clr;
            if (z >= -0.002) break;
            // lift by the depth (a little over: an ankle at the end of its range tips the toes down as the knee folds to
            // lift it, and gives some of the lift back); and where the leg could not put the ankle where it was asked (out
            // of reach, or the hip at the end of its range with the foot far behind at toe-off), bring the spot in toward
            // the hip by the miss, the way a knee folding lifts the foot
            const miss = Math.hypot(P[an] - ik.x, P[an + 1] - ik.y, P[an + 2] - ik.z);
            fc.z += (0.004 - z) * M.Tune.floor.swingFixGain;
            const dx = ik.x - P[h], dy = ik.y - P[h + 1], dh = Math.hypot(dx, dy);
            if (miss > 0.02 && dh > 1e-4) { const k = Math.min(0.5, miss / dh); fc.x -= dx * k; fc.y -= dy * k; }
            else {
              const dz = tz + fc.z - P[h + 2];
              if (Math.hypot(dh, dz) > Lr && dh > 1e-4) { const nh = Math.sqrt(Math.max(0, Lr * Lr - dz * dz)); fc.x -= dx * (1 - nh / dh); fc.y -= dy * (1 - nh / dh); }
            }
            if (fc.bx != null) { const cx = fc.x - fc.bx, cy = fc.y - fc.by, cl = Math.hypot(cx, cy); if (cl > fc.cap) { fc.x = fc.bx + cx * fc.cap / cl; fc.y = fc.by + cy * fc.cap / cl; } }
            ik.x = tx + fc.x; ik.y = ty + fc.y; ik.z = tz + fc.z;
            sk._leg(side);
          }
        }
      }
    }
    /** a foot in the air in a jump or a fall (posed by the move, not steered) never goes through the floor either: the
     *  leg bends it up by the depth, the foot kept at the angle it had */
    _airFloor() {
      const sk = this.sk, P = sk.P, R = sk.R, J = RG.J;
      const low = (side) => Math.min(P[(side ? J.R_HEEL : J.L_HEEL) * 3 + 2], P[(side ? J.R_BALL : J.L_BALL) * 3 + 2], P[(side ? J.R_TOE : J.L_TOE) * 3 + 2]);
      for (let side = 0; side < 2; side++) {
        const ik = sk.legIK[side];
        if (ik.on > 0.001) continue;
        let z = low(side);
        if (z >= -0.002) continue;
        const an = (side ? J.R_AN : J.L_AN) * 3, ft = (side ? RG.F.R_FT : RG.F.L_FT) * 9;
        ik.yaw = Math.atan2(R[ft + 4], R[ft + 1]); ik.pitch = Math.asin(U.clamp(-R[ft + 7], -1, 1));
        const x0 = P[an], y0 = P[an + 1], z0 = P[an + 2];
        let lift = 0;
        // (a few times over, like a swinging foot's: a leg nearly straight at take-off gave back a quarter of the lift and
        // left the toes ~0.9 in in the floor, Trial 4)
        for (let it = 0; it < M.Tune.floor.swingFixIters && z < -0.002; it++) {
          lift += (0.004 - z) * (it ? M.Tune.floor.swingFixGain : 1);
          ik.x = x0; ik.y = y0; ik.z = z0 + lift;
          ik.on = 1; ik.soft = true; ik.softW = 0.02; ik.softK = 1;
          sk._leg(side);
          ik.on = 0;
          z = low(side);
        }
      }
    }
    /** the real bend of an ankle whose foot is set by the floor or its steering (+ = dorsiflexion), last solve: the
     *  foot's forward axis against the shank's, up or down (its turn against the shank taken out) */
    _ankleBend(side) {
      const R = this.sk.R, sh = (side ? RG.F.R_SH : RG.F.L_SH) * 9, ft = (side ? RG.F.R_FT : RG.F.L_FT) * 9;
      const fx = R[ft + 1], fy = R[ft + 4], fz = R[ft + 7];
      const lx = R[sh] * fx + R[sh + 3] * fy + R[sh + 6] * fz, ly = R[sh + 1] * fx + R[sh + 4] * fy + R[sh + 7] * fz;
      return Math.atan2(R[sh + 2] * fx + R[sh + 5] * fy + R[sh + 8] * fz, Math.hypot(lx, ly));
    }
    /** a foot on the floor is set by the floor (its ball, heading and heel rise) and a stepping foot by its steered
     *  heading and pitch, not by the ankle channel: write the ankle's real bend (the foot's pitch against the shank,
     *  + = dorsiflexion) back into the pose, so the pose and every meter tell the truth and a foot leaving the floor
     *  starts from where it really was */
    _footAnkles() {
      const sk = this.sk, p = sk.pose, AL = M.Tune.limits.ankleLoaded;
      for (let side = 0; side < 2; side++) {
        if (sk.legIK[side].on < 0.999) continue;
        // (last resort: a planted ankle the guard could not bring into its range, after the hip itself had to stop at
        // its limit, rolls the foot to the nearest angle it can have; the foot is re-planted where it is)
        const f = this.feet[side];
        if (f.state === 'plant' && sk.clampFoot(side, AL[0] * D, AL[1] * D)) {
          const P = sk.P, jb = (side ? RG.J.R_BALL : RG.J.L_BALL) * 3, jh = (side ? RG.J.R_HEEL : RG.J.L_HEEL) * 3;
          f.x = P[jb]; f.y = P[jb + 1];
          f.pitch = Math.max(0, Math.asin(U.clamp((P[jh + 2] - P[jb + 2]) / (this.dims.heel + this.dims.ball), -1, 1)));
          if (this._hg) this._hg.slip = (this._hg.slip || 0) + 1;
        }
        p[CH[side ? 'rAnk' : 'lAnk']] = this._ankleBend(side);
      }
    }
    /** a planted foot's ankle bends ~50 deg at most with the weight on it (weight-bearing lunge test): past ~48 deg
     *  of shin lean over the foot the heel rises (the foot rolls onto its ball, which stays on its spot), instead of
     *  the shin folding down over a flat foot in a deep stance, a lunge or a landing */
    _ankleRange(dt) {
      const P = this.sk.P, J = RG.J;
      for (const f of this.feet) {
        if (f.state !== 'plant') { f.heelFloor = 0; continue; }
        const s = f.side, kn = (s ? J.R_KN : J.L_KN) * 3, an = (s ? J.R_AN : J.L_AN) * 3, he = (s ? J.R_HEEL : J.L_HEEL) * 3, to = (s ? J.R_TOE : J.L_TOE) * 3;
        const sx = P[kn] - P[an], sy = P[kn + 1] - P[an + 1], sz = P[kn + 2] - P[an + 2];
        const fx = P[to] - P[he], fy = P[to + 1] - P[he + 1], fz = P[to + 2] - P[he + 2];
        const cosT = (sx * fx + sy * fy + sz * fz) / (Math.hypot(sx, sy, sz) * Math.hypot(fx, fy, fz) || 1);
        const dorsi = Math.PI / 2 - Math.acos(U.clamp(cosT, -1, 1));
        // (the lean it would have with the heel down: what is measured plus the heel rise already used)
        // (x1.35: lifting the heel raises the ankle, and the shin leans on a little further over it)
        const need = Math.max(0, dorsi + (f.pitchUsed || 0) - 47 * D) * 1.3;
        const k = dt > 0 && dt < 0.12 ? 1 - Math.exp(-dt / 0.04) : 1;
        f.heelFloor = (f.heelFloor || 0) + (Math.min(need, 55 * D) - (f.heelFloor || 0)) * k;
      }
    }

    /** the solved body's trunk, head and leg centre lines in the body frame (x right, y forward, z up from the root
     *  ground point, jump taken out), read by clearBall until the next solve */
    _cacheBody() {
      const P = this.sk.P, c = Math.cos(this.facing), s = Math.sin(this.facing), n = BODY_J.length * 3;
      if (!this._bodyNow) { this._bodyNow = new Float64Array(n); this._bodyPrev = new Float64Array(n); this._body = new Float64Array(n); this._bodyN = 0; }
      const Bn = this._bodyNow, Bp = this._bodyPrev, B = this._body, dt = this._inDt;
      // (a new frame: this one becomes the previous; the same frame solved again only refreshes it)
      if (dt > 0) { Bp.set(Bn); this._bodyN++; } else if (!(dt >= 0) || dt > 0.12) this._bodyN = 0;
      for (let i = 0; i < BODY_J.length; i++) {
        const j = BODY_J[i] * 3, rx = P[j] - this.x, ry = P[j + 1] - this.y;
        Bn[i * 3] = rx * s - ry * c; Bn[i * 3 + 1] = rx * c + ry * s; Bn[i * 3 + 2] = P[j + 2] - this.jumpZ;
      }
      // the ball is placed before the next solve: where the body will be one frame on (legs swing fast when running)
      const ok = this._bodyN > 1 && dt > 0 && dt < 0.05;
      for (let i = 0; i < n; i++) B[i] = ok ? Bn[i] + U.clamp(Bn[i] - Bp[i], -0.3, 0.3) : Bn[i];
    }
    /** a ball this player holds or dribbles (centre l = [x, y, z] in the body frame, radius r) pushed out of his own
     *  trunk, head and legs as last solved, so it never sinks into him (the hands hold it where it ends up); legs
     *  false while it goes between them on purpose. Returns how far it moved. */
    clearBall(l, r, legs, yaw, flat) {
      const B = this._body;
      if (!B) return 0;
      const H = this.H, x0 = l[0], y0 = l[1], z0 = l[2];
      // (a point in a frame turned by yaw from the hips', the dribble's: into the hips' frame and back)
      const cy = yaw ? Math.cos(yaw) : 1, sy = yaw ? Math.sin(yaw) : 0;
      if (yaw) { const x = l[0], y = l[1]; l[0] = x * cy - y * sy; l[1] = x * sy + y * cy; }
      // (flat: across the floor only, a ball in the air keeping its fall; more passes for it)
      for (let it = 0; it < (flat ? 3 : 2); it++) {
        pushSeg(B, 0, 1, 0.063 * H + r, l); pushSeg(B, 1, 2, 0.063 * H + r, l);
        pushSeg(B, 3, 3, 0.06 * H + r, l);
        if (legs) {
          pushSeg(B, 4, 5, 0.044 * H + r, l); pushSeg(B, 7, 8, 0.044 * H + r, l); pushSeg(B, 5, 6, 0.032 * H + r, l); pushSeg(B, 8, 9, 0.032 * H + r, l);
          // (and the feet, Trial 8: a crossover's bounce in front went through the front foot)
          pushSeg(B, 6, 10, 0.02 * H + r, l); pushSeg(B, 10, 11, 0.02 * H + r, l); pushSeg(B, 9, 12, 0.02 * H + r, l); pushSeg(B, 12, 13, 0.02 * H + r, l);
        }
        if (flat) l[2] = z0;
      }
      if (yaw) { const x = l[0], y = l[1]; l[0] = x * cy + y * sy; l[1] = -x * sy + y * cy; }
      return Math.hypot(l[0] - x0, l[1] - y0, l[2] - z0);
    }

    /** the ball he dribbles, in the air, out of his legs and body as they are after this solve, across the floor (Trial 8:
     *  it was placed against where they were going to be, one frame on, and a landing foot or a knee coming through faster
     *  than that clipped it for a frame) */
    _ballOffLegs() {
      const vb = this.view && this.view.ball, d = this.dribble, Bn = this._bodyNow;
      if (!vb || !d || !Bn || vb.state !== 'dribble' || !vb.dr || vb.dr.actor !== this || !(d.ph === 'down' || d.ph === 'up')) return;
      const B = this._body;
      this._body = Bn;
      const c = Math.cos(this.facing), s = Math.sin(this.facing), rx = vb.x - this.x, ry = vb.y - this.y, l = TCB;
      l[0] = rx * s - ry * c; l[1] = rx * c + ry * s; l[2] = vb.z - this.jumpZ;
      if (this.clearBall(l, BALL_R, true, 0, true) > 1e-6) { vb.x = this.x + s * l[0] + c * l[1]; vb.y = this.y - c * l[0] + s * l[1]; }
      this._body = B;
    }
    /** a ball that is not his (world centre x, y, z, radius r) pushed out of his trunk, legs, feet, forearms and hands as
     *  last solved, across the floor only when flat (a ball in the air keeps its fall) (Trial 8: a defender up on the
     *  dribble had it bounce through his legs, and a first push out of the hands went through his hand held out in his
     *  stance: the dribbler keeps it off them); out: [x, y, z]. Returns how far */
    clearBallOf(x, y, z, r, out, flat) {
      const B = this._body;
      out[0] = x; out[1] = y; out[2] = z;
      if (!B) return 0;
      const H = this.H, c = Math.cos(this.facing), s = Math.sin(this.facing), rx = x - this.x, ry = y - this.y, l = TCB;
      l[0] = rx * s - ry * c; l[1] = rx * c + ry * s; l[2] = z - this.jumpZ;
      const x0 = l[0], y0 = l[1], z0 = l[2];
      for (let it = 0; it < 3; it++) {
        pushSeg(B, 0, 1, 0.063 * H + r, l); pushSeg(B, 1, 2, 0.063 * H + r, l);
        pushSeg(B, 4, 5, 0.044 * H + r, l); pushSeg(B, 7, 8, 0.044 * H + r, l); pushSeg(B, 5, 6, 0.032 * H + r, l); pushSeg(B, 8, 9, 0.032 * H + r, l);
        pushSeg(B, 6, 10, 0.02 * H + r, l); pushSeg(B, 10, 11, 0.02 * H + r, l); pushSeg(B, 9, 12, 0.02 * H + r, l); pushSeg(B, 12, 13, 0.02 * H + r, l);
        // (his forearms and hands only for a ball in the air: one in the dribbler's hand moved out of them took his hand with
        // it in a frame, Trial 8)
        if (flat) { pushSeg(B, 14, 15, 0.022 * H + r, l); pushSeg(B, 17, 18, 0.022 * H + r, l); pushSeg(B, 15, 16, 0.008 * H + r, l); pushSeg(B, 18, 19, 0.008 * H + r, l); }
        if (flat) l[2] = z0;
      }
      const dx = l[0] - x0, dy = l[1] - y0, dz = l[2] - z0;
      out[0] = x + s * dx + c * dy; out[1] = y - c * dx + s * dy; out[2] = z + dz;
      return Math.hypot(dx, dy, dz);
    }
    /** how far a free ball (world centre x, y, z, radius r) is inside their trunk and head (with legs, the legs and feet too) as last solved
     *  (not the arms: a hand on it takes it or tips it), and the way out of them, out: [nx, ny, nz] (the world's axes, unit
     *  length); 0 when it is clear (Trial 11: a carom or a make coming down out of the net comes off whoever is in its way) */
    ballHit(x, y, z, r, out, legs) {
      if (!this._body) return 0;
      const c = Math.cos(this.facing), s = Math.sin(this.facing), rx = x - this.x, ry = y - this.y, l = TCB;
      l[0] = rx * s - ry * c; l[1] = rx * c + ry * s; l[2] = z - this.jumpZ;
      const x0 = l[0], y0 = l[1], z0 = l[2];
      const d = this.clearBall(l, r, !!legs);
      if (!(d > 1e-6)) return 0;
      const lx = (l[0] - x0) / d, ly = (l[1] - y0) / d, lz = (l[2] - z0) / d;
      out[0] = s * lx + c * ly; out[1] = -c * lx + s * ly; out[2] = lz;
      return d;
    }

    /** in a game (Director.start), the urgency of the gameplay pass: every order's speed goes Tune.urgency.goalK instead of
     *  baseK times what it asks, and a start pushes off harder (startFtps2, startPerFtps). The labs and the audits' scripted
     *  bodies keep the old pace their scenarios were built on */
    setUrgency(on) {
      if (this.kind === 'ref') return;
      const TU = M.Tune.urgency;
      this.urgK = on ? TU.goalK / TU.baseK : 1;
      this.goalK = TU.baseK * this.paceK * this.urgK;
    }
    /** the forearm's turn and the wrist's bend (rad; out[0], out[1]) that face this arm's palm the way n (world, unit: the
     *  dribble's plan, Ball._dribble) or else from (px, py, pz) toward the ball's centre, from the arm as last solved (the
     *  upper arm's frame and the forearm's long axis: neither moves with the turn or the bend); out[2] how well they are
     *  defined (0 for a palm to face straight along the forearm, 1 well off it). False with no way to face */
    _faceBall(side, px, py, pz, vb, out, n) {
      const Rm = this.sk.R, ua = (side ? RG.F.R_UA : RG.F.L_UA) * 9, fa = ua + 9;
      let nx = n ? n[0] : vb.x - px, ny = n ? n[1] : vb.y - py, nz = n ? n[2] : vb.z - pz;
      const nl = Math.hypot(nx, ny, nz);
      if (!(nl > 1e-4)) return false;
      nx /= nl; ny /= nl; nz /= nl;
      // (the forearm's frame before its turn: x, the upper arm's, which the elbow's hinge leaves alone; z, the forearm's
      // own axis; y = z cross x; the palm faces +y turned about z by the turn, then about x by the bend)
      const ax = Rm[ua], ay = Rm[ua + 3], az = Rm[ua + 6], cx = Rm[fa + 2], cy = Rm[fa + 5], cz = Rm[fa + 8];
      const bx = cy * az - cz * ay, by = cz * ax - cx * az, bz = cx * ay - cy * ax;
      const lx = ax * nx + ay * ny + az * nz, ly = bx * nx + by * ny + bz * nz, lz = cx * nx + cy * ny + cz * nz;
      let pro = (side ? 1 : -1) * Math.atan2(-lx, ly);
      // (the way round nearer its range, -14 to 168 deg)
      if (pro < -1.8) pro += 2 * Math.PI;
      // (the wrist bent back no further than Tune.handle.faceWrFMinDeg for it: a low catch with the forearm pointing down wanted
      // it bent back to its limit, and a palm held there jolted as the ride took the ball up)
      out[0] = pro; out[1] = Math.max(M.Tune.handle.faceWrFMinDeg * U.DEG, Math.asin(U.clamp(lz, -1, 1))); out[2] = U.smooth((Math.hypot(lx, ly) - 0.15) / 0.25);
      return true;
    }

    _armTargets(dtI) {
      const sk = this.sk, H = this.H;
      const grip = this._grip || (this._grip = [0, 0]);
      grip[0] = grip[1] = 0;
      const src = this._armSrc || (this._armSrc = [null, null]);
      for (let side = 0; side < 2; side++) { sk.armIK[side].on = 0; sk.armIK[side].pole = null; sk.armIK[side].fkPole = false; sk.armIK[side].soft = 0; src[side] = null; }
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
        // (all of it, Trial 8: at 0.98 the animated arm's 2% kept the palm up to ~0.4 in off the ball, and going from one
        // weight to the other at the release and the catch jolted the elbow)
        ik.on = Math.max(ik.on, wAll * (d.act == null ? 1 : d.act));
        ik.x = d.wx; ik.y = d.wy; ik.z = d.wz; ik.pole = DRIB_POLE; ik.soft = M.Tune.handle.softIk; src[hand] = 'drib';
        // out of a grip (the ball carried from the chest or the hip to where the first push starts): the palm slides from
        // where it held the ball onto the dribble's spot (_handOnBall), and the elbow goes from where the hold had it to
        // the dribble's (back and a little out)
        const st = this._armS[hand], vb = this.view.ball;
        if (st.has && st.src === 'grip' && d.carry != null && vb.state === 'dribble') {
          const P = sk.P, R = sk.R, hj = (hand ? RG.J.R_HD : RG.J.L_HD) * 3, so = (hand ? RG.J.R_SH : RG.J.L_SH) * 3, sg = hand ? 1 : -1;
          const c = Math.cos(this.facing), s = Math.sin(this.facing), rx = P[hj] - vb.x, ry = P[hj + 1] - vb.y;
          const ex = P[so + 3] - P[so], ey = P[so + 4] - P[so + 1], ez = P[so + 5] - P[so + 2];
          const qx = R[18] * ex + R[21] * ey + R[24] * ez, qy = R[19] * ex + R[22] * ey + R[25] * ez, qz = R[20] * ex + R[23] * ey + R[26] * ez, ql = Math.hypot(qx, qy, qz) || 1;
          this._slide = { side: hand, h: [rx * s - ry * c, rx * c + ry * s, P[hj + 2] - vb.z], pole0: [sg * qx / ql, qy / ql, qz / ql], pole: [0, 0, 0] };
        }
        const sl = this._slide;
        if (sl && sl.side === hand && d.carry != null) {
          const e = U.smooth(d.carry), q = sl.pole, q0 = sl.pole0;
          for (let k = 0; k < 3; k++) q[k] = q0[k] + (DRIB_POLE[k] - q0[k]) * e;
          ik.pole = q;
        }
        // (the target is the palm's spot and the IK's is the wrist: first guess, the last frame's offset between them,
        // which _handOnBall then polishes)
        const hw = this._hw && this._hw[hand];
        if (hw && (this.time || 0) - hw[3] < 0.1) {
          const c = Math.cos(this.facing), s = Math.sin(this.facing);
          ik.x += s * hw[0] + c * hw[1]; ik.y += -c * hw[0] + s * hw[1]; ik.z += hw[2];
        }
        const pp = this.pose;
        // the palm facing the ball (d.face, Tune.handle.faceBall): the forearm's turn and the wrist's bend that face it from
        // its spot, the wrist then flexed d.wrX past that (the push's snap); as the spot rolls in over the top of the ball
        // the forearm turns in with it (_faceBall). Else the old fixed turn, palm down
        let wrF = (d.wrF || 0) * D, pro = 150 * D;
        // (and flexed on what the forearm needed to clear the ball, _forearmClear, easing off)
        const lift = this._lift || (this._lift = [0, 0]);
        if (dtI > 0) { const k = Math.exp(-dtI / M.Tune.handle.faceLiftS); lift[0] *= k; lift[1] *= k; }
        if (d.face && this._faceBall(hand, d.wx, d.wy, d.wz, vb, FB, d.pn)) { const k = FB[2] * d.face; pro = U.lerp(pro, FB[0], k); wrF = U.lerp(wrF, FB[1] + ((d.wrX || 0) + lift[hand]) * D, k); }
        pp[CH[pre + 'WrF']] = U.lerp(pp[CH[pre + 'WrF']], wrF, wAll);
        pp[CH[pre + 'Pro']] = U.lerp(pp[CH[pre + 'Pro']], pro, wAll);
        pp[CH[pre + 'WrD']] = U.lerp(pp[CH[pre + 'WrD']], (d.face ? M.Tune.handle.faceWrD : 8) * D, wAll);
        pp[CH[pre + 'Fing']] = U.lerp(pp[CH[pre + 'Fing']], d.fing != null ? d.fing : 0.12, wAll);
        // a move from hand to hand (crossover, between the legs, behind the back), the other hand (d.aux): reaching for the
        // catch while this one still pushes the ball, or letting go of it over the flight after (Trial 8)
        const rv = d.aux, rh = rv && (rv.hand ? 1 : 0) !== hand ? (rv.hand ? 1 : 0) : -1, rAct = rh >= 0 ? U.clamp(rv.act, 0, 1) * wAll : 0;
        // off arm: guards the ball from the nearest defender, forearm up with the palm toward him (between him and
        // the ball, not pushing), in front or out to the side depending on where he is; as well as the handler's
        // skill allows: a guard keeps it up and turned at his man, a big who can't dribble barely lifts it; with
        // nobody close it is carried loosely in front
        // (nobody close: standing, it hangs loose across in front toward the other knee, the reference guard setup;
        // driving, it rides out to the side for balance; running it up the floor it swings like a runner's arm)
        const off = hand ? 'l' : 'r';
        const gd = this._guardDir(this._inDt);
        const wG = gd.w * (0.2 + 0.8 * this.rHandle);
        const moveK = U.smooth((this.speed - 1.5) / 4), runK = U.smooth((this.speed - 12) / 6);
        const ownArm = this.clip && this.clip.clip.offArm ? U.smooth(this.clip.w) * (1 - U.smooth((this.clip.t - this.clip.clip.dur + 0.2) / 0.2)) : 0;
        const wOff = 0.85 * wAll * (1 - 0.85 * runK * (1 - wG)) * (1 - ownArm) * (1 - rAct);
        for (let k = 0; k < GUARD_CH.length; k++) {
          const c = GUARD_CH[k], g = GUARD_FRONT[k] + (GUARD_SIDE[k] - GUARD_FRONT[k]) * gd.side;
          const base = GUARD_HANG[k] + (GUARD_OUT[k] - GUARD_HANG[k]) * moveK;
          const v = base + (g - base) * wG;
          pp[CH[off + c]] = U.lerp(pp[CH[off + c]], c === 'Fing' ? v : v * D, wOff);
        }
        // a reach at the ball: the off arm comes up as a bar against it, reaching out toward the reaching hand with
        // a slight bend at the elbow, the forearm angled down across the way to the ball, palm out (it shields; it
        // does not push him away, which is a foul). The better the handler, the more of it. (Not while that hand reaches
        // for a move's catch, rAct: the bar took it off the ball on the way)
        const pkB = this._protectK();
        if (pkB > 0.001 && this._protect.fx != null && !(rAct > 0.001 && rh === 1 - hand)) {
          const pr = this._protect, offH = 1 - hand, oS = offH ? 1 : -1, L = this.dims.ua + this.dims.fa;
          const sh = this.local(oS * this.dims.shX, 0.02 * H, 0.8 * H, RT3);
          const dx = pr.fx - sh[0], dy = pr.fy - sh[1], dl = Math.hypot(dx, dy) || 1, reach = Math.min(0.72 * L, Math.max(0.3 * L, dl - 1.2));
          const ikO = sk.armIK[offH], wB = pkB * wAll * (0.6 + 0.4 * this.rHandle);
          if (wB > ikO.on) {
            // (at the height the reach comes in, about his waist as he sits in the dribble)
            const drop = Math.max(0, -pp[CH.rootZ] - 0.03) * H;
            ikO.on = wB; ikO.x = sh[0] + dx / dl * reach; ikO.y = sh[1] + dy / dl * reach; ikO.z = this.jumpZ + 0.5 * H - drop * 0.9;
            ikO.pole = BAR_POLE; ikO.fkPole = false; src[offH] = 'bar';
          }
          pp[CH[off + 'Pro']] = U.lerp(pp[CH[off + 'Pro']], 95 * D, pkB); pp[CH[off + 'WrF']] = U.lerp(pp[CH[off + 'WrF']], -28 * D, pkB);
          pp[CH[off + 'WrD']] = U.lerp(pp[CH[off + 'WrD']], 0, pkB); pp[CH[off + 'Fing']] = U.lerp(pp[CH[off + 'Fing']], 0.1, pkB);
        }
        if (rAct > 0.001) {
          const ikR = sk.armIK[rh], rp = rh ? 'r' : 'l';
          ikR.on = Math.max(ikR.on, rAct); ikR.x = rv.x; ikR.y = rv.y; ikR.z = rv.z; ikR.pole = DRIB_POLE; ikR.soft = M.Tune.handle.softIk; src[rh] = 'drib';
          // (a hand letting go of a hold keeps its elbow where the hold had it)
          if (rv.wrF == null) { const sr = this._armS[rh]; ikR.pole = sr.pole; ikR.fkPole = !!sr.fk; }
          const hr = this._hw && this._hw[rh];
          if (hr && (this.time || 0) - hr[3] < 0.1) {
            const c = Math.cos(this.facing), s = Math.sin(this.facing);
            ikR.x += s * hr[0] + c * hr[1]; ikR.y += -c * hr[0] + s * hr[1]; ikR.z += hr[2];
          }
          // (the dribbling hand's shape, but not for a hand letting go of a hold, wrF null: that keeps its own)
          if (rv.wrF != null) {
            let wrR = rv.wrF * D, proR = 150 * D;
            if (rv.face && this._faceBall(rh, rv.x, rv.y, rv.z, vb, FB, rv.pn)) { const k = FB[2] * rv.face; proR = U.lerp(proR, FB[0], k); wrR = U.lerp(wrR, FB[1] + (rv.wrX || 0) * D, k); }
            pp[CH[rp + 'WrF']] = U.lerp(pp[CH[rp + 'WrF']], wrR, rAct);
            pp[CH[rp + 'Pro']] = U.lerp(pp[CH[rp + 'Pro']], proR, rAct);
            pp[CH[rp + 'WrD']] = U.lerp(pp[CH[rp + 'WrD']], (rv.face ? M.Tune.handle.faceWrD : 8) * D, rAct);
            pp[CH[rp + 'Fing']] = U.lerp(pp[CH[rp + 'Fing']], 0.12, rAct);
          }
        }
        // running with it: leaning into the push, head up (the speed dribble reference)
        const spD = U.smooth((this.speed - 10) / 8) * wAll;
        if (spD > 0.001) { pp[CH.pelPitch] += 7 * D * spD; pp[CH.spFlex] += 5 * D * spD; pp[CH.nkFlex] -= 7 * D * spD; pp[CH.hdFlex] -= 3 * D * spD; }
        // shoulders turn a little toward the ball side; the dribbling shoulder dips as the push goes down
        // (from side to side on a critically damped spring, Tune.handle.sideHz: switched at a crossover's release, the chest
        // twist jumped 10 deg in a frame, Trial 8)
        {
          const sdS = this._dribSide || (this._dribSide = [hand ? -1 : 1, 0]), goal = hand ? -1 : 1;
          if (dtI > 0 && dtI < 0.12) { const w = 2 * Math.PI * M.Tune.handle.sideHz; sdS[1] += (w * w * (goal - sdS[0]) - 2 * w * sdS[1]) * dtI; sdS[0] += sdS[1] * dtI; }
          else if (!(dtI >= 0) || dtI >= 0.12) { sdS[0] = goal; sdS[1] = 0; }
          pp[CH.chTwist] += sdS[0] * 5 * D * wAll;
        }
        // (and stay with the ball, Trial 8: a body that turned away from it while it was down, the facing wanted changing
        // under it, had it come up behind the dribbling shoulder past the arm's reach back (the shoulder at the end of its
        // range), the hand up to ~10 in off it; the chest turns back toward where it will be caught as it comes up,
        // Tune.handle.stayTwistDeg at most, on a critically damped spring, and eases back as the hand brings it forward.
        // Only while it is in the air, where it stays put across the floor: in the hand it goes with the dribble's frame,
        // which turns with the chest and took it further back than the shoulder, the twist growing on itself until the
        // arm snapped straight. Not on a move that takes it behind the body on purpose)
        {
          const TH = M.Tune.handle, st = this._stayTw || (this._stayTw = [0, 0]), vd = vb.dr;
          const mvT = vd && vd.move && vd.moveStarted ? vd.move.type : null, fq = vd && vd.fl && vd.plan && vd.fl.serial === vd.plan.serial ? vd.fl.q : null;
          let goal = 0;
          if (mvT !== 'btb' && mvT !== 'btl' && vd && vd.actor === this && d.ph === 'up' && fq) {
            const so = (hand ? RG.J.R_SH : RG.J.L_SH) * 3, P = sk.P, c = Math.cos(this.facing), s = Math.sin(this.facing);
            // (only for a catch well behind the shoulder, Tune.handle.stayBehindFt: a control dribble keeps it back and in on
            // purpose, a few inches behind, and there the twist put the push at the end of the arm's reach)
            const behind = -((fq[0] - P[so]) * c + (fq[1] - P[so + 1]) * s) - TH.stayBehindFt;
            if (behind > 0) goal = Math.min(TH.stayTwistDeg, TH.stayTwistPerFt * behind) * D;
          }
          // (held through the push and its follow-through: turning back under an arm pushing the ball down at the end of its
          // reach, a retreat's elbow snapped straight; it eases out as the hand brings the ball up and forward)
          if (d.ph === 'push' || d.ph === 'down') goal = st[0];
          if (dtI > 0 && dtI < 0.12) { const w = 2 * Math.PI * TH.stayHz; st[1] += (w * w * (goal - st[0]) - 2 * w * st[1]) * dtI; st[0] += st[1] * dtI; }
          else if (!(dtI >= 0) || dtI >= 0.12) { st[0] = goal; st[1] = 0; }
          const tw = (hand ? -1 : 1) * st[0] * wAll;
          pp[CH.chTwist] += 0.6 * tw; pp[CH.spTwist] += 0.4 * tw;
        }
        // an in and out's fake: shoulders and head toward the other hand as if crossing over (Trial 8)
        if (d.fake) {
          const fk = d.fake * wAll * M.Tune.handle.inoutFakeDeg * D, sg = hand ? 1 : -1;
          pp[CH.chTwist] += sg * fk; pp[CH.spTwist] += sg * 0.4 * fk; pp[CH.chLat] -= sg * 0.5 * fk; pp[CH.nkTwist] += sg * 0.6 * fk;
        }
        if (d.ph === 'push') pp[CH.chLat] += (hand ? 1 : -1) * 2.5 * D * Math.sin(Math.PI * (d.s || 0)) * wAll;
      }
      // a pass coming (Trial 10): the hands up in front of the chest toward the passer as a target from the moment it is
      // coming, then out where the ball will be, set there before it arrives, and over the last moment onto its own path,
      // palms behind it and fingers up (thumbs together, or the little fingers for a ball below the waist)
      this._rcW = 0;
      const rc = this._rc;
      // (not through his own throw's follow-through: told of the return pass of a give-and-go as he let the ball go, the hands
      // came up for it out of the release, the pass's wrists and the target's fitted against each other, popping, Trial 10)
      if (rc && rc.caught == null && !this.hasBall && !this.dribble && this.view && this.view.ball && !(this.clip && this.clip.clip.ballKeys) && !this.throwing()) {
        const b = this.view.ball, q = RT2, w = this._rcHands(rc, b, q);
        if (w > 0.001) {
          this._rcW = w;
          const gr = A.GRIP[q[2] > (this.jumpZ || 0) + 0.92 * H ? 'over' : 'catch'];
          // (the pocket faces the way the ball comes in, up or down too: a bounce pass rising into the hands, a lob dropping
          // in; faced level, a ball rising into low hands went through the lower wrist in the last frame)
          const ga = this._rcA, f3 = RT3;
          if (rc.ball && b.segs && rc.tEnd != null) {
            const e1 = b.posAt(rc.tEnd, TA), e0 = b.posAt(rc.tEnd - 0.03, TB), el = Math.hypot(e0[0] - e1[0], e0[1] - e1[1], e0[2] - e1[2]) || 1, k = this._rcK;
            // (turned from level to it over the first moment of the flight, as the hands go from the target to the catch point)
            f3[0] = Math.cos(ga) * (1 - k) + (e0[0] - e1[0]) / el * k; f3[1] = Math.sin(ga) * (1 - k) + (e0[1] - e1[1]) / el * k; f3[2] = (e0[2] - e1[2]) / el * k;
          } else { f3[0] = Math.cos(ga); f3[1] = Math.sin(ga); f3[2] = 0; }
          let fl = Math.hypot(f3[0], f3[1], f3[2]);
          if (fl < 1e-6 || Math.hypot(f3[0], f3[1]) < 0.2 * fl) { f3[0] = Math.cos(ga); f3[1] = Math.sin(ga); f3[2] = 0; fl = 1; }
          const fx = f3[0] / fl, fy = f3[1] / fl, fz = f3[2] / fl, rl = Math.hypot(fx, fy) || 1, rx = fy / rl, ry = -fx / rl;
          const ux = ry * fz, uy = -rx * fz, uz = rx * fy - ry * fx;
          // (the wrists bend so the fingers lie on the ball there, _gripOnBall, as in a hold: bent the pose's way the hands
          // pointed into the ball as it came, the ball through a hand in the last frames)
          const rq = this._rcQ || (this._rcQ = [0, 0, 0]), wf = this._wrFix || (this._wrFix = [new Float64Array(3), new Float64Array(3)]);
          rq[0] = q[0]; rq[1] = q[1]; rq[2] = q[2];
          for (let side = 0; side < 2; side++) {
            const g = side ? gr.r : gr.l, ik = sk.armIK[side];
            if (ik.on >= w) continue;
            ik.on = w; src[side] = 'rc'; ik.pole = HOLD_POLE.hold; ik.fkPole = false;
            ik.x = q[0] + (rx * g[0] + fx * g[1] + ux * g[2]) * BALL_R; ik.y = q[1] + (ry * g[0] + fy * g[1] + uy * g[2]) * BALL_R; ik.z = q[2] + (fz * g[1] + uz * g[2]) * BALL_R;
            wf[side][2] = 1;
          }
          this._rcShape(w);
        }
      } else if (rc && (rc.caught != null || (rc.ball && this.hasBall))) {
        // (after the catch the catching shape gives way to the hold's; from the frame the ball is in the hands, before _rcStep
        // has marked it caught: dropped for that one frame, the arms' pose channels glide (_inArm) took the drop and the
        // shape's return the frame after as two jumps, and the forearms turned ~50 deg past it for a frame)
        const tc = rc.caught != null ? rc.caught : this.time || 0;
        this._rcShape(1 - U.smooth(((this.time || 0) - tc) / M.Tune.pass.afterS));
      }
      // reaching for a ball (Trial 11, reachFor): onto it where it is, on its sides as a hold has them (over it, above the
      // head), turned to it as seen from the body, from reach.t1 - reach.lead on until it is taken or gone
      this._reachW = 0;
      const rch = this._reach;
      if (rch) {
        const b = rch.b, t = this.time || 0;
        if (!b || (b.holder && (b.holder === this || !rch.other)) || t > rch.until) this._reach = null;
        else if (rch.touch) {
          // (a touch: the wrist on the line from the ball to the shoulder, the palm onto the ball's near side)
          const w = U.smooth((t - (rch.t1 - rch.lead)) / rch.lead) * rch.w, P = sk.P, TG = M.Tune.glass;
          if (w > 0.001) for (const side of rch.hands) {
            const ik = sk.armIK[side], so = (side ? RG.J.R_SH : RG.J.L_SH) * 3;
            if (ik.on >= w) continue;
            const ux = P[so] - b.x, uy = P[so + 1] - b.y, uz = P[so + 2] - b.z, ul = Math.hypot(ux, uy, uz) || 1, k = (BALL_R + TG.touchWristFt) / ul;
            ik.on = w; src[side] = 'tgt'; ik.pole = HOLD_POLE.over; ik.fkPole = false;
            ik.x = b.x + ux * k; ik.y = b.y + uy * k; ik.z = b.z + uz * k;
            this._reachW = w;
          }
        } else {
          const w = U.smooth((t - (rch.t1 - rch.lead)) / rch.lead) * rch.w;
          if (w > 0.001) {
            const over = b.z > this.jumpZ + 0.95 * this.H, gn = over ? 'over' : 'hold', grip = A.GRIP[gn];
            // (turned with the body, as the hold it becomes has it: turned to the ball, the hands went round it ~0.4 ft in the
            // frame it was taken, Trial 11)
            const fa = this.facing, c = Math.cos(fa), s = Math.sin(fa);
            const wf = this._wrFix || (this._wrFix = [new Float64Array(3), new Float64Array(3)]);
            for (const side of rch.hands) {
              const g = side ? grip.r : grip.l, ik = sk.armIK[side];
              if (ik.on >= w) continue;
              // (a grip, to the arms' easing: taken, the ball's hold carries on from it round the ball, not from a spot left
              // behind in the air as it comes down, ~9 in off it, Trial 11)
              ik.on = w; src[side] = 'grip'; ik.pole = HOLD_POLE[gn] || null; ik.fkPole = false;
              ik.x = b.x + (s * g[0] + c * g[1]) * BALL_R; ik.y = b.y + (-c * g[0] + s * g[1]) * BALL_R; ik.z = b.z + g[2] * BALL_R;
              wf[side][2] = 1;
            }
            this._reachW = w;
          }
        }
      }
      // a contest (Trial 11, contestBall): the hand up at the ball along the line from its shoulder, as far as the arm reaches
      const ctb = this._contest;
      if (ctb) {
        const t = this.time || 0, TG = M.Tune.glass;
        const w = U.smooth((t - (ctb.t1 - ctb.lead)) / ctb.lead) * (1 - U.smooth((t - ctb.t1 - ctb.hold) / TG.contestDownS));
        if (t > ctb.t1 + ctb.hold + TG.contestDownS || !ctb.b) this._contest = null;
        else if (w > 0.001) {
          const b = ctb.b, P = sk.P, L = (this.dims.ua + this.dims.fa) * TG.contestReachK;
          // (at the shooter's release point while they have it, held on where the ball was as it went; with no shooter, at the ball
          // until tRel, then held there)
          // (held where the ball went as seen from their body, which goes on with them: as they come down from their jump the arm
          // stays up at it instead of reaching for a spot in the air they have dropped away from)
          let q = CT3;
          const rx = this.x, ry = this.y, rz = this.jumpZ || 0;
          if (ctb.fr) {
            // (from where it was aimed onto where the ball really went, over Tune.glass.contestSwapS)
            const u = U.smooth((t - ctb.frT) / TG.contestSwapS);
            q[0] = rx + ctb.from[0] + (ctb.fr[0] - ctb.from[0]) * u; q[1] = ry + ctb.from[1] + (ctb.fr[1] - ctb.from[1]) * u; q[2] = rz + ctb.from[2] + (ctb.fr[2] - ctb.from[2]) * u;
          } else if (ctb.sh && b.holder === ctb.sh) ctb.sh.releasePoint(q);
          else if (ctb.at && t < ctb.t1) { q[0] = ctb.at[0]; q[1] = ctb.at[1]; q[2] = ctb.at[2]; }
          else if (!ctb.sh && t < ctb.t1) { q[0] = b.x; q[1] = b.y; q[2] = b.z; }
          else {
            ctb.fr = [b.x - rx, b.y - ry, b.z - rz]; ctb.frT = t;
            ctb.from = ctb.last ? [ctb.last[0] - rx, ctb.last[1] - ry, ctb.last[2] - rz] : ctb.fr.slice();
            q[0] = rx + ctb.from[0]; q[1] = ry + ctb.from[1]; q[2] = rz + ctb.from[2];
          }
          ctb.last = ctb.last || [0, 0, 0]; ctb.last[0] = q[0]; ctb.last[1] = q[1]; ctb.last[2] = q[2];
          for (const side of ctb.sides) {
            const ik = sk.armIK[side], so = (side ? RG.J.R_SH : RG.J.L_SH) * 3;
            if (ik.on >= w) continue;
            const dx = q[0] - P[so], dy = q[1] - P[so + 1], dz = q[2] - P[so + 2], dl = Math.hypot(dx, dy, dz) || 1;
            // (the wrist on the line to the ball, the hand past it: short of the ball by contestGapFt)
            const k = U.clamp(dl - TG.contestGapFt - 0.12 * this.H, 0.5 * L, L) / dl;
            ik.on = w; src[side] = 'tgt'; ik.pole = HOLD_POLE.over; ik.fkPole = false;
            ik.x = P[so] + dx * k; ik.y = P[so + 1] + dy * k; ik.z = P[so + 2] + dz * k;
          }
        }
      }
      // denying a pass (the gameplay pass, Director.guardPos: one pass away, as hard as his scheme and his defense allow): the hand
      // on the ball's side out in the lane toward the passer, the arm near straight a little below the shoulder
      const dn = this._deny;
      if (dn && dn.w > 0.001 && !this.hasBall && !this.clip && !this._contest && (this.time || 0) - dn.t < 0.1) {
        const side = dn.side, ik = sk.armIK[side];
        if (ik.on < dn.w) {
          const P = sk.P, so = (side ? RG.J.R_SH : RG.J.L_SH) * 3, L = (this.dims.ua + this.dims.fa) * M.Tune.deny.reachK;
          const dx = dn.x - P[so], dy = dn.y - P[so + 1], dl = Math.hypot(dx, dy) || 1;
          ik.on = dn.w; src[side] = 'tgt'; ik.pole = BAR_POLE; ik.fkPole = false;
          ik.x = P[so] + dx / dl * L; ik.y = P[so + 1] + dy / dl * L; ik.z = P[so + 2] - M.Tune.deny.dropH * this.H;
        }
      }
      // about to catch: the hands go out to meet the ball, a pass in its last ~0.3 s (one nobody warned him of) or a loose
      // ball within reach just before a clip's catch or grab (a grip that only switched on at the catch left the hands
      // behind the ball)
      if (!this._rcW && !this.hasBall && !this.dribble && this.view && this.view.ball) {
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
        const cs = this.clip && this.clip.clip.ballKeys ? this.clip : this.upper && this.upper.clip.ballKeys ? this.upper : null;
        const c = Math.cos(this.facing), s = Math.sin(this.facing);
        const gi = cs ? A.clipGripAt(cs.clip, Math.min(cs.t, cs.clip.dur), GI) : null;
        if (gi && (gi.wr > 0.001 || gi.wl > 0.001)) {
          // a clip's grips, eased from key to key, with the elbows where the clip's own arms have them (the arm is
          // solved toward its animated elbow, so between key poses it keeps their shape instead of twisting)
          const mir = cs.mirror;
          // (a clip that holds the ball without throwing it, a catch or a pick-up or a jab: the fingers on the ball as in a
          // plain hold, _gripOnBall; a shot's wrists are its own. A pass's too, up to the release: with its own wrists the
          // palms stood ~1.5-2.5 in off the ball through a chest pass's push, Trial 10; the snap through is the clip's
          // once the ball has gone)
          const fit = !(cs.clip.events && cs.clip.events.release != null) || /^pass/.test(cs.clip.name);
          const wf = fit ? this._wrFix || (this._wrFix = [new Float64Array(3), new Float64Array(3)]) : null;
          // (coming in over a plain hold turned with the chest, _holdLocal, the grips turn back to the hips' frame as the clip
          // does: switched at once, a passer holding it with the chest turned to a decoy had the hands ~3 in off it, Trial 10)
          const fy = this.facing + this._holdYaw() * (1 - U.clamp(cs.w, 0, 1)), c = Math.cos(fy), s = Math.sin(fy);
          for (let side = 0; side < 2; side++) {
            const g = mir ? (side ? gi.l : gi.r) : (side ? gi.r : gi.l), w = mir ? (side ? gi.wl : gi.wr) : (side ? gi.wr : gi.wl);
            if (!g || w <= 0.001) continue;
            const gx = mir ? -g[0] : g[0];
            const ik = sk.armIK[side];
            ik.on = w; this._grip[side] = w; src[side] = 'grip'; ik.pole = null; ik.fkPole = true;
            ik.x = b.x + (s * gx + c * g[1]) * BALL_R;
            ik.y = b.y + (-c * gx + s * g[1]) * BALL_R;
            ik.z = b.z + g[2] * BALL_R;
            if (wf) wf[side][2] = 1;
          }
        } else if (!cs) {
          // a plain hold: elbows down and out, palms on the sides of the ball
          const gripName = this.ballHold === 'triple' ? 'hip' : this.ballHold === 'over' ? 'over' : 'hold';
          const grip = A.GRIP[gripName], pole = HOLD_POLE[gripName] || null;
          // (the triple threat stance's arms are fitted to hold the ball: its elbows go where that pose has them)
          const fk = gripName === 'hip' && this.stance === 'triple';
          const mir = this.lefty;
          const wf = this._wrFix || (this._wrFix = [new Float64Array(3), new Float64Array(3)]);
          // (the palms on its sides as the chest has them, turned with the ball in front of it: _holdLocal)
          const fy = this.facing + this._holdYaw(), c = Math.cos(fy), s = Math.sin(fy);
          for (let side = 0; grip && side < 2; side++) {
            const g = mir ? (side ? grip.l : grip.r) : (side ? grip.r : grip.l);
            if (!g) continue;
            const gx = mir ? -g[0] : g[0];
            const ik = sk.armIK[side];
            ik.on = 1; this._grip[side] = 1; src[side] = 'grip'; ik.pole = fk ? null : pole; ik.fkPole = fk;
            ik.x = b.x + (s * gx + c * g[1]) * BALL_R;
            ik.y = b.y + (-c * gx + s * g[1]) * BALL_R;
            ik.z = b.z + g[2] * BALL_R;
            // (the grip is where the wrist goes: the wrist bends so the fingers lie on the ball, _gripOnBall)
            wf[side][2] = 1;
          }
        }
      }
      // (a hold's wrist bend that puts the fingers on the ball, easing in and out: _gripOnBall)
      const wf = this._wrFix;
      // (while it holds the palm on the ball the bend takes up the pose's own wrist changes, the wrist staying where the fit
      // has it: a pass clip coming in over a hold moved the wrist the clip's way ~30 deg in 0.1 s until the spring caught up,
      // the palms ~2.5 in off the ball, Trial 10)
      // (only while he holds it: past the release a pass's grips ease out over its follow-through, and the bend took up
      // the clip's own wrist snap for a frame, then sprang back from it, the hands popping)
      const hb = this.view && this.view.ball, holding = !!(hb && hb.holder === this && hb.state === 'held');
      if (wf) for (let side = 0; side < 2; side++) {
        const f = wf[side], i = CH[side ? 'rWrF' : 'lWrF'], pw = this.pose[i];
        if (f[2] && f.act && holding && f.pw != null && dtI > 0 && dtI <= 0.12) f[0] -= pw - f.pw;
        if (dtI !== 0) f.pw = f[2] ? pw : null;
        if (f[0]) this.pose[i] += f[0];
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
        // (the dribble's weights come already eased from the ball's plan, a hand letting go or taking over on a move, and
        // are let through faster: at ~0.12 s a side they lagged, the new hand still coming onto the ball at the catch)
        const rt = src[side] === 'drib' ? M.Tune.handle.dribWS : 0.12;
        if (fresh) { st.w = want; st.has = false; st.src = null; st.xf = null; st.t.reset(); }
        else if (dt > 0) st.w = want > st.w ? Math.min(want, st.w + dt / rt) : Math.max(want, st.w - dt / rt);
        if (want > 0.001) {
          const cur = src[side] || 'tgt';
          // relative to the ball (body frame) while holding or dribbling it, else relative to the body
          // (a pass coming, 'rc': where the hands wait for the ball is carried by the body, not the ball still in the air;
          // taken relative to that ball, the hands swung ~0.3 ft past the hold as it arrived, Trial 10)
          const onBall = cur !== 'tgt' && cur !== 'rc';
          bl(ik.x - (onBall ? bx - this.x : 0), ik.y - (onBall ? by - this.y : 0), ik.z - (onBall ? bz - this.jumpZ : 0), v);
          if (st.has && st.src && st.src !== cur && !fresh) {
            // changing task (grip <-> dribble, hand-over): crossfade from where the hand was
            st.xf = { t: 0, x: st.ox, y: st.oy, z: st.oz, ball: st.onBall };
            // (the catch, 'rc' into a hold: from where the hand was on the ball, the ball's frame, so the hands come in with
            // it as it gives into the chest; from a spot held still, the ball ran on into the forearms, ~1-2 in, Trial 10)
            if (st.src === 'rc' && onBall && b) { const q = bl(bx, by, bz, TCB); st.xf.x -= q[0]; st.xf.y -= q[1]; st.xf.z -= q[2]; st.xf.ball = true; }
            st.t.reset();
          }
          if (cur === 'grip') st.t.apply(v, st.has && st.src === 'grip' ? dt : -1);
          else st.t.reset();
          let wx, wy, wz;
          const toW = (lx, ly, lz, ball) => { wx = this.x + s * lx + c * ly + (ball ? bx - this.x : 0); wy = this.y - c * lx + s * ly + (ball ? by - this.y : 0); wz = lz + this.jumpZ + (ball ? bz - this.jumpZ : 0); };
          toW(v[0], v[1], v[2], onBall);
          if (st.xf) {
            st.xf.t += Math.max(0, dt);
            const e = U.smooth(Math.min(1, st.xf.t / M.Tune.handle.xfS));
            if (st.xf.ball && onBall) {
              // (from one hold on the ball to another, a grip into the dribble: round the ball, not through it, Trial 8)
              const a0 = Math.hypot(st.xf.x, st.xf.y, st.xf.z), a1 = Math.hypot(v[0], v[1], v[2]);
              let ix = st.xf.x + (v[0] - st.xf.x) * e, iy = st.xf.y + (v[1] - st.xf.y) * e, iz = st.xf.z + (v[2] - st.xf.z) * e;
              const il = Math.hypot(ix, iy, iz), want = a0 + (a1 - a0) * e;
              if (il > 1e-4) { ix *= want / il; iy *= want / il; iz *= want / il; }
              toW(ix, iy, iz, true);
            } else {
              const nx = wx, ny = wy, nz = wz;
              toW(st.xf.x, st.xf.y, st.xf.z, st.xf.ball);
              wx += (nx - wx) * e; wy += (ny - wy) * e; wz += (nz - wz) * e;
            }
            if (e >= 1) st.xf = null;
          }
          ik.x = wx; ik.y = wy; ik.z = wz;
          // remember the hand's spot (body frame) for a later hand-over or release
          bl(wx, wy, wz, v); st.ox = v[0]; st.oy = v[1]; st.oz = v[2]; st.onBall = false;
          st.has = true; st.src = cur; st.pole = ik.pole; st.fk = !!ik.fkPole;
        } else if (st.w > 0.001 && st.has) {
          // letting go: hold the last spot in the body frame while the weight fades
          ik.pole = st.pole; ik.fkPole = !!st.fk;
          ik.x = this.x + s * st.ox + c * st.oy; ik.y = this.y - c * st.ox + s * st.oy; ik.z = st.oz + this.jumpZ;
          st.src = null; st.xf = null;
        } else { st.has = false; st.src = null; st.xf = null; st.t.reset(); }
        // (an arm letting go of what it held: its wrist blended round the shoulder near full reach, Rig._armIK, Trial 9)
        ik.letGo = !(want > 0.001) && st.w > 0.001 && st.has;
        // (eased in and out, a grip or a reach coming on over the ramp without a jolt at either end, Trial 8; the dribble's
        // own weights come eased already)
        ik.on = st.src === 'drib' || src[side] === 'drib' ? st.w : U.smooth(st.w);
      }
    }

    // ============================================================ draw
    draw(g, cam, fr, o) {
      if (this.hidden) return;
      fr.draw(g, cam, this.sk, this.style, o);
    }
    depth(cam) { return cam.depth(this.y, 3); }
  }

  const TA = new Float64Array(3), TB = new Float64Array(3), TC = new Float64Array(3), HL = new Float64Array(3), BL = new Float64Array(3);
  const TD = new Float64Array(3), TE = new Float64Array(3), TF = new Float64Array(3), DSH = {}, GI = {}, JAC = new Float64Array(9), WEV = new Float64Array(3), TCB = new Float64Array(3);
  // body centre lines kept for clearBall: pelvis, chest, neck, head centre, left hip / knee / ankle, right hip / knee / ankle,
  // left ball of the foot / toe, right ball of the foot / toe
  // (the arms last, 14 to 19: another player's forearms and hands, for a ball that is not his, clearBallOf)
  const LPF = { x: 0, y: 0, facing: 0 }, LG0 = new Float64Array(30);
  const LEG_JL = [RG.J.L_HIP, RG.J.L_KN, RG.J.L_AN, RG.J.L_BALL, RG.J.L_TOE], LEG_JR = [RG.J.R_HIP, RG.J.R_KN, RG.J.R_AN, RG.J.R_BALL, RG.J.R_TOE];
  const BODY_J = [RG.J.PEL, RG.J.CHS, RG.J.NCK, RG.J.HC, RG.J.L_HIP, RG.J.L_KN, RG.J.L_AN, RG.J.R_HIP, RG.J.R_KN, RG.J.R_AN, RG.J.L_BALL, RG.J.L_TOE, RG.J.R_BALL, RG.J.R_TOE,
    RG.J.L_EL, RG.J.L_WR, RG.J.L_HD, RG.J.R_EL, RG.J.R_WR, RG.J.R_HD];
  /** move point l out to at least `min` from the segment between body points a and b (a == b: a sphere) */
  function pushSeg(B, a, b, min, l) {
    const ax = B[a * 3], ay = B[a * 3 + 1], az = B[a * 3 + 2];
    const bx = B[b * 3] - ax, by = B[b * 3 + 1] - ay, bz = B[b * 3 + 2] - az;
    const l2 = bx * bx + by * by + bz * bz;
    const t = l2 > 1e-9 ? U.clamp(((l[0] - ax) * bx + (l[1] - ay) * by + (l[2] - az) * bz) / l2, 0, 1) : 0;
    let dx = l[0] - ax - bx * t, dy = l[1] - ay - by * t, dz = l[2] - az - bz * t;
    const d = Math.hypot(dx, dy, dz);
    if (d >= min) return;
    if (d < 1e-6) { dx = 0; dy = 1; dz = 0; } else { dx /= d; dy /= d; dz /= d; }
    const k = min - d;
    l[0] += dx * k; l[1] += dy * k; l[2] += dz * k;
  }
  // stances a man can dribble in (any other becomes 'dribble' while he does, setStance)
  const DRIB_STANCES = new Set(['dribble', 'postUp', 'triple']);
  // dribbling elbow swivel: behind the elbow with a small outward bias (x = outward, y = forward, z = up)
  const DRIB_POLE = [0.28, -0.85, -0.45];
  // (_faceBall's answer: the forearm's turn, the wrist's bend, how well defined)
  const FB = [0, 0, 0];
  // the off arm's bar against a reach: the elbow down and a little out
  const BAR_POLE = [0.45, -0.1, -0.9];
  // the stagger for moves between the legs standing (H): the lead foot this far forward, the other this far back
  const STAG_F = 0.1, STAG_B = 0.03;
  // holding the ball without a clip: elbows down and out (chest), out and forward (overhead), back (hip pocket)
  const HOLD_POLE = { hold: [0.62, -0.25, -0.75], over: [0.75, 0.25, -0.3], hip: [0.35, -0.8, -0.5] };
  // how much of the chest's turn from the hips a plain hold's ball and hands follow (the triple threat's is at the hip)
  const HOLD_YAW_K = { chest: 1, over: 1, pocket: 0.5, low: 0.5, triple: 0 };
  // stances with a ball side (the ball on the right hip / right of the chest): a lefty gets the mirror image, pose and
  // feet (the stance poses used to stay right-handed while a lefty's ball went to his left hip, so his hands missed it)
  const HANDED = { triple: 'tripleL', shotPocket: 'shotPocketL' };
  const MIR_ST = {};
  function stanceOf(a, name) {
    const st = A.STANCE[name] || A.STANCE.stand;
    if (!a.lefty || !HANDED[name]) return st;
    return MIR_ST[name] || (MIR_ST[name] = Object.assign({}, st, { pose: HANDED[name], L: [-st.R[0], st.R[1]], R: [-st.L[0], st.L[1]] }));
  }
  // follow-through springs (see _followThrough): [gain on the animated angular acceleration, half-life (s), largest
  // offset (rad)]; further out along a chain = more gain, a softer spring and more room
  const KC_PITCH = [CH.spFlex, CH.chFlex, CH.nkFlex, CH.hdFlex];
  const KC_SPINE = [[0.12, 0.05, 1.5 * D], [0.2, 0.06, 2.5 * D], [0.34, 0.07, 4 * D], [0.42, 0.075, 5 * D]];
  const KC_UA = [0.22, 0.06, 4 * D], KC_FA = [0.4, 0.07, 9 * D], KC_AB = [0.2, 0.06, 3 * D];
  const KC_AMAX = 160; // (rad/s^2: a finite-difference acceleration capped, for a switch nothing upstream smoothed)
  /** lag springs on world angles: offset o'' = -w^2 (o - eq) - 2w o', eq = -gain * (angle'' ) / w^2 (+ an outside
   *  push), critically damped (D. Holden, "Spring-It-On: The Game Developer's Spring-Roll-Call") */
  class KChain {
    constructor(n) { this.w = new Float64Array(n); this.v = new Float64Array(n); this.o = new Float64Array(n); this.ov = new Float64Array(n); this.warm = 0; this.hz = 0; this.vz = 0; this.pvx = 0; this.pvy = 0; }
    reset() { this.o.fill(0); this.ov.fill(0); this.v.fill(0); this.warm = 0; }
    /** offset for quantity i at world angle W: stepped by dt when go, else the last one (or 0 after a reset) */
    at(i, W, dt, go, spec, ext) {
      if (!go) { if (this.warm === 0) { this.w[i] = W; this.v[i] = 0; } return this.o[i]; }
      const v = (W - this.w[i]) / dt;
      const a = this.warm >= 2 ? U.clamp((v - this.v[i]) / dt, -KC_AMAX, KC_AMAX) : 0;
      this.w[i] = W; this.v[i] = this.warm >= 1 ? v : 0;
      const y = 2 * Math.LN2 / spec[1];
      const eq = U.clamp((-spec[0] * a + ext) / (y * y), -spec[2], spec[2]);
      const j0 = this.o[i] - eq, j1 = this.ov[i] + j0 * y, e = Math.exp(-y * dt);
      this.o[i] = U.clamp(e * (j0 + j1 * dt) + eq, -spec[2] * 1.4, spec[2] * 1.4);
      this.ov[i] = e * (this.ov[i] - j1 * y * dt);
      return this.o[i];
    }
  }
  const RT = { x: 0, y: 0, yaw: 0 };
  const RP2 = { x: 0, y: 0 }, CT3 = [0, 0, 0];
  function frac(v) { return v - Math.floor(v); }
  /** did phase go through point p while moving from a to b (b>=a, may exceed 1)? */
  function crossed(a, b, p) {
    p = frac(p);
    let pa = p; if (pa < a) pa += 1;
    return pa > a && pa <= b;
  }
  const RT2 = new Float64Array(3), RT3 = new Float64Array(3), RT4 = new Float64Array(3), RT5 = {};
  // the dribbler's off (guard) arm, fitted to the rig in the low dribble stance (degrees, finger curl 0..1): the
  // forearm up with the palm to a defender in front, the arm out to the side for one on the off-hand side, and a
  // loose carry in front when nobody is close
  const GUARD_CH = ['ShF', 'ShA', 'ShT', 'ElF', 'Pro', 'WrF', 'WrD', 'Fing'];
  // a defender close: the forearm up in front of the chest as a bar, the palm toward the defender. (A lower bar, the
  // forearm across at [30, 20, 10, 58, 125, -20, -5] / [24, 46, -30, 62, 125, -22, 5], was fitted to a shallower
  // stance; in the Trial 8 stance, hips lower and trunk further over, it held the hand at ~0.29 H, knee height, below
  // the hips: these hold it at ~0.59 H, chest height in the stance. A reach at the ball still takes the arm across, see
  // BAR_POLE)
  const GUARD_FRONT = [79, 8.5, 12, 110, 166, -26.5, -9, 0.15];
  const GUARD_SIDE = [40, 44, -49, 107, 166, -30.5, 5, 0.15];
  const GUARD_CARRY = [25, 21, 0, 93.5, 69, -1.5, 10.5, 0.25];
  // nobody close: standing (sizing up), the arm hangs loose down and across in front of the bent-over trunk toward
  // the other knee; driving, it rides out to the side and forward for balance
  const GUARD_HANG = [56, -23, 26, 30, 84, 6, 0, 0.35];
  const GUARD_OUT = [38, 48, -8, 58, 62, -8, 0, 0.2];
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
