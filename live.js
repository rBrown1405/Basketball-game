/* Pro BBALL Coach — pregame + live game screen (engine ⇄ court view ⇄ coach controls ⇄ Game Impact Moments). */
(function () {
  'use strict';
  const PBC = window.PBC;
  const U = PBC.U, C = PBC.Config, UI = PBC.UI;

  // ---------------------------------------------------------------------------
  // Helpers shared with the view
  // ---------------------------------------------------------------------------
  function uniformFor(t, home) {
    const p = t.colors.primary, s = t.colors.secondary;
    return home ? { jersey: '#f4f6fa', number: p, trim: p, shorts: '#f4f6fa' } : { jersey: p, number: U.textOn(p) === '#ffffff' ? '#ffffff' : s, trim: s, shorts: p };
  }
  function teamLook(t, home) {
    return { id: t.id, abbr: t.abbr, city: t.city, name: t.name, colors: Object.assign({}, t.colors), uniform: uniformFor(t, home), court: { paint: t.colors.primary, logoText: t.abbr, wood: t.wood || 'light' } };
  }
  function playerLook(p, teamIdx) {
    return { id: p.id, teamIdx, first: p.first, last: p.last, num: p.num, pos: p.pos, height: p.hgt, weight: p.wgt, hand: p.hand, gender: p.gender, look: p.look, speed: p.r.speed, agility: p.r.agility, vert: p.r.vert, handle: p.r.handle };
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

  // Court view factory: retro 2D pixel court (Hoop Land style) is the default
  // sim gameplay look. Falls back to the broadcast View if it is loaded, else null (text mode).
  UI.makeCourtView = function (canvas, S, g) {
    const ctx = UI.matchContext(S, g);
    const retro = S.settings.retroCourt !== false;
    if (retro && PBC.Match && PBC.Match.RetroView) {
      try { return new PBC.Match.RetroView(canvas, ctx, { quality: 'high', showNames: false }); } catch (e) { console.error('RetroView failed', e); }
    }
    if (PBC.Match && PBC.Match.View) {
      try { return new PBC.Match.View(canvas, ctx, { quality: 'high', pixelMode: !!S.settings.pixelMode, camera: S.settings.camera || 'broadcast' }); } catch (e) { console.error('Match view failed', e); }
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
      const pg = (tid, k) => (ts(tid).gp ? (ts(tid)[k] / ts(tid).gp).toFixed(1) : '—');
      const oppStar = PBC.League.roster(S, opp.id).filter(p => !p.injury)[0];
      const oppStarS = oppStar ? PBC.Stats.season(oppStar, S.season, false) : null;
      const keys = [];
      if (oppStar) keys.push(`Contain <b>${U.esc(PBC.Player.name(oppStar))}</b>${oppStarS && oppStarS.gp ? ` (${(oppStarS.pts / oppStarS.gp).toFixed(1)} ppg)` : ''} — Box-and-One or an aggressive scheme can slow him down.`);
      const prof = UI.teamProfile(S, opp.id), mine = UI.teamProfile(S, S.userTid);
      if (prof.Shooting > mine.Shooting + 3) keys.push('They shoot it better than you — run them off the three-point line.');
      if (mine.Inside > prof.Inside + 3) keys.push('You have the edge inside — feed the post and attack the rim.');
      if (prof.Rebounding > mine.Rebounding + 3) keys.push('They crash the glass hard. Consider "Get Back" and gang rebounding.');
      if (mine.Athleticism > prof.Athleticism + 3) keys.push('You are the more athletic team — push the tempo.');
      if (keys.length < 3) keys.push('Win the turnover battle and get to the free-throw line.');
      let series = '';
      if (sg.playoff && S.playoffs) {
        const s = S.playoffs.series.find(x => x.id === sg.series);
        if (s) { const mw = s.hi === S.userTid ? s.w[0] : s.w[1], tw = s.hi === S.userTid ? s.w[1] : s.w[0]; series = `${PBC.League.roundName(S, s.round)} · Game ${sg.gameNum} · ${mw > tw ? 'You lead' : mw < tw ? 'You trail' : 'Series tied'} ${mw}-${tw}`; }
        else series = 'Play-In Tournament';
      }
      const strat = me.strat;
      const sel = (key, obj) => `<select class="inp" data-strat="${key}" style="width:100%">${Object.keys(obj).map(k => `<option value="${k}" ${strat[key] === k ? 'selected' : ''}>${obj[k].label}</option>`).join('')}</select>`;
      root.innerHTML = `<div class="page pregame">
        <div class="hero"><div class="hero-in">
          <div class="row"><span class="tiny up dim" style="letter-spacing:2px">${PBC.League.dateLabel(S, sg.day, true)} · ${home ? 'Home' : 'Road'} game</span><div class="spacer"></div>${series ? `<span class="tag gold">${series}</span>` : ''}</div>
          <div class="vs-card" style="margin:14px 0">
            <div class="vs-team">${UI.teamBadge(home ? opp : me, 92)}<div class="nm">${U.esc((home ? opp : me).city)}<br>${U.esc((home ? opp : me).name)}</div><div class="small muted">${st[(home ? opp : me).id].w}-${st[(home ? opp : me).id].l} · ${pg((home ? opp : me).id, 'pts')} ppg</div></div>
            <div class="vs-at">@</div>
            <div class="vs-team">${UI.teamBadge(home ? me : opp, 92)}<div class="nm">${U.esc((home ? me : opp).city)}<br>${U.esc((home ? me : opp).name)}</div><div class="small muted">${st[(home ? me : opp).id].w}-${st[(home ? me : opp).id].l} · ${pg((home ? me : opp).id, 'pts')} ppg</div></div>
          </div>
          <div class="row" style="justify-content:center"><button class="btn primary xl" data-act="live">▶ Watch Live</button><button class="btn lg" data-act="quick">⏩ Quick Sim</button><button class="btn lg ghost" data-act="back">Back</button></div>
        </div></div>
        <div class="grid g3" style="margin-top:16px">
          ${[S.userTid, opp.id].map(tid => `<div class="card"><div class="card-h">${UI.teamBadge(S.teams[tid], 24)}<h3>${S.teams[tid].abbr} starters</h3></div><div class="card-b flush"><div class="list">${lineup(tid).map(p => `
            <div class="li">${UI.avatar(p, 30)}<div style="flex:1;min-width:0" class="ellip">${UI.playerLink(p)}<div class="tiny dim">${p.pos} · ${U.height(p.hgt)}</div></div>${UI.ovr(p.ovr)}</div>`).join('')}</div></div></div>`).join('')}
          <div class="card accent"><div class="card-h"><h3>Game plan</h3><div class="actions"><button class="btn sm ghost" data-nav="lineup">Lineup ›</button></div></div><div class="card-b col">
            <label class="small muted">Offense</label>${sel('off', C.OFFENSES)}<label class="small muted">Defense</label>${sel('def', C.DEFENSES)}
            <label class="small muted">Tempo</label>${sel('tempo', C.TEMPOS)}
            <div class="divider"></div><div class="small up muted">Keys to the game</div><ul class="keys small" style="margin:0;padding-left:18px">${keys.slice(0, 3).map(k => `<li>${k}</li>`).join('')}</ul></div></div>
        </div></div>`;
      UI.on(root, 'change', '[data-strat]', (e, el) => { strat[el.dataset.strat] = el.value; UI.save(); });
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
    if (LG.view && LG.view.destroy) { try { LG.view.destroy(); } catch (e) { console.error(e); } }
    LG = null;
  }

  function startLive(root, S, sg) {
    stopLive();
    const g = PBC.Sim.createGame(S, sg.h, sg.a, { gid: sg.gid, playoff: !!sg.playoff });
    const uIdx = g.userIdx;
    const teams = [S.teams[sg.h], S.teams[sg.a]];
    // Gameplay presentation is intentionally play-by-play only for now. The
    // simulation still generates every action, score, substitution and foul.
    const useVisual = false;
    root.innerHTML = `<div class="live playbyplay-only">
      <div class="lv-top">
        <button class="btn ghost sm" data-act="leave">‹ Leave</button>
        <div class="bug" id="bug"></div>
        <div class="lv-ctrl">
          <button class="btn sm" data-act="timeout" title="Timeout (T)">⏱ TO <span id="to-left"></span></button>
          <button class="btn sm" data-act="pause" id="btn-pause" title="Pause (Space)">⏸</button>
          <div class="seg" id="speeds">${[1, 2, 4, 8, 16].map(s => `<button data-speed="${s}">${s}×</button>`).join('')}</div>
          <button class="btn sm" data-act="clutch" title="Skip ahead to crunch time">⏭ Crunch time</button>
          <button class="btn sm" data-act="end" title="Simulate to the final buzzer">⏩ End</button>
        </div>
      </div>
      <div class="lv-main">
        <div class="lv-stage" id="stage">${useVisual ? '<canvas id="court"></canvas>' : ''}
          <div class="lv-play" id="playlabel"></div><div class="lv-overlay" id="overlay"></div></div>
        <div class="lv-side">
          <div class="tabs lv-tabs"><button class="tab active" data-tab="pbp">Play-by-play</button><button class="tab" data-tab="coach">Coach</button><button class="tab" data-tab="box">Box score</button></div>
          <div class="lv-panel" id="panel"></div>
        </div>
      </div>
      <div class="lv-bottom" id="oncourt"></div>
    </div>`;
    LG = {
      alive: true, S, sg, g, uIdx, teams, root, useVisual, speed: S.settings.simSpeed || 2, paused: false, busy: false,
      P: null, possDone: true, dispScore: [0, 0], lines: [], tab: 'pbp', text: null, view: null, raf: 0, last: 0,
      gimQueue: null, finished: false, subPick: null, lastPanelRender: 0, playLabelT: 0, clockShow: g.clock, scShow: 24,
      voice: false, lastVoiceAt: 0,
    };
    if (![1, 2, 4, 8, 16].includes(LG.speed)) LG.speed = 2;
    // view
    if (useVisual) {
      try {
        const canvas = root.querySelector('#court');
        LG.view = UI.makeCourtView(canvas, S, g);
        if (!LG.view) throw new Error('no court view');
        LG.onResize = () => { const st = root.querySelector('#stage'); if (LG && LG.view && LG.view.resize) LG.view.resize(st.clientWidth, st.clientHeight); };
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
    LG.onKey = e => {
      if (e.target.closest && e.target.closest('input,select,textarea')) return;
      if (LG.busy) return;
      if (e.code === 'Space') { e.preventDefault(); togglePause(); }
      if (e.key === 't' || e.key === 'T') callTimeout();
      if (['1', '2', '3', '4', '5'].includes(e.key)) setSpeed([1, 2, 4, 8, 16][+e.key - 1]);
    };
    document.addEventListener('keydown', LG.onKey);
    UI.on(root, 'click', '[data-speed]', (e, el) => setSpeed(+el.dataset.speed));
    UI.on(root, 'click', '[data-tab]', (e, el) => { LG.tab = el.dataset.tab; root.querySelectorAll('.lv-tabs .tab').forEach(b => b.classList.toggle('active', b === el)); renderPanel(true); });
    UI.on(root, 'click', '[data-act]', (e, el) => {
      const a = el.dataset.act;
      if (a === 'leave') leaveGame();
      if (a === 'pause') togglePause();
      if (a === 'timeout') callTimeout();
      if (a === 'voice') toggleArenaVoice();
      if (a === 'clutch') skipToClutch();
      if (a === 'end') simToEnd();
    });
    setSpeed(LG.speed);
    renderBug();
    renderPanel(true);
    renderOnCourt();
    pushLine({ q: 1, clock: g.clock, text: `Welcome to ${teams[0].city}! ${teams[1].name} at ${teams[0].name}.`, type: 'note' });
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
  };

  function setSpeed(s) {
    if (!LG) return;
    LG.speed = s;
    LG.S.settings.simSpeed = s;
    LG.root.querySelectorAll('[data-speed]').forEach(b => b.classList.toggle('on', +b.dataset.speed === s));
  }
  function togglePause(force) {
    if (!LG) return;
    LG.paused = force != null ? force : !LG.paused;
    const b = LG.root.querySelector('#btn-pause'); if (b) b.textContent = LG.paused ? '▶' : '⏸';
  }

  // Uses the device's installed speech voices only—no recording or remote
  // service. It stays off until the player explicitly enables it.
  function toggleArenaVoice() {
    if (!LG) return;
    if (!('speechSynthesis' in window)) { UI.toast('This browser does not provide a local announcer voice.', 'info'); return; }
    LG.voice = !LG.voice;
    if (!LG.voice) window.speechSynthesis.cancel();
    const b = LG.root.querySelector('#btn-voice');
    if (b) { b.classList.toggle('on', LG.voice); b.textContent = LG.voice ? '🔊 Arena voice' : '🔈 Arena voice'; }
    if (LG.voice) announce(`Welcome to ${LG.teams[0].city}. ${LG.teams[1].name} at ${LG.teams[0].name}.`);
  }
  function announceScore(ev) {
    const shot = ev.shotEvent || {};
    announce(shot.text || `${ev.pts === 3 ? 'Three pointer' : 'Basket'} for ${LG.teams[ev.team].name}.`);
  }
  function announce(text) {
    if (!LG || !LG.voice || !text || !('speechSynthesis' in window)) return;
    const now = performance.now();
    if (now - LG.lastVoiceAt < 1150) return;
    LG.lastVoiceAt = now;
    const msg = new SpeechSynthesisUtterance(String(text).replace(/[🎯🏀]/g, ''));
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(v => /^en(-|_)/i.test(v.lang) && /Samantha|Ava|Zoe|Alex|Daniel/i.test(v.name)) || voices.find(v => /^en/i.test(v.lang));
    if (preferred) msg.voice = preferred;
    msg.rate = 1.08; msg.pitch = .94; msg.volume = .9;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(msg);
  }

  // ---------------------------------------------------------------------------
  // Main loop
  // ---------------------------------------------------------------------------
  function loop(ts) {
    if (!LG || !LG.alive) return;
    const dtReal = Math.min(0.1, (ts - LG.last) / 1000);
    LG.last = ts;
    try {
      if (!LG.paused && !LG.busy && !LG.finished) {
        if (LG.possDone) nextPossession();
        else if (LG.view) LG.view.update(dtReal * LG.speed);
        else textTick(dtReal * LG.speed);
      } else if (LG.view && LG.view.update && LG.busy) {
        LG.view.update(0);
      }
      if (LG && LG.view) LG.view.render();
      if (LG) {
        if (LG.view) { LG.clockShow = LG.view.clock(); LG.scShow = LG.view.shotClock ? LG.view.shotClock() : LG.scShow; }
        renderBug();
        if (ts - LG.lastPanelRender > 700) { renderPanel(false); renderOnCourt(); LG.lastPanelRender = ts; }
      }
    } catch (e) {
      console.error('live loop error', e);
      if (LG) LG.possDone = true;
    }
    if (LG && LG.alive) LG.raf = requestAnimationFrame(loop);
  }

  async function nextPossession() {
    const g = LG.g;
    if (g.final) { finishGame(); return; }
    LG.possDone = false;
    // Game Impact Moment?
    const gimCtx = PBC.Sim.gimCheck(g);
    let P;
    if (gimCtx) {
      LG.busy = true;
      const choice = await gimChoose(gimCtx);
      if (!LG) return;
      LG.busy = false;
      const opt = gimCtx.options[choice] || gimCtx.options[0];
      P = PBC.Sim.startGimPossession(g, opt);
      pushLine({ q: g.period, clock: g.clock, text: `🎯 GAME IMPACT MOMENT — ${opt.label} for ${opt.player}`, type: 'gim', team: LG.uIdx });
    } else {
      P = PBC.Sim.nextPossession(g);
    }
    LG.P = P;
    if (!P) { finishGame(); return; }
    showPlayLabel(P);
    if (LG.view) {
      if (P.defScheme && LG.view.setDefScheme) LG.view.setDefScheme(1 - P.off, P.defScheme);
      LG.view.play(P, { onEvent: onViewEvent, onDone: () => { if (LG) { syncScore(P); LG.possDone = true; } } });
    } else {
      startText(P);
    }
  }

  // events from the court view (fired when they visibly happen)
  function onViewEvent(ev) {
    if (!LG) return;
    if (ev.type === 'score') { LG.dispScore[ev.team] += ev.pts; flashScore(ev.team); announceScore(ev); return; }
    handleEvent(ev);
    if (ev.type === 'shot' && ev.pending) resolveGimShot(ev);
  }

  function handleEvent(ev) {
    const g = LG.g;
    if (ev.type === 'ft' && ev.made) { LG.dispScore[ev.team] += 1; flashScore(ev.team); announce(ev.text); }
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
    let res;
    try {
      if (PBC.Mini && PBC.Mini.shotMeter) res = await PBC.Mini.shotMeter(overlay, opts);
      else res = await fallbackMeter(overlay, opts);
    } catch (e) { console.error(e); res = { quality: 'good', score: 0.6 }; }
    overlay.classList.remove('on', 'clear');
    overlay.innerHTML = '';
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
      overlay.innerHTML = `<div class="gim-fb"><div class="gim-t">${U.esc(opts.player)} — ${U.esc(opts.label)}</div><div class="gim-s">Hold SPACE (or press and hold) and release in the green</div>
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
      if (ev.type === 'shot' && ev.pending) { tx.waiting = true; resolveGimShot(ev); return; }
    }
    if (tx.idx >= tx.P.events.length && tx.t >= tx.end) {
      LG.clockShow = tx.P.clockEnd != null ? tx.P.clockEnd : LG.g.clock;
      syncScore(tx.P);
      LG.possDone = true;
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
    el.innerHTML = `${side(1)}<div class="bug-mid"><div class="per">${g.final && LG.finished ? 'FINAL' : U.periodName(per, true)}</div><div class="clk">${U.clock(clock, true)}</div>${LG.view && LG.scShow != null ? `<div class="shc">${Math.ceil(Math.max(0, LG.scShow))}</div>` : ''}</div>${side(0)}`;
    const tl = LG.root.querySelector('#to-left'); if (tl) tl.textContent = g.t[LG.uIdx].timeouts;
  }
  function flashScore(i) {
    const el = LG.root.querySelector('#sc' + i);
    if (!el) return;
    el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
  }
  function showPlayLabel(P) {
    const el = LG.root.querySelector('#playlabel');
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
        const cls = l.type === 'gim' ? 'gim' : l.type === 'period_end' ? 'q' : l.made ? 'made' : l.type === 'injury' ? 'inj' : '';
        return `<div class="lv-li ${cls}"><span class="c">${U.periodName(l.q, true)} ${U.clock(l.clock, true)}</span><span>${t ? `<b style="color:${U.shade(t.colors.primary, 0.4)}">${t.abbr}</b> ` : ''}${U.esc(l.text)}</span></div>`;
      }).join('')}</div>`;
    } else if (LG.tab === 'box') {
      if (!force && LG.busy) return;
      panel.innerHTML = `<div class="lv-box">${UI.boxScoreHtml(LG.S, PBC.Sim.box(LG.g), { noPbp: true })}</div>`;
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
      <div class="small up muted" style="margin-top:10px">Bench <span class="tiny dim">— tap a bench player, then the player to replace</span></div>${bench.map(row).join('')}
      ${queued.length ? `<div class="tag warn" style="margin-top:6px">Queued at next dead ball: ${U.esc(queued.join(', '))}</div>` : ''}
      <label class="chk" style="margin:10px 0"><input type="checkbox" id="auto-subs" ${T.autoSubs ? 'checked' : ''}> Auto substitutions</label>
      <div class="cp-grid"><label>Offense</label>${sel('off', C.OFFENSES)}<label>Defense</label>${sel('def', C.DEFENSES)}<label>Tempo</label>${sel('tempo', C.TEMPOS)}
        <label>Focus</label>${sel('focus', C.FOCUS)}<label>Glass</label>${sel('crash', C.CRASH)}<label>Pressure</label>${sel('pressure', C.PRESSURE)}</div>
      <p class="tiny muted">Changes take effect on the next possession. Timeouts left: ${T.timeouts}.</p></div>`;
    panel.querySelectorAll('[data-cs]').forEach(s => {
      s.onchange = () => {
        PBC.Sim.setStrategy(g, LG.uIdx, { [s.dataset.cs]: s.value });
        if (s.dataset.cs === 'def' && LG.view && LG.view.setDefScheme) LG.view.setDefScheme(LG.uIdx, s.value);
        UI.toast(`${s.options[s.selectedIndex].text} — coming up`, 'info');
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
    el.innerHTML = [LG.uIdx, 1 - LG.uIdx].map(i => {
      const T = g.t[i];
      return `<div class="oc-team"><span class="oc-ab" style="background:${LG.teams[i].colors.primary};color:${U.textOn(LG.teams[i].colors.primary)}">${LG.teams[i].abbr}</span>${T.on.map(c => `
        <div class="oc-p" title="${U.esc(c.name)}">${UI.avatar(c.p, 28)}<div class="oc-i"><div class="ellip"><b>${U.esc(c.last)}</b></div><div class="tiny dim">${c.st.pts} pts · ${c.st.orb + c.st.drb} reb · ${c.st.ast} ast · ${c.pf} PF</div>
        <span class="en"><i style="width:${Math.round(c.energy)}%;background:${c.energy > 70 ? 'var(--good)' : c.energy > 50 ? 'var(--warn)' : 'var(--bad)'}"></i></span></div></div>`).join('')}</div>`;
    }).join('');
  }

  // ---------------------------------------------------------------------------
  // Coach actions
  // ---------------------------------------------------------------------------
  function callTimeout() {
    const g = LG.g;
    if (g.t[LG.uIdx].timeouts <= 0) { UI.toast('No timeouts left', 'bad'); return; }
    if (g.t[LG.uIdx].toRequest) { UI.toast('Timeout already requested', 'info'); return; }
    PBC.Sim.callTimeout(g, LG.uIdx);
    UI.toast('⏱ Timeout requested — it will be called at the next dead ball. Adjust your lineup in the Coach tab.', 'info');
    LG.tab = 'coach';
    LG.root.querySelectorAll('.lv-tabs .tab').forEach(b => b.classList.toggle('active', b.dataset.tab === 'coach'));
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
    if (LG.view && LG.view.destroy) {
      try { LG.view.destroy(); } catch (e) { console.error(e); }
      const stage = LG.root.querySelector('#stage');
      const old = stage.querySelector('canvas'); if (old) old.remove();
      stage.insertAdjacentHTML('afterbegin', '<canvas id="court"></canvas>');
      try {
        LG.view = UI.makeCourtView(stage.querySelector('#court'), LG.S, LG.g);
        if (LG.view) { LG.view.period = LG.g.period; }
        LG.onResize();
      } catch (e) { console.error(e); LG.view = null; }
    }
    LG.clockShow = LG.g.clock;
    renderPanel(true); renderOnCourt();
  }

  async function skipToClutch() {
    if (LG.busy || !LG.possDone && LG.view && !LG.view.isIdle()) { /* allow anyway */ }
    const L = LG.g.L;
    LG.busy = true;
    await new Promise(r => setTimeout(r, 20));
    fastForward(g => (g.period >= L.periods && g.clock <= 150) || g.period > L.periods || !!PBC.Sim.gimCheck(g));
    LG.busy = false;
    resetViewAfterJump();
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
    const S = LG.S, g = LG.g, sg = LG.sg;
    const box = PBC.Sim.finalize(g);
    PBC.Season.completeGame(S, sg, box);
    PBC.Season.simDay(S, { skipUser: true });
    UI.save();
    LG.dispScore = [box.hs, box.as];
    renderBug();
    if (LG.view && LG.view.celebrate) { try { LG.view.celebrate(box.hs > box.as ? 0 : 1); } catch (e) { /* ignore */ } }
    if (silent) { closeGame(); PBC.App.resultToast(box); return; }
    const u = LG.uIdx;
    const my = u === 0 ? box.hs : box.as, th = u === 0 ? box.as : box.hs;
    const pog = box.pog != null ? S.players[box.pog] : null;
    const pl = pog ? box.teams.flatMap(t => t.players).find(x => x.pid === pog.id) : null;
    const overlay = LG.root.querySelector('#overlay');
    overlay.classList.add('on');
    overlay.innerHTML = `<div class="final-card ${my > th ? 'win' : 'loss'}">
      <div class="fc-res">${my > th ? 'VICTORY' : 'DEFEAT'}</div>
      <div class="fc-score">${UI.teamBadge(LG.teams[1], 54)}<span>${box.as}</span><span class="dim">–</span><span>${box.hs}</span>${UI.teamBadge(LG.teams[0], 54)}</div>
      <div class="small muted">${box.ot ? (box.ot > 1 ? box.ot : '') + 'OT · ' : ''}${S.teams[S.userTid].name} ${my > th ? 'win' : 'lose'} by ${Math.abs(my - th)}</div>
      ${pog ? `<div class="fc-pog">${UI.avatar(pog, 48)}<div><div class="tiny up gold-t">Player of the game</div><div class="bold">${U.esc(PBC.Player.name(pog))}</div><div class="small muted">${pl.pts} pts · ${pl.orb + pl.drb} reb · ${pl.ast} ast · ${pl.fgm}-${pl.fga} FG</div></div></div>` : ''}
      ${box.gims && box.gims.length ? `<div class="small">🎯 Game Impact Moments: ${box.gims.filter(x => x.made).length}/${box.gims.length} made</div>` : ''}
      <div class="row" style="justify-content:center;margin-top:14px"><button class="btn primary lg" data-fin="home">Continue ▸</button><button class="btn lg" data-fin="box">Box score</button></div></div>`;
    overlay.querySelector('[data-fin="home"]').onclick = () => closeGame();
    overlay.querySelector('[data-fin="box"]').onclick = () => { closeGame(); UI.openBox(sg.gid); };
  }

  function closeGame() {
    const S = LG ? LG.S : UI.S;
    stopLive();
    if (PBC.App.checkFired()) return;
    UI.go(S.phase === 'awards' ? 'recap' : 'home');
  }
})();
