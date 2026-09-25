/* Pro BBALL Coach — match view: animation data (PBC.Match.Anims).
 * - Gait: phase-driven Catmull-Rom curves for walk / jog / sprint (upper body + pelvis; the legs
 *   are placed by the foot controller + IK so feet never skate). Phase 0 = right foot contact.
 * - Stances: base poses with foot layouts.
 * - Clips: keyframed full/partial-body actions with root motion, jump arcs, ball path, hand grips,
 *   foot plant schedule and timed events (release, catch, set point...). */
(function () {
  'use strict';
  const M = window.PBC.Match, U = M.U, RG = M.Rig, CH = RG.CH;
  const L = M.Poses.lib;
  const D = U.DEG;

  // ------------------------------------------------------------ gait
  function lc(keys) { return U.loopCurve(keys, 256); }
  // each set: {chan: LUT (degrees or H-fraction for rootZ)}
  function gaitSet(def) {
    const out = {};
    for (const k in def) {
      const v = def[k];
      out[k] = typeof v === 'number' ? v : lc(v);
    }
    return out;
  }
  // helper: opposite-phase copy for the left side
  function opp(keys) { return keys.map(([p, v]) => [(p + 0.5) % 1, v]); }

  const WALK = gaitSet({
    pelPitch: 4, spFlex: 3, chFlex: 2, nkFlex: -3, hdFlex: 2,
    // pelvis: lowest just after heel strike (double support), highest in midstance (inverted pendulum); the
    // reach limit keeps the stance knee near straight (~5 deg), the dip lets it flex ~15 deg in loading response
    rootZ: [[0, -0.016], [0.08, -0.019], [0.3, 0.006], [0.5, -0.016], [0.58, -0.019], [0.8, 0.006]],
    pelTwist: [[0, 5], [0.25, 0], [0.5, -5], [0.75, 0]],
    pelRoll: [[0.1, -4], [0.32, 0], [0.6, 4], [0.82, 0]],
    chTwist: [[0, -7], [0.25, 0], [0.5, 7], [0.75, 0]],
    nkTwist: [[0, 2], [0.5, -2]],
    rShF: [[0, -16], [0.25, 0], [0.5, 19], [0.75, 2]], lShF: opp([[0, -16], [0.25, 0], [0.5, 19], [0.75, 2]]),
    rElF: [[0, 12], [0.5, 30]], lElF: opp([[0, 12], [0.5, 30]]),
    rShA: 8, lShA: 8, rShT: 6, lShT: 6, rPro: 75, lPro: 75, rWrF: 8, lWrF: 8, rFing: 0.4, lFing: 0.4,
    rHipF: [[0, 22], [0.15, 18], [0.3, 4], [0.5, -9], [0.62, -4], [0.75, 14], [0.88, 26]],
    lHipF: opp([[0, 22], [0.15, 18], [0.3, 4], [0.5, -9], [0.62, -4], [0.75, 14], [0.88, 26]]),
    rKnee: [[0, 4], [0.15, 16], [0.4, 5], [0.6, 36], [0.72, 62], [0.9, 18]],
    lKnee: opp([[0, 4], [0.15, 16], [0.4, 5], [0.6, 36], [0.72, 62], [0.9, 18]]),
  });
  const JOG = gaitSet({
    pelPitch: 6, spFlex: 5, chFlex: 2, nkFlex: -7, hdFlex: 0, // ~9 deg forward lean (running studies)
    rootZ: [[0, -0.012], [0.17, -0.032], [0.36, -0.01], [0.43, 0.008], [0.5, -0.012], [0.67, -0.032], [0.86, -0.01], [0.93, 0.008]],
    pelTwist: [[0, 8], [0.25, 0], [0.5, -8], [0.75, 0]],
    pelRoll: [[0.1, -5], [0.35, 2], [0.6, 5], [0.85, -2]],
    spTwist: [[0, -5], [0.5, 5]],
    chTwist: [[0, -9], [0.25, 0], [0.5, 9], [0.75, 0]],
    nkTwist: [[0, 6], [0.5, -6]],
    rShF: [[0, -38], [0.25, 2], [0.5, 46], [0.75, 6]], lShF: opp([[0, -38], [0.25, 2], [0.5, 46], [0.75, 6]]),
    rElF: [[0, 72], [0.25, 86], [0.5, 104], [0.75, 90]], lElF: opp([[0, 72], [0.25, 86], [0.5, 104], [0.75, 90]]),
    rShA: [[0, 14], [0.5, 8]], lShA: opp([[0, 14], [0.5, 8]]),
    rShT: [[0, 4], [0.5, 22]], lShT: opp([[0, 4], [0.5, 22]]),
    rPro: 55, lPro: 55, rWrF: 12, lWrF: 12, rFing: 0.55, lFing: 0.55,
    rHipF: [[0, 30], [0.17, 16], [0.36, -12], [0.55, 20], [0.78, 46], [0.92, 36]],
    lHipF: opp([[0, 30], [0.17, 16], [0.36, -12], [0.55, 20], [0.78, 46], [0.92, 36]]),
    rKnee: [[0, 20], [0.17, 40], [0.36, 18], [0.6, 88], [0.8, 50], [0.95, 20]],
    lKnee: opp([[0, 20], [0.17, 40], [0.36, 18], [0.6, 88], [0.8, 50], [0.95, 20]]),
  });
  const SPRINT = gaitSet({
    pelPitch: 9, spFlex: 8, chFlex: 3, nkFlex: -11, hdFlex: 0, // ~14 deg at top speed; more only while accelerating
    rootZ: [[0, -0.016], [0.13, -0.036], [0.26, -0.014], [0.38, 0.01], [0.5, -0.016], [0.63, -0.036], [0.76, -0.014], [0.88, 0.01]],
    pelTwist: [[0, 10], [0.25, 0], [0.5, -10], [0.75, 0]],
    pelRoll: [[0.08, -5], [0.3, 2], [0.58, 5], [0.8, -2]],
    spTwist: [[0, -6], [0.5, 6]],
    chTwist: [[0, -10], [0.25, 0], [0.5, 10], [0.75, 0]],
    nkTwist: [[0, 7], [0.5, -7]],
    rShF: [[0, -52], [0.25, 5], [0.5, 68], [0.75, 10]], lShF: opp([[0, -52], [0.25, 5], [0.5, 68], [0.75, 10]]),
    rElF: [[0, 66], [0.25, 88], [0.5, 110], [0.75, 92]], lElF: opp([[0, 66], [0.25, 88], [0.5, 110], [0.75, 92]]),
    rShA: [[0, 12], [0.5, 6]], lShA: opp([[0, 12], [0.5, 6]]),
    rShT: [[0, 2], [0.5, 18]], lShT: opp([[0, 2], [0.5, 18]]),
    rPro: 50, lPro: 50, rWrF: 8, lWrF: 8, rFing: 0.5, lFing: 0.5,
    rHipF: [[0, 42], [0.13, 22], [0.26, -15], [0.5, 30], [0.75, 68], [0.9, 52]],
    lHipF: opp([[0, 42], [0.13, 22], [0.26, -15], [0.5, 30], [0.75, 68], [0.9, 52]]),
    rKnee: [[0, 24], [0.13, 44], [0.26, 20], [0.5, 125], [0.75, 70], [0.92, 28]],
    lKnee: opp([[0, 24], [0.13, 44], [0.26, 20], [0.5, 125], [0.75, 70], [0.92, 28]]),
  });
  // lateral defensive shuffle: low, quiet torso, arms held wide
  const SLIDE = gaitSet({
    rootZ: [[0, -0.004], [0.2, 0.004], [0.5, -0.004], [0.7, 0.004]],
    pelRoll: [[0, 2], [0.5, -2]],
    chTwist: [[0, -2], [0.5, 2]],
  });

  // walk/run transition: people switch gaits at ~2.0-2.1 m/s (6.6-6.9 ft/s); the switch is quick, not a long blend
  const WALK_MAX = 6.2, RUN_MIN = 7.4;
  /** cadence (steps per second) for a ground speed in ft/s, scaled by height */
  function stepsPerSec(speed, H) {
    const s = Math.abs(speed);
    H = Math.max(5, H || 6.5);
    // walking: the "walk ratio" (step length / cadence) stays nearly constant across speeds and scales with
    // stature (~0.0039 x height per step/min), so cadence = sqrt(60 v / WR): ~103 steps/min for a 6'6" player
    // at 1.37 m/s (step ~0.40 x height), ~84 at a stroll, ~120 walking briskly
    const walk = Math.sqrt(60 * Math.max(0.6, s) / (0.0039 * H)) / 60;
    // running: ~150-165 steps/min jogging, 170-185 running, 190+ sprinting (taller athletes a little lower)
    let c;
    if (s < 8) c = U.lerp(2.45, 2.55, U.clamp((s - RUN_MIN) / (8 - RUN_MIN), 0, 1));
    else if (s < 12) c = U.lerp(2.55, 2.8, (s - 8) / 4);
    else if (s < 18) c = U.lerp(2.8, 3.25, (s - 12) / 6);
    else c = U.lerp(3.25, 3.7, Math.min(1, (s - 18) / 7));
    const run = c * Math.sqrt(6.6 / H);
    if (s <= WALK_MAX) return walk;
    if (s >= RUN_MIN) return run;
    return U.lerp(walk, run, U.smooth((s - WALK_MAX) / (RUN_MIN - WALK_MAX)));
  }
  /** gait blend weights {walk, jog, sprint} */
  function gaitWeights(speed, out) {
    const s = Math.abs(speed);
    let w = 1, j = 0, r = 0;
    if (s > WALK_MAX) { const t = U.smooth((s - WALK_MAX) / (RUN_MIN - WALK_MAX)); w = 1 - t; j = t; }
    if (s > 13) { const t = U.smooth((s - 13) / 7); j *= 1 - t; r = t; w = 0; }
    out.walk = w; out.jog = j; out.sprint = r;
    return out;
  }
  /** gait parameters by speed (stance fraction, swing lift, reach, step half-width, crouch) all in H-fractions */
  function gaitParams(speed, out) {
    const gw = gaitWeights(speed, out.w || (out.w = {}));
    // stance share of the stride (ground contact): walking ~60%, running ~31-33%, sprinting ~22-25% (gait studies)
    out.beta = gw.walk * 0.6 + gw.jog * 0.33 + gw.sprint * 0.24;
    out.lift = gw.walk * 0.05 + gw.jog * 0.2 + gw.sprint * 0.29;
    // how far ahead of the body the ankle lands, as a share of the contact length: a walker's heel strikes about
    // 0.16 x height ahead of the hip (leg ~20 deg forward), runners land close under the body, not reaching out
    out.reach = gw.walk * 0.37 + gw.jog * 0.4 + gw.sprint * 0.36;
    // step width: ~8-10 cm between the feet when walking (a wide base is a toddler trait), narrower when running
    out.halfW = gw.walk * 0.024 + gw.jog * 0.02 + gw.sprint * 0.016;
    out.liftPow = gw.walk * 0.85 + gw.jog * 0.62 + gw.sprint * 0.58;
    out.drop = gw.walk * 0.006 + gw.jog * 0.02 + gw.sprint * 0.03;
    // foot angle at toe-off: ~55-60 deg walking (knee ~40 deg, ankle plantarflexed ~15-20 deg), steeper running
    out.toePitch = (gw.walk * 56 + gw.jog * 52 + gw.sprint * 60) * D;
    // heel off at ~30-35% of the walking cycle (terminal stance); runners roll up much sooner
    out.heelOff = gw.walk * 0.5 + gw.jog * 0.35 + gw.sprint * 0.2;
    // initial contact: heel strike with the toes ~20 deg up when walking, a flatter rearfoot/midfoot jogging
    // strike, forefoot when sprinting; `roll` = share of the cycle it takes the forefoot to come down
    out.landPitch = (gw.walk * -20 + gw.jog * -7 + gw.sprint * 6) * D;
    out.roll = gw.walk * 0.1 + gw.jog * 0.05 + gw.sprint * 0.03;
    return out;
  }

  const TMPW = {};
  /** write gait upper-body/pelvis channels into pose `out` blended by weight k (0..1) */
  const ARMCH = new Uint8Array(RG.NCH);
  for (const i of RG.GROUP.arms) ARMCH[i] = 1;
  function applyGait(out, phase, speed, k, backwards, kArms) {
    if (kArms == null) kArms = k;
    if (k <= 0.001 && kArms <= 0.001) return;
    const gw = gaitWeights(speed, TMPW);
    const sets = [[WALK, gw.walk], [JOG, gw.jog], [SPRINT, gw.sprint]];
    const ph = backwards ? 1 - phase : phase;
    const acc = applyGait._acc || (applyGait._acc = new Float32Array(RG.NCH));
    const has = applyGait._has || (applyGait._has = new Uint8Array(RG.NCH));
    acc.fill(0); has.fill(0);
    for (const [set, w] of sets) {
      if (w <= 0.001) continue;
      for (const key in set) {
        const i = CH[key];
        const v = set[key];
        const val = typeof v === 'number' ? v : U.loopSample(v, ph);
        acc[i] += (RG.LINEAR[key] ? val : val * D) * w;
        has[i] = 1;
      }
    }
    for (let i = 0; i < RG.NCH; i++) if (has[i]) out[i] = out[i] + (acc[i] - out[i]) * (ARMCH[i] ? kArms : k);
  }
  function applySlide(out, phase, k) {
    if (k <= 0.001) return;
    for (const key in SLIDE) {
      const i = CH[key];
      const v = SLIDE[key];
      const val = typeof v === 'number' ? v : U.loopSample(v, phase);
      out[i] += (RG.LINEAR[key] ? val : val * D) * k;
    }
  }

  // ------------------------------------------------------------ stances
  // feet: [x (right, H-fraction), y (forward)] for L and R ball-of-foot positions; yaw offsets (deg, + = toes out)
  const STANCE = {
    stand: { pose: 'stand', L: [-0.07, 0.09], R: [0.075, 0.075], yaw: 9, gaitArms: 1, gaitTorso: 1 },
    ready: { pose: 'ready', L: [-0.1, 0.12], R: [0.1, 0.065], yaw: 12, gaitArms: 0.8, gaitTorso: 0.8 },
    defense: { pose: 'defense', L: [-0.17, 0.115], R: [0.17, 0.065], yaw: 16, gaitArms: 0.15, gaitTorso: 0.3, slide: true },
    defenseWide: { pose: 'defenseWide', L: [-0.17, 0.105], R: [0.17, 0.085], yaw: 16, gaitArms: 0.12, gaitTorso: 0.3, slide: true },
    triple: { pose: 'triple', L: [-0.1, 0.155], R: [0.11, 0.025], yaw: 14, gaitArms: 0.3, gaitTorso: 0.6 },
    holdChest: { pose: 'holdChest', L: [-0.09, 0.115], R: [0.09, 0.075], yaw: 12, gaitArms: 0.2, gaitTorso: 0.7 },
    shotPocket: { pose: 'shotPocket', L: [-0.085, 0.115], R: [0.09, 0.085], yaw: 10, gaitArms: 0.2, gaitTorso: 0.7 },
    handsHips: { pose: 'handsHips', L: [-0.08, 0.085], R: [0.08, 0.085], yaw: 10, gaitArms: 0.1, gaitTorso: 1 },
  };

  // ------------------------------------------------------------ clips
  // Ball-local coordinates (x right, y forward, z up) in H-fractions relative to the root ground point.
  // Grips: wrist offset from the ball centre in ball radii (x right, y forward, z up) per hand.
  const GRIP = {
    none: null,
    shoot: { r: [0.35, -1.1, -0.95], l: [-1.45, -0.25, 0.05] },
    shootRel: { r: [0.2, -1.2, -1.0], l: null },
    hold: { r: [1.35, -0.45, -0.25], l: [-1.35, -0.45, -0.25] },
    hip: { r: [0.85, -0.3, -1.1], l: [-1.2, 0.8, 0.1] },
    over: { r: [1.2, -0.6, 0.1], l: [-1.2, -0.6, 0.1] },
    right: { r: [0.4, -1.2, -0.9], l: null },
    rightTop: { r: [0.2, -0.3, 1.45], l: null },
    left: { r: null, l: [-0.4, -1.2, -0.9] },
    under: { r: [0.3, -0.5, -1.4], l: [-0.3, -0.5, -1.4] },
  };

  /** a clip key: t, pose (name or desc merged on base), ball [x,y,z] H-fractions, grip name */
  function buildClip(def) {
    const clip = Object.assign({ mask: 'full', loop: false, events: {}, feet: [[0, 'plant']], hands: null }, def);
    clip.keys = def.keys.map((k) => {
      let base = k.base ? L[k.base] : null;
      let p;
      if (typeof k.p === 'string') p = L[k.p];
      else {
        const desc = Object.assign({}, k.p || {});
        if (desc.base) { base = L[desc.base]; delete desc.base; }
        p = RG.pose(desc, base || L.stand);
      }
      return { t: k.t, p, ball: k.ball || null, grip: k.grip || null, root: k.root || null };
    });
    // ball curve (only keys that specify ball)
    const bk = clip.keys.filter((k) => k.ball);
    clip.ballKeys = bk.length ? [
      U.keyCurve(bk.map((k) => [k.t, k.ball[0]])), U.keyCurve(bk.map((k) => [k.t, k.ball[1]])), U.keyCurve(bk.map((k) => [k.t, k.ball[2]])),
    ] : null;
    // root motion track: def.root = [[t, fwd(ft), lat(ft, + = right)], ...]; yaw track: def.yaw = [[t, deg(+ = left)], ...]
    if (def.root && def.root.length) {
      clip.rootKeys = [U.keyCurve(def.root.map((k) => [k[0], k[1]])), U.keyCurve(def.root.map((k) => [k[0], k[2] || 0]))];
    } else clip.rootKeys = null;
    clip.yawKeys = def.yaw && def.yaw.length ? U.keyCurve(def.yaw.map((k) => [k[0], k[1] * U.DEG])) : null;
    clip.dur = def.dur || clip.keys[clip.keys.length - 1].t;
    return clip;
  }

  const TMP = new Float32Array(RG.NCH);
  /** sample clip pose at time t into out (Catmull-Rom per channel over keys) */
  function sampleClip(clip, t, out) {
    const keys = clip.keys, n = keys.length;
    if (clip.loop) t = ((t % clip.dur) + clip.dur) % clip.dur;
    if (t <= keys[0].t) { out.set(keys[0].p); return out; }
    if (t >= keys[n - 1].t) { out.set(keys[n - 1].p); return out; }
    let j = 0;
    while (j < n - 2 && keys[j + 1].t <= t) j++;
    const k0 = keys[j], k1 = keys[j + 1];
    const km = j > 0 ? keys[j - 1] : null, kp = j + 2 < n ? keys[j + 2] : null;
    const d = k1.t - k0.t;
    const u = (t - k0.t) / d;
    const p0 = k0.p, p1 = k1.p;
    for (let i = 0; i < RG.NCH; i++) {
      const m0 = km ? (p1[i] - km.p[i]) / (k1.t - km.t) * d : 0;
      const m1 = kp ? (kp.p[i] - p0[i]) / (kp.t - k0.t) * d : 0;
      out[i] = U.hermite(p0[i], p1[i], m0 * 0.85, m1 * 0.85, u);
    }
    return out;
  }
  function clipGrip(clip, t) {
    let g = null;
    for (const k of clip.keys) { if (k.t <= t + 1e-6 && k.grip) g = k.grip; }
    return g;
  }
  function clipFeet(clip, t) {
    let f = 'plant';
    for (const k of clip.feet) if (k[0] <= t + 1e-6) f = k[1];
    return f;
  }

  const CLIPS = {};
  function clip(name, def) { def.name = name; CLIPS[name] = buildClip(def); return CLIPS[name]; }

  // ---- jump shot (catch-and-shoot / pull-up). Release near the apex, gooseneck follow-through.
  clip('jumpshot', {
    dur: 1.4, events: { set: 0.4, release: 0.56 },
    jump: { t0: 0.4, t1: 0.86, h: 0.13 },
    feet: [[0, 'plant'], [0.4, 'air'], [0.86, 'plant']],
    keys: [
      { t: 0.0, p: 'shotPocket', ball: [0.07, 0.14, 0.53], grip: 'hold' },
      { t: 0.16, p: { rootZ: -0.085, pelPitch: 22, spFlex: 8, chFlex: 4, nkFlex: -16, lShF: 36, lShA: 22, lShT: 20, lElF: 100, lPro: 0, lWrF: -20, rShF: 24, rShA: 14, rShT: 10, rElF: 122, rPro: 0, rWrF: -58, both: { HipF: 34, Knee: 50, Ank: 16 } }, ball: [0.07, 0.15, 0.5], grip: 'shoot' },
      { t: 0.3, p: { rootZ: -0.035, pelPitch: 10, spFlex: 3, chFlex: -2, nkFlex: -10, lShF: 88, lShA: 36, lShT: 0, lElF: 108, lPro: 0, lWrF: -15, rShF: 96, rShA: 18, rShT: 0, rElF: 118, rPro: 0, rWrF: -62, both: { HipF: 16, Knee: 22, Ank: 0 } }, ball: [0.05, 0.15, 0.8], grip: 'shoot' },
      { t: 0.4, p: 'shotSet', ball: [0.045, 0.14, 1.0], grip: 'shoot' },
      { t: 0.5, p: { rootZ: 0, pelPitch: 1, spFlex: -3, chFlex: -6, nkFlex: -9, hdFlex: -4, lShF: 132, lShA: 38, lShT: -10, lElF: 76, lPro: 0, lWrF: -6, rShF: 150, rShA: 13, rShT: -3, rElF: 58, rPro: 5, rWrF: -40, both: { HipF: 6, HipA: 4, Knee: 12, Ank: -34 } }, ball: [0.042, 0.19, 1.09], grip: 'shootRel' },
      { t: 0.58, p: 'shotFollow', ball: [0.04, 0.26, 1.18] },
      { t: 0.86, p: { rootZ: -0.02, pelPitch: 6, spFlex: 0, chFlex: -4, nkFlex: -8, lShF: 110, lShA: 40, lShT: -10, lElF: 50, lPro: 10, rShF: 140, rShA: 10, rShT: -4, rElF: 8, rPro: 10, rWrF: 80, rFing: 0.4, both: { HipF: 18, HipA: 5, Knee: 28, Ank: 0 } } },
      { t: 1.05, p: { rootZ: -0.04, pelPitch: 12, spFlex: 4, chFlex: 0, nkFlex: -8, lShF: 40, lShA: 20, lElF: 60, rShF: 90, rShA: 14, rElF: 40, rWrF: 40, both: { HipF: 24, Knee: 30, Ank: 8 } } },
      { t: 1.4, p: 'ready' },
    ],
  });
  // ---- free throw: small dip, rise onto toes (no jump), release, hold the follow-through
  clip('freethrow', {
    dur: 1.7, events: { set: 0.46, release: 0.64 },
    feet: [[0, 'plant']],
    keys: [
      { t: 0.0, p: 'shotPocket', ball: [0.06, 0.15, 0.55], grip: 'hold' },
      { t: 0.22, p: { rootZ: -0.075, pelPitch: 18, spFlex: 6, chFlex: 3, nkFlex: -14, lShF: 36, lShA: 22, lShT: 20, lElF: 100, lPro: 0, lWrF: -20, rShF: 24, rShA: 14, rShT: 10, rElF: 122, rPro: 0, rWrF: -58, both: { HipF: 30, Knee: 44, Ank: 14 } }, ball: [0.06, 0.15, 0.52], grip: 'shoot' },
      { t: 0.46, p: Object.assign({}, { rootZ: 0.01, pelPitch: 2, spFlex: -2, chFlex: -6, nkFlex: -8, hdFlex: -4, lShF: 128, lShA: 38, lShT: -10, lElF: 88, lPro: 0, lWrF: -10, rShF: 142, rShA: 14, rShT: -2, rElF: 96, rPro: 0, rWrF: -72, both: { HipF: 4, Knee: 6, Ank: -18 } }), ball: [0.045, 0.14, 1.0], grip: 'shoot' },
      { t: 0.64, p: { rootZ: 0.02, pelPitch: 0, spFlex: -3, chFlex: -6, nkFlex: -10, lShF: 124, lShA: 42, lShT: -12, lElF: 62, lPro: 10, rShF: 142, rShA: 11, rShT: -4, rElF: 8, rPro: 10, rWrF: 78, rFing: 0.4, both: { HipF: 4, Knee: 4, Ank: -22 } }, ball: [0.04, 0.2, 1.1], grip: 'shootRel' },
      { t: 1.25, p: { rootZ: 0.012, pelPitch: 2, spFlex: -2, chFlex: -5, nkFlex: -8, lShF: 100, lShA: 40, lElF: 60, rShF: 144, rShA: 10, rElF: 6, rWrF: 84, rFing: 0.4, both: { HipF: 4, Knee: 5, Ank: -8 } } },
      { t: 1.7, p: 'stand' },
    ],
  });

  // ---- chest pass: step into it, elbows out, thumbs down on the finish
  clip('passChest', {
    dur: 0.62, mask: 'upper', events: { release: 0.26 },
    keys: [
      { t: 0, p: 'holdChest', ball: [0.0, 0.16, 0.66], grip: 'hold' },
      { t: 0.14, p: { base: 'holdChest', pelPitch: 12, spFlex: 2, chFlex: -2, nkFlex: -8, both: { ShF: 22, ShA: 30, ShT: 45, ElF: 118, Pro: 0, WrF: -40 } }, ball: [0.0, 0.1, 0.68], grip: 'hold' },
      { t: 0.26, p: { pelPitch: 18, spFlex: 10, chFlex: 6, nkFlex: -14, both: { ShF: 78, ShA: 14, ShT: 5, ElF: 18, Pro: -40, WrF: 30, Fing: 0.1 } }, ball: [0.0, 0.36, 0.7], grip: 'hold' },
      { t: 0.42, p: { pelPitch: 16, spFlex: 9, chFlex: 5, nkFlex: -12, both: { ShF: 70, ShA: 18, ShT: 0, ElF: 14, Pro: -60, WrF: 40, Fing: 0.1 } } },
      { t: 0.62, p: 'ready' },
    ],
  });

  function get(name) { return CLIPS[name] || null; }

  M.Anims = {
    WALK, JOG, SPRINT, SLIDE, STANCE, GRIP, CLIPS, clip, buildClip, get,
    stepsPerSec, gaitWeights, gaitParams, applyGait, applySlide, sampleClip, clipGrip, clipFeet,
  };
})();
