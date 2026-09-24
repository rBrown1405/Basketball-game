/* Pro BBALL Coach — the draft: prospect classes, scouting, lottery & draft order, the draft itself, rookie deals.
   No DOM. State: S.draftState (the draft being held), S.scouting (the user's scouting budget), p.scout (knowledge). */
(function () {
  'use strict';
  const PBC = (window.PBC = window.PBC || {});
  const U = PBC.U;
  const Draft = {};
  const cfg = S => PBC.League.cfg(S);
  const news = (S, text, type, tid) => { if (PBC.Season) PBC.Season.news(S, text, type, tid); };

  /** The team the user runs right now (-1 while the coach is unemployed → every team is AI-controlled). */
  Draft.userTid = function (S) {
    if (S.coach && S.coach.status === 'unemployed') return -1;
    return S.userTid == null ? -1 : S.userTid;
  };

  // ---------------------------------------------------------------------------
  // Prospect classes
  // ---------------------------------------------------------------------------
  // A class is generated from its players' true peak (potential) by class slot, calibrated against the league's
  // star counts so the OVR distribution stays stable across decades (see test/offseason.js). Current OVR is the
  // peak minus the development still ahead at that age. Prospects are generated one year younger than their
  // draft age because everyone (prospects included) ages by one year in Offseason.begin.
  const CLASS = {
    men: { n: 72, peak: [[0, 91], [1, 89], [2, 87], [3, 86], [4, 85], [9, 79], [19, 72], [29, 67.5], [44, 63.5], [59, 60], [71, 56]] },
    // women: the men's curve mapped by roster capacity per class slot (women's slot j ≈ men's slot j × 450/144)
    women: { n: 44, peak: [[0, 90.5], [1, 86], [3, 79], [6, 72], [9, 67.5], [14, 63.5], [19, 60], [23, 56], [35, 52], [43, 48]] },
    gap: { 19: 14, 20: 12, 21: 9.5, 22: 7, 23: 5 },
    peakSd: 2.5, gapSd: 2.2, strengthSd: 1.1,
  };
  Draft.CLASS = CLASS;
  function peakAt(spec, i) {
    const pts = spec.peak;
    for (let k = 1; k < pts.length; k++) {
      if (i <= pts[k][0]) { const [i0, v0] = pts[k - 1], [i1, v1] = pts[k]; return v0 + (v1 - v0) * (i - i0) / Math.max(1, i1 - i0); }
    }
    return pts[pts.length - 1][1];
  }
  /** Shift all skill ratings so the player's OVR lands on target (keeps his rating profile). */
  function shiftTo(p, target) {
    for (let k = 0; k < 5; k++) {
      const diff = target - p.ovr;
      if (Math.abs(diff) < 0.6) break;
      const step = diff / (p.ovr >= 64 ? 1.15 : 0.7);
      for (const key of PBC.Config.RATING_KEYS) if (key !== 'durability') p.r[key] = Math.round(U.clamp(p.r[key] + step, 25, 99));
      p.ovr = PBC.Player.calcOvr(p.r, p.pos);
    }
  }

  /** Make sure the class for the upcoming draft (S.season + 1) exists. Called by League.newSeasonSetup. */
  Draft.ensureClass = function (S) {
    if (PBC.Offseason && PBC.Offseason.initDevelopment) PBC.Offseason.initDevelopment(S);
    const year = S.season + 1;
    const existing = PBC.League.prospects(S).filter(p => p.draft && p.draft.year === year);
    if (existing.length) return existing;
    return Draft.generateClass(S, year);
  };

  Draft.generateClass = function (S, year) {
    const L = cfg(S);
    const spec = CLASS[L.key] || CLASS.men;
    const strength = U.gauss(0, CLASS.strengthSd);            // strong / weak draft years
    const out = [];
    for (let i = 0; i < spec.n; i++) {
      const draftAge = U.pickW([19, 20, 21, 22, 23], [30, 26, 20, 16, 8]);
      const peak = Math.round(U.clamp(U.gauss(peakAt(spec, i) + strength, CLASS.peakSd), 50, 99));
      const gap = Math.max(1, U.gauss(CLASS.gap[draftAge], CLASS.gapSd));
      const target = Math.round(U.clamp(peak - gap, 42, peak));
      const p = PBC.Player.create(S, { league: L, age: draftAge - 1, talent: target - 1, tid: -2, prospect: true });
      shiftTo(p, target);
      p.born = year - draftAge;
      p.yearsPro = 0;
      p.pot = Math.max(p.ovr, peak);
      p.dv = p.pot;                       // hidden true peak (see Offseason.develop)
      p.draft = { year, round: 0, pick: 0, tid: -1, rank: 0 };
      p.scout = { pts: 0, known: i < 5 ? 22 : i < 15 ? 14 : 6 };
      p.contract = null;
      S.players[p.id] = p;
      out.push(p);
    }
    // a generational talent every few years
    if (U.chance(0.18) && out.length) {
      const p = U.maxBy(out, x => x.pot);
      p.pot = p.dv = Math.max(p.pot, U.int(96, 99));
    }
    Draft.rankClass(S, out);
    return out;
  };

  /** Media big board: consensus ranking (noisy — scouting beats it). */
  Draft.rankClass = function (S, list) {
    const scored = list.map(p => ({ p, s: 0.42 * p.ovr + 0.58 * p.pot - Math.max(0, p.age - 20) * 0.5 + U.gauss(0, 2.2) }));
    U.sortBy(scored, x => x.s, true).forEach((x, i) => { x.p.draft.rank = i + 1; });
  };

  Draft.classOf = function (S, year) {
    year = year || S.season + 1;
    return U.sortBy(PBC.League.prospects(S).filter(p => p.draft && p.draft.year === year), p => p.draft.rank || 999);
  };

  // ---------------------------------------------------------------------------
  // Scouting (the user's knowledge of prospects)
  // ---------------------------------------------------------------------------
  Draft.WEEKLY_POINTS = 8;       // scouting points per week during the season
  Draft.BANK_MAX = 24;           // unspent points carry over, up to this many
  Draft.PREDRAFT_POINTS = 20;    // extra points granted when the offseason begins (pre-draft workouts)

  Draft.SCOUT_ACTIONS = [
    { key: 'film', label: 'Scout Film', icon: '🎞️', cost: 1, gain: 6, decay: 0.72, desc: 'Break down game tape. Cheap, but each extra session tells you less.' },
    { key: 'game', label: 'Attend a Game', icon: '🏟️', cost: 3, gain: 16, decay: 0.8, desc: 'See him live. A big jump in what you know, and reveals his standout strengths.' },
    { key: 'workout', label: 'Private Workout', icon: '🏋️', cost: 5, gain: 26, once: true, desc: 'Put him through your drills. The sharpest read on his true potential.' },
    { key: 'interview', label: 'Interview', icon: '🎤', cost: 2, gain: 4, once: true, desc: 'Sit down with him. Reveals work ethic, ego, loyalty and what drives him.' },
    { key: 'medical', label: 'Medical Check', icon: '🩺', cost: 2, gain: 3, once: true, desc: 'Full physical. Reveals durability and any red flags.' },
  ];
  const SCOUT_BY_KEY = {};
  Draft.SCOUT_ACTIONS.forEach(a => { SCOUT_BY_KEY[a.key] = a; });

  /** Hook: scouting points granted per week (the budget accrues lazily from S.day — nobody has to call this). */
  Draft.weeklyScoutingPoints = function (S) {
    const rep = S.coach ? S.coach.rep || 0 : 0;
    return Draft.WEEKLY_POINTS + (rep >= 75 ? 2 : 0);
  };

  const SCOUT_PHASES = { preseason: 1, regular: 1, playin: 1, playoffs: 1, postseason_done: 1, awards: 1, draft_lottery: 1, draft: 1 };
  Draft.canScout = S => !!SCOUT_PHASES[S.phase] && Draft.userTid(S) >= 0;

  /** The user's scouting budget (accrues weekly during the season; call any time). */
  Draft.scouting = function (S) {
    let sc = S.scouting;
    if (!sc || sc.season !== S.season) {
      sc = S.scouting = { season: S.season, pts: Draft.weeklyScoutingPoints(S), week: 0, predraft: false, spent: 0 };
    }
    if (S.phase === 'regular' || S.phase === 'playin' || S.phase === 'playoffs' || S.phase === 'postseason_done') {
      const wk = Math.floor((S.day || 0) / 7);
      if (wk > sc.week) {
        sc.pts = Math.min(Draft.BANK_MAX, sc.pts + (wk - sc.week) * Draft.weeklyScoutingPoints(S));
        sc.week = wk;
      }
    }
    return sc;
  };
  Draft.points = S => Draft.scouting(S).pts;

  /** Called by Offseason.begin: pre-draft workout budget. */
  Draft.grantPredraftPoints = function (S) {
    const sc = Draft.scouting(S);
    if (sc.predraft) return;
    sc.predraft = true;
    sc.pts = Math.min(Draft.BANK_MAX + Draft.PREDRAFT_POINTS, sc.pts + Draft.PREDRAFT_POINTS);
  };

  Draft.known = function (S, p) {
    if (!p) return 0;
    if (p.tid >= 0 && p.tid === S.userTid) return 100;
    return p.scout ? U.clamp(p.scout.known || 0, 0, 100) : (p.tid === -2 ? 0 : 60);
  };

  /** Run a scouting action on a prospect. Returns { ok, msg, gain, known }. */
  Draft.scout = function (S, pid, key) {
    const p = S.players[pid];
    const a = SCOUT_BY_KEY[key];
    if (!a) return { ok: false, msg: 'Unknown scouting action.' };
    if (!p || p.tid !== -2) return { ok: false, msg: 'Only draft prospects can be scouted.' };
    if (!Draft.canScout(S)) return { ok: false, msg: 'Your scouts are off until the new draft class is set.' };
    const sc = Draft.scouting(S);
    if (sc.pts < a.cost) return { ok: false, msg: `Not enough scouting points (${a.cost} needed).` };
    const s = p.scout || (p.scout = { pts: 0, known: 0 });
    if (a.once && s[key]) return { ok: false, msg: `${a.label} already done for ${PBC.Player.name(p)}.` };
    const before = s.known || 0;
    if (before >= 100 && !a.once) return { ok: false, msg: 'You already know everything about him.' };
    const n = typeof s[key] === 'number' ? s[key] : 0;
    let gain = a.gain * (a.decay ? Math.pow(a.decay, n) : 1);
    gain = Math.max(1, Math.round(gain * U.range(0.85, 1.15)));
    sc.pts -= a.cost;
    sc.spent = (sc.spent || 0) + a.cost;
    s.pts = (s.pts || 0) + a.cost;
    s[key] = a.once ? true : n + 1;
    s.known = Math.min(100, before + gain);
    let msg = `${a.label}: ${PBC.Player.name(p)} — scouting ${before}% → ${s.known}%.`;
    if (key === 'interview') {
      const pe = p.pers || {};
      msg += ` Work ethic ${word(pe.work)}, ego ${word(pe.ego)}, loyalty ${word(pe.loyal)}.`;
    } else if (key === 'medical') {
      msg += p.r.durability < 55 ? ' 🚩 Red flag: injury-prone.' : p.r.durability >= 80 ? ' Clean bill of health — very durable.' : ' No major concerns.';
    } else if (key === 'game') {
      const st = PBC.Player.strengths(p, 3);
      if (st.length) msg += ' Stood out: ' + st.join(', ') + '.';
    }
    return { ok: true, msg, gain: s.known - before, known: s.known };
  };

  function word(v) { return v >= 80 ? 'elite' : v >= 65 ? 'high' : v >= 45 ? 'average' : v >= 30 ? 'low' : 'very low'; }
  Draft.traitWord = word;

  /** What the user sees of a prospect. The POT range matches UI.potLabel exactly (same noise formula). */
  Draft.view = function (S, p) {
    const k = Draft.known(S, p);
    const s = p.scout || {};
    const range = (val, salt, width) => {
      const err = Math.round(width * (1 - k / 100));
      if (err <= 1) return { lo: val, hi: val, est: val, err: 0 };
      const noise = ((U.hash(p.id + salt) % 100) / 100 - 0.5) * err;
      const mid = Math.round(val + noise);
      const lo = Math.max(40, mid - err), hi = Math.min(99, mid + err);
      return { lo, hi, est: U.clamp(mid, lo, hi), err };
    };
    const pot = range(p.pot, 'pot', 12);
    const ovr = range(p.ovr, 'ovr', 8);
    return {
      known: k, ovr, pot,
      ovrLabel: ovr.err ? `${ovr.lo}–${ovr.hi}` : '' + p.ovr,
      potLabel: pot.err ? `${pot.lo}–${pot.hi}` : '' + p.pot,
      grade: Draft.grade(pot.est),
      strengths: (s.game || k >= 45) ? PBC.Player.strengths(p, 3) : null,
      weaknesses: (s.game || k >= 60) ? PBC.Player.weaknesses(p, 2) : null,
      pers: s.interview ? p.pers : null,
      durability: s.medical ? p.r.durability : null,
      workout: !!s.workout,
    };
  };

  Draft.grade = function (pot) {
    return pot >= 93 ? 'A+' : pot >= 89 ? 'A' : pot >= 85 ? 'A-' : pot >= 82 ? 'B+' : pot >= 79 ? 'B' : pot >= 76 ? 'B-' : pot >= 73 ? 'C+' : pot >= 70 ? 'C' : 'D';
  };

  // ---------------------------------------------------------------------------
  // Lottery & draft order
  // ---------------------------------------------------------------------------
  const MEN_ODDS = [140, 140, 140, 125, 105, 90, 75, 60, 45, 30, 20, 15, 10, 5];   // per 1000, NBA 2019+
  const WOMEN_ODDS = [442, 276, 178, 104];                                           // per 1000

  function playoffTeams(S) {
    const set = new Set();
    const P = S.playoffs;
    if (P && P.series) for (const s of P.series) if (s.round === 1) { set.add(s.hi); set.add(s.lo); }
    if (!set.size) PBC.League.sorted(S, null).slice(0, cfg(S).playoffTeams).forEach(r => set.add(r.tid));
    return set;
  }

  /** Chance of each lottery seed landing in the top `draws` picks (Monte Carlo on a private RNG). */
  function lotteryTopOdds(w, draws) {
    let s = 0x2545f491;
    const r = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const hits = w.map(() => 0);
    const N = 20000;
    for (let k = 0; k < N; k++) {
      const left = w.map((x, i) => i);
      for (let d = 0; d < draws && left.length; d++) {
        let tot = 0;
        for (const i of left) tot += w[i];
        let x = r() * tot, j = 0;
        while (j < left.length - 1 && (x -= w[left[j]]) > 0) j++;
        hits[left[j]]++;
        left.splice(j, 1);
      }
    }
    return hits.map(h => h / N);
  }

  Draft.pickOwner = function (S, year, round, orig) {
    const pk = S.draftPicks.find(d => d.season === year && d.round === round && d.orig === orig);
    return pk ? pk.owner : orig;
  };

  /** Build the lottery + full draft order for the S.season + 1 draft (called by Offseason.begin). */
  Draft.setup = function (S) {
    const L = cfg(S);
    const year = S.season + 1;
    const rows = PBC.League.standings(S);
    const tb = {};
    for (const t of S.teams) tb[t.id] = U.rand();
    const worstFirst = U.sortBy(S.teams.map(t => t.id), tid => rows[tid].pct + tb[tid] * 1e-6);
    const po = playoffTeams(S);
    const nonPO = worstFirst.filter(tid => !po.has(tid));
    const lot = nonPO.slice(0, L.lotteryTeams);
    const table = L.key === 'women' ? WOMEN_ODDS : MEN_ODDS;
    const odds = {};
    lot.forEach((tid, i) => { odds[tid] = table[Math.min(i, table.length - 1)]; });
    const oddsTotal = U.sum(lot, tid => odds[tid]) || 1;
    const draws = Math.min(L.key === 'women' ? 1 : 4, lot.length);
    const winners = [];
    let pool = lot.slice();
    for (let d = 0; d < draws; d++) {
      const w = U.pickW(pool, pool.map(tid => odds[tid]));
      winners.push(w);
      pool = pool.filter(x => x !== w);
    }
    const firstRound = winners.concat(lot.filter(t => !winners.includes(t)), nonPO.slice(L.lotteryTeams), worstFirst.filter(t => po.has(t)));
    const order = [];
    let overall = 0;
    for (let rd = 1; rd <= L.draftRounds; rd++) {
      const seq = rd === 1 ? firstRound : worstFirst;
      seq.forEach((orig, i) => order.push({ round: rd, pick: i + 1, overall: ++overall, orig, owner: Draft.pickOwner(S, year, rd, orig), pid: null }));
    }
    const topN = lotteryTopOdds(lot.map(tid => odds[tid]), draws);
    const lottery = {
      draws,
      teams: lot.map((tid, i) => ({
        tid, seed: i + 1, odds: U.round(odds[tid] / oddsTotal * 100, 1), top: U.round(topN[i] * 100, 1), pick: firstRound.indexOf(tid) + 1,
        owner: Draft.pickOwner(S, year, 1, tid), rec: `${rows[tid].w}-${rows[tid].l}`, moved: i + 1 - (firstRound.indexOf(tid) + 1),
      })),
      winners,
    };
    S.draftState = { year, order, cur: 0, done: false, lottery, revealed: false, log: [] };
    return S.draftState;
  };

  Draft.state = S => (S.draftState && S.draftState.year === S.season + 1 ? S.draftState : null);
  Draft.current = function (S) { const d = Draft.state(S); return d && !d.done ? d.order[d.cur] || null : null; };
  Draft.isUserTurn = function (S) { const c = Draft.current(S); return !!c && S.phase === 'draft' && c.owner === Draft.userTid(S); };
  Draft.available = S => Draft.classOf(S, S.draftState ? S.draftState.year : S.season + 1);
  Draft.userPicks = function (S) {
    const d = Draft.state(S);
    const u = Draft.userTid(S);
    return d ? d.order.filter(o => o.owner === u) : [];
  };
  Draft.userPicksLeft = S => Draft.userPicks(S).filter(o => o.pid == null).length;

  /** News for the lottery results (called when the draft opens so the reveal isn't spoiled). */
  Draft.lotteryNews = function (S) {
    const d = Draft.state(S);
    if (!d || d.lotteryNewsDone) return;
    d.lotteryNewsDone = true;
    const top = d.order.filter(o => o.round === 1).slice(0, Math.max(1, d.lottery.draws));
    const t = S.teams[top[0].owner];
    const jumped = d.lottery.teams.filter(x => x.moved > 0 && x.pick <= d.lottery.draws).map(x => S.teams[x.owner].abbr);
    news(S, `🎰 Draft Lottery: the ${t.city} ${t.name} win the #1 pick in the ${d.year} draft!${jumped.length ? ' Movers: ' + jumped.join(', ') + '.' : ''}`, 'draft', t.id);
  };

  // ---------------------------------------------------------------------------
  // Making picks
  // ---------------------------------------------------------------------------
  function rookieYears(slot, L) {
    if (slot.round === 1) return slot.pick <= Math.ceil(L.teamsList.length / 2) ? 4 : 3;
    return slot.round === 2 ? 2 : 1;
  }

  /** Select a prospect with the pick on the clock. */
  Draft.select = function (S, pid) {
    const d = Draft.state(S);
    if (!d || d.done || S.phase !== 'draft') return { ok: false, msg: 'The draft is not open.' };
    const slot = d.order[d.cur];
    const p = S.players[pid];
    if (!p || p.tid !== -2 || !p.draft || p.draft.year !== d.year) return { ok: false, msg: 'That player is not available.' };
    const L = cfg(S);
    const tid = slot.owner;
    const years = rookieYears(slot, L);
    const u = Draft.userTid(S);
    p.tid = tid;
    p.contract = { amt: PBC.Player.rookieSalary(slot.pick, slot.round, L), exp: S.season + years, rookie: true };
    p.draft = { year: d.year, round: slot.round, pick: slot.pick, overall: slot.overall, tid, rank: p.draft.rank || 0, byUser: tid === u && u >= 0 };
    p.rookieSeason = S.season + 1;
    p.yearsPro = 0;
    p.morale = 76;
    p.num = 0;
    PBC.Player.assignNumber(S, p);
    slot.pid = pid;
    d.log.push({ overall: slot.overall, pid, tid });
    d.cur++;
    if (tid === u || slot.overall <= 3) {
      const t = S.teams[tid];
      news(S, `🧢 With the ${U.ordinal(slot.overall)} pick, the ${t.city} ${t.name} select ${PBC.Player.name(p)} (${p.pos}, ${p.origin}).`, 'draft', tid);
    }
    if (d.cur >= d.order.length || !Draft.available(S).length) Draft.complete(S);
    return { ok: true, slot, p };
  };

  /** How an AI team ranks the remaining prospects (true ratings + a little need & noise). */
  Draft.aiChoice = function (S, tid) {
    const avail = Draft.available(S);
    if (!avail.length) return null;
    const top = PBC.League.roster(S, tid).slice(0, 10);
    const counts = {};
    for (const p of top) counts[p.pos] = (counts[p.pos] || 0) + 1;
    const d = S.draftState;
    if (d && d.avgStr == null) d.avgStr = U.avg(S.teams, t => PBC.League.teamStrength(S, t.id));
    const avgStr = d ? d.avgStr : 75;
    const rebuild = PBC.League.teamStrength(S, tid) < avgStr - 1;
    const wPot = rebuild ? 0.62 : 0.54;
    return U.maxBy(avail.slice(0, 30), p => (1 - wPot) * p.ovr + wPot * p.pot - Math.max(0, p.age - 20) * 0.6
      + (counts[p.pos] ? 0 : 1.2) - ((counts[p.pos] || 0) >= 3 ? 0.8 : 0) + U.gauss(0, 1.6));
  };

  /** The user's auto-pick: best available by what the user's scouts know. */
  Draft.userChoice = function (S) {
    const avail = Draft.available(S);
    return U.maxBy(avail.slice(0, 40), p => {
      const v = Draft.view(S, p);
      return 0.44 * v.ovr.est + 0.56 * v.pot.est - Math.max(0, p.age - 20) * 0.5 - (p.draft.rank || 50) * 0.04;
    });
  };

  Draft.aiPick = function (S) {
    const c = Draft.current(S);
    if (!c) return null;
    const p = Draft.aiChoice(S, c.owner);
    if (!p) { Draft.complete(S); return null; }
    return Draft.select(S, p.id);
  };

  Draft.autoPick = function (S) {
    const c = Draft.current(S);
    if (!c) return null;
    const p = c.owner === Draft.userTid(S) ? Draft.userChoice(S) : Draft.aiChoice(S, c.owner);
    if (!p) { Draft.complete(S); return null; }
    return Draft.select(S, p.id);
  };

  /** AI picks until it is the user's turn (or the draft ends). Returns the picks made. */
  Draft.simToUser = function (S) {
    const made = [];
    let guard = 0;
    while (guard++ < 400) {
      const c = Draft.current(S);
      if (!c || c.owner === Draft.userTid(S)) break;
      const r = Draft.aiPick(S);
      if (!r || !r.ok) break;
      made.push(r);
    }
    return made;
  };

  /** One pick (AI or auto for the user) — for animated "ticking" draft boards. */
  Draft.step = function (S) {
    const c = Draft.current(S);
    if (!c) return null;
    return c.owner === Draft.userTid(S) ? null : Draft.aiPick(S);
  };

  /** Finish the draft; the user's remaining picks are auto-drafted. */
  Draft.simAll = function (S) {
    let guard = 0;
    while (Draft.current(S) && guard++ < 400) { if (!Draft.autoPick(S)) break; }
    if (S.draftState && !S.draftState.done) Draft.complete(S);
  };

  /** End of the draft: undrafted prospects become free agents, used picks are consumed, a new future year is added. */
  Draft.complete = function (S) {
    const d = S.draftState;
    if (!d || d.done) return;
    d.done = true;
    const L = cfg(S);
    for (const p of Draft.classOf(S, d.year)) {
      p.tid = -1;
      p.contract = { amt: L.minSalary, exp: S.season, rookie: false };
      p.draft = { year: d.year, round: 0, pick: 0, tid: -1, rank: p.draft.rank || 0 };
      p.undrafted = true;
      p.yearsPro = 0;
      p.rookieSeason = S.season + 1;       // still a rookie if someone signs him
    }
    S.draftPicks = S.draftPicks.filter(pk => pk.season !== d.year);
    const newYear = d.year + 4;
    if (!S.draftPicks.some(pk => pk.season === newYear)) {
      for (let rd = 1; rd <= Math.min(2, L.draftRounds); rd++) for (const t of S.teams) S.draftPicks.push({ season: newYear, round: rd, orig: t.id, owner: t.id });
    }
    const u = Draft.userTid(S);
    const mine = d.order.filter(o => o.owner === u && o.pid != null).map(o => S.players[o.pid]);
    news(S, `📋 The ${d.year} draft is complete.${mine.length ? ' Your picks: ' + mine.map(p => `${PBC.Player.name(p)} (#${p.draft.overall})`).join(', ') + '.' : ''}`, 'draft', u);
  };

  // ---------------------------------------------------------------------------
  // Pick projections (for trades & the UI)
  // ---------------------------------------------------------------------------
  const OFF_PHASES = { draft_lottery: 1, draft: 1, resign: 1, freeagency: 1 };

  /** Where a team is expected to pick (1 = first) based on record and roster strength. Cached per call burst. */
  Draft.teamPickRank = function (S) {
    const key = S.season + ':' + S.phase + ':' + S.day + ':' + (S._rosterVer || 0);
    if (Draft._rankCache && Draft._rankCache.key === key && Draft._rankCache.S === S) return Draft._rankCache.rank;
    const rows = PBC.League.standings(S);
    const n = S.teams.length;
    const strength = S.teams.map(t => PBC.League.teamStrength(S, t.id));
    const sRank = {};
    U.sortBy(S.teams.map(t => t.id), tid => strength[tid]).forEach((tid, i) => { sRank[tid] = i; });
    const useRecord = !OFF_PHASES[S.phase];   // offseason: the next draft is a year away → roster strength only
    const score = {};
    for (const t of S.teams) {
      const r = rows[t.id];
      const w = useRecord ? Math.min(1, r.gp / Math.max(1, S.seasonGames)) : 0;
      score[t.id] = (1 - w) * (sRank[t.id] / (n - 1)) + w * (r.gp ? r.w / r.gp : 0.5);
    }
    const rank = {};
    U.sortBy(S.teams.map(t => t.id), tid => score[tid]).forEach((tid, i) => { rank[tid] = i + 1; });
    Draft._rankCache = { key, S, rank };
    return rank;
  };

  /** Projected slot (within the round, 1..teams) of a draft pick {season, round, orig}. */
  Draft.projectedSlot = function (S, pk) {
    const d = S.draftState;
    if (d && d.year === pk.season) {
      const o = d.order.find(x => x.round === pk.round && x.orig === pk.orig);
      if (o) return o.pick;
    }
    const n = S.teams.length;
    const rank = Draft.teamPickRank(S)[pk.orig] || (n + 1) / 2;
    const nextDraft = OFF_PHASES[S.phase] ? S.season + 2 : S.season + 1;
    const yrsOut = Math.max(0, pk.season - nextDraft);
    const reg = Math.min(0.8, 0.12 + 0.28 * yrsOut);
    return U.lerp(rank, (n + 1) / 2, reg);
  };

  Draft.pickLabel = function (S, pk) {
    const t = S.teams[pk.orig];
    return `${pk.season} ${U.ordinal(pk.round)}${pk.owner !== pk.orig && t ? ' (' + t.abbr + ')' : ''}`;
  };

  PBC.Draft = Draft;
})();
