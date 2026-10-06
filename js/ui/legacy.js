/* Pro BBALL Coach — the Hall: the greatest players and coaches, the Hall of Fame, franchises (banners, retired numbers,
 * legends, coaches), the all-decade teams and your own place in the league's history (PBC.Legacy, PBC.Staff). */
(function () {
  'use strict';
  const PBC = window.PBC;
  const U = PBC.U, UI = PBC.UI;
  const Lg = () => PBC.Legacy;

  const TABS = [['players', 'Greatest players'], ['coaches', 'Greatest coaches'], ['hall', 'Hall of Fame'], ['franchise', 'Franchises'], ['rivals', 'Rivalries'], ['decades', 'Decades'], ['you', 'Your legacy']];
  const hs = { tab: 'players', pos: '', status: '', tid: 'all', ftid: null, n: 50 };
  const HON = [['champion', '🏆', 'gold'], ['mvp', 'MVP', 'gold'], ['fmvp', 'Finals MVP', 'gold'], ['dpoy', 'DPOY', 'accent'], ['al1', 'All-League 1st', 'accent'], ['al2', 'All-League 2nd', 'info'], ['al3', 'All-League 3rd', 'info'], ['allStar', 'All-Star', 'info'], ['allDefense', 'All-Defense', ''], ['roy', 'ROY', '']];

  const chips = h => HON.filter(([k]) => h && h[k]).map(([k, l, cls]) => `<span class="tag ${cls}">${h[k] > 1 ? h[k] + '× ' : ''}${l}</span>`).join('');
  const yrs = y => (y ? (y[0] === y[1] ? U.seasonLabel(y[0]) : `${y[0]}-${String(y[1] + 1).slice(-2)}`) : '');
  const teamTag = (S, tid) => (S.teams[tid] ? `<span class="ls-tm">${UI.teamBadge(S.teams[tid], 16)}${U.esc(S.teams[tid].abbr)}</span>` : '');
  function status(S, p) {
    if (p.tid >= 0 && S.teams[p.tid]) return `Active · ${teamTag(S, p.tid)}`;
    if (p.tid === -3) return `Retired${p.retired ? ' ' + p.retired.season : ''}`;
    return 'Free agent';
  }

  UI.register('legacy', {
    title: 'Hall of Fame',
    render(root, params) {
      const S = UI.S;
      if (!Lg()) { root.innerHTML = '<div class="page"><div class="empty">The league history is not loaded.</div></div>'; return; }
      Lg().ensure(S);
      if (PBC.Staff) PBC.Staff.ensure(S);
      if (params && params.tab) { hs.tab = params.tab; params.tab = null; }
      const tab = hs.tab;
      const body = tab === 'players' ? players(S) : tab === 'coaches' ? coaches(S) : tab === 'hall' ? hall(S) : tab === 'franchise' ? franchise(S) : tab === 'rivals' ? rivals(S) : tab === 'decades' ? decades(S) : you(S);
      const seasons = (S.history || []).length;
      root.innerHTML = `<div class="page lg">
        <div class="page-h"><div><h1>The Hall</h1><div class="sub">${seasons ? `${U.plural(seasons, 'season')} of history since ${U.seasonLabel(S.history[0].season)}` : 'History starts with your first season'} · ${S.legacy.hof.length} in the Hall of Fame</div></div>
          <div class="actions"><div class="seg">${TABS.map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div></div></div>
        ${body}</div>`;
      UI.on(root, 'click', '[data-tab]', (e, el) => { hs.tab = el.dataset.tab; UI.refresh(); });
      UI.on(root, 'click', '[data-pos]', (e, el) => { hs.pos = el.dataset.pos; UI.refresh(); });
      UI.on(root, 'click', '[data-st]', (e, el) => { hs.status = el.dataset.st; UI.refresh(); });
      UI.on(root, 'change', '[data-f="tid"]', (e, el) => { hs.tid = el.value; UI.refresh(); });
      UI.on(root, 'change', '[data-f="ftid"]', (e, el) => { hs.ftid = +el.value; UI.refresh(); });
    },
  });

  const seg = (opts, cur, attr) => `<div class="seg">${opts.map(([v, l]) => `<button class="${cur === v ? 'on' : ''}" data-${attr}="${v}">${l}</button>`).join('')}</div>`;
  const teamSelect = (S, cur, attr, all) => `<select class="inp" data-f="${attr}">${all ? `<option value="all">Whole league</option>` : ''}${U.sortBy(S.teams, t => t.city).map(t => `<option value="${t.id}" ${String(cur) === String(t.id) ? 'selected' : ''}>${U.esc(t.city + ' ' + t.name)}</option>`).join('')}</select>`;
  const empty = (msg, ico) => `<div class="card"><div class="empty">${ico ? `<div style="font-size:34px;margin-bottom:8px">${ico}</div>` : ''}${msg}</div></div>`;

  // ---------------------------------------------------------------------------
  // The greatest players
  // ---------------------------------------------------------------------------
  function players(S) {
    const tid = hs.tid !== 'all' && S.teams[+hs.tid] ? +hs.tid : null;
    const list = Lg().greats(S, { pos: hs.pos || null, status: hs.status || null, tid, n: hs.n });
    const prev = S.legacy.prev || {};
    const row = (x, i) => {
      const p = x.p, c = x.c;
      const was = tid == null && !hs.pos && !hs.status ? prev[p.id] : null;
      const mv = was && was !== i + 1 ? (was > i + 1 ? `<span class="good-t tiny">▲${was - i - 1}</span>` : `<span class="bad-t tiny">▼${i + 1 - was}</span>`) : (!was && p.tid >= 0 && tid == null && !hs.pos && !hs.status && S.legacy.prevSeason ? '<span class="good-t tiny">new</span>' : '');
      const inHall = Lg().inHall(S, 'p:' + p.id);
      const line = c.gp ? `${U.num(c.pts / c.gp)} ppg · ${U.num(c.reb / c.gp)} rpg · ${U.num(c.ast / c.gp)} apg` : 'Playoffs only';
      return `<div class="li ls-great ${i === 0 ? 'top' : ''}"><span class="ls-rk">${i + 1}</span>${UI.avatar(p, 42)}
        <div class="ls-great-b"><div class="ellip"><span class="bold">${UI.playerLink(p)}</span> <span class="tiny dim">${p.pos}</span> ${mv}</div>
          <div class="tiny muted">${status(S, p)} · ${yrs(x.years)} · ${U.plural(x.seasons, 'season')} · ${c.gp} games · ${c.pts.toLocaleString('en-US')} points · ${line}</div></div>
        <div class="ls-hon">${inHall ? '<span class="tag gold" title="Hall of Fame">🏛️ Hall of Fame</span>' : ''}${chips(x.h)}</div><span class="ls-val" title="Legacy score">${x.score.toFixed(1)}</span></div>`;
    };
    // the climbers: active players who moved up the most since last summer
    const climb = S.legacy.prevSeason ? U.sortBy(Lg().greats(S, { n: 100 }).map((x, i) => ({ x, i, d: prev[x.p.id] ? prev[x.p.id] - (i + 1) : 101 - (i + 1) })).filter(y => y.x.p.tid >= 0 && y.d > 0), y => y.d, true).slice(0, 5) : [];
    return `<div class="ls-bar">${seg([['', 'All'], ['PG', 'PG'], ['SG', 'SG'], ['SF', 'SF'], ['PF', 'PF'], ['C', 'C']], hs.pos, 'pos')}
        ${seg([['', 'Everyone'], ['active', 'Active'], ['retired', 'Retired']], hs.status, 'st')}${teamSelect(S, hs.tid, 'tid', true)}</div>
      <div class="ls-sec">${tid != null ? `${U.esc(S.teams[tid].name)} legends` : 'The greatest of all time'} <span class="sub">Titles and MVPs first, then Finals MVPs, All-League and All-Star teams, defense, and career and playoff production with a peak${tid != null ? ', counting only what they did for the franchise' : ''}.</span></div>
      ${list.length ? `<div class="grid g-main"><div class="card"><div class="card-b flush"><div class="list">${list.map(row).join('')}</div></div></div>
        <div class="stack">${climb.length ? `<div class="card"><div class="card-h"><h3>Climbing</h3></div><div class="card-b flush"><div class="list">${climb.map(y => `<div class="li">${UI.avatar(y.x.p, 30)}<div style="flex:1;min-width:0">${UI.playerLink(y.x.p)}<div class="tiny dim">No. ${y.i + 1} all time</div></div><span class="good-t small">▲${y.d}</span></div>`).join('')}</div></div></div>` : ''}
          <div class="card"><div class="card-b small muted">The list is the league's own history: it starts with the first season you play. Every season, every award and every playoff run moves it.</div></div></div></div>`
        : empty('Legends are made on the court. Check back once games have been played.', '🌟')}`;
  }

  // ---------------------------------------------------------------------------
  // The greatest coaches
  // ---------------------------------------------------------------------------
  function coaches(S) {
    const list = PBC.Staff ? PBC.Staff.all(S) : [];
    if (!list.length) return empty('Coaching careers are measured once the first season is over.', '📋');
    const rows = list.slice(0, 40).map((x, i) => {
      const t = x.tot, g = t.w + t.l;
      const where = x.status === 'active' && S.teams[x.tid] ? `Active · ${teamTag(S, x.tid)}` : x.status === 'retired' ? 'Retired' : 'Out of work';
      const inHall = x.user ? false : Lg().inHall(S, 'c:' + x.id);
      return `<tr class="${x.user ? 'me' : ''}"><td class="rank">${i + 1}</td><td><b>${U.esc(x.name)}</b>${x.user ? ' <span class="tag accent">You</span>' : ''}${inHall ? ' <span class="tag gold">🏛️</span>' : ''}<div class="tiny dim">${where}</div></td>
        <td class="num">${t.seasons}</td><td class="num">${t.w}-${t.l}</td><td class="num">${g ? (t.w / g).toFixed(3).replace(/^0/, '') : '-'}</td><td class="num">${t.pw}-${t.pl}</td>
        <td class="num">${t.titles ? `<b class="gold-t">${t.titles}</b>` : '0'}</td><td class="num">${t.finals}</td><td class="num">${t.coy}</td><td class="num dim">${x.score.toFixed(1)}</td></tr>`;
    }).join('');
    return `<div class="ls-sec">The greatest coaches <span class="sub">Titles, Finals, Coach of the Year, wins and playoff wins, and winning over a long career. You are on the same list.</span></div>
      <div class="card"><div class="card-b flush"><div class="tbl-wrap"><table class="tbl compact"><thead><tr><th>#</th><th>Coach</th><th class="num">Seasons</th><th class="num">W-L</th><th class="num">Pct</th><th class="num">Playoffs</th><th class="num">Titles</th><th class="num">Finals</th><th class="num">COY</th><th class="num">Score</th></tr></thead>
      <tbody>${rows}</tbody></table></div></div></div>`;
  }

  // ---------------------------------------------------------------------------
  // The Hall of Fame
  // ---------------------------------------------------------------------------
  function plaque(S, e) {
    const p = e.pid != null ? S.players[e.pid] : null;
    const pic = p ? UI.avatar(p, 72) : '<span class="lg-coach">🎓</span>';
    const l = e.line || {};
    const sub = e.kind === 'coach' ? `Head coach · ${e.coach ? `${e.coach.w}-${e.coach.l}, ${e.coach.titles} title${e.coach.titles === 1 ? '' : 's'}, ${e.coach.coy} Coach of the Year` : ''}`
      : `${e.pos} · ${l.pts ? l.pts.toLocaleString('en-US') + ' points' : ''}${l.ppg ? ` · ${l.ppg}/${l.rpg}/${l.apg}` : ''}`;
    return `<div class="lg-plaque">${pic}<div class="lg-pl-b"><div class="lg-pl-n">${p ? UI.playerLink(p, e.name) : U.esc(e.name)}</div>
      <div class="tiny muted">${teamTag(S, e.tid)} · ${yrs(e.years)}${e.first ? ' · <b class="gold-t">First ballot</b>' : ''}</div><div class="small">${sub}</div>
      ${e.honors ? `<div class="lg-pl-h">${chips(e.honors)}</div>` : ''}</div></div>`;
  }
  function hall(S) {
    const g = S.legacy;
    const by = {};
    for (const e of g.hof) (by[e.season] = by[e.season] || []).push(e);
    const seasons = Object.keys(by).map(Number).sort((a, b) => b - a);
    // on the ballot soon: retired players over the bar who are not eligible yet
    const soon = [];
    for (const id in S.players) {
      const p = S.players[id];
      if (p.tid !== -3 || !p.retired || Lg().inHall(S, 'p:' + p.id)) continue;
      const left = Lg().WAIT - (S.season - p.retired.season);
      if (left <= 0) continue;
      const sc = Lg().playerScore(S, p);
      if (sc >= Lg().HOF_BAR * 0.85) soon.push({ p, sc, year: p.retired.season + Lg().WAIT });
    }
    const soonHtml = soon.length ? `<div class="card"><div class="card-h"><h3>On the ballot soon</h3></div><div class="card-b flush"><div class="list">${U.sortBy(soon, x => x.sc, true).slice(0, 8).map(x => `<div class="li">${UI.avatar(x.p, 30)}<div style="flex:1;min-width:0">${UI.playerLink(x.p)}<div class="tiny dim">Eligible in the summer of ${x.year}</div></div><span class="small ${x.sc >= Lg().HOF_BAR ? 'gold-t' : 'muted'}">${x.sc >= Lg().HOF_BAR ? 'A lock' : 'On the bubble'}</span></div>`).join('')}</div></div></div>` : '';
    if (!seasons.length) return `<div class="grid g-main"><div>${empty(`The Hall of Fame inducts its first class once the league's first stars have been retired for ${Lg().WAIT} seasons. Every summer after that, the best four at most, players and coaches.`, '🏛️')}</div><div>${soonHtml}</div></div>`;
    return `<div class="grid g-main"><div>${seasons.map(s => `<div class="ls-sec">The class of ${s} <span class="sub">${U.plural(by[s].length, 'inductee')}</span></div><div class="lg-plaques">${by[s].map(e => plaque(S, e)).join('')}</div>`).join('')}</div>
      <div class="stack">${soonHtml}<div class="card"><div class="card-b small muted">Players become eligible ${Lg().WAIT} seasons after they retire, coaches one season after. Each summer's class takes the best four at most.</div></div></div></div>`;
  }

  // ---------------------------------------------------------------------------
  // Franchises: banners, retired numbers, legends, coaches
  // ---------------------------------------------------------------------------
  function franchise(S) {
    const tid = hs.ftid != null && S.teams[hs.ftid] ? hs.ftid : (S.userTid >= 0 ? S.userTid : 0);
    const t = S.teams[tid];
    const titles = (S.history || []).filter(h => h.champion === tid).map(h => h.season);
    const finals = (S.history || []).filter(h => h.runnerUp === tid).map(h => h.season);
    const nums = (S.legacy.numbers[tid] || []).slice().sort((a, b) => a.num - b.num);
    const legends = Lg().greats(S, { tid, n: 10 });
    const hist = (t.history || []).slice().reverse();
    const coachRows = hist.map(h => `<tr><td class="nowrap">${U.seasonLabel(h.season)}</td><td>${U.esc((PBC.Staff && PBC.Staff.coachIn ? PBC.Staff.coachIn(S, h.season, tid) : '') || '')}</td><td class="num">${h.w}-${h.l}</td><td class="small">${h.champ ? '🏆 ' : ''}${U.esc(h.result || '')}</td></tr>`).join('');
    return `<div class="ls-bar">${teamSelect(S, tid, 'ftid', false)}</div>
      <div class="hero lg-fr" style="--team:${t.colors.primary};--team2:${t.colors.secondary};margin-bottom:16px"><div class="hero-in"><div class="row nowrap">${UI.teamBadge(t, 72)}<div style="min-width:0">
        <div class="up" style="font-size:28px;line-height:1">${U.esc(t.city)} ${U.esc(t.name)}</div>
        <div class="muted">${titles.length ? `${U.plural(titles.length, 'championship')}` : 'No titles yet'}${finals.length ? ` · ${U.plural(finals.length, 'other Finals trip')}` : ''} · ${U.plural(hist.length, 'season')} of history</div></div></div>
        <div class="lg-banners">${titles.map(s => `<div class="lg-banner champ" style="--team:${t.colors.primary}"><div class="lg-b-t">Champions</div><div class="lg-b-y">${U.seasonLabel(s)}</div></div>`).join('')}
          ${nums.map(x => `<div class="lg-banner num" style="--team:${t.colors.primary}"><div class="lg-b-n">${x.num}</div><div class="lg-b-y">${U.esc(x.name.split(' ').slice(-1)[0])}</div></div>`).join('')}
          ${!titles.length && !nums.length ? '<div class="small muted">The rafters are empty. For now.</div>' : ''}</div></div></div>
      <div class="grid g2"><div class="card"><div class="card-h"><h3>Franchise legends</h3></div><div class="card-b flush"><div class="list">${legends.length ? legends.map((x, i) => `<div class="li"><span class="ls-rk">${i + 1}</span>${UI.avatar(x.p, 30)}<div style="flex:1;min-width:0">${UI.playerLink(x.p)}<div class="tiny dim">${yrs(x.years)} here · ${x.c.pts.toLocaleString('en-US')} points</div></div><div class="ls-hon">${chips(x.h)}</div></div>`).join('') : '<div class="empty small">No legends yet.</div>'}</div></div></div>
        <div class="card"><div class="card-h"><h3>Retired numbers</h3></div><div class="card-b flush"><div class="list">${nums.length ? nums.map(x => `<div class="li"><span class="lg-num">${x.num}</span><div style="flex:1;min-width:0">${S.players[x.pid] ? UI.playerLink(S.players[x.pid], x.name) : U.esc(x.name)}<div class="tiny dim">Retired in ${x.season}</div></div></div>`).join('') : '<div class="empty small">No numbers retired yet.</div>'}</div></div>
          <div class="card-h"><h3>Seasons and coaches</h3></div><div class="card-b flush"><div class="tbl-wrap"><table class="tbl compact"><tbody>${coachRows || '<tr><td class="dim">No seasons played yet.</td></tr>'}</tbody></table></div></div></div></div>`;
  }

  // ---------------------------------------------------------------------------
  // The all-decade teams
  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // The rivalries (PBC.Rivals): the league's hottest, with their history
  // ---------------------------------------------------------------------------
  function rivals(S) {
    const R = PBC.Rivals;
    const list = R ? R.top(S, 20) : [];
    if (!list.length) return empty('No rivalries yet. They are born in playoff series, close games, stars changing teams and words in the press.', '🔥');
    const u = S.userTid;
    const row = x => {
      const A = S.teams[x.a], B = S.teams[x.b];
      const lead = x.g[0] === x.g[1] ? `even at ${x.g[0]}-${x.g[1]}` : `${(x.g[0] > x.g[1] ? A : B).abbr} leads ${Math.max(x.g[0], x.g[1])}-${Math.min(x.g[0], x.g[1])}`;
      const po = x.po.length ? x.po.slice(-4).map(m => `${U.seasonLabel(m.season)} ${U.esc(PBC.League.roundName(S, m.round))}: ${S.teams[m.winner].abbr} in ${m.w[0] + m.w[1]}${m.g7 ? ' (G7)' : ''}`).join(' · ') : 'No playoff meetings yet';
      return `<div class="li ${x.a === u || x.b === u ? 'me' : ''}" style="align-items:flex-start">${UI.teamBadge(A, 30)}${UI.teamBadge(B, 30)}
        <div style="flex:1;min-width:0"><div class="ellip"><span class="bold">${U.esc(A.name)} vs. ${U.esc(B.name)}</span> <span class="tag bad">${x.level.icon} ${U.esc(x.level.label)}</span></div>
          <div class="tiny muted">Regular season: ${lead}${x.born ? ` · a rivalry since ${U.seasonLabel(x.born)}` : ''}${x.last && x.last.why ? ` · last flare-up: ${U.esc(x.last.why)}` : ''}</div>
          <div class="tiny muted">${po}</div></div><span class="ls-val" title="Heat">${Math.round(x.heat)}</span></div>`;
    };
    return `<div class="ls-sec">The league's rivalries <span class="sub">Heat builds with playoff series (a Game 7 most of all), close games, stars changing teams and trash talk, and cools a little every week and every summer.</span></div>
      <div class="card"><div class="card-b flush"><div class="list">${list.map(row).join('')}</div></div></div>`;
  }

  function decades(S) {
    const list = Lg().decades(S);
    if (!list.length) return empty('The all-decade teams come from the All-League teams of every completed season.', '📅');
    const five = (pids, d) => pids.map(pid => { const p = S.players[pid]; return p ? `<div class="li">${UI.avatar(p, 30)}<div style="flex:1;min-width:0">${UI.playerLink(p)}<div class="tiny dim">${p.pos}</div></div><span class="small muted">${(d.pts[pid] || 0).toFixed(1)}</span></div>` : ''; }).join('');
    return list.map(d => `<div class="ls-sec">The ${d.label} <span class="sub">${d.complete ? 'Complete' : 'So far'}: ${U.seasonLabel(d.seasons[0])} to ${U.seasonLabel(d.seasons[1])}</span></div>
      <div class="grid g2"><div class="card"><div class="card-h"><h3>First team</h3></div><div class="card-b flush"><div class="list">${five(d.first, d)}</div></div></div>
        <div class="card"><div class="card-h"><h3>Second team</h3></div><div class="card-b flush"><div class="list">${five(d.second, d)}</div></div></div></div>`).join('');
  }

  // ---------------------------------------------------------------------------
  // Your legacy
  // ---------------------------------------------------------------------------
  function you(S) {
    const c = S.coach;
    if (!c) return empty('No career yet.');
    const all = PBC.Staff ? PBC.Staff.all(S) : [];
    const i = all.findIndex(x => x.user);
    const me = all[i];
    const g = c.totals.w + c.totals.l;
    const hofP = PBC.Coach && PBC.Coach.hofProbability ? PBC.Coach.hofProbability(S) : 0;
    const ahead = i > 0 ? all.slice(Math.max(0, i - 3), i).reverse() : [];
    return `<div class="grid g-main"><div class="stack"><div class="card accent"><div class="card-h"><h3>${U.esc(c.name)}</h3></div><div class="card-b">
        <div class="kv"><span>All-time coaches</span><span>${me ? `No. ${i + 1} of ${all.length}` : 'Unranked until a season is over'}</span>
          <span>Record</span><span>${c.totals.w}-${c.totals.l}${g ? ` (${(c.totals.w / g).toFixed(3).replace(/^0/, '')})` : ''}</span>
          <span>Playoffs</span><span>${c.totals.pw}-${c.totals.pl}</span><span>Titles</span><span>${c.titles}</span><span>Finals</span><span>${c.finals}</span>
          <span>Coach of the Year</span><span>${c.coy}</span><span>Seasons</span><span>${c.seasons.length}</span>
          <span>Hall of Fame points</span><span>${U.round(c.hof || 0, 1)}</span><span>Hall of Fame chances</span><span>${Math.round(hofP * 100)}%</span></div>
        <div class="meter lg" style="margin-top:12px"><div class="meter-fill ${hofP >= 0.6 ? 'good' : hofP >= 0.25 ? 'warn' : 'bad'}" style="width:${Math.round(hofP * 100)}%"></div></div></div></div>
      ${ahead.length ? `<div class="card"><div class="card-h"><h3>Next on the list</h3></div><div class="card-b flush"><div class="list">${ahead.map(x => `<div class="li"><div style="flex:1;min-width:0"><b>${U.esc(x.name)}</b><div class="tiny dim">${x.tot.w}-${x.tot.l} · ${x.tot.titles} titles · ${x.tot.coy} COY</div></div><span class="small muted">${(x.score - me.score).toFixed(1)} ahead</span></div>`).join('')}</div></div></div>` : ''}</div>
      <div class="stack"><div class="card"><div class="card-b small muted">Wins, playoff wins, titles, Finals and Coach of the Year awards move you up the all-time list. Achievements and Hall of Fame points are in My Career.</div>
        <div class="card-b"><button class="btn" data-nav="career">My Career ›</button></div></div></div></div>`;
  }
})();
