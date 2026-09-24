/* Pro BBALL Coach — season flow: days, games, injuries, practice, deadlines, postseason, end of season. */
(function () {
  'use strict';
  const PBC = (window.PBC = window.PBC || {});
  const U = PBC.U, C = PBC.Config;
  const Season = {};

  // ---------------------------------------------------------------------------
  // News feed
  // ---------------------------------------------------------------------------
  Season.news = function (S, text, type, tid) {
    S.news.unshift({ season: S.season, day: S.day, phase: S.phase, text, type: type || 'general', tid: tid != null ? tid : -1, id: (S.newsId = (S.newsId || 0) + 1) });
    if (S.news.length > 400) S.news.length = 400;
  };

  // ---------------------------------------------------------------------------
  // Regular season
  // ---------------------------------------------------------------------------
  Season.startRegularSeason = function (S) {
    S.phase = 'regular';
    S.day = 0;
    PBC.League.preseasonProjections(S);
    S.weekSnap = Season.snapshot(S);
    S.practice = { week: 0, done: false, log: S.practice && S.practice.log ? S.practice.log : [] };
    for (const t of S.teams) if (t.id !== S.userTid) PBC.AI.fillRoster(S, t.id, { quiet: true });
    Season.news(S, `The ${U.seasonLabel(S.season)} season tips off!`, 'league');
  };

  Season.snapshot = function (S) {
    const snap = {};
    for (const p of Object.values(S.players)) {
      if (p.tid < 0) continue;
      const s = PBC.Stats.season(p, S.season, false);
      snap[p.id] = s ? [s.gp, s.pts, s.orb + s.drb, s.ast, s.stl + s.blk, s.fgm, s.fga] : [0, 0, 0, 0, 0, 0, 0];
    }
    return snap;
  };

  Season.userGameToday = function (S) {
    if (S.phase === 'regular') return S.schedule.find(g => g.day === S.day && !g.played && (g.h === S.userTid || g.a === S.userTid)) || null;
    if (S.phase === 'playin' || S.phase === 'playoffs') {
      const games = S.todayPost || [];
      return games.find(g => !g.played && (g.h === S.userTid || g.a === S.userTid)) || null;
    }
    return null;
  };

  Season.isRegularDone = S => S.schedule.every(g => g.played);

  /** Quick-simulate one scheduled game (not live). */
  Season.quickSim = function (S, sg) {
    const user = sg.h === S.userTid || sg.a === S.userTid;
    const g = PBC.Sim.createGame(S, sg.h, sg.a, { gid: sg.gid, playoff: !!sg.playoff, lite: !user });
    PBC.Sim.simulate(g);
    const box = PBC.Sim.finalize(g);
    Season.completeGame(S, sg, box);
    return box;
  };

  /** Record a finished game (quick or live). */
  Season.completeGame = function (S, sg, box) {
    if (sg.played) return;
    sg.played = true;
    sg.hs = box.hs; sg.as = box.as; sg.ot = box.ot;
    const user = sg.h === S.userTid || sg.a === S.userTid;
    PBC.Stats.applyBox(S, box);
    if (user) {
      // keep full box scores for the user's games (play-by-play trimmed for storage)
      const keep = Object.assign({}, box);
      if (keep.pbp && keep.pbp.length > 700) keep.pbp = keep.pbp.slice(-700);
      S.boxes[sg.gid] = keep;
      // only the most recent few games keep their full play-by-play (save size)
      S.pbpKeep = (S.pbpKeep || []).filter(id => S.boxes[id]);
      S.pbpKeep.push(sg.gid);
      while (S.pbpKeep.length > 4) { const old = S.pbpKeep.shift(); if (S.boxes[old]) delete S.boxes[old].pbp; }
      if (PBC.Coach) PBC.Coach.recordGame(S, sg, box);
      Season.userGameNews(S, sg, box);
    }
    if (sg.playoff) {
      if (S.playoffs && S.playoffs.round === S.playoffs.rounds) sg.box = box; // Finals boxes for Finals MVP
      PBC.League.recordPostseasonGame(S, sg);
    }
    // injuries picked up in this game → news for notable players
    for (const T of box.teams) for (const pl of T.players) {
      if (pl.inj) {
        const p = S.players[pl.pid];
        if (p && p.injury && (T.tid === S.userTid || p.ovr >= 82)) Season.news(S, `🚑 ${PBC.Player.name(p)} (${S.teams[T.tid].abbr}) — ${PBC.Player.injuryLabel(p.injury)}`, 'injury', T.tid);
      }
    }
    // big performances
    for (const T of box.teams) for (const pl of T.players) {
      if (pl.pts >= 50 || (pl.pts >= 10 && pl.orb + pl.drb >= 10 && pl.ast >= 10 && T.tid === S.userTid)) {
        const p = S.players[pl.pid];
        const td = pl.pts >= 10 && pl.orb + pl.drb >= 10 && pl.ast >= 10;
        Season.news(S, `${td ? '🔺 Triple-double' : '🔥 Explosion'}: ${PBC.Player.name(p)} — ${pl.pts} pts, ${pl.orb + pl.drb} reb, ${pl.ast} ast vs ${S.teams[box.teams[T === box.teams[0] ? 1 : 0].tid].abbr}`, 'performance', T.tid);
      }
    }
  };

  Season.userGameNews = function (S, sg, box) {
    const uIdx = sg.h === S.userTid ? 0 : 1;
    const my = uIdx === 0 ? box.hs : box.as, their = uIdx === 0 ? box.as : box.hs;
    const opp = S.teams[uIdx === 0 ? sg.a : sg.h];
    const pog = box.pog != null ? S.players[box.pog] : null;
    const line = pog ? (() => { const T = box.teams.find(t => t.players.some(p => p.pid === box.pog)); const pl = T.players.find(p => p.pid === box.pog); return `${PBC.Player.name(pog)}: ${pl.pts} pts, ${pl.orb + pl.drb} reb, ${pl.ast} ast`; })() : '';
    const tag = sg.playoff ? '🏆 ' : '';
    Season.news(S, `${tag}${my > their ? 'W' : 'L'} ${my}-${their} ${uIdx === 0 ? 'vs' : '@'} ${opp.city} ${opp.name}${box.ot ? ` (${box.ot > 1 ? box.ot : ''}OT)` : ''}. ${line}`, my > their ? 'win' : 'loss', S.userTid);
  };

  /** Sim every unplayed game today. opts.skipUser leaves the user's game for live play. */
  Season.simDay = function (S, opts) {
    opts = opts || {};
    if (S.phase === 'regular') {
      for (const sg of S.schedule) {
        if (sg.day !== S.day || sg.played) continue;
        if (opts.skipUser && (sg.h === S.userTid || sg.a === S.userTid)) continue;
        Season.quickSim(S, sg);
      }
    } else if (S.phase === 'playin' || S.phase === 'playoffs') {
      if (!S.todayPost || S.todayPostDay !== S.day) { S.todayPost = PBC.League.postseasonGamesToday(S); S.todayPostDay = S.day; }
      for (const sg of S.todayPost) {
        if (sg.played) continue;
        if (opts.skipUser && (sg.h === S.userTid || sg.a === S.userTid)) continue;
        Season.quickSim(S, sg);
      }
    }
    if (!opts.noEnd) Season.endDay(S);
  };

  Season.prepareToday = function (S) {
    if ((S.phase === 'playin' || S.phase === 'playoffs') && (!S.todayPost || S.todayPostDay !== S.day)) {
      S.todayPost = PBC.League.postseasonGamesToday(S);
      S.todayPostDay = S.day;
    }
  };

  Season.endDay = function (S) {
    const L = PBC.League.cfg(S);
    // heal injuries
    for (const p of Object.values(S.players)) {
      if (p.injury && p.injury.days > 0) {
        p.injury.days--;
        if (p.injury.days <= 0) {
          if (p.tid === S.userTid) Season.news(S, `✅ ${PBC.Player.name(p)} is cleared to return from ${p.injury.name.toLowerCase()}.`, 'injury', p.tid);
          p.injury = null;
        }
      }
    }
    PBC.AI.daily(S);
    if (S.phase === 'regular' && PBC.Trade && PBC.Trade.daily && !S.flags.tradeDeadlinePassed) PBC.Trade.daily(S);
    if (S.phase === 'regular') {
      const newWeek = Math.floor((S.day + 1) / 7);
      if (newWeek !== Math.floor(S.day / 7)) Season.endWeek(S);
      if (!S.flags.tradeDeadlinePassed && S.day + 1 >= S.tradeDeadlineDay) {
        S.flags.tradeDeadlinePassed = true;
        Season.news(S, '⏰ The trade deadline has passed. Rosters are locked except for free-agent signings.', 'league');
      }
      if (!S.flags.allStarDone && S.allStarDay >= 0 && S.day + 1 >= S.allStarDay) Season.allStar(S);
      S.day++;
      if (Season.isRegularDone(S)) Season.endRegularSeason(S);
    } else if (S.phase === 'playin' || S.phase === 'playoffs' || S.phase === 'postseason_done') {
      S.day++;
      S.todayPost = null;
      if (S.playoffs && S.playoffs.done) Season.finishPostseason(S);
    } else {
      S.day++;
    }
    S.updated = Date.now();
  };

  Season.endWeek = function (S) {
    // auto practice if the user skipped it
    if (S.practice && !S.practice.done && S.userTid >= 0) Season.applyPractice(S, 'auto', PBC.Coach ? 55 : 55, [], true);
    S.practice = { week: Math.floor((S.day + 1) / 7), done: false, log: (S.practice && S.practice.log) || [] };
    // player of the week
    const snap = S.weekSnap || {};
    const best = [null, null];
    for (const p of Object.values(S.players)) {
      if (p.tid < 0) continue;
      const s = PBC.Stats.season(p, S.season, false);
      if (!s) continue;
      const o = snap[p.id] || [0, 0, 0, 0, 0, 0, 0];
      const gp = s.gp - o[0];
      if (gp < 2) continue;
      const pts = s.pts - o[1], reb = s.orb + s.drb - o[2], ast = s.ast - o[3], sb = s.stl + s.blk - o[4];
      const score = (pts + reb * 1.1 + ast * 1.3 + sb * 1.5) / gp;
      const conf = S.teams[p.tid].conf;
      const cIdx = PBC.League.cfg(S).playoffFormat === 'conference' ? conf : 0;
      if (!best[cIdx] || score > best[cIdx].score) best[cIdx] = { p, score, line: `${(pts / gp).toFixed(1)} ppg, ${(reb / gp).toFixed(1)} rpg, ${(ast / gp).toFixed(1)} apg` };
    }
    const L = PBC.League.cfg(S);
    best.forEach((b, i) => {
      if (!b) return;
      const label = L.playoffFormat === 'conference' ? `${L.confs[i]} ` : '';
      Season.news(S, `⭐ ${label}Player of the Week: ${PBC.Player.name(b.p)} (${S.teams[b.p.tid].abbr}) — ${b.line}`, 'award', b.p.tid);
      b.p.awards.push({ season: S.season, type: 'potw', detail: '' });
    });
    S.weekSnap = Season.snapshot(S);
    // morale drift for the user's team
    if (S.userTid >= 0) Season.updateMorale(S);
    if (PBC.Coach) PBC.Coach.weekly(S);
  };

  Season.updateMorale = function (S) {
    const roster = PBC.League.roster(S, S.userTid);
    const rec = PBC.League.teamRecord(S, S.userTid);
    const winning = rec.w + rec.l ? rec.w / (rec.w + rec.l) : 0.5;
    roster.forEach((p, rank) => {
      const s = PBC.Stats.season(p, S.season, false);
      const mpg = s && s.gp ? s.min / s.gp : 0;
      const expected = rank < 5 ? 28 : rank < 8 ? 18 : rank < 10 ? 10 : 0;
      let d = (mpg - expected) * 0.25 * ((p.pers ? p.pers.pt : 50) / 50) + (winning - 0.5) * 6 * ((p.pers ? p.pers.win : 50) / 50);
      if (p.promise && p.promise.type === 'starter' && s && s.gp >= 5 && s.gs / s.gp < 0.6) d -= 3;
      if (p.promise && p.promise.type === 'minutes' && s && s.gp >= 5 && mpg < p.promise.min - 2) d -= 3;
      p.morale = Math.round(U.clamp((p.morale == null ? 70 : p.morale) + d * 0.5 + (70 - (p.morale || 70)) * 0.05, 5, 100));
    });
  };

  Season.allStar = function (S) {
    S.flags.allStarDone = true;
    const L = PBC.League.cfg(S);
    const standings = PBC.League.standings(S);
    const confs = L.playoffFormat === 'conference' ? [0, 1] : [null];
    const perTeam = L.key === 'women' ? 12 : 12;
    const picked = [];
    for (const c of confs) {
      const pool = [];
      for (const p of Object.values(S.players)) {
        if (p.tid < 0) continue;
        if (c != null && S.teams[p.tid].conf !== c) continue;
        const s = PBC.Stats.season(p, S.season, false);
        if (!s || s.gp < 8) continue;
        pool.push({ p, score: PBC.Stats.mvpScore(S, { p, s, gm: PBC.Stats.gmsc(s) / s.gp }, standings) });
      }
      const list = U.sortBy(pool, x => x.score, true).slice(0, c == null ? perTeam * 2 : perTeam);
      for (const x of list) { x.p.awards.push({ season: S.season, type: 'allStar', detail: '' }); picked.push(x.p); }
    }
    const mine = picked.filter(p => p.tid === S.userTid);
    Season.news(S, `🌟 All-Star rosters announced! ${mine.length ? 'Your All-Stars: ' + mine.map(p => PBC.Player.name(p)).join(', ') + '.' : 'None of your players made the team.'}`, 'award', S.userTid);
    S.allStars = picked.map(p => p.id);
  };

  // ---------------------------------------------------------------------------
  // Practice (weekly mini-games)
  // ---------------------------------------------------------------------------
  const DRILL_TRAINS = {
    shooting: ['three', 'mid', 'shotIQ'], freethrows: ['ft', 'clutch'], finishing: ['layup', 'close', 'dunk'],
    passing: ['pass', 'vision'], ballhandling: ['handle', 'agility'], defense: ['perD', 'agility', 'steal', 'intD'],
    rebounding: ['dreb', 'oreb', 'hustle'], conditioning: ['stamina', 'speed', 'hustle'],
    auto: ['three', 'handle', 'perD', 'dreb', 'layup', 'pass'],
  };
  Season.DRILL_TRAINS = DRILL_TRAINS;

  Season.practiceAvailable = S => S.phase === 'regular' && S.practice && !S.practice.done && S.userTid >= 0;

  /** Apply a practice session. score 0..100. focus = up to 3 player ids. Returns list of rating improvements. */
  Season.applyPractice = function (S, drillKey, score, focus, auto) {
    const drills = (PBC.Mini && PBC.Mini.DRILLS) || [];
    const d = drills.find(x => x.key === drillKey);
    const trains = (d && d.trains) || DRILL_TRAINS[drillKey] || DRILL_TRAINS.auto;
    const roster = PBC.League.roster(S, S.userTid).filter(p => !PBC.Player.isInjured(p));
    const gains = [];
    const base = 0.11 * (score / 100) * (auto ? 0.6 : 1);
    for (const p of roster) {
      const isFocus = focus && focus.includes(p.id);
      const ageF = p.age <= 22 ? 1.4 : p.age <= 25 ? 1.2 : p.age <= 29 ? 1 : p.age <= 32 ? 0.7 : 0.45;
      const workF = 0.7 + (p.pers ? p.pers.work : 60) / 200;
      const potF = p.pot > p.ovr ? 1.15 : 1;
      for (const k of trains) {
        const amt = base * (isFocus ? 3 : 1) * ageF * workF * potF * U.range(0.7, 1.3);
        const before = p.r[k];
        if (PBC.Player.addTraining(p, k, amt)) gains.push({ pid: p.id, key: k, from: before, to: p.r[k] });
      }
    }
    if (S.practice) {
      S.practice.done = true;
      S.practice.log.unshift({ season: S.season, week: S.practice.week, drill: drillKey, score: Math.round(score), gains: gains.length, auto: !!auto });
      if (S.practice.log.length > 60) S.practice.log.length = 60;
    }
    if (!auto && PBC.Coach && score >= 95) PBC.Coach.unlock(S, 'perfect_practice');
    if (gains.length) {
      const txt = gains.slice(0, 4).map(g => `${PBC.Player.shortName(S.players[g.pid])} ${C.RATINGS.find(r => r.key === g.key).short} ${g.to}`).join(', ');
      Season.news(S, `🏋️ Practice (${auto ? 'assistant-run' : drillKey}): ${gains.length} rating bump${gains.length > 1 ? 's' : ''} — ${txt}${gains.length > 4 ? '…' : ''}`, 'practice', S.userTid);
    }
    return gains;
  };

  // ---------------------------------------------------------------------------
  // Postseason
  // ---------------------------------------------------------------------------
  Season.endRegularSeason = function (S) {
    const st = PBC.League.standings(S);
    const L = PBC.League.cfg(S);
    PBC.League.startPostseason(S);
    const P = S.playoffs;
    const my = P.seeds[S.userTid];
    const inPlayIn = P.playIn && P.playIn.some(x => x.hi === S.userTid || x.lo === S.userTid);
    const inPlayoffs = P.series.some(s => s.hi === S.userTid || s.lo === S.userTid);
    const r = st[S.userTid];
    Season.news(S, `The regular season is over. You finished ${r.w}-${r.l}${my ? `, the ${U.ordinal(my.seed)} seed${L.playoffFormat === 'conference' ? ' in the ' + L.confs[my.conf] : ''}` : ''}. ${inPlayoffs ? 'On to the playoffs!' : inPlayIn ? 'Next up: the Play-In Tournament.' : 'Your season is over.'}`, 'league', S.userTid);
    S.regularAwards = PBC.Stats.computeAwards(S);
  };

  Season.finishPostseason = function (S) {
    const P = S.playoffs;
    if (!P || S.phase === 'awards') return;
    const finals = P.series.filter(s => s.round === P.round).slice(-1)[0];
    const fmvp = finals ? PBC.Stats.finalsMvp(S, finals) : null;
    P.fmvp = fmvp;
    if (fmvp != null && S.players[fmvp]) S.players[fmvp].awards.push({ season: S.season, type: 'fmvp', detail: '' });
    for (const g of P.games) delete g.box; // don't keep Finals boxes around
    const champ = S.teams[P.champion];
    Season.news(S, `🏆 The ${champ.city} ${champ.name} are champions of the ${U.seasonLabel(S.season)} season!${fmvp != null ? ' Finals MVP: ' + PBC.Player.name(S.players[fmvp]) + '.' : ''}`, 'league', P.champion);
    for (const pid of U.uniq([].concat(...PBC.League.roster(S, P.champion).map(p => [p.id])))) {
      const p = S.players[pid];
      p.awards.push({ season: S.season, type: 'champion', detail: champ.abbr });
    }
    Season.endSeason(S);
  };

  /** Awards, history, coach evaluation. Moves to phase 'awards' (offseason begins). */
  Season.endSeason = function (S) {
    const aw = S.regularAwards || PBC.Stats.computeAwards(S);
    PBC.Stats.grantAwards(S, aw);
    const P = S.playoffs;
    const st = PBC.League.standings(S);
    const finals = P && P.series.length ? P.series.filter(s => s.round === P.rounds || (s.done && s.winner === P.champion && s.round === P.round)).slice(-1)[0] : null;
    const hist = {
      season: S.season, champion: P ? P.champion : null, runnerUp: P ? P.runnerUp : null, fmvp: P ? P.fmvp : null,
      awards: aw, standings: st.map(r => ({ tid: r.tid, w: r.w, l: r.l })), userTid: S.userTid,
      finals: finals ? { winner: finals.winner, loser: finals.loser, wins: finals.winner === finals.hi ? finals.w.slice() : [finals.w[1], finals.w[0]], len: finals.len } : null,
      preseasonProj: S.preseasonProj ? Object.assign({}, S.preseasonProj) : null,
    };
    S.history.push(hist);
    for (const t of S.teams) {
      const r = st[t.id];
      const res = PBC.League.playoffResult(S, t.id);
      t.history.push({ season: S.season, w: r.w, l: r.l, result: res.label, round: res.round, champ: !!res.champ, seed: P && P.seeds[t.id] ? P.seeds[t.id].seed : null });
    }
    // player rating history snapshot
    for (const p of Object.values(S.players)) {
      if (p.tid >= 0 || p.tid === -1) p.hist.push({ season: S.season, ovr: p.ovr, pot: p.pot, tid: p.tid, age: p.age });
    }
    const coyTid = aw.coyTid;
    if (coyTid === S.userTid && PBC.Coach) PBC.Coach.unlock(S, 'coy');
    Season.news(S, `🏅 Awards — MVP: ${aw.mvp != null ? PBC.Player.name(S.players[aw.mvp]) : '—'} · DPOY: ${aw.dpoy != null ? PBC.Player.name(S.players[aw.dpoy]) : '—'} · ROY: ${aw.roy != null ? PBC.Player.name(S.players[aw.roy]) : '—'} · Coach of the Year: ${coyTid === S.userTid ? 'YOU!' : S.teams[coyTid].city + ' ' + S.teams[coyTid].name}`, 'award');
    if (PBC.Coach) PBC.Coach.endSeason(S);
    S.phase = 'awards';
  };

  // ---------------------------------------------------------------------------
  // Convenience: advance until a condition
  // ---------------------------------------------------------------------------
  /** Sim full days until the user has a game today (not played). Returns the user's game or null if the phase ended. */
  Season.advanceToUserGame = function (S, maxDays) {
    let n = 0;
    while (n++ < (maxDays || 400)) {
      if (!(S.phase === 'regular' || S.phase === 'playin' || S.phase === 'playoffs')) return null;
      Season.prepareToday(S);
      const ug = Season.userGameToday(S);
      if (ug) return ug;
      // user not playing today: stop at practice if needed is handled by the UI
      const today = S.phase === 'regular' ? S.schedule.some(g => g.day === S.day && !g.played) : (S.todayPost || []).some(g => !g.played);
      if (!today && S.phase !== 'regular' && S.playoffs && S.playoffs.done) { Season.finishPostseason(S); return null; }
      if (S.phase !== 'regular') {
        // eliminated or waiting: if the user has no more postseason games at all, just sim the day
        Season.simDay(S);
      } else {
        Season.simDay(S);
      }
    }
    return null;
  };

  Season.userInPostseason = function (S) {
    const P = S.playoffs;
    if (!P) return false;
    if (S.phase === 'playin') return P.playIn.some(x => (x.hi === S.userTid || x.lo === S.userTid) && x.winner == null) || P.playIn.some(x => x.stage === 'C' && (x.hi === S.userTid || x.lo === S.userTid) && x.winner == null);
    return P.series.some(s => !s.done && (s.hi === S.userTid || s.lo === S.userTid));
  };

  PBC.Season = Season;
})();
