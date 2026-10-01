// What a matchup order is worth (docs/ADJUST_NOTES.md): the home team puts it on the away team's best player (sag: on
// the starter with the worst three-point rating) all season, nobody adjusts.
//   node tools/audit/orders.js <none|deny|double|sag|force> [seasons]
const PBC = require('../../test/harness');
const mode = process.argv[2] || 'none', reps = +(process.argv[3] || 1);
let n = 0, margin = 0, tp = 0, tfga = 0, opp = 0, m2 = 0;
for (let rep = 0; rep < reps; rep++) {
  const S = PBC.League.create({ leagueKey: 'men', seed: 41 + rep });
  for (const sg of S.schedule) {
    const g = PBC.Sim.createGame(S, sg.h, sg.a, { gid: sg.gid, lite: true, noInjuries: true });
    g.adj = false;
    const O = g.t[1];
    const scorer = (c) => c.r.three * 0.4 + c.r.mid * 0.2 + c.r.layup * 0.2 + c.r.post * 0.2;
    const star = O.players.reduce((a, c) => (!a || c.p.ovr > a.p.ovr ? c : a), null);
    const poor = O.players.filter(c => c.starter).reduce((a, c) => (!a || c.r.three < a.r.three ? c : a), null);
    const target = mode === 'sag' ? poor : star;
    if (mode !== 'none') PBC.Sim.setOrders(g, 0, { [target.id]: mode });
    PBC.Sim.simulate(g);
    const m = g.score[0] - g.score[1];
    n++; margin += m; m2 += m * m; tp += target.st.pts; tfga += target.st.fga; opp += g.score[1];
  }
}
const mean = margin / n;
console.log(`${mode.padEnd(7)} home margin ${mean.toFixed(2)} ±${Math.sqrt((m2 / n - mean * mean) / n).toFixed(2)}  target pts ${(tp / n).toFixed(1)} fga ${(tfga / n).toFixed(1)}  opp pts ${(opp / n).toFixed(1)}`);
