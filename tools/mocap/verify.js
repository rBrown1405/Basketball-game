// How close a retarget is to its take: per bone, the angle between our solved bone and the take's, over every frame.
//   node tools/mocap/verify.js <take.bvh> [map (cmu)] [from s] [--frames bone,bone]  (bones: lUA lFA rUA rFA lTH lSH rTH rSH)
'use strict';
const fs = require('fs');
const B = require('./bvh'), MAPS = require('./maps');
const { retarget, loadRig } = require('./retarget');

const args = process.argv.slice(2);
const file = args[0], mapName = args[1] || 'cmu', from = +(args[2] || 0);
const M = loadRig(), RG = M.Rig, CH = RG.CH, J = RG.J;
const bvh = B.parse(fs.readFileSync(file, 'utf8'));
const clip = retarget(bvh, { M, map: mapName, from, fps: 30 });
const map = MAPS[mapName];
const jn = {}; bvh.joints.forEach((j, i) => { jn[j.name] = i; });
// (the take's axes to ours, as the retarget read them: Y-up files turn their -Z into our +y)
const rest = B.rest(bvh), ri = (n) => jn[n] * 3;
const vert = [0, 1, 2].map(k => rest[ri(map.head[0]) + k] - rest[ri(map.l.ankle) + k]);
const AX = Math.abs(vert[1]) >= Math.abs(vert[2]) ? [1, 0, 0, 0, 0, -1, 0, 1, 0] : [1, 0, 0, 0, 1, 0, 0, 0, 1];
const mv = (A, v) => [A[0] * v[0] + A[1] * v[1] + A[2] * v[2], A[3] * v[0] + A[4] * v[1] + A[5] * v[2], A[6] * v[0] + A[7] * v[1] + A[8] * v[2]];
const dims = RG.makeDims({ height: 78, weight: 215, gender: 'm' }), H = dims.H, sk = new RG.Skeleton(dims);
sk.dt = 0;
const pose = new Float32Array(RG.NCH);
const fps0 = 1 / bvh.dt, step = fps0 / clip.fps, f0 = Math.round(clip.stats.from * fps0);
const bones = {
  lUA: [J.L_SH, J.L_EL, 'l', 'shoulder', 'elbow'], lFA: [J.L_EL, J.L_WR, 'l', 'elbow', 'wrist'], rUA: [J.R_SH, J.R_EL, 'r', 'shoulder', 'elbow'], rFA: [J.R_EL, J.R_WR, 'r', 'elbow', 'wrist'],
  lTH: [J.L_HIP, J.L_KN, 'l', 'hip', 'knee'], lSH: [J.L_KN, J.L_AN, 'l', 'knee', 'ankle'], rTH: [J.R_HIP, J.R_KN, 'r', 'hip', 'knee'], rSH: [J.R_KN, J.R_AN, 'r', 'knee', 'ankle'],
};
const err = {};
for (const k in bones) err[k] = [];
for (let i = 0; i < clip.n; i++) {
  for (let k = 0; k < clip.ch.length; k++) pose[CH[clip.ch[k]]] = clip.frames[i][k];
  sk.solve(pose, clip.track.x[i] * H, clip.track.y[i] * H, clip.yaw0 + clip.track.yaw[i]);
  const w = B.world(bvh, Math.min(bvh.nFrames - 1, f0 + Math.round(i * step)));
  const P = (n) => { const j = jn[n] * 3; return mv(AX, [w.pos[j], w.pos[j + 1], w.pos[j + 2]]); };
  for (const k in bones) {
    const [a, b, s, ma, mb] = bones[k];
    const o = [0, 1, 2].map(q => sk.P[b * 3 + q] - sk.P[a * 3 + q]);
    const pa = P(map[s][ma]), pb = P(map[s][mb]), t = [0, 1, 2].map(q => pb[q] - pa[q]);
    const c = (o[0] * t[0] + o[1] * t[1] + o[2] * t[2]) / (Math.hypot(...o) * Math.hypot(...t));
    err[k].push(Math.acos(Math.max(-1, Math.min(1, c))) * 180 / Math.PI);
  }
}
const q = (a, f) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(f * (s.length - 1))]; };
for (const k in err) console.log(k.padEnd(4), 'median', q(err[k], 0.5).toFixed(1), 'p90', q(err[k], 0.9).toFixed(1), 'max', Math.max(...err[k]).toFixed(1), 'deg');
const fi = args.indexOf('--frames');
if (fi >= 0) for (const k of args[fi + 1].split(',')) console.log(k, err[k].map((e, i) => (e > 3 ? i + ':' + e.toFixed(0) : null)).filter(Boolean).join(' '));
