/* Pro BBALL Coach: COURTSIDE, the season preview magazine. The full-screen reader, the 'magazine' screen and the
 * "Preview Mag" nav link.
 *
 *   PBC.Magazine.open(S?, { page, onClose })   full-screen reader; S defaults to PBC.UI.S. Marks the issue seen + autosaves.
 *   PBC.Magazine.close(), PBC.Magazine.isOpen()
 *
 * The content generator (js/core/magazine.js: build / ensure / isStale / shouldAutoOpen / expectation) produces plain
 * data (strings, numbers, tids, pids). Team colors, badges and portraits are looked up in S at render time. The print
 * design and the reader chrome live in css/magazine.css (.mg-…): the markup below follows it class for class.
 *
 * Reader modes
 *   spread  two pages side by side, 3D page flip; the cover sits alone on the right
 *   single  one fixed page, page-turn animation
 *   flow    phones, short windows and reading mode: natural page height, vertical scroll, horizontal swipe
 * Fixed-layout pages must be at least 560 px wide, otherwise the reader flows. A fixed page that overflows shrinks its
 * type scale (--k) until it fits. Keys: ←/→, PgUp/PgDn, Space, Home/End, T (thumbnails), R (reading mode), Esc.
 */
(function () {
  'use strict';
  const PBC = (window.PBC = window.PBC || {});
  const M = (PBC.Magazine = PBC.Magazine || {});
  const U = PBC.U;

  // ---------------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------------
  const MIN_FIXED = 560;            // fixed-layout pages narrower than this switch the reader to flow
  const RATIO = 4 / 3;              // page height / width
  const EDGE = 62;                  // room for a prev/next edge button on each side of the book
  const PAD = 14;                   // stage padding in the fixed modes
  const FLOW_MAX = 760;             // widest flow column
  const FLOW_U = 5.4, READ_U = 7;   // smallest type unit (px) in flow and in reading mode (body text = 2.25 units)
  const NARROW = 88;                // flow pages narrower than this many units collapse to one column
  const LS_READING = 'pbc_mag_reading';
  const DUR = { flip: 720, turn: 460, slide: 150, fade: 200, grace: 400 };  // grace: timeout fallback margin
  const SZ = { cover: 560, hero: 360, key: 220, fav: 176, md: 140, sm: 112, xs: 80 };  // portrait render sizes (px)
  const DISP = 'Avenir Next Condensed, Barlow Condensed, Roboto Condensed, Arial Narrow, Oswald, Impact, sans-serif';
  const PAPER = '#f7f4ee', INK = '#15171c';
  const ACCENT = {
    contents: '#d9480f', storylines: '#c1121f', power: '#1d4ed8', positions: '#1d4ed8', conf: '#0f766e', top10: '#b45309',
    awards: '#a16207', rookies: '#15803d', grades: '#6d28d9', coaches: '#c2410c', review: '#be123c', watch: '#be123c', back: '#c1121f',
  };
  const AD_COLORS = {
    shoe: { a1: '#120d2b', a2: '#5b21b6', ai: '#ffffff', ah: '#7af0ff' },
    drink: { a1: '#051f3d', a2: '#0284c7', ai: '#ffffff', ah: '#ffe14d' },
    gum: { a1: '#053b2d', a2: '#0f9f74', ai: '#ffffff', ah: '#bbf7d0' },
    recovery: { a1: '#082a45', a2: '#2b9bd6', ai: '#ffffff', ah: '#bae6fd' },
    band: { a1: '#5f1010', a2: '#e0521b', ai: '#ffffff', ah: '#fde68a' },
  };

  const canAnimate = typeof Element !== 'undefined' && typeof Element.prototype.animate === 'function';
  const reducedMotion = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const largeScreen = () => window.innerWidth >= 1280 && window.innerHeight >= 940;
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

  // ---------------------------------------------------------------------------
  // Text & color helpers
  // ---------------------------------------------------------------------------
  const esc = s => U.esc(s);
  /** print typography: curly quotes and apostrophes, primes for heights (6'8") */
  function smart(s) {
    return String(s == null ? '' : s)
      .replace(/(\d)'(\d{1,2})"/g, '$1\u2032$2\u2033')
      .replace(/(^|[\s([{\u2014\u2013\/-])"/g, '$1\u201c').replace(/"/g, '\u201d')
      .replace(/(^|[\s([{\u2014\u2013\/-])'/g, '$1\u2018').replace(/'/g, '\u2019');
  }
  const T = s => esc(smart(s));
  const hgt = s => esc(String(s || '').replace(/'/g, '′').replace(/"/g, '″'));
  const pad2 = n => (n < 10 ? '0' : '') + n;
  const shortName = r => (r && r.first ? `${r.first.charAt(0)}. ${r.last}` : (r && r.name) || '');
  const stripQuotes = s => String(s || '').replace(/^\s*["“]/, '').replace(/["”]\s*$/, '');
  const pct = v => clamp(Math.round(+v || 0), 0, 100);

  function relLum(hex) {
    const c = U.hexToRgb(hex);
    const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  }
  function contrast(a, b) { const x = relLum(a), y = relLum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  function darkenTo(hex, bg, min) { let c = hex; for (let i = 0; i < 12 && contrast(c, bg) < min; i++) c = U.shade(c, -0.15); return c; }

  // ---------------------------------------------------------------------------
  // Render context: the issue being printed (renderers are synchronous)
  // ---------------------------------------------------------------------------
  let RC = null;
  const FITS = typeof WeakMap === 'function' ? new WeakMap() : null;
  function fitsFor(mag) {
    if (!FITS) return [];
    let f = FITS.get(mag);
    if (!f) { f = []; FITS.set(mag, f); }
    return f;
  }

  /** One printed issue: page HTML (cached per session) and fit results (cached per issue). */
  function Book(S, mag) {
    this.S = S;
    this.mag = mag;
    this.pages = mag.pages || [];
    this.n = this.pages.length;
    this.html = [];
    this.fit = fitsFor(mag);
    this.prevName = mag.leagueKey === 'women' ? String(mag.season - 1) : U.seasonLabel(mag.season - 1);
  }
  Book.prototype.pageHTML = function (i) {
    if (this.html[i] == null) this.html[i] = renderPage(this, i);
    return this.html[i];
  };

  const teamOf = tid => (RC && tid != null && tid >= 0 && RC.S.teams && RC.S.teams[tid]) || null;
  /** a team color that reads as text on paper */
  function inkOf(tid) {
    const t = teamOf(tid);
    return t ? darkenTo(t.colors.primary, PAPER, 3) : INK;
  }
  /** colors for team-colored blocks: c1 base, c2 accent that pops on c1, c3 deep shade, c4 highlight */
  function teamVars(tid) {
    const t = teamOf(tid);
    if (!t) return `--c1:#1f2937;--c2:#ffb020;--c3:#0b0f17;--c4:#475569;--tc:${INK}`;
    let c1 = t.colors.primary;
    const L = relLum(c1);
    if (L < 0.012) c1 = U.shade(c1, 0.16);
    else if (L > 0.34) c1 = darkenTo(c1, '#ffffff', 3.4);
    const L1 = relLum(c1);
    // the team's own secondary / trim when it pops on c1 (a saturated one may be lifted a little), else gold or white
    const lift = x => { let c = x; for (let i = 0; i < 5 && contrast(c, c1) < 2.6; i++) c = U.shade(c, 0.12); return contrast(c, c1) >= 2.6 ? c : null; };
    let c2 = null;
    for (const x of [t.colors.secondary, t.colors.trim]) {
      if (!x || relLum(x) <= L1) continue;
      const rgb = U.hexToRgb(x), mx = Math.max(rgb.r, rgb.g, rgb.b), sat = mx ? (mx - Math.min(rgb.r, rgb.g, rgb.b)) / mx : 0;
      c2 = sat > 0.25 ? lift(x) : contrast(x, c1) >= 3 ? x : null;
      if (c2) break;
    }
    if (!c2) c2 = contrast('#ffd23f', c1) >= 3 ? '#ffd23f' : '#ffffff';
    return `--c1:${c1};--c2:${c2};--c3:${U.shade(c1, -0.62)};--c4:${U.shade(c1, 0.3)};--tc:${inkOf(tid)}`;
  }
  function accentFor(p) {
    if (p.kind === 'team') {
      const t = teamOf(p.tid);
      if (t) return darkenTo(darkenTo(t.colors.primary, '#ffffff', 3.8), PAPER, 3.4);
    }
    return ACCENT[p.kind] || ACCENT.storylines;
  }

  /** Unique SVG ids per insertion: a gradient whose first copy sits inside display:none stops painting in Chrome. */
  let uidSeq = 0;
  function uniq(html) {
    const ids = new Set();
    html.replace(/\sid="([^"]+)"/g, (m, id) => { ids.add(id); return m; });
    if (!ids.size) return html;
    const sfx = '_m' + (++uidSeq).toString(36);
    return html
      .replace(/(\sid=")([^"]+)"/g, (m, a, id) => a + id + sfx + '"')
      .replace(/url\(\s*(['"]?)#([^)'"\s]+)\1\s*\)/g, (m, q, id) => (ids.has(id) ? `url(${q}#${id}${sfx}${q})` : m))
      .replace(/(\s(?:xlink:)?href=")#([^"]+)"/g, (m, a, id) => (ids.has(id) ? `${a}#${id}${sfx}"` : m));
  }
  function parse(html) {
    const t = document.createElement('template');
    t.innerHTML = html;
    return t.content.firstElementChild;
  }

  // ---------------------------------------------------------------------------
  // Print primitives: portraits, badges, chips, headers
  // ---------------------------------------------------------------------------
  const SILHOUETTE = '<svg viewBox="0 0 100 100" aria-hidden="true"><rect width="100" height="100" fill="#d6d0c3"/><circle cx="50" cy="40" r="18" fill="#b3aa98"/><path d="M15 100C18 76 32 66 50 66s32 10 35 34z" fill="#b3aa98"/></svg>';

  /**
   * Player portrait, always through (UI.portrait || UI.avatar)(p, size, { bg }). o.cutout asks for a transparent
   * background (cover stars): UI.portrait does it with bg:'none'; the SVG avatar loses its backdrop; any other
   * markup keeps its background and gets soft edges instead (.mg-framed). o.mood ('clutch', 'win'...) sets the
   * expression of the pixel portraits.
   */
  function face(pid, cls, size, o) {
    o = o || {};
    const S = RC.S, UI = PBC.UI;
    const p = pid != null && S.players ? S.players[pid] : null;
    const fn = UI && (UI.portrait || UI.avatar);
    let html = '', cut = false, framed = false;
    if (p && fn && (UI.portrait || p.look)) {
      const opts = { bg: o.cutout ? 'none' : o.bg || 'team' };
      if (o.mood) { opts.mood = o.mood; opts.ctx = { mood: o.mood }; }
      try { html = String(fn(p, size, opts) || ''); } catch (e) { console.error('[magazine] portrait', e); html = ''; }
      if (html && o.cutout) {
        if (UI.portrait) cut = true;
        else if (/^\s*<svg/i.test(html)) {
          const bare = html.replace(/<rect width="100" height="100" fill="url\(#[^)]+\)"\s*\/>/, '');
          cut = bare !== html;
          framed = !cut;
          html = bare;
        } else framed = true;
      }
    }
    if (!html) html = SILHOUETTE;
    return `<span class="mg-face${cls ? ' ' + cls : ''}${cut ? ' mg-cutout' : ''}${framed ? ' mg-framed' : ''}"${o.style ? ` style="${o.style}"` : ''} aria-hidden="true">${html}</span>`;
  }
  /** team badge; keep = leave an empty box when there is no team so grid rows stay aligned */
  function badge(tid, cls, keep, units) {
    const t = teamOf(tid), UI = PBC.UI;
    const attrs = `class="mg-badge${cls ? ' ' + cls : ''}"${units ? ` style="width:calc(var(--u) * ${units});height:calc(var(--u) * ${units})"` : ''}`;
    if (!t || !UI || !UI.teamBadge) return keep ? `<span ${attrs}></span>` : '';
    return `<span ${attrs}>${UI.teamBadge(t, 64)}</span>`;
  }
  const ovrChip = v => `<span class="mg-ovr ${v >= 90 ? 'o-elite' : v >= 83 ? 'o-great' : v >= 75 ? 'o-good' : v >= 65 ? 'o-avg' : 'o-low'}">${esc(v)}</span>`;
  const gradeChip = g => `<span class="mg-grade g-${esc(String(g || 'C').charAt(0))}">${esc(g)}</span>`;
  /** long headlines step down so they don't eat the page */
  function hlSize(text, base) {
    const n = String(text || '').length;
    const f = n <= 16 ? 1 : n <= 24 ? 0.88 : n <= 32 ? 0.78 : 0.7;
    return f === 1 ? '' : ` style="font-size:calc(var(--t) * ${(base * f).toFixed(2)})"`;
  }
  function head(kick, h, dek, base) {
    return `<div class="mg-hd">${kick ? `<span class="mg-kick">${T(kick)}</span>` : ''}<h2 class="mg-h"${hlSize(h, base || 7.4)}>${T(h)}</h2>${dek ? `<p class="mg-dek">${T(dek)}</p>` : ''}</div>`;
  }

  // ---------------------------------------------------------------------------
  // Art: masthead, barcode, heat gauge, trophy, ad illustrations
  // ---------------------------------------------------------------------------
  function mastSVG(text) {
    const t = String(text || 'COURTSIDE').toUpperCase();
    const cut = t === 'COURTSIDE' ? 5 : Math.ceil(t.length / 2);
    return `<svg viewBox="0 0 1000 222" role="img" aria-label="${esc(t)}"><text x="500" y="200" text-anchor="middle" textLength="992" lengthAdjust="spacingAndGlyphs" font-family="${DISP}" font-size="250" font-weight="900"><tspan fill="#ffffff">${esc(t.slice(0, cut))}</tspan><tspan style="fill:var(--c2, #ffd23f)">${esc(t.slice(cut))}</tspan></text></svg>`;
  }

  const UPC_L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
  /** a real UPC-A symbol for the cover's "0 21521 28212 6" */
  function barcodeSVG(code) {
    const d = String(code || '').replace(/\D/g, '').padEnd(12, '0').slice(0, 12).split('').map(Number);
    const inv = s => s.replace(/[01]/g, c => (c === '0' ? '1' : '0'));
    let bits = '101';
    for (let i = 0; i < 6; i++) bits += UPC_L[d[i]];
    bits += '01010';
    for (let i = 6; i < 12; i++) bits += inv(UPC_L[d[i]]);
    bits += '101';
    const long = i => i < 10 || (i >= 45 && i < 50) || i >= 85;
    let bars = '';
    for (let i = 0; i < bits.length;) {
      if (bits[i] !== '1') { i++; continue; }
      let j = i;
      while (j < bits.length && bits[j] === '1') j++;
      bars += `<rect x="${9 + i}" y="0" width="${j - i}" height="${long(i) ? 27 : 23}"/>`;
      i = j;
    }
    const txt = (x, s) => `<text x="${x}" y="31.4" font-size="6.6" font-family="Menlo, Consolas, 'DejaVu Sans Mono', monospace" text-anchor="middle">${s}</text>`;
    return `<svg viewBox="0 0 113 32" aria-hidden="true">${bars}${txt(4.5, d[0])}${txt(33, d.slice(1, 6).join(''))}${txt(79.5, d.slice(6, 11).join(''))}${txt(108.5, d[11])}</svg>`;
  }

  /** hot-seat gauge: five arcs from ice cold to inferno and a needle */
  function gauge(heat) {
    const h = pct(heat), cx = 50, cy = 52, r = 38;
    const pt = (v, rr) => { const a = Math.PI * (1 - v / 100); return [(cx + rr * Math.cos(a)).toFixed(1), (cy - rr * Math.sin(a)).toFixed(1)]; };
    const arcs = ['#2a9d8f', '#8ab17d', '#e9c46a', '#f4a261', '#d62828'].map((c, i) => {
      const a = pt(i * 20 + 1.2, r), b = pt(i * 20 + 18.8, r);
      return `<path d="M${a[0]} ${a[1]}A${r} ${r} 0 0 1 ${b[0]} ${b[1]}" fill="none" stroke="${c}" stroke-width="11"/>`;
    }).join('');
    const n = pt(h, 31);
    return `<svg class="mg-gauge" viewBox="0 0 100 60" aria-hidden="true">${arcs}<line x1="${cx}" y1="${cy}" x2="${n[0]}" y2="${n[1]}" stroke="${INK}" stroke-width="4" stroke-linecap="round"/><circle cx="${cx}" cy="${cy}" r="5.5" fill="${INK}"/></svg>`;
  }

  function trophySVG() {
    return `<svg class="mg-trophy" viewBox="0 0 100 130" aria-hidden="true"><defs><linearGradient id="mgtr" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9a6a00"/><stop offset=".38" stop-color="#ffe9a8"/><stop offset=".6" stop-color="#f2be3a"/><stop offset="1" stop-color="#7c5200"/></linearGradient></defs>
      <path d="M25 44h50L64 90H36z" fill="url(#mgtr)"/>
      <g fill="none" stroke="#7c5200" stroke-width="1.3" opacity=".5"><path d="M29 54h42M32 64h36M34 74h32M36 83h28"/><path d="M36 44l7 46M50 44v46M64 44l-7 46M27 50l12 40M73 50L61 90"/></g>
      <circle cx="50" cy="25" r="18" fill="url(#mgtr)"/>
      <g fill="none" stroke="#7c5200" stroke-width="1.6" opacity=".75"><path d="M32 25h36"/><path d="M50 7v36"/><path d="M38 12c6 7 6 19 0 26"/><path d="M62 12c-6 7-6 19 0 26"/></g>
      <ellipse cx="43" cy="16" rx="5" ry="3" fill="#fff" opacity=".55"/>
      <rect x="44" y="90" width="12" height="10" fill="url(#mgtr)"/><path d="M31 100h38l5 12H26z" fill="url(#mgtr)"/>
      <rect x="20" y="112" width="60" height="15" rx="2" fill="#2a1f0e"/><rect x="33" y="116" width="34" height="7" rx="1" fill="url(#mgtr)" opacity=".85"/></svg>`;
  }

  const ADS_ART = {
    shoe: () => `<svg viewBox="0 0 240 170" aria-hidden="true">
      <ellipse cx="134" cy="158" rx="94" ry="7" fill="#000" opacity=".3"/>
      <g stroke="#7af0ff" stroke-width="5" stroke-linecap="round" opacity=".55"><path d="M12 76h30"/><path d="M4 98h40"/><path d="M18 120h24"/></g>
      <g transform="rotate(-7 130 100)">
        <path d="M52 124h156c13 0 21 8 19 18-2 8-10 11-22 11H64c-12 0-18-7-17-16 1-8 3-13 5-13z" fill="#f4f4f5"/>
        <path d="M48 142h178" stroke="#c9ccd6" stroke-width="3"/>
        <path d="M62 150h8m8 0h8m8 0h8m8 0h8m8 0h8m8 0h8m8 0h8m8 0h8m8 0h8" stroke="#9aa0ad" stroke-width="3"/>
        <rect x="66" y="128" width="46" height="10" rx="5" fill="#7af0ff"/>
        <path d="M56 125c-2-25 2-55 10-77 4-10 18-16 32-14l18 4c6 22 22 38 46 48l38 12c16 5 24 15 22 27z" fill="#6d28d9"/>
        <path d="M56 125c-2-21 1-41 6-59 10 4 16 24 18 59z" fill="#4c1d95"/>
        <path d="M168 89l32 9c16 5 24 15 22 27h-50c4-13 2-26-4-36z" fill="#ede9fe"/>
        <path d="M76 112l42-28-8 15 48-19-50 38 8-14z" fill="#7af0ff"/>
        <path d="M66 48c6-12 22-18 34-14" stroke="#fff" stroke-width="7" fill="none" stroke-linecap="round"/>
        <path d="M100 34l18-8c6 4 6 12 0 16z" fill="#7af0ff"/>
        <g stroke="#fff" stroke-width="4.5" stroke-linecap="round"><path d="M108 46l16-6"/><path d="M114 58l16-6"/><path d="M122 69l16-6"/><path d="M132 78l16-6"/></g>
        <path d="M68 60C44 42 30 46 12 30c22 0 42-4 66 14z" fill="#fff" opacity=".92"/>
        <path d="M66 72C46 60 34 64 20 54c18 0 34-2 50 8z" fill="#fff" opacity=".7"/>
        <text x="86" y="104" font-family="${DISP}" font-weight="900" font-size="18" fill="#fff" opacity=".9">9</text>
      </g></svg>`,
    drink: () => `<svg viewBox="0 0 240 170" aria-hidden="true">
      <ellipse cx="120" cy="162" rx="50" ry="6" fill="#000" opacity=".3"/>
      <g fill="#ffe14d"><circle cx="62" cy="56" r="5"/><circle cx="176" cy="42" r="4"/><circle cx="186" cy="92" r="6"/><circle cx="52" cy="112" r="4"/><circle cx="196" cy="128" r="3"/></g>
      <g stroke="#ffe14d" stroke-width="4" stroke-linecap="round" fill="none" opacity=".8"><path d="M44 84q-10-8-4-20"/><path d="M196 72q10-6 6-18"/></g>
      <rect x="101" y="6" width="38" height="17" rx="4" fill="#ffe14d"/><rect x="103" y="21" width="34" height="7" rx="2" fill="#e5b800"/>
      <path d="M106 28h28v10c0 8 18 14 18 32v80c0 8-6 12-14 12h-36c-8 0-14-4-14-12V70c0-18 18-24 18-32z" fill="#38bdf8"/>
      <path d="M88 70c0-18 18-24 18-32v-10h28v10c0 8 18 14 18 32v6H88z" fill="#7dd3fc" opacity=".55"/>
      <path d="M88 96h64v42H88z" fill="#fff"/>
      <path d="M127 99l-16 20h11l-7 16 21-22h-11l7-14z" fill="#ffe14d" stroke="#051f3d" stroke-width="2" stroke-linejoin="round"/>
      <rect x="94" y="104" width="3" height="50" rx="1.5" fill="#fff" opacity=".35"/>
      <path d="M97 74c0-10 5-15 9-19" stroke="#fff" stroke-width="5" stroke-linecap="round" fill="none" opacity=".55"/>
      <g fill="#fff" opacity=".65"><circle cx="138" cy="82" r="3"/><circle cx="131" cy="148" r="2.5"/><circle cx="142" cy="153" r="2"/></g></svg>`,
    gum: () => `<svg viewBox="0 0 240 170" aria-hidden="true">
      <ellipse cx="118" cy="156" rx="86" ry="7" fill="#000" opacity=".28"/>
      <g transform="rotate(-10 120 92)">
        <rect x="120" y="44" width="92" height="20" rx="3" fill="#ecfdf5" stroke="#6ee7b7" stroke-width="2"/>
        <rect x="128" y="66" width="80" height="20" rx="3" fill="#d1fae5" stroke="#6ee7b7" stroke-width="2"/>
        <rect x="34" y="32" width="124" height="98" rx="10" fill="#10b981"/>
        <path d="M34 42c0-6 4-10 10-10h104c6 0 10 4 10 10v22H34z" fill="#047857"/>
        <text x="96" y="57" text-anchor="middle" font-family="${DISP}" font-weight="900" font-size="21" letter-spacing="2" fill="#fff">CLUTCH</text>
        <text x="96" y="100" text-anchor="middle" font-family="${DISP}" font-weight="900" font-size="25" fill="#ecfdf5">ICE MINT</text>
        <text x="96" y="118" text-anchor="middle" font-family="Arial, sans-serif" font-weight="700" font-size="8" letter-spacing="1.2" fill="#d1fae5">12 STICKS · FOURTH-QUARTER FRESH</text>
      </g>
      <g stroke="#ecfdf5" stroke-width="3" stroke-linecap="round" opacity=".85"><path d="M204 18v22M193 29h22M196 21l16 16M212 21l-16 16"/><path d="M24 122v16M16 130h16"/></g></svg>`,
    recovery: () => `<svg viewBox="0 0 240 170" aria-hidden="true">
      <ellipse cx="120" cy="160" rx="92" ry="8" fill="#000" opacity=".3"/>
      <g stroke="#e0f2fe" stroke-width="3" stroke-linecap="round" fill="none" opacity=".75"><path d="M62 42q-6-10 2-18"/><path d="M120 36q-6-10 2-18"/><path d="M178 42q-6-10 2-18"/></g>
      <path d="M36 70h168l-12 74c-2 10-12 16-22 16H70c-10 0-20-6-22-16z" fill="#e0f2fe"/>
      <path d="M40 94h160" stroke="#7dd3fc" stroke-width="3"/>
      <ellipse cx="120" cy="70" rx="84" ry="17" fill="#f0f9ff"/><ellipse cx="120" cy="72" rx="72" ry="11" fill="#38bdf8"/>
      <g fill="#fff" stroke="#7dd3fc" stroke-width="2"><rect x="80" y="58" width="20" height="18" rx="4" transform="rotate(-14 90 67)"/><rect x="116" y="54" width="22" height="20" rx="4" transform="rotate(10 127 64)"/><rect x="150" y="62" width="18" height="16" rx="4" transform="rotate(-6 159 70)"/></g>
      <text x="120" y="134" text-anchor="middle" font-family="${DISP}" font-weight="900" font-size="30" fill="#0c4a6e">39°F</text>
      <g fill="#bae6fd"><path d="M22 110l3 7 7 3-7 3-3 7-3-7-7-3 7-3z"/><path d="M214 96l3 7 7 3-7 3-3 7-3-7-7-3 7-3z"/></g></svg>`,
    band: () => `<svg viewBox="0 0 240 170" aria-hidden="true">
      <ellipse cx="120" cy="154" rx="86" ry="7" fill="#000" opacity=".28"/>
      <path d="M30 86a90 40 0 0 1 180 0" fill="none" stroke="#9f1d1d" stroke-width="28"/>
      <path d="M30 86a90 40 0 0 0 180 0" fill="none" stroke="#ef4444" stroke-width="28"/>
      <path d="M32 96a88 34 0 0 0 176 0" fill="none" stroke="#fff" stroke-width="2.4" opacity=".55"/>
      <path d="M32 76a88 34 0 0 0 176 0" fill="none" stroke="#fff" stroke-width="2.4" opacity=".4"/>
      <rect x="97" y="112" width="46" height="24" rx="6" fill="#fff"/>
      <text x="120" y="130" text-anchor="middle" font-family="${DISP}" font-weight="900" font-size="17" fill="#b91c1c">BW</text>
      <g fill="#fde68a"><path d="M196 18l4 10 10 4-10 4-4 10-4-10-10-4 10-4z"/><path d="M40 16l3 7 7 3-7 3-3 7-3-7-7-3 7-3z"/></g>
      <text x="204" y="72" font-family="${DISP}" font-weight="900" font-size="24" fill="#fde68a">+2</text></svg>`,
  };

  // ---------------------------------------------------------------------------
  // Pages
  // ---------------------------------------------------------------------------
  const KIND = {};

  // ---- 1. cover ----
  KIND.cover = function (p) {
    const st = p.star || {};
    const n = String(p.headline || '').length;
    const hs = n <= 12 ? 11 : n <= 17 ? 10 : n <= 22 ? 9 : 8;
    const bigSize = t => { const L = String(t || '').length; return L <= 7 ? '' : ` style="font-size:calc(var(--u) * ${Math.max(2.8, (4.6 * 7.5) / L).toFixed(2)})"`; };
    const price = String(p.price || '').split(' · ');
    const fl = String(p.flash || '').length;
    const flashSize = fl <= 16 ? '' : ` style="font-size:calc(var(--u) * ${fl <= 24 ? 1.8 : 1.5})"`;
    const fade = 'linear-gradient(#000 80%, transparent 98%)';
    return `<div class="mg-cover" style="${teamVars(st.tid)}">
      <div class="mg-cv-bg"></div><div class="mg-cv-dots"></div><div class="mg-cv-stripe"></div>
      <div class="mg-cv-mast">${mastSVG(p.mast || RC.mag.mast)}</div>
      <div class="mg-cv-line"><span>${T(p.issue)}</span><span>${T(p.dateLine)}</span><span>${T(p.league)}</span></div>
      <div class="mg-cv-star" style="-webkit-mask-image:${fade};mask-image:${fade}">${face(st.pid, '', SZ.cover, { cutout: true, mood: 'clutch' })}</div>
      ${p.flash ? `<div class="mg-cv-flash"><span${flashSize}>${T(p.flash)}</span></div>` : ''}
      <ul class="mg-cv-teasers">${(p.teasers || []).slice(0, 4).map(t => `<li><b${bigSize(t.big)}>${T(t.big)}</b><span>${T(t.text)}</span></li>`).join('')}</ul>
      <div class="mg-cv-name"><b>${T(st.name)}</b><span>${T([st.team, st.pos].filter(Boolean).join(' · '))}</span>${st.line ? `<small>${T(st.line)}</small>` : ''}</div>
      <div class="mg-cv-hl"><h1 data-hs="${hs}" style="font-size:calc(var(--u) * ${hs})">${T(p.headline)}</h1>${p.sub ? `<p>${T(p.sub)}</p>` : ''}</div>
      <div class="mg-cv-bar">${barcodeSVG(p.barcode)}<div class="mg-cv-bar-t"><b>${T(price[0] || '')}</b><span>${T(price.slice(1).join(' · '))}</span></div></div>
    </div>`;
  };

  // ---- 2. editor's letter + contents ----
  KIND.contents = function (p) {
    const ed = p.editor || {};
    return `<div class="mg-ct">
      <section class="mg-letter">${head('From the editor', p.headline, '', 6.2)}
        <div class="mg-lt">${(p.letter || []).map((t, i) => `<p${i ? '' : ' class="mg-dc"'}>${T(t)}</p>`).join('')}</div>
        <div class="mg-sign" style="margin-bottom:calc(var(--t) * 1.4)"><span class="mg-sig">${T(ed.name)}</span><small>${T([ed.name, ed.role].filter(Boolean).join(', '))}</small></div>
        ${p.quote ? `<blockquote class="mg-pq">${T(p.quote)}<cite>The editors</cite></blockquote>` : ''}
      </section>
      <nav class="mg-toc" aria-label="Contents"><div class="mg-toc-h">Inside this issue</div>
        <ol>${(p.toc || []).map(t => `<li><a href="#mg-p${esc(t.page)}" data-go="${esc(t.page)}"><b>${pad2(t.page)}</b><span><strong>${T(t.title)}</strong>${t.dek ? `<small>${T(t.dek)}</small>` : ''}</span></a></li>`).join('')}</ol>
      </nav>
    </div>`;
  };

  // ---- 3. top storylines ----
  KIND.storylines = function (p) {
    const items = (p.items || []).map(it => {
      const pic = it.pid != null && !it.coach ? face(it.pid, 'xs', SZ.xs) : badge(it.tid, 'xs');
      const st = it.stat || {};
      return `<article class="mg-story" style="--tc:${inkOf(it.tid)}"><div class="mg-story-top"><span class="mg-num">${esc(it.n)}</span>${pic}<span class="mg-tag">${T(it.kicker)}</span>${st.v != null ? `<span class="mg-stat"><b>${T(st.v)}</b><small>${T(st.l)}</small></span>` : ''}</div><h3>${T(it.headline)}</h3><p>${T(it.body)}</p></article>`;
    }).join('');
    return head(p.title, p.headline, p.dek) + `<div class="mg-sl">${items}${sideBox(p.side)}</div>`;
  };
  function sideBox(sd) {
    if (!sd || !(sd.items || []).length) return '';
    if (sd.kind === 'wire') return `<aside class="mg-side wire"><h4>${T(sd.title)}</h4><ul>${sd.items.map(x => `<li>${badge(x.tid, 'xs', true)}<div><b>${T(x.text)}</b><small>${T(x.sub)}</small></div></li>`).join('')}</ul></aside>`;
    return `<aside class="mg-side nums"><h4>${T(sd.title)}</h4><ul>${sd.items.map(x => `<li><b>${T(x.v)}</b><span>${T(x.text)}</span></li>`).join('')}</ul></aside>`;
  }

  // ---- 4–5. power rankings ----
  function moveChip(r, first) {
    if (r.move == null) return first ? '' : '<span class="mg-mv mv-new">New</span>';
    if (r.move > 0) return `<span class="mg-mv mv-up" title="Up ${r.move} from last season's finish">▲ ${r.move}</span>`;
    if (r.move < 0) return `<span class="mg-mv mv-down" title="Down ${-r.move} from last season's finish">▼ ${-r.move}</span>`;
    return '<span class="mg-mv mv-same" title="Same spot as last season">=</span>';
  }
  KIND.power = function (p) {
    const rows = p.rows || [];
    const split = Math.ceil(rows.length / 2);
    const span = {}; // a tier's full range, across both power-ranking pages
    RC.pages.filter(q => q.kind === 'power').forEach(q => (q.rows || []).forEach(r => {
      const g = span[r.tier] || (span[r.tier] = [r.rank, r.rank]);
      g[0] = Math.min(g[0], r.rank);
      g[1] = Math.max(g[1], r.rank);
    }));
    const col = list => {
      let tier = null;
      return `<ol>${list.map(r => {
        let h = '';
        if (r.tier !== tier) {
          tier = r.tier;
          const g = span[tier];
          h = `<li class="mg-tier"><span>${T(tier)} <i>${g[0] === g[1] ? g[0] : g[0] + '–' + g[1]}</i></span></li>`;
        }
        const bits = [];
        if (r.last) bits.push(`Last season ${esc(r.last)}${r.lastRank ? ` (${U.ordinal(r.lastRank)})` : ''}`);
        if (r.star) bits.push(`Star ${T(shortName(r.star))} ${esc(r.star.ovr)}`);
        return h + `<li class="mg-pr-row" style="--tc:${inkOf(r.tid)}"><span class="mg-prk">${esc(r.rank)}</span>${badge(r.tid, 'sm', true)}<div class="mg-pr-main"><div class="mg-pr-name"><b>${T(r.team)}</b><span class="mg-rec">${esc(r.rec)}</span>${moveChip(r, p.first)}</div><p>${T(r.blurb)}</p>${bits.length ? `<span class="mg-last">${bits.join(' · ')}</span>` : ''}</div></li>`;
      }).join('')}</ol>`;
    };
    return head(p.title, p.headline, p.dek) + `<div class="mg-pr">${col(rows.slice(0, split))}${col(rows.slice(split))}</div>`;
  };

  // ---- women: position by position ----
  KIND.positions = function (p) {
    return head(p.title, p.headline, p.dek) + `<div class="mg-pos">${(p.groups || []).map(g => `<section>
      <h4><b>${esc(g.pos)}</b> ${T(g.label)}</h4>
      <div class="mg-pos-row">${(g.rows || []).map(r => `<div class="mg-pos-card" style="--tc:${inkOf(r.tid)}"><span class="mg-pos-rk">${esc(r.rank)}</span>${face(r.pid, 'sm', SZ.sm)}<div><b>${T(r.name)}</b><small>${esc(r.abbr)} · ${esc(r.ovr)} OVR · Age ${esc(r.age)}</small><p>${T(r.quip)}</p></div></div>`).join('')}</div>
    </section>`).join('')}</div>`;
  };

  // ---- 6–7. conference previews ----
  KIND.conf = function (p) {
    const lg = !!p.leagueFormat;
    const ncol = lg ? 7 : 6;
    let line = null;
    const body = (p.rows || []).map(r => {
      let cut = '';
      if (line && r.line !== line) cut = `<tr class="mg-cut"><td colspan="${ncol}"><span>${r.line === 'pi' ? 'Play-in line' : lg ? 'Playoff line' : 'Lottery line'}</span></td></tr>`;
      line = r.line;
      return cut + `<tr class="l-${esc(r.line)}" style="--tc:${inkOf(r.tid)}"><td class="n">${esc(r.seed)}</td><td class="t">${badge(r.tid, 'xs')}<b>${T(r.team)}</b></td><td class="n">${esc(r.w)}</td><td class="n">${esc(r.l)}</td><td class="n">${esc(r.gb)}</td>${lg ? `<td class="n"><span class="mg-seedchip${r.lgSeed <= (p.playoffTeams || 8) ? ' po' : ''}" title="Projected league-wide seed">${esc(r.lgSeed)}</span></td>` : ''}<td class="k">${T(r.key)}</td></tr>`;
    }).join('');
    const table = `<table class="mg-st"><thead><tr><th class="n">#</th><th>Team</th><th class="n">W</th><th class="n">L</th><th class="n">GB</th>${lg ? '<th class="n" title="Projected league-wide seed">Lg</th>' : ''}<th>Key player</th></tr></thead><tbody>${body}</tbody></table>`;
    const side = (p.side || []).map(b => `<div class="mg-box" style="--tc:${inkOf(b.tid)}"><div class="mg-box-l">${T(b.label)}</div><div class="mg-box-t">${badge(b.tid, 'xs')}<span>${T(b.title)}</span></div><p>${T(b.text)}</p></div>`).join('');
    const m = p.mvp;
    const mvp = m ? `<div class="mg-cmvp">${face(m.pid, 'md', SZ.md)}<div><small>Best in the ${T(p.confName)}</small><b>${T(m.name)}</b><span>${esc(m.pos)} · ${T(m.team)} · ${esc(m.ovr)} OVR</span></div></div>` : '';
    const q = p.quote && p.quote.text ? `<blockquote class="mg-pq pq-big">${T(p.quote.text)}${p.quote.by ? `<cite>${T(p.quote.by)}</cite>` : ''}</blockquote>` : '';
    return head(p.title, p.headline, p.dek) + `<div class="mg-cf">${table}<div class="mg-cf-side">${side}${mvp}</div></div>${q}`;
  };

  // ---- 8. your team ----
  KIND.team = function (p) {
    const tid = p.tid, pr = p.proj || {}, c = p.coach || {};
    const hero = `<div class="mg-tm-hero" style="${teamVars(tid)}">${badge(tid, 'xl', true)}<div class="mg-tm-t"><span class="mg-kick inv">${T(p.kicker)}</span><h2 class="mg-h"${hlSize(p.headline, 6.4)}>${T(p.headline)}</h2><div class="mg-tm-name">${T(p.team)}</div></div><div class="mg-tm-proj"><small>Our projection</small><b>${esc(pr.rec)}</b><span>${T(pr.seedText)}</span></div></div>`;
    const intro = p.intro ? `<p class="mg-tm-intro mg-dc">${T(p.intro)}</p>` : '';
    const keys = (p.key || []).length ? `<div class="mg-keys">${p.key.map(k => `<figure class="mg-key">${face(k.pid, '', SZ.key)}<figcaption><b>${T(k.name)}</b><span class="meta">${esc(k.pos)} · ${esc(k.ovr)} OVR · ${hgt(k.hgt)}${k.role ? ' · ' + T(k.role) : ''}</span>${k.line ? `<small>${T(k.line)}</small>` : ''}${(k.tags || []).length ? `<i>${T(k.tags.join(' · '))}</i>` : ''}</figcaption></figure>`).join('')}</div>` : '';
    const swLi = (s, bad) => `<li${bad ? ' class="bad"' : ''}><b>${T(s.label)}</b><span class="mg-rank">${T(s.rankText)}</span><small>${T(s.text)}</small></li>`;
    const sw = `<section class="mg-sw"><h4>Strengths</h4><ul>${(p.strengths || []).map(s => swLi(s, false)).join('')}</ul>${(p.weaknesses || []).length ? `<h4>Weaknesses</h4><ul>${p.weaknesses.map(s => swLi(s, true)).join('')}</ul>` : ''}</section>`;
    const dl = [];
    const dd = (k, v, wide) => { if (v != null && v !== '') dl.push(`<div${wide ? ' class="wide"' : ''}><dt>${k}</dt><dd>${T(v)}</dd></div>`); };
    dd('Record', c.rec);
    dd('Playoffs', c.po);
    dd('Titles', c.titles != null ? c.titles : 0);
    dd('Coach rating', c.rating);
    if (c.age == null && c.seasons != null) dd('Seasons', c.seasons);
    dd('Contract', c.contract, true);
    dd('System', c.style, true);
    const coach = `<section class="mg-coach"><div class="mg-coach-n">${T(c.name)}<small>${p.isUser ? `Head coach, year ${esc(c.year || 1)}${c.age ? ` · age ${esc(c.age)}` : ''}` : 'Head coach'}</small></div><dl>${dl.join('')}</dl>${c.heat != null ? `<div class="mg-heat">${gauge(c.heat)}<div><b>${esc(c.heat)}</b><span>Hot seat: ${T(c.heatLabel || '')}</span></div></div>` : ''}${p.expectation ? `<div class="mg-goal"><small>Owner's goal</small><b>${T(p.expectation)}</b></div>` : ''}</section>`;
    const x = p.xfactor;
    const xf = x ? `<div class="mg-xf">${face(x.pid, 'sm', SZ.sm)}<div><h4>X-factor</h4><b>${T(x.name)}</b><p>${T(x.text)}</p></div></div>` : '';
    const num = p.number ? `<div class="mg-number"><b>${T(p.number.v)}</b><span>${T(p.number.text)}</span></div>` : '';
    const grid = `<div class="mg-tm-grid">${sw}${coach}<section class="mg-tm-x">${xf}${num}</section></div>`;
    const depth = (p.depth || []).length ? `<section class="mg-depth"><h4>Depth chart</h4><div class="mg-dep-grid">${p.depth.map(d => `<div class="mg-dep"><b>${esc(d.pos)}</b>${(d.players || []).map(q => `<span${q.starter ? ' class="st"' : ''}>${T(q.name)} <i>${esc(q.ovr)}</i></span>`).join('')}</div>`).join('')}</div></section>` : '';
    const pay = p.payroll || {};
    const foot = `<div class="mg-tm-foot"><div><small>Opening night</small>${T(p.opener || 'To be announced')}</div><div><small>Payroll</small>${T([pay.amt, pay.note].filter(Boolean).join(' · '))}</div><div><small>Our verdict</small><span class="v">${T(p.verdict)}</span></div></div>`;
    return hero + intro + keys + grid + depth + foot;
  };

  // ---- 9. top 10 ----
  KIND.top10 = function (p) {
    const rows = p.rows || [];
    const one = rows[0];
    const hero = one ? `<div class="mg-t1" style="${teamVars(one.tid)}"><span class="mg-t1-rk">1</span>${face(one.pid, '', SZ.hero, { cutout: true, mood: 'clutch' })}<div class="mg-t1-t"><span class="mg-t1-ovr">${esc(one.ovr)}<small>OVR</small></span><b>${T(one.name)}</b><span class="meta">${esc(one.pos)} · ${T(one.team)} · ${hgt(one.hgt)} · Age ${esc(one.age)}</span>${one.line ? `<div class="line">${T(one.line)}</div>` : ''}${one.quip ? `<p class="quip">${T(one.quip)}</p>` : ''}</div></div>` : '';
    const grid = `<div class="mg-t10-grid">${rows.slice(1).map(r => `<article class="mg-t10" style="--tc:${inkOf(r.tid)}"><span class="mg-t10-rk">${esc(r.rank)}</span><div class="mg-t10-h">${face(r.pid, 'sm', SZ.sm)}<div class="mg-t10-t"><b>${T(r.name)}</b><span class="meta">${esc(r.pos)} · ${esc(r.abbr)} · ${esc(r.ovr)} OVR</span></div></div>${r.line ? `<div class="line">${T(r.line)}</div>` : ''}${r.quip ? `<p>${T(r.quip)}</p>` : ''}</article>`).join('')}</div>`;
    return head(p.title, p.headline, p.dek) + hero + grid;
  };

  // ---- 10. award predictions ----
  KIND.awards = function (p) {
    return head(p.title, p.headline, p.dek) + `<div class="mg-aw-grid">${(p.awards || []).map(a => {
      const favs = a.favs || [], f = favs[0], coach = a.key === 'coy';
      const top = f
        ? `<div class="mg-aw-fav">${coach ? badge(f.tid, '', true) : face(f.pid, '', SZ.fav)}<div><b>${T(f.name)}</b><small>${T(f.team || f.abbr)}${coach && f.isUser ? ' · that’s you' : ''}</small><p>${T(f.reason)}</p></div><span class="mg-odds">${esc(f.odds)}</span></div>`
        : `<p class="mg-aw-empty">${T(a.note || 'No favorites yet.')}</p>`;
      const rest = favs.slice(1).map(o => `<li${o.long ? ' class="long"' : ''}><span>${o.long ? 'Long shot: ' : ''}${T(o.name)} <small>${esc(o.abbr)}</small></span><small>${esc(o.prob)}%</small><b>${esc(o.odds)}</b></li>`).join('');
      return `<section class="mg-aw"><header><span class="mg-aw-s">${esc(a.short)}</span><span>${T(a.label)}</span></header>${top}${rest ? `<ol>${rest}</ol>` : ''}</section>`;
    }).join('')}</div>`;
  };

  // ---- 11. rookie class / draft watch ----
  KIND.rookies = function (p) {
    const rows = (p.rows || []).map(r => `<li style="--tc:${inkOf(r.tid)}">${face(r.pid, 'sm', SZ.sm)}<div class="mg-rk-t"><b>${esc(r.rank)}. ${T(r.name)}</b><small>${[esc(r.pos), hgt(r.hgt), T(r.pick), T(r.origin), r.tid >= 0 ? esc(r.abbr) : ''].filter(Boolean).join(' · ')}</small><p>${T(r.blurb)}</p></div><div class="mg-rk-r">${ovrChip(r.ovr)}<span class="mg-ceil">${T(r.ceiling)}</span></div></li>`).join('');
    const supers = (p.supers || []).map(s => `<div class="mg-super"><small>${T(s.label)}</small><b>${T(s.name)}</b><span>${T(s.text)}</span></div>`).join('');
    const board = (p.board || []).length ? `<div class="mg-board"><h4>${T(p.boardTitle)}</h4><ol>${p.board.map(b => `<li><b>${T(b.name)}</b><small>${[esc(b.pos), hgt(b.hgt), T(b.origin), b.age ? 'age ' + esc(b.age) : ''].filter(Boolean).join(' · ')}</small><span>${T(b.ceiling)}</span></li>`).join('')}</ol></div>` : '';
    return head(p.title, p.headline, p.dek) + `<div class="mg-rk"><ol class="mg-rk-list">${rows}</ol><aside class="mg-rk-side">${supers}${board}</aside></div>`;
  };

  // ---- 12. report card ----
  KIND.grades = function (p) {
    const li = h => `<li>${gradeChip(h.grade)}${badge(h.tid, 'sm', true)}<div><b>${T(h.team)}</b><p>${T(h.text)}</p></div></li>`;
    const top = `<div class="mg-gr-top"><section><h4>Honor roll</h4><ol>${(p.honor || []).map(li).join('')}</ol></section><section class="det"><h4>Detention</h4><ol>${(p.detention || []).map(li).join('')}</ol></section></div>`;
    const rows = p.rows || [];
    const grid = `<div class="mg-gr-grid${rows.length <= 16 ? ' few' : ''}">${rows.map(r => {
      const d = r.delta ? `<i class="${/^-/.test(String(r.delta)) ? 'd-neg' : 'd-pos'}">${esc(r.delta)}</i> ` : '';
      return `<div class="mg-gc" style="--tc:${inkOf(r.tid)}">${badge(r.tid, 'xs', true)}<b>${esc(r.abbr)}</b>${gradeChip(r.grade)}<small>${d}${T(r.note)}</small></div>`;
    }).join('')}</div>`;
    return head(p.title, p.headline, p.dek) + top + grid;
  };

  // ---- 13. coaches' corner ----
  KIND.coaches = function (p) {
    const you = on => (on ? ' <em>You</em>' : '');
    const rank = `<section class="mg-co-rank"><h4>Coach rankings</h4><ol>${(p.rank || []).map(r => `<li${r.isUser ? ' class="me"' : ''}><span class="mg-rk-n">${esc(r.rank)}</span>${badge(r.tid, 'xs', true)}<b>${T(r.name)}${you(r.isUser)}</b><small>${esc(r.abbr)} · ${T(r.note)}</small><span class="mg-bar"><i style="width:${pct(r.rating)}%"></i></span><span class="mg-rt">${esc(r.rating)}</span></li>`).join('')}</ol></section>`;
    const hot = `<section class="mg-co-hot"><h4>The hot seat</h4><ol>${(p.hot || []).map(h => `<li${h.isUser ? ' class="me"' : ''}>${badge(h.tid, 'sm', true)}<div><b>${T(h.name)}${you(h.isUser)}</b><small>${T(h.team)}</small><div class="mg-therm"><i style="width:${100 - pct(h.heat)}%"></i></div><p>${T(h.text)}</p></div><div class="mg-heatn"><b>${esc(h.heat)}</b><small>${T(h.label)}</small></div></li>`).join('')}</ol></section>`;
    const u = p.user;
    const me = u ? `<div class="mg-co-me">${gauge(u.heat)}<div><small>Your seat</small><b>${T(u.label)}</b><span>Heat index ${esc(u.heat)} of 100. Our coach rankings have you ${U.ordinal(u.rank)} of ${esc(u.of)} (${esc(u.rating)} rating).</span></div></div>` : '';
    const safe = `<section class="mg-co-safe"><h4>Safe and sound</h4><ol>${(p.safe || []).map(s => `<li>${badge(s.tid, 'sm', true)}<div><b>${T(s.name)}${you(s.isUser)}</b><small>${T(s.team)} · heat ${esc(s.heat)}</small><p>${T(s.text)}</p></div></li>`).join('')}</ol>${me}</section>`;
    const quotes = (p.quotes || []).length ? `<section class="mg-co-q"><h4>Media day</h4>${p.quotes.map(q => `<blockquote>${T(stripQuotes(q.text))}<cite>${T(q.by)}, ${T(q.team)}</cite></blockquote>`).join('')}</section>` : '';
    return head(p.title, p.headline, p.dek) + `<div class="mg-co">${rank}${hot}</div><div class="mg-co-b">${safe}${quotes}</div>`;
  };

  // ---- 14. last season in review ----
  KIND.review = function (p) {
    const ch = p.champion;
    const fm = ch && ch.fmvp;
    const champ = ch ? `<div class="mg-rv-ch" style="${teamVars(ch.tid)}">${trophySVG()}<div class="mg-rv-cht"><small>${esc(RC.prevName)} champions${ch.rec ? ' · ' + esc(ch.rec) : ''}</small><b>${T(ch.team)}</b><p>${T(ch.text)}</p>${fm ? `<div class="mg-rv-fm">${face(fm.pid, 'sm', SZ.sm, { mood: 'win' })}<div><small>Finals MVP</small><b>${T(fm.name)}</b>${fm.line ? `<i>${T(fm.line)}</i>` : ''}</div></div>` : ''}</div>${badge(ch.tid, 'xl', true)}</div>` : '';
    const aw = (p.awards || []).length ? `<section><h4>The hardware</h4><ol class="mg-rv-aw">${p.awards.map(a => `<li><small>${T(a.label)}</small><b>${T(a.name)}</b><span>${[esc(a.abbr), T(a.line)].filter(Boolean).join(' · ')}</span></li>`).join('')}</ol></section>` : '';
    const ld = (p.leaders || []).length ? `<ol class="mg-rv-ld">${p.leaders.map(l => `<li><small>${T(l.label)}</small><b>${esc(l.val)}</b><span>${T(l.name)}, ${esc(l.abbr)}</span></li>`).join('')}</ol>` : '';
    const rec = (x, lbl) => (x ? `<span>${badge(x.tid, 'sm', true)}<small>${lbl}</small><b>${esc(x.abbr)} ${esc(x.rec)}</b></span>` : '');
    const bw = p.best || p.worst ? `<div class="mg-rv-bw">${rec(p.best, 'Best record')}${rec(p.worst, 'Worst record')}</div>` : '';
    const grid = aw || ld || bw ? `<div class="mg-rv-grid">${aw}${ld || bw ? `<section><h4>Stat kings</h4>${ld}${bw}</section>` : ''}</div>` : '';
    const recs = (p.records || []).length ? `<section class="mg-rv-rec"><h4>Record book</h4><div class="mg-rv-recs">${p.records.map(r => `<div class="mg-rbx${r.record ? ' new' : ''}"><b>${esc(r.big)}</b><small>${T(r.label)}</small><span>${T(r.text)}</span></div>`).join('')}</div></section>` : '';
    const swing = (x, lbl, cls) => (x ? `<div${cls ? ` class="${cls}"` : ''} style="--tc:${inkOf(x.tid)}">${badge(x.tid, 'md', true)}<div><small>${lbl}</small><b>${T(x.team)} (${esc(x.rec)})</b><p>${T(x.text)}</p></div></div>` : '');
    const sw = p.surprise || p.bust ? `<div class="mg-rv-swing">${swing(p.surprise, 'Biggest surprise', '')}${swing(p.bust, 'Biggest letdown', 'sw-down')}</div>` : '';
    const y = p.yours;
    const extra = y ? [y.leader, y.verdict].filter(Boolean).join(' · ') : '';
    const you = y ? `<div class="mg-rv-you" style="--tc:${inkOf(y.tid)}">${badge(y.tid, 'lg', true)}<div><small>Your season</small><b>${T(y.team)}: ${esc(y.rec)}${y.seed ? `, ${U.ordinal(y.seed)} seed` : ''}</b><p>${T(y.text)}</p>${extra ? `<span>${T(extra)}</span>` : ''}</div></div>` : '';
    return head(p.kicker || p.title, p.headline, '') + champ + grid + recs + sw + you;
  };

  // ---- 14 (year one). five things to watch ----
  KIND.watch = function (p) {
    const items = (p.items || []).map(it => `<li style="--tc:${inkOf(it.tid)}"><span class="mg-wn">${esc(it.n)}</span>${it.pid != null ? face(it.pid, 'md', SZ.md) : badge(it.tid, 'md', true, 9.5)}<div><h3>${T(it.headline)}</h3><p>${T(it.body)}</p></div></li>`).join('');
    const dates = (p.dates || []).length ? `<section class="mg-dates"><h4>Circle the dates</h4><ol>${p.dates.map(d => `<li><small>${T(d.label)}</small><b>${T(d.date)}</b><span>${T(d.text)}</span></li>`).join('')}</ol></section>` : '';
    return head(p.kicker || p.title, p.headline, p.dek) + `<ol class="mg-watch">${items}</ol>${dates}`;
  };

  // ---- 15. bold predictions, Finals pick (the ad parody is printed by wrap()) ----
  KIND.back = function (p) {
    const bold = `<ol class="mg-bold">${(p.bold || []).map(b => `<li><span class="mg-bn">${esc(b.n)}</span><div><p>${T(b.text)}</p><span class="mg-conf"><i style="width:${pct(parseFloat(b.conf))}%"></i></span><small>Our confidence: ${esc(b.conf)}</small></div></li>`).join('')}</ol>`;
    const f = p.finals;
    const mvp = f && f.fmvp ? `<div style="margin:auto 0 calc(var(--t) * -1.2);display:flex;align-items:flex-end;gap:calc(var(--u) * 1.4)">${face(f.fmvp.pid, 'md', SZ.fav, { cutout: true, mood: 'clutch', style: 'width:calc(var(--u) * 15);height:calc(var(--u) * 15)' })}<span style="padding-bottom:calc(var(--t) * 1.8);font:800 calc(var(--t) * 1.5)/1.25 var(--mg-sans);letter-spacing:calc(var(--u) * .15);text-transform:uppercase">Finals MVP pick<br><span style="color:var(--c2)">${T(f.fmvp.name)}</span></span></div>` : '';
    const fin = f ? `<aside class="mg-final" style="${teamVars(f.win)}"><small>Our Finals pick</small><div class="mg-fvs">${badge(f.win, 'md', true)}<span>over</span>${badge(f.lose, 'sm', true)}</div><b>${T(f.winNick)} in ${esc(f.games)}</b><p>${T(f.text)}</p>${mvp}</aside>` : '';
    return head('Bold predictions', p.headline, p.dek) + `<div class="mg-bk">${bold}${fin}</div>`;
  };
  function adHTML(ad) {
    if (!ad) return '';
    const c = AD_COLORS[ad.kind] || AD_COLORS.shoe;
    const art = ADS_ART[ad.kind] || ADS_ART.shoe;
    return `<div class="mg-ad" style="--a1:${c.a1};--a2:${c.a2};--ai:${c.ai};--ah:${c.ah}"><div class="mg-ad-art">${art()}</div><div class="mg-ad-t"><small>Advertisement</small><span class="mg-ad-brand">${T(ad.brand)}</span><span class="mg-ad-prod">${T(ad.product)}</span><em>${T(ad.tagline)}</em><p>${T(ad.copy)}</p></div><p class="mg-ad-fine">${T(ad.fine)}</p></div>`;
  }

  function renderPage(B, i) {
    const p = B.pages[i] || { kind: 'blank', title: '' };
    const prev = RC;
    RC = B;
    try {
      let inner;
      try {
        const fn = KIND[p.kind];
        inner = fn ? fn(p) : head(p.title, p.headline || p.title, p.dek);
      } catch (e) {
        console.error(`[magazine] could not print page ${i + 1} (${p.kind})`, e);
        inner = head(p.title, p.title, 'This page could not be printed.');
      }
      return wrap(B, p, i, inner);
    } finally { RC = prev; }
  }
  function wrap(B, p, i, inner) {
    const num = p.num || i + 1;
    const mast = B.mag.mast || 'COURTSIDE';
    const open = `<article class="mg-page mg-k-${esc(p.kind)}" data-i="${i}" style="--acc:${accentFor(p)}" aria-label="${T(`Page ${num}: ${p.title || ''}`)}"><div class="mg-in">`;
    if (p.kind === 'cover') return `${open}${inner}</div></article>`;
    return `${open}<header class="mg-rh"><span><b>${esc(mast)}</b> · ${esc(B.mag.seasonName || '')} Season Preview</span><span>${T(p.title)}</span></header>`
      + `<div class="mg-body">${inner}</div>${p.kind === 'back' ? adHTML(p.ad) : ''}`
      + `<footer class="mg-folio${num % 2 ? ' odd' : ''}"><span class="mg-fn">${num}</span><span>${esc(mast)}</span><i style="flex:1"></i><span>${T(B.mag.league || '')}</span></footer></div></article>`;
  }

  // ---------------------------------------------------------------------------
  // Auto-fit: a fixed page that overflows shrinks its type scale (--k) until it fits
  // ---------------------------------------------------------------------------
  function overflows(el) {
    const b = el.querySelector('.mg-body');
    return !!b && b.scrollHeight > b.clientHeight + 1;
  }
  function fitBody(el) {
    el.style.setProperty('--k', '1');
    if (!overflows(el)) return 1;
    let lo = 0.5, hi = 1;
    for (let n = 0; n < 7; n++) {
      const mid = (lo + hi) / 2;
      el.style.setProperty('--k', mid.toFixed(3));
      if (overflows(el)) hi = mid; else lo = mid;
    }
    const k = +lo.toFixed(3);
    el.style.setProperty('--k', String(k));
    return k;
  }
  /** the cover headline steps down until it sits on two lines */
  function fitCover(el) {
    const h1 = el.querySelector('.mg-cv-hl h1');
    if (!h1) return {};
    const u = el.clientWidth / 100;
    let hs = +h1.dataset.hs || 11;
    h1.style.fontSize = `calc(var(--u) * ${hs})`;
    while (hs > 6 && h1.offsetHeight > hs * u * 0.86 * 2 + 2) {
      hs -= 0.5;
      h1.style.fontSize = `calc(var(--u) * ${hs})`;
    }
    return { hs };
  }
  function applyFit(el, c) {
    if (!el || !c) return;
    if (c.k != null) el.style.setProperty('--k', String(c.k));
    if (c.hs != null) { const h1 = el.querySelector('.mg-cv-hl h1'); if (h1) h1.style.fontSize = `calc(var(--u) * ${c.hs})`; }
  }
  /** fit a page element (measured in place). force: re-measure when the cached result was taken at another size */
  function fitEl(B, el, u, force) {
    const i = el ? +el.dataset.i : NaN;
    if (isNaN(i)) return;
    const c = B.fit[i];
    if (c && (!force || Math.abs(c.u - u) < 0.3)) { applyFit(el, c); return; }
    if (!el.isConnected || !el.clientWidth) { applyFit(el, c); return; }
    const res = el.classList.contains('mg-k-cover') ? fitCover(el) : { k: fitBody(el) };
    res.u = u;
    B.fit[i] = res;
  }
  let measureEl = null;
  function measureBox(u) {
    if (!measureEl || !measureEl.isConnected) {
      measureEl = document.createElement('div');
      measureEl.setAttribute('aria-hidden', 'true');
      measureEl.style.cssText = 'position:fixed;left:-30000px;top:0;visibility:hidden;pointer-events:none';
      document.body.appendChild(measureEl);
    }
    measureEl.style.setProperty('--u', u + 'px');
    measureEl.style.setProperty('--pw', u * 100 + 'px');
    return measureEl;
  }
  function dropMeasure() { if (measureEl) { measureEl.remove(); measureEl = null; } }

  // ---------------------------------------------------------------------------
  // Reader
  // ---------------------------------------------------------------------------
  let R = null;
  let readerSeq = 0;
  const ICON_GRID = '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" style="vertical-align:-2px;margin-right:2px"><g fill="currentColor"><rect width="6" height="6" rx="1.3"/><rect x="8" width="6" height="6" rx="1.3"/><rect y="8" width="6" height="6" rx="1.3"/><rect x="8" y="8" width="6" height="6" rx="1.3"/></g></svg>';

  function save() {
    const UI = PBC.UI;
    if (UI && typeof UI.save === 'function') { try { UI.save(); } catch (e) { console.error(e); } }
  }
  function readPref() { try { return window.localStorage.getItem(LS_READING) === '1'; } catch (e) { return false; } }
  function writePref(on) { try { window.localStorage.setItem(LS_READING, on ? '1' : '0'); } catch (e) { /* private mode */ } }

  M.open = function (S, opts) {
    if (S && !S.teams && opts == null && typeof S === 'object') { opts = S; S = null; }
    opts = opts || {};
    S = S || (PBC.UI && PBC.UI.S) || null;
    if (!S || !S.teams || !S.teams.length) return false;
    if (typeof M.ensure !== 'function') { console.warn('[magazine] js/core/magazine.js is not loaded'); return false; }
    const mag = M.ensure(S);
    if (!mag || !mag.pages || !mag.pages.length) return false;
    const page = opts.page != null ? +opts.page : null;
    if (R) {
      if (R.S === S && R.mag === mag) {
        if (opts.onClose) R.onClose = opts.onClose;
        if (page) goTo(page - 1);
        return true;
      }
      close(true);
    }
    mag.seen = true;
    save();
    openReader(S, mag, page, opts.onClose || null);
    return true;
  };
  M.close = function () { close(false); };
  M.isOpen = () => !!R;

  function openReader(S, mag, page, onClose) {
    const B = new Book(S, mag);
    const start = page || +mag.lastPage || 1;
    const stripId = 'mg-strip-' + ++readerSeq;
    const el = document.createElement('div');
    el.className = 'mg-reader';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', `${mag.mast || 'COURTSIDE'}, ${mag.seasonName || ''} season preview magazine`);
    el.tabIndex = -1;
    el.innerHTML = `<header class="mg-top">
        <div class="mg-logo"><b>${esc(mag.mast || 'COURTSIDE')}</b><span>${esc(mag.seasonName || '')} Season Preview</span></div>
        <div class="mg-pno" aria-live="polite"></div>
        <div class="mg-actions">
          <button type="button" class="mg-btn" data-mg="thumbs" aria-expanded="false" aria-controls="${stripId}" title="Page thumbnails (T)">${ICON_GRID}<span> Pages</span></button>
          <button type="button" class="mg-btn" data-mg="reading" aria-pressed="false" title="Reading mode: one column, larger type (R)"><b class="mg-aa">Aa</b><span> Reading mode</span></button>
          <button type="button" class="mg-btn mg-x" data-mg="close" aria-label="Close the magazine" title="Close (Esc)">✕</button>
        </div>
      </header>
      <div class="mg-stage">
        <button type="button" class="mg-edge prev" data-mg="prev" aria-label="Previous page">‹</button>
        <div class="mg-book"></div>
        <button type="button" class="mg-edge next" data-mg="next" aria-label="Next page">›</button>
      </div>
      <nav class="mg-strip" id="${stripId}" aria-label="All pages" hidden><div class="mg-strip-in"></div></nav>
      <div class="mg-flowbar"><button type="button" data-mg="prev">‹ Prev</button><span class="mg-pno2" aria-hidden="true"></span><button type="button" data-mg="next">Next ›</button></div>`;
    const $ = s => el.querySelector(s);
    const r = R = {
      S, mag, B, n: B.n, el, onClose,
      top: $('.mg-top'), stage: $('.mg-stage'), book: $('.mg-book'), strip: $('.mg-strip'), stripIn: $('.mg-strip-in'),
      pno: $('.mg-pno'), pno2: $('.mg-pno2'), btnThumbs: $('[data-mg="thumbs"]'), btnRead: $('[data-mg="reading"]'),
      idx: clamp(Math.round(start) - 1, 0, B.n - 1), mode: null, pw: 0, u: 0, narrow: false,
      reading: readPref(), stripOpen: false, thumbs: [], anim: null, timers: new Set(), sw: null, rz: 0,
      prevFocus: document.activeElement, bodyOverflow: document.body.style.overflow,
    };
    r.btnRead.classList.toggle('on', r.reading);
    r.btnRead.setAttribute('aria-pressed', String(r.reading));
    r.stage.style.touchAction = 'pan-y pinch-zoom';
    el.addEventListener('click', onClick);
    r.stage.addEventListener('mousemove', onHover);
    r.stage.addEventListener('touchstart', onTouchStart, { passive: true });
    r.stage.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onResize);
    document.addEventListener('focusin', onFocusIn);
    document.body.appendChild(el);
    document.body.style.overflow = 'hidden';
    layout(true);
    if (largeScreen() && r.mode !== 'flow') toggleStrip(true);
    void el.offsetWidth; // start the fade-in from opacity 0
    el.classList.add('on');
    if (canAnimate && !reducedMotion()) r.stage.animate([{ opacity: 0, transform: 'translateY(14px) scale(.985)' }, { opacity: 1, transform: 'none' }], { duration: 280, easing: 'cubic-bezier(.2,.7,.3,1)' });
    try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
    warm();
  }

  function close(immediate) {
    const r = R;
    if (!r) return;
    if (r.anim) r.anim.finish();
    R = null;
    r.mag.lastPage = r.idx + 1;
    r.timers.forEach(t => clearTimeout(t));
    clearTimeout(r.rz);
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', onResize);
    document.removeEventListener('focusin', onFocusIn);
    dropMeasure();
    document.body.style.overflow = r.bodyOverflow;
    const el = r.el;
    if (immediate || reducedMotion()) el.remove();
    else {
      el.classList.remove('on');
      el.classList.add('off');
      setTimeout(() => el.remove(), 240);
    }
    const f = r.prevFocus;
    if (f && f !== document.body && f.isConnected && typeof f.focus === 'function') { try { f.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
    save();
    const land = document.querySelector('[data-mg-land="read"]');
    if (land) land.innerHTML = readLabel(r.mag);
    if (r.onClose) { try { r.onClose(); } catch (e) { console.error(e); } }
  }

  // ---- layout: pick the mode and the page size for the window ----
  function layout(force) {
    const r = R;
    if (!r) return;
    const W = r.el.clientWidth, H = r.el.clientHeight - r.top.offsetHeight;
    const availW = W - 2 * EDGE;
    const pick = availH => {
      if (r.reading) return { mode: 'flow', pw: 0 };
      const two = Math.floor(Math.min(availW / 2, availH / RATIO));
      const one = Math.floor(Math.min(availW, availH / RATIO));
      return two >= MIN_FIXED ? { mode: 'spread', pw: two } : one >= MIN_FIXED ? { mode: 'single', pw: one } : { mode: 'flow', pw: 0 };
    };
    let fit = pick(H - 2 * PAD), reserve = 0;
    // an open thumbnail strip overlays the stage; make room for it when the pages can shrink without changing mode
    const stripH = r.stripOpen && !r.strip.hidden ? r.strip.offsetHeight || 120 : 0;
    if (stripH && fit.mode !== 'flow') {
      const tight = pick(H - 2 * PAD - stripH);
      if (tight.mode === fit.mode) { fit = tight; reserve = stripH; }
    }
    const mode = fit.mode;
    let pw = fit.pw;
    r.el.classList.remove('m-spread', 'm-single', 'm-flow');
    r.el.classList.add('m-' + mode);
    r.stage.style.paddingBottom = reserve ? PAD + reserve + 'px' : '';
    r.stage.style.scrollbarGutter = mode === 'flow' ? 'stable both-edges' : '';
    let u;
    if (mode === 'flow') {
      pw = Math.max(240, Math.min(FLOW_MAX, r.stage.clientWidth - 16));
      u = r.reading ? Math.max((pw / 100) * 1.14, READ_U) : Math.max(pw / 100, FLOW_U);
    } else u = pw / 100;
    u = Math.round(u * 100) / 100;
    const narrow = mode === 'flow' && pw / u < NARROW;
    r.el.style.setProperty('--pw', pw + 'px');
    r.el.style.setProperty('--u', u + 'px');
    const rebuild = force || mode !== r.mode || narrow !== r.narrow || (mode === 'flow' && Math.abs(u - r.u) > 0.01);
    r.pw = pw;
    r.u = u;
    r.narrow = narrow;
    if (mode !== r.mode && r.stripOpen && mode === 'flow' && !largeScreen()) toggleStrip(false, true);
    r.mode = mode;
    if (rebuild) renderView();
    else { fitVisible(); syncChrome(); }
  }
  function onResize() {
    const r = R;
    if (!r) return;
    clearTimeout(r.rz);
    r.rz = setTimeout(() => { if (R === r) { layout(false); warm(); } }, 120);
  }

  // ---- spreads ----
  const spreadOf = i => (i <= 0 ? 0 : Math.floor((i + 1) / 2));
  function spreadPages(s) {
    if (s <= 0) return [null, 0];
    const l = 2 * s - 1, rr = 2 * s;
    return [l < R.n ? l : null, rr < R.n ? rr : null];
  }
  const lastSpread = () => spreadOf(R.n - 1);
  function atStart() { return R.mode === 'spread' ? spreadOf(R.idx) === 0 : R.idx === 0; }
  function atEnd() { return R.mode === 'spread' ? spreadOf(R.idx) >= lastSpread() : R.idx >= R.n - 1; }

  // ---- page elements ----
  function pageEl(i) {
    const r = R;
    const el = parse(uniq(r.B.pageHTML(i)));
    if (r.mode !== 'flow') applyFit(el, r.B.fit[i]);
    else if (el.classList.contains('mg-k-cover')) applyFit(el, { hs: (r.B.fit[i] || {}).hs });
    return el;
  }
  function mkSlot(cls, i) {
    const s = document.createElement('div');
    s.className = 'mg-slot ' + cls;
    if (i != null) s.appendChild(pageEl(i));
    return s;
  }
  function fitVisible() {
    const r = R;
    r.book.querySelectorAll('.mg-page').forEach(el => {
      if (r.mode !== 'flow') fitEl(r.B, el, r.u, true);
      else if (el.classList.contains('mg-k-cover')) fitEl(r.B, el, r.u, false);
    });
  }
  function renderView() {
    const r = R;
    if (r.anim) r.anim.finish();
    const book = r.book;
    book.textContent = '';
    book.style.cursor = '';
    book.classList.toggle('mg-narrow', r.narrow);
    book.classList.remove('solo');
    if (r.mode === 'spread') {
      const s = spreadOf(r.idx), pr = spreadPages(s);
      book.classList.toggle('solo', s === 0);
      book.appendChild(mkSlot('lft', pr[0]));
      book.appendChild(mkSlot('rgt', pr[1]));
    } else book.appendChild(mkSlot('one', r.idx));
    if (r.mode === 'flow') r.stage.scrollTop = 0;
    fitVisible();
    syncChrome();
  }

  // ---- chrome: page numbers, buttons, thumbnails ----
  function syncChrome() {
    const r = R;
    if (!r) return;
    let a = r.idx, b = r.idx;
    if (r.mode === 'spread') {
      const pr = spreadPages(spreadOf(r.idx)).filter(x => x != null);
      a = pr[0]; b = pr[pr.length - 1];
    }
    const nums = a === b ? String(a + 1) : `${a + 1}–${b + 1}`;
    const pg = r.B.pages[r.idx] || {};
    r.pno.innerHTML = `<span>${a === b ? 'Page' : 'Pages'} </span><b>${nums}</b><span> of ${r.n} · ${T(pg.title)}</span>`;
    r.pno2.textContent = `${nums} / ${r.n}`;
    const s0 = atStart(), s1 = atEnd();
    r.el.querySelectorAll('[data-mg="prev"]').forEach(x => { x.disabled = s0; });
    r.el.querySelectorAll('[data-mg="next"]').forEach(x => { x.disabled = s1; });
    r.thumbs.forEach((t, i) => {
      const on = i >= a && i <= b;
      t.classList.toggle('on', on);
      if (on) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
    });
    if (r.stripOpen) scrollThumb(a, false);
    r.mag.lastPage = r.idx + 1;
  }

  // ---- navigation ----
  function next() {
    const r = R;
    if (!r || atEnd()) return;
    if (r.mode === 'spread') toSpread(spreadOf(r.idx) + 1);
    else toPage(r.idx + 1);
  }
  function prev() {
    const r = R;
    if (!r || atStart()) return;
    if (r.mode === 'spread') toSpread(spreadOf(r.idx) - 1);
    else toPage(r.idx - 1);
  }
  function goTo(i) {
    const r = R;
    if (!r) return;
    i = clamp(i | 0, 0, r.n - 1);
    if (r.mode === 'spread') {
      if (spreadOf(i) !== spreadOf(r.idx)) toSpread(spreadOf(i), i);
      else { r.idx = i; syncChrome(); }
    } else if (i !== r.idx) toPage(i);
  }
  function toSpread(ns, focusIdx) {
    const r = R;
    if (r.anim) r.anim.finish();
    const os = spreadOf(r.idx);
    if (ns === os) return;
    const pr = spreadPages(ns);
    r.idx = focusIdx != null ? focusIdx : pr[0] != null ? pr[0] : pr[1];
    syncChrome();
    flip(os, ns);
  }
  function toPage(ni) {
    const r = R;
    if (r.anim) r.anim.finish();
    const oi = r.idx;
    if (ni === oi) return;
    r.idx = ni;
    syncChrome();
    if (r.mode === 'flow') slideFlow(oi, ni);
    else turn(oi, ni);
  }

  // ---- animations ----
  /** runs WAAPI animations with a timeout fallback (hidden tabs may never finish them); done() settles the DOM */
  function runAnim(r, anims, dur, done) {
    let over = false;
    const st = {};
    const t = setTimeout(() => st.finish(), dur + DUR.grace);
    st.finish = () => {
      if (over) return;
      over = true;
      clearTimeout(t);
      anims.forEach(a => { try { a.cancel(); } catch (e) { /* already gone */ } });
      if (r.anim === st) r.anim = null;
      done();
    };
    r.anim = st;
    Promise.all(anims.map(a => a.finished)).then(st.finish, st.finish);
  }
  function shadeEl(bg) {
    const d = document.createElement('div');
    d.className = 'mg-shade';
    if (bg) d.style.background = bg;
    return d;
  }
  /** prefers-reduced-motion: the old view fades out over the new one */
  function crossfade(apply) {
    const r = R;
    const old = r.book;
    if (!canAnimate) { apply(); return; }
    const nb = old.cloneNode(false);
    nb.style.cursor = '';
    old.style.position = 'absolute';
    old.style.left = old.offsetLeft + 'px';
    old.style.top = old.offsetTop + 'px';
    old.style.margin = '0';
    old.style.zIndex = '5';
    old.style.pointerEvents = 'none';
    old.setAttribute('aria-hidden', 'true');
    r.stage.insertBefore(nb, old);
    r.book = nb;
    apply();
    const a = old.animate([{ opacity: 1 }, { opacity: 0 }], { duration: DUR.fade, easing: 'ease', fill: 'forwards' });
    runAnim(r, [a], DUR.fade, () => old.remove());
  }
  function fillSpread(ns) {
    const book = R.book, pr = spreadPages(ns);
    book.textContent = '';
    book.classList.toggle('solo', ns === 0);
    book.appendChild(mkSlot('lft', pr[0]));
    book.appendChild(mkSlot('rgt', pr[1]));
    fitVisible();
  }

  /** spread mode: the 3D page flip. Forward: the right page lifts and lands on the left; backward: the mirror image. */
  function flip(os, ns) {
    const r = R, book = r.book;
    if (!canAnimate || reducedMotion()) { crossfade(() => fillSpread(ns)); return; }
    const slotL = book.querySelector('.mg-slot.lft'), slotR = book.querySelector('.mg-slot.rgt');
    if (!slotL || !slotR) { fillSpread(ns); return; }
    const fwd = ns > os;
    const np = spreadPages(ns);
    const leaf = document.createElement('div');
    leaf.className = 'mg-leaf ' + (fwd ? 'rgt' : 'lft');
    leaf.setAttribute('aria-hidden', 'true');
    const front = document.createElement('div'), back = document.createElement('div');
    front.className = 'mg-lf front';
    back.className = 'mg-lf back';
    const src = fwd ? slotR : slotL;
    const frontPage = src.firstElementChild;
    const backIdx = fwd ? np[0] : np[1];
    const backPage = backIdx != null ? pageEl(backIdx) : null;
    // the page that will be uncovered goes in underneath right away
    src.textContent = '';
    const under = fwd ? np[1] : np[0];
    if (under != null) src.appendChild(pageEl(under));
    if (frontPage) front.appendChild(frontPage);
    if (backPage) back.appendChild(backPage);
    const shF = shadeEl(), shB = shadeEl();
    front.appendChild(shF);
    back.appendChild(shB);
    leaf.appendChild(front);
    leaf.appendChild(back);
    book.appendChild(leaf);
    const shR = shadeEl(), shL = shadeEl('linear-gradient(270deg, rgba(0,0,0,.5), rgba(0,0,0,.08) 60%, rgba(0,0,0,.25))');
    slotR.appendChild(shR);
    slotL.appendChild(shL);
    if (src.firstElementChild) fitEl(r.B, src.firstElementChild, r.u, true);
    if (backPage) fitEl(r.B, backPage, r.u, true);
    const opt = { duration: DUR.flip, easing: 'cubic-bezier(.42,.05,.26,1)', fill: 'forwards' };
    const revealed = fwd ? shR : shL, covered = fwd ? shL : shR;
    const anims = [
      leaf.animate([{ transform: 'rotateY(0deg)' }, { transform: `rotateY(${fwd ? -180 : 180}deg)` }], opt),
      shF.animate([{ opacity: 0 }, { opacity: 0.5, offset: 0.5 }, { opacity: 0.5 }], opt),
      shB.animate([{ opacity: 0.5 }, { opacity: 0.5, offset: 0.5 }, { opacity: 0 }], opt),
      revealed.animate([{ opacity: 0.65 }, { opacity: 0, offset: 0.62 }, { opacity: 0 }], opt),
      covered.animate([{ opacity: 0 }, { opacity: 0, offset: 0.4 }, { opacity: 0.5 }], opt),
    ];
    if (os === 0 || ns === 0) {
      // the cover sits alone on the right: slide the book as it opens or closes
      book.classList.remove('solo');
      anims.push(book.animate([{ transform: os === 0 ? 'translateX(-25%)' : 'translateX(0)' }, { transform: ns === 0 ? 'translateX(-25%)' : 'translateX(0)' }], opt));
    }
    runAnim(r, anims, DUR.flip, () => {
      const dst = fwd ? slotL : slotR;
      dst.textContent = '';
      if (backPage) dst.appendChild(backPage);
      leaf.remove();
      shR.remove();
      shL.remove();
      book.classList.toggle('solo', ns === 0);
    });
  }

  /** single mode: the page turns on its spine (forward) or swings back into place (backward) */
  function turn(oi, ni) {
    const r = R, book = r.book;
    const cur = book.querySelector('.mg-slot.one');
    if (!cur || !canAnimate || reducedMotion()) {
      crossfade(() => { R.book.textContent = ''; R.book.appendChild(mkSlot('one', ni)); fitVisible(); });
      return;
    }
    const fwd = ni > oi;
    const nx = mkSlot('one', ni);
    const turning = fwd ? cur : nx, under = fwd ? nx : cur;
    under.classList.add('under');
    if (fwd) book.insertBefore(nx, cur); else book.appendChild(nx);
    turning.classList.add('turning');
    fitEl(r.B, nx.firstElementChild, r.u, true);
    const shT = shadeEl('rgba(0,0,0,.55)'), shU = shadeEl('linear-gradient(90deg, rgba(0,0,0,.08), rgba(0,0,0,.45))');
    turning.appendChild(shT);
    under.appendChild(shU);
    const opt = { duration: DUR.turn, easing: fwd ? 'cubic-bezier(.45,.02,.75,.5)' : 'cubic-bezier(.25,.5,.55,1)', fill: 'forwards' };
    const anims = [
      turning.animate(fwd ? [{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(-92deg)' }] : [{ transform: 'rotateY(-92deg)' }, { transform: 'rotateY(0deg)' }], opt),
      shT.animate(fwd ? [{ opacity: 0 }, { opacity: 0.6 }] : [{ opacity: 0.6 }, { opacity: 0 }], opt),
      shU.animate(fwd ? [{ opacity: 0.6 }, { opacity: 0 }] : [{ opacity: 0 }, { opacity: 0.6 }], opt),
    ];
    runAnim(r, anims, DUR.turn, () => {
      cur.remove();
      nx.classList.remove('under', 'turning');
      shT.remove();
      shU.remove();
    });
  }

  /** flow mode: the page slides out, the next one slides in at the top */
  function slideFlow(oi, ni) {
    const r = R, book = r.book;
    const cur = book.querySelector('.mg-slot.one');
    const fwd = ni > oi;
    const swap = () => {
      book.textContent = '';
      const s = mkSlot('one', ni);
      book.appendChild(s);
      r.stage.scrollTop = 0;
      fitVisible();
      return s;
    };
    if (!cur || !canAnimate) { swap(); return; }
    if (reducedMotion()) { swap().animate([{ opacity: 0 }, { opacity: 1 }], { duration: DUR.fade, easing: 'ease' }); return; }
    const dx = fwd ? -36 : 36;
    const a = cur.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateX(${dx}px)` }], { duration: DUR.slide, easing: 'ease-in', fill: 'forwards' });
    runAnim(r, [a], DUR.slide, () => {
      if (R !== r) return;
      swap().animate([{ opacity: 0, transform: `translateX(${-dx}px)` }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'cubic-bezier(.2,.7,.3,1)' });
    });
  }

  // ---- thumbnails ----
  function toggleStrip(force, noLayout) {
    const r = R;
    if (!r) return;
    const open = force != null ? !!force : !r.stripOpen;
    if (open === r.stripOpen && open === !r.strip.hidden) return;
    r.stripOpen = open;
    if (open && !r.thumbs.length) buildStrip();
    r.strip.hidden = !open;
    r.btnThumbs.setAttribute('aria-expanded', String(open));
    if (!noLayout && r.mode && r.mode !== 'flow') layout(false); // make (or give back) room for the strip
    if (open) { syncChrome(); scrollThumb(r.mode === 'spread' ? spreadPages(spreadOf(r.idx)).filter(x => x != null)[0] : r.idx, true); }
  }
  /** the strip's buttons come at once; their live miniatures are printed a few at a time so the reader stays snappy */
  function buildStrip() {
    const r = R, B = r.B;
    r.stripIn.innerHTML = B.pages.map((p, i) => `<button type="button" class="mg-th" data-go="${i + 1}" aria-label="${T(`Page ${i + 1}: ${p.title || ''}`)}"><span class="mg-th-page" aria-hidden="true" inert><span class="mg-th-scale" style="--pw:400px"></span></span><span class="mg-th-n">${i + 1}<small> ${T(p.title)}</small></span></button>`).join('');
    r.thumbs = Array.from(r.stripIn.children);
    let i = 0;
    const fill = () => {
      if (R !== r) return;
      const t0 = Date.now();
      while (i < r.n && Date.now() - t0 < 12) {
        const box = r.thumbs[i].querySelector('.mg-th-scale');
        box.innerHTML = uniq(B.pageHTML(i));
        applyFit(box.firstElementChild, B.fit[i]);
        i++;
      }
      if (i < r.n) later(fill, 16);
    };
    fill();
  }
  function scrollThumb(i, instant) {
    const r = R, t = r && r.thumbs[i];
    if (!t || r.strip.hidden) return;
    const box = r.stripIn;
    const left = Math.max(0, t.offsetLeft - (box.clientWidth - t.offsetWidth) / 2);
    if (Math.abs(box.scrollLeft - left) < 2) return;
    if (instant || reducedMotion() || typeof box.scrollTo !== 'function') box.scrollLeft = left;
    else box.scrollTo({ left, behavior: 'smooth' });
  }
  /** fit every page in the background (offscreen) so flips and thumbnails never wait */
  function warm() {
    const r = R;
    if (!r || r.mode === 'flow') return;
    const u = r.u;
    let i = 0;
    const step = () => {
      if (R !== r || r.u !== u || r.mode === 'flow') return;
      while (i < r.n && r.B.fit[i] && Math.abs(r.B.fit[i].u - u) < 0.3) i++;
      if (i >= r.n) { dropMeasure(); return; }
      const box = measureBox(u);
      box.innerHTML = uniq(r.B.pageHTML(i));
      fitEl(r.B, box.firstElementChild, u, true);
      box.textContent = '';
      if (r.thumbs[i]) applyFit(r.thumbs[i].querySelector('.mg-page'), r.B.fit[i]);
      i++;
      later(step, 30);
    };
    later(step, 120);
  }
  function later(fn, ms) {
    const r = R;
    const t = setTimeout(() => { r.timers.delete(t); fn(); }, ms);
    r.timers.add(t);
  }

  // ---- reading mode ----
  function toggleReading() {
    const r = R;
    if (!r) return;
    r.reading = !r.reading;
    writePref(r.reading);
    r.btnRead.classList.toggle('on', r.reading);
    r.btnRead.setAttribute('aria-pressed', String(r.reading));
    layout(true);
    warm();
  }

  // ---- input ----
  function edgeZone(pg, x) {
    const slot = pg.parentElement;
    const rc = pg.getBoundingClientRect();
    const zone = Math.max(36, rc.width * 0.1), dx = x - rc.left;
    const isL = slot.classList.contains('lft'), isR = slot.classList.contains('rgt');
    if (dx < zone && !isR && !atStart()) return -1;
    if (dx > rc.width - zone && !isL && !atEnd()) return 1;
    return 0;
  }
  function onHover(e) {
    const r = R;
    if (!r || r.mode === 'flow') return;
    const t = e.target;
    const pg = t.closest && t.closest('.mg-slot > .mg-page');
    const hot = !!pg && !t.closest('a, button') && edgeZone(pg, e.clientX) !== 0;
    const want = hot ? 'pointer' : '';
    if (r.book.style.cursor !== want) r.book.style.cursor = want;
  }
  function onClick(e) {
    const r = R;
    if (!r) return;
    const t = e.target;
    const act = t.closest('[data-mg]');
    if (act && r.el.contains(act)) {
      const a = act.dataset.mg;
      if (a === 'prev') prev();
      else if (a === 'next') next();
      else if (a === 'close') close(false);
      else if (a === 'thumbs') toggleStrip();
      else if (a === 'reading') toggleReading();
      return;
    }
    const go = t.closest('[data-go]');
    if (go && r.el.contains(go)) {
      e.preventDefault();
      const thumb = go.classList.contains('mg-th');
      goTo(+go.dataset.go - 1);
      if (thumb && (!largeScreen() || r.mode === 'flow')) toggleStrip(false);
      return;
    }
    if (r.mode === 'flow') return;
    const pg = t.closest('.mg-slot > .mg-page');
    if (pg && !t.closest('a, button')) {
      const z = edgeZone(pg, e.clientX);
      if (z < 0) prev(); else if (z > 0) next();
    }
  }
  function modalUp() {
    const m = document.getElementById('modals');
    return !!((m && m.children.length) || document.querySelector('.loading-cover'));
  }
  function flowScroll(dir, amount) {
    const st = R.stage;
    const max = st.scrollHeight - st.clientHeight;
    if (amount === 'page') {
      if (dir > 0 && st.scrollTop >= max - 4) { next(); return; }
      if (dir < 0 && st.scrollTop <= 4) { prev(); return; }
      amount = st.clientHeight * 0.86;
    }
    const top = clamp(st.scrollTop + dir * amount, 0, max);
    if (typeof st.scrollTo === 'function') st.scrollTo({ top, behavior: reducedMotion() ? 'auto' : 'smooth' }); else st.scrollTop = top;
  }
  function onKey(e) {
    const r = R;
    if (!r || modalUp()) return;
    const k = e.key;
    if (k === 'Tab') { e.stopPropagation(); trapTab(e); return; }
    if (k === 'Escape' || k === 'Esc') { e.stopPropagation(); e.preventDefault(); close(false); return; }
    if (e.altKey || e.ctrlKey || e.metaKey) return; // app shortcuts (Ctrl+S saves) keep working
    const t = e.target;
    const onControl = !!(t && t.closest && t.closest('button, a[href], input, select, textarea'));
    const flow = r.mode === 'flow';
    switch (k) {
      case 'ArrowRight': case 'Right': next(); break;
      case 'ArrowLeft': case 'Left': prev(); break;
      case 'ArrowDown': case 'Down': if (!flow) return; flowScroll(1, 72); break;
      case 'ArrowUp': case 'Up': if (!flow) return; flowScroll(-1, 72); break;
      case 'PageDown': if (flow) flowScroll(1, 'page'); else next(); break;
      case 'PageUp': if (flow) flowScroll(-1, 'page'); else prev(); break;
      case ' ': case 'Spacebar':
        if (onControl) return;
        if (flow) flowScroll(e.shiftKey ? -1 : 1, 'page'); else if (e.shiftKey) prev(); else next();
        break;
      case 'Home': goTo(0); break;
      case 'End': goTo(r.n - 1); break;
      case 't': case 'T': toggleStrip(); break;
      case 'r': case 'R': toggleReading(); break;
      default: return;
    }
    e.preventDefault();
    e.stopPropagation(); // handled here: the screen underneath must not react as well
  }
  function focusables() {
    return Array.from(R.el.querySelectorAll('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'))
      .filter(x => !x.closest('[inert], .mg-leaf, [aria-hidden="true"]') && x.getClientRects().length);
  }
  function trapTab(e) {
    const r = R, list = focusables();
    if (!list.length) { e.preventDefault(); r.el.focus(); return; }
    const first = list[0], last = list[list.length - 1], a = document.activeElement;
    const inside = r.el.contains(a) && a !== r.el;
    if (e.shiftKey) { if (!inside || a === first) { e.preventDefault(); last.focus(); } } else if (!inside || a === last) { e.preventDefault(); first.focus(); }
  }
  function onFocusIn(e) {
    const r = R;
    if (!r) return;
    const t = e.target;
    if (r.el.contains(t) || (t.closest && t.closest('#modals, #toasts, .loading-cover'))) return;
    try { r.el.focus({ preventScroll: true }); } catch (err) { r.el.focus(); }
  }
  function onTouchStart(e) {
    const r = R;
    if (!r) return;
    if (e.touches.length !== 1) { r.sw = null; return; }
    const t = e.touches[0];
    r.sw = { x: t.clientX, y: t.clientY, t: Date.now() };
  }
  function onTouchEnd(e) {
    const r = R;
    if (!r || !r.sw) return;
    const s = r.sw, t = e.changedTouches && e.changedTouches[0];
    r.sw = null;
    if (!t) return;
    const dx = t.clientX - s.x, dy = t.clientY - s.y;
    if (Math.abs(dx) >= 48 && Math.abs(dx) > Math.abs(dy) * 1.4 && Date.now() - s.t < 900) { if (dx < 0) next(); else prev(); }
  }

  // ---------------------------------------------------------------------------
  // The 'magazine' screen: the issue on a shelf, every page as a live miniature
  // ---------------------------------------------------------------------------
  function readLabel(mag) {
    const lp = +mag.lastPage || 0;
    return mag.seen && lp > 1 ? `📖 Continue reading (page ${lp})` : '📖 Read the issue';
  }
  let landRO = null;
  function renderLanding(root) {
    const UI = PBC.UI, S = UI && UI.S;
    if (!S || typeof M.ensure !== 'function') { root.innerHTML = '<div class="page"><div class="empty">The preview magazine is not available.</div></div>'; return; }
    const mag = M.ensure(S);
    const B = new Book(S, mag);
    const cw = window.innerWidth < 520 ? 210 : 250;
    root.innerHTML = `<div class="page mg-landing">
      <div class="page-h"><div><h1>Preview Magazine</h1><div class="sub">${esc(mag.mast || 'COURTSIDE')} · ${esc(mag.seasonName || '')} Season Preview · ${esc(mag.league || '')} · ${B.n} pages</div></div>
        <div class="actions"><button type="button" class="btn primary" data-mg-land="read">${readLabel(mag)}</button></div></div>
      <div class="mg-shelf">
        <div class="mg-shelf-cover" role="button" tabindex="0" data-mg-page="1" aria-label="Open the magazine at the cover"><span class="mg-mini" style="width:${cw}px;height:${Math.round(cw * RATIO)}px" aria-hidden="true" inert><span class="mg-mini-s" style="--pw:400px;transform:scale(${(cw / 400).toFixed(4)})">${uniq(B.pageHTML(0))}</span></span></div>
        <div class="mg-shelf-grid">${B.pages.slice(1).map((p, j) => `<div class="mg-shelf-p" role="button" tabindex="0" data-mg-page="${j + 2}" aria-label="${T(`Open page ${j + 2}: ${p.title || ''}`)}"><span class="mg-mini" style="aspect-ratio:3/4" aria-hidden="true" inert><span class="mg-mini-s" style="--pw:400px">${uniq(B.pageHTML(j + 1))}</span></span><span><b>${j + 2}</b>${T(p.title)}</span></div>`).join('')}</div>
      </div></div>`;
    const scale = () => root.querySelectorAll('.mg-shelf-grid .mg-mini').forEach(m => {
      const s = m.firstElementChild;
      if (s && m.clientWidth) s.style.transform = `scale(${(m.clientWidth / 400).toFixed(4)})`;
    });
    scale();
    if (landRO) landRO.disconnect();
    if (typeof ResizeObserver === 'function') { landRO = new ResizeObserver(scale); landRO.observe(root.querySelector('.mg-shelf-grid')); }
    // fit each miniature's type a few pages at a time (cached per issue, shared with the reader)
    const els = Array.from(root.querySelectorAll('.mg-mini .mg-page'));
    let j = 0;
    const step = () => {
      if (!root.isConnected) return;
      const t0 = Date.now();
      while (j < els.length && Date.now() - t0 < 12) fitEl(B, els[j++], 4, false);
      if (j < els.length) setTimeout(step, 0);
    };
    step();
    UI.on(root, 'click', '[data-mg-page]', (e, el) => M.open(S, { page: +el.dataset.mgPage }));
    UI.on(root, 'keydown', '[data-mg-page]', (e, el) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); M.open(S, { page: +el.dataset.mgPage }); } });
    UI.on(root, 'click', '[data-mg-land="read"]', () => M.open(S));
  }

  // ---------------------------------------------------------------------------
  // Registration: the screen right away (or once js/ui/core.js is there), the nav link on DOMContentLoaded so it
  // lands at the end of the League group, after the app's own links.
  // ---------------------------------------------------------------------------
  let registered = false, navAdded = false;
  function registerScreen() {
    const UI = PBC.UI;
    if (registered || !UI || typeof UI.register !== 'function') return;
    registered = true;
    UI.register('magazine', {
      title: 'Preview Magazine',
      render: renderLanding,
      onLeave() { if (landRO) { landRO.disconnect(); landRO = null; } },
    });
  }
  function addNav() {
    const UI = PBC.UI;
    if (navAdded || !UI || typeof UI.addNav !== 'function') return;
    navAdded = true;
    UI.addNav({ key: 'magazine', label: 'Preview Mag', icon: '📰', group: 'League', show: S => !!(S && S.teams && S.teams.length) });
  }
  registerScreen();
  const boot = () => { registerScreen(); addNav(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else setTimeout(boot, 0);
})();
