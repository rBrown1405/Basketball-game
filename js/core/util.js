/* Pro BBALL Coach — shared utilities (RNG, math, formatting). No DOM here. */
(function () {
  'use strict';
  const PBC = (window.PBC = window.PBC || {});

  // ---------- seeded RNG (mulberry32) ----------
  let seed = (Date.now() ^ 0x9e3779b9) >>> 0;
  function rand() {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  let spareGauss = null;
  function randn() {
    if (spareGauss !== null) { const s = spareGauss; spareGauss = null; return s; }
    let u = 0, v = 0;
    while (u === 0) u = rand();
    while (v === 0) v = rand();
    const m = Math.sqrt(-2 * Math.log(u));
    spareGauss = m * Math.sin(2 * Math.PI * v);
    return m * Math.cos(2 * Math.PI * v);
  }

  const U = {
    setSeed(s) { seed = s >>> 0; spareGauss = null; },
    getSeed() { return seed; },
    rand,
    randn,
    gauss(mean, sd) { return mean + randn() * sd; },
    range(a, b) { return a + (b - a) * rand(); },
    int(a, b) { return Math.floor(a + (b - a + 1) * rand()); },
    chance(p) { return rand() < p; },
    pick(arr) { return arr[Math.floor(rand() * arr.length)]; },
    /** pick from arr using weights (array of numbers or fn(item) -> number) */
    pickW(arr, weights) {
      let total = 0;
      const w = new Array(arr.length);
      for (let i = 0; i < arr.length; i++) {
        const x = typeof weights === 'function' ? weights(arr[i], i) : weights[i];
        w[i] = x > 0 && isFinite(x) ? x : 0;
        total += w[i];
      }
      if (total <= 0) return arr[Math.floor(rand() * arr.length)];
      let r = rand() * total;
      for (let i = 0; i < arr.length; i++) { r -= w[i]; if (r <= 0) return arr[i]; }
      return arr[arr.length - 1];
    },
    /** pick key from an object of {key: weight} */
    pickKey(obj) {
      const keys = Object.keys(obj);
      return U.pickW(keys, keys.map(k => obj[k]));
    },
    shuffle(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        const t = a[i]; a[i] = a[j]; a[j] = t;
      }
      return a;
    },

    // ---------- math ----------
    clamp(x, a, b) { return x < a ? a : x > b ? b : x; },
    lerp(a, b, t) { return a + (b - a) * t; },
    invLerp(a, b, x) { return (x - a) / (b - a); },
    sigmoid(x) { return 1 / (1 + Math.exp(-x)); },
    logit(p) { p = U.clamp(p, 1e-6, 1 - 1e-6); return Math.log(p / (1 - p)); },
    sum(arr, f) { let s = 0; for (let i = 0; i < arr.length; i++) s += f ? f(arr[i], i) : arr[i]; return s; },
    avg(arr, f) { return arr.length ? U.sum(arr, f) / arr.length : 0; },
    maxBy(arr, f) { let best = null, bv = -Infinity; for (const x of arr) { const v = f(x); if (v > bv) { bv = v; best = x; } } return best; },
    minBy(arr, f) { let best = null, bv = Infinity; for (const x of arr) { const v = f(x); if (v < bv) { bv = v; best = x; } } return best; },
    sortBy(arr, f, desc) { const a = arr.slice(); a.sort((x, y) => (desc ? f(y) - f(x) : f(x) - f(y))); return a; },
    round(x, d = 0) { const m = Math.pow(10, d); return Math.round(x * m) / m; },
    groupBy(arr, f) { const o = {}; for (const x of arr) { const k = f(x); (o[k] = o[k] || []).push(x); } return o; },
    deepClone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); },
    uniq(arr) { return Array.from(new Set(arr)); },

    // ---------- formatting ----------
    money(n, short) {
      if (n == null || isNaN(n)) return '—';
      const neg = n < 0; n = Math.abs(n);
      let s;
      if (n >= 1e6) s = '$' + (n / 1e6).toFixed(n >= 1e8 || short ? 1 : 2).replace(/\.0+$/, '') + 'M';
      else if (n >= 1e3) s = '$' + Math.round(n / 1e3) + 'K';
      else s = '$' + Math.round(n);
      return neg ? '-' + s : s;
    },
    height(inches) {
      const ft = Math.floor(inches / 12), inch = Math.round(inches - ft * 12);
      return inch === 12 ? `${ft + 1}'0"` : `${ft}'${inch}"`;
    },
    pct(x, d = 1) { return x == null || isNaN(x) ? '—' : (x * 100).toFixed(d) + '%'; },
    pct3(made, att) { return att > 0 ? (made / att).toFixed(3).replace(/^0/, '') : '—'; },
    num(x, d = 1) { return x == null || isNaN(x) ? '—' : Number(x).toFixed(d); },
    ordinal(n) {
      const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
      return n + (s[(v - 20) % 10] || s[v] || s[0]);
    },
    clock(sec, tenths) {
      if (sec < 0) sec = 0;
      if (tenths && sec < 60) return sec.toFixed(1);
      const s = Math.ceil(sec - 1e-9);
      const m = Math.floor(s / 60), r = s % 60;
      return m + ':' + (r < 10 ? '0' : '') + r;
    },
    periodName(p, short) {
      if (p <= 4) return short ? 'Q' + p : U.ordinal(p) + ' Qtr';
      const ot = p - 4;
      return ot === 1 ? 'OT' : ot + 'OT';
    },
    record(w, l) { return `${w}-${l}`; },
    plural(n, word, pl) { return n === 1 ? `${n} ${word}` : `${n} ${pl || word + 's'}`; },
    esc(s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    },
    seasonLabel(year) { return `${year}-${String((year + 1) % 100).padStart(2, '0')}`; },
    /** readable color (black/white) for text on a background hex color */
    textOn(hex) {
      const c = U.hexToRgb(hex);
      const L = (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255;
      return L > 0.6 ? '#0b0f17' : '#ffffff';
    },
    hexToRgb(hex) {
      let h = String(hex || '#000').replace('#', '');
      if (h.length === 3) h = h.split('').map(c => c + c).join('');
      const n = parseInt(h, 16) || 0;
      return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    },
    rgba(hex, a) { const c = U.hexToRgb(hex); return `rgba(${c.r},${c.g},${c.b},${a})`; },
    shade(hex, amt) {
      // amt -1..1: darken / lighten
      const c = U.hexToRgb(hex);
      const f = v => Math.round(U.clamp(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt, 0, 255));
      return '#' + [f(c.r), f(c.g), f(c.b)].map(v => v.toString(16).padStart(2, '0')).join('');
    },
    /** stable string hash (for deterministic per-id variation) */
    hash(str) {
      let h = 2166136261 >>> 0;
      str = String(str);
      for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
      return h >>> 0;
    },
    now() { return (typeof performance !== 'undefined' ? performance : Date).now(); },
  };

  PBC.U = U;
})();
