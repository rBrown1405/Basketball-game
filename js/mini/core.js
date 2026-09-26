/* Pro BBALL Coach - mini-games core: PBC.Mini namespace, utils, colours + theme, grades, drill registry, WebAudio sfx
   (created lazily, after the first user gesture) and the Session every mini-game runs in (overlay, modal keys, holds,
   loop, timers, watchdog, resolve-once). Load before the other mini files. */
(function () {
  'use strict';
  const PBC = (window.PBC = window.PBC || {});
  const Mini = (PBC.Mini = PBC.Mini || {});

  // =============================================================================== utils (Mini.util)
  const U = (Mini.util = {});
  U.now = () => performance.now();   // looked up per call: the test bench swaps in a virtual clock after load
  U.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  U.sat = v => (v < 0 ? 0 : v > 1 ? 1 : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  /** Finite number (numeric strings accepted) or the default. */
  U.num = (v, d) => { const n = typeof v === 'string' && v.trim() !== '' ? +v : v; return typeof n === 'number' && isFinite(n) ? n : d; };
  U.rand = (a, b) => a + Math.random() * (b - a);
  U.pick = a => a[Math.floor(Math.random() * a.length)];
  /** Shuffled copy (Fisher-Yates); the input is left alone. */
  U.shuffle = a => { const r = Array.from(a || []); for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)), t = r[i]; r[i] = r[j]; r[j] = t; } return r; };
  // easings take any t and clamp it to 0..1
  U.easeIn = t => { t = U.sat(t); return t * t; };
  U.easeOut = t => { t = U.sat(t); return 1 - (1 - t) * (1 - t); };
  U.smooth = t => { t = U.sat(t); return t * t * (3 - 2 * t); };

  U.el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  U.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ESC[c]);
  /** Re-trigger a CSS animation class (remove, force a reflow, add). */
  U.restartAnim = (el, cls) => { if (!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };
  const mq = q => { try { return !!(window.matchMedia && window.matchMedia(q).matches); } catch (e) { return false; } };
  /** Primary input is a finger (phones / tablets): show tap hints instead of key hints. */
  U.isTouch = () => mq('(hover: none) and (pointer: coarse)');
  let rmq = null; // one live MediaQueryList (checked every frame by the canvas effects)
  U.reducedMotion = () => { try { if (!rmq && window.matchMedia) rmq = window.matchMedia('(prefers-reduced-motion: reduce)'); return !!(rmq && rmq.matches); } catch (e) { return false; } };
  U.lsGet = k => { try { return window.localStorage.getItem(k); } catch (e) { return null; } };
  U.lsSet = (k, v) => { try { window.localStorage.setItem(k, String(v)); } catch (e) { /* private mode / quota: not critical */ } };

  // keys: normalised to lower-case KeyboardEvent.key names ('space', 'enter', 'escape', 'arrowleft', '1', 'a', ...)
  const KEY_ALIAS = { ' ': 'space', spacebar: 'space', esc: 'escape', left: 'arrowleft', right: 'arrowright', up: 'arrowup', down: 'arrowdown' };
  const DIRS = { arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right', arrowup: 'up', w: 'up', arrowdown: 'down', s: 'down' };
  const NAV = { space: 1, enter: 1, arrowleft: 1, arrowright: 1, arrowup: 1, arrowdown: 1 };   // never scroll the page
  U.keyOf = e => { if (e.code === 'Space') return 'space'; const k = String(e.key || '').toLowerCase(); return KEY_ALIAS[k] || k; };
  /** 'left' | 'right' | 'up' | 'down' for arrows and WASD, else null. */
  U.dirOf = k => DIRS[k] || null;

  /** Signed seconds → '+42 ms' / '-17 ms' (negative = early). */
  U.ms = sec => { if (sec == null || !isFinite(sec)) return '-'; const v = Math.round(sec * 1000); return (v > 0 ? '+' : v < 0 ? '-' : '') + Math.abs(v) + ' ms'; };
  U.initials = name => {
    const p = String(name == null ? '' : name).trim().split(/[\s.]+/).filter(Boolean);
    if (!p.length) return '•';
    return (p.length > 1 ? p[0].charAt(0) + p[p.length - 1].charAt(0) : p[0].slice(0, 2)).toUpperCase();
  };
  U.lastName = name => { const p = String(name == null ? '' : name).trim().split(/\s+/); return p[p.length - 1] || ''; };
  /** Tone class for an estimated make probability (0..1). */
  U.pctTone = p => (p >= 0.55 ? 'good' : p >= 0.42 ? 'ok' : p >= 0.3 ? 'warn' : 'bad');

  const GRADES = [[95, 'A+'], [90, 'A'], [85, 'A-'], [80, 'B+'], [75, 'B'], [70, 'B-'], [65, 'C+'], [60, 'C'], [55, 'C-'], [45, 'D']];
  U.grade = score => { const s = U.num(score, 0); for (const g of GRADES) if (s >= g[0]) return g[1]; return 'F'; };
  U.gradeTone = g => { const c = String(g || 'F').charAt(0); return c === 'A' ? 'gold' : c === 'B' ? 'good' : c === 'C' ? 'ok' : c === 'D' ? 'warn' : 'bad'; };
  Mini.grade = U.grade;

  /** Rating key → label (same wording as the game's config; the mini-games stay standalone). */
  Mini.RATING_LABELS = {
    close: 'Close Shot', layup: 'Driving Layup', dunk: 'Dunk', post: 'Post Moves', mid: 'Mid-Range', three: 'Three-Point',
    ft: 'Free Throw', drawFoul: 'Draw Foul', shotIQ: 'Shot IQ', handle: 'Ball Handle', pass: 'Pass Accuracy', vision: 'Court Vision',
    intD: 'Interior Defense', perD: 'Perimeter Defense', steal: 'Steal', block: 'Block', helpD: 'Help Defense IQ',
    oreb: 'Offensive Rebound', dreb: 'Defensive Rebound', speed: 'Speed', agility: 'Agility', strength: 'Strength',
    vert: 'Vertical', stamina: 'Stamina', hustle: 'Hustle', clutch: 'Clutch', durability: 'Durability',
  };

  /** Drill bodies (drills_*.js) register here; PBC.Mini.runDrill (drills.js) looks them up by key. */
  Mini._drills = Mini._drills || {};
  Mini.registerDrill = (key, impl) => { if (key && impl && typeof impl.start === 'function') Mini._drills[key] = impl; return impl; };

  // =============================================================================== colours (Mini.color) + theme
  const C = (Mini.color = {});
  const colorCache = new Map();
  let probe = null;
  function parseHex(s) {
    const m = /^#([0-9a-f]{3,8})$/i.exec(s);
    if (!m) return null;
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = h.replace(/./g, c => c + c);
    if (h.length !== 6 && h.length !== 8) return null;
    const n = parseInt(h.slice(0, 6), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1];
  }
  function parseRgb(s) {
    const m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[,/]\s*([\d.]+)(%?)\s*)?\)$/i.exec(s);
    if (!m) return null;
    const a = m[4] == null ? 1 : +m[4] / (m[5] ? 100 : 1);
    return [+m[1], +m[2], +m[3], U.clamp(a, 0, 1)];
  }
  function viaCanvas(s) {   // any other CSS colour (hsl(), names, ...): let a 2D context normalise it
    try {
      if (!probe) probe = document.createElement('canvas').getContext('2d');
      probe.fillStyle = '#010203'; probe.fillStyle = s;
      const out = String(probe.fillStyle);
      if (out === '#010203' && !/^#010203$/i.test(s)) return null;
      return parseHex(out) || parseRgb(out);
    } catch (e) { return null; }
  }
  /** Any CSS colour → [r, g, b, a] (unparseable → white). */
  C.parse = c => {
    if (Array.isArray(c)) return c;
    const s = String(c == null ? '' : c).trim();
    let v = colorCache.get(s);
    if (!v) {
      v = parseHex(s) || parseRgb(s) || viaCanvas(s) || [255, 255, 255, 1];
      if (colorCache.size > 400) colorCache.clear();
      colorCache.set(s, v);
    }
    return v;
  };
  C.valid = c => { const s = String(c == null ? '' : c).trim(); return !!s && !!(parseHex(s) || parseRgb(s) || viaCanvas(s)); };
  const hex2 = n => ('0' + Math.round(U.clamp(n, 0, 255)).toString(16)).slice(-2);
  C.hex = (r, g, b) => '#' + hex2(r) + hex2(g) + hex2(b);
  /** Colour with alpha (multiplied with the colour's own alpha). */
  C.rgba = (c, a) => { const p = C.parse(c), al = U.clamp(U.num(a, 1) * p[3], 0, 1); return `rgba(${Math.round(p[0])},${Math.round(p[1])},${Math.round(p[2])},${+al.toFixed(3)})`; };
  C.mix = (a, b, t) => { const p = C.parse(a), q = C.parse(b); return C.hex(U.lerp(p[0], q[0], t), U.lerp(p[1], q[1], t), U.lerp(p[2], q[2], t)); };
  /** amt < 0 darkens toward black, amt > 0 lightens toward white (-1..1). */
  C.shade = (c, amt) => {
    const p = C.parse(c), to = amt < 0 ? 0 : 255, k = Math.min(1, Math.abs(U.num(amt, 0)));
    const r = U.lerp(p[0], to, k), g = U.lerp(p[1], to, k), b = U.lerp(p[2], to, k);
    return p[3] < 1 ? `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${p[3]})` : C.hex(r, g, b);
  };
  /** Relative luminance 0..1 (pick dark or light text on a fill). */
  C.lum = c => { const p = C.parse(c); return (0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]) / 255; };

  const THEME = { bg: '#0b0f17', panel: '#121826', panel2: '#182033', line: '#243049', text: '#e8edf5', muted: '#8a96ab',
    accent: '#ff6b1a', accent2: '#ffb020', good: '#29d17d', bad: '#ff4d5e', gold: '#ffc940' };
  const FONT_UI = '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, Helvetica, Arial, sans-serif';
  const FONT_DISPLAY = '"Avenir Next Condensed", "Oswald", "Arial Narrow", "Roboto Condensed", Impact, sans-serif';
  /** The app's :root palette (--bg --panel ... --gold, --font-ui, --font-display) with the documented fallbacks. */
  Mini.theme = function () {
    let cs = null;
    try { cs = window.getComputedStyle(document.documentElement); } catch (e) { cs = null; }
    const v = name => (cs ? String(cs.getPropertyValue('--' + name) || '').trim() : '');
    const T = {};
    for (const k in THEME) { const c = v(k); T[k] = c && C.valid(c) ? c : THEME[k]; }
    T.blue = '#5aa9ff';
    T.fontUi = v('font-ui') || FONT_UI;
    T.fontDisplay = v('font-display') || FONT_DISPLAY;
    Mini._theme = T;   // cached for the canvas helpers (court.js)
    return T;
  };

  // =============================================================================== sound: Mini.sfx(name), Mini.crowd()
  if (typeof Mini.muted !== 'boolean') Mini.muted = false;
  if (typeof Mini.volume !== 'number') Mini.volume = 0.7;
  const AC = window.AudioContext || window.webkitAudioContext;
  const GESTURES = ['pointerdown', 'keydown', 'touchend'];
  let actx = null, master = null, noiseBuf = null, gestured = false, audioDead = !AC;
  const quiet = p => { if (p && p.catch) p.catch(() => {}); };
  function onGesture(e) {
    if (e && e.isTrusted === false) return;   // synthetic events are not a user gesture
    gestured = true;
    GESTURES.forEach(t => window.removeEventListener(t, onGesture, true));
    if (actx && actx.state === 'suspended') quiet(actx.resume());
  }
  if (AC) GESTURES.forEach(t => window.addEventListener(t, onGesture, true));
  /** The shared AudioContext, created on first use after a user gesture; null when muted / silent / unavailable. */
  function audio() {
    if (audioDead || Mini.muted || !(U.num(Mini.volume, 0.7) > 0)) return null;
    if (!actx) {
      const ua = navigator.userActivation;
      if (!gestured && !(ua && ua.hasBeenActive)) return null;
      try { actx = new AC(); master = actx.createGain(); master.connect(actx.destination); } catch (e) { audioDead = true; return null; }
    }
    if (actx.state === 'suspended' && actx.resume) quiet(actx.resume());
    master.gain.value = U.clamp(U.num(Mini.volume, 0.7), 0, 1);
    return actx;
  }
  function noiseBuffer(a) {
    if (!noiseBuf) {
      noiseBuf = a.createBuffer(1, Math.floor(a.sampleRate * 2), a.sampleRate);
      const ch = noiseBuf.getChannelData(0);
      for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    }
    return noiseBuf;
  }
  function env(g, t0, peak, att, dur) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + att);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(att + 0.01, dur));
  }
  /** Oscillator blip: { f, f2 (glide to), type, t (delay), d (length), v (peak), a (attack), vib: [rate, depth] }. */
  function tone(a, o) {
    const t0 = a.currentTime + (o.t || 0), d = o.d || 0.1, osc = a.createOscillator(), g = a.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f, t0);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t0 + d);
    if (o.vib) {
      const lfo = a.createOscillator(), lg = a.createGain();
      lfo.frequency.value = o.vib[0]; lg.gain.value = o.vib[1];
      lfo.connect(lg); lg.connect(osc.frequency); lfo.start(t0); lfo.stop(t0 + d + 0.05);
    }
    env(g, t0, o.v || 0.1, o.a || 0.006, d);
    osc.connect(g); g.connect(master);
    osc.start(t0); osc.stop(t0 + d + 0.05);
  }
  /** Filtered noise burst: { t, d, v, a, f (filter Hz), q, type (biquad type) }. */
  function noise(a, o) {
    const t0 = a.currentTime + (o.t || 0), d = o.d || 0.1;
    const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    src.buffer = noiseBuffer(a);
    f.type = o.type || 'bandpass'; f.frequency.value = o.f || 2000; f.Q.value = o.q || 1;
    env(g, t0, o.v || 0.1, o.a || 0.004, d);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0, Math.random() * 1.2); src.stop(t0 + d + 0.05);
  }
  const arp = (a, fs, o) => fs.forEach((f, i) => tone(a, Object.assign({}, o, { f, t: (o.t || 0) + i * (o.gap || 0.06) })));
  const SFX = {
    hover: a => tone(a, { f: 1500, d: 0.035, v: 0.035 }),
    tick: a => tone(a, { f: 1250, d: 0.045, v: 0.06, type: 'square' }),
    tock: a => tone(a, { f: 760, d: 0.06, v: 0.09, type: 'triangle' }),
    select: a => { tone(a, { f: 520, f2: 780, d: 0.09, v: 0.13, type: 'triangle' }); tone(a, { f: 1040, t: 0.07, d: 0.16, v: 0.1 }); },
    impact: a => {
      tone(a, { f: 150, f2: 40, d: 0.6, v: 0.45 });
      noise(a, { d: 0.4, v: 0.18, f: 700, q: 0.5, type: 'lowpass' });
      tone(a, { f: 300, f2: 900, t: 0.04, d: 0.32, v: 0.05, type: 'sawtooth' });
    },
    buzzer: a => { tone(a, { f: 196, d: 0.6, v: 0.13, type: 'sawtooth', a: 0.01 }); tone(a, { f: 247, d: 0.6, v: 0.08, type: 'square', a: 0.01 }); },
    hold: a => tone(a, { f: 260, f2: 470, d: 0.16, v: 0.06 }),
    perfect: a => arp(a, [880, 1109, 1319, 1760], { d: 0.24, v: 0.11, type: 'triangle', gap: 0.055 }),
    good: a => arp(a, [660, 880], { d: 0.16, v: 0.12, type: 'triangle', gap: 0.08 }),
    ok: a => tone(a, { f: 587, d: 0.14, v: 0.11, type: 'triangle' }),
    bad: a => tone(a, { f: 230, f2: 120, d: 0.3, v: 0.11, type: 'sawtooth' }),
    start: a => arp(a, [523, 784], { d: 0.18, v: 0.1, type: 'square', gap: 0.1 }),
    grade: a => arp(a, [523, 659, 784, 1047], { d: 0.28, v: 0.1, type: 'triangle', gap: 0.085 }),
    combo: a => arp(a, [660, 880, 1320], { d: 0.12, v: 0.08, type: 'square', gap: 0.045 }),
    swish: a => noise(a, { d: 0.3, v: 0.2, a: 0.03, f: 4200, q: 0.8 }),
    clank: a => {
      [540, 1210, 1830].forEach((f, i) => tone(a, { f, d: 0.28 - i * 0.06, v: 0.075 - i * 0.02, type: 'square' }));
      noise(a, { d: 0.06, v: 0.1, f: 3000, q: 2 });
    },
    bounce: a => { tone(a, { f: 150, f2: 62, d: 0.15, v: 0.36 }); noise(a, { d: 0.04, v: 0.07, f: 500, type: 'lowpass' }); },
    step: a => { noise(a, { d: 0.05, v: 0.1, f: 1800, q: 1.4 }); tone(a, { f: 125, f2: 80, d: 0.06, v: 0.1 }); },
    whistle: a => { tone(a, { f: 2750, d: 0.42, v: 0.06, a: 0.02, vib: [28, 90] }); tone(a, { f: 5500, d: 0.4, v: 0.012, a: 0.02, vib: [28, 180] }); },
    gassed: a => tone(a, { f: 420, f2: 130, d: 0.6, v: 0.1, type: 'sawtooth', vib: [7, 12] }),
  };
  /** Short procedural sound by name (unknown names, mute and missing audio are silent no-ops). */
  Mini.sfx = function (name) {
    const fn = SFX[name];
    if (!fn) return;
    const a = audio();
    if (!a) return;
    try { fn(a); } catch (e) { /* audio is best effort */ }
  };
  /** Looping crowd-noise bed for a drill: { level(0..1), stop() }. Silent (but safe) when audio is off. */
  Mini.crowd = function () {
    let src = null, band = null, gain = null, stopped = false;
    const start = a => {
      src = a.createBufferSource(); src.buffer = noiseBuffer(a); src.loop = true;
      band = a.createBiquadFilter(); band.type = 'bandpass'; band.frequency.value = 800; band.Q.value = 0.45;
      const low = a.createBiquadFilter(); low.type = 'lowpass'; low.frequency.value = 2600;
      gain = a.createGain(); gain.gain.value = 0;
      src.connect(band); band.connect(low); low.connect(gain); gain.connect(master);
      src.start();
    };
    return {
      level(v) {
        if (stopped) return;
        const a = audio();
        if (!a) { if (gain) gain.gain.setTargetAtTime(0, actx.currentTime, 0.05); return; }
        try {
          if (!src) start(a);
          const x = U.sat(U.num(v, 0));
          gain.gain.setTargetAtTime(0.015 + 0.17 * x * x, a.currentTime, 0.12);
          band.frequency.setTargetAtTime(650 + 950 * x, a.currentTime, 0.2);
        } catch (e) { stopped = true; }
      },
      stop() {
        if (stopped) return;
        stopped = true;
        if (!src) return;
        try {
          const t = actx.currentTime, g = gain;
          g.gain.setTargetAtTime(0, t, 0.08);
          src.onended = () => { try { g.disconnect(); } catch (e) { /* already gone */ } };
          src.stop(t + 0.5);
        } catch (e) { /* context closed */ }
      },
    };
  };

  // =============================================================================== Session: overlay, input, lifecycle
  const active = (Mini._active = []);

  // A static container is made position:relative while it hosts overlays and restored afterwards (ref-counted).
  const positioned = new Map();
  function grab(el) {
    let h = positioned.get(el);
    if (!h) {
      h = { n: 0, prev: el.style.position, set: false };
      let pos = '';
      try { pos = window.getComputedStyle(el).position; } catch (e) { pos = ''; }
      if (pos === 'static') { el.style.position = 'relative'; h.set = true; }
      positioned.set(el, h);
    }
    h.n++;
  }
  function release(el) {
    const h = positioned.get(el);
    if (!h || --h.n > 0) return;
    positioned.delete(el);
    if (h.set) el.style.position = h.prev;
  }

  // One capture-phase key listener on window while any mini-game is open; the newest game gets the keys.
  let keysBound = false;
  function onKey(e) { const s = active[active.length - 1]; if (s) s._key(e); }
  function bindKeys(on) {
    if (on === keysBound) return;
    keysBound = on;
    ['keydown', 'keyup', 'keypress'].forEach(t => { if (on) window.addEventListener(t, onKey, true); else window.removeEventListener(t, onKey, true); });
  }

  /** A bag of listeners / timers / frame loops / key handlers / cleanups that is disposed together. */
  class Scope {
    constructor(parent) {
      this.session = parent ? parent.session : this;
      this.disposed = false;
      this._subs = [];
      if (parent) parent._add(() => this.dispose());
    }
    _add(off) { if (this.disposed) off(); else this._subs.push(off); return off; }
    _live() { return !this.disposed && !this.session.done; }
    /** Run fn; a throw ends the mini-game (resolved with its fallback) instead of leaving a stuck overlay. */
    guard(fn) { return this.session._try(fn); }
    on(el, type, fn, opt) {
      if (!el || !el.addEventListener) return () => {};
      const h = e => { if (this._live()) this.guard(() => fn(e)); };
      el.addEventListener(type, h, opt || false);
      return this._add(() => el.removeEventListener(type, h, opt || false));
    }
    after(ms, fn) {
      let id = setTimeout(() => { id = 0; if (this._live()) this.guard(fn); }, Math.max(0, U.num(ms, 0)));
      return this._add(() => { if (id) clearTimeout(id); id = 0; });
    }
    /** fn(dt seconds (clamped to 0.1), now ms) every animation frame. */
    loop(fn) {
      const s = this.session, f = { fn, last: U.now() };
      s._frames.push(f); s._kick();
      return this._add(() => { const i = s._frames.indexOf(f); if (i >= 0) s._frames.splice(i, 1); });
    }
    /** fn(e, key) on keydown, newest handler first; return true when handled (stops the chain, preventDefault). */
    key(fn) { return this._handler(this.session._keys, fn); }
    keyUp(fn) { return this._handler(this.session._ups, fn); }
    _handler(list, fn) {
      const h = { fn, dead: false };
      list.push(h);
      return this._add(() => { h.dead = true; const i = list.indexOf(h); if (i >= 0) list.splice(i, 1); });
    }
    /** Hold input: Space, or a pointer (mouse / touch / pen) pressed on el. Elements marked [data-pm-nohold] are ignored. */
    hold(el, onDown, onUp) {
      const ptrs = new Set();
      let key = false, down = false;
      const sync = () => {
        const d = key || ptrs.size > 0;
        if (d === down) return;
        down = d;
        const fn = d ? onDown : onUp;
        if (fn) fn();
      };
      this.key((e, k) => { if (k !== 'space') return false; if (!e.repeat && !key) { key = true; sync(); } return true; });
      this.keyUp((e, k) => { if (k !== 'space') return false; if (key) { key = false; sync(); } return true; });
      this.on(el, 'pointerdown', e => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        if (e.target && e.target.closest && e.target.closest('[data-pm-nohold]')) return;
        if (e.cancelable) e.preventDefault();
        ptrs.add(e.pointerId); sync();
      });
      const lift = e => { if (ptrs.delete(e.pointerId)) sync(); };
      this.on(window, 'pointerup', lift);
      this.on(window, 'pointercancel', lift);
      this.on(window, 'blur', () => { key = false; ptrs.clear(); sync(); });
      return { isDown: () => down };
    }
    onCleanup(fn) { return this._add(() => this.guard(fn)); }
    scope() { return new Scope(this); }
    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      const subs = this._subs;
      this._subs = [];
      for (let i = subs.length - 1; i >= 0; i--) { try { subs[i](); } catch (e) { console.error('[PBC.Mini]', e); } }
    }
  }

  /**
   * One open mini-game: new Session(container, { cls, label, resolve, fallback }).
   * root = the .pbc-mini overlay. finish(result) resolves once and tears everything down; cancel() (Esc, the ✕
   * button, a newer game in the same container, the watchdog, cancelAll) calls onCancel, else resolves
   * fallback() + { cancelled: true }.
   */
  class Session extends Scope {
    constructor(container, o) {
      super(null);
      o = o || {};
      this.label = String(o.label || 'Mini-game');
      this.done = false;
      this.onCancel = null;
      this._resolve = typeof o.resolve === 'function' ? o.resolve : () => {};
      this._fallback = typeof o.fallback === 'function' ? o.fallback : () => ({});
      this._frames = []; this._keys = []; this._ups = [];
      this._raf = 0; this._wd = 0;
      this._tick = () => this._frame();
      const el = container && container.nodeType === 1 ? container : null;
      this.full = !el || el === document.body || el === document.documentElement;
      this.container = this.full ? document.body : el;
      active.filter(s => s.container === this.container).forEach(s => s.cancel());   // one per container
      Mini.theme();   // refresh the cached palette / fonts for this game's canvases
      const root = (this.root = U.el('div', 'pbc-mini' + (this.full ? ' pbc-mini--fixed' : '') + (o.cls ? ' ' + o.cls : '')));
      root.setAttribute('role', 'dialog');
      root.setAttribute('aria-modal', 'true');
      root.setAttribute('aria-label', this.label);
      root.tabIndex = -1;
      if (!this.full) grab(this.container);
      this.container.appendChild(root);
      active.push(this);
      bindKeys(true);
      this.on(root, 'contextmenu', e => e.preventDefault());   // long-press menus while holding a shot
      this._focus0 = document.activeElement;
      try { root.focus({ preventScroll: true }); } catch (e) { /* focus is a nicety */ }
      this._watch();
    }
    _try(fn) { try { return fn(); } catch (e) { this._fail(e); return undefined; } }
    _fail(e) {
      console.error('[PBC.Mini] ' + this.label + ':', e);
      if (!this.done) this.finish(Object.assign(this._safeFallback(), { cancelled: true, error: String((e && e.message) || e) }));
    }
    _safeFallback() { try { const r = this._fallback(); return r && typeof r === 'object' ? r : {}; } catch (e) { return {}; } }
    // host removed the container (or the overlay): cancel within ~0.25 s so the promise still resolves
    _watch() {
      this._wd = setTimeout(() => {
        this._wd = 0;
        if (this.done) return;
        if (!this.root.isConnected) this.cancel(); else this._watch();
      }, 250);
    }
    _kick() { if (!this._raf && !this.done && this._frames.length) this._raf = requestAnimationFrame(this._tick); }
    _frame() {
      this._raf = 0;
      if (this.done) return;
      const now = U.now();   // not the rAF stamp: it can trail event timestamps taken with U.now()
      for (const f of this._frames.slice()) {
        if (this.done) return;
        if (this._frames.indexOf(f) < 0) continue;   // removed earlier in this frame
        const dt = U.clamp((now - f.last) / 1000, 0, 0.1);
        f.last = now;
        this._try(() => f.fn(dt, now));
      }
      this._kick();
    }
    _key(e) {
      if (this.done) return;
      const k = U.keyOf(e), type = e.type;
      let handled = false;
      if (type === 'keyup') handled = this._dispatch(this._ups, e, k);
      else if (type === 'keydown' && !e.isComposing && !(e.ctrlKey || e.metaKey || e.altKey)) {
        handled = this._dispatch(this._keys, e, k);
        if (!handled && k === 'escape' && !this.done) { handled = true; if (!e.repeat) this.cancel(); }
      }
      if ((handled || NAV[k]) && type !== 'keypress' && e.cancelable) e.preventDefault();
      e.stopImmediatePropagation();   // modal: host shortcuts never see keys while a mini-game is open
    }
    _dispatch(list, e, k) {
      const hs = list.slice();   // handlers added while dispatching (e.g. by a start key) wait for the next event
      for (let i = hs.length - 1; i >= 0; i--) {
        if (this.done) return true;
        if (!hs[i].dead && this._try(() => hs[i].fn(e, k)) === true) return true;
      }
      return false;
    }
    /** User cancel (Esc / ✕) or a forced one: onCancel decides the result, else fallback + cancelled. */
    cancel() {
      if (this.done) return;
      if (typeof this.onCancel === 'function') this._try(this.onCancel);
      if (!this.done) this.finish(Object.assign(this._safeFallback(), { cancelled: true }));
    }
    /** Resolve (first call wins), remove every listener / loop / timer, fade the overlay out and drop it. */
    finish(res) {
      if (this.done) return false;
      this.done = true;
      const i = active.indexOf(this);
      if (i >= 0) active.splice(i, 1);
      if (this._raf) cancelAnimationFrame(this._raf);
      if (this._wd) clearTimeout(this._wd);
      this._raf = 0; this._wd = 0;
      this.dispose();
      this._frames.length = 0; this._keys.length = 0; this._ups.length = 0;
      if (!active.length) bindKeys(false);
      const root = this.root, cont = this.container, full = this.full;
      root.classList.add('pbc-mini--out');
      root.style.pointerEvents = 'none';
      root.setAttribute('aria-hidden', 'true');
      const ae = document.activeElement, f0 = this._focus0;
      if (ae && root.contains(ae)) {
        try { ae.blur(); } catch (e) { /* ignore */ }
        if (!active.length && f0 && f0 !== document.body && f0.isConnected && f0.focus) { try { f0.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
      }
      setTimeout(() => { root.remove(); if (!full) release(cont); }, U.reducedMotion() ? 160 : 240);
      if (res == null || typeof res !== 'object') res = Object.assign(this._safeFallback(), { cancelled: true });
      try { this._resolve(res); } catch (e) { console.error('[PBC.Mini]', e); }
      return true;
    }
  }
  Mini.Scope = Scope;
  Mini.Session = Session;

  /** True while any mini-game is open. */
  Mini.isActive = () => active.length > 0;
  /** Force-cancel every open mini-game (e.g. when the host leaves the screen); each promise still resolves once. */
  Mini.cancelAll = () => { active.slice().reverse().forEach(s => s.cancel()); };
})();
