/* Pro BBALL Coach — MakeHuman converter, part 2: rig fit, finger layout, clothing regions, UV face masks, packing. */
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib'), vm = require('vm');
const X = require('./build.js');
const { NP, NR, posList, rvPos, rvUV, tris, JKEYS, COMBOS, GENDERS, FACE, faceT, genderT, comboT } = X;

// ---------------------------------------------------------------- the game's rig, loaded as in the browser
const ctx = { window: { PBC: {}, devicePixelRatio: 1 }, console, performance: { now: () => Date.now() } };
vm.createContext(ctx);
for (const f of ['util.js', 'rig.js']) vm.runInContext(fs.readFileSync(path.join(X.ROOT, 'js', 'match', f), 'utf8'), ctx, { filename: f });
const RG = ctx.window.PBC.Match.Rig, J = RG.J, F = RG.F, U = ctx.window.PBC.Match.U;

const ji = k => JKEYS.indexOf(k);
const jp = (Jt, k) => { const i = ji(k); if (i < 0) throw new Error('no joint ' + k); return [Jt[i * 3], Jt[i * 3 + 1], Jt[i * 3 + 2]]; };
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.sqrt(dot(a, a));
const nrm = a => mul(a, 1 / (len(a) || 1));
const col = (R, o, c) => [R[o + c], R[o + 3 + c], R[o + 6 + c]];

// ---------------------------------------------------------------- reference athlete (fit / regions)
const REF_COMBO = [0, 0.35, 0, 0, 0.65, 0]; // average weight, strong muscle
const refP = X.morph('male', REF_COMBO, null);
const refB = X.bodyRig(refP), refJ = X.jointsOf(refP);
const [zlo, zhi] = X.height(refB);
const dims = RG.makeDims({ height: 78, gender: 'm', weight: 215, look: { build: 0.6 } });
const H = dims.H, s0 = H / (zhi - zlo);
// aligned space: scaled to H, soles on the floor, hips centred on the rig's hips
const sk0 = new RG.Skeleton(dims);
sk0.solve(RG.pose({}), 0, 0, Math.PI / 2);
const rigHipMid = mul(add([sk0.P[J.L_HIP * 3], sk0.P[J.L_HIP * 3 + 1], sk0.P[J.L_HIP * 3 + 2]], [sk0.P[J.R_HIP * 3], sk0.P[J.R_HIP * 3 + 1], sk0.P[J.R_HIP * 3 + 2]]), 0.5);
function align(Jt) { // returns function mapping MH rig-axes feet -> aligned
  const hm = mul(add(jp(Jt, 'hipL'), jp(Jt, 'hipR')), 0.5);
  return p => { const q = mul(sub(p, [hm[0], hm[1], zlo]), s0); return [q[0] + rigHipMid[0], q[1] + rigHipMid[1], q[2] + 0]; };
}
const A = align(refJ);
const AJ = k => A(jp(refJ, k));
console.log('ref height', (zhi - zlo).toFixed(3), 'ft; scale', s0.toFixed(4), '; aligned MH shoulder', AJ('shL').map(v => (v / H).toFixed(3)), 'rig shoulder (x,y,z)/H', [J.L_SH].map(j => [sk0.P[j * 3] / H, sk0.P[j * 3 + 1] / H, sk0.P[j * 3 + 2] / H].map(v => v.toFixed(3))));
console.log('aligned MH hip', AJ('hipL').map(v => (v / H).toFixed(3)), 'rig hip', [sk0.P[J.L_HIP * 3] / H, sk0.P[J.L_HIP * 3 + 1] / H, sk0.P[J.L_HIP * 3 + 2] / H].map(v => v.toFixed(3)));

// ---------------------------------------------------------------- fit the bind pose (left side, mirrored)
function palmNormal(side) {
  const s = side ? 'R' : 'L';
  const w = AJ('wr' + s), i = AJ('f21' + s), p = AJ('f51' + s), t = AJ('f12' + s), mid = AJ('f31' + s), tip = AJ('f3t' + s);
  let n = nrm(cross(sub(i, w), sub(p, w)));
  // palm side: where the fingers curl and the thumb sits
  const d = nrm(sub(mid, w));
  const curl = sub(sub(tip, mid), mul(d, dot(sub(tip, mid), d)));
  if (dot(n, curl) + 0.5 * dot(n, sub(t, w)) < 0) n = mul(n, -1);
  return n;
}
function armError(pose, side) {
  const s = side ? 'R' : 'L';
  const sk = new RG.Skeleton(dims);
  sk.solve(pose, 0, 0, Math.PI / 2);
  const jS = side ? J.R_SH : J.L_SH, jE = side ? J.R_EL : J.L_EL, jW = side ? J.R_WR : J.L_WR, fH = side ? F.R_HD : F.L_HD;
  const P = sk.P, R = sk.R;
  const pS = [P[jS * 3], P[jS * 3 + 1], P[jS * 3 + 2]], pE = [P[jE * 3], P[jE * 3 + 1], P[jE * 3 + 2]], pW = [P[jW * 3], P[jW * 3 + 1], P[jW * 3 + 2]];
  const ua = nrm(sub(pE, pS)), fa = nrm(sub(pW, pE));
  const hd = mul(col(R, fH * 9, 2), -1), palm = col(R, fH * 9, 1);
  const tUA = nrm(sub(AJ('el' + s), pS)), tFA = nrm(sub(AJ('wr' + s), AJ('el' + s))), tHD = nrm(sub(AJ('f31' + s), AJ('wr' + s))), tPalm = palmNormal(side);
  return (1 - dot(ua, tUA)) * 3 + (1 - dot(fa, tFA)) * 2 + (1 - dot(hd, tHD)) + 0.6 * (1 - dot(palm, tPalm));
}
function legError(pose, side) {
  const s = side ? 'R' : 'L';
  const sk = new RG.Skeleton(dims);
  sk.solve(pose, 0, 0, Math.PI / 2);
  const jH = side ? J.R_HIP : J.L_HIP, jK = side ? J.R_KN : J.L_KN, jA = side ? J.R_AN : J.L_AN, jB = side ? J.R_BALL : J.L_BALL;
  const P = sk.P;
  const p = j => [P[j * 3], P[j * 3 + 1], P[j * 3 + 2]];
  const th = nrm(sub(p(jK), p(jH))), sh = nrm(sub(p(jA), p(jK))), ft = nrm(sub(p(jB), p(jA)));
  const tTH = nrm(sub(AJ('knee' + s), p(jH))), tSH = nrm(sub(AJ('ankle' + s), AJ('knee' + s))), tFT = nrm(sub(AJ('ball' + s), AJ('ankle' + s)));
  return (1 - dot(th, tTH)) * 3 + (1 - dot(sh, tSH)) * 2 + (1 - dot(ft, tFT));
}
function fit(keys, err, init) {
  const cur = Object.assign({}, init);
  const mk = () => RG.pose({ both: cur });
  let best = err(mk());
  for (const step of [16, 8, 4, 2, 1, 0.5, 0.25, 0.1, 0.05]) {
    for (let pass = 0; pass < 6; pass++) {
      let improved = false;
      for (const k of keys) for (const d of [-step, step]) {
        const old = cur[k]; cur[k] = old + d;
        const e = err(mk());
        if (e < best - 1e-9) { best = e; improved = true; } else cur[k] = old;
      }
      if (!improved) break;
    }
  }
  return { pose: cur, err: best };
}
const armFit = fit(['ShF', 'ShA', 'ShT', 'ElF', 'Pro', 'WrF', 'WrD'], p => armError(p, 0) + armError(p, 1), { ShF: 0, ShA: 35, ShT: 0, ElF: 30, Pro: 60, WrF: 0, WrD: 0 });
const legFit = fit(['HipF', 'HipA', 'HipT', 'Knee', 'Ank'], p => legError(p, 0) + legError(p, 1), { HipF: 0, HipA: 6, HipT: 0, Knee: 2, Ank: 0 });
const bindBoth = Object.assign({ Fing: 0.25, Toe: 0 }, armFit.pose, legFit.pose);
for (const k in bindBoth) bindBoth[k] = Math.round(bindBoth[k] * 100) / 100;
console.log('fitted bind pose', JSON.stringify(bindBoth), 'arm err', armFit.err.toFixed(5), 'leg err', legFit.err.toFixed(5));

// ---------------------------------------------------------------- finger layout (hand-local, units of hand length)
const skB = new RG.Skeleton(dims);
skB.solve(RG.pose({ both: bindBoth }), 0, 0, Math.PI / 2);
const fingers = [];
for (const side of [0]) {
  const s = side ? 'R' : 'L', fH = side ? F.R_HD : F.L_HD;
  const Rh = skB.R.slice(fH * 9, fH * 9 + 9);
  const w = AJ('wr' + s);
  // MakeHuman hand length: wrist -> middle fingertip
  const Lmh = len(sub(AJ('f3t' + s), w));
  const toLocal = p => { const d = sub(p, w); return [Rh[0] * d[0] + Rh[3] * d[1] + Rh[6] * d[2], Rh[1] * d[0] + Rh[4] * d[1] + Rh[7] * d[2], Rh[2] * d[0] + Rh[5] * d[1] + Rh[8] * d[2]].map(v => v / Lmh); };
  // our layout keys: index, middle, ring, pinky, thumb  (MakeHuman fingers 2,3,4,5,1)
  for (const f of [2, 3, 4, 5, 1]) {
    const a = toLocal(AJ('f' + f + (f === 1 ? '1' : '1') + s));
    const b = toLocal(AJ('f' + f + (f === 1 ? '2' : '2') + s));
    const c = toLocal(AJ('f' + f + 't' + s));
    // mirror to the right-hand convention (x toward the thumb for the right hand): left hand x is flipped
    const mx = p => [-p[0], p[1], p[2]];
    fingers.push([...mx(a), ...mx(b), ...mx(c)].map(v => Math.round(v * 10000) / 10000));
  }
  console.log('hand length MH', (Lmh / H).toFixed(4), 'H vs rig', (dims.hand / H).toFixed(4));
}
console.log('fingers (a, b, tip) hand-local, right-hand x:', JSON.stringify(fingers));

module.exports = { RG, U, dims, H, s0, align, A, AJ, refB, refJ, zlo, zhi, bindBoth, fingers, sub, add, mul, dot, cross, len, nrm };
if (require.main === module || (process.argv[1] || '').endsWith('build.js')) require('./build3.js');
