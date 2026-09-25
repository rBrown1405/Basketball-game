/* Pro BBALL Coach - mini-games court kit: DPR-aware Canvas2D helper and the fake-3D half court (PBC.Mini.court):
   perspective Projector, floor + hoop, puck player tokens with shadows, ball + ground shadow, parabolic Flights.
   Court space is in feet: x across the floor (0 = rim), y out from the baseline, z up. Needs core.js. */
(function () {
  'use strict';
  const Mini = window.PBC.Mini, U = Mini.util, C = Mini.color;
  const K = (Mini.court = {});
  const TAU = Math.PI * 2;
  const RIM = (Mini.RIM = { x: 0, y: 5.25, z: 10, r: 0.75 });   // rim centre 5.25 ft off the baseline, 10 ft up, 18 in ring
  const BOARD = { y: 4, hw: 3, z0: 9.5, z1: 13 };                // backboard plane 4 ft off the baseline, 6 x 3.5 ft
  const BALL_R = 0.5;                                            // a touch bigger than life so it reads on phones
  const NET = { n: 12, len: 1.55, rb: 0.42 };
  const LINE = '#f3eee4', PAINT = '#1c3d68';
  const theme = () => Mini._theme || Mini.theme();
  K.RIM = RIM; K.BOARD = BOARD; K.BALL_R = BALL_R;
  /** Display font stack for canvas text (the app's --font-display). */
  K.font = () => theme().fontDisplay;

  // =============================================================================== Canvas2D
  /**
   * Canvas that fills `parent` (a positioned element) at devicePixelRatio. onResize(w, h, cv) rebuilds size-dependent
   * state (projector, static layers) and runs synchronously on creation and on every resize, followed by cv.onRedraw()
   * so a resize never shows a blank frame. The ResizeObserver lives as long as `scope`.
   */
  class Canvas2D {
    constructor(parent, scope, onResize) {
      this.parent = parent;
      this.scope = scope || null;
      this.onResize = typeof onResize === 'function' ? onResize : null;
      this.onRedraw = null;
      this.cv = U.el('canvas', 'pm-cv');
      this.g = this.cv.getContext('2d');
      this.w = 0; this.h = 0; this.dpr = 1;
      parent.appendChild(this.cv);
      this.fit();
      const refit = () => this._run(() => { if (this.fit()) this.redraw(); });
      if (window.ResizeObserver) {
        const ro = new ResizeObserver(refit);
        ro.observe(parent);
        if (this.scope) this.scope.onCleanup(() => ro.disconnect());
      } else if (this.scope) this.scope.on(window, 'resize', refit);
    }
    _run(fn) { return this.scope ? this.scope.guard(fn) : fn(); }
    /** Match the parent's size / DPR; true when the backing store changed (onResize has run). */
    fit(force) {
      const w = this.parent.clientWidth, h = this.parent.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
      if (w < 2 || h < 2) return false;
      if (!force && w === this.w && h === this.h && dpr === this.dpr) return false;
      this.w = w; this.h = h; this.dpr = dpr;
      this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr);
      this.cv.style.width = w + 'px'; this.cv.style.height = h + 'px';
      if (this.onResize) this.onResize(w, h, this);
      return true;
    }
    redraw() { if (this.onRedraw) this.onRedraw(); }
    /** Start a frame: cleared context in CSS pixels. */
    begin() {
      const g = this.g;
      if (this.w && Math.min(2, window.devicePixelRatio || 1) !== this.dpr) this.fit(true);   // moved to another screen
      g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      g.clearRect(0, 0, this.w, this.h);
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.shadowBlur = 0; g.shadowColor = 'transparent';
      g.setLineDash([]);
      return g;
    }
    /** Offscreen canvas of the same size, painted once by fn(g, w, h) (CSS pixels). Use with blit(). */
    layer(fn) {
      const c = document.createElement('canvas');
      c.width = this.cv.width; c.height = this.cv.height;
      const g = c.getContext('2d');
      g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      if (fn) fn(g, this.w, this.h);
      return c;
    }
    /** Draw a layer() under the current transform. */
    blit(layer) { if (layer && this.w) this.g.drawImage(layer, 0, 0, this.w, this.h); }
    /** Pointer / mouse event → canvas CSS-pixel coordinates. */
    local(e) {
      const r = this.cv.getBoundingClientRect();
      return { x: (e.clientX - r.left) * (r.width ? this.w / r.width : 1), y: (e.clientY - r.top) * (r.height ? this.h / r.height : 1) };
    }
  }
  Mini.Canvas2D = K.Canvas2D = Canvas2D;

  // =============================================================================== Projector
  /**
   * Perspective camera behind the play, looking down toward the basket, scaled so every framing point fits the canvas.
   * o = { fit: [[x, y, z], ...] floor area to frame (also sets the look-at point), extra: more points to keep in view,
   *       camBack: camera distance behind the nearest fit point (ft), camH: camera height (ft),
   *       zTop: top of the hoop to keep in view (default 13.5), pad: { l, r, t, b } px kept free for the UI }.
   * p(x, y, z) → { x, y, s } (s = px per ft at that depth), inv(sx, sy) → floor point { x, y }.
   */
  class Projector {
    constructor(w, h, o) {
      o = o || {};
      this.w = w; this.h = h;
      const fit = Array.isArray(o.fit) && o.fit.length ? o.fit : [[-25, -1, 0], [25, -1, 0], [-22, 30, 0], [22, 30, 0]];
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const q of fit) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }
      this.cx = (x0 + x1) / 2;
      this.cy = y1 + Math.max(2, U.num(o.camBack, 28));
      this.cz = Math.max(2, U.num(o.camH, 30));
      const dy = this.cy - (y0 + y1) / 2, len = Math.hypot(dy, this.cz);
      this.cp = dy / len; this.sp = this.cz / len;   // cos / sin of the downward pitch
      this.k = 1; this.ox = 0; this.oy = 0;
      const zTop = U.num(o.zTop, BOARD.z1 + 0.5);
      const pts = fit.concat(Array.isArray(o.extra) ? o.extra : [], [[-BOARD.hw, BOARD.y, zTop], [BOARD.hw, BOARD.y, zTop]]);
      let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
      for (const q of pts) { const p = this.p(q[0], q[1], q[2] || 0); a = Math.min(a, p.x); b = Math.max(b, p.x); c = Math.min(c, p.y); d = Math.max(d, p.y); }
      const pad = Object.assign({ l: 12, r: 12, t: 12, b: 12 }, o.pad || {});
      const aw = Math.max(20, w - pad.l - pad.r), ah = Math.max(20, h - pad.t - pad.b);
      const k = Math.min(aw / Math.max(1e-6, b - a), ah / Math.max(1e-6, d - c));
      this.k = k;
      this.ox = pad.l + (aw - (b - a) * k) / 2 - a * k;
      this.oy = pad.t + (ah - (d - c) * k) / 2 - c * k;
      this.yLim = this.cy + (this.cz * this.sp - 1.5) / this.cp;   // floor beyond this is (nearly) behind the lens
    }
    p(x, y, z) {
      const dx = x - this.cx, dy = y - this.cy, dz = (z || 0) - this.cz;
      const depth = Math.max(0.35, -dy * this.cp - dz * this.sp), up = dz * this.cp - dy * this.sp, s = this.k / depth;
      return { x: this.ox + dx * s, y: this.oy - up * s, s };
    }
    inv(sx, sy) {
      const a = (sx - this.ox) / this.k, b = (this.oy - sy) / this.k, den = this.sp - b * this.cp;
      const depth = den > 1e-4 ? Math.min(this.cz / den, 2000) : 2000;   // above the horizon → far away (never NaN)
      return { x: this.cx + depth * a, y: this.cy - depth * (b * this.sp + this.cp) };
    }
  }
  Mini.Projector = K.Projector = Projector;

  // =============================================================================== drawing helpers
  function path(g, pts, close) {
    g.beginPath();
    for (let i = 0; i < pts.length; i++) { if (i) g.lineTo(pts[i].x, pts[i].y); else g.moveTo(pts[i].x, pts[i].y); }
    if (close) g.closePath();
  }
  function rrect(g, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    g.beginPath(); g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  /** Floor-parallel circle at (x, y, z) with radius r → screen ellipse { cx, cy, rx, ry }. */
  function ell(P, x, y, z, r) {
    const a = P.p(x - r, y, z), b = P.p(x + r, y, z), c = P.p(x, y - r, z), d = P.p(x, y + r, z), rx = Math.abs(b.x - a.x) / 2;
    return { cx: (a.x + b.x) / 2, cy: (c.y + d.y) / 2, rx, ry: Math.max(rx * 0.16, Math.abs(d.y - c.y) / 2) };
  }
  /** Floor polygon [[x, y], ...] clipped to what is in front of the lens, projected. */
  function floorPoly(P, pts, z) {
    const lim = P.yLim, out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length], ia = a[1] <= lim, ib = b[1] <= lim;
      if (ia) out.push(a);
      if (ia !== ib) { const t = (lim - a[1]) / (b[1] - a[1]); out.push([a[0] + (b[0] - a[0]) * t, lim]); }
    }
    return out.map(q => P.p(q[0], q[1], z || 0));
  }
  /** Stroke a floor polyline [[x, y], ...]; the part behind the lens is skipped. */
  function floorLine(g, P, pts, z) {
    let pen = false;
    g.beginPath();
    for (const q of pts) {
      if (q[1] > P.yLim) { pen = false; continue; }
      const p = P.p(q[0], q[1], z || 0);
      if (pen) g.lineTo(p.x, p.y); else { g.moveTo(p.x, p.y); pen = true; }
    }
    g.stroke();
  }
  const seg = (x0, y0, x1, y1, n) => { const o = []; for (let i = 0; i <= n; i++) o.push([U.lerp(x0, x1, i / n), U.lerp(y0, y1, i / n)]); return o; };
  const arc = (cx, cy, r, a0, a1, n) => { const o = []; for (let i = 0; i <= n; i++) { const a = U.lerp(a0, a1, i / n); o.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return o; };
  const quad = (P, x0, x1, y0, y1, z0, z1) => (y0 === y1
    ? [P.p(x0, y0, z0), P.p(x1, y0, z0), P.p(x1, y0, z1), P.p(x0, y0, z1)]    // vertical face at y0
    : [P.p(x0, y0, z1), P.p(x1, y0, z1), P.p(x1, y1, z1), P.p(x0, y1, z1)]);  // horizontal face at z1

  // =============================================================================== arena + court (static layer)
  /** Dark arena behind everything (cheap: gradients only, fine to repaint every frame). */
  K.drawBackdrop = function (g, P, T) {
    T = T || theme();
    const w = P.w, h = P.h, hy = U.clamp(P.p(0, -45, 0).y / h, 0.05, 0.95);
    const bg = g.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#03050a'); bg.addColorStop(hy, C.mix(T.bg, '#1b2944', 0.55)); bg.addColorStop(1, '#05080e');
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    const r = Math.max(w, h) * 0.45;
    for (const fx of [0.15, 0.5, 0.85]) {
      const x = w * fx, lg = g.createRadialGradient(x, -h * 0.03, 0, x, -h * 0.03, r);
      lg.addColorStop(0, 'rgba(255,222,172,0.12)'); lg.addColorStop(1, 'rgba(255,222,172,0)');
      g.fillStyle = lg; g.fillRect(0, 0, w, h);
    }
  };

  /** Empty practice-gym stands behind the baseline (same rows the free-throw crowd sits in). */
  function drawSeats(g, P) {
    for (let r = 7; r >= 0; r--) {
      const y = -12 - r * 2.6, z = 1.4 + r * 2.1;
      path(g, [P.p(-46, y + 1.3, z - 1.4), P.p(46, y + 1.3, z - 1.4), P.p(46, y + 1.3, z + 0.2), P.p(-46, y + 1.3, z + 0.2)], true);
      g.fillStyle = r % 2 ? '#0d1320' : '#0f1626'; g.fill();
      for (let x = -40; x <= 40; x += 2) {
        const p = P.p(x + (r % 2), y, z + 0.55), sw = 0.62 * p.s, sh = 0.8 * p.s;
        g.fillStyle = (x / 2 + r) % 3 ? '#1a2335' : '#202a40';
        g.fillRect(p.x - sw / 2, p.y - sh / 2, sw, sh);
      }
    }
    const top = P.p(0, -34, 18).y, bot = P.p(0, -10, 0).y, sh = g.createLinearGradient(0, top, 0, bot);
    sh.addColorStop(0, 'rgba(3,5,10,0.78)'); sh.addColorStop(1, 'rgba(3,5,10,0.35)');
    g.fillStyle = sh; g.fillRect(0, 0, P.w, bot);
  }

  /** LED ad boards along the far end, standing on the apron (in front of the stands, behind the stanchion). */
  function drawBoards(g, P, T) {
    const y = -8.5, face = quad(P, -30, 30, y, y, 0, 2.4);
    path(g, face, true); g.fillStyle = '#0a0f1b'; g.fill();
    const strip = quad(P, -30, 30, y, y, 0.55, 1.85), lg = g.createLinearGradient(strip[0].x, 0, strip[1].x, 0);
    lg.addColorStop(0, C.rgba(T.accent, 0.1)); lg.addColorStop(0.5, C.rgba(T.accent2, 0.42)); lg.addColorStop(1, C.rgba(T.accent, 0.1));
    path(g, strip, true); g.fillStyle = lg; g.fill();
    const c = P.p(0, y, 1.2), fs = Math.round(U.clamp(0.95 * c.s, 7, 26));
    g.font = `900 ${fs}px ${K.font()}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(255,240,220,0.85)';
    for (const x of [-18, 0, 18]) { const p = P.p(x, y, 1.2); g.fillText(x ? 'PRO BBALL COACH' : 'PRACTICE', p.x, p.y); }
    g.strokeStyle = 'rgba(255,255,255,0.14)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(face[3].x, face[3].y); g.lineTo(face[2].x, face[2].y); g.stroke();
  }

  /**
   * Floor, lines, paint and apron (plus the backdrop and empty stands unless opts.noBg, for drills that paint their own
   * background every frame). opts.paint overrides the lane colour.
   */
  K.drawCourt = function (g, P, T, opts) {
    T = T || theme(); opts = opts || {};
    g.save();
    if (!opts.noBg) { K.drawBackdrop(g, P, T); drawSeats(g, P); }
    const near = Math.min(P.yLim, 90), end = Math.min(47, near);
    // apron (out of bounds) and the ad boards at the far end
    const ap = floorPoly(P, [[-40, -9], [40, -9], [40, near], [-40, near]]);
    const fy = P.p(0, -9, 0).y, ny = P.p(0, Math.min(near, 40), 0).y;
    let gr = g.createLinearGradient(0, fy, 0, ny);
    gr.addColorStop(0, '#231811'); gr.addColorStop(1, '#3d2a1b');
    path(g, ap, true); g.fillStyle = gr; g.fill();
    drawBoards(g, P, T);
    // hardwood
    const fl = floorPoly(P, [[-25, 0], [25, 0], [25, 47], [-25, 47]]);
    gr = g.createLinearGradient(0, P.p(0, 0, 0).y, 0, P.p(0, end, 0).y);
    gr.addColorStop(0, '#7d5331'); gr.addColorStop(1, '#a8743f');
    path(g, fl, true); g.fillStyle = gr; g.fill();
    g.save(); path(g, fl, true); g.clip();
    g.lineWidth = 1;
    for (let x = -25, i = 0; x <= 25; x += 1.25, i++) { g.strokeStyle = i % 3 ? 'rgba(40,20,5,0.1)' : 'rgba(255,230,190,0.06)'; floorLine(g, P, seg(x, 0, x, end, 4)); }
    const mid = P.p(0, 17, 0), sheen = g.createRadialGradient(mid.x, mid.y, 0, mid.x, mid.y, P.w * 0.55);
    sheen.addColorStop(0, 'rgba(255,236,205,0.12)'); sheen.addColorStop(1, 'rgba(255,236,205,0)');
    g.fillStyle = sheen; g.fillRect(0, 0, P.w, P.h);
    g.restore();
    // paint
    path(g, floorPoly(P, [[-8, 0], [8, 0], [8, 19], [-8, 19]]), true);
    g.fillStyle = C.rgba(opts.paint || PAINT, 0.9); g.fill();
    // lines
    const lw = U.clamp(0.2 * P.p(0, 15, 0).s, 1.2, 3.2);
    g.strokeStyle = C.rgba(LINE, 0.88); g.lineWidth = lw; g.lineJoin = 'round'; g.lineCap = 'butt';
    const lines = [
      seg(-25, 0, 25, 0, 12), seg(-25, 0, -25, 47, 24), seg(25, 0, 25, 47, 24), seg(-25, 47, 25, 47, 12),   // boundary
      seg(-8, 0, -8, 19, 8), seg(8, 0, 8, 19, 8), seg(-8, 19, 8, 19, 6),                                      // lane
      arc(0, 19, 6, 0, Math.PI, 28),                                                                            // free-throw circle (top)
      seg(-22, 0, -22, 14.2, 6), seg(22, 0, 22, 14.2, 6),                                                       // corner threes
      arc(RIM.x, RIM.y, 23.75, Math.atan2(14.2 - RIM.y, 22), Math.PI - Math.atan2(14.2 - RIM.y, 22), 64),       // arc
      arc(RIM.x, RIM.y, 4, 0, Math.PI, 20), seg(-4, RIM.y, -4, BOARD.y, 1), seg(4, RIM.y, 4, BOARD.y, 1),       // restricted area
      arc(0, 47, 6, 0, TAU, 48), arc(0, 47, 2, 0, TAU, 24),                                                     // centre circles
    ];
    for (const y of [7, 8, 11, 14]) lines.push(seg(-8.8, y, -8, y, 1), seg(8, y, 8.8, y, 1));                  // lane hash marks
    lines.forEach(l => floorLine(g, P, l));
    g.setLineDash([lw * 3, lw * 3]);
    floorLine(g, P, arc(0, 19, 6, Math.PI, TAU, 28));                                                          // free-throw circle (in the lane)
    g.restore();
  };

  // =============================================================================== hoop
  function drawRim(g, P, front) {
    const pts = [], s = P.p(RIM.x, RIM.y, RIM.z).s, lw = Math.max(2, 0.11 * s);
    for (let i = 0; i <= 28; i++) { const a = (front ? 0 : Math.PI) + (i / 28) * Math.PI; pts.push(P.p(RIM.x + Math.cos(a) * RIM.r, RIM.y + Math.sin(a) * RIM.r, RIM.z)); }
    g.save();
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.strokeStyle = '#7a2406'; g.lineWidth = lw + 1.6; path(g, pts); g.stroke();
    g.strokeStyle = '#ff5a1f'; g.lineWidth = lw; path(g, pts); g.stroke();
    if (front) {
      g.strokeStyle = 'rgba(255,205,170,0.75)'; g.lineWidth = Math.max(1, lw * 0.32);
      path(g, pts.map(p => ({ x: p.x, y: p.y - lw * 0.28 }))); g.stroke();
    }
    g.restore();
  }
  /** Diamond-mesh net; sw (0..1) = swish: the net stretches down and snaps back. */
  function drawNet(g, P, sw, front) {
    const n = NET.n, hs = Math.PI / n, s = P.p(RIM.x, RIM.y, RIM.z).s;
    const drop = 0.55 * sw, flick = 0.14 * sw * Math.sin(sw * 10);
    const zt = RIM.z - 0.04, zm = RIM.z - NET.len * 0.5 - drop * 0.45, zb = RIM.z - NET.len - drop;
    const rt = RIM.r * 0.96, rm = RIM.r * 0.74 - 0.05 * sw, rb = NET.rb - 0.12 * sw;
    const at = (r, a, z, dx) => P.p(RIM.x + Math.cos(a) * r + (dx || 0), RIM.y + Math.sin(a) * r, z);
    g.save();
    g.lineWidth = Math.max(0.8, 0.05 * s); g.lineJoin = 'round'; g.lineCap = 'round';
    g.strokeStyle = front ? 'rgba(246,248,252,0.9)' : 'rgba(200,208,222,0.42)';
    g.beginPath();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      if ((Math.sin(a) > 1e-6) !== front) continue;
      const t0 = at(rt, a, zt), m1 = at(rm, a + hs, zm, flick), m2 = at(rm, a - hs, zm, flick), b0 = at(rb, a, zb, flick * 1.6);
      g.moveTo(t0.x, t0.y); g.lineTo(m1.x, m1.y); g.lineTo(b0.x, b0.y);
      g.moveTo(t0.x, t0.y); g.lineTo(m2.x, m2.y); g.lineTo(b0.x, b0.y);
    }
    for (let i = 0; i <= 16; i++) {   // bottom hem
      const a = (front ? 0 : Math.PI) + (i / 16) * Math.PI, p = at(rb, a, zb, flick * 1.6);
      if (i) g.lineTo(p.x, p.y); else g.moveTo(p.x, p.y);
    }
    g.stroke();
    g.restore();
  }
  /** Stanchion, backboard, the back half of the rim and net (static layer, drawn before players and ball). */
  K.drawHoopBack = function (g, P) {
    const T = theme(), s = P.p(RIM.x, RIM.y, RIM.z).s;
    g.save();
    g.lineCap = 'round';
    // padded stanchion base behind the baseline, post and arm
    path(g, quad(P, -2.3, 2.3, -7.4, -4.6, 0, 3.2), true); g.fillStyle = '#243049'; g.fill();
    path(g, quad(P, -2.3, 2.3, -4.6, -4.6, 0, 3.2), true); g.fillStyle = '#161e2f'; g.fill();
    path(g, quad(P, -2.3, 2.3, -4.6, -4.6, 1.2, 2.1), true); g.fillStyle = C.rgba(T.accent, 0.75); g.fill();
    const line = (a, b, w, col) => { const p = P.p(a[0], a[1], a[2]), q = P.p(b[0], b[1], b[2]); g.strokeStyle = col; g.lineWidth = Math.max(1.5, w * s); g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y); g.stroke(); };
    line([0, -6, 3.2], [0, -6, 12.4], 0.55, '#2a3550');
    line([0, -6, 12.4], [0, BOARD.y - 0.35, 11.9], 0.42, '#2f3b58');
    line([0, -6, 8.6], [0, BOARD.y - 0.35, 10.4], 0.26, '#2a3550');
    // glass backboard with the shooter's square
    const bq = quad(P, -BOARD.hw, BOARD.hw, BOARD.y, BOARD.y, BOARD.z0, BOARD.z1);
    path(g, bq, true); g.fillStyle = 'rgba(200,220,245,0.15)'; g.fill();
    g.strokeStyle = 'rgba(240,245,255,0.92)'; g.lineWidth = Math.max(1.5, 0.13 * s); g.lineJoin = 'round'; g.stroke();
    path(g, quad(P, -1, 1, BOARD.y, BOARD.y, RIM.z + 0.1, RIM.z + 1.6), true);
    g.lineWidth = Math.max(1.2, 0.1 * s); g.stroke();
    const gl = P.p(-BOARD.hw * 0.6, BOARD.y, BOARD.z1 - 0.3), gl2 = P.p(-BOARD.hw * 0.1, BOARD.y, BOARD.z0 + 0.4);
    g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = Math.max(2, 0.3 * s);
    g.beginPath(); g.moveTo(gl.x, gl.y); g.lineTo(gl2.x, gl2.y); g.stroke();   // glare
    line([0, BOARD.y, RIM.z - 0.15], [0, RIM.y - RIM.r, RIM.z - 0.05], 0.16, '#8a2a08');   // rim bracket
    g.restore();
    drawNet(g, P, 0, false);
    drawRim(g, P, false);
  };
  /** Front half of the net and rim; draw after a ball that is inside the hoop, before one that is in front of it. */
  K.drawHoopFront = function (g, P, swish) {
    drawNet(g, P, U.sat(U.num(swish, 0)), true);
    drawRim(g, P, true);
  };

  // =============================================================================== tokens, ball, rings, tags
  /**
   * Puck-style player token at floor spot (x, y). o = { fill, r (ft, 1.4), z (lift ft), text (painted on top), label
   * (name under it), glow (colour), alpha, ring (floor ring radius ft), ringColor, ringW }. The floor shadow stays down
   * and fades as the token lifts.
   */
  K.drawToken = function (g, P, x, y, o) {
    o = o || {};
    const T = theme(), r = Math.max(0.3, U.num(o.r, 1.4)), z = Math.max(0, U.num(o.z, 0)), H = r * 0.5;
    const fill = o.fill || T.accent;
    g.save();
    g.globalAlpha = U.sat(U.num(o.alpha, 1));
    if (o.ring) K.drawFloorRing(g, P, x, y, o.ring, { color: o.ringColor || fill, width: U.num(o.ringW, 2) });
    const lift = 1 / (1 + z * 0.16), sh = ell(P, x, y, 0, r * (0.92 + 0.22 * lift));
    g.fillStyle = `rgba(0,0,0,${(0.5 * lift).toFixed(3)})`;
    g.beginPath(); g.ellipse(sh.cx, sh.cy + sh.ry * 0.12, sh.rx, sh.ry, 0, 0, TAU); g.fill();
    const b = ell(P, x, y, z, r), t = ell(P, x, y, z + H, r);
    const side = g.createLinearGradient(b.cx - b.rx, 0, b.cx + b.rx, 0);
    side.addColorStop(0, C.shade(fill, -0.62)); side.addColorStop(0.4, C.shade(fill, -0.28)); side.addColorStop(1, C.shade(fill, -0.58));
    g.fillStyle = side;
    g.beginPath(); g.ellipse(b.cx, b.cy, b.rx, b.ry, 0, 0, Math.PI); g.lineTo(t.cx - t.rx, t.cy); g.lineTo(t.cx + t.rx, t.cy); g.closePath(); g.fill();
    if (o.glow) { g.shadowColor = o.glow; g.shadowBlur = Math.max(10, t.rx * 0.9); }
    const top = g.createLinearGradient(0, t.cy - t.ry, 0, t.cy + t.ry);
    top.addColorStop(0, C.shade(fill, 0.25)); top.addColorStop(1, fill);
    g.fillStyle = top; g.beginPath(); g.ellipse(t.cx, t.cy, t.rx, t.ry, 0, 0, TAU); g.fill();
    g.shadowBlur = 0; g.shadowColor = 'transparent';
    g.lineWidth = Math.max(1, t.rx * 0.07); g.strokeStyle = o.glow || 'rgba(255,255,255,0.55)'; g.stroke();
    g.lineWidth = 1; g.strokeStyle = 'rgba(255,255,255,0.2)';
    g.beginPath(); g.ellipse(t.cx, t.cy, t.rx * 0.76, t.ry * 0.76, 0, 0, TAU); g.stroke();
    if (o.text != null && o.text !== '') {   // painted on the top face (squashed a little with the perspective)
      const txt = String(o.text), fs = U.clamp(t.rx * (txt.length > 2 ? 0.58 : 0.78), 7, 30);
      g.font = `900 ${Math.round(fs)}px ${K.font()}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = C.lum(fill) > 0.62 ? '#10131a' : '#ffffff';
      g.save(); g.translate(t.cx, t.cy + fs * 0.04); g.scale(1, U.clamp(0.55 + 0.45 * t.ry / t.rx, 0.55, 1)); g.fillText(txt, 0, 0); g.restore();
    }
    if (o.label) {
      const txt = String(o.label).toUpperCase(), fs = Math.round(U.clamp(t.rx * 0.42, 9, 13));
      g.font = `800 ${fs}px ${K.font()}`; g.textAlign = 'center'; g.textBaseline = 'top';
      const tw = g.measureText(txt).width, ly = Math.max(b.cy + b.ry, sh.cy + sh.ry) + 3;
      g.fillStyle = 'rgba(6,9,15,0.62)'; rrect(g, b.cx - tw / 2 - 4, ly - 1, tw + 8, fs + 4, 4); g.fill();
      g.fillStyle = C.rgba(T.text, 0.95); g.fillText(txt, b.cx, ly + 1);
    }
    g.restore();
  };

  /** Ball centred at (x, y, z) with a ground shadow that shrinks / fades with height. o = { rot, shadow (x strength) }. */
  K.drawBall = function (g, P, x, y, z, o) {
    o = o || {};
    const sk = Math.max(0, U.num(o.shadow, 1)), zz = Math.max(0, U.num(z, 0));
    const se = ell(P, x, y, 0, BALL_R * (0.85 + 0.035 * zz) * (1 + 0.4 * Math.max(0, sk - 1)));
    const sa = U.clamp(U.clamp(0.5 - 0.024 * zz, 0.12, 0.5) * (sk > 1 ? 1 + 0.45 * (sk - 1) : sk), 0, 0.85);
    g.save();
    g.fillStyle = `rgba(0,0,0,${sa.toFixed(3)})`;
    g.beginPath(); g.ellipse(se.cx, se.cy, se.rx, se.ry, 0, 0, TAU); g.fill();
    const c = P.p(x, y, Math.max(zz, BALL_R * 0.85)), r = Math.max(3, BALL_R * c.s);   // never sinks into the floor
    const gr = g.createRadialGradient(c.x - r * 0.35, c.y - r * 0.4, r * 0.1, c.x, c.y, r);
    gr.addColorStop(0, '#ffb57a'); gr.addColorStop(0.55, '#f0661a'); gr.addColorStop(1, '#9c3b0a');
    g.fillStyle = gr; g.beginPath(); g.arc(c.x, c.y, r, 0, TAU); g.fill();
    if (r >= 4.5) {   // seams, spun by o.rot
      g.save(); g.beginPath(); g.arc(c.x, c.y, r, 0, TAU); g.clip();
      g.translate(c.x, c.y); g.rotate(U.num(o.rot, 0));
      g.strokeStyle = 'rgba(40,14,2,0.72)'; g.lineWidth = Math.max(0.8, r * 0.09);
      g.beginPath(); g.moveTo(-r, 0); g.lineTo(r, 0); g.moveTo(0, -r); g.lineTo(0, r); g.stroke();
      g.beginPath(); g.ellipse(-r * 0.98, 0, r * 0.52, r * 0.98, 0, -Math.PI / 2, Math.PI / 2); g.stroke();
      g.beginPath(); g.ellipse(r * 0.98, 0, r * 0.52, r * 0.98, 0, Math.PI / 2, Math.PI * 1.5); g.stroke();
      g.restore();
    }
    g.strokeStyle = 'rgba(40,14,2,0.55)'; g.lineWidth = 1; g.beginPath(); g.arc(c.x, c.y, r, 0, TAU); g.stroke();
    g.restore();
  };

  /** Circle of radius r ft on the floor (true perspective). o = { color, width, dash, fill, z }. */
  K.drawFloorRing = function (g, P, x, y, r, o) {
    o = o || {};
    r = Math.max(0.05, U.num(r, 1));
    const n = U.clamp(Math.round(18 + r * 4), 24, 72), z = U.num(o.z, 0), pts = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * TAU; pts.push(P.p(x + Math.cos(a) * r, y + Math.sin(a) * r, z)); }
    g.save();
    path(g, pts, true);
    if (o.fill) { g.fillStyle = o.fill; g.fill(); }
    if (o.color || !o.fill) {
      g.strokeStyle = o.color || 'rgba(255,255,255,0.7)'; g.lineWidth = U.num(o.width, 2);
      if (o.dash) g.setLineDash(o.dash);
      g.stroke();
    }
    g.restore();
  };

  /** Pill label at a court point (x, y, z). o = { bg, color, size (px), dy (px offset) }. */
  K.drawTag = function (g, P, x, y, z, text, o) {
    o = o || {};
    const p = P.p(x, y, z), fs = Math.round(U.clamp(U.num(o.size, 11), 7, 40)), txt = String(text == null ? '' : text);
    g.save();
    g.font = `900 ${fs}px ${K.font()}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    const tw = g.measureText(txt).width, hh = Math.round(fs * 1.55), ww = tw + fs * 1.1, cy = p.y + U.num(o.dy, 0);
    g.fillStyle = o.bg || 'rgba(8,12,20,0.82)';
    rrect(g, p.x - ww / 2, cy - hh / 2, ww, hh, hh / 2); g.fill();
    g.fillStyle = o.color || '#ffffff'; g.fillText(txt, p.x, cy + fs * 0.05);
    g.restore();
  };

  // =============================================================================== flights
  /**
   * Ball path made of parabolic segments [{ a: {x,y,z}, b: {x,y,z}, h (arc height over the chord, ft), d (s), ev }].
   * step(dt) → events of the segments that ended during dt (in order); pos() → { x, y, z }; done; rot (spin angle).
   */
  class Flight {
    constructor(segs, spin) {
      this.segs = (segs || []).filter(s => s && s.a && s.b);
      this.i = 0; this.t = 0; this.rot = 0;
      this.spin = U.num(spin, 11);
      this.done = !this.segs.length;
    }
    step(dt) {
      const evs = [];
      if (this.done) return evs;
      dt = Math.max(0, U.num(dt, 0));
      this.t += dt; this.rot += dt * this.spin;
      while (!this.done) {
        const s = this.segs[this.i], d = Math.max(0, U.num(s.d, 0));
        if (this.t < d) break;
        this.t -= d;
        if (s.ev) evs.push(s.ev);
        if (++this.i >= this.segs.length) { this.done = true; this.i = this.segs.length - 1; this.t = d; }
      }
      return evs;
    }
    pos() {
      const s = this.segs[this.i];
      if (!s) return null;
      const d = Math.max(0, U.num(s.d, 0)), u = this.done || d <= 0 ? 1 : U.sat(this.t / d), h = U.num(s.h, 0);
      return { x: U.lerp(s.a.x, s.b.x, u), y: U.lerp(s.a.y, s.b.y, u), z: U.lerp(s.a.z || 0, s.b.z || 0, u) + 4 * h * u * (1 - u) };
    }
  }
  Mini.Flight = K.Flight = Flight;

  /**
   * Jump shot from the release point (x, y, z) for an outcome: 'swish' | 'make' (rolls in) | 'front' (short) | 'back'
   * (long) | 'air' (airball) | 'brick' (glass, then iron). k scales the hang time. Events: 'rim' / 'rim_in' / 'board',
   * 'net', 'floor'. Every outcome ends on the floor within ~2.3 s.
   */
  K.shotFlight = function (x, y, z, outcome, k) {
    k = U.clamp(U.num(k, 1), 0.4, 2.5);
    const a = { x: U.num(x, 0), y: U.num(y, 20), z: U.num(z, 8) };
    const dx = a.x - RIM.x, dy = a.y - RIM.y, D = Math.max(1, Math.hypot(dx, dy));
    const ux = dx / D, uy = dy / D, vx = -uy, vy = ux;   // u: rim → shooter (the front of the rim), v: sideways
    const T = (0.6 + 0.018 * D) * k, H = 2.2 + 0.2 * D, side = Math.random() < 0.5 ? -1 : 1;
    const at = (along, lat, zz) => ({ x: RIM.x + ux * along + vx * lat, y: RIM.y + uy * along + vy * lat, z: zz });
    const floor = (along, lat) => { const p = at(along, lat, 0); p.x = U.clamp(p.x, -23.5, 23.5); p.y = U.clamp(p.y, 1, 31); return p; };
    const through = (from, roll) => {   // down through the net, then a couple of bounces toward the shooter
      const low = { x: RIM.x, y: RIM.y, z: RIM.z - 2.4 }, f1 = floor(-0.7, side * 0.5), f2 = floor(2.2, side * 1.4);
      const segs = [{ a: from, b: low, h: 0, d: 0.13, ev: 'net' }, { a: low, b: f1, h: 0.25, d: 0.3, ev: 'floor' }, { a: f1, b: f2, h: 1.3, d: 0.42, ev: 'floor' }];
      if (roll) segs.push({ a: f2, b: floor(3.6, side * 2.1), h: 0.4, d: 0.26 });
      return segs;
    };
    const off = (hit, far, lat, h) => {   // off the iron / glass: pops up, out to the floor, one more bounce
      const f1 = floor(far, lat), f2 = floor(far + 3, lat * 1.3);
      return [{ a: hit, b: f1, h, d: 0.6 + far * 0.012, ev: 'floor' }, { a: f1, b: f2, h: 0.9, d: 0.36, ev: 'floor' }];
    };
    let segs;
    if (outcome === 'swish') {
      const top = { x: RIM.x, y: RIM.y, z: RIM.z + 0.45 };
      segs = [{ a, b: top, h: H, d: T }].concat(through(top, true));
    } else if (outcome === 'make') {
      const lip = at(-0.5, 0.2 * side, RIM.z + 0.35), hop = { x: RIM.x, y: RIM.y, z: RIM.z + 0.4 };
      segs = [{ a, b: lip, h: H, d: T, ev: 'rim_in' }, { a: lip, b: hop, h: 0.5, d: 0.22 }].concat(through(hop, false));
    } else if (outcome === 'back') {
      const hit = at(-0.62, 0.15 * side, RIM.z + 0.25);
      segs = [{ a, b: hit, h: H * 1.02, d: T * 1.02, ev: 'rim' }].concat(off(hit, U.rand(5, 9), side * U.rand(2, 5), U.rand(4, 5.2)));
    } else if (outcome === 'air') {
      const land = floor(3.2, side * 0.8), f2 = floor(5.8, side * 1.6);
      segs = [{ a, b: land, h: H + a.z * 0.5, d: T * 1.12, ev: 'floor' }, { a: land, b: f2, h: 0.9, d: 0.36, ev: 'floor' }];
    } else if (outcome === 'brick') {
      const glass = { x: RIM.x + side * U.rand(0.4, 1.2), y: BOARD.y + BALL_R + 0.05, z: RIM.z + U.rand(1, 1.8) }, iron = at(0.6, side * 0.3, RIM.z + 0.2);
      segs = [{ a, b: glass, h: H * 0.75, d: T * 0.92, ev: 'board' }, { a: glass, b: iron, h: 0.35, d: 0.17, ev: 'rim' }]
        .concat(off(iron, U.rand(8, 12), side * U.rand(1.5, 4.5), U.rand(4.2, 5.5)));
    } else {   // 'front' (and anything unknown): short, off the front rim
      const hit = at(0.62, 0.15 * side, RIM.z + 0.2);
      segs = [{ a, b: hit, h: H * 0.97, d: T * 0.97, ev: 'rim' }].concat(off(hit, U.rand(3.5, 6), side * U.rand(1, 3.2), U.rand(3.2, 4.2)));
    }
    return new Flight(segs);
  };

  // =============================================================================== court stage (court drills)
  /**
   * Court + nameplate + cue stage for the court drills: appends .pm-cstage to api.stage and returns
   * st = { wrap, cv (Canvas2D), P (Projector), layer (court + hoop back), plate(kicker, name, sub), cue(text, tone) }.
   * proj(w, h) returns the Projector options for the current size; courtOpts go to drawCourt.
   */
  K.courtStage = function (api, proj, courtOpts) {
    const wrap = U.el('div', 'pm-cstage', '<div class="pm-cstage__court"></div><div class="pm-shoot__plate"><small></small><b></b><span></span></div><div class="pm-cstage__cue"></div>');
    api.stage.appendChild(wrap);
    const st = { wrap, P: null, layer: null, cv: null };
    st.cv = api.canvas(wrap.children[0], (w, h, cv) => {
      st.P = new Projector(w, h, typeof proj === 'function' ? proj(w, h) : proj);
      st.layer = cv.layer(g => { K.drawCourt(g, st.P, api.theme, courtOpts || {}); K.drawHoopBack(g, st.P); });
    });
    const plate = wrap.children[1], cue = wrap.children[2];
    let cueKey = null;
    st.plate = (kick, name, sub) => {
      plate.children[0].textContent = kick == null ? '' : kick;
      plate.children[1].textContent = name == null ? '' : name;
      plate.children[2].textContent = sub == null ? '' : sub;
    };
    st.cue = (text, tone) => {   // called every frame by some drills: only touch the DOM on a change
      const key = (text || '') + '|' + (tone || '');
      if (key === cueKey) return;
      cueKey = key;
      cue.textContent = text || '';
      cue.className = 'pm-cstage__cue' + (text ? ' is-on' : '') + (tone ? ' pm-tone-' + tone : '');
    };
    return st;
  };
})();
