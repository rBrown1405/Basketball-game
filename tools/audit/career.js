// A headless career: N seasons with a stand-in coach who answers the Desk, the offseason automated (and a new job
// taken if the coach is fired). Reports per season: the time, what landed on the Desk and what stopped the sim, the
// room's numbers (chemistry, fans, the media, the owner's trust, promises), and the save's size; the totals at the end.
// Exits 1 if anything threw.
//
//   node tools/audit/career.js --seasons 20 --seed 7 --answers random --league men --out audit/career
//
// --answers: random (any answer but the ones that open a screen), first (always the first), default (never answers:
// everything runs out and gets the staff's answer). --stop important|all|never: what would stop the sim (counted).
'use strict';
const path = require('path'), fs = require('fs');

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) { const k = a.slice(2); const v = process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : 'true'; args[k] = v; }
}
const N = +(args.seasons || 20), seed = +(args.seed || 7), mode = args.answers || 'random', league = args.league || 'men';
const OUT = args.out ? path.resolve(args.out) : null;

const errors = [];
const keep = console.warn, keepErr = console.error;
console.warn = (...a) => { errors.push(a.map(x => (x && x.stack ? x.stack.split('\n').slice(0, 3).join(' | ') : String(x))).join(' ')); };
console.error = console.warn;
process.on('uncaughtException', e => { keepErr('UNCAUGHT', e); process.exit(1); });

const PBC = require('../../test/harness');
const U = PBC.U;

const t0 = Date.now();
const S = PBC.League.create({ leagueKey: league, seed });
S.saveId = 'audit-career-' + seed;
const START = 5;
S.userTid = START;
PBC.Coach.create(S, 'Audit Coach', START);
PBC.League.preseasonProjections(S);
PBC.AI.autoRotation(S, START);
S.teams[START].rot.auto = true;
S.settings.deskStop = args.stop || 'important';

const R = PBC.Desk.makeRng(U.hash('career-answers|' + seed));
const NAV_ONLY = new Set(['counter', 'call', 'look', 'deal']);
function choose(it) {
  if (mode === 'default' || !it.opts.length) return null;
  if (mode === 'first') return it.opts[0].k;
  const ok = it.opts.filter(o => !NAV_ONLY.has(o.k));
  return (ok.length ? R.pick(ok) : it.opts[0]).k;
}
const navs = {};
function answerAll() {
  const D = PBC.Desk.ensure(S);
  for (const it of D.items.slice()) {
    if (it.done) continue;
    if (it.kind === 'message') { PBC.Desk.dismiss(S, it.id); continue; }
    // the stand-in coach lets some offers run out, as people do
    if (it.kind === 'offer' && R() < 0.4) continue;
    const k = choose(it);
    if (k == null) continue;
    const res = PBC.Desk.answer(S, it.id, k);
    if (res && res.nav) navs[res.nav.screen] = (navs[res.nav.screen] || 0) + 1;
  }
}
function employed() {
  const c = S.coach;
  if (c.pendingFire) PBC.Coach.fireNow(S);
  if (c.status === 'unemployed') {
    const offers = c.jobOffers && c.jobOffers.length ? c.jobOffers : PBC.Coach.jobOffers(S);
    if (offers.length) { PBC.Coach.acceptJob(S, offers[0]); PBC.AI.autoRotation(S, S.userTid); S.teams[S.userTid].rot.auto = true; return 'hired by ' + S.teams[S.userTid].abbr; }
  }
  return '';
}

const rows = [];
const tplTotal = {};
console.log(`career: ${N} seasons, ${league}, seed ${seed}, answers ${mode}, stop ${S.settings.deskStop} (created in ${Date.now() - t0} ms)`);
for (let k = 0; k < N; k++) {
  const ts = Date.now();
  const season = S.season;
  const seq0 = S.desk ? S.desk.seq : 0;
  if (S.phase === 'preseason') { PBC.Desk.poke(S); answerAll(); PBC.Season.startRegularSeason(S); }
  let stops = 0, days = 0, guard = 0;
  while ((S.phase === 'regular' || S.phase === 'playin' || S.phase === 'playoffs' || S.phase === 'postseason_done') && guard++ < 700) {
    PBC.Season.prepareToday(S);
    if (PBC.Desk.shouldStop(S)) stops++;
    answerAll();
    PBC.Season.simDay(S);
    days++;
    if (S.phase === 'postseason_done') PBC.Season.finishPostseason(S);
    const e = employed();
    if (e) console.log(`  (mid-season: fired, ${e})`);
  }
  const tSeason = Date.now() - ts;
  answerAll();
  const c = S.coach;
  const rec = c.seasons.slice(-1)[0] || {};
  const review = c.lastReview || {};
  const D = S.desk;
  const own = D.own && D.own.season === season ? D.own.v : 0;
  const to = Date.now();
  // the offseason, answering as it goes
  if (S.phase === 'awards') PBC.Offseason.begin(S);
  answerAll();
  if (S.phase === 'draft_lottery') PBC.Offseason.startDraft(S);
  answerAll();
  PBC.Offseason.autoAll(S);
  answerAll();
  const hired = employed();
  const tOff = Date.now() - to;
  const log = D.log.filter(l => l.s === season);
  const byT = {};
  const made = D.seq - seq0;
  const kinds = { decision: 0, offer: 0, message: 0 };
  for (const it of D.items) if (it.id > seq0) { kinds[it.kind]++; byT[it.t] = (byT[it.t] || 0) + 1; tplTotal[it.t] = (tplTotal[it.t] || 0) + 1; }
  const chems = S.teams.map(t => PBC.Desk.chem(S, t.id));
  const json = JSON.stringify(S);
  const row = {
    season, ms: tSeason, offMs: tOff, days, made, kinds, answered: log.filter(l => !l.a).length, auto: log.filter(l => l.a).length, stops,
    w: rec.w, l: rec.l, result: rec.result, goalMet: rec.met, verdict: review.verdict, security: c.security, deskTrust: own,
    chem: U.round(PBC.Desk.chem(S, S.userTid), 1), chemMin: U.round(Math.min(...chems), 1), chemAvg: U.round(U.avg(chems), 1), chemMax: U.round(Math.max(...chems), 1),
    fans: S.teams[S.userTid].hype, media: D.media, fo: Object.assign({}, S.fo || {}), mb: U.round(json.length / 1e6, 2), deskKb: Math.round(JSON.stringify(D).length / 1024),
    team: S.teams[S.userTid].abbr, hired, top: Object.entries(byT).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([t, n]) => t + ' ' + n).join(', '),
  };
  rows.push(row);
  console.log(`${season} ${row.team} ${row.w}-${row.l} ${row.result || ''}${row.goalMet ? ' (goal met)' : ''} · ${row.verdict || ''} · ${(tSeason / 1000).toFixed(1)}s + ${tOff}ms` +
    ` · desk ${made} (${kinds.decision}d ${kinds.offer}o ${kinds.message}m), answered ${row.answered}, ran out ${row.auto}, stop-days ${stops}` +
    ` · chem ${row.chem} [${row.chemMin}..${row.chemAvg}..${row.chemMax}] fans ${row.fans} media ${row.media} trust ${row.security} (desk ${own >= 0 ? '+' : ''}${own})` +
    ` · word ${row.fo.kept || 0}/${row.fo.broken || 0} · save ${row.mb} MB (desk ${row.deskKb} KB)${hired ? ' · ' + hired : ''}`);
  console.log(`   ${row.top}`);
}
const avg = f => U.round(U.avg(rows, f), 1);
console.log(`\nper season: ${avg(r => r.ms / 1000)} s, desk items ${avg(r => r.made)} (decisions ${avg(r => r.kinds.decision)}, offers ${avg(r => r.kinds.offer)}, messages ${avg(r => r.kinds.message)}), stop-days ${avg(r => r.stops)}`);
console.log('every situation over the career:', Object.entries(tplTotal).sort((a, b) => b[1] - a[1]).map(([t, n]) => t + ' ' + n).join(', '));
const never = PBC.Desk.T.filter(t => !tplTotal[t.id]).map(t => t.id);
console.log('never came up:', never.join(', ') || '(none)');
console.log('screens opened by answers:', JSON.stringify(navs));
console.log(`save after ${N} seasons: ${rows.length ? rows[rows.length - 1].mb : 0} MB`);
console.warn = keep; console.error = keepErr;
if (errors.length) { console.log(`\n${errors.length} ERRORS/WARNINGS:`); for (const e of errors.slice(0, 30)) console.log('  ' + e); }
if (OUT) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'career.json'), JSON.stringify({ args: { seasons: N, seed, mode, league, stop: S.settings.deskStop }, rows, tplTotal, never, navs, errors }, null, 1));
}
process.exit(errors.length ? 1 : 0);
