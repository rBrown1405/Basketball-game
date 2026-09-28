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
  world.time += 1 / 60; a.solve(); meters.frame();
  const fL = a.feet[0], c0 = Math.cos(a.facing), s0 = Math.sin(a.facing);
  const fx = fL.x, fy = fL.y;
  fL.x = a.x + s0 * 1.2; fL.y = a.y - c0 * 1.2;
  world.time += 1 / 60; a.solve(); meters.frame();
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
