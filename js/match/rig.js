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
  /**
   * Segment lengths for one person (look: height and wingspan in inches, weight, gender, build; kind 'ref' for an
   * official). The fractions of height are a 6'6" player's (fitted to the MakeHuman mesh's landmarks and ANSUR); a
   * person of another size differs from him the way people do (Tune.body): taller players have relatively longer
   * legs and smaller heads, the trunk takes what is left of the height, and the arms follow the wingspan.
   */
  function makeDims(look, kind) {
    const TB = M.Tune.body;
    const hIn = U.clamp(+look.height || 78, 60, 92);
    const H = hIn / 12;
    const fem = look.gender === 'f';
    const wt = +look.weight || (fem ? 165 : 215);
    const bmi = 703 * wt / (hIn * hIn);
    const build = look.look && look.look.build != null ? +look.look.build : 0.5;
    // thickness: 1 = typical athlete; heavier BMI and higher build -> thicker
    const bulk = U.clamp(1 + (bmi - (fem ? 22.5 : 24.5)) * 0.035 + (build - 0.5) * 0.16, 0.82, 1.35);
    const musc = U.clamp(0.9 + build * 0.25 - (fem ? 0.1 : 0), 0.75, 1.2);
    // proportions by size: legs (hip joint to floor, 0.53 H at the reference) and head relative to height
    const kLeg = U.clamp(1 + TB.legPerFt * (H - TB.refHeightFt), TB.legClamp[0], TB.legClamp[1]);
    const kHd = Math.pow(H / TB.refHeightFt, TB.headExp);
    // pelvis root height with straight legs: the hip joint sits 0.012 H below the root, so the leg (hip joint to
    // ankle, 0.491 H) is only ~4 deg short of straight when standing tall. (At 0.53 H the knees could never
    // straighten past ~25 deg, which gave every walk and idle a crouched, toddler-like look.)
    const hipF = 0.53 * kLeg + 0.012;
    // the trunk and neck (0.365 H at the reference) take what is left: the head top stays at 1.005 H standing tall
    const kT = (1.005 - hipF - 0.098 * kHd) / 0.365;
    // arms from the wingspan (Tune.body.spanOffsetH): fingertip to fingertip = 2 x (shoulder joint offset + upper arm +
    // forearm + hand); the shoulder breadth and the hand stay proportional to height
    const shX = (fem ? 0.1 : 0.112) * H, hand = 0.112 * H;
    const dflt = TB.spanDefaultIn[kind === 'ref' ? 'ref' : fem ? 'f' : 'm'];
    const wIn = U.clamp(+look.wing || hIn + dflt, hIn * TB.spanClamp[0], hIn * TB.spanClamp[1]);
    const arm = wIn / 24 + TB.spanOffsetH * H / 2 - shX - hand;
    const d = {
      H, fem, bulk, musc, wing: wIn / 12, kLeg, kHd, kT, mass: wt,
      hipH: hipF * H,
      pelSp: 0.095 * H * kT, spCh: 0.1 * H * kT, chNk: 0.1 * H * kT, neck: 0.07 * H * kT,
      // head: radius, centre and top above the head joint (C1), and their forward offsets
      headR: 0.058 * H * kHd, hdC: 0.03 * H * kHd, hdTop: 0.098 * H * kHd, hdFwd: 0.014 * H * kHd, hdTopFwd: 0.004 * H * kHd,
      // shoulder joint = the glenohumeral centre (~0.80 H), about 4 cm below the acromion (ANSUR acromion .826 H)
      shX, shZ: 0.064 * H * kT,
      hipX: (fem ? 0.056 : 0.051) * H,
      // arm segments from the shoulder joint centre (ANSUR / MakeHuman): at a 1.05 H wingspan upper arm ~0.172 H,
      // forearm ~0.152 H, hand ~0.112 H (Drillis-Contini's 0.186 H upper arm is measured from the acromion)
      ua: arm * TB.armSplit, fa: arm * (1 - TB.armSplit), hand,
      th: 0.245 * H * kLeg, sh: 0.246 * H * kLeg, ankH: 0.039 * H * kLeg,
      heel: 0.03 * H, ball: 0.084 * H, toe: 0.04 * H,
      footW: 0.036 * H,
    };
    // how far the hip joint, chest joint, neck base and head joint sit above where a uniformly scaled reference body
    // has them, standing (the 3D mesh's trunk is moved to match, js/match/human.js): [reference height, shift] (ft)
    const zHip = d.hipH - 0.012 * H, zChs = d.hipH + d.pelSp + d.spCh, zNck = zChs + d.chNk, zHj = zNck + d.neck;
    d.shiftZ = [[0.53 * H, zHip - 0.53 * H], [0.737 * H, zChs - 0.737 * H], [0.837 * H, zNck - 0.837 * H], [0.907 * H, zHj - 0.907 * H]];
    return d;
  }
  /** the vertical shift of a standing body's point at reference height z (dims.shiftZ, linear between the joints) */
  function shiftAt(d, z) {
    const k = d.shiftZ;
    if (!k) return 0;
    if (z <= k[0][0]) return k[0][1];
    for (let i = 1; i < k.length; i++) if (z <= k[i][0]) return k[i - 1][1] + (k[i][1] - k[i - 1][1]) * (z - k[i - 1][0]) / (k[i][0] - k[i - 1][0]);
    return k[k.length - 1][1];
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
      // debug (the animation lab): when set to a Uint8Array(NCH), each solve marks the channels that were held at a
      // joint limit (1) or a limb that was out of reach and straightened (2); null in games (no cost)
      this.limHits = null;
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
        // (the blend carries the leg's motion on for a moment; it never carries a knee past straight or a hip past
        // its range: at a floater's take-off it bent the knee ~75 deg backwards for a few frames)
        clampChannels(p, LEG_KEYS[pre], this.limHits);
        this._legFK(side);
      }
    }

    /** full solve: root at ground point (x,y), body facing phi */
    solve(pose, x, y, phi) {
      const d = this.dims, H = d.H, P = this.P, R = this.R, B = this.B;
      const p = this.pose;
      if (pose !== p) p.set(pose);
      if (this.limHits) this.limHits.fill(0);
      limitPose(p, this.limHits);
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
      xf(R, 36, P[12], P[13], P[14], 0, d.hdFwd, d.hdC, P, 15);
      xf(R, 36, P[12], P[13], P[14], 0, d.hdTopFwd, d.hdTop, P, 18);
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
      // the shoulder blade goes with the arm: it slides forward round the ribs as the arm reaches out in front
      // (protraction, the shoulder ~5-6 cm forward and a little in at a full reach) and back as the arm swings behind
      // (retraction), from the animated upper arm and elbow; an arm held on the ball by IK takes 40% of it (its pose
      // is the designed hold, and the hand must stay on the ball). Without it the arm turned on a shoulder bolted to
      // a still chest
      // (fading out as the arm goes overhead, where the blade rotates up instead: that is the shrug above)
      const Fa = p[CH[pre + 'ShF']], hf = Math.sin(Fa) * Math.cos(p[CH[pre + 'ShA']]) * (1 - U.smooth((Fa - 95 * U.DEG) / (45 * U.DEG)));
      const ext = U.clamp(1 - p[CH[pre + 'ElF']] / (150 * U.DEG), 0, 1);
      const prot = (hf >= 0 ? Math.min(1.1, 1.1 * hf * (0.4 + 0.6 * ext)) : Math.max(-0.6, 0.5 * hf)) * (1 - 0.6 * Math.min(1, ik.on));
      this._shoulder(side, shrug, prot);
      if (ik.on > 0.001) this._armIK(side, pre, sg, P[o], P[o + 1], P[o + 2]);
      else { ik.hf = null; ik.hb = null; }
      limitArm(p, pre, this.limHits);
      this._armFK(side);
      this._armClear(side);
    }
    /** keeps an arm out of the body: an elbow or forearm sunk into the chest or belly, a hand in the trunk, or an arm
     *  through the head swivels out: the elbow turns about the shoulder-wrist line and the wrist stays where it is,
     *  by the smallest turn that clears (a search over the swivel angle for a collision-free arm, as in M. Kallmann,
     *  "Analytical inverse kinematics with body posture control", 2008), eased in over ~2 frames and out over ~6
     *  (this.dt: time since the last frame, set by the owner; 0 = the same frame solved again) */
    _armClear(side) {
      const d = this.dims, H = d.H, P = this.P, p = this.pose;
      const sg = side === 0 ? -1 : 1, pre = side === 0 ? 'l' : 'r';
      const o = (side === 0 ? J.L_SH : J.R_SH) * 3;
      const sv = this._swv || (this._swv = [0, 0]);
      const iF = CH[pre + 'ShF'], iA = CH[pre + 'ShA'], iT = CH[pre + 'ShT'];
      const F0 = p[iF], A0 = p[iA], T0 = p[iT];
      const dt = this.dt;
      // (solved again in the same frame, dt 0, the swivel stays where it is: nothing to search for)
      const pen0 = dt === 0 ? 0 : armPen(P, o, H);
      let want = 0;
      if (pen0 > 0.002 * H) {
        let best = pen0, bestPhi = 0;
        const s0 = sv[side] < 0 ? -1 : 1;
        for (const m of SWIVELS) {
          for (const sgn of [s0, -s0]) {
            if (!this._swivel(side, sgn * m)) continue;
            const pe = armPen(P, o, H);
            p[iF] = F0; p[iA] = A0; p[iT] = T0;
            if (pe < best - 0.001 * H) { best = pe; bestPhi = sgn * m; }
            if (pe <= 0.002 * H) break;
          }
          if (best <= 0.002 * H) break;
        }
        // (only a turn that really helps: a third of the way out at least)
        if (bestPhi && best < pen0 * 0.67) want = bestPhi;
        this._armFK(side);
      }
      let cur = sv[side];
      if (dt == null || !(dt >= 0) || dt > 0.12) cur = want;
      else if (dt > 0) cur += (want - cur) * (1 - Math.exp(-dt / (Math.abs(want) > Math.abs(cur) ? 0.025 : 0.09)));
      sv[side] = cur;
      if (Math.abs(cur) > 0.004 && this._swivel(side, cur)) { limitArm(p, pre, this.limHits); this._armFK(side); }
    }
    /** turn the arm's elbow by phi (rad) about the shoulder-wrist line, the wrist fixed: sets the shoulder angles
     *  (the elbow bend and the forearm and hand angles stay) and runs the arm's FK; false if the arm is straight */
    _swivel(side, phi) {
      const d = this.dims, P = this.P, R = this.R, p = this.pose;
      const sg = side === 0 ? -1 : 1, pre = side === 0 ? 'l' : 'r';
      const o = (side === 0 ? J.L_SH : J.R_SH) * 3;
      const sx = P[o], sy = P[o + 1], sz = P[o + 2];
      const ch = (x, y, z, i) => R[18 + i] * x + R[21 + i] * y + R[24 + i] * z;
      const wx = P[o + 6] - sx, wy = P[o + 7] - sy, wz = P[o + 8] - sz, ex = P[o + 3] - sx, ey = P[o + 4] - sy, ez = P[o + 5] - sz;
      const nx = ch(wx, wy, wz, 0), ny = ch(wx, wy, wz, 1), nz = ch(wx, wy, wz, 2);
      const qx = ch(ex, ey, ez, 0), qy = ch(ex, ey, ez, 1), qz = ch(ex, ey, ez, 2);
      const dd = Math.hypot(nx, ny, nz);
      if (dd < 1e-6) return false;
      const ux = nx / dd, uy = ny / dd, uz = nz / dd, k = qx * ux + qy * uy + qz * uz;
      const px = qx - k * ux, py = qy - k * uy, pz = qz - k * uz;
      if (Math.hypot(px, py, pz) < 0.02 * d.ua) return false;
      const c = Math.cos(phi), s = Math.sin(phi);
      // Rodrigues: the elbow's offset from the line turned about it
      const rx = px * c + (uy * pz - uz * py) * s, ry = py * c + (uz * px - ux * pz) * s, rz = pz * c + (ux * py - uy * px) * s;
      const sol = armPole(nx, ny, nz, dd, d.ua, d.fa, rx, ry, rz, sg, p[CH[pre + 'ShF']], -sg * p[CH[pre + 'ShA']]);
      p[CH[pre + 'ShF']] = sol.f; p[CH[pre + 'ShA']] = -sg * sol.b; p[CH[pre + 'ShT']] = sg * sol.t;
      this._armFK(side);
      return true;
    }
    /**
     * An elbow never snaps to the other side of its arm between frames: its swivel about the shoulder-wrist line turns
     * at most ~600 deg/s (the wrist stays where it is), so an IK answer that jumps (a grip handing over, a target
     * crossing the arm's line) is caught up with over a few frames instead of in one. dt: time since the last frame
     * (0 = the same frame solved again). Called after solve().
     */
    limitSwivel(dt) {
      const st = this._swLim || (this._swLim = [{ ref: null, now: null, dt: 1 / 60 }, { ref: null, now: null, dt: 1 / 60 }]);
      const P = this.P, R = this.R, d = this.dims;
      for (let side = 0; side < 2; side++) {
        const S = st[side];
        if (!(dt >= 0) || dt > 0.12) { S.ref = S.now = null; }
        else if (dt > 0) { S.ref = S.now; S.dt = dt; }
        const o = (side ? J.R_SH : J.L_SH) * 3;
        const ch = (x, y, z, i) => R[18 + i] * x + R[21 + i] * y + R[24 + i] * z;
        const cur = () => {
          const wx = P[o + 6] - P[o], wy = P[o + 7] - P[o + 1], wz = P[o + 8] - P[o + 2], ex = P[o + 3] - P[o], ey = P[o + 4] - P[o + 1], ez = P[o + 5] - P[o + 2];
          const nx = ch(wx, wy, wz, 0), ny = ch(wx, wy, wz, 1), nz = ch(wx, wy, wz, 2), nl = Math.hypot(nx, ny, nz);
          if (nl < 1e-6) return null;
          const ux = nx / nl, uy = ny / nl, uz = nz / nl;
          const qx = ch(ex, ey, ez, 0), qy = ch(ex, ey, ez, 1), qz = ch(ex, ey, ez, 2), k = qx * ux + qy * uy + qz * uz;
          const px = qx - k * ux, py = qy - k * uy, pz = qz - k * uz, pl = Math.hypot(px, py, pz);
          // (an arm nearly straight has no elbow side to keep)
          if (pl < 0.3 * d.ua) return null;
          return [px / pl, py / pl, pz / pl, ux, uy, uz];
        };
        let c = cur();
        if (!c) { S.now = null; continue; }
        const r = S.ref;
        if (r) {
          // the last frame's elbow direction, laid in the plane about this frame's shoulder-wrist line
          const k = r[0] * c[3] + r[1] * c[4] + r[2] * c[5];
          let ax = r[0] - k * c[3], ay = r[1] - k * c[4], az = r[2] - k * c[5];
          const al = Math.hypot(ax, ay, az);
          if (al > 1e-3) {
            ax /= al; ay /= al; az /= al;
            const cosA = ax * c[0] + ay * c[1] + az * c[2];
            const sinA = c[3] * (ay * c[2] - az * c[1]) + c[4] * (az * c[0] - ax * c[2]) + c[5] * (ax * c[1] - ay * c[0]);
            const ang = Math.atan2(sinA, cosA), max = 10.5 * S.dt;
            if (Math.abs(ang) > max && this._swivel(side, -(ang - Math.sign(ang) * max))) {
              limitArm(this.pose, side ? 'r' : 'l', this.limHits);
              this._armFK(side);
              c = cur() || c;
            }
          }
        }
        S.now = c;
      }
    }
    _shoulder(side, shrug, prot) {
      const d = this.dims, H = d.H, P = this.P, R = this.R, p = this.pose;
      const sg = side === 0 ? -1 : 1, pre = side === 0 ? 'l' : 'r';
      const o = (side === 0 ? J.L_SH : J.R_SH) * 3;
      const pr = p[CH[pre + 'ClvP']] + (prot || 0);
      // (protraction wraps the blade round the ribs: forward, and a little in)
      xf(R, 18, P[6], P[7], P[8], sg * (d.shX - Math.max(0, pr) * 0.009 * H), -0.006 * H + pr * 0.03 * H, d.shZ + (p[CH[pre + 'ClvE']] + shrug) * 0.035 * H, P, o);
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
      if (w < 0.999 || ik.fkPole) {
        this._armFK(side);
        const o = (side === 0 ? J.L_SH : J.R_SH) * 3;
        if (w < 0.999) {
          // part weight: blend where the WRIST goes (from the animated arm's wrist to the target) and solve the arm
          // fully; blending the two solutions' joint angles swung the arm through odd, even flipping, paths
          const ax = P[o + 6] - sx, ay = P[o + 7] - sy, az = P[o + 8] - sz;
          const fx = R[18] * ax + R[21] * ay + R[24] * az, fy = R[19] * ax + R[22] * ay + R[25] * az, fz = R[20] * ax + R[23] * ay + R[26] * az;
          // (toward the nearest point the hand can reach, not the target itself: a hand reaching for a ball still ~20 ft
          // off went ~13% of the way there at 13% of the weight, the arm straightening and swinging ~70 deg in one
          // frame, Trial 5; at full weight it is the same reach)
          const tl = Math.sqrt(Dx * Dx + Dy * Dy + Dz * Dz), rm = (d.ua + d.fa) * 0.9995;
          if (tl > rm) { const k = rm / tl; Dx *= k; Dy *= k; Dz *= k; }
          Dx = fx + (Dx - fx) * w; Dy = fy + (Dy - fy) * w; Dz = fz + (Dz - fz) * w;
        }
        const ex = P[o + 3] - sx, ey = P[o + 4] - sy, ez = P[o + 5] - sz;
        const qx = R[18] * ex + R[21] * ey + R[24] * ez, qy = R[19] * ex + R[22] * ey + R[25] * ez, qz = R[20] * ex + R[23] * ey + R[26] * ez;
        const ql = Math.hypot(qx, qy, qz) || 1;
        if (ik.fkPole) {
          // the elbow bulges the way the animated arm's elbow does (a clip's key poses, and everything between)
          px = qx / ql; py = qy / ql; pz = qz / ql; pole = PFK;
        } else if (pole) {
          // and the elbow turns from where the animated elbow points to the pole
          const pl = Math.hypot(pole[0], pole[1], pole[2]) || 1;
          px = qx / ql * (1 - w) + pole[0] * sg / pl * w; py = qy / ql * (1 - w) + pole[1] / pl * w; pz = qz / ql * (1 - w) + pole[2] / pl * w;
        }
      } else if (pole) { px = pole[0] * sg; py = pole[1]; pz = pole[2]; }
      const L1 = d.ua, L2 = d.fa;
      let dist = Math.sqrt(Dx * Dx + Dy * Dy + Dz * Dz);
      const dmax = (L1 + L2) * 0.9995, dmin = Math.abs(L1 - L2) + 0.25 * L2;
      const dd = U.clamp(dist, dmin, dmax);
      if (this.limHits && dist > dmax + 0.03) this.limHits[CH[pre + 'ElF']] = 2;
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
        // a foot in the air (steered by its heading and pitch) still hangs from its ankle: past the ankle's range
        // against the shank (the foot held flat under a shank swinging back bent it ~35-40 deg up) it turns with the
        // shank, toes down, to the end of the range
        if (ik.soft) this._footRange(side, LIM[pre + 'Ank']);
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
      this._toesUp(ft, an, toeAng);
    }
    /** toes through the floor with the ball of the foot above it bend up against the floor at the ball (the MTP joint,
     *  up to Tune.floor.toeBendMaxDeg), as real toes do when a foot brushes the floor (Trial 3: a swinging foot's toes
     *  dipped up to ~1.4 in through the floor for a frame, pitched down by the ankle's range) */
    _toesUp(ft, an, toeAng) {
      const P = this.P, R = this.R, d = this.dims;
      if (!(P[an + 11] < 0) || P[an + 8] < 0) return;
      // (the toe's forward axis turned up by t about the foot's x axis: its height slope is a cos t + b sin t)
      const a = R[ft + 7], b = R[ft + 8], A = Math.hypot(a, b);
      if (A < 1e-6) return;
      const t = Math.asin(U.clamp(-P[an + 8] / (d.toe * A), -1, 1)) - Math.atan2(a, b) + 0.2 * U.DEG;
      const t2 = Math.min(t, M.Tune.floor.toeBendMaxDeg * U.DEG);
      if (!(t2 > toeAng)) return;
      mulRot(R, ft, 0, t2, T2, 0);
      xf(T2, 0, P[an + 6], P[an + 7], P[an + 8], 0, d.toe, 0, P, an + 9);
    }

    /** the foot frame held inside the ankle's range [lo, hi] against the shank (pitch, + = dorsiflexion) and turned no
     *  further against it than the lower leg and foot can turn it (~35 deg either way): past either, the foot is
     *  rebuilt on the shank at the nearest angles it can have. Returns true if it moved (the foot's points are not
     *  recomputed: call before placing them, or use clampFoot) */
    _footRange(side, r, noYaw) {
      // (noYaw: a planted foot keeps its heading, set by the floor; only its pitch is held)
      const R = this.R, sh = (side ? F.R_SH : F.L_SH) * 9, ft = sh + 9, m = 0.25 * U.DEG, yr = noYaw ? Math.PI : FOOT_YAW_MAX;
      const fx = R[ft + 1], fy = R[ft + 4], fz = R[ft + 7];
      const lx = R[sh] * fx + R[sh + 3] * fy + R[sh + 6] * fz, ly = R[sh + 1] * fx + R[sh + 4] * fy + R[sh + 7] * fz, lz = R[sh + 2] * fx + R[sh + 5] * fy + R[sh + 8] * fz;
      const yw = Math.atan2(-lx, ly), a = Math.atan2(lz, Math.hypot(lx, ly));
      if (a <= r[1] - m && a >= r[0] + m && Math.abs(yw) <= yr) return false;
      mulRot(R, sh, 2, U.clamp(yw, -yr, yr), R, ft);
      mulRot(R, ft, 0, U.clamp(a, r[0] + m, r[1] - m), R, ft);
      return true;
    }
    /** a planted foot past the ankle's range [lo, hi] (radians) after everything else: the foot rolls onto the nearest
     *  angle it can have against the shank and its heel, ball and toe are placed again (the caller re-plants it) */
    clampFoot(side, lo, hi) {
      if (!this._footRange(side, [lo, hi], true)) return false;
      const d = this.dims, P = this.P, R = this.R, an = (side ? J.R_AN : J.L_AN) * 3, ft = (side ? F.R_FT : F.L_FT) * 9;
      xf(R, ft, P[an], P[an + 1], P[an + 2], 0, -d.heel, -d.ankH, P, an + 3);
      xf(R, ft, P[an], P[an + 1], P[an + 2], 0, d.ball, -d.ankH, P, an + 6);
      // (toes flat on the floor while the heel is up, as in _legFK)
      mulRot(R, ft, 0, Math.max(0, Math.asin(U.clamp(-R[ft + 7], -1, 1))), T2, 0);
      xf(T2, 0, P[an + 6], P[an + 7], P[an + 8], 0, d.toe, 0, P, an + 9);
      return true;
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
      if (this.limHits && ik.on >= 0.5 && dist > L1 + L2 + 0.03) this.limHits[CH[pre + 'Knee']] = 2;
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
      const sc = dist > 1e-6 ? dd / dist : 1;
      let sf = 0, sb = 0, pole = false;
      if (ik.on >= 0.999) {
        // the knee goes over the toes. The leg's plane is turned so the knee bulges the way the foot points (a
        // pole-vector solve: the foot's heading, in the pelvis frame), with the hip's twist whatever that takes; if the
        // hip cannot twist that far, it twists as far as it can and the knee points as near the toes as that allows
        // (before, the twist was the foot's heading against the pelvis's, only right for an upright thigh: in a deep
        // stance the knees splayed ~13 deg outside the feet). A stepping leg is solved the same way, so the knee's
        // plane carries straight on at lift-off and landing (Trial 3: switching solvers popped the knee each step)
        const cy = Math.cos(ik.yaw), sy = Math.sin(ik.yaw);
        const qx = R[0] * cy + R[3] * sy, qy = R[1] * cy + R[4] * sy, qz = R[2] * cy + R[5] * sy;
        // (a leg that has just landed keeps its knee where it was in the air, turned about the hip-ankle line, and eases
        // onto this plane, ik.swv: the leg held in the air by its guide or its ranges went onto it in one frame and the
        // knee popped, Trial 5)
        let ref = null;
        if (ik.swRef && !ik.soft) {
          const q0 = ik.swRef[0], q1 = ik.swRef[1], q2 = ik.swRef[2];
          ref = this._v; ref[0] = R[0] * q0 + R[3] * q1 + R[6] * q2; ref[1] = R[1] * q0 + R[4] * q1 + R[7] * q2; ref[2] = R[2] * q0 + R[5] * q1 + R[8] * q2;
        }
        const ps = legPole(Dx * sc, Dy * sc, Dz * sc, dd, L1, L2, qx, qy, qz, sg, p[CH[pre + 'HipF']], -sg * p[CH[pre + 'HipA']], ik.soft ? 0 : ik.swv || 0, ref);
        if (ref) { ik.swv = ps.sw; ik.swRef = null; ik.swNew = true; }
        const T = sg * ps.t, rT = LIM[pre + 'HipT'];
        if (T >= rT[0] && T <= rT[1]) {
          if (!ik.soft) {
            p[CH[pre + 'HipF']] = ps.f; p[CH[pre + 'HipA']] = -sg * ps.b; p[CH[pre + 'HipT']] = T; p[CH[pre + 'Knee']] = k;
            if (this.limHits) { for (const kk of LEG_KEYS[pre]) { const r = LIM[kk], v = p[CH[kk]]; if (v < r[0] - 0.02 || v > r[1] + 0.02) this.limHits[CH[kk]] = 1; } }
            return;
          }
          sf = ps.f; sb = ps.b; pole = true; p[CH[pre + 'HipT']] = T;
        } else p[CH[pre + 'HipT']] = U.clamp(T, rT[0], rT[1]);
      } else if (ik.on >= 0.5) {
        const pelYaw = Math.atan2(R[4], R[1]); // forward axis (col 1) heading
        const rel = U.wrapPi(ik.yaw - pelYaw);
        p[CH[pre + 'HipT']] = U.clamp(sg * rel, -0.75, 0.6);
      }
      if (!pole) {
        const tw = sg * p[CH[pre + 'HipT']];
        const Wx = -Vy * Math.sin(tw), Wy = Vy * Math.cos(tw), Wz = Vz;
        const sol = solve2(Wx, Wy, Wz, Dx * sc, Dy * sc, Dz * sc, -sg * p[CH[pre + 'HipA']]);
        sf = sol.f; sb = sol.b;
      }
      const sol = SOL; sol.f = sf; sol.b = sb;
      const w = Math.min(1, ik.on);
      const F0 = p[CH[pre + 'HipF']], A0 = p[CH[pre + 'HipA']], K0 = p[CH[pre + 'Knee']];
      let hipA = -sg * sol.b;
      if (ik.soft) {
        // a leg in the air, folded at the knee (a runner's heel kick), keeps its knee over its own line: with the
        // shank folded the hip-ankle line is short, so a small sideways miss of the ankle target fanned the whole
        // thigh out (the knee pointed 50-70 deg to the side at a sprint, the crab look); the more the knee bends,
        // the closer the hip's side-to-side angle is held to neutral, and the foot, in the air, misses its target
        // sideways by a little instead (a straight leg stepping out to the side still opens freely)
        const bend = U.smooth((k - 0.7) / 1.0);
        const hi = U.lerp(0.62, 0.12, bend), lo = U.lerp(-0.4, -0.12, bend);
        // (a guide for a leg in the air, not a joint limit: not flagged in the lab's limit overlay)
        // (coming in over the first part of the swing, ik.guardK: a leg planted far out to the side in a hard turn was
        // pulled in up to ~17 in on its first frame off the floor, Trial 4)
        const g = ik.guardK == null ? 1 : ik.guardK, hc = hipA > hi ? hi : hipA < lo ? lo : hipA;
        hipA += (hc - hipA) * g;
      }
      p[CH[pre + 'HipF']] = w >= 1 ? sol.f : U.angLerp(F0, sol.f, w);
      p[CH[pre + 'HipA']] = w >= 1 ? hipA : U.angLerp(A0, hipA, w);
      p[CH[pre + 'Knee']] = w >= 1 ? k : U.lerp(K0, k, w);
      // (a leg in the air is held to the hip's and knee's ranges; a planted one keeps its foot on its spot, a foot
      // dragged along the floor reads far worse, and the actor steps it before its hip gets there)
      if (ik.soft || ik.on < 0.999) clampChannels(p, LEG_KEYS[pre], this.limHits);
      else if (this.limHits) {
        for (const kk of LEG_KEYS[pre]) { const r = LIM[kk], v = p[CH[kk]]; if (v < r[0] - 0.02 || v > r[1] + 0.02) this.limHits[CH[kk]] = 1; }
      }
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
     *  unexplained change per 60 Hz frame treated as a jump; hl: half-life of the offset (s); coolS: after a jump, how
     *  long the new pose's motion is learned before another jump is caught (s) */
    constructor(idx, ang, thr, hl, coolS) {
      const n = idx.length;
      this.idx = idx; this.ang = ang; this.thr = thr; this.hl = hl || 0.065; this.coolS = coolS || 0.05;
      this.raw = new Float64Array(n); this.vel = new Float64Array(n);
      this.off = new Float64Array(n); this.offV = new Float64Array(n);
      this.jmp = new Float64Array(n); this.dlt = new Float64Array(n);
      // (the velocity the part had going into a jump, handed to the offset once the new pose's own velocity is known)
      this.vOld = new Float64Array(n); this.pend = false;
      this.init = false; this.mag = 0;
    }
    reset() { this.init = false; this.mag = 0; this.pend = false; }
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
        this.mag = 0; this.pend = false;
        return false;
      }
      if (!this.init || !(dt >= 0) || dt > 0.12) {
        // first frame, or a long gap (fast-forward, off screen): start clean
        for (let i = 0; i < n; i++) { this.raw[i] = v[idx[i]]; this.vel[i] = 0; this.off[i] = 0; this.offV[i] = 0; }
        this.init = true; this.mag = 0; this.pend = false;
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
        // the step after a jump: the new pose's velocity is known now; the offset takes the difference from the
        // velocity the part had, so it keeps moving the way it was and eases onto the new course (the velocity is
        // carried through the jump as well as the position: no kink in the motion)
        if (this.pend) {
          for (let i = 0; i < n; i++) this.offV[i] = U.clamp(this.offV[i] + this.vOld[i] - this.dlt[i] / dt, -OFFV_MAX, OFFV_MAX);
          this.pend = false;
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
            // pose's velocity is not known yet (next step)
            this.off[i] = U.clamp(this.off[i] - this.jmp[i], -OFF_MAX, OFF_MAX);
            this.vOld[i] = this.vel[i];
            this.vel[i] = 0;
          } else this.vel[i] = this.dlt[i] / dt;
          if (Math.abs(this.off[i]) < 1e-6 && Math.abs(this.offV[i]) < 1e-4) { this.off[i] = 0; this.offV[i] = 0; }
          this.raw[i] = v[idx[i]];
        }
        if (big) { this.cool = this.coolS; this.pend = true; }
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
  const OFFV_MAX = 12; // nor moves faster than ~700 deg/s
  const LEG_INERT = ['HipF', 'HipA', 'HipT', 'Knee', 'Ank', 'Toe'];
  const LEG_INERT_IDX = [0, 1, 2, 3, 4, 5], LEG_INERT_ANG = [1, 1, 1, 1, 1, 1];
  const LEG_INERT_THR = [0.165, 0.165, 0.19, 0.165, 0.25, 0.3];

  // ------------------------------------------------------------ arm vs body
  const SWIVELS = [0.2, 0.4, 0.65, 0.9, 1.2];
  const PFK = [0, 0, 0]; // marker: the pole comes from the animated elbow
  /** how deep (feet) the arm from shoulder joint offset o is inside the trunk (capsules round the pelvis-chest-neck
   *  line, r 0.075 H) or the head (sphere, r 0.068 H): elbow, forearm and hand, limb radii ~0.024 / 0.02 H, a
   *  little skin contact allowed */
  function armPen(P, o, H) {
    let worst = 0;
    const a0 = J.PEL * 3, a1 = J.CHS * 3, a2 = J.NCK * 3, hc = J.HC * 3;
    for (let i = 0; i < 6; i++) {
      // i 0..3 along elbow -> wrist, 4..5 along wrist -> hand
      let x, y, z, r;
      if (i < 4) { const t = i / 3; x = P[o + 3] + (P[o + 6] - P[o + 3]) * t; y = P[o + 4] + (P[o + 7] - P[o + 4]) * t; z = P[o + 5] + (P[o + 8] - P[o + 5]) * t; r = 0.024 * H; }
      else { const t = i === 4 ? 0.5 : 1; x = P[o + 6] + (P[o + 9] - P[o + 6]) * t; y = P[o + 7] + (P[o + 10] - P[o + 7]) * t; z = P[o + 8] + (P[o + 11] - P[o + 8]) * t; r = 0.02 * H; }
      const dT = Math.min(segDist(P, a0, a1, x, y, z), segDist(P, a1, a2, x, y, z));
      const pT = 0.075 * H + r - 0.016 * H - dT;
      const pH = 0.068 * H + r - 0.012 * H - Math.hypot(x - P[hc], y - P[hc + 1], z - P[hc + 2]);
      if (pT > worst) worst = pT;
      if (pH > worst) worst = pH;
    }
    return worst;
  }
  function segDist(P, a, b, x, y, z) {
    const ax = P[a], ay = P[a + 1], az = P[a + 2], bx = P[b] - ax, by = P[b + 1] - ay, bz = P[b + 2] - az;
    const l2 = bx * bx + by * by + bz * bz;
    const t = l2 > 1e-9 ? Math.max(0, Math.min(1, ((x - ax) * bx + (y - ay) * by + (z - az) * bz) / l2)) : 0;
    return Math.hypot(x - ax - bx * t, y - ay - by * t, z - az - bz * t);
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

  // (how far a foot in the air can be turned against its shank: tibial rotation with the knee bent plus the foot's own
  // turn at the ankle, ~35 deg either way)
  const FOOT_YAW_MAX = 35 * U.DEG;
  const LSOL = { f: 0, b: 0, t: 0, sw: 0 };
  /** Two-bone leg solve with a knee pole (pelvis frame, hip joint at the origin): (nx,ny,nz) the ankle target at
   *  distance dd, (qx,qy,qz) the way the knee should bulge. The same as armPole but for a hinge that bends backward
   *  (the shank folds behind the thigh). Returns the thigh frame's Euler angles Rx(f) Ry(b) Rz(t) (HipF = f,
   *  HipA = -sg b, HipT = sg t), of the two equivalent sets the one inside the hip's range, else nearest the last.
   *  sw: the knee turned this far (radians) about the hip-ankle line from the pole's plane; ref (a vector from the hip,
   *  pelvis frame): instead, the knee turned to that side of the line, the angle that took left in LSOL.sw */
  function legPole(nx, ny, nz, dd, L1, L2, qx, qy, qz, sg, f0, b0, sw, ref) {
    const il = 1 / (dd || 1e-6);
    const ux0 = nx * il, uy0 = ny * il, uz0 = nz * il;
    const a = (L1 * L1 - L2 * L2 + dd * dd) / (2 * dd);
    const r = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    let k = qx * ux0 + qy * uy0 + qz * uz0;
    let px = qx - k * ux0, py = qy - k * uy0, pz = qz - k * uz0;
    let pl = Math.sqrt(px * px + py * py + pz * pz);
    if (pl < 1e-4) { k = uy0; px = -k * ux0; py = 1 - k * uy0; pz = -k * uz0; pl = Math.sqrt(px * px + py * py + pz * pz) || 1; }
    px /= pl; py /= pl; pz /= pl;
    LSOL.sw = sw || 0;
    if (ref) {
      const kr = ref[0] * ux0 + ref[1] * uy0 + ref[2] * uz0;
      const rx = ref[0] - kr * ux0, ry = ref[1] - kr * uy0, rz = ref[2] - kr * uz0, rl = Math.sqrt(rx * rx + ry * ry + rz * rz);
      if (rl > 1e-4) {
        const cx = py * rz - pz * ry, cy = pz * rx - px * rz, cz = px * ry - py * rx;
        LSOL.sw = Math.atan2((cx * ux0 + cy * uy0 + cz * uz0) / rl, (px * rx + py * ry + pz * rz) / rl);
      }
    }
    if (LSOL.sw) {
      // (p turned about the unit hip-ankle line u: p cos + (u x p) sin, p being square to u)
      const cs = Math.cos(LSOL.sw), sn = Math.sin(LSOL.sw);
      const wx = uy0 * pz - uz0 * py, wy = uz0 * px - ux0 * pz, wz = ux0 * py - uy0 * px;
      px = px * cs + wx * sn; py = py * cs + wy * sn; pz = pz * cs + wz * sn;
    }
    // knee, thigh and shank directions
    const ex = a * ux0 + r * px, ey = a * uy0 + r * py, ez = a * uz0 + r * pz;
    const ux = ex / L1, uy = ey / L1, uz = ez / L1;
    const fx = (nx - ex) / L2, fy = (ny - ey) / L2, fz = (nz - ez) / L2;
    // hinge axis = shank x thigh (knee flexion turns the shank about -X); straight leg: thigh x pole
    let hx = fy * uz - fz * uy, hy = fz * ux - fx * uz, hz = fx * uy - fy * ux;
    let hl = Math.sqrt(hx * hx + hy * hy + hz * hz);
    if (hl < 1e-3) { hx = uy * pz - uz * py; hy = uz * px - ux * pz; hz = ux * py - uy * px; hl = Math.sqrt(hx * hx + hy * hy + hz * hz) || 1; }
    hx /= hl; hy /= hl; hz /= hl;
    const b1 = -Math.asin(U.clamp(ux, -1, 1)), f1 = Math.atan2(uy, -uz);
    const b2 = U.wrapPi(Math.PI - b1), f2 = U.wrapPi(f1 + Math.PI);
    const twist = (f, b) => {
      const cf = Math.cos(f), sf = Math.sin(f), cb = Math.cos(b), sb = Math.sin(b);
      const e1x = cb, e1y = sf * sb, e1z = -cf * sb, e2y = cf, e2z = sf;
      return Math.atan2(hy * e2y + hz * e2z, hx * e1x + hy * e1y + hz * e1z);
    };
    const t1 = twist(f1, b1), t2 = twist(f2, b2);
    const out = (v, rr) => (v < rr[0] ? rr[0] - v : v > rr[1] ? v - rr[1] : 0);
    const viol = (f, b, t) => out(U.wrapPi(f), LIM.lHipF) + out(U.wrapPi(-sg * b), LIM.lHipA) + out(U.wrapPi(sg * t), LIM.lHipT);
    const v1 = viol(f1, b1, t1), v2 = viol(f2, b2, t2);
    const d1 = Math.abs(U.wrapPi(f1 - f0)) + Math.abs(U.wrapPi(b1 - b0)), d2 = Math.abs(U.wrapPi(f2 - f0)) + Math.abs(U.wrapPi(b2 - b0));
    const two = v2 * 4 + d2 < v1 * 4 + d1;
    LSOL.f = two ? f2 : f1; LSOL.b = two ? b2 : b1; LSOL.t = two ? t2 : t1;
    return LSOL;
  }

  // ------------------------------------------------------------ anatomical joint limits
  // Active range of motion of healthy adults (AAOS / clinical goniometry norms), in the rig's conventions:
  // shoulder flexion 180 / extension 60, abduction 180, internal rotation 70 / external 90, elbow 0-150,
  // hip flexion 125 / extension 30, abduction 45 / adduction 30, rotation 45, knee 0-150, ankle dorsiflexion 30 /
  // plantarflexion 50; trunk flexion ~80 / extension ~30, lateral bend ~35, rotation ~45; neck flexion ~50 /
  // extension ~60, lateral bend ~45, rotation ~80.
  // (the ranges themselves are in Tune.limits: limbs per side, each spine and neck joint, and the two spine and the two
  // neck joints together; the torso's ranges are soft, see limitPose)
  const LIM = {}, SOFT = new Uint8Array(NCH), TORSO_PAIRS = [];
  let SOFT_S = 8 * U.DEG;
  /** (re)build the joint ranges from Tune.limits (call again after changing them live) */
  function buildLimits() {
    const TL = M.Tune.limits;
    for (const k in LIM) delete LIM[k];
    SOFT.fill(0);
    for (const s of ['l', 'r']) for (const k in TL.joints) LIM[s + k] = [TL.joints[k][0] * U.DEG, TL.joints[k][1] * U.DEG];
    for (const k in TL.segments) { LIM[k] = [TL.segments[k][0] * U.DEG, TL.segments[k][1] * U.DEG]; SOFT[CH[k]] = 1; }
    TORSO_PAIRS.length = 0;
    for (const [a, b, lo, hi] of TL.pairs) TORSO_PAIRS.push([CH[a], CH[b], lo * U.DEG, hi * U.DEG]);
    SOFT_S = TL.softDeg * U.DEG;
  }
  buildLimits();
  const FING_CH = [CH.lFing, CH.rFing];
  const ARM_REST = { l: ['lElF', 'lPro', 'lWrF', 'lWrD'], r: ['rElF', 'rPro', 'rWrF', 'rWrD'] };
  const LEG_KEYS = { l: ['lHipF', 'lHipA', 'lHipT', 'lKnee', 'lAnk'], r: ['rHipF', 'rHipA', 'rHipT', 'rKnee', 'rAnk'] };
  /** v held inside [lo, hi], easing in over the last s of the range: the same value and rate at the start of the ease
   *  (no kink in the motion), and the limit itself is never quite reached (tanh) */
  function softClamp(v, lo, hi, s) {
    s = Math.min(s, (hi - lo) * 0.25);
    const a = hi - s, b = lo + s;
    if (v > a) return a + s * Math.tanh((v - a) / s);
    if (v < b) return b - s * Math.tanh((b - v) / s);
    return v;
  }
  /** a joint angle held to its range [lo, hi], the way round the circle that moves it least (an IK answer of -125 deg
   *  of shoulder flexion is the arm 55 deg past straight up, so it goes to +185, not down to -60) */
  function clampAng(v, lo, hi) {
    if (v >= lo && v <= hi) return v;
    let best = v < lo ? lo : hi, bd = Math.abs(U.wrapPi(v - best));
    for (const c of [lo, hi]) { const d = Math.abs(U.wrapPi(v - c)); if (d < bd) { bd = d; best = c; } }
    return best;
  }
  /** hold channels i of pose p to their human ranges (after IK or blending); returns true if any moved */
  function clampChannels(p, keys, hits) {
    let moved = false;
    for (const k of keys) {
      const r = LIM[k]; if (!r) continue;
      const i = CH[k], v = p[i], c = clampAng(v, r[0], r[1]);
      if (c !== v) { p[i] = c; moved = true; if (hits) hits[i] = 1; }
    }
    return moved;
  }
  /** hold a pose to human joint ranges (in place): limbs clamped, spine and neck joints eased into their ends (soft
   *  ranges, each joint and each pair) so a turn or bend running into its limit slows down instead of stopping dead */
  function limitPose(p, hits) {
    const tol = 0.5 * U.DEG;
    for (const k in LIM) {
      const i = CH[k], r = LIM[k]; const v = p[i];
      if (SOFT[i]) {
        const c = softClamp(v, r[0], r[1], SOFT_S);
        p[i] = c; if (hits && Math.abs(c - v) > tol) hits[i] = 1;
      } else if (v < r[0]) { p[i] = r[0]; if (hits) hits[i] = 1; } else if (v > r[1]) { p[i] = r[1]; if (hits) hits[i] = 1; }
    }
    // fingers curl in, never bend back (0 = open flat, 1 = a fist)
    for (const i of FING_CH) { if (p[i] < 0) { p[i] = 0; if (hits) hits[i] = 1; } else if (p[i] > 1) { p[i] = 1; if (hits) hits[i] = 1; } }
    for (const t of TORSO_PAIRS) {
      const sum = p[t[0]] + p[t[1]];
      if (Math.abs(sum) < 1e-9) continue;
      const c = softClamp(sum, t[2], t[3], SOFT_S);
      if (c !== sum) { const k = c / sum; p[t[0]] *= k; p[t[1]] *= k; if (hits && Math.abs(c - sum) > tol) { hits[t[0]] = 1; hits[t[1]] = 1; } }
    }
    return p;
  }
  /** the most the upper arm can cross in front of the chest (adduction) at flexion F: a few degrees down at the
   *  side, ~20 deg at 35 deg of flexion, 45 by 70 */
  const adductMin = (F) => U.lerp(-4, -45, U.smooth((F - 10 * U.DEG) / (60 * U.DEG))) * U.DEG;
  /** how far an angle is outside [lo, hi] (the short way round) */
  const over = (v, r) => (v >= r[0] && v <= r[1]) ? 0 : Math.min(Math.abs(U.wrapPi(v - r[0])), Math.abs(U.wrapPi(v - r[1])));
  /** the upper arm cannot pass through the chest: adduction limit relaxes as the arm is raised in front */
  function limitArm(p, pre, hits) {
    const iF = CH[pre + 'ShF'], iA = CH[pre + 'ShA'], iT = CH[pre + 'ShT'], sg = pre === 'l' ? -1 : 1;
    const rF = LIM[pre + 'ShF'], rA = LIM[pre + 'ShA'], rT = LIM[pre + 'ShT'];
    // (the arm down at the side meets the trunk past a few degrees of adduction; raised forward it can cross in front
    // of the body: ~20 deg at 35 deg of flexion, 45 by 70)
    const rAof = (F) => [Math.max(rA[0], adductMin(F)), rA[1]];
    const viol = (F, A, T) => over(F, rF) + over(A, rAof(F)) + over(T, rT);
    let F = p[iF], A = p[iA], T = p[iT];
    // (a shoulder angle set outside the ranges may have an equivalent set that is inside them: the same arm, flexed
    // one way or abducted the other, twisted half a turn; it is used when it is further inside the ranges, or a
    // raised arm clamped in its other form jumped somewhere else in one frame)
    const v0 = viol(F, A, T);
    if (v0 > 0) {
      const F2 = U.wrapPi(F + Math.PI), A2 = U.wrapPi(-A - sg * Math.PI), T2 = U.wrapPi(T + sg * Math.PI);
      // (flexion kept on its own side of the circle: 185 deg is past straight up, not -175)
      const F2b = F2 < rF[0] ? F2 + 2 * Math.PI : F2;
      if (viol(F2b, A2, T2) < v0 - 1e-4) { F = F2b; A = A2; T = T2; }
    }
    // then each held to its range the short way round (flexion first: the adduction floor depends on it)
    const F1 = clampAng(F, rF[0], rF[1]), ra = rAof(F1), A1 = clampAng(A, ra[0], ra[1]), T1 = clampAng(T, rT[0], rT[1]);
    if (hits) { if (F1 !== F) hits[iF] = 1; if (A1 !== A) hits[iA] = 1; if (T1 !== T) hits[iT] = 1; }
    p[iF] = F1; p[iA] = A1; p[iT] = T1;
    // (the elbow, forearm and wrist too, after the IK)
    clampChannels(p, ARM_REST[pre], hits);
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

  M.Rig = { CH, NCH, GROUP, LINEAR, J, F, Skeleton, makeDims, shiftAt, pose, mirrorPose, mmul, mulRot, xf, orthoCols, limitPose, softClamp, buildLimits, armPole, LIM, TORSO_PAIRS, FING_CH, Inert };
})();
