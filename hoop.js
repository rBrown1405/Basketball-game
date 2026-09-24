/* Pro BBALL Coach — match view: basket assemblies (PBC.Match.Hoop).
 * Stanchion + padding, glass backboard, shot clock, rim (front/back halves for correct depth
 * against the ball) and a diamond-mesh net with simple spring deformation (swish/whip). */
(function () {
  'use strict';
  const M = window.PBC.Match, U = M.U;
  const RIM_R = 0.75, RIM_Z = 10, BALL_R = 0.39;
  const NS = 12, NL = 5; // net strands, levels
  const NET_LEN = 1.45;

  class Hoop {
    /** side: -1 left basket (x=5.25), +1 right basket (x=88.75) */
    constructor(side, colors) {
      this.side = side;
      this.rx = side < 0 ? 5.25 : 88.75;
      this.ry = 25;
      this.bx = side < 0 ? 4 : 90; // backboard face
      this.colors = colors || { primary: '#1d4e89', secondary: '#f2c14e' };
      this.pad = U.shade(this.colors.primary, -0.25);
      this.lv = [];
      for (let k = 0; k < NL; k++) {
        const f = k / (NL - 1);
        this.lv.push({
          r0: RIM_R - (RIM_R - 0.43) * Math.pow(f, 0.9), z0: RIM_Z - NET_LEN * f,
          dr: 0, vr: 0, dz: 0, vz: 0, ox: 0, oy: 0, vx: 0, vy: 0,
        });
      }
      this.rimShake = 0; this.rimV = 0;
      this.boardShake = 0;
      this._pt = { x: 0, y: 0, s: 0, d: 0 };
      this._scr = new Float32Array(NL * NS * 3);
      this.shotClockText = '24';
      this.gameClockText = '12:00';
      this.clockOn = true;
    }

    /** ball interaction: pos {x,y,z}, vel {x,y,z} */
    update(dt, ball) {
      for (let k = 0; k < NL; k++) {
        const L = this.lv[k];
        const stiff = 120 - k * 12, damp = 9;
        L.vr += (-stiff * L.dr - damp * L.vr) * dt; L.dr += L.vr * dt;
        L.vz += (-stiff * 0.8 * L.dz - damp * L.vz) * dt; L.dz += L.vz * dt;
        L.vx += (-60 * L.ox - 6 * L.vx) * dt; L.ox += L.vx * dt;
        L.vy += (-60 * L.oy - 6 * L.vy) * dt; L.oy += L.vy * dt;
        // let lower levels follow the ones above a bit (cloth-like lag)
        if (k > 0) { const A = this.lv[k - 1]; L.ox += (A.ox - L.ox) * 0.08; L.oy += (A.oy - L.oy) * 0.08; }
      }
      this.rimV += (-900 * this.rimShake - 22 * this.rimV) * dt; this.rimShake += this.rimV * dt;
      this.boardShake = U.damp(this.boardShake, 0, 6, dt);
      if (!ball) return;
      const dx = ball.x - this.rx, dy = ball.y - this.ry;
      const rr = Math.sqrt(dx * dx + dy * dy);
      if (rr > 1.6 || ball.z > RIM_Z + 0.6 || ball.z < RIM_Z - NET_LEN - 0.8) return;
      for (let k = 0; k < NL; k++) {
        const L = this.lv[k];
        const z = L.z0 + L.dz;
        const dzb = Math.abs(ball.z - z);
        if (dzb < BALL_R + 0.1) {
          const want = rr + BALL_R * Math.sqrt(Math.max(0, 1 - (dzb / (BALL_R + 0.1)) ** 2)) + 0.02;
          const need = want - L.r0;
          if (need > L.dr) { L.dr += (need - L.dr) * 0.6; L.vr = Math.max(L.vr, 0); }
          if (k > 0) {
            L.vz += (ball.vz || 0) * 0.07;
            L.vx += dx * 1.5 + (ball.vx || 0) * 0.05; L.vy += dy * 1.5 + (ball.vy || 0) * 0.05;
          }
        }
      }
    }
    /** big whip when the ball leaves the bottom of the net on a swish */
    swish(strength) {
      for (let k = 2; k < NL; k++) { this.lv[k].vz += 7 * strength * (k / NL); this.lv[k].vr -= 1.5 * strength; }
    }
    hitRim(strength) { this.rimV += 3 * strength; }
    hitBoard(strength) { this.boardShake = Math.max(this.boardShake, 0.06 * strength); }
    hang(strength) { this.rimShake = -0.12 * strength; this.rimV = 0; }

    depth(cam) { return cam.depth(this.ry, RIM_Z); }

    // ------------------------------------------------------------ drawing helpers
    _p(cam, x, y, z) { return cam.project(x, y, z, this._pt); }
    _poly(g, cam, pts) {
      const p = this._pt;
      g.beginPath();
      for (let i = 0; i < pts.length; i += 3) {
        cam.project(pts[i], pts[i + 1], pts[i + 2], p);
        if (i === 0) g.moveTo(p.x, p.y); else g.lineTo(p.x, p.y);
      }
      g.closePath();
    }
    _box(g, cam, x0, x1, y0, y1, z0, z1, col) {
      // draw visible faces of an axis-aligned box: top, near (-y), and the x face facing the camera
      const top = U.shade(col, 0.12), front = col, side = U.shade(col, -0.22);
      const camx = cam.x;
      // side face toward camera in x
      if (camx > x1) { g.fillStyle = side; this._poly(g, cam, [x1, y0, z0, x1, y1, z0, x1, y1, z1, x1, y0, z1]); g.fill(); }
      else if (camx < x0) { g.fillStyle = side; this._poly(g, cam, [x0, y0, z0, x0, y1, z0, x0, y1, z1, x0, y0, z1]); g.fill(); }
      if (cam.z > z1) { g.fillStyle = top; this._poly(g, cam, [x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1]); g.fill(); }
      g.fillStyle = front; this._poly(g, cam, [x0, y0, z0, x1, y0, z0, x1, y0, z1, x0, y0, z1]); g.fill();
    }

    /** stanchion base + arm (behind the backboard) */
    drawStanchion(g, cam) {
      const s = this.side;
      const X = (d) => this.bx + s * d; // d measured outward from the backboard face
      const padC = U.shade(this.colors.primary || '#1d4e89', -0.18);
      // padded base (team colour) sitting behind the baseline
      const bx0 = Math.min(X(7.6), X(12.2)), bx1 = Math.max(X(7.6), X(12.2));
      this._box(g, cam, bx0, bx1, 22.6, 27.4, 0, 3.1, padC);
      // lighter padded bumper on the court-facing side
      const fx = s < 0 ? bx1 : bx0, fx2 = fx - s * 0.5;
      this._box(g, cam, Math.min(fx, fx2), Math.max(fx, fx2), 22.4, 27.6, 0, 3.3, U.shade(padC, 0.12));
      // logo panel on the face toward the camera (y = 22.4)
      const pa = this._p(cam, bx0 + 0.6, 22.39, 2.6); const ax = pa.x, ay = pa.y;
      const pb = this._p(cam, bx1 - 0.6, 22.39, 0.6);
      const w = pb.x - ax, h = pb.y - ay;
      if (Math.abs(w) > 8 && h > 4) {
        g.save();
        g.fillStyle = U.rgba('#ffffff', 0.08);
        g.fillRect(Math.min(ax, pb.x), ay, Math.abs(w), h);
        g.fillStyle = U.rgba(this.colors.secondary || '#ffffff', 0.85);
        g.font = '900 ' + Math.max(6, Math.round(h * 0.55)) + 'px "Arial Black", Impact, sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(this.label || '', (ax + pb.x) / 2, ay + h / 2);
        g.restore();
      }
      // steel post and boom (slim, dark metal) with padding sleeve on the lower post
      const px0 = Math.min(X(8.4), X(9.2)), px1 = Math.max(X(8.4), X(9.2));
      this._box(g, cam, px0, px1, 24.6, 25.4, 3.1, 12.1, '#4a4e58');
      this._box(g, cam, px0 - 0.15, px1 + 0.15, 24.4, 25.6, 3.1, 7.4, U.shade(padC, 0.05));
      const ax0 = Math.min(X(0.45), X(9.0)), ax1 = Math.max(X(0.45), X(9.0));
      this._box(g, cam, ax0, ax1, 24.7, 25.3, 11.6, 12.2, '#50545f');
      // diagonal brace
      g.strokeStyle = '#454954';
      g.lineWidth = Math.max(1.2, cam.scaleAt(25, 10) * 0.22);
      g.lineCap = 'round';
      g.beginPath();
      let p = this._p(cam, X(8.6), 25, 7.2); g.moveTo(p.x, p.y);
      p = this._p(cam, X(1.4), 25, 11.7); g.lineTo(p.x, p.y);
      g.stroke();
      // backboard support frame (behind glass)
      g.strokeStyle = '#3a3d46';
      g.lineWidth = Math.max(1, cam.scaleAt(25, 11) * 0.1);
      this._poly(g, cam, [X(0.3), 22.5, 9.9, X(0.3), 27.5, 9.9, X(0.3), 27.5, 12.6, X(0.3), 22.5, 12.6]);
      g.stroke();
    }

    drawBoard(g, cam) {
      const x = this.bx + this.boardShake * this.side;
      const s = this.side;
      // glass
      g.fillStyle = 'rgba(205,228,245,0.16)';
      this._poly(g, cam, [x, 22, 9.5, x, 28, 9.5, x, 28, 13, x, 22, 13]);
      g.fill();
      // subtle reflection streak
      g.fillStyle = 'rgba(255,255,255,0.10)';
      this._poly(g, cam, [x, 22.3, 12.6, x, 23.6, 12.6, x, 25.0, 9.7, x, 23.7, 9.7]);
      g.fill();
      const k = cam.scaleAt(25, 11);
      g.strokeStyle = 'rgba(255,255,255,0.95)';
      g.lineWidth = Math.max(1.1, k * 0.16);
      this._poly(g, cam, [x, 22.08, 9.58, x, 27.92, 9.58, x, 27.92, 12.92, x, 22.08, 12.92]);
      g.stroke();
      // shooter's square
      g.lineWidth = Math.max(1, k * 0.15);
      this._poly(g, cam, [x, 24, 10.0, x, 26, 10.0, x, 26, 11.5, x, 24, 11.5]);
      g.stroke();
      // glass edge (thickness)
      g.strokeStyle = 'rgba(150,200,190,0.8)';
      g.lineWidth = Math.max(1, k * 0.08);
      let p = this._p(cam, x - s * 0.1, 22, 9.5); g.beginPath(); g.moveTo(p.x, p.y);
      p = this._p(cam, x - s * 0.1, 22, 13); g.lineTo(p.x, p.y); g.stroke();
      // bottom padding
      const pad = this.pad;
      const x0 = Math.min(x - s * 0.25, x + s * 0.05), x1 = Math.max(x - s * 0.25, x + s * 0.05);
      this._box(g, cam, x0, x1, 21.85, 28.15, 9.12, 9.52, pad);
      // rim bracket
      const rb0 = Math.min(x, x + s * 0.62), rb1 = Math.max(x, x + s * 0.62);
      this._box(g, cam, rb0, rb1, 24.8, 25.2, RIM_Z - 0.28, RIM_Z - 0.02, '#c9531f');
      // shot clock on top of the board
      this.drawShotClock(g, cam);
    }

    drawShotClock(g, cam) {
      const s = this.side;
      const xa = this.bx - s * 0.85, xb = this.bx + s * 0.25;
      const x0 = Math.min(xa, xb), x1 = Math.max(xa, xb);
      this._box(g, cam, x0, x1, 24.1, 25.9, 13.05, 14.45, '#101116');
      // near (-y) face digits
      const pa = this._p(cam, x0, 24.1, 14.3);
      const ax = pa.x, ay = pa.y;
      const pb = this._p(cam, x1, 24.1, 13.2);
      const w = pb.x - ax, h = pb.y - ay;
      if (Math.abs(w) < 4) return;
      g.save();
      g.fillStyle = '#050507';
      g.fillRect(ax, ay, w, h);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = '800 ' + Math.max(6, Math.round(h * 0.62)) + 'px "Courier New", monospace';
      g.fillStyle = '#ff3b24';
      g.shadowColor = 'rgba(255,60,30,0.8)'; g.shadowBlur = 4;
      g.fillText(this.clockOn ? this.shotClockText : '', ax + w / 2, ay + h * 0.4);
      g.shadowBlur = 0;
      g.font = '700 ' + Math.max(4, Math.round(h * 0.2)) + 'px "Courier New", monospace';
      g.fillStyle = '#ffd25a';
      g.fillText(this.gameClockText, ax + w / 2, ay + h * 0.84);
      g.restore();
    }

    _rimPts(cam, half) {
      // returns projected points for the rim half: half = 1 (back, y>ry) or -1 (front)
      const pts = [];
      const n = 16;
      const sh = this.rimShake;
      for (let i = 0; i <= n; i++) {
        const a = half > 0 ? (i / n) * Math.PI : Math.PI + (i / n) * Math.PI;
        const x = this.rx + Math.cos(a) * (RIM_R + 0.03);
        const y = this.ry + Math.sin(a) * (RIM_R + 0.03);
        const z = RIM_Z + sh * (x - this.bx) * this.side * 0.35;
        const p = cam.project(x, y, z, this._pt);
        pts.push(p.x, p.y);
      }
      return pts;
    }
    drawRim(g, cam, half) {
      const pts = this._rimPts(cam, half);
      const k = cam.scaleAt(this.ry, RIM_Z);
      const lw = Math.max(2.2, k * 0.12);
      g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath();
      for (let i = 0; i < pts.length; i += 2) { if (i === 0) g.moveTo(pts[i], pts[i + 1]); else g.lineTo(pts[i], pts[i + 1]); }
      g.strokeStyle = half > 0 ? '#a8401a' : '#e2581f';
      g.lineWidth = lw;
      g.stroke();
      if (half < 0) {
        g.strokeStyle = 'rgba(255,190,140,0.75)';
        g.lineWidth = lw * 0.35;
        g.beginPath();
        for (let i = 0; i < pts.length; i += 2) { if (i === 0) g.moveTo(pts[i], pts[i + 1] - lw * 0.2); else g.lineTo(pts[i], pts[i + 1] - lw * 0.2); }
        g.stroke();
      }
    }

    _netPoint(k, i) {
      const L = this.lv[k];
      const a = (i + 0.5 * (k % 2)) / NS * U.TAU;
      const r = Math.max(0.12, L.r0 + L.dr);
      return [this.rx + L.ox + Math.cos(a) * r, this.ry + L.oy + Math.sin(a) * r, L.z0 + L.dz];
    }
    /** half = 1 back strands (y > ry), -1 front strands */
    drawNet(g, cam, half) {
      const k = cam.scaleAt(this.ry, RIM_Z);
      g.strokeStyle = half > 0 ? 'rgba(210,210,215,0.55)' : 'rgba(250,250,252,0.9)';
      g.lineWidth = Math.max(0.7, k * 0.035);
      g.beginPath();
      const P = this._pt;
      for (let lvl = 0; lvl < NL - 1; lvl++) {
        for (let i = 0; i < NS; i++) {
          const a = this._netPoint(lvl, i);
          const odd = lvl % 2;
          const b1 = this._netPoint(lvl + 1, odd ? i + 1 : i);
          const b2 = this._netPoint(lvl + 1, odd ? i : i - 1);
          for (const b of [b1, b2]) {
            const my = (a[1] + b[1]) * 0.5;
            if ((my >= this.ry) !== (half > 0)) continue;
            cam.project(a[0], a[1], a[2], P); g.moveTo(P.x, P.y);
            cam.project(b[0], b[1], b[2], P); g.lineTo(P.x, P.y);
          }
        }
      }
      g.stroke();
      // bottom ring hint
      if (half < 0) {
        g.strokeStyle = 'rgba(240,240,245,0.6)';
        g.beginPath();
        for (let i = 0; i <= NS / 2; i++) {
          const q = this._netPoint(NL - 1, NS / 2 + i);
          cam.project(q[0], q[1], q[2], P);
          if (i === 0) g.moveTo(P.x, P.y); else g.lineTo(P.x, P.y);
        }
        g.stroke();
      }
    }
  }

  Hoop.RIM_R = RIM_R; Hoop.RIM_Z = RIM_Z; Hoop.BALL_R = BALL_R;
  M.Hoop = Hoop;
})();
