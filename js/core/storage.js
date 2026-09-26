/* Pro BBALL Coach — saving & loading careers (IndexedDB with localStorage fallback, JSON export/import).
 *
 * Records (object store 'saves', keyPath 'id'):
 *   main    id = S.saveId                          the career's latest state (the autosave target)
 *   slot    id = `${saveId}::slot::${base36 time}`  named snapshot made with "Save As"
 *   backup  id = `${saveId}::backup::${k}`          rotating automatic backups (k = 0..N-1)
 * Each data record is { id, data: <JSON string>, meta }. A small index record { id: '#meta:' + id, meta }
 * sits next to it so the save list can be read without loading every multi-megabyte career.
 * meta: { id, kind: 'main'|'slot'|'backup', career: <saveId>, slotName, reason, coach, team, abbr, color,
 *         colors, badge, season, phase, phaseLabel, day, record, careerRecord, titles, leagueKey, bytes, updated }
 * Never touches the DOM at load time (the Node test harness loads this file).
 */
(function () {
  'use strict';
  const PBC = (window.PBC = window.PBC || {});
  const Store = {};
  const DB_NAME = 'pro_bball_coach', STORE = 'saves', META_KEY = 'pbc_meta_v1', LS_PREFIX = 'pbc_save_';
  const META_PREFIX = '#meta:';
  const SLOT_SEP = '::slot::', BACKUP_SEP = '::backup::';
  const AUTOSAVE = ['always', 'game', 'week', 'phase', 'off'];
  const QUOTA_MSG = 'Browser storage is full, so the game could not be saved. Export your career to a file (Settings > Save data > Export) and delete old slots or backups in Saves.';
  let dbp = null;
  let useLocal = false;
  let lastStamp = 0;

  Store.SLOT_SEP = SLOT_SEP;
  Store.BACKUP_SEP = BACKUP_SEP;
  Store.AUTOSAVE = AUTOSAVE;
  Store.MAX_BACKUPS = 10;

  // ---------------------------------------------------------------------------
  // Low level: IndexedDB + localStorage helpers
  // ---------------------------------------------------------------------------
  function openDB() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      try {
        if (typeof indexedDB === 'undefined' || !indexedDB) throw new Error('no indexedDB');
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' }); };
        req.onsuccess = () => {
          const db = req.result;
          db.onversionchange = () => { try { db.close(); } catch (e) { /* ignore */ } dbp = null; };
          resolve(db);
        };
        req.onerror = () => reject(req.error);
      } catch (e) { reject(e); }
    }).catch(() => { useLocal = true; return null; });
    return dbp;
  }

  /** One transaction. fn(store) may return a request (or an array of them); resolves with its result(s) once committed. */
  function run(db, mode, fn) {
    return new Promise((resolve, reject) => {
      let t;
      try { t = db.transaction(STORE, mode); } catch (e) { reject(e); return; }
      let r;
      try { r = fn(t.objectStore(STORE)); } catch (e) { try { t.abort(); } catch (e2) { /* ignore */ } reject(e); return; }
      t.oncomplete = () => resolve(Array.isArray(r) ? r.map(x => (x ? x.result : undefined)) : (r ? r.result : undefined));
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('Save transaction aborted'));
    });
  }

  function idbReady(db) { return !!(db && !useLocal); }
  function metaRange(prefix) { return IDBKeyRange.bound(META_PREFIX + (prefix || ''), META_PREFIX + (prefix || '') + '￿'); }
  const isMetaKey = k => typeof k === 'string' && k.indexOf(META_PREFIX) === 0;

  function isQuota(e) {
    if (!e) return false;
    return e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014 || /quota|storage.*full|disk.*full/i.test(String(e.message || ''));
  }
  Store.isQuotaError = isQuota;

  function ls() { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; } }
  function localMetaList() {
    const L = ls();
    if (!L) return [];
    try { const v = JSON.parse(L.getItem(META_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
  }
  function localMetaSet(list) { const L = ls(); if (!L) return; try { L.setItem(META_KEY, JSON.stringify(list)); } catch (e) { /* ignore */ } }
  function lsWrite(id, data, meta) {
    const L = ls();
    if (!L) return { ok: false, error: 'This browser does not allow saving (storage is disabled).' };
    try {
      L.setItem(LS_PREFIX + id, data);
      const list = localMetaList().filter(m => m.id !== id);
      list.unshift(meta);
      localMetaSet(list);
      return { ok: true, bytes: data.length, local: true };
    } catch (e) {
      return { ok: false, quota: true, error: QUOTA_MSG };
    }
  }
  function lsRemove(id) {
    const L = ls();
    if (!L) return;
    try {
      if (L.getItem(LS_PREFIX + id) != null) L.removeItem(LS_PREFIX + id);
      const list = localMetaList();
      if (list.some(m => m.id === id)) localMetaSet(list.filter(m => m.id !== id));
    } catch (e) { /* ignore */ }
  }

  function serialize(S) {
    return JSON.stringify(S, (k, v) => (k === 'todayPost' || k === '_healthKey' ? undefined : v));
  }

  /** Writes one data record + its index record. dels: record ids removed in the same transaction. */
  async function writeRecord(id, data, meta, opts) {
    opts = opts || {};
    const db = await openDB();
    if (idbReady(db)) {
      try {
        await run(db, 'readwrite', st => {
          (opts.dels || []).forEach(d => { st.delete(d); st.delete(META_PREFIX + d); });
          st.put({ id, data, meta });
          return st.put({ id: META_PREFIX + id, meta });
        });
        lsRemove(id); // an older localStorage copy would be stale now
        return { ok: true, bytes: data.length };
      } catch (e) {
        if (opts.noFallback) return { ok: false, quota: isQuota(e), error: isQuota(e) ? QUOTA_MSG : 'Could not write the save: ' + (e && e.message || e) };
        console.warn('IndexedDB save failed, falling back to localStorage', e);
      }
    } else if (opts.noFallback) {
      return { ok: false, error: 'Backups need IndexedDB, which this browser has disabled.' };
    }
    return lsWrite(id, data, meta);
  }

  // ---------------------------------------------------------------------------
  // Metadata
  // ---------------------------------------------------------------------------
  const PHASE_NAMES = {
    preseason: 'Preseason', regular: 'Regular season', playin: 'Play-In', playoffs: 'Playoffs', postseason_done: 'Season complete',
    awards: 'Season awards', draft_lottery: 'Draft lottery', draft: 'Draft', resign: 'Re-signing', freeagency: 'Free agency', training_camp: 'Training camp',
  };
  /** Short human label of where a career stands, e.g. "Regular season · Nov 4" (no DOM, safe in Node). */
  Store.phaseLabel = function (S) {
    let s = PHASE_NAMES[S.phase] || String(S.phase || '');
    try {
      const L = PBC.League;
      const inSeason = S.phase === 'regular' || S.phase === 'playin' || S.phase === 'playoffs';
      if (S.phase === 'playoffs' && S.playoffs && L && L.roundName) s = L.roundName(S, S.playoffs.round);
      if (inSeason && L && L.dateLabel && S.numDays) s += ' · ' + L.dateLabel(S, S.phase === 'regular' ? Math.max(0, Math.min(S.day, S.numDays - 1)) : Math.max(0, S.day));
    } catch (e) { /* label only */ }
    return s;
  };

  Store.meta = function (S, extra) {
    const t = S.teams ? S.teams[S.userTid] : null;
    let r = null;
    try { r = PBC.League.standings(S)[S.userTid]; } catch (e) { r = null; }
    const c = S.coach;
    const m = {
      id: S.saveId, kind: 'main', career: S.saveId,
      coach: c ? c.name : '', team: t ? `${t.city} ${t.name}` : '', abbr: t ? t.abbr : '', color: t ? t.colors.primary : '#666',
      colors: t ? { primary: t.colors.primary, secondary: t.colors.secondary, trim: t.colors.trim } : null,
      badge: t && t.badge && t.badge.shape ? t.badge.shape : 'shield',
      season: S.season, phase: S.phase, phaseLabel: Store.phaseLabel(S), day: S.day, record: r ? `${r.w}-${r.l}` : '',
      updated: Date.now(), created: S.created || null, leagueKey: S.leagueKey, difficulty: S.difficulty || 'normal',
      careerRecord: c && c.totals ? `${c.totals.w}-${c.totals.l}` : '', titles: c ? c.titles || 0 : 0,
      unemployed: !!(c && c.status !== 'employed'), imported: S.importedAt || null, v: S.v || 1,
    };
    return Object.assign(m, extra || {});
  };

  /** Fills in fields that older metas (written before slots/backups existed) do not have. */
  Store.normMeta = function (m0) {
    const m = Object.assign({}, m0);
    const id = String(m.id || '');
    if (!m.kind) m.kind = id.indexOf(SLOT_SEP) > 0 ? 'slot' : id.indexOf(BACKUP_SEP) > 0 ? 'backup' : 'main';
    if (m.kind === 'main') {
      // legacy metas used `career` for the coach's W-L; it is the career (save) id now
      if (!m.careerRecord && typeof m.career === 'string' && /^\d+-\d+$/.test(m.career)) m.careerRecord = m.career;
      m.career = id;
    } else if (!m.career || /^\d+-\d+$/.test(m.career)) {
      m.career = id.split(m.kind === 'slot' ? SLOT_SEP : BACKUP_SEP)[0];
    }
    if (!m.colors) m.colors = { primary: m.color || '#666666', secondary: '#ffffff', trim: '#ffffff' };
    if (!m.badge) m.badge = 'shield';
    return m;
  };
  Store.kindOf = m => Store.normMeta(m).kind;
  Store.careerOf = m => Store.normMeta(m).career;

  Store.slotId = function (careerId) {
    let ts = Date.now();
    if (ts <= lastStamp) ts = lastStamp + 1;
    lastStamp = ts;
    return careerId + SLOT_SEP + ts.toString(36);
  };
  Store.backupId = (careerId, k) => careerId + BACKUP_SEP + k;

  // ---------------------------------------------------------------------------
  // Progress keys: what autosave policies and backups compare
  // ---------------------------------------------------------------------------
  Store.progressKeys = function (S) {
    const phase = [S.season, S.phase, S.userTid, S.coach ? S.coach.status : ''].join('|');
    const day = S.day || 0;
    const games = S.boxes ? Object.keys(S.boxes).length : 0;
    const post = S.phase === 'playin' || S.phase === 'playoffs';
    return {
      phase,
      week: phase + '|w' + Math.floor(day / 7),
      day: phase + '|d' + day + '|g' + games,
      // backups: every in-season week, every postseason day, every other phase once
      backup: phase + (S.phase === 'regular' ? '|w' + Math.floor(day / 7) : post ? '|d' + day : ''),
    };
  };

  // ---------------------------------------------------------------------------
  // Save
  // ---------------------------------------------------------------------------
  /**
   * Writes the career's main record. opts.backup = { reason } also writes a rotating backup
   * (opts.backupCount = how many to keep). Returns { ok, bytes, local, error, quota, backup }.
   */
  Store.save = async function (S, opts) {
    opts = opts || {};
    const prev = S.updated;
    S.updated = Date.now();
    let data;
    try { data = serialize(S); } catch (e) { S.updated = prev; return { ok: false, error: 'Could not prepare the save: ' + e.message }; }
    const meta = Store.meta(S, { kind: 'main', bytes: data.length });
    const res = await writeRecord(S.saveId, data, meta);
    if (res.ok && opts.backup && (opts.backupCount | 0) > 0) {
      // backups live in IndexedDB only: localStorage (fallback) is far too small for extra copies
      res.backup = res.local ? { ok: false, skipped: true, error: 'Backups need IndexedDB.' } : await writeBackup(S.saveId, data, meta, opts.backup, opts.backupCount | 0);
    }
    return res;
  };

  /** Standalone backup of the current state (e.g. right before the offseason starts). */
  Store.saveBackup = async function (S, opts) {
    opts = opts || {};
    const keep = opts.backupCount == null ? 3 : opts.backupCount | 0;
    if (keep <= 0) return { ok: false, skipped: true, error: 'Backups are turned off.' };
    if (!idbReady(await openDB())) return { ok: false, skipped: true, error: 'Backups need IndexedDB.' };
    let data;
    try { data = serialize(S); } catch (e) { return { ok: false, error: e.message }; }
    const meta = Store.meta(S, { kind: 'main', bytes: data.length });
    return writeBackup(S.saveId, data, meta, opts, keep);
  };

  async function backupMetas(careerId) {
    const db = await openDB();
    if (!idbReady(db)) return [];
    const recs = await run(db, 'readonly', st => st.getAll(metaRange(careerId + BACKUP_SEP)));
    return (recs || []).map(r => Store.normMeta(r.meta)).sort((a, b) => (b.updated || 0) - (a.updated || 0));
  }

  async function writeBackup(careerId, data, baseMeta, info, keep) {
    try {
      keep = Math.max(1, Math.min(Store.MAX_BACKUPS, keep));
      const existing = await backupMetas(careerId);
      const kept = existing.slice(0, keep - 1);
      const used = new Set(kept.map(m => m.id));
      let k = 0;
      while (used.has(Store.backupId(careerId, k))) k++;
      const id = Store.backupId(careerId, k);
      const dels = existing.slice(keep - 1).map(m => m.id).filter(x => x !== id);
      const meta = Object.assign({}, baseMeta, { id, kind: 'backup', career: careerId, reason: info.reason || 'Autosave', updated: Date.now() });
      const r = await writeRecord(id, data, meta, { dels, noFallback: true });
      return Object.assign(r, { id });
    } catch (e) {
      return { ok: false, quota: isQuota(e), error: isQuota(e) ? QUOTA_MSG : 'Backup failed: ' + (e && e.message || e) };
    }
  }

  /** Deletes all but the newest `keep` backups of a career. */
  Store.pruneBackups = async function (careerId, keep) {
    const existing = await backupMetas(careerId);
    const dels = existing.slice(Math.max(0, keep | 0)).map(m => m.id);
    if (!dels.length) return 0;
    const db = await openDB();
    await run(db, 'readwrite', st => { dels.forEach(d => { st.delete(d); st.delete(META_PREFIX + d); }); });
    return dels.length;
  };

  /** "Save As": a named snapshot of the current state. The main record is not touched. */
  Store.saveSlot = async function (S, name) {
    const id = Store.slotId(S.saveId);
    let data;
    try { data = serialize(S); } catch (e) { return { ok: false, error: 'Could not prepare the save: ' + e.message }; }
    const meta = Store.meta(S, { id, kind: 'slot', career: S.saveId, slotName: String(name || '').trim().slice(0, 60) || 'Saved game', bytes: data.length });
    const res = await writeRecord(id, data, meta);
    return Object.assign(res, { id, meta });
  };

  // ---------------------------------------------------------------------------
  // List
  // ---------------------------------------------------------------------------
  async function idbMetas(db) {
    let keys = null;
    try { keys = await run(db, 'readonly', st => (st.getAllKeys ? st.getAllKeys() : null)); } catch (e) { keys = null; }
    if (!keys) { // very old engines: read everything
      const all = await run(db, 'readonly', st => st.getAll());
      return (all || []).filter(r => !isMetaKey(r.id)).map(r => Store.normMeta(Object.assign({}, r.meta || {}, { id: r.id, bytes: (r.meta && r.meta.bytes) || (r.data ? r.data.length : 0) })));
    }
    const dataIds = keys.filter(k => !isMetaKey(k));
    const dataSet = new Set(dataIds);
    const indexed = new Set(keys.filter(isMetaKey).map(k => k.slice(META_PREFIX.length)));
    // one-time: index records for saves written before the index existed
    for (const id of dataIds) {
      if (indexed.has(id)) continue;
      try {
        const rec = await run(db, 'readonly', st => st.get(id));
        if (!rec) continue;
        const meta = Store.normMeta(Object.assign({}, rec.meta || {}, { id, bytes: rec.data ? rec.data.length : 0 }));
        if (!rec.meta || !rec.meta.updated) meta.updated = meta.updated || 0;
        await run(db, 'readwrite', st => st.put({ id: META_PREFIX + id, meta }));
      } catch (e) { console.warn('Could not index save', id, e); }
    }
    const orphans = [...indexed].filter(id => !dataSet.has(id));
    if (orphans.length) { try { await run(db, 'readwrite', st => { orphans.forEach(id => st.delete(META_PREFIX + id)); }); } catch (e) { /* ignore */ } }
    const recs = await run(db, 'readonly', st => st.getAll(metaRange('')));
    return (recs || []).map(r => Store.normMeta(r.meta)).filter(m => dataSet.has(m.id));
  }

  /** Every record (main saves, slots, backups), newest first. */
  Store.listAll = async function () {
    const db = await openDB();
    let out = [];
    if (idbReady(db)) {
      try { out = await idbMetas(db); } catch (e) { console.warn('Could not list saves', e); }
    }
    for (const m0 of localMetaList()) {
      const m = Store.normMeta(m0);
      const i = out.findIndex(o => o.id === m.id);
      if (i < 0) out.push(Object.assign(m, { local: true }));
      else if ((m.updated || 0) > (out[i].updated || 0)) out[i] = Object.assign(m, { local: true });
    }
    return out.sort((a, b) => (b.updated || 0) - (a.updated || 0));
  };

  /** Careers only (their main records), newest first. Same shape as before slots existed. */
  Store.list = async function () {
    return (await Store.listAll()).filter(m => m.kind === 'main');
  };

  /** Everything that belongs to one career: { main, slots, backups }. */
  Store.listCareer = async function (careerId) {
    const all = (await Store.listAll()).filter(m => m.career === careerId);
    return {
      main: all.find(m => m.kind === 'main') || null,
      slots: all.filter(m => m.kind === 'slot'),
      backups: all.filter(m => m.kind === 'backup'),
    };
  };

  // ---------------------------------------------------------------------------
  // Load / remove / rename / copy
  // ---------------------------------------------------------------------------
  /** Raw record { data, meta } (the newest copy if both IndexedDB and localStorage have one). */
  Store.loadRaw = async function (id) {
    const db = await openDB();
    let data = null, meta = null;
    if (idbReady(db)) {
      try { const rec = await run(db, 'readonly', st => st.get(id)); if (rec) { data = rec.data; meta = rec.meta || null; } } catch (e) { /* ignore */ }
    }
    const L = ls();
    if (L) {
      try {
        const d2 = L.getItem(LS_PREFIX + id);
        if (d2) {
          const m2 = localMetaList().find(m => m.id === id) || null;
          if (!data || (m2 && (m2.updated || 0) > ((meta && meta.updated) || 0))) { data = d2; meta = m2 || meta; }
        }
      } catch (e) { /* ignore */ }
    }
    if (!data) return null;
    return { data, meta: Store.normMeta(Object.assign({ id }, meta || {})) };
  };

  Store.load = async function (id) {
    const raw = await Store.loadRaw(id);
    if (!raw) return null;
    const S = Store.migrate(JSON.parse(raw.data));
    if (raw.meta.kind !== 'main' && raw.meta.career) S.saveId = raw.meta.career; // a slot or backup is loaded as its career's state
    return S;
  };

  Store.remove = async function (id) {
    const db = await openDB();
    if (idbReady(db)) { try { await run(db, 'readwrite', st => { st.delete(id); return st.delete(META_PREFIX + id); }); } catch (e) { /* ignore */ } }
    lsRemove(id);
  };

  /** Deletes a career: its main record, every slot and every backup. Returns how many records were removed. */
  Store.removeCareer = async function (careerId) {
    const ids = (await Store.listAll()).filter(m => m.career === careerId || m.id === careerId).map(m => m.id);
    if (!ids.includes(careerId)) ids.push(careerId);
    const db = await openDB();
    if (idbReady(db)) { try { await run(db, 'readwrite', st => { ids.forEach(id => { st.delete(id); st.delete(META_PREFIX + id); }); }); } catch (e) { /* ignore */ } }
    ids.forEach(lsRemove);
    return ids.length;
  };

  /** Renames a save slot (or any record's display name). */
  Store.rename = async function (id, name) {
    name = String(name || '').trim().slice(0, 60);
    if (!name) return { ok: false, error: 'Name cannot be empty.' };
    const db = await openDB();
    if (idbReady(db)) {
      try {
        const rec = await run(db, 'readonly', st => st.get(id));
        if (rec) {
          rec.meta = Object.assign({}, rec.meta || { id }, { slotName: name });
          const idx = await run(db, 'readonly', st => st.get(META_PREFIX + id));
          const meta = Object.assign({}, (idx && idx.meta) || rec.meta, { slotName: name });
          await run(db, 'readwrite', st => { st.put(rec); return st.put({ id: META_PREFIX + id, meta }); });
          return { ok: true };
        }
      } catch (e) { return { ok: false, error: e.message }; }
    }
    const list = localMetaList();
    const m = list.find(x => x.id === id);
    if (!m) return { ok: false, error: 'Save not found.' };
    m.slotName = name;
    localMetaSet(list);
    return { ok: true };
  };

  /** Copies a record under a new id with meta changes (e.g. keep a career's latest save as a slot). */
  Store.copy = async function (fromId, toId, patch) {
    const raw = await Store.loadRaw(fromId);
    if (!raw) return { ok: false, error: 'Save not found.' };
    const meta = Store.normMeta(Object.assign({}, raw.meta, { bytes: raw.data.length }, patch || {}, { id: toId }));
    const res = await writeRecord(toId, raw.data, meta);
    return Object.assign(res, { id: toId, meta });
  };

  // ---------------------------------------------------------------------------
  // Migration, export, import
  // ---------------------------------------------------------------------------
  Store.migrate = function (S) {
    S.settings = Object.assign({ gimEnabled: true, autoPractice: false, simSpeed: 4, showVisuals: true, retroCourt: true, pixelMode: false, camera: 'broadcast', autoTimeouts: true, autosave: 'always', backupCount: 3 }, S.settings || {});
    if (!AUTOSAVE.includes(S.settings.autosave)) S.settings.autosave = 'always';
    const bc = Math.round(+S.settings.backupCount);
    S.settings.backupCount = isFinite(bc) ? Math.max(0, Math.min(Store.MAX_BACKUPS, bc)) : 3;
    S.flags = S.flags || {};
    S.news = S.news || [];
    S.history = S.history || [];
    // customized teams: the old `wood` field mirrors the court's wood tone
    for (const t of S.teams || []) if (t && t.court && t.court.wood) t.wood = t.court.wood;
    return S;
  };

  Store.exportString = S => serialize(S);
  /** The stored JSON of any record (for downloading a slot or backup). */
  Store.exportRecord = async function (id) {
    const raw = await Store.loadRaw(id);
    return raw ? raw.data : null;
  };
  Store.importString = function (str) {
    let S;
    try { S = JSON.parse(str); } catch (e) { throw new Error('The file is not valid JSON'); }
    if (!S || !Array.isArray(S.teams) || !S.players) throw new Error('Not a Pro BBALL Coach save file');
    S.saveId = 'save_' + Date.now().toString(36);
    S.importedAt = Date.now();
    delete S.lastBackupKey;
    return Store.migrate(S);
  };

  /** Browser storage usage { usage, quota } in bytes, or null when unknown. */
  Store.estimate = async function () {
    try {
      if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) return await navigator.storage.estimate();
    } catch (e) { /* ignore */ }
    return null;
  };
  Store.backend = async function () { const db = await openDB(); return idbReady(db) ? 'indexeddb' : 'localstorage'; };

  PBC.Store = Store;
})();
