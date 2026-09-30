// Trial 8 proof: the handle. Dribbling scenarios on the game's own code in a one or two body world (the Animation Lab's
// kind), each measured by the game's own meters (the hand on the ball at every contact, the ball through a body, the
// bounce against the inside foot, the rate and height, the eyes, the off arm, joint pops), plus the ball's own physics:
// its acceleration between the hand and the floor against gravity, and each bounce's restitution.
//   node tools/audit/handle.js [--json out.json]
// Used by check.js.
'use strict';
const { load } = require('./load');

/** a world like the Animation Lab's: bodies, a ball, the court's middle */
function world(PBC, bodies) {
  const M = PBC.Match;
  const W = { actors: {}, onCourt: [[], []], list: [], ball: null, opts: { ai: { moveSpeed: 50 } }, refs: [], time: 0, teamLook: () => ({}), sound() {} };
  const out = [];
  for (const [i, b] of bodies.entries()) {
    const a = new M.Actor(W, { id: 'h' + i, teamIdx: b.team, height: b.h || 78, weight: b.lb || 215, hand: b.hand || 'R', gender: b.g || 'm', look: { build: 0.5 }, speed: 80, agility: 80, handle: b.handle }, b.team, 'player');
    W.actors[a.id] = a; W.onCourt[b.team].push(a.id); W.list.push(a);
    a.sk.limHits = new Uint8Array(M.Rig.NCH);
    out.push(a);
  }
  const ball = new M.Ball(W);
  W.ball = ball;
  W.view = W;
  return { W, a: out, ball };
}

// [name, seconds, setup(ctx), tick(ctx, t)?]; ctx: { a (the dribbler), d (a defender, when asked for), b (the ball), at(t, fn) }
const HELD_S = 0.4;
function scenarios() {
  const S = [];
  // (every dribble starts out of his hands, as in a game: the ball in his hands at the chest first, settling there, then
  // the scenario from HELD_S on, its own times counted from there)
  const add = (name, T, o) => S.push(Object.assign({ name, T: T + HELD_S }, o, { setup: (c) => {
    c.a.ballHold = 'chest'; const hp = c.a.heldBallPos([0, 0, 0]); c.b.x = hp[0]; c.b.y = hp[1]; c.b.z = hp[2];
    c.b.give(c.a, 'chest'); c.a.solve();
    c.at(HELD_S, () => { c.t0 = HELD_S; o.setup(c); });
  } }));
  const go = (c, dist, speed) => c.a.moveTo(c.a.x + dist, c.a.y, { speed });
  add('dribble in place, open', 6, { setup: (c) => { c.b.dribble(c.a); c.a.setStance('dribble'); } });
  add('dribble in place, a defender up on him', 6, { two: true, setup: (c) => {
    c.b.dribble(c.a); c.a.setStance('dribble');
    c.d.place(c.a.x + 3.6, c.a.y, Math.PI); c.d.setStance('defense'); c.d.setFace(() => Math.atan2(c.a.y - c.d.y, c.a.x - c.d.x));
  } });
  add('dribble walking', 7, { setup: (c) => { c.b.dribble(c.a); c.a.setStance('dribble'); c.at(0.4, () => go(c, 200, 5)); } });
  add('dribble jogging', 7, { setup: (c) => { c.b.dribble(c.a); c.a.setStance('dribble'); c.at(0.4, () => go(c, 200, 11)); } });
  add('dribble running', 6, { setup: (c) => { c.b.dribble(c.a); c.a.setStance('dribble'); c.at(0.4, () => go(c, 300, 15)); } });
  add('speed dribble', 6, { setup: (c) => { c.b.dribble(c.a); c.a.setStance('dribble'); c.at(0.4, () => go(c, 400, 21)); } });
  for (const [id, name] of [['cross', 'crossover'], ['btl', 'between the legs'], ['btb', 'behind the back'], ['inout', 'in and out']]) {
    // (long enough for the third: a move asked for while one waits for its beat goes after it)
    add(name + ' (three)', 5.8, { setup: (c) => {
      c.b.dribble(c.a); c.a.setStance('dribble');
      c.at(0.3, () => go(c, 60, 3));
      for (const t of [0.9, 2.1, 3.3]) c.at(t, () => c.b.dribbleMove(id));
    } });
  }
  add('spin move', 3.4, { setup: (c) => {
    c.b.dribble(c.a); c.a.setStance('dribble');
    c.at(0.3, () => go(c, 40, 5));
    c.at(1.0, () => c.a.spinMove({ exitFacing: 0, exitTo: { x: c.a.x + 40, y: c.a.y } }));
  } });
  add('hesitation', 3.4, { setup: (c) => {
    c.b.dribble(c.a); c.a.setStance('dribble');
    c.at(0.3, () => go(c, 60, 10));
    c.at(1.2, () => c.a.hesitate());
  } });
  add('retreat dribble (a defender up on him)', 3.4, { two: true, setup: (c) => {
    c.b.dribble(c.a); c.a.setStance('dribble');
    c.d.place(c.a.x + 3.4, c.a.y, Math.PI); c.d.setStance('defense'); c.d.setFace(() => Math.atan2(c.a.y - c.d.y, c.a.x - c.d.x));
    c.at(0.9, () => c.a.retreat());
  } });
  add('catch and go (a dribble out of the hands)', 3, { setup: (c) => {
    c.b.give(c.a, 'chest'); c.a.setStance('triple');
    c.at(0.6, () => { c.a.setStance('dribble'); c.b.dribble(c.a); go(c, 60, 12); });
  } });
  return S;
}

/** one scenario with the game's own meters and the ball's physics */
function run(PBC, sc) {
  const M = PBC.Match, dt = 1 / 60, G = M.U.G, R = M.Ball.R;
  const { W, a, ball } = world(PBC, sc.two ? [{ team: 0 }, { team: 1 }] : [{ team: 0 }]);
  const A = a[0];
  A.place(47, 25, 0); A.setStance('stand');
  ball.x = A.x + 3; ball.y = A.y; ball.z = R;
  const ev = [];
  const ctx = { a: A, d: a[1], b: ball, t0: 0, at: (t, fn) => { ev.push({ t: t + ctx.t0, fn }); ev.sort((p, q) => p.t - q.t); } };
  sc.setup(ctx);
  for (const x of a) x.solve();
  const mt = new M.Debug.Meters(() => ({ people: W.list, ball, time: W.time, view: null, dt, countAll: true }));
  // the ball's own physics: its vertical acceleration while it is off the hand and off the floor, each bounce, and its
  // acceleration across the floor in the air (none: nothing pushes it there; a jump means it was shoved out of a body)
  const acc = [], rest = [], accH = [];
  let z1 = null, z2 = null, ph1 = null, ph2 = null, vzIn = null, x1 = null, x2 = null, y1 = null, y2 = null;
  for (let t = dt; t <= sc.T + 1e-9; t += dt) {
    W.time = t;
    while (ev.length && ev[0].t <= t + 1e-9) ev.shift().fn();
    for (const x of a) x.update(dt, t);
    ball.update(dt, t);
    for (const x of a) x.solve();
    mt.frame();
    const d = A.dribble, ph = ball.state === 'dribble' && d ? d.ph : null;
    // (three frames in a row in the same free phase: the second difference is gravity alone)
    if (ph && ph1 === ph && ph2 === ph && (ph === 'down' || ph === 'up') && z1 != null && z2 != null) {
      acc.push((ball.z - 2 * z1 + z2) / (dt * dt));
      accH.push(Math.hypot(ball.x - 2 * x1 + x2, ball.y - 2 * y1 + y2) / (dt * dt));
    }
    if (ph1 === 'down' && ph === 'up' && vzIn != null) {
      // (the frame of the bounce holds both the fall and the rise: the speeds are read a frame either side)
      rest.push({ vIn: -vzIn, vOut: null });
    } else if (rest.length && rest[rest.length - 1].vOut == null && ph === 'up' && ph1 === 'up') rest[rest.length - 1].vOut = (ball.z - z1) / dt + 0.5 * G * dt;
    if (ph === 'down' && ph1 === 'down') vzIn = (ball.z - z1) / dt - 0.5 * G * dt;
    z2 = z1; z1 = ball.z; ph2 = ph1; ph1 = ph; x2 = x1; x1 = ball.x; y2 = y1; y1 = ball.y;
  }
  const S = mt.summary(), h = S.handle;
  const pops = S.motion.jointSnapsBy, armPops = Object.entries(pops).filter(([k]) => /HD|EL/.test(k)).reduce((p, [, v]) => p + v, 0);
  const gErr = acc.length ? Math.max(...acc.map(x => Math.abs(x + G))) : null;
  const e = rest.filter(r => r.vOut != null).map(r => ({ vIn: r.vIn, e: r.vOut / r.vIn, want: M.Ball.eFloor(r.vIn) }));
  return {
    name: sc.name, contacts: h.contacts, contactsOff: h.contactsOff, contactMaxIn: h.contactMaxIn, catchIn: h.catchIn, offBy: h.offBy,
    ballThroughFrames: h.ballThroughFrames, ballThroughBy: h.ballThroughBy, ballThroughWorstIn: h.ballThroughWorstIn,
    bounces: h.bounces, rhythm: h.rhythm, bouncesPerS: h.bouncesPerS, topIn: h.topIn, eyesOnBallPct: h.eyesOnBallPct, offArmUpPct: h.offArmUpPct, pressedFrames: h.pressedFrames,
    air: { frames: h.airFrames, jolts: h.airJolts, worstFtps2: h.airWorstFtps2, by: h.airJoltBy },
    pops, armPops, allPops: Object.values(pops).reduce((p, q) => p + q, 0),
    gravity: { frames: acc.length, worstOffFtps2: gErr == null ? null : +gErr.toFixed(2), meanFtps2: acc.length ? +(acc.reduce((p, q) => p + q, 0) / acc.length).toFixed(2) : null },
    // (across the floor in the air: the worst, and frames over Tune.debug.popAccel's tenth, 150 ft/s^2, a 0.5 in jolt)
    airAccel: { worstFtps2: accH.length ? +Math.max(...accH).toFixed(1) : null, over150: accH.filter(x => x > 150).length },
    restitution: e.length ? { n: e.length, meanE: +(e.reduce((p, q) => p + q.e, 0) / e.length).toFixed(3), worstOff: +Math.max(...e.map(q => Math.abs(q.e - q.want))).toFixed(3) } : null,
  };
}

module.exports = { world, scenarios, run };

if (require.main === module) {
  const { PBC } = load(3);
  const rows = scenarios().map(sc => run(PBC, sc));
  for (const r of rows) {
    console.log(`${r.name}`);
    console.log(`  contacts ${r.contacts}, off by > 0.25 in: ${r.contactsOff} (worst ${r.contactMaxIn.max} in, catch p90 ${r.catchIn.p90})` + (r.offBy.length ? ' ' + JSON.stringify(r.offBy) : ''));
    console.log(`  ball through a body: ${r.ballThroughFrames} frames` + (r.ballThroughFrames ? ` (worst ${r.ballThroughWorstIn} in) ${JSON.stringify(r.ballThroughBy)}` : ''));
    console.log(`  bounces ${r.bounces}; per s ${JSON.stringify(r.bouncesPerS)}; top (in) open ${r.topIn.open.p50} pressed ${r.topIn.pressed.p50} moving ${r.topIn.moving.p50}; with the inside step ${r.rhythm.withInsideStepPct}% (off p50 ${r.rhythm.offS.p50} s), period / step ${r.rhythm.periodPerStep.p50}; moves with a footfall ${r.rhythm.movesWithStepPct}% (n ${r.rhythm.moveOffS.n}, off p50 ${r.rhythm.moveOffS.p50} s)`);
    console.log(`  eyes on the ball ${r.eyesOnBallPct}%; off arm up with a man on him ${r.offArmUpPct}% of ${r.pressedFrames} frames; pops ${r.allPops} (arms ${r.armPops}) ${JSON.stringify(r.pops)}`);
    console.log(`  in the air across the floor: worst ${r.airAccel.worstFtps2} ft/s^2, ${r.airAccel.over150} frames over 150 (the game's meter: ${r.air.jolts} of ${r.air.frames}, worst ${r.air.worstFtps2})`);
    console.log(`  gravity between hand and floor: ${r.gravity.frames} frames, mean ${r.gravity.meanFtps2} ft/s^2, worst off ${r.gravity.worstOffFtps2}; restitution ${r.restitution ? r.restitution.meanE + ' (worst off FIBA by ' + r.restitution.worstOff + ', n ' + r.restitution.n + ')' : '-'}`);
  }
  const i = process.argv.indexOf('--json');
  if (i > 0) require('fs').writeFileSync(process.argv[i + 1], JSON.stringify(rows, null, 1));
}
