/* Pro BBALL Coach — league creation, schedule, calendar, standings, playoffs. */
(function () {
  'use strict';
  const PBC = (window.PBC = window.PBC || {});
  const U = PBC.U, C = PBC.Config;

  const League = {};

  League.cfg = S => C.LEAGUES[S.leagueKey];
  League.team = (S, tid) => S.teams[tid];
  League.teamName = (S, tid) => { const t = S.teams[tid]; return t ? `${t.city} ${t.name}` : 'Free Agent'; };
  League.roster = (S, tid) => {
    const out = [];
    for (const id in S.players) { const p = S.players[id]; if (p.tid === tid) out.push(p); }
    return out.sort((a, b) => b.ovr - a.ovr);
  };
  League.freeAgents = S => League.roster(S, -1);
  League.prospects = S => League.roster(S, -2);
  League.userTeam = S => S.teams[S.userTid];
  League.isUser = (S, tid) => tid === S.userTid;

  // ---------------------------------------------------------------------------
  // Calendar
  // ---------------------------------------------------------------------------
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  League.dateOf = (S, day) => {
    const startMonth = S.leagueKey === 'women' ? 4 : 9; // May vs Oct
    const startDay = S.leagueKey === 'women' ? 16 : 21;
    return new Date(Date.UTC(S.season, startMonth, startDay + day));
  };
  League.dateLabel = (S, day, withDow) => {
    const d = League.dateOf(S, day);
    return (withDow ? DOW[d.getUTCDay()] + ', ' : '') + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCDate();
  };
  League.monthOf = (S, day) => MONTHS[League.dateOf(S, day).getUTCMonth()];

  // ---------------------------------------------------------------------------
  // New league
  // ---------------------------------------------------------------------------
  function slotTalents(L) {
    return L.key === 'women'
      ? [[84.5, 4], [79, 3.6], [75.5, 3.3], [72.5, 3], [70, 3], [67.5, 3], [65, 3], [63, 3], [61, 3], [59, 3], [57, 3], [55, 3]]
      : [[84.5, 4], [79.5, 3.6], [76, 3.3], [73, 3], [71, 3], [69, 3], [67.5, 3], [66, 3], [64, 3], [62.5, 3], [61, 3], [59, 3], [57, 3], [55, 3], [53, 3]];
  }

  const AGE_W = { 19: 2, 20: 4, 21: 6, 22: 8, 23: 9, 24: 9, 25: 9, 26: 9, 27: 8, 28: 8, 29: 7, 30: 6, 31: 5, 32: 4, 33: 3, 34: 2, 35: 1.5, 36: 1, 37: 0.5 };
  function randomAge(minAge) {
    const ages = Object.keys(AGE_W).map(Number).filter(a => a >= (minAge || 19));
    return U.pickW(ages, ages.map(a => AGE_W[a]));
  }

  function makeTeam(def, id) {
    return {
      id, abbr: def.abbr, city: def.city, name: def.name, conf: def.conf, div: def.div, market: def.market,
      colors: { primary: def.colors[0], secondary: def.colors[1], trim: def.colors[2] }, wood: def.wood,
      strat: { off: 'balanced', def: 'man', tempo: 'normal', focus: 'balanced', crash: 'balanced', pressure: 'normal', goTo1: null, goTo2: null },
      rot: { starters: [], minutes: {}, auto: true },
      owner: { patience: U.int(35, 85), spend: U.int(30, 90) },
      hype: U.int(35, 75), history: [], coachName: '', coachRating: U.int(45, 85),
    };
  }

  /**
   * opts: { leagueKey:'men'|'women', seasonGames, difficulty:'easy'|'normal'|'hard'|'legend', season, seed }
   */
  League.create = function (opts) {
    if (opts.seed != null) U.setSeed(opts.seed);
    const L = C.LEAGUES[opts.leagueKey || 'men'];
    const S = {
      v: C.SAVE_VERSION, saveId: 'save_' + Date.now().toString(36),
      created: Date.now(), updated: Date.now(),
      leagueKey: L.key, seasonGames: opts.seasonGames || L.seasonLengths[0], difficulty: opts.difficulty || 'normal',
      season: opts.season || 2026, phase: 'preseason', day: 0, numDays: 0,
      teams: [], players: {}, nextPid: 1, schedule: [], nextGid: 1, boxes: {}, playoffs: null,
      draftPicks: [], userTid: -1, coach: null, news: [], history: [], records: null,
      settings: { gimEnabled: true, autoPractice: false, simSpeed: 4, showVisuals: true, retroCourt: true, pixelMode: false, camera: 'broadcast' },
      practice: null, teamSeason: {}, flags: {},
    };
    S.teams = L.teamsList.map((def, i) => makeTeam(def, i));

    // --- players for each team ---
    const slots = slotTalents(L);
    for (const t of S.teams) {
      const quality = U.gauss(0, 1.4);
      const starterPos = U.shuffle(C.POSITIONS);
      const benchPool = U.shuffle(C.POSITIONS.concat(C.POSITIONS));
      slots.forEach(([m, sd], i) => {
        const pos = i < 5 ? starterPos[i] : benchPool[(i - 5) % benchPool.length];
        const age = randomAge(i === 0 ? 22 : 19);
        let talent = U.gauss(m, sd) + quality;
        // young players are raw: current talent lower, potential higher
        if (age <= 21) talent -= (22 - age) * 2.5;
        const p = PBC.Player.create(S, { league: L, pos, age, talent, tid: t.id });
        // only genuinely young players start as rookies in a brand-new league
        if (p.yearsPro === 0 && age <= 21 && p.ovr < 80) p.rookieSeason = S.season;
        else p.yearsPro = Math.max(1, p.yearsPro);
        const val = PBC.Player.marketValue(p, L);
        if (age <= 22 && p.yearsPro <= 3) {
          const pick = U.int(1, 45);
          p.contract = { amt: PBC.Player.rookieSalary(pick, pick > L.teamsList.length ? 2 : 1, L), exp: S.season + U.int(0, 3 - Math.min(3, p.yearsPro)), rookie: true };
          p.draft = { year: S.season - p.yearsPro, round: pick > L.teamsList.length ? 2 : 1, pick: pick > L.teamsList.length ? pick - L.teamsList.length : pick, tid: t.id };
        } else {
          p.contract = { amt: U.clamp(Math.round(val * U.gauss(1, 0.16) / 1e4) * 1e4, L.minSalary, PBC.Player.maxSalary(p, L)), exp: S.season + U.int(0, 3), rookie: false };
          const rnd = U.chance(0.75) ? 1 : 2;
          p.draft = U.chance(0.88) ? { year: S.season - p.yearsPro, round: rnd, pick: U.int(1, L.teamsList.length), tid: U.int(0, S.teams.length - 1) } : null;
        }
        S.players[p.id] = p;
        PBC.Player.assignNumber(S, p);
      });
    }
    // --- free agents ---
    const faCount = L.key === 'women' ? 14 : 30;
    for (let i = 0; i < faCount; i++) {
      const p = PBC.Player.create(S, { league: L, age: randomAge(21), talent: U.gauss(58, 4.5), tid: -1 });
      p.contract = { amt: PBC.Player.marketValue(p, L), exp: S.season, rookie: false };
      S.players[p.id] = p;
    }
    // --- draft picks (next 4 drafts) ---
    for (let y = 1; y <= 4; y++) {
      for (let rd = 1; rd <= Math.min(2, L.draftRounds); rd++) {
        for (const t of S.teams) S.draftPicks.push({ season: S.season + y, round: rd, orig: t.id, owner: t.id });
      }
    }
    // --- AI setup for all teams ---
    for (const t of S.teams) PBC.AI.setupTeam(S, t.id);
    League.newSeasonSetup(S);
    return S;
  };

  /** Called at the start of every season (after the offseason and for a new league). */
  League.newSeasonSetup = function (S) {
    const L = League.cfg(S);
    S.phase = 'preseason';
    S.day = 0;
    S.playoffs = null;
    S.boxes = {};
    S.teamSeason = {};
    for (const t of S.teams) S.teamSeason[t.id] = PBC.Stats.emptyTeamSeason();
    League.makeSchedule(S);
    PBC.Draft && PBC.Draft.ensureClass ? PBC.Draft.ensureClass(S) : League.generateDraftClass(S);
    S.practice = { week: -1, done: false, log: [] };
    S.flags = { tradeDeadlinePassed: false, allStarDone: false };
    for (const p of Object.values(S.players)) {
      if (p.tid >= 0 || p.tid === -1) p.seasonStart = { ovr: p.ovr, tid: p.tid };
    }
    League.preseasonProjections(S);
  };

  /** Projected win % for every team + the owner's expectation for the user's coach. */
  League.preseasonProjections = function (S) {
    S.preseasonProj = {};
    for (const t of S.teams) S.preseasonProj[t.id] = League.projectedWinPct(S, t.id);
    if (S.coach && PBC.Coach) PBC.Coach.setExpectations(S);
  };

  /** Draft prospects for the draft held at the end of this season. */
  League.generateDraftClass = function (S) {
    const L = League.cfg(S);
    const year = S.season + 1;
    const existing = League.prospects(S).filter(p => p.draft && p.draft.year === year);
    if (existing.length) return existing;
    const n = L.key === 'women' ? 44 : 72;
    const out = [];
    for (let i = 0; i < n; i++) {
      const tier = i < 3 ? 68 : i < 10 ? 64 : i < 30 ? 59 : 54;
      const age = U.pickW([19, 20, 21, 22, 23], [30, 26, 20, 16, 8]);
      const talent = U.gauss(tier, 3.5) - (22 - age) * 1.2;
      const p = PBC.Player.create(S, { league: L, age, talent, tid: -2, prospect: true });
      p.yearsPro = 0;
      p.pot = Math.max(p.pot, Math.round(p.ovr + (i < 5 ? U.gauss(20, 5) : i < 15 ? U.gauss(14, 5) : U.gauss(9, 5))));
      p.pot = U.clamp(p.pot, p.ovr, 99);
      p.draft = { year, round: 0, pick: 0, tid: -1, rank: 0 };
      p.scout = { pts: 0, known: 0 };
      S.players[p.id] = p;
      out.push(p);
    }
    return out;
  };

  // ---------------------------------------------------------------------------
  // Schedule
  // ---------------------------------------------------------------------------
  function matchups(S) {
    const L = League.cfg(S);
    const T = S.teams;
    const games = [];
    const add = (a, b, n, aHome) => {
      for (let i = 0; i < n; i++) {
        const home = i < aHome ? a : b;
        games.push([home, home === a ? b : a]);
      }
    };
    const n = T.length;
    const perPair = {};
    if (L.key === 'men' && S.seasonGames === 82) {
      // division: 4; conference non-division: 4 or 3; other conference: 2
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        const a = T[i], b = T[j];
        let g;
        if (a.div === b.div) g = 4;
        else if (a.conf === b.conf) g = 4;
        else g = 2;
        perPair[i + '_' + j] = g;
      }
      // 3-game pairs: between two divisions of a conference, team k plays teams k and k+1 of the other division 3 times
      for (let conf = 0; conf < 2; conf++) {
        const divs = U.uniq(T.filter(t => t.conf === conf).map(t => t.div));
        for (let x = 0; x < divs.length; x++) for (let y = x + 1; y < divs.length; y++) {
          const A = T.filter(t => t.div === divs[x]).map(t => t.id);
          const B = U.shuffle(T.filter(t => t.div === divs[y]).map(t => t.id));
          for (let k = 0; k < A.length; k++) {
            for (const off of [0, 1]) {
              const bi = B[(k + off) % B.length];
              const i = Math.min(A[k], bi), j = Math.max(A[k], bi);
              perPair[i + '_' + j] = 3;
            }
          }
        }
      }
    } else {
      const each = Math.max(1, Math.round(S.seasonGames / (n - 1)));
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) perPair[i + '_' + j] = each;
    }
    let homeParity = 0;
    for (const key in perPair) {
      const [i, j] = key.split('_').map(Number);
      const g = perPair[key];
      const aHome = g % 2 === 0 ? g / 2 : (homeParity++ % 2 === 0 ? Math.ceil(g / 2) : Math.floor(g / 2));
      add(i, j, g, aHome);
    }
    // single round-robin: balance home counts per team
    if (Object.values(perPair).every(g => g === 1)) {
      const homeCount = new Array(n).fill(0);
      for (const g of games) {
        const [h, a] = g;
        if (homeCount[h] > homeCount[a] + 1) { g[0] = a; g[1] = h; }
        homeCount[g[0]]++;
      }
    }
    return games;
  }

  League.makeSchedule = function (S) {
    const games = U.shuffle(matchups(S));
    const n = S.teams.length;
    const perTeam = (games.length * 2) / n;
    const spanDays = Math.round(perTeam * (S.leagueKey === 'women' ? 2.45 : 2.08)) + 4;
    const breakStart = Math.round(spanDays * League.cfg(S).allStarFrac);
    const breakLen = S.seasonGames >= 40 ? 5 : 0;
    const played = new Array(n).fill(0);
    const lastDay = new Array(n).fill(-10);
    const prevDay = new Array(n).fill(-10);
    const remaining = games.slice();
    const sched = [];
    let day = 0;
    const totalDays = spanDays + breakLen;
    while (remaining.length && day < totalDays * 3) {
      if (breakLen && day >= breakStart && day < breakStart + breakLen) { day++; continue; }
      const effDay = day >= breakStart + breakLen ? day - breakLen : day;
      const expected = (effDay + 1) / spanDays * perTeam;
      const target = Math.max(1, Math.round(U.gauss(remaining.length / Math.max(1, totalDays - day) , 1.8)));
      const busy = new Set();
      // priority by how far behind schedule each team is
      remaining.sort((g1, g2) => {
        const l1 = expected - played[g1[0]] + expected - played[g1[1]];
        const l2 = expected - played[g2[0]] + expected - played[g2[1]];
        return l2 - l1;
      });
      let count = 0;
      for (let i = 0; i < remaining.length && count < Math.max(target, 1); i++) {
        const [h, a] = remaining[i];
        if (busy.has(h) || busy.has(a)) continue;
        // no 3 games in 3 days
        const threeInThree = t => lastDay[t] === day - 1 && prevDay[t] === day - 2;
        if (threeInThree(h) || threeInThree(a)) continue;
        // behind-schedule teams only (avoid running ahead)
        if (played[h] > expected + 2 || played[a] > expected + 2) continue;
        busy.add(h); busy.add(a);
        sched.push({ gid: S.nextGid++, day, h, a, played: false, hs: 0, as: 0, ot: 0 });
        for (const t of [h, a]) { prevDay[t] = lastDay[t]; lastDay[t] = day; played[t]++; }
        remaining.splice(i, 1); i--; count++;
      }
      day++;
    }
    sched.sort((x, y) => x.day - y.day || x.gid - y.gid);
    S.schedule = sched;
    S.numDays = sched.length ? sched[sched.length - 1].day + 1 : 0;
    S.allStarDay = breakLen ? breakStart : -1;
    S.tradeDeadlineDay = Math.round(S.numDays * League.cfg(S).tradeDeadlineFrac);
  };

  League.gamesOnDay = (S, day) => S.schedule.filter(g => g.day === day);
  League.teamGames = (S, tid) => S.schedule.filter(g => g.h === tid || g.a === tid);
  League.nextGame = (S, tid) => S.schedule.find(g => !g.played && (g.h === tid || g.a === tid)) || null;
  League.gameById = (S, gid) => S.schedule.find(g => g.gid === gid) || (S.playoffs && S.playoffs.games ? S.playoffs.games.find(g => g.gid === gid) : null);

  // ---------------------------------------------------------------------------
  // Standings
  // ---------------------------------------------------------------------------
  League.standings = function (S) {
    const rows = S.teams.map(t => ({
      tid: t.id, conf: t.conf, div: t.div, w: 0, l: 0, hw: 0, hl: 0, aw: 0, al: 0, cw: 0, cl: 0, dw: 0, dl: 0,
      pf: 0, pa: 0, streak: 0, last: [], gp: 0, h2h: {},
    }));
    for (const g of S.schedule) {
      if (!g.played) continue;
      const H = rows[g.h], A = rows[g.a];
      const hw = g.hs > g.as;
      const W = hw ? H : A, Lr = hw ? A : H;
      W.w++; Lr.l++;
      if (hw) { H.hw++; A.al++; } else { A.aw++; H.hl++; }
      if (H.conf === A.conf) { W.cw++; Lr.cl++; }
      if (H.div === A.div) { W.dw++; Lr.dl++; }
      H.pf += g.hs; H.pa += g.as; A.pf += g.as; A.pa += g.hs;
      H.gp++; A.gp++;
      W.h2h[Lr.tid] = W.h2h[Lr.tid] || [0, 0]; W.h2h[Lr.tid][0]++;
      Lr.h2h[W.tid] = Lr.h2h[W.tid] || [0, 0]; Lr.h2h[W.tid][1]++;
      W.last.push(1); Lr.last.push(0);
    }
    for (const r of rows) {
      r.pct = r.gp ? r.w / r.gp : 0;
      r.diff = r.gp ? (r.pf - r.pa) / r.gp : 0;
      let s = 0;
      for (let i = r.last.length - 1; i >= 0; i--) {
        if (s === 0) s = r.last[i] ? 1 : -1;
        else if ((s > 0) === !!r.last[i]) s += s > 0 ? 1 : -1;
        else break;
      }
      r.streak = s;
      const l10 = r.last.slice(-10);
      r.l10 = [l10.filter(x => x).length, l10.filter(x => !x).length];
      delete r.last;
    }
    return rows;
  };

  function compareRows(a, b) {
    if (b.pct !== a.pct) return b.pct - a.pct;
    const h = a.h2h[b.tid];
    if (h && h[0] !== h[1]) return h[1] - h[0];
    const ca = a.cw / Math.max(1, a.cw + a.cl), cb = b.cw / Math.max(1, b.cw + b.cl);
    if (cb !== ca) return cb - ca;
    if (b.diff !== a.diff) return b.diff - a.diff;
    return a.tid - b.tid;
  }

  /** Sorted standings for a conference (or the whole league with conf=null), with seeds and games-back. */
  League.sorted = function (S, conf, rows) {
    rows = rows || League.standings(S);
    const list = rows.filter(r => conf == null || r.conf === conf).sort(compareRows);
    const lead = list[0];
    list.forEach((r, i) => {
      r.seed = i + 1;
      r.gb = lead ? ((lead.w - r.w) + (r.l - lead.l)) / 2 : 0;
    });
    return list;
  };

  League.teamRecord = function (S, tid) {
    const r = League.standings(S)[tid];
    return { w: r.w, l: r.l, str: `${r.w}-${r.l}` };
  };

  // ---------------------------------------------------------------------------
  // Team strength (for predictions / AI)
  // ---------------------------------------------------------------------------
  const STRENGTH_W = [0.2, 0.17, 0.15, 0.13, 0.11, 0.09, 0.07, 0.05, 0.03];
  League.teamStrength = function (S, tid, opts) {
    const roster = League.roster(S, tid).filter(p => !(opts && opts.healthyOnly) || !PBC.Player.isInjured(p));
    const top = roster.slice(0, STRENGTH_W.length);
    let s = 0, w = 0;
    top.forEach((p, i) => { s += p.ovr * STRENGTH_W[i]; w += STRENGTH_W[i]; });
    return w ? s / w : 0;
  };

  /** Projected win % from strength relative to league average. */
  League.projectedWinPct = function (S, tid) {
    const all = S.teams.map(t => League.teamStrength(S, t.id));
    const avg = U.avg(all);
    const mine = League.teamStrength(S, tid);
    return U.clamp(U.sigmoid((mine - avg) * 0.3), 0.08, 0.92);
  };

  League.powerRankings = function (S) {
    const st = League.standings(S);
    return U.sortBy(S.teams.map(t => {
      const str = League.teamStrength(S, t.id, { healthyOnly: true });
      const r = st[t.id];
      const pct = r.gp ? r.w / r.gp : 0.5;
      const w = Math.min(1, r.gp / 20);
      return { tid: t.id, score: str * (1 - w * 0.5) + (60 + pct * 40) * w * 0.5 + r.diff * 0.15 * w, str, rec: `${r.w}-${r.l}` };
    }), x => x.score, true).map((x, i) => ({ ...x, rank: i + 1 }));
  };

  // ---------------------------------------------------------------------------
  // Playoffs
  // ---------------------------------------------------------------------------
  function newSeries(S, hi, lo, round, len, conf) {
    return { id: 's' + S.nextGid++, hi, lo, hiSeed: 0, loSeed: 0, round, len, conf, w: [0, 0], done: false, winner: null, games: [] };
  }

  League.startPostseason = function (S) {
    const L = League.cfg(S);
    const rows = League.standings(S);
    const P = { round: 0, rounds: L.series.length, playIn: null, series: [], games: [], champion: null, runnerUp: null, seeds: {}, done: false, fmvp: null };
    if (L.playoffFormat === 'conference') {
      const conf0 = League.sorted(S, 0, rows), conf1 = League.sorted(S, 1, rows);
      [conf0, conf1].forEach((list, c) => list.forEach((r, i) => { P.seeds[r.tid] = { seed: i + 1, conf: c }; }));
      if (L.playIn) {
        P.playIn = [];
        for (const [c, list] of [[0, conf0], [1, conf1]]) {
          P.playIn.push({ id: 'pi' + c + 'a', conf: c, stage: 'A', hi: list[6].tid, lo: list[7].tid, winner: null, loser: null, game: null });
          P.playIn.push({ id: 'pi' + c + 'b', conf: c, stage: 'B', hi: list[8].tid, lo: list[9].tid, winner: null, loser: null, game: null });
        }
        S.phase = 'playin';
      } else {
        P.round = 1;
        League.seedFirstRound(S, P);
        S.phase = 'playoffs';
      }
    } else {
      const all = League.sorted(S, null, rows);
      all.forEach((r, i) => { P.seeds[r.tid] = { seed: i + 1, conf: null }; });
      P.round = 1;
      League.seedFirstRound(S, P);
      S.phase = 'playoffs';
    }
    S.playoffs = P;
    return P;
  };

  /** After the play-in (or immediately), build first-round series. */
  League.seedFirstRound = function (S, P) {
    const L = League.cfg(S);
    P.series = [];
    const len = L.series[0];
    if (L.playoffFormat === 'conference') {
      for (const c of [0, 1]) {
        const bySeed = {};
        for (const tid in P.seeds) if (P.seeds[tid].conf === c) bySeed[P.seeds[tid].seed] = Number(tid);
        // play-in results override seeds 7 and 8
        if (P.playIn) {
          const a = P.playIn.find(x => x.conf === c && x.stage === 'A');
          const cc = P.playIn.find(x => x.conf === c && x.stage === 'C');
          bySeed[7] = a.winner; bySeed[8] = cc.winner;
        }
        for (const [h, l] of [[1, 8], [4, 5], [3, 6], [2, 7]]) {
          const s = newSeries(S, bySeed[h], bySeed[l], 1, len, c);
          s.hiSeed = h; s.loSeed = l;
          P.series.push(s);
        }
      }
    } else {
      const bySeed = {};
      for (const tid in P.seeds) bySeed[P.seeds[tid].seed] = Number(tid);
      const n = L.playoffTeams;
      const pairs = n === 8 ? [[1, 8], [4, 5], [3, 6], [2, 7]] : [[1, 4], [2, 3]];
      for (const [h, l] of pairs) {
        const s = newSeries(S, bySeed[h], bySeed[l], 1, len, null);
        s.hiSeed = h; s.loSeed = l;
        P.series.push(s);
      }
    }
    P.round = 1;
  };

  /** Next set of games to play today in the postseason. Returns array of {gid, h, a, seriesId|playInId}. */
  League.postseasonGamesToday = function (S) {
    const P = S.playoffs;
    if (!P || P.done) return [];
    const out = [];
    if (S.phase === 'playin') {
      // stage A & B first, then C (loser A vs winner B)
      const pending = P.playIn.filter(x => x.winner == null && x.stage !== 'C');
      const list = pending.length ? pending : P.playIn.filter(x => x.stage === 'C' && x.winner == null);
      for (const x of list) {
        if (!x.game) x.game = { gid: S.nextGid++, day: S.day, h: x.hi, a: x.lo, played: false, hs: 0, as: 0, ot: 0, playoff: true, playIn: x.id };
        out.push(x.game);
      }
      return out;
    }
    for (const s of P.series) {
      if (s.done || s.round !== P.round) continue;
      const gn = s.w[0] + s.w[1] + 1;
      const homeHi = homeForGame(s.len, gn);
      const g = { gid: S.nextGid++, day: S.day, h: homeHi ? s.hi : s.lo, a: homeHi ? s.lo : s.hi, played: false, hs: 0, as: 0, ot: 0, playoff: true, series: s.id, gameNum: gn };
      out.push(g);
    }
    return out;
  };

  function homeForGame(len, gn) {
    if (len === 7) return [1, 2, 5, 7].includes(gn);
    if (len === 5) return [1, 2, 5].includes(gn);
    if (len === 3) return [1, 3].includes(gn);
    return gn % 2 === 1;
  }

  /** Record a finished postseason game and advance the bracket. */
  League.recordPostseasonGame = function (S, g) {
    const P = S.playoffs;
    P.games.push(g);
    const winner = g.hs > g.as ? g.h : g.a, loser = winner === g.h ? g.a : g.h;
    if (g.playIn) {
      const x = P.playIn.find(y => y.id === g.playIn);
      x.winner = winner; x.loser = loser;
      // create stage C when A and B are done
      for (const c of [0, 1]) {
        const a = P.playIn.find(y => y.conf === c && y.stage === 'A');
        const b = P.playIn.find(y => y.conf === c && y.stage === 'B');
        if (a.winner != null && b.winner != null && !P.playIn.find(y => y.conf === c && y.stage === 'C')) {
          P.playIn.push({ id: 'pi' + c + 'c', conf: c, stage: 'C', hi: a.loser, lo: b.winner, winner: null, loser: null, game: null });
        }
      }
      if (P.playIn.filter(y => y.stage === 'C').length === 2 && P.playIn.every(y => y.winner != null)) {
        League.seedFirstRound(S, P);
        S.phase = 'playoffs';
      }
      return;
    }
    const s = P.series.find(y => y.id === g.series);
    s.games.push(g.gid);
    s.w[winner === s.hi ? 0 : 1]++;
    const need = Math.ceil(s.len / 2);
    if (s.w[0] >= need || s.w[1] >= need) {
      s.done = true;
      s.winner = s.w[0] >= need ? s.hi : s.lo;
      s.loser = s.winner === s.hi ? s.lo : s.hi;
    }
    League.advanceBracket(S);
  };

  League.advanceBracket = function (S) {
    const P = S.playoffs, L = League.cfg(S);
    const cur = P.series.filter(s => s.round === P.round);
    if (!cur.every(s => s.done)) return;
    if (P.round >= P.rounds || cur.length === 1) {
      const fin = cur[cur.length - 1];
      P.champion = fin.winner; P.runnerUp = fin.loser; P.done = true;
      S.phase = 'postseason_done';
      return;
    }
    const next = P.round + 1;
    const len = L.series[next - 1] || 7;
    const seedOf = tid => (P.seeds[tid] ? P.seeds[tid].seed : 99);
    const winners = cur.map(s => s.winner);
    const pairs = [];
    if (L.playoffFormat === 'conference') {
      if (cur.length === 2) pairs.push([winners[0], winners[1], null]);
      else {
        for (const c of [0, 1]) {
          const w = cur.filter(s => s.conf === c).map(s => s.winner);
          for (let i = 0; i < w.length; i += 2) pairs.push([w[i], w[i + 1], c]);
        }
      }
    } else {
      for (let i = 0; i < winners.length; i += 2) pairs.push([winners[i], winners[i + 1], null]);
    }
    const rows = League.standings(S);
    for (const [a, b, c] of pairs) {
      let hi = a, lo = b;
      const sa = seedOf(a), sb = seedOf(b);
      if (sb < sa || (sb === sa && rows[b].pct > rows[a].pct)) { hi = b; lo = a; }
      if (c == null && L.playoffFormat === 'conference') {
        // Finals: better record gets home court
        if (rows[b].pct > rows[a].pct) { hi = b; lo = a; } else { hi = a; lo = b; }
      }
      const s = newSeries(S, hi, lo, next, len, c);
      s.hiSeed = seedOf(hi); s.loSeed = seedOf(lo);
      P.series.push(s);
    }
    P.round = next;
  };

  League.roundName = function (S, round) {
    const L = League.cfg(S);
    const n = L.series.length;
    if (round === n) return 'Finals';
    if (L.playoffFormat === 'conference') {
      if (round === n - 1) return 'Conference Finals';
      if (round === n - 2) return 'Conference Semifinals';
      return 'First Round';
    }
    if (round === n - 1) return 'Semifinals';
    return 'First Round';
  };

  /** Where did a team finish in the postseason? Returns {label, round, champ} */
  League.playoffResult = function (S, tid) {
    const P = S.playoffs;
    if (!P) return { label: 'Missed playoffs', round: -1 };
    if (P.champion === tid) return { label: 'Won Championship', round: P.rounds + 1, champ: true };
    let best = -1, label = '';
    for (const s of P.series) {
      if (s.hi === tid || s.lo === tid) {
        if (s.round > best) { best = s.round; label = s.done && s.winner !== tid ? 'Lost in ' + League.roundName(S, s.round) : League.roundName(S, s.round); }
      }
    }
    if (best >= 0) return { label, round: best };
    if (P.playIn && P.playIn.some(x => x.hi === tid || x.lo === tid)) return { label: 'Lost in Play-In', round: 0 };
    return { label: 'Missed playoffs', round: -1 };
  };

  PBC.League = League;
})();
