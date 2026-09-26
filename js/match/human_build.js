/* Pro BBALL Coach — match view: dress and pack a MakeHuman-based player (PBC.Match.Human.build).
 * GPU vertex layout (44 bytes): position f32x3, normal f32x3, bone ids u8x4, weights u8x4, twist fractions u8x4,
 * material / ambient occlusion / aux0 / aux1 u8x4, uv u16x2. */
(function () {
  'use strict';
  const M = window.PBC.Match, U = M.U, RG = M.Rig, BD = M.Body3D, HU = M.Human;
  const B = BD.B, NB = BD.NB, MAT = BD.MAT;
  const CM = 0.0328084;
  const STRIDE = 44;

  // ------------------------------------------------------------ accumulator
  class Out {
    constructor(cap) { this.n = 0; this.cap = cap; this.alloc(cap); this.T = []; }
    alloc(cap) {
      const o = this;
      const grow = (a, n, T) => { const b = new T(n); if (a) b.set(a.subarray(0, Math.min(a.length, n))); return b; };
      o.P = grow(o.P, cap * 3, Float32Array); o.N = grow(o.N, cap * 3, Float32Array);
      o.BI = grow(o.BI, cap * 4, Uint8Array); o.BW = grow(o.BW, cap * 4, Uint8Array); o.TW = grow(o.TW, cap * 4, Uint8Array);
      o.MA = grow(o.MA, cap * 4, Uint8Array); o.UV = grow(o.UV, cap * 2, Uint16Array);
      o.cap = cap;
    }
    /** add a vertex; w: {bi: [4], bw: [4] (0..255), tw: [4] (0..255)} */
    v(px, py, pz, nx, ny, nz, bi, bw, tw, mat, ao, a0, a1, u, vv) {
      if (this.n >= this.cap) this.alloc(Math.ceil(this.cap * 1.6) + 64);
      const i = this.n++;
      this.P[i * 3] = px; this.P[i * 3 + 1] = py; this.P[i * 3 + 2] = pz;
      this.N[i * 3] = nx; this.N[i * 3 + 1] = ny; this.N[i * 3 + 2] = nz;
      for (let k = 0; k < 4; k++) { this.BI[i * 4 + k] = bi[k] || 0; this.BW[i * 4 + k] = bw[k] || 0; this.TW[i * 4 + k] = tw ? tw[k] || 0 : 0; }
      this.MA[i * 4] = mat; this.MA[i * 4 + 1] = Math.round(U.sat(ao == null ? 1 : ao) * 255);
      this.MA[i * 4 + 2] = Math.round(U.sat(a0 || 0) * 255); this.MA[i * 4 + 3] = Math.round(U.sat(a1 || 0) * 255);
      this.UV[i * 2] = Math.round(U.sat(u || 0) * 65535); this.UV[i * 2 + 1] = Math.round(U.sat(vv || 0) * 65535);
      return i;
    }
    t(a, b, c) { this.T.push(a, b, c); }
  }
  const ONE = [255, 0, 0, 0];

  // ------------------------------------------------------------ helpers
  function smoothPos(P, idxSet, adj, iters, lam, fixed) {
    const n = P.length / 3, tmp = new Float64Array(P.length);
    for (let it = 0; it < iters; it++) {
      tmp.set(P);
      for (const i of idxSet) {
        if (fixed && fixed[i]) continue;
        const a = adj[i];
        let sx = 0, sy = 0, sz = 0, c = 0;
        for (let k = 0; k < a.length; k++) { const j = a[k]; if (!idxSet.has(j)) continue; sx += P[j * 3]; sy += P[j * 3 + 1]; sz += P[j * 3 + 2]; c++; }
        if (!c) continue;
        tmp[i * 3] = P[i * 3] + lam * (sx / c - P[i * 3]);
        tmp[i * 3 + 1] = P[i * 3 + 1] + lam * (sy / c - P[i * 3 + 1]);
        tmp[i * 3 + 2] = P[i * 3 + 2] + lam * (sz / c - P[i * 3 + 2]);
      }
      P.set(tmp);
    }
    void n;
  }
  /**
   * Shorts over the crotch and seat. Loose fabric hangs: below the most protruding point above it (belly, seat,
   * front of the thigh) each panel drops nearly straight down instead of following the body into folds and the
   * fork between the legs; below the crotch the inner sides of the two leg tubes meet (loose legs touch there)
   * and separate toward the hem, the inverted V of real basketball shorts.
   */
  function hangShorts(P, sel, pos, nrm, H) {
    let zc = 1e9;
    for (const i of sel) { const z = pos[i * 3 + 2]; if (Math.abs(pos[i * 3]) < 0.014 * H && z > 0.38 * H && z < 0.56 * H && z < zc) zc = z; }
    if (!(zc < 1e8)) return;
    // hang, column by column from the waistband down
    const NC = 24, cw = 0.24 * H / NC, zTop = 0.6 * H, zBot = zc - 0.04 * H;
    const ids = [];
    for (const i of sel) { const z = P[i * 3 + 2]; if (z <= zTop && z >= zBot && Math.abs(P[i * 3]) < 0.12 * H && Math.abs(nrm[i * 3 + 1]) > 0.15) ids.push(i); }
    ids.sort((a, b) => P[b * 3 + 2] - P[a * 3 + 2]);
    const runF = new Float64Array(NC).fill(-1e9), runB = new Float64Array(NC).fill(1e9);
    for (const i of ids) {
      const c = Math.max(0, Math.min(NC - 1, Math.floor((P[i * 3] + 0.12 * H) / cw)));
      const y = P[i * 3 + 1], ny = nrm[i * 3 + 1], z = P[i * 3 + 2];
      const k = 0.88 * U.smooth((z - zBot) / (0.03 * H));
      if (ny > 0) { if (y > runF[c]) runF[c] = y; else P[i * 3 + 1] = y + (runF[c] - y) * k * U.smooth((ny - 0.15) / 0.25); }
      else { if (y < runB[c]) runB[c] = y; else P[i * 3 + 1] = y + (runB[c] - y) * k * U.smooth((-ny - 0.15) / 0.25); }
    }
    // below the crotch: close the thigh gap at the inner sides (a touch of overlap so no light shows between the
    // leg tubes), less and less toward the hem
    const z0 = zc - 0.09 * H, NB = 24, band = (zc - z0) / NB;
    const gl = new Float64Array(NB).fill(-1e9), gr = new Float64Array(NB).fill(1e9);
    for (const i of sel) {
      const z = P[i * 3 + 2]; if (z < z0 || z >= zc) continue;
      const b = Math.min(NB - 1, Math.floor((z - z0) / band)), x = P[i * 3];
      if (x < 0) { if (x > gl[b]) gl[b] = x; } else if (x < gr[b]) gr[b] = x;
    }
    for (const i of sel) {
      const z = P[i * 3 + 2]; if (z < z0 || z >= zc) continue;
      const b = Math.min(NB - 1, Math.floor((z - z0) / band)), x = P[i * 3];
      const wz = U.smooth((z - z0) / (0.05 * H));
      const g = (x < 0 ? -gl[b] : gr[b]) + 0.004 * H;
      if (wz > 0 && g > 0 && g < 0.065 * H) {
        const fall = U.smooth((0.075 * H - (Math.abs(x) - g)) / (0.055 * H));
        P[i * 3] = x - Math.sign(x) * g * wz * fall;
      }
    }
  }
  function maskAt(img, u, v, ch) {
    const x = Math.min(img.w - 1, Math.max(0, Math.floor(u * img.w))), y = Math.min(img.h - 1, Math.max(0, Math.floor((1 - v) * img.h)));
    return img.d[(y * img.w + x) * 4 + ch] / 255;
  }

  /**
   * Build a cloth / shell layer from a region of the body: vertices of `sel` offset along the normal by
   * off(i) (feet), smoothed `smooth` times, cut where g(i) < 0 with a trim band. Emits into `out`.
   */
  function layer(out, ctx, sel, off, g, mat, opts) {
    const { pos, nrm, ptri, adj, wb, ww, twf, posUV } = ctx;
    const np = pos.length / 3;
    const P = new Float64Array(pos.length);
    for (const i of sel) { const o = off(i); P[i * 3] = pos[i * 3] + nrm[i * 3] * o; P[i * 3 + 1] = pos[i * 3 + 1] + nrm[i * 3 + 1] * o; P[i * 3 + 2] = pos[i * 3 + 2] + nrm[i * 3 + 2] * o; }
    if (opts.lift) for (const i of sel) { const l = opts.lift(i); if (l) { P[i * 3] += l[0]; P[i * 3 + 1] += l[1]; P[i * 3 + 2] += l[2]; } }
    if (opts.smooth) smoothPos(P, sel, adj, opts.smooth, 0.5, null);
    if (opts.extra) {
      // extra drape where the cloth bridges a hollow of the body (the crotch)
      const sub = new Set(); for (const i of sel) if (opts.extra(i) > 0.01) sub.add(i);
      if (sub.size) smoothPos(P, sub, adj, opts.extraIters || 16, 0.5, null);
    }
    if (opts.bridge) opts.bridge(P, sel);
    // keep the layer outside the skin after smoothing
    if (opts.minOff != null) for (const i of sel) {
      const dx = P[i * 3] - pos[i * 3], dy = P[i * 3 + 1] - pos[i * 3 + 1], dz = P[i * 3 + 2] - pos[i * 3 + 2];
      const dn = dx * nrm[i * 3] + dy * nrm[i * 3 + 1] + dz * nrm[i * 3 + 2];
      const m = opts.minOff(i);
      if (dn < m) { P[i * 3] += nrm[i * 3] * (m - dn); P[i * 3 + 1] += nrm[i * 3 + 1] * (m - dn); P[i * 3 + 2] += nrm[i * 3 + 2] * (m - dn); }
    }
    // triangles of the selection and their normals
    const tri = [];
    for (let t = 0; t < ptri.length; t += 3) { const a = ptri[t], b = ptri[t + 1], c = ptri[t + 2]; if (sel.has(a) && sel.has(b) && sel.has(c)) tri.push(a, b, c); }
    const LN = HU.normals(P, tri, np);
    // clip at g = 0: new vertices on edges remember their two parents
    const G = new Map();
    for (const i of sel) G.set(i, g(i));
    const verts = new Map(); // key -> out index
    const emit = (a, b, t) => {
      const key = b < 0 ? a : (a < b ? a * 1048576 + b : b * 1048576 + a) + 1e12;
      let r = verts.get(key);
      if (r !== undefined) return r;
      let px, py, pz, nx, ny, nz, gi, ia = a;
      if (b < 0) { px = P[a * 3]; py = P[a * 3 + 1]; pz = P[a * 3 + 2]; nx = LN[a * 3]; ny = LN[a * 3 + 1]; nz = LN[a * 3 + 2]; gi = G.get(a); }
      else {
        if (a > b) { const s = a; a = b; b = s; t = 1 - t; }
        px = P[a * 3] + (P[b * 3] - P[a * 3]) * t; py = P[a * 3 + 1] + (P[b * 3 + 1] - P[a * 3 + 1]) * t; pz = P[a * 3 + 2] + (P[b * 3 + 2] - P[a * 3 + 2]) * t;
        nx = LN[a * 3] + (LN[b * 3] - LN[a * 3]) * t; ny = LN[a * 3 + 1] + (LN[b * 3 + 1] - LN[a * 3 + 1]) * t; nz = LN[a * 3 + 2] + (LN[b * 3 + 2] - LN[a * 3 + 2]) * t;
        const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
        gi = 0; ia = t < 0.5 ? a : b;
      }
      const at = opts.attr(ia, gi, pz);
      const bi = [wb[ia * 4], wb[ia * 4 + 1], wb[ia * 4 + 2], wb[ia * 4 + 3]], bw = [ww[ia * 4], ww[ia * 4 + 1], ww[ia * 4 + 2], ww[ia * 4 + 3]];
      const tw = [twf[ia * 4], twf[ia * 4 + 1], twf[ia * 4 + 2], twf[ia * 4 + 3]];
      r = out.v(px, py, pz, nx, ny, nz, bi, bw, tw, at.mat != null ? at.mat : mat, at.ao, at.a0, at.a1, posUV[ia * 2], posUV[ia * 2 + 1]);
      verts.set(key, r);
      return r;
    };
    for (let t = 0; t < tri.length; t += 3) {
      const vs = [tri[t], tri[t + 1], tri[t + 2]];
      const inside = vs.map(i => G.get(i) >= 0);
      if (inside[0] && inside[1] && inside[2]) { out.t(emit(vs[0], -1), emit(vs[1], -1), emit(vs[2], -1)); continue; }
      if (!inside[0] && !inside[1] && !inside[2]) continue;
      const poly = [];
      for (let e = 0; e < 3; e++) {
        const p = vs[e], q = vs[(e + 1) % 3];
        const ip = G.get(p) >= 0, iq = G.get(q) >= 0;
        if (ip) poly.push(emit(p, -1));
        if (ip !== iq) { const gp = G.get(p), gq = G.get(q); poly.push(emit(p, q, gp / (gp - gq))); }
      }
      for (let k = 1; k + 1 < poly.length; k++) out.t(poly[0], poly[k], poly[k + 1]);
    }
  }

  // ------------------------------------------------------------ hair extras
  /** lofted tube along bind-space points with radii; skinned to the head; aux0 = 0 at the root .. 1 at the tip */
  function tubeOut(out, pts, rad, sides, flat) {
    const n = pts.length, base = out.n;
    let ux = 1, uy = 0, uz = 0;
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      let tx = b[0] - a[0], ty = b[1] - a[1], tz = b[2] - a[2];
      const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
      // parallel transport of the side vector
      const d = ux * tx + uy * ty + uz * tz; ux -= d * tx; uy -= d * ty; uz -= d * tz;
      let ul = Math.hypot(ux, uy, uz);
      if (ul < 1e-4) { ux = Math.abs(tz) < 0.9 ? 0 : 1; uy = 0; uz = Math.abs(tz) < 0.9 ? 1 : 0; const d2 = ux * tx + uy * ty + uz * tz; ux -= d2 * tx; uy -= d2 * ty; uz -= d2 * tz; ul = Math.hypot(ux, uy, uz) || 1; }
      ux /= ul; uy /= ul; uz /= ul;
      const vx = ty * uz - tz * uy, vy = tz * ux - tx * uz, vz = tx * uy - ty * ux;
      for (let k = 0; k < sides; k++) {
        const an = k / sides * Math.PI * 2, ca = Math.cos(an), sa = Math.sin(an);
        const fx = flat || 1;
        const ox = (ux * ca * fx + vx * sa), oy = (uy * ca * fx + vy * sa), oz = (uz * ca * fx + vz * sa);
        const nx = ux * ca / fx + vx * sa, ny = uy * ca / fx + vy * sa, nz = uz * ca / fx + vz * sa, nl = Math.hypot(nx, ny, nz) || 1;
        out.v(pts[i][0] + ox * rad[i], pts[i][1] + oy * rad[i], pts[i][2] + oz * rad[i], nx / nl, ny / nl, nz / nl, [B.HED, 0, 0, 0], ONE, null, MAT.HAIR, 0.9, i / (n - 1), 0, 0, 0);
      }
    }
    for (let i = 0; i < n - 1; i++) for (let k = 0; k < sides; k++) {
      const a = base + i * sides + k, b = base + i * sides + (k + 1) % sides;
      out.t(a, a + sides, b + sides); out.t(a, b + sides, b);
    }
    const L = pts[n - 1], P0 = pts[n - 2], tip = out.v(L[0] + (L[0] - P0[0]) * 0.3, L[1] + (L[1] - P0[1]) * 0.3, L[2] + (L[2] - P0[2]) * 0.3, 0, 0, -1, [B.HED, 0, 0, 0], ONE, null, MAT.HAIR, 0.9, 1, 0, 0, 0);
    for (let k = 0; k < sides; k++) out.t(base + (n - 1) * sides + k, tip, base + (n - 1) * sides + (k + 1) % sides);
  }
  /** a lumpy sphere of hair (buns, puffs) */
  function ballOut(out, c, r, lump, seed) {
    const nt = 18, nu = 12, base = out.n;
    for (let j = 0; j <= nu; j++) {
      const ph = j / nu * Math.PI;
      for (let i = 0; i < nt; i++) {
        const t = i / nt * Math.PI * 2;
        const nx = Math.sin(ph) * Math.sin(t), ny = Math.sin(ph) * Math.cos(t), nz = Math.cos(ph);
        const rr = r * (1 + lump * (BD.util.vnoise(nx * 2.2 + seed, ny * 2.2, nz * 2.2) - 0.5));
        out.v(c[0] + nx * rr, c[1] + ny * rr, c[2] + nz * rr, nx, ny, nz, [B.HED, 0, 0, 0], ONE, null, MAT.HAIR, 0.95, 0, 0, 0, 0);
      }
    }
    for (let j = 0; j < nu; j++) for (let i = 0; i < nt; i++) {
      const a = base + j * nt + i, b = base + j * nt + (i + 1) % nt;
      out.t(a, a + nt, b + nt); out.t(a, b + nt, b);
    }
  }
  function hairExtras(out, c) {
    const { pos, nrm, np, hedW, scalpD, hl, hk, hA, E, st, style, seed, H } = c;
    const W = (x, y, z) => [hA[0] + x * hk, hA[1] + y * hk, hA[2] + z * hk];     // head-local cm -> bind feet
    // head surface samples for collisions
    const head = [];
    for (let i = 0; i < np; i += 2) if (hedW[i] > 0.5) head.push(i);
    const pushOut = (p, r) => {
      let best = -1, bd = 1e9;
      for (const i of head) { const dx = p[0] - pos[i * 3], dy = p[1] - pos[i * 3 + 1], dz = p[2] - pos[i * 3 + 2]; const d = dx * dx + dy * dy + dz * dz; if (d < bd) { bd = d; best = i; } }
      if (best < 0) return;
      const dx = p[0] - pos[best * 3], dy = p[1] - pos[best * 3 + 1], dz = p[2] - pos[best * 3 + 2];
      const dn = dx * nrm[best * 3] + dy * nrm[best * 3 + 1] + dz * nrm[best * 3 + 2];
      if (dn < r) { const k = r - dn; p[0] += nrm[best * 3] * k; p[1] += nrm[best * 3 + 1] * k; p[2] += nrm[best * 3 + 2] * k; }
    };
    const rnd = U.rng(seed * 31 + 7);
    const strands = (count, lenCm, radCm, flat, spreadBack, onlyBack) => {
      // roots: scalp vertices spread over the head
      const roots = [];
      for (let i = 0; i < np; i++) if (hedW[i] > 0.5 && scalpD(i) > 1.2) roots.push(i);
      if (!roots.length) return;
      const step = Math.max(1, Math.floor(roots.length / count));
      for (let k = 0; k < roots.length; k += step) {
        const i = roots[(k + (seed % step)) % roots.length];
        const L0 = hl(i);
        if (onlyBack && L0[1] > 2) continue;
        if (L0[1] > E.y - 2 && L0[2] < E.z + 7.5) continue; // keep the face clear
        const len = lenCm * (0.8 + 0.4 * rnd()) * hk, r = radCm * (0.85 + 0.3 * rnd()) * hk;
        const pts = [];
        let p = [pos[i * 3] + nrm[i * 3] * r, pos[i * 3 + 1] + nrm[i * 3 + 1] * r, pos[i * 3 + 2] + nrm[i * 3 + 2] * r];
        // start along the scalp, falling down and back (gravity projected onto the head surface), then hang
        const gx = 0, gy = -0.3 * spreadBack, gz = -1;
        const nn = [nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2]];
        const gn = gx * nn[0] + gy * nn[1] + gz * nn[2];
        let d = [gx - gn * nn[0] + nn[0] * 0.15, gy - gn * nn[1] + nn[1] * 0.15, gz - gn * nn[2] + nn[2] * 0.15];
        // at the crown gravity has no slope to follow: comb it back
        if (Math.hypot(gx - gn * nn[0], gy - gn * nn[1], gz - gn * nn[2]) < 0.45) d = [d[0], d[1] - 0.8, d[2] - 0.2];
        { const dl = Math.hypot(d[0], d[1], d[2]) || 1; d = [d[0] / dl, d[1] / dl, d[2] / dl]; }
        pts.push(p.slice());
        const nSeg = 9, seg = len / nSeg;
        for (let s = 0; s < nSeg; s++) {
          d = [d[0] * 0.8 + gx * 0.2, d[1] * 0.8 + gy * 0.2, d[2] * 0.8 + gz * 0.2];
          const dl = Math.hypot(d[0], d[1], d[2]) || 1; d = [d[0] / dl, d[1] / dl, d[2] / dl];
          p = [p[0] + d[0] * seg, p[1] + d[1] * seg, p[2] + d[2] * seg];
          pushOut(p, r * 1.2);
          const lp = [(p[0] - hA[0]) / hk, (p[1] - hA[1]) / hk];
          if (lp[1] > E.y - 3) p[1] = hA[1] + (E.y - 3) * hk; // never hang in front of the face
          void lp;
          pts.push(p.slice());
        }
        const rad = pts.map((_, q) => r * (1 - 0.35 * q / nSeg));
        tubeOut(out, pts, rad, 6, flat);
      }
    };
    switch (style) {
      case 'locs': strands(56, st.fem ? 30 : 20, 0.55, 1, 1, false); break;
      case 'braids': strands(70, st.fem ? 32 : 22, 0.38, 1, 1, false); break;
      case 'long': strands(64, 34, 0.9, 2.2, 0.6, true); break;
      case 'bob': strands(56, 13, 1.0, 2.0, 0.4, false); break;
      case 'ponytail': {
        const pts = [], r0 = 2.2 * hk;
        let p = W(0, -8.6, E.z + 8.2), d = [0, -0.8, 0.3];
        pts.push(p.slice());
        for (let s = 0; s < 9; s++) {
          d = [d[0] * 0.7, d[1] * 0.7 - 0.12, d[2] * 0.7 - 0.36]; const dl = Math.hypot(d[0], d[1], d[2]); d = d.map(v => v / dl);
          p = [p[0] + d[0] * 3.1 * hk, p[1] + d[1] * 3.1 * hk, p[2] + d[2] * 3.1 * hk];
          pushOut(p, r0 * 0.8);
          pts.push(p.slice());
        }
        tubeOut(out, pts, pts.map((_, q) => r0 * (1 - 0.6 * q / 9)), 8, 1.3);
        ballOut(out, W(0, -8.0, E.z + 8.4), 1.6 * hk, 0.2, seed);   // the tie
        break;
      }
      case 'bun': ballOut(out, W(0, -6.6, E.z + 10.8), 3.8 * hk, 0.25, seed); break;
      case 'puffs': for (const sg of [-1, 1]) ballOut(out, W(sg * 6.0, -1.6, E.z + 10.2), 5.0 * hk, 0.35, seed + sg); break;
      default: break;
    }
  }

  // ------------------------------------------------------------ build
  function build(look, dims, st, opts) {
    const D = HU.data;
    if (!D) throw new Error('human data not loaded');
    const t0 = performance.now();
    const H = dims.H, ref = st.kind === 'ref';
    const np = D.meta.np, a = D.a;
    const mo = HU.morph(st, dims);
    const bind = HU.bindFor(dims);
    const rt = HU.retarget(mo, dims, bind);
    const pos = rt.pos;
    const nrm = HU.normals(pos, D.ptri, np);
    const wb = a.wb, ww = a.ww;
    // twist fractions per influence (upper arm, forearm, thigh spread their rotation along the segment)
    const twf = new Uint8Array(np * 4);
    const O = bind.O, RF = bind.RF;
    const segLen = b => { const J = RG.J; const P = bind.sk.P; const ch = { [B.L_UA]: J.L_EL, [B.R_UA]: J.R_EL, [B.L_FA]: J.L_WR, [B.R_FA]: J.R_WR, [B.L_TH]: J.L_KN, [B.R_TH]: J.R_KN }[b]; return Math.hypot(P[ch * 3] - O[b * 3], P[ch * 3 + 1] - O[b * 3 + 1], P[ch * 3 + 2] - O[b * 3 + 2]); };
    const TWB = { [B.L_UA]: [0.3, 0.7], [B.R_UA]: [0.3, 0.7], [B.L_FA]: [0, 1], [B.R_FA]: [0, 1], [B.L_TH]: [0.25, 0.75], [B.R_TH]: [0.25, 0.75] };
    const lens = {}; for (const b in TWB) lens[b] = segLen(+b);
    for (let i = 0; i < np; i++) for (let k = 0; k < 4; k++) {
      const b = wb[i * 4 + k], tb = TWB[b];
      if (!tb || !ww[i * 4 + k]) continue;
      const r = b * 9;
      const t = -((pos[i * 3] - O[b * 3]) * RF[r + 2] + (pos[i * 3 + 1] - O[b * 3 + 1]) * RF[r + 5] + (pos[i * 3 + 2] - O[b * 3 + 2]) * RF[r + 8]) / lens[b];
      twf[i * 4 + k] = Math.round(U.sat(tb[0] + tb[1] * U.smooth(t)) * 255);
    }
    // one UV per position (for mask look-ups on clothing / shells)
    const posUV = new Float32Array(np * 2);
    for (let r = 0; r < D.meta.nr; r++) { const p = a.rvPos[r]; posUV[p * 2] = a.rvUV[r * 2] / 65535; posUV[p * 2 + 1] = a.rvUV[r * 2 + 1] / 65535; }
    const dom = new Uint8Array(np), hedW = new Float32Array(np);
    for (let i = 0; i < np; i++) {
      dom[i] = wb[i * 4];
      for (let k = 0; k < 4; k++) if (wb[i * 4 + k] === B.HED || wb[i * 4 + k] === B.NCK && pos[i * 3 + 2] > 0.87 * H) hedW[i] += ww[i * 4 + k] / 255;
    }
    const gJer = i => a.gJer[i] * 0.002, gSho = i => a.gSho[i] * 0.002; // H units
    const refShirtG = i => {
      // referee shirt: collar and short sleeves instead of arm holes
      const x = pos[i * 3] / H, y = pos[i * 3 + 1] / H, z = pos[i * 3 + 2] / H;
      const gNeck = 0.826 - 0.3 * y + 7 * x * x - z;
      let gS = 1;
      const d = dom[i];
      if (d === B.L_UA || d === B.R_UA || d === B.L_FA || d === B.R_FA || d === B.L_HD || d === B.R_HD) {
        const b = (d === B.L_UA || d === B.L_FA || d === B.L_HD) ? B.L_UA : B.R_UA, r = b * 9;
        const lz = ((pos[i * 3] - O[b * 3]) * RF[r + 2] + (pos[i * 3 + 1] - O[b * 3 + 1]) * RF[r + 5] + (pos[i * 3 + 2] - O[b * 3 + 2]) * RF[r + 8]) / H;
        gS = lz + 0.095;
      }
      return Math.min(gNeck, gS, z - 0.572);
    };
    const refPantsG = i => { const z = pos[i * 3 + 2] / H; return Math.min(0.618 - z, z - 0.055); };
    const shirtG = ref ? refShirtG : gJer, pantsG = ref ? refPantsG : gSho;
    const seed = st.seed || 0;
    const sockTop = H * (0.1 + ((seed >> 2) & 3) * 0.018);
    const shoeTop = H * 0.058;
    const side = i => (pos[i * 3] >= 0 ? 1 : 0);
    const covers = (opt, s) => opt === 'both' || (opt === 'left' && s === 0) || (opt === 'right' && s === 1);
    const LEG = new Set([B.L_TH, B.L_SH, B.R_TH, B.R_SH]), SHIN = new Set([B.L_SH, B.R_SH]), FOOT = new Set([B.L_FT, B.R_FT, B.L_TOE, B.R_TOE]);
    const ARMS = new Set([B.L_UA, B.L_FA, B.R_UA, B.R_FA]);
    const out = new Out(np + 12000);

    // tight layers: socks, arm sleeves, leg sleeves (region > 0 is covered; H units)
    const armLz = i => { const b = side(i) ? B.R_UA : B.L_UA, r = b * 9; return ((pos[i * 3] - O[b * 3]) * RF[r + 2] + (pos[i * 3 + 1] - O[b * 3 + 1]) * RF[r + 5] + (pos[i * 3 + 2] - O[b * 3 + 2]) * RF[r + 8]) / H; };
    const sockG = i => (ref || !SHIN.has(dom[i])) ? -1 : Math.min(sockTop / H - pos[i * 3 + 2] / H, pos[i * 3 + 2] / H - 0.03);
    const legSleeveG = i => (ref || !LEG.has(dom[i]) || !covers(st.legSleeve, side(i))) ? -1 : Math.min(0.34 - pos[i * 3 + 2] / H, pos[i * 3 + 2] / H - 0.02);
    const armSleeveG = i => {
      if (ref || !covers(st.armSleeve, side(i))) return -1;
      const d = dom[i];
      if (!(ARMS.has(d) || d === B.L_HD || d === B.R_HD)) return -1;
      if (d === B.L_HD || d === B.R_HD) return -0.02;
      return -0.05 - armLz(i);
    };
    // ---------------------------------------------------------- skin
    const hidden = new Uint8Array(np);
    const mat = new Uint8Array(np), aux1 = new Float32Array(np);
    for (let i = 0; i < np; i++) {
      const z = pos[i * 3 + 2], d = dom[i];
      if (shirtG(i) > 0.006 || pantsG(i) > 0.006) hidden[i] = 1;
      if (FOOT.has(d) || (SHIN.has(d) && z < shoeTop)) hidden[i] = 1;
      let m = hedW[i] > 0.5 ? MAT.HEAD : MAT.SKIN;
      if (sockG(i) > 0.004 || legSleeveG(i) > 0.004 || armSleeveG(i) > 0.004) hidden[i] = 1;
      if (m === MAT.SKIN && st.tattoo && st.tattoo !== 'none') {
        const tatSide = (seed >> 5) & 1;
        if ((st.tattoo === 'arms' && ARMS.has(d)) || (st.tattoo === 'sleeve' && ARMS.has(d) && side(i) === tatSide)) aux1[i] = 1;
        else if (st.tattoo === 'chest' && (d === B.CHS) && z > 0.7 * H) aux1[i] = 1;
      }
      mat[i] = m;
    }
    const skinPos = pos;
    // tattoo coordinates in the UV slot of inked body skin (the body skin has no other use for it): around the
    // limb (u, the seam on the inner side facing the body) and along it (v: upper arm 0..0.5, forearm 0.5..1);
    // chest pieces get v = 2 + height
    const tatUV = new Float32Array(np * 2).fill(-1);
    for (let i = 0; i < np; i++) {
      if (!aux1[i]) continue;
      const d = dom[i];
      if (ARMS.has(d)) {
        const r = d * 9, ax = [-RF[r + 2], -RF[r + 5], -RF[r + 8]];
        const rx = pos[i * 3] - O[d * 3], ry = pos[i * 3 + 1] - O[d * 3 + 1], rz = pos[i * 3 + 2] - O[d * 3 + 2];
        const len = lens[d] || 0.16 * H;
        const al = rx * ax[0] + ry * ax[1] + rz * ax[2];
        const px = rx - ax[0] * al, py = ry - ax[1] * al, pz = rz - ax[2] * al;
        let ox = Math.sign(O[d * 3]) || 1, oy = 0, oz = 0;
        const od = ox * ax[0]; ox -= ax[0] * od; oy -= ax[1] * od; oz -= ax[2] * od;
        const ol = Math.hypot(ox, oy, oz) || 1; ox /= ol; oy /= ol; oz /= ol;
        const qx = ax[1] * oz - ax[2] * oy, qy = ax[2] * ox - ax[0] * oz, qz = ax[0] * oy - ax[1] * ox;
        const th = Math.atan2(px * qx + py * qy + pz * qz, px * ox + py * oy + pz * oz);
        tatUV[i * 2] = 0.5 + th / (2 * Math.PI);
        tatUV[i * 2 + 1] = (d === B.L_UA || d === B.R_UA ? 0 : 0.5) + 0.5 * U.clamp(al / len, 0, 1);
      } else {
        tatUV[i * 2] = U.clamp(0.5 + pos[i * 3] / (0.4 * H), 0, 1);
        tatUV[i * 2 + 1] = 2 + U.clamp((pos[i * 3 + 2] - 0.7 * H) / (0.15 * H), 0, 1);
      }
    }
    {
      const rv = a.rvPos, tr = a.tris, nr = D.meta.nr;
      const map = new Int32Array(nr).fill(-1);
      for (let t = 0; t < tr.length; t += 3) {
        const p0 = rv[tr[t]], p1 = rv[tr[t + 1]], p2 = rv[tr[t + 2]];
        if (hidden[p0] && hidden[p1] && hidden[p2]) continue;
        const ids = [tr[t], tr[t + 1], tr[t + 2]].map(r => {
          if (map[r] >= 0) return map[r];
          const p = rv[r];
          const tw = [twf[p * 4], twf[p * 4 + 1], twf[p * 4 + 2], twf[p * 4 + 3]];
          map[r] = out.v(skinPos[p * 3], skinPos[p * 3 + 1], skinPos[p * 3 + 2], nrm[p * 3], nrm[p * 3 + 1], nrm[p * 3 + 2],
            [wb[p * 4], wb[p * 4 + 1], wb[p * 4 + 2], wb[p * 4 + 3]], [ww[p * 4], ww[p * 4 + 1], ww[p * 4 + 2], ww[p * 4 + 3]], tw,
            mat[p], 1, 0, aux1[p], tatUV[p * 2] >= 0 && mat[p] === MAT.SKIN ? tatUV[p * 2] : a.rvUV[r * 2] / 65535, tatUV[p * 2] >= 0 && mat[p] === MAT.SKIN ? tatUV[p * 2 + 1] / 3 : a.rvUV[r * 2 + 1] / 65535);
          return map[r];
        });
        out.t(ids[0], ids[1], ids[2]);
      }
    }
    const ctx = { pos, nrm, ptri: D.ptri, adj: D.adj, wb, ww, twf, posUV };

    // ---------------------------------------------------------- socks and sleeves (thin layers with clean edges)
    for (const [gf, m, off, trimmed] of [[sockG, MAT.SOCK, 0.0022, true], [legSleeveG, MAT.SLEEVE, 0.0026, false], [armSleeveG, MAT.SLEEVE, 0.0022, false]]) {
      const sel = new Set();
      for (let i = 0; i < np; i++) if (gf(i) > -0.02) sel.add(i);
      if (!sel.size) continue;
      layer(out, ctx, sel, () => H * off, gf, m, { smooth: 1, minOff: () => H * off * 0.6, attr: (i, g) => ({ ao: 1, a0: 0, a1: trimmed ? U.sat(g / 0.04) : 1 }) });
    }
    // ---------------------------------------------------------- jersey / shirt
    {
      const sel = new Set();
      for (let i = 0; i < np; i++) if (shirtG(i) > -0.02) sel.add(i);
      const ease = i => {
        const z = pos[i * 3 + 2] / H;
        // loosest over the belly and lower back, tucked (tight) where it goes into the shorts
        const loose = U.smooth((0.76 - z) / 0.08) * U.smooth((z - 0.585) / 0.045) * (ref ? 0.4 : 1);
        const top = U.smooth((z - 0.78) / 0.05);
        return H * (0.006 + 0.017 * loose - 0.0015 * top);
      };
      layer(out, ctx, sel, ease, shirtG, MAT.JERSEY, {
        smooth: dims.fem ? 16 : 10, minOff: i => H * 0.004,
        attr: (i, g) => ({ ao: 1, a0: 0.3 * U.smooth((0.66 - pos[i * 3 + 2] / H) / 0.08), a1: U.sat(g / 0.04) }),
      });
    }
    // ---------------------------------------------------------- shorts / pants
    {
      const sel = new Set();
      for (let i = 0; i < np; i++) if (pantsG(i) > -0.02) sel.add(i);
      const ease = i => {
        const z = pos[i * 3 + 2] / H;
        const leg = U.smooth((0.5 - z) / 0.16);
        // the inside of each leg stays close (two leg tubes, not a skirt); the waistband sits over the tucked jersey
        const inner = Math.max(0, -Math.sign(pos[i * 3]) * nrm[i * 3]) * U.smooth((0.47 - z) / 0.05);
        const waist = U.smooth((z - 0.57) / 0.03);
        // the crotch hangs low and loose instead of following the body
        const crotch = U.smooth((0.06 - Math.abs(pos[i * 3] / H)) / 0.03) * U.smooth((z - 0.43) / 0.04) * U.smooth((0.56 - z) / 0.04);
        return H * (ref ? 0.008 + 0.006 * leg : (0.013 + 0.024 * leg) * (1 - 0.55 * inner) + 0.01 * waist + 0.008 * crotch);
      };
      const crotchW = i => { const z = pos[i * 3 + 2] / H; return U.smooth((0.075 - Math.abs(pos[i * 3] / H)) / 0.03) * U.smooth((z - 0.4) / 0.05) * U.smooth((0.575 - z) / 0.04); };
      layer(out, ctx, sel, ease, pantsG, ref ? MAT.PANTS : MAT.SHORTS, {
        smooth: 6, minOff: i => H * 0.005, extra: ref ? null : crotchW, extraIters: 24,
        bridge: ref ? null : (P, sl) => hangShorts(P, sl, pos, nrm, H),
        attr: (i, g) => ({ ao: 1, a0: ref ? 0.1 : U.smooth((0.53 - pos[i * 3 + 2] / H) / 0.17), a1: U.sat(g / 0.04) }),
      });
    }

    // ---------------------------------------------------------- hair and beard shells
    const hk = CM * rt.s0 * rt.kHead;             // feet per MakeHuman head centimetre
    const hA = rt.headA;
    const hl = i => [(pos[i * 3] - hA[0]) / hk, (pos[i * 3 + 1] - hA[1]) / hk, (pos[i * 3 + 2] - hA[2]) / hk];
    const E = D.meta.eye;
    const F = st.F || {};
    const hlShift = F.hairline == null ? 0 : (F.hairline - 0.5) * 2.2; // cm (higher = receding)
    const scalpD = i => a.scalp[i] * 0.1 - hlShift;                    // cm above the hairline
    const style = st.hair || 'fade';
    if (style !== 'bald') {
      const sel = new Set();
      for (let i = 0; i < np; i++) if (hedW[i] > 0.5 && scalpD(i) > -1.5) sel.add(i);
      const L = new Map();
      for (const i of sel) L.set(i, hl(i));
      const nz = i => { const p = L.get(i); return BD.util.vnoise(p[0] * 0.9 + 3.1, p[1] * 0.9 - 1.7, p[2] * 0.9 + 0.4); };
      const top = (i, z0) => U.smooth((L.get(i)[2] - z0) / 4);
      const EZ = E.z;
      const th = i => {
        const p = L.get(i);
        switch (style) {
          case 'buzz': return 0.22;
          case 'waves': return 0.32;
          case 'fade': return 0.08 + 1.15 * top(i, EZ + 6.2);
          case 'curly': return 1.1 + 1.9 * top(i, EZ + 3.5) + 0.5 * (nz(i) - 0.5);
          case 'twists': return 1.4 + 1.4 * top(i, EZ + 3.5) + 0.9 * (BD.util.vnoise(p[0] * 1.6, p[1] * 1.6, p[2] * 1.6) - 0.5);
          // (volume rises from the hairline into a round dome: no cliff at the front edge)
          case 'afro': return 0.5 + 6.4 * U.smooth((scalpD(i) + 0.3) / 4.8) + 1.2 * top(i, EZ + 4) + 0.6 * (nz(i) - 0.5);
          case 'puffs': return 0.4;
          case 'hightop': return 0.12 + 0.4 * top(i, EZ + 5);
          case 'mohawk': return Math.abs(p[0]) < 2.2 ? 0.25 + 3.6 * U.smooth((2.2 - Math.abs(p[0])) / 0.9) * U.smooth((p[1] + 7) / 3) : 0.1;
          case 'locs': case 'braids': return 0.5;
          case 'ponytail': case 'bun': return 0.45;
          case 'long': return 1.1;
          case 'bob': return 1.6;
          default: return 0.35;
        }
      };
      // high-top: the crown is pushed up to a flat top ~7 cm above the head with near-vertical sides
      let lift = null;
      if (style === 'hightop') {
        let topZ = -1e9; for (const i of sel) topZ = Math.max(topZ, L.get(i)[2]);
        const z0 = EZ + 5.2, zTop = topZ + 6.8;
        lift = i => { const p = L.get(i); const k = U.smooth((p[2] - z0) / 3.2); if (!k) return null; const r = 0.07 * k; return [hk * p[0] * r, hk * (p[1] - 1.5) * r, hk * (zTop - p[2]) * k]; };
      }
      const smoothN = style === 'afro' ? 10 : style === 'hightop' ? 2 : style === 'curly' || style === 'twists' ? 2 : 1;
      layer(out, ctx, sel, i => hk * th(i), i => scalpD(i), MAT.HAIR, {
        smooth: smoothN, lift, minOff: i => hk * 0.1,
        attr: (i, g) => ({ ao: 1, a0: 0, a1: 0, mat: MAT.HAIR }),
      });
    }
    // ---------------------------------------------------------- hanging hair: locs, braids, ponytails, buns, puffs, long hair
    if (style !== 'bald') hairExtras(out, { pos, nrm, np, hedW, scalpD, hl, hk, hA, E, st, style, seed, H });
    const beard = st.fem ? 'none' : st.beard;
    if (beard === 'full' || beard === 'goatee' || beard === 'mustache') {
      const ch = beard === 'full' ? [1, 1] : beard === 'goatee' ? [2, 1] : [2, 0];
      const bm = i => { const u = posUV[i * 2], v = posUV[i * 2 + 1]; const m = ch[0] === 1 ? maskAt(D.mask1, u, v, ch[1]) : maskAt(D.mask2, u, v, ch[1]); return beard === 'goatee' ? Math.max(m, maskAt(D.mask2, u, v, 0)) : m; };
      const sel = new Set();
      const bmv = new Map();
      for (let i = 0; i < np; i++) if (hedW[i] > 0.3) { const m = bm(i); if (m > 0.05) { sel.add(i); bmv.set(i, m); } }
      layer(out, ctx, sel, i => hk * (beard === 'full' ? 0.42 : 0.3) * U.smooth((bmv.get(i) - 0.45) * 2.2) * (0.8 + 0.4 * BD.util.vnoise(pos[i * 3] * 90, pos[i * 3 + 1] * 90, pos[i * 3 + 2] * 90)), i => bmv.get(i) - 0.62, MAT.HAIR, {
        smooth: 1, minOff: i => hk * 0.04,
        attr: () => ({ ao: 1, a0: 0, a1: 1, mat: MAT.HAIR }),
      });
    }
    // ---------------------------------------------------------- eyes
    {
      const r = hk * 1.2, nt = 16, nu = 12;
      for (const e of rt.eyes) {
        const base = out.n;
        for (let j = 0; j <= nu; j++) {
          const ph = j / nu * Math.PI;
          for (let i = 0; i < nt; i++) {
            const t = i / nt * Math.PI * 2;
            const nx = Math.sin(ph) * Math.sin(t), ny = Math.sin(ph) * Math.cos(t), nz = Math.cos(ph);
            out.v(e[0] + nx * r, e[1] + ny * r, e[2] + nz * r, nx, ny, nz, [B.HED, 0, 0, 0], ONE, null, MAT.EYE, 1, 0, 0, 0, 0);
          }
        }
        for (let j = 0; j < nu; j++) for (let i = 0; i < nt; i++) {
          const p = base + j * nt + i, q = base + j * nt + (i + 1) % nt;
          out.t(p, p + nt, q + nt); out.t(p, q + nt, q);
        }
      }
    }
    // ---------------------------------------------------------- shoes (modelled around the rig's feet)
    {
      const acc = new BD.util.Acc();
      const sb = { O: bind.O, R: bind.R, H };
      for (const s of [0, 1]) BD.extra.shoeMesh(acc, sb, dims, s, 'high');
      const base = out.n;
      for (let i = 0; i < acc.n; i++) {
        const bi = [acc.BI[i * 4], acc.BI[i * 4 + 1], acc.BI[i * 4 + 2], acc.BI[i * 4 + 3]];
        const q = [0, 1, 2, 3].map(k => Math.round(acc.BW[i * 4 + k] * 255));
        let big = 0; for (let k = 1; k < 4; k++) if (q[k] > q[big]) big = k; q[big] += 255 - q.reduce((s, x) => s + x, 0);
        out.v(acc.P[i * 3], acc.P[i * 3 + 1], acc.P[i * 3 + 2], acc.N[i * 3], acc.N[i * 3 + 1], acc.N[i * 3 + 2], bi, q, null, acc.MT[i], acc.AO[i], acc.X0[i], acc.X1[i], 0, 0);
      }
      for (let t = 0; t < acc.T.length; t++) acc.T[t] += base;
      for (let t = 0; t < acc.T.length; t += 3) out.t(acc.T[t], acc.T[t + 1], acc.T[t + 2]);
    }
    // ---------------------------------------------------------- pack
    const n = out.n, buf = new ArrayBuffer(n * STRIDE);
    const f32 = new Float32Array(buf), u8 = new Uint8Array(buf), u16 = new Uint16Array(buf);
    for (let i = 0; i < n; i++) {
      const o = i * (STRIDE / 4), ob = i * STRIDE;
      f32[o] = out.P[i * 3]; f32[o + 1] = out.P[i * 3 + 1]; f32[o + 2] = out.P[i * 3 + 2];
      f32[o + 3] = out.N[i * 3]; f32[o + 4] = out.N[i * 3 + 1]; f32[o + 5] = out.N[i * 3 + 2];
      for (let k = 0; k < 4; k++) { u8[ob + 24 + k] = out.BI[i * 4 + k]; u8[ob + 28 + k] = out.BW[i * 4 + k]; u8[ob + 32 + k] = out.TW[i * 4 + k]; u8[ob + 36 + k] = out.MA[i * 4 + k]; }
      u16[(ob + 40) / 2] = out.UV[i * 2]; u16[(ob + 42) / 2] = out.UV[i * 2 + 1];
    }
    const index = Uint32Array.from(out.T);
    const bindInv = new Float32Array(NB * 12);
    for (let b = 0; b < NB; b++) {
      const R = bind.R, Ob = bind.O, r = b * 9, o = b * 3, w = b * 12;
      for (let row = 0; row < 3; row++) {
        const c0 = R[r + row], c1 = R[r + 3 + row], c2 = R[r + 6 + row];
        bindInv[w + row * 4] = c0; bindInv[w + row * 4 + 1] = c1; bindInv[w + row * 4 + 2] = c2;
        bindInv[w + row * 4 + 3] = -(c0 * Ob[o] + c1 * Ob[o + 1] + c2 * Ob[o + 2]);
      }
    }
    return {
      buf, index, nVert: n, nIdx: index.length, bindInv, bindTw: Float32Array.from(bind.TW), stride: STRIDE,
      head: { o: hA, s: hk, eyes: rt.eyes.map(e => ({ c: e, r: hk * 1.2 })), eye: { x: E.x, y: E.y, z: E.z }, mouth: D.meta.mouth },
      detail: 'high', ms: performance.now() - t0, human: true,
    };
  }

  HU.build = build;
})();
