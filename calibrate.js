const PBC = require('./harness');
const U = PBC.U;
const leagueKey = process.argv[2] || 'men';
const t0 = Date.now();
PBC.Sim.debug = {};
const S = PBC.League.create({ leagueKey, seed: Number(process.argv[3] || 7) });
console.log('league created in', Date.now() - t0, 'ms; players', Object.keys(S.players).length, 'games', S.schedule.length, 'days', S.numDays);
// OVR distribution
const active = Object.values(S.players).filter(p => p.tid >= 0).sort((a, b) => b.ovr - a.ovr);
const buckets = [95, 90, 85, 80, 75, 70, 65, 60, 0];
const counts = buckets.map((b, i) => active.filter(p => p.ovr >= b && (i === 0 || p.ovr < buckets[i - 1])).length);
console.log('OVR buckets', buckets.map((b, i) => `${b}+:${counts[i]}`).join(' '));
console.log('top 12:', active.slice(0, 12).map(p => `${p.last} ${p.pos} ${p.ovr}/${p.pot} a${p.age}`).join(' | '));
const strengths = S.teams.map(t => PBC.League.teamStrength(S, t.id)).sort((a, b) => b - a);
console.log('team strength range', strengths[0].toFixed(1), strengths[strengths.length - 1].toFixed(1));
// simulate every game in the schedule
const tot = {}; let games = 0, ot = 0, poss = 0;
const t1 = Date.now();
const S2 = S;
for (const sg of S.schedule) {
  const g = PBC.Sim.createGame(S2, sg.h, sg.a, { gid: sg.gid, lite: true, noInjuries: true });
  PBC.Sim.simulate(g);
  const box = PBC.Sim.box(g);
  sg.played = true; sg.hs = box.hs; sg.as = box.as;
  PBC.Stats.applyBox(S2, box);
  games++;
  if (box.ot) ot++;
  for (const T of box.teams) { for (const k of ['pts','fgm','fga','tpm','tpa','ftm','fta','orb','drb','ast','stl','blk','tov','pf','poss']) tot[k] = (tot[k] || 0) + T[k]; }
}
const n = games * 2;
const per = k => (tot[k] / n).toFixed(1);
console.log(`simulated ${games} games in ${Date.now() - t1} ms  (OT games ${(ot / games * 100).toFixed(1)}%)`);
console.log(`PTS ${per('pts')}  POSS ${per('poss')}  FGA ${per('fga')}  FG% ${(tot.fgm / tot.fga * 100).toFixed(1)}  3PA ${per('tpa')}  3P% ${(tot.tpm / tot.tpa * 100).toFixed(1)}  FTA ${per('fta')}  FT% ${(tot.ftm / tot.fta * 100).toFixed(1)}`);
console.log(`ORB ${per('orb')}  DRB ${per('drb')}  REB ${((tot.orb + tot.drb) / n).toFixed(1)}  AST ${per('ast')}  STL ${per('stl')}  BLK ${per('blk')}  TOV ${per('tov')}  PF ${per('pf')}   OREB% ${(tot.orb / (tot.orb + tot.drb) * 100).toFixed(1)}  AST/FGM ${(tot.ast / tot.fgm * 100).toFixed(1)}%`);
// leaders
for (const k of ['ppg', 'rpg', 'apg', 'spg', 'bpg', 'tpp', 'mpg']) {
  const l = PBC.Stats.leaders(S2, k, 5);
  console.log(k.padEnd(4), l.map(x => `${x.p.last}(${x.p.pos},${x.p.ovr}) ${k === 'tpp' ? x.val.toFixed(3) : x.val.toFixed(1)}`).join(' | '));
}
// distribution of scoring
const ppg = Object.values(S2.players).map(p => PBC.Stats.season(p, S2.season, false)).filter(s => s && s.gp > 40).map(s => s.pts / s.gp).sort((a, b) => b - a);
console.log('PPG dist:', [1, 10, 30, 60, 100, 150].filter(i => ppg[i - 1] != null).map(i => `#${i} ${ppg[i - 1].toFixed(1)}`).join(' '));
const st = PBC.League.sorted(S2, null);
console.log('best record', st[0].w + '-' + st[0].l, 'worst', st[st.length - 1].w + '-' + st[st.length - 1].l);
// correlation strength vs win%
const xs = S2.teams.map(t => PBC.League.teamStrength(S2, t.id)), ys = S2.teams.map(t => { const r = PBC.League.standings(S2)[t.id]; return r.w / r.gp; });
const mx = U.avg(xs), my = U.avg(ys);
const cov = U.sum(xs.map((x, i) => (x - mx) * (ys[i] - my))), vx = U.sum(xs.map(x => (x - mx) ** 2)), vy = U.sum(ys.map(y => (y - my) ** 2));
console.log('strength-win corr', (cov / Math.sqrt(vx * vy)).toFixed(3), ' slope win%/pt', (cov / vx).toFixed(4));
if (PBC.Sim.debug) {
  const d = PBC.Sim.debug; const tot = Object.values(d).reduce((a, z) => a + z[1], 0);
  console.log('zones:', Object.keys(d).map(k => `${k} ${(d[k][1] / tot * 100).toFixed(1)}% fg ${(d[k][0] / d[k][1] * 100).toFixed(1)} blk ${(d[k][2] / d[k][1] * 100).toFixed(1)} foul ${(d[k][3] / d[k][1] * 100).toFixed(1)}`).join(' | '));
}
