// Trial 11 proof: the glass and the contest. Two to six body scenarios on the game's own code (js/match/glasslab.js, shared
// with the Animation Lab's "Rebounds, blocks and steals (the glass lab)" group): the choreographer's shot beat (the release,
// the contest, a block, the miss's carom), the box-outs and the crash, the rebound beat (the rebounder's read, run, jump and
// take), the turnover beat (a poke and the loose ball, an interception) and the foul beat (a reach-in), each measured by the
// game's own glass meter (debug.js, Meters._glass): the ball steered off its own path or not, when the one who takes it set
// off after it against the ball coming off the rim, his hands at the ball as he takes it, the take against the top of his
// jump, the ball under the chin with the elbows out; each box-out's contact, base and arms; each contest's hand against the
// line to the ball at the release; a block's hand at the ball; a swipe's hand to the ball.
//   node tools/audit/glass.js [--json out.json] [--only id,id] [--pops]
// Used by check.js.
'use strict';
const { load, seedRandom } = require('./load');
const { world } = require('./shot');
const POP_NAME = ['L_HD', 'R_HD', 'L_TOE', 'R_TOE', 'HT', 'L_EL', 'R_EL', 'L_KN', 'R_KN'];

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
  const GL = M.GlassLab, c = { M, a, b: ball, at, D: GL.director(W, () => clock.t, at) };
  c.hold = (who, how) => { who.ballHold = how || 'chest'; const hp = who.heldBallPos([0, 0, 0]); ball.x = hp[0]; ball.y = hp[1]; ball.z = hp[2]; ball.give(who, how || 'chest'); };
  sc.setup(c);
  for (const x of a) x.solve();
  const mt = new M.Debug.Meters(() => ({ people: W.list, ball, time: W.time, view: null, dt, countAll: true }));
  const popLog = [];
  for (let n = 1; n * dt <= sc.T + 1e-9; n++) {
    const t = Math.round(n * dt * 1200) / 1200;
    clock.t = t; W.time = t;
    while (ev.length && ev[0].t <= t + 1e-9) ev.shift().fn();
    for (const x of a) x.update(dt, t);
    ball.update(dt, t);
    for (const x of a) x.solve();
    mt.frame();
    for (const x of a) {
      const tr = mt.tr.get(x);
      if (tr && tr.popJ) for (let i = 0; i < POP_NAME.length; i++) if (tr.popJ & (1 << i)) popLog.push({ t, id: x.id, j: POP_NAME[i], ctx: x.clip && x.clip.clip ? x.clip.clip.name + '@' + x.clip.t.toFixed(2) : mt.ctx(x) });
    }
  }
  mt.glassFlush();
  const S = mt.summary();
  const pops = S.motion.jointSnapsBy;
  return { id: sc.id, name: sc.name, glass: S.glass, recs: mt.S.gl.recs, pops, popsN: Object.values(pops).reduce((p, v) => p + v, 0), popLog, holder: ball.holder ? ball.holder.id : null, state: ball.state };
}

module.exports = { run, scenarios: (PBC) => PBC.Match.GlassLab.scenarios() };

if (require.main === module) {
  const { PBC } = load(3);
  const oi = process.argv.indexOf('--only'), only = oi > 0 ? process.argv[oi + 1].split(',') : null;
  const rows = PBC.Match.GlassLab.scenarios().filter(sc => !only || only.includes(sc.id)).map(sc => run(PBC, sc));
  const f = (v) => (v == null ? '-' : v);
  for (const r of rows) {
    console.log(`${r.id}: ${r.name}  (pops ${r.popsN}; ends ${r.state}${r.holder != null ? ' with ' + r.holder : ''})`);
    for (const x of r.recs) {
      if (x.kind === 'miss' || x.kind === 'blocked' || x.kind === 'loose') {
        console.log(`  ${x.kind}: off the rim ${f(x.contactS)} s after it went up; steered ${f(x.bendMaxIn)} in` + (x.taken ? `; taken by ${x.id}${x.off ? ' (offense)' : ''} ${x.air ? 'in the air' : 'off the floor'} ${f(x.takeS)} s after it came off at ${f(x.takeZ)} ft: hands ${f(x.gapLIn)} / ${f(x.gapRIn)} in off it, pulled ${f(x.pullFt)} ft; set off ${f(x.onsetS)} s after it came off, closed ${f(x.preCloseFt)} ft before (${f(x.d0Ft)} ft away as it went up, ${f(x.dContactFt)} as it came off); jump ${f(x.jumpIn)} in, the take ${f(x.apexS)} s after the top; chin ${f(x.chinS)} s, held ${f(x.chinHoldS)} s, elbows ${f(x.elbowSpanMax)} x the shoulders` : '; nobody took it'));
        for (const o of x.others || []) console.log(`    near: ${o.id} set off ${f(o.onsetS)} s after it came off, closed ${f(o.preCloseFt)} ft before`);
        for (const b of x.box || []) console.log(`    box-out: ${b.id} on ${f(b.man)} from ${f(b.startS)} s${b.manLeft ? ' (his man went back up the floor: let go, not counted)' : ''}: contact at ${f(b.contactS)} s, held ${f(b.holdPct)}%, gap ${f(b.gapIn)} in, man ${f(b.behindDeg)} deg off straight behind, base ${f(b.baseX)} x the shoulders, elbows ${f(b.elbowX)} x, knees ${f(b.kneeDeg)} deg`);
      } else if (x.kind === 'contest') console.log(`  contest by ${x.id} (${f(x.level)}, ${f(x.distFt)} ft, ${f(x.clip)}): hand ${f(x.angDeg)} deg off the line to the ball, ${f(x.handBallFt)} ft from it, ${f(x.handOverHeadFt)} ft over the head, jump ${f(x.jumpIn)} in`);
      else if (x.kind === 'interception') console.log(`  interception by ${x.id} of ${x.passer}'s pass: hands ${f(x.gapLIn)} / ${f(x.gapRIn)} in off it, pulled ${f(x.pullFt)} ft, at ${f(x.takeZ)} ft`);
      else if (x.kind === 'block') console.log(`  block by ${x.id} (${f(x.clip)}): hand ${f(x.gapIn)} in off the ball, ${f(x.apexS)} s after the top of a ${f(x.jumpIn)} in jump, the ball off ${f(x.swatDeg)} deg from the hand's way`);
      else console.log(`  ${x.kind} by ${x.id} (from ${f(x.startFt)} ft): hand ${f(x.minFt)} ft from the ball at its nearest, ${f(x.atEventFt)} ft at the contact`);
    }
  }
  if (process.argv.includes('--pops')) for (const r of rows) for (const q of r.popLog) console.log(`  pop ${r.id} ${q.t.toFixed(3)} ${q.id} ${q.j} ${q.ctx}`);
  const i = process.argv.indexOf('--json');
  if (i > 0) require('fs').writeFileSync(process.argv[i + 1], JSON.stringify(rows.map(r => ({ id: r.id, name: r.name, glass: r.glass, recs: r.recs, popsN: r.popsN })), null, 1));
}
