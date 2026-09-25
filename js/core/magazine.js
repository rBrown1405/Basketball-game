/* Pro BBALL Coach — COURTSIDE, the 15-page season preview magazine: content generator (no DOM).
 *
 *   PBC.Magazine.build(S)  -> { v, season, leagueKey, userTid, title, mast, pages: [15 × { kind, num, title, ... }] }
 *   PBC.Magazine.ensure(S) -> S.magazine (built once per season, rebuilt when the season / user team changes)
 *
 * Built at the start of a season (S.phase === 'preseason'). Pure data: strings, numbers, tids and pids —
 * the UI (js/ui/magazine.js) looks up team colors / badges / portraits from S. Uses its own seeded RNG so
 * building the magazine never disturbs the game's random stream, and the same save + season always
 * produces the same issue.
 */
(function () {
  'use strict';
  const PBC = (window.PBC = window.PBC || {});
  const U = PBC.U;
  const M = (PBC.Magazine = PBC.Magazine || {});

  M.VERSION = 1;
  M.MAST = 'COURTSIDE';
  const STRENGTH_W = [0.2, 0.17, 0.15, 0.13, 0.11, 0.09, 0.07, 0.05, 0.03];
  const GRADES = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'F'];

  // ---------------------------------------------------------------------------
  // Local RNG + template writer
  // ---------------------------------------------------------------------------
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
    r.chance = p => r() < p;
    r.pick = arr => arr[Math.floor(r() * arr.length)];
    r.gauss = (m, sd) => {
      let u = 0, v = 0;
      while (!u) u = r();
      while (!v) v = r();
      return m + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    };
    r.pickW = (arr, w) => {
      let tot = 0;
      const ws = arr.map((x, i) => { const v = typeof w === 'function' ? w(x, i) : w[i]; const c = v > 0 && isFinite(v) ? v : 0; tot += c; return c; });
      if (tot <= 0) return r.pick(arr);
      let x = r() * tot;
      for (let i = 0; i < arr.length; i++) { x -= ws[i]; if (x <= 0) return arr[i]; }
      return arr[arr.length - 1];
    };
    r.shuffle = arr => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; };
    return r;
  }

  /** Picks templates without repeating inside one issue, fills {placeholders}. Missing vars stay visible ({x}) so tests catch them. */
  function makeWriter(rng) {
    const used = new Map();
    // banks are often inline literals rebuilt per call, so track usage by content, not identity
    const keyOf = list => list.length + '|' + (typeof list[0] === 'string' ? list[0] : JSON.stringify(list[0]));
    function pick(list) {
      const key = keyOf(list);
      let u = used.get(key);
      if (!u) { u = new Set(); used.set(key, u); }
      let idx = [];
      for (let i = 0; i < list.length; i++) if (!u.has(i)) idx.push(i);
      if (!idx.length) { u.clear(); idx = list.map((_, i) => i); }
      const i = idx[Math.floor(rng() * idx.length)];
      u.add(i);
      return list[i];
    }
    function fill(str, v) {
      return String(str).replace(/\{(\w+)\}/g, (m, k) => {
        const x = v ? v[k] : undefined;
        if (x == null || (typeof x === 'number' && !isFinite(x))) return m;
        return String(x);
      });
    }
    return { pick, fill, say: (list, v) => fill(pick(list), v) };
  }

  // ---------------------------------------------------------------------------
  // Small helpers
  // ---------------------------------------------------------------------------
  const up = s => String(s).toUpperCase();
  const f1 = x => (isFinite(x) ? Number(x).toFixed(1) : '0.0');
  const avg = (arr, f) => (arr.length ? U.sum(arr, f) / arr.length : 0);
  const cap1 = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  const lowerFirst = s => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);
  const listText = arr => (arr.length <= 1 ? arr.join('') : arr.length === 2 ? `${arr[0]} and ${arr[1]}` : `${arr.slice(0, -1).join(', ')} and ${arr[arr.length - 1]}`);
  const pName = p => (p ? `${p.first} ${p.last}` : '');
  /** possessive: Colonials -> Colonials', Empire -> Empire's, JONES -> JONES' */
  const poss = s => String(s) + (/s$/i.test(String(s)) ? '\'' : (String(s) === String(s).toUpperCase() && /[A-Z]/.test(String(s)) ? '\'S' : '\'s'));
  M.poss = poss;
  /** indefinite article: an 85, an 18-64, an Empire; a 76, a Colonials */
  const an = x => { const t = String(x); return /^(8|11(\D|$)|18(\D|$))/.test(t) || (/^[aeiou]/i.test(t) && !/^(uni|use|one)/i.test(t)) ? 'an' : 'a'; };
  const withAn = x => `${an(x)} ${x}`;
  M.an = an;
  const NUM_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
  const numWord = n => NUM_WORDS[n] || String(n);

  function americanOdds(p) {
    p = U.clamp(p, 0.004, 0.93);
    if (p >= 0.5) {
      const v = Math.round((p / (1 - p)) * 100 / 5) * 5;
      return '-' + Math.max(105, v);
    }
    let v = ((1 - p) / p) * 100;
    if (v < 300) v = Math.round(v / 25) * 25;
    else if (v < 1000) v = Math.round(v / 50) * 50;
    else if (v < 5000) v = Math.round(v / 250) * 250;
    else v = Math.round(v / 1000) * 1000;
    return '+' + Math.max(100, v);
  }
  M.americanOdds = americanOdds;

  /** probability list from scores (softmax) */
  function softmax(scores, temp) {
    const mx = Math.max(...scores);
    const ex = scores.map(s => Math.exp((s - mx) / temp));
    const tot = U.sum(ex);
    return ex.map(e => e / tot);
  }

  /** softmax with the temperature solved so the favorite's probability lands near `target` (realistic futures odds) */
  function calibrated(scores, target) {
    if (!scores.length) return [];
    const top = Math.max(...scores);
    let lo = 0.02, hi = 80;
    for (let i = 0; i < 48; i++) {
      const mid = Math.sqrt(lo * hi);
      const pr = softmax(scores, mid);
      const pTop = pr[scores.indexOf(top)];
      if (pTop > target) lo = mid; else hi = mid;
    }
    return softmax(scores, hi);
  }

  function seasonName(S) {
    return S.leagueKey === 'women' ? String(S.season) : U.seasonLabel(S.season);
  }
  M.seasonName = seasonName;

  function perGame(p, year, po) {
    const s = PBC.Stats.season(p, year, !!po);
    if (!s || !s.gp) return null;
    const g = s.gp;
    return {
      gp: g, gs: s.gs, mpg: s.min / g, ppg: s.pts / g, rpg: (s.orb + s.drb) / g, apg: s.ast / g, spg: s.stl / g, bpg: s.blk / g,
      fg: s.fga ? s.fgm / s.fga : 0, tp: s.tpa ? s.tpm / s.tpa : 0, tpm: s.tpm / g, tid: s.tid,
    };
  }
  const lineText = l => (l ? `${f1(l.ppg)} PPG · ${f1(l.rpg)} RPG · ${f1(l.apg)} APG` : '');

  // ---------------------------------------------------------------------------
  // Context: everything the pages need, computed once
  // ---------------------------------------------------------------------------
  function context(S) {
    const L = PBC.League.cfg(S);
    const rng = makeRng(U.hash(`${S.saveId}|${S.season}|${S.leagueKey}|courtside`));
    const W = makeWriter(rng);
    const women = L.key === 'women';
    const n = S.teams.length;
    const prev = S.season - 1;
    const hist = (S.history || []).find(h => h.season === prev) || null;
    const conf = L.playoffFormat === 'conference';
    const G = S.schedule && S.schedule.length ? Math.round((S.schedule.length * 2) / n) : S.seasonGames;
    const pr = women ? { he: 'she', He: 'She', his: 'her', His: 'Her', him: 'her', guy: 'player' } : { he: 'he', He: 'He', his: 'his', His: 'His', him: 'him', guy: 'guy' };

    // players by bucket
    const rosters = {};
    for (const t of S.teams) rosters[t.id] = [];
    const active = [], prospects = [], retired = [];
    for (const id in S.players) {
      const p = S.players[id];
      if (p.tid >= 0 && rosters[p.tid]) { rosters[p.tid].push(p); active.push(p); }
      else if (p.tid === -2) prospects.push(p);
      else if (p.tid === -3) retired.push(p);
    }
    const byOvr = (a, b) => b.ovr - a.ovr || (b.pot || 0) - (a.pot || 0) || a.age - b.age || a.id - b.id;
    for (const k in rosters) rosters[k].sort(byOvr);
    active.sort(byOvr);

    const histOf = p => (p.hist || []).find(h => h.season === prev) || null;
    const prevTid = p => {
      const h = histOf(p);
      if (h) return h.tid;
      const rows = (p.stats || []).filter(s => s.season === prev && !s.po);
      return rows.length ? rows[rows.length - 1].tid : undefined;
    };
    const isRookie = p => p.tid >= 0 && (p.rookieSeason === S.season ||
      (p.draft && p.draft.year === S.season && (p.yearsPro || 0) <= 1 && !(p.stats || []).some(s => s.season < S.season)));

    // ---- team info ----
    const T = S.teams.map(t => {
      const roster = rosters[t.id];
      const top8 = roster.slice(0, 8);
      const strF = PBC.League.teamStrength(S, t.id);
      const strH = PBC.League.teamStrength(S, t.id, { healthyOnly: true });
      const young = U.sortBy(roster.filter(p => p.age <= 23), p => p.ovr * 0.6 + (p.pot || p.ovr) * 0.4, true)[0] || null;
      const vet = U.sortBy(top8.filter(p => p.age >= 32), p => p.ovr, true)[0] || null;
      const injured = top8.filter(p => p.injury && p.injury.days > 12);
      const off = PBC.Config.OFFENSES[t.strat && t.strat.off] || PBC.Config.OFFENSES.balanced;
      const def = PBC.Config.DEFENSES[t.strat && t.strat.def] || PBC.Config.DEFENSES.man;
      return {
        tid: t.id, t, abbr: t.abbr, city: t.city, nick: t.name, full: `${t.city} ${t.name}`,
        roster, top8, star: roster[0] || null, star2: roster[1] || null, young, vet, injured,
        strF, strH, age: avg(top8, p => p.age), depth: avg(roster.slice(5, 9), p => p.ovr),
        offLabel: off.label, defLabel: def.label, payroll: U.sum(roster, p => (p.contract ? p.contract.amt : 0)),
        adds: [], losses: [], rookies: roster.filter(isRookie),
      };
    });

    // ---- last season ----
    if (hist) {
      const rows = (hist.standings || []).map(r => ({ tid: r.tid, w: r.w, l: r.l, pct: r.w + r.l ? r.w / (r.w + r.l) : 0 }));
      const sorted = rows.slice().sort((a, b) => b.pct - a.pct || a.tid - b.tid);
      sorted.forEach((r, i) => {
        const x = T[r.tid];
        if (!x) return;
        const th = (x.t.history || []).find(h => h.season === prev) || {};
        x.last = { w: r.w, l: r.l, pct: r.pct, rank: i + 1, result: th.result || '', seed: th.seed || null, champ: hist.champion === r.tid, round: th.round };
      });
      // roster movement since the end of last season
      const endStr = {};
      for (const p of Object.values(S.players)) {
        const h = histOf(p);
        if (h && h.tid >= 0 && T[h.tid]) (endStr[h.tid] = endStr[h.tid] || []).push(h.ovr);
        const from = prevTid(p);
        if (from === undefined) continue;
        if (p.tid >= 0 && from !== p.tid && T[p.tid]) T[p.tid].adds.push({ p, from });
        if (from >= 0 && T[from] && p.tid !== from) T[from].losses.push({ p, to: p.tid, ovr: h ? h.ovr : p.ovr });
      }
      for (const x of T) {
        const ovrs = (endStr[x.tid] || []).sort((a, b) => b - a).slice(0, STRENGTH_W.length);
        let s = 0, w = 0;
        ovrs.forEach((o, i) => { s += o * STRENGTH_W[i]; w += STRENGTH_W[i]; });
        x.lastStr = w ? s / w : null;
        x.adds.sort((a, b) => b.p.ovr - a.p.ovr);
        x.losses.sort((a, b) => b.ovr - a.ovr);
      }
      T.filter(x => x.lastStr != null).sort((a, b) => b.lastStr - a.lastStr || a.tid - b.tid).forEach((x, i) => { x.lastStrRank = i + 1; });
    }

    // ---- coaches ----
    for (const x of T) {
      const c = S.coach && S.coach.tid === x.tid && S.userTid === x.tid ? S.coach : null;
      x.coach = coachInfo(S, x, c, rng);
    }

    // ---- projections: strength + a little magazine gut feel ----
    const scores = T.map(x => 0.6 * x.strF + 0.4 * x.strH + rng.gauss(0, 0.45) + ((x.t.coachRating || 65) - 65) * 0.012);
    const mean = avg(scores);
    const order = T.map(x => x.tid).sort((a, b) => scores[b] - scores[a] || a - b);
    const pcts = T.map(x => {
      const r = order.indexOf(x.tid);
      return 0.55 * U.sigmoid((scores[x.tid] - mean) * 0.3) + 0.45 * (0.72 - (r / Math.max(1, n - 1)) * 0.46);
    });
    const pm = avg(pcts);
    const lo = women ? 0.16 : 0.18, hi = women ? 0.84 : 0.82;
    const pct2 = pcts.map(p => U.clamp(p + 0.5 - pm, lo, hi));
    const target = S.schedule && S.schedule.length ? S.schedule.length : Math.floor((n * G) / 2);
    const exact = pct2.map(p => p * G);
    const wins = exact.map(Math.floor);
    let tot = U.sum(wins), guard = 0;
    const frac = i => exact[i] - Math.floor(exact[i]);
    while (tot < target && guard++ < 500) {
      const i = U.maxBy(T.map(x => x.tid).filter(i => wins[i] < G), i => frac(i) - (wins[i] - exact[i]));
      if (i == null) break; wins[i]++; tot++;
    }
    guard = 0;
    while (tot > target && guard++ < 500) {
      const i = U.minBy(T.map(x => x.tid).filter(i => wins[i] > 0), i => frac(i) - (wins[i] - exact[i]));
      if (i == null) break; wins[i]--; tot--;
    }
    for (const x of T) { x.score = scores[x.tid]; x.w = wins[x.tid]; x.l = G - wins[x.tid]; x.pct = G ? x.w / G : 0.5; x.rec = `${x.w}-${x.l}`; }
    const ranked = T.slice().sort((a, b) => b.w - a.w || b.score - a.score || a.tid - b.tid);
    ranked.forEach((x, i) => { x.rank = i + 1; x.lgSeed = i + 1; });
    // strength rank (pure roster rating)
    T.slice().sort((a, b) => b.strF - a.strF || a.tid - b.tid).forEach((x, i) => { x.strRank = i + 1; });
    const confs = conf ? [0, 1] : [];
    for (const c of confs) ranked.filter(x => x.t.conf === c).forEach((x, i) => { x.confSeed = i + 1; });
    for (const x of T) {
      const seed = conf ? x.confSeed : x.lgSeed;
      x.seed = seed;
      if (conf) x.line = seed <= 6 ? 'po' : L.playIn && seed <= 10 ? 'pi' : seed <= 8 ? 'po' : 'out';
      else x.line = seed <= L.playoffTeams ? 'po' : 'out';
      x.seedText = conf ? `${U.ordinal(seed)} in the ${L.confs[x.t.conf]}` : `${U.ordinal(seed)} in the league`;
    }

    // ---- team rating categories (ranks) ----
    const CATS = [
      { k: 'shoot', label: 'Three-point shooting', f: p => p.r.three, agg: 'avg' },
      { k: 'finish', label: 'Finishing at the rim', f: p => (p.r.layup + p.r.dunk + p.r.close) / 3, agg: 'avg' },
      { k: 'play', label: 'Playmaking', f: p => (p.r.pass + p.r.vision + p.r.handle) / 3, agg: 'top3' },
      { k: 'perD', label: 'Perimeter defense', f: p => (p.r.perD + p.r.steal) / 2, agg: 'avg' },
      { k: 'rim', label: 'Rim protection', f: p => (p.r.block + p.r.intD) / 2, agg: 'top3' },
      { k: 'reb', label: 'Rebounding', f: p => (p.r.oreb + p.r.dreb) / 2, agg: 'avg' },
      { k: 'ath', label: 'Athleticism', f: p => (p.r.speed + p.r.agility + p.r.vert) / 3, agg: 'avg' },
      { k: 'clutch', label: 'Late-game poise', f: p => (p.r.clutch + p.r.shotIQ) / 2, agg: 'avg' },
      { k: 'depth', label: 'Bench depth', team: x => x.depth },
      { k: 'stars', label: 'Star power', team: x => avg(x.roster.slice(0, 2), p => p.ovr) },
    ];
    for (const cat of CATS) {
      const vals = T.map(x => {
        if (cat.team) return cat.team(x);
        const v = x.top8.map(cat.f).sort((a, b) => b - a);
        return cat.agg === 'top3' ? avg(v.slice(0, 3), y => y) : avg(v, y => y);
      });
      const ord = T.map(x => x.tid).sort((a, b) => vals[b] - vals[a] || a - b);
      for (const x of T) { x.cat = x.cat || {}; x.cat[cat.k] = { v: vals[x.tid], rank: ord.indexOf(x.tid) + 1 }; }
    }

    const user = S.userTid >= 0 && T[S.userTid] ? T[S.userTid] : null;

    // ---- the Finals pick ----
    let finals;
    if (conf) {
      const champOf = c => {
        const list = ranked.filter(x => x.t.conf === c).slice(0, 3);
        return rng.pickW(list, [0.56, 0.29, 0.15]);
      };
      const a = champOf(0), b = champOf(1);
      const pA = U.clamp(0.5 + (a.score - b.score) * 0.12, 0.25, 0.8);
      const win = rng.chance(pA) ? a : b, lose = win === a ? b : a;
      finals = { win, lose };
    } else {
      const top = ranked.slice(0, 4);
      const win = rng.pickW(top, [0.46, 0.29, 0.15, 0.1]);
      const rest = top.filter(x => x !== win);
      const lose = rng.pickW(rest, [0.5, 0.3, 0.2]);
      finals = { win, lose };
    }
    const diff = Math.abs(finals.win.score - finals.lose.score);
    finals.games = diff > 1.8 ? rng.pick([5, 6]) : diff > 0.9 ? rng.pick([6, 6, 7]) : rng.pick([6, 7, 7]);

    const C = {
      S, L, rng, W, women, n, prev, hist, conf, G, pr, T, ranked, user, active, prospects, retired, rosters,
      isRookie, prevTid, histOf, finals, CATS, first: !hist,
      sname: seasonName(S), league: L.label, short: L.short,
      rookies: U.sortBy(active.filter(isRookie), p => p.ovr + (p.pot || p.ovr) * 0.25, true),
      tn: tid => (T[tid] ? T[tid].full : 'Free Agent'),
      nk: tid => (T[tid] ? T[tid].nick : 'free agents'),
      ab: tid => (T[tid] ? T[tid].abbr : 'FA'),
    };
    C.coachCount = n;
    /** OVR at a league quantile (0 = best player) — thresholds stay sensible if ratings are retuned */
    C.q = f => (active.length ? active[Math.min(active.length - 1, Math.round(active.length * f))].ovr : 70);
    return C;
  }

  // ---------------------------------------------------------------------------
  // Coaches (AI coaches: team.coachName or a stable generated surname)
  // ---------------------------------------------------------------------------
  function aiCoachName(S, t) {
    if (t.coachName) return t.coachName;
    const r = makeRng(U.hash(`${S.saveId}|coach|${t.id}`));
    const last = PBC.Names && PBC.Names.last ? r.pick(PBC.Names.last) : 'Smith';
    return `Coach ${last}`;
  }
  M.aiCoachName = aiCoachName;

  function heatLabel(h) {
    return h < 15 ? 'Ice cold' : h < 30 ? 'Cool' : h < 45 ? 'Lukewarm' : h < 60 ? 'Warm' : h < 75 ? 'Hot' : h < 88 ? 'Scorching' : 'Inferno';
  }
  M.heatLabel = heatLabel;

  function coachInfo(S, x, c, rng) {
    const t = x.t;
    if (c) {
      const tot = c.totals || { w: 0, l: 0, pw: 0, pl: 0 };
      const withTeam = (c.seasons || []).filter(s => s.tid === t.id).length;
      const gp = tot.w + tot.l;
      const rating = U.clamp(Math.round(46 + (c.rep || 40) * 0.38 + (c.titles || 0) * 4 + (c.coy || 0) * 2 + (gp ? (tot.w / gp - 0.5) * 30 : 0)), 40, 99);
      let heat = 100 - (c.security == null ? 70 : c.security);
      if (c.contract && c.contract.years <= 1) heat += 8;
      if (c.lastReview && c.lastReview.season === S.season - 1 && !c.lastReview.goalMet) heat += 6;
      if (c.titles) heat -= 10;
      if (t.owner && t.owner.patience < 45) heat += 6;
      if (!withTeam) heat -= 12;
      heat = Math.round(U.clamp(heat, 2, 98));
      return { name: c.name || 'Coach', isUser: true, rating, heat, label: heatLabel(heat), year: withTeam + 1, rec: `${tot.w}-${tot.l}`, pw: tot.pw, pl: tot.pl, titles: c.titles || 0, age: c.age };
    }
    const th = t.history || [];
    const titles = th.filter(h => h.champ).length;
    const po = th.filter(h => h.round != null && h.round >= 1).length;
    const w = U.sum(th, h => h.w || 0), l = U.sum(th, h => h.l || 0);
    const rating = U.clamp(Math.round((t.coachRating || 65) + titles * 3 + po * 0.5), 35, 99);
    return { name: aiCoachName(S, t), isUser: false, rating, heat: 0, label: '', year: th.length + 1, rec: `${w}-${l}`, titles };
  }

  /** AI hot seat heat (needs projections, so computed after context) */
  function aiHeat(C, x) {
    const t = x.t;
    let h = 46 + (0.5 - x.pct) * 70 - ((t.owner ? t.owner.patience : 60) - 60) * 0.35 + ((t.market || 3) - 3) * 4;
    if (x.last) {
      // did last season's finish match the roster the coach had? (end-of-season roster rank vs. standings rank)
      if (x.lastStrRank != null) {
        const under = x.last.rank - x.lastStrRank;
        if (under >= 5) h += 12; else if (under <= -5) h -= 8;
      }
      if (x.last.pct < 0.4) h += 6;
      if (x.last.champ) h -= 25;
    }
    if (x.age < 25) h -= 10;
    h += C.rng.gauss(0, 7);
    return Math.round(U.clamp(h, 3, 97));
  }

  // ---------------------------------------------------------------------------
  // Blurb banks
  // ---------------------------------------------------------------------------
  const TIERS_MEN = [
    { upTo: 3, label: 'The Favorites' }, { upTo: 8, label: 'Contenders' }, { upTo: 14, label: 'In the Mix' },
    { upTo: 20, label: 'Play-In Purgatory' }, { upTo: 25, label: 'Treading Water' }, { upTo: 99, label: 'Lottery Bound' },
  ];
  const TIERS_WOMEN = [{ upTo: 2, label: 'The Favorites' }, { upTo: 5, label: 'Contenders' }, { upTo: 8, label: 'On the Bubble' }, { upTo: 99, label: 'Rebuilding' }];
  const tierOf = (C, rank) => (C.women ? TIERS_WOMEN : TIERS_MEN).find(t => rank <= t.upTo).label;
  const tierBand = (C, rank) => { const f = rank / C.n; return f <= 0.1 ? 0 : f <= 0.28 ? 1 : f <= 0.5 ? 2 : f <= 0.75 ? 3 : 4; };

  const PR = [
    [ // 0: favorites
      '{star} ({sOvr} OVR) is the best player on the best team. Simple math. Scary math.',
      'Deep, balanced and mean. {ARec} projection might be conservative.',
      'Nobody has a better one-two punch than {star} and {star2}. Title or bust.',
      'The favorite until somebody proves otherwise. Good luck with that.',
      'Anything short of the Finals is a failure in {city}. They know it. They like it.',
      '{star} is in {his} prime and the supporting cast finally matches. Buckle up.',
      'The rich got richer. The {nick} are loaded at every level of the roster.',
    ],
    [ // 1: contenders
      '{star} gives them a puncher\'s chance against anybody in a seven-game series.',
      'One more shooter away from terrifying. Still pretty terrifying.',
      'Their {off} attack should hum with {star} pulling the strings.',
      'Legit. Not quite the favorite, but nobody wants this matchup in round two.',
      '{star} and {star2} form a top-10 duo. The bench decides how far they go.',
      '{ARec} team on paper with a coach who squeezes every win out of the schedule.',
      'Dark horse? They\'re more of a gray horse. Dangerous either way.',
    ],
    [ // 2: middle / playoff edge
      'Solid, unspectacular and dangerous if {star} catches fire in April.',
      'Good enough to make you believe. Not quite good enough to make you book the parade.',
      'The {def} defense will keep them in games. The offense is a coin flip.',
      'Nobody is sure what they are. That includes, we suspect, the front office.',
      '{star} can carry them for stretches. The question is whether {he} can carry them for {g} games.',
      'Playoff team on a good night. Play-in team on a Tuesday in February.',
      'Built to win now, priced to win now. Needs to actually win now.',
    ],
    [ // 3: play-in / fringe
      'Pencil them in for the play-in and a lot of "what if" conversations.',
      'Talented enough to steal games, inconsistent enough to give them right back.',
      '{star} deserves better. Maybe that\'s the storyline this year.',
      'Average age {age}. The vibes are good; the defense is not.',
      'A few breaks from the playoffs. A few injuries from the lottery.',
      'Every game will be close. That\'s the good news and the bad news.',
      'They\'ll beat a contender or two and lose to a lottery team the next night.',
    ],
    [ // 4: lottery
      'The ping-pong balls are the real prize. {young} is the reason to watch.',
      'Bring your patience and a good book.',
      'Tanking is such an ugly word. Let\'s call it long-term asset optimization.',
      'Rebuild mode. At least {young} ({yAge}) looks like a keeper.',
      'The front office swears there\'s a plan. We\'d love to see it.',
      '{ARec} projection, a lot of young legs and a lot of long nights.',
      'Somebody has to finish last. The {nick} are auditioning for the role.',
    ],
  ];

  // quips for top-10 blurbs keyed by Player.strengths tags
  const TAG_QUIPS = {
    'Elite shooter': ['Range starts at the logo and ends somewhere in the parking lot.', 'Closeouts on {him} are optional, and pointless.', 'Leave {him} open once. Only once.'],
    'Mid-range assassin': ['Keeps the lost art of the 17-footer on life support, and it\'s thriving.', 'Two dribbles, one pull-up, zero doubt.', 'The elbow jumper is {his} home address.'],
    'Rim finisher': ['Gets to the rim like it owes {him} money.', 'Contact is a suggestion. The basket is a guarantee.', 'Lives in the paint and pays no rent.'],
    'Post scorer': ['A back-to-the-basket bully in a pace-and-space world.', 'Footwork so clean you could eat off it.', 'Throw it in. Walk away. Two points.'],
    'Playmaker': ['Sees passes before the defense sees the ball.', 'Makes four teammates better every single night.', 'The assist leaders board is basically {his} diary.'],
    'Ball handler': ['Ankles have been filing complaints for years.', 'The ball is on a string and the string is attached to {his} soul.', 'Handle so tight the ball needs a permission slip to leave.'],
    'Lockdown defender': ['Your best scorer\'s least favorite matchup.', 'Guards one through four and complains about none of it.', 'Picks up full court and ruins your whole evening.'],
    'Rim protector': ['The paint is a no-fly zone.', 'Blocks shots into the third row on principle.', 'Drivers see {him} and suddenly remember they can pass.'],
    'Glass cleaner': ['Every miss is a personal invitation.', 'Rebounds like each board is the last one on Earth.', 'Owns the glass and charges rent.'],
    'Athlete': ['Plays above the rim and occasionally above the backboard.', 'Fast break? More like a fast blur.', 'The highlight reel updates itself.'],
    'Clutch': ['Down one, ten seconds left: you know who gets it.', 'Fourth-quarter pulse rate: resting.', 'Big moments, bigger shots.'],
    'Pickpocket': ['Hands so quick the ball files a missing-persons report.', 'Passing lanes are {his} personal buffet.', 'Turns every lazy pass into a layup the other way.'],
    'Free throw ace': ['Foul {him} and apologize to your coach.', 'The line is the most automatic place in the building when {he} is on it.', 'Money from the stripe, every time.'],
    'Iron man': ['Never misses games. Never misses minutes.', 'Built like a tank, plays like one.', 'Load management is a rumor {he} has heard about.'],
  };
  const GENERIC_QUIPS = ['Does a little bit of everything and a lot of winning.', 'No glaring weakness, plenty of strengths.', 'The kind of player coaches draw up plays for, and opponents draw up plays against.', 'Quietly one of the most complete players in the league.'];

  const HEAT_TEXT = {
    'Ice cold': 'bulletproof', 'Cool': 'comfortable', 'Lukewarm': 'stable, for now', 'Warm': 'getting toasty',
    'Hot': 'under real pressure', 'Scorching': 'on thin ice', 'Inferno': 'coaching for the job',
  };

  // ---------------------------------------------------------------------------
  // Page builders
  // ---------------------------------------------------------------------------
  function pv(C, p, extra) {
    // standard template vars for a player
    const x = p ? C.T[p.tid] : null;
    return Object.assign({
      name: pName(p), first: p ? p.first : '', last: p ? p.last : '', LAST: p ? up(p.last) : '', LASTS: p ? poss(up(p.last)) : '', ovr: p ? p.ovr : 0, aOvr: p ? withAn(p.ovr) : '', pos: p ? p.pos : '',
      age: p ? p.age : 0, team: x ? x.full : 'free agency', nick: x ? x.nick : 'free agents', aNick: x ? withAn(x.nick) : 'a', NICK: x ? up(x.nick) : '', city: x ? x.city : '',
      CITY: x ? up(x.city) : '', abbr: x ? x.abbr : 'FA',
    }, C.pr, extra || {});
  }
  function pRef(C, p, extra) {
    if (!p) return null;
    return Object.assign({ pid: p.id, tid: p.tid, name: pName(p), first: p.first, last: p.last, pos: p.pos, age: p.age, ovr: p.ovr, abbr: C.ab(p.tid) }, extra || {});
  }

  // ---- 1. Cover ----
  function pageCover(C) {
    const { rng, W, T, user } = C;
    const best = C.active[0];
    const uStar = user ? user.star : null;
    let star = best, hometown = false;
    if (uStar && uStar !== best) {
      const r = C.active.indexOf(uStar);
      const ch = r >= 0 && r < 5 ? 0.5 : user.rank <= 4 ? 0.35 : 0.15;
      if (rng.chance(ch)) { star = uStar; hometown = true; }
    } else if (uStar && uStar === best) hometown = true;
    const x = T[star.tid];
    const last = perGame(star, C.prev);
    const v = pv(C, star, { n: C.n, g: C.G });
    let bank;
    if (hometown && star !== best) {
      bank = [
        ['HOMETOWN HERO', '{name} and the {nick} have {city} dreaming big. Special local edition.'],
        ['THE {CITY} SHOW', '{name} ({ovr} OVR) is ready for a bigger stage. {city} is ready for {him}.'],
        ['{LAST} TAKES FLIGHT', 'Why this is the season {name} goes from local favorite to league-wide problem.'],
        ['MAIN CHARACTER ENERGY', '{name} has the ball, the city and the spotlight. Now {he} wants the trophy.'],
      ];
    } else if (star.age >= 32) {
      bank = [
        ['ONE LAST RIDE?', '{name} is {age}. {He} is not done. Not even close.'],
        ['AGELESS', 'At {age}, {name} is still the best player on the floor most nights. Father Time is furious.'],
        ['OLD SCHOOL, NEW TRICKS', '{name} has seen everything. This season, {he} wants to see a parade.'],
      ];
    } else {
      bank = [
        ['{LASTS} LEAGUE', 'The best player on the planet ({ovr} OVR) is done asking for permission.'],
        ['UNGUARDABLE', '{name} has no weaknesses. We checked. Twice.'],
        ['HEAVY IS THE HEAD', '{name} wears the crown. {n} teams want it.'],
        ['THE MAIN EVENT', 'Every road to the title runs through {name} and the {nick}.'],
        ['BUILT DIFFERENT', '{ovr} OVR. {pos}. Zero chill. Meet the most dangerous player in the league.'],
        ['{LAST} VS. EVERYBODY', 'The {nick} star has a target on {his} back and a chip on {his} shoulder.'],
        ['ONE OF ONE', 'There\'s {name}, and then there\'s everybody else.'],
        ['MVP OR BUST', '{name} has one goal this season. The {nick} have a bigger one.'],
      ];
      if (star.age <= 25) bank.push(['NO CEILING', '{name} is {age} years old and somehow still getting better.'], ['THE FUTURE IS NOW', 'At {age}, {name} is already the face of the league. Everyone else is on notice.']);
    }
    const pickHl = W.pick(bank);
    const headline = W.fill(pickHl[0], v), sub = W.fill(pickHl[1], v);

    // teasers
    const fw = C.finals.win, fl = C.finals.lose;
    const teasers = [];
    teasers.push({ big: `1–${C.n}`, text: C.women ? 'Power rankings: every team, ranked & roasted' : 'Power rankings: all 30 teams, ranked & roasted' });
    teasers.push({ big: up(fw.nick), text: `…over the ${fl.nick} in ${C.finals.games}. Our Finals pick, explained` });
    // the Finals pick may be the user's team: then this teaser leads with the city so the cover doesn't repeat a nickname
    if (user) teasers.push({ big: up(user.nick === fw.nick ? user.city : user.nick), text: `Inside the ${user.nick}: can ${user.coach.name} deliver?` });
    const extra = [];
    if (C.rookies.length) extra.push({ big: up(C.rookies[0].last), text: 'Rookie of the Year? The case for the kid' });
    extra.push({ big: 'HOT SEAT', text: 'The coaches who need a fast start' });
    extra.push({ big: 'TOP 10', text: 'The best players in the league, ranked' });
    if (!C.first) extra.push({ big: 'GRADES', text: 'Who won the summer, and who flunked' });
    extra.push({ big: 'BOLD', text: 'Predictions we\'ll regret by the All-Star break' });
    const more = rng.shuffle(extra).slice(0, 4 - teasers.length);
    teasers.push(...more);

    const vol = (() => {
      const seasons = (C.S.history || []).map(h => h.season);
      const first = seasons.length ? Math.min(...seasons) : C.S.season;
      return C.S.season - first + 1;
    })();
    const h = U.hash(`${C.S.saveId}|${C.S.season}|barcode`);
    const digits = String(h).padStart(10, '7').slice(0, 10);
    const check = String(U.sum(digits.split('').map(Number)) % 10);
    return {
      kind: 'cover', title: 'Cover', mast: M.MAST,
      issue: `Vol. ${vol} · No. 1`, dateLine: `${C.sname} Season Preview`, league: C.league,
      price: C.women ? '$8.99 US · $10.99 CAN' : '$9.99 US · $12.99 CAN',
      barcode: `0 ${digits.slice(0, 5)} ${digits.slice(5)} ${check}`,
      star: pRef(C, star, { line: last ? lineText(last) : `${star.arch || PBC.Config.POS_NAME[star.pos]} · Age ${star.age}`, team: x.full, hometown }),
      headline, sub, teasers,
      flash: W.pick(['COLLECTOR\'S EDITION', 'SPECIAL PREVIEW ISSUE', '15 PAGES OF HOOPS', 'ALL TEAMS · ALL STARS · ALL OPINIONS']),
      corner: { big: `${C.n}`, text: 'teams ranked' },
    };
  }

  // ---- 2. Editor's letter + contents ----
  function pageEditor(C, toc) {
    const { W, T, user, ranked } = C;
    const er = makeRng(U.hash(`${C.S.saveId}|editor`));
    const f = er.chance(0.5);
    const edFirst = PBC.Names ? er.pick(f ? PBC.Names.femaleFirst : PBC.Names.maleFirst) : 'Dana';
    const edLast = PBC.Names ? er.pick(PBC.Names.last) : 'Whitaker';
    const editor = `${edFirst} ${edLast}`;
    const fav = ranked[0];
    const champ = C.hist && C.hist.champion != null ? T[C.hist.champion] : null;
    const contenders = ranked.filter(x => x.pct >= 0.6).length || 3;
    const v = { sname: C.sname, n: C.n, nWord: numWord(C.n), fav: fav.nick, favFull: fav.full, favStar: pName(fav.star), contenders: numWord(Math.min(contenders, 12)), league: C.league };
    const p1 = W.say([
      'Every season starts the same way: {nWord} teams, one trophy, and a whole lot of optimism that won\'t survive the first road trip. Welcome to the {sname} preview.',
      'Somewhere right now, a front office is convinced this is their year. By our math, {contenders} of them are right. Welcome to the {sname} preview issue.',
      'The gyms are open, the sneakers squeak, and every team in the {league} is undefeated. Enjoy it while it lasts.',
      'We spent the summer watching film, crunching numbers and arguing in group chats so you don\'t have to. Here\'s what we learned about the {sname} season.',
    ], v);
    let p2;
    if (champ && champ !== fav) {
      p2 = W.fill(W.pick([
        'The {champ} still hold the belt after last season\'s title run, but our money is on the {fav}: {favStar} gives them the best top-end talent in the league.',
        'Yes, the {champ} are the champs. No, we don\'t think they repeat. The {fav} and {favStar} are our pick to finish the job.',
      ]), Object.assign({ champ: champ.nick }, v));
    } else if (champ) {
      p2 = W.fill(W.pick([
        'The {champ} won it all last season and, frankly, got better. {favStar} makes them the team to beat again.',
        'Last year\'s champs are this year\'s favorites. The {champ} return {favStar} and the target on their backs got bigger.',
      ]), Object.assign({ champ: champ.nick }, v));
    } else {
      p2 = W.say([
        'There\'s no defending champion and no history, just {nWord} rosters and a blank page. Our pick: the {fav}, led by {favStar}.',
        'Year one. No banners, no grudges, no dynasties. Yet. We like the {fav} and {favStar} to write the first chapter.',
      ], v);
    }
    let p3 = '';
    if (user) {
      const exp = expectationFor(C, user);
      const yr = user.coach.year;
      const yp = yr <= 1 ? 'begins life on the bench' : `enters year ${numWord(yr)} on the bench`;
      p3 = W.say([
        'In {city}, {coach} {yp} with an owner whose marching orders are simple: {exp}. Our projection says {rec}. The hot seat meter reads "{heat}."',
        'And then there\'s {city}. {coach} {yp}, the owner wants the {nick} to {expLow}, and we have them at {rec}. No pressure.',
      ], { city: user.city, coach: user.coach.name, yp, exp: lowerFirst(exp.label), expLow: lowerFirst(exp.label), rec: user.rec, heat: user.coach.label.toLowerCase(), nick: user.nick });
    }
    const p4 = W.pick([
      'Enjoy the issue. Argue with us. We\'ll be wrong about something. We just don\'t know what yet.',
      'Read it, save it, and bring it up in April when we turn out to be geniuses. Or don\'t.',
      'As always: the predictions are bold, the grades are final and the complaints department is closed.',
    ]);
    return {
      kind: 'contents', title: 'Editor\'s Letter', headline: W.pick(['LET\'S GET WEIRD', 'HERE WE GO AGAIN', 'THE WAIT IS OVER', 'TIP-OFF', 'CLEAR THE BENCHES']),
      letter: [p1, p2, p3, p4].filter(Boolean), editor: { name: editor, role: 'Editor-in-Chief' }, toc,
      quote: W.pick(['"Every team is undefeated. For about three more weeks."', '"Our crystal ball is cracked, but it still works."', '"Numbers don\'t lie. Our writers occasionally exaggerate."']),
    };
  }

  function expectationFor(C, x) {
    const S = C.S;
    if (S.coach && S.coach.expectation && S.coach.expectation.season === S.season && S.coach.tid === x.tid) return { label: S.coach.expectation.label, wins: S.coach.expectation.wins, pct: S.coach.expectation.pct };
    const proj = PBC.League.projectedWinPct(S, x.tid);
    const rankPct = 0.72 - ((x.strRank - 1) / Math.max(1, C.n - 1)) * 0.46;
    const pct = (proj + rankPct) / 2;
    const GOALS = [
      { key: 'title', min: 0.66, label: 'Win the championship' }, { key: 'finals', min: 0.6, label: 'Reach the conference finals' },
      { key: 'series', min: 0.53, label: 'Win a playoff series' }, { key: 'playoffs', min: 0.45, label: 'Make the playoffs' },
      { key: 'playin', min: 0.37, label: 'Compete for a play-in spot' }, { key: 'develop', min: 0, label: 'Develop the young core and improve' },
    ];
    let g = GOALS.find(q => pct >= q.min) || GOALS[GOALS.length - 1];
    if (C.women && g.key === 'finals') g = GOALS[2];
    if (C.women && g.key === 'playin') g = GOALS[5];
    return { label: g.label, wins: Math.round(pct * C.G), pct };
  }

  // exported for callers that want the same number the magazine shows
  M.expectation = S => { const C = context(S); return C.user ? expectationFor(C, C.user) : null; };

  const TAG_NOUN = {
    'Elite shooter': 'shooting stroke', 'Mid-range assassin': 'mid-range game', 'Rim finisher': 'finishing touch', 'Post scorer': 'post footwork',
    'Playmaker': 'court vision', 'Ball handler': 'handle', 'Lockdown defender': 'defensive feel', 'Rim protector': 'shot-blocking timing',
    'Glass cleaner': 'nose for the ball', 'Athlete': 'bounce', 'Clutch': 'late-game nerve', 'Pickpocket': 'hand speed', 'Free throw ace': 'shooting touch',
    'Iron man': 'motor',
  };
  const tagNoun = p => { const t = PBC.Player.strengths(p, 1)[0]; return (t && TAG_NOUN[t]) || 'raw upside'; };
  const pickText = p => {
    const d = p.draft;
    if (!d || !d.pick) return 'Undrafted';
    return d.round === 1 ? `No. ${d.pick} pick` : `${U.ordinal(d.round)} round, No. ${d.pick}`;
  };
  const shortName = p => (p ? `${p.first.charAt(0)}. ${p.last}` : '');
  /** 'torn ACL, out for season' */
  function injText(p) {
    if (!p || !p.injury) return '';
    const name = String(p.injury.name || 'injury').toLowerCase().replace(/\bacl\b/, 'ACL').replace('achilles', 'Achilles');
    const m = PBC.Player.injuryLabel(p.injury).match(/\(([^)]*)\)\s*$/);
    return m ? `${name}, ${m[1]}` : name;
  }
  /** 'Lost in First Round' -> 'lost in the First Round' */
  function resultPhrase(label) {
    const s = String(label || '');
    if (!s || /^missed/i.test(s)) return 'missed the playoffs';
    if (/^won champ/i.test(s)) return 'won the championship';
    const m = s.match(/^lost in (the )?(.*)$/i);
    if (m) return `lost in the ${m[2]}`;
    return `reached the ${s}`;
  }
  M.resultPhrase = resultPhrase;
  const coachLast = name => { const parts = String(name || 'Coach').trim().split(/\s+/); return parts[parts.length - 1]; };

  function starters(C, x) {
    const ids = (x.t.rot && x.t.rot.starters) || [];
    const ok = ids.length === 5 && ids.every(id => C.S.players[id] && C.S.players[id].tid === x.tid);
    if (ok) return ids.map(id => C.S.players[id]);
    const healthy = x.roster.filter(p => !PBC.Player.isInjured(p));
    const pool = healthy.length >= 5 ? healthy : x.roster;
    if (PBC.AI && PBC.AI.bestFive) return PBC.AI.bestFive(pool) || pool.slice(0, 5);
    return pool.slice(0, 5);
  }

  // ---- 3. Top storylines ----
  function pageStorylines(C) {
    const { W, T, user, S, L } = C;
    const cand = [];
    // offseason moves (data first, news only to label trades/signings)
    const offNews = (S.news || []).filter(nw => (nw.season === C.prev && ['regular', 'playin', 'playoffs', 'postseason_done'].indexOf(nw.phase) < 0) || (nw.season === S.season && nw.phase === 'preseason'));
    const offPhase = r => (r.season === C.prev && ['regular', 'playin', 'playoffs', 'postseason_done'].indexOf(r.phase) < 0) || (r.season === S.season && r.phase === 'preseason');
    const tradedPids = new Set();
    for (const r of (S.trades || [])) if (offPhase(r)) for (const g of (r.give || [])) for (const id of (g.pids || [])) tradedPids.add(id);
    const lo = S.lastOffseason && S.lastOffseason.season === C.prev ? S.lastOffseason : null;
    const signings = {};
    if (lo) for (const sg of (lo.signings || [])) signings[sg.pid] = sg;
    const kindOf = m => {
      if (tradedPids.has(m.p.id)) return 'trade';
      if (signings[m.p.id] || m.from === -1) return 'signing';
      const nm = pName(m.p);
      const nw = offNews.find(x => x.text && x.text.indexOf(nm) >= 0);
      if (nw && /trade|acquire|deal|swap/i.test(nw.text)) return 'trade';
      if (nw && /sign/i.test(nw.text)) return 'signing';
      return 'move';
    };
    const dealText = pid => { const sg = signings[pid]; return sg ? `${U.plural(sg.years, 'year')}, ${U.money(sg.amt)} per` : ''; };
    const moves = [];
    for (const x of T) for (const a of x.adds) if (!C.isRookie(a.p)) moves.push({ p: a.p, from: a.from, to: x.tid });
    moves.sort((a, b) => b.p.ovr - a.p.ovr || a.p.id - b.p.id);
    const topCut = C.active[Math.min(C.active.length - 1, C.women ? 24 : 60)];
    if (moves.length) {
      const m = moves[0], k = kindOf(m), to = T[m.to];
      const v = pv(C, m.p, { from: m.from >= 0 ? T[m.from].nick : 'free-agent market', to: to.nick, TONICK: up(to.nick), TOCITY: up(to.city), toRank: to.rank });
      const others = moves.slice(1, 3).map(o => `${pName(o.p)} (${C.ab(o.to)})`);
      let body = k === 'trade'
        ? W.fill('The summer\'s blockbuster sent {name} ({ovr} OVR) from the {from} to the {to}, and the {to} climb to No. {toRank} in our power rankings.', v)
        : k === 'signing'
          ? (dealText(m.p.id)
            ? W.fill('{name} ({ovr} OVR) hit the open market and landed with the {to} ({deal} season). That signature has the {to} at No. {toRank} in our rankings.', Object.assign({ deal: dealText(m.p.id) }, v))
            : W.fill('{name} ({ovr} OVR) hit the open market and landed with the {to}. That signature has the {to} at No. {toRank} in our rankings.', v))
          : W.fill('{name} ({ovr} OVR) swapped the {from} for the {to} this summer. The {to} check in at No. {toRank} in our rankings as a result.', v);
      if (others.length) body += ` Also on the move: ${listText(others)}.`;
      cand.push({ pri: topCut && m.p.ovr >= topCut.ovr ? 100 : 72, kicker: k === 'trade' ? 'Blockbuster' : k === 'signing' ? 'Free agency' : 'On the move',
        headline: W.say(['{LAST} TO {TOCITY}', 'NEW DIGS FOR {LAST}', '{LAST} CHANGES COLORS', 'THE {TONICK} GOT THEIR STAR'], v), body,
        pid: m.p.id, tid: m.to, stat: { v: String(m.p.ovr), l: 'OVR' } });
    }
    // rookie hype / draft watch
    if (C.rookies.length) {
      const r = C.rookies[0];
      const v = pv(C, r, { pick: pickText(r), origin: r.origin || 'overseas', tag: tagNoun(r) });
      cand.push({ pri: 90, kicker: 'Rookie watch', headline: W.say(['THE KID IS HERE', '{LAST} MANIA', 'RATED ROOKIE: {LAST}', 'BELIEVE THE HYPE?', 'WELCOME TO THE LEAGUE, {LAST}'], v),
        body: W.say([
          '{name} ({pick}, {origin}) arrives with {aOvr} OVR and the kind of {tag} that makes scouts giggle. The {nick} plan to hand {him} the keys early.',
          'The {nick} got their {pos} of the future in {name} ({pick}, {origin}). {He} already rates {ovr} overall, and the {tag} is real.',
        ], v), pid: r.id, tid: r.tid, stat: { v: String(r.ovr), l: 'Rookie OVR' } });
    } else if (C.prospects.length) {
      const pool = C.prospects.filter(p => p.draft && p.draft.year === S.season + 1);
      const r = U.sortBy(pool.length ? pool : C.prospects, p => p.ovr + (p.pot || p.ovr) * 0.3, true)[0];
      const v = pv(C, r, { origin: r.origin || 'overseas', year: S.season + 1 });
      cand.push({ pri: 45, kicker: 'Draft watch', headline: W.say(['THE NEXT BIG THING', 'TANK FOR {LAST}?', 'CIRCLE THE NAME: {LAST}'], v),
        body: W.fill('No rookie has cracked a rotation yet, but scouts are already circling {name} ({pos}, {origin}) as the early favorite to go No. 1 in the {year} draft.', v), pid: r.id, tid: -2, stat: { v: String(r.age), l: 'Age' } });
    }
    // defending champion / wide-open race
    if (C.hist && C.hist.champion != null && T[C.hist.champion]) {
      const x = T[C.hist.champion];
      const endRoster = Object.values(S.players).filter(p => { const h = C.histOf(p); return h && h.tid === x.tid; })
        .sort((a, b) => C.histOf(b).ovr - C.histOf(a).ovr).slice(0, 8);
      const ret = endRoster.filter(p => p.tid === x.tid).length;
      let streak = 0;
      for (let i = x.t.history.length - 1; i >= 0 && x.t.history[i].champ; i--) streak++;
      const verdict = x.rank === 1 ? 'the favorites again' : x.rank <= 4 ? 'right in the thick of it' : x.rank <= 8 ? 'good, not great' : 'and the repeat math is getting ugly';
      const retText = ret >= 8 ? 'their entire top eight is back' : ret === 0 ? 'none of their top eight are back' : `${numWord(ret)} of their top eight are back`;
      const v = { nick: x.nick, NICK: up(x.nick), rec: x.last ? `${x.last.w}-${x.last.l}` : x.rec, retText, rank: x.rank, verdict, star: pName(x.star) };
      const hl = streak >= 3 ? 'DYNASTY WATCH' : streak === 2 ? 'THREE-PEAT WATCH' : W.pick(['CAN THE {NICK} REPEAT?', 'UNEASY LIES THE CROWN', 'THE HUNTED', 'DEFEND THE BELT']);
      cand.push({ pri: 95, kicker: 'The champs', headline: W.fill(hl, v),
        body: W.fill('The {nick} won it all last season ({rec}) and {retText}. We have them No. {rank} in our power rankings: {verdict}.', v) + (streak >= 2 ? ` That would make ${streak + 1} straight.` : ''),
        tid: x.tid, stat: { v: `No. ${x.rank}`, l: 'Our ranking' } });
    } else {
      const top = C.ranked.slice(0, 3);
      const k = Math.min(8, C.n);
      const gap = Math.abs(C.ranked[0].strF - C.ranked[k - 1].strF);
      const v = { a: top[0].nick, b: top[1].nick, c: top[2].nick, gap: f1(gap), k };
      cand.push({ pri: 70, kicker: 'Title race', headline: W.pick(['ANYBODY\'S TROPHY', 'NO CHAMP, NO PROBLEM', 'YEAR ZERO', 'WIDE OPEN']),
        body: W.fill('No defending champion. No dynasty. The {a}, {b} and {c} lead a crowded field, but just {gap} rating points separate our No. 1 and No. {k} teams.', v),
        tid: top[0].tid, stat: { v: f1(gap), l: 'pts, No. 1 to No. ' + k } });
    }
    // contract year
    const exp = C.active.filter(p => p.contract && p.contract.exp === S.season).slice(0, 3);
    if (exp.length >= 2) {
      const val = p => U.money(PBC.Player.marketValue(p, L));
      const mv0 = PBC.Player.marketValue(exp[0], L), amt0 = exp[0].contract.amt;
      const v = Object.assign({ p1: pName(exp[0]), o1: exp[0].ovr, a1: U.money(amt0), v1: val(exp[0]), p2: pName(exp[1]), o2: exp[1].ovr, p3: exp[2] ? pName(exp[2]) : '', o3: exp[2] ? exp[2].ovr : '' }, C.pr);
      v.money = mv0 > amt0 * 1.1 ? W.fill('could command {v1} next summer', v) : mv0 < amt0 * 0.9 ? W.fill('the market may only pay {him} {v1} next summer', v) : W.fill('should land a similar deal (around {v1}) next summer', v);
      const tail = exp[2] ? W.fill('{p2} ({o2}) and {p3} ({o3}) are also playing for new deals.', v) : W.fill('{p2} ({o2}) is also playing for a new deal.', v);
      cand.push({ pri: 80, kicker: 'Contract year', headline: W.pick(['PLAYING FOR A PAYDAY', 'CONTRACT YEAR FEVER', 'MONEY ON THE LINE', 'SHOW ME THE MONEY']),
        body: W.fill('{p1} ({o1} OVR) makes {a1} this season, and {money}. ', v) + tail + ' Expect career years, or awkward exits.',
        pid: exp[0].id, tid: exp[0].tid, stat: { v: String(C.active.filter(p => p.contract && p.contract.exp === S.season).length), l: 'expiring deals' } });
    }
    // hot seat
    const hotX = user || U.maxBy(T, x => x.coach.heat);
    if (hotX) {
      const c = hotX.coach, e = expectationFor(C, hotX);
      const v = { COACH: up(coachLast(c.name)), COACHS: poss(up(coachLast(c.name))), coach: c.name, HEAT: up(c.label || heatLabel(c.heat)), CITY: up(hotX.city), nick: hotX.nick, exp: lowerFirst(e.label), rec: hotX.rec, seedText: hotX.seedText, heat: c.heat, heatText: HEAT_TEXT[c.label || heatLabel(c.heat)] || 'warm' };
      let body = W.fill('The {nick} owner wants the team to {exp}. We project {rec}, {seedText}. Heat index: {heat}/100, {heatText}.', v);
      if (c.isUser && c.year <= 1) body += ' The honeymoon starts now. It never lasts long.';
      cand.push({ pri: 85, kicker: 'Hot seat', headline: W.say(['{COACHS} SEAT: {HEAT}', 'ALL EYES ON {COACH}', 'PRESSURE CHECK: {CITY}', 'THE HOT SEAT'], v), body, tid: hotX.tid, stat: { v: String(c.heat), l: 'Heat index' }, coach: true });
    }
    // extras
    const retirees = C.retired.map(p => ({ p, h: C.histOf(p) })).filter(r => r.h && r.h.tid >= 0).sort((a, b) => b.h.ovr - a.h.ovr);
    if (retirees.length && retirees[0].h.ovr >= C.q(0.25)) {
      const r = retirees[0];
      const yrs = U.uniq((r.p.stats || []).filter(s => !s.po).map(s => s.season)).length;
      const v = pv(C, r.p, { yrs: yrs || 'many', others: listText(retirees.slice(1, 3).map(x => pName(x.p))) });
      cand.push({ pri: 55, kicker: 'Farewell', headline: W.pick(['END OF AN ERA', 'THANKS FOR THE MEMORIES', 'SUNSET']),
        body: W.fill('{name} called it a career this summer after {yrs} seasons in the league.', v) + (retirees.length > 1 ? W.fill(' {others} also hung up the sneakers.', v) : ' The league feels a little quieter already.'),
        pid: r.p.id, tid: -1, stat: { v: String(r.p.age), l: 'Age' } });
    }
    const inj = U.sortBy([].concat(...T.map(x => x.injured.map(p => ({ p, x })))), o => o.p.ovr, true)[0];
    if (inj && inj.p.ovr >= C.q(0.14)) {
      const v = pv(C, inj.p, { injury: injText(inj.p) });
      cand.push({ pri: 66, kicker: 'Injury report', headline: W.say(['{LAST} ON THE SHELF', 'SURVIVAL MODE IN {CITY}', 'THE WAITING GAME'], v),
        body: W.fill('{name} ({abbr}) opens the season on the shelf ({injury}). The {nick} need to tread water until {he} is back.', v), pid: inj.p.id, tid: inj.p.tid, stat: { v: String(inj.p.injury.days), l: 'days out' } });
    }
    const jumps = C.active.map(p => { const h = C.histOf(p); return h ? { p, gain: p.ovr - h.ovr } : null; }).filter(Boolean).sort((a, b) => b.gain - a.gain);
    if (jumps.length && jumps[0].gain >= 4) {
      const j = jumps[0];
      const v = pv(C, j.p, { gain: j.gain });
      cand.push({ pri: 60, kicker: 'Breakout', headline: W.say(['{LAST} LEVELS UP', 'SUMMER OF {LAST}', 'GLOW-UP ALERT'], v),
        body: W.fill('{name} added {gain} points to {his} overall rating over the summer and now sits at {ovr}. The {nick} may have found a new co-star.', v), pid: j.p.id, tid: j.p.tid, stat: { v: '+' + j.gain, l: 'OVR gained' } });
    }
    // evergreen stories (lead the page in year one, fill it later)
    {
      const top12 = C.active.slice(0, 12);
      const st = U.maxBy(T, x => top12.filter(p => p.tid === x.tid).length * 10 + x.strF);
      const cnt = top12.filter(p => p.tid === st.tid).length;
      if (cnt >= 2) {
        const v = { star: pName(st.roster[0]), star2: pName(st.roster[1]), nick: st.nick };
        cand.push({ pri: C.first ? 62 : 41, kicker: 'Super-team', headline: W.pick(['ASSEMBLE!', 'THE BIG TWO', 'DOUBLE TROUBLE']),
          body: W.fill('{star} and {star2} on the same roster? The {nick} have two of the league\'s top dozen players, and everyone else has a problem.', v), tid: st.tid, stat: { v: String(cnt), l: 'top-12 players' } });
      }
      const b = C.active[0];
      const vb = pv(C, b);
      cand.push({ pri: C.first ? 58 : 40, kicker: 'The best', headline: W.say(['{LAST} AND EVERYBODY ELSE', 'THE {LAST} QUESTION'], vb),
        body: W.fill('{name} enters the season as the highest-rated player in the league ({ovr} OVR). The {nick} will go exactly as far as {he} takes them.', vb), pid: b.id, tid: b.tid, stat: { v: String(b.ovr), l: 'OVR' } });
    }
    if (!C.first) {
      const riser = U.maxBy(T.filter(x => x.last && x.last.rank - x.rank >= 4), x => x.last.rank - x.rank);
      if (riser) {
        const v = { nick: riser.nick, NICK: up(riser.nick), from: riser.last.rank, to: riser.rank, lrec: `${riser.last.w}-${riser.last.l}`, rec: riser.rec };
        cand.push({ pri: 44, kicker: 'Dark horse', headline: W.fill(W.pick(['WATCH OUT FOR THE {NICK}', 'THE {NICK} ARE COMING', 'RISING FAST']), v),
          body: W.fill('The {nick} finished No. {from} last season ({lrec}). We have them at No. {to} and {rec}. Nobody is circling this team on the schedule yet. They will be.', v), tid: riser.tid, stat: { v: '+' + (riser.last.rank - riser.rank), l: 'spots up' } });
      }
    }
    const vet = C.active.slice(0, Math.round(C.active.length * 0.15)).filter(p => p.age >= 33).sort((a, b) => b.age - a.age || b.ovr - a.ovr)[0];
    if (vet) {
      const v = pv(C, vet);
      cand.push({ pri: 38, kicker: 'Last dance?', headline: W.say(['ONE MORE RUN', 'AGELESS {LAST}', 'THE LAST DANCE?'], v),
        body: W.fill('{name} is {age} and still rated {ovr} overall. Every season could be the last one, and the {nick} know it.', v), pid: vet.id, tid: vet.tid, stat: { v: String(vet.age), l: 'years old' } });
    }
    const items = cand.sort((a, b) => b.pri - a.pri).slice(0, 5).map((c, i) => { const o = Object.assign({ n: i + 1 }, c); delete o.pri; return o; });

    // sidebar: transaction wire, or by-the-numbers
    let side;
    if (moves.length >= 3) {
      side = { kind: 'wire', title: 'Transaction Wire', items: moves.slice(0, 7).map(m => {
        const k = kindOf(m), sg = signings[m.p.id];
        return { tid: m.to, text: `${shortName(m.p)} (${m.p.ovr})`, sub: `${m.from >= 0 ? C.ab(m.from) : 'FA'} → ${C.ab(m.to)}${k === 'trade' ? ' · trade' : sg ? ` · ${sg.years} yr${sg.years === 1 ? '' : 's'}, ${U.money(sg.amt)}` : ''}` };
      }) };
    } else {
      const nums = [];
      const b = C.active[0];
      nums.push({ v: String(b.ovr), text: `OVR for ${pName(b)}, the league's highest-rated player` });
      if (C.rookies.length) nums.push({ v: String(C.rookies.length), text: 'rookies on opening-night rosters' });
      nums.push({ v: U.money(L.cap), text: 'salary cap per team' });
      const youngest = U.minBy(T, x => x.age), oldest = U.maxBy(T, x => x.age);
      nums.push({ v: f1(youngest.age), text: `average age of the ${poss(youngest.nick)} top eight, youngest in the league` });
      nums.push({ v: f1(oldest.age), text: `average age of the ${poss(oldest.nick)} top eight, oldest in the league` });
      const tall = U.maxBy(C.active, p => p.hgt);
      nums.push({ v: U.height(tall.hgt), text: `${pName(tall)} (${tall.abbr || C.ab(tall.tid)}), the league's tallest player` });
      nums.push({ v: String(C.G), text: 'regular-season games per team' });
      side = { kind: 'numbers', title: 'By the Numbers', items: nums.slice(0, 6) };
    }
    return {
      kind: 'storylines', title: 'Top Storylines',
      headline: W.pick(['FIVE THINGS WE CAN\'T STOP TALKING ABOUT', 'THE STORYLINES', 'WHAT EVERYONE\'S TALKING ABOUT', 'THE BIG FIVE']),
      dek: W.pick(['The moves, the pressure and the kids everyone is talking about before the opening tip.', 'From the champs to the hot seat: the stories that will define the season.']),
      items, side,
    };
  }

  // ---- 4–5. Power rankings ----
  function powerBlurb(C, x) {
    const { W, rng } = C;
    const star = x.star, band = tierBand(C, x.rank);
    const v = {
      star: pName(star), sOvr: star ? star.ovr : 0, star2: pName(x.star2), city: x.city, nick: x.nick, rec: x.rec, ARec: cap1(withAn(x.rec)), age: f1(x.age), g: C.G,
      off: x.offLabel.replace(/\s*\(.*\)$/, '').toLowerCase(), def: x.defLabel.toLowerCase(),
      young: x.young ? pName(x.young) : pName(star), yAge: x.young ? x.young.age : star ? star.age : 0,
    };
    Object.assign(v, C.pr);
    const facts = [];
    if (x.last && x.last.champ) facts.push(W.fill('Defending champs. {star} and the {nick} keep the belt until somebody takes it.', v));
    const add = x.adds.find(a => !C.isRookie(a.p));
    if (add && add.p.ovr >= C.q(0.18)) facts.push(W.fill(W.pick(['Adding {add} ({addOvr} OVR) moves the needle. {star} finally has help.', 'The {add} addition ({addOvr} OVR) is the kind of move that wins a playoff series.']), Object.assign({ add: pName(add.p), addOvr: add.p.ovr }, v)));
    const loss = x.losses.find(l => l.to !== x.tid && l.ovr >= C.q(0.14));
    if (loss) facts.push(W.fill('Losing {loss} hurts. {star} has to carry more than ever.', Object.assign({ loss: pName(loss.p) }, v)));
    if (x.injured.length && x.injured[0] === star) facts.push(W.fill('{star} starts the year sidelined ({inj}). Survive that stretch and they\'re fine.', Object.assign({ inj: injText(star) }, v)));
    if (x.age >= 29.5) facts.push(W.fill(band <= 2 ? 'Average age {age}. The window is open, and closing.' : 'Old and not especially good: the worst combination in sports (avg. age {age}).', v));
    if (x.age <= 24.8) facts.push(W.fill(band <= 1 ? 'One of the youngest cores in the league (avg. age {age}), and already this good. Scary.' : 'One of the youngest cores in the league (avg. age {age}). Growing pains included.', v));
    if (x.last) {
      const mv = x.last.rank - x.rank;
      if (mv >= 8) facts.push(W.fill('Up {mv} spots from last season\'s finish. Believe it.', Object.assign({ mv }, v)));
      if (mv <= -8) facts.push(W.fill('Down {mv} spots from last season\'s finish. Something broke.', Object.assign({ mv: -mv }, v)));
    }
    if (facts.length && rng.chance(0.55)) return rng.pick(facts);
    return W.say(PR[band], v);
  }

  function pagePower(C, from, to) {
    const { W } = C;
    const rows = C.ranked.slice(from, to).map(x => ({
      rank: x.rank, tid: x.tid, abbr: x.abbr, team: x.full, nick: x.nick, tier: tierOf(C, x.rank), w: x.w, l: x.l, rec: x.rec,
      last: x.last ? `${x.last.w}-${x.last.l}` : '', lastRank: x.last ? x.last.rank : null, move: x.last ? x.last.rank - x.rank : null,
      star: pRef(C, x.star), blurb: powerBlurb(C, x),
    }));
    const part = from === 0 ? 1 : 2;
    const single = C.women;
    return {
      kind: 'power', title: single ? 'Power Rankings' : `Power Rankings ${from + 1}–${to}`, part, range: `${from + 1}–${to}`,
      headline: single ? W.pick(['POWER RANKINGS', 'THE PECKING ORDER', 'RANK AND FILE'])
        : part === 1 ? W.pick(['THE CONTENDERS', 'TOP OF THE FOOD CHAIN', 'THE UPPER CRUST', 'PENTHOUSE SUITES'])
          : W.pick(['THE REST OF THE PACK', 'THE BASEMENT TAPES', 'HOPE SPRINGS ETERNAL', 'THE LONG ROAD BACK']),
      dek: single ? `All ${C.n} teams, from title favorites to the lottery. Arrows compare to last season's finish.`
        : part === 1 ? 'Our preseason rankings, from the favorites to the bubble. Arrows compare to last season\'s finish.'
          : 'Play-in hopefuls, rebuilds, and at least one front office that should be embarrassed.',
      rows, first: C.first,
    };
  }

  // women only: position-by-position rankings (keeps the issue at 15 pages)
  function pagePositions(C) {
    const { W } = C;
    const POS = ['PG', 'SG', 'SF', 'PF', 'C'];
    const groups = POS.map(pos => {
      const list = C.active.filter(p => p.pos === pos).slice(0, 3);
      return {
        pos, label: PBC.Config.POS_NAME[pos] + 's',
        rows: list.map((p, i) => {
          const tag = PBC.Player.strengths(p, 1)[0];
          const q = tag && TAG_QUIPS[tag] ? W.fill(W.pick(TAG_QUIPS[tag]), C.pr) : W.pick(GENERIC_QUIPS);
          return pRef(C, p, { rank: i + 1, team: C.tn(p.tid), quip: q });
        }),
      };
    });
    return { kind: 'positions', title: 'Position Rankings', headline: W.pick(['POSITION BY POSITION', 'SPOT CHECK', 'THE BEST AT EVERY SPOT']), dek: 'The top three at every position on the floor, by overall rating.', groups };
  }

  // ---- 6–7. Conference previews ----
  function pageConf(C, conf) {
    const { W, L, T, rng } = C;
    const cname = L.confs[conf];
    const list = C.ranked.filter(x => x.t.conf === conf);
    const lead = list[0];
    const rows = list.map((x, i) => ({
      seed: i + 1, lgSeed: x.lgSeed, tid: x.tid, abbr: x.abbr, team: x.full, nick: x.nick, w: x.w, l: x.l, rec: x.rec,
      gb: i === 0 ? '-' : f1(((lead.w - x.w) + (x.l - lead.l)) / 2).replace(/\.0$/, ''), line: x.line,
      key: x.star ? `${shortName(x.star)} ${x.star.ovr}` : '', last: x.last ? `${x.last.w}-${x.last.l}` : '',
    }));
    const v = { CONF: up(cname), conf: cname, NICK: up(lead.nick), NICKS: poss(up(lead.nick)), nick: lead.nick };
    const close2 = list[1] && lead.w - list[1].w <= 1;
    const hl = close2 ? W.pick(['WIDE OPEN {CONF}', 'THE {CONF}: A TWO-HORSE RACE', 'DEAD HEAT IN THE {CONF}']) : W.pick(['{NICK} RULE THE {CONF}', 'THE {CONF} IS THE {NICKS} TO LOSE', 'LONG LIVE THE {NICK}', 'BEWARE THE {NICK}']);
    // sidebars
    const side = [];
    side.push({ label: 'Team to beat', tid: lead.tid, title: lead.full,
      text: W.fill(W.pick(['The {nick} ({rec}) have the {conf}\'s best roster and {star} ({sOvr} OVR). Everyone else is playing for second.', '{star} ({sOvr}) and a deep rotation make the {nick} the {conf} favorite. Anything less than the {deep} is a disappointment.']),
        { nick: lead.nick, rec: lead.rec, conf: cname, star: pName(lead.star), sOvr: lead.star ? lead.star.ovr : 0, deep: C.women ? 'Finals' : 'conference finals' }) });
    const sleeperPool = list.slice(C.women ? 2 : 5, C.women ? 5 : 11);
    const sleeper = U.maxBy(sleeperPool, x => (x.young ? (x.young.pot || x.young.ovr) - x.young.ovr : 0) + (x.last ? (x.last.rank - x.rank) * 0.3 : 0) + rng() * 3);
    if (sleeper) {
      side.push({ label: 'Sleeper', tid: sleeper.tid, title: sleeper.full,
        text: sleeper.young && sleeper.young !== sleeper.star
          ? W.fill('Watch the {nick}. {young} ({yAge}) is about to make a leap, and {star} is already here.', { nick: sleeper.nick, young: pName(sleeper.young), yAge: sleeper.young.age, star: pName(sleeper.star) })
          : W.fill('The {nick} are projected {seed} at {rec}, but {star} can steal a series against anyone.', { nick: sleeper.nick, seed: U.ordinal(sleeper.seed), rec: sleeper.rec, star: pName(sleeper.star) }) });
    }
    const fallPool = list.filter(x => x !== lead && x !== sleeper);
    const fall = U.maxBy(fallPool, x => (x.last ? (x.rank - x.last.rank) : 0) + (x.age - 27) * 0.8 + (x.seed <= 6 ? 1 : 0));
    if (fall) {
      const reason = fall.last && fall.rank - fall.last.rank >= 3
        ? W.fill('They won {lw} games last season; we see {w}. The roster simply isn\'t as good.', { lw: fall.last.w, w: fall.w })
        : fall.age >= 28.5 ? W.fill('Average age of the top eight: {age}. One injury and the whole thing wobbles.', { age: f1(fall.age) })
          : W.fill('Talented, but thin behind {star}. The margin for error is tiny.', { star: pName(fall.star) });
      side.push({ label: 'Fall risk', tid: fall.tid, title: fall.full, text: reason });
    }
    const mvp = U.maxBy(C.active.filter(p => T[p.tid] && T[p.tid].t.conf === conf).slice(0, 8), p => p.ovr + T[p.tid].pct * 10);
    const scoutV = pv(C, mvp || lead.star, { weak: list[list.length - 1].nick });
    const quote = W.say([
      '"You don\'t stop {last}. You just hope {he} has an off night."',
      '"The {nick} are the real deal. I don\'t care what anybody says."',
      '"Half this conference is rebuilding and the other half is pretending not to."',
      '"If {last} stays healthy, it\'s over. If not, it\'s chaos."',
      '"Everybody wants the {weak} in round one. Nobody will say it out loud."',
    ], scoutV);
    return {
      kind: 'conf', title: `${cname} Preview`, conf, confName: cname, headline: W.fill(hl, v),
      dek: C.conf
        ? `Predicted order of finish. Seeds 1–6 are in; ${L.playIn ? '7–10 fight it out in the play-in.' : '7–8 grab the last spots.'}`
        : `Predicted order of finish in the ${cname}. The top ${L.playoffTeams} teams league-wide make the playoffs, regardless of conference.`,
      rows, side, quote: { text: quote, by: W.pick([`Rival ${cname} scout`, 'Anonymous executive', 'Longtime league scout']) },
      mvp: mvp ? pRef(C, mvp, { team: C.tn(mvp.tid) }) : null, leagueFormat: !C.conf, playoffTeams: L.playoffTeams,
    };
  }

  // ---- 8. Your team ----
  const STRONG_LINES = {
    shoot: 'Five-out spacing, all night long.', finish: 'They live in the paint and pay no rent.', play: 'The ball never sticks.', perD: 'Perimeter defense with teeth.',
    rim: 'Nothing easy at the rim.', reb: 'Second chances are a first priority.', ath: 'They will run you out of the gym.', clutch: 'Ice water in late-game spots.',
    depth: 'The bench could start for some teams.', stars: 'Top-end talent wins in April.',
  };
  const WEAK_LINES = {
    shoot: 'Defenses will pack the paint and dare them to shoot.', finish: 'Too many tough twos.', play: 'Possessions stall late in the clock.', perD: 'Guards will get downhill.',
    rim: 'Opponents will attack the rim all night.', reb: 'Expect a lot of second chances. For the other team.', ath: 'Transition defense could be a problem.',
    clutch: 'Close games could get ugly.', depth: 'One injury away from real trouble.', stars: 'Who gets a bucket when it matters most?',
  };

  function pageTeam(C) {
    const { W, S, L, rng } = C;
    const x = C.user || C.ranked[0];
    const isUser = !!C.user;
    const band = tierBand(C, x.rank);
    const e = expectationFor(C, x);
    const c = x.coach;
    const hlBank = [
      ['ALL IN', 'WINDOW\'S OPEN', 'THIS IS THE YEAR?', 'NO MORE EXCUSES', 'CHAMPIONSHIP OR BUST'],
      ['ALL IN', 'WINDOW\'S OPEN', 'NO MORE EXCUSES', 'KNOCKING ON THE DOOR'],
      ['PROVE IT', 'THE BUBBLE', 'IN THE MIX', 'NEXT STEP'],
      ['UPHILL CLIMB', 'MIND THE GAP', 'SCRAP AND CLAW', 'BUILDING SOMETHING'],
      ['THE LONG GAME', 'GROWING PAINS', 'BUILDING BLOCKS', 'PATIENCE, PLEASE'],
    ][band];
    const last = x.star ? perGame(x.star, C.prev) : null;
    const tags = x.star ? PBC.Player.strengths(x.star, 2) : [];
    const coachSentence = c.isUser
      ? (c.year <= 1
        ? W.fill('{coach} takes over this season with a clean slate and a {yrs}-year deal.', { coach: c.name, yrs: S.coach && S.coach.contract ? numWord(S.coach.contract.years) : 'multi' })
        : W.fill('{coach} is {rec} as a head coach{titles}, now in year {yr} with the {nick}.', { coach: c.name, rec: c.rec, titles: c.titles ? ` with ${c.titles} title${c.titles > 1 ? 's' : ''}` : '', yr: numWord(c.year), nick: x.nick }))
      : W.fill('{coach} runs the show from the sideline.', { coach: c.name });
    const starSentence = !x.star ? '' : last
      ? W.fill('It starts with {star} ({ovr} OVR), who averaged {ppg} points, {rpg} rebounds and {apg} assists last season.', { star: pName(x.star), ovr: x.star.ovr, ppg: f1(last.ppg), rpg: f1(last.rpg), apg: f1(last.apg) })
      : tags.length
        ? W.fill('It starts with {star} ({ovr} OVR): {tags}.', { star: pName(x.star), ovr: x.star.ovr, tags: listText(tags.map(t => t.toLowerCase())) })
        : W.fill('It starts with {star} ({ovr} OVR).', { star: pName(x.star), ovr: x.star.ovr });
    const lineWord = x.line === 'po' ? (x.seed <= 2 ? 'with home court for a while' : 'safely in the playoff field') : x.line === 'pi' ? 'which means a trip to the play-in' : 'outside the playoff picture';
    const intro = W.fill('The {full} enter {sname} with the league\'s {sr} roster on paper ({str} team rating) and an owner who wants them to {exp}. ', {
      full: x.full, sname: C.sname, sr: x.strRank === 1 ? 'best' : `${U.ordinal(x.strRank)}-best`, str: f1(x.strF), exp: lowerFirst(e.label),
    }) + coachSentence + ' ' + starSentence + ' ' + W.fill('Our projection: {rec}, {seed}, {lw}.', { rec: x.rec, seed: x.seedText, lw: lineWord });

    const st5 = starters(C, x);
    const key = x.roster.slice(0, 5).map(p => {
      const l = perGame(p, C.prev);
      return pRef(C, p, { line: l ? lineText(l) : (C.isRookie(p) ? 'Rookie season' : (p.arch || PBC.Config.POS_NAME[p.pos])), tags: PBC.Player.strengths(p, 2), role: st5.indexOf(p) >= 0 ? 'Starter' : 'Bench', hgt: U.height(p.hgt) });
    });
    // X-factor
    let xf = null;
    const youngX = U.maxBy(x.roster.slice(2, 11).filter(p => p.age <= 24 && (p.pot || p.ovr) - p.ovr >= 5), p => (p.pot || p.ovr) - p.ovr + p.ovr * 0.1);
    const bench = x.roster.filter(p => st5.indexOf(p) < 0);
    const newbie = x.adds.map(a => a.p).find(p => x.roster.indexOf(p) >= 0 && x.roster.indexOf(p) < 9 && p !== x.star);
    if (youngX && rng.chance(0.6)) xf = pRef(C, youngX, { text: W.fill('{name} ({age}) has the tools to swing this season. If {he} makes the leap, the {nick} become a real problem.', pv(C, youngX)) });
    else if (newbie) xf = pRef(C, newbie, { text: W.fill('New arrival {name} ({ovr} OVR) is the wild card. The fit will decide how high the {nick} climb.', pv(C, newbie)) });
    else if (bench[0]) xf = pRef(C, bench[0], { text: W.fill('The {nick} go as far as their bench takes them, and {name} ({ovr} OVR) is the bench.', pv(C, bench[0])) });
    else if (youngX) xf = pRef(C, youngX, { text: W.fill('{name} ({age}) has the tools to swing this season.', pv(C, youngX)) });
    // strengths & weaknesses (team categories)
    const cats = C.CATS.map(k => ({ k: k.k, label: k.label, rank: x.cat[k.k].rank }));
    const strong = cats.filter(k => k.rank <= Math.ceil(C.n / 4)).sort((a, b) => a.rank - b.rank).slice(0, 3);
    if (!strong.length) strong.push(cats.slice().sort((a, b) => a.rank - b.rank)[0]);
    const weak = cats.filter(k => k.rank > C.n - Math.ceil(C.n / 4) && strong.indexOf(k) < 0).sort((a, b) => b.rank - a.rank).slice(0, 3);
    if (!weak.length) { const w = cats.slice().sort((a, b) => b.rank - a.rank).find(k => strong.indexOf(k) < 0); if (w) weak.push(w); }
    const fmtCat = (k, lines) => ({ label: k.label, rank: k.rank, of: C.n, rankText: `${U.ordinal(k.rank)} of ${C.n}`, text: lines[k.k] });
    // depth chart
    const POS = ['PG', 'SG', 'SF', 'PF', 'C'];
    const used = new Set(st5.map(p => p.id));
    const depth = POS.map((pos, i) => {
      const s = st5[i];
      const backups = x.roster.filter(p => !used.has(p.id) && p.pos === pos).slice(0, 2);
      backups.forEach(p => used.add(p.id));
      return { pos, players: [s ? { pid: s.id, name: shortName(s), ovr: s.ovr, starter: true } : null].concat(backups.map(p => ({ pid: p.id, name: shortName(p), ovr: p.ovr, starter: false }))).filter(Boolean) };
    });
    // leftover bench players (out of position) go to their own spot
    for (const p of x.roster) if (!used.has(p.id)) { const d = depth.find(q => q.pos === p.pos) || depth[4]; if (d.players.length < 4) { d.players.push({ pid: p.id, name: shortName(p), ovr: p.ovr, starter: false }); used.add(p.id); } }
    // the number
    const numbers = [];
    if (x.star) { const r = C.active.indexOf(x.star) + 1; numbers.push({ w: r <= 10 ? 3 : 1, v: String(x.star.ovr), text: `${pName(x.star)}'s overall rating, ${U.ordinal(r)} in the league` }); }
    const ageRank = C.T.slice().sort((a, b) => a.age - b.age).indexOf(x) + 1;
    if (ageRank <= 3) numbers.push({ w: 3, v: f1(x.age), text: `average age of the top eight, ${ageRank === 1 ? 'youngest' : U.ordinal(ageRank) + '-youngest'} in the league` });
    if (ageRank >= C.n - 2) numbers.push({ w: 3, v: f1(x.age), text: `average age of the top eight, ${ageRank === C.n ? 'oldest' : U.ordinal(C.n - ageRank + 1) + '-oldest'} in the league` });
    if (x.last) numbers.push({ w: 1.5, v: String(x.last.w), text: `wins last season (${x.last.w}-${x.last.l}${x.last.result ? ', ' + x.last.result.toLowerCase() : ''})` });
    const payRank = C.T.slice().sort((a, b) => b.payroll - a.payroll).indexOf(x) + 1;
    numbers.push({ w: payRank <= 3 || payRank >= C.n - 2 ? 2.5 : 1, v: U.money(x.payroll), text: `payroll, ${payRank === 1 ? 'highest' : payRank === C.n ? 'lowest' : U.ordinal(payRank) + '-highest'} in the league` });
    if (x.rookies.length >= 2) numbers.push({ w: 2, v: String(x.rookies.length), text: 'rookies on the opening-night roster' });
    const number = rng.pickW(numbers, numbers.map(q => q.w));
    delete number.w;
    // schedule
    const games = (S.schedule || []).filter(g => g.h === x.tid || g.a === x.tid);
    const opener = games[0] ? (() => { const g = games[0]; const home = g.h === x.tid; return `${home ? 'vs' : '@'} ${C.ab(home ? g.a : g.h)} · ${PBC.League.dateLabel(S, g.day)}`; })() : '';
    const payNote = x.payroll > L.tax ? 'Over the luxury tax' : x.payroll > L.cap ? 'Over the cap, under the tax' : `${U.money(L.cap - x.payroll)} under the cap`;
    const verdict = W.say([
      ['A top-two seed and a long, loud run in the playoffs.', 'Nothing short of the Finals will do.', 'Title contender. Full stop.'],
      [C.women ? 'A top-four seed and a real shot at the semifinals.' : 'A top-four seed and a real shot at the conference finals.', 'Home court in round one and a puncher\'s chance after that.'],
      ['Playoff team, first-round coin flip.', 'In the field, but nobody will be afraid of them yet.'],
      ['Play-in bubble. Every February game matters.', 'Fighting for the play-in until the final week.'],
      ['Lottery odds and a lot of minutes for the kids.', 'A development year. Wins are a bonus.'],
    ][band], {});
    const coachP = c.isUser && S.coach ? {
      name: c.name, age: S.coach.age, rec: c.rec, po: `${c.pw || 0}-${c.pl || 0}`, titles: c.titles, seasons: (S.coach.seasons || []).length, year: c.year,
      contract: S.coach.contract ? `${S.coach.contract.years} yr${S.coach.contract.years === 1 ? '' : 's'} · ${U.money(S.coach.contract.salary)}/yr` : '',
      rep: S.coach.rep == null ? 40 : S.coach.rep, security: S.coach.security == null ? 70 : S.coach.security, style: `${x.offLabel} · ${x.defLabel}`,
      heat: c.heat, heatLabel: c.label, rating: c.rating,
    } : { name: c.name, rec: c.rec, titles: c.titles, year: c.year, style: `${x.offLabel} · ${x.defLabel}`, rating: c.rating, heat: c.heat, heatLabel: heatLabel(c.heat), seasons: (x.t.history || []).length, po: '', contract: '', rep: null, security: null, age: null };
    return {
      kind: 'team', title: isUser ? `Inside the ${x.nick}` : `Cover Story: ${x.nick}`, tid: x.tid, isUser, team: x.full, abbr: x.abbr, nick: x.nick,
      kicker: isUser ? `Inside the ${x.nick}` : 'Featured team', headline: W.pick(hlBank), intro,
      proj: { w: x.w, l: x.l, rec: x.rec, seed: x.seed, seedText: x.seedText, line: x.line, rank: x.rank, strRank: x.strRank, str: f1(x.strF) },
      expectation: e.label, coach: coachP, key, xfactor: xf,
      strengths: strong.map(k => fmtCat(k, STRONG_LINES)), weaknesses: weak.map(k => fmtCat(k, WEAK_LINES)),
      depth, number, opener, payroll: { amt: U.money(x.payroll), cap: U.money(L.cap), note: payNote }, verdict,
      scheme: { off: x.offLabel, def: x.defLabel },
    };
  }

  // ---- 9. Top 10 players ----
  function pageTop10(C) {
    const { W, rng } = C;
    const rows = C.active.slice(0, 10).map((p, i) => {
      const l = perGame(p, C.prev);
      const tags = PBC.Player.strengths(p, 3);
      let quip;
      if (p.age >= 33 && rng.chance(0.5)) quip = W.fill(W.pick(['Father Time is undefeated. {last} is taking him to overtime.', '{age} years young and still cooking.']), pv(C, p));
      else if (p.age <= 22 && rng.chance(0.5)) quip = W.fill(W.pick(['Only {age}. Let that sink in.', 'Can\'t legally rent a car in some states. Can legally ruin your night.']), pv(C, p));
      else {
        const tag = tags.find(t => TAG_QUIPS[t] && t !== 'Free throw ace' && t !== 'Iron man') || tags.find(t => TAG_QUIPS[t]);
        quip = tag ? W.fill(W.pick(TAG_QUIPS[tag]), pv(C, p)) : W.pick(GENERIC_QUIPS);
      }
      return pRef(C, p, { rank: i + 1, team: C.tn(p.tid), hgt: U.height(p.hgt), line: l ? lineText(l) : (C.isRookie(p) ? 'Rookie season' : tags.join(' · ') || `${p.ovr} OVR`), tags, quip, arch: p.arch || '' });
    });
    return { kind: 'top10', title: 'Top 10 Players', headline: W.pick(['THE TOP 10', 'THE A-LIST', 'BEST IN THE BUSINESS', 'THE ELITE TEN']), dek: 'Ranked by overall rating, with last season\'s numbers. Arguments welcome; corrections are not.', rows };
  }

  // ---- 10. Award predictions ----
  function pageAwards(C) {
    const { W, T, rng, S } = C;
    // odds carry a bookmaker's margin (implied probabilities add up to more than 100%)
    const mk = (list, n, base, reason) => {
      const sc = list.map(o => o.score);
      const gap = sc.length > 1 ? sc[0] - sc[1] : 3;
      const probs = calibrated(sc, U.clamp(base + gap * 0.03, base, base + 0.15));
      return list.slice(0, n).map((o, i) => Object.assign({ odds: americanOdds(probs[i] * 1.12), prob: Math.round(probs[i] * 100), reason: reason(o, i) }, o.ref));
    };
    const awards = [];
    // MVP
    const MVP_WHY = [
      '{ovr} OVR on a projected {w}-win team. Voters love that combination.', 'The best player on a projected {seed}. Historically, that\'s enough.',
      'If the {nick} overachieve, {he} gets the credit. That\'s how this works.', 'Nobody in the league combines {tag} and winning quite like this.',
    ];
    const MVP_WHY_PPG = [
      'Put up {ppg} points a night last season, and the {nick} got better around {him}.', '{ppg} points per game last season. Add a few more wins and the trophy is {his}.',
      'Averaged {ppg} a night last year and somehow looks even hungrier.',
    ];
    const mvpPool = C.active.slice(0, 30).map(p => {
      const l = perGame(p, C.prev), x = T[p.tid];
      return { p, l, x, score: p.ovr + (x.pct - 0.5) * 18 + (l ? l.ppg * 0.1 : 0) + rng.gauss(0, 0.8), ref: pRef(C, p, { team: C.tn(p.tid) }) };
    }).sort((a, b) => b.score - a.score).slice(0, 12);
    const mvpFavs = mk(mvpPool, 4, 0.2, o => {
      const v = pv(C, o.p, { w: o.x.w, seed: `No. ${o.x.seed} seed`, ppg: o.l ? f1(o.l.ppg) : '', tag: (PBC.Player.strengths(o.p, 1)[0] || 'talent').toLowerCase().replace(/s$/, '') + 's' });
      return o.l && o.l.ppg >= 18 && rng.chance(0.45) ? W.say(MVP_WHY_PPG, v) : W.say(MVP_WHY, v);
    });
    const longIdx = Math.min(mvpPool.length - 1, 5 + rng.int(0, 4));
    const long = mvpPool[longIdx];
    const mvpSc = mvpPool.map(o => o.score);
    const longProb = calibrated(mvpSc, U.clamp(0.2 + (mvpSc[0] - (mvpSc[1] || mvpSc[0])) * 0.03, 0.2, 0.35))[longIdx];
    if (long && mvpFavs.every(f => f.pid !== long.p.id)) {
      mvpFavs.push(Object.assign({ odds: americanOdds(longProb * 1.12), prob: Math.max(1, Math.round(longProb * 100)), long: true,
        reason: W.fill('Our long shot. Needs the {nick} to win {w2}+ games and a few video-game box scores.', pv(C, long.p, { w2: Math.round(C.G * 0.62) })) }, long.ref));
    }
    awards.push({ key: 'mvp', label: 'Most Valuable Player', short: 'MVP', favs: mvpFavs });

    // DPOY
    const dPool = C.active.slice(0, 120).map(p => {
      const l = perGame(p, C.prev);
      const r = p.r;
      const score = (r.perD * 0.28 + r.intD * 0.24 + r.block * 0.2 + r.steal * 0.16 + r.helpD * 0.12) / 3 + (l ? (l.spg + l.bpg) * 1.1 : 0) + p.ovr * 0.08 + rng.gauss(0, 0.5);
      return { p, l, score, ref: pRef(C, p, { team: C.tn(p.tid) }) };
    }).sort((a, b) => b.score - a.score).slice(0, 10);
    awards.push({ key: 'dpoy', label: 'Defensive Player of the Year', short: 'DPOY', favs: mk(dPool, 4, 0.24, o => o.l && o.l.spg + o.l.bpg >= 1.5
      ? W.fill(W.pick(['{bpg} blocks and {spg} steals a night last season. Opponents noticed.', 'Led the {nick} with {stocks} stocks per game. The film is terrifying.']), pv(C, o.p, { bpg: f1(o.l.bpg), spg: f1(o.l.spg), stocks: f1(o.l.bpg + o.l.spg) }))
      : W.fill(W.pick(['Perimeter D {perD}, interior D {intD}. Pick your poison.', 'Help-defense IQ of {helpD}. {He} is always in the right spot.', 'Block rating {block}. Drive at your own risk.']), pv(C, o.p, { perD: o.p.r.perD, intD: o.p.r.intD, helpD: o.p.r.helpD, block: o.p.r.block }))) });

    // ROY
    const rPool = C.rookies.slice(0, 10).map(p => {
      const x = T[p.tid];
      const teamRank = x.roster.indexOf(p) + 1;
      return { p, x, teamRank, score: p.ovr + (teamRank <= 5 ? 3 : teamRank <= 8 ? 1.5 : 0) + rng.gauss(0, 0.8), ref: pRef(C, p, { team: C.tn(p.tid), pick: pickText(p) }) };
    }).sort((a, b) => b.score - a.score);
    awards.push({ key: 'roy', label: 'Rookie of the Year', short: 'ROY', favs: rPool.length ? mk(rPool, 4, 0.3, o => o.teamRank <= 5
      ? W.fill(W.pick(['{pick} with {aOvr} OVR and a starting job waiting.', 'Instant minutes on {aNick} team that needs {him} from day one.']), pv(C, o.p, { pick: pickText(o.p) }))
      : W.fill(W.pick(['Will have to earn minutes behind a crowded rotation. The talent says {he} will.', '{pick} with {tag} to burn. Needs the minutes to follow.']), pv(C, o.p, { pick: pickText(o.p), tag: tagNoun(o.p) }))) : [],
    note: rPool.length ? '' : 'The rookie class hasn\'t reported yet. Check back after the draft.' });

    // Sixth player
    const benchPool = [];
    for (const x of T) {
      const st = new Set(starters(C, x).map(p => p.id));
      x.roster.filter(p => !st.has(p.id)).slice(0, 2).forEach(p => {
        const l = perGame(p, C.prev);
        benchPool.push({ p, x, l, score: p.ovr + (l ? l.ppg * 0.08 : 0) + rng.gauss(0, 0.6), ref: pRef(C, p, { team: C.tn(p.tid) }) });
      });
    }
    benchPool.sort((a, b) => b.score - a.score);
    awards.push({ key: 'smoy', label: 'Sixth Player of the Year', short: '6POY', favs: mk(benchPool.slice(0, 12), 4, 0.22, o => o.l && o.l.ppg >= 10
      ? W.fill('Instant offense off the bench: {ppg} points a night last season.', pv(C, o.p, { ppg: f1(o.l.ppg) }))
      : W.fill(W.pick(['Would start for half the league. Instead {he} anchors the {nick} bench.', '{ovr} OVR and coming off the pine. The {nick} are spoiled.']), pv(C, o.p))) });

    // MIP
    const mipCap = C.q(0.03);
    const mipPool = C.active.filter(p => p.age <= 25 && p.ovr <= mipCap && ((p.stats || []).some(s => s.season < S.season) || (p.yearsPro || 0) >= 1) && !C.isRookie(p))
      .map(p => {
        const h = C.histOf(p);
        const jump = h ? p.ovr - h.ovr : 0;
        return { p, jump, score: ((p.pot || p.ovr) - p.ovr) * 0.7 + jump * 0.5 + (p.ovr - 70) * 0.08 + rng.gauss(0, 1.2), ref: pRef(C, p, { team: C.tn(p.tid) }) };
      }).sort((a, b) => b.score - a.score).slice(0, 10);
    awards.push({ key: 'mip', label: 'Most Improved Player', short: 'MIP', favs: mk(mipPool, 4, 0.16, o => o.jump >= 2
      ? W.fill('Jumped {jump} OVR points over the summer (now {ovr}). The trend line is vertical.', pv(C, o.p, { jump: o.jump }))
      : W.fill(W.pick(['Only {age}, and scouts say the ceiling is way up there.', 'A bigger role in {city} plus a summer in the gym equals a breakout.']), pv(C, o.p))) });

    // Coach of the Year
    const coyPool = T.map(x => ({ x, score: (x.pct - (x.last ? x.last.pct : 0.5)) * 6 + (x.coach.rating - 65) / 12 + (x.pct - 0.5) * 2 + rng.gauss(0, 0.4), ref: { tid: x.tid, name: x.coach.name, abbr: x.abbr, team: x.full, isUser: x.coach.isUser } }))
      .sort((a, b) => b.score - a.score).slice(0, 12);
    awards.push({ key: 'coy', label: 'Coach of the Year', short: 'COY', favs: mk(coyPool, 4, 0.17, o => o.x.last
      ? W.fill('Takes the {nick} from {lw} wins to a projected {w}. Voters love a turnaround.', { nick: o.x.nick, lw: o.x.last.w, w: o.x.w })
      : W.fill('{coach} ({rating} coach rating) has the {nick} projected for {w} wins. The system works.', { coach: o.x.coach.name, rating: o.x.coach.rating, nick: o.x.nick, w: o.x.w })) });

    return { kind: 'awards', title: 'Award Predictions', headline: W.pick(['THE ENVELOPE, PLEASE', 'HARDWARE WATCH', 'PLACE YOUR BETS', 'AWARD SEASON STARTS NOW']), dek: 'Our favorites for every major award, with odds. For entertainment purposes only. Do not bet the house on our MIP pick.', awards };
  }

  // ---- 11. Rookie class ----
  /** scouting-style ceiling label; relative to the league's current talent curve, with a little fog (never the exact potential) */
  function ceilingOf(C, p) {
    const r = makeRng(U.hash(`${C.S.saveId}|ceil|${p.id}`));
    const est = (p.pot || p.ovr) + r.gauss(0, 2);
    if (!C.ceilCuts) {
      const f = C.active.length / 390;
      C.ceilCuts = [2, 14, 40, 90, 180].map(i => (C.active[Math.min(C.active.length - 1, Math.round(i * f))] || { ovr: 60 }).ovr);
    }
    const k = C.ceilCuts;
    return est >= k[0] ? 'MVP upside' : est >= k[1] ? 'Franchise cornerstone' : est >= k[2] ? 'Future All-Star' : est >= k[3] ? 'Quality starter' : est >= k[4] ? 'Rotation player' : 'Long-term project';
  }

  function pageRookies(C) {
    const { W, S } = C;
    const nextYear = S.season + 1;
    const board = U.sortBy(C.prospects.filter(p => p.draft && p.draft.year === nextYear), p => p.ovr + (p.pot || p.ovr) * 0.35, true).slice(0, 5)
      .map((p, i) => pRef(C, p, { rank: i + 1, origin: p.origin || '', ceiling: ceilingOf(C, p), hgt: U.height(p.hgt) }));
    const mode = C.rookies.length >= 3 ? 'rookies' : 'prospects';
    const pool = mode === 'rookies' ? C.rookies.slice(0, 8) : U.sortBy(C.prospects.filter(p => p.draft && p.draft.year === nextYear), p => p.ovr + (p.pot || p.ovr) * 0.35, true).slice(0, 8);
    const rows = pool.map((p, i) => {
      const v = pv(C, p, { origin: p.origin || 'overseas', tag: tagNoun(p), hgt: U.height(p.hgt), wing: U.height(p.wing || p.hgt) });
      const blurb = W.say([
        '{origin} product with {tag} to spare.',
        '{hgt} with a {wing} wingspan and a motor that doesn\'t quit.',
        'The {tag} is already pro-level. The rest is coming.',
        'Scouts rave about the {tag}. Coaches rave about the work ethic.',
        'Raw, toolsy and fearless. The {tag} is the calling card.',
        '{origin} made {him} a star. The pros will make {him} earn it.',
      ], v);
      return pRef(C, p, { rank: i + 1, team: p.tid >= 0 ? C.tn(p.tid) : '', pick: mode === 'rookies' ? pickText(p) : `Big board No. ${i + 1}`, origin: p.origin || '', hgt: U.height(p.hgt), ceiling: ceilingOf(C, p), blurb });
    });
    const supers = [];
    if (pool.length) {
      const ready = U.maxBy(pool, p => p.ovr);
      supers.push({ label: 'Most pro-ready', pid: ready.id, name: pName(ready), text: `${ready.ovr} OVR on day one.` });
      const ceil = U.maxBy(pool.filter(p => p !== ready), p => (p.pot || p.ovr) + p.id * 1e-6);
      if (ceil) supers.push({ label: 'Highest ceiling', pid: ceil.id, name: pName(ceil), text: `Our scouts' ceiling: ${ceilingOf(C, ceil)}.` });
      if (mode === 'rookies') {
        const steal = U.maxBy(pool.filter(p => p.draft && (p.draft.round > 1 || p.draft.pick > 10) && p !== ready && p !== ceil), p => p.ovr);
        if (steal) supers.push({ label: 'Steal of the draft', pid: steal.id, name: pName(steal), text: `${pickText(steal)}, already ${steal.ovr} OVR.` });
      }
      const kid = U.minBy(pool.filter(p => supers.every(s => s.pid !== p.id)), p => p.age + p.id * 1e-6);
      if (kid) supers.push({ label: 'Youngest', pid: kid.id, name: pName(kid), text: `Just ${kid.age} years old.` });
    }
    const year = mode === 'rookies' ? S.season : nextYear;
    return {
      kind: 'rookies', title: mode === 'rookies' ? 'Rookie Class' : 'Draft Watch', mode,
      headline: mode === 'rookies' ? W.fill(W.pick(['CLASS OF {year}', 'THE NEXT WAVE', 'FRESH FACES', 'NEW KIDS ON THE BLOCK']), { year }) : W.fill(W.pick(['THE CLASS OF {year}', 'FUTURE SHOCK', 'SCOUTING THE FUTURE']), { year }),
      dek: mode === 'rookies' ? `The best of the ${S.season} draft class, ranked by how ready they are to help right now.` : `No rookies have made rosters yet, so we scouted the ${nextYear} draft class instead.`,
      rows, supers, board: mode === 'rookies' ? board : [], boardTitle: `Way-too-early ${nextYear} big board`, year,
    };
  }

  // ---- 12. Report card ----
  function gradeFromZ(z) {
    const cut = [1.7, 1.2, 0.8, 0.45, 0.15, -0.1, -0.35, -0.6, -0.85, -1.15, -1.5];
    for (let i = 0; i < cut.length; i++) if (z >= cut[i]) return GRADES[i];
    return 'F';
  }
  M.gradeFromZ = gradeFromZ;

  function pageGrades(C) {
    const { W, T, rng } = C;
    const mode = C.first ? 'roster' : 'offseason';
    const rows = T.map(x => {
      let score, delta = null;
      const add = x.adds.filter(a => !C.isRookie(a.p))[0] || null;
      const rook = x.rookies[0] || null;
      const loss = x.losses.find(l => l.to !== x.tid) || null;
      if (mode === 'offseason') {
        delta = x.lastStr != null ? x.strF - x.lastStr : 0;
        const base = C.q(0.35);
        score = delta + U.sum(x.adds.slice(0, 2), a => Math.max(0, a.p.ovr - base)) * 0.04 - U.sum(x.losses.slice(0, 2), l => Math.max(0, l.ovr - base)) * 0.04 + rng.gauss(0, 0.1);
      } else {
        score = x.strF * 0.6 + x.depth * 0.25 + avg(x.roster.slice(0, 2), p => p.ovr) * 0.15 + rng.gauss(0, 0.15);
      }
      return { x, score, delta, add: add ? add.p : rook, loss: loss ? loss.p : null };
    });
    const mean = avg(rows, r => r.score);
    const sd = Math.sqrt(avg(rows, r => (r.score - mean) * (r.score - mean)));
    const sdF = mode === 'offseason' ? Math.max(sd, 0.9) : Math.max(sd, 0.01);
    rows.forEach(r => { r.z = (r.score - mean) / sdF; r.grade = gradeFromZ(r.z); });
    rows.sort((a, b) => b.score - a.score || a.x.tid - b.x.tid);
    const out = rows.map(r => ({
      tid: r.x.tid, abbr: r.x.abbr, team: r.x.full, grade: r.grade,
      delta: r.delta == null ? '' : (r.delta >= 0 ? '+' : '') + f1(r.delta),
      add: r.add ? shortName(r.add) : '', addOvr: r.add ? r.add.ovr : null, loss: r.loss ? shortName(r.loss) : '',
      note: mode === 'offseason' ? (r.add ? `+ ${shortName(r.add)}` : r.loss ? `− ${shortName(r.loss)}` : 'Stood pat') : `${f1(r.x.strF)} rating`,
    }));
    const blurb = (r, good) => {
      const v = Object.assign({ nick: r.x.nick, add: r.add ? pName(r.add) : '', addOvr: r.add ? r.add.ovr : '', loss: r.loss ? pName(r.loss) : '', delta: r.delta == null ? '' : f1(Math.abs(r.delta)), star: pName(r.x.star), star2: pName(r.x.star2) }, C.pr);
      const bank = [];
      const quiet = mode === 'offseason' && Math.abs(r.delta || 0) < 0.35 && !r.x.adds.length && !r.x.losses.length;
      if (quiet) {
        bank.push(good ? 'Ran it back with the same group. Continuity counts for something.' : 'Stood pat. Sometimes that\'s a plan; sometimes it\'s a shrug.',
          good ? 'No splashy moves, no drama, no regrets.' : 'Same roster, same questions.');
      } else if (mode === 'offseason') {
        if (good) {
          if (r.add) bank.push('Added {add} ({addOvr} OVR) without giving up anything that matters. Chef\'s kiss.');
          if (r.delta > 0) bank.push('The rotation got {delta} points better on paper. Paper wins games, right?');
          bank.push('Won the summer. Now go win the winter.', 'Aggressive, smart and a little bit greedy. We respect it.');
        } else {
          if (r.loss) bank.push('Lost {loss} and replaced {him} with vibes.', 'Watching {loss} walk out the door was the summer\'s low point.');
          if (r.delta < 0) bank.push('The roster is {delta} points worse on paper than it was in June.');
          bank.push('Everyone got a year older. Nobody got better.', 'The summer plan appears to have been "hope."');
        }
      } else {
        if (good) bank.push('{star} and {star2} lead a roster with no obvious holes.', 'Deep, balanced and loaded at the top. No notes.', 'The kind of roster other front offices print out and stare at.');
        else bank.push('Thin at the top and thinner on the bench.', 'The front office has work to do before the trade deadline.', 'A lot of minutes to fill and not a lot of players to fill them.');
      }
      return W.fill(W.pick(bank), v);
    };
    const honor = rows.slice(0, 3).map(r => ({ tid: r.x.tid, team: r.x.full, grade: r.grade, text: blurb(r, true) }));
    const detention = rows.slice(-3).reverse().map(r => ({ tid: r.x.tid, team: r.x.full, grade: r.grade, text: blurb(r, false) }));
    return {
      kind: 'grades', mode, title: mode === 'offseason' ? 'Offseason Report Card' : 'Roster Report Card',
      headline: mode === 'offseason' ? W.pick(['WHO WON THE SUMMER?', 'GRADING THE OFFSEASON', 'REPORT CARD DAY', 'SUMMER SCHOOL']) : W.pick(['ROSTER REPORT CARD', 'FIRST-DAY GRADES', 'MAKING THE GRADE']),
      dek: mode === 'offseason' ? 'Graded on how much each roster changed on paper since last season ended: additions, departures and player development.'
        : 'No offseason to judge yet, so we graded what every front office starts with: top-end talent, depth and balance.',
      rows: out, honor, detention,
    };
  }

  // ---- 13. Coaches corner ----
  function pageCoaches(C) {
    const { W, T, rng } = C;
    const all = T.map(x => {
      const heat = x.coach.heat;
      return { x, name: x.coach.name, rating: x.coach.rating, heat, isUser: x.coach.isUser };
    });
    const byRating = all.slice().sort((a, b) => b.rating - a.rating || a.x.tid - b.x.tid);
    byRating.forEach((c, i) => { c.rank = i + 1; });
    const shown = byRating.slice(0, 10);
    const me = byRating.find(c => c.isUser);
    if (me && shown.indexOf(me) < 0) shown.push(me);
    const rankRows = shown.map(c => ({
      rank: c.rank, name: c.name, tid: c.x.tid, abbr: c.x.abbr, team: c.x.full, rating: c.rating, isUser: c.isUser,
      rec: c.x.coach.rec, titles: c.x.coach.titles, note: c.x.coach.titles ? `${c.x.coach.titles}× champ` : c.x.coach.rec !== '0-0' ? c.x.coach.rec : 'First season',
    }));
    const reasonFor = c => {
      const x = c.x;
      const bits = [];
      bits.push(`Projected ${x.rec}.`);
      if (x.last && x.last.pct < 0.45) bits.push(`Last year's ${x.last.w}-${x.last.l} didn't help.`);
      if (x.t.owner && x.t.owner.patience < 45) bits.push('The owner is not a patient person.');
      if ((x.t.market || 3) >= 4) bits.push('Big market, big expectations.');
      if (x.age < 25) bits.push('A young roster buys a little time.');
      if (bits.length < 2) bits.push(`Owner patience: ${x.t.owner ? x.t.owner.patience : 60}/100.`);
      if (c.isUser) bits.push('(Yes, that\'s you.)');
      return bits.slice(0, 3).join(' ');
    };
    const hot = all.slice().sort((a, b) => b.heat - a.heat).slice(0, 5).map(c => ({ name: c.name, tid: c.x.tid, abbr: c.x.abbr, team: c.x.full, heat: c.heat, label: heatLabel(c.heat), isUser: c.isUser, text: reasonFor(c) }));
    const safe = all.slice().sort((a, b) => a.heat - b.heat).slice(0, 3).map(c => ({ name: c.name, tid: c.x.tid, abbr: c.x.abbr, team: c.x.full, heat: c.heat, label: heatLabel(c.heat), isUser: c.isUser,
      text: c.x.last && c.x.last.champ ? 'Won a title. Can do whatever they want.' : c.x.age < 25 ? 'Rebuild shield fully activated.' : c.x.pct > 0.6 ? 'Winning cures everything.' : 'The owner loves them. Nobody knows why.' }));
    const qTeams = rng.shuffle(all.filter(c => !c.isUser)).slice(0, 3);
    const QUOTES = [
      '"We\'re going to play fast, defend and share the ball."', '"Health is the biggest thing for us."', '"I don\'t look at predictions. Somebody told me we\'re {rankOrd}. I don\'t look at predictions."',
      '"Our young players had great summers. Everybody had great summers."', '"I love this group\'s chemistry. We haven\'t practiced yet, but I love it."',
      '"We\'re not rebuilding. We\'re retooling. It\'s different. Trust me."', '"Our identity? Toughness. And shooting. And toughness."', '"I\'ve never seen {star} in better shape."',
      '"{Games} games is a marathon. Well, it\'s a lot of games."', '"We\'ll figure out the rotation. I have a spreadsheet."',
    ];
    const Games = C.G === 82 ? 'Eighty-two' : C.G === 44 ? 'Forty-four' : cap1(numWord(C.G));
    const quotes = qTeams.map(c => ({ text: W.fill(W.pick(QUOTES), { rankOrd: U.ordinal(c.x.rank), star: c.x.star ? c.x.star.last : 'our star', Games }), by: c.name, tid: c.x.tid, team: c.x.full }));
    const user = me ? { name: me.name, rank: me.rank, rating: me.rating, heat: me.heat, label: heatLabel(me.heat), tid: me.x.tid, of: C.n } : null;
    return {
      kind: 'coaches', title: 'Coaches\' Corner', headline: W.pick(['THE HOT SEAT', 'COACHING CAROUSEL', 'WHISTLES & WORRIES', 'CLIPBOARD CONFIDENTIAL']),
      dek: 'Who can coach, who is coaching for their job, and what they all said at media day.', rank: rankRows, hot, safe, quotes, user,
    };
  }

  // ---- 14. Last season in review (or five things to watch) ----
  function pageReview(C) {
    const { W, T, S, L } = C;
    const h = C.hist;
    if (!h) return pageWatch(C);
    const prevName = C.women ? String(C.prev) : U.seasonLabel(C.prev);
    const champ = h.champion != null ? T[h.champion] : null;
    const ru = h.runnerUp != null ? T[h.runnerUp] : null;
    const aw = h.awards || {};
    const P = id => (id != null ? S.players[id] : null);
    const fm = P(h.fmvp);
    const fmLine = fm ? perGame(fm, C.prev, true) : null;
    const awardRow = (label, id) => {
      const p = P(id);
      if (!p) return null;
      const l = perGame(p, C.prev);
      return { label, pid: p.id, name: pName(p), tid: l ? l.tid : p.tid, abbr: C.ab(l ? l.tid : p.tid), line: l ? lineText(l) : '' };
    };
    const awards = [awardRow('MVP', aw.mvp), awardRow('Defensive POY', aw.dpoy), awardRow('Rookie of the Year', aw.roy), awardRow('Sixth Player', aw.smoy), awardRow('Most Improved', aw.mip)].filter(Boolean);
    if (aw.coyTid != null && T[aw.coyTid]) {
      const x = T[aw.coyTid];
      const coachName = h.userTid === x.tid && S.coach ? S.coach.name : x.coach.name;
      awards.push({ label: 'Coach of the Year', tid: x.tid, name: coachName, abbr: x.abbr, line: x.last ? `${x.last.w}-${x.last.l}, ${x.full}` : x.full });
    }
    const LBL = { ppg: 'Points', rpg: 'Rebounds', apg: 'Assists', spg: 'Steals', bpg: 'Blocks' };
    const leaders = Object.keys(LBL).filter(k => aw.leaders && aw.leaders[k] && P(aw.leaders[k].pid)).map(k => {
      const p = P(aw.leaders[k].pid);
      const l = perGame(p, C.prev);
      return { k, label: LBL[k], pid: p.id, name: pName(p), abbr: C.ab(l ? l.tid : p.tid), val: f1(aw.leaders[k].val) };
    });
    // records
    const records = [];
    const R = S.records;
    const CATL = { pts: 'points', reb: 'rebounds', ast: 'assists', stl: 'steals', blk: 'blocks', tpm: 'three-pointers' };
    const onlySeason = (S.history || []).length <= 1;
    if (R && R.game) {
      for (const k of Object.keys(CATL)) {
        const list = R.game[k] || [];
        const idx = list.findIndex(e => e.season === C.prev);
        if (idx < 0) continue;
        const e = list[idx];
        const opp = e.opp != null && T[e.opp] ? ` vs ${T[e.opp].abbr}` : '';
        if (idx === 0) records.push({ big: String(e.val), label: onlySeason ? `Most ${CATL[k]} in a game` : `League record: ${CATL[k]}`, text: `${e.name} (${C.ab(e.tid)})${opp}`, record: !onlySeason });
        else if (!onlySeason && idx < 3) records.push({ big: String(e.val), label: `${U.ordinal(idx + 1)}-most ${CATL[k]} ever`, text: `${e.name} (${C.ab(e.tid)})${opp}`, record: false });
      }
      const tg = R.teamGame && R.teamGame.pts ? R.teamGame.pts.findIndex(e => e.season === C.prev) : -1;
      if (tg === 0) { const e = R.teamGame.pts[0]; records.push({ big: String(e.val), label: onlySeason ? 'Most points by a team' : 'Team record: points', text: `${C.ab(e.tid)}${e.opp != null && T[e.opp] ? ' vs ' + T[e.opp].abbr : ''}`, record: !onlySeason }); }
    }
    records.sort((a, b) => (b.record ? 1 : 0) - (a.record ? 1 : 0));
    // standings extremes
    const st = (h.standings || []).slice().sort((a, b) => (b.w / Math.max(1, b.w + b.l)) - (a.w / Math.max(1, a.w + a.l)));
    const best = st[0] ? { tid: st[0].tid, abbr: C.ab(st[0].tid), team: C.tn(st[0].tid), rec: `${st[0].w}-${st[0].l}` } : null;
    const worst = st.length ? { tid: st[st.length - 1].tid, abbr: C.ab(st[st.length - 1].tid), team: C.tn(st[st.length - 1].tid), rec: `${st[st.length - 1].w}-${st[st.length - 1].l}` } : null;
    // the user's last season
    let yours = null;
    const utid = h.userTid != null && h.userTid >= 0 ? h.userTid : S.userTid;
    if (utid >= 0 && T[utid] && T[utid].last) {
      const x = T[utid];
      const leader = U.maxBy(Object.values(S.players).map(p => ({ p, l: perGame(p, C.prev) })).filter(o => o.l && o.l.tid === utid && o.l.gp >= 10), o => o.l.ppg * o.l.gp);
      const rv = S.coach && S.coach.lastReview && S.coach.lastReview.season === C.prev ? S.coach.lastReview : null;
      yours = {
        tid: utid, team: x.full, rec: `${x.last.w}-${x.last.l}`, result: x.last.result || '', seed: x.last.seed,
        leader: leader ? `${pName(leader.p)}: ${f1(leader.l.ppg)} PPG` : '',
        verdict: rv ? `Owner review: ${rv.verdict === 'extended' ? 'contract extended' : rv.verdict === 'retained' ? 'retained' : rv.verdict}. Job security ${rv.security}/100.` : '',
        text: W.fill(W.pick([
          'The {nick} went {rec} and {res}. {more}', '{rec}, then {res}. {more}',
        ]), { nick: x.nick, rec: `${x.last.w}-${x.last.l}`, res: resultPhrase(x.last.result), more: x.last.champ ? 'Banner season.' : x.last.pct >= 0.6 ? 'A season to build on.' : x.last.pct >= 0.45 ? 'Respectable, not satisfying.' : 'Let\'s never speak of it again.' }),
      };
    }
    // over- and under-achievers: finish vs. the roster they ended the season with
    const withRank = T.filter(x => x.last && x.lastStrRank != null);
    const sur = U.maxBy(withRank, x => x.lastStrRank - x.last.rank);
    const flop = U.maxBy(withRank.filter(x => x !== sur), x => x.last.rank - x.lastStrRank);
    const mkSwing = (x, good) => x ? {
      tid: x.tid, team: x.full, rec: `${x.last.w}-${x.last.l}`,
      text: good ? `Finished No. ${x.last.rank} with the league's ${U.ordinal(x.lastStrRank)}-best roster. Coaching? Chemistry? Witchcraft?`
        : `Finished No. ${x.last.rank} with the league's ${U.ordinal(x.lastStrRank)}-best roster. Somebody owes the fans an explanation.`,
    } : null;
    const surprise = sur && sur.lastStrRank - sur.last.rank >= 3 ? mkSwing(sur, true) : null;
    const bust = flop && flop.last.rank - flop.lastStrRank >= 3 ? mkSwing(flop, false) : null;
    const v = champ ? { NICK: up(champ.nick), nick: champ.nick } : {};
    return {
      kind: 'review', title: 'Last Season in Review', kicker: `${prevName} in review`, surprise, bust,
      headline: champ ? W.fill(W.pick(['{NICK} ON TOP OF THE WORLD', 'LONG LIVE THE {NICK}', 'CHAMPIONS: THE {NICK}', 'HOW THE {NICK} DID IT']), v) : 'THE YEAR THAT WAS',
      champion: champ ? { tid: champ.tid, team: champ.full, nick: champ.nick, rec: champ.last ? `${champ.last.w}-${champ.last.l}` : '', beat: ru ? ru.full : '', beatTid: ru ? ru.tid : null,
        fmvp: fm ? { pid: fm.id, name: pName(fm), line: fmLine ? `${f1(fmLine.ppg)} PPG · ${f1(fmLine.rpg)} RPG · ${f1(fmLine.apg)} APG in the playoffs` : '' } : null,
        text: W.fill(W.pick(['The {nick} beat the {ru} for the title{fm}.', 'Confetti fell in {city} after the {nick} took down the {ru}{fm}.']), { nick: champ.nick, ru: ru ? ru.nick : 'field', city: champ.city, fm: fm ? `, with ${pName(fm)} taking Finals MVP` : '' }) } : null,
      awards, leaders, records: records.slice(0, 4), best, worst, yours,
    };
  }

  /** 'Circle the dates' — the season calendar from the schedule */
  function keyDates(C) {
    const S = C.S, out = [];
    const lbl = d => PBC.League.dateLabel(S, d, true);
    if (!S.schedule || !S.schedule.length) return out;
    out.push({ label: 'Opening night', date: lbl(S.schedule[0].day), text: `${C.ab(S.schedule[0].a)} at ${C.ab(S.schedule[0].h)}` });
    if (C.user) {
      const g = S.schedule.find(x => x.h === C.user.tid);
      if (g) out.push({ label: 'Home opener', date: lbl(g.day), text: `${C.user.abbr} vs ${C.ab(g.a)}` });
    }
    if (S.tradeDeadlineDay > 0) out.push({ label: 'Trade deadline', date: lbl(S.tradeDeadlineDay), text: 'Buyers and sellers' });
    if (S.allStarDay >= 0) out.push({ label: 'All-Star break', date: lbl(S.allStarDay), text: 'Midseason exhale' });
    const last = S.schedule[S.schedule.length - 1];
    out.push({ label: 'Regular-season finale', date: lbl(last.day), text: C.conf && C.L.playIn ? 'Then the play-in' : 'Then the playoffs' });
    return out.slice(0, 5);
  }

  function pageWatch(C) {
    const { W, T, user } = C;
    const b = C.active[0];
    const items = [];
    items.push({ headline: W.fill(W.pick(['The {last} show', 'Can anyone stop {last}?']), pv(C, b)), body: W.fill('{name} ({ovr} OVR) is the highest-rated player in the league. The {nick} will go as far as {he} takes them, and so will your fantasy team.', pv(C, b)), pid: b.id, tid: b.tid });
    const [a1, a2, a3] = C.ranked;
    items.push({ headline: 'The title race', body: W.fill('We like the {a}, but the {b} and {c} are within striking distance. The gap between first and fifth is a sprained ankle.', { a: a1.nick, b: a2.nick, c: a3.nick }), tid: a1.tid });
    if (C.rookies.length) { const r = C.rookies[0]; items.push({ headline: 'The rookie ladder', body: W.fill('{name} ({nick}) leads a class of {k} rookies on opening-night rosters. Minutes will decide the race.', pv(C, r, { k: C.rookies.length })), pid: r.id, tid: r.tid }); }
    const hotC = U.maxBy(T.filter(x => !x.coach.isUser), x => x.coach.heat);
    if (hotC) items.push({ headline: 'Coaches on notice', body: W.fill('The hot-seat list starts with {coach} of the {nick}. Projected {rec}; the owner expected more.', { coach: hotC.coach.name, nick: hotC.nick, rec: hotC.rec }), tid: hotC.tid });
    if (user) { const e = expectationFor(C, user); items.push({ headline: `Your ${user.nick}`, body: W.fill('{coach} and the owner agree on one thing: {exp}. We project {rec}, {seed}.', { coach: user.coach.name, exp: lowerFirst(e.label), rec: user.rec, seed: user.seedText }), tid: user.tid }); }
    const sleeper = C.ranked.slice(Math.floor(C.n / 3), Math.floor(C.n * 0.6)).find(x => x.young);
    if (items.length < 5 && sleeper) items.push({ headline: 'The sleeper', body: W.fill('Keep an eye on the {nick}. {young} ({age}) could turn {aRec} projection into a playoff run.', { nick: sleeper.nick, young: pName(sleeper.young), age: sleeper.young.age, aRec: withAn(sleeper.rec) }), tid: sleeper.tid });
    return { kind: 'watch', title: 'Five Things to Watch', kicker: 'Year one', headline: W.pick(['FIVE THINGS TO WATCH', 'WHAT TO WATCH FOR', 'CIRCLE THESE']), dek: 'No history yet, so here is what we will be watching from the opening tip.', items: items.slice(0, 5).map((it, i) => Object.assign({ n: i + 1 }, it)), dates: keyDates(C) };
  }

  // ---- 15. Bold predictions, Finals pick, back-cover ad ----
  const ADS = [
    { kind: 'shoe', brand: 'LOFTWORKS', product: 'HANGTIME 9', tagline: 'Gravity is optional.', copy: 'Engineered with 40% more bounce than you need and 100% more swagger than you deserve.', fine: 'Loftworks is not responsible for dunks attempted on regulation rims. Hangtime not guaranteed. Neither is dignity.' },
    { kind: 'drink', brand: 'SWISHADE', product: 'Electro-Lyte Surge', tagline: 'Tastes like a fourth-quarter comeback.', copy: 'Now in Blue Raspberry Buzzer-Beater and Lemon-Lime Overtime.', fine: 'Contains 0% actual comeback. Do not pour on coach. Seriously, he hates that.' },
    { kind: 'gum', brand: 'CLUTCH', product: 'Ice Mint Gum', tagline: 'Chew it in the fourth.', copy: 'Trusted by closers, free-throw shooters and people who say "that\'s game" way too early.', fine: 'May cause spontaneous shimmy. Not a substitute for actually making free throws.' },
    { kind: 'recovery', brand: 'COLDTUB', product: 'Recovery Pod', tagline: 'Your knees called. They\'re begging.', copy: 'Twelve minutes at 39°F and you will forget your own name, and your hamstring.', fine: 'Side effects include shivering, regret and an irrational fear of ice cubes.' },
    { kind: 'band', brand: 'BANDWIDTH', product: 'Pro Headband', tagline: 'Keep the sweat out. Keep the swagger in.', copy: 'Adds +2 to confidence. Scientists are baffled. Coaches are thrilled.', fine: '+2 confidence not reflected in actual player ratings. Batteries not included. There are no batteries.' },
  ];

  function pageBack(C) {
    const { W, T, rng, user, S } = C;
    const pool = [];
    const allStarBefore = p => (p.awards || []).some(a => a.type === 'allStar');
    const yb = C.active.slice(0, 45).filter(p => p.age <= 23 && !allStarBefore(p));
    if (yb.length) { const p = rng.pick(yb.slice(0, 4)); pool.push({ text: W.fill('{name} ({age}) makes {his} first All-Star team.', pv(C, p)), conf: rng.int(30, 48) }); }
    const riser = U.maxBy(C.ranked.filter(x => x.line !== 'po' && x.rank > C.n * 0.4 && x.rank <= C.n * 0.7), x => x.strH - x.strF + (x.young ? 1 : 0) + rng() * 2);
    if (riser) pool.push({ text: W.fill('The {nick} make the playoffs. Yes, those {nick}.', { nick: riser.nick }), conf: rng.int(15, 28), tid: riser.tid });
    // a projected No. 1 seed (not the user's team) stumbles
    const favs = C.conf ? C.ranked.filter(x => x.seed === 1 && x !== user) : [C.ranked[0] === user ? C.ranked[1] : C.ranked[0]];
    const fav = favs[0];
    if (fav) {
      pool.push({ text: C.conf ? W.fill('The {nick} do NOT finish as the {conf}\'s top seed.', { nick: fav.nick, conf: C.L.confs[fav.t.conf] })
        : fav.rank === 1 ? W.fill('The {nick} do NOT finish with the league\'s best record.', { nick: fav.nick }) : W.fill('The {nick} do NOT finish in the top two.', { nick: fav.nick }),
      conf: rng.int(35, 50), tid: fav.tid });
    }
    const scorer = U.maxBy(C.active.slice(0, 40).map(p => ({ p, l: perGame(p, C.prev) })).filter(o => o.l && o.l.gp >= 10), o => o.l.ppg);
    if (scorer) pool.push({ text: W.fill('{name} averages {x} points per game.', pv(C, scorer.p, { x: Math.round(scorer.l.ppg + 3) })), conf: rng.int(12, 25), pid: scorer.p.id });
    else pool.push({ text: `Somebody scores ${C.women ? 45 : 60} in a game this season.`, conf: rng.int(15, 30) });
    const hotAI = U.maxBy(T.filter(x => !x.coach.isUser), x => x.coach.heat);
    if (hotAI) pool.push({ text: W.fill('{coach} doesn\'t make it to the All-Star break in {city}.', { coach: hotAI.coach.name, city: hotAI.city }), conf: rng.int(20, 40), tid: hotAI.tid });
    if (C.rookies.length) { const r = C.rookies[0]; pool.push({ text: W.fill('{name} wins Rookie of the Year unanimously.', pv(C, r)), conf: rng.int(15, 35), pid: r.id }); }
    const vets = C.active.slice(0, 60).filter(p => p.age >= 33);
    if (vets.length) { const p = vets[0]; pool.push({ text: W.fill('{name} ({age}) plays all {g} games and makes an All-League team.', pv(C, p, { g: C.G })), conf: rng.int(8, 20), pid: p.id }); }
    const streakT = C.ranked[rng.int(0, 2)];
    pool.push({ text: W.fill('The {nick} rip off {aK}-game winning streak.', { nick: streakT.nick, aK: withAn(C.women ? rng.int(8, 11) : rng.int(12, 16)) }), conf: rng.int(20, 35), tid: streakT.tid });
    const seller = C.ranked.slice(-Math.ceil(C.n / 3)).find(x => x.star && x.star.ovr >= C.q(0.1) && x.star.age >= 25);
    if (seller) pool.push({ text: W.fill('The {nick} trade {star} before the deadline.', { nick: seller.nick, star: pName(seller.star) }), conf: rng.int(15, 30), tid: seller.tid });
    const picks = rng.shuffle(pool).slice(0, user ? 4 : 5);
    if (user) {
      const bold = user.line === 'po' && user.rank <= 3
        ? { text: W.fill('The {nick} win the whole thing. You heard it here first.', { nick: user.nick }), conf: rng.int(20, 35) }
        : { text: W.fill('The {nick} win {x} games and blow past our projection.', { nick: user.nick, x: Math.min(C.G - 2, user.w + rng.int(5, 9)) }), conf: rng.int(10, 25) };
      bold.tid = user.tid;
      picks.splice(rng.int(0, picks.length), 0, bold);
    }
    const f = C.finals;
    const winStar = f.win.star;
    const finals = {
      win: f.win.tid, lose: f.lose.tid, winTeam: f.win.full, loseTeam: f.lose.full, winNick: f.win.nick, loseNick: f.lose.nick, games: f.games,
      winRec: f.win.rec, loseRec: f.lose.rec,
      text: W.fill(W.pick([
        'The {win} beat the {lose} in {g}, and {star} takes home Finals MVP.',
        '{star} and the {win} outlast the {lose} in {g} games. It won\'t be pretty. It will be worth it.',
        'The {win} in {g}. {star} hits the shot everyone will be talking about for a decade.',
      ]), { win: f.win.nick, lose: f.lose.nick, g: f.games, star: pName(winStar) }),
      fmvp: winStar ? pRef(C, winStar) : null,
    };
    const ad = Object.assign({}, rng.pick(ADS));
    return {
      kind: 'back', title: 'Bold Predictions', headline: W.pick(['BOLD PREDICTIONS', 'CALLING OUR SHOTS', 'HOT TAKES, SERVED FRESH', 'SCREENSHOT THIS']),
      dek: 'Take these to the bank. Or don\'t. Definitely don\'t.',
      bold: picks.slice(0, 5).map((b, i) => Object.assign({ n: i + 1 }, b, { conf: b.conf + '%' })), finals, ad,
    };
  }

  // ---------------------------------------------------------------------------
  // Build
  // ---------------------------------------------------------------------------
  const DEKS = {
    storylines: 'Five stories that will define the season', power: 'Every team, ranked and roasted', positions: 'The best at every spot on the floor',
    conf: 'Predicted order of finish', team: 'Your team, under the microscope', top10: 'The best players in the league', awards: 'MVP, DPOY and more, with odds',
    rookies: 'The newcomers to know', grades: 'Who won the summer?', coaches: 'Rankings, hot seats and media-day wisdom', review: 'Champions, awards and records',
    watch: 'What we will be watching from the tip', back: 'Our Finals pick and the takes we will regret',
  };

  M.build = function (S) {
    if (!S || !S.teams || !S.teams.length) throw new Error('Magazine.build needs a league state');
    const C = context(S);
    for (const x of C.T) if (!x.coach.isUser) { x.coach.heat = aiHeat(C, x); x.coach.label = heatLabel(x.coach.heat); }
    const cover = pageCover(C);
    const body = [pageStorylines(C)];
    if (C.women) body.push(pagePower(C, 0, C.n), pagePositions(C));
    else body.push(pagePower(C, 0, Math.ceil(C.n / 2)), pagePower(C, Math.ceil(C.n / 2), C.n));
    const confs = C.L.confs && C.L.confs.length >= 2 ? [0, 1] : [0, 0];
    body.push(pageConf(C, confs[0]), pageConf(C, confs[1]));
    body.push(pageTeam(C), pageTop10(C), pageAwards(C), pageRookies(C), pageGrades(C), pageCoaches(C), pageReview(C), pageBack(C));
    const toc = body.map((p, i) => ({ page: i + 3, title: p.title, dek: DEKS[p.kind] || '' }));
    const pages = [cover, pageEditor(C, toc)].concat(body);
    pages.forEach((p, i) => { p.num = i + 1; });
    return {
      v: M.VERSION, season: S.season, leagueKey: S.leagueKey, userTid: S.userTid, mast: M.MAST,
      title: `${M.MAST}: ${C.women ? C.league + ' ' : ''}Season Preview ${C.sname}`, seasonName: C.sname, league: C.league, built: Date.now(),
      pages,
    };
  };

  /** True when S.magazine is missing or stale (new season, different user team, old format). */
  M.isStale = function (S) {
    const m = S && S.magazine;
    return !m || m.v !== M.VERSION || m.season !== S.season || m.leagueKey !== S.leagueKey || m.userTid !== S.userTid || !m.pages || m.pages.length !== 15;
  };

  /** True when the preview for this season hasn't been opened yet (use it to auto-open once per season). */
  M.shouldAutoOpen = S => !!(S && S.teams && S.phase === 'preseason' && !(S.magazine && !M.isStale(S) && S.magazine.seen));

  /** Returns S.magazine, building (and storing) it when stale. */
  M.ensure = function (S) {
    if (M.isStale(S)) S.magazine = M.build(S);
    return S.magazine;
  };
})();
