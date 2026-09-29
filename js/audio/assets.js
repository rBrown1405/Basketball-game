/* Pro BBALL Coach: sound packs (PBC.AudioAssets).
 * Recordings live in assets/audio/<folder>/ (court, crowd, chants, chatter, arena, commentary, and test), each folder
 * with a LICENSES.md that names every file's source, author and license. tools/audio/pack.js turns a folder into a
 * script, js/audio/packs/<folder>.js, holding the files base64-encoded, so a game opened by double-clicking
 * index.html (a file:// page, where fetch and XMLHttpRequest are blocked) loads them the way it loads the 3D body
 * data. js/audio/packs/index.js lists the packs that exist.
 * A pack loads the first time a live game's audio starts; a file's sound name is its name without the take number
 * (rim_01.wav and rim_02.wav are two takes of "rim"), and get() never hands out the same take twice in a row. Until a
 * pack has loaded and decoded, or when it has no such sound, get() returns null and the synthesized sound plays. */
(function () {
  'use strict';
  const PBC = window.PBC = window.PBC || {};
  const packs = Object.create(null);   // folder → { state, files, sounds: {name: [AudioBuffer]}, last: {name: i} }
  const DIR = 'js/audio/packs/';

  // the pack scripts call this
  PBC.AudioPacks = PBC.AudioPacks || { available: [] };
  PBC.AudioPacks.register = function (folder, data) {
    const p = packs[folder] || (packs[folder] = { state: 'loading', sounds: {}, last: {} });
    p.files = (data && data.files) || {};
    p.license = data && data.license;
    p.state = 'loaded';
    if (p.onload) p.onload();
  };

  const nameOf = (file) => file.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]?\d+$/, '');
  function b64ToBuffer(s) {
    const i = s.indexOf(','), bin = atob(i >= 0 ? s.slice(i + 1) : s), n = bin.length, u = new Uint8Array(n);
    for (let k = 0; k < n; k++) u[k] = bin.charCodeAt(k);
    return u.buffer;
  }
  function decode(ctx, p) {
    const jobs = Object.keys(p.files).map((f) => new Promise((res) => {
      let ab;
      try { ab = b64ToBuffer(p.files[f]); } catch (e) { res(); return; }
      ctx.decodeAudioData(ab, (buf) => { const n = nameOf(f); (p.sounds[n] || (p.sounds[n] = [])).push(buf); res(); }, () => { console.warn('audio pack: cannot decode ' + f); res(); });
    }));
    return Promise.all(jobs).then(() => { p.state = 'ready'; p.files = null; });
  }

  const Assets = {
    /** the packs that exist (js/audio/packs/index.js) */
    available() { return (PBC.AudioPacks.available || []).slice(); },
    /** load and decode a pack in this AudioContext (once); resolves true when ready, false when there is none */
    load(folder, ctx) {
      if (!ctx) return Promise.resolve(false);
      const p = packs[folder];
      if (p && p.state === 'ready') return Promise.resolve(true);
      if (p && p.promise) return p.promise;
      if (!Assets.available().includes(folder)) return Promise.resolve(false);
      const q = packs[folder] || (packs[folder] = { state: 'loading', sounds: {}, last: {} });
      q.promise = new Promise((res) => {
        const go = () => decode(ctx, q).then(() => res(true));
        if (q.state === 'loaded') { go(); return; }
        q.onload = go;
        const el = document.createElement('script');
        el.src = DIR + folder + '.js';
        el.onerror = () => { q.state = 'missing'; res(false); };
        document.head.appendChild(el);
      });
      return q.promise;
    },
    /** load every pack that exists */
    loadAll(ctx) { return Promise.all(Assets.available().map((f) => Assets.load(f, ctx))); },
    /** a take of this sound (never the one handed out last time), or null */
    get(folder, name) {
      const p = packs[folder];
      if (!p || p.state !== 'ready') return null;
      const takes = p.sounds[name];
      if (!takes || !takes.length) return null;
      if (takes.length === 1) return takes[0];
      let i = Math.floor(PBC.AudioRandom.random() * (takes.length - 1));
      if (i >= (p.last[name] == null ? takes.length : p.last[name])) i++;
      p.last[name] = i;
      return takes[i];
    },
    has(folder, name) { const p = packs[folder]; return !!(p && p.state === 'ready' && p.sounds[name] && p.sounds[name].length); },
    status() {
      const o = {};
      for (const f of Object.keys(packs)) { const p = packs[f]; o[f] = { state: p.state, sounds: Object.keys(p.sounds).map((n) => n + ' x' + p.sounds[n].length) }; }
      return o;
    },
  };
  PBC.AudioAssets = Assets;
})();
