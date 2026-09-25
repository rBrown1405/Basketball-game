/* Pro BBALL Coach - offseason UI shell. Defines PBC.OffUI (steps bar, cap card, player cells, meters, factor tags,
   contract offer dialog), registers the offseason phases behind the top-bar CONTINUE button and the Front Office nav
   links, and the Draft Lottery, Scouting and Offseason Report screens. Loads before draft.js, freeagency.js, trade.js. */
(function () {
  'use strict';
  const PBC = window.PBC;
  const U = PBC.U, C = PBC.Config, UI = PBC.UI;
  const Off = () => PBC.Offseason;
  const Dr = () => PBC.Draft;
  const cfg = S => PBC.League.cfg(S);
  const OU = (PBC.OffUI = PBC.OffUI || {});
  const OFFP = { draft_lottery: 1, draft: 1, resign: 1, freeagency: 1 };
  const here = key => UI.current().key === key;
  const nm = p => PBC.Player.name(p);

  // ---------------------------------------------------------------------------
  // Small helpers shared by the offseason screens
  // ---------------------------------------------------------------------------
  /** The team the user runs (-1 while unemployed: every team is AI-run). */
  OU.userTid = S => (S ? Off().userTid(S) : -1);
  OU.isOffseason = S => !!(S && OFFP[S.phase]);

  const STEPS = [
    { phase: 'draft_lottery', label: 'Lottery', screen: 'lottery' },
    { phase: 'draft', label: 'Draft', screen: 'draft' },
    { phase: 'resign', label: 'Re-sign', screen: 'resign' },
    { phase: 'freeagency', label: 'Free Agency', screen: 'freeagency' },
    { phase: 'preseason', label: 'New Season', screen: 'offseason' },
  ];
  /** Progress bar through the offseason (empty outside the offseason). Done steps link back to their screens. */
  OU.steps = function (S) {
    if (!OU.isOffseason(S)) return '';
    const cur = STEPS.findIndex(s => s.phase === S.phase);
    return `<div class="os-steps">${STEPS.map((s, i) => {
      const st = i < cur ? 'done' : i === cur ? 'on' : '';
      return `${i ? '<i class="os-step-bar"></i>' : ''}<div class="os-step ${st}"${i <= cur ? ` data-nav="${s.screen}"` : ''}><b>${i < cur ? '✓' : i + 1}</b>${s.label}</div>`;
    }).join('')}</div>`;
  };

  /** Avatar + clickable name + a small sub line. sub is HTML (callers escape their own text). */
  OU.pcell = function (p, sub, size) {
    if (!p) return '';
    if (sub == null) {
      const S = UI.S;
      const t = S && p.tid >= 0 ? S.teams[p.tid] : null;
      sub = `${p.pos} · ${p.age} yrs${t ? ' · ' + t.abbr : ''}${PBC.Player.isInjured(p) ? ' · <span class="bad-t">INJ</span>' : ''}`;
    }
    return `<span class="os-pc">${UI.avatar(p, size || 32)}<span class="os-pc-t">${UI.playerLink(p)}${sub ? `<span class="os-pc-s">${sub}</span>` : ''}</span></span>`;
  };

  /** "18.2 pts · 5.1 reb · 3.3 ast (64 gp)" for a season (default: the season just played). */
  OU.statLine = function (S, p, season) {
    const s = PBC.Stats.season(p, season != null ? season : S.season, false);
    if (!s || !s.gp) return '<span class="dim">no games played</span>';
    return `${U.num(s.pts / s.gp)} pts · ${U.num((s.orb + s.drb) / s.gp)} reb · ${U.num(s.ast / s.gp)} ast <span class="dim">(${s.gp} gp)</span>`;
  };

  OU.meterTone = v => (v >= 60 ? 'good' : v >= 45 ? '' : v >= 32 ? 'warn' : 'bad');
  /** Thin 0..100 meter (mood, interest, scouting knowledge). */
  OU.meter = function (v, tone) {
    const x = Math.round(U.clamp(+v || 0, 0, 100));
    return `<div class="meter os-meter"><div class="meter-fill ${tone != null ? tone : OU.meterTone(x)}" style="width:${x}%"></div></div>`;
  };

  /** Signed factor tags: [{ label, v }] -> "+6 Winning team" chips (strongest first). */
  OU.factors = function (list, n) {
    const f = (list || []).filter(x => x && x.v).slice(0, n || 4);
    if (!f.length) return '<span class="tiny dim">No strong feelings either way</span>';
    return f.map(x => `<span class="tag ${x.v > 0 ? 'good' : 'bad'}">${x.v > 0 ? '+' : ''}${x.v} ${U.esc(x.label)}</span>`).join('');
  };

  /** Payroll / cap space / roster tiles + a cap bar with cap, tax and apron markers. */
  OU.capCard = function (S, tid) {
    if (tid == null || tid < 0 || !S.teams[tid]) return '<div class="empty small">No team to manage right now.</div>';
    const O = Off(), L = cfg(S);
    const yr = O.capYear(S);
    const pay = O.payroll(S, tid);
    const dead = O.deadMoney(S, tid);
    const space = L.cap - pay;
    const off = OU.isOffseason(S) || S.phase === 'awards';
    const n = off ? O.committed(S, tid).length : PBC.League.roster(S, tid).length;
    const top = L.apron * 1.12;
    const at = x => U.clamp(x / top * 100, 0, 100).toFixed(1);
    const cls = pay > L.tax ? 'bad' : pay > L.cap ? 'warn' : '';
    const mle = S.fa && S.phase === 'freeagency' ? (S.fa.mle[tid] ? ' <span class="dim">(used)</span>' : ' <span class="good-t">(open)</span>') : '';
    return `<div class="os-cap-row">
        <div><div class="os-cap-v">${U.money(pay, true)}</div><div class="os-cap-l">Payroll ${U.seasonLabel(yr)}</div></div>
        <div><div class="os-cap-v ${space >= 0 ? 'good-t' : 'bad-t'}">${U.money(Math.abs(space), true)}</div><div class="os-cap-l">${space >= 0 ? 'Cap space' : 'Over the cap'}</div></div>
        <div><div class="os-cap-v ${n > L.rosterMax ? 'warn-t' : ''}">${n}<span class="dim" style="font-size:.62em">/${L.rosterMax}</span></div><div class="os-cap-l">${off ? 'Under contract' : 'Roster'}</div></div>
      </div>
      <div class="os-capbar" title="Payroll ${U.money(pay)}"><div class="os-capbar-f ${cls}" style="width:${at(pay)}%"></div>
        <i style="left:${at(L.cap)}%" title="Salary cap ${U.money(L.cap)}"></i><i style="left:${at(L.tax)}%" title="Luxury tax ${U.money(L.tax)}"></i><i style="left:${at(L.apron)}%" title="Apron ${U.money(L.apron)}"></i></div>
      <div class="os-cap-leg"><span>Cap <b>${U.money(L.cap, true)}</b></span><span>Tax <b>${U.money(L.tax, true)}</b></span><span>Apron <b>${U.money(L.apron, true)}</b></span>
        <span>MLE <b>${U.money(L.mle, true)}</b>${mle}</span>${dead ? `<span class="bad-t">Dead money <b>${U.money(dead, true)}</b></span>` : ''}</div>`;
  };

  // Draft helpers (lottery, draft board, scouting)
  OU.gradeCls = g => 'g-' + String(g).replace('+', 'p').replace('-', 'm');
  OU.grade = g => `<span class="dr-grade ${OU.gradeCls(g)}">${U.esc(g)}</span>`;
  /** A scouted range { lo, hi, err } as "64–72" (a single number once fully known). */
  OU.rng = r => (r.err ? `<span class="dr-rng">${r.lo}<i>–</i>${r.hi}</span>` : `<span class="dr-rng">${r.lo}</span>`);
  OU.known = k => `<div class="dr-known">${OU.meter(k, k >= 70 ? 'good' : k >= 35 ? '' : 'warn')}<span>${Math.round(k)}%</span></div>`;
  OU.pick = n => `<span class="os-pick">${n}</span>`;
  OU.mv = x => (x.moved > 0 ? `<span class="lt-mv up">▲ ${x.moved}</span>` : x.moved < 0 ? `<span class="lt-mv down">▼ ${-x.moved}</span>` : '');
  OU.star = p => { const on = !!(p.scout && p.scout.star); return `<button class="btn ghost sm sc-star ${on ? 'on' : ''}" data-pstar="${p.id}" title="Shortlist">${on ? '★' : '☆'}</button>`; };
  OU.toggleStar = function (S, pid) {
    const p = S.players[pid];
    if (!p) return;
    p.scout = p.scout || { pts: 0, known: 0 };
    p.scout.star = !p.scout.star;
    UI.save();
    UI.refresh();
  };

  /** Keep a UI.table's sort across re-renders: returns the options to pass and a function to store the new state. */
  OU.sortMemo = function (memo, key, sort, desc) {
    const m = memo[key];
    return { sort: m ? m.sort : sort, desc: m ? m.desc : desc, keep: tbl => { memo[key] = tbl.state; } };
  };

  // ---------------------------------------------------------------------------
  // Contract offer dialog (re-sign & free agency)
  // ---------------------------------------------------------------------------
  /**
   * opts: { title, p, ask (null = unknown), years, amt, allowOpt, note (HTML), preview(o) -> { tone, text },
   *         submitLabel, submit(o) -> { ok, msg, close } }   o = { amt, years, opt }
   * The dialog closes when submit returns ok (or close); otherwise the message stays in the preview box.
   */
  OU.offerDialog = function (o) {
    const S = UI.S;
    const L = cfg(S);
    const p = o.p;
    const O = Off();
    const min = L.minSalary;
    const max = PBC.Player.maxSalary(p, L);
    const unit = min >= 5e5 ? 1e4 : 1e3;
    const inc = unit * (min >= 5e5 ? 25 : 5);
    const fit = x => O.fitAmt(S, p, x);
    const st = { amt: fit(o.amt != null ? o.amt : o.ask != null ? o.ask : min), years: U.clamp(Math.round(o.years || 2), 1, 5), opt: false };
    const body = UI.h(`<div class="os-offer">
      <div class="row" style="flex-wrap:nowrap">${UI.avatar(p, 52)}
        <div style="flex:1;min-width:0"><div class="up" style="font-size:20px;line-height:1.1">${U.esc(nm(p))}</div>
          <div class="small muted">${p.pos} · ${p.age} yrs · ${U.plural(p.yearsPro || 0, 'season')} pro · max contract ${U.money(max)}</div></div>
        <div class="center">${UI.ovr(p.ovr, 'lg')}<div class="tiny dim">POT ${UI.potLabel(p)}</div></div></div>
      ${o.ask != null ? `<div class="kv" style="margin-top:12px"><span>Asking price</span><span>${U.money(o.ask)} /yr${o.years ? ' × ' + U.plural(o.years, 'yr') : ''}</span></div>` : ''}
      <div class="os-offer-f">
        <span class="os-lbl">Salary per season</span>
        <div class="row nowrap"><button class="btn" data-o="-" title="Less">−</button><div class="os-amt" data-o-amt></div><button class="btn" data-o="+" title="More">+</button></div>
        <input type="range" data-o-rng min="${min}" max="${max}" step="${unit}" style="width:100%">
        <div class="row tiny dim"><span>${U.money(min)} min</span><div class="spacer"></div>${o.ask != null ? '<button class="btn ghost sm" data-o="ask">Match the ask</button><div class="spacer"></div>' : ''}<span>${U.money(max)} max</span></div>
        <span class="os-lbl">Contract length</span>
        <div class="row"><div class="seg">${[1, 2, 3, 4, 5].map(y => `<button data-y="${y}">${y} yr${y > 1 ? 's' : ''}</button>`).join('')}</div>
          ${o.allowOpt ? '<label class="chk small"><input type="checkbox" data-o-opt> Player option on the final year</label>' : ''}</div>
        <div class="small muted" style="margin-top:10px" data-o-tot></div>
      </div>
      ${o.note ? `<p class="small muted" style="margin:12px 0 0">${o.note}</p>` : ''}
      <div class="os-preview" data-o-prev></div>
    </div>`);
    const $ = s => body.querySelector(s);
    const rng = $('[data-o-rng]'), amtEl = $('[data-o-amt]'), totEl = $('[data-o-tot]'), prevEl = $('[data-o-prev]'), optEl = $('[data-o-opt]');
    let msg = null;
    const sync = fromRange => {
      if (!fromRange) rng.value = st.amt;
      amtEl.textContent = U.money(st.amt);
      body.querySelectorAll('[data-y]').forEach(b => b.classList.toggle('on', +b.dataset.y === st.years));
      if (optEl) { optEl.disabled = st.years < 2; if (st.years < 2) optEl.checked = false; st.opt = !!optEl.checked; }
      totEl.innerHTML = `Total <b>${U.money(st.amt * st.years)}</b> over ${U.plural(st.years, 'season')}${st.opt ? ' · player option in the final year' : ''}`;
      let pv = msg;
      if (!pv && o.preview) { try { pv = o.preview({ amt: st.amt, years: st.years, opt: st.opt }); } catch (e) { console.error(e); } }
      prevEl.className = 'os-preview' + (pv && pv.tone ? ' ' + pv.tone : '');
      prevEl.textContent = pv && pv.text ? pv.text : '';
    };
    rng.addEventListener('input', () => { msg = null; st.amt = fit(+rng.value); sync(true); });
    UI.on(body, 'click', '[data-o]', (e, el) => {
      msg = null;
      const k = el.dataset.o;
      if (k === '+') st.amt = fit(st.amt + inc);
      if (k === '-') st.amt = fit(st.amt - inc);
      if (k === 'ask' && o.ask != null) { st.amt = fit(o.ask); if (o.years) st.years = U.clamp(Math.round(o.years), 1, 5); }
      sync();
    });
    UI.on(body, 'click', '[data-y]', (e, el) => { msg = null; st.years = +el.dataset.y; sync(); });
    if (optEl) optEl.addEventListener('change', () => { msg = null; sync(); });
    const m = UI.modal({
      title: U.esc(o.title || 'Contract offer'), body,
      actions: [
        { label: 'Cancel', cls: 'ghost' },
        {
          label: U.esc(o.submitLabel || 'Make Offer'), cls: 'primary',
          onClick: close => {
            let r = null;
            try { r = o.submit({ amt: st.amt, years: st.years, opt: st.opt }); } catch (e) { console.error(e); r = { ok: false, msg: 'Something went wrong. Try again.' }; }
            if (!r) { close(); return; }
            if (r.ok || r.close) { close(); if (r.msg) UI.toast(U.esc(r.msg), r.ok ? 'good' : 'bad'); return; }
            msg = { tone: 'bad', text: r.msg || 'Offer rejected.' };
            sync();
          },
        },
      ],
    });
    sync();
    return m;
  };

  // ---------------------------------------------------------------------------
  // Phase flow (top-bar CONTINUE)
  // ---------------------------------------------------------------------------
  function lotterySeen(S) {
    const d = S && S.draftState;
    return !!(d && (d.revealed || d.lotterySeen));
  }
  OU.lotterySeen = lotterySeen;

  OU.openMagazine = function (S) {
    try {
      const M = PBC.Magazine;
      if (M && M.shouldAutoOpen && typeof M.open === 'function' && M.shouldAutoOpen(S)) M.open(S);
    } catch (e) { console.error(e); }
  };

  OU.startDraft = async function (S) {
    ltStop();
    if (S.draftState) S.draftState.lotterySeen = true;
    const ok = await UI.busy('The draft is about to begin…', () => Off().startDraft(S));
    UI.save();
    UI.go('draft');
    if (ok && Dr().isUserTurn(S)) UI.toast('You’re on the clock! Pick a prospect from the big board.', 'info');
  };

  OU.startResign = async function (S) {
    await UI.busy('Opening the re-signing window…', () => Off().startResign(S));
    UI.save();
    UI.go('resign');
  };

  OU.startFreeAgency = async function (S) {
    const pend = S.resign ? Object.values(S.resign.pl).filter(R => R.status === 'pending').map(R => S.players[R.pid]).filter(Boolean) : [];
    if (pend.length) {
      const names = pend.slice(0, 4).map(p => `<b>${U.esc(nm(p))}</b>`).join(', ') + (pend.length > 4 ? ` and ${pend.length - 4} more` : '');
      const ok = await UI.confirm(`${U.plural(pend.length, 'player is', 'players are')} still undecided: ${names}.<p class="small muted" style="margin:10px 0 0">If you open free agency now they hit the open market. You can still recruit them there, but every other team can bid too.</p>`,
        { title: 'Open free agency?', ok: 'Open Free Agency', cancel: 'Keep Negotiating' });
      if (!ok) { if (!here('resign')) UI.go('resign'); return; }
    }
    await UI.busy('Free agency is opening…', () => Off().startFreeAgency(S));
    UI.save();
    UI.go('freeagency');
  };

  OU.endWeek = async function (S) {
    if (!S.fa || S.fa.done) return;
    const w = S.fa.week;
    const res = await UI.busy(`Wrapping up week ${w}…`, () => Off().faAdvance(S));
    UI.save();
    if (here('freeagency')) UI.refresh(); else UI.go('freeagency');
    if (res) OU.weekModal(S, res, w);
  };

  /** Results of one free-agency week (who signed where, what the user won or lost). */
  OU.weekModal = function (S, res, week) {
    const u = OU.userTid(S);
    const fa = S.fa;
    const pl = pid => S.players[pid];
    const mine = (res.mine || []).map(pl).filter(Boolean);
    const lost = (res.lost || []).map(pl).filter(Boolean);
    const log = U.sortBy((res.log || []).filter(x => pl(x.pid) && S.teams[x.tid]), x => pl(x.pid).ovr, true);
    const row = x => {
      const p = pl(x.pid), t = S.teams[x.tid];
      return `<div class="os-li ${x.tid === u ? 'me' : ''}">${UI.teamBadge(t, 26)}${OU.pcell(p, `${p.pos} · ${p.age} yrs · ${t.abbr}`, 30)}<span class="spacer"></span>${UI.ovr(p.ovr)}
        <span class="small nowrap" style="min-width:104px;text-align:right"><b>${U.money(x.amt)}</b> × ${x.years}${x.kind === 'mle' ? ' <span class="tag info">MLE</span>' : x.kind === 'min' ? ' <span class="tag">MIN</span>' : ''}</span></div>`;
    };
    const next = fa && !fa.done
      ? `Week ${fa.week} of ${fa.weeks} begins: your ${fa.apMax} action points are back, asking prices drop for anyone without an offer, and teams make new bids.`
      : 'The market is closed. Unsigned players will take in-season deals. Hit <b>Start New Season</b> once your roster is set.';
    const body = `${mine.length ? `<div class="lt-banner good">✍️ ${mine.map(p => U.esc(nm(p))).join(', ')} signed with you!</div>` : ''}
      ${lost.length ? `<div class="lt-banner bad">Lost out on ${lost.map(p => `${U.esc(nm(p))}${S.teams[p.tid] ? ' (' + S.teams[p.tid].abbr + ')' : ''}`).join(', ')}.</div>` : ''}
      <div class="os-h4">${log.length ? U.plural(log.length, 'signing') + ' this week' : 'A quiet week'}</div>
      <div class="card flat"><div class="card-b flush">${log.length ? log.map(row).join('') : '<div class="empty small">Nobody signed. The top names are still weighing their options.</div>'}</div></div>
      <p class="small muted" style="margin:12px 0 0">${next}</p>`;
    UI.modal({ title: `Free agency · week ${week} results`, body, wide: log.length > 6, actions: [{ label: fa && !fa.done ? `On to Week ${fa.week}` : 'Got It', cls: 'primary' }] });
  };

  OU.finish = async function (S) {
    const O = Off();
    const chk = O.canFinish(S);
    if (!chk.ok) {
      UI.toast(U.esc(chk.msg), 'bad');
      UI.go('freeagency', { tab: 'roster' });
      return;
    }
    const L = cfg(S), u = OU.userTid(S);
    const n = u >= 0 ? PBC.League.roster(S, u).length : 0;
    const fill = u >= 0 && n < L.rosterMin ? `<p class="small" style="margin:10px 0 0">You have ${U.plural(n, 'player')}: your front office will sign ${L.rosterMin - n} minimum-salary free agent${L.rosterMin - n === 1 ? '' : 's'} to reach ${L.rosterMin}.</p>` : '';
    const ok = await UI.confirm(`Free agency closes and training camps open for the <b>${U.seasonLabel(S.season + 1)}</b> season.${fill}<p class="small muted" style="margin:10px 0 0">Unsigned free agents drop their asking prices and stay available for in-season deals.</p>`,
      { title: 'Start the new season?', ok: 'Start New Season' });
    if (!ok) return;
    const done = await UI.busy('Training camps are opening…', () => O.finish(S));
    if (!done) { UI.toast('The offseason can’t be closed yet.', 'bad'); UI.refresh(); return; }
    UI.save();
    UI.go('offseason');
    UI.toast(`Welcome to the ${U.seasonLabel(S.season)} season!`, 'good');
    OU.openMagazine(S);
  };

  /** The assistant GM runs whatever is left of the offseason. */
  OU.autoAll = async function (S) {
    const ok = await UI.confirm('Let your assistant GM run the rest of the offseason? Your picks, re-signings and free-agent bids are made for you, and the new season starts right after.', { title: 'Sim to the new season', ok: 'Sim Offseason' });
    if (!ok) return;
    ltStop();
    if (S.draftState) S.draftState.lotterySeen = true;
    if (OU.draftStop) OU.draftStop();
    await UI.busy('Your front office is running the offseason…', () => Off().autoAll(S));
    UI.save();
    if (S.phase === 'preseason') { UI.go('offseason'); OU.openMagazine(S); } else UI.refresh();
  };

  UI.registerPhase('draft_lottery', {
    screen: 'lottery',
    label: S => (lotterySeen(S) ? 'Start the Draft' : 'Draft Lottery'),
    run: S => {
      if (lotterySeen(S)) return OU.startDraft(S);
      if (!here('lottery')) { UI.go('lottery'); return; }
      ltNow();
    },
  });
  UI.registerPhase('draft', {
    screen: 'draft',
    label: S => Off().nextLabel(S) || 'Draft',
    run: S => {
      const d = Dr().state(S);
      if (!d || d.done) return OU.startResign(S);
      if (OU.draftAction) return OU.draftAction(S);
      // no draft board loaded: plain simulation
      if (!here('draft')) UI.go('draft');
      if (Dr().isUserTurn(S)) { UI.toast('You’re on the clock!', 'info'); return; }
      if (Dr().userPicksLeft(S)) Dr().simToUser(S); else Dr().simAll(S);
      UI.save();
      UI.refresh();
    },
  });
  UI.registerPhase('resign', { screen: 'resign', label: S => Off().nextLabel(S) || 'Open Free Agency', run: S => OU.startFreeAgency(S) });
  UI.registerPhase('freeagency', {
    screen: 'freeagency',
    label: S => Off().nextLabel(S) || 'Start New Season',
    run: S => (S.fa && !S.fa.done ? OU.endWeek(S) : OU.finish(S)),
  });

  // in-page copies of the CONTINUE button
  document.addEventListener('click', e => {
    const b = e.target && e.target.closest && e.target.closest('[data-os-cont]');
    if (!b) return;
    const c = UI.continueInfo();
    if (c) c.run();
  });
  OU.contBtn = function (cls) {
    const c = UI.continueInfo();
    return c ? `<button class="btn primary ${cls || ''}" data-os-cont>${U.esc(c.label)} ▸</button>` : '';
  };
  // shortlist stars (big board, scouting)
  document.addEventListener('click', e => {
    const b = e.target && e.target.closest && e.target.closest('[data-pstar]');
    if (b && UI.S) { e.stopPropagation(); OU.toggleStar(UI.S, +b.dataset.pstar); }
  });

  // ---------------------------------------------------------------------------
  // Nav (group "Front Office")
  // ---------------------------------------------------------------------------
  const safe = f => S => { try { return !!f(S); } catch (e) { return false; } };
  const pendingResign = S => (S.resign ? Object.values(S.resign.pl).filter(R => R.status === 'pending').length : 0);
  UI.addNav({ key: 'lottery', label: 'Draft Lottery', icon: '🎰', group: 'Front Office', show: safe(S => (S.phase === 'draft_lottery' || S.phase === 'draft') && S.draftState), dot: safe(S => S.phase === 'draft_lottery' && !lotterySeen(S)) });
  UI.addNav({ key: 'draft', label: 'Draft', icon: '🧢', group: 'Front Office', show: safe(S => OFFP[S.phase] && S.draftState), dot: safe(S => Dr().isUserTurn(S)) });
  UI.addNav({ key: 'resign', label: 'Re-sign Players', icon: '✍️', group: 'Front Office', show: safe(S => S.phase === 'resign'), dot: safe(S => pendingResign(S) > 0) });
  UI.addNav({ key: 'freeagency', label: 'Free Agents', icon: '🖊️', group: 'Front Office' });
  UI.addNav({ key: 'trade', label: 'Trades', icon: '🔄', group: 'Front Office' });
  UI.addNav({ key: 'scouting', label: 'Scouting', icon: '🔭', group: 'Front Office', show: safe(S => PBC.League.prospects(S).length), dot: safe(S => Dr().canScout(S) && Dr().points(S) >= Dr().BANK_MAX) });
  UI.addNav({ key: 'offseason', label: 'Offseason Report', icon: '📋', group: 'Front Office', show: safe(S => S.offseason || S.lastOffseason) });

  // ---------------------------------------------------------------------------
  // Draft Lottery
  // ---------------------------------------------------------------------------
  // The reveal runs from the last lottery pick up to #1 (the top cards get a drum roll). A click anywhere on the
  // screen (or CONTINUE) reveals everything at once; the result is remembered on S.draftState.lotterySeen.
  const lt = { S: null, year: 0, upTo: 0, drum: 0, running: false, timer: null };
  const ltBig = d => Math.min(4, d.lottery.teams.length);

  function ltReset(S, d) {
    clearTimeout(lt.timer);
    Object.assign(lt, { S, year: d.year, upTo: d.lottery.teams.length + 1, drum: 0, running: false, timer: null });
  }
  function ltStop() {
    clearTimeout(lt.timer);
    lt.timer = null;
    lt.running = false;
    lt.drum = 0;
  }
  const ltEl = sel => document.querySelector('#screen ' + sel);

  function ltStart() {
    lt.timer = null;
    const S = UI.S, d = S && S.draftState;
    if (!d || S !== lt.S || !here('lottery') || lotterySeen(S)) return;
    lt.running = true;
    ltStep();
  }

  function ltStep() {
    lt.timer = null;
    const S = UI.S, d = S && S.draftState;
    if (!d || S !== lt.S || d.year !== lt.year || !here('lottery')) { ltStop(); return; }
    const next = lt.upTo - 1;
    if (next < 1) { ltDone('anim'); return; }
    const big = next <= ltBig(d);
    const el = ltEl(`.lt-card[data-pk="${next}"]`);
    if (big && lt.drum !== next) {
      lt.drum = next;
      if (el) el.classList.add('drum');
      lt.timer = setTimeout(ltStep, next === 1 ? 1500 : 1000);
      return;
    }
    lt.drum = 0;
    lt.upTo = next;
    if (el) { el.classList.remove('drum'); el.classList.add('rev'); }
    const x = d.lottery.teams.find(t => t.pick === next);
    const cell = x && ltEl(`[data-lt-res="${x.tid}"]`);
    if (cell) cell.innerHTML = ltResult(x);
    lt.timer = setTimeout(ltStep, big ? 850 : 320);
  }

  /** mode: 'anim' (the reveal finished), 'now' (instant reveal), 'leave' (navigated away mid-show). */
  function ltDone(mode) {
    ltStop();
    lt.upTo = 1;
    const S = UI.S, d = S && S.draftState;
    if (d && !d.lotterySeen) { d.lotterySeen = true; UI.save(); }
    if (mode === 'leave') return;
    document.querySelectorAll('#screen .lt-card').forEach(el => { el.classList.remove('drum'); el.classList.add('rev'); });
    setTimeout(() => { if (here('lottery')) UI.refresh(); else if (UI.S) UI.renderTopbar(); }, mode === 'now' ? 800 : 650);
  }

  function ltNow() {
    const S = UI.S, d = S && S.draftState;
    if (!d || lotterySeen(S)) return;
    if (lt.S !== S || lt.year !== d.year) ltReset(S, d);
    ltDone('now');
  }

  const ltResult = x => `${OU.pick(x.pick)} ${OU.mv(x)}`;

  /** Who owns a lottery team's first-rounder now (picks can change hands once the draft opens). */
  function ltOwner(d, x) {
    const o = d.order.find(q => q.round === 1 && q.orig === x.tid);
    return o ? o.owner : x.owner;
  }

  function ltBanner(S, d, u) {
    if (u < 0) return '<div class="lt-banner">The draft order is set.</div>';
    const mine = U.sortBy(d.lottery.teams.filter(x => ltOwner(d, x) === u), x => x.pick);
    const via = x => (x.tid !== u ? ` (via ${S.teams[x.tid].abbr})` : '');
    if (mine.length) {
      const x = mine[0];
      if (x.pick === 1) return `<div class="lt-banner gold">🎉 Jackpot! You won the #1 pick in the ${d.year} draft${via(x)}!</div>`;
      if (x.moved > 0) return `<div class="lt-banner good">📈 Lottery luck: you jumped from #${x.seed} to #${x.pick}${via(x)}.</div>`;
      if (x.moved < 0) return `<div class="lt-banner bad">📉 Tough break: you slid from #${x.seed} to #${x.pick}${via(x)}.</div>`;
      return `<div class="lt-banner">You hold the #${x.pick} pick${via(x)}. The balls didn’t move you.</div>`;
    }
    const first = d.order.find(o => o.owner === u && o.round === 1);
    return `<div class="lt-banner">${first ? `Not in the lottery this year. Your first-round pick is #${first.pick}${first.orig !== u ? ' (via ' + S.teams[first.orig].abbr + ')' : ''}.` : 'You don’t own a first-round pick this year. Trades can change that.'}</div>`;
  }

  UI.register('lottery', {
    title: 'Draft Lottery',
    render(root) {
      const S = UI.S;
      const d = S.draftState;
      if (!d || !d.lottery) {
        root.innerHTML = `<div class="page os">${OU.steps(S)}<div class="page-h"><div><h1>Draft Lottery</h1></div></div>
          <div class="card"><div class="empty">The lottery is held when the offseason begins. The teams that miss the playoffs get a shot at the #1 pick.</div></div></div>`;
        return;
      }
      const u = OU.userTid(S);
      const live = S.phase === 'draft_lottery' && d.year === S.season + 1;
      const seen = !live || lotterySeen(S);
      if (!seen && (lt.S !== S || lt.year !== d.year)) ltReset(S, d);
      const upTo = seen ? 1 : lt.upTo;
      const lot = d.lottery;
      const n = lot.teams.length;
      const bigN = ltBig(d);
      const byPick = {};
      lot.teams.forEach(x => { byPick[x.pick] = x; });
      const card = k => {
        const x = byPick[k];
        if (!x) return '';
        const ow = ltOwner(d, x);
        const own = S.teams[ow], orig = S.teams[x.tid];
        const big = k <= bigN;
        const cls = ['lt-card', big ? 'big' : '', k >= upTo ? 'rev' : '', !seen && lt.drum === k ? 'drum' : '', ow === u ? 'mine' : ''].join(' ');
        return `<div class="${cls}" data-pk="${k}" style="--tc:${own.colors.primary};--tc2:${own.colors.secondary}"><div class="lt-in">
          <div class="lt-front"><div class="lt-env">${k === 1 ? '🏆' : '✉️'}</div><div class="lt-no">${k}</div><div class="lt-nm">${k === 1 ? 'The top pick' : U.ordinal(k) + ' pick'}</div></div>
          <div class="lt-back"><span class="lt-no sm">${k}</span>${UI.teamBadge(own, big ? 64 : 42)}<div class="lt-nm">${U.esc(own.city)}<br><b>${U.esc(own.name)}</b></div>
            <div class="row" style="gap:6px;justify-content:center">${OU.mv(x)}${ow !== x.tid ? `<span class="tiny muted">via ${orig.abbr}</span>` : ''}</div></div>
        </div></div>`;
      };
      const picks = Array.from({ length: n }, (x, i) => i + 1);
      const draws = lot.draws;
      const odds1 = lot.teams[0] ? lot.teams[0].odds : 0;
      const how = draws > 1
        ? `The ${n} teams that missed the playoffs are in the lottery. The top ${draws} picks are drawn with weighted odds: the worst records have the best chance (${odds1}% at #1). The other lottery teams follow in reverse order of record, then the playoff teams. Nobody drops more than ${draws} spots.`
        : `The ${n} worst non-playoff teams are in the lottery and a single draw decides the #1 pick (${odds1}% for the worst record). Everyone else picks in reverse order of record.`;
      const r1 = d.order.filter(o => o.round === 1);
      const orderHtml = `<div class="lt-order">${r1.map(o => {
        const t = S.teams[o.owner];
        return `<div class="lt-ord ${o.owner === u ? 'me' : ''}">${OU.pick(o.pick)}${UI.teamBadge(t, 22)}<span class="ellip" style="flex:1;min-width:0">${U.esc(t.city)} ${U.esc(t.name)}</span>${o.orig !== o.owner ? `<span class="tiny dim">via ${S.teams[o.orig].abbr}</span>` : ''}</div>`;
      }).join('')}</div>`;
      root.innerHTML = `<div class="page os">
        ${OU.steps(S)}
        <div class="page-h"><div><h1>${d.year} Draft Lottery</h1><div class="sub">${n} teams in the lottery · ${draws > 1 ? `the top ${draws} picks are drawn` : 'the #1 pick is drawn'} · everyone else picks in reverse order of record</div></div>
          <div class="actions">${live && seen ? OU.contBtn('lg') : live ? '<button class="btn" data-lt="now">⏭ Reveal All</button>' : ''}</div></div>
        ${seen ? ltBanner(S, d, u) : '<div class="lt-banner">🎰 The lottery balls are bouncing… click anywhere to reveal the order instantly.</div>'}
        <div class="card"><div class="card-b" style="padding-top:16px">
          <div class="lt-top">${picks.filter(k => k <= bigN).map(card).join('')}</div>
          ${n > bigN ? `<div class="lt-rest">${picks.filter(k => k > bigN).map(card).join('')}</div>` : ''}
        </div></div>
        <div class="grid g2" style="margin-top:16px">
          <div class="card"><div class="card-h"><h3>Lottery odds</h3><div class="actions"><span class="small muted">chance at #1 · in the top ${draws}</span></div></div><div class="card-b flush"><div class="tbl-wrap"><table class="tbl compact">
            <thead><tr><th>Seed</th><th>Team</th><th class="num">Record</th><th class="num">#1</th><th class="num">Top ${draws}</th><th class="num">Result</th></tr></thead>
            <tbody>${lot.teams.map(x => {
              const ow = ltOwner(d, x);
              const t = S.teams[x.tid], own = S.teams[ow];
              return `<tr class="${ow === u ? 'me' : ''}"><td class="rank">${x.seed}</td><td>${UI.teamBadge(t, 20)} ${UI.teamLink(t, t.name)}${ow !== x.tid ? ` <span class="tiny dim">→ ${own.abbr}</span>` : ''}</td>
                <td class="num">${x.rec}</td><td class="num">${x.odds.toFixed(1)}%</td><td class="num dim">${x.top.toFixed(1)}%</td><td class="num nowrap" data-lt-res="${x.tid}">${x.pick >= upTo ? ltResult(x) : '<span class="dim">?</span>'}</td></tr>`;
            }).join('')}</tbody></table></div></div></div>
          <div class="card"><div class="card-h"><h3>${seen ? 'First-round order' : 'How the lottery works'}</h3></div>
            <div class="card-b">${seen ? orderHtml : `<p class="small" style="margin:0;line-height:1.6">${how}</p><p class="small muted">Traded picks go to the team that owns them. Once the order is set, the draft opens and trading picks is allowed again.</p>`}</div></div>
        </div></div>`;
      // a click anywhere (or the button) reveals instantly
      root.addEventListener('click', e => {
        if (lotterySeen(S) || !live) return;
        if (e.target.closest('[data-nav],[data-open-player],[data-open-team]')) return;
        ltNow();
      });
      if (live && !seen && !lt.running && !lt.timer) lt.timer = setTimeout(ltStart, 900);
    },
    onLeave() {
      if (lt.running) ltDone('leave');
      else ltStop();
    },
  });

  // ---------------------------------------------------------------------------
  // Scouting
  // ---------------------------------------------------------------------------
  const sc = { pid: null, tab: 'all', pos: 'all', memo: {} };

  function scoutBtn(S, p, a, can, pts, label) {
    const s = p.scout || {};
    const done = !!(a.once && s[a.key]);
    const n = !a.once && typeof s[a.key] === 'number' ? s[a.key] : 0;
    const full = !a.once && (s.known || 0) >= 100;
    const dis = !can || done || full || pts < a.cost;
    const tip = `${a.label} (${a.cost} pt${a.cost > 1 ? 's' : ''}): ${a.desc}`;
    return `<button class="btn sm ${label ? '' : 'sc-ico'} ${done ? 'done' : ''}" data-scout="${a.key}" data-pid="${p.id}" title="${U.esc(tip)}" ${dis ? 'disabled' : ''}>${a.icon}${label ? ' ' + U.esc(a.label) : ''}<i class="sc-cost">${done ? '✓' : a.cost}</i>${n ? `<i class="fa-act-n">×${n}</i>` : ''}</button>`;
  }

  function projLabel(S, p) {
    const L = cfg(S), n = S.teams.length;
    const r = p.draft && p.draft.rank ? p.draft.rank : 99;
    return r <= L.lotteryTeams ? 'Lottery pick' : r <= n ? '1st round' : r <= n * L.draftRounds ? `${U.ordinal(Math.ceil(r / n))} round` : 'Likely undrafted';
  }

  function persHtml(p) {
    const pe = p.pers || {};
    const w = Dr().traitWord;
    return `<span class="tag">Work ethic: ${w(pe.work)}</span><span class="tag">Ego: ${w(pe.ego)}</span><span class="tag">Loyalty: ${w(pe.loyal)}</span><span class="tag info">Driven by ${U.esc(Off().topMotive(p))}</span>`;
  }

  function reportHtml(S, p, can, pts) {
    const D = Dr();
    const v = D.view(S, p);
    const dur = v.durability;
    const strengths = v.strengths ? (v.strengths.map(x => `<span class="tag good">${U.esc(x)}</span>`).join('') + (v.weaknesses || []).map(x => `<span class="tag bad">${U.esc(x)}</span>`).join('')) || '<span class="tiny dim">Nothing stands out yet</span>' : '<span class="tiny dim">Attend a game (or keep scouting) to find out</span>';
    return `<div class="card accent sc-report"><div class="card-b" style="padding-top:14px">
      <div class="row" style="flex-wrap:nowrap">${UI.avatar(p, 60)}<div style="flex:1;min-width:0"><div class="up" style="font-size:22px;line-height:1.05">${UI.playerLink(p)}</div>
        <div class="small muted">${p.pos} · ${p.age} yrs · ${U.height(p.hgt)} · ${p.wgt} lbs</div><div class="tiny dim ellip">${U.esc(p.origin || '')}</div></div>
        <div class="center">${OU.grade(v.grade)}<div class="tiny dim" style="margin-top:5px">Board #${p.draft.rank || '-'}</div></div></div>
      <div class="kv fa-kv">
        <span>Current rating</span><span>${OU.rng(v.ovr)}</span>
        <span>Potential</span><span>${OU.rng(v.pot)}</span>
        <span>Media projection</span><span>${projLabel(S, p)}</span>
        <span>Scouting points spent</span><span>${(p.scout && p.scout.pts) || 0}</span>
      </div>
      <span class="os-lbl">What you know · ${v.known}%</span>${OU.meter(v.known, v.known >= 70 ? 'good' : v.known >= 35 ? '' : 'warn')}
      <span class="os-lbl">Strengths & weaknesses</span><div class="rs-f">${strengths}</div>
      <span class="os-lbl">Personality</span><div class="rs-f">${v.pers ? persHtml(p) : '<span class="tiny dim">An interview reveals work ethic, ego, loyalty and motivation</span>'}</div>
      <span class="os-lbl">Medical</span><div class="small">${dur != null ? (dur < 55 ? `<span class="bad-t bold">🚩 Injury-prone</span> <span class="dim">(durability ${dur})</span>` : dur >= 80 ? `<span class="good-t bold">Very durable</span> <span class="dim">(durability ${dur})</span>` : `No major concerns <span class="dim">(durability ${dur})</span>`) : '<span class="tiny dim">No physical yet</span>'}</div>
      <div class="fa-acts">${D.SCOUT_ACTIONS.map(a => scoutBtn(S, p, a, can, pts, true)).join('')}</div>
    </div></div>`;
  }

  function myPicksHtml(S, u) {
    const D = Dr();
    if (u < 0) return '';
    const n = S.teams.length;
    const d = D.state(S);
    let rows;
    if (d && !(S.phase === 'draft_lottery' && !lotterySeen(S))) {
      rows = d.order.filter(o => o.owner === u).map(o => {
        const p = o.pid != null ? S.players[o.pid] : null;
        return `<div class="os-li">${OU.pick(o.overall)}<div style="flex:1;min-width:0"><div class="small bold">Round ${o.round}, pick ${o.pick}${o.orig !== u ? ` <span class="dim">via ${S.teams[o.orig].abbr}</span>` : ''}</div>${p ? `<div class="tiny">${UI.playerLink(p)} <span class="dim">${p.pos}</span></div>` : ''}</div>${p ? UI.ovr(p.ovr) : '<span class="tag">exact</span>'}</div>`;
      });
    } else {
      const year = S.season + 1;
      rows = U.sortBy(S.draftPicks.filter(pk => pk.season === year && pk.owner === u), pk => pk.round * 100 + pk.orig).map(pk => {
        const slot = D.projectedSlot(S, pk);
        const overall = Math.max(1, Math.round(slot + (pk.round - 1) * n));
        return `<div class="os-li"><span class="os-pick">~${overall}</span><div style="flex:1;min-width:0"><div class="small bold">${U.ordinal(pk.round)} round${pk.orig !== u ? ` <span class="dim">via ${S.teams[pk.orig].abbr}</span>` : ''}</div><div class="tiny dim">${S.phase === 'draft_lottery' ? 'set by the lottery' : 'projected from record & roster'}</div></div><span class="tag">proj.</span></div>`;
      });
    }
    return `<div class="card"><div class="card-h"><h3>Your picks</h3><div class="actions"><span class="small muted">${d ? d.year : S.season + 1} draft</span></div></div><div class="card-b flush">${rows.length ? rows.join('') : '<div class="empty small">You don’t own a pick in this draft.</div>'}</div></div>`;
  }

  UI.register('scouting', {
    title: 'Scouting',
    render(root) {
      const S = UI.S;
      const D = Dr();
      const u = OU.userTid(S);
      const all = D.classOf(S);
      const year = S.season + 1;
      const can = D.canScout(S);
      const sco = D.scouting(S);
      const pts = sco.pts;
      if (!all.length) {
        root.innerHTML = `<div class="page os">${OU.steps(S)}<div class="page-h"><div><h1>Scouting</h1><div class="sub">Prospects for the ${year} draft</div></div></div>
          <div class="card"><div class="empty">No prospects to scout right now. The next draft class arrives when the new season starts.</div></div></div>`;
        return;
      }
      if (!sc.pid || !all.some(p => p.id === sc.pid)) sc.pid = all[0].id;
      const rows0 = all.map(p => ({ p, v: D.view(S, p) }));
      const starred = rows0.filter(r => r.p.scout && r.p.scout.star);
      let rows = sc.tab === 'star' ? starred : rows0;
      if (sc.pos !== 'all') rows = rows.filter(r => r.p.pos === sc.pos);
      const scouted = rows0.filter(r => (r.p.scout && r.p.scout.pts) > 0).length;
      const note = !can ? (u < 0 ? 'You need a job before your scouts go to work.' : 'Your scouts are off until the new draft class is set.')
        : `Scouting points: +${D.weeklyScoutingPoints(S)} a week during the season (bank up to ${D.BANK_MAX}), plus ${D.PREDRAFT_POINTS} for pre-draft workouts when the offseason begins.${pts >= D.BANK_MAX ? ' <span class="warn-t bold">Your bank is full: spend points or lose them.</span>' : ''}`;
      root.innerHTML = `<div class="page os">
        ${OU.steps(S)}
        <div class="page-h"><div><h1>Scouting</h1><div class="sub">${year} draft class · ${all.length} prospects · ${U.plural(scouted, 'prospect')} scouted by your staff</div></div>
          <div class="actions">${S.phase === 'draft' ? '<button class="btn" data-nav="draft">🧢 Draft Board</button>' : ''}<div class="sc-pts"><div class="v">${pts}</div><div class="l">${can ? 'Scouting points' : 'Scouts are off'}</div></div></div></div>
        <div class="card"><div class="card-b" style="padding-top:14px">
          <div class="sc-acts">${D.SCOUT_ACTIONS.map(a => `<div class="sc-act"><span class="sc-act-i">${a.icon}</span><div style="min-width:0"><div class="bold small">${U.esc(a.label)} <i class="sc-cost">${a.cost} pt${a.cost > 1 ? 's' : ''}</i>${a.once ? ' <span class="tag">once</span>' : ''}</div><div class="tiny muted">${U.esc(a.desc)}</div></div></div>`).join('')}</div>
          <p class="hint" style="margin:10px 0 0">${note}</p>
        </div></div>
        <div class="grid g-main" style="margin-top:16px">
          <div class="card"><div class="card-h"><div class="tabs">${[['all', `Big Board (${all.length})`], ['star', `★ Shortlist (${starred.length})`]].map(([k, l]) => `<button class="tab ${sc.tab === k ? 'active' : ''}" data-sctab="${k}">${l}</button>`).join('')}</div>
            <div class="actions"><div class="seg">${['all'].concat(C.POSITIONS).map(pz => `<button class="${sc.pos === pz ? 'on' : ''}" data-scpos="${pz}">${pz === 'all' ? 'All' : pz}</button>`).join('')}</div></div></div>
            <div class="card-b flush" id="sc-tbl"></div></div>
          <div class="stack fa-side">
            ${reportHtml(S, S.players[sc.pid], can, pts)}
            ${myPicksHtml(S, u)}
          </div>
        </div></div>`;
      const m = OU.sortMemo(sc.memo, 'board', 'rank', false);
      const quick = Dr().SCOUT_ACTIONS.filter(a => !a.once);   // repeatable actions on the board, one-time ones in the report
      const tbl = UI.table(root.querySelector('#sc-tbl'), {
        rows, sort: m.sort, desc: m.desc, compact: true,
        rowClass: r => (r.p.id === sc.pid ? 'fa-selrow' : ''),
        empty: sc.tab === 'star' ? 'Star prospects to add them to your shortlist.' : 'No prospects at this position.',
        columns: [
          { key: 'rank', label: '#', num: true, value: r => r.p.draft.rank || 999, fmt: r => `<span class="dim">${r.p.draft.rank || '-'}</span>`, title: 'Media big board' },
          { key: 'star', label: '★', nosort: true, fmt: r => OU.star(r.p) },
          { key: 'name', label: 'Prospect', value: r => r.p.last, fmt: r => OU.pcell(r.p, `${r.p.pos} · ${r.p.age} yrs · ${U.height(r.p.hgt)}`, 30) },
          { key: 'ovr', label: 'OVR', num: true, value: r => r.v.ovr.est, fmt: r => OU.rng(r.v.ovr) },
          { key: 'pot', label: 'POT', num: true, value: r => r.v.pot.est, fmt: r => OU.rng(r.v.pot) },
          { key: 'grade', label: 'Grade', value: r => r.v.pot.est, fmt: r => OU.grade(r.v.grade) },
          { key: 'known', label: 'Known', value: r => r.v.known, fmt: r => OU.known(r.v.known) },
          { key: 'act', label: 'Scout', nosort: true, fmt: r => `<span class="sc-btns">${quick.map(a => scoutBtn(S, r.p, a, can, pts, false)).join('')}</span>` },
        ],
        onRow: r => { sc.pid = r.p.id; UI.refresh(); },
      });
      m.keep(tbl);
      UI.on(root, 'click', '[data-sctab]', (e, el) => { sc.tab = el.dataset.sctab; UI.refresh(); });
      UI.on(root, 'click', '[data-scpos]', (e, el) => { sc.pos = el.dataset.scpos; UI.refresh(); });
      UI.on(root, 'click', '[data-scout]', (e, el) => {
        e.stopPropagation();
        const pid = +el.dataset.pid;
        const r = D.scout(S, pid, el.dataset.scout);
        UI.toast(U.esc(r.msg), r.ok ? 'good' : 'bad');
        if (r.ok) { sc.pid = pid; UI.save(); }
        UI.refresh();
      });
    },
  });

  // ---------------------------------------------------------------------------
  // Offseason Report
  // ---------------------------------------------------------------------------
  function yrsLeft(S, p) {
    if (!p.contract) return 0;
    return Math.max(0, p.contract.exp - S.season + (OU.isOffseason(S) || S.phase === 'awards' ? 0 : 1));
  }
  const dealTxt = (S, p) => (p && p.contract && p.tid >= 0 ? `${U.money(p.contract.amt)} × ${U.plural(Math.max(1, yrsLeft(S, p)), 'yr')}` : '');
  const whereNow = (S, p) => (p.tid >= 0 ? `now with ${S.teams[p.tid].abbr}` : p.tid === -1 ? 'unsigned' : p.tid === -3 ? (p.retired && p.retired.reason === 'overseas' ? 'went overseas' : 'retired') : '');

  UI.register('offseason', {
    title: 'Offseason Report',
    render(root) {
      const S = UI.S;
      const live = !!S.offseason && OU.isOffseason(S);
      const sum = live ? S.offseason : (S.lastOffseason || S.offseason);
      const u = OU.userTid(S);
      if (!sum) {
        root.innerHTML = `<div class="page os"><div class="page-h"><div><h1>Offseason Report</h1></div></div>
          <div class="card"><div class="empty">The offseason report fills in once the season is over: development, retirements, the draft, re-signings, free agency and trades.</div></div></div>`;
        return;
      }
      const pl = pid => S.players[pid];
      const list = arr => (arr || []).map(pl).filter(Boolean);
      const d = S.draftState && S.draftState.year === sum.season + 1 ? S.draftState : null;
      const drafted = d ? d.order.filter(o => o.pid != null && pl(o.pid)) : [];
      const myDraft = drafted.filter(o => o.owner === u);
      const signings = (sum.signings || []).filter(x => pl(x.pid) && S.teams[x.tid]);
      const mySign = signings.filter(x => x.tid === u);
      const trades = sum.trades || [];
      const myTrades = trades.filter(r => r.tids && r.tids.includes(u));
      const retired = U.sortBy(list(sum.retired), p => p.ovr, true);
      const L = cfg(S);
      const next = sum.season + 1;
      const liEmpty = t => `<div class="empty small">${t}</div>`;

      // --- the user's summer ---
      const secs = [];
      if (myDraft.length) secs.push(['Drafted', myDraft.map(o => { const p = pl(o.pid); return `<div class="os-li">${OU.pick(o.overall)}${OU.pcell(p, `${p.pos} · ${p.age} yrs · ${U.esc(p.origin || '')}`, 30)}<span class="spacer"></span>${UI.ovr(p.ovr)}</div>`; })]);
      const resigned = list(sum.resigned);
      if (resigned.length) secs.push(['Re-signed', resigned.map(p => `<div class="os-li">${OU.pcell(p, `${p.pos} · ${p.age} yrs`, 30)}<span class="spacer"></span><span class="small nowrap">${dealTxt(S, p)}</span>${UI.ovr(p.ovr)}</div>`)]);
      if (mySign.length) secs.push(['Signed in free agency', mySign.map(x => { const p = pl(x.pid); return `<div class="os-li">${OU.pcell(p, `${p.pos} · ${p.age} yrs · week ${x.week}`, 30)}<span class="spacer"></span><span class="small nowrap">${U.money(x.amt)} × ${U.plural(x.years, 'yr')}</span>${UI.ovr(p.ovr)}</div>`; })]);
      if (myTrades.length) secs.push(['Trades', myTrades.map(r => `<div class="os-li small">🔄 <span style="flex:1;min-width:0">${U.esc(r.text)}</span></div>`)]);
      const filled = list(sum.filled);
      if (filled.length) secs.push(['Front-office fill-ins', filled.map(p => `<div class="os-li">${OU.pcell(p, `${p.pos} · ${p.age} yrs · minimum deal`, 30)}<span class="spacer"></span>${UI.ovr(p.ovr)}</div>`)]);
      const gone = list(sum.walked).concat(list(sum.released));
      if (gone.length) secs.push(['Moved on', gone.map(p => `<div class="os-li">${OU.pcell(p, `${p.pos} · ${p.age} yrs · ${whereNow(S, p)}`, 30)}<span class="spacer"></span>${UI.ovr(p.ovr)}</div>`)]);
      if (live && S.phase === 'resign' && S.resign) {
        const pend = Object.values(S.resign.pl).filter(R => R.status === 'pending').map(R => pl(R.pid)).filter(Boolean);
        if (pend.length) secs.push(['Still undecided', pend.map(p => `<div class="os-li">${OU.pcell(p, `${p.pos} · ${p.age} yrs · expiring`, 30)}<span class="spacer"></span><button class="btn sm" data-nav="resign">Negotiate</button></div>`)]);
      }
      const summer = u < 0 ? liEmpty('You’re between jobs. Your next team’s summer shows up here once you’re hired.')
        : secs.length ? secs.map(([h, rows]) => `<div class="os-sub">${h}</div>${rows.join('')}`).join('') : liEmpty('A quiet summer so far.');

      // --- development ---
      const dev = (sum.user || []).map(x => ({ x, p: pl(x.pid) })).filter(r => r.p);
      const devRow = r => `<div class="os-li">${OU.pcell(r.p, `${r.p.pos} · ${r.p.age} yrs${r.p.tid !== u ? ' · ' + whereNow(S, r.p) : ''}`, 30)}<span class="spacer"></span>
        <span class="small dim nowrap">${r.x.from} → <b style="color:var(--text)">${r.x.to}</b></span><span class="tag ${r.x.d > 0 ? 'good' : r.x.d < 0 ? 'bad' : ''}" style="min-width:38px;justify-content:center">${r.x.d > 0 ? '+' : ''}${r.x.d}</span></div>`;
      const leagueRow = (x, cls) => { const p = pl(x.pid); return p ? `<div class="os-li">${OU.pcell(p, `${p.pos} · ${p.age} yrs${p.tid >= 0 ? ' · ' + S.teams[p.tid].abbr : ''}`, 28)}<span class="spacer"></span><span class="small dim nowrap">${x.from} → ${x.to}</span><span class="tag ${cls}">${x.d > 0 ? '+' : ''}${x.d}</span></div>` : ''; };

      // --- league signings ---
      const bigSign = U.sortBy(signings, x => pl(x.pid).ovr, true).slice(0, 12);
      const signRow = x => { const p = pl(x.pid), t = S.teams[x.tid]; return `<div class="os-li ${x.tid === u ? 'me' : ''}">${UI.teamBadge(t, 24)}${OU.pcell(p, `${p.pos} · ${p.age} yrs · ${t.abbr}${p.lastTid != null && S.teams[p.lastTid] && p.lastTid !== x.tid ? ' from ' + S.teams[p.lastTid].abbr : ''}`, 28)}<span class="spacer"></span><span class="small nowrap">${U.money(x.amt)} × ${x.years}</span>${UI.ovr(p.ovr)}</div>`; };
      const tradeRow = r => `<div class="os-li small ${r.tids.includes(u) ? 'me' : ''}">${r.tids.map(tid => UI.teamBadge(S.teams[tid], 22)).join('')}<span style="flex:1;min-width:0">${U.esc(r.text)}</span></div>`;
      const retRow = p => { const rt = p.retired || {}; const t = S.teams[rt.tid]; const rings = (p.awards || []).filter(a => a.type === 'champion').length; const mvps = (p.awards || []).filter(a => a.type === 'mvp').length; return `<div class="os-li">${OU.pcell(p, `${rt.age || p.age} yrs · ${U.plural(p.yearsPro || 0, 'season')}${t ? ' · ' + t.abbr : ''}${mvps ? ' · ' + mvps + '× MVP' : ''}${rings ? ' · ' + rings + '× champ' : ''}`, 28)}<span class="spacer"></span>${UI.ovr(p.ovr)}</div>`; };
      const opts = list(sum.optOuts);

      const cont = live ? '' : (S.phase === 'preseason' ? OU.contBtn() : '');
      const magBtn = S.phase === 'preseason' && PBC.Magazine && typeof PBC.Magazine.open === 'function' ? '<button class="btn" data-osr="mag">📰 Preview Magazine</button>' : '';
      root.innerHTML = `<div class="page os">
        ${OU.steps(S)}
        <div class="page-h"><div><h1>Offseason Report</h1><div class="sub">${U.seasonLabel(sum.season)} → ${U.seasonLabel(next)} · ${live ? 'updates live as the summer unfolds' : 'how the summer went'}</div></div>
          <div class="actions">${live && u >= 0 ? '<button class="btn" data-osr="auto" title="Your assistant GM makes the remaining decisions">⏩ Sim to New Season</button>' : ''}${magBtn}${cont}</div></div>
        <div class="stats-row" style="margin-bottom:16px">
          <div class="stat"><div class="v">${drafted.length}</div><div class="l">Rookies drafted</div></div>
          <div class="stat"><div class="v">${signings.length}</div><div class="l">Free-agent signings</div></div>
          <div class="stat"><div class="v">${trades.length}</div><div class="l">Trades</div></div>
          <div class="stat"><div class="v">${(sum.retired || []).length}</div><div class="l">Retirements</div></div>
          <div class="stat"><div class="v">${opts.length}</div><div class="l">Player opt-outs</div></div>
          ${sum.left ? `<div class="stat"><div class="v">${sum.left.length}</div><div class="l">Left the league</div></div>` : ''}
        </div>
        <div class="grid g-main">
          <div class="stack">
            <div class="card accent"><div class="card-h"><h3>Your summer</h3>${u >= 0 ? `<div class="actions">${UI.teamBadge(S.teams[u], 24)}</div>` : ''}</div><div class="card-b flush">${summer}</div></div>
            <div class="card"><div class="card-h"><h3>Player development</h3><div class="actions"><span class="small muted">your roster when the season ended</span></div></div><div class="card-b flush">${dev.length ? dev.map(devRow).join('') : liEmpty('No development report.')}</div></div>
            <div class="card"><div class="card-h"><h3>Biggest signings</h3></div><div class="card-b flush">${bigSign.length ? bigSign.map(signRow).join('') : liEmpty(live && S.phase !== 'freeagency' ? 'Free agency opens after the re-signing window.' : 'No free-agent signings yet.')}</div></div>
            <div class="card"><div class="card-h"><h3>Trades</h3></div><div class="card-b flush">${trades.length ? trades.slice().reverse().map(tradeRow).join('') : liEmpty('No trades this summer.')}</div></div>
          </div>
          <div class="stack">
            ${u >= 0 ? `<div class="card"><div class="card-h"><h3>Your cap</h3></div><div class="card-b">${OU.capCard(S, u)}</div></div>` : ''}
            <div class="card"><div class="card-h"><h3>League risers</h3></div><div class="card-b flush">${(sum.risers || []).map(x => leagueRow(x, 'good')).join('') || liEmpty('No big jumps.')}</div></div>
            <div class="card"><div class="card-h"><h3>Fallers</h3></div><div class="card-b flush">${(sum.fallers || []).map(x => leagueRow(x, 'bad')).join('') || liEmpty('No big drops.')}</div></div>
            <div class="card"><div class="card-h"><h3>Retirements</h3><div class="actions"><span class="tag">${retired.length}</span></div></div><div class="card-b flush">${retired.length ? retired.slice(0, 10).map(retRow).join('') + (retired.length > 10 ? `<div class="os-sub">and ${retired.length - 10} more</div>` : '') : liEmpty('Nobody retired.')}</div></div>
            ${opts.length ? `<div class="card"><div class="card-h"><h3>Declined player options</h3></div><div class="card-b flush">${opts.map(p => `<div class="os-li">${OU.pcell(p, `${p.pos} · ${p.age} yrs · ${whereNow(S, p)}`, 28)}<span class="spacer"></span>${UI.ovr(p.ovr)}</div>`).join('')}</div></div>` : ''}
            <p class="hint">Rosters run to ${L.rosterMax} in the regular season (${L.rosterMax + Off().OFFSEASON_EXTRA} for you during the offseason). Players you release keep their guaranteed money on your cap.</p>
          </div>
        </div></div>`;
      UI.on(root, 'click', '[data-osr]', (e, el) => {
        if (el.dataset.osr === 'auto') OU.autoAll(S);
        if (el.dataset.osr === 'mag' && PBC.Magazine && typeof PBC.Magazine.open === 'function') PBC.Magazine.open(S);
      });
    },
  });
})();
