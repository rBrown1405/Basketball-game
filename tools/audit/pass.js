// Trial 10 proof: the pass and the catch. Two-body scenarios on the game's own code (the Director's passBall and
// afterCatch, the pass clips, the receiver's catch), staged the way the choreographer stages a pass (choreo.js p_pass:
// the passer turns to the catch spot, winds up and lets it go at the clip's release; the receiver goes to the catch
// spot and turns to the passer), each pass measured by the game's own pass meter (debug.js, Meters._pass): how long
// before the ball got there the receiver's hands were set and the eyes on it, the palms' gap at the catch, the ball in
// the hands or forearms, how hard it stopped, how far its flight was bent off its own path, the passer's hands on it
// through the throw and its jolt as it left them.
//   node tools/audit/pass.js [--json out.json]
// Used by check.js.
'use strict';
const { load, seedRandom } = require('./load');
const H8 = require('./handle');

// (the scenarios and their staging are the game's own, js/match/passlab.js, shared with the Animation Lab's "Passing (two
// players)" group)
let PBC0 = null;
const scenarios = (PBC) => (PBC || PBC0 || (PBC0 = load(3).PBC)).Match.PassLab.scenarios();

/** one scenario with the game's own meters */
function run(PBC, sc) {
  const M = PBC.Match, dt = 1 / 60;
  // (each scenario on its own random stream, seeded by its name: sharing one, a change to one scenario moved the ones after it)
  let hsh = 7; for (let i = 0; i < sc.name.length; i++) hsh = (hsh * 31 + sc.name.charCodeAt(i)) >>> 0;
  seedRandom(hsh);
  const { W, a, ball } = H8.world(PBC, [{ team: 0 }, { team: 0 }]);
  const clock = { t: 0 };
  const ev = [];
  const at = (t, fn) => { ev.push({ t, fn }); ev.sort((p, q) => p.t - q.t); };
  const PL = M.PassLab, c = { M, p: a[0], r: a[1], b: ball, at, D: PL.director(W, () => clock.t, at) };
  c.stage = (from, to, o) => PL.stagePass(c, from, to, o);
  c.hold = (who) => { who.ballHold = 'chest'; const hp = who.heldBallPos([0, 0, 0]); ball.x = hp[0]; ball.y = hp[1]; ball.z = hp[2]; ball.give(who, 'chest'); };
  sc.setup(c);
  for (const x of a) x.solve();
  const mt = new M.Debug.Meters(() => ({ people: W.list, ball, time: W.time, view: null, dt, countAll: true }));
  for (let n = 1; n * dt <= sc.T + 1e-9; n++) {
    const t = Math.round(n * dt * 1200) / 1200;
    clock.t = t; W.time = t;
    while (ev.length && ev[0].t <= t + 1e-9) ev.shift().fn();
    for (const x of a) x.update(dt, t);
    ball.update(dt, t);
    for (const x of a) x.solve();
    mt.frame();
  }
  const S = mt.summary();
  const pops = S.motion.jointSnapsBy, armPops = Object.entries(pops).filter(([k]) => /HD|EL/.test(k)).reduce((p, [, v]) => p + v, 0);
  return { name: sc.name, pass: S.pass, recs: mt.S.ps.recs, pops, armPops, holder: ball.holder ? ball.holder.id : null, state: ball.state };
}

module.exports = { scenarios, run, stagePass: (c, from, to, o) => c.M.PassLab.stagePass(c, from, to, o), director: (M, W, clock, at) => M.PassLab.director(W, () => clock.t, at) };

if (require.main === module) {
  const { PBC } = load(3);
  const rows = PBC.Match.PassLab.scenarios().map(sc => run(PBC, sc));
  const f = (v, k) => (v == null ? '-' : v[k] == null ? '-' : v[k]);
  for (const r of rows) {
    console.log(r.name + `  (ends: ${r.state}${r.holder != null ? ' with ' + r.holder : ''}; arm pops ${r.armPops})`);
    for (const x of r.recs) {
      console.log(`  ${x.kind || '?'} ${x.from}->${x.to} ${x.caught ? 'caught' : 'NOT CAUGHT'} flight ${x.flightS} s: hands set ${f(x, 'setS')} s before, eyes on ${f(x, 'eyeS')} s before; gap at the catch ${f(x, 'gapNearIn')} / ${f(x, 'gapFarIn')} in; ` +
        `in the hands ${x.thruFrames} frames (worst ${x.thruWorstIn} in), forearms after ${f(x, 'thruAfterFrames')}; stop ${f(x, 'stopFtps2')} ft/s^2; bent ${x.bentIn} in; passer's hands ${x.passGapIn} in; release ${x.releaseFtps2} ft/s^2`);
    }
  }
  const i = process.argv.indexOf('--json');
  if (i > 0) require('fs').writeFileSync(process.argv[i + 1], JSON.stringify(rows.map(r => ({ name: r.name, pass: r.pass, recs: r.recs, armPops: r.armPops })), null, 1));
}
