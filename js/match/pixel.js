/* Pro BBALL Coach — retro pixel sprites (PBC.Match.Pixel).
 *
 * Research notes (web, 2026): for a solo-dev retro hoops look the consensus is
 *  - 16–32 px tall chibi sprites, 6–16 colors per sprite, one shared palette;
 *  - 1 px dark outline, light from upper-left, legs/arms 2 px wide so run cycles
 *    read at a glance; 4-frame run at ~8 fps + 2-frame idle bob is enough;
 *  - render low-res offscreen, upscale with imageSmoothingEnabled=false and
 *    integer scale factors so pixels stay crisp on every screen;
 *  - PNG sprite sheets (Aseprite/Piskel, shelf-packed, PNG lossless) are the
 *    classic pipeline — but this game generates 400+ unique players from data
 *    (skin/hair/jersey/number), so we do the same thing PROCEDURALLY: the exact
 *    same look data that drives the vector Figure renderer + SVG avatars is
 *    rasterized here to a tiny pixel grid. Zero asset files, team colors always
 *    match, and the player editor previews the same sprite the court draws.
 */
(function () {
  'use strict';
  const M = (window.PBC = window.PBC || {});
  M.Match = M.Match || {};
  const U = (M.Match.U = M.Match.U || {
    clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
    hashStr: s => { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; },
  });

  const W = 20, H = 26; // sprite grid (Hoop Land chibi scale: ~20x26 reads well at 3-4x)
  const OUT = '#101018';
  const SKIN = ['#f3d2b6', '#e8b995', '#d6a17a', '#c08560', '#a26a45', '#86532f', '#6a3f22', '#4a2a16'];
  const BALL = '#e8722a', BALL_D = '#8a3c10', BALL_L = '#ffb066';

  // ---------- 5x7 pixel font (Hoop Land-style scorebug / arena / jersey text) --
  const FONT5 = {
    A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
    B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
    C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
    D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
    E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
    F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
    G: ['01110', '10001', '10000', '10111', '10001', '10001', '01111'],
    H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
    I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
    J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
    K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
    L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
    M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
    N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
    O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
    P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
    Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
    R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
    S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
    T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
    U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
    V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
    W: ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
    X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
    Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
    Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
    0: ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
    1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
    2: ['01110', '10001', '00001', '00110', '01000', '10000', '11111'],
    3: ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
    4: ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
    5: ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
    6: ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
    7: ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
    8: ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
    9: ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
    ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
    ':': ['00000', '00100', '00000', '00000', '00000', '00100', '00000'],
    '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
    '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
    '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
    '!': ['00100', '00100', '00100', '00100', '00100', '00000', '00100'],
    '+': ['00000', '00100', '00100', '11111', '00100', '00100', '00000'],
    '(': ['00010', '00100', '01000', '01000', '01000', '00100', '00010'],
    ')': ['01000', '00100', '00010', '00010', '00010', '00100', '01000'],
    '?': ['01110', '10001', '00001', '00010', '00100', '00000', '00100'],
  };
  // 3x5 micro digits for jersey numbers
  const FONT3 = {
    0: ['111', '101', '101', '101', '111'], 1: ['010', '110', '010', '010', '111'],
    2: ['111', '001', '111', '100', '111'], 3: ['111', '001', '111', '001', '111'],
    4: ['101', '101', '111', '001', '001'], 5: ['111', '100', '111', '001', '111'],
    6: ['111', '100', '111', '101', '111'], 7: ['111', '001', '001', '010', '010'],
    8: ['111', '101', '111', '101', '111'], 9: ['111', '101', '111', '001', '111'],
  };
  function glyph5(ch) { return FONT5[ch] || FONT5['?']; }
  function textW(s, sc) { s = String(s == null ? '' : s); sc = sc || 1; return s.length ? s.length * 6 * sc - sc : 0; }
  /** Pixel text. align 'c' centers on x. shadow: true/#color draws a 1px drop shadow. Returns width. */
  function pixText(g, s, x, y, sc, color, align, shadow) {
    s = String(s == null ? '' : s).toUpperCase();
    sc = sc || 1;
    const w = textW(s, sc);
    let cx = align === 'c' ? Math.round(x - w / 2) : Math.round(x);
    y = Math.round(y);
    const pass = (dx, dy, col) => {
      g.fillStyle = col;
      for (let i = 0; i < s.length; i++) {
        const gl = glyph5(s[i]);
        for (let r = 0; r < 7; r++) {
          const row = gl[r];
          for (let c = 0; c < 5; c++) if (row[c] === '1') g.fillRect(cx + i * 6 * sc + c * sc + dx, y + r * sc + dy, sc, sc);
        }
      }
    };
    if (shadow) pass(1, 1, shadow === true ? '#000' : shadow);
    pass(0, 0, color);
    return w;
  }

  function shade(hex, f) {
    const n = parseInt(String(hex).slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    if (f >= 0) { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
    else { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
    return `rgb(${r | 0},${g | 0},${b | 0})`;
  }

  const cache = new Map();
  function mkCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  function lookKey(pl, tl) {
    const lk = (pl && pl.look) || {};
    const u = (tl && tl.uniform) || {};
    return [
      lk.skin, lk.hair, lk.hairColor, lk.beard, lk.headband, lk.armSleeve, lk.legSleeve,
      lk.shoe, lk.shoeAccent, lk.tattoo, pl && pl.gender, pl && pl.num,
      u.jersey, u.trim, u.number, u.shorts,
    ].join('|');
  }

  function skinSet(pl) {
    const i = U.clamp(((pl.look || {}).skin | 0) || 0, 0, 7);
    const b = SKIN[i];
    return { b, d: shade(b, -0.25), l: shade(b, 0.15) };
  }
  function uni(pl, tl) {
    const u = (tl && tl.uniform) || {};
    const jersey = u.jersey || '#ffffff';
    const trim = u.trim || u.number || '#111111';
    const shorts = u.shorts || jersey;
    return {
      jersey, trim, shorts,
      jD: shade(jersey, -0.25), jL: shade(jersey, 0.12),
      sD: shade(shorts, -0.25),
      num: shade(u.number || trim, 0),
    };
  }

  // ---- pixel helpers -------------------------------------------------------
  function px(g, x, y, w, h, c) { g.fillStyle = c; g.fillRect(x | 0, y | 0, w, h); }

  function hairBack(g, pl, skin) {
    const lk = pl.look || {}, hc = lk.hairColor || '#16110e';
    const cx = 10;
    switch (lk.hair) {
      case 'afro': px(g, cx - 6, 0, 12, 4, hc); px(g, cx - 7, 2, 2, 6, hc); px(g, cx + 5, 2, 2, 6, hc); break;
      case 'long': case 'locs': px(g, cx - 6, 2, 2, 10, shade(hc, -0.15)); px(g, cx + 4, 2, 2, 10, shade(hc, -0.15)); break;
      case 'braids': case 'twists': px(g, cx - 6, 3, 2, 7, hc); px(g, cx + 4, 3, 2, 7, hc); break;
      case 'ponytail': px(g, cx + 4, 2, 3, 8, hc); break;
      case 'bun': px(g, cx - 2, -1, 5, 3, hc); break;
      case 'puffs': px(g, cx - 8, 0, 4, 4, hc); px(g, cx + 4, 0, 4, 4, hc); break;
      case 'bob': px(g, cx - 6, 2, 2, 6, hc); px(g, cx + 4, 2, 2, 6, hc); break;
      default: break;
    }
  }

  function hairTop(g, pl) {
    const lk = pl.look || {}, hc = lk.hairColor || '#16110e';
    const cx = 10;
    switch (lk.hair) {
      case 'bald': px(g, cx - 3, 1, 3, 1, 'rgba(255,255,255,.35)'); break;
      case 'buzz': px(g, cx - 4, 1, 8, 2, shade(hc, 0.1)); break;
      case 'fade': case 'waves': px(g, cx - 4, 0, 8, 3, hc); break;
      case 'curly': case 'twists': px(g, cx - 5, 0, 10, 3, hc); px(g, cx - 5, 2, 2, 2, hc); px(g, cx + 3, 2, 2, 2, hc); break;
      case 'hightop': px(g, cx - 4, -1, 8, 4, hc); break;
      case 'mohawk': px(g, cx - 1, -1, 2, 4, hc); break;
      case 'afro': px(g, cx - 5, 1, 10, 2, shade(hc, 0.15)); break;
      case 'braids': case 'locs': px(g, cx - 4, 0, 8, 3, hc); for (let i = -3; i <= 3; i += 2) px(g, cx + i, 2, 1, 2, shade(hc, 0.25)); break;
      case 'ponytail': case 'bun': case 'long': case 'bob': case 'puffs': px(g, cx - 4, 0, 8, 3, hc); break;
      default: px(g, cx - 4, 1, 8, 2, hc);
    }
    if (lk.headband) {
      px(g, cx - 4, 3, 8, 1, lk.headband);
    }
  }

  function drawLegs(g, pl, u, pose, frame, skin) {
    const lk = pl.look || {};
    const sleeveCol = '#161618';
    const legL = (lk.legSleeve === 'both' || lk.legSleeve === 'left');
    const legR = (lk.legSleeve === 'both' || lk.legSleeve === 'right');
    // shorts block y16..18
    px(g, 6, 16, 8, 3, u.shorts); px(g, 6, 18, 8, 1, u.sD);
    px(g, 9, 16, 2, 3, shade(u.shorts, -0.35)); // crotch shade
    px(g, 6, 16, 1, 3, u.trim); px(g, 13, 16, 1, 3, u.trim); // side stripes
    // leg offsets per pose
    let lo = [0, 0], ro = [0, 0]; // [dx, dy-lift]
    if (pose === 'run') {
      const f = frame % 4;
      if (f === 0) { lo = [-2, 0]; ro = [2, -2]; }
      else if (f === 1) { lo = [-1, -2]; ro = [1, 0]; }
      else if (f === 2) { lo = [2, 0]; ro = [-2, -2]; }
      else { lo = [1, 0]; ro = [-1, -2]; }
    } else if (pose === 'stand') { lo = [0, frame % 2 ? 0 : 0]; ro = [0, 0]; }
    else if (pose === 'shoot' || pose === 'jump') { lo = [-1, -1]; ro = [1, -1]; }
    else if (pose === 'dunk') { lo = [-2, -2]; ro = [2, -1]; }
    else if (pose === 'defend') { lo = [-2, 0]; ro = [2, 0]; }
    // left leg x7..8, right leg x11..12, y19..22
    const shoe = lk.shoe || '#151515', acc = lk.shoeAccent || u.trim;
    const leg = (x, lift, sleeved) => {
      const top = 19 + lift;
      px(g, x, top, 2, 4 - lift, sleeved ? sleeveCol : skin.b);
      if (!sleeved && lift === 0) px(g, x, top + 2, 2, 1, skin.d);
      // sock + shoe
      px(g, x - 0, 22, 2, 1, '#f2f2f2');
      px(g, x - 1, 23, 4, 2, shoe);
      px(g, x - 1, 23, 4, 1, acc);
      px(g, x - 1, 24, 4, 1, OUT); // sole
    };
    leg(7 + lo[0], lo[1], legL);
    leg(11 + ro[0], ro[1], legR);
  }

  function drawTorso(g, pl, u, pose, frame, skin) {
    // Compact torso makes the head read large and expressive from broadcast distance.
    px(g, 7, 10, 6, 6, OUT);
    px(g, 8, 11, 4, 4, u.jersey);
    px(g, 8, 11, 4, 1, u.jL); // shoulder light
    px(g, 8, 14, 4, 1, u.jD);
    // neckline + armholes trim
    px(g, 8, 10, 4, 1, u.trim);
    px(g, 7, 11, 1, 3, u.trim); px(g, 12, 11, 1, 3, u.trim);
    // chest number: real micro digits (Hoop Land jerseys show numbers)
    const ns = String(pl.num == null ? '' : pl.num).slice(-2);
    if (ns) {
      const ncol = lum(u.jersey) > 0.55 ? '#101018' : '#f5f5f5';
      const w = ns.length === 1 ? 2 : 5, x0 = 10 - Math.ceil(w / 2);
      g.fillStyle = ncol;
      for (let i = 0; i < ns.length; i++) {
        const gl = FONT3[ns[i]] || FONT3['0'];
        for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) if (gl[r * 2][c] === '1') g.fillRect(x0 + i * 3 + Math.min(c, 1), 11 + r, 1, 1);
      }
    }
    // waistband
    px(g, 7, 15, 6, 1, u.trim);
  }

  function drawArms(g, pl, u, pose, frame, skin, hasBall) {
    const lk = pl.look || {};
    const slv = (side) => lk.armSleeve === 'both' || (lk.armSleeve === 'left' && side < 0) || (lk.armSleeve === 'right' && side > 0);
    const armCol = (side) => (slv(side) ? '#1a1a1c' : skin.b);
    const hand = (x, y) => px(g, x, y, 2, 2, skin.b);
    if (pose === 'shoot' || pose === 'jump') {
      // both arms up (follow-through)
      px(g, 5, 5, 2, 5, armCol(-1)); hand(5, 3);
      px(g, 13, 5, 2, 5, armCol(1)); hand(13, 3);
      if (hasBall) { drawBall(g, 8, 0); }
    } else if (pose === 'dunk') {
      // One arm attacks the rim while the other protects the ball: a distinct,
      // readable silhouette from a jumper even at the tiny court scale.
      px(g, 5, 7, 2, 4, armCol(-1)); hand(4, 5);
      px(g, 13, 2, 2, 7, armCol(1)); hand(13, 0);
      if (hasBall) drawBall(g, 13, -4);
    } else if (pose === 'defend') {
      // arms spread wide
      px(g, 2, 10, 4, 2, armCol(-1)); hand(0, 10);
      px(g, 14, 10, 4, 2, armCol(1)); hand(18, 10);
      if (hasBall) drawBall(g, 8, 18);
    } else if (pose === 'run') {
      const f = frame % 4;
      const up = (f === 0 || f === 3);
      // left arm
      if (up) { px(g, 4, 10, 2, 4, armCol(-1)); hand(4, 14); }
      else { px(g, 4, 11, 2, 3, armCol(-1)); hand(5, 14); }
      // right arm (dribble arm lower when hasBall)
      if (hasBall) { px(g, 14, 12, 2, 3, armCol(1)); hand(14, 15); drawBall(g, 15, 19 + (f % 2 ? -2 : 0)); }
      else if (up) { px(g, 14, 11, 2, 3, armCol(1)); hand(13, 14); }
      else { px(g, 14, 10, 2, 4, armCol(1)); hand(14, 14); }
    } else { // stand / inbound / celebrate
      if (pose === 'celebrate') { px(g, 4, 5, 2, 5, armCol(-1)); hand(4, 3); px(g, 14, 5, 2, 5, armCol(1)); hand(14, 3); }
      else if (hasBall) { px(g, 4, 11, 2, 3, armCol(-1)); hand(4, 14); px(g, 12, 11, 2, 3, armCol(1)); hand(12, 14); drawBall(g, 14, 12); }
      else { px(g, 4, 11, 2, 4, armCol(-1)); hand(4, 15); px(g, 14, 11, 2, 4, armCol(1)); hand(14, 15); }
    }
    if (lk.tattoo === 'sleeve' || lk.tattoo === 'arms') { px(g, 4, 12, 2, 2, 'rgba(30,25,40,.5)'); }
  }

  function drawHead(g, pl, skin) {
    const cx = 10;
    // Big-head silhouette: this is the main readability cue for the new arcade view.
    px(g, cx - 5, 1, 10, 9, OUT);
    px(g, cx - 4, 2, 8, 7, skin.b);
    px(g, cx - 4, 2, 8, 1, skin.l);
    // eyes (face right; flipped at draw time for left)
    px(g, cx - 1, 5, 1, 1, '#14100c'); px(g, cx + 2, 5, 1, 1, '#14100c');
    const lk = pl.look || {};
    if (lk.beard === 'full') px(g, cx - 3, 7, 6, 2, lk.hairColor || '#16110e');
    else if (lk.beard === 'stubble') px(g, cx - 2, 7, 4, 1, lk.hairColor || '#16110e');
    else if (lk.beard === 'goatee') px(g, cx - 1, 7, 3, 1, lk.hairColor || '#16110e');
    else if (lk.beard === 'mustache') px(g, cx, 6, 2, 1, lk.hairColor || '#16110e');
  }

  function drawBall(g, x, y) {
    px(g, x, y, 5, 5, OUT);
    px(g, x + 1, y + 1, 3, 3, BALL);
    px(g, x + 1, y + 1, 3, 1, BALL_L);
    px(g, x + 2, y + 1, 1, 3, BALL_D); px(g, x + 1, y + 2, 3, 1, BALL_D);
  }

  function renderSprite(pl, tl, pose, frame, hasBall) {
    const key = lookKey(pl, tl) + `|${pose}|${frame % 4}|${hasBall ? 1 : 0}`;
    let c = cache.get(key);
    if (c) return c;
    c = mkCanvas(W, H);
    const g = c.getContext('2d');
    g.clearRect(0, 0, W, H);
    const skin = skinSet(pl);
    const u = uni(pl, tl);
    // resolve team headband trim placeholder by re-tint: draw then replace? simpler: pre-resolve
    hairBack(g, pl, skin);
    drawLegs(g, pl, u, pose, frame, skin);
    drawTorso(g, pl, u, pose, frame, skin);
    drawHead(g, pl, skin);
    drawArms(g, pl, u, pose, frame, skin, hasBall);
    // hair cap after face so it overlaps forehead
    const lk = pl.look || {};
    const hbKeep = lk.headband;
    if (hbKeep === 'team') pl = { look: Object.assign({}, lk, { headband: u.trim }) };
    // repaint 1px headband-aware hair top: draw over with temp canvas trick — just draw top now
    // (hairBack already behind; draw top strip)
    const g2 = g;
    const cx = 10, hc = (pl.look || {}).hairColor || '#16110e';
    // reuse hairTop but it references pl — call with resolved pl
    const saveLook = pl.look;
    hairTop(g2, { look: saveLook });
    // fix placeholder (only when original asked team): hairTop used '__TEAMTRIM__' fallback already handled above
    void cx; void hc;
    cache.set(key, c);
    if (cache.size > 900) { const k = cache.keys().next().value; cache.delete(k); }
    return c;
  }

  /** Draw a player sprite. opts: {pose, frame, dir(1|-1), scale, hasBall, alpha} */
  function draw(g, pl, tl, x, y, opts) {
    opts = opts || {};
    const pose = opts.pose || 'stand';
    const frame = opts.frame | 0;
    const spr = renderSprite(pl, tl, pose, frame, !!opts.hasBall);
    const s = opts.scale || 3;
    const w = W * s, h = H * s;
    g.save();
    if (opts.alpha != null) g.globalAlpha = opts.alpha;
    g.imageSmoothingEnabled = false;
    if ((opts.dir || 1) < 0) {
      g.translate(Math.round(x + w / 2), Math.round(y));
      g.scale(-1, 1);
      g.drawImage(spr, Math.round(-w / 2), Math.round(y - y + 0), w, h);
    } else {
      g.drawImage(spr, Math.round(x - w / 2), Math.round(y), w, h);
    }
    g.restore();
  }

  /** Loose ball draw (4x4 grid scaled). */
  function drawLooseBall(g, x, y, s) {
    s = s || 3;
    const c = mkCanvas(5, 5);
    const gg = c.getContext('2d');
    drawBall(gg, 0, 0);
    g.save(); g.imageSmoothingEnabled = false;
    g.drawImage(c, Math.round(x - 2.5 * s), Math.round(y - 2.5 * s), 5 * s, 5 * s);
    g.restore();
  }

  const portraitCache = new Map();
  /** Pixel player-card portrait, kept in the same palette and silhouette family as the court sprites. */
  function portrait(pl, tl, size) {
    size = Math.max(24, size || 64);
    const key = lookKey(pl, tl) + `|portrait|${size}`;
    const hit = portraitCache.get(key);
    if (hit) return hit;
    const c = mkCanvas(size, size), g = c.getContext('2d');
    const u = uni(pl, tl);
    g.imageSmoothingEnabled = false;
    g.fillStyle = shade(u.jersey, -0.58); g.fillRect(0, 0, size, size);
    g.fillStyle = shade(u.trim, -0.55);
    for (let y = 0; y < size; y += 6) for (let x = (y / 6 % 2) * 3; x < size; x += 6) g.fillRect(x, y, 2, 2);
    const spr = renderSprite(pl, tl, 'stand', 1, false);
    const sc = Math.max(2, Math.floor(size / 22));
    const w = W * sc, h = H * sc;
    g.drawImage(spr, Math.round((size - w) / 2), Math.max(-3, size - h + 2), w, h);
    const out = c.toDataURL('image/png');
    portraitCache.set(key, out);
    if (portraitCache.size > 700) portraitCache.delete(portraitCache.keys().next().value);
    return out;
  }

  /** Big preview for the player editor. */
  function preview(canvas, pl, tl, pose) {
    const s = Math.max(2, Math.floor(Math.min(canvas.width / W, canvas.height / H)));
    const g = canvas.getContext('2d');
    g.clearRect(0, 0, canvas.width, canvas.height);
    // checker backdrop like Piskel/Aseprite
    g.fillStyle = '#11141c'; g.fillRect(0, 0, canvas.width, canvas.height);
    g.fillStyle = '#181d29';
    for (let yy = 0; yy < canvas.height; yy += 16) for (let xx = 0; xx < canvas.width; xx += 16) if (((xx + yy) / 16) % 2) g.fillRect(xx, yy, 16, 16);
    const spr = renderSprite(pl, tl, pose || 'stand', 1, true);
    g.imageSmoothingEnabled = false;
    const w = W * s, h = H * s;
    g.drawImage(spr, Math.round((canvas.width - w) / 2), Math.round(canvas.height - h - 6), w, h);
  }

  function lum(hex) {
    const n = parseInt(String(hex).slice(1), 16);
    return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  }

  M.Match.Pixel = { W, H, draw, drawLooseBall, preview, portrait, renderSprite, cache, SKIN, pixText, textW };
})();
