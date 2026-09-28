/* Pro BBALL Coach: match view tuning (PBC.Match.Tune).
 * The one config for the animation system. Every tunable value lives here, grouped by the system that uses it
 * (and the gauntlet trial that introduced it, see docs/gauntlet). Values are starting points tuned against NBA
 * references; units are in the names or the comments (ft, s, deg, ft/s, ft/s^2, in). Loaded right after util.js.
 * Later groups are added trial by trial as each system's numbers move out of the code. */
(function () {
  'use strict';
  const PBC = (window.PBC = window.PBC || {});
  const M = (PBC.Match = PBC.Match || {});

  const Tune = {
    // ---------------------------------------------------------------- simulation clock (Trial 1)
    clock: {
      // fixed simulation step (s): every playback speed runs whole steps of this size, so 0.25x shows exactly the
      // frames 1x shows, and the motion never depends on the screen's refresh rate
      step: 1 / 60,
      // most steps one update() may run (2 s of game time); a longer gap (a stalled tab) is dropped, not replayed
      maxStepsPerUpdate: 120,
    },

    // ---------------------------------------------------------------- debug tools and meters (Trial 1)
    debug: {
      speeds: [0.1, 0.25, 0.5, 1, 2, 4],
      recorderSeconds: 12,          // rewind buffer length (s of game time, recorded at the sim step)
      // foot contact: a heel / ball / toe point is on the floor below this height (ft; 0.3 in) and leaves it above
      // the exit height (0.5 in); while on the floor a loaded point must not move
      contactEnterFt: 0.025,
      contactExitFt: 0.042,
      // a pivot is legal only on the ball of the foot with the heel off the floor (coaching: rotate on the ball, a
      // heel that turns on the floor slides); heel height (ft) that counts as "up" for the rotation exemption
      pivotHeelUpFt: 0.03,
      // slide thresholds (in): viewers notice foot sliding under 21 mm (Prazak, Hoyet, O'Sullivan, SCA 2011)
      slideOkIn: 0.25,
      slideBadIn: 0.83,
      sinkIn: 0.25,                 // a foot point further below the floor than this is "through the floor"
      hoverIn: 0.5,                 // a planted foot whose lowest point is higher than this is floating
      // hand on the ball: the palm sits ~0.01 H off the ball surface (skin and fingers); gaps are measured past it
      palmOffsetH: 0.01,
      handGapOkIn: 0.5,
      handGapBadIn: 1.5,
      limitTolDeg: 0.5,             // a final joint angle past its human range by more than this is a violation
      accelSnapFtps2: 60,           // body acceleration past this (~1.9 g) in one step is a snap
      turnStillRadps: 0.5,          // a turn "starts" from below this rate...
      turnSnapRadps: 4,             // ...and is instant if it passes this rate within one step (~230 deg/s)
      jointSnapFtps2: 1500,         // a joint accelerating past this in the body frame in one step is a pop
      staleLookSec: 0.5,            // a look target that has not moved for this long while the ball moved...
      staleLookFt: 3,               // ...this far is stale
      torsoOverlapFt: 0.75,         // two torso axes closer than this are inside each other
      handInBodyFt: 0.3,            // a hand this close to another player's torso axis is inside him
      velArrowS: 0.25,              // velocity arrow = where the body will be in this many seconds
      accArrowS2: 0.02,             // acceleration arrow length = accel x this (ft per ft/s^2)
      lookRayFt: 30,                // longest drawn look ray (ft)
      // body meters (Trial 2)
      kneeTrackMinFlexDeg: 20,      // knees over toes: measured on planted legs bent at least this much
      kneeCaveDeg: 20,              // a knee pointing further than this inside its foot's line is caving in
      kneeOffDeg: 25,               // a knee pointing further than this off its foot's line (either way) is off the toes
      counterRunFtps: 9,            // counter-rotation: measured in a forward run faster than this (ft/s)
      counterMeanS: 0.5,            // ...each yaw taken from its own running mean over about this long (s)...
      counterSettleS: 0.5,          // ...once the run has lasted this long (s)
      spineShareMinDeg: 12,         // spine sharing: bends and twists larger than this (deg, lumbar + thoracic)...
      spineKinkShare: 0.9,          // ...with one joint carrying more than this share are a kink, not a curve
      spinePopDegps2: 12000,        // a spine or neck angle whose rate jumps by more than this (deg/s^2) in a step pops
      // floor meters (Trial 3): a step is clear with a stance of at least this long before it (s), a swing at least
      // this long (s) and its lowest point at least this high off the floor at some point of the swing (in)
      stepMinStanceS: 0.05,
      stepMinSwingS: 0.07,
      stepMinClearIn: 0.75,
      landFirstIn: 0.3,             // heel or forefoot first: that end this much lower than the other at contact (in)
      toeOutDeg: 7,                 // a foot's natural turn out from the way the body goes
      toeTravelOffDeg: 20,          // toes further than this from the way he is going (past the turn out) are off
      // weight meters (Trial 4): a hard cut or brake is a push across or against the way he goes past cutFtps2 at
      // hardMoveFtps or more; it should drop the hips hipDropIn below the level they rode at (averaged over hipRefS, the
      // body's own drop for a push and a stretched leg's pull taken back out of it), with a foot planted where the push
      // comes from (a cut: on the side the push comes from, outside or, braking into it, ahead; a brake: out ahead);
      // the facing's turn rate jumping past turnSnapRadps2 is a turn snap; bodies are grouped by weight at massClassLb
      // (hard from jogging speed up: the gauntlet's own jog is 3-4 m/s, 10-13 ft/s)
      cutFtps2: 18, hardMoveFtps: 10, hipDropIn: 1.5, hipRefS: 0.3, turnSnapRadps2: 180, massClassLb: [205, 240],
      hardPeakFtps2: 22, hardMinS: 0.1, // a hard cut or brake peaks past this and lasts this long (s)...
      cutTurnDeg: 35, cutMaxS: 0.7, brakeShed: 0.3, // ...a cut turns his way this far within cutMaxS, a brake sheds this share of his speed
      pushGapS: 0.15,               // ...and one push goes on through a gap this long (a running stride's flight)
      hipJumpIn: 3,                 // the pelvis going up or down more than this in one step on the floor is a hip jump (in)
      // gait meters (Trial 5): the gaits by speed (ft/s: walk below the first, jog, run, sprint from the last), and a pop
      // within this long after a change of gait counts as the transition's
      gaitWalkFtps: 6.2, gaitJogFtps: 13, gaitRunFtps: 20, gaitTransWindowS: 0.3,
      gaitAfterMoveS: 0.35,         // ...and the first this long out of a move or with the ball just gone is counted apart
      colors: {
        ok: '#3ecf8e', warn: '#f2c14e', bad: '#ff4d5a', sink: '#b46bff', hover: '#5ad1ff',
        vel: '#f07a1a', acc: '#39c6ff', face: '#ffffff', chest: '#ffb86b', want: 'rgba(255,255,255,0.35)',
        com: '#ffe14d', support: 'rgba(62,207,142,0.18)', supportOff: 'rgba(255,77,90,0.18)',
        look: 'rgba(120,220,255,0.9)', lookNone: '#ff4d5a', lookStale: '#f2c14e',
        limitBad: '#ff3b45', limitClamp: '#f2a33a', limitReach: '#f2e24e', label: '#e8ecf5', labelBg: 'rgba(8,10,16,0.72)',
      },
    },

    // ---------------------------------------------------------------- body proportions (Trial 2)
    // The rig's segment lengths are fractions of height fitted to a 6'6" player (MakeHuman mesh landmarks, ANSUR); a
    // player of another size or reach differs from him in the ways people really do (js/match/rig.js makeDims)
    body: {
      refHeightFt: 6.5,
      // legs: most of the height difference between two adults is leg (sitting height rises only ~0.4 cm per cm of
      // stature), so taller players are relatively longer-legged: hip-to-floor length +3.5% per foot of height
      legPerFt: 0.035,
      legClamp: [0.94, 1.06],
      // heads grow much less than stature: head size relative to height ~ (H / ref) ^ -0.55 (the 3D mesh uses the
      // same law, js/match/human.js)
      headExp: -0.55,
      // wingspan: a rig T-pose spans this many heights more than the wingspan it stands for (its shoulder joints sit
      // on the mesh's shoulders, ~1.4 in wider each side than where a wingspan measurement's lever starts), so the
      // reference arms are a 1.05 H wingspan (NBA average ~1.05-1.06) and a player's arms (shoulder to wrist) grow
      // or shrink by half the difference of his own wingspan
      spanOffsetH: 0.045,
      armSplit: 0.531,              // share of the shoulder-to-wrist length in the upper arm (0.172 / 0.324 H)
      // wingspan minus height when none is given (in): the engine's average for men and women, and an official's
      spanDefaultIn: { m: 3.5, f: 2, ref: 1 },
      spanClamp: [0.97, 1.14],      // wingspan / height kept inside this range
    },

    // ---------------------------------------------------------------- joint ranges (Trial 2)
    // Active range of motion of healthy adults (AAOS / clinical goniometry norms), degrees, in the rig's conventions
    // (flexion moves a limb forward; knee flexion bends the shank back; twist = internal rotation). The final pose
    // never leaves these (js/match/rig.js limitPose; planted legs by the hip guard in js/match/actor.js).
    limits: {
      joints: {
        // shoulder flexion 180 / extension 60, abduction 180, rotation 70 in / 90 out; elbows and knees bend one way
        // only (straight is the end of their range, never past it)
        ShF: [-60, 185], ShA: [-45, 180], ShT: [-90, 80], ElF: [0, 150],
        WrF: [-75, 85], WrD: [-25, 35],
        // forearm rotation: 76 is neutral (arm hanging, palm to the thigh), ~90 either way
        Pro: [-14, 168],
        // hip flexion 125 / extension 30, abduction 45 / adduction 30, rotation 45; ankle dorsiflexion 30 (more with
        // the weight on it) / plantarflexion 50
        HipF: [-32, 130], HipA: [-30, 50], HipT: [-45, 45], Knee: [0, 152], Ank: [-52, 32],
      },
      // each spine and neck joint on its own. The lumbar joint (sp) bends forward and sideways freely but turns only a
      // little (its facets allow ~1.2-1.7 deg per level, ~9 deg over T12-S1 in a 45 deg trunk turn: Fujii et al. 2007,
      // MRI); the trunk's twist is mostly thoracic (ch, ~30-35 deg each way). The neck's lower joint (nk, C2-C7) and
      // upper one (hd, C0-C2: the nod and half the turn) share its ~80 deg of rotation
      segments: {
        spFlex: [-25, 55], spLat: [-24, 24], spTwist: [-10, 10],
        chFlex: [-22, 42], chLat: [-24, 24], chTwist: [-38, 38],
        nkFlex: [-42, 40], nkLat: [-34, 34], nkTwist: [-42, 42],
        hdFlex: [-28, 18], hdLat: [-14, 14], hdTwist: [-44, 44],
      },
      // [a, b, min, max]: the two spine joints together (trunk flexion ~80 / extension ~30, lateral bend ~35, rotation
      // ~45) and the two neck joints together (flexion ~50 / extension ~60, lateral bend ~45, rotation ~80)
      pairs: [
        ['spFlex', 'chFlex', -32, 82], ['spLat', 'chLat', -36, 36], ['spTwist', 'chTwist', -46, 46],
        ['nkFlex', 'hdFlex', -62, 52], ['nkLat', 'hdLat', -42, 42], ['nkTwist', 'hdTwist', -80, 80],
      ],
      // a planted ankle carries the body's weight, which bends it further than it bends on its own (weight-bearing
      // lunge test ~40-50 deg of dorsiflexion); past ~47 deg of shin lean the heel comes up instead (actor _ankleRange)
      ankleLoaded: [-52, 50],
      // spine and neck joints slow down into the end of their range (the tissues stiffen) instead of stopping dead:
      // within this many degrees of a limit the angle eases in and never quite reaches it
      softDeg: 8,
    },

    // ---------------------------------------------------------------- spine as a chain (Trial 2)
    // however a pose asks for a bend or twist, the lumbar (sp) and thoracic (ch) joints share it the way a spine does
    // (the rest of the trunk is the pelvis below and the rib cage above)
    spine: {
      // share of the total taken by the lumbar joint: forward bend, backward bend, side bend, twist
      lumbarShare: { flex: 0.55, ext: 0.5, lat: 0.45, twist: 0.2 },
      // how far each bend moves from the split the layers asked for (0) to the anatomical one (1): a twist mostly,
      // since clips and layers put a lot of twist in the lumbar joint, which barely turns
      blend: { flex: 0.5, lat: 0.5, twist: 0.8 },
      // a spine or neck angle that jumps by more than this in one step, beyond what its own motion explains (deg; an
      // acceleration past ~7,000 deg/s^2), glides to its new course instead (inertialization, this half-life in s)
      jumpDeg: 2,
      jumpHalfLifeS: 0.07,
      jumpCoolS: 0.025,             // after one, the next step's motion is learned before another is caught
    },

    // ---------------------------------------------------------------- head turning to a look target (Trial 2)
    // the head (with the neck and a little of the chest) turns toward what the player looks at through a short lag
    // and a critically damped spring: a 60 deg turn peaks near 280 deg/s and settles in ~0.35 s (head turns to a new
    // target: ~200-400 deg/s peak); a moving target is followed ~0.15 s behind. Trial 13 builds the full gaze on it
    look: {
      maxRad: 1.35,                 // furthest the head, neck and chest turn from the body's facing (~77 deg)
      softRad: 0.25,                // eased into that end over its last ~14 deg
      leadS: 0.03,                  // lag on the wanted turn (s): the turn starts with no jolt
      omega: 14,                    // spring rate (1/s)
    },

    // ---------------------------------------------------------------- planted hip guard (Trial 2)
    // a planted leg whose hip would pass its range (the body has moved on over a foot that stays put) moves the pelvis
    // toward that foot instead (the weight shifts over it) until it is back in range; the shift eases away after
    // (and a planted ankle inside its weight-bearing range: the heel comes up or down about the ball of the foot)
    hipGuard: {
      iterations: 12,
      marginDeg: 1.5,               // aim this far inside the limit
      gain: 1.15,                   // shift per radian of excess, per foot of hip height over the ankle (over-relaxed)
      maxShiftH: 0.3,               // most the pelvis moves this way (heights)...
      shiftFtps: 10,                // ...and no faster than this (ft/s; past it the foot steps)
      releaseS: 0.12,               // half-life of the shift easing away once it is not needed (s)
      reachHeelDeg: 30,             // a planted leg short of its foot raises the heel up to this, then lowers the pelvis
      stepAtH: 0.06,                // held back further than this (heights, ~4.7 in), the foot steps now instead...
      forceStepAtH: 0.1,            // ...and past this even with the other foot still in the air (a quick skip)
      dropStrain: 2,                // a planted foot pulling the pelvis down this many times over counts as held back
                                    // (so it steps once the pelvis is ~0.03 H, ~2.3 in, lower than its pose to reach it)
      maxDropH: 0.05,               // most the guard lowers the pelvis for a foot out of reach (heights)
      missFt: 0.035,                // a planted ankle this far off its spot (~0.4 in) after all that steps now
    },

    // ---------------------------------------------------------------- the weight (Trial 4)
    // The body moves as a mass: its push (acceleration) builds up at a human rate of force development instead of
    // switching on in one step, braking is stronger than pushing off, the facing turns with an angular acceleration,
    // and a bigger, heavier body pushes and turns less for its size (ratings still set the base values)
    weight: {
      refLb: 215, refHeightFt: 6.5, // the reference body the ratings describe
      massExp: -1 / 3,              // push per pound ~ m^-1/3 (leg force grows with muscle cross-section, ~m^2/3)
      decelRatio: 1.35,             // braking / pushing off (team-sport tracking: maximal decelerations beat accelerations;
                                    // ~6.5-10 m/s^2 at the top, from a 16-24 ft/s^2 first-step push)
      velGain: 12,                  // within a few ft/s of the velocity wanted the push is in proportion (1/s)
      jerkFtps3: 320,               // how fast a push builds (ft/s^3): a full push in ~0.06 s...
      brakeJerkFtps3: 480,          // ...and a brake (a plant is quicker than a push-off)
      turnAccel: 70,                // the facing's angular acceleration for the reference body (rad/s^2)...
      turnHeightExp: -1,            // ...times (H / ref)^-1 and the mass factor (inertia ~ m H^2, torque ~ m^2/3 H)
      clipTurnK: 1.6,               // moves (clips) turn this much quicker (their turns are authored)...
      turnAccelMax: 150,            // ...but no body's facing ever speeds up or slows down its turn faster than this (rad/s^2)
      clipAccelMax: 55,             // a body follows a move's root motion exactly while that takes no more push than
      clipCatchUp: 6,               // this (ft/s^2), and catches up what it lost at this rate (1/s)
      clipWarpS: 0.3,               // a move whose root leaves faster than the body is going (by clipWarpFtps) starts
      clipWarpFtps: 3,              // on a slow clock that comes up to speed over this long (s)
      hitPushS: 0.34,               // a bump knocks a body off its line over this long (s)
      // two bodies touching push apart through their velocities: stiffness (1/s^2 per ft of overlap), damping of the
      // closing speed (1/s), and no harder than this (ft/s^2)
      contactK: 300, contactC: 25, contactMaxFtps2: 40,
      totalAccelMax: 55,            // a body's own push and a contact's together never pass this (ft/s^2, ~1.7 g)
      airPushK: 0.35,               // running with both feet off the floor, a body pushes only this share (it steers on
                                    // its plants)...
      airBrakeLatK: 1,              // ...braking there, the push across it this share (the braking goes on; less made a
                                    // cut drag over two or three strides, a 90 deg cut at 15 ft/s 0.15 s slower)...
      airSlackS: 0.04,              // ...but both feet off the floor this much longer than a step's own flight is a skip:
      skipPushK: 0.1,               // the body pushes only this share until a foot is down, braking or not
      // braking (pushing against the way he goes) harder than brakeFrom (ft/s^2), fully at brakeFrom + brakeSpan: the
      // steps quicken toward brakeSps (per s, a 6'6" player) and the hips drop brakeDropH (heights)
      brakeFrom: 8, brakeSpan: 16, brakeSps: 4.2, brakeDropH: 0.04,
      // cutting (pushing across the way he goes) harder than cutFrom, fully at cutFrom + cutSpan: the hips drop cutDropH
      cutFrom: 9, cutSpan: 14, cutDropH: 0.04,
      // a landing foot goes down this share of the lean geometry out against the push (ahead braking, outside a cut),
      // at most footLeadMaxH (heights)
      footLead: 0.35, footLeadMaxH: 0.12,
      leadFreezeSw: 0.4,            // the landing offset is set until this far through the swing, then held over the next 0.3
      insidePushK: 0.3,             // running, the push across off the inside foot alone is this share (a foot on the
                                    // inside of the turn cannot push the body into it: cuts go off the outside plant)...
      plantPushK: 1.4,              // ...off a foot outside, this much more (the cut's force goes down through the plant;
                                    // in the air a push across cannot start or grow)...
      plantFullH: 0.04,             // ...graded by how far out the foot is on the side the push comes from, fully this far
                                    // (heights): a foot under the body gives no push across
      slideDropFrom: 5, slideDropSpan: 3, // a sideways slide drops the hips only from this speed, fully this much faster (ft/s):
                                    // a defender's slide is low already and its quick reversals do not pump the hips
      dropHoldS: 0.2,               // the hips stay down this long after the push peaks (through a stride's flight)...
      dropRiseS: 0.35,              // ...then a full drop comes back up over no less than this
      rideS: 0.4,                   // the level the hips ride at (a brake or cut drops them below it) follows over this
      rideDownS: 0.15,              // ...and during a push past rideDownH (heights of drop), only down, over this (s): a
      rideDownH: 0.01,              // slow slide's small pushes lowered it, and its shuffle steps with it
      rideBlendH: 0.02,             // ...the legs carrying them higher are held down to it smoothly over this (heights)...
      rideInH: 0.015,               // ...fully once the drop is this deep (heights)
      poseHalfLifeS: 0.1,           // how fast the braking and cutting shape (hips, step rate, where the feet land) follows
      hardShare: 0.3,               // past this share of the touching distance a torso is pushed out hard, before all else:
      hardK: 400,                   // ...ft/s^2 per ft of that depth...
      hardC: 30,                    // ...plus per ft/s still closing (a body in a move gives way at its origin instead)
      yieldFt: 1.5,                 // a move (layup, dunk) closing on a man starts to give way this much further out...
      yieldDecay: 30,               // ...and the speed it gave way at dies away at this once clear (ft/s^2)
      avoidFt: 1.2,                 // two players closing on each other by accident ease off from this far apart...
      softFt: 0.2,                  // ...so they meet within this much give
      // players on a collision course steer round each other: looking this far ahead (s), passing this far clear of
      // touching (ft), at most this much sideways (ft/s)
      avoidAheadS: 1.2, passFt: 0.35, avoidMaxFtps: 8,
      leanFt: 0.25,                 // a body this far into another stops going on into him (it leans, slides)
      leanBrake: 22,                // a body closing on another brakes at this (ft/s^2) to meet him at no more than...
      meetFtps: 2.5, meetBallFtps: 4.5, // ...this (ft/s; a man with the ball going into a defender, this)
      // the pose's own pelvis height glides over a jump (a stance, stride or move switching it in one step): a change
      // past what its motion explains by more than hipJumpH (heights, per 60 Hz step) is taken out and eased back in
      // with this half-life (s)
      hipJumpH: 0.012, hipJumpS: 0.08,
      hipPoseFtps: 7,               // the pose's own pelvis height moves no faster than this (ft/s)...
      hipDropFtps: 9,               // ...and the pelvis never goes down faster than this, whatever takes it there (ft/s):
                                    // past it a leg's heel comes up, then its foot leaves the floor (a quick step)...
      hipDropMissFt: 0.015,         // ...as soon as its ankle is this far short of its spot (ft; a contact sliding past
                                    // Tune.debug.slideOkIn, 0.25 in, is a slide)
    },

    // ---------------------------------------------------------------- the gaits (Trial 5)
    gait: {
      // the arm keys are taken this much further round the cycle than the leg keys (cycles), so each arm swings with the
      // opposite leg as the feet really place it: walking, jogging, sprinting...
      armLeadWalk: 0.04, armLeadJog: 0.24, armLeadSprint: 0.31,
      armBackSlow: 0.54, armBackFast: 0.44, // ...and going backwards, this far round the reversed cycle at 6 ft/s and 12
      dirBlendS: 0.12,              // the slide's and the backpedal's stepping and pose follow the way he goes over this (s)
      aimFreezeS: 0.55,             // a quick step stops re-aiming at the moving body from this share of it on, fully at the
                                    // end, so it comes down with no speed left...
      strideAimFreezeSw: 0.75,      // ...and a stride's swing from this share of it on
      openUpRate: 5,                // a defender opening up out of a slide or backpedal turns no faster than this (rad/s)...
      slideMaxFtps: 12,             // ...and slides or backpedals no faster than this until his hips have come round (ft/s;
                                    // elite players peak ~11-12 ft/s over a 5 m shuffle)
      sprintLiftH: 0.28,            // a sprinting swing lifts the ankle this high (heights; at 0.32 the thigh went ~25 deg past
                                    // horizontal and, turned over at a sprint's ~4 steps/s, the knee popped mid-swing)
      warpMaxBeta: 0.44,            // a running gait's key poses are fitted to the real stance share only up to this much of
                                    // the cycle (its flight then keeps at least 0.06 of it)
      poseMixS: 0.07,               // the gait pose's mix of walk, jog and sprint follows the pace on a critically damped
                                    // spring with this half-life (s): a full change over ~0.25 s
      landPitchS: 0.025,            // a foot comes down at the pitch it had in the air (tipped toes-down by the ankle's range
                                    // under a deep knee bend, a slide's) and eases to the stride's landing pitch on a
                                    // critically damped spring with this time constant (s): ~90% in 0.1 s as the weight
                                    // comes on
      backLandDeg: 12,              // a backpedal's step comes down toes first with the heel this far up (deg)
      predictCycleS: 0.04,          // the stride time a landing spot is predicted with follows the cadence on a critically
                                    // damped spring with this time constant (s)
      foldMaxH: 0.06,               // a runner's heel kick brings the ankle in toward the hip's line by at most this (heights)
      clearS: 0.03,                 // how far a swinging foot goes round the planted one eases to what is needed on a
                                    // critically damped spring with this time constant (s)
      liftReachSw: 0.4,             // early in a swing the leg is no longer than it was at the lift, back to its full length
                                    // by this share of the swing
      landSwivelS: 0.03,            // a leg that has just landed keeps its knee turned about the hip-ankle line where it
                                    // was in the air and eases onto the planted leg's plane with this time constant (s)

    },

    // ---------------------------------------------------------------- the floor (Trial 3)
    floor: {
      // a planted foot turns only as a pivot: on the ball of the foot with the heel up (coaching: pivot on the ball;
      // a heel turned on the floor slides). The heel comes up over upS, the foot turns once the heel is at turnAtDeg
      // (clear of the floor), and the heel comes down over downS when the turn is done
      // (a moving body turning over a planted foot pivots it past gaitFreeDeg off its heading, standing past standFreeDeg)
      pivot: { pitchDeg: 14, turnAtDeg: 6, startDeg: 1.5, doneDeg: 0.4, upS: 0.07, downS: 0.1, gaitFreeDeg: 18, standFreeDeg: 14,
        accel: 300 },               // (the turn's angular acceleration, rad/s^2: a pivot reaches its top rate in ~0.05 s)
      // going forward, a landing foot points this much toward the way he is going rather than the way his hips face
      toesFollowTravel: 0.8,
      // how high a small step in a stance lifts the ankle (heights; ~4.3 in): in a deep stance the foot hangs toes down
      // from its ankle, and at 0.035 its toes cleared the floor by ~1 in
      stanceStepLiftH: 0.055,
      minStanceS: 0.08,             // a foot that has just landed stays down at least this long before it steps again...
      hardMinStanceS: 0.05,         // ...and, even run away from, this long (3 steps of the clock)
      minSwingS: 0.15,              // a stride swing shorter than this (a lift late in the stride) is a quick step instead
      landSettleH: 0.04,            // a stride's landing is aimed within the leg's reach with the pelvis this much lower
      slideLiftH: 0.045,            // a slow slide's shuffle step lifts the ankle this high (heights)...
      backLiftCut: 0.35,            // ...and a backpedal's step lifts this much less than a forward one (0.45 scraped)
      pelvisUpHz: 8,                // a pelvis let go by the leg that held it down comes back up on this spring (Hz)...
      pelvisUpFtps: 2.5,            // ...never faster than this (a running body's centre of mass rises at ~1.5-3 ft/s)
      toeBendMaxDeg: 60,            // toes brushing the floor bend up at the ball this far at most (MTP extension ~70, AAOS)
      liftAnkleMarginDeg: 2,        // a stride's foot leaves the floor with its ankle this far inside its unloaded range
      heelRiseDegps: 300,           // a planted heel comes up for the leg's reach no faster than this (deg/s)...
      heelDropDegps: 200,           // ...and back down no faster than this
      airGuardSw: 0.25,             // a leg in the air is held with its knee over its own line from this far into a swing...
      airGuideK: 0,                 // ...this much (0 to 1). Off since Trial 5: the pole solve keeps a sprinter's knee within
                                    // 2.7 in of the hip-ankle line without it, and it held a slide's wide leg ~38 deg in over
                                    // 3 frames after lift-off and let go of it at contact, the knee popping both times
      toeTipDegps: 600,             // a foot that left the floor flat tips toes-down no faster than this (deg/s; an ankle
                                    // plantarflexes ~300-400 deg/s at a walking toe-off, faster running)
      swingFixReleaseS: 0.06,       // a swinging foot lifted clear of the floor eases back onto its own path (half-life, s)
      swingPullFtps: 6,             // a swinging foot out of reach is pulled in toward the hip no faster than this (ft/s)
      swingFixIters: 8,             // tries at lifting a swinging foot clear of the floor in one step...
      swingFixGain: 1.5,            // ...each lifting it this many times its depth
    },

    // ---------------------------------------------------------------- body segment masses (center of mass)
    // Dempster via Winter (Biomechanics and Motor Control of Human Movement, 4th ed., table 4.1): fraction of body
    // mass and centre of mass position from the proximal end, per segment [from joint, to joint, mass, com]
    segMass: [
      ['HC', 'NCK', 0.081, 0.5],        // head and neck (centre between the neck base and the head centre)
      ['NCK', 'PEL', 0.497, 0.5],       // trunk
      ['L_SH', 'L_EL', 0.028, 0.436], ['R_SH', 'R_EL', 0.028, 0.436],
      ['L_EL', 'L_WR', 0.016, 0.43], ['R_EL', 'R_WR', 0.016, 0.43],
      ['L_WR', 'L_HD', 0.006, 0.506], ['R_WR', 'R_HD', 0.006, 0.506],
      ['L_HIP', 'L_KN', 0.1, 0.433], ['R_HIP', 'R_KN', 0.1, 0.433],
      ['L_KN', 'L_AN', 0.0465, 0.433], ['R_KN', 'R_AN', 0.0465, 0.433],
      ['L_HEEL', 'L_TOE', 0.0145, 0.5], ['R_HEEL', 'R_TOE', 0.0145, 0.5],
    ],
  };

  /** read a value by path ('debug.slideOkIn'), with a fallback */
  Tune.get = function (path, fallback) {
    let o = Tune;
    for (const k of String(path).split('.')) { if (o == null || !(k in o)) return fallback; o = o[k]; }
    return o;
  };

  M.Tune = Object.assign(M.Tune || {}, Tune);
})();
