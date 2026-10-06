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
      shotCnsMinS: 0.42, shotCnsMaxS: 0.8, // (0.42: a quick one-motion shooter; the NBA's quickest ~0.4, its average ~0.54)
      // the glass and the contest (Trial 11): a flight is steered when the ball is more than glBendIn off its own ballistic path;
      // a take (a carom or a loose ball into someone's hands) is two-handed with both palms within glTakeGapIn of the ball as
      // it is taken, pulled with neither (the ball flies the rest of the way into the hold), in the air above glFloorFt with no
      // bounce on the way (else off the floor); timed when within glApexS of the top of a jump of glJumpMinFt or more; read off the rim when the run to
      // it sets off (closing at glApproachFtps until within glArriveFt) glReadS or more after the ball comes off the rim, the
      // glass or the blocker's hand, or no more than glPreCloseFt was closed on it before; others within glNearFt of the take
      // as it comes off are watched too; the ball is chinned when its top is within glChinFt of the chin and glChinFrontFt of
      // the neck with the elbows glElbowSpan x the shoulders apart, within glChinByS of the take (watched glAfterS); a box-out
      // finds a man within glBoxManFt and is in contact within glBoxGapFt of them, them within glBoxBehindDeg of straight behind,
      // a wide base glBoxBaseX x the shoulders (a man who ends up glBoxLeftFt further from the rim than at the start is let
      // go, not counted); a contest (the nearest man within glContestFt at the release: NBA tracking's tight and contested) reaches
      // toward the ball within glContestDeg, at the release or over the ball's first glContestAfterS in the air (a late one);
      // a block's hand is on the ball within glBlockGapIn and its arm toward it within glContestDeg; a swipe at the ball (the
      // swiper within glSwipeAtFt of it as the swipe starts) goes to it when its hand comes within glSwipeFt
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
      // the passer turned to his target (the user: "players sometimes don't face the correct way when passing"): the turn to the
      // catch spot turnLeadS before the throw's wind-up (and as soon as a move of his own lets him), no dribble move started with
      // his own pass within noMoveBeforePassS; a shooter's catch, his jumper next: the feet set to the rim before the ball gets
      // there, the eyes on the passer, for a pass from within squareUpDeg of the rim's way (from behind him he turns to it)
      turnLeadS: 0.7, noMoveBeforePassS: 0.9, squareUpDeg: 115,
      quickTurnRadps: 7,            // a quick throw (an outlet, the ball moved on to the play's man) waits for the passer's turn to
                                    // him at this rate (rad/s, 0.5 s at most) when he faces more than ~30 deg away
      jumpStopLeadS: 0.8,           // a driver's jump stop into his pass this long before the wind-up (s; was 0.46, still turning)
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
      dipS: 0.11,                   // down into the dip: the ball and the knees go down together (was 0.13; the gameplay pass: the
                                    // jumpers read slow, 0.55 s from the dip to the release against the NBA's ~0.54 on a catch
                                    // and shoot, 0.4 for the quickest)...
      dipBallH: 0.09,               // ...the ball this far below the pocket (H), the hips dipHipH, the knees to dipKneeDeg
      dipHipH: 0.07, dipKneeDeg: 70,
      riseS: 0.2,                   // the bottom of the dip to the take-off: the legs extend, the ball comes up the shot's line
                                    // (was 0.24)
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
      dunkRimFt: { dunk: 11.0, dunk2: 10.8, putbackDunk: 10.7 }, // (the one hand reaches less: the body twisted under it)
      // a jumper off the dribble (the user: "players take a jump shot and just zip to the spot and shoot"): taken from the shooter's
      // own side of the floor when he has the ball further than swingFromFt from the engine's spot (Director.swingSpot: the spot
      // swung round the rim to his line, at its distance, within swingMaxDeg of the rim's axis, its zone kept), and the approach
      // to it a jog of approachFtps (ft/s; approachMaxK x that at most when the beat is near)
      swingFromFt: 4, swingMaxDeg: 88, approachFtps: 10, approachMaxK: 1.3,
      // a dunk's jump (the user: "dunks don't connect to the hoop": a dunker whose hand only just got to the rim's height put
      // the ball on its edge from below, and it was pulled on through): as high as getting the ball over the rim needs (dunkRimFt
      // from the floor, the arm up), up to dunkJumpBoostK x his own jump and dunkJumpMaxFt; a man who cannot get it there lays it up
      dunkJumpBoostK: 1.4, dunkJumpMaxFt: 3.5,
      dunkRelFt: 1.4,               // a dunk's release this close to the rim at most (ft, the engine's spot otherwise): the run-up
                                    // absorbs the difference (from 2-3 ft out the one hand's reach forward cost it the height)
      dunkSlipMaxFt: 4,             // a dunk started further than this (ft) from its run-up's start is laid up or put back instead
      dunkWaitS: 3,                 // ...and waits up to this long (s) past its planned start for the dunker to get to it
      putbackFt: 6.5,               // a standing finish from further than this (ft) from the rim is a layup's two steps, not a putback
      dunkStuffFt: 1.6,             // a dunk's ball let go within this (ft) of the rim's middle and at the rim's height is stuffed
      dunkStuffZ: 9.6,              // through it; from further off (a body in the lane pushed the move back) it flies in as a layup's
      pullUpFromFt: 6,              // a jumper the shooter takes off the dribble from further than this off its spot is a pull-up (ft),
                                    // and so is any jump shot started straight out of a dribble
      cnsHoldS: 0.1,                // a catch-and-shoot holds the ball at most this much longer than the shot itself needs (s)
      // two-motion (the ball set over the forehead while the legs are still loaded, then the legs drive): its deeper dip
      // and the set, then the drive to the take-off; its release nearer the top of the jump
      dip2S: 0.11, set2S: 0.22, drive2S: 0.12, relApex2S: 0.03, // (were 0.13, 0.3, 0.14)
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
      putbackGoS: 0.1,              // a putback goes up this long after its move could be ready, the offensive rebound in hand (s)
    },

    // ---------------------------------------------------------------- the aim: how a shot meets the rim (Match.Aim)
    // Where the ball's centre crosses the rim's plane (a depth along the shot, + long, and a lateral offset, + to the
    // shooter's left, inches from the middle of the ring) and the angle it comes down at. The engine has said whether it
    // goes in and how likely that was (ev.pm): the scatter around the shooter's own aim is set so that it goes in that often,
    // then the shot is drawn from it given the result. (Noah Basketball's tracking: 45 deg in, 11 in past the front of the
    // ring, i.e. ~2 in long, the best; a contested shot's depth varies ~56 % more, its left-right ~38 % more, and comes up
    // short; flat shooters miss long, high-arc ones short.)
    aim: {
      arcDeg: [39, 50],             // a shooter's own entry angle on a jump shot (deg), drawn per player
      arcGood: 45, arcSkillPull: 0.35, // a good shooter's drawn this share of the way toward arcGood
      arcSdDeg: [1.1, 2.6],         // shot to shot (a pure shooter to a poor one)
      arcDeepDeg: 0.3,              // flatter per ft past 24 ft
      depthBiasIn: [-0.8, 2.0],     // a shooter's own habit, short (-) or long (+)
      flatLongIn: 0.22,             // long per degree flatter than 45 (and short per degree higher)
      latBiasIn: 0.8,               // a shooter's own habit left or right, at most
      latRatio: [0.55, 0.8],        // the left-right scatter against the depth's (a pure shooter to a poor one)
      // the hand in the face: the nearest defender's hand at the release (ft from the ball; behind the ball it counts
      // handBehindX as far), all of it at handFullFt, none past handNoneFt: the depth's scatter and the left-right's (x),
      // the shot short (in) and higher (deg)
      handFullFt: 1.5, handNoneFt: 6, handBehindX: 1.6, handDepthSd: 1.25, handLatSd: 1.17, handShortIn: 0.6, handArcDeg: 2,
      // confidence (the engine's, -1 to 1): a cold shooter short-arms it (in at -1), a hot one lets it go (in at +1)
      confShortIn: 0.7, confLongIn: 0.3,
      // a ball that touches the ring goes in with odds falling off with how far its centre crossed from the middle: half go
      // in at these radii off the back of the ring, the side, the front (in; the back rim is kinder), over this spread (set
      // so that an average three is an air ball ~1 time in 100 and a little over a third of the makes are clean, a good free
      // throw shooter's ~60 %)
      in50In: [5.6, 5.2, 4.3], inSpreadIn: 0.7,
      // the finishes' entry angles (deg, spread): a floater, a hook, a layup or putback, a tip; a bank's crossing scatter (in)
      floaterDeg: [60, 3], hookDeg: [52, 2.5], layupDeg: [61, 3], tipDeg: [63, 3], bankSdIn: 1.2,
      // a make off the rim: rolled round the ring rather than hopped (a touch off its side always rolls); a miss that nearly
      // went in (odds at least inOutPIn): rolled round and out (in and out); off the front or back with odds at least rattlePIn:
      // rattled
      rollP: 0.25, inOutPIn: 0.35, inOutP: 0.55, rattlePIn: 0.12, rattleP: 0.35,
      // the widest scatter in depth (in) for a jump shot, a free throw, a finish: a poor look past it is still a shot at the
      // rim, missed off it rather than an air ball one time in ten
      sdMaxIn: [8, 5.5, 7],
    },

    // ---------------------------------------------------------------- the glass and the contest (Trial 11)
    // A missed shot's carom is the ball's own flight: settled as it comes off the rim or the glass, never steered after.
    // Nobody goes for it until they have seen it come off (a visual reaction); then the rebounder runs to where it will come
    // down to their hands and jumps so that they meet it at the top of the jump, two hands on the ball, and brings it down
    // under their chin with the elbows out. The box-outs hold until then.
    glass: {
      readS: 0.18,                  // the players near a carom set off after it this long after it comes off (s; a visual
                                    // reaction to a moving ball, ~0.15-0.3 s)
      // the carom, settled as it hits: of the natural ones (off within coneDeg of the way it was going to go, a distance round
      // the natural mean for the shot's distance, 1/distK x to distK x), the one the rebounder can get to, as near the natural
      // as can be
      coneDeg: 70, distK: 2.2,
      caromT: [0.45, 0.03, 0.98, 0.085], // its time from the rim to the take: between [0] + [1] x its distance (ft) and [2] + [3] x (s)
      caromSpeedK: [0.2, 0.75],     // its speed off the rim between these shares of the speed the shot came in with, and no
      caromUpFt: 5,                 // higher than this over where it came off
      longFt: 10.5,                 // a carom this far from the rim is a long one: run to it and caught on the way down
      longTakeH: 0.72,              // ...at the chest (heights; the catch clip's ball)
      highFt: 10,                   // a carom nearer than this with a man of the other side within contestFt of it is taken at
      contestFt: 10,                // the top of a full jump, two hands high; the rest with a smaller one, still a real jump
      midJumpFt: 1.3,               // (midJumpFt: they go up for it, not a hop; a gameplay pass, the boards had ~3 jumps in 25)
      contestUpFt: 8,               // the nearest of the other side within this of where it comes down goes up with them this
      contestUpP: 0.9,              // often, and the next nearest this often (a crowd going up for it)
      contestUp2P: 0.5,
      crowdFt: 9, crowdMax: 2, crowdP: 0.65, // the crowd under the rim goes up for it too (choreo chaseCarom)
      anticipateFt: 5.5,            // the engine's rebounder further than this from where the miss is planned to come down reads
      anticipateS: 0.22,            // the shot and goes there: this long after the release (s), at this share of top speed, to
      anticipateK: 0.95,            // a step past the spot (the far side from the rim, ft), facing the rim as it comes off
      anticipatePastFt: 1.2,        // (choreo anticipateCarom; they used to box out a man 20 ft out or crash straight at the rim)
      pullFromFt: 15,               // a miss's carom comes partway toward an engine rebounder further than this from every natural
                                    // one (was 8: nearer, they get there themselves now)
      runK: 0.8,                    // after it: a run at this share of top speed (braking first what they have going the other
      runStartS: 0.1,               // way), its first runStartS to get going...
      travelFt: 4,                  // ...and up to this far in the jump itself (a running jump: the push off the floor over
      pushS: 0.15,                  // the last pushS of the load, then carried in the air)
      reachS: 0.25,                 // the hands go onto the ball over reachS, all the way on reachEarlyS before it is taken
      reachEarlyS: 0.08,            // (the arms ease onto a target over ~0.1 s)...
      takeGapIn: 3,                 // ...and it is taken as both palms are within this of it (in), up to takeLateS late; not
      takeLateS: 0.12,              // there by then, it goes on down and they run it down off the floor
      catchLeadS: 0.2,              // a long rebound: at the spot this long before it comes down to the hands
      popFtps: 8,                   // a carom nobody can get to in the air pops this fast up off the rim and comes down to the floor
      floorDistK: [0.6, 0.8, 1, 1.25, 1.6], // ...this far out (x the natural distance), where the rebounder is nearest against
      floorOthersK: 0.6,            // everyone else (their distance less this share of the nearest other's)
      catchLowFt: 1.2,              // run down off the floor: caught with both hands above this (and within catchReachFt, and their
      catchReachFt: 2,              // run), picked up off the floor below it
      // running a loose or bouncing ball down (pursuit, then arrival: Reynolds' steering behaviours): the soonest moment on
      // its way that it is at a height their hands take it and they can be stopped a reach short of it by then; caught with both
      // hands from gatherCatchLoH x their height (the catch's arms, 0.3 heights out in front, are within ~1 in of a ball there
      // for every height; lower, ~3 in off it for a 7-footer) up to chest height, or bent down to it and picked up below
      // gatherPickHiH x their height (the pick-up's arms get to anything from the floor to ~0.75 heights), stopped on the spot
      // gatherPickStopK of the pick-up's bend before the grab; taken as it goes along the floor no faster than gatherCatchFtps
      // (caught: going away from them, they go with it) or gatherPickFtps (picked up). The plan holds while they are no more
      // than gatherSlackS behind it; the hands not on it gatherLateS after the take, a new one
      gatherCatchLoH: 0.38, gatherPickHiH: 0.55, gatherPickStopK: 0.3, gatherSlackS: 0.2, gatherLateS: 0.25,
      gatherCatchFtps: 12, gatherPickFtps: 12,
      chaseK: 1,                    // a loose ball is run down flat out (the rebounder's run to a carom in the air: runK)
      // a rebound gone to the floor is fought for (Director.scrambleLoose): the scrambleN nearest of each side within
      // scrambleRebFt go after it too, onto the ball scrambleLeadS ahead of where it is, a step (scrambleBehindFt) behind the
      // engine's rebounder (but in to scrambleMaxFt of it whatever) and never nearer it than scrambleKeepFt
      // (the user: "on rebounds all the players will circle the ball and just stare at it instead of fighting for the ball":
      // they go onto it, a hand's reach from it at most, the hands out for it from scrambleReachFt, a low stance)
      scrambleN: 2, scrambleRebFt: 16, scrambleLeadS: 0.2, scrambleBehindFt: 0.4, scrambleKeepFt: 1.2, scrambleMaxFt: 3.0,
      scrambleReachFt: 3.6,
      gatherCutFtps: 0.5,           // a ball going along the floor faster than this is picked up cut off (from beside its way)
      gatherEarlyS: 0.1,            // a pick-up: on their spot and stopped this long before the bend
      gatherBrakeK: 0.45,           // planned stops brake at this much of their braking (the strides' flight between the plants)...
      gatherStopK: 0.5,             // ...and the run to the spot brakes at this much, stopping there (at full speed until then)
      // the box-out: boxFindS after the release each defender has found their man (the eyes on them) and steps into them, if they
      // are coming to the glass or within boxManRimFt of the rim and no further than boxReachFt away: their back into them between
      // them and the rim, the bodies touching (touchH x the two heights apart, the torsos' own depth, + boxGapFt), the eyes
      // going to the ball boxEyesS after; the man leans boxLeanFt into them. A defender whose man is getting back holds their
      // ground facing the rim
      boxFindS: 0.35, touchH: 0.068, boxGapFt: 0.02, boxLeanFt: 0, boxManRimFt: 14, boxReachFt: 9, boxEyesS: 0.3,
      boxSettleFt: 0.35,            // within this of their spot on the man they sit in it (the feet set wide) until the man moves them
      boxLetGoFt: 3,                // their man this much further from the rim than as the box-out began (gone back up the floor): let go
      boxMinS: 0.4,                 // a box-out takes this long to make: a shot off the rim sooner after they have found their man (a
                                    // layup's), or a blocked one, they turn to the ball instead
      // a contest: the hand nearer the ball up at it along the line from its shoulder (coaching: the high hand on the ball's
      // side, in the shooter's sight; NBA tracking counts a closest defender within ~4-6 ft), as far as contestReachK of the
      // arm reaches and contestGapFt short of the ball at most (the hand ~0.12 heights past the wrist), up over contestLeadS
      // before the release, held contestHoldS after, down over contestDownS
      contestReachK: 0.97, contestGapFt: 0.35, contestLeadS: 0.25, contestHoldS: 0.25, contestDownS: 0.45,
      lateContestFt: 6, lateLeadS: 0.2,  // any other defender this close as it goes up gets a hand up at it over lateLeadS
      contestInS: 0.2,              // a contest's jump (or the wall at the rim) fades in over this (the arms coming up to it)
      wallLeadS: 0.36,              // the wall at the rim goes up this long before the release, both arms over it
      contestSwapS: 0.12,           // the ball gone from the shooter's hands, the hand goes from their release point onto where it went
      // a block: the blocker goes up in the shooter's face, blockFaceFt from them toward the rim (a running jump over what is
      // left of the way there), and the ball is hit where the shot's own way first comes blockInFt inside their reach (their
      // shoulders ~shoulderH x their height over the floor as they go up, the reaching one ~shoulderInH heights nearer than the
      // body's middle, the arm and touchWristFt) between blockMinS and blockMaxS after the release (coaching: meet it just
      // after it leaves the hand), their hand onto it over blockReachS, the palm on its near side (the wrist touchWristFt off its
      // surface); it goes off the way the swat goes, within blockConeDeg of the way they face, as fast as blockSpeedK x the shot
      blockFaceFt: 2.2, blockMinS: 0.04, blockMaxS: 0.3, blockInFt: 0.3, shoulderH: 0.82, shoulderInH: 0.1, touchWristFt: 0.3, blockReachS: 0.22,
      blockConeDeg: 60, blockSpeedK: 1.1,
      blockLateS: 0.6,              // not in their reach by blockMaxS: met further up its way while they are still up, this long at most
      // a free ball (a carom, a make down out of the net, a blocked or loose ball) coming into someone's trunk or head at
      // bodyHitFtps or more (more than bodyHitMinFt in, below bodyHitMaxFt) comes off them: bodyE of its speed along the hit back,
      // 1 - bodyMu of the rest kept (their own speed added); once per bodyHitS each
      bodyE: 0.35, bodyMu: 0.3, bodyHitFtps: 2, bodyHitMinFt: 0.02, bodyHitMaxFt: 9.5, bodyHitS: 0.15,
      releaseWaitS: 2.5,            // a contest or a block waits for the shot's own release up to this long past the plan
      // a steal: the swipe's hand on the ball's side onto the ball where it is; poked, it squirts off the hand the way the hand
      // was going at ~pokeFtps, and they run it down (caught or picked up by hand), the man who lost it and the nearest of their
      // side within scrambleFt after it a reaction later; not theirs by chaseMaxS, it is theirs where it is
      pokeFtps: 8, scrambleFt: 12, chaseMaxS: 6,
      looseInFt: 10,                // (and never toward a line: its first this much stays inside them, Director.inCourtAngle)
      // a swipe (a poke steal, a reach-in) goes once the ball is within swipeFt of them along the floor (the arm and the lunge
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
      // the palm goes round the ball, the forearm turning in with it (not a paddle going straight up and down: skilled
      // dribblers keep the ball in the hand longer with the forearm's turn and the shoulder's, ISBS 2008, "hand-dribbling
      // motion between skilled and unskilled subjects"; coaching: finger pads on the ball, the hand cupped, the wrist
      // going down with it)
      rollCatchDeg: 62,             // the pads take the ball coming up on its upper outside, this far round from the top (deg)...
      rollInDeg: 30,                // (an in and out's, taken on the inside of the ball: this far round, the other way, the palm
      rollInFaceDeg: 8,             // facing no further round than this there)
      rollMoveDeg: 18,              // (a move from hand to hand's, the other hand taking it: this far round, as it always was)
      rollFastDeg: 26, rollFastFrom: 8, rollFastTo: 17, // (running with it, the hand behind the ball: taken this far round at
                                    // rollFastTo ft/s and on, eased from rollCatchDeg at rollFastFrom; the catch out on the side
                                    // had the arm straight at a sprint and the ride jolted)
      rollTopDeg: 18,               // ...roll in over it as the hand rides it up, this far round at the top of the ride...
      rollRelDeg: 2,                // ...and push it down from the top, this far round at the release (deg)
      rollBackCatchDeg: 28, rollBackTopDeg: 16.3, rollBackRelDeg: 6, // ...and back from the top of the ball this far, where
                                    // it is taken, at the top of the ride, at the release (deg)
      rollArcH: 0.045,               // off the ball the hand swings back out round the outside to the next catch, this far out
                                    // past the straight way there (H)
      snapDeg: 38,                  // the wrist flexes this much past the palm facing the ball by the release (deg), easing back
                                    // over the flight; the palm faces the ball otherwise (its forearm turn and wrist bend
                                    // worked out from the arm every frame)
      faceBall: true,               // false: the old fixed forearm turn (palm down, 150 deg) and wrist schedule
      faceClearIn: 0.1,             // ...the forearm kept this clear of the ball (in), the wrist flexed on in these steps (deg)
      faceClearStepsDeg: [5, 10, 16, 24, 34], // until it is (_forearmClear), and that kept for the next frames, easing off over
      faceLiftS: 0.12, faceLiftMaxDeg: 40, // faceLiftS (s), this much at most (deg)
      faceFastK: 0.6,               // ...running with it (rollFastFrom to rollFastTo ft/s) this much less of it...
      faceMoveK: 0.35,              // ...and a move from hand to hand only this much of it through its flight
      faceWrFMinDeg: -50,           // ...the wrist bent back no further than this for it (deg; its range goes to -75)
      faceWrD: 25,                   // ...the dribbling wrist turned this far toward the thumb (deg): the fingers pointing on ahead
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

    // ---------------------------------------------------------------- urgency (the gameplay pass: everyone moved slowly)
    // Off the ball the game averaged 5.5 ft/s with 35% of the time at a jog or faster, against ~6.5 ft/s (4.3-4.6 mph)
    // in the NBA's tracking; the ball was walked up the floor at the 7 ft/s floor between walking and jogging (the NBA
    // brings it over half court in ~4-5 s, a jog); every start eased in like a walk.
    urgency: {
      baseK: 1.1,                   // every speed an order asks for goes this much quicker (the labs' and audits' bodies)...
      goalK: 1.22,                  // ...and in a game this much (was 1.1; Actor.setUrgency), at the Player Speed slider's 50 (it
                                    // scales these on)
      startFtps2: 6.5,              // the push off into a move is this hard at least (ft/s^2)...
      startPerFtps: 2.3,            // ...and this much more per ft/s of the speed wanted, up to his acceleration (was 4.5 +
                                    // 1.8 v: a first step into a jog pushed like a stroll)
      slideStartFtps2: 4.5, slideStartPerFtps: 1.8, // (out of the defensive stance, a slide or a backpedal, and the labs'
                                    // bodies: as it was)
      advanceFtps: 10.5,            // a walked-up ball comes up the floor at least this fast (ft/s, before goalK: ~13 ft/s, a
                                    // jog), on to the top of the key where the handler sets it up (it used to be timed to the
                                    // engine's crossing, crept up at 7 ft/s and waited at half court)
      advanceTopU: 27,              // ...there, this far from the baseline he attacks at least (ft; the top spot or further out)
      pushToU: 21,                  // on a break the man with the ball pushes it to this far from the baseline (ft, the top of the
                                    // key's inside edge), toward the middle, wherever he caught it (Director.handlerAmbient)...
      pushRimU: 6,                  // ...and on at the rim, to this (ft), with his own finish next (the user: "he got the ball on the
                                    // outlet but never drives to the hoop"; his jumper next: to its distance), or to pushKickU with a
      pushKickU: 14,                // pass or a move next and pushKickBackN defenders back at most: the drive and the kick
      pushKickBackN: 1,
      offHoldK: 0.4,                // off the ball in the half court the holds between a player's cuts, lifts and relocations
                                    // are this share of what they were (~1-3 s standing between small shuffles)...
      offMoveK: 1.35,               // ...and the moves themselves this much longer (a v-cut 5-9 ft, a relocation 2-5 ft)
      flowRestK: 0.7,               // the half-court flow's rests between a player's actions (screens, cuts, relocations) are this
                                    // share of each offense's own (flow.js profiles)...
      flowSpeedK: 1.1,              // ...and its actions' legs this much quicker than written (on top of goalK)
    },

    // ---------------------------------------------------------------- the offense's edge (the user: "make the offense player
    // movements faster than the defense, just enough that there is a delay for the defense so there is more space"). The side
    // with the ball runs offSpeedK x and pushes off offAccelK x what it could (every one of them, the man with the ball and the
    // cutters alike; Actor._steer, set by the Director as the ball changes hands); the side without it reads the man it guards
    // defLagS later (on the ball, defense.js _perceive; off it, the spot's lag on the ball, guardPos; the call to re-match on a
    // break, transitionMatch): a step of space on a cut, a drive or a closeout. On top of the Player Speed and Defensive IQ
    // sliders, and scaled by the Offense Edge slider (League Settings: 0 none, 50 these, 100 twice; Director.edgeK). The
    // engine's outcomes are its own; this is the room the court shows
    edge: { offSpeedK: 1.06, offAccelK: 1.08, defLagS: 0.06 },

    // ---------------------------------------------------------------- shifty handlers (the gameplay pass: the man on the ball
    // mirrored the handler with no delay and no move made space). How good the handler is against him (Director.shiftyK: his
    // handle and quickness against the defender's perimeter defense, quickness and head) sets each of these between its ends
    shifty: {
      lagS: [0.05, 0.2],            // he follows the handler this far behind (s, a reaction; less for a sharp defender, defIQ)
      nearFt: 9,                    // a move sells the man on the ball within this of the handler...
      biteFt: [0.6, 2.8],           // ...pulling him this far the way it sells (ft)...
      biteS: [0.3, 0.65],           // ...for this long (s): a crossover, between the legs or behind the back the side the ball
                                    // is leaving, an in and out the other side, a spin the way he was going
      hesiFt: [0.5, 1.8], hesiS: [0.3, 0.6], // a hesitation stands him up: he gives this much ground (ft) for this long (s)
      readP: 0.35,                  // a defender as good as the handler reads it and does not bite this often (none for one much worse)
      moveP: [0.45, 0.9],           // a probe's turn, the handler works a move this often (by his handle)...
      restK: [1.25, 0.55],          // ...and rests between probes this share of his offense's rest (a shifty guard keeps at it)
      probeFtps: 13,                // a probe's attack goes this fast (ft/s before the pace factor; was 11), its retreat
      retreatFtps: 9, swingFtps: 11, // this fast (was 6.5) and a change of sides this fast (was 8.5)
      // the dribble breakdown (the shot physics pass: "a size-up, then a speed boost to blow by"). The size-up is a chain of
      // moves read one by one (Tune.combo, below; it was a string drawn from a table here)...
      // ...and the burst out of a move his man bought (Director.breakdown, Actor.burst): for burstS, his top speed up to
      // burstVK and his push up to burstAK more (at a full bite on a man he is much quicker than); a move made within
      // burstLateS of the bite's end still counts; his man stays sold burstHoldS x more; less than burstMinK, no burst
      burstS: 0.9, burstVK: 0.18, burstAK: 0.9, burstLateS: 0.3, burstHoldS: 0.5, burstMinK: 0.2,
      soldSlowK: 0.35,              // a man sold on the move before a drive keeps up with it this much slower at first (x the bite)
      // a big bite leaves the man on the ball off balance (a knock his way, Actor.impact: from biteKnock[0] ft/s at the least
      // to biteKnock[1] at a full bite on a man the handler is much better than; a stumble step from ~6.5)
      biteKnock: [3, 9],
    },

    // ---------------------------------------------------------------- dribble combos (the dribble work: "chain dribble moves
    // into combos that break the defender"). A size-up is no longer a string drawn from a table: the handler reads his man
    // after every move (Director.comboNext) and counters what he bought. The man on the ball carries his weight (defense.js
    // pc.wob: how far the moves have pulled it, ft, settling back) and a move back against it is what breaks him (research:
    // the ankle breaker is a change of direction the defender has to make with his weight already committed; coaching: a
    // move is set up by the one before it, Hardaway's between the legs one way and the crossover straight back)
    combo: {
      maxMoves: [1, 5],             // a chain is this long at most, from a 45 handle to a 90 (never past the move the engine has next;
                                    // two at least from a 60 handle up: one move is no size-up)
      // the size-up that reads (the user: "I don't see the combo moves happening, I need more dribble animations and dribble size
      // ups, they should look natural"): its rhythm and its body. Between the moves a pound dribble poundP of the time (by handle:
      // a handler setting his man up pounds it, one stringing them tight does not; coaching: rhythm dribbles), each move a short
      // step to the side the ball goes, the weight over it (rockFt, by handle; the rock of a size-up, Director.moveBody), a
      // hesitation a step up into it; a man tight on him (retreatFt), a shifty handler steps back off him first, a retreat dribble,
      // retreatP of the time
      poundP: [0.7, 0.35], rockFt: [0.8, 1.3], retreatP: 0.3, retreatFt: 4,
      // ...and before the engine's own attacking move (a crossover, a hesitation, a drive, a spin) a short size-up (setupMax moves),
      // setupP of the time (by handle), when his man is in front within setupFt and there is setupMinS before the move
      setupP: [0.35, 0.9], setupFt: 9, setupMinS: 1.5, setupMax: 2,
      flowMax: 3,                   // a size-up in flow (handleBall, the probe below) runs to this many moves
      probeSizeP: 0.3,              // a handler's probe (flowHandler: attack a gap, change sides) is a size-up in place this often instead
      counterP: [0.5, 0.95],        // his man bought the last move: the counter straight back this often (by handle), else a change of pace
      readSwitchP: 0.7,             // his man read it: a change of pace or an in and out this often, else the same kind again
      stopReadN: 2,                 // ...and a sharp man (shiftyK under 0.35) who has read this many is left alone: the move comes
      leanK: 0.75,                  // each bite adds this share of its pull to his weight (ft; one bite never breaks a man: the most it
                                    // pulls, 2.8 ft at a full mismatch, lands under breakFt; the counter after it does)...
      leanTauS: [2.2, 1.2],         // ...which settles back with this time constant (s; a stiff defender to a sharp one, by agility and head:
                                    // moves come every half second or so, so a second and a third bought move stack on the first)
      counterK: [1, 1.6],           // a move against the way his weight has gone sells him this much more (x; by how far it had gone, up to breakFt)...
      counterKnock: 1.3,            // ...and knocks him harder (x)
      wobFt: [3, 6.5],              // ...a move made with his man this close (ft) pulls his weight fully, none at all from this far
      breakFt: [3.4, 5.0],          // his weight this far gone and he is broken (ft; a lockdown defender needs more: by shiftyK), scaled by the
      openK: 0.75, tightK: 1.6,     // engine's look for the handler (open: sooner; tight: his man reads it, readP up to tightReadP, and the bar high)
      tightReadP: 0.85,
      brokenS: [0.6, 1.1],          // broken: he reacts late and slow for this long (s; by the break's size)...
      brokenLagK: 3, brokenVK: 0.55, // ...his reaction this many times slower, his top speed this share...
      knock: [7.5, 10],             // ...knocked the way his weight went this hard (a stumble step, Actor.impact; by the break's size)...
      fallP: [0.02, 0.2],           // ...and down this often (by the break's size x the mismatch: a big one on a man the handler is much better than)
      fallBusyS: 1.4,               // (the fall clip keeps him down about this long past the break's own time)
      burstK: 0.5,                  // his weight gone counts this much toward the burst out of the next attacking move (Director.breakdown)
      flowChainP: 0.7,              // sizing a man up in flow (handleBall), a shifty handler strings more moves on the first this often (was 0.3)
    },

    // ---------------------------------------------------------------- the post moves (the shot physics pass: "players in the
    // paint should be using post moves to get an opening to score, and using contact"; Director.postPlan, runPost). The move
    // a post-up works before its shot, by the finish the engine gave it (rim: a layup or dunk, hook, fade: the turnaround or a
    // short jumper) and how open the engine had it come out (the move is how he got that look: open, the fake got his man off
    // his feet or leaning; tight, his man stayed with it and he went up through him). Weights, each x (0.5 + the player's
    // strength) for the drop step and x (0.5 + his post craft and quickness) for the fakes and the spin (0-1 from 40 to 90)
    post: {
      // (the user, after: "make the post moves more visible": more of the fakes, fewer straight up, and the moves bigger and
      // a beat slower below: the drop step and the spin 2 ft and more, the fake's bite a yard, a second fake back for the
      // crafty, doubleFakeP; and a line in the play-by-play for every move, Director.runPost's 'post' event)
      rim: { open: { upUnder: 3, spin: 2.5, dropStep: 2, fake: 2 }, contested: { dropStep: 3, upUnder: 1.5, spin: 1.5, fake: 2 }, tight: { dropStep: 4, fake: 1.5, spin: 0.5 } },
      hook: { open: { fake: 3, dropStep: 1.5 }, contested: { fake: 2.5, dropStep: 2 }, tight: { dropStep: 3, fake: 1.5 } },
      fade: { open: { fake: 3, none: 0.5 }, contested: { fake: 2.5, none: 0.8 }, tight: { fake: 1.5, none: 1.2 } },
      // squared up to the rim in the paint (a big who caught it facing, his man in front): a pump fake first, into the up and
      // under at the rim or the hook
      faceUp: { open: { upUnder: 3, none: 0.3 }, contested: { upUnder: 2, none: 0.6 }, tight: { upUnder: 1.2, none: 1.2 } },
      rangeFt: 11,                  // a post-up this close to the rim finishes where its move leaves him (a power finish off two
                                    // feet); the running layup from further out keeps its run-up
      faceFt: 12, faceNearFt: 5,    // squared up inside faceFt of the rim with his man within faceNearFt: the face-up moves
      bumpS: 0.6,                   // the shoulder into his man's chest first (the back-down's bump), the move this long after it
                                    // (its second step down by then: the pivot after it needs both feet on the floor)
      bumpK: 7,                     // how hard (ft/s of closing speed, Actor.impact; x the strength edge, 0.75-1.35)
      dropFt: 2.1,                  // the drop step: the hips this far on toward the rim with the big step back past his man (was 1.5)...
      sealK: 9,                     // ...and the seal: his man knocked off the line round the hip (x the edge too)...
      sealFt: [0.8, 1.8],           // ...and kept this far off it until the finish (tight to open; was 0.5-1.4)
      spinK: 7.5,                   // the spin: his man, leaning on him, falls into the space he left (a stumble from ~6.5)...
      spinShiftFt: 2.3,             // ...as he goes round the hip, the hips this far on toward the rim (was 1.6)
      spinQuick: 0.8,               // (the spin's turn this much quicker than a pivot's)
      fakeBiteFt: [0.7, 1.9],       // a shoulder fake: his man shifts this far to it (tight to open; was 0.4-1.4)...
      fakeLeanK: 6,                 // ...leaning (a knock his way; was 3.8, a lean you could not see)
      fakeS: 0.42,                  // ...the fake given this long before the next part (s; its clip's length, it was cut at 0.34)
      doubleFakeP: 0.45,            // a crafty post man (post craft over 0.5) fakes over one shoulder and back over the other this often
                                    // (the dream shake), the move going the first way; the second fake goes when there is no time
      pumpStepFt: 1.0,              // a pump fake on a contested look: he steps up into it, hands up, off his heels (open: he jumps)
      stepFt: 3.2, stepSideFt: 1.1, // the step through: the free foot this far on toward the rim and this far to the side, past
                                    // his man's hip...
      stepK: 5,                     // ...the shoulder under him as he comes down
      moveP: 0.97,                  // a post-up works a move first this often (the rest go straight up; was 0.92). Scaled by the
                                    // Post Moves slider (League Settings: 0 none, 50 this, 100 every one), as is doubleFakeP
      // the back-down (the user: "in the post there isn't any post moves and the post defense, the contact is very minimal, it
      // should be a dog fight"; Director.p_move 'backdown'): a fight, not a bump or two with the man 2 ft off. The bodies touch
      // (Tune.glass.touchH apart plus backGapFt, as a box-out's), his man's forearm in his back; the bumps come bumpGapS apart,
      // up to backBumps of them as the time before the shot allows, each knocking his man back toward the rim backK x the
      // strength edge (0.75-1.35) and holding the post man up backHoldK of that the other way (a stronger defender gives less
      // ground); between them his man leans and shoves (shoveK, every shoveS), and a big edge knocks his man into a balance step
      // (backStumbleEdge). The audio's body contacts hear the bodies
      backGapFt: 0.05, backBumps: 4, bumpGapS: 0.74, backK: 8.5, backHoldK: 0.5, shoveK: [4.5, 6], shoveS: [0.3, 0.5], backStumbleEdge: 1.15,
      guardTouchFt: 0.05,           // (the man on a post move's back, postGuard: touching, this much more than the torsos' depth; was 2.1 ft off)
      // the fight for position before the ball comes (Director.paintContact): a man posting up (on the block, or set in his
      // post-up) and his man bump every fightS (s), this hard (fightK, ft/s), fightP of the time: the seal and the shove back
      fightS: [0.45, 0.9], fightK: [4.5, 7], fightP: 0.7,
      frontFt: [1.4, 0.6],          // ...his man guards a post man from this far toward the ball and toward the rim (ft; was 1.9, 0.9), on his body
    },

    // ---------------------------------------------------------------- reading the space (the gameplay pass: a handler whose man
    // was beaten, or with nobody near him, kept dribbling where he was; flow.js readOpen)
    reads: {
      openFt: 7,                    // nobody of the other side this close to the man with the ball: he is open (NBA tracking's
                                    // "wide open" is a closest defender 6 ft or more away)...
      beatenFt: 0.8,                // ...or his man is this far behind him on his line to the rim, or beside him (besideFt across,
      besideFt: 3.2, besideAlongFt: 1.0, // no more than besideAlongFt in front): past his man
      biteBeatFt: 1.4,              // ...or sold on a move by more than this (defBite: the breakdown, the moment to go)
      rangeFt: 30,                  // (within this of the rim)
      pullLeadS: 0.6,               // his own shot next, it comes now: brought forward so it keeps this much beyond the time its beat
      pullMaxS: 2.5,                // needs (s), by this much at most (s; the clock runs a little quick meanwhile)
      attackStopFt: 11,             // something else next: he attacks the gap, a drive at the rim to this far from it (ft)...
      attackS: 1.3,                 // ...for this long (s) at this share of his top speed...
      attackK: 0.9,
      attackGapS: 2.5,              // ...no oftener than this (s)...
      attackClearS: 1.0,            // ...and not with a play of his own due within this (s)
      wideFt: 8,                    // nobody within this (ft) and inside wideRangeFt of the rim: wide open, he goes at the rim
      wideRangeFt: 26,              // too, past his man or not (the help has to come to him; the kick-out follows from there)
      moveLeadS: 0.35,              // his own move next (a drive, a hesitation, a crossover, a spin): it comes now, brought forward
                                    // so it keeps this much beyond its beat's own time (s), pullMaxS at most
      // the fast break (the user: "on the fast breaks the players don't drive to the hoop, they will be open 99% of the time and
      // they just run to the corner"; Director.ambient's lanes, handlerAmbient, assignSpots 'transition')
      pushReadU: 38,                // on a break the reads above are on once the ball is this far from the baseline it attacks (ft)
      pushCutBackN: 1,              // a wing running his lane with this many defenders back at most (level with him or nearer the
                                    // rim), the ball within pushCutBehindFt behind him, cuts to the rim (the corner rim run)...
      pushCutBehindFt: 30,
      pushCutSideFt: 5.5,           // ...a stride off the middle to his side (ft)...
      pushCutMaxS: 3.2,             // ...for this long at most (s), then he fills his corner...
      pushCutGapS: 4,               // ...and not again within this (s)
    },

    // ---------------------------------------------------------------- the contact drive (the user: "add a contact drive, right
    // now players don't drive in traffic, they should, to try and draw a foul"; Director.contactDrivePlan, driveContact, Actor
    // ._avoid). A drive to a finish at the rim with a help defender in the lane (within helpFt of the rim) goes at his chest
    // instead of round him: when the engine has the shot fouled, and contactP of the time otherwise by the driver's foul
    // drawing (a 45 to a 90), with a look that was not open. He closes on the help at up to meetFtps instead of braking to a
    // walk (Tune.weight.meetBallFtps), the shoulder in first (chestK, x the game's physicality), the help knocked back into a
    // balance step and the driver absorbing absorbK of it, his own man's hip check hipK x harder; a fouled shot gets the
    // whistle the engine gave it, the rest go up through the contact. contactP is scaled by the Contact Drives slider (League
    // Settings: 0 none of these, 50 as here, 100 twice); a fouled shot's contact is the whistle's and stays
    traffic: { contactP: [0.15, 0.75], helpFt: 10, meetFtps: 12, chestK: [8.5, 11], absorbK: 0.35, hipK: 1.25, setFt: 4.5 }, // (setFt: the help sets himself this far in front of the rim on the driver's line)

    // ---------------------------------------------------------------- going down (the user: "on heavy contested shots players can
    // fall to the ground, layups and jump shots"; Director.planFall, goDown, the contest's body in planContest). A shooter knocked
    // on the way up or in the air (the contester's body at the rim, a tight contest's jump into him, a foul's reach, a contact
    // drive's shoulder) can come down off his feet as his finish lands: the fall clip the way he was knocked, up in fallBusyS.
    // fallP by the knock he took (its speed, ft/s, within hitWithinS of the landing), x the look's contest, the whistle, the
    // kind of shot, his strength and the game's physicality; and the help a contact drive went through goes down too
    // (defFallP, by the knock). The Hard Falls slider (League Settings) scales both: 0 none, 50 these, 100 twice
    fall: {
      fallP: [0.12, 0.5], fallKnock: [5.5, 11], hitWithinS: 1.6,
      contestK: { open: 0.25, contested: 0.55, tight: 1.0 }, fouledK: 1.6, finishK: 1.3, jumperK: 0.55, strengthK: 0.5,
      defFallP: 0.3, defFallKnock: [8.5, 12],
      fallBusyS: 1.6, minGapS: 8,
      // the contester's body into the shooter as the shot goes (planContest; ft/s, x the game's physicality): at the rim, a tight
      // one, a contested one, a fouled one; a tight jumper's contest jumping into him; a fouled jumper's reach
      bodyK: { tight: 7.5, contested: 5.5, fouled: 8.5, jumper: 4.5, jumperFouled: 6.5 },
    },

    // ---------------------------------------------------------------- denying the ball (the gameplay pass: one pass away the
    // defenders sat a step off in the lane and none of them took the pass away; defense.js denyK, guardPos, Actor._armTargets)
    deny: {
      scheme: { pressure: 1, nothree: 1, blitz: 0.9, hedge: 0.8, switch: 0.8, boxone: 0.8, man: 0.75, drop: 0.6, packline: 0.2 },
                                    // (how hard each scheme wants it; the zones and the press keep their own spots)
      skillFrom: 45, skillTo: 80, skillMin: 0.3, // his defense (perimeter 0.5, head 0.3, quickness 0.2) from nothing to all of it
      shooterMin: 0.7,              // a man who cannot shoot gets this share of it
      nearFt: 1.9,                  // all the way: this far off his man toward the ball (ft; 3.2 at none), half a step toward the rim
      armFrom: 0.35,                // from this much of it the ball-side hand goes out into the lane...
      reachK: 0.9, dropH: 0.1,      // ...this share of the arm's reach toward the passer, this much below the shoulder (H)
      giveS: 1.1,                   // a pass the engine has his man catch: from this long before the throw (s) he eases back off
                                    // the lane, the hand down (his man got open: the pass is not thrown past a hand in it)
    },

    // ---------------------------------------------------------------- the rules the players know (the gameplay pass)
    rules: {
      gatherS: 0.5,                 // his dribble picked up, a player gets this long (s)...
      lineFt: 2.8,                  // a dribbler's spot is kept this far inside the sidelines and baselines (ft; the ball out wide
                                    // of him stays in), unless the engine calls him out of bounds (Actor._steer)
      stopFt: 2,                    // a man with the ball brakes in time to stop this far inside
      brakeK: 0.6,                  // them (ft), on this share of his brake, begun this late (s): a catch at a run into a corner
      brakeLagS: 0.15,              // slid on over the line with the dribble started on the way (Actor._steer)
      ballFt: 0.75,                 // and a dribble's bounce is kept this far inside them (ft, the ball's middle; the lines
                                    // are drawn outside the floor, a ball that lands on one is out) (Ball._airW)
      gatherFt: 5,                  // ...or this far past where he picked it up (ft), whichever comes first, to stop: the
                                    // gather and two steps; then he only pivots until he passes or shoots (a walk with a held
                                    // ball is a travel). A dribble he has ended is never started again (Ball.dribble)
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
