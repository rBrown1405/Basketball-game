/* Pro BBALL Coach: the player card's career tabs (UI.PC): Stats (per game, totals, per 36 and advanced, every season with
 * the team splits of a trade season and the career, regular season or playoffs), Game Log (any season that was kept, the
 * season's highs and a chart of it, a box score when there is one), Awards (the trophy case, milestones and records, career
 * highs, best games and every season's honors) and Progression (OVR and potential over the years, every rating season by
 * season). The data: p.stats, p.glog, p.hi, p.best, p.awards, p.hist0 and p.hist (js/core/stats.js, js/core/player.js). */
(function () {
  'use strict';
  const PBC = window.PBC;
  const U = PBC.U, C = PBC.Config, UI = PBC.UI;

  // what the tabs were left on (kept while the game is open, for the next card too)
  const view = { sMode: 'pg', sPo: false, lSeason: null, lPo: 'all', lStat: 'pts', pAll: false, pBase: 'prev' };
  UI.PC = { view };

  const reb = s => (s.orb || 0) + (s.drb || 0);
  const pg = (s, v) => (s.gp ? v / s.gp : 0);
  const p36 = (s, v) => (s.min > 0 ? (v * 36) / s.min : 0);
  const r3 = x => (x > 0 ? x.toFixed(3).replace(/^0/, '') : '-');
  const efg = s => (s.fga ? (s.fgm + 0.5 * s.tpm) / s.fga : 0);
  const signed = (x, d) => (x > 0 ? '+' : '') + U.num(x, d == null ? 1 : d);
  const abbr = (S, tid) => (S.teams[tid] ? S.teams[tid].abbr : '');
  const teamAt = (S, tid) => S.teams[tid] || null;
  /** his age in a season: his history's, else from the year he was born */
  function ageIn(S, p, season) {
    const h = (p.hist || []).find(x => x.season === season);
    if (h && h.age) return h.age;
    if (season === S.season) return p.age;
    if (p.born) return season - p.born;
    return p.age - (S.season - season);
  }
  /** the date of a game in its own season: "Jan 12" (year: "Jan 12, 2027") */
  function dateOf(S, season, day, year) {
    const lab = PBC.League.dateLabel(S, day, false, season);
    return year ? `${lab}, ${PBC.League.dateOf(S, day, season).getUTCFullYear()}` : lab;
  }
  // (each render goes into a new box inside the tab, so its listeners go away with it)
  const fresh = el => { el.innerHTML = ''; const d = document.createElement('div'); el.appendChild(d); return d; };
  // a seg control: [key, label, disabled]
  const seg = (attr, cur, opts) => `<div class="seg">${opts.map(([k, l, off]) => `<button data-${attr}="${k}" class="${String(cur) === String(k) ? 'on' : ''}" ${off ? 'disabled' : ''}>${l}</button>`).join('')}</div>`;

  // ---------------------------------------------------------------------------
  // Awards: what each kind is
  // ---------------------------------------------------------------------------
  // i icon, l label, g where it goes (major, team, title, weekend, more, mile), o order in the case
  const AW = {
    hof: { i: '🏛️', l: 'Hall of Fame', g: 'major', o: 0 },
    champion: { i: '💍', l: 'Champion', g: 'major', o: 1 },
    mvp: { i: '🏆', l: 'MVP', g: 'major', o: 2 },
    fmvp: { i: '🏅', l: 'Finals MVP', g: 'major', o: 3 },
    dpoy: { i: '🛡️', l: 'Defensive Player of the Year', g: 'major', o: 4 },
    roy: { i: '🌱', l: 'Rookie of the Year', g: 'major', o: 5 },
    smoy: { i: '🪑', l: 'Sixth Player of the Year', g: 'major', o: 6 },
    mip: { i: '📈', l: 'Most Improved Player', g: 'major', o: 7 },
    numRetired: { i: '👕', l: 'Number retired', g: 'major', o: 8 },
    allStar: { i: '🌟', l: 'All-Star', g: 'team', o: 10 },
    allLeague: { i: '🥇', l: 'All-League', g: 'team', o: 11 },
    allDefense: { i: '🔒', l: 'All-Defensive', g: 'team', o: 12 },
    allRookie: { i: '🧢', l: 'All-Rookie Team', g: 'team', o: 13 },
    ptsTitle: { i: '🔥', l: 'Scoring title', g: 'title', o: 20 },
    rebTitle: { i: '🧲', l: 'Rebounding title', g: 'title', o: 21 },
    astTitle: { i: '🤝', l: 'Assists title', g: 'title', o: 22 },
    stlTitle: { i: '🧤', l: 'Steals title', g: 'title', o: 23 },
    blkTitle: { i: '✋', l: 'Blocks title', g: 'title', o: 24 },
    asgMvp: { i: '⭐', l: 'All-Star Game MVP', g: 'weekend', o: 30 },
    threeChamp: { i: '🎯', l: 'Three-Point Contest champion', g: 'weekend', o: 31 },
    dunkChamp: { i: '🚀', l: 'Dunk Contest champion', g: 'weekend', o: 32 },
    skillsChamp: { i: '⚡', l: 'Skills Challenge champion', g: 'weekend', o: 33 },
    potw: { i: '📅', l: 'Player of the Week', g: 'more', o: 40 },
    mvpVote: { i: '🗳️', l: 'MVP voting', g: 'more', o: 41 },
    milestone: { i: '🎉', l: 'Milestone', g: 'mile', o: 50 },
    allTime: { i: '👑', l: 'All-time leader', g: 'mile', o: 51 },
    record: { i: '📜', l: 'League record', g: 'mile', o: 52 },
  };
  UI.AWARD_KIND = AW;
  // the old one-line labels (other screens use them)
  for (const k in AW) if (UI.AWARD_LABEL && !UI.AWARD_LABEL[k]) UI.AWARD_LABEL[k] = (AW[k].g === 'major' || AW[k].g === 'weekend' ? AW[k].i + ' ' : '') + AW[k].l;
  const TITLE_OF = { pts: 'ptsTitle', reb: 'rebTitle', ast: 'astTitle', stl: 'stlTitle', blk: 'blkTitle' };

  // ---------------------------------------------------------------------------
  // Stats
  // ---------------------------------------------------------------------------
  // a column: l label, v value (for the leader marks and the per-team careers), f its text, t a tooltip, lead the stat title
  const pct = (m, a) => s => U.pct3(s[m], s[a]);
  const COLS = {
    pg: [
      { l: 'MIN', f: s => U.num(pg(s, s.min)) },
      { l: 'PTS', f: s => U.num(pg(s, s.pts)), lead: 'pts', b: 1 },
      { l: 'REB', f: s => U.num(pg(s, reb(s))), lead: 'reb' },
      { l: 'AST', f: s => U.num(pg(s, s.ast)), lead: 'ast' },
      { l: 'STL', f: s => U.num(pg(s, s.stl)), lead: 'stl' },
      { l: 'BLK', f: s => U.num(pg(s, s.blk)), lead: 'blk' },
      { l: 'TOV', f: s => U.num(pg(s, s.tov)) },
      { l: 'FG%', f: pct('fgm', 'fga') }, { l: '3P%', f: pct('tpm', 'tpa') }, { l: 'FT%', f: pct('ftm', 'fta') },
      { l: 'TS%', f: s => r3(PBC.Stats.ts(s)), t: 'True shooting: points per shot, counting threes and free throws' },
    ],
    tot: [
      { l: 'MIN', f: s => Math.round(s.min) },
      { l: 'PTS', f: s => s.pts, b: 1 },
      { l: 'FG', f: s => `${s.fgm}-${s.fga}` }, { l: '3P', f: s => `${s.tpm}-${s.tpa}` }, { l: 'FT', f: s => `${s.ftm}-${s.fta}` },
      { l: 'ORB', f: s => s.orb }, { l: 'DRB', f: s => s.drb }, { l: 'REB', f: s => reb(s) },
      { l: 'AST', f: s => s.ast }, { l: 'STL', f: s => s.stl }, { l: 'BLK', f: s => s.blk }, { l: 'TOV', f: s => s.tov }, { l: 'PF', f: s => s.pf },
      { l: 'DD', f: s => s.dd || 0, t: 'Double-doubles' }, { l: 'TD', f: s => s.td || 0, t: 'Triple-doubles' },
    ],
    p36: [
      { l: 'MPG', f: s => U.num(pg(s, s.min)), t: 'Minutes a game' },
      { l: 'PTS', f: s => U.num(p36(s, s.pts)), b: 1 },
      { l: 'REB', f: s => U.num(p36(s, reb(s))) }, { l: 'AST', f: s => U.num(p36(s, s.ast)) },
      { l: 'STL', f: s => U.num(p36(s, s.stl)) }, { l: 'BLK', f: s => U.num(p36(s, s.blk)) }, { l: 'TOV', f: s => U.num(p36(s, s.tov)) },
      { l: 'FGA', f: s => U.num(p36(s, s.fga)) }, { l: '3PA', f: s => U.num(p36(s, s.tpa)) }, { l: 'FTA', f: s => U.num(p36(s, s.fta)) },
      { l: 'PF', f: s => U.num(p36(s, s.pf)) },
    ],
    adv: [
      { l: 'TS%', f: s => r3(PBC.Stats.ts(s)), t: 'True shooting: points per shot, counting threes and free throws', b: 1 },
      { l: 'eFG%', f: s => r3(efg(s)), t: 'Effective field goal %: a three counts one and a half' },
      { l: '3PAr', f: s => r3(s.fga ? s.tpa / s.fga : 0), t: 'Share of his shots from three' },
      { l: 'FTr', f: s => r3(s.fga ? s.fta / s.fga : 0), t: 'Free throw attempts per shot' },
      { l: 'AST/TO', f: s => (s.tov ? U.num(s.ast / s.tov, 2) : s.ast ? '∞' : '-'), t: 'Assists per turnover' },
      { l: 'GmSc', f: s => U.num(pg(s, PBC.Stats.gmsc(s))), t: 'Game score a game: one number for a night\'s work (40 is great, 10 is average)' },
      { l: '+/-', f: s => signed(pg(s, s.pm || 0)), t: 'Point difference a game while he was on the floor', pm: 1 },
      { l: 'DD', f: s => s.dd || 0, t: 'Double-doubles' }, { l: 'TD', f: s => s.td || 0, t: 'Triple-doubles' },
    ],
  };
  const MODES = [['pg', 'Per game'], ['tot', 'Totals'], ['p36', 'Per 36'], ['adv', 'Advanced']];

  /** the Stats tab: go(tab, opts) moves the card to another tab (a season's game log) */
  UI.PC.stats = function (S, p, tab, go) {
    const el = fresh(tab);
    const hasPo = p.stats.some(s => s.po && s.gp > 0);
    if (!hasPo) view.sPo = false;
    const po = !!view.sPo;
    const rows = p.stats.filter(s => !!s.po === po && s.gp > 0);
    if (!p.stats.some(s => s.gp > 0)) { el.innerHTML = `<div class="empty">${p.tid === -2 ? 'A draft prospect: no pro games yet.' : 'No games played yet.'}</div>`; return; }
    const cols = COLS[view.sMode] || COLS.pg;
    // his honors by season: the stat titles (that cell in gold), an All-Star and a title (by the season)
    const won = {};
    for (const a of p.awards || []) (won[a.season] || (won[a.season] = new Set())).add(a.type);
    const logs = new Set(PBC.Stats.logSeasons ? PBC.Stats.logSeasons(p) : []);
    const head = `<tr><th>Season</th><th class="num">Age</th><th>Team</th><th class="num">GP</th><th class="num">GS</th>${cols.map(c => `<th class="num" ${c.t ? `title="${U.esc(c.t)}"` : ''}>${c.l}</th>`).join('')}</tr>`;
    const cells = (s, season) => cols.map(c => {
      const lead = c.lead && season != null && !po && won[season] && won[season].has(TITLE_OF[c.lead]);
      const v = c.f(s);
      const cls = ['num', c.b ? 'bold' : '', lead ? 'pc-lead' : '', c.pm ? (pg(s, s.pm || 0) > 0.05 ? 'good-t' : pg(s, s.pm || 0) < -0.05 ? 'bad-t' : '') : ''].filter(Boolean).join(' ');
      return `<td class="${cls}" ${lead ? 'title="Led the league"' : ''}>${v}</td>`;
    }).join('');
    const marks = season => {
      const w = won[season];
      if (!w || po) return '';
      return `${w.has('champion') ? '<span class="pc-mk" title="Won the title">💍</span>' : ''}${w.has('mvp') ? '<span class="pc-mk" title="MVP">🏆</span>' : ''}${w.has('allStar') ? '<span class="pc-mk" title="All-Star">★</span>' : ''}`;
    };
    const seasons = U.uniq(rows.map(r => r.season)).sort((a, b) => a - b);
    const body = seasons.map(season => {
      const rs = rows.filter(r => r.season === season);
      const tot = rs.length > 1 ? PBC.Stats.season(p, season, po) : rs[0];
      const t = rs.length > 1 ? null : teamAt(S, rs[0].tid);
      const log = logs.has(season) ? ` <a class="link tiny" data-pc-log="${season}" title="Game log">log</a>` : '';
      let h = `<tr class="${season === S.season && !po ? 'pc-cur' : ''}"><td class="bold nowrap">${U.seasonLabel(season)}${marks(season)}${log}</td><td class="num">${ageIn(S, p, season)}</td>
        <td>${t ? `<a class="link" data-open-team="${t.id}">${U.esc(t.abbr)}</a>` : '<span class="dim" title="Played for more than one team">TOT</span>'}</td><td class="num">${tot.gp}</td><td class="num">${tot.gs}</td>${cells(tot, season)}</tr>`;
      if (rs.length > 1) h += rs.map(r => `<tr class="pc-split"><td></td><td></td><td>${teamAt(S, r.tid) ? `<a class="link" data-open-team="${r.tid}">${U.esc(abbr(S, r.tid))}</a>` : ''}</td><td class="num">${r.gp}</td><td class="num">${r.gs}</td>${cells(r, null)}</tr>`).join('');
      return h;
    }).join('');
    // the career, and with each team when he played for more than one
    const car = PBC.Stats.career(p, po);
    const byTeam = {};
    for (const r of rows) {
      const b = byTeam[r.tid] || (byTeam[r.tid] = Object.assign({ seasons: new Set(), first: r.season }, PBC.Stats.emptyLine()));
      for (const f of PBC.Stats.FIELDS) b[f] += r[f] || 0;
      b.seasons.add(r.season);
    }
    const teams = Object.keys(byTeam);
    const foot = `<tr class="sep pc-car"><td class="bold">Career</td><td></td><td class="tiny dim">${U.plural(car.seasons, 'season')}</td><td class="num bold">${car.gp}</td><td class="num">${car.gs}</td>${cells(car, null)}</tr>
      ${teams.length > 1 ? U.sortBy(teams, k => byTeam[k].first).map(k => { const b = byTeam[k]; return `<tr class="pc-split"><td class="dim">with ${U.esc(abbr(S, +k)) || 'a team gone'}</td><td></td><td class="tiny dim">${U.plural(b.seasons.size, 'season')}</td><td class="num">${b.gp}</td><td class="num">${b.gs}</td>${cells(b, null)}</tr>`; }).join('') : ''}`;
    // the line on top: his career at a glance, and this season's
    const cur = PBC.Stats.season(p, S.season, po);
    const glance = (s, label) => s && s.gp ? `<div class="pc-glance"><div class="tiny dim up">${label}</div><div class="pc-gl-row">
        <span><b>${U.num(pg(s, s.pts))}</b><i>PTS</i></span><span><b>${U.num(pg(s, reb(s)))}</b><i>REB</i></span><span><b>${U.num(pg(s, s.ast))}</b><i>AST</i></span>
        <span><b>${U.pct3(s.fgm, s.fga)}</b><i>FG%</i></span><span><b>${U.pct3(s.tpm, s.tpa)}</b><i>3P%</i></span><span><b>${r3(PBC.Stats.ts(s))}</b><i>TS%</i></span><span><b>${s.gp}</b><i>GP</i></span></div></div>` : '';
    el.innerHTML = `<div class="pc-bar">${seg('pc-po', po ? 1 : 0, [[0, 'Regular season'], [1, 'Playoffs', !hasPo]])}${seg('pc-mode', view.sMode, MODES)}</div>
      ${rows.length ? `<div class="pc-glances">${glance(cur, (po ? 'Playoffs ' : '') + U.seasonLabel(S.season))}${glance(car, po ? 'Career playoffs' : 'Career')}</div>
      <div class="tbl-wrap pc-tbl"><table class="tbl compact pc-stats"><thead>${head}</thead><tbody>${body}${foot}</tbody></table></div>
      <p class="tiny dim pc-note">Gold: led the league. ★ All-Star, 🏆 MVP, 💍 champion. A trade season shows his total (TOT) and each team. <b>log</b> opens that season's games.</p>`
      : `<div class="empty">No ${po ? 'playoff' : 'regular season'} games yet.</div>`}`;
    UI.on(el, 'click', '[data-pc-po]', (e, b) => { view.sPo = b.dataset.pcPo === '1'; UI.PC.stats(S, p, tab, go); });
    UI.on(el, 'click', '[data-pc-mode]', (e, b) => { view.sMode = b.dataset.pcMode; UI.PC.stats(S, p, tab, go); });
    UI.on(el, 'click', '[data-pc-log]', (e, b) => { e.preventDefault(); view.lSeason = +b.dataset.pcLog; view.lPo = po ? 'po' : 'all'; if (go) go('log'); });
  };

  // ---------------------------------------------------------------------------
  // Game log
  // ---------------------------------------------------------------------------
  const LOG_STATS = [['pts', 'PTS'], ['reb', 'REB'], ['ast', 'AST'], ['gmsc', 'GmSc'], ['pm', '+/-']];
  /** the box scores this season kept, by season, day and the two teams */
  function boxIndex(S) {
    const ix = {};
    for (const gid in S.boxes || {}) { const b = S.boxes[gid]; if (b && b.teams) ix[`${b.season}:${b.day}:${b.h}:${b.a}`] = b.gid; }
    return ix;
  }
  UI.PC.log = function (S, p, tab, go) {
    const el = fresh(tab);
    const seasons = PBC.Stats.logSeasons(p);
    const played = U.uniq(p.stats.filter(s => s.gp > 0).map(s => s.season)).sort((a, b) => b - a);
    if (!seasons.length) {
      el.innerHTML = `<div class="empty">${played.length ? `No game log kept for ${U.esc(PBC.Player.name(p))}'s seasons.` : 'No games played yet.'}<div class="tiny dim" style="margin-top:8px">${logRule(S)}</div></div>`;
      return;
    }
    if (!seasons.includes(view.lSeason)) view.lSeason = seasons[0];
    const season = view.lSeason;
    const all = PBC.Stats.gameLog(p, season);
    const hasPo = all.some(g => g.po), hasRs = all.some(g => !g.po);
    if ((view.lPo === 'po' && !hasPo) || (view.lPo === 'rs' && !hasRs)) view.lPo = 'all';
    const games = all.filter(g => view.lPo === 'all' || (view.lPo === 'po') === g.po);
    const ix = boxIndex(S);
    const boxOf = g => ix[`${season}:${g.day}:${g.home ? g.tm : g.opp}:${g.home ? g.opp : g.tm}`];
    // his career highs (the game where he set one gets a mark)
    const hiRs = PBC.Stats.careerHighs(p, false), hiPo = PBC.Stats.careerHighs(p, true);
    const HI_MIN = { pts: 15, reb: 8, ast: 6, stl: 3, blk: 3 };
    const isHigh = (g, k) => { const h = (g.po ? hiPo : hiRs)[k]; return h && g[k] >= (HI_MIN[k] || 1) && h.season === season && h.day === g.day && h.v === g[k]; };
    // the season's numbers for these games, and its highs
    const tot = { gp: games.length, min: 0, pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, orb: 0, drb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0, pm: 0, w: 0 };
    for (const g of games) { for (const k in tot) if (k !== 'gp' && k !== 'w') tot[k] += g[k] || 0; if (g.win) tot.w++; }
    const sHi = {};
    for (const g of games) for (const k of ['pts', 'reb', 'ast', 'stl', 'blk', 'tpm']) if (g[k] > 0 && (!sHi[k] || g[k] > sHi[k][k])) sHi[k] = g;
    const HI_WORD = { pts: 'points', reb: 'rebounds', ast: 'assists', stl: 'steals', blk: 'blocks', tpm: 'threes' };
    const opp = g => `${g.home ? 'vs' : '@'} ${U.esc(abbr(S, g.opp))}`;
    const highs = Object.keys(sHi).map(k => `<span class="pc-hi" title="${U.esc(dateOf(S, season, sHi[k].day) + ' ' + opp(sHi[k]))}"><b>${sHi[k][k]}</b> ${HI_WORD[k]}</span>`).join('');
    const dd = games.filter(g => [g.pts, g.reb, g.ast, g.stl, g.blk].filter(x => x >= 10).length >= 2).length;
    const td = games.filter(g => [g.pts, g.reb, g.ast, g.stl, g.blk].filter(x => x >= 10).length >= 3).length;
    // the chart: a bar a game
    const st = LOG_STATS.find(x => x[0] === view.lStat) ? view.lStat : 'pts';
    const val = g => (st === 'gmsc' ? Math.round(g.gmsc * 10) / 10 : g[st]);
    const chart = games.length ? chartSvg(games, val, g => `${dateOf(S, season, g.day)} ${opp(g)}: ${g.pts} pts, ${g.reb} reb, ${g.ast} ast${g.win ? ' (W)' : ' (L)'}`) : '';
    const rowsHtml = games.slice().reverse().map((g, i, arr) => {
      // (a trade: a line where he changed teams, reading newest first)
      const next = arr[i + 1];
      const traded = next && next.tm !== g.tm ? `<tr class="pc-trade"><td colspan="19">➜ ${U.esc(abbr(S, g.tm))} (from ${U.esc(abbr(S, next.tm))})</td></tr>` : '';
      const gid = boxOf(g);
      const cats = [g.pts, g.reb, g.ast, g.stl, g.blk].filter(x => x >= 10).length;
      const hiCell = (k, v, extra) => `<td class="num ${extra || ''}${isHigh(g, k) ? ' pc-ch' : ''}" ${isHigh(g, k) ? 'title="Career high"' : ''}>${v}</td>`;
      return `<tr class="${gid != null ? 'click' : ''} ${g.po ? 'pc-po' : ''}" ${gid != null ? `data-open-box="${gid}" title="Open the box score"` : ''}>
        <td class="nowrap">${g.po ? '<span class="tag gold sm">PO</span> ' : ''}${dateOf(S, season, g.day)}</td><td class="nowrap">${opp(g)}</td>
        <td class="nowrap ${g.win ? 'good-t' : 'bad-t'}">${g.win ? 'W' : 'L'} ${g.ts}-${g.os}${g.ot ? ' <span class="tiny dim">OT</span>' : ''}</td>
        <td class="num dim">${g.gs ? '●' : ''}</td><td class="num">${g.min}</td>
        ${hiCell('pts', g.pts, 'bold' + (g.pts >= 40 ? ' gold-t' : g.pts >= 30 ? ' accent-t' : ''))}${hiCell('reb', g.reb)}${hiCell('ast', g.ast)}${hiCell('stl', g.stl)}${hiCell('blk', g.blk)}
        <td class="num">${g.tov}</td><td class="num">${g.fgm}-${g.fga}</td><td class="num">${g.tpm}-${g.tpa}</td><td class="num">${g.ftm}-${g.fta}</td><td class="num">${g.pf}</td>
        <td class="num ${g.pm > 0 ? 'good-t' : g.pm < 0 ? 'bad-t' : ''}">${g.pm > 0 ? '+' : ''}${g.pm}</td><td class="num">${U.num(g.gmsc)}</td>
        <td>${cats >= 3 ? '<span class="tag gold sm" title="Triple-double">TD</span>' : cats === 2 ? '<span class="tag sm" title="Double-double">DD</span>' : ''}</td></tr>${traded}`;
    }).join('');
    const avg = (k, d) => U.num(tot.gp ? tot[k] / tot.gp : 0, d);
    el.innerHTML = `<div class="pc-bar"><select class="inp pc-season" data-pc-season>${seasons.map(s => `<option value="${s}" ${s === season ? 'selected' : ''}>${U.seasonLabel(s)}</option>`).join('')}</select>
        ${seg('pc-lpo', view.lPo, [['all', 'All'], ['rs', 'Regular season', !hasRs], ['po', 'Playoffs', !hasPo]])}<span class="spacer"></span>${seg('pc-lstat', st, LOG_STATS)}</div>
      ${games.length ? `<div class="pc-logsum"><div class="pc-gl-row">
          <span><b>${tot.gp}</b><i>GP</i></span><span><b>${tot.w}-${tot.gp - tot.w}</b><i>W-L</i></span><span><b>${avg('pts')}</b><i>PTS</i></span><span><b>${U.num(tot.gp ? (tot.orb + tot.drb) / tot.gp : 0)}</b><i>REB</i></span>
          <span><b>${avg('ast')}</b><i>AST</i></span><span><b>${U.pct3(tot.fgm, tot.fga)}</b><i>FG%</i></span><span><b>${U.pct3(tot.tpm, tot.tpa)}</b><i>3P%</i></span><span><b>${signed(tot.gp ? tot.pm / tot.gp : 0)}</b><i>+/-</i></span>
          ${dd ? `<span><b>${dd}</b><i>DD</i></span>` : ''}${td ? `<span><b>${td}</b><i>TD</i></span>` : ''}</div>
        <div class="pc-his"><span class="tiny dim up">Season highs</span>${highs}</div></div>
        ${chart}
        <div class="tbl-wrap pc-tbl"><table class="tbl compact pc-log"><thead><tr><th>Date</th><th>Opp</th><th>Result</th><th class="num" title="Started">GS</th><th class="num">MIN</th><th class="num">PTS</th><th class="num">REB</th><th class="num">AST</th><th class="num">STL</th><th class="num">BLK</th>
          <th class="num">TOV</th><th class="num">FG</th><th class="num">3P</th><th class="num">FT</th><th class="num">PF</th><th class="num">+/-</th><th class="num" title="Game score">GmSc</th><th></th></tr></thead><tbody>${rowsHtml}</tbody></table></div>
        <p class="tiny dim pc-note">Newest first. Gold box: a career high. Rows with a box score open it. ${logRule(S)}</p>` : '<div class="empty">No games.</div>'}`;
    UI.on(el, 'change', '[data-pc-season]', (e, s) => { view.lSeason = +s.value; UI.PC.log(S, p, tab, go); });
    UI.on(el, 'click', '[data-pc-lpo]', (e, b) => { view.lPo = b.dataset.pcLpo; UI.PC.log(S, p, tab, go); });
    UI.on(el, 'click', '[data-pc-lstat]', (e, b) => { view.lStat = b.dataset.pcLstat; UI.PC.log(S, p, tab, go); });
  };
  function logRule(S) {
    return S.settings && S.settings.keepLogs === 'all' ? 'Every game log is kept (Settings).'
      : 'Game logs are kept for this season and last for every player, and for good for every season a player spent on your team. Settings can keep them all.';
  }
  /** a bar a game (wins and losses in their colors) and the average as a line; tip(g) is a bar's tooltip */
  function chartSvg(games, val, tip) {
    const W = 760, H = 96, padT = 8, padB = 14;
    const vs = games.map(val);
    const hi = Math.max(1, ...vs), lo = Math.min(0, ...vs);
    const Y = v => padT + (H - padT - padB) * (1 - (v - lo) / (hi - lo || 1));
    const bw = W / games.length;
    const mean = vs.reduce((a, b) => a + b, 0) / vs.length;
    const bars = games.map((g, i) => {
      const v = vs[i], y0 = Y(0), y1 = Y(v);
      return `<rect x="${(i * bw + bw * 0.12).toFixed(1)}" y="${Math.min(y0, y1).toFixed(1)}" width="${Math.max(1, bw * 0.76).toFixed(1)}" height="${Math.max(1, Math.abs(y1 - y0)).toFixed(1)}" class="${g.win ? 'w' : 'l'}${g.po ? ' po' : ''}"><title>${U.esc(tip(g))}</title></rect>`;
    }).join('');
    return `<div class="pc-chartw"><svg class="pc-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${bars}
      <line x1="0" x2="${W}" y1="${Y(mean).toFixed(1)}" y2="${Y(mean).toFixed(1)}" class="avg"/>${lo < 0 ? `<line x1="0" x2="${W}" y1="${Y(0).toFixed(1)}" y2="${Y(0).toFixed(1)}" class="zero"/>` : ''}</svg>
      <span class="pc-avg">avg ${U.num(mean)} · <i class="w"></i>win <i class="l"></i>loss${games.some(g => g.po) ? ' <i class="p"></i>playoffs' : ''}</span></div>`;
  }

  // ---------------------------------------------------------------------------
  // Awards
  // ---------------------------------------------------------------------------
  UI.PC.awards = function (S, p, tab) {
    const el = fresh(tab);
    const list = p.awards || [];
    const by = {};
    for (const a of list) (by[a.type] || (by[a.type] = [])).push(a);
    for (const k in by) by[k].sort((x, y) => x.season - y.season);
    const seasonsOf = arr => U.uniq(arr.map(a => a.season)).map(s => U.seasonLabel(s)).join(', ');
    // the trophy case: every kind he has, the count and the seasons
    const tile = k => {
      const arr = by[k], A = AW[k];
      let sub = seasonsOf(arr);
      if (k === 'allLeague' || k === 'allDefense') {
        const n = [1, 2, 3].map(i => arr.filter(a => new RegExp('^' + i).test(a.detail || '')).length);
        sub = n.map((c, i) => (c ? `${U.ordinal(i + 1)} ×${c}` : '')).filter(Boolean).join(' · ') + `<br>${sub}`;
      }
      if (k === 'numRetired') sub = arr.map(a => U.esc(a.detail)).join(' · ');
      if (k === 'hof') sub = `${seasonsOf(arr)}${arr[0].detail ? ' · ' + U.esc(arr[0].detail) : ''}`;
      if (k === 'mvpVote') sub = arr.map(a => `${U.esc((a.detail || '').replace(' in the voting', ''))} ${U.seasonLabel(a.season)}`).join(' · ');
      if (k === 'potw') sub = `${U.plural(U.uniq(arr.map(a => a.season)).length, 'season')}`;
      const n = k === 'hof' || k === 'numRetired' ? '' : `<span class="n">×${arr.length}</span>`;
      return `<div class="pc-tro g-${A.g}" title="${U.esc(A.l)}"><span class="ic">${A.i}</span><div class="tx"><div class="lb">${U.esc(A.l)}${n}</div><div class="sb">${sub}</div></div></div>`;
    };
    const kinds = Object.keys(by).filter(k => AW[k] && AW[k].g !== 'mile').sort((a, b) => AW[a].o - AW[b].o);
    const unknown = Object.keys(by).filter(k => !AW[k]);
    const caseHtml = kinds.length ? `<div class="pc-case">${kinds.map(tile).join('')}</div>` : '<div class="empty" style="padding:14px">No trophies yet.</div>';
    // milestones and records, newest first
    const miles = list.filter(a => AW[a.type] && AW[a.type].g === 'mile').sort((a, b) => b.season - a.season);
    const milesHtml = miles.length ? `<div class="list pc-miles">${miles.map(a => `<div class="li"><span class="ic">${AW[a.type].i}</span><span class="bold">${U.esc(a.detail || AW[a.type].l)}</span><span class="spacer"></span><span class="dim tiny">${U.seasonLabel(a.season)}</span></div>`).join('')}</div>` : '';
    // career highs, regular season and playoffs
    const HI = [['pts', 'Points'], ['reb', 'Rebounds'], ['ast', 'Assists'], ['stl', 'Steals'], ['blk', 'Blocks'], ['tpm', 'Threes'], ['fgm', 'Field goals'], ['ftm', 'Free throws'], ['min', 'Minutes']];
    const hiCol = (po, label) => {
      const h = PBC.Stats.careerHighs(p, po);
      if (!Object.keys(h).length) return '';
      return `<div class="pc-hicol"><div class="pc-h5">${label}</div>${HI.filter(([k]) => h[k]).map(([k, l]) => {
        const x = h[k];
        const when = x.day != null ? `${dateOf(S, x.season, x.day, true)}${x.opp != null && S.teams[x.opp] ? ' vs ' + U.esc(abbr(S, x.opp)) : ''}` : U.seasonLabel(x.season);
        return `<div class="pc-hirow"><span class="l">${l}</span><b>${x.v}</b><span class="w tiny dim">${when}</span></div>`;
      }).join('')}</div>`;
    };
    const car = PBC.Stats.career(p, false), carPo = PBC.Stats.career(p, true);
    const feats = [['Double-doubles', car.dd, carPo.dd], ['Triple-doubles', car.td, carPo.td]].filter(x => x[1] || x[2]);
    const highs = hiCol(false, 'Regular season') + hiCol(true, 'Playoffs');
    // his best games (kept for good)
    const best = PBC.Stats.bestGames ? PBC.Stats.bestGames(p) : [];
    const bestHtml = best.length ? `<div class="pc-best">${best.map(g => `<div class="pc-bg">
        <div class="pc-bg-h"><b>${g.pts} PTS</b> · ${g.reb} REB · ${g.ast} AST${g.stl >= 3 ? ` · ${g.stl} STL` : ''}${g.blk >= 3 ? ` · ${g.blk} BLK` : ''}</div>
        <div class="tiny dim">${dateOf(S, g.season, g.day, true)} ${g.home ? 'vs' : '@'} ${U.esc(abbr(S, g.opp))} · <span class="${g.win ? 'good-t' : 'bad-t'}">${g.win ? 'W' : 'L'} ${g.ts}-${g.os}</span>${g.po ? ' · Playoffs' : ''}</div>
        <div class="tiny muted">${g.fgm}-${g.fga} FG · ${g.tpm}-${g.tpa} 3P · ${g.ftm}-${g.fta} FT · ${g.min} min · Game score <b>${U.num(g.gmsc)}</b></div></div>`).join('')}</div>` : '';
    // every season's honors
    const seasons = U.uniq(list.map(a => a.season)).sort((a, b) => b - a);
    const chip = a => {
      const A = AW[a.type] || { i: '🏅', l: a.type };
      if (a.type === 'potw') return '';
      const d = a.type === 'allLeague' || a.type === 'allDefense' ? `${A.l} (${(a.detail || '').replace(' Team', '')})` : a.type === 'mvpVote' ? `MVP vote: ${(a.detail || '').replace(' in the voting', '')}` : A.g === 'mile' || a.type === 'numRetired' ? a.detail || A.l : a.type === 'champion' ? `Champion${a.detail ? ' (' + a.detail + ')' : ''}` : A.g === 'title' ? `${A.l}: ${a.detail}` : A.l;
      return `<span class="pc-chip g-${A.g || 'more'}">${A.i} ${U.esc(d)}</span>`;
    };
    const timeline = seasons.map(s => {
      const arr = list.filter(a => a.season === s);
      const potw = arr.filter(a => a.type === 'potw').length;
      const chips = U.sortBy(arr, a => (AW[a.type] ? AW[a.type].o : 99)).map(chip).join('') + (potw ? `<span class="pc-chip g-more">📅 Player of the Week${potw > 1 ? ' ×' + potw : ''}</span>` : '');
      return `<div class="pc-tl"><div class="pc-tl-s">${U.seasonLabel(s)}</div><div class="pc-tl-c">${chips}</div></div>`;
    }).join('');
    el.innerHTML = `<div class="pc-aw">
      <div class="pc-sec"><div class="pc-h4">Trophy case</div>${caseHtml}${unknown.length ? `<div class="tiny dim">${unknown.map(k => U.esc(k)).join(', ')}</div>` : ''}</div>
      ${milesHtml ? `<div class="pc-sec"><div class="pc-h4">Milestones and records</div>${milesHtml}</div>` : ''}
      ${highs ? `<div class="pc-sec"><div class="pc-h4">Career highs</div><div class="pc-his2">${highs}</div>
        ${feats.length ? `<div class="pc-feats">${feats.map(([l, a, b]) => `<span><b>${a || 0}</b> ${l}${b ? ` <span class="dim">(+${b} in the playoffs)</span>` : ''}</span>`).join('')}</div>` : ''}</div>` : ''}
      ${bestHtml ? `<div class="pc-sec"><div class="pc-h4">Best games</div>${bestHtml}</div>` : ''}
      ${timeline ? `<div class="pc-sec"><div class="pc-h4">Season by season</div>${timeline}</div>` : ''}
    </div>`;
  };

  /** his honors in a few pills for the card's header ("💍 2× Champion"), the seasons in the tooltip; n at most */
  UI.PC.pills = function (p, n) {
    const by = {};
    for (const a of p.awards || []) if (AW[a.type] && AW[a.type].g !== 'mile' && a.type !== 'mvpVote' && a.type !== 'potw') (by[a.type] || (by[a.type] = [])).push(a);
    const ks = Object.keys(by).sort((a, b) => AW[a].o - AW[b].o).slice(0, n || 7);
    return ks.map(k => {
      const arr = by[k], A = AW[k];
      const short = { dpoy: 'DPOY', roy: 'ROY', smoy: '6MOY', mip: 'MIP', fmvp: 'Finals MVP', asgMvp: 'ASG MVP', threeChamp: '3PT champ', dunkChamp: 'Dunk champ', skillsChamp: 'Skills champ', allRookie: 'All-Rookie', numRetired: 'No. retired' }[k] || A.l;
      return `<button class="pc-pill g-${A.g}" data-pc-aw title="${U.esc(A.l + ': ' + U.uniq(arr.map(a => U.seasonLabel(a.season))).join(', '))}">${A.i} ${arr.length > 1 && k !== 'numRetired' ? arr.length + '× ' : ''}${U.esc(short)}</button>`;
    }).join('');
  };

  // ---------------------------------------------------------------------------
  // Progression
  // ---------------------------------------------------------------------------
  UI.PC.prog = function (S, p, tab) {
    const el = fresh(tab);
    const H = PBC.Player.ratingHistory(p, S);
    // (the same ratings twice in a row, a start point and the end of that season with nothing in between, show once)
    const same = (a, b) => a && b && a.ovr === b.ovr && a.pot === b.pot && (!a.r || !b.r || RK.every(k => a.r[k] === b.r[k]));
    const pts = [];
    for (const h of H) {
      const last = pts[pts.length - 1];
      if (last && same(last, h) && (h.now || h.retired || last.start)) { if (h.now || h.retired) Object.assign(last, { now: !!h.now, retired: !!h.retired }); else pts[pts.length - 1] = Object.assign({}, h, { start: false }); continue; }
      pts.push(h);
    }
    if (pts.length < 2) {
      el.innerHTML = `<div class="empty">A point on this chart every season from here on. Now: OVR ${p.ovr}, potential ${UI.potLabel(p)}.</div>${ratingTable(S, p, pts, false)}`;
      return;
    }
    const showPot = p.tid === S.userTid || p.tid === -3 || p.age >= 28;
    const label = x => (x.now ? 'Now' : x.retired ? 'Retired' : x.start ? 'Start' : U.seasonLabel(x.season));
    // the chart
    const W = 760, Hh = 230, pl = 34, pr = 18, pt = 22, pb = 34;
    const vals = pts.map(x => x.ovr).concat(showPot ? pts.map(x => x.pot) : []);
    const lo = Math.max(0, Math.min(...vals) - 4), hi = Math.min(99, Math.max(...vals) + 3);
    const X = i => pl + 22 + (i / (pts.length - 1)) * (W - pl - pr - 44), Y = v => pt + (1 - (v - lo) / (hi - lo || 1)) * (Hh - pt - pb);
    const path = k => pts.map((x, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(x[k]).toFixed(1)}`).join(' ');
    // (round steps on the scale)
    const span = hi - lo, stepV = span <= 8 ? 2 : span <= 16 ? 4 : span <= 30 ? 5 : 10;
    const ticks = [];
    for (let v = Math.ceil(lo / stepV) * stepV; v <= hi; v += stepV) ticks.push(v);
    const grid = ticks.map(v => { const y = Y(v).toFixed(1); return `<line x1="${pl}" x2="${W - pr}" y1="${y}" y2="${y}"/><text x="${pl - 6}" y="${(+y + 4).toFixed(1)}" text-anchor="end">${v}</text>`; }).join('');
    const peak = pts.reduce((a, b) => (b.ovr > a.ovr ? b : a), pts[0]);
    const svg = `<svg class="pc-prog" viewBox="0 0 ${W} ${Hh}"><g class="pg-grid">${grid}</g>
      ${showPot ? `<path d="${path('pot')}" class="pg-pot"/>` : ''}<path d="${path('ovr')}" class="pg-ovr"/>
      ${pts.map((x, i) => `<g class="pt${x === peak ? ' peak' : ''}"><circle cx="${X(i).toFixed(1)}" cy="${Y(x.ovr).toFixed(1)}" r="${x === peak ? 5.5 : 4.2}"/><text x="${X(i).toFixed(1)}" y="${(Y(x.ovr) - 10).toFixed(1)}" text-anchor="middle" class="v">${x.ovr}</text>
        <text x="${X(i).toFixed(1)}" y="${Hh - 18}" text-anchor="middle" class="s">${label(x)}</text><text x="${X(i).toFixed(1)}" y="${Hh - 5}" text-anchor="middle" class="a">${x.age ? 'age ' + x.age : ''}</text>
        <title>${U.esc(`${label(x)}: OVR ${x.ovr}${showPot ? ', POT ' + x.pot : ''}${x.tid >= 0 && S.teams[x.tid] ? ', ' + S.teams[x.tid].abbr : ''}`)}</title></g>`).join('')}</svg>`;
    // the story: the peak, the last year, the biggest moves
    const last = pts[pts.length - 1], prev = pts[pts.length - 2];
    const dOvr = last.ovr - prev.ovr;
    const moves = [];
    if (last.r && prev.r) for (const k of RK) { const d = last.r[k] - prev.r[k]; if (d) moves.push([k, d]); }
    moves.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    const first = pts[0];
    const story = `<div class="pc-story">
      <span class="pc-st"><i>Peak</i><b>${peak.ovr}</b><span class="tiny dim">${label(peak)}${peak.age ? ', age ' + peak.age : ''}</span></span>
      <span class="pc-st"><i>${prev.start ? 'Since he started' : 'Since ' + label(prev)}</i><b class="${dOvr > 0 ? 'good-t' : dOvr < 0 ? 'bad-t' : ''}">${dOvr > 0 ? '+' : ''}${dOvr}</b><span class="tiny dim">OVR</span></span>
      <span class="pc-st"><i>Career</i><b class="${last.ovr - first.ovr > 0 ? 'good-t' : last.ovr - first.ovr < 0 ? 'bad-t' : ''}">${last.ovr - first.ovr > 0 ? '+' : ''}${last.ovr - first.ovr}</b><span class="tiny dim">from ${first.ovr} (${label(first)})</span></span>
      ${moves.length ? `<span class="pc-moves">${moves.slice(0, 6).map(([k, d]) => `<span class="pc-mv ${d > 0 ? 'gain' : 'loss'}">${U.esc(RLAB[k])} ${d > 0 ? '+' : ''}${d}</span>`).join('')}</span>` : ''}</div>`;
    el.innerHTML = svg + story + ratingTable(S, p, pts, showPot);
    UI.on(el, 'click', '[data-pc-pall]', () => { view.pAll = !view.pAll; UI.PC.prog(S, p, tab); });
    UI.on(el, 'click', '[data-pc-base]', (e, b) => { view.pBase = b.dataset.pcBase; UI.PC.prog(S, p, tab); });
  };
  const RK = C.RATINGS.map(r => r.key);
  const RLAB = {};
  for (const r of C.RATINGS) RLAB[r.key] = r.label;
  /** every rating by season: a column a point in his career, the change from the one before in color */
  function ratingTable(S, p, pts, showPot) {
    if (!pts.length) return '';
    // (the newest seasons when the career is long: the full table on a click)
    const MAX = 9;
    const cols = view.pAll || pts.length <= MAX ? pts : [pts[0]].concat(pts.slice(-(MAX - 1)));
    const cut = cols.length < pts.length;
    const label = x => (x.now ? 'Now' : x.retired ? 'Retired' : x.start ? 'Start' : U.seasonLabel(x.season));
    const cell = (v, pv, cls) => {
      if (v == null) return '<td class="num dim">-</td>';
      const d = pv != null ? v - pv : 0;
      const a = Math.min(1, Math.abs(d) / 8);
      const bg = d > 0 ? `rgba(41,209,125,${(0.1 + a * 0.32).toFixed(2)})` : d < 0 ? `rgba(255,77,94,${(0.1 + a * 0.32).toFixed(2)})` : '';
      return `<td class="num ${cls || ''}" ${bg ? `style="background:${bg}"` : ''}>${v}${d ? `<sup class="${d > 0 ? 'gain' : 'loss'}">${d > 0 ? '+' : ''}${d}</sup>` : ''}</td>`;
    };
    // (the change from the season before, or from where he started)
    const prevOf = i => (i > 0 ? (view.pBase === 'start' ? cols[0] : cols[i - 1]) : null);
    const row = (label2, get, cls) => `<tr class="${cls || ''}"><td class="nowrap">${label2}</td>${cols.map((x, i) => { const pv = prevOf(i); return cell(get(x), pv ? get(pv) : null, cls === 'pc-ovr' ? 'bold' : ''); }).join('')}</tr>`;
    const body = [row('<b>Overall</b>', x => x.ovr, 'pc-ovr')].concat(showPot ? [row('Potential', x => x.pot, 'pc-pot')] : []);
    for (const g of C.RATING_GROUPS) {
      body.push(`<tr class="pc-grp"><td colspan="${cols.length + 1}">${U.esc(g)}</td></tr>`);
      for (const r of C.RATINGS.filter(x => x.group === g)) body.push(row(U.esc(r.label), x => (x.r ? x.r[r.key] : null)));
    }
    const noSnap = pts.some(x => !x.r);
    return `<div class="pc-bar" style="margin-top:14px"><span class="pc-h4" style="margin:0">Ratings by season</span><span class="spacer"></span>${pts.length > 2 ? seg('pc-base', view.pBase || 'prev', [['prev', 'Change year to year'], ['start', 'Change since the start']]) : ''}</div>
      <div class="tbl-wrap pc-tbl"><table class="tbl compact pc-rt"><thead><tr><th>Rating</th>${cols.map(x => `<th class="num">${label(x)}${x.age ? `<div class="tiny dim">${x.age}${x.tid >= 0 && S.teams[x.tid] ? ' · ' + U.esc(S.teams[x.tid].abbr) : ''}</div>` : ''}</th>`).join('')}</tr></thead><tbody>${body.join('')}</tbody></table></div>
      <p class="tiny dim pc-note">Each season's column is where his ratings stood at its end (development happens in the offseason, so a column's change is the summer before it). Green went up, red went down.${cut ? ` <a class="link" data-pc-pall>Show all ${pts.length} seasons</a>` : view.pAll && pts.length > MAX ? ' <a class="link" data-pc-pall>Show the latest only</a>' : ''}${noSnap ? ' Seasons from before rating snapshots were kept show OVR and potential only.' : ''}</p>`;
  }
})();
