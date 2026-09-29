// Trial 1 proof: known-answer tests for the debug meters, and the determinism of the fixed-step clock.
//   node tools/audit/check.js
'use strict';
const { spawnSync } = require('child_process');
const path = require('path');
const { load } = require('./load');
let fails = 0, checks = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; console.log('  FAIL ' + msg); } else console.log('  ok   ' + msg); };
const near = (a, b, tol, msg) => ok(Math.abs(a - b) <= tol, `${msg}: got ${a.toFixed(3)}, want ${b} ±${tol}`);

const { PBC } = load(3);
const M = PBC.Match, RG = M.Rig, J = RG.J, CH = RG.CH, U = M.U;
// a one-player world like the Animation Lab's
const world = { actors: {}, refs: [], onCourt: [[], []], opts: { ai: { moveSpeed: 50 } }, teamLook: () => ({}), sound() {}, time: 0 };
const a = new M.Actor(world, { id: 'p1', teamIdx: 0, height: 78, weight: 215, hand: 'R', gender: 'm', look: { build: 0.5 }, speed: 70, agility: 70 }, 0, 'player');
world.actors.p1 = a;
world.ball = { x: 0, y: 0, z: -50, state: 'dead', holder: null, rot: new Float64Array(9), hidden: true };
const meters = new M.Debug.Meters(() => ({ people: [a], ball: world.ball, time: world.time, view: null, dt: 1 / 60 }));
a.place(30, 20, 0);
a.setStance('stand');
for (let i = 0; i < 90; i++) { world.time += 1 / 60; a.update(1 / 60, world.time); a.solve(); meters.frame(); }
const tr = meters.tracker(a);

console.log('foot slide meter');
ok(tr.pts.every(p => p.on), 'standing: all six heel / ball / toe points in contact');
near(Math.max(...tr.pts.map(p => p.cur)) * 12, 0, 0.01, 'standing still: slide 0 in');
// slide the left foot exactly 1.00 in along x while it stays planted
a.feet[0].x += 1 / 12;
world.time += 1 / 60; a.solve(); meters.frame();
near(tr.pts[1].cur * 12, 1, 0.02, 'left ball of foot pushed 1.00 in: reads');
near(tr.pts[0].cur * 12, 1, 0.02, 'left heel pushed 1.00 in: reads');
a.feet[0].x -= 1 / 12;
world.time += 1 / 60; a.solve(); meters.frame();
// a legal pivot: heel up 15 deg, the foot turns 25 deg on the ball: the toe's turn about the ball is not a slide
const f = a.feet[1];
f.pitch = 15 * U.DEG; world.time += 1 / 60; a.solve(); meters.frame();
f.yaw += 25 * U.DEG; world.time += 1 / 60; a.solve(); meters.frame();
ok(!tr.pts[3].on, 'pivot: the heel is off the floor (not a contact)');
near(tr.pts[4].cur * 12, 0, 0.05, 'pivot on the ball: ball slide');
near(tr.pts[5].cur * 12, 0, 0.1, 'pivot on the ball: toe turning round the ball is not a slide');
// the same turn flat-footed (heel down) is a heel slide
f.yaw -= 25 * U.DEG; f.pitch = 0; world.time += 1 / 60; a.solve(); meters.frame();
for (let i = 0; i < 3; i++) { world.time += 1 / 60; a.solve(); meters.frame(); }
f.yaw += 25 * U.DEG; world.time += 1 / 60; a.solve(); meters.frame();
ok(tr.pts[3].on && tr.pts[3].cur * 12 > 1.5, 'flat-footed turn: the heel sweeps the floor (' + (tr.pts[3].cur * 12).toFixed(2) + ' in)');
f.yaw -= 25 * U.DEG; world.time += 1 / 60; a.solve(); meters.frame();

console.log('floor penetration');
// a swinging foot whose toes are 3.00 in below the floor (placed there after the solve: the animation itself now lifts a
// swinging foot clear of the floor, Trial 2) is flagged by that depth
{
  const f0 = a.feet[0];
  f0.state = 'swing';
  a.sk.P[J.L_TOE * 3 + 2] = -3 / 12;
  meters._feet(a, tr, false, { time: world.time });
  near(tr.sink[0] * 12, 3, 0.01, 'toes 3.00 in below the floor on a swinging foot: flagged, depth (in)');
  // and the animation keeps a swinging foot out of the floor: pointed 60 deg toes-down at standing ankle height
  const jA = J.L_AN * 3;
  f0.ax = a.sk.P[jA]; f0.ay = a.sk.P[jA + 1]; f0.az = a.sk.P[jA + 2]; f0.pitchNow = 60 * U.DEG; f0.yawNow = f0.yaw;
  world.time += 1 / 60; a.solve(); meters.frame();
  const zl = Math.min(a.sk.P[J.L_HEEL * 3 + 2], a.sk.P[J.L_BALL * 3 + 2], a.sk.P[J.L_TOE * 3 + 2]);
  ok(zl > -0.25 / 12, 'swinging foot 60 deg toes-down at standing ankle height: lowest point ' + (zl * 12).toFixed(2) + ' in (kept out of the floor)');
}
a.feet[0].state = 'plant';
world.time += 1 / 60; a.solve(); meters.frame();

console.log('joint limit warning (final pose)');
const knee = CH.lKnee;
a.sk.pose[knee] = 160 * U.DEG; meters._limits(a, tr, false);
ok(tr.lim.bad.some(q => q[0] === knee), 'knee at 160 deg (range 0..152): warns');
a.sk.pose[knee] = 150 * U.DEG; meters._limits(a, tr, false);
ok(!tr.lim.bad.some(q => q[0] === knee), 'knee at 150 deg: no warning');
a.sk.pose[knee] = -8 * U.DEG; meters._limits(a, tr, false);
ok(tr.lim.bad.some(q => q[0] === knee), 'knee bent backwards 8 deg: warns');
a.sk.pose[CH.rElF] = -5 * U.DEG; meters._limits(a, tr, false);
ok(tr.lim.bad.some(q => q[0] === CH.rElF), 'elbow hyperextended 5 deg: warns');
world.time += 1 / 60; a.solve(); meters.frame();
ok(tr.lim.bad.length === 0, 'after a fresh solve of the standing pose: no warning');

console.log('hand to ball meter');
const P = a.sk.P, jh = J.R_HD * 3, R = M.Ball.R, pal = M.Tune.debug.palmOffsetH * a.H;
const dir = [0.3, -0.2, 0.93], dl = Math.hypot(...dir);
const place = (gapIn) => { const d = R + pal + gapIn / 12; world.ball = { x: P[jh] + dir[0] / dl * d, y: P[jh + 1] + dir[1] / dl * d, z: P[jh + 2] + dir[2] / dl * d, state: 'held', holder: a, rot: new Float64Array(9), hidden: false }; };
a._grip = [0, 1];
place(3); meters._hands(a, tr, false, world.ball);
near(tr.gap, 3, 0.01, 'hand 3.00 in off the ball: reads');
place(0); meters._hands(a, tr, false, world.ball);
near(tr.gap, 0, 0.01, 'hand on the ball: reads');

console.log('centre of mass and balance');
world.ball = { x: 0, y: 0, z: -50, state: 'dead', holder: null, rot: new Float64Array(9), hidden: true };
a._grip = null;
world.time += 1 / 60; a.solve(); meters.frame();
const c = Math.cos(a.facing), s = Math.sin(a.facing), lat = (tr.com[0] - a.x) * s - (tr.com[1] - a.y) * c;
ok(Math.abs(lat) < 0.12, 'standing: centre of mass within 1.5 in of the midline (' + (lat * 12).toFixed(2) + ' in)');
near(tr.com[2] / a.H, 0.56, 0.04, 'standing: centre of mass height / body height (~0.55-0.57)');
ok(tr.bal <= 0, 'standing: centre of mass over the base of support');

// ---------------------------------------------------------------- Trial 2: the body
console.log('proportions by height and wingspan');
{
  // standing tall (zero pose, straight legs): the skeleton's head top must sit at the same share of height for
  // everyone, while legs, head and arms differ the way people's do
  const stand = (look) => { const d = RG.makeDims(look), sk = new RG.Skeleton(d); sk.solve(new Float32Array(RG.NCH), 0, 0, Math.PI / 2); return { d, sk, P: sk.P }; };
  const g = stand({ height: 73, wing: 76.5, weight: 190, gender: 'm' }), c = stand({ height: 85, wing: 89.5, weight: 255, gender: 'm' });
  const legF = (b) => (b.P[J.L_HIP * 3 + 2]) / b.d.H, headF = (b) => (b.P[J.HT * 3 + 2] - b.P[J.HJ * 3 + 2]) / b.d.H, topF = (b) => b.P[J.HT * 3 + 2] / b.d.H;
  near(topF(g), 1.005, 0.002, "6'1\" guard: head top / height");
  near(topF(c), 1.005, 0.002, "7'1\" center: head top / height");
  ok(legF(c) > legF(g) + 0.01, `taller: relatively longer legs (hip joint ${(legF(g) * 100).toFixed(1)}% vs ${(legF(c) * 100).toFixed(1)}% of height)`);
  ok(headF(c) < headF(g) * 0.95, `taller: relatively smaller head (${(headF(g) * 100).toFixed(2)}% vs ${(headF(c) * 100).toFixed(2)}% of height)`);
  // T-pose fingertip span: two players of the same height, wingspans 8 in apart
  const tspan = (wing) => {
    const d = RG.makeDims({ height: 78, wing, weight: 215, gender: 'm' }), sk = new RG.Skeleton(d);
    sk.solve(RG.pose({ both: { ShA: 90, Pro: 76 } }), 0, 0, Math.PI / 2);
    // (fingertips: the hand joint sits 0.78 of the hand length from the wrist, open)
    const tip = (w, h) => { const P = sk.P, k = 1 / 0.78; return [P[w * 3] + (P[h * 3] - P[w * 3]) * k, P[w * 3 + 1] + (P[h * 3 + 1] - P[w * 3 + 1]) * k]; };
    const l = tip(J.L_WR, J.L_HD), r = tip(J.R_WR, J.R_HD);
    return Math.hypot(l[0] - r[0], l[1] - r[1]) * 12;
  };
  near(tspan(88) - tspan(80), 8, 0.1, 'wingspan 88 in vs 80 in: T-pose spans differ by (in)');
  const ref = RG.makeDims({ height: 78, wing: 78 * 1.05, gender: 'm' });
  near((ref.ua + ref.fa) / ref.H, 0.324, 0.001, 'a 1.05 H wingspan gives the reference arms (shoulder to wrist / height)');
  near(ref.hipH / ref.H, 0.542, 0.0005, "6'6\" reference: pelvis height / height unchanged");
}

console.log('joint ranges: soft spine and neck limits, the spine chain, the planted hip guard');
{
  const p = new Float32Array(RG.NCH);
  p[CH.nkTwist] = 70 * U.DEG; p[CH.hdTwist] = 70 * U.DEG; RG.limitPose(p, null);
  const tw = (p[CH.nkTwist] + p[CH.hdTwist]) / U.DEG;
  ok(tw < 80 && tw > 70, `neck asked to turn 140 deg: turns ${tw.toFixed(1)} (range 80, eased in, never past)`);
  // soft limit: same value and rate where the ease begins (no dead stop)
  const lo = 72 * U.DEG, e = 1e-4, sc = (v) => RG.softClamp(v, -80 * U.DEG, 80 * U.DEG, 8 * U.DEG);
  near((sc(lo + e) - sc(lo - e)) / (2 * e), 1, 0.01, 'soft limit: rate kept where the ease starts');
  near(sc(40 * U.DEG) / U.DEG, 40, 1e-6, 'soft limit: an angle well inside the range is untouched');
  // the spine chain: a 30 deg twist asked of the lumbar joint alone is shared, mostly thoracic, total kept
  const q = new Float32Array(RG.NCH);
  q[CH.spTwist] = 30 * U.DEG;
  a._spineChain(q);
  near((q[CH.spTwist] + q[CH.chTwist]) / U.DEG, 30, 1e-4, 'spine chain: total twist kept (deg)');
  ok(q[CH.spTwist] <= RG.LIM.spTwist[1] + 1e-6 && q[CH.chTwist] > q[CH.spTwist], `spine chain: lumbar ${(q[CH.spTwist] / U.DEG).toFixed(1)}, thoracic ${(q[CH.chTwist] / U.DEG).toFixed(1)} deg`);
  // the planted hip guard: plant the left foot crossed far over to the right; the hip stays in range, the foot stays put
  // (moved across over 20 steps, ~3.6 ft/s: the pelvis follows no faster than Tune.hipGuard.shiftFtps, and a foot
  // put there in one step is past it, so it steps instead, Trial 5)
  world.time += 1 / 60; a.solve(); meters.frame();
  const fL = a.feet[0], c0 = Math.cos(a.facing), s0 = Math.sin(a.facing);
  const fx = fL.x, fy = fL.y;
  for (let i = 1; i <= 20; i++) {
    fL.x = fx + (a.x + s0 * 1.2 - fx) * i / 20; fL.y = fy + (a.y - c0 * 1.2 - fy) * i / 20;
    world.time += 1 / 60; a.solve(); meters.frame();
  }
  ok(fL.state === 'plant', `left foot moved 1.2 ft across over 20 steps stays planted (${fL.state})`);
  const hipA = a.sk.pose[CH.lHipA] / U.DEG, r0 = RG.LIM.lHipA[0] / U.DEG;
  ok(hipA >= r0 - 0.01, `left foot planted 1.2 ft across: hip adduction ${hipA.toFixed(1)} deg (range ${r0.toFixed(0)}..), pelvis moved ${(Math.hypot(a._hg.x, a._hg.y) * 12).toFixed(1)} in toward it`);
  const ik = a.sk.legIK[0], jA = J.L_AN * 3;
  near(Math.hypot(a.sk.P[jA] - ik.x, a.sk.P[jA + 1] - ik.y, a.sk.P[jA + 2] - ik.z) * 12, 0, 0.05, 'hip guard: the planted ankle stays on its spot (in)');
  ok(tr.lim.bad.length === 0, 'hip guard: no joint limit warning');
  fL.x = fx; fL.y = fy;
  for (let i = 0; i < 60; i++) { world.time += 1 / 60; a.update(1 / 60, world.time); a.solve(); meters.frame(); }
  ok(Math.hypot(a._hg.x, a._hg.y) < 0.01, 'hip guard: the shift eases away once the foot is back');
}

console.log('knees over toes meter');
{
  // known answer on a made-up leg: knee bulging straight ahead, toes turned 30 deg out (away from the other leg):
  // the knee points 30 deg inside the foot's line (caving in)
  const P = new Float64Array(81), pose = new Float32Array(RG.NCH), set = (j, x, y, z) => { P[j * 3] = x; P[j * 3 + 1] = y; P[j * 3 + 2] = z; };
  set(J.L_HIP, 0, 0, 3); set(J.L_KN, 0, 0.5, 1.65); set(J.L_AN, 0, 0, 0.3);
  const t30 = 30 * U.DEG;
  set(J.L_HEEL, 0.2 * Math.sin(t30), -0.2 * Math.cos(t30), 0); set(J.L_TOE, -0.8 * Math.sin(t30), 0.8 * Math.cos(t30), 0);
  pose[CH.lKnee] = 40 * U.DEG;
  const fake = { sk: { P, R: new Float64Array(153), pose }, feet: [{ state: 'plant' }, { state: 'swing' }], H: 6.5, speed: 0, facing: Math.PI / 2 };
  const ft = { pts: [{}, { on: true }, {}, {}, { on: false }, {}] };
  meters._body(fake, ft, false, 1 / 60);
  near(ft.body.kn[0] / U.DEG, 30, 0.05, 'left toes turned 30 deg out under a straight-ahead knee: knee inside the foot line (deg)');
  set(J.L_HEEL, -0.2 * Math.sin(t30), -0.2 * Math.cos(t30), 0); set(J.L_TOE, 0.8 * Math.sin(t30), 0.8 * Math.cos(t30), 0);
  meters._body(fake, ft, false, 1 / 60);
  near(ft.body.kn[0] / U.DEG, -30, 0.05, 'left toes turned 30 deg in: knee outside the foot line (deg)');
}
{
  // bend the knees in a squat with the feet planted, then turn the right foot 30 deg outward under a knee that stays
  world.time += 1 / 60; a.setStance('defense');
  for (let i = 0; i < 60; i++) { world.time += 1 / 60; a.update(1 / 60, world.time); a.solve(); meters.frame(); }
  const t0 = tr.body.kn.slice();
  ok(Math.abs(t0[0]) < 12 * U.DEG && Math.abs(t0[1]) < 12 * U.DEG, `defensive stance: knees over the toes (L ${(t0[0] / U.DEG).toFixed(1)}, R ${(t0[1] / U.DEG).toFixed(1)} deg)`);
}

// ---------------------------------------------------------------- Trial 3: the floor
console.log('the floor: pivots, strides, landings');
{
  // a pivot: the right foot turns 60 deg on the ball of the foot; the heel comes up first, the ball stays on its spot,
  // and once the heel is back down the toes stay where the turn left them
  world.time += 1 / 60; a.setStance('stand');
  for (let i = 0; i < 40; i++) { world.time += 1 / 60; a.update(1 / 60, world.time); a.solve(); meters.frame(); }
  const f = a.feet[1], y0 = f.yaw, target = y0 + 60 * U.DEG, jh = J.R_HEEL * 3;
  let heelDownTurn = 0, ballMax = 0;
  for (let i = 0; i < 45; i++) {
    world.time += 1 / 60; a.time = world.time;
    const yb = f.yaw;
    a._pivotFoot(f, i < 30 ? target : f.yaw, 1 / 60, 13);
    a.solve(); meters.frame();
    if (Math.abs(U.wrapPi(f.yaw - yb)) > 1e-6 && a.sk.P[jh + 2] < M.Tune.debug.pivotHeelUpFt) heelDownTurn++;
    ballMax = Math.max(ballMax, tr.pts[4].cur * 12);
  }
  near(U.wrapPi(f.yaw - y0) / U.DEG, 60, 0.5, 'pivot: the foot turned (deg)');
  ok(heelDownTurn === 0, 'pivot: the foot turned only with its heel off the floor');
  near(ballMax, 0, 0.05, 'pivot: the ball of the foot stayed on its spot (in)');
  ok(tr.pts[3].on && tr.pts[5].on && tr.pts[3].cur * 12 < 0.05 && tr.pts[5].cur * 12 < 0.1, 'pivot: heel back down, heel and toes held on their new spots');
}
{
  // steady strides in a one-player world, walking to sprinting: a clear plant, stance and lift every step, heel strikes
  // walking and jogging, the forefoot sprinting, no slide, nothing through the floor, cadence and step length with speed
  const stride = (v) => {
    const w = { actors: {}, refs: [], onCourt: [[], []], opts: { ai: { moveSpeed: 50 } }, teamLook: () => ({}), sound() {}, time: 0 };
    const b = new M.Actor(w, { id: 'g1', teamIdx: 0, height: 78, weight: 215, hand: 'R', gender: 'm', look: { build: 0.5 }, speed: 80, agility: 80 }, 0, 'player');
    w.actors.g1 = b; w.ball = { x: 0, y: 0, z: -50, state: 'dead', holder: null, rot: new Float64Array(9), hidden: true };
    const mt = new M.Debug.Meters(() => ({ people: [b], ball: w.ball, time: w.time, view: null, dt: 1 / 60 }));
    b.place(5, 25, 0); b.setStance('stand');
    for (let i = 0; i < 60 * 14; i++) {
      w.time += 1 / 60;
      if (i === 20) b.moveTo(400, 25, { speed: v });
      b.update(1 / 60, w.time); b.solve();
      // (the court is 94 ft: past x 85 he, his feet and his goal are carried back 80 ft, and his record starts again)
      if (b.x > 85) {
        b.x -= 80; for (const q of b.feet) for (const k of ['x', 'ax', 'tx', 'x0', 'lax', 'lpx', 'pax']) if (q[k] != null) q[k] -= 80;
        if (b.goal && b.goal.x != null) b.goal.x -= 80;
        b.solve(); mt.tr.delete(b);
      }
      if (i < 150) { mt.reset(); continue; }
      mt.frame();
    }
    const sc = mt.summary(), m = Object.entries(sc.floor.byMode).sort((p, q) => q[1].steps - p[1].steps)[0];
    return { sc, m: m[1], bin: Object.values(sc.floor.cadenceBySpeed)[0] };
  };
  const runs = [4.5, 10, 16, 24].map(v => [v, stride(v)]);
  for (const [v, r] of runs) {
    ok(r.m.clearPct === 100 && r.sc.feet.slideIn_all.overOk === 0 && r.sc.feet.sinkPctPlayerFrames === 0 && r.sc.feet.hoverPctPlantFrames === 0,
      `${v} ft/s: ${r.m.steps} steps, ${r.m.clearPct}% clear, no contact sliding over 0.25 in, nothing through the floor or floating`);
  }
  const walk = runs[0][1].m, sprint = runs[3][1].m;
  ok(walk.landing.heelFirstPct === 100 && runs[1][1].m.landing.heelFirstPct >= 90, `heel first walking (${walk.landing.heelFirstPct}%) and jogging (${runs[1][1].m.landing.heelFirstPct}%)`);
  ok(sprint.landing.forefootFirstPct >= 80, `forefoot first sprinting (${sprint.landing.forefootFirstPct}%)`);
  ok(walk.ankleContactDeg.p50 > -5 && walk.ankleContactDeg.p50 < 10 && walk.ankleDeepestDeg.p50 > 8 && walk.ankleDeepestDeg.p50 < 20 && walk.ankleToeOffDeg.p50 < -8 && walk.ankleToeOffDeg.p50 > -25,
    `walking ankle: ${walk.ankleContactDeg.p50} at heel strike, ${walk.ankleDeepestDeg.p50} deepest, ${walk.ankleToeOffDeg.p50} at toe-off (gait studies: ~0, ~10-15, ~-15 to -20)`);
  const cad = runs.map(([, r]) => r.bin);
  ok(cad.every((c, i) => i === 0 || (c.stepsPerSec > cad[i - 1].stepsPerSec && c.stepLengthFt > cad[i - 1].stepLengthFt)),
    'cadence and step length both grow with speed: ' + cad.map(c => c.speed + ' ft/s ' + c.stepsPerSec + '/s x ' + c.stepLengthFt + ' ft').join(', '));
  ok(runs.every(([, r]) => r.sc.floor.toesVsTravelDeg.n === 0 || r.sc.floor.toesVsTravelDeg.p90 < 5), 'running straight, the toes point the way he goes');
}
{
  // toes brushing the floor bend up at the ball of the foot (the MTP joint) instead of going through it: a foot 40 deg
  // toes-down (its ankle at the end of its range) with the ball of the foot 0.1 in above the floor and the toes straight
  const sk = a.sk, P = sk.P, R = sk.R, d = a.dims, ft = RG.F.R_FT * 9, an = J.R_AN * 3, pit = 40 * U.DEG;
  a.solve();
  const cy = Math.cos(a.facing), sy = Math.sin(a.facing);
  const F0 = new Float64Array([sy, cy, 0, -cy, sy, 0, 0, 0, 1]);
  RG.mulRot(F0, 0, 0, -pit, R, ft);
  P[an + 8] = 0.1 / 12;
  for (let k = 0; k < 3; k++) P[an + 9 + k] = P[an + 6 + k] + d.toe * R[ft + k * 3 + 1];
  const before = P[an + 11] * 12;
  sk._toesUp(ft, an, 0);
  const after = P[an + 11] * 12;
  ok(before < -1 && after > -0.01 && after < 0.05, `toes at the floor: foot 40 deg toes-down, ball 0.10 in up: toe tip ${before.toFixed(2)} in straight, ${after.toFixed(2)} in bent up at the ball`);
  a.solve();
}

console.log('the weight (Trial 4)');
{
  // one-player labs: a body's own push, braking and turning, measured from its root the way the meters see it
  const dt = 1 / 60, TW = M.Tune.weight, Tn = M.Tune.debug;
  const lab1 = (h, lb, spd, agi) => {
    const w = { actors: {}, refs: [], onCourt: [[], []], opts: { ai: { moveSpeed: 50 } }, teamLook: () => ({}), sound() {}, time: 0 };
    const b = new M.Actor(w, { id: 'w1', teamIdx: 0, height: h, weight: lb, hand: 'R', gender: 'm', look: { build: 0.5 }, speed: spd, agility: agi }, 0, 'player');
    w.actors.w1 = b; w.ball = { x: 0, y: 0, z: -50, state: 'dead', holder: null, rot: new Float64Array(9), hidden: true };
    b.place(5, 25, 0); b.setStance('stand');
    const s = { b, px: b.x, py: b.y, pvx: 0, pvy: 0, pf: b.facing, pw: 0, n: 0, maxA: 0, maxAl: 0, v: 0, vx: 0, vy: 0 };
    s.step = () => {
      w.time += dt; b.update(dt, w.time); b.solve();
      // (the course is 94 ft: past x 70 the body, its feet and its goal are carried back 60 ft)
      if (b.x > 70) { b.x -= 60; s.px -= 60; for (const q of b.feet) for (const k of ['x', 'ax', 'tx', 'x0', 'lax', 'lpx', 'pax']) if (q[k] != null) q[k] -= 60; if (b.goal.x != null) b.goal.x -= 60; b.solve(); }
      const vx = (b.x - s.px) / dt, vy = (b.y - s.py) / dt, wv = U.wrapPi(b.facing - s.pf) / dt;
      if (s.n > 2) { s.maxA = Math.max(s.maxA, Math.hypot(vx - s.pvx, vy - s.pvy) / dt); s.maxAl = Math.max(s.maxAl, Math.abs(wv - s.pw) / dt); }
      s.n++; s.px = b.x; s.py = b.y; s.pvx = vx; s.pvy = vy; s.pf = b.facing; s.pw = wv; s.v = Math.hypot(vx, vy); s.vx = vx; s.vy = vy;
    };
    for (let i = 0; i < 30; i++) s.step();
    return s;
  };
  const lab = (h, lb, spd, agi) => {
    const r = { peakA: 0, peakAlpha: 0 }, keep = (s) => { r.peakA = Math.max(r.peakA, s.maxA); r.peakAlpha = Math.max(r.peakAlpha, s.maxAl); };
    // from a standstill to 15 ft/s
    let s = lab1(h, lb, spd, agi), t = 0; s.b.moveTo(4000, 25, { speed: 40 });
    while (s.v < 15 && t < 5) { s.step(); t += dt; }
    r.to15 = +t.toFixed(2); keep(s);
    // full speed, then stop
    s = lab1(h, lb, spd, agi); s.b.moveTo(4000, 25, { speed: 40 });
    for (let i = 0; i < 150; i++) s.step();
    r.vTop = +s.v.toFixed(1);
    let d = 0; s.b.stop(); t = 0;
    while (s.v > 0.3 && t < 4) { s.step(); t += dt; d += s.v * dt; }
    r.stopFt = +d.toFixed(1); keep(s);
    // a standing 180
    s = lab1(h, lb, spd, agi); s.b.setFace(Math.PI); t = 0;
    while (Math.abs(U.wrapPi(s.b.facing - Math.PI)) > 10 * U.DEG && t < 3) { s.step(); t += dt; }
    r.turnS = +t.toFixed(2); keep(s);
    // a 15 ft/s run turned round, and a 90 deg cut at 15 ft/s (to 60 deg off the old way)
    for (const kind of ['back', 'cut']) {
      s = lab1(h, lb, spd, agi); s.b.moveTo(4000, 25, { speed: 15 / s.b.goalK });
      while (s.v < 14.5) s.step();
      for (let i = 0; i < 30; i++) s.step();
      if (kind === 'back') s.b.moveTo(s.b.x - 60, 25, { speed: 15 / s.b.goalK }); else s.b.moveTo(s.b.x, 85, { speed: 15 / s.b.goalK });
      t = 0;
      while ((kind === 'back' ? s.vx > 0 : Math.atan2(s.vy, s.vx) < 60 * U.DEG) && t < 3) { s.step(); t += dt; }
      r[kind === 'back' ? 'reverseS' : 'cutS'] = +t.toFixed(2); keep(s);
    }
    return r;
  };
  const guard = lab(74, 185, 70, 70), center = lab(84, 260, 70, 70), fast = lab(74, 185, 90, 90);
  ok(center.to15 > guard.to15 && center.stopFt > guard.stopFt && center.reverseS > guard.reverseS && center.cutS > guard.cutS && center.turnS >= guard.turnS,
    `same ratings, a 6-2 185 lb guard vs a 7-0 260 lb center: to 15 ft/s ${guard.to15} vs ${center.to15} s, stopping from ${guard.vTop} ft/s ${guard.stopFt} vs ${center.stopFt} ft, turning a 15 ft/s run round ${guard.reverseS} vs ${center.reverseS} s, a 90 deg cut ${guard.cutS} vs ${center.cutS} s, a standing 180 ${guard.turnS} vs ${center.turnS} s`);
  ok(fast.vTop >= 26 && fast.vTop <= 30, `the fastest reach ${fast.vTop} ft/s (NBA top sprint ~8-9 m/s, 26-29.5 ft/s)`);
  const all = [guard, center, fast];
  ok(all.every(r => r.peakA <= TW.totalAccelMax + 0.5 && r.peakAlpha <= Tn.turnSnapRadps2),
    `nothing starts, stops or turns at once: the hardest change of speed ${Math.max(...all.map(r => r.peakA)).toFixed(1)} ft/s^2 in a step (a body's limit ${TW.totalAccelMax}), of turn rate ${Math.max(...all.map(r => r.peakAlpha)).toFixed(0)} rad/s^2 (a snap past ${Tn.turnSnapRadps2})`);
}
{
  // the hips rise and fall with every step, more running than walking (walking ~2-5 cm, running ~6-9 cm)
  const dt = 1 / 60, bob = (v) => {
    const w = { actors: {}, refs: [], onCourt: [[], []], opts: { ai: { moveSpeed: 50 } }, teamLook: () => ({}), sound() {}, time: 0 };
    const b = new M.Actor(w, { id: 'b1', teamIdx: 0, height: 78, weight: 215, hand: 'R', gender: 'm', look: { build: 0.5 }, speed: 80, agility: 80 }, 0, 'player');
    w.actors.b1 = b; w.ball = { x: 0, y: 0, z: -50, state: 'dead', holder: null, rot: new Float64Array(9), hidden: true };
    b.place(5, 25, 0); b.setStance('stand');
    const zs = [], lands = []; let prev = null;
    for (let i = 0; i < 60 * 8; i++) {
      w.time += dt;
      if (i === 20) b.moveTo(4000, 25, { speed: v / b.goalK });
      b.update(dt, w.time); b.solve();
      if (b.x > 85) { b.x -= 80; for (const q of b.feet) for (const k of ['x', 'ax', 'tx', 'x0', 'lax', 'lpx', 'pax']) if (q[k] != null) q[k] -= 80; b.goal.x -= 80; b.solve(); }
      if (i < 60 * 4) continue;
      zs.push(b.sk.P[2] * 12);
      const st = b.feet.map(f => f.state);
      if (prev && st.some((x, k) => x === 'plant' && prev[k] !== 'plant')) lands.push(zs.length - 1);
      prev = st;
    }
    const amp = [];
    for (let k = 1; k < lands.length; k++) { const seg = zs.slice(lands[k - 1], lands[k] + 1); amp.push(Math.max(...seg) - Math.min(...seg)); }
    amp.sort((p, q) => p - q);
    return amp[Math.floor(amp.length / 2)];
  };
  const b = [4.5, 10, 16].map(bob);
  ok(b[0] >= 0.7 && b[0] <= 2.2 && b[1] > b[0] && b[2] >= b[1] && b[1] >= 2.3 && b[2] <= 4,
    `the hips rise and fall each step: walking ${b[0].toFixed(2)} in, running 10 ft/s ${b[1].toFixed(2)} in, 16 ft/s ${b[2].toFixed(2)} in`);
}
{
  // hard cuts and hard stops at the weight meter: every one on a planted foot pushing the right way (the outside of the
  // cut, out ahead braking) with the hips dropping; and no foot jumps as it leaves the floor on the way
  const dt = 1 / 60, J = M.Rig.J;
  const res = [];
  for (const [h, lb] of [[74, 185], [84, 260]]) {
    const w = { actors: {}, refs: [], onCourt: [[], []], opts: { ai: { moveSpeed: 50 } }, teamLook: () => ({}), sound() {}, time: 0 };
    const b = new M.Actor(w, { id: 'c1', teamIdx: 0, height: h, weight: lb, hand: 'R', gender: 'm', look: { build: 0.5 }, speed: 75, agility: 75 }, 0, 'player');
    w.actors.c1 = b; w.ball = { x: 0, y: 0, z: -50, state: 'dead', holder: null, rot: new Float64Array(9), hidden: true };
    const mt = new M.Debug.Meters(() => ({ people: [b], ball: w.ball, time: w.time, view: null, dt }));
    b.place(10, 10, 0); b.setStance('stand');
    // (at lift-off: how hard the ankle's motion changes, the second difference of its position over the lift-off frame,
    // against the joint-pop meter's threshold: an ankle already moving as the heel comes up carries on moving)
    let lifts = 0, jump = 0, prev = null, prev2 = null;
    const step = () => {
      w.time += dt; b.update(dt, w.time); b.solve(); mt.frame();
      const P = b.sk.P, cur = b.feet.map((f, i) => { const j = (i ? J.R_AN : J.L_AN) * 3; return { st: f.state, x: P[j], y: P[j + 1], z: P[j + 2] }; });
      if (prev && prev2) for (let i = 0; i < 2; i++) if (prev[i].st === 'plant' && cur[i].st === 'swing') {
        lifts++;
        jump = Math.max(jump, Math.hypot(cur[i].x - 2 * prev[i].x + prev2[i].x, cur[i].y - 2 * prev[i].y + prev2[i].y, cur[i].z - 2 * prev[i].z + prev2[i].z) / (dt * dt));
      }
      prev2 = prev; prev = cur;
    };
    // (straight runs at 16 and 20 ft/s, each ending in a 90 deg cut, to one side then the other)
    for (const v of [16, 20]) for (let r = 0; r < 5; r++) {
      b.place(10, 25, 0); b.setStance('stand'); prev = null; prev2 = null;
      b.moveTo(200, 25, { speed: v / b.goalK });
      let n = 0; while (b.speed < v - 0.5 && n++ < 240) step();
      for (let i = 0; i < 20; i++) step();
      b.moveTo(b.x, 25 + (r % 2 ? 200 : -200), { speed: v / b.goalK });
      for (let i = 0; i < 70; i++) step();
    }
    for (let r = 0; r < 3; r++) {
      b.place(10, 40, 0); prev = null; prev2 = null;
      b.moveTo(70, 40, { speed: 20 / b.goalK });
      let n = 0; while (b.speed < 19 && n++ < 200) step();
      for (let i = 0; i < 20; i++) step();
      b.stop(); for (let i = 0; i < 90; i++) step();
    }
    const sc = mt.summary();
    res.push({ h, lb, c: sc.weight.cuts, s: sc.weight.brakes, lifts, jump, snaps: sc.motion.accelSnapsPerPlayerMin + sc.motion.instantTurnsPerPlayerMin + sc.weight.turnSnapsPerPlayerMin, hip: sc.weight.hipJumps, hipMax: sc.weight.hipJumpWorstIn });
  }
  for (const r of res) {
    ok(r.c.events >= 3 && r.c.footPlantedPct === 100 && r.c.hipDropPct === 100 && r.s.events >= 3 && r.s.footPlantedPct === 100 && r.s.hipDropPct === 100,
      `${r.h} in ${r.lb} lb: ${r.c.events} hard cuts and ${r.s.events} hard stops, each on a planted foot with the hips dropping (cuts p50 ${r.c.hipDropIn.p50} in, stops p50 ${r.s.hipDropIn.p50} in)`);
    ok(r.snaps === 0 && r.hip === 0 && r.jump < M.Tune.debug.jointSnapFtps2, `${r.h} in ${r.lb} lb: no snap in speed or turn, no hip jump (${r.hip}, the pelvis moving over ${M.Tune.debug.hipJumpIn} in in a step); ${r.lifts} lift-offs, the ankle's motion changing at most ${r.jump.toFixed(0)} ft/s^2 leaving the floor (a pop past ${M.Tune.debug.jointSnapFtps2})`);
  }
}
{
  // two bodies running straight at each other (and one into a man standing): they see each other in time, and meet,
  // if they do, no harder than a body pushes (View.separate, Actor._avoid)
  const dt = 1 / 60;
  const meet = (vA, vB, offY) => {
    const w = { actors: {}, refs: [], onCourt: [[], []], opts: { ai: { moveSpeed: 50 } }, teamLook: () => ({}), sound() {}, time: 0 };
    const mk = (id, h, lb) => { const b = new M.Actor(w, { id, teamIdx: 0, height: h, weight: lb, hand: 'R', gender: 'm', look: { build: 0.5 }, speed: 80, agility: 80 }, 0, 'player'); w.actors[id] = b; return b; };
    const A = mk('h1', 78, 215), B = mk('h2', 80, 240);
    w.ball = { x: 0, y: 0, z: -50, state: 'dead', holder: null, rot: new Float64Array(9), hidden: true };
    A.place(5, 25, 0); B.place(85, 25 + offY, Math.PI); A.setStance('stand'); B.setStance('stand');
    A.moveTo(90, 25, { speed: vA / A.goalK }); if (vB > 0) B.moveTo(0, 25 + offY, { speed: vB / B.goalK });
    const st = new Map(); let maxA = 0, minD = 99;
    for (let i = 0; i < 60 * 6; i++) {
      w.time += dt;
      for (const b of [A, B]) b.update(dt, w.time);
      M.View.prototype.separate.call(w, dt);
      for (const b of [A, B]) b.solve();
      for (const b of [A, B]) {
        const k = st.get(b) || { px: b.x, py: b.y, vx: 0, vy: 0, n: 0 }, vx = (b.x - k.px) / dt, vy = (b.y - k.py) / dt;
        if (k.n >= 2) maxA = Math.max(maxA, Math.hypot(vx - k.vx, vy - k.vy) / dt);
        st.set(b, { px: b.x, py: b.y, vx, vy, n: k.n + 1 });
      }
      minD = Math.min(minD, Math.hypot(A.x - B.x, A.y - B.y));
    }
    return { minD, touch: (A.H + B.H) * 0.15, maxA };
  };
  const runs = [[24, 24, 0], [20, 20, 0.5], [24, 0, 0]].map(q => [q, meet(...q)]);
  ok(runs.every(([, r]) => r.minD > r.touch * 0.7 && r.maxA <= M.Tune.debug.accelSnapFtps2),
    'running into each other: ' + runs.map(([q, r]) => `${q[0]} vs ${q[1]} ft/s ${r.minD.toFixed(2)} ft apart at the closest (touching at ${r.touch.toFixed(2)}), ${r.maxA.toFixed(1)} ft/s^2 at the most`).join('; '));
}

console.log('the gaits (Trial 5)');
{
  // every gait at three paces on four bodies (tools/audit/gaits.js), and the scripted gait changes
  const G5 = require('./gaits');
  const rows = G5.signatures(PBC), by = (g) => rows.filter(r => r.gait === g);
  const avg = (rs, k) => rs.reduce((p, r) => p + r[k], 0) / rs.length, rng = (rs, k) => `${Math.min(...rs.map(r => r[k]))}-${Math.max(...rs.map(r => r[k]))}`;
  const walk = by('walk'), jog = by('jog'), run = by('run'), sprint = by('sprint'), back = by('backpedal'), slide = by('slide');
  // (only a neighbouring pace may be taken for another: a run for a jog or a sprint; they blend into each other by speed)
  const bl = G5.blind(rows), NEXT = { 'jog>run': 1, 'run>jog': 1, 'run>sprint': 1, 'sprint>run': 1 };
  ok(bl.ok >= bl.n * 0.95 && bl.wrong.every(m => { const q = /(\w+) at [0-9.]+ ft\/s named (\w+)$/.exec(m); return q && NEXT[q[1] + '>' + q[2]]; }),
    `named blind, each run by the gait nearest it on the other bodies: ${bl.ok}/${bl.n}` + (bl.wrong.length ? ` (missed only between neighbouring paces: ${bl.wrong.join('; ')})` : ''));
  ok(walk.every(r => r.flightPct === 0 && r.duty >= 0.55 && r.landPitchDeg < 0 && r.elbowDeg <= 30),
    `walking: never both feet off the floor, each foot down ${rng(walk, 'duty')} of the stride, heel first (${rng(walk, 'landPitchDeg')} deg), the arms hanging (elbows ${rng(walk, 'elbowDeg')} deg)`);
  ok([...jog, ...run, ...sprint].every(r => r.flightPct >= 20 && r.duty <= 0.4) && avg(sprint, 'hipFlexMax') >= avg(jog, 'hipFlexMax') + 15 && avg(sprint, 'leanDeg') >= avg(jog, 'leanDeg') + 3,
    `running: a flight every step (${rng([...jog, ...run, ...sprint], 'flightPct')}%); sprinting drives the knees higher (hip flexion ${avg(sprint, 'hipFlexMax').toFixed(0)} against a jog's ${avg(jog, 'hipFlexMax').toFixed(0)} deg) and leans further forward (${avg(sprint, 'leanDeg').toFixed(1)} against ${avg(jog, 'leanDeg').toFixed(1)} deg)`);
  ok(avg(walk, 'stepsPerS') < avg(jog, 'stepsPerS') && avg(jog, 'stepsPerS') < avg(run, 'stepsPerS') && avg(run, 'stepsPerS') < avg(sprint, 'stepsPerS') && avg(walk, 'stepH') < avg(jog, 'stepH') && avg(jog, 'stepH') < avg(run, 'stepH') && avg(run, 'stepH') < avg(sprint, 'stepH'),
    `quicker and longer steps gait by gait: ${[walk, jog, run, sprint].map(g => avg(g, 'stepsPerS').toFixed(2)).join(', ')} steps/s, ${[walk, jog, run, sprint].map(g => avg(g, 'stepH').toFixed(2)).join(', ')} heights a step`);
  ok(back.every(r => r.travelDeg >= 170 && r.landPitchDeg > 0),
    `backpedalling: going straight back while facing the play (${rng(back, 'travelDeg')} deg off the facing), each step down toes first (heel ${rng(back, 'landPitchDeg')} deg up)`);
  ok(slide.every(r => r.travelDeg >= 80 && r.travelDeg <= 100 && r.crossPct === 0),
    `sliding: sideways (${rng(slide, 'travelDeg')} deg off the facing), the feet never crossing (${rng(slide, 'crossPct')}% of frames)`);
  const swingers = [...walk, ...jog, ...run, ...sprint, ...back];
  ok(swingers.every(r => r.armOppositePct >= 99 && r.armLegR >= 0.85 && Math.abs(r.armLegLagDeg) <= 30),
    `each arm swings with the opposite leg in every walk, jog, run, sprint and backpedal: the arm forward is the one opposite the thigh forward in ${rng(swingers, 'armOppositePct')}% of frames, shoulder against opposite hip r ${rng(swingers, 'armLegR')}, within ${Math.max(...swingers.map(r => Math.abs(r.armLegLagDeg)))} deg of the cycle`);
  ok(avg(walk, 'armSwingDeg') < avg(jog, 'armSwingDeg') && avg(jog, 'armSwingDeg') < avg(sprint, 'armSwingDeg') && sprint.every(r => r.elbowDeg >= 85),
    `the arm swing grows with the pace (${[walk, jog, run, sprint].map(g => avg(g, 'armSwingDeg').toFixed(0)).join(', ')} deg at the shoulder), a sprinter's arms driving compact, elbows at ${rng(sprint, 'elbowDeg')} deg`);
  ok(rows.every(r => r.pops === 0), `no joint pops in ${rows.length} steady runs (${rows.reduce((p, r) => p + r.pops, 0)})`);
  const tr = G5.transitions(U).map(sc => G5.runTransition(PBC, sc));
  for (const r of tr) {
    ok(r.popN === 0 && r.spinePops === 0 && r.hipJumps === 0 && r.accelSnaps + r.turnSnaps === 0 && r.limitFrames === 0 && r.sinkPct === 0 && r.hoverPct === 0,
      `${r.name}: no pop (${r.popN}), no spine pop, hip jump or snap, nothing past a joint's range, through the floor or floating`);
  }
  const x = tr.find(r => r.name.startsWith('slide, then open up'));
  ok(x && x.crossAt.some(t => t >= 2.5 && t <= 3.2), `beaten on a slide, he opens up with a crossover step: the trail foot crosses over in front of the lead one at ${x ? x.crossAt.filter(t => t >= 2.5 && t <= 3.2).join(', ') : '-'} s (the man goes by at 2.5 s), then he runs`);
}

console.log('the handle (Trial 8)');
{
  // the ball-through-a-body meter: a ball set a known depth into his right thigh reads that depth, clear of him none
  const P8 = a.sk.P, h0 = J.R_HIP * 3, k0 = J.R_KN * 3, H = a.H, Rb = M.Ball.R, rTh = M.Tune.debug.bodyR.thigh * H;
  const mx = (P8[h0] + P8[k0]) / 2, my = (P8[h0 + 1] + P8[k0 + 1]) / 2, mz = (P8[h0 + 2] + P8[k0 + 2]) / 2;
  const fx = Math.cos(a.facing), fy = Math.sin(a.facing);
  const put = (depthIn) => { const d = rTh + Rb - depthIn / 12; return { x: mx + fx * d, y: my + fy * d, z: mz, state: 'loose', holder: null, rot: new Float64Array(9), hidden: false }; };
  const HD = meters.S.hd, f0 = HD.throughFrames;
  meters._handle([a], put(2), world.time);
  near(HD.throughFrames - f0, 1, 0, 'a ball 2.00 in into his thigh: one frame through a body');
  near(HD.throughWorst, 2, 0.05, 'a ball 2.00 in into his thigh: reads');
  ok(Object.keys(HD.throughBy).some(k => k.endsWith('thigh')), 'a ball in his thigh: reads the thigh');
  const f1 = HD.throughFrames;
  meters._handle([a], put(-1), world.time);
  ok(HD.throughFrames === f1, 'a ball 1 in clear of his thigh: nothing');
  // the ball-in-the-air jolt meter: a dribbled ball falling across the floor at a steady 6 ft/s, then a step of 1 in (300
  // ft/s^2 in a 60 Hz frame) and one of 0.25 in (75 ft/s^2)
  {
    const A8 = HD.air, fake = { dribble: { ph: 'down' }, id: 'k' }, bl = { state: 'dribble', dr: { actor: fake, move: null }, x: 0, y: 0, z: 2 };
    const feed = (xs) => { A8.p.length = 0; xs.forEach((x, i) => { bl.x = x; meters._handle([], bl, 100 + i / 60); }); };
    const j0 = A8.jolts, n0 = A8.frames;
    feed([0, 0.1, 0.2]);
    ok(A8.frames === n0 + 1 && A8.jolts === j0, 'a ball falling at a steady speed across the floor: no jolt');
    feed([0, 0.1, 0.2 + 1 / 12]);
    ok(A8.jolts === j0 + 1, 'a 1 in step in its path (300 ft/s^2): one jolt');
    feed([0, 0.1, 0.2 + 0.25 / 12]);
    ok(A8.jolts === j0 + 1, 'a 0.25 in step (75 ft/s^2): none');
    A8.p.length = 0;
  }
  // the dribble in the Lab's kind of world, every scenario measured by the game's own meters (tools/audit/handle.js)
  const H8 = require('./handle');
  const rows = H8.scenarios().map(sc => H8.run(PBC, sc)), byName = (s) => rows.find(r => r.name.startsWith(s));
  const spin = byName('spin'), notSpin = rows.filter(r => r !== spin);
  ok(rows.every(r => r.contactsOff === 0), `the hand on the ball at every contact in ${rows.length} scenarios: ${rows.reduce((p, r) => p + r.contacts, 0)} contacts, none off by over 0.25 in (worst ${Math.max(...rows.map(r => r.contactMaxIn.max)).toFixed(2)} in)`);
  const thru = notSpin.filter(r => r.ballThroughFrames > 0);
  ok(!thru.length, `the ball through nobody in ${notSpin.length} scenarios: dribbling, the moves, the hesitation, the retreat, out of the hands` + (thru.length ? ` (${thru.map(r => r.name + ': ' + r.ballThroughFrames + ' frames ' + JSON.stringify(r.ballThroughBy)).join('; ')})` : ''));
  ok(spin.ballThroughFrames <= 2 && (spin.ballThroughWorstIn || 0) <= 1.5, `the spin move (its footwork is Trial 7's): the ball through a leg at most 2 frames, 1.5 in (${spin.ballThroughFrames} frames, ${spin.ballThroughWorstIn || 0} in)`);
  ok(rows.every(r => r.gravity.worstOffFtps2 != null && r.gravity.worstOffFtps2 <= 1 && Math.abs(r.gravity.meanFtps2 + U.G) <= 0.1), `the ball between hand and floor falls at g, ${U.G} ft/s^2, in every scenario (worst off ${Math.max(...rows.map(r => r.gravity.worstOffFtps2))})`);
  ok(rows.every(r => r.restitution && r.restitution.worstOff <= 0.05), `every bounce off the floor at FIBA's restitution for its speed, within 0.05 (worst ${Math.max(...rows.map(r => r.restitution.worstOff))})`);
  const open = byName('dribble in place, open'), pressed = byName('dribble in place, a defender');
  ok(open.bouncesPerS.open >= 1.3 && open.bouncesPerS.open <= 1.7 && pressed.bouncesPerS.pressed >= 2.0 && pressed.bouncesPerS.pressed <= 2.6, `standing: ${open.bouncesPerS.open} bounces a second open, ${pressed.bouncesPerS.pressed} with a man up on him (the trial: 1.5 to 2.5)`);
  ok(pressed.topIn.pressed.p50 < open.topIn.open.p50 - 1, `lower with a man on him: the top of the bounce at ${pressed.topIn.pressed.p50} in against ${open.topIn.open.p50} in open`);
  const moving = ['dribble walking', 'dribble jogging', 'dribble running', 'speed dribble'].map(byName);
  ok(moving.every(r => r.rhythm.withInsideStepPct >= 85), `moving, the bounce with the inside foot's landing (within ${M.Tune.debug.handleSyncS} s): ${moving.map(r => r.rhythm.withInsideStepPct + '%').join(', ')} walking, jogging, running, sprinting`);
  const moves = rows.filter(r => r.rhythm.movesWithStepPct != null);
  ok(moves.length >= 5 && moves.every(r => r.rhythm.movesWithStepPct === 100), `every move's bounce on a footfall: ${moves.map(r => r.name.replace(/ \(.*$/, '') + ' ' + r.rhythm.movesWithStepPct + '%').join(', ')}`);
  ok(rows.every(r => r.eyesOnBallPct <= 5), `eyes up: looking at the ball in at most ${Math.max(...rows.map(r => r.eyesOnBallPct))}% of dribbling frames`);
  const guarded = [pressed, byName('retreat')];
  ok(guarded.every(r => r.offArmUpPct >= 85), `the off arm up between the ball and the man on him: ${guarded.map(r => r.offArmUpPct + '%').join(', ')} of those frames`);
  const popped = notSpin.filter(r => r.armPops > 0);
  ok(!popped.length, `no hand or elbow pops in ${notSpin.length} scenarios` + (popped.length ? ` (${popped.map(r => r.name + ': ' + JSON.stringify(r.pops)).join('; ')})` : ''));
  // the ball in the air: dribbling, never shoved across the floor; the moves, a guard on what is still open (their footwork,
  // a wide plant or a lunge for the ball to go through, is Trial 7's)
  const plain = ['dribble in place', 'dribble walking', 'dribble jogging', 'dribble running', 'speed dribble', 'hesitation', 'catch and go'].map(k => rows.filter(r => r.name.startsWith(k))).flat();
  ok(plain.every(r => r.air.jolts === 0), `the ball in the air never jolted across the floor dribbling (${plain.length} scenarios, ${plain.reduce((p, r) => p + r.air.frames, 0)} frames, worst ${Math.max(...plain.map(r => r.air.worstFtps2))} ft/s^2)`);
  const mv8 = rows.filter(r => /three|retreat/.test(r.name)), mvJ = mv8.reduce((p, r) => p + r.air.jolts, 0), mvF = mv8.reduce((p, r) => p + r.air.frames, 0);
  ok(mvJ <= 0.08 * mvF, `the moves' ball in the air jolted in no more than 8% of its frames (${mvJ} of ${mvF}: ${mv8.map(r => r.name.replace(/ \(.*$/, '') + ' ' + r.air.jolts).join(', ')}; still open, Trial 7)`);
}

console.log('the floor and the weight in a real game (the first minute of seed 7)');
{
  const r = spawnSync(process.execPath, [path.join(__dirname, 'quarter.js'), '--seed', '7', '--frames', '3600'], { encoding: 'utf8', maxBuffer: 1 << 26 });
  const sc = JSON.parse(r.stdout).scorecard, ft = sc.feet, fl = sc.floor, mo = sc.motion, wt = sc.weight;
  ok(ft.slideIn_all.overOk === 0 && ft.sinkPctPlayerFrames === 0 && ft.hoverPctPlantFrames === 0,
    `no contact sliding over 0.25 in (worst ${ft.slideWorst} in), nothing through the floor, no planted foot floating`);
  ok(fl.clearStepPct >= 99.5, `${fl.steps} steps, ${fl.clearStepPct}% with a clear plant, stance and lift`);
  ok(sc.body.kneeOverToeDeg.cavePct < 0.1, `planted knees over the toes (caving in ${sc.body.kneeOverToeDeg.cavePct}%)`);
  ok(mo.accelSnapsPerPlayerMin === 0 && mo.instantTurnsPerPlayerMin === 0 && wt.turnSnapsPerPlayerMin === 0 && wt.hipJumps === 0,
    `no instant start, stop or change of speed (${mo.accelSnapsPerPlayerMin} per player-minute), no instant turn (${mo.instantTurnsPerPlayerMin}), no turn snap (${wt.turnSnapsPerPlayerMin}), no hip jump (${wt.hipJumps})`);
  ok(wt.cuts.events > 0 && wt.cuts.footPlantedPct === 100 && wt.cuts.hipDropPct === 100,
    `${wt.cuts.events} hard cuts, every one on a planted outside foot (${wt.cuts.footPlantedPct}%) with the hips dropping (${wt.cuts.hipDropPct}%, p50 ${wt.cuts.hipDropIn.p50} in)`);
}

console.log('determinism: identical frames at every playback speed and frame rate');
const run = (mode) => { const r = spawnSync(process.execPath, [path.join(__dirname, 'determinism.js'), '--mode', mode, '--steps', '1500', '--seed', '11'], { encoding: 'utf8', maxBuffer: 1 << 26 }); return JSON.parse(r.stdout); };
const base = run('1x');
ok(base.steps === 1500, '1x ran 1500 steps');
for (const m of ['0.25x', '0.1x', '144hz', 'jitter']) {
  const r = run(m);
  let same = 0; for (let i = 0; i < Math.min(r.hashes.length, base.hashes.length); i++) { if (r.hashes[i] === base.hashes[i]) same++; else break; }
  ok(r.steps === base.steps && same === base.steps, `${m}: ${same}/${base.steps} steps identical to 1x`);
}
console.log(`\n${checks - fails}/${checks} checks passed`);
process.exit(fails ? 1 : 0);
