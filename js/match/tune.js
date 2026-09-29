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
      gaitSyncArmDeg: 4, gaitSyncLegDeg: 5, // the arms are in or out of step with the legs only where the shoulders' flexion
                                    // split swings more than this either way over a stride and the hips' more than this
                                    // (deg): the arm forward should be the one opposite the thigh forward...
      gaitSyncArmK: 0.5,            // ...only where the gait swings the arms at least this much (a stance's arms held up
                                    // or out, a defender's, take 0.1 to 0.3 of the swing)...
      gaitSyncBand: 0.25,           // ...and with both past this share of their swing's half-range from its middle
      // the handle (Trial 8): a dribble contact frame is off when the hand is further than this from the ball's surface,
      // either way (in; ~1 pixel of a player in a broadcast view), and the ball is through a body past this depth (in)
      handleGapIn: 0.25, ballBodyTolIn: 0.25,
      // body segments as capsules round the skeleton's lines, radius as a share of the height (trunk, head, thigh, shank,
      // foot, upper arm, forearm, hand; a 6'6" athlete's thigh ~55 cm round, calf ~38, upper arm ~35, forearm ~29)
      bodyR: { trunk: 0.063, head: 0.055, thigh: 0.044, shank: 0.032, foot: 0.02, upperArm: 0.028, forearm: 0.022, hand: 0.008 },
      handleNearFt: 4.5,            // a defender this close to the ball is on it (pressure, the off arm up)...
      handleOpenFt: 9,              // ...and none this close is open
      handleSyncS: 0.067,           // a moving dribble's bounce within this of the inside foot landing is in rhythm (s)
      handleEyeDeg: 20,             // a dribbler whose face points within this of the ball is looking at it (deg)
      airJoltFtps2: 150,            // a dribbled ball in the air speeding up across the floor more than this was shoved (ft/s^2;
                                    // a 0.5 in step in one frame's motion at 60 fps)
      // the pass and the catch (Trial 10): a receiver's hands are set once both palms are within passSetFt of where they
      // catch the ball (about the body's centre, in the world's axes) and stay there, the eyes on it within passEyeDeg; a
      // flight is bent when the
      // ball is more than passBentIn off its own ballistic path; the ball stops dead at a catch (a teleport, no absorb) when
      // it slows faster than passStopFtps2 in a frame, and a catch is watched this long after (passAfterS)
      passSetFt: 0.5, passEyeDeg: 30, passBentIn: 1, passStopFtps2: 1500, passAfterS: 0.3,
      // the shot (Trial 9): the set is read shotSetLeadS before the release; the follow-through is held while the shooting
      // arm is raised past shotHoldShFDeg (0 hanging, 180 straight up), the elbow within shotHoldElFDeg of straight and the
      // fingers pointing forward over the wrist past shotHoldWrFDeg (the gooseneck; 0 straight up), from the wrist's snap
      // within shotSnapS of the release; the
      // landing is watched shotLandS; a take-off is off two feet when both leave the floor within shotTwoFootS of each other;
      // a dunker's hand is on the rim within shotRimHandFt of its spot
      shotSetLeadS: 0.1, shotSnapS: 0.25, shotHoldShFDeg: 110, shotHoldElFDeg: 35, shotHoldWrFDeg: 20, shotLandS: 0.35, shotTwoFootS: 0.07, shotRimHandFt: 0.5,
      // ...and a jump shot has its phases when the ball dips shotDipMinIn and the hips shotDipHipMinIn within shotDipSyncS of
      // each other, the ball rises shotRiseMinIn to the release, the release comes between shotApexBeforeS before and
      // shotApexAfterS after the top of the jump, the follow-through is held shotHoldMinS and the knees give shotLandMinDeg
      // on landing; a finish drives the free knee past shotKneeDriveDeg
      shotDipMinIn: 2, shotDipHipMinIn: 1, shotDipSyncS: 0.12, shotRiseMinIn: 12, shotApexBeforeS: 0.15, shotApexAfterS: 0.04,
      shotHoldMinS: 0.35, shotLandMinDeg: 5, shotKneeDriveDeg: 60,
      // ...and a catch-and-shoot is let go shotCnsMinS to shotCnsMaxS after the catch (NBA: ~0.5-0.8 s)
      shotCnsMinS: 0.5, shotCnsMaxS: 0.8,
      // the glass and the contest (Trial 11): a flight is steered when the ball is more than glBendIn off its own ballistic path;
      // a take (a carom or a loose ball into someone's hands) is two-handed with both palms within glTakeGapIn of the ball as
      // it is taken, pulled with neither (the ball flies the rest of the way into the hold), in the air above glFloorFt with no
      // bounce on the way (else off the floor); timed when within glApexS of the top of a jump of glJumpMinFt or more; read off the rim when the run to
      // it sets off (closing at glApproachFtps until within glArriveFt) glReadS or more after the ball comes off the rim, the
      // glass or the blocker's hand, or no more than glPreCloseFt was closed on it before; others within glNearFt of the take
      // as it comes off are watched too; the ball is chinned when its top is within glChinFt of the chin and glChinFrontFt of
      // the neck with the elbows glElbowSpan x the shoulders apart, within glChinByS of the take (watched glAfterS); a box-out
      // finds a man within glBoxManFt and is in contact within glBoxGapFt of him, him within glBoxBehindDeg of straight behind,
      // a wide base glBoxBaseX x the shoulders; a contest (the nearest man within glContestFt at the release: NBA tracking's
      // tight and contested) reaches toward the ball within glContestDeg, at the release or over the ball's first glContestAfterS
      // in the air (a late one); a block's hand is on the ball within glBlockGapIn; a swipe at the ball (the swiper within
      // glSwipeAtFt of it as the swipe starts) goes to it when its hand comes within glSwipeFt
      glBendIn: 1, glTakeGapIn: 3, glFloorFt: 1.2, glApexS: 0.1, glJumpMinFt: 0.25, glReadS: 0.1, glPreCloseFt: 2,
      glArriveFt: 1.5, glApproachFtps: 4, glNearFt: 10, glChinFt: 0.3, glChinFrontFt: 1.2, glElbowSpan: 1.3, glChinByS: 0.45, glAfterS: 0.9,
      glBoxManFt: 6, glBoxGapFt: 0.15, glBoxBehindDeg: 50, glBoxBaseX: 1.3, glBoxLeftFt: 3, glContestFt: 6, glContestDeg: 25, glContestAfterS: 0.2, glBlockGapIn: 2, glSwipeAtFt: 10, glSwipeFt: 0.5,
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
      // an arm part way onto its IK target (Trial 10): the wrist goes from the animated arm's wrist to the target in a
      // straight line, or round the shoulder where that line passes nearer the shoulder than armBlendFarK of the shorter
      // reach (all of the way round nearer than armBlendNearK)
      armBlendNearK: 0.45, armBlendFarK: 0.65,
      // ...and round it, too, for an arm letting go between two wrists both further out than armBlendLongK of the arm's full
      // reach (all of the way round from 0.1 more), where the straight line passes inside the reach and bends the elbow
      armBlendLongK: 0.8,
      // an arm solved toward its animated elbow, the animated arm bent less than this (deg): the elbow goes the way the animated
      // one would bulge, square to its hinge (Trial 9: nearly straight, the side the animated elbow gave flipped through a
      // jump shot's push, and the hand turned over with it)
      armStraightDeg: 25,
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
      // a target with a height (the ball in the air): the head tips up or down to it through the neck and head, from
      // where the face points in the pose, this share of the way, as far as maxPitchRad, on the same spring (Trial 10:
      // level, the eyes lost a ball coming in low or high over its last few feet)
      pitchK: 1, maxPitchRad: 0.75,
    },

    // ---------------------------------------------------------------- the pass and the catch (Trial 10)
    // (coaching: show a target with both hands up in front of the chest, fingers up and thumbs together; meet the pass,
    // stepping to it; look it into the hands; soft hands: the elbows give and bring it into the chest)
    pass: {
      catchFwdH: 0.3,               // the hands meet the ball this far out in front of the body (H): the arms out...
      catchReachH: 0.36,            // (and wait for it in the air no further out than this, H)
      catchZH: 0.72,                // ...at chest height (H); a bounce pass is taken lower, a lob higher:
      catchZBounceH: 0.5, catchZLobH: 0.98,
      targetS: 0.22,                // once the pass is coming the hands come up as a target over this long (s)...
      targetW: 0.75,                // ...this far (the arms' IK weight; the rest of the arm keeps the stance's shape)
      setBeforeS: 0.22,             // with the ball in the air they are where they will catch it this long before it
      fullS: 0.12,                  // arrives (s), all the way out within fullS of its release (s)...
      catchSideDeg: 50,             // running on through the catch, a ball from behind is taken out to the side, no further
      runOnFtps: 6,                 // round than this from the run (deg); a runner: faster than runOnFtps (ft/s)
      holdSideDeg: 100,             // the hands waiting for it never further round than this from the way the body faces
                                    // (deg; with the chest turned toward it, Tune.pass.chestTurnDeg)
      targetSideDeg: 60,            // ...and shown as a target before it is thrown no further round than this (deg)
      faceBallDeg: 60,              // not running on through it, the body turns toward a pass in the air to him, never further
      faceBallRunDeg: 90,           // round from the way to the passer than this (deg), faceBallRunDeg faster than runOnFtps
      sideJumpDeg: 25,              // the way to the passer changing more than this in a step (deg: behind a turning man, from
      sideDps: 480, sideDps2: 3000, // one side to the other) the target hands swing across the front, at most this fast (deg/s,
                                    // deg/s^2); switched at once, they jumped ~4 ft in a frame
      meetS: 0.12,                  // ...and over the last this-long (s) go onto the ball's own path, where it really comes
      // variations (Trial 10), for a passer with the flair: his handle from flairFrom (none) to flairTo (all of it)
      flairFrom: 60, flairTo: 95,
      btbP: 0.3,                    // behind the back to a man on his left (70 to 160 deg round), at most this often
      whipP: 0.25, whipKickP: 0.2,  // a one-handed whip out to a man on his right (40 to 120 deg): kicks this much more often
      noLookP: 0.12,                // a no-look pass
      fakeP: 0.12,                  // a pass fake first (x 0.5 to 1.5 with the flair), when there is time
      fakeBiteFt: 1.2,              // the defenders nearest where it is faked to jump this far toward the lane
      runThroughFtps: 14,           // a receiver who has to run to the catch spot faster than this (ft/s) runs on through it,
      runThroughS: 0.6,             // this long past it (s), and takes it on the run instead of stopping and turning there
      holdFt: 2,                    // with the ball in the air to him a receiver takes no order to go further than this from
                                    // where it was thrown to him (ft): it waits for the catch
      catchBodyS: 0.06,             // sent somewhere else after the pass was planned (his goal moved more than catchReplanFt,
      catchReplanFt: 0.3,           // ft), where the body will be at the catch is taken again each step and eased onto over
                                    // about catchBodyS (s, the time constant)
      chestTurnDeg: 35,             // a ball from the side: the chest turns toward it as far as this (deg)
      meetStepFt: 0.9,              // standing, a step toward the ball as it comes (ft), from the moment it leaves the
      meetEarlyS: 0.08,             // passer's hands, down this long before it arrives (s), for a pass in the air at least
      minFlightS: 0.34,             // minFlightS (s)
      meetLowK: 0.75,               // stepping in to meet it he stays down in his stance: the walk's torso takes this much
                                    // less of it (a walk at a meet step's pace stood him up ~0.3 ft, the shoulders back,
                                    // and the hands held at the catch point tipped down ~40 deg as the ball came)
      meetLowS: 0.12,               // ...eased in and out over about this long (s, the time constant)
      pushS: 0.07,                  // the throw: the arms bring the ball up to its launch speed over this long before the
                                    // release (s), the pass planned as the push starts (a pass clip's own push event first)
      stepFt: 0.9,                  // standing, the passer steps this far toward the target as the arms extend (ft), for
      stepKinds: { chest: 1, bounce: 1, overhead: 1, entry: 1, swing: 1, outlet: 1, lob: 1 }, // these kinds
      catchKeep: 0.5,               // the catch: the ball keeps this share of its speed into the hands as it hits them (they
      catchKeepAway: 0.15,          // take up the rest and give with it); going on away from the chest (caught on the run
                                    // from behind), this share...
      absorbOmega: 18,              // ...and goes on into the chest on a critically damped spring at least this
                                    // quick (1/s); quicker as it comes in faster, so it never goes on past the hold
      absorbMaxOmega: 60,
      absorbClipOmega: 32,          // ...and a throw or a move started out of it takes up what is left at least this quick
      afterS: 0.2,                  // after the catch the hands' catching shape gives way to the hold over this long (s)
      secureS: 0.18,                // a dribble asked for as a pass is caught starts this long after the catch (s), from the
                                    // hold the catch gave into (next frame, the first push missed the ball in half the
                                    // catches on the move)
      eyeLeadS: 0.15,               // the eyes on the ball this far ahead along its flight (s): the head's own spring lags
                                    // about as much
    },

    // ---------------------------------------------------------------- the shot (Trial 9)
    // Every jump shot (one and two motion, the pull-up, the step-back, the fadeaway) and the free throw is built from these
    // phases (clips.js, M.Anims.shotClip), at the shooter's own speed 1 (s) and depths (H: the body's height). NBA and
    // coaching references: catch-and-shoot releases ~0.5-0.8 s after the catch (league average ~0.54 s); the ball and the
    // knees dip together; the ball is released just before the top of the jump (elite shooters ~0.06 s before it); the
    // follow-through is held until the ball gets to the rim; a longer shot carries the body a little further forward.
    shot: {
      gatherS: 0.03,                // the ball into the pocket before the dip starts
      dipS: 0.13,                   // down into the dip: the ball and the knees go down together...
      dipBallH: 0.09,               // ...the ball this far below the pocket (H), the hips dipHipH, the knees to dipKneeDeg
      dipHipH: 0.07, dipKneeDeg: 70,
      riseS: 0.24,                  // the bottom of the dip to the take-off: the legs extend, the ball comes up the shot's line
      pushS: 0.06,                  // the release: the push this long before it, the set point setS before the push...
      setS: 0.08,
      relApexS: 0.06,               // ...and the release this long before the top of the jump
      snapS: 0.06,                  // the wrist's snap into the gooseneck after the release
      reachK: 0.97,                 // from the set on the ball's keys stay within this share of the arm's length from the
                                    // shoulder (the elbow ~25 deg short of straight at a key, the curve between reaching
                                    // ~0.99: straight, its side of the line was lost)
      jumpH: 0.13,                  // the jump (H, before the player's spring and form); its airtime from real gravity (sqrt(8 h / g))
      holdS: 0.6,                   // the follow-through held this long after the release (the gooseneck, the guide hand up)...
      relaxS: 0.2, downS: 0.15,     // ...then the arms relax and come down together
      landS: 0.1,                   // the landing: the knees give to landKneeDeg and the hips drop landHipH over landS, and
      landKneeDeg: 44, landHipH: 0.05, // come back up over landUpS
      landUpS: 0.25,
      driftFt: 0.35,                // the landing this much further toward the rim than the take-off (ft)
      noStepBeforeJumpS: 0.2,       // no foot squares up under the body this close before a jump's take-off (s): the legs push off
      gatherBallWaitS: 0.4,         // a layup or dunk off the dribble picks the ball up as it comes up into the hand with the zero-step
                                    // foot down, waiting up to this long (s, a bounce) for it (twice that, through a dribble move or a
                                    // foot in the air)...
      gatherFootWaitS: 0.2,         // ...and up to this long (s) more to gather it with the foot that stays down (the zero step)
                                    // on the floor: the two steps after it are then the right two
      zeroLandFtps: 4,              // slower than this (ft/s, a walk), a zero-step foot still in a gait swing is brought down before
      zeroLandS: 0.1,               // the gather in a quick short step this long (s)
      zeroHoldS: 0.35,              // a foot planted at the gather is not squared up under the body when its own step in the move
                                    // comes within this long (clip s): it stays down until that step
      pullGatherS: 0.25,            // a jumper off the dribble asks for the ball into the hands this long before its move (s)
      noMoveBeforeShotS: 1.6,       // the handler starts no dribble move (crossover, between the legs...) this close before the
                                    // handler's own shot (s before the release)
      jumpSlipFt: 2.5,              // a jump shot waits for its shooter to get within this of where it starts (ft)...
      jumpWaitS: 1.5,               // ...this long at most (s) past its planned start
      dunkReachH: 1.24,             // a dunk only for a player whose reach (this x height, the arm up) plus the dunk's own jump comes
                                    // to this (ft, each dunk's own: set from where the Lab's dunks first get a hand on the rim, for
                                    // heights 6-0 to 6-9 and springs 40 to 95); anyone shorter lays it up
      dunkRimFt: { dunk: 10.6, dunk2: 10.5, putbackDunk: 9.95 },
      pullUpFromFt: 6,              // a jumper the shooter takes off the dribble from further than this off its spot is a pull-up (ft),
                                    // and so is any jump shot started straight out of a dribble
      cnsHoldS: 0.1,                // a catch-and-shoot holds the ball at most this much longer than the shot itself needs (s)
      // two-motion (the ball set over the forehead while the legs are still loaded, then the legs drive): its deeper dip
      // and the set, then the drive to the take-off; its release nearer the top of the jump
      dip2S: 0.13, set2S: 0.3, drive2S: 0.14, relApex2S: 0.03,
      // a player's own form (M.Anims.shotForm), drawn once per player from these ranges (a better shooter toward the quicker,
      // higher, cleaner end): the speed, the release and set heights (H, + higher), the elbow out from the shot's line (deg),
      // the jump and the dip (x), the follow-through held (s), the release before the top of the jump (s), the drift (x),
      // the lean back in the air (deg); some kick a leg out on the way up (kickP), some shoot in two motions (a quarter of
      // the players, half of those 6-8 and up)
      form: {
        speed: [0.92, 1.08], relH: [-0.03, 0.025], setH: [-0.03, 0.02], flareDeg: [0, 12], jump: [0.8, 1.2], dip: [0.8, 1.3],
        holdS: [0.4, 0.95], relApexS: [0.03, 0.09], drift: [0.5, 1.6], lean: [0, 4], kickP: 0.12, twoMotionP: 0.25, twoMotionBigP: 0.5,
      },
      // a contested shot (the contest 0-1: open, contested, tight): released higher (H) and quicker (x speed), a higher jump
      // (x), leaning away from the contest (deg) and a little earlier before the top of the jump (s)
      contestRelH: 0.02, contestSpeed: 1.08, contestJump: 1.1, contestLeanDeg: 6, contestApexS: 0.02,
      // the free throw: a shallower dip (x the jumper's), no jump (up onto the toes), the follow-through held longer (+ s)
      ftDip: 0.6, ftHoldS: 0.25,
      // ...and the routine before it (M.Anims.ftRoutine): the official's bounce pass comes ftCatchS before the routine starts;
      // each player dribbles 0-4 times (the shares of each count, dribbleP) at their own pace (s a bounce), some spin the ball
      // in their hands (spinP, ftSpinS), most take a deep breath (breathP, ftBreathS), then the set (ftSetS) and the shot
      ftRoutine: { dribbleP: [0.1, 0.25, 0.35, 0.2, 0.1], periodS: [0.55, 0.72], spinP: 0.4, breathP: 0.75 },
      ftCatchS: 0.75, ftSpinS: 0.45, ftBreathS: 1.0, ftSetS: 0.35, ftSpinRps: 2.5,
    },

    // ---------------------------------------------------------------- the glass and the contest (Trial 11)
    // A missed shot's carom is the ball's own flight: settled as it comes off the rim or the glass, never steered after.
    // Nobody goes for it until they have seen it come off (a visual reaction); then the rebounder runs to where it will come
    // down to his hands and jumps so that they meet it at the top of the jump, two hands on the ball, and brings it down
    // under his chin with the elbows out. The box-outs hold until then.
    glass: {
      readS: 0.18,                  // the players near a carom set off after it this long after it comes off (s; a visual
                                    // reaction to a moving ball, ~0.15-0.3 s)
      // the carom, settled as it hits: of the natural ones (off within coneDeg of the way it was going to go, a distance round
      // the natural mean for the shot's distance, 1/distK x to distK x), the one the rebounder can get to, as near the natural
      // as can be
      coneDeg: 70, distK: 2.2,
      caromT: [0.45, 0.03, 0.9, 0.08], // its time from the rim to the take: between [0] + [1] x its distance (ft) and [2] + [3] x (s)
      caromSpeedK: [0.2, 0.75],     // its speed off the rim between these shares of the speed the shot came in with, and no
      caromUpFt: 5,                 // higher than this over where it came off
      longFt: 9,                    // a carom this far from the rim is a long one: run to it and caught on the way down
      longTakeH: 0.72,              // ...at the chest (heights; the catch clip's ball)
      highFt: 7,                    // a carom nearer than this with a man of the other side within contestFt of it is taken at
      contestFt: 7,                 // the top of a full jump, two hands high; the rest with a smaller one (midJumpFt)
      midJumpFt: 0.6,
      runK: 0.8,                    // after it: a run at this share of top speed (braking first what he has going the other
      runStartS: 0.1,               // way), its first runStartS to get going...
      travelFt: 4,                  // ...and up to this far in the jump itself (a running jump: the push off the floor over
      pushS: 0.15,                  // the last pushS of the load, then carried in the air)
      reachS: 0.25,                 // the hands go onto the ball over reachS, all the way on reachEarlyS before it is taken
      reachEarlyS: 0.08,            // (the arms ease onto a target over ~0.1 s)...
      takeGapIn: 3,                 // ...and it is taken as both palms are within this of it (in), up to takeLateS late; not
      takeLateS: 0.12,              // there by then, it goes on down and he runs it down off the floor
      catchLeadS: 0.2,              // a long rebound: at the spot this long before it comes down to the hands
      popFtps: 8,                   // a carom nobody can get to in the air pops this fast up off the rim and comes down to the floor
      catchLowFt: 1.2,              // run down off the floor: caught with both hands above this (and within catchReachFt, and his
      catchReachFt: 2,              // run), picked up off the floor below it
      // running a loose or bouncing ball down (pursuit, then arrival: Reynolds' steering behaviours): the soonest moment on
      // its way that it is at a height his hands take it and he can be stopped a reach short of it by then; caught with both
      // hands between gatherCatchLoH x his height (the catch's arms reach ~0.34 heights down in front) and chest height, or
      // picked up off the floor below gatherPickHiH x his height (the knee), stopped on the spot gatherPickStopK of the
      // pick-up's bend before the grab; taken as it goes along the floor no faster than gatherCatchFtps (caught: going away
      // from him, he goes with it) or gatherPickFtps (picked up). The plan holds while he is no more than gatherSlackS behind
      // it; the hands not on it gatherLateS after the take, a new one
      gatherCatchLoH: 0.38, gatherPickHiH: 0.3, gatherPickStopK: 0.5, gatherSlackS: 0.12, gatherLateS: 0.25,
      gatherCatchFtps: 12, gatherPickFtps: 12,
      gatherCutFtps: 0.5,           // a ball going along the floor faster than this is picked up cut off (from beside its way)
      gatherEarlyS: 0.3,            // a pick-up: on his spot and stopped this long before the bend
      gatherBrakeK: 0.45,           // planned stops brake at this much of his braking (the strides' flight between the plants)...
      gatherStopK: 0.5,             // ...and the run to the spot brakes at this much, stopping there (at full speed until then)
      // the box-out: boxFindS after the release each defender has found his man (the eyes on him) and steps into him, if he
      // is coming to the glass or within boxManRimFt of the rim and no further than boxReachFt away: his back into him between
      // him and the rim, the bodies touching (touchH x the two heights apart, the torsos' own depth, + boxGapFt), the eyes
      // going to the ball boxEyesS after; the man leans boxLeanFt into him. A defender whose man is getting back holds his
      // ground facing the rim
      boxFindS: 0.35, touchH: 0.068, boxGapFt: 0.02, boxLeanFt: 0, boxManRimFt: 14, boxReachFt: 9, boxEyesS: 0.3,
      boxSettleFt: 0.35,            // within this of his spot on the man he sits in it (the feet set wide) until the man moves him
      boxLetGoFt: 3,                // his man this much further from the rim than as the box-out began (gone back up the floor): let go
      boxMinS: 0.4,                 // a box-out takes this long to make: a shot off the rim sooner after he has found his man (a
                                    // layup's), or a blocked one, he turns to the ball instead
      // a contest: the hand nearer the ball up at it along the line from its shoulder (coaching: the high hand on the ball's
      // side, in the shooter's sight; NBA tracking counts a closest defender within ~4-6 ft), as far as contestReachK of the
      // arm reaches and contestGapFt short of the ball at most (the hand ~0.12 heights past the wrist), up over contestLeadS
      // before the release, held contestHoldS after, down over contestDownS
      contestReachK: 0.97, contestGapFt: 0.35, contestLeadS: 0.25, contestHoldS: 0.25, contestDownS: 0.45,
      lateContestFt: 6, lateLeadS: 0.12, // any other defender this close as it goes up gets a hand up at it over lateLeadS
      contestInS: 0.2,              // a contest's jump (or the wall at the rim) fades in over this (the arms coming up to it)
      wallLeadS: 0.36,              // the wall at the rim goes up this long before the release, both arms over it
      contestSwapS: 0.12,           // the ball gone from the shooter's hands, the hand goes from his release point onto where it went
      // a block: the blocker goes up in the shooter's face, blockFaceFt from him toward the rim (a running jump over what is
      // left of the way there), and the ball is hit where the shot's own way first comes blockInFt inside his reach (his
      // shoulders ~shoulderH x his height over the floor as he goes up, the reaching one ~shoulderInH heights nearer than the
      // body's middle, the arm and touchWristFt) between blockMinS and blockMaxS after the release (coaching: meet it just
      // after it leaves the hand), his hand onto it over blockReachS, the palm on its near side (the wrist touchWristFt off its
      // surface); it goes off the way the swat goes, within blockConeDeg of the way he faces, as fast as blockSpeedK x the shot
      blockFaceFt: 2.2, blockMinS: 0.04, blockMaxS: 0.3, blockInFt: 0.3, shoulderH: 0.82, shoulderInH: 0.1, touchWristFt: 0.3, blockReachS: 0.22,
      blockConeDeg: 60, blockSpeedK: 1.1,
      blockLateS: 0.6,              // not in his reach by blockMaxS: met further up its way while he is still up, this long at most
      releaseWaitS: 2.5,            // a contest or a block waits for the shot's own release up to this long past the plan
      // a steal: the swipe's hand on the ball's side onto the ball where it is; poked, it squirts off the hand the way the hand
      // was going at ~pokeFtps, and he runs it down (caught or picked up by hand), the man who lost it and the nearest of his
      // side within scrambleFt after it a reaction later; not his by chaseMaxS, it is his where it is
      pokeFtps: 8, scrambleFt: 12, chaseMaxS: 4,
      // a swipe (a poke steal, a reach-in) goes once the ball is within swipeFt of him along the floor (the arm and the lunge
      // onto the front foot), swipeWaitS after it was due at the latest
      swipeFt: 3.2, swipeWaitS: 1.5,
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
      shiftFtps: 10,                // ...and no faster than this (ft/s; past it the foot steps: 2.4 to 3.1 times a
                                    // player-minute in games. At 14 half as often with no more pops in games, but a
                                    // defender turning to run out of a backpedal jolted his pelvis 840 ft/s^2 in a frame and
                                    // his toes popped, and at 12 his knees; 12 seeds and the gait suites, Trial 5)
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

    // ---------------------------------------------------------------- the handle (Trial 8)
    handle: {
      solveIters: 3,                // the dribbling hand's wrist is solved for (damped Newton steps on that arm) up to this many
                                    // times a frame...
      solveTolFt: 0.004,            // ...until the palm is this close to its spot (ft, ~0.05 in)
      jacFt: 0.01,                  // the step of the finite differences for the palm's response to the wrist (ft)
      dampFt: 0.15,                 // the damping of the least squares step (a direction the palm cannot go gets a small step)
      stepMaxFt: 0.25,              // the most the wrist target moves in one step (ft)
      tanW: 0.3,                    // on the ball, the palm's miss across the ball's surface counts this much against its
                                    // miss off the surface (1): where the spot is out of reach it lands on the ball near it
      slideRadK: 0.08,               // (the palm's distance from the ball's centre gets to the dribble's in this share of the carry)
      aheadFt: 0.15,                // the ball stays this far ahead of the shoulder whose hand has it, or more (ft)...
      aheadSoftFt: 0.05,            // ...a smooth floor, this soft (ft)
      sideHz: 4,                    // the shoulders' turn toward the ball side goes over to the other side on a crossover on a
                                    // critically damped spring this quick (Hz)
      stayBehindFt: 0.25,           // a ball coming up to be caught further than this behind the dribbling shoulder (ft)...
      stayTwistPerFt: 40,           // ...turns the chest back toward it this much per foot past that (deg/ft)...
      stayTwistDeg: 35,             // ...up to this (deg)...
      stayHz: 3,                    // ...on a critically damped spring this quick (Hz), held through the push
      trunkYawK: 0.7,               // the dribble's frame turns with this share of the chest's own turn from the hips (the ball
                                    // goes with the shoulder dribbling it when the trunk leads a turn or squares up to a pass)
      upperOutS: 0.15,              // an upper-body clip about holding the ball (a catch, a pass not made) fades over this once
                                    // he dribbles (s)
      carryWristK: 0.15,            // out of the hands, the dribbling hand's wrist is back to the dribble's bend by this share
                                    // of the carry (its forearm dipped into the ball bending back slower)
      offLetGoK: 0.6,               // out of the hands, the other hand has let go of the ball by this share of the carry...
      offClearFt: 0.08,             // ...its palm this far off the ball's surface or more while it does (ft)
      carryWrF: -8,                 // carried out of the hands, the dribbling wrist is this bent back (deg) at first, then cocks
                                    // to the push's start as the carry ends
      carryFtps: 10,                // out of the hands the ball is first carried to where the push starts at about this speed
      carryMinS: 0.2, carryMaxS: 0.45, // (ft/s), in this long at least and at most (s): the body sinks into its stance meanwhile
      pushHFtps: 9,                 // the push carries the ball across the floor (from its start to the release, against the
                                    // body) no faster than this on average (ft/s)
      reachK: 0.9,                 // the push's end and the catch are planned within this share of the arm's straight reach
                                    // from its shoulder (the wrist bent at the release takes some of it)
      gripHz: 5,                    // a hold (plain, or a catch, a pick-up, a jab): the wrist bends after the flexion that puts
                                    // the fingers on the ball on a critically damped spring this fast (Hz), and back when it
                                    // lets go...
      gripPassHz: 20,               // ...and this fast through a pass's wind-up and push (Trial 10: at 5 Hz the bend lagged
                                    // the pass's own quick wrist motion and the palms stood ~3 in off the ball)
      gripStepDeg: 5,               // ...that flexion found along the wrist's range in steps this fine, then halved down
      gripRefDeg: -30,              // ...a new fit taking the one nearest this (deg, bent back as a hold's is), a fit going
                                    // on the one nearest where the wrist is, unless the other is no more than
      gripSplitDeg: 20,             // this much further from it (deg) and nearer gripRefDeg; and a fit on a root more than
      gripBandDeg: 50,              // this far from gripRefDeg (deg) goes over to the other root when that one is nearer it
                                    // (Trial 10: a receiver's hand fitted at a catch out to the side kept the wrist bent
                                    // ~60-80 deg forward, the fingers round the back of the ball and into the belly, the
                                    // arm swivelled out of the body and ~5 in off the ball)
      moveReachK: 0.9,              // a move from hand to hand: the receiving hand goes from where it was to the catch from
                                    // the move's push on, there by this share of the way to the catch (it has the dribble
                                    // from the release; the old hand lets go over the ball's flight)...
      moveActK: 0.35,               // ...its IK weight all there by this share of that way
      followS: 0.045,               // the old hand after a move's release goes on at its speed there, slowing with this time
                                    // constant (s: it covers speed x this), as its weight goes over the ball's flight
      followMaxFt: 0.3,             // ...carried on no further than this in all (ft): a hand stops a few inches past the release
      inoutInK: 0.3, inoutCatchK: 0.45, // an in and out bounces this share of the way out from the middle (the hips' line at 0)
                                    // and is taken back at this share, then ridden out (coaching: toward the middle as if
                                    // crossing over, the hand rolled round to the inside of the ball, pushed back out)
      inoutPeriodS: 0.4,            // ...its bounce this long (s)...
      inoutFakeDeg: 12,             // ...the shoulders turned toward the other hand up to this much, selling the crossover (deg)
      hesiTopH: 0.08,               // a hesitation's bounce comes up this much higher (H) into a hand riding it up...
      hesiPeriodS: 0.8,             // ...slower, this long (s: the hang, the body rising, eyes up)...
      // a move in a combo (Ball.dribbleCombo, one after another from hand to hand): its bounce this long (s); a crossover as
      // quick as one on its own (0.36), under the legs and behind the back a little longer, the ball going round the body
      // standing; one not listed (a hesitation, an in and out) as on its own
      comboPeriodS: { cross: 0.36, btl: 0.44, btb: 0.44 },
      burstLow: 0.55, burstK: 0.75, // ...and the bounce after it is this low (0 hip, 1 knee) and this much quicker: the burst
      behindCatchH: -0.04,          // behind the back and between the legs, the other hand takes the ball this far ahead of the
                                    // hips (H; behind them), beside the hip it comes up by
      clearSpotFt: 0.45,            // moving, the bounce and the catch spots move up to this (ft) to keep the ball's path clear
      clearMarginFt: 0.03,          // ...of his legs as they will be, by this much (ft) past touching...
      catchMoveFtps: 6,             // ...the catch spot moving no faster than this while the other hand goes to it (ft/s)
      avoidAheadS: 0.1,             // in the air, the ball eases round where his legs will be this far ahead (s)...
      avoidHz: 9,                   // ...on a critically damped spring this quick (Hz)...
      avoidAccel: 140,              // ...its acceleration across the floor no more than this (ft/s^2; under the 150 a 0.5 in
                                    // jolt in a frame reads as)
      hangMaxS: 0.3,                // moving, a move whose bounce its period cannot put on the footfall waits at the top with
                                    // the hand on the ball for the rest, up to this (s): a hesitation's hang
      retreatFt: 5, retreatFtps: 9, // a retreat dribble goes this far back (ft) this fast (ft/s): two or three dribbles...
      retreatTurnDeg: 55,           // ...turned this far side-on, the dribbling shoulder away from the man on him (deg)...
      retreatLow: 0.6,              // ...the ball this low (0 hip, 1 knee), beside the back knee
      fingSpread: 0.04, fingSnap: 0.24, fingRest: 0.1, // the dribbling fingers' curl (0 open, 1 fist): spread to take the
                                    // ball, snapped down through the push with the wrist, easing off after the release
      moveSyncK: 0.4,               // moving, a move's period is stretched or shortened by up to this share to put its bounce
                                    // on a footfall
      dribWS: 0.05,                 // a dribbling arm's IK weight moves at most a whole in this long (s; other arms 0.12 s)
      xfS: 0.14,                    // an arm changing task (a grip into the dribble, one grip to another) crossfades over
                                    // this (s); a hand going from a grip into the dribble slides over the ball in it
      softIk: 0.06,                 // soft IK on a dribbling arm: within this share of its length from straight the wrist comes on
                                    // ever slower (A. Nicholls), so a hand target past the reach eases the elbow straight, no snap
      // the dribble's rhythm: each cycle is solved at real gravity (the push and the ball's speed into the hand) to take
      // the period asked of it
      periodOpenS: 0.66,            // standing with nobody on him: ~1.5 bounces a second (measured control dribbling
                                    // 1.35 to 1.43)...
      periodPressedS: 0.42,         // ...and with a defender up on him, ~2.4 a second, and lower (the trial: 1.5 to 2.5)
      pressFarFt: 9, pressNearFt: 3.5, // pressure from the nearest man on the other team: none from the first, full at the
                                    // second (ft)
      pressLow: 0.5,                // how far down a fully pressured dribble goes (0 at the hip, 1 at the knee)
      pressS: 0.25,                 // the pressure eases in and out on a spring with this time constant (s)
      pressBackK: 0.7,              // fully pressured, not running, the ball this share of the protect pull back beside the hip...
      pressInK: 0.04,               // ...and in toward the body by this (H per unit of it): the control dribble
      vcMin: 2.5, vcMax: 16,        // the ball's speed into the hand at the catch, the range the timing is solved in (ft/s)
      vRelMin: 3,                   // the hand always pushes: the release speed never under this (ft/s)
      vcComfort: 10,                // moving: a bounce every n steps, the fewest n that keep the catch under this (ft/s)
      syncGain: 0.85,                // moving: a bounce off the inside foot's landing by e s makes the next cycle this much of
                                    // e shorter (or longer), so the bounces come with the inside step (coaching: the ball and
                                    // the inside foot hit the floor together)...
      syncMaxK: 0.35,               // ...never by more than this share of the cycle
    },

    // ---------------------------------------------------------------- the gaits (Trial 5)
    gait: {
      stopSwingS: 0.3,              // stopped with a foot in a gait swing this long, it comes down in a quick step (Trial 11)
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
      lateSwingS: 0.2,              // a foot lifted late in the stride (left behind by a turn or a burst) still gets this long
                                    // for its swing, landing a little after the stride's contact (a stride's swing takes
                                    // ~0.4-0.5 s)

    },

    // ---------------------------------------------------------------- the floor (Trial 3)
    floor: {
      // a planted foot turns only as a pivot: on the ball of the foot with the heel up (coaching: pivot on the ball;
      // a heel turned on the floor slides). The heel comes up over upS, the foot turns once the heel is at turnAtDeg
      // (clear of the floor), and the heel comes down over downS when the turn is done
      // (a moving body turning over a planted foot pivots it past gaitFreeDeg off its heading, standing past standFreeDeg)
      pivot: { pitchDeg: 14, turnAtDeg: 6, startDeg: 1.5, doneDeg: 0.4, upS: 0.07, downS: 0.1, gaitFreeDeg: 18, standFreeDeg: 14,
        // (in a move, a clip: its own steps and pivots place the feet, and a foot is let go this far off the hips first)
        clipFreeDeg: 30,
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
      heelRiseDegps: 300,           // a planted heel comes up for the leg's reach no faster than this walking (deg/s)...
      heelRiseSprintDegps: 900,     // ...and this sprinting (from 6 to 20 ft/s)...
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
      swingMinClearFt: 0.08,        // every swinging foot's lowest point clears the floor by this at mid-swing (ft, ~1 in;
                                    // sin^2 over the swing); people clear it by ~1.3 cm at the lowest point of a swing
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
