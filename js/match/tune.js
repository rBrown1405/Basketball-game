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
      maxShiftH: 0.3,               // most the pelvis moves this way (heights)
      releaseS: 0.12,               // half-life of the shift easing away once it is not needed (s)
      reachHeelDeg: 30,             // a planted leg short of its foot raises the heel up to this, then lowers the pelvis
      stepAtH: 0.06,                // held back further than this (heights, ~4.7 in), the foot steps now instead...
      forceStepAtH: 0.1,            // ...and past this even with the other foot still in the air (a quick skip)
      dropStrain: 2,                // a planted foot pulling the pelvis down this many times over counts as held back
                                    // (so it steps once the pelvis is ~0.03 H, ~2.3 in, lower than its pose to reach it)
      maxDropH: 0.05,               // most the guard lowers the pelvis for a foot out of reach (heights)
      missFt: 0.035,                // a planted ankle this far off its spot (~0.4 in) after all that steps now
    },

    // ---------------------------------------------------------------- the floor (Trial 3)
    floor: {
      // a planted foot turns only as a pivot: on the ball of the foot with the heel up (coaching: pivot on the ball;
      // a heel turned on the floor slides). The heel comes up over upS, the foot turns once the heel is at turnAtDeg
      // (clear of the floor), and the heel comes down over downS when the turn is done
      // (a moving body turning over a planted foot pivots it past gaitFreeDeg off its heading, standing past standFreeDeg)
      pivot: { pitchDeg: 14, turnAtDeg: 6, startDeg: 1.5, doneDeg: 0.4, upS: 0.07, downS: 0.1, gaitFreeDeg: 18, standFreeDeg: 14 },
      // going forward, a landing foot points this much toward the way he is going rather than the way his hips face
      toesFollowTravel: 0.8,
      // how high a small step in a stance lifts the ankle (heights; ~4.3 in): in a deep stance the foot hangs toes down
      // from its ankle, and at 0.035 its toes cleared the floor by ~1 in
      stanceStepLiftH: 0.055,
      minStanceS: 0.08,             // a foot that has just landed stays down at least this long before it steps again...
      hardMinStanceS: 0.05,         // ...and, even run away from, this long (3 steps of the clock)
      minSwingS: 0.15,              // a stride swing shorter than this (a lift late in the stride) is a quick step instead
      landSettleH: 0.04,            // a stride's landing is aimed within the leg's reach with the pelvis this much lower
      pelvisUpHz: 8,                // a pelvis let go by the leg that held it down comes back up on this spring (Hz)...
      pelvisUpFtps: 2.5,            // ...never faster than this (a running body's centre of mass rises at ~1.5-3 ft/s)
      toeBendMaxDeg: 60,            // toes brushing the floor bend up at the ball this far at most (MTP extension ~70, AAOS)
      swingFixReleaseS: 0.06,       // a swinging foot lifted clear of the floor eases back onto its own path (half-life, s)
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
