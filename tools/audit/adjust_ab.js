// The coaches' in-game adjustments, A/B (docs/ADJUST_NOTES.md): adjustments for the home team only ('home'), for nobody
// ('none'), for the away team only ('away'), over whole seasons of quick-simmed games.
//   node tools/audit/adjust_ab.js <men|women> <home|none|away> [seasons] [parts off, comma separated: schemes,fouls,trans,pace,press,ato,hack] [seed]
// argv[5]: parts switched off (Adjust.on keys, comma separated)
const PBC = require('../../test/harness');
const league = process.argv[2] || 'men', mode = process.argv[3] || 'home', reps = +(process.argv[4] || 1);
const off = (process.argv[5] || '').split(',').filter(Boolean);
for (const k of off) PBC.Adjust.on[k] = false;
const seed0 = +(process.argv[6] || 21);
let n = 0, margin = 0, hw = 0, pts = 0, poss = 0, m2 = 0;
for (let rep = 0; rep < reps; rep++) {
  const S = PBC.League.create({ leagueKey: league, seed: seed0 + rep });
  for (const sg of S.schedule) {
    const g = PBC.Sim.createGame(S, sg.h, sg.a, { gid: sg.gid, lite: true, noInjuries: true });
    if (mode === 'none') g.adj = false;
    else if (mode === 'home') g.t[1].adj = null;
    else if (mode === 'away') g.t[0].adj = null;
    PBC.Sim.simulate(g);
    const m = g.score[0] - g.score[1];
    n++; margin += m; m2 += m * m; if (m > 0) hw++;
    pts += g.score[0] + g.score[1]; poss += g.t[0].poss + g.t[1].poss;
  }
}
const mean = margin / n, se = Math.sqrt((m2 / n - mean * mean) / n);
console.log(`${league} ${mode} off=${off.join('+') || '-'}: ${n} games, home margin ${mean.toFixed(2)} ±${se.toFixed(2)}, home win% ${(hw / n * 100).toFixed(1)}, pts/team ${(pts / n / 2).toFixed(1)}, ppp ${(pts / poss).toFixed(3)}`);
