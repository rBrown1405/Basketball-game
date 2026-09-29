#!/usr/bin/env node
// Are two gameplay audit runs (tools/audit/run.js) the same games? Every game record compared field by field (all but
// the timing fields ms and wallMs): the frames, every shot, catch, rebound, the players' positions sampled 10 times a
// second, the play tracking.
//   node tools/audio/test/cmp_audit.js <audit dir A> <audit dir B>
'use strict';
const fs = require('fs'), path = require('path');
const [da, db] = process.argv.slice(2);
if (!da || !db) { console.log('usage: node tools/audio/test/cmp_audit.js <audit dir A> <audit dir B>'); process.exit(2); }
const load = (d) => JSON.parse(fs.readFileSync(path.join(d, 'games.json'), 'utf8'));
const A0 = load(da), B0 = load(db);
const strip = (r) => { const o = Object.assign({}, r); delete o.ms; delete o.wallMs; return JSON.stringify(o); };
const bySeed = (L) => Object.fromEntries(L.games.map((r) => [r.seed, r]));
const A = bySeed(A0), B = bySeed(B0);
let same = 0, diff = 0;
console.log(`${A0.label || da}  vs  ${B0.label || db}`);
for (const s of Object.keys(A).sort((x, y) => x - y)) {
  const ra = A[s], rb = B[s];
  if (!rb) { console.log(`seed ${s}: missing in ${db}`); diff++; continue; }
  const eq = strip(ra) === strip(rb);
  if (eq) same++; else diff++;
  let first = '';
  if (!eq) for (const k of Object.keys(ra)) if (k !== 'ms' && k !== 'wallMs' && JSON.stringify(ra[k]) !== JSON.stringify(rb[k])) { first = ` (first different field: ${k})`; break; }
  console.log(`seed ${s}: ${eq ? 'same' : 'DIFFERENT' + first}  score ${ra.score} / ${rb.score}  possessions ${ra.poss} / ${rb.poss}  frames ${ra.frames} / ${rb.frames}  shots ${ra.shots.length} / ${rb.shots.length}`);
}
console.log(`${same} the same, ${diff} different`);
process.exit(diff ? 1 : 0);
