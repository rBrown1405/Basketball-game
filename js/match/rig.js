/* Pro BBALL Coach — match view: 3D skeleton rig (PBC.Match.Rig).
 * Anthropometric segment lengths (Drillis & Contini ratios of height), a joint-angle pose vector,
 * forward kinematics and analytic two-bone IK (legs to planted feet, arms to the ball).
 *
 * Conventions: body-local axes X = right, Y = forward, Z = up. Facing angle phi: forward =
 * (cos phi, sin phi). Matrices are row-major 3x3; columns are the local axes in world space.
 * Angles in radians. Flexion moves a limb forward (knee flexion bends the shank backward),
 * abduction moves it outward, twist = internal rotation (positive for both sides). */
(function () {
  'use strict';
  const M = window.PBC.Match, U = M.U;

  // ------------------------------------------------------------ pose channels
  const CH = {};
  let n = 0;
  ['rootX', 'rootY', 'rootZ', 'pelPitch', 'pelRoll', 'pelTwist',
    'spFlex', 'spLat', 'spTwist', 'chFlex', 'chLat', 'chTwist',
    'nkFlex', 'nkLat', 'nkTwist', 'hdFlex', 'hdLat', 'hdTwist'].forEach((k) => { CH[k] = n++; });
  const ARM = ['ClvE', 'ClvP', 'ShF', 'ShA', 'ShT', 'ElF', 'Pro', 'WrF', 'WrD', 'Fing'];
  const LEG = ['HipF', 'HipA', 'HipT', 'Knee', 'Ank', 'Toe'];
  for (const s of ['l', 'r']) for (const k of ARM) CH[s + k] = n++;
  for (const s of ['l', 'r']) for (const k of LEG) CH[s + k] = n++;
  const NCH = n;
  // channels that are lengths (not angles)
  const LINEAR = { rootX: 1, rootY: 1, rootZ: 1, lClvE: 1, rClvE: 1, lClvP: 1, rClvP: 1, lFing: 1, rFing: 1 };
  // channel groups for masks
  const GROUP = { legs: [], arms: [], larm: [], rarm: [], torso: [], head: [], root: [] };
  for (const k in CH) {
    const i = CH[k];
    if (/^(l|r)(HipF|HipA|HipT|Knee|Ank|Toe)$/.test(k)) GROUP.legs.push(i);
    else if (/^l(ClvE|ClvP|ShF|ShA|ShT|ElF|Pro|WrF|WrD|Fing)$/.test(k)) { GROUP.arms.push(i); GROUP.larm.push(i); }
    else if (/^r(ClvE|ClvP|ShF|ShA|ShT|ElF|Pro|WrF|WrD|Fing)$/.test(k)) { GROUP.arms.push(i); GROUP.rarm.push(i); }
    else if (/^(nk|hd)/.test(k)) GROUP.head.push(i);
    else if (/^root/.test(k)) GROUP.root.push(i);
    else GROUP.torso.push(i);
  }

  // mirror table (lefty / mirrored animations): swap l/r, negate lateral/twist/roll and rootX
  const MIRROR_SRC = new Int16Array(NCH), MIRROR_SGN = new Float32Array(NCH);
  for (const k in CH) {
    let src = k, sgn = 1;
    if (/^l[A-Z]/.test(k)) src = 'r' + k.slice(1);
    else if (/^r[A-Z]/.test(k)) src = 'l' + k.slice(1);
    if (/(Lat|Twist|Roll)$/.test(k) || k === 'rootX') sgn = -1;
    MIRROR_SRC[CH[k]] = CH[src]; MIRROR_SGN[CH[k]] = sgn;
  }
  function mirrorPose(src, out) {
    for (let i = 0; i < NCH; i++) out[i] = src[MIRROR_SRC[i]] * MIRROR_SGN[i];
    return out;
  }

  /** build a pose vector from a {channel: degrees|feet-fraction} description */
  function pose(desc, base) {
    const p = base ? Float32Array.from(base) : new Float32Array(NCH);
    if (!desc) return p;
    for (const k in desc) {
      if (k === 'both') {
        for (const kk in desc.both) { set(p, 'l' + kk, desc.both[kk]); set(p, 'r' + kk, desc.both[kk]); }
        continue;
      }
      set(p, k, desc[k]);
    }
    return p;
  }
  function set(p, k, v) {
    const i = CH[k];
    if (i === undefined) { U.warn('unknown channel ' + k); return; }
    p[i] = LINEAR[k] ? v : v * U.DEG;
  }

  // ------------------------------------------------------------ dimensions
  function makeDims(look) {
    const hIn = U.clamp(+look.height || 78, 60, 92);
    const H = hIn / 12;
    const fem = look.gender === 'f';
    const wt = +look.weight || (fem ? 165 : 215);
    const bmi = 703 * wt / (hIn * hIn);
    const build = look.look && look.look.build != null ? +look.look.build : 0.5;
    // thickness: 1 = typical athlete; heavier BMI and higher build -> thicker
    const bulk = U.clamp(1 + (bmi - (fem ? 22.5 : 24.5)) * 0.035 + (build - 0.5) * 0.16, 0.82, 1.35);
    const musc = U.clamp(0.9 + build * 0.25 - (fem ? 0.1 : 0), 0.75, 1.2);
    return {
      H, fem, bulk, musc,
      // pelvis root height with straight legs: the hip joint sits 0.012 H below the root, so the leg (hip joint to
      // ankle, 0.491 H) is only ~4 deg short of straight when standing tall. (At 0.53 H the knees could never
      // straighten past ~25 deg, which gave every walk and idle a crouched, toddler-like look.)
      hipH: 0.542 * H,
      pelSp: 0.095 * H, spCh: 0.1 * H, chNk: 0.1 * H, neck: 0.07 * H,
      headR: 0.058 * H,
      shX: (fem ? 0.1 : 0.112) * H, shZ: 0.088 * H,
      hipX: (fem ? 0.056 : 0.051) * H,
      ua: 0.186 * H, fa: 0.146 * H, hand: 0.108 * H,
      th: 0.245 * H, sh: 0.246 * H, ankH: 0.039 * H,
      heel: 0.03 * H, ball: 0.084 * H, toe: 0.04 * H,
      footW: 0.036 * H,
    };
  }

  // ------------------------------------------------------------ matrix helpers (row-major 3x3)
  function mset(m, o, a, b, c, d, e, f, g, h, i) { m[o] = a; m[o + 1] = b; m[o + 2] = c; m[o + 3] = d; m[o + 4] = e; m[o + 5] = f; m[o + 6] = g; m[o + 7] = h; m[o + 8] = i; }
  const T1 = new Float64Array(9), T2 = new Float64Array(9), T3 = new Float64Array(9);
  function mmul(A, ao, B, bo, C, co) {
    const a0 = A[ao], a1 = A[ao + 1], a2 = A[ao + 2], a3 = A[ao + 3], a4 = A[ao + 4], a5 = A[ao + 5], a6 = A[ao + 6], a7 = A[ao + 7], a8 = A[ao + 8];
    const b0 = B[bo], b1 = B[bo + 1], b2 = B[bo + 2], b3 = B[bo + 3], b4 = B[bo + 4], b5 = B[bo + 5], b6 = B[bo + 6], b7 = B[bo + 7], b8 = B[bo + 8];
    C[co] = a0 * b0 + a1 * b3 + a2 * b6; C[co + 1] = a0 * b1 + a1 * b4 + a2 * b7; C[co + 2] = a0 * b2 + a1 * b5 + a2 * b8;
    C[co + 3] = a3 * b0 + a4 * b3 + a5 * b6; C[co + 4] = a3 * b1 + a4 * b4 + a5 * b7; C[co + 5] = a3 * b2 + a4 * b5 + a5 * b8;
    C[co + 6] = a6 * b0 + a7 * b3 + a8 * b6; C[co + 7] = a6 * b1 + a7 * b4 + a8 * b7; C[co + 8] = a6 * b2 + a7 * b5 + a8 * b8;
  }
  function rotX(a, m) { const c = Math.cos(a), s = Math.sin(a); mset(m, 0, 1, 0, 0, 0, c, -s, 0, s, c); return m; }
  function rotY(a, m) { const c = Math.cos(a), s = Math.sin(a); mset(m, 0, c, 0, s, 0, 1, 0, -s, 0, c); return m; }
  function rotZ(a, m) { const c = Math.cos(a), s = Math.sin(a); mset(m, 0, c, -s, 0, s, c, 0, 0, 0, 1); return m; }
  /** C(co) = A(ao) * R where R is a rotation about a principal axis */
  const TR = new Float64Array(9), TT = new Float64Array(9);
  function mulRot(A, ao, axis, ang, C, co) {
    if (ang === 0) { if (A !== C || ao !== co) for (let i = 0; i < 9; i++) C[co + i] = A[ao + i]; return; }
    if (axis === 0) rotX(ang, TR); else if (axis === 1) rotY(ang, TR); else rotZ(ang, TR);
    for (let i = 0; i < 9; i++) TT[i] = A[ao + i];
    mmul(TT, 0, TR, 0, C, co);
  }
  /** out = pos + M * (x,y,z) */
  function xf(Mx, mo, px, py, pz, x, y, z, out, oo) {
    out[oo] = px + Mx[mo] * x + Mx[mo + 1] * y + Mx[mo + 2] * z;
    out[oo + 1] = py + Mx[mo + 3] * x + Mx[mo + 4] * y + Mx[mo + 5] * z;
    out[oo + 2] = pz + Mx[mo + 6] * x + Mx[mo + 7] * y + Mx[mo + 8] * z;
  }

  // ------------------------------------------------------------ skeleton
  const J = {
    PEL: 0, SPN: 1, CHS: 2, NCK: 3, HJ: 4, HC: 5, HT: 6,
    L_SH: 7, L_EL: 8, L_WR: 9, L_HD: 10, R_SH: 11, R_EL: 12, R_WR: 13, R_HD: 14,
    L_HIP: 15, L_KN: 16, L_AN: 17, L_HEEL: 18, L_BALL: 19, L_TOE: 20,
    R_HIP: 21, R_KN: 22, R_AN: 23, R_HEEL: 24, R_BALL: 25, R_TOE: 26, N: 27,
  };
  const F = { PEL: 0, SPN: 1, CHS: 2, NCK: 3, HED: 4, L_UA: 5, L_FA: 6, L_HD: 7, R_UA: 8, R_FA: 9, R_HD: 10, L_TH: 11, L_SH: 12, L_FT: 13, R_TH: 14, R_SH: 15, R_FT: 16, N: 17 };

  class Skeleton {
    constructor(dims) {
      this.dims = dims;
      this.P = new Float64Array(J.N * 3);
      this.R = new Float64Array(F.N * 9);
      this.B = new Float64Array(9);
      this.pose = new Float32Array(NCH);
      // IK requests: legs [ {on, x,y,z (ankle target), footYaw, footPitch, pivot} ], arms [{on, x,y,z}]
      this.legIK = [{ on: 0, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, flat: 1 }, { on: 0, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, flat: 1 }];
      this.armIK = [{ on: 0, x: 0, y: 0, z: 0, pole: null }, { on: 0, x: 0, y: 0, z: 0, pole: null }];
      this.facing = 0; this.x = 0; this.y = 0;
      this._v = new Float64Array(3);
    }

    /** full solve: root at ground point (x,y), body facing phi */
    solve(pose, x, y, phi) {
      const d = this.dims, H = d.H, P = this.P, R = this.R, B = this.B;
      const p = this.pose;
      if (pose !== p) p.set(pose);
      limitPose(p);
      this.x = x; this.y = y; this.facing = phi;
      const c = Math.cos(phi), s = Math.sin(phi);
      mset(B, 0, s, c, 0, -c, s, 0, 0, 0, 1);
      // root position
      const rx = p[CH.rootX], ry = p[CH.rootY];
      const px = x + B[0] * rx + B[1] * ry, py = y + B[3] * rx + B[4] * ry, pz = d.hipH + p[CH.rootZ] * H;
      P[0] = px; P[1] = py; P[2] = pz;
      // pelvis frame
      mulRot(B, 0, 2, p[CH.pelTwist], R, 0);
      mulRot(R, 0, 0, -p[CH.pelPitch], R, 0);
      mulRot(R, 0, 1, p[CH.pelRoll], R, 0);
      // spine
      xf(R, 0, px, py, pz, 0, 0, d.pelSp, P, 3);
      mulRot(R, 0, 2, p[CH.spTwist], R, 9);
      mulRot(R, 9, 0, -p[CH.spFlex], R, 9);
      mulRot(R, 9, 1, p[CH.spLat], R, 9);
      xf(R, 9, P[3], P[4], P[5], 0, 0, d.spCh, P, 6);
      mulRot(R, 9, 2, p[CH.chTwist], R, 18);
      mulRot(R, 18, 0, -p[CH.chFlex], R, 18);
      mulRot(R, 18, 1, p[CH.chLat], R, 18);
      xf(R, 18, P[6], P[7], P[8], 0, -0.008 * H, d.chNk, P, 9);
      mulRot(R, 18, 2, p[CH.nkTwist], R, 27);
      mulRot(R, 27, 0, -p[CH.nkFlex], R, 27);
      mulRot(R, 27, 1, p[CH.nkLat], R, 27);
      xf(R, 27, P[9], P[10], P[11], 0, 0.014 * H, d.neck, P, 12);
      mulRot(R, 27, 2, p[CH.hdTwist], R, 36);
      mulRot(R, 36, 0, -p[CH.hdFlex], R, 36);
      mulRot(R, 36, 1, p[CH.hdLat], R, 36);
      xf(R, 36, P[12], P[13], P[14], 0, 0.014 * H, 0.03 * H, P, 15);
      xf(R, 36, P[12], P[13], P[14], 0, 0.004 * H, 0.098 * H, P, 18);
      // arms
      for (let side = 0; side < 2; side++) this._arm(side);
      // legs
      for (let side = 0; side < 2; side++) this._leg(side);
    }

    _arm(side) {
      const d = this.dims, H = d.H, P = this.P, R = this.R, p = this.pose;
      const sg = side === 0 ? -1 : 1, pre = side === 0 ? 'l' : 'r';
      const jSh = side === 0 ? J.L_SH : J.R_SH, fUA = side === 0 ? F.L_UA : F.R_UA;
      const o = jSh * 3;
      xf(R, 18, P[6], P[7], P[8], sg * d.shX, -0.006 * H + p[CH[pre + 'ClvP']] * 0.03 * H, d.shZ + p[CH[pre + 'ClvE']] * 0.035 * H, P, o);
      const ik = this.armIK[side];
      if (ik.on > 0.001) this._armIK(side, pre, sg, P[o], P[o + 1], P[o + 2]);
      limitArm(p, pre);
      const ua = fUA * 9, fa = ua + 9, hd = fa + 9;
      mulRot(R, 18, 0, p[CH[pre + 'ShF']], R, ua);
      mulRot(R, ua, 1, -sg * p[CH[pre + 'ShA']], R, ua);
      mulRot(R, ua, 2, sg * p[CH[pre + 'ShT']], R, ua);
      xf(R, ua, P[o], P[o + 1], P[o + 2], 0, 0, -d.ua, P, o + 3);
      mulRot(R, ua, 0, p[CH[pre + 'ElF']], R, fa);
      mulRot(R, fa, 2, sg * p[CH[pre + 'Pro']], R, fa);
      xf(R, fa, P[o + 3], P[o + 4], P[o + 5], 0, 0, -d.fa, P, o + 6);
      mulRot(R, fa, 0, p[CH[pre + 'WrF']], R, hd);
      mulRot(R, hd, 1, -sg * p[CH[pre + 'WrD']], R, hd);
      const curl = p[CH[pre + 'Fing']];
      xf(R, hd, P[o + 6], P[o + 7], P[o + 8], 0, 0.01 * H + curl * 0.02 * H, -d.hand * (0.78 - curl * 0.3), P, o + 9);
    }

    _armIK(side, pre, sg, sx, sy, sz) {
      const d = this.dims, p = this.pose, R = this.R, ik = this.armIK[side];
      // target wrist in chest frame
      const wx = ik.x - sx, wy = ik.y - sy, wz = ik.z - sz;
      const Dx = R[18] * wx + R[21] * wy + R[24] * wz;
      const Dy = R[19] * wx + R[22] * wy + R[25] * wz;
      const Dz = R[20] * wx + R[23] * wy + R[26] * wz;
      const L1 = d.ua, L2 = d.fa;
      let dist = Math.sqrt(Dx * Dx + Dy * Dy + Dz * Dz);
      const dmax = (L1 + L2) * 0.9995, dmin = Math.abs(L1 - L2) + 0.25 * L2;
      const dd = U.clamp(dist, dmin, dmax);
      const cosE = U.clamp((dd * dd - L1 * L1 - L2 * L2) / (2 * L1 * L2), -1, 1);
      const e = Math.acos(cosE);
      const sc = dist > 1e-6 ? dd / dist : 1;
      const nx = Dx * sc, ny = Dy * sc, nz = Dz * sc;
      const F0 = p[CH[pre + 'ShF']], A0 = p[CH[pre + 'ShA']], E0 = p[CH[pre + 'ElF']], T0 = p[CH[pre + 'ShT']];
      let sf, sa, st = T0;
      if (ik.pole) {
        // swivel from a pole: the elbow bends toward a natural direction (down, a little out and back for low
        // hands) instead of wherever the authored twist points it - no elbows folded into the chest
        const sol = armPole(nx, ny, nz, dd, L1, L2, ik.pole[0] * sg, ik.pole[1], ik.pole[2], sg, F0, -sg * A0);
        sf = sol.f; sa = -sg * sol.b; st = sg * sol.t;
      } else {
        const Vy = L2 * Math.sin(e), Vz = -L1 - L2 * Math.cos(e);
        const tw = sg * T0;
        const Wx = -Vy * Math.sin(tw), Wy = Vy * Math.cos(tw), Wz = Vz;
        const sol = solve2(Wx, Wy, Wz, nx, ny, nz, -sg * A0);
        sf = sol.f; sa = -sg * sol.b;
      }
      const w = ik.on;
      p[CH[pre + 'ShF']] = w >= 1 ? sf : U.angLerp(F0, sf, w);
      p[CH[pre + 'ShA']] = w >= 1 ? sa : U.angLerp(A0, sa, w);
      p[CH[pre + 'ShT']] = w >= 1 ? st : U.angLerp(T0, st, w);
      p[CH[pre + 'ElF']] = w >= 1 ? e : U.lerp(E0, e, w);
    }

    _leg(side) {
      const d = this.dims, H = d.H, P = this.P, R = this.R, p = this.pose;
      const sg = side === 0 ? -1 : 1, pre = side === 0 ? 'l' : 'r';
      const jHip = side === 0 ? J.L_HIP : J.R_HIP, fTH = side === 0 ? F.L_TH : F.R_TH;
      const o = jHip * 3;
      xf(R, 0, P[0], P[1], P[2], sg * d.hipX, 0.004 * H, -0.012 * H, P, o);
      const ik = this.legIK[side];
      if (ik.on > 0.001) this._legIK(side, pre, sg, P[o], P[o + 1], P[o + 2]);
      const th = fTH * 9, sh = th + 9, ft = sh + 9;
      mulRot(R, 0, 0, p[CH[pre + 'HipF']], R, th);
      mulRot(R, th, 1, -sg * p[CH[pre + 'HipA']], R, th);
      mulRot(R, th, 2, sg * p[CH[pre + 'HipT']], R, th);
      xf(R, th, P[o], P[o + 1], P[o + 2], 0, 0, -d.th, P, o + 3);
      mulRot(R, th, 0, -p[CH[pre + 'Knee']], R, sh);
      xf(R, sh, P[o + 3], P[o + 4], P[o + 5], 0, 0, -d.sh, P, o + 6);
      const an = o + 6;
      if (ik.on >= 0.999) {
        // planted foot: foot frame from world yaw + pitch (pivot on the ball or heel)
        const cy = Math.cos(ik.yaw), sy = Math.sin(ik.yaw);
        mset(R, ft, sy, cy, 0, -cy, sy, 0, 0, 0, 1);
        mulRot(R, ft, 0, -ik.pitch, R, ft);
      } else {
        mulRot(R, sh, 0, p[CH[pre + 'Ank']], R, ft);
        if (ik.on > 0.001) {
          // blend toward the planted orientation
          const cy = Math.cos(ik.yaw), sy = Math.sin(ik.yaw);
          mset(T1, 0, sy, cy, 0, -cy, sy, 0, 0, 0, 1);
          mulRot(T1, 0, 0, -ik.pitch, T1, 0);
          const w = ik.on;
          for (let i = 0; i < 9; i++) R[ft + i] = R[ft + i] * (1 - w) + T1[i] * w;
          orthoCols(R, ft);
        }
      }
      xf(R, ft, P[an], P[an + 1], P[an + 2], 0, -d.heel, -d.ankH, P, an + 3);
      xf(R, ft, P[an], P[an + 1], P[an + 2], 0, d.ball, -d.ankH, P, an + 6);
      // toes: stay flat on the floor while the heel is up (MTP extension)
      const toeAng = ik.on >= 0.999 ? Math.max(0, ik.pitch) : p[CH[pre + 'Toe']];
      mulRot(R, ft, 0, toeAng, T2, 0);
      xf(T2, 0, P[an + 6], P[an + 7], P[an + 8], 0, d.toe, 0, P, an + 9);
    }

    _legIK(side, pre, sg, hx, hy, hz) {
      const d = this.dims, p = this.pose, R = this.R, ik = this.legIK[side];
      const wx = ik.x - hx, wy = ik.y - hy, wz = ik.z - hz;
      const Dx = R[0] * wx + R[3] * wy + R[6] * wz;
      const Dy = R[1] * wx + R[4] * wy + R[7] * wz;
      const Dz = R[2] * wx + R[5] * wy + R[8] * wz;
      const L1 = d.th, L2 = d.sh;
      const dist = Math.sqrt(Dx * Dx + Dy * Dy + Dz * Dz);
      const dd = U.clamp(dist, (L1 + L2) * 0.3, (L1 + L2) * 0.9995);
      const cosK = U.clamp((dd * dd - L1 * L1 - L2 * L2) / (2 * L1 * L2), -1, 1);
      const k = Math.acos(cosK);
      const Vy = -L2 * Math.sin(k), Vz = -L1 - L2 * Math.cos(k);
      // knee direction follows the foot yaw: set hip twist from foot yaw relative to pelvis facing
      if (ik.on >= 0.5) {
        const pelYaw = Math.atan2(R[4], R[1]); // forward axis (col 1) heading
        const rel = U.wrapPi(ik.yaw - pelYaw);
        p[CH[pre + 'HipT']] = U.clamp(sg * rel, -0.75, 0.6);
      }
      const tw = sg * p[CH[pre + 'HipT']];
      const Wx = -Vy * Math.sin(tw), Wy = Vy * Math.cos(tw), Wz = Vz;
      const sc = dist > 1e-6 ? dd / dist : 1;
      const sol = solve2(Wx, Wy, Wz, Dx * sc, Dy * sc, Dz * sc, -sg * p[CH[pre + 'HipA']]);
      const w = Math.min(1, ik.on);
      const F0 = p[CH[pre + 'HipF']], A0 = p[CH[pre + 'HipA']], K0 = p[CH[pre + 'Knee']];
      p[CH[pre + 'HipF']] = w >= 1 ? sol.f : U.angLerp(F0, sol.f, w);
      p[CH[pre + 'HipA']] = w >= 1 ? -sg * sol.b : U.angLerp(A0, -sg * sol.b, w);
      p[CH[pre + 'Knee']] = w >= 1 ? k : U.lerp(K0, k, w);
    }

    /** reach test: max ankle distance for a leg */
    legReach() { return (this.dims.th + this.dims.sh) * 0.995; }
    jx(j) { return this.P[j * 3]; }
    jy(j) { return this.P[j * 3 + 1]; }
    jz(j) { return this.P[j * 3 + 2]; }
  }

  // ------------------------------------------------------------ pole-vector arm IK
  const PSOL = { f: 0, b: 0, t: 0 };
  /** Two-bone arm solve with a swivel pole (all vectors in the chest frame, shoulder at the origin).
   *  (nx,ny,nz): wrist target at distance dd; (qx,qy,qz): direction the elbow should bulge toward.
   *  Returns the Euler angles of the rig's upper-arm frame Rx(f) Ry(b) Rz(t): humerus = -Z, elbow hinge = +X. */
  function armPole(nx, ny, nz, dd, L1, L2, qx, qy, qz, sg, f0, b0) {
    const il = 1 / (dd || 1e-6);
    const ux0 = nx * il, uy0 = ny * il, uz0 = nz * il; // unit shoulder->wrist
    const a = (L1 * L1 - L2 * L2 + dd * dd) / (2 * dd);
    const r = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    // pole component perpendicular to the shoulder->wrist line
    let k = qx * ux0 + qy * uy0 + qz * uz0;
    let px = qx - k * ux0, py = qy - k * uy0, pz = qz - k * uz0;
    let pl = Math.sqrt(px * px + py * py + pz * pz);
    if (pl < 1e-4) { // pole along the arm: fall back to "down and out"
      k = sg * 0.3 * ux0 - uz0; px = sg * 0.3 - k * ux0; py = -k * uy0; pz = -1 - k * uz0;
      pl = Math.sqrt(px * px + py * py + pz * pz) || 1;
    }
    px /= pl; py /= pl; pz /= pl;
    // elbow and the two bone directions
    const ex = a * ux0 + r * px, ey = a * uy0 + r * py, ez = a * uz0 + r * pz;
    const ux = ex / L1, uy = ey / L1, uz = ez / L1;
    const fx = (nx - ex) / L2, fy = (ny - ey) / L2, fz = (nz - ez) / L2;
    // hinge axis = humerus x forearm (flexion turns the forearm about +X); straight arm: from the pole side
    let hx = uy * fz - uz * fy, hy = uz * fx - ux * fz, hz = ux * fy - uy * fx;
    let hl = Math.sqrt(hx * hx + hy * hy + hz * hz);
    if (hl < 1e-3) { hx = py * uz - pz * uy; hy = pz * ux - px * uz; hz = px * uy - py * ux; hl = Math.sqrt(hx * hx + hy * hy + hz * hz) || 1; }
    hx /= hl; hy /= hl; hz /= hl;
    // humerus = (-sin b, sin f cos b, -cos f cos b): two Euler solutions, keep the one nearest the current pose
    let b = -Math.asin(U.clamp(ux, -1, 1));
    let f = Math.atan2(uy, -uz);
    const b2 = U.wrapPi(Math.PI - b), f2 = U.wrapPi(f + Math.PI);
    if (Math.abs(U.wrapPi(f2 - f0)) + Math.abs(U.wrapPi(b2 - b0)) < Math.abs(U.wrapPi(f - f0)) + Math.abs(U.wrapPi(b - b0))) { b = b2; f = f2; }
    const cf = Math.cos(f), sf = Math.sin(f), cb = Math.cos(b), sb = Math.sin(b);
    // e1 = Rx(f)Ry(b)X, e2 = Rx(f)Ry(b)Y; twist t puts the frame's X on the hinge axis
    const e1x = cb, e1y = sf * sb, e1z = -cf * sb;
    const e2y = cf, e2z = sf;
    const t = Math.atan2(hy * e2y + hz * e2z, hx * e1x + hy * e1y + hz * e1z);
    PSOL.f = f; PSOL.b = b; PSOL.t = t;
    return PSOL;
  }

  // ------------------------------------------------------------ anatomical joint limits
  // Active range of motion of healthy adults (AAOS / clinical goniometry norms), in the rig's conventions:
  // shoulder flexion 180 / extension 60, abduction 180, internal rotation 70 / external 90, elbow 0-150,
  // hip flexion 125 / extension 30, abduction 45 / adduction 30, rotation 45, knee 0-150, ankle dorsiflexion 30 /
  // plantarflexion 50; trunk flexion ~80 / extension ~30, lateral bend ~35, rotation ~45; neck flexion ~50 /
  // extension ~60, lateral bend ~45, rotation ~80.
  const LIM = {};
  (function () {
    const set = (k, lo, hi) => { LIM[k] = [lo * U.DEG, hi * U.DEG]; };
    for (const s of ['l', 'r']) {
      set(s + 'ShF', -60, 185); set(s + 'ShA', -45, 180); set(s + 'ShT', -90, 80); set(s + 'ElF', -4, 150);
      set(s + 'WrF', -75, 85); set(s + 'WrD', -25, 35);
      set(s + 'HipF', -32, 130); set(s + 'HipA', -30, 50); set(s + 'HipT', -45, 45); set(s + 'Knee', -3, 152); set(s + 'Ank', -52, 32);
    }
  })();
  const TORSO_PAIRS = [
    // [channel a, channel b, min sum, max sum] (degrees): shared ranges of the two spine or neck segments
    ['spFlex', 'chFlex', -32, 82], ['spLat', 'chLat', -36, 36], ['spTwist', 'chTwist', -46, 46],
    ['nkFlex', 'hdFlex', -62, 52], ['nkLat', 'hdLat', -42, 42], ['nkTwist', 'hdTwist', -80, 80],
  ].map(([a, b, lo, hi]) => [CH[a], CH[b], lo * U.DEG, hi * U.DEG]);
  /** clamp a pose to human joint ranges (in place) */
  function limitPose(p) {
    for (const k in LIM) { const i = CH[k], r = LIM[k]; const v = p[i]; if (v < r[0]) p[i] = r[0]; else if (v > r[1]) p[i] = r[1]; }
    for (const t of TORSO_PAIRS) {
      const sum = p[t[0]] + p[t[1]];
      if (sum < t[2] || sum > t[3]) { const k = (sum < t[2] ? t[2] : t[3]) / sum; p[t[0]] *= k; p[t[1]] *= k; }
    }
    return p;
  }
  /** the upper arm cannot pass through the chest: adduction limit relaxes as the arm is raised in front */
  function limitArm(p, pre) {
    const iF = CH[pre + 'ShF'], iA = CH[pre + 'ShA'];
    const fl = p[iF];
    const minA = U.lerp(-4, -45, U.smooth((fl - 20 * U.DEG) / (70 * U.DEG))) * U.DEG;
    if (p[iA] < minA) p[iA] = minA;
    const r = LIM[pre + 'ElF']; if (p[CH[pre + 'ElF']] < r[0]) p[CH[pre + 'ElF']] = r[0]; else if (p[CH[pre + 'ElF']] > r[1]) p[CH[pre + 'ElF']] = r[1];
    const rt = LIM[pre + 'ShT']; if (p[CH[pre + 'ShT']] < rt[0]) p[CH[pre + 'ShT']] = rt[0]; else if (p[CH[pre + 'ShT']] > rt[1]) p[CH[pre + 'ShT']] = rt[1];
  }

  const SOL = { f: 0, b: 0 };
  /** find f,b so that Rx(f)*Ry(b)*W = D (|W| == |D|); pick b nearest b0 */
  function solve2(Wx, Wy, Wz, Dx, Dy, Dz, b0) {
    const Rr = Math.sqrt(Wx * Wx + Wz * Wz);
    let b;
    if (Rr < 1e-6) b = b0;
    else {
      const psi = Math.atan2(Wz, Wx);
      const c = U.clamp(Dx / Rr, -1, 1);
      const ac = Math.acos(c);
      const b1 = U.wrapPi(psi + ac), b2 = U.wrapPi(psi - ac);
      b = Math.abs(U.wrapPi(b1 - b0)) < Math.abs(U.wrapPi(b2 - b0)) ? b1 : b2;
    }
    const cb = Math.cos(b), sb = Math.sin(b);
    const Bz = -Wx * sb + Wz * cb;
    const f = U.wrapPi(Math.atan2(Dz, Dy) - Math.atan2(Bz, Wy));
    SOL.f = f; SOL.b = b;
    return SOL;
  }

  /** re-orthonormalise the columns of a 3x3 (after linear blending) */
  function orthoCols(m, o) {
    // columns: X=(m0,m3,m6) Y=(m1,m4,m7) Z=(m2,m5,m8)
    let yx = m[o + 1], yy = m[o + 4], yz = m[o + 7];
    let l = Math.sqrt(yx * yx + yy * yy + yz * yz) || 1; yx /= l; yy /= l; yz /= l;
    let zx = m[o + 2], zy = m[o + 5], zz = m[o + 8];
    const dp = zx * yx + zy * yy + zz * yz; zx -= dp * yx; zy -= dp * yy; zz -= dp * yz;
    l = Math.sqrt(zx * zx + zy * zy + zz * zz) || 1; zx /= l; zy /= l; zz /= l;
    const xx = yy * zz - yz * zy, xy = yz * zx - yx * zz, xz = yx * zy - yy * zx;
    m[o] = xx; m[o + 3] = xy; m[o + 6] = xz; m[o + 1] = yx; m[o + 4] = yy; m[o + 7] = yz; m[o + 2] = zx; m[o + 5] = zy; m[o + 8] = zz;
  }

  M.Rig = { CH, NCH, GROUP, LINEAR, J, F, Skeleton, makeDims, pose, mirrorPose, mmul, mulRot, xf, orthoCols, limitPose, armPole, LIM };
})();
