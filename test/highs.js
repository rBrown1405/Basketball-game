const PBC = require('./harness');
const S = PBC.League.create({ leagueKey: 'men', seed: Number(process.argv[2] || 9) });
let c40 = 0, c45 = 0, c50 = 0, c60 = 0, max = 0, games = 0, reb20 = 0, ast15 = 0;
const byPlayer = {};
for (const sg of S.schedule) {
  const g = PBC.Sim.createGame(S, sg.h, sg.a, { gid: sg.gid, lite: true, noInjuries: true });
  PBC.Sim.simulate(g);
  const box = PBC.Sim.box(g);
  games++;
  for (const T of box.teams) for (const p of T.players) {
    if (p.pts >= 40) c40++; if (p.pts >= 45) c45++; if (p.pts >= 50) c50++; if (p.pts >= 60) c60++;
    if (p.orb + p.drb >= 20) reb20++; if (p.ast >= 15) ast15++;
    max = Math.max(max, p.pts);
    if (p.pts >= 40) byPlayer[p.name] = (byPlayer[p.name] || 0) + 1;
  }
}
console.log({ games, c40, c45, c50, c60, max, reb20, ast15 });
console.log(Object.entries(byPlayer).sort((a, b) => b[1] - a[1]).slice(0, 8));
