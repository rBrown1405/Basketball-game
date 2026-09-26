/* Pro BBALL Coach — save manager: every career with its latest save, named save slots and automatic backups.
 * Screen 'saves' inside a career, and a modal for the title screen ("Load Career").
 * Storage lives in js/core/storage.js (PBC.Store); save policy + dirty tracking in js/ui/core.js (UI.save / UI.saveNow). */
(function () {
  'use strict';
  const PBC = window.PBC;
  const U = PBC.U, UI = PBC.UI, Store = PBC.Store;
  const Saves = {};

  const DIFF = { easy: 'Rookie', normal: 'Pro', hard: 'All-Star', legend: 'Hall of Fame' };
  let active = null;      // { root, opts } of the manager on screen (page or modal)
  let renderSeq = 0;

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  const pseudoTeam = m => ({ id: 'sv_' + m.id, abbr: m.abbr || '?', city: '', name: m.team || '', colors: m.colors || { primary: m.color || '#666666', secondary: '#ffffff', trim: '#ffffff' }, badge: { shape: m.badge || 'shield' } });
  const nameOf = m => (m.kind === 'slot' ? m.slotName || 'Save slot' : m.kind === 'backup' ? 'Backup · ' + (m.reason || 'Autosave') : 'Latest save');
  const kindTag = m => (m.kind === 'slot' ? '<span class="tag info">Slot</span>' : m.kind === 'backup' ? '<span class="tag">Backup</span>' : '<span class="tag accent">Latest</span>');

  function groupCareers(all) {
    const map = new Map();
    for (const m of all) {
      if (!map.has(m.career)) map.set(m.career, { id: m.career, main: null, slots: [], backups: [], latest: 0 });
      const g = map.get(m.career);
      if (m.kind === 'main') g.main = m; else if (m.kind === 'slot') g.slots.push(m); else g.backups.push(m);
      g.latest = Math.max(g.latest, m.updated || 0);
    }
    const cur = UI.S ? UI.S.saveId : null;
    if (cur && !map.has(cur)) map.set(cur, { id: cur, main: null, slots: [], backups: [], latest: Date.now() });
    const out = [...map.values()];
    for (const g of out) {
      g.slots.sort((a, b) => (b.updated || 0) - (a.updated || 0));
      g.backups.sort((a, b) => (b.updated || 0) - (a.updated || 0));
      g.info = g.main || g.slots[0] || g.backups[0] || (cur === g.id ? Store.meta(UI.S) : null);
    }
    return out.sort((a, b) => (b.id === cur) - (a.id === cur) || b.latest - a.latest);
  }

  function announce() { try { document.dispatchEvent(new CustomEvent('pbc:saved', { detail: { ok: true, source: 'manager' } })); } catch (e) { /* ignore */ } }

  function fileNameFor(m) {
    return UI.saveFileName(m.abbr || 'career', m.season, m.kind === 'slot' ? m.slotName : m.kind === 'backup' ? 'backup' : '');
  }

  // ---------------------------------------------------------------------------
  // Actions (shared by the screen, the modal, Settings and the title screen)
  // ---------------------------------------------------------------------------
  /** "Save As": a named snapshot of the loaded career. */
  Saves.saveAs = async function () {
    const S = UI.S;
    if (!S) return null;
    const meta = Store.meta(S);
    const def = `${U.seasonLabel(S.season)} ${meta.phaseLabel}${meta.record ? ' (' + meta.record + ')' : ''}`;
    const name = await UI.prompt('📑 Save As new slot', {
      label: 'Name this snapshot. The career keeps autosaving to its latest save; the slot stays exactly as it is until you load it.',
      value: def, ok: '💾 Save slot', maxLength: 60,
    });
    if (!name) return null;
    const res = await Store.saveSlot(S, name);
    if (!res.ok) {
      UI.toast(`⚠️ ${U.esc(res.error || 'Could not save the slot.')}<div class="row" style="margin-top:8px"><button class="btn sm toast-act" data-export-career>⬇️ Export save file</button></div>`, 'bad', 9000);
      return res;
    }
    UI.toast(`📑 Saved slot "${U.esc(name)}"`, 'good');
    announce();
    return res;
  };
  UI.saveAs = Saves.saveAs;

  /** Imports a save file as a new career and opens it. */
  Saves.importFile = async function (file) {
    if (!file) return false;
    let S2;
    try { S2 = Store.importString(await file.text()); } catch (e) { UI.toast('Could not import: ' + U.esc(e.message), 'bad'); return false; }
    if (UI.S && !(await UI.guardUnsaved('opening the imported career'))) return false;
    if (active && active.opts.close) active.opts.close();
    UI.setState(S2);
    const res = await UI.saveNow({ silent: true });
    UI.toast(res.ok ? '⬆️ Save imported!' : '⚠️ Imported, but it could not be stored in this browser. Export it again to keep it.', res.ok ? 'good' : 'bad');
    UI.go('home');
    return true;
  };

  /** Loads any record: a career's latest save, a slot or a backup. */
  Saves.load = async function (m, group, opts) {
    opts = opts || {};
    const cur = UI.S;
    const same = !!cur && cur.saveId === m.career;
    if (m.kind === 'main') {
      if (same) {
        if (UI.isDirty() && !(await UI.confirm('Reload the latest save? Your unsaved changes will be lost.', { ok: 'Reload', danger: true, title: 'Reload latest save' }))) return false;
      } else if (cur && !(await UI.guardUnsaved('switching careers'))) return false;
      if (opts.close) opts.close();
      await PBC.App.loadCareer(m.id, { force: true });
      return true;
    }
    if (cur && !same && !(await UI.guardUnsaved('switching careers'))) return false;
    const main = group && group.main;
    const what = m.kind === 'slot' ? `the save slot <b>${U.esc(m.slotName || 'Save slot')}</b>` : `the backup from <b>${U.esc(UI.timeLabel(m.updated))}</b>`;
    const latest = same ? Store.meta(cur) : main;
    const body = UI.h(`<div>
      <p style="margin-top:0;font-size:14.5px">Load ${what} (${U.seasonLabel(m.season)} · ${U.esc(m.phaseLabel || m.phase || '')}${m.record ? ' · ' + U.esc(m.record) : ''})?</p>
      <p class="small muted">It becomes this career's current state and replaces its latest progress${latest ? ` (${U.seasonLabel(latest.season)} · ${U.esc(latest.phaseLabel || '')}${latest.record ? ' · ' + U.esc(latest.record) : ''})` : ''}${same && UI.isDirty() ? ', including your unsaved changes' : ''}.</p>
      ${latest ? '<label class="chk small"><input type="checkbox" data-keep checked> Keep the current progress as a save slot first</label>' : ''}</div>`);
    const ok = await new Promise(resolve => {
      UI.modal({
        title: m.kind === 'slot' ? 'Load save slot' : 'Restore backup', body,
        actions: [{ label: 'Cancel', cls: 'ghost', onClick: c => { resolve(false); c(); } }, { label: m.kind === 'slot' ? 'Load slot' : 'Restore backup', cls: 'primary', onClick: c => { resolve(true); c(); } }],
        onClose: () => resolve(false),
      });
    });
    if (!ok) return false;
    const keepBox = body.querySelector('[data-keep]');
    if (keepBox && keepBox.checked) {
      const label = `Before loading ${m.kind === 'slot' ? '"' + (m.slotName || 'slot') + '"' : 'a backup'}`;
      const res = same ? await Store.saveSlot(cur, label)
        : main ? await Store.copy(main.id, Store.slotId(m.career), { kind: 'slot', career: m.career, slotName: label }) : { ok: true };
      if (!res.ok) { UI.toast('⚠️ Could not keep a copy: ' + U.esc(res.error || 'storage error') + '. Nothing was loaded.', 'bad', 7000); return false; }
    }
    const S2 = await UI.busy('Loading save…', () => Store.load(m.id));
    if (!S2) { UI.toast('Could not load that save.', 'bad'); return false; }
    S2.saveId = m.career;
    if (same) { // save settings belong to the player, not to the snapshot
      S2.settings = Object.assign({}, S2.settings, { autosave: cur.settings.autosave, backupCount: cur.settings.backupCount });
    }
    if (opts.close) opts.close();
    UI.setState(S2);
    UI.markLoadedSnapshot();
    await UI.save(true); // becomes the career's latest save (unless autosave is off)
    UI.go('home');
    UI.toast(m.kind === 'slot' ? `📂 Loaded "${U.esc(m.slotName || 'slot')}"` : '⏪ Backup restored', 'good');
    announce();
    return true;
  };

  async function exportMeta(m) {
    const cur = UI.S;
    if (m.kind === 'main' && cur && cur.saveId === m.career) { UI.exportCareer(cur); return; }
    const data = await Store.exportRecord(m.id);
    if (!data) { UI.toast('Could not read that save.', 'bad'); return; }
    UI.download(fileNameFor(m), data);
    UI.toast('⬇️ Save file exported', 'good');
  }

  async function renameMeta(m) {
    const name = await UI.prompt('Rename save slot', { value: m.slotName || '', ok: 'Rename', maxLength: 60 });
    if (!name) return;
    const res = await Store.rename(m.id, name);
    if (!res.ok) UI.toast(U.esc(res.error || 'Could not rename.'), 'bad'); else { UI.toast('Renamed', 'good'); announce(); }
  }

  async function deleteMeta(m) {
    const label = m.kind === 'slot' ? `the save slot "${U.esc(m.slotName || 'Save slot')}"` : `this backup (${U.esc(UI.timeLabel(m.updated))})`;
    if (!(await UI.confirm(`Delete ${label}? This cannot be undone.`, { ok: 'Delete', danger: true, title: 'Delete save' }))) return;
    await Store.remove(m.id);
    UI.toast('Deleted', 'good');
    announce();
  }

  async function deleteCareer(g) {
    const info = g.info || {};
    const n = g.slots.length + g.backups.length;
    const cur = UI.S && UI.S.saveId === g.id;
    const msg = `Delete the career of <b>${U.esc(info.coach || 'this coach')}</b>${info.team ? ' (' + U.esc(info.team) + ')' : ''} permanently?${n ? ` Its ${n} save slot${n === 1 ? '' : 's'} and backup${n === 1 ? '' : 's'} are deleted too.` : ''}${cur ? ' You are playing this career: you will return to the title screen.' : ''} This cannot be undone.`;
    if (!(await UI.confirm(msg, { ok: 'Delete career', danger: true, title: 'Delete career' }))) return false;
    await Store.removeCareer(g.id);
    if (cur) {
      if (active && active.opts.close) active.opts.close();
      UI.setState(null);
      UI.go('title');
      UI.toast('Career deleted', 'good');
      return true;
    }
    UI.toast('Career deleted', 'good');
    announce();
    return true;
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------
  function rowHtml(m, g, cur) {
    const isCur = cur && cur.saveId === g.id;
    const live = m.kind === 'main' && isCur;
    const info = UI.saveInfo();
    const when = live && info.lastSavedAt ? info.lastSavedAt : m.updated;
    const bits = [U.seasonLabel(m.season), m.phaseLabel || m.phase, m.record].filter(Boolean).map(x => U.esc(x));
    return `<div class="li sv-row k-${m.kind}">
      <div class="sv-row-i">${kindTag(m)}</div>
      <div class="sv-row-main"><div class="bold ellip">${U.esc(nameOf(m))}${live && info.dirty ? ' <span class="tag warn">Unsaved changes</span>' : ''}</div>
        <div class="tiny muted">${bits.join(' · ')}</div>
        <div class="tiny dim">${when ? U.esc(UI.timeLabel(when)) : 'Never'}${m.bytes ? ' · ' + UI.bytesLabel(m.bytes) : ''}${m.local ? ' · local storage' : ''}</div></div>
      <div class="sv-row-act">
        ${live ? (info.dirty ? '<button class="btn sm primary" data-save-now>💾 Save now</button>' : '') + (info.dirty ? `<button class="btn sm" data-load="${U.esc(m.id)}" title="Discard unsaved changes">Reload</button>` : '')
          : `<button class="btn sm ${m.kind === 'main' ? 'primary' : ''}" data-load="${U.esc(m.id)}">${m.kind === 'backup' ? 'Restore' : 'Load'}</button>`}
        ${m.kind === 'slot' ? `<button class="btn sm ghost" data-rename="${U.esc(m.id)}">Rename</button>` : ''}
        <button class="btn sm ghost" data-export="${U.esc(m.id)}" title="Download as a JSON file">Export</button>
        ${m.kind !== 'main' ? `<button class="btn sm ghost sv-del" data-del="${U.esc(m.id)}" title="Delete">✕</button>` : ''}
      </div></div>`;
  }

  function careerHtml(g, cur, opts) {
    const info = g.info || {};
    const isCur = !!cur && cur.saveId === g.id;
    const c = info.colors || { primary: '#666666', secondary: '#ffffff' };
    const lg = info.leagueKey === 'women' ? "Women's league" : "Men's league";
    const started = info.created ? 'Started ' + new Date(info.created).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '';
    const sub = [lg, DIFF[info.difficulty] || '', info.careerRecord ? 'Career ' + info.careerRecord : '', info.titles ? '🏆×' + info.titles : '', started].filter(Boolean).map(x => U.esc(x)).join(' · ');
    const unsavedMain = isCur && !g.main;
    return `<div class="card sv-career ${isCur ? 'current' : ''}" style="--tc:${U.esc(c.primary)};--tc2:${U.esc(c.secondary)}">
      <div class="sv-career-h">${UI.teamBadge(pseudoTeam(info), 46)}
        <div class="sv-career-t"><div class="up ellip">${U.esc(info.coach || 'Coach')} <span class="dim">·</span> ${U.esc(info.team || 'No team')}</div>
          <div class="small muted">${sub}</div></div>
        ${info.imported ? `<span class="tag info" title="Imported ${U.esc(UI.timeLabel(info.imported))}">Imported</span>` : ''}${isCur ? '<span class="tag accent">Playing now</span>' : ''}
        <div class="sv-career-act">
          ${isCur && !opts.modal ? '<button class="btn sm" data-save-as>📑 Save As…</button>' : ''}
          <button class="btn sm ghost sv-del" data-del-career="${U.esc(g.id)}">Delete career</button>
        </div></div>
      <div class="list sv-list">
        ${g.main ? rowHtml(g.main, g, cur) : unsavedMain ? `<div class="li sv-row"><div class="sv-row-i"><span class="tag warn">Unsaved</span></div><div class="sv-row-main"><div class="bold">This career has not been saved yet</div></div><div class="sv-row-act"><button class="btn sm primary" data-save-now>💾 Save now</button></div></div>` : '<div class="li sv-row"><div class="sv-row-main small muted">The latest save of this career was deleted. Load a slot or backup to continue it.</div></div>'}
        ${g.slots.length ? `<div class="sv-sub">Save slots <span class="dim">${g.slots.length}</span></div>${g.slots.map(m => rowHtml(m, g, cur)).join('')}` : ''}
        ${g.backups.length ? `<div class="sv-sub">Automatic backups <span class="dim">${g.backups.length}</span></div>${g.backups.map(m => rowHtml(m, g, cur)).join('')}` : ''}
      </div></div>`;
  }

  /** Renders the manager into root. opts: { modal, close } */
  Saves.render = async function (root, opts) {
    opts = opts || {};
    active = { root, opts };
    const seq = ++renderSeq;
    if (!root.firstChild) root.innerHTML = '<div class="empty">Loading saves…</div>';
    let all = [], est = null;
    try { [all, est] = await Promise.all([Store.listAll(), Store.estimate()]); } catch (e) { console.error(e); }
    if (seq !== renderSeq || !root.isConnected) return;
    const cur = UI.S;
    const groups = groupCareers(all);
    Saves._groups = groups;
    const total = all.reduce((a, m) => a + (m.bytes || 0), 0);
    const nSlots = all.filter(m => m.kind === 'slot').length, nBack = all.filter(m => m.kind === 'backup').length;
    const info = UI.saveInfo();
    const scroll = opts.modal ? null : (document.getElementById('screen') || {}).scrollTop;
    const storage = `${groups.length} career${groups.length === 1 ? '' : 's'} · ${nSlots} slot${nSlots === 1 ? '' : 's'} · ${nBack} backup${nBack === 1 ? '' : 's'} · ${UI.bytesLabel(total)}${est && est.quota ? ` <span class="dim">(browser storage ${UI.bytesLabel(est.usage || 0)} of ${UI.bytesLabel(est.quota)})</span>` : ''}`;
    const head = opts.modal ? `<div class="sv-top row"><div class="small muted" style="flex:1;min-width:220px">${storage}</div>
        <button class="btn sm" data-import>⬆️ Import save file</button></div>`
      : `<div class="page-h"><div><h1>Saves</h1><div class="sub">Every career keeps a latest save (the autosave target), named save slots and automatic backups. All of it lives in this browser: export files to keep a copy elsewhere.</div></div>
          <div class="actions">${cur ? `<button class="btn primary" data-save-now>💾 Save now <span class="k">${UI.saveKeyLabel()}</span></button><button class="btn" data-save-as>📑 Save As…</button>` : ''}<button class="btn" data-import>⬆️ Import</button></div></div>
        ${cur ? `<div class="card sv-policy"><div class="card-b"><div class="row">
          <div class="stat"><div class="v sm">${U.esc(UI.policyLabel(info.policy))}</div><div class="l">Autosave</div></div>
          <div class="stat"><div class="v sm">${info.backups ? 'Last ' + info.backups : 'Off'}</div><div class="l">Backups kept</div></div>
          <div class="stat"><div class="v sm">${info.dirty ? '<span class="warn-t">Unsaved</span>' : info.lastSavedAt ? U.esc(UI.timeLabel(info.lastSavedAt)) : 'Never'}</div><div class="l">Last saved</div></div>
          <div class="spacer"></div><button class="btn sm ghost" data-nav="settings">⚙️ Autosave settings</button></div>
          <div class="small muted sv-store">${storage}</div></div></div>` : ''}`;
    root.innerHTML = `<div class="${opts.modal ? 'sv-mgr in-modal' : 'page sv-mgr'}">${head}
      ${groups.length ? `<div class="stack sv-careers">${groups.map(g => careerHtml(g, cur, opts)).join('')}</div>` : '<div class="card"><div class="empty">No saved careers yet. Start a new career or import a save file.</div></div>'}
      <input type="file" class="sv-file" accept=".json,application/json" hidden></div>`;
    if (scroll != null) { const scr = document.getElementById('screen'); if (scr) scr.scrollTop = scroll; }
    if (!root._svWired) wire(root);
  };

  function findMeta(id) {
    for (const g of Saves._groups || []) {
      for (const m of [g.main].concat(g.slots, g.backups)) if (m && m.id === id) return { m, g };
    }
    return null;
  }

  function wire(root) {
    root._svWired = true;
    const opts = () => (active && active.root === root ? active.opts : {});
    UI.on(root, 'click', '[data-load]', async (e, el) => { const f = findMeta(el.dataset.load); if (f) await Saves.load(f.m, f.g, opts()); });
    UI.on(root, 'click', '[data-rename]', async (e, el) => { const f = findMeta(el.dataset.rename); if (f) await renameMeta(f.m); });
    UI.on(root, 'click', '[data-export]', async (e, el) => { const f = findMeta(el.dataset.export); if (f) await exportMeta(f.m); });
    UI.on(root, 'click', '[data-del]', async (e, el) => { const f = findMeta(el.dataset.del); if (f) await deleteMeta(f.m); });
    UI.on(root, 'click', '[data-del-career]', async (e, el) => { const g = (Saves._groups || []).find(x => x.id === el.dataset.delCareer); if (g) await deleteCareer(g); });
    UI.on(root, 'click', '[data-import]', () => { const f = root.querySelector('.sv-file'); if (f) { f.value = ''; f.click(); } });
    root.addEventListener('change', e => { if (e.target.classList && e.target.classList.contains('sv-file')) Saves.importFile(e.target.files[0]); });
  }

  // keep the manager fresh when something is saved (Ctrl+S, autosave, Save As, delete...)
  let refreshTimer = null;
  document.addEventListener('pbc:saved', () => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => { if (active && active.root.isConnected) Saves.render(active.root, active.opts); }, 120);
  });

  /** Modal version (title screen "Load Career"). */
  Saves.open = function () {
    const body = UI.h('<div></div>');
    const m = UI.modal({ title: '🗂️ Saved careers', body, xwide: true, onClose: () => { if (active && active.root === body) active = null; } });
    Saves.render(body, { modal: true, close: m.close });
    return m;
  };

  UI.register('saves', {
    title: 'Saves',
    render(root) { Saves.render(root, { modal: false }); },
    onLeave() { active = null; },
  });

  PBC.Saves = Saves;
})();
