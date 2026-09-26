/* Procedural basketball animation: dribbling (with crossovers), chest passes and layups.
 * Dependency-free. There is no keyframe or mocap data: every pose comes from continuous math curves
 * (gravity parabolas, cubic Hermite splines, cubic Bezier curves, smoothstep envelopes) and an analytic
 * two-bone IK solver.
 *
 * Conventions (the same as Three.js / glTF):
 *  - Y is up. Units are meters, seconds and radians.
 *  - Root space: origin at the character root (between the feet). The character faces +Z, so its RIGHT side is
 *    -X and its left side is +X (right-handed coordinates).
 *  - Euler angles use the 'YXZ' order: yaw about Y, then pitch about X (positive pitch leans forward / looks
 *    down), then roll about Z.
 *  - Canonical bone frame: a bone's local +Y axis points from its joint toward the next joint, and its local +X
 *    axis is the elbow hinge axis. Rigs whose bind pose uses other axes pass a correction per bone
 *    (config.boneRest), see applyToRig().
 *
 * Why it does not snap:
 *  - Ball motion is analytic per phase and every phase boundary matches both position and velocity (C1).
 *  - Hand targets are blended with smoothstep weights whose derivative is zero at both ends.
 *  - Switching actions cross-fades the whole pose, and torso/head angles are damped (frame-rate independent).
 *  - The IK reach is soft-clamped (no elbow pop at full extension) and the elbow bend direction is damped and
 *    re-projected every frame (no pole flip). Every acos/asin input is clamped and every output is checked for NaN.
 *
 * Usage (Three.js or any engine whose nodes have .position and .rotation or .quaternion):
 *   const anim = new ProceduralBasketball.BasketballAnimator(rig, { hierarchy: 'chain' });
 *   anim.dribble({ hand: 'right' });
 *   anim.crossover();                           // switch the ball to the other hand in front of the body
 *   anim.pass(teammateChestWorldVector3);       // Vector3-like {x, y, z}
 *   anim.layup(rimCenterWorldVector3);
 *   // every frame:
 *   anim.update(deltaSeconds);                  // writes into the rig, returns the full state
 *
 * rig (every entry optional):
 *   { root, pelvis, torso, head, ball,
 *     arms: { left: { upper, fore, hand }, right: { upper, fore, hand } },
 *     ikTargets: { leftElbow, leftHand, rightElbow, rightHand } }   // positions in world space
 */
(function (global, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (global) {
    global.ProceduralBasketball = api;
    if (global.PBC) global.PBC.ProcAnim = api;
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';

  // =====================================================================================================
  // Math helpers
  // =====================================================================================================
  const EPS = 1e-6;
  const TAU = Math.PI * 2;
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const saturate = x => clamp(x, 0, 1);
  const lerp = (a, b, t) => a + (b - a) * t;
  const finite = (x, fallback) => (Number.isFinite(x) ? x : fallback);
  /** Hermite smoothstep: 0 below e0, 1 above e1, zero slope at both ends. */
  function smoothstep(e0, e1, x) {
    if (!(e1 > e0)) return x < e0 ? 0 : 1;
    const t = saturate((x - e0) / (e1 - e0));
    return t * t * (3 - 2 * t);
  }
  /** acos/asin never see a value outside [-1, 1] (floating point drift would return NaN). */
  const safeAcos = x => Math.acos(clamp(finite(x, 1), -1, 1));
  const safeAsin = x => Math.asin(clamp(finite(x, 0), -1, 1));
  /** Wrap an angle to (-PI, PI]. */
  function wrapAngle(a) {
    a = finite(a, 0) % TAU;
    if (a > Math.PI) a -= TAU; else if (a <= -Math.PI) a += TAU;
    return a;
  }
  /** Frame-rate independent exponential smoothing factor. */
  const dampFactor = (lambda, dt) => 1 - Math.exp(-lambda * dt);
  const dampAngle = (cur, target, lambda, dt) => cur + wrapAngle(target - cur) * dampFactor(lambda, dt);
  /** Soft upper limit: identity below (max - soft), then eases into max without ever reaching it (C1). */
  function softMax(x, max, soft) {
    const k = max - soft;
    return x <= k ? x : k + soft * (1 - Math.exp(-(x - k) / soft));
  }
  /** Soft lower limit, the mirror of softMax. */
  function softMin(x, min, soft) {
    const k = min + soft;
    return x >= k ? x : k - soft * (1 - Math.exp((x - k) / soft));
  }

  class Vector3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
    clone() { return new Vector3(this.x, this.y, this.z); }
    add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
    sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
    addVectors(a, b) { this.x = a.x + b.x; this.y = a.y + b.y; this.z = a.z + b.z; return this; }
    subVectors(a, b) { this.x = a.x - b.x; this.y = a.y - b.y; this.z = a.z - b.z; return this; }
    addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
    multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
    dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
    crossVectors(a, b) {
      const ax = a.x, ay = a.y, az = a.z, bx = b.x, by = b.y, bz = b.z;
      this.x = ay * bz - az * by; this.y = az * bx - ax * bz; this.z = ax * by - ay * bx;
      return this;
    }
    cross(v) { return this.crossVectors(this, v); }
    lengthSq() { return this.x * this.x + this.y * this.y + this.z * this.z; }
    length() { return Math.sqrt(this.lengthSq()); }
    distanceTo(v) { return Math.sqrt(this.distanceToSquared(v)); }
    distanceToSquared(v) { const dx = this.x - v.x, dy = this.y - v.y, dz = this.z - v.z; return dx * dx + dy * dy + dz * dz; }
    /** Normalize; a zero-length (or non-finite) vector becomes `fallback` (default +Z) instead of NaN. */
    normalize(fallback) {
      const l = this.length();
      if (l > EPS && Number.isFinite(l)) return this.multiplyScalar(1 / l);
      return fallback ? this.copy(fallback) : this.set(0, 0, 1);
    }
    lerp(v, t) { this.x += (v.x - this.x) * t; this.y += (v.y - this.y) * t; this.z += (v.z - this.z) * t; return this; }
    lerpVectors(a, b, t) { this.x = a.x + (b.x - a.x) * t; this.y = a.y + (b.y - a.y) * t; this.z = a.z + (b.z - a.z) * t; return this; }
    /** Remove the component along the unit vector n. */
    projectOnPlane(n) { return this.addScaledVector(n, -this.dot(n)); }
    applyQuaternion(q) {
      const x = this.x, y = this.y, z = this.z, qx = q.x, qy = q.y, qz = q.z, qw = q.w;
      const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
      this.x = x + qw * tx + qy * tz - qz * ty;
      this.y = y + qw * ty + qz * tx - qx * tz;
      this.z = z + qw * tz + qx * ty - qy * tx;
      return this;
    }
    /** Rotate about the world Y axis (same as Three's Ry). */
    rotateY(a) { const c = Math.cos(a), s = Math.sin(a), x = this.x, z = this.z; this.x = x * c + z * s; this.z = -x * s + z * c; return this; }
    isFinite() { return Number.isFinite(this.x) && Number.isFinite(this.y) && Number.isFinite(this.z); }
  }
  const UP = Object.freeze(new Vector3(0, 1, 0));
  const FWD = Object.freeze(new Vector3(0, 0, 1));
  const DOWN = Object.freeze(new Vector3(0, -1, 0));

  class Quaternion {
    constructor(x = 0, y = 0, z = 0, w = 1) { this.x = x; this.y = y; this.z = z; this.w = w; }
    set(x, y, z, w) { this.x = x; this.y = y; this.z = z; this.w = w; return this; }
    copy(q) { return this.set(q.x, q.y, q.z, q.w); }
    clone() { return new Quaternion(this.x, this.y, this.z, this.w); }
    identity() { return this.set(0, 0, 0, 1); }
    dot(q) { return this.x * q.x + this.y * q.y + this.z * q.z + this.w * q.w; }
    normalize() {
      let l = Math.sqrt(this.dot(this));
      if (!(l > EPS) || !Number.isFinite(l)) return this.identity();
      l = 1 / l;
      return this.set(this.x * l, this.y * l, this.z * l, this.w * l);
    }
    /** Inverse of a unit quaternion. */
    invert() { return this.set(-this.x, -this.y, -this.z, this.w); }
    multiply(q) { return this.multiplyQuaternions(this, q); }
    premultiply(q) { return this.multiplyQuaternions(q, this); }
    multiplyQuaternions(a, b) {
      const ax = a.x, ay = a.y, az = a.z, aw = a.w, bx = b.x, by = b.y, bz = b.z, bw = b.w;
      this.x = ax * bw + aw * bx + ay * bz - az * by;
      this.y = ay * bw + aw * by + az * bx - ax * bz;
      this.z = az * bw + aw * bz + ax * by - ay * bx;
      this.w = aw * bw - ax * bx - ay * by - az * bz;
      return this;
    }
    setFromAxisAngle(axis, angle) {
      const h = angle / 2, s = Math.sin(h);
      return this.set(axis.x * s, axis.y * s, axis.z * s, Math.cos(h));
    }
    /** Euler 'YXZ' (x = pitch, y = yaw, z = roll). */
    setFromEulerYXZ(x, y, z = 0) {
      const c1 = Math.cos(x / 2), c2 = Math.cos(y / 2), c3 = Math.cos(z / 2);
      const s1 = Math.sin(x / 2), s2 = Math.sin(y / 2), s3 = Math.sin(z / 2);
      return this.set(s1 * c2 * c3 + c1 * s2 * s3, c1 * s2 * c3 - s1 * c2 * s3, c1 * c2 * s3 - s1 * s2 * c3, c1 * c2 * c3 + s1 * s2 * s3);
    }
    /** From an orthonormal basis (the columns of a rotation matrix). */
    setFromBasis(X, Y, Z) {
      const m11 = X.x, m12 = Y.x, m13 = Z.x, m21 = X.y, m22 = Y.y, m23 = Z.y, m31 = X.z, m32 = Y.z, m33 = Z.z;
      const tr = m11 + m22 + m33;
      if (tr > 0) {
        const s = 0.5 / Math.sqrt(tr + 1);
        this.set((m32 - m23) * s, (m13 - m31) * s, (m21 - m12) * s, 0.25 / s);
      } else if (m11 > m22 && m11 > m33) {
        const s = 2 * Math.sqrt(Math.max(EPS, 1 + m11 - m22 - m33));
        this.set(0.25 * s, (m12 + m21) / s, (m13 + m31) / s, (m32 - m23) / s);
      } else if (m22 > m33) {
        const s = 2 * Math.sqrt(Math.max(EPS, 1 + m22 - m11 - m33));
        this.set((m12 + m21) / s, 0.25 * s, (m23 + m32) / s, (m13 - m31) / s);
      } else {
        const s = 2 * Math.sqrt(Math.max(EPS, 1 + m33 - m11 - m22));
        this.set((m13 + m31) / s, (m23 + m32) / s, 0.25 * s, (m21 - m12) / s);
      }
      return this.normalize();
    }
    /** Keep the same hemisphere as `ref` (q and -q are the same rotation; this keeps slerps and filters smooth). */
    alignTo(ref) { if (ref && this.dot(ref) < 0) this.set(-this.x, -this.y, -this.z, -this.w); return this; }
    slerp(qb, t) {
      let cos = this.dot(qb), bx = qb.x, by = qb.y, bz = qb.z, bw = qb.w;
      if (cos < 0) { cos = -cos; bx = -bx; by = -by; bz = -bz; bw = -bw; }
      if (cos > 0.9995) return this.set(lerp(this.x, bx, t), lerp(this.y, by, t), lerp(this.z, bz, t), lerp(this.w, bw, t)).normalize();
      const th = safeAcos(cos), s = Math.sin(th), wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s;
      return this.set(this.x * wa + bx * wb, this.y * wa + by * wb, this.z * wa + bz * wb, this.w * wa + bw * wb);
    }
    /** Euler 'YXZ' angles { x, y, z } (asin input clamped, gimbal case handled). */
    toEulerYXZ(out = { x: 0, y: 0, z: 0 }) {
      const { x, y, z, w } = this;
      const m11 = 1 - 2 * (y * y + z * z), m13 = 2 * (x * z + w * y), m21 = 2 * (x * y + w * z);
      const m22 = 1 - 2 * (x * x + z * z), m23 = 2 * (y * z - w * x), m31 = 2 * (x * z - w * y), m33 = 1 - 2 * (x * x + y * y);
      out.x = safeAsin(-m23);
      if (Math.abs(m23) < 0.9999999) { out.y = Math.atan2(m13, m33); out.z = Math.atan2(m21, m22); } else { out.y = Math.atan2(-m31, m11); out.z = 0; }
      return out;
    }
    isFinite() { return Number.isFinite(this.x) && Number.isFinite(this.y) && Number.isFinite(this.z) && Number.isFinite(this.w); }
  }

  /** Cubic Hermite spline in time: p0 with velocity v0 at s = 0, p1 with velocity v1 at s = 1; T = duration (s). */
  function hermite(out, p0, v0, p1, v1, T, s) {
    const s2 = s * s, s3 = s2 * s;
    const h00 = 2 * s3 - 3 * s2 + 1, h10 = (s3 - 2 * s2 + s) * T, h01 = -2 * s3 + 3 * s2, h11 = (s3 - s2) * T;
    out.x = h00 * p0.x + h10 * v0.x + h01 * p1.x + h11 * v1.x;
    out.y = h00 * p0.y + h10 * v0.y + h01 * p1.y + h11 * v1.y;
    out.z = h00 * p0.z + h10 * v0.z + h01 * p1.z + h11 * v1.z;
    return out;
  }
  /** Velocity (per second) of the Hermite spline above. */
  function hermiteVelocity(out, p0, v0, p1, v1, T, s) {
    const s2 = s * s, iT = 1 / Math.max(EPS, T);
    const d00 = (6 * s2 - 6 * s) * iT, d10 = 3 * s2 - 4 * s + 1, d01 = (-6 * s2 + 6 * s) * iT, d11 = 3 * s2 - 2 * s;
    out.x = d00 * p0.x + d10 * v0.x + d01 * p1.x + d11 * v1.x;
    out.y = d00 * p0.y + d10 * v0.y + d01 * p1.y + d11 * v1.y;
    out.z = d00 * p0.z + d10 * v0.z + d01 * p1.z + d11 * v1.z;
    return out;
  }
  /** Cubic Bezier point at u in [0, 1]. */
  function bezier3(out, p0, p1, p2, p3, u) {
    const a = 1 - u, b0 = a * a * a, b1 = 3 * a * a * u, b2 = 3 * a * u * u, b3 = u * u * u;
    out.x = b0 * p0.x + b1 * p1.x + b2 * p2.x + b3 * p3.x;
    out.y = b0 * p0.y + b1 * p1.y + b2 * p2.y + b3 * p3.y;
    out.z = b0 * p0.z + b1 * p1.z + b2 * p2.z + b3 * p3.z;
    return out;
  }
  /** Derivative dP/du of the cubic Bezier. */
  function bezier3Derivative(out, p0, p1, p2, p3, u) {
    const a = 1 - u, d0 = 3 * a * a, d1 = 6 * a * u, d2 = 3 * u * u;
    out.x = d0 * (p1.x - p0.x) + d1 * (p2.x - p1.x) + d2 * (p3.x - p2.x);
    out.y = d0 * (p1.y - p0.y) + d1 * (p2.y - p1.y) + d2 * (p3.y - p2.y);
    out.z = d0 * (p1.z - p0.z) + d1 * (p2.z - p1.z) + d2 * (p3.z - p2.z);
    return out;
  }
  /** Rotate the unit vector a toward the unit vector b by at most maxAngle (spherical, no NaN at 0 or 180 deg). */
  function rotateTowards(out, a, b, maxAngle) {
    const ang = safeAcos(a.dot(b));
    if (ang < 1e-6 || ang <= maxAngle) return out.copy(b);
    if (ang > Math.PI - 1e-4) { // opposite directions: any perpendicular works, pick a stable one
      const p = new Vector3().crossVectors(a, Math.abs(a.y) < 0.9 ? UP : FWD).normalize();
      return out.copy(a).multiplyScalar(Math.cos(maxAngle)).addScaledVector(p, Math.sin(maxAngle));
    }
    const t = maxAngle / ang, s = Math.sin(ang), wa = Math.sin((1 - t) * ang) / s, wb = Math.sin(t * ang) / s;
    return out.set(a.x * wa + b.x * wb, a.y * wa + b.y * wb, a.z * wa + b.z * wb).normalize(b);
  }
  /** Launch velocity that carries a projectile from p0 to p1 in time t under gravity g (m/s^2, pulling -Y). */
  function ballisticVelocity(out, p0, p1, t, g) {
    t = Math.max(0.05, t);
    return out.subVectors(p1, p0).multiplyScalar(1 / t).addScaledVector(UP, 0.5 * g * t);
  }

  const MathUtils = { EPS, clamp, saturate, lerp, smoothstep, safeAcos, safeAsin, wrapAngle, dampFactor, dampAngle, softMax, softMin, hermite, hermiteVelocity, bezier3, bezier3Derivative, rotateTowards, ballisticVelocity };

  // =====================================================================================================
  // Two-bone IK (shoulder, elbow, hand) with a soft reach limit and a damped elbow direction
  // =====================================================================================================
  class TwoBoneIK {
    /**
     * @param upper  shoulder to elbow length
     * @param lower  elbow to palm length (forearm + hand)
     * @param opts   { wrist: elbow-to-wrist length, softness: fraction of the reach eased at full extension,
     *                 bendLambda: how fast the elbow direction follows the pole (1/s), maxWristAngle }
     */
    constructor(upper, lower, opts = {}) {
      this.l1 = Math.max(0.01, upper);
      this.l2 = Math.max(0.01, lower);
      this.wristLen = clamp(opts.wrist != null ? opts.wrist : this.l2 * 0.8, 0.01, this.l2);
      this.softness = clamp(opts.softness != null ? opts.softness : 0.06, 0.005, 0.5);
      this.bendLambda = opts.bendLambda != null ? opts.bendLambda : 16;
      this.maxWristAngle = opts.maxWristAngle != null ? opts.maxWristAngle : 1.2;
      this.bend = new Vector3();
      this.hasBend = false;
      this.lastDir = new Vector3(0, -1, 0);
      this.out = {
        shoulder: new Vector3(), elbow: new Vector3(), wrist: new Vector3(), palm: new Vector3(),
        upperQ: new Quaternion(), lowerQ: new Quaternion(), handQ: new Quaternion(),
        reach: 0, extension: 0,
      };
      this._t = { d: new Vector3(), dir: new Vector3(), p: new Vector3(), prev: new Vector3(), hinge: new Vector3(), a: new Vector3(), b: new Vector3(), c: new Vector3() };
    }
    get length() { return this.l1 + this.l2; }

    /**
     * Solve for the palm to reach `target` from `shoulder`.
     * @param pole    direction the elbow should point toward (any length; it is projected every frame)
     * @param dt      seconds since the last solve (the first solve sets the elbow direction directly)
     * @param handAim optional finger direction; handAimWeight 0..1 blends from the forearm direction to it
     */
    solve(shoulder, target, pole, dt, handAim, handAimWeight) {
      const t = this._t, o = this.out, L1 = this.l1, L2 = this.l2;
      o.shoulder.copy(shoulder);
      // direction and distance to the target (keep the last direction when the target sits on the shoulder)
      t.d.subVectors(target, shoulder);
      let dist = t.d.length();
      if (!(dist > 1e-5) || !Number.isFinite(dist)) { t.dir.copy(this.lastDir); dist = 0; } else t.dir.copy(t.d).multiplyScalar(1 / dist);
      this.lastDir.copy(t.dir);
      // soft reach: never fully straight (no elbow pop), never folded past the minimum
      const maxR = L1 + L2, minR = Math.max(Math.abs(L1 - L2), 0.08 * maxR) + 1e-4;
      let r = softMax(dist, maxR, this.softness * maxR);
      r = softMin(r, minR, 0.05 * maxR);
      // elbow bend direction: the pole projected perpendicular to the arm, blended with last frame's direction
      t.p.copy(pole).projectOnPlane(t.dir);
      if (this.hasBend) {
        t.prev.copy(this.bend).projectOnPlane(t.dir);
        // the previous direction carries a small weight, so a pole nearly parallel to the arm cannot flip the elbow
        t.p.addScaledVector(t.prev, 0.25);
      }
      if (t.p.lengthSq() < 1e-10) { t.p.crossVectors(t.dir, Math.abs(t.dir.y) < 0.95 ? UP : FWD); }
      t.p.normalize(t.prev.lengthSq() > 1e-10 ? t.prev : undefined);
      if (!this.hasBend) { this.bend.copy(t.p); this.hasBend = true; }
      else if (dt > 0) this.bend.lerp(t.p, dampFactor(this.bendLambda, dt)); // dt = 0 keeps the elbow where it was
      this.bend.projectOnPlane(t.dir).normalize(t.p);
      // law of cosines for the shoulder angle
      const cosA = (L1 * L1 + r * r - L2 * L2) / (2 * L1 * r);
      const A = safeAcos(cosA);
      o.elbow.copy(shoulder).addScaledVector(t.dir, L1 * Math.cos(A)).addScaledVector(this.bend, L1 * Math.sin(A));
      o.palm.copy(shoulder).addScaledVector(t.dir, r);
      o.reach = r;
      o.extension = saturate((r - minR) / (maxR - minR));
      // orientations: +Y along each bone, +X = elbow hinge (the same axis for both bones, so the elbow is a hinge)
      t.hinge.crossVectors(t.dir, this.bend).normalize(); // unit already: dir and bend are perpendicular unit vectors
      t.a.subVectors(o.elbow, shoulder).normalize(t.dir);
      orient(o.upperQ, t.a, t.hinge);
      t.b.subVectors(o.palm, o.elbow).normalize(t.dir);
      orient(o.lowerQ, t.b, t.hinge);
      o.wrist.copy(o.elbow).addScaledVector(t.b, this.wristLen);
      // hand: follows the forearm, flexed toward handAim (limited to maxWristAngle)
      if (handAim && handAimWeight > 0) {
        t.c.copy(handAim).normalize(t.b);
        rotateTowards(t.c, t.b, t.c, this.maxWristAngle * saturate(handAimWeight));
      } else t.c.copy(t.b);
      orient(o.handQ, t.c, t.hinge);
      return o;
    }
  }
  /** Quaternion whose +Y is `y` and whose +X is `hint` made perpendicular (keeps the hemisphere of `q`). */
  const _ox = new Vector3(), _oz = new Vector3(), _oq = new Quaternion();
  function orient(q, y, hint) {
    _ox.copy(hint).projectOnPlane(y);
    if (_ox.lengthSq() < 1e-10) _ox.crossVectors(y, Math.abs(y.z) < 0.95 ? FWD : UP);
    _ox.normalize();
    _oz.crossVectors(_ox, y);
    _oq.copy(q);
    return q.setFromBasis(_ox, y, _oz).alignTo(_oq);
  }

  // =====================================================================================================
  // Configuration
  // =====================================================================================================
  const DEFAULTS = {
    gravity: 9.81,
    ballRadius: 0.12,                 // size 7 ball
    hierarchy: 'chain',               // 'chain': upper arm is a child of the torso, forearm of the upper arm ...
                                      // 'flat': every arm bone is a direct child of the root (positions are set too)
    blendTime: 0.22,                  // cross-fade between actions (s)
    torsoLambda: 10, headLambda: 14,  // angle damping (1/s)
    body: {
      torsoPivot: 1.02,               // spine pivot height (m) above the root
      shoulderHeight: 0.42,           // shoulder height above the spine pivot
      shoulderHalfWidth: 0.19,
      headHeight: 0.58,
      upperArm: 0.31, foreArm: 0.27, hand: 0.09,   // hand = wrist to palm center
      maxTorsoYaw: 1.0, maxHeadYaw: 1.25, maxHeadPitch: 0.8,
    },
    dribble: {
      height: 0.78,                   // ball center height where the hand releases and catches it (m)
      period: 0.56,                   // one full bounce cycle (s)
      contactFraction: 0.32,          // share of the cycle the hand is on the ball
      restitution: 0.8,               // basketball coefficient of restitution on hardwood
      sideOffset: 0.36,               // ball to the side of the body (m)
      forward: 0.3,                   // ball in front of the body (m)
      crossWidth: 0.2,                // release point for a crossover, closer to the middle (m)
      crossTime: 0.82,                // a crossover bounce is quicker (fraction of the normal air time)
      crouch: 0.12,                   // knees bend, the torso drops this much (m)
      lean: 0.22,                     // torso pitch while dribbling (rad)
      startTime: 0.28,                // hand brings the ball from wherever it is into the first bounce (s)
    },
    pass: { duration: 0.78, releaseAt: 0.5, speed: 9.5, maxExtension: 0.93 },
    layup: {
      standoff: 0.55,                 // apex of the root path stops this far in front of the rim (m)
      loadTime: 0.16,                 // plant step before take-off: knees dip, run speed blends into the jump (s)
      maxGlideSpeed: 4.5,             // horizontal speed cap in the air (m/s); a far rim means taking off short
      handSideShift: 0.16,            // body offset so the shooting hand, not the head, is under the rim
      aimAbove: 0.28, aimBack: 0.18,  // offset near the rim the shooting hand reaches for
      releaseAt: 0.9,                 // fraction of the rise when the ball leaves the hand
      maxJump: 0.75, minJump: 0.2,
      landTime: 0.32,
    },
    boneRest: {},                     // optional { upperArm, foreArm, hand, torso, head }: Quaternion bind corrections
  };
  function mergeDeep(base, over) {
    const out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
    if (over) for (const k of Object.keys(over)) {
      const v = over[k];
      out[k] = v && typeof v === 'object' && !(v instanceof Vector3) && !(v instanceof Quaternion) && base[k] && typeof base[k] === 'object' ? mergeDeep(base[k], v) : v;
    }
    return out;
  }

  const HANDS = ['left', 'right'];
  /**
   * Palm point on the ball surface for a grip blend w: 0 = on top (dribbling), 1 = on the side (two-hand hold).
   * The blend happens on the sphere (normalize, then scale), so the palm never cuts through the ball.
   */
  const _gA = new Vector3(), _gB = new Vector3();
  function gripPoint(out, ball, hand, w, radius) {
    const s = hand === 'right' ? -1 : 1;
    _gA.set(s * 0.32, 1, -0.16).normalize();
    _gB.set(s * 1, 0.15, -0.23).normalize();
    return out.lerpVectors(_gA, _gB, w).normalize(_gB).multiplyScalar(radius + 0.012).add(ball);
  }
  const sideX = hand => (hand === 'right' ? -1 : 1);      // the character's right side is -X
  const other = hand => (hand === 'right' ? 'left' : 'right');

  /** A pose in root space. Controllers fill one; the animator blends, damps, solves and applies it. */
  function makePose() {
    return {
      hands: {
        left: { target: new Vector3(), aim: new Vector3(0, 0, 1), aimWeight: 0 },
        right: { target: new Vector3(), aim: new Vector3(0, 0, 1), aimWeight: 0 },
      },
      torsoYaw: 0, torsoPitch: 0, headYaw: 0, headPitch: 0, crouch: 0,
    };
  }
  function copyPose(dst, src) {
    for (const h of HANDS) { dst.hands[h].target.copy(src.hands[h].target); dst.hands[h].aim.copy(src.hands[h].aim); dst.hands[h].aimWeight = src.hands[h].aimWeight; }
    dst.torsoYaw = src.torsoYaw; dst.torsoPitch = src.torsoPitch; dst.headYaw = src.headYaw; dst.headPitch = src.headPitch; dst.crouch = src.crouch;
    return dst;
  }
  function blendPose(dst, a, b, t) {
    for (const h of HANDS) {
      dst.hands[h].target.lerpVectors(a.hands[h].target, b.hands[h].target, t);
      dst.hands[h].aim.lerpVectors(a.hands[h].aim, b.hands[h].aim, t).normalize(b.hands[h].aim);
      dst.hands[h].aimWeight = lerp(a.hands[h].aimWeight, b.hands[h].aimWeight, t);
    }
    dst.torsoYaw = a.torsoYaw + wrapAngle(b.torsoYaw - a.torsoYaw) * t;
    dst.torsoPitch = lerp(a.torsoPitch, b.torsoPitch, t);
    dst.headYaw = a.headYaw + wrapAngle(b.headYaw - a.headYaw) * t;
    dst.headPitch = lerp(a.headPitch, b.headPitch, t);
    dst.crouch = lerp(a.crouch, b.crouch, t);
    return dst;
  }

  // =====================================================================================================
  // Idle: relaxed arms, or the ball held in front of the chest (triple threat)
  // =====================================================================================================
  class IdleController {
    constructor(anim) { this.a = anim; this.name = 'idle'; this.b0 = new Vector3(); this.bv0 = new Vector3(); this._zero = new Vector3(); }
    start() { this.t = 0; this.b0.copy(this.a.ballLocal); this.bv0.copy(this.a.ballVelLocal); }
    update(dt, pose) {
      const a = this.a, B = a.cfg.body, r = a.cfg.ballRadius;
      this.t += dt;
      pose.torsoYaw = 0; pose.torsoPitch = 0.04; pose.headYaw = 0; pose.headPitch = 0; pose.crouch = a.ball.held ? 0.05 : 0;
      if (a.ball.held) {
        // the ball eases from wherever it was (with its velocity) into the two-hand hold: Hermite, C1
        const hold = a._v1.set(0, B.torsoPivot + 0.02 - 0.05, 0.32), E = 0.3;
        if (this.t < E) {
          hermite(a.ballLocal, this.b0, this.bv0, hold, this._zero, E, this.t / E);
          hermiteVelocity(a.ballVelLocal, this.b0, this.bv0, hold, this._zero, E, this.t / E);
        } else { a.ballLocal.copy(hold); a.ballVelLocal.set(0, 0, 0); }
        for (const h of HANDS) gripPoint(pose.hands[h].target, a.ballLocal, h, 1, r);
      } else {
        // subtle breathing sway keeps relaxed arms from looking frozen (a continuous sine, not a loop clip)
        const sway = 0.012 * Math.sin(this.t * 1.7);
        for (const h of HANDS) pose.hands[h].target.set(sideX(h) * 0.23, 0.86 + sway, 0.07);
      }
      for (const h of HANDS) { pose.hands[h].aim.set(0, -1, 0.2).normalize(); pose.hands[h].aimWeight = 0; }
    }
  }

  // =====================================================================================================
  // DRIBBLING
  // Air: a true gravity parabola (pushed down, bounce with restitution, rising into the catching hand).
  // Contact: a cubic Hermite from the catch (moving up) to the release (moving down), so position and velocity
  // are continuous at both ends of every phase. Horizontal motion in the air is constant velocity (ballistic).
  // =====================================================================================================
  /**
   * Solve the downward push speed so that the ball leaves the hand at height h (center), hits the floor, bounces
   * with restitution e and comes back up to height h after exactly `airTime` seconds.
   * Returns { vDown, tDown, vUp, vCatch, T } (T = the air time actually achieved after clamping).
   */
  function solveDribbleAir(h, radius, g, e, airTime) {
    const drop = Math.max(0.05, h - radius);
    e = clamp(e, 0.3, 0.98);
    // fastest push so the ball still comes back up to the hand: e^2 (v^2 + 2 g drop) >= 2 g drop
    const vMin = Math.sqrt(Math.max(0, 2 * g * drop * (1 / (e * e) - 1))) + 1e-4;
    const flight = v => {
      const vImpact = Math.sqrt(v * v + 2 * g * drop);
      const tDown = (vImpact - v) / g;
      const vUp = e * vImpact;
      const disc = Math.max(0, vUp * vUp - 2 * g * drop);
      const tUp = (vUp - Math.sqrt(disc)) / g;
      return { vDown: v, tDown, vUp, vCatch: Math.sqrt(disc), T: tDown + tUp };
    };
    let lo = vMin, hi = 40;
    const slowest = flight(lo), fastest = flight(hi);
    if (airTime >= slowest.T) return slowest;
    if (airTime <= fastest.T) return fastest;
    for (let i = 0; i < 48; i++) { // bisection: flight time falls monotonically as the push gets harder
      const mid = 0.5 * (lo + hi);
      if (flight(mid).T > airTime) lo = mid; else hi = mid;
    }
    return flight(0.5 * (lo + hi));
  }

  class DribbleController {
    constructor(anim) {
      this.a = anim; this.name = 'dribble';
      this.air = null; this.contact = null;
      this._p = new Vector3(); this._v = new Vector3(); this._o = new Vector3(); this._h = new Vector3();
    }
    get p() { return this.a.cfg.dribble; }
    start(opts = {}) {
      this.owner = opts.hand === 'left' || opts.hand === 'right' ? opts.hand : (this.owner || 'right');
      this.pendingCross = false; this.stopRequested = false; this.phase = 'contact'; this.t = 0; this.done = false;
      // first contact: carry the ball from wherever it is (with its current velocity) into the first push
      const next = this.planAir(this.owner, this.owner, false);
      this.contact = this.planContact(this.a.ballLocal, this.a.ballVelLocal, next, Math.max(0.12, this.p.startTime));
      this.a.ball.held = true;
    }
    /** Queue a crossover. Taken on the next push; if the hand is early in its push it re-plans this one smoothly. */
    crossover() {
      if (this.phase === 'contact' && this.contact && this.contact.next && !this.contact.next.crossing && this.contact.T - this.t > 0.5 * this.contact.T && !this.stopRequested) {
        // re-plan the rest of this push from the ball's current position and velocity (C1, no jump)
        const c = this.contact, s = saturate(this.t / c.T);
        const pos = hermite(new Vector3(), c.p0, c.v0, c.p1, c.v1, c.T, s);
        const vel = hermiteVelocity(new Vector3(), c.p0, c.v0, c.p1, c.v1, c.T, s);
        const next = this.planAir(this.owner, other(this.owner), true);
        this.contact = this.planContact(pos, vel, next, c.T - this.t);
        this.t = 0;
        return true;
      }
      this.pendingCross = true;
      return false;
    }
    /** Pick the ball up at the next catch (it ends held in both hands in front of the chest). */
    stop() { this.stopRequested = true; }

    releasePoint(hand, crossing) {
      const P = this.p;
      return new Vector3(sideX(hand) * (crossing ? P.crossWidth : P.sideOffset), P.height, P.forward); // heights from the floor
    }
    catchPoint(hand) { const P = this.p; return new Vector3(sideX(hand) * P.sideOffset, P.height, P.forward); }
    planAir(releaseHand, catchHand, crossing) {
      const a = this.a, P = this.p;
      const period = Math.max(0.25, P.period), cf = clamp(P.contactFraction, 0.15, 0.6);
      const target = period * (1 - cf) * (crossing ? clamp(P.crossTime, 0.5, 1.2) : 1);
      const R = this.releasePoint(releaseHand, crossing), C = this.catchPoint(catchHand);
      const sol = solveDribbleAir(R.y, a.cfg.ballRadius, a.cfg.gravity, P.restitution, target);
      const vh = new Vector3(C.x - R.x, 0, C.z - R.z).multiplyScalar(1 / sol.T);
      return Object.assign(sol, { R, C, vh, releaseHand, catchHand, crossing, h: R.y });
    }
    /** Hermite contact phase from (pos, vel) to the next air phase's release point and launch velocity. */
    planContact(pos, vel, next, T) {
      const v1 = new Vector3(next.vh.x, -next.vDown, next.vh.z);
      return { p0: pos.clone(), v0: vel.clone(), p1: next.R.clone(), v1, T: Math.max(0.05, T), next };
    }
    planHold(pos, vel) {
      const a = this.a;
      const hold = new Vector3(0, a.cfg.body.torsoPivot + 0.02 - 0.05, 0.32); // same hold as IdleController
      return { p0: pos.clone(), v0: vel.clone(), p1: hold, v1: new Vector3(), T: 0.34, next: null, hold: true };
    }
    ballInAir(out, vel, air, t) {
      const g = this.a.cfg.gravity, r = this.a.cfg.ballRadius;
      out.set(air.R.x + air.vh.x * t, 0, air.R.z + air.vh.z * t);
      vel.set(air.vh.x, 0, air.vh.z);
      if (t < air.tDown) { out.y = air.h - air.vDown * t - 0.5 * g * t * t; vel.y = -air.vDown - g * t; }
      else { const u = t - air.tDown; out.y = r + air.vUp * u - 0.5 * g * u * u; vel.y = air.vUp - g * u; }
      out.y = Math.max(r, out.y);
      return out;
    }
    /** Where a palm rests on the ball: on top, a little to the outside and behind (pushing it forward-down). */
    contactPoint(out, ballPos, hand) { return gripPoint(out, ballPos, hand, 0, this.a.cfg.ballRadius); }
    guardPoint(out, hand, crouch) { return out.set(sideX(hand) * 0.3, 1.1 - crouch, 0.33); }

    update(dt, pose) {
      const a = this.a, P = this.p, r = a.cfg.ballRadius;
      this.t += dt;
      // advance through as many phases as dt covers (large dt never skips a phase boundary)
      for (let guard = 0; guard < 8; guard++) {
        if (this.phase === 'contact' && this.t >= this.contact.T) {
          this.t -= this.contact.T;
          if (this.contact.hold) { this.phase = 'hold'; break; }
          this.air = this.contact.next; this.phase = 'air';
        } else if (this.phase === 'air' && this.t >= this.air.T) {
          this.t -= this.air.T;
          const air = this.air;
          this.owner = air.catchHand;
          const pos = this.ballInAir(this._p, this._v, air, air.T);
          const vel = this._v.clone();
          if (this.stopRequested) { this.contact = this.planHold(pos, vel); }
          else {
            const crossing = this.pendingCross; this.pendingCross = false;
            const next = this.planAir(this.owner, crossing ? other(this.owner) : this.owner, crossing);
            this.contact = this.planContact(pos, vel, next, Math.max(0.25, P.period) * clamp(P.contactFraction, 0.15, 0.6));
          }
          this.phase = 'contact';
        } else break;
      }
      const ball = a.ballLocal, bv = a.ballVelLocal;
      const crouch = P.crouch;
      pose.crouch = this.phase === 'hold' ? 0.05 : crouch;
      pose.torsoPitch = this.phase === 'hold' ? 0.05 : P.lean;
      pose.headPitch = 0; // eyes up the floor, not on the ball (head angles are absolute, in root space)
      pose.headYaw = 0;
      const H = pose.hands, own = this.owner;
      if (this.phase === 'hold') {
        ball.copy(this.contact.p1); bv.set(0, 0, 0);
        for (const h of HANDS) { gripPoint(H[h].target, ball, h, 1, r); H[h].aimWeight = 0; }
        pose.torsoYaw = 0;
        this.done = true; // same pose as the idle ball hold, so the hand-off is seamless
        return;
      }
      if (this.phase === 'contact') {
        const c = this.contact, s = saturate(this.t / c.T);
        hermite(ball, c.p0, c.v0, c.p1, c.v1, c.T, s);
        hermiteVelocity(bv, c.p0, c.v0, c.p1, c.v1, c.T, s);
        if (c.hold) { // picking the ball up: both hands close in on it
          const w = smoothstep(0, 0.6, s);
          for (const h of HANDS) {
            if (h === own) gripPoint(H[h].target, ball, h, w, r); // slides over the ball surface to its side
            else H[h].target.lerpVectors(this.guardPoint(this._h, h, crouch), gripPoint(this._o, ball, h, 1, r), w);
            H[h].aimWeight = h === own ? 1 - w : 0;
          }
        } else {
          this.contactPoint(H[own].target, ball, own);
          this.guardPoint(H[other(own)].target, other(own), crouch);
          H[own].aimWeight = 1; H[other(own)].aimWeight = 0;
        }
      } else {
        const air = this.air, T = air.T, t = saturate(this.t / T) * T;
        this.ballInAir(ball, bv, air, t);
        // the hand follows the ball down a little, hovers, then meets it on the way up (smoothstep: C1 at both ends)
        const ramp = 0.42 * T;
        const wOut = smoothstep(0, ramp, t), wIn = smoothstep(T - ramp, T, t);
        const rel = air.releaseHand, cat = air.catchHand;
        if (rel === cat) {
          const hover = this._h.set(air.C.x + sideX(rel) * 0.035, air.C.y + r + 0.05, air.C.z - 0.02);
          this.contactPoint(this._o, ball, rel);
          H[rel].target.lerpVectors(this._o, hover, wOut * (1 - wIn));
          H[rel].aimWeight = 1 - 0.6 * wOut * (1 - wIn);
          this.guardPoint(H[other(rel)].target, other(rel), crouch); H[other(rel)].aimWeight = 0;
        } else { // crossover: the releasing hand goes back to guard, the other hand comes across to meet the ball
          this.contactPoint(this._o, ball, rel);
          H[rel].target.lerpVectors(this._o, this.guardPoint(this._h, rel, crouch), wOut);
          H[rel].aimWeight = 1 - wOut;
          this.contactPoint(this._o, ball, cat);
          H[cat].target.lerpVectors(this.guardPoint(this._h, cat, crouch), this._o, wIn);
          H[cat].aimWeight = wIn;
        }
      }
      // fingers spread over the front of the ball; the torso turns slightly toward the ball
      for (const h of HANDS) H[h].aim.set(sideX(h) * -0.12, -0.62, 0.78).normalize();
      pose.torsoYaw = clamp(Math.atan2(ball.x, Math.max(0.2, ball.z + 0.4)) * 0.35, -0.3, 0.3);
    }
  }

  // =====================================================================================================
  // PASSING (two-hand chest pass)
  // The torso and head turn toward the receiver; both hands carry the ball to the chest, then extend straight
  // along the normalized vector toward the receiver and come back. One smoothstep envelope drives it:
  // idle -> gather -> maximum extension (release) -> follow-through -> idle.
  // =====================================================================================================
  class PassController {
    constructor(anim) {
      this.a = anim; this.name = 'pass';
      this.target = new Vector3(); this.b0 = new Vector3(); this.bv0 = new Vector3();
      this._q = new Quaternion(); this._fwd = new Vector3(); this._right = new Vector3(); this._chest = new Vector3();
      this._hold = new Vector3(); this._path = new Vector3(); this._t1 = new Vector3(); this._t2 = new Vector3(); this._zero = new Vector3();
    }
    start(targetWorld, opts = {}) {
      const P = this.a.cfg.pass;
      this.target.copy(targetWorld);
      this.T = Math.max(0.3, opts.duration || P.duration);
      this.rel = clamp(opts.releaseAt != null ? opts.releaseAt : P.releaseAt, 0.3, 0.8);
      this.speed = Math.max(2, opts.speed || P.speed);
      this.t = 0; this.released = false; this.done = false;
      this.b0.copy(this.a.ballLocal); this.bv0.copy(this.a.ballVelLocal);
      this.gather = this.rel * 0.55;               // hands have the ball at the chest by this fraction
      this.a.ball.held = true;
    }
    /** Longest push along fwd that keeps both hands inside maxExtension of the arm (quadratic, NaN-safe). */
    reach(hold, fwd, right, torsoQ, crouch) {
      const a = this.a, r = a.cfg.ballRadius, L = a.ik.right.length * a.cfg.pass.maxExtension;
      let best = 0.6;
      for (const h of HANDS) {
        const sh = a.shoulderLocal(this._t1, h, torsoQ, crouch);
        const q = this._t2.copy(hold).addScaledVector(right, (h === 'right' ? 1 : -1) * (r + 0.012)).sub(sh);
        const qf = q.dot(fwd), disc = qf * qf - q.lengthSq() + L * L;
        best = Math.min(best, disc > 0 ? -qf + Math.sqrt(disc) : 0);
      }
      return clamp(best, 0, 0.6);
    }
    update(dt, pose) {
      const a = this.a, B = a.cfg.body, r = a.cfg.ballRadius;
      this.t = Math.min(this.T, this.t + dt);
      const u = this.t / this.T;
      const tl = a.worldToLocal(this._t1, this.target);
      // --- aim: torso takes part of the turn, the head the rest (weights are smoothsteps: no snap in or out)
      const chestY = B.torsoPivot + B.shoulderHeight - 0.08;
      const dx = tl.x, dz = tl.z, dy = tl.y - chestY, horiz = Math.max(0.05, Math.hypot(dx, dz));
      const yaw = Math.atan2(dx, dz), look = Math.atan2(dy, horiz);
      const aimW = smoothstep(0, 0.3, u) * (1 - smoothstep(0.78, 1, u));
      pose.torsoYaw = clamp(yaw, -B.maxTorsoYaw, B.maxTorsoYaw) * aimW;
      pose.headYaw = clamp(yaw, -B.maxTorsoYaw - B.maxHeadYaw, B.maxTorsoYaw + B.maxHeadYaw) * aimW;
      pose.headPitch = clamp(-look, -B.maxHeadPitch, B.maxHeadPitch) * aimW;
      // --- extension envelope: 0 (idle) -> 1 at the release -> 0, plus a small step into the pass
      const ext = smoothstep(this.gather, this.rel + 0.06, u) * (1 - smoothstep(this.rel + 0.16, 0.9, u));
      pose.torsoPitch = 0.05 + 0.1 * ext;
      pose.crouch = 0.04 * (1 - smoothstep(0.7, 1, u));
      // --- live chest frame after the torso turn; the arms extend along the normalized vector to the receiver
      const tq = this._q.setFromEulerYXZ(pose.torsoPitch, pose.torsoYaw, 0);
      const chest = this._chest.set(0, B.shoulderHeight - 0.1, 0).applyQuaternion(tq).add(this._t2.set(0, B.torsoPivot - pose.crouch, 0));
      const torsoFwd = this._t2.set(0, 0, 1).applyQuaternion(tq);
      const fwd = this._fwd.subVectors(tl, chest).normalize(torsoFwd);
      const right = this._right.crossVectors(fwd, UP);
      if (right.lengthSq() < 1e-6) right.set(-1, 0, 0).applyQuaternion(tq); // receiver straight above/below
      right.normalize();
      // ball held about 30 cm in front of the chest, elbows out (close to the chest the arms fold and the elbows whip)
      const hold = this._hold.copy(chest).addScaledVector(fwd, 0.3).addScaledVector(UP, -0.08);
      const path = this._path.copy(hold).addScaledVector(fwd, this.reach(hold, fwd, right, tq, pose.crouch) * ext); // a pure function of this frame
      // --- ball: Hermite from its state at the start (position + velocity) into the hands, then the path
      const ball = a.ballLocal;
      if (!this.released) {
        const g = this.gather;
        if (u < g) {
          hermite(ball, this.b0, this.bv0, path, this._zero, g * this.T, u / g);
          hermiteVelocity(a.ballVelLocal, this.b0, this.bv0, path, this._zero, g * this.T, u / g);
        } else { ball.copy(path); a.ballVelLocal.set(0, 0, 0); }
        if (u >= this.rel) this.release(ball);
      }
      // --- hands on the sides of the ball (same formula before and after the release: continuous)
      const idleW = smoothstep(0.8, 1, u);
      const src = this.released ? path : ball;
      for (const h of HANDS) {
        const hp = pose.hands[h];
        this._t1.copy(src).addScaledVector(right, (h === 'right' ? 1 : -1) * (r + 0.012)).addScaledVector(fwd, -0.035);
        hp.target.lerpVectors(this._t1, this._t2.set(sideX(h) * 0.23, 0.86, 0.07), idleW);
        hp.aim.copy(fwd).addScaledVector(right, (h === 'right' ? -0.35 : 0.35)).normalize();
        hp.aimWeight = ext * (1 - idleW);
      }
      if (u >= 1) this.done = true;
    }
    release(ballLocal) {
      const a = this.a;
      this.released = true;
      const p0 = a.localToWorld(new Vector3(), ballLocal);
      const dist = p0.distanceTo(this.target);
      const tf = clamp(dist / this.speed, 0.12, 1.6);
      const v = ballisticVelocity(new Vector3(), p0, this.target, tf, a.cfg.gravity);
      a.launchBall(p0, v, tf, 'pass', this.target);
    }
  }

  // =====================================================================================================
  // LAYUPS
  // The root follows a cubic Bezier from the take-off point to an apex in front of the rim. The control points
  // are the degree-elevated quadratic of a projectile, so the jump rises with real gravity-like deceleration
  // (vertical speed reaches exactly zero at the apex), then the fall continues the same parabola to the floor.
  // The shooting hand's target is the shoulder-to-rim-offset vector, extended as far as the arm allows.
  // =====================================================================================================
  class LayupController {
    constructor(anim) {
      this.a = anim; this.name = 'layup';
      this.P = [new Vector3(), new Vector3(), new Vector3(), new Vector3()];
      this.rim = new Vector3(); this.aim = new Vector3(); this.vh = new Vector3(); this.land = new Vector3();
      this.b0 = new Vector3(); this.bv0 = new Vector3(); this._zero = new Vector3();
      this._q = new Quaternion(); this._s = new Vector3(); this._d = new Vector3(); this._t1 = new Vector3(); this._t2 = new Vector3(); this._t3 = new Vector3();
      this._ext = new Vector3(); this._cradle = new Vector3(); this._ball = new Vector3();
    }
    /**
     * @param rimWorld  rim center (world)
     * @param opts      { hand: 'right'|'left', takeoff: Vector3 (world, default: current root), duration: rise time (s),
     *                    curve: sideways bend of the path (m, + = toward the character's left) }
     */
    start(rimWorld, opts = {}) {
      const a = this.a, C = a.cfg.layup, B = a.cfg.body, g = a.cfg.gravity;
      this.hand = opts.hand === 'left' ? 'left' : 'right';
      this.rim.copy(rimWorld);
      const P0 = this.P[0].copy(opts.takeoff || a.rootPos);
      // approach direction on the floor plane (fallback: the way the character already faces)
      const dirH = this._d.set(rimWorld.x - P0.x, 0, rimWorld.z - P0.z);
      const facing = this._t1.set(Math.sin(a.rootYaw), 0, Math.cos(a.rootYaw));
      dirH.normalize(facing);
      const right = this._t2.crossVectors(dirH, UP).normalize(); // character right when facing the rim
      // apex: in front of the rim, body shifted so the shooting hand is under it, high enough for the hand to reach
      const armReach = a.ik[this.hand].length * 0.93;
      const reachAboveRoot = B.torsoPivot + B.shoulderHeight + armReach * 0.92;
      const jump = clamp(rimWorld.y + C.aimAbove * 0.5 - reachAboveRoot - P0.y, C.minJump, C.maxJump);
      const apex = this._t3.set(rimWorld.x, P0.y + jump, rimWorld.z).addScaledVector(dirH, -C.standoff)
        .addScaledVector(right, (this.hand === 'right' ? -1 : 1) * C.handSideShift);
      // rise time: real gravity unless a duration is given (then the arc is scaled to fit it)
      this.T = opts.duration > 0 ? clamp(opts.duration, 0.2, 1.5) : Math.sqrt((2 * jump) / g);
      this.gEff = (2 * jump) / (this.T * this.T);
      this.jump = jump;
      // plant step: the root keeps its run velocity and blends into the take-off velocity (Hermite, C1 on the floor).
      // Take-off point Pt = P0 + (vIn + H/T) * L/2 and H = apex - Pt, solved together:
      this.loadT = Math.max(0, opts.loadTime != null ? opts.loadTime : C.loadTime);
      this.vIn = new Vector3(a.rootVel.x, 0, a.rootVel.z);
      if (!this.vIn.isFinite() || this.vIn.length() > 12) this.vIn.set(0, 0, 0);
      const L = this.loadT;
      const bend = new Vector3().crossVectors(UP, dirH).normalize().multiplyScalar(clamp(opts.curve || 0, -0.6, 0.6)); // +X side = left
      // take-off velocity is H/T + 3 bend/T (Bezier start tangent); solve H with it so the plant step is consistent
      const H = this._s.set(apex.x - P0.x, 0, apex.z - P0.z).addScaledVector(this.vIn, -L / 2).addScaledVector(bend, -1.5 * L / this.T).multiplyScalar(1 / (1 + L / (2 * this.T)));
      const maxH = C.maxGlideSpeed * this.T;
      if (H.length() > maxH) H.normalize().multiplyScalar(maxH); // never glides faster than a real stride
      this.P0 = P0.clone();
      const Pt = this.P[0].copy(P0).addScaledVector(this.vIn, L / 2).addScaledVector(H, L / (2 * this.T)).addScaledVector(bend, 1.5 * L / this.T);
      // degree-elevated projectile: y controls (0, 2J/3, J, J); horizontal thirds (constant horizontal speed)
      this.P[1].copy(Pt).addScaledVector(H, 1 / 3).addScaledVector(UP, (2 * jump) / 3).add(bend);
      this.P[2].copy(Pt).addScaledVector(H, 2 / 3).addScaledVector(UP, jump).add(bend);
      this.P[3].copy(Pt).add(H).addScaledVector(UP, jump);
      // horizontal take-off velocity (the Bezier's start tangent) is where the plant step has to arrive
      this.vTake = bezier3Derivative(new Vector3(), this.P[0], this.P[1], this.P[2], this.P[3], 0).multiplyScalar(1 / this.T);
      this.vTake.y = 0;
      // velocity at the apex = dP/du / T at u = 1 (includes any sideways curve), so the fall continues it exactly
      bezier3Derivative(this.vh, this.P[0], this.P[1], this.P[2], this.P[3], 1).multiplyScalar(1 / this.T);
      this.vh.y = 0;
      this.ground = Pt.y;
      this.fallT = Math.sqrt((2 * jump) / this.gEff); // same parabola down to the floor
      this.land.copy(this.P[3]).addScaledVector(this.vh, this.fallT); this.land.y = this.ground;
      this.landT = Math.max(0.1, C.landTime);
      this.yaw0 = a.rootYaw; this.yaw1 = Math.atan2(dirH.x, dirH.z);
      // hand aim: a point near the rim, above it and back toward the shooter (the backboard "kiss" spot)
      this.aim.copy(rimWorld).addScaledVector(UP, C.aimAbove).addScaledVector(dirH, -C.aimBack);
      this.b0.copy(a.ballLocal); this.bv0.copy(a.ballVelLocal);
      this.gatherU = clamp(0.2 / (this.T + this.loadT), 0.3, 0.6);  // ball comes into both hands over at least ~0.2 s
      this.t = 0; this.released = false; this.done = false; this.phase = 'rise';
      a.ball.held = true;
    }
    /** Root position (world) at time t (rise on the Bezier, fall on the continued parabola, landing absorb). */
    rootAt(out, t) {
      const T = this.T, L = this.loadT;
      if (t < L) { // plant step on the floor
        hermite(out, this.P0, this.vIn, this.P[0], this.vTake, L, t / L);
        out.y = this.ground;
        return out;
      }
      t -= L;
      if (t <= T) return bezier3(out, this.P[0], this.P[1], this.P[2], this.P[3], t / T);
      const tf = t - T;
      if (tf <= this.fallT) {
        out.copy(this.P[3]).addScaledVector(this.vh, tf);
        out.y = this.P[3].y - 0.5 * this.gEff * tf * tf;
        return out;
      }
      // landing: horizontal speed bleeds off (Hermite to rest), knees absorb a few centimeters
      const s = saturate((tf - this.fallT) / this.landT);
      const end = this._t1.copy(this.land).addScaledVector(this.vh, this.landT * 0.5);
      hermite(out, this.land, this.vh, end, this._zero, this.landT, s);
      out.y = this.ground;
      const sn = Math.sin(Math.PI * s);
      this.absorb = 0.09 * sn * sn;                       // sin^2: zero slope at touchdown and at the end
      return out;
    }
    update(dt, pose) {
      const a = this.a, C = a.cfg.layup, B = a.cfg.body, r = a.cfg.ballRadius, L = this.loadT;
      const T = L + this.T;                               // plant step + rise: the arms work over both
      const total = T + this.fallT + this.landT;
      this.t = Math.min(total, this.t + dt);
      const t = this.t, u = saturate(t / T);
      this.absorb = 0;
      // root (world): position on the curve, yaw turns to face the rim during the first part of the rise
      this.rootAt(a.rootPos, t);
      a.rootYaw = this.yaw0 + wrapAngle(this.yaw1 - this.yaw0) * smoothstep(0, 0.35, u);
      a.rootDriven = true;
      this.phase = t < L ? 'load' : t <= T ? 'rise' : t <= T + this.fallT ? 'fall' : 'land';
      const down = smoothstep(T, T + this.fallT, t);               // follow-through lowers in front of the body ...
      const relax = smoothstep(T + 0.5 * this.fallT, total, t);     // ... then the arms relax to the sides
      const ds = L > 0 && t < L ? Math.sin(Math.PI * t / L) : 0;
      const dip = 0.11 * ds * ds;                          // knees load, then extend into the jump (sin^2: no kinks)
      pose.crouch = this.absorb + dip;
      const ls = t > T + this.fallT ? Math.sin(Math.PI * saturate((t - T - this.fallT) / this.landT)) : 0;
      const landLean = 0.1 * ls * ls;
      pose.torsoPitch = 0.2 * (1 - smoothstep(0, 0.55, u)) - 0.06 * smoothstep(0.35, 1, u) * (1 - down) + landLean;
      // look at the rim
      const rimL = a.worldToLocal(this._t3, this.rim);
      const headBase = B.torsoPivot + B.headHeight;
      pose.headYaw = clamp(Math.atan2(rimL.x, rimL.z), -B.maxHeadYaw, B.maxHeadYaw) * (1 - down);
      pose.headPitch = clamp(-Math.atan2(rimL.y - headBase, Math.max(0.1, Math.hypot(rimL.x, rimL.z))), -B.maxHeadPitch, B.maxHeadPitch) * (1 - down);
      pose.torsoYaw = 0;
      // shooting shoulder in root space, and the full-extension target toward the rim offset
      const tq = this._q.setFromEulerYXZ(pose.torsoPitch, pose.torsoYaw, 0);
      const sh = a.shoulderLocal(this._s, this.hand, tq, pose.crouch);
      const aimL = a.worldToLocal(this._t1, this.aim);
      const toAim = this._d.subVectors(aimL, sh);
      const dist = toAim.length();
      toAim.normalize(UP);
      const armL = a.ik[this.hand].length;
      const handExt = this._ext.copy(sh).addScaledVector(toAim, softMax(dist, armL * 0.95, armL * 0.08));
      // ball: gathered from its state at the take-off, carried in a two-hand cradle, then lifted on the fingertips
      const cradle = this._cradle.set(sideX(this.hand) * 0.14, B.torsoPivot + 0.14 - pose.crouch, 0.3);
      const gather = this.gatherU;
      const reachW = smoothstep(gather, 0.88, u);
      const ball = this._ball;
      const lifted = this._t2.copy(handExt).addScaledVector(toAim, r * 0.85).addScaledVector(UP, 0.02);
      if (u < gather) {
        hermite(ball, this.b0, this.bv0, cradle, this._zero, gather * T, u / gather); // T here = plant + rise
      } else ball.lerpVectors(cradle, lifted, reachW);
      if (!this.released) {
        a.ballVelLocal.subVectors(ball, a.ballLocal).multiplyScalar(dt > 0 ? 1 / dt : 0);
        a.ballLocal.copy(ball);
        if (u >= C.releaseAt) this.release();
      }
      // shooting hand: under/behind the ball, then stays reaching (follow-through) and relaxes on the way down
      const idle = this._t3;
      const hs = pose.hands[this.hand], ho = pose.hands[other(this.hand)];
      hs.target.copy(ball).addScaledVector(toAim, -r * 0.9).addScaledVector(UP, -r * 0.25);
      // the lowering path stays in front of the body (never through the shoulder, so the elbow cannot flick)
      hs.target.lerp(this._t2.set(sideX(this.hand) * 0.3, B.torsoPivot + 0.3 - pose.crouch, 0.42), down);
      hs.target.lerp(idle.set(sideX(this.hand) * 0.24, 0.9, 0.1), relax);
      hs.aim.copy(toAim); hs.aimWeight = reachW * (1 - down);
      // off hand: on the side of the ball while gathering, then up to protect the ball, then relaxed
      const onBall = this._s.copy(ball).addScaledVector(this._t1.set(sideX(other(this.hand)), 0, 0), r + 0.012);
      const protect = this._t1.set(sideX(other(this.hand)) * 0.26, B.torsoPivot + B.shoulderHeight + 0.12, 0.34);
      ho.target.lerpVectors(onBall, protect, smoothstep(0.35, 0.65, u));
      ho.target.lerp(idle.set(sideX(other(this.hand)) * 0.24, 0.9, 0.1), relax);
      ho.aim.set(0, 1, 0.3).normalize(); ho.aimWeight = 0.5 * smoothstep(0.35, 0.65, u) * (1 - down);
      if (t >= total) this.done = true;
    }
    release() {
      const a = this.a;
      this.released = true;
      const p0 = a.localToWorld(new Vector3(), a.ballLocal);
      const target = this._t1.copy(this.rim).addScaledVector(UP, 0.02);
      const tf = clamp(0.28 + p0.distanceTo(target) * 0.22, 0.3, 0.9); // soft, high-percentage arc
      a.launchBall(p0, ballisticVelocity(new Vector3(), p0, target, tf, a.cfg.gravity), tf, 'shot', target.clone());
    }
  }

  // =====================================================================================================
  // The animator: runs one action, cross-fades between actions, damps the spine, solves both arms and
  // writes everything into the rig.
  // =====================================================================================================
  class BasketballAnimator {
    constructor(rig = {}, config = {}) {
      this.rig = rig || {};
      this.cfg = mergeDeep(DEFAULTS, config);
      const B = this.cfg.body;
      this.ik = {
        left: new TwoBoneIK(B.upperArm, B.foreArm + B.hand, { wrist: B.foreArm }),
        right: new TwoBoneIK(B.upperArm, B.foreArm + B.hand, { wrist: B.foreArm }),
      };
      this.rootPos = new Vector3(); this.rootYaw = 0; this.rootDriven = false;
      this.rootVel = new Vector3(); this._prevRoot = new Vector3(); this._hasPrevRoot = false;
      this.readRoot();
      this.ballLocal = new Vector3(0, B.torsoPivot - 0.03, 0.32); this.ballVelLocal = new Vector3(); // held at the chest
      this.ball = { position: new Vector3(), velocity: new Vector3(), quaternion: new Quaternion(), spin: new Vector3(), held: true, flight: null };
      this.controllers = { idle: new IdleController(this), dribble: new DribbleController(this), pass: new PassController(this), layup: new LayupController(this) };
      this.active = this.controllers.idle; this.active.start();
      this.pose = makePose();      // final pose after blending and damping
      this._raw = makePose(); this._from = makePose(); this._mix = makePose();
      this.blendT = 1; this.blendDur = 0; this.first = true; this.time = 0; this.blendAge = 0;
      // hand velocities (root space): a cross-fade starts from the motion on screen, not from a frozen pose
      this.handVel = { left: new Vector3(), right: new Vector3() }; this.fromVel = { left: new Vector3(), right: new Vector3() };
      this._prevHand = { left: new Vector3(), right: new Vector3() }; this._fromLive = makePose();
      this.torsoQ = new Quaternion(); this.headQ = new Quaternion();
      this.listeners = {};
      this._v1 = new Vector3(); this._v2 = new Vector3(); this._v3 = new Vector3(); this._q1 = new Quaternion(); this._q2 = new Quaternion();
      this._qa = new Quaternion(); this._qb = new Quaternion(); this._qc = new Quaternion(); this._qd = new Quaternion();
      this.lastGood = null;
      this.joints = {
        left: { shoulder: new Vector3(), elbow: new Vector3(), wrist: new Vector3(), palm: new Vector3() },
        right: { shoulder: new Vector3(), elbow: new Vector3(), wrist: new Vector3(), palm: new Vector3() },
      };
      this.update(0); // settle the arms on the first frame
    }

    // ------------------------------------------------------------------ events
    on(name, fn) { (this.listeners[name] = this.listeners[name] || []).push(fn); return this; }
    emit(name, data) { for (const fn of this.listeners[name] || []) { try { fn(data); } catch (e) { if (typeof console !== 'undefined') console.error(e); } } }

    // ------------------------------------------------------------------ actions
    /** Start dribbling (from any state; the ball is carried from where it is into the first bounce). */
    dribble(opts = {}) {
      if (!this.ball.held) return false;
      if (this.active === this.controllers.dribble) { if (opts.hand && opts.hand !== this.controllers.dribble.owner) this.crossover(); return true; }
      this.switchTo(this.controllers.dribble, opts);
      return true;
    }
    /** Cross the ball over to the other hand (queued until the next push if needed). */
    crossover() { return this.active === this.controllers.dribble ? (this.controllers.dribble.crossover(), true) : false; }
    /** Stop dribbling: the ball is picked up into both hands at the next catch. */
    stopDribble() { if (this.active === this.controllers.dribble) this.controllers.dribble.stop(); }
    /** Chest pass to a world position (the receiver's chest). */
    pass(targetWorld, opts = {}) {
      if (!this.ball.held || !isVec(targetWorld)) return false;
      this.switchTo(this.controllers.pass, targetWorld, opts);
      return true;
    }
    /** Layup at a rim (world position of the rim center). */
    layup(rimWorld, opts = {}) {
      if (!this.ball.held || !isVec(rimWorld)) return false;
      this.switchTo(this.controllers.layup, rimWorld, opts);
      return true;
    }
    /** Give the player the ball (e.g. after catching a pass): it is held at the chest, no snapping of the arms. */
    giveBall(worldPos) {
      this.ball.flight = null; this.ball.held = true;
      if (isVec(worldPos)) this.worldToLocal(this.ballLocal, worldPos);
      this.ballVelLocal.set(0, 0, 0);
      this.switchTo(this.controllers.idle); // cross-fade even from idle: the hands reach for the ball
    }
    idle() { this.switchTo(this.controllers.idle); }
    switchTo(ctl, ...args) {
      copyPose(this._from, this.pose);           // cross-fade from exactly what is on screen now ...
      for (const h of HANDS) this.fromVel[h].copy(this.handVel[h]); // ... including how fast the hands were moving
      this.blendT = 0; this.blendAge = 0; this.blendDur = Math.max(0.01, this.cfg.blendTime);
      if (this.active === this.controllers.layup && ctl !== this.controllers.layup) this.rootDriven = false;
      this.active = ctl;
      ctl.start(...args);
    }

    // ------------------------------------------------------------------ spaces
    readRoot() {
      const r = this.rig.root;
      if (r && r.position && !this.rootDriven) {
        this.rootPos.set(finite(r.position.x, 0), finite(r.position.y, 0), finite(r.position.z, 0));
        if (r.rotation) this.rootYaw = finite(r.rotation.y, 0);
      }
    }
    localToWorld(out, v) { return out.copy(v).rotateY(this.rootYaw).add(this.rootPos); }
    worldToLocal(out, v) { return out.copy(v).sub(this.rootPos).rotateY(-this.rootYaw); }
    /** Shoulder position in root space for a torso orientation and crouch. */
    shoulderLocal(out, hand, torsoQ, crouch) {
      const B = this.cfg.body;
      return out.set(sideX(hand) * B.shoulderHalfWidth, B.shoulderHeight, 0).applyQuaternion(torsoQ).add(this._v3.set(0, B.torsoPivot - (crouch || 0), 0));
    }

    // ------------------------------------------------------------------ ball
    launchBall(p0, v, flightTime, kind, target) {
      this.ball.held = false;
      this.ball.flight = { p0: p0.clone(), v: v.clone(), t: 0, T: flightTime, kind, target: target ? target.clone() : null };
      this.emit(kind === 'shot' ? 'shot' : 'release', { position: p0.clone(), velocity: v.clone(), flightTime, target });
    }
    updateBall(dt) {
      const b = this.ball, g = this.cfg.gravity;
      const prev = this._v1.copy(b.position);
      if (b.flight) {
        const f = b.flight;
        f.t = Math.min(f.T, f.t + dt);
        b.position.copy(f.p0).addScaledVector(f.v, f.t).addScaledVector(UP, -0.5 * g * f.t * f.t);
        if (f.t >= f.T) { b.flight = null; this.emit(f.kind === 'shot' ? 'shotArrived' : 'passArrived', { position: b.position.clone() }); }
      } else if (b.held) this.localToWorld(b.position, this.ballLocal);
      if (dt > 0) b.velocity.subVectors(b.position, prev).multiplyScalar(1 / dt);
      // spin: rolls with the horizontal motion (backspin on passes and shots), always integrated (no rotation pops)
      const target = this._v2.set(0, 0, 0);
      const hv = this._v3.set(b.velocity.x, 0, b.velocity.z);
      if (b.flight) target.crossVectors(hv, UP).multiplyScalar(0.9 / this.cfg.ballRadius);          // backspin
      else if (b.held && this.active === this.controllers.dribble) target.crossVectors(UP, hv).multiplyScalar(0.6 / this.cfg.ballRadius);
      b.spin.lerp(target, dampFactor(6, dt));
      const w = b.spin.length();
      if (w > 1e-4 && dt > 0) { this._q1.setFromAxisAngle(this._v2.copy(b.spin).multiplyScalar(1 / w), w * dt); b.quaternion.premultiply(this._q1).normalize(); }
    }

    // ------------------------------------------------------------------ frame
    update(dtIn) {
      const dt = clamp(finite(dtIn, 0), 0, 0.1); // a hitch never teleports anything
      this.time += dt;
      this.readRoot();
      // measured root velocity (world): lets a layup take off at the speed the character was already running
      if (this._hasPrevRoot && dt > 0) this.rootVel.lerp(this._v1.subVectors(this.rootPos, this._prevRoot).multiplyScalar(1 / dt), dampFactor(30, dt));
      this._prevRoot.copy(this.rootPos); this._hasPrevRoot = true;
      // 1. the active action
      const raw = this._raw;
      this.active.update(dt, raw);
      if (this.active.done) {
        const wasLayup = this.active === this.controllers.layup;
        const ev = this.active.name;
        this.switchTo(this.controllers.idle);
        if (wasLayup) this.rootDriven = false;
        this.emit(ev + 'Complete', {});
        this.active.update(0, raw);
      }
      // 2. cross-fade from the previous action (smoothstep: zero velocity change at both ends)
      this.blendT = Math.min(1, this.blendT + (this.blendDur > 0 ? dt / this.blendDur : 1));
      this.blendAge += dt;
      let target = raw;
      if (this.blendT < 1) {
        // the old pose keeps drifting with its hand velocity, which decays exponentially (C1 at the switch),
        // while a smoothstep weight hands control to the new action
        const k = 12, drift = (1 - Math.exp(-k * this.blendAge)) / k, F = copyPose(this._fromLive, this._from);
        for (const h of HANDS) F.hands[h].target.addScaledVector(this.fromVel[h], drift);
        target = blendPose(this._mix, F, raw, smoothstep(0, 1, this.blendT));
      }
      // 3. damp the spine and head (exponential, frame-rate independent); hands are already continuous
      const P = this.pose, C = this.cfg;
      if (this.first) { copyPose(P, target); this.first = false; }
      else {
        for (const h of HANDS) { P.hands[h].target.copy(target.hands[h].target); P.hands[h].aim.copy(target.hands[h].aim); P.hands[h].aimWeight = target.hands[h].aimWeight; }
        P.torsoYaw = dampAngle(P.torsoYaw, target.torsoYaw, C.torsoLambda, dt);
        P.torsoPitch = lerp(P.torsoPitch, target.torsoPitch, dampFactor(C.torsoLambda, dt));
        P.headYaw = dampAngle(P.headYaw, target.headYaw, C.headLambda, dt);
        P.headPitch = lerp(P.headPitch, target.headPitch, dampFactor(C.headLambda, dt));
        P.crouch = lerp(P.crouch, target.crouch, dampFactor(C.torsoLambda, dt));
      }
      this.sanitize(P);
      for (const h of HANDS) {
        if (dt > 0 && !this.first) this.handVel[h].subVectors(P.hands[h].target, this._prevHand[h]).multiplyScalar(1 / dt);
        if (!this.handVel[h].isFinite() || this.handVel[h].length() > 30) this.handVel[h].set(0, 0, 0);
        this._prevHand[h].copy(P.hands[h].target);
      }
      // 4. arms: shoulders from the torso, two-bone IK to each hand target
      this.torsoQ.setFromEulerYXZ(P.torsoPitch, P.torsoYaw, 0);
      const headYawRel = clamp(wrapAngle(P.headYaw - P.torsoYaw), -C.body.maxHeadYaw, C.body.maxHeadYaw);
      this.headQ.setFromEulerYXZ(P.headPitch, P.torsoYaw + headYawRel, 0); // absolute look; the local head rotation undoes the torso lean
      for (const h of HANDS) {
        const sh = this.shoulderLocal(this._v1, h, this.torsoQ, P.crouch);
        const pole = this._v2.set(sideX(h) * 0.55, -0.3, -0.78).applyQuaternion(this.torsoQ); // elbows out, down, back
        const sol = this.ik[h].solve(sh, P.hands[h].target, pole, dt, P.hands[h].aim, P.hands[h].aimWeight);
        const J = this.joints[h];
        J.shoulder.copy(sol.shoulder); J.elbow.copy(sol.elbow); J.wrist.copy(sol.wrist); J.palm.copy(sol.palm);
      }
      // 5. ball
      this.updateBall(dt);
      // 6. rig
      this.applyToRig();
      return this.getState();
    }
    /** Replace any non-finite value with the last good pose (never lets a NaN reach the rig). */
    sanitize(P) {
      let ok = Number.isFinite(P.torsoYaw) && Number.isFinite(P.torsoPitch) && Number.isFinite(P.headYaw) && Number.isFinite(P.headPitch) && Number.isFinite(P.crouch);
      for (const h of HANDS) ok = ok && P.hands[h].target.isFinite() && P.hands[h].aim.isFinite() && Number.isFinite(P.hands[h].aimWeight);
      if (ok) { this.lastGood = copyPose(this.lastGood || makePose(), P); return; }
      if (this.lastGood) copyPose(P, this.lastGood); else copyPose(P, makePose());
      if (!this._warned && typeof console !== 'undefined') { this._warned = true; console.warn('ProceduralBasketball: non-finite pose value replaced by the last good pose'); }
    }

    // ------------------------------------------------------------------ output
    applyToRig() {
      const rig = this.rig, C = this.cfg, R = C.boneRest || {};
      if (rig.root && this.rootDriven) { setPosition(rig.root, this.rootPos); if (rig.root.rotation) rig.root.rotation.y = this.rootYaw; }
      if (rig.pelvis && rig.pelvis.position) {
        if (this._pelvisY == null) this._pelvisY = finite(rig.pelvis.position.y, 0);
        rig.pelvis.position.y = this._pelvisY - this.pose.crouch;
      }
      const rigTorso = this._q1.copy(this.torsoQ); if (R.torso) rigTorso.multiply(R.torso);
      if (rig.torso) setRotation(rig.torso, rigTorso);
      if (rig.head) {
        const rigHead = this._q2.copy(this.headQ); if (R.head) rigHead.multiply(R.head);
        setRotation(rig.head, localRotation(this._qd, rigTorso, rigHead));
      }
      const arms = rig.arms || {};
      for (const h of HANDS) {
        const sol = this.ik[h].out, bones = arms[h];
        if (bones) {
          const up = this._qa.copy(sol.upperQ); if (R.upperArm) up.multiply(R.upperArm);
          const lo = this._qb.copy(sol.lowerQ); if (R.foreArm) lo.multiply(R.foreArm);
          const ha = this._qc.copy(sol.handQ); if (R.hand) ha.multiply(R.hand);
          if (C.hierarchy === 'flat') {
            if (bones.upper) { setPosition(bones.upper, sol.shoulder); setRotation(bones.upper, up); }
            if (bones.fore) { setPosition(bones.fore, sol.elbow); setRotation(bones.fore, lo); }
            if (bones.hand) { setPosition(bones.hand, sol.wrist); setRotation(bones.hand, ha); }
          } else {
            if (bones.upper) setRotation(bones.upper, localRotation(this._qd, rigTorso, up));
            if (bones.fore) setRotation(bones.fore, localRotation(this._qd, up, lo));
            if (bones.hand) setRotation(bones.hand, localRotation(this._qd, lo, ha));
          }
        }
        const it = rig.ikTargets;
        if (it) {
          if (it[h + 'Elbow']) setPosition(it[h + 'Elbow'], this.localToWorld(this._v1, sol.elbow));
          if (it[h + 'Hand']) setPosition(it[h + 'Hand'], this.localToWorld(this._v1, sol.palm));
        }
      }
      if (rig.ball) { setPosition(rig.ball, this.ball.position); setRotation(rig.ball, this.ball.quaternion); }
    }
    /** Everything computed this frame (joint positions in root space and world space, ball, action). */
    getState() {
      const w = h => ({
        shoulder: this.localToWorld(new Vector3(), this.joints[h].shoulder), elbow: this.localToWorld(new Vector3(), this.joints[h].elbow),
        wrist: this.localToWorld(new Vector3(), this.joints[h].wrist), palm: this.localToWorld(new Vector3(), this.joints[h].palm),
      });
      const d = this.controllers.dribble;
      return {
        action: this.active.name,
        phase: this.active === d ? d.phase : this.active.phase || null,
        dribbleHand: this.active === d ? d.owner : null,
        root: { position: this.rootPos.clone(), yaw: this.rootYaw },
        pose: copyPose(makePose(), this.pose),
        joints: { local: this.joints, world: { left: w('left'), right: w('right') } },
        ik: { left: this.ik.left.out, right: this.ik.right.out },
        ball: { position: this.ball.position.clone(), velocity: this.ball.velocity.clone(), quaternion: this.ball.quaternion.clone(), held: this.ball.held, inFlight: !!this.ball.flight },
      };
    }
  }

  // ------------------------------------------------------------------ rig helpers
  function isVec(v) { return v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z); }
  /** local = parentWorld^-1 * childWorld (both in root space). */
  function localRotation(out, parentQ, childQ) { return out.copy(parentQ).invert().multiply(childQ).normalize(); }
  function setPosition(obj, v) {
    if (!obj || !obj.position) return;
    if (typeof obj.position.set === 'function') obj.position.set(v.x, v.y, v.z); else { obj.position.x = v.x; obj.position.y = v.y; obj.position.z = v.z; }
  }
  const _eul = { x: 0, y: 0, z: 0 };
  function setRotation(obj, q) {
    if (!obj) return;
    if (obj.quaternion && typeof obj.quaternion.set === 'function') { obj.quaternion.set(q.x, q.y, q.z, q.w); return; } // Three.js keeps .rotation in sync
    if (!obj.rotation) return;
    q.toEulerYXZ(_eul);
    if ('order' in obj.rotation) obj.rotation.order = 'YXZ';
    obj.rotation.x = _eul.x; obj.rotation.y = _eul.y; obj.rotation.z = _eul.z;
  }

  return { Vector3, Quaternion, MathUtils, TwoBoneIK, BasketballAnimator, solveDribbleAir, DEFAULTS };
});
