/* Pro BBALL Coach — audio asset loader (PBC.AudioAssets).
 * Sounds live in folders (court, crowd, chants, chatter, arena, commentary). Because the game is opened by
 * double-clicking index.html, browsers block fetch() of local files, so each folder is packed into a plain script
 * (assets/audio/<folder>/pack.js, built by `node tools/audio/pack.js`) that registers its sounds as base64 with
 * their license. Scripts load fine from file://.
 *
 *   PBC.AudioAssets.register('court/dribble_01', 'data:audio/ogg;base64,...', { license: 'CC0', source: '...' });
 *   assets.load(['court'])            // adds the pack scripts listed in the manifest
 *   assets.decodeAll(ctx)             // decodes a few per frame (see AudioConfig.assets.decodeBudgetMs)
 *   assets.get('court/dribble_01')    // AudioBuffer or null
 *   assets.variants('court/dribble_') // every decoded buffer whose id starts with that prefix
 * When a sound is missing, callers fall back to the synthesized version, so an empty folder is never an error. */
(function () {
  'use strict';
  const PBC = window.PBC = window.PBC || {};
  const registry = {};              // id -> { data, meta, buf, state }
  const packsLoaded = {};

  function register(id, data, meta) {
    registry[id] = { id, data, meta: meta || {}, buf: null, state: 'raw' };
  }
  function b64ToBuf(dataUri) {
    const b64 = dataUri.slice(dataUri.indexOf(',') + 1);
    const bin = atob(b64), n = bin.length, out = new Uint8Array(n);
    for (let i = 0; i < n; i++) out[i] = bin.charCodeAt(i);
    return out.buffer;
  }
  function manifest() { return (PBC.AudioAssets && PBC.AudioAssets.manifest) || { packs: [] }; }

  /** add the pack scripts for these folders; resolves with the ids now registered */
  function load(folders) {
    const want = manifest().packs.filter(p => !folders || folders.includes(p.folder));
    return Promise.all(want.map(p => {
      if (packsLoaded[p.file]) return packsLoaded[p.file];
      packsLoaded[p.file] = new Promise((res) => {
        if (typeof document === 'undefined') { res(false); return; }
        const s = document.createElement('script');
        s.src = p.file; s.async = true;
        s.onload = () => res(true);
        s.onerror = () => { console.warn('audio pack missing', p.file); res(false); };
        document.head.appendChild(s);
      });
      return packsLoaded[p.file];
    })).then(() => Object.keys(registry));
  }
  /** decode every raw sound, never spending more than the frame budget starting decodes in one go */
  function decodeAll(ctx) {
    if (!ctx) return Promise.resolve(0);
    const budget = (PBC.AudioConfig && PBC.AudioConfig.assets.decodeBudgetMs) || 6;
    const todo = Object.values(registry).filter(r => r.state === 'raw');
    let done = 0;
    return new Promise((resolve) => {
      if (!todo.length) { resolve(0); return; }
      let pending = todo.length;
      const finish = () => { if (--pending === 0) resolve(done); };
      const step = () => {
        const t0 = performance.now();
        while (todo.length && performance.now() - t0 < budget) {
          const r = todo.shift();
          r.state = 'decoding';
          let ab;
          try { ab = b64ToBuf(r.data); } catch (e) { r.state = 'error'; finish(); continue; }
          ctx.decodeAudioData(ab).then(buf => { r.buf = buf; r.state = 'ready'; r.data = null; done++; finish(); }, () => { r.state = 'error'; finish(); });
        }
        if (todo.length) (typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame : setTimeout)(step);
      };
      step();
    });
  }
  function get(id) { const r = registry[id]; return r && r.buf ? r.buf : null; }
  function variants(prefix) {
    const out = [];
    for (const id in registry) if (id.startsWith(prefix) && registry[id].buf) out.push(registry[id].buf);
    return out;
  }
  /** everything registered with its license, for the credits and the gauntlet reports */
  function licenses() {
    return Object.values(registry).map(r => ({ id: r.id, license: r.meta.license || 'UNKNOWN', source: r.meta.source || '', author: r.meta.author || '', state: r.state }));
  }
  function list() { return Object.keys(registry); }

  PBC.AudioAssets = Object.assign(PBC.AudioAssets || {}, { register, load, decodeAll, get, variants, licenses, list });
  if (!PBC.AudioAssets.manifest) PBC.AudioAssets.manifest = { packs: [] };
})();
