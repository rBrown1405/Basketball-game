/* Pro BBALL Coach: rivalries (PBC.Rivals). No DOM.
 *
 * Every pair of teams has a heat that builds with what happens between them: playoff series (the longer and the closer,
 * the hotter; a Game 7 most of all, an upset too), close games and overtime, two good teams meeting, the same division,
 * a star who leaves one for the other, trash talk from your Desk. It cools a little every week and more every summer.
 * Heat 18+ is a rivalry, 35+ a bitter one, 60+ a blood feud. Rivalry games carry a little more at stake in the engine
 * (tighter rotations, a louder building), the schedule and the pregame mark them, the press writes them up, and the
 * booth knows the history.
 *
 *   S.rivals = { v, pairs: { 'a-b': Pair } }   (a < b, team ids)
 *   Pair = { heat, peak, peakSeason, g: [winsA, winsB] (regular season), po: [{ season, round, w: [a, b], winner, g7 }],
 *            last: { season, day, why }, born }
 */
(function () {
  'use strict';
  const PBC = (window.PBC = window.PBC || {});
  const U = PBC.U;
  const Rivals = (PBC.Rivals = PBC.Rivals || {});

  Rivals.V = 1;
  Rivals.LEVELS = [
    { min: 60, lvl: 3, label: 'Blood feud', icon: '🔥🔥🔥' },
    { min: 35, lvl: 2, label: 'Bitter rivalry', icon: '🔥🔥' },
    { min: 18, lvl: 1, label: 'Rivalry', icon: '🔥' },
  ];
  // what builds it
  Rivals.HEAT = { game: 0.35, division: 0.35, close: 0.9, ot: 1.1, good: 0.6, poGame: 0.8, series: 9, seriesGame: 2, game7: 6, late: 4, upset: 3, star: 5, trash: 3 };
  Rivals.WEEK = 0.988;      // a week's cooling
  Rivals.SUMMER = 0.8;      // a summer's
  Rivals.CAP = 100;

  const key = (a, b) => (a < b ? a + '-' + b : b + '-' + a);
  Rivals.key = key;
  Rivals.ensure = function (S) {
    let R = S.rivals;
    if (!R || typeof R !== 'object' || !R.pairs) R = S.rivals = { v: Rivals.V, pairs: {} };
    return R;
  };
  /** the pair's record (made on first touch) */
  Rivals.pair = function (S, a, b, make) {
    const R = Rivals.ensure(S);
    const k = key(a, b);
    let p = R.pairs[k];
    if (!p && make) p = R.pairs[k] = { heat: 0, peak: 0, peakSeason: null, g: [0, 0], po: [], last: null, born: null };
    return p || null;
  };
  /** heat between two teams */
  Rivals.heat = (S, a, b) => { const p = S.rivals && S.rivals.pairs[key(a, b)]; return p ? p.heat : 0; };
  /** the rivalry's level: null, or { lvl 1..3, label, icon, heat } */
  Rivals.level = function (S, a, b) {
    if (a == null || b == null || a === b) return null;
    const h = Rivals.heat(S, a, b);
    const L = Rivals.LEVELS.find(x => h >= x.min);
    return L ? { lvl: L.lvl, label: L.label, icon: L.icon, heat: U.round(h, 1) } : null;
  };
  /** add heat (why: a short note for the record) */
  Rivals.add = function (S, a, b, d, why) {
    if (a == null || b == null || a === b || a < 0 || b < 0 || !d) return null;
    const p = Rivals.pair(S, a, b, true);
    const before = Rivals.level(S, a, b);
    p.heat = U.round(U.clamp(p.heat + d, 0, Rivals.CAP), 2);
    if (p.heat > p.peak) { p.peak = p.heat; p.peakSeason = S.season; }
    if (why) p.last = { season: S.season, day: S.day, why };
    const after = Rivals.level(S, a, b);
    // a rivalry is born (or goes up a level): the league notices
    if (after && (!before || after.lvl > before.lvl)) {
      if (!p.born) p.born = S.season;
      if (PBC.Media && PBC.Media.rivalry) PBC.Media.rivalry(S, a, b, after, why);
      const u = S.userTid;
      if ((a === u || b === u) && PBC.Coach && after.lvl >= 3) PBC.Coach.unlock(S, 'blood_feud');
    }
    return p;
  };
  /** the head-to-head (regular season) from a's side: [wins, losses] */
  Rivals.h2h = function (S, a, b) {
    const p = Rivals.pair(S, a, b, false);
    if (!p) return [0, 0];
    return a < b ? [p.g[0], p.g[1]] : [p.g[1], p.g[0]];
  };

  // ---------------------------------------------------------------------------
  // What builds it
  // ---------------------------------------------------------------------------
  /** every game (Season.completeGame) */
  Rivals.game = function (S, sg, box) {
    if (!sg || !box || sg.h == null || sg.a == null) return;
    const H = Rivals.HEAT;
    const h = sg.h, a = sg.a;
    const margin = Math.abs(box.hs - box.as);
    const winner = box.hs > box.as ? h : a;
    const p = Rivals.pair(S, h, a, true);
    let d = sg.playoff ? H.poGame : H.game;
    const why = [];
    const th = S.teams[h], ta = S.teams[a];
    if (!sg.playoff && th && ta && th.div != null && th.div === ta.div) d += H.division;
    if (margin <= 3) { d += H.close; why.push('a one-possession game'); }
    if (box.ot) { d += H.ot * Math.min(2, box.ot); why.push(box.ot > 1 ? `${box.ot} overtimes` : 'overtime'); }
    if (!sg.playoff) {
      const st = PBC.League.standings(S);
      const rh = st[h], ra = st[a];
      const good = r => r && r.gp >= 10 && r.w / r.gp >= 0.56;
      if (good(rh) && good(ra)) { d += H.good; why.push('two of the league\'s best teams going at it'); }
      if (winner === Math.min(h, a)) p.g[0]++; else p.g[1]++;
    }
    Rivals.add(S, h, a, d, why.length ? why[0] : null);
  };
  /** a playoff series is over (League.recordPostseasonGame) */
  Rivals.series = function (S, s) {
    if (!s || s.winner == null) return;
    const H = Rivals.HEAT;
    const P = S.playoffs;
    const games = s.w[0] + s.w[1];
    const g7 = s.len === 7 && games === 7;
    // your series: a Game 7 won, a comeback from 3-1 down, a rival beaten (achievements)
    const u = S.userTid;
    if (PBC.Coach && s.winner === u) {
      if (g7) PBC.Coach.unlock(S, 'game7_win');
      const mine = s.hi === u ? 0 : 1;
      let w = 0, l = 0, down31 = false;
      for (const x of s.path || []) { if (x === mine) w++; else l++; if (s.len === 7 && w === 1 && l === 3) down31 = true; }
      if (down31) PBC.Coach.unlock(S, 'comeback_3_1');
      if (Rivals.level(S, s.hi, s.lo)) PBC.Coach.unlock(S, 'rival_series');
    }
    const fromEnd = P ? (P.rounds || s.round) - s.round : 2;
    let d = H.series + H.seriesGame * Math.max(0, games - Math.ceil(s.len / 2));
    if (g7) d += H.game7;
    if (fromEnd <= 1) d += H.late;
    if (s.winner === s.lo) d += H.upset;
    const p = Rivals.pair(S, s.hi, s.lo, true);
    p.po.push({ season: S.season, round: s.round, w: s.hi < s.lo ? [s.w[0], s.w[1]] : [s.w[1], s.w[0]], winner: s.winner, g7 });
    if (p.po.length > 20) p.po.shift();
    const name = PBC.League.roundName ? PBC.League.roundName(S, s.round) : 'the playoffs';
    Rivals.add(S, s.hi, s.lo, d, g7 ? `a Game 7 in the ${name}` : `${games} games in the ${name}`);
  };
  /** a player of note moved between two teams (a trade, or free agency: he left them for us) */
  Rivals.move = function (S, p, from, to, how) {
    if (!p || from == null || to == null || from < 0 || to < 0 || from === to) return;
    if (p.ovr < (how === 'fa' ? 78 : 80)) return;
    Rivals.add(S, from, to, Rivals.HEAT.star * (how === 'fa' ? 1.2 : 0.6) * (p.ovr >= 86 ? 1.5 : 1), `${PBC.Player.name(p)} ${how === 'fa' ? 'leaving one for the other' : 'being traded from one to the other'}`);
  };
  /** words exchanged (the Desk's trash talk) */
  Rivals.trash = (S, a, b, k) => Rivals.add(S, a, b, Rivals.HEAT.trash * (k || 1), 'words in the press');

  // ---------------------------------------------------------------------------
  // Cooling
  // ---------------------------------------------------------------------------
  Rivals.weekly = function (S) {
    const R = Rivals.ensure(S);
    for (const k in R.pairs) {
      const p = R.pairs[k];
      p.heat = U.round(p.heat * Rivals.WEEK, 2);
    }
  };
  Rivals.summer = function (S) {
    const R = Rivals.ensure(S);
    for (const k in R.pairs) {
      const p = R.pairs[k];
      p.heat = U.round(p.heat * Rivals.SUMMER, 2);
      // pairs with nothing between them are forgotten (the save stays small)
      if (p.heat < 1 && !p.po.length && p.peak < 12) delete R.pairs[k];
    }
  };

  // ---------------------------------------------------------------------------
  // Reading
  // ---------------------------------------------------------------------------
  /** a team's rivals, hottest first: [{ tid, heat, level, h2h, po, last }] */
  Rivals.of = function (S, tid, n) {
    const R = S.rivals;
    if (!R) return [];
    const out = [];
    for (const k in R.pairs) {
      const [a, b] = k.split('-').map(Number);
      if (a !== tid && b !== tid) continue;
      const p = R.pairs[k], o = a === tid ? b : a;
      if (p.heat < 6 && !p.po.length) continue;
      out.push({ tid: o, heat: p.heat, peak: p.peak, level: Rivals.level(S, tid, o), h2h: Rivals.h2h(S, tid, o), po: p.po, last: p.last, born: p.born });
    }
    return U.sortBy(out, x => x.heat, true).slice(0, n || 8);
  };
  /** the league's hottest rivalries: [{ a, b, heat, level, po }] */
  Rivals.top = function (S, n) {
    const R = S.rivals;
    if (!R) return [];
    const out = [];
    for (const k in R.pairs) {
      const [a, b] = k.split('-').map(Number);
      const p = R.pairs[k];
      const lv = Rivals.level(S, a, b);
      if (!lv) continue;
      out.push({ a, b, heat: p.heat, level: lv, po: p.po, g: p.g, last: p.last, born: p.born });
    }
    return U.sortBy(out, x => x.heat, true).slice(0, n || 10);
  };
  /** the playoff history between two teams, as a line ("3 meetings, CHI won 2") */
  Rivals.historyLine = function (S, a, b) {
    const p = Rivals.pair(S, a, b, false);
    if (!p || !p.po.length) return '';
    const wa = p.po.filter(x => x.winner === a).length;
    const ta = S.teams[a], tb = S.teams[b];
    const last = p.po[p.po.length - 1];
    return `${p.po.length} playoff meeting${p.po.length === 1 ? '' : 's'}: ${ta.abbr} ${wa}, ${tb.abbr} ${p.po.length - wa}. Last: ${U.seasonLabel(last.season)}, ${S.teams[last.winner].abbr} in ${last.w[0] + last.w[1]}${last.g7 ? ' (Game 7)' : ''}.`;
  };
})();
