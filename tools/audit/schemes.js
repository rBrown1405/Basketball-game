// What each defensive scheme is worth in the engine (docs/ADJUST_NOTES.md): the home team plays scheme s all season, no
// adjustments anywhere; 'base' is every team's own.
//   node tools/audit/schemes.js <men|women> <base,blitz,...> [seasons]
const PBC = require('../../test/harness');
const league = process.argv[2] || 'men', list = (process.argv[3] || 'base').split(','), reps = +(process.argv[4] || 1);
for (const s of list) {
  let n = 0, margin = 0, oppP = 0, oppPoss = 0, own = 0;
  for (let rep = 0; rep < reps; rep++) {
    const S = PBC.League.create({ leagueKey: league, seed: 31 + rep });
    for (const sg of S.schedule) {
      const g = PBC.Sim.createGame(S, sg.h, sg.a, { gid: sg.gid, lite: true, noInjuries: true });
      g.adj = false;
      if (s !== 'base') g.t[0].strat.def = s;
      PBC.Sim.simulate(g);
      n++; margin += g.score[0] - g.score[1]; oppP += g.score[1]; oppPoss += g.t[1].poss;
    }
  }
  console.log(`${league} ${s.padEnd(9)} home margin ${(margin / n).toFixed(2)}  opp ppp ${(oppP / oppPoss).toFixed(3)}`);
}
