/* Pro BBALL Coach: the season calendar. A month at a glance (your games and results, rivalry nights, back-to-backs,
 * the trade deadline, All-Star weekend, the finale, the postseason) next to the year's key dates and what is coming up. */
(function () {
  'use strict';
  const PBC = window.PBC;
  const U = PBC.U, UI = PBC.UI;

  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const cal = { m: null, season: null };
  const inSeason = S => S.phase === 'regular' || S.phase === 'playin' || S.phase === 'playoffs';
  const OFF = { postseason_done: 1, awards: 1, draft_lottery: 1, draft: 1, resign: 1, freeagency: 1 };

  // the user's games by season day (the regular season, then the postseason games already made)
  function userGames(S) {
    const u = S.userTid;
    const out = {};
    for (const g of S.schedule || []) if (g.h === u || g.a === u) out[g.day] = g;
    const P = S.playoffs;
    if (P) {
      for (const g of P.games || []) if ((g.h === u || g.a === u) && g.day != null) out[g.day] = g;
      for (const x of P.playIn || []) if (x.game && (x.game.h === u || x.game.a === u)) out[x.game.day] = x.game;
    }
    for (const g of S.todayPost || []) if (g.h === u || g.a === u) out[g.day] = g;
    return out;
  }
  // the season's events by day
  function events(S) {
    const ev = {};
    const add = (d, icon, label) => { if (d == null || d < 0) return; (ev[d] = ev[d] || []).push({ icon, label }); };
    const sch = S.schedule || [];
    if (sch.length) add(sch[0].day, '🎉', 'Opening night');
    if (S.tradeDeadlineDay > 0) add(S.tradeDeadlineDay - 1, '⏰', 'Trade deadline');
    if (S.allStarDay >= 0) { add(S.allStarDay, '⭐', 'All-Star weekend'); for (let i = 1; i < 5; i++) add(S.allStarDay + i, '🌙', 'All-Star break'); }
    if (sch.length) add(sch[sch.length - 1].day, '🏁', 'Regular-season finale');
    return ev;
  }

  UI.register('calendar', {
    title: 'Calendar',
    render(root) {
      const S = UI.S;
      if (!S.schedule || !S.schedule.length) { root.innerHTML = '<div class="page"><div class="card"><div class="empty">The calendar fills in when the schedule comes out at training camp.</div></div></div>'; return; }
      const L = PBC.League;
      const today = OFF[S.phase] ? null : S.day;
      // the month to show: today's, or the season's first, remembered while you page through
      const mOf = d => { const x = L.dateOf(S, d); return x.getUTCFullYear() * 12 + x.getUTCMonth(); };
      if (cal.season !== S.season || cal.m == null) { cal.season = S.season; cal.m = mOf(today != null ? today : S.schedule[0].day); }
      const first = mOf(S.schedule[0].day), last = mOf((S.numDays || 1) + 70);
      cal.m = U.clamp(cal.m, first, last);
      const games = userGames(S), ev = events(S);
      const st = L.standings(S);
      const u = S.userTid;
      const rv = (a, b) => (PBC.Rivals ? PBC.Rivals.level(S, a, b) : null);
      // the month's grid
      const y = Math.floor(cal.m / 12), mo = cal.m % 12;
      const d0 = new Date(Date.UTC(y, mo, 1));
      const start = L.dateOf(S, 0);
      const dayIdx = date => Math.round((date - start) / 86400000);
      const nDays = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
      let cells = '';
      for (let i = 0; i < d0.getUTCDay(); i++) cells += '<div class="cal-c out"></div>';
      for (let dd = 1; dd <= nDays; dd++) {
        const di = dayIdx(new Date(Date.UTC(y, mo, dd)));
        const g = games[di];
        const evs = ev[di] || [];
        let inner = '';
        if (g) {
          const home = g.h === u, opp = home ? g.a : g.h, ot = S.teams[opp];
          const r = rv(u, opp);
          const b2b = games[di - 1];   // (the second night of a back-to-back)
          let res = '';
          if (g.played) { const us = home ? g.hs : g.as, them = home ? g.as : g.hs; res = `<span class="cal-res ${us > them ? 'w' : 'l'}">${us > them ? 'W' : 'L'}<span class="cal-sc"> ${us}-${them}</span></span>`; }
          inner = `<div class="cal-g ${home ? 'home' : 'road'} ${g.playoff ? 'po' : ''}" ${g.played && S.boxes && S.boxes[g.gid] ? `data-open-box="${g.gid}"` : ''}>
            <span class="cal-opp">${home ? 'vs' : '@'} ${UI.teamBadge(ot, 14)}${U.esc(ot.abbr)}</span>${r ? `<span class="cal-rv" title="${U.esc(r.label)}">${r.icon}</span>` : ''}${res}
            ${!g.played && b2b ? '<span class="cal-b2b" title="Back-to-back">B2B</span>' : ''}</div>`;
        }
        inner += evs.map(e => `<div class="cal-ev">${e.icon} <span>${U.esc(e.label)}</span></div>`).join('');
        cells += `<div class="cal-c ${di === today ? 'today' : ''} ${di < (today == null ? -1 : today) ? 'past' : ''} ${g ? 'has-g' : ''}"><div class="cal-d">${dd}</div>${inner}</div>`;
      }
      // the year's key dates
      const lbl = d => L.dateLabel(S, d, true);
      const key = [];
      const sch = S.schedule;
      const homeOpener = sch.find(g => g.h === u);
      key.push({ when: lbl(sch[0].day), what: 'Opening night', day: sch[0].day });
      if (homeOpener) key.push({ when: lbl(homeOpener.day), what: `Home opener vs the ${S.teams[homeOpener.a].name}`, day: homeOpener.day });
      if (S.tradeDeadlineDay > 0) key.push({ when: lbl(S.tradeDeadlineDay - 1), what: 'Trade deadline', day: S.tradeDeadlineDay - 1 });
      if (S.allStarDay >= 0) key.push({ when: lbl(S.allStarDay), what: 'All-Star weekend: the contests and the game', day: S.allStarDay });
      key.push({ when: lbl(sch[sch.length - 1].day), what: 'Regular-season finale', day: sch[sch.length - 1].day });
      const cfg = L.cfg(S);
      key.push({ when: 'After the finale', what: cfg.playIn ? 'The play-in, then the playoffs' : 'The playoffs', day: S.numDays });
      key.push({ when: 'After the Finals', what: 'Awards, your season review, the coaching carousel and the Hall of Fame class', day: 9999 });
      key.push({ when: 'The summer', what: 'The draft lottery, the draft, re-signing and free agency', day: 9999 });
      const now = today == null ? 99999 : today;
      const keyHtml = key.map(k => {
        const done = k.day < now && k.day !== 9999, isToday = k.day === today;
        const left = !done && !isToday && k.day < 9000 && today != null ? k.day - today : null;
        return `<div class="li ${done ? 'cal-done' : ''}"><div style="flex:1;min-width:0"><div class="bold ${isToday ? 'accent-t' : ''}">${U.esc(k.what)}</div><div class="tiny muted">${U.esc(k.when)}</div></div>
          ${isToday ? '<span class="tag accent">Today</span>' : done ? '<span class="tiny dim">done</span>' : left != null ? `<span class="tiny muted">${left === 1 ? 'tomorrow' : 'in ' + left + ' days'}</span>` : ''}</div>`;
      }).join('');
      // what is coming up: your next games, with what makes them matter
      const up = Object.keys(games).map(Number).filter(d => !games[d].played && d >= (today == null ? 0 : today)).sort((a, b) => a - b).slice(0, 8);
      const upHtml = up.length ? up.map(d => {
        const g = games[d], home = g.h === u, opp = home ? g.a : g.h, ot = S.teams[opp], r = rv(u, opp);
        const notes = [];
        if (r) notes.push(`${r.icon} ${r.label}`);
        if (games[d - 1]) notes.push('second night of a back-to-back');
        if (st[opp] && st[opp].gp >= 10 && st[opp].w / st[opp].gp >= 0.6) notes.push('one of the best');
        return `<div class="li">${UI.teamBadge(ot, 24)}<div style="flex:1;min-width:0"><div class="ellip"><b>${home ? 'vs' : '@'} ${U.esc(ot.city + ' ' + ot.name)}</b> <span class="tiny dim">${st[opp] ? st[opp].w + '-' + st[opp].l : ''}</span></div>
          <div class="tiny muted">${U.esc(L.dateLabel(S, d, true))}${notes.length ? ' · ' + U.esc(notes.join(' · ')) : ''}</div></div></div>`;
      }).join('') : `<div class="empty">${OFF[S.phase] ? 'The season is over. The next schedule comes out at training camp.' : 'No games left on your schedule.'}</div>`;
      root.innerHTML = `<div class="page cal">
        <div class="page-h"><div><h1>Calendar</h1><div class="sub">${U.seasonLabel(S.season)}${today != null && inSeason(S) ? ' · today is ' + U.esc(L.dateLabel(S, today, true)) : ''}</div></div>
          <div class="actions"><button class="btn sm" data-m="-1" ${cal.m <= first ? 'disabled' : ''}>‹</button><span class="bold cal-mlabel">${MONTHS[mo]} ${y}</span><button class="btn sm" data-m="1" ${cal.m >= last ? 'disabled' : ''}>›</button>${today != null ? '<button class="btn sm ghost" data-m="0">Today</button>' : ''}</div></div>
        <div class="grid g-main"><div class="card"><div class="card-b">
          <div class="cal-grid cal-head">${DOW.map(d => `<div>${d}</div>`).join('')}</div>
          <div class="cal-grid">${cells}</div>
          <div class="tiny muted cal-key">Your games: <span class="cal-sw home"></span> home, <span class="cal-sw road"></span> road, <span class="cal-sw po"></span> postseason. 🔥 a rivalry night, B2B the second night of a back-to-back. Click a result for the box score.</div>
        </div></div>
        <div class="stack"><div class="card"><div class="card-h"><h3>Coming up</h3></div><div class="card-b flush"><div class="list">${upHtml}</div></div></div>
          <div class="card"><div class="card-h"><h3>The year</h3></div><div class="card-b flush"><div class="list">${keyHtml}</div></div></div></div></div></div>`;
      UI.on(root, 'click', '[data-m]', (e, el) => { const k = +el.dataset.m; cal.m = k === 0 ? mOf(today) : cal.m + k; UI.refresh(); });
    },
  });
})();
