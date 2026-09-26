/* Pro BBALL Coach — match view: action clip library (PBC.Match.Anims.CLIPS additions).
 * Right-handed versions (mirrored for lefties). Times in seconds, root motion in feet
 * (fwd, lat + = right), ball positions in height fractions relative to the root ground point,
 * jump = ballistic flight {t0, t1, h (H-fraction peak)}. Events mark the frames that matter to
 * the choreography (release, catch, grab, contact, set point...). */
(function () {
  'use strict';
  const M = window.PBC.Match, A = M.Anims;
  const clip = A.clip;

  // ------------------------------------------------------------ shots off the dribble
  // (the arms of every jump shot come from the fitted phases in A.SHOT_ARMS: set point, push, release and
  // follow-through all in the rim's plane; see anims.js)
  const SA = A.SHOT_ARMS, SB = A.SHOT_BALL;
  const arms = (phase, torso) => Object.assign({}, torso || {}, SA[phase]);
  // pull-up: gather from the dribble into the pocket, plant, rise
  clip('pullup', {
    dur: 1.78, events: { gather: 0.1, set: 0.56, release: 0.76 },
    jump: { t0: 0.56, t1: 1.12, h: 0.13 },
    feet: [[0, 'plant'], [0.56, 'air'], [1.12, 'plant']],
    root: [[0, 0, 0], [0.15, 0.7, 0], [0.32, 0.95, 0], [0.56, 1.0, 0], [1.12, 1.25, 0], [1.78, 1.3, 0]],
    keys: [
      { t: 0.0, p: { base: 'ready', rootZ: -0.06, pelPitch: 20, spFlex: 8, rShF: 30, rShA: 20, rElF: 60, rPro: 60, lShF: 45, lShA: 30, lElF: 85, lPro: 20 }, ball: [0.14, 0.14, 0.38], grip: 'right' },
      { t: 0.12, p: 'shotPocket', ball: [0.07, 0.15, 0.52], grip: 'hold' },
      { t: 0.29, p: arms('dip', { rootZ: -0.09, pelPitch: 18, spFlex: 6, chFlex: 3, nkFlex: -14, both: { HipF: 34, Knee: 54, Ank: 16 } }), ball: SB.dip, grip: 'jsLow' },
      { t: 0.46, p: arms('rise', { rootZ: -0.035, pelPitch: 8, spFlex: 2, chFlex: -2, nkFlex: -10, both: { HipF: 16, Knee: 22, Ank: 0 } }), ball: SB.rise, grip: 'jsRise' },
      { t: 0.53, p: arms('load', { rootZ: -0.02, pelPitch: 4, spFlex: 0, chFlex: -4, nkFlex: -9, hdFlex: -3, both: { HipF: 10, Knee: 14, Ank: -12 } }), ball: SB.load, grip: 'jsLoad' },
      { t: 0.6, p: 'shotSet', ball: SB.set, grip: 'jsSet' },
      { t: 0.69, p: arms('push', { rootZ: 0, pelPitch: 1, spFlex: -3, chFlex: -6, nkFlex: -9, hdFlex: -4, both: { HipF: 6, HipA: 4, Knee: 12, Ank: -34 } }), ball: SB.push, grip: 'jsPush' },
      { t: 0.76, p: arms('release', { rootZ: 0, pelPitch: 0, spFlex: -2, chFlex: -5, nkFlex: -8, hdFlex: -2, both: { HipF: 8, HipA: 4, Knee: 14, Ank: -36 } }), ball: SB.release, grip: 'shootRel' },
      { t: 0.82, p: 'shotFollow' },
      { t: 1.12, p: arms('hold', { rootZ: -0.02, pelPitch: 6, chFlex: -4, nkFlex: -8, both: { HipF: 18, HipA: 5, Knee: 28 } }) },
      { t: 1.4, p: arms('relax', { rootZ: -0.04, pelPitch: 10, spFlex: 3, both: { HipF: 22, Knee: 30, Ank: 8 } }) },
      { t: 1.58, p: arms('down', { rootZ: -0.04, pelPitch: 12, spFlex: 4, both: { HipF: 24, Knee: 30, Ank: 8 } }) },
      { t: 1.78, p: 'ready' },
    ],
  });
  // step-back: plant, push back to create space, then rise
  clip('stepback', {
    dur: 1.62, events: { gather: 0.1, set: 0.6, release: 0.76 },
    jump: { t0: 0.6, t1: 1.05, h: 0.12 },
    feet: [[0, 'plant'], [0.6, 'air'], [1.05, 'plant']],
    steps: [{ t0: 0.02, t1: 0.14, foot: 'l', to: [0.6, -0.4], lift: 0.04 }, { t0: 0.18, t1: 0.4, foot: 'l', to: [-2.2, -0.45], lift: 0.07 }, { t0: 0.24, t1: 0.44, foot: 'r', to: [-1.9, 0.5], lift: 0.05 }],
    root: [[0, 0, 0], [0.14, 0.45, 0], [0.24, 0.1, 0], [0.44, -2.0, 0], [0.6, -2.1, 0], [1.05, -2.3, 0], [1.62, -2.3, 0]],
    keys: [
      { t: 0.0, p: { base: 'ready', rootZ: -0.07, pelPitch: 24, spFlex: 10, rShF: 30, rShA: 22, rElF: 60, rPro: 60, lShF: 50, lShA: 30, lElF: 85, lPro: 20 }, ball: [0.15, 0.14, 0.36], grip: 'right' },
      { t: 0.14, p: { base: 'shotPocket', rootZ: -0.1, pelPitch: 28, spFlex: 12, nkFlex: -20 }, ball: [0.06, 0.16, 0.48], grip: 'hold' },
      { t: 0.36, p: { base: 'shotPocket', rootZ: -0.05, pelPitch: 8, spFlex: 2, chFlex: -2 }, ball: [0.06, 0.14, 0.55], grip: 'hold' },
      { t: 0.48, p: arms('rise', { rootZ: -0.06, pelPitch: 14, spFlex: 4, chFlex: 2, nkFlex: -12, both: { HipF: 28, Knee: 42, Ank: 12 } }), ball: SB.rise, grip: 'jsRise' },
      { t: 0.55, p: arms('load', { rootZ: -0.03, pelPitch: 6, spFlex: 0, chFlex: -3, nkFlex: -9, hdFlex: -3, both: { HipF: 14, Knee: 20, Ank: -6 } }), ball: SB.load, grip: 'jsLoad' },
      { t: 0.62, p: 'shotSet', ball: SB.set, grip: 'jsSet' },
      { t: 0.7, p: arms('push', { rootZ: 0, pelPitch: 0, spFlex: -5, chFlex: -6, nkFlex: -9, hdFlex: -4, both: { HipF: 6, HipA: 4, Knee: 14, Ank: -34 } }), ball: SB.push, grip: 'jsPush' },
      { t: 0.76, p: arms('release', { rootZ: 0, pelPitch: 0, spFlex: -4, chFlex: -5, nkFlex: -8, hdFlex: -2, both: { HipF: 8, HipA: 4, Knee: 16, Ank: -36 } }), ball: SB.release, grip: 'shootRel' },
      { t: 0.82, p: 'shotFollow' },
      { t: 1.05, p: arms('hold', { rootZ: -0.02, pelPitch: 4, chFlex: -4, nkFlex: -8, both: { HipF: 18, HipA: 5, Knee: 28 } }) },
      { t: 1.3, p: arms('relax', { rootZ: -0.04, pelPitch: 10, spFlex: 3, both: { HipF: 22, Knee: 30, Ank: 8 } }) },
      { t: 1.46, p: arms('down', { rootZ: -0.04, pelPitch: 12, spFlex: 4, both: { HipF: 24, Knee: 30, Ank: 8 } }) },
      { t: 1.62, p: 'ready' },
    ],
  });
  // fadeaway: jump drifting back, torso leaning away, one knee up; the arm still goes up at the rim
  clip('fadeaway', {
    dur: 1.55, events: { set: 0.42, release: 0.66 },
    jump: { t0: 0.42, t1: 0.96, h: 0.15 },
    feet: [[0, 'plant'], [0.42, 'air'], [0.96, 'plant']],
    root: [[0, 0, 0], [0.42, 0, 0], [0.96, -1.9, 0.1], [1.2, -2.1, 0.1], [1.55, -2.1, 0.1]],
    keys: [
      { t: 0.0, p: 'shotPocket', ball: [0.07, 0.14, 0.53], grip: 'hold' },
      { t: 0.18, p: arms('dip', { rootZ: -0.09, pelPitch: 18, spFlex: 6, chFlex: 3, nkFlex: -14, both: { HipF: 34, Knee: 52, Ank: 16 } }), ball: SB.dip, grip: 'jsLow' },
      { t: 0.32, p: arms('rise', { rootZ: -0.03, pelPitch: 8, spFlex: 2, chFlex: -2, nkFlex: -10, both: { HipF: 14, Knee: 20, Ank: 0 } }), ball: SB.rise, grip: 'jsRise' },
      { t: 0.39, p: arms('load', { rootZ: -0.01, pelPitch: 4, spFlex: -2, chFlex: -5, nkFlex: -8, hdFlex: -3, both: { HipF: 10, Knee: 14, Ank: -12 } }), ball: SB.load, grip: 'jsLoad' },
      { t: 0.46, p: { base: 'shotSet', spFlex: -8, chFlex: -8 }, ball: SB.set, grip: 'jsSet' },
      // (leaning back: the arm comes further forward from the torso so it still points up at the rim)
      { t: 0.58, p: arms('push', { rootZ: 0, pelPitch: -5, spFlex: -12, chFlex: -8, nkFlex: 2, hdFlex: -4, lHipF: 10, lKnee: 16, rHipF: 50, rKnee: 66, both: { Ank: -30 } }), ball: SB.push, grip: 'jsPush' },
      { t: 0.66, p: arms('release', { rootZ: 0, pelPitch: -6, spFlex: -14, chFlex: -8, nkFlex: 4, hdFlex: -4, rShF: 136, lHipF: 10, lKnee: 16, rHipF: 55, rKnee: 70, both: { Ank: -30 } }), ball: SB.release, grip: 'shootRel' },
      { t: 0.72, p: { base: 'shotFollow', pelPitch: -6, spFlex: -14, chFlex: -8, rShF: 142, rHipF: 50, rKnee: 65 } },
      { t: 0.96, p: arms('hold', { rootZ: -0.03, pelPitch: 4, spFlex: -2, chFlex: -4, rShF: 150, both: { HipF: 20, HipA: 6, Knee: 30 } }) },
      { t: 1.2, p: arms('relax', { rootZ: -0.04, pelPitch: 8, spFlex: 3, both: { HipF: 22, Knee: 30, Ank: 8 } }) },
      { t: 1.36, p: arms('down', { rootZ: -0.04, pelPitch: 10, spFlex: 4, both: { HipF: 24, Knee: 30, Ank: 8 } }) },
      { t: 1.55, p: 'ready' },
    ],
  });

  // ------------------------------------------------------------ finishes at the rim
  // right-hand layup (the user's reference frames): gathered off the dribble at the right hip with both hands, carried
  // up the outside over the right-left steps, lifted over the right shoulder at the left-foot take-off with the right
  // knee driving, then the body goes vertical, the right arm straight up and the ball rolls off the finger pads at the
  // top while the left arm goes out for balance. Arms fitted to the rig at each phase (grips lay* in anims.js). The
  // take-off gets the hand up to the rim (~0.37 H, 24-33 in by athleticism, a guard's running one-foot jump) and the
  // airtime matches that height (T = sqrt(8h/g) ~ 0.76 s), so the rise and fall look like real gravity
  const LAY = {
    gather: { rShF: 7.5, rShA: 12, rShT: -14, rElF: 59.5, rPro: 21.5, rWrF: -3.5, rWrD: 25, lShF: 47.5, lShA: -18.5, lShT: 79.5, lElF: 64.5, lPro: 95, lWrF: -51, lWrD: -20 },
    carry: { rShF: 0.5, rShA: 17.5, rShT: -22.5, rElF: 108, rPro: 117.5, rWrF: -75, rWrD: 25, lShF: 80.5, lShA: -26.5, lShT: 80, lElF: 64.5, lPro: 70, lWrF: -52.5, lWrD: -20 },
    step2: { rShF: 8, rShA: 27, rShT: -37, rElF: 123.5, rPro: 106.5, rWrF: -75, rWrD: 25, lShF: 99.5, lShA: -33, lShT: 80, lElF: 65, lPro: 72.5, lWrF: -64.5, lWrD: -20 },
    takeoff: { rShF: 86, rShA: 8, rShT: 2, rElF: 96, rPro: 157.5, rWrF: -60, rWrD: 5.5, lShF: 120, lShA: -15.5, lShT: 46.5, lElF: 50.5, lPro: 64.5, lWrF: -36, lWrD: -8.5 },
    reach: { rShF: 122.5, rShA: -4.5, rShT: -5.5, rElF: 24, rPro: 154.5, rWrF: -75, rWrD: 25, lShF: 75, lShA: 55, lShT: 44.5, lElF: 42.5, lPro: 121, lWrF: 19, lWrD: -25, lFing: 0.3 },
    release: { rShF: 141, rShA: -6, rShT: 33.5, rElF: 0, rPro: 156, rWrF: -62.5, rWrD: -12.5, rFing: 0.15, lShF: 63.5, lShA: 58.5, lShT: 41.5, lElF: 40.5, lPro: 115, lWrF: 9.5, lWrD: -25, lFing: 0.3 },
  };
  const LAY_B = { gather: [0.14, 0.21, 0.5], carry: [0.17, 0.26, 0.6], step2: [0.2, 0.23, 0.72], takeoff: [0.13, 0.135, 1.04], reach: [0.1, 0.14, 1.16], release: [0.09, 0.15, 1.235] };
  A.LAY = LAY; A.LAY_B = LAY_B;
  clip('layup', {
    dur: 1.52, events: { gather: 0.04, set: 0.46, release: 0.8 },
    jump: { t0: 0.46, t1: 1.22, h: 0.37 },
    feet: [[0, 'plant'], [0.46, 'air'], [1.22, 'plant']],
    steps: [{ t0: 0.0, t1: 0.13, foot: 'r', to: [1.9, 0.35], lift: 0.1 }, { t0: 0.15, t1: 0.4, foot: 'l', to: [5.0, -0.3], lift: 0.12 }],
    root: [[0, 0, 0], [0.13, 1.7, 0.1], [0.4, 4.9, 0], [0.46, 5.6, 0], [0.8, 7.6, 0], [1.22, 9.7, 0], [1.52, 10.3, 0]],
    keys: [
      { t: 0.0, p: { base: 'ready', rootZ: -0.05, pelPitch: 16, spFlex: 10, rShF: 20, rShA: 22, rElF: 70, rPro: 60, lShF: 50, lShA: 30, lElF: 85, lPro: 20 }, ball: [0.15, 0.2, 0.4], grip: 'right' },
      { t: 0.12, p: Object.assign({ rootZ: -0.06, pelPitch: 18, spFlex: 10, chTwist: 10, nkFlex: -10 }, LAY.gather), ball: LAY_B.gather, grip: 'layGather' },
      { t: 0.26, p: Object.assign({ rootZ: -0.065, pelPitch: 16.8, pelRoll: 2.1, spFlex: 8.4, spLat: -1.1, chFlex: 1.3, chTwist: 8.9, nkFlex: -9.4, hdFlex: 5.3, lHipF: 20.2, lHipA: 3.7, lHipT: -5.9, lKnee: 29.3, lAnk: 1.8, rHipF: 5, rHipA: 1.5, rHipT: -5.9, rKnee: 29.1, rAnk: -1.5 }, LAY.carry), ball: LAY_B.carry, grip: 'layCarry' },
      { t: 0.4, p: Object.assign({ rootZ: -0.06, pelPitch: 14, spFlex: 6, chTwist: 6, nkFlex: -10, lHipF: 30, lKnee: 45, rHipF: 20, rKnee: 60 }, LAY.step2), ball: LAY_B.step2, grip: 'layStep' },
      { t: 0.52, p: Object.assign({ rootZ: 0, pelPitch: 2, spFlex: -2, chFlex: -6, nkFlex: -14, hdFlex: -8, rHipF: 95, rKnee: 100, rAnk: 10, lHipF: -5, lKnee: 12, lAnk: -35 }, LAY.takeoff), ball: LAY_B.takeoff, grip: 'layLift' },
      { t: 0.66, p: Object.assign({ rootZ: 0.004, pelPitch: 0, pelRoll: 2, spFlex: -3.7, spLat: -1, chFlex: -7.6, nkFlex: -16.6, hdFlex: -10.8, lHipF: -5.6, lHipA: 4, lHipT: -6, lKnee: 13.4, lAnk: -39.8, rHipF: 97, rHipA: 2, rHipT: -6, rKnee: 102, rAnk: 5.7 }, LAY.reach), ball: LAY_B.reach, grip: 'layReach' },
      { t: 0.8, p: Object.assign({ rootZ: 0, pelPitch: 0, spFlex: -4, chFlex: -8, nkFlex: -18, hdFlex: -10, rHipF: 85, rKnee: 95, lHipF: 0, lKnee: 20, lAnk: -35 }, LAY.release), ball: LAY_B.release, grip: 'layRel' },
      // follow-through: the wrist has flicked the ball up off the fingers, the arm stays up, the left arm out
      { t: 0.96, p: { rootZ: 0, pelPitch: 2, spFlex: -2, chFlex: -6, nkFlex: -14, rShF: 146, rShA: -4, rShT: 30, rElF: 6, rPro: 140, rWrF: 45, rFing: 0.3, lShF: 55, lShA: 55, lShT: 40, lElF: 40, lPro: 110, lWrF: 5, lFing: 0.3, rHipF: 60, rKnee: 70, lHipF: 10, lKnee: 25 } },
      { t: 1.22, p: { rootZ: -0.05, pelPitch: 14, spFlex: 6, lShF: 45, lShA: 30, lElF: 55, rShF: 70, rShA: 20, rElF: 45, both: { HipF: 30, HipA: 8, Knee: 42, Ank: 10 } } },
      { t: 1.52, p: 'ready' },
    ],
  });
  // reverse layup: along the baseline, finish on the far side, arm reaching back
  clip('reverse', {
    dur: 1.56, events: { gather: 0.04, set: 0.46, release: 0.82 },
    jump: { t0: 0.46, t1: 1.22, h: 0.37 },
    feet: [[0, 'plant'], [0.46, 'air'], [1.22, 'plant']],
    steps: [{ t0: 0.0, t1: 0.13, foot: 'r', to: [1.9, 0.35], lift: 0.1 }, { t0: 0.15, t1: 0.4, foot: 'l', to: [4.8, -0.3], lift: 0.12 }],
    root: [[0, 0, 0], [0.13, 1.7, 0.1], [0.4, 4.7, 0], [0.46, 5.4, 0], [0.82, 7.8, -0.3], [1.22, 9.5, -0.4], [1.56, 10.0, -0.4]],
    yaw: [[0, 0], [0.46, 0], [0.82, 40], [1.22, 60], [1.56, 60]],
    keys: [
      { t: 0.0, p: { base: 'ready', rootZ: -0.05, pelPitch: 16, spFlex: 10, rShF: 20, rShA: 22, rElF: 70, rPro: 60, lShF: 50, lShA: 30, lElF: 85, lPro: 20 }, ball: [0.15, 0.2, 0.4], grip: 'right' },
      { t: 0.12, p: { rootZ: -0.06, pelPitch: 18, spFlex: 10, nkFlex: -10, lShF: 40, lShA: 20, lShT: 25, lElF: 95, lPro: 20, rShF: 30, rShA: 18, rShT: 30, rElF: 100, rPro: 0, rWrF: -20 }, ball: [0.1, 0.16, 0.55], grip: 'hold' },
      { t: 0.38, p: { rootZ: -0.06, pelPitch: 14, spFlex: 6, nkFlex: -10, lShF: 60, lShA: 24, lShT: 25, lElF: 100, lPro: 10, rShF: 60, rShA: 16, rShT: 20, rElF: 110, rPro: 0, rWrF: -30, lHipF: 30, lKnee: 45, rHipF: 20, rKnee: 60 }, ball: [0.1, 0.16, 0.75], grip: 'hold' },
      { t: 0.58, p: { rootZ: 0, pelPitch: 0, spFlex: -6, chFlex: -8, chTwist: -20, nkFlex: -20, nkTwist: -30, lShF: 100, lShA: 30, lElF: 80, rShF: 150, rShA: 40, rElF: 40, rWrF: -30, rHipF: 90, rKnee: 100, lHipF: -5, lKnee: 12, lAnk: -35 }, ball: [0.15, 0.05, 1.15], grip: 'shoot' },
      { t: 0.82, p: { rootZ: 0, pelPitch: -4, spFlex: -10, chFlex: -8, chTwist: -30, nkFlex: -25, nkTwist: -35, lShF: 80, lShA: 40, lElF: 60, rShF: 170, rShA: 30, rElF: 10, rPro: 60, rWrF: 20, rHipF: 70, rKnee: 90, lKnee: 20 }, ball: [0.12, -0.02, 1.36], grip: 'rightTop' },
      { t: 1.22, p: { rootZ: -0.05, pelPitch: 14, spFlex: 6, lShF: 45, lShA: 26, lElF: 55, rShF: 70, rShA: 20, rElF: 45, both: { HipF: 30, HipA: 8, Knee: 42, Ank: 10 } } },
      { t: 1.56, p: 'ready' },
    ],
  });
  // floater: early one-hand push release with a high arc, short jump
  clip('floater', {
    dur: 1.1, events: { gather: 0.04, set: 0.32, release: 0.5 },
    jump: { t0: 0.32, t1: 0.8, h: 0.14 },
    feet: [[0, 'plant'], [0.32, 'air'], [0.8, 'plant']],
    steps: [{ t0: 0.02, t1: 0.26, foot: 'l', to: [2.4, -0.3], lift: 0.1 }],
    root: [[0, 0, 0], [0.26, 2.2, 0], [0.32, 2.7, 0], [0.8, 4.2, 0], [1.1, 4.5, 0]],
    keys: [
      { t: 0.0, p: { base: 'ready', rootZ: -0.06, pelPitch: 18, spFlex: 10, rShF: 20, rShA: 22, rElF: 70, rPro: 60, lShF: 50, lShA: 30, lElF: 85, lPro: 20 }, ball: [0.15, 0.2, 0.4], grip: 'right' },
      { t: 0.22, p: { rootZ: -0.08, pelPitch: 16, spFlex: 8, lShF: 60, lShA: 24, lElF: 100, rShF: 60, rShA: 16, rElF: 110, rPro: 0, rWrF: -30, lHipF: 30, lKnee: 45, rHipF: 30, rKnee: 60 }, ball: [0.08, 0.16, 0.75], grip: 'hold' },
      { t: 0.36, p: { rootZ: 0, pelPitch: 4, spFlex: -2, chFlex: -6, nkFlex: -12, lShF: 100, lShA: 34, lElF: 70, rShF: 130, rShA: 14, rElF: 80, rPro: 0, rWrF: -60, rHipF: 60, rKnee: 70, lKnee: 15, lAnk: -30 }, ball: [0.06, 0.12, 1.05], grip: 'shoot' },
      { t: 0.5, p: { rootZ: 0, pelPitch: 2, spFlex: -4, chFlex: -6, nkFlex: -14, lShF: 90, lShA: 40, lElF: 50, rShF: 155, rShA: 12, rElF: 25, rPro: 10, rWrF: 60, rFing: 0.3, rHipF: 55, rKnee: 65, lKnee: 18, lAnk: -30 }, ball: [0.05, 0.2, 1.22], grip: 'shootRel' },
      { t: 0.8, p: { rootZ: -0.04, pelPitch: 10, spFlex: 2, lShF: 50, lShA: 30, lElF: 50, rShF: 110, rShA: 14, rElF: 20, rWrF: 60, both: { HipF: 24, Knee: 34, Ank: 8 } } },
      { t: 1.1, p: 'ready' },
    ],
  });
  // hook shot: sideways to the rim, sweeping arm over the head
  clip('hook', {
    dur: 1.3, events: { set: 0.4, release: 0.62 },
    jump: { t0: 0.4, t1: 0.88, h: 0.13 },
    feet: [[0, 'plant'], [0.4, 'air'], [0.88, 'plant']],
    steps: [{ t0: 0.05, t1: 0.3, foot: 'l', to: [0.8, -1.2], lift: 0.06 }],
    root: [[0, 0, 0], [0.3, 0.5, -0.6], [0.4, 0.6, -0.7], [0.88, 1.0, -0.9], [1.3, 1.0, -0.9]],
    yaw: [[0, 0], [0.3, -20], [0.62, -35], [1.3, -30]],
    keys: [
      { t: 0.0, p: { base: 'holdChest', rootZ: -0.07, pelPitch: 20, spFlex: 8 }, ball: [0.04, 0.16, 0.62], grip: 'hold' },
      { t: 0.28, p: { rootZ: -0.08, pelPitch: 14, spFlex: 6, spLat: 8, chTwist: 10, nkFlex: -12, nkTwist: 25, lShF: 70, lShA: 50, lElF: 90, rShF: 60, rShA: 50, rElF: 100, rWrF: -30, both: { HipF: 30, Knee: 45 } }, ball: [0.12, 0.08, 0.8], grip: 'right' },
      { t: 0.44, p: { rootZ: 0, pelPitch: 4, spLat: 16, chLat: 8, nkFlex: -10, nkTwist: 30, lShF: 50, lShA: 60, lElF: 80, rShF: 60, rShA: 130, rElF: 40, rWrF: -20, rHipF: 70, rKnee: 80, lKnee: 15, lAnk: -30 }, ball: [0.35, 0.04, 1.2], grip: 'rightTop' },
      { t: 0.62, p: { rootZ: 0, pelPitch: 2, spLat: 18, chLat: 10, nkFlex: -14, nkTwist: 30, lShF: 40, lShA: 55, lElF: 70, rShF: 40, rShA: 165, rElF: 10, rWrF: 40, rFing: 0.3, rHipF: 60, rKnee: 70, lKnee: 18 }, ball: [0.1, 0.02, 1.4], grip: 'rightTop' },
      { t: 0.88, p: { rootZ: -0.04, pelPitch: 10, spLat: 6, lShF: 40, lShA: 30, lElF: 50, rShF: 90, rShA: 60, rElF: 30, both: { HipF: 24, Knee: 34 } } },
      { t: 1.3, p: 'ready' },
    ],
  });
  // one-hand dunk: two steps, big jump, ball cocked back then thrown through the rim, optional rim hang
  clip('dunk', {
    dur: 1.6, events: { gather: 0.04, set: 0.5, release: 0.86, rim: 0.9 },
    jump: { t0: 0.46, t1: 1.26, h: 0.4, hang: [0.9, 1.08] },
    feet: [[0, 'plant'], [0.46, 'air'], [1.26, 'plant']],
    steps: [{ t0: 0.0, t1: 0.13, foot: 'r', to: [1.9, 0.35], lift: 0.1 }, { t0: 0.15, t1: 0.4, foot: 'l', to: [5.0, -0.3], lift: 0.12 }],
    root: [[0, 0, 0], [0.13, 1.7, 0.1], [0.4, 4.9, 0], [0.46, 5.5, 0], [0.86, 7.6, 0], [1.08, 8.0, 0], [1.26, 8.3, 0], [1.6, 8.6, 0]],
    keys: [
      { t: 0.0, p: { base: 'ready', rootZ: -0.05, pelPitch: 16, spFlex: 10, rShF: 20, rShA: 22, rElF: 70, rPro: 60, lShF: 50, lShA: 30, lElF: 85, lPro: 20 }, ball: [0.15, 0.2, 0.4], grip: 'right' },
      { t: 0.14, p: { rootZ: -0.07, pelPitch: 18, spFlex: 10, nkFlex: -10, lShF: 40, lShA: 20, lShT: 25, lElF: 95, lPro: 20, rShF: 30, rShA: 18, rShT: 30, rElF: 100, rPro: 0, rWrF: -20 }, ball: [0.1, 0.16, 0.55], grip: 'hold' },
      { t: 0.4, p: { rootZ: -0.09, pelPitch: 20, spFlex: 8, nkFlex: -14, lShF: -20, lShA: 20, lElF: 40, rShF: 40, rShA: 20, rElF: 90, rWrF: -20, both: { HipF: 45, Knee: 70, Ank: 20 } }, ball: [0.14, 0.12, 0.55], grip: 'right' },
      { t: 0.6, p: { rootZ: 0, pelPitch: 0, spFlex: -8, chFlex: -8, nkFlex: -20, lShF: 120, lShA: 30, lElF: 40, rShF: 175, rShA: 20, rElF: 70, rPro: 20, rWrF: -40, rHipF: 60, rKnee: 90, lHipF: 10, lKnee: 40, lAnk: -30 }, ball: [0.1, -0.04, 1.35], grip: 'rightTop' },
      { t: 0.86, p: { rootZ: 0, pelPitch: 4, spFlex: 4, chFlex: 0, nkFlex: -24, lShF: 110, lShA: 36, lElF: 40, rShF: 150, rShA: 16, rElF: 10, rPro: 20, rWrF: 30, rFing: 0.5, rHipF: 40, rKnee: 70, lHipF: 20, lKnee: 60 }, ball: [0.1, 0.3, 1.32], grip: 'slam' },
      { t: 1.0, p: { rootZ: 0, pelPitch: 0, spFlex: -2, nkFlex: -30, lShF: 90, lShA: 40, lElF: 40, rShF: 170, rShA: 14, rElF: 6, rWrF: 20, rFing: 0.9, rHipF: 30, rKnee: 60, lHipF: 30, lKnee: 60 } },
      { t: 1.26, p: { rootZ: -0.08, pelPitch: 18, spFlex: 8, lShF: 60, lShA: 40, lElF: 70, rShF: 80, rShA: 30, rElF: 60, rFing: 0.9, both: { HipF: 40, HipA: 8, Knee: 55, Ank: 14 } } },
      { t: 1.6, p: { base: 'stand', rootZ: -0.02, lShF: 30, lShA: 30, lElF: 90, rShF: 30, rShA: 30, rElF: 90, both: { Fing: 0.9 } } },
    ],
  });
  // two-hand power dunk
  clip('dunk2', {
    dur: 1.6, events: { gather: 0.04, set: 0.5, release: 0.86, rim: 0.9 },
    jump: { t0: 0.46, t1: 1.22, h: 0.38 },
    feet: [[0, 'plant'], [0.46, 'air'], [1.22, 'plant']],
    steps: [{ t0: 0.0, t1: 0.13, foot: 'r', to: [1.9, 0.35], lift: 0.1 }, { t0: 0.15, t1: 0.4, foot: 'l', to: [4.8, -0.3], lift: 0.1 }],
    root: [[0, 0, 0], [0.13, 1.7, 0], [0.4, 4.8, 0], [0.46, 5.4, 0], [0.86, 7.4, 0], [1.22, 8.1, 0], [1.6, 8.3, 0]],
    keys: [
      { t: 0.0, p: { base: 'ready', rootZ: -0.05, pelPitch: 16, spFlex: 10, rShF: 20, rShA: 22, rElF: 70, rPro: 60, lShF: 50, lShA: 30, lElF: 85, lPro: 20 }, ball: [0.15, 0.2, 0.4], grip: 'right' },
      { t: 0.14, p: { rootZ: -0.07, pelPitch: 18, spFlex: 10, nkFlex: -10, both: { ShF: 34, ShA: 20, ShT: 30, ElF: 100, Pro: 5, WrF: -30 } }, ball: [0.0, 0.16, 0.6], grip: 'hold' },
      { t: 0.4, p: { rootZ: -0.095, pelPitch: 24, spFlex: 10, nkFlex: -16, both: { ShF: 30, ShA: 20, ShT: 30, ElF: 90, Pro: 5, WrF: -30, HipF: 50, Knee: 75, Ank: 20 } }, ball: [0.0, 0.2, 0.45], grip: 'hold' },
      { t: 0.64, p: { rootZ: 0, pelPitch: -4, spFlex: -14, chFlex: -8, nkFlex: -20, both: { ShF: 170, ShA: 22, ShT: 0, ElF: 60, Pro: 10, WrF: -30, HipF: 40, Knee: 80, Ank: -30 } }, ball: [0.0, -0.06, 1.4], grip: 'over' },
      { t: 0.86, p: { rootZ: 0, pelPitch: 6, spFlex: 8, chFlex: 4, nkFlex: -26, both: { ShF: 140, ShA: 22, ShT: 0, ElF: 14, Pro: 10, WrF: 30, Fing: 0.5, HipF: 30, Knee: 70 } }, ball: [0.0, 0.3, 1.3], grip: 'over' },
      { t: 1.0, p: { rootZ: 0, pelPitch: 0, spFlex: -2, nkFlex: -30, both: { ShF: 165, ShA: 20, ElF: 8, Fing: 0.9, HipF: 30, Knee: 60 } } },
      { t: 1.22, p: { rootZ: -0.09, pelPitch: 20, spFlex: 8, both: { ShF: 60, ShA: 40, ElF: 70, Fing: 0.9, HipF: 44, HipA: 8, Knee: 58, Ank: 14 } } },
      { t: 1.6, p: { base: 'stand', both: { ShF: 20, ShA: 40, ElF: 100, Fing: 0.9 } } },
    ],
  });
  // alley-oop: take off, catch the lob in the air, throw it down
  clip('alley', {
    dur: 1.5, events: { set: 0.3, catch: 0.62, release: 0.84, rim: 0.88 },
    jump: { t0: 0.36, t1: 1.16, h: 0.4 },
    feet: [[0, 'plant'], [0.36, 'air'], [1.16, 'plant']],
    steps: [{ t0: 0.02, t1: 0.3, foot: 'l', to: [3.0, -0.3], lift: 0.1 }],
    root: [[0, 0, 0], [0.3, 3.0, 0], [0.36, 3.6, 0], [0.84, 5.8, 0], [1.16, 6.4, 0], [1.5, 6.6, 0]],
    keys: [
      { t: 0.0, p: { base: 'ready', rootZ: -0.04, pelPitch: 14, spFlex: 8, nkFlex: -20 } },
      { t: 0.3, p: { rootZ: -0.09, pelPitch: 22, spFlex: 8, nkFlex: -24, both: { ShF: -25, ShA: 20, ElF: 30, HipF: 45, Knee: 70, Ank: 20 } } },
      { t: 0.56, p: { rootZ: 0, pelPitch: 0, spFlex: -10, chFlex: -8, nkFlex: -34, both: { ShF: 165, ShA: 26, ElF: 30, Pro: 10, WrF: -20, Fing: 0.1, HipF: 50, Knee: 90, Ank: -30 } } },
      { t: 0.62, p: { rootZ: 0, pelPitch: 0, spFlex: -10, chFlex: -8, nkFlex: -32, both: { ShF: 168, ShA: 22, ElF: 40, Pro: 10, WrF: -30, HipF: 45, Knee: 85 } }, ball: [0.0, 0.0, 1.45], grip: 'over' },
      { t: 0.84, p: { rootZ: 0, pelPitch: 8, spFlex: 8, nkFlex: -26, both: { ShF: 145, ShA: 22, ElF: 12, WrF: 30, Fing: 0.5, HipF: 30, Knee: 70 } }, ball: [0.0, 0.3, 1.32], grip: 'over' },
      { t: 1.16, p: { rootZ: -0.09, pelPitch: 20, spFlex: 8, both: { ShF: 60, ShA: 40, ElF: 70, HipF: 44, HipA: 8, Knee: 58, Ank: 14 } } },
      { t: 1.5, p: 'ready' },
    ],
  });
  // putback / power layup from a standstill near the rim: gather, two-foot jump, extend, release
  clip('putback', {
    dur: 1.33, events: { set: 0.3, release: 0.63 },
    jump: { t0: 0.3, t1: 0.99, h: 0.3 },
    feet: [[0, 'plant'], [0.3, 'air'], [0.99, 'plant']],
    root: [[0, 0, 0], [0.3, 0.2, 0], [0.99, 0.9, 0], [1.33, 1.0, 0]],
    keys: [
      { t: 0.0, p: { base: 'holdChest', rootZ: -0.06, pelPitch: 20, spFlex: 8 }, ball: [0.02, 0.16, 0.62], grip: 'hold' },
      { t: 0.24, p: { base: 'holdChest', rootZ: -0.12, pelPitch: 26, spFlex: 10, nkFlex: -24, both: { ShF: 40, ShA: 24, ElF: 100, HipF: 48, Knee: 72, Ank: 20 } }, ball: [0.04, 0.18, 0.55], grip: 'hold' },
      { t: 0.42, p: { rootZ: 0, pelPitch: 2, spFlex: -6, chFlex: -6, nkFlex: -26, lShF: 100, lShA: 30, lElF: 70, rShF: 150, rShA: 16, rElF: 60, rWrF: -40, both: { HipF: 14, Knee: 26, Ank: -30 } }, ball: [0.08, 0.1, 1.15], grip: 'shoot' },
      { t: 0.63, p: { rootZ: 0, pelPitch: 0, spFlex: -6, chFlex: -8, nkFlex: -28, lShF: 70, lShA: 36, lElF: 60, rShF: 168, rShA: 12, rShT: 20, rElF: 12, rPro: 150, rWrF: 30, rFing: 0.2, both: { HipF: 12, Knee: 24, Ank: -32 } }, ball: [0.08, 0.2, 1.36], grip: 'rightTop' },
      { t: 0.99, p: { rootZ: -0.06, pelPitch: 16, spFlex: 6, lShF: 45, lShA: 26, lElF: 55, rShF: 80, rShA: 20, rElF: 40, both: { HipF: 32, HipA: 8, Knee: 44, Ank: 10 } } },
      { t: 1.33, p: 'ready' },
    ],
  });
  clip('putbackDunk', {
    dur: 1.35, events: { set: 0.3, release: 0.62, rim: 0.66 },
    jump: { t0: 0.3, t1: 1.0, h: 0.32, hang: [0.66, 0.8] },
    feet: [[0, 'plant'], [0.3, 'air'], [1.0, 'plant']],
    root: [[0, 0, 0], [0.3, 0.2, 0], [0.62, 1.0, 0], [1.0, 1.3, 0], [1.35, 1.4, 0]],
    keys: [
      { t: 0.0, p: { base: 'holdChest', rootZ: -0.06, pelPitch: 20, spFlex: 8 }, ball: [0.0, 0.16, 0.62], grip: 'hold' },
      { t: 0.24, p: { base: 'holdChest', rootZ: -0.12, pelPitch: 26, spFlex: 10, nkFlex: -24, both: { ShF: 36, ShA: 22, ElF: 100, HipF: 50, Knee: 74, Ank: 20 } }, ball: [0.0, 0.2, 0.5], grip: 'hold' },
      { t: 0.46, p: { rootZ: 0, pelPitch: -4, spFlex: -12, chFlex: -8, nkFlex: -24, both: { ShF: 172, ShA: 22, ElF: 50, Pro: 10, WrF: -30, HipF: 30, Knee: 60, Ank: -30 } }, ball: [0.0, -0.04, 1.42], grip: 'over' },
      { t: 0.62, p: { rootZ: 0, pelPitch: 6, spFlex: 8, chFlex: 4, nkFlex: -26, both: { ShF: 145, ShA: 22, ElF: 12, WrF: 30, Fing: 0.5, HipF: 30, Knee: 60 } }, ball: [0.0, 0.3, 1.32], grip: 'over' },
      { t: 0.78, p: { rootZ: 0, pelPitch: 0, spFlex: -2, nkFlex: -30, both: { ShF: 166, ShA: 20, ElF: 8, Fing: 0.9, HipF: 26, Knee: 56 } } },
      { t: 1.0, p: { rootZ: -0.09, pelPitch: 20, spFlex: 8, both: { ShF: 60, ShA: 40, ElF: 70, HipF: 44, HipA: 8, Knee: 58, Ank: 14 } } },
      { t: 1.35, p: 'ready' },
    ],
  });
  // tip-in: quick jump, one hand taps the ball at the apex
  clip('tip', {
    dur: 1.05, events: { set: 0.22, release: 0.42 },
    jump: { t0: 0.2, t1: 0.74, h: 0.25 },
    feet: [[0, 'plant'], [0.2, 'air'], [0.74, 'plant']],
    keys: [
      { t: 0.0, p: { base: 'ready', rootZ: -0.1, pelPitch: 22, nkFlex: -30, both: { ShF: 60, ShA: 20, ElF: 60, HipF: 44, Knee: 64 } }, ball: [0.1, 0.2, 1.3], grip: 'rightTop' },
      { t: 0.22, p: { rootZ: 0, pelPitch: 0, spFlex: -6, nkFlex: -36, lShF: 150, lShA: 30, lElF: 30, rShF: 172, rShA: 14, rElF: 10, rWrF: -20, both: { HipF: 10, Knee: 20, Ank: -30 } }, ball: [0.08, 0.1, 1.35], grip: 'rightTop' },
      { t: 0.42, p: { rootZ: 0, pelPitch: 0, spFlex: -6, nkFlex: -36, lShF: 140, lShA: 34, lElF: 30, rShF: 170, rShA: 12, rElF: 8, rWrF: 40, rFing: 0.2, both: { HipF: 14, Knee: 26, Ank: -30 } }, ball: [0.08, 0.16, 1.38], grip: 'rightTop' },
      { t: 0.74, p: { rootZ: -0.06, pelPitch: 16, spFlex: 6, both: { ShF: 60, ShA: 30, ElF: 50, HipF: 32, Knee: 44 } } },
      { t: 1.05, p: 'ready' },
    ],
  });

  // ------------------------------------------------------------ rebounding / defense
  // rebound: load, jump, two hands up, grab at the apex, chin it on the way down (elbows out)
  clip('rebound', {
    dur: 1.25, events: { set: 0.22, grab: 0.5 },
    jump: { t0: 0.24, t1: 0.8, h: 0.24 },
    feet: [[0, 'plant'], [0.24, 'air'], [0.8, 'plant']],
    keys: [
      { t: 0.0, p: { base: 'ready', rootZ: -0.08, pelPitch: 24, spFlex: 8, nkFlex: -34, hdFlex: -10, both: { ShF: 80, ShA: 30, ElF: 70, HipF: 40, Knee: 58 } } },
      { t: 0.2, p: { rootZ: -0.12, pelPitch: 26, spFlex: 8, nkFlex: -30, both: { ShF: 40, ShA: 30, ElF: 60, HipF: 50, Knee: 76, Ank: 20 } } },
      { t: 0.4, p: { rootZ: 0, pelPitch: 0, spFlex: -8, chFlex: -6, nkFlex: -40, hdFlex: -10, both: { ShF: 172, ShA: 20, ShT: 0, ElF: 20, Pro: 20, WrF: -20, Fing: 0.1, HipF: 20, Knee: 34, Ank: -30 } } },
      { t: 0.5, p: { rootZ: 0, pelPitch: 0, spFlex: -8, chFlex: -6, nkFlex: -38, both: { ShF: 170, ShA: 18, ElF: 26, Pro: 15, WrF: -10, HipF: 22, Knee: 36, Ank: -30 } }, ball: [0.0, 0.08, 1.42], grip: 'over' },
      { t: 0.7, p: { rootZ: 0, pelPitch: 8, spFlex: 6, chFlex: 4, nkFlex: -18, both: { ShF: 70, ShA: 55, ShT: 30, ElF: 120, Pro: 10, WrF: -30, HipF: 30, Knee: 44 } }, ball: [0.0, 0.18, 0.86], grip: 'hold' },
      { t: 0.8, p: { rootZ: -0.08, pelPitch: 22, spFlex: 10, chFlex: 6, nkFlex: -16, both: { ShF: 60, ShA: 60, ShT: 30, ElF: 125, Pro: 10, WrF: -30, HipF: 44, HipA: 10, Knee: 62, Ank: 18 } }, ball: [0.0, 0.2, 0.74], grip: 'hold' },
      { t: 1.25, p: { base: 'holdChest', rootZ: -0.06, both: { ShA: 40 } }, ball: [0.0, 0.18, 0.7], grip: 'hold' },
    ],
  });
  // closeout contest with a jump (tight contest)
  clip('contestJump', {
    dur: 0.95, events: { set: 0.18 },
    jump: { t0: 0.16, t1: 0.66, h: 0.18 },
    feet: [[0, 'plant'], [0.16, 'air'], [0.66, 'plant']],
    keys: [
      { t: 0.0, p: { base: 'contest', rootZ: -0.08, pelPitch: 18, both: { HipF: 36, Knee: 50 } } },
      { t: 0.22, p: { rootZ: 0, pelPitch: 2, spFlex: -4, chFlex: -6, nkFlex: -24, lShF: 60, lShA: 50, lElF: 40, rShF: 172, rShA: 10, rElF: 6, rPro: 60, rWrF: -10, rFing: 0.05, both: { HipF: 14, Knee: 26, Ank: -30 } } },
      { t: 0.5, p: { rootZ: 0, pelPitch: 4, spFlex: -2, nkFlex: -20, lShF: 50, lShA: 50, lElF: 40, rShF: 168, rShA: 12, rElF: 8, both: { HipF: 18, Knee: 30, Ank: -20 } } },
      { t: 0.66, p: { rootZ: -0.06, pelPitch: 14, spFlex: 4, lShF: 40, lShA: 40, rShF: 120, rShA: 20, rElF: 30, both: { HipF: 30, Knee: 44, Ank: 10 } } },
      { t: 0.95, p: 'defense' },
    ],
  });
  // verticality at the rim: set in the driver's path, straight up with both arms straight overhead and the body
  // vertical (NBA verticality: set before the shooter goes up, jump straight up, no leaning or jackknifing)
  clip('wallUp', {
    dur: 0.9, events: { set: 0.14 },
    jump: { t0: 0.14, t1: 0.62, h: 0.16 },
    feet: [[0, 'plant'], [0.14, 'air'], [0.62, 'plant']],
    keys: [
      { t: 0.0, p: { base: 'contest', rootZ: -0.08, pelPitch: 14, both: { ShF: 150, ShA: 12, ElF: 30, HipF: 34, Knee: 48 } } },
      { t: 0.2, p: { rootZ: 0, pelPitch: 0, spFlex: -2, chFlex: -2, nkFlex: -14, both: { ShF: 174, ShA: 8, ShT: 0, ElF: 4, Pro: 90, WrF: -12, Fing: 0.05, HipF: 10, Knee: 18, Ank: -28 } } },
      { t: 0.48, p: { rootZ: 0, pelPitch: 2, spFlex: 0, nkFlex: -12, both: { ShF: 172, ShA: 10, ElF: 6, Pro: 90, WrF: -10, HipF: 14, Knee: 24, Ank: -20 } } },
      { t: 0.62, p: { rootZ: -0.06, pelPitch: 12, spFlex: 4, both: { ShF: 140, ShA: 16, ElF: 24, HipF: 30, Knee: 44, Ank: 10 } } },
      { t: 0.9, p: 'defense' },
    ],
  });
  // contest without leaving the floor: high hand up toward the shooter
  clip('contestUp', {
    dur: 0.9, mask: 'upper',
    keys: [
      { t: 0.0, p: 'defense' },
      { t: 0.18, p: { base: 'contest' } },
      { t: 0.65, p: { base: 'contest', rShF: 168 } },
      { t: 0.9, p: 'defense' },
    ],
  });
  // block attempt: jump, swat arm sweeping through the ball
  clip('block', {
    dur: 1.05, events: { set: 0.18, swat: 0.38 },
    jump: { t0: 0.16, t1: 0.74, h: 0.28 },
    feet: [[0, 'plant'], [0.16, 'air'], [0.74, 'plant']],
    keys: [
      { t: 0.0, p: { base: 'contest', rootZ: -0.1, pelPitch: 20, both: { HipF: 40, Knee: 58 } } },
      { t: 0.26, p: { rootZ: 0, pelPitch: -2, spFlex: -8, chFlex: -6, nkFlex: -30, lShF: 80, lShA: 50, lElF: 40, rShF: 178, rShA: 20, rElF: 20, rPro: 70, rWrF: -30, rFing: 0.05, both: { HipF: 20, Knee: 40, Ank: -30 } } },
      { t: 0.4, p: { rootZ: 0, pelPitch: 6, spFlex: 6, chFlex: 2, nkFlex: -24, lShF: 60, lShA: 50, lElF: 40, rShF: 130, rShA: 10, rElF: 10, rPro: 70, rWrF: 40, both: { HipF: 26, Knee: 44, Ank: -20 } } },
      { t: 0.74, p: { rootZ: -0.07, pelPitch: 16, spFlex: 6, lShF: 40, lShA: 40, rShF: 60, rShA: 30, rElF: 30, both: { HipF: 34, Knee: 50, Ank: 12 } } },
      { t: 1.05, p: 'defense' },
    ],
  });
  // on-ball steal swipe (upper body)
  clip('swipe', {
    dur: 0.55, mask: 'upper', events: { contact: 0.2 },
    keys: [
      { t: 0.0, p: 'defense' },
      { t: 0.2, p: { base: 'defense', spFlex: 16, chFlex: 6, chTwist: -18, rShF: 70, rShA: 10, rShT: 30, rElF: 10, rPro: 80, rWrF: 20, lShF: 20, lShA: 50 } },
      { t: 0.55, p: 'defense' },
    ],
  });
  // passing-lane interception lunge
  clip('intercept', {
    dur: 0.9, events: { catch: 0.34 },
    root: [[0, 0, 0], [0.34, 3.2, 0], [0.9, 4.2, 0]],
    steps: [{ t0: 0.02, t1: 0.3, foot: 'r', to: [3.0, 0.4], lift: 0.08 }, { t0: 0.36, t1: 0.62, foot: 'l', to: [4.3, -0.4], lift: 0.06 }],
    keys: [
      { t: 0.0, p: 'defense' },
      { t: 0.34, p: { base: 'holdChest', rootZ: -0.1, pelPitch: 30, spFlex: 12, nkFlex: -20, both: { ShF: 75, ShA: 16, ElF: 30, Pro: 10, HipF: 50, Knee: 60 } }, ball: [0.0, 0.34, 0.66], grip: 'hold' },
      { t: 0.6, p: { base: 'holdChest', rootZ: -0.06 }, ball: [0.0, 0.18, 0.68], grip: 'hold' },
      { t: 0.9, p: 'holdChest', ball: [0.0, 0.16, 0.66], grip: 'hold' },
    ],
  });
  // offensive player takes a charge: fall backwards and get up
  clip('fall', {
    dur: 1.9, events: { contact: 0.08, floor: 0.45 },
    root: [[0, 0, 0], [0.45, -1.8, 0], [1.9, -1.8, 0]],
    feet: [[0, 'plant'], [0.1, 'air'], [1.2, 'plant']],
    keys: [
      { t: 0.0, p: 'defense' },
      { t: 0.12, p: { rootZ: -0.1, pelPitch: -10, spFlex: -20, nkFlex: 20, both: { ShF: 60, ShA: 40, ElF: 30, HipF: 40, Knee: 50 } } },
      { t: 0.45, p: { rootZ: -0.43, pelPitch: -60, spFlex: 10, chFlex: 10, nkFlex: 30, both: { ShF: 30, ShA: 50, ElF: 20, HipF: 70, Knee: 60, Ank: 10 } } },
      { t: 1.0, p: { rootZ: -0.43, pelPitch: -50, spFlex: 20, chFlex: 10, nkFlex: 20, both: { ShF: 10, ShA: 40, ElF: 20, HipF: 80, Knee: 80 } } },
      { t: 1.4, p: { rootZ: -0.2, pelPitch: 30, spFlex: 30, nkFlex: -10, both: { ShF: 30, ShA: 20, ElF: 30, HipF: 90, Knee: 110 } } },
      { t: 1.9, p: 'stand' },
    ],
  });

  // ------------------------------------------------------------ passing / catching
  const passBase = (name, dur, rel, keys, extra) => clip(name, Object.assign({ dur, mask: 'upper', events: { release: rel }, keys }, extra || {}));
  // (the pass arms are fitted to the rig like the chest pass: thumbs behind the ball, forearms turning in through
  // the release to thumbs down, palms out)
  passBase('passBounce', 0.62, 0.26, [
    { t: 0, p: 'holdChest', ball: [0.0, 0.16, 0.66], grip: 'hold' },
    { t: 0.14, p: { base: 'holdChest', pelPitch: 16, spFlex: 6, both: { ShF: -0.5, ShA: 15, ShT: 39, ElF: 119.5, Pro: 130.5, WrF: -70, WrD: 15, Fing: 0.1 } }, ball: [0.0, 0.16, 0.62], grip: 'passW' },
    { t: 0.26, p: { pelPitch: 24, spFlex: 16, chFlex: 8, nkFlex: -16, both: { ShF: 41, ShA: 5, ShT: 29, ElF: 87.5, Pro: 141, WrF: -70, WrD: 13.5, Fing: 0.08 } }, ball: [0.0, 0.3, 0.55], grip: 'passRB' },
    { t: 0.44, p: { pelPitch: 20, spFlex: 12, chFlex: 6, nkFlex: -14, both: { ShF: 87, ShA: 5.5, ShT: 80, ElF: 22, Pro: 166, WrF: -5, WrD: -15, Fing: 0.1 } } },
    { t: 0.62, p: 'ready' },
  ]);
  passBase('passOverhead', 0.7, 0.3, [
    { t: 0, p: 'holdChest', ball: [0.0, 0.16, 0.66], grip: 'hold' },
    { t: 0.16, p: { pelPitch: 2, spFlex: -6, chFlex: -6, nkFlex: -8, both: { ShF: 143, ShA: -4, ShT: 19, ElF: 56.5, Pro: 114, WrF: -27, WrD: -15, Fing: 0.1 } }, ball: [0.0, 0.02, 1.14], grip: 'overW' },
    { t: 0.3, p: { pelPitch: 12, spFlex: 8, chFlex: 4, nkFlex: -10, both: { ShF: 128, ShA: -12, ShT: 6, ElF: 73.5, Pro: 148.5, WrF: -15, WrD: -4, Fing: 0.08 } }, ball: [0.0, 0.3, 1.02], grip: 'overR' },
    { t: 0.5, p: { pelPitch: 10, spFlex: 6, nkFlex: -10, both: { ShF: 126, ShA: 5.5, ShT: 47, ElF: 34, Pro: 166, WrF: 39, WrD: -0.5, Fing: 0.1 } } },
    { t: 0.7, p: 'ready' },
  ]);
  // one-hand push pass off the dribble (kick-out / swing)
  passBase('passPush', 0.5, 0.18, [
    { t: 0, p: { base: 'ready', rShF: 40, rShA: 20, rElF: 90, rPro: 30 }, ball: [0.14, 0.16, 0.5], grip: 'right' },
    { t: 0.1, p: { base: 'ready', spTwist: 10, chTwist: 10, rShF: 45, rShA: 30, rShT: 30, rElF: 110, rPro: 0, rWrF: -50 }, ball: [0.12, 0.08, 0.62], grip: 'right' },
    { t: 0.18, p: { base: 'ready', spTwist: -8, chTwist: -10, rShF: 80, rShA: 12, rShT: 40, rElF: 12, rPro: 150, rWrF: 30, rFing: 0.1 }, ball: [0.1, 0.36, 0.72], grip: 'right' },
    { t: 0.34, p: { base: 'ready', spTwist: -6, chTwist: -8, rShF: 84, rShA: 8, rShT: 60, rElF: 8, rPro: 166, rWrF: 40, rWrD: -10, rFing: 0.12 } },
    { t: 0.5, p: 'ready' },
  ]);
  passBase('passLob', 0.72, 0.32, [
    { t: 0, p: 'holdChest', ball: [0.0, 0.16, 0.66], grip: 'hold' },
    { t: 0.16, p: { base: 'holdChest', pelPitch: 18, spFlex: 8, both: { ShF: 30, ShA: 26, ElF: 110, WrF: -40 } }, ball: [0.0, 0.12, 0.55], grip: 'hold' },
    { t: 0.32, p: { pelPitch: 2, spFlex: -6, chFlex: -6, nkFlex: -22, both: { ShF: 140, ShA: 8, ShT: 20, ElF: 20, Pro: 130, WrF: 10, Fing: 0.1 } }, ball: [0.0, 0.2, 1.12], grip: 'over' },
    { t: 0.52, p: { pelPitch: 4, spFlex: -2, nkFlex: -20, both: { ShF: 132, ShA: 10, ShT: 30, ElF: 18, Pro: 150, WrF: 40 } } },
    { t: 0.72, p: 'ready' },
  ]);
  // baseball-style outlet (right hand)
  clip('passOutlet', {
    dur: 0.8, mask: 'upper', events: { release: 0.36 },
    keys: [
      { t: 0, p: 'holdChest', ball: [0.0, 0.16, 0.66], grip: 'hold' },
      { t: 0.18, p: { base: 'holdChest', chTwist: 30, spTwist: 15, nkTwist: -30, rShF: 60, rShA: 80, rShT: -40, rElF: 90, rPro: 90, rWrF: -40, lShF: 70, lShA: 30, lElF: 60 }, ball: [0.22, -0.1, 1.0], grip: 'rightTop' },
      { t: 0.36, p: { base: 'holdChest', chTwist: -20, spTwist: -10, nkTwist: 10, rShF: 120, rShA: 30, rShT: 10, rElF: 10, rPro: 150, rWrF: 40, lShF: 40, lShA: 30, lElF: 60 }, ball: [0.1, 0.38, 1.0], grip: 'rightTop' },
      { t: 0.8, p: 'ready' },
    ],
  });
  // inbound: from overhead hold, two-hand overhead pass
  passBase('passInbound', 0.62, 0.26, [
    { t: 0, p: { pelPitch: 4, spFlex: -2, nkFlex: -8, both: { ShF: 150, ShA: 0, ShT: 15, ElF: 60, Pro: 110, WrF: -25, WrD: -10 } }, ball: [0.0, 0.0, 1.14], grip: 'overW' },
    { t: 0.12, p: { pelPitch: 0, spFlex: -8, chFlex: -6, nkFlex: -8, both: { ShF: 143, ShA: -4, ShT: 19, ElF: 64, Pro: 114, WrF: -30, WrD: -15 } }, ball: [0.0, -0.02, 1.14], grip: 'overW' },
    { t: 0.26, p: { pelPitch: 10, spFlex: 8, chFlex: 4, nkFlex: -10, both: { ShF: 128, ShA: -12, ShT: 6, ElF: 60, Pro: 148.5, WrF: -10, WrD: -4, Fing: 0.1 } }, ball: [0.0, 0.3, 0.98], grip: 'overR' },
    { t: 0.44, p: { pelPitch: 8, spFlex: 6, nkFlex: -10, both: { ShF: 124, ShA: 5, ShT: 47, ElF: 30, Pro: 166, WrF: 39, Fing: 0.1 } } },
    { t: 0.62, p: 'ready' },
  ]);
  // catch: hands present a target, absorb the ball into the chest
  clip('catch', {
    dur: 0.5, mask: 'upper', events: { catch: 0.18 },
    keys: [
      { t: 0.0, p: { base: 'ready', both: { ShF: 55, ShA: 24, ShT: 30, ElF: 60, Pro: 10, WrF: -20, Fing: 0.05 } } },
      { t: 0.18, p: { base: 'ready', both: { ShF: 58, ShA: 24, ShT: 34, ElF: 50, Pro: 5, WrF: -25, Fing: 0.1 } }, ball: [0.0, 0.3, 0.72], grip: 'hold' },
      { t: 0.34, p: { base: 'holdChest' }, ball: [0.0, 0.18, 0.68], grip: 'hold' },
      { t: 0.5, p: 'holdChest', ball: [0.0, 0.16, 0.66], grip: 'hold' },
    ],
  });
  // pick the ball up off the floor
  clip('pickup', {
    dur: 0.8, events: { grab: 0.34 },
    keys: [
      { t: 0.0, p: 'ready' },
      { t: 0.34, p: { rootZ: -0.2, pelPitch: 50, spFlex: 20, chFlex: 10, nkFlex: -20, both: { ShF: 60, ShA: 16, ElF: 20, Pro: 10, HipF: 80, Knee: 90, Ank: 25 } }, ball: [0.0, 0.3, 0.07], grip: 'hold' },
      { t: 0.6, p: { base: 'holdChest', rootZ: -0.06 }, ball: [0.0, 0.18, 0.62], grip: 'hold' },
      { t: 0.8, p: 'holdChest', ball: [0.0, 0.16, 0.66], grip: 'hold' },
    ],
  });

  // ------------------------------------------------------------ ball-handling
  clip('jab', {
    dur: 0.7, events: { jab: 0.2 },
    steps: [{ t0: 0.04, t1: 0.2, foot: 'r', to: [1.3, 0.45], lift: 0.05 }, { t0: 0.36, t1: 0.56, foot: 'r', to: [-0.35, 0.7], lift: 0.04 }],
    root: [[0, 0, 0], [0.2, 0.35, 0.1], [0.56, 0, 0], [0.7, 0, 0]],
    keys: [
      { t: 0.0, p: 'triple', ball: [0.095, 0.12, 0.53], grip: 'hip' },
      { t: 0.2, p: { base: 'triple', rootZ: -0.1, pelPitch: 30, spFlex: 16, nkFlex: -26, chTwist: 10 }, ball: [0.14, 0.12, 0.46], grip: 'hip' },
      { t: 0.5, p: 'triple', ball: [0.095, 0.12, 0.53], grip: 'hip' },
      { t: 0.7, p: 'triple', ball: [0.095, 0.12, 0.53], grip: 'hip' },
    ],
  });
  clip('spin', {
    dur: 0.62, events: { turn: 0.3 },
    root: [[0, 0, 0], [0.3, 1.2, -1.0], [0.62, 3.0, -1.6]],
    yaw: [[0, 0], [0.62, 360]],
    steps: [{ t0: 0.05, t1: 0.3, foot: 'r', to: [1.3, -1.9], lift: 0.06 }, { t0: 0.3, t1: 0.58, foot: 'l', to: [3.3, -1.3], lift: 0.06 }],
    keys: [
      { t: 0.0, p: { base: 'ready', rootZ: -0.08, pelPitch: 24, spFlex: 10 } },
      { t: 0.3, p: { base: 'ready', rootZ: -0.1, pelPitch: 26, spFlex: 12, lShF: 40, lShA: 60, lElF: 60, rShF: 20, rShA: 40, rElF: 60 } },
      { t: 0.62, p: { base: 'ready', rootZ: -0.08, pelPitch: 22, spFlex: 10 } },
    ],
  });
  clip('hesi', {
    dur: 0.6, mask: 'upper', events: { hesi: 0.25 },
    keys: [
      { t: 0.0, p: { base: 'ready', spFlex: 10, pelPitch: 20 } },
      { t: 0.25, p: { base: 'ready', spFlex: 0, pelPitch: 8, chFlex: -4, nkFlex: -6, lShF: 30, lShA: 30, lElF: 60 } },
      { t: 0.6, p: { base: 'ready', spFlex: 14, pelPitch: 26 } },
    ],
  });
  // post back-down step (with back to the basket)
  clip('backdown', {
    dur: 0.7, events: { bump: 0.3 },
    root: [[0, 0, 0], [0.3, -0.9, 0], [0.7, -1.0, 0]],
    steps: [{ t0: 0.06, t1: 0.28, foot: 'l', to: [-0.9, -0.95], lift: 0.04 }, { t0: 0.3, t1: 0.52, foot: 'r', to: [-0.8, 0.95], lift: 0.04 }],
    keys: [
      { t: 0.0, p: { base: 'defenseWide', rootZ: -0.1, pelPitch: 30, spFlex: 12, both: { ShF: 40, ShA: 50, ElF: 80 } } },
      { t: 0.3, p: { base: 'defenseWide', rootZ: -0.12, pelPitch: 26, spFlex: 6, chFlex: -6, both: { ShF: 36, ShA: 60, ElF: 90 } } },
      { t: 0.7, p: { base: 'defenseWide', rootZ: -0.1, pelPitch: 30, spFlex: 12, both: { ShF: 40, ShA: 50, ElF: 80 } } },
    ],
  });

  // ------------------------------------------------------------ reactions
  clip('fistPump', {
    dur: 1.2, mask: 'upper',
    keys: [
      { t: 0.0, p: 'stand' },
      { t: 0.25, p: { base: 'stand', spFlex: -4, chFlex: -6, nkFlex: -10, rShF: 60, rShA: 40, rShT: 20, rElF: 120, rPro: 10, rWrF: 0, rFing: 1 } },
      { t: 0.45, p: { base: 'stand', spFlex: 6, chFlex: 6, nkFlex: 6, rShF: 20, rShA: 20, rShT: 30, rElF: 125, rPro: 10, rFing: 1 } },
      { t: 0.7, p: { base: 'stand', spFlex: 4, chFlex: 4, rShF: 30, rShA: 24, rElF: 120, rFing: 1 } },
      { t: 1.2, p: 'stand' },
    ],
  });
  clip('flex', {
    dur: 1.4, mask: 'upper',
    keys: [
      { t: 0.0, p: 'stand' },
      { t: 0.3, p: { base: 'stand', spFlex: -6, chFlex: -10, nkFlex: -20, both: { ShF: 20, ShA: 85, ShT: -20, ElF: 120, Pro: 0, Fing: 1 } } },
      { t: 1.0, p: { base: 'stand', spFlex: -8, chFlex: -12, nkFlex: -24, both: { ShF: 20, ShA: 88, ShT: -20, ElF: 125, Pro: 0, Fing: 1 } } },
      { t: 1.4, p: 'stand' },
    ],
  });
  clip('threeFingers', {
    dur: 1.3, mask: 'upper',
    keys: [
      { t: 0.0, p: 'stand' },
      { t: 0.3, p: { base: 'stand', rShF: 150, rShA: 30, rElF: 30, rPro: 0, rFing: 0.2, lShF: 20, lShA: 20, lElF: 40 } },
      { t: 1.0, p: { base: 'stand', rShF: 152, rShA: 32, rElF: 25, rPro: 0, rFing: 0.2, lShF: 20, lShA: 20, lElF: 40 } },
      { t: 1.3, p: 'stand' },
    ],
  });
  clip('point', {
    dur: 1.1, mask: 'upper',
    keys: [
      { t: 0.0, p: 'stand' },
      { t: 0.25, p: { base: 'stand', rShF: 85, rShA: 20, rShT: -10, rElF: 10, rPro: 60, rFing: 0.6 } },
      { t: 0.8, p: { base: 'stand', rShF: 88, rShA: 22, rShT: -10, rElF: 8, rPro: 60, rFing: 0.6 } },
      { t: 1.1, p: 'stand' },
    ],
  });
  clip('clap', {
    dur: 1.0, mask: 'upper', loop: false,
    keys: [
      { t: 0.0, p: 'stand' },
      { t: 0.2, p: { base: 'stand', both: { ShF: 50, ShA: 30, ShT: 40, ElF: 90, Pro: 0 } } },
      { t: 0.35, p: { base: 'stand', both: { ShF: 52, ShA: 12, ShT: 50, ElF: 80, Pro: 0 } } },
      { t: 0.5, p: { base: 'stand', both: { ShF: 50, ShA: 30, ShT: 40, ElF: 90, Pro: 0 } } },
      { t: 0.65, p: { base: 'stand', both: { ShF: 52, ShA: 12, ShT: 50, ElF: 80, Pro: 0 } } },
      { t: 1.0, p: 'stand' },
    ],
  });
  clip('dejected', {
    dur: 1.8, mask: 'upper',
    keys: [
      { t: 0.0, p: 'stand' },
      { t: 0.4, p: { base: 'stand', spFlex: 6, nkFlex: 16, hdFlex: 10, both: { ShF: 150, ShA: 60, ShT: -30, ElF: 130, Pro: 40, Fing: 0.4 } } },
      { t: 1.3, p: { base: 'stand', spFlex: 8, nkFlex: 20, hdFlex: 10, both: { ShF: 148, ShA: 62, ShT: -30, ElF: 132, Pro: 40, Fing: 0.4 } } },
      { t: 1.8, p: 'handsHips' },
    ],
  });
  // jump ball: crouch, explode up, tap with the right hand at the apex
  clip('jumpTip', {
    dur: 1.25, events: { set: 0.3, tip: 0.6 },
    jump: { t0: 0.34, t1: 0.96, h: 0.32 },
    feet: [[0, 'plant'], [0.34, 'air'], [0.96, 'plant']],
    keys: [
      { t: 0.0, p: { base: 'ready', rootZ: -0.06, nkFlex: -30 } },
      { t: 0.3, p: { rootZ: -0.14, pelPitch: 26, spFlex: 8, nkFlex: -34, lShF: -10, lShA: 20, lElF: 30, rShF: 40, rShA: 20, rElF: 60, both: { HipF: 54, Knee: 82, Ank: 24 } } },
      { t: 0.6, p: { rootZ: 0, pelPitch: -2, spFlex: -8, chFlex: -6, nkFlex: -40, lShF: 60, lShA: 40, lElF: 40, rShF: 178, rShA: 12, rElF: 6, rPro: 50, rWrF: 20, both: { HipF: 10, Knee: 20, Ank: -30 } } },
      { t: 0.96, p: { rootZ: -0.06, pelPitch: 16, spFlex: 4, both: { ShF: 40, ShA: 30, ElF: 50, HipF: 30, Knee: 44 } } },
      { t: 1.25, p: 'ready' },
    ],
  });

  // ------------------------------------------------------------ referee signals (upper body)
  const refClip = (name, dur, keys, events) => clip(name, { dur, mask: 'upper', handed: false, events: events || {}, keys });
  refClip('refWhistle', 0.9, [
    { t: 0, p: 'stand' },
    { t: 0.15, p: { base: 'stand', rShF: 175, rShA: 10, rElF: 10, rPro: 0, rFing: 1, lShF: 40, lShA: 10, lElF: 100, lPro: 60 } },
    { t: 0.7, p: { base: 'stand', rShF: 176, rShA: 8, rElF: 8, rPro: 0, rFing: 1, lShF: 40, lShA: 10, lElF: 100, lPro: 60 } },
    { t: 0.9, p: 'stand' },
  ]);
  refClip('refFoul', 1.6, [
    { t: 0, p: 'stand' },
    { t: 0.15, p: { base: 'stand', rShF: 175, rShA: 10, rElF: 10, rPro: 0, rFing: 1 } },
    { t: 0.7, p: { base: 'stand', rShF: 176, rShA: 8, rElF: 8, rPro: 0, rFing: 1 } },
    { t: 0.95, p: { base: 'stand', rShF: 90, rShA: 30, rElF: 5, rPro: 60, rFing: 0.6 } },
    { t: 1.35, p: { base: 'stand', rShF: 90, rShA: 32, rElF: 5, rPro: 60, rFing: 0.6 } },
    { t: 1.6, p: 'stand' },
  ]);
  refClip('refThree', 1.6, [
    { t: 0, p: 'stand' },
    { t: 0.2, p: { base: 'stand', rShF: 160, rShA: 30, rElF: 10, rPro: 0, rFing: 0.2 } },
    { t: 1.3, p: { base: 'stand', rShF: 162, rShA: 30, rElF: 10, rPro: 0, rFing: 0.2 } },
    { t: 1.6, p: 'stand' },
  ]);
  refClip('refThreeGood', 1.6, [
    { t: 0, p: 'stand' },
    { t: 0.2, p: { base: 'stand', both: { ShF: 170, ShA: 20, ElF: 6, Pro: 0, Fing: 0.2 } } },
    { t: 1.2, p: { base: 'stand', both: { ShF: 172, ShA: 18, ElF: 6, Pro: 0, Fing: 0.2 } } },
    { t: 1.6, p: 'stand' },
  ]);
  refClip('refTravel', 1.4, [
    { t: 0, p: 'stand' },
    { t: 0.2, p: { base: 'stand', both: { ShF: 70, ShA: 10, ShT: 30, ElF: 100, Pro: 0, Fing: 1 } } },
    { t: 0.4, p: { base: 'stand', lShF: 85, lShA: 10, lShT: 30, lElF: 80, rShF: 60, rShA: 10, rShT: 30, rElF: 115, both: { Pro: 0, Fing: 1 } } },
    { t: 0.6, p: { base: 'stand', lShF: 60, lShA: 10, lShT: 30, lElF: 115, rShF: 85, rShA: 10, rShT: 30, rElF: 80, both: { Pro: 0, Fing: 1 } } },
    { t: 0.8, p: { base: 'stand', lShF: 85, lShA: 10, lShT: 30, lElF: 80, rShF: 60, rShA: 10, rShT: 30, rElF: 115, both: { Pro: 0, Fing: 1 } } },
    { t: 1.0, p: { base: 'stand', lShF: 60, lShA: 10, lShT: 30, lElF: 115, rShF: 85, rShA: 10, rShT: 30, rElF: 80, both: { Pro: 0, Fing: 1 } } },
    { t: 1.4, p: 'stand' },
  ]);
  refClip('refOut', 1.3, [
    { t: 0, p: 'stand' },
    { t: 0.25, p: { base: 'stand', rShF: 85, rShA: 80, rElF: 5, rPro: 60, rFing: 0.6 } },
    { t: 1.0, p: { base: 'stand', rShF: 86, rShA: 82, rElF: 5, rPro: 60, rFing: 0.6 } },
    { t: 1.3, p: 'stand' },
  ]);
  refClip('refTimeout', 1.3, [
    { t: 0, p: 'stand' },
    { t: 0.25, p: { base: 'stand', rShF: 110, rShA: 60, rShT: -20, rElF: 90, rPro: 90, lShF: 95, lShA: 10, lElF: 15, lPro: 0 } },
    { t: 1.0, p: { base: 'stand', rShF: 110, rShA: 62, rShT: -20, rElF: 90, rPro: 90, lShF: 95, lShA: 10, lElF: 15, lPro: 0 } },
    { t: 1.3, p: 'stand' },
  ]);
  refClip('refCharge', 1.4, [
    { t: 0, p: 'stand' },
    { t: 0.2, p: { base: 'stand', rShF: 175, rShA: 10, rElF: 10, rFing: 1 } },
    { t: 0.6, p: { base: 'stand', rShF: 150, rShA: 60, rShT: -30, rElF: 130, rPro: 40, lShF: 80, lShA: 30, lElF: 10, lPro: 60, lFing: 0.6 } },
    { t: 1.1, p: { base: 'stand', rShF: 150, rShA: 60, rShT: -30, rElF: 130, rPro: 40, lShF: 80, lShA: 30, lElF: 10, lPro: 60, lFing: 0.6 } },
    { t: 1.4, p: 'stand' },
  ]);
  refClip('refThreeSec', 1.3, [
    { t: 0, p: 'stand' },
    { t: 0.2, p: { base: 'stand', rShF: 95, rShA: 30, rElF: 30, rPro: 0, rFing: 0.2 } },
    { t: 1.0, p: { base: 'stand', rShF: 96, rShA: 30, rElF: 30, rPro: 0, rFing: 0.2 } },
    { t: 1.3, p: 'stand' },
  ]);
  refClip('refShotClock', 1.3, [
    { t: 0, p: 'stand' },
    { t: 0.2, p: { base: 'stand', rShF: 150, rShA: 60, rShT: -40, rElF: 125, rPro: 30, rFing: 0.4 } },
    { t: 0.5, p: { base: 'stand', rShF: 155, rShA: 55, rShT: -40, rElF: 118, rPro: 30, rFing: 0.4 } },
    { t: 0.8, p: { base: 'stand', rShF: 150, rShA: 60, rShT: -40, rElF: 125, rPro: 30, rFing: 0.4 } },
    { t: 1.3, p: 'stand' },
  ]);
  // technical foul: the hands form a T in front of the chin (right hand the stem, left hand the bar laid across its
  // fingertips; arm angles fitted to those hand spots on the rig)
  const T_SIGN = { base: 'stand', rShF: 37, rShA: 8, rShT: 54, rElF: 114, rPro: -14, rWrF: 45, rWrD: 2, rFing: 0.08, lShF: 81, lShA: 17, lShT: 39, lElF: 124, lPro: 86, lWrF: 34, lWrD: -9, lFing: 0.08 };
  refClip('refTech', 1.5, [
    { t: 0, p: 'stand' },
    { t: 0.28, p: T_SIGN },
    { t: 1.15, p: T_SIGN },
    { t: 1.5, p: 'stand' },
  ]);
  // defensive three seconds: three fingers held out, then the technical T
  refClip('refDef3', 2.2, [
    { t: 0, p: 'stand' },
    { t: 0.2, p: { base: 'stand', rShF: 95, rShA: 30, rElF: 30, rPro: 0, rFing: 0.2 } },
    { t: 0.8, p: { base: 'stand', rShF: 96, rShA: 30, rElF: 30, rPro: 0, rFing: 0.2 } },
    { t: 1.1, p: T_SIGN },
    { t: 1.85, p: T_SIGN },
    { t: 2.2, p: 'stand' },
  ]);
  // eight seconds: both hands up, fingers spread (eight fingers)
  refClip('refEight', 1.5, [
    { t: 0, p: 'stand' },
    { t: 0.22, p: { base: 'stand', both: { ShF: 138, ShA: 30, ShT: 0, ElF: 62, Pro: 0, WrF: -10, Fing: 0.04 } } },
    { t: 1.1, p: { base: 'stand', both: { ShF: 140, ShA: 30, ShT: 0, ElF: 60, Pro: 0, WrF: -10, Fing: 0.04 } } },
    { t: 1.5, p: 'stand' },
  ]);
  // backcourt: the index finger points down at the floor and waves across the division line
  refClip('refBackcourt', 1.6, [
    { t: 0, p: 'stand' },
    { t: 0.2, p: { base: 'stand', rShF: 48, rShA: 4, rShT: 10, rElF: 12, rPro: 20, rWrF: 20, rFing: 0.6 } },
    { t: 0.45, p: { base: 'stand', rShF: 50, rShA: 34, rShT: 10, rElF: 12, rPro: 20, rWrF: 20, rFing: 0.6 } },
    { t: 0.7, p: { base: 'stand', rShF: 48, rShA: 0, rShT: 10, rElF: 12, rPro: 20, rWrF: 20, rFing: 0.6 } },
    { t: 0.95, p: { base: 'stand', rShF: 50, rShA: 34, rShT: 10, rElF: 12, rPro: 20, rWrF: 20, rFing: 0.6 } },
    { t: 1.2, p: { base: 'stand', rShF: 48, rShA: 4, rShT: 10, rElF: 12, rPro: 20, rWrF: 20, rFing: 0.6 } },
    { t: 1.6, p: 'stand' },
  ]);
  refClip('refToss', 1.0, [
    { t: 0, p: { base: 'stand', both: { ShF: 50, ShA: 10, ShT: 30, ElF: 60, Pro: 0 } } },
    { t: 0.2, p: { base: 'stand', both: { ShF: 40, ShA: 10, ShT: 30, ElF: 80, Pro: 0 } } },
    { t: 0.42, p: { base: 'stand', spFlex: -4, nkFlex: -20, both: { ShF: 150, ShA: 14, ShT: 10, ElF: 10, Pro: 0 } } },
    { t: 0.8, p: { base: 'stand', nkFlex: -20, both: { ShF: 60, ShA: 20, ElF: 30 } } },
    { t: 1.0, p: 'stand' },
  ], { toss: 0.42 });

  // ------------------------------------------------------------ extra stances
  const P = M.Poses.P, L = M.Poses.lib;
  L.screen = P({ rootZ: -0.06, pelPitch: 10, spFlex: 4, chFlex: -2, nkFlex: -8, both: { ShF: 30, ShA: -4, ShT: 60, ElF: 110, Pro: 60, WrF: 0, Fing: 1, HipF: 24, HipA: 16, HipT: -10, Knee: 30, Ank: 10 } }, M.Poses.BASE);
  L.boxout = P({ rootZ: -0.1, pelPitch: 30, spFlex: 6, chFlex: -6, nkFlex: -30, hdFlex: -10, both: { ShF: 60, ShA: 70, ShT: 20, ElF: 80, Pro: 30, WrF: -10, Fing: 0.1, HipF: 50, HipA: 20, HipT: -10, Knee: 62, Ank: 18 } }, M.Poses.BASE);
  L.postUp = P({ rootZ: -0.09, pelPitch: 26, spFlex: 6, chFlex: -2, nkFlex: -20, nkTwist: 30, lShF: 60, lShA: 60, lShT: 20, lElF: 80, rShF: 150, rShA: 30, rElF: 30, rPro: 0, rWrF: -20, both: { HipF: 46, HipA: 20, HipT: -10, Knee: 58, Ank: 16 } }, M.Poses.BASE);
  L.postD = P({ rootZ: -0.09, pelPitch: 26, spFlex: 6, chFlex: -2, nkFlex: -24, lShF: 70, lShA: 30, lElF: 40, lPro: 0, rShF: 140, rShA: 30, rElF: 30, both: { HipF: 46, HipA: 20, HipT: -10, Knee: 58, Ank: 16 } }, M.Poses.BASE);
  L.inbound = P({ rootZ: -0.01, pelPitch: 4, spFlex: -2, nkFlex: -8, both: { ShF: 160, ShA: 22, ElF: 70, Pro: 10, WrF: -30, HipF: 8, HipA: 6, Knee: 12 } }, M.Poses.BASE);
  L.handsKnees = P({ rootZ: -0.08, pelPitch: 40, spFlex: 20, chFlex: 8, nkFlex: -30, both: { ShF: 40, ShA: 10, ShT: 20, ElF: 10, Pro: 60, WrF: 10, HipF: 50, HipA: 8, Knee: 40, Ank: 14 } }, M.Poses.BASE);
  L.refStand = P({ rootZ: 0, pelPitch: 3, spFlex: -1, chFlex: -2, nkFlex: -4, both: { ShF: -12, ShA: 12, ShT: -20, ElF: 30, Pro: 60, WrF: 0, Fing: 0.5, HipF: 3, HipA: 4, Knee: 4 } }, M.Poses.BASE);
  // dribbling stance: sitting down in it, nearly a squat (hips well back and low, knees ~80 deg over the toes, shins
  // forward), the back flat and inclined, chest and eyes up
  L.dribbleLow = P({ rootZ: -0.145, pelPitch: 31, spFlex: 5, chFlex: 3, nkFlex: -32, hdFlex: -6, lShF: 44, lShA: 26, lShT: -6, lElF: 88, lPro: 60, rShF: 30, rShA: 20, rElF: 60, both: { HipF: 68, HipA: 13, HipT: -10, Knee: 90, Ank: 28 } }, M.Poses.BASE);
  Object.assign(A.STANCE, {
    screen: { pose: 'screen', L: [-0.13, 0.085], R: [0.13, 0.085], yaw: 14, gaitArms: 0.2, gaitTorso: 0.5 },
    boxout: { pose: 'boxout', L: [-0.16, 0.085], R: [0.16, 0.085], yaw: 16, gaitArms: 0.1, gaitTorso: 0.3, slide: true },
    postUp: { pose: 'postUp', L: [-0.16, 0.085], R: [0.16, 0.085], yaw: 16, gaitArms: 0.1, gaitTorso: 0.3, slide: true },
    postD: { pose: 'postD', L: [-0.15, 0.105], R: [0.15, 0.065], yaw: 16, gaitArms: 0.1, gaitTorso: 0.3, slide: true },
    inbound: { pose: 'inbound', L: [-0.08, 0.115], R: [0.08, 0.055], yaw: 10, gaitArms: 0.1, gaitTorso: 0.8 },
    handsKnees: { pose: 'handsKnees', L: [-0.09, 0.085], R: [0.09, 0.085], yaw: 10, gaitArms: 0.8, gaitTorso: 0.8 },
    refStand: { pose: 'refStand', L: [-0.075, 0.085], R: [0.075, 0.085], yaw: 9, gaitArms: 1, gaitTorso: 1 },
    dribble: { pose: 'dribbleLow', L: [-0.125, 0.16], R: [0.125, 0.07], yaw: 12, gaitArms: 0.4, gaitTorso: 0.45 },
  });

  // post fade (turnaround fadeaway): back to the basket, he turns over a shoulder on the balls of his feet while
  // gathering (the ball comes up to the set point as he comes around), rises squared to the rim and fades away
  // from his man. postFadeL turns left (counter-clockwise from above), postFadeR right
  const postFade = (name, sgn) => clip(name, {
    dur: 1.7, events: { set: 0.56, release: 0.8 },
    jump: { t0: 0.56, t1: 1.1, h: 0.15 },
    feet: [[0, 'plant'], [0.56, 'air'], [1.1, 'plant']],
    pivot: { side: 2, t0: 0, t1: 0.44 },
    yaw: [[0, -180 * sgn], [0.14, -120 * sgn], [0.3, -40 * sgn], [0.44, 0], [1.7, 0]],
    root: [[0, 0, 0], [0.44, 0.1, 0], [0.56, 0, 0], [1.1, -1.9, 0.1], [1.34, -2.1, 0.1], [1.7, -2.1, 0.1]],
    keys: [
      { t: 0.0, p: { base: 'postUp' }, ball: [0.07, 0.16, 0.62], grip: 'hold' },
      { t: 0.16, p: arms('dip', { rootZ: -0.1, pelPitch: 20, spFlex: 6, chFlex: 3, nkFlex: -14, chTwist: 18 * sgn, both: { HipF: 36, Knee: 54, Ank: 16 } }), ball: SB.dip, grip: 'jsLow' },
      { t: 0.34, p: arms('rise', { rootZ: -0.05, pelPitch: 10, spFlex: 2, chFlex: -2, nkFlex: -10, chTwist: 8 * sgn, both: { HipF: 20, Knee: 30, Ank: 4 } }), ball: SB.rise, grip: 'jsRise' },
      { t: 0.46, p: arms('load', { rootZ: -0.02, pelPitch: 4, spFlex: -2, chFlex: -5, nkFlex: -8, hdFlex: -3, both: { HipF: 10, Knee: 16, Ank: -10 } }), ball: SB.load, grip: 'jsLoad' },
      { t: 0.56, p: { base: 'shotSet', spFlex: -8, chFlex: -8 }, ball: SB.set, grip: 'jsSet' },
      { t: 0.7, p: arms('push', { rootZ: 0, pelPitch: -5, spFlex: -12, chFlex: -8, nkFlex: 2, hdFlex: -4, lHipF: 10, lKnee: 16, rHipF: 50, rKnee: 66, both: { Ank: -30 } }), ball: SB.push, grip: 'jsPush' },
      { t: 0.8, p: arms('release', { rootZ: 0, pelPitch: -6, spFlex: -14, chFlex: -8, nkFlex: 4, hdFlex: -4, rShF: 136, lHipF: 10, lKnee: 16, rHipF: 55, rKnee: 70, both: { Ank: -30 } }), ball: SB.release, grip: 'shootRel' },
      { t: 0.86, p: { base: 'shotFollow', pelPitch: -6, spFlex: -14, chFlex: -8, rShF: 142, rHipF: 50, rKnee: 65 } },
      { t: 1.1, p: arms('hold', { rootZ: -0.03, pelPitch: 4, spFlex: -2, chFlex: -4, rShF: 150, both: { HipF: 20, HipA: 6, Knee: 30 } }) },
      { t: 1.34, p: arms('relax', { rootZ: -0.04, pelPitch: 8, spFlex: 3, both: { HipF: 22, Knee: 30, Ank: 8 } }) },
      { t: 1.5, p: arms('down', { rootZ: -0.04, pelPitch: 10, spFlex: 4, both: { HipF: 24, Knee: 30, Ank: 8 } }) },
      { t: 1.7, p: 'ready' },
    ],
  });
  postFade('postFadeL', 1);
  postFade('postFadeR', -1);
})();
