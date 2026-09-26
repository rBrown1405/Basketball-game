/* Pro BBALL Coach - the draft screen: on-the-clock header, big board with scouted ranges and grades, the draft
   order, "sim to my pick" with an animated ticker, your picks, and the results once the draft is done. */
(function () {
  'use strict';
  const PBC = window.PBC;
  const U = PBC.U, C = PBC.Config, UI = PBC.UI, OU = PBC.OffUI;
  const Dr = () => PBC.Draft;
  const TICK_MS = 160;
  const ds = { S: null, tab: 'board', pos: 'all', memo: {}, timer: null, ticking: false };
  const here = () => UI.current().key === 'draft';
  const nm = p => PBC.Player.name(p);

  // ---------------------------------------------------------------------------
  // Draft flow
  // ---------------------------------------------------------------------------
  function stopTick() {
    clearTimeout(ds.timer);
    ds.timer = null;
    ds.ticking = false;
  }
  OU.draftStop = stopTick;

  function nudge() {
    UI.toast('You’re on the clock! Draft a prospect from the big board, or take your scouts’ pick.', 'info');
  }

  /** Repaint just the draft screen (like UI.refresh, but the top bar and nav stay put so clicks on them land). */
  function paint() {
    const host = document.getElementById('screen');
    if (!host || !here()) return;
    const y = host.scrollTop;
    host.innerHTML = '';
    const root = document.createElement('div');
    root.className = 'screen-root';
    host.appendChild(root);
    try { renderDraft(root); } catch (e) { console.error(e); }
    host.scrollTop = y;
  }

  /** One AI pick every TICK_MS until the user is on the clock (the board and ticker update live). */
  function tick() {
    ds.timer = null;
    const S = UI.S, D = Dr();
    if (!S || S !== ds.S || S.phase !== 'draft' || !here()) { stopTick(); return; }
    const c = D.current(S);
    if (!c || c.owner === D.userTid(S)) {
      stopTick();
      UI.save();
      UI.refresh();
      if (c) nudge();
      return;
    }
    const r = D.step(S);
    if (!r || !r.ok) { stopTick(); UI.save(); UI.refresh(); return; }
    paint();
    ds.timer = setTimeout(tick, TICK_MS);
  }

  function startTick(S) {
    if (ds.ticking) return;
    ds.S = S;
    ds.ticking = true;
    ds.tab = 'board';
    tick();
  }

  function skip(S) {
    if (!ds.ticking && !Dr().current(S)) return;
    stopTick();
    Dr().simToUser(S);
    UI.save();
    if (here()) UI.refresh();
    if (Dr().isUserTurn(S)) nudge();
  }

  async function finishDraft(S, auto) {
    stopTick();
    if (auto && !(await UI.confirm('Let your scouts make the rest of your picks? They take the best player available by what they know.', { title: 'Auto-draft', ok: 'Auto-draft' }))) return;
    await UI.busy(auto ? 'Your scouts are on the phone…' : 'Finishing the draft…', () => Dr().simAll(S));
    UI.save();
    if (here()) UI.refresh(); else UI.go('draft');
    const d = S.draftState;
    if (d && d.done) UI.toast(`📋 The ${d.year} draft is complete.`, 'good');
  }

  /** CONTINUE in the 'draft' phase: sim to my pick / nudge when on the clock / finish the draft / re-sign. */
  OU.draftAction = function (S) {
    const D = Dr();
    const d = D.state(S);
    if (!d || d.done) return OU.startResign(S);
    if (!here()) UI.go('draft');
    if (D.isUserTurn(S)) { nudge(); return; }
    if (ds.ticking) { skip(S); return; }
    if (D.userPicksLeft(S)) startTick(S); else finishDraft(S, false);
  };

  async function pickPlayer(S, pid) {
    const D = Dr();
    const c = D.current(S);
    const p = S.players[pid];
    if (!c || !p || !D.isUserTurn(S)) return;
    const v = D.view(S, p);
    const ok = await UI.confirm(`Select <b>${U.esc(nm(p))}</b> (${p.pos}, ${p.age}, ${U.esc(p.origin || '')}) with the <b>#${c.overall}</b> pick?
      <p class="small muted" style="margin:8px 0 0">Your scouts see a ${v.ovrLabel} player today with ${v.potLabel} potential (grade ${v.grade}, ${v.known}% known).</p>`, { title: 'Make the pick', ok: 'Make the Pick' });
    if (!ok || !D.isUserTurn(S) || D.current(S) !== c) return;
    const r = D.select(S, pid);
    if (!r.ok) { UI.toast(U.esc(r.msg), 'bad'); return; }
    UI.save();
    UI.refresh();
    UI.toast(`🧢 You drafted ${U.esc(nm(p))} with the #${c.overall} pick!`, 'good');
  }

  const pickKey = (d, o) => `${d.year}:${o.round}:${o.orig}`;

  // ---------------------------------------------------------------------------
  // Pieces
  // ---------------------------------------------------------------------------
  function tickerHtml(S, x, u) {
    const p = S.players[x.pid], t = S.teams[x.tid];
    if (!p || !t) return '';
    const rank = p.draft && p.draft.rank;
    const diff = rank ? x.overall - rank : 0;
    const tag = diff >= 8 ? ' <span class="tag good">Value pick</span>' : diff <= -12 ? ' <span class="tag warn">Reach</span>' : '';
    return `<div class="dr-ticker">🧢 <b>#${x.overall}</b> · ${UI.teamBadge(t, 20)} ${x.tid === u ? '<b>You</b> select' : `<b>${t.abbr}</b> select`} ${UI.playerLink(p)} <span class="dim">(${p.pos}, ${p.age}, ${U.esc(p.origin || '')})</span>${rank ? ` · board #${rank}` : ''}${tag}</div>`;
  }

  function clockHtml(S, d, u, st) {
    const D = Dr();
    const { c, hidden, pre, left } = st;
    const cont = OU.contBtn();
    if (hidden) {
      return `<div class="dr-clock done"><div class="dr-clock-t">🎰 The lottery comes first</div>
        <div class="dr-clock-s">The draft order is set once the lottery balls are drawn. Until then, work the big board and send your scouts out.</div>
        <div class="row" style="margin-top:12px"><button class="btn primary" data-nav="lottery">🎰 Go to the Draft Lottery</button><button class="btn" data-nav="scouting">🔭 Scouting</button></div></div>`;
    }
    if (pre) {
      const first = d.order.find(o => o.owner === u);
      return `<div class="dr-clock done"><div class="dr-clock-t">The ${d.year} draft opens next</div>
        <div class="dr-clock-s">${first ? `Your first pick is <b>#${first.overall}</b>.` : 'You have no picks in this draft.'} Scout the class, then start the draft.</div>
        <div class="row" style="margin-top:12px">${cont}<button class="btn" data-nav="scouting">🔭 Scouting</button></div></div>`;
    }
    if (d.done) {
      const mine = d.order.filter(o => o.owner === u && o.pid != null && S.players[o.pid]);
      const cur = d.year === S.season + 1 && S.phase === 'draft';
      return `<div class="dr-clock done"><div class="dr-clock-t">The ${d.year} draft is complete</div>
        <div class="dr-clock-s">${u < 0 ? '' : mine.length ? 'Your class: ' + mine.map(o => `${UI.playerLink(S.players[o.pid])} <span class="dim">(#${o.overall})</span>`).join(', ') + '.' : 'You didn’t make a pick this year.'} Undrafted prospects are now free agents.</div>
        ${cur ? `<div class="row" style="margin-top:12px">${cont}</div>` : ''}</div>`;
    }
    if (c.owner === u) {
      const best = D.userChoice(S);
      const bv = best ? D.view(S, best) : null;
      return `<div class="dr-clock mine"><div class="row" style="gap:14px;flex-wrap:nowrap">${UI.teamBadge(S.teams[u], 58)}<div style="flex:1;min-width:0">
          <div class="dr-clock-t">🚨 You’re on the clock</div>
          <div class="dr-clock-s">Round ${c.round}, pick ${c.pick} (#${c.overall} overall)${c.orig !== u ? ` · via ${S.teams[c.orig].abbr}` : ''}.${best ? ` Your scouts like <b>${U.esc(nm(best))}</b> (${best.pos}, grade ${bv.grade}).` : ''} Hit <b>Draft</b> on any prospect.</div></div></div>
        <div class="row" style="margin-top:12px">${best ? `<button class="btn primary" data-dr="scouts">🧢 Draft ${U.esc(PBC.Player.shortName(best))}</button>` : ''}
          <button class="btn" data-dr="shop" title="See what teams would give for this pick">🔄 Shop This Pick</button>${left.length > 1 ? '<button class="btn ghost" data-dr="auto">🤖 Auto-draft the Rest</button>' : ''}</div></div>`;
    }
    const t = S.teams[c.owner];
    const nextMine = left[0];
    const away = nextMine ? nextMine.overall - c.overall : 0;
    const btns = ds.ticking ? '<button class="btn" data-dr="skip">⏭ Skip to My Pick</button>'
      : `<button class="btn" data-dr="step">▶ Next Pick</button>${nextMine ? '<button class="btn primary" data-dr="sim">⏩ Sim to My Pick</button>' : '<button class="btn primary" data-dr="finish">⏩ Finish Draft</button>'}${u >= 0 ? `<button class="btn ghost" data-dr="tradeup" title="Call ${t.abbr} about this pick">🔄 Trade for #${c.overall}</button>` : ''}`;
    return `<div class="dr-clock" style="--tc:${t.colors.primary}">${UI.teamBadge(t, 58)}
      <div style="flex:1;min-width:0"><div class="tiny up dim" style="letter-spacing:2px">On the clock · pick #${c.overall}</div><div class="dr-clock-t">${U.esc(t.city)} ${U.esc(t.name)}</div>
        <div class="dr-clock-s">Round ${c.round}, pick ${c.pick}${c.orig !== c.owner ? ` · via ${S.teams[c.orig].abbr}` : ''} · ${u < 0 ? 'every team is AI-run while you’re between jobs' : nextMine ? `your next pick: <b>#${nextMine.overall}</b> (${U.plural(away, 'pick')} away)` : 'you have no picks left'}</div></div>
      <div class="row">${btns}</div></div>`;
  }

  function yourPicksCard(S, d, u, c, hidden) {
    if (u < 0) return '';
    const mine = d.order.filter(o => o.owner === u);
    const body = hidden ? '<div class="empty small">Revealed after the lottery.</div>' : mine.length ? mine.map(o => {
      const p = o.pid != null ? S.players[o.pid] : null;
      const on = !!c && c === o;
      const away = c && !p ? o.overall - c.overall : 0;
      return `<div class="os-li ${on ? 'hl' : ''}">${OU.pick(o.overall)}<div style="flex:1;min-width:0">${p ? OU.pcell(p, `Rd ${o.round}, pick ${o.pick} · ${p.pos} · ${p.age} yrs`, 30)
        : `<div class="small bold">Round ${o.round}, pick ${o.pick}</div><div class="tiny dim">${o.orig !== u ? 'via ' + S.teams[o.orig].abbr : 'own pick'}${away > 0 ? ` · ${U.plural(away, 'pick')} away` : ''}</div>`}</div>${p ? UI.ovr(p.ovr) : on ? '<span class="tag accent">On the clock</span>' : ''}</div>`;
    }).join('') : '<div class="empty small">No picks in this draft. Trade for one before the board runs dry!</div>';
    return `<div class="card accent"><div class="card-h"><h3>Your picks</h3><div class="actions"><span class="tag">${mine.length}</span></div></div><div class="card-b flush">${body}</div></div>`;
  }

  function orderCard(S, d, u, c, hidden) {
    let html;
    if (hidden) html = '<div class="empty small">The order is set by the lottery.</div>';
    else {
      const rounds = U.groupBy(d.order, o => o.round);
      html = Object.keys(rounds).map(rd => `<div class="os-sub">Round ${rd}</div>` + rounds[rd].map(o => {
        const t = S.teams[o.owner];
        const p = o.pid != null ? S.players[o.pid] : null;
        const on = !!c && c === o;
        return `<div class="os-li ${o.owner === u ? 'me' : ''} ${on ? 'hl' : ''}"${on ? ' data-cur' : ''}>${OU.pick(o.overall)}${UI.teamBadge(t, 22)}
          <div style="flex:1;min-width:0"><div class="small bold">${t.abbr}${o.orig !== o.owner ? ` <span class="tiny dim">via ${S.teams[o.orig].abbr}</span>` : ''}</div>
          ${p ? `<div class="tiny ellip">${UI.playerLink(p)} <span class="dim">${p.pos}</span></div>` : on ? '<div class="tiny accent-t bold">On the clock</div>' : ''}</div>${p ? UI.ovr(p.ovr) : ''}</div>`;
      }).join('')).join('');
    }
    return `<div class="card"><div class="card-h"><h3>Draft order</h3><div class="actions"><span class="small muted">${d.order.length} picks</span></div></div>
      <div class="card-b flush" id="dr-order" style="max-height:560px;overflow-y:auto;position:relative">${html}</div></div>`;
  }

  // ---------------------------------------------------------------------------
  // Screen
  // ---------------------------------------------------------------------------
  function renderDraft(root) {
    const S = UI.S;
    const D = Dr();
    if (ds.S !== S) { stopTick(); ds.S = S; }
    const d = S.draftState;
    const u = D.userTid(S);
    if (!d) {
      root.innerHTML = `<div class="page os">${OU.steps(S)}<div class="page-h"><div><h1>Draft</h1></div><div class="actions"><button class="btn" data-nav="scouting">🔭 Scouting</button></div></div>
        <div class="card"><div class="empty">The draft is held after the season. Scout the incoming class in the meantime.</div></div></div>`;
      return;
    }
    const L = PBC.League.cfg(S);
    const cur = d.year === S.season + 1;
    const pre = cur && S.phase === 'draft_lottery';
    const hidden = pre && !OU.lotterySeen(S);
    const live = cur && S.phase === 'draft' && !d.done;
    const c = live ? D.current(S) : null;
    const myTurn = live && !!c && c.owner === u;
    const avail = !d.done && cur ? D.available(S) : [];
    const made = d.order.filter(o => o.pid != null && S.players[o.pid]);
    const mine = d.order.filter(o => o.owner === u);
    const left = mine.filter(o => o.pid == null);
    if (!live && ds.ticking) stopTick();
    const tabs = [];
    if (avail.length) tabs.push(['board', `Big Board (${avail.length})`]);
    if (made.length) tabs.push(['results', `${d.done ? 'Draft Results' : 'Picks Made'} (${made.length})`]);
    if (tabs.length && !tabs.some(t => t[0] === ds.tab)) ds.tab = tabs[0][0];
    const sub = d.done ? `${made.length} players drafted${cur ? '' : ' last summer'}`
      : live ? `Round ${c.round} · pick ${c.pick} · #${c.overall} of ${d.order.length} · ${avail.length} prospects left`
      : `${avail.length} prospects · ${U.plural(L.draftRounds, 'round')} · ${d.order.length} picks${hidden ? ' · order set by the lottery' : mine.length ? ' · your picks: ' + mine.map(o => '#' + o.overall).join(', ') : ''}`;
    const last = !hidden && d.log.length ? d.log[d.log.length - 1] : null;
    root.innerHTML = `<div class="page os">
      ${OU.steps(S)}
      <div class="page-h"><div><h1>${d.year} Draft</h1><div class="sub">${sub}</div></div>
        <div class="actions">${cur && !d.done ? '<button class="btn" data-nav="scouting">🔭 Scouting</button>' : ''}${cur ? '<button class="btn" data-nav="lottery">🎰 Lottery</button>' : ''}<button class="btn" data-nav="trade">🔄 Trades</button></div></div>
      ${clockHtml(S, d, u, { c, hidden, pre, left })}
      ${last && !d.done ? tickerHtml(S, last, u) : ''}
      <div class="grid g-main" style="margin-top:16px">
        <div class="card"><div class="card-h">${tabs.length ? `<div class="tabs">${tabs.map(([k, l]) => `<button class="tab ${ds.tab === k ? 'active' : ''}" data-dtab="${k}">${l}</button>`).join('')}</div>` : '<h3>Big Board</h3>'}
          ${ds.tab === 'board' && avail.length ? `<div class="actions"><div class="seg">${['all'].concat(C.POSITIONS).map(pz => `<button class="${ds.pos === pz ? 'on' : ''}" data-dpos="${pz}">${pz === 'all' ? 'All' : pz}</button>`).join('')}</div></div>` : ''}</div>
          <div class="card-b flush" id="dr-tbl"></div>
          ${ds.tab === 'board' && avail.length ? '<p class="hint" style="padding:6px 16px 4px;margin:0">Ranges narrow as your scouts learn more. Grades are based on scouted potential. # is the media big board.</p>' : ''}</div>
        <div class="stack">
          ${yourPicksCard(S, d, u, c, hidden)}
          ${orderCard(S, d, u, c, hidden)}
        </div>
      </div></div>`;
    const el = root.querySelector('#dr-tbl');
    if (ds.tab === 'results' && made.length) {
      const m = OU.sortMemo(ds.memo, 'results', 'pick', false);
      const t = UI.table(el, {
        rows: made.map(o => ({ o, p: S.players[o.pid] })), sort: m.sort, desc: m.desc, compact: true,
        rowClass: r => (r.o.owner === u ? 'me' : ''),
        columns: [
          { key: 'pick', label: 'Pick', num: true, value: r => r.o.overall, fmt: r => OU.pick(r.o.overall) },
          { key: 'rd', label: 'Rd', num: true, value: r => r.o.overall, fmt: r => `<span class="dim">${r.o.round}-${r.o.pick}</span>` },
          { key: 'team', label: 'Team', value: r => S.teams[r.o.owner].abbr, fmt: r => `<span class="row nowrap" style="gap:6px">${UI.teamBadge(S.teams[r.o.owner], 22)}<b>${S.teams[r.o.owner].abbr}</b>${r.o.orig !== r.o.owner ? `<span class="tiny dim">via ${S.teams[r.o.orig].abbr}</span>` : ''}</span>` },
          { key: 'name', label: 'Player', value: r => r.p.last, fmt: r => OU.pcell(r.p, `${r.p.pos} · ${r.p.age} yrs · ${U.esc(r.p.origin || '')}`, 30) },
          { key: 'ovr', label: 'OVR', num: true, value: r => r.p.ovr, fmt: r => UI.ovr(r.p.ovr) },
          { key: 'pot', label: 'POT', num: true, value: r => r.p.pot, fmt: r => UI.potLabel(r.p) },
          {
            key: 'board', label: 'Board', num: true, title: 'Media big board rank', value: r => (r.p.draft && r.p.draft.rank) || 999,
            fmt: r => { const rk = r.p.draft && r.p.draft.rank; if (!rk) return '<span class="dim">-</span>'; const df = r.o.overall - rk; return `${df >= 8 ? '<span class="tag good">Value</span> ' : df <= -12 ? '<span class="tag warn">Reach</span> ' : ''}<span class="dim">#${rk}</span>`; },
          },
        ],
        onRow: r => UI.openPlayer(r.p.id),
      });
      m.keep(t);
    } else if (avail.length) {
      const best = (live || pre) && u >= 0 ? D.userChoice(S) : null;
      const rows = avail.filter(p => ds.pos === 'all' || p.pos === ds.pos).map(p => ({ p, v: D.view(S, p) }));
      const m = OU.sortMemo(ds.memo, 'board', 'rank', false);
      const cols = [
        { key: 'rank', label: '#', num: true, title: 'Media big board rank', value: r => r.p.draft.rank || 999, fmt: r => `<span class="dim">${r.p.draft.rank || '-'}</span>` },
        { key: 'star', label: '★', nosort: true, fmt: r => OU.star(r.p) },
        { key: 'name', label: 'Prospect', value: r => r.p.last, fmt: r => OU.pcell(r.p, `${r.p.pos} · ${r.p.age} yrs · ${U.height(r.p.hgt)}${best && r.p.id === best.id ? ' · <span class="gold-t bold">Scouts’ pick</span>' : ''}`, 30) },
        { key: 'ovr', label: 'OVR', num: true, value: r => r.v.ovr.est, fmt: r => OU.rng(r.v.ovr) },
        { key: 'pot', label: 'POT', num: true, value: r => r.v.pot.est, fmt: r => OU.rng(r.v.pot) },
        { key: 'grade', label: 'Grade', value: r => r.v.pot.est, fmt: r => OU.grade(r.v.grade) },
        { key: 'known', label: 'Scouted', value: r => r.v.known, fmt: r => OU.known(r.v.known) },
      ];
      if (myTurn) cols.push({ key: 'go', label: '', nosort: true, fmt: r => `<button class="btn sm ${best && r.p.id === best.id ? 'primary' : ''}" data-pick="${r.p.id}">Draft</button>` });
      const t = UI.table(el, {
        rows, sort: m.sort, desc: m.desc, compact: true,
        rowClass: r => (best && r.p.id === best.id ? 'dr-best' : ''),
        empty: 'No prospects left at this position.',
        columns: cols,
        onRow: r => UI.openPlayer(r.p.id),
      });
      m.keep(t);
    } else {
      el.innerHTML = '<div class="empty">No prospects on the board.</div>';
    }
    // keep the pick on the clock in view
    const ord = root.querySelector('#dr-order');
    const hl = ord && ord.querySelector('[data-cur]');
    if (hl) ord.scrollTop = Math.max(0, hl.offsetTop - 110);

    UI.on(root, 'click', '[data-dtab]', (e, b) => { ds.tab = b.dataset.dtab; UI.refresh(); });
    UI.on(root, 'click', '[data-dpos]', (e, b) => { ds.pos = b.dataset.dpos; UI.refresh(); });
    UI.on(root, 'click', '[data-pick]', (e, b) => { e.stopPropagation(); pickPlayer(S, +b.dataset.pick); });
    // the board repaints every tick while simming: react to the press itself so the click can't get lost
    UI.on(root, 'pointerdown', '[data-dr="skip"]', e => { if (ds.ticking && e.button === 0) skip(S); });
    UI.on(root, 'click', '[data-dr]', (e, b) => {
      const a = b.dataset.dr;
      const now = D.current(S);
      if (a === 'sim') startTick(S);
      if (a === 'skip' && ds.ticking) skip(S);
      if (a === 'finish') finishDraft(S, false);
      if (a === 'auto') finishDraft(S, true);
      if (a === 'scouts') { const p = D.userChoice(S); if (p) pickPlayer(S, p.id); }
      if (a === 'step') {
        const r = D.step(S);
        if (r && r.ok) { UI.save(); UI.refresh(); if (D.isUserTurn(S)) nudge(); }
      }
      if (a === 'tradeup' && now) UI.go('trade', { tid: now.owner, getPicks: [pickKey(d, now)] });
      if (a === 'shop' && now) UI.go('trade', { givePicks: [pickKey(d, now)] });
    });
  }

  UI.register('draft', {
    title: 'Draft',
    render: renderDraft,
    onLeave() {
      // leaving mid-sim finishes the sim to the user's pick
      if (!ds.ticking) return;
      stopTick();
      const S = UI.S;
      if (S && S.phase === 'draft') { Dr().simToUser(S); UI.save(); }
    },
  });
})();
