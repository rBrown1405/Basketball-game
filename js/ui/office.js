/* Pro BBALL Coach: the Long Game's screens: your coaching skills (on My Career), the Front Office (the owner, the
 * facilities, your rivals) and All-Star Weekend (PBC.Coach skills, PBC.Office, PBC.Rivals, PBC.AllStar). */
(function () {
  'use strict';
  const PBC = window.PBC;
  const U = PBC.U, UI = PBC.UI;

  const pips = (n, max, cls) => `<span class="of-pips ${cls || ''}">${Array.from({ length: max }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`;
  const meter = (v, cls) => `<div class="meter"><div class="meter-fill ${cls || (v >= 60 ? 'good' : v >= 35 ? 'warn' : 'bad')}" style="width:${U.clamp(v, 0, 100)}%"></div></div>`;
  const pn = (S, pid) => (S.players[pid] ? UI.playerLink(S.players[pid]) : 'a player');
  const tAbbr = (S, tid) => (S.teams[tid] ? `${UI.teamBadge(S.teams[tid], 16)} ${U.esc(S.teams[tid].abbr)}` : '');

  // ---------------------------------------------------------------------------
  // Coaching skills (on My Career)
  // ---------------------------------------------------------------------------
  UI.skillsCard = function (S) {
    const C = PBC.Coach, c = S.coach;
    if (!C || !C.SKILLS || !c) return '';
    C.ensureSkills(c);
    const rows = C.SKILLS.map(sk => {
      const lvl = c.skills[sk.key] || 0;
      const max = lvl >= C.SKILL_MAX;
      const cost = max ? 0 : C.skillCost(lvl);
      return `<div class="sk ${max ? 'max' : ''}">
        <div class="sk-h"><span class="sk-i">${sk.icon}</span><div class="sk-t"><div class="bold">${U.esc(sk.label)}</div>${pips(lvl, C.SKILL_MAX)}</div>
          ${max ? '<span class="tag gold">Mastered</span>' : `<button class="btn sm ${c.sp >= cost ? 'primary' : ''}" data-learn="${sk.key}" ${c.sp >= cost ? '' : 'disabled'} title="${cost} skill points">Learn · ${cost}</button>`}</div>
        <div class="tiny muted">${U.esc(sk.what)}</div>
        <div class="small sk-now">${lvl ? U.esc(sk.at(lvl)) : '<span class="dim">Not learned yet</span>'}</div>
        ${Object.keys(sk.perks).map(n => `<div class="tiny sk-perk ${lvl >= +n ? 'on' : ''}">${lvl >= +n ? '✔' : '🔒'} Level ${n}: ${U.esc(sk.perks[n])}</div>`).join('')}
      </div>`;
    }).join('');
    const log = (c.spLog || []).slice(0, 4).map(x => `<div class="tiny muted">+${x.n} · ${U.esc(x.why)}</div>`).join('');
    return `<div class="card sk-card"><div class="card-h"><h3>Coaching skills</h3><div class="actions"><span class="tag ${c.sp ? 'gold' : ''}">${c.sp} skill point${c.sp === 1 ? '' : 's'}</span></div></div>
      <div class="card-b"><div class="sk-grid">${rows}</div>
      <div class="sk-foot"><div class="small muted">You earn points every season (a winning record, the owner's goal, each playoff series won, the Finals, a title, Coach of the Year; at least one for a hard season) and from the bigger achievements. Mastering a skill takes 30 points: over a long career you will master two or three, not all five.</div>${log ? `<div class="sk-log">${log}</div>` : ''}</div></div></div>`;
  };
  UI.bindSkills = function (root) {
    UI.on(root, 'click', '[data-learn]', (e, el) => {
      const r = PBC.Coach.learn(UI.S, el.dataset.learn);
      UI.toast(U.esc(r.msg), r.ok ? 'good' : 'bad');
      if (r.ok) { UI.markDirty(); UI.refresh(); }
    });
  };

  // ---------------------------------------------------------------------------
  // The Front Office: the owner, the facilities, your rivals
  // ---------------------------------------------------------------------------
  const O = () => PBC.Office;
  UI.facCanBuild = function (S) {
    if (!O() || S.userTid == null || S.userTid < 0 || !S.teams[S.userTid]) return false;
    const f = O().fac(S, S.userTid);
    return !!f && !f.build && O().FAC_KEYS.some(k => f[k] < O().FAC_MAX && f.pts >= O().facCost(f[k]));
  };
  UI.register('office', {
    title: 'Front Office',
    render(root) {
      const S = UI.S;
      const u = S.userTid;
      if (!O() || u == null || u < 0 || !S.teams[u]) { root.innerHTML = '<div class="page"><div class="card"><div class="empty">The front office opens when you have a team.</div></div></div>'; return; }
      O().ensure(S);
      const t = S.teams[u], o = O().owner(S, u), ty = O().TYPES[o.type], f = O().fac(S, u), c = S.coach;
      const dm = PBC.Desk && PBC.Desk.demandNow ? PBC.Desk.demandNow(S) : null;
      const ranks = O().ranks(S);
      const mine = ranks.find(r => r.t.id === u);
      const sec = c ? c.security : 50;
      const ownerCard = `<div class="card of-owner"><div class="card-h"><h3>The owner</h3><div class="actions"><span class="tag accent">${ty.icon} ${U.esc(ty.label)}</span></div></div><div class="card-b">
        <div class="of-orow"><div class="of-oav">${ty.icon}</div><div style="min-width:0">
          <div class="of-oname">${U.esc(o.name || 'The owner')}</div><div class="small muted">${U.esc(ty.blurb)}</div><div class="small" style="margin-top:6px"><b>Wants:</b> ${U.esc(ty.wants)}</div></div></div>
        <div class="of-kv">
          <div><div class="tiny up dim">Patience</div>${meter(o.patience, 'info')}<div class="tiny muted">${o.patience}/100</div></div>
          <div><div class="tiny up dim">Spending</div>${meter(o.spend, 'info')}<div class="tiny muted">${o.spend}/100</div></div>
          <div><div class="tiny up dim">Trust in you</div>${meter(sec)}<div class="tiny muted">${sec}/100 · ${U.esc(c && c.mood ? c.mood : 'Patient')}</div></div>
        </div>
        ${dm ? `<div class="of-demand ${dm.ok ? 'ok' : ''}"><div class="tiny up dim">This season's demand${dm.raised ? ' (you promised more)' : ''}</div><div class="bold">${U.esc(dm.label)}</div><div class="small ${dm.ok ? 'good-t' : 'warn-t'}">${dm.ok ? 'On track right now' : 'Not there yet'}</div></div>`
          : '<div class="small muted" style="margin-top:12px">The owner sets the season\'s goals at training camp.</div>'}
        ${c && c.lastReview && c.lastReview.owner ? `<div class="tiny muted" style="margin-top:8px">Last review: ${U.esc(c.lastReview.owner.join(', '))}.</div>` : ''}
      </div></div>`;
      const facTiles = O().FAC_KEYS.map(k => {
        const d = O().FAC[k], lvl = f[k];
        const building = f.build && f.build.key === k;
        const cost = O().facCost(lvl);
        const can = !f.build && lvl < O().FAC_MAX && f.pts >= cost;
        const btn = lvl >= O().FAC_MAX ? '<span class="tag gold">Best in the league</span>'
          : building ? '' : `<button class="btn sm ${can ? 'primary' : ''}" data-build="${k}" ${can ? '' : 'disabled'}>Build · ${cost}</button>`;
        return `<div class="of-fac"><div class="of-frow"><span class="of-fi">${d.icon}</span><div style="flex:1;min-width:0"><div class="bold">${U.esc(d.label)}</div>${pips(lvl, O().FAC_MAX)}</div>${btn}</div>
          ${building ? `<div><span class="tag info">🏗️ Level ${f.build.lvl} opens at training camp</span></div>` : ''}
          <div class="tiny muted">${U.esc(d.what)}</div><div class="small">${U.esc(d.at(lvl))}</div></div>`;
      }).join('');
      const facCard = `<div class="card"><div class="card-h"><h3>Facilities</h3><div class="actions"><span class="tag ${f.pts ? 'gold' : ''}">${f.pts} facility point${f.pts === 1 ? '' : 's'}</span></div></div><div class="card-b">
        <div class="of-facs">${facTiles}</div>
        <div class="small muted" style="margin-top:10px">Facility points come every summer from the owner's spending, a playoff run, a title and a full building${f.lastPts ? ` (last summer: +${f.lastPts.n})` : ''}. One project at a time; it opens at the next training camp. Your building ranks ${U.ordinal(mine.rank)} of ${ranks.length} in the league.</div>
      </div></div>`;
      const rv = PBC.Rivals ? PBC.Rivals.of(S, u, 8) : [];
      const rivCard = `<div class="card"><div class="card-h"><h3>Your rivals</h3></div><div class="card-b flush">${rv.length ? `<div class="list">${rv.map(x => {
        const ot = S.teams[x.tid];
        const lv = x.level;
        const po = x.po.length ? `${x.po.length} playoff meeting${x.po.length === 1 ? '' : 's'}, you won ${x.po.filter(m => m.winner === u).length}` : 'never met in the playoffs';
        return `<div class="li">${UI.teamBadge(ot, 28)}<div style="flex:1;min-width:0"><div class="ellip">${UI.teamLink(ot, ot.city + ' ' + ot.name)} ${lv ? `<span class="tag bad">${lv.icon} ${U.esc(lv.label)}</span>` : ''}</div>
          <div class="tiny muted">${x.h2h[0]}-${x.h2h[1]} in the regular season · ${po}${x.last && x.last.why ? ` · last: ${U.esc(x.last.why)}` : ''}</div>${meter(x.heat, 'bad')}</div></div>`;
      }).join('')}</div>` : '<div class="empty">No rivalries yet. They come from playoff series, close games, stars changing teams and words in the press.</div>'}</div></div>`;
      const top = ranks.slice(0, 6);
      const lgCard = `<div class="card"><div class="card-h"><h3>The league's best buildings</h3></div><div class="card-b flush"><div class="list">${top.concat(top.includes(mine) ? [] : [mine]).map(r => `<div class="li ${r.t.id === u ? 'me' : ''}"><span class="ls-rk">${r.rank}</span>${UI.teamBadge(r.t, 22)}<div style="flex:1;min-width:0" class="ellip">${U.esc(r.t.city + ' ' + r.t.name)}</div><span class="tiny muted">${O().FAC_KEYS.map(k => O().FAC[k].icon + r.f[k]).join(' ')}</span></div>`).join('')}</div></div></div>`;
      root.innerHTML = `<div class="page of">
        <div class="page-h"><div><h1>Front Office</h1><div class="sub">${U.esc(t.city + ' ' + t.name)} · the owner, the building, the rivals</div></div></div>
        <div class="grid g-main"><div class="stack">${ownerCard}${facCard}</div><div class="stack">${rivCard}${lgCard}</div></div></div>`;
      UI.on(root, 'click', '[data-build]', (e, el) => {
        const r = O().upgrade(UI.S, UI.S.userTid, el.dataset.build);
        UI.toast(U.esc(r.msg), r.ok ? 'good' : 'bad');
        if (r.ok) { UI.markDirty(); UI.refresh(); }
      });
    },
  });

  // ---------------------------------------------------------------------------
  // All-Star Weekend
  // ---------------------------------------------------------------------------
  const AS = () => PBC.AllStar;
  const asState = { season: null, tab: 'week' };
  UI.register('allstar', {
    title: 'All-Star Weekend',
    render(root) {
      const S = UI.S;
      if (!AS()) { root.innerHTML = '<div class="page"><div class="empty">All-Star weekend is not loaded.</div></div>'; return; }
      const hist = S.allStarHist || [];
      const W = S.allStarWknd && S.allStarWknd.season === S.season ? S.allStarWknd : null;
      const seasons = hist.map(h => h.season);
      if (asState.season == null || (!seasons.includes(asState.season) && asState.season !== S.season)) asState.season = W && !W.done ? S.season : (seasons.length ? seasons[seasons.length - 1] : S.season);
      const res = hist.find(h => h.season === asState.season) || null;
      const tab = asState.tab;
      let body;
      if (tab === 'history') body = history(S, hist);
      else if (res) body = weekend(S, res);
      else if (W && asState.season === S.season) body = upcoming(S, W);
      else body = '<div class="card"><div class="empty"><div style="font-size:34px;margin-bottom:8px">⭐</div>All-Star weekend comes at the break in the middle of the season.</div></div>';
      root.innerHTML = `<div class="page asw">
        <div class="page-h"><div><h1>All-Star Weekend</h1><div class="sub">${U.seasonLabel(asState.season)} · the game, the three-point contest, the dunk contest and the skills challenge</div></div>
          <div class="actions">${seasons.length ? `<select class="inp" data-f="season">${(W && !W.done && !seasons.includes(S.season) ? [S.season] : []).concat(seasons.slice().reverse()).map(y => `<option value="${y}" ${y === asState.season ? 'selected' : ''}>${U.seasonLabel(y)}</option>`).join('')}</select>` : ''}
          <div class="seg"><button class="${tab === 'week' ? 'on' : ''}" data-tab="week">The weekend</button><button class="${tab === 'history' ? 'on' : ''}" data-tab="history">History</button></div></div></div>
        ${body}</div>`;
      UI.on(root, 'click', '[data-tab]', (e, el) => { asState.tab = el.dataset.tab; UI.refresh(); });
      UI.on(root, 'change', '[data-f="season"]', (e, el) => { asState.season = +el.value; asState.tab = 'week'; UI.refresh(); });
    },
  });

  function upcoming(S, W) {
    const inv = (k, label, icon) => (W.invites[k] && W.invites[k].length ? `<div class="card"><div class="card-h"><h3>${icon} ${label}</h3></div><div class="card-b flush"><div class="list">${W.invites[k].map(id => { const p = S.players[id]; return p ? `<div class="li ${p.tid === S.userTid ? 'me' : ''}">${UI.avatar(p, 30)}<div style="flex:1;min-width:0">${UI.playerLink(p)}<div class="tiny muted">${tAbbr(S, p.tid)} · ${p.pos}${W.out.includes(id) ? ' · <span class="warn-t">sitting it out</span>' : ''}</div></div></div>` : ''; }).join('')}</div></div></div>` : '');
    const day = PBC.League.dateLabel ? PBC.League.dateLabel(S, Math.min(W.day, (S.numDays || 1) - 1)) : '';
    return `<div class="card accent"><div class="card-b"><div class="bold">The invitations are out.</div><div class="small muted">The weekend is ${U.esc(day)}, the first day of the All-Star break. The rosters are on the All-Star team list; here is who is in the contests.</div></div></div>
      <div class="asw-grid">${inv('three', 'Three-point contest', '🎯')}${inv('dunk', 'Dunk contest', '🚀')}${inv('skills', 'Skills challenge', '⚡')}</div>`;
  }

  function weekend(S, r) {
    const out = [];
    const g = r.game;
    if (g) {
      const side = i => {
        const rows = U.sortBy(g.box.filter(b => b.side === i), b => b.pts, true);
        return `<div style="min-width:0"><div class="asw-tn"><span>${U.esc(g.teams[i].name)}</span><b>${g.teams[i].pts}</b></div><div class="asw-tw"><table class="tbl compact"><thead><tr><th>Player</th><th class="num">MIN</th><th class="num">PTS</th><th class="num">REB</th><th class="num">AST</th><th class="num">3PM</th></tr></thead><tbody>
          ${rows.map(b => `<tr class="${b.pid === g.mvp ? 'asw-mvp' : ''} ${S.players[b.pid] && S.players[b.pid].tid === S.userTid ? 'me' : ''}"><td>${b.pid === g.mvp ? '⭐ ' : ''}${pn(S, b.pid)} <span class="tiny dim">${S.teams[b.tid] ? S.teams[b.tid].abbr : ''}</span></td><td class="num">${b.min}</td><td class="num">${b.pts}</td><td class="num">${b.reb}</td><td class="num">${b.ast}</td><td class="num">${b.tpm}</td></tr>`).join('')}</tbody></table></div></div>`;
      };
      const mvp = S.players[g.mvp];
      out.push(`<div class="card"><div class="card-h"><h3>⭐ The All-Star Game</h3><div class="actions">${mvp ? `<span class="tag gold">MVP: ${U.esc(PBC.Player.name(mvp))}</span>` : ''}</div></div><div class="card-b"><div class="asw-game">${side(g.winner)}${side(1 - g.winner)}</div></div></div>`);
    }
    const cards = [];
    if (r.three) {
      const t = r.three;
      const fin = U.sortBy(t.final, x => x.pts, true);
      cards.push(`<div class="card"><div class="card-h"><h3>🎯 Three-point contest</h3><div class="actions"><span class="tag gold">${U.esc(PBC.Player.name(S.players[t.winner]) || '')}</span></div></div><div class="card-b flush">
        <table class="tbl compact"><thead><tr><th>Final</th><th class="num">Racks</th><th class="num">Score</th></tr></thead><tbody>${fin.map(x => `<tr class="${x.pid === t.winner ? 'asw-mvp' : ''}"><td>${pn(S, x.pid)}</td><td class="num tiny">${x.racks.join(' · ')}</td><td class="num bold">${x.pts}</td></tr>`).join('')}</tbody></table>
        <table class="tbl compact"><thead><tr><th>First round</th><th class="num">Score</th></tr></thead><tbody>${U.sortBy(t.r1, x => x.pts, true).map(x => `<tr><td>${pn(S, x.pid)} <span class="tiny dim">${S.teams[x.tid] ? S.teams[x.tid].abbr : ''}</span></td><td class="num">${x.pts}</td></tr>`).join('')}</tbody></table></div></div>`);
    }
    if (r.dunk) {
      const d = r.dunk;
      const dl = x => x.dunks.map(k => `<div class="tiny"><b>${k.score}</b> · ${U.esc(k.dunk)}${k.tries > 1 ? ` <span class="dim">(${k.made ? 'try ' + k.tries : 'missed'})</span>` : ''}</div>`).join('');
      cards.push(`<div class="card"><div class="card-h"><h3>🚀 Dunk contest</h3><div class="actions"><span class="tag gold">${U.esc(PBC.Player.name(S.players[d.winner]) || '')}</span></div></div><div class="card-b flush"><div class="list">
        ${U.sortBy(d.final, x => x.total + (x.pid === d.winner ? 0.5 : 0), true).map(x => `<div class="li ${x.pid === d.winner ? 'asw-mvp' : ''}">${S.players[x.pid] ? UI.avatar(S.players[x.pid], 30) : ''}<div style="flex:1;min-width:0">${pn(S, x.pid)} <span class="tiny dim">final</span>${dl(x)}</div><b>${x.total}</b></div>`).join('')}
        ${d.r1.filter(x => !d.final.some(y => y.pid === x.pid)).map(x => `<div class="li">${S.players[x.pid] ? UI.avatar(S.players[x.pid], 30) : ''}<div style="flex:1;min-width:0">${pn(S, x.pid)} <span class="tiny dim">first round</span>${dl(x)}</div><span class="muted">${x.total}</span></div>`).join('')}
        ${d.dunkoff ? `<div class="li small muted">Tied after the final: a dunk-off decided it.</div>` : ''}</div></div></div>`);
    }
    if (r.skills) {
      const k = r.skills;
      const names = ['Quarterfinals', 'Semifinals', 'Final'].slice(3 - k.rounds.length);
      cards.push(`<div class="card"><div class="card-h"><h3>⚡ Skills challenge</h3><div class="actions"><span class="tag gold">${U.esc(PBC.Player.name(S.players[k.winner]) || '')}</span></div></div><div class="card-b flush"><div class="list">
        ${k.rounds.map((rd, i) => `<div class="li tiny up dim">${names[i] || 'Round ' + (i + 1)}</div>${rd.map(m => `<div class="li small"><div style="flex:1;min-width:0" class="ellip"><span class="${m.w === m.a ? 'bold' : 'muted'}">${pn(S, m.a)} ${m.ta}s</span> · <span class="${m.w === m.b ? 'bold' : 'muted'}">${pn(S, m.b)} ${m.tb}s</span></div></div>`).join('')}`).join('')}</div></div></div>`);
    }
    out.push(`<div class="asw-grid">${cards.join('')}</div>`);
    return out.join('');
  }

  function history(S, hist) {
    if (!hist.length) return '<div class="card"><div class="empty">The first All-Star weekend comes at the break.</div></div>';
    const who = (pid, tid) => (S.players[pid] ? `${UI.playerLink(S.players[pid])} <span class="tiny dim">${S.teams[tid] ? S.teams[tid].abbr : ''}</span>` : '');
    return `<div class="card"><div class="card-b flush"><table class="tbl compact"><thead><tr><th>Season</th><th>All-Star Game</th><th>Game MVP</th><th>Three-point</th><th>Dunk</th><th>Skills</th></tr></thead><tbody>
      ${hist.slice().reverse().map(h => `<tr><td>${U.seasonLabel(h.season)}</td><td class="small">${h.game ? `${U.esc(h.game.teams[h.game.winner].name)} ${h.game.teams[h.game.winner].pts}-${h.game.teams[1 - h.game.winner].pts}` : ''}</td>
        <td>${h.game ? who(h.game.mvp, h.game.mvpTid) : ''}</td><td>${h.three ? who(h.three.winner, h.three.wtid) + ` <span class="tiny dim">${h.three.score}</span>` : ''}</td>
        <td>${h.dunk ? who(h.dunk.winner, h.dunk.wtid) : '<span class="dim">none</span>'}</td><td>${h.skills ? who(h.skills.winner, h.skills.wtid) : ''}</td></tr>`).join('')}</tbody></table></div></div>`;
  }
})();
