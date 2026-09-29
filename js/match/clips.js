/* Pro BBALL Coach — match view: action clip library (PBC.Match.Anims.CLIPS additions).
 * Right-handed versions (mirrored for lefties). Times in seconds, root motion in feet
 * (fwd, lat + = right), ball positions in height fractions relative to the root ground point,
 * jump = ballistic flight {t0, t1, h (H-fraction peak)}. Events mark the frames that matter to
 * the choreography (release, catch, grab, contact, set point...). */
(function () {
  'use strict';
  const M = window.PBC.Match, A = M.Anims;
  const clip = A.clip;

  // ------------------------------------------------------------ the jump shot, built from its phases (Trial 9)
  // Every jump shot (the one- and two-motion jumpers, the pull-up, the step-back, the fadeaway) and the free throw is
  // built here from its phases, each its own number in Tune.shot: the gather into the pocket; the dip, the ball and the
  // knees and hips going down together; the rise, the legs extending as the ball comes up the shot's line past the face
  // to the set point (the "L": the shooting elbow under the ball); the take-off; the release near the top of the jump
  // (the airtime from the jump's height and real gravity); the wrist's snap into the gooseneck, held; the landing, the
  // knees giving, a little further toward the rim than the take-off; then the arms come down together. The arms at each
  // phase are the fitted A.SHOT_ARMS (A.JS2 for the two-motion set), the ball on the fitted A.SHOT_BALL line.
  // Each shooter's own form (A.shotForm: the speed, release and set heights, elbow, jump, dip, how long the follow-through
  // is held, one or two motions, a leg kick, a lean back) and a contest (released higher and quicker, leaning
  // away) shape the phases; the clips are built per player and kept (A.shotClip); the library's own are the middle form.
  const U = M.U, RG = M.Rig, PL = M.Poses.lib, JS2 = A.JS2, JS2B = A.JS2_BALL;
  const ARM_CH = new Set();
  for (const s of ['l', 'r']) for (const k of ['ClvE', 'ClvP', 'ShF', 'ShA', 'ShT', 'ElF', 'Pro', 'WrF', 'WrD', 'Fing']) ARM_CH.add(RG.CH[s + k]);
  const add3 = (v, dx, dy, dz) => [v[0] + dx, v[1] + dy, v[2] + dz];
  /** the body's track (trunk and legs) and the arms' track (with the ball and grips) merged into one clip's keys: at every
   *  key time of either, each track's channels as its own curve has them there */
  function mergeTracks(body, arms) {
    const tb = A.buildClip({ name: '_body', keys: body.map(([t, p]) => ({ t, p })) });
    const ta = A.buildClip({ name: '_arms', keys: arms.map(k => ({ t: k.t, p: k.p })) });
    const times = [...new Set(body.map(k => k[0]).concat(arms.map(k => k.t)).map(t => Math.round(t * 1e4) / 1e4))].sort((a, b) => a - b);
    const pb = new Float32Array(RG.NCH), pa = new Float32Array(RG.NCH);
    return times.map((t) => {
      A.sampleClip(tb, t, pb); A.sampleClip(ta, t, pa);
      const p = new Float32Array(RG.NCH);
      for (let i = 0; i < RG.NCH; i++) p[i] = ARM_CH.has(i) ? pa[i] : pb[i];
      const k = { t, p };
      const ak = arms.find(q => Math.abs(q.t - t) < 2e-4);
      if (ak && ak.ball) { k.ball = ak.ball; k.grip = ak.grip; }
      return k;
    });
  }
  // the middle of every range: the library's own clips (the Animation Lab's), and anyone without a form
  const MID_FORM = { motion: 1, speed: 1, relH: 0, setH: 0, flareDeg: 0, jump: 1, dip: 1, holdS: 0.6, relApexS: 0.06, drift: 1, lean: 0, kick: 0 };
  const JUMPERS = { jumpshot: 1, jumpshot2: 1, pullup: 1, stepback: 1, fadeaway: 1, postFadeL: 1, postFadeR: 1, freethrow: 1 };
  // (the grips from the set point on, whose reach is kept; the body the library's clips are fitted to, a 6-6 player)
  const REACH_GRIPS = { jsSet: 1, js2Set: 1, jsPush: 1, shootRel: 1 };
  const DEF_DIMS = RG.makeDims({ height: 78, weight: 215 }, 'player'), REACH_SK = { dims: null, sk: null };
  /**
   * one jump shot's clip definition from its phases: kind 'jumpshot' (one motion), 'jumpshot2' (two motion), 'pullup',
   * 'stepback', 'fadeaway', 'postFadeL' / 'postFadeR' (the turnaround out of a post-up, over the left or right shoulder) or
   * 'freethrow'; f = the shooter's form (A.shotForm); o = { contest (0-1), H (ft), vert (0-1), dims (the shooter's body) }
   */
  function jumperDef(kind, f, o) {
    const T = M.Tune.shot, c = o.contest || 0, H = o.H || 6.5, vert = o.vert != null ? o.vert : 0.55;
    const post = /^postFade[LR]$/.test(kind), sgn = kind === 'postFadeL' ? 1 : -1;
    const ft = kind === 'freethrow', two = kind === 'jumpshot2', fade = kind === 'fadeaway' || post;
    const sp = f.speed * (1 + (T.contestSpeed - 1) * c);
    // (a post fade dips less, turning on the balls of its feet as it goes down)
    const dk = ft ? f.dip * T.ftDip : post ? f.dip * 0.6 : f.dip;
    const vK = 0.85 + vert * 0.3;
    const hFt = ft ? 0 : T.jumpH * H * vK * f.jump * (1 + (T.contestJump - 1) * c) * (fade ? 1.15 : 1);
    const air = hFt > 0 ? Math.sqrt(8 * hFt / U.G) : 0;
    const relApex = (two ? T.relApex2S : f.relApexS) + T.contestApexS * c;
    const lean = f.lean + T.contestLeanDeg * c + (fade ? 12 : 0);
    const relH = f.relH + T.contestRelH * c, setH = f.setH + T.contestRelH * c * 0.5;
    const flare = f.flareDeg;
    // ---- the times
    const tLead = (kind === 'pullup' ? 0.12 : kind === 'stepback' ? 0.36 : 0) / sp;
    const tD0 = tLead + (kind === 'stepback' ? 0 : T.gatherS / sp);
    // (a post fade dips as it turns round to the rim, and goes up as the turn ends)
    const tD1 = kind === 'stepback' ? 0.46 / sp : post ? 0.16 / sp : tD0 + (two ? T.dip2S : ft ? T.dipS * 1.45 : T.dipS) * Math.sqrt(dk) / sp;
    let t0, tSet2 = null, tRise, tLoad, tSet, tPush, tRel;
    if (ft) {
      tRise = tD1 + 0.14 / sp; tLoad = tRise + 0.07 / sp; tSet = tLoad + 0.07 / sp; tPush = tSet + 0.08 / sp; tRel = tPush + 0.06 / sp;
      t0 = tLoad;
    } else {
      if (two) { tSet2 = tD1 + T.set2S / sp; t0 = tSet2 + T.drive2S / sp; } else t0 = post ? 0.56 / sp : tD1 + T.riseS * (kind === 'stepback' ? 0.6 : 1) / sp;
      tRel = Math.max(t0 + 0.07, t0 + air / 2 - relApex);
      tPush = tRel - T.pushS * (two ? 1.3 : 1) / sp;
      tSet = two ? Math.min(t0 - 0.02 / sp, tPush - 0.05) : tPush - T.setS / sp;
      tLoad = Math.min(t0 - 0.02 / sp, tSet - 0.04);
      tRise = two ? tD1 + 0.14 / sp : tD1 + 0.58 * (tLoad - tD1);
    }
    const t1 = ft ? null : t0 + air;
    const tF = tRel + T.snapS / sp, holdS = f.holdS + (ft ? T.ftHoldS : 0);
    const tHold = Math.max(tF + 0.08, tRel + holdS), tRelax = tHold + T.relaxS, tDown = tRelax + T.downS;
    const tLand = ft ? null : t1 + T.landS, tUp = ft ? null : tLand + T.landUpS;
    const dur = Math.max(ft ? tDown + 0.2 : tUp + 0.12, tDown + 0.12);
    // ---- the body: trunk and legs
    const B = [];
    const air0 = { rootZ: 0, pelPitch: 1 - lean, spFlex: -3 - lean * 0.6, chFlex: -6, nkFlex: -9 + lean * 0.7, hdFlex: -4 };
    if (kind === 'pullup') B.push([0, { base: 'ready', rootZ: -0.06, pelPitch: 20, spFlex: 8 }], [tLead, 'shotPocket']);
    else if (kind === 'stepback') {
      B.push([0, { base: 'ready', rootZ: -0.07, pelPitch: 24, spFlex: 10 }], [0.14 / sp, { base: 'shotPocket', rootZ: -0.1, pelPitch: 28, spFlex: 12, nkFlex: -20 }],
        [tLead, { base: 'shotPocket', rootZ: -0.05, pelPitch: 8, spFlex: 2, chFlex: -2 }]);
    } else B.push([0, post ? { base: 'postUp' } : 'shotPocket']);
    // (the dip: the knees and hips down with the ball; two motion, deeper and held there while the ball goes up)
    const dipLeg = two ? { HipF: 46, HipA: 8, Knee: 76, Ank: 22 } : { HipF: 30 + 10 * dk, HipA: 8, Knee: 40 + (T.dipKneeDeg - 40) * dk, Ank: 12 + 7 * dk };
    B.push([tD1, { rootZ: two ? -0.13 : -0.06 - T.dipHipH * dk, pelPitch: two ? 15 : post ? 20 : 18, spFlex: two ? 5 : 6, chFlex: 3, nkFlex: -14, chTwist: post ? 18 * sgn : 0, both: dipLeg }]);
    if (two) {
      B.push([tSet2, { rootZ: -0.115, pelPitch: 11, spFlex: 1, chFlex: -4, nkFlex: -10, both: { HipF: 40, HipA: 8, Knee: 70, Ank: 20 } }]);
    } else if (ft) {
      B.push([tRise, { rootZ: -0.02, pelPitch: 6, spFlex: 2, chFlex: -2, nkFlex: -10, both: { HipF: 12, HipA: 6, Knee: 16, Ank: 2 } }]);
      B.push([tSet, { rootZ: 0.01, pelPitch: 2, spFlex: -2, chFlex: -6, nkFlex: -8, hdFlex: -4, both: { HipF: 4, HipA: 4, Knee: 6, Ank: -18 } }]);
      B.push([tRel, { rootZ: 0.02, pelPitch: 0, spFlex: -3, chFlex: -6, nkFlex: -10, both: { HipF: 4, HipA: 4, Knee: 4, Ank: -22 } }]);
      B.push([tHold, { rootZ: 0.012, pelPitch: 2, spFlex: -2, chFlex: -5, nkFlex: -8, both: { HipF: 4, HipA: 4, Knee: 5, Ank: -8 } }]);
      B.push([tRelax, { rootZ: 0.005, pelPitch: 3, spFlex: -1, chFlex: -3, nkFlex: -6, both: { HipF: 4, HipA: 4, Knee: 5, Ank: 0 } }]);
      B.push([dur, 'stand']);
    } else {
      B.push([tRise, { rootZ: -0.04, pelPitch: 8, spFlex: 2, chFlex: -2, nkFlex: -10, chTwist: post ? 8 * sgn : 0, both: { HipF: 16, HipA: 6, Knee: 24, Ank: 2 } }]);
    }
    if (!ft) {
      // (off the toes, then in the air: the legs long under the body, the toes down; a fadeaway's knee comes up in front)
      B.push([t0 - 0.02 / sp, { rootZ: -0.02, pelPitch: 4, spFlex: 0, chFlex: -4, nkFlex: -9, hdFlex: -3, both: { HipF: 10, HipA: 5, Knee: 14, Ank: -12 } }]);
      const legs = (k) => fade ? { lHipF: 10, lHipA: 4, lKnee: 16, rHipF: 50 * k, rHipA: 4, rKnee: 66 * k, lAnk: -30, rAnk: -30 }
        : f.kick ? { lHipF: 6, lHipA: 4, lKnee: 12, lAnk: -34, rHipF: 6 + 32 * k, rHipA: 4, rKnee: 12 + 14 * k, rAnk: -30 } : { both: { HipF: 6, HipA: 4, Knee: 12, Ank: -34 } };
      B.push([Math.min(tRel - 0.02, t0 + 0.06 / sp), Object.assign({}, air0, legs(0.4))]);
      B.push([tRel, Object.assign({}, air0, { pelPitch: -lean, spFlex: -2 - lean * 0.6, chFlex: -5, nkFlex: -8 + lean * 0.7, hdFlex: -2 }, legs(1))]);
      if (t1 - 0.07 > tRel + 0.04) B.push([t1 - 0.07, Object.assign({}, air0, { pelPitch: 2 - lean * 0.5, spFlex: -1 - lean * 0.3, both: { HipF: 12, HipA: 5, Knee: 16, Ank: -22 } })]);
      // (the landing: toes first, then the knees and hips give and come back up)
      B.push([t1, { rootZ: -0.005, pelPitch: 4 - lean * 0.3, spFlex: 0, chFlex: -3, nkFlex: -8, both: { HipF: 16, HipA: 5, Knee: 20, Ank: -4 } }]);
      B.push([tLand, { rootZ: -T.landHipH, pelPitch: 12, spFlex: 3, chFlex: 0, nkFlex: -10, both: { HipF: 32, HipA: 7, Knee: T.landKneeDeg, Ank: 16 } }]);
      B.push([tUp, { rootZ: -0.035, pelPitch: 9, spFlex: 2, chFlex: -1, nkFlex: -8, both: { HipF: 22, HipA: 6, Knee: 28, Ank: 8 } }]);
      B.push([dur, 'ready']);
    }
    // ---- the arms, the ball and the grips
    const SA = A.SHOT_ARMS, SB = A.SHOT_BALL;
    const arm = (phase, w, extra) => {
      const d = Object.assign({}, phase, extra || {});
      if (flare && w.flare) d.rShA = (d.rShA || 0) + flare * w.flare;
      if (relH < 0 && w.low) { d.rElF = (d.rElF || 0) + (-relH / 0.03) * 14 * w.low; d.rShF = (d.rShF || 0) - (-relH / 0.03) * 8 * w.low; }
      if (relH > 0 && w.high) d.rClvE = (d.rClvE || 0) + relH / 0.035 * 0.9 * w.high;
      return d;
    };
    const fx = flare * 0.0008;
    const Ak = [];
    const pocketZ = kind === 'pullup' ? 0.52 : 0.56;
    if (kind === 'pullup') {
      Ak.push({ t: 0, p: { rShF: 30, rShA: 20, rElF: 60, rPro: 60, lShF: 45, lShA: 30, lElF: 85, lPro: 20 }, ball: [0.14, 0.14, 0.38], grip: 'right' });
      Ak.push({ t: tLead, p: 'shotPocket', ball: [0.07, 0.15, 0.52], grip: 'hold' });
    } else if (kind === 'stepback') {
      Ak.push({ t: 0, p: { rShF: 30, rShA: 22, rElF: 60, rPro: 60, lShF: 50, lShA: 30, lElF: 85, lPro: 20 }, ball: [0.15, 0.14, 0.36], grip: 'right' });
      Ak.push({ t: 0.14 / sp, p: 'shotPocket', ball: [0.06, 0.16, 0.48], grip: 'hold' });
      Ak.push({ t: tLead, p: 'shotPocket', ball: [0.06, 0.14, 0.55], grip: 'hold' });
    } else if (post) Ak.push({ t: 0, p: 'postUp', ball: [0.07, 0.16, 0.62], grip: 'hold' });
    else Ak.push({ t: 0, p: 'shotPocket', ball: [0.06, 0.19, 0.56], grip: 'hold' });
    if (two) {
      Ak.push({ t: tD1, p: JS2.dip, ball: JS2B.dip, grip: 'js2Dip' });
      Ak.push({ t: tRise, p: JS2.rise, ball: JS2B.rise, grip: 'js2Rise' });
      Ak.push({ t: tD1 + 0.22 / sp, p: JS2.load, ball: JS2B.load, grip: 'js2Load' });
      Ak.push({ t: tSet2, p: JS2.set, ball: add3(JS2B.set, 0, 0, setH * 0.5), grip: 'js2Set' });
    } else {
      Ak.push({ t: tD1, p: SA.dip, ball: [0.06, 0.2, (kind === 'stepback' ? 0.55 : pocketZ) - T.dipBallH * dk * (kind === 'stepback' ? 0.7 : 1)], grip: 'jsLow' });
      Ak.push({ t: tRise, p: arm(SA.rise, { flare: 0.5 }), ball: add3(SB.rise, fx * 0.5, 0, 0), grip: 'jsRise' });
      Ak.push({ t: tLoad, p: arm(SA.load, { flare: 0.8 }), ball: add3(SB.load, fx * 0.8, 0, setH * 0.5), grip: 'jsLoad' });
    }
    // (leaning back in the air, the shoulders go back with the trunk and the ball with them: ~0.3 H above the hips)
    const lb = (k) => -0.3 * Math.sin(lean * k * U.DEG);
    Ak.push({ t: tSet, p: arm(SA.set, { flare: 1 }), ball: add3(SB.set, fx, lb(0.6), setH), grip: 'jsSet' });
    Ak.push({ t: tPush, p: arm(SA.push, { flare: 1, low: 0.6, high: 0.6 }), ball: add3(SB.push, fx, -Math.max(0, relH) * 0.3 + lb(0.9), (setH + relH) / 2), grip: 'jsPush' });
    const relX = fade ? { rShF: 136 } : null;
    Ak.push({ t: tRel, p: arm(SA.release, { flare: 1, low: 1, high: 1 }, relX), ball: add3(SB.release, fx, -relH * 0.5 + (fade ? 0.02 : 0) + lb(1), relH - (fade ? 0.015 : 0)), grip: 'shootRel' });
    Ak.push({ t: tF, p: arm(SA.follow, { flare: 0.5, high: 1 }, fade ? { rShF: 142 } : null) });
    Ak.push({ t: tHold, p: arm(SA.hold, { flare: 0.5, high: 0.8 }, fade ? { rShF: 150 } : null) });
    Ak.push({ t: tRelax, p: SA.relax });
    Ak.push({ t: tDown, p: SA.down });
    Ak.push({ t: dur, p: ft ? 'stand' : 'ready' });
    // ---- the root: into the shot (a pull-up's hop, the step back, a post fade's turn), then the drift: at one speed in the air
    // (nothing pushes a body in flight), got from the push off the floor and given up in the landing
    const drift = (fade ? -1.9 : T.driftFt * f.drift * (kind === 'stepback' ? 0.4 : 1)), lat = fade ? 0.1 : 0;
    const fly = (x0) => {
      const v = drift / air, a = x0 + v * 0.04;
      return [[t0 - 0.1 / sp, x0, 0], [t0, a, 0], [t0 + air / 3, a + drift / 3, lat / 3], [t0 + air * 2 / 3, a + drift * 2 / 3, lat * 2 / 3], [t1, a + drift, lat], [t1 + 0.12, a + drift + v * 0.05, lat], [dur, a + drift + v * 0.05, lat]];
    };
    let root = null, steps = null;
    if (kind === 'pullup') root = [[0, 0, 0], [0.15 / sp, 0.7, 0], [0.32 / sp, 0.95, 0]].concat(fly(1.0));
    else if (kind === 'stepback') {
      root = [[0, 0, 0], [0.14 / sp, 0.45, 0], [0.24 / sp, 0.1, 0], [0.44 / sp, -2.0, 0]].concat(fly(-2.1));
      steps = [{ t0: 0.02 / sp, t1: 0.14 / sp, foot: 'l', to: [0.6, -0.4], lift: 0.04 }, { t0: 0.18 / sp, t1: 0.4 / sp, foot: 'l', to: [-2.2, -0.45], lift: 0.07 }, { t0: 0.24 / sp, t1: 0.44 / sp, foot: 'r', to: [-1.9, 0.5], lift: 0.05 }];
    } else if (post) root = [[0, 0, 0], [0.44 / sp, 0.1, 0]].concat(fly(0));
    else if (!ft) root = [[0, 0, 0]].concat(fly(0));
    // (the phases' moments too, for the lab and its pictures: the bottom of the dip, the take-off, the landing)
    const events = { dip: tD1, set: tSet, release: tRel };
    if (!ft) { events.takeoff = t0; events.land = t1; }
    if (tLead > 0) events.gather = kind === 'pullup' ? 0.1 / sp : 0.1 / sp;
    const keys = mergeTracks(B, Ak);
    // (the shooting hand on the ball only as far as the arm reaches: from the set on the ball is kept within Tune.shot.reachK
    // of the arm's length from where the shoulder is in that key's pose (up with the arm overhead, back with the chest), or
    // the arm went straight during the push, the elbow's side of the line was lost and the hand turned over at the release,
    // Trial 9)
    const dims = o.dims || DEF_DIMS, sk = REACH_SK.dims === dims ? REACH_SK.sk : (REACH_SK.dims = dims, REACH_SK.sk = new RG.Skeleton(dims)), Lr = (dims.ua + dims.fa) * T.reachK;
    const BR = (M.Ball && M.Ball.R) || 0.39, S3 = RG.J.R_SH * 3;
    for (const k of keys) {
      const g = k.ball && k.grip && REACH_GRIPS[k.grip] ? A.GRIP[k.grip] : null;
      if (!g || !g.r) continue;
      sk.solve(k.p, 0, 0, 0);
      // (facing along +x: the body's right is -y)
      const sx = -sk.P[S3 + 1], sy = sk.P[S3], sz = sk.P[S3 + 2], Hk = dims.H;
      const dx = k.ball[0] * Hk + g.r[0] * BR - sx, dy = k.ball[1] * Hk + g.r[1] * BR - sy, dz = k.ball[2] * Hk + g.r[2] * BR - sz, d = Math.hypot(dx, dy, dz);
      if (d > Lr) { const q = (Lr / d - 1) / Hk; k.ball = [k.ball[0] + dx * q, k.ball[1] + dy * q, k.ball[2] + dz * q]; }
    }
    const def = { dur, events, keys };
    if (ft) def.feet = [[0, 'plant']];
    else {
      def.jump = { t0, t1, h: hFt / (H * vK), hFt };
      def.feet = [[0, 'plant'], [t0, 'air'], [t1, 'plant']];
    }
    if (root) def.root = root;
    if (steps) def.steps = steps;
    // (the turnaround: round over the shoulder from the back to the basket to the rim, pivoting on the balls of both feet)
    if (post) {
      def.yaw = [[0, -180 * sgn], [0.14 / sp, -120 * sgn], [0.3 / sp, -40 * sgn], [0.44 / sp, 0], [dur, 0]];
      def.pivot = { side: 2, t0: 0, t1: 0.44 / sp };
    }
    return def;
  }
  /**
   * a player's own shot form (Trial 9: "each player has their own shot form"), drawn once from Tune.shot.form's ranges by
   * hashes of the player's id and shaped by the player's shooting (a better shooter toward the quicker, higher, cleaner end:
   * the elbow in, the follow-through held) and size (a big body slower, lower off the floor, more often two motions); a.shotForm (the
   * lab's two shooters) replaces it
   */
  function shotForm(a) {
    if (!a) return MID_FORM;
    if (a.shotForm) return a.shotForm;
    if (a._shotForm) return a._shotForm;
    const F = M.Tune.shot.form, id = String(a.id), lk = a.look || {};
    const h = (k) => U.hashStr(id + ':' + k) / 4294967296;
    const sk = U.clamp(((lk.three != null ? +lk.three : 50) * 0.6 + (lk.mid != null ? +lk.mid : 50) * 0.4 - 30) / 60, 0, 1);
    const big = U.clamp((a.H - 6.4) / 0.7, 0, 1);
    const at = (r, u) => r[0] + (r[1] - r[0]) * U.clamp(u, 0, 1);
    const toward = (u, v, w) => u * (1 - w) + v * w;
    a._shotForm = {
      // (the same hash as ever for one motion or two: the players keep the shot they had)
      motion: h('form') < (a.H > 6.7 ? F.twoMotionBigP : F.twoMotionP) ? 2 : 1,
      speed: at(F.speed, toward(h('speed'), sk, 0.4) - 0.25 * big),
      relH: at(F.relH, toward(h('relH'), sk, 0.5)),
      setH: at(F.setH, h('setH')),
      flareDeg: at(F.flareDeg, toward(h('flare'), 1 - sk, 0.5)),
      jump: at(F.jump, h('jump') - 0.2 * big),
      dip: at(F.dip, h('dip')),
      holdS: at(F.holdS, toward(h('hold'), sk, 0.5)),
      relApexS: at(F.relApexS, h('apex')),
      drift: at(F.drift, h('drift')),
      lean: at(F.lean, h('lean')),
      kick: h('kick') < F.kickP ? 1 : 0,
    };
    return a._shotForm;
  }
  /** the clip this player shoots `name` with, in the player's own form (o.contest 0-1: the contest shapes it too): the jump
   *  shot family is built for each player once per contest level and kept; any other clip is the library's */
  function shotClip(a, name, o) {
    if (!JUMPERS[name] || !a) return A.get(name);
    const c = o && o.contest ? Math.round(U.clamp(o.contest, 0, 1) * 2) / 2 : 0;
    const key = name + ':' + c;
    const m = a._shotClips || (a._shotClips = {});
    if (!m[key]) { const d = jumperDef(name, shotForm(a), { contest: c, H: a.H, vert: a.rVert, dims: a.dims }); d.name = name; m[key] = A.buildClip(d); }
    return m[key];
  }
  A.jumperDef = jumperDef; A.shotForm = shotForm; A.shotClip = shotClip; A.MID_FORM = MID_FORM;
  const SA = A.SHOT_ARMS, SB = A.SHOT_BALL;
  const arms = (phase, torso) => Object.assign({}, torso || {}, SA[phase]);


  // ------------------------------------------------------------ finishes at the rim
  // right-hand layup (the user's reference frames): gathered off the dribble at the right hip with both hands, carried
  // up the outside over the right-left steps, lifted over the right shoulder at the left-foot take-off with the right
  // knee driving (out beside the shoulder, a forearm clear of the face: the left hand comes off under the chin and
  // the right hand alone takes it up, so no frame has the forearms folded across the face), then the body goes vertical, the right arm straight up and the ball rolls off the finger pads at the
  // top while the left arm goes out for balance. Arms fitted to the rig at each phase (grips lay* in anims.js). The
  // take-off gets the hand up to the rim (~0.37 H, 24-33 in by athleticism, a guard's running one-foot jump) and the
  // airtime matches that height (T = sqrt(8h/g) ~ 0.76 s), so the rise and fall look like real gravity
  const LAY = {
    gather: { rShF: 7.5, rShA: 12, rShT: -14, rElF: 59.5, rPro: 21.5, rWrF: -3.5, rWrD: 25, lShF: 47.5, lShA: -18.5, lShT: 79.5, lElF: 64.5, lPro: 95, lWrF: -51, lWrD: -20 },
    carry: { rShF: 0.5, rShA: 17.5, rShT: -22.5, rElF: 108, rPro: 117.5, rWrF: -75, rWrD: 25, lShF: 80.5, lShA: -26.5, lShT: 80, lElF: 64.5, lPro: 70, lWrF: -52.5, lWrD: -20 },
    step2: { rShF: 8, rShA: 27, rShT: -37, rElF: 123.5, rPro: 106.5, rWrF: -75, rWrD: 25, lShF: 99.5, lShA: -33, lShT: 80, lElF: 65, lPro: 72.5, lWrF: -64.5, lWrD: -20 },
    takeoff: { rShF: 17, rShA: 37.5, rShT: -19, rElF: 103, rPro: 100, rWrF: -75, rWrD: 25, lShF: 73.5, lShA: -41, lShT: 64, lElF: 33.5, lPro: 29, lWrF: -50, lWrD: 25 },
    lift: { rShF: 80.5, rShA: 28, rShT: 8, rElF: 66.5, rPro: 117.5, rWrF: -75, rWrD: 25, lShF: 67, lShA: -16.5, lShT: 46.5, lElF: 32.5, lPro: 134.5, lWrF: 7, lWrD: -11.5 },
    reach: { rShF: 122.5, rShA: -4.5, rShT: -5.5, rElF: 24, rPro: 154.5, rWrF: -75, rWrD: 25, lShF: 75, lShA: 55, lShT: 44.5, lElF: 42.5, lPro: 121, lWrF: 19, lWrD: -25, lFing: 0.3 },
    release: { rShF: 141, rShA: -6, rShT: 33.5, rElF: 0, rPro: 156, rWrF: -62.5, rWrD: -12.5, rFing: 0.15, lShF: 63.5, lShA: 58.5, lShT: 41.5, lElF: 40.5, lPro: 115, lWrF: 9.5, lWrD: -25, lFing: 0.3 },
  };
  const LAY_B = { gather: [0.14, 0.21, 0.5], carry: [0.17, 0.26, 0.6], step2: [0.2, 0.23, 0.72], takeoff: [0.2, 0.2, 0.86], lift: [0.19, 0.2, 1.03], reach: [0.1, 0.14, 1.16], release: [0.09, 0.15, 1.235] };
  A.LAY = LAY; A.LAY_B = LAY_B;
  clip('layup', {
    dur: 1.52, events: { gather: 0.04, set: 0.46, release: 0.8 },
    jump: { t0: 0.46, t1: 1.22, h: 0.37 },
    feet: [[0, 'plant'], [0.46, 'air'], [1.22, 'plant']],
    steps: [{ t0: 0.0, t1: 0.13, foot: 'r', to: [1.9, 0.35], lift: 0.1 }, { t0: 0.15, t1: 0.4, foot: 'l', to: [5.0, -0.3], lift: 0.12 }],
    // (the right foot leaves the floor just before the left comes down, the right knee driving up as the left pushes off)
    lifts: [{ foot: 'r', t: 0.36 }],
    root: [[0, 0, 0], [0.13, 1.7, 0.1], [0.4, 4.9, 0], [0.46, 5.6, 0], [0.8, 7.6, 0], [1.22, 9.7, 0], [1.52, 10.3, 0]],
    keys: [
      { t: 0.0, p: { base: 'ready', rootZ: -0.05, pelPitch: 16, spFlex: 10, rShF: 20, rShA: 22, rElF: 70, rPro: 60, lShF: 50, lShA: 30, lElF: 85, lPro: 20 }, ball: [0.15, 0.2, 0.4], grip: 'right' },
      { t: 0.12, p: Object.assign({ rootZ: -0.06, pelPitch: 18, spFlex: 10, chTwist: 10, nkFlex: -10 }, LAY.gather), ball: LAY_B.gather, grip: 'layGather' },
      { t: 0.26, p: Object.assign({ rootZ: -0.065, pelPitch: 16.8, pelRoll: 2.1, spFlex: 8.4, spLat: -1.1, chFlex: 1.3, chTwist: 8.9, nkFlex: -9.4, hdFlex: 5.3, lHipF: 20.2, lHipA: 3.7, lHipT: -5.9, lKnee: 29.3, lAnk: 1.8, rHipF: 5, rHipA: 1.5, rHipT: -5.9, rKnee: 29.1, rAnk: -1.5 }, LAY.carry), ball: LAY_B.carry, grip: 'layCarry' },
      { t: 0.4, p: Object.assign({ rootZ: -0.06, pelPitch: 14, spFlex: 6, chTwist: 6, nkFlex: -10, lHipF: 30, lKnee: 45, rHipF: 20, rKnee: 60 }, LAY.step2), ball: LAY_B.step2, grip: 'layStep' },
      { t: 0.52, p: Object.assign({ rootZ: 0, pelPitch: 2, spFlex: -2, chFlex: -6, chTwist: 8, nkFlex: -14, hdFlex: -8, rHipF: 95, rKnee: 100, rAnk: 10, lHipF: -5, lKnee: 12, lAnk: -35 }, LAY.takeoff), ball: LAY_B.takeoff, grip: 'layLift' },
      { t: 0.59, p: Object.assign({ rootZ: 0.006, pelPitch: 0.3, pelRoll: 2, spFlex: -3.3, spLat: -1, chFlex: -7.2, chTwist: 4, nkFlex: -15.5, hdFlex: -10.1, lHipF: -7.6, lHipA: 4, lHipT: -6, lKnee: 10.5, lAnk: -39.7, rHipF: 100.9, rHipA: 2, rHipT: -6, rKnee: 103.7, rAnk: 8.7 }, LAY.lift), ball: LAY_B.lift, grip: 'layLift2' },
      { t: 0.66, p: Object.assign({ rootZ: 0.004, pelPitch: 0, pelRoll: 2, spFlex: -3.7, spLat: -1, chFlex: -7.6, nkFlex: -16.6, hdFlex: -10.8, lHipF: -5.6, lHipA: 4, lHipT: -6, lKnee: 13.4, lAnk: -39.8, rHipF: 97, rHipA: 2, rHipT: -6, rKnee: 102, rAnk: 5.7 }, LAY.reach), ball: LAY_B.reach, grip: 'layReach' },
      { t: 0.8, p: Object.assign({ rootZ: 0, pelPitch: 0, spFlex: -4, chFlex: -8, nkFlex: -18, hdFlex: -10, rHipF: 85, rKnee: 95, lHipF: 0, lKnee: 20, lAnk: -35 }, LAY.release), ball: LAY_B.release, grip: 'layRel' },
      // follow-through: the wrist has flicked the ball up off the fingers, the arm stays up, the left arm out
      { t: 0.96, p: { rootZ: 0, pelPitch: 2, spFlex: -2, chFlex: -6, nkFlex: -14, rShF: 146, rShA: -4, rShT: 30, rElF: 6, rPro: 140, rWrF: 45, rFing: 0.3, lShF: 55, lShA: 55, lShT: 40, lElF: 40, lPro: 110, lWrF: 5, lFing: 0.3, rHipF: 60, rKnee: 70, lHipF: 10, lKnee: 25 } },
      // (the landing: toes first with the legs long, then the knees and hips give)
      { t: 1.22, p: { rootZ: -0.01, pelPitch: 6, spFlex: 6, lShF: 45, lShA: 30, lElF: 55, rShF: 70, rShA: 20, rElF: 45, both: { HipF: 16, HipA: 8, Knee: 18, Ank: -6 } } },
      { t: 1.32, p: { rootZ: -0.07, pelPitch: 14, spFlex: 6, lShF: 45, lShA: 30, lElF: 55, rShF: 70, rShA: 20, rElF: 45, both: { HipF: 30, HipA: 8, Knee: 50, Ank: 10 } } },
      { t: 1.52, p: 'ready' },
    ],
  });
  // reverse layup: along the baseline, finish on the far side, arm reaching back
  clip('reverse', {
    dur: 1.56, events: { gather: 0.04, set: 0.46, release: 0.82 },
    jump: { t0: 0.46, t1: 1.22, h: 0.37 },
    feet: [[0, 'plant'], [0.46, 'air'], [1.22, 'plant']],
    steps: [{ t0: 0.0, t1: 0.13, foot: 'r', to: [1.9, 0.35], lift: 0.1 }, { t0: 0.15, t1: 0.4, foot: 'l', to: [4.8, -0.3], lift: 0.12 }],
    lifts: [{ foot: 'r', t: 0.36 }],
    root: [[0, 0, 0], [0.13, 1.7, 0.1], [0.4, 4.7, 0], [0.46, 5.4, 0], [0.82, 7.8, -0.3], [1.22, 9.5, -0.4], [1.56, 10.0, -0.4]],
    yaw: [[0, 0], [0.46, 0], [0.82, 40], [1.22, 60], [1.56, 60]],
    keys: [
      { t: 0.0, p: { base: 'ready', rootZ: -0.05, pelPitch: 16, spFlex: 10, rShF: 20, rShA: 22, rElF: 70, rPro: 60, lShF: 50, lShA: 30, lElF: 85, lPro: 20 }, ball: [0.15, 0.2, 0.4], grip: 'right' },
      // (the layup's gather at the hip and carry up the outside, so the ball never comes across the face)
      { t: 0.12, p: Object.assign({ rootZ: -0.06, pelPitch: 18, spFlex: 10, chTwist: 10, nkFlex: -10 }, LAY.gather), ball: LAY_B.gather, grip: 'layGather' },
      { t: 0.26, p: Object.assign({ rootZ: -0.065, pelPitch: 16.8, spFlex: 8.4, chFlex: 1.3, chTwist: 8.9, nkFlex: -9.4, hdFlex: 5.3, lHipF: 20, lKnee: 29, rHipF: 5, rKnee: 29 }, LAY.carry), ball: LAY_B.carry, grip: 'layCarry' },
      { t: 0.4, p: Object.assign({ rootZ: -0.06, pelPitch: 14, spFlex: 6, chTwist: 6, nkFlex: -10, lHipF: 30, lKnee: 45, rHipF: 20, rKnee: 60 }, LAY.step2), ball: LAY_B.step2, grip: 'layStep' },
      { t: 0.52, p: Object.assign({ rootZ: 0, pelPitch: 2, spFlex: -2, chFlex: -6, chTwist: 8, nkFlex: -14, hdFlex: -8, rHipF: 95, rKnee: 100, rAnk: 10, lHipF: -5, lKnee: 12, lAnk: -35 }, LAY.takeoff), ball: LAY_B.takeoff, grip: 'layLift' },
      { t: 0.58, p: Object.assign({ rootZ: 0.006, pelPitch: 0.3, spFlex: -3.5, chFlex: -7.2, chTwist: 2, nkFlex: -15.5, nkTwist: -8, hdFlex: -10, lHipF: -6, lKnee: 11, lAnk: -38, rHipF: 96, rKnee: 101, rAnk: 8 }, LAY.lift), ball: LAY_B.lift, grip: 'layLift2' },
      // over the far side of the rim: the trunk turns back, the arm reaches up and back, the left arm out
      { t: 0.68, p: Object.assign({ rootZ: 0, pelPitch: 0, spFlex: -6, chFlex: -8, chTwist: -20, nkFlex: -20, nkTwist: -30, rHipF: 90, rKnee: 100, lHipF: -5, lKnee: 12, lAnk: -35 }, LAY.reach), ball: [0.12, 0.06, 1.18], grip: 'layReach' },
      { t: 0.82, p: { rootZ: 0, pelPitch: -4, spFlex: -10, chFlex: -8, chTwist: -30, nkFlex: -25, nkTwist: -35, lShF: 60, lShA: 60, lShT: 40, lElF: 40, lPro: 110, rShF: 170, rShA: 30, rElF: 10, rPro: 60, rWrF: 20, rHipF: 70, rKnee: 90, lKnee: 20 }, ball: [0.12, -0.02, 1.36], grip: 'rightTop' },
      // (the landing: toes first with the legs long, then the knees and hips give)
      { t: 1.22, p: { rootZ: -0.01, pelPitch: 6, spFlex: 6, lShF: 45, lShA: 26, lElF: 55, rShF: 70, rShA: 20, rElF: 45, both: { HipF: 16, HipA: 8, Knee: 18, Ank: -6 } } },
      { t: 1.32, p: { rootZ: -0.07, pelPitch: 14, spFlex: 6, lShF: 45, lShA: 26, lElF: 55, rShF: 70, rShA: 20, rElF: 45, both: { HipF: 30, HipA: 8, Knee: 50, Ank: 10 } } },
      { t: 1.56, p: 'ready' },
    ],
  });
  // floater: early one-hand push release with a high arc, short jump
  clip('floater', {
    dur: 1.1, events: { gather: 0.04, set: 0.32, release: 0.5 },
    jump: { t0: 0.32, t1: 0.8, h: 0.14 },
    feet: [[0, 'plant'], [0.32, 'air'], [0.8, 'plant']],
    steps: [{ t0: 0.02, t1: 0.26, foot: 'l', to: [2.4, -0.3], lift: 0.1 }],
    lifts: [{ foot: 'r', t: 0.22 }],
    root: [[0, 0, 0], [0.26, 2.2, 0], [0.32, 2.7, 0], [0.8, 4.2, 0], [1.1, 4.5, 0]],
    keys: [
      { t: 0.0, p: { base: 'ready', rootZ: -0.06, pelPitch: 18, spFlex: 10, rShF: 20, rShA: 22, rElF: 70, rPro: 60, lShF: 50, lShA: 30, lElF: 85, lPro: 20 }, ball: [0.15, 0.2, 0.4], grip: 'right' },
      // (up the jump shot's line: the ball in front of the chest, the hand under it past the face, set over the
      // forehead, pushed up and flicked early)
      { t: 0.12, p: arms('dip', { rootZ: -0.08, pelPitch: 16, spFlex: 8, lHipF: 30, lKnee: 45, rHipF: 30, rKnee: 60 }), ball: SB.dip, grip: 'jsLow' },
      { t: 0.22, p: arms('rise', { rootZ: -0.06, pelPitch: 10, spFlex: 4, chFlex: -2, nkFlex: -10, lHipF: 30, lKnee: 40, rHipF: 40, rKnee: 60 }), ball: SB.rise, grip: 'jsRise' },
      { t: 0.3, p: arms('load', { rootZ: -0.02, pelPitch: 5, spFlex: 0, chFlex: -4, nkFlex: -10, rHipF: 55, rKnee: 68, lKnee: 20, lAnk: -20 }), ball: SB.load, grip: 'jsLoad' },
      { t: 0.36, p: arms('set', { rootZ: 0, pelPitch: 4, spFlex: -2, chFlex: -6, nkFlex: -12, rHipF: 60, rKnee: 70, lKnee: 15, lAnk: -30 }), ball: SB.set, grip: 'jsSet' },
      { t: 0.44, p: arms('push', { rootZ: 0, pelPitch: 3, spFlex: -3, chFlex: -6, nkFlex: -13, rHipF: 58, rKnee: 68, lKnee: 16, lAnk: -30 }), ball: SB.push, grip: 'jsPush' },
      { t: 0.5, p: { rootZ: 0, pelPitch: 2, spFlex: -4, chFlex: -6, nkFlex: -14, lShF: 90, lShA: 40, lElF: 50, rShF: 155, rShA: 12, rElF: 25, rPro: 10, rWrF: 60, rFing: 0.3, rHipF: 55, rKnee: 65, lKnee: 18, lAnk: -30 }, ball: [0.05, 0.2, 1.22], grip: 'shootRel' },
      // (the landing: toes first with the legs long, then the knees and hips give)
      { t: 0.8, p: { rootZ: -0.01, pelPitch: 6, spFlex: 2, lShF: 50, lShA: 30, lElF: 50, rShF: 110, rShA: 14, rElF: 20, rWrF: 60, both: { HipF: 16, Knee: 18, Ank: -6 } } },
      { t: 0.9, p: { rootZ: -0.06, pelPitch: 10, spFlex: 2, lShF: 50, lShA: 30, lElF: 50, rShF: 110, rShA: 14, rElF: 20, rWrF: 60, both: { HipF: 24, Knee: 42, Ank: 8 } } },
      { t: 1.1, p: 'ready' },
    ],
  });
  // hook shot: sideways to the rim, sweeping arm over the head
  clip('hook', {
    dur: 1.3, events: { set: 0.4, release: 0.62 },
    jump: { t0: 0.4, t1: 0.88, h: 0.13 },
    feet: [[0, 'plant'], [0.4, 'air'], [0.88, 'plant']],
    steps: [{ t0: 0.05, t1: 0.3, foot: 'l', to: [0.8, -1.2], lift: 0.06 }],
    lifts: [{ foot: 'r', t: 0.3 }],
    root: [[0, 0, 0], [0.3, 0.5, -0.6], [0.4, 0.6, -0.7], [0.88, 1.0, -0.9], [1.3, 1.0, -0.9]],
    yaw: [[0, 0], [0.3, -20], [0.62, -35], [1.3, -30]],
    keys: [
      { t: 0.0, p: { base: 'holdChest', rootZ: -0.07, pelPitch: 20, spFlex: 8 }, ball: [0.04, 0.16, 0.62], grip: 'hold' },
      // (the ball goes out to the right side, away from the defender, while the off arm comes up to shield it; it
      // never passes in front of the face)
      { t: 0.28, p: { rootZ: -0.08, pelPitch: 14, spFlex: 6, spLat: 8, chTwist: 10, nkFlex: -12, nkTwist: 25, lShF: 70, lShA: 50, lElF: 90, rShF: 45, rShA: 55, rElF: 95, rWrF: -30, both: { HipF: 30, Knee: 45 } }, ball: [0.22, 0.1, 0.74], grip: 'right' },
      { t: 0.44, p: { rootZ: 0, pelPitch: 4, spLat: 16, chLat: 8, nkFlex: -10, nkTwist: 30, lShF: 50, lShA: 60, lElF: 80, rShF: 60, rShA: 130, rElF: 40, rWrF: -20, rHipF: 70, rKnee: 80, lKnee: 15, lAnk: -30 }, ball: [0.35, 0.04, 1.2], grip: 'rightTop' },
      { t: 0.62, p: { rootZ: 0, pelPitch: 2, spLat: 18, chLat: 10, nkFlex: -14, nkTwist: 30, lShF: 40, lShA: 55, lElF: 70, rShF: 40, rShA: 165, rElF: 10, rWrF: 40, rFing: 0.3, rHipF: 60, rKnee: 70, lKnee: 18 }, ball: [0.1, 0.02, 1.4], grip: 'rightTop' },
      // (the landing: toes first with the legs long, then the knees and hips give)
      { t: 0.88, p: { rootZ: -0.01, pelPitch: 6, spLat: 6, lShF: 40, lShA: 30, lElF: 50, rShF: 90, rShA: 60, rElF: 30, both: { HipF: 16, Knee: 18, Ank: -6 } } },
      { t: 0.98, p: { rootZ: -0.06, pelPitch: 10, spLat: 6, lShF: 40, lShA: 30, lElF: 50, rShF: 90, rShA: 60, rElF: 30, both: { HipF: 24, Knee: 42 } } },
      { t: 1.3, p: 'ready' },
    ],
  });
  // one-hand dunk: two steps, big jump, ball cocked back then thrown through the rim, optional rim hang
  clip('dunk', {
    dur: 1.6, events: { gather: 0.04, set: 0.5, release: 0.86, rim: 0.9 },
    jump: { t0: 0.46, t1: 1.26, h: 0.4, hang: [0.9, 1.08] },
    feet: [[0, 'plant'], [0.46, 'air'], [1.26, 'plant']],
    steps: [{ t0: 0.0, t1: 0.13, foot: 'r', to: [1.9, 0.35], lift: 0.1 }, { t0: 0.15, t1: 0.4, foot: 'l', to: [5.0, -0.3], lift: 0.12 }],
    lifts: [{ foot: 'r', t: 0.36 }],
    root: [[0, 0, 0], [0.13, 1.7, 0.1], [0.4, 4.9, 0], [0.46, 5.5, 0], [0.86, 7.6, 0], [1.08, 8.0, 0], [1.26, 8.3, 0], [1.6, 8.6, 0]],
    keys: [
      { t: 0.0, p: { base: 'ready', rootZ: -0.05, pelPitch: 16, spFlex: 10, rShF: 20, rShA: 22, rElF: 70, rPro: 60, lShF: 50, lShA: 30, lElF: 85, lPro: 20 }, ball: [0.15, 0.2, 0.4], grip: 'right' },
      { t: 0.14, p: { rootZ: -0.07, pelPitch: 18, spFlex: 10, nkFlex: -10, lShF: 40, lShA: 20, lShT: 25, lElF: 95, lPro: 20, rShF: 30, rShA: 18, rShT: 30, rElF: 100, rPro: 0, rWrF: -20 }, ball: [0.1, 0.16, 0.55], grip: 'hold' },
      { t: 0.4, p: { rootZ: -0.09, pelPitch: 20, spFlex: 8, nkFlex: -14, lShF: -20, lShA: 20, lElF: 40, rShF: 40, rShA: 20, rElF: 90, rWrF: -20, both: { HipF: 45, Knee: 70, Ank: 20 } }, ball: [0.14, 0.12, 0.55], grip: 'right' },
      // (up the outside of the right shoulder on the palm, the left arm out for balance rather than across the face)
      { t: 0.5, p: Object.assign({ rootZ: -0.02, pelPitch: 8, spFlex: 0, chFlex: -4, chTwist: 6, nkFlex: -16, rHipF: 70, rKnee: 90, lHipF: 5, lKnee: 30, lAnk: -25 }, LAY.takeoff, { lShF: 60, lShA: 55, lShT: 30, lElF: 50, lPro: 90, lWrF: 0, lWrD: 0 }), ball: [0.2, 0.2, 0.9], grip: 'layLiftR' },
      { t: 0.6, p: { rootZ: 0, pelPitch: 0, spFlex: -8, chFlex: -8, nkFlex: -20, lShF: 75, lShA: 60, lShT: 30, lElF: 40, rShF: 175, rShA: 20, rElF: 70, rPro: 20, rWrF: -40, rHipF: 60, rKnee: 90, lHipF: 10, lKnee: 40, lAnk: -30 }, ball: [0.1, -0.04, 1.35], grip: 'rightTop' },
      { t: 0.86, p: { rootZ: 0, pelPitch: 4, spFlex: 4, chFlex: 0, nkFlex: -24, lShF: 110, lShA: 36, lElF: 40, rShF: 150, rShA: 16, rElF: 10, rPro: 20, rWrF: 30, rFing: 0.5, rHipF: 40, rKnee: 70, lHipF: 20, lKnee: 60 }, ball: [0.1, 0.3, 1.32], grip: 'slam' },
      { t: 1.0, p: { rootZ: 0, pelPitch: 0, spFlex: -2, nkFlex: -30, lShF: 90, lShA: 40, lElF: 40, rShF: 170, rShA: 14, rElF: 6, rWrF: 20, rFing: 0.9, rHipF: 30, rKnee: 60, lHipF: 30, lKnee: 60 } },
      // (the landing: toes first with the legs long, then the knees and hips give, a dunker's harder)
      { t: 1.26, p: { rootZ: -0.01, pelPitch: 6, spFlex: 8, lShF: 60, lShA: 40, lElF: 70, rShF: 80, rShA: 30, rElF: 60, rFing: 0.9, both: { HipF: 16, HipA: 8, Knee: 18, Ank: -6 } } },
      { t: 1.38, p: { rootZ: -0.11, pelPitch: 18, spFlex: 8, lShF: 60, lShA: 40, lElF: 70, rShF: 80, rShA: 30, rElF: 60, rFing: 0.9, both: { HipF: 40, HipA: 8, Knee: 69, Ank: 14 } } },
      { t: 1.6, p: { base: 'stand', rootZ: -0.02, lShF: 30, lShA: 30, lElF: 90, rShF: 30, rShA: 30, rElF: 90, both: { Fing: 0.9 } } },
    ],
  });
  // two-hand power dunk off two feet (Trial 9): a long, low right step, the left brought down beside it at once (the 1-2),
  // a deep load on both legs, up off both (coaching: a two-foot dunker gathers onto both feet and explodes, deep knee bend,
  // more time on the floor loading; a long penultimate step; not a jump stop, which kills the run's speed)
  clip('dunk2', {
    dur: 1.6, events: { gather: 0.04, set: 0.5, release: 0.86, rim: 0.9 },
    jump: { t0: 0.46, t1: 1.22, h: 0.38 },
    feet: [[0, 'plant'], [0.46, 'air'], [1.22, 'plant']],
    steps: [{ t0: 0.0, t1: 0.16, foot: 'r', to: [2.8, 0.45], lift: 0.1 }, { t0: 0.18, t1: 0.33, foot: 'l', to: [3.6, -0.45], lift: 0.08 }],
    root: [[0, 0, 0], [0.16, 2.3, 0], [0.33, 3.1, 0], [0.46, 3.4, 0], [0.86, 5.6, 0], [1.22, 6.5, 0], [1.6, 6.8, 0]],
    keys: [
      { t: 0.0, p: { base: 'ready', rootZ: -0.05, pelPitch: 16, spFlex: 10, rShF: 20, rShA: 22, rElF: 70, rPro: 60, lShF: 50, lShA: 30, lElF: 85, lPro: 20 }, ball: [0.15, 0.2, 0.4], grip: 'right' },
      { t: 0.14, p: { rootZ: -0.07, pelPitch: 18, spFlex: 10, nkFlex: -10, both: { ShF: 34, ShA: 20, ShT: 30, ElF: 100, Pro: 5, WrF: -30 } }, ball: [0.0, 0.16, 0.6], grip: 'hold' },
      { t: 0.4, p: { rootZ: -0.095, pelPitch: 24, spFlex: 10, nkFlex: -16, both: { ShF: 30, ShA: 20, ShT: 30, ElF: 90, Pro: 5, WrF: -30, HipF: 50, Knee: 75, Ank: 20 } }, ball: [0.0, 0.2, 0.45], grip: 'hold' },
      { t: 0.52, p: { rootZ: -0.02, pelPitch: 8, spFlex: 0, chFlex: -4, nkFlex: -16, both: { ShF: 105, ShA: 18, ShT: 10, ElF: 45, Pro: 10, WrF: -30, HipF: 45, Knee: 70, Ank: -10 } }, ball: [0.0, 0.3, 1.0], grip: 'over' },
      { t: 0.64, p: { rootZ: 0, pelPitch: -4, spFlex: -14, chFlex: -8, nkFlex: -20, both: { ShF: 170, ShA: 22, ShT: 0, ElF: 60, Pro: 10, WrF: -30, HipF: 40, Knee: 80, Ank: -30 } }, ball: [0.0, -0.06, 1.4], grip: 'over' },
      { t: 0.86, p: { rootZ: 0, pelPitch: 6, spFlex: 8, chFlex: 4, nkFlex: -26, both: { ShF: 140, ShA: 22, ShT: 0, ElF: 14, Pro: 10, WrF: 30, Fing: 0.5, HipF: 30, Knee: 70 } }, ball: [0.0, 0.3, 1.3], grip: 'over' },
      { t: 1.0, p: { rootZ: 0, pelPitch: 0, spFlex: -2, nkFlex: -30, both: { ShF: 165, ShA: 20, ElF: 8, Fing: 0.9, HipF: 30, Knee: 60 } } },
      // (the landing: toes first with the legs long, then the knees and hips give, a dunker's harder)
      { t: 1.22, p: { rootZ: -0.01, pelPitch: 6, spFlex: 8, both: { ShF: 60, ShA: 40, ElF: 70, Fing: 0.9, HipF: 16, HipA: 8, Knee: 18, Ank: -6 } } },
      { t: 1.34, p: { rootZ: -0.12, pelPitch: 20, spFlex: 8, both: { ShF: 60, ShA: 40, ElF: 70, Fing: 0.9, HipF: 44, HipA: 8, Knee: 72, Ank: 14 } } },
      { t: 1.6, p: { base: 'stand', both: { ShF: 20, ShA: 40, ElF: 100, Fing: 0.9 } } },
    ],
  });
  // alley-oop: take off, catch the lob in the air, throw it down
  clip('alley', {
    dur: 1.5, events: { set: 0.3, catch: 0.62, release: 0.84, rim: 0.88 },
    jump: { t0: 0.36, t1: 1.16, h: 0.4 },
    feet: [[0, 'plant'], [0.36, 'air'], [1.16, 'plant']],
    steps: [{ t0: 0.02, t1: 0.3, foot: 'l', to: [3.0, -0.3], lift: 0.1 }],
    lifts: [{ foot: 'r', t: 0.26 }],
    root: [[0, 0, 0], [0.3, 3.0, 0], [0.36, 3.6, 0], [0.84, 5.8, 0], [1.16, 6.4, 0], [1.5, 6.6, 0]],
    keys: [
      { t: 0.0, p: { base: 'ready', rootZ: -0.04, pelPitch: 14, spFlex: 8, nkFlex: -20 } },
      { t: 0.3, p: { rootZ: -0.09, pelPitch: 22, spFlex: 8, nkFlex: -24, both: { ShF: -25, ShA: 20, ElF: 30, HipF: 45, Knee: 70, Ank: 20 } } },
      // (off the left foot: the left leg long under the body after the push, the right knee driven up)
      { t: 0.56, p: { rootZ: 0, pelPitch: 0, spFlex: -10, chFlex: -8, nkFlex: -34, lHipF: 12, lKnee: 24, rHipF: 78, rKnee: 95, both: { ShF: 165, ShA: 26, ElF: 30, Pro: 10, WrF: -20, Fing: 0.1, Ank: -30 } } },
      { t: 0.62, p: { rootZ: 0, pelPitch: 0, spFlex: -10, chFlex: -8, nkFlex: -32, lHipF: 14, lKnee: 28, rHipF: 72, rKnee: 90, both: { ShF: 168, ShA: 22, ElF: 40, Pro: 10, WrF: -30 } }, ball: [0.0, 0.0, 1.45], grip: 'over' },
      { t: 0.84, p: { rootZ: 0, pelPitch: 8, spFlex: 8, nkFlex: -26, both: { ShF: 145, ShA: 22, ElF: 12, WrF: 30, Fing: 0.5, HipF: 30, Knee: 70 } }, ball: [0.0, 0.3, 1.32], grip: 'over' },
      // (the landing: toes first with the legs long, then the knees and hips give, a dunker's harder)
      { t: 1.16, p: { rootZ: -0.01, pelPitch: 6, spFlex: 8, both: { ShF: 60, ShA: 40, ElF: 70, HipF: 16, HipA: 8, Knee: 18, Ank: -6 } } },
      { t: 1.28, p: { rootZ: -0.12, pelPitch: 20, spFlex: 8, both: { ShF: 60, ShA: 40, ElF: 70, HipF: 44, HipA: 8, Knee: 72, Ank: 14 } } },
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
      { t: 0.42, p: Object.assign({ rootZ: 0, pelPitch: 2, spFlex: -6, chFlex: -6, chTwist: 8, nkFlex: -26, both: { HipF: 14, Knee: 26, Ank: -30 } }, LAY.takeoff), ball: LAY_B.takeoff, grip: 'layLift' },
      { t: 0.51, p: Object.assign({ rootZ: 0, pelPitch: 1, spFlex: -6, chFlex: -7, chTwist: 4, nkFlex: -27, both: { HipF: 13, Knee: 25, Ank: -31 } }, LAY.lift), ball: LAY_B.lift, grip: 'layLift2' },
      { t: 0.63, p: { rootZ: 0, pelPitch: 0, spFlex: -6, chFlex: -8, nkFlex: -28, lShF: 70, lShA: 36, lElF: 60, rShF: 168, rShA: 12, rShT: 20, rElF: 12, rPro: 150, rWrF: 30, rFing: 0.2, both: { HipF: 12, Knee: 24, Ank: -32 } }, ball: [0.08, 0.2, 1.36], grip: 'rightTop' },
      // (the landing: toes first with the legs long, then the knees and hips give)
      { t: 0.99, p: { rootZ: -0.01, pelPitch: 6, spFlex: 6, lShF: 45, lShA: 26, lElF: 55, rShF: 80, rShA: 20, rElF: 40, both: { HipF: 16, HipA: 8, Knee: 18, Ank: -6 } } },
      { t: 1.09, p: { rootZ: -0.08, pelPitch: 16, spFlex: 6, lShF: 45, lShA: 26, lElF: 55, rShF: 80, rShA: 20, rElF: 40, both: { HipF: 32, HipA: 8, Knee: 52, Ank: 10 } } },
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
      { t: 0.34, p: { rootZ: -0.03, pelPitch: 8, spFlex: 0, chFlex: -4, nkFlex: -18, both: { ShF: 100, ShA: 18, ShT: 10, ElF: 45, Pro: 10, WrF: -30, HipF: 35, Knee: 60, Ank: -10 } }, ball: [0.0, 0.3, 0.98], grip: 'over' },
      { t: 0.46, p: { rootZ: 0, pelPitch: -4, spFlex: -12, chFlex: -8, nkFlex: -24, both: { ShF: 172, ShA: 22, ElF: 50, Pro: 10, WrF: -30, HipF: 30, Knee: 60, Ank: -30 } }, ball: [0.0, -0.04, 1.42], grip: 'over' },
      { t: 0.62, p: { rootZ: 0, pelPitch: 6, spFlex: 8, chFlex: 4, nkFlex: -26, both: { ShF: 145, ShA: 22, ElF: 12, WrF: 30, Fing: 0.5, HipF: 30, Knee: 60 } }, ball: [0.0, 0.3, 1.32], grip: 'over' },
      { t: 0.78, p: { rootZ: 0, pelPitch: 0, spFlex: -2, nkFlex: -30, both: { ShF: 166, ShA: 20, ElF: 8, Fing: 0.9, HipF: 26, Knee: 56 } } },
      // (the landing: toes first with the legs long, then the knees and hips give, a dunker's harder)
      { t: 1.0, p: { rootZ: -0.01, pelPitch: 6, spFlex: 8, both: { ShF: 60, ShA: 40, ElF: 70, HipF: 16, HipA: 8, Knee: 18, Ank: -6 } } },
      { t: 1.12, p: { rootZ: -0.12, pelPitch: 20, spFlex: 8, both: { ShF: 60, ShA: 40, ElF: 70, HipF: 44, HipA: 8, Knee: 72, Ank: 14 } } },
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
      // (the landing: toes first with the legs long, then the knees and hips give)
      { t: 0.74, p: { rootZ: -0.01, pelPitch: 6, spFlex: 6, both: { ShF: 60, ShA: 30, ElF: 50, HipF: 16, Knee: 18, Ank: -6 } } },
      { t: 0.84, p: { rootZ: -0.08, pelPitch: 16, spFlex: 6, both: { ShF: 60, ShA: 30, ElF: 50, HipF: 32, Knee: 52 } } },
      { t: 1.05, p: 'ready' },
    ],
  });

  // ------------------------------------------------------------ rebounding / defense
  // rebound: load, jump, two hands up, grab at the apex, chin it on the way down (elbows out)
  {
    // (the take eased: the ball comes out of the grab slowly and then is ripped down, instead of going from the top of the
    // jump to ~15 ft/s down the frame it is taken, the hands with it, Trial 11)
    const def = {
    dur: 1.25, events: { set: 0.22, grab: 0.5 },
    jump: { t0: 0.24, t1: 0.8, h: 0.24 },
    feet: [[0, 'plant'], [0.24, 'air'], [0.8, 'plant']],
    keys: [
      { t: 0.0, p: { base: 'ready', rootZ: -0.08, pelPitch: 24, spFlex: 8, nkFlex: -34, hdFlex: -10, both: { ShF: 80, ShA: 30, ElF: 70, HipF: 40, Knee: 58 } } },
      { t: 0.2, p: { rootZ: -0.12, pelPitch: 26, spFlex: 8, nkFlex: -30, both: { ShF: 40, ShA: 30, ElF: 60, HipF: 50, Knee: 76, Ank: 20 } } },
      { t: 0.4, p: { rootZ: 0, pelPitch: 0, spFlex: -8, chFlex: -6, nkFlex: -40, hdFlex: -10, both: { ShF: 172, ShA: 20, ShT: 0, ElF: 20, Pro: 20, WrF: -20, Fing: 0.1, HipF: 20, Knee: 34, Ank: -30 } } },
      // (the ball where two hands up at full stretch hold it: about a standing reach, ~1.33 heights to the fingertips; set at
      // 1.42 heights it was out of the arms' reach, and the hands only met it on its way back down, after the top, Trial 11)
      { t: 0.5, p: { rootZ: 0, pelPitch: 0, spFlex: -8, chFlex: -6, nkFlex: -38, both: { ShF: 170, ShA: 18, ElF: 26, Pro: 15, WrF: -10, HipF: 22, Knee: 36, Ank: -30 } }, ball: [0.0, 0.12, 1.3], grip: 'over' },
      { t: 0.6, p: { rootZ: 0, pelPitch: 4, spFlex: -1, chFlex: -1, nkFlex: -24, both: { ShF: 110, ShA: 20, ShT: 10, ElF: 35, Pro: 15, WrF: -20, HipF: 26, Knee: 40, Ank: -20 } }, ball: [0.0, 0.3, 1.08], grip: 'over' },
      // (chinned: under the chin through the landing, the elbows out; the chin comes down with the body as it lands, Trial 11)
      { t: 0.7, p: { rootZ: 0, pelPitch: 8, spFlex: 6, chFlex: 4, nkFlex: -18, both: { ShF: 55, ShA: 50, ShT: 30, ElF: 105, Pro: 10, WrF: -30, HipF: 30, Knee: 44 } }, ball: [0.0, 0.22, 0.84], grip: 'hold' },
      { t: 0.8, p: { rootZ: -0.08, pelPitch: 22, spFlex: 10, chFlex: 6, nkFlex: -16, both: { ShF: 50, ShA: 55, ShT: 30, ElF: 100, Pro: 10, WrF: -30, HipF: 44, HipA: 10, Knee: 62, Ank: 18 } }, ball: [0.0, 0.3, 0.74], grip: 'hold' },
      { t: 1.25, p: { base: 'holdChest', rootZ: -0.06, both: { ShA: 40 } }, ball: [0.0, 0.24, 0.7], grip: 'hold' },
    ],
  };
    const at = (t) => A.sampleClip(A.buildClip({ name: '_rebound', keys: def.keys }), t, new Float32Array(RG.NCH));
    const eased = { t: 0.55, p: at(0.55), ball: [0.0, 0.16, 1.24], grip: 'over' };
    def.keys.splice(def.keys.findIndex(k => k.t === 0.6), 0, eased);
    clip('rebound', def);
  }
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
  // (the hand up over ~0.3 s, a quick raise: up in 0.18 s the hand went ~4.5 ft in 0.12 s, ~40 ft/s, and the arm popped, Trial 11)
  clip('contestUp', {
    dur: 0.95, mask: 'upper',
    keys: [
      { t: 0.0, p: 'defense' },
      { t: 0.28, p: { base: 'contest' } },
      { t: 0.7, p: { base: 'contest', rShF: 168 } },
      { t: 0.95, p: 'defense' },
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
      { t: 0.34, p: { base: 'holdChest', rootZ: -0.1, pelPitch: 30, spFlex: 12, nkFlex: -20, both: { ShF: 75, ShA: 16, ElF: 30, Pro: 10, HipF: 50, Knee: 60 } }, ball: [0.0, 0.44, 0.6], grip: 'hold' },
      { t: 0.47, p: { base: 'holdChest', rootZ: -0.08, pelPitch: 22, spFlex: 9, nkFlex: -16, both: { ShF: 55, ShA: 20, ElF: 70, Pro: 10, HipF: 36, Knee: 44 } }, ball: [0.0, 0.33, 0.64], grip: 'hold' },
      { t: 0.6, p: { base: 'holdChest', rootZ: -0.06 }, ball: [0.0, 0.2, 0.68], grip: 'hold' },
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
  // (push: where the arms start taking the ball forward out of the windup, the ball at its furthest back or lowest; the
  // pass is planned there and the ball's path from there to the release brought up to the flight's launch speed, Trial 10)
  const passBase = (name, dur, rel, keys, push) => clip(name, { dur, mask: 'upper', events: push != null ? { push, release: rel } : { release: rel }, keys });
  // (the pass arms are fitted to the rig like the chest pass: thumbs behind the ball, forearms turning in through
  // the release to thumbs down, palms out)
  passBase('passBounce', 0.62, 0.26, [
    { t: 0, p: 'holdChest', ball: [0.0, 0.16, 0.66], grip: 'hold' },
    { t: 0.14, p: { base: 'holdChest', pelPitch: 16, spFlex: 6, both: { ShF: -0.5, ShA: 15, ShT: 39, ElF: 119.5, Pro: 130.5, WrF: -70, WrD: 15, Fing: 0.1 } }, ball: [0.0, 0.16, 0.62], grip: 'passW' },
    { t: 0.26, p: { pelPitch: 24, spFlex: 16, chFlex: 8, nkFlex: -16, both: { ShF: 41, ShA: 5, ShT: 29, ElF: 87.5, Pro: 141, WrF: -70, WrD: 13.5, Fing: 0.08 } }, ball: [0.0, 0.4, 0.53], grip: 'passRB' },
    { t: 0.44, p: { pelPitch: 20, spFlex: 12, chFlex: 6, nkFlex: -14, both: { ShF: 87, ShA: 5.5, ShT: 80, ElF: 22, Pro: 166, WrF: -5, WrD: -15, Fing: 0.1 } } },
    { t: 0.62, p: 'ready' },
  ], 0.12);
  // (the ball goes up in front of the face, not through it: straight from the chest to over the head it went through
  // the head, pushed out below the chin and then over the brow, ~1.4 ft in one frame, and the arms flipped over the top
  // after it, Trial 10) (held over the forehead, not the crown, and let go at the forehead's height: from over the crown
  // the chest leaning into the throw left the ball behind the shoulders, the arms past their range, ~1-5 in off it, and
  // a release lower than the hold bent the push down into the forearms)
  passBase('passOverhead', 0.7, 0.3, [
    { t: 0, p: 'holdChest', ball: [0.0, 0.16, 0.66], grip: 'hold' },
    { t: 0.08, p: { pelPitch: 6, spFlex: -2, chFlex: -2, nkFlex: -6, both: { ShF: 100, ShA: 4, ShT: 26, ElF: 92, Pro: 112, WrF: -30, WrD: -12, Fing: 0.1 } }, ball: [0.0, 0.21, 0.93], grip: 'overW' },
    { t: 0.16, p: { pelPitch: 2, spFlex: -6, chFlex: -6, nkFlex: -8, both: { ShF: 143, ShA: -4, ShT: 19, ElF: 56.5, Pro: 114, WrF: -27, WrD: -15, Fing: 0.1 } }, ball: [0.0, 0.14, 1.06], grip: 'overW' },
    { t: 0.3, p: { pelPitch: 12, spFlex: 8, chFlex: 4, nkFlex: -10, both: { ShF: 128, ShA: -12, ShT: 6, ElF: 73.5, Pro: 148.5, WrF: -15, WrD: -4, Fing: 0.08 } }, ball: [0.0, 0.3, 1.03], grip: 'overR' },
    { t: 0.5, p: { pelPitch: 10, spFlex: 6, nkFlex: -10, both: { ShF: 126, ShA: 5.5, ShT: 47, ElF: 34, Pro: 166, WrF: 39, WrD: -0.5, Fing: 0.1 } } },
    { t: 0.7, p: 'ready' },
  ], 0.16);
  // one-hand push pass off the dribble (kick-out / swing)
  // (from the two-handed hold a pass off the dribble is gathered into, as the others: it started at the right hip, and the
  // ball went down there from the chest and back up through the push, slowing to ~6 ft/s half way, Trial 10)
  passBase('passPush', 0.5, 0.18, [
    { t: 0, p: 'holdChest', ball: [0.0, 0.16, 0.66], grip: 'hold' },
    { t: 0.09, p: { base: 'ready', spTwist: 10, chTwist: 10, rShF: 45, rShA: 30, rShT: 30, rElF: 110, rPro: 0, rWrF: -50 }, ball: [0.06, 0.25, 0.6], grip: 'right' },
    { t: 0.18, p: { base: 'ready', spTwist: -8, chTwist: -10, rShF: 80, rShA: 12, rShT: 40, rElF: 12, rPro: 150, rWrF: 30, rFing: 0.1 }, ball: [0.1, 0.36, 0.72], grip: 'right' },
    { t: 0.34, p: { base: 'ready', spTwist: -6, chTwist: -8, rShF: 84, rShA: 8, rShT: 60, rElF: 8, rPro: 166, rWrF: 40, rWrD: -10, rFing: 0.12 } },
    { t: 0.5, p: 'ready' },
  ], 0.09);
  // behind the back (right hand, out to the left; Trial 10): gathered to the right hip, carried round behind the back and
  // let go past the spine going left, the chest turned a little right throughout and the eyes front; the push is only the
  // last of it, round the back (a push from the hip went straight through the body), at the small of the back (at the
  // hips it was out of the arm's reach, the hand ~1 ft off it). (The chest turning back left through the release brought
  // the right shoulder forward, and the ball behind the back and low at the hip were past the arm's length, the ball
  // carried ~1.5 in off its path; up at the small of the back the arm bends, the elbow behind, and reaches it)
  passBase('passBehindBack', 0.72, 0.3, [
    { t: 0, p: 'holdChest', ball: [0.0, 0.16, 0.66], grip: 'hold' },
    { t: 0.12, p: { base: 'ready', chTwist: -14, spTwist: -6, rShF: 10, rShA: 25, rShT: 20, rElF: 70, rPro: 40, rWrF: -30, lShF: 30, lShA: 25, lElF: 70 }, ball: [0.2, 0.06, 0.56], grip: 'right' },
    { t: 0.21, p: { base: 'ready', chTwist: -16, spTwist: -7, rShF: -25, rShA: 22, rShT: 55, rElF: 70, rPro: 50, rWrF: -10, lShF: 28, lShA: 30, lElF: 65 }, ball: [0.16, -0.04, 0.61], grip: 'btbPass' },
    { t: 0.3, p: { base: 'ready', chTwist: -12, spTwist: -5, rShF: -40, rShA: 18, rShT: 75, rElF: 60, rPro: 60, rWrF: 20, lShF: 25, lShA: 35, lElF: 60 }, ball: [-0.04, -0.1, 0.6], grip: 'btbPass' },
    { t: 0.46, p: { base: 'ready', chTwist: -6, rShF: -40, rShA: 25, rShT: 75, rElF: 25, rPro: 70, rWrF: 35, lShF: 20, lShA: 30, lElF: 50 } },
    { t: 0.72, p: 'ready' },
  ], 0.21);
  // a one-handed whip (right hand, out to the right: a kick to the corner; Trial 10): the ball taken across in front with
  // the right hand on its inside, the arm whipped out and the wrist snapped through, the chest staying front
  passBase('passWhip', 0.5, 0.18, [
    { t: 0, p: 'holdChest', ball: [0.0, 0.16, 0.66], grip: 'hold' },
    { t: 0.07, p: { base: 'ready', chTwist: 14, spTwist: 7, rShF: 50, rShA: 10, rShT: 30, rElF: 100, rPro: 60, rWrF: -40, lShF: 30, lShA: 20, lElF: 80 }, ball: [0.0, 0.2, 0.65], grip: 'whipR' },
    { t: 0.18, p: { base: 'ready', chTwist: -14, spTwist: -7, rShF: 70, rShA: 45, rShT: 10, rElF: 20, rPro: 120, rWrF: 30, lShF: 20, lShA: 20, lElF: 70 }, ball: [0.26, 0.28, 0.66], grip: 'whipR' },
    { t: 0.32, p: { base: 'ready', chTwist: -18, rShF: 65, rShA: 60, rShT: 0, rElF: 10, rPro: 150, rWrF: 45, lShF: 20, lShA: 20, lElF: 70 } },
    { t: 0.5, p: 'ready' },
  ], 0.07);
  // the pass fake (Trial 10): the ball pushed out toward the fake as a chest pass starts, the eyes and chest with it, and
  // pulled back in; the feet stay
  clip('passFake', {
    dur: 0.52, mask: 'upper', events: { fake: 0.17 },
    keys: [
      { t: 0, p: 'holdChest', ball: [0.0, 0.16, 0.66], grip: 'hold' },
      { t: 0.17, p: { pelPitch: 14, spFlex: 6, chFlex: 2, nkFlex: -10, both: { ShF: 28, ShA: -2, ShT: 24, ElF: 100, Pro: 145, WrF: -40, WrD: 0, Fing: 0.1 } }, ball: [0.0, 0.25, 0.69], grip: 'passW' },
      { t: 0.36, p: { base: 'holdChest', pelPitch: 8 }, ball: [0.0, 0.17, 0.66], grip: 'hold' },
      { t: 0.52, p: 'holdChest', ball: [0.0, 0.16, 0.66], grip: 'hold' },
    ],
  });
  // (the lob: dipped to the waist, brought out in front of the chest with the arms reaching, then pushed up and out over
  // the head. Straight up from the dip close in front of the chest, the hands passed the shoulders ~0.2 H off them, the
  // elbows shut and the shoulders past their twist, the hands ~3.5 in off the ball, Trial 10)
  passBase('passLob', 0.72, 0.32, [
    { t: 0, p: 'holdChest', ball: [0.0, 0.16, 0.66], grip: 'hold' },
    { t: 0.14, p: { base: 'holdChest', pelPitch: 18, spFlex: 8, both: { ShF: 30, ShA: 26, ElF: 110, WrF: -40 } }, ball: [0.0, 0.14, 0.56], grip: 'hold' },
    { t: 0.23, p: { base: 'holdChest', pelPitch: 12, spFlex: 4, nkFlex: -10, both: { ShF: 75, ShA: 16, ShT: 10, ElF: 70, Pro: 110, WrF: -30 } }, ball: [0.0, 0.28, 0.8], grip: 'hold' },
    { t: 0.32, p: { pelPitch: 2, spFlex: -6, chFlex: -6, nkFlex: -22, both: { ShF: 140, ShA: 8, ShT: 20, ElF: 20, Pro: 130, WrF: 10, Fing: 0.1 } }, ball: [0.0, 0.28, 1.04], grip: 'over' },
    { t: 0.52, p: { pelPitch: 4, spFlex: -2, nkFlex: -20, both: { ShF: 132, ShA: 10, ShT: 30, ElF: 18, Pro: 150, WrF: 40 } } },
    { t: 0.72, p: 'ready' },
  ], 0.23);
  // baseball-style outlet (right hand): the ball taken up in front of the right shoulder with both hands, cocked beside the
  // right ear with the right hand behind it (the chest turned right, the elbow out at the shoulder's height, the forearm
  // up) over ~0.26 s, then thrown through quickly as the chest turns back left, released in front of the face with the
  // elbow still bent (Trial 10: cocked out wide behind the head, the arm's reach could not follow it there, the
  // shoulder's two solutions flipped and the arm went straight out, the ball ~2 ft off its path; a long slow push could
  // not bring it to ~44 ft/s without first slowing it; and the chest turned the wrong way, left, bringing the right
  // shoulder forward past the ball: the arm reached back past its length, and the release key's straight arm left the
  // elbow no way to point, the shoulder flipping ~120 deg in a frame. The keys' balls are where the key poses' own hands
  // hold it, fitted by FK)
  clip('passOutlet', {
    dur: 0.8, mask: 'upper', events: { push: 0.26, release: 0.36 },
    keys: [
      { t: 0, p: 'holdChest', ball: [0.0, 0.16, 0.66], grip: 'hold' },
      { t: 0.1, p: { base: 'holdChest', chTwist: -10, spTwist: -5, nkTwist: 10, rShF: 80, rShA: 30, rShT: 10, rElF: 120, rPro: 80, rWrF: -40, lShF: 80, lShA: 10, lShT: 30, lElF: 110 }, ball: [0.11, 0.26, 0.84], grip: 'outletLift' },
      { t: 0.2, p: { base: 'holdChest', chTwist: -24, spTwist: -12, nkTwist: 24, rShF: 105, rShA: 45, rShT: -20, rElF: 115, rPro: 90, rWrF: -40, lShF: 45, lShA: 25, lElF: 70 }, ball: [0.19, 0.09, 0.9], grip: 'throwR' },
      { t: 0.26, p: { base: 'holdChest', chTwist: -28, spTwist: -14, nkTwist: 28, rShF: 108, rShA: 48, rShT: -24, rElF: 118, rPro: 90, rWrF: -44, lShF: 40, lShA: 28, lElF: 65 }, ball: [0.18, 0.06, 0.905], grip: 'throwR' },
      { t: 0.36, p: { base: 'holdChest', chTwist: 20, spTwist: 10, nkTwist: -10, rShF: 130, rShA: 25, rShT: 10, rElF: 50, rPro: 150, rWrF: 40, lShF: 40, lShA: 30, lElF: 60 }, ball: [0.086, 0.45, 0.93], grip: 'throwR' },
      { t: 0.52, p: { base: 'holdChest', chTwist: 22, spTwist: 10, nkTwist: -10, rShF: 112, rShA: 20, rShT: 10, rElF: 18, rPro: 160, rWrF: 45, lShF: 35, lShA: 30, lElF: 55 } },
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
  ], 0.12);
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
  {
    const keys = [
      { t: 0.0, p: 'ready' },
      { t: 0.34, p: { rootZ: -0.2, pelPitch: 50, spFlex: 20, chFlex: 10, nkFlex: -20, both: { ShF: 60, ShA: 16, ElF: 20, Pro: 10, HipF: 80, Knee: 90, Ank: 25 } }, ball: [0.0, 0.3, 0.07], grip: 'hold' },
      { t: 0.6, p: { base: 'holdChest', rootZ: -0.06 }, ball: [0.0, 0.18, 0.62], grip: 'hold' },
      { t: 0.8, p: 'holdChest', ball: [0.0, 0.16, 0.66], grip: 'hold' },
    ];
    // (the ball comes up in front of the knees, the body as it was: straight up from the floor to the chest it went through
    // them, and the ball pushed out of the legs (Actor.clearBall) flipped from under a thigh to over it, ~1 ft in a frame,
    // Trial 11)
    const mid = A.sampleClip(A.buildClip({ name: '_pickup', keys }), 0.45, new Float32Array(RG.NCH));
    keys.splice(2, 0, { t: 0.45, p: mid, ball: [0.0, 0.34, 0.27], grip: 'hold' });
    clip('pickup', { dur: 0.8, events: { grab: 0.34 }, keys });
  }

  // ------------------------------------------------------------ ball-handling
  clip('jab', {
    dur: 0.7, events: { jab: 0.2 },
    steps: [{ t0: 0.04, t1: 0.2, foot: 'r', to: [1.3, 0.45], lift: 0.05 }, { t0: 0.36, t1: 0.56, foot: 'r', to: [-0.35, 0.7], lift: 0.04 }],
    root: [[0, 0, 0], [0.2, 0.35, 0.1], [0.56, 0, 0], [0.7, 0, 0]],
    keys: [
      { t: 0.0, p: 'triple', ball: [0.13, 0.2, 0.53], grip: 'hip' },
      { t: 0.2, p: { base: 'triple', rootZ: -0.1, pelPitch: 30, spFlex: 16, nkFlex: -26, chTwist: 10 }, ball: [0.17, 0.2, 0.46], grip: 'hip' },
      { t: 0.5, p: 'triple', ball: [0.13, 0.2, 0.53], grip: 'hip' },
      { t: 0.7, p: 'triple', ball: [0.13, 0.2, 0.53], grip: 'hip' },
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
    // (a box-out: a base wider than the shoulders, Trial 11)
    boxout: { pose: 'boxout', L: [-0.19, 0.085], R: [0.19, 0.085], yaw: 16, gaitArms: 0.1, gaitTorso: 0.3, slide: true },
    postUp: { pose: 'postUp', L: [-0.16, 0.085], R: [0.16, 0.085], yaw: 16, gaitArms: 0.1, gaitTorso: 0.3, slide: true },
    postD: { pose: 'postD', L: [-0.15, 0.105], R: [0.15, 0.065], yaw: 16, gaitArms: 0.1, gaitTorso: 0.3, slide: true },
    inbound: { pose: 'inbound', L: [-0.08, 0.115], R: [0.08, 0.055], yaw: 10, gaitArms: 0.1, gaitTorso: 0.8 },
    handsKnees: { pose: 'handsKnees', L: [-0.09, 0.085], R: [0.09, 0.085], yaw: 10, gaitArms: 0.8, gaitTorso: 0.8 },
    refStand: { pose: 'refStand', L: [-0.075, 0.085], R: [0.075, 0.085], yaw: 9, gaitArms: 1, gaitTorso: 1 },
    dribble: { pose: 'dribbleLow', L: [-0.125, 0.16], R: [0.125, 0.07], yaw: 12, gaitArms: 0.4, gaitTorso: 0.45 },
  });

  // ------------------------------------------------------------ the free throw's routine (Trial 9)
  // (coaching and the NBA: a routine of 2-4 s, the same every time: a deep breath, a few dribbles or a spin of the ball in
  // the hands, the eyes on the rim; e.g. a deep breath and one dribble, three dribbles and a spin)
  // spinning the ball between the palms at the chest, a little up off the hands and back (the ball's own spin, Ball.spinHeld)
  clip('ftSpin', {
    dur: 0.45, mask: 'upper',
    keys: [
      { t: 0, p: 'holdChest', ball: [0.0, 0.16, 0.66], grip: 'hold' },
      { t: 0.14, p: { base: 'holdChest', both: { ShF: 40, ElF: 92, WrF: -10 } }, ball: [0.0, 0.18, 0.7], grip: 'hold' },
      { t: 0.3, p: { base: 'holdChest', both: { ShF: 36, ElF: 98, WrF: -24 } }, ball: [0.0, 0.17, 0.67], grip: 'hold' },
      { t: 0.45, p: 'holdChest', ball: [0.0, 0.16, 0.66], grip: 'hold' },
    ],
  });
  // a deep breath: the chest and shoulders come up with the breath in, the eyes up at the rim, and down again as it goes out
  clip('ftBreath', {
    dur: 1.0, mask: 'upper',
    keys: [
      { t: 0, p: 'holdChest', ball: [0.0, 0.16, 0.66], grip: 'hold' },
      { t: 0.45, p: { base: 'holdChest', spFlex: 1, chFlex: -2, nkFlex: -14, hdFlex: -4, both: { ClvE: 0.7 } }, ball: [0.0, 0.165, 0.685], grip: 'hold' },
      { t: 0.6, p: { base: 'holdChest', spFlex: 1, chFlex: -2, nkFlex: -14, hdFlex: -4, both: { ClvE: 0.7 } }, ball: [0.0, 0.165, 0.685], grip: 'hold' },
      { t: 1.0, p: { base: 'holdChest', nkFlex: -8, both: { ClvE: -0.15 } }, ball: [0.0, 0.16, 0.655], grip: 'hold' },
    ],
  });
  /** a player's own free throw routine (drawn once from Tune.shot.ftRoutine by hashes of the player's id): how many
   *  dribbles, and their pace (s a bounce), whether the ball is spun and a deep breath taken */
  function ftRoutine(a) {
    if (!a) return { dribbles: 2, period: 0.62, spin: 0, breath: 1 };
    if (a._ftRoutine) return a._ftRoutine;
    const F = M.Tune.shot.ftRoutine, id = String(a.id), h = (k) => U.hashStr(id + ':ft' + k) / 4294967296;
    const u = h('drib');
    let n = 0, acc = 0;
    for (let i = 0; i < F.dribbleP.length; i++) { acc += F.dribbleP[i]; if (u < acc) { n = i; break; } n = i; }
    a._ftRoutine = { dribbles: n, period: F.periodS[0] + (F.periodS[1] - F.periodS[0]) * h('pace'), spin: h('spin') < F.spinP ? 1 : 0, breath: h('breath') < F.breathP ? 1 : 0 };
    // (at least something: nobody walks up and shoots it cold)
    if (!a._ftRoutine.dribbles && !a._ftRoutine.spin) a._ftRoutine.spin = 1;
    return a._ftRoutine;
  }
  A.ftRoutine = ftRoutine;

  // the library's own jump shots, the middle of every form (built here, after the poses they start from: the post fade's
  // turnaround starts from the post-up above). Post fade (turnaround fadeaway): back to the basket, the shooter turns
  // over a shoulder on the balls of the feet while gathering (the ball comes up to the set point with the turn), rises
  // squared to the rim and fades away from the defender; postFadeL turns left (counter-clockwise from above), postFadeR right
  for (const n in JUMPERS) clip(n, jumperDef(n, MID_FORM, { contest: 0, H: 6.5, vert: 0.55 }));
})();
