/* Pro BBALL Coach — match view: 3D people extras (PBC.Match.Body3D.util / .extra).
 * Value noise, a vertex accumulator, mesh helpers, lofted tubes (hair strands) and the basketball shoes: a mid-top
 * sneaker modelled as a smooth union of a flat two-part sole and rounded upper volumes around the rig's foot, ray-cast
 * into a mesh and skinned to the foot and toe bones, with sole / upper / lace / accent regions for the shader. */
(function () {
  'use strict';
  const M = window.PBC.Match, U = M.U;
  const BD = M.Body3D, B = BD.B, MAT = BD.MAT;

  // ------------------------------------------------------------ value noise (deterministic)
  function hash3(i, j, k) {
    let h = (i * 374761393 + j * 668265263 + k * 1274126177) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function vnoise(x, y, z) {
    const i = Math.floor(x), j = Math.floor(y), k = Math.floor(z);
    const fx = x - i, fy = y - j, fz = z - k;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy), uz = fz * fz * (3 - 2 * fz);
    const a = hash3(i, j, k), b = hash3(i + 1, j, k), c = hash3(i, j + 1, k), d = hash3(i + 1, j + 1, k);
    const e = hash3(i, j, k + 1), f = hash3(i + 1, j, k + 1), g = hash3(i, j + 1, k + 1), h = hash3(i + 1, j + 1, k + 1);
    return U.lerp(U.lerp(U.lerp(a, b, ux), U.lerp(c, d, ux), uy), U.lerp(U.lerp(e, f, ux), U.lerp(g, h, ux), uy), uz);
  }

  // ------------------------------------------------------------ vertex accumulator
  class Acc {
    constructor() { this.P = []; this.N = []; this.BI = []; this.BW = []; this.TW = []; this.MT = []; this.AO = []; this.X0 = []; this.X1 = []; this.T = []; }
    get n() { return this.P.length / 3; }
    /** infl: array of [bone, weight, twistFraction] (any length; the 4 largest are kept) */
    vert(px, py, pz, nx, ny, nz, infl, mat, ao, x0, x1) {
      infl.sort((a, b) => b[1] - a[1]);
      let s = 0;
      for (let i = 0; i < 4 && i < infl.length; i++) s += infl[i][1];
      for (let i = 0; i < 4; i++) {
        const f = infl[i];
        if (f && s > 0) { this.BI.push(f[0]); this.BW.push(f[1] / s); this.TW.push(U.sat(f[2] || 0)); }
        else { this.BI.push(0); this.BW.push(0); this.TW.push(0); }
      }
      this.P.push(px, py, pz); this.N.push(nx, ny, nz);
      this.MT.push(mat); this.AO.push(ao == null ? 1 : ao); this.X0.push(x0 || 0); this.X1.push(x1 || 0);
      return this.n - 1;
    }
    tri(a, b, c) { this.T.push(a, b, c); }
  }

  // ------------------------------------------------------------ mesh helpers
  /** flip triangles whose winding disagrees with the vertex normals (outward) */
  function fixWinding(pos, nrm, tri) {
    for (let t = 0; t < tri.length; t += 3) {
      const a = tri[t] * 3, b = tri[t + 1] * 3, c = tri[t + 2] * 3;
      const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
      const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
      const gx = uy * vz - uz * vy, gy = uz * vx - ux * vz, gz = ux * vy - uy * vx;
      const nx = nrm[a] + nrm[b] + nrm[c], ny = nrm[a + 1] + nrm[b + 1] + nrm[c + 1], nz = nrm[a + 2] + nrm[b + 2] + nrm[c + 2];
      if (gx * nx + gy * ny + gz * nz < 0) { const s = tri[t + 1]; tri[t + 1] = tri[t + 2]; tri[t + 2] = s; }
    }
  }
  BD.util = { hash3, vnoise, Acc, fixWinding };
})();

(function () {
  'use strict';
  const M = window.PBC.Match, U = M.U;
  const BD = M.Body3D, B = BD.B, MAT = BD.MAT, UT = BD.util;

  function toW(bind, b, x, y, z) {
    const O = bind.O, R = bind.R;
    return [O[b * 3] + R[b * 9] * x + R[b * 9 + 1] * y + R[b * 9 + 2] * z,
      O[b * 3 + 1] + R[b * 9 + 3] * x + R[b * 9 + 4] * y + R[b * 9 + 5] * z,
      O[b * 3 + 2] + R[b * 9 + 6] * x + R[b * 9 + 7] * y + R[b * 9 + 8] * z];
  }
  function toL(bind, b, X, Y, Z, out) {
    const O = bind.O, R = bind.R;
    const px = X - O[b * 3], py = Y - O[b * 3 + 1], pz = Z - O[b * 3 + 2];
    out[0] = R[b * 9] * px + R[b * 9 + 3] * py + R[b * 9 + 6] * pz;
    out[1] = R[b * 9 + 1] * px + R[b * 9 + 4] * py + R[b * 9 + 7] * pz;
    out[2] = R[b * 9 + 2] * px + R[b * 9 + 5] * py + R[b * 9 + 8] * pz;
    return out;
  }
  /** add a star mesh (or any indexed mesh with gradient normals) to the accumulator */
  function addMesh(acc, pos, nrm, tri, perVert, keepTri) {
    const map = new Int32Array(pos.length / 3).fill(-1);
    const used = new Uint8Array(pos.length / 3);
    const T = [];
    for (let t = 0; t < tri.length; t += 3) {
      if (keepTri && !keepTri(tri[t], tri[t + 1], tri[t + 2])) continue;
      T.push(tri[t], tri[t + 1], tri[t + 2]);
      used[tri[t]] = used[tri[t + 1]] = used[tri[t + 2]] = 1;
    }
    for (let i = 0; i < used.length; i++) {
      if (!used[i]) continue;
      const v = perVert(i, pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2], nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2]);
      map[i] = acc.vert(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2], nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2], v.infl, v.mat, v.ao, v.x0, v.x1);
    }
    for (let t = 0; t < T.length; t += 3) acc.tri(map[T[t]], map[T[t + 1]], map[T[t + 2]]);
  }
  function gradNormals(f, pos, e) {
    const n = pos.length / 3, N = new Float64Array(n * 3);
    for (let i = 0; i < n; i++) {
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      let gx = f(x + e, y, z) - f(x - e, y, z), gy = f(x, y + e, z) - f(x, y - e, z), gz = f(x, y, z + e) - f(x, y, z - e);
      const l = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1;
      N[i * 3] = gx / l; N[i * 3 + 1] = gy / l; N[i * 3 + 2] = gz / l;
    }
    return N;
  }
  /** lofted tube along a polyline of bind-space points with per-point radius and bone influences */
  function tube(acc, pts, rad, infl, mat, sides, frameAt, flat, aux) {
    const n = pts.length, base = acc.n;
    let px = 0, py = 0, pz = 1; // previous normal for parallel transport
    const rings = [];
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      let tx = b[0] - a[0], ty = b[1] - a[1], tz = b[2] - a[2];
      const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
      let ux, uy, uz;
      if (frameAt) { const fr = frameAt(i); ux = fr[0]; uy = fr[1]; uz = fr[2]; }
      else {
        if (i === 0) { px = Math.abs(tz) < 0.9 ? 0 : 1; py = 0; pz = Math.abs(tz) < 0.9 ? 1 : 0; }
        ux = px; uy = py; uz = pz;
      }
      // make u perpendicular to t
      const d = ux * tx + uy * ty + uz * tz; ux -= d * tx; uy -= d * ty; uz -= d * tz;
      const ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul;
      px = ux; py = uy; pz = uz;
      const vx = ty * uz - tz * uy, vy = tz * ux - tx * uz, vz = tx * uy - ty * ux;
      rings.push([ux, uy, uz, vx, vy, vz, tx, ty, tz]);
      for (let s = 0; s < sides; s++) {
        const ang = s / sides * Math.PI * 2, ca = Math.cos(ang), sa = Math.sin(ang);
        const fx = flat ? flat[0] : 1, fy = flat ? flat[1] : 1;
        const nx = ux * ca * fy + vx * sa * fx, ny = uy * ca * fy + vy * sa * fx, nz = uz * ca * fy + vz * sa * fx;
        const nl = Math.hypot(nx, ny, nz) || 1;
        const r = rad[i];
        acc.vert(pts[i][0] + (ux * ca * fx + vx * sa * fy) * r, pts[i][1] + (uy * ca * fx + vy * sa * fy) * r, pts[i][2] + (uz * ca * fx + vz * sa * fy) * r,
          nx / nl, ny / nl, nz / nl, infl(i, s).map(q => q.slice()), mat, 0.95, aux ? aux(i) : 0, 0);
      }
    }
    for (let i = 0; i < n - 1; i++) for (let s = 0; s < sides; s++) {
      const a = base + i * sides + s, b = base + i * sides + (s + 1) % sides, c = a + sides, d = b + sides;
      acc.tri(a, c, d); acc.tri(a, d, b);
    }
    // end cap (a rounded tip) at the last point
    const L = rings[n - 1], last = pts[n - 1], r = rad[n - 1];
    const tip = acc.vert(last[0] + L[6] * r * 0.9, last[1] + L[7] * r * 0.9, last[2] + L[8] * r * 0.9, L[6], L[7], L[8], infl(n - 1, 0).map(q => q.slice()), mat, 0.95, aux ? aux(n - 1) : 0, 0);
    for (let s = 0; s < sides; s++) acc.tri(base + (n - 1) * sides + s, tip, base + (n - 1) * sides + (s + 1) % sides);
  }

  // ------------------------------------------------------------ shoes (mid-top basketball sneakers)
  function shoeMesh(acc, bind, dims, side, detail) {
    const H = dims.H, sg = side ? 1 : -1, FT = side ? B.R_FT : B.L_FT, TOE = side ? B.R_TOE : B.L_TOE;
    const S = new BD.Shape(bind), h = v => v * H;
    const a = dims.ankH / H;
    const l = (x, y, z) => [h(x * sg), h(y), h(z)];
    S.box(FT, l(0.001, -0.006, -a + 0.0072), [h(0.0205), h(0.037), h(0.0072)], { round: h(0.0058), k: 0 });
    S.box(FT, l(0.003, 0.072, -a + 0.0072), [h(0.0272), h(0.058), h(0.0072)], { round: h(0.0068), k: h(0.014) });
    S.ell(FT, l(0.002, 0.086, -a + 0.02), [h(0.0245), h(0.045), h(0.0155)], { k: h(0.01) });
    S.ell(FT, l(0.001, 0.035, -a + 0.027), [h(0.0255), h(0.05), h(0.0245)], { k: h(0.012) });
    S.ell(FT, l(0, -0.017, -a + 0.029), [h(0.0205), h(0.024), h(0.029)], { k: h(0.012) });
    S.ell(FT, l(0, -0.004, 0.004), [h(0.0215), h(0.027), h(0.026)], { k: h(0.012) });
    S.ell(FT, l(0, 0.03, -0.002), [h(0.0155), h(0.021), h(0.019)], { k: h(0.01) });
    S.compile();
    const f = (x, y, z) => S.eval(x, y, z);
    const R = bind.R, r = FT * 9;
    const Rf = [-R[r], R[r + 2], R[r + 1], -R[r + 3], R[r + 5], R[r + 4], -R[r + 6], R[r + 8], R[r + 7]];
    const c = toW(bind, FT, ...l(0, 0.045, -a + 0.024));
    const hi = detail === 'high';
    const m = BD.starMesh(f, c, Rf, h(0.03), h(0.034), h(0.095), hi ? 44 : 24, hi ? 40 : 20, h(0.16));
    const nrm = gradNormals(f, m.pos, h(0.0015));
    UT.fixWinding(m.pos, nrm, m.tri);
    const lp = [0, 0, 0], ball = dims.ball / H;
    addMesh(acc, m.pos, nrm, m.tri, (i, x, y, z) => {
      toL(bind, FT, x, y, z, lp);
      const lx = lp[0] / H * sg, ly = lp[1] / H, lz = lp[2] / H;
      const wt = U.smooth((ly - (ball - 0.012)) / 0.03);
      let mat = MAT.SHOE, x1 = 0, x0 = 0;
      if (lz < -a + 0.0135) { mat = MAT.SOLE; x1 = U.smooth((lz - (-a + 0.009)) / 0.004); }
      else if (Math.abs(lx) < 0.0095 && ly > 0.012 && ly < 0.085 && lz > -a + 0.028) { mat = MAT.LACE; x0 = (ly * 180) % 1; }
      else {
        // side accent: a swept stripe on the outer side and the heel tab
        const sweep = lz - (-a + 0.018 + 0.16 * (ly - 0.02) * (ly - 0.02) * 10);
        x1 = (lx > 0.012 ? 1 : 0.7) * U.smooth(1 - Math.abs(sweep) / 0.006) * U.smooth((0.11 - ly) / 0.02) * U.smooth((ly + 0.02) / 0.02);
        if (ly < -0.03 && lz > -0.01) x1 = Math.max(x1, 0.8);
      }
      return { infl: [[FT, 1 - wt, 0], [TOE, wt, 0]], mat, ao: 1, x0, x1 };
    });
  }

  BD.extra = { toW, toL, addMesh, gradNormals, tube, shoeMesh };
})();
