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
  let svgSeq = 0;
  // save tracker: dirty = changes not yet written to the career's main record
  const sv = { dirty: false, gen: 0, savedGen: 0, lastKeys: null, lastSavedAt: 0, writing: 0, error: null, bytes: 0, local: false, timer: null, errToastAt: 0 };

  Object.defineProperty(UI, 'S', { get: () => S });
  UI.setState = function (state) {
    if (state !== S) resetSaveTracker(state);
    S = state;
    PBC.S = state;
    UI.applyTeamColors();
    updateSaveUI();
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

  // Team look (Team Editor fields, with the defaults used when a team was never customized):
  //   t.uniforms = { home: { jersey, number, trim, shorts }, away: {...} }, t.court = { wood, paint, logoText, apron },
  //   t.arena = 'name', t.badge = { shape }
  /** Default uniform sets derived from team colors (the same rule the live game view uses). */
  UI.defaultUniforms = function (colors) {
    const p = colors.primary, s = colors.secondary;
    return {
      home: { jersey: '#f4f6fa', number: p, trim: p, shorts: '#f4f6fa' },
      away: { jersey: p, number: U.textOn(p) === '#ffffff' ? '#ffffff' : s, trim: s, shorts: p },
    };
  };
  UI.teamUniform = (t, home) => (t.uniforms && t.uniforms[home ? 'home' : 'away']) || UI.defaultUniforms(t.colors)[home ? 'home' : 'away'];
  UI.defaultCourt = t => ({ wood: t.wood || 'light', paint: t.colors.primary, logoText: String(t.abbr || '').slice(0, 4), apron: U.shade(t.colors.primary, -0.18) });
  UI.teamCourt = t => Object.assign(UI.defaultCourt(t), t.court || {});
  const ARENA_SUFFIX = ['Arena', 'Center', 'Garden', 'Fieldhouse', 'Coliseum', 'Pavilion', 'Dome', 'Forum'];
  UI.defaultArena = t => `${t.city} ${ARENA_SUFFIX[U.hash(String(t.city) + '|' + t.name) % ARENA_SUFFIX.length]}`;
  UI.teamArena = t => t.arena || UI.defaultArena(t);

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
      <div class="nav-foot">${S ? `<div id="save-status">${saveFootHtml()}</div>` : ''}<div>${S ? U.esc(PBC.Config.LEAGUES[S.leagueKey].label) : ''}</div></div>`;
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
      ${topSaveHtml()}
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

  UI.toast = function (msg, kind, ms) {
    const el = UI.h(`<div class="toast ${kind || ''}">${msg}</div>`);
    UI.$('#toasts').appendChild(el);
    setTimeout(() => { el.style.transition = 'opacity .3s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 320); }, ms || 3200);
    return el;
  };

  /** Text input dialog. Resolves with the trimmed value, or null when cancelled.
   *  o: { label, value, placeholder, ok, maxLength, validate(v) -> error message or '' } */
  UI.prompt = function (title, o) {
    o = o || {};
    return new Promise(resolve => {
      let done = false;
      const body = UI.h(`<div class="col">${o.label ? `<label class="small muted">${o.label}</label>` : ''}
        <input class="inp" maxlength="${o.maxLength || 60}" value="${U.esc(o.value || '')}" placeholder="${U.esc(o.placeholder || '')}" style="width:100%">
        <div class="small bad-t" data-err></div></div>`);
      const inp = body.querySelector('input'), err = body.querySelector('[data-err]');
      const submit = close => {
        const v = inp.value.trim();
        const msg = o.validate ? o.validate(v) : (v ? '' : 'Please enter a name.');
        if (msg) { err.textContent = msg; inp.focus(); return; }
        done = true; resolve(v); close();
      };
      const m = UI.modal({
        title, body,
        actions: [{ label: 'Cancel', cls: 'ghost', onClick: c => { done = true; resolve(null); c(); } }, { label: o.ok || 'OK', cls: 'primary', onClick: submit }],
        onClose: () => { if (!done) resolve(null); },
      });
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); submit(m.close); } });
      setTimeout(() => { inp.focus(); inp.select(); }, 30);
    });
  };

  /** Several-way choice. buttons: [{ key, label, cls }]. Resolves with the key, or null when dismissed. */
  UI.choose = function (message, o) {
    o = o || {};
    return new Promise(resolve => {
      let done = false;
      UI.modal({
        title: o.title || 'Choose', body: `<div style="font-size:14.5px">${message}</div>`,
        actions: (o.buttons || []).map(b => ({ label: b.label, cls: b.cls || '', onClick: c => { done = true; resolve(b.key); c(); } })),
        onClose: () => { if (!done) resolve(null); },
      });
    });
  };

  /** Downloads a text file (JSON saves). */
  UI.download = function (filename, text, type) {
    const blob = new Blob([text], { type: type || 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = filename;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  UI.saveFileName = function (abbr, season, extra) {
    const clean = s => String(s || '').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
    return `pro-bball-coach_${clean(abbr) || 'career'}_${season || ''}${extra ? '_' + clean(extra) : ''}.json`;
  };
  /** Exports the career that is loaded right now (including unsaved changes). */
  UI.exportCareer = function (state) {
    state = state || S;
    if (!state) return;
    const t = state.teams[state.userTid];
    UI.download(UI.saveFileName(t ? t.abbr : 'career', state.season), PBC.Store.exportString(state));
    UI.toast('⬇️ Save file exported', 'good');
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
  // Save: autosave policy, dirty tracking, manual saves, rotating backups
  // ---------------------------------------------------------------------------
  // S.settings.autosave decides when UI.save() really writes:
  //   'always' every call (debounced) · 'game' after games / sim days · 'week' once per in-season week
  //   'phase' on phase changes only · 'off' never (manual saves only). Phase changes always count for
  //   'game' and 'week'. Calls that do not write just mark the career dirty (unsaved-changes dot).
  UI.AUTOSAVE = [
    { key: 'always', label: 'Every change', short: 'every change', desc: 'Saves a moment after anything changes (recommended).' },
    { key: 'game', label: 'After games', short: 'after games', desc: 'Saves after every game or sim day, and when the phase changes.' },
    { key: 'week', label: 'Weekly', short: 'weekly', desc: 'Saves once per in-season week, and when the phase changes.' },
    { key: 'phase', label: 'Phase changes', short: 'phase changes', desc: 'Saves only when the season moves on (tip-off, playoffs, awards, draft, free agency...).' },
    { key: 'off', label: 'Off (manual)', short: 'off', desc: 'Nothing is written until you press Save or Ctrl+S. Automatic backups pause too.' },
  ];
  UI.autosavePolicy = function () {
    const p = S && S.settings ? S.settings.autosave : null;
    return UI.AUTOSAVE.some(x => x.key === p) ? p : 'always';
  };
  UI.backupCount = function () {
    const n = S && S.settings ? S.settings.backupCount : null;
    return n == null || isNaN(n) ? 3 : Math.max(0, Math.min(10, n | 0));
  };
  UI.isDirty = () => !!S && (sv.dirty || !!sv.timer);
  UI.saveInfo = () => ({
    dirty: UI.isDirty(), unsaved: !!S && sv.dirty && !sv.timer && !sv.writing, lastSavedAt: sv.lastSavedAt, policy: UI.autosavePolicy(),
    backups: UI.backupCount(), writing: sv.writing > 0, pending: !!sv.timer, error: sv.error, bytes: sv.bytes, local: sv.local,
  });

  function resetSaveTracker(state) {
    clearTimeout(sv.timer); sv.timer = null;
    sv.dirty = false; sv.gen = 0; sv.savedGen = 0; sv.error = null; sv.bytes = 0; sv.local = false;
    sv.lastKeys = state ? PBC.Store.progressKeys(state) : null;
    sv.lastSavedAt = state && state.updated ? state.updated : 0;
  }

  function writeDue(policy) {
    if (policy === 'off') return false;
    if (policy === 'always' || !sv.lastKeys) return true;
    const k = PBC.Store.progressKeys(S), l = sv.lastKeys;
    if (k.phase !== l.phase) return true;
    if (policy === 'game') return k.day !== l.day;
    if (policy === 'week') return k.week !== l.week;
    return false;
  }

  /**
   * Call after changing S. Writes according to the autosave policy (debounced), otherwise marks the career dirty.
   * immediate = true skips the debounce when a write is due. Explicit saves use UI.saveNow().
   */
  UI.save = function (immediate) {
    if (!S) return Promise.resolve(null);
    const was = sv.dirty;
    sv.gen++;
    sv.dirty = true;
    if (!writeDue(UI.autosavePolicy())) { if (!was && !sv.timer) updateSaveUI(); return Promise.resolve({ ok: true, deferred: true }); }
    clearTimeout(sv.timer); sv.timer = null;
    if (immediate) return writeMain('auto');
    sv.timer = setTimeout(() => { sv.timer = null; writeMain('auto'); }, 700);
    updateSaveUI();
    return Promise.resolve({ ok: true, queued: true });
  };

  /** Explicit save of the career's main record, whatever the autosave policy. opts: { silent } */
  UI.saveNow = async function (opts) {
    opts = opts || {};
    if (!S) return { ok: false, error: 'No career loaded.' };
    clearTimeout(sv.timer); sv.timer = null;
    const res = await writeMain(opts.source || 'manual');
    if (res.ok && !opts.silent) UI.toast('💾 Saved', 'good', 1800);
    return res;
  };

  /** Marks S as changed without autosaving (e.g. edits you want to keep manual). */
  UI.markDirty = function () { if (!S) return; sv.gen++; sv.dirty = true; updateSaveUI(); };

  /** After a slot / backup is loaded: the main record is older than S, so the next allowed write must happen. */
  UI.markLoadedSnapshot = function () { if (!S) return; sv.lastKeys = null; sv.gen++; sv.dirty = true; updateSaveUI(); };

  /** Starts a pending debounced write right away (tab hidden, leaving the career...). */
  UI.flushSave = function () {
    if (!S || !sv.timer) return Promise.resolve(null);
    clearTimeout(sv.timer); sv.timer = null;
    return writeMain('auto');
  };

  /** Resolves true when the loaded career can be dropped: nothing unsaved, or the player saved / discarded. */
  UI.guardUnsaved = async function (doing) {
    if (!S) return true;
    if (sv.timer) await UI.flushSave();
    if (!UI.isDirty()) return true;
    const since = sv.lastSavedAt ? ` since ${timeLabel(sv.lastSavedAt)}` : '';
    const r = await UI.choose(`You have unsaved changes${since}. Save them before ${doing || 'leaving'}?`, {
      title: 'Unsaved changes',
      buttons: [{ key: 'cancel', label: 'Cancel', cls: 'ghost' }, { key: 'discard', label: 'Discard changes', cls: 'danger' }, { key: 'save', label: '💾 Save', cls: 'primary' }],
    });
    if (r === 'save') { const res = await UI.saveNow({ silent: true }); return !!res.ok; }
    return r === 'discard';
  };

  /** Writes a rotating backup of the current state now (e.g. right before the offseason). */
  UI.backupNow = async function (reason, opts) {
    if (!S) return null;
    const n = UI.backupCount();
    if (n <= 0 || (UI.autosavePolicy() === 'off' && !(opts && opts.force))) return { ok: false, skipped: true };
    const prev = S.lastBackupKey;
    S.lastBackupKey = PBC.Store.progressKeys(S).backup;
    let res;
    try { res = await PBC.Store.saveBackup(S, { reason: reason || 'Backup', backupCount: n }); } catch (e) { res = { ok: false, error: e.message }; }
    if (!res.ok) { S.lastBackupKey = prev; backupWarn(res); }
    announce(res, 'backup');
    return res;
  };

  async function writeMain(source) {
    const st = S;
    if (!st) return { ok: false };
    const gen = sv.gen;
    const keys = PBC.Store.progressKeys(st);
    const n = UI.backupCount();
    const prevBK = st.lastBackupKey;
    let backup = null;
    if (n > 0 && keys.backup !== prevBK && !(source === 'auto' && UI.autosavePolicy() === 'off')) {
      const prevPhase = String(prevBK || '').split('|').slice(0, 4).join('|');
      backup = { reason: prevPhase !== keys.phase ? 'New phase' : st.phase === 'regular' ? 'New week' : 'New day' };
      st.lastBackupKey = keys.backup;
    }
    sv.writing++;
    updateSaveUI();
    let res;
    try { res = await PBC.Store.save(st, { backup, backupCount: n }); } catch (e) { res = { ok: false, error: String((e && e.message) || e) }; }
    sv.writing = Math.max(0, sv.writing - 1);
    if (st !== S) { updateSaveUI(); return res; } // a different career was loaded meanwhile
    if (res.ok) {
      sv.lastKeys = keys;
      sv.savedGen = Math.max(sv.savedGen, gen);
      sv.dirty = sv.gen > sv.savedGen;
      sv.lastSavedAt = st.updated || Date.now();
      sv.error = null; sv.bytes = res.bytes || sv.bytes; sv.local = !!res.local;
      if (backup && res.backup && !res.backup.ok) { st.lastBackupKey = prevBK; backupWarn(res.backup); }
    } else {
      if (backup) st.lastBackupKey = prevBK;
      sv.dirty = true;
      sv.error = res.error || 'Save failed';
      saveErrorToast(res);
    }
    updateSaveUI();
    announce(res, source);
    return res;
  }

  function announce(res, source) {
    try { document.dispatchEvent(new CustomEvent('pbc:saved', { detail: { ok: !!(res && res.ok), source } })); } catch (e) { /* ignore */ }
  }
  function saveErrorToast(res) {
    const now = Date.now();
    if (now - sv.errToastAt < 6000) return;
    sv.errToastAt = now;
    UI.toast(`⚠️ ${U.esc(res.error || 'The game could not be saved.')}<div class="row" style="margin-top:8px"><button class="btn sm toast-act" data-export-career>⬇️ Export save file</button><button class="btn sm ghost toast-act" data-nav="saves">Manage saves</button></div>`, 'bad', 9000);
  }
  function backupWarn(res) {
    if (!res || res.skipped) return;
    const now = Date.now();
    if (now - sv.errToastAt < 6000) return;
    sv.errToastAt = now;
    UI.toast(`⚠️ Automatic backup failed: ${U.esc(res.error || 'unknown error')}${res.quota ? '<div class="row" style="margin-top:8px"><button class="btn sm toast-act" data-nav="saves">Free up space</button></div>' : ''}`, 'bad', 7000);
  }

  function timeLabel(ts) {
    const d = new Date(ts), now = new Date();
    const t = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    return d.toDateString() === now.toDateString() ? t : d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ', ' + t;
  }
  UI.timeLabel = timeLabel;
  UI.bytesLabel = b => (b >= 1073741824 ? (b / 1073741824).toFixed(1) + ' GB' : b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : b >= 1024 ? Math.round(b / 1024) + ' KB' : Math.max(0, Math.round(b || 0)) + ' B');
  UI.policyLabel = key => (UI.AUTOSAVE.find(x => x.key === key) || UI.AUTOSAVE[0]).label;
  const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
  UI.saveKeyLabel = shift => (isMac() ? (shift ? '⇧⌘S' : '⌘S') : (shift ? 'Ctrl+Shift+S' : 'Ctrl+S'));

  function statusText() {
    if (!S) return '';
    if (sv.writing || sv.timer) return 'Saving…';
    if (sv.error) return 'Save failed';
    if (sv.dirty) return 'Unsaved changes';
    return sv.lastSavedAt ? 'Saved ' + timeLabel(sv.lastSavedAt) : 'Not saved yet';
  }
  function saveCls() { return sv.error ? 'err' : sv.writing || sv.timer ? 'busy' : sv.dirty ? 'dirty' : ''; }
  function saveTitle() {
    const pol = UI.policyLabel(UI.autosavePolicy());
    return `${statusText()} · Autosave: ${pol} · ${UI.saveKeyLabel()} to save`;
  }
  function saveFootHtml() {
    return `<div class="sv-foot ${saveCls()}">
      <button class="btn sm sv-btn" data-save-now title="${U.esc(saveTitle())}">💾 Save<i class="sv-dot"></i></button>
      <div class="sv-meta"><div class="sv-st">${U.esc(statusText())}</div><div class="sv-pol">Autosave: <a class="link" data-nav="settings">${U.esc(UI.policyLabel(UI.autosavePolicy()).toLowerCase())}</a></div></div></div>`;
  }
  function topSaveHtml() {
    if (!S) return '';
    return `<div class="tb-save ${saveCls()}" id="tb-save"><button class="tb-save-b" data-save-now title="${U.esc(saveTitle())}" aria-label="Save game">
      <span class="tb-save-i">💾</span><span class="tb-save-t">${U.esc(statusText())}</span><i class="sv-dot"></i></button><button class="tb-save-m" data-save-menu title="Save options" aria-label="Save options">▾</button></div>`;
  }
  function updateSaveUI() {
    UI.saveStatus = statusText();
    if (typeof document === 'undefined') return;
    // update in place (never replace the buttons: a click in progress would be lost)
    const txt = statusText(), cls = saveCls(), title = saveTitle(), pol = UI.policyLabel(UI.autosavePolicy()).toLowerCase();
    const foot = document.getElementById('save-status');
    if (foot) {
      const box = foot.querySelector('.sv-foot');
      if (!S) foot.innerHTML = '';
      else if (!box) foot.innerHTML = saveFootHtml();
      else {
        box.className = 'sv-foot ' + cls;
        box.querySelector('.sv-st').textContent = txt;
        box.querySelector('.sv-pol a').textContent = pol;
        box.querySelector('.sv-btn').title = title;
      }
    }
    const tb = document.getElementById('tb-save');
    if (tb) {
      if (!S) tb.remove();
      else {
        tb.className = 'tb-save ' + cls;
        tb.querySelector('.tb-save-t').textContent = txt;
        tb.querySelector('.tb-save-b').title = title;
      }
    }
    const na = document.querySelector('#nav .nav-a[data-nav="saves"]');
    if (na) {
      const want = UI.saveInfo().unsaved, dot = na.querySelector('.badge-dot');
      if (want && !dot) na.insertAdjacentHTML('beforeend', '<i class="badge-dot"></i>'); else if (!want && dot) dot.remove();
    }
    try { document.dispatchEvent(new CustomEvent('pbc:savestate', { detail: UI.saveInfo() })); } catch (e) { /* ignore */ }
  }
  UI.updateSaveUI = updateSaveUI;

  /** Small dropdown next to the top-bar save button. */
  UI.saveMenu = function (anchor) {
    const old = document.querySelector('.sv-menu');
    if (old) { if (old._close) old._close(); else old.remove(); return; }
    if (!S) return;
    const r = anchor.getBoundingClientRect();
    const menu = UI.h(`<div class="sv-menu" role="menu">
      <button data-save-now><span>💾 Save now</span><span class="kbd">${UI.saveKeyLabel()}</span></button>
      <button data-save-as><span>📑 Save As new slot…</span><span class="kbd">${UI.saveKeyLabel(true)}</span></button>
      <button data-nav="saves"><span>🗂️ Manage saves & backups</span></button>
      <div class="sv-menu-f">${U.esc(statusText())}<br>Autosave: <b>${U.esc(UI.policyLabel(UI.autosavePolicy()))}</b> · <a class="link" data-nav="settings">change</a></div></div>`);
    menu.style.top = Math.round(r.bottom + 6) + 'px';
    menu.style.right = Math.max(8, Math.round(window.innerWidth - r.right)) + 'px';
    document.body.appendChild(menu);
    const close = () => { menu.remove(); document.removeEventListener('mousedown', outside, true); document.removeEventListener('keydown', esc, true); };
    menu._close = close;
    const outside = e => { if (!menu.contains(e.target) && !anchor.contains(e.target)) close(); };
    const esc = e => { if (e.key === 'Escape') close(); };
    menu.addEventListener('click', () => setTimeout(close, 0));
    document.addEventListener('mousedown', outside, true);
    document.addEventListener('keydown', esc, true);
  };

  function isTyping(el) {
    if (!el || !el.tagName) return false;
    if (el.isContentEditable) return true;
    const tag = el.tagName;
    if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (tag !== 'INPUT') return false;
    return !['checkbox', 'radio', 'range', 'color', 'button', 'submit', 'reset', 'file', 'image'].includes((el.type || 'text').toLowerCase());
  }

  function bootSaving() {
    document.addEventListener('keydown', e => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || String(e.key || '').toLowerCase() !== 's') return;
      if (!S) return;
      e.preventDefault(); // never the browser's "Save page as" dialog while a career is open
      if (e.repeat || isTyping(e.target)) return; // no game save while typing in a field
      if (e.shiftKey) { if (UI.saveAs) UI.saveAs(); } else UI.saveNow();
    });
    window.addEventListener('beforeunload', e => {
      if (!S) return undefined;
      if (sv.timer) UI.flushSave();
      if (!UI.isDirty()) return undefined;
      e.preventDefault();
      e.returnValue = '';
      return '';
    });
    const flush = () => { if (sv.timer) UI.flushSave(); };
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
    window.addEventListener('pagehide', flush);
  }

  // ---------------------------------------------------------------------------
  // Badges & portraits
  // ---------------------------------------------------------------------------
  UI.logo = function (size) {
    return `<svg class="brand-logo" width="${size}" height="${size}" viewBox="0 0 40 40"><defs><linearGradient id="lg-ball" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff9a4d"/><stop offset="1" stop-color="#e2540b"/></linearGradient></defs>
      <circle cx="20" cy="20" r="17" fill="url(#lg-ball)"/><g fill="none" stroke="#3a1804" stroke-width="1.7" opacity=".85"><path d="M3 20h34"/><path d="M20 3v34"/><path d="M8 8c6 5 6 19 0 24"/><path d="M32 8c-6 5-6 19 0 24"/></g>
      <circle cx="14" cy="12" r="4" fill="#fff" opacity=".25"/></svg>`;
  };

  // Badge outlines in a 40x40 box: outer fill, inner trim line, secondary-color swoosh. t.badge = { shape }.
  const BADGE_SHAPES = {
    shield: {
      outer: 'M20 1.5 L36.5 7.5 V19.5 C36.5 29.5 29.5 36 20 38.8 C10.5 36 3.5 29.5 3.5 19.5 V7.5 Z',
      inner: 'M20 5.5 L33 10.2 V19.6 C33 27.6 27.6 32.8 20 35.2 C12.4 32.8 7 27.6 7 19.6 V10.2 Z', swoosh: 'M7 24 Q20 17 33 24',
    },
    circle: {
      outer: 'M1.8 20 A18.2 18.2 0 1 1 38.2 20 A18.2 18.2 0 1 1 1.8 20 Z',
      inner: 'M5.6 20 A14.4 14.4 0 1 1 34.4 20 A14.4 14.4 0 1 1 5.6 20 Z', swoosh: 'M5.5 24.5 Q20 16.5 34.5 24.5',
    },
    diamond: {
      outer: 'M20 1.2 L38.8 20 L20 38.8 L1.2 20 Z',
      inner: 'M20 5.8 L34.2 20 L20 34.2 L5.8 20 Z', swoosh: 'M8.5 25 Q20 18.5 31.5 25',
    },
    hexagon: {
      outer: 'M20 1.2 L36.6 10.6 V29.4 L20 38.8 L3.4 29.4 V10.6 Z',
      inner: 'M20 5.2 L33.1 12.6 V27.4 L20 34.8 L6.9 27.4 V12.6 Z', swoosh: 'M5.5 24.5 Q20 17 34.5 24.5',
    },
    rounded: {
      outer: 'M9.5 2.5 H30.5 A7 7 0 0 1 37.5 9.5 V30.5 A7 7 0 0 1 30.5 37.5 H9.5 A7 7 0 0 1 2.5 30.5 V9.5 A7 7 0 0 1 9.5 2.5 Z',
      inner: 'M10.5 6 H29.5 A4.5 4.5 0 0 1 34 10.5 V29.5 A4.5 4.5 0 0 1 29.5 34 H10.5 A4.5 4.5 0 0 1 6 29.5 V10.5 A4.5 4.5 0 0 1 10.5 6 Z', swoosh: 'M4.5 24.5 Q20 17 35.5 24.5',
    },
  };
  UI.BADGE_SHAPES = Object.keys(BADGE_SHAPES);

  UI.teamBadge = function (t, size) {
    size = size || 28;
    if (!t) return '';
    const p = t.colors.primary, s = t.colors.secondary, tr = t.colors.trim;
    const txt = U.textOn(p);
    const abbr = String(t.abbr || '');
    const fs = abbr.length >= 4 ? 10.5 : abbr.length >= 3 ? 13 : 16;
    const ty = fs === 16 ? 25 : fs === 13 ? 23.5 : 23;
    const shape = BADGE_SHAPES[t.badge && t.badge.shape] || BADGE_SHAPES.shield;
    const gid = 'tbg' + String(t.id).replace(/[^\w-]/g, '_') + '_' + (++svgSeq); // unique per copy: shared ids break when an earlier copy is hidden
    return `<svg class="badge-svg" width="${size}" height="${size}" viewBox="0 0 40 40" aria-label="${U.esc(t.city + ' ' + t.name)}">
      <defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${U.shade(p, 0.18)}"/><stop offset="1" stop-color="${U.shade(p, -0.38)}"/></linearGradient></defs>
      <path d="${shape.outer}" fill="url(#${gid})" stroke="${s}" stroke-width="2.2"/>
      <path d="${shape.inner}" fill="none" stroke="${tr}" stroke-opacity=".28" stroke-width="1"/>
      <path d="${shape.swoosh}" fill="none" stroke="${s}" stroke-opacity=".55" stroke-width="1.4"/>
      <text x="20" y="${ty}" text-anchor="middle" font-family="Avenir Next Condensed, Barlow Condensed, Arial Narrow, sans-serif" font-weight="900" font-size="${fs}" letter-spacing=".3" fill="${txt}" stroke="${U.shade(p, -0.5)}" stroke-width=".6" paint-order="stroke">${U.esc(abbr)}</text></svg>`;
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
      // customized teams (Team Editor) show their colored road uniform; others keep the classic derivation
      const custom = team && team.uniforms && team.uniforms.away && team.uniforms.away.jersey ? team.uniforms.away : null;
      const uniform = custom ? { jersey: custom.jersey, trim: custom.trim, number: custom.number, shorts: custom.shorts }
        : team ? { jersey: team.colors.primary, trim: team.colors.secondary, number: team.colors.trim, shorts: team.colors.primary } : { jersey: '#3b475f', trim: '#8d99b0', number: '#eef3ff', shorts: '#3b475f' };
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
    bootSaving();
    document.addEventListener('click', ev => {
      const sn = ev.target.closest('[data-save-now]');
      if (sn) { ev.preventDefault(); UI.saveNow(); return; }
      const sm = ev.target.closest('[data-save-menu]');
      if (sm) { ev.preventDefault(); UI.saveMenu(sm.closest('.tb-save') || sm); return; }
      const sa = ev.target.closest('[data-save-as]');
      if (sa) { ev.preventDefault(); if (UI.saveAs) UI.saveAs(); return; }
      const ex = ev.target.closest('[data-export-career]');
      if (ex) { ev.preventDefault(); UI.exportCareer(); return; }
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
