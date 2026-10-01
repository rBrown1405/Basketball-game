/* Pro BBALL Coach — the league's history: the all-time greats, the Hall of Fame, retired numbers, the all-decade teams
 * and the career records as they fall (PBC.Legacy). No DOM.
 *
 * The greatest-player score is built the way the all-time debates are: titles and MVPs first, then Finals MVPs,
 * All-League teams (first team counts most), All-Star picks, Defensive Player of the Year, All-Defense, the rookie
 * award, then career production (points, rebounds, assists, stocks), playoff production and a peak (the best three
 * seasons). A franchise's version only counts what a player did there. Coaches come from PBC.Staff.
 *
 * Every summer (the offseason begins): a Hall of Fame class (players three seasons after they retire, coaches a season
 * after; the best four at most), franchises retire the numbers of their icons who just retired, and last season's
 * all-time ranks are kept so the screens can show who is climbing.
 *
 *   S.legacy = { v, hof: [Entry], numbers: { [tid]: [{ num, pid, season, name }] }, prev: { pid: rank }, leaders: { stat: { pid, val } } }
 *   Entry    = { id, kind: 'player' | 'coach', season, name, pid, cid, tid, pos, score, first, years, honors, line, coach } */
(function () {
  'use strict';
  const PBC = (window.PBC = window.PBC || {});
  const U = PBC.U;
  const L = (PBC.Legacy = PBC.Legacy || {});

  L.V = 1;
  // the Hall's bars (players, coaches) and the class size
  L.HOF_BAR = 40;
  L.COACH_BAR = 40;
  L.COACH_SEASONS = 8;
  L.CLASS_MAX = 4;
  L.WAIT = 3;
  // a franchise retires a number: its own legacy score with the team and seasons there
  L.NUMBER_BAR = 26;
  L.NUMBER_SEASONS = 7;
  // the all-time leaders worth a story once they are passed
  L.LEADER_MIN = { pts: 20000, reb: 9000, ast: 6000, tpm: 2000, stl: 1500, blk: 1500 };

  L.ensure = function (S) {
    let g = S.legacy;
    if (!g || typeof g !== 'object' || g.v !== L.V) g = S.legacy = Object.assign({ hof: [], numbers: {}, prev: {}, leaders: {} }, g && typeof g === 'object' ? g : {}, { v: L.V });
    return g;
  };

  // ---------------------------------------------------------------------------
  // Scoring
  // ---------------------------------------------------------------------------
  const W = { champion: 6, mvp: 7, fmvp: 3.5, dpoy: 3, allStar: 1.2, allDefense: 0.7, roy: 1, smoy: 0.6, mip: 0.4 };
  const AL = { 1: 3.5, 2: 2.2, 3: 1.3 };
  /** a player's honors: counts by award type (allLeague as 1st, 2nd, 3rd); tid scopes to one franchise */
  L.honors = function (S, p, tid) {
    const h = { champion: 0, mvp: 0, fmvp: 0, dpoy: 0, allStar: 0, allDefense: 0, roy: 0, smoy: 0, mip: 0, al1: 0, al2: 0, al3: 0 };
    for (const a of p.awards || []) {
      if (tid != null && teamIn(p, a.season) !== tid) continue;
      if (a.type === 'allLeague') { const n = /^1/.test(a.detail) ? 1 : /^2/.test(a.detail) ? 2 : 3; h['al' + n]++; }
      else if (h[a.type] != null) h[a.type]++;
    }
    return h;
  };
  function teamIn(p, season) {
    let tid = p.tid;
    for (const s of p.stats) if (s.season === season) tid = s.tid;
    return tid;
  }
  L.teamIn = teamIn;
  function sum(rows) {
    const o = PBC.Stats.emptyLine();
    for (const r of rows) for (const k of PBC.Stats.FIELDS) o[k] += r[k] || 0;
    o.reb = o.orb + o.drb;
    return o;
  }
  /** everything the lists need about one player: { p, score, c (career), cp (playoffs), h (honors), seasons, years, teams } */
  L.profile = function (S, p, tid) {
    const mine = s => tid == null || s.tid === tid;
    const reg = p.stats.filter(s => !s.po && mine(s)), po = p.stats.filter(s => s.po && mine(s));
    if (!reg.length && !po.length) return null;
    const c = sum(reg), cp = sum(po);
    const h = L.honors(S, p, tid);
    // the peak: the best three seasons by game score per game (at least 40 games)
    const per = U.sortBy(reg.filter(s => s.gp >= 40).map(s => PBC.Stats.gmsc(s) / s.gp), x => x, true).slice(0, 3);
    const peak = per.length ? U.avg(per, x => x) : 0;
    let score = 0;
    for (const k in W) score += (h[k] || 0) * W[k];
    score += h.al1 * AL[1] + h.al2 * AL[2] + h.al3 * AL[3];
    score += c.pts / 1800 + c.reb / 1600 + c.ast / 1100 + (c.stl + c.blk) / 600 + cp.pts / 900 + cp.gp / 60 + Math.max(0, peak - 12) * 0.45;
    const seasons = U.uniq(reg.map(r => r.season));
    const teams = U.uniq(p.stats.filter(mine).map(s => s.tid));
    return { p, score: U.round(score, 2), c, cp, h, peak: U.round(peak, 1), seasons: seasons.length, years: seasons.length ? [Math.min(...seasons), Math.max(...seasons)] : null, teams };
  };
  L.playerScore = (S, p, tid) => { const x = L.profile(S, p, tid); return x ? x.score : 0; };

  /** the greatest players: opts { pos, tid (a franchise), status: 'active' | 'retired', n } */
  L.greats = function (S, opts) {
    opts = opts || {};
    const out = [];
    for (const id in S.players) {
      const p = S.players[id];
      if (p.tid === -2 || !p.stats.length) continue;
      if (opts.pos && p.pos !== opts.pos) continue;
      if (opts.status === 'active' && p.tid < 0) continue;
      if (opts.status === 'retired' && p.tid !== -3) continue;
      const x = L.profile(S, p, opts.tid);
      if (x && x.score > 0.5) out.push(x);
    }
    out.sort((a, b) => b.score - a.score);
    return out.slice(0, opts.n || 50);
  };
  L.inHall = (S, id) => !!(S.legacy && S.legacy.hof.some(e => e.id === id));

  // ---------------------------------------------------------------------------
  // The summer (Off.begin): the Hall of Fame class, retired numbers, the ranks to climb
  // ---------------------------------------------------------------------------
  L.summer = function (S, retiredNow) {
    const g = L.ensure(S);
    const cls = L.induct(S);
    const nums = L.retireNumbers(S, retiredNow || []);
    // last season's all-time top 100, for the climbers
    g.prev = {};
    L.greats(S, { n: 100 }).forEach((x, i) => { g.prev[x.p.id] = i + 1; });
    g.prevSeason = S.season;
    return { cls, nums };
  };

  L.induct = function (S) {
    const g = L.ensure(S);
    if (g.flags && g.flags['hof:' + S.season]) return [];
    (g.flags = g.flags || {})['hof:' + S.season] = true;
    const cand = [];
    for (const id in S.players) {
      const p = S.players[id];
      if (p.tid !== -3 || !p.retired || S.season - p.retired.season < L.WAIT || L.inHall(S, 'p:' + p.id)) continue;
      const x = L.profile(S, p);
      if (x && x.score >= L.HOF_BAR) cand.push({ kind: 'player', x, score: x.score });
    }
    if (PBC.Staff && S.coaches) for (const c of Object.values(S.coaches.list)) {
      if (c.tid !== -3 || c.retired == null || S.season - c.retired < 1 || L.inHall(S, 'c:' + c.id)) continue;
      // a real career on the bench (eight seasons), unless a dynasty's worth of titles came sooner
      if ((c.tot.seasons || 0) < L.COACH_SEASONS && (c.tot.titles || 0) < 3) continue;
      const sc = PBC.Staff.score(c.tot);
      if (sc >= L.COACH_BAR) cand.push({ kind: 'coach', c, score: sc });
    }
    const cls = U.sortBy(cand, x => x.score, true).slice(0, L.CLASS_MAX);
    const out = [];
    for (const k of cls) {
      if (k.kind === 'player') {
        const x = k.x, p = x.p;
        const team = U.maxBy(x.teams, tid => p.stats.filter(s => s.tid === tid && !s.po).length);
        const e = { id: 'p:' + p.id, kind: 'player', season: S.season, name: PBC.Player.name(p), pid: p.id, tid: team, pos: p.pos, score: x.score,
          first: S.season - p.retired.season === L.WAIT, years: x.years, honors: x.h,
          line: { gp: x.c.gp, pts: x.c.pts, reb: x.c.reb, ast: x.c.ast, ppg: x.c.gp ? U.round(x.c.pts / x.c.gp, 1) : 0, rpg: x.c.gp ? U.round(x.c.reb / x.c.gp, 1) : 0, apg: x.c.gp ? U.round(x.c.ast / x.c.gp, 1) : 0 } };
        g.hof.push(e); out.push(e);
        if (PBC.Coach && PBC.Coach.seasonsCoached && PBC.Coach.seasonsCoached(S, p) >= 5) PBC.Coach.unlock(S, 'hof_player');
      } else {
        const c = k.c;
        const team = U.maxBy(U.uniq(c.seasons.map(s => s.tid)), tid => c.seasons.filter(s => s.tid === tid).length);
        const e = { id: 'c:' + c.id, kind: 'coach', season: S.season, name: PBC.Staff.name(c), cid: c.id, tid: team, score: U.round(k.score, 2), first: S.season - c.retired === 1,
          years: c.seasons.length ? [c.seasons[0].season, c.seasons[c.seasons.length - 1].season] : null, coach: Object.assign({}, c.tot) };
        g.hof.push(e); out.push(e);
      }
    }
    if (out.length) {
      if (PBC.Media && PBC.Media.offseason) PBC.Media.offseason(S, 'hof', { pid: out.find(e => e.pid != null) ? out.find(e => e.pid != null).pid : null, tids: U.uniq(out.map(e => e.tid)).slice(0, 4), pri: 4, data: { list: out.map(e => ({ kind: e.kind, pid: e.pid, cid: e.cid, name: e.name, tid: e.tid, first: e.first, line: e.line, coach: e.coach, honors: e.honors })) } });
      if (PBC.Season) PBC.Season.news(S, `🏛️ The Hall of Fame class of ${S.season}: ${out.map(e => e.name).join(', ')}.`, 'award', -1);
    }
    return out;
  };

  /** franchises retire the numbers of the icons who just retired (their legacy there, and long enough there) */
  L.retireNumbers = function (S, pids) {
    const g = L.ensure(S);
    const out = [];
    for (const pid of pids) {
      const p = S.players[pid];
      if (!p) continue;
      for (const tid of U.uniq(p.stats.map(s => s.tid))) {
        const seasons = U.uniq(p.stats.filter(s => s.tid === tid && !s.po).map(s => s.season)).length;
        if (seasons < L.NUMBER_SEASONS) continue;
        const sc = L.playerScore(S, p, tid);
        if (sc < L.NUMBER_BAR) continue;
        const num = p.numHist && p.numHist[tid] != null ? p.numHist[tid] : (p.retired && p.retired.tid === tid ? p.num : null);
        if (num == null) continue;
        const list = g.numbers[tid] || (g.numbers[tid] = []);
        if (list.some(x => x.num === num)) continue;
        const e = { num, pid: p.id, season: S.season, name: PBC.Player.name(p) };
        list.push(e);
        out.push(Object.assign({ tid }, e));
        if (PBC.Media && PBC.Media.offseason) PBC.Media.offseason(S, 'number', { tid, pid: p.id, pri: tid === S.userTid ? 4 : 3, data: { num, seasons, score: sc } });
        if (PBC.Season) PBC.Season.news(S, `👕 The ${S.teams[tid].city} ${S.teams[tid].name} will retire No. ${num} for ${PBC.Player.name(p)}.`, 'award', tid);
        if (tid === S.userTid && PBC.Coach && PBC.Coach.seasonsCoached(S, p) >= 5) PBC.Coach.unlock(S, 'number_retired');
      }
    }
    return out;
  };
  /** the numbers a franchise has retired (Player.assignNumber leaves them alone) */
  L.retiredNums = (S, tid) => (S.legacy && S.legacy.numbers[tid] ? S.legacy.numbers[tid].map(x => x.num) : []);

  /** the season's end: every active player's number with his team, kept for the day it is retired */
  L.endSeason = function (S) {
    for (const id in S.players) {
      const p = S.players[id];
      if (p.tid < 0) continue;
      const h = p.numHist || (p.numHist = {});
      if (h[p.tid] == null) h[p.tid] = p.num;
    }
  };

  // ---------------------------------------------------------------------------
  // The save over decades: retired players keep what history needs
  // ---------------------------------------------------------------------------
  /** the summer's cleanup: retired players drop what only the living use; the long-forgotten (a short career, no honors,
   *  no Hall, never a coach) leave the save eight seasons after they retire. Returns { trimmed, removed }. */
  L.compact = function (S) {
    let trimmed = 0, removed = 0;
    const keepIds = new Set();
    for (const h of S.history || []) {
      const aw = h.awards || {};
      for (const k of ['mvp', 'dpoy', 'roy', 'smoy', 'mip']) if (aw[k] != null) keepIds.add(aw[k]);
      for (const k of ['allLeague', 'allDefense']) for (const five of aw[k] || []) for (const pid of five) keepIds.add(pid);
      for (const pid of aw.allRookie || []) keepIds.add(pid);
      for (const k in aw.leaders || {}) if (aw.leaders[k] && aw.leaders[k].pid != null) keepIds.add(aw.leaders[k].pid);
      if (h.fmvp != null) keepIds.add(h.fmvp);
    }
    for (const id in S.players) {
      const p = S.players[id];
      if (p.tid !== -3 || !p.retired) continue;
      const out = S.season - p.retired.season;
      if (out >= 1 && p.hist && p.hist.length > 1) { p.hist = p.hist.slice(-1); trimmed++; }
      if (out >= 1) for (const k of ['train', 'scout', 'promise', 'tradeReq', 'lowWeeks', 'deskTalk', 'deskShop', 'deskOneMore', 'summer', 'conf', 'seasonStart']) if (k in p) delete p[k];
      if (out < 8 || keepIds.has(p.id) || p.coachId != null || L.inHall(S, 'p:' + p.id) || (p.awards && p.awards.length)) continue;
      let gp = 0;
      for (const s of p.stats) if (!s.po) gp += s.gp;
      if (gp >= 250) continue;
      delete S.players[id];
      removed++;
    }
    return { trimmed, removed };
  };

  // ---------------------------------------------------------------------------
  // Career records as they fall (Media.game asks after every game)
  // ---------------------------------------------------------------------------
  const STAT = { pts: s => s.pts, reb: s => (s.orb || 0) + (s.drb || 0), ast: s => s.ast, tpm: s => s.tpm, stl: s => s.stl, blk: s => s.blk };
  L.STAT = STAT;
  /** the all-time leader in each stat (regular season), recomputed weekly */
  L.refreshLeaders = function (S) {
    const g = L.ensure(S);
    const best = {};
    for (const id in S.players) {
      const p = S.players[id];
      if (!p.stats.length) continue;
      const t = {};
      for (const s of p.stats) if (!s.po) for (const k in STAT) t[k] = (t[k] || 0) + STAT[k](s);
      for (const k in STAT) if (!best[k] || t[k] > best[k].val) best[k] = { pid: p.id, val: t[k] };
    }
    g.leaders = best;
    return best;
  };
  /** did p just become the all-time leader in a stat? returns [{ stat, val, prev: { pid, val } }] */
  L.passed = function (S, p, tonight) {
    const g = S.legacy;
    if (!g || !g.leaders) return [];
    const out = [];
    const c = PBC.Stats.career(p, false);
    const tot = { pts: c.pts, reb: (c.orb || 0) + (c.drb || 0), ast: c.ast, tpm: c.tpm, stl: c.stl, blk: c.blk };
    const crowned = g.crowned || (g.crowned = {});
    for (const k in STAT) {
      const lead = g.leaders[k];
      if (!lead || lead.pid === p.id || tot[k] <= lead.val || tot[k] < L.LEADER_MIN[k]) continue;
      if (tot[k] - (tonight[k] || 0) > lead.val) continue;   // (already past before tonight)
      g.leaders[k] = { pid: p.id, val: tot[k] };
      // the story is told once per player and record (two stars passing each other back and forth is one story)
      if (crowned[k + ':' + p.id]) continue;
      crowned[k + ':' + p.id] = S.season;
      out.push({ stat: k, val: tot[k], prev: { pid: lead.pid, val: lead.val } });
    }
    return out;
  };

  // ---------------------------------------------------------------------------
  // The all-decade teams (from the awards in the history)
  // ---------------------------------------------------------------------------
  /** decades with at least one completed season: [{ decade: 2030, label, seasons, first: [pids], second: [pids] }] */
  L.decades = function (S) {
    const by = {};
    for (const h of S.history || []) {
      const d = Math.floor(h.season / 10) * 10;
      (by[d] = by[d] || []).push(h);
    }
    const out = [];
    for (const d of Object.keys(by).map(Number).sort((a, b) => b - a)) {
      const pts = {};
      const add = (pid, v) => { if (pid != null) pts[pid] = (pts[pid] || 0) + v; };
      for (const h of by[d]) {
        const aw = h.awards || {};
        (aw.allLeague || []).forEach((five, i) => five.forEach(pid => add(pid, [5, 3, 2][i] || 1)));
        add(aw.mvp, 6); add(aw.dpoy, 1.5); add(h.fmvp, 3);
        for (const pid of (aw.allDefense || [])[0] || []) add(pid, 0.8);
      }
      const ranked = U.sortBy(Object.keys(pts).map(Number).filter(pid => S.players[pid]), pid => pts[pid], true);
      const bucket = p => (p.pos === 'PG' || p.pos === 'SG' ? 'G' : p.pos === 'C' ? 'C' : 'F');
      const used = new Set();
      const team = () => {
        const need = { G: 2, F: 2, C: 1 }, five = [];
        for (const pid of ranked) { if (used.has(pid)) continue; const b = bucket(S.players[pid]); if (need[b] > 0) { need[b]--; five.push(pid); used.add(pid); } if (five.length === 5) break; }
        return five;
      };
      const seasons = by[d].map(h => h.season);
      out.push({ decade: d, label: `${d}s`, seasons: [Math.min(...seasons), Math.max(...seasons)], complete: seasons.length >= 10, first: team(), second: team(), pts });
    }
    return out;
  };
})();
