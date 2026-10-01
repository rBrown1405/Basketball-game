/* Pro BBALL Coach: match view: hair that moves (PBC.Match.Hair).
 * Longer hair (ponytails, long hair, braids, locs, twists, bobs) hangs from the head as a few guide strands, chains of
 * knots simulated every drawn frame the way games do it (AMD's TressFX; Müller et al. 2012, "Fast Simulation of
 * Inextensible Hair and Fur"):
 *   - Verlet integration with gravity, a little air drag, and a damping of the swing measured against the head's own
 *     motion (so a sprint does not blow the hair back like a gale, but a swing dies out);
 *   - the global shape: each knot pulled toward where the style puts it on the head, strongly at the root and hardly
 *     at the tip (a ponytail keeps its tie and swings below it);
 *   - the local shape: each segment eased toward its rest angle to the one above it (a braid bends as a braid, not
 *     as a rope);
 *   - follow-the-leader: every segment set back to its length from the root down, with the velocity correction that
 *     damps its artefacts (one pass, exact length);
 *   - collisions with the head, the neck, the upper back and shoulders, and the upper arms.
 * The root rides on the head, so the hair lags a sprint's start, swings through a crossover and a spin, lifts on a
 * jump, bounces with every stride and settles when the player stops. A jump in time or place (a replay starting, a
 * scrub, a player placed somewhere else) starts it again at rest.
 * The 3D players (gl3d.js) skin their strands to the guides the mesh builds (human_build.js); the 2D figures
 * (figure.js) draw their hanging hair from guides of their own (flatGuides). Every number is in Hair.CFG. */
(function () {
  'use strict';
  const M = window.PBC.Match, U = M.U, RG = M.Rig, J = RG.J, F = RG.F;
  const CM = 0.0328084;   // feet per centimetre

  const CFG = {
    on: true,                // false: the hair hangs as the style shapes it, still
    gravity: 32.2,           // ft/s²
    sub: 1 / 60,             // s: the longest substep
    relMax: 0.16,            // ft: and short enough that no knot moves more than this against the head in one, nor an
                             // elbow (a hard stop carried the hair through the neck and the back in one 1/60 s step;
                             // under half the thinnest collider, the neck's and an arm's ~12 cm, a knot never passes
                             // a collider's middle and is pushed back out the side it came in by)
    maxSub: 12,              // substeps a frame at most (faster play or a harder stop is stepped coarser)
    passes: 2,               // collisions then lengths, this many times a substep (the collisions last)
    maxDt: 0.25,             // s: a longer gap between two frames drawn (a pause, a replay) starts the hair at rest
    jumpFt: [1.5, 30],       // the head moving further than [ft, + ft/s of the frame's time] between two frames drawn
                             // is a teleport (a replay, a scrub, a player placed): the hair starts again at rest
    drag: 0.004,             // air drag: world velocity lost a 1/60 s step (6 m/s of running bends a ponytail ~7 deg)
    // per style (stiffness and damping are per 1/60 s step): guides (3D: strands simulated, the rest follow the
    // nearest two), global [root, tip] and how far down (share of the length) the root's stiffness reaches, local
    // (segment angles), damp (the swing), ftl (follow-the-leader velocity correction), r (a guide's collision radius,
    // cm), and for the 2D figures: the length (cm, women's / men's), where the roots sit (azimuths from the back of
    // the head, deg; height on the head, share of its radius), how much the hair falls back from the head and how
    // wide a strand is drawn at its root (w, share of the head's radius)
    styles: {
      ponytail: { guides: 1, global: [0.55, 0.012], reach: 0.3, local: 0.4, damp: 0.06, ftl: 0.9, r: 2.2, len: [28, 24], az: [0], el: 0.28, back: 0.8, w: 0.55 },
      long: { guides: 10, global: [0.5, 0.03], reach: 0.35, local: 0.45, damp: 0.09, ftl: 0.9, r: 1.2, len: [34, 30], az: [-105, -70, -35, 0, 35, 70, 105], el: 0.18, back: 0.6, w: 1.1 },
      braids: { guides: 10, global: [0.45, 0.02], reach: 0.3, local: 0.55, damp: 0.09, ftl: 0.9, r: 0.9, len: [32, 22], az: [-130, -95, -60, -25, 25, 60, 95, 130], el: 0.22, back: 1, w: 0.22 },
      locs: { guides: 10, global: [0.45, 0.02], reach: 0.3, local: 0.6, damp: 0.1, ftl: 0.9, r: 1.0, len: [30, 20], az: [-130, -95, -60, -25, 25, 60, 95, 130], el: 0.22, back: 1, w: 0.3 },
      twists: { guides: 8, global: [0.55, 0.08], reach: 0.45, local: 0.5, damp: 0.08, ftl: 0.9, r: 0.9, len: [16, 13], az: [-120, -80, -40, 0, 40, 80, 120], el: 0.25, back: 1, w: 0.28 },
      bob: { guides: 8, global: [0.7, 0.2], reach: 0.6, local: 0.5, damp: 0.1, ftl: 0.9, r: 1.2, len: [13, 12], az: [-120, -80, -40, 0, 40, 80, 120], el: 0.1, back: 0.4, w: 1.0 },
    },
    knots: 8,                // knots a 2D guide
    meshKnots: 10,           // knots a 3D guide (the mesh's strands have ten points: gl3d.js sizes its bones by it)
    // the body the hair falls on (the 2D figures; the 3D players measure their own from the mesh), shares of the
    // player's height: the neck's radius, the upper torso as a box on the chest (half its width, how far its back and
    // front are from the chest joint, its top above it and its bottom below, how round its edges are), the upper arms'
    // radius
    body: { neck: 0.028, torsoW: 0.125, torsoBack: 0.062, torsoFront: 0.07, torsoTop: 0.082, torsoBottom: 0.16, torsoRound: 0.04, arm: 0.026 },
    headSlack: 0.004,        // ft: the head's collision sphere sits this far inside the lowest knot at rest
  };

  // ------------------------------------------------------------ small vector helpers (flat arrays)
  const TMP = new Float64Array(9);
  /** out = the minimal rotation taking unit a to unit b, applied to v (Rodrigues); returns false when a and b oppose */
  function rotMin(ax, ay, az, bx, by, bz, v, vo, out, oo) {
    const c = ax * bx + ay * by + az * bz;
    const vx = v[vo], vy = v[vo + 1], vz = v[vo + 2];
    if (c < -0.999) { out[oo] = vx; out[oo + 1] = vy; out[oo + 2] = vz; return false; }
    const kx = ay * bz - az * by, ky = az * bx - ax * bz, kz = ax * by - ay * bx;   // a x b
    const kv = kx * vx + ky * vy + kz * vz, f = 1 / (1 + c);
    out[oo] = vx * c + (ky * vz - kz * vy) + kx * kv * f;
    out[oo + 1] = vy * c + (kz * vx - kx * vz) + ky * kv * f;
    out[oo + 2] = vz * c + (kx * vy - ky * vx) + kz * kv * f;
    return true;
  }
  /** the 3x3 minimal rotation taking unit a to unit b (row-major) */
  function rotMat(ax, ay, az, bx, by, bz, m, o) {
    const c = ax * bx + ay * by + az * bz;
    if (c < -0.999) { m[o] = 1; m[o + 1] = 0; m[o + 2] = 0; m[o + 3] = 0; m[o + 4] = 1; m[o + 5] = 0; m[o + 6] = 0; m[o + 7] = 0; m[o + 8] = 1; return; }
    const kx = ay * bz - az * by, ky = az * bx - ax * bz, kz = ax * by - ay * bx, f = 1 / (1 + c);
    m[o] = c + kx * kx * f; m[o + 1] = -kz + kx * ky * f; m[o + 2] = ky + kx * kz * f;
    m[o + 3] = kz + ky * kx * f; m[o + 4] = c + ky * ky * f; m[o + 5] = -kx + ky * kz * f;
    m[o + 6] = -ky + kz * kx * f; m[o + 7] = kx + kz * ky * f; m[o + 8] = c + kz * kz * f;
  }

  // ------------------------------------------------------------ guides
  /** the style's settings, or null when it has no hair that hangs */
  function styleOf(st) { return st && CFG.styles[st.hair] ? CFG.styles[st.hair] : null; }

  /**
   * Make a guide set from rest knots in head-local feet (from the head joint, the head frame's axes: x right, y the
   * face's way, z up): gd = { style, G, K, local, seg, sg, spheres: the skull's and the face's [cx, cy, cz, r]
   * (head-local), body }.
   */
  function guideSet(style, G, K, local, head, body, face) {
    const S = CFG.styles[style];
    const seg = new Float64Array(G * K), sg = new Float64Array(K);
    for (let g = 0; g < G; g++) for (let k = 1; k < K; k++) {
      const a = (g * K + k - 1) * 3, b = (g * K + k) * 3;
      seg[g * K + k] = Math.hypot(local[b] - local[a], local[b + 1] - local[a + 1], local[b + 2] - local[a + 2]);
    }
    for (let k = 0; k < K; k++) { const t = k / (K - 1); sg[k] = S.global[1] + (S.global[0] - S.global[1]) * (1 - U.smooth(t / S.reach)); }
    // the head's collision spheres (for the knots' centres: the head and a guide's radius) never reach a knot at rest
    // (the scalp is no sphere: the strands start on it)
    const rad = S.r * CM;
    const fit = (sp) => {
      let r = sp[3] + rad;
      for (let g = 0; g < G; g++) for (let k = 1; k < K; k++) {
        const o = (g * K + k) * 3;
        r = Math.min(r, Math.hypot(local[o] - sp[0], local[o + 1] - sp[1], local[o + 2] - sp[2]) - CFG.headSlack);
      }
      return [sp[0], sp[1], sp[2], Math.max(0.03, r)];
    };
    const spheres = [fit(head)];
    if (face) spheres.push(fit(face));
    return { style, S, G, K, local, seg, sg, head: spheres[0], spheres, body, rad };
  }

  /** a 2D figure's face and jaw as a sphere (head-local), from its skull's: forward and down, smaller */
  function faceOf(hc, R) { return [hc[0], hc[1] + 0.45 * R, hc[2] - 0.55 * R, 0.62 * R]; }
  const flatCache = new Map();
  /** guides for a person drawn as a 2D figure (no mesh), from the style and the body's dimensions: they fall from
   *  the head and lie over a standing body (the rig's zero pose) */
  function flatGuides(st, dims) {
    const S = styleOf(st);
    if (!S || !dims) return null;
    const key = st.hair + '|' + (st.fem ? 1 : 0) + '|' + dims.H.toFixed(3) + '|' + dims.headR.toFixed(4);
    let gd = flatCache.get(key);
    if (gd) return gd;
    const K = CFG.knots, az = S.az, G = az.length;
    const R = dims.headR, hc = [0, dims.hdFwd || 0, dims.hdC || 0];
    const len = (st.fem ? S.len[0] : S.len[1]) * CM, seg = len / (K - 1);
    const local = new Float64Array(G * K * 3);
    const gx = 0, gy = -0.3 * S.back, gz = -1;
    // the standing body the rest shape drapes over
    const sk0 = new RG.Skeleton(dims);
    sk0.solve(RG.pose({}), 0, 0, Math.PI / 2);
    const C0 = bodyColliders(sk0, null, newColliders());
    const P0 = sk0.P, R0 = sk0.R, hb = F.HED * 9, oh = J.HJ * 3, w = new Float64Array(3);
    const drape = (p) => {
      w[0] = P0[oh] + R0[hb] * p[0] + R0[hb + 1] * p[1] + R0[hb + 2] * p[2];
      w[1] = P0[oh + 1] + R0[hb + 3] * p[0] + R0[hb + 4] * p[1] + R0[hb + 5] * p[2];
      w[2] = P0[oh + 2] + R0[hb + 6] * p[0] + R0[hb + 7] * p[1] + R0[hb + 8] * p[2];
      if (!pushBody(C0, w, 0, S.r * CM * 1.3)) return;
      const dx = w[0] - P0[oh], dy = w[1] - P0[oh + 1], dz = w[2] - P0[oh + 2];
      p[0] = R0[hb] * dx + R0[hb + 3] * dy + R0[hb + 6] * dz; p[1] = R0[hb + 1] * dx + R0[hb + 4] * dy + R0[hb + 7] * dz; p[2] = R0[hb + 2] * dx + R0[hb + 5] * dy + R0[hb + 8] * dz;
    };
    const pp = [0, 0, 0];
    for (let g = 0; g < G; g++) {
      // the root on the head, round the back from the azimuth (0 = straight back), a little above the centre
      const a = az[g] * U.DEG, el = Math.asin(U.clamp(S.el, -0.9, 0.9));
      const nx = Math.sin(a) * Math.cos(el), ny = -Math.cos(a) * Math.cos(el), nz = Math.sin(el);
      let px = hc[0] + nx * R * 0.97, py = hc[1] + ny * R * 0.97, pz = hc[2] + nz * R * 0.97;
      // first along the head (gravity on its surface), then hanging, pushed off the head
      const gn = gx * nx + gy * ny + gz * nz;
      let dx = gx - gn * nx + nx * 0.15, dy = gy - gn * ny + ny * 0.15, dz = gz - gn * nz + nz * 0.15;
      for (let k = 0; k < K; k++) {
        const o = (g * K + k) * 3;
        local[o] = px; local[o + 1] = py; local[o + 2] = pz;
        dx = dx * 0.8 + gx * 0.2; dy = dy * 0.8 + gy * 0.2; dz = dz * 0.8 + gz * 0.2;
        const dl = Math.hypot(dx, dy, dz) || 1; dx /= dl; dy /= dl; dz /= dl;
        const qx = px, qy = py, qz = pz;
        px += dx * seg; py += dy * seg; pz += dz * seg;
        const ox = px - hc[0], oy = py - hc[1], oz = pz - hc[2], od = Math.hypot(ox, oy, oz) || 1, rr = R * 1.06;
        if (od < rr) { px = hc[0] + ox / od * rr; py = hc[1] + oy / od * rr; pz = hc[2] + oz / od * rr; }
        pp[0] = px; pp[1] = py; pp[2] = pz; drape(pp);
        // (a push off the body bends the strand there: carry on from where it lies, at the segment's length)
        let ex = pp[0] - qx, ey = pp[1] - qy, ez = pp[2] - qz;
        const el2 = Math.hypot(ex, ey, ez) || 1;
        ex /= el2; ey /= el2; ez /= el2;
        px = qx + ex * seg; py = qy + ey * seg; pz = qz + ez * seg;
        dx = ex; dy = ey; dz = ez;
      }
      // then laid over the standing body for good (in its space, back to head-local)
      const pts = [];
      for (let k = 0; k < K; k++) {
        const o = (g * K + k) * 3, x = local[o], y = local[o + 1], z = local[o + 2];
        pts.push([P0[oh] + R0[hb] * x + R0[hb + 1] * y + R0[hb + 2] * z, P0[oh + 1] + R0[hb + 3] * x + R0[hb + 4] * y + R0[hb + 5] * z, P0[oh + 2] + R0[hb + 6] * x + R0[hb + 7] * y + R0[hb + 8] * z]);
      }
      const wS = (c, r) => [P0[oh] + R0[hb] * c[0] + R0[hb + 1] * c[1] + R0[hb + 2] * c[2], P0[oh + 1] + R0[hb + 3] * c[0] + R0[hb + 4] * c[1] + R0[hb + 5] * c[2], P0[oh + 2] + R0[hb + 6] * c[0] + R0[hb + 7] * c[1] + R0[hb + 8] * c[2], r];
      const fc = faceOf(hc, R);
      relax(C0, pts, S.r * CM, [wS(hc, R * 1.02), wS(fc, fc[3])], 16);
      for (let k = 0; k < K; k++) {
        const o = (g * K + k) * 3, dx2 = pts[k][0] - P0[oh], dy2 = pts[k][1] - P0[oh + 1], dz2 = pts[k][2] - P0[oh + 2];
        local[o] = R0[hb] * dx2 + R0[hb + 3] * dy2 + R0[hb + 6] * dz2; local[o + 1] = R0[hb + 1] * dx2 + R0[hb + 4] * dy2 + R0[hb + 7] * dz2; local[o + 2] = R0[hb + 2] * dx2 + R0[hb + 5] * dy2 + R0[hb + 8] * dz2;
      }
    }
    gd = guideSet(st.hair, G, K, local, [hc[0], hc[1], hc[2], R], null, faceOf(hc, R));
    gd.flat = true;
    flatCache.set(key, gd);
    return gd;
  }

  // ------------------------------------------------------------ the body the hair falls on
  // the joints the hair meets, copied into C.j in this order: the head joint and the neck (the neck's capsule), each
  // shoulder and elbow (the upper arms')
  const JI = [J.HJ, J.NCK, J.L_SH, J.L_EL, J.R_SH, J.R_EL];
  function newColliders() { return { sph: new Float64Array(8), ns: 0, o: new Float64Array(3), rot: new Float64Array(9), box: new Float64Array(6), j: new Float64Array(JI.length * 3), neckR: 0, armR: 0 }; }
  /** the body's colliders in world feet for a skeleton: the neck and upper arm capsules, the torso box on the chest
   *  (body: the mesh's own measures in feet, or null for CFG.body's shares of the height) */
  function bodyColliders(sk, body, C) {
    const P = sk.P, R = sk.R, B = body || CFG.body, k = body ? 1 : sk.dims.H, cb = F.CHS * 9;
    C.neckR = B.neck * k;
    C.armR = B.arm * k;
    C.box[0] = B.torsoW * k; C.box[1] = B.torsoBack * k; C.box[2] = B.torsoFront * k; C.box[3] = B.torsoTop * k; C.box[4] = B.torsoBottom * k;
    C.box[5] = Math.min(B.torsoRound * k, C.box[1], C.box[3]);
    for (let i = 0; i < 9; i++) C.rot[i] = R[cb + i];
    const oc = J.CHS * 3; C.o[0] = P[oc]; C.o[1] = P[oc + 1]; C.o[2] = P[oc + 2];
    for (let i = 0; i < JI.length; i++) { const a = JI[i] * 3; C.j[i * 3] = P[a]; C.j[i * 3 + 1] = P[a + 1]; C.j[i * 3 + 2] = P[a + 2]; }
    return C;
  }
  /** all the colliders for this frame: the body's and the head's spheres (skull, face; from the head frame) */
  function colliders(sk, gd, C) {
    const P = sk.P, R = sk.R, hb = F.HED * 9, oh = J.HJ * 3, sp = gd.spheres;
    C.ns = sp.length;
    for (let q = 0; q < sp.length; q++) {
      const hd = sp[q], o = q * 4;
      C.sph[o] = P[oh] + R[hb] * hd[0] + R[hb + 1] * hd[1] + R[hb + 2] * hd[2];
      C.sph[o + 1] = P[oh + 1] + R[hb + 3] * hd[0] + R[hb + 4] * hd[1] + R[hb + 5] * hd[2];
      C.sph[o + 2] = P[oh + 2] + R[hb + 6] * hd[0] + R[hb + 7] * hd[1] + R[hb + 8] * hd[2];
      C.sph[o + 3] = hd[3];
    }
    return bodyColliders(sk, gd.body, C);
  }
  function copyColliders(A, C) {
    C.sph.set(A.sph); C.ns = A.ns; C.o.set(A.o); C.rot.set(A.rot); C.box.set(A.box); C.j.set(A.j); C.neckR = A.neckR; C.armR = A.armR;
    return C;
  }
  /** C = the colliders f of the way from A to B (a substep between two frames drawn: the body moves through the
   *  frame with the hair, not a whole frame ahead of it) */
  function lerpColliders(A, B, f, C) {
    for (let i = 0; i < C.j.length; i++) C.j[i] = A.j[i] + (B.j[i] - A.j[i]) * f;
    for (let i = 0; i < 3; i++) C.o[i] = A.o[i] + (B.o[i] - A.o[i]) * f;
    for (let i = 0; i < 8; i++) C.sph[i] = (i & 3) === 3 ? B.sph[i] : A.sph[i] + (B.sph[i] - A.sph[i]) * f;
    C.ns = B.ns; C.box.set(B.box); C.neckR = B.neckR; C.armR = B.armR;
    // the chest's axes blended, then square again (x, y square to it, z = x cross y)
    const r = C.rot, a = A.rot, b = B.rot;
    for (let i = 0; i < 9; i++) r[i] = a[i] + (b[i] - a[i]) * f;
    const l0 = Math.hypot(r[0], r[3], r[6]) || 1; r[0] /= l0; r[3] /= l0; r[6] /= l0;
    const d = r[1] * r[0] + r[4] * r[3] + r[7] * r[6]; r[1] -= d * r[0]; r[4] -= d * r[3]; r[7] -= d * r[6];
    const l1 = Math.hypot(r[1], r[4], r[7]) || 1; r[1] /= l1; r[4] /= l1; r[7] /= l1;
    r[2] = r[3] * r[7] - r[6] * r[4]; r[5] = r[6] * r[1] - r[0] * r[7]; r[8] = r[0] * r[4] - r[3] * r[1];
    return C;
  }
  const NB = new Float64Array(3), NB2 = new Float64Array(3);
  /** push a world point (X at o) out of the body: neck, upper arms, upper torso; true if it moved */
  function pushBody(C, X, o, rad, n) {
    n = n || NB2;
    let moved = false;
    if (outCapsule(X, o, C.j, 0, 3, C.neckR + rad, n)) moved = true;
    if (outArm(X, o, C.j, 6, 9, C.armR + rad, n)) moved = true;
    if (outArm(X, o, C.j, 12, 15, C.armR + rad, n)) moved = true;
    if (outBox(X, o, C, rad, n)) moved = true;
    return moved;
  }
  /** an upper arm from a quarter of the way down (the shoulder itself is the torso's: two colliders there fought) */
  const ARM = new Float64Array(6);
  function outArm(X, o, P, a, b, r, n) {
    ARM[0] = P[a] + (P[b] - P[a]) * 0.25; ARM[1] = P[a + 1] + (P[b + 1] - P[a + 1]) * 0.25; ARM[2] = P[a + 2] + (P[b + 2] - P[a + 2]) * 0.25;
    ARM[3] = P[b]; ARM[4] = P[b + 1]; ARM[5] = P[b + 2];
    return outCapsule(X, o, ARM, 0, 3, r, n);
  }
  /** push a knot out of a sphere; returns the push's normal in n (and true) or false */
  function outSphere(X, o, cx, cy, cz, r, n) {
    const dx = X[o] - cx, dy = X[o + 1] - cy, dz = X[o + 2] - cz, d2 = dx * dx + dy * dy + dz * dz;
    if (d2 >= r * r) return false;
    const d = Math.sqrt(d2) || 1e-6;
    n[0] = dx / d; n[1] = dy / d; n[2] = dz / d;
    X[o] = cx + n[0] * r; X[o + 1] = cy + n[1] * r; X[o + 2] = cz + n[2] * r;
    return true;
  }
  function outCapsule(X, o, P, a, b, r, n) {
    const ax = P[a], ay = P[a + 1], az = P[a + 2], ex = P[b] - ax, ey = P[b + 1] - ay, ez = P[b + 2] - az;
    const L2 = ex * ex + ey * ey + ez * ez || 1e-9;
    let t = ((X[o] - ax) * ex + (X[o + 1] - ay) * ey + (X[o + 2] - az) * ez) / L2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return outSphere(X, o, ax + ex * t, ay + ey * t, az + ez * t, r, n);
  }
  /** the torso on the chest frame, a box with rounded edges (the shoulders and the upper back are round): a knot
   *  closer to its inner box than the rounding leaves along the way from its nearest point */
  function outBox(X, o, C, pr, n) {
    const Rm = C.rot, bx = C.box, rc = C.box[5] || 0;
    const dx = X[o] - C.o[0], dy = X[o + 1] - C.o[1], dz = X[o + 2] - C.o[2];
    // (the frame's columns are its axes: local = R^T d)
    const lx = Rm[0] * dx + Rm[3] * dy + Rm[6] * dz, ly = Rm[1] * dx + Rm[4] * dy + Rm[7] * dz, lz = Rm[2] * dx + Rm[5] * dy + Rm[8] * dz;
    // the inner box: the box less the rounding
    const x0 = -bx[0] + rc, x1 = bx[0] - rc, y0 = -bx[1] + rc, y1 = bx[2] - rc, z0 = -bx[4] + rc, z1 = bx[3] - rc;
    const R = rc + pr;
    let ex = lx < x0 ? lx - x0 : lx > x1 ? lx - x1 : 0, ey = ly < y0 ? ly - y0 : ly > y1 ? ly - y1 : 0, ez = lz < z0 ? lz - z0 : lz > z1 ? lz - z1 : 0;
    const d2 = ex * ex + ey * ey + ez * ez;
    if (d2 >= R * R) return false;
    const d = Math.sqrt(d2);
    let push;
    if (d > 1e-6) { ex /= d; ey /= d; ez /= d; push = R - d; }
    else {
      // inside the inner box: out by its nearest face (the back, the top, a side or, for hair over a shoulder, the front)
      push = ly - y0; ex = 0; ey = -1; ez = 0;
      if (z1 - lz < push) { push = z1 - lz; ex = 0; ey = 0; ez = 1; }
      if (x1 - lx < push) { push = x1 - lx; ex = 1; ey = 0; ez = 0; }
      if (lx - x0 < push) { push = lx - x0; ex = -1; ey = 0; ez = 0; }
      if (y1 - ly < push) { push = y1 - ly; ex = 0; ey = 1; ez = 0; }
      push += R;
    }
    // back to world: R * local
    const wx = Rm[0] * ex + Rm[1] * ey + Rm[2] * ez, wy = Rm[3] * ex + Rm[4] * ey + Rm[5] * ez, wz = Rm[6] * ex + Rm[7] * ey + Rm[8] * ez;
    X[o] += wx * push; X[o + 1] += wy * push; X[o + 2] += wz * push;
    n[0] = wx; n[1] = wy; n[2] = wz;
    return true;
  }

  /**
   * Lay a hanging strand over a body at rest: pts, a polyline in the skeleton's space (its root first), is pushed out
   * of the body's colliders C (and the head's spheres hs, [[x, y, z, r], ...], if given) and its segments set back to
   * their lengths, a few times over, so a rest shape never starts inside the player (the simulation would fight it).
   */
  function relax(C, pts, rad, hs, iters) {
    const n = pts.length, L = new Float64Array(n), X = new Float64Array(n * 3), nrm = NB;
    for (let i = 0; i < n; i++) { X[i * 3] = pts[i][0]; X[i * 3 + 1] = pts[i][1]; X[i * 3 + 2] = pts[i][2]; }
    for (let i = 1; i < n; i++) L[i] = Math.hypot(X[i * 3] - X[i * 3 - 3], X[i * 3 + 1] - X[i * 3 - 2], X[i * 3 + 2] - X[i * 3 - 1]);
    for (let it = 0; it < (iters || 12); it++) {
      let moved = false;
      for (let i = 1; i < n; i++) {
        if (hs) for (const h of hs) if (outSphere(X, i * 3, h[0], h[1], h[2], h[3] + rad, nrm)) moved = true;
        if (pushBody(C, X, i * 3, rad * 1.2, nrm)) moved = true;
      }
      for (let i = 1; i < n; i++) {
        const o = i * 3, a = o - 3, dx = X[o] - X[a], dy = X[o + 1] - X[a + 1], dz = X[o + 2] - X[a + 2], d = Math.hypot(dx, dy, dz) || 1e-9;
        X[o] = X[a] + dx / d * L[i]; X[o + 1] = X[a + 1] + dy / d * L[i]; X[o + 2] = X[a + 2] + dz / d * L[i];
      }
      if (!moved) break;
    }
    for (let i = 0; i < n; i++) { pts[i][0] = X[i * 3]; pts[i][1] = X[i * 3 + 1]; pts[i][2] = X[i * 3 + 2]; }
    return pts;
  }

  // ------------------------------------------------------------ simulation
  const states = new WeakMap();   // key (the actor) -> state
  function newState(gd) {
    const n = gd.G * gd.K * 3;
    return {
      gd, t: null, X: new Float64Array(n), Xp: new Float64Array(n), W: new Float64Array(n), Wp: new Float64Array(n), Wi: new Float64Array(n),
      corr: new Float64Array(gd.K * 3), goal: new Float64Array(3), q: { h: -1, sg: new Float64Array(gd.K) },
      C0: newColliders(), C1: newColliders(), C: newColliders(),   // the last frame's colliders, this one's, a substep's
      hO: new Float64Array(3), hR: new Float64Array(9), h: CFG.sub, dt: CFG.sub, resets: 0, steps: 0,
    };
  }
  /** the rest pose in world feet: the head frame applied to the guides' head-local knots */
  function restWorld(sk, gd, W, hO, hR) {
    const P = sk.P, R = sk.R, hb = F.HED * 9, oh = J.HJ * 3, L = gd.local;
    hO[0] = P[oh]; hO[1] = P[oh + 1]; hO[2] = P[oh + 2];
    for (let i = 0; i < 9; i++) hR[i] = R[hb + i];
    for (let i = 0; i < L.length; i += 3) {
      const x = L[i], y = L[i + 1], z = L[i + 2];
      W[i] = hO[0] + hR[0] * x + hR[1] * y + hR[2] * z;
      W[i + 1] = hO[1] + hR[3] * x + hR[4] * y + hR[5] * z;
      W[i + 2] = hO[2] + hR[6] * x + hR[7] * y + hR[8] * z;
    }
  }

  const NV = new Float64Array(3);
  /** the stiffnesses and damping for a substep of h s (each is set per 1/60 s step) */
  function rates(s, h) {
    const S = s.gd.S, kStep = h / CFG.sub, q = s.q;
    q.keep = Math.pow(1 - S.damp, kStep);                 // the swing kept
    q.air = Math.pow(1 - CFG.drag, kStep);                // the velocity kept against the air
    q.loc = 1 - Math.pow(1 - S.local, kStep);
    q.gz = CFG.gravity * h * h;
    for (let k = 0; k < s.gd.K; k++) q.sg[k] = 1 - Math.pow(1 - s.gd.sg[k], kStep);
    q.h = h;
  }
  function substep(s, h, f) {
    const gd = s.gd, S = gd.S, G = gd.G, K = gd.K, X = s.X, Xp = s.Xp, W = s.W, Wp = s.Wp, Wi = s.Wi;
    const C = lerpColliders(s.C0, s.C1, f, s.C);
    if (s.q.h !== h) rates(s, h);
    const q = s.q, keep = q.keep, air = q.air, loc = q.loc, gz = q.gz, sgk = q.sg;
    const rad = gd.rad, n = NV;
    // the rest pose at this substep, between the last frame's and this one's
    for (let i = 0; i < W.length; i++) Wi[i] = Wp[i] + (W[i] - Wp[i]) * f;
    const kr = h / Math.max(1e-6, s.dt);   // (its motion over one substep: this share of the frame's)
    for (let g = 0; g < G; g++) {
      const g0 = g * K;
      // the root rides on the head
      { const o = g0 * 3; X[o] = Wi[o]; X[o + 1] = Wi[o + 1]; X[o + 2] = Wi[o + 2]; Xp[o] = X[o]; Xp[o + 1] = X[o + 1]; Xp[o + 2] = X[o + 2]; }
      // Verlet: the swing against the head's own motion is damped, a little air drag, gravity
      for (let k = 1; k < K; k++) {
        const o = (g0 + k) * 3;
        for (let c = 0; c < 3; c++) {
          const rv = (W[o + c] - Wp[o + c]) * kr;   // the rest pose's own motion this substep
          const v = (rv + (X[o + c] - Xp[o + c] - rv) * keep) * air;
          Xp[o + c] = X[o + c];
          X[o + c] += v;
        }
        X[o + 2] -= gz;
      }
      // the global shape: toward the style's place on the head
      for (let k = 1; k < K; k++) {
        const o = (g0 + k) * 3, sg = sgk[k];
        X[o] += (Wi[o] - X[o]) * sg; X[o + 1] += (Wi[o + 1] - X[o + 1]) * sg; X[o + 2] += (Wi[o + 2] - X[o + 2]) * sg;
      }
      // the local shape: each segment toward its rest angle to the one above it (the first to the head's)
      for (let k = 1; k < K; k++) {
        const o = (g0 + k) * 3, a = o - 3, goal = s.goal;
        if (k === 1) { goal[0] = X[a] + Wi[o] - Wi[a]; goal[1] = X[a + 1] + Wi[o + 1] - Wi[a + 1]; goal[2] = X[a + 2] + Wi[o + 2] - Wi[a + 2]; }
        else {
          const b = a - 3;
          let rx = Wi[a] - Wi[b], ry = Wi[a + 1] - Wi[b + 1], rz = Wi[a + 2] - Wi[b + 2];
          let cx = X[a] - X[b], cy = X[a + 1] - X[b + 1], cz = X[a + 2] - X[b + 2];
          const rl = Math.sqrt(rx * rx + ry * ry + rz * rz) || 1, cl = Math.sqrt(cx * cx + cy * cy + cz * cz) || 1;
          rx /= rl; ry /= rl; rz /= rl; cx /= cl; cy /= cl; cz /= cl;
          TMP[0] = Wi[o] - Wi[a]; TMP[1] = Wi[o + 1] - Wi[a + 1]; TMP[2] = Wi[o + 2] - Wi[a + 2];
          rotMin(rx, ry, rz, cx, cy, cz, TMP, 0, TMP, 3);
          goal[0] = X[a] + TMP[3]; goal[1] = X[a + 1] + TMP[4]; goal[2] = X[a + 2] + TMP[5];
        }
        X[o] += (goal[0] - X[o]) * loc; X[o + 1] += (goal[1] - X[o + 1]) * loc; X[o + 2] += (goal[2] - X[o + 2]) * loc;
      }
      // follow the leader: each segment back to its length, root down, remembering each knot's correction
      const corr = s.corr;
      for (let k = 1; k < K; k++) {
        const o = (g0 + k) * 3, a = o - 3, L = gd.seg[g0 + k];
        const dx = X[o] - X[a], dy = X[o + 1] - X[a + 1], dz = X[o + 2] - X[a + 2], d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-9;
        const nx = X[a] + dx / d * L, ny = X[a + 1] + dy / d * L, nz = X[a + 2] + dz / d * L;
        corr[k * 3] = nx - X[o]; corr[k * 3 + 1] = ny - X[o + 1]; corr[k * 3 + 2] = nz - X[o + 2];
        X[o] = nx; X[o + 1] = ny; X[o + 2] = nz;
      }
      // (its velocity correction: each knot takes back part of the pull the next one got)
      for (let k = 1; k < K - 1; k++) {
        const o = (g0 + k) * 3;
        Xp[o] += S.ftl * corr[(k + 1) * 3]; Xp[o + 1] += S.ftl * corr[(k + 1) * 3 + 1]; Xp[o + 2] += S.ftl * corr[(k + 1) * 3 + 2];
      }
      // collisions: the head, the neck, the upper arms, the upper torso; a knot that hits slides (no bounce); then
      // the lengths again (a push may have stretched a segment) and the collisions last (a knot is never left inside:
      // a segment a little long does not show, hair through a head does)
      for (let pass = 0; pass < CFG.passes; pass++) {
        for (let k = 1; k < K; k++) {
          const o = (g0 + k) * 3;
          const vx = X[o] - Xp[o], vy = X[o + 1] - Xp[o + 1], vz = X[o + 2] - Xp[o + 2];
          for (let q = 0; q < C.ns; q++) { const h = q * 4; if (outSphere(X, o, C.sph[h], C.sph[h + 1], C.sph[h + 2], C.sph[h + 3], n)) slide(X, Xp, o, vx, vy, vz, n); }
          if (outCapsule(X, o, C.j, 0, 3, C.neckR + rad, n)) slide(X, Xp, o, vx, vy, vz, n);
          if (outArm(X, o, C.j, 6, 9, C.armR + rad, n)) slide(X, Xp, o, vx, vy, vz, n);
          if (outArm(X, o, C.j, 12, 15, C.armR + rad, n)) slide(X, Xp, o, vx, vy, vz, n);
          if (outBox(X, o, C, rad, n)) slide(X, Xp, o, vx, vy, vz, n);
        }
        if (pass === CFG.passes - 1) break;
        for (let k = 1; k < K; k++) {
          const o = (g0 + k) * 3, a = o - 3, L = gd.seg[g0 + k];
          const dx = X[o] - X[a], dy = X[o + 1] - X[a + 1], dz = X[o + 2] - X[a + 2], d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-9;
          const nx = X[a] + dx / d * L, ny = X[a + 1] + dy / d * L, nz = X[a + 2] + dz / d * L;
          Xp[o] += nx - X[o]; Xp[o + 1] += ny - X[o + 1]; Xp[o + 2] += nz - X[o + 2];
          X[o] = nx; X[o + 1] = ny; X[o + 2] = nz;
        }
      }
    }
  }
  /** after a push along n: keep the velocity along the surface, drop the part into it */
  function slide(X, Xp, o, vx, vy, vz, n) {
    const vn = vx * n[0] + vy * n[1] + vz * n[2];
    const k = vn < 0 ? vn : 0;
    Xp[o] = X[o] - (vx - n[0] * k); Xp[o + 1] = X[o + 1] - (vy - n[1] * k); Xp[o + 2] = X[o + 2] - (vz - n[2] * k);
  }

  /**
   * Step a person's hair to time t (s, the game's clock; any clock that runs with what is drawn). key: the person
   * (a replay's ghost passes its actor, so the hair carries on); sk: the skeleton drawn this frame; gd: the guides.
   * Returns the state: X (world knots, G x K x 3), and the rest pose W the same way. Idempotent for the same t.
   */
  function step(key, sk, gd, t) {
    if (!gd || !sk) return null;
    let s = states.get(key);
    if (!s || s.gd !== gd) { s = newState(gd); states.set(key, s); }
    restWorld(sk, gd, s.W, s.hO, s.hR);
    const dt = s.t == null ? -1 : t - s.t;
    const W = s.W, Wp = s.Wp, X = s.X, Xp = s.Xp;
    const moved = s.t == null ? 1e9 : Math.hypot(W[0] - Wp[0], W[1] - Wp[1], W[2] - Wp[2]);
    // the same moment drawn again: the same hair (unless the body is somewhere else: a scrub, a pose edited while
    // paused; then at rest there)
    if (dt === 0 && s.steps && moved < 1e-6) return s;
    const C0 = s.C0, C1 = colliders(sk, gd, s.C1);
    if (!CFG.on || s.t == null || !(dt > 0) || dt > CFG.maxDt || moved > CFG.jumpFt[0] + CFG.jumpFt[1] * dt) {
      X.set(W); Xp.set(W); Wp.set(W); copyColliders(C1, C0); copyColliders(C1, s.C);
      s.t = t; s.h = CFG.sub; s.resets++; s.steps++;
      return s;
    }
    // substeps: none longer than CFG.sub, none carrying a knot (at the speed it has) or an elbow further than
    // CFG.relMax against the head
    let rel = 0;
    const kv = dt / s.h, hx = C1.j[0] - C0.j[0], hy = C1.j[1] - C0.j[1], hz = C1.j[2] - C0.j[2];
    for (let i = 0; i < X.length; i += 3) {
      if ((i / 3) % s.gd.K === 0) continue;   // (a root rides on the head: it keeps no velocity of its own)
      const rx = (X[i] - Xp[i]) * kv - (W[i] - Wp[i]), ry = (X[i + 1] - Xp[i + 1]) * kv - (W[i + 1] - Wp[i + 1]), rz = (X[i + 2] - Xp[i + 2]) * kv - (W[i + 2] - Wp[i + 2]);
      const r2 = rx * rx + ry * ry + rz * rz;
      if (r2 > rel) rel = r2;
    }
    rel = Math.sqrt(rel);
    for (let e = 9; e < 18; e += 6) rel = Math.max(rel, Math.hypot(C1.j[e] - C0.j[e] - hx, C1.j[e + 1] - C0.j[e + 1] - hy, C1.j[e + 2] - C0.j[e + 2] - hz));
    const n = Math.min(CFG.maxSub, Math.max(1, Math.ceil(dt / CFG.sub - 1e-6), Math.ceil(rel / CFG.relMax - 1e-6))), h = dt / n;
    // (Verlet keeps a velocity as the last step's displacement: a step of another length rescales it, or a knot
    // running with the player shot ahead of the body whenever the substeps changed, a swing pumped up with every change)
    if (h !== s.h) { const r = h / s.h; for (let i = 0; i < X.length; i++) Xp[i] = X[i] - (X[i] - Xp[i]) * r; }
    s.dt = dt;
    for (let i = 1; i <= n; i++) substep(s, h, i / n);
    Wp.set(W); copyColliders(C1, C0);
    s.t = t; s.h = h; s.n = n; s.steps++;
    return s;
  }

  /**
   * The knots' frames for skinning (gl3d.js; the bones sit at the knots' world positions, X): row-major 3x3 into R.
   * Strands that follow a guide (gd.turn false) are carried by it the way TressFX carries its follow hairs: moved as
   * its knot moves, their offset from it kept on the head's axes (turning that offset with each bend of the guide
   * threw a strand a few cm off its guide into zig-zags); then every frame is the head's world rotation. A strand
   * that is its own guide (a ponytail) turns with it: the head's rotation turned by the least rotation taking the
   * rest pose's direction at the knot to the simulated one (the chord between the knots on either side; a root
   * keeps the head's, the strands stay on the scalp).
   */
  function knotFrames(s, R) {
    const gd = s.gd, G = gd.G, K = gd.K, X = s.X, W = s.W, hR = s.hR, Q = TMP;
    for (let g = 0; g < G; g++) for (let k = 0; k < K; k++) {
      const i = g * K + k, a = (g * K + Math.max(0, k - 1)) * 3, b = (g * K + Math.min(K - 1, k + 1)) * 3;
      if (k === 0 || !gd.turn) { for (let c = 0; c < 9; c++) R[i * 9 + c] = hR[c]; continue; }
      let rx = W[b] - W[a], ry = W[b + 1] - W[a + 1], rz = W[b + 2] - W[a + 2];
      let cx = X[b] - X[a], cy = X[b + 1] - X[a + 1], cz = X[b + 2] - X[a + 2];
      const rl = Math.hypot(rx, ry, rz) || 1, cl = Math.hypot(cx, cy, cz) || 1;
      rx /= rl; ry /= rl; rz /= rl; cx /= cl; cy /= cl; cz /= cl;
      rotMat(rx, ry, rz, cx, cy, cz, Q, 0);
      const o = i * 9;
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) R[o + r * 3 + c] = Q[r * 3] * hR[c] + Q[r * 3 + 1] * hR[3 + c] + Q[r * 3 + 2] * hR[6 + c];
    }
    return R;
  }

  /** how far the hair reaches from the head this frame (ft; for the renderer's cell bounds) */
  function reach(s) {
    if (!s) return 0;
    const X = s.X, o = s.hO;
    let r = 0;
    for (let i = 0; i < X.length; i += 3) r = Math.max(r, Math.hypot(X[i] - o[0], X[i + 1] - o[1], X[i + 2] - o[2]));
    return r;
  }

  M.Hair = { CFG, styleOf, guideSet, flatGuides, step, knotFrames, reach, colliders, bodyColliders, newColliders, pushBody, relax, state: (key) => states.get(key) || null };
})();
