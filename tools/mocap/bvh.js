// BVH motion capture files: the joint tree, the frames, and each frame's joints in world space.
// (Rotation channels compose in the order they are listed: CHANNELS 3 Zrotation Yrotation Xrotation is Rz * Ry * Rx,
// column vectors; a child's position is its parent's plus the parent's world rotation times the child's offset.)
'use strict';

const DEG = Math.PI / 180;

/** parse BVH text: { joints: [{ name, parent, offset, channels, ch0, end }], nCh, nFrames, dt, data } */
function parse(text) {
  const tok = text.split(/\s+/).filter(Boolean);
  let i = 0;
  const joints = [];
  let nCh = 0;
  const stack = [];
  const expect = (w) => { if (tok[i] !== w) throw new Error('bvh: expected ' + w + ' at token ' + i + ', got ' + tok[i]); i++; };
  expect('HIERARCHY');
  while (i < tok.length && tok[i] !== 'MOTION') {
    const t = tok[i++];
    if (t === 'ROOT' || t === 'JOINT') {
      const name = tok[i++];
      joints.push({ name, parent: stack.length ? stack[stack.length - 1] : -1, offset: [0, 0, 0], channels: [], ch0: nCh, end: false });
      stack.push(joints.length - 1);
      expect('{');
    } else if (t === 'End') {
      expect('Site');
      const p = stack[stack.length - 1];
      joints.push({ name: joints[p].name + '_End', parent: p, offset: [0, 0, 0], channels: [], ch0: nCh, end: true });
      stack.push(joints.length - 1);
      expect('{');
    } else if (t === 'OFFSET') {
      const j = joints[stack[stack.length - 1]];
      j.offset = [+tok[i], +tok[i + 1], +tok[i + 2]]; i += 3;
    } else if (t === 'CHANNELS') {
      const j = joints[stack[stack.length - 1]];
      const n = +tok[i++];
      j.ch0 = nCh;
      for (let k = 0; k < n; k++) j.channels.push(tok[i++]);
      nCh += n;
    } else if (t === '}') {
      stack.pop();
    } else throw new Error('bvh: unexpected token ' + t + ' at ' + (i - 1));
  }
  expect('MOTION');
  expect('Frames:');
  const nFrames = +tok[i++];
  expect('Frame'); expect('Time:');
  const dt = +tok[i++];
  const data = new Float64Array(nFrames * nCh);
  for (let k = 0; k < nFrames * nCh; k++) data[k] = +tok[i++];
  if (!(nFrames > 0) || !(dt > 0) || data.some(v => !isFinite(v))) throw new Error('bvh: bad motion block');
  return { joints, nCh, nFrames, dt, data };
}

function rot(axis, a, out) {
  const c = Math.cos(a), s = Math.sin(a);
  if (axis === 'X') out.set([1, 0, 0, 0, c, -s, 0, s, c]);
  else if (axis === 'Y') out.set([c, 0, s, 0, 1, 0, -s, 0, c]);
  else out.set([c, -s, 0, s, c, 0, 0, 0, 1]);
  return out;
}
/** C = A * B (row-major 3x3) */
function mul(A, B, C) {
  const c = new Float64Array(9);
  for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++) c[r * 3 + k] = A[r * 3] * B[k] + A[r * 3 + 1] * B[3 + k] + A[r * 3 + 2] * B[6 + k];
  C.set(c);
  return C;
}

/** frame f's joints in world space: pos (Float64Array 3 per joint), rot (Float64Array 9 per joint, row-major) */
function world(bvh, f, pos, R) {
  const J = bvh.joints, d = bvh.data, o = f * bvh.nCh;
  pos = pos || new Float64Array(J.length * 3); R = R || new Float64Array(J.length * 9);
  const L = new Float64Array(9), T = new Float64Array(9);
  for (let j = 0; j < J.length; j++) {
    const jt = J[j];
    let tx = jt.offset[0], ty = jt.offset[1], tz = jt.offset[2];
    L.set([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    for (let c = 0; c < jt.channels.length; c++) {
      const ch = jt.channels[c], v = d[o + jt.ch0 + c];
      if (ch === 'Xposition') tx = v + (jt.parent < 0 ? 0 : jt.offset[0]);
      else if (ch === 'Yposition') ty = v + (jt.parent < 0 ? 0 : jt.offset[1]);
      else if (ch === 'Zposition') tz = v + (jt.parent < 0 ? 0 : jt.offset[2]);
      else mul(L, rot(ch[0], v * DEG, T), L);
    }
    if (jt.parent < 0) {
      pos[j * 3] = tx; pos[j * 3 + 1] = ty; pos[j * 3 + 2] = tz;
      R.set(L, j * 9);
    } else {
      const p = jt.parent, P = R.subarray(p * 9, p * 9 + 9);
      pos[j * 3] = pos[p * 3] + P[0] * tx + P[1] * ty + P[2] * tz;
      pos[j * 3 + 1] = pos[p * 3 + 1] + P[3] * tx + P[4] * ty + P[5] * tz;
      pos[j * 3 + 2] = pos[p * 3 + 2] + P[6] * tx + P[7] * ty + P[8] * tz;
      mul(P, L, T); R.set(T, j * 9);
    }
  }
  return { pos, R };
}

/** the rest pose (every rotation zero, the root at the origin): joint positions */
function rest(bvh) {
  const J = bvh.joints, pos = new Float64Array(J.length * 3);
  for (let j = 0; j < J.length; j++) {
    const p = J[j].parent;
    for (let k = 0; k < 3; k++) pos[j * 3 + k] = (p < 0 ? 0 : pos[p * 3 + k]) + J[j].offset[k];
  }
  return pos;
}

module.exports = { parse, world, rest, DEG };
