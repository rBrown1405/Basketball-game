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
  // shot set point (fitted to the rig so the hands really sit on the ball): the ball above the right forehead and
  // clear of it, the shooting elbow at shoulder height under the ball with the forearm vertical (the "L"), the wrist
  // cocked back so the ball rests on the palm and finger pads (fingers back and a little out, thumb in); the guide
  // hand flat on the side of the ball, fingers up, its elbow bent too
  def('shotSet', {
    rootZ: 0.0, pelPitch: 2, spFlex: -2, chFlex: -6, nkFlex: -8, hdFlex: -4,
    lShF: 114, lShA: -13, lShT: 23, lElF: 57.5, lPro: 91, lWrF: -24, lWrD: -6.5, lFing: 0.05,
    rShF: 97, rShA: -16, rShT: -4, rElF: 78, rPro: 150, rWrF: -72, rWrD: 11, rFing: 0.12,
    both: { HipF: 4, HipA: 4, Knee: 8, Ank: -30 },
  });
  // release / gooseneck follow-through: arm extended up-and-out toward the rim, wrist snapped down, fingers at the
  // rim; the guide hand stays up beside where the ball was (palm in, fingers up) instead of falling away: it only
  // steadied the ball and never pushes (it comes off first)
  def('shotFollow', {
    rootZ: 0.0, pelPitch: 0, spFlex: -2, chFlex: -5, nkFlex: -8, hdFlex: -2,
    lShF: 137.5, lShA: -16, lShT: 42.5, lElF: 11.5, lPro: 55, lWrF: -23, lWrD: 15, lFing: 0.05,
    rShF: 138.5, rShA: -6.5, rShT: 35.5, rElF: 3, rPro: 132, rWrF: 80, rWrD: -12, rFing: 0.2,
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
