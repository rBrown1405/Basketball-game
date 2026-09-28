/* Pro BBALL Coach: play tracking and analytics (Phase 5).
 * The engine (js/core/sim.js) logs every possession: how it was played (a called play, flow with no call,
 * transition), for a called play which one, how far into it the offense got and, when it broke down, at which step
 * and why (a denied pass, a blown screen, a switch, the help, the shot clock, a turnover), and the outcome (points,
 * the shot and its quality, a turnover, a foul), with the defense's scheme and pick-and-roll coverage. This module
 * keeps the tallies: per game (in the box score) and per team per season (S.playStats, regular season and playoffs),
 * archived in each team's history when the season ends, and turns them into what the screens show: each play's usage,
 * points per possession, completion rate, shot quality and most common breakdown point; points per possession by how
 * it was played; points allowed per possession by defensive scheme and coverage. It only counts: nothing in a game
 * changes with it. */
(function () {
  'use strict';
  const PBC = window.PBC;
  const U = PBC.U;
  const PS = {};

  // a play's tally, an array (compact in the save): calls, points while it was on, completed (got to its read in
  // time), early reads among those, turnovers, fouls drawn (on the shot or before it), resets (look passed up), field
  // goal attempts and makes (a missed shot on a shooting foul is not an attempt), expected points of the looks x100,
  // open / contested / tight looks, the head coach's calls, clutch calls, breakdowns, counters (the offense went to
  // another read than the play's main option), inbounds that only got the ball in (the possession's points go to the
  // play: out-of-bounds possessions are counted whole), looks (every shot the play got, fouled or not)
  const F = { n: 0, pts: 1, done: 2, early: 3, to: 4, foul: 5, reset: 6, sh: 7, made: 8, xp: 9, open: 10, cont: 11, tight: 12, user: 13, cl: 14, brk: 15, ctr: 16, safe: 17, looks: 18 };
  const NF = 19;
  PS.F = F;
  /** why a called play broke down: [label, what it means] */
  PS.BRK = {
    deny: ['Denied pass', 'the defense denied or jumped the pass the play needed'],
    screen: ['Blown screen', 'the screen got no one open: the defense went over, under or through it, or it was illegal'],
    switch: ['Defense switched', 'a switch took the action away'],
    help: ['Help defense', 'the help, a double team or the zone closed it'],
    clock: ['Shot clock', 'the play ran out of time: a forced late shot or a violation'],
    to: ['Turnover', 'a lost ball, a travel or an offensive foul'],
    contest: ['Well defended', 'the play got to its read but the look was covered'],
  };
  /** how a called play ended */
  PS.OUT = { made: 'Made shot', miss: 'Missed shot', ft: 'Fouled on the shot', foul: 'Fouled', to: 'Turnover', reset: 'Reset', safety: 'Ball in safely', end: 'Clock ran out', other: 'Other' };
  /** how a possession was played */
  PS.KIND = { call: 'Called play', flow: 'Flow (no call)', trans: 'Transition', other: 'Other' };

  // a team's tally (a game or a season): gp, possessions and points; k: possessions by how they were played
  // ({call|flow|trans|other: [n, pts]}); fl: flow by the engine's action ({pnr: [n, pts]}); p: plays ({id: tally});
  // b: breakdowns ({id: {'step|why': n}}); vc: the calls by the ball-screen coverage the defense played on them
  // ({cov: [n, pts]}); on defense: d: half-court possessions by scheme ({scheme: [n, pts]}), c: by pick-and-roll coverage
  // within man ({cov: [n, pts]}), dt: transition [n, pts]
  PS.empty = () => ({ gp: 0, poss: 0, pts: 0, k: {}, fl: {}, p: {}, b: {}, vc: {}, d: {}, c: {}, dt: [0, 0] });
  const add2 = (o, k, pts) => { if (k == null) return; const a = o[k] || (o[k] = [0, 0]); a[0]++; a[1] += pts; };

  /** a possession (the engine's log entry): the offense's side and the defense's */
  PS.addPoss = function (off, def, e) {
    off.poss++; off.pts += e.pts;
    add2(off.k, e.k, e.pts);
    if (e.k === 'flow') add2(off.fl, e.f, e.pts);
    if (e.k === 'trans') { def.dt[0]++; def.dt[1] += e.pts; }
    else if (e.k === 'call' || e.k === 'flow') { add2(def.d, e.d, e.pts); if (e.v && e.v !== 'zone') add2(def.c, e.v, e.pts); }
  };
  /** a called play (the engine's record, closed at the end of the possession) */
  PS.addCall = function (agg, r) {
    const a = agg.p[r.id] || (agg.p[r.id] = new Array(NF).fill(0));
    while (a.length < NF) a.push(0);
    const pts = (r.spts != null ? r.spts : r.pts) || 0;
    a[F.n]++; a[F.pts] += pts;
    if (r.done) { a[F.done]++; if (r.early) a[F.early]++; }
    if (r.out === 'to') a[F.to]++;
    else if (r.out === 'foul' || r.out === 'ft') a[F.foul]++;
    else if (r.out === 'reset') a[F.reset]++;
    else if (r.out === 'safety') a[F.safe]++;
    if (r.q) {
      a[F.looks]++;
      if (!r.fouledShot) { a[F.sh]++; if (r.made) a[F.made]++; }
      a[F.xp] += Math.round((r.xp || 0) * 100);
      a[r.q === 'open' ? F.open : r.q === 'tight' ? F.tight : F.cont]++;
    }
    if (r.user) a[F.user]++;
    if (r.cl) a[F.cl]++;
    if (r.ctr) a[F.ctr]++;
    // (the coverage the defense played on the call; an inbound that only got the ball in is left out: the coverage
    // was played on the call after it)
    if (r.cov && r.out !== 'safety') add2(agg.vc, r.cov, pts);
    if (r.brk) {
      a[F.brk]++;
      const b = agg.b[r.id] || (agg.b[r.id] = {}), k = r.brk[0] + '|' + r.brk[1];
      b[k] = (b[k] || 0) + 1;
    }
  };
  /** one tally into another (a game into the season) */
  PS.merge = function (into, from) {
    if (!from) return into;
    into.gp += from.gp || 0; into.poss += from.poss || 0; into.pts += from.pts || 0;
    const m2 = (A, B) => { for (const k in B) { const a = A[k] || (A[k] = [0, 0]); a[0] += B[k][0]; a[1] += B[k][1]; } };
    into.vc = into.vc || {};
    m2(into.k, from.k); m2(into.fl, from.fl); m2(into.d, from.d); m2(into.c, from.c); m2(into.vc, from.vc || {});
    into.dt[0] += from.dt[0]; into.dt[1] += from.dt[1];
    for (const id in from.p) {
      const a = into.p[id] || (into.p[id] = new Array(NF).fill(0)), b = from.p[id];
      while (a.length < NF) a.push(0);
      for (let i = 0; i < NF; i++) a[i] += b[i] || 0;
    }
    for (const id in from.b) {
      const a = into.b[id] || (into.b[id] = {});
      for (const k in from.b[id]) a[k] = (a[k] || 0) + from.b[id][k];
    }
    return into;
  };

  // ------------------------------------------------------------ the season
  /** this season's tallies: S.playStats = { season, rs: { tid: tally }, po: { tid: tally } } */
  PS.season = function (S) {
    if (!S.playStats || S.playStats.season !== S.season) S.playStats = { season: S.season, rs: {}, po: {} };
    return S.playStats;
  };
  /** a finished game into the season's tallies (both teams) */
  PS.addBox = function (S, box) {
    if (!box || !box.plays) return;
    const st = PS.season(S), bucket = box.playoff ? st.po : st.rs;
    box.teams.forEach((T, i) => {
      const g = box.plays[i];
      if (!g) return;
      const agg = bucket[T.tid] || (bucket[T.tid] = PS.empty());
      PS.merge(agg, Object.assign({}, g, { gp: 1 }));
    });
  };
  const histOf = (S, tid, season) => { const t = S.teams[tid]; return t && t.history ? t.history.find((x) => x.season === season) : null; };
  /** the tallies of a team for a season ('rs' or 'po'; a past season from its archive) */
  PS.team = function (S, tid, season, po) {
    if (season == null || season === S.season) {
      const st = PS.season(S);
      return (po ? st.po : st.rs)[tid] || null;
    }
    const h = histOf(S, tid, season), c = h ? (po ? h.playsPo : h.plays) : null;
    return c ? PS.expand(c) : null;
  };
  /** are there playoff numbers for this team and season? (this season: always a choice; past ones: archived) */
  PS.hasPo = function (S, tid, season) {
    if (season == null || season === S.season) return true;
    const h = histOf(S, tid, season);
    return !!(h && h.playsPo);
  };
  /** the seasons a team has play numbers for (this one first) */
  PS.seasons = function (S, tid) {
    const t = S.teams[tid], out = [S.season];
    for (const h of (t && t.history) || []) if (h.plays && !out.includes(h.season)) out.push(h.season);
    return out.sort((a, b) => b - a);
  };
  /**
   * The season into each team's history when it ends (Season.endSeason): the user's team keeps every play with its
   * three most common breakdowns (the regular season and the playoffs), the others their 10 most-called plays with the
   * most common one (the regular season), and the defense.
   */
  PS.archive = function (S) {
    const st = PS.season(S);
    for (const t of S.teams) {
      const agg = st.rs[t.id], pa = st.po[t.id];
      const h = t.history && t.history.find((x) => x.season === S.season);
      if (!h) continue;
      const mine = t.id === S.userTid;
      if (agg) h.plays = mine ? PS.compact(agg, 999, 3) : PS.compact(agg, 10, 1);
      if (mine && pa && pa.poss) h.playsPo = PS.compact(pa, 999, 3);
    }
  };
  /** a tally for the archive: the top `keep` plays, each play's breakdowns cut to its `nb` most common */
  PS.compact = function (agg, keep, nb) {
    const ids = Object.keys(agg.p).sort((a, b) => agg.p[b][F.n] - agg.p[a][F.n]).slice(0, keep);
    const out = { gp: agg.gp, poss: agg.poss, pts: agg.pts, k: agg.k, fl: agg.fl, vc: agg.vc, d: agg.d, c: agg.c, dt: agg.dt, p: {}, b: {} };
    for (const id of ids) {
      out.p[id] = agg.p[id].slice();
      const b = agg.b[id];
      if (b) { out.b[id] = {}; for (const k of Object.keys(b).sort((x, y) => b[y] - b[x]).slice(0, nb || 3)) out.b[id][k] = b[k]; }
    }
    return out;
  };
  PS.expand = (c) => Object.assign(PS.empty(), JSON.parse(JSON.stringify(c)));

  // ------------------------------------------------------------ the numbers the screens show
  const pct = (a, b) => (b ? (100 * a) / b : null);
  /** the most common breakdown of a play: the step it happened at most (and the reason there), the reason overall */
  PS.topBreak = function (bmap) {
    if (!bmap) return null;
    const byStep = {}, byWhy = {};
    let n = 0;
    for (const k in bmap) {
      const [s, w] = k.split('|'), c = bmap[k];
      n += c;
      const bs = byStep[s] || (byStep[s] = { n: 0, why: {} });
      bs.n += c; bs.why[w] = (bs.why[w] || 0) + c;
      byWhy[w] = (byWhy[w] || 0) + c;
    }
    if (!n) return null;
    const step = Object.keys(byStep).sort((a, b) => byStep[b].n - byStep[a].n)[0];
    const ws = byStep[step].why, why = Object.keys(ws).sort((a, b) => ws[b] - ws[a])[0];
    const whyAll = Object.keys(byWhy).sort((a, b) => byWhy[b] - byWhy[a])[0];
    return { step: +step, stepN: byStep[step].n, why, whyN: ws[why], whyAll, whyAllN: byWhy[whyAll], n, byWhy };
  };
  /** one play's line: usage, points per possession, completion, shot quality, breakdowns */
  PS.row = function (agg, id) {
    const a = agg.p[id];
    if (!a) return null;
    const n = a[F.n], sh = a[F.sh], looks = a[F.looks] || sh;
    return {
      id, n, pts: a[F.pts], ppp: n ? a[F.pts] / n : null, done: pct(a[F.done], n), early: pct(a[F.early], n), to: pct(a[F.to], n),
      foul: pct(a[F.foul], n), reset: pct(a[F.reset], n), sh, looks, fg: pct(a[F.made], sh), xps: looks ? a[F.xp] / 100 / looks : null,
      open: pct(a[F.open], looks), tight: pct(a[F.tight], looks), user: a[F.user], cl: a[F.cl], brk: a[F.brk], ctr: pct(a[F.ctr] || 0, n), safe: a[F.safe] || 0, top: PS.topBreak(agg.b[id]),
    };
  };
  /** every play of a tally, most called first */
  PS.rows = function (agg) {
    if (!agg) return [];
    return Object.keys(agg.p).map((id) => PS.row(agg, id)).filter(Boolean).sort((a, b) => b.n - a.n || (b.ppp || 0) - (a.ppp || 0));
  };
  /** the whole tally's summary: points per possession overall and by how it was played, breakdowns by reason */
  PS.summary = function (agg) {
    if (!agg) return null;
    const k = (x) => agg.k[x] || [0, 0];
    let calls = 0, done = 0, brk = 0, looks = 0, xp = 0;
    const why = {};
    for (const id in agg.p) { const a = agg.p[id]; calls += a[F.n]; done += a[F.done]; brk += a[F.brk]; looks += a[F.looks] || a[F.sh]; xp += a[F.xp]; }
    for (const id in agg.b) for (const key in agg.b[id]) { const w = key.split('|')[1]; why[w] = (why[w] || 0) + agg.b[id][key]; }
    let dn = 0, dp = 0;
    for (const s in agg.d) { dn += agg.d[s][0]; dp += agg.d[s][1]; }
    return {
      gp: agg.gp, poss: agg.poss, ppp: agg.poss ? agg.pts / agg.poss : null,
      call: k('call'), flow: k('flow'), trans: k('trans'), other: k('other'),
      calls, done: pct(done, calls), brk, xps: looks ? xp / 100 / looks : null, why,
      dHalf: [dn, dp], dTrans: agg.dt,
    };
  };
  /** the league's points per call by play family this season (for "vs league") */
  PS.league = function (S, po) {
    const st = PS.season(S), bucket = po ? st.po : st.rs, fam = {};
    for (const tid in bucket) {
      const agg = bucket[tid];
      for (const id in agg.p) {
        const pl = PBC.Playbook && PBC.Playbook.get(id);
        const f = pl ? pl.family : 'other', a = fam[f] || (fam[f] = [0, 0]);
        a[0] += agg.p[id][F.n]; a[1] += agg.p[id][F.pts];
      }
    }
    const def = {};
    for (const tid in bucket) for (const s in bucket[tid].d) { const a = def[s] || (def[s] = [0, 0]); a[0] += bucket[tid].d[s][0]; a[1] += bucket[tid].d[s][1]; }
    return { fam, def };
  };

  PBC.PlayStats = PS;
})();
