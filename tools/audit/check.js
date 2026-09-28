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
// a swinging foot pointed 60 deg toes-down with the ankle at standing height: the toes go through the floor
{
  const f0 = a.feet[0], jA = J.L_AN * 3;
  f0.state = 'swing'; f0.ax = a.sk.P[jA]; f0.ay = a.sk.P[jA + 1]; f0.az = a.sk.P[jA + 2]; f0.pitchNow = 60 * U.DEG; f0.yawNow = f0.yaw;
  world.time += 1 / 60; a.solve(); meters.frame();
  const zt = a.sk.P[J.L_TOE * 3 + 2];
  ok(zt < -0.1 && Math.abs(tr.sink[0] + Math.min(zt, a.sk.P[J.L_BALL * 3 + 2])) < 1e-9, 'toes 60 deg down at standing ankle height: ' + (tr.sink[0] * 12).toFixed(2) + ' in through the floor, flagged');
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
