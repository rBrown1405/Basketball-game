// Tests for js/lib/procanim.js: math safety, IK accuracy, dribble physics, and frame-by-frame continuity
// (no NaN, no snapping) across dribbles, crossovers, passes and layups. Run: node test/procanim.js
const PA = require('../js/lib/procanim.js');
const { Vector3, Quaternion, MathUtils: M, TwoBoneIK, BasketballAnimator, solveDribbleAir } = PA;

let fails = 0, checks = 0;
function ok(cond, msg) { checks++; if (!cond) { fails++; console.log('  FAIL', msg); } }
function near(a, b, tol, msg) { ok(Math.abs(a - b) <= tol, `${msg} (got ${a}, want ${b} ±${tol})`); }
const fin = v => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);

// ---------------------------------------------------------------- math
console.log('math');
ok(!Number.isNaN(M.safeAcos(1.0000001)) && !Number.isNaN(M.safeAcos(-1.2)) && !Number.isNaN(M.safeAcos(NaN)), 'safeAcos never NaN');
ok(fin(new Vector3().normalize()) && fin(new Vector3(NaN, 0, 0).normalize()), 'normalize of zero/NaN vector is finite');
near(M.smoothstep(0, 1, -1), 0, 0, 'smoothstep below'); near(M.smoothstep(0, 1, 2), 1, 0, 'smoothstep above'); near(M.smoothstep(0, 1, 0.5), 0.5, 1e-12, 'smoothstep mid');
near(M.wrapAngle(3 * Math.PI), Math.PI, 1e-9, 'wrapAngle');
near(new Vector3(1, 2, 3).distanceTo(new Vector3(1, 2, 3)), 0, 0, 'distance zero');
near(M.softMax(10, 1, 0.1), 1, 1e-3, 'softMax saturates'); ok(M.softMax(10, 1, 0.1) <= 1, 'softMax never exceeds max');
{ // soft limits are C1 at the knee
  const d = 1e-6, k = 0.9;
  near((M.softMax(k + d, 1, 0.1) - M.softMax(k, 1, 0.1)) / d, 1, 1e-4, 'softMax slope continuous');
}
{ // quaternion round trip through Euler YXZ
  const q = new Quaternion().setFromEulerYXZ(0.3, -1.1, 0.2), e = q.toEulerYXZ(), q2 = new Quaternion().setFromEulerYXZ(e.x, e.y, e.z);
  near(Math.abs(q.dot(q2)), 1, 1e-9, 'Euler YXZ round trip');
}
{ // Bezier degree elevation of a projectile is a projectile
  const P = [new Vector3(0, 0, 0), new Vector3(1, 2 / 3, 0), new Vector3(2, 1, 0), new Vector3(3, 1, 0)], o = new Vector3();
  for (const u of [0.25, 0.5, 0.75]) { M.bezier3(o, ...P, u); near(o.y, 1 - (1 - u) * (1 - u), 1e-12, 'Bezier = parabola at ' + u); }
}

// ---------------------------------------------------------------- dribble ball physics
console.log('dribble physics');
for (const T of [0.25, 0.38, 0.5, 2]) {
  const s = solveDribbleAir(0.78, 0.12, 9.81, 0.8, T);
  const yEnd = 0.12 + s.vUp * (s.T - s.tDown) - 0.5 * 9.81 * (s.T - s.tDown) ** 2;
  near(yEnd, 0.78, 1e-6, `ball returns to the hand height (T=${T})`);
  ok(s.vDown > 0 && Number.isFinite(s.vCatch), 'push speed positive, catch speed finite');
  if (T < 1) near(s.T, T, 1e-6, 'air time honored');
}

// ---------------------------------------------------------------- IK
console.log('two-bone IK');
{
  const ik = new TwoBoneIK(0.31, 0.36);
  const sh = new Vector3(0.19, 1.44, 0), pole = new Vector3(0.5, -0.3, -0.8);
  let prevElbow = null, maxJump = 0;
  for (let i = 0; i <= 2000; i++) {
    // sweep the target through reachable, unreachable and degenerate places (including through the shoulder)
    const a = i / 2000 * Math.PI * 4;
    const tgt = new Vector3(0.19 + 0.8 * Math.cos(a) * Math.sin(a * 0.5), 1.44 + 0.8 * Math.sin(a), 0.8 * Math.cos(a * 0.7));
    const o = ik.solve(sh, tgt, pole, 1 / 240);
    ok(fin(o.elbow) && fin(o.palm) && o.upperQ.isFinite() && o.handQ.isFinite(), 'IK output finite');
    near(o.elbow.distanceTo(sh), 0.31, 1e-9, 'upper arm length kept');
    near(o.palm.distanceTo(o.elbow), 0.36, 1e-9, 'forearm length kept');
    const dist = tgt.distanceTo(sh);
    if (dist < 0.6 && dist > 0.12) near(o.palm.distanceTo(tgt), 0, 1e-6, 'reachable target is reached');
    // +Y of the upper arm quaternion points at the elbow
    const y = new Vector3(0, 1, 0).applyQuaternion(o.upperQ), dir = new Vector3().subVectors(o.elbow, sh).normalize();
    near(y.dot(dir), 1, 1e-9, 'upper arm orientation matches the bone');
    if (prevElbow) maxJump = Math.max(maxJump, prevElbow.distanceTo(o.elbow));
    prevElbow = o.elbow.clone();
  }
  console.log('  max elbow step over a 4-loop sweep:', maxJump.toFixed(4), 'm');
  ok(maxJump < 0.05, 'elbow never jumps (no pole flip)');
  const o = ik.solve(sh, sh.clone(), pole, 0.016);
  ok(fin(o.elbow) && fin(o.palm), 'target exactly on the shoulder is safe');
  const o2 = ik.solve(sh, new Vector3(NaN, 1, 1), pole, 0.016);
  ok(fin(o2.elbow), 'NaN target is safe');
}

// ---------------------------------------------------------------- full animator, frame by frame
function mockNode() { return { position: { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } }, quaternion: { x: 0, y: 0, z: 0, w: 1, set(x, y, z, w) { Object.assign(this, { x, y, z, w }); } } }; }
function eulerNode() { return { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, order: 'XYZ' } }; }
function makeRig() {
  return { root: mockNode(), pelvis: mockNode(), torso: mockNode(), head: eulerNode(), ball: mockNode(),
    arms: { left: { upper: mockNode(), fore: mockNode(), hand: mockNode() }, right: { upper: mockNode(), fore: eulerNode(), hand: mockNode() } },
    ikTargets: { leftHand: mockNode(), rightHand: mockNode(), leftElbow: mockNode(), rightElbow: mockNode() } };
}

function simulate(script, opts, fps) {
  const rig = makeRig();
  const anim = new BasketballAnimator(rig, opts.config);
  const events = [];
  for (const e of ['release', 'passArrived', 'shot', 'shotArrived', 'passComplete', 'layupComplete', 'dribbleComplete']) anim.on(e, d => events.push([e, anim.time, d]));
  const frames = [];
  let t = 0, rng = 12345;
  const rand = () => ((rng = (rng * 16807) % 2147483647) / 2147483647);
  const cues = script.slice().sort((a, b) => a[0] - b[0]);
  const end = opts.duration || 6;
  while (t < end - 1e-9) {
    while (cues.length && cues[0][0] <= t + 1e-9) cues.shift()[1](anim);
    const dt = opts.dt ? opts.dt(rand) : 1 / fps;
    const step = Number.isFinite(dt) ? Math.min(Math.max(dt, 0), 0.1) : 0;
    if (rig.root.speed && !anim.rootDriven) rig.root.position.z += rig.root.speed * step; // the game's locomotion
    const st = anim.update(dt);
    t += opts.dt ? Math.max(step, 1e-3) : step;
    const L = st.joints.local;
    frames.push({ t, dt: step, st, extL: st.ik.left.extension, extR: st.ik.right.extension, lp: L.left.palm.clone(), rp: L.right.palm.clone(), le: L.left.elbow.clone(), re: L.right.elbow.clone(), ball: st.ball.position, root: st.root.position, torso: st.pose.torsoYaw });
  }
  return { anim, rig, events, frames };
}
/** max speed and max acceleration of a signal (finite differences), skipping frames flagged by skip(frame). */
function kinematics(frames, key, skip) {
  let maxV = 0, maxA = 0, atA = 0;
  for (let i = 2; i < frames.length; i++) {
    const a = frames[i - 2], b = frames[i - 1], c = frames[i];
    if (!(b.dt > 0 && c.dt > 0)) continue;
    if (skip && (skip(a) || skip(b) || skip(c))) continue;
    const v1 = new Vector3().subVectors(b[key], a[key]).multiplyScalar(1 / b.dt), v2 = new Vector3().subVectors(c[key], b[key]).multiplyScalar(1 / c.dt);
    maxV = Math.max(maxV, v2.length());
    const acc = v2.distanceTo(v1) / c.dt;
    if (acc > maxA) { maxA = acc; atA = c.t; }
  }
  return { maxV, maxA, atA };
}
/**
 * Snap test: run the same script at 60 and 240 fps. Smooth (C1) motion has bounded speed and acceleration, so the
 * estimates agree. A position jump makes the 240 fps speed explode; a velocity jump makes its acceleration explode.
 */
function run(label, script, opts = {}) {
  console.log(label);
  const lo = simulate(script, opts, 60), hi = simulate(script, opts, 240);
  for (const R of [lo, hi]) ok(R.frames.every(f => fin(f.lp) && fin(f.rp) && fin(f.le) && fin(f.re) && fin(f.ball) && fin(f.root) && Number.isFinite(f.torso)), 'every output finite');
  const rows = [];
  for (const [key, vCap, aCap] of [['lp', 10, 320], ['rp', 10, 320], ['le', 8, 260], ['re', 8, 260]]) {
    const k60 = kinematics(lo.frames, key, opts.skip), k240 = kinematics(hi.frames, key, opts.skip);
    rows.push(`${key} v ${k60.maxV.toFixed(2)}/${k240.maxV.toFixed(2)} a ${k60.maxA.toFixed(0)}/${k240.maxA.toFixed(0)}`);
    if (opts.hostile) { // mixed 1 ns and 100 ms frames make finite-difference accelerations meaningless: check speed
      ok(k240.maxV < vCap, `${key}: no jump under hostile time steps (max speed ${k240.maxV.toFixed(2)} m/s)`);
      continue;
    }
    ok(k240.maxV < vCap && k240.maxA < aCap, `${key}: human speed and acceleration (${k240.maxV.toFixed(2)} m/s, ${k240.maxA.toFixed(0)} m/s² at t=${k240.atA.toFixed(3)})`);
    ok(k240.maxV < k60.maxV * 1.3 + 0.3, `${key}: no position snap (speed at 240 fps ${k240.maxV.toFixed(2)} vs 60 fps ${k60.maxV.toFixed(2)})`);
    ok(k240.maxA < k60.maxA * 1.6 + 25, `${key}: no velocity snap (accel at 240 fps ${k240.maxA.toFixed(0)} at t=${k240.atA.toFixed(3)} vs 60 fps ${k60.maxA.toFixed(0)})`);
  }
  console.log('  arms in root space, speed m/s and accel m/s² at 60/240 fps:', rows.join(' | '));
  // rig received finite values and chain rotations recompose (parent * local == world)
  const { anim, rig } = hi;
  const q = rig.arms.right.upper.quaternion;
  ok([q.x, q.y, q.z, q.w].every(Number.isFinite) && Number.isFinite(rig.head.rotation.x) && rig.head.rotation.order === 'YXZ', 'rig written');
  const up = new Quaternion(q.x, q.y, q.z, q.w);
  near(Math.abs(anim.torsoQ.clone().multiply(up).dot(anim.ik.right.out.upperQ)), 1, 1e-9, 'chain: torso * upperArm(local) = upperArm(world)');
  const fr = rig.arms.right.fore.rotation, foreLocal = new Quaternion().setFromEulerYXZ(fr.x, fr.y, fr.z);
  near(Math.abs(anim.torsoQ.clone().multiply(up).multiply(foreLocal).dot(anim.ik.right.out.lowerQ)), 1, 1e-9, 'chain: Euler-only forearm recomposes');
  return Object.assign(hi, { lo });
}

// 1) dribble with crossovers at 60 fps
{
  const { anim, frames } = run('dribble + crossovers', [
    [0.0, a => a.dribble({ hand: 'right' })],
    [2.0, a => a.crossover()], [3.3, a => a.crossover()], [3.35, a => a.crossover()], // spam is queued safely
    [5.0, a => a.stopDribble()],
  ], { duration: 6.5 });
  // hand really rests on the ball while in contact: palm to ball-surface gap
  let maxGap = 0, contactFrames = 0, minBallY = 9, maxBall = 0;
  const d = anim.controllers.dribble;
  for (const f of frames) {
    minBallY = Math.min(minBallY, f.ball.y);
    if (f.st.action === 'dribble' && f.st.phase === 'contact' && f.t > 0.4) {
      const palm = f.st.dribbleHand === 'right' ? f.rp : f.lp;
      maxGap = Math.max(maxGap, Math.abs(palm.distanceTo(f.ball) - (anim.cfg.ballRadius + 0.012)));
      contactFrames++;
    }
    if (f.st.action === 'dribble') maxBall = Math.max(maxBall, f.ball.y);
  }
  console.log(`  contact frames ${contactFrames}, max palm-to-ball gap ${(maxGap * 1000).toFixed(2)} mm, lowest ball center ${minBallY.toFixed(3)} m, highest ${maxBall.toFixed(2)} m`);
  ok(contactFrames > 30, 'hand contacts happened');
  ok(maxGap < 0.004, 'palm stays on the ball during every contact (< 4 mm)');
  ok(minBallY >= anim.cfg.ballRadius - 1e-9, 'ball never goes through the floor');
  ok(maxBall < 1.1, 'dribble stays low');
  const hands = new Set(frames.filter(f => f.st.dribbleHand).map(f => f.st.dribbleHand));
  ok(hands.has('left') && hands.has('right'), 'crossover moved the ball to the other hand and back');
  ok(frames[frames.length - 1].st.action === 'idle' && frames[frames.length - 1].st.ball.held, 'stop dribble ends holding the ball');
  void d;
}

// 2) the ball itself is C1 through the dribble (except the floor bounce, which is a real impact)
{
  const R = run('ball continuity through dribbles', [[0, a => a.dribble()], [1.5, a => a.crossover()]], { duration: 3 });
  const nearFloor = f => f.ball.y < 0.2; // the floor bounce reverses the ball's velocity on purpose (an impact)
  const k60 = kinematics(R.lo.frames, 'ball', nearFloor), k240 = kinematics(R.frames, 'ball', nearFloor);
  console.log(`  ball away from the floor: accel ${k60.maxA.toFixed(0)} (60 fps) / ${k240.maxA.toFixed(0)} (240 fps) m/s², speed ${k240.maxV.toFixed(2)} m/s`);
  ok(k240.maxA < k60.maxA * 1.6 + 25, 'no ball snap at catches and releases (hand phases are C1)');
}

// 3) pass (torso turns to a teammate off to the left and behind), then catch and dribble again
{
  const target = new Vector3(3.5, 1.3, 2.0);
  const { anim, frames, events } = run('dribble -> chest pass -> give ball -> dribble', [
    [0, a => a.dribble()],
    [1.23, a => a.pass(target)],
    [3.0, a => a.giveBall(new Vector3(0.3, 1.1, 0.4))],
    [3.2, a => a.dribble({ hand: 'left' })],
  ], { duration: 5 });
  const arrived = events.find(e => e[0] === 'passArrived');
  ok(!!arrived, 'pass arrived');
  if (arrived) near(arrived[2].position.distanceTo(target), 0, 0.01, 'ball arrives at the teammate');
  const turn = Math.max(...frames.filter(f => f.st.action === 'pass').map(f => f.torso));
  const yawToTarget = Math.atan2(target.x, target.z);
  console.log(`  torso turned ${turn.toFixed(2)} rad toward a teammate at ${yawToTarget.toFixed(2)} rad`);
  ok(turn > 0.6 && turn <= anim.cfg.body.maxTorsoYaw + 1e-6, 'torso turns toward the teammate (limited)');
  // arms extend along the vector to the teammate at the release
  const ext = Math.max(...frames.filter(f => f.st.action === 'pass').map(f => Math.min(f.extR, f.extL)));
  console.log(`  peak two-arm extension ${(ext * 100).toFixed(0)}%`);
  ok(ext > 0.8, 'arms reach near full extension along the pass vector');
}

// 4) layup from a run, with a curved path
{
  const rim = new Vector3(0.4, 3.05, 4.2);
  const { anim, frames, events } = run('run + dribble -> layup (curved) -> land', [
    [0, a => a.dribble()],
    [0.0, a => { a.rig.root.speed = 3.2; }],        // the game moves the root toward the rim at 3.2 m/s
    [0.8, a => { a.rig.root.speed = 0; a.layup(rim, { hand: 'right', curve: 0.35 }); }],
  ], { duration: 3 });
  const shot = events.find(e => e[0] === 'shotArrived');
  ok(!!shot, 'layup ball arrives');
  if (shot) near(shot[2].position.distanceTo(rim.clone().add(new Vector3(0, 0.02, 0))), 0, 0.01, 'ball arrives at the rim');
  const ys = frames.map(f => f.root.y);
  const apex = Math.max(...ys);
  console.log(`  jump apex ${apex.toFixed(2)} m, final root y ${ys[ys.length - 1].toFixed(3)}, done: ${frames[frames.length - 1].st.action}`);
  ok(apex > 0.2 && apex < 1.1, 'jump height believable');
  near(ys[ys.length - 1], 0, 1e-9, 'lands back on the floor');
  // root: horizontal velocity is C1 from the run through the plant step, take-off, apex and fall;
  // vertical velocity is C1 in the air (take-off and landing are real impacts with the floor)
  let maxH = 0, maxV = 0;
  const lay = frames.filter(f => f.st.action === 'layup' || f.t < 0.8);
  for (let i = 2; i < lay.length; i++) {
    const A = lay[i - 2], B = lay[i - 1], Cc = lay[i];
    if (Cc.st.phase === 'land' || B.st.phase === 'land' || !(B.dt > 0 && Cc.dt > 0)) continue;
    const v1 = new Vector3().subVectors(B.root, A.root).multiplyScalar(1 / B.dt), v2 = new Vector3().subVectors(Cc.root, B.root).multiplyScalar(1 / Cc.dt);
    maxH = Math.max(maxH, Math.hypot(v2.x - v1.x, v2.z - v1.z) / Cc.dt);
    const air = ['rise', 'fall'].includes(A.st.phase) && ['rise', 'fall'].includes(Cc.st.phase);
    if (air) maxV = Math.max(maxV, Math.abs(v2.y - v1.y) / Cc.dt);
  }
  console.log(`  root: max horizontal accel ${maxH.toFixed(1)} m/s², max vertical accel in the air ${maxV.toFixed(2)} m/s² (gravity ${anim.controllers.layup.gEff.toFixed(2)})`);
  ok(maxH < 60, 'root horizontal motion has no kink (run -> plant -> jump -> fall)');
  ok(maxV < anim.controllers.layup.gEff * 1.05, 'airborne root is one smooth parabola (no kink at the apex)');
  const reach = Math.max(...frames.filter(f => f.st.action === 'layup').map(f => f.extR));
  console.log(`  shooting arm peak extension ${(reach * 100).toFixed(0)}%`);
  ok(reach > 0.85, 'shooting arm fully extends toward the rim');
}

// 5) robustness: hostile time steps and degenerate targets
{
  const weird = [NaN, Infinity, -1, 0, 0, 1, 0.5, 1 / 30, 1 / 144, 1e-9];
  const { frames } = run('hostile time steps + degenerate targets', [
    [0, a => a.dribble()],
    [0.5, a => a.crossover()],
    [1.0, a => a.pass(a.rootPos.clone())],                 // pass to your own feet
    [2.5, a => a.giveBall()],
    [2.6, a => a.layup(new Vector3(0, 3.05, 0))],          // rim straight above
    [4.5, a => a.giveBall()],
    [4.6, a => a.layup(new Vector3(40, 3.05, 40))],        // rim far away
  ], { duration: 7, dt: rand => weird[Math.floor(rand() * weird.length)], hostile: true });
  ok(frames.length > 10, 'ran');
}

// 6) variable frame rate gives the same motion (analytic time, not integration drift)
{
  const sample = dtFn => {
    const anim = new BasketballAnimator({});
    anim.dribble();
    let t = 0, rng = 7;
    const rand = () => ((rng = (rng * 16807) % 2147483647) / 2147483647);
    while (t < 2.5 - 1e-12) { const dt = Math.min(dtFn(rand()), 2.5 - t); anim.update(dt); t += dt; } // land exactly on 2.5 s
    return anim.getState().ball.position;
  };
  const a = sample(() => 1 / 60), b = sample(r => 1 / 30 + r * (1 / 60));
  console.log('frame-rate independence: ball at t=2.5 s differs by', (a.distanceTo(b) * 1000).toFixed(2), 'mm between 60 fps and a jittery 20-30 fps');
  ok(a.distanceTo(b) < 0.03, 'same motion at any frame rate');
}

// 7) flat hierarchy mode positions the bones at the joints
{
  const rig = makeRig();
  const anim = new BasketballAnimator(rig, { hierarchy: 'flat' });
  anim.update(1 / 60);
  const J = anim.joints.right, p = rig.arms.right.fore.position;
  near(Math.hypot(p.x - J.elbow.x, p.y - J.elbow.y, p.z - J.elbow.z), 0, 1e-12, 'flat mode puts the forearm at the elbow');
}

console.log(`\n${checks - fails}/${checks} checks passed`);
process.exit(fails ? 1 : 0);
