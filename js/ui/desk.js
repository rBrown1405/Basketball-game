/* Pro BBALL Coach — the Desk screen: what needs you today (PBC.Desk), the Home card, and the room's numbers. */
(function () {
  'use strict';
  const PBC = window.PBC;
  const U = PBC.U, UI = PBC.UI;
  const Dk = () => PBC.Desk;

  const FAM = { locker: 'Locker room', owner: 'Owner', press: 'Press', staff: 'Staff', league: 'League', community: 'Community' };
  const FAM_ICON = { locker: '🏀', owner: '💼', press: '🎙️', staff: '📋', league: '📞', community: '🤝' };
  // the face a player wears on the card (the portrait module's expressions)
  const FACE = {
    pt_more: 'annoyed', start_me: 'intense', more_shots: 'smirk', late_film: 'neutral', contract_talk: 'serious', trade_req_meet: 'annoyed',
    slump: 'serious', big_night: 'grin', milestone: 'grin', rookie_wall: 'serious', exit_interview: 'focused', one_more_year: 'smile',
    vet_mentor: 'smile', quote_storm: 'cocky', allstar_snub: 'intense', start_me_later: 'annoyed', beef_flare: 'mean', mentor_tick: 'smile',
    trash_talk: 'cocky',
  };
  const STOP_MODES = [
    { key: 'important', label: 'Important', desc: 'The sim stops for important decisions (the owner, a feud, a trade request, a promise). The rest wait on your desk.' },
    { key: 'all', label: 'Every decision', desc: 'The sim stops whenever any decision lands on your desk.' },
    { key: 'never', label: 'Never', desc: 'The sim never stops. Anything you leave gets your staff\'s answer when it runs out.' },
  ];
  UI.DESK_STOP = STOP_MODES;

  const ds = { filter: 'all', fresh: {}, histAll: false };

  // ---------------------------------------------------------------------------
  // Pieces
  // ---------------------------------------------------------------------------
  function tplOf(it) { return Dk().tpl(it.t) || {}; }
  function famOf(it) { return tplOf(it).fam || (it.from && it.from.type === 'owner' ? 'owner' : it.from && it.from.type === 'media' ? 'press' : it.from && it.from.type === 'staff' ? 'staff' : 'league'); }

  function fromAvatar(S, it, size) {
    const f = it.from || {};
    if (f.type === 'player' && f.pid != null && S.players[f.pid]) {
      const p = S.players[f.pid];
      let face = FACE[it.t];
      if (it.t === 'promise_check') face = /broke/.test(it.title) ? 'annoyed' : 'smile';
      return UI.avatar(p, size, face ? { face } : undefined);
    }
    if (f.type === 'team' && f.tid != null && S.teams[f.tid]) return UI.teamBadge(S.teams[f.tid], size);
    const ico = f.type === 'owner' ? '💼' : f.type === 'media' ? '🎙️' : f.type === 'staff' ? '📋' : f.type === 'league' ? '📞' : '📌';
    return `<span class="dk-ico" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.5)}px">${ico}</span>`;
  }

  function fromLine(S, it) {
    const f = it.from || {};
    if (f.type === 'player' && f.pid != null && S.players[f.pid]) {
      const p = S.players[f.pid];
      const t = PBC.Persona ? PBC.Persona.info(PBC.Persona.of(p)) : null;
      return `<div class="dk-name">${UI.playerLink(p)}</div><div class="dk-role">${p.pos} · ${p.ovr} OVR${t ? ` · ${t.icon || ''} ${U.esc(t.label)}` : ''} · morale ${p.morale == null ? 70 : p.morale}</div>`;
    }
    return `<div class="dk-name">${U.esc(f.name || '')}</div><div class="dk-role">${U.esc(f.role || FAM[famOf(it)] || '')}</div>`;
  }

  function dueTag(S, it) {
    if (it.done) return '';
    const D = S.desk;
    if (it.due == null) return '';
    const left = it.due - D.tick;
    const inSeason = S.phase === 'regular' || S.phase === 'playin' || S.phase === 'playoffs';
    if (!inSeason) return `<span class="tag">Before the next phase</span>`;
    return `<span class="tag ${left <= 1 ? 'warn' : ''}">${left <= 0 ? 'Today' : left === 1 ? '1 day left' : left + ' days left'}</span>`;
  }

  function kindTag(it) {
    if (it.kind === 'message') return '<span class="tag info">Message</span>';
    if (it.kind === 'offer') return '<span class="tag accent">Offer</span>';
    return it.pri >= 3 ? '<span class="tag bad">Urgent</span>' : it.pri >= 2 ? '<span class="tag warn">Important</span>' : '<span class="tag">Decision</span>';
  }

  /** the chips: what an answer did (Desk.delta) */
  function chips(S, fx, small) {
    if (!fx || !fx.length) return '';
    const cls = d => (d > 0 ? 'good' : d < 0 ? 'bad' : '');
    const sg = d => (d > 0 ? '+' + d : String(d));
    const nm = id => (S.players[id] ? U.esc(S.players[id].last) : '');
    const out = fx.map(x => {
      switch (x.k) {
        case 'mor': return `<span class="dk-chip ${cls(x.d)}">Morale ${sg(x.d)} · ${nm(x.pid)}</span>`;
        case 'morN': return `<span class="dk-chip ${cls(x.d)}">Morale ${x.d > 0 ? 'up' : 'down'} · ${x.n} more</span>`;
        case 'chem': return `<span class="dk-chip ${cls(x.d)}">Chemistry ${sg(x.d)}</span>`;
        case 'fans': return `<span class="dk-chip ${cls(x.d)}">Fans ${sg(x.d)}</span>`;
        case 'media': return `<span class="dk-chip ${cls(x.d)}">Media ${sg(x.d)}</span>`;
        case 'own': return `<span class="dk-chip ${cls(x.d)}">Owner trust ${sg(x.d)}</span>`;
        case 'conf': return `<span class="dk-chip ${cls(x.d)}">Confidence ${x.d > 0 ? 'up' : 'down'} · ${x.pids.length === 1 ? nm(x.pids[0]) : x.pids.length + ' players'}</span>`;
        case 'dev': return `<span class="dk-chip good">Development · ${x.pids.length === 1 ? nm(x.pids[0]) : x.pids.length + ' players'}</span>`;
        default: return '';
      }
    }).join('');
    return `<div class="dk-fx ${small ? 'sm' : ''}">${out}</div>`;
  }

  function pickLabel(it) {
    const o = (it.opts || []).find(x => x.k === it.pick);
    return o ? o.label : '';
  }

  function openCard(S, it) {
    const fresh = ds.fresh[it.id];
    const head = `<div class="dk-from">${fromAvatar(S, it, 52)}<div class="dk-who">${fromLine(S, it)}</div>
      <div class="dk-tags">${FAM_ICON[famOf(it)] ? `<span class="tag" title="${U.esc(FAM[famOf(it)] || '')}">${FAM_ICON[famOf(it)]} ${U.esc(FAM[famOf(it)] || '')}</span>` : ''}${fresh ? '' : kindTag(it)}${fresh ? '' : dueTag(S, it)}</div></div>`;
    if (fresh) {
      return `<div class="dk-card done fresh" data-id="${it.id}">${head}
        <h3 class="dk-title">${U.esc(it.title)}</h3>
        <div class="dk-you">You: <b>${U.esc(pickLabel(it))}</b></div>
        ${it.out ? `<p class="dk-out">${U.esc(it.out)}</p>` : ''}${chips(S, it.fx)}</div>`;
    }
    const waits = it.kind === 'decision' && it.block && Dk().stopping(S).includes(it);
    return `<div class="dk-card k-${it.kind} p${it.pri} ${it.seen ? '' : 'unseen'}" data-id="${it.id}">${head}
      <h3 class="dk-title">${U.esc(it.title)}</h3>
      <p class="dk-text">${U.esc(it.text)}</p>
      ${it.opts.length ? `<div class="dk-opts">${it.opts.map(o => `<button class="dk-opt" data-ans="${U.esc(o.k)}"><b>${U.esc(o.label)}</b>${o.hint ? `<span>${U.esc(o.hint)}</span>` : ''}</button>`).join('')}</div>` : ''}
      ${waits ? '<div class="tiny dim dk-wait">The sim waits for this one.</div>' : ''}</div>`;
  }

  function msgRow(S, it) {
    return `<div class="dk-msg ${it.seen ? '' : 'unseen'}" data-msg="${it.id}">${fromAvatar(S, it, 36)}
      <div class="dk-msg-b"><div class="row nowrap"><b class="dk-msg-t">${U.esc(it.title)}</b><div class="spacer"></div><span class="tiny dim">${when(S, it)}</span></div>
      <div class="small muted">${U.esc(it.text)}</div></div></div>`;
  }

  function when(S, it) {
    if (it.phase === 'regular') return PBC.League.dateLabel(S, Math.max(0, Math.min(it.day, (S.numDays || 1) - 1)));
    const lbl = { preseason: 'Preseason', playin: 'Play-In', playoffs: 'Playoffs', awards: 'Season end', draft_lottery: 'Offseason', draft: 'Draft', resign: 'Re-signing', freeagency: 'Free agency' }[it.phase];
    return (it.season !== S.season ? U.seasonLabel(it.season) + ' · ' : '') + (lbl || it.phase || '');
  }

  function histRow(S, it) {
    return `<div class="dk-hist">${fromAvatar(S, it, 30)}<div class="dk-hist-b">
      <div class="row nowrap"><b class="dk-hist-t">${U.esc(it.title)}</b><div class="spacer"></div><span class="tiny dim">${when(S, it)}</span></div>
      <div class="small"><span class="muted">${it.auto ? 'Your staff answered:' : 'You:'}</span> ${U.esc(pickLabel(it))}</div>
      ${it.out ? `<div class="small muted">${U.esc(it.out)}</div>` : ''}${chips(S, it.fx, true)}</div></div>`;
  }

  // the room: chemistry, fans, the media, the owner, your word
  function meter(label, v, sub, title) {
    const cls = v >= 60 ? 'good' : v >= 40 ? '' : v >= 25 ? 'warn' : 'bad';
    return `<div class="dk-meter" ${title ? `title="${U.esc(title)}"` : ''}><div class="row nowrap"><span class="small muted">${label}</span><div class="spacer"></div><b>${Math.round(v)}</b>${sub ? `<span class="tiny dim" style="margin-left:6px">${U.esc(sub)}</span>` : ''}</div>
      <div class="meter"><div class="meter-fill ${cls}" style="width:${U.clamp(v, 0, 100)}%"></div></div></div>`;
  }
  function roomCard(S) {
    const D = Dk().ensure(S);
    const u = S.userTid;
    const chem = Dk().chem(S, u);
    const t = S.teams[u];
    const fo = S.fo || { kept: 0, broken: 0 };
    const cap = D.captain && D.captain[S.season] != null ? S.players[D.captain[S.season]] : null;
    const owner = Dk().owner(S, u);
    const mediaLbl = D.media >= 70 ? 'Press darling' : D.media >= 56 ? 'Respected' : D.media >= 44 ? 'Neutral' : D.media >= 30 ? 'Tense' : 'At war';
    const fansLbl = t.hype >= 75 ? 'Electric' : t.hype >= 58 ? 'Buzzing' : t.hype >= 42 ? 'Steady' : t.hype >= 28 ? 'Restless' : 'Empty seats';
    return `<div class="card accent"><div class="card-h"><h3>Your room</h3></div><div class="card-b col">
      ${meter('Team chemistry', chem, Dk().chemLabel(chem), 'How your players get along: their morale, winning, who has played together, trade requests, the personalities in the room, and your decisions. On the court it nudges their confidence (League Settings).')}
      ${meter('Fans', t.hype == null ? 50 : t.hype, fansLbl, 'How excited the city is: winning, your stars, the market, and what you say.')}
      ${meter('The media', D.media, mediaLbl, 'Your standing with the press. It drifts back toward neutral over the weeks.')}
      ${meter('Owner trust', S.coach ? S.coach.security : 50, S.coach ? S.coach.mood : '', `${owner.name}'s trust in you: your job security.`)}
      <div class="kv" style="margin-top:4px"><span>Owner</span><span>${U.esc(owner.name)}</span>
        <span>Captain</span><span>${cap ? UI.playerLink(cap) : '-'}</span>
        <span>Your word</span><span>${fo.kept} kept · ${fo.broken} broken</span></div>
    </div></div>`;
  }
  function promisesCard(S) {
    const u = S.userTid;
    const list = PBC.League.roster(S, u).filter(p => p.promise && p.promise.tid === u && (p.promise.season == null || p.promise.season <= S.season));
    if (!list.length) return '';
    return `<div class="card"><div class="card-h"><h3>Promises you made</h3></div><div class="card-b flush"><div class="list">${list.map(p => {
      const pr = p.promise;
      const s = PBC.Stats.season(p, S.season, false);
      const gp = s ? s.gp - (pr.gp0 || 0) : 0;
      let now = '';
      if (gp > 0) now = pr.type === 'starter' ? `${s.gs - (pr.gs0 || 0)} of ${gp} starts` : `${((s.min - (pr.min0 || 0)) / gp).toFixed(1)} mpg`;
      const broken = PBC.Season.promiseBroken ? PBC.Season.promiseBroken(p, s) : false;
      return `<div class="li">${UI.avatar(p, 30)}<div style="flex:1;min-width:0">${UI.playerLink(p)}<div class="tiny dim">${pr.type === 'starter' ? 'A starting job' : `${pr.min} minutes a night`}${pr.desk ? '' : ' (free agency)'}</div></div>
        <div class="right"><span class="tag ${broken ? 'bad' : gp >= 5 ? 'good' : ''}">${broken ? 'Falling short' : gp ? 'On track' : 'Just made'}</span>${now ? `<div class="tiny dim" style="margin-top:3px">${now}</div>` : ''}</div></div>`;
    }).join('')}</div></div></div>`;
  }

  // ---------------------------------------------------------------------------
  // The screen
  // ---------------------------------------------------------------------------
  UI.register('desk', {
    title: 'The Desk',
    onLeave() { ds.fresh = {}; },
    render(root) {
      const S = UI.S;
      const D = Dk();
      if (!S || S.userTid == null || S.userTid < 0 || (S.coach && S.coach.status === 'unemployed')) {
        root.innerHTML = `<div class="page"><div class="page-h"><div><h1>The Desk</h1></div></div><div class="card"><div class="empty">You need a job before anything lands on your desk.</div></div></div>`;
        return;
      }
      D.poke(S);
      const Dd = D.ensure(S);
      const open = D.open(S).filter(it => it.kind !== 'message');
      const freshIds = Object.keys(ds.fresh).map(Number);
      const freshItems = freshIds.map(id => Dd.items.find(i => i.id === id)).filter(Boolean);
      const shown = open.concat(freshItems.filter(it => !open.includes(it))).sort((a, b) => (ds.fresh[a.id] ? 1 : 0) - (ds.fresh[b.id] ? 1 : 0) || (b.kind === 'decision') - (a.kind === 'decision') || b.pri - a.pri || b.id - a.id);
      const flt = ds.filter;
      const vis = shown.filter(it => flt === 'all' || famOf(it) === flt || (flt === 'locker' && famOf(it) === 'community'));
      const msgs = Dd.items.filter(i => i.kind === 'message' && i.season === S.season).slice(0, 30);
      const unreadMsgs = msgs.filter(m => !m.seen).length;
      const hist = Dd.items.filter(i => i.done && i.kind !== 'message' && !ds.fresh[i.id]).slice(0, ds.histAll ? 60 : 8);
      const stopping = D.stopping(S);
      const resume = PBC.App && PBC.App.resume;
      const fams = ['all', 'locker', 'owner', 'press', 'staff', 'league'];
      const counts = {};
      for (const it of open) { const f = famOf(it) === 'community' ? 'locker' : famOf(it); counts[f] = (counts[f] || 0) + 1; }
      let banner = '';
      if (!stopping.length && (resume || open.length === 0)) {
        const resumeLbl = resume ? { next: 'Continue to your next game', quick: 'Quick sim your next game', days: `Resume the sim (${U.plural(resume.left || 0, 'day')} left)`, end: 'Resume: sim to the end of the season', series: 'Resume: sim the series', tipoff: 'Tip off the season' }[resume.kind] : null;
        banner = `<div class="dk-banner"><div><b>${open.length ? 'Nothing is holding up the season.' : 'Your desk is clear.'}</b><div class="small muted">${open.length ? 'What is left can wait: it gets your staff\'s answer if it runs out.' : 'New situations land here as the season goes: your players, the owner, the press, your staff and the other front offices.'}</div></div>
          <div class="spacer"></div>${resumeLbl ? `<button class="btn primary" data-resume>${U.esc(resumeLbl)} ▸</button>` : ''}</div>`;
      } else if (stopping.length) {
        banner = `<div class="dk-banner warn"><div><b>${U.plural(stopping.length, 'decision')} ${stopping.length === 1 ? 'needs' : 'need'} you before the season moves on.</b><div class="small muted">Settings → The Desk decides what stops the sim.</div></div></div>`;
      }
      root.innerHTML = `<div class="page dk">
        <div class="page-h"><div><h1>The Desk</h1><div class="sub">${UI.phaseLabel(S)} · ${U.plural(open.length, 'item')} waiting${unreadMsgs ? ` · ${U.plural(unreadMsgs, 'unread message')}` : ''}</div></div>
          <div class="actions">${open.length ? '<button class="btn sm" data-autoall title="Every open item gets the answer your staff would give">Let your staff answer the rest</button>' : ''}</div></div>
        ${banner}
        <div class="grid g-main">
          <div class="stack">
            <div class="seg dk-seg">${fams.map(f => `<button class="${flt === f ? 'on' : ''}" data-flt="${f}">${f === 'all' ? 'All' : FAM_ICON[f] + ' ' + FAM[f]}${f !== 'all' && counts[f] ? ` <i class="dk-n">${counts[f]}</i>` : f === 'all' && open.length ? ` <i class="dk-n">${open.length}</i>` : ''}</button>`).join('')}</div>
            ${vis.length ? vis.map(it => openCard(S, it)).join('') : `<div class="card"><div class="empty">${flt === 'all' ? 'Nothing needs you right now.' : 'Nothing here right now.'}</div></div>`}
            <div class="card"><div class="card-h"><h3>Messages</h3><div class="actions">${unreadMsgs ? '<button class="btn sm ghost" data-readall>Mark all read</button>' : ''}</div></div>
              <div class="card-b flush">${msgs.length ? msgs.map(m => msgRow(S, m)).join('') : '<div class="empty">No messages this season.</div>'}</div></div>
          </div>
          <div class="stack">${roomCard(S)}${promisesCard(S)}
            <div class="card"><div class="card-h"><h3>Recently decided</h3><div class="actions"><button class="btn sm ghost" data-histall>${ds.histAll ? 'Fewer' : 'All'}</button></div></div>
              <div class="card-b flush">${hist.length ? hist.map(it => histRow(S, it)).join('') : '<div class="empty">Your answers and how they played out show up here.</div>'}</div></div>
          </div>
        </div></div>`;
      // everything on screen has been seen (messages stay unread until you open the card or mark them)
      for (const it of open) it.seen = true;
      UI.on(root, 'click', '[data-flt]', (e, el) => { ds.filter = el.dataset.flt; UI.refresh(); });
      UI.on(root, 'click', '[data-histall]', () => { ds.histAll = !ds.histAll; UI.refresh(); });
      UI.on(root, 'click', '[data-readall]', () => { for (const m of msgs) m.seen = true; UI.save(); UI.refresh(); });
      UI.on(root, 'click', '[data-msg]', (e, el) => {
        if (e.target.closest('[data-open-player],[data-open-team]')) return;
        const it = Dd.items.find(i => i.id === +el.dataset.msg);
        if (it && !it.seen) { D.dismiss(S, it.id); el.classList.remove('unseen'); UI.save(); UI.renderNav(); }
      });
      UI.on(root, 'click', '[data-ans]', (e, el) => {
        const card = el.closest('[data-id]');
        const id = +card.dataset.id;
        const res = D.answer(S, id, el.dataset.ans);
        if (!res) { UI.refresh(); return; }
        ds.fresh[id] = true;
        UI.save();
        if (res.nav) { go(S, res.nav, res.text); return; }
        UI.refresh();
      });
      UI.on(root, 'click', '[data-autoall]', async () => {
        if (!(await UI.confirm(`Let your staff answer the ${U.plural(open.length, 'open item')}? Each gets the answer your assistants would give.`, { ok: 'Answer them' }))) return;
        D.autoAll(S);
        UI.save();
        UI.refresh();
      });
      const rb = root.querySelector('[data-resume]');
      if (rb) rb.onclick = () => { if (PBC.App) PBC.App.resumeSim(); };
    },
  });

  /** follow an answer to the screen it opens (the trade room with the offer, a player, the roster) */
  function go(S, nav, text) {
    if (text) UI.toast(U.esc(text), 'good', 2600);
    if (nav.screen === 'trade') {
      const o = nav.offer;
      if (o) UI.go('trade', { tid: o.tids[1], give: o.give[0].pids.slice(), givePicks: o.give[0].picks.slice(), get: o.give[1].pids.slice(), getPicks: o.give[1].picks.slice() });
      else UI.go('trade');
      return;
    }
    if (nav.screen === 'player' && nav.pid != null) { UI.refresh(); UI.openPlayer(nav.pid); return; }
    UI.go(nav.screen || 'home');
  }

  // ---------------------------------------------------------------------------
  // Home: what is on your desk today
  // ---------------------------------------------------------------------------
  UI.deskCard = function (S, cls) {
    const D = Dk();
    if (!D || !S || S.userTid == null || S.userTid < 0 || (S.coach && S.coach.status === 'unemployed')) return '';
    if (!D.active(S)) return '';
    D.poke(S);
    const open = D.open(S).filter(it => it.kind !== 'message');
    const unread = (S.desk ? S.desk.items : []).filter(i => i.kind === 'message' && !i.seen && i.season === S.season).length;
    const chem = D.chem(S, S.userTid);
    const t = S.teams[S.userTid];
    const top = open.slice(0, 3);
    return `<div class="card accent dk-home ${cls || ''}"><div class="card-h"><h3>On your desk</h3><div class="actions"><button class="btn sm ${open.length ? 'primary' : ''}" data-nav="desk">Open${open.length ? ` (${open.length})` : ''} ›</button></div></div>
      <div class="card-b flush">${top.length ? `<div class="list">${top.map(it => `<div class="li click" data-nav="desk">${fromAvatar(S, it, 30)}<div style="flex:1;min-width:0"><div class="dk-li-t">${U.esc(it.title)}</div><div class="tiny dim">${U.esc((it.from && it.from.name) || '')}</div></div>${kindTag(it)}</div>`).join('')}</div>`
        : `<div class="small muted" style="padding:2px 16px 8px">Nothing needs you right now.${unread ? ` ${U.plural(unread, 'unread message')}.` : ''}</div>`}
        <div class="dk-mini"><span>Chemistry <b>${Math.round(chem)}</b> <i class="dim">${D.chemLabel(chem)}</i></span><span>Fans <b>${t.hype == null ? 50 : t.hype}</b></span><span>Media <b>${S.desk ? S.desk.media : 50}</b></span></div>
      </div></div>`;
  };

  /** the nav's count: what waits for you */
  UI.deskCount = S => (PBC.Desk && S && S.desk ? PBC.Desk.open(S).filter(i => i.kind !== 'message').length : 0);
})();
