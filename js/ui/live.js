/* Pro BBALL Coach — pregame + live game screen.
 * Engine ⇄ pixel-art broadcast court view ⇄ TV graphics (broadcast.js) ⇄ two-voice commentary (commentary.js)
 * ⇄ arena audio (arenaaudio.js) ⇄ coach controls ⇄ Game Impact Moments. */
(function () {
  'use strict';
  const PBC = window.PBC;
  const U = PBC.U, C = PBC.Config, UI = PBC.UI;

  // ---------------------------------------------------------------------------
  // Helpers shared with the view
  // ---------------------------------------------------------------------------
  function uniformFor(t, home) {
    const u = t.uniforms && t.uniforms[home ? 'home' : 'away'];
    if (u && u.jersey) return Object.assign({ number: u.trim || '#111111', trim: u.number || '#111111', shorts: u.jersey }, u);
    const p = t.colors.primary, s = t.colors.secondary;
    return home ? { jersey: '#f4f6fa', number: p, trim: p, shorts: '#f4f6fa' } : { jersey: p, number: U.textOn(p) === '#ffffff' ? '#ffffff' : s, trim: s, shorts: p };
  }
  const arenaName = t => (UI.teamArena ? UI.teamArena(t) : t.arena || '');
  function teamLook(t, home) {
    const ct = UI.teamCourt ? UI.teamCourt(t) : (t.court || {}); // Team Editor court, or the same defaults it shows
    return {
      id: t.id, abbr: t.abbr, city: t.city, name: t.name, arena: arenaName(t), colors: Object.assign({}, t.colors), uniform: uniformFor(t, home),
      court: { paint: ct.paint || t.colors.primary, logoText: ct.logoText || t.abbr, wood: ct.wood || t.wood || 'light', apron: ct.apron || null },
    };
  }
  function playerLook(p, teamIdx) {
    return { id: p.id, teamIdx, first: p.first, last: p.last, num: p.num, pos: p.pos, height: p.hgt, weight: p.wgt, hand: p.hand, gender: p.gender, look: p.look, speed: p.r.speed, agility: p.r.agility, vert: p.r.vert, handle: p.r.handle,
      expr: PBC.Persona ? PBC.Persona.face(p) : 'neutral' };
  }
  UI.matchContext = function (S, g) {
    const L = PBC.League.cfg(S);
    const home = S.teams[g.tids[0]], away = S.teams[g.tids[1]];
    const players = {};
    g.t.forEach((T, i) => T.players.forEach(c => { players[c.id] = playerLook(c.p, i); }));
    return {
      league: L.key, periodLen: L.quarterLen, otLen: L.otLen, threePt: L.threePt,
      home: teamLook(home, true), away: teamLook(away, false), players,
      lineups: [g.t[0].on.map(c => c.id), g.t[1].on.map(c => c.id)], defScheme: [g.t[0].strat.def, g.t[1].strat.def],
    };
  };

  /** Presentation stakes of a scheduled game: playoff round, series score, elimination, Game 7. */
  UI.gameStakes = function (S, sg) {
    const out = { playoff: !!(sg && sg.playoff), playIn: !!(sg && sg.playIn), level: 0, round: 0, roundName: '', gameNum: 0, len: 0, seriesW: [0, 0], elimination: false, decisive: false, game7: false, clinch: [false, false], label: '', short: '' };
    if (!sg || !sg.playoff || !S.playoffs) return out;
    const P = S.playoffs, L = PBC.League.cfg(S);
    if (sg.playIn) {
      const x = (P.playIn || []).find(y => y.id === sg.playIn);
      out.level = 0.55; out.roundName = 'Play-In Tournament'; out.elimination = !!(x && x.stage !== 'A');
      out.label = 'PLAY-IN TOURNAMENT' + (out.elimination ? ' · WIN OR GO HOME' : ' · WINNER IS IN');
      out.short = 'PLAY-IN';
      return out;
    }
    const s = (P.series || []).find(y => y.id === sg.series);
    if (!s) return out;
    const need = Math.ceil(s.len / 2);
    const hw = s.hi === sg.h ? s.w[0] : s.w[1], aw = s.hi === sg.h ? s.w[1] : s.w[0];
    out.round = s.round; out.len = s.len; out.gameNum = sg.gameNum || (s.w[0] + s.w[1] + 1); out.seriesW = [hw, aw];
    const base = PBC.League.roundName(S, s.round);
    out.roundName = (L.playoffFormat === 'conference' && s.conf != null && base !== 'Finals') ? `${L.confs[s.conf]} ${base.replace('Conference ', '')}` : base;
    out.clinch = [hw === need - 1, aw === need - 1];
    out.elimination = out.clinch[0] || out.clinch[1];
    out.decisive = out.clinch[0] && out.clinch[1];
    out.game7 = out.decisive && s.len === 7;
    const fromEnd = P.rounds - s.round;
    out.level = fromEnd <= 0 ? 1 : fromEnd === 1 ? 0.9 : fromEnd === 2 ? 0.75 : 0.6;
    if (out.elimination) out.level += 0.15;
    if (out.decisive) out.level += 0.1;
    out.level = Math.min(1.25, out.level);
    const T = [S.teams[sg.h], S.teams[sg.a]];
    const sw = hw === aw ? `SERIES TIED ${hw}-${aw}` : `${T[hw > aw ? 0 : 1].abbr} LEADS ${Math.max(hw, aw)}-${Math.min(hw, aw)}`;
    out.label = `${out.roundName.toUpperCase()} · GAME ${out.gameNum}${out.game7 ? ' (WINNER TAKES ALL)' : ''} · ${sw}`;
    out.short = `${out.roundName.toUpperCase()} · G${out.gameNum}`;
    return out;
  };

  function viewSettings(S) {
    const st = S.settings || {};
    return {
      style: st.courtStyle === 'retro' ? 'retro' : 'broadcast',
      pixel: st.pixelArt !== false,
      pixelSize: st.pixelSize || 'normal',
      camera: ['fixed', 'wide', 'close'].includes(st.camera) ? st.camera : 'auto',
      showNames: !!st.showNames,
    };
  }

  // Court view factory: the pixel-art broadcast court (skeletal animation, broadcast camera) is the default.
  // The old chibi retro court is still available (Settings or the live view menu). Returns null for text mode.
  UI.makeCourtView = function (canvas, S, g) {
    const ctx = UI.matchContext(S, g);
    const vs = viewSettings(S);
    if (vs.style !== 'retro' && PBC.Match && PBC.Match.View) {
      try { return new PBC.Match.View(canvas, ctx, { quality: S.settings.lowQuality ? 'low' : 'high', pixelMode: vs.pixel, pixelSize: vs.pixelSize, camera: vs.camera === 'fixed' ? 'broadcast' : vs.camera, showNames: vs.showNames }); } catch (e) { console.error('Match view failed', e); }
    }
    if (PBC.Match && PBC.Match.RetroView) {
      try { return new PBC.Match.RetroView(canvas, ctx, { quality: 'high', showNames: false }); } catch (e) { console.error('RetroView failed', e); }
    }
    return null;
  };

  // ---------------------------------------------------------------------------
  // Pregame
  // ---------------------------------------------------------------------------
  UI.register('pregame', {
    title: 'Game Day',
    render(root, params) {
      const S = UI.S;
      PBC.Season.prepareToday(S);
      const sg = PBC.Season.userGameToday(S);
      if (!sg) { UI.go('home'); return; }
      const home = sg.h === S.userTid;
      const me = S.teams[S.userTid], opp = S.teams[home ? sg.a : sg.h];
      const st = PBC.League.standings(S);
      const lineup = tid => {
        const t = S.teams[tid];
        const rot = t.rot && t.rot.starters && t.rot.starters.length === 5 ? t.rot.starters.map(id => S.players[id]).filter(p => p && p.tid === tid && !p.injury) : [];
        const healthy = PBC.League.roster(S, tid).filter(p => !p.injury);
        const five = rot.length === 5 ? rot : PBC.AI.bestFive(healthy);
        return five;
      };
      const ts = tid => S.teamSeason[tid] || { gp: 0 };
      const pg = (tid, k) => (ts(tid).gp ? (ts(tid)[k] / ts(tid).gp).toFixed(1) : '-');
      const oppStar = PBC.League.roster(S, opp.id).filter(p => !p.injury)[0];
      const oppStarS = oppStar ? PBC.Stats.season(oppStar, S.season, false) : null;
      const keys = [];
      if (oppStar) keys.push(`Contain <b>${U.esc(PBC.Player.name(oppStar))}</b>${oppStarS && oppStarS.gp ? ` (${(oppStarS.pts / oppStarS.gp).toFixed(1)} ppg)` : ''}. Box-and-One or an aggressive scheme can slow ${oppStar.gender === 'f' ? 'her' : 'him'} down.`);
      const prof = UI.teamProfile(S, opp.id), mine = UI.teamProfile(S, S.userTid);
      if (prof.Shooting > mine.Shooting + 3) keys.push('They shoot it better than you. Run them off the three-point line.');
      if (mine.Inside > prof.Inside + 3) keys.push('You have the edge inside. Feed the post and attack the rim.');
      if (prof.Rebounding > mine.Rebounding + 3) keys.push('They crash the glass hard. Consider "Get Back" and gang rebounding.');
      if (mine.Athleticism > prof.Athleticism + 3) keys.push('You are the more athletic team. Push the tempo.');
      if (keys.length < 3) keys.push('Win the turnover battle and get to the free-throw line.');
      const stakes = UI.gameStakes(S, sg);
      let series = '';
      if (sg.playoff && S.playoffs) series = stakes.label || 'Playoffs';
      const strat = me.strat;
      const sel = (key, obj) => `<select class="inp" data-strat="${key}" style="width:100%">${Object.keys(obj).map(k => `<option value="${k}" ${strat[key] === k ? 'selected' : ''}>${obj[k].label}</option>`).join('')}</select>`;
      const vs = viewSettings(S);
      root.innerHTML = `<div class="page pregame ${stakes.playoff ? 'po-pregame' : ''}">
        <div class="hero"><div class="hero-in">
          <div class="row"><span class="tiny up dim" style="letter-spacing:2px">${PBC.League.dateLabel(S, sg.day, true)} · ${home ? 'Home' : 'Road'} game${arenaName(home ? me : opp) ? ' · ' + U.esc(arenaName(home ? me : opp)) : ''}</span><div class="spacer"></div>${series ? `<span class="tag gold">${U.esc(series)}</span>` : ''}</div>
          ${stakes.elimination ? `<div class="po-stakes">${stakes.game7 ? '🔥 GAME 7. WINNER TAKES ALL.' : stakes.clinch[home ? 0 : 1] && stakes.clinch[home ? 1 : 0] ? '🔥 DECIDING GAME' : stakes.clinch[home ? 1 : 0] ? '⚠️ ELIMINATION GAME: lose and your season is over' : '🏆 CLOSEOUT GAME: win and you advance'}</div>` : ''}
          <div class="vs-card" style="margin:14px 0">
            <div class="vs-team">${UI.teamBadge(home ? opp : me, 92)}<div class="nm">${U.esc((home ? opp : me).city)}<br>${U.esc((home ? opp : me).name)}</div><div class="small muted">${st[(home ? opp : me).id].w}-${st[(home ? opp : me).id].l} · ${pg((home ? opp : me).id, 'pts')} ppg</div></div>
            <div class="vs-at">@</div>
            <div class="vs-team">${UI.teamBadge(home ? me : opp, 92)}<div class="nm">${U.esc((home ? me : opp).city)}<br>${U.esc((home ? me : opp).name)}</div><div class="small muted">${st[(home ? me : opp).id].w}-${st[(home ? me : opp).id].l} · ${pg((home ? me : opp).id, 'pts')} ppg</div></div>
          </div>
          <div class="row" style="justify-content:center"><button class="btn primary xl" data-act="live">▶ Watch Live</button><button class="btn lg" data-act="quick">⏩ Quick Sim</button><button class="btn lg ghost" data-act="back">Back</button></div>
          <div class="row pg-bcast" style="justify-content:center;margin-top:12px">
            <label class="chk"><input type="checkbox" data-set="commentary" ${S.settings.commentary !== false ? 'checked' : ''}> 🎙️ Commentary</label>
            <label class="chk"><input type="checkbox" data-set="voice" ${S.settings.voice !== false ? 'checked' : ''}> 🗣️ Announcer voices</label>
            <label class="chk"><input type="checkbox" data-set="arenaSound" ${S.settings.arenaSound !== false ? 'checked' : ''}> 🔊 Arena sound</label>
            <label class="chk"><input type="checkbox" data-set="replays" ${S.settings.replays !== false ? 'checked' : ''}> 🎬 Replays</label>
            <label class="chk"><input type="checkbox" data-set="pixelArt" ${vs.pixel ? 'checked' : ''}> 👾 Pixel art</label>
          </div>
        </div></div>
        <div class="grid g3" style="margin-top:16px">
          ${[S.userTid, opp.id].map(tid => `<div class="card"><div class="card-h">${UI.teamBadge(S.teams[tid], 24)}<h3>${S.teams[tid].abbr} starters</h3></div><div class="card-b flush"><div class="list">${lineup(tid).map(p => `
            <div class="li">${UI.avatar(p, 34)}<div style="flex:1;min-width:0" class="ellip">${UI.playerLink(p)}<div class="tiny dim">${p.pos} · ${U.height(p.hgt)}${PBC.Persona ? ' · ' + PBC.Persona.info(p).icon + ' ' + PBC.Persona.info(p).label : ''}</div></div>${UI.ovr(p.ovr)}</div>`).join('')}</div></div></div>`).join('')}
          <div class="card accent"><div class="card-h"><h3>Game plan</h3><div class="actions"><button class="btn sm ghost" data-nav="lineup">Lineup ›</button></div></div><div class="card-b col">
            <label class="small muted">Offense</label>${sel('off', C.OFFENSES)}<label class="small muted">Defense</label>${sel('def', C.DEFENSES)}
            <label class="small muted">Tempo</label>${sel('tempo', C.TEMPOS)}
            <div class="divider"></div><div class="small up muted">Keys to the game</div><ul class="keys small" style="margin:0;padding-left:18px">${keys.slice(0, 3).map(k => `<li>${k}</li>`).join('')}</ul></div></div>
        </div></div>`;
      UI.on(root, 'change', '[data-strat]', (e, el) => { strat[el.dataset.strat] = el.value; UI.save(); });
      UI.on(root, 'change', '[data-set]', (e, el) => {
        const k = el.dataset.set;
        S.settings[k] = el.checked;
        UI.save();
      });
      UI.on(root, 'click', '[data-act]', (e, el) => {
        const a = el.dataset.act;
        if (a === 'live') UI.go('live', { gid: sg.gid });
        if (a === 'quick') PBC.App.quickSimNext();
        if (a === 'back') UI.go('home');
      });
    },
  });

  // ---------------------------------------------------------------------------
  // Live game
  // ---------------------------------------------------------------------------
  let LG = null; // live game controller state

  UI.register('live', {
    title: 'Live', fullscreen: true,
    render(root, params) {
      const S = UI.S;
      PBC.Season.prepareToday(S);
      const sg = PBC.Season.userGameToday(S);
      if (!sg) { UI.go('home'); return; }
      startLive(root, S, sg);
    },
    onLeave() { stopLive(); },
  });

  function stopLive() {
    if (!LG) return;
    LG.alive = false;
    cancelAnimationFrame(LG.raf);
    window.removeEventListener('resize', LG.onResize);
    document.removeEventListener('keydown', LG.onKey);
    if (LG.ro) { try { LG.ro.disconnect(); } catch (e) { /* ignore */ } }
    for (const k of ['bc', 'cm', 'au']) if (LG[k] && LG[k].destroy) { try { LG[k].destroy(); } catch (e) { console.error(e); } }
    if (LG.view && LG.view.destroy) { try { LG.view.destroy(); } catch (e) { console.error(e); } }
    LG = null;
  }

  function startLive(root, S, sg) {
    stopLive();
    const g = PBC.Sim.createGame(S, sg.h, sg.a, { gid: sg.gid, playoff: !!sg.playoff, sg });
    const uIdx = g.userIdx;
    const teams = [S.teams[sg.h], S.teams[sg.a]];
    const stakes = UI.gameStakes(S, sg);
    const useVisual = S.settings.showVisuals !== false;
    const side = S.settings.liveSidePanel !== false;
    root.innerHTML = `<div class="live ${useVisual ? '' : 'playbyplay-only'} ${side ? '' : 'no-side'} ${stakes.playoff ? 'is-playoff' : ''}">
      <div class="lv-top">
        <button class="btn ghost sm" data-act="leave">‹ Leave</button>
        <div class="bug" id="bug"></div>
        <div class="lv-ctrl">
          <button class="btn sm" data-act="timeout" title="Timeout (T)">⏱ TO <span id="to-left"></span></button>
          <button class="btn sm" data-act="pause" id="btn-pause" title="Pause (Space)">⏸</button>
          <div class="seg" id="speeds">${[1, 2, 4, 8, 16].map(s => `<button data-speed="${s}">${s}×</button>`).join('')}</div>
          <button class="btn sm" data-act="clutch" title="Skip ahead to crunch time">⏭ Crunch time</button>
          <button class="btn sm" data-act="end" title="Simulate to the final buzzer">⏩ End</button>
          <button class="btn sm ${S.settings.commentary !== false ? 'on' : ''}" data-act="booth" id="btn-booth" title="Commentary (C)">🎙️</button>
          <button class="btn sm" data-act="bmenu" title="Broadcast settings">📺</button>
          <button class="btn sm" data-act="side" title="Show / hide the side panel (P)">▤</button>
        </div>
      </div>
      <div class="lv-main">
        <div class="lv-stage" id="stage">${useVisual ? '<canvas id="court"></canvas>' : '<div class="lv-text" id="lvtext"></div>'}
          <div class="bc-layer" id="bc"></div>
          <div class="lv-play" id="playlabel"></div><div class="lv-overlay" id="overlay"></div></div>
        <div class="lv-side">
          <div class="tabs lv-tabs"><button class="tab active" data-tab="pbp">Play-by-play</button><button class="tab" data-tab="coach">Coach</button><button class="tab" data-tab="box">Box score</button></div>
          <div class="lv-panel" id="panel"></div>
        </div>
      </div>
      <div class="lv-bottom" id="oncourt"></div>
    </div>`;
    LG = {
      alive: true, S, sg, g, uIdx, teams, root, useVisual, stakes, speed: S.settings.simSpeed || 2, paused: false, busy: false,
      P: null, possDone: true, dispScore: [0, 0], lines: [], tab: 'pbp', text: null, view: null, raf: 0, last: 0,
      gimQueue: null, finished: false, subPick: null, lastPanelRender: 0, playLabelT: 0, clockShow: g.clock, scShow: 24,
      hold: null, highlight: null, started: false, lastPeriod: 1, bc: null, cm: null, au: null, styleShown: viewSettings(S).style,
    };
    if (![1, 2, 4, 8, 16].includes(LG.speed)) LG.speed = 2;
    // view
    if (useVisual) {
      try {
        const canvas = root.querySelector('#court');
        LG.view = UI.makeCourtView(canvas, S, g);
        if (!LG.view) throw new Error('no court view');
        LG.onResize = () => { const st = root.querySelector('#stage'); if (LG && LG.view && LG.view.resize && st) LG.view.resize(st.clientWidth, st.clientHeight); };
        LG.onResize();
      } catch (e) {
        console.error('Match view failed, falling back to text mode', e);
        LG.view = null; LG.useVisual = false;
        root.querySelector('.live').classList.add('textmode');
        root.querySelector('#stage').insertAdjacentHTML('afterbegin', '<div class="lv-text" id="lvtext"></div>');
        const cv = root.querySelector('#court'); if (cv) cv.remove();
      }
    }
    if (!LG.view) { LG.onResize = () => {}; buildTextStage(); }
    window.addEventListener('resize', LG.onResize);
    if (window.ResizeObserver && LG.view) { LG.ro = new ResizeObserver(() => LG && LG.onResize()); LG.ro.observe(root.querySelector('#stage')); }
    // broadcast package: audio, commentary booth, TV graphics
    const host = { S, g, sg, teams, uIdx, stakes, stage: root.querySelector('#stage'), layer: root.querySelector('#bc'), view: LG.view, speed: () => (LG ? LG.speed : 1), boxSnap: () => (LG ? LG.boxSnap : null) };
    try { if (PBC.ArenaAudio) { LG.au = PBC.ArenaAudio.create(host); host.au = LG.au; } } catch (e) { console.error('audio', e); }
    try { if (PBC.Broadcast) { LG.bc = PBC.Broadcast.create(host); host.bc = LG.bc; } } catch (e) { console.error('broadcast', e); }
    try { if (PBC.Commentary) { LG.cm = PBC.Commentary.create(host); host.cm = LG.cm; } } catch (e) { console.error('commentary', e); }
    if (LG.view) {
      if (LG.view.setAtmosphere) LG.view.setAtmosphere({ playoff: stakes.playoff, level: stakes.level, effort: g.intensity, label: stakes.short, finals: stakes.playoff && stakes.roundName === 'Finals' });
      LG.view.onSound = (name, v) => { if (LG && LG.au) LG.au.play(name, v); };
    }
    LG.onKey = e => {
      if (e.target.closest && e.target.closest('input,select,textarea')) return;
      if (LG.hold && LG.hold.skippable && (e.code === 'Space' || e.key === 'Enter' || e.key === 'Escape')) { e.preventDefault(); skipHold(); return; }
      if (LG.busy) return;
      if (e.code === 'Space') { e.preventDefault(); togglePause(); }
      if (e.key === 't' || e.key === 'T') callTimeout();
      if (e.key === 'c' || e.key === 'C') toggleBooth();
      if (e.key === 'p' || e.key === 'P') toggleSide();
      if (e.key === 'm' || e.key === 'M') { if (LG.au) { LG.au.toggleMute(); UI.toast(LG.au.muted ? '🔇 Arena sound off' : '🔊 Arena sound on', 'info'); } }
      if (['1', '2', '3', '4', '5'].includes(e.key)) setSpeed([1, 2, 4, 8, 16][+e.key - 1]);
    };
    document.addEventListener('keydown', LG.onKey);
    // first user gesture unlocks audio (browser autoplay rules)
    root.addEventListener('pointerdown', () => { if (LG) { if (LG.au) LG.au.unlock(); if (LG.cm) LG.cm.unlock(); } }, { once: false });
    UI.on(root, 'click', '[data-speed]', (e, el) => setSpeed(+el.dataset.speed));
    UI.on(root, 'click', '[data-tab]', (e, el) => { LG.tab = el.dataset.tab; root.querySelectorAll('.lv-tabs .tab').forEach(b => b.classList.toggle('active', b === el)); renderPanel(true); });
    UI.on(root, 'click', '[data-act]', (e, el) => {
      const a = el.dataset.act;
      if (a === 'leave') leaveGame();
      if (a === 'pause') togglePause();
      if (a === 'timeout') callTimeout();
      if (a === 'clutch') skipToClutch();
      if (a === 'end') simToEnd();
      if (a === 'booth') toggleBooth();
      if (a === 'side') toggleSide();
      if (a === 'bmenu') broadcastMenu();
    });
    UI.on(root, 'click', '.bc-skip', () => skipHold());
    setSpeed(LG.speed);
    renderBug();
    renderPanel(true);
    renderOnCourt();
    pushLine({ q: 1, clock: g.clock, text: `Welcome to ${arenaName(teams[0]) || teams[0].city}! ${teams[1].name} at ${teams[0].name}.${stakes.playoff ? ' ' + (stakes.label || '') : ''}`, type: 'note' });
    // opening: broadcast intro (starting lineups) while the booth sets the scene
    const introSecs = S.settings.gameIntro === false ? 0 : 7.5;
    if (introSecs > 0 && LG.bc && LG.bc.showIntro) {
      LG.bc.showIntro(g, stakes);
      if (LG.cm) LG.cm.intro();
      holdFor(introSecs, () => { if (LG && LG.bc) LG.bc.hideIntro(); });
    } else if (LG.cm) LG.cm.intro(true);
    LG.last = performance.now();
    LG.raf = requestAnimationFrame(loop);
  }

  /** Debug/test hook: jump the live game to a clutch situation with the user's team on offense. */
  UI._liveDebug = {
    state: () => LG,
    clutch(lead) {
      if (!LG) return false;
      const g = LG.g;
      g.period = g.L.periods; g.clock = 58;
      const u = LG.uIdx;
      g.score[u] = 100; g.score[1 - u] = 100 - (lead == null ? -2 : lead);
      g.poss = u; g.nextStart = 'dead_ball'; g.nextSpot = { kind: 'sideline', x: 47, y: -1, front: false };
      LG.dispScore = g.score.slice(); LG.possDone = true; LG.text = null; LG.clockShow = g.clock;
      return true;
    },
    skip() { skipHold(); },
  };

  function setSpeed(s) {
    if (!LG) return;
    LG.speed = s;
    LG.S.settings.simSpeed = s;
    LG.root.querySelectorAll('[data-speed]').forEach(b => b.classList.toggle('on', +b.dataset.speed === s));
    if (LG.cm && LG.cm.setSpeed) LG.cm.setSpeed(s);
    if (LG.view && LG.view.opts) LG.view.opts.record = s <= 4 && LG.S.settings.replays !== false;
  }
  function togglePause(force) {
    if (!LG) return;
    LG.paused = force != null ? force : !LG.paused;
    const b = LG.root.querySelector('#btn-pause'); if (b) b.textContent = LG.paused ? '▶' : '⏸';
    if (LG.au) LG.au.setPaused(LG.paused);
    if (LG.cm) LG.cm.setPaused(LG.paused);
  }
  function toggleBooth() {
    if (!LG) return;
    const on = LG.S.settings.commentary === false;
    LG.S.settings.commentary = on;
    if (LG.cm) LG.cm.setEnabled(on);
    const b = LG.root.querySelector('#btn-booth'); if (b) b.classList.toggle('on', on);
    UI.toast(on ? '🎙️ Commentary on' : '🎙️ Commentary off', 'info');
    UI.save();
  }
  function toggleSide() {
    if (!LG) return;
    const live = LG.root.querySelector('.live');
    const hidden = !live.classList.contains('no-side');
    live.classList.toggle('no-side', hidden);
    LG.S.settings.liveSidePanel = !hidden;
    setTimeout(() => LG && LG.onResize(), 30);
  }
  function broadcastMenu() {
    const S = LG.S, st = S.settings;
    const vs = viewSettings(S);
    const voices = LG.cm && LG.cm.voiceOptions ? LG.cm.voiceOptions() : [];
    const vsel = (key, cur) => `<select class="inp" data-voice="${key}">${['<option value="">Auto (best available)</option>'].concat(voices.map(v => `<option value="${U.esc(v.id)}" ${cur === v.id ? 'selected' : ''}>${U.esc(v.label)}</option>`)).join('')}</select>`;
    const body = `<div class="bm">
      <div class="bm-sec"><div class="bm-h">Picture</div>
        <label class="chk"><input type="checkbox" data-b="pixelArt" ${vs.pixel ? 'checked' : ''}> 👾 Pixel-art look</label>
        <div class="row"><span class="small muted" style="min-width:90px">Court style</span><div class="seg" data-bseg="courtStyle">${[['broadcast', 'Broadcast'], ['retro', 'Retro chibi']].map(([k, l]) => `<button data-v="${k}" class="${vs.style === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
        <div class="row"><span class="small muted" style="min-width:90px">Pixel size</span><div class="seg" data-bseg="pixelSize">${[['chunky', 'Chunky'], ['normal', 'Normal'], ['fine', 'Fine']].map(([k, l]) => `<button data-v="${k}" class="${vs.pixelSize === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
        <div class="row"><span class="small muted" style="min-width:90px">Camera</span><div class="seg" data-bseg="camera">${[['auto', 'Auto'], ['fixed', 'Broadcast'], ['wide', 'Wide'], ['close', 'Close']].map(([k, l]) => `<button data-v="${k}" class="${vs.camera === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
        <label class="chk"><input type="checkbox" data-b="showNames" ${st.showNames ? 'checked' : ''}> Player names on court</label>
        <label class="chk"><input type="checkbox" data-b="replays" ${st.replays !== false ? 'checked' : ''}> 🎬 Instant replays of big plays</label>
        <label class="chk"><input type="checkbox" data-b="tvGraphics" ${st.tvGraphics !== false ? 'checked' : ''}> 📺 TV graphics (player stats, runs, quarter recaps)</label>
      </div>
      <div class="bm-sec"><div class="bm-h">Sound & booth</div>
        <label class="chk"><input type="checkbox" data-b="arenaSound" ${st.arenaSound !== false ? 'checked' : ''}> 🔊 Arena sound (crowd, sneakers, swishes)</label>
        <div class="row"><span class="small muted" style="min-width:90px">Volume</span><input type="range" min="0" max="100" value="${Math.round((st.volume == null ? 0.7 : st.volume) * 100)}" data-range="volume" style="flex:1"></div>
        <label class="chk"><input type="checkbox" data-b="commentary" ${st.commentary !== false ? 'checked' : ''}> 🎙️ Commentary captions</label>
        <label class="chk"><input type="checkbox" data-b="voice" ${st.voice !== false ? 'checked' : ''}> 🗣️ Announcer voices (text to speech)</label>
        <div class="row"><span class="small muted" style="min-width:90px">Play-by-play</span>${vsel('voicePbp', st.voicePbp || '')}</div>
        <div class="row"><span class="small muted" style="min-width:90px">Analyst</span>${vsel('voiceColor', st.voiceColor || '')}</div>
        <div class="row"><span class="small muted" style="min-width:90px">Chatter</span><div class="seg" data-bseg="booth">${[['light', 'Light'], ['normal', 'Normal'], ['full', 'Full']].map(([k, l]) => `<button data-v="${k}" class="${(st.booth || 'normal') === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
        <p class="tiny muted" data-voice-hint>${LG.cm && LG.cm.voiceHint ? U.esc(LG.cm.voiceHint()) : ''}</p>
        <button class="btn sm" data-test-voice>▶ Test the booth</button>
      </div>
      <div class="bm-sec bm-wide" data-cloud-sec>${cloudSection()}</div></div>`;
    const m = UI.modal({ title: '📺 Broadcast settings', body, wide: true, actions: [{ label: 'Done', cls: 'primary' }] });
    const apply = () => {
      if (!LG) return;
      const v = LG.view, vs2 = viewSettings(S);
      if (v && v.setOption) { v.setOption('pixelMode', vs2.pixel); v.setOption('pixelSize', vs2.pixelSize); v.setOption('camera', vs2.camera === 'fixed' ? 'broadcast' : vs2.camera); v.setOption('showNames', !!S.settings.showNames); }
      if (LG.styleShown !== vs2.style) { LG.styleShown = vs2.style; resetViewAfterJump(); }
      if (LG.au) { LG.au.setEnabled(S.settings.arenaSound !== false); LG.au.setVolume(S.settings.volume == null ? 0.7 : S.settings.volume); }
      if (LG.cm) { LG.cm.setEnabled(S.settings.commentary !== false); LG.cm.setVoiceEnabled(S.settings.voice !== false); LG.cm.refreshVoices(); }
      const b = LG.root.querySelector('#btn-booth'); if (b) b.classList.toggle('on', S.settings.commentary !== false);
      UI.save();
    };
    UI.on(m.body, 'change', '[data-b]', (e, el) => { S.settings[el.dataset.b] = el.checked; apply(); });
    UI.on(m.body, 'input', '[data-range]', (e, el) => { S.settings[el.dataset.range] = (+el.value) / 100; apply(); });
    UI.on(m.body, 'change', '[data-voice]', (e, el) => { S.settings[el.dataset.voice] = el.value || null; apply(); });
    UI.on(m.body, 'click', '[data-bseg] button', (e, el) => {
      const key = el.closest('[data-bseg]').dataset.bseg;
      S.settings[key] = el.dataset.v;
      el.parentNode.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === el));
      apply();
    });
    UI.on(m.body, 'click', '[data-test-voice]', () => { if (LG && LG.cm) { LG.cm.unlock(); LG.cm.test(); } });

    // ---- premium AI announcers: the key lives only in this browser's localStorage, never in a save file
    const cloudSec = m.body.querySelector('[data-cloud-sec]');
    const setCloud = patch => {
      const c = Object.assign(getCloud(), patch);
      if (LG && LG.cm) LG.cm.setCloud(c); else PBC.Commentary.saveCloud(c);
      const h = m.body.querySelector('[data-voice-hint]'); if (h && LG && LG.cm) h.textContent = LG.cm.voiceHint();
      return c;
    };
    const status = (msg, cls) => { const el = cloudSec.querySelector('[data-cloud-status]'); if (el) { el.textContent = msg || ''; el.className = 'tiny bm-status ' + (cls || ''); } };
    const redraw = () => { cloudSec.innerHTML = cloudSection(); };
    UI.on(cloudSec, 'click', '[data-cseg] button', (e, el) => {
      const prov = el.dataset.v, cur = getCloud();
      if (prov === cur.provider) return;
      // each service keeps its own key and voices so switching back and forth loses nothing
      const saved = Object.assign({}, cur.saved || {});
      if (cur.provider && cur.provider !== 'off') saved[cur.provider] = { key: cur.key || '', voicePbp: cur.voicePbp || '', voiceColor: cur.voiceColor || '', model: cur.model || '', list: cur.list || null };
      const back = saved[prov] || {};
      setCloud({ provider: prov, key: back.key || '', voicePbp: back.voicePbp || '', voiceColor: back.voiceColor || '', model: back.model || '', saved, list: back.list || null });
      redraw();
    });
    UI.on(cloudSec, 'change', '[data-cloud]', (e, el) => {
      setCloud({ [el.dataset.cloud]: el.value.trim() });
      if (el.dataset.cloud === 'key') status(el.value.trim() ? 'Key saved in this browser. Press Test to check it.' : 'No key: the booth uses browser voices.', '');
    });
    UI.on(cloudSec, 'click', '[data-cloud-show]', () => {
      const k = cloudSec.querySelector('[data-cloud="key"]');
      if (k) k.type = k.type === 'password' ? 'text' : 'password';
    });
    UI.on(cloudSec, 'click', '[data-cloud-forget]', () => { setCloud({ key: '' }); redraw(); status('Key removed from this browser.', ''); });
    UI.on(cloudSec, 'click', '[data-cloud-load]', (e, el) => {
      const c = getCloud();
      if (!c.key) { status('Paste your ElevenLabs API key first.', 'bad'); return; }
      el.disabled = true; status('Loading your voices...', '');
      PBC.Commentary.listElevenVoices(c.key).then(list => {
        setCloud({ list: list.slice(0, 120) });
        redraw();
        status(list.length ? `Loaded ${list.length} voice${list.length === 1 ? '' : 's'} from your account.` : 'Your account has no voices yet. The shared default voices still work.', list.length ? 'good' : '');
      }).catch(err => { el.disabled = false; status(err.message || String(err), 'bad'); });
    });
    UI.on(cloudSec, 'click', '[data-cloud-test]', (e, el) => {
      if (!LG || !LG.cm) return;
      const c = getCloud();
      if (!c.key) { status('Paste your API key first.', 'bad'); return; }
      if (S.settings.voice === false) { status('Turn on "Announcer voices" above first.', 'bad'); return; }
      LG.cm.unlock();
      el.disabled = true; status('Asking ' + (PBC.Commentary.CLOUD[c.provider] || {}).name + ' for the booth intro...', '');
      Promise.resolve(LG.cm.test()).then(r => {
        el.disabled = false;
        if (!r || !r.cloud) status('Premium voices are off.', '');
        else if (r.ok) status('It works! You are hearing the AI announcers.', 'good');
        else status(r.error + ' The booth will use browser voices until this is fixed.', 'bad');
      }).catch(err => { el.disabled = false; status(String(err && err.message || err), 'bad'); });
    });
  }
  function getCloud() {
    return (LG && LG.cm && LG.cm.cloudConfig) ? LG.cm.cloudConfig() : PBC.Commentary.loadCloud();
  }
  /** premium voice settings (inner HTML of the section; re-rendered when the service changes) */
  function cloudSection() {
    const CM = PBC.Commentary;
    if (!CM || !CM.CLOUD) return '';
    const c = getCloud(), prov = c.provider && CM.CLOUD[c.provider] ? c.provider : 'off';
    const gender = (CM.BOOTH[(LG && LG.g && LG.g.L && LG.g.L.key) || 'men'] || CM.BOOTH.men).gender;
    const seg = `<div class="seg" data-cseg="provider">${[['off', 'Off'], ['openai', 'OpenAI'], ['elevenlabs', 'ElevenLabs']].map(([k, l]) => `<button data-v="${k}" class="${prov === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    const intro = `<p class="tiny muted">Studio-quality AI announcers with your own OpenAI or ElevenLabs account. Your key is stored only in this browser, never in your save files, and each game uses a little of your account's credit (OpenAI is the cheaper option, ElevenLabs Eleven v3 is the most expressive). If anything goes wrong the booth switches back to the browser voices.</p>`;
    if (prov === 'off') return `<div class="bm-h">Premium AI announcers <span class="bm-opt">optional</span></div>${intro}<div class="row"><span class="small muted" style="min-width:90px">Service</span>${seg}</div>`;
    const P = CM.CLOUD[prov];
    let voices = P.voices.map(([id, label, gd]) => ({ id, label, gender: gd }));
    if (prov === 'elevenlabs' && Array.isArray(c.list) && c.list.length) {
      const known = new Set(voices.map(v => v.id));
      voices = c.list.filter(v => !known.has(v.id)).concat(voices);
    }
    const def = P.defaults[gender] || P.defaults.m;
    const vsel = (key, cur, dflt) => {
      const inList = !cur || voices.some(v => v.id === cur);
      const opts = voices.map(v => `<option value="${U.esc(v.id)}" ${cur === v.id ? 'selected' : ''}>${U.esc(v.label)}</option>`).join('');
      const dl = (voices.find(v => v.id === dflt) || { label: dflt }).label;
      return `<select class="inp" data-cloud="${key}"><option value="">Default: ${U.esc(dl)}</option>${inList ? '' : `<option value="${U.esc(cur)}" selected>${U.esc(cur)}</option>`}${opts}</select>`;
    };
    const models = P.models.map(([id, l]) => `<option value="${id}" ${(c.model || P.models[0][0]) === id ? 'selected' : ''}>${U.esc(l)}</option>`).join('');
    return `<div class="bm-h">Premium AI announcers <span class="bm-opt">optional</span></div>${intro}
      <div class="row"><span class="small muted" style="min-width:90px">Service</span>${seg}</div>
      <div class="bm-grid">
        <label class="bm-f"><span class="small muted">${P.name} API key</span>
          <span class="bm-key"><input class="inp" type="password" data-cloud="key" value="${U.esc(c.key || '')}" placeholder="${U.esc(P.keyHint)}" autocomplete="off" autocapitalize="off" spellcheck="false"><button class="btn sm ghost" type="button" data-cloud-show title="Show or hide the key">👁</button>${c.key ? '<button class="btn sm ghost" type="button" data-cloud-forget title="Remove the key from this browser">✕</button>' : ''}</span></label>
        <label class="bm-f"><span class="small muted">Model</span><select class="inp" data-cloud="model">${models}</select></label>
        <label class="bm-f"><span class="small muted">Play-by-play voice</span>${vsel('voicePbp', c.voicePbp || '', def[0])}</label>
        <label class="bm-f"><span class="small muted">Analyst voice</span>${vsel('voiceColor', c.voiceColor || '', def[1])}</label>
      </div>
      <div class="row bm-actions"><button class="btn sm" type="button" data-cloud-test>▶ Test AI voices</button>${prov === 'elevenlabs' ? '<button class="btn sm ghost" type="button" data-cloud-load>Load my voices</button>' : ''}<span class="tiny bm-status" data-cloud-status></span></div>
      <p class="tiny muted">${prov === 'openai' ? 'Get a key at platform.openai.com (API keys). The announcers get directions for a real broadcast delivery, calm for the analyst and big energy on highlights.' : 'Get a key at elevenlabs.io (Developers, API keys). The shared default voices work on any account; press "Load my voices" to add voices from your own library.'}</p>`;
  }

  // ---------------------------------------------------------------------------
  // Holds (intro, quarter breaks, replays): the court keeps living, the game waits
  // ---------------------------------------------------------------------------
  function holdFor(secs, onDone, opts) {
    LG.hold = Object.assign({ until: performance.now() + secs * 1000, onDone, skippable: true }, opts || {});
  }
  function skipHold() {
    if (!LG || !LG.hold) return;
    const h = LG.hold; LG.hold = null;
    if (h.onSkip) { try { h.onSkip(); } catch (e) { console.error(e); } }
    if (h.onDone) { try { h.onDone(); } catch (e) { console.error(e); } }
  }

  // ---------------------------------------------------------------------------
  // Main loop
  // ---------------------------------------------------------------------------
  function loop(ts) {
    if (!LG || !LG.alive) return;
    const dtReal = Math.min(0.1, (ts - LG.last) / 1000);
    LG.last = ts;
    try {
      if (LG.hold) {
        const h = LG.hold;
        if (h.replay && LG.view && LG.view.isReplaying) {
          if (!LG.paused) LG.view.update(dtReal);
          if (!LG.view.isReplaying()) { LG.hold = null; if (h.onDone) h.onDone(); }
        } else {
          if (LG.view) LG.view.update(0);
          if (ts >= h.until) { LG.hold = null; if (h.onDone) h.onDone(); }
        }
      } else if (!LG.paused && !LG.busy && !LG.finished) {
        if (LG.possDone) nextPossession();
        else if (LG.view) LG.view.update(dtReal * LG.speed);
        else textTick(dtReal * LG.speed);
      } else if (LG.view && LG.view.update && (LG.busy || LG.paused || LG.finished)) {
        LG.view.update(0);
      }
      if (LG && LG.view) LG.view.render();
      if (LG) {
        if (LG.view) { LG.clockShow = LG.view.clock(); LG.scShow = LG.view.shotClock ? LG.view.shotClock() : LG.scShow; }
        renderBug();
        if (LG.bc) LG.bc.update(dtReal, bugState());
        if (LG.au) LG.au.update(dtReal, audioState());
        if (LG.cm) LG.cm.update(dtReal);
        if (ts - LG.lastPanelRender > 700) { renderPanel(false); renderOnCourt(); LG.lastPanelRender = ts; }
      }
    } catch (e) {
      console.error('live loop error', e);
      if (LG) LG.possDone = true;
    }
    if (LG && LG.alive) LG.raf = requestAnimationFrame(loop);
  }

  function bugState() {
    const g = LG.g;
    return {
      score: LG.dispScore, period: LG.P ? LG.P.period : g.period, clock: LG.view ? LG.clockShow : (LG.text ? LG.clockShow : g.clock),
      shotClock: LG.view && LG.scShow != null ? LG.scShow : null, timeouts: [g.t[0].timeouts, g.t[1].timeouts],
      bonus: [g.t[1].fouls >= g.L.bonus, g.t[0].fouls >= g.L.bonus], fouls: [g.t[0].fouls, g.t[1].fouls],
      final: g.final && LG.finished, off: LG.P ? LG.P.off : -1, paused: LG.paused, speed: LG.speed,
    };
  }
  function audioState() {
    const g = LG.g;
    const lead = LG.dispScore[0] - LG.dispScore[1];
    const late = (LG.P ? LG.P.period : g.period) >= g.L.periods && LG.clockShow < 180;
    return { lead, close: Math.abs(lead) <= 6, late, stakes: LG.stakes.level, playing: !LG.paused && !LG.finished && !LG.busy, speed: LG.speed, off: LG.P ? LG.P.off : -1 };
  }

  /** what the panels show while a possession is on screen: the state after the previous one (no spoilers) */
  function snapStats() {
    const g = LG.g;
    LG.snap = {};
    for (const T of g.t) for (const c of T.players) LG.snap[c.id] = { pts: c.st.pts, reb: c.st.orb + c.st.drb, ast: c.st.ast, pf: c.pf, energy: c.energy };
    LG.boxSnap = PBC.Sim.box(g);
  }

  async function nextPossession() {
    const g = LG.g;
    if (g.final) { finishGame(); return; }
    LG.possDone = false;
    snapStats();
    // Game Impact Moment?
    const gimCtx = PBC.Sim.gimCheck(g);
    let P;
    if (gimCtx) {
      LG.busy = true;
      if (LG.cm) LG.cm.gimSetup(gimCtx);
      const choice = await gimChoose(gimCtx);
      if (!LG) return;
      LG.busy = false;
      const opt = gimCtx.options[choice] || gimCtx.options[0];
      P = PBC.Sim.startGimPossession(g, opt);
      pushLine({ q: g.period, clock: g.clock, text: `🎯 GAME IMPACT MOMENT: ${opt.label} for ${opt.player}`, type: 'gim', team: LG.uIdx });
    } else {
      P = PBC.Sim.nextPossession(g);
    }
    LG.P = P;
    if (!P) { finishGame(); return; }
    showPlayLabel(P);
    if (LG.bc) LG.bc.onPossession(P);
    if (LG.cm) LG.cm.onPossession(P);
    if (LG.view) {
      if (P.defScheme && LG.view.setDefScheme) LG.view.setDefScheme(1 - P.off, P.defScheme);
      LG.view.play(P, { onEvent: onViewEvent, onDone: () => { if (LG) { syncScore(P); afterPossession(P); } } });
    } else {
      startText(P);
    }
  }

  /** after a possession is fully shown: quarter breaks, replays of big plays, then the next trip */
  function afterPossession(P) {
    if (!LG) return;
    const last = P.events[P.events.length - 1];
    const hl = LG.highlight; LG.highlight = null;
    const periodEnd = last && last.type === 'period_end';
    const canReplay = hl && LG.view && LG.view.startReplay && LG.S.settings.replays !== false && LG.speed <= 4 && !LG.g.final;
    const next = () => {
      if (!LG) return;
      if (periodEnd && !LG.g.final) quarterBreak(P);
      else LG.possDone = true;
    };
    if (canReplay) {
      const ok = LG.view.startReplay({ t: hl.t, before: hl.before || 2.6, after: hl.after || 1.1, speed: hl.speed || 0.45, focus: hl.focus });
      if (ok) {
        if (LG.bc) LG.bc.replayOn(hl);
        if (LG.cm) LG.cm.onReplay(hl);
        LG.hold = { replay: true, skippable: true, onSkip: () => { if (LG && LG.view && LG.view.stopReplay) LG.view.stopReplay(); }, onDone: () => { if (LG && LG.bc) LG.bc.replayOff(); next(); } };
        return;
      }
    }
    next();
  }

  function quarterBreak(P) {
    const g = LG.g;
    const per = P.period;
    const final = g.final;
    if (final) { LG.possDone = true; return; }
    const secs = LG.S.settings.tvGraphics === false ? 0 : (per === 2 ? 7 : 5) / Math.sqrt(Math.max(1, LG.speed / 2));
    if (LG.bc) LG.bc.showPeriodCard(per, PBC.Sim.box(g));
    if (LG.cm) LG.cm.onBreak(per);
    if (secs <= 0.2) { if (LG.bc) LG.bc.hidePeriodCard(); LG.possDone = true; return; }
    holdFor(secs, () => { if (LG) { if (LG.bc) LG.bc.hidePeriodCard(); LG.possDone = true; } });
  }

  // events from the court view (fired when they visibly happen)
  function onViewEvent(ev) {
    if (!LG) return;
    if (ev.type === 'score') {
      LG.dispScore[ev.team] += ev.pts; flashScore(ev.team);
      noteHighlight(ev.shotEvent || {}, true);
      if (LG.bc) LG.bc.onEvent(ev, LG.P, LG.dispScore);
      if (LG.cm) LG.cm.onEvent(ev, LG.P, LG.dispScore);
      if (LG.au) LG.au.onEvent(ev, LG.P);
      return;
    }
    handleEvent(ev);
    if (ev.type === 'shot' && ev.blocked) noteHighlight(ev, false);
    if (ev.type === 'turnover' && ev.stealer && LG.P && LG.P.events.some(e => e.type === 'shot' && e.made && (e.kind === 'dunk' || e.kind === 'layup'))) { /* steal & score handled on score */ }
    if (LG.bc) LG.bc.onEvent(ev, LG.P, LG.dispScore);
    if (LG.cm) LG.cm.onEvent(ev, LG.P, LG.dispScore);
    if (LG.au) LG.au.onEvent(ev, LG.P);
    if (ev.type === 'shot' && ev.pending) resolveGimShot(ev);
  }

  /** remember replay-worthy moments of this possession */
  function noteHighlight(shot, made) {
    if (!LG.view || !LG.view.time) return;
    const g = LG.g;
    const lateClose = (LG.P && LG.P.period >= g.L.periods) && Math.abs(LG.dispScore[0] - LG.dispScore[1]) <= 3 && LG.clockShow <= 24;
    let score = 0, label = '';
    if (made) {
      if (shot.kind === 'dunk' || shot.kind === 'alley') { score = shot.kind === 'alley' ? 3 : 2; label = shot.kind === 'alley' ? 'ALLEY-OOP' : 'SLAM DUNK'; }
      if (shot.andOne) { score += 1.5; label = label || 'AND ONE'; }
      if (shot.kind === 'heave') { score = 5; label = 'FROM WAY DOWNTOWN'; }
      if (shot.pts === 3 && lateClose) { score = Math.max(score, 3); label = 'CLUTCH THREE'; }
      if (lateClose && LG.clockShow <= 6) { score = 5; label = 'BUZZER BEATER'; }
      if (shot.gim) { score = Math.max(score, 3); label = label || 'GAME IMPACT MOMENT'; }
      if (shot.kind === 'stepback' && shot.pts === 3 && Math.random() < 0.3) { score = Math.max(score, 1.2); label = label || 'STEP-BACK THREE'; }
    } else if (shot.blocked) { score = 2.2; label = 'REJECTED'; }
    if (!score) return;
    if (!LG.highlight || score > LG.highlight.score) {
      const focus = { x: shot.x, y: shot.y };
      LG.highlight = { t: LG.view.time, score, label, shot, focus, team: shot.team, before: shot.kind === 'dunk' || shot.kind === 'alley' ? 2.4 : 2.1, after: made ? 1.3 : 1.0 };
    }
  }

  function handleEvent(ev) {
    const g = LG.g;
    if (ev.type === 'ft' && ev.made) { LG.dispScore[ev.team] += 1; flashScore(ev.team); }
    if (!LG.view && ev.type === 'shot' && ev.made) { LG.dispScore[ev.team] += ev.pts; flashScore(ev.team); }
    if (ev.text) pushLine({ q: LG.P.period, clock: Math.max(0, LG.P.clockStart - ev.t), text: ev.text, type: ev.type, team: ev.team, made: ev.made });
    if (!LG.view && LG.textStage) textVisual(ev);
    if (ev.type === 'sub' || ev.type === 'timeout') renderOnCourt();
    void g;
  }

  function syncScore(P) {
    if (!LG || !P.endScore) return;
    LG.dispScore = P.endScore.slice();
  }

  async function resolveGimShot(ev) {
    if (!LG) return;
    LG.busy = true;
    const g = LG.g, P = LG.P;
    const sh = g.t[LG.uIdx].players.find(c => c.id === ev.shooter);
    const r = sh ? sh.r : { three: 70, mid: 70, layup: 70, dunk: 60, clutch: 60 };
    const skill = ev.zone === 'rim' ? Math.max(r.layup, r.dunk) : ev.zone === 'paint' ? (r.close + r.post) / 2 : ev.zone === 'mid' ? r.mid : r.three;
    const contestMul = ev.contest === 'open' ? 1.25 : ev.contest === 'tight' ? 0.7 : 1;
    const windowSize = U.clamp((0.035 + (skill - 55) / 40 * 0.06 + (r.clutch - 60) / 40 * 0.02) * contestMul, 0.03, 0.16);
    const opts = { label: ev.kind === 'dunk' || ev.kind === 'alley' ? 'Finish at the rim' : (ev.pts === 3 ? 'Three-pointer' : 'Jumper') + '', player: sh ? sh.name : '', windowSize, speed: 1 + (g.clock < 5 ? 0.15 : 0), contest: ev.contest, pressure: g.clock < 10 ? 0.8 : 0.5, timeLimit: 8 };
    const res = await shotMeter(opts);
    if (!LG) return;
    PBC.Sim.resolvePending(g, P, res);
    const shot = P.events.find(e => e === ev) || ev;
    pushLine({ q: P.period, clock: Math.max(0, P.clockStart - shot.t), text: `Release: ${qualityLabel(res.quality)}`, type: 'gim', team: LG.uIdx });
    LG.busy = false;
    if (LG.view && LG.view.resume) LG.view.resume();
    else if (!LG.view) { resumeText(); }
  }

  function qualityLabel(q) { return { perfect: '🟢 PERFECT', good: '✅ Good', early: '⚠️ Slightly early', late: '⚠️ Slightly late', very_early: '❌ Way early', very_late: '❌ Way late', no_release: '❌ No release' }[q] || q; }

  // ---------------------------------------------------------------------------
  // GIM UI (uses PBC.Mini when available, with built-in fallbacks)
  // ---------------------------------------------------------------------------
  async function gimChoose(ctx) {
    const overlay = LG.root.querySelector('#overlay');
    overlay.classList.add('on');
    let res;
    try {
      if (PBC.Mini && PBC.Mini.gimChoose) res = await PBC.Mini.gimChoose(overlay, Object.assign({ timeLimit: 15 }, ctx));
      else res = await fallbackChoose(overlay, ctx);
    } catch (e) { console.error(e); res = { index: 0 }; }
    overlay.classList.remove('on');
    overlay.innerHTML = '';
    return res && res.index != null ? res.index : 0;
  }
  async function shotMeter(opts) {
    const overlay = LG.root.querySelector('#overlay');
    overlay.classList.add('on', 'clear');
    const liveEl = LG.root.querySelector('.live');
    if (liveEl) liveEl.classList.add('meter-on'); // captions move out of the meter's way
    let res;
    try {
      if (PBC.Mini && PBC.Mini.shotMeter) res = await PBC.Mini.shotMeter(overlay, opts);
      else res = await fallbackMeter(overlay, opts);
    } catch (e) { console.error(e); res = { quality: 'good', score: 0.6 }; }
    overlay.classList.remove('on', 'clear');
    overlay.innerHTML = '';
    if (LG && liveEl) liveEl.classList.remove('meter-on');
    if (!res || res.cancelled) res = { quality: 'late', score: 0.3 };
    return res;
  }

  function fallbackChoose(overlay, ctx) {
    return new Promise(resolve => {
      overlay.innerHTML = `<div class="gim-fb"><div class="gim-t">GAME IMPACT MOMENT</div><div class="gim-s">${U.esc(ctx.situation)}</div>
        <div class="gim-opts">${ctx.options.map((o, i) => `<button class="btn lg" data-i="${i}"><b>${i + 1}. ${U.esc(o.label)}</b><br><span class="small">${U.esc(o.player)} · ${Math.round(o.pct * 100)}% · ${o.pts} pts</span></button>`).join('')}</div></div>`;
      const done = i => { document.removeEventListener('keydown', key); resolve({ index: i }); };
      const key = e => { const i = +e.key - 1; if (i >= 0 && i < ctx.options.length) done(i); };
      document.addEventListener('keydown', key);
      overlay.querySelectorAll('[data-i]').forEach(b => { b.onclick = () => done(+b.dataset.i); });
    });
  }
  function fallbackMeter(overlay, opts) {
    return new Promise(resolve => {
      overlay.innerHTML = `<div class="gim-fb"><div class="gim-t">${U.esc(opts.player)}: ${U.esc(opts.label)}</div><div class="gim-s">Hold SPACE (or press and hold) and release in the green</div>
        <div class="fb-meter"><div class="fb-win" style="bottom:${(0.9 - opts.windowSize) * 100}%;height:${opts.windowSize * 100}%"></div><div class="fb-fill"></div></div></div>`;
      const fill = overlay.querySelector('.fb-fill');
      let start = 0, raf = 0, holding = false, done = false;
      const finish = v => {
        if (done) return; done = true; cancelAnimationFrame(raf);
        document.removeEventListener('keydown', down); document.removeEventListener('keyup', up);
        const center = 0.9 - opts.windowSize / 2, err = v - center, half = opts.windowSize / 2;
        const q = v < 0 ? 'no_release' : Math.abs(err) <= half * 0.35 ? 'perfect' : Math.abs(err) <= half ? 'good' : Math.abs(err) <= half * 2.5 ? (err < 0 ? 'early' : 'late') : err < 0 ? 'very_early' : 'very_late';
        setTimeout(() => resolve({ quality: q, score: U.clamp(1 - Math.abs(err) / 0.3, 0, 1), error: err }), 250);
      };
      const tick = () => { const v = Math.min(1, Math.pow((performance.now() - start) / 950, 1.4)); fill.style.height = v * 100 + '%'; if (v >= 1) finish(1); else raf = requestAnimationFrame(tick); };
      const down = e => { if ((e.code === 'Space' || e.type === 'pointerdown') && !holding) { holding = true; start = performance.now(); tick(); } };
      const up = () => { if (holding) finish(Math.min(1, Math.pow((performance.now() - start) / 950, 1.4))); };
      document.addEventListener('keydown', down); document.addEventListener('keyup', up);
      overlay.onpointerdown = down; overlay.onpointerup = up;
      setTimeout(() => { if (!holding) finish(-1); }, (opts.timeLimit || 8) * 1000);
    });
  }

  // ---------------------------------------------------------------------------
  // Text mode (no court view): timeline + shot chart
  // ---------------------------------------------------------------------------
  function buildTextStage() {
    const el = LG.root.querySelector('#lvtext');
    if (!el) { LG.textStage = null; return; }
    const t0 = LG.teams[0], t1 = LG.teams[1];
    el.innerHTML = `<div class="tx-court"><svg viewBox="0 0 940 500" id="shotchart"><rect x="0" y="0" width="940" height="500" rx="10" fill="#1a1410"/>
      <g fill="none" stroke="rgba(255,255,255,.28)" stroke-width="3"><rect x="4" y="4" width="932" height="492" rx="6"/><line x1="470" y1="4" x2="470" y2="496"/><circle cx="470" cy="250" r="60"/>
      <rect x="4" y="170" width="190" height="160" fill="${U.rgba(t0.colors.primary, 0.35)}"/><rect x="746" y="170" width="190" height="160" fill="${U.rgba(t0.colors.primary, 0.35)}"/>
      <circle cx="190" cy="250" r="60"/><circle cx="750" cy="250" r="60"/><path d="M4 30 H144 A237 237 0 0 1 144 470 H4"/><path d="M936 30 H796 A237 237 0 0 0 796 470 H936"/>
      <circle cx="52" cy="250" r="8" stroke="#ff7a2e"/><circle cx="888" cy="250" r="8" stroke="#ff7a2e"/></g>
      <text x="470" y="262" text-anchor="middle" font-size="40" font-weight="900" fill="rgba(255,255,255,.12)" font-family="Avenir Next Condensed, Arial Narrow">${U.esc(t0.abbr)}</text>
      <g id="shots"></g><circle id="ballmark" r="9" fill="#ff8a3d" stroke="#3a1804" stroke-width="2" cx="470" cy="250"/></svg></div>
      <div class="tx-last" id="txlast"></div>`;
    LG.textStage = el;
    void t1;
  }
  function courtToSvg(x, y) { return [x * 10, (50 - y) * 10]; }
  function textVisual(ev) {
    const svg = LG.textStage.querySelector('#shots');
    const ball = LG.textStage.querySelector('#ballmark');
    if (ev.type === 'shot' && ev.x != null) {
      const [sx, sy] = courtToSvg(ev.x, ev.y);
      const col = LG.teams[ev.team].colors.primary;
      svg.insertAdjacentHTML('beforeend', ev.made ? `<circle cx="${sx}" cy="${sy}" r="7" fill="${U.shade(col, 0.2)}" stroke="#fff" stroke-width="1.5" opacity=".95"/>` : `<g stroke="${U.shade(col, 0.2)}" stroke-width="3" opacity=".8"><line x1="${sx - 6}" y1="${sy - 6}" x2="${sx + 6}" y2="${sy + 6}"/><line x1="${sx + 6}" y1="${sy - 6}" x2="${sx - 6}" y2="${sy + 6}"/></g>`);
      while (svg.childNodes.length > 60) svg.removeChild(svg.firstChild);
      ball.setAttribute('cx', sx); ball.setAttribute('cy', sy);
    } else if ((ev.type === 'rebound' || ev.type === 'turnover') && ev.x != null) {
      const [sx, sy] = courtToSvg(ev.x, ev.y); ball.setAttribute('cx', sx); ball.setAttribute('cy', sy);
    }
    const last = LG.textStage.querySelector('#txlast');
    if (ev.text) last.innerHTML = `<span class="tx-team" style="background:${LG.teams[ev.team] ? LG.teams[ev.team].colors.primary : '#333'}">${LG.teams[ev.team] ? LG.teams[ev.team].abbr : ''}</span> ${U.esc(ev.text)}`;
  }
  function startText(P) {
    // display time for each event: game time + dead time for stoppages
    let dead = 0, prevT = -1;
    const times = P.events.map(e => {
      if (e.t === prevT && (e.type === 'ft' || e.type === 'foul' || e.type === 'sub' || e.type === 'timeout')) dead += e.type === 'ft' ? 1.4 : e.type === 'timeout' ? 2.5 : 0.5;
      prevT = e.t;
      return e.t + dead;
    });
    LG.text = { P, idx: 0, t: 0, times, end: (times.length ? times[times.length - 1] : 0) + 1.2, waiting: false };
  }
  function resumeText() {
    // events were appended after the pending shot: rebuild the timeline, keep position
    const tx = LG.text;
    const keep = tx.idx, tNow = tx.t;
    startText(tx.P);
    LG.text.idx = keep; LG.text.t = tNow; LG.text.waiting = false;
  }
  function textTick(dt) {
    const tx = LG.text;
    if (!tx || tx.waiting) return;
    tx.t += dt;
    LG.clockShow = Math.max(LG.text.P.clockEnd != null ? LG.text.P.clockEnd : 0, tx.P.clockStart - Math.min(tx.t, tx.P.clockStart));
    while (tx.idx < tx.P.events.length && tx.times[tx.idx] <= tx.t) {
      const ev = tx.P.events[tx.idx++];
      handleEvent(ev);
      if (LG.bc) LG.bc.onEvent(ev, tx.P, LG.dispScore);
      if (LG.cm) LG.cm.onEvent(ev, tx.P, LG.dispScore);
      if (LG.au) LG.au.onEvent(ev, tx.P);
      if (ev.type === 'shot' && ev.pending) { tx.waiting = true; resolveGimShot(ev); return; }
    }
    if (tx.idx >= tx.P.events.length && tx.t >= tx.end) {
      LG.clockShow = tx.P.clockEnd != null ? tx.P.clockEnd : LG.g.clock;
      syncScore(tx.P);
      afterPossession(tx.P);
    }
  }

  // ---------------------------------------------------------------------------
  // Scoreboard, panels
  // ---------------------------------------------------------------------------
  function renderBug() {
    const g = LG.g;
    const el = LG.root.querySelector('#bug');
    const T = LG.teams;
    const per = LG.P ? LG.P.period : g.period;
    const L = g.L;
    const clock = LG.view ? LG.clockShow : (LG.text ? LG.clockShow : g.clock);
    const bonus = i => (g.t[1 - i].fouls >= L.bonus ? '<span class="bonus">BONUS</span>' : '');
    const tos = i => `<span class="tos">${'•'.repeat(Math.max(0, g.t[i].timeouts))}</span>`;
    const side = (i) => `<div class="bug-team" style="--c:${T[i].colors.primary}">${UI.teamBadge(T[i], 30)}<span class="ab">${T[i].abbr}</span><span class="sc" id="sc${i}">${LG.dispScore[i]}</span><div class="bug-sub">${tos(i)}${bonus(i)}</div></div>`;
    const key = `${LG.dispScore[0]}|${LG.dispScore[1]}|${per}|${U.clock(clock, true)}|${Math.ceil(Math.max(0, LG.scShow || 0))}|${g.t[0].timeouts}${g.t[1].timeouts}|${g.t[0].fouls >= L.bonus}${g.t[1].fouls >= L.bonus}|${LG.finished}`;
    if (el && el._key !== key) {
      el._key = key;
      el.innerHTML = `${side(1)}<div class="bug-mid"><div class="per">${g.final && LG.finished ? 'FINAL' : U.periodName(per, true)}</div><div class="clk">${U.clock(clock, true)}</div>${LG.view && LG.scShow != null ? `<div class="shc">${Math.ceil(Math.max(0, LG.scShow))}</div>` : ''}</div>${side(0)}`;
    }
    const tl = LG.root.querySelector('#to-left'); if (tl) tl.textContent = g.t[LG.uIdx].timeouts;
  }
  function flashScore(i) {
    const el = LG.root.querySelector('#sc' + i);
    if (el) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
    if (LG.bc && LG.bc.flash) LG.bc.flash(i);
  }
  function showPlayLabel(P) {
    const el = LG.root.querySelector('#playlabel');
    if (LG.bc) { if (el) el.classList.remove('on'); return; } // the TV graphics package shows the set name
    if (!el || !P.setName) { if (el) el.classList.remove('on'); return; }
    const t = LG.teams[P.off];
    el.innerHTML = `<span style="background:${t.colors.primary};color:${U.textOn(t.colors.primary)}">${t.abbr}</span>${U.esc(P.setName)}`;
    el.classList.add('on');
    clearTimeout(LG.playLabelT);
    LG.playLabelT = setTimeout(() => el && el.classList.remove('on'), 3500 / Math.sqrt(LG.speed || 1));
  }

  function pushLine(l) {
    LG.lines.unshift(l);
    if (LG.lines.length > 300) LG.lines.length = 300;
    if (LG.tab === 'pbp') renderPanel(true);
  }

  function renderPanel(force) {
    if (!LG) return;
    const panel = LG.root.querySelector('#panel');
    if (!panel) return;
    if (LG.tab === 'pbp') {
      if (!force) return;
      panel.innerHTML = `<div class="lv-pbp">${LG.lines.slice(0, 120).map(l => {
        const t = l.team != null ? LG.teams[l.team] : null;
        const cls = l.type === 'gim' ? 'gim' : l.type === 'period_end' ? 'q' : l.made ? 'made' : l.type === 'injury' ? 'inj' : l.type === 'booth' ? 'booth' : '';
        return `<div class="lv-li ${cls}"><span class="c">${U.periodName(l.q, true)} ${U.clock(l.clock, true)}</span><span>${t ? `<b style="color:${U.shade(t.colors.primary, 0.4)}">${t.abbr}</b> ` : ''}${U.esc(l.text)}</span></div>`;
      }).join('')}</div>`;
    } else if (LG.tab === 'box') {
      if (!force && LG.busy) return;
      const bx = LG.possDone || !LG.boxSnap ? PBC.Sim.box(LG.g) : LG.boxSnap;
      const key = JSON.stringify([bx.hs, bx.as, bx.teams.map(t => t.players.map(x => x.pts + x.min))]);
      if (!force && panel._boxKey === key) return;
      panel._boxKey = key;
      panel.innerHTML = `<div class="lv-box">${UI.boxScoreHtml(LG.S, bx, { noPbp: true })}</div>`;
    } else if (LG.tab === 'coach') {
      if (!force) return;
      renderCoach(panel);
    }
  }

  function renderCoach(panel) {
    const g = LG.g, T = g.t[LG.uIdx];
    const st = T.strat;
    const sel = (key, obj) => `<select class="inp" data-cs="${key}">${Object.keys(obj).map(k => `<option value="${k}" ${st[key] === k ? 'selected' : ''}>${obj[k].label}</option>`).join('')}</select>`;
    const row = c => `<div class="cp-row ${LG.subPick === c.id ? 'pick' : ''} ${c.out || c.inj ? 'dis' : ''}" data-pc="${c.id}">
      ${UI.avatar(c.p, 26)}<span class="ellip" style="flex:1">${U.esc(c.last)} <span class="dim tiny">${c.pos}</span></span>
      <span class="tiny ${c.pf >= 4 ? 'bad-t' : 'dim'}">${c.pf}PF</span><span class="tiny">${c.st.pts}p</span>
      <span class="en"><i style="width:${Math.round(c.energy)}%;background:${c.energy > 70 ? 'var(--good)' : c.energy > 50 ? 'var(--warn)' : 'var(--bad)'}"></i></span></div>`;
    const bench = T.players.filter(c => !c.on);
    const queued = T.manualSubs.map(m => `${T.players.find(c => c.id === m.in).last} for ${T.players.find(c => c.id === m.out).last}`);
    panel.innerHTML = `<div class="lv-coach">
      <div class="small up muted">On the floor ${LG.subPick ? '<span class="tag accent">pick who comes out</span>' : ''}</div>${T.on.map(row).join('')}
      <div class="small up muted" style="margin-top:10px">Bench <span class="tiny dim">(tap a bench player, then the player to replace)</span></div>${bench.map(row).join('')}
      ${queued.length ? `<div class="tag warn" style="margin-top:6px">Queued at next dead ball: ${U.esc(queued.join(', '))}</div>` : ''}
      <label class="chk" style="margin:10px 0"><input type="checkbox" id="auto-subs" ${T.autoSubs ? 'checked' : ''}> Auto substitutions</label>
      <div class="cp-grid"><label>Offense</label>${sel('off', C.OFFENSES)}<label>Defense</label>${sel('def', C.DEFENSES)}<label>Tempo</label>${sel('tempo', C.TEMPOS)}
        <label>Focus</label>${sel('focus', C.FOCUS)}<label>Glass</label>${sel('crash', C.CRASH)}<label>Pressure</label>${sel('pressure', C.PRESSURE)}</div>
      <p class="tiny muted">Changes take effect on the next possession. Timeouts left: ${T.timeouts}.</p></div>`;
    panel.querySelectorAll('[data-cs]').forEach(s => {
      s.onchange = () => {
        PBC.Sim.setStrategy(g, LG.uIdx, { [s.dataset.cs]: s.value });
        if (s.dataset.cs === 'def' && LG.view && LG.view.setDefScheme) LG.view.setDefScheme(LG.uIdx, s.value);
        UI.toast(`${s.options[s.selectedIndex].text}: coming up`, 'info');
        if (LG.cm && LG.cm.onAdjust) LG.cm.onAdjust(s.dataset.cs, s.value);
      };
    });
    panel.querySelector('#auto-subs').onchange = e => PBC.Sim.setAutoSubs(g, LG.uIdx, e.target.checked);
    panel.querySelectorAll('[data-pc]').forEach(r => {
      r.onclick = () => {
        const id = +r.dataset.pc;
        const c = T.players.find(x => x.id === id);
        if (!c || c.out || c.inj) return;
        if (!c.on) { LG.subPick = LG.subPick === id ? null : id; renderCoach(panel); return; }
        if (LG.subPick) {
          PBC.Sim.queueSub(g, LG.uIdx, id, LG.subPick);
          UI.toast(`${T.players.find(x => x.id === LG.subPick).last} will check in for ${c.last} at the next dead ball`, 'info');
          LG.subPick = null;
          renderCoach(panel);
        }
      };
    });
  }

  function renderOnCourt() {
    if (!LG) return;
    const el = LG.root.querySelector('#oncourt');
    if (!el) return;
    const g = LG.g;
    const html = [LG.uIdx, 1 - LG.uIdx].map(i => {
      const T = g.t[i];
      const sn = c => (!LG.possDone && LG.snap && LG.snap[c.id]) || { pts: c.st.pts, reb: c.st.orb + c.st.drb, ast: c.st.ast, pf: c.pf, energy: c.energy };
      const onIds = LG.view && LG.view.onCourt ? LG.view.onCourt[i] : null;
      const on = onIds && onIds.length === 5 ? onIds.map(id => T.players.find(c => c.id === id)).filter(Boolean) : T.on;
      return `<div class="oc-team"><span class="oc-ab" style="background:${LG.teams[i].colors.primary};color:${U.textOn(LG.teams[i].colors.primary)}">${LG.teams[i].abbr}</span>${on.map(c => { const x = sn(c); return `
        <div class="oc-p" title="${U.esc(c.name)}">${UI.avatar(c.p, 30)}<div class="oc-i"><div class="ellip"><b>${U.esc(c.last)}</b></div><div class="tiny dim">${x.pts} pts · ${x.reb} reb · ${x.ast} ast · ${x.pf} PF</div>
        <span class="en"><i style="width:${Math.round(x.energy)}%;background:${x.energy > 70 ? 'var(--good)' : x.energy > 50 ? 'var(--warn)' : 'var(--bad)'}"></i></span></div></div>`; }).join('')}</div>`;
    }).join('');
    if (el._html !== html) { el._html = html; el.innerHTML = html; }
  }

  // ---------------------------------------------------------------------------
  // Coach actions
  // ---------------------------------------------------------------------------
  function callTimeout() {
    const g = LG.g;
    if (g.t[LG.uIdx].timeouts <= 0) { UI.toast('No timeouts left', 'bad'); return; }
    if (g.t[LG.uIdx].toRequest) { UI.toast('Timeout already requested', 'info'); return; }
    PBC.Sim.callTimeout(g, LG.uIdx);
    UI.toast('⏱ Timeout requested. It will be called at the next dead ball. Adjust your lineup in the Coach tab.', 'info');
    LG.tab = 'coach';
    LG.root.querySelectorAll('.lv-tabs .tab').forEach(b => b.classList.toggle('active', b.dataset.tab === 'coach'));
    const live = LG.root.querySelector('.live'); if (live && live.classList.contains('no-side')) toggleSide();
    renderPanel(true);
  }

  /** Instantly simulate possessions (no visuals) until a condition is met. */
  function fastForward(stop) {
    const g = LG.g;
    let guard = 0;
    while (!g.final && guard++ < 1000) {
      if (stop && stop(g)) break;
      const P = PBC.Sim.nextPossession(g);
      if (g.pending) PBC.Sim.resolvePending(g, P, { quality: 'good' });
      for (const e of P.events) if (e.type === 'period_end' || (e.type === 'shot' && (e.made && e.pts === 3 || e.kind === 'dunk'))) {
        if (e.text) LG.lines.unshift({ q: P.period, clock: Math.max(0, P.clockStart - e.t), text: e.text, type: e.type, team: e.team, made: e.made });
      }
      LG.dispScore = P.endScore.slice();
    }
    if (LG.lines.length > 300) LG.lines.length = 300;
  }

  function resetViewAfterJump() {
    LG.possDone = true;
    LG.text = null;
    LG.hold = null; LG.highlight = null;
    if (LG.view && LG.view.destroy) {
      try { LG.view.destroy(); } catch (e) { console.error(e); }
      const stage = LG.root.querySelector('#stage');
      const old = stage.querySelector('canvas'); if (old) old.remove();
      stage.insertAdjacentHTML('afterbegin', '<canvas id="court"></canvas>');
      try {
        LG.view = UI.makeCourtView(stage.querySelector('#court'), LG.S, LG.g);
        if (LG.view) {
          LG.view.period = LG.g.period;
          if (LG.view.setAtmosphere) LG.view.setAtmosphere({ playoff: LG.stakes.playoff, level: LG.stakes.level, effort: LG.g.intensity, label: LG.stakes.short, finals: LG.stakes.playoff && LG.stakes.roundName === 'Finals' });
          LG.view.onSound = (name, v) => { if (LG && LG.au) LG.au.play(name, v); };
          if (LG.bc) LG.bc.setView(LG.view);
        }
        LG.onResize();
      } catch (e) { console.error(e); LG.view = null; }
    }
    LG.clockShow = LG.g.clock;
    renderPanel(true); renderOnCourt();
  }

  async function skipToClutch() {
    const L = LG.g.L;
    LG.busy = true;
    await new Promise(r => setTimeout(r, 20));
    fastForward(g => (g.period >= L.periods && g.clock <= 150) || g.period > L.periods || !!PBC.Sim.gimCheck(g));
    LG.busy = false;
    resetViewAfterJump();
    if (LG.cm) LG.cm.onJump();
    if (LG.g.final) finishGame();
    else UI.toast('⏭ Crunch time!', 'info');
  }

  async function simToEnd() {
    if (!(await UI.confirm('Simulate the rest of this game? Remaining clutch moments will be decided by the sim.', { ok: 'Sim to the end' }))) return;
    if (!LG) return;
    LG.busy = true;
    fastForward(null);
    LG.busy = false;
    LG.possDone = true;
    finishGame();
  }

  async function leaveGame() {
    if (LG.finished) { closeGame(); return; }
    if (!(await UI.confirm('Leave the game? The rest of it will be simulated.', { ok: 'Leave & sim' }))) return;
    if (!LG) return;
    LG.busy = true;
    fastForward(null);
    finishGame(true);
  }

  // ---------------------------------------------------------------------------
  // Finish
  // ---------------------------------------------------------------------------
  function finishGame(silent) {
    if (!LG || LG.finished) return;
    LG.finished = true;
    // a replay or quarter card still on screen (e.g. "End" pressed mid-replay) is cleared first
    const h = LG.hold; LG.hold = null;
    if (h && h.replay && LG.view && LG.view.stopReplay) { try { LG.view.stopReplay(); } catch (e) { /* ignore */ } }
    if (LG.bc) { try { LG.bc.replayOff(); LG.bc.hidePeriodCard(); } catch (e) { /* ignore */ } }
    const S = LG.S, g = LG.g, sg = LG.sg;
    const box = PBC.Sim.finalize(g);
    PBC.Season.completeGame(S, sg, box);
    PBC.Season.simDay(S, { skipUser: true });
    UI.save();
    LG.dispScore = [box.hs, box.as];
    renderBug();
    const winner = box.hs > box.as ? 0 : 1;
    if (LG.view && LG.view.celebrate) { try { LG.view.celebrate(winner); } catch (e) { /* ignore */ } }
    if (LG.au) LG.au.onFinal(winner, LG.uIdx);
    if (LG.cm) LG.cm.onFinal(box);
    if (LG.bc) LG.bc.onFinal(box);
    if (silent) { closeGame(); PBC.App.resultToast(box); return; }
    const u = LG.uIdx;
    const my = u === 0 ? box.hs : box.as, th = u === 0 ? box.as : box.hs;
    const pog = box.pog != null ? S.players[box.pog] : null;
    const pl = pog ? box.teams.flatMap(t => t.players).find(x => x.pid === pog.id) : null;
    const overlay = LG.root.querySelector('#overlay');
    const stakes = LG.stakes;
    let seriesLine = '';
    if (stakes.playoff && S.playoffs && sg.series) {
      const s = S.playoffs.series.find(x => x.id === sg.series);
      if (s) {
        const mw = s.hi === S.userTid ? s.w[0] : s.w[1], tw = s.hi === S.userTid ? s.w[1] : s.w[0];
        seriesLine = s.done ? (s.winner === S.userTid ? `🏆 You win the series ${mw}-${tw}!` : `Season over. Series lost ${mw}-${tw}.`) : `Series: ${mw > tw ? 'you lead' : mw < tw ? 'you trail' : 'tied'} ${mw}-${tw}`;
      }
    }
    setTimeout(() => {
      if (!LG || !overlay) return;
      overlay.classList.add('on');
      overlay.innerHTML = `<div class="final-card ${my > th ? 'win' : 'loss'} ${stakes.playoff ? 'po' : ''}">
        ${stakes.playoff ? `<div class="fc-po">${U.esc(stakes.roundName || 'Playoffs')}${stakes.gameNum ? ' · Game ' + stakes.gameNum : ''}</div>` : ''}
        <div class="fc-res">${my > th ? 'VICTORY' : 'DEFEAT'}</div>
        <div class="fc-score">${UI.teamBadge(LG.teams[1], 54)}<span>${box.as}</span><span class="dim">-</span><span>${box.hs}</span>${UI.teamBadge(LG.teams[0], 54)}</div>
        <div class="small muted">${box.ot ? (box.ot > 1 ? box.ot : '') + 'OT · ' : ''}${S.teams[S.userTid].name} ${my > th ? 'win' : 'lose'} by ${Math.abs(my - th)}</div>
        ${seriesLine ? `<div class="fc-series">${U.esc(seriesLine)}</div>` : ''}
        ${pog ? `<div class="fc-pog">${UI.avatar(pog, 64)}<div><div class="tiny up gold-t">Player of the game</div><div class="bold">${U.esc(PBC.Player.name(pog))}</div><div class="small muted">${pl.pts} pts · ${pl.orb + pl.drb} reb · ${pl.ast} ast · ${pl.fgm}-${pl.fga} FG</div></div></div>` : ''}
        ${box.gims && box.gims.length ? `<div class="small">🎯 Game Impact Moments: ${box.gims.filter(x => x.made).length}/${box.gims.length} made</div>` : ''}
        <div class="row" style="justify-content:center;margin-top:14px"><button class="btn primary lg" data-fin="home">Continue ▸</button><button class="btn lg" data-fin="box">Box score</button></div></div>`;
      overlay.querySelector('[data-fin="home"]').onclick = () => closeGame();
      overlay.querySelector('[data-fin="box"]').onclick = () => { closeGame(); UI.openBox(sg.gid); };
    }, LG.view ? 2600 : 200);
  }

  function closeGame() {
    const S = LG ? LG.S : UI.S;
    stopLive();
    if (PBC.App.checkFired()) return;
    UI.go(S.phase === 'awards' ? 'recap' : 'home');
  }
})();
