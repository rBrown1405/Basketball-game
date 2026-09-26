/* Pro BBALL Coach — re-signing and free agency UI (market with front-office actions; in-season free-agent list). */
(function () {
  'use strict';
  const PBC = window.PBC;
  const U = PBC.U, C = PBC.Config, UI = PBC.UI, OU = PBC.OffUI;
  const Off = () => PBC.Offseason;

  // ---------------------------------------------------------------------------
  // Re-sign
  // ---------------------------------------------------------------------------
  const STATUS = {
    pending: ['warn', 'Undecided'], signed: ['good', 'Re-signed'], walked: ['', 'Letting him walk'], refused: ['bad', 'Refused to negotiate'],
  };

  UI.register('resign', {
    title: 'Re-sign Players',
    render(root) {
      const S = UI.S;
      const O = Off();
      const u = O.userTid(S);
      if (S.phase !== 'resign' || !S.resign) {
        root.innerHTML = `<div class="page os">${OU.steps(S)}<div class="card"><div class="empty">${['draft_lottery', 'draft'].includes(S.phase) ? 'The re-signing window opens right after the draft.' : 'The re-signing window is closed.'}</div></div></div>`;
        return;
      }
      const L = PBC.League.cfg(S);
      const list = U.sortBy(Object.values(S.resign.pl).map(R => ({ R, p: S.players[R.pid] })).filter(x => x.p), x => x.p.ovr, true);
      const others = U.sortBy(Object.values(S.players).filter(p => p.tid >= 0 && p.tid !== u && p.contract && p.contract.exp <= S.season), p => p.ovr, true).slice(0, 14);
      const pend = list.filter(x => x.R.status === 'pending').length;
      root.innerHTML = `<div class="page os">
        ${OU.steps(S)}
        <div class="page-h"><div><h1>Re-sign Players</h1><div class="sub">${U.plural(list.length, 'expiring contract')} · ${pend} undecided · you can go over the cap to keep your own players</div></div></div>
        <div class="grid g-main">
          <div class="stack">
            ${list.length ? list.map(x => resignCard(S, x.p, x.R)).join('') : '<div class="card"><div class="empty">No expiring contracts this summer. Head to free agency!</div></div>'}
          </div>
          <div class="stack">
            <div class="card accent"><div class="card-h"><h3>Your cap for ${U.seasonLabel(O.capYear(S))}</h3></div><div class="card-b">${OU.capCard(S, u)}</div></div>
            <div class="card"><div class="card-h"><h3>Hitting the market</h3><div class="actions"><span class="tag">not re-signed</span></div></div><div class="card-b flush">
              ${others.map(p => `<div class="os-li small">${OU.pcell(p, `${p.pos} · ${p.age} · ${S.teams[p.tid].abbr}`, 28)}<span class="spacer"></span>${UI.ovr(p.ovr)}</div>`).join('') || '<div class="empty small">Nobody notable.</div>'}</div></div>
            <p class="hint">Asking prices depend on market value, personality and mood: happy, loyal players give a hometown discount; unhappy ones want a premium or want out. Players who refuse will still listen in free agency, but start colder on you.</p>
          </div>
        </div></div>`;
      UI.on(root, 'click', '[data-rs]', (e, el) => {
        const pid = +el.dataset.pid;
        const R = S.resign.pl[pid];
        const p = S.players[pid];
        const a = el.dataset.rs;
        if (a === 'walk') { O.letWalk(S, pid); UI.save(); UI.refresh(); }
        if (a === 'undo') { if (R.status === 'walked') R.status = 'pending'; UI.save(); UI.refresh(); }
        if (a === 'offer') {
          OU.offerDialog({
            title: 'Re-sign ' + PBC.Player.name(p), p, ask: R.ask, years: R.years, amt: R.ask, allowOpt: true,
            note: `${U.esc(O.moodLabel(R.mood))} (${R.mood}/100). ${R.willing ? 'He’s open to staying.' : 'He wants to test free agency.'} ${3 - R.tries} offer${3 - R.tries === 1 ? '' : 's'} before he stops listening.`,
            preview: o => {
              if (!R.willing && o.amt < R.ask * 1.2) return { tone: 'bad', text: `He wants out — only ${U.money(R.ask * 1.2)}+ could change his mind.` };
              const sc = O.moneyScore(p, o, R.ask);
              return sc >= -1.5 ? { tone: 'good', text: '✓ He’ll sign this deal.' } : sc >= -8 ? { tone: 'warn', text: 'Close — a little more money or his preferred length would do it.' } : { tone: 'bad', text: 'Not close — expect a rejection.' };
            },
            submitLabel: 'Offer Deal',
            submit: o => {
              const r = O.offerResign(S, pid, o);
              UI.save();
              UI.refresh();
              return { ok: r.ok, msg: r.msg, close: r.refused };
            },
          });
        }
      });
    },
  });

  function resignCard(S, p, R) {
    const O = Off();
    const st = STATUS[R.status] || STATUS.pending;
    const deal = R.status === 'signed' && R.deal ? `${U.plural(R.deal.years, 'year')} · ${U.money(R.deal.amt)}/yr` : '';
    return `<div class="card rs-card ${R.status}"><div class="card-b" style="padding-top:14px">
      <div class="row nowrap">${UI.avatar(p, 56)}
        <div style="flex:1;min-width:0"><div class="row nowrap"><span class="up" style="font-size:20px">${UI.playerLink(p)}</span> <span class="tag ${st[0]}">${st[1]}</span></div>
          <div class="small muted">${p.pos} · ${p.age} yrs · ${U.plural(p.yearsPro || 0, 'season')} pro · ${OU.statLine(S, p)}</div></div>
        <div class="center"><div class="tiny dim up">OVR</div>${UI.ovr(p.ovr, 'lg')}<div class="tiny dim">POT ${UI.potLabel(p)}</div></div></div>
      <div class="rs-grid">
        <div><div class="os-lbl">Mood · ${U.esc(O.moodLabel(R.mood))}</div>${OU.meter(R.mood)}<div class="rs-f">${OU.factors(R.factors, 4)}</div></div>
        <div><div class="os-lbl">Asking</div><div class="rs-ask">${U.money(R.ask)}<span class="dim small"> /yr × ${R.years}</span></div>
          <div class="tiny dim">Market value ${U.money(PBC.Player.marketValue(p, PBC.League.cfg(S)))} · current ${U.money(p.contract.amt)}</div></div>
      </div>
      <div class="row" style="margin-top:10px">
        ${R.status === 'pending' ? `<button class="btn primary sm" data-rs="offer" data-pid="${p.id}">✍️ Offer Contract</button><button class="btn ghost sm" data-rs="walk" data-pid="${p.id}">Let him walk</button>` : ''}
        ${R.status === 'walked' ? `<button class="btn ghost sm" data-rs="undo" data-pid="${p.id}">↩ Reconsider</button>` : ''}
        ${deal ? `<span class="good-t bold small">✓ ${deal}</span>` : ''}
        ${R.status === 'refused' ? '<span class="small muted">He’ll be on the market — you can still recruit him there.</span>' : ''}
      </div></div></div>`;
  }

  // ---------------------------------------------------------------------------
  // Free agency
  // ---------------------------------------------------------------------------
  const fs = { pid: null, tab: 'all', pos: 'all' };

  function askText(S, pid) {
    const e = S.fa.pl[pid];
    if (e.known) return `<b>${U.money(Off().userAsk(S, pid))}</b>`;
    const r = Off().askRange(S, pid);
    return r.lo === r.hi ? U.money(r.lo) : `<span class="dim">${U.money(r.lo, true)}–${U.money(r.hi, true)}</span>`;
  }

  function statusTag(S, pid) {
    const st = Off().userOfferStatus(S, pid);
    if (st.status === 'none') return '';
    return st.status === 'leading' ? '<span class="tag good">Leading</span>' : st.status === 'behind' ? '<span class="tag bad">Outbid</span>' : '<span class="tag warn">Offer out</span>';
  }

  UI.register('freeagency', {
    title: 'Free Agency',
    render(root, params) {
      const S = UI.S;
      if (params && params.tab) { fs.tab = params.tab; params.tab = null; }
      if (S.phase === 'freeagency' && S.fa) return renderMarket(root, S);
      return renderInSeason(root, S);
    },
  });

  function renderMarket(root, S) {
    const O = Off();
    const fa = S.fa;
    const u = O.userTid(S);
    const L = PBC.League.cfg(S);
    const all = O.faList(S);
    if (fs.pid && (!S.players[fs.pid] || S.players[fs.pid].tid !== -1)) fs.pid = null;
    if (!fs.pid && all.length) fs.pid = all[0].id;
    const shortlist = all.filter(p => fa.pl[p.id].star);
    const mineOffers = all.filter(p => fa.pl[p.id].offers.some(o => o.tid === u));
    let rows = fs.tab === 'star' ? shortlist : fs.tab === 'mine' ? mineOffers : fs.tab === 'roster' ? [] : all;
    if (fs.pos !== 'all') rows = rows.filter(p => p.pos === fs.pos);
    const signedN = Object.values(fa.pl).filter(e => e.signed).length;
    root.innerHTML = `<div class="page os">
      ${OU.steps(S)}
      <div class="page-h"><div><h1>Free Agency</h1><div class="sub">${fa.done ? 'The market is closed — hit CONTINUE to start the new season' : `Week ${fa.week} of ${fa.weeks}`} · ${all.length} available · ${signedN} signed</div></div>
        <div class="actions"><div class="fa-ap"><div class="fa-pips">${Array.from({ length: fa.apMax }, (x, i) => `<i class="${i < fa.ap ? 'on' : ''}"></i>`).join('')}</div><div class="l"><b>${fa.ap}</b>/${fa.apMax} action points this week</div></div></div></div>
      <div class="fa-ticker"><span class="fa-ticker-l">SIGNINGS</span><div class="fa-ticker-m"><div class="fa-ticker-in">${fa.log.slice(0, 14).map(x => `<span class="fa-tick ${x.tid === u ? 'me' : ''}">${UI.teamBadge(S.teams[x.tid], 18)} ${U.esc(x.text)} <i class="dim">wk ${x.week}</i></span>`).join('') || '<span class="fa-tick dim">No signings yet — top free agents take their time.</span>'}</div></div></div>
      <div class="grid g-main" style="margin-top:14px">
        <div class="card"><div class="card-h"><div class="tabs">${[['all', `Market (${all.length})`], ['star', `★ Shortlist (${shortlist.length})`], ['mine', `My offers (${mineOffers.length})`], ['roster', 'My roster']].map(([k, l]) => `<button class="tab ${fs.tab === k ? 'active' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>
          ${fs.tab !== 'roster' ? `<div class="actions"><div class="seg">${['all'].concat(C.POSITIONS).map(pz => `<button class="${fs.pos === pz ? 'on' : ''}" data-pos="${pz}">${pz === 'all' ? 'All' : pz}</button>`).join('')}</div></div>` : ''}</div>
          <div class="card-b flush" id="fa-tbl"></div></div>
        <div class="stack fa-side">
          <div class="card"><div class="card-b" style="padding-top:14px">${OU.capCard(S, u)}</div></div>
          <div id="fa-sel">${fs.pid ? selPanel(S, S.players[fs.pid]) : '<div class="card"><div class="empty">Select a free agent.</div></div>'}</div>
        </div>
      </div></div>`;
    const tbl = root.querySelector('#fa-tbl');
    if (fs.tab === 'roster') rosterTable(S, tbl);
    else {
      UI.table(tbl, {
        rows: rows.map(p => ({ p, e: fa.pl[p.id], i: O.faInterest(S, p.id) })), sort: 'ovr', limit: 80,
        rowClass: r => (r.p.id === fs.pid ? 'fa-selrow' : ''),
        empty: fs.tab === 'star' ? 'Star players to shortlist them.' : fs.tab === 'mine' ? 'You have no offers out.' : 'Nobody left.',
        columns: [
          { key: 'star', label: '★', nosort: true, fmt: r => `<button class="btn ghost sm sc-star ${r.e.star ? 'on' : ''}" data-star="${r.p.id}">${r.e.star ? '★' : '☆'}</button>` },
          { key: 'name', label: 'Player', value: r => r.p.last, fmt: r => OU.pcell(r.p, `${r.p.pos} · ${r.p.age} · ${r.e.lastTid >= 0 && S.teams[r.e.lastTid] ? 'ex-' + S.teams[r.e.lastTid].abbr : 'FA'}`) },
          { key: 'ovr', label: 'OVR', num: true, value: r => r.p.ovr, fmt: r => UI.ovr(r.p.ovr) },
          { key: 'pot', label: 'POT', num: true, value: r => r.p.pot, fmt: r => UI.potLabel(r.p) },
          { key: 'ask', label: 'Asking', num: true, value: r => r.e.ask, fmt: r => askText(S, r.p.id) },
          { key: 'int', label: 'Interest', value: r => r.i.score, fmt: r => `<div class="fa-int">${OU.meter(r.i.score)}<span>${r.i.score}</span></div>` },
          { key: 'offers', label: 'Offers', num: true, value: r => r.e.offers.filter(o => o.tid !== u).length, fmt: r => (r.e.known ? r.e.offers.filter(o => o.tid !== u).length : '<span class="dim">?</span>') },
          { key: 'st', label: '', nosort: true, fmt: r => statusTag(S, r.p.id) },
        ],
        onRow: r => { fs.pid = r.p.id; UI.refresh(); },
      });
    }
    bindMarket(root, S);
  }

  function selPanel(S, p) {
    const O = Off();
    const fa = S.fa;
    const e = fa.pl[p.id];
    const u = O.userTid(S);
    const i = O.faInterest(S, p.id);
    const st = O.userOfferStatus(S, p.id);
    const mine = e.offers.find(o => o.tid === u);
    const others = e.offers.filter(o => o.tid !== u);
    const acts = O.FA_ACTIONS.map(a => {
      const done = a.once && e.acts[a.key];
      const blocked = (a.key === 'minutes' && e.promise && e.promise.type === 'starter') || (a.key === 'starter' && e.promise && e.promise.type === 'minutes');
      const dis = fa.done || done || blocked || fa.ap < a.cost;
      return `<button class="fa-act ${a.key === 'offer' ? 'offer' : ''}" data-fa="${a.key}" ${dis ? 'disabled' : ''} title="${U.esc(a.desc)}"><span class="fa-act-i">${a.icon}</span><span class="fa-act-l">${a.label}</span><span class="fa-act-c">${done ? '✓' : a.cost ? a.cost + ' AP' : 'free'}</span>${e.acts[a.key] && !a.once ? `<i class="fa-act-n">×${e.acts[a.key]}</i>` : ''}</button>`;
    }).join('');
    return `<div class="card accent fa-selc"><div class="card-b" style="padding-top:14px">
      <div class="row nowrap">${UI.avatar(p, 58)}<div style="flex:1;min-width:0"><div class="up" style="font-size:22px;line-height:1.05">${UI.playerLink(p)}</div>
        <div class="small muted">${p.pos} · ${p.age} yrs · ${U.height(p.hgt)} · ${U.plural(p.yearsPro || 0, 'season')} pro${e.lastTid >= 0 && S.teams[e.lastTid] ? ' · ex-' + S.teams[e.lastTid].abbr : ''}</div></div>
        <div class="center">${UI.ovr(p.ovr, 'lg')}<div class="tiny dim">POT ${UI.potLabel(p)}</div></div></div>
      <div class="fa-intbig"><div class="row"><span class="os-lbl" style="margin:0">Interest in you</span><div class="spacer"></div><b>${i.score}</b><span class="tag ${i.score >= 65 ? 'good' : i.score >= 45 ? 'info' : i.score >= 35 ? 'warn' : 'bad'}">${U.esc(i.label)}</span></div>${OU.meter(i.score)}<div class="rs-f">${OU.factors(i.factors, 5)}</div></div>
      <div class="kv fa-kv">
        <span>Asking</span><span>${askText(S, p.id)}${e.known ? ` × ${U.plural(e.years, 'yr')}` : ''}</span>
        <span>Driven by</span><span>${e.motive ? U.esc(O.topMotive(p)) : '<span class="dim">Text him to find out</span>'}</span>
        <span>Other offers</span><span>${e.known ? (others.length ? others.map(o => `${UI.teamBadge(S.teams[o.tid], 18)}`).join(' ') : 'none yet') : `<span class="dim">${others.length ? 'Teams are calling…' : 'Quiet so far'}</span>`}</span>
        <span>Promise</span><span>${e.promise ? (e.promise.type === 'starter' ? '🟢 Starting role' : `⏱️ ${e.promise.min} min`) : '—'}</span>
        <span>Your offer</span><span>${mine ? `${U.money(mine.amt)} × ${mine.years}${mine.opt ? ' (PO)' : ''} ${statusTag(S, p.id)}` : '—'}</span>
      </div>
      <div class="fa-acts">${acts}</div>
      ${mine ? `<div class="row" style="margin-top:8px"><span class="small muted">${st.status === 'leading' ? 'You’re in front — he decides at week’s end.' : st.status === 'behind' ? 'Someone is offering more. Sweeten it or recruit harder.' : 'He wants a bit more before committing.'}</span><div class="spacer"></div><button class="btn ghost sm" data-fa="withdraw">Withdraw</button></div>` : ''}
    </div></div>`;
  }

  function rosterTable(S, el) {
    const O = Off();
    const u = O.userTid(S);
    const L = PBC.League.cfg(S);
    const r = PBC.League.roster(S, u);
    UI.table(el, {
      rows: r, sort: 'sal',
      columns: [
        { key: 'name', label: 'Player', value: p => p.last, fmt: p => OU.pcell(p, `${p.pos} · ${p.age}${p.contract.rookie ? ' · rookie deal' : ''}`) },
        { key: 'ovr', label: 'OVR', num: true, value: p => p.ovr, fmt: p => UI.ovr(p.ovr) },
        { key: 'sal', label: 'Salary', num: true, value: p => p.contract.amt, fmt: p => U.money(p.contract.amt) },
        { key: 'yrs', label: 'Thru', num: true, value: p => p.contract.exp, fmt: p => U.seasonLabel(p.contract.exp) },
        { key: 'rel', label: '', nosort: true, fmt: p => `<button class="btn danger sm" data-release="${p.id}">Release</button>` },
      ],
      empty: 'No players under contract.',
    });
    const n = r.length;
    el.insertAdjacentHTML('beforeend', `<div class="hint" style="padding:10px 16px">${n > L.rosterMax ? `<span class="bad-t bold">${n} players — you must get down to ${L.rosterMax} before the season.</span>` : `${n}/${L.rosterMax} roster spots used (you may carry up to ${L.rosterMax + O.OFFSEASON_EXTRA} during the offseason).`} Released guaranteed money stays on your cap as dead money.</div>`);
  }

  function releaseFlow(S, pid) {
    const O = Off();
    const p = S.players[pid];
    const yr = O.capYear(S);
    const nonG = p.contract.rookie && p.draft && p.draft.round >= 2 && p.rookieSeason === S.season + 1 && O.isOffseason(S);
    const dead = !nonG && p.contract.exp >= yr ? p.contract.amt : 0;
    UI.confirm(`Release <b>${U.esc(PBC.Player.name(p))}</b>?${dead ? `<br><span class="bad-t">${U.money(dead)}/yr stays on your cap as dead money through ${U.seasonLabel(p.contract.exp)}.</span>` : '<br>His deal isn’t guaranteed — no dead money.'}`, { ok: 'Release', danger: true }).then(ok => {
      if (!ok) return;
      const r = O.release(S, pid);
      UI.toast(r.msg, r.ok ? 'good' : 'bad');
      UI.save(); UI.refresh();
    });
  }

  function bindMarket(root, S) {
    const O = Off();
    UI.on(root, 'click', '[data-tab]', (e, el) => { fs.tab = el.dataset.tab; UI.refresh(); });
    UI.on(root, 'click', '[data-pos]', (e, el) => { fs.pos = el.dataset.pos; UI.refresh(); });
    UI.on(root, 'click', '[data-star]', (e, el) => { e.stopPropagation(); const en = S.fa.pl[+el.dataset.star]; en.star = !en.star; UI.save(); UI.refresh(); });
    UI.on(root, 'click', '[data-release]', (e, el) => { e.stopPropagation(); releaseFlow(S, +el.dataset.release); });
    UI.on(root, 'click', '[data-fa]', (e, el) => {
      const key = el.dataset.fa;
      const pid = fs.pid;
      const p = S.players[pid];
      if (!p) return;
      if (key === 'withdraw') { O.faWithdraw(S, pid); UI.save(); UI.refresh(); return; }
      if (key === 'offer') return offerFlow(S, p);
      if (key === 'minutes') {
        const m = UI.modal({ title: 'Promise minutes', body: `<p class="small muted">How many minutes per game will you guarantee ${U.esc(p.first)}? You’ll need to keep it during the season.</p><div class="row">${[20, 25, 30].map(n => `<button class="btn lg" data-min="${n}">${n} mpg</button>`).join('')}</div>`, actions: [{ label: 'Cancel', cls: 'ghost' }] });
        UI.on(m.body, 'click', '[data-min]', (ev, b) => { m.close(); runAction(S, pid, 'minutes', +b.dataset.min); });
        return;
      }
      if (key === 'starter') {
        UI.confirm(`Promise ${U.esc(PBC.Player.name(p))} a starting job? If he doesn’t start most games, his morale and your credibility take a hit.`, { ok: 'Promise it' }).then(ok => { if (ok) runAction(S, pid, key); });
        return;
      }
      runAction(S, pid, key);
    });
  }

  function runAction(S, pid, key, arg) {
    const r = Off().faAction(S, pid, key, arg);
    if (r.ok) UI.toast(`${r.msg}${r.delta ? ` <b class="${r.delta > 0 ? 'good-t' : 'bad-t'}">${r.delta > 0 ? '+' : ''}${r.delta} interest</b>` : ''}`, r.delta < 0 ? 'bad' : 'good');
    else UI.toast(r.msg, 'bad');
    UI.save(); UI.refresh();
  }

  function offerFlow(S, p) {
    const O = Off();
    const e = S.fa.pl[p.id];
    const u = O.userTid(S);
    const mine = e.offers.find(o => o.tid === u);
    const ask = O.userAsk(S, p.id);
    OU.offerDialog({
      title: 'Offer ' + PBC.Player.name(p), p, ask: e.known ? ask : null, years: e.known ? e.years : (mine ? mine.years : 2), amt: mine ? mine.amt : (e.known ? ask : O.askRange(S, p.id).lo), allowOpt: true,
      note: `${e.known ? '' : 'Call his agent to learn his exact price. '}Cap space: ${U.money(Math.max(0, O.capSpace(S, u)))}. Over the cap you can use the mid-level exception (${U.money(PBC.League.cfg(S).mle)}, once) or offer the minimum.${e.promise ? ' Your promise is attached to the offer.' : ''}`,
      preview: o => {
        const k = O.offerKind(S, u, O.fitAmt(S, p, o.amt), p.id);
        if (k.error) return { tone: 'bad', text: k.error };
        const val = O.offerValue(S, p, { tid: u, amt: O.fitAmt(S, p, o.amt), years: o.years, opt: o.opt });
        const thr = O.threshold(S, p);
        const others = e.offers.filter(x => x.tid !== u);
        const best = e.known && others.length ? Math.max(...others.map(x => O.offerValue(S, p, x))) : null;
        const kind = k.kind === 'mle' ? ' (mid-level exception)' : k.kind === 'min' ? ' (minimum deal)' : '';
        if (val < -30) return { tone: 'bad', text: 'He’d find this insulting.' + kind };
        if (val >= thr + 4 && (best == null || val >= best + 3)) return { tone: 'good', text: '✓ Strong offer — he may sign on the spot.' + kind };
        if (best != null && val < best) return { tone: 'warn', text: 'Another team is offering more.' + kind };
        if (val >= thr) return { tone: 'good', text: 'Competitive — he’d likely sign at week’s end if nobody beats it.' + kind };
        return { tone: 'warn', text: 'He’ll listen, but wants more money, a better fit, or more recruiting.' + kind };
      },
      submitLabel: mine ? 'Update Offer' : 'Make Offer',
      submit: o => {
        const r = O.faOffer(S, p.id, o);
        UI.save(); UI.refresh();
        return { ok: r.ok, msg: r.msg };
      },
    });
  }

  // ---------------------------------------------------------------------------
  // In-season free agents
  // ---------------------------------------------------------------------------
  function renderInSeason(root, S) {
    const O = Off();
    const L = PBC.League.cfg(S);
    const u = O.userTid(S);
    const off = ['draft_lottery', 'draft', 'resign', 'awards', 'postseason_done'].includes(S.phase);
    const fas = PBC.League.freeAgents(S);
    const n = u >= 0 ? PBC.League.roster(S, u).length : 0;
    root.innerHTML = `<div class="page os">
      ${OU.steps(S)}
      <div class="page-h"><div><h1>Free Agents</h1><div class="sub">${fas.length} unsigned players · ${off ? 'free agency opens after the re-signing window' : 'sign them for the rest of the season'}</div></div></div>
      <div class="grid g-main"><div class="card"><div class="card-b flush" id="fa-tbl"></div></div>
        <div class="stack"><div class="card"><div class="card-b" style="padding-top:14px">${u >= 0 ? OU.capCard(S, u) : ''}</div></div>
          <p class="hint">In-season deals run through the end of this season. Under the cap you can pay a player’s asking price; over the cap only minimum deals are possible. Roster: ${n}/${L.rosterMax}.</p></div></div></div>`;
    UI.table(root.querySelector('#fa-tbl'), {
      rows: fas, sort: 'ovr', limit: 80,
      columns: [
        { key: 'name', label: 'Player', value: p => p.last, fmt: p => OU.pcell(p) },
        { key: 'ovr', label: 'OVR', num: true, value: p => p.ovr, fmt: p => UI.ovr(p.ovr) },
        { key: 'pot', label: 'POT', num: true, value: p => p.pot, fmt: p => UI.potLabel(p) },
        { key: 'ask', label: 'Asking', num: true, value: p => (p.contract ? p.contract.amt : 0), fmt: p => U.money(p.contract ? p.contract.amt : L.minSalary) },
        { key: 'inj', label: '', nosort: true, fmt: p => (p.injury ? `<span class="tag bad">${U.esc(PBC.Player.injuryLabel(p.injury))}</span>` : '') },
        { key: 'go', label: '', nosort: true, fmt: p => (!off && u >= 0 ? `<button class="btn sm primary" data-sign="${p.id}">Sign</button>` : '') },
      ],
      onRow: p => UI.openPlayer(p.id),
      empty: 'No free agents.',
    });
    UI.on(root, 'click', '[data-sign]', async (e, el) => {
      e.stopPropagation();
      const p = S.players[+el.dataset.sign];
      if (!(await UI.confirm(`Sign ${U.esc(PBC.Player.name(p))} for the rest of the season?`, { ok: 'Sign' }))) return;
      const r = O.quickSign(S, p.id);
      UI.toast(r.msg, r.ok ? 'good' : 'bad');
      UI.save(); UI.refresh();
    });
  }
})();
