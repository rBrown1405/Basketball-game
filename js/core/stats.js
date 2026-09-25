/* Pro BBALL Coach — stats accumulation, leaders, records, awards. */
(function () {
  'use strict';
  const PBC = (window.PBC = window.PBC || {});
  const U = PBC.U;

  const Stats = {};
  const FIELDS = ['gp', 'gs', 'min', 'pts', 'fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta', 'orb', 'drb', 'ast', 'stl', 'blk', 'tov', 'pf', 'pm', 'dd', 'td'];
  Stats.FIELDS = FIELDS;

  Stats.emptyLine = () => { const o = {}; for (const f of FIELDS) o[f] = 0; return o; };
  Stats.emptyTeamSeason = () => ({ gp: 0, w: 0, l: 0, pts: 0, opp: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, orb: 0, drb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0, oFgm: 0, oFga: 0, oTpm: 0, oTpa: 0, oFta: 0, oTov: 0, oOrb: 0, oDrb: 0, poss: 0 });

  /** Get (or create) a player's season stat row */
  Stats.row = function (p, season, tid, po) {
    let r = p.stats.find(s => s.season === season && s.tid === tid && !!s.po === !!po);
    if (!r) {
      r = Object.assign({ season, tid, po: !!po }, Stats.emptyLine(), { hiPts: 0, hiReb: 0, hiAst: 0 });
      p.stats.push(r);
    }
    return r;
  };

  Stats.reb = s => (s.orb || 0) + (s.drb || 0);
  Stats.per = (s, k) => (s.gp ? s[k] / s.gp : 0);
  Stats.gmsc = s => s.pts + 0.4 * s.fgm - 0.7 * s.fga - 0.4 * (s.fta - s.ftm) + 0.7 * s.orb + 0.3 * s.drb + s.stl + 0.7 * s.ast + 0.7 * s.blk - 0.4 * s.pf - s.tov;
  Stats.ts = s => (s.fga + 0.44 * s.fta > 0 ? s.pts / (2 * (s.fga + 0.44 * s.fta)) : 0);

  /** Current-season (regular or playoff) line for a player, merged across teams if traded */
  Stats.season = function (p, season, po) {
    const rows = p.stats.filter(s => s.season === season && !!s.po === !!po);
    if (!rows.length) return null;
    if (rows.length === 1) return rows[0];
    const m = Object.assign({ season, tid: rows[rows.length - 1].tid, po: !!po, hiPts: 0, hiReb: 0, hiAst: 0 }, Stats.emptyLine());
    for (const r of rows) {
      for (const f of FIELDS) m[f] += r[f];
      m.hiPts = Math.max(m.hiPts, r.hiPts || 0); m.hiReb = Math.max(m.hiReb, r.hiReb || 0); m.hiAst = Math.max(m.hiAst, r.hiAst || 0);
    }
    m.multi = rows.length;
    return m;
  };

  Stats.career = function (p, po) {
    const m = Object.assign({ seasons: 0 }, Stats.emptyLine());
    const seasons = new Set();
    for (const r of p.stats) {
      if (!!r.po !== !!po) continue;
      for (const f of FIELDS) m[f] += r[f];
      seasons.add(r.season);
    }
    m.seasons = seasons.size;
    return m;
  };

  // ---------------------------------------------------------------------------
  // Apply a finished box score to players, teams and records
  // ---------------------------------------------------------------------------
  Stats.applyBox = function (S, box) {
    const po = !!box.playoff;
    for (let side = 0; side < 2; side++) {
      const T = box.teams[side], O = box.teams[1 - side];
      if (!po) {
        const ts = S.teamSeason[T.tid] || (S.teamSeason[T.tid] = Stats.emptyTeamSeason());
        ts.gp++;
        if (T.pts > O.pts) ts.w++; else ts.l++;
        ts.pts += T.pts; ts.opp += O.pts;
        for (const k of ['fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta', 'orb', 'drb', 'ast', 'stl', 'blk', 'tov', 'pf']) ts[k] += T[k];
        ts.oFgm += O.fgm; ts.oFga += O.fga; ts.oTpm += O.tpm; ts.oTpa += O.tpa; ts.oFta += O.fta; ts.oTov += O.tov; ts.oOrb += O.orb; ts.oDrb += O.drb;
        ts.poss += T.poss || 0;
      }
      for (const pl of T.players) {
        if (pl.dnp) continue;
        const p = S.players[pl.pid];
        if (!p) continue;
        const r = Stats.row(p, box.season, T.tid, po);
        r.gp++; if (pl.gs) r.gs++;
        for (const k of ['min', 'pts', 'fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta', 'orb', 'drb', 'ast', 'stl', 'blk', 'tov', 'pf', 'pm']) r[k] += pl[k];
        const reb = pl.orb + pl.drb;
        const cats = [pl.pts, reb, pl.ast, pl.stl, pl.blk].filter(x => x >= 10).length;
        if (cats >= 2) r.dd++;
        if (cats >= 3) r.td++;
        r.hiPts = Math.max(r.hiPts || 0, pl.pts); r.hiReb = Math.max(r.hiReb || 0, reb); r.hiAst = Math.max(r.hiAst || 0, pl.ast);
        Stats.checkGameRecords(S, p, pl, T.tid, O.tid, box);
      }
      Stats.checkTeamGameRecord(S, T, O, box);
    }
  };

  // ---------------------------------------------------------------------------
  // Records (top-10 lists)
  // ---------------------------------------------------------------------------
  const GAME_CATS = [['pts', 'Points'], ['reb', 'Rebounds'], ['ast', 'Assists'], ['stl', 'Steals'], ['blk', 'Blocks'], ['tpm', '3-Pointers Made']];
  Stats.GAME_CATS = GAME_CATS;

  function ensureRecords(S) {
    if (!S.records) S.records = { game: {}, teamGame: { pts: [], margin: [] }, franchise: {} };
    return S.records;
  }
  function pushTop(list, entry, n) {
    n = n || 10;
    if (list.length >= n && entry.val <= list[list.length - 1].val) return false;
    list.push(entry);
    list.sort((a, b) => b.val - a.val);
    if (list.length > n) list.length = n;
    return list.includes(entry);
  }

  Stats.checkGameRecords = function (S, p, pl, tid, oppTid, box) {
    const R = ensureRecords(S);
    const vals = { pts: pl.pts, reb: pl.orb + pl.drb, ast: pl.ast, stl: pl.stl, blk: pl.blk, tpm: pl.tpm };
    const fr = R.franchise[tid] || (R.franchise[tid] = { game: {}, teamGame: { pts: [] } });
    for (const [k] of GAME_CATS) {
      const v = vals[k];
      if (v <= 0) continue;
      const entry = { val: v, pid: p.id, name: PBC.Player.name(p), tid, opp: oppTid, season: box.season, gid: box.gid, po: !!box.playoff };
      const lg = R.game[k] || (R.game[k] = []);
      const newLeague = pushTop(lg, entry);
      const fl = fr.game[k] || (fr.game[k] = []);
      pushTop(fl, Object.assign({}, entry));
      if (newLeague && lg[0] === entry && lg.length >= 10 && (S.history.length > 0 || S.day >= 40)) {
        PBC.Season && PBC.Season.news(S, `🏆 LEAGUE RECORD! ${PBC.Player.name(p)} sets a single-game record with ${v} ${GAME_CATS.find(c => c[0] === k)[1].toLowerCase()}.`, 'record', tid);
      }
    }
  };

  Stats.checkTeamGameRecord = function (S, T, O, box) {
    const R = ensureRecords(S);
    const e = { val: T.pts, tid: T.tid, opp: O.tid, season: box.season, gid: box.gid };
    pushTop(R.teamGame.pts, e);
    const fr = R.franchise[T.tid] || (R.franchise[T.tid] = { game: {}, teamGame: { pts: [] } });
    pushTop(fr.teamGame.pts, Object.assign({}, e));
    if (T.pts > O.pts) pushTop(R.teamGame.margin, { val: T.pts - O.pts, tid: T.tid, opp: O.tid, season: box.season, gid: box.gid, score: `${T.pts}-${O.pts}` });
  };

  /** Season records (per-game averages & totals) computed from all player stat rows */
  Stats.seasonRecords = function (S, tid) {
    const minGp = Math.max(5, Math.round(S.seasonGames * 0.7));
    const cats = [
      ['ppg', 'Points per game', s => s.pts / s.gp], ['rpg', 'Rebounds per game', s => (s.orb + s.drb) / s.gp],
      ['apg', 'Assists per game', s => s.ast / s.gp], ['spg', 'Steals per game', s => s.stl / s.gp], ['bpg', 'Blocks per game', s => s.blk / s.gp],
      ['pts', 'Total points', s => s.pts], ['tpm', 'Three-pointers made', s => s.tpm],
    ];
    const out = {};
    for (const [k, label, f] of cats) out[k] = { label, list: [] };
    for (const p of Object.values(S.players)) {
      for (const s of p.stats) {
        if (s.po || s.gp < minGp) continue;
        if (tid != null && s.tid !== tid) continue;
        if (s.season === S.season && S.phase === 'regular') continue; // in-progress season excluded
        for (const [k, , f] of cats) out[k].list.push({ val: f(s), pid: p.id, name: PBC.Player.name(p), season: s.season, tid: s.tid });
      }
    }
    for (const k in out) { out[k].list.sort((a, b) => b.val - a.val); out[k].list.length = Math.min(10, out[k].list.length); }
    return out;
  };

  Stats.careerRecords = function (S, tid) {
    const cats = [['pts', 'Points'], ['reb', 'Rebounds'], ['ast', 'Assists'], ['stl', 'Steals'], ['blk', 'Blocks'], ['tpm', '3-Pointers'], ['gp', 'Games']];
    const out = {};
    for (const [k, label] of cats) out[k] = { label, list: [] };
    for (const p of Object.values(S.players)) {
      let rows = p.stats.filter(s => !s.po && (tid == null || s.tid === tid));
      if (!rows.length) continue;
      const c = Stats.emptyLine();
      for (const r of rows) for (const f of FIELDS) c[f] += r[f];
      const vals = { pts: c.pts, reb: c.orb + c.drb, ast: c.ast, stl: c.stl, blk: c.blk, tpm: c.tpm, gp: c.gp };
      for (const [k] of cats) out[k].list.push({ val: vals[k], pid: p.id, name: PBC.Player.name(p), active: p.tid !== -3 });
    }
    for (const k in out) { out[k].list.sort((a, b) => b.val - a.val); out[k].list.length = Math.min(10, out[k].list.length); }
    return out;
  };

  // ---------------------------------------------------------------------------
  // League leaders
  // ---------------------------------------------------------------------------
  Stats.LEADER_CATS = [
    { k: 'ppg', label: 'Points', f: s => s.pts / s.gp, d: 1 },
    { k: 'rpg', label: 'Rebounds', f: s => (s.orb + s.drb) / s.gp, d: 1 },
    { k: 'apg', label: 'Assists', f: s => s.ast / s.gp, d: 1 },
    { k: 'spg', label: 'Steals', f: s => s.stl / s.gp, d: 1 },
    { k: 'bpg', label: 'Blocks', f: s => s.blk / s.gp, d: 1 },
    { k: 'fgp', label: 'FG%', f: s => (s.fga ? s.fgm / s.fga : 0), d: 3, pct: true, qual: (s, g) => s.fgm >= g * 3 },
    { k: 'tpp', label: '3P%', f: s => (s.tpa ? s.tpm / s.tpa : 0), d: 3, pct: true, qual: (s, g) => s.tpm >= g * 1 },
    { k: 'ftp', label: 'FT%', f: s => (s.fta ? s.ftm / s.fta : 0), d: 3, pct: true, qual: (s, g) => s.ftm >= g * 1.5 },
    { k: 'tpm', label: '3PM', f: s => s.tpm / s.gp, d: 1 },
    { k: 'mpg', label: 'Minutes', f: s => s.min / s.gp, d: 1 },
    { k: 'gmsc', label: 'Game Score', f: s => Stats.gmsc(s) / s.gp, d: 1 },
  ];

  Stats.leaders = function (S, catKey, n, po) {
    const cat = Stats.LEADER_CATS.find(c => c.k === catKey);
    const teamGp = Math.max(1, U.avg(Object.values(S.teamSeason || {}), t => t.gp || 0));
    const out = [];
    for (const p of Object.values(S.players)) {
      if (p.tid < -1 && p.tid !== -3) continue;
      const s = Stats.season(p, S.season, po);
      if (!s || !s.gp) continue;
      if (!po && s.gp < teamGp * 0.5) continue;
      if (cat.qual && !cat.qual(s, teamGp * 0.6)) continue;
      out.push({ p, s, val: cat.f(s) });
    }
    out.sort((a, b) => b.val - a.val);
    return out.slice(0, n || 10);
  };

  // ---------------------------------------------------------------------------
  // Awards
  // ---------------------------------------------------------------------------
  function seasonLines(S) {
    const teamGp = {};
    for (const t of S.teams) teamGp[t.id] = (S.teamSeason[t.id] || {}).gp || S.seasonGames;
    const rows = [];
    for (const p of Object.values(S.players)) {
      const s = Stats.season(p, S.season, false);
      if (!s || !s.gp) continue;
      const gpNeeded = Math.max(3, S.seasonGames * 0.6);
      rows.push({ p, s, ok: s.gp >= gpNeeded, gm: Stats.gmsc(s) / s.gp, mpg: s.min / s.gp });
    }
    return rows;
  }

  Stats.mvpScore = function (S, x, standings) {
    const tid = x.s.tid;
    const st = standings[tid];
    const pct = st && st.gp ? st.w / st.gp : 0.5;
    return x.gm * (0.72 + pct * 0.62) + x.p.ovr * 0.05;
  };

  Stats.computeAwards = function (S) {
    const standings = PBC.League.standings(S);
    const rows = seasonLines(S).filter(x => x.ok);
    const aw = { season: S.season };
    const top = (arr, f) => U.sortBy(arr, f, true);

    const mvpList = top(rows, x => Stats.mvpScore(S, x, standings));
    aw.mvp = mvpList[0] ? mvpList[0].p.id : null;
    aw.mvpVoting = mvpList.slice(0, 5).map(x => x.p.id);

    const dScore = x => (x.s.stl * 1.3 + x.s.blk * 1.5 + x.s.drb * 0.28) / x.s.gp + (x.p.r.perD + x.p.r.intD + x.p.r.helpD) / 3 * 0.09 + x.mpg * 0.04;
    const dp = top(rows.filter(x => x.mpg >= 22), dScore);
    aw.dpoy = dp[0] ? dp[0].p.id : null;

    const rookies = rows.filter(x => x.p.rookieSeason === S.season);
    const roy = top(rookies, x => x.gm + x.mpg * 0.05);
    aw.roy = roy[0] ? roy[0].p.id : null;

    const bench = rows.filter(x => x.s.gs < x.s.gp * 0.35 && x.mpg >= 15);
    const sm = top(bench, x => x.gm);
    aw.smoy = sm[0] ? sm[0].p.id : null;

    const mip = top(rows.filter(x => x.mpg >= 20 && x.p.id !== aw.mvp), x => {
      const prev = Stats.season(x.p, S.season - 1, false);
      if (!prev || prev.gp < 10) return -99;
      return (x.s.pts / x.s.gp - prev.pts / prev.gp) + (x.gm - Stats.gmsc(prev) / prev.gp) * 0.6 + (x.p.ovr - ((x.p.hist.find(h => h.season === S.season - 1) || {}).ovr || x.p.ovr)) * 0.35;
    });
    aw.mip = mip[0] ? mip[0].p.id : null;

    // Coach of the Year: best over-performance vs preseason projection
    const proj = S.preseasonProj || {};
    const coy = U.sortBy(S.teams, t => {
      const st = standings[t.id];
      const pct = st.gp ? st.w / st.gp : 0;
      return (pct - (proj[t.id] != null ? proj[t.id] : 0.5)) + pct * 0.35;
    }, true);
    aw.coyTid = coy[0].id;

    // All-League teams: 2 guards, 2 forwards, 1 center per team
    const used = new Set();
    const bucket = p => (p.pos === 'PG' || p.pos === 'SG' ? 'G' : p.pos === 'C' ? 'C' : 'F');
    aw.allLeague = [];
    for (let team = 0; team < 3; team++) {
      const need = { G: 2, F: 2, C: 1 };
      const five = [];
      for (const x of mvpList) {
        if (used.has(x.p.id)) continue;
        const b = bucket(x.p);
        if (need[b] > 0) { need[b]--; five.push(x.p.id); used.add(x.p.id); }
        if (five.length === 5) break;
      }
      aw.allLeague.push(five);
    }
    const usedD = new Set();
    aw.allDefense = [];
    for (let team = 0; team < 2; team++) {
      const five = [];
      for (const x of dp) { if (!usedD.has(x.p.id)) { five.push(x.p.id); usedD.add(x.p.id); } if (five.length === 5) break; }
      aw.allDefense.push(five);
    }
    aw.allRookie = roy.slice(0, 5).map(x => x.p.id);

    // stat champions
    aw.leaders = {};
    for (const k of ['ppg', 'rpg', 'apg', 'spg', 'bpg']) {
      const l = Stats.leaders(S, k, 1);
      if (l[0]) aw.leaders[k] = { pid: l[0].p.id, val: l[0].val };
    }
    return aw;
  };

  /** Save awards onto players */
  Stats.grantAwards = function (S, aw) {
    const give = (pid, type, detail) => { const p = S.players[pid]; if (p) p.awards.push({ season: S.season, type, detail: detail || '' }); };
    for (const k of ['mvp', 'dpoy', 'roy', 'smoy', 'mip']) if (aw[k] != null) give(aw[k], k);
    aw.allLeague.forEach((five, i) => five.forEach(pid => give(pid, 'allLeague', U.ordinal(i + 1) + ' Team')));
    aw.allDefense.forEach((five, i) => five.forEach(pid => give(pid, 'allDefense', U.ordinal(i + 1) + ' Team')));
    aw.allRookie.forEach(pid => give(pid, 'allRookie', ''));
  };

  Stats.finalsMvp = function (S, series) {
    const P = S.playoffs;
    const gids = new Set(series.games);
    const tally = {};
    for (const g of P.games) {
      if (!gids.has(g.gid) || !g.box) continue;
      for (const T of g.box.teams) {
        if (T.tid !== series.winner) continue;
        for (const pl of T.players) {
          if (pl.dnp) continue;
          tally[pl.pid] = (tally[pl.pid] || 0) + Stats.gmsc(pl);
        }
      }
    }
    const best = Object.keys(tally).sort((a, b) => tally[b] - tally[a])[0];
    return best != null ? Number(best) : null;
  };

  PBC.Stats = Stats;
})();
