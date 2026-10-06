// Mocap takes onto our players (the importer). A take's joints are turned, frame by frame, into the rig's pose channels
// (js/match/rig.js) plus a ground track, a heading and the feet's floor contacts: the format js/match/mocap.js plays.
//
// How: our rig is first posed like the take's rest pose (its bones' directions; the elbows and knees hinged the way a
// person's are, the thumbs where the take's are). Every part of our body then turns, each frame, the way the take's
// matching joint turned from its rest pose (a world rotation), and the rig's angles are read off that, joint by joint
// down the body from our own solved parent (so a joint held at the end of its range is made up for below it). Lengths
// never carry over: the take is scaled to our leg, the hips go where the take's hips go, and the feet are put on the
// floor where the take's feet are on it.
//
//   node tools/mocap/retarget.js <take.bvh> --map cmu [--name id] [--from s] [--to s] [--fps 30] [--out file.json]
'use strict';
const fs = require('fs'), path = require('path');
const B = require('./bvh');
const MAPS = require('./maps');

// ---------------------------------------------------------------- 3x3 row-major helpers
const I3 = () => [1, 0, 0, 0, 1, 0, 0, 0, 1];
function mm(A, Bm) {
  const C = new Array(9);
  for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++) C[r * 3 + k] = A[r * 3] * Bm[k] + A[r * 3 + 1] * Bm[3 + k] + A[r * 3 + 2] * Bm[6 + k];
  return C;
}
const tr = (A) => [A[0], A[3], A[6], A[1], A[4], A[7], A[2], A[5], A[8]];
const mv = (A, v) => [A[0] * v[0] + A[1] * v[1] + A[2] * v[2], A[3] * v[0] + A[4] * v[1] + A[5] * v[2], A[6] * v[0] + A[7] * v[1] + A[8] * v[2]];
const col = (A, k) => [A[k], A[3 + k], A[6 + k]];
const fromCols = (x, y, z) => [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const addv = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scl = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const nrm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
function Rx(a) { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; }
function Ry(a) { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; }
function Rz(a) { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1]; }
/** the facing frame of the rig (rig.js solve): forward (cos phi, sin phi), right (sin phi, -cos phi), up */
function Bphi(phi) { const c = Math.cos(phi), s = Math.sin(phi); return [s, c, 0, -c, s, 0, 0, 0, 1]; }

// quaternions [w, x, y, z] for halfway rotations
function quat(m) {
  const t = m[0] + m[4] + m[8];
  let w, x, y, z;
  if (t > 0) { const s = Math.sqrt(t + 1) * 2; w = s / 4; x = (m[7] - m[5]) / s; y = (m[2] - m[6]) / s; z = (m[3] - m[1]) / s; }
  else if (m[0] > m[4] && m[0] > m[8]) { const s = Math.sqrt(1 + m[0] - m[4] - m[8]) * 2; w = (m[7] - m[5]) / s; x = s / 4; y = (m[1] + m[3]) / s; z = (m[2] + m[6]) / s; }
  else if (m[4] > m[8]) { const s = Math.sqrt(1 + m[4] - m[0] - m[8]) * 2; w = (m[2] - m[6]) / s; x = (m[1] + m[3]) / s; y = s / 4; z = (m[5] + m[7]) / s; }
  else { const s = Math.sqrt(1 + m[8] - m[0] - m[4]) * 2; w = (m[3] - m[1]) / s; x = (m[2] + m[6]) / s; y = (m[5] + m[7]) / s; z = s / 4; }
  return [w, x, y, z];
}
function qmat(q) {
  const [w, x, y, z] = q;
  return [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w), 2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w), 2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)];
}
function mean2(A, Bm) {
  const a = quat(A); let b = quat(Bm);
  if (a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3] < 0) b = b.map(v => -v);
  const q = [a[0] + b[0], a[1] + b[1], a[2] + b[2], a[3] + b[3]], l = Math.hypot(...q);
  return qmat(q.map(v => v / l));
}

// ---------------------------------------------------------------- Euler read-offs in the rig's orders
/** M = Rz(tw) Rx(a) Ry(r) (the spine and neck joints: twist, then -flexion, then lateral bend) */
function zxy(M) { return { tw: Math.atan2(-M[1], M[4]), a: Math.asin(clamp(M[7], -1, 1)), r: Math.atan2(-M[6], M[8]) }; }
/** M = Rx(f) Ry(b) Rz(t) (shoulders and hips), the solution nearest prev; at the gimbal (b near +-90 deg: an arm
 *  straight out to the side) f stays where it was and t takes the rest of the turn */
function xyz(M, prev) {
  const sb = clamp(M[2], -1, 1), cbA = Math.hypot(M[0], M[1]);
  const cands = [];
  for (const k of [1, -1]) {
    const b = Math.atan2(sb, k * cbA);
    let f, t;
    if (cbA > 0.04) { f = Math.atan2(-M[5] * k, M[8] * k); t = Math.atan2(-M[1] * k, M[0] * k); }
    else {
      // (row 1 holds sin/cos of f + t when sin b = 1, of t - f when sin b = -1)
      f = prev ? prev.f : 0;
      const s = Math.atan2(M[3], M[4]);
      t = sb > 0 ? s - f : s + f;
    }
    cands.push({ f, b, t });
  }
  if (!prev) return cands[0];
  const dist = (c) => Math.abs(wrap(c.f - prev.f)) + Math.abs(wrap(c.b - prev.b)) + Math.abs(wrap(c.t - prev.t));
  return dist(cands[0]) <= dist(cands[1]) ? cands[0] : cands[1];
}
/** M = Rx(e) Rz(p) (the elbow and the forearm's turn) */
function xz(M) { return { e: Math.atan2(-M[5], M[8]), p: Math.atan2(-M[1], M[0]) }; }
/** M = Rx(w) Ry(d) (the wrist) */
function xy(M) { return { w: Math.atan2(M[7], M[4]), d: Math.atan2(M[2], M[0]) }; }
/** M = Rx(a) (a hinge: the knee (as -a), the ankle, the toes) */
function xOnly(M) { return Math.atan2(M[7], M[8]); }

// ---------------------------------------------------------------- the game's rig, loaded headless
function loadRig() {
  const { load } = require('../audit/load');
  const { PBC } = load(1);
  return PBC.Match;
}

/**
 * Retarget one take. opt: { map, from, to (s), fps (output), height (in, the reference body) }.
 * Returns the clip: { fps, n, ch: [channel names], frames: [[...]] (radians / H fractions), track: { x, y, yaw }
 * (per frame: ground point in H fractions, heading in radians, from the first frame), contacts: { l, r } (frame
 * ranges [a, b]), stats }.
 */
function retarget(bvh, opt) {
  const M = opt.M || loadRig();
  const RG = M.Rig, CH = RG.CH, NCH = RG.NCH, LIM = RG.LIM;
  // (a map by name, 'auto' to read it off the joints' names, or a map itself)
  let map = opt.map && typeof opt.map === 'object' ? opt.map : MAPS[opt.map || 'cmu'];
  if (opt.map === 'auto') { const d = MAPS.detect(bvh.joints.map(j => j.name)); if (!d) throw new Error('no joint map fits this skeleton: ' + bvh.joints.map(j => j.name).join(', ')); map = d.map; }
  const look = { height: opt.height || 78, weight: 215, gender: 'm' };
  const dims = RG.makeDims(look), H = dims.H;
  const J = {};
  bvh.joints.forEach((j, i) => { J[j.name] = i; });
  const jx = (n) => { if (J[n] == null) throw new Error('joint ' + n + ' not in the take'); return J[n]; };
  const restRaw = B.rest(bvh);
  // the take's axes to ours (x, y on the floor, z up): Y-up files turn their -Z into our +y. Which axis is up is read off
  // the rest pose (ankle to head), so a file exported from another tool (Blender writes Z up) needs no setting
  const rv = (n) => { const i = jx(n) * 3; return [restRaw[i], restRaw[i + 1], restRaw[i + 2]]; };
  const vert = sub(rv(map.head[0]), rv(map.l.ankle));
  const up = Math.abs(vert[1]) >= Math.abs(vert[2]) ? 'y' : 'z';
  const AX = up === 'y' ? [1, 0, 0, 0, 0, -1, 0, 1, 0] : I3(), AXt = tr(AX);
  const restP = (n) => { const i = jx(n) * 3; return mv(AX, [restRaw[i], restRaw[i + 1], restRaw[i + 2]]); };
  // the rest pose's right, forward and up
  const Lr0 = sub(restP(map.r.hip), restP(map.l.hip)); Lr0[2] = 0;
  const Lr = nrm(Lr0), Up = [0, 0, 1], Fr = cross(Up, Lr);
  const R0 = fromCols(Lr, Fr, Up);
  const phiRest = Math.atan2(Fr[1], Fr[0]);
  // scale: the take's leg (hip to ankle along the bones) to ours
  const legM = ['l', 'r'].map(s => len(sub(restP(map[s].knee), restP(map[s].hip))) + len(sub(restP(map[s].ankle), restP(map[s].knee)))).reduce((a, b) => a + b) / 2;
  const S = (dims.th + dims.sh) / legM;

  // ---------------- our body posed like the take's rest pose (bone directions; hinges and thumbs as the take's)
  const restPose = new Float32Array(NCH);
  const sk = new RG.Skeleton(dims);
  sk.dt = 0;
  const hinges = hingeAxes(bvh, map, AX);
  for (const side of ['l', 'r']) {
    const sg = side === 'l' ? -1 : 1, m = map[side];
    // upper arm and thigh: flexion and abduction from the bone's direction in the (upright) rest body frame
    // (an arm straight out to the side has no flexion to read: it stays 0)
    const ua = mv(tr(R0), nrm(sub(restP(m.elbow), restP(m.shoulder))));
    const F = Math.hypot(ua[1], ua[2]) > 0.02 ? Math.atan2(ua[1], -ua[2]) : 0, b = Math.asin(clamp(-ua[0], -1, 1));
    restPose[CH[side + 'ShF']] = F; restPose[CH[side + 'ShA']] = -sg * b;
    const fa = mv(tr(R0), nrm(sub(restP(m.wrist), restP(m.elbow))));
    restPose[CH[side + 'ElF']] = Math.acos(clamp(dot(ua, fa), -1, 1));
    // (the upper arm turned so our elbow's hinge is the take's: our forearm bends toward +Y about +X of the upper arm)
    const h = hinges[side].elbow;
    if (h) { const hl = mv(tr(mm(mm(R0, Rx(F)), Ry(b))), h); restPose[CH[side + 'ShT']] = sg * Math.atan2(hl[1], hl[0]); }
    const th = mv(tr(R0), nrm(sub(restP(m.knee), restP(m.hip))));
    const HF = Math.hypot(th[1], th[2]) > 0.02 ? Math.atan2(th[1], -th[2]) : 0, hb = Math.asin(clamp(-th[0], -1, 1));
    restPose[CH[side + 'HipF']] = HF; restPose[CH[side + 'HipA']] = -sg * hb;
    const shn = mv(tr(R0), nrm(sub(restP(m.ankle), restP(m.knee))));
    restPose[CH[side + 'Knee']] = Math.acos(clamp(dot(th, shn), -1, 1));
    // (and the thigh so our knee's is the take's: our shank bends back about -X of the thigh)
    const hk = hinges[side].knee;
    if (hk) { const hl = mv(tr(mm(mm(R0, Rx(HF)), Ry(hb))), hk); restPose[CH[side + 'HipT']] = sg * Math.atan2(-hl[1], -hl[0]); }
  }
  // (solve once for the arm and leg frames, then turn the forearms so the thumbs point where the take's do at rest,
  // and the feet flat)
  sk.solve(restPose, 0, 0, phiRest);
  for (const side of ['l', 'r']) {
    const sg = side === 'l' ? -1 : 1, m = map[side];
    const fUA = (side === 'l' ? RG.F.L_UA : RG.F.R_UA) * 9, fTH = (side === 'l' ? RG.F.L_TH : RG.F.R_TH) * 9;
    const Rua = Array.from(sk.R.subarray(fUA, fUA + 9));
    const Q = mm(Rua, Rx(restPose[CH[side + 'ElF']]));
    const th0 = sub(restP(m.thumb), restP(m.wrist)), hd0 = nrm(sub(restP(m.finger), restP(m.wrist)));
    const thumb = nrm(sub(th0, scl(hd0, dot(th0, hd0))));
    const a = dot(thumb, col(Q, 0)), c = dot(thumb, col(Q, 1));
    restPose[CH[side + 'Pro']] = sg * Math.atan2(sg * c, sg * a);
    const Rsh = mm(Array.from(sk.R.subarray(fTH, fTH + 9)), Rx(-restPose[CH[side + 'Knee']]));
    // (the foot's forward axis level: Y_ft = Rsh (0, cos A, sin A) with no rise)
    const yA = col(Rsh, 1), zA = col(Rsh, 2);
    restPose[CH[side + 'Ank']] = Math.atan2(-yA[2], zA[2]);
  }
  sk.solve(restPose, 0, 0, phiRest);
  const frameOf = (f) => Array.from(sk.R.subarray(f * 9, f * 9 + 9));
  const REST = {
    pel: R0, sp: R0, ch: R0, nk: R0, hd: R0,
    l: { ua: frameOf(RG.F.L_UA), fa: frameOf(RG.F.L_FA), hand: frameOf(RG.F.L_HD), th: frameOf(RG.F.L_TH), sh: frameOf(RG.F.L_SH), ft: frameOf(RG.F.L_FT) },
    r: { ua: frameOf(RG.F.R_UA), fa: frameOf(RG.F.R_FA), hand: frameOf(RG.F.R_HD), th: frameOf(RG.F.R_TH), sh: frameOf(RG.F.R_SH), ft: frameOf(RG.F.R_FT) },
  };
  for (const s of ['l', 'r']) REST[s].toe = REST[s].ft;

  // ---------------- every frame of the take
  const fps0 = 1 / bvh.dt;
  let f0 = Math.max(0, Math.round((opt.from || 0) * fps0));
  const f1 = Math.min(bvh.nFrames - 1, opt.to != null ? Math.round(opt.to * fps0) : bvh.nFrames - 1);
  // (frames whose ankles have no rotation at all are not captured motion: a take can start with the feet left at
  // their rest angles, which with bent knees puts the toes through the floor; they are skipped)
  const ankles = [map.l.ankle, map.r.ankle].map(n => bvh.joints[jx(n)]);
  const dead = (f) => ankles.some(j => j.channels.length && j.channels.every((c, k) => bvh.data[f * bvh.nCh + j.ch0 + k] === 0));
  while (f0 < f1 && dead(f0)) f0++;
  const NF = f1 - f0 + 1;
  const W = (w, n) => { const i = jx(n) * 9; return mm(mm(AX, Array.from(w.R.subarray(i, i + 9))), AXt); };
  const P = (w, n) => { const i = jx(n) * 3; return scl(mv(AX, [w.pos[i], w.pos[i + 1], w.pos[i + 2]]), S); };
  const handDir = { l: nrm(sub(restP(map.l.finger), restP(map.l.wrist))), r: nrm(sub(restP(map.r.finger), restP(map.r.wrist))) };
  const rotOf = (w, list) => (list.length > 1 ? mean2(W(w, list[0]), W(w, list[1])) : W(w, list[0]));
  const raw = [];
  for (let f = f0; f <= f1; f++) {
    const w = B.world(bvh, f);
    const T = { pel: mm(rotOf(w, map.pelvis), REST.pel), sp: mm(rotOf(w, map.spine), REST.sp), ch: mm(rotOf(w, map.chest), REST.ch), nk: mm(rotOf(w, map.neck), REST.nk), hd: mm(rotOf(w, map.head), REST.hd) };
    for (const s of ['l', 'r']) {
      const m = map[s];
      T[s] = {
        ua: mm(W(w, m.shoulder), REST[s].ua), fa: mm(W(w, m.forearm || m.elbow), REST[s].fa), hand: mm(W(w, m.hand || m.wrist), REST[s].hand),
        th: mm(W(w, m.hip), REST[s].th), sh: mm(W(w, m.knee), REST[s].sh), ft: mm(W(w, m.ankle), REST[s].ft), toe: mm(W(w, m.ball), REST[s].toe),
        // the finger's bend (the curl), from the finger joint's turn against the hand's
        curl: (() => { const a = mv(W(w, m.hand || m.wrist), handDir[s]), b = mv(W(w, m.fingerJ), handDir[s]); return Math.acos(clamp(dot(a, b), -1, 1)); })(),
        pts: { hip: P(w, m.hip), knee: P(w, m.knee), ankle: P(w, m.ankle), ball: P(w, m.ball), toe: P(w, m.toe), shoulder: P(w, m.shoulder), elbow: P(w, m.elbow), wrist: P(w, m.wrist) },
      };
    }
    const hipC = scl(addv(T.l.pts.hip, T.r.pts.hip), 0.5);
    // our pelvis root sits 0.012 H above the hip joints' midpoint (rig.js _leg), along the pelvis's own axes
    const pel = addv(hipC, mv(T.pel, [0, -0.004 * H, 0.012 * H]));
    const fwd = addv(scl(col(T.pel, 1), 0.7), scl(col(T.ch, 1), 0.3));
    raw.push({ T, pel, yaw: Math.atan2(fwd[1], fwd[0]) });
  }
  // the heading: the hips' and chest's facing, unwrapped and smoothed (~0.08 s)
  const yawU = []; let acc = raw[0].yaw;
  for (let i = 0; i < NF; i++) { if (i) acc += wrap(raw[i].yaw - raw[i - 1].yaw); yawU.push(acc); }
  const heading = gauss(yawU, 0.08 * fps0);
  // the ground point: the pelvis's path smoothed (~0.15 s); what is left over is the pelvis's sway (rootX, rootY)
  const gx = gauss(raw.map(r => r.pel[0]), 0.15 * fps0), gy = gauss(raw.map(r => r.pel[1]), 0.15 * fps0);

  // ---------------- the rig's angles, joint by joint from our own solved parents
  const out = [];
  let prevSh = { l: null, r: null }, prevHip = { l: null, r: null };
  const lim = (k, v) => { const r = LIM[k]; return r ? clamp(v, r[0], r[1]) : v; };
  for (let i = 0; i < NF; i++) {
    const { T } = raw[i], p = new Float64Array(NCH);
    const phi = heading[i], Bm = Bphi(phi);
    // torso (twist, -flexion, lateral bend), each from the frame above it as solved
    let par = Bm;
    const torso = [['pel', 'pelTwist', 'pelPitch', 'pelRoll'], ['sp', 'spTwist', 'spFlex', 'spLat'], ['ch', 'chTwist', 'chFlex', 'chLat'], ['nk', 'nkTwist', 'nkFlex', 'nkLat'], ['hd', 'hdTwist', 'hdFlex', 'hdLat']];
    const FR = {};
    for (const [seg, kt, kf, kl] of torso) {
      const e = zxy(mm(tr(par), T[seg]));
      p[CH[kt]] = e.tw; p[CH[kf]] = -e.a; p[CH[kl]] = e.r;
      par = mm(mm(mm(par, Rz(e.tw)), Rx(e.a)), Ry(e.r));
      FR[seg] = par;
    }
    // (the rig eases the spine and neck into their ranges itself; the limbs hang off these frames as solved there)
    const tp = Float32Array.from(p); RG.limitPose(tp);
    const fk = (keys) => { let R = Bm; for (const [kt, kf, kl] of keys) R = mm(mm(mm(R, Rz(tp[CH[kt]])), Rx(-tp[CH[kf]])), Ry(tp[CH[kl]])); return R; };
    const Rpel = fk([['pelTwist', 'pelPitch', 'pelRoll']]);
    const Rch = fk([['pelTwist', 'pelPitch', 'pelRoll'], ['spTwist', 'spFlex', 'spLat'], ['chTwist', 'chFlex', 'chLat']]);
    for (const side of ['l', 'r']) {
      const sg = side === 'l' ? -1 : 1, t = T[side];
      // shoulder: Rx(F) Ry(-sg A) Rz(sg T)
      const e1 = xyz(mm(tr(Rch), t.ua), prevSh[side]);
      prevSh[side] = e1;
      const F = lim(side + 'ShF', e1.f), A = lim(side + 'ShA', -sg * e1.b), Tw = lim(side + 'ShT', sg * e1.t);
      p[CH[side + 'ShF']] = F; p[CH[side + 'ShA']] = A; p[CH[side + 'ShT']] = Tw;
      const Rua = mm(mm(mm(Rch, Rx(F)), Ry(-sg * A)), Rz(sg * Tw));
      // elbow and forearm: Rx(E) Rz(sg Pro)
      const e2 = xz(mm(tr(Rua), t.fa));
      const E = lim(side + 'ElF', e2.e), Pr = lim(side + 'Pro', sg * e2.p);
      p[CH[side + 'ElF']] = E; p[CH[side + 'Pro']] = Pr;
      const Rfa = mm(mm(Rua, Rx(E)), Rz(sg * Pr));
      // wrist: Rx(WrF) Ry(-sg WrD)
      const e3 = xy(mm(tr(Rfa), t.hand));
      p[CH[side + 'WrF']] = lim(side + 'WrF', e3.w); p[CH[side + 'WrD']] = lim(side + 'WrD', -sg * e3.d);
      // (the finger joints' bend: open at 0, a loose hand ~0.3)
      p[CH[side + 'Fing']] = clamp(0.12 + t.curl / (110 * Math.PI / 180) * 0.7, 0.05, 0.8);
      // hip: Rx(HipF) Ry(-sg HipA) Rz(sg HipT)
      const e4 = xyz(mm(tr(Rpel), t.th), prevHip[side]);
      prevHip[side] = e4;
      const HF = lim(side + 'HipF', e4.f), HA = lim(side + 'HipA', -sg * e4.b), HT = lim(side + 'HipT', sg * e4.t);
      p[CH[side + 'HipF']] = HF; p[CH[side + 'HipA']] = HA; p[CH[side + 'HipT']] = HT;
      const Rth = mm(mm(mm(Rpel, Rx(HF)), Ry(-sg * HA)), Rz(sg * HT));
      // knee Rx(-K), ankle Rx(Ank), toes Rx(Toe)
      const K = lim(side + 'Knee', -xOnly(mm(tr(Rth), t.sh)));
      p[CH[side + 'Knee']] = K;
      const Rsh = mm(Rth, Rx(-K));
      const An = lim(side + 'Ank', xOnly(mm(tr(Rsh), t.ft)));
      p[CH[side + 'Ank']] = An;
      const Rft = mm(Rsh, Rx(An));
      p[CH[side + 'Toe']] = clamp(xOnly(mm(tr(Rft), t.toe)), -0.2, 1.2);
    }
    // root: the pelvis's sway about the ground point, in the heading's frame (feet), and its height (H fraction)
    const rx = raw[i].pel[0] - gx[i], ry = raw[i].pel[1] - gy[i];
    p[CH.rootX] = rx * Math.sin(phi) - ry * Math.cos(phi);
    p[CH.rootY] = rx * Math.cos(phi) + ry * Math.sin(phi);
    p[CH.rootZ] = (raw[i].pel[2] - dims.hipH) / H;
    out.push(p);
  }

  // ---------------- channels unwrapped and smoothed, sampled at the output rate
  const fps = opt.fps || 30, step = fps0 / fps, n = Math.max(2, Math.floor((NF - 1) / step) + 1);
  const ANG = (k) => !RG.LINEAR[k];
  const names = Object.keys(CH).sort((a, b) => CH[a] - CH[b]);
  const sig = 0.5 * step;
  const series = names.map((k) => {
    const c = CH[k];
    let s = out.map(p => p[c]);
    if (ANG(k)) { const u = [s[0]]; for (let i = 1; i < s.length; i++) u.push(u[i - 1] + wrap(s[i] - s[i - 1])); s = u; }
    return gauss(s, sig);
  });
  const hdS = gauss(heading, sig), gxS = gauss(gx, sig), gyS = gauss(gy, sig);
  const frames = [], track = { x: [], y: [], yaw: [] };
  for (let i = 0; i < n; i++) {
    const at = i * step, a = Math.floor(at), b = Math.min(NF - 1, a + 1), u = at - a;
    const lerp = (arr) => arr[a] + (arr[b] - arr[a]) * u;
    frames.push(series.map(lerp));
    track.x.push((lerp(gxS) - gxS[0]) / H); track.y.push((lerp(gyS) - gyS[0]) / H); track.yaw.push(lerp(hdS) - hdS[0]);
  }
  // ---------------- the feet: put on the floor where the take's are, and their contacts
  const feet = footPass(M, dims, names, frames, track, hdS[0], fps, gxS[0], gyS[0]);
  for (const fr of frames) fr[CH.rootZ] += feet.dz / H;
  return {
    fps, n, H: look.height, ch: names, frames, track, yaw0: hdS[0], contacts: feet.contacts,
    stats: { scale: S, legTake: legM, from: f0 / fps0, to: f1 / fps0, footDz: feet.dz, floorMiss: feet.miss },
    restPose: Array.from(restPose),
  };
}

/** the take's elbow and knee hinges, each in its upper arm's / thigh's rest frame (our axes), from the frames where
 *  they are bent past 35 deg: the bend's normal (upper bone x lower bone) carried back to rest by the upper bone's
 *  rotation; null where the take never bends it enough to tell */
function hingeAxes(bvh, map, AX) {
  const jn = {}; bvh.joints.forEach((j, i) => { jn[j.name] = i; });
  const out = { l: {}, r: {} };
  const acc = {};
  for (let f = 0; f < bvh.nFrames; f += Math.max(1, Math.round(bvh.nFrames / 400))) {
    const w = B.world(bvh, f);
    const P = (n) => { const i = jn[n] * 3; return [w.pos[i], w.pos[i + 1], w.pos[i + 2]]; };
    for (const s of ['l', 'r']) {
      const m = map[s];
      for (const [k, a, b, c] of [['elbow', m.shoulder, m.elbow, m.wrist], ['knee', m.hip, m.knee, m.ankle]]) {
        const u = nrm(sub(P(b), P(a))), v = nrm(sub(P(c), P(b)));
        if (Math.acos(clamp(dot(u, v), -1, 1)) < 35 * Math.PI / 180) continue;
        const i = jn[a] * 9, R = w.R.subarray(i, i + 9);
        const n = nrm(cross(u, v)), h = [R[0] * n[0] + R[3] * n[1] + R[6] * n[2], R[1] * n[0] + R[4] * n[1] + R[7] * n[2], R[2] * n[0] + R[5] * n[1] + R[8] * n[2]];
        const key = s + k; acc[key] = acc[key] || { v: [0, 0, 0], n: 0 };
        acc[key].v = addv(acc[key].v, h); acc[key].n++;
      }
    }
  }
  for (const s of ['l', 'r']) for (const k of ['elbow', 'knee']) { const a = acc[s + k]; out[s][k] = a && a.n >= 5 ? mv(AX, nrm(a.v)) : null; }
  return out;
}

/** Gaussian smoothing (sigma in samples), edges held */
function gauss(a, sigma) {
  if (!(sigma > 0.3)) return a.slice();
  const r = Math.ceil(sigma * 3), w = [];
  for (let k = -r; k <= r; k++) w.push(Math.exp(-k * k / (2 * sigma * sigma)));
  const n = a.length, o = new Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0, ws = 0;
    for (let k = -r; k <= r; k++) { const j = clamp(i + k, 0, n - 1); s += a[j] * w[k + r]; ws += w[k + r]; }
    o[i] = s / ws;
  }
  return o;
}

/** solve the clip's frames on our rig: how far the feet are off the floor (moves the whole clip so the planted feet
 *  are on it, the median of the contact frames) and which frames each foot is planted in (low and still) */
function footPass(M, dims, names, frames, track, yaw0, fps, x0, y0) {
  const RG = M.Rig, CH = RG.CH, H = dims.H, sk = new RG.Skeleton(dims);
  sk.dt = 0;
  const pose = new Float32Array(RG.NCH), low = { l: [], r: [] }, pos = { l: [], r: [] };
  for (let i = 0; i < frames.length; i++) {
    for (let k = 0; k < names.length; k++) pose[CH[names[k]]] = frames[i][k];
    sk.solve(pose, track.x[i] * H, track.y[i] * H, yaw0 + track.yaw[i]);
    for (const s of ['l', 'r']) {
      const pts = s === 'l' ? [RG.J.L_HEEL, RG.J.L_BALL, RG.J.L_TOE] : [RG.J.R_HEEL, RG.J.R_BALL, RG.J.R_TOE];
      let z = Infinity, bx = 0, by = 0;
      for (const j of pts) { if (sk.P[j * 3 + 2] < z) z = sk.P[j * 3 + 2]; }
      const jb = s === 'l' ? RG.J.L_BALL : RG.J.R_BALL; bx = sk.P[jb * 3]; by = sk.P[jb * 3 + 1];
      low[s].push(z); pos[s].push([bx, by]);
    }
  }
  // a foot is down when it is near its lowest and still (its ball moving under ~1.2 ft/s over ~0.1 s)
  const contacts = {}, all = [];
  const q = (arr, f) => { const s = arr.slice().sort((a, b) => a - b); return s[Math.floor(f * (s.length - 1))]; };
  for (const s of ['l', 'r']) {
    const z0 = q(low[s], 0.05), on = [];
    for (let i = 0; i < frames.length; i++) {
      const a = Math.max(0, i - 2), b = Math.min(frames.length - 1, i + 2);
      const v = Math.hypot(pos[s][b][0] - pos[s][a][0], pos[s][b][1] - pos[s][a][1]) / ((b - a) / fps);
      on.push(low[s][i] - z0 < 0.03 * H && v < 1.2);
    }
    // (gaps under 0.07 s filled, contacts under 0.07 s dropped)
    const g = Math.round(0.07 * fps);
    const runs = [];
    for (let i = 0; i < on.length;) { if (!on[i]) { i++; continue; } let j = i; while (j + 1 < on.length && on[j + 1]) j++; runs.push([i, j]); i = j + 1; }
    const merged = [];
    for (const r of runs) { const l = merged[merged.length - 1]; if (l && r[0] - l[1] - 1 <= g) l[1] = r[1]; else merged.push(r.slice()); }
    contacts[s] = merged.filter(r => r[1] - r[0] + 1 >= g);
    for (const r of contacts[s]) for (let i = r[0]; i <= r[1]; i++) all.push(low[s][i]);
  }
  const dz = all.length ? -q(all, 0.5) : -Math.min(q(low.l, 0.05), q(low.r, 0.05));
  const miss = all.length ? q(all.map(z => Math.abs(z + dz)), 0.9) : 0;
  return { dz, contacts, miss };
}

module.exports = { retarget, loadRig, gauss };

if (require.main === module) {
  const args = process.argv.slice(2);
  const get = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
  const file = args[0];
  const bvh = B.parse(fs.readFileSync(file, 'utf8'));
  const clip = retarget(bvh, { map: get('map', 'cmu'), from: get('from') != null ? +get('from') : 0, to: get('to') != null ? +get('to') : null, fps: +get('fps', 30) });
  clip.name = get('name', path.basename(file, '.bvh'));
  const outF = get('out');
  if (outF) fs.writeFileSync(outF, JSON.stringify(clip));
  console.log(JSON.stringify({ name: clip.name, n: clip.n, fps: clip.fps, stats: clip.stats, contacts: clip.contacts }));
}
