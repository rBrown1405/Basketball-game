/* Pro BBALL Coach — the Media hub (PBC.Media): the front page, storylines, power rankings, the award races, the rumor
 * mill, your team's clippings and the archive; the article reader; the headline card on Home. */
(function () {
  'use strict';
  const PBC = window.PBC;
  const U = PBC.U, UI = PBC.UI;
  const Md = () => PBC.Media;

  const TABS = [['front', 'Front page'], ['stories', 'Storylines'], ['rank', 'Power rankings'], ['races', 'Award races'], ['rumors', 'Rumor mill'], ['mine', 'Your team'], ['archive', 'Archive']];
  const ms = { tab: 'front', story: null, season: null };
  const KIND_TAG = {
    night: 'Big night', milestone: 'Milestone', record: 'Record', injury: 'Injury', injury_back: 'Injury', streak_w: 'Streak', streak_l: 'Skid', streak_w_end: 'Streak',
    streak_l_end: 'Skid', hot: 'Hot hand', cold: 'Slump', rankings: 'Power rankings', ladder: 'Award races', mvp_flip: 'MVP race', rumors: 'Rumor mill', surprise: 'Surprise',
    flop: 'Disappointment', hot_seat: 'Hot seat', race: 'Playoff race', tank: 'Lottery', beatnote: 'Notebook', trade: 'Trade', request: 'Trade request', quote: 'Press room',
    allstar: 'All-Star', deadline: 'Deadline', awards_pre: 'Awards', champion: 'Champions', preview: 'Playoffs', series_end: 'Playoffs', game7: 'Playoffs',
    lottery: 'Lottery', draft: 'Draft', fa: 'Free agency', retire: 'Farewell', carousel: 'Coaching carousel', hof: 'Hall of Fame', number: 'Retired number', alltime: 'All-time record',
  };

  function when(S, a) {
    if (a.phase === 'regular' || (a.phase === 'playin' || a.phase === 'playoffs')) return PBC.League.dateLabel(S, Math.max(0, Math.min(a.day, (S.numDays || 1) - 1)));
    const lbl = { preseason: 'Preseason', awards: 'Season end', draft_lottery: 'Offseason', draft: 'Draft', resign: 'Re-signing', freeagency: 'Free agency' }[a.phase];
    return (a.season !== S.season ? U.seasonLabel(a.season) + ' · ' : '') + (lbl || '');
  }
  function art(S, a) { return Md().render(S, a) || { h: '', d: '', b: [] }; }
  function byline(r) { const w = r.by || {}; return `${U.esc(w.name || '')}${w.outlet ? ` · <span class="dim">${U.esc(w.outlet)}</span>` : ''}`; }
  function pic(S, a, size) {
    if (a.pid != null && S.players[a.pid] && S.players[a.pid].look) return UI.avatar(S.players[a.pid], size);
    if (a.tid >= 0 && S.teams[a.tid]) return UI.teamBadge(S.teams[a.tid], size);
    if (a.tids && a.tids[0] >= 0 && S.teams[a.tids[0]]) return UI.teamBadge(S.teams[a.tids[0]], size);
    return `<span class="md-ico" style="width:${size}px;height:${size}px">🗞️</span>`;
  }

  function cardHtml(S, a, big) {
    const r = art(S, a);
    return `<article class="md-card ${big ? 'lead' : ''} ${a.seen ? '' : 'unseen'} ${a.user ? 'mine' : ''}" data-art="${a.id}">
      <div class="md-pic">${pic(S, a, big ? 96 : 44)}</div>
      <div class="md-txt"><div class="md-kicker">${U.esc(KIND_TAG[a.k] || '')}${a.user ? ' · <b>Your team</b>' : ''}</div>
        <h3 class="md-h">${U.esc(r.h)}</h3>${r.d ? `<p class="md-d">${U.esc(r.d)}</p>` : ''}
        ${big && r.b[0] ? `<p class="md-b1">${U.esc(r.b[0])}</p>` : ''}
        <div class="md-by">${byline(r)} · ${when(S, a)}</div></div></article>`;
  }

  /** the reader: one article in a modal; marks it read */
  UI.openArticle = function (id) {
    const S = UI.S;
    const m = S && S.media;
    const a = m ? m.arts.find(x => x.id === id) : null;
    if (!a) return;
    const r = art(S, a);
    a.seen = true;
    const w = r.by || {};
    const thread = a.sid ? Md().storyArts(S, a.sid).filter(x => x.id !== a.id).slice(0, 6) : [];
    const people = [];
    if (a.pid != null && S.players[a.pid]) people.push(`<a class="md-chip" data-open-player="${a.pid}">${UI.avatar(S.players[a.pid], 26)} ${U.esc(PBC.Player.name(S.players[a.pid]))}</a>`);
    for (const t of (a.tids || []).slice(0, 3)) if (S.teams[t]) people.push(`<a class="md-chip" data-open-team="${t}">${UI.teamBadge(S.teams[t], 22)} ${U.esc(S.teams[t].name)}</a>`);
    const mdl = UI.modal({
      title: '', wide: true,
      body: `<div class="md-read">
        <div class="md-kicker">${U.esc(KIND_TAG[a.k] || '')} · ${when(S, a)}</div>
        <h1 class="md-rh">${U.esc(r.h)}</h1>
        ${r.d ? `<p class="md-rd">${U.esc(r.d)}</p>` : ''}
        <div class="md-rby"><span class="md-ico sm">✍️</span><div><b>${U.esc(w.name || '')}</b><div class="tiny dim">${U.esc((PBC.Media.TITLES || {})[w.role] || '')}${w.outlet ? ', ' + U.esc(w.outlet) : ''}</div></div></div>
        ${r.b.map(p => `<p class="md-rp">${U.esc(p)}</p>`).join('')}
        ${people.length ? `<div class="md-people">${people.join('')}</div>` : ''}
        ${thread.length ? `<div class="md-thread"><div class="tiny up dim">More on this story</div>${thread.map(x => `<a class="md-tl" data-art="${x.id}">${U.esc(art(S, x).h)} <span class="tiny dim">${when(S, x)}</span></a>`).join('')}</div>` : ''}
      </div>`,
      actions: [{ label: 'Close', cls: 'primary' }],
    });
    if (mdl && mdl.el) UI.on(mdl.el, 'click', '[data-art]', (e, el) => { mdl.close && mdl.close(); UI.openArticle(+el.dataset.art); });
    UI.save();
    if (UI.current().key === 'media') setTimeout(() => UI.refresh(), 0);
  };

  // ---------------------------------------------------------------------------
  // The hub
  // ---------------------------------------------------------------------------
  UI.register('media', {
    title: 'Media',
    render(root, params) {
      const S = UI.S;
      const M = Md();
      if (!M) { root.innerHTML = '<div class="page"><div class="empty">The media is not loaded.</div></div>'; return; }
      const m = M.ensure(S);
      if (params && params.tab) { ms.tab = params.tab; params.tab = null; }
      const tab = ms.tab;
      let body = '';
      if (tab === 'front') body = front(S, m);
      else if (tab === 'stories') body = stories(S, m);
      else if (tab === 'rank') body = rankings(S, m);
      else if (tab === 'races') body = races(S, m);
      else if (tab === 'rumors') body = rumors(S, m);
      else if (tab === 'mine') body = mine(S, m);
      else body = archive(S, m);
      const unread = M.unread(S);
      root.innerHTML = `<div class="page md">
        <div class="md-mast"><div class="md-mast-t">The League Report</div><div class="md-mast-s">${U.seasonLabel(S.season)} · ${UI.phaseLabel(S)}${unread ? ` · ${U.plural(unread, 'unread story', 'unread stories')}` : ''}</div></div>
        <div class="seg md-tabs">${TABS.map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>
        ${body}</div>`;
      UI.on(root, 'click', '[data-tab]', (e, el) => { ms.tab = el.dataset.tab; ms.story = null; UI.refresh(); });
      UI.on(root, 'click', '[data-art]', (e, el) => { if (e.target.closest('[data-open-player],[data-open-team]')) return; UI.openArticle(+el.dataset.art); });
      UI.on(root, 'click', '[data-story]', (e, el) => { ms.story = ms.story === +el.dataset.story ? null : +el.dataset.story; UI.refresh(); });
      UI.on(root, 'click', '[data-aseason]', (e, el) => { ms.season = +el.dataset.aseason; UI.refresh(); });
      UI.on(root, 'click', '[data-readall]', () => { for (const a of m.arts) a.seen = true; UI.save(); UI.refresh(); });
    },
  });

  function front(S, m) {
    const list = Md().front(S, 13);
    if (!list.length) return `<div class="card"><div class="empty">The writers are sharpening their pencils. Stories show up once games are played.</div></div>`;
    const [lead, ...rest] = list;
    const side = [];
    if (m.rank && m.rank.list) side.push(`<div class="card"><div class="card-h"><h3>Power rankings</h3><div class="actions"><button class="btn sm ghost" data-tab="rank">All ›</button></div></div><div class="card-b flush">${m.rank.list.slice(0, 5).map(x => rankRow(S, x)).join('')}</div></div>`);
    if (m.ladder && m.ladder.mvp && m.ladder.mvp.length) side.push(`<div class="card"><div class="card-h"><h3>MVP ladder</h3><div class="actions"><button class="btn sm ghost" data-tab="races">All ›</button></div></div><div class="card-b flush">${m.ladder.mvp.slice(0, 5).map((x, i) => ladderRow(S, x, i, m.ladder.prevMvp)).join('')}</div></div>`);
    const hist = Md().onThisDay(S, 3);
    if (hist.length) side.push(`<div class="card"><div class="card-h"><h3>This week in league history</h3></div><div class="card-b flush">${hist.map(a => `<div class="li"><div style="flex:1;min-width:0"><div class="md-kicker">${U.seasonLabel(a.season)}</div><b class="small">${U.esc(a.h)}</b></div></div>`).join('')}</div></div>`);
    const open = m.stories.filter(s => s.open && s.season === S.season && s.arts.length).slice(0, 6);
    if (open.length) side.push(`<div class="card"><div class="card-h"><h3>Storylines</h3><div class="actions"><button class="btn sm ghost" data-tab="stories">All ›</button></div></div><div class="card-b flush">${open.map(s => storyRow(S, m, s)).join('')}</div></div>`);
    return `<div class="grid g-main">
      <div class="stack">${cardHtml(S, lead, true)}<div class="md-grid">${rest.map(a => cardHtml(S, a)).join('')}</div>
        <div class="row" style="justify-content:flex-end"><button class="btn sm ghost" data-readall>Mark everything read</button></div></div>
      <div class="stack">${side.join('')}</div></div>`;
  }

  function storyRow(S, m, s) {
    const first = m.arts.find(a => a.id === s.arts[0]);
    const lastA = m.arts.find(a => a.id === s.arts[s.arts.length - 1]);
    const r = first ? art(S, lastA || first) : null;
    return `<div class="li click" data-story="${s.id}">${first ? pic(S, first, 30) : ''}<div style="flex:1;min-width:0"><div class="md-li-t">${U.esc(r ? r.h : s.type)}</div><div class="tiny dim">${U.plural(s.arts.length, 'story', 'stories')} · ${s.open ? 'developing' : 'closed'}</div></div></div>`;
  }
  function stories(S, m) {
    const list = m.stories.filter(s => s.season === S.season && s.arts.length > 0);
    const multi = list.filter(s => s.arts.length > 1 || s.open);
    const rows = (multi.length ? multi : list).slice(0, 40);
    if (!rows.length) return `<div class="card"><div class="empty">No storylines yet this season.</div></div>`;
    return `<div class="card"><div class="card-h"><h3>The season's storylines</h3></div><div class="card-b flush">${rows.map(s => {
      const arts = s.arts.map(id => m.arts.find(a => a.id === id)).filter(Boolean);
      const open = ms.story === s.id;
      return `${storyRow(S, m, s)}${open ? `<div class="md-threadlist">${arts.map(a => cardHtml(S, a)).join('')}</div>` : ''}`;
    }).join('')}</div></div>`;
  }

  function rankRow(S, x) {
    const mv = x.prev == null ? '' : x.prev > x.r ? `<span class="good-t">▲${x.prev - x.r}</span>` : x.prev < x.r ? `<span class="bad-t">▼${x.r - x.prev}</span>` : '<span class="dim">–</span>';
    return `<div class="li"><span class="md-rank">${x.r}</span>${UI.teamBadge(S.teams[x.tid], 24)}<div style="flex:1;min-width:0">${UI.teamLink(S.teams[x.tid], S.teams[x.tid].name)}<div class="tiny dim">${x.w}-${x.l}${x.sk >= 3 ? ` · W${x.sk}` : x.sk <= -3 ? ` · L${-x.sk}` : ''}</div></div><span class="small">${mv}</span></div>`;
  }
  function rankings(S, m) {
    if (!m.rank || !m.rank.list) return `<div class="card"><div class="empty">The first power rankings come out after the first week.</div></div>`;
    const a = m.arts.find(x => x.k === 'rankings' && x.season === S.season);
    const r = a ? art(S, a) : null;
    return `<div class="card"><div class="card-h"><h3>Power rankings · week ${m.rank.week + 1}</h3>${r ? `<div class="actions"><span class="tiny dim">${byline(r)}</span></div>` : ''}</div>
      <div class="card-b flush"><table class="tbl"><tbody>${m.rank.list.map((x, i) => {
        const note = r && r.b[i] ? r.b[i].replace(/^\d+\.\s[^:]*:\s/, '') : '';
        const mv = x.prev == null ? '' : x.prev > x.r ? `<span class="good-t">▲${x.prev - x.r}</span>` : x.prev < x.r ? `<span class="bad-t">▼${x.r - x.prev}</span>` : '<span class="dim">–</span>';
        return `<tr class="${x.tid === S.userTid ? 'me' : ''}"><td class="rank">${x.r}</td><td class="num small">${mv}</td><td>${UI.teamBadge(S.teams[x.tid], 22)} ${UI.teamLink(S.teams[x.tid])}</td><td class="num">${x.w}-${x.l}</td><td class="small muted md-note">${U.esc(note)}</td></tr>`;
      }).join('')}</tbody></table></div></div>`;
  }

  function ladderRow(S, x, i, prev) {
    const p = S.players[x.pid];
    if (!p) return '';
    const was = prev ? prev.indexOf(x.pid) : -1;
    const mv = !prev ? '' : was < 0 ? '<span class="good-t">new</span>' : was > i ? `<span class="good-t">▲${was - i}</span>` : was < i ? `<span class="bad-t">▼${i - was}</span>` : '';
    return `<div class="li">${UI.avatar(p, 30)}<div style="flex:1;min-width:0">${UI.playerLink(p)}<div class="tiny dim">${S.teams[x.tid] ? U.esc(S.teams[x.tid].abbr) : ''} · ${x.ppg}/${x.rpg}/${x.apg}</div></div><span class="small">${i + 1}${mv ? ' ' + mv : ''}</span></div>`;
  }
  function races(S, m) {
    const L = m.ladder;
    if (!L || !L.mvp) return `<div class="card"><div class="empty">The award ladders start once teams have played about ten games.</div></div>`;
    const block = (title, list, prev, fmt) => list && list.length ? `<div class="card"><div class="card-h"><h3>${title}</h3></div><div class="card-b flush">${list.map((x, i) => fmt ? fmt(x, i) : ladderRow(S, x, i, prev)).join('')}</div></div>` : '';
    const coyRow = (x, i) => `<div class="li">${UI.teamBadge(S.teams[x.tid], 26)}<div style="flex:1;min-width:0"><b>${U.esc(Md().coachName(S, x.tid))}</b><div class="tiny dim">${U.esc(S.teams[x.tid].name)} · ${x.w}-${x.l}${x.proj != null ? ` · picked for ${x.proj}` : ''}</div></div><span class="small">${i + 1}</span></div>`;
    return `<div class="grid g2"><div class="stack">${block('Most Valuable Player', L.mvp, L.prevMvp)}</div>
      <div class="stack">${block('Rookie of the Year', L.roy, L.prevRoy)}${block('Defensive Player of the Year', L.dpoy)}${block('Sixth Man of the Year', L.smoy)}${block('Coach of the Year', L.coy, null, coyRow)}</div></div>`;
  }

  function rumors(S, m) {
    const a = m.arts.find(x => x.k === 'rumors' && x.season === S.season);
    const reqs = Object.values(S.players).filter(p => p.tid >= 0 && p.tradeReq);
    const left = S.phase === 'regular' && S.tradeDeadlineDay != null ? S.tradeDeadlineDay - S.day : null;
    return `<div class="grid g-main"><div class="stack">${a ? cardHtml(S, a, true) : '<div class="card"><div class="empty">The rumor mill opens a couple of weeks into the season.</div></div>'}
      ${a ? `<div class="card"><div class="card-b">${art(S, a).b.map(p => `<p class="md-rp">${U.esc(p)}</p>`).join('')}</div></div>` : ''}</div>
      <div class="stack"><div class="card"><div class="card-h"><h3>Trade requests</h3>${left != null && left > 0 ? `<div class="actions"><span class="tag warn">${U.plural(left, 'day')} to the deadline</span></div>` : ''}</div><div class="card-b flush">${reqs.length ? reqs.map(p => `<div class="li">${UI.avatar(p, 28)}<div style="flex:1;min-width:0">${UI.playerLink(p)}<div class="tiny dim">${U.esc(S.teams[p.tid].name)} · ${p.pos} · ${p.ovr} OVR</div></div></div>`).join('') : '<div class="empty">Nobody has asked out.</div>'}</div></div></div></div>`;
  }

  function mine(S, m) {
    const u = S.userTid;
    const list = m.arts.filter(a => a.user).slice(0, 30);
    const w = Md().beat(S);
    return `<div class="grid g-main"><div class="stack">${list.length ? `<div class="md-grid one">${list.map(a => cardHtml(S, a)).join('')}</div>` : '<div class="card"><div class="empty">Nothing written about your team yet.</div></div>'}</div>
      <div class="stack">${w ? `<div class="card"><div class="card-h"><h3>Your beat writer</h3></div><div class="card-b"><b>${U.esc(w.name)}</b><div class="small muted">${U.esc(w.outlet)}</div>
        <p class="small muted">Covers every ${U.esc(S.teams[u] ? S.teams[u].name : '')} game, writes a notebook every few weeks, and hears everything you say at the podium. Your standing with the press (The Desk) sets the tone.</p></div></div>` : ''}</div></div>`;
  }

  function archive(S, m) {
    const seasons = (m.archive || []).map(x => x.season);
    if (!seasons.length) return `<div class="card"><div class="empty">The archive fills up at the end of each season with its biggest stories.</div></div>`;
    const sel = seasons.includes(ms.season) ? ms.season : seasons[0];
    const entry = m.archive.find(x => x.season === sel);
    return `<div class="seg" style="margin-bottom:12px">${seasons.map(s => `<button class="${s === sel ? 'on' : ''}" data-aseason="${s}">${U.seasonLabel(s)}</button>`).join('')}</div>
      <div class="card"><div class="card-b flush">${entry.list.map(a => `<div class="li"><div style="flex:1;min-width:0"><div class="md-kicker">${U.esc(KIND_TAG[a.k] || '')}</div><b>${U.esc(a.h)}</b>${a.d ? `<div class="small muted">${U.esc(a.d)}</div>` : ''}</div></div>`).join('')}</div></div>`;
  }

  // ---------------------------------------------------------------------------
  // Home: the headline
  // ---------------------------------------------------------------------------
  UI.headlineCard = function (S) {
    const M = Md();
    if (!M || !S || !S.media) return '';
    const list = M.front(S, 3);
    if (!list.length) return '';
    const [a, ...more] = list;
    const r = art(S, a);
    return `<div class="card md-home"><div class="card-h"><h3>The League Report</h3><div class="actions"><button class="btn sm" data-nav="media">Media ›</button></div></div>
      <div class="card-b"><div class="md-home-lead click" data-home-art="${a.id}">${pic(S, a, 56)}<div style="min-width:0"><div class="md-kicker">${U.esc(KIND_TAG[a.k] || '')}</div><div class="md-h">${U.esc(r.h)}</div>${r.d ? `<div class="small muted">${U.esc(r.d)}</div>` : ''}<div class="tiny dim" style="margin-top:4px">${byline(r)}</div></div></div>
      ${more.map(x => `<div class="md-home-more click" data-home-art="${x.id}">${U.esc(art(S, x).h)}</div>`).join('')}</div></div>`;
  };
  document.addEventListener('click', e => {
    const el = e.target.closest && e.target.closest('[data-home-art]');
    if (el) { e.preventDefault(); UI.openArticle(+el.dataset.homeArt); }
  });
})();
