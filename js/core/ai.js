/* Pro BBALL Coach — AI team management: rotations, strategy choice, roster filling. */
(function () {
  'use strict';
  const PBC = (window.PBC = window.PBC || {});
  const U = PBC.U, C = PBC.Config;
  const AI = {};

  const POS = C.POSITIONS;

  function combos(arr, k) {
    const out = [];
    const rec = (start, cur) => {
      if (cur.length === k) { out.push(cur.slice()); return; }
      for (let i = start; i < arr.length; i++) { cur.push(arr[i]); rec(i + 1, cur); cur.pop(); }
    };
    rec(0, []);
    return out;
  }

  /** Best starting five from healthy players (position-aware). Returns array of players ordered PG..C. */
  AI.bestFive = function (players) {
    const cand = players.slice(0, 8);
    if (cand.length <= 5) return cand;
    let best = null, bestScore = -Infinity;
    for (const five of combos(cand, 5)) {
      const ordered = U.sortBy(five, p => C.POS_NUM[p.pos] + (p.hgt || 0) * 0.001);
      let s = 0;
      ordered.forEach((p, i) => {
        s += PBC.Player.ovrAt(p, POS[i]);
        s -= Math.abs(C.POS_NUM[p.pos] - (i + 1)) * 2.5;
      });
      const guards = five.filter(p => C.POS_NUM[p.pos] <= 2).length;
      const bigs = five.filter(p => C.POS_NUM[p.pos] >= 4).length;
      if (!guards) s -= 25;
      if (!bigs) s -= 25;
      if (s > bestScore) { bestScore = s; best = ordered; }
    }
    return best;
  };

  AI.autoRotation = function (S, tid) {
    const L = PBC.League.cfg(S);
    const team = S.teams[tid];
    const healthy = PBC.League.roster(S, tid).filter(p => !PBC.Player.isInjured(p));
    const starters = AI.bestFive(healthy);
    const bench = healthy.filter(p => !starters.includes(p));
    const minutes = {};
    const sTmpl = L.key === 'women' ? [34, 32, 31, 29, 27] : [35, 34, 32, 31, 29];
    const bTmpl = L.key === 'women' ? [20, 14, 9, 4] : [24, 20, 16, 11, 8];
    U.sortBy(starters, p => p.ovr, true).forEach((p, i) => { minutes[p.id] = sTmpl[i] || 28; });
    bench.forEach((p, i) => { minutes[p.id] = bTmpl[i] || 0; });
    // top-heavy tweak: if the 6th man is better than a starter, give him more
    const total = U.sum(Object.values(minutes));
    const diff = L.minutesTotal - total;
    if (diff !== 0 && starters.length) minutes[starters[0].id] += diff;
    team.rot = { starters: starters.map(p => p.id), minutes, auto: true };
    return team.rot;
  };

  AI.chooseStrategy = function (S, tid) {
    const team = S.teams[tid];
    const roster = PBC.League.roster(S, tid).filter(p => !PBC.Player.isInjured(p)).slice(0, 8);
    if (!roster.length) return team.strat;
    const avg = k => U.avg(roster, p => p.r[k]);
    const star = roster[0];
    const bestPost = Math.max(...roster.map(p => p.r.post));
    const bestBlock = Math.max(...roster.filter(p => C.POS_NUM[p.pos] >= 4).map(p => p.r.block), 0);
    const iq = (avg('shotIQ') + avg('vision') + avg('pass')) / 3;
    let off = 'balanced';
    const r = U.rand();
    if (star.ovr >= 90 && C.POS_NUM[star.pos] <= 3 && star.r.handle >= 80) off = r < 0.3 ? 'heliocentric' : r < 0.75 ? 'pnrHeavy' : 'balanced';
    else if (avg('three') >= 73) off = r < 0.7 ? 'paceSpace' : 'motion';
    else if (bestPost >= 80) off = r < 0.6 ? 'postUp' : 'triangle';
    else if (avg('speed') >= 76) off = r < 0.5 ? 'runGun' : 'dribbleDrive';
    else if (iq >= 71) off = r < 0.5 ? 'motion' : 'princeton';
    else off = U.pick(['balanced', 'balanced', 'pnrHeavy', 'motion', 'iso']);
    let def = 'man';
    const rd = U.rand();
    if (bestBlock >= 82) def = rd < 0.6 ? 'drop' : 'man';
    else if (avg('perD') >= 70) def = rd < 0.55 ? 'switch' : 'pressure';
    else if (avg('steal') >= 68) def = rd < 0.5 ? 'pressure' : 'blitz';
    else if ((avg('perD') + avg('intD')) / 2 < 58) def = U.pick(['zone23', 'packline', 'zone32']);
    else def = U.pick(['man', 'man', 'drop', 'switch', 'nothree']);
    const spd = avg('speed');
    const ageAvg = U.avg(roster, p => p.age);
    let tempo = 'normal';
    if (off === 'runGun') tempo = 'vfast';
    else if (spd >= 75 && ageAvg < 27) tempo = 'fast';
    else if (off === 'gritGrind' || off === 'princeton' || ageAvg >= 30) tempo = 'slow';
    team.strat = Object.assign({}, team.strat, {
      off, def, tempo,
      focus: avg('three') >= 72 ? 'perimeter' : bestPost >= 80 ? 'inside' : 'balanced',
      crash: avg('oreb') >= 60 ? 'crash' : avg('speed') >= 74 ? 'getback' : 'balanced',
      pressure: avg('steal') >= 66 ? 'aggressive' : 'normal',
      goTo1: star.id, goTo2: roster[1] ? roster[1].id : null,
    });
    return team.strat;
  };

  AI.setupTeam = function (S, tid) {
    AI.autoRotation(S, tid);
    AI.chooseStrategy(S, tid);
  };

  /** Payroll (current season) for a team */
  AI.payroll = function (S, tid) {
    return U.sum(PBC.League.roster(S, tid), p => (p.contract ? p.contract.amt : 0));
  };

  /** Sign free agents until the roster reaches the minimum; release extras over the max. */
  AI.fillRoster = function (S, tid, opts) {
    const L = PBC.League.cfg(S);
    const signed = [];
    let roster = PBC.League.roster(S, tid);
    const minN = (opts && opts.target) || L.rosterMin;
    const healthyNeed = (opts && opts.healthy) || 0;
    const healthyCount = () => PBC.League.roster(S, tid).filter(p => !PBC.Player.isInjured(p)).length;
    let guard = 0;
    while ((roster.length < minN || (healthyNeed && healthyCount() < healthyNeed && roster.length < L.rosterMax)) && guard++ < 10) {
      const fas = PBC.League.freeAgents(S).filter(p => !PBC.Player.isInjured(p));
      if (!fas.length) break;
      // need positions the team is thin at
      const counts = {};
      for (const p of roster) counts[p.pos] = (counts[p.pos] || 0) + 1;
      const pick = U.maxBy(fas, p => p.ovr + (counts[p.pos] ? 0 : 3) - Math.max(0, p.age - 32));
      const payroll = AI.payroll(S, tid);
      const room = L.cap - payroll;
      const ask = PBC.Player.marketValue(pick, L);
      const amt = Math.max(L.minSalary, Math.min(ask, room > ask ? ask : L.minSalary));
      pick.tid = tid;
      pick.contract = { amt: Math.round(amt / 1e4) * 1e4, exp: S.season + (S.phase === 'regular' || S.phase === 'preseason' ? 0 : U.int(0, 1)), rookie: false };
      PBC.Player.assignNumber(S, pick);
      signed.push(pick);
      roster = PBC.League.roster(S, tid);
    }
    // too many players: release the least valuable (cheapest to cut first)
    while (roster.length > L.rosterMax) {
      const cut = U.minBy(roster, p => p.ovr * 3 + (p.pot - p.ovr) * (p.age < 24 ? 1.5 : 0) + (p.contract ? p.contract.amt / L.cap * 60 : 0));
      AI.release(S, cut);
      roster = PBC.League.roster(S, tid);
    }
    if (signed.length && !(opts && opts.quiet)) {
      for (const p of signed) if (tid !== S.userTid && PBC.Season) PBC.Season.news(S, `${S.teams[tid].city} sign ${PBC.Player.name(p)} (${p.pos}, ${p.ovr} OVR)`, 'transaction', tid);
    }
    if (signed.length && S.teams[tid].rot.auto !== false) AI.autoRotation(S, tid);
    return signed;
  };

  AI.release = function (S, p) {
    const tid = p.tid;
    p.tid = -1;
    p.contract = { amt: PBC.Player.marketValue(p, PBC.League.cfg(S)), exp: S.season, rookie: false };
    if (tid >= 0) {
      const team = S.teams[tid];
      if (team.rot) {
        team.rot.starters = team.rot.starters.filter(id => id !== p.id);
        delete team.rot.minutes[p.id];
      }
      if (team.strat.goTo1 === p.id) team.strat.goTo1 = null;
      if (team.strat.goTo2 === p.id) team.strat.goTo2 = null;
    }
  };

  /** Daily upkeep for AI teams: re-set rotations when health changes, sign fill-ins when short-handed. */
  AI.daily = function (S) {
    const byTeam = {};
    for (const id in S.players) { const p = S.players[id]; if (p.tid >= 0) (byTeam[p.tid] = byTeam[p.tid] || []).push(p); }
    for (const t of S.teams) {
      if (t.id === S.userTid) continue;
      const healthy = (byTeam[t.id] || []).filter(p => !PBC.Player.isInjured(p)).sort((a, b) => b.ovr - a.ovr);
      const key = healthy.map(p => p.id).join(',');
      if (t._healthKey !== key) {
        t._healthKey = key;
        AI.autoRotation(S, t.id);
        if (!t.strat.goTo1 || !healthy.some(p => p.id === t.strat.goTo1)) {
          t.strat.goTo1 = healthy[0] ? healthy[0].id : null;
          t.strat.goTo2 = healthy[1] ? healthy[1].id : null;
        }
      }
      if (healthy.length < 9) AI.fillRoster(S, t.id, { healthy: 9, quiet: false });
    }
  };

  PBC.AI = AI;
})();
