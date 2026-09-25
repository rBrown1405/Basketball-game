/* Pro BBALL Coach — career screens: my career, season recap, job offers, settings, fallback offseason. */
(function () {
  'use strict';
  const PBC = window.PBC;
  const U = PBC.U, C = PBC.Config, UI = PBC.UI;

  // ---------------------------------------------------------------------------
  // My career
  // ---------------------------------------------------------------------------
  UI.register('career', {
    title: 'My Career',
    render(root) {
      const S = UI.S;
      const c = S.coach;
      const t = S.teams[c.tid];
      const tot = c.totals;
      const pct = tot.w + tot.l ? tot.w / (tot.w + tot.l) : 0;
      const hofP = PBC.Coach.hofProbability(S);
      const sec = c.security;
      root.innerHTML = `<div class="page">
        <div class="hero" style="margin-bottom:16px"><div class="hero-in row nowrap">
          <div style="width:84px;height:84px;border-radius:50%;background:linear-gradient(135deg,var(--team),var(--team2));display:grid;place-items:center;font:900 34px/1 var(--font-display);flex:none">${U.esc(c.name.split(' ').map(s => s[0]).join('').slice(0, 2))}</div>
          <div><div class="tiny up dim" style="letter-spacing:2px">Head coach · age ${c.age}</div><div class="up" style="font-size:34px;line-height:1">${U.esc(c.name)}</div>
          <div class="muted">${c.status === 'employed' ? `${U.esc(t.city)} ${U.esc(t.name)} · contract ${c.contract.years} yr${c.contract.years === 1 ? '' : 's'} at ${U.money(c.contract.salary)}` : '<span class="bad-t">Unemployed</span>'} · Reputation ${c.rep}/100</div></div></div></div>
        <div class="stats-row" style="margin-bottom:16px">
          <div class="stat"><div class="v">${tot.w}-${tot.l}</div><div class="l">Career record (${(pct * 100).toFixed(1)}%)</div></div>
          <div class="stat"><div class="v">${tot.pw}-${tot.pl}</div><div class="l">Playoffs</div></div>
          <div class="stat"><div class="v gold-t">${c.titles}</div><div class="l">Championships</div></div>
          <div class="stat"><div class="v">${c.finals}</div><div class="l">Finals trips</div></div>
          <div class="stat"><div class="v">${c.coy}</div><div class="l">Coach of the Year</div></div>
          <div class="stat"><div class="v">${c.seasons.length}</div><div class="l">Seasons</div></div>
          <div class="stat"><div class="v">${c.bestStreak}</div><div class="l">Best win streak</div></div>
        </div>
        <div class="grid g-main">
          <div class="stack">
            <div class="card"><div class="card-h"><h3>Season by season</h3></div><div class="card-b flush">${c.seasons.length ? `<table class="tbl compact"><thead><tr><th>Season</th><th>Team</th><th class="num">W-L</th><th>Result</th><th>Owner's goal</th><th class="num">Security</th></tr></thead><tbody>
              ${c.seasons.slice().reverse().map(s => `<tr><td>${U.seasonLabel(s.season)}</td><td>${UI.teamBadge(S.teams[s.tid], 20)} ${S.teams[s.tid].abbr}</td><td class="num">${s.w}-${s.l}</td><td>${s.champ ? '🏆 ' : ''}${U.esc(s.result)}</td><td>${s.met ? '✅' : '❌'} <span class="small muted">${U.esc(s.goal)}</span></td><td class="num">${s.security}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Your first season is in progress.</div>'}</div></div>
            <div class="card"><div class="card-h"><h3>Achievements</h3><div class="actions"><span class="small muted">${Object.keys(c.achievements).length}/${C.ACHIEVEMENTS.length}</span></div></div><div class="card-b"><div class="ach-grid">
              ${C.ACHIEVEMENTS.map(a => { const on = c.achievements[a.id]; return `<div class="ach ${on ? 'on' : ''}"><span class="ai">${on ? '🏅' : '🔒'}</span><div><div class="bold">${U.esc(a.label)}</div><div class="tiny muted">${U.esc(a.desc)}</div>${on ? `<div class="tiny gold-t">${U.seasonLabel(on.season)} · +${a.pts} HOF</div>` : ''}</div></div>`; }).join('')}</div></div></div>
          </div>
          <div class="stack">
            <div class="card accent"><div class="card-h"><h3>Job status</h3></div><div class="card-b">
              <div class="kv"><span>Owner mood</span><span>${U.esc(c.mood || '—')}</span><span>This season's goal</span><span>${c.expectation ? U.esc(c.expectation.label) : '—'}</span><span>Projected wins</span><span>${c.expectation ? c.expectation.wins : '—'}</span></div>
              <div class="row" style="margin-top:12px"><span class="small muted">Job security</span><div class="spacer"></div><b>${sec}</b></div>
              <div class="meter lg"><div class="meter-fill ${sec >= 60 ? 'good' : sec >= 35 ? 'warn' : 'bad'}" style="width:${sec}%"></div></div>
              ${c.lastReview ? `<p class="small muted">Last review (${U.seasonLabel(c.lastReview.season)}): ${U.esc(c.lastReview.result)} · ${c.lastReview.goalMet ? 'goal met' : 'goal missed'} · security ${c.lastReview.delta >= 0 ? '+' : ''}${c.lastReview.delta}.</p>` : ''}
            </div></div>
            <div class="card"><div class="card-h"><h3>Hall of Fame watch</h3></div><div class="card-b">
              <div class="row"><span class="big gold-t">${Math.round(c.hof)}</span><span class="muted">HOF points</span><div class="spacer"></div><span class="tag gold">${Math.round(hofP * 100)}% chance</span></div>
              <div class="meter lg" style="margin-top:8px"><div class="meter-fill" style="width:${Math.min(100, c.hof / 1.3)}%;background:linear-gradient(90deg,#ffb020,#ffe37a)"></div></div>
              <p class="small muted">Win games, titles and awards, and unlock achievements to build a Hall of Fame résumé. ~100 points is a lock.</p></div></div>
            <div class="card"><div class="card-h"><h3>Record vs. every team</h3></div><div class="card-b flush" id="vs-tbl"></div></div>
          </div>
        </div></div>`;
      const rows = S.teams.filter(x => x.id !== c.tid || c.vs[x.id]).map(x => ({ t: x, v: c.vs[x.id] || [0, 0] }));
      UI.table(root.querySelector('#vs-tbl'), {
        rows, compact: true, sort: 'w',
        columns: [
          { key: 'team', label: 'Opponent', value: r => r.t.name, fmt: r => `${UI.teamBadge(r.t, 20)} ${UI.teamLink(r.t, r.t.name)}` },
          { key: 'w', label: 'W', num: true, value: r => r.v[0], fmt: r => r.v[0] },
          { key: 'l', label: 'L', num: true, value: r => r.v[1], fmt: r => r.v[1] },
          { key: 'pct', label: 'PCT', num: true, value: r => (r.v[0] + r.v[1] ? r.v[0] / (r.v[0] + r.v[1]) : -1), fmt: r => (r.v[0] + r.v[1] ? (r.v[0] / (r.v[0] + r.v[1])).toFixed(3).replace(/^0/, '') : '—') },
        ],
      });
    },
  });

  // ---------------------------------------------------------------------------
  // Season recap (phase 'awards')
  // ---------------------------------------------------------------------------
  UI.register('recap', {
    title: 'Season Recap',
    render(root) {
      const S = UI.S;
      const h = S.history[S.history.length - 1];
      if (!h || h.season !== S.season) { root.innerHTML = '<div class="page"><div class="card"><div class="empty">The season recap appears when the season is over.</div></div></div>'; return; }
      const aw = h.awards;
      const c = S.coach;
      const rev = c.lastReview;
      const my = PBC.League.standings(S)[S.userTid];
      const res = PBC.League.playoffResult(S, S.userTid);
      const award = (key, label) => {
        const p = aw[key] != null ? S.players[aw[key]] : null;
        if (!p) return '';
        const s = PBC.Stats.season(p, S.season, false);
        return `<div class="recap-award">${UI.avatar(p, 54)}<div style="min-width:0"><div class="al">${label}</div><div class="bold">${UI.playerLink(p)}</div>
          <div class="tiny muted">${p.tid >= 0 ? S.teams[p.tid].abbr : ''} · ${s ? `${U.num(s.pts / s.gp)} pts, ${U.num((s.orb + s.drb) / s.gp)} reb, ${U.num(s.ast / s.gp)} ast` : ''}</div></div></div>`;
      };
      const champ = h.champion != null ? S.teams[h.champion] : null;
      const cont = UI.continueInfo();
      root.innerHTML = `<div class="page">
        <div class="page-h"><div><h1>${U.seasonLabel(S.season)} Season Recap</h1><div class="sub">Your season: ${my.w}-${my.l} · ${U.esc(res.label)}</div></div>
          <div class="actions">${cont ? `<button class="btn primary lg" id="recap-cont">${U.esc(cont.label)} ▸</button>` : ''}</div></div>
        <div class="grid g-main">
          <div class="stack">
            ${champ ? `<div class="hero" style="--team:${champ.colors.primary};--team2:${champ.colors.secondary}"><div class="hero-in row nowrap">${UI.teamBadge(champ, 84)}<div><div class="tiny up dim" style="letter-spacing:2px">Champions</div>
              <div class="up" style="font-size:34px;line-height:1">🏆 ${U.esc(champ.city)} ${U.esc(champ.name)}</div><div class="muted">${h.runnerUp != null ? 'Defeated the ' + U.esc(S.teams[h.runnerUp].name) + ' in the Finals' : ''}${h.fmvp != null ? ' · Finals MVP: ' + UI.playerLink(S.players[h.fmvp]) : ''}</div></div></div></div>` : ''}
            <div class="card"><div class="card-h"><h3>Season awards</h3></div><div class="card-b"><div class="grid g2">
              ${award('mvp', 'Most Valuable Player')}${award('dpoy', 'Defensive Player of the Year')}${award('roy', 'Rookie of the Year')}${award('smoy', 'Sixth Player of the Year')}${award('mip', 'Most Improved Player')}
              <div class="recap-award">${UI.teamBadge(S.teams[aw.coyTid], 54)}<div><div class="al">Coach of the Year</div><div class="bold">${aw.coyTid === S.userTid ? U.esc(c.name) + ' (you!)' : U.esc(S.teams[aw.coyTid].city + ' ' + S.teams[aw.coyTid].name)}</div></div></div>
            </div></div></div>
            <div class="card"><div class="card-h"><h3>All-League teams</h3></div><div class="card-b flush"><table class="tbl compact"><tbody>
              ${aw.allLeague.map((five, i) => `<tr><td class="bold nowrap">${U.ordinal(i + 1)} Team</td><td>${five.map(pid => UI.playerLink(S.players[pid])).join(' · ')}</td></tr>`).join('')}
              ${aw.allDefense.map((five, i) => `<tr><td class="bold nowrap">All-Defense ${i + 1}</td><td>${five.map(pid => UI.playerLink(S.players[pid])).join(' · ')}</td></tr>`).join('')}
              <tr><td class="bold nowrap">All-Rookie</td><td>${aw.allRookie.map(pid => UI.playerLink(S.players[pid])).join(' · ') || '—'}</td></tr></tbody></table></div></div>
          </div>
          <div class="stack">
            ${rev ? `<div class="card accent"><div class="card-h"><h3>Owner's review</h3></div><div class="card-b">
              <div class="kv"><span>Goal</span><span>${U.esc(rev.label)}</span><span>Result</span><span>${U.esc(rev.result)}</span><span>Verdict</span><span>${{ extended: '✍️ Contract extended', retained: '👍 Retained', fired: '❌ Fired', expired: '📄 Not renewed' }[rev.verdict] || rev.verdict}</span></div>
              <div class="row" style="margin-top:12px"><span class="small muted">Job security</span><div class="spacer"></div><b>${rev.security}</b><span class="${rev.delta >= 0 ? 'good-t' : 'bad-t'} small">(${rev.delta >= 0 ? '+' : ''}${rev.delta})</span></div>
              <div class="meter lg"><div class="meter-fill ${rev.security >= 60 ? 'good' : rev.security >= 35 ? 'warn' : 'bad'}" style="width:${rev.security}%"></div></div></div></div>` : ''}
            <div class="card"><div class="card-h"><h3>Stat champions</h3></div><div class="card-b flush"><div class="list">${Object.keys(aw.leaders || {}).map(k => { const x = aw.leaders[k]; const p = S.players[x.pid]; return `<div class="li">${UI.avatar(p, 28)}<div style="flex:1">${UI.playerLink(p)}</div><div class="up" style="font-size:18px">${x.val.toFixed(1)} <span class="tiny dim">${k.toUpperCase()}</span></div></div>`; }).join('')}</div></div></div>
          </div>
        </div></div>`;
      const b = root.querySelector('#recap-cont');
      if (b) b.onclick = () => { const c2 = UI.continueInfo(); if (c2) c2.run(); };
    },
  });

  // ---------------------------------------------------------------------------
  // Jobs
  // ---------------------------------------------------------------------------
  UI.register('jobs', {
    title: 'Job Offers',
    render(root) {
      const S = UI.S;
      const c = S.coach;
      if (c.status !== 'unemployed') { UI.go('home'); return; }
      if (!c.jobOffers || !c.jobOffers.length) c.jobOffers = PBC.Coach.jobOffers(S);
      const st = PBC.League.standings(S);
      root.innerHTML = `<div class="page"><div class="page-h"><div><h1>Job Offers</h1><div class="sub">You're a free agent coach. Pick your next challenge — or walk away from the game.</div></div>
        <div class="actions"><button class="btn danger" data-act="retire">Retire from coaching</button></div></div>
        <div class="grid g2">${c.jobOffers.map((o, i) => {
          const t = S.teams[o.tid];
          const roster = PBC.League.roster(S, o.tid);
          return `<div class="job-card"><div class="row nowrap">${UI.teamBadge(t, 56)}<div><div class="up" style="font-size:24px;line-height:1">${U.esc(t.city)} ${U.esc(t.name)}</div>
            <div class="small muted">${st[t.id].w}-${st[t.id].l} · team rating ${Math.round(PBC.League.teamStrength(S, t.id))} · ${'★'.repeat(t.market)} market</div></div></div>
            <div class="row" style="margin:10px 0">${roster.slice(0, 3).map(p => `<span class="row nowrap small">${UI.avatar(p, 24)}${U.esc(PBC.Player.shortName(p))} ${UI.ovr(p.ovr)}</span>`).join('')}</div>
            <div class="kv"><span>Contract</span><span>${o.years} years · ${U.money(o.salary)}/yr</span></div>
            <button class="btn primary block" style="margin-top:12px" data-take="${i}">Accept offer</button></div>`;
        }).join('') || '<div class="card"><div class="empty">Nobody is calling… maybe next year.</div></div>'}</div></div>`;
      UI.on(root, 'click', '[data-take]', async (e, el) => {
        const o = c.jobOffers[+el.dataset.take];
        if (!(await UI.confirm(`Take the ${S.teams[o.tid].city} ${S.teams[o.tid].name} job?`, { ok: 'Take the job' }))) return;
        PBC.Coach.acceptJob(S, o);
        UI.setState(S);
        UI.save(true);
        UI.go('home');
        UI.toast(`Welcome to ${S.teams[o.tid].city}!`, 'good');
      });
      UI.on(root, 'click', '[data-act="retire"]', async () => {
        if (!(await UI.confirm('Retire and end this career? Your save stays so you can look back at it.', { ok: 'Retire', danger: true }))) return;
        c.status = 'retired';
        UI.save(true);
        UI.modal({ title: 'A career to remember', body: `<p>${U.esc(c.name)} retires with a ${c.totals.w}-${c.totals.l} record, ${c.titles} championship${c.titles === 1 ? '' : 's'} and ${Math.round(c.hof)} Hall of Fame points.</p>`, actions: [{ label: 'Back to title', cls: 'primary', onClick: cl => { cl(); UI.setState(null); UI.go('title'); } }] });
      });
    },
  });
  UI.register('fired', { title: 'Fired', render() { PBC.App.checkFired(); } });

  // ---------------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------------
  UI.register('settings', {
    title: 'Settings',
    render(root) {
      const S = UI.S;
      const st = S.settings;
      const tog = (key, label, hint) => `<label class="li chk" style="cursor:pointer"><input type="checkbox" data-set="${key}" ${st[key] !== false ? 'checked' : ''}><div><div class="bold">${label}</div><div class="tiny muted">${hint}</div></div></label>`;
      root.innerHTML = `<div class="page"><div class="page-h"><h1>Settings</h1></div>
        <div class="grid g2">
          <div class="card"><div class="card-h"><h3>Gameplay</h3></div><div class="card-b flush"><div class="list">
            ${tog('gimEnabled', 'Game Impact Moments', 'Take the big shot yourself in clutch moments of live games.')}
            ${tog('autoTimeouts', 'Assistant timeouts', 'Let your assistants call timeouts to stop opponent runs.')}
            ${tog('showVisuals', 'Show the court in live games', 'Turn off for a fast text-only play-by-play view.')}
            ${tog('retroCourt', 'Retro pixel court', 'Watch live games on a Hoop Land-style 2D pixel court with chibi sprites.')}
            ${tog('pixelMode', 'Retro pixel filter', 'Chunky pixel-art filter for the broadcast 3D court (when loaded).')}
          </div></div></div>
          <div class="card"><div class="card-h"><h3>Save data</h3></div><div class="card-b col">
            <p class="small muted" style="margin:0">Your career saves automatically in this browser. Export a file to back it up or move it to another computer.</p>
            <div class="row"><button class="btn primary" data-act="save">💾 Save now</button><button class="btn" data-act="export">⬇️ Export save file</button></div>
            <div class="divider"></div>
            <div class="row"><button class="btn" data-act="title">↩︎ Back to title screen</button><div class="spacer"></div><button class="btn danger" data-act="delete">Delete this career</button></div>
          </div></div>
        </div>
        <div class="card" style="margin-top:16px"><div class="card-h"><h3>How to play</h3></div><div class="card-b small" style="line-height:1.6">
          <ol style="margin:0;padding-left:18px">
            <li><b>Set up your team</b> in <i>Lineup & Minutes</i> (starters, rotation minutes, go-to players) and <i>Strategy</i> (offense, defense, tempo). The fit tags tell you what your roster can run.</li>
            <li><b>Play games</b> from Home: <i>Play Game</i> to watch live (1×–16×, skip to crunch time) or <i>Quick Sim</i>. In live games use the <i>Coach</i> tab for subs and adjustments, and call timeouts (T key).</li>
            <li><b>Game Impact Moments</b>: late in close games you pick the play, then hold and release the shot meter (Space, mouse or touch) in the green.</li>
            <li><b>Practice</b> once a week: pick a drill and up to 3 focus players. Your drill score decides how much they improve.</li>
            <li><b>Keep your job</b>: the owner sets a goal each season. Beat it to earn extensions; miss it too often and you'll be fired and have to find a new team.</li>
            <li><b>Build a dynasty</b> through the draft, free agency and trades in the offseason. Chase titles, records, achievements and the Hall of Fame.</li>
          </ol></div></div>
        <div class="card" style="margin-top:16px"><div class="card-h"><h3>About</h3></div><div class="card-b small muted">
          Pro BBALL Coach — an NBA-style head coach simulation. All teams and players are fictional. Stats engine calibrated to modern pro averages (about 115 points, 100 possessions and 37 three-point attempts per team per game).</div></div></div>`;
      UI.on(root, 'change', '[data-set]', (e, el) => { st[el.dataset.set] = el.checked; UI.save(); });
      UI.on(root, 'click', '[data-act]', async (e, el) => {
        const a = el.dataset.act;
        if (a === 'save') { await UI.save(true); UI.toast('Saved', 'good'); }
        if (a === 'export') {
          const blob = new Blob([PBC.Store.exportString(S)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const t = S.teams[S.userTid];
          const link = document.createElement('a');
          link.href = url; link.download = `pro-bball-coach_${(t ? t.abbr : 'career')}_${S.season}.json`;
          document.body.appendChild(link); link.click(); link.remove();
          setTimeout(() => URL.revokeObjectURL(url), 2000);
        }
        if (a === 'title') { await UI.save(true); UI.setState(null); UI.go('title'); }
        if (a === 'delete') {
          if (!(await UI.confirm('Delete this career permanently? This cannot be undone.', { ok: 'Delete', danger: true }))) return;
          await PBC.Store.remove(S.saveId); UI.setState(null); UI.go('title');
        }
      });
    },
  });

  // ---------------------------------------------------------------------------
  // Fallback offseason (used only if the full offseason module isn't loaded)
  // ---------------------------------------------------------------------------
  function fallbackOffseason(S) {
    const L = PBC.League.cfg(S);
    const st = PBC.League.standings(S);
    // aging, progression, retirements
    for (const p of Object.values(S.players)) {
      if (p.tid === -3 || p.tid === -2) continue;
      p.age++;
      PBC.Player.progress(p);
      if (p.injury) { p.injury.days -= 120; if (p.injury.days <= 0) p.injury = null; }
      const retireP = p.age >= 38 ? 0.8 : p.age >= 35 ? (p.ovr < 72 ? 0.55 : 0.2) : p.age >= 32 && p.ovr < 62 ? 0.3 : 0;
      if (U.chance(retireP)) {
        if (p.ovr >= 80) PBC.Season.news(S, `👋 ${PBC.Player.name(p)} retires after ${p.yearsPro} seasons.`, 'transaction', p.tid);
        p.tid = -3; continue;
      }
      p.yearsPro++;
    }
    // expiring contracts: re-sign or release
    for (const p of Object.values(S.players)) {
      if (p.tid < 0 || !p.contract || p.contract.exp > S.season) continue;
      const val = PBC.Player.marketValue(p, L);
      const keep = p.ovr >= 70 || (p.age <= 25 && p.pot >= 75) || U.chance(0.35);
      if (keep) p.contract = { amt: val, exp: S.season + PBC.Player.contractYears(p), rookie: false };
      else { const was = p.tid; PBC.AI.release(S, p); void was; }
    }
    // draft (reverse standings, no lottery)
    const order = PBC.League.sorted(S, null, st).reverse().map(r => r.tid);
    const pool = U.sortBy(PBC.League.prospects(S).filter(p => p.draft && p.draft.year === S.season + 1), p => p.ovr * 0.5 + p.pot * 0.5, true);
    let pick = 0;
    for (let rd = 1; rd <= L.draftRounds; rd++) {
      for (const tid0 of order) {
        const pk = S.draftPicks.find(x => x.season === S.season + 1 && x.round === rd && x.orig === tid0);
        const tid = pk ? pk.owner : tid0;
        const p = pool[pick++];
        if (!p) break;
        p.tid = tid; p.draft = { year: S.season + 1, round: rd, pick: order.indexOf(tid0) + 1, tid };
        p.rookieSeason = S.season + 1;
        p.contract = { amt: PBC.Player.rookieSalary(order.indexOf(tid0) + 1, rd, L), exp: S.season + (rd === 1 ? 4 : 2), rookie: true };
        PBC.Player.assignNumber(S, p);
      }
    }
    for (const p of PBC.League.prospects(S)) { p.tid = -1; p.contract = { amt: L.minSalary, exp: S.season + 1, rookie: false }; }
    S.draftPicks = S.draftPicks.filter(x => x.season > S.season + 1);
    for (const t of S.teams) S.draftPicks.push({ season: S.season + 5, round: 1, orig: t.id, owner: t.id }, { season: S.season + 5, round: 2, orig: t.id, owner: t.id });
    // rosters
    for (const t of S.teams) { PBC.AI.fillRoster(S, t.id, { quiet: true }); if (t.id !== S.userTid || t.rot.auto !== false) PBC.AI.setupTeam(S, t.id); }
    if (S.teams[S.userTid]) PBC.AI.autoRotation(S, S.userTid);
    S.season++;
    PBC.League.newSeasonSetup(S);
    S.magazine = null;
  }

  PBC.fallbackOffseason = fallbackOffseason;
})();
