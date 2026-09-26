/* Pro BBALL Coach — match view: realistic 3D people from the MakeHuman base mesh (PBC.Match.Human).
 * js/match/human_data.js carries MakeHuman's CC0 body (hm08 topology with a full face, hands and feet), the gender
 * and muscle x weight shapes, identity face shapes and skin weights (built by tools/human/build.js). For every
 * player this module:
 *   1. morphs the body (gender, muscle and weight from the player's build, face from PBC.Identity so the model
 *      matches the portrait: face length, jaw, chin, cheekbones, eyes, nose, lips, ears, neck);
 *   2. scales it to the player's height (heads grow less than bodies) and retargets it onto the rig's bind pose,
 *      bone by bone, so the game's skeleton drives it with the same skinning as before;
 *   3. dresses it: jersey and shorts are offset copies of the body surface (draped by smoothing, cut along the
 *      neckline / arm holes / hems with a trim band), socks and sleeves are skin regions, shoes are modelled around
 *      the foot, hair and beards are shells over the scalp / jaw, locs and braids are strands;
 *   4. packs one vertex buffer in the GPU layout used by gl3d.js (with UVs for the face masks).
 * Loading is asynchronous (the blob is deflated); until it is ready the renderer keeps the 2D figures. */
(function () {
  'use strict';
  const M = window.PBC.Match, U = M.U, RG = M.Rig, BD = M.Body3D;
  const B = BD.B, NB = BD.NB, MAT = BD.MAT;
  const CM = 0.0328084;

  let D = null, loading = null, failed = false;

  function b64(s) { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
  async function inflate(u8) {
    if (typeof DecompressionStream === 'undefined') throw new Error('no DecompressionStream');
    const ds = new DecompressionStream('deflate-raw');
    const buf = await new Response(new Blob([u8]).stream().pipeThrough(ds)).arrayBuffer();
    return buf;
  }
  function loadImage(src) {
    return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
  }
  function pixels(im) {
    const c = U.makeCanvas(im.width, im.height), g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(im, 0, 0);
    return { w: im.width, h: im.height, d: g.getImageData(0, 0, im.width, im.height).data, img: im };
  }
  /** start loading the data (idempotent); resolves true when ready */
  function load() {
    if (D) return Promise.resolve(true);
    if (loading) return loading;
    const HD = M.HumanData;
    if (!HD) { failed = true; return Promise.resolve(false); }
    loading = (async () => {
      const buf = await inflate(b64(HD.blob));
      const arr = {};
      const T = { Uint16Array, Int16Array, Uint8Array, Int8Array, Float32Array, Uint32Array };
      for (const k in HD.index) {
        const [type, off, n, scale] = HD.index[k];
        arr[k] = new T[type](buf, off, n);
        arr[k].scale = scale;
      }
      const [m1, m2] = await Promise.all([loadImage(HD.mask1), loadImage(HD.mask2)]);
      D = { meta: HD.meta, a: arr, mask1: pixels(m1), mask2: pixels(m2) };
      D.nj = HD.meta.joints.length;
      D.jidx = {}; HD.meta.joints.forEach((k, i) => { D.jidx[k] = i; });
      // triangles on positions (for normals and clothing)
      const rv = arr.rvPos, t = arr.tris;
      D.ptri = new Uint32Array(t.length);
      for (let i = 0; i < t.length; i++) D.ptri[i] = rv[t[i]];
      // position adjacency
      const np = HD.meta.np, adj = Array.from({ length: np }, () => new Set());
      for (let i = 0; i < D.ptri.length; i += 3) { const a = D.ptri[i], b = D.ptri[i + 1], c = D.ptri[i + 2]; adj[a].add(b).add(c); adj[b].add(a).add(c); adj[c].add(a).add(b); }
      D.adj = adj.map(s => Int32Array.from(s));
      BD.setFingerLayout(HD.meta.fingers, HD.meta.bindCurl);
      return true;
    })().catch(e => { failed = true; U.warn('human data failed', e && e.message); return false; });
    return loading;
  }
  function ready() { return !!D; }

  // ------------------------------------------------------------ morph (MakeHuman space, rig axes, feet)
  function featureWeights(st, dims) {
    const F = st.F || {};
    const out = {};
    const g = k => (F[k] == null ? 0.5 : F[k]);
    for (const key of ['faceLen', 'jaw', 'chin', 'cheek', 'forehead', 'eyeSize', 'eyeSpace', 'eyeTilt', 'lid', 'browArch', 'noseW', 'noseL', 'noseBridge', 'lipFull', 'mouthW', 'earSize', 'neck']) {
      const v = (g(key) - 0.5) * 2 * 0.85;
      if (v < 0) out[key + '_dec'] = -v; else out[key + '_inc'] = v;
    }
    const musc = U.clamp(st.musc || 0, -0.5, 0.5);
    // (pro athletes: the average player carries more muscle definition than an average fit person)
    out.athlete_inc = U.clamp(1.15 + musc * 0.8, 0.5, 1.5) * (dims.fem ? 0.5 : 1);
    return out;
  }
  function comboWeights(st, dims) {
    const musc = U.clamp(st.musc || 0, -0.5, 0.5);
    const m = U.clamp(0.72 + musc * 0.6, 0, 1);                   // average .. max muscle (most pros near the top)
    const w = U.clamp((dims.bulk - 0.84) / (1.3 - 0.84), 0, 1);     // lean .. heavy
    const wmin = Math.max(0, 1 - w * 2.4), wmax = Math.max(0, w * 2 - 1), wavg = Math.max(0, 1 - wmin - wmax);
    // COMBOS order: avg-min, avg-avg, avg-max, max-min, max-avg, max-max
    return [(1 - m) * wmin, (1 - m) * wavg, (1 - m) * wmax, m * wmin, m * wavg, m * wmax];
  }
  function morph(st, dims) {
    const a = D.a, np = D.meta.np, nj = D.nj;
    const P = new Float64Array(np * 3), Jt = new Float64Array(nj * 3);
    const g = dims.fem ? 'female' : 'male';
    const base = a.base, qb = base.scale;
    for (let i = 0; i < np * 3; i++) P[i] = base[i] * qb;
    for (let i = 0; i < nj * 3; i++) Jt[i] = a.baseJ[i];
    const addDense = (arr, w) => { if (!w) return; const q = arr.scale * w; for (let i = 0; i < np * 3; i++) P[i] += arr[i] * q; };
    const addJ = (arr, w) => { if (!w) return; for (let i = 0; i < nj * 3; i++) Jt[i] += arr[i] * w; };
    addDense(a['g_' + g], 1); addJ(a['gJ_' + g], 1);
    const cw = comboWeights(st, dims);
    cw.forEach((w, ci) => { addDense(a['c_' + g + '_' + ci], w); addJ(a['cJ_' + g + '_' + ci], w); });
    const fw = featureWeights(st, dims);
    for (const key in fw) {
      const w = fw[key]; if (!w || !a['f_' + key + '_i']) continue;
      const idx = a['f_' + key + '_i'], d = a['f_' + key + '_d'], q = d.scale * w;
      for (let k = 0; k < idx.length; k++) { const o = idx[k] * 3; P[o] += d[k * 3] * q; P[o + 1] += d[k * 3 + 1] * q; P[o + 2] += d[k * 3 + 2] * q; }
      addJ(a['fJ_' + key], w);
    }
    return { P, J: Jt };
  }

  // ------------------------------------------------------------ small vector helpers
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const lenv = a => Math.sqrt(dot(a, a));
  const nrmv = a => { const l = lenv(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const crossv = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

  // ------------------------------------------------------------ bind skeleton for a player
  function bindFor(dims) {
    const sk = new RG.Skeleton(dims);
    sk.solve(RG.pose({ both: D.meta.bindPose }), 0, 0, Math.PI / 2);
    const O = new Float64Array(NB * 3), R = new Float64Array(NB * 9), TW = new Float64Array(NB);
    const ex = BD.poseExtras(sk, { tw: [0, 0, 0, 0, 0, 0], curl: [0, 0] });
    BD.boneFrames(sk, ex, O, R, TW);
    // full frames (twist included) for retargeting
    const RF = new Float64Array(NB * 9);
    for (let b = 0; b < NB; b++) {
      if (TW[b]) BD.mulRot(R, b * 9, 2, TW[b], RF, b * 9);
      else for (let k = 0; k < 9; k++) RF[b * 9 + k] = R[b * 9 + k];
    }
    return { sk, O, R, RF, TW, H: dims.H };
  }

  /**
   * Retarget the morphed MakeHuman body onto the bind skeleton: torso as is (scaled to height), the head a little
   * smaller than proportional for tall players, every limb segment rotated / stretched from MakeHuman's joints
   * onto the rig's (a similarity per bone about the rig's joint), blended with the skin weights.
   */
  function retarget(mo, dims, bind) {
    const np = D.meta.np, P = mo.P, Jt = mo.J, jx = D.jidx, H = dims.H;
    let zlo = 1e9, zhi = -1e9;
    for (let i = 0; i < np; i++) { const z = P[i * 3 + 2]; if (z < zlo) zlo = z; if (z > zhi) zhi = z; }
    const s0 = H / (zhi - zlo);
    const jraw = k => { const i = jx[k] * 3; return [Jt[i], Jt[i + 1], Jt[i + 2]]; };
    const hm = [(jraw('hipL')[0] + jraw('hipR')[0]) / 2, (jraw('hipL')[1] + jraw('hipR')[1]) / 2];
    const sk = bind.sk, SP = sk.P;
    const rj = j => [SP[j * 3], SP[j * 3 + 1], SP[j * 3 + 2]];
    const rhm = [(SP[RG.J.L_HIP * 3] + SP[RG.J.R_HIP * 3]) / 2, (SP[RG.J.L_HIP * 3 + 1] + SP[RG.J.R_HIP * 3 + 1]) / 2];
    const al = p => [(p[0] - hm[0]) * s0 + rhm[0], (p[1] - hm[1]) * s0 + rhm[1], (p[2] - zlo) * s0];
    const AJ = k => al(jraw(k));
    const O = bind.O, RF = bind.RF;
    const ob = b => [O[b * 3], O[b * 3 + 1], O[b * 3 + 2]];
    // per-bone map: v' = O + RF * S * F^T (v - A)
    const maps = new Array(NB).fill(null);
    const mkMap = (b, A, C, Dp, Op) => {
      const zc = nrmv(sub(A, C)); // local +z points back toward the parent (bones run along -z)
      const r = b * 9;
      let y = [RF[r + 1], RF[r + 4], RF[r + 7]];
      const d = dot(y, zc); y = nrmv([y[0] - d * zc[0], y[1] - d * zc[1], y[2] - d * zc[2]]);
      const x = crossv(y, zc);
      const k = lenv(sub(Dp, Op)) / (lenv(sub(C, A)) || 1);
      maps[b] = { A, O: Op, F: [x, y, zc], k, rf: r };
    };
    const HED = B.HED;
    const Hm = H / (zhi - zlo) / s0; void Hm;
    const kHead = Math.pow(H / 5.75, -0.55); // heads grow much less than stature (ANSUR tall group: +2% head length)
    const headA = AJ('head');
    for (const side of [0, 1]) {
      const s = side ? 'R' : 'L';
      const J = RG.J;
      const UA = side ? B.R_UA : B.L_UA, FA = side ? B.R_FA : B.L_FA, HD = side ? B.R_HD : B.L_HD;
      const TH = side ? B.R_TH : B.L_TH, SH = side ? B.R_SH : B.L_SH, FT = side ? B.R_FT : B.L_FT, TOE = side ? B.R_TOE : B.L_TOE;
      mkMap(UA, ob(UA), AJ('el' + s), rj(side ? J.R_EL : J.L_EL), ob(UA));
      mkMap(FA, AJ('el' + s), AJ('wr' + s), rj(side ? J.R_WR : J.L_WR), ob(FA));
      const fb = side ? B.R_FNG : B.L_FNG;
      mkMap(HD, AJ('wr' + s), AJ('f31' + s), ob(fb + 2), ob(HD));
      // fingers: index, middle, ring, pinky, thumb (MakeHuman 2, 3, 4, 5, 1)
      [2, 3, 4, 5, 1].forEach((f, i) => {
        const b1 = fb + i * 2, b2 = b1 + 1;
        const tipO = ob(b2), r2 = b2 * 9, l2 = lenv(sub(AJ('f' + f + 't' + s), AJ('f' + f + '2' + s))) * (lenv(sub(ob(b2), ob(b1))) / (lenv(sub(AJ('f' + f + '2' + s), AJ('f' + f + '1' + s))) || 1));
        const tip = [tipO[0] - RF[r2 + 2] * l2, tipO[1] - RF[r2 + 5] * l2, tipO[2] - RF[r2 + 8] * l2];
        mkMap(b1, AJ('f' + f + '1' + s), AJ('f' + f + '2' + s), ob(b2), ob(b1));
        mkMap(b2, AJ('f' + f + '2' + s), AJ('f' + f + 't' + s), tip, ob(b2));
      });
      mkMap(TH, ob(TH), AJ('knee' + s), rj(side ? J.R_KN : J.L_KN), ob(TH));
      mkMap(SH, AJ('knee' + s), AJ('ankle' + s), rj(side ? J.R_AN : J.L_AN), ob(SH));
      mkMap(FT, AJ('ankle' + s), AJ('ball' + s), rj(side ? J.R_BALL : J.L_BALL), ob(FT));
      mkMap(TOE, AJ('ball' + s), AJ('toe' + s), rj(side ? J.R_TOE : J.L_TOE), ob(TOE));
    }
    const out = new Float64Array(np * 3);
    const wb = D.a.wb, ww = D.a.ww;
    const v = [0, 0, 0];
    for (let i = 0; i < np; i++) {
      const p = al([P[i * 3], P[i * 3 + 1], P[i * 3 + 2]]);
      let x = 0, y = 0, z = 0;
      for (let k = 0; k < 4; k++) {
        const w = ww[i * 4 + k] / 255; if (!w) continue;
        const b = wb[i * 4 + k];
        const m = maps[b];
        if (m) {
          const dx = p[0] - m.A[0], dy = p[1] - m.A[1], dz = p[2] - m.A[2];
          const lx = m.F[0][0] * dx + m.F[0][1] * dy + m.F[0][2] * dz;
          const ly = m.F[1][0] * dx + m.F[1][1] * dy + m.F[1][2] * dz;
          const lz = (m.F[2][0] * dx + m.F[2][1] * dy + m.F[2][2] * dz) * m.k;
          const r = m.rf;
          v[0] = m.O[0] + RF[r] * lx + RF[r + 1] * ly + RF[r + 2] * lz;
          v[1] = m.O[1] + RF[r + 3] * lx + RF[r + 4] * ly + RF[r + 5] * lz;
          v[2] = m.O[2] + RF[r + 6] * lx + RF[r + 7] * ly + RF[r + 8] * lz;
        } else if (b === HED) {
          v[0] = headA[0] + (p[0] - headA[0]) * kHead; v[1] = headA[1] + (p[1] - headA[1]) * kHead; v[2] = headA[2] + (p[2] - headA[2]) * kHead;
        } else { v[0] = p[0]; v[1] = p[1]; v[2] = p[2]; }
        x += v[0] * w; y += v[1] * w; z += v[2] * w;
      }
      out[i * 3] = x; out[i * 3 + 1] = y; out[i * 3 + 2] = z;
    }
    const headMap = p => [headA[0] + (p[0] - headA[0]) * kHead, headA[1] + (p[1] - headA[1]) * kHead, headA[2] + (p[2] - headA[2]) * kHead];
    const eyes = ['eyeL', 'eyeR'].map(k => headMap(AJ(k)));
    return { pos: out, eyes, headA, kHead, s0, AJ };
  }

  function normals(pos, tri, n) {
    const N = new Float64Array(n * 3);
    for (let t = 0; t < tri.length; t += 3) {
      const a = tri[t] * 3, b = tri[t + 1] * 3, c = tri[t + 2] * 3;
      const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
      const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (const o of [a, b, c]) { N[o] += nx; N[o + 1] += ny; N[o + 2] += nz; }
    }
    for (let i = 0; i < n; i++) { const l = Math.hypot(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]) || 1; N[i * 3] /= l; N[i * 3 + 1] /= l; N[i * 3 + 2] /= l; }
    return N;
  }

  M.Human = { load, ready, morph, bindFor, retarget, normals, featureWeights, comboWeights, get data() { return D; }, get failed() { return failed; } };
})();
