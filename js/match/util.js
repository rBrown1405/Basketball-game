/* Pro BBALL Coach — match view: shared helpers (PBC.Match.U).
 * Math, easing, damping and springs, Catmull-Rom key curves (and periodic LUTs for gait cycles),
 * seeded RNG and hashes, colour helpers and a safe() wrapper so one bad frame never kills the view.
 * Loaded first by every match file (camera, court, arena, hoop, rig, poses, figure, anims, clips,
 * actor, ball, choreo, view, broadcast). pixel.js keeps a tiny fallback in case this file is absent. */
(function () {
  'use strict';
  const PBC = (window.PBC = window.PBC || {});
  const M = (PBC.Match = PBC.Match || {});
  const prev = M.U || {};

  const TAU = Math.PI * 2, DEG = Math.PI / 180;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const sat = v => (v < 0 ? 0 : v > 1 ? 1 : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = t => { t = sat(t); return t * t * (3 - 2 * t); };
  const wrapPi = a => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
  const angLerp = (a, b, t) => a + wrapPi(b - a) * t;
  /** exponential smoothing toward b with rate lambda (1/s), frame-rate independent */
  const damp = (a, b, lambda, dt) => b + (a - b) * Math.exp(-lambda * dt);
  const approach = (a, b, d) => (a < b ? Math.min(b, a + d) : Math.max(b, a - d));
  const angApproach = (a, b, d) => { const diff = wrapPi(b - a); return Math.abs(diff) <= d ? b : a + Math.sign(diff) * d; };
  /** critically damped spring on o.x / o.v toward target with natural frequency omega */
  function spring(o, target, omega, dt) {
    const x = o.x - target, v = o.v || 0;
    const e = Math.exp(-omega * dt);
    const t1 = (v + omega * x) * dt;
    o.x = target + (x + t1) * e;
    o.v = (v - omega * t1) * e;
    return o;
  }
  /** cubic Hermite between p0 and p1 with tangents m0, m1 (already scaled to the segment) */
  function hermite(p0, p1, m0, m1, u) {
    const u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * p1 + (u3 - u2) * m1;
  }
  /** non-periodic Catmull-Rom curve through [[t, v], ...] (sorted by t); returns f(t), clamped at the ends */
  function keyCurve(keys) {
    const k = keys.slice().sort((a, b) => a[0] - b[0]);
    const n = k.length;
    if (!n) return () => 0;
    if (n === 1) { const v = k[0][1]; return () => v; }
    return function (t) {
      if (t <= k[0][0]) return k[0][1];
      if (t >= k[n - 1][0]) return k[n - 1][1];
      let j = 0;
      while (j < n - 2 && k[j + 1][0] <= t) j++;
      const a = k[j], b = k[j + 1];
      const d = b[0] - a[0] || 1e-6;
      const u = (t - a[0]) / d;
      const km = j > 0 ? k[j - 1] : null, kp = j + 2 < n ? k[j + 2] : null;
      const m0 = km ? (b[1] - km[1]) / (b[0] - km[0]) * d : (b[1] - a[1]);
      const m1 = kp ? (kp[1] - a[1]) / (kp[0] - a[0]) * d : (b[1] - a[1]);
      return hermite(a[1], b[1], m0 * 0.85, m1 * 0.85, u);
    };
  }
  /** periodic Catmull-Rom through [[phase 0..1, v], ...] baked into a LUT of n samples */
  function loopCurve(keys, n) {
    n = n || 256;
    const k = keys.map(([p, v]) => [((p % 1) + 1) % 1, v]).sort((a, b) => a[0] - b[0]);
    const lut = new Float32Array(n);
    const m = k.length;
    if (!m) return lut;
    if (m === 1) { lut.fill(k[0][1]); return lut; }
    const at = i => { const w = Math.floor(i / m); const q = ((i % m) + m) % m; return [k[q][0] + w, k[q][1]]; };
    for (let s = 0; s < n; s++) {
      const ph = s / n;
      let j = -1;
      for (let i = 0; i < m; i++) if (k[i][0] <= ph) j = i;
      const a = at(j), b = at(j + 1), am = at(j - 1), bp = at(j + 2);
      const d = b[0] - a[0] || 1e-6;
      let u = (ph - a[0]) / d;
      if (u < 0) u += 1 / d;
      const m0 = (b[1] - am[1]) / (b[0] - am[0]) * d;
      const m1 = (bp[1] - a[1]) / (bp[0] - a[0]) * d;
      lut[s] = hermite(a[1], b[1], m0, m1, sat(u));
    }
    return lut;
  }
  function loopSample(lut, phase) {
    const n = lut.length;
    let f = (phase - Math.floor(phase)) * n;
    const i = Math.floor(f) % n;
    f -= Math.floor(f);
    const a = lut[i], b = lut[(i + 1) % n];
    return a + (b - a) * f;
  }

  // ------------------------------------------------------------ random & hashes
  function rng(seed) {
    let s = (seed >>> 0) || 0x9e3779b9;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) {
    let h = 2166136261; s = String(s);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  /** deterministic 2D hash → [0, 1) */
  function hash2(a, b) {
    let h = Math.imul((a | 0) ^ 0x27d4eb2d, 0x85ebca6b) ^ Math.imul((b | 0) + 0x165667b1, 0xc2b2ae35);
    h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
  }

  // ------------------------------------------------------------ colours (accept #rgb, #rrggbb, rgb(), rgba())
  const _cc = new Map();
  function parse(c) {
    if (c && typeof c === 'object') return c;
    const key = String(c);
    let v = _cc.get(key);
    if (v) return v;
    let r = 128, g = 128, b = 128, a = 1;
    const s = key.trim();
    if (s[0] === '#') {
      let h = s.slice(1);
      if (h.length === 3 || h.length === 4) h = h.split('').map(x => x + x).join('');
      const n = parseInt(h.slice(0, 6), 16);
      if (!isNaN(n)) { r = (n >> 16) & 255; g = (n >> 8) & 255; b = n & 255; }
      if (h.length === 8) a = parseInt(h.slice(6, 8), 16) / 255;
    } else {
      const m = s.match(/rgba?\(([^)]+)\)/i);
      if (m) { const p = m[1].split(',').map(x => parseFloat(x)); r = p[0] || 0; g = p[1] || 0; b = p[2] || 0; if (p.length > 3) a = p[3]; }
    }
    v = { r, g, b, a };
    if (_cc.size > 4000) _cc.clear();
    _cc.set(key, v);
    return v;
  }
  const hex2 = v => { v = Math.round(clamp(v, 0, 255)); return (v < 16 ? '0' : '') + v.toString(16); };
  const rgbToHex = (r, g, b) => '#' + hex2(r) + hex2(g) + hex2(b);
  /** f > 0 lightens toward white, f < 0 darkens toward black */
  function shade(c, f) {
    const p = parse(c);
    if (f >= 0) return rgbToHex(p.r + (255 - p.r) * f, p.g + (255 - p.g) * f, p.b + (255 - p.b) * f);
    return rgbToHex(p.r * (1 + f), p.g * (1 + f), p.b * (1 + f));
  }
  const mul = (c, k) => { const p = parse(c); return rgbToHex(p.r * k, p.g * k, p.b * k); };
  const mix = (a, b, t) => { const p = parse(a), q = parse(b); return rgbToHex(lerp(p.r, q.r, t), lerp(p.g, q.g, t), lerp(p.b, q.b, t)); };
  const rgba = (c, a) => { const p = parse(c); return `rgba(${Math.round(p.r)},${Math.round(p.g)},${Math.round(p.b)},${a == null ? p.a : +a})`; };
  const lum = c => { const p = parse(c); return (0.299 * p.r + 0.587 * p.g + 0.114 * p.b) / 255; };
  const contrast = (bg, light, dark) => (lum(bg) > 0.58 ? (dark || '#111111') : (light || '#ffffff'));

  // ------------------------------------------------------------ misc
  function makeCanvas(w, h) {
    w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
    if (typeof document !== 'undefined' && document.createElement) {
      const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
    }
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
    throw new Error('no canvas available');
  }
  const _warned = new Map();
  function warn(msg, detail) {
    const k = String(msg);
    const n = (_warned.get(k) || 0) + 1;
    _warned.set(k, n);
    if (n <= 3 && typeof console !== 'undefined') console.warn('[match]', msg, detail !== undefined ? detail : '');
  }
  function safe(fn, self, label) {
    try { return fn.call(self); } catch (e) { warn(label || 'error', e); return undefined; }
  }

  M.U = Object.assign(prev, {
    TAU, DEG, G: 32.174, clamp, sat, lerp, smooth, wrapPi, angLerp, damp, approach, angApproach, spring, hermite,
    keyCurve, loopCurve, loopSample, rng, hashStr, hash2, parseColor: parse, rgbToHex, shade, mul, mix, rgba, lum,
    contrast, makeCanvas, warn, safe,
  });
})();
