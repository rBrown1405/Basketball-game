/* Pro BBALL Coach — match view: court floor (PBC.Match.Court).
 * A top-down hardwood texture is pre-rendered once; each frame the floor is drawn as horizontal
 * scanline strips (every constant-y floor line is a horizontal screen line), which gives true
 * perspective on a 2D canvas. Court lines are crisp vector polygons projected every frame. */
(function () {
  'use strict';
  const M = window.PBC.Match, U = M.U;

  const WOOD = {
    light: [226, 180, 122],
    medium: [207, 151, 93],
    dark: [158, 103, 60],
  };
  const FONT = '"Arial Black", "Helvetica Neue", Impact, Arial, sans-serif';

  class Court {
    constructor(gctx, opts) {
      opts = opts || {};
      this.g = gctx;
      const home = gctx.home || {};
      const court = home.court || {};
      this.paint = court.paint || (home.colors && home.colors.primary) || '#1d4e89';
      this.logoText = String(court.logoText || home.abbr || 'PBC').toUpperCase();
      this.wood = WOOD[court.wood] || WOOD.medium;
      this.colors = home.colors || { primary: this.paint, secondary: '#f2c14e', trim: '#ffffff' };
      this.city = String(home.city || '').toUpperCase();
      this.name = String(home.name || '').toUpperCase();
      this.three = gctx.threePt || { arc: 23.75, corner: 22 };
      this.lineColor = '#f6f3ec';
      this.X0 = -18; this.X1 = 112; this.Y0 = -16; this.Y1 = 58;
      this.ppf = opts.quality === 'low' ? 9 : 14;
      this._pt = { x: 0, y: 0, s: 0, d: 0 };
      this.buildTexture();
      this.buildLines();
    }

    tx(x) { return (x - this.X0) * this.ppf; }
    ty(y) { return (this.Y1 - y) * this.ppf; }

    // ------------------------------------------------------------------ texture
    buildTexture() {
      const ppf = this.ppf;
      const W = Math.round((this.X1 - this.X0) * ppf), H = Math.round((this.Y1 - this.Y0) * ppf);
      const cv = U.makeCanvas(W, H);
      const g = cv.getContext('2d');
      const img = g.createImageData(W, H);
      const data = img.data;
      const base = this.wood;
      const plankW = 0.1875; // 2.25 inch boards along x
      const WX0 = -13, WX1 = 107, WY0 = -13.5, WY1 = 56.8; // hardwood extent
      const SIN = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) SIN[i] = Math.sin(i / 1024 * U.TAU);
      const sinT = (a) => SIN[((a / U.TAU * 1024) | 0) & 1023];
      const px2ft = 1 / ppf;
      for (let py = 0; py < H; py++) {
        const y = this.Y1 - (py + 0.5) * px2ft;
        const inY = y >= WY0 && y <= WY1;
        const rowF = (y + 200) / plankW;
        const row = Math.floor(rowF);
        const v = rowF - row; // across plank 0..1
        const seamY = v < px2ft / plankW * 0.9 ? 0.86 : 1; // plank side seam
        const rOff = U.hash2(row, 7) * 17;
        const segL = 3.2 + U.hash2(row, 11) * 7.5;
        const gPh1 = U.hash2(row, 3) * 6.28, gPh2 = U.hash2(row, 5);
        const rowTone = (U.hash2(row, 13) - 0.5) * 0.05;
        let o = py * W * 4;
        for (let px = 0; px < W; px++, o += 4) {
          const x = this.X0 + (px + 0.5) * px2ft;
          if (!inY || x < WX0 || x > WX1) {
            const n = (U.hash2(px * 7 + 1, py * 3 + 2) - 0.5) * 6;
            data[o] = 30 + n; data[o + 1] = 26 + n; data[o + 2] = 25 + n; data[o + 3] = 255;
            continue;
          }
          const sx = (x + rOff) / segL;
          const seg = Math.floor(sx);
          const within = (sx - seg) * segL;
          const segTone = (U.hash2(row * 131 + seg, 17) - 0.5) * 0.11 + rowTone;
          const warm = (U.hash2(seg, row * 3 + 1) - 0.5) * 0.05;
          // grain: streaks running along the board, gently wavering
          const gr = 0.5 + 0.5 * sinT(U.TAU * (v * 2.6 + 0.22 * sinT(x * 0.83 + gPh1) + gPh2) + x * 0.05);
          let k = 1 + segTone - 0.075 * gr * gr * gr * gr;
          // fine figure/flecks
          k += (U.hash2(px, py) - 0.5) * 0.035;
          // end joints
          if (within < px2ft * 1.1) k *= 0.8;
          k *= seamY;
          // broad, low-frequency tone variation (patches of lighter/darker boards)
          k *= 1 + 0.022 * sinT(x * 0.11 + 1.3) * sinT(y * 0.17 + 0.4);
          data[o] = base[0] * k * (1 + warm);
          data[o + 1] = base[1] * k;
          data[o + 2] = base[2] * k * (1 - warm * 0.6);
          data[o + 3] = 255;
        }
      }
      g.putImageData(img, 0, 0);
      this.tex = cv;
      this.paintTexture(g);
    }

    paintTexture(g) {
      const p = this.ppf, paint = this.paint;
      const sec = this.colors.secondary || '#ffffff';
      const tx = (x) => this.tx(x), ty = (y) => this.ty(y);
      const rect = (x0, y0, x1, y1, col, a) => {
        g.globalAlpha = a == null ? 1 : a;
        g.fillStyle = col;
        g.fillRect(tx(x0), ty(y1), (x1 - x0) * p, (y1 - y0) * p);
        g.globalAlpha = 1;
      };
      // wood sealant edge / borders
      // painted apron band around the court
      const B = 4.6;
      g.save();
      g.globalAlpha = 0.9;
      g.fillStyle = paint;
      g.beginPath();
      g.rect(tx(-B), ty(50 + B), (94 + 2 * B) * p, (50 + 2 * B) * p);
      g.rect(tx(0), ty(50), 94 * p, 50 * p);
      g.fill('evenodd');
      g.restore();
      // thin trim at the outer edge of the band
      g.save();
      g.strokeStyle = U.rgba(sec, 0.85);
      g.lineWidth = 0.22 * p;
      g.strokeRect(tx(-B + 0.25), ty(50 + B - 0.25), (94 + 2 * B - 0.5) * p, (50 + 2 * B - 0.5) * p);
      g.restore();

      // lanes (the paint)
      rect(0, 17, 19, 33, paint, 0.88);
      rect(75, 17, 94, 33, paint, 0.88);
      // subtle darker stain inside the lane tip area of the key (restricted arc highlight)
      // center circle + logo
      g.save();
      g.globalAlpha = 0.9;
      g.fillStyle = paint;
      g.beginPath(); g.arc(tx(47), ty(25), 6 * p, 0, U.TAU); g.fill();
      g.globalAlpha = 1;
      g.lineWidth = 0.42 * p;
      g.strokeStyle = sec;
      g.beginPath(); g.arc(tx(47), ty(25), 5.15 * p, 0, U.TAU); g.stroke();
      g.restore();
      this.drawLogo(g, tx(47), ty(25), p);

      // apron text
      g.save();
      const far = this.city || this.name;
      const txt = (s, x, y, size, rot, col) => {
        g.save();
        g.translate(tx(x), ty(y));
        g.rotate(rot);
        g.font = '900 ' + Math.round(size * p) + 'px ' + FONT;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillStyle = col;
        g.globalAlpha = 0.92;
        g.fillText(s, 0, 0);
        g.restore();
      };
      const textCol = U.contrast(paint, '#ffffff', '#101010');
      if (far) {
        txt(far, 23.5, 52.3, 2.9, 0, textCol);
        txt(far, 70.5, 52.3, 2.9, 0, textCol);
      }
      if (this.name) {
        txt(this.name, 47, 52.3, 2.9, 0, sec);
        // baselines, readable from the court
        txt(this.name, -2.3, 25, 2.8, -Math.PI / 2, textCol);
        txt(this.name, 96.3, 25, 2.8, Math.PI / 2, textCol);
      }
      txt('PRO BBALL COACH', 47, -2.4, 2.4, 0, U.rgba(textCol, 0.85));
      g.restore();

      // gloss/finish: very subtle overall lift and edge wear
      g.save();
      const grd = g.createRadialGradient(tx(47), ty(25), 10 * p, tx(47), ty(25), 70 * p);
      grd.addColorStop(0, 'rgba(255,240,215,0.06)');
      grd.addColorStop(1, 'rgba(0,0,0,0.10)');
      g.fillStyle = grd;
      g.fillRect(0, 0, this.tex.width, this.tex.height);
      g.restore();
    }

    drawLogo(g, cx, cy, p) {
      const sec = this.colors.secondary || '#ffffff';
      const trim = this.colors.trim || '#ffffff';
      const txt = this.logoText.slice(0, 4);
      g.save();
      g.translate(cx, cy);
      // inner disc
      const grd = g.createRadialGradient(0, -1 * p, 0.5 * p, 0, 0, 4.8 * p);
      grd.addColorStop(0, U.shade(this.paint, 0.12));
      grd.addColorStop(1, U.shade(this.paint, -0.18));
      g.fillStyle = grd;
      g.beginPath(); g.arc(0, 0, 4.7 * p, 0, U.TAU); g.fill();
      // letters
      let size = 3.6 * p;
      g.font = '900 ' + Math.round(size) + 'px ' + FONT;
      let w = g.measureText(txt).width;
      const maxW = 7.4 * p;
      if (w > maxW) { size *= maxW / w; g.font = '900 ' + Math.round(size) + 'px ' + FONT; }
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineJoin = 'round';
      g.lineWidth = size * 0.16;
      g.strokeStyle = U.shade(this.paint, -0.55);
      g.strokeText(txt, 0.12 * p, 0.2 * p);
      g.strokeStyle = trim;
      g.lineWidth = size * 0.1;
      g.strokeText(txt, 0, 0);
      g.fillStyle = sec;
      g.fillText(txt, 0, 0);
      // small team name arc text replaced by a straight caption
      if (this.name) {
        g.font = '800 ' + Math.round(0.85 * p) + 'px ' + FONT;
        g.fillStyle = U.rgba(trim, 0.9);
        g.fillText(this.name.slice(0, 16), 0, 3.25 * p);
      }
      g.restore();
    }

    // ------------------------------------------------------------------ lines
    buildLines() {
      const lw = 2 / 12;
      const polys = [];
      const rect = (x0, y0, x1, y1) => polys.push([x0, y0, x1, y0, x1, y1, x0, y1]);
      const ring = (cx, cy, r0, r1, a0, a1) => {
        const n = Math.max(4, Math.ceil(Math.abs(a1 - a0) * r1 / 0.9));
        const pts = [];
        for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; pts.push(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); }
        for (let i = n; i >= 0; i--) { const a = a0 + (a1 - a0) * i / n; pts.push(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); }
        polys.push(pts);
      };
      // boundary
      rect(-lw, -lw, 94 + lw, 0);
      rect(-lw, 50, 94 + lw, 50 + lw);
      rect(-lw, 0, 0, 50);
      rect(94, 0, 94 + lw, 50);
      // half-court line and circles
      rect(47 - lw / 2, 0, 47 + lw / 2, 50);
      ring(47, 25, 6 - lw, 6, 0, U.TAU);
      ring(47, 25, 2 - lw, 2, 0, U.TAU);
      // substitution box marks (near side, out of bounds)
      rect(43 - lw / 2, -3.5, 43 + lw / 2, 0);
      rect(51 - lw / 2, -3.5, 51 + lw / 2, 0);

      const half = [];
      const hrect = (x0, y0, x1, y1) => half.push([x0, y0, x1, y0, x1, y1, x0, y1]);
      const hring = (cx, cy, r0, r1, a0, a1) => {
        const n = Math.max(3, Math.ceil(Math.abs(a1 - a0) * r1 / 0.9));
        const pts = [];
        for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; pts.push(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); }
        for (let i = n; i >= 0; i--) { const a = a0 + (a1 - a0) * i / n; pts.push(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); }
        half.push(pts);
      };
      // lane
      hrect(0, 17, 19, 17 + lw);
      hrect(0, 33 - lw, 19, 33);
      hrect(19 - lw, 17, 19, 33);
      // free-throw circle: solid outside the lane, dashed inside
      hring(19, 25, 6 - lw, 6, -Math.PI / 2, Math.PI / 2);
      const dashes = 7;
      for (let i = 0; i < dashes; i++) {
        const a0 = Math.PI / 2 + (i + 0.2) / dashes * Math.PI, a1 = Math.PI / 2 + (i + 0.72) / dashes * Math.PI;
        hring(19, 25, 6 - lw, 6, a0, a1);
      }
      // restricted area
      hring(5.25, 25, 4 - lw, 4, -Math.PI / 2, Math.PI / 2);
      hrect(4, 21, 5.25, 21 + lw);
      hrect(4, 29 - lw, 5.25, 29);
      // three-point line
      const R = this.three.arc, C = this.three.corner;
      const xi = 5.25 + Math.sqrt(Math.max(0, R * R - C * C));
      hrect(0, 25 - C, xi, 25 - C + lw);
      hrect(0, 25 + C - lw, xi, 25 + C);
      const al = Math.asin(Math.min(1, C / R));
      hring(5.25, 25, R - lw, R, -al, al);
      // lane space marks
      hrect(7, 17 - 0.66, 8, 17);
      hrect(7, 33, 8, 33.66);
      [11, 14, 17].forEach((x) => { hrect(x, 17 - 0.5, x + lw, 17); hrect(x, 33, x + lw, 33.5); });
      // baseline hash marks 3 ft outside the lane
      hrect(0, 14 - lw, 0.5, 14);
      hrect(0, 36, 0.5, 36 + lw);
      // sideline marks 28 ft from the baseline
      hrect(28 - lw / 2, 0, 28 + lw / 2, 3);
      hrect(28 - lw / 2, 47, 28 + lw / 2, 50);

      for (const p of half) {
        polys.push(p.slice());
        // mirrored copy (reverse order keeps a consistent winding)
        const m = [];
        for (let i = p.length - 2; i >= 0; i -= 2) m.push(94 - p[i], p[i + 1]);
        polys.push(m);
      }
      this.polys = polys;
      let n = 0;
      for (const p of polys) n += p.length;
      this._scr = new Float32Array(n);
    }

    // ------------------------------------------------------------------ drawing
    drawFloor(g, cam, quality) {
      const tex = this.tex, ppf = this.ppf;
      const W = cam.W, H = cam.H;
      let Ytop = cam.floorRow(this.Y1);
      if (!(Ytop < H)) return;
      Ytop = Math.max(0, Math.floor(Ytop));
      const step = quality === 'low' ? 2 : 1;
      const texW = tex.width;
      for (let Y = Ytop; Y < H; Y += step) {
        const ya = cam.floorAtRow(Y), yb = cam.floorAtRow(Y + step);
        let y0 = Math.min(ya, this.Y1), y1 = Math.max(yb, this.Y0);
        if (y0 <= this.Y0) break;
        if (y1 >= y0) continue;
        const ym = (y0 + y1) * 0.5;
        const k = cam.scaleAt(ym, 0);
        let xa = cam.x - cam.ox / k, xb = cam.x + (W - cam.ox) / k;
        if (xa < this.X0) xa = this.X0;
        if (xb > this.X1) xb = this.X1;
        if (xb <= xa) continue;
        const sx = (xa - this.X0) * ppf;
        let sw = (xb - xa) * ppf;
        if (sx + sw > texW) sw = texW - sx;
        const sy = (this.Y1 - y0) * ppf;
        const sh = Math.max(0.6, (y0 - y1) * ppf);
        const dx = cam.ox + (xa - cam.x) * k;
        const dw = (xb - xa) * k;
        g.drawImage(tex, sx, sy, sw, sh, dx, Y, dw, step + 0.5);
      }
    }

    drawLines(g, cam) {
      const scr = this._scr;
      let o = 0;
      const cp = cam.cp, sp = cam.sp, f = cam.f, ox = cam.ox, oy = cam.oy, cx = cam.x, cyy = cam.y, cz = cam.z;
      g.beginPath();
      for (const p of this.polys) {
        for (let i = 0; i < p.length; i += 2) {
          const dy = p[i + 1] - cyy, dz = -cz;
          const d = dy * cp - dz * sp;
          const k = f / d;
          const X = ox + (p[i] - cx) * k;
          const Y = oy - (dy * sp + dz * cp) * k;
          scr[o++] = X; scr[o++] = Y;
          if (i === 0) g.moveTo(X, Y); else g.lineTo(X, Y);
        }
        g.closePath();
      }
      g.fillStyle = this.lineColor;
      g.globalAlpha = 0.93;
      g.fill('nonzero');
      g.globalAlpha = 1;
    }

    /** glossy varnish sheen + far-side grazing reflection */
    drawSheen(g, cam) {
      const yFar = cam.floorRow(56), yMid = cam.floorRow(22), yNear = cam.floorRow(-12);
      if (!this._sheen || this._sheenKey !== yFar + '|' + yNear + '|' + cam.H) {
        this._sheenKey = yFar + '|' + yNear + '|' + cam.H;
      }
      const grd = g.createLinearGradient(0, yFar, 0, yNear);
      grd.addColorStop(0, 'rgba(255,236,205,0.16)');
      grd.addColorStop(U.sat((yMid - yFar) / Math.max(1, yNear - yFar)), 'rgba(255,236,205,0.035)');
      grd.addColorStop(1, 'rgba(0,0,0,0.0)');
      g.fillStyle = grd;
      g.fillRect(0, yFar, cam.W, Math.max(0, Math.min(cam.H, yNear) - yFar));
    }
  }

  M.Court = Court;
})();
