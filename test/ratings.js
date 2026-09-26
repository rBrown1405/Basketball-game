const PBC = require('./harness');
const U = PBC.U, C = PBC.Config;
const S = PBC.League.create({ leagueKey: process.argv[2] || 'men', seed: 7 });
const rot = [];
for (const t of S.teams) {
  const r = PBC.League.roster(S, t.id);
  for (const p of r) { const m = t.rot.minutes[p.id] || 0; if (m > 0) rot.push({ p, m }); }
}
const wavg = k => U.sum(rot, x => x.p.r[k] * x.m) / U.sum(rot, x => x.m);
console.log('minutes-weighted rating averages (rotation players):');
console.log(C.RATING_KEYS.map(k => `${k}:${wavg(k).toFixed(1)}`).join('  '));
// handler skill for PGs
const pgs = rot.filter(x => x.p.pos === 'PG');
console.log('PG handle', U.avg(pgs, x => x.p.r.handle).toFixed(1), 'pass', U.avg(pgs, x => x.p.r.pass).toFixed(1));
// raw ovr percentiles
const all = Object.values(S.players).filter(p => p.tid >= 0);
function raw(p) {
  const w = C.OVR_W[p.pos]; let s = 0, tw = 0;
  for (const k in w) { s += w[k] * p.r[k]; tw += w[k]; }
  const keys = Object.keys(w).filter(k => w[k] >= 3).map(k => p.r[k]).sort((a, b) => b - a);
  return 0.72 * s / tw + 0.28 * (keys[0] + keys[1] + keys[2] + keys[3]) / 4;
}
const raws = all.map(raw).sort((a, b) => b - a);
for (const i of [0, 4, 11, 29, 69, 149, 249, 349, 449]) console.log('rank', i + 1, 'raw', raws[i].toFixed(1));
