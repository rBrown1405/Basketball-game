/* Pro BBALL Coach — the user's coaching career: expectations, job security, contract, achievements, HOF, firing/hiring. */
(function () {
  'use strict';
  const PBC = (window.PBC = window.PBC || {});
  const U = PBC.U, C = PBC.Config;
  const Coach = {};

  const DIFF = {
    easy: { patience: 1.45, secBase: 80, label: 'Rookie' },
    normal: { patience: 1.0, secBase: 70, label: 'Pro' },
    hard: { patience: 0.78, secBase: 62, label: 'All-Star' },
    legend: { patience: 0.6, secBase: 55, label: 'Hall of Fame' },
  };
  Coach.DIFF = DIFF;

  Coach.create = function (S, name, tid) {
    const d = DIFF[S.difficulty] || DIFF.normal;
    const L = PBC.League.cfg(S);
    S.coach = {
      name: name || 'Coach', age: 42, tid, startSeason: S.season,
      contract: { years: 4, salary: Math.round(L.cap * 0.045 / 1e4) * 1e4 },
      security: d.secBase, rep: 40, hof: 0,
      seasons: [], vs: {}, achievements: {}, streak: 0, bestStreak: 0,
      titles: 0, finals: 0, coy: 0, fired: 0, teams: [tid],
      totals: { w: 0, l: 0, pw: 0, pl: 0 },
      expectation: null, mood: 'Optimistic', jobOffers: null, status: 'employed',
    };
    return S.coach;
  };

  Coach.cur = S => S.coach;

  // ---------------------------------------------------------------------------
  // Expectations
  // ---------------------------------------------------------------------------
  const GOALS = [
    { key: 'title', min: 0.66, label: 'Win the championship', round: 99 },
    { key: 'finals', min: 0.6, label: 'Reach the conference finals', round: 3 },
    { key: 'series', min: 0.53, label: 'Win a playoff series', round: 2 },
    { key: 'playoffs', min: 0.45, label: 'Make the playoffs', round: 1 },
    { key: 'playin', min: 0.37, label: 'Compete for a play-in spot', round: 0 },
    { key: 'develop', min: 0, label: 'Develop the young core and improve', round: -1 },
  ];

  Coach.setExpectations = function (S) {
    const c = S.coach;
    if (!c || c.status !== 'employed') return;
    const L = PBC.League.cfg(S);
    const proj = S.preseasonProj ? S.preseasonProj[c.tid] : PBC.League.projectedWinPct(S, c.tid);
    // rank-based projection is more stable: map team strength rank to win%
    const ranks = U.sortBy(S.teams, t => PBC.League.teamStrength(S, t.id), true).map(t => t.id);
    const rank = ranks.indexOf(c.tid);
    const rankPct = 0.72 - (rank / (S.teams.length - 1)) * 0.46;
    const pct = (proj + rankPct) / 2;
    let goal = GOALS.find(g => pct >= g.min) || GOALS[GOALS.length - 1];
    if (L.key === 'women' && goal.key === 'finals') goal = GOALS.find(g => g.key === 'series');
    if (L.key === 'women' && goal.key === 'playin') goal = GOALS.find(g => g.key === 'develop');
    c.expectation = { season: S.season, pct: U.round(pct, 3), wins: Math.round(pct * S.seasonGames), goal: goal.key, label: goal.label, round: goal.round };
    c.mood = 'Optimistic';
  };

  Coach.goalLabel = S => (S.coach && S.coach.expectation ? S.coach.expectation.label : '');

  /** Owner mood during the season (does not change security much until the end). */
  Coach.weekly = function (S) {
    const c = S.coach;
    if (!c || !c.expectation) return;
    const r = PBC.League.standings(S)[c.tid];
    if (!r.gp) return;
    const pct = r.w / r.gp;
    const diff = pct - c.expectation.pct;
    const w = Math.min(1, r.gp / S.seasonGames);
    c.midDelta = diff * 40 * w;
    c.mood = diff > 0.08 ? 'Thrilled' : diff > 0.02 ? 'Pleased' : diff > -0.04 ? 'Patient' : diff > -0.1 ? 'Concerned' : 'Furious';
    // mid-season firing: only when things are very bad
    const d = DIFF[S.difficulty] || DIFF.normal;
    if (r.gp >= S.seasonGames * 0.55 && c.security + c.midDelta * (1 / d.patience) < 8 && diff < -0.18 && c.contract.years <= 3) {
      c.pendingFire = true;
    }
  };

  // ---------------------------------------------------------------------------
  // Games
  // ---------------------------------------------------------------------------
  Coach.recordGame = function (S, sg, box) {
    const c = S.coach;
    if (!c || c.status !== 'employed') return;
    const uIdx = sg.h === S.userTid ? 0 : 1;
    const oppTid = uIdx === 0 ? sg.a : sg.h;
    const won = (uIdx === 0 ? box.hs > box.as : box.as > box.hs);
    const v = c.vs[oppTid] || (c.vs[oppTid] = [0, 0]);
    v[won ? 0 : 1]++;
    if (sg.playoff) { if (won) c.totals.pw++; else c.totals.pl++; }
    else { if (won) c.totals.w++; else c.totals.l++; }
    c.streak = won ? Math.max(1, c.streak + 1) : Math.min(-1, c.streak - 1);
    c.bestStreak = Math.max(c.bestStreak, c.streak);
    if (won && c.totals.w + c.totals.pw === 1) Coach.unlock(S, 'first_win');
    if (c.streak >= 5) Coach.unlock(S, 'win_streak_5');
    if (c.streak >= 10) Coach.unlock(S, 'win_streak_10');
    const tw = c.totals.w;
    if (tw >= 100) Coach.unlock(S, 'win_100');
    if (tw >= 250) Coach.unlock(S, 'win_250');
    if (tw >= 500) Coach.unlock(S, 'win_500');
    if (box.gims && box.gims.length) {
      const last = box.gims[box.gims.length - 1];
      const lead = uIdx === 0 ? last.scoreAfter[0] - last.scoreAfter[1] : last.scoreAfter[1] - last.scoreAfter[0];
      if (won && last.made && last.clock < 8 && lead > 0 && lead <= 3) Coach.unlock(S, 'gim_hero');
    }
  };

  Coach.unlock = function (S, id) {
    const c = S.coach;
    if (!c || c.achievements[id]) return false;
    const a = C.ACHIEVEMENTS.find(x => x.id === id);
    if (!a) return false;
    c.achievements[id] = { season: S.season, day: S.day };
    c.hof += a.pts;
    if (PBC.Season) PBC.Season.news(S, `🏅 Achievement unlocked: ${a.label} — ${a.desc}`, 'achievement', S.userTid);
    return true;
  };

  // ---------------------------------------------------------------------------
  // End of season review
  // ---------------------------------------------------------------------------
  Coach.endSeason = function (S) {
    const c = S.coach;
    if (!c || c.status !== 'employed') return;
    const L = PBC.League.cfg(S);
    const d = DIFF[S.difficulty] || DIFF.normal;
    const r = PBC.League.standings(S)[c.tid];
    const pct = r.gp ? r.w / r.gp : 0;
    const res = PBC.League.playoffResult(S, c.tid);
    const exp = c.expectation || { pct: 0.5, round: 1, goal: 'playoffs', label: 'Make the playoffs' };
    const prev = c.seasons.length ? c.seasons[c.seasons.length - 1] : null;
    const rounds = L.series.length;
    // postseason round reached: -1 missed, 0 play-in, 1..rounds, rounds+1 champion
    const reached = res.champ ? rounds + 1 : res.round;
    const goalRound = exp.round === 99 ? rounds + 1 : exp.round;
    let delta = (pct - exp.pct) * 110;
    if (reached >= goalRound) delta += 8 + Math.max(0, reached - goalRound) * 4;
    else delta -= Math.min(14, (goalRound - reached) * 5);
    if (res.champ) delta += 20;
    // youth development counts for rebuilding teams
    const young = PBC.League.roster(S, c.tid).filter(p => p.age <= 24);
    const devGain = U.sum(young, p => { const h = p.hist.find(x => x.season === S.season - 1); return h ? p.ovr - h.ovr : 0; });
    if (exp.goal === 'develop') delta += U.clamp(devGain * 0.6, -4, 10);
    const owner = S.teams[c.tid].owner;
    const patience = d.patience * (0.75 + owner.patience / 200);
    delta = delta >= 0 ? delta : delta / patience;
    c.security = Math.round(U.clamp(c.security + delta, 0, 100));
    c.rep = Math.round(U.clamp(c.rep + (pct - 0.5) * 18 + (reached >= 1 ? 3 : 0) + (reached >= 3 ? 4 : 0) + (res.champ ? 12 : 0), 0, 100));
    // HOF points
    c.hof = U.round(c.hof + r.w * 0.06 + (reached >= 1 ? 1 : 0) + (res.champ ? 12 : 0) + (reached >= rounds ? 4 : 0), 1);
    // achievements
    if (pct > 0.5) Coach.unlock(S, 'winning_season');
    if (S.seasonGames >= 40 && pct >= 0.6) Coach.unlock(S, 'fifty_wins');
    if (S.seasonGames >= 40 && pct >= 0.73) Coach.unlock(S, 'sixty_wins');
    if (reached >= 1) Coach.unlock(S, 'playoffs');
    if (reached >= 2) Coach.unlock(S, 'series_win');
    if (reached >= rounds) Coach.unlock(S, 'conf_title');
    if (res.champ) {
      c.titles++;
      Coach.unlock(S, 'title');
      const prevChamp = prev && prev.champ;
      if (prevChamp) Coach.unlock(S, 'repeat');
      if (c.titles >= 3) Coach.unlock(S, 'dynasty');
    }
    if (reached >= rounds) c.finals++;
    if (prev && prev.tid === c.tid && (pct - prev.w / Math.max(1, prev.w + prev.l)) >= 0.18) Coach.unlock(S, 'turnaround');
    const P = S.playoffs;
    if (P) {
      for (const s of P.series) if (s.done && s.winner === c.tid && s.lo === c.tid) Coach.unlock(S, 'upset');
    }
    const aw = S.regularAwards;
    if (aw && aw.mvp != null && S.players[aw.mvp] && S.players[aw.mvp].tid === c.tid) Coach.unlock(S, 'mvp_player');
    if (aw && aw.coyTid === c.tid) c.coy++;
    c.seasons.push({ season: S.season, tid: c.tid, w: r.w, l: r.l, result: res.label, champ: !!res.champ, goal: exp.label, met: reached >= goalRound, security: c.security, expWins: exp.wins });
    if (c.seasons.length >= 10) Coach.unlock(S, 'survivor');
    // contract & job status
    c.contract.years--;
    c.age++;
    let verdict;
    const losing2 = c.seasons.length >= 2 && c.seasons.slice(-2).every(s => s.w < s.l);
    const fireLine = 22 + (losing2 ? 8 : 0);
    if (c.security < fireLine && (c.security < 10 || U.chance(0.65)) && c.seasons.filter(s => s.tid === c.tid).length >= 1) {
      verdict = 'fired';
    } else if (c.contract.years <= 0) {
      if (c.security >= 50) {
        const yrs = c.security >= 80 ? 5 : c.security >= 65 ? 4 : 3;
        const raise = 1 + c.rep / 200;
        c.contract = { years: yrs, salary: Math.round(c.contract.salary * raise / 1e4) * 1e4 };
        verdict = 'extended';
      } else verdict = 'expired';
    } else if (c.security >= 85 && c.contract.years <= 2) {
      c.contract.years += 3;
      c.contract.salary = Math.round(c.contract.salary * 1.2 / 1e4) * 1e4;
      verdict = 'extended';
    } else verdict = 'retained';
    c.lastReview = { season: S.season, delta: Math.round(delta), verdict, security: c.security, goalMet: reached >= goalRound, label: exp.label, result: res.label };
    if (verdict === 'fired' || verdict === 'expired') {
      c.status = 'unemployed';
      c.fired++;
      if (PBC.Season) PBC.Season.news(S, verdict === 'fired' ? `❌ You have been fired by the ${S.teams[c.tid].city} ${S.teams[c.tid].name}.` : `📄 Your contract with ${S.teams[c.tid].city} was not renewed.`, 'career', c.tid);
      c.jobOffers = Coach.jobOffers(S);
    } else if (PBC.Season) {
      PBC.Season.news(S, verdict === 'extended' ? `✍️ The owner rewards you with a contract extension: ${c.contract.years} years, ${U.money(c.contract.salary)}/yr.` : `The owner reviewed your season (${res.label}). Job security: ${c.security}/100.`, 'career', c.tid);
    }
  };

  /** Teams with openings that would hire the coach. */
  Coach.jobOffers = function (S) {
    const c = S.coach;
    const st = PBC.League.standings(S);
    const openings = U.sortBy(S.teams.filter(t => t.id !== c.tid), t => st[t.id].w / Math.max(1, st[t.id].gp) + U.rand() * 0.25).slice(0, 7);
    const offers = [];
    for (const t of openings) {
      const strength = PBC.League.teamStrength(S, t.id);
      const need = 25 + (strength - 76) * 4 + t.market * 3;
      if (c.rep + U.gauss(0, 10) >= need || offers.length < 2) {
        offers.push({ tid: t.id, years: U.int(3, 5), salary: Math.round(PBC.League.cfg(S).cap * (0.035 + c.rep / 2500) / 1e4) * 1e4 });
      }
      if (offers.length >= 4) break;
    }
    return offers;
  };

  Coach.acceptJob = function (S, offer) {
    const c = S.coach;
    const was = c.tid;
    c.tid = offer.tid;
    S.userTid = offer.tid;
    c.status = 'employed';
    c.contract = { years: offer.years, salary: offer.salary };
    c.security = (DIFF[S.difficulty] || DIFF.normal).secBase;
    c.jobOffers = null;
    c.pendingFire = false;
    if (!c.teams.includes(offer.tid)) c.teams.push(offer.tid);
    if (c.fired > 0) Coach.unlock(S, 'hired_again');
    const t = S.teams[offer.tid];
    t.rot.auto = true;
    if (PBC.Season) PBC.Season.news(S, `🤝 You are the new head coach of the ${t.city} ${t.name}!`, 'career', offer.tid);
    return was;
  };

  /** Mid-season firing (called by UI after weekly check) */
  Coach.fireNow = function (S) {
    const c = S.coach;
    c.pendingFire = false;
    c.status = 'unemployed';
    c.fired++;
    if (PBC.Season) PBC.Season.news(S, `❌ With the season going south, the ${S.teams[c.tid].city} ${S.teams[c.tid].name} have fired you.`, 'career', c.tid);
    c.jobOffers = Coach.jobOffers(S);
  };

  Coach.hofProbability = function (S) {
    const h = S.coach ? S.coach.hof : 0;
    return U.clamp(U.sigmoid((h - 90) / 18), 0, 1);
  };

  Coach.record = function (S) {
    const c = S.coach;
    return c ? c.totals : { w: 0, l: 0, pw: 0, pl: 0 };
  };

  PBC.Coach = Coach;
})();
