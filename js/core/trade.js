/* Pro BBALL Coach — trades: asset values, salary matching, AI acceptance with reasons, auto-balancing ("what would
   you want for X?"), trade-block offers and AI-to-AI deals. No DOM.
   An offer is { tids: [A, B], give: [{ pids: [], picks: [] }, { pids: [], picks: [] }] } — give[i] is what tids[i]
   sends away. Picks are keys "season:round:orig" (see Trade.pickKey). By convention tids[0] is the user. */
(function () {
  'use strict';
  const PBC = (window.PBC = window.PBC || {});
  const U = PBC.U;
  const Trade = {};
  const cfg = S => PBC.League.cfg(S);
  const nm = p => PBC.Player.name(p);
  const news = (S, text, type, tid) => { if (PBC.Season) PBC.Season.news(S, text, type, tid); };
  const userTid = S => (S.coach && S.coach.status === 'unemployed') ? -1 : (S.userTid == null ? -1 : S.userTid);
  const OFFP = { draft: 1, resign: 1, freeagency: 1 };
  const payroll = (S, tid) => (PBC.Offseason ? PBC.Offseason.payroll(S, tid) : PBC.AI.payroll(S, tid));
  const capYear = S => (PBC.Offseason ? PBC.Offseason.capYear(S) : S.season);
  const bump = S => { S._rosterVer = (S._rosterVer || 0) + 1; };

  Trade.MARGIN = { easy: -0.06, normal: 0.05, hard: 0.12, legend: 0.2 };   // extra value the AI wants from the user
  Trade.AI_MARGIN = 0.03;                                                   // AI-to-AI deals
  Trade.MATCH = 1.25;                                                       // over-the-cap salary matching

  Trade.buffer = S => Math.round(cfg(S).minSalary * 0.25);
  Trade.empty = (a, b) => ({ tids: [a, b], give: [{ pids: [], picks: [] }, { pids: [], picks: [] }] });
  Trade.clone = o => ({ tids: o.tids.slice(), give: o.give.map(g => ({ pids: g.pids.slice(), picks: g.picks.slice() })) });

  // ---------------------------------------------------------------------------
  // Window & eligibility
  // ---------------------------------------------------------------------------
  Trade.status = function (S) {
    if (S.phase === 'preseason') return { open: true };
    if (S.phase === 'regular') {
      if (S.flags && S.flags.tradeDeadlinePassed) return { open: false, reason: 'The trade deadline has passed. Trading reopens at the draft.' };
      return { open: true, deadline: S.tradeDeadlineDay, daysLeft: Math.max(0, (S.tradeDeadlineDay || 0) - S.day) };
    }
    if (OFFP[S.phase]) return { open: true };
    if (S.phase === 'draft_lottery') return { open: false, reason: 'Trading reopens when the draft starts.' };
    return { open: false, reason: 'No trades during the postseason. Trading reopens at the draft.' };
  };

  Trade.pickKey = pk => pk.season + ':' + pk.round + ':' + pk.orig;
  Trade.findPick = (S, key) => S.draftPicks.find(pk => Trade.pickKey(pk) === key) || null;
  Trade.pickUsed = function (S, pk) {
    const d = S.draftState;
    if (d && d.year === pk.season) {
      if (d.done) return true;
      const o = d.order.find(x => x.round === pk.round && x.orig === pk.orig);
      return !!(o && o.pid != null);
    }
    return pk.season <= S.season;
  };
  Trade.teamPicks = (S, tid) => U.sortBy(S.draftPicks.filter(pk => pk.owner === tid && !Trade.pickUsed(S, pk)), pk => pk.season * 10 + pk.round);
  Trade.pickLabel = (S, pk) => PBC.Draft.pickLabel(S, pk);

  /** Why a player can't be traded right now (or null). */
  Trade.playerBlock = function (S, p) {
    if (!p || p.tid < 0) return 'He is not on a team.';
    if ((OFFP[S.phase] || S.phase === 'awards') && p.contract && p.contract.exp <= S.season) return `${nm(p)} is a pending free agent.`;
    if (p.tradeLock && (p.tradeLock > S.season || (p.tradeLock === S.season && S.phase === 'preseason'))) return `${nm(p)} just signed and can't be traded until the regular season.`;
    return null;
  };

  // ---------------------------------------------------------------------------
  // Valuation
  // ---------------------------------------------------------------------------
  /** 'contend' | 'middle' | 'rebuild' — drives how a team weighs now vs. later. */
  Trade.teamMode = function (S, tid) {
    const n = S.teams.length;
    const rank = PBC.Draft.teamPickRank(S)[tid] || n / 2;     // 1 = worst
    const f = (rank - 1) / Math.max(1, n - 1);
    return f >= 0.62 ? 'contend' : f <= 0.35 ? 'rebuild' : 'middle';
  };

  /** Trade value of a player to team tid (opts.receiving: depth-adjusted; opts.without: ids leaving that team). */
  Trade.playerValue = function (S, p, tid, opts) {
    const L = cfg(S);
    const mode = Trade.teamMode(S, tid);
    const growth = p.age <= 24 ? Math.max(0, p.pot - p.ovr) * (p.age <= 21 ? 0.55 : p.age <= 23 ? 0.42 : 0.28) : 0;
    const decline = p.age >= 30 ? (p.age - 29) * 1.3 : 0;
    const future = p.ovr + growth - decline;
    const wNow = mode === 'contend' ? 0.68 : mode === 'rebuild' ? 0.32 : 0.5;
    const eff = wNow * p.ovr + (1 - wNow) * future;
    let v = 3 * Math.exp((eff - 70) * 0.14);
    const c = p.contract || { amt: L.minSalary, exp: S.season };
    const yrs = Math.max(0.5, c.exp - capYear(S) + 1);
    const surplus = (PBC.Player.marketValue(p, L) - c.amt) / L.cap;
    v += surplus * 28 * Math.min(yrs, 4) * (mode === 'rebuild' ? 1.15 : 1);
    if (p.injury && p.injury.days > 25) v *= p.injury.days > 150 ? 0.45 : p.injury.days > 60 ? 0.7 : 0.85;
    if (opts && opts.receiving && v > 0) {
      const without = new Set((opts.without) || []);
      let better = 0;
      for (const id in S.players) { const q = S.players[id]; if (q.tid === tid && !without.has(q.id) && q.ovr > p.ovr) better++; }
      if (better >= 10) v *= 0.45; else if (better >= 8) v *= 0.75;
    }
    return v;
  };

  /** Trade value of a draft pick to team tid. */
  Trade.pickValue = function (S, pk, tid) {
    const n = S.teams.length;
    const slot = PBC.Draft.projectedSlot(S, pk);
    const pos = 1 + (slot - 1) / Math.max(1, n - 1) * 29;        // normalize to a 30-team scale
    let v = pk.round === 1 ? 20 * Math.exp(-(pos - 1) * 0.085) + 2.5 : pk.round === 2 ? 1.5 : 0.5;
    const nextDraft = OFFP[S.phase] ? S.season + 2 : S.season + 1;
    const d = S.draftState;
    const yrsOut = d && d.year === pk.season ? 0 : Math.max(0, pk.season - nextDraft);
    v *= Math.pow(0.92, yrsOut);
    const mode = Trade.teamMode(S, tid);
    if (mode === 'rebuild') v *= 1.25; else if (mode === 'contend') v *= 0.85;
    return v;
  };

  /** Franchise cornerstones need a premium to pry loose. */
  Trade.isCornerstone = function (S, p) {
    if (!p || p.tid < 0) return false;
    const best = PBC.League.roster(S, p.tid)[0];
    if (best && best.id === p.id && p.ovr >= 84) return true;
    return p.age <= 23 && p.pot >= 88;
  };

  // ---------------------------------------------------------------------------
  // Evaluation
  // ---------------------------------------------------------------------------
  Trade.evaluate = function (S, offer) {
    const L = cfg(S);
    const u = userTid(S);
    const errors = [], reasons = [];
    const st = Trade.status(S);
    if (!st.open) errors.push(st.reason);
    const [A, B] = offer.tids;
    if (A === B || !S.teams[A] || !S.teams[B]) errors.push('Pick two different teams.');
    const assets = offer.give[0].pids.length + offer.give[0].picks.length + offer.give[1].pids.length + offer.give[1].picks.length;
    if (!assets) errors.push('Add players or picks to the deal.');
    const sides = [];
    for (let i = 0; i < 2; i++) {
      const tid = offer.tids[i];
      for (const pid of offer.give[i].pids) {
        const p = S.players[pid];
        if (!p || p.tid !== tid) { errors.push(`${p ? nm(p) : 'A player'} is no longer on ${S.teams[tid] ? S.teams[tid].abbr : '?'}.`); continue; }
        const b = Trade.playerBlock(S, p);
        if (b) errors.push(b);
      }
      for (const key of offer.give[i].picks) {
        const pk = Trade.findPick(S, key);
        if (!pk || pk.owner !== tid || Trade.pickUsed(S, pk)) errors.push('A draft pick in the deal is no longer available.');
      }
    }
    const offseason = !!OFFP[S.phase];
    for (let i = 0; i < 2; i++) {
      const tid = offer.tids[i], o = 1 - i;
      const outP = offer.give[i].pids.map(id => S.players[id]).filter(Boolean);
      const inP = offer.give[o].pids.map(id => S.players[id]).filter(Boolean);
      const outK = offer.give[i].picks.map(k => Trade.findPick(S, k)).filter(Boolean);
      const inK = offer.give[o].picks.map(k => Trade.findPick(S, k)).filter(Boolean);
      const yr = capYear(S);
      const sal = arr => U.sum(arr, p => (p.contract && p.contract.exp >= yr ? p.contract.amt : 0));
      const salOut = sal(outP), salIn = sal(inP);
      const pay = S.teams[tid] ? payroll(S, tid) : 0;
      const payAfter = pay - salOut + salIn;
      const rosterNow = PBC.League.roster(S, tid).length;
      const rosterAfter = rosterNow - outP.length + inP.length;
      const without = outP.map(p => p.id);
      const give = U.sum(outP, p => Trade.playerValue(S, p, tid)) + U.sum(outK, pk => Trade.pickValue(S, pk, tid));
      const get = U.sum(inP, p => Trade.playerValue(S, p, tid, { receiving: true, without })) + U.sum(inK, pk => Trade.pickValue(S, pk, tid));
      const maxIn = Math.round(salOut * Trade.MATCH + Trade.buffer(S));
      const side = { tid, isUser: tid === u, salOut, salIn, payroll: pay, payAfter, maxIn, rosterNow, rosterAfter, give, get, net: get - give, need: 0, accept: true, salaryOk: true, rosterOk: true };
      if (payAfter > L.cap && salIn > maxIn) {
        side.salaryOk = false;
        errors.push(`Salaries don't match: ${S.teams[tid].abbr} would be over the cap, so it can take back at most ${U.money(maxIn)} (125% of the ${U.money(salOut)} it sends + ${U.money(Trade.buffer(S))}).`);
      }
      const maxR = L.rosterMax + (offseason ? (tid === u ? (PBC.Offseason ? PBC.Offseason.OFFSEASON_EXTRA : 3) : 2) : 0);
      const minR = Math.max(8, L.rosterMin - 3);
      if (rosterAfter > maxR && rosterAfter > rosterNow) { side.rosterOk = false; errors.push(`${S.teams[tid].abbr} would have ${rosterAfter} players (max ${maxR}).`); }
      if (rosterAfter < minR && rosterAfter < rosterNow) { side.rosterOk = false; errors.push(`${S.teams[tid].abbr} would be left with only ${rosterAfter} players (min ${minR}).`); }
      sides.push(side);
    }
    // AI decisions
    for (let i = 0; i < 2; i++) {
      const s = sides[i];
      if (s.isUser) continue;
      const vsUser = sides[1 - i].isUser;
      const margin = vsUser ? (Trade.MARGIN[S.difficulty] != null ? Trade.MARGIN[S.difficulty] : 0.05) : Trade.AI_MARGIN;
      const mood = ((U.hash(S.season + ':' + S.day + ':' + S.phase + ':' + s.tid) % 100) / 100 - 0.5) * 0.06;
      let need = s.give * (margin + mood) + 0.5;
      const outP = offer.give[i].pids.map(id => S.players[id]).filter(Boolean);
      const corner = outP.filter(p => Trade.isCornerstone(S, p));
      if (corner.length) {
        need += U.sum(corner, p => Trade.playerValue(S, p, s.tid)) * 0.25;
        reasons.push(`${S.teams[s.tid].abbr} consider ${corner.map(nm).join(' & ')} a cornerstone — it will take a haul.`);
      }
      const owner = S.teams[s.tid].owner || { spend: 50 };
      if (s.payAfter > L.tax && s.salIn > s.salOut && owner.spend < 65) {
        s.accept = false;
        reasons.unshift(`${S.teams[s.tid].abbr} won't take on salary above the luxury tax.`);
      }
      s.need = need;
      if (s.net < need) {
        s.accept = false;
        const gap = need - s.net;
        reasons.unshift(gap > s.give * 0.5 + 6 ? `${S.teams[s.tid].abbr}: "Not even close. We want a lot more value."` : gap > 4 ? `${S.teams[s.tid].abbr} want more value.` : `${S.teams[s.tid].abbr} want a little more value — you're close.`);
      }
    }
    const aiOk = sides.every(s => s.isUser || s.accept);
    const ok = !errors.length && aiOk;
    const msg = errors[0] || (aiOk ? 'They accept the deal!' : reasons[0]) || '';
    return { ok, errors, reasons, sides, msg, aiOk };
  };

  /** Fairness meter for the UI: -1 (you overpay) .. +1 (they overpay), plus a label. */
  Trade.balanceMeter = function (S, ev) {
    const ai = ev.sides.find(s => !s.isUser) || ev.sides[1];
    const scale = Math.max(4, ai.give + ai.get);
    const x = U.clamp((ai.need - ai.net) / scale * 2, -1, 1);
    const label = ai.net >= ai.need ? (ai.net - ai.need > scale * 0.25 ? 'You’re overpaying' : 'Fair — they’d accept') : x > 0.5 ? 'Way short' : 'A bit short';
    return { x, label };
  };

  // ---------------------------------------------------------------------------
  // Execution
  // ---------------------------------------------------------------------------
  function fixTeam(S, tid, u) {
    const t = S.teams[tid];
    const ids = new Set(PBC.League.roster(S, tid).map(p => p.id));
    if (t.rot) {
      t.rot.starters = (t.rot.starters || []).filter(id => ids.has(id));
      for (const id in t.rot.minutes) if (!ids.has(+id)) delete t.rot.minutes[id];
    }
    if (t.strat) {
      if (!ids.has(t.strat.goTo1)) t.strat.goTo1 = null;
      if (!ids.has(t.strat.goTo2)) t.strat.goTo2 = null;
    }
    if (tid !== u) {
      if (S.phase === 'regular' || S.phase === 'preseason') PBC.AI.fillRoster(S, tid, { quiet: false });
      PBC.AI.autoRotation(S, tid);
      const r = PBC.League.roster(S, tid).filter(p => !PBC.Player.isInjured(p));
      if (!t.strat.goTo1 && r[0]) t.strat.goTo1 = r[0].id;
      if (!t.strat.goTo2 && r[1]) t.strat.goTo2 = r[1].id;
    } else if (!t.rot || t.rot.auto !== false) PBC.AI.autoRotation(S, tid);
  }

  Trade.describe = function (S, offer) {
    return offer.tids.map((tid, i) => {
      const o = 1 - i;
      const items = offer.give[o].pids.map(id => { const p = S.players[id]; return p ? `${nm(p)} (${p.pos}, ${p.ovr})` : '?'; })
        .concat(offer.give[o].picks.map(k => { const pk = Trade.findPick(S, k); return pk ? Trade.pickLabel(S, pk) + ' pick' : 'a pick'; }));
      return `${S.teams[tid].abbr} get ${items.length ? items.join(', ') : 'nothing'}`;
    }).join(' · ');
  };

  /** Execute a trade (validates first unless opts.force). */
  Trade.execute = function (S, offer, opts) {
    opts = opts || {};
    const ev = Trade.evaluate(S, offer);
    if (!opts.force && !ev.ok) return { ok: false, msg: ev.msg, ev };
    const u = userTid(S);
    const text = Trade.describe(S, offer);
    const rec = { season: S.season, day: S.day, phase: S.phase, tids: offer.tids.slice(), give: [], text, user: offer.tids.includes(u) };
    for (let i = 0; i < 2; i++) {
      const to = offer.tids[1 - i];
      const names = [];
      for (const pid of offer.give[i].pids) {
        const p = S.players[pid];
        if (PBC.Offseason) PBC.Offseason.removeFromTeam(S, p);
        p.tid = to;
        p.num = 0;
        PBC.Player.assignNumber(S, p);
        p.morale = Math.max(20, (p.morale == null ? 70 : p.morale) - 4);
        p.promise = null;
        names.push(nm(p));
      }
      for (const key of offer.give[i].picks) {
        const pk = Trade.findPick(S, key);
        if (!pk) continue;
        pk.owner = to;
        const d = S.draftState;
        if (d && d.year === pk.season && !d.done) for (const o of d.order) if (o.round === pk.round && o.orig === pk.orig && o.pid == null) o.owner = to;
        names.push(Trade.pickLabel(S, pk) + ' pick');
      }
      rec.give.push({ pids: offer.give[i].pids.slice(), picks: offer.give[i].picks.slice(), names });
    }
    bump(S);
    for (const tid of offer.tids) fixTeam(S, tid, u);
    S.trades = S.trades || [];
    S.trades.unshift(rec);
    if (S.trades.length > 150) S.trades.length = 150;
    if (S.offseason && OFFP[S.phase]) S.offseason.trades.push(rec);
    news(S, `🔄 TRADE: ${text}`, 'trade', rec.user ? u : offer.tids[0]);
    return { ok: true, rec, ev };
  };

  // ---------------------------------------------------------------------------
  // Helpers: auto-balance, "what would you want?", trade-block offers
  // ---------------------------------------------------------------------------
  function candidates(S, offer, idx) {
    const tid = offer.tids[idx];
    const inDeal = new Set(offer.give[idx].pids);
    const inPicks = new Set(offer.give[idx].picks);
    const players = PBC.League.roster(S, tid).filter(p => !inDeal.has(p.id) && !Trade.playerBlock(S, p));
    const picks = Trade.teamPicks(S, tid).filter(pk => !inPicks.has(Trade.pickKey(pk)));
    return { players, picks };
  }

  function hardErrors(ev) {
    return ev.errors.filter(e => !/Salaries don't match/.test(e) && !/would have/.test(e));
  }

  /**
   * Make the AI side accept by adding assets from side `payIdx` (the side that pays, usually the user = 0).
   * Also fixes salary matching with filler contracts. Returns { offer, ev } or null.
   */
  Trade.balance = function (S, offer, payIdx, opts) {
    opts = opts || {};
    payIdx = payIdx == null ? 0 : payIdx;
    const aiIdx = 1 - payIdx;
    let cur = Trade.clone(offer);
    const maxAdd = opts.maxAdd != null ? opts.maxAdd : 4;
    let added = 0;
    for (let iter = 0; iter < 10; iter++) {
      const ev = Trade.evaluate(S, cur);
      if (ev.ok) return { offer: cur, ev };
      if (hardErrors(ev).length) return null;
      const salBad = ev.sides.findIndex(s => !s.salaryOk);
      if (salBad >= 0) {
        // the team taking in too much salary sends out a filler contract (cheapest in value per dollar)
        const s = ev.sides[salBad];
        const needOut = (s.salIn - s.maxIn) / Trade.MATCH;
        const c = candidates(S, cur, salBad).players.filter(p => p.contract && p.contract.amt > 0);
        if (!c.length) return null;
        const fits = c.filter(p => p.contract.amt >= needOut);
        const pick = fits.length ? U.minBy(fits, p => Trade.playerValue(S, p, s.tid) + p.contract.amt / cfg(S).cap * 5) : U.maxBy(c, p => p.contract.amt);
        cur.give[salBad].pids.push(pick.id);
        continue;
      }
      if (ev.sides.some(s => !s.rosterOk)) return null;
      const ai = ev.sides[aiIdx];
      if (ai.accept || added >= maxAdd) return null;
      const gap = ai.need - ai.net + 0.3;
      const c = candidates(S, cur, payIdx);
      const opts2 = [];
      const without = cur.give[aiIdx].pids;
      for (const p of c.players) opts2.push({ kind: 'p', id: p.id, v: Trade.playerValue(S, p, ai.tid, { receiving: true, without }), cost: Trade.playerValue(S, p, cur.tids[payIdx]) });
      for (const pk of c.picks) opts2.push({ kind: 'k', id: Trade.pickKey(pk), v: Trade.pickValue(S, pk, ai.tid), cost: Trade.pickValue(S, pk, cur.tids[payIdx]) });
      const useful = opts2.filter(x => x.v > 0.4);
      if (!useful.length) return null;
      const closers = useful.filter(x => x.v >= gap);
      const choice = closers.length ? U.minBy(closers, x => x.cost + (x.v - gap) * 0.3) : U.maxBy(useful, x => x.v - x.cost * 0.2);
      if (choice.kind === 'p') cur.give[payIdx].pids.push(choice.id); else cur.give[payIdx].picks.push(choice.id);
      added++;
    }
    return null;
  };

  /** "What would you want for these players/picks?" — the AI builds a package from the user's side. */
  Trade.whatWouldYouWant = function (S, aiTid, wantPids, wantPicks) {
    const u = userTid(S);
    const offer = Trade.empty(u, aiTid);
    offer.give[1].pids = (wantPids || []).slice();
    offer.give[1].picks = (wantPicks || []).slice();
    return Trade.balance(S, offer, 0, { maxAdd: 5 });
  };

  /** AI teams' best offers for players the user puts on the block. Returns [{ offer, ev, gain }]. */
  Trade.shop = function (S, pids, picks, limit) {
    const u = userTid(S);
    if (u < 0) return [];
    const out = [];
    for (const t of S.teams) {
      if (t.id === u) continue;
      let cur = Trade.empty(u, t.id);
      cur.give[0].pids = (pids || []).slice();
      cur.give[0].picks = (picks || []).slice();
      let ev = Trade.evaluate(S, cur);
      if (hardErrors(ev).length) continue;
      // add the AI's assets the user would value most while the AI still says yes
      for (let k = 0; k < 3; k++) {
        const c = candidates(S, cur, 1);
        const without = cur.give[0].pids;
        const opts = c.players.map(p => ({ kind: 'p', id: p.id, v: Trade.playerValue(S, p, u, { receiving: true, without }) }))
          .concat(c.picks.map(pk => ({ kind: 'k', id: Trade.pickKey(pk), v: Trade.pickValue(S, pk, u) })))
          .filter(x => x.v > 1);
        let best = null;
        for (const x of U.sortBy(opts, x => x.v, true).slice(0, 14)) {
          const trial = Trade.clone(cur);
          if (x.kind === 'p') trial.give[1].pids.push(x.id); else trial.give[1].picks.push(x.id);
          let tev = Trade.evaluate(S, trial);
          let fixed = trial;
          if (!tev.ok && tev.sides.some(s => !s.salaryOk)) {
            const b = Trade.balance(S, trial, 0, { maxAdd: 0 });
            if (b) { fixed = b.offer; tev = b.ev; }
          }
          const ai = tev.sides[1];
          if (tev.ok && ai.net >= ai.need) { best = { offer: fixed, ev: tev }; break; }
        }
        if (!best) break;
        cur = best.offer; ev = best.ev;
      }
      if (!ev.ok || !(cur.give[1].pids.length + cur.give[1].picks.length)) continue;
      out.push({ offer: cur, ev, gain: ev.sides[0].net, tid: t.id });
    }
    return U.sortBy(out, x => x.gain, true).slice(0, limit || 5);
  };

  // ---------------------------------------------------------------------------
  // AI-to-AI trades
  // ---------------------------------------------------------------------------
  /** Try one AI-to-AI trade (a contender buys a veteran from a rebuilding team). Returns the result or null. */
  Trade.aiTradeTick = function (S) {
    if (!Trade.status(S).open) return null;
    const u = userTid(S);
    const ai = S.teams.map(t => t.id).filter(tid => tid !== u);
    const sellers = ai.filter(tid => Trade.teamMode(S, tid) === 'rebuild');
    const buyers = ai.filter(tid => Trade.teamMode(S, tid) === 'contend');
    if (!sellers.length || !buyers.length) return null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const seller = U.pick(sellers), buyer = U.pick(buyers);
      const vets = PBC.League.roster(S, seller).filter(p => p.age >= 26 && p.ovr >= 73 && !Trade.playerBlock(S, p) && !Trade.isCornerstone(S, p));
      if (!vets.length) continue;
      const target = U.pick(vets.slice(0, 4));
      const offer = Trade.empty(buyer, seller);
      offer.give[1].pids.push(target.id);
      const res = Trade.balance(S, offer, 0, { maxAdd: 3 });
      if (!res || !res.ev.ok) continue;
      const r = Trade.execute(S, res.offer);
      if (r.ok) return r;
    }
    return null;
  };

  /** Hook for the daily tick (Season.endDay): a few AI-to-AI deals before the deadline. */
  Trade.daily = function (S) {
    if (S.phase !== 'regular' || !Trade.status(S).open) return null;
    const done = (S.trades || []).filter(r => r.season === S.season && !r.user && r.phase === 'regular').length;
    if (done >= 8) return null;
    if (!U.chance(5 / Math.max(20, S.tradeDeadlineDay || 100))) return null;
    return Trade.aiTradeTick(S);
  };

  PBC.Trade = Trade;
})();
