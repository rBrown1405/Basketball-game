/* Pro BBALL Coach: All-Star weekend (PBC.AllStar). No DOM.
 *
 * When the All-Star rosters are announced (Season.allStar), the weekend's invitations go out: the three-point contest
 * (eight of the league's best shooters), the dunk contest (four of its best leapers; the men's league only), the skills
 * challenge (eight, a bracket), and the All-Star Game itself between the two conferences (or two captains' teams). The
 * weekend happens on the first day of the break. The contests are simulated rack by rack, dunk by dunk and run by run
 * from the players' ratings; the game is a fast exhibition simulation, high scoring and spread out. The results go in
 * the record books (S.allStarHist), the winners get it on their record (p.awards), and the press writes it up. Your
 * invited players can be held out (the Desk asks).
 *
 *   S.allStarWknd = { season, day, invites: { three: [pid], dunk: [pid], skills: [pid] }, out: [pid], done }
 *   S.allStarHist = [Weekend]   Weekend = { season, three, dunk, skills, game }   (newest last)
 */
(function () {
  'use strict';
  const PBC = (window.PBC = window.PBC || {});
  const U = PBC.U;
  const AS = (PBC.AllStar = PBC.AllStar || {});

  function makeRng(seed) {
    let s = seed >>> 0;
    const r = function () {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    r.int = (a, b) => Math.floor(a + (b - a + 1) * r());
    r.pick = arr => arr[Math.floor(r() * arr.length)];
    r.gauss = (m, sd) => { let u = 0, v = 0; while (u === 0) u = r(); while (v === 0) v = r(); return m + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    r.chance = p => r() < p;
    return r;
  }
  const rng = (S, salt) => makeRng(U.hash(`${S.saveId || 'save'}|allstar|${S.season}|${salt || ''}`));
  const nm = p => (p ? PBC.Player.name(p) : '');
  const healthy = p => p && p.tid >= 0 && !PBC.Player.isInjured(p);
  const isW = S => PBC.League.cfg(S).key === 'women';

  AS.HIST_MAX = 60;

  // ---------------------------------------------------------------------------
  // The invitations (Season.allStar, after the rosters)
  // ---------------------------------------------------------------------------
  AS.announce = function (S) {
    if (S.allStarWknd && S.allStarWknd.season === S.season) return S.allStarWknd;
    const R = rng(S, 'invites');
    const pool = Object.values(S.players).filter(healthy);
    const line = p => PBC.Stats.season(p, S.season, false);
    const top = (arr, f, n) => U.sortBy(arr.map(p => ({ p, v: f(p) })), x => x.v, true).slice(0, n).map(x => x.p.id);
    const three = top(pool, p => {
      const s = line(p);
      const tpg = s && s.gp ? s.tpa / s.gp : 0;
      return p.r.three + Math.min(8, tpg) * 2.2 + (s && s.tpa >= 40 ? (s.tpm / s.tpa - 0.36) * 60 : 0) + R() * 3;
    }, 8);
    const dunk = isW(S) ? [] : top(pool.filter(p => !three.includes(p.id)), p => p.r.dunk * 0.55 + p.r.vert * 0.45 + (p.age <= 25 ? 4 : 0) - (p.ovr >= 86 ? 6 : 0) + R() * 7, 4);
    const used = new Set(three.concat(dunk));
    const sk = p => p.r.handle * 0.32 + p.r.pass * 0.28 + p.r.speed * 0.22 + p.r.three * 0.18;
    const guards = top(pool.filter(p => !used.has(p.id) && (p.pos === 'PG' || p.pos === 'SG' || p.pos === 'SF')), p => sk(p) + R() * 4, 5);
    const bigs = top(pool.filter(p => !used.has(p.id) && (p.pos === 'PF' || p.pos === 'C')), p => sk(p) + R() * 4, 3);
    const W = S.allStarWknd = { season: S.season, day: S.allStarDay >= 0 ? Math.max(S.allStarDay, S.day + 1) : S.day + 1, invites: { three, dunk, skills: guards.concat(bigs) }, out: [], done: false };
    return W;
  };
  /** your invited players (the Desk's question) */
  AS.userInvites = function (S) {
    const W = S.allStarWknd;
    if (!W || W.season !== S.season || W.done) return [];
    const out = [];
    for (const k of ['three', 'dunk', 'skills']) for (const id of W.invites[k] || []) { const p = S.players[id]; if (p && p.tid === S.userTid) out.push({ pid: id, k }); }
    return out;
  };
  /** hold a player out of the contests */
  AS.holdOut = function (S, pid) {
    const W = S.allStarWknd;
    if (W && !W.out.includes(pid)) W.out.push(pid);
  };

  // ---------------------------------------------------------------------------
  // The contests
  // ---------------------------------------------------------------------------
  // the three-point contest: five racks of five, the last ball of each rack worth two (30 at most); the top three of
  // eight go to the final
  function threeRound(R, p, final) {
    const base = U.clamp(0.4 + (p.r.three - 70) * 0.012, 0.2, 0.74) + (final ? (p.r.clutch - 70) * 0.0015 : 0);
    let pts = 0, made = 0;
    const racks = [];
    for (let rk = 0; rk < 5; rk++) {
      const rhythm = R.gauss(0, 0.05) - rk * 0.008;
      let rp = 0;
      for (let b = 0; b < 5; b++) {
        if (R() < U.clamp(base + rhythm, 0.1, 0.85)) { const v = b === 4 ? 2 : 1; pts += v; rp += v; made++; }
      }
      racks.push(rp);
    }
    return { pts, made, racks };
  }
  function runThree(S, ids, R) {
    const ps = ids.map(id => S.players[id]).filter(healthy);
    if (ps.length < 3) return null;
    const r1 = ps.map(p => Object.assign({ pid: p.id, tid: p.tid }, threeRound(R, p, false)));
    // ties for the last spot: a quick shoot-off (the better shooter usually)
    const ord = U.sortBy(r1, x => x.pts + x.made * 0.01 + R() * 0.001, true);
    const fin = ord.slice(0, 3).map(x => Object.assign({ pid: x.pid, tid: x.tid }, threeRound(R, S.players[x.pid], true)));
    const win = U.sortBy(fin, x => x.pts + x.made * 0.01 + R() * 0.001, true)[0];
    return { r1, final: fin, winner: win.pid, wtid: win.tid, score: win.pts };
  }

  // the dunk contest: two dunks in the first round, the top two dunk twice more; five judges, 6 to 10 each
  const DUNKS = [
    { n: 'a 360 windmill', d: 8 }, { n: 'between the legs off the bounce', d: 9 }, { n: 'from the free-throw line', d: 10 }, { n: 'a reverse two-handed jam', d: 4 },
    { n: 'a tomahawk off the backboard', d: 7 }, { n: 'a behind-the-back finish', d: 8 }, { n: 'over a teammate', d: 7 }, { n: 'a self alley-oop off the glass', d: 6 },
    { n: 'a cradle rock', d: 5 }, { n: 'an elbow in the rim', d: 7 }, { n: 'a 540', d: 10 }, { n: 'a double-pump reverse', d: 5 },
    { n: 'a no-look alley-oop from the stands', d: 6 }, { n: 'a 360 between the legs', d: 10 }, { n: 'a windmill from the baseline', d: 6 }, { n: 'a two-ball dunk', d: 8 },
  ];
  function dunk(R, p, final, used) {
    const ability = p.r.dunk * 0.55 + p.r.vert * 0.45;
    const pool = DUNKS.filter(x => !used.has(x.n));
    // the better dunkers go for the harder ones
    const want = U.clamp((ability - 60) / 4 + (final ? 1.5 : 0), 3, 10);
    const pick = U.minBy(pool.length ? pool : DUNKS, x => Math.abs(x.d - want) + R() * 3);
    used.add(pick.n);
    const tries = 1 + (R() < U.clamp(0.08 + (pick.d - ability / 11) * 0.06, 0.03, 0.6) ? 1 : 0) + (R() < 0.12 ? 1 : 0);
    const made = tries < 3 || R() < 0.7;
    // (an elite dunker averages about 46 with a hard dunk; a 50 takes something special)
    const q = (ability - 70) * 0.2 + (pick.d - 5) * 0.6 + R.gauss(0, 3) - (tries - 1) * 2.5;
    const score = made ? Math.round(U.clamp(40 + q, 30, 50)) : 30 + R.int(0, 4);
    return { dunk: pick.n, d: pick.d, tries, made, score };
  }
  function runDunk(S, ids, R) {
    const ps = ids.map(id => S.players[id]).filter(healthy);
    if (ps.length < 2) return null;
    const used = new Set();
    const r1 = ps.map(p => { const a = dunk(R, p, false, used), b = dunk(R, p, false, used); return { pid: p.id, tid: p.tid, dunks: [a, b], total: a.score + b.score }; });
    const top2 = U.sortBy(r1, x => x.total + R() * 0.01, true).slice(0, 2);
    const fin = top2.map(x => { const p = S.players[x.pid]; const a = dunk(R, p, true, used), b = dunk(R, p, true, used); return { pid: p.id, tid: p.tid, dunks: [a, b], total: a.score + b.score }; });
    let win = fin[0].total >= fin[1].total ? fin[0] : fin[1];
    let dunkoff = null;
    if (fin[0].total === fin[1].total) {
      // a dunk-off
      dunkoff = fin.map(x => ({ pid: x.pid, d: dunk(R, S.players[x.pid], true, used) }));
      win = dunkoff[0].d.score >= dunkoff[1].d.score ? fin[0] : fin[1];
    }
    const perfect = fin.some(x => x.dunks.some(d => d.score === 50));
    return { r1, final: fin, dunkoff, winner: win.pid, wtid: win.tid, score: win.total, perfect };
  }

  // the skills challenge: a bracket of eight, head to head on the course (dribbling, passing, a three to finish)
  function course(R, p) {
    const skill = p.r.handle * 0.32 + p.r.pass * 0.28 + p.r.speed * 0.22 + p.r.three * 0.18;
    let t = 50 - skill * 0.25 + R.gauss(0, 2.2);
    let miss = 0;
    if (R() < U.clamp(0.35 - (p.r.pass - 60) * 0.006, 0.05, 0.5)) { t += 2.5; miss++; }
    while (R() < U.clamp(0.5 - (p.r.three - 60) * 0.009, 0.08, 0.7) && miss < 4) { t += 2.2; miss++; }
    return { t: U.round(Math.max(18, t), 1), miss };
  }
  function runSkills(S, ids, R) {
    let ps = ids.map(id => S.players[id]).filter(healthy);
    if (ps.length < 2) return null;
    // seed by skill, pair the best with the worst
    ps = U.sortBy(ps, p => p.r.handle * 0.32 + p.r.pass * 0.28 + p.r.speed * 0.22 + p.r.three * 0.18, true);
    while (ps.length & (ps.length - 1)) ps.pop();      // a full bracket (8, 4, 2)
    const rounds = [];
    let cur = ps.map(p => p.id);
    while (cur.length > 1) {
      const pairs = [];
      for (let i = 0; i < cur.length / 2; i++) {
        const a = cur[i], b = cur[cur.length - 1 - i];
        const ra = course(R, S.players[a]), rb = course(R, S.players[b]);
        pairs.push({ a, b, ta: ra.t, tb: rb.t, w: ra.t <= rb.t ? a : b });
      }
      rounds.push(pairs);
      cur = pairs.map(x => x.w);
    }
    const last = rounds[rounds.length - 1][0];
    return { rounds, winner: cur[0], wtid: S.players[cur[0]].tid, time: last.w === last.a ? last.ta : last.tb };
  }

  // ---------------------------------------------------------------------------
  // The All-Star Game: the two conferences (or two captains' teams), a fast exhibition
  // ---------------------------------------------------------------------------
  function sides(S, R) {
    const L = PBC.League.cfg(S);
    const ids = (S.allStars || []).filter(id => S.players[id] && healthy(S.players[id]));
    if (ids.length < 10) return null;
    if (L.playoffFormat === 'conference' && L.confs && L.confs.length === 2) {
      const a = ids.filter(id => S.teams[S.players[id].tid].conf === 0), b = ids.filter(id => S.teams[S.players[id].tid].conf === 1);
      if (a.length >= 5 && b.length >= 5) return [{ name: 'Team ' + L.confs[0], pids: a }, { name: 'Team ' + L.confs[1], pids: b }];
    }
    // two captains (the two best) draft their teams
    const ord = U.sortBy(ids, id => S.players[id].ovr, true);
    const A = [], B = [];
    ord.forEach((id, i) => ((i % 4 === 0 || i % 4 === 3) ? A : B).push(id));
    return [{ name: 'Team ' + S.players[A[0]].last, pids: A }, { name: 'Team ' + S.players[B[0]].last, pids: B }];
  }
  function runGame(S, R) {
    const T = sides(S, R);
    if (!T) return null;
    const box = [];
    const L = PBC.League.cfg(S);
    const MT = L.minutesTotal || 240;               // a team's minutes (a 40-minute game in the women's league)
    const PTS = isW(S) ? 132 : 172;                  // about what these exhibitions score
    const str = T.map(t => U.avg(t.pids.slice(0, 10), id => S.players[id].ovr));
    const pWin0 = U.clamp(0.5 + (str[0] - str[1]) * 0.04, 0.2, 0.8);
    const total = [0, 0];
    T.forEach((t, side) => {
      const ps = U.sortBy(t.pids.map(id => S.players[id]), p => p.ovr, true);
      // minutes: the starters a little more, everybody plays
      const mins = ps.map((p, i) => (i < 5 ? 26 : 16) + R.gauss(0, 3));
      const ms = mins.reduce((a, b) => a + b, 0);
      const teamPts = Math.round(R.gauss(PTS, PTS * 0.055) + (side === 0 ? 1 : -1) * (pWin0 - 0.5) * 18);
      const usage = ps.map((p, i) => Math.pow(Math.max(1, p.ovr - 58), 1.4) * (0.6 + (p.r.three + p.r.dunk + p.r.layup) / 300) * (mins[i] / ms) * U.clamp(R.gauss(1, 0.28), 0.3, 1.9));
      const us = usage.reduce((a, b) => a + b, 0);
      let left = teamPts;
      ps.forEach((p, i) => {
        const min = Math.min(Math.round(MT * 0.135), Math.round(mins[i] * MT / ms));
        const pts = i === ps.length - 1 ? Math.max(0, left) : Math.max(0, Math.round(teamPts * usage[i] / us));
        left -= pts;
        const tpm = Math.min(Math.floor(pts / 3), Math.max(0, Math.round(pts * (p.r.three / 100) * 0.42 / 3 + R.gauss(0, 1))));
        const reb = Math.max(0, Math.round(min * (p.r.dreb + p.r.oreb) / 200 * 0.42 + R.gauss(0, 1.5)));
        const ast = Math.max(0, Math.round(min * (p.r.pass + p.r.vision) / 200 * 0.3 + R.gauss(0, 1.5)));
        box.push({ pid: p.id, tid: p.tid, side, min, pts, reb, ast, tpm, st: i < 5 });
      });
      total[side] = teamPts;
    });
    if (total[0] === total[1]) total[R() < pWin0 ? 0 : 1] += 2;
    // keep the box in line with the final score
    for (const side of [0, 1]) {
      const rows = box.filter(b => b.side === side);
      const sum = rows.reduce((a, b) => a + b.pts, 0);
      if (sum !== total[side]) U.maxBy(rows, b => b.pts).pts += total[side] - sum;
    }
    const win = total[0] > total[1] ? 0 : 1;
    const gs = b => b.pts + b.reb * 0.7 + b.ast * 0.8 + b.tpm * 0.5;
    const mvpRow = U.maxBy(box.filter(b => b.side === win || gs(b) > 60), b => gs(b) + (b.side === win ? 6 : 0) + R() * 3);
    return { teams: T.map((t, i) => ({ name: t.name, pids: t.pids, pts: total[i] })), box, winner: win, mvp: mvpRow.pid, mvpTid: mvpRow.tid };
  }

  // ---------------------------------------------------------------------------
  // The weekend (Season.endDay on the first day of the break)
  // ---------------------------------------------------------------------------
  AS.due = S => !!(S.allStarWknd && S.allStarWknd.season === S.season && !S.allStarWknd.done && S.day >= S.allStarWknd.day);
  AS.run = function (S) {
    const W = S.allStarWknd;
    if (!W || W.done) return null;
    W.done = true;
    const R = rng(S, 'weekend');
    const keep = ids => (ids || []).filter(id => !W.out.includes(id));
    const res = { season: S.season, three: runThree(S, keep(W.invites.three), R), dunk: runDunk(S, keep(W.invites.dunk), R), skills: runSkills(S, keep(W.invites.skills), R), game: runGame(S, R) };
    (S.allStarHist = S.allStarHist || []).push(res);
    if (S.allStarHist.length > AS.HIST_MAX) S.allStarHist.shift();
    // the record: the winners
    const award = (pid, type, detail) => { const p = S.players[pid]; if (p) p.awards.push({ season: S.season, type, detail: detail || '' }); };
    if (res.three) award(res.three.winner, 'threeChamp', `${res.three.score} in the final`);
    if (res.dunk) award(res.dunk.winner, 'dunkChamp', `${res.dunk.score} in the final`);
    if (res.skills) award(res.skills.winner, 'skillsChamp', `${res.skills.time}s in the final`);
    if (res.game) { const b = res.game.box.find(x => x.pid === res.game.mvp); award(res.game.mvp, 'asgMvp', b ? `${b.pts} pts, ${b.reb} reb, ${b.ast} ast` : ''); }
    // a little injury risk in the dunk contest (it happens)
    if (res.dunk) for (const x of res.dunk.r1) {
      const p = S.players[x.pid];
      if (p && R() < 0.02) { p.injury = PBC.Player.genInjury(0.4); if (PBC.Season) PBC.Season.news(S, `🚑 ${nm(p)} came up limping after the dunk contest: ${PBC.Player.injuryLabel(p.injury)}.`, 'injury', p.tid); }
    }
    // the morale of the night: winners, and everyone who was invited
    for (const k of ['three', 'dunk', 'skills']) for (const id of keep(W.invites[k])) { const p = S.players[id]; if (p) p.morale = Math.min(100, (p.morale == null ? 70 : p.morale) + 2); }
    for (const id of [res.three && res.three.winner, res.dunk && res.dunk.winner, res.skills && res.skills.winner, res.game && res.game.mvp]) { const p = S.players[id]; if (p) p.morale = Math.min(100, (p.morale == null ? 70 : p.morale) + 4); }
    // the news, your achievements, the press
    const line = [];
    if (res.game) line.push(`${res.game.teams[res.game.winner].name} won the All-Star Game ${res.game.teams[res.game.winner].pts}-${res.game.teams[1 - res.game.winner].pts}, MVP ${nm(S.players[res.game.mvp])}`);
    if (res.three) line.push(`three-point contest: ${nm(S.players[res.three.winner])}`);
    if (res.dunk) line.push(`dunk contest: ${nm(S.players[res.dunk.winner])}`);
    if (res.skills) line.push(`skills challenge: ${nm(S.players[res.skills.winner])}`);
    if (line.length && PBC.Season) PBC.Season.news(S, `🌟 All-Star weekend: ${line.join('; ')}.`, 'award', -1);
    const u = S.userTid;
    const mine = pid => S.players[pid] && S.players[pid].tid === u;
    if (PBC.Coach) {
      if (res.three && mine(res.three.winner)) PBC.Coach.unlock(S, 'three_champ');
      if (res.dunk && mine(res.dunk.winner)) PBC.Coach.unlock(S, 'dunk_champ');
      if (res.game && mine(res.game.mvp)) PBC.Coach.unlock(S, 'asg_mvp');
      if ((S.allStars || []).filter(mine).length >= 3) PBC.Coach.unlock(S, 'all_star_3');
    }
    if (PBC.Media && PBC.Media.allStarWeekend) PBC.Media.allStarWeekend(S, res);
    return res;
  };
  /** this season's weekend (or the last one) */
  AS.latest = S => (S.allStarHist && S.allStarHist.length ? S.allStarHist[S.allStarHist.length - 1] : null);
  AS.DUNKS = DUNKS;
})();
