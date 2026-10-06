// Trial 9 proof: the shot. One or two body scenarios (and an official for the free throw) on the game's own code: the
// choreographer's shot and free throw beats (Director.p_shot, p_ft, releaseShot) run on a small world with a real hoop,
// a catch-and-shoot's pass staged as the pass lab stages one (js/match/shotlab.js, shared with the Animation Lab's
// "Shooting (the shot lab)" group), each shot measured by the game's own shot meter (debug.js, Meters._shot): the dip
// (the ball and the hips down together), the rise, the release against the top of the jump, the shooting elbow under
// the ball, the wrist's snap, the follow-through held, the landing and its drift; a finish's steps, take-off foot and
// knee drive; a dunk's take-off and hand on the rim; a free throw's routine.
//   node tools/audit/shot.js [--json out.json] [--only id,id]
// Used by check.js.
'use strict';
const { load, seedRandom } = require('./load');
const POP_NAME = ['L_HD', 'R_HD', 'L_TOE', 'R_TOE', 'HT', 'L_EL', 'R_EL', 'L_KN', 'R_KN'];

/** a world like the Animation Lab's: the scenario's bodies (players and officials), a ball */
function world(PBC, bodies) {
  const M = PBC.Match;
  const W = { actors: {}, onCourt: [[], []], list: [], refs: [], ball: null, opts: { ai: { moveSpeed: 50 } }, time: 0, teamLook: () => ({}), sound() {} };
  const out = [];
  for (const [i, b] of bodies.entries()) {
    let a;
    if (b.ref) {
      a = new M.Actor(W, { id: 'ref' + i, num: 14, height: 74, weight: 200, gender: 'm', look: { build: 0.4 } }, -1, 'ref');
      a.setStance('refStand');
      W.refs.push(a);
    } else {
      a = new M.Actor(W, { id: 's' + i, teamIdx: b.team, height: b.h || 78, weight: b.lb || Math.round(215 * Math.pow((b.h || 78) / 78, 2.2)), hand: b.hand || 'R', gender: b.g || 'm', look: { build: 0.5 }, speed: 80, agility: 80, vert: b.vert || 70, handle: 70 }, b.team, 'player');
      W.onCourt[b.team].push(a.id);
      if (b.form) a.shotForm = M.ShotLab.FORMS[b.form];
      if (b.ft) a._ftRoutine = Object.assign({}, b.ft);
    }
    W.actors[a.id] = a; W.list.push(a);
    a.sk.limHits = new Uint8Array(M.Rig.NCH);
    out.push(a);
  }
  const ball = new M.Ball(W);
  W.ball = ball;
  W.view = W;
  return { W, a: out, ball };
}

/** one scenario with the game's own meters */
function run(PBC, sc) {
  const M = PBC.Match, dt = 1 / 60;
  // (each scenario on its own random stream, seeded by its name)
  let hsh = 7; for (let i = 0; i < sc.name.length; i++) hsh = (hsh * 31 + sc.name.charCodeAt(i)) >>> 0;
  seedRandom(hsh);
  const { W, a, ball } = world(PBC, sc.bodies);
  const clock = { t: 0 };
  const ev = [];
  const at = (t, fn) => { ev.push({ t, fn }); ev.sort((p, q) => p.t - q.t); };
  const SL = M.ShotLab, c = { M, a, b: ball, at, D: SL.director(W, () => clock.t, at) };
  c.hold = (who, how) => { who.ballHold = how || 'chest'; const hp = who.heldBallPos([0, 0, 0]); ball.x = hp[0]; ball.y = hp[1]; ball.z = hp[2]; ball.give(who, how || 'chest'); };
  c.shoot = (o) => SL.stageShot(c, o);
  const pc = { M, b: ball, at, D: c.D };
  c.pass = (from, to, o) => M.PassLab.stagePass(pc, from, to, o);
  sc.setup(c);
  for (const x of a) x.solve();
  const mt = new M.Debug.Meters(() => ({ people: W.list, ball, time: W.time, view: null, dt, countAll: true }));
  const popLog = [];
  // (a post move's man: how high he went off his feet, the hardest knock he took, how far off his line to the rim he was put)
  const pdx = { air: 0, knock: 0 };
  for (let n = 1; n * dt <= sc.T + 1e-9; n++) {
    const t = Math.round(n * dt * 1200) / 1200;
    clock.t = t; W.time = t;
    while (ev.length && ev[0].t <= t + 1e-9) ev.shift().fn();
    for (const x of a) x.update(dt, t);
    ball.update(dt, t);
    for (const x of a) x.solve();
    mt.frame();
    for (const x of a) if (x.team === 1) { pdx.air = Math.max(pdx.air, x.jumpZ || 0); if (x.hit && x.hit.t < 0.05) pdx.knock = Math.max(pdx.knock, x.hit.s); }
    // (every joint pop, who and where in the move: the lab's list of them)
    for (const x of a) {
      const tr = mt.tr.get(x);
      if (tr && tr.popJ) for (let i = 0; i < POP_NAME.length; i++) if (tr.popJ & (1 << i)) popLog.push({ t, id: x.id, j: POP_NAME[i], ctx: x.clip && x.clip.clip ? x.clip.clip.name + '@' + x.clip.t.toFixed(2) : mt.ctx(x) });
    }
  }
  mt.shotFlush && mt.shotFlush();
  const S = mt.summary();
  const pops = S.motion.jointSnapsBy;
  const D = c.D, pm = a[0] && a[0]._postMove;
  const post = D.postLog ? { move: pm ? pm.move : null, contacts: D.postContacts || 0, defAirFt: +pdx.air.toFixed(2), defKnock: +pdx.knock.toFixed(1) } : null;
  return { id: sc.id, name: sc.name, shot: S.shot, recs: mt.S.sh.recs, pops, popsN: Object.values(pops).reduce((p, v) => p + v, 0), popLog, holder: ball.holder ? ball.holder.id : null, state: ball.state, post };
}

module.exports = { world, run, scenarios: (PBC) => PBC.Match.ShotLab.scenarios() };

if (require.main === module) {
  const { PBC } = load(3);
  const oi = process.argv.indexOf('--only'), only = oi > 0 ? process.argv[oi + 1].split(',') : null;
  const rows = PBC.Match.ShotLab.scenarios().filter(sc => !only || only.includes(sc.id)).map(sc => run(PBC, sc));
  const f = (v) => (v == null ? '-' : v);
  for (const r of rows) {
    console.log(`${r.id}: ${r.name}  (pops ${r.popsN}; ends ${r.state}${r.holder != null ? ' with ' + r.holder : ''})`);
    for (const x of r.recs) {
      const base = `  ${x.name} by ${x.id}${x.released ? '' : ' NOT RELEASED'}: rel ${f(x.relS)} s (${f(x.relIn)} in, ${f(x.relH)} H, ${f(x.relApexS)} s from the top), jump ${f(x.jumpIn)} in`;
      if (x.kind === 'jumper' || x.kind === 'ft') {
        console.log(base + `; dip ball ${f(x.dipBallIn)} hips ${f(x.dipHipIn)} in knees ${f(x.dipKneeDeg)} deg (${f(x.dipSyncS)} s apart), rise ${f(x.riseBallIn)} in; elbow ${f(x.elbowOffIn)} in off the line, ${f(x.elbowBelowIn)} in under the ball (flare ${f(x.flareDeg)} deg, set ${f(x.setH)} H); snap ${f(x.snapDegps)} deg/s, gooseneck ${f(x.gooseDeg)}; hold ${f(x.holdS)} s; landing knees ${f(x.landKneeDeg)} deg hips ${f(x.landHipIn)} in, drift ${f(x.driftIn)} in fwd ${f(x.driftSideIn)} side; catch to release ${f(x.catchToRelS)} s; lean ${f(x.leanDeg)} deg, nearest ${f(x.closeFt)} ft${x.kind === 'ft' ? `; routine ${f(x.routineS)} s: dribbles ${f(x.dribbles)}${x.spin ? ', a spin' : ''}${x.breath ? ', a deep breath' : ''}` : ''}`);
      } else {
        console.log(base + `; steps ${f(x.steps)}, off the ${x.twoFoot ? 'two feet' : f(x.takeoffFoot) + ' foot'} (${f(x.hand)} hand), knee drive ${f(x.kneeDriveDeg)} deg${x.rimHandS != null ? `, hand on the rim ${x.rimHandS} s` : ''}; landing knees ${f(x.landKneeDeg)} deg`);
      }
    }
  }
  if (process.argv.includes('--pops')) for (const r of rows) for (const q of r.popLog) console.log(`  pop ${r.id} ${q.t.toFixed(3)} ${q.id} ${q.j} ${q.ctx}`);
  const i = process.argv.indexOf('--json');
  if (i > 0) require('fs').writeFileSync(process.argv[i + 1], JSON.stringify(rows.map(r => ({ id: r.id, name: r.name, shot: r.shot, recs: r.recs, popsN: r.popsN })), null, 1));
}
