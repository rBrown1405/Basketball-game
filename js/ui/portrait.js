/* Pro BBALL Coach — detailed pixel-art player portraits (PBC.Portrait, UI.avatar, UI.portrait).
 * Every portrait is painted procedurally at 64×64 like a hand-made sprite: a material buffer (skin, hair, jersey,
 * eyes, lips...) with per-pixel shading bands from a top-left key light, hue-shifted colour ramps, selective dark
 * outlines, cheekbones / jawline / nose modelling, 16 hairstyles, beards and stubble, headbands, tattoos, the team
 * jersey with collar trim and number, and a facial expression that comes from the player's personality
 * (PBC.Persona): a wholesome smile, a smirk, a cocky raised brow, a mean mug, stone cold, fired up... (the player
 * editor can override it). Each look is rendered once, cached as a data URL and scaled with crisp pixels. */
(function () {
  'use strict';
  const PBC = window.PBC;
  const U = PBC.U;
  const N = 64;

  // ------------------------------------------------------------ colour helpers
  const hex = c => { const r = U.hexToRgb(c); return [r.r, r.g, r.b]; };
  const mixA = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const clampC = a => [Math.max(0, Math.min(255, Math.round(a[0]))), Math.max(0, Math.min(255, Math.round(a[1]))), Math.max(0, Math.min(255, Math.round(a[2])))];
  /** 5-step ramp with hue-shifted shadows (toward plum) and highlights (toward warm light): [deep, shadow, base, light, highlight] */
  function ramp(base, o) {
    o = o || {};
    const b = Array.isArray(base) ? base : hex(base);
    const cool = o.cool || [58, 28, 62], warm = o.warm || [255, 244, 214];
    return [
      clampC(mixA(mul(b, o.dk || 0.45), cool, 0.32)),
      clampC(mixA(mul(b, o.sk || 0.74), cool, 0.12)),
      clampC(b),
      clampC(mixA(b, warm, o.lk || 0.2)),
      clampC(mixA(b, warm, o.hk || 0.42)),
    ];
  }
  const lum = c => (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255;
  function hash(x, y, s) { let h = (x * 374761393 + y * 668265263 + (s | 0) * 1442695041) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const bayer = (x, y) => BAYER[(y & 3) * 4 + (x & 3)] / 16;

  // 3×5 digits (jersey numbers)
  const DIG = {
    0: ['111', '101', '101', '101', '111'], 1: ['010', '110', '010', '010', '111'], 2: ['111', '001', '111', '100', '111'],
    3: ['111', '001', '111', '001', '111'], 4: ['101', '101', '111', '001', '001'], 5: ['111', '100', '111', '001', '111'],
    6: ['111', '100', '111', '101', '111'], 7: ['111', '001', '001', '010', '010'], 8: ['111', '101', '111', '101', '111'], 9: ['111', '101', '111', '001', '111'],
  };

  // materials
  const E = 0, SKIN = 1, HAIR = 2, JER = 3, TRIM = 4, NUM = 5, WHITE = 6, IRIS = 7, DARK = 8, LIP = 9, TEETH = 10, MOUTH = 11, BROW = 12, BEARD = 13, BAND = 14, INK = 15, NUMO = 16, EAR = 17, BACKHAIR = 18, STUB = 19, LASH = 20;

  const EXPR = {
    smile: { brow: 'soft', eyes: 'soft', mouth: 'smile', cheeks: 1 },
    grin: { brow: 'up', eyes: 'happy', mouth: 'grin', cheeks: 2 },
    smirk: { brow: 'oneUp', eyes: 'normal', mouth: 'smirk', cheeks: 0 },
    cocky: { brow: 'cocky', eyes: 'lidded', mouth: 'smirk', look: 1 },
    neutral: { brow: 'flat', eyes: 'normal', mouth: 'flat' },
    focused: { brow: 'low', eyes: 'lidded', mouth: 'press' },
    intense: { brow: 'angry', eyes: 'lidded', mouth: 'frownSoft' },
    mean: { brow: 'angry', eyes: 'squint', mouth: 'frown' },
    serious: { brow: 'heavy', eyes: 'lidded', mouth: 'flat' },
    fired: { brow: 'angry', eyes: 'wide', mouth: 'yell' },
    annoyed: { brow: 'annoyed', eyes: 'lidded', mouth: 'side', look: -1 },
  };

  function paint(p, opts) {
    opts = opts || {};
    const lk = (p && p.look) || {};
    const fem = p && p.gender === 'f';
    const build = U.clamp(lk.build == null ? 0.5 : lk.build, 0, 1);
    const face = opts.face || (PBC.Persona ? PBC.Persona.face(p, opts.ctx) : 'neutral');
    const X_ = EXPR[face] || EXPR.neutral;
    const seed = U.hash(String(p && p.id != null ? p.id : (p && p.last) || 'x'));
    // the same feature set drives the in-game model (PBC.Identity): face shape, eyes, nose, lips, ears...
    const F = PBC.Identity ? PBC.Identity.features(p) : null;
    const ft = (k, d) => (F && F[k] != null ? F[k] : d == null ? 0.5 : d);
    const m = new Uint8Array(N * N), l = new Uint8Array(N * N);
    const idx = (x, y) => y * N + x;
    const inb = (x, y) => x >= 0 && y >= 0 && x < N && y < N;
    const set = (x, y, mat, lvl) => { x |= 0; y |= 0; if (!inb(x, y)) return; m[idx(x, y)] = mat; l[idx(x, y)] = lvl == null ? 2 : Math.max(0, Math.min(4, lvl)); };
    const setOn = (x, y, mat, lvl, only) => { x |= 0; y |= 0; if (!inb(x, y)) return; if (only.indexOf(m[idx(x, y)]) < 0) return; set(x, y, mat, lvl); };
    const get = (x, y) => (inb(x, y) ? m[idx(x, y)] : E);
    const lv = (x, y) => (inb(x, y) ? l[idx(x, y)] : 0);
    const LX = -0.46, LY = -0.55, LZ = 0.7; // key light: top-left, toward the viewer
    const lit = (nx, ny, nz, b) => { const i = LX * nx + LY * ny + LZ * nz + (b || 0); return i > 0.8 ? 4 : i > 0.56 ? 3 : i > 0.22 ? 2 : i > -0.12 ? 1 : 0; };

    // ---------------- geometry (head fills the frame like a media-day headshot)
    const cx = 32;
    const faceLen = ft('faceLen'), jawF = ft('jaw'), chinF = ft('chin'), cheekF = ft('cheek'), foreF = ft('forehead');
    const crx = 14.2 + build * 1.2 - (fem ? 0.7 : 0) - (faceLen - 0.5) * 2.2, cry = 15.6 + (faceLen - 0.5) * 2.4 + (foreF - 0.5) * 1.2, ccy = 24 - (foreF - 0.5) * 0.8;
    const jrx = 12.4 + build * 1.9 - (fem ? 1.3 : 0) + (jawF - 0.5) * 3.6 - (faceLen - 0.5) * 1.2, jry = 11.6 - (fem ? 0.5 : 0) + (chinF - 0.5) * 2.6 + (faceLen - 0.5) * 2.2, jcy = 33.4 + (faceLen - 0.5) * 1.4;
    const inCran = (x, y, t) => { const X = x + 0.5 - cx, Y = y + 0.5 - ccy; t = t || 0; return (X * X) / ((crx + t) ** 2) + (Y * Y) / ((cry + t) ** 2) <= 1; };
    const inJaw = (x, y) => { const X = x + 0.5 - cx, Y = y + 0.5 - jcy; return (X * X) / (jrx * jrx) + (Y * Y) / (jry * jry) <= 1; };
    const inFace = (x, y) => inCran(x, y) || (inJaw(x, y) && y + 0.5 > ccy);
    // the face gets its own softer key light so the planes read left (lit) → centre → right (shade) without a hard split
    const faceLevel = (x, y) => {
      const nx = (x + 0.5 - cx) / (crx + 1.2), ny = (y + 0.5 - 29) / 19;
      const nz = Math.sqrt(1 - Math.min(0.97, nx * nx + ny * ny));
      const i = -0.6 * nx - 0.36 * ny + 0.72 * nz + (bayer(x, y) - 0.5) * 0.06;
      return i > 0.95 ? 4 : i > 0.78 ? 3 : i > 0.26 ? 2 : i > -0.12 ? 1 : 0;
    };
    // hairline: higher forehead / receding temples come from the feature set
    const hlF = ft('hairline');
    const hairline = x => 14.6 - (foreF - 0.5) * 3 + (0.018 + hlF * 0.02) * (x + 0.5 - cx) ** 2 + (hlF > 0.8 ? Math.max(0, 4 - Math.abs(Math.abs(x + 0.5 - cx) - 9)) * 0.6 : 0);
    const nw = (fem ? 5.2 : 6.2) + build * 2.4 + (ft('neck') - 0.5) * 2.4;
    const strap = 17 + build * 2.5 + (ft('musc') - 0.5) * 2;
    const eyeY = 30 + Math.round((faceLen - 0.5) * 2), my = 41 + Math.round((faceLen - 0.5) * 3 + (ft('noseL') - 0.5) * 1);
    const eyeSp = Math.round((ft('eyeSpace') - 0.5) * 2.4);
    const eyeL = cx - 8 - eyeSp, eyeR = cx + 3 + eyeSp; // left edges of the 5 px eyes
    const eyeW = ft('eyeSize') > 0.78 ? 6 : ft('eyeSize') < 0.22 ? 4 : 5;
    const eyeTilt = ft('eyeTilt') > 0.75 ? -1 : ft('eyeTilt') < 0.25 ? 1 : 0; // -1: outer corners up

    const hs = lk.hair || (fem ? 'ponytail' : 'fade');
    const beard = fem ? 'none' : (lk.beard || 'none');

    // ---------------- back hair (behind the head and shoulders)
    if (hs === 'afro') {
      for (let y = 0; y < 38; y++) for (let x = 2; x < 62; x++) {
        const X = x + 0.5 - cx, Y = y + 0.5 - 20;
        const r = 23 + build + (hash(x >> 1, y >> 1, seed) - 0.5) * 2;
        if (X * X + Y * Y <= r * r) { const nx = X / r, ny = Y / r; set(x, y, BACKHAIR, lit(nx, ny, Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny)), -0.08) - (hash(x, y, seed + 3) < 0.3 ? 1 : 0)); }
      }
    } else if (hs === 'puffs') {
      for (const [px, py] of [[17, 9], [47, 9]]) for (let y = 0; y < 22; y++) for (let x = px - 10; x <= px + 10; x++) {
        const X = x + 0.5 - px, Y = y + 0.5 - py, r = 8.4 + (hash(x, y, seed) - 0.5);
        if (X * X + Y * Y <= r * r) set(x, y, BACKHAIR, lit(X / r, Y / r, 0.6) - (hash(x, y, seed + 5) < 0.3 ? 1 : 0));
      }
    } else if (hs === 'bun') {
      for (let y = 0; y < 13; y++) for (let x = 24; x < 41; x++) { const X = x + 0.5 - cx, Y = y + 0.5 - 6; if (X * X + Y * Y <= 40) set(x, y, BACKHAIR, lit(X / 6.3, Y / 6.3, 0.6) + ((x + y) % 5 === 0 ? 1 : 0)); }
    } else if (hs === 'long' || hs === 'locs' || hs === 'bob') {
      const bottom = hs === 'bob' ? 46 : 62;
      for (let y = 12; y < bottom; y++) for (let x = 11; x < 53; x++) {
        const X = x + 0.5 - cx;
        const w = (hs === 'bob' ? 18.5 : 18) + (y > 38 ? (y - 38) * 0.18 : 0);
        if (Math.abs(X) > w) continue;
        if (hs === 'locs' && x % 3 === 0 && hash(x, 0, seed) < 0.5) continue;
        set(x, y, BACKHAIR, Math.abs(X) > w - 3 ? 1 : (hash(x, y >> 2, seed) < 0.3 ? 1 : 2));
      }
    } else if (hs === 'ponytail') {
      for (let y = 18; y < 52; y++) for (let x = 42; x < 56; x++) { const X = x - 48 - (y - 18) * 0.06, w = 3.8 - Math.abs(y - 32) * 0.05; if (Math.abs(X) <= w) set(x, y, BACKHAIR, (X < 0 ? 2 : 1) + ((y + x) % 4 === 0 ? 1 : 0)); }
    } else if (hs === 'braids' && hash(1, 1, seed) < 0.55) {
      for (let y = 26; y < 56; y++) for (const bx of [14, 16, 18, 46, 48, 50]) set(bx, y, BACKHAIR, (y + bx) % 3 === 0 ? 1 : 2);
    }

    // ---------------- torso, jersey, shoulders
    const trx = 31 + build * 3.5, tcy = 74, try_ = 24;
    for (let y = 44; y < N; y++) for (let x = 0; x < N; x++) {
      const X = x + 0.5 - cx, Y = y + 0.5 - tcy;
      if ((X * X) / (trx * trx) + (Y * Y) / (try_ * try_) > 1) continue;
      const armhole = Math.abs(X) > strap && y < 63;
      if (armhole) {
        // round deltoid shading
        const s = Math.sign(X), dx = (Math.abs(X) - strap - 6) / 8, dy = (y + 0.5 - 58) / 9;
        const d = Math.min(0.97, dx * dx + dy * dy);
        set(x, y, SKIN, lit(dx * s, dy, Math.sqrt(1 - d), s < 0 ? 0.12 : -0.05));
      } else {
        const nx = X / trx;
        set(x, y, JER, lit(nx, -0.3, Math.sqrt(Math.max(0, 1 - nx * nx)), 0.06));
      }
    }
    // neck with muscle shading
    for (let y = 38; y < 58; y++) for (let x = Math.floor(cx - nw - 5); x <= Math.ceil(cx + nw + 5); x++) {
      const X = x + 0.5 - cx, flare = y > 49 ? (y - 49) * 0.9 : 0;
      if (Math.abs(X) > nw + flare) continue;
      let v = X < -nw * 0.4 ? 3 : X > nw * 0.45 ? 1 : 2;
      if (y > 48 && Math.abs(Math.abs(X) - nw * 0.55) < 0.6) v = Math.max(1, v - 1);
      set(x, y, SKIN, v);
    }
    // round collar + trim
    const nkx = nw + 3.6 + build, nky = 6.2, nkcy = 51.5;
    for (let y = 44; y < 62; y++) for (let x = 10; x < 54; x++) {
      const X = x + 0.5 - cx, Y = y + 0.5 - nkcy;
      const d = (X * X) / (nkx * nkx) + (Y * Y) / (nky * nky);
      if (d <= 1 && get(x, y) === JER) set(x, y, SKIN, Math.abs(X) < nw ? (Y > 2 ? 1 : 2) : 2);
      else if (d <= 1.42 && get(x, y) === JER) set(x, y, TRIM, Y > 0 ? 2 : 3);
    }
    // armhole piping
    for (let y = 44; y < 64; y++) for (let x = 0; x < N; x++) {
      if (get(x, y) !== JER) continue;
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => get(x + dx, y + dy) === SKIN && Math.abs(x + dx + 0.5 - cx) > strap - 0.5)) set(x, y, TRIM, 2);
    }
    // tattoos: tribal bands on the shoulders, a piece peeking over the collar
    const tat = lk.tattoo || 'none';
    if (tat !== 'none') {
      for (let y = 48; y < 64; y++) for (let x = 0; x < N; x++) {
        if (get(x, y) !== SKIN) continue;
        const X = x + 0.5 - cx;
        const arm = Math.abs(X) > strap, chest = Math.abs(X) < nkx - 1 && y > nkcy + 1;
        let ink = false;
        if (arm && (tat === 'sleeve' || (tat === 'arms' && X > 0))) {
          const u = (Math.abs(X) - strap) + y * 0.6;
          ink = (Math.floor(u) % 5 === 0) || (tat === 'sleeve' && (y % 6 === 0 || hash(x >> 1, y >> 1, seed + 9) < 0.18));
        } else if (chest && tat === 'chest') ink = (Math.abs(X) + (y - nkcy)) % 4 < 1.2 && Math.abs(X) > 1;
        if (ink) set(x, y, INK, Math.max(0, lv(x, y) - 1));
      }
    }
    // jersey number (small, on the chest)
    const num = String(p && p.num != null ? p.num : '').slice(-2);
    if (num) {
      const w = num.length * 4 - 1;
      let x0 = Math.round(cx - w / 2);
      for (const ch of num) {
        const gph = DIG[ch] || DIG[0];
        for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) if (gph[r][c] === '1') setOn(x0 + c, 58 + r, NUM, 2, [JER, TRIM]);
        x0 += 4;
      }
      for (let y = 56; y < N; y++) for (let x = 20; x < 44; x++) if (get(x, y) === JER && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => get(x + dx, y + dy) === NUM)) set(x, y, NUMO, 2);
    }

    // ---------------- ears + head
    for (const s of [-1, 1]) {
      const ex = cx + s * (crx + 0.3 + (ft('earSize') - 0.5) * 1.2), ey = eyeY + 1;
      const erx = 6.2 + (ft('earSize') - 0.5) * 5, ery = 16 + (ft('earSize') - 0.5) * 9;
      for (let y = ey - 7; y < ey + 8; y++) for (let x = Math.floor(ex - 4.5); x <= Math.ceil(ex + 4.5); x++) {
        const X = x + 0.5 - ex, Y = y + 0.5 - ey;
        if ((X * X) / erx + (Y * Y) / ery <= 1) set(x, y, EAR, s < 0 ? (X < -0.8 ? 3 : 2) : (X > 0.8 ? 1 : 2));
      }
      // inner ear shadow
      set(ex + s * 0.2, ey, EAR, 0); set(ex + s * 0.2, ey + 1, EAR, 1);
    }
    for (let y = 6; y < 48; y++) for (let x = 12; x < 52; x++) if (inFace(x, y)) set(x, y, SKIN, faceLevel(x, y));
    // face modelling: jawline, cheekbones, temples, chin, under-jaw shadow onto the neck
    for (let y = 30; y < 48; y++) for (let x = 12; x < 52; x++) {
      if (get(x, y) !== SKIN || !inFace(x, y)) continue;
      const edge = !inFace(x - 1, y) || !inFace(x + 1, y) || !inFace(x, y + 1);
      if (edge && y > 34) set(x, y, SKIN, Math.max(0, lv(x, y) - 1));
    }
    for (const s of [-1, 1]) {
      const bx = cx + s * 8 - (s > 0 ? 1 : 0);
      const nk = cheekF > 0.7 ? 4 : cheekF < 0.3 ? 2 : 3;
      for (let k = 0; k < nk; k++) { if (get(bx + s * k, eyeY + 4) === SKIN) set(bx + s * k, eyeY + 4, SKIN, s < 0 ? 4 : 2); if (cheekF > 0.3 && get(bx + s * k, eyeY + 6) === SKIN) set(bx + s * k, eyeY + 6, SKIN, Math.max(0, lv(bx + s * k, eyeY + 6) - (cheekF > 0.7 ? 2 : 1))); }
    }
    for (let x = cx - 2; x <= cx + 1; x++) if (get(x, 45) === SKIN) set(x, 45, SKIN, x < cx ? 3 : 2);
    for (let y = 40; y < 50; y++) for (let x = 16; x < 48; x++) if (get(x, y) === SKIN && !inFace(x, y) && (inFace(x, y - 1) || inFace(x, y - 2))) set(x, y, SKIN, 0);

    // ---------------- hair (front)
    const hairAt = (x, y, v) => { if (inb(x, y)) set(x, y, HAIR, v); };
    const cap = (t, sideDown, texFn) => {
      for (let y = 0; y < 38; y++) for (let x = 8; x < 56; x++) {
        if (!inCran(x, y, t)) continue;
        const X = x + 0.5 - cx;
        const inside = inFace(x, y);
        const hl = hairline(x);
        const hair = inside ? y < hl : y < (Math.abs(X) > crx - 1.8 ? sideDown : hl + 1);
        if (!hair) continue;
        const nx = X / (crx + t), ny = (y + 0.5 - ccy) / (cry + t);
        let v = lit(nx, ny, Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny)), -0.04);
        if (texFn) v = texFn(x, y, v);
        hairAt(x, y, v);
      }
    };
    const fadeSides = (from, to) => {
      for (let y = from; y < to; y++) for (let x = 10; x < 54; x++) {
        if (get(x, y) !== HAIR) continue;
        if (Math.abs(x + 0.5 - cx) < crx - 3.6) continue;
        const k = (y - from) / (to - from);
        if (bayer(x, y) < k) { if (inFace(x, y)) set(x, y, SKIN, faceLevel(x, y)); else set(x, y, E, 0); }
      }
    };
    switch (hs) {
      case 'bald': for (let y = 9; y < 17; y++) for (let x = 23; x < 31; x++) if (inFace(x, y) && hash(x, y, seed) < 0.22) set(x, y, SKIN, 4); break;
      case 'buzz': cap(0.3, 22, (x, y, v) => (hash(x, y, seed) < 0.4 ? v - 1 : v)); fadeSides(18, 25); break;
      case 'fade': cap(1.3, 21, (x, y, v) => v - ((hash(x, y, seed + 1) < 0.35 && v > 1) ? 1 : 0)); fadeSides(16, 24); break;
      case 'waves': cap(1.4, 21, (x, y, v) => v + (((y + ((x + 3) >> 2)) % 3) === 0 ? 1 : 0) - 1); fadeSides(17, 24); break;
      case 'curly': cap(3.8, 24, (x, y, v) => v - (hash(x >> 1, y >> 1, seed + 2) < 0.42 ? 1 : 0) + (hash(x, y, seed + 4) < 0.12 ? 1 : 0)); break;
      case 'afro': cap(2.6, 28, (x, y, v) => v - (hash(x, y, seed + 6) < 0.3 ? 1 : 0)); break;
      case 'hightop':
        cap(1.3, 21, null); fadeSides(17, 24);
        for (let y = 0; y < 15; y++) for (let x = 18; x < 47; x++) { const X = x + 0.5 - cx; if (Math.abs(X) <= 13 - (y < 1 ? 1 : 0)) hairAt(x, y, (X < -8 ? 3 : X > 8 ? 1 : 2) - (hash(x, y, seed) < 0.22 ? 1 : 0) + (y === 0 ? 1 : 0)); }
        break;
      case 'mohawk':
        cap(0.2, 20, null);
        for (let y = 0; y < 38; y++) for (let x = 0; x < N; x++) {
          if (get(x, y) !== HAIR || Math.abs(x + 0.5 - cx) < 4.5) continue;
          if (bayer(x, y) < 0.35) set(x, y, HAIR, 0); else if (inFace(x, y)) set(x, y, SKIN, faceLevel(x, y)); else set(x, y, E, 0);
        }
        for (let y = 1; y < 16; y++) for (let x = 27; x < 38; x++) if (Math.abs(x + 0.5 - cx) <= 4.2) hairAt(x, y, (x < 30 ? 3 : x > 34 ? 1 : 2) - (hash(x, y, seed) < 0.2 ? 1 : 0));
        break;
      case 'braids': cap(1.7, 24, (x, y, v) => ((x + 1) % 3 === 0 ? 0 : v) + ((y + x) % 4 === 0 ? 1 : 0)); break;
      case 'twists': cap(3.2, 24, (x, y, v) => v - ((x + (y >> 1)) % 2 === 0 ? 1 : 0)); break;
      case 'locs':
        cap(2.2, 26, (x, y, v) => v - (x % 3 === 0 ? 1 : 0));
        for (let y = 20; y < 58; y++) for (const bx of [14, 16, 18, 20, 43, 45, 47, 49]) if (hash(bx, 7, seed) < 0.85) { const x = bx + (y % 6 < 3 ? 0 : 1); if (get(x, y) !== SKIN || y > 44 || !inFace(x, y)) hairAt(x, y, (y % 4 === 0 ? 1 : 2) + (bx < cx ? 1 : 0) - 1); }
        break;
      case 'ponytail': cap(1.2, 22, (x, y, v) => v + ((x - y) % 5 === 0 ? 1 : 0)); break;
      case 'bun': cap(1.2, 22, (x, y, v) => v + ((x + y) % 6 === 0 ? 1 : 0)); break;
      case 'long': case 'bob': {
        cap(2.2, 32, (x, y, v) => v - ((x + 2) % 4 === 0 ? 1 : 0));
        const bottom = hs === 'bob' ? 44 : 56;
        for (let y = 18; y < bottom; y++) for (const s of [-1, 1]) for (let k = 0; k < 4; k++) {
          const x = Math.round(cx + s * (crx - 0.5 + k)) + (s < 0 ? -1 : 0);
          if (get(x, y) === SKIN && inFace(x, y) && k < 2 && y > 28) continue;
          hairAt(x, y, k === 3 ? 0 : s < 0 ? 3 - (k === 2 ? 1 : 0) : 1);
        }
        break;
      }
      case 'puffs': cap(1.2, 22, null); break;
      default: cap(1.3, 21, null); fadeSides(17, 24);
    }
    // rim light on the hair edge (shadow side)
    for (let y = 0; y < 38; y++) for (let x = cx + 4; x < N; x++) if ((get(x, y) === HAIR || get(x, y) === BACKHAIR) && get(x + 1, y) === E && lv(x, y) < 3) set(x, y, get(x, y), lv(x, y) + 1);

    // ---------------- facial hair
    if (beard === 'full' || beard === 'stubble') {
      for (let y = 29; y < 48; y++) for (let x = 14; x < 50; x++) {
        if (!inFace(x, y)) continue;
        const X = x + 0.5 - cx;
        const jawline = y > 35 + Math.max(0, 7 - Math.abs(X) * 0.5) || (Math.abs(X) > jrx - 2.8 && y > 28.5);
        const lipZone = Math.abs(X) < 5 && y >= my - 1 && y <= my + 1;
        const cheekHigh = Math.abs(X) < jrx - 2.8 && y < 36;
        if (!jawline || lipZone || cheekHigh) continue;
        if (beard === 'stubble') { if (bayer(x, y) < (y > my ? 0.4 : 0.26)) set(x, y, STUB, faceLevel(x, y)); }
        else set(x, y, BEARD, faceLevel(x, y) - (hash(x, y, seed + 11) < 0.32 ? 1 : 0) - 1);
      }
    }
    if (beard === 'full' || beard === 'goatee' || beard === 'mustache') {
      for (let x = cx - 5; x <= cx + 4; x++) { set(x, my - 2, BEARD, x < cx ? 2 : 1); if (x > cx - 5 && x < cx + 4) set(x, my - 1, BEARD, 1); }
    }
    if (beard === 'goatee') for (let y = my + 2; y < 47; y++) for (let x = cx - 4; x <= cx + 3; x++) if (inFace(x, y) && Math.abs(x + 0.5 - cx) < 4.2 - (y - my - 2) * 0.28) set(x, y, BEARD, x < cx ? 2 : 1);

    // ---------------- eyes
    const irisC = lk.eyes || (F ? F.eyeColor : '#2b1a10');
    for (let e = 0; e < 2; e++) {
      const x0 = e === 0 ? eyeL : eyeR;
      const mode = X_.eyes;
      // soft socket shadow above the eye
      for (let x = x0 - 1; x <= x0 + 5; x++) if (get(x, eyeY - 2) === SKIN) set(x, eyeY - 2, SKIN, Math.max(1, lv(x, eyeY - 2) - 1));
      if (mode === 'happy') {
        for (let x = x0; x < x0 + 5; x++) set(x, eyeY - (x === x0 || x === x0 + 4 ? 0 : 1), LASH, 0);
        for (let x = x0 + 1; x < x0 + 4; x++) set(x, eyeY, SKIN, 3);
        continue;
      }
      const big = ft('eyeSize') > 0.62 && mode !== 'squint' && mode !== 'lidded';
      const top = mode === 'wide' || big ? eyeY - 2 : mode === 'squint' ? eyeY : eyeY - 1;
      const xe = x0 + eyeW - 1; // outer edge (pixel index)
      for (let y = top; y <= eyeY; y++) for (let x = x0; x <= xe; x++) set(x, y, WHITE, y === top ? 1 : 2);
      set(x0, eyeY, WHITE, 1); set(xe, eyeY, WHITE, 1);
      // eye tilt: the outer corner (toward the temple) sits a pixel up or down
      if (eyeTilt) { const ox = e === 0 ? x0 : xe; if (eyeTilt < 0) { set(ox, top - 1, WHITE, 1); set(ox, eyeY, SKIN, faceLevel(ox, eyeY)); } else { set(ox, eyeY + 1, WHITE, 1); set(ox, top, SKIN, faceLevel(ox, top)); } }
      const look = X_.look || 0;
      const ix = x0 + 1 + (look > 0 ? 1 : look < 0 ? 0 : (e === 0 ? 1 : 1)) + (eyeW === 6 ? 1 : 0) - (eyeW === 4 && e === 1 ? 1 : 0);
      for (let y = Math.max(top, eyeY - 1); y <= eyeY; y++) { set(ix, y, IRIS, 2); set(ix + 1, y, IRIS, 1); }
      set(ix + (e === 0 ? 1 : 0), eyeY, DARK, 0);
      if (mode !== 'squint') set(ix, Math.max(top, eyeY - 1), WHITE, 4);
      // lash line (heavier at the outer corner), lids
      for (let x = x0 - 1; x <= xe + 1; x++) set(x, top - 1, LASH, 0);
      set(e === 0 ? x0 - 1 : xe + 1, top, LASH, 0);
      if (fem) set(e === 0 ? x0 - 2 : xe + 2, top - 2, LASH, 0);
      const heavyLid = ft('lid') > 0.7;
      if (mode === 'lidded' || mode === 'squint' || heavyLid) for (let x = x0; x <= xe; x++) set(x, top, SKIN, 1);
      for (let x = x0; x <= xe; x++) if (get(x, eyeY + 1) === SKIN) set(x, eyeY + 1, SKIN, Math.max(1, lv(x, eyeY + 1) - 1));
    }
    // ---------------- brows
    const browFor = e => {
      const x0 = e === 0 ? eyeL : eyeR, b = X_.brow;
      const arch = ft('browArch'), bth = ft('browThick');
      for (let k = 0; k < 6; k++) {
        const x = e === 0 ? x0 - 1 + k : x0 + k;
        const tIn = e === 0 ? k / 5 : 1 - k / 5; // 1 at the inner end
        let dy = arch > 0.7 && (k === 2 || k === 3) ? -1 : arch < 0.25 ? (tIn > 0.6 ? 0 : 1) : 0;
        if (b === 'soft') dy = (k === 2 || k === 3) ? -1 : 0;
        else if (b === 'up') dy = -1 - ((k === 2 || k === 3) ? 1 : 0);
        else if (b === 'angry') dy = Math.round(tIn * 2.4) - 1;
        else if (b === 'heavy' || b === 'low') dy = 1;
        else if (b === 'oneUp') dy = e === 1 ? -1 - ((k === 2 || k === 3) ? 1 : 0) : 0;
        else if (b === 'cocky') dy = e === 0 ? -2 - ((k === 2 || k === 3) ? 1 : 0) : 1;
        else if (b === 'annoyed') dy = e === 0 ? Math.round(tIn * 2) - 1 : 0;
        else dy = (k === 2 || k === 3) && tIn > 0.3 ? 0 : 0;
        const y = eyeY - 5 + dy - (bth > 0.75 ? 1 : 0);
        const thick = bth > 0.75 ? true : bth < 0.25 ? tIn > 0.7 : fem ? tIn > 0.5 : tIn > 0.25 || b === 'heavy' || b === 'angry';
        set(x, y, BROW, 2 - (k === 0 || k === 5 ? 0 : 0));
        if (thick) set(x, y + 1, BROW, 1);
        if (bth > 0.75 && tIn > 0.3) set(x, y + 2, BROW, 1);
      }
    };
    browFor(0); browFor(1);
    // ---------------- nose
    const nTip = eyeY + 7 + (ft('noseL') > 0.7 ? 1 : ft('noseL') < 0.3 ? -1 : 0);
    const nW = ft('noseW') > 0.7 ? 1 : ft('noseW') < 0.3 ? -1 : 0; // nostril spread
    const bridge = ft('noseBridge') > 0.7;
    for (let y = eyeY + 3; y <= nTip; y++) { if (get(cx + 1, y) === SKIN) set(cx + 1, y, SKIN, Math.max(1, lv(cx + 1, y) - 1)); if (y > eyeY + 3 && get(cx - 2, y) === SKIN) set(cx - 2, y, SKIN, Math.min(4, lv(cx - 2, y) + 1)); if (bridge && get(cx - 1, y) === SKIN && y < nTip - 1) set(cx - 1, y, SKIN, 4); }
    set(cx - 1, nTip, SKIN, 4); set(cx, nTip, SKIN, 3);
    set(cx - 3 - nW, nTip + 1, SKIN, 1); set(cx + 2 + nW, nTip + 1, SKIN, 0); set(cx - 3 - nW, nTip + 2, SKIN, 0); set(cx + 2 + nW, nTip + 2, SKIN, 0);
    for (let x = cx - 2 - nW; x <= cx + 1 + nW; x++) set(x, nTip + 2, SKIN, 1);
    set(cx - 4 - nW, nTip + 1, SKIN, Math.max(0, lv(cx - 4 - nW, nTip + 1) - 1)); set(cx + 3 + nW, nTip + 1, SKIN, 0);
    if (nW < 0) { set(cx - 2, nTip + 1, SKIN, 2); set(cx + 1, nTip + 1, SKIN, 1); }
    // ---------------- cheeks lift for smiles
    if (X_.cheeks) for (const s of [-1, 1]) for (let k = 0; k < 2; k++) { const x = cx + s * (8 + k) - (s > 0 ? 1 : 0); if (get(x, eyeY + 4) === SKIN) set(x, eyeY + 4, SKIN, s < 0 ? 4 : 3); if (X_.cheeks > 1 && get(x, eyeY + 7) === SKIN) set(x, eyeY + 7, SKIN, Math.max(0, lv(x, eyeY + 7) - 1)); }
    // ---------------- mouth
    const upperLip = (x0, x1) => { if (ft('lipFull') < 0.3) return; for (let x = x0; x <= x1; x++) if (get(x, my - 1) === SKIN) set(x, my - 1, LIP, x < cx ? 2 : 1); };
    const lipF = ft('lipFull');
    const lowerLip = (x0, x1) => {
      for (let x = x0; x <= x1; x++) if ([SKIN, BEARD, STUB].includes(get(x, my + 1))) set(x, my + 1, LIP, x < cx - 1 ? 4 : x < cx + 1 ? 3 : 2);
      if (lipF > 0.68) for (let x = x0 + 1; x < x1; x++) if ([SKIN, BEARD, STUB].includes(get(x, my + 2))) set(x, my + 2, LIP, x < cx ? 3 : 2);
      const yb = lipF > 0.68 ? my + 3 : my + 2;
      for (let x = x0 + 1; x < x1; x++) if (get(x, yb) === SKIN) set(x, yb, SKIN, Math.max(0, lv(x, yb) - 1));
    };
    const W2 = (fem ? 3 : 4) + (ft('mouthW') > 0.72 ? 1 : ft('mouthW') < 0.28 ? -1 : 0);
    switch (X_.mouth) {
      case 'smile':
        upperLip(cx - W2 + 1, cx + W2 - 2);
        for (let x = cx - W2 + 1; x <= cx + W2 - 2; x++) set(x, my, MOUTH, 0);
        for (let x = cx - W2 + 2; x <= cx + W2 - 3; x++) set(x, my, TEETH, 3);
        set(cx - W2, my - 1, MOUTH, 0); set(cx + W2 - 1, my - 1, MOUTH, 0);
        lowerLip(cx - W2 + 2, cx + W2 - 3); break;
      case 'grin':
        for (let x = cx - W2 - 1; x <= cx + W2; x++) { set(x, my - 1, MOUTH, 0); set(x, my, TEETH, x === cx - W2 - 1 || x === cx + W2 ? 2 : 3); set(x, my + 1, MOUTH, 0); }
        set(cx - W2 - 2, my - 2, MOUTH, 0); set(cx + W2 + 1, my - 2, MOUTH, 0); set(cx - W2 - 2, my - 1, MOUTH, 0); set(cx + W2 + 1, my - 1, MOUTH, 0);
        for (let x = cx - W2; x <= cx + W2 - 1; x++) set(x, my + 2, LIP, x < cx ? 3 : 2);
        break;
      case 'smirk':
        upperLip(cx - W2 + 1, cx + W2 - 1);
        for (let x = cx - W2 + 1; x <= cx + W2 - 1; x++) set(x, my, MOUTH, 0);
        set(cx + W2, my - 1, MOUTH, 0); set(cx + W2 + 1, my - 2, MOUTH, 1);
        set(cx + W2 + 1, my - 1, SKIN, 1);
        lowerLip(cx - W2 + 2, cx + W2 - 1); break;
      case 'press':
        for (let x = cx - W2 + 1; x <= cx + W2 - 2; x++) set(x, my, MOUTH, 0);
        lowerLip(cx - 1, cx); break;
      case 'frownSoft':
        upperLip(cx - W2 + 1, cx + W2 - 2);
        for (let x = cx - W2 + 1; x <= cx + W2 - 2; x++) set(x, my, MOUTH, 0);
        set(cx - W2, my + 1, MOUTH, 1); set(cx + W2 - 1, my + 1, MOUTH, 1);
        lowerLip(cx - W2 + 2, cx + W2 - 3); break;
      case 'frown':
        for (let x = cx - W2 + 2; x <= cx + W2 - 3; x++) set(x, my, MOUTH, 0);
        set(cx - W2 + 1, my + 1, MOUTH, 0); set(cx + W2 - 2, my + 1, MOUTH, 0); set(cx - W2, my + 2, MOUTH, 1); set(cx + W2 - 1, my + 2, MOUTH, 1);
        for (let x = cx - W2 + 2; x <= cx + W2 - 3; x++) set(x, my + 1, LIP, 2);
        for (let x = cx - 2; x <= cx + 1; x++) if (get(x, my + 3) === SKIN) set(x, my + 3, SKIN, 1);
        break;
      case 'yell':
        for (let y = my - 2; y <= my + 3; y++) for (let x = cx - W2; x <= cx + W2 - 1; x++) {
          const corner = (x === cx - W2 || x === cx + W2 - 1) && (y === my - 2 || y === my + 3);
          if (corner) continue;
          set(x, y, y === my - 2 ? TEETH : MOUTH, y === my - 2 ? 3 : y >= my + 2 ? 1 : 0);
        }
        for (let x = cx - W2 + 1; x <= cx + W2 - 2; x++) set(x, my + 4, LIP, 2);
        break;
      case 'side':
        upperLip(cx - W2 + 1, cx + W2 - 2);
        for (let x = cx - W2 + 1; x <= cx + W2 - 2; x++) set(x, my, MOUTH, 0);
        set(cx - W2, my + 1, MOUTH, 1);
        lowerLip(cx - 1, cx + W2 - 2); break;
      default:
        upperLip(cx - W2 + 1, cx + W2 - 2);
        for (let x = cx - W2 + 1; x <= cx + W2 - 2; x++) set(x, my, MOUTH, 0);
        lowerLip(cx - W2 + 2, cx + W2 - 3);
    }

    // headband
    if (lk.headband) {
      for (let y = 15; y <= 18; y++) for (let x = 10; x < 54; x++) {
        if (!inCran(x, y, 1.5)) continue;
        if ([SKIN, HAIR].includes(get(x, y)) || inFace(x, y)) set(x, y, BAND, y === 15 ? 3 : y === 18 ? 1 : 2);
      }
    }

    // ---------------- palettes
    const skinBase = (PBC.Config.SKIN_TONES || [])[U.clamp(lk.skin == null ? 3 : lk.skin | 0, 0, 7)] || '#a26a45';
    const pSkin = ramp(skinBase, { cool: [118, 38, 58], warm: [255, 228, 196], lk: 0.15, hk: 0.33, dk: 0.5, sk: 0.78 });
    const hc = lk.hairColor && lk.hairColor !== '#000000' ? lk.hairColor : '#1b1410';
    const pHair = ramp(hc, { cool: [20, 12, 30], warm: [255, 232, 196], lk: 0.14, hk: 0.3 });
    if (lum(pHair[2]) < 0.14) { pHair[3] = clampC(mixA(pHair[2], [120, 110, 145], 0.26)); pHair[4] = clampC(mixA(pHair[2], [175, 165, 200], 0.4)); }
    const uni = opts.uniform || {};
    const pJer = ramp(uni.jersey || '#3b475f', { lk: 0.16, hk: 0.3 });
    const pTrim = ramp(uni.trim || '#8d99b0');
    const pNum = ramp(uni.number || '#ffffff');
    const bandBase = lk.headband === 'team' ? (uni.trim || uni.jersey || '#ffffff') : (lk.headband || '#ffffff');
    const pBand = ramp(bandBase);
    const lipBase = mixA(hex(skinBase), fem ? [176, 60, 72] : [150, 70, 70], fem ? 0.42 : 0.26);
    const pLip = ramp(lipBase, { cool: [110, 30, 50], warm: [255, 200, 190], lk: 0.12, hk: 0.24 });
    const pStub = pSkin.map((c, i) => clampC(mixA(c, pHair[Math.max(0, i - 1)], 0.42)));
    const white = [[120, 110, 124], [196, 190, 198], [236, 234, 240], [248, 248, 252], [255, 255, 255]];
    const pIris = ramp(irisC, { lk: 0.25, hk: 0.45 });
    const pInk = pSkin.map(c => clampC(mixA(c, [26, 34, 70], 0.55)));
    const pMouth = [[42, 12, 18], [86, 28, 36], [124, 52, 58], [150, 72, 76], [170, 92, 92]];
    const pBrow = [pHair[0], clampC(mixA(pHair[0], pHair[1], 0.5)), pHair[1], pHair[2], pHair[2]];
    const outline = [22, 12, 20];
    const PAL = [];
    PAL[SKIN] = pSkin; PAL[EAR] = pSkin; PAL[HAIR] = pHair; PAL[BACKHAIR] = pHair; PAL[JER] = pJer; PAL[TRIM] = pTrim; PAL[NUM] = pNum; PAL[NUMO] = pTrim;
    PAL[WHITE] = white; PAL[IRIS] = pIris; PAL[DARK] = [outline, outline, [16, 10, 12], [16, 10, 12], [16, 10, 12]]; PAL[LASH] = [[24, 14, 16], [30, 18, 20], [40, 24, 26], [40, 24, 26], [40, 24, 26]];
    PAL[LIP] = pLip; PAL[TEETH] = white; PAL[MOUTH] = pMouth; PAL[BROW] = pBrow; PAL[BEARD] = pHair; PAL[BAND] = pBand; PAL[INK] = pInk; PAL[STUB] = pStub;

    // ---------------- selective outline: silhouette edges darken; back materials darken where covered
    const out = new Uint8Array(N * N);
    const frontOf = { [HAIR]: [SKIN, EAR, BACKHAIR, JER], [SKIN]: [JER, BACKHAIR, EAR, TRIM], [JER]: [BACKHAIR], [TRIM]: [BACKHAIR], [EAR]: [BACKHAIR], [BAND]: [SKIN, HAIR], [BEARD]: [SKIN] };
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = idx(x, y), a = m[i];
      if (a === E) continue;
      let edge = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { if (get(x + dx, y + dy) === E && y + dy < N) { edge = true; break; } }
      if (edge) { out[i] = 2; continue; }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, -1], [0, 1]]) {
        const b = get(x + dx, y + dy);
        if (b !== a && frontOf[b] && frontOf[b].includes(a)) { out[i] = 1; break; }
      }
    }
    return { m, l, out, PAL, outline };
  }

  // ------------------------------------------------------------ background
  function background(img, style, uni, seed) {
    const d = img.data;
    if (style === 'none') return;
    const studio = style === 'studio';
    const base = studio ? [30, 38, 58] : hex(uni.jersey || '#2a3550');
    const dark = studio ? [8, 10, 18] : mixA(mul(base, 0.26), [8, 10, 20], 0.35);
    const light = studio ? [66, 80, 110] : mixA(base, [255, 255, 255], 0.1);
    const acc = hex(uni.trim || '#ffffff');
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const dx = (x - 22) / 64, dy = (y - 16) / 64;
      let t = Math.min(1, Math.sqrt(dx * dx + dy * dy) * 1.3);
      t += (bayer(x, y) - 0.5) * 0.2;
      const k = Math.floor(U.clamp(t, 0, 0.999) * 5) / 4;
      let c = mixA(light, dark, k);
      if (!studio && (x + y + (seed & 7)) % 12 === 0 && y < 50) c = mixA(c, acc, 0.1);
      const q = (y * N + x) * 4;
      d[q] = c[0]; d[q + 1] = c[1]; d[q + 2] = c[2]; d[q + 3] = 255;
    }
  }

  // ------------------------------------------------------------ public
  const cache = new Map();
  let canv = null, cg = null;
  function uniformFor(p, opts) {
    if (opts && opts.uniform) return opts.uniform;
    const S = PBC.UI && PBC.UI.S;
    const t = S && p && p.tid >= 0 && S.teams[p.tid] ? S.teams[p.tid] : null;
    if (!t) return { jersey: '#3b475f', trim: '#8d99b0', number: '#eef3ff' };
    const u = t.uniforms && t.uniforms.away;
    if (u && u.jersey) return { jersey: u.jersey, trim: u.trim || t.colors.secondary, number: u.number || U.textOn(u.jersey) };
    const pri = t.colors.primary;
    return { jersey: pri, trim: t.colors.secondary, number: U.textOn(pri) === '#ffffff' ? '#ffffff' : t.colors.secondary };
  }
  function keyOf(p, uni, face, bg) {
    const lk = (p && p.look) || {};
    return [p && p.id, lk.skin, lk.hair, lk.hairColor, lk.beard, lk.headband, lk.build, lk.tattoo, lk.eyes, p && p.gender, p && p.num, uni.jersey, uni.trim, uni.number, face, bg, lk.feat ? JSON.stringify(lk.feat) : ''].join('|');
  }
  /** data URL of a 64×64 pixel portrait. opts: { face, ctx: {mood}, bg: 'team'|'studio'|'none', uniform } */
  function url(p, opts) {
    opts = opts || {};
    const uni = uniformFor(p, opts);
    const face = opts.face || (PBC.Persona ? PBC.Persona.face(p, opts.ctx) : 'neutral');
    const bg = opts.bg || 'team';
    const key = keyOf(p, uni, face, bg);
    const hit = cache.get(key);
    if (hit) return hit;
    if (!canv) { canv = document.createElement('canvas'); canv.width = N; canv.height = N; cg = canv.getContext('2d'); }
    const r = paint(p, { face, ctx: opts.ctx, uniform: uni });
    const img = cg.createImageData(N, N);
    background(img, bg, uni, U.hash(String(p && p.id)));
    const d = img.data;
    for (let i = 0; i < N * N; i++) {
      const mat = r.m[i];
      if (!mat) continue;
      const P = r.PAL[mat];
      let c;
      if (r.out[i] === 2) c = mixA(P[0], r.outline, 0.55);
      else if (r.out[i] === 1) c = P[Math.max(0, r.l[i] - 1)];
      else c = P[r.l[i]] || P[2];
      const q = i * 4;
      d[q] = c[0]; d[q + 1] = c[1]; d[q + 2] = c[2]; d[q + 3] = 255;
    }
    cg.putImageData(img, 0, 0);
    const out = canv.toDataURL('image/png');
    cache.set(key, out);
    if (cache.size > 1500) cache.delete(cache.keys().next().value);
    return out;
  }

  PBC.Portrait = { url, paint, N, cache, EXPRESSIONS: Object.keys(EXPR) };

  // UI hooks (this file loads right after js/ui/core.js)
  const UI = PBC.UI;
  if (UI) {
    const oldAvatar = UI.avatar;
    UI.avatar = function (p, size, opts) {
      size = size || 36;
      if (!p || !p.look) return oldAvatar ? oldAvatar(p, size) : '';
      try {
        const src = url(p, opts);
        return `<img class="av pixel-av pxp" width="${size}" height="${size}" alt="" src="${src}" style="width:${size}px;height:${size}px${size < 48 ? ';image-rendering:auto' : ''}">`;
      } catch (e) { console.error('portrait', e); return oldAvatar ? oldAvatar(p, size) : ''; }
    };
    /** larger magazine / feature portrait. opts.bg: 'team' | 'studio' | 'none'; opts.face / opts.ctx.mood */
    UI.portrait = function (p, size, opts) {
      size = size || 160;
      if (!p || !p.look) return '';
      opts = Object.assign({ bg: 'studio' }, opts || {});
      const src = url(p, opts);
      return `<img class="av pixel-av pxp pxp-lg" width="${size}" height="${size}" alt="${U.esc(PBC.Player ? PBC.Player.name(p) : '')}" src="${src}" style="width:${size}px;height:${size}px;image-rendering:pixelated">`;
    };
  }
})();
