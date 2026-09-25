/* Pro BBALL Coach — team screens: roster, lineup & minutes, strategy, practice. */
(function () {
  'use strict';
  const PBC = window.PBC;
  const U = PBC.U, C = PBC.Config, UI = PBC.UI;
  const perG = (s, k) => (s && s.gp ? s[k] / s.gp : 0);

  // ---------------------------------------------------------------------------
  // Roster
  // ---------------------------------------------------------------------------
  let rosterTab = 'overview';
  UI.register('roster', {
    title: 'Roster',
    render(root) {
      const S = UI.S;
      const L = PBC.League.cfg(S);
      const roster = PBC.League.roster(S, S.userTid);
      const payroll = PBC.Offseason && PBC.Offseason.payroll ? PBC.Offseason.payroll(S, S.userTid) : PBC.AI.payroll(S, S.userTid);
      root.innerHTML = `<div class="page">
        <div class="page-h"><div><h1>Roster</h1><div class="sub">${roster.length}/${L.rosterMax} players · Avg age ${U.num(U.avg(roster, p => p.age))} · Payroll ${U.money(payroll, true)} / cap ${U.money(L.cap, true)}${payroll > L.tax ? ' · <span class="bad-t">over the tax</span>' : ''}</div></div>
          <div class="actions"><div class="tabs">${[['overview', 'Overview'], ['stats', 'Stats'], ['ratings', 'All Ratings'], ['contracts', 'Contracts']].map(([k, l]) => `<button class="tab ${rosterTab === k ? 'active' : ''}" data-tab="${k}">${l}</button>`).join('')}</div></div></div>
        <div class="card"><div class="card-b flush" id="roster-tbl"></div></div>
        <p class="hint" style="margin-top:10px">Tip: click a player for his full card — set go-to players, view game logs, release or shop him in a trade.</p></div>`;
      UI.on(root, 'click', '[data-tab]', (e, el) => { rosterTab = el.dataset.tab; UI.refresh(); });
      const team = S.teams[S.userTid];
      const rows = roster.map(p => ({ p, s: PBC.Stats.season(p, S.season, false) }));
      const nameCol = { key: 'name', label: 'Player', value: r => r.p.last, fmt: r => `<span class="row nowrap">${UI.avatar(r.p, 30)}<span>${UI.playerLink(r.p)}${team.strat.goTo1 === r.p.id ? ' <span class="tag gold">★1</span>' : team.strat.goTo2 === r.p.id ? ' <span class="tag gold">★2</span>' : ''}${r.p.injury ? ` <span class="tag bad" title="${U.esc(PBC.Player.injuryLabel(r.p.injury))}">INJ</span>` : ''}<div class="tiny dim">#${r.p.num} · ${U.esc(r.p.arch || '')}</div></span></span>` };
      const posCol = { key: 'pos', label: 'Pos', value: r => C.POS_NUM[r.p.pos], fmt: r => UI.pos(r.p.pos) };
      const base = [nameCol, posCol,
        { key: 'age', label: 'Age', num: true, value: r => r.p.age, fmt: r => r.p.age },
        { key: 'ovr', label: 'OVR', num: true, value: r => r.p.ovr, fmt: r => UI.ovr(r.p.ovr) },
        { key: 'pot', label: 'POT', num: true, value: r => r.p.pot, fmt: r => UI.potLabel(r.p) }];
      let cols;
      if (rosterTab === 'overview') {
        const key = [['three', '3PT'], ['mid', 'MID'], ['layup', 'LAY'], ['dunk', 'DNK'], ['post', 'PST'], ['handle', 'HND'], ['pass', 'PAS'], ['perD', 'PDF'], ['intD', 'IDF'], ['dreb', 'REB'], ['speed', 'SPD']];
        cols = base.concat([{ key: 'hgt', label: 'Ht', num: true, value: r => r.p.hgt, fmt: r => U.height(r.p.hgt) }],
          key.map(([k, l]) => ({ key: k, label: l, num: true, value: r => r.p.r[k], fmt: r => ratingCell(r.p.r[k]) })),
          [{ key: 'morale', label: 'Mood', num: true, value: r => r.p.morale, fmt: r => moodIcon(r.p.morale) }]);
      } else if (rosterTab === 'stats') {
        cols = [nameCol, posCol].concat(UI.statLineCols().map(c => Object.assign({}, c, { value: r => (r.s ? (c.value ? c.value(r.s) : r.s[c.key]) : -1), fmt: r => (r.s ? (c.fmt ? c.fmt(r.s) : r.s[c.key]) : '—') })),
          [{ key: 'pm', label: '+/-', num: true, value: r => (r.s ? r.s.pm / r.s.gp : -99), fmt: r => (r.s && r.s.gp ? (r.s.pm > 0 ? '+' : '') + U.num(r.s.pm / r.s.gp) : '—') }]);
      } else if (rosterTab === 'ratings') {
        cols = [nameCol, { key: 'ovr', label: 'OVR', num: true, value: r => r.p.ovr, fmt: r => UI.ovr(r.p.ovr) }].concat(C.RATINGS.map(rt => ({ key: rt.key, label: rt.short, title: rt.label, num: true, value: r => r.p.r[rt.key], fmt: r => ratingCell(r.p.r[rt.key]) })));
      } else {
        cols = base.concat([
          { key: 'sal', label: 'Salary', num: true, value: r => (r.p.contract ? r.p.contract.amt : 0), fmt: r => U.money(r.p.contract ? r.p.contract.amt : 0) },
          { key: 'yrs', label: 'Years left', num: true, value: r => yearsLeft(S, r.p), fmt: r => { const y = yearsLeft(S, r.p); return y <= 1 ? `<span class="tag warn">${y}</span>` : y; } },
          { key: 'val', label: 'Market value', num: true, value: r => PBC.Player.marketValue(r.p, L), fmt: r => U.money(PBC.Player.marketValue(r.p, L)) },
          { key: 'rook', label: 'Type', fmt: r => (r.p.contract && r.p.contract.rookie ? '<span class="tag info">Rookie</span>' : '') },
        ]);
      }
      UI.table(root.querySelector('#roster-tbl'), { rows, columns: cols, sort: 'ovr', compact: rosterTab === 'ratings', onRow: r => UI.openPlayer(r.p.id) });
    },
  });

  function yearsLeft(S, p) { return p.contract ? Math.max(0, p.contract.exp - S.season + (['preseason', 'regular', 'playin', 'playoffs'].includes(S.phase) ? 1 : 0)) : 0; }
  function ratingCell(v) { const c = v >= 85 ? 'good-t' : v >= 70 ? '' : v >= 55 ? 'muted' : 'bad-t'; return `<span class="${c} bold">${v}</span>`; }
  function moodIcon(m) { m = m == null ? 70 : m; return m >= 80 ? '😄' : m >= 62 ? '🙂' : m >= 45 ? '😐' : m >= 30 ? '😕' : '😠'; }

  // ---------------------------------------------------------------------------
  // Lineup & minutes
  // ---------------------------------------------------------------------------
  UI.register('lineup', {
    title: 'Lineup & Minutes',
    render(root) {
      const S = UI.S;
      const L = PBC.League.cfg(S);
      const team = S.teams[S.userTid];
      if (!team.rot || !team.rot.starters || team.rot.starters.length < 5) PBC.AI.autoRotation(S, S.userTid);
      const rot = team.rot;
      const roster = PBC.League.roster(S, S.userTid);
      const byId = id => S.players[id];
      // keep rot consistent with the roster
      rot.starters = rot.starters.filter(id => byId(id) && byId(id).tid === S.userTid);
      for (const p of roster) if (rot.minutes[p.id] == null) rot.minutes[p.id] = 0;
      for (const id of Object.keys(rot.minutes)) if (!byId(id) || byId(id).tid !== S.userTid) delete rot.minutes[id];
      while (rot.starters.length < 5) { const c = roster.find(p => !rot.starters.includes(p.id)); if (!c) break; rot.starters.push(c.id); }
      const total = U.sum(roster, p => rot.minutes[p.id] || 0);
      const order = rot.starters.map(byId).concat(U.sortBy(roster.filter(p => !rot.starters.includes(p.id)), p => (rot.minutes[p.id] || 0) * 100 + p.ovr, true));
      const posLabels = C.POSITIONS;
      root.innerHTML = `<div class="page">
        <div class="page-h"><div><h1>Lineup & Minutes</h1><div class="sub">Set your starting five, your rotation minutes and your go-to scorers. The game engine subs to match your minutes, fatigue and foul trouble.</div></div>
          <div class="actions"><button class="btn" data-act="auto">🤖 Auto-set</button><button class="btn" data-act="balance">⚖️ Balance to ${L.minutesTotal}</button></div></div>
        <div class="card accent"><div class="card-h"><h3>Starting five</h3><div class="actions"><span class="small muted">Positions are a guide — any player can start anywhere.</span></div></div>
          <div class="card-b"><div class="lineup-grid">${rot.starters.map((id, i) => {
            const p = byId(id);
            return `<div class="slot"><div class="slot-pos">${posLabels[i]}</div>${UI.avatar(p, 58)}<div class="nm">${UI.playerLink(p)}</div>
              <div class="row" style="justify-content:center">${UI.ovr(PBC.Player.ovrAt(p, posLabels[i]))}${p.injury ? '<span class="tag bad">INJ</span>' : ''}</div>
              <select class="inp" data-slot="${i}">${roster.map(q => `<option value="${q.id}" ${q.id === id ? 'selected' : ''}>${U.esc(PBC.Player.shortName(q))} · ${q.pos} · ${PBC.Player.ovrAt(q, posLabels[i])}${q.injury ? ' (INJ)' : ''}</option>`).join('')}</select></div>`;
          }).join('')}</div></div></div>
        <div class="grid g-main" style="margin-top:16px">
          <div class="card"><div class="card-h"><h3>Rotation minutes</h3><div class="actions"><span class="min-total ${Math.abs(total - L.minutesTotal) <= 2 ? 'good-t' : 'warn-t'}">${total}</span><span class="small muted">/ ${L.minutesTotal} min</span></div></div>
            <div class="card-b flush">${order.map((p, i) => `<div class="min-row">
              <span class="dim">${i < 5 ? '<span class="tag accent">S</span>' : i + 1}</span>
              <span class="row nowrap">${UI.avatar(p, 28)}<span class="ellip">${UI.playerLink(p)}<div class="tiny dim">${p.pos} · ${p.age}y${p.injury ? ' · <span class="bad-t">' + U.esc(PBC.Player.injuryLabel(p.injury)) + '</span>' : ''}</div></span></span>
              <span>${UI.ovr(p.ovr)}</span><span class="small muted hide-sm">STA ${p.r.stamina}</span>
              <input type="range" min="0" max="44" step="1" value="${rot.minutes[p.id] || 0}" data-min="${p.id}">
              <span class="mv" id="mv-${p.id}">${rot.minutes[p.id] || 0}</span></div>`).join('')}</div></div>
          <div class="stack">
            <div class="card"><div class="card-h"><h3>Go-to players</h3></div><div class="card-b">
              <p class="small muted" style="margin-top:0">Your go-to players get more touches and take the big shots in Game Impact Moments.</p>
              <label class="small muted">Option #1</label><select class="inp" data-goto="goTo1" style="width:100%;margin:4px 0 10px"><option value="">— Let the offense decide —</option>${roster.map(p => `<option value="${p.id}" ${team.strat.goTo1 === p.id ? 'selected' : ''}>${U.esc(PBC.Player.name(p))} (${p.ovr})</option>`).join('')}</select>
              <label class="small muted">Option #2</label><select class="inp" data-goto="goTo2" style="width:100%;margin-top:4px"><option value="">— Let the offense decide —</option>${roster.map(p => `<option value="${p.id}" ${team.strat.goTo2 === p.id ? 'selected' : ''}>${U.esc(PBC.Player.name(p))} (${p.ovr})</option>`).join('')}</select>
            </div></div>
            <div class="card"><div class="card-h"><h3>Rotation notes</h3></div><div class="card-b small">
              <ul style="margin:0;padding-left:18px;line-height:1.6">
                <li>Starters typically play 30–36 minutes; stars can push 38+ but tire faster and play worse late.</li>
                <li>Players with <b>0 minutes</b> only play in blowouts or if others foul out / get hurt.</li>
                <li>Low <b>stamina</b> players fade on long stints — give them fewer minutes.</li>
                <li>In close games the engine closes with your best five.</li>
              </ul></div></div>
          </div>
        </div></div>`;
      const markManual = () => { rot.auto = false; };
      UI.on(root, 'change', '[data-slot]', (e, el) => {
        const i = +el.dataset.slot, id = +el.value;
        const j = rot.starters.indexOf(id);
        if (j >= 0) rot.starters[j] = rot.starters[i];
        rot.starters[i] = id;
        if ((rot.minutes[id] || 0) < 24) rot.minutes[id] = 28;
        markManual(); UI.save(); UI.refresh();
      });
      UI.on(root, 'input', '[data-min]', (e, el) => {
        rot.minutes[+el.dataset.min] = +el.value;
        root.querySelector('#mv-' + el.dataset.min).textContent = el.value;
        const tot = U.sum(roster, p => rot.minutes[p.id] || 0);
        const tEl = root.querySelector('.min-total'); tEl.textContent = tot; tEl.className = 'min-total ' + (Math.abs(tot - L.minutesTotal) <= 2 ? 'good-t' : 'warn-t');
        markManual();
      });
      UI.on(root, 'change', '[data-min]', () => UI.save());
      UI.on(root, 'change', '[data-goto]', (e, el) => { team.strat[el.dataset.goto] = el.value ? +el.value : null; UI.save(); UI.toast('Go-to players updated', 'good'); });
      UI.on(root, 'click', '[data-act]', (e, el) => {
        if (el.dataset.act === 'auto') { PBC.AI.autoRotation(S, S.userTid); team.rot.auto = true; UI.save(); UI.refresh(); UI.toast('Rotation auto-set by your assistants', 'good'); }
        if (el.dataset.act === 'balance') {
          const tot = U.sum(roster, p => rot.minutes[p.id] || 0) || 1;
          let acc = 0;
          const list = roster.filter(p => rot.minutes[p.id] > 0);
          list.forEach(p => { rot.minutes[p.id] = Math.min(44, Math.round(rot.minutes[p.id] * L.minutesTotal / tot)); acc += rot.minutes[p.id]; });
          if (list.length) rot.minutes[list[0].id] += L.minutesTotal - acc;
          markManual(); UI.save(); UI.refresh();
        }
      });
    },
  });

  // ---------------------------------------------------------------------------
  // Strategy
  // ---------------------------------------------------------------------------
  function teamProfile(S, tid) {
    const top = PBC.League.roster(S, tid).filter(p => !p.injury).slice(0, 8);
    const avg = k => U.avg(top, p => p.r[k]);
    return {
      Shooting: (avg('three') + avg('mid')) / 2, Inside: (avg('close') + avg('layup') + avg('dunk') + avg('post')) / 4,
      Playmaking: (avg('pass') + avg('vision') + avg('handle')) / 3, 'Perimeter D': (avg('perD') + avg('steal')) / 2,
      'Rim Protection': (Math.max(...top.map(p => p.r.block)) + avg('intD')) / 2, Rebounding: (avg('dreb') + avg('oreb')) / 2,
      Athleticism: (avg('speed') + avg('vert') + avg('agility')) / 3, IQ: (avg('shotIQ') + avg('helpD')) / 2,
    };
  }
  UI.teamProfile = teamProfile;

  function fitFor(S, kind, key) {
    const top = PBC.League.roster(S, S.userTid).filter(p => !p.injury).slice(0, 8);
    const avg = k => U.avg(top, p => p.r[k]);
    const best = k => Math.max(...top.map(p => p.r[k]));
    let score = 0;
    if (kind === 'off') {
      const m = C.OFFENSES[key].mods;
      if (m.needs === 'three' || key === 'paceSpace') score = (avg('three') - 67) / 5;
      else if (m.needs === 'iq') score = ((avg('shotIQ') + avg('vision') + avg('pass')) / 3 - 66) / 4;
      else if (m.needs === 'post' || key === 'postUp') score = (best('post') - 72) / 5;
      else if (m.needs === 'speed' || key === 'runGun') score = (avg('speed') - 72) / 4;
      else if (key === 'heliocentric' || key === 'iso') score = (Math.max(...top.map(p => PBC.Sim.scoreSkill(p.r))) - 80) / 4;
      else if (key === 'pnrHeavy') score = ((best('handle') + best('pass')) / 2 - 78) / 4;
      else if (key === 'gritGrind') score = (avg('strength') + avg('oreb') - 130) / 8;
      else score = 0.5;
    } else {
      if (key === 'switch') score = (Math.min(...top.slice(0, 6).map(p => p.r.perD)) - 55) / 5;
      else if (key === 'drop') score = (best('block') - 74) / 5;
      else if (key === 'blitz' || key === 'pressure' || key === 'press') score = (avg('steal') + avg('speed') - 128) / 7;
      else if (key.startsWith('zone') || key === 'packline') score = 0.3 + (avg('intD') - 60) / 10;
      else if (key === 'nothree') score = (avg('perD') - 64) / 5;
      else score = 0.5;
    }
    score = U.clamp(score, -2, 2);
    return score >= 1 ? ['Great fit', 'good'] : score >= 0.2 ? ['Good fit', 'good'] : score >= -0.6 ? ['OK fit', 'info'] : ['Poor fit', 'bad'];
  }

  UI.register('strategy', {
    title: 'Strategy',
    render(root) {
      const S = UI.S;
      const team = S.teams[S.userTid];
      const st = team.strat;
      const prof = teamProfile(S, S.userTid);
      const seg = (key, obj) => `<div class="seg">${Object.keys(obj).map(k => `<button class="${st[key] === k ? 'on' : ''}" data-set="${key}" data-val="${k}">${obj[k].label}</button>`).join('')}</div>`;
      root.innerHTML = `<div class="page">
        <div class="page-h"><div><h1>Strategy</h1><div class="sub">Choose your systems. Fit depends on your personnel — a system your players can't run hurts you.</div></div>
          <div class="actions"><button class="btn" data-act="auto">🤖 Suggest for my roster</button></div></div>
        <div class="grid g-main">
          <div class="stack">
            <div class="card"><div class="card-h"><h3>Offensive system</h3></div><div class="card-b"><div class="strat-grid">${Object.keys(C.OFFENSES).map(k => {
              const o = C.OFFENSES[k], f = fitFor(S, 'off', k);
              return `<div class="strat-card ${st.off === k ? 'on' : ''}" data-off="${k}"><div class="sc-t">${o.icon} ${o.label}</div><div class="sc-d">${o.desc}</div><div class="fit"><span class="tag ${f[1]}">${f[0]}</span></div></div>`;
            }).join('')}</div></div></div>
            <div class="card"><div class="card-h"><h3>Defensive scheme</h3></div><div class="card-b"><div class="strat-grid">${Object.keys(C.DEFENSES).map(k => {
              const o = C.DEFENSES[k], f = fitFor(S, 'def', k);
              return `<div class="strat-card ${st.def === k ? 'on' : ''}" data-def="${k}"><div class="sc-t">${o.icon} ${o.label}</div><div class="sc-d">${o.desc}</div><div class="fit"><span class="tag ${f[1]}">${f[0]}</span></div></div>`;
            }).join('')}</div></div></div>
          </div>
          <div class="stack">
            <div class="card accent"><div class="card-h"><h3>Game plan</h3></div><div class="card-b col" style="gap:14px">
              <div><div class="small muted up" style="margin-bottom:6px">Tempo</div>${seg('tempo', C.TEMPOS)}</div>
              <div><div class="small muted up" style="margin-bottom:6px">Shot focus</div>${seg('focus', C.FOCUS)}</div>
              <div><div class="small muted up" style="margin-bottom:6px">Offensive glass</div>${seg('crash', C.CRASH)}</div>
              <div><div class="small muted up" style="margin-bottom:6px">Defensive pressure</div>${seg('pressure', C.PRESSURE)}</div>
              <label class="chk"><input type="checkbox" id="auto-to" ${S.settings.autoTimeouts !== false ? 'checked' : ''}> Assistants call timeouts to stop runs</label>
            </div></div>
            <div class="card"><div class="card-h"><h3>Team profile</h3><div class="actions"><span class="small muted">Top 8 healthy players</span></div></div><div class="card-b">
              ${Object.keys(prof).map(k => UI.ratingBar(k, Math.round(prof[k]))).join('<div style="height:6px"></div>')}</div></div>
          </div>
        </div></div>`;
      UI.on(root, 'click', '[data-off]', (e, el) => { st.off = el.dataset.off; UI.save(); UI.refresh(); });
      UI.on(root, 'click', '[data-def]', (e, el) => { st.def = el.dataset.def; UI.save(); UI.refresh(); });
      UI.on(root, 'click', '[data-set]', (e, el) => { st[el.dataset.set] = el.dataset.val; UI.save(); UI.refresh(); });
      root.querySelector('#auto-to').onchange = e => { S.settings.autoTimeouts = e.target.checked; UI.save(); };
      UI.on(root, 'click', '[data-act="auto"]', () => {
        const keep = { goTo1: st.goTo1, goTo2: st.goTo2 };
        PBC.AI.chooseStrategy(S, S.userTid);
        Object.assign(team.strat, keep);
        UI.save(); UI.refresh(); UI.toast('Your assistants drew up a game plan for this roster', 'good');
      });
    },
  });

  // ---------------------------------------------------------------------------
  // Practice
  // ---------------------------------------------------------------------------
  const FALLBACK_DRILLS = [
    { key: 'shooting', name: 'Catch & Shoot', icon: '🎯', desc: 'Time your release on 10 catch-and-shoot jumpers.' },
    { key: 'freethrows', name: 'Pressure Free Throws', icon: '🧊', desc: 'Knock down free throws with the crowd in your ear.' },
    { key: 'finishing', name: 'Attack the Rim', icon: '💥', desc: 'Nail the gather and the release on drives.' },
    { key: 'passing', name: 'Find the Open Man', icon: '🎁', desc: 'Hit the cutter before the window closes.' },
    { key: 'ballhandling', name: 'Combo Dribble', icon: '🌀', desc: 'Chain dribble moves in rhythm.' },
    { key: 'defense', name: 'Slide Drill', icon: '🛡️', desc: 'React to the ball handler — don\'t bite on fakes.' },
    { key: 'rebounding', name: 'Box Out & Board', icon: '🧱', desc: 'Read the miss and get to the landing spot.' },
    { key: 'conditioning', name: 'Suicides', icon: '🫀', desc: 'Keep your stamina in the zone.' },
  ];
  const prac = { drill: 'shooting', focus: [] };

  UI.register('practice', {
    title: 'Practice',
    render(root) {
      const S = UI.S;
      const drills = (PBC.Mini && PBC.Mini.DRILLS && PBC.Mini.DRILLS.length) ? PBC.Mini.DRILLS : FALLBACK_DRILLS;
      const roster = PBC.League.roster(S, S.userTid).filter(p => !p.injury);
      prac.focus = prac.focus.filter(id => roster.some(p => p.id === id));
      const avail = PBC.Season.practiceAvailable(S);
      const log = (S.practice && S.practice.log) || [];
      const trains = (drills.find(d => d.key === prac.drill) || {}).trains || PBC.Season.DRILL_TRAINS[prac.drill] || [];
      root.innerHTML = `<div class="page">
        <div class="page-h"><div><h1>Weekly Practice</h1><div class="sub">One session per week. Your score in the drill decides how much your players improve. Focus players improve three times as fast.</div></div></div>
        ${S.phase !== 'regular' ? '<div class="card"><div class="empty">Practice runs during the regular season.</div></div>' : !avail ? `<div class="card"><div class="empty">✅ This week's practice is done. Come back next week.</div></div>` : `
        <div class="card"><div class="card-h"><h3>1 · Choose a drill</h3></div><div class="card-b"><div class="drill-grid">${drills.map(d => `
          <div class="drill ${prac.drill === d.key ? 'on' : ''}" data-drill="${d.key}"><div class="di">${d.icon || '🏀'}</div><div class="up" style="font-size:16px;margin-top:4px">${U.esc(d.name)}</div>
          <div class="small muted">${U.esc(d.desc || '')}</div><div class="tiny" style="margin-top:6px;color:var(--accent)">Trains: ${((d.trains || PBC.Season.DRILL_TRAINS[d.key] || []).map(k => (C.RATINGS.find(r => r.key === k) || {}).label || k)).join(', ')}</div></div>`).join('')}</div></div></div>
        <div class="card" style="margin-top:16px"><div class="card-h"><h3>2 · Pick up to 3 focus players</h3><div class="actions"><span class="small muted">${prac.focus.length}/3</span></div></div><div class="card-b">
          <div class="focus-pick">${roster.map(p => `<div class="fp ${prac.focus.includes(p.id) ? 'on' : ''}" data-fp="${p.id}">${UI.avatar(p, 26)}${U.esc(PBC.Player.shortName(p))} ${UI.ovr(p.ovr)}${p.age <= 23 ? ' <span class="tag info">young</span>' : ''}</div>`).join('')}</div>
          <p class="hint">Young players, high-potential players and hard workers improve fastest. Trained ratings: ${trains.map(k => (C.RATINGS.find(r => r.key === k) || {}).label || k).join(', ')}.</p></div></div>
        <div class="row" style="margin-top:16px"><button class="btn primary xl" data-act="start">▶ Start Practice</button><button class="btn lg ghost" data-act="assist">Let assistants run it (lower gains)</button></div>
        <div id="practice-stage" style="margin-top:16px"></div>`}
        ${log.length ? `<div class="card" style="margin-top:16px"><div class="card-h"><h3>Practice log</h3></div><div class="card-b flush"><table class="tbl compact"><thead><tr><th>Season</th><th>Week</th><th>Drill</th><th class="num">Score</th><th class="num">Rating bumps</th></tr></thead><tbody>
          ${log.slice(0, 12).map(l => `<tr><td>${U.seasonLabel(l.season)}</td><td>${l.week + 1}</td><td>${U.esc(l.auto ? 'Assistants' : (drills.find(d => d.key === l.drill) || {}).name || l.drill)}</td><td class="num">${l.score}</td><td class="num">${l.gains}</td></tr>`).join('')}</tbody></table></div></div>` : ''}
      </div>`;
      UI.on(root, 'click', '[data-drill]', (e, el) => { prac.drill = el.dataset.drill; UI.refresh(); });
      UI.on(root, 'click', '[data-fp]', (e, el) => {
        const id = +el.dataset.fp;
        if (prac.focus.includes(id)) prac.focus = prac.focus.filter(x => x !== id);
        else if (prac.focus.length < 3) prac.focus.push(id);
        else { UI.toast('Up to 3 focus players', 'info'); return; }
        UI.refresh();
      });
      UI.on(root, 'click', '[data-act]', async (e, el) => {
        const a = el.dataset.act;
        if (a === 'assist') { const gains = PBC.Season.applyPractice(S, 'auto', 60, prac.focus, true); UI.save(); showGains(S, gains, 60); UI.refresh(); return; }
        if (a === 'start') {
          const stage = root.querySelector('#practice-stage');
          let res;
          if (PBC.Mini && PBC.Mini.runDrill) {
            stage.innerHTML = '<div class="mini-stage" id="mini-stage"></div>';
            stage.scrollIntoView({ behavior: 'smooth', block: 'center' });
            try {
              res = await PBC.Mini.runDrill(stage.querySelector('#mini-stage'), prac.drill, { difficulty: 0.5, players: prac.focus.map(id => PBC.Player.shortName(S.players[id])) });
            } catch (err) { console.error(err); res = { score: 60 }; }
            if (res && res.cancelled) { stage.innerHTML = ''; UI.toast('Practice cancelled', 'info'); return; }
          } else {
            res = { score: Math.round(U.range(55, 95)) };
          }
          const score = U.clamp(res.score || 0, 0, 100);
          const gains = PBC.Season.applyPractice(S, prac.drill, score, prac.focus, false);
          UI.save();
          showGains(S, gains, score, res.grade);
          UI.refresh();
        }
      });
    },
  });

  function showGains(S, gains, score, grade) {
    const byP = U.groupBy(gains, g => g.pid);
    UI.modal({
      title: `Practice complete — ${grade || ''} ${Math.round(score)}/100`,
      body: gains.length ? `<div class="list">${Object.keys(byP).map(pid => { const p = S.players[pid]; return `<div class="li">${UI.avatar(p, 30)}<div style="flex:1">${UI.playerLink(p)}</div><div class="row">${byP[pid].map(g => `<span class="tag good">${(C.RATINGS.find(r => r.key === g.key) || {}).short || g.key} ${g.from}→${g.to}</span>`).join('')}</div></div>`; }).join('')}</div>`
        : '<div class="empty">No ratings ticked up this time, but the work adds up — progress carries over to next week.</div>',
      actions: [{ label: 'Nice', cls: 'primary' }],
    });
  }
})();
