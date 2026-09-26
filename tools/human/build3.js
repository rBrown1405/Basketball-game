/* Pro BBALL Coach — MakeHuman converter, part 3: clothing regions, UV face masks, packing into js/match/human_data.js. */
'use strict';
const fs = require('fs'), zlib = require('zlib');
const X = require('./build.js');
const Y = require('./build2.js');
const { NP, NR, rvPos, rvUV, tris, JKEYS, COMBOS, GENDERS, FACE, faceT, genderT, comboT, posList } = X;
const { H, s0, A, AJ, refB, sub, dot, len, nrm } = Y;
const CMf = 0.0328084;

// ---------------------------------------------------------------- per-vertex regions (reference athlete, aligned)
const AP = new Float64Array(NP * 3);
for (let i = 0; i < NP; i++) { const q = A([refB[i * 3], refB[i * 3 + 1], refB[i * 3 + 2]]); AP[i * 3] = q[0]; AP[i * 3 + 1] = q[1]; AP[i * 3 + 2] = q[2]; }
const hipL = AJ('hipL'), hipR = AJ('hipR'), kneeL = AJ('kneeL'), kneeR = AJ('kneeR'), shL = AJ('shL');
const thAxis = [nrm(sub(kneeL, hipL)), nrm(sub(kneeR, hipR))];
const shX = Math.abs(shL[0]) / H;
function jerseyG(x, y, z) { // H units, >0 keeps
  const ax = Math.abs(x);
  const gNeck = 0.8125 - 0.39 * y + 6.5 * x * x - z;
  const ex = (ax - (shX + 0.024)) / 0.064, ez = (z - 0.783) / 0.09;
  const gArm = (Math.sqrt(ex * ex + ez * ez) - 1) * 0.05;
  const gHem = z - 0.572;
  return Math.min(gNeck, gArm, gHem);
}
function shortsG(p) { // p aligned feet; H units
  const z = p[2] / H;
  const gTop = 0.618 - z;
  const s = p[0] >= 0 ? 1 : 0;
  const hp = s ? hipR : hipL;
  const t = dot(sub(p, hp), thAxis[s]) / H;
  const gHem = 0.205 - t;
  return Math.min(gTop, gHem);
}
const gJ = new Int8Array(NP), gS = new Int8Array(NP);
// clothing only ever covers the trunk (jersey) or the hips and thighs (shorts): never the arms and hands that hang
// beside them in the rest pose
const PB = X.PB;
const TRUNK = new Set([PB.PEL, PB.SPN, PB.CHS, PB.NCK]), HIPS = new Set([PB.PEL, PB.SPN, PB.L_TH, PB.R_TH]);
function share(i, set) { let w = 0; for (let k = 0; k < 4; k++) if (set.has(X.WB[i * 4 + k])) w += X.WW[i * 4 + k]; return w / 255; }
const fJ = new Float64Array(NP), fS = new Float64Array(NP);
for (let i = 0; i < NP; i++) {
  const p = [AP[i * 3], AP[i * 3 + 1], AP[i * 3 + 2]];
  const tj = share(i, TRUNK), th = share(i, HIPS);
  let j = jerseyG(p[0] / H, p[1] / H, p[2] / H), sh = shortsG(p);
  // (only below the armpits, where the arms hang beside the torso: over the shoulders the skin leans on the arm
  // bones, and cutting there sliced the straps into points and roughened the arm holes)
  if (tj < 0.5 && p[2] / H < 0.745) j = Math.min(j, (tj - 0.5) * 0.08);
  if (th < 0.5) sh = Math.min(sh, (th - 0.5) * 0.08);
  fJ[i] = j; fS[i] = sh;
}
// make the outlines distances along the body surface (divide by the surface gradient), so a trim band of a given
// width is that wide everywhere (the raw fields made the neck trim hairline-thin and the arm hole trim fat)
function surfaceDistance(f) {
  const gx = new Float64Array(NP), gy = new Float64Array(NP), gz = new Float64Array(NP), wa = new Float64Array(NP);
  for (let t = 0; t < tris.length; t += 3) {
    const a = rvPos[tris[t]], b = rvPos[tris[t + 1]], c = rvPos[tris[t + 2]];
    if (a === b || b === c || a === c) continue;
    const pa = [AP[a * 3] / H, AP[a * 3 + 1] / H, AP[a * 3 + 2] / H], pb = [AP[b * 3] / H, AP[b * 3 + 1] / H, AP[b * 3 + 2] / H], pc = [AP[c * 3] / H, AP[c * 3 + 1] / H, AP[c * 3 + 2] / H];
    const e1 = sub(pb, pa), e2 = sub(pc, pa);
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const A2 = len(n); if (A2 < 1e-12) continue;
    const u = [n[0] / A2, n[1] / A2, n[2] / A2];
    const cr = (v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    // gradient of the linear interpolant: sum f_i (n x opposite edge) / 2A
    const k0 = cr(sub(pc, pb)), k1 = cr(sub(pa, pc)), k2 = cr(sub(pb, pa));
    const G = [0, 1, 2].map(q => (f[a] * k0[q] + f[b] * k1[q] + f[c] * k2[q]) / A2);
    for (const v of [a, b, c]) { gx[v] += G[0] * A2; gy[v] += G[1] * A2; gz[v] += G[2] * A2; wa[v] += A2; }
  }
  const out = new Float64Array(NP);
  for (let i = 0; i < NP; i++) {
    const g = wa[i] > 0 ? Math.hypot(gx[i], gy[i], gz[i]) / wa[i] : 1;
    out[i] = f[i] / Math.max(0.35, Math.min(3, g));
  }
  return out;
}
const dJ = surfaceDistance(fJ), dS = surfaceDistance(fS);
for (let i = 0; i < NP; i++) {
  gJ[i] = Math.max(-127, Math.min(127, Math.round(dJ[i] / 0.002)));
  gS[i] = Math.max(-127, Math.min(127, Math.round(dS[i] / 0.002)));
}

// ---------------------------------------------------------------- face / scalp masks in head-local MakeHuman cm
const hj = AJ('head');
const toHead = p => [(p[0] - hj[0]) / (CMf * s0), (p[1] - hj[1]) / (CMf * s0), (p[2] - hj[2]) / (CMf * s0)];
const eyeL = toHead(AJ('eyeL')), eyeR = toHead(AJ('eyeR'));
const EX = Math.abs(eyeL[0]), EY = eyeL[1], EZ = eyeL[2];
const sm = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
// hairline height (cm) by azimuth |a| = atan2(|x|, y - 2): forehead, temples, sideburn, over the ear, behind the ear, nape
const HL = [[0, EZ + 7.4], [0.5, EZ + 7.0], [0.9, EZ + 6.0], [1.2, EZ + 1.2], [1.28, EZ - 0.6], [1.38, EZ + 0.8], [1.55, EZ + 2.8], [2.05, EZ + 2.9], [2.35, EZ + 0.2], [2.75, EZ - 3.6], [Math.PI + 0.01, EZ - 5.6]];
function hairline(aa) { for (let i = 0; i < HL.length - 1; i++) if (aa <= HL[i + 1][0]) { const t = (aa - HL[i][0]) / (HL[i + 1][0] - HL[i][0]); return HL[i][1] + (HL[i + 1][1] - HL[i][1]) * t; } return HL[HL.length - 1][1]; }
function scalpD(h) { // signed cm above the hairline (positive = hair)
  const aa = Math.abs(Math.atan2(Math.abs(h[0]), h[1] - 2));
  return h[2] - hairline(aa);
}
// mouth / lips from landmarks
const mC = toHead(AJ('mouthC')), chin = toHead(AJ('chin'));
// the 'oris06' landmark sits in the philtrum; the mouth line (stomion) is the deepest point of the midline between
// the upper and lower lips' most forward points
const MZ = (() => {
  let best = null;
  for (let i = 0; i < NP; i++) {
    const h = toHead([AP[i * 3], AP[i * 3 + 1], AP[i * 3 + 2]]);
    if (Math.abs(h[0]) > 0.35 || h[1] < mC[1] - 0.4 || h[2] > mC[2] - 0.4 || h[2] < mC[2] - 2.6) continue;
    if (!best || h[1] < best[1]) best = h;
  }
  return best ? best[2] : mC[2];
})();
const MW = 2.35;
console.log('mouth line', MZ.toFixed(2), 'cm (landmark', mC[2].toFixed(2) + ')');
function lipMask(h) {
  if (h[1] < EY + 1.2) return 0;
  const dx = Math.abs(h[0]) / MW;
  if (dx > 1.05) return 0;
  const up = MZ + 1.05 * Math.sqrt(Math.max(0, 1 - dx * dx * 0.85)) + 0.05, lo = MZ - 1.15 * Math.sqrt(Math.max(0, 1 - dx * dx * 0.9));
  const inU = sm((up - h[2]) / 0.18) * sm((h[2] - MZ) / 0.05 + 1);
  const inL = sm((h[2] - lo) / 0.18) * sm((MZ - h[2]) / 0.05 + 1);
  return Math.max(inU, inL) * sm((1.05 - dx) / 0.12);
}
function beardFull(h) {
  const ax = Math.abs(h[0]);
  const aa = Math.abs(Math.atan2(ax, h[1] - 2));
  const cheekLine = EZ - 2.6 - 0.3 * Math.max(0, h[1] - (EY - 4));   // below the cheekbones, falling toward the mouth corners
  const face = sm((1.3 - aa) / 0.12) * sm((cheekLine - h[2]) / 1.6);
  const under = sm((h[2] - (chin[2] - 5.5)) / 1.5);                    // a little under the jaw
  const lips = lipMask(h) > 0.2 ? 0 : 1;
  return face * under * lips;
}
function mustache(h) {
  if (h[1] < EY + 1) return 0;
  const ax = Math.abs(h[0]);
  return sm((MW + 0.55 - ax) / 0.4) * sm((h[2] - (MZ + 1.05)) / 0.3) * sm(((MZ + 2.35) - h[2]) / 0.4) * (lipMask(h) > 0.2 ? 0 : 1);
}
function goatee(h) {
  if (h[1] < EY - 2) return 0;
  const ax = Math.abs(h[0]);
  return sm((2.7 - ax) / 0.6) * sm(((MZ - 1.2) - h[2]) / 0.35) * sm((h[2] - (chin[2] - 2.8)) / 0.8) * (lipMask(h) > 0.2 ? 0 : 1);
}
// brows: distance to a curve over each eye (inner end, peak, tail)
function browField(h) {
  // 1 on the brow's centre line falling to 0.5 at its edge: ~0.9 cm tall at the head of the brow tapering to ~0.35 cm
  // at the tail (the shader's threshold makes brows thicker or thinner per player)
  if (h[1] < EY - 1.5) return 0;
  const ax = Math.abs(h[0]);
  const t = (ax - (EX - 1.8)) / 3.9;       // 0 inner end .. 1 tail
  if (t < -0.08 || t > 1.08) return 0;
  const tc = Math.max(0, Math.min(1, t));
  const zc = EZ + 1.6 + 0.5 * Math.sin(tc * Math.PI * 0.8) - 0.6 * tc * tc;
  const w = 0.46 - 0.28 * tc;
  const d = Math.abs(h[2] - zc + 0.08 * (1 - tc));
  const ends = sm((t + 0.08) / 0.1) * sm((1.08 - t) / 0.16);
  return Math.max(0, 1 - d / (2 * w)) * ends;
}
function lashField(h) {
  if (h[1] < EY) return 0;
  const dx = (Math.abs(h[0]) - EX) / 1.55, dz = (h[2] - EZ) / 0.72;
  const r = Math.sqrt(dx * dx + dz * dz);
  return Math.max(0, 1 - Math.abs(r - 1) / 0.28) * (h[2] > EZ - 0.25 ? 1 : 0.35);
}
function cavity(h) {
  // nostrils and the inner eye corners
  const nt = toHead(AJ('noseTip'));
  const nx = Math.abs(h[0]) - 0.95, nz = h[2] - (nt[2] - 0.55), ny = h[1] - (nt[1] - 1.2);
  const nos = Math.max(0, 1 - Math.sqrt(nx * nx * 2.2 + nz * nz * 5 + ny * ny * 1.2) / 0.9);
  return Math.min(1, nos);
}
// per-position copies used by the runtime geometry (hair shells, beards)
const scalpV = new Int8Array(NP), beardV = new Uint8Array(NP);
for (let i = 0; i < NP; i++) {
  const h = toHead([AP[i * 3], AP[i * 3 + 1], AP[i * 3 + 2]]);
  const onHead = h[2] > -14;
  scalpV[i] = onHead ? Math.max(-127, Math.min(127, Math.round(scalpD(h) * 10))) : -127;
  beardV[i] = onHead ? Math.round(255 * Math.max(beardFull(h), mustache(h), goatee(h))) : 0;
}

// ---------------------------------------------------------------- rasterise the masks into UV space
const TW = 1024, TH = 1024;
const T1 = new Uint8Array(TW * TH * 4), T2 = new Uint8Array(TW * TH * 4), hit = new Uint8Array(TW * TH);
const hv = new Float64Array(NR * 3);
for (let r = 0; r < NR; r++) { const p = rvPos[r]; const h = toHead([AP[p * 3], AP[p * 3 + 1], AP[p * 3 + 2]]); hv[r * 3] = h[0]; hv[r * 3 + 1] = h[1]; hv[r * 3 + 2] = h[2]; }
let faceTexels = 0;
for (let t = 0; t < tris.length; t += 3) {
  const a = tris[t], b = tris[t + 1], c = tris[t + 2];
  if (hv[a * 3 + 2] < -16 && hv[b * 3 + 2] < -16 && hv[c * 3 + 2] < -16) continue;
  const ua = rvUV[a * 2] * TW, va = (1 - rvUV[a * 2 + 1]) * TH, ub = rvUV[b * 2] * TW, vb = (1 - rvUV[b * 2 + 1]) * TH, uc = rvUV[c * 2] * TW, vc = (1 - rvUV[c * 2 + 1]) * TH;
  const x0 = Math.max(0, Math.floor(Math.min(ua, ub, uc))), x1 = Math.min(TW - 1, Math.ceil(Math.max(ua, ub, uc)));
  const y0 = Math.max(0, Math.floor(Math.min(va, vb, vc))), y1 = Math.min(TH - 1, Math.ceil(Math.max(va, vb, vc)));
  const den = (vb - vc) * (ua - uc) + (uc - ub) * (va - vc);
  if (Math.abs(den) < 1e-12) continue;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const px = x + 0.5, py = y + 0.5;
    const l1 = ((vb - vc) * (px - uc) + (uc - ub) * (py - vc)) / den, l2 = ((vc - va) * (px - uc) + (ua - uc) * (py - vc)) / den, l3 = 1 - l1 - l2;
    if (l1 < -0.02 || l2 < -0.02 || l3 < -0.02) continue;
    const h = [0, 1, 2].map(k => hv[a * 3 + k] * l1 + hv[b * 3 + k] * l2 + hv[c * 3 + k] * l3);
    const o = (y * TW + x) * 4;
    const sc = Math.max(0, Math.min(1, 0.5 + scalpD(h) / 6));
    T1[o] = Math.round(sc * 255); T1[o + 1] = Math.round(beardFull(h) * 255); T1[o + 2] = Math.round(browField(h) * 255); T1[o + 3] = Math.round(lipMask(h) * 255);
    T2[o] = Math.round(mustache(h) * 255); T2[o + 1] = Math.round(goatee(h) * 255); T2[o + 2] = Math.round(lashField(h) * 255); T2[o + 3] = Math.round(cavity(h) * 255);
    if (!hit[y * TW + x] && h[1] > 6 && h[2] > -8 && h[2] < 12) faceTexels++;
    hit[y * TW + x] = 1;
  }
}
// dilate past the UV island borders so filtering never pulls in empty texels
for (let pass = 0; pass < 6; pass++) {
  const add = [];
  for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) {
    const i = y * TW + x; if (hit[i]) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= TW || yy >= TH) continue;
      const j = yy * TW + xx; if (hit[j] !== 1) continue;
      add.push([i, j]); break;
    }
  }
  for (const [i, j] of add) { for (let k = 0; k < 4; k++) { T1[i * 4 + k] = T1[j * 4 + k]; T2[i * 4 + k] = T2[j * 4 + k]; } hit[i] = 2; }
  for (const [i] of add) hit[i] = 1;
}
console.log('face texels', faceTexels, 'of', TW * TH);
// PNG encoder (RGBA8, filter 0)
const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
function crc32(buf) { let c = -1; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function chunk(type, data) { const b = Buffer.alloc(12 + data.length); b.writeUInt32BE(data.length, 0); b.write(type, 4, 'ascii'); data.copy(b, 8); b.writeUInt32BE(crc32(b.subarray(4, 8 + data.length)), 8 + data.length); return b; }
function png(rgba, w, h) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
const png1 = png(T1, TW, TH), png2 = png(T2, TW, TH);
if (process.env.MASK_DUMP) { fs.writeFileSync(process.env.MASK_DUMP + '_1.png', png1); fs.writeFileSync(process.env.MASK_DUMP + '_2.png', png2); }
console.log('mask png sizes', png1.length, png2.length);

// ---------------------------------------------------------------- pack
const parts = [], index = {};
let off = 0;
function put(name, arr, scale) {
  const b = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
  const pad = (4 - (off % 4)) % 4; if (pad) { parts.push(Buffer.alloc(pad)); off += pad; }
  index[name] = [arr.constructor.name, off, arr.length, scale || 1];
  parts.push(b); off += b.length;
}
put('rvPos', Uint16Array.from(rvPos));
put('rvUV', Uint16Array.from(rvUV.map(v => Math.round(Math.max(0, Math.min(1, v)) * 65535))));
put('tris', Uint16Array.from(tris));
const base = X.bodyRig(Float64Array.from(X.obj.v));
const QB = 1 / 2048, QD = 1 / 8192, QF = 1 / 16384;
const q16 = (arr, q) => Int16Array.from(arr, v => Math.max(-32767, Math.min(32767, Math.round(v / q))));
put('base', q16(base, QB), QB);
const baseJ = X.jointsOf(Float64Array.from(X.obj.v));
put('baseJ', Float32Array.from(baseJ));
const heights = {};
for (const g of GENDERS) {
  const Pg = X.morph(g, null, null);
  const Bg = X.bodyRig(Pg), Jg = X.jointsOf(Pg);
  put('g_' + g, q16(Bg.map((v, i) => v - base[i]), QD), QD);
  put('gJ_' + g, Float32Array.from(Jg.map((v, i) => v - baseJ[i])));
  COMBOS.forEach((c, ci) => {
    const w = COMBOS.map((_, k) => (k === ci ? 1 : 0));
    const Pc = X.morph(g, w, null);
    const Bc = X.bodyRig(Pc), Jc = X.jointsOf(Pc);
    put('c_' + g + '_' + ci, q16(Bc.map((v, i) => v - Bg[i]), QD), QD);
    put('cJ_' + g + '_' + ci, Float32Array.from(Jc.map((v, i) => v - Jg[i])));
  });
  heights[g] = X.height(Bg);
}
// sparse face targets (rig axes feet), relative to the neutral base
const faceKeys = [];
faceT.forEach((f, fi) => {
  for (const side of ['dec', 'inc']) {
    const t = f[side];
    if (!t.size) continue;
    const idx = [], d = [];
    const P = Float64Array.from(X.obj.v);
    for (const [i, v] of t) { P[i * 3] += v[0]; P[i * 3 + 1] += v[1]; P[i * 3 + 2] += v[2]; }
    for (const [i, v] of t) {
      const p = X.posOf[i]; if (p < 0) continue;
      const o = [0, 0, 0]; X.conv(v[0], v[1], v[2], o, 0);
      if (Math.abs(o[0]) + Math.abs(o[1]) + Math.abs(o[2]) < 2e-5) continue;
      idx.push(p); d.push(o[0], o[1], o[2]);
    }
    const Jt = X.jointsOf(P);
    put('f_' + f.key + '_' + side + '_i', Uint16Array.from(idx));
    put('f_' + f.key + '_' + side + '_d', q16(d, QF), QF);
    put('fJ_' + f.key + '_' + side, Float32Array.from(Jt.map((v, i) => v - baseJ[i])));
    faceKeys.push(f.key + '_' + side);
  }
});
put('wb', X.WB); put('ww', X.WW);
put('gJer', gJ, 0.002); put('gSho', gS, 0.002);
put('scalp', scalpV, 0.1); put('beard', beardV, 1 / 255);
const blob = Buffer.concat(parts);
const packed = zlib.deflateRawSync(blob, { level: 9 });
const meta = {
  version: 1, np: NP, nr: NR, nt: tris.length / 3, joints: JKEYS, combos: COMBOS.map(c => c.join('-')), faceKeys,
  bindPose: Y.bindBoth, fingers: Y.fingers, heights, bindCurl: 0.25,
  eye: { x: EX, y: EY, z: EZ }, mouth: { z: MZ, w: MW }, headJointRef: 'head____head',
  source: 'MakeHuman 1.1 hm08 base mesh, targets and default skeleton weights (CC0 1.0), https://github.com/makehumancommunity/makehuman',
};
const js = '/* Pro BBALL Coach — generated by tools/human/build.js. Do not edit.\n * Body mesh, targets and weights derived from MakeHuman 1.1 assets, released under CC0 1.0 Universal by the\n * MakeHuman project (https://github.com/makehumancommunity/makehuman, LICENSE.ASSETS.md). */\n' +
  '(function () {\n  \'use strict\';\n  const M = window.PBC.Match;\n  M.HumanData = {\n    meta: ' + JSON.stringify(meta) + ',\n    index: ' + JSON.stringify(index) + ',\n' +
  '    blob: \'' + packed.toString('base64') + '\',\n' +
  '    mask1: \'data:image/png;base64,' + png1.toString('base64') + '\',\n' +
  '    mask2: \'data:image/png;base64,' + png2.toString('base64') + '\',\n  };\n})();\n';
fs.writeFileSync(X.OUT, js);
console.log('raw', blob.length, 'deflated', packed.length, 'js', js.length, '->', X.OUT);
