/* Pro BBALL Coach — app bootstrap, title screen, new career, home dashboard, season flow actions. */
(function () {
  'use strict';
  const PBC = window.PBC;
  const U = PBC.U, C = PBC.Config, UI = PBC.UI;
  const App = {};

  const inSeason = S => S.phase === 'regular' || S.phase === 'playin' || S.phase === 'playoffs';

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------
  App.start = function () {
    UI.boot();
    const nav = [
      { key: 'home', label: 'Home', icon: '🏠', group: 'Team' },
      { key: 'roster', label: 'Roster', icon: '👥', group: 'Team' },
      { key: 'lineup', label: 'Lineup & Minutes', icon: '📋', group: 'Team' },
      { key: 'strategy', label: 'Strategy', icon: '🧠', group: 'Team' },
      { key: 'practice', label: 'Practice', icon: '🏋️', group: 'Team', dot: S => PBC.Season.practiceAvailable(S) },
      { key: 'schedule', label: 'Schedule', icon: '📅', group: 'Season' },
      { key: 'standings', label: 'Standings', icon: '📊', group: 'Season' },
      { key: 'playoffs', label: 'Playoffs', icon: '🏆', group: 'Season', show: S => !!S.playoffs },
      { key: 'stats', label: 'Stats & Leaders', icon: '📈', group: 'League' },
      { key: 'teams', label: 'Teams', icon: '🏟️', group: 'League' },
      { key: 'records', label: 'Records & History', icon: '📜', group: 'League' },
      { key: 'career', label: 'My Career', icon: '🎖️', group: 'Career' },
      { key: 'settings', label: 'Settings', icon: '⚙️', group: 'Career' },
    ];
    nav.forEach(n => UI.addNav(n));
    registerPhases();
    UI.go('title');
  };

  function registerPhases() {
    UI.registerPhase('preseason', { label: 'Tip Off Season', run: S => App.tipOff() });
    const seasonCont = {
      label: S => {
        const ug = PBC.Season.userGameToday(S);
        if (ug) return 'Play Game';
        if (S.phase !== 'regular' && !PBC.Season.userInPostseason(S)) return 'Sim Playoffs';
        return 'Next Game';
      },
      run: S => App.goToNextGame(),
    };
    UI.registerPhase('regular', seasonCont);
    UI.registerPhase('playin', seasonCont);
    UI.registerPhase('playoffs', seasonCont);
    UI.registerPhase('postseason_done', { label: 'Season Recap', screen: 'recap' });
    UI.registerPhase('awards', {
      label: () => (UI.current().key === 'recap' ? 'Begin Offseason' : 'Season Recap'),
      run: S => (UI.current().key === 'recap' ? App.beginOffseason(S) : UI.go('recap')),
    });
  }

  App.beginOffseason = async function (S) {
    if (S.coach && S.coach.status === 'unemployed') { UI.go('jobs'); return; }
    if (PBC.Offseason && PBC.Offseason.begin) {
      await UI.busy('The offseason begins…', () => PBC.Offseason.begin(S));
      UI.save();
      const ph = UI.phaseDef(S.phase);
      if (ph && ph.screen) UI.go(ph.screen); else UI.go('home');
      return;
    }
    if (!(await UI.confirm('Run the offseason automatically? Aging, development, retirements, re-signings, the draft and free agency are handled by your front office.', { ok: 'Run offseason' }))) return;
    await UI.busy('Running the offseason…', () => PBC.fallbackOffseason(S));
    UI.save();
    UI.go('home'); // the home screen opens the new season's preview magazine
  };

  App.tipOff = function () {
    const S = UI.S;
    PBC.Season.startRegularSeason(S);
    UI.save();
    UI.go('home');
    UI.toast('The season is underway! 🏀', 'good');
  };

  /** Advance to the user's next game day and open the pregame screen. */
  App.goToNextGame = async function () {
    const S = UI.S;
    if (!inSeason(S)) { UI.go('home'); return; }
    PBC.Season.prepareToday(S);
    let ug = PBC.Season.userGameToday(S);
    if (!ug) {
      if (S.phase !== 'regular' && !PBC.Season.userInPostseason(S)) { await App.simRestOfPostseason(); return; }
      ug = await UI.busy('Simulating to your next game…', () => PBC.Season.advanceToUserGame(S));
      if (App.checkFired()) return;
      UI.save();
    }
    if (!ug) { UI.go(S.phase === 'awards' ? 'recap' : 'home'); return; }
    UI.go('pregame', { gid: ug.gid });
  };

  App.checkFired = function () {
    const S = UI.S;
    if (S.coach && S.coach.pendingFire) { PBC.Coach.fireNow(S); UI.save(); UI.go('jobs'); return true; }
    return false;
  };

  /** Quick-sim the user's next game (and the rest of that day). */
  App.quickSimNext = async function () {
    const S = UI.S;
    const box = await UI.busy('Simulating game…', () => {
      PBC.Season.prepareToday(S);
      let ug = PBC.Season.userGameToday(S) || PBC.Season.advanceToUserGame(S);
      if (!ug) return null;
      const b = PBC.Season.quickSim(S, ug);
      PBC.Season.simDay(S, { skipUser: true });
      return b;
    });
    if (App.checkFired()) return;
    UI.save();
    if (box) App.resultToast(box);
    UI.go(S.phase === 'awards' ? 'recap' : 'home');
  };

  App.resultToast = function (box) {
    const S = UI.S;
    const u = box.h === S.userTid ? 0 : 1;
    const my = u === 0 ? box.hs : box.as, th = u === 0 ? box.as : box.hs;
    const opp = S.teams[u === 0 ? box.a : box.h];
    UI.toast(`${my > th ? '✅ WIN' : '❌ LOSS'} ${my}-${th} vs ${opp.abbr} · <a class="link" data-open-box="${box.gid}">Box score</a>`, my > th ? 'good' : 'bad');
  };

  /** Sim n days (regular season or postseason). stopOnUserGame: stop before the user's game. */
  App.simDays = async function (n, label) {
    const S = UI.S;
    await UI.busy(label || 'Simulating…', () => {
      for (let i = 0; i < n; i++) {
        if (!inSeason(S)) break;
        PBC.Season.prepareToday(S);
        PBC.Season.simDay(S);
        if (S.coach && S.coach.pendingFire) break;
      }
    });
    if (App.checkFired()) return;
    UI.save();
    UI.go(S.phase === 'awards' ? 'recap' : 'home');
  };

  App.simToEndOfRegular = async function () {
    const S = UI.S;
    if (!(await UI.confirm('Simulate the rest of the regular season? Your games will be quick-simmed and practice will be run by your assistants.', { ok: 'Sim it' }))) return;
    await UI.busy('Simulating the regular season…', () => {
      let guard = 0;
      while (S.phase === 'regular' && guard++ < 400) {
        PBC.Season.simDay(S);
        if (S.coach && S.coach.pendingFire) break;
      }
    });
    if (App.checkFired()) return;
    UI.save();
    UI.go('home');
  };

  App.simRestOfPostseason = async function () {
    const S = UI.S;
    await UI.busy('Simulating the playoffs…', () => {
      let guard = 0;
      while ((S.phase === 'playin' || S.phase === 'playoffs' || S.phase === 'postseason_done') && guard++ < 200) {
        PBC.Season.prepareToday(S);
        if (PBC.Season.userGameToday(S) && PBC.Season.userInPostseason(S)) break;
        PBC.Season.simDay(S);
      }
    });
    UI.save();
    UI.go(S.phase === 'awards' ? 'recap' : 'home');
  };

  App.simSeries = async function () {
    const S = UI.S;
    await UI.busy('Simulating the series…', () => {
      let guard = 0;
      const startRound = S.playoffs ? S.playoffs.round : 0;
      const phase0 = S.phase;
      while ((S.phase === 'playin' || S.phase === 'playoffs') && guard++ < 20) {
        PBC.Season.prepareToday(S);
        PBC.Season.simDay(S);
        if (!S.playoffs || S.phase !== phase0 || S.playoffs.round !== startRound) break;
        if (!PBC.Season.userInPostseason(S)) break;
      }
    });
    UI.save();
    UI.go(S.phase === 'awards' ? 'recap' : 'home');
  };

  // ---------------------------------------------------------------------------
  // Title screen
  // ---------------------------------------------------------------------------
  UI.register('title', {
    title: 'Welcome', fullscreen: true,
    async render(root) {
      root.innerHTML = `<div class="title-screen">
        <div class="ts-court">${courtSvg()}</div>
        <div class="ts-inner">
          <div class="ts-logo">${UI.logo(88)}</div>
          <h1 class="ts-title">PRO BBALL<span>COACH</span></h1>
          <p class="ts-tag">Be the coach. Run the franchise. Hit the big shot.</p>
          <div class="ts-btns">
            <button class="btn primary xl" data-act="new">New Career</button>
            <div id="ts-continue"></div>
            <div class="row" style="justify-content:center">
              <button class="btn lg" data-act="load">Load Career</button>
              <button class="btn lg ghost" data-act="import">Import Save File</button>
            </div>
          </div>
          <div class="ts-feats">
            <span>Men's & Women's pro leagues</span><span>27 player ratings</span><span>24 offensive & defensive systems</span>
            <span>Live game engine</span><span>Game Impact Moments</span><span>Weekly practice mini-games</span>
            <span>Draft, free agency & trades</span><span>Stats, records & Hall of Fame</span>
          </div>
        </div>
        <input type="file" id="import-file" accept=".json,application/json" hidden>
      </div>`;
      UI.on(root, 'click', '[data-act]', (ev, el) => {
        const a = el.dataset.act;
        if (a === 'new') UI.go('newgame');
        if (a === 'load') App.loadDialog();
        if (a === 'import') root.querySelector('#import-file').click();
        if (a === 'continue') App.loadCareer(el.dataset.id);
      });
      root.querySelector('#import-file').onchange = async e => {
        const f = e.target.files[0];
        if (!f) return;
        try {
          const S = PBC.Store.importString(await f.text());
          UI.setState(S);
          await UI.save(true);
          UI.toast('Save imported!', 'good');
          UI.go('home');
        } catch (err) { UI.toast('Could not import: ' + err.message, 'bad'); }
      };
      const list = await PBC.Store.list();
      const cont = root.querySelector('#ts-continue');
      if (list.length && cont) {
        const m = list[0];
        cont.innerHTML = `<button class="btn lg block ts-cont" data-act="continue" data-id="${m.id}">
          <span style="width:12px;height:12px;border-radius:3px;background:${m.color};display:inline-block"></span>
          Continue — ${U.esc(m.coach)} · ${U.esc(m.team)} · ${U.seasonLabel(m.season)} ${m.record ? '(' + m.record + ')' : ''}</button>`;
      }
    },
  });

  function courtSvg() {
    return `<svg viewBox="0 0 940 500" preserveAspectRatio="xMidYMid slice"><g fill="none" stroke="rgba(255,255,255,.07)" stroke-width="3">
      <rect x="10" y="10" width="920" height="480" rx="4"/><line x1="470" y1="10" x2="470" y2="490"/><circle cx="470" cy="250" r="60"/><circle cx="470" cy="250" r="20"/>
      <rect x="10" y="170" width="190" height="160"/><rect x="740" y="170" width="190" height="160"/><circle cx="200" cy="250" r="60"/><circle cx="740" cy="250" r="60"/>
      <path d="M10 30 H150 A237 237 0 0 1 150 470 H10"/><path d="M930 30 H790 A237 237 0 0 0 790 470 H930"/>
      <circle cx="62" cy="250" r="8"/><circle cx="878" cy="250" r="8"/></g></svg>`;
  }

  App.loadDialog = async function () {
    const list = await PBC.Store.list();
    const body = list.length ? `<div class="list">${list.map(m => `
      <div class="li"><span style="width:10px;height:36px;border-radius:4px;background:${m.color}"></span>
        <div style="flex:1;min-width:0"><div class="bold">${U.esc(m.coach)} — ${U.esc(m.team)}</div>
        <div class="small muted">${U.seasonLabel(m.season)} · ${U.esc(m.phase)} · ${m.record || ''} · Career ${m.career || ''}${m.titles ? ' · 🏆×' + m.titles : ''} · ${m.leagueKey === 'women' ? "Women's" : "Men's"} · ${new Date(m.updated).toLocaleString()}</div></div>
        <button class="btn sm primary" data-load="${m.id}">Load</button><button class="btn sm danger" data-del="${m.id}">Delete</button></div>`).join('')}</div>` : '<div class="empty">No saved careers yet.</div>';
    const m = UI.modal({ title: 'Load Career', body, wide: true });
    UI.on(m.body, 'click', '[data-load]', (e, el) => { m.close(); App.loadCareer(el.dataset.load); });
    UI.on(m.body, 'click', '[data-del]', async (e, el) => {
      if (!(await UI.confirm('Delete this career permanently?', { ok: 'Delete', danger: true }))) return;
      await PBC.Store.remove(el.dataset.del);
      m.close(); App.loadDialog();
    });
  };

  App.loadCareer = async function (id) {
    const S = await UI.busy('Loading career…', () => PBC.Store.load(id));
    if (!S) { UI.toast('Could not load that save.', 'bad'); return; }
    UI.setState(S);
    UI.go('home');
  };

  // ---------------------------------------------------------------------------
  // New career wizard
  // ---------------------------------------------------------------------------
  const DIFFS = [
    { key: 'easy', label: 'Rookie', desc: 'Patient owners and friendlier trade & free-agent talks.' },
    { key: 'normal', label: 'Pro', desc: 'The standard experience. Win and you stay.' },
    { key: 'hard', label: 'All-Star', desc: 'Impatient owners, tough negotiations.' },
    { key: 'legend', label: 'Hall of Fame', desc: 'Win now or you are gone. Good luck.' },
  ];
  const wiz = { step: 1, leagueKey: 'men', seasonGames: 82, difficulty: 'normal', coachName: '', S: null, sel: null, conf: 'all' };

  UI.register('newgame', {
    title: 'New Career', fullscreen: true,
    render(root) {
      if (!wiz.coachName) wiz.coachName = 'Coach ' + U.pick(PBC.Names.last);
      if (wiz.step === 1) renderStep1(root); else renderStep2(root);
    },
  });

  function renderStep1(root) {
    const L = C.LEAGUES[wiz.leagueKey];
    if (!L.seasonLengths.includes(wiz.seasonGames)) wiz.seasonGames = L.seasonLengths[0];
    root.innerHTML = `<div class="wiz">
      <div class="wiz-top"><button class="btn ghost" data-act="back">‹ Back</button><div class="wiz-steps"><b class="on">1 · League</b><b>2 · Team</b></div></div>
      <div class="wiz-body">
        <h1 class="wiz-h">Start your coaching career</h1>
        <div class="card"><div class="card-b" style="padding-top:16px">
          <label class="small muted up" style="letter-spacing:1px">Your name</label>
          <input class="inp" id="coach-name" value="${U.esc(wiz.coachName)}" maxlength="28" style="width:100%;font-size:18px;margin-top:6px">
        </div></div>
        <h3 class="up wiz-sec">Choose a league</h3>
        <div class="grid g2">
          ${['men', 'women'].map(k => { const l = C.LEAGUES[k]; return `
          <div class="league-card ${wiz.leagueKey === k ? 'on' : ''}" data-league="${k}">
            <div class="lc-ico">${k === 'men' ? '🏀' : '⛹️‍♀️'}</div>
            <div><div class="up" style="font-size:22px">${l.label}</div>
            <div class="muted small">${l.teamsList.length} teams · ${l.seasonLengths[0]}-game season · ${l.quarterLen / 60}-minute quarters · ${l.playoffTeams}-team playoffs${l.playIn ? ' + play-in' : ''}</div></div></div>`; }).join('')}
        </div>
        <h3 class="up wiz-sec">Season length</h3>
        <div class="seg" id="len">${L.seasonLengths.map(n => `<button class="${wiz.seasonGames === n ? 'on' : ''}" data-len="${n}">${n} games${n === L.seasonLengths[0] ? ' (full)' : ''}</button>`).join('')}</div>
        <h3 class="up wiz-sec">Difficulty</h3>
        <div class="grid g4">${DIFFS.map(d => `<div class="diff-card ${wiz.difficulty === d.key ? 'on' : ''}" data-diff="${d.key}"><div class="up" style="font-size:18px">${d.label}</div><div class="small muted">${d.desc}</div></div>`).join('')}</div>
        <div class="row" style="justify-content:flex-end;margin-top:26px"><button class="btn primary xl" data-act="next">Choose Your Team ▸</button></div>
      </div></div>`;
    root.querySelector('#coach-name').oninput = e => { wiz.coachName = e.target.value; };
    UI.on(root, 'click', '[data-league]', (e, el) => { wiz.leagueKey = el.dataset.league; wiz.S = null; UI.refresh(); });
    UI.on(root, 'click', '[data-len]', (e, el) => { wiz.seasonGames = +el.dataset.len; wiz.S = null; UI.refresh(); });
    UI.on(root, 'click', '[data-diff]', (e, el) => { wiz.difficulty = el.dataset.diff; if (wiz.S) wiz.S.difficulty = wiz.difficulty; UI.refresh(); });
    UI.on(root, 'click', '[data-act]', async (e, el) => {
      if (el.dataset.act === 'back') { UI.go('title'); return; }
      if (el.dataset.act === 'next') {
        wiz.coachName = (root.querySelector('#coach-name').value || '').trim() || 'Coach';
        if (!wiz.S) wiz.S = await UI.busy('Generating the league…', () => PBC.League.create({ leagueKey: wiz.leagueKey, seasonGames: wiz.seasonGames, difficulty: wiz.difficulty }));
        wiz.step = 2; wiz.sel = null;
        UI.refresh();
      }
    });
  }

  function tierOf(rank, n) {
    const f = rank / n;
    if (f < 0.14) return { t: 'Contender', c: 'gold' };
    if (f < 0.4) return { t: 'Playoff team', c: 'good' };
    if (f < 0.65) return { t: 'Bubble team', c: 'info' };
    if (f < 0.85) return { t: 'Rebuilding', c: 'warn' };
    return { t: 'Lottery bound', c: 'bad' };
  }

  function renderStep2(root) {
    const S = wiz.S;
    S.difficulty = wiz.difficulty;
    const L = PBC.League.cfg(S);
    const ranked = U.sortBy(S.teams, t => PBC.League.teamStrength(S, t.id), true);
    const rankOf = {}; ranked.forEach((t, i) => { rankOf[t.id] = i; });
    const teams = ranked.filter(t => wiz.conf === 'all' || String(t.conf) === wiz.conf);
    const sel = wiz.sel != null ? S.teams[wiz.sel] : null;
    root.innerHTML = `<div class="wiz">
      <div class="wiz-top"><button class="btn ghost" data-act="back">‹ Back</button><div class="wiz-steps"><b>1 · League</b><b class="on">2 · Team</b></div>
        <div class="spacer"></div><button class="btn ghost sm" data-act="regen">🎲 New random league</button></div>
      <div class="wiz-body wide">
        <div class="row" style="align-items:flex-end;margin-bottom:12px"><h1 class="wiz-h" style="margin:0">Pick your team</h1><div class="spacer"></div>
          <div class="seg">${[['all', 'All'], ['0', L.confs[0]], ['1', L.confs[1]]].map(([k, l]) => `<button class="${wiz.conf === k ? 'on' : ''}" data-conf="${k}">${l}</button>`).join('')}</div></div>
        <div class="pick-layout">
          <div class="team-grid">${teams.map(t => {
            const tier = tierOf(rankOf[t.id], S.teams.length);
            const star = PBC.League.roster(S, t.id)[0];
            return `<div class="team-card ${wiz.sel === t.id ? 'on' : ''}" data-tid="${t.id}" style="--tc:${t.colors.primary};--tc2:${t.colors.secondary}">
              <div class="row nowrap">${UI.teamBadge(t, 44)}<div style="min-width:0"><div class="tc-city">${U.esc(t.city)}</div><div class="tc-name">${U.esc(t.name)}</div></div>
                <div class="spacer"></div><div class="center"><div class="tc-ovr">${Math.round(PBC.League.teamStrength(S, t.id))}</div><div class="tiny dim">TEAM</div></div></div>
              <div class="row nowrap" style="margin-top:10px">${UI.avatar(star, 30)}<div class="small ellip" style="flex:1">${U.esc(PBC.Player.shortName(star))} <span class="dim">${star.pos}</span></div>${UI.ovr(star.ovr)}</div>
              <div class="row" style="margin-top:8px"><span class="tag ${tier.c}">${tier.t}</span><span class="tag">${'★'.repeat(t.market)}${'☆'.repeat(5 - t.market)} market</span></div>
            </div>`;
          }).join('')}</div>
          <div class="pick-detail">${sel ? teamDetail(S, sel, tierOf(rankOf[sel.id], S.teams.length)) : '<div class="card"><div class="empty">Select a team to see its roster, payroll and what the owner expects.</div></div>'}</div>
        </div>
      </div></div>`;
    UI.on(root, 'click', '[data-tid]', (e, el) => {
      wiz.sel = +el.dataset.tid;
      const scroller = root.querySelector('.wiz'); const y = scroller ? scroller.scrollTop : 0;
      UI.refresh();
      const w2 = document.querySelector('#fullscreen .wiz'); if (w2) w2.scrollTop = y;
      if (window.innerWidth < 1000) { const d = document.querySelector('#fullscreen .pick-detail'); if (d) d.scrollIntoView({ behavior: 'smooth' }); }
    });
    UI.on(root, 'click', '[data-conf]', (e, el) => { wiz.conf = el.dataset.conf; UI.refresh(); });
    UI.on(root, 'click', '[data-act]', async (e, el) => {
      const a = el.dataset.act;
      if (a === 'back') { wiz.step = 1; UI.refresh(); }
      if (a === 'regen') { wiz.S = await UI.busy('Generating a new league…', () => PBC.League.create({ leagueKey: wiz.leagueKey, seasonGames: wiz.seasonGames, difficulty: wiz.difficulty })); wiz.sel = null; UI.refresh(); }
      if (a === 'start') App.beginCareer();
    });
  }

  function teamDetail(S, t, tier) {
    const L = PBC.League.cfg(S);
    const roster = PBC.League.roster(S, t.id);
    const payroll = PBC.AI.payroll(S, t.id);
    const ranks = U.sortBy(S.teams, x => PBC.League.teamStrength(S, x.id), true).map(x => x.id);
    const rank = ranks.indexOf(t.id);
    const goal = rank < 4 ? 'Win the championship' : rank < 9 ? 'Win a playoff series' : rank < 16 ? 'Make the playoffs' : rank < 22 ? 'Compete for a play-in spot' : 'Develop the young core';
    return `<div class="card accent" style="--team:${t.colors.primary}">
      <div class="card-h">${UI.teamBadge(t, 52)}<div><div class="up" style="font-size:22px">${U.esc(t.city)} ${U.esc(t.name)}</div>
        <div class="small muted">${L.playoffFormat === 'conference' ? L.confs[t.conf] + ' · ' + L.divs[t.div] : L.confs[t.conf]} · <span class="tag ${tier.c}">${tier.t}</span></div></div></div>
      <div class="card-b">
        <div class="stats-row" style="margin-bottom:12px">
          <div class="stat"><div class="v">${Math.round(PBC.League.teamStrength(S, t.id))}</div><div class="l">Team rating</div></div>
          <div class="stat"><div class="v">${U.money(payroll, true)}</div><div class="l">Payroll (cap ${U.money(L.cap, true)})</div></div>
          <div class="stat"><div class="v">${'★'.repeat(t.market)}</div><div class="l">Market</div></div>
        </div>
        <div class="kv" style="margin-bottom:12px"><span>Owner's goal</span><span>${goal}</span><span>Owner patience</span><span>${t.owner.patience >= 65 ? 'Patient' : t.owner.patience >= 45 ? 'Average' : 'Impatient'}</span></div>
        <table class="tbl compact"><thead><tr><th>Player</th><th>Pos</th><th class="num">Age</th><th class="num">OVR</th></tr></thead><tbody>
        ${roster.slice(0, 9).map(p => `<tr><td class="pl">${UI.avatar(p, 26)}${U.esc(PBC.Player.name(p))}</td><td>${UI.pos(p.pos)}</td><td class="num">${p.age}</td><td class="num">${UI.ovr(p.ovr)}</td></tr>`).join('')}
        </tbody></table>
        <button class="btn primary xl block" style="margin-top:16px" data-act="start">Coach the ${U.esc(t.name)} ▸</button>
      </div></div>`;
  }

  App.beginCareer = function () {
    const S = wiz.S;
    const tid = wiz.sel;
    if (!S || tid == null) return;
    S.userTid = tid;
    S.difficulty = wiz.difficulty;
    PBC.Coach.create(S, wiz.coachName, tid);
    PBC.League.preseasonProjections(S);
    PBC.AI.autoRotation(S, tid);
    S.teams[tid].rot.auto = true;
    PBC.Season.news(S, `👋 ${wiz.coachName} is introduced as the new head coach of the ${S.teams[tid].city} ${S.teams[tid].name}.`, 'career', tid);
    UI.setState(S);
    wiz.S = null; wiz.step = 1; wiz.sel = null;
    UI.save(true);
    UI.go('home');
  };

  // ---------------------------------------------------------------------------
  // Home dashboard
  // ---------------------------------------------------------------------------
  UI.register('home', {
    title: 'Home',
    render(root) {
      const S = UI.S;
      const t = S.teams[S.userTid];
      root.innerHTML = `<div class="page">
        <div class="grid g-main">
          <div class="stack">${heroCard(S)}${lastGameCard(S)}${newsCard(S)}</div>
          <div class="stack">${ownerCard(S)}${practiceCard(S)}${standingsCard(S)}${leadersCard(S)}${injuriesCard(S)}</div>
        </div></div>`;
      // a new season's preview magazine opens once, the first time you land on Home in the preseason
      if (S.phase === 'preseason' && PBC.Magazine && PBC.Magazine.shouldAutoOpen && PBC.Magazine.shouldAutoOpen(S) && !App._magOpening) {
        App._magOpening = true;
        setTimeout(() => { App._magOpening = false; try { if (PBC.Magazine.shouldAutoOpen(UI.S)) PBC.Magazine.open(UI.S); } catch (e) { console.error(e); } }, 250);
      }
      UI.on(root, 'click', '[data-act]', (e, el) => {
        const a = el.dataset.act;
        if (a === 'play') App.goToNextGame();
        if (a === 'quick') App.quickSimNext();
        if (a === 'week') App.simDays(7, 'Simulating a week…');
        if (a === 'end') App.simToEndOfRegular();
        if (a === 'tipoff') App.tipOff();
        if (a === 'mag') { if (PBC.Magazine && PBC.Magazine.open) PBC.Magazine.open(S); else UI.toast('The preview magazine is coming soon.'); }
        if (a === 'series') App.simSeries();
        if (a === 'restpo') App.simRestOfPostseason();
        if (a === 'recap') UI.go('recap');
      });
      void t;
    },
  });

  function heroCard(S) {
    const t = S.teams[S.userTid];
    if (S.coach && S.coach.status === 'unemployed') {
      return `<div class="hero"><div class="hero-in"><div class="up" style="font-size:28px">You're out of a job</div>
        <p class="muted">Teams are calling. Review your offers and pick your next challenge.</p><button class="btn primary lg" data-nav="jobs">View Job Offers ▸</button></div></div>`;
    }
    if (S.phase === 'preseason') {
      return `<div class="hero"><div class="hero-in">
        <div class="row nowrap">${UI.teamBadge(t, 64)}<div><div class="tiny up dim" style="letter-spacing:2px">${U.seasonLabel(S.season)} Preseason</div>
        <div class="up" style="font-size:30px;line-height:1">${U.esc(t.city)} ${U.esc(t.name)}</div><div class="muted">Set your rotation and systems, then tip off the season.</div></div></div>
        <div class="row" style="margin-top:18px"><button class="btn primary lg" data-act="tipoff">🏀 Tip Off Season</button>
        <button class="btn lg" data-act="mag">📰 Preview Magazine</button><button class="btn lg" data-nav="lineup">📋 Lineup</button><button class="btn lg" data-nav="strategy">🧠 Strategy</button></div></div></div>`;
    }
    if (S.phase === 'awards' || S.phase === 'postseason_done') {
      return `<div class="hero"><div class="hero-in"><div class="up" style="font-size:28px">The ${U.seasonLabel(S.season)} season is over</div>
        <p class="muted">See the awards, your owner's review, and head into the offseason.</p><button class="btn primary lg" data-act="recap">Season Recap ▸</button></div></div>`;
    }
    if (!inSeason(S)) {
      const cont = UI.continueInfo();
      return `<div class="hero"><div class="hero-in"><div class="up" style="font-size:28px">${UI.phaseLabel(S)}</div>
        <p class="muted">The offseason is underway.</p>${cont ? `<button class="btn primary lg" id="hero-cont">${U.esc(cont.label)} ▸</button>` : ''}</div></div>`;
    }
    PBC.Season.prepareToday(S);
    const ug = PBC.Season.userGameToday(S) || (S.phase === 'regular' ? PBC.League.nextGame(S, S.userTid) : null);
    const st = PBC.League.standings(S);
    let series = '';
    if (S.phase !== 'regular' && S.playoffs) {
      const P = S.playoffs;
      const s = P.series.find(x => !x.done && (x.hi === S.userTid || x.lo === S.userTid)) || P.series.filter(x => x.hi === S.userTid || x.lo === S.userTid).slice(-1)[0];
      if (s) {
        const mine = s.hi === S.userTid ? s.w[0] : s.w[1], theirs = s.hi === S.userTid ? s.w[1] : s.w[0];
        series = `<div class="tag ${mine >= theirs ? 'good' : 'bad'}" style="font-size:13px">${PBC.League.roundName(S, s.round)} · ${mine > theirs ? 'Lead' : mine < theirs ? 'Trail' : 'Tied'} ${mine}-${theirs}</div>`;
      } else if (S.phase === 'playin') series = `<div class="tag warn" style="font-size:13px">Play-In Tournament</div>`;
      if (!PBC.Season.userInPostseason(S)) {
        return `<div class="hero"><div class="hero-in"><div class="up" style="font-size:28px">${S.phase === 'playin' ? 'Play-In Tournament' : PBC.League.roundName(S, P.round)}</div>
          <p class="muted">Your season is over. Watch how the rest of the postseason plays out.</p>
          <div class="row"><button class="btn primary lg" data-act="restpo">⏩ Sim to the end of the playoffs</button><button class="btn lg" data-nav="playoffs">🏆 Bracket</button></div></div></div>`;
      }
    }
    if (!ug) return `<div class="hero"><div class="hero-in"><div class="up" style="font-size:24px">No game scheduled</div></div></div>`;
    const home = ug.h === S.userTid;
    const opp = S.teams[home ? ug.a : ug.h];
    const rec = tid => `${st[tid].w}-${st[tid].l}`;
    const today = ug.day === S.day;
    return `<div class="hero"><div class="hero-in">
      <div class="row"><span class="tiny up dim" style="letter-spacing:2px">${today ? 'Today' : 'Next game'} · ${PBC.League.dateLabel(S, ug.day, true)}${ug.gameNum ? ' · Game ' + ug.gameNum : ''}</span><div class="spacer"></div>${series}</div>
      <div class="vs-card" style="margin:14px 0 16px">
        <div class="vs-team">${UI.teamBadge(home ? opp : t, 76)}<div class="nm">${U.esc((home ? opp : t).city)}<br>${U.esc((home ? opp : t).name)}</div><div class="small muted">${rec(home ? opp.id : t.id)}</div></div>
        <div class="vs-at">@</div>
        <div class="vs-team">${UI.teamBadge(home ? t : opp, 76)}<div class="nm">${U.esc((home ? t : opp).city)}<br>${U.esc((home ? t : opp).name)}</div><div class="small muted">${rec(home ? t.id : opp.id)}</div></div>
      </div>
      <div class="row">
        <button class="btn primary lg pulse" data-act="play">▶ ${today ? 'Play Game' : 'Go to Game Day'}</button>
        <button class="btn lg" data-act="quick">⏩ Quick Sim</button>
        ${S.phase === 'regular' ? `<button class="btn lg" data-act="week">Sim Week</button><button class="btn lg ghost" data-act="end">Sim to Season End</button>` : `<button class="btn lg" data-act="series">Sim Series</button>`}
      </div></div></div>`;
  }

  function lastGameCard(S) {
    const gids = Object.keys(S.boxes || {}).map(Number).sort((a, b) => b - a);
    if (!gids.length) return '';
    const box = S.boxes[gids[0]];
    const u = box.h === S.userTid ? 0 : 1;
    const my = u === 0 ? box.hs : box.as, th = u === 0 ? box.as : box.hs;
    const opp = S.teams[u === 0 ? box.a : box.h];
    const T = box.teams[u];
    const top = U.sortBy(T.players.filter(p => !p.dnp), p => PBC.Stats.gmsc(p), true).slice(0, 3);
    return `<div class="card"><div class="card-h"><h3>Last game</h3><div class="actions"><button class="btn sm" data-open-box="${box.gid}">Box score</button></div></div>
      <div class="card-b"><div class="row nowrap"><span class="big ${my > th ? 'good-t' : 'bad-t'}">${my > th ? 'W' : 'L'}</span>
        <div style="min-width:0"><div class="up" style="font-size:22px">${my}-${th} ${u === 0 ? 'vs' : '@'} ${U.esc(opp.name)}${box.ot ? ` <span class="tag">${box.ot > 1 ? box.ot : ''}OT</span>` : ''}</div>
        <div class="small muted">${top.map(p => `${U.esc(p.last)} ${p.pts}p/${p.orb + p.drb}r/${p.ast}a`).join(' · ')}</div></div></div></div></div>`;
  }

  function newsCard(S) {
    const items = S.news.slice(0, 14);
    return `<div class="card"><div class="card-h"><h3>League wire</h3></div><div class="card-b flush">${items.length ? items.map(n => `
      <div class="news-li"><span class="d">${n.phase === 'regular' ? PBC.League.dateLabel(S, Math.max(0, Math.min(n.day, S.numDays - 1))) : U.seasonLabel(n.season)}</span><span ${n.tid === S.userTid ? 'class="bold"' : ''}>${n.text}</span></div>`).join('') : '<div class="empty">No news yet.</div>'}</div></div>`;
  }

  function ownerCard(S) {
    const c = S.coach;
    if (!c) return '';
    const exp = c.expectation;
    const sec = c.security;
    const cls = sec >= 60 ? 'good' : sec >= 35 ? 'warn' : 'bad';
    const moodCls = { Thrilled: 'good', Pleased: 'good', Optimistic: 'info', Patient: 'info', Concerned: 'warn', Furious: 'bad' }[c.mood] || 'info';
    return `<div class="card accent"><div class="card-h"><h3>Front office</h3><div class="actions"><span class="tag ${moodCls}">Owner: ${U.esc(c.mood || '—')}</span></div></div>
      <div class="card-b">
        <div class="kv"><span>Goal</span><span>${exp ? U.esc(exp.label) : '—'}</span><span>Projected</span><span>${exp ? exp.wins + ' wins' : '—'}</span>
        <span>Contract</span><span>${c.contract.years} yr${c.contract.years === 1 ? '' : 's'} · ${U.money(c.contract.salary)}</span></div>
        <div class="row" style="margin-top:12px"><span class="small muted">Job security</span><div class="spacer"></div><b>${sec}</b></div>
        <div class="meter lg"><div class="meter-fill ${cls}" style="width:${sec}%"></div></div>
      </div></div>`;
  }

  function practiceCard(S) {
    if (S.phase !== 'regular') return '';
    const avail = PBC.Season.practiceAvailable(S);
    const last = S.practice && S.practice.log && S.practice.log[0];
    return `<div class="card"><div class="card-h"><h3>Weekly practice</h3></div><div class="card-b">
      ${avail ? `<p class="small" style="margin-top:0">This week's practice hasn't happened yet. Run a drill to develop your players, or your assistants will run a lighter session at the end of the week.</p>
        <button class="btn primary block" data-nav="practice">🏋️ Run Practice</button>`
        : `<p class="small muted" style="margin:0">✅ Practice done this week.${last ? ` Last: ${U.esc(last.drill)} · score ${last.score} · ${last.gains} rating bumps.` : ''}</p>`}</div></div>`;
  }

  function standingsCard(S) {
    const L = PBC.League.cfg(S);
    const t = S.teams[S.userTid];
    const conf = L.playoffFormat === 'conference' ? t.conf : null;
    const list = PBC.League.sorted(S, conf);
    const myIdx = list.findIndex(r => r.tid === S.userTid);
    let rows = list.slice(0, 8);
    if (myIdx >= 8) rows = list.slice(0, 6).concat([null], list.slice(myIdx - 1, myIdx + 1));
    return `<div class="card"><div class="card-h"><h3>${conf != null ? L.confs[conf] : 'League'} standings</h3><div class="actions"><button class="btn sm ghost" data-nav="standings">All ›</button></div></div>
      <div class="card-b flush"><table class="tbl compact"><tbody>${rows.map(r => r ? `<tr class="${r.tid === S.userTid ? 'me' : ''}">
        <td class="rank">${r.seed}</td><td>${UI.teamBadge(S.teams[r.tid], 20)} ${UI.teamLink(S.teams[r.tid], S.teams[r.tid].name)}</td><td class="num">${r.w}-${r.l}</td><td class="num dim">${r.gb ? r.gb.toFixed(1) : '—'}</td></tr>` : '<tr><td colspan="4" class="center dim">⋯</td></tr>').join('')}</tbody></table></div></div>`;
  }

  function leadersCard(S) {
    const roster = PBC.League.roster(S, S.userTid);
    const lines = roster.map(p => ({ p, s: PBC.Stats.season(p, S.season, S.phase === 'playoffs') || PBC.Stats.season(p, S.season, false) })).filter(x => x.s && x.s.gp);
    if (!lines.length) return '';
    const best = (f) => U.maxBy(lines, x => f(x.s) / x.s.gp);
    const cats = [['PTS', s => s.pts], ['REB', s => s.orb + s.drb], ['AST', s => s.ast]];
    return `<div class="card"><div class="card-h"><h3>Team leaders</h3></div><div class="card-b flush"><div class="list">${cats.map(([l, f]) => {
      const x = best(f);
      return `<div class="li">${UI.avatar(x.p, 32)}<div style="flex:1">${UI.playerLink(x.p)}<div class="tiny dim">${x.p.pos} · ${U.num(x.s.min / x.s.gp)} mpg</div></div><div class="right"><div class="up" style="font-size:20px">${(f(x.s) / x.s.gp).toFixed(1)}</div><div class="tiny dim">${l}</div></div></div>`;
    }).join('')}</div></div></div>`;
  }

  function injuriesCard(S) {
    const inj = PBC.League.roster(S, S.userTid).filter(p => PBC.Player.isInjured(p));
    if (!inj.length) return '';
    return `<div class="card"><div class="card-h"><h3>Injury report</h3></div><div class="card-b flush"><div class="list">${inj.map(p => `
      <div class="li">${UI.avatar(p, 28)}<div style="flex:1">${UI.playerLink(p)}<div class="tiny bad-t">${U.esc(PBC.Player.injuryLabel(p.injury))}</div></div>${UI.ovr(p.ovr)}</div>`).join('')}</div></div></div>`;
  }

  // wire the offseason CONTINUE button inside the hero (if any)
  document.addEventListener('click', e => {
    if (e.target && e.target.id === 'hero-cont') { const c = UI.continueInfo(); if (c) c.run(); }
  });

  PBC.App = App;
})();
