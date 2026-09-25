/* Pro BBALL Coach — saving & loading careers (IndexedDB with localStorage fallback, JSON export/import). */
(function () {
  'use strict';
  const PBC = (window.PBC = window.PBC || {});
  const Store = {};
  const DB_NAME = 'pro_bball_coach', STORE = 'saves', META_KEY = 'pbc_meta_v1';
  let dbp = null;
  let useLocal = false;

  function openDB() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      try {
        if (typeof indexedDB === 'undefined') throw new Error('no indexedDB');
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => { req.result.createObjectStore(STORE, { keyPath: 'id' }); };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      } catch (e) { reject(e); }
    }).catch(e => { useLocal = true; return null; });
    return dbp;
  }

  function tx(db, mode, fn) {
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const st = t.objectStore(STORE);
      let out;
      const r = fn(st);
      if (r) r.onsuccess = () => { out = r.result; };
      t.oncomplete = () => resolve(out);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }

  Store.meta = function (S) {
    const t = S.teams[S.userTid];
    const r = PBC.League.standings(S)[S.userTid];
    return {
      id: S.saveId, coach: S.coach ? S.coach.name : '', team: t ? `${t.city} ${t.name}` : '', abbr: t ? t.abbr : '', color: t ? t.colors.primary : '#666',
      season: S.season, phase: S.phase, record: r ? `${r.w}-${r.l}` : '', updated: Date.now(), leagueKey: S.leagueKey,
      career: S.coach ? `${S.coach.totals.w}-${S.coach.totals.l}` : '', titles: S.coach ? S.coach.titles : 0,
    };
  };

  function localMetaList() {
    try { return JSON.parse(localStorage.getItem(META_KEY) || '[]'); } catch (e) { return []; }
  }
  function localMetaSet(list) { try { localStorage.setItem(META_KEY, JSON.stringify(list)); } catch (e) { /* ignore */ } }

  function serialize(S) {
    return JSON.stringify(S, (k, v) => (k === 'todayPost' || k === '_healthKey' ? undefined : v));
  }

  Store.save = async function (S) {
    S.updated = Date.now();
    const data = serialize(S);
    const meta = Store.meta(S);
    const db = await openDB();
    if (db && !useLocal) {
      try {
        await tx(db, 'readwrite', st => st.put({ id: S.saveId, data, meta }));
        return { ok: true, bytes: data.length };
      } catch (e) { console.warn('IndexedDB save failed, falling back', e); }
    }
    try {
      localStorage.setItem('pbc_save_' + S.saveId, data);
      const list = localMetaList().filter(m => m.id !== S.saveId);
      list.unshift(meta);
      localMetaSet(list);
      return { ok: true, bytes: data.length, local: true };
    } catch (e) {
      return { ok: false, error: 'Storage is full. Export your save to a file from Settings.' };
    }
  };

  Store.list = async function () {
    const db = await openDB();
    let out = [];
    if (db && !useLocal) {
      try {
        const all = await tx(db, 'readonly', st => st.getAll());
        out = (all || []).map(x => x.meta);
      } catch (e) { /* ignore */ }
    }
    const local = localMetaList();
    for (const m of local) if (!out.some(o => o.id === m.id)) out.push(m);
    return out.sort((a, b) => (b.updated || 0) - (a.updated || 0));
  };

  Store.load = async function (id) {
    const db = await openDB();
    let data = null;
    if (db && !useLocal) {
      try { const rec = await tx(db, 'readonly', st => st.get(id)); data = rec ? rec.data : null; } catch (e) { /* ignore */ }
    }
    if (!data) { try { data = localStorage.getItem('pbc_save_' + id); } catch (e) { /* ignore */ } }
    if (!data) return null;
    return Store.migrate(JSON.parse(data));
  };

  Store.remove = async function (id) {
    const db = await openDB();
    if (db && !useLocal) { try { await tx(db, 'readwrite', st => st.delete(id)); } catch (e) { /* ignore */ } }
    try { localStorage.removeItem('pbc_save_' + id); localMetaSet(localMetaList().filter(m => m.id !== id)); } catch (e) { /* ignore */ }
  };

  Store.migrate = function (S) {
    S.settings = Object.assign({ gimEnabled: true, autoPractice: false, simSpeed: 4, showVisuals: true, retroCourt: true, pixelMode: false, camera: 'broadcast', autoTimeouts: true }, S.settings || {});
    S.flags = S.flags || {};
    S.news = S.news || [];
    S.history = S.history || [];
    return S;
  };

  Store.exportString = S => serialize(S);
  Store.importString = function (str) {
    const S = JSON.parse(str);
    if (!S || !S.teams || !S.players) throw new Error('Not a Pro BBALL Coach save file');
    S.saveId = 'save_' + Date.now().toString(36);
    return Store.migrate(S);
  };

  PBC.Store = Store;
})();
