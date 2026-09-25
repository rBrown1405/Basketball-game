/* Pro BBALL Coach — the offseason: aging, progression, retirements, player options, re-signing, the free-agency
   market (front-office actions, AI offers, weekly decisions), roster finalization and the new season. No DOM.
   Phases: 'awards' → begin() → 'draft_lottery' → startDraft() → 'draft' → startResign() → 'resign'
           → startFreeAgency() → 'freeagency' (faAdvance() × weeks) → finish() → 'preseason'.
   S.season stays the finished season for the whole offseason (the draft held is the S.season + 1 draft). */
(function () {
  'use strict';
  const PBC = (window.PBC = window.PBC || {});
  const U = PBC.U;
  const Off = {};
  const cfg = S => PBC.League.cfg(S);
  const news = (S, text, type, tid) => { if (PBC.Season) PBC.Season.news(S, text, type, tid); };
  const nm = p => PBC.Player.name(p);
  const OFF = { draft_lottery: 1, draft: 1, resign: 1, freeagency: 1 };

  Off.PHASES = ['draft_lottery', 'draft', 'resign', 'freeagency'];
  Off.isOffseason = S => !!OFF[S.phase];
  Off.AP_PER_WEEK = 12;          // free-agency action points per week
  Off.OFFSEASON_EXTRA = 3;       // the user may carry up to rosterMax + 3 players until the offseason ends
  Off.AI_EXTRA = 2;              // AI teams may carry +2 during the offseason for clear upgrades (trimmed at finish)
  const DIFF_ASK = { easy: 0.95, normal: 1, hard: 1.05, legend: 1.1 };          // what players ask from the user
  const DIFF_APPEAL = { easy: 6, normal: 0, hard: -4, legend: -8 };             // how much they like the user's pitch
  /** League Settings (PBC.Sliders): contract demands, loyalty, AI trade frequency. */
  const LB = S => (PBC.Sliders && PBC.Sliders.league ? PBC.Sliders.league(S) : { contractDemands: 1, loyalty: 1, aiTrades: 1 });

  /** The team the user runs (-1 while unemployed: every team is AI-run). */
  const userTid = S => (S.coach && S.coach.status === 'unemployed') ? -1 : (S.userTid == null ? -1 : S.userTid);
  Off.userTid = userTid;
  const bump = S => { S._rosterVer = (S._rosterVer || 0) + 1; };

  Off.roundAmt = function (S, x) {
    const unit = cfg(S).minSalary >= 5e5 ? 1e4 : 1e3;
    return Math.round(x / unit) * unit;
  };
  /** A legal salary for this player: rounded, and within [minimum, his max contract]. */
  Off.fitAmt = function (S, p, x) {
    const L = cfg(S);
    return Math.min(PBC.Player.maxSalary(p, L), Math.max(L.minSalary, Off.roundAmt(S, x)));
  };

  // ---------------------------------------------------------------------------
  // Cap & payroll
  // ---------------------------------------------------------------------------
  /** The season whose cap sheet matters now: next season during the offseason, else the current one. */
  Off.capYear = S => (OFF[S.phase] || S.phase === 'awards') ? S.season + 1 : S.season;

  /** Payroll for the cap year (players under contract through it + dead money). */
  Off.payroll = function (S, tid, year) {
    year = year || Off.capYear(S);
    let s = 0;
    for (const id in S.players) {
      const p = S.players[id];
      if (p.tid === tid && p.contract && p.contract.exp >= year) s += p.contract.amt;
    }
    const dm = S.deadMoney && S.deadMoney[tid];
    if (dm) for (const d of dm) if (d.exp >= year) s += d.amt;
    return s;
  };
  Off.deadMoney = function (S, tid, year) {
    year = year || Off.capYear(S);
    const dm = (S.deadMoney && S.deadMoney[tid]) || [];
    return U.sum(dm.filter(d => d.exp >= year), d => d.amt);
  };
  Off.capSpace = (S, tid) => cfg(S).cap - Off.payroll(S, tid);

  /** Players under contract for the cap year (pending free agents excluded during the offseason). */
  Off.committed = function (S, tid) {
    const yr = Off.capYear(S);
    return PBC.League.roster(S, tid).filter(p => p.contract && p.contract.exp >= yr);
  };
  Off.isExpiring = (S, p) => p.tid >= 0 && !!p.contract && p.contract.exp <= S.season && (OFF[S.phase] || S.phase === 'awards');

  // ---------------------------------------------------------------------------
  // Player preferences: team appeal, role, asking price
  // ---------------------------------------------------------------------------
  let qCache = null;
  /** Team quality 0..1 (roster strength rank blended with last season's record). Refreshed once per FA week. */
  Off.quality = function (S) {
    const key = S.season + ':' + S.phase + ':' + (S.fa ? S.fa.week : 0) + ':' + (OFF[S.phase] ? 0 : (S._rosterVer || 0));
    if (qCache && qCache.S === S && qCache.key === key) return qCache.q;
    const rows = PBC.League.standings(S);
    const n = S.teams.length;
    const str = {};
    for (const t of S.teams) str[t.id] = PBC.League.teamStrength(S, t.id);
    const q = {};
    U.sortBy(S.teams.map(t => t.id), tid => str[tid]).forEach((tid, i) => {
      const r = rows[tid];
      const pct = r.gp ? r.w / r.gp : 0.5;
      const w = Math.min(1, r.gp / Math.max(1, S.seasonGames)) * 0.45;
      q[tid] = (1 - w) * (i / (n - 1)) + w * pct;
    });
    qCache = { S, key, q };
    return q;
  };

  let rCache = null;
  /** OVRs (desc) of each team's players under contract for the cap year — cached until rosters change. */
  function rosterOvrs(S) {
    const key = S.season + ':' + S.phase + ':' + (S._rosterVer || 0);
    if (rCache && rCache.S === S && rCache.key === key) return rCache.by;
    const yr = Off.capYear(S);
    const by = {};
    for (const id in S.players) {
      const q = S.players[id];
      if (q.tid < 0) continue;
      if (OFF[S.phase] && q.contract && q.contract.exp < yr) continue;
      (by[q.tid] = by[q.tid] || []).push(q);
    }
    for (const tid in by) by[tid].sort((a, b) => b.ovr - a.ovr || a.id - b.id);
    rCache = { S, key, by };
    return by;
  }

  const ROLES = [
    [3, 'Featured role', 9, 32], [5, 'Starting role', 6, 28], [7, 'Sixth-man role', 2, 22], [9, 'Rotation role', -2, 16], [99, 'Bench role', -7, 6],
  ];
  /** Where the player would slot in on a team's depth chart. */
  Off.expectedRole = function (S, p, tid) {
    let better = 0;
    for (const q of rosterOvrs(S)[tid] || []) {
      if (q.ovr < p.ovr || (q.ovr === p.ovr && q.id >= p.id)) break;
      if (q.id !== p.id) better++;
    }
    const rank = better + 1;
    const r = ROLES.find(x => rank <= x[0]);
    return { rank, label: r[1], score: r[2], min: r[3] };
  };

  /** How much a player wants to play for a team: { score 0..100, factors: [{label, v}], role }. */
  Off.appeal = function (S, p, tid, opts) {
    opts = opts || {};
    const t = S.teams[tid];
    const pe = p.pers || { money: 50, win: 50, loyal: 50, pt: 50, market: 50, ego: 50, work: 60 };
    const f = [];
    const add = (label, v) => { if (Math.abs(v) >= 0.5) f.push({ label, v: Math.round(v) }); return v; };
    let s = 50;
    const q = Off.quality(S)[tid];
    s += add(q >= 0.5 ? 'Winning team' : 'Losing team', (q - 0.5) * 26 * (0.4 + pe.win / 83));
    const role = Off.expectedRole(S, p, tid);
    s += add(role.label, role.score * (0.4 + pe.pt / 83));
    s += add(t.market >= 3 ? 'Big market' : 'Small market', (t.market - 3) * 3.2 * (0.3 + pe.market / 70));
    const rep = tid === userTid(S) ? (S.coach ? S.coach.rep : 50) : (t.coachRating || 60);
    s += add('Head coach', (rep - 50) * 0.14);
    const loyal = LB(S).loyalty;
    if (opts.own) {
      const last = PBC.Stats.season(p, S.season, false);
      if (last && last.gp >= 10) s += add('Playing time', U.clamp((last.min / last.gp - role.min) * 0.3, -8, 6) * (0.4 + pe.pt / 83));
      const tenure = p.stats.filter(x => x.tid === tid && !x.po).length;
      s += add('Loyalty', ((pe.loyal - 45) * 0.16 + Math.min(tenure, 5) * 1.2) * loyal);
      s += add('Morale', ((p.morale == null ? 70 : p.morale) - 62) * 0.3);
      if (p.tradeReq) s += add('Asked for a trade', -12);
    } else if (opts.former) {
      s += add('Former team', (pe.loyal - 50) * 0.12 * loyal);
    }
    if (tid === userTid(S)) s += DIFF_APPEAL[S.difficulty] || 0;
    else s += ((U.hash(p.id + ':' + tid) % 1000) / 1000 - 0.5) * 8;   // relationships the user can't see
    return { score: U.clamp(s, 0, 100), factors: f.sort((a, b) => Math.abs(b.v) - Math.abs(a.v)), role };
  };

  Off.moodLabel = v => (v >= 75 ? 'Loves it here' : v >= 60 ? 'Happy' : v >= 45 ? 'Content' : v >= 32 ? 'Unhappy' : 'Wants out');
  Off.interestLabel = v => (v >= 80 ? 'Sold on you' : v >= 65 ? 'Very interested' : v >= 50 ? 'Interested' : v >= 35 ? 'Lukewarm' : 'Cold');

  /** Base asking price (per season) before mood / difficulty. */
  Off.baseAsk = function (S, p) {
    const L = cfg(S);
    const mv = PBC.Player.marketValue(p, L);
    const f = 1 + ((p.pers ? p.pers.money : 50) - 50) / 300;
    return Off.fitAmt(S, p, mv * f * LB(S).contractDemands);
  };

  /** Contract length the player wants. */
  Off.prefYears = function (p) {
    if (p.age >= 34) return 1;
    if (p.age >= 32) return 2;
    if (p.age >= 30) return 3;
    if (p.ovr >= 80) return p.age <= 27 ? 5 : 4;
    if (p.age <= 24 && p.pot - p.ovr >= 6) return 2;   // betting on himself
    return 3;
  };

  /** Money/years part of an offer's value to the player (0 = exactly his ask & length). */
  Off.moneyScore = function (p, offer, ask) {
    const moneyW = 0.7 + ((p.pers ? p.pers.money : 50) / 100);
    let s = (offer.amt / Math.max(1, ask) - 1) * 100 * moneyW;
    s -= Math.abs((offer.years || 1) - Off.prefYears(p)) * 2.5;
    if (offer.opt && offer.years >= 2) s += 3;
    return s;
  };

  // ---------------------------------------------------------------------------
  // Development (calibrated on top of Player.progress via its coachDev argument)
  // ---------------------------------------------------------------------------
  // Player.progress(p, dev) grows everyone ≤ 26 by a sizeable base regardless of potential, which inflates the
  // league by ~+10 OVR per decade. We pass dev = target − (what progress adds on its own), where the target is
  // "close part of the gap to potential + a small age drift". Re-tune DEV if Player.progress changes
  // (node test/offseason.js prints the league's OVR distribution season by season).
  // Development is mean-reverting around each player's hidden career curve: p.dv is his true peak; young players
  // close part of the gap to it every summer, veterans follow peak + age decline. Luck (progress' own noise)
  // fades instead of compounding, so the league neither inflates nor deflates. In-season practice gains are
  // credited to the curve, so the user's training is permanent.
  const PROGRESS_BASE = a => (a <= 20 ? 4.2 : a <= 22 ? 3.2 : a <= 24 ? 2.1 : a <= 26 ? 1.0 : a <= 28 ? 0.2 : a <= 30 ? -0.9 : a <= 32 ? -2.1 : a <= 34 ? -3.3 : -4.6);
  Off.DEV = {
    drift: { 27: 0.1, 28: -0.2, 29: -0.7, 30: -1.1, 31: -1.6, 32: -2.2, 33: -2.8, 34: -3.4, 35: -4.0 },
    young: 0,               // ≤ 26: growth comes from closing the gap to the peak
    old: -4.6,              // 36+
    gapRate: a => (a <= 24 ? 0.3 : 0.35),
    revert: 0.3,            // veterans drift back toward their expected curve
    peakWalk: 0.7,          // ≤ 24: the true peak itself moves a little (booms & busts)
  };
  const driftAt = a => (a >= 36 ? Off.DEV.old : a <= 26 ? Off.DEV.young : Off.DEV.drift[a]);
  const cumDrift = a => { let s = 0; for (let k = 27; k <= a; k++) s += driftAt(k); return s; };
  /** The player's hidden true peak (initialized from his current rating the first time). ageNow = age the ratings belong to. */
  Off.truePeak = function (p, ageNow) {
    if (p.dv == null) p.dv = ageNow <= 26 ? Math.max(p.pot, p.ovr) : p.ovr - cumDrift(ageNow);
    return p.dv;
  };
  /**
   * One-time setup of every player's hidden career peak (p.dv): called from Draft.ensureClass during League.create
   * and from begin() for older saves. The generator's potentials are optimistic (σ≈7 for teenagers, capped at 99:
   * 30+ "future 90+" players vs ~12 actual 90+; and its 22-26-year-olds already rate like prime players), so young
   * players' peaks are regressed toward their OVR and their displayed POT is aligned with it. Veterans are assumed to
   * sit on their aging curve.
   */
  Off.initDevelopment = function (S) {
    if (S.devInit) return;
    S.devInit = 1;
    for (const id in S.players) {
      const p = S.players[id];
      if (p.dv != null || p.tid === -3) continue;
      if (p.tid === -2) { p.dv = Math.max(p.pot, p.ovr); continue; }
      if (p.age <= 26) {
        const k = U.clamp(0.5 - 0.05 * (p.age - 19), 0.3, 0.5);     // generator's 22-26s already rate like primes
        p.dv = p.ovr + Math.max(0, p.pot - p.ovr) * k;
        p.pot = Math.max(p.ovr, Math.round(p.dv));
      } else p.dv = p.ovr - cumDrift(p.age);
    }
  };
  /**
   * Target OVR change this offseason (age already incremented).
   * mods (League Settings, optional): { grow: growth-speed multiplier toward the peak, age: aging/decline multiplier }.
   */
  Off.devTarget = function (p, mods) {
    const a = p.age, D = Off.DEV;
    const grow = mods && mods.grow != null ? mods.grow : 1, ageM = mods && mods.age != null ? mods.age : 1;
    const peak = Off.truePeak(p, a - 1);
    if (a <= 26) return driftAt(a) + D.gapRate(a) * grow * (peak - p.ovr);
    const expectedPrev = peak + (a - 1 >= 27 ? cumDrift(a - 1) * ageM : 0);
    const drift = driftAt(a) < 0 ? driftAt(a) * ageM : driftAt(a);
    return drift + (a === 27 ? D.gapRate(a) * grow : D.revert) * (expectedPrev - p.ovr);
  };
  /** League Settings multipliers for one player's development: progression (+ rookie development) and aging. */
  Off.devMods = function (S, p) {
    const lb = PBC.Sliders && PBC.Sliders.league ? PBC.Sliders.league(S) : null;
    if (!lb) return null;
    const rookie = (p.yearsPro || 0) <= 2;                     // his first three pro seasons
    return { grow: lb.progression * (rookie ? lb.rookieDev : 1), age: lb.aging };
  };
  /** One offseason of development for a player (call after age++). extra: coaching bonus (rating points). */
  Off.develop = function (S, p, extra) {
    const a = p.age;
    Off.truePeak(p, a - 1);
    if (p.seasonStart && p.seasonStart.ovr != null && p.ovr > p.seasonStart.ovr) p.dv += p.ovr - p.seasonStart.ovr;  // practice gains
    if (a <= 24) p.dv = U.clamp(p.dv + U.gauss(0, Off.DEV.peakWalk), 40, 99);
    const gap = p.pot - p.ovr;
    const slope = p.ovr >= 64 ? 1.0 : 0.75;                      // OVR per point of rating growth
    const dev = Off.devTarget(p, Off.devMods(S, p)) / slope - PROGRESS_BASE(a) - (a <= 26 ? gap * 0.16 : 0) + (extra || 0);
    const d = PBC.Player.progress(p, dev);
    p.pot = a <= 26 ? Math.round(U.clamp(Math.max(p.ovr, p.dv), p.ovr, 99)) : p.ovr;
    p.seasonStart = { ovr: p.ovr, tid: p.tid };
    if (PBC.Tendency && PBC.Tendency.refresh) PBC.Tendency.refresh(p);   // habits follow the new ratings (unless customized)
    return d;
  };

  // ---------------------------------------------------------------------------
  // Offseason step 1: aging, progression, retirements, contracts
  // ---------------------------------------------------------------------------
  const RETIRE_BASE = { 30: 0.01, 31: 0.03, 32: 0.06, 33: 0.1, 34: 0.17, 35: 0.27, 36: 0.4, 37: 0.55, 38: 0.7, 39: 0.82, 40: 0.92 };
  Off.retireChance = function (S, p) {
    const a = p.age;
    let c = a >= 41 ? 1 : (RETIRE_BASE[a] || 0);
    if (a >= 30) c -= Math.max(0, p.ovr - 72) * 0.012;           // stars hang on longer
    if (p.ovr < 62 && a >= 29) c += 0.12;
    if (p.tid === -1) c += a >= 30 ? 0.2 : (a >= 27 && p.ovr < 60 ? 0.15 : 0);   // nobody wants him
    if (p.tid >= 0 && p.contract && p.contract.exp > S.season) c *= 0.4;          // money still on the table
    return U.clamp(c, 0, 1);
  };

  Off.removeFromTeam = function (S, p) {
    const t = S.teams[p.tid];
    if (!t) return;
    if (t.rot) {
      t.rot.starters = (t.rot.starters || []).filter(id => id !== p.id);
      if (t.rot.minutes) delete t.rot.minutes[p.id];
    }
    if (t.strat) {
      if (t.strat.goTo1 === p.id) t.strat.goTo1 = null;
      if (t.strat.goTo2 === p.id) t.strat.goTo2 = null;
    }
  };

  function lastTeam(p) {
    if (p.tid >= 0) return p.tid;
    const rows = p.stats.filter(s => s.tid >= 0);
    return rows.length ? rows[rows.length - 1].tid : (p.lastTid != null ? p.lastTid : -1);
  }

  Off.retire = function (S, p, reason) {
    const tid = lastTeam(p);
    Off.removeFromTeam(S, p);
    p.tid = -3;
    p.tradeReq = null;
    p.retired = { season: S.season, age: p.age, tid, reason: reason || 'retired' };
    p.contract = { amt: 0, exp: S.season, rookie: false };
    p.injury = null;
    p.promise = null;
    bump(S);
  };

  function retireNews(S, p) {
    const aw = p.awards || [];
    const cnt = type => aw.filter(a => a.type === type).length;
    const mvp = cnt('mvp'), rings = cnt('champion'), as = cnt('allStar'), al = cnt('allLeague');
    const u = userTid(S);
    if (!(p.ovr >= 80 || mvp || as >= 2 || al || (p.retired && p.retired.tid === u && u >= 0))) return;
    const c = PBC.Stats.career(p, false);
    const ppg = c.gp ? (c.pts / c.gp).toFixed(1) : '0.0';
    const honors = [mvp ? `${mvp}× MVP` : '', rings ? `${rings}× champion` : '', as ? `${as}× All-Star` : ''].filter(Boolean).join(', ');
    const t = S.teams[p.retired.tid];
    news(S, `🎖️ ${nm(p)}${t ? ' (' + t.abbr + ')' : ''} retires after ${U.plural(p.yearsPro || c.seasons, 'season')} — ${ppg} ppg over ${c.gp} games${honors ? '; ' + honors : ''}.`, 'retirement', p.retired.tid);
  }

  function evaluatePromises(S) {
    const fo = S.fo || (S.fo = { kept: 0, broken: 0 });
    for (const id in S.players) {
      const p = S.players[id];
      if (!p.promise) continue;
      if (p.promise.season != null && p.promise.season > S.season) continue;
      if (p.tid >= 0 && p.tid === p.promise.tid) {
        const s = PBC.Stats.season(p, S.season, false);
        if (s && s.gp >= 10) {
          const kept = p.promise.type === 'starter' ? s.gs / s.gp >= 0.6 : s.min / s.gp >= (p.promise.min || 20) - 2;
          if (kept) { fo.kept++; p.morale = Math.min(100, (p.morale || 70) + 6); }
          else { fo.broken++; p.morale = Math.max(5, (p.morale || 70) - 12); news(S, `💔 ${nm(p)} says the team broke its ${p.promise.type === 'starter' ? 'starting-role' : 'minutes'} promise.`, 'career', p.tid); }
        }
      }
      p.promise = null;
    }
  }

  /** Leave the season recap: aging, progression, retirements, options, lottery. Phase → 'draft_lottery'. */
  Off.begin = function (S) {
    if (S.phase !== 'awards') return false;
    const L = cfg(S);
    const u = userTid(S);
    const sum = S.offseason = {
      season: S.season, retired: [], risers: [], fallers: [], user: [], optOuts: [], expiring: [],
      resigned: [], walked: [], signings: [], trades: [], released: [], filled: [],
    };
    evaluatePromises(S);
    Off.initDevelopment(S);
    // --- aging & development ---
    const deltas = [];
    for (const id in S.players) {
      const p = S.players[id];
      if (p.tid === -3) continue;
      p.age++;
      if (p.tid === -2) continue;                 // prospects don't develop until they're drafted
      const played = p.tid >= 0 || p.stats.some(s => s.season === S.season);
      const before = p.ovr;
      Off.develop(S, p, 0);
      if (played) p.yearsPro = (p.yearsPro || 0) + 1;
      if (p.tid >= 0) deltas.push({ pid: p.id, from: before, to: p.ovr, d: p.ovr - before });
      if (p.tid >= 0 && p.tid === u) sum.user.push({ pid: p.id, from: before, to: p.ovr, d: p.ovr - before });
      if (p.injury) { p.injury.days -= 120; if (p.injury.days <= 0) p.injury = null; }
      if (p.tid >= 0) p.morale = Math.round((p.morale == null ? 70 : p.morale) * 0.65 + 70 * 0.35);
    }
    sum.risers = U.sortBy(deltas, x => x.d, true).slice(0, 8);
    sum.fallers = U.sortBy(deltas.filter(x => x.from >= 72), x => x.d).slice(0, 6);
    sum.user = U.sortBy(sum.user, x => x.d, true);
    // --- retirements ---
    for (const id in S.players) {
      const p = S.players[id];
      if (p.tid < -1 || p.tid === -2) continue;
      if (U.chance(Off.retireChance(S, p))) {
        Off.retire(S, p, 'retired');
        sum.retired.push(p.id);
        retireNews(S, p);
      }
    }
    // --- player options (decided a season ahead of the option year) ---
    for (const id in S.players) {
      const p = S.players[id];
      if (p.tid < 0 || !p.contract || p.contract.po !== S.season + 1) continue;
      const mv = PBC.Player.marketValue(p, L);
      delete p.contract.po;
      if (mv > p.contract.amt * 1.08 && p.age <= 32) {
        p.contract.exp = S.season;
        sum.optOuts.push(p.id);
        if (p.tid === u || p.ovr >= 80) news(S, `🚪 ${nm(p)} (${S.teams[p.tid].abbr}) declines his player option and will become a free agent.`, 'transaction', p.tid);
      }
    }
    // --- achievements ---
    if (u >= 0 && PBC.Coach && S.coach) {
      for (const id in S.players) {
        const p = S.players[id];
        if (p.tid >= 0 && p.draft && p.draft.byUser && p.draft.overall > 10 && p.ovr >= 80) { PBC.Coach.unlock(S, 'draft_steal'); break; }
      }
    }
    sum.expiring = u >= 0 ? PBC.League.roster(S, u).filter(p => p.contract && p.contract.exp <= S.season).map(p => p.id) : [];
    // --- the lottery ---
    PBC.Draft.grantPredraftPoints(S);
    PBC.Draft.setup(S);
    S.resign = null;
    S.fa = null;
    bump(S);
    S.phase = 'draft_lottery';
    news(S, `🌅 The ${U.seasonLabel(S.season)} offseason begins: ${sum.retired.length} retirement${sum.retired.length === 1 ? '' : 's'}, the draft lottery is next.`, 'league');
    return true;
  };

  // ---------------------------------------------------------------------------
  // Step 2: lottery → draft
  // ---------------------------------------------------------------------------
  Off.startDraft = function (S) {
    if (S.phase !== 'draft_lottery') return false;
    const d = PBC.Draft.state(S) || PBC.Draft.setup(S);
    d.revealed = true;
    PBC.Draft.lotteryNews(S);
    S.phase = 'draft';
    const aiT = LB(S).aiTrades;
    if (PBC.Trade && PBC.Trade.aiTradeTick && aiT > 0) for (let i = 0; i < Math.max(1, Math.round(2 * aiT)); i++) if (U.chance(Math.min(0.9, 0.45 * Math.min(1, aiT)))) PBC.Trade.aiTradeTick(S);
    return true;
  };

  // ---------------------------------------------------------------------------
  // Step 3: re-sign your own players
  // ---------------------------------------------------------------------------
  Off.resignInfo = function (S, p) {
    const L = cfg(S);
    const forUser = p.tid === userTid(S);
    const ap = Off.appeal(S, p, p.tid, { own: true });
    const mood = ap.score;
    const base = Off.baseAsk(S, p) * (forUser ? DIFF_ASK[S.difficulty] || 1 : 1);
    let f = mood >= 72 ? 0.93 : mood >= 58 ? 0.98 : mood >= 45 ? 1.05 : 1.12;
    const loyal = LB(S).loyalty;
    if (f < 1 && loyal !== 1) f = Math.max(0.75, 1 - (1 - f) * loyal);   // hometown discount (Loyalty setting)
    const ask = Off.fitAmt(S, p, base * f);
    const willing = mood >= 38 || !!(p.contract && p.contract.rookie);
    return { pid: p.id, ask, years: Off.prefYears(p), mood: Math.round(mood), willing, factors: ap.factors, label: Off.moodLabel(mood), status: 'pending', tries: 0 };
  };

  Off.userExpiring = S => (userTid(S) >= 0 ? PBC.League.roster(S, userTid(S)).filter(p => p.contract && p.contract.exp <= S.season) : []);

  function signContract(S, p, tid, amt, years, opt) {
    p.tid = tid;
    p.contract = { amt, exp: S.season + years, rookie: false };
    if (opt && years >= 2) p.contract.po = S.season + years;
    bump(S);
  }

  function aiResign(S, onlyTid) {
    const L = cfg(S), u = userTid(S);
    for (const t of S.teams) {
      if (onlyTid != null ? t.id !== onlyTid : t.id === u) continue;
      const all = PBC.League.roster(S, t.id);
      const exp = all.filter(p => p.contract && p.contract.exp <= S.season);
      if (!exp.length) continue;
      let payroll = Off.payroll(S, t.id);
      let count = all.length - exp.length;
      const limit = t.owner.spend >= 70 ? L.apron : t.owner.spend >= 45 ? L.tax : (L.cap + L.tax) / 2;
      for (const p of exp) {
        const rank = all.indexOf(p);
        const info = Off.resignInfo(S, p);
        const valueOk = info.ask <= PBC.Player.marketValue(p, L) * 1.25;
        const want = p.age <= 35 && (rank < 8 || (p.age <= 25 && p.pot >= 75 && rank < 12)) && count < L.rosterMax + Off.AI_EXTRA;
        const afford = payroll + info.ask <= limit || info.ask <= L.minSalary * 1.5;
        // stars and unhappy players test the market more often (keeps free agency interesting)
        const stay = !info.willing ? 0.15 : (p.ovr >= 82 ? 0.55 : p.ovr >= 75 ? 0.68 : 0.8) + (info.mood - 50) * 0.006;
        if (want && valueOk && afford && U.chance(stay)) {
          const yrs = U.clamp(info.years + U.int(-1, 0), 1, 5);
          signContract(S, p, t.id, info.ask, yrs, false);
          payroll += info.ask; count++;
          p.morale = Math.min(100, (p.morale || 70) + 5);
          if (p.ovr >= 80 || t.id === u) news(S, `✍️ ${t.city} re-sign ${nm(p)} (${p.pos}, ${p.ovr}): ${U.plural(yrs, 'year')}, ${U.money(info.ask)}/yr.`, 'transaction', t.id);
        }
      }
    }
  }

  /** After the draft: open the re-signing window (AI teams make their decisions now). */
  Off.startResign = function (S) {
    if (S.phase !== 'draft') return false;
    if (S.draftState && !S.draftState.done) PBC.Draft.simAll(S);
    S.phase = 'resign';
    S.resign = { season: S.season, pl: {} };
    for (const p of Off.userExpiring(S)) S.resign.pl[p.id] = Off.resignInfo(S, p);
    aiResign(S);
    return true;
  };

  Off.validateAmount = function (S, p, offer) {
    const L = cfg(S);
    const max = PBC.Player.maxSalary(p, L);
    const years = Math.round(offer.years || 0);
    if (!(years >= 1 && years <= 5)) return 'Contracts run 1 to 5 years.';
    if (!(offer.amt >= L.minSalary - 1)) return `The minimum salary is ${U.money(L.minSalary)}.`;
    if (offer.amt > max + 1) return `The most he can earn is ${U.money(max)} (max contract for ${p.yearsPro || 0} years of experience).`;
    return null;
  };

  /** The user offers a new deal to one of his own expiring players. offer = { amt, years, opt }. */
  Off.offerResign = function (S, pid, offer) {
    const R = S.resign && S.resign.pl[pid];
    const p = S.players[pid];
    if (S.phase !== 'resign' || !R || !p || p.tid !== userTid(S)) return { ok: false, msg: 'You can’t negotiate with him right now.' };
    if (R.status !== 'pending') return { ok: false, msg: R.status === 'signed' ? 'Already re-signed.' : `${nm(p)} has decided to test free agency.` };
    const err = Off.validateAmount(S, p, offer);
    if (err) return { ok: false, msg: err };
    offer = { amt: Off.fitAmt(S, p, offer.amt), years: Math.round(offer.years), opt: !!offer.opt };
    if (!R.willing && offer.amt < R.ask * 1.2) {
      R.tries++;
      return { ok: false, msg: `${nm(p)} wants to test free agency. Only a clear overpay (${U.money(R.ask * 1.2)}+) would change his mind.` };
    }
    const sc = Off.moneyScore(p, offer, R.ask);
    if (sc >= -1.5) {
      signContract(S, p, p.tid, offer.amt, offer.years, offer.opt);
      R.status = 'signed';
      R.deal = offer;
      p.morale = Math.min(100, (p.morale || 70) + 8);
      if (S.offseason) S.offseason.resigned.push(p.id);
      news(S, `✍️ You re-signed ${nm(p)}: ${U.plural(offer.years, 'year')}, ${U.money(offer.amt)}/yr${offer.opt ? ' (player option)' : ''}.`, 'transaction', p.tid);
      return { ok: true, accepted: true, msg: `${nm(p)} signs! ${U.plural(offer.years, 'year')} at ${U.money(offer.amt)} per season.` };
    }
    R.tries++;
    R.ask = Off.fitAmt(S, p, R.ask * 1.03);
    if (R.tries >= 3 || sc < -30) {
      R.status = 'refused';
      return { ok: false, refused: true, msg: `${nm(p)} is done talking — he'll test free agency.` };
    }
    const py = Off.prefYears(p);
    return { ok: false, msg: `Rejected. He wants about ${U.money(R.ask)} per season${offer.years !== py ? ` and prefers ${U.plural(py, 'year')}` : ''}. (${3 - R.tries} tr${3 - R.tries === 1 ? 'y' : 'ies'} left)` };
  };

  Off.letWalk = function (S, pid) {
    const R = S.resign && S.resign.pl[pid];
    if (R && R.status === 'pending') R.status = 'walked';
    return !!R;
  };

  /** The user's assistant GM makes the re-sign decisions (auto mode / "Sim offseason"). */
  Off.autoResignUser = function (S) {
    const u = userTid(S);
    if (u < 0 || !S.resign) return;
    const L = cfg(S);
    const all = PBC.League.roster(S, u);
    let payroll = Off.payroll(S, u);
    for (const p of all) {
      const R = S.resign.pl[p.id];
      if (!R || R.status !== 'pending') continue;
      const rank = all.indexOf(p);
      const want = p.age <= 34 && (rank < 8 || (p.age <= 25 && p.pot >= 75 && rank < 12)) && R.willing;
      if (want && R.ask <= PBC.Player.marketValue(p, L) * 1.3 && payroll + R.ask <= L.tax) {
        const r = Off.offerResign(S, p.id, { amt: R.ask, years: R.years, opt: false });
        if (r.ok) payroll += R.ask;
      } else R.status = 'walked';
    }
  };

  // ---------------------------------------------------------------------------
  // Step 4: free agency
  // ---------------------------------------------------------------------------
  Off.FA_ACTIONS = [
    { key: 'text', label: 'Text Player', icon: '💬', cost: 1, desc: 'A quick check-in. Small bump, and tells you what he cares about most.' },
    { key: 'agent', label: 'Call Agent', icon: '📞', cost: 1, desc: 'Reveals his asking price, preferred length and which teams have offered.' },
    { key: 'video', label: 'Video Pitch', icon: '🎬', cost: 2, desc: 'Show him how he fits your system. Better with a strong coaching reputation.' },
    { key: 'tour', label: 'Facility Tour', icon: '🏟️', cost: 3, desc: 'Fly him in. Big boost; plays best in big markets and with players who care about the city.' },
    { key: 'dinner', label: 'Owner Dinner', icon: '🍽️', cost: 3, desc: 'Your owner makes the pitch. Great with money-driven players; better with a big-spending owner.' },
    { key: 'star', label: 'Star Player Recruits', icon: '⭐', cost: 3, desc: 'Your best player makes the call. Scales with his rating; big egos don’t love sharing the spotlight.' },
    { key: 'contender', label: 'Contender Pitch', icon: '🏆', cost: 2, desc: 'Sell a title run. Huge with winners if your team is good — backfires if it isn’t.' },
    { key: 'starter', label: 'Promise Starting Role', icon: '🟢', cost: 2, once: true, desc: 'Guarantee a starting job. Big with playing-time players. Break it and morale and credibility suffer.' },
    { key: 'minutes', label: 'Promise Minutes', icon: '⏱️', cost: 1, once: true, desc: 'Guarantee a minutes floor (20, 25 or 30 mpg). Must be kept.' },
    { key: 'offer', label: 'Offer Contract', icon: '✍️', cost: 0, desc: 'Put money on the table: salary, years and an optional player option.' },
  ];
  const FA_BY_KEY = {};
  Off.FA_ACTIONS.forEach(a => { FA_BY_KEY[a.key] = a; });

  function faEntry(S, p) {
    const ask = Off.baseAsk(S, p);
    const e = { ask, years: Off.prefYears(p), boost: 0, acts: {}, known: false, motive: false, offers: [], promise: null, signed: null, lastTid: p.lastTid != null ? p.lastTid : -1 };
    S.fa.pl[p.id] = e;
    p.contract = { amt: ask, exp: S.season, rookie: false };
    return e;
  }

  function toFreeAgency(S, p) {
    p.lastTid = p.tid;
    Off.removeFromTeam(S, p);
    p.tid = -1;
    p.promise = null;
    p.tradeReq = null;
    p.contract = { amt: Off.baseAsk(S, p), exp: S.season, rookie: false };
    bump(S);
  }

  /** Close re-signing (unresolved user players walk), everyone expiring hits the market, AI teams open with offers. */
  Off.startFreeAgency = function (S) {
    if (S.phase !== 'resign') return false;
    const L = cfg(S);
    const walked = [];
    for (const id in S.players) {
      const p = S.players[id];
      if (p.tid >= 0 && p.contract && p.contract.exp <= S.season) {
        if (p.tid === userTid(S)) walked.push(p.id);
        toFreeAgency(S, p);
      }
    }
    if (S.offseason) S.offseason.walked = walked;
    S.fa = { season: S.season, week: 1, weeks: L.key === 'women' ? 6 : 8, ap: Off.AP_PER_WEEK, apMax: Off.AP_PER_WEEK, mle: {}, pl: {}, log: [], done: false };
    for (const p of PBC.League.freeAgents(S)) faEntry(S, p);
    // players who refused the user's offers start out colder on the user
    if (S.resign) for (const pid in S.resign.pl) { const R = S.resign.pl[pid]; if (R.status === 'refused' && S.fa.pl[pid]) S.fa.pl[pid].boost = -12; }
    S.phase = 'freeagency';
    aiOffers(S);
    news(S, `🖊️ Free agency is open! ${Object.keys(S.fa.pl).length} players are on the market.`, 'league');
    return true;
  };

  Off.faList = function (S) {
    if (!S.fa) return [];
    return U.sortBy(Object.keys(S.fa.pl).map(Number).map(id => S.players[id]).filter(p => p && p.tid === -1 && !S.fa.pl[p.id].signed), p => p.ovr, true);
  };

  /** Ask the user sees (difficulty-adjusted). */
  Off.userAsk = function (S, pid) {
    const e = S.fa && S.fa.pl[pid];
    if (!e) return S.players[pid] ? Off.baseAsk(S, S.players[pid]) : 0;
    return Off.fitAmt(S, S.players[pid], e.ask * (DIFF_ASK[S.difficulty] || 1));
  };

  /** Rough asking-price bracket shown before the agent call. */
  Off.askRange = function (S, pid) {
    const a = Off.userAsk(S, pid);
    const L = cfg(S);
    if (a <= L.minSalary * 1.05) return { lo: L.minSalary, hi: L.minSalary };
    return { lo: Off.roundAmt(S, Math.max(L.minSalary, a * 0.8)), hi: Off.roundAmt(S, a * 1.2) };
  };

  /** Interest in the user's team 0..100 (appeal + recruiting). */
  Off.faInterest = function (S, pid) {
    const e = S.fa && S.fa.pl[pid];
    const p = S.players[pid];
    const u = userTid(S);
    if (!p || u < 0) return { score: 0, factors: [], role: null };
    const ap = Off.appeal(S, p, u, { former: e && e.lastTid === u });
    const score = U.clamp(ap.score + (e ? e.boost : 0), 0, 100);
    const factors = ap.factors.slice();
    if (e && Math.abs(e.boost) >= 1) factors.unshift({ label: 'Your recruiting', v: Math.round(e.boost) });
    return { score: Math.round(score), factors, role: ap.role, label: Off.interestLabel(score) };
  };

  /** Value of a specific offer to the player (≥ threshold ⇒ he signs). */
  Off.offerValue = function (S, p, o) {
    const e = S.fa.pl[p.id];
    const u = userTid(S);
    const isUser = o.tid === u;
    const ask = isUser ? e.ask * (DIFF_ASK[S.difficulty] || 1) : e.ask;
    const ap = Off.appeal(S, p, o.tid, { former: o.tid === e.lastTid }).score + (isUser ? e.boost : 0);
    return Off.moneyScore(p, o, ask) + (U.clamp(ap, 0, 100) - 50) * 0.45;
  };

  /** Score a player needs from his best offer to sign this week (stars take their time). */
  Off.threshold = function (S, p) {
    const base = p.ovr >= 80 ? 9 : p.ovr >= 72 ? 5 : 0;
    return base - ((S.fa ? S.fa.week : 1) - 1) * 3.5;
  };

  /** Cap rules for a new offer from team tid: returns { kind } or { error }. */
  Off.offerKind = function (S, tid, amt, ignorePid) {
    const L = cfg(S);
    if (amt <= L.minSalary + 1) return { kind: 'min' };
    const pending = S.fa ? U.sum(Off.pendingOffers(S, tid).filter(o => o.kind === 'cap' && o.pid !== ignorePid), o => o.amt) : 0;
    const room = L.cap - Off.payroll(S, tid) - pending;
    if (amt <= room) return { kind: 'cap', room };
    const mleBusy = S.fa && (S.fa.mle[tid] || Off.pendingOffers(S, tid).some(o => o.kind === 'mle' && o.pid !== ignorePid));
    if (amt <= L.mle + 1 && !mleBusy) return { kind: 'mle', room };
    return { error: room > 0 ? `You have ${U.money(room)} in cap space${mleBusy ? '' : ` (or the ${U.money(L.mle)} mid-level exception)`}. Above that, only minimum deals are allowed.` : `You’re over the cap: you can offer the mid-level exception (up to ${U.money(L.mle)}, once${mleBusy ? ' — already in use' : ''}) or the minimum (${U.money(L.minSalary)}).`, room };
  };

  Off.pendingOffers = function (S, tid) {
    const out = [];
    if (!S.fa) return out;
    for (const pid in S.fa.pl) {
      const e = S.fa.pl[pid];
      if (e.signed) continue;
      for (const o of e.offers) if (o.tid === tid) out.push(Object.assign({ pid: +pid }, o));
    }
    return out;
  };

  Off.rosterRoom = function (S, tid) {
    const L = cfg(S);
    const max = tid === userTid(S) ? L.rosterMax + Off.OFFSEASON_EXTRA : L.rosterMax;
    return max - Off.committed(S, tid).length - Off.pendingOffers(S, tid).length;
  };

  /** A user front-office action on a free agent. arg: minutes for 'minutes'. */
  Off.faAction = function (S, pid, key, arg) {
    const fa = S.fa;
    const a = FA_BY_KEY[key];
    const p = S.players[pid];
    const e = fa && fa.pl[pid];
    const u = userTid(S);
    if (!a || key === 'offer') return { ok: false, msg: 'Use the offer dialog.' };
    if (S.phase !== 'freeagency' || !e || !p || p.tid !== -1 || e.signed) return { ok: false, msg: 'He is not available.' };
    if (u < 0) return { ok: false, msg: 'You need a job first.' };
    if (fa.ap < a.cost) return { ok: false, msg: `Not enough action points this week (${a.cost} needed).` };
    if (a.once && e.acts[key]) return { ok: false, msg: 'Already done.' };
    if (key === 'minutes' && e.promise && e.promise.type === 'starter') return { ok: false, msg: 'You already promised him a starting job.' };
    if (key === 'starter' && e.promise && e.promise.type === 'minutes') return { ok: false, msg: 'You already promised him minutes.' };
    const pe = p.pers || {};
    const t = S.teams[u];
    const n = e.acts[key] || 0;
    const dim = Math.pow(0.5, n);
    const q = Off.quality(S)[u];
    const fo = S.fo || { kept: 0, broken: 0 };
    const cred = U.clamp(1 - fo.broken * 0.18 + fo.kept * 0.04, 0.3, 1.1);
    const role = Off.expectedRole(S, p, u);
    let d = 0, msg = '';
    switch (key) {
      case 'text': d = 3; e.motive = true; msg = `${p.first} is most driven by ${Off.topMotive(p)}.`; break;
      case 'agent': {
        d = 1; e.known = true;
        const others = e.offers.filter(o => o.tid !== u).map(o => S.teams[o.tid].abbr);
        msg = `His agent wants ${U.money(Off.userAsk(S, pid))}/yr for ${U.plural(e.years, 'year')}. ${others.length ? 'Offers from: ' + others.join(', ') + '.' : 'No other offers yet.'}`;
        break;
      }
      case 'video': d = 4 + ((S.coach ? S.coach.rep : 50) - 50) * 0.1; msg = 'He watched your pitch video.'; break;
      case 'tour': d = 3 + t.market * 1.5 * (0.5 + (pe.market || 50) / 100); msg = `He toured the ${t.city} facilities.`; break;
      case 'dinner': d = 3 + (t.owner.spend / 12) * (0.5 + (pe.money || 50) / 100); msg = 'Dinner with the owner went well.'; break;
      case 'star': {
        const star = PBC.League.roster(S, u)[0];
        d = star ? Math.max(0.5, (star.ovr - 74) * 0.7) * ((pe.ego || 50) > 75 ? 0.5 : 1) : 0;
        msg = star ? `${nm(star)} called him personally.` : 'Nobody on your roster moves the needle.';
        break;
      }
      case 'contender': d = (q - 0.5) * 32 * (0.4 + (pe.win || 50) / 80); msg = d >= 0 ? 'He likes your chances to win.' : 'He isn’t buying it — your team isn’t a contender.'; break;
      case 'starter': {
        const c = (role.rank <= 5 ? 1 : role.rank <= 7 ? 0.6 : 0.3) * cred;
        d = (4 + ((pe.pt || 50) / 100) * 12) * c;
        e.promise = { type: 'starter' };
        msg = c >= 0.8 ? 'He believes he’ll start for you.' : 'He doubts he’d really start.';
        break;
      }
      case 'minutes': {
        const min = [20, 25, 30].includes(arg) ? arg : 25;
        const c = (min <= role.min + 4 ? 1 : min <= role.min + 10 ? 0.65 : 0.35) * cred;
        d = ((pe.pt || 50) / 100) * (min - 12) * 0.55 * c;
        e.promise = { type: 'minutes', min };
        msg = `You promised ${min} minutes a night.`;
        break;
      }
    }
    if (!a.once) d *= dim;
    d *= U.range(0.85, 1.15);
    const before = e.boost;
    e.boost = U.clamp(e.boost + d, -20, 40);
    fa.ap -= a.cost;
    e.acts[key] = n + 1;
    const delta = Math.round((e.boost - before) * 10) / 10;
    return { ok: true, msg, delta, interest: Off.faInterest(S, pid).score };
  };

  Off.topMotive = function (p) {
    const pe = p.pers || {};
    const m = [['money', 'getting paid'], ['win', 'winning a title'], ['pt', 'playing time'], ['market', 'playing in a big market'], ['loyal', 'loyalty and stability']];
    return U.maxBy(m, x => pe[x[0]] || 0)[1];
  };

  /** The user makes (or replaces) an offer. offer = { amt, years, opt }. */
  Off.faOffer = function (S, pid, offer) {
    const fa = S.fa;
    const p = S.players[pid];
    const e = fa && fa.pl[pid];
    const u = userTid(S);
    const L = cfg(S);
    if (S.phase !== 'freeagency' || !e || !p || p.tid !== -1 || e.signed) return { ok: false, msg: 'He is not available.' };
    if (u < 0) return { ok: false, msg: 'You need a job first.' };
    const err = Off.validateAmount(S, p, offer);
    if (err) return { ok: false, msg: err };
    const amt = Off.fitAmt(S, p, offer.amt);
    const years = Math.round(offer.years);
    const k = Off.offerKind(S, u, amt, pid);
    if (k.error) return { ok: false, msg: k.error };
    const hadOffer = e.offers.some(o => o.tid === u);
    if (!hadOffer && Off.rosterRoom(S, u) <= 0) return { ok: false, msg: `No roster room (max ${L.rosterMax + Off.OFFSEASON_EXTRA} in the offseason, counting pending offers).` };
    if (k.kind === 'mle' && years > 4) return { ok: false, msg: 'Mid-level exception deals max out at 4 years.' };
    if (k.kind === 'min' && years > 2) return { ok: false, msg: 'Minimum deals max out at 2 years.' };
    e.offers = e.offers.filter(o => o.tid !== u);
    const o = { tid: u, amt, years, opt: !!offer.opt && years >= 2, kind: k.kind, week: fa.week, promise: e.promise ? Object.assign({}, e.promise) : null };
    const val = Off.offerValue(S, p, o);
    if (val < -30) {
      e.boost = U.clamp(e.boost - 3, -20, 40);
      return { ok: false, insulted: true, msg: `${nm(p)}'s camp calls the offer insulting.` };
    }
    e.offers.push(o);
    const best = U.maxBy(e.offers.filter(x => x.tid !== u), x => Off.offerValue(S, p, x));
    const bestV = best ? Off.offerValue(S, p, best) : -Infinity;
    const thr = Off.threshold(S, p);
    if (val >= thr + 4 && val >= bestV + 3 && validOffer(S, o, p)) {
      signFA(S, p, o);
      return { ok: true, signed: true, msg: `✍️ ${nm(p)} accepts on the spot! ${U.plural(years, 'year')}, ${U.money(amt)}/yr.` };
    }
    const standing = val >= bestV ? (val >= thr ? 'You’re the front-runner.' : 'You have the best offer, but he wants more before deciding.') : 'Another team’s offer is ahead of yours.';
    return { ok: true, signed: false, value: val, msg: `Offer delivered. ${standing} He decides at the end of the week.` };
  };

  Off.faWithdraw = function (S, pid) {
    const e = S.fa && S.fa.pl[pid];
    if (!e) return false;
    const u = userTid(S);
    const had = e.offers.length;
    e.offers = e.offers.filter(o => o.tid !== u);
    return had !== e.offers.length;
  };

  /** Where the user's offer stands: 'none' | 'leading' | 'behind' | 'short' */
  Off.userOfferStatus = function (S, pid) {
    const e = S.fa && S.fa.pl[pid];
    const u = userTid(S);
    const p = S.players[pid];
    if (!e || !p) return { status: 'none' };
    const mine = e.offers.find(o => o.tid === u);
    if (!mine) return { status: 'none', others: e.offers.length };
    const val = Off.offerValue(S, p, mine);
    const others = e.offers.filter(o => o.tid !== u);
    const best = others.length ? Math.max(...others.map(o => Off.offerValue(S, p, o))) : -Infinity;
    const status = val < best ? 'behind' : val >= Off.threshold(S, p) ? 'leading' : 'short';
    return { status, offer: mine, others: others.length };
  };

  function validOffer(S, o, p) {
    const L = cfg(S);
    const isUser = o.tid === userTid(S);
    const committed = Off.committed(S, o.tid);
    if (committed.length >= L.rosterMax + (isUser ? Off.OFFSEASON_EXTRA : Off.AI_EXTRA)) return false;
    if (!isUser && p && committed.length >= L.rosterMax) {
      const worst = U.minBy(committed, q => q.ovr);
      if (worst && p.ovr < worst.ovr + 3) return false;                 // not worth cutting someone for
    }
    if (o.kind === 'min' || o.amt <= L.minSalary + 1) { o.kind = 'min'; return true; }
    const room = L.cap - Off.payroll(S, o.tid);
    if (o.amt <= room) { o.kind = 'cap'; return true; }
    if (o.amt <= L.mle + 1 && !S.fa.mle[o.tid]) { o.kind = 'mle'; return true; }
    return false;
  }

  function signFA(S, p, o) {
    const fa = S.fa;
    const e = fa.pl[p.id];
    const u = userTid(S);
    signContract(S, p, o.tid, o.amt, o.years, o.opt);
    if (o.kind === 'mle') fa.mle[o.tid] = true;
    if (o.promise && o.tid === u) p.promise = { type: o.promise.type, min: o.promise.min || 0, season: S.season + 1, tid: o.tid };
    p.morale = 74;
    p.tradeLock = S.season + 1;
    p.num = 0;
    PBC.Player.assignNumber(S, p);
    e.signed = { tid: o.tid, amt: o.amt, years: o.years, week: fa.week };
    e.offers = [];
    const t = S.teams[o.tid];
    const line = `${t.abbr} sign ${nm(p)} (${p.pos}, ${p.ovr}) — ${U.plural(o.years, 'yr')}, ${U.money(o.amt)}${o.kind === 'mle' ? ' (MLE)' : ''}`;
    fa.log.unshift({ week: fa.week, pid: p.id, tid: o.tid, amt: o.amt, years: o.years, kind: o.kind, text: line });
    if (S.offseason) S.offseason.signings.push({ pid: p.id, tid: o.tid, amt: o.amt, years: o.years, week: fa.week });
    if (o.tid === u || p.ovr >= 78) news(S, `✍️ ${t.city} ${t.name} sign ${nm(p)} (${p.pos}, ${p.ovr} OVR): ${U.plural(o.years, 'year')}, ${U.money(o.amt)}/yr.`, 'signing', o.tid);
    if (o.tid === u && p.ovr >= 85 && PBC.Coach) PBC.Coach.unlock(S, 'big_fa');
  }

  function aiYears(p) {
    const py = Off.prefYears(p);
    if (p.age >= 31) return Math.max(1, py - U.int(0, 1));
    return U.clamp(py + U.int(-1, 1), 1, 5);
  }

  /** AI teams (or, in auto mode, the user's assistant) put offers on the table. */
  function aiOffers(S, onlyTid) {
    const L = cfg(S);
    const fa = S.fa;
    const u = userTid(S);
    const pool = Off.faList(S);
    if (!pool.length) return;
    const teams = U.shuffle(S.teams.filter(t => onlyTid != null ? t.id === onlyTid : t.id !== u));
    for (const t of teams) {
      // stale offers (2+ weeks old) are withdrawn so the team can re-target
      for (const pid in fa.pl) { const e = fa.pl[pid]; if (!e.signed) e.offers = e.offers.filter(o => o.tid !== t.id || fa.week - o.week < 2); }
      const committed = Off.committed(S, t.id);
      const mine = Off.pendingOffers(S, t.id);
      let count = committed.length + mine.length;
      const maxR = L.rosterMax;
      if (count >= maxR + Off.AI_EXTRA) continue;
      const worst = committed.length ? U.minBy(committed, q => q.ovr).ovr : 0;
      let room = L.cap - Off.payroll(S, t.id) - U.sum(mine.filter(o => o.kind === 'cap'), o => o.amt);
      let mleFree = !fa.mle[t.id] && !mine.some(o => o.kind === 'mle');
      const sorted = U.sortBy(committed, p => p.ovr, true);
      const kth8 = sorted[7] ? sorted[7].ovr : 55;
      const kth5 = sorted[4] ? sorted[4].ovr : 60;
      const maxNew = count < L.rosterMin ? 3 : fa.week === 1 ? 2 : 1;
      let made = 0;
      const cand = U.sortBy(pool.filter(p => !fa.pl[p.id].signed && !fa.pl[p.id].offers.some(o => o.tid === t.id)),
        p => p.ovr + (p.age <= 24 ? (p.pot - p.ovr) * 0.3 : 0) - Math.max(0, p.age - 31) * 1.5 + U.gauss(0, 1.5), true);
      for (const p of cand) {
        if (made >= maxNew || count >= maxR + Off.AI_EXTRA) break;
        if (count >= maxR && p.ovr < worst + 4) continue;                 // only clear upgrades once the roster is full
        const e = fa.pl[p.id];
        const upgrade = p.ovr - kth8;
        const prospect = p.age <= 23 && p.pot >= kth5 + 2;
        if (!(upgrade > -1 || prospect || (count < L.rosterMin && upgrade > -10))) continue;
        const ask = e.ask;
        let amt, kind;
        if (room >= ask * 0.85 && room >= L.minSalary) {
          amt = Math.min(room, PBC.Player.maxSalary(p, L), ask * U.range(0.96, 1.1));
          kind = 'cap';
        } else if (mleFree && ask <= L.mle * 1.25 && upgrade > 0) {
          amt = Math.min(L.mle, ask * U.range(0.95, 1.08));
          kind = 'mle';
        } else if (ask <= L.minSalary * 1.8) {
          amt = L.minSalary; kind = 'min';
        } else continue;
        amt = Off.fitAmt(S, p, amt);
        if (amt > L.cap * 0.12 && upgrade < 3 && !prospect) continue;       // don't pay starter money for a backup
        if (amt <= L.minSalary + 1) kind = 'min';
        let years = aiYears(p);
        if (kind === 'mle') years = Math.min(years, 4);
        if (kind === 'min') years = Math.min(years, 2);
        e.offers.push({ tid: t.id, amt, years, opt: false, kind, week: fa.week });
        count++; made++;
        if (kind === 'cap') room -= amt;
        if (kind === 'mle') mleFree = false;
      }
    }
  }
  Off._aiOffers = aiOffers;

  function decide(S) {
    const fa = S.fa;
    const last = fa.week >= fa.weeks;
    const signed = [];
    const list = Off.faList(S);
    for (const p of list) {
      const e = fa.pl[p.id];
      if (!e.offers.length) continue;
      const scored = U.sortBy(e.offers.map(o => ({ o, s: Off.offerValue(S, p, o) })), x => x.s, true);
      const thr = Off.threshold(S, p) + U.gauss(0, 2.5);
      if (scored[0].s < thr && !last) continue;
      for (const x of scored) {
        if (!last && x.s < thr) break;
        if (x.s < -35) break;
        if (validOffer(S, x.o, p)) { signFA(S, p, x.o); signed.push(p.id); break; }
        e.offers = e.offers.filter(o => o !== x.o);                    // cap space / roster spot is gone
      }
    }
    return signed;
  }

  /** End the current free-agency week: players decide, demands drop, AI teams re-bid. */
  Off.faAdvance = function (S) {
    if (S.phase !== 'freeagency' || !S.fa || S.fa.done) return null;
    const fa = S.fa;
    const u = userTid(S);
    const before = fa.log.length;
    const courted = new Set();
    for (const pid in fa.pl) if (fa.pl[pid].offers.some(o => o.tid === u)) courted.add(+pid);
    const signed = decide(S);
    const mineSigned = signed.filter(pid => S.players[pid].tid === u);
    const lost = signed.filter(pid => courted.has(pid) && S.players[pid].tid !== u);
    if (fa.week >= fa.weeks) {
      fa.done = true;
    } else {
      fa.week++;
      for (const p of Off.faList(S)) {
        const e = fa.pl[p.id];
        if (!e.offers.length) {
          e.ask = Off.fitAmt(S, p, e.ask * 0.9);
          p.contract.amt = e.ask;
        }
      }
      aiOffers(S);
      fa.ap = fa.apMax;
      const aiT = LB(S).aiTrades;
      if (PBC.Trade && PBC.Trade.aiTradeTick && aiT > 0 && U.chance(Math.min(0.9, 0.25 * aiT))) PBC.Trade.aiTradeTick(S);
    }
    return { signed, mine: mineSigned, lost, log: fa.log.slice(0, fa.log.length - before) };
  };

  /** The user's assistant GM bids in free agency (auto mode). */
  Off.autoFAUser = function (S) {
    const u = userTid(S);
    if (u < 0 || S.phase !== 'freeagency') return;
    aiOffers(S, u);
  };

  // ---------------------------------------------------------------------------
  // Signing & releasing outside the market
  // ---------------------------------------------------------------------------
  /** Sign a free agent outside the free-agency market (in-season / preseason): a rest-of-season deal. */
  Off.quickSign = function (S, pid) {
    const L = cfg(S), u = userTid(S), p = S.players[pid];
    if (!p || p.tid !== -1) return { ok: false, msg: 'He is not a free agent.' };
    if (u < 0) return { ok: false, msg: 'You need a job first.' };
    if (S.phase === 'freeagency') return { ok: false, msg: 'Use the free-agency market.' };
    if (OFF[S.phase] || S.phase === 'awards' || S.phase === 'postseason_done') return { ok: false, msg: 'The season is over — free agency opens after the draft and re-signing period.' };
    if (PBC.League.roster(S, u).length >= L.rosterMax) return { ok: false, msg: `Your roster is full (${L.rosterMax}). Release someone first.` };
    const ask = p.contract ? p.contract.amt : Off.baseAsk(S, p);
    const room = L.cap - Off.payroll(S, u);
    let amt;
    if (ask <= room || ask <= L.minSalary) amt = Math.max(L.minSalary, ask);
    else if (ask <= L.minSalary * 1.35) amt = L.minSalary;
    else return { ok: false, msg: `${nm(p)} wants ${U.money(ask)}. You have ${U.money(Math.max(0, room))} in cap space — over the cap you can only offer the minimum.` };
    p.tid = u;
    p.contract = { amt, exp: S.season, rookie: false };
    p.num = 0;
    PBC.Player.assignNumber(S, p);
    p.morale = 70;
    bump(S);
    const t = S.teams[u];
    if (t.rot && t.rot.auto !== false) PBC.AI.autoRotation(S, u);
    news(S, `✍️ You signed ${nm(p)} (${p.pos}, ${p.ovr}) for the rest of the season (${U.money(amt)}).`, 'signing', u);
    return { ok: true, msg: `${nm(p)} signs for ${U.money(amt)}.` };
  };

  /** Release a player from the user's team. Guaranteed money stays on the cap as dead money. */
  Off.release = function (S, pid) {
    const u = userTid(S), p = S.players[pid];
    if (!p || p.tid !== u || u < 0) return { ok: false, msg: 'Not on your roster.' };
    const yr = Off.capYear(S);
    const nonGuaranteed = p.contract && p.contract.rookie && p.draft && p.draft.round >= 2 && p.rookieSeason === S.season + 1 && OFF[S.phase];
    let dead = 0;
    const deadExp = p.contract ? p.contract.exp : S.season;
    if (!nonGuaranteed && p.contract && p.contract.exp >= yr && p.contract.amt > 0) {
      S.deadMoney = S.deadMoney || {};
      (S.deadMoney[u] = S.deadMoney[u] || []).push({ pid: p.id, name: nm(p), amt: p.contract.amt, exp: p.contract.exp });
      dead = p.contract.amt;
    }
    Off.removeFromTeam(S, p);
    p.lastTid = u;
    p.tid = -1;
    p.promise = null;
    p.tradeReq = null;
    p.contract = { amt: Off.baseAsk(S, p), exp: S.season, rookie: false };
    if (S.fa && S.phase === 'freeagency' && !S.fa.done) { faEntry(S, p); S.fa.pl[p.id].boost = -15; }
    if (S.offseason && OFF[S.phase]) S.offseason.released.push(p.id);
    bump(S);
    const t = S.teams[u];
    if (t.rot && t.rot.auto !== false && !OFF[S.phase]) PBC.AI.autoRotation(S, u);
    news(S, `✂️ You released ${nm(p)}.${dead ? ` ${U.money(dead)}/yr stays on the books through ${U.seasonLabel(deadExp)}.` : ''}`, 'transaction', u);
    return { ok: true, dead, msg: `${nm(p)} released.${dead ? ' Dead money: ' + U.money(dead) + '/yr.' : ''}` };
  };

  // ---------------------------------------------------------------------------
  // Step 5: finish the offseason
  // ---------------------------------------------------------------------------
  Off.canFinish = function (S) {
    const L = cfg(S), u = userTid(S);
    if (S.phase !== 'freeagency') return { ok: false, msg: 'Free agency is not open.' };
    if (u >= 0) {
      const n = PBC.League.roster(S, u).length;
      if (n > L.rosterMax) return { ok: false, over: n - L.rosterMax, msg: `You have ${n} players. Release ${n - L.rosterMax} to get down to ${L.rosterMax} before the season.` };
    }
    return { ok: true };
  };

  function cutValue(p, L) {
    return p.ovr * 3 + (p.pot - p.ovr) * (p.age < 24 ? 1.5 : 0) + (p.contract ? p.contract.amt / L.cap * 60 : 0);
  }

  /** Assistant GM trims the user's roster to the max (auto mode). */
  Off.autoTrimUser = function (S) {
    const L = cfg(S), u = userTid(S);
    if (u < 0) return [];
    const cut = [];
    let r = PBC.League.roster(S, u);
    while (r.length > L.rosterMax) {
      const p = U.minBy(r, q => cutValue(q, L));
      Off.release(S, p.id);
      cut.push(p.id);
      r = PBC.League.roster(S, u);
    }
    return cut;
  };

  /** Close free agency and start the new season: S.season++, rosters finalized, schedule & draft class. */
  Off.finish = function (S, opts) {
    opts = opts || {};
    if (S.phase !== 'freeagency') return false;
    const L = cfg(S), u = userTid(S);
    if (opts.auto) Off.autoTrimUser(S);
    const chk = Off.canFinish(S);
    if (!chk.ok) return false;
    const sum = S.offseason;
    // the market closes: unsigned players drop their demands for in-season deals
    const faLog = S.fa ? S.fa.log.slice(0, 60) : [];
    for (const p of PBC.League.freeAgents(S)) p.contract = { amt: Off.fitAmt(S, p, (p.contract ? p.contract.amt : L.minSalary) * 0.6), exp: S.season, rookie: false };
    S.season++;
    S.phase = 'preseason';
    // AI rosters: fill to the minimum with 1-year deals, trim to the maximum, rotations & systems
    for (const t of S.teams) {
      if (t.id === u) continue;
      PBC.AI.fillRoster(S, t.id, { quiet: true });
      PBC.AI.setupTeam(S, t.id);
    }
    // the user's roster: the front office fills empty spots with minimum deals
    if (u >= 0) {
      let r = PBC.League.roster(S, u);
      while (r.length < L.rosterMin) {
        const fas = PBC.League.freeAgents(S).filter(p => !PBC.Player.isInjured(p));
        if (!fas.length) break;
        const p = U.maxBy(fas, q => q.ovr - Math.max(0, q.age - 32));
        p.tid = u;
        p.contract = { amt: L.minSalary, exp: S.season, rookie: false };
        p.num = 0;
        PBC.Player.assignNumber(S, p);
        if (sum) sum.filled.push(p.id);
        news(S, `📝 Your front office signed ${nm(p)} (${p.pos}, ${p.ovr}) to a minimum deal to fill out the roster.`, 'transaction', u);
        r = PBC.League.roster(S, u);
      }
      const t = S.teams[u];
      if (!t.rot || t.rot.auto !== false) PBC.AI.autoRotation(S, u);
      else {
        const ids = new Set(r.map(p => p.id));
        t.rot.starters = t.rot.starters.filter(id => ids.has(id));
        for (const id in t.rot.minutes) if (!ids.has(+id)) delete t.rot.minutes[id];
        if (!ids.has(t.strat.goTo1)) t.strat.goTo1 = null;
        if (!ids.has(t.strat.goTo2)) t.strat.goTo2 = null;
      }
    }
    // the free-agent pool: old or fringe players leave the league
    const fas = U.sortBy(PBC.League.freeAgents(S), p => p.ovr, true);
    const keep = S.teams.length * 2 + 10;
    fas.forEach((p, i) => {
      if (p.age >= 34 || (p.age >= 30 && p.ovr < 62) || (i >= keep && (p.ovr < 60 || U.chance(0.5)))) {
        Off.retire(S, p, p.age >= 30 ? 'retired' : 'overseas');
        if (sum) (sum.left = sum.left || []).push(p.id);
      } else p.contract.exp = S.season;
    });
    // dead money that has run out
    if (S.deadMoney) for (const tid in S.deadMoney) S.deadMoney[tid] = S.deadMoney[tid].filter(d => d.exp >= S.season);
    for (const id in S.players) { const p = S.players[id]; if (p.tradeLock && p.tradeLock < S.season) delete p.tradeLock; }
    PBC.League.newSeasonSetup(S);
    if (sum) S.lastOffseason = Object.assign({}, sum, { faLog });
    S.offseason = null;
    S.fa = null;
    S.resign = null;
    bump(S);
    news(S, `🏀 Training camps open for the ${U.seasonLabel(S.season)} season.`, 'league');
    return true;
  };

  // ---------------------------------------------------------------------------
  // Automation & helpers for the UI
  // ---------------------------------------------------------------------------
  /** Run the rest of the offseason with the assistant GM making the user's decisions. */
  Off.autoAll = function (S) {
    if (S.phase === 'awards') Off.begin(S);
    if (S.phase === 'draft_lottery') Off.startDraft(S);
    if (S.phase === 'draft') { PBC.Draft.simAll(S); Off.startResign(S); }
    if (S.phase === 'resign') { Off.autoResignUser(S); Off.startFreeAgency(S); }
    let guard = 0;
    while (S.phase === 'freeagency' && S.fa && !S.fa.done && guard++ < 20) { Off.autoFAUser(S); Off.faAdvance(S); }
    if (S.phase === 'freeagency') Off.finish(S, { auto: true });
    return S.phase === 'preseason';
  };

  /** What CONTINUE does next in each offseason phase (label for the top bar). */
  Off.nextLabel = function (S) {
    switch (S.phase) {
      case 'draft_lottery': return 'Start the Draft';
      case 'draft': {
        const d = PBC.Draft.state(S);
        if (!d || d.done) return 'Re-sign Players';
        return PBC.Draft.isUserTurn(S) ? 'You’re on the Clock' : PBC.Draft.userPicksLeft(S) ? 'Sim to My Pick' : 'Finish Draft';
      }
      case 'resign': return 'Open Free Agency';
      case 'freeagency': return S.fa && !S.fa.done ? `End Week ${S.fa.week}/${S.fa.weeks}` : 'Start New Season';
      default: return '';
    }
  };

  PBC.Offseason = Off;
})();
