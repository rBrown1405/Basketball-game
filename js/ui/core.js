/* Pro BBALL Coach — UI framework: routing, shell, modals, tables, badges, portraits. */
(function () {
  'use strict';
  const PBC = (window.PBC = window.PBC || {});
  const U = PBC.U;
  const UI = {};
  let S = null;
  const screens = {};
  const navItems = [];
  const phases = {};
  let current = { key: null, params: null };
  let saveTimer = null;
  let svgSeq = 0;

  Object.defineProperty(UI, 'S', { get: () => S });
  UI.setState = function (state) {
    S = state;
    PBC.S = state;
    UI.applyTeamColors();
  };
  UI.money = U.money;
  UI.esc = U.esc;

  // ---------------------------------------------------------------------------
  // DOM helpers
  // ---------------------------------------------------------------------------
  UI.h = function (html) {
    const t = document.createElement('template');
    t.innerHTML = String(html).trim();
    return t.content.firstElementChild;
  };
  UI.on = function (root, type, selector, fn) {
    root.addEventListener(type, ev => {
      const el = ev.target.closest(selector);
      if (el && root.contains(el)) fn(ev, el);
    });
  };
  UI.$ = (sel, root) => (root || document).querySelector(sel);
  UI.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  // ---------------------------------------------------------------------------
  // Registry
  // ---------------------------------------------------------------------------
  UI.register = function (key, def) { screens[key] = Object.assign({ key }, def); };
  UI.addNav = function (item) {
    const i = navItems.findIndex(n => n.key === item.key);
    if (i >= 0) navItems[i] = Object.assign({}, navItems[i], item);
    else navItems.push(Object.assign({ group: 'Team' }, item));
    if (S) UI.renderNav();
  };
  UI.registerPhase = function (phase, def) { phases[phase] = def; if (S) UI.renderTopbar(); };
  UI.phaseDef = phase => phases[phase];
  UI.current = () => current;

  UI.go = function (key, params) {
    const def = screens[key];
    if (!def) { console.warn('unknown screen', key); return; }
    const prev = screens[current.key];
    if (prev && prev.onLeave) { try { prev.onLeave(); } catch (e) { console.error(e); } }
    current = { key, params: params || null };
    const full = !!def.fullscreen;
    const fs = UI.$('#fullscreen'), app = UI.$('#app');
    fs.classList.toggle('on', full);
    app.style.visibility = full ? 'hidden' : '';
    const host = full ? fs : UI.$('#screen');
    // every render gets a fresh root so delegated listeners never pile up
    fs.innerHTML = ''; UI.$('#screen').innerHTML = '';
    const root = document.createElement('div');
    root.className = 'screen-root';
    host.appendChild(root);
    if (!full) host.scrollTop = 0;
    try { def.render(root, params || {}); } catch (e) { console.error(e); root.innerHTML = `<div class="page"><div class="card"><div class="card-b"><h3>Something went wrong</h3><pre class="small muted" style="white-space:pre-wrap">${U.esc(e.stack || e.message)}</pre></div></div></div>`; }
    if (!full) { UI.renderNav(); UI.renderTopbar(); }
    document.title = (def.title ? def.title + ' · ' : '') + 'Pro BBALL Coach';
  };
  UI.refresh = function () {
    if (!current.key) return;
    const def = screens[current.key];
    const host = def.fullscreen ? UI.$('#fullscreen') : UI.$('#screen');
    const scroll = host.scrollTop;
    host.innerHTML = '';
    const root = document.createElement('div');
    root.className = 'screen-root';
    host.appendChild(root);
    try { def.render(root, current.params || {}); } catch (e) { console.error(e); }
    host.scrollTop = scroll;
    if (!def.fullscreen) { UI.renderNav(); UI.renderTopbar(); }
  };

  // ---------------------------------------------------------------------------
  // Team colors
  // ---------------------------------------------------------------------------
  UI.applyTeamColors = function () {
    const t = S && S.teams[S.userTid];
    const r = document.documentElement.style;
    if (t) {
      const p = vivid(t.colors.primary), s = vivid(t.colors.secondary);
      r.setProperty('--team', p);
      r.setProperty('--team2', s);
    } else { r.setProperty('--team', '#ff6b1a'); r.setProperty('--team2', '#ffb020'); }
  };
  function vivid(hex) {
    const c = U.hexToRgb(hex);
    const L = (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255;
    return L < 0.22 ? U.shade(hex, 0.35) : hex;
  }

  // ---------------------------------------------------------------------------
  // Shell: nav + top bar
  // ---------------------------------------------------------------------------
  UI.renderNav = function () {
    const nav = UI.$('#nav');
    if (!nav) return;
    const groups = {};
    for (const n of navItems) {
      if (n.show && S && !n.show(S)) continue;
      (groups[n.group] = groups[n.group] || []).push(n);
    }
    const order = ['Team', 'Season', 'League', 'Front Office', 'Career'];
    const gkeys = Object.keys(groups).sort((a, b) => (order.indexOf(a) + 99) % 99 - (order.indexOf(b) + 99) % 99);
    nav.innerHTML = `
      <div class="brand" data-nav="home">${UI.logo(34)}<div class="brand-t">Pro BBALL<small>COACH</small></div></div>
      ${gkeys.map(g => `<div class="nav-group"><div class="nav-group-t">${g}</div>${groups[g].map(n => `
        <a class="nav-a ${current.key === n.key ? 'active' : ''}" data-nav="${n.key}"><span class="nav-ico">${n.icon || '•'}</span><span>${n.label}</span>${n.dot && S && n.dot(S) ? '<i class="badge-dot"></i>' : ''}</a>`).join('')}</div>`).join('')}
      <div class="nav-foot"><div id="save-status">${UI.saveStatus || ''}</div><div>${S ? U.esc(PBC.Config.LEAGUES[S.leagueKey].label) : ''}</div></div>`;
  };

  UI.continueInfo = function () {
    if (!S) return null;
    const c = S.coach;
    if (c && c.status === 'unemployed') return { label: 'Job Offers', run: () => UI.go('jobs') };
    if (c && c.pendingFire) return { label: 'Owner Meeting', run: () => UI.go('fired') };
    const ph = phases[S.phase];
    if (ph) return { label: typeof ph.label === 'function' ? ph.label(S) : ph.label, run: () => (ph.run ? ph.run(S) : UI.go(ph.screen)) };
    return null;
  };

  UI.renderTopbar = function () {
    const tb = UI.$('#topbar');
    if (!tb || !S) return;
    const t = S.teams[S.userTid];
    const st = PBC.League.standings(S);
    const r = st[S.userTid];
    const L = PBC.League.cfg(S);
    let seedTxt = '';
    if (t && r.gp) {
      const list = PBC.League.sorted(S, L.playoffFormat === 'conference' ? t.conf : null, st);
      const me = list.find(x => x.tid === t.id);
      seedTxt = `${U.ordinal(me.seed)} in ${L.playoffFormat === 'conference' ? L.confs[t.conf] : 'league'}`;
    }
    const ng = (S.phase === 'regular') ? PBC.League.nextGame(S, S.userTid) : PBC.Season.userGameToday(S);
    let nextTxt = '—';
    if (ng) {
      const home = ng.h === S.userTid;
      const opp = S.teams[home ? ng.a : ng.h];
      nextTxt = `${home ? 'vs' : '@'} ${opp.abbr} · ${ng.day === S.day ? 'Today' : PBC.League.dateLabel(S, ng.day)}`;
    }
    const phaseLbl = UI.phaseLabel(S);
    const cont = UI.continueInfo();
    tb.innerHTML = `
      <div class="tb-team" data-nav="home">${t ? UI.teamBadge(t, 38) : ''}<div><div class="nm">${t ? U.esc(t.city + ' ' + t.name) : 'Free Agent Coach'}</div>
        <div class="rec">${r ? `${r.w}-${r.l}` : ''}${seedTxt ? ' · ' + seedTxt : ''}</div></div></div>
      <div class="tb-mid">
        <div class="tb-item"><span class="l">${U.seasonLabel(S.season)}</span><span class="v">${phaseLbl}</span></div>
        ${S.phase === 'regular' || S.phase === 'playoffs' || S.phase === 'playin' ? `<div class="tb-item hide-sm"><span class="l">Next game</span><span class="v">${nextTxt}</span></div>` : ''}
        ${S.coach ? `<div class="tb-item hide-sm"><span class="l">Owner</span><span class="v">${U.esc(S.coach.mood || '')}</span></div>` : ''}
      </div>
      ${cont ? `<button class="btn primary cont-btn" id="cont-btn">${U.esc(cont.label)} ▸</button>` : ''}`;
    const b = UI.$('#cont-btn');
    if (b) b.onclick = () => { const c2 = UI.continueInfo(); if (c2) c2.run(); };
  };

  UI.phaseLabel = function (S) {
    const map = {
      preseason: 'Preseason', regular: S.day >= 0 ? PBC.League.dateLabel(S, Math.min(S.day, S.numDays - 1), true) : 'Regular season',
      playin: 'Play-In Tournament', playoffs: S.playoffs ? PBC.League.roundName(S, S.playoffs.round) : 'Playoffs',
      postseason_done: 'Season complete', awards: 'Season awards', draft_lottery: 'Draft Lottery', draft: 'Draft',
      resign: 'Re-sign Players', freeagency: 'Free Agency', training_camp: 'Training Camp',
    };
    return map[S.phase] || S.phase;
  };

  // ---------------------------------------------------------------------------
  // Modals, confirm, toast, busy
  // ---------------------------------------------------------------------------
  UI.modal = function (opts) {
    const back = UI.h(`<div class="modal-back"><div class="modal ${opts.wide ? 'wide' : ''} ${opts.xwide ? 'xwide' : ''}">
      <div class="modal-h">${opts.icon || ''}<h2>${opts.title || ''}</h2><button class="btn ghost sm modal-x" data-x>✕</button></div>
      <div class="modal-b"></div>${opts.actions && opts.actions.length ? '<div class="modal-f"></div>' : ''}</div></div>`);
    const body = back.querySelector('.modal-b');
    if (typeof opts.body === 'string') body.innerHTML = opts.body; else if (opts.body) body.appendChild(opts.body);
    let closed = false;
    const close = () => {
      if (closed) return; closed = true;
      back.remove();
      document.removeEventListener('keydown', onKey);
      if (opts.onClose) opts.onClose();
    };
    const onKey = e => { if (e.key === 'Escape' && !opts.noEsc) close(); };
    document.addEventListener('keydown', onKey);
    back.addEventListener('mousedown', e => { if (e.target === back && !opts.noBackdropClose) close(); });
    back.querySelector('[data-x]').onclick = close;
    if (opts.actions) {
      const f = back.querySelector('.modal-f');
      for (const a of opts.actions) {
        const b = UI.h(`<button class="btn ${a.cls || ''}">${a.label}</button>`);
        b.onclick = () => (a.onClick ? a.onClick(close) : close());
        f.appendChild(b);
      }
    }
    UI.$('#modals').appendChild(back);
    return { el: back, body, close };
  };

  UI.confirm = function (message, o) {
    o = o || {};
    return new Promise(resolve => {
      let done = false;
      const m = UI.modal({
        title: o.title || 'Confirm', body: `<div style="font-size:14.5px">${message}</div>`,
        actions: [
          { label: o.cancel || 'Cancel', cls: 'ghost', onClick: c => { done = true; resolve(false); c(); } },
          { label: o.ok || 'Yes', cls: o.danger ? 'danger' : 'primary', onClick: c => { done = true; resolve(true); c(); } },
        ],
        onClose: () => { if (!done) resolve(false); },
      });
      return m;
    });
  };

  UI.toast = function (msg, kind) {
    const el = UI.h(`<div class="toast ${kind || ''}">${msg}</div>`);
    UI.$('#toasts').appendChild(el);
    setTimeout(() => { el.style.transition = 'opacity .3s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 320); }, 3200);
  };

  UI.busy = function (label, fn) {
    const cover = UI.h(`<div class="loading-cover"><div class="loading-box"><div class="spinner"></div><div class="up" style="font-size:18px">${label || 'Simulating…'}</div></div></div>`);
    document.body.appendChild(cover);
    return new Promise(resolve => {
      setTimeout(() => {
        let out;
        try { out = fn(); } catch (e) { console.error(e); UI.toast('Error: ' + e.message, 'bad'); }
        Promise.resolve(out).then(v => { cover.remove(); resolve(v); }, e => { cover.remove(); console.error(e); resolve(null); });
      }, 40);
    });
  };

  // ---------------------------------------------------------------------------
  // Save
  // ---------------------------------------------------------------------------
  UI.save = function (immediate) {
    if (!S) return;
    clearTimeout(saveTimer);
    const run = async () => {
      const res = await PBC.Store.save(S);
      const d = new Date();
      UI.saveStatus = res.ok ? `💾 Saved ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}` : '⚠️ Save failed';
      const el = UI.$('#save-status'); if (el) el.textContent = UI.saveStatus;
      if (!res.ok) UI.toast(res.error, 'bad');
    };
    if (immediate) return run();
    saveTimer = setTimeout(run, 700);
  };

  // ---------------------------------------------------------------------------
  // Badges & portraits
  // ---------------------------------------------------------------------------
  UI.logo = function (size) {
    return `<svg class="brand-logo" width="${size}" height="${size}" viewBox="0 0 40 40"><defs><linearGradient id="lg-ball" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff9a4d"/><stop offset="1" stop-color="#e2540b"/></linearGradient></defs>
      <circle cx="20" cy="20" r="17" fill="url(#lg-ball)"/><g fill="none" stroke="#3a1804" stroke-width="1.7" opacity=".85"><path d="M3 20h34"/><path d="M20 3v34"/><path d="M8 8c6 5 6 19 0 24"/><path d="M32 8c-6 5-6 19 0 24"/></g>
      <circle cx="14" cy="12" r="4" fill="#fff" opacity=".25"/></svg>`;
  };

  UI.teamBadge = function (t, size) {
    size = size || 28;
    if (!t) return '';
    const p = t.colors.primary, s = t.colors.secondary, tr = t.colors.trim;
    const txt = U.textOn(p);
    const fs = t.abbr.length >= 3 ? 13 : 16;
    const gid = 'tbg' + t.id + '_' + (++svgSeq); // unique per copy: shared ids break when an earlier copy is hidden
    return `<svg class="badge-svg" width="${size}" height="${size}" viewBox="0 0 40 40" aria-label="${U.esc(t.city + ' ' + t.name)}">
      <defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${U.shade(p, 0.18)}"/><stop offset="1" stop-color="${U.shade(p, -0.38)}"/></linearGradient></defs>
      <path d="M20 1.5 L36.5 7.5 V19.5 C36.5 29.5 29.5 36 20 38.8 C10.5 36 3.5 29.5 3.5 19.5 V7.5 Z" fill="url(#${gid})" stroke="${s}" stroke-width="2.2"/>
      <path d="M20 5.5 L33 10.2 V19.6 C33 27.6 27.6 32.8 20 35.2 C12.4 32.8 7 27.6 7 19.6 V10.2 Z" fill="none" stroke="${tr}" stroke-opacity=".28" stroke-width="1"/>
      <path d="M7 24 Q20 17 33 24" fill="none" stroke="${s}" stroke-opacity=".55" stroke-width="1.4"/>
      <text x="20" y="${fs === 13 ? 23.5 : 25}" text-anchor="middle" font-family="Avenir Next Condensed, Barlow Condensed, Arial Narrow, sans-serif" font-weight="900" font-size="${fs}" letter-spacing=".3" fill="${txt}" stroke="${U.shade(p, -0.5)}" stroke-width=".6" paint-order="stroke">${U.esc(t.abbr)}</text></svg>`;
  };

  const SKIN = () => PBC.Config.SKIN_TONES;
  UI.avatar = function (p, size) {
    size = size || 36;
    if (!p || !p.look) return `<span class="av" style="width:${size}px;height:${size}px"></span>`;
    // Player cards deliberately share the court's pixel sprite system. The old
    // SVG portrait below remains as a resilient fallback during partial loads.
    const PX = PBC.Match && PBC.Match.Pixel;
    if (PX && PX.portrait) {
      const team = S && p.tid >= 0 && S.teams[p.tid] ? S.teams[p.tid] : null;
      const uniform = team ? { jersey: team.colors.primary, trim: team.colors.secondary, number: team.colors.trim, shorts: team.colors.primary } : { jersey: '#3b475f', trim: '#8d99b0', number: '#eef3ff', shorts: '#3b475f' };
      return `<img class="av pixel-av" width="${size}" height="${size}" alt="" src="${PX.portrait(p, { uniform }, size)}">`;
    }
    const lk = p.look;
    const skin = SKIN()[lk.skin] || '#a26a45';
    const skinD = U.shade(skin, -0.22), skinL = U.shade(skin, 0.12);
    const hair = lk.hairColor || '#1b1410';
    const team = S && p.tid >= 0 && S.teams[p.tid] ? S.teams[p.tid] : null;
    const jersey = team ? team.colors.primary : '#3b475f';
    const jtrim = team ? team.colors.secondary : '#8d99b0';
    const bg1 = team ? U.shade(team.colors.primary, -0.55) : '#1b2437', bg2 = team ? U.shade(team.colors.secondary, -0.6) : '#0f1624';
    const id = 'av' + p.id + '_' + (++svgSeq);
    const f = p.gender === 'f';
    // head geometry (viewBox 0..100)
    const hx = 50, hy = 44, hw = f ? 17 : 18, hh = f ? 21 : 22;
    let back = '', front = '';
    const cap = (h, extra) => `<path d="M${hx - hw - 1} ${hy - 2} C${hx - hw - 2} ${hy - hh - h} ${hx + hw + 2} ${hy - hh - h} ${hx + hw + 1} ${hy - 2} C${hx + hw - 3} ${hy - 12} ${hx - hw + 3} ${hy - 12} ${hx - hw - 1} ${hy - 2}Z" fill="${hair}" ${extra || ''}/>`;
    switch (lk.hair) {
      case 'bald': front = `<ellipse cx="${hx - 6}" cy="${hy - 15}" rx="6" ry="3" fill="#fff" opacity=".18"/>`; break;
      case 'buzz': front = cap(2, 'opacity=".85"'); break;
      case 'fade': front = cap(5); break;
      case 'waves': front = cap(5) + `<path d="M${hx - 12} ${hy - 17} q4 -3 8 0 q4 3 8 0 q4 -3 8 0" stroke="${U.shade(hair, 0.35)}" stroke-width="1.2" fill="none"/>`; break;
      case 'afro': back = `<circle cx="${hx}" cy="${hy - 10}" r="${hw + 10}" fill="${hair}"/>`; front = cap(6); break;
      case 'curly': back = `<circle cx="${hx}" cy="${hy - 12}" r="${hw + 4}" fill="${hair}"/>`; front = cap(7) + [-12, -4, 4, 12].map(dx => `<circle cx="${hx + dx}" cy="${hy - hh - 1}" r="4.5" fill="${hair}"/>`).join(''); break;
      case 'hightop': front = `<rect x="${hx - hw + 2}" y="${hy - hh - 16}" width="${hw * 2 - 4}" height="22" rx="4" fill="${hair}"/>` + cap(4); break;
      case 'mohawk': front = cap(1, 'opacity=".5"') + `<rect x="${hx - 4}" y="${hy - hh - 9}" width="8" height="16" rx="4" fill="${hair}"/>`; break;
      case 'braids': case 'twists': front = cap(5) + [-10, -5, 0, 5, 10].map(dx => `<path d="M${hx + dx} ${hy - hh + 1} L${hx + dx * 1.15} ${hy - 6}" stroke="${U.shade(hair, 0.3)}" stroke-width="1.3"/>`).join(''); if (lk.hair === 'twists') back = `<path d="M${hx - hw - 1} ${hy} q-2 12 2 20 M${hx + hw + 1} ${hy} q2 12 -2 20" stroke="${hair}" stroke-width="5" fill="none" stroke-linecap="round"/>`; break;
      case 'locs': back = [-16, -11, 11, 16].map(dx => `<path d="M${hx + dx} ${hy - 8} q${dx > 0 ? 3 : -3} 16 ${dx > 0 ? 1 : -1} 28" stroke="${hair}" stroke-width="4.5" fill="none" stroke-linecap="round"/>`).join(''); front = cap(6); break;
      case 'ponytail': back = `<path d="M${hx + hw - 2} ${hy - 14} q14 4 10 26 q-4 6 -7 -2 q2 -14 -6 -20z" fill="${hair}"/>`; front = cap(5); break;
      case 'bun': back = `<circle cx="${hx}" cy="${hy - hh - 8}" r="8" fill="${hair}"/>`; front = cap(5); break;
      case 'puffs': back = `<circle cx="${hx - 14}" cy="${hy - hh - 3}" r="8" fill="${hair}"/><circle cx="${hx + 14}" cy="${hy - hh - 3}" r="8" fill="${hair}"/>`; front = cap(5); break;
      case 'long': back = `<path d="M${hx - hw - 3} ${hy - 8} q-4 28 2 38 h${hw * 2 + 2} q6 -10 2 -38z" fill="${hair}"/>`; front = cap(6); break;
      case 'bob': back = `<path d="M${hx - hw - 4} ${hy - 10} q-2 18 4 22 h${hw * 2} q6 -4 4 -22z" fill="${hair}"/>`; front = cap(6); break;
      default: front = cap(4);
    }
    let beard = '';
    const jawY = hy + hh - 3;
    if (lk.beard === 'full') beard = `<path d="M${hx - hw + 1} ${hy + 2} C${hx - hw + 2} ${jawY + 6} ${hx + hw - 2} ${jawY + 6} ${hx + hw - 1} ${hy + 2} C${hx + 9} ${hy + 12} ${hx - 9} ${hy + 12} ${hx - hw + 1} ${hy + 2}Z" fill="${hair}" opacity=".92"/>`;
    else if (lk.beard === 'stubble') beard = `<path d="M${hx - hw + 1} ${hy + 3} C${hx - hw + 2} ${jawY + 5} ${hx + hw - 2} ${jawY + 5} ${hx + hw - 1} ${hy + 3} C${hx + 9} ${hy + 12} ${hx - 9} ${hy + 12} ${hx - hw + 1} ${hy + 3}Z" fill="${hair}" opacity=".35"/>`;
    else if (lk.beard === 'goatee') beard = `<path d="M${hx - 6} ${hy + 12} q6 10 12 0 q-6 3 -12 0z" fill="${hair}"/><path d="M${hx - 6} ${hy + 9} q6 -3 12 0" stroke="${hair}" stroke-width="2" fill="none"/>`;
    else if (lk.beard === 'mustache') beard = `<path d="M${hx - 7} ${hy + 9} q7 -4 14 0" stroke="${hair}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
    const band = lk.headband ? `<rect x="${hx - hw - 1}" y="${hy - 14}" width="${hw * 2 + 2}" height="5" rx="2" fill="${lk.headband === 'team' ? jtrim : lk.headband}"/>` : '';
    const num = p.num != null ? p.num : '';
    return `<svg class="av" width="${size}" height="${size}" viewBox="0 0 100 100">
      <defs><radialGradient id="${id}bg" cx=".5" cy=".3" r=".9"><stop offset="0" stop-color="${bg1}"/><stop offset="1" stop-color="${bg2}"/></radialGradient>
      <linearGradient id="${id}sk" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${skinD}"/><stop offset=".45" stop-color="${skinL}"/><stop offset="1" stop-color="${skinD}"/></linearGradient></defs>
      <rect width="100" height="100" fill="url(#${id}bg)"/>
      ${back}
      <path d="M14 100 C16 78 30 70 50 70 C70 70 84 78 86 100Z" fill="${jersey}"/>
      <path d="M36 72 C40 82 60 82 64 72" fill="none" stroke="${jtrim}" stroke-width="3"/>
      <path d="M27 76 L33 100 M73 76 L67 100" stroke="${U.shade(jersey, -0.25)}" stroke-width="2"/>
      <rect x="${hx - 7}" y="${hy + 14}" width="14" height="14" rx="4" fill="${skinD}"/>
      <ellipse cx="${hx - hw}" cy="${hy + 2}" rx="3.2" ry="5" fill="${skinD}"/><ellipse cx="${hx + hw}" cy="${hy + 2}" rx="3.2" ry="5" fill="${skinD}"/>
      <ellipse cx="${hx}" cy="${hy}" rx="${hw}" ry="${hh}" fill="url(#${id}sk)"/>
      ${beard}
      <path d="M${hx - 11} ${hy - 4} q4 -2.5 8 0 M${hx + 3} ${hy - 4} q4 -2.5 8 0" stroke="${U.shade(hair, 0.1)}" stroke-width="1.8" fill="none" stroke-linecap="round"/>
      <ellipse cx="${hx - 7}" cy="${hy + 0.5}" rx="2.2" ry="1.6" fill="#1a1210"/><ellipse cx="${hx + 7}" cy="${hy + 0.5}" rx="2.2" ry="1.6" fill="#1a1210"/>
      <path d="M${hx} ${hy + 2} q-2.5 6 0 7" stroke="${skinD}" stroke-width="1.6" fill="none" stroke-linecap="round"/>
      <path d="M${hx - 5} ${hy + 12.5} q5 2.5 10 0" stroke="${U.shade(skin, -0.45)}" stroke-width="1.6" fill="none" stroke-linecap="round"/>
      ${front}${band}
      <text x="50" y="96" text-anchor="middle" font-family="Avenir Next Condensed, Arial Narrow, sans-serif" font-weight="900" font-size="13" fill="${U.textOn(jersey)}" opacity=".9">${num}</text>
    </svg>`;
  };

  UI.ovrTier = v => (v >= 90 ? 't-elite' : v >= 83 ? 't-great' : v >= 75 ? 't-good' : v >= 65 ? 't-avg' : 't-low');
  UI.ovr = (v, cls) => `<span class="ovr ${UI.ovrTier(v)} ${cls || ''}">${v}</span>`;
  UI.potLabel = function (p) {
    if (!S) return '' + p.pot;
    if (p.tid === S.userTid) return '' + p.pot;
    if (p.tid === -2) {
      const k = p.scout ? p.scout.known : 0;
      const err = Math.round(12 * (1 - k / 100));
      const noise = ((U.hash(p.id + 'pot') % 100) / 100 - 0.5) * err;
      const mid = Math.round(p.pot + noise);
      return err <= 1 ? '' + p.pot : `${Math.max(40, mid - err)}–${Math.min(99, mid + err)}`;
    }
    if (p.age >= 28) return '' + p.pot;
    return '~' + Math.max(p.ovr, Math.round(p.pot / 3) * 3);
  };
  UI.pos = pos => `<span class="pos">${pos}</span>`;
  UI.playerLink = (p, label) => (p ? `<a class="link" data-open-player="${p.id}">${U.esc(label || PBC.Player.name(p))}</a>` : '');
  UI.teamLink = (t, label) => (t ? `<a class="link" data-open-team="${t.id}">${U.esc(label || t.city + ' ' + t.name)}</a>` : '');
  UI.ratingBar = function (label, v) {
    const cls = v >= 85 ? 'good' : v >= 70 ? '' : v >= 55 ? 'warn' : 'bad';
    return `<div class="rbar"><span class="lab">${U.esc(label)}</span><span class="val">${v}</span><div class="meter"><div class="meter-fill ${cls}" style="width:${v}%"></div></div></div>`;
  };
  UI.formDots = function (arr) { return `<span class="form-dots">${arr.map(w => `<i class="${w ? 'w' : ''}"></i>`).join('')}</span>`; };

  // ---------------------------------------------------------------------------
  // Sortable table
  // ---------------------------------------------------------------------------
  UI.table = function (container, opts) {
    const st = { sort: opts.sort || null, desc: opts.desc !== false };
    function render() {
      let rows = opts.rows.slice();
      const col = opts.columns.find(c => c.key === st.sort);
      if (col) {
        const f = col.sort || (r => (col.value ? col.value(r) : r[col.key]));
        rows.sort((a, b) => {
          const x = f(a), y = f(b);
          if (typeof x === 'string' || typeof y === 'string') return st.desc ? String(y).localeCompare(String(x)) : String(x).localeCompare(String(y));
          return st.desc ? (y || 0) - (x || 0) : (x || 0) - (y || 0);
        });
      }
      if (opts.limit) rows = rows.slice(0, opts.limit);
      container.innerHTML = `<div class="tbl-wrap"><table class="tbl hover ${opts.compact ? 'compact' : ''}"><thead><tr>${opts.columns.map(c =>
        `<th class="${c.num ? 'num' : ''} ${c.nosort ? '' : 'sortable'} ${st.sort === c.key ? 'sorted' : ''}" data-k="${c.key}" title="${U.esc(c.title || '')}">${c.label}${st.sort === c.key ? (st.desc ? ' ▾' : ' ▴') : ''}</th>`).join('')}</tr></thead>
        <tbody>${rows.map((r, i) => `<tr data-i="${i}" class="${opts.rowClass ? opts.rowClass(r) : ''} ${opts.onRow ? 'click' : ''}">${opts.columns.map(c =>
          `<td class="${c.num ? 'num' : ''} ${c.cls || ''}">${c.fmt ? c.fmt(r, i) : U.esc(r[c.key] == null ? '' : r[c.key])}</td>`).join('')}</tr>`).join('')}
        ${rows.length ? '' : `<tr><td colspan="${opts.columns.length}" class="empty">${opts.empty || 'Nothing here yet.'}</td></tr>`}</tbody></table></div>`;
      container.querySelectorAll('th.sortable').forEach(th => {
        th.onclick = () => {
          const k = th.dataset.k;
          if (st.sort === k) st.desc = !st.desc; else { st.sort = k; st.desc = true; }
          render();
        };
      });
      if (opts.onRow) container.querySelectorAll('tbody tr[data-i]').forEach(tr => {
        tr.onclick = ev => { if (ev.target.closest('a,button,input,select')) return; opts.onRow(rows[+tr.dataset.i], ev); };
      });
    }
    render();
    return { render, state: st };
  };

  // ---------------------------------------------------------------------------
  // Global link handling
  // ---------------------------------------------------------------------------
  UI.boot = function () {
    document.addEventListener('click', ev => {
      const n = ev.target.closest('[data-nav]');
      if (n) { ev.preventDefault(); UI.go(n.dataset.nav); return; }
      const pl = ev.target.closest('[data-open-player]');
      if (pl) { ev.preventDefault(); UI.openPlayer(+pl.dataset.openPlayer); return; }
      const tm = ev.target.closest('[data-open-team]');
      if (tm) { ev.preventDefault(); UI.openTeam(+tm.dataset.openTeam); return; }
      const bx = ev.target.closest('[data-open-box]');
      if (bx) { ev.preventDefault(); UI.openBox(+bx.dataset.openBox); return; }
    });
  };

  // defaults (screens override)
  UI.openPlayer = pid => console.log('player', pid);
  UI.openTeam = tid => UI.go('team', { tid });
  UI.openBox = gid => console.log('box', gid);

  PBC.UI = UI;
})();
