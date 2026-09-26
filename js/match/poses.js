/* Pro BBALL Coach — match view: key-pose library (PBC.Match.Poses).
 * Poses are authored in degrees (lengths as fractions of height) and converted to pose vectors.
 * Right-handed versions; lefties use Rig.mirrorPose. Legs are usually driven by IK to planted
 * feet, so leg angles here mostly matter in the air and as knee-direction hints. */
(function () {
  'use strict';
  const M = window.PBC.Match, RG = M.Rig;
  const P = RG.pose;

  const BASE = P({
    rootZ: 0, pelPitch: 4, spFlex: 2, chFlex: 2, nkFlex: -3, hdFlex: 3,
    both: { ShF: 4, ShA: 8, ShT: 6, ElF: 14, Pro: 78, WrF: 6, Fing: 0.35, HipF: 4, HipA: 3, HipT: -6, Knee: 6, Ank: 0 },
  });

  const lib = {};
  function def(name, desc, base) { lib[name] = P(desc, base || BASE); return lib[name]; }

  // --- standing / idle (weight slightly on the right leg)
  def('stand', {
    rootZ: 0, pelPitch: 5, pelRoll: 2, spFlex: 2, spLat: -1, chFlex: 1, nkFlex: -4, hdFlex: 4,
    lClvE: 0, rClvE: 0,
    lShF: 2, lShA: 9, lShT: 8, lElF: 16, lPro: 80, lWrF: 8,
    rShF: 5, rShA: 7, rShT: 6, rElF: 12, rPro: 76, rWrF: 5,
    lHipF: 6, lHipA: 4, lKnee: 9, rHipF: 3, rHipA: 2, rKnee: 3,
  });
  // hands on hips (dead ball)
  def('handsHips', {
    rootZ: -0.002, pelPitch: 4, spFlex: -2, chFlex: -2, nkFlex: -2,
    both: { ShF: -18, ShA: 42, ShT: -25, ElF: 105, Pro: 20, WrF: -20, Fing: 0.2, HipF: 4, HipA: 5, Knee: 6 },
  });
  // athletic ready stance (offense, no ball)
  // (hands out in front at hip height and outside the hips, ready for the ball; they used to hang at mid-thigh
  // close together, which from three-quarters read as a hand on the shorts)
  def('ready', {
    rootZ: -0.05, pelPitch: 20, spFlex: 8, chFlex: 4, nkFlex: -14, hdFlex: -2,
    both: { ShF: 26, ShA: 30, ShT: 0, ElF: 66, Pro: 50, WrF: 10, Fing: 0.25, HipF: 30, HipA: 9, HipT: -8, Knee: 38, Ank: 12 },
  });
  // defensive stance: low hips, flat back ~35 deg, head up, active hands (right high, left low in the lane)
  // defensive stance (coaching consensus): knees ~120 deg included, hips back, chest up over the knees,
  // weight on the balls of the feet, one hand high on the shooter's strong side and one low
  // (a motion-captured slide, CMU 102_27, sits lower and wider still: hips ~0.115 H down, hip abduction ~35 deg,
  // knees 58-96 deg, arms out with the elbows bent ~75 deg; the stance moves part of the way there)
  def('defense', {
    rootZ: -0.105, pelPitch: 30, spFlex: 10, chFlex: -8, nkFlex: -32, hdFlex: -6,
    lShF: 28, lShA: 52, lShT: 32, lElF: 62, lPro: 40, lWrF: -12, lFing: 0.08,
    rShF: 112, rShA: 46, rShT: 34, rElF: 64, rPro: 78, rWrF: -18, rFing: 0.05,
    both: { HipF: 56, HipA: 26, HipT: -14, Knee: 66, Ank: 18 },
  });
  // defensive stance with both hands wide (mirroring the ball)
  def('defenseWide', {
    rootZ: -0.1, pelPitch: 28, spFlex: 10, chFlex: -8, nkFlex: -30, hdFlex: -6,
    both: { ShF: 30, ShA: 60, ShT: 12, ElF: 66, Pro: 45, WrF: -12, Fing: 0.08, HipF: 54, HipA: 26, HipT: -14, Knee: 64, Ank: 18 },
  });
  // closeout: high hand, chopping feet (upper body)
  def('contest', {
    rootZ: -0.03, pelPitch: 10, spFlex: 2, chFlex: -4, nkFlex: -18, hdFlex: -4,
    lShF: 25, lShA: 40, lShT: 15, lElF: 40, lPro: 50,
    rShF: 165, rShA: 12, rShT: 0, rElF: 10, rPro: 60, rWrF: -10, rFing: 0.05,
    both: { HipF: 24, HipA: 12, Knee: 30, Ank: 10 },
  });
  // triple threat (ball on the right hip, left foot forward)
  def('triple', {
    rootZ: -0.075, pelPitch: 26, pelTwist: 10, spFlex: 12, spTwist: 6, chFlex: 8, chTwist: 6, nkFlex: -24, hdFlex: -4, hdTwist: -8,
    lShF: 42, lShA: 8, lShT: 30, lElF: 70, lPro: 40, lWrF: 10,
    rShF: 12, rShA: 18, rShT: 30, rElF: 80, rPro: 10, rWrF: -20,
    lHipF: 44, lHipA: 10, lKnee: 48, rHipF: 30, rHipA: 12, rKnee: 44, lAnk: 14, rAnk: 14,
  });
  // ball held at the chest (after a catch / looking to pass)
  def('holdChest', {
    rootZ: -0.04, pelPitch: 14, spFlex: 6, chFlex: 4, nkFlex: -12,
    both: { ShF: 34, ShA: 22, ShT: 38, ElF: 100, Pro: 5, WrF: -30, Fing: 0.15, HipF: 22, HipA: 9, Knee: 28, Ank: 8 },
  });
  // shot pocket (catch-and-shoot ready: knees bent, ball at right chest)
  def('shotPocket', {
    rootZ: -0.06, pelPitch: 16, spFlex: 5, chFlex: 3, nkFlex: -12, hdFlex: -2,
    lShF: 38, lShA: 20, lShT: 20, lElF: 96, lPro: 0, lWrF: -20,
    rShF: 26, rShA: 12, rShT: 10, rElF: 118, rPro: 0, rWrF: -55,
    both: { HipF: 30, HipA: 8, Knee: 40, Ank: 12 },
  });
  // shot set point: ball above the right forehead, elbow under the ball, wrist cocked
  def('shotSet', {
    rootZ: 0.0, pelPitch: 2, spFlex: -2, chFlex: -6, nkFlex: -8, hdFlex: -4,
    lShF: 128, lShA: 38, lShT: -10, lElF: 88, lPro: 0, lWrF: -10, lFing: 0.05,
    rShF: 134, rShA: 14, rShT: -2, rElF: 98, rPro: 0, rWrF: -72, rFing: 0.1,
    both: { HipF: 4, HipA: 4, Knee: 8, Ank: -30 },
  });
  // release / gooseneck follow-through: arm extended up-and-out toward the rim, wrist snapped down
  def('shotFollow', {
    rootZ: 0.0, pelPitch: 0, spFlex: -2, chFlex: -5, nkFlex: -8, hdFlex: -2,
    lShF: 118, lShA: 44, lShT: -12, lElF: 58, lPro: 10, lWrF: 0, lFing: 0.05,
    rShF: 142, rShA: 9, rShT: -4, rElF: 6, rPro: 12, rWrF: 82, rFing: 0.4,
    both: { HipF: 10, HipA: 4, Knee: 16, Ank: -38 },
  });
  // running reference keys (used by viewer / tests)
  def('runA', {
    rootZ: -0.03, pelPitch: 10, pelTwist: -8, spFlex: 8, chTwist: 12, nkFlex: -6,
    lShF: 40, lShA: 8, lElF: 95, lPro: 70, rShF: -35, rShA: 10, rElF: 80, rPro: 70,
    lHipF: -12, lKnee: 25, lAnk: -25, rHipF: 55, rKnee: 95, rAnk: 5,
  });

  M.Poses = { lib, BASE, P };
})();
