#!/usr/bin/env node
/* Pro BBALL Coach — builds js/match/human_data.js from MakeHuman 1.1 assets.
 *
 * Source: https://github.com/makehumancommunity/makehuman (makehuman/data). The base mesh (hm08), targets and
 * skeleton weights are released under CC0 1.0 (see LICENSE.md / LICENSE.ASSETS.md in that repository), so the
 * derived data file can ship with the game.
 *
 *   node tools/human/build.js            downloads what it needs into tools/human/cache (or $MH_CACHE)
 *
 * What it writes (one deflated binary blob + an index, decoded by js/match/human.js):
 *   - the body mesh (13380 positions, UV-split render vertices, triangles) in the rig's axes (x right, y forward,
 *     z up) and feet, not yet scaled to a player's height;
 *   - gender bases (MakeHuman's three race targets averaged, so no single ancestry is baked in) and the
 *     muscle x weight grid with ideal body proportions for young adults;
 *   - identity face targets (face length, jaw, chin, cheekbones, eyes, nose, lips, ears, neck) as sparse deltas;
 *   - joint positions for every variant and target, skin weights mapped onto the game's 39-bone palette,
 *     a finger layout, clothing regions (jersey / shorts cut lines) and UV face masks (brows, lips, beard, scalp);
 *   - the rig's bind pose fitted to MakeHuman's rest pose, so skinning starts undistorted.
 */
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib'), vm = require('vm'), cp = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const CACHE = process.env.MH_CACHE || path.join(__dirname, 'cache');
const RAW = 'https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/';
const OUT = path.join(ROOT, 'js', 'match', 'human_data.js');
const DM = 0.328084; // feet per decimetre (MakeHuman units)

function get(rel) {
  const f = path.join(CACHE, rel);
  if (!fs.existsSync(f)) {
    fs.mkdirSync(path.dirname(f), { recursive: true });
    cp.execFileSync('curl', ['-sS', '-f', '-m', '120', '-o', f, RAW + rel]);
  }
  return f;
}
function loadObj(file) {
  const v = [], vt = [], faces = []; let group = '';
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (line.startsWith('v ')) { const p = line.trim().split(/\s+/); v.push(+p[1], +p[2], +p[3]); }
    else if (line.startsWith('vt ')) { const p = line.trim().split(/\s+/); vt.push(+p[1], +p[2]); }
    else if (line.startsWith('g ')) group = line.slice(2).trim();
    else if (line.startsWith('f ')) {
      const p = line.trim().split(/\s+/).slice(1).map(s => s.split('/').map(x => +x - 1));
      faces.push({ g: group, v: p.map(q => q[0]), t: p.map(q => q[1]) });
    }
  }
  return { v: Float64Array.from(v), vt: Float64Array.from(vt), faces };
}
function loadTarget(rel) {
  const d = new Map();
  for (const line of fs.readFileSync(get('targets/' + rel + '.target'), 'utf8').split('\n')) {
    if (!/^\d/.test(line)) continue;
    const p = line.trim().split(/\s+/);
    d.set(+p[0], [+p[1], +p[2], +p[3]]);
  }
  return d;
}
/** MakeHuman (x = character's left, y up, z forward, decimetres) -> rig axes (x right, y forward, z up, feet) */
function conv(x, y, z, out, o) { out[o] = -x * DM; out[o + 1] = z * DM; out[o + 2] = y * DM; }

// ---------------------------------------------------------------- mesh
const obj = loadObj(get('3dobjs/base.obj'));
const NALL = obj.v.length / 3;
const bodyFaces = obj.faces.filter(f => f.g === 'body');
const posOf = new Int32Array(NALL).fill(-1);
const posList = [];
for (const f of bodyFaces) for (const i of f.v) if (posOf[i] < 0) { posOf[i] = posList.length; posList.push(i); }
const NP = posList.length;
// render vertices: unique (position, uv) pairs
const rvKey = new Map(), rvPos = [], rvUV = [];
const tris = [];
for (const f of bodyFaces) {
  const ids = f.v.map((vi, k) => {
    const key = vi * 65536 + f.t[k];
    let r = rvKey.get(key);
    if (r === undefined) { r = rvPos.length; rvKey.set(key, r); rvPos.push(posOf[vi]); rvUV.push(obj.vt[f.t[k] * 2], obj.vt[f.t[k] * 2 + 1]); }
    return r;
  });
  for (let k = 1; k + 1 < ids.length; k++) tris.push(ids[0], ids[k], ids[k + 1]);
}
const NR = rvPos.length;
console.log('positions', NP, 'render vertices', NR, 'triangles', tris.length / 3);

// ---------------------------------------------------------------- targets
function applyT(P, t, w) { if (!w) return; for (const [i, d] of t) { P[i * 3] += d[0] * w; P[i * 3 + 1] += d[1] * w; P[i * 3 + 2] += d[2] * w; } }
function addInto(dst, t, w) { for (const [i, d] of t) { const o = dst.get(i) || [0, 0, 0]; o[0] += d[0] * w; o[1] += d[1] * w; o[2] += d[2] * w; dst.set(i, o); } return dst; }
const RACES = ['african', 'asian', 'caucasian'];
const GENDERS = ['male', 'female'];
const COMBOS = [['average', 'min'], ['average', 'average'], ['average', 'max'], ['max', 'min'], ['max', 'average'], ['max', 'max']];
const KPROP = 1.0; // ideal body proportions (athletes)
const genderT = {}, comboT = {};
for (const g of GENDERS) {
  genderT[g] = new Map();
  for (const r of RACES) addInto(genderT[g], loadTarget('macrodetails/' + r + '-' + g + '-young'), 1 / 3);
  comboT[g] = COMBOS.map(([m, w]) => {
    const t = new Map();
    addInto(t, loadTarget('macrodetails/universal-' + g + '-young-' + m + 'muscle-' + w + 'weight'), 1);
    addInto(t, loadTarget('macrodetails/proportions/' + g + '-young-' + m + 'muscle-' + w + 'weight-idealproportions'), KPROP);
    return t;
  });
}
// identity features -> MakeHuman face / body targets: [name, [[decrTargets...], [incrTargets...]], gain]
const FACE = [
  ['faceLen', [['head/head-scale-vert-decr', 0.7], ['chin/chin-height-decr', 0.5]], [['head/head-scale-vert-incr', 0.7], ['chin/chin-height-incr', 0.5]]],
  ['jaw', [['chin/chin-bones-decr', 1], ['chin/chin-width-decr', 0.6]], [['chin/chin-bones-incr', 1], ['chin/chin-width-incr', 0.6], ['head/head-square', 0.35]]],
  ['chin', [['chin/chin-prominent-decr', 1]], [['chin/chin-prominent-incr', 1]]],
  ['cheek', [['cheek/l-cheek-bones-decr', 1], ['cheek/r-cheek-bones-decr', 1]], [['cheek/l-cheek-bones-incr', 1], ['cheek/r-cheek-bones-incr', 1]]],
  ['forehead', [['forehead/forehead-scale-vert-decr', 1]], [['forehead/forehead-scale-vert-incr', 1]]],
  ['eyeSize', [['eyes/l-eye-scale-decr', 0.8], ['eyes/r-eye-scale-decr', 0.8]], [['eyes/l-eye-scale-incr', 0.8], ['eyes/r-eye-scale-incr', 0.8]]],
  ['eyeSpace', [['eyes/l-eye-trans-in', 0.8], ['eyes/r-eye-trans-in', 0.8]], [['eyes/l-eye-trans-out', 0.8], ['eyes/r-eye-trans-out', 0.8]]],
  ['eyeTilt', [['eyes/l-eye-corner1-down', 0.8], ['eyes/r-eye-corner1-down', 0.8]], [['eyes/l-eye-corner1-up', 0.8], ['eyes/r-eye-corner1-up', 0.8]]],
  ['lid', [['eyes/l-eye-eyefold-up', 0.8], ['eyes/r-eye-eyefold-up', 0.8]], [['eyes/l-eye-eyefold-down', 0.8], ['eyes/r-eye-eyefold-down', 0.8]]],
  ['browArch', [['eyebrows/eyebrows-angle-down', 0.8]], [['eyebrows/eyebrows-angle-up', 0.8]]],
  ['noseW', [['nose/nose-scale-horiz-decr', 0.8], ['nose/nose-nostrils-width-decr', 0.5], ['nose/nose-flaring-decr', 0.4]], [['nose/nose-scale-horiz-incr', 0.8], ['nose/nose-nostrils-width-incr', 0.5], ['nose/nose-flaring-incr', 0.4]]],
  ['noseL', [['nose/nose-scale-vert-decr', 0.9]], [['nose/nose-scale-vert-incr', 0.9]]],
  ['noseBridge', [['nose/nose-scale-depth-decr', 0.7], ['nose/nose-hump-decr', 0.4]], [['nose/nose-scale-depth-incr', 0.7], ['nose/nose-hump-incr', 0.4]]],
  ['lipFull', [['mouth/mouth-upperlip-volume-decr', 0.9], ['mouth/mouth-lowerlip-volume-decr', 0.9]], [['mouth/mouth-upperlip-volume-incr', 0.9], ['mouth/mouth-lowerlip-volume-incr', 0.9]]],
  ['mouthW', [['mouth/mouth-scale-horiz-decr', 0.8]], [['mouth/mouth-scale-horiz-incr', 0.8]]],
  ['earSize', [['ears/l-ear-scale-decr', 0.8], ['ears/r-ear-scale-decr', 0.8]], [['ears/l-ear-scale-incr', 0.8], ['ears/r-ear-scale-incr', 0.8]]],
  ['neck', [['neck/neck-scale-horiz-decr', 0.6], ['neck/neck-scale-depth-decr', 0.6]], [['neck/neck-scale-horiz-incr', 0.6], ['neck/neck-scale-depth-incr', 0.6]]],
  // athletic definition (only an "incr" side): pecs, lats, V taper, delts, arms, legs
  ['athlete', [], [['torso/torso-muscle-pectoral-incr', 0.6], ['torso/torso-muscle-dorsi-incr', 0.6], ['torso/torso-vshape-incr', 0.5],
    ['armslegs/l-upperarm-shoulder-muscle-incr', 0.7], ['armslegs/r-upperarm-shoulder-muscle-incr', 0.7], ['armslegs/l-upperarm-muscle-incr', 0.6], ['armslegs/r-upperarm-muscle-incr', 0.6],
    ['armslegs/l-lowerarm-muscle-incr', 0.5], ['armslegs/r-lowerarm-muscle-incr', 0.5], ['armslegs/l-upperleg-muscle-incr', 0.5], ['armslegs/r-upperleg-muscle-incr', 0.5],
    ['armslegs/l-lowerleg-muscle-incr', 0.5], ['armslegs/r-lowerleg-muscle-incr', 0.5], ['stomach/stomach-tone-incr', 0.6]]],
];
const faceT = FACE.map(([key, dec, inc]) => {
  const mk = list => { const t = new Map(); for (const [n, w] of list) addInto(t, loadTarget(n), w); return t; };
  return { key, dec: mk(dec), inc: mk(inc) };
});

// ---------------------------------------------------------------- skeleton joints
const skel = JSON.parse(fs.readFileSync(get('rigs/default.mhskel'), 'utf8'));
const JOINTS = {
  hipL: 'upperleg01.L____head', hipR: 'upperleg01.R____head', kneeL: 'lowerleg01.L____head', kneeR: 'lowerleg01.R____head',
  ankleL: 'foot.L____head', ankleR: 'foot.R____head', ballL: 'toe3-1.L____head', ballR: 'toe3-1.R____head', toeL: 'toe3-3.L____tail', toeR: 'toe3-3.R____tail',
  heelL: null, heelR: null,
  shL: 'upperarm01.L____head', shR: 'upperarm01.R____head', elL: 'lowerarm01.L____head', elR: 'lowerarm01.R____head', wrL: 'wrist.L____head', wrR: 'wrist.R____head',
  neck: 'neck01____head', head: 'head____head', headTop: 'head____tail', eyeL: 'eye.L____head', eyeR: 'eye.R____head', spine1: 'spine01____head', spine3: 'spine03____head', root: 'spine05____head',
  jaw: 'jaw____head', chin: 'oris02____head', noseTip: 'levator06.L____head', mouthC: 'oris06____tail', lipU: 'oris04.L____head', browInL: 'oculi01.L____tail', browMidL: 'oculi01.L____head', browOutL: 'oculi02.L____head',
};
for (const s of ['L', 'R']) for (let f = 1; f <= 5; f++) {
  JOINTS['f' + f + '1' + s] = 'finger' + f + '-1.' + s + '____head';
  JOINTS['f' + f + '2' + s] = 'finger' + f + '-2.' + s + '____head';
  JOINTS['f' + f + '3' + s] = 'finger' + f + '-3.' + s + '____head';
  JOINTS['f' + f + 't' + s] = 'finger' + f + '-3.' + s + '____tail';
}
const JKEYS = Object.keys(JOINTS).filter(k => JOINTS[k]);
function jointsOf(P) {
  const out = new Float64Array(JKEYS.length * 3);
  JKEYS.forEach((k, j) => {
    const idx = skel.joints[JOINTS[k]];
    if (!idx) throw new Error('joint ' + JOINTS[k]);
    let x = 0, y = 0, z = 0;
    for (const i of idx) { x += P[i * 3]; y += P[i * 3 + 1]; z += P[i * 3 + 2]; }
    conv(x / idx.length, y / idx.length, z / idx.length, out, j * 3);
  });
  return out;
}
function morph(g, comboW, faceW) {
  const P = Float64Array.from(obj.v);
  applyT(P, genderT[g], 1);
  if (comboW) COMBOS.forEach((c, i) => applyT(P, comboT[g][i], comboW[i] || 0));
  if (faceW) faceT.forEach((f, i) => { const w = faceW[i] || 0; if (w < 0) applyT(P, f.dec, -w); else applyT(P, f.inc, w); });
  return P;
}
function bodyRig(P) { // rig-axes feet positions of the body vertices
  const out = new Float64Array(NP * 3);
  for (let i = 0; i < NP; i++) { const s = posList[i]; conv(P[s * 3], P[s * 3 + 1], P[s * 3 + 2], out, i * 3); }
  return out;
}
function height(B) { let lo = 1e9, hi = -1e9; for (let i = 0; i < NP; i++) { const z = B[i * 3 + 2]; if (z < lo) lo = z; if (z > hi) hi = z; } return [lo, hi]; }

// ---------------------------------------------------------------- skin weights -> game palette
const PB = { PEL: 0, SPN: 1, CHS: 2, NCK: 3, HED: 4, L_UA: 5, L_FA: 6, L_HD: 7, R_UA: 8, R_FA: 9, R_HD: 10, L_TH: 11, L_SH: 12, L_FT: 13, R_TH: 14, R_SH: 15, R_FT: 16, L_TOE: 17, R_TOE: 18, L_FNG: 19, R_FNG: 29 };
function palette(bone) {
  const m = /\.(L|R)$/.exec(bone);
  const s = m ? m[1] : '';
  const b = bone.replace(/\.(L|R)$/, '');
  const X = n => PB[s + '_' + n];
  if (/^(root|spine05)$/.test(b) || b === 'pelvis') return [[PB.PEL, 1]];
  if (/^(spine04|spine03)$/.test(b)) return [[PB.SPN, 1]];
  if (/^(spine02|spine01|breast|clavicle)$/.test(b)) return [[PB.CHS, 1]];
  if (b === 'shoulder01') return [[PB.CHS, 0.55], [X('UA'), 0.45]];
  if (/^(neck01|neck02)$/.test(b)) return [[PB.NCK, 1]];
  if (/^(neck03|head|jaw|eye|oculi\d+|orbicularis\d+|oris\d+|levator\d+|risorius\d+|temporalis\d+|special\d+|tongue\d+)$/.test(b)) return [[PB.HED, 1]];
  if (/^upperarm0[12]$/.test(b)) return [[X('UA'), 1]];
  if (/^lowerarm0[12]$/.test(b)) return [[X('FA'), 1]];
  if (/^(wrist|metacarpal\d)$/.test(b)) return [[X('HD'), 1]];
  let fm = /^finger(\d)-(\d)$/.exec(b);
  if (fm) {
    const f = +fm[1], seg = +fm[2];
    const base = PB[s + '_FNG'];
    const slot = f === 1 ? 8 : (f - 2) * 2; // thumb -> 8/9; index, middle, ring, pinky -> 0/1 .. 6/7
    return [[base + slot + (seg === 1 ? 0 : 1), 1]];
  }
  if (/^upperleg0[12]$/.test(b)) return [[X('TH'), 1]];
  if (/^lowerleg0[12]$/.test(b)) return [[X('SH'), 1]];
  if (b === 'foot') return [[X('FT'), 1]];
  if (/^toe\d-\d$/.test(b)) return [[X('TOE'), 1]];
  throw new Error('unmapped bone ' + bone);
}
const wfile = JSON.parse(fs.readFileSync(get('rigs/default_weights.mhw'), 'utf8')).weights;
const wacc = Array.from({ length: NP }, () => new Map());
for (const bone in wfile) {
  const map = palette(bone);
  for (const [vi, w] of wfile[bone]) {
    const p = posOf[vi]; if (p < 0) continue;
    for (const [pb, k] of map) wacc[p].set(pb, (wacc[p].get(pb) || 0) + w * k);
  }
}
// neighbours for unweighted vertices
const nbr = Array.from({ length: NP }, () => new Set());
for (const f of bodyFaces) for (let k = 0; k < f.v.length; k++) { const a = posOf[f.v[k]], b = posOf[f.v[(k + 1) % f.v.length]]; nbr[a].add(b); nbr[b].add(a); }
for (let pass = 0; pass < 6; pass++) for (let i = 0; i < NP; i++) {
  if (wacc[i].size) continue;
  for (const n of nbr[i]) if (wacc[n].size) { wacc[i] = new Map(wacc[n]); break; }
}
const WB = new Uint8Array(NP * 4), WW = new Uint8Array(NP * 4);
let unweighted = 0;
for (let i = 0; i < NP; i++) {
  const e = [...wacc[i].entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  if (!e.length) { unweighted++; e.push([PB.CHS, 1]); }
  const s = e.reduce((a, b) => a + b[1], 0);
  const q = e.map(x => Math.round(x[1] / s * 255));
  let big = 0; for (let k = 1; k < q.length; k++) if (q[k] > q[big]) big = k;
  q[big] += 255 - q.reduce((a, b) => a + b, 0);
  for (let k = 0; k < 4; k++) { WB[i * 4 + k] = e[k] ? e[k][0] : 0; WW[i * 4 + k] = e[k] ? q[k] : 0; }
}
console.log('weights mapped; unweighted', unweighted);

module.exports = { obj, NP, NR, posList, posOf, rvPos, rvUV, tris, genderT, comboT, faceT, FACE, COMBOS, GENDERS, JKEYS, JOINTS, jointsOf, morph, bodyRig, height, WB, WW, PB, conv, DM, ROOT, OUT, get, nbr };
if (require.main === module) require('./build2.js');
