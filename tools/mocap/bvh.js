/* Pro BBALL Coach — BVH motion capture reader: parses a .bvh file and runs forward kinematics.
 * parse(text) -> { joints: [{ name, parent, offset: [x,y,z], channels: [...], end: [x,y,z]|null }], frames, frameTime, data }
 * pose(bvh, f) -> world positions and rotation matrices of every joint at frame f (BVH units, Y up). */
'use strict';

function parse(text) {
  const tok = text.split(/\s+/).filter(Boolean);
  let i = 0;
  const joints = [];
  const stack = [];
  let chanCount = 0;
  if (tok[i++] !== 'HIERARCHY') throw new Error('not a BVH file');
  while (i < tok.length && tok[i] !== 'MOTION') {
    const t = tok[i++];
    if (t === 'ROOT' || t === 'JOINT') {
      const j = { name: tok[i++], parent: stack.length ? stack[stack.length - 1] : -1, offset: [0, 0, 0], channels: [], chan0: 0, end: null };
      joints.push(j);
      stack.push(joints.length - 1);
    } else if (t === 'End') {
      i++; // 'Site'
      i++; // '{'
      if (tok[i++] !== 'OFFSET') throw new Error('End Site without OFFSET');
      joints[stack[stack.length - 1]].end = [+tok[i++], +tok[i++], +tok[i++]];
      i++; // '}'
    } else if (t === 'OFFSET') {
      joints[stack[stack.length - 1]].offset = [+tok[i++], +tok[i++], +tok[i++]];
    } else if (t === 'CHANNELS') {
      const n = +tok[i++], j = joints[stack[stack.length - 1]];
      j.chan0 = chanCount;
      for (let k = 0; k < n; k++) j.channels.push(tok[i++]);
      chanCount += n;
    } else if (t === '}') {
      stack.pop();
    }
  }
  i++; // MOTION
  if (tok[i++] !== 'Frames:') throw new Error('no Frames:');
  const frames = +tok[i++];
  if (tok[i] !== 'Frame' || tok[i + 1] !== 'Time:') throw new Error('no Frame Time:');
  i += 2;
  const frameTime = +tok[i++];
  const data = new Float64Array(frames * chanCount);
  for (let k = 0; k < frames * chanCount; k++) data[k] = +tok[i++];
  return { joints, frames, frameTime, data, nch: chanCount, index: Object.fromEntries(joints.map((j, k) => [j.name, k])) };
}

// 3x3 row-major helpers
function mul(A, B) {
  return [
    A[0] * B[0] + A[1] * B[3] + A[2] * B[6], A[0] * B[1] + A[1] * B[4] + A[2] * B[7], A[0] * B[2] + A[1] * B[5] + A[2] * B[8],
    A[3] * B[0] + A[4] * B[3] + A[5] * B[6], A[3] * B[1] + A[4] * B[4] + A[5] * B[7], A[3] * B[2] + A[4] * B[5] + A[5] * B[8],
    A[6] * B[0] + A[7] * B[3] + A[8] * B[6], A[6] * B[1] + A[7] * B[4] + A[8] * B[7], A[6] * B[2] + A[7] * B[5] + A[8] * B[8],
  ];
}
function rot(axis, deg) {
  const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  if (axis === 'X') return [1, 0, 0, 0, c, -s, 0, s, c];
  if (axis === 'Y') return [c, 0, s, 0, 1, 0, -s, 0, c];
  return [c, -s, 0, s, c, 0, 0, 0, 1];
}
const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
function apply(M, v) { return [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]]; }

/** world positions (P[j] = [x,y,z]), rotations (R[j], 3x3 row-major, local -> world) and end sites (E[j]) at frame f */
function pose(bvh, f) {
  const { joints, data, nch } = bvh;
  const base = f * nch;
  const P = [], R = [], E = [];
  for (let j = 0; j < joints.length; j++) {
    const J = joints[j];
    let pos = J.offset.slice(), M = I3;
    let tr = null;
    for (let k = 0; k < J.channels.length; k++) {
      const ch = J.channels[k], v = data[base + J.chan0 + k];
      if (ch.endsWith('position')) { tr = tr || [0, 0, 0]; tr['XYZ'.indexOf(ch[0])] = v; }
      else M = mul(M, rot(ch[0], v));
    }
    if (tr) pos = [pos[0] + tr[0], pos[1] + tr[1], pos[2] + tr[2]];
    if (J.parent < 0) { P[j] = pos; R[j] = M; }
    else {
      const pr = R[J.parent], pp = P[J.parent];
      const o = apply(pr, pos);
      P[j] = [pp[0] + o[0], pp[1] + o[1], pp[2] + o[2]];
      R[j] = mul(pr, M);
    }
    if (J.end) { const o = apply(R[j], J.end); E[j] = [P[j][0] + o[0], P[j][1] + o[1], P[j][2] + o[2]]; }
  }
  return { P, R, E };
}

module.exports = { parse, pose, mul, rot, apply };
