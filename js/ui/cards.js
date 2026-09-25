/* Pro BBALL Coach — player card, box score modal, team page. */
(function () {
  'use strict';
  const PBC = window.PBC;
  const U = PBC.U, C = PBC.Config, UI = PBC.UI;

  const perG = (s, k) => (s && s.gp ? s[k] / s.gp : 0);
  UI.statLineCols = function () {
    return [
      { key: 'gp', label: 'GP', num: true }, { key: 'gs', label: 'GS', num: true },
      { key: 'min', label: 'MIN', num: true, fmt: s => U.num(perG(s, 'min')), value: s => perG(s, 'min') },
      { key: 'pts', label: 'PTS', num: true, fmt: s => U.num(perG(s, 'pts')), value: s => perG(s, 'pts') },
      { key: 'reb', label: 'REB', num: true, fmt: s => U.num((s.orb + s.drb) / Math.max(1, s.gp)), value: s => (s.orb + s.drb) / Math.max(1, s.gp) },
      { key: 'ast', label: 'AST', num: true, fmt: s => U.num(perG(s, 'ast')), value: s => perG(s, 'ast') },
      { key: 'stl', label: 'STL', num: true, fmt: s => U.num(perG(s, 'stl')), value: s => perG(s, 'stl') },
      { key: 'blk', label: 'BLK', num: true, fmt: s => U.num(perG(s, 'blk')), value: s => perG(s, 'blk') },
      { key: 'tov', label: 'TOV', num: true, fmt: s => U.num(perG(s, 'tov')), value: s => perG(s, 'tov') },
      { key: 'fgp', label: 'FG%', num: true, fmt: s => U.pct3(s.fgm, s.fga), value: s => (s.fga ? s.fgm / s.fga : 0) },
      { key: 'tpp', label: '3P%', num: true, fmt: s => U.pct3(s.tpm, s.tpa), value: s => (s.tpa ? s.tpm / s.tpa : 0) },
      { key: 'ftp', label: 'FT%', num: true, fmt: s => U.pct3(s.ftm, s.fta), value: s => (s.fta ? s.ftm / s.fta : 0) },
    ];
  };

  // ---------------------------------------------------------------------------
  // Player card
  // ---------------------------------------------------------------------------
  UI.openPlayer = function (pid) {
    const S = UI.S;
    const p = S.players[pid];
    if (!p) return;
    const L = PBC.League.cfg(S);
    const t = p.tid >= 0 ? S.teams[p.tid] : null;
    const mine = p.tid === S.userTid;
    const status = p.tid === -1 ? '<span class="tag info">Free agent</span>' : p.tid === -2 ? '<span class="tag accent">Draft prospect</span>' : p.tid === -3 ? '<span class="tag">Retired</span>' : '';
    const draft = p.draft && p.draft.round ? `${p.draft.year} draft · Rd ${p.draft.round}, Pick ${p.draft.pick}${S.teams[p.draft.tid] ? ' (' + S.teams[p.draft.tid].abbr + ')' : ''}` : p.tid === -2 ? `${p.draft ? p.draft.year : S.season + 1} draft prospect` : 'Undrafted';
    const yrsLeft = p.contract ? Math.max(0, p.contract.exp - S.season + (S.phase === 'regular' || S.phase === 'preseason' || S.phase === 'playin' || S.phase === 'playoffs' ? 1 : 0)) : 0;
    const contract = p.contract && p.tid >= 0 ? `${U.money(p.contract.amt)}/yr · ${yrsLeft} yr${yrsLeft === 1 ? '' : 's'} left${p.contract.rookie ? ' · rookie deal' : ''}` : p.tid === -1 ? `Asking ~${U.money(PBC.Player.marketValue(p, L))}` : '—';
    const strengths = PBC.Player.strengths(p), weaks = PBC.Player.weaknesses(p);
    const ptype = PBC.Persona ? PBC.Persona.TYPES[PBC.Persona.of(p)] : null;
    const req = p.tradeReq && p.tid >= 0 ? p.tradeReq : null;
    const body = UI.h(`<div>
      <div class="pc-head">${UI.avatar(p, 92)}
        <div style="flex:1;min-width:0">
          <div class="pc-name">${U.esc(p.first)} ${U.esc(p.last)}</div>
          ${p.nickname ? `<div class="pc-nick">"${U.esc(p.nickname)}"</div>` : ''}
          <div class="pc-meta">#${p.num} · ${C.POS_NAME[p.pos]} · ${U.esc(p.arch || '')} ${t ? '· ' + UI.teamBadge(t, 18) + ' ' + UI.teamLink(t) : ''} ${status}</div>
          <div class="pc-meta">${p.age} yrs · ${U.height(p.hgt)} · ${p.wgt} lbs · wingspan ${U.height(p.wing)} · ${p.hand === 'L' ? 'Left' : 'Right'}-handed · ${U.esc(p.origin || '')}</div>
          ${ptype ? `<div class="pc-pers" title="Personality"><span class="pi">${ptype.icon}</span><b>${U.esc(ptype.label)}</b><span class="pd">${U.esc(ptype.desc)}</span></div>` : ''}
          <div class="row" style="margin-top:8px">${strengths.map(s => `<span class="tag good">${s}</span>`).join('')}${weaks.map(s => `<span class="tag bad">${s}</span>`).join('')}
            ${p.injury ? `<span class="tag bad">🚑 ${U.esc(PBC.Player.injuryLabel(p.injury))}</span>` : ''}
            ${req ? `<span class="tag warn" title="${U.esc(PBC.Player.name(p) + ' ' + (req.text || 'wants out'))}">📣 Trade request</span>` : ''}</div>
        </div>
        <div class="center"><div class="tiny dim up">OVR</div>${UI.ovr(p.ovr, 'lg')}<div class="tiny dim up" style="margin-top:6px">POT</div><div class="bold">${UI.potLabel(p)}</div></div>
      </div>
      <div class="kv" style="margin:14px 0 10px;grid-template-columns:auto 1fr auto 1fr">
        <span>Contract</span><span>${contract}</span><span>Draft</span><span>${draft}</span>
        ${mine ? `<span>Morale</span><span>${p.morale != null ? p.morale : 70}/100</span><span>Promise</span><span>${p.promise ? U.esc(p.promise.type === 'starter' ? 'Starting role' : p.promise.min + '+ minutes') : '—'}</span>` : ''}
      </div>
      <div class="tabs" style="margin:6px 0 12px"><button class="tab active" data-t="ratings">Ratings</button>${PBC.Tendency ? '<button class="tab" data-t="tend">Tendencies</button>' : ''}<button class="tab" data-t="stats">Stats</button>
        ${mine ? '<button class="tab" data-t="log">Game Log</button>' : ''}<button class="tab" data-t="awards">Awards</button><button class="tab" data-t="prog">Progression</button></div>
      <div id="pc-tab"></div>
      ${mine ? `<div class="row" style="margin-top:14px;border-top:1px solid var(--line);padding-top:12px">
        <button class="btn sm" data-a="goto1">⭐ Go-to #1</button><button class="btn sm" data-a="goto2">Go-to #2</button>
        ${PBC.Trade ? '<button class="btn sm" data-a="trade">🔁 Shop in trade</button>' : ''}<button class="btn sm" data-a="edit">✏️ Edit</button><div class="spacer"></div><button class="btn sm danger" data-a="release">Release</button></div>` : ''}
      ${!mine && p.tid !== -3 ? `<div class="row" style="margin-top:14px;border-top:1px solid var(--line);padding-top:12px"><span class="small muted">Commissioner edit: ratings, tendencies, personality, looks and more.</span><div class="spacer"></div><button class="btn sm" data-a="edit">✏️ Edit player</button></div>` : ''}
      ${p.tid === -1 && S.phase === 'regular' ? `<div class="row" style="margin-top:14px;border-top:1px solid var(--line);padding-top:12px"><span class="small muted">Sign for the rest of the season at ${U.money(Math.max(L.minSalary, Math.min(PBC.Player.marketValue(p, L), capRoom(S))))}.</span><div class="spacer"></div><button class="btn sm primary" data-a="sign">Sign player</button></div>` : ''}
    </div>`);
    const tabEl = body.querySelector('#pc-tab');
    const showTab = key => {
      body.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.t === key));
      if (key === 'ratings') tabEl.innerHTML = ratingsHtml(S, p);
      if (key === 'tend') tabEl.innerHTML = tendenciesHtml(S, p);
      if (key === 'stats') statsTab(S, p, tabEl);
      if (key === 'log') gameLog(S, p, tabEl);
      if (key === 'awards') tabEl.innerHTML = awardsHtml(S, p);
      if (key === 'prog') tabEl.innerHTML = progressionSvg(S, p);
    };
    UI.on(body, 'click', '.tab', (e, el) => showTab(el.dataset.t));
    showTab('ratings');
    const m = UI.modal({ title: '', body, wide: true });
    UI.on(body, 'click', '[data-a]', async (e, el) => {
      const a = el.dataset.a;
      const team = S.teams[S.userTid];
      if (a === 'goto1') { team.strat.goTo1 = p.id; if (team.strat.goTo2 === p.id) team.strat.goTo2 = null; UI.save(); UI.toast(`${PBC.Player.name(p)} is your go-to player.`, 'good'); }
      if (a === 'edit') { m.close(); UI.openPlayerEditor(p.id); }
      if (a === 'goto2') { team.strat.goTo2 = p.id; if (team.strat.goTo1 === p.id) team.strat.goTo1 = null; UI.save(); UI.toast(`${PBC.Player.name(p)} is your second option.`, 'good'); }
      if (a === 'trade') { m.close(); UI.go('trade', { give: [p.id] }); }
      if (a === 'release') {
        if (PBC.League.roster(S, S.userTid).length <= L.rosterMin && ['regular', 'playin', 'playoffs', 'preseason'].includes(S.phase)) { UI.toast(`You need at least ${L.rosterMin} players.`, 'bad'); return; }
        const guaranteed = p.contract && p.contract.amt > 0;
        if (!(await UI.confirm(`Release ${PBC.Player.name(p)}? ${guaranteed ? `His remaining salary (${U.money(p.contract.amt)}/yr) stays on your cap as dead money.` : ''}`, { ok: 'Release', danger: true }))) return;
        if (PBC.Offseason && PBC.Offseason.release) {
          const r = PBC.Offseason.release(S, p.id);
          UI.toast(r.msg, r.ok ? 'info' : 'bad');
          if (!r.ok) return;
        } else {
          PBC.AI.release(S, p);
          PBC.Season.news(S, `✂️ You released ${PBC.Player.name(p)}.`, 'transaction', S.userTid);
        }
        UI.save(); m.close(); UI.refresh();
      }
      if (a === 'sign') {
        if (PBC.Offseason && PBC.Offseason.quickSign) {
          const r = PBC.Offseason.quickSign(S, p.id);
          UI.toast(r.msg, r.ok ? 'good' : 'bad');
          if (!r.ok) return;
        } else {
          if (PBC.League.roster(S, S.userTid).length >= L.rosterMax) { UI.toast(`Roster is full (${L.rosterMax}). Release someone first.`, 'bad'); return; }
          const amt = Math.max(L.minSalary, Math.min(PBC.Player.marketValue(p, L), capRoom(S)));
          p.tid = S.userTid;
          p.contract = { amt: Math.round(amt / 1e4) * 1e4, exp: S.season, rookie: false };
          PBC.Player.assignNumber(S, p);
          PBC.Season.news(S, `✍️ You signed ${PBC.Player.name(p)} for the rest of the season.`, 'transaction', S.userTid);
        }
        UI.save(); m.close(); UI.refresh();
      }
    });
  };

  function capRoom(S) { return PBC.League.cfg(S).cap - (PBC.Offseason && PBC.Offseason.payroll ? PBC.Offseason.payroll(S, S.userTid) : PBC.AI.payroll(S, S.userTid)); }

  function ratingsHtml(S, p) {
    const prospect = p.tid === -2;
    const known = prospect ? (p.scout ? p.scout.known : 0) : 100;
    const err = Math.round(11 * (1 - known / 100));
    return `<div class="pc-ratings">${C.RATING_GROUPS.map(g => `<div><h4>${g}</h4>${C.RATINGS.filter(r => r.group === g).map(r => {
      if (!prospect || err <= 1) return UI.ratingBar(r.label, p.r[r.key]);
      const noise = ((U.hash(p.id + r.key) % 100) / 100 - 0.5) * err;
      const v = Math.round(U.clamp(p.r[r.key] + noise, 25, 99));
      return `<div class="rbar"><span class="lab">${r.label}</span><span class="val">${Math.max(25, v - err)}–${Math.min(99, v + err)}</span><div class="meter"><div class="meter-fill" style="width:${v}%;opacity:.6"></div></div></div>`;
    }).join('')}</div>`).join('')}</div>${prospect ? `<p class="small muted">Scouting knowledge: ${known}%. Scout this prospect to narrow the ranges.</p>` : ''}`;
  }

  function tendenciesHtml(S, p) {
    const TD = PBC.Tendency;
    const t = TD.get(p);
    if (!t) return '<div class="empty">No tendencies.</div>';
    const sig = TD.signature(p, 3).filter(x => Math.abs(x.v - 50) >= 15);
    return `<div class="pc-ratings pc-tend">${TD.GROUPS.map(g => `<div><h4>${g}</h4>${TD.LIST.filter(x => x.group === g).map(x =>
      `<div class="rbar" title="${U.esc(x.desc)}"><span class="lab">${U.esc(x.label)}</span><span class="val">${t[x.key]}<small>${TD.word(t[x.key])}</small></span><div class="meter"><div class="meter-fill" style="width:${t[x.key]}%"></div></div></div>`
    ).join('')}</div>`).join('')}</div>
      <p class="small muted" style="margin:12px 0 0">${sig.length ? `<b class="pc-sig">${U.esc(p.last)} ${sig.map(x => U.esc(x.text)).join(', ')}.</b> ` : ''}Tendencies decide what he looks for on the floor; ratings decide how well it works.${p.tendCustom ? ' <span class="tag warn">Custom</span>' : ''}</p>`;
  }

  function statsTab(S, p, el) {
    const rows = U.sortBy(p.stats.filter(s => !s.po), s => s.season);
    const po = U.sortBy(p.stats.filter(s => s.po), s => s.season);
    const car = PBC.Stats.career(p, false), carPo = PBC.Stats.career(p, true);
    const cols = UI.statLineCols();
    const line = (s, label) => `<tr ${label === 'Career' ? 'class="sep"' : ''}><td class="bold">${label}</td>${cols.map(c => `<td class="num">${c.fmt ? c.fmt(s) : s[c.key]}</td>`).join('')}</tr>`;
    const lab = s => `${U.seasonLabel(s.season)} <span class="dim">${S.teams[s.tid] ? S.teams[s.tid].abbr : ''}</span>`;
    el.innerHTML = rows.length ? `<div class="tbl-wrap"><table class="tbl compact"><thead><tr><th>Season</th>${cols.map(c => `<th class="num">${c.label}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(s => line(s, lab(s))).join('')}${rows.length > 1 ? line(car, 'Career') : ''}</tbody></table></div>
      ${po.length ? `<h4 class="up" style="margin:16px 0 6px;font-size:13px;color:var(--gold)">Playoffs</h4><div class="tbl-wrap"><table class="tbl compact"><thead><tr><th>Season</th>${cols.map(c => `<th class="num">${c.label}</th>`).join('')}</tr></thead>
      <tbody>${po.map(s => line(s, lab(s))).join('')}${po.length > 1 ? line(carPo, 'Career') : ''}</tbody></table></div>` : ''}`
      : '<div class="empty">No games played yet.</div>';
  }

  function gameLog(S, p, el) {
    const games = Object.values(S.boxes || {}).filter(b => b.teams.some(T => T.players.some(x => x.pid === p.id && !x.dnp))).sort((a, b) => b.gid - a.gid);
    if (!games.length) { el.innerHTML = '<div class="empty">No games this season.</div>'; return; }
    el.innerHTML = `<div class="tbl-wrap"><table class="tbl compact hover"><thead><tr><th>Date</th><th>Opp</th><th>Result</th><th class="num">MIN</th><th class="num">PTS</th><th class="num">REB</th><th class="num">AST</th><th class="num">STL</th><th class="num">BLK</th><th class="num">FG</th><th class="num">3P</th><th class="num">FT</th><th class="num">+/-</th></tr></thead><tbody>
      ${games.map(b => {
        const u = b.h === S.userTid ? 0 : 1;
        const x = b.teams[u].players.find(q => q.pid === p.id);
        const my = u === 0 ? b.hs : b.as, th = u === 0 ? b.as : b.hs;
        return `<tr class="click" data-open-box="${b.gid}"><td>${b.playoff ? '🏆 ' : ''}${PBC.League.dateLabel(S, b.day)}</td><td>${u === 0 ? 'vs' : '@'} ${S.teams[u === 0 ? b.a : b.h].abbr}</td><td class="${my > th ? 'good-t' : 'bad-t'}">${my > th ? 'W' : 'L'} ${my}-${th}</td>
          <td class="num">${x.min}</td><td class="num bold">${x.pts}</td><td class="num">${x.orb + x.drb}</td><td class="num">${x.ast}</td><td class="num">${x.stl}</td><td class="num">${x.blk}</td>
          <td class="num">${x.fgm}-${x.fga}</td><td class="num">${x.tpm}-${x.tpa}</td><td class="num">${x.ftm}-${x.fta}</td><td class="num ${x.pm > 0 ? 'good-t' : x.pm < 0 ? 'bad-t' : ''}">${x.pm > 0 ? '+' : ''}${x.pm}</td></tr>`;
      }).join('')}</tbody></table></div>`;
  }

  const AWARD_LABEL = { mvp: '🏆 MVP', dpoy: '🛡️ Defensive Player of the Year', roy: '🌱 Rookie of the Year', smoy: '🪑 Sixth Player of the Year', mip: '📈 Most Improved Player', fmvp: '🏅 Finals MVP', allLeague: 'All-League', allDefense: 'All-Defensive', allRookie: 'All-Rookie Team', allStar: '🌟 All-Star', champion: '💍 Champion', potw: 'Player of the Week' };
  UI.AWARD_LABEL = AWARD_LABEL;
  function awardsHtml(S, p) {
    if (!p.awards.length) return '<div class="empty">No awards yet.</div>';
    const potw = p.awards.filter(a => a.type === 'potw').length;
    const list = U.sortBy(p.awards.filter(a => a.type !== 'potw'), a => -a.season);
    return `<div class="list">${list.map(a => `<div class="li"><span class="dim" style="min-width:64px">${U.seasonLabel(a.season)}</span><span class="bold">${AWARD_LABEL[a.type] || a.type}</span><span class="muted">${U.esc(a.detail || '')}</span></div>`).join('')}
      ${potw ? `<div class="li"><span class="dim" style="min-width:64px">Career</span><span class="bold">Player of the Week ×${potw}</span></div>` : ''}</div>`;
  }

  function progressionSvg(S, p) {
    const pts = p.hist.map(h => ({ season: h.season, ovr: h.ovr, pot: h.pot }));
    pts.push({ season: S.phase === 'regular' || S.phase === 'preseason' ? S.season : S.season + 1, ovr: p.ovr, pot: p.pot, now: true });
    if (pts.length < 2) return `<div class="empty">Progression history appears after the first season. Current: OVR ${p.ovr}, potential ${UI.potLabel(p)}.</div>`;
    const W = 640, H = 220, pad = 34;
    const minV = Math.min(...pts.map(x => x.ovr)) - 4, maxV = Math.max(...pts.map(x => Math.max(x.ovr, p.tid === S.userTid ? x.pot : x.ovr))) + 3;
    const X = i => pad + (i / (pts.length - 1)) * (W - pad * 2), Y = v => H - pad - ((v - minV) / (maxV - minV)) * (H - pad * 2);
    const line = pts.map((x, i) => `${i ? 'L' : 'M'}${X(i)},${Y(x.ovr)}`).join(' ');
    return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-height:260px"><g stroke="rgba(255,255,255,.07)">${[0, 0.25, 0.5, 0.75, 1].map(f => `<line x1="${pad}" x2="${W - pad}" y1="${pad + f * (H - pad * 2)}" y2="${pad + f * (H - pad * 2)}"/>`).join('')}</g>
      <path d="${line}" fill="none" stroke="#ff6b1a" stroke-width="3"/>${pts.map((x, i) => `<circle cx="${X(i)}" cy="${Y(x.ovr)}" r="4.5" fill="#ff6b1a"/><text x="${X(i)}" y="${Y(x.ovr) - 10}" fill="#e9eef6" font-size="12" text-anchor="middle" font-weight="700">${x.ovr}</text>
      <text x="${X(i)}" y="${H - 10}" fill="#8d99b0" font-size="11" text-anchor="middle">${x.now ? 'Now' : U.seasonLabel(x.season)}</text>`).join('')}</svg>`;
  }

  // ---------------------------------------------------------------------------
  // Box score
  // ---------------------------------------------------------------------------
  UI.boxScoreHtml = function (S, box, opts) {
    opts = opts || {};
    const L = PBC.League.cfg(S);
    const th = box.teams.map(T => S.teams[T.tid]);
    const periods = Math.max(L.periods, box.q[0].length, box.q[1].length);
    const qHead = Array.from({ length: periods }, (_, i) => `<th>${i < L.periods ? i + 1 : (i - L.periods ? i - L.periods + 1 : '') + 'OT'}</th>`).join('');
    const teamTable = (T, i) => {
      const players = T.players.slice().sort((a, b) => (b.gs - a.gs) || (b.min - a.min));
      return `<div class="card flat" style="margin-top:12px"><div class="card-h">${UI.teamBadge(th[i], 24)}<h3>${U.esc(th[i].city)} ${U.esc(th[i].name)}</h3></div>
        <div class="tbl-wrap"><table class="tbl compact"><thead><tr><th>Player</th><th class="num">MIN</th><th class="num">PTS</th><th class="num">REB</th><th class="num">AST</th><th class="num">STL</th><th class="num">BLK</th><th class="num">TO</th><th class="num">FG</th><th class="num">3P</th><th class="num">FT</th><th class="num">PF</th><th class="num">+/-</th></tr></thead><tbody>
        ${players.map(x => x.dnp ? `<tr><td class="dim">${U.esc(x.name)} <span class="tiny">${x.inj ? 'INJ' : 'DNP'}</span></td><td colspan="12" class="dim tiny">Did not play</td></tr>` : `<tr><td>${x.gs ? '' : '<span class="dim">·</span> '}<a class="link" data-open-player="${x.pid}">${U.esc(x.name)}</a> <span class="dim tiny">${x.pos}</span>${x.inj ? ' 🚑' : ''}</td>
          <td class="num">${x.min}</td><td class="num bold">${x.pts}</td><td class="num">${x.orb + x.drb}</td><td class="num">${x.ast}</td><td class="num">${x.stl}</td><td class="num">${x.blk}</td><td class="num">${x.tov}</td>
          <td class="num">${x.fgm}-${x.fga}</td><td class="num">${x.tpm}-${x.tpa}</td><td class="num">${x.ftm}-${x.fta}</td><td class="num">${x.pf}</td><td class="num ${x.pm > 0 ? 'good-t' : x.pm < 0 ? 'bad-t' : ''}">${x.pm > 0 ? '+' : ''}${x.pm}</td></tr>`).join('')}
        <tr class="sep"><td class="bold">Team</td><td></td><td class="num bold">${T.pts}</td><td class="num">${T.orb + T.drb}</td><td class="num">${T.ast}</td><td class="num">${T.stl}</td><td class="num">${T.blk}</td><td class="num">${T.tov}</td>
          <td class="num">${T.fgm}-${T.fga} <span class="dim">${U.pct3(T.fgm, T.fga)}</span></td><td class="num">${T.tpm}-${T.tpa}</td><td class="num">${T.ftm}-${T.fta}</td><td class="num">${T.pf}</td><td></td></tr>
        </tbody></table></div></div>`;
    };
    return `<div class="box-score-h">
        <div class="vs-team">${UI.teamBadge(th[1], 58)}<div class="nm">${U.esc(th[1].name)}</div></div>
        <div class="center"><div class="sc">${box.as} <span class="dim">–</span> ${box.hs}</div><div class="small muted up">${box.final === false ? 'Live' : 'Final'}${box.ot ? ' / ' + (box.ot > 1 ? box.ot : '') + 'OT' : ''}${box.playoff ? ' · Playoffs' : ''}</div></div>
        <div class="vs-team">${UI.teamBadge(th[0], 58)}<div class="nm">${U.esc(th[0].name)}</div></div>
      </div>
      <table class="tbl compact qtbl" style="margin-top:14px"><thead><tr><th style="text-align:left">Team</th>${qHead}<th>T</th></tr></thead><tbody>
        ${[1, 0].map(i => `<tr><td style="text-align:left" class="bold">${th[i].abbr}</td>${Array.from({ length: periods }, (_, q) => `<td>${box.q[i][q] != null ? box.q[i][q] : '-'}</td>`).join('')}<td class="bold">${i ? box.as : box.hs}</td></tr>`).join('')}</tbody></table>
      ${teamTable(box.teams[1], 1)}${teamTable(box.teams[0], 0)}
      ${box.pbp && box.pbp.length && !opts.noPbp ? `<div class="card flat" style="margin-top:12px"><div class="card-h"><h3>Play-by-play</h3></div><div class="pbp-list">${UI.pbpHtml(S, box.pbp.slice().reverse(), box)}</div></div>` : ''}`;
  };

  UI.pbpHtml = function (S, lines, box) {
    let lastQ = null;
    return lines.map(l => {
      const head = l.q !== lastQ ? `<div class="pbp-li q"><span class="c">${U.periodName(l.q, true)}</span><span></span><span></span></div>` : '';
      lastQ = l.q;
      const t = box ? S.teams[box.teams[l.team] ? box.teams[l.team].tid : -1] : null;
      return head + `<div class="pbp-li"><span class="c">${U.clock(l.clock, true)}</span><span>${t ? `<b style="color:${U.shade(t.colors.primary, 0.35)}">${t.abbr}</b> ` : ''}${U.esc(l.text)}</span><span class="s">${l.score ? l.score[1] + '-' + l.score[0] : ''}</span></div>`;
    }).join('');
  };

  UI.openBox = function (gid) {
    const S = UI.S;
    const box = S.boxes && S.boxes[gid];
    if (!box) { UI.toast('Box scores are kept for your team\'s games this season.', 'info'); return; }
    UI.modal({ title: `${PBC.League.dateLabel(S, box.day, true)} · Box score`, body: UI.boxScoreHtml(S, box), xwide: true });
  };

  // ---------------------------------------------------------------------------
  // Team page
  // ---------------------------------------------------------------------------
  UI.register('team', {
    title: 'Team',
    render(root, params) {
      const S = UI.S;
      const tid = params.tid != null ? params.tid : S.userTid;
      const t = S.teams[tid];
      const L = PBC.League.cfg(S);
      const st = PBC.League.standings(S)[tid];
      const roster = PBC.League.roster(S, tid);
      const payroll = PBC.AI.payroll(S, tid);
      const pr = PBC.League.powerRankings(S).find(x => x.tid === tid);
      const vs = S.coach && S.coach.vs[tid];
      root.innerHTML = `<div class="page">
        <div class="hero" style="--team:${t.colors.primary};--team2:${t.colors.secondary};margin-bottom:16px"><div class="hero-in row nowrap">${UI.teamBadge(t, 80)}
          <div><div class="small up dim" style="letter-spacing:2px">${L.playoffFormat === 'conference' ? L.confs[t.conf] + ' · ' + L.divs[t.div] : L.confs[t.conf]}</div>
          <div class="up" style="font-size:34px;line-height:1">${U.esc(t.city)} ${U.esc(t.name)}</div>
          <div class="muted">${st.w}-${st.l} · Power rank #${pr ? pr.rank : '-'} · Payroll ${U.money(payroll, true)} · Offense: ${C.OFFENSES[t.strat.off].label} · Defense: ${C.DEFENSES[t.strat.def].label}</div>
          ${vs ? `<div class="small" style="margin-top:4px">Your career record vs ${U.esc(t.name)}: <b>${vs[0]}-${vs[1]}</b></div>` : ''}</div>
          ${UI.openTeamEditor ? `<div class="spacer"></div><button class="btn ghost sm" data-edit-team="${tid}" title="Names, colors, uniforms, court and arena">🎨 Edit team</button>` : ''}</div></div>
        <div class="grid g-main">
          <div class="card"><div class="card-h"><h3>Roster</h3></div><div class="card-b flush" id="team-roster"></div></div>
          <div class="stack">
            <div class="card"><div class="card-h"><h3>Franchise history</h3></div><div class="card-b flush">${t.history.length ? `<table class="tbl compact"><thead><tr><th>Season</th><th class="num">W-L</th><th>Result</th></tr></thead><tbody>
              ${t.history.slice().reverse().map(h => `<tr><td>${U.seasonLabel(h.season)}</td><td class="num">${h.w}-${h.l}</td><td>${h.champ ? '🏆 ' : ''}${U.esc(h.result)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">History begins after this season.</div>'}</div></div>
            ${franchiseRecordsHtml(S, tid)}
          </div>
        </div></div>`;
      UI.table(root.querySelector('#team-roster'), {
        compact: true, sort: 'ovr',
        rows: roster.map(p => ({ p, s: PBC.Stats.season(p, S.season, false) })),
        columns: [
          { key: 'name', label: 'Player', fmt: r => `<span class="row nowrap">${UI.avatar(r.p, 26)}${UI.playerLink(r.p)}${r.p.injury ? ' 🚑' : ''}${r.p.tradeReq ? ' <span title="Has asked for a trade">📣</span>' : ''}</span>`, value: r => r.p.last },
          { key: 'pos', label: 'Pos', fmt: r => UI.pos(r.p.pos), value: r => C.POS_NUM[r.p.pos] },
          { key: 'age', label: 'Age', num: true, value: r => r.p.age, fmt: r => r.p.age },
          { key: 'ovr', label: 'OVR', num: true, value: r => r.p.ovr, fmt: r => UI.ovr(r.p.ovr) },
          { key: 'pts', label: 'PPG', num: true, value: r => perG(r.s, 'pts'), fmt: r => (r.s ? U.num(perG(r.s, 'pts')) : '—') },
          { key: 'reb', label: 'RPG', num: true, value: r => (r.s ? (r.s.orb + r.s.drb) / r.s.gp : 0), fmt: r => (r.s ? U.num((r.s.orb + r.s.drb) / r.s.gp) : '—') },
          { key: 'ast', label: 'APG', num: true, value: r => perG(r.s, 'ast'), fmt: r => (r.s ? U.num(perG(r.s, 'ast')) : '—') },
          { key: 'sal', label: 'Salary', num: true, value: r => (r.p.contract ? r.p.contract.amt : 0), fmt: r => U.money(r.p.contract ? r.p.contract.amt : 0, true) },
        ],
      });
      const eb = root.querySelector('[data-edit-team]');
      if (eb) eb.onclick = () => UI.openTeamEditor(+eb.dataset.editTeam);
    },
  });

  function franchiseRecordsHtml(S, tid) {
    const fr = S.records && S.records.franchise && S.records.franchise[tid];
    if (!fr) return '';
    const cats = PBC.Stats.GAME_CATS.filter(([k]) => fr.game[k] && fr.game[k].length);
    return `<div class="card"><div class="card-h"><h3>Franchise single-game records</h3></div><div class="card-b flush"><table class="tbl compact"><tbody>
      ${cats.map(([k, label]) => { const r = fr.game[k][0]; return `<tr><td class="muted">${label}</td><td class="num bold">${r.val}</td><td>${UI.playerLink(S.players[r.pid], r.name)}</td><td class="dim">${U.seasonLabel(r.season)}</td></tr>`; }).join('')}
      ${fr.teamGame.pts.length ? `<tr><td class="muted">Team points</td><td class="num bold">${fr.teamGame.pts[0].val}</td><td>vs ${S.teams[fr.teamGame.pts[0].opp].abbr}</td><td class="dim">${U.seasonLabel(fr.teamGame.pts[0].season)}</td></tr>` : ''}
      </tbody></table></div></div>`;
  }
})();
