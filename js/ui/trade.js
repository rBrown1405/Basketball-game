/* Pro BBALL Coach - trades: pick a partner, build a deal from both rosters and pick lists, read the AI's verdict and
   its reasons (value meter, salary matching, roster limits), ask "what would it take?", and put players or picks on
   the trade block to collect the league's best offers. Screen 'trade', params { give: [pid], tid } (optional extras:
   givePicks, get, getPicks, with pick keys "season:round:orig"). */
(function () {
  'use strict';
  const PBC = window.PBC;
  const U = PBC.U, UI = PBC.UI, OU = PBC.OffUI;
  const Tr = () => PBC.Trade;
  const nm = p => PBC.Player.name(p);
  const MODE = { contend: '🏆 contending', middle: '⚖️ middle of the pack', rebuild: '🌱 rebuilding' };
  const side0 = () => ({ pids: [], picks: [] });
  const ts = { S: null, tid: null, give: side0(), get: side0(), note: null, shop: null, shopAuto: false, hist: 'mine' };

  const assets = s => s.pids.length + s.picks.length;
  const verKey = S => `${S.season}:${S.phase}:${S.day}:${S._rosterVer || 0}`;
  const copy = s => ({ pids: s.pids.slice(), picks: s.picks.slice() });
  const offerOf = u => ({ tids: [u, ts.tid], give: [copy(ts.give), copy(ts.get)] });
  const toggle = (arr, x) => { const i = arr.indexOf(x); if (i >= 0) arr.splice(i, 1); else arr.push(x); };

  function reset(keepTid) {
    ts.give = side0();
    ts.get = side0();
    ts.note = null;
    if (!keepTid) ts.tid = null;
  }

  /** Apply navigation params once (UI.refresh re-renders with the same params object). */
  function takeParams(S, u, params) {
    if (!params || !(params.give || params.givePicks || params.get || params.getPicks || params.tid != null)) return;
    reset(false);
    ts.shop = null;
    if (params.tid != null && +params.tid !== u && S.teams[+params.tid]) ts.tid = +params.tid;
    const T = Tr();
    const blocked = [];
    const usable = ids => (ids || []).map(Number).filter(id => {
      const p = S.players[id];
      const why = p ? T.playerBlock(S, p) : 'He is not on a team.';
      if (why) blocked.push(why);
      return !why;
    });
    ts.give.pids = usable(params.give);
    ts.give.picks = (params.givePicks || []).slice();
    if (ts.tid != null) { ts.get.pids = usable(params.get); ts.get.picks = (params.getPicks || []).slice(); }
    if (blocked.length) ts.note = { tone: 'warn', text: blocked[0] };
    ts.shopAuto = ts.tid == null && assets(ts.give) > 0;
    params.give = params.givePicks = params.get = params.getPicks = null;
    params.tid = null;
  }

  /** Drop anything that is no longer on the right team (after trades, signings, the draft...). */
  function clean(S, u) {
    const T = Tr();
    const okP = (pid, tid) => { const p = S.players[pid]; return !!p && p.tid === tid; };
    const okK = (key, tid) => { const pk = T.findPick(S, key); return !!pk && pk.owner === tid && !T.pickUsed(S, pk); };
    ts.give.pids = ts.give.pids.filter(id => okP(id, u));
    ts.give.picks = ts.give.picks.filter(k => okK(k, u));
    if (ts.tid == null || ts.tid === u || !S.teams[ts.tid]) { ts.tid = null; ts.get = side0(); return; }
    ts.get.pids = ts.get.pids.filter(id => okP(id, ts.tid));
    ts.get.picks = ts.get.picks.filter(k => okK(k, ts.tid));
  }

  // ---------------------------------------------------------------------------
  // Pieces
  // ---------------------------------------------------------------------------
  function playerRow(S, p, side, on, block) {
    const T = Tr();
    const c = p.contract || {};
    const corner = side === 1 && T.isCornerstone(S, p) ? ' <span class="gold-t" title="Franchise cornerstone: it takes a premium to pry loose">★</span>' : '';
    const sub = `${p.pos} · ${p.age} yrs · ${U.money(c.amt || 0, true)}${c.exp != null ? ' thru ' + U.seasonLabel(c.exp) : ''}${PBC.Player.isInjured(p) ? ' · <span class="bad-t">INJ</span>' : ''}`;
    return `<div class="tr-row ${on ? 'on' : ''} ${block ? 'blocked' : ''}" data-trp="${p.id}" data-side="${side}"${block ? ` title="${U.esc(block)}"` : ''}>
      <span class="tr-chk">${on ? '✓' : block ? '🔒' : ''}</span>${UI.avatar(p, 32)}
      <div class="tr-nm"><div class="ellip">${UI.playerLink(p)}${corner}</div><span class="tiny dim">${sub}</span></div>
      <div class="tr-ovr">${UI.ovr(p.ovr)}<span class="tiny dim">${UI.potLabel(p)}</span></div></div>`;
  }

  function pickRow(S, pk, side, on) {
    const T = Tr();
    const d = S.draftState;
    const n = S.teams.length;
    const slot = PBC.Draft.projectedSlot(S, pk);
    const exact = d && d.year === pk.season && !d.done;
    const proj = exact && S.phase === 'draft_lottery' && !OU.lotterySeen(S) ? 'slot set by the lottery'
      : exact ? `pick #${Math.round(slot) + (pk.round - 1) * n} overall` : `projected ~#${Math.max(1, Math.round(slot))} in the round`;
    return `<div class="tr-row ${on ? 'on' : ''}" data-trk="${T.pickKey(pk)}" data-side="${side}">
      <span class="tr-chk">${on ? '✓' : ''}</span><span class="tr-pk">${U.ordinal(pk.round)}</span>
      <div class="tr-nm"><span class="bold small">${pk.season} ${U.ordinal(pk.round)}-round pick</span><span class="tiny dim">${pk.orig !== pk.owner ? 'via ' + S.teams[pk.orig].abbr + ' · ' : ''}${proj}</span></div></div>`;
  }

  function sideCard(S, tid, side, sel) {
    const T = Tr();
    const t = S.teams[tid];
    const roster = PBC.League.roster(S, tid);
    const picks = T.teamPicks(S, tid);
    const rec = PBC.League.standings(S)[tid];
    return `<div class="card ${side === 0 ? 'accent' : ''}"${side === 1 ? ` style="border-top:3px solid ${t.colors.primary}"` : ''}>
      <div class="card-h">${UI.teamBadge(t, 32)}<div style="min-width:0"><h3>${U.esc(t.city)} ${U.esc(t.name)}${side === 0 ? ' <span class="tiny dim">(you)</span>' : ''}</h3>
        <div class="tiny dim">${rec.w}-${rec.l} · payroll ${U.money(PBC.Offseason.payroll(S, tid), true)} · ${MODE[T.teamMode(S, tid)]}</div></div></div>
      <div class="tr-list">
        <div class="tr-sub">Players (${roster.length})</div>
        ${roster.map(p => playerRow(S, p, side, sel.pids.includes(p.id), T.playerBlock(S, p))).join('')}
        <div class="tr-sub">Draft picks (${picks.length})</div>
        ${picks.length ? picks.map(pk => pickRow(S, pk, side, sel.picks.includes(T.pickKey(pk)))).join('') : '<div class="empty small">No tradable picks.</div>'}
      </div></div>`;
  }

  function chips(S, s) {
    const T = Tr();
    const out = s.pids.map(id => S.players[id]).filter(Boolean).map(p => `<span class="tr-chip">${UI.avatar(p, 22)}${U.esc(PBC.Player.shortName(p))} <b>${p.ovr}</b></span>`)
      .concat(s.picks.map(k => { const pk = T.findPick(S, k); return pk ? `<span class="tr-chip pk">🎟️ ${U.esc(T.pickLabel(S, pk))}</span>` : ''; }));
    return out.join('') || '<span class="tiny dim">Nothing yet</span>';
  }

  function noteHtml() {
    if (!ts.note) return '';
    return `<div class="tr-note"><span class="${ts.note.tone}-t bold">${U.esc(ts.note.text)}</span></div>`;
  }

  function dealCard(S, u, ev, st) {
    const T = Tr();
    const L = PBC.League.cfg(S);
    const them = S.teams[ts.tid];
    const any = assets(ts.give) + assets(ts.get) > 0;
    let body = '';
    if (any && ev) {
      const ai = ev.sides.find(s => !s.isUser) || ev.sides[1];
      const bm = T.balanceMeter(S, ev);
      const pos = ((bm.x + 1) / 2 * 100).toFixed(1);
      const valueOk = ai.net >= ai.need;
      body += `<div class="tr-meter"><div class="tr-meter-bar"><div class="tr-zone" style="width:50%"></div><div class="tr-needle ${valueOk ? 'good' : 'bad'}" style="left:${pos}%"></div></div>
        <div class="row small" style="margin-top:9px"><span class="good-t">They accept</span><div class="spacer"></div><b>${U.esc(bm.label)}</b><div class="spacer"></div><span class="bad-t">They pass</span></div>
        <div class="tiny dim" style="margin-top:4px">Trade value to ${them.abbr}: getting ${ai.get.toFixed(1)}, giving ${ai.give.toFixed(1)} (net ${ai.net >= 0 ? '+' : ''}${ai.net.toFixed(1)}, they want ${ai.need >= 0 ? '+' : ''}${ai.need.toFixed(1)})</div></div>`;
      body += ev.sides.map(s => {
        const t = S.teams[s.tid];
        return `<div class="tr-sal ${s.salaryOk ? '' : 'bad'}"><span>${t.abbr}</span><span>out ${U.money(s.salOut, true)}</span><span>in ${U.money(s.salIn, true)}</span>
          <span>payroll ${U.money(s.payroll, true)} → <b>${U.money(s.payAfter, true)}</b></span>${s.payAfter > L.cap ? `<span class="${s.salaryOk ? 'dim' : 'bad-t'}">may take in ${U.money(s.maxIn, true)}</span>` : '<span class="good-t">under the cap</span>'}
          <span class="${s.rosterOk ? 'dim' : 'bad-t'}">roster ${s.rosterNow} → ${s.rosterAfter}</span></div>`;
      }).join('');
      const msgs = [];
      if (ev.ok) msgs.push(`<div class="good-t">✓ ${U.esc(them.city)} would accept this deal.</div>`);
      ev.errors.forEach(e => msgs.push(`<div class="bad-t">✕ ${U.esc(e)}</div>`));
      ev.reasons.forEach(r => msgs.push(`<div class="warn-t">• ${U.esc(r)}</div>`));
      body += `<div class="tr-msgs">${msgs.join('')}</div>`;
    } else {
      body += '<p class="small muted" style="margin:12px 0 0">Click players or picks on either side to build a deal. The meter shows how the other front office values it.</p>';
    }
    const status = !st.open ? `<div class="tr-note"><span class="bad-t bold">🔒 ${U.esc(st.reason)}</span></div>`
      : st.daysLeft != null && st.daysLeft <= 21 ? `<div class="tr-note">⏰ The trade deadline is ${st.daysLeft ? 'in ' + U.plural(st.daysLeft, 'day') : 'today'}.</div>` : '';
    return `<div class="card accent"><div class="card-h"><h3>The deal</h3><div class="actions"><button class="btn ghost sm" data-tr="clear" ${any ? '' : 'disabled'}>Clear</button>${UI.teamBadge(S.teams[u], 24)}<span class="dim">⇄</span>${UI.teamBadge(them, 24)}</div></div>
      <div class="card-b">
        ${status}
        <div class="tr-sides" style="margin-top:8px">
          <div><span class="os-lbl">You send</span><div class="tr-chips">${chips(S, ts.give)}</div></div>
          <div><span class="os-lbl">${U.esc(them.abbr)} send</span><div class="tr-chips">${chips(S, ts.get)}</div></div>
        </div>
        ${body}
        <div class="row" style="margin-top:14px"><button class="btn primary" data-tr="propose" ${any && st.open ? '' : 'disabled'}>🤝 Propose Trade</button>
          <button class="btn" data-tr="balance" ${any && st.open ? '' : 'disabled'} title="They add from your side until they would say yes">⚖️ What Would It Take?</button></div>
        ${noteHtml()}
      </div></div>`;
  }

  function offerRow(S, x, i) {
    const t = S.teams[x.tid];
    const o = x.offer;
    const extra = o.give[0].pids.filter(id => !ts.shop.pids.includes(id)).map(id => S.players[id]).filter(Boolean);
    return `<div class="os-li" style="align-items:flex-start">${UI.teamBadge(t, 30)}
      <div style="flex:1;min-width:0"><div class="small bold">${U.esc(t.city)} ${U.esc(t.name)} <span class="tag ${x.gain >= 0 ? 'good' : 'warn'}" title="Trade value you gain (+) or give up (-) by your front office's numbers">${x.gain >= 0 ? '+' : ''}${x.gain.toFixed(1)} for you</span></div>
        <div class="tr-chips" style="margin-top:6px">${chips(S, o.give[1])}</div>
        ${extra.length ? `<div class="tiny dim" style="margin-top:4px">You also send ${extra.map(p => U.esc(PBC.Player.shortName(p))).join(', ')} to match salaries</div>` : ''}</div>
      <button class="btn sm primary" data-trload="${i}">Load</button></div>`;
  }

  function blockCard(S) {
    const T = Tr();
    const has = assets(ts.give) > 0;
    const shop = ts.shop && ts.shop.ver === verKey(S) ? ts.shop : null;
    if (!shop) ts.shop = null;
    const what = shop ? shop.pids.map(id => S.players[id]).filter(Boolean).map(p => U.esc(PBC.Player.shortName(p)))
      .concat(shop.picks.map(k => { const pk = T.findPick(S, k); return pk ? U.esc(T.pickLabel(S, pk)) : ''; })).filter(Boolean).join(', ') : '';
    return `<div class="card"><div class="card-h"><h3>📣 Trade block</h3><div class="actions"><button class="btn sm ${has ? 'primary' : ''}" data-tr="shop" ${has && T.status(S).open ? '' : 'disabled'}>Find Offers</button></div></div>
      <div class="card-b ${shop ? 'flush' : ''}">${shop
        ? `<div class="os-sub">Best offers for ${what || 'your package'}</div>${shop.list.length ? shop.list.map((x, i) => offerRow(S, x, i)).join('') : '<div class="empty small">No team wants to deal for that package right now.</div>'}`
        : `<p class="small muted" style="margin:0">${has ? 'Put the players and picks you selected on the block and see what the league offers.' : 'Select players or picks on your side, then see what other teams would give for them.'}</p>`}</div></div>`;
  }

  function historyCard(S, u) {
    const all = S.trades || [];
    const list = (ts.hist === 'mine' ? all.filter(r => r.user) : all).slice(0, 12);
    const when = r => (r.phase === 'regular' ? PBC.League.dateLabel(S, r.day) : r.phase === 'draft' ? 'draft' : r.phase === 'preseason' ? 'preseason' : 'offseason');
    return `<div class="card" style="margin-top:16px"><div class="card-h"><h3>Recent trades</h3><div class="actions"><div class="seg">
        <button class="${ts.hist === 'mine' ? 'on' : ''}" data-trh="mine">Yours</button><button class="${ts.hist === 'all' ? 'on' : ''}" data-trh="all">League</button></div></div></div>
      <div class="card-b flush">${list.length ? list.map(r => `<div class="os-li small ${r.tids.includes(u) ? 'me' : ''}">${r.tids.map(tid => UI.teamBadge(S.teams[tid], 22)).join('')}
        <span style="flex:1;min-width:0">${U.esc(r.text)}</span><span class="tiny dim nowrap">${U.seasonLabel(r.season)} · ${when(r)}</span></div>`).join('') : `<div class="empty small">${ts.hist === 'mine' ? 'You haven’t made a trade yet.' : 'No trades yet.'}</div>`}</div></div>`;
  }

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------
  async function runShop(S) {
    const pids = ts.give.pids.slice(), picks = ts.give.picks.slice();
    if (!pids.length && !picks.length) return;
    const list = await UI.busy('Calling around the league…', () => Tr().shop(S, pids, picks, 5));
    ts.shop = { ver: verKey(S), pids, picks, list: list || [] };
    if (UI.current().key === 'trade') UI.refresh();
  }

  function whatItTakes(S, u) {
    const T = Tr();
    const them = S.teams[ts.tid];
    const before = offerOf(u);
    const res = assets(ts.give) ? T.balance(S, before, 0) : T.whatWouldYouWant(S, ts.tid, ts.get.pids, ts.get.picks);
    if (!res) {
      const ev = T.evaluate(S, before);
      const hard = ev.errors.find(e => !/Salaries don't match|would have/.test(e));
      const full = ev.sides.find(s => !s.rosterOk);
      ts.note = {
        tone: 'bad',
        text: hard || (full ? `${full.isUser ? 'Your roster' : `${them.abbr}’s roster`} would be ${full.rosterAfter > full.rosterNow ? 'over the limit' : 'too thin'} (${full.rosterAfter} players). ${full.isUser ? 'Add one of your players to the deal first, then ask again.' : 'Take one of their players back, then ask again.'}` : `${them.abbr} can’t find a package on your roster that works for them.`),
      };
      UI.refresh();
      return;
    }
    const o = res.offer;
    const added = o.give[0].pids.filter(id => !before.give[0].pids.includes(id)).map(id => nm(S.players[id]))
      .concat(o.give[0].picks.filter(k => !before.give[0].picks.includes(k)).map(k => T.pickLabel(S, T.findPick(S, k)) + ' pick'));
    const theirs = o.give[1].pids.filter(id => !before.give[1].pids.includes(id)).map(id => nm(S.players[id]));
    ts.give = copy(o.give[0]);
    ts.get = copy(o.give[1]);
    ts.note = {
      tone: 'good',
      text: (added.length ? `${them.abbr} would say yes if you add ${added.join(', ')}.` : `${them.abbr} would already say yes.`) + (theirs.length ? ` They include ${theirs.join(', ')} to make the salaries work.` : ''),
    };
    UI.refresh();
  }

  async function propose(S, u) {
    const T = Tr();
    const offer = offerOf(u);
    const them = S.teams[ts.tid];
    const ev = T.evaluate(S, offer);
    if (!ev.ok) {
      ts.note = { tone: 'bad', text: ev.errors.length ? ev.msg : `Rejected. ${ev.msg}` };
      UI.refresh();
      return;
    }
    const ok = await UI.confirm(`The <b>${U.esc(them.city)} ${U.esc(them.name)}</b> accept!<p style="margin:10px 0 0">${U.esc(T.describe(S, offer))}</p><p class="small muted" style="margin:10px 0 0">Make it official?</p>`, { title: '🤝 Deal agreed', ok: 'Make the Trade' });
    if (!ok) return;
    const r = T.execute(S, offer);
    if (!r.ok) { ts.note = { tone: 'bad', text: r.msg }; UI.refresh(); return; }
    reset(true);
    ts.shop = null;
    ts.note = { tone: 'good', text: `Trade complete: ${r.rec.text}` };
    UI.save();
    UI.refresh();
    UI.toast('🔄 Trade complete!', 'good');
  }

  // ---------------------------------------------------------------------------
  // Screen
  // ---------------------------------------------------------------------------
  UI.register('trade', {
    title: 'Trades',
    render(root, params) {
      const S = UI.S;
      const T = Tr();
      const L = PBC.League.cfg(S);
      const u = OU.userTid(S);
      if (ts.S !== S) { reset(false); ts.shop = null; ts.S = S; }
      if (u < 0) {
        root.innerHTML = `<div class="page os">${OU.steps(S)}<div class="page-h"><div><h1>Trades</h1></div></div>
          <div class="card"><div class="empty">You need a job before you can make trades. ${UI.continueInfo() ? OU.contBtn() : ''}</div></div>${historyCard(S, u)}</div>`;
        UI.on(root, 'click', '[data-trh]', (e, el) => { ts.hist = el.dataset.trh; UI.refresh(); });
        return;
      }
      takeParams(S, u, params);
      clean(S, u);
      const st = T.status(S);
      const them = ts.tid != null ? S.teams[ts.tid] : null;
      const any = assets(ts.give) + assets(ts.get) > 0;
      const ev = them && any ? T.evaluate(S, offerOf(u)) : null;
      const status = !st.open ? `<span class="bad-t">🔒 ${U.esc(st.reason)}</span>`
        : S.phase === 'regular' ? `The trade window is open${S.tradeDeadlineDay != null ? ` until the deadline on ${PBC.League.dateLabel(S, S.tradeDeadlineDay)} (${U.plural(st.daysLeft, 'day')} left)` : ''}`
        : OU.isOffseason(S) ? `Offseason window · you may carry up to ${L.rosterMax + PBC.Offseason.OFFSEASON_EXTRA} players until the season starts`
        : 'The preseason trade window is open';
      root.innerHTML = `<div class="page os">
        ${OU.steps(S)}
        <div class="page-h"><div><h1>Trades</h1><div class="sub">${status}</div></div></div>
        <div class="tr-teams">${S.teams.filter(t => t.id !== u).map(t => `<button class="tr-team ${ts.tid === t.id ? 'on' : ''}" data-trteam="${t.id}" style="--tc:${t.colors.primary}" title="${U.esc(t.city + ' ' + t.name)} · ${MODE[T.teamMode(S, t.id)]}">${UI.teamBadge(t, 34)}${t.abbr}</button>`).join('')}</div>
        <div class="tr-grid">
          ${sideCard(S, u, 0, ts.give)}
          <div class="tr-mid stack">
            ${them ? dealCard(S, u, ev, st) : `<div class="card accent"><div class="card-h"><h3>Build a trade</h3></div><div class="card-b"><p class="small muted" style="margin:0">Pick a trade partner from the row above, then click players and picks on both sides. Contenders pay for proven veterans; rebuilding teams want youth and draft picks.</p>${noteHtml()}</div></div>`}
            ${blockCard(S)}
          </div>
          ${them ? sideCard(S, ts.tid, 1, ts.get) : '<div class="card"><div class="empty">Choose a trade partner above to see their roster and picks.</div></div>'}
        </div>
        ${historyCard(S, u)}
      </div>`;
      // keep the selected partner in view in the team strip
      const strip = root.querySelector('.tr-teams'), onTeam = root.querySelector('.tr-team.on');
      if (strip && onTeam) strip.scrollLeft = Math.max(0, onTeam.getBoundingClientRect().left - strip.getBoundingClientRect().left - (strip.clientWidth - onTeam.offsetWidth) / 2);

      UI.on(root, 'click', '[data-trteam]', (e, el) => {
        const tid = +el.dataset.trteam;
        if (tid === ts.tid) return;
        ts.tid = tid;
        ts.get = side0();
        ts.note = null;
        UI.refresh();
      });
      UI.on(root, 'click', '[data-trp]', (e, el) => {
        if (e.target.closest('[data-open-player]')) return;
        if (el.classList.contains('blocked') && !el.classList.contains('on')) { UI.toast(U.esc(el.title || 'Not tradable right now.'), 'bad'); return; }
        toggle((+el.dataset.side === 0 ? ts.give : ts.get).pids, +el.dataset.trp);
        ts.note = null;
        UI.refresh();
      });
      UI.on(root, 'click', '[data-trk]', (e, el) => {
        toggle((+el.dataset.side === 0 ? ts.give : ts.get).picks, el.dataset.trk);
        ts.note = null;
        UI.refresh();
      });
      UI.on(root, 'click', '[data-tr]', (e, el) => {
        const a = el.dataset.tr;
        if (a === 'clear') { reset(true); UI.refresh(); }
        if (a === 'shop') runShop(S);
        if (a === 'balance' && ts.tid != null) whatItTakes(S, u);
        if (a === 'propose' && ts.tid != null) propose(S, u);
      });
      UI.on(root, 'click', '[data-trload]', (e, el) => {
        const x = ts.shop && ts.shop.list[+el.dataset.trload];
        if (!x) return;
        ts.tid = x.tid;
        ts.give = copy(x.offer.give[0]);
        ts.get = copy(x.offer.give[1]);
        ts.note = { tone: 'good', text: `${S.teams[x.tid].abbr} would do this deal. Propose it to make it official.` };
        UI.refresh();
      });
      UI.on(root, 'click', '[data-trh]', (e, el) => { ts.hist = el.dataset.trh; UI.refresh(); });
      if (ts.shopAuto) {
        ts.shopAuto = false;
        if (st.open) setTimeout(() => { if (UI.current().key === 'trade' && UI.S === S) runShop(S); }, 30);
      }
    },
  });
})();
