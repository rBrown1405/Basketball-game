/* Pro BBALL Coach — match view: basket assemblies (PBC.Match.Hoop).
 * Stanchion + padding, glass backboard, shot clock, rim (front/back halves for correct depth
 * against the ball) and a diamond-mesh nylon net simulated as verlet cloth: 12 strands tied to the ring, knots
 * pushed and dragged by the ball, a stiffer top that cannot whip over the rim, a breakaway rim that tips under a
 * hanging dunker and springs back. */
(function () {
  'use strict';
  const M = window.PBC.Match, U = M.U;
  const RIM_R = 0.75, RIM_Z = 10, BALL_R = 0.39;
  // the net (FIBA: 400-450 mm long, tied to the ring in 12 places, the upper part semi-rigid so it cannot whip up
  // through or over the ring; NBA/NCAA 15-18 in): 12 strands, 7 rows of knots in a diamond mesh
  const NS = 12, NR = 7, NK = NS * NR;
  // (narrower than the ball near the bottom: the net has to check the ball momentarily as it passes through)
  const NET_LEN = 1.45, NET_R1 = 0.33;
  // verlet cloth (Jakobsen): substeps with a couple of constraint passes each; the ball moves the net, not the
  // reverse (its own path already slows through the net)
  const SUB = 3, ITER = 2, DAMP = 0.993, GRIP = 0.3;
  const G = 32.17;
  // floats per hoop in a replay snapshot: knot positions, rim tilt, board shake
  const SNAP = NK * 3 + 2;

  class Hoop {
    /** side: -1 left basket (x=5.25), +1 right basket (x=88.75) */
    constructor(side, colors) {
      this.side = side;
      this.rx = side < 0 ? 5.25 : 88.75;
      this.ry = 25;
      this.bx = side < 0 ? 4 : 90; // backboard face
      this.colors = colors || { primary: '#1d4e89', secondary: '#f2c14e' };
      this.pad = U.shade(this.colors.primary, -0.25);
      // knots, relative to the rim centre (x, y, z - RIM_Z): rest shape, positions, previous positions (verlet)
      this.rest = new Float64Array(NK * 3); this.np = new Float64Array(NK * 3); this.pp = new Float64Array(NK * 3);
      for (let k = 0; k < NR; k++) {
        const f = k / (NR - 1);
        const r = RIM_R - (RIM_R - NET_R1) * Math.pow(f, 0.85), z = -NET_LEN * f;
        for (let i = 0; i < NS; i++) {
          const a = (i + 0.5 * (k % 2)) / NS * U.TAU, o = (k * NS + i) * 3;
          this.rest[o] = Math.cos(a) * r; this.rest[o + 1] = Math.sin(a) * r; this.rest[o + 2] = z;
        }
      }
      this.np.set(this.rest); this.pp.set(this.rest);
      // links: the strands (each knot to the two below it in the diamond) pull hard and push back little; ring
      // links hold the taper, stiff in the top rows (anti-whip cord), soft lower down so the mesh can open around
      // the ball
      const la = [], lb = [], lr = [], ls = [], lc = [];
      const link = (a, b, stiff, push) => {
        const A = a * 3, B = b * 3;
        la.push(a); lb.push(b); ls.push(stiff); lc.push(push);
        lr.push(Math.hypot(this.rest[B] - this.rest[A], this.rest[B + 1] - this.rest[A + 1], this.rest[B + 2] - this.rest[A + 2]));
      };
      for (let k = 0; k < NR - 1; k++) {
        for (let i = 0; i < NS; i++) {
          const odd = k % 2;
          link(k * NS + i, (k + 1) * NS + (odd ? (i + 1) % NS : i), 1, k < 2 ? 0.6 : 0.25);
          link(k * NS + i, (k + 1) * NS + (odd ? i : (i + NS - 1) % NS), 1, k < 2 ? 0.6 : 0.25);
        }
      }
      for (let k = 1; k < NR; k++) for (let i = 0; i < NS; i++) link(k * NS + i, k * NS + (i + 1) % NS, k <= 2 ? 0.7 : 0.12, k <= 2 ? 0.7 : 0.12);
      this.nStr = NS * (NR - 1) * 2; // (the first links are the visible strands)
      this.la = Int16Array.from(la); this.lb = Int16Array.from(lb); this.lr = Float64Array.from(lr); this.ls = Float64Array.from(ls); this.lc = Float64Array.from(lc);
      this.awake = 0; this.clock = 0; this.holdT = -1; this.holdAmt = 0;
      this.rimShake = 0; this.rimV = 0;
      this.boardShake = 0;
      this._pt = { x: 0, y: 0, s: 0, d: 0 };
      this.shotClockText = '24';
      this.gameClockText = '12:00';
      this.clockOn = true;
    }

    /** rim height offset at a point (relative x from the rim centre): the rim pivots at the backboard bracket */
    _rimDz(xr) { return this.rimShake * (this.rx + xr - this.bx) * this.side * 0.35; }
    /** ball interaction: pos {x,y,z}, vel {x,y,z} (ft, ft/s) */
    update(dt, ball) {
      this.clock += dt;
      // rim: a damped wobble after a hit (the real modes, ~24 and ~33 Hz, are too fast to show at 60 fps); a
      // breakaway rim tips down (10-30 deg) while a dunker hangs on it, then springs back
      const target = this.clock < this.holdT ? this.holdAmt : 0;
      this.rimV += (-900 * (this.rimShake - target) - 22 * this.rimV) * dt; this.rimShake += this.rimV * dt;
      this.boardShake = U.damp(this.boardShake, 0, 6, dt);
      const near = !!ball && Math.abs(ball.x - this.rx) < 2.6 && Math.abs(ball.y - this.ry) < 2.6 && ball.z > RIM_Z - NET_LEN - 1.2 && ball.z < RIM_Z + 1.6;
      if (near || Math.abs(this.rimShake) > 2e-3 || Math.abs(this.rimV) > 2e-2) this.awake = 1.6;
      if (this.awake <= 0) return;
      this.awake -= dt;
      const h = dt / SUB;
      for (let s = 0; s < SUB; s++) {
        this._integrate(h);
        for (let it = 0; it < ITER; it++) { this._solve(); if (near) this._collide(ball, dt * (1 - (s + 1) / SUB), h); }
        this._limit();
      }
    }
    _integrate(h) {
      const P = this.np, Q = this.pp, g = G * h * h;
      for (let i = NS; i < NK; i++) {
        const o = i * 3;
        for (let c = 0; c < 3; c++) {
          const x = P[o + c], v = (x - Q[o + c]) * DAMP;
          Q[o + c] = x; P[o + c] = x + v - (c === 2 ? g : 0);
        }
      }
      // the top row is tied to the ring (and moves with it)
      for (let i = 0; i < NS; i++) {
        const o = i * 3;
        P[o] = this.rest[o]; P[o + 1] = this.rest[o + 1]; P[o + 2] = this.rest[o + 2] + this._rimDz(this.rest[o]);
        Q[o] = P[o]; Q[o + 1] = P[o + 1]; Q[o + 2] = P[o + 2];
      }
    }
    _solve() {
      const P = this.np, la = this.la, lb = this.lb, lr = this.lr, ls = this.ls, lc = this.lc, n = la.length;
      for (let l = 0; l < n; l++) {
        const ia = la[l], ib = lb[l], A = ia * 3, B = ib * 3;
        const dx = P[B] - P[A], dy = P[B + 1] - P[A + 1], dz = P[B + 2] - P[A + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-9;
        let k = (d - lr[l]) / d;
        k *= k < 0 ? lc[l] : ls[l];
        const wa = ia < NS ? 0 : 1, wb = ib < NS ? 0 : 1, ws = wa + wb;
        if (!ws) continue;
        const ka = k * wa / ws, kb = k * wb / ws;
        P[A] += dx * ka; P[A + 1] += dy * ka; P[A + 2] += dz * ka;
        P[B] -= dx * kb; P[B + 1] -= dy * kb; P[B + 2] -= dz * kb;
      }
    }
    /** knots the ball overlaps go to its surface; nylon grips leather, so they are carried along with it a little */
    _collide(ball, back, h) {
      const P = this.np, Q = this.pp;
      const cx = ball.x - (ball.vx || 0) * back - this.rx, cy = ball.y - (ball.vy || 0) * back - this.ry, cz = ball.z - (ball.vz || 0) * back - RIM_Z;
      const rr = BALL_R + 0.035;
      for (let i = NS; i < NK; i++) {
        const o = i * 3;
        const dx = P[o] - cx, dy = P[o + 1] - cy, dz = P[o + 2] - cz, d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= rr * rr) continue;
        const d = Math.sqrt(d2) || 1e-6, k = rr / d;
        const vx = P[o] - Q[o], vy = P[o + 1] - Q[o + 1], vz = P[o + 2] - Q[o + 2];
        P[o] = cx + dx * k; P[o + 1] = cy + dy * k; P[o + 2] = cz + dz * k;
        Q[o] = P[o] - (vx + ((ball.vx || 0) * h - vx) * GRIP);
        Q[o + 1] = P[o + 1] - (vy + ((ball.vy || 0) * h - vy) * GRIP);
        Q[o + 2] = P[o + 2] - (vz + ((ball.vz || 0) * h - vz) * GRIP);
      }
    }
    /** the semi-rigid top keeps the net from whipping up through or over the ring */
    _limit() {
      const P = this.np, Q = this.pp;
      for (let i = NS; i < NK; i++) {
        const o = i * 3, top = this._rimDz(P[o]) - 0.06 - (i >= 2 * NS ? 0.12 : 0);
        if (P[o + 2] > top) { P[o + 2] = top; if (Q[o + 2] > top) Q[o + 2] = top; }
      }
    }
    /** kick the knots (verlet: shift the previous positions) */
    _kick(fromRow, fn) {
      const Q = this.pp;
      for (let k = fromRow; k < NR; k++) for (let i = 0; i < NS; i++) { const o = (k * NS + i) * 3, v = fn(k, i, o); Q[o] -= v[0]; Q[o + 1] -= v[1]; Q[o + 2] -= v[2]; }
      this.awake = 1.6;
    }
    /** the net snaps back up as the ball drops out of the bottom on a swish */
    swish(strength) {
      const P = this.np, h = 1 / 180;
      this._kick(3, (k, i, o) => { const f = (k - 2) / (NR - 3) * strength; const r = Math.hypot(P[o], P[o + 1]) || 1; return [P[o] / r * 1.2 * f * h, P[o + 1] / r * 1.2 * f * h, 6 * f * h]; });
    }
    hitRim(strength) {
      this.rimV += 3 * strength;
      const h = 1 / 180, ax = (Math.random() - 0.5) * 3 * strength, ay = (Math.random() - 0.5) * 3 * strength;
      this._kick(1, (k) => [ax * h * (k / NR), ay * h * (k / NR), 0]);
    }
    hitBoard(strength) { this.boardShake = Math.max(this.boardShake, 0.06 * strength); this.awake = 1.6; }
    /** a dunker hanging on the rim: it tips down ~10 deg for a moment, then springs back */
    hang(strength) { this.holdAmt = 0.5 * strength; this.holdT = this.clock + 0.3 + 0.2 * strength; this.awake = 1.6; }
    /** replay: knot positions, rim and board state into / out of a float array */
    snapshot(out, o) { const P = this.np; for (let i = 0; i < NK * 3; i++) out[o + i] = P[i]; out[o + NK * 3] = this.rimShake; out[o + NK * 3 + 1] = this.boardShake; }
    restore(src, o) { const P = this.np; for (let i = 0; i < NK * 3; i++) P[i] = src[o + i]; this.rimShake = src[o + NK * 3]; this.boardShake = src[o + NK * 3 + 1]; }

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

    /** half = 1 back strands (y > ry), -1 front strands */
    drawNet(g, cam, half) {
      const k = cam.scaleAt(this.ry, RIM_Z);
      const P = this.np, pt = this._pt, la = this.la, lb = this.lb;
      const X = this.rx, Y = this.ry;
      g.lineCap = 'round';
      // the heavier anti-whip cord at the top, the lighter mesh below
      for (let pass = 0; pass < 2; pass++) {
        g.strokeStyle = half > 0 ? 'rgba(210,210,215,0.55)' : 'rgba(250,250,252,0.9)';
        g.lineWidth = Math.max(0.7, k * (pass ? 0.032 : 0.045));
        g.beginPath();
        const l0 = pass ? NS * 4 : 0, l1 = pass ? this.nStr : NS * 4;
        for (let l = l0; l < l1; l++) {
          const A = la[l] * 3, B = lb[l] * 3;
          if ((P[A + 1] + P[B + 1] >= 0) !== (half > 0)) continue;
          cam.project(X + P[A], Y + P[A + 1], RIM_Z + P[A + 2], pt); g.moveTo(pt.x, pt.y);
          cam.project(X + P[B], Y + P[B + 1], RIM_Z + P[B + 2], pt); g.lineTo(pt.x, pt.y);
        }
        g.stroke();
      }
      // the loops along the bottom edge
      g.strokeStyle = half > 0 ? 'rgba(210,210,215,0.4)' : 'rgba(240,240,245,0.6)';
      g.lineWidth = Math.max(0.7, k * 0.03);
      g.beginPath();
      const o0 = (NR - 1) * NS;
      for (let i = 0; i < NS; i++) {
        const A = (o0 + i) * 3, B = (o0 + (i + 1) % NS) * 3;
        if ((P[A + 1] + P[B + 1] >= 0) !== (half > 0)) continue;
        cam.project(X + P[A], Y + P[A + 1], RIM_Z + P[A + 2], pt); g.moveTo(pt.x, pt.y);
        cam.project(X + P[B], Y + P[B + 1], RIM_Z + P[B + 2], pt); g.lineTo(pt.x, pt.y);
      }
      g.stroke();
    }
  }

  Hoop.RIM_R = RIM_R; Hoop.RIM_Z = RIM_Z; Hoop.BALL_R = BALL_R; Hoop.SNAP = SNAP;
  M.Hoop = Hoop;
})();
