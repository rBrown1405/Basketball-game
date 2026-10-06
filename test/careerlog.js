// Career data check: every game log line against its box score, best games kept in order, an older save's logs rebuilt by
// Stats.catchUp, and a second load that changes nothing. node test/careerlog.js [days]
const PBC = require('./harness');
const DAYS = +(process.argv[2] || 25);
const S = PBC.League.create({ leagueKey: 'men', seed: 7 });
S.saveId = 'lc'; S.userTid = 3;
PBC.Coach.create(S, 'Test Coach', 3);
PBC.League.preseasonProjections(S);
PBC.AI.autoRotation(S, 3); S.teams[3].rot.auto = true;
const answer = () => { const D = PBC.Desk.ensure(S); for (const it of D.items.slice()) { if (it.done) continue; if (it.kind === 'message') { PBC.Desk.dismiss(S, it.id); continue; } if (it.opts.length) PBC.Desk.answer(S, it.id, it.opts[0].k); } };
PBC.Desk.poke(S); answer(); PBC.Season.startRegularSeason(S);
for (let d = 0; d < DAYS; d++) { PBC.Season.prepareToday(S); answer(); PBC.Season.simDay(S); }
const L = PBC.Stats.GL_LEN;
let bad = 0, lines = 0, checked = 0;
for (const p of Object.values(S.players)) for (const k in p.glog || {}) { if (p.glog[k].length % L) bad++; lines += p.glog[k].length / L; }
console.log('GL_LEN', L, 'lines', lines, 'bad lengths', bad);
// every game of the user's team against its box score
for (const b of Object.values(S.boxes)) for (let side = 0; side < 2; side++) {
  const T = b.teams[side], O = b.teams[1 - side];
  for (const pl of T.players) {
    if (pl.dnp) continue;
    const p = S.players[pl.pid];
    const g = PBC.Stats.gameLog(p, S.season).find(x => x.day === b.day && x.opp === O.tid);
    checked++;
    if (!g) { bad++; console.log('missing', p.id, b.day); continue; }
    for (const k of ['min', 'pts', 'fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta', 'orb', 'drb', 'ast', 'stl', 'blk', 'tov', 'pf', 'pm']) if (g[k] !== Math.min(k === 'pts' ? 4095 : 63, Math.round(pl[k]))) { bad++; console.log('field', k, g[k], pl[k]); }
    if (g.tm !== T.tid || g.home !== (side === 0) || g.ts !== T.pts || g.os !== O.pts || g.win !== (T.pts > O.pts) || g.gs !== !!pl.gs) { bad++; console.log('meta', JSON.stringify(g)); }
  }
}
console.log('box lines checked', checked, 'mismatches', bad);
// best games
let bestN = 0, unsorted = 0;
for (const p of Object.values(S.players)) { const b = p.best || []; bestN += b.length; for (let i = 1; i < b.length; i++) if (b[i][2] > b[i - 1][2]) unsorted++; }
const top = Object.values(S.players).filter(p => p.best && p.best.length).sort((a, b) => b.best[0][2] - a.best[0][2])[0];
console.log('players with best games', Object.values(S.players).filter(p => p.best && p.best.length).length, 'entries', bestN, 'unsorted', unsorted, 'top', PBC.Player.name(top), JSON.stringify(PBC.Stats.bestGames(top)[0]));
// catch-up: an older save had no logs, highs or best games
const json = JSON.parse(PBC.Store.serialize(S));
const before = {};
for (const id in json.players) { const p = json.players[id]; if (p.glog) before[id] = p.glog[S.season]; delete p.glog; delete p.hi; delete p.best; p.awards = p.awards.filter(a => !['ptsTitle', 'mvpVote', 'hof', 'numRetired'].includes(a.type)); }
const S2 = PBC.Store.migrate(json);
let rebuilt = 0, same = 0, other = 0;
for (const id in S2.players) {
  const p = S2.players[id];
  if (!p.glog) continue;
  rebuilt++;
  const mine = PBC.Stats.gameLog(p, S.season).filter(g => g.tm === S.userTid || g.opp === S.userTid);
  const orig = PBC.Stats.gameLog(Object.assign({}, p, { glog: { [S.season]: before[id] } }), S.season).filter(g => g.tm === S.userTid || g.opp === S.userTid);
  if (JSON.stringify(mine) === JSON.stringify(orig)) same++; else other++;
}
console.log('catch-up: players with a rebuilt log', rebuilt, 'same as the live log', same, 'different', other);
const S3 = PBC.Store.migrate(JSON.parse(PBC.Store.serialize(S2)));
let dup = 0; for (const id in S3.players) if (JSON.stringify(S3.players[id].glog) !== JSON.stringify(S2.players[id].glog) || S3.players[id].awards.length !== S2.players[id].awards.length) dup++;
console.log('second load changes', dup);
