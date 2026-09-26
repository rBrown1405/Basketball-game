/* Pro BBALL Coach — match view: the 3D people's skeleton palette and small geometry kernels (PBC.Match.Body3D).
 * The realistic players (js/match/human.js, built on MakeHuman's CC0 body) are skinned to a 39-bone palette derived
 * from the rig: the 17 rig frames, toes and two bones per finger. Twist bones (upper arm, forearm, thigh) are sent to
 * the GPU without their twist, plus the twist angle, so each vertex can take a fraction of it along the segment
 * (forearm pronation spread from the elbow to the wrist: no candy-wrapper wrists).
 * Also here: signed-distance primitives with a smooth union and a star-shaped mesher, used to model the shoes. */
(function () {
  'use strict';
  const M = window.PBC.Match, U = M.U, RG = M.Rig, J = RG.J, F = RG.F, CH = RG.CH;

  // ------------------------------------------------------------ bones of the GPU palette
  const B = {
    PEL: 0, SPN: 1, CHS: 2, NCK: 3, HED: 4, L_UA: 5, L_FA: 6, L_HD: 7, R_UA: 8, R_FA: 9, R_HD: 10,
    L_TH: 11, L_SH: 12, L_FT: 13, R_TH: 14, R_SH: 15, R_FT: 16, L_TOE: 17, R_TOE: 18, L_FNG: 19, R_FNG: 29, N: 39,
  };
  const NB = B.N;
  // rig frame -> joint that is the bone origin
  const ORIGIN = [J.PEL, J.SPN, J.CHS, J.NCK, J.HJ, J.L_SH, J.L_EL, J.L_WR, J.R_SH, J.R_EL, J.R_WR, J.L_HIP, J.L_KN, J.L_AN, J.R_HIP, J.R_KN, J.R_AN];
  // bone hierarchy (for twist fractions: an ancestor of the primitive's bone is fully twisted at the joint)
  const PARENT = new Int8Array(NB).fill(-1);
  [[B.SPN, B.PEL], [B.CHS, B.SPN], [B.NCK, B.CHS], [B.HED, B.NCK], [B.L_UA, B.CHS], [B.L_FA, B.L_UA], [B.L_HD, B.L_FA], [B.R_UA, B.CHS], [B.R_FA, B.R_UA], [B.R_HD, B.R_FA],
    [B.L_TH, B.PEL], [B.L_SH, B.L_TH], [B.L_FT, B.L_SH], [B.R_TH, B.PEL], [B.R_SH, B.R_TH], [B.R_FT, B.R_SH], [B.L_TOE, B.L_FT], [B.R_TOE, B.R_FT]].forEach(([c, p]) => { PARENT[c] = p; });
  for (let f = 0; f < 5; f++) { PARENT[B.L_FNG + f * 2] = B.L_HD; PARENT[B.L_FNG + f * 2 + 1] = B.L_FNG + f * 2; PARENT[B.R_FNG + f * 2] = B.R_HD; PARENT[B.R_FNG + f * 2 + 1] = B.R_FNG + f * 2; }
  function isAncestor(a, b) { for (let q = PARENT[b]; q >= 0; q = PARENT[q]) if (q === a) return true; return false; }
  const MAT = { SKIN: 0, HEAD: 1, JERSEY: 2, SHORTS: 3, SOCK: 4, SHOE: 5, SOLE: 6, HAIR: 7, EYE: 8, BAND: 9, BALL: 10, SLEEVE: 11, MOUTH: 12, LACE: 13, PANTS: 14 };


  // ------------------------------------------------------------ small matrix helpers (row-major 3x3, columns = local axes)
  function m3mul(A, ao, Bm, bo, C, co) { RG.mmul(A, ao, Bm, bo, C, co); }
  const TR = new Float64Array(9), TT = new Float64Array(9);
  function rotAxis(axis, a, m) {
    const c = Math.cos(a), s = Math.sin(a);
    if (axis === 0) { m[0] = 1; m[1] = 0; m[2] = 0; m[3] = 0; m[4] = c; m[5] = -s; m[6] = 0; m[7] = s; m[8] = c; }
    else if (axis === 1) { m[0] = c; m[1] = 0; m[2] = s; m[3] = 0; m[4] = 1; m[5] = 0; m[6] = -s; m[7] = 0; m[8] = c; }
    else { m[0] = c; m[1] = -s; m[2] = 0; m[3] = s; m[4] = c; m[5] = 0; m[6] = 0; m[7] = 0; m[8] = 1; }
    return m;
  }
  /** C(co) = A(ao) * Rot(axis, a) */
  function mulRot(A, ao, axis, a, C, co) {
    rotAxis(axis, a, TR);
    for (let i = 0; i < 9; i++) TT[i] = A[ao + i];
    m3mul(TT, 0, TR, 0, C, co);
  }

  // ------------------------------------------------------------ bone frames (bind and runtime)
  /**
   * Fill the palette origins O (NB*3), rotations R (NB*9, twist removed for twist bones) and twist angles TW (NB)
   * from a solved skeleton-like {P, R, dims} and extra channels {tw: [lUA, lFA, lTH, rUA, rFA, rTH] (signed angles
   * already in the bone's local z sense), curl: [l, r]}.
   */
  function boneFrames(sk, ex, O, R, TW) {
    const P = sk.P, SR = sk.R, H = sk.dims.H, d = sk.dims;
    for (let b = 0; b < 17; b++) {
      const j = ORIGIN[b] * 3;
      O[b * 3] = P[j]; O[b * 3 + 1] = P[j + 1]; O[b * 3 + 2] = P[j + 2];
      for (let i = 0; i < 9; i++) R[b * 9 + i] = SR[b * 9 + i];
      TW[b] = 0;
    }
    const tw = ex.tw;
    const twistB = [B.L_UA, B.L_FA, B.L_TH, B.R_UA, B.R_FA, B.R_TH];
    for (let i = 0; i < 6; i++) {
      const b = twistB[i], a = tw[i] || 0;
      TW[b] = a;
      if (a !== 0) mulRot(R, b * 9, 2, -a, R, b * 9);
    }
    // toes: foot frame pitched by the angle of the toe segment
    for (let side = 0; side < 2; side++) {
      const ft = (side ? B.R_FT : B.L_FT) * 9, jb = (side ? J.R_BALL : J.L_BALL) * 3, jt = (side ? J.R_TOE : J.L_TOE) * 3;
      const vx = P[jt] - P[jb], vy = P[jt + 1] - P[jb + 1], vz = P[jt + 2] - P[jb + 2];
      const ly = SR[ft + 1] * vx + SR[ft + 4] * vy + SR[ft + 7] * vz, lz = SR[ft + 2] * vx + SR[ft + 5] * vy + SR[ft + 8] * vz;
      const ang = Math.atan2(lz, Math.max(1e-6, ly));
      const tb = side ? B.R_TOE : B.L_TOE;
      mulRot(SR, ft, 0, ang, R, tb * 9);
      O[tb * 3] = P[jb]; O[tb * 3 + 1] = P[jb + 1]; O[tb * 3 + 2] = P[jb + 2];
      TW[tb] = 0;
    }
    // fingers
    for (let side = 0; side < 2; side++) fingerFrames(side, (ex.curl && ex.curl[side]) || 0, sk, O, R, TW, d);
  }

  const FT1 = new Float64Array(9), FT2 = new Float64Array(9);
  const FL = { ready: false, q1: [], q2: [], a: [], l1: [], l2: [] };
  /**
   * Finger layout measured from the MakeHuman hand (hand-local, units of hand length, right-hand x): knuckle,
   * middle joint and tip per finger. Each finger's rest rotation relative to the hand is kept, and the pose's curl
   * only adds flexion on top (so the bind pose and the mesh agree exactly).
   */
  function setFingerLayout(fingers, bindCurl) {
    const V = (x, y, z) => { const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };
    const frame = (z, yHint) => {
      let yx = yHint[0], yy = yHint[1], yz = yHint[2];
      const d = yx * z[0] + yy * z[1] + yz * z[2]; yx -= d * z[0]; yy -= d * z[1]; yz -= d * z[2];
      const l = Math.hypot(yx, yy, yz) || 1; yx /= l; yy /= l; yz /= l;
      const x = [yy * z[2] - yz * z[1], yz * z[0] - yx * z[2], yx * z[1] - yy * z[0]];
      return [x[0], yx, z[0], x[1], yy, z[1], x[2], yz, z[2]]; // columns X, Y, Z (row-major)
    };
    FL.q1 = []; FL.q2 = []; FL.a = []; FL.l1 = []; FL.l2 = [];
    for (const f of fingers) {
      const a = [f[0], f[1], f[2]], b = [f[3], f[4], f[5]], c = [f[6], f[7], f[8]];
      const z1 = V(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      const Q1 = frame(z1, [0, 1, 0]);
      const z2 = V(b[0] - c[0], b[1] - c[1], b[2] - c[2]);
      const W2 = frame(z2, [Q1[1], Q1[4], Q1[7]]);
      const Q2 = new Float64Array(9);
      // Q2 = Q1^T * W2
      for (let r = 0; r < 3; r++) for (let cc = 0; cc < 3; cc++) Q2[r * 3 + cc] = Q1[r] * W2[cc] + Q1[3 + r] * W2[3 + cc] + Q1[6 + r] * W2[6 + cc];
      FL.q1.push(Float64Array.from(Q1)); FL.q2.push(Q2); FL.a.push(a);
      FL.l1.push(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])); FL.l2.push(Math.hypot(c[0] - b[0], c[1] - b[1], c[2] - b[2]));
    }
    FL.bindCurl = bindCurl || 0.25;
    FL.ready = true;
  }
  const FQ = new Float64Array(9);
  function fingerFramesMH(side, curl, sk, O, R, TW, d) {
    const sg = side ? 1 : -1, L = d.hand;
    const hd = (side ? B.R_HD : B.L_HD) * 9;
    const SR = sk.R, P = sk.P;
    const wr = (side ? J.R_WR : J.L_WR) * 3;
    const base = side ? B.R_FNG : B.L_FNG;
    const dc = U.clamp(curl, -0.2, 1.2) - FL.bindCurl;
    for (let f = 0; f < 5; f++) {
      const b1 = base + f * 2, b2 = b1 + 1;
      const a = FL.a[f];
      const ax = a[0] * sg * L, ay = a[1] * L, az = a[2] * L;
      O[b1 * 3] = P[wr] + SR[hd] * ax + SR[hd + 1] * ay + SR[hd + 2] * az;
      O[b1 * 3 + 1] = P[wr + 1] + SR[hd + 3] * ax + SR[hd + 4] * ay + SR[hd + 5] * az;
      O[b1 * 3 + 2] = P[wr + 2] + SR[hd + 6] * ax + SR[hd + 7] * ay + SR[hd + 8] * az;
      // mirror the right-hand rest rotation for the left hand: M Q M with M = diag(-1, 1, 1)
      const q = FL.q1[f];
      for (let k = 0; k < 9; k++) FQ[k] = q[k] * (side ? 1 : ((k % 3 === 0) !== (k < 3) ? -1 : 1));
      RG.mmul(SR, hd, FQ, 0, R, b1 * 9);
      const flex1 = (f < 4 ? 72 : 30) * U.DEG * dc, flex2 = (f < 4 ? 95 : 45) * U.DEG * dc;
      if (flex1) mulRot(R, b1 * 9, 0, flex1, R, b1 * 9);
      const q2 = FL.q2[f];
      for (let k = 0; k < 9; k++) FQ[k] = q2[k] * (side ? 1 : ((k % 3 === 0) !== (k < 3) ? -1 : 1));
      RG.mmul(R, b1 * 9, FQ, 0, R, b2 * 9);
      if (flex2) mulRot(R, b2 * 9, 0, flex2, R, b2 * 9);
      const l1 = FL.l1[f] * L, r1 = b1 * 9;
      O[b2 * 3] = O[b1 * 3] - R[r1 + 2] * l1; O[b2 * 3 + 1] = O[b1 * 3 + 1] - R[r1 + 5] * l1; O[b2 * 3 + 2] = O[b1 * 3 + 2] - R[r1 + 8] * l1;
      TW[b1] = 0; TW[b2] = 0;
    }
  }
  function fingerFrames(side, curl, sk, O, R, TW, d) {
    if (FL.ready) fingerFramesMH(side, curl, sk, O, R, TW, d);
    else for (let f = 0; f < 10; f++) { const b = (side ? B.R_FNG : B.L_FNG) + f; TW[b] = 0; }
  }

  /** twist / curl channels of a solved live skeleton (pose vector after IK and limits) */
  function poseExtras(sk, out) {
    const p = sk.pose;
    out.tw[0] = -p[CH.lShT]; out.tw[1] = -p[CH.lPro]; out.tw[2] = -p[CH.lHipT];
    out.tw[3] = p[CH.rShT]; out.tw[4] = p[CH.rPro]; out.tw[5] = p[CH.rHipT];
    out.curl[0] = p[CH.lFing]; out.curl[1] = p[CH.rFing];
    return out;
  }

  // ------------------------------------------------------------ signed distance primitives
  function smin(a, b, k) { if (k <= 0) return a < b ? a : b; const h = k - Math.abs(a - b); if (h <= 0) return a < b ? a : b; const t = h / k; return (a < b ? a : b) - t * t * k * 0.25; }
  function smax(a, b, k) { return -smin(-a, -b, k); }

  /**
   * A set of primitives. Each primitive is defined in a bone's bind frame (units: feet after compile) with an
   * operation (0 union, 1 subtract), a blend radius and a skin spec for weights.
   */
  class Shape {
    constructor(bind) { this.bind = bind; this.list = []; }
    /** ellipsoid in the local frame of bone b: centre c, radii r (feet), optional extra rotation (deg about x, y, z) */
    ell(b, c, r, o) { this.list.push({ t: 0, b, c, r, o: o || {} }); return this; }
    /** rounded box in the local frame of bone b: centre c, half extents r, rounding o.round (feet) */
    box(b, c, r, o) { this.list.push({ t: 2, b, c, r, o: o || {} }); return this; }
    /** round cone from a to b (local to bone b) with radii ra, rb */
    cone(b, a, a2, ra, rb, o) { this.list.push({ t: 1, b, a, a2, ra, rb, o: o || {} }); return this; }
    compile() {
      const n = this.list.length, O = this.bind.O, R = this.bind.R;
      const T = new Uint8Array(n), OP = new Uint8Array(n), K = new Float64Array(n);
      const BX = new Float64Array(n), BY = new Float64Array(n), BZ = new Float64Array(n), BR = new Float64Array(n);
      const D = new Float64Array(n * 16);
      const toW = (b, v, out) => {
        const o = b * 3, r = b * 9;
        out[0] = O[o] + R[r] * v[0] + R[r + 1] * v[1] + R[r + 2] * v[2];
        out[1] = O[o + 1] + R[r + 3] * v[0] + R[r + 4] * v[1] + R[r + 5] * v[2];
        out[2] = O[o + 2] + R[r + 6] * v[0] + R[r + 7] * v[1] + R[r + 8] * v[2];
        return out;
      };
      const w0 = [0, 0, 0], w1 = [0, 0, 0];
      this.list.forEach((p, i) => {
        T[i] = p.t; OP[i] = p.o.sub ? 1 : 0; K[i] = p.o.k || 0;
        const q = i * 16;
        if (p.t === 0 || p.t === 2) {
          toW(p.b, p.c, w0);
          // world -> local rotation: (R_bone * Rextra)^T
          const Rm = new Float64Array(9);
          for (let k = 0; k < 9; k++) Rm[k] = R[p.b * 9 + k];
          if (p.o.rot) { if (p.o.rot[0]) mulRot(Rm, 0, 0, p.o.rot[0] * U.DEG, Rm, 0); if (p.o.rot[1]) mulRot(Rm, 0, 1, p.o.rot[1] * U.DEG, Rm, 0); if (p.o.rot[2]) mulRot(Rm, 0, 2, p.o.rot[2] * U.DEG, Rm, 0); }
          D[q] = w0[0]; D[q + 1] = w0[1]; D[q + 2] = w0[2];
          // transposed rotation rows
          D[q + 3] = Rm[0]; D[q + 4] = Rm[3]; D[q + 5] = Rm[6];
          D[q + 6] = Rm[1]; D[q + 7] = Rm[4]; D[q + 8] = Rm[7];
          D[q + 9] = Rm[2]; D[q + 10] = Rm[5]; D[q + 11] = Rm[8];
          D[q + 12] = Math.max(1e-5, p.r[0]); D[q + 13] = Math.max(1e-5, p.r[1]); D[q + 14] = Math.max(1e-5, p.r[2]);
          D[q + 15] = p.o.round || 0;
          BX[i] = w0[0]; BY[i] = w0[1]; BZ[i] = w0[2]; BR[i] = p.t === 2 ? Math.sqrt(p.r[0] * p.r[0] + p.r[1] * p.r[1] + p.r[2] * p.r[2]) : Math.max(p.r[0], p.r[1], p.r[2]);
          p.wc = w0.slice();
        } else {
          toW(p.b, p.a, w0); toW(p.b, p.a2, w1);
          D[q] = w0[0]; D[q + 1] = w0[1]; D[q + 2] = w0[2];
          const bax = w1[0] - w0[0], bay = w1[1] - w0[1], baz = w1[2] - w0[2];
          const l2 = Math.max(1e-10, bax * bax + bay * bay + baz * baz), rr = p.ra - p.rb;
          D[q + 3] = bax; D[q + 4] = bay; D[q + 5] = baz; D[q + 6] = l2; D[q + 7] = rr; D[q + 8] = l2 - rr * rr; D[q + 9] = 1 / l2;
          D[q + 10] = p.ra; D[q + 11] = p.rb;
          BX[i] = (w0[0] + w1[0]) / 2; BY[i] = (w0[1] + w1[1]) / 2; BZ[i] = (w0[2] + w1[2]) / 2;
          BR[i] = Math.sqrt(l2) / 2 + Math.max(p.ra, p.rb);
          p.wa = w0.slice(); p.wb = w1.slice();
        }
      });
      this.n = n; this.T = T; this.OP = OP; this.K = K; this.BX = BX; this.BY = BY; this.BZ = BZ; this.BR = BR; this.D = D;
      return this;
    }
    prim(i, x, y, z) {
      const D = this.D, q = i * 16;
      if (this.T[i] === 2) {
        const px = x - D[q], py = y - D[q + 1], pz = z - D[q + 2];
        const rr = D[q + 15];
        const qx = Math.abs(D[q + 3] * px + D[q + 4] * py + D[q + 5] * pz) - D[q + 12] + rr;
        const qy = Math.abs(D[q + 6] * px + D[q + 7] * py + D[q + 8] * pz) - D[q + 13] + rr;
        const qz = Math.abs(D[q + 9] * px + D[q + 10] * py + D[q + 11] * pz) - D[q + 14] + rr;
        const mx = qx > 0 ? qx : 0, my = qy > 0 ? qy : 0, mz = qz > 0 ? qz : 0;
        return Math.sqrt(mx * mx + my * my + mz * mz) + Math.min(Math.max(qx, qy, qz), 0) - rr;
      }
      if (this.T[i] === 0) {
        const px = x - D[q], py = y - D[q + 1], pz = z - D[q + 2];
        const lx = D[q + 3] * px + D[q + 4] * py + D[q + 5] * pz;
        const ly = D[q + 6] * px + D[q + 7] * py + D[q + 8] * pz;
        const lz = D[q + 9] * px + D[q + 10] * py + D[q + 11] * pz;
        const rx = D[q + 12], ry = D[q + 13], rz = D[q + 14];
        const ax = lx / rx, ay = ly / ry, az = lz / rz;
        const k0 = Math.sqrt(ax * ax + ay * ay + az * az);
        const bx = ax / rx, by = ay / ry, bz = az / rz;
        const k1 = Math.sqrt(bx * bx + by * by + bz * bz);
        return k1 > 1e-12 ? k0 * (k0 - 1) / k1 : -Math.min(rx, ry, rz);
      }
      // round cone (Inigo Quilez)
      const pax = x - D[q], pay = y - D[q + 1], paz = z - D[q + 2];
      const bax = D[q + 3], bay = D[q + 4], baz = D[q + 5], l2 = D[q + 6], rr = D[q + 7], a2 = D[q + 8], il2 = D[q + 9], r1 = D[q + 10], r2 = D[q + 11];
      const yy = pax * bax + pay * bay + paz * baz;
      const zz = yy - l2;
      const qx = pax * l2 - bax * yy, qy = pay * l2 - bay * yy, qz = paz * l2 - baz * yy;
      const x2 = qx * qx + qy * qy + qz * qz;
      const y2 = yy * yy * l2, z2 = zz * zz * l2;
      const k = Math.sign(rr) * rr * rr * x2;
      if (Math.sign(zz) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
      if (Math.sign(yy) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
      return (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - r1;
    }
    eval(x, y, z) {
      let d = 1e9;
      const n = this.n, BX = this.BX, BY = this.BY, BZ = this.BZ, BR = this.BR, K = this.K, OP = this.OP;
      for (let i = 0; i < n; i++) {
        const dx = x - BX[i], dy = y - BY[i], dz = z - BZ[i];
        const lb = Math.sqrt(dx * dx + dy * dy + dz * dz) - BR[i];
        const k = K[i];
        if (OP[i] === 0) {
          if (lb > d + k) continue;
          d = smin(d, this.prim(i, x, y, z), k);
        } else {
          if (lb > -d + k) continue;
          d = smax(d, -this.prim(i, x, y, z), k);
        }
      }
      return d;
    }
    grad(x, y, z, e, out) {
      const gx = this.eval(x + e, y, z) - this.eval(x - e, y, z);
      const gy = this.eval(x, y + e, z) - this.eval(x, y - e, z);
      const gz = this.eval(x, y, z + e) - this.eval(x, y, z - e);
      const l = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1;
      out[0] = gx / l; out[1] = gy / l; out[2] = gz / l;
      return l / (2 * e);
    }
  }

  // ------------------------------------------------------------ star-shaped surfaces
  /**
   * Ray-cast the outermost surface of f from the centre c along directions through an ellipsoid (ax, ay, az) in the
   * frame (X, Y, Z columns of Rf, row-major 3x3), nt around x nu from pole +Z to pole -Z. Returns grid vertices,
   * triangles and (u, v) for each vertex.
   */
  function starMesh(f, c, Rf, ax, ay, az, nt, nu, rmax, warp) {
    const pos = [], uv = [];
    const idx = (i, j) => j * nt + (i % nt);
    for (let j = 0; j < nu; j++) {
      const v = (j + 0.5) / nu; // avoid the exact poles
      const ph = warp && warp.v ? warp.v(v) : v * Math.PI;
      for (let i = 0; i < nt; i++) {
        const u = i / nt, th = warp && warp.u ? warp.u(u) : u * Math.PI * 2;
        let lx = ax * Math.sin(ph) * Math.sin(th), ly = ay * Math.sin(ph) * Math.cos(th), lz = az * Math.cos(ph);
        const l = Math.sqrt(lx * lx + ly * ly + lz * lz); lx /= l; ly /= l; lz /= l;
        const dx = Rf[0] * lx + Rf[1] * ly + Rf[2] * lz, dy = Rf[3] * lx + Rf[4] * ly + Rf[5] * lz, dz = Rf[6] * lx + Rf[7] * ly + Rf[8] * lz;
        // march in from outside
        let r = rmax, it = 0, dprev = 1e9;
        while (it++ < 90) {
          const d = f(c[0] + dx * r, c[1] + dy * r, c[2] + dz * r);
          if (d < 1e-5) break;
          r -= Math.max(d * 0.9, 1e-5);
          if (r <= 0) { r = 0; break; }
          dprev = d;
        }
        void dprev;
        pos.push(c[0] + dx * r, c[1] + dy * r, c[2] + dz * r);
        uv.push(u, v);
      }
    }
    const tri = [];
    for (let j = 0; j < nu - 1; j++) for (let i = 0; i < nt; i++) {
      const a = idx(i, j), b = idx(i + 1, j), cc = idx(i + 1, j + 1), d = idx(i, j + 1);
      tri.push(a, d, cc, a, cc, b);
    }
    // pole caps (fans to an extra vertex)
    const cap = (j, top) => {
      let sx = 0, sy = 0, sz = 0;
      for (let i = 0; i < nt; i++) { sx += pos[idx(i, j) * 3]; sy += pos[idx(i, j) * 3 + 1]; sz += pos[idx(i, j) * 3 + 2]; }
      const pc = pos.length / 3;
      pos.push(sx / nt, sy / nt, sz / nt); uv.push(0.5, top ? 0 : 1);
      for (let i = 0; i < nt; i++) { if (top) tri.push(pc, idx(i, j), idx(i + 1, j)); else tri.push(pc, idx(i + 1, j), idx(i, j)); }
    };
    cap(0, true); cap(nu - 1, false);
    return { pos: Float64Array.from(pos), tri: Uint32Array.from(tri), uv: Float32Array.from(uv), nt, nu };
  }

  M.Body3D = { B, NB, MAT, PARENT, isAncestor, ORIGIN, setFingerLayout, FL, boneFrames, poseExtras, Shape, starMesh, smin, smax, mulRot, rotAxis };
})();
