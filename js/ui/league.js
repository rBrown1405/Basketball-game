/* Pro BBALL Coach — league screens: schedule, standings, playoffs, stats & leaders, teams, records & history. */
(function () {
  'use strict';
  const PBC = window.PBC;
  const U = PBC.U, C = PBC.Config, UI = PBC.UI;
  const League = PBC.League, Stats = PBC.Stats;

  // ---------------------------------------------------------------------------
  // Shared helpers
  // ---------------------------------------------------------------------------
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const cfg = S => League.cfg(S);
  const confFmt = S => cfg(S).playoffFormat === 'conference';
  const inSeason = S => S.phase === 'regular' || S.phase === 'playin' || S.phase === 'playoffs';
  const pct3 = v => (v >= 1 ? '1.000' : (v || 0).toFixed(3).replace(/^0/, ''));
  const signed = (v, d) => (v > 0 ? '+' : '') + Number(v).toFixed(d == null ? 1 : d);
  const tone = v => (v > 0.05 ? 'good-t' : v < -0.05 ? 'bad-t' : '');
  const abbr = (S, tid) => (S.teams[tid] ? S.teams[tid].abbr : '');
  const perG = (s, k) => (s && s.gp ? s[k] / s.gp : 0);
  const tabs = (list, cur, attr) => `<div class="tabs">${list.map(([k, l]) => `<button class="tab ${cur === k ? 'active' : ''}" data-${attr}="${k}">${l}</button>`).join('')}</div>`;
  const seg = (list, cur, attr) => `<div class="seg">${list.map(([k, l]) => `<button class="${String(cur) === String(k) ? 'on' : ''}" data-${attr}="${k}">${l}</button>`).join('')}</div>`;
  const field = (label, html) => `<label class="ls-f"><span>${label}</span>${html}</label>`;
  const emptyCard = (msg, icon) => `<div class="card"><div class="empty">${icon ? `<div class="ls-empty-ico">${icon}</div>` : ''}${msg}</div></div>`;
  const shortLink = p => (p ? UI.playerLink(p, PBC.Player.shortName(p)) : '');
  const moneyShort = n => (Math.abs(n) >= 1e8 ? '$' + Math.round(n / 1e6) + 'M' : U.money(n, true));
  const payroll = (S, tid) => (PBC.Offseason && PBC.Offseason.payroll ? PBC.Offseason.payroll(S, tid) : PBC.AI.payroll(S, tid));
  const streakHtml = s => (s > 0 ? `<span class="good-t">W${s}</span>` : s < 0 ? `<span class="bad-t">L${-s}</span>` : '<span class="dim">-</span>');

  /** Screen filters are remembered per career: loading another save starts from these defaults. */
  function forCareer(state, S, defaults) {
    if (state.save !== S.saveId) Object.assign(state, defaults, { save: S.saveId });
  }

  /** Team badge + clickable name. The city is dropped on phones. */
  function teamCell(t, size) {
    return `<span class="ls-tm">${UI.teamBadge(t, size || 22)}<a class="link" data-open-team="${t.id}" title="${U.esc(t.city + ' ' + t.name)}"><span class="ls-city">${U.esc(t.city)} </span>${U.esc(t.name)}</a></span>`;
  }

  function teamOptions(S, cur, allLabel, allVal) {
    const all = allVal || 'all';
    const list = S.teams.slice().sort((a, b) => (a.city + a.name).localeCompare(b.city + b.name));
    return (allLabel ? `<option value="${all}" ${String(cur) === all ? 'selected' : ''}>${allLabel}</option>` : '')
      + list.map(t => `<option value="${t.id}" ${String(cur) === String(t.id) ? 'selected' : ''}>${U.esc(t.city + ' ' + t.name)}${t.id === S.userTid ? ' (you)' : ''}</option>`).join('');
  }

  /** A conference (or the whole league) in seeding order. Copies the rows: League.sorted writes seed/gb onto them. */
  function group(S, conf, rows) { return League.sorted(S, conf, rows).map(r => Object.assign({}, r)); }

  /** Unplayed regular-season games per team. */
  function gamesLeft(S) {
    const left = {};
    for (const g of S.schedule) if (!g.played) { left[g.h] = (left[g.h] || 0) + 1; left[g.a] = (left[g.a] || 0) + 1; }
    return left;
  }

  /** Seeding lines: seeds 1..direct go straight to the playoffs, direct+1..last reach the play-in. */
  function lines(S) {
    const L = cfg(S);
    if (!confFmt(S)) return { direct: L.playoffTeams, last: L.playoffTeams };
    return L.playIn ? { direct: 6, last: 10 } : { direct: L.playoffTeams / 2, last: L.playoffTeams / 2 };
  }
  const seedChip = (S, seed) => { const ln = lines(S); return `<span class="ls-seed ${seed <= ln.direct ? 'po' : seed <= ln.last ? 'pi' : ''}">${seed}</span>`; };

  const MARK_TITLE = { z: 'Clinched the No. 1 seed', x: 'Clinched a playoff spot', pi: 'Clinched a play-in spot', o: 'Eliminated from the postseason' };
  /**
   * Clinch markers for one seeding group (a conference, or the league in the women's format).
   * Conservative: a team only gets a mark when no remaining results can take it away.
   */
  function marks(S, list, left) {
    const { direct, last } = lines(S);
    const done = list.every(r => !left[r.tid]);
    const maxW = r => r.w + (left[r.tid] || 0);
    const out = {};
    for (const r of list) {
      let m = '';
      if (done && r.gp) m = r.seed === 1 ? 'z' : r.seed <= direct ? 'x' : r.seed <= last ? 'pi' : 'o';
      else if (r.gp) {
        const catchers = list.filter(x => x !== r && maxW(x) >= r.w).length; // could still finish level or ahead
        const ahead = list.filter(x => x !== r && x.w > maxW(r)).length; // already certain to finish ahead
        if (catchers === 0) m = 'z';
        else if (catchers < direct) m = 'x';
        else if (last > direct && catchers < last) m = 'pi';
        else if (ahead >= last) m = 'o';
      }
      out[r.tid] = m;
    }
    return out;
  }
  const markHtml = m => (m ? `<b class="ls-mk ${m}" title="${MARK_TITLE[m]}">${m}</b>` : '');

  // ---------------------------------------------------------------------------
  // Schedule
  // ---------------------------------------------------------------------------
  const sch = { tid: null, filter: 'all' };
  const PI_STAGE = { A: '7/8 game', B: '9/10 game', C: 'Last chance' };
  const PI_WON = { A: 'Clinched 7 seed', B: 'Still alive', C: 'Clinched 8 seed' };
  const PI_LOST = { A: 'One more chance', B: 'Eliminated', C: 'Eliminated' };

  function regularGames(S, tid) {
    const out = [];
    let w = 0, l = 0;
    for (const g of S.schedule) {
      if (g.h !== tid && g.a !== tid) continue;
      const x = { g, n: out.length + 1, day: g.day, home: g.h === tid, opp: g.h === tid ? g.a : g.h, po: false };
      if (g.played) {
        x.us = x.home ? g.hs : g.as; x.them = x.home ? g.as : g.hs; x.won = x.us > x.them;
        if (x.won) w++; else l++;
        x.after = `${w}-${l}`;
      }
      out.push(x);
    }
    return out;
  }

  function postGames(S, tid) {
    const P = S.playoffs;
    if (!P) return [];
    const today = S.todayPost && S.todayPostDay === S.day ? S.todayPost : [];
    const seen = new Set(), tally = {}, out = [];
    for (const g of (P.games || []).concat(today)) {
      if (seen.has(g.gid) || (g.h !== tid && g.a !== tid)) continue;
      seen.add(g.gid);
      const s = g.series ? P.series.find(y => y.id === g.series) : null;
      const pi = g.playIn && P.playIn ? P.playIn.find(y => y.id === g.playIn) : null;
      const x = { g, day: g.day, home: g.h === tid, opp: g.h === tid ? g.a : g.h, po: true,
        label: s ? `${League.roundName(S, s.round)} · G${g.gameNum}` : `Play-In${pi ? ' · ' + PI_STAGE[pi.stage] : ''}` };
      if (g.played) {
        x.us = x.home ? g.hs : g.as; x.them = x.home ? g.as : g.hs; x.won = x.us > x.them;
        if (s) {
          const k = tally[s.id] || (tally[s.id] = [0, 0]);
          k[x.won ? 0 : 1]++;
          const need = Math.ceil(s.len / 2), sc = `${k[0]}-${k[1]}`;
          x.after = k[0] >= need ? `Won ${sc}` : k[1] >= need ? `Lost ${sc}` : k[0] === k[1] ? `Tied ${sc}` : `${k[0] > k[1] ? 'Lead' : 'Trail'} ${sc}`;
        } else if (pi) x.after = (x.won ? PI_WON : PI_LOST)[pi.stage];
      }
      out.push(x);
    }
    return out.sort((a, b) => a.day - b.day || a.g.gid - b.g.gid);
  }

  /** Best line of the given team from a stored box score (the user's games keep their boxes). */
  function topLine(S, gid, tid) {
    const box = S.boxes && S.boxes[gid];
    const T = box && box.teams.find(x => x.tid === tid);
    const best = T ? U.maxBy(T.players.filter(p => !p.dnp), p => Stats.gmsc(p)) : null;
    if (!best) return '';
    const p = S.players[best.pid];
    return `${p ? shortLink(p) : U.esc(best.name)} <span class="dim">${best.pts} pts, ${best.orb + best.drb} reb, ${best.ast} ast</span>`;
  }

  /** "Thu, Oct 22" on desktop, "Oct 22" on phones. */
  function dateCell(S, day) {
    const full = League.dateLabel(S, day, true), i = full.indexOf(', ');
    return i > 0 ? `<span class="ls-hide-sm">${full.slice(0, i + 2)}</span>${full.slice(i + 2)}` : full;
  }

  function schedTable(S, list, tid, o) {
    if (!list.length) return `<div class="empty">${o.empty}</div>`;
    const st = o.st, po = list[0].po;
    const next = list.find(x => !x.g.played);
    const showTop = list.some(x => S.boxes && S.boxes[x.g.gid]);
    const ncol = 5 + (showTop ? 1 : 0);
    const events = o.events ? [[S.tradeDeadlineDay, '⏰ Trade deadline', S.tradeDeadlineDay - 1], [S.allStarDay, '⭐ All-Star break', S.allStarDay]]
      .filter(e => e[0] > 0).sort((a, b) => a[0] - b[0]) : [];
    let html = '', mo = -1;
    for (const x of list) {
      while (events.length && x.day >= events[0][0]) {
        const e = events.shift();
        html += `<tr class="ls-evt"><td colspan="${ncol}">${e[1]} · ${League.dateLabel(S, e[2], true)}</td></tr>`;
      }
      if (o.months) {
        const d = League.dateOf(S, x.day), m = d.getUTCFullYear() * 12 + d.getUTCMonth();
        if (m !== mo) { mo = m; html += `<tr class="ls-mo"><td colspan="${ncol}">${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}</td></tr>`; }
      }
      const g = x.g, opp = S.teams[x.opp];
      const box = S.boxes && S.boxes[g.gid];
      let res = '';
      if (g.played) {
        const txt = `${x.won ? 'W' : 'L'} ${x.us}-${x.them}`;
        res = (box ? `<a class="link ls-res ${x.won ? 'w' : 'l'}" data-open-box="${g.gid}" title="Open the box score">${txt}</a>` : `<span class="ls-res ${x.won ? 'w' : 'l'}">${txt}</span>`)
          + (g.ot ? ` <span class="tag">${g.ot > 1 ? g.ot : ''}OT</span>` : '');
      } else if (x.day === S.day && inSeason(S)) res = '<span class="tag accent">Today</span>';
      else if (x === next) res = '<span class="tag info">Next</span>';
      html += `<tr class="${x === next ? 'ls-next' : ''}">
        <td class="${po ? 'small bold nowrap' : 'num dim'}">${po ? U.esc(x.label) : x.n}</td>
        <td class="nowrap">${dateCell(S, x.day)}</td>
        <td><span class="ls-ha">${x.home ? 'vs' : '@'}</span>${teamCell(opp, 20)}${g.played ? '' : ` <span class="tiny dim">${st[x.opp].w}-${st[x.opp].l}</span>`}</td>
        <td class="nowrap">${res}</td>
        <td class="${po ? 'small' : 'num'}">${x.after || ''}</td>
        ${showTop ? `<td class="small ls-hide-sm">${g.played ? topLine(S, g.gid, tid) : ''}</td>` : ''}</tr>`;
    }
    return `<div class="tbl-wrap"><table class="tbl compact ls-sched"><thead><tr><th class="${po ? '' : 'num'}">${po ? 'Round' : '#'}</th><th>Date</th><th>Opponent</th><th>Result</th>
      <th class="${po ? '' : 'num'}">${po ? 'Series' : 'W-L'}</th>${showTop ? '<th class="ls-hide-sm">Top performer</th>' : ''}</tr></thead><tbody>${html}</tbody></table></div>`;
  }

  function schedSummary(S, tid, reg, post, st) {
    const L = cfg(S), t = S.teams[tid], r = st[tid];
    let seed = 'Record';
    if (r.gp) {
      const me = group(S, confFmt(S) ? t.conf : null, st).find(x => x.tid === tid);
      seed = `${U.ordinal(me.seed)} in ${confFmt(S) ? L.confs[t.conf] : 'the league'}`;
    }
    const next = post.find(x => !x.g.played) || (S.phase === 'regular' || S.phase === 'preseason' ? reg.find(x => !x.g.played) : null);
    const tile = (v, l) => `<div class="stat"><div class="v">${v}</div><div class="l">${l}</div></div>`;
    let nextTile = '';
    if (next) {
      const o = S.teams[next.opp], today = next.day === S.day && inSeason(S);
      nextTile = `<div class="stat ls-next-tile">${UI.teamBadge(o, 34)}<div><div class="v">${next.home ? 'vs' : '@'} ${o.abbr}</div>
        <div class="l">${today ? 'Today' : 'Next'} · ${League.dateLabel(S, next.day)}${next.po ? ' · ' + U.esc(next.label) : ''}</div></div></div>`;
    }
    const play = tid === S.userTid && inSeason(S) && next ? '<button class="btn primary" data-act="play">▶ Game Day</button>' : '';
    return `<div class="card" style="margin-bottom:16px"><div class="card-b" style="padding-top:16px"><div class="stats-row ls-sum">
      ${tile(`${r.w}-${r.l}`, seed)}${tile(`${r.hw}-${r.hl}`, 'Home')}${tile(`${r.aw}-${r.al}`, 'Away')}
      ${tile(r.gp ? `${r.l10[0]}-${r.l10[1]}` : '-', 'Last 10')}${tile(streakHtml(r.streak), 'Streak')}${tile(reg.filter(x => !x.g.played).length, 'Games left')}
      ${nextTile}${play ? `<div class="ls-sum-act">${play}</div>` : ''}</div></div></div>`;
  }

  UI.register('schedule', {
    title: 'Schedule',
    render(root, params) {
      const S = UI.S;
      forCareer(sch, S, { tid: null });
      if (params && params.tid != null) { sch.tid = params.tid === S.userTid ? null : params.tid; params.tid = null; }
      if (S.phase === 'playin' || S.phase === 'playoffs') PBC.Season.prepareToday(S);
      const tid = sch.tid != null && S.teams[sch.tid] ? sch.tid : S.userTid;
      const t = S.teams[tid];
      if (!t) { root.innerHTML = `<div class="page">${emptyCard('No team to show.')}</div>`; return; }
      const st = League.standings(S);
      const reg = regularGames(S, tid), post = postGames(S, tid);
      const f = sch.filter;
      const keep = x => f === 'all' || (f === 'results' ? x.g.played : f === 'upcoming' ? !x.g.played : f === 'home' ? x.home : !x.home);
      const regList = reg.filter(keep), postList = post.filter(keep);
      const played = reg.filter(x => x.g.played).length;
      const postCard = postList.length ? `<div class="card accent" style="margin-bottom:16px"><div class="card-h"><h3>Postseason</h3>
          <div class="actions"><button class="btn sm ghost" data-nav="playoffs">Bracket ›</button></div></div>
        <div class="card-b flush">${schedTable(S, postList, tid, { st, empty: '' })}</div></div>` : '';
      root.innerHTML = `<div class="page">
        <div class="page-h"><div><h1>Schedule</h1><div class="sub">${U.esc(t.city + ' ' + t.name)} · ${U.seasonLabel(S.season)} · ${reg.length}-game regular season</div></div>
          <div class="actions"><select class="inp ls-sel" data-f="tid" aria-label="Team">${teamOptions(S, tid)}</select>
            ${seg([['all', 'All'], ['results', 'Results'], ['upcoming', 'Upcoming'], ['home', 'Home'], ['away', 'Away']], f, 'filter')}</div></div>
        ${schedSummary(S, tid, reg, post, st)}
        ${S.phase === 'regular' || S.phase === 'preseason' ? '' : postCard}
        <div class="card" style="margin-bottom:16px"><div class="card-h"><h3>Regular season</h3><div class="actions"><span class="small muted">${played} of ${reg.length} played</span></div></div>
          <div class="card-b flush">${schedTable(S, regList, tid, { st, months: true, events: f === 'all', empty: f === 'upcoming' ? 'The regular season is complete.' : 'No games match this filter.' })}</div></div>
      </div>`;
      UI.on(root, 'change', '[data-f="tid"]', (e, el) => { sch.tid = +el.value === S.userTid ? null : +el.value; UI.refresh(); });
      UI.on(root, 'click', '[data-filter]', (e, el) => { sch.filter = el.dataset.filter; UI.refresh(); });
      UI.on(root, 'click', '[data-act="play"]', () => PBC.App.goToNextGame());
    },
  });

  // ---------------------------------------------------------------------------
  // Standings
  // ---------------------------------------------------------------------------
  const stn = { view: null };
  // [header, cell, tooltip, hide on phones]
  const ST_COLS = {
    w: ['W', r => r.w], l: ['L', r => r.l], pct: ['PCT', r => pct3(r.pct), 'Winning percentage'],
    gb: ['GB', r => (r.gb ? r.gb.toFixed(1) : '-'), 'Games behind'],
    conf: ['CONF', r => `${r.cw}-${r.cl}`, 'Conference record'], div: ['DIV', r => `${r.dw}-${r.dl}`, 'Division record'],
    home: ['HOME', r => `${r.hw}-${r.hl}`], away: ['AWAY', r => `${r.aw}-${r.al}`],
    ppg: ['PPG', r => U.num(perG(r, 'pf')), 'Points per game', 1], opp: ['OPP', r => U.num(perG(r, 'pa')), 'Opponent points per game', 1],
    diff: ['DIFF', r => `<span class="${tone(r.diff)}">${signed(r.diff)}</span>`, 'Average point differential'],
    strk: ['STRK', r => streakHtml(r.streak), 'Current streak'], l10: ['L10', r => `${r.l10[0]}-${r.l10[1]}`, 'Last 10 games'],
  };

  /**
   * o: { cols, seedOf (tid -> seed shown as a chip), rank (show the row's own rank instead), cuts (draw playoff lines),
   *      marks, confCol (league view: conference + seed column) }
   */
  function stTable(S, list, o) {
    const L = cfg(S), ln = lines(S);
    const head = `<tr><th class="num">#</th><th>Team</th>${o.confCol ? '<th>Seed</th>' : ''}${o.cols.map(k => `<th class="num ${ST_COLS[k][3] ? 'ls-hide-sm' : ''}" ${ST_COLS[k][2] ? `title="${ST_COLS[k][2]}"` : ''}>${ST_COLS[k][0]}</th>`).join('')}</tr>`;
    const body = list.map((r, i) => {
      const t = S.teams[r.tid], m = o.marks[r.tid] || '';
      let cut = '';
      if (o.cuts && i < list.length - 1) cut = r.seed === ln.direct ? 'ls-cut' : ln.last > ln.direct && r.seed === ln.last ? 'ls-cut pi' : '';
      return `<tr class="click ${r.tid === S.userTid ? 'me' : ''} ${cut} ${m === 'o' ? 'ls-out' : ''}" data-open-team="${r.tid}">
        <td class="num">${o.rank ? `<span class="ls-seed">${r.seed}</span>` : seedChip(S, o.seedOf[r.tid])}</td>
        <td>${teamCell(t)}${markHtml(m)}</td>
        ${o.confCol ? `<td class="nowrap">${seedChip(S, o.seedOf[r.tid])} <span class="small muted">${L.confs[t.conf]}</span></td>` : ''}
        ${o.cols.map(k => `<td class="num ${ST_COLS[k][3] ? 'ls-hide-sm' : ''}">${ST_COLS[k][1](r)}</td>`).join('')}</tr>`;
    }).join('');
    return `<div class="tbl-wrap"><table class="tbl compact ls-st"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
  }

  const stCard = (title, note, table) => `<div class="card" style="margin-bottom:16px"><div class="card-h"><h3>${title}</h3>${note ? `<div class="actions"><span class="small muted">${note}</span></div>` : ''}</div><div class="card-b flush">${table}</div></div>`;

  /** Before the first tip-off: preseason projections instead of a table of zeros. */
  function projectionCards(S) {
    const L = cfg(S), G = S.seasonGames, proj = S.preseasonProj || {};
    const ln = lines(S);
    return (confFmt(S) ? [0, 1] : [null]).map(c => {
      const list = U.sortBy(S.teams.filter(t => c == null || t.conf === c), t => proj[t.id] || 0, true);
      const rows = list.map((t, i) => {
        const p = proj[t.id] || 0, w = Math.round(p * G);
        const h = t.history[t.history.length - 1];
        const cut = i < list.length - 1 && (i + 1 === ln.direct ? 'ls-cut' : ln.last > ln.direct && i + 1 === ln.last ? 'ls-cut pi' : '');
        return `<tr class="click ${t.id === S.userTid ? 'me' : ''} ${cut || ''}" data-open-team="${t.id}"><td class="num">${seedChip(S, i + 1)}</td><td>${teamCell(t)}</td>
          <td class="num bold">${w}-${G - w}</td><td class="num">${pct3(p)}</td><td class="num">${Math.round(League.teamStrength(S, t.id))}</td>
          <td class="small muted ls-hide-sm">${h ? `${h.w}-${h.l} · ${U.esc(h.result)}` : 'New league'}</td></tr>`;
      }).join('');
      return stCard(c == null ? 'League' : L.confs[c], 'Projected by roster strength', `<div class="tbl-wrap"><table class="tbl compact"><thead><tr><th class="num">#</th><th>Team</th>
        <th class="num" title="Projected record">PROJ</th><th class="num">WIN%</th><th class="num" title="Team rating">RTG</th><th class="ls-hide-sm">Last season</th></tr></thead><tbody>${rows}</tbody></table></div>`);
    }).join('');
  }

  function legendHtml(S) {
    const pi = lines(S).last > lines(S).direct;
    return `<div class="ls-legend">
      <span>${markHtml('z')} No. 1 seed clinched</span><span>${markHtml('x')} Playoff spot clinched</span>${pi ? `<span>${markHtml('pi')} Play-in spot clinched</span>` : ''}<span>${markHtml('o')} Eliminated</span>
      <span><i class="ls-seed po">1</i> Playoff seed</span>${pi ? '<span><i class="ls-seed pi">7</i> Play-in seed</span>' : ''}<span>Click a team for its page.</span></div>`;
  }

  UI.register('standings', {
    title: 'Standings',
    render(root, params) {
      const S = UI.S, L = cfg(S), conf = confFmt(S);
      if (params && params.view) { stn.view = params.view; params.view = null; }
      const rows = League.standings(S);
      const played = rows.some(r => r.gp);
      const left = gamesLeft(S);
      const done = S.schedule.length > 0 && S.schedule.every(g => g.played);
      const views = conf ? [['conf', 'Conference'], ['div', 'Division'], ['league', 'League']] : [['league', 'League'], ['conf', 'Conference']];
      const view = views.some(v => v[0] === stn.view) ? stn.view : views[0][0];
      const ln = lines(S);
      // seeds & clinch marks come from the seeding groups, whatever the view
      const seedOf = {}, mk = {};
      for (const c of conf ? [0, 1] : [null]) {
        const list = group(S, c, rows), m = marks(S, list, left);
        list.forEach(r => { seedOf[r.tid] = r.seed; mk[r.tid] = m[r.tid]; });
      }
      const full = conf ? ['w', 'l', 'pct', 'gb', 'conf', 'div', 'home', 'away', 'ppg', 'opp', 'diff', 'strk', 'l10'] : ['w', 'l', 'pct', 'gb', 'conf', 'home', 'away', 'ppg', 'opp', 'diff', 'strk', 'l10'];
      const lineNote = conf ? (L.playIn ? `Top ${ln.direct}: playoffs · ${ln.direct + 1}-${ln.last}: play-in` : `Top ${ln.direct}: playoffs`) : `Top ${ln.direct}: playoffs`;
      let body;
      if (!played) body = projectionCards(S);
      else if (view === 'conf') {
        body = [0, 1].map(c => stCard(L.confs[c], conf ? lineNote : `Seeds are league-wide`, stTable(S, group(S, c, rows), { cols: full, seedOf, marks: mk, cuts: conf }))).join('');
      } else if (view === 'div') {
        const divCards = c => U.uniq(S.teams.filter(t => t.conf === c).map(t => t.div)).map(d => {
          const list = group(S, c, rows).filter(r => r.div === d);
          list.forEach(r => { r.gb = ((list[0].w - r.w) + (r.l - list[0].l)) / 2; });
          return stCard(L.divs[d], L.confs[c], stTable(S, list, { cols: ['w', 'l', 'pct', 'gb', 'div', 'conf', 'strk', 'l10'], seedOf, marks: mk }));
        }).join('');
        body = `<div class="grid g2"><div>${divCards(0)}</div><div>${divCards(1)}</div></div>`;
      } else {
        body = stCard(conf ? 'League' : 'League standings', conf ? 'Seeds are by conference' : lineNote,
          stTable(S, group(S, null, rows), { cols: full.filter(k => k !== 'div'), seedOf, marks: mk, rank: conf, confCol: conf, cuts: !conf }));
      }
      const sub = !played ? `${U.seasonLabel(S.season)} · the season has not tipped off yet` : `${U.seasonLabel(S.season)} ${done ? 'final standings' : 'regular season'} · ${L.label}`;
      root.innerHTML = `<div class="page">
        <div class="page-h"><div><h1>Standings</h1><div class="sub">${sub}</div></div>
          <div class="actions">${played ? tabs(views, view, 'view') : ''}${S.playoffs || played ? `<button class="btn ghost" data-nav="playoffs">${S.playoffs ? 'Playoff bracket' : 'Playoff picture'} ›</button>` : ''}</div></div>
        ${body}
        ${played ? legendHtml(S) : '<p class="hint">Projections come from each roster\'s strength. Records appear here once games are played.</p>'}
      </div>`;
      UI.on(root, 'click', '[data-view]', (e, el) => { stn.view = el.dataset.view; UI.refresh(); });
    },
  });

  // ---------------------------------------------------------------------------
  // Playoffs
  // ---------------------------------------------------------------------------
  /** Regular-season seeds (used in the play-in). */
  function baseSeeds(S, P, rows) {
    const m = {};
    if (P) for (const tid in P.seeds) m[tid] = P.seeds[tid].seed;
    else (confFmt(S) ? [0, 1] : [null]).forEach(c => group(S, c, rows).forEach(r => { m[r.tid] = r.seed; }));
    return m;
  }
  /** Playoff seeds: play-in winners take the 7 and 8 slots. */
  function bracketSeeds(S, P, rows) {
    const m = baseSeeds(S, P, rows);
    if (P) for (const s of P.series) if (s.round === 1) { m[s.hi] = s.hiSeed; m[s.lo] = s.loSeed; }
    return m;
  }
  const winnerOf = x => (x.s && x.s.done ? x.s.winner : null);
  const feedLabel = (S, x) => (x.top != null && x.bot != null ? `${abbr(S, x.top)} / ${abbr(S, x.bot)} winner` : 'TBD');

  /**
   * Bracket columns (one per round) of slots { s: series|null, top, bot, conf, tbd: [labels] }.
   * Later rounds are filled from their feeder slots, so the shape is stable before series exist.
   */
  function bracketModel(S, P, rows) {
    const L = cfg(S), conf = confFmt(S);
    let first = P ? P.series.filter(s => s.round === 1).map(s => ({ s, top: s.hi, bot: s.lo, conf: s.conf })) : [];
    if (!first.length) {
      const per = conf ? L.playoffTeams / 2 : L.playoffTeams;
      const pairs = per === 8 ? [[1, 8], [4, 5], [3, 6], [2, 7]] : per === 4 ? [[1, 4], [2, 3]] : [[1, 2]];
      for (const c of conf ? [0, 1] : [null]) {
        const bySeed = {};
        if (P) { for (const tid in P.seeds) if (P.seeds[tid].conf === c) bySeed[P.seeds[tid].seed] = +tid; }
        else group(S, c, rows).forEach(r => { bySeed[r.seed] = r.tid; });
        const viaPI = !!(P && P.playIn);
        if (viaPI) {
          const pi = stage => P.playIn.find(x => x.conf === c && x.stage === stage);
          const a = pi('A'), last = pi('C');
          bySeed[7] = a && a.winner != null ? a.winner : null;
          bySeed[8] = last && last.winner != null ? last.winner : null;
        }
        for (const [h, l] of pairs) {
          const tbd = viaPI && l >= 7 ? (l === 7 ? '7/8 game winner' : 'Last-chance winner') : 'TBD';
          first.push({ s: null, top: bySeed[h] != null ? bySeed[h] : null, bot: bySeed[l] != null ? bySeed[l] : null, conf: c, tbd: ['TBD', tbd], seeds: [h, l] });
        }
      }
    }
    const cols = [first];
    for (let r = 2; r <= L.series.length; r++) {
      const prev = cols[r - 2], real = P ? P.series.filter(s => s.round === r) : [], col = [];
      for (let j = 0; j + 1 < prev.length; j += 2) {
        const a = prev[j], b = prev[j + 1], ta = winnerOf(a), tb = winnerOf(b);
        const s = ta != null && tb != null ? real.find(x => (x.hi === ta && x.lo === tb) || (x.hi === tb && x.lo === ta)) || null : null;
        col.push({ s, top: ta, bot: tb, conf: a.conf === b.conf ? a.conf : null, tbd: [feedLabel(S, a), feedLabel(S, b)] });
      }
      cols.push(col);
    }
    return cols;
  }

  function seriesStatus(S, s) {
    const [a, b] = s.w, hiLo = `${Math.max(a, b)}-${Math.min(a, b)}`;
    if (s.done) return `${abbr(S, s.winner)} wins ${hiLo}`;
    if (a === b) return a ? `Series tied ${a}-${b}` : `Best of ${s.len}`;
    return `${abbr(S, a > b ? s.hi : s.lo)} leads ${hiLo}`;
  }

  function bTeam(S, tid, o) {
    if (tid == null) return `<div class="b-team tbd"><span class="sd"></span><span class="b-dot"></span><span class="nm">${U.esc(o.tbd || 'TBD')}</span></div>`;
    const t = S.teams[tid];
    return `<div class="b-team ${o.cls || ''} ${tid === S.userTid ? 'me' : ''}"><span class="sd">${o.seed || ''}</span>${UI.teamBadge(t, 20)}
      <a class="link nm" data-open-team="${tid}" title="${U.esc(t.city + ' ' + t.name)}">${U.esc(t.name)}</a>${o.cup ? '<span class="b-cup" title="Champion">🏆</span>' : ''}<span class="w">${o.w != null ? o.w : ''}</span></div>`;
  }

  function seriesCard(S, slot, seeds, round, projected) {
    const L = cfg(S), s = slot.s, finals = round === L.series.length;
    const team = (tid, i) => bTeam(S, tid, {
      seed: slot.seeds ? slot.seeds[i] : seeds[tid], tbd: slot.tbd && slot.tbd[i], w: s ? (s.hi === tid ? s.w[0] : s.w[1]) : null,
      cls: s && s.done ? (s.winner === tid ? 'win' : 'lose') : '', cup: finals && s && s.done && s.winner === tid,
    });
    const pre = slot.conf != null && confFmt(S) ? `${L.confs[slot.conf]} · ` : '';
    const st = s ? seriesStatus(S, s) : projected && slot.top != null && slot.bot != null ? 'Projected matchup' : `Best of ${L.series[round - 1]}`;
    return `<div class="b-series ${s ? 'click' : 'tbd'}" ${s ? `data-series="${s.id}" title="Game-by-game results"` : ''}>${team(slot.top, 0)}${team(slot.bot, 1)}
      <div class="b-st ${s && s.done ? 'done' : ''}">${pre}${st}</div></div>`;
  }

  function bracketHtml(S, cols, seeds, projected) {
    const L = cfg(S);
    return `<div class="bracket">${cols.map((col, i) => `<div class="b-round"><h4>${League.roundName(S, i + 1)}<small>Best of ${L.series[i]}</small></h4>
      <div class="b-slots">${col.map(slot => seriesCard(S, slot, seeds, i + 1, projected)).join('')}</div></div>`).join('')}</div>`;
  }

  const PI_NOTE = { A: 'Winner: 7 seed · Loser: last chance', B: 'Winner: last chance · Loser: out', C: 'Winner: 8 seed · Loser: out' };
  function playInCard(S, x, seeds) {
    const g = x.game && x.game.played ? x.game : null;
    const team = (tid, i) => bTeam(S, tid, {
      seed: seeds[tid], tbd: x.tbd && x.tbd[i], w: g ? (g.h === tid ? g.hs : g.as) : null,
      cls: x.winner != null ? (x.winner === tid ? 'win' : 'lose') : '',
    });
    let st = PI_NOTE[x.stage];
    if (x.winner != null) {
      st = x.stage === 'A' ? `${abbr(S, x.winner)} takes the 7 seed` : x.stage === 'B' ? `${abbr(S, x.loser)} is eliminated` : `${abbr(S, x.winner)} takes the 8 seed`;
      if (g && g.ot) st += `, ${g.ot > 1 ? g.ot : ''}OT`;
      if (g && S.boxes && S.boxes[g.gid]) st += ` · <a class="link" data-open-box="${g.gid}">Box score</a>`;
    }
    return `<div class="b-series ${g ? '' : 'tbd'}">${team(x.hi, 0)}${team(x.lo, 1)}<div class="b-st ${x.winner != null ? 'done' : ''}">${st}</div></div>`;
  }

  function playInHtml(S, P, rows, seeds) {
    const L = cfg(S);
    return `<div class="grid g2">${[0, 1].map(c => {
      let A, B, last;
      if (P && P.playIn) {
        const f = stage => P.playIn.find(x => x.conf === c && x.stage === stage);
        A = f('A'); B = f('B'); last = f('C');
      } else {
        const list = group(S, c, rows);
        if (list.length < 10) return '';
        A = { stage: 'A', hi: list[6].tid, lo: list[7].tid };
        B = { stage: 'B', hi: list[8].tid, lo: list[9].tid };
      }
      last = last || { stage: 'C', hi: A.loser != null ? A.loser : null, lo: B.winner != null ? B.winner : null, tbd: ['7/8 game loser', '9/10 game winner'] };
      return `<div class="card"><div class="card-h"><h3>${L.confs[c]} Play-In</h3><div class="actions"><span class="small muted">Seeds 7-10</span></div></div>
        <div class="card-b"><div class="bracket">
          <div class="b-round"><h4>Opening games</h4><div class="b-slots">${playInCard(S, A, seeds)}${playInCard(S, B, seeds)}</div></div>
          <div class="b-round"><h4>Last chance</h4><div class="b-slots">${playInCard(S, last, seeds)}</div></div>
        </div></div></div>`;
    }).join('')}</div>`;
  }

  /** One-line summary of where the user's team stands in the postseason: [text, tag class]. */
  function userPostStatus(S, P, seeds) {
    const u = S.userTid;
    if (!S.teams[u]) return null;
    if (!P) {
      const sd = seeds[u], ln = lines(S);
      return sd <= ln.direct ? [`You'd be the ${U.ordinal(sd)} seed`, 'good'] : sd <= ln.last ? [`You'd be in the play-in (${U.ordinal(sd)})`, 'warn'] : ['Outside the playoff picture', 'bad'];
    }
    if (P.champion === u) return ['🏆 Champions', 'gold'];
    const mine = P.series.filter(s => s.hi === u || s.lo === u);
    const cur = mine.find(s => !s.done);
    const rn = r => League.roundName(S, r);
    if (cur) {
      const my = cur.hi === u ? cur.w[0] : cur.w[1], th = cur.hi === u ? cur.w[1] : cur.w[0];
      return [`${rn(cur.round)}: ${my > th ? 'you lead' : my < th ? 'you trail' : 'tied'} ${my}-${th}`, my >= th ? 'good' : 'warn'];
    }
    const lastS = mine[mine.length - 1];
    if (lastS && lastS.winner !== u) return [`Eliminated in the ${rn(lastS.round)}`, 'bad'];
    if (lastS) return [`Won the ${rn(lastS.round)}`, 'good'];
    const pi = (P.playIn || []).filter(x => x.hi === u || x.lo === u);
    const x = pi[pi.length - 1];
    if (x) {
      if (x.winner == null) return [`Play-In: ${PI_STAGE[x.stage]}`, 'warn'];
      if (x.winner === u) return [x.stage === 'B' ? 'Won the 9/10 game' : `Clinched the ${x.stage === 'A' ? 7 : 8} seed`, 'good'];
      return x.stage === 'A' ? ['Lost the 7/8 game: one more chance', 'warn'] : ['Eliminated in the Play-In', 'bad'];
    }
    if (P.seeds[u] && P.seeds[u].seed <= lines(S).direct) return [`${U.ordinal(P.seeds[u].seed)} seed · waiting on the play-in`, 'good'];
    return ['Missed the playoffs', 'bad'];
  }

  function championHero(S, P) {
    const L = cfg(S), t = S.teams[P.champion], ru = S.teams[P.runnerUp];
    const fin = P.series.find(s => s.round === L.series.length && s.done) || P.series.filter(s => s.done).slice(-1)[0];
    const sc = fin ? `${Math.max(fin.w[0], fin.w[1])}-${Math.min(fin.w[0], fin.w[1])}` : '';
    const mvp = P.fmvp != null ? S.players[P.fmvp] : null;
    const line = mvp ? Stats.season(mvp, S.season, true) : null;
    return `<div class="hero ls-champ" style="--team:${t.colors.primary};--team2:${t.colors.secondary};margin-bottom:16px"><div class="hero-in">
      <div class="row nowrap ls-champ-main"><span class="ls-trophy">🏆</span>${UI.teamBadge(t, 84)}
        <div style="min-width:0"><div class="tiny up dim" style="letter-spacing:2px">${U.seasonLabel(S.season)} Champions</div>
        <div class="up ls-champ-nm">${U.esc(t.city)} ${U.esc(t.name)}</div>
        <div class="muted">${ru ? `Beat the ${UI.teamLink(ru, ru.city + ' ' + ru.name)} ${sc} in the Finals` : ''}</div></div></div>
      ${mvp ? `<div class="recap-award">${UI.avatar(mvp, 54)}<div style="min-width:0"><div class="al">Finals MVP</div><div class="bold">${UI.playerLink(mvp)}</div>
        ${line && line.gp ? `<div class="tiny muted">${U.num(line.pts / line.gp)} pts, ${U.num((line.orb + line.drb) / line.gp)} reb, ${U.num(line.ast / line.gp)} ast in the playoffs</div>` : ''}</div></div>` : ''}
    </div></div>`;
  }

  function seriesModal(S, s) {
    if (!s) return;
    const P = S.playoffs, L = cfg(S);
    const hi = S.teams[s.hi], lo = S.teams[s.lo];
    const games = (P.games || []).filter(g => g.series === s.id).sort((a, b) => (a.gameNum || 0) - (b.gameNum || 0));
    const tally = [0, 0];
    const rows = games.map(g => {
      const win = g.hs > g.as ? g.h : g.a;
      tally[win === s.hi ? 0 : 1]++;
      const lead = tally[0] === tally[1] ? null : tally[0] > tally[1] ? s.hi : s.lo;
      const over = Math.max(tally[0], tally[1]) >= Math.ceil(s.len / 2);
      const status = lead == null ? `Tied ${tally[0]}-${tally[1]}` : `${abbr(S, lead)} ${over ? 'wins' : 'leads'} ${Math.max(...tally)}-${Math.min(...tally)}`;
      const side = (tid, pts) => (tid === win ? `<b>${abbr(S, tid)} ${pts}</b>` : `<span class="muted">${abbr(S, tid)} ${pts}</span>`);
      const box = S.boxes && S.boxes[g.gid];
      return `<tr><td class="bold nowrap">Game ${g.gameNum}</td><td class="nowrap">${League.dateLabel(S, g.day, true)}</td>
        <td class="nowrap">${side(g.a, g.as)} <span class="dim">@</span> ${side(g.h, g.hs)}${g.ot ? ` <span class="tag">${g.ot > 1 ? g.ot : ''}OT</span>` : ''}</td>
        <td class="small nowrap">${status}</td><td>${box ? `<a class="link small" data-open-box="${g.gid}">Box score</a>` : ''}</td></tr>`;
    }).join('');
    const seeds = bracketSeeds(S, P, null);
    const body = `<div class="box-score-h">
        <div class="vs-team">${UI.teamBadge(hi, 58)}<div class="nm">${U.esc(hi.name)}</div><div class="small muted">${seeds[s.hi] ? U.ordinal(seeds[s.hi]) + ' seed' : ''}</div></div>
        <div class="center"><div class="sc">${s.w[0]} <span class="dim">-</span> ${s.w[1]}</div><div class="small muted up">${seriesStatus(S, s)}</div></div>
        <div class="vs-team">${UI.teamBadge(lo, 58)}<div class="nm">${U.esc(lo.name)}</div><div class="small muted">${seeds[s.lo] ? U.ordinal(seeds[s.lo]) + ' seed' : ''}</div></div></div>
      ${games.length ? `<div class="tbl-wrap" style="margin-top:16px"><table class="tbl compact"><thead><tr><th>Game</th><th>Date</th><th>Score</th><th>Series</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`
        : '<div class="empty">Game 1 has not been played yet.</div>'}
      <p class="hint" style="margin-bottom:0">Box scores are kept for your own games.</p>`;
    UI.modal({ title: `${s.conf != null && confFmt(S) ? L.confs[s.conf] + ' ' : ''}${League.roundName(S, s.round)}`, body, wide: true });
  }

  UI.register('playoffs', {
    title: 'Playoffs',
    render(root) {
      const S = UI.S, L = cfg(S), P = S.playoffs;
      const rows = League.standings(S);
      if (!P && !rows.some(r => r.gp)) {
        const h = S.history[S.history.length - 1], ch = h ? S.teams[h.champion] : null;
        root.innerHTML = `<div class="page"><div class="page-h"><div><h1>Playoffs</h1><div class="sub">${U.seasonLabel(S.season)} postseason</div></div></div>
          ${emptyCard(`The playoff picture takes shape once the season tips off.${ch ? `<br>Defending champions: <b>${U.esc(ch.city + ' ' + ch.name)}</b>.` : ''}`, '🏆')}</div>`;
        return;
      }
      const base = baseSeeds(S, P, rows), seeds = bracketSeeds(S, P, rows);
      const cols = bracketModel(S, P, rows);
      const stage = !P ? 'if the season ended today' : P.champion != null ? 'complete' : S.phase === 'playin' ? 'Play-In Tournament' : League.roundName(S, P.round);
      const me = userPostStatus(S, P, base);
      const showPI = confFmt(S) && L.playIn && (!P || !!P.playIn);
      const lens = U.uniq(L.series).length === 1 ? `every round is best of ${L.series[0]}` : `series are best of ${L.series.join(', ')}`;
      const piSec = showPI ? `<div class="ls-sec">Play-In Tournament <span class="sub">${P ? 'Seeds 7 and 8 in each conference are decided here.' : 'Projected: seeds 7-10 as of today.'}</span></div>
        ${playInHtml(S, P, rows, base)}` : '';
      const brSec = `<div class="ls-sec">${P ? 'Bracket' : 'Projected bracket'} <span class="sub">${P ? 'Click a series for game-by-game results.' : 'Seeds as of today.'} ${U.esc(lens.charAt(0).toUpperCase() + lens.slice(1))}.</span></div>
        <div class="card"><div class="card-b" style="padding-top:16px">${bracketHtml(S, cols, seeds, !P)}</div></div>`;
      root.innerHTML = `<div class="page">
        <div class="page-h"><div><h1>${P ? 'Playoffs' : 'Playoff Picture'}</h1><div class="sub">${U.seasonLabel(S.season)} postseason · ${stage}</div></div>
          <div class="actions">${me ? `<span class="tag ${me[1]} ls-status">${U.esc(me[0])}</span>` : ''}<button class="btn ghost" data-nav="standings">Standings ›</button></div></div>
        ${P && P.champion != null ? championHero(S, P) : ''}
        ${S.phase === 'playin' ? piSec + brSec : brSec + piSec}
      </div>`;
      UI.on(root, 'click', '[data-series]', (e, el) => {
        if (e.target.closest('a')) return;
        seriesModal(S, P && P.series.find(s => s.id === el.dataset.series));
      });
    },
  });

  // ---------------------------------------------------------------------------
  // Stats & leaders
  // ---------------------------------------------------------------------------
  const sts = { tab: 'leaders', season: null, bound: null, po: false, tid: 'all', pos: 'all', min: 0, all: false, pSort: null, tSort: null };
  const LEAD_CATS = [
    ['ppg', 'Points', 'PPG'], ['rpg', 'Rebounds', 'RPG'], ['apg', 'Assists', 'APG'], ['spg', 'Steals', 'SPG'],
    ['bpg', 'Blocks', 'BPG'], ['tpm', '3-Pointers Made', '3PM'], ['fgp', 'Field Goal %', 'FG%'], ['tpp', '3-Point %', '3P%'],
    ['ftp', 'Free Throw %', 'FT%'], ['gmsc', 'Game Score', 'GmSc'], ['mpg', 'Minutes', 'MPG'], ['dd', 'Double-Doubles', 'Total'],
  ].map(([k, label, unit]) => {
    const core = Stats.LEADER_CATS.find(c => c.k === k);
    return core ? Object.assign({}, core, { label, unit }) : { k, label, unit, f: s => s[k], total: true };
  });
  const ldrVal = (c, v) => (c.pct ? (v * 100).toFixed(1) + '%' : c.total ? String(Math.round(v)) : v.toFixed(c.d || 1));

  const statSeasons = S => U.uniq([S.season].concat(S.history.map(h => h.season))).sort((a, b) => b - a);
  const hasStats = (S, season, po) => Object.values(S.players).some(p => p.stats.some(s => s.season === season && !!s.po === !!po && s.gp));
  /** Before the first game of a new season, show last season's numbers. */
  const defaultSeason = S => (hasStats(S, S.season, false) || !S.history.length ? S.season : S.history[S.history.length - 1].season);

  function seasonTeamGp(S, season) {
    if (season === S.season) return Math.max(1, U.avg(Object.values(S.teamSeason || {}), t => t.gp || 0));
    const h = S.history.find(x => x.season === season);
    return h && h.standings && h.standings.length ? Math.max(1, U.avg(h.standings, r => r.w + r.l)) : S.seasonGames;
  }

  /** League leaders for any season. The current regular season uses the core list (it also decides the stat titles). */
  function leaders(S, c, n, season, po) {
    if (!c.total && season === S.season && !po) return Stats.leaders(S, c.k, n, false);
    const lines0 = [];
    for (const p of Object.values(S.players)) {
      if (p.tid === -2) continue;
      const s = Stats.season(p, season, po);
      if (s && s.gp) lines0.push({ p, s });
    }
    const teamGp = seasonTeamGp(S, season);
    const maxGp = lines0.reduce((m, x) => Math.max(m, x.s.gp), 0);
    const minGp = c.total ? 1 : po ? Math.min(3, maxGp) : teamGp * 0.5;
    return lines0.filter(x => x.s.gp >= minGp && (!c.qual || c.qual(x.s, po ? x.s.gp : teamGp * 0.6)))
      .map(x => Object.assign(x, { val: c.f(x.s) })).filter(x => !c.total || x.val > 0)
      .sort((a, b) => b.val - a.val).slice(0, n);
  }

  function leaderCard(S, c, list) {
    const head = `<div class="card-h"><h3>${c.label}</h3><div class="actions"><span class="tag">${c.unit}</span></div></div>`;
    const top = list[0];
    if (!top) return `<div class="card ls-ldr">${head}<div class="empty small">No qualified players yet.</div></div>`;
    const tt = S.teams[top.s.tid];
    return `<div class="card ls-ldr">${head}
      <div class="ls-ldr-top" ${tt ? `style="--tc:${tt.colors.primary}"` : ''}>${UI.avatar(top.p, 56)}
        <div style="min-width:0"><div class="bold ellip">${UI.playerLink(top.p)}</div><div class="tiny muted ls-tm">${tt ? `${UI.teamBadge(tt, 16)} ${tt.abbr} · ` : ''}${top.p.pos} · ${U.plural(top.s.gp, 'game')}</div></div>
        <div class="v">${ldrVal(c, top.val)}</div></div>
      <div class="list">${list.slice(1).map((x, i) => `<div class="li"><span class="ls-rk">${i + 2}</span>${UI.avatar(x.p, 26)}
        <div class="ellip" style="flex:1;min-width:0">${UI.playerLink(x.p)} <span class="tiny dim">${abbr(S, x.s.tid)}</span></div><span class="ls-val">${ldrVal(c, x.val)}</span></div>`).join('')}</div></div>`;
  }

  function playerRows(S, season, po) {
    const out = [];
    for (const p of Object.values(S.players)) {
      if (p.tid === -2 || (sts.pos !== 'all' && p.pos !== sts.pos)) continue;
      const s = sts.tid === 'all' ? Stats.season(p, season, po) : p.stats.find(x => x.season === season && x.tid === +sts.tid && !!x.po === !!po);
      if (!s || !s.gp || s.gp < sts.min) continue;
      out.push({ p, s, tid: sts.tid === 'all' ? s.tid : +sts.tid });
    }
    return out;
  }

  function playerColumns(S) {
    const line = UI.statLineCols().map(c => Object.assign({}, c, { value: r => (c.value ? c.value(r.s) : r.s[c.key]), fmt: r => (c.fmt ? c.fmt(r.s) : r.s[c.key]) }));
    return [
      { key: 'name', label: 'Player', value: r => r.p.last, fmt: r => `<span class="row nowrap">${UI.avatar(r.p, 26)}<span>${UI.playerLink(r.p)}${r.p.tid === -3 ? ' <span class="tag">Retired</span>' : ''}</span></span>` },
      { key: 'team', label: 'Team', value: r => abbr(S, r.tid), fmt: r => (S.teams[r.tid] ? `<span class="ls-tm">${UI.teamBadge(S.teams[r.tid], 18)}${S.teams[r.tid].abbr}${r.s.multi ? ` <span class="tag" title="Played for ${r.s.multi} teams">${r.s.multi}TM</span>` : ''}</span>` : '-') },
      { key: 'pos', label: 'Pos', value: r => C.POS_NUM[r.p.pos], fmt: r => UI.pos(r.p.pos) },
      { key: 'age', label: 'Age', num: true, value: r => r.p.age, fmt: r => r.p.age },
    ].concat(line, [
      { key: 'tpm', label: '3PM', num: true, title: 'Three-pointers made per game', value: r => perG(r.s, 'tpm'), fmt: r => U.num(perG(r.s, 'tpm')) },
      { key: 'ts', label: 'TS%', num: true, title: 'True shooting percentage', value: r => Stats.ts(r.s), fmt: r => (r.s.fga + r.s.fta ? pct3(Stats.ts(r.s)) : '-') },
      { key: 'pm', label: '+/-', num: true, title: 'Plus/minus per game', value: r => perG(r.s, 'pm'), fmt: r => `<span class="${tone(perG(r.s, 'pm'))}">${signed(perG(r.s, 'pm'))}</span>` },
      { key: 'gmsc', label: 'GmSc', num: true, title: 'Game Score per game', value: r => Stats.gmsc(r.s) / r.s.gp, fmt: r => U.num(Stats.gmsc(r.s) / r.s.gp) },
    ]);
  }

  /** Team totals for a season: player lines summed per team, with records and opponent points where they exist. */
  function teamStatRows(S, season, po) {
    const tot = {};
    for (const p of Object.values(S.players)) {
      for (const s of p.stats) {
        if (s.season !== season || !!s.po !== !!po || !S.teams[s.tid]) continue;
        const T = tot[s.tid] || (tot[s.tid] = Object.assign({}, Stats.emptyLine()));
        for (const k of Stats.FIELDS) if (k !== 'gp') T[k] += s[k];
        T.gp = Math.max(T.gp, s.gp);
      }
    }
    const P = S.playoffs, hist = S.history.find(h => h.season === season), cur = season === S.season;
    const out = [];
    for (const t of S.teams) {
      const T = tot[t.id];
      if (!T) continue;
      const r = Object.assign({ t, w: null, l: null, opp: null, poss: null }, T, { reb: T.orb + T.drb });
      const ts = S.teamSeason && S.teamSeason[t.id];
      if (cur && !po && ts && ts.gp) Object.assign(r, { gp: ts.gp, w: ts.w, l: ts.l, pts: ts.pts, opp: ts.opp, poss: ts.poss || null });
      else if (cur && po && P) {
        const gs = (P.games || []).filter(g => g.played && (g.h === t.id || g.a === t.id));
        if (gs.length) {
          const mine = g => (g.h === t.id ? g.hs : g.as), theirs = g => (g.h === t.id ? g.as : g.hs);
          Object.assign(r, { gp: gs.length, w: gs.filter(g => mine(g) > theirs(g)).length, pts: U.sum(gs, mine), opp: U.sum(gs, theirs) });
          r.l = r.gp - r.w;
        }
      } else if (!po && hist) {
        const x = (hist.standings || []).find(y => y.tid === t.id);
        if (x) Object.assign(r, { w: x.w, l: x.l, gp: x.w + x.l });
      }
      out.push(r);
    }
    return out;
  }

  function teamColumns(rows) {
    const g = r => Math.max(1, r.gp);
    const pg = (key, label, title) => ({ key, label, num: true, title, value: r => r[key] / g(r), fmt: r => U.num(r[key] / g(r)) });
    const cols = [
      { key: 'team', label: 'Team', value: r => r.t.name, fmt: r => teamCell(r.t, 20) },
      { key: 'gp', label: 'GP', num: true, value: r => r.gp, fmt: r => r.gp },
      { key: 'wl', label: 'W-L', num: true, value: r => (r.w == null ? -1 : r.w / Math.max(1, r.w + r.l)), fmt: r => (r.w == null ? '-' : `${r.w}-${r.l}`), need: 'w' },
      pg('pts', 'PTS', 'Points per game'),
      Object.assign(pg('opp', 'OPP', 'Opponent points per game'), { need: 'opp' }),
      { key: 'diff', label: 'DIFF', num: true, title: 'Point differential per game', need: 'opp', value: r => (r.pts - r.opp) / g(r), fmt: r => `<span class="${tone((r.pts - r.opp) / g(r))}">${signed((r.pts - r.opp) / g(r))}</span>` },
      { key: 'fgp', label: 'FG%', num: true, value: r => (r.fga ? r.fgm / r.fga : 0), fmt: r => U.pct3(r.fgm, r.fga) },
      pg('tpm', '3PM', 'Three-pointers made per game'),
      { key: 'tpp', label: '3P%', num: true, value: r => (r.tpa ? r.tpm / r.tpa : 0), fmt: r => U.pct3(r.tpm, r.tpa) },
      { key: 'ftp', label: 'FT%', num: true, value: r => (r.fta ? r.ftm / r.fta : 0), fmt: r => U.pct3(r.ftm, r.fta) },
      pg('reb', 'REB'), pg('ast', 'AST'), pg('stl', 'STL'), pg('blk', 'BLK'), pg('tov', 'TOV'),
      { key: 'pace', label: 'PACE', num: true, title: 'Possessions per game', need: 'poss', value: r => r.poss / g(r), fmt: r => U.num(r.poss / g(r)) },
      { key: 'ortg', label: 'ORTG', num: true, title: 'Points per 100 possessions', need: 'poss', value: r => (r.pts / r.poss) * 100, fmt: r => U.num((r.pts / r.poss) * 100) },
      { key: 'drtg', label: 'DRTG', num: true, title: 'Points allowed per 100 possessions', need: 'poss', value: r => (r.opp / r.poss) * 100, fmt: r => U.num((r.opp / r.poss) * 100) },
    ];
    return cols.filter(c => !c.need || rows.every(r => r[c.need] != null));
  }

  UI.register('stats', {
    title: 'Stats & Leaders',
    render(root, params) {
      const S = UI.S;
      forCareer(sts, S, { tid: 'all', season: null, bound: null });
      if (params && params.tab) { sts.tab = params.tab; params.tab = null; }
      if (sts.bound !== S.season) { sts.season = null; sts.bound = S.season; }
      const T = [['leaders', 'Leaders'], ['players', 'Players'], ['teams', 'Teams']];
      const tab = T.some(x => x[0] === sts.tab) ? sts.tab : 'leaders';
      const seasons = statSeasons(S);
      const season = sts.season != null && seasons.includes(sts.season) ? sts.season : defaultSeason(S);
      const po = sts.po;
      const mins = po ? [0, 2, 4, 8, 12] : U.uniq([0, 5, 10, 20, Math.round(S.seasonGames / 2)]).filter(v => v <= S.seasonGames).sort((a, b) => a - b);
      if (!mins.includes(sts.min)) sts.min = 0;
      if (sts.tid !== 'all' && !S.teams[+sts.tid]) sts.tid = 'all';
      const bar = `<div class="ls-bar">
        ${field('Season', `<select class="inp" data-f="season">${seasons.map(y => `<option value="${y}" ${y === season ? 'selected' : ''}>${U.seasonLabel(y)}</option>`).join('')}</select>`)}
        ${field('Games', seg([['0', 'Regular season'], ['1', 'Playoffs']], po ? '1' : '0', 'po'))}
        ${tab === 'players' ? field('Team', `<select class="inp" data-f="tid">${teamOptions(S, sts.tid, 'All teams')}</select>`)
          + field('Position', seg([['all', 'All']].concat(C.POSITIONS.map(p => [p, p])), sts.pos, 'pos'))
          + field('Min. games', `<select class="inp" data-f="min">${mins.map(v => `<option value="${v}" ${v === sts.min ? 'selected' : ''}>${v ? v + '+' : 'Any'}</option>`).join('')}</select>`) : ''}
      </div>`;
      const noGames = po ? `No playoff games in ${U.seasonLabel(season)}${season === S.season && !S.playoffs ? ' yet' : ''}.` : `No games played in ${U.seasonLabel(season)} yet. Stats appear after the opening tip.`;
      const any = hasStats(S, season, po);
      let body = '';
      if (!any) body = emptyCard(noGames, '📈');
      else if (tab === 'leaders') body = `<div class="grid g3">${LEAD_CATS.map(c => leaderCard(S, c, leaders(S, c, 5, season, po))).join('')}</div>
        <p class="hint">${po ? 'Playoff leaders need 3 games; shooting leaders need 3 made field goals, 1 three or 1.5 free throws per game.' : 'Leaders must play half of their team\'s games. Shooting leaders also need a minimum number of makes.'}</p>`;
      else if (tab === 'players') body = '<div class="card"><div class="card-h"><h3 id="ls-pcount">Players</h3></div><div class="card-b flush" id="ls-ptbl"></div><div id="ls-pmore"></div></div><p class="hint">Click a column to sort, click a player for his card.</p>';
      else body = `<div class="card"><div class="card-h"><h3>Team stats</h3><div class="actions"><span class="small muted">Per game</span></div></div><div class="card-b flush" id="ls-ttbl"></div></div>
        <p class="hint">Click a column to sort, click a team for its page.${season === S.season && !po ? '' : ' Opponent numbers and ratings are tracked for the current regular season only.'}</p>`;
      root.innerHTML = `<div class="page">
        <div class="page-h"><div><h1>Stats & Leaders</h1><div class="sub">${U.seasonLabel(season)} ${po ? 'playoffs' : 'regular season'} · ${cfg(S).label}</div></div>
          <div class="actions">${tabs(T, tab, 'tab')}</div></div>
        ${bar}${body}</div>`;

      if (any && tab === 'players') {
        const rows = playerRows(S, season, po);
        const limit = sts.all ? 0 : 50;
        const tb = UI.table(root.querySelector('#ls-ptbl'), {
          rows, columns: playerColumns(S), compact: true, limit,
          sort: sts.pSort ? sts.pSort.sort : 'pts', desc: sts.pSort ? sts.pSort.desc : true,
          rowClass: r => (r.tid === S.userTid ? 'me' : ''), onRow: r => UI.openPlayer(r.p.id), empty: 'No players match these filters.',
        });
        sts.pSort = tb.state;
        root.querySelector('#ls-pcount').textContent = `${rows.length} player${rows.length === 1 ? '' : 's'}${limit && rows.length > limit ? ` · top ${limit} shown` : ''}`;
        if (rows.length > 50) root.querySelector('#ls-pmore').innerHTML = `<div class="ls-more"><button class="btn sm" data-act="all">${sts.all ? 'Show the top 50' : `Show all ${rows.length} players`}</button></div>`;
      }
      if (any && tab === 'teams') {
        const rows = teamStatRows(S, season, po);
        const tb = UI.table(root.querySelector('#ls-ttbl'), {
          rows, columns: teamColumns(rows), compact: true,
          sort: sts.tSort ? sts.tSort.sort : 'pts', desc: sts.tSort ? sts.tSort.desc : true,
          rowClass: r => (r.t.id === S.userTid ? 'me' : ''), onRow: r => UI.openTeam(r.t.id),
        });
        sts.tSort = tb.state;
      }
      UI.on(root, 'click', '[data-tab]', (e, el) => { sts.tab = el.dataset.tab; UI.refresh(); });
      UI.on(root, 'click', '[data-po]', (e, el) => { sts.po = el.dataset.po === '1'; UI.refresh(); });
      UI.on(root, 'click', '[data-pos]', (e, el) => { sts.pos = el.dataset.pos; UI.refresh(); });
      UI.on(root, 'click', '[data-act="all"]', () => { sts.all = !sts.all; UI.refresh(); });
      UI.on(root, 'change', '[data-f]', (e, el) => {
        const k = el.dataset.f;
        if (k === 'season') sts.season = +el.value === defaultSeason(S) ? null : +el.value;
        if (k === 'tid') sts.tid = el.value;
        if (k === 'min') sts.min = +el.value;
        UI.refresh();
      });
    },
  });

  // ---------------------------------------------------------------------------
  // Teams
  // ---------------------------------------------------------------------------
  const tms = { sort: 'power', conf: 'all' };

  function teamCard(S, x, seedOf, played) {
    const L = cfg(S), t = x.t, r = x.r, G = S.seasonGames;
    const me = t.id === S.userTid;
    const proj = S.preseasonProj && S.preseasonProj[t.id] != null ? Math.round(S.preseasonProj[t.id] * G) : null;
    const where = played ? `${U.ordinal(seedOf[t.id])} ${confFmt(S) ? L.confs[t.conf] : 'in league'}` : proj != null ? `Proj. ${proj}-${G - proj}` : (confFmt(S) ? L.confs[t.conf] : '');
    const over = x.pay > L.tax;
    return `<div class="team-card ls-team ${me ? 'on' : ''}" data-open-team="${t.id}" style="--tc:${t.colors.primary};--tc2:${t.colors.secondary}" title="Open the ${U.esc(t.name)} team page">
      <div class="row nowrap">${UI.teamBadge(t, 44)}<div style="min-width:0"><div class="tc-city">${U.esc(t.city)}</div><div class="tc-name ellip ${t.name.length > 10 ? 'ls-long' : ''}">${U.esc(t.name)}</div></div>
        <div class="spacer"></div><div class="center"><div class="tc-ovr">#${x.pr.rank}</div><div class="tiny dim">POWER</div></div></div>
      <div class="row nowrap small ls-tc-rec">${me ? '<span class="tag accent">You</span>' : ''}<b>${r.w}-${r.l}</b><span class="muted ellip">${where}</span><div class="spacer"></div>
        ${played ? `${streakHtml(r.streak)}<span class="dim">L10 ${r.l10[0]}-${r.l10[1]}</span>` : ''}</div>
      <div class="ls-mini">
        <div><div class="v">${Math.round(x.str)}</div><div class="l">Rating</div></div>
        <div title="${over ? 'Over the luxury tax' : 'Payroll'}"><div class="v ${over ? 'warn-t' : ''}">${moneyShort(x.pay)}</div><div class="l">Payroll</div></div>
        <div><div class="v ${tone(r.diff)}">${r.gp ? signed(r.diff) : '-'}</div><div class="l">Pt diff</div></div></div>
      ${x.star ? `<div class="row nowrap ls-tc-star">${UI.avatar(x.star, 30)}<div class="small ellip" style="flex:1;min-width:0">${shortLink(x.star)} <span class="dim">${x.star.pos}</span></div>${UI.ovr(x.star.ovr)}</div>` : ''}
    </div>`;
  }

  UI.register('teams', {
    title: 'Teams',
    render(root) {
      const S = UI.S, L = cfg(S);
      const st = League.standings(S);
      const played = st.some(r => r.gp);
      const pr = {};
      League.powerRankings(S).forEach(x => { pr[x.tid] = x; });
      const seedOf = {};
      (confFmt(S) ? [0, 1] : [null]).forEach(c => group(S, c, st).forEach(r => { seedOf[r.tid] = r.seed; }));
      const all = S.teams.map(t => ({ t, r: st[t.id], pr: pr[t.id], str: League.teamStrength(S, t.id), pay: payroll(S, t.id), star: League.roster(S, t.id)[0] }));
      const proj = S.preseasonProj || {};
      const key = {
        power: x => x.pr.rank, rating: x => -x.str, payroll: x => -x.pay, name: x => x.t.city + ' ' + x.t.name,
        record: x => (played ? -(x.r.pct * 1000 + x.r.diff) : -(proj[x.t.id] || 0)),
      }[tms.sort] || (x => x.pr.rank);
      const list = all.filter(x => tms.conf === 'all' || String(x.t.conf) === tms.conf)
        .sort((a, b) => { const ka = key(a), kb = key(b); return typeof ka === 'string' ? ka.localeCompare(kb) : ka - kb; });
      const best = (f, fmt, label) => { const x = U.maxBy(all, f); return x ? `<div class="stat ls-glance"><div class="v">${UI.teamBadge(x.t, 24)}${x.t.abbr} <span>${fmt(x)}</span></div><div class="l">${label}</div></div>` : ''; };
      const glance = `<div class="stats-row" style="margin-bottom:16px">
        ${played ? best(x => x.r.pct * 1000 + x.r.diff, x => `${x.r.w}-${x.r.l}`, 'Best record') + best(x => (x.r.gp ? x.r.pf / x.r.gp : 0), x => U.num(x.r.pf / x.r.gp), 'Top offense · PPG')
          + best(x => (x.r.gp ? -x.r.pa / x.r.gp : -999), x => U.num(x.r.pa / x.r.gp), 'Top defense · OPP PPG') : ''}
        ${best(x => x.str, x => Math.round(x.str), 'Best roster · rating')}${best(x => x.pay, x => moneyShort(x.pay), 'Highest payroll')}</div>`;
      root.innerHTML = `<div class="page">
        <div class="page-h"><div><h1>Teams</h1><div class="sub">${S.teams.length} teams · ${L.label} · power rankings blend record, point differential and healthy roster strength</div></div>
          <div class="actions">${seg([['power', 'Power rank'], ['record', 'Record'], ['rating', 'Rating'], ['payroll', 'Payroll'], ['name', 'A-Z']], tms.sort, 'sort')}
            ${seg([['all', 'All']].concat(L.confs.map((c, i) => [String(i), c])), tms.conf, 'conf')}</div></div>
        ${glance}
        <div class="team-grid">${list.map(x => teamCard(S, x, seedOf, played)).join('')}</div>
        <p class="hint" style="margin-top:12px">Click a team for its roster, history and franchise records. Payroll in orange is over the luxury tax (${U.money(L.tax, true)}).</p>
      </div>`;
      UI.on(root, 'click', '[data-sort]', (e, el) => { tms.sort = el.dataset.sort; UI.refresh(); });
      UI.on(root, 'click', '[data-conf]', (e, el) => { tms.conf = el.dataset.conf; UI.refresh(); });
    },
  });

  // ---------------------------------------------------------------------------
  // Records & history
  // ---------------------------------------------------------------------------
  const rcs = { tab: 'champions', scope: 'league', n: 5 };
  const AWARDS = [['mvp', 'MVP'], ['dpoy', 'DPOY'], ['roy', 'ROY'], ['smoy', '6MOY'], ['mip', 'MIP'], ['coy', 'COY'], ['fmvp', 'Finals MVP']];
  const AWARD_NAME = { mvp: 'Most Valuable Player', dpoy: 'Defensive Player of the Year', roy: 'Rookie of the Year', smoy: 'Sixth Player of the Year', mip: 'Most Improved Player', coy: 'Coach of the Year', fmvp: 'Finals MVP' };
  // honors for the all-time list: [award type, label, legacy weight, tag class]
  const HONORS = [['mvp', 'MVP', 12, 'gold'], ['fmvp', 'Finals MVP', 7, 'gold'], ['champion', 'Champion', 4, 'gold'], ['dpoy', 'DPOY', 5, 'accent'],
    ['allLeague', 'All-League', 0, 'accent'], ['allDefense', 'All-Defense', 1.5, 'info'], ['allStar', 'All-Star', 2, 'info'], ['roy', 'ROY', 2, ''], ['smoy', '6MOY', 1.5, ''], ['mip', 'MIP', 1, '']];

  /** The team a player suited up for in a season (his last team that year). */
  function teamIn(p, season) {
    const rows = p.stats.filter(s => s.season === season);
    return rows.length ? rows[rows.length - 1].tid : p.tid;
  }

  function coachName(S, season, tid) {
    const c = S.coach;
    if (c && c.seasons && c.seasons.some(x => x.season === season && x.tid === tid)) return c.name;
    const t = S.teams[tid];
    return PBC.Magazine && PBC.Magazine.aiCoachName ? PBC.Magazine.aiCoachName(S, t) : (t.coachName || 'Head coach');
  }

  const recRow = (i, main, sub, val) => `<div class="li ls-rec ${i === 0 ? 'top' : ''}"><span class="ls-rk">${i + 1}</span>
    <div style="flex:1;min-width:0"><div class="ellip">${main}</div><div class="tiny dim ellip">${sub}</div></div><span class="ls-val">${val}</span></div>`;
  const recCard = (title, rows, note) => `<div class="card"><div class="card-h"><h3>${title}</h3>${note ? `<div class="actions"><span class="small muted">${note}</span></div>` : ''}</div>
    <div class="card-b flush"><div class="list">${rows.length ? rows.join('') : '<div class="empty small">No record yet.</div>'}</div></div></div>`;
  const pLink = (S, pid, name) => (S.players[pid] ? UI.playerLink(S.players[pid], name) : U.esc(name || ''));
  const boxLink = (S, gid) => (S.boxes && S.boxes[gid] ? ` · <a class="link" data-open-box="${gid}">Box score</a>` : '');

  function championsHtml(S) {
    const H = S.history.slice().reverse();
    if (!H.length) return emptyCard(`No champions yet. The first banner goes up after the ${U.seasonLabel(S.season)} Finals.`, '🏆');
    const h0 = H[0], ch = S.teams[h0.champion];
    const titles = tid => S.history.filter(h => h.champion === tid).length;
    const recOf = (h, tid) => { const r = (h.standings || []).find(x => x.tid === tid); return r ? `${r.w}-${r.l}` : ''; };
    const fm0 = h0.fmvp != null ? S.players[h0.fmvp] : null;
    const hero = ch ? `<div class="hero ls-champ" style="--team:${ch.colors.primary};--team2:${ch.colors.secondary};margin-bottom:16px"><div class="hero-in">
      <div class="row nowrap ls-champ-main"><span class="ls-trophy">🏆</span>${UI.teamBadge(ch, 84)}<div style="min-width:0">
        <div class="tiny up dim" style="letter-spacing:2px">${h0.season >= S.season - 1 ? 'Reigning champions' : 'Latest champions'} · ${U.seasonLabel(h0.season)}</div>
        <div class="up ls-champ-nm">${U.esc(ch.city)} ${U.esc(ch.name)}</div>
        <div class="muted">${U.ordinal(titles(ch.id))} title${h0.runnerUp != null && S.teams[h0.runnerUp] ? ` · beat the ${U.esc(S.teams[h0.runnerUp].name)}${h0.finals ? ' ' + h0.finals.wins.join('-') : ''} in the Finals` : ''}</div></div></div>
      ${fm0 ? `<div class="recap-award">${UI.avatar(fm0, 54)}<div style="min-width:0"><div class="al">Finals MVP</div><div class="bold">${UI.playerLink(fm0)}</div></div></div>` : ''}</div></div>` : '';
    const rows = H.map(h => {
      const c = S.teams[h.champion], ru = S.teams[h.runnerUp], fm = h.fmvp != null ? S.players[h.fmvp] : null;
      const ut = S.teams[h.userTid], uh = ut ? ut.history.find(x => x.season === h.season) : null;
      return `<tr class="${h.champion === h.userTid ? 'me' : ''}"><td class="bold nowrap">${U.seasonLabel(h.season)}</td>
        <td>${c ? `${teamCell(c, 22)} <span class="tiny dim">${recOf(h, c.id)}</span>` : '-'}</td>
        <td class="nowrap">${h.finals ? `<b>${h.finals.wins.join('-')}</b> ` : ''}${ru ? `<span class="muted">over</span> ${UI.teamBadge(ru, 18)} ${UI.teamLink(ru, ru.abbr)}` : '-'}</td>
        <td class="nowrap">${fm ? `<span class="ls-tm">${UI.avatar(fm, 24)}${shortLink(fm)}</span>` : '-'}</td>
        <td class="nowrap ls-hide-sm">${ut && uh ? `<span class="ls-tm">${UI.teamBadge(ut, 18)}${ut.abbr} ${uh.w}-${uh.l}</span><div class="tiny muted">${uh.champ ? '🏆 ' : ''}${U.esc(uh.result)}</div>` : '-'}</td></tr>`;
    }).join('');
    const franchises = S.teams.map(t => ({ t, titles: titles(t.id), finals: S.history.filter(h => h.champion === t.id || h.runnerUp === t.id).length }))
      .filter(x => x.finals).sort((a, b) => b.titles - a.titles || b.finals - a.finals);
    return `${hero}<div class="grid g-main">
      <div class="card"><div class="card-h"><h3>Champions by season</h3></div><div class="card-b flush"><div class="tbl-wrap"><table class="tbl compact">
        <thead><tr><th>Season</th><th>Champion</th><th>Finals</th><th>Finals MVP</th><th class="ls-hide-sm">Your team</th></tr></thead><tbody>${rows}</tbody></table></div></div></div>
      <div class="card"><div class="card-h"><h3>Titles by franchise</h3></div><div class="card-b flush"><div class="list">${franchises.map(x => `
        <div class="li">${UI.teamBadge(x.t, 30)}<div style="flex:1;min-width:0">${UI.teamLink(x.t)}<div class="tiny dim">${U.plural(x.finals, 'Finals trip')}</div></div>
          <span class="ls-val ${x.titles ? 'gold-t' : 'dim'}">${x.titles ? '🏆 ' + x.titles : '0'}</span></div>`).join('')}</div></div></div>
    </div>`;
  }

  function awardsHtml(S) {
    const H = S.history.slice().reverse();
    if (!H.length) return emptyCard(`Awards are handed out when the ${U.seasonLabel(S.season)} season ends.`, '🏅');
    const who = (pid, season, tid) => {
      const p = pid != null ? S.players[pid] : null;
      if (!p) return '<span class="dim">-</span>';
      return `<span class="ls-tm">${UI.avatar(p, 24)}<span>${shortLink(p)} <span class="tiny dim">${abbr(S, tid != null ? tid : teamIn(p, season))}</span></span></span>`;
    };
    const rows = H.map(h => {
      const aw = h.awards || {};
      const cells = AWARDS.map(([k]) => {
        if (k === 'coy') {
          const t = S.teams[aw.coyTid];
          return t ? `<span class="ls-tm">${UI.teamBadge(t, 22)}<span>${U.esc(coachName(S, h.season, t.id))} <span class="tiny dim">${t.abbr}</span></span></span>` : '-';
        }
        return k === 'fmvp' ? who(h.fmvp, h.season, h.champion) : who(aw[k], h.season);
      });
      return `<tr><td class="bold nowrap">${U.seasonLabel(h.season)}</td>${cells.map(c => `<td class="nowrap">${c}</td>`).join('')}</tr>`;
    }).join('');
    const h = H[0], aw = h.awards || {};
    const team = (label, five) => `<div class="li"><span class="small bold nowrap" style="min-width:92px">${label}</span><div class="small" style="flex:1">${(five || []).map(pid => S.players[pid] ? shortLink(S.players[pid]) : '').filter(Boolean).join(' · ') || '-'}</div></div>`;
    return `<div class="card" style="margin-bottom:16px"><div class="card-h"><h3>Award winners</h3></div><div class="card-b flush"><div class="tbl-wrap"><table class="tbl compact ls-aw">
        <thead><tr><th>Season</th>${AWARDS.map(([k, l]) => `<th title="${AWARD_NAME[k]}">${l}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div></div></div>
      <div class="card"><div class="card-h"><h3>${U.seasonLabel(h.season)} All-League teams</h3></div><div class="card-b flush"><div class="list">
        ${(aw.allLeague || []).map((five, i) => team(`${U.ordinal(i + 1)} Team`, five)).join('')}
        ${(aw.allDefense || []).map((five, i) => team(`All-Defense ${i + 1}`, five)).join('')}
        ${team('All-Rookie', aw.allRookie)}</div></div></div>`;
  }

  function recordsHtml(S, tid, n) {
    const R = S.records || { game: {}, teamGame: { pts: [], margin: [] }, franchise: {} };
    const fr = tid != null ? (R.franchise && R.franchise[tid]) || { game: {}, teamGame: { pts: [] } } : null;
    const game = fr ? fr.game : R.game;
    const single = Stats.GAME_CATS.map(([k, label]) => recCard(label, (game[k] || []).slice(0, n).map((e, i) =>
      recRow(i, `${pLink(S, e.pid, e.name)} <span class="tiny dim">${abbr(S, e.tid)}</span>`, `vs ${abbr(S, e.opp)} · ${U.seasonLabel(e.season)}${e.po ? ' · Playoffs' : ''}${boxLink(S, e.gid)}`, e.val))));
    const teamRow = (e, i, margin) => {
      const t = S.teams[e.tid];
      return recRow(i, t ? `${UI.teamBadge(t, 18)} ${UI.teamLink(t, t.city + ' ' + t.name)}` : '', `${margin && e.score ? e.score + ' ' : ''}vs ${abbr(S, e.opp)} · ${U.seasonLabel(e.season)}${boxLink(S, e.gid)}`, margin ? '+' + e.val : e.val);
    };
    const teamCards = [recCard(tid != null ? 'Most points in a game' : 'Most points by a team', ((fr ? fr.teamGame.pts : R.teamGame.pts) || []).slice(0, n).map((e, i) => teamRow(e, i)))];
    if (!fr) teamCards.push(recCard('Biggest win', (R.teamGame.margin || []).slice(0, n).map((e, i) => teamRow(e, i, true))));
    const SR = Stats.seasonRecords(S, tid);
    const season = Object.keys(SR).map(k => recCard(SR[k].label, SR[k].list.slice(0, n).map((e, i) =>
      recRow(i, pLink(S, e.pid, e.name), `${abbr(S, e.tid)} · ${U.seasonLabel(e.season)}`, k === 'pts' || k === 'tpm' ? Math.round(e.val) : e.val.toFixed(1)))));
    const minGp = Math.max(5, Math.round(S.seasonGames * 0.7));
    return `<div class="ls-sec">Single-game records <span class="sub">Regular season and playoffs</span></div><div class="grid g3">${single.join('')}</div>
      <div class="ls-sec">Team games</div><div class="grid g2">${teamCards.join('')}</div>
      <div class="ls-sec">Single-season records <span class="sub">Minimum ${minGp} games · completed regular seasons</span></div><div class="grid g4">${season.join('')}</div>`;
  }

  /** Legacy score for the all-time list: honors first, then career production. Optionally only what was done for one team. */
  function legacy(S, p, tid) {
    const mine = s => tid == null || s.tid === tid;
    const reg = p.stats.filter(s => !s.po && mine(s)), po = p.stats.filter(s => s.po && mine(s));
    if (!reg.length && !po.length) return null;
    const sum = rows => { const o = Stats.emptyLine(); for (const r of rows) for (const k of Stats.FIELDS) o[k] += r[k]; return o; };
    const c = sum(reg), cp = sum(po);
    const t = tid != null ? S.teams[tid] : null;
    const cnt = {};
    let al = 0;
    for (const a of p.awards) {
      if (!HONORS.some(h => h[0] === a.type)) continue;
      if (t && (a.type === 'champion' ? a.detail !== t.abbr : teamIn(p, a.season) !== tid)) continue;
      cnt[a.type] = (cnt[a.type] || 0) + 1;
      if (a.type === 'allLeague') al += /^1/.test(a.detail) ? 5 : /^2/.test(a.detail) ? 3 : 2;
    }
    const score = HONORS.reduce((s, h) => s + (cnt[h[0]] || 0) * h[2], 0) + al
      + c.pts / 800 + (c.orb + c.drb) / 800 + c.ast / 600 + (c.stl + c.blk) / 400 + cp.pts / 500 + c.gp / 500;
    return { p, c, cnt, score, seasons: U.uniq(reg.map(r => r.season)).length };
  }

  function greatRow(S, x, i) {
    const p = x.p, c = x.c;
    const status = p.tid >= 0 && S.teams[p.tid] ? `<span class="ls-tm">${UI.teamBadge(S.teams[p.tid], 16)}${S.teams[p.tid].abbr}</span>` : p.tid === -3 ? `Retired${p.retired ? ' ' + p.retired.season : ''}` : 'Free agent';
    const line = c.gp ? `${U.num(c.pts / c.gp)} ppg · ${U.num((c.orb + c.drb) / c.gp)} rpg · ${U.num(c.ast / c.gp)} apg` : 'Playoff games only';
    const chips = HONORS.filter(h => x.cnt[h[0]]).map(h => `<span class="tag ${h[3]}">${x.cnt[h[0]] > 1 ? x.cnt[h[0]] + '× ' : ''}${h[1]}</span>`).join('');
    return `<div class="li ls-great ${i === 0 ? 'top' : ''}"><span class="ls-rk">${i + 1}</span>${UI.avatar(p, 40)}
      <div class="ls-great-b"><div class="ellip"><span class="bold">${UI.playerLink(p)}</span> <span class="tiny dim">${p.pos}</span></div>
        <div class="tiny muted ls-tm">${status} · ${U.plural(x.seasons, 'season')} · ${c.gp} games · ${line}</div></div>
      <div class="ls-hon">${chips}</div></div>`;
  }

  function allTimeHtml(S, tid, n) {
    const list = [];
    for (const p of Object.values(S.players)) {
      if (p.tid === -2 || !p.stats.length) continue;
      const x = legacy(S, p, tid);
      if (x && x.score > 0.3) list.push(x);
    }
    list.sort((a, b) => b.score - a.score);
    const CR = Stats.careerRecords(S, tid);
    const leaders = Object.keys(CR).map(k => recCard(CR[k].label, CR[k].list.filter(e => e.val > 0).slice(0, n).map((e, i) => {
      const p = S.players[e.pid];
      const where = !p ? '' : p.tid >= 0 ? `Active · ${abbr(S, p.tid)}` : p.tid === -3 ? 'Retired' : 'Free agent';
      return recRow(i, pLink(S, e.pid, e.name), where, e.val.toLocaleString('en-US'));
    })));
    const t = tid != null ? S.teams[tid] : null;
    return `<div class="ls-sec">${t ? `${U.esc(t.name)} legends` : 'All-time greats'} <span class="sub">Ranked by MVPs, titles, All-League nods and career production${t ? ' with the franchise' : ''}.</span></div>
      ${list.length ? `<div class="card"><div class="card-b flush"><div class="list">${list.slice(0, n === 10 ? 20 : 10).map((x, i) => greatRow(S, x, i)).join('')}</div></div></div>`
        : emptyCard('Legends are made on the court. Check back once games have been played.', '🌟')}
      <div class="ls-sec">Career leaders <span class="sub">Regular season totals${t ? ' with the ' + U.esc(t.name) : ''}</span></div>
      <div class="grid g4">${leaders.join('')}</div>`;
  }

  UI.register('records', {
    title: 'Records & History',
    render(root, params) {
      const S = UI.S;
      forCareer(rcs, S, { scope: 'league' });
      if (params && params.tab) { rcs.tab = params.tab; params.tab = null; }
      const T = [['champions', 'Champions'], ['awards', 'Awards'], ['records', 'Records'], ['alltime', 'All-Time']];
      const tab = T.some(x => x[0] === rcs.tab) ? rcs.tab : 'champions';
      const tid = rcs.scope !== 'league' && S.teams[+rcs.scope] ? +rcs.scope : null;
      const scoped = tab === 'records' || tab === 'alltime';
      const n = rcs.n === 10 ? 10 : 5;
      const body = tab === 'champions' ? championsHtml(S) : tab === 'awards' ? awardsHtml(S) : tab === 'records' ? recordsHtml(S, tid, n) : allTimeHtml(S, tid, n);
      const seasons = S.history.length;
      root.innerHTML = `<div class="page">
        <div class="page-h"><div><h1>Records & History</h1><div class="sub">${cfg(S).label} · ${seasons ? `${U.plural(seasons, 'completed season')} since ${U.seasonLabel(S.history[0].season)}` : `Year one: ${U.seasonLabel(S.season)}`}</div></div>
          <div class="actions">${tabs(T, tab, 'tab')}</div></div>
        ${scoped ? `<div class="ls-bar">${field('Scope', `<select class="inp" data-f="scope">${teamOptions(S, tid == null ? 'league' : tid, 'Whole league', 'league')}</select>`)}
          ${field('Show', seg([['5', 'Top 5'], ['10', 'Top 10']], String(n), 'n'))}</div>` : ''}
        ${body}</div>`;
      UI.on(root, 'click', '[data-tab]', (e, el) => { rcs.tab = el.dataset.tab; UI.refresh(); });
      UI.on(root, 'click', '[data-n]', (e, el) => { rcs.n = +el.dataset.n; UI.refresh(); });
      UI.on(root, 'change', '[data-f="scope"]', (e, el) => { rcs.scope = el.value; UI.refresh(); });
    },
  });
})();
