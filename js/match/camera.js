/* Pro BBALL Coach — match view: broadcast perspective camera (PBC.Match.Camera / CameraRig).
 * World: x along the court (0..94), y across (0 near .. 50 far), z up; feet.
 * The camera sits at the near side (y<0), looks toward +y with a downward pitch, no yaw/roll,
 * so every line of constant y projects to a horizontal screen line. */
(function () {
  'use strict';
  const M = window.PBC.Match, U = M.U;

  class Camera {
    constructor() {
      this.W = 1600; this.H = 900;
      this.x = 47; this.y = -62; this.z = 34;
      this.pitch = 0.35; this.f = 2100;
      this.shiftY = 0; // principal point shift (fraction of H)
      this._upd();
    }
    _upd() {
      this.sp = Math.sin(this.pitch); this.cp = Math.cos(this.pitch);
      this.ox = this.W * 0.5; this.oy = this.H * (0.5 + this.shiftY);
    }
    setSize(W, H) { this.W = W; this.H = H; this._upd(); }
    setPose(x, y, z, pitch, f) { this.x = x; this.y = y; this.z = z; this.pitch = pitch; this.f = f; this._upd(); }

    /** project world point; out = {x, y, s (px per ft), d (depth)} */
    project(x, y, z, out) {
      const dy = y - this.y, dz = z - this.z;
      let d = dy * this.cp - dz * this.sp;
      if (d < 0.25) d = 0.25;
      const k = this.f / d;
      out.x = this.ox + (x - this.x) * k;
      out.y = this.oy - (dy * this.sp + dz * this.cp) * k;
      out.s = k; out.d = d;
      return out;
    }
    depth(y, z) { return (y - this.y) * this.cp - (z - this.z) * this.sp; }
    scaleAt(y, z) { return this.f / Math.max(0.25, this.depth(y, z)); }
    sx(x, y, z) { return this.ox + (x - this.x) * this.f / Math.max(0.25, this.depth(y, z)); }
    sy(y, z) {
      const dy = y - this.y, dz = z - this.z;
      const d = Math.max(0.25, dy * this.cp - dz * this.sp);
      return this.oy - (dy * this.sp + dz * this.cp) * this.f / d;
    }
    /** screen row of a floor line at depth y */
    floorRow(y) { return this.sy(y, 0); }
    /** world depth y of the floor seen at screen row Y (inverse of floorRow) */
    floorAtRow(Y) {
      const k = (this.oy - Y) / this.f;
      const cz = this.z;
      const den = this.sp - k * this.cp;
      if (Math.abs(den) < 1e-6) return 1e6;
      return this.y + cz * (this.cp + k * this.sp) / den;
    }
    /** screen row where the plane z=h at depth y appears; generic helper */
    worldXAtScreen(sx, y, z) { return this.x + (sx - this.ox) / this.scaleAt(y, z); }
    /** unit vector from a world point toward the camera */
    toCam(x, y, z, out) {
      let dx = this.x - x, dy = this.y - y, dz = this.z - z;
      const l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      out[0] = dx / l; out[1] = dy / l; out[2] = dz / l;
      return out;
    }
  }

  // Presets: camera position relative to the court, look-at target (for pitch) and focal length as a multiple of H.
  const PRESETS = {
    broadcast: { y: -61, z: 37, lookY: 30, lookZ: 0, fH: 2.36, lead: 1 },
    wide:      { y: -86, z: 46, lookY: 29, lookZ: 0, fH: 1.42, lead: 0.4 },
    close:     { y: -50, z: 25, lookY: 27, lookZ: 2, fH: 2.55, lead: 1 },
    ft:        { y: -58, z: 30, lookY: 29, lookZ: 1, fH: 2.95, lead: 0.5 },
    // half-court sets: the broadcast camera pushes in a little, like a TV crew framing the offense
    half:      { y: -58, z: 33, lookY: 28, lookZ: 1, fH: 2.78, lead: 0.7 },
    // replays: tight, low and dramatic
    replay:    { y: -44, z: 20, lookY: 26, lookZ: 3, fH: 3.4, lead: 0.2 },
  };

  class CameraRig {
    constructor(cam) {
      this.cam = cam;
      this.preset = 'broadcast';
      this.p = Object.assign({}, PRESETS.broadcast);
      this.pan = { x: 47, v: 0 };
      this.tight = 0; // 0..1 blend toward the free-throw framing
      this.tightTarget = 0;
      this.zoom = 0; // 0..1 blend toward the half-court framing ('auto' broadcast camera)
      this.zoomTarget = 0;
      this.auto = false;
      this.shake = 0;
      this.apply();
    }
    setPreset(name) {
      if (name === 'auto') { this.auto = true; this.preset = 'broadcast'; return; }
      this.auto = false;
      if (PRESETS[name]) this.preset = name;
    }
    target() {
      let base = PRESETS[this.preset] || PRESETS.broadcast;
      if (this.preset !== 'broadcast') return base;
      if (this.auto && this.zoom > 0.001) {
        const h = PRESETS.half, z = U.smooth(this.zoom), o = {};
        for (const k in base) o[k] = U.lerp(base[k], h[k], z);
        base = o;
      }
      if (this.tight <= 0.001) return base;
      const ft = PRESETS.ft, t = U.smooth(this.tight), o = {};
      for (const k in base) o[k] = U.lerp(base[k], ft[k], t);
      return o;
    }
    /** half-width of the view in feet at floor depth y */
    halfWidthAt(y) { const c = this.cam; return (c.W * 0.5) / c.scaleAt(y, 0); }
    panLimits() {
      const nearHalf = this.halfWidthAt(0);
      let lo = -7.5 + nearHalf, hi = 101.5 - nearHalf;
      if (lo > hi) { lo = hi = 47; }
      return [lo, hi];
    }
    apply() {
      const c = this.cam, p = this.p;
      const pitch = Math.atan2(p.z - p.lookZ, p.lookY - p.y);
      c.setPose(this.pan.x, p.y, p.z, pitch, p.fH * c.H);
    }
    /** focus: {x, vx, snap} ; dt in presentation seconds */
    update(dt, focus) {
      this.tight = U.approach(this.tight, this.tightTarget, dt * 0.9);
      this.zoom = U.approach(this.zoom, this.auto ? this.zoomTarget : 0, dt * 0.45);
      const tgt = this.target();
      const lam = 3.0;
      for (const k in tgt) this.p[k] = U.damp(this.p[k], tgt[k], lam, dt);
      this.apply();
      const lim = this.panLimits();
      let fx = focus ? focus.x : 47;
      if (focus && focus.vx) fx += U.clamp(focus.vx * 0.55 * this.p.lead, -14, 14);
      fx = U.clamp(fx, lim[0], lim[1]);
      if (focus && focus.snap) { this.pan.x = fx; this.pan.v = 0; }
      else U.spring(this.pan, fx, 2.6, Math.min(dt, 0.1));
      this.pan.x = U.clamp(this.pan.x, lim[0] - 2, lim[1] + 2);
      this.apply();
    }
  }

  M.Camera = Camera;
  M.CameraRig = CameraRig;
  M.CAMERA_PRESETS = PRESETS;
})();
