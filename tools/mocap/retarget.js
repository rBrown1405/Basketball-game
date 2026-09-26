/* Pro BBALL Coach — motion capture -> rig clip retargeting.
 * Turns a BVH take (CMU Graphics Lab Motion Capture Database, Bruce Hahne's MotionBuilder-friendly BVH release)
 * into a clip for js/match/anims.js: joint angles in the rig's anatomical channels, root motion, a facing track and
 * scripted footsteps taken from the feet's real contacts.
 *
 *   node tools/mocap/retarget.js tools/mocap/clips.json [bvh dir]   -> writes js/match/clips_mocap.js
 *   (takes missing from the directory, tools/mocap/cache by default, are fetched from a public BVH mirror)
 *
 * How the angles are found (rig conventions in js/match/rig.js):
 *  - pelvis, spine, chest, neck and head: the BVH joint's world rotation relative to the T-pose of frame 0 (the take
 *    faces +Z there, upright, so its rest frame is the rig's rest frame), split into the rig's twist / flexion /
 *    lateral Euler order relative to the parent segment;
 *  - arms and legs: from bone directions (shoulder->elbow->wrist, hip->knee->ankle->ball of the foot), solved
 *    analytically for flexion, abduction, twist and the elbow / knee angle, so the different proportions of the
 *    captured person do not matter;
 *  - the facing is the pelvis heading (smoothed), the root the pelvis's ground point; the feet's contacts (low
 *    and still) become planted phases and the swings between them scripted steps, so the rig's foot IK keeps
 *    planted feet from sliding. */
'use strict';
const fs = require('fs'), path = require('path');
const B = require('./bvh.js');

// ------------------------------------------------------------ rig (browser modules in a window shim)
function loadRig() {
  if (!global.window) global.window = global;
  const root = path.join(__dirname, '..', '..', 'js', 'match');
  require(path.join(root, 'util.js'));
  require(path.join(root, 'rig.js'));
  return window.PBC.Match;
}

// ------------------------------------------------------------ small math (row-major 3x3)
const T = (A) => [A[0], A[3], A[6], A[1], A[4], A[7], A[2], A[5], A[8]];
const mul = B.mul, apply = B.apply;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const nrm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const rx = (a) => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; };
const ry = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; };
const rz = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1]; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const DEG = 180 / Math.PI;
// BVH (x = the subject's left, y up, z forward) -> rig (x right, y forward, z up)
const MX = [-1, 0, 0, 0, 0, 1, 0, 1, 0];
const toRig = (v) => [-v[0], v[2], v[1]];
/** Q = Rz(a) Rx(b) Ry(c) -> [a, b, c] */
function eulerZXY(Q) {
  const b = Math.asin(clamp(Q[7], -1, 1));
  const a = Math.atan2(-Q[1], Q[4]);
  const c = Math.atan2(-Q[6], Q[8]);
  return [a, b, c];
}
/** body frame for facing phi (columns: right, forward, up) */
const bodyFrame = (phi) => { const c = Math.cos(phi), s = Math.sin(phi); return [s, c, 0, -c, s, 0, 0, 0, 1]; };
function unwrap(arr) { for (let i = 1; i < arr.length; i++) { while (arr[i] - arr[i - 1] > Math.PI) arr[i] -= 2 * Math.PI; while (arr[i] - arr[i - 1] < -Math.PI) arr[i] += 2 * Math.PI; } return arr; }
function gauss(arr, sigma) {
  if (sigma <= 0) return arr.slice();
  const r = Math.ceil(sigma * 3), w = [];
  for (let k = -r; k <= r; k++) w.push(Math.exp(-(k * k) / (2 * sigma * sigma)));
  return arr.map((_, i) => { let s = 0, sw = 0; for (let k = -r; k <= r; k++) { const j = clamp(i + k, 0, arr.length - 1); s += arr[j] * w[k + r]; sw += w[k + r]; } return s / sw; });
}

// ------------------------------------------------------------ retarget one take
function retarget(bvh, o) {
  const M = loadRig(), RG = M.Rig, CH = RG.CH;
  const ix = bvh.index;
  const need = ['Hips', 'Spine', 'Spine1', 'Neck1', 'Head', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand',
    'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase'];
  for (const n of need) if (ix[n] == null) throw new Error('BVH lacks joint ' + n);
  const ft = bvh.frameTime, f0 = o.f0, f1 = Math.min(o.f1, bvh.frames - 1);
  const Hn = o.H || 6.5; // nominal player height (ft) for root motion and step targets
  // rest (T-pose, frame 0): world rotations and the leg length that sets the scale
  const rest = B.pose(bvh, 0);
  const legLen = Math.hypot(...sub(rest.P[ix.LeftUpLeg], rest.P[ix.LeftLeg])) + Math.hypot(...sub(rest.P[ix.LeftLeg], rest.P[ix.LeftFoot]));
  const k = 0.491 / legLen; // H-fractions per BVH unit (the rig's hip joint -> ankle is 0.491 H)
  // standing pelvis height: the T-pose's hips above its toes, set on the take's floor (the lowest the toes get; the
  // added T-pose frame is not always standing on the floor)
  const restToeZ = Math.min(toRig(rest.P[ix.LeftToeBase])[2], toRig(rest.P[ix.RightToeBase])[2]);
  let floorToe = Infinity;
  for (let f = o.f0; f <= Math.min(o.f1, bvh.frames - 1); f += 2) { const q = B.pose(bvh, f); floorToe = Math.min(floorToe, toRig(q.P[ix.LeftToeBase])[2], toRig(q.P[ix.RightToeBase])[2]); }
  const hipsRestZ = (toRig(rest.P[ix.Hips])[2] - restToeZ + floorToe) * k;
  const Rrest = {};
  for (const n of ['Hips', 'Spine', 'Spine1', 'Neck1', 'Head']) Rrest[n] = rest.R[ix[n]];
  const delta = (pz, n) => mul(mul(MX, mul(pz.R[ix[n]], T(Rrest[n]))), T(MX)); // world rotation since the T-pose, rig axes
  // ankle angle of a flat foot under a vertical shin (T-pose) for each side
  const ankRest = [0, 0];
  for (let side = 0; side < 2; side++) {
    const pre = side ? 'Right' : 'Left';
    const a = toRig(rest.P[ix[pre + 'Foot']]), b = toRig(rest.P[ix[pre + 'ToeBase']]);
    const d = nrm(sub(b, a));
    ankRest[side] = Math.atan2(d[2], Math.hypot(d[0], d[1]));
  }

  const N = f1 - f0 + 1;
  const frames = [];
  for (let f = f0; f <= f1; f++) {
    const pz = B.pose(bvh, f);
    const P = {};
    for (const n of need) P[n] = toRig(pz.P[ix[n]]).map((v) => v * k);
    frames.push({ pz, P, Rp: delta(pz, 'Hips'), Rs: delta(pz, 'Spine'), Rc: delta(pz, 'Spine1'), Rn: delta(pz, 'Neck1'), Rh: delta(pz, 'Head') });
  }
  // facing: pelvis heading, unwrapped and smoothed (~40 ms)
  let phi = unwrap(frames.map((fr) => Math.atan2(fr.Rp[4], fr.Rp[1])));
  phi = gauss(phi, (o.facingSmooth || 0.04) / ft);
  // root: pelvis ground point relative to the first frame, in the first frame's facing (feet at the nominal height)
  const h0 = frames[0].P.Hips, c0 = Math.cos(phi[0]), s0 = Math.sin(phi[0]);
  const fwdOf = (p) => ((p[0] - h0[0]) * c0 + (p[1] - h0[1]) * s0) * Hn;
  const latOf = (p) => ((p[0] - h0[0]) * s0 - (p[1] - h0[1]) * c0) * Hn;
  const rootF = gauss(frames.map((fr) => fwdOf(fr.P.Hips)), 0.03 / ft), rootL = gauss(frames.map((fr) => latOf(fr.P.Hips)), 0.03 / ft);

  // joint angles per frame
  const out = [];
  const prevT = { l: 0, r: 0, hl: 0, hr: 0 };
  const lim = { violations: {} };
  for (let i = 0; i < N; i++) {
    const fr = frames[i], p = new Float64Array(RG.NCH);
    const Bf = bodyFrame(phi[i]);
    const Rp = fr.Rp;
    let e = eulerZXY(mul(T(Bf), Rp));
    p[CH.pelTwist] = e[0]; p[CH.pelPitch] = -e[1]; p[CH.pelRoll] = e[2];
    e = eulerZXY(mul(T(Rp), fr.Rs)); p[CH.spTwist] = e[0]; p[CH.spFlex] = -e[1]; p[CH.spLat] = e[2];
    e = eulerZXY(mul(T(fr.Rs), fr.Rc)); p[CH.chTwist] = e[0]; p[CH.chFlex] = -e[1]; p[CH.chLat] = e[2];
    e = eulerZXY(mul(T(fr.Rc), fr.Rn)); p[CH.nkTwist] = e[0]; p[CH.nkFlex] = -e[1]; p[CH.nkLat] = e[2];
    e = eulerZXY(mul(T(fr.Rn), fr.Rh)); p[CH.hdTwist] = e[0]; p[CH.hdFlex] = -e[1]; p[CH.hdLat] = e[2];
    p[CH.rootZ] = fr.P.Hips[2] - hipsRestZ;
    // arms: shoulder flexion / abduction from the upper arm's direction in the chest frame, the elbow and the
    // humeral twist from the forearm's direction
    for (let side = 0; side < 2; side++) {
      const sg = side ? 1 : -1, pre = side ? 'r' : 'l', bn = side ? 'Right' : 'Left';
      const S = fr.P[bn + 'Arm'], E = fr.P[bn + 'ForeArm'], W = fr.P[bn + 'Hand'];
      const du = apply(T(fr.Rc), nrm(sub(E, S)));
      const b = Math.asin(clamp(-du[0], -1, 1)), F = Math.atan2(du[1], -du[2]);
      const R0 = mul(mul(fr.Rc, rx(F)), ry(b));
      const f0v = apply(T(R0), nrm(sub(W, E)));
      const El = Math.acos(clamp(-f0v[2], -1, 1));
      let tw = prevT[pre];
      if (Math.sin(El) > 0.12) tw = sg * Math.atan2(-f0v[0], f0v[1]);
      prevT[pre] = tw;
      p[CH[pre + 'ShF']] = F; p[CH[pre + 'ShA']] = -sg * b; p[CH[pre + 'ShT']] = tw; p[CH[pre + 'ElF']] = El;
      p[CH[pre + 'Pro']] = (o.pro != null ? o.pro : 45) / DEG; p[CH[pre + 'WrF']] = 0; p[CH[pre + 'WrD']] = 0; p[CH[pre + 'Fing']] = 0.1;
    }
    // legs: hip angles from the thigh in the pelvis frame, knee and hip twist from the shin, ankle from the foot
    for (let side = 0; side < 2; side++) {
      const sg = side ? 1 : -1, pre = side ? 'r' : 'l', bn = side ? 'Right' : 'Left';
      const Hp = fr.P[bn + 'UpLeg'], K = fr.P[bn + 'Leg'], A = fr.P[bn + 'Foot'], Tb = fr.P[bn + 'ToeBase'];
      // (the rig's pelvis frame is the body frame turned by the pelvis channels)
      const Rpel = mul(mul(mul(Bf, rz(p[CH.pelTwist])), rx(-p[CH.pelPitch])), ry(p[CH.pelRoll]));
      const dt = apply(T(Rpel), nrm(sub(K, Hp)));
      const b = Math.asin(clamp(-dt[0], -1, 1)), F = Math.atan2(dt[1], -dt[2]);
      const R0 = mul(mul(Rpel, rx(F)), ry(b));
      const s0v = apply(T(R0), nrm(sub(A, K)));
      const Kn = Math.acos(clamp(-s0v[2], -1, 1));
      let tw = prevT['h' + pre];
      if (Math.sin(Kn) > 0.1) tw = sg * Math.atan2(s0v[0], -s0v[1]);
      prevT['h' + pre] = tw;
      const Rsh = mul(mul(R0, rz(sg * tw)), rx(-Kn));
      const fsv = apply(T(Rsh), nrm(sub(Tb, A)));
      const ank = Math.atan2(fsv[2], fsv[1]) - ankRest[side];
      p[CH[pre + 'HipF']] = F; p[CH[pre + 'HipA']] = -sg * b; p[CH[pre + 'HipT']] = tw; p[CH[pre + 'Knee']] = Kn; p[CH[pre + 'Ank']] = ank; p[CH[pre + 'Toe']] = 0;
    }
    out.push(p);
  }
  // continuous angles (no 360 degree wraps between frames), then light smoothing of the capture noise
  const angCh = Object.keys(CH).filter((kk) => !RG.LINEAR[kk]).map((kk) => CH[kk]);
  for (const c of angCh) {
    const s = unwrap(out.map((p) => p[c]));
    const sm = gauss(s, (o.smooth || 0.012) / ft);
    for (let i = 0; i < N; i++) out[i][c] = sm[i];
  }
  // joint limits: report how far the capture goes past the rig's ranges, then store it clamped (the game clamps
  // anyway; the stored keys stay inside the ranges the rig and its checks expect)
  const tmp = new Float32Array(RG.NCH);
  for (let i = 0; i < N; i++) {
    tmp.set(out[i]); RG.limitPose(tmp);
    for (const kk in CH) { const c = CH[kk], d = Math.abs(tmp[c] - out[i][c]) * (RG.LINEAR[kk] ? 1 : DEG); if (d > 2) lim.violations[kk] = Math.max(lim.violations[kk] || 0, +d.toFixed(1)); }
    for (let c = 0; c < RG.NCH; c++) out[i][c] = tmp[c];
  }

  // ---------------------------------------------------------- feet: contacts and steps
  const footOf = (fr, side) => { const bn = side ? 'Right' : 'Left'; return { a: fr.P[bn + 'Foot'], b: fr.P[bn + 'ToeBase'] }; };
  const floor = [0, 1].map((side) => Math.min(...frames.map((fr) => { const q = footOf(fr, side); return Math.min(q.b[2], q.a[2] - 0.035); })));
  const contacts = [0, 1].map((side) => frames.map((fr, i) => {
    const q = footOf(fr, side), h = Math.min(q.b[2], q.a[2] - 0.035) - floor[side];
    const j = Math.min(N - 1, i + 1), jm = Math.max(0, i - 1), qa = footOf(frames[j], side).b, qb = footOf(frames[jm], side).b;
    const sp = Math.hypot(qa[0] - qb[0], qa[1] - qb[1]) * Hn / ((j - jm) * ft || ft);
    return h < (o.contactH || 0.03) && sp < (o.contactV || 2.2);
  }));
  // clean-up: fill short gaps, drop short contacts
  for (const cc of contacts) {
    const run = (val, minLen) => { let i = 0; while (i < N) { if (cc[i] === val) { let j = i; while (j < N && cc[j] === val) j++; if (j - i < minLen && i > 0 && j < N) for (let q = i; q < j; q++) cc[q] = !val; i = j; } else i++; } };
    run(false, Math.round(0.05 / ft)); run(true, Math.round(0.06 / ft));
  }
  const steps = [], airKeys = [];
  const tOf = (i) => +(i * ft).toFixed(3);
  for (let side = 0; side < 2; side++) {
    const cc = contacts[side];
    let i = 0;
    while (i < N) {
      if (!cc[i]) {
        let j = i; while (j < N && !cc[j]) j++;
        if (j < N) { // (a swing already under way at the first frame still lands where the capture puts it)
          // landing spot: the ball of the foot a few frames into the contact, yaw of the foot there
          const m = Math.min(N - 1, j + Math.round(0.03 / ft)), q = footOf(frames[m], side);
          let lift = 0; for (let q2 = i; q2 < j; q2++) { const qq = footOf(frames[q2], side); lift = Math.max(lift, Math.min(qq.b[2], qq.a[2] - 0.035) - floor[side]); }
          const fy = Math.atan2(q.b[1] - q.a[1], q.b[0] - q.a[0]);
          let yaw = (fy - phi[0]) * DEG; while (yaw > 180) yaw -= 360; while (yaw < -180) yaw += 360;
          steps.push({ t0: tOf(i), t1: tOf(j), foot: side ? 'r' : 'l', to: [+fwdOf(q.b).toFixed(2), +latOf(q.b).toFixed(2)], yaw: +yaw.toFixed(0), lift: +clamp(lift, 0.02, 0.12).toFixed(3) });
        }
        i = j;
      } else i++;
    }
  }
  // pivots: a planted foot that turns (spins, reverse pivots) keeps the ball of the foot and swings the heel; the
  // rig's planted feet cannot turn, so each turn of more than ~20 degrees becomes zero-lift steps about the ball
  for (let side = 0; side < 2; side++) {
    const cc = contacts[side];
    let i = 0;
    while (i < N) {
      if (cc[i]) {
        let j = i; while (j < N && cc[j]) j++;
        const yawAt = (q) => { const f = footOf(frames[q], side); return Math.atan2(f.b[1] - f.a[1], f.b[0] - f.a[0]); };
        const ys = unwrap(Array.from({ length: j - i }, (_, q) => yawAt(i + q)));
        const total = ys[ys.length - 1] - ys[0];
        if (Math.abs(total) > 20 / DEG) {
          const nSeg = Math.ceil(Math.abs(total) / (55 / DEG));
          for (let sgi = 0; sgi < nSeg; sgi++) {
            const a0 = i + Math.round((j - 1 - i) * sgi / nSeg), a1 = i + Math.round((j - 1 - i) * (sgi + 1) / nSeg);
            if (a1 - a0 < 2) continue;
            const q = footOf(frames[a1], side);
            let yaw = (ys[a1 - i] - phi[0]) * DEG; while (yaw > 180) yaw -= 360; while (yaw < -180) yaw += 360;
            steps.push({ t0: tOf(a0), t1: tOf(a1), foot: side ? 'r' : 'l', to: [+fwdOf(q.b).toFixed(2), +latOf(q.b).toFixed(2)], yaw: +yaw.toFixed(0), lift: 0.004, pivot: 1 });
          }
        }
        i = j;
      } else i++;
    }
  }
  steps.sort((a, b) => a.t0 - b.t0);
  // (a flicker of a swing right at the start is only the take settling: the rig's feet start wherever they are and
  // its automatic stance correction covers the difference, a 30 ms step would snap the foot)
  for (let q = steps.length - 1; q >= 0; q--) if (steps[q].t1 - steps[q].t0 < 0.07 && !steps[q].pivot) steps.splice(q, 1);
  // both feet off the floor: airborne phases (the rig's feet leave the floor with the pelvis)
  let inAir = false;
  const feet = [[0, 'plant']];
  for (let i = 0; i < N; i++) {
    const air = !contacts[0][i] && !contacts[1][i] && Math.min(...[0, 1].map((side) => { const q = footOf(frames[i], side); return Math.min(q.b[2], q.a[2] - 0.035) - floor[side]; })) > 0.04;
    if (air !== inAir) { feet.push([tOf(i), air ? 'air' : 'plant']); inAir = air; }
  }

  // ---------------------------------------------------------- keys at the output rate
  const step = Math.max(1, Math.round(1 / (o.fps || 30) / ft));
  const keys = [];
  for (let i = 0; i < N; i += step) keys.push(i);
  if (keys[keys.length - 1] !== N - 1) keys.push(N - 1);
  const fmt = (v, d) => +v.toFixed(d);
  const def = {
    dur: tOf(N - 1),
    events: o.events || {},
    feet,
    steps,
    root: keys.map((i) => [tOf(i), fmt(rootF[i], 2), fmt(rootL[i], 2)]),
    yaw: keys.map((i) => [tOf(i), fmt((phi[i] - phi[0]) * DEG, 1)]),
    keys: keys.map((i) => {
      const pd = {};
      for (const kk in CH) { if (/^root[XY]$/.test(kk)) continue; const v = out[i][CH[kk]]; pd[kk] = RG.LINEAR[kk] ? fmt(v, 3) : fmt(v * DEG, 1); }
      return { t: tOf(i), p: pd };
    }),
  };
  return { def, report: { frames: N, dur: def.dur, scale: k, legLenBVH: legLen, steps: steps.length, feet, limits: lim.violations } };
}

module.exports = { retarget, loadRig };

// ------------------------------------------------------------ CLI
/** a take from the local cache, fetched from the public BVH mirror of the CMU database when missing */
async function loadTake(dir, file) {
  const p = path.join(dir, file);
  if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
  const subj = file.split('_')[0].padStart(3, '0');
  const url = `https://raw.githubusercontent.com/una-dinosauria/cmu-mocap/master/data/${subj}/${file}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`);
  const text = await res.text();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(p, text);
  return text;
}

if (require.main === module) (async () => {
  const spec = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const dir = process.argv[3] || path.join(__dirname, 'cache');
  const outs = [];
  for (const c of spec.clips) {
    const bvh = B.parse(await loadTake(dir, c.file));
    const { def, report } = retarget(bvh, c);
    console.log(c.name, JSON.stringify(report));
    outs.push(`  clip(${JSON.stringify(c.name)}, ${JSON.stringify(Object.assign({ src: c.file }, def))});`);
  }
  const js = `/* Pro BBALL Coach — match view: motion-captured clips (generated by tools/mocap/retarget.js; do not edit).
 * Retargeted from the CMU Graphics Lab Motion Capture Database (Bruce Hahne's BVH release). The data used in this
 * project was obtained from mocap.cs.cmu.edu. The database was created with funding from NSF EIA-0196217. */
(function () {
  'use strict';
  const M = window.PBC.Match, A = M.Anims;
  if (!A || !A.clip) return;
  const clip = A.clip;
${outs.join('\n')}
})();
`;
  const dst = spec.out || path.join(__dirname, '..', '..', 'js', 'match', 'clips_mocap.js');
  fs.writeFileSync(dst, js);
  console.log('wrote', dst, js.length, 'bytes');
})().catch((e) => { console.error(e); process.exit(1); });
