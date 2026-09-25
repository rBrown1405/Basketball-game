/* Pro BBALL Coach — match view: people renderer (PBC.Match.Figure).
 * Draws a solved Skeleton as a 2D figure that reads as a human being: every limb is the true silhouette of a
 * tapered 3D shape with anatomical width profiles (deltoid, biceps / triceps, forearm flexors, quads, the VMO
 * teardrop above the knee, calf), projected through the camera and filled with cylindrical shading (highlight,
 * core shadow, reflected light); hands have a palm, four fingers and a thumb that curl with the pose; the head is
 * a skull with a jaw and chin, ears, eyes with whites / iris / lids, brows, a nose, lips, facial hair and a hair
 * style with volume. Faces come from the same feature set as the pixel portraits (PBC.Identity), so the player on
 * the court is recognisably the player on his card. Parts are depth-sorted per figure. */
(function () {
  'use strict';
  const M = window.PBC.Match, U = M.U, RG = M.Rig, J = RG.J, F = RG.F;
  const PBC = window.PBC;

  const SKIN_DEF = ['#f3d2b6', '#e8b995', '#d6a17a', '#c08560', '#a26a45', '#86532f', '#6a3f22', '#4a2a16'];
  const FONT_NUM = '"Arial Black", "Arial Narrow", Impact, "Helvetica Neue", sans-serif';
  const LIGHT = [-0.38, -0.92]; // screen-space light direction (from top-left)
  const OUTLINE = 'rgba(14,10,12,0.82)';
  const skinTones = () => (PBC.Config && PBC.Config.SKIN_TONES) || SKIN_DEF;

  // width profiles in fractions of height: [t, front, back, lateral, medial, muscle sensitivity]
  // (muscle sensitivity scales the width with the player's build: 0 = bone / joint, 1 = a big muscle belly)
  const PROF = {
    // deltoid cap, biceps peak (front) / triceps (back), narrowing to the elbow
    ua: [[-0.16, 0.025, 0.027, 0.03, 0.02, 0.3], [-0.04, 0.04, 0.043, 0.05, 0.03, 0.9], [0.14, 0.044, 0.046, 0.053, 0.033, 1.0],
      [0.36, 0.042, 0.043, 0.043, 0.032, 0.8], [0.56, 0.046, 0.04, 0.038, 0.033, 1.0], [0.8, 0.034, 0.033, 0.03, 0.028, 0.5], [1.0, 0.027, 0.028, 0.028, 0.025, 0.1]],
    // forearm: flexor / extensor bulge below the elbow, tapering to the wrist
    fa: [[0, 0.027, 0.027, 0.029, 0.026, 0.2], [0.22, 0.034, 0.031, 0.037, 0.03, 0.9], [0.5, 0.028, 0.026, 0.03, 0.025, 0.6],
      [0.8, 0.021, 0.02, 0.023, 0.02, 0.2], [1.0, 0.017, 0.016, 0.021, 0.019, 0]],
    // thigh: quad sweep, hamstring behind, the teardrop just above the knee, then the knee
    th: [[-0.05, 0.05, 0.06, 0.06, 0.045, 0.6], [0.08, 0.06, 0.066, 0.066, 0.052, 0.9], [0.34, 0.064, 0.06, 0.06, 0.054, 1.0],
      [0.6, 0.057, 0.05, 0.051, 0.046, 0.8], [0.8, 0.05, 0.042, 0.043, 0.043, 0.7], [0.9, 0.043, 0.039, 0.04, 0.04, 0.2], [1.0, 0.038, 0.036, 0.038, 0.036, 0]],
    // shank: the calf belly behind, the shin bone in front, a thin ankle
    sh: [[0, 0.037, 0.036, 0.038, 0.037, 0], [0.14, 0.033, 0.046, 0.041, 0.043, 0.9], [0.32, 0.03, 0.05, 0.042, 0.045, 1.0],
      [0.55, 0.026, 0.038, 0.032, 0.032, 0.7], [0.8, 0.02, 0.023, 0.023, 0.022, 0.2], [1.0, 0.018, 0.019, 0.02, 0.02, 0]],
    neck: [[0, 0.036, 0.04, 0.04, 0.04, 0.6], [0.55, 0.031, 0.034, 0.033, 0.033, 0.3], [1.0, 0.029, 0.031, 0.031, 0.031, 0.2]],
    palm: [[0, 0.011, 0.011, 0.02, 0.019, 0], [0.5, 0.013, 0.012, 0.026, 0.024, 0], [1.0, 0.012, 0.011, 0.027, 0.025, 0]],
    mitten: [[0, 0.012, 0.012, 0.02, 0.019, 0], [0.35, 0.014, 0.014, 0.026, 0.024, 0], [0.75, 0.013, 0.012, 0.025, 0.023, 0], [1.0, 0.01, 0.01, 0.019, 0.018, 0]],
    finger: [[0, 0.0058, 0.0058, 0.0058, 0.0058, 0], [1.0, 0.0048, 0.0048, 0.0048, 0.0048, 0]],
    thumb: [[0, 0.0075, 0.0075, 0.0075, 0.0075, 0], [1.0, 0.0055, 0.0055, 0.0055, 0.0055, 0]],
    shortsLeg: [[-0.05, 0.067, 0.073, 0.071, 0.059, 0.4], [0.3, 0.065, 0.067, 0.067, 0.059, 0.4], [0.7, 0.064, 0.065, 0.067, 0.059, 0.3], [0.8, 0.065, 0.066, 0.068, 0.06, 0.3]],
    pantLeg: [[-0.05, 0.062, 0.066, 0.066, 0.05, 0.3], [0.5, 0.058, 0.056, 0.056, 0.05, 0.3], [1.0, 0.045, 0.043, 0.045, 0.042, 0]],
    pantShin: [[0, 0.045, 0.045, 0.046, 0.045, 0], [0.4, 0.043, 0.045, 0.044, 0.044, 0], [1.0, 0.035, 0.035, 0.036, 0.036, 0]],
    sleeveUA: [[-0.16, 0.03, 0.032, 0.034, 0.024, 0.3], [-0.05, 0.045, 0.048, 0.052, 0.034, 0.9], [0.12, 0.049, 0.051, 0.056, 0.037, 1.0], [0.45, 0.046, 0.045, 0.046, 0.036, 0.8]],
  };

  function sampleProf(prof, t, out, mus) {
    let i = 0;
    while (i < prof.length - 2 && prof[i + 1][0] < t) i++;
    const a = prof[i], b = prof[i + 1];
    const u = U.clamp((t - a[0]) / (b[0] - a[0]), 0, 1);
    const s = u * u * (3 - 2 * u);
    const m = 1 + (mus || 0) * ((a[5] || 0) + ((b[5] || 0) - (a[5] || 0)) * s);
    out[0] = (a[1] + (b[1] - a[1]) * s) * m; out[1] = (a[2] + (b[2] - a[2]) * s) * m;
    out[2] = (a[3] + (b[3] - a[3]) * s) * m; out[3] = (a[4] + (b[4] - a[4]) * s) * m;
    return out;
  }

  /** colour set for a material: base, shadow, core shadow, highlight, outline */
  function tri(base, skin) {
    const d = skin ? U.mix(U.mul(base, 0.7), '#4a2438', 0.18) : U.mul(base, 0.64);
    const dd = skin ? U.mix(U.mul(base, 0.5), '#3a1a30', 0.25) : U.mul(base, 0.46);
    return { b: base, d, dd, l: U.shade(base, skin ? 0.16 : 0.2), h: U.shade(base, skin ? 0.3 : 0.36), o: OUTLINE };
  }

  // expressions (same table as the portraits, so the persona reads the same in both)
  const EXPR = {
    smile: { brow: 'soft', eyes: 'soft', mouth: 'smile', cheeks: 1 },
    grin: { brow: 'up', eyes: 'happy', mouth: 'grin', cheeks: 2 },
    smirk: { brow: 'oneUp', eyes: 'normal', mouth: 'smirk', cheeks: 0 },
    cocky: { brow: 'cocky', eyes: 'lidded', mouth: 'smirk', look: 1 },
    neutral: { brow: 'flat', eyes: 'normal', mouth: 'flat' },
    focused: { brow: 'low', eyes: 'lidded', mouth: 'press' },
    intense: { brow: 'angry', eyes: 'lidded', mouth: 'frownSoft' },
    mean: { brow: 'angry', eyes: 'squint', mouth: 'frown' },
    serious: { brow: 'heavy', eyes: 'lidded', mouth: 'flat' },
    fired: { brow: 'angry', eyes: 'wide', mouth: 'yell' },
    annoyed: { brow: 'annoyed', eyes: 'lidded', mouth: 'side', look: -1 },
  };

  /** Build the drawing style for a player / referee */
  function makeStyle(look, teamLook, kind) {
    look = look || {};
    const lk = look.look || {};
    const st = { kind: kind || 'player', fem: look.gender === 'f' };
    const Fe = PBC.Identity ? PBC.Identity.features(look) : null;
    st.F = Fe;
    const skinI = U.clamp(lk.skin == null ? 3 : lk.skin | 0, 0, 7);
    st.skinI = skinI;
    st.skin = tri(skinTones()[skinI], true);
    st.hair = lk.hair || (st.fem ? 'ponytail' : 'fade');
    st.hairColor = lk.hairColor && lk.hairColor !== '#000000' ? lk.hairColor : '#1b1410';
    st.hairT = tri(st.hairColor);
    if (U.lum(st.hairColor) < 0.14) { st.hairT.l = U.mix(st.hairColor, '#7a6e90', 0.22); st.hairT.h = U.mix(st.hairColor, '#a69ec4', 0.32); }
    st.beard = st.fem ? 'none' : (lk.beard || 'none');
    st.eyeColor = Fe ? Fe.eyeColor : '#2b1a10';
    st.expr = EXPR[look.expr] ? look.expr : 'neutral';
    st.headband = lk.headband === 'team' ? ((teamLook && teamLook.colors && teamLook.colors.primary) || '#ffffff') : (lk.headband || null);
    st.armSleeve = lk.armSleeve || 'none';
    st.legSleeve = lk.legSleeve || 'none';
    st.tattoo = lk.tattoo || 'none';
    st.build = lk.build == null ? 0.5 : lk.build;
    st.musc = (Fe ? Fe.musc : st.build) - 0.5; // -0.5..0.5
    const seed = U.hashStr(String(look.id || look.last || 'x'));
    st.seed = seed;
    st.lipT = tri(U.mix(skinTones()[skinI], st.fem ? '#b23c48' : '#7a3c40', st.fem ? 0.42 : 0.14));
    if (st.kind === 'ref') {
      st.shirtA = '#f4f4f4'; st.shirtB = '#141414';
      st.jersey = tri('#ececec');
      st.pants = tri('#16161a');
      st.shoe = '#101012'; st.shoeAccent = '#2b2b30'; st.sole = '#1d1d20';
      st.sock = tri('#16161a');
      st.num = String(look.num == null ? '' : look.num);
      st.numColor = '#111';
      st.trim = '#111111';
      st.expr = 'neutral';
      return st;
    }
    const uni = (teamLook && teamLook.uniform) || { jersey: '#ffffff', number: '#1d4e89', trim: '#1d4e89', shorts: '#ffffff' };
    st.jersey = tri(uni.jersey);
    st.shorts = tri(uni.shorts || uni.jersey);
    st.trim = uni.trim || uni.number;
    st.numColor = uni.number || '#111';
    st.num = look.num == null ? '' : String(look.num);
    const light = U.lum(uni.jersey) > 0.6;
    st.sock = tri((seed & 3) === 0 ? '#1a1a1c' : light ? '#f5f5f5' : (seed & 1 ? '#f5f5f5' : U.shade(uni.jersey, -0.1)));
    st.shoe = lk.shoe || (light ? '#f2f2f2' : '#151515');
    st.shoeAccent = lk.shoeAccent || (teamLook && teamLook.colors ? teamLook.colors.primary : '#c33');
    st.sole = U.lum(st.shoe) > 0.5 ? '#e9e6df' : '#f2f0ea';
    st.sleeve = tri((seed >> 3) & 1 ? '#161618' : '#f3f3f3');
    return st;
  }

  // ------------------------------------------------------------ renderer
  class FigureRenderer {
    constructor() {
      this.sx = new Float32Array(J.N); this.sy = new Float32Array(J.N); this.ss = new Float32Array(J.N); this.sd = new Float32Array(J.N);
      this.L = new Float32Array(64); this.Rr = new Float32Array(64);
      this.pt = { x: 0, y: 0, s: 0, d: 0 };
      this.pw = new Float32Array(4);
      this.v = new Float64Array(3);
      this.N = new Float64Array(3);
      this.parts = [];
      for (let i = 0; i < 16; i++) this.parts.push({ id: i, d: 0 });
      this.order = [];
      this.tmp3 = new Float64Array(3);
      this.cam = null;
      this.musc = 0;
    }

    // ---------------------------------------------------------- helpers
    proj(x, y, z) { return this.cam.project(x, y, z, this.pt); }

    /** silhouette normal for an axis T at point (mx,my,mz): N = normalize(view x T) */
    silN(mx, my, mz, tx, ty, tz) {
      const cam = this.cam, N = this.N;
      let vx = mx - cam.x, vy = my - cam.y, vz = mz - cam.z;
      const vl = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1; vx /= vl; vy /= vl; vz /= vl;
      let nx = vy * tz - vz * ty, ny = vz * tx - vx * tz, nz = vx * ty - vy * tx;
      let nl = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (nl < 1e-4) { nx = 1; ny = 0; nz = 0; nl = 1; }
      N[0] = nx / nl; N[1] = ny / nl; N[2] = nz / nl;
      return N;
    }

    /**
     * Draw a limb segment from joint point A to B (world), with a frame (skeleton R offset fo)
     * whose Y axis is anterior and X axis lateral*side. prof: width profile; t0..t1 sub-range.
     */
    limb(g, sk, ax, ay, az, bx, by, bz, fo, side, prof, col, t0, t1, scale, caps, mus) {
      const H = sk.dims.H * scale;
      const R = sk.R;
      let tx = bx - ax, ty = by - ay, tz = bz - az;
      const len = Math.sqrt(tx * tx + ty * ty + tz * tz) || 1e-4;
      tx /= len; ty /= len; tz /= len;
      const N = this.silN((ax + bx) * 0.5, (ay + by) * 0.5, (az + bz) * 0.5, tx, ty, tz);
      const Yx = R[fo + 1], Yy = R[fo + 4], Yz = R[fo + 7];
      const Xx = R[fo] * side, Xy = R[fo + 3] * side, Xz = R[fo + 6] * side;
      const nA = N[0] * Yx + N[1] * Yy + N[2] * Yz;
      const nL = N[0] * Xx + N[1] * Xy + N[2] * Xz;
      const nA2 = nA * nA, nL2 = nL * nL;
      const L = this.L, Rr = this.Rr, pw = this.pw;
      let k = 0;
      const steps = Math.max(3, Math.min(11, Math.round((t1 - t0) * (this.detail > 1 ? 10 : 6)) + 2));
      const m = mus == null ? this.musc : mus;
      for (let i = 0; i <= steps; i++) {
        const t = t0 + (t1 - t0) * i / steps;
        sampleProf(prof, t, pw, m);
        const f = pw[0] * H, b = pw[1] * H, la = pw[2] * H, me = pw[3] * H;
        const hp = Math.sqrt((nA > 0 ? f * f : b * b) * nA2 + (nL > 0 ? la * la : me * me) * nL2);
        const hm = Math.sqrt((nA > 0 ? b * b : f * f) * nA2 + (nL > 0 ? me * me : la * la) * nL2);
        const px = ax + (bx - ax) * t, py = ay + (by - ay) * t, pz = az + (bz - az) * t;
        let p = this.proj(px + N[0] * hp, py + N[1] * hp, pz + N[2] * hp);
        L[k] = p.x; L[k + 1] = p.y;
        p = this.proj(px - N[0] * hm, py - N[1] * hm, pz - N[2] * hm);
        Rr[k] = p.x; Rr[k + 1] = p.y;
        k += 2;
      }
      this.fillOutline(g, k, col, caps == null ? 3 : caps);
    }

    /** fill the polygon from edges L (forward) and Rr (backward) with cylindrical shading */
    fillOutline(g, k, col, caps) {
      const L = this.L, Rr = this.Rr;
      const n = k >> 1;
      g.beginPath();
      g.moveTo(L[0], L[1]);
      for (let i = 1; i < n - 1; i++) {
        const mx = (L[i * 2] + L[i * 2 + 2]) * 0.5, my = (L[i * 2 + 1] + L[i * 2 + 3]) * 0.5;
        g.quadraticCurveTo(L[i * 2], L[i * 2 + 1], mx, my);
      }
      g.lineTo(L[k - 2], L[k - 1]);
      const e = k - 2;
      if (caps & 2) {
        const cx = (L[e] + Rr[e]) * 0.5, cy = (L[e + 1] + Rr[e + 1]) * 0.5;
        const dx = cx - (L[e - 2] + Rr[e - 2]) * 0.5, dy = cy - (L[e - 1] + Rr[e - 1]) * 0.5;
        const dl = Math.sqrt(dx * dx + dy * dy) || 1;
        const w = Math.sqrt((L[e] - Rr[e]) ** 2 + (L[e + 1] - Rr[e + 1]) ** 2) * 0.55;
        g.bezierCurveTo(L[e] + dx / dl * w, L[e + 1] + dy / dl * w, Rr[e] + dx / dl * w, Rr[e + 1] + dy / dl * w, Rr[e], Rr[e + 1]);
      } else g.lineTo(Rr[e], Rr[e + 1]);
      for (let i = n - 2; i > 0; i--) {
        const mx = (Rr[i * 2] + Rr[i * 2 - 2]) * 0.5, my = (Rr[i * 2 + 1] + Rr[i * 2 - 1]) * 0.5;
        g.quadraticCurveTo(Rr[i * 2], Rr[i * 2 + 1], mx, my);
      }
      g.lineTo(Rr[0], Rr[1]);
      if (caps & 1) {
        const cx = (L[0] + Rr[0]) * 0.5, cy = (L[1] + Rr[1]) * 0.5;
        const dx = cx - (L[2] + Rr[2]) * 0.5, dy = cy - (L[3] + Rr[3]) * 0.5;
        const dl = Math.sqrt(dx * dx + dy * dy) || 1;
        const w = Math.sqrt((L[0] - Rr[0]) ** 2 + (L[1] - Rr[1]) ** 2) * 0.55;
        g.bezierCurveTo(Rr[0] + dx / dl * w, Rr[1] + dy / dl * w, L[0] + dx / dl * w, L[1] + dy / dl * w, L[0], L[1]);
      }
      g.closePath();
      const m = (n >> 1) * 2;
      this.shade(g, L[m], L[m + 1], Rr[m], Rr[m + 1], col);
      g.fill();
      if (this.outlineW > 0) { g.strokeStyle = col.o; g.lineWidth = this.outlineW; g.stroke(); }
    }

    /** cylindrical shading across a limb: highlight on the lit side, core shadow near the far edge, a touch of
     *  reflected light at the very edge */
    shade(g, lx, ly, rx, ry, col) {
      if (this.flat) { g.fillStyle = col.b; return; }
      let nx = lx - rx, ny = ly - ry;
      const nl = Math.sqrt(nx * nx + ny * ny) || 1;
      const w = (nx * LIGHT[0] + ny * LIGHT[1]) / nl; // +: left side lit
      const gr = g.createLinearGradient(lx, ly, rx, ry);
      const lit = w > 0;
      const hp = lit ? 0.5 - 0.32 * w : 0.5 + 0.32 * w; // highlight position along the gradient (toward the lit edge)
      const a = lit ? 0 : 1, dir = lit ? 1 : -1;
      const at = (t) => U.clamp(a + dir * t, 0, 1);
      const stops = [[0, col.b], [Math.abs(hp - a), col.h || col.l], [Math.abs(hp - a) + 0.28, col.b], [0.78, col.d], [0.93, col.dd], [1, col.d]];
      stops.sort((p, q) => at(p[0]) - at(q[0]));
      for (const s of stops) gr.addColorStop(at(s[0]), s[1]);
      g.fillStyle = gr;
    }

    /** stacked elliptical cross-sections -> silhouette polygon (for torso / pelvis) */
    sections(g, secs, count, col, capTop) {
      const L = this.L, Rr = this.Rr;
      let k = 0;
      for (let i = 0; i < count; i++) {
        const s = secs[i];
        const N = this.silN(s.x, s.y, s.z, s.ux, s.uy, s.uz);
        const nL = N[0] * s.rx + N[1] * s.ry + N[2] * s.rz;
        const nA = N[0] * s.fx + N[1] * s.fy + N[2] * s.fz;
        const fa = nA > 0 ? s.f : s.b, fb = nA > 0 ? s.b : s.f;
        const hp = Math.sqrt(s.w * s.w * nL * nL + fa * fa * nA * nA);
        const hm = Math.sqrt(s.w * s.w * nL * nL + fb * fb * nA * nA);
        let p = this.proj(s.x + N[0] * hp, s.y + N[1] * hp, s.z + N[2] * hp);
        L[k] = p.x; L[k + 1] = p.y;
        p = this.proj(s.x - N[0] * hm, s.y - N[1] * hm, s.z - N[2] * hm);
        Rr[k] = p.x; Rr[k + 1] = p.y;
        k += 2;
      }
      void col; void capTop;
      return k;
    }
    /** soft dark blob (ambient occlusion) at a world point */
    ao(g, x, y, z, rad, alpha, ex) {
      if (this.flat) return;
      const p = this.proj(x, y, z);
      const r = rad * p.s;
      if (r < 0.8) return;
      const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      gr.addColorStop(0, 'rgba(10,6,10,' + alpha.toFixed(3) + ')'); gr.addColorStop(1, 'rgba(10,6,10,0)');
      g.fillStyle = gr;
      g.beginPath(); g.ellipse(p.x, p.y, r * (ex || 1), r, 0, 0, U.TAU); g.fill();
    }

    // ---------------------------------------------------------- main
    /** o: { dpr, outline(bool), flat(bool), alpha, extra } */
    draw(g, cam, sk, st, o) {
      this.cam = cam;
      const P = sk.P, H = sk.dims.H;
      const sx = this.sx, sy = this.sy, ss = this.ss, sd = this.sd;
      for (let j = 0; j < J.N; j++) {
        const p = cam.project(P[j * 3], P[j * 3 + 1], P[j * 3 + 2], this.pt);
        sx[j] = p.x; sy[j] = p.y; ss[j] = p.s; sd[j] = p.d;
      }
      const minX = Math.min(sx[J.HT], sx[J.L_TOE], sx[J.R_TOE], sx[J.L_HD], sx[J.R_HD]) - 60;
      const maxX = Math.max(sx[J.HT], sx[J.L_TOE], sx[J.R_TOE], sx[J.L_HD], sx[J.R_HD]) + 60;
      if (maxX < 0 || minX > cam.W) return;
      const scl = ss[J.CHS];
      this.flat = !!o.flat;
      this.outlineW = o.outline === false ? 0 : U.clamp(scl * 0.05, 0.6, 2.2);
      this.dpr = o.dpr || 1;
      this.px = H * scl; // player height in pixels: level of detail
      this.detail = this.px > 140 ? 2 : this.px > 70 ? 1 : 0;
      this.bulk = sk.dims.bulk;
      this.musc = st.musc == null ? 0 : st.musc * 0.5;
      const parts = this.parts, order = this.order;
      order.length = 0;
      const dep = (a, b, bias) => (sd[a] + sd[b]) * 0.5 + bias;
      const add = (id, d) => { parts[id].d = d; order.push(parts[id]); };
      add(0, dep(J.PEL, J.CHS, 0));          // torso
      add(1, dep(J.NCK, J.HC, -0.12));        // head
      add(2, dep(J.L_SH, J.L_EL, -0.06));     // L upper arm
      add(3, dep(J.L_EL, J.L_WR, -0.1));      // L forearm + hand
      add(4, dep(J.R_SH, J.R_EL, -0.06));
      add(5, dep(J.R_EL, J.R_WR, -0.1));
      add(6, dep(J.L_HIP, J.L_KN, 0.06));     // L thigh
      add(7, dep(J.L_KN, J.L_AN, 0.02));      // L shank
      add(8, dep(J.L_HEEL, J.L_TOE, 0.0));    // L foot
      add(9, dep(J.R_HIP, J.R_KN, 0.06));
      add(10, dep(J.R_KN, J.R_AN, 0.02));
      add(11, dep(J.R_HEEL, J.R_TOE, 0.0));
      if (o.extra) { parts[12].d = o.extra.d; order.push(parts[12]); }
      order.sort((a, b) => b.d - a.d);
      if (o.alpha != null && o.alpha < 1) g.globalAlpha = o.alpha;
      g.lineJoin = 'round'; g.lineCap = 'round';
      for (let i = 0; i < order.length; i++) {
        const id = order[i].id;
        switch (id) {
          case 0: this.drawTorso(g, sk, st); break;
          case 1: this.drawHead(g, sk, st); break;
          case 2: this.drawUpperArm(g, sk, st, 0); break;
          case 3: this.drawForearm(g, sk, st, 0); break;
          case 4: this.drawUpperArm(g, sk, st, 1); break;
          case 5: this.drawForearm(g, sk, st, 1); break;
          case 6: this.drawThigh(g, sk, st, 0); break;
          case 7: this.drawShank(g, sk, st, 0); break;
          case 8: this.drawFoot(g, sk, st, 0); break;
          case 9: this.drawThigh(g, sk, st, 1); break;
          case 10: this.drawShank(g, sk, st, 1); break;
          case 11: this.drawFoot(g, sk, st, 1); break;
          case 12: o.extra.fn(); break;
        }
      }
      g.globalAlpha = 1;
    }

    // ---------------------------------------------------------- arms
    drawUpperArm(g, sk, st, side) {
      const P = sk.P, jS = side ? J.R_SH : J.L_SH, jE = jS + 1, fo = (side ? F.R_UA : F.L_UA) * 9;
      const sg = side ? 1 : -1;
      const b = this.bulk * (st.fem ? 0.86 : 1);
      const sleeve = st.armSleeve === 'both' || (st.armSleeve === 'left' && !side) || (st.armSleeve === 'right' && side);
      const a = jS * 3, e = jE * 3;
      if (st.kind === 'ref') {
        this.limb(g, sk, P[a], P[a + 1], P[a + 2], P[e], P[e + 1], P[e + 2], fo, sg, PROF.ua, st.skin, -0.13, 1.0, b, 2);
        this.limb(g, sk, P[a], P[a + 1], P[a + 2], P[e], P[e + 1], P[e + 2], fo, sg, PROF.sleeveUA, this.refShirt(st), -0.13, 0.45, b * 1.02, 1);
        return;
      }
      const col = sleeve ? st.sleeve : st.skin;
      this.limb(g, sk, P[a], P[a + 1], P[a + 2], P[e], P[e + 1], P[e + 2], fo, sg, PROF.ua, st.skin, -0.13, sleeve ? 0.3 : 1.0, b, 3);
      if (sleeve) this.limb(g, sk, P[a], P[a + 1], P[a + 2], P[e], P[e + 1], P[e + 2], fo, sg, PROF.ua, col, 0.25, 1.0, b * 1.03, 2);
      if (st.tattoo === 'arms' || st.tattoo === 'sleeve') this.tattoo(g, sk, jS, jE, fo, sg, b);
      // the deltoid tucks under the jersey strap: a soft shadow where the arm meets the shoulder
      if (this.detail > 0) this.ao(g, P[a] + (P[e] - P[a]) * 0.08, P[a + 1] + (P[e + 1] - P[a + 1]) * 0.08, P[a + 2] + (P[e + 2] - P[a + 2]) * 0.08, 0.045 * sk.dims.H, 0.16, 1.2);
    }
    drawForearm(g, sk, st, side) {
      const P = sk.P, jE = side ? J.R_EL : J.L_EL, jW = jE + 1, jH = jE + 2;
      const fo = (side ? F.R_FA : F.L_FA) * 9;
      const sg = side ? 1 : -1;
      const b = this.bulk * (st.fem ? 0.86 : 1);
      const sleeve = st.kind !== 'ref' && (st.armSleeve === 'both' || (st.armSleeve === 'left' && !side) || (st.armSleeve === 'right' && side));
      const e = jE * 3, w = jW * 3;
      const handFar = this.sd[jH] > this.sd[jW];
      if (handFar) this.drawHand(g, sk, st, side);
      this.limb(g, sk, P[e], P[e + 1], P[e + 2], P[w], P[w + 1], P[w + 2], fo, sg, PROF.fa, sleeve ? st.sleeve : st.skin, 0, 1, b, 3);
      if (!handFar) this.drawHand(g, sk, st, side);
    }
    /** palm, four fingers and a thumb that curl with the pose (mitten at small sizes) */
    drawHand(g, sk, st, side) {
      const P = sk.P, R = sk.R, H = sk.dims.H;
      const jW = side ? J.R_WR : J.L_WR;
      const fh = (side ? F.R_HD : F.L_HD) * 9;
      const sg = side ? 1 : -1;
      const w = jW * 3;
      const wx = P[w], wy = P[w + 1], wz = P[w + 2];
      const curl = U.clamp(sk.pose ? sk.pose[RG.CH[(side ? 'r' : 'l') + 'Fing']] : 0.3, 0, 1);
      const bk = this.bulk * 0.98 * (st.fem ? 0.9 : 1);
      // hand-local (x radial = toward the thumb, y palm side, z toward the elbow) -> world
      const loc = (lx, ly, lz, out) => {
        out[0] = wx + (R[fh] * lx * sg + R[fh + 1] * ly + R[fh + 2] * lz) * H;
        out[1] = wy + (R[fh + 3] * lx * sg + R[fh + 4] * ly + R[fh + 5] * lz) * H;
        out[2] = wz + (R[fh + 6] * lx * sg + R[fh + 7] * ly + R[fh + 8] * lz) * H;
        return out;
      };
      const A = this.tmp3, B = this._hb || (this._hb = new Float64Array(3)), C = this._hc || (this._hc = new Float64Array(3));
      if (this.detail === 0 || this.px < 95) {
        // small on screen: one rounded mitten
        const tip = loc(0, 0.012 + curl * 0.02, -0.084 + curl * 0.02, A);
        this.limb(g, sk, wx, wy, wz, tip[0], tip[1], tip[2], fh, sg, PROF.mitten, st.skin, 0, 1, bk, 3, 0);
        return;
      }
      // palm to the knuckles
      const kn = loc(0, 0.004, -0.058, A);
      this.limb(g, sk, wx, wy, wz, kn[0], kn[1], kn[2], fh, sg, PROF.palm, st.skin, 0, 1, bk, 1, 0);
      // fingers: two segments each, curling toward the palm (+y), fanning out a little when open
      const ow = this.outlineW; this.outlineW = ow * 0.7;
      const fx = [0.0195, 0.0068, -0.0062, -0.019], fl = [0.041, 0.045, 0.042, 0.033];
      const c1 = curl * 1.05, c2 = curl * 1.9;
      for (let i = 0; i < 4; i++) {
        const spread = (1 - curl) * (i - 1.5) * 0.09;
        const bx = fx[i] * bk, l1 = fl[i] * 0.56, l2 = fl[i] * 0.44;
        // proximal segment
        const sx1 = Math.sin(spread), cx1 = Math.cos(spread);
        const base = loc(bx, 0.004, -0.058, B);
        const p1 = loc(bx + sx1 * l1, 0.004 + Math.sin(c1) * l1 * cx1, -0.058 - Math.cos(c1) * l1 * cx1, C);
        this.limb(g, sk, base[0], base[1], base[2], p1[0], p1[1], p1[2], fh, sg, PROF.finger, st.skin, 0, 1, bk, 1, 0);
        const p2 = loc(bx + sx1 * (l1 + l2), 0.004 + (Math.sin(c1) * l1 + Math.sin(c2) * l2) * cx1, -0.058 - (Math.cos(c1) * l1 + Math.cos(c2) * l2) * cx1, A);
        this.limb(g, sk, p1[0], p1[1], p1[2], p2[0], p2[1], p2[2], fh, sg, PROF.finger, st.skin, 0, 1, bk, 2, 0);
      }
      // thumb: from the radial side of the palm, out and across when the hand closes
      const tb = loc(0.021 * bk, 0.006, -0.016, B);
      const ta = 0.55 + curl * 0.5;
      const tt = loc(0.021 * bk + Math.cos(ta) * 0.034, 0.006 + Math.sin(ta) * 0.02 + curl * 0.012, -0.016 - 0.024 - curl * 0.006, C);
      this.limb(g, sk, tb[0], tb[1], tb[2], tt[0], tt[1], tt[2], fh, sg, PROF.thumb, st.skin, 0, 1, bk, 2, 0);
      this.outlineW = ow;
    }
    tattoo(g, sk, jS, jE, fo, sg, b) {
      const P = sk.P, a = jS * 3, e = jE * 3;
      const col = { b: 'rgba(30,25,40,0.28)', d: 'rgba(30,25,40,0.28)', dd: 'rgba(30,25,40,0.28)', l: 'rgba(30,25,40,0.22)', h: 'rgba(30,25,40,0.2)', o: 'rgba(0,0,0,0)' };
      const ow = this.outlineW; this.outlineW = 0; const fl = this.flat; this.flat = true;
      this.limb(g, sk, P[a], P[a + 1], P[a + 2], P[e], P[e + 1], P[e + 2], fo, sg, PROF.ua, col, 0.3, 0.8, b * 0.96, 0);
      this.outlineW = ow; this.flat = fl;
    }

    // ---------------------------------------------------------- legs
    drawThigh(g, sk, st, side) {
      const P = sk.P, jH = side ? J.R_HIP : J.L_HIP, jK = jH + 1, fo = (side ? F.R_TH : F.L_TH) * 9;
      const sg = side ? 1 : -1;
      const b = this.bulk * (st.fem ? 0.95 : 1);
      const a = jH * 3, k = jK * 3;
      if (st.kind === 'ref') {
        this.limb(g, sk, P[a], P[a + 1], P[a + 2], P[k], P[k + 1], P[k + 2], fo, sg, PROF.pantLeg, st.pants, -0.05, 1.0, b, 2);
        return;
      }
      const legSleeve = st.legSleeve === 'both' || (st.legSleeve === 'left' && !side) || (st.legSleeve === 'right' && side);
      this.limb(g, sk, P[a], P[a + 1], P[a + 2], P[k], P[k + 1], P[k + 2], fo, sg, PROF.th, legSleeve ? st.sleeve : st.skin, 0.45, 1.0, b, 2);
      // the shorts hem casts a shadow on the thigh
      if (this.detail > 0 && !this.flat) {
        const ow = this.outlineW; this.outlineW = 0;
        const fl = this.flat; this.flat = true;
        this.limb(g, sk, P[a], P[a + 1], P[a + 2], P[k], P[k + 1], P[k + 2], fo, sg, PROF.th, AO_BAND, 0.78, 0.86, b * 1.01, 0);
        this.outlineW = ow; this.flat = fl;
      }
      // kneecap: a small lighter disc on the front of the knee
      if (this.detail > 1) {
        const R = sk.R, H = sk.dims.H;
        const fsh = (side ? F.R_SH : F.L_SH) * 9;
        const kx = P[k] + R[fsh + 1] * 0.032 * H, ky = P[k + 1] + R[fsh + 4] * 0.032 * H, kz = P[k + 2] + R[fsh + 7] * 0.032 * H + 0.01 * H;
        const cam = this.cam;
        let vx = cam.x - kx, vy = cam.y - ky, vz = cam.z - kz; const vl = Math.hypot(vx, vy, vz) || 1;
        const vis = (R[fsh + 1] * vx + R[fsh + 4] * vy + R[fsh + 7] * vz) / vl;
        if (vis > 0.35) {
          const p = this.proj(kx, ky, kz);
          g.beginPath(); g.ellipse(p.x, p.y, 0.016 * H * p.s, 0.019 * H * p.s, 0, 0, U.TAU);
          g.fillStyle = U.rgba(st.skin.l, 0.55 * (vis - 0.35)); g.fill();
        }
      }
      // baggy shorts leg
      this.limb(g, sk, P[a], P[a + 1], P[a + 2], P[k], P[k + 1], P[k + 2], fo, sg, PROF.shortsLeg, st.shorts, -0.05, 0.79, b, 2);
      this.shortsStripe(g, sk, st, a, k, fo, sg, b);
    }
    shortsStripe(g, sk, st, a, k, fo, sg, b) {
      // stripe down the outer side of the shorts leg, visible when that side faces the camera
      const P = sk.P, R = sk.R, H = sk.dims.H, cam = this.cam;
      const Xx = R[fo] * sg, Xy = R[fo + 3] * sg, Xz = R[fo + 6] * sg;
      const mx = (P[a] + P[k]) * 0.5, my = (P[a + 1] + P[k + 1]) * 0.5, mz = (P[a + 2] + P[k + 2]) * 0.5;
      let cx = cam.x - mx, cy = cam.y - my, cz = cam.z - mz;
      const cl = Math.sqrt(cx * cx + cy * cy + cz * cz); cx /= cl; cy /= cl; cz /= cl;
      const vis = Xx * cx + Xy * cy + Xz * cz;
      if (vis < 0.12) return;
      const r = 0.079 * H * b * (1 + this.musc * 0.3);
      g.beginPath();
      for (let i = 0; i <= 4; i++) {
        const t = -0.02 + 0.79 * i / 4;
        const p = this.proj(P[a] + (P[k] - P[a]) * t + Xx * r, P[a + 1] + (P[k + 1] - P[a + 1]) * t + Xy * r, P[a + 2] + (P[k + 2] - P[a + 2]) * t + Xz * r);
        if (i === 0) g.moveTo(p.x, p.y); else g.lineTo(p.x, p.y);
      }
      g.strokeStyle = U.rgba(st.trim, Math.min(1, vis * 1.6));
      g.lineWidth = Math.max(1, 0.028 * H * this.pt.s);
      g.stroke();
    }
    drawShank(g, sk, st, side) {
      const P = sk.P, jK = side ? J.R_KN : J.L_KN, jA = jK + 1, fo = (side ? F.R_SH : F.L_SH) * 9;
      const sg = side ? 1 : -1;
      const b = this.bulk * (st.fem ? 0.93 : 1);
      const k = jK * 3, a = jA * 3;
      if (st.kind === 'ref') {
        this.limb(g, sk, P[k], P[k + 1], P[k + 2], P[a], P[a + 1], P[a + 2], fo, sg, PROF.pantShin, st.pants, -0.04, 1.02, b, 2);
        return;
      }
      const legSleeve = st.legSleeve === 'both' || (st.legSleeve === 'left' && !side) || (st.legSleeve === 'right' && side);
      this.limb(g, sk, P[k], P[k + 1], P[k + 2], P[a], P[a + 1], P[a + 2], fo, sg, PROF.sh, legSleeve ? st.sleeve : st.skin, -0.03, 1.0, b, 1);
      // sock (mid-calf crew)
      this.limb(g, sk, P[k], P[k + 1], P[k + 2], P[a], P[a + 1], P[a + 2], fo, sg, PROF.sh, st.sock, 0.6, 1.03, b * 1.04, 0);
    }
    drawFoot(g, sk, st, side) {
      const P = sk.P, R = sk.R, H = sk.dims.H;
      const jA = side ? J.R_AN : J.L_AN, fo = (side ? F.R_FT : F.L_FT) * 9;
      const sg = side ? 1 : -1;
      const ax = P[jA * 3], ay = P[jA * 3 + 1], az = P[jA * 3 + 2];
      const bx = P[(jA + 2) * 3], by = P[(jA + 2) * 3 + 1], bz = P[(jA + 2) * 3 + 2]; // ball
      const tx = P[(jA + 3) * 3], ty = P[(jA + 3) * 3 + 1], tz = P[(jA + 3) * 3 + 2]; // toe tip
      const d = sk.dims;
      const fw = d.footW * (st.fem ? 0.92 : 1);
      const pts = this._footPts || (this._footPts = new Float32Array(64));
      let n = 0;
      const addL = (lx, ly, lz) => {
        const wx = ax + R[fo] * lx + R[fo + 1] * ly + R[fo + 2] * lz;
        const wy = ay + R[fo + 3] * lx + R[fo + 4] * ly + R[fo + 5] * lz;
        const wz = az + R[fo + 6] * lx + R[fo + 7] * ly + R[fo + 8] * lz;
        const p = this.proj(wx, wy, wz); pts[n++] = p.x; pts[n++] = p.y;
      };
      let dx = tx - bx, dy = ty - by, dz = tz - bz;
      const dl = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1; dx /= dl; dy /= dl; dz /= dl;
      const Xx = R[fo], Xy = R[fo + 3], Xz = R[fo + 6];
      const addT = (lat, along, up) => {
        const wx = bx + Xx * lat + dx * along + R[fo + 2] * up;
        const wy = by + Xy * lat + dy * along + R[fo + 5] * up;
        const wz = bz + Xz * lat + dz * along + R[fo + 8] * up;
        const p = this.proj(wx, wy, wz); pts[n++] = p.x; pts[n++] = p.y;
      };
      const soleTop = -d.ankH + 0.013 * H;
      // sole
      n = 0;
      addL(-fw * 0.75, -d.heel * 1.05, -d.ankH); addL(fw * 0.75, -d.heel * 1.05, -d.ankH);
      addL(-fw * 0.8, -d.heel * 1.05, soleTop); addL(fw * 0.8, -d.heel * 1.05, soleTop);
      addL(-fw, d.ball * 0.75, -d.ankH); addL(fw, d.ball * 0.75, -d.ankH);
      addL(-fw, d.ball * 0.75, soleTop); addL(fw, d.ball * 0.75, soleTop);
      addT(-fw * 0.85, 0.0, 0); addT(fw * 0.85, 0.0, 0);
      addT(-fw * 0.55, d.toe * 1.0, 0.0); addT(fw * 0.55, d.toe * 1.0, 0.0);
      addT(-fw * 0.55, d.toe * 1.0, 0.013 * H); addT(fw * 0.55, d.toe * 1.0, 0.013 * H);
      this.hullFill(g, pts, n, st.sole, 0.8);
      // upper
      n = 0;
      addL(-fw * 0.78, -d.heel * 1.0, soleTop); addL(fw * 0.78, -d.heel * 1.0, soleTop);
      addL(-fw * 0.72, -d.heel * 0.85, 0.035 * H); addL(fw * 0.72, -d.heel * 0.85, 0.035 * H); // collar (high-top)
      addL(-fw * 0.7, 0.025 * H, 0.03 * H); addL(fw * 0.7, 0.025 * H, 0.03 * H); // tongue
      addL(-fw * 0.95, d.ball * 0.6, soleTop); addL(fw * 0.95, d.ball * 0.6, soleTop);
      addL(-fw * 0.8, d.ball * 0.7, -d.ankH + 0.042 * H); addL(fw * 0.8, d.ball * 0.7, -d.ankH + 0.042 * H);
      addT(-fw * 0.85, 0, 0.013 * H); addT(fw * 0.85, 0, 0.013 * H);
      addT(-fw * 0.55, d.toe * 0.95, 0.014 * H); addT(fw * 0.55, d.toe * 0.95, 0.014 * H);
      addT(-fw * 0.6, d.toe * 0.5, 0.034 * H); addT(fw * 0.6, d.toe * 0.5, 0.034 * H);
      this.hullFill(g, pts, n, st.shoe, 1, true);
      // laces and the accent stripe on the lateral side
      const cam = this.cam;
      let cx = cam.x - ax, cy = cam.y - ay, cz = cam.z - az;
      const cl = Math.sqrt(cx * cx + cy * cy + cz * cz);
      const vis = (Xx * sg * cx + Xy * sg * cy + Xz * sg * cz) / cl;
      if (vis > 0.1) {
        n = 0;
        addL(sg * fw * 1.01, -d.heel * 0.7, 0.012 * H);
        addL(sg * fw * 1.01, d.ball * 0.55, -d.ankH + 0.022 * H);
        addL(sg * fw * 1.01, d.ball * 0.2, -d.ankH + 0.03 * H);
        g.beginPath(); g.moveTo(pts[0], pts[1]); g.quadraticCurveTo(pts[4], pts[5], pts[2], pts[3]);
        g.strokeStyle = U.rgba(st.shoeAccent, Math.min(1, vis * 1.8));
        g.lineWidth = Math.max(1, 0.012 * H * this.pt.s);
        g.stroke();
      }
      if (this.detail > 1) {
        const up = (R[fo + 2] * (cam.x - ax) + R[fo + 5] * (cam.y - ay) + R[fo + 8] * (cam.z - az)) / cl;
        if (up > 0.25) {
          n = 0;
          for (let i = 0; i < 3; i++) { const yy = 0.006 * H + i * 0.012 * H; addL(-fw * 0.42, yy, 0.028 * H - i * 0.004 * H); addL(fw * 0.42, yy, 0.028 * H - i * 0.004 * H); }
          g.strokeStyle = U.rgba(U.lum(st.shoe) > 0.5 ? '#9a9a9a' : '#3a3a3a', 0.6 * up);
          g.lineWidth = Math.max(0.6, 0.004 * H * this.pt.s);
          g.beginPath();
          for (let i = 0; i < 3; i++) { g.moveTo(pts[i * 4], pts[i * 4 + 1]); g.lineTo(pts[i * 4 + 2], pts[i * 4 + 3]); }
          g.stroke();
        }
      }
    }
    hullFill(g, pts, n, color, outlineK, shadeTop) {
      const m = n >> 1;
      const idx = this._hidx || (this._hidx = []);
      idx.length = 0;
      for (let i = 0; i < m; i++) idx.push(i);
      idx.sort((a, b) => pts[a * 2] - pts[b * 2] || pts[a * 2 + 1] - pts[b * 2 + 1]);
      const hull = this._hull || (this._hull = []);
      hull.length = 0;
      const cross = (o, a, b) => (pts[a * 2] - pts[o * 2]) * (pts[b * 2 + 1] - pts[o * 2 + 1]) - (pts[a * 2 + 1] - pts[o * 2 + 1]) * (pts[b * 2] - pts[o * 2]);
      for (const i of idx) { while (hull.length >= 2 && cross(hull[hull.length - 2], hull[hull.length - 1], i) <= 0) hull.pop(); hull.push(i); }
      const lower = hull.length + 1;
      for (let q = idx.length - 2; q >= 0; q--) { const i = idx[q]; while (hull.length >= lower && cross(hull[hull.length - 2], hull[hull.length - 1], i) <= 0) hull.pop(); hull.push(i); }
      hull.pop();
      if (hull.length < 3) return;
      g.beginPath();
      g.moveTo(pts[hull[0] * 2], pts[hull[0] * 2 + 1]);
      for (let i = 1; i < hull.length; i++) g.lineTo(pts[hull[i] * 2], pts[hull[i] * 2 + 1]);
      g.closePath();
      if (shadeTop && !this.flat) {
        let minY = 1e9, maxY = -1e9;
        for (const i of hull) { minY = Math.min(minY, pts[i * 2 + 1]); maxY = Math.max(maxY, pts[i * 2 + 1]); }
        const gr = g.createLinearGradient(0, minY, 0, maxY);
        gr.addColorStop(0, U.shade(color, 0.25)); gr.addColorStop(1, U.shade(color, -0.3));
        g.fillStyle = gr;
      } else g.fillStyle = color;
      g.fill();
      if (this.outlineW) { g.strokeStyle = OUTLINE; g.lineWidth = this.outlineW * outlineK; g.stroke(); }
    }

    refShirt(st) {
      return st._refShirt || (st._refShirt = tri('#dedede'));
    }

    // ---------------------------------------------------------- torso
    _sec(s, sk, jo, fo, ox, oy, oz, w, f, b) {
      const P = sk.P, R = sk.R, H = sk.dims.H;
      s.x = P[jo] + (R[fo] * ox + R[fo + 1] * oy + R[fo + 2] * oz) * H;
      s.y = P[jo + 1] + (R[fo + 3] * ox + R[fo + 4] * oy + R[fo + 5] * oz) * H;
      s.z = P[jo + 2] + (R[fo + 6] * ox + R[fo + 7] * oy + R[fo + 8] * oz) * H;
      s.rx = R[fo]; s.ry = R[fo + 3]; s.rz = R[fo + 6];
      s.fx = R[fo + 1]; s.fy = R[fo + 4]; s.fz = R[fo + 7];
      s.ux = R[fo + 2]; s.uy = R[fo + 5]; s.uz = R[fo + 8];
      s.w = w * H; s.f = f * H; s.b = b * H;
      return s;
    }
    drawTorso(g, sk, st) {
      const secs = this._secs || (this._secs = Array.from({ length: 10 }, () => ({})));
      const fem = st.fem, bk = this.bulk, H = sk.dims.H;
      const mus = 1 + this.musc * 0.5;
      const chestW = (fem ? 0.088 : 0.098) * bk * mus, lat = (fem ? 0.092 : 0.104) * bk * mus;
      const waist = (fem ? 0.076 : 0.087) * bk, hip = (fem ? 0.1 : 0.095) * bk;
      // skin: upper torso, the traps sloping from the neck out to the shoulders
      this._sec(secs[0], sk, J.SPN * 3, F.SPN * 9, 0, 0, 0.04, waist * 1.0, 0.058 * bk, 0.056 * bk);
      this._sec(secs[1], sk, J.CHS * 3, F.CHS * 9, 0, 0, 0.0, chestW, (fem ? 0.076 : 0.07) * bk, 0.064 * bk);
      this._sec(secs[2], sk, J.CHS * 3, F.CHS * 9, 0, 0, 0.05, lat, 0.068 * bk, 0.066 * bk);
      this._sec(secs[3], sk, J.CHS * 3, F.CHS * 9, 0, -0.006, 0.085, 0.104 * bk * mus, 0.05 * bk, 0.054 * bk);
      this._sec(secs[4], sk, J.CHS * 3, F.CHS * 9, 0, -0.01, 0.104, 0.062 * bk * mus, 0.036 * bk, 0.046 * bk);
      let k = this.sections(g, secs, 5, null);
      const skinTop = st.kind === 'ref' ? this.refShirt(st) : st.skin;
      this.fillOutline(g, k, skinTop, 2);
      // jersey body: loose tank top hanging nearly straight from the chest
      const jer = st.kind === 'ref' ? this.refShirt(st) : st.jersey;
      this._sec(secs[0], sk, J.PEL * 3, F.PEL * 9, 0, 0, 0.0, hip * 0.99, 0.066 * bk, 0.07 * bk);
      this._sec(secs[1], sk, J.PEL * 3, F.PEL * 9, 0, 0, 0.05, waist * 1.04, 0.064 * bk, 0.062 * bk);
      this._sec(secs[2], sk, J.SPN * 3, F.SPN * 9, 0, 0, 0.02, waist * 1.03, 0.064 * bk, 0.06 * bk);
      this._sec(secs[3], sk, J.SPN * 3, F.SPN * 9, 0, 0, 0.065, (waist + chestW) * 0.5 * 1.03, 0.069 * bk, 0.062 * bk);
      this._sec(secs[4], sk, J.CHS * 3, F.CHS * 9, 0, 0, 0.0, chestW * 1.03, (fem ? 0.08 : 0.074) * bk, 0.066 * bk);
      this._sec(secs[5], sk, J.CHS * 3, F.CHS * 9, 0, 0, 0.045, lat * 0.93, 0.071 * bk, 0.066 * bk);
      k = this.sections(g, secs, 6, null);
      // straps + neckline
      const L = this.L, Rr = this.Rr;
      const top = this._sec(secs[6], sk, J.CHS * 3, F.CHS * 9, 0, -0.008, 0.1, 0.05 * bk, 0.038 * bk, 0.046 * bk);
      const Nn = this.silN(top.x, top.y, top.z, top.ux, top.uy, top.uz);
      const nL = Nn[0] * top.rx + Nn[1] * top.ry + Nn[2] * top.rz;
      const nA = Nn[0] * top.fx + Nn[1] * top.fy + Nn[2] * top.fz;
      const hw = Math.sqrt(top.w * top.w * nL * nL + (nA > 0 ? top.f : top.b) ** 2 * nA * nA);
      let p = this.proj(top.x + Nn[0] * hw, top.y + Nn[1] * hw, top.z + Nn[2] * hw);
      const sLx = p.x, sLy = p.y;
      p = this.proj(top.x - Nn[0] * hw, top.y - Nn[1] * hw, top.z - Nn[2] * hw);
      const sRx = p.x, sRy = p.y;
      const cam = this.cam;
      let cx = cam.x - top.x, cy = cam.y - top.y, cz = cam.z - top.z;
      const cl = Math.sqrt(cx * cx + cy * cy + cz * cz); cx /= cl; cy /= cl; cz /= cl;
      const front = top.fx * cx + top.fy * cy + top.fz * cz;
      const depthOff = front > 0 ? 0.05 : -0.05, drop = front > 0 ? 0.05 : 0.018;
      const nk = this.proj(top.x + (top.fx * depthOff - top.ux * drop) * H, top.y + (top.fy * depthOff - top.uy * drop) * H, top.z + (top.fz * depthOff - top.uz * drop) * H);
      g.beginPath();
      g.moveTo(L[0], L[1]);
      const n = k >> 1;
      for (let i = 1; i < n; i++) g.lineTo(L[i * 2], L[i * 2 + 1]);
      g.quadraticCurveTo((L[k - 2] * 0.6 + sLx * 0.4), (L[k - 1] * 0.3 + sLy * 0.7), sLx, sLy);
      g.quadraticCurveTo((sLx + nk.x) * 0.5, nk.y, nk.x, nk.y);
      g.quadraticCurveTo((sRx + nk.x) * 0.5, nk.y, sRx, sRy);
      g.quadraticCurveTo((Rr[k - 2] * 0.6 + sRx * 0.4), (Rr[k - 1] * 0.3 + sRy * 0.7), Rr[k - 2], Rr[k - 1]);
      for (let i = n - 2; i >= 0; i--) g.lineTo(Rr[i * 2], Rr[i * 2 + 1]);
      g.closePath();
      const mi = 4 * 2;
      this.shade(g, L[mi], L[mi + 1], Rr[mi], Rr[mi + 1], jer);
      g.fill();
      if (st.kind === 'ref') this.refStripes(g, sk);
      else if (this.detail > 0 && !this.flat) this.jerseyFolds(g, sk, st, k);
      if (this.outlineW) { g.strokeStyle = OUTLINE; g.lineWidth = this.outlineW; g.stroke(); }
      // trim on neckline and armholes
      if (st.kind !== 'ref' && this.outlineW) {
        g.beginPath();
        g.moveTo(L[k - 2], L[k - 1]);
        g.quadraticCurveTo((L[k - 2] * 0.6 + sLx * 0.4), (L[k - 1] * 0.3 + sLy * 0.7), sLx, sLy);
        g.quadraticCurveTo((sLx + nk.x) * 0.5, nk.y, nk.x, nk.y);
        g.quadraticCurveTo((sRx + nk.x) * 0.5, nk.y, sRx, sRy);
        g.quadraticCurveTo((Rr[k - 2] * 0.6 + sRx * 0.4), (Rr[k - 1] * 0.3 + sRy * 0.7), Rr[k - 2], Rr[k - 1]);
        g.strokeStyle = st.trim;
        g.lineWidth = Math.max(1, 0.012 * H * this.pt.s);
        g.stroke();
      }
      this.drawNumber(g, sk, st, front);
      // shorts / pants block
      const sh = st.kind === 'ref' ? st.pants : st.shorts;
      this._sec(secs[0], sk, J.PEL * 3, F.PEL * 9, 0, 0, 0.055, hip * 1.0, 0.066 * bk, 0.07 * bk);
      this._sec(secs[1], sk, J.PEL * 3, F.PEL * 9, 0, 0, 0.0, hip * 1.06, 0.072 * bk, 0.08 * bk);
      this._sec(secs[2], sk, J.PEL * 3, F.PEL * 9, 0, 0, -0.06, hip * 1.04, 0.068 * bk, 0.076 * bk);
      k = this.sections(g, secs, 3, null);
      this.fillOutline(g, k, sh, 2);
      if (this.outlineW) {
        const P = sk.P, R = sk.R, fo = F.PEL * 9;
        const c0 = this.proj(P[0] + R[fo + 1] * 0.06 * H - R[fo + 2] * 0.03 * H, P[1] + R[fo + 4] * 0.06 * H - R[fo + 5] * 0.03 * H, P[2] + R[fo + 7] * 0.06 * H - R[fo + 8] * 0.03 * H);
        const x0 = c0.x, y0 = c0.y;
        const c1 = this.proj(P[0] + R[fo + 1] * 0.05 * H - R[fo + 2] * 0.11 * H, P[1] + R[fo + 4] * 0.05 * H - R[fo + 5] * 0.11 * H, P[2] + R[fo + 7] * 0.05 * H - R[fo + 8] * 0.11 * H);
        g.beginPath(); g.moveTo(x0, y0); g.lineTo(c1.x, c1.y);
        g.strokeStyle = U.rgba('#000000', 0.25); g.lineWidth = this.outlineW; g.stroke();
      }
      // waistband, with the jersey's shadow just below it
      this._sec(secs[0], sk, J.PEL * 3, F.PEL * 9, 0, 0, 0.056, hip * 1.01, 0.067 * bk, 0.071 * bk);
      this._sec(secs[1], sk, J.PEL * 3, F.PEL * 9, 0, 0, 0.042, hip * 1.03, 0.069 * bk, 0.074 * bk);
      k = this.sections(g, secs, 2, null);
      g.beginPath();
      g.moveTo(L[0], L[1]); g.lineTo(L[2], L[3]); g.lineTo(Rr[2], Rr[3]); g.lineTo(Rr[0], Rr[1]); g.closePath();
      g.fillStyle = st.kind === 'ref' ? '#050505' : U.rgba(U.mix(st.trim, sh.b, 0.35), 0.95);
      g.fill();
    }
    /** a couple of soft folds where the tank top hangs from the chest (drawn inside the jersey path) */
    jerseyFolds(g, sk, st, k) {
      const L = this.L, Rr = this.Rr;
      g.save(); g.clip();
      const n = k >> 1;
      const i0 = 2, i1 = 4;
      g.strokeStyle = 'rgba(0,0,0,0.07)';
      g.lineWidth = Math.max(0.8, this.outlineW * 1.4);
      g.beginPath();
      const ax = L[i0 * 2] * 0.7 + Rr[i0 * 2] * 0.3, ay = L[i0 * 2 + 1] * 0.7 + Rr[i0 * 2 + 1] * 0.3;
      const bx = L[i1 * 2] * 0.62 + Rr[i1 * 2] * 0.38, by = L[i1 * 2 + 1] * 0.62 + Rr[i1 * 2 + 1] * 0.38;
      g.moveTo(ax, ay); g.quadraticCurveTo((ax + bx) * 0.5 - 2, (ay + by) * 0.5, bx, by);
      const cx = L[i0 * 2] * 0.3 + Rr[i0 * 2] * 0.7, cy = L[i0 * 2 + 1] * 0.3 + Rr[i0 * 2 + 1] * 0.7;
      const dx = L[i1 * 2] * 0.36 + Rr[i1 * 2] * 0.64, dy = L[i1 * 2 + 1] * 0.36 + Rr[i1 * 2 + 1] * 0.64;
      g.moveTo(cx, cy); g.quadraticCurveTo((cx + dx) * 0.5 + 2, (cy + dy) * 0.5, dx, dy);
      g.stroke();
      // side panel in the trim colour
      g.strokeStyle = U.rgba(st.trim, 0.55);
      g.lineWidth = Math.max(1, this.outlineW * 2.2);
      g.beginPath();
      g.moveTo(L[0] * 0.9 + Rr[0] * 0.1, L[1]); g.lineTo(L[(n - 1) * 2] * 0.9 + Rr[(n - 1) * 2] * 0.1, L[(n - 1) * 2 + 1]);
      g.moveTo(Rr[0] * 0.9 + L[0] * 0.1, Rr[1]); g.lineTo(Rr[(n - 1) * 2] * 0.9 + L[(n - 1) * 2] * 0.1, Rr[(n - 1) * 2 + 1]);
      g.stroke();
      g.restore();
      void st;
    }

    refStripes(g, sk) {
      g.save();
      g.clip();
      const P = sk.P, R = sk.R, H = sk.dims.H;
      const fo = F.CHS * 9;
      g.strokeStyle = '#161616';
      g.lineWidth = Math.max(1.2, 0.026 * H * this.pt.s);
      for (let i = -4; i <= 4; i++) {
        const off = i * 0.05 * H;
        const cx = P[J.CHS * 3] + R[fo] * off, cy = P[J.CHS * 3 + 1] + R[fo + 3] * off, cz = P[J.CHS * 3 + 2] + R[fo + 6] * off;
        const a = this.proj(cx - R[fo + 2] * 0.3 * H, cy - R[fo + 5] * 0.3 * H, cz - R[fo + 8] * 0.3 * H);
        const ax = a.x, ay = a.y;
        const b = this.proj(cx + R[fo + 2] * 0.15 * H, cy + R[fo + 5] * 0.15 * H, cz + R[fo + 8] * 0.15 * H);
        g.beginPath(); g.moveTo(ax, ay); g.lineTo(b.x, b.y); g.stroke();
      }
      g.restore();
    }

    drawNumber(g, sk, st, front) {
      if (!st.num || Math.abs(front) < 0.18) return;
      const P = sk.P, R = sk.R, H = sk.dims.H, fo = F.CHS * 9;
      const isFront = front > 0;
      const depth = (isFront ? 0.074 : -0.068) * this.bulk * H;
      const up = isFront ? -0.012 : 0.0;
      const cx = P[J.CHS * 3] + R[fo + 1] * depth + R[fo + 2] * up * H;
      const cy = P[J.CHS * 3 + 1] + R[fo + 4] * depth + R[fo + 5] * up * H;
      const cz = P[J.CHS * 3 + 2] + R[fo + 7] * depth + R[fo + 8] * up * H;
      const ux = isFront ? -1 : 1;
      const size = (isFront ? 0.075 : 0.092) * H;
      const o = this.proj(cx, cy, cz); const ox = o.x, oy = o.y;
      const a = this.proj(cx + R[fo] * ux * size, cy + R[fo + 3] * ux * size, cz + R[fo + 6] * ux * size);
      const axx = a.x - ox, axy = a.y - oy;
      const b = this.proj(cx - R[fo + 2] * size, cy - R[fo + 5] * size, cz - R[fo + 8] * size);
      const byx = b.x - ox, byy = b.y - oy;
      if (Math.abs(axx * byy - axy * byx) < 0.5) return;
      const k = 1 / 100, dpr = this.dpr;
      g.save();
      g.setTransform(axx * k * dpr, axy * k * dpr, byx * k * dpr, byy * k * dpr, ox * dpr, oy * dpr);
      g.font = '900 100px ' + FONT_NUM;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.globalAlpha *= U.clamp((Math.abs(front) - 0.18) * 4, 0, 1);
      g.lineJoin = 'round';
      g.lineWidth = 16;
      g.strokeStyle = st.kind === 'ref' ? '#ffffff' : st.trim;
      if (st.kind !== 'ref') g.strokeText(st.num, 0, 8);
      g.fillStyle = st.numColor;
      g.fillText(st.num, 0, 8);
      g.restore();
    }

    // ---------------------------------------------------------- head
    drawHead(g, sk, st) {
      const P = sk.P, R = sk.R, H = sk.dims.H, cam = this.cam;
      const Fe = st.F || {};
      const ft = (k) => (Fe[k] == null ? 0.5 : Fe[k]);
      const fn = F.NCK * 9, fh = F.HED * 9;
      // neck (slightly wider for a strong neck), with the chin's shadow on it
      const n0 = J.NCK * 3, n1 = J.HJ * 3;
      const nb = this.bulk * (st.fem ? 0.82 : 1) * (0.9 + ft('neck') * 0.24);
      this.limb(g, sk, P[n0], P[n0 + 1], P[n0 + 2], P[n1], P[n1 + 1], P[n1 + 2], fn, 1, PROF.neck, st.skin, 0.12, 1.0, nb, 0);
      if (this.detail > 0 && !this.flat) {
        const ow = this.outlineW; this.outlineW = 0; const fl = this.flat; this.flat = true;
        this.limb(g, sk, P[n0], P[n0 + 1], P[n0 + 2], P[n1], P[n1 + 1], P[n1 + 2], fn, 1, PROF.neck, AO_BAND, 0.62, 1.0, nb * 1.01, 0);
        this.outlineW = ow; this.flat = fl;
      }
      const hc = J.HC * 3;
      const c = this.proj(P[hc], P[hc + 1], P[hc + 2]);
      const cxs = c.x, cys = c.y, s = c.s;
      const Rh = sk.dims.headR * s * (st.fem ? 0.97 : 1);
      const uy = cam.sp, uz = cam.cp, tcy = -cam.cp, tcz = cam.sp;
      const Xx = R[fh], Xy = R[fh + 3], Xz = R[fh + 6];
      const Yx = R[fh + 1], Yy = R[fh + 4], Yz = R[fh + 7];
      const Zx = R[fh + 2], Zy = R[fh + 5], Zz = R[fh + 8];
      const scr = (lx, ly, lz, rad, out) => {
        const wx = Xx * lx + Yx * ly + Zx * lz, wy = Xy * lx + Yy * ly + Zy * lz, wz = Xz * lx + Yz * ly + Zz * lz;
        out[0] = cxs + rad * wx;
        out[1] = cys - rad * (wy * uy + wz * uz);
        out[2] = wy * tcy + wz * tcz; // facing camera
        return out;
      };
      const q = this._q || (this._q = new Float64Array(3));
      const faceDot = Yy * tcy + Yz * tcz;
      const sideDot = Xy * tcy + Xz * tcz; // + when the head's right side faces the camera
      this.scr = scr; this.Rh = Rh; this.faceDot = faceDot; this.sideDot = sideDot;
      // hair behind the head
      if (st.hair === 'afro' || st.hair === 'puffs') this.bigHair(g, st, scr, q, Rh);
      if (st.hair === 'long' || st.hair === 'locs' || st.hair === 'braids' || st.hair === 'twists' || st.hair === 'bob') this.backHair(g, st, scr, q, Rh, sk);
      if (st.hair === 'ponytail' || st.hair === 'bun') this.tieHair(g, st, scr, q, Rh, faceDot < 0);
      // skull shape from the features: a longer / rounder face, jaw width, chin length
      const faceLen = ft('faceLen'), jawF = ft('jaw'), chinF = ft('chin');
      const rxK = 1 - (faceLen - 0.5) * 0.14, ryK = 1 + (faceLen - 0.5) * 0.16;
      const jw = 0.6 + (jawF - 0.5) * 0.32 - (st.fem ? 0.05 : 0);
      const cl = 1 + (chinF - 0.5) * 0.22 + (faceLen - 0.5) * 0.28;
      const skin = st.skin;
      const jawPts = this._jaw || (this._jaw = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]]);
      const setJ = (i, x, y, z) => { jawPts[i][0] = x; jawPts[i][1] = y; jawPts[i][2] = z; };
      setJ(0, -jw * 0.95, -0.42, -0.5); setJ(1, -jw, 0.08, -0.52); setJ(2, -jw * 0.5, 0.58, -0.98 * cl); setJ(3, 0, 0.7, -1.06 * cl);
      setJ(4, jw * 0.5, 0.58, -0.98 * cl); setJ(5, jw, 0.08, -0.52); setJ(6, jw * 0.95, -0.42, -0.5); setJ(7, 0, -0.55, -0.72);
      const jawPath = (inset) => {
        g.beginPath();
        for (let i = 0; i < 8; i++) { const p = jawPts[i]; scr(p[0] * inset, p[1] * inset, p[2] * inset, Rh, q); if (i === 0) g.moveTo(q[0], q[1]); else g.lineTo(q[0], q[1]); }
        g.closePath();
      };
      // jaw (drawn first, the cranium overlaps)
      jawPath(1);
      if (!this.flat) {
        const gr = g.createLinearGradient(cxs - Rh, cys, cxs + Rh, cys);
        gr.addColorStop(0, skin.l); gr.addColorStop(0.5, skin.b); gr.addColorStop(1, skin.d);
        g.fillStyle = gr;
      } else g.fillStyle = skin.b;
      g.fill();
      if (this.outlineW) { g.strokeStyle = skin.o; g.lineWidth = this.outlineW; g.stroke(); }
      // cranium
      g.beginPath();
      g.ellipse(cxs, cys, Rh * 0.94 * rxK, Rh * 1.0 * ryK, 0, 0, U.TAU);
      if (!this.flat) {
        const gr = g.createRadialGradient(cxs - Rh * 0.35, cys - Rh * 0.45, Rh * 0.15, cxs, cys, Rh * 1.1);
        gr.addColorStop(0, skin.h); gr.addColorStop(0.5, skin.b); gr.addColorStop(1, skin.d);
        g.fillStyle = gr;
      } else g.fillStyle = skin.b;
      g.fill();
      if (this.outlineW) { g.strokeStyle = skin.o; g.lineWidth = this.outlineW; g.stroke(); }
      // re-fill the jaw without outline to merge the silhouettes (inset a hair)
      jawPath(0.985);
      if (!this.flat) {
        const gr = g.createLinearGradient(cxs - Rh, cys, cxs + Rh, cys);
        gr.addColorStop(0, skin.l); gr.addColorStop(0.5, skin.b); gr.addColorStop(1, skin.d);
        g.fillStyle = gr;
      } else g.fillStyle = skin.b;
      g.fill();
      // cheek plane: the shadow side of the face turns away from the light
      if (!this.flat && faceDot > -0.2) {
        scr(0.62, 0.62, -0.25, Rh, q);
        if (q[2] > 0) {
          const gr = g.createRadialGradient(q[0], q[1], 0, q[0], q[1], Rh * 0.55);
          gr.addColorStop(0, U.rgba(skin.d, 0.28 + ft('cheek') * 0.15)); gr.addColorStop(1, U.rgba(skin.d, 0));
          g.fillStyle = gr; g.beginPath(); g.ellipse(q[0], q[1], Rh * 0.5, Rh * 0.6, 0, 0, U.TAU); g.fill();
        }
      }
      // ears
      const es = 0.85 + ft('earSize') * 0.4;
      for (const sgn of [-1, 1]) {
        scr(sgn * 0.97, -0.03, -0.06, Rh, q);
        const earVis = (Xy * sgn) * tcy + (Xz * sgn) * tcz;
        if (earVis > -0.2) {
          const erx = (Rh * 0.13 + Rh * 0.12 * Math.abs(earVis)) * es, ery = Rh * 0.25 * es;
          g.beginPath(); g.ellipse(q[0], q[1], erx, ery, 0, 0, U.TAU);
          g.fillStyle = skin.b; g.fill();
          if (this.outlineW) { g.strokeStyle = skin.o; g.lineWidth = this.outlineW * 0.8; g.stroke(); }
          if (this.detail > 0) {
            g.beginPath(); g.ellipse(q[0] - sgn * erx * 0.15, q[1] + ery * 0.08, erx * 0.5, ery * 0.55, 0, 0, U.TAU);
            g.fillStyle = U.rgba(skin.dd, 0.55); g.fill();
          }
        }
      }
      // facial hair, then the face
      if (st.beard && st.beard !== 'none' && faceDot > -0.35) this.beard(g, st, scr, q, Rh, faceDot, jw, cl);
      if (faceDot > -0.05) this.face(g, st, scr, q, Rh, faceDot);
      // hair
      this.hairCap(g, sk, st, Rh, cxs, cys);
      if (st.headband) this.headband(g, sk, st, Rh, cxs, cys);
    }

    /** visible region of a spherical cap (axis a in head-local coords, half-angle th) */
    capPath(g, sk, cxs, cys, Rh, alx, aly, alz, th, flatten) {
      const R = sk.R, fh = F.HED * 9, cam = this.cam;
      const toW = (lx, ly, lz, out) => {
        out[0] = R[fh] * lx + R[fh + 1] * ly + R[fh + 2] * lz;
        out[1] = R[fh + 3] * lx + R[fh + 4] * ly + R[fh + 5] * lz;
        out[2] = R[fh + 6] * lx + R[fh + 7] * ly + R[fh + 8] * lz;
        return out;
      };
      const a = toW(alx, aly, alz, this._ca || (this._ca = new Float64Array(3)));
      const al = Math.hypot(a[0], a[1], a[2]); a[0] /= al; a[1] /= al; a[2] /= al;
      let e1x = -a[1], e1y = a[0], e1z = 0;
      let l = Math.hypot(e1x, e1y, e1z);
      if (l < 1e-3) { e1x = 1; e1y = 0; e1z = 0; l = 1; }
      e1x /= l; e1y /= l; e1z /= l;
      const e2x = a[1] * e1z - a[2] * e1y, e2y = a[2] * e1x - a[0] * e1z, e2z = a[0] * e1y - a[1] * e1x;
      const uy = cam.sp, uz = cam.cp, tcy = -cam.cp, tcz = cam.sp;
      const ct = Math.cos(th), stt = Math.sin(th);
      const NSA = 36;
      const pts = this._cap || (this._cap = new Float32Array(NSA * 3));
      let nVis = 0;
      for (let i = 0; i < NSA; i++) {
        const t = i / NSA * U.TAU, c = Math.cos(t), s = Math.sin(t);
        const nx = a[0] * ct + (e1x * c + e2x * s) * stt;
        const ny = a[1] * ct + (e1y * c + e2y * s) * stt;
        const nz = a[2] * ct + (e1z * c + e2z * s) * stt;
        pts[i * 3] = cxs + Rh * 0.94 * nx * (flatten || 1);
        pts[i * 3 + 1] = cys - Rh * 1.02 * (ny * uy + nz * uz);
        pts[i * 3 + 2] = ny * tcy + nz * tcz;
        if (pts[i * 3 + 2] > 0) nVis++;
      }
      const aVis = a[1] * tcy + a[2] * tcz;
      g.beginPath();
      if (nVis === NSA) {
        for (let i = 0; i < NSA; i++) { if (i === 0) g.moveTo(pts[0], pts[1]); else g.lineTo(pts[i * 3], pts[i * 3 + 1]); }
        g.closePath();
        return true;
      }
      if (nVis === 0) {
        if (aVis > 0 || ct < -0.2) { g.ellipse(cxs, cys, Rh * 0.94, Rh * 1.02, 0, 0, U.TAU); return true; }
        return false;
      }
      let start = 0;
      for (let i = 0; i < NSA; i++) { const prev = (i + NSA - 1) % NSA; if (pts[i * 3 + 2] > 0 && pts[prev * 3 + 2] <= 0) { start = i; break; } }
      const ip = (i0, i1) => {
        const d0 = pts[i0 * 3 + 2], d1 = pts[i1 * 3 + 2];
        const t = d0 / (d0 - d1);
        return [pts[i0 * 3] + (pts[i1 * 3] - pts[i0 * 3]) * t, pts[i0 * 3 + 1] + (pts[i1 * 3 + 1] - pts[i0 * 3 + 1]) * t];
      };
      const entry = ip((start + NSA - 1) % NSA, start);
      g.moveTo(entry[0], entry[1]);
      let i = start, cnt = 0;
      while (pts[i * 3 + 2] > 0 && cnt < NSA) { g.lineTo(pts[i * 3], pts[i * 3 + 1]); i = (i + 1) % NSA; cnt++; }
      const exit = ip((i + NSA - 1) % NSA, i);
      g.lineTo(exit[0], exit[1]);
      const angOf = (p) => Math.atan2((p[1] - cys) / (Rh * 1.02), (p[0] - cxs) / (Rh * 0.94));
      const a0 = angOf(exit), a1 = angOf(entry);
      const inside = (phi) => {
        const sxn = Math.cos(phi), syn = -Math.sin(phi);
        const wx = sxn, wy = syn * uy, wz = syn * uz;
        return wx * a[0] + wy * a[1] + wz * a[2] > ct;
      };
      let d = U.wrapPi(a1 - a0);
      const mid = a0 + d * 0.5;
      if (!inside(mid)) d = d > 0 ? d - U.TAU : d + U.TAU;
      const steps = 14;
      for (let k = 1; k <= steps; k++) {
        const phi = a0 + d * k / steps;
        g.lineTo(cxs + Math.cos(phi) * Rh * 0.94, cys + Math.sin(phi) * Rh * 1.02);
      }
      g.closePath();
      return true;
    }
    /** hair fill: a gradient lit from the top-left */
    hairFill(g, st, cxs, cys, Rh, alpha) {
      if (this.flat) { g.fillStyle = alpha < 1 ? U.rgba(st.hairColor, alpha) : st.hairColor; return; }
      const gr = g.createRadialGradient(cxs - Rh * 0.4, cys - Rh * 0.6, Rh * 0.1, cxs, cys - Rh * 0.2, Rh * 1.25);
      const T = st.hairT;
      gr.addColorStop(0, alpha < 1 ? U.rgba(T.h, alpha) : T.h); gr.addColorStop(0.45, alpha < 1 ? U.rgba(T.b, alpha) : T.b); gr.addColorStop(1, alpha < 1 ? U.rgba(T.dd, alpha) : T.dd);
      g.fillStyle = gr;
    }
    hairCap(g, sk, st, Rh, cxs, cys) {
      const hs = st.hair;
      const Fe = st.F || {};
      const hlF = Fe.hairline == null ? 0.5 : Fe.hairline, foreF = Fe.forehead == null ? 0.5 : Fe.forehead;
      if (hs === 'bald') {
        g.beginPath(); g.ellipse(cxs - Rh * 0.25, cys - Rh * 0.55, Rh * 0.3, Rh * 0.16, -0.4, 0, U.TAU);
        g.fillStyle = 'rgba(255,255,255,0.18)'; g.fill();
        return;
      }
      // the hairline sits higher with a high forehead / receding hair (cap axis tilts back, cap gets smaller)
      let ax = 0, ay = -0.42 - (foreF - 0.5) * 0.12 - (hlF > 0.75 ? 0.1 : 0), az = 1, th = 1.18 - (hlF > 0.75 ? 0.08 : 0);
      let alpha = 1, rad = Rh * 1.02;
      if (hs === 'buzz') { th = 1.08; alpha = 0.72; }
      else if (hs === 'fade') { th = 1.03; alpha = 0.88; }
      else if (hs === 'waves') th = 1.12;
      else if (hs === 'mohawk') { ax = 0; ay = -0.2; az = 1; th = 0.55; }
      else if (hs === 'hightop') th = 1.05;
      else if (hs === 'curly') { th = 1.24; rad = Rh * 1.08; }
      else if (hs === 'twists' || hs === 'locs' || hs === 'braids') th = 1.22;
      else if (hs === 'afro' || hs === 'puffs') { th = 1.25; rad = Rh * 1.06; }
      else if (hs === 'ponytail' || hs === 'bun' || hs === 'long' || hs === 'bob') { ay = -0.5; th = 1.3; }
      const curls = hs === 'curly' || hs === 'afro' || hs === 'twists' || hs === 'puffs';
      if (curls) this.bumps(g, sk, st, Rh, ax, ay, az, th, hs === 'twists' ? 0.085 : hs === 'afro' ? 0.16 : 0.13, hs === 'afro' ? 1.32 : 1.0);
      const ok = this.capPath(g, sk, cxs, cys, rad, ax, ay, az, th, 1);
      if (!ok) return;
      this.hairFill(g, st, cxs, cys, Rh, alpha);
      g.fill();
      if (curls && this.detail > 0) { g.save(); g.clip(); this.curlTexture(g, st, cxs, cys, Rh, hs === 'twists' ? 0.07 : 0.11); g.restore(); }
      if (this.outlineW && hs !== 'buzz' && hs !== 'fade') { g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = this.outlineW * 0.7; g.stroke(); }
      const scr = this.scr, q = this._q;
      if (hs === 'fade' && this.detail > 0) {
        // skin fade: the sides thin out toward the ears
        g.save(); g.clip();
        for (const sgn of [-1, 1]) {
          scr(sgn * 0.95, 0.0, -0.05, Rh, q);
          if (q[2] > -0.4) {
            const gr = g.createRadialGradient(q[0], q[1], 0, q[0], q[1], Rh * 0.5);
            gr.addColorStop(0, U.rgba(st.skin.b, 0.75)); gr.addColorStop(1, U.rgba(st.skin.b, 0));
            g.fillStyle = gr; g.beginPath(); g.arc(q[0], q[1], Rh * 0.5, 0, U.TAU); g.fill();
          }
        }
        g.restore();
      }
      if (hs === 'hightop') {
        const R = sk.R, fh = F.HED * 9, P = sk.P;
        const hx = P[J.HC * 3], hy = P[J.HC * 3 + 1], hz = P[J.HC * 3 + 2];
        const h = 0.095 * sk.dims.H, w = sk.dims.headR * 0.92;
        const pts = [];
        for (const [lx, lz] of [[-w, 0.02 * sk.dims.H], [w, 0.02 * sk.dims.H], [w * 0.95, h], [-w * 0.95, h]]) {
          const p = this.proj(hx + R[fh] * lx + R[fh + 2] * lz, hy + R[fh + 3] * lx + R[fh + 5] * lz, hz + R[fh + 6] * lx + R[fh + 8] * lz);
          pts.push(p.x, p.y);
        }
        g.beginPath(); g.moveTo(pts[0], pts[1]); g.lineTo(pts[2], pts[3]); g.lineTo(pts[4], pts[5]); g.lineTo(pts[6], pts[7]); g.closePath();
        this.hairFill(g, st, cxs, cys, Rh, 1); g.fill();
        if (this.outlineW) { g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = this.outlineW * 0.7; g.stroke(); }
      }
      if (hs === 'mohawk') {
        const R = sk.R, fh = F.HED * 9, P = sk.P;
        const hx = P[J.HC * 3], hy = P[J.HC * 3 + 1], hz = P[J.HC * 3 + 2];
        g.beginPath();
        for (let i = 0; i <= 6; i++) {
          const a = -0.6 + i * 0.2;
          const lx = 0, ly = Math.sin(a) * sk.dims.headR, lz = sk.dims.headR * 0.9 + 0.03 * sk.dims.H * (1 - Math.abs(a));
          const p = this.proj(hx + R[fh + 1] * ly + R[fh + 2] * lz, hy + R[fh + 4] * ly + R[fh + 5] * lz, hz + R[fh + 7] * ly + R[fh + 8] * lz);
          if (i === 0) g.moveTo(p.x, p.y); else g.lineTo(p.x, p.y);
          void lx;
        }
        g.strokeStyle = st.hairColor; g.lineWidth = Math.max(2, Rh * 0.35); g.stroke();
      }
      if ((hs === 'waves' || hs === 'braids' || hs === 'locs') && this.detail > 0) {
        // texture: wave arcs, or cornrow / loc partings running front to back
        g.save(); g.clip();
        if (hs === 'waves') {
          g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = Math.max(0.6, Rh * 0.06);
          for (let i = -3; i <= 3; i++) { g.beginPath(); g.arc(cxs, cys + Rh * 1.4, Rh * (1.3 + i * 0.12), -2.4, -0.7); g.stroke(); }
        } else {
          g.strokeStyle = 'rgba(0,0,0,0.42)'; g.lineWidth = Math.max(0.6, Rh * 0.045);
          for (let i = -2; i <= 2; i++) {
            const x = i * 0.3;
            g.beginPath();
            let pen = false;
            for (let k = 0; k <= 8; k++) {
              const t = k / 8;
              const ly = 0.95 - t * 1.9, lz = 0.28 + Math.sin(t * Math.PI) * 0.75;
              scr(x, ly, lz, Rh * 1.02, q);
              if (q[2] > -0.05) { if (!pen) { g.moveTo(q[0], q[1]); pen = true; } else g.lineTo(q[0], q[1]); } else pen = false;
            }
            g.stroke();
          }
        }
        g.restore();
      }
    }
    /** bumpy hair silhouette: curls drawn behind the cap along its boundary so the edge reads as curls */
    bumps(g, sk, st, Rh, alx, aly, alz, th, r, ring) {
      const R = sk.R, fh = F.HED * 9, cam = this.cam;
      let ax = R[fh] * alx + R[fh + 1] * aly + R[fh + 2] * alz, ay = R[fh + 3] * alx + R[fh + 4] * aly + R[fh + 5] * alz, az = R[fh + 6] * alx + R[fh + 7] * aly + R[fh + 8] * alz;
      const al = Math.hypot(ax, ay, az); ax /= al; ay /= al; az /= al;
      let e1x = -ay, e1y = ax, e1z = 0; let l = Math.hypot(e1x, e1y, e1z); if (l < 1e-3) { e1x = 1; e1y = 0; e1z = 0; l = 1; } e1x /= l; e1y /= l; e1z /= l;
      const e2x = ay * e1z - az * e1y, e2y = az * e1x - ax * e1z, e2z = ax * e1y - ay * e1x;
      const uy = cam.sp, uz = cam.cp, tcy = -cam.cp, tcz = cam.sp;
      const ct = Math.cos(th * 0.97), stt = Math.sin(th * 0.97);
      const T = st.hairT, cxs = this.sx[J.HC], cys = this.sy[J.HC];
      const n = 16;
      for (let i = 0; i < n; i++) {
        const t = i / n * U.TAU, c = Math.cos(t), sn = Math.sin(t);
        const nx = ax * ct + (e1x * c + e2x * sn) * stt, ny = ay * ct + (e1y * c + e2y * sn) * stt, nz = az * ct + (e1z * c + e2z * sn) * stt;
        const vis = ny * tcy + nz * tcz;
        if (vis < -0.25) continue;
        const X = cxs + Rh * 0.97 * ring * nx, Y = cys - Rh * 1.04 * ring * (ny * uy + nz * uz);
        const rr = Rh * r * (0.8 + ((i * 7) % 4) * 0.1);
        g.beginPath(); g.arc(X, Y, rr, 0, U.TAU);
        g.fillStyle = X < cxs ? T.b : T.d; g.fill();
        if (this.outlineW) { g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = this.outlineW * 0.6; g.stroke(); }
      }
    }
    /** soft curl texture inside the cap */
    curlTexture(g, st, cxs, cys, Rh, r) {
      const T = st.hairT;
      for (let i = 0; i < 14; i++) {
        const t = i * 2.4, rad = Rh * (0.25 + (i % 4) * 0.2);
        const X = cxs + Math.cos(t) * rad, Y = cys - Rh * 0.35 + Math.sin(t) * rad * 0.6;
        g.beginPath(); g.arc(X, Y, Rh * r, 0, U.TAU);
        g.fillStyle = U.rgba(i % 2 ? T.l : T.dd, 0.28); g.fill();
      }
    }
    headband(g, sk, st, Rh, cxs, cys) {
      const R = sk.R, fh = F.HED * 9, cam = this.cam;
      const th = 1.2, ct = Math.cos(th), s = Math.sin(th);
      let ax = R[fh + 1] * -0.22 + R[fh + 2], ay = R[fh + 4] * -0.22 + R[fh + 5], az = R[fh + 7] * -0.22 + R[fh + 8];
      const al = Math.hypot(ax, ay, az); ax /= al; ay /= al; az /= al;
      let e1x = R[fh], e1y = R[fh + 3], e1z = R[fh + 6];
      const e2x = ay * e1z - az * e1y, e2y = az * e1x - ax * e1z, e2z = ax * e1y - ay * e1x;
      g.beginPath();
      let pen = false;
      for (let i = 0; i <= 40; i++) {
        const t = i / 40 * U.TAU, c = Math.cos(t), sn = Math.sin(t);
        const nx = ax * ct + (e1x * c + e2x * sn) * s, ny = ay * ct + (e1y * c + e2y * sn) * s, nz = az * ct + (e1z * c + e2z * sn) * s;
        const vis = ny * -cam.cp + nz * cam.sp;
        const X = cxs + Rh * 0.97 * nx, Y = cys - Rh * 1.05 * (ny * cam.sp + nz * cam.cp);
        if (vis > -0.05) { if (!pen) { g.moveTo(X, Y); pen = true; } else g.lineTo(X, Y); } else pen = false;
      }
      g.strokeStyle = st.headband; g.lineWidth = Math.max(1.4, Rh * 0.28); g.stroke();
    }
    bigHair(g, st, scr, q, Rh) {
      if (st.hair === 'afro') {
        scr(0, -0.1, 0.35, Rh, q);
        const T = st.hairT;
        for (let i = 0; i < 18; i++) {
          const t = i / 18 * U.TAU;
          const X = q[0] + Math.cos(t) * Rh * 1.4, Y = q[1] + Math.sin(t) * Rh * 1.34;
          g.beginPath(); g.arc(X, Y, Rh * 0.2 * (0.8 + (i % 3) * 0.12), 0, U.TAU); g.fillStyle = X < q[0] ? T.b : T.d; g.fill();
          if (this.outlineW) { g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = this.outlineW * 0.6; g.stroke(); }
        }
        g.beginPath(); g.ellipse(q[0], q[1], Rh * 1.42, Rh * 1.36, 0, 0, U.TAU);
        this.hairFill(g, st, q[0], q[1], Rh * 1.3, 1); g.fill();
        if (this.outlineW) { g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = this.outlineW; g.stroke(); }
      } else {
        for (const s of [-1, 1]) {
          scr(s * 0.62, -0.2, 0.85, Rh, q);
          g.beginPath(); g.arc(q[0], q[1], Rh * 0.55, 0, U.TAU);
          this.hairFill(g, st, q[0], q[1], Rh * 0.55, 1); g.fill();
          if (this.outlineW) { g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = this.outlineW * 0.8; g.stroke(); }
        }
      }
    }
    backHair(g, st, scr, q, Rh, sk) {
      // hair hanging behind the head / onto the shoulders (strands for locs / braids / twists)
      scr(0, -0.55, -0.35, Rh, q);
      const bx = q[0], by = q[1];
      const len = st.hair === 'long' ? 1.9 : st.hair === 'locs' ? 1.7 : st.hair === 'bob' ? 1.15 : 1.25;
      g.beginPath();
      g.ellipse(bx, by + Rh * (len - 1) * 0.55, Rh * 1.02, Rh * len * 0.72, 0, 0, U.TAU);
      g.fillStyle = st.hairT.d; g.fill();
      if (st.hair === 'locs' || st.hair === 'twists' || st.hair === 'braids') {
        g.lineCap = 'round';
        for (let i = -4; i <= 4; i++) {
          const x0 = bx + i * Rh * 0.24, y0 = by - Rh * 0.3, x1 = bx + i * Rh * 0.3 + Math.sin(i * 2.1) * Rh * 0.08, y1 = by + Rh * len * 0.92;
          g.strokeStyle = i % 2 ? st.hairT.l : st.hairT.b;
          g.lineWidth = Math.max(0.8, Rh * (st.hair === 'locs' ? 0.16 : 0.1));
          g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo((x0 + x1) * 0.5 + Rh * 0.05, (y0 + y1) * 0.5, x1, y1); g.stroke();
        }
      } else if (this.detail > 0) {
        g.strokeStyle = U.rgba(st.hairT.l, 0.5); g.lineWidth = Math.max(0.6, Rh * 0.06);
        for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(bx + i * Rh * 0.3, by - Rh * 0.2); g.lineTo(bx + i * Rh * 0.34, by + Rh * len * 0.8); g.stroke(); }
      }
      void sk;
    }
    tieHair(g, st, scr, q, Rh, backView) {
      if (st.hair === 'ponytail') {
        scr(0, -0.95, 0.15, Rh, q);
        const x0 = q[0], y0 = q[1];
        scr(0, -1.25, -0.9, Rh, q);
        g.beginPath();
        g.moveTo(x0 - Rh * 0.2, y0);
        g.quadraticCurveTo(q[0] - Rh * 0.35, (y0 + q[1]) * 0.5, q[0], q[1] + Rh * 0.3);
        g.quadraticCurveTo(q[0] + Rh * 0.35, (y0 + q[1]) * 0.5, x0 + Rh * 0.2, y0);
        g.fillStyle = st.hairT.b; g.fill();
        if (this.outlineW) { g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = this.outlineW * 0.7; g.stroke(); }
      } else {
        scr(0, -0.6, 0.85, Rh, q);
        g.beginPath(); g.arc(q[0], q[1], Rh * 0.42, 0, U.TAU);
        this.hairFill(g, st, q[0], q[1], Rh * 0.42, 1); g.fill();
        if (this.outlineW) { g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = this.outlineW * 0.8; g.stroke(); }
      }
      void backView;
    }
    beard(g, st, scr, q, Rh, faceDot, jw, cl) {
      const T = st.hairT;
      const vis = U.sat(faceDot + 0.6);
      if (st.beard === 'mustache' || st.beard === 'goatee' || st.beard === 'full') {
        // mustache
        g.beginPath();
        for (const p of [[-0.3, 0.98, -0.36], [0, 1.02, -0.4], [0.3, 0.98, -0.36], [0.24, 0.97, -0.47], [0, 0.99, -0.45], [-0.24, 0.97, -0.47]]) { scr(p[0], p[1], p[2], Rh, q); if (p === undefined) break; g.lineTo(q[0], q[1]); }
        g.closePath(); g.fillStyle = U.rgba(T.b, 0.92 * vis); g.fill();
        if (st.beard === 'mustache') return;
      }
      if (st.beard === 'goatee') {
        g.beginPath();
        for (const p of [[-0.26, 0.9, -0.62], [0.26, 0.9, -0.62], [0.22, 0.72, -1.02 * cl], [0, 0.68, -1.08 * cl], [-0.22, 0.72, -1.02 * cl]]) { scr(p[0], p[1], p[2], Rh, q); g.lineTo(q[0], q[1]); }
        g.closePath(); g.fillStyle = U.rgba(T.b, 0.9 * vis); g.fill();
        return;
      }
      // full beard / stubble: the jaw and chin up to the sideburns, leaving the mouth
      const pts = [[-0.9, 0.2, 0.05], [-jw * 1.02, 0.08, -0.5], [-jw * 0.52, 0.6, -1.0 * cl], [0, 0.72, -1.1 * cl], [jw * 0.52, 0.6, -1.0 * cl], [jw * 1.02, 0.08, -0.5], [0.9, 0.2, 0.05],
        [0.62, 0.72, -0.2], [0.42, 0.9, -0.5], [0.3, 0.94, -0.42], [-0.3, 0.94, -0.42], [-0.42, 0.9, -0.5], [-0.62, 0.72, -0.2]];
      g.beginPath();
      pts.forEach((p, i) => { scr(p[0], p[1], p[2], Rh, q); if (i === 0) g.moveTo(q[0], q[1]); else g.lineTo(q[0], q[1]); });
      g.closePath();
      if (st.beard === 'stubble') g.fillStyle = U.rgba(T.b, 0.32 * vis);
      else if (this.flat) g.fillStyle = U.rgba(T.b, 0.94 * vis);
      else {
        const gr = g.createLinearGradient(this.sx[J.HC] - Rh, 0, this.sx[J.HC] + Rh, 0);
        gr.addColorStop(0, U.rgba(T.l, 0.94 * vis)); gr.addColorStop(0.5, U.rgba(T.b, 0.95 * vis)); gr.addColorStop(1, U.rgba(T.dd, 0.95 * vis));
        g.fillStyle = gr;
      }
      g.fill();
      // mouth opening in the beard is kept skin-coloured by the face pass drawn on top
    }
    face(g, st, scr, q, Rh, faceDot) {
      const a = U.sat(faceDot * 2.2 + 0.1);
      if (a <= 0.02) return;
      const Fe = st.F || {};
      const ft = (k) => (Fe[k] == null ? 0.5 : Fe[k]);
      const X_ = EXPR[st.expr] || EXPR.neutral;
      const fem = st.fem;
      const dark = st.skinI >= 5 ? '#0e0806' : '#2a1610';
      const skin = st.skin;
      const faceLen = ft('faceLen');
      const ez = 0.14 - (faceLen - 0.5) * 0.06;
      const ex = 0.35 + (ft('eyeSpace') - 0.5) * 0.1;
      const eyeR = Rh * (0.135 + (ft('eyeSize') - 0.5) * 0.06);
      const tilt = (ft('eyeTilt') - 0.5) * 0.4;
      const lidK = ft('lid');
      const small = this.detail === 0 || Rh < 5;
      const lw = (k) => Math.max(0.5, Rh * k);
      const sideDot = this.sideDot;
      // ---- brows
      const bth = Rh * (0.055 + ft('browThick') * 0.075) * (fem ? 0.75 : 1);
      const arch = (ft('browArch') - 0.5) * 0.1;
      g.fillStyle = U.rgba(st.hairT.b, 0.92 * a);
      for (const s of [-1, 1]) {
        let dIn = 0, dOut = 0;
        const b = X_.brow;
        if (b === 'angry') { dIn = -0.07; dOut = 0.02; } else if (b === 'up') { dIn = 0.08; dOut = 0.05; } else if (b === 'soft') { dIn = 0.03; dOut = 0.02; }
        else if (b === 'heavy' || b === 'low') { dIn = -0.04; dOut = -0.03; } else if (b === 'oneUp') { if (s > 0) { dIn = 0.08; dOut = 0.06; } }
        else if (b === 'cocky') { if (s < 0) { dIn = 0.1; dOut = 0.07; } else { dIn = -0.03; } } else if (b === 'annoyed') { if (s < 0) dIn = -0.06; }
        const zi = ez + 0.23 + arch + dIn, zo = ez + 0.2 + dOut;
        scr(s * (ex - 0.16), 0.9, zi, Rh, q); const ix = q[0], iy = q[1], iv = q[2];
        scr(s * (ex + 0.25), 0.78, zo, Rh, q); const ox = q[0], oy = q[1];
        if (iv < -0.15 && q[2] < -0.15) continue;
        const nx = -(oy - iy), ny = ox - ix; const nl = Math.hypot(nx, ny) || 1;
        const t1 = bth, t2 = bth * 0.55;
        g.beginPath();
        g.moveTo(ix + nx / nl * t1 * 0.5, iy + ny / nl * t1 * 0.5); g.lineTo(ox + nx / nl * t2 * 0.5, oy + ny / nl * t2 * 0.5);
        g.lineTo(ox - nx / nl * t2 * 0.5, oy - ny / nl * t2 * 0.5); g.lineTo(ix - nx / nl * t1 * 0.5, iy - ny / nl * t1 * 0.5);
        g.closePath(); g.fill();
      }
      // ---- eyes
      for (const s of [-1, 1]) {
        scr(s * ex, 0.9, ez, Rh, q);
        if (q[2] < 0.02) continue;
        const vis = Math.min(1, q[2] + 0.25);
        const cx = q[0], cy = q[1];
        const rx = eyeR * vis, ry = eyeR * 0.6;
        const rot = -s * tilt;
        const mode = X_.eyes;
        if (small) {
          g.fillStyle = U.rgba(dark, 0.9 * a);
          g.beginPath(); g.ellipse(cx, cy, Math.max(0.6, rx * 0.8), Math.max(0.5, ry * 0.8), rot, 0, U.TAU); g.fill();
          continue;
        }
        if (mode === 'happy') {
          g.strokeStyle = U.rgba(dark, 0.9 * a); g.lineWidth = lw(0.06);
          g.beginPath(); g.ellipse(cx, cy + ry * 0.4, rx, ry, rot, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
          continue;
        }
        // white, iris, pupil
        g.fillStyle = U.rgba('#f2ecea', a);
        g.beginPath(); g.ellipse(cx, cy, rx, ry, rot, 0, U.TAU); g.fill();
        const look = X_.look || 0;
        const ixo = look * rx * 0.3 + sideDot * rx * 0.15 * -1;
        const ir = ry * 0.9;
        g.fillStyle = U.rgba(st.eyeColor, a);
        g.beginPath(); g.arc(cx + ixo, cy + ry * 0.05, ir, 0, U.TAU); g.fill();
        g.fillStyle = U.rgba('#0a0608', a);
        g.beginPath(); g.arc(cx + ixo, cy + ry * 0.05, ir * 0.5, 0, U.TAU); g.fill();
        g.fillStyle = U.rgba('#ffffff', 0.7 * a);
        g.beginPath(); g.arc(cx + ixo - ir * 0.35, cy - ry * 0.3, Math.max(0.4, ir * 0.22), 0, U.TAU); g.fill();
        // lids: heavy upper lid line, a lowered lid for lidded / squinting expressions
        const lidDrop = mode === 'squint' ? 0.55 : mode === 'lidded' ? 0.35 : lidK > 0.7 ? 0.22 : mode === 'wide' ? -0.15 : 0;
        if (lidDrop > 0) {
          g.fillStyle = U.rgba(skin.d, a);
          g.beginPath(); g.ellipse(cx, cy - ry * (1 - lidDrop), rx * 1.05, ry, rot, Math.PI, U.TAU); g.fill();
        }
        g.strokeStyle = U.rgba(dark, 0.85 * a); g.lineWidth = lw(fem ? 0.075 : 0.055);
        g.beginPath(); g.ellipse(cx, cy - ry * Math.max(0, lidDrop) * 0.8, rx * 1.02, ry * (1 - Math.max(0, lidDrop) * 0.5), rot, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
        g.strokeStyle = U.rgba(dark, 0.35 * a); g.lineWidth = lw(0.035);
        g.beginPath(); g.ellipse(cx, cy, rx, ry, rot, 0.15, Math.PI - 0.15); g.stroke();
        if (fem) { g.strokeStyle = U.rgba(dark, 0.85 * a); g.lineWidth = lw(0.05); g.beginPath(); g.moveTo(cx + s * rx * 0.9, cy - ry * 0.5); g.lineTo(cx + s * rx * 1.25, cy - ry * 0.95); g.stroke(); }
      }
      // ---- nose: bridge highlight on the lit side, a shadow line on the other, tip and nostrils
      const nz0 = ez + 0.05, nzt = ez - 0.3 - (ft('noseL') - 0.5) * 0.12;
      const nw = 0.1 + (ft('noseW') - 0.5) * 0.08;
      scr(0, 0.98, nz0, Rh, q); const bx0 = q[0], by0 = q[1];
      scr(0.03, 1.05, nzt, Rh, q); const tx0 = q[0], ty0 = q[1], tv = q[2];
      if (tv > -0.1) {
        g.strokeStyle = U.rgba(skin.dd, 0.5 * a); g.lineWidth = lw(0.07);
        g.beginPath(); g.moveTo(bx0 + Rh * 0.05, by0); g.quadraticCurveTo(tx0 + Rh * 0.08, (by0 + ty0) * 0.55, tx0 + Rh * 0.04, ty0); g.stroke();
        if (ft('noseBridge') > 0.6 && !small) { g.strokeStyle = U.rgba(skin.h, 0.45 * a); g.lineWidth = lw(0.06); g.beginPath(); g.moveTo(bx0 - Rh * 0.03, by0); g.lineTo(tx0 - Rh * 0.05, ty0 - Rh * 0.06); g.stroke(); }
        // tip + nostrils
        g.fillStyle = U.rgba(skin.l, 0.55 * a);
        g.beginPath(); g.ellipse(tx0 - Rh * 0.02, ty0 - Rh * 0.02, Rh * (0.08 + nw * 0.3), Rh * 0.06, 0, 0, U.TAU); g.fill();
        if (!small) {
          g.fillStyle = U.rgba(dark, 0.5 * a);
          for (const s of [-1, 1]) {
            scr(s * nw, 1.0, nzt - 0.05, Rh, q);
            if (q[2] > 0) { g.beginPath(); g.ellipse(q[0], q[1], Rh * 0.045, Rh * 0.03, 0, 0, U.TAU); g.fill(); }
          }
        }
      }
      // ---- mouth
      const mz = -0.55 - (faceLen - 0.5) * 0.14 - (ft('noseL') - 0.5) * 0.04;
      const mw = 0.22 + (ft('mouthW') - 0.5) * 0.1;
      const lipF = ft('lipFull');
      scr(-mw, 0.93, mz, Rh, q); const lx = q[0], ly = q[1], lv = q[2];
      scr(mw, 0.93, mz, Rh, q); const rx = q[0], ry = q[1], rv = q[2];
      scr(0, 0.99, mz, Rh, q); const mx = q[0], my = q[1];
      if (lv > -0.2 || rv > -0.2) {
        const m = X_.mouth;
        const up = (m === 'smile' || m === 'grin') ? -Rh * 0.08 : (m === 'frown' || m === 'frownSoft') ? Rh * 0.07 : 0;
        const lipH = Rh * (0.04 + lipF * 0.08);
        if (m === 'yell' || m === 'grin') {
          // open mouth: dark interior, teeth on a grin
          g.fillStyle = U.rgba('#3a1218', 0.95 * a);
          g.beginPath(); g.moveTo(lx, ly + up); g.quadraticCurveTo(mx, my - Rh * (m === 'yell' ? 0.1 : 0.02), rx, ry + up); g.quadraticCurveTo(mx, my + Rh * (m === 'yell' ? 0.28 : 0.16), lx, ly + up); g.closePath(); g.fill();
          if (m === 'grin' && !small) { g.fillStyle = U.rgba('#f5f0ea', 0.95 * a); g.beginPath(); g.moveTo(lx + Rh * 0.03, ly + up); g.quadraticCurveTo(mx, my - Rh * 0.01, rx - Rh * 0.03, ry + up); g.quadraticCurveTo(mx, my + Rh * 0.07, lx + Rh * 0.03, ly + up); g.closePath(); g.fill(); }
          g.strokeStyle = U.rgba(dark, 0.55 * a); g.lineWidth = lw(0.04);
          g.beginPath(); g.moveTo(lx, ly + up); g.quadraticCurveTo(mx, my - Rh * (m === 'yell' ? 0.1 : 0.02), rx, ry + up); g.stroke();
          // lower lip
          g.fillStyle = U.rgba(st.lipT.b, 0.8 * a);
          g.beginPath(); g.moveTo(lx, ly + up); g.quadraticCurveTo(mx, my + Rh * (m === 'yell' ? 0.28 : 0.16), rx, ry + up); g.quadraticCurveTo(mx, my + Rh * (m === 'yell' ? 0.28 : 0.16) + lipH, lx, ly + up); g.closePath(); g.fill();
        } else {
          // closed mouth: lip line with the corners up / down / one side, lower lip below it
          const cxm = mx, cym = my + (m === 'press' ? 0 : Rh * 0.02);
          const upL = m === 'smirk' ? 0 : m === 'side' ? Rh * 0.05 : up, upR = m === 'smirk' ? -Rh * 0.09 : m === 'side' ? -Rh * 0.02 : up;
          if (!small && m !== 'press') {
            g.fillStyle = U.rgba(st.lipT.b, (0.55 + lipF * 0.35) * a);
            g.beginPath(); g.moveTo(lx, ly + upL); g.quadraticCurveTo(cxm, cym + Rh * 0.02, rx, ry + upR); g.quadraticCurveTo(cxm, cym + lipH * 1.6, lx, ly + upL); g.closePath(); g.fill();
            if (lipF > 0.35) { g.fillStyle = U.rgba(st.lipT.d, 0.5 * a); g.beginPath(); g.moveTo(lx, ly + upL); g.quadraticCurveTo(cxm, cym - lipH * 0.9, rx, ry + upR); g.quadraticCurveTo(cxm, cym + Rh * 0.015, lx, ly + upL); g.closePath(); g.fill(); }
          }
          g.strokeStyle = U.rgba(dark, (m === 'press' ? 0.5 : 0.62) * a); g.lineWidth = lw(m === 'press' ? 0.06 : 0.045);
          g.beginPath(); g.moveTo(lx, ly + upL); g.quadraticCurveTo(cxm, cym + (m === 'smile' ? Rh * 0.06 : m === 'frown' ? -Rh * 0.04 : Rh * 0.015), rx, ry + upR); g.stroke();
          if (m === 'smile' && !small) { g.strokeStyle = U.rgba(dark, 0.3 * a); g.lineWidth = lw(0.035); for (const [px, py] of [[lx, ly + upL], [rx, ry + upR]]) { g.beginPath(); g.moveTo(px, py - Rh * 0.06); g.lineTo(px, py + Rh * 0.05); g.stroke(); } }
        }
        // smile lines / cheek lift
        if (X_.cheeks && !small) {
          g.strokeStyle = U.rgba(skin.d, 0.35 * a); g.lineWidth = lw(0.04);
          for (const s of [-1, 1]) { scr(s * (mw + 0.14), 0.92, mz + 0.22, Rh, q); if (q[2] > 0) { g.beginPath(); g.moveTo(q[0], q[1]); g.quadraticCurveTo(q[0] + s * Rh * 0.06, q[1] + Rh * 0.16, q[0] - s * Rh * 0.02, q[1] + Rh * 0.3); g.stroke(); } }
        }
      }
      void skin;
    }

    // ---------------------------------------------------------- shadow & reflection
    drawShadow(g, cam, sk, alpha) {
      const P = sk.P;
      const sp = shadowSprite();
      const cx = (P[J.L_BALL * 3] + P[J.R_BALL * 3] + P[0] * 2) * 0.25;
      const cy = (P[J.L_BALL * 3 + 1] + P[J.R_BALL * 3 + 1] + P[1] * 2) * 0.25;
      const air = Math.max(0, Math.min(P[J.L_BALL * 3 + 2], P[J.R_BALL * 3 + 2]) - 0.05);
      const a = (alpha == null ? 1 : alpha) * U.clamp(1 - air * 0.25, 0.25, 1);
      const p = cam.project(cx, cy, 0, this.pt);
      const w = sk.dims.H * 0.62 * p.s * (1 + air * 0.08), h = w * 0.32 * Math.max(0.35, cam.sp * 1.6);
      g.globalAlpha = 0.55 * a;
      g.drawImage(sp, p.x - w / 2, p.y - h / 2, w, h);
      for (const jb of [J.L_BALL, J.R_BALL]) {
        const fz = P[jb * 3 + 2];
        if (fz > 1.2) continue;
        const q = cam.project(P[jb * 3], P[jb * 3 + 1], 0, this.pt);
        const fw = sk.dims.H * 0.2 * q.s, fh = fw * 0.35;
        g.globalAlpha = 0.5 * a * U.clamp(1 - fz, 0, 1);
        g.drawImage(sp, q.x - fw / 2, q.y - fh / 2, fw, fh);
      }
      g.globalAlpha = 1;
    }
    /** faint mirrored figure on the glossy floor */
    drawReflection(g, cam, sk, st, alpha) {
      const P = sk.P;
      const segs = this._rsegs || (this._rsegs = [
        [J.L_KN, J.L_AN, 'leg', 0.05], [J.R_KN, J.R_AN, 'leg', 0.05], [J.L_HIP, J.L_KN, 'short', 0.1], [J.R_HIP, J.R_KN, 'short', 0.1],
        [J.PEL, J.CHS, 'jersey', 0.2], [J.CHS, J.NCK, 'jersey', 0.19], [J.L_SH, J.L_EL, 'skin', 0.06], [J.R_SH, J.R_EL, 'skin', 0.06],
        [J.L_EL, J.L_WR, 'skin', 0.05], [J.R_EL, J.R_WR, 'skin', 0.05], [J.L_HEEL, J.L_TOE, 'shoe', 0.07], [J.R_HEEL, J.R_TOE, 'shoe', 0.07],
      ]);
      const H = sk.dims.H;
      g.lineCap = 'round';
      for (const s of segs) {
        const a = s[0] * 3, b = s[1] * 3;
        const za = P[a + 2], zb = P[b + 2];
        const fade = U.clamp(1 - (za + zb) * 0.5 / (H * 0.55), 0.1, 1);
        const pa = cam.project(P[a], P[a + 1], -za, this.pt); const ax = pa.x, ay = pa.y;
        const pb = cam.project(P[b], P[b + 1], -zb, this.pt);
        let col;
        if (s[2] === 'leg') col = st.skin.b;
        else if (s[2] === 'short') col = st.kind === 'ref' ? st.pants.b : st.shorts.b;
        else if (s[2] === 'jersey') col = st.jersey.b;
        else if (s[2] === 'shoe') col = st.shoe;
        else col = st.skin.b;
        g.strokeStyle = col;
        g.globalAlpha = alpha * fade;
        g.lineWidth = Math.max(1, s[3] * 2 * H * pb.s);
        g.beginPath(); g.moveTo(ax, ay); g.lineTo(pb.x, pb.y); g.stroke();
      }
      g.globalAlpha = 1;
    }
  }

  const AO_BAND = { b: 'rgba(8,4,10,0.22)', d: 'rgba(8,4,10,0.22)', dd: 'rgba(8,4,10,0.22)', l: 'rgba(8,4,10,0.22)', h: 'rgba(8,4,10,0.22)', o: 'rgba(0,0,0,0)' };

  let _shadow = null;
  function shadowSprite() {
    if (_shadow) return _shadow;
    const c = U.makeCanvas(128, 128), g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(0,0,0,0.9)'); gr.addColorStop(0.45, 'rgba(0,0,0,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    _shadow = c;
    return c;
  }

  M.Figure = { FigureRenderer, makeStyle, SKIN: SKIN_DEF, shadowSprite, EXPR };
})();
