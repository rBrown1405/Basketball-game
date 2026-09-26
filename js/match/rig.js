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
      // shoulder joint = the glenohumeral centre (~0.80 H), about 4 cm below the acromion (ANSUR acromion .826 H)
      shX: (fem ? 0.1 : 0.112) * H, shZ: 0.064 * H,
      hipX: (fem ? 0.056 : 0.051) * H,
      // arm segments from the shoulder joint centre (ANSUR / MakeHuman): upper arm ~0.172 H, forearm ~0.152 H, hand
      // ~0.112 H (wingspan ~1.09 H, long like an NBA player's; Drillis-Contini's 0.186 H is measured from the acromion)
      ua: 0.172 * H, fa: 0.152 * H, hand: 0.112 * H,
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
      this.inertL = null;
      this._iv = new Float64Array(6);
    }

    /** inertialize the legs that are off the floor (air0/air1); a leg on the floor follows its IK exactly */
    inertLegs(dt, air0, air1) {
      const p = this.pose, v = this._iv;
      if (!this.inertL) this.inertL = [0, 1].map(() => new Inert(LEG_INERT_IDX, LEG_INERT_ANG, LEG_INERT_THR, 0.06));
      for (let side = 0; side < 2; side++) {
        const pre = side ? 'r' : 'l', ie = this.inertL[side];
        for (let i = 0; i < 6; i++) v[i] = p[CH[pre + LEG_INERT[i]]];
        if (!ie.apply(v, dt, side ? air1 : air0)) continue;
        for (let i = 0; i < 6; i++) p[CH[pre + LEG_INERT[i]]] = v[i];
        this._legFK(side);
      }
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
      const ik = this.armIK[side];
      // scapulohumeral rhythm: raising the arm past ~70 deg also elevates the shoulder girdle (the joint rises
      // ~6-7 cm at full overhead reach), so overhead reaches - shots, dunks, rebounds, blocks - get the real
      // extra height and the shoulders shrug naturally
      let elev;
      if (ik.on > 0.001) {
        const wx = ik.x - P[6], wy = ik.y - P[7], wz = ik.z - (P[8] + d.shZ);
        const Dz = R[20] * wx + R[23] * wy + R[26] * wz, dl = Math.hypot(wx, wy, wz) || 1;
        elev = U.lerp(Math.acos(U.clamp(Math.cos(p[CH[pre + 'ShF']]) * Math.cos(p[CH[pre + 'ShA']]), -1, 1)), Math.acos(U.clamp(-Dz / dl, -1, 1)), Math.min(1, ik.on));
      } else elev = Math.acos(U.clamp(Math.cos(p[CH[pre + 'ShF']]) * Math.cos(p[CH[pre + 'ShA']]), -1, 1));
      const shrug = U.smooth((elev - 1.2) / 1.9) * 1.25;
      this._shoulder(side, shrug);
      if (ik.on > 0.001) this._armIK(side, pre, sg, P[o], P[o + 1], P[o + 2]);
      else { ik.hf = null; ik.hb = null; }
      limitArm(p, pre);
      this._armFK(side);
    }
    _shoulder(side, shrug) {
      const d = this.dims, H = d.H, P = this.P, R = this.R, p = this.pose;
      const sg = side === 0 ? -1 : 1, pre = side === 0 ? 'l' : 'r';
      const o = (side === 0 ? J.L_SH : J.R_SH) * 3;
      xf(R, 18, P[6], P[7], P[8], sg * d.shX, -0.006 * H + p[CH[pre + 'ClvP']] * 0.03 * H, d.shZ + (p[CH[pre + 'ClvE']] + shrug) * 0.035 * H, P, o);
    }
    /** forward kinematics of one arm from the shoulder joint and the pose angles */
    _armFK(side) {
      const d = this.dims, H = d.H, P = this.P, R = this.R, p = this.pose;
      const sg = side === 0 ? -1 : 1, pre = side === 0 ? 'l' : 'r';
      const o = (side === 0 ? J.L_SH : J.R_SH) * 3, fUA = side === 0 ? F.L_UA : F.R_UA;
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
      const d = this.dims, p = this.pose, R = this.R, P = this.P, ik = this.armIK[side];
      // target wrist in chest frame
      const wx = ik.x - sx, wy = ik.y - sy, wz = ik.z - sz;
      let Dx = R[18] * wx + R[21] * wy + R[24] * wz;
      let Dy = R[19] * wx + R[22] * wy + R[25] * wz;
      let Dz = R[20] * wx + R[23] * wy + R[26] * wz;
      const w = Math.min(1, ik.on);
      let px = 0, py = 0, pz = 0, pole = ik.pole;
      if (w < 0.999) {
        // part weight: blend where the WRIST goes (from the animated arm's wrist to the target) and solve the arm
        // fully; blending the two solutions' joint angles swung the arm through odd, even flipping, paths
        this._armFK(side);
        const o = (side === 0 ? J.L_SH : J.R_SH) * 3;
        const ax = P[o + 6] - sx, ay = P[o + 7] - sy, az = P[o + 8] - sz;
        const fx = R[18] * ax + R[21] * ay + R[24] * az, fy = R[19] * ax + R[22] * ay + R[25] * az, fz = R[20] * ax + R[23] * ay + R[26] * az;
        Dx = fx + (Dx - fx) * w; Dy = fy + (Dy - fy) * w; Dz = fz + (Dz - fz) * w;
        if (pole) {
          // and the elbow turns from where the animated elbow points to the pole
          const ex = P[o + 3] - sx, ey = P[o + 4] - sy, ez = P[o + 5] - sz;
          const qx = R[18] * ex + R[21] * ey + R[24] * ez, qy = R[19] * ex + R[22] * ey + R[25] * ez, qz = R[20] * ex + R[23] * ey + R[26] * ez;
          const ql = Math.hypot(qx, qy, qz) || 1, pl = Math.hypot(pole[0], pole[1], pole[2]) || 1;
          px = qx / ql * (1 - w) + pole[0] * sg / pl * w; py = qy / ql * (1 - w) + pole[1] / pl * w; pz = qz / ql * (1 - w) + pole[2] / pl * w;
        }
      } else if (pole) { px = pole[0] * sg; py = pole[1]; pz = pole[2]; }
      const L1 = d.ua, L2 = d.fa;
      let dist = Math.sqrt(Dx * Dx + Dy * Dy + Dz * Dz);
      const dmax = (L1 + L2) * 0.9995, dmin = Math.abs(L1 - L2) + 0.25 * L2;
      const dd = U.clamp(dist, dmin, dmax);
      const cosE = U.clamp((dd * dd - L1 * L1 - L2 * L2) / (2 * L1 * L2), -1, 1);
      const e = Math.acos(cosE);
      const sc = dist > 1e-6 ? dd / dist : 1;
      const nx = Dx * sc, ny = Dy * sc, nz = Dz * sc;
      const F0 = p[CH[pre + 'ShF']], A0 = p[CH[pre + 'ShA']], T0 = p[CH[pre + 'ShT']];
      // the shoulder angles have two equivalent solutions (see armPole): between valid ones, the one nearest the
      // arm's last frame (the authored pose is a poor guide when it is far from the reach, e.g. a dribble out of a
      // box-out stance, where a near tie flipped the arm)
      const hf = ik.hf != null ? ik.hf : F0, hb = ik.hb != null ? ik.hb : -sg * A0;
      let sf, sa, st = T0;
      if (pole) {
        // swivel from a pole: the elbow bends toward a natural direction (down, a little out and back for low
        // hands) instead of wherever the authored twist points it - no elbows folded into the chest
        const sol = armPole(nx, ny, nz, dd, L1, L2, px, py, pz, sg, hf, hb);
        sf = sol.f; sa = -sg * sol.b; st = sg * sol.t;
      } else {
        const Vy = L2 * Math.sin(e), Vz = -L1 - L2 * Math.cos(e);
        const tw = sg * T0;
        const Wx = -Vy * Math.sin(tw), Wy = Vy * Math.cos(tw), Wz = Vz;
        const sol = solve2(Wx, Wy, Wz, nx, ny, nz, hb, sg, tw);
        sf = sol.f; sa = -sg * sol.b;
      }
      ik.hf = sf; ik.hb = -sg * sa;
      p[CH[pre + 'ShF']] = sf; p[CH[pre + 'ShA']] = sa; p[CH[pre + 'ShT']] = st; p[CH[pre + 'ElF']] = e;
    }

    _leg(side) {
      const d = this.dims, H = d.H, P = this.P, R = this.R, p = this.pose;
      const sg = side === 0 ? -1 : 1, pre = side === 0 ? 'l' : 'r';
      const jHip = side === 0 ? J.L_HIP : J.R_HIP, fTH = side === 0 ? F.L_TH : F.R_TH;
      const o = jHip * 3;
      xf(R, 0, P[0], P[1], P[2], sg * d.hipX, 0.004 * H, -0.012 * H, P, o);
      const ik = this.legIK[side];
      if (ik.on > 0.001) this._legIK(side, pre, sg, P[o], P[o + 1], P[o + 2]);
      this._legFK(side);
    }
    /** forward kinematics of one leg from the hip joint and the pose angles (planted feet keep their floor frame) */
    _legFK(side) {
      const d = this.dims, H = d.H, P = this.P, R = this.R, p = this.pose;
      const sg = side === 0 ? -1 : 1, pre = side === 0 ? 'l' : 'r';
      const o = (side === 0 ? J.L_HIP : J.R_HIP) * 3, fTH = side === 0 ? F.L_TH : F.R_TH;
      const ik = this.legIK[side];
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
      let dd = U.clamp(dist, (L1 + L2) * 0.3, (L1 + L2) * 0.9995);
      if (ik.soft) {
        // soft IK for a swinging leg (Andy Nicholas): near full extension the knee angle changes infinitely fast
        // with distance, so the last few percent are eased in exponentially; the foot may trail its target by a
        // hair instead of the knee snapping straight
        const da = (L1 + L2) * 0.995, ds = (L1 + L2) * (ik.softW || 0.06);
        if (dist > da - ds) { const sd = da - ds * Math.exp(-(dist - (da - ds)) / ds), k = ik.softK == null ? 1 : ik.softK; dd = dd + (Math.min(dd, sd) - dd) * k; }
      }
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

  // ------------------------------------------------------------ inertialization
  // A body part whose solved pose jumps between two frames (a grip that changes, arm IK switching on or off, a
  // stance or a clip handing a channel to a different pose, a look-at target changing sides) is never shown
  // jumping: the part of the change that the channel's own velocity does not explain goes into an offset, and
  // the offset dies away with a critically damped spring, so the part travels to its new pose in ~0.2 s with no
  // pop and no lag the rest of the time (inertialization: D. Bollo, "Inertialization: High-Performance Animation
  // Transitions in Gears of War", GDC 2018; D. Holden, "Dead Blending", 2023).
  class Inert {
    /** idx: indices into the array given to apply(); ang[i]: 1 = angle (wrapped); thr[i]: the smallest
     *  unexplained change per 60 Hz frame treated as a jump; hl: half-life of the offset (s) */
    constructor(idx, ang, thr, hl) {
      const n = idx.length;
      this.idx = idx; this.ang = ang; this.thr = thr; this.hl = hl || 0.065;
      this.raw = new Float64Array(n); this.vel = new Float64Array(n);
      this.off = new Float64Array(n); this.offV = new Float64Array(n);
      this.jmp = new Float64Array(n); this.dlt = new Float64Array(n);
      this.init = false; this.mag = 0;
    }
    reset() { this.init = false; this.mag = 0; }
    /** v: values (raw in, smoothed out, in place); dt: time since the previous frame (0 = the same frame again);
     *  allow === false: only follow the raw values (no offset). Returns true when an offset is active (v changed). */
    apply(v, dt, allow) {
      const n = this.idx.length, idx = this.idx;
      if (allow === false && this.init && dt >= 0 && dt <= 0.12) {
        for (let i = 0; i < n; i++) {
          const r = v[idx[i]];
          if (dt > 0) this.vel[i] = (this.ang[i] ? U.wrapPi(r - this.raw[i]) : r - this.raw[i]) / dt;
          this.raw[i] = r; this.off[i] = 0; this.offV[i] = 0;
        }
        this.mag = 0;
        return false;
      }
      if (!this.init || !(dt >= 0) || dt > 0.12) {
        // first frame, or a long gap (fast-forward, off screen): start clean
        for (let i = 0; i < n; i++) { this.raw[i] = v[idx[i]]; this.vel[i] = 0; this.off[i] = 0; this.offV[i] = 0; }
        this.init = true; this.mag = 0;
        return false;
      }
      if (dt > 0) {
        let big = false;
        const tk = 0.6 + 24 * dt;
        this.cool = Math.max(0, (this.cool || 0) - dt);
        for (let i = 0; i < n; i++) {
          const r = v[idx[i]];
          const d = this.ang[i] ? U.wrapPi(r - this.raw[i]) : r - this.raw[i];
          const j = d - this.vel[i] * dt;
          this.dlt[i] = d; this.jmp[i] = j;
          if (Math.abs(j) > this.thr[i] * tk) big = true;
        }
        // (one cut per few frames: right after one, the new pose's own motion is learned, not absorbed)
        if (this.cool > 0) big = false;
        const y = 2 * Math.LN2 / this.hl, e = Math.exp(-y * dt);
        for (let i = 0; i < n; i++) {
          const j1 = this.offV[i] + this.off[i] * y;
          this.off[i] = e * (this.off[i] + j1 * dt);
          this.offV[i] = e * (this.offV[i] - j1 * y * dt);
          if (big) {
            // a jump: the pose carries on at its old velocity for this frame and the rest becomes offset; the new
            // pose's velocity is not known yet
            this.off[i] = U.clamp(this.off[i] - this.jmp[i], -OFF_MAX, OFF_MAX);
            this.vel[i] = 0;
          } else this.vel[i] = this.dlt[i] / dt;
          if (Math.abs(this.off[i]) < 1e-6 && Math.abs(this.offV[i]) < 1e-4) { this.off[i] = 0; this.offV[i] = 0; }
          this.raw[i] = v[idx[i]];
        }
        if (big) this.cool = 0.05;
      } else for (let i = 0; i < n; i++) this.raw[i] = v[idx[i]];
      let m = 0;
      for (let i = 0; i < n; i++) {
        const o = this.off[i];
        if (o !== 0) { v[idx[i]] += o; const a = Math.abs(o); if (a > m) m = a; }
      }
      this.mag = m;
      return m > 0;
    }
  }
  const OFF_MAX = 1.6; // an offset never exceeds ~90 deg (or 1.6 of a linear channel's unit)
  const LEG_INERT = ['HipF', 'HipA', 'HipT', 'Knee', 'Ank', 'Toe'];
  const LEG_INERT_IDX = [0, 1, 2, 3, 4, 5], LEG_INERT_ANG = [1, 1, 1, 1, 1, 1];
  const LEG_INERT_THR = [0.165, 0.165, 0.19, 0.165, 0.25, 0.3];

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
    // humerus = (-sin b, sin f cos b, -cos f cos b): two Euler solutions for the same arm. Keep the one inside the
    // shoulder's range of motion (the other one's twist is often past its limit, and clamping it bent the arm the
    // wrong way), and between two valid ones the one nearest the arm's last pose
    const b1 = -Math.asin(U.clamp(ux, -1, 1)), f1 = Math.atan2(uy, -uz);
    const b2 = U.wrapPi(Math.PI - b1), f2 = U.wrapPi(f1 + Math.PI);
    const twist = (f, b) => {
      const cf = Math.cos(f), sf = Math.sin(f), cb = Math.cos(b), sb = Math.sin(b);
      // e1 = Rx(f)Ry(b)X, e2 = Rx(f)Ry(b)Y; twist t puts the frame's X on the hinge axis
      const e1x = cb, e1y = sf * sb, e1z = -cf * sb, e2y = cf, e2z = sf;
      return Math.atan2(hy * e2y + hz * e2z, hx * e1x + hy * e1y + hz * e1z);
    };
    const t1 = twist(f1, b1), t2 = twist(f2, b2);
    const v1 = armViolation(f1, b1, t1, sg), v2 = armViolation(f2, b2, t2, sg);
    const d1 = Math.abs(U.wrapPi(f1 - f0)) + Math.abs(U.wrapPi(b1 - b0)), d2 = Math.abs(U.wrapPi(f2 - f0)) + Math.abs(U.wrapPi(b2 - b0));
    const two = v2 * 4 + d2 < v1 * 4 + d1;
    PSOL.f = two ? f2 : f1; PSOL.b = two ? b2 : b1; PSOL.t = two ? t2 : t1;
    return PSOL;
  }
  /** how far (radians, summed) a shoulder solution lies outside the joint limits (f = ShF, -sg b = ShA, sg t = ShT) */
  function armViolation(f, b, t, sg) {
    const out = (v, r) => (v < r[0] ? r[0] - v : v > r[1] ? v - r[1] : 0);
    const F = U.wrapPi(f), A = U.wrapPi(-sg * b), T = U.wrapPi(sg * t);
    return out(F < -Math.PI / 2 ? F + 2 * Math.PI : F, LIM.lShF) + out(A, LIM.lShA) + out(T, LIM.lShT);
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
  function solve2(Wx, Wy, Wz, Dx, Dy, Dz, b0, sg, tw) {
    const Rr = Math.sqrt(Wx * Wx + Wz * Wz);
    const fOf = (b) => { const Bz = -Wx * Math.sin(b) + Wz * Math.cos(b); return U.wrapPi(Math.atan2(Dz, Dy) - Math.atan2(Bz, Wy)); };
    let b;
    if (Rr < 1e-6) b = b0;
    else {
      const psi = Math.atan2(Wz, Wx);
      const c = U.clamp(Dx / Rr, -1, 1);
      const ac = Math.acos(c);
      const b1 = U.wrapPi(psi + ac), b2 = U.wrapPi(psi - ac);
      if (sg) {
        // (arms: the solution inside the shoulder's range first, then the one nearest the last pose)
        const s1 = armViolation(fOf(b1), b1, tw, sg) * 4 + Math.abs(U.wrapPi(b1 - b0));
        const s2 = armViolation(fOf(b2), b2, tw, sg) * 4 + Math.abs(U.wrapPi(b2 - b0));
        b = s1 <= s2 ? b1 : b2;
      } else b = Math.abs(U.wrapPi(b1 - b0)) < Math.abs(U.wrapPi(b2 - b0)) ? b1 : b2;
    }
    SOL.f = fOf(b); SOL.b = b;
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

  M.Rig = { CH, NCH, GROUP, LINEAR, J, F, Skeleton, makeDims, pose, mirrorPose, mmul, mulRot, xf, orthoCols, limitPose, armPole, LIM, Inert };
})();
