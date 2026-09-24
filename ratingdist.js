const PBC = require('./harness');
const S = PBC.League.create({ leagueKey: process.argv[2] || 'men', seed: 9 });
const act = Object.values(S.players).filter(p => p.tid >= 0);
for (const k of ['three', 'mid', 'layup', 'dunk', 'close', 'post', 'handle', 'pass', 'perD', 'block', 'dreb']) {
  const v = act.map(p => p.r[k]);
  console.log(k.padEnd(7), '>=95:', v.filter(x => x >= 95).length, ' >=90:', v.filter(x => x >= 90).length, ' >=85:', v.filter(x => x >= 85).length, ' avg', (v.reduce((a, b) => a + b) / v.length).toFixed(1));
}
const top = act.sort((a, b) => b.ovr - a.ovr).slice(0, 5);
for (const p of top) console.log(p.last, p.pos, p.ovr, JSON.stringify(p.r));
