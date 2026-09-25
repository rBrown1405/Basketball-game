const PBC = require('./harness');
const S = PBC.League.create({ leagueKey: 'men', seed: Number(process.argv[2] || 9) });
for (const sg of S.schedule) {
  const g = PBC.Sim.createGame(S, sg.h, sg.a, { gid: sg.gid, lite: true, noInjuries: true });
  PBC.Sim.simulate(g); const box = PBC.Sim.box(g); sg.played = true; sg.hs = box.hs; sg.as = box.as;
  PBC.Stats.applyBox(S, box);
}
const l = PBC.Stats.leaders(S, 'ppg', 12);
for (const x of l) {
  const s = x.s, g = s.gp;
  const T = S.teams[x.p.tid];
  console.log(`${x.p.last.padEnd(10)} ${x.p.pos} ovr${x.p.ovr} ${T.strat.off.padEnd(12)} goTo1=${T.strat.goTo1 === x.p.id ? 'Y' : 'n'} | ${(s.pts/g).toFixed(1)} ppg  ${(s.min/g).toFixed(1)} mpg  FGA ${(s.fga/g).toFixed(1)} FG% ${(s.fgm/s.fga*100).toFixed(1)}  3PA ${(s.tpa/g).toFixed(1)} 3P% ${(s.tpm/s.tpa*100).toFixed(1)}  FTA ${(s.fta/g).toFixed(1)}  TS ${(PBC.Stats.ts(s)*100).toFixed(1)} | 3pt ${x.p.r.three} mid ${x.p.r.mid} lay ${x.p.r.layup} dnk ${x.p.r.dunk} drf ${x.p.r.drawFoul}`);
}
