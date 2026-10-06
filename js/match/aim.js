/* Pro BBALL Coach, match view: the shooter's aim at the rim (PBC.Match.Aim).
 * The engine has decided whether a shot goes in and how likely that was (ev.pm); the aim decides how it gets there: where
 * the ball's centre crosses the rim's plane (a depth along the shot's line, + long, and a lateral offset, + to the shooter's
 * left, inches from the middle of the ring) and the angle it comes down at (Tune.aim). A shot comes down in a scatter
 * around the shooter's own aim point:
 *  - their arc: each player has their own entry angle on a jump shot, a flat shooter ~40 deg, a high one ~51 (Noah
 *    Basketball's tracking: 45 the best), and it moves shot to shot, less for a pure shooter;
 *  - their habits: short or long, left or right; a flat shooter long, a high-arcing one short;
 *  - the hand in their face: the nearest defender's hand at the release makes the scatter wider, above all in depth, and
 *    the shot shorter and higher (tracking data: the depth's variance +56 %, the left-right's +38 %, shorter);
 *  - how they feel (the engine's confidence): a cold shooter short-arms it, a hot one lets it fly;
 * the scatter's size set so that the shot goes in exactly as often as the engine said it would (the better the shooter and
 * the look, the tighter it is), then the shot drawn from it given the result. So a pure shooter's makes are nearly all
 * clean and their misses near misses (in and out, a rattle); a poor or rushed shooter's makes come off the rim more and
 * their misses are bigger (off the glass, an air ball).
 * The geometry: a ball (4.7 in) coming down at the entry angle clears the ring (18 in inside, a 5/8 in tube) when its line
 * stays a ball's radius and the tube's off the ring all the way through; a flat shot has less room (at 45 deg the middle
 * 4.5 in of depth, at 35 deg 1.2 in). One that touches the ring goes in with odds falling off with how far its centre
 * crossed from the middle, later off the back of the ring than the front (Tune.aim.in50In); a long one can meet the glass
 * first; one that touches nothing and comes down outside the ring is an air ball.
 */
(function () {
  'use strict';
  const M = window.PBC.Match, U = M.U;
  // (inches) the ring's inner radius, its tube's, the ball's; the tube's centre line; a ball touching it; the glass behind
  // the rim's centre, its bottom edge against the rim's top
  const RIM = 9, TUBE = 0.3125, BALL = 4.7, RC = RIM + TUBE, REFF = BALL + TUBE, BOARD = 15, BOARD_BOT = -6;
  const JUMPERS = { jumper: 1, pullup: 1, stepback: 1, fadeaway: 1, catch_shoot: 1, heave: 1, ft: 1 };

  function erf(x) {
    // (Abramowitz and Stegun 7.1.26: good to 1.5e-7)
    const s = x < 0 ? -1 : 1; x = Math.abs(x);
    const t = 1 / (1 + 0.3275911 * x);
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return s * y;
  }
  const Phi = (x) => 0.5 * (1 + erf(x / Math.SQRT2));
  const gauss = () => { let u = 0; while (u === 0) u = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(U.TAU * Math.random()); };

  /**
   * the first thing a ball coming down on the line through (d, l) on the rim's plane at the angle th (rad) touches, in the
   * shot's frame (inches; kb, kl: the way to the glass along the shot and to its left): { what: 'ring' | 'board', t (in
   * along the line from the plane, - above it), x, y, z (the ball's centre then), phi (round the ring: 0 the back, pi the
   * front, + the left) } or null
   */
  function touch(d, l, th, kb, kl) {
    const c = Math.cos(th), s = Math.sin(th);
    // the glass: the line reaches its face (a ball's radius off it) while above its bottom edge
    // (moving along it, from the corner, it is there all the way down or not at all)
    let tb = Infinity;
    const kx = c * kb, f0 = d * kb + l * kl, need = BOARD - BALL;
    if (kx > 1e-6) { const t = (need - f0) / kx; if (-t * s > BOARD_BOT) tb = t; }
    else if (f0 >= need) tb = (TUBE - REFF) / s - 1;
    // the ring: stepped through the heights at which the ball can touch it
    const t0 = (TUBE - REFF) / s, t1 = (REFF + TUBE) / s;
    for (let t = t0; t <= t1 && t < tb; t += 0.2) {
      const x = d + t * c, z = -t * s, dr = Math.hypot(x, l) - RC, dz = z + TUBE;
      // (nr, nz: the way it is pushed off the tube, out from the ring's middle and up)
      if (dr * dr + dz * dz < REFF * REFF) { const n = Math.hypot(dr, dz) || 1; return { what: 'ring', t, x, y: l, z, phi: Math.atan2(l, x), nr: dr / n, nz: dz / n }; }
    }
    if (tb < Infinity) return { what: 'board', t: tb, x: d + tb * c, y: l, z: -tb * s, phi: 0 };
    return null;
  }
  /** how a ball crossing at (d, l) meets the rim: 'clean', a touch of the ring ('front', 'back', 'left', 'right'), 'board'
   *  (the glass first) or 'air' (nothing, outside the ring) */
  function kindOf(h, d, l) {
    if (!h) return Math.hypot(d, l) < RC ? 'clean' : 'air';
    if (h.what === 'board') return 'board';
    const cp = Math.cos(h.phi);
    return cp > 0.5 ? 'back' : cp < -0.5 ? 'front' : h.phi > 0 ? 'left' : 'right';
  }
  /** the odds a ball crossing at (d, l) goes in (see the header); h: its touch, if already found */
  function pIn(d, l, th, kb, kl, h) {
    if (h === undefined) h = touch(d, l, th, kb, kl);
    const r0 = Math.hypot(d, l);
    if (!h) return r0 < RC ? 1 : 0;
    if (h.what === 'board') return 0.04;
    const A = M.Tune.aim, cp = Math.cos(h.phi), I = A.in50In;
    const r50 = cp >= 0 ? I[1] + (I[0] - I[1]) * cp : I[1] + (I[1] - I[2]) * cp;
    return 1 / (1 + Math.exp((r0 - r50) / A.inSpreadIn));
  }

  // the odds of going in over a grid of crossings, 1 in apart (the scatter's size is solved against it)
  const GD = 26, GL = 20;
  function grid(th, kb, kl) {
    const nd = 2 * GD + 1, nl = 2 * GL + 1, P = new Float32Array(nd * nl);
    for (let i = 0; i < nd; i++) for (let j = 0; j < nl; j++) P[i * nl + j] = pIn(i - GD, j - GL, th, kb, kl);
    return { P, nd, nl };
  }
  /** the odds of going in for a scatter (depth mean muD and spread sd, left-right muL and sd * ratio) over the grid */
  function oddsFor(G, muD, muL, sd, ratio) {
    const wd = new Float64Array(G.nd), wl = new Float64Array(G.nl), sl = sd * ratio;
    for (let i = 0; i < G.nd; i++) { const x = i - GD - muD; wd[i] = Phi((x + 0.5) / sd) - Phi((x - 0.5) / sd); }
    for (let j = 0; j < G.nl; j++) { const x = j - GL - muL; wl[j] = Phi((x + 0.5) / sl) - Phi((x - 0.5) / sl); }
    let e = 0;
    for (let i = 0; i < G.nd; i++) { if (wd[i] < 1e-9) continue; let r = 0; const o = i * G.nl; for (let j = 0; j < G.nl; j++) r += G.P[o + j] * wl[j]; e += r * wd[i]; }
    return e;
  }
  /** the depth's spread (in) that makes the shot go in with odds p (the wider, the lower) */
  function spreadFor(G, muD, muL, ratio, p) {
    let lo = Math.log(0.35), hi = Math.log(24);
    for (let it = 0; it < 26; it++) {
      const m = 0.5 * (lo + hi);
      if (oddsFor(G, muD, muL, Math.exp(m), ratio) > p) lo = m; else hi = m;
    }
    return Math.exp(0.5 * (lo + hi));
  }

  /** a shooter's own aim, drawn once per player by hashes of their id (a.shotForm can give it: the lab's shooters) and
   *  shaped by their shooting: { arc (deg), depthBias, latBias (in), sk (0-1: how good a jump shooter) } */
  function shooter(a) {
    if (!a) return { arc: 45, depthBias: 0.3, latBias: 0, sk: 0.5, ft: 0.5, fin: 0.5 };
    if (a._aim) return a._aim;
    const A = M.Tune.aim, lk = a.look || {}, id = String(a.id);
    const h = (k) => U.hashStr(id + ':aim:' + k) / 4294967296;
    const num = (v, dflt) => (v != null && isFinite(+v) ? +v : dflt);
    const sk = U.clamp((num(lk.three, 50) * 0.6 + num(lk.mid, 50) * 0.4 - 30) / 60, 0, 1);
    const form = a.shotForm || null;
    let arc = A.arcDeg[0] + (A.arcDeg[1] - A.arcDeg[0]) * h('arc');
    arc += (A.arcGood - arc) * A.arcSkillPull * sk;
    if (form && form.arc != null) arc = form.arc;
    a._aim = {
      arc,
      depthBias: A.depthBiasIn[0] + (A.depthBiasIn[1] - A.depthBiasIn[0]) * h('depth') + A.flatLongIn * (45 - arc),
      latBias: (h('lat') * 2 - 1) * A.latBiasIn,
      sk, ft: U.clamp((num(lk.ft, 70) - 40) / 55, 0, 1), fin: U.clamp((num(lk.close, 60) * 0.5 + num(lk.layup, num(lk.close, 60)) * 0.5 - 30) / 60, 0, 1),
    };
    return a._aim;
  }

  // the engine's odds when an event has none (an old save, the lab): a rough NBA average by the shot
  function defaultPm(kind, dist) {
    if (kind === 'ft') return 0.77;
    if (kind === 'layup' || kind === 'reverse' || kind === 'tip' || kind === 'putback' || kind === 'alley' || kind === 'dunk') return 0.62;
    return dist > 22 ? 0.36 : dist > 14 ? 0.41 : 0.45;
  }

  /**
   * the aim of one shot. o: { a (the shooter), made, pm (the engine's odds), conf (the shooter's confidence), kind, fouled,
   *   p0 [x, y, z] (the ball at the release), rim {x, y}, side (+1 the basket on the right), hand (0-1: the hand in the
   *   face), want (a miss's touch asked for: 'front' | 'back' | 'left' | 'right' | 'board' | 'air'), hint (one leaned toward),
 *   carom {f, s} (a miss's
   *   rebound, ft from the rim along the shot and to its left), force {d, l, arc} (the lab: this crossing, this angle) }
   * returns { d, l (in), th (rad), deg, cat (kindOf), pIn, sdD, sdL, muD, muL, arc (the shooter's own, deg), seed, finish }
   */
  function plan(o) {
    const A = M.Tune.aim, kind = o.kind || 'jumper', S = shooter(o.a);
    const dx = o.rim.x - o.p0[0], dy = o.rim.y - o.p0[1], dist = Math.hypot(dx, dy) || 1, ux = dx / dist, uy = dy / dist;
    const side = o.side || 1, kb = ux * side, kl = -uy * side;
    const hand = U.clamp(o.hand || 0, 0, 1), conf = U.clamp(o.conf || 0, -1, 1);
    const jumper = !!JUMPERS[kind];
    // the angle it comes down at
    let deg, arcSd;
    if (jumper) {
      const sk = kind === 'ft' ? S.ft : S.sk;
      arcSd = A.arcSdDeg[1] + (A.arcSdDeg[0] - A.arcSdDeg[1]) * sk;
      deg = S.arc + gauss() * arcSd + hand * A.handArcDeg - Math.max(0, dist - 24) * A.arcDeepDeg + (kind === 'fadeaway' ? 1.5 : 0) + (kind === 'ft' ? 0.5 : 0);
    } else {
      const f = kind === 'floater' ? A.floaterDeg : kind === 'hook' ? A.hookDeg : kind === 'tip' ? A.tipDeg : A.layupDeg;
      arcSd = f[1];
      deg = f[0] + gauss() * f[1];
    }
    if (o.force && o.force.arc != null) deg = o.force.arc;
    deg = U.clamp(deg, 30, 74);
    const th = deg * U.DEG;
    // where it is aimed: the shooter's habits, the hand in the face, how they feel (a finish: a touch long, over the front)
    let muD, muL, ratio;
    if (jumper) {
      const sk = kind === 'ft' ? S.ft : S.sk;
      muD = S.depthBias - hand * A.handShortIn + (conf < 0 ? conf * A.confShortIn : conf * A.confLongIn);
      muL = S.latBias;
      ratio = (A.latRatio[1] + (A.latRatio[0] - A.latRatio[1]) * sk) * (1 + hand * (A.handLatSd / A.handDepthSd - 1));
    } else {
      muD = 0.6 - hand * A.handShortIn * 0.5; muL = 0; ratio = 0.8;
    }
    // the scatter's size: the engine's odds (half on a shot fouled as it went up)
    const pm = U.clamp((o.pm != null ? +o.pm : defaultPm(kind, dist)) * (o.fouled ? 0.5 : 1), 0.02, 0.995);
    const G = grid(th, kb, kl);
    const sdD = Math.min(spreadFor(G, muD, muL, ratio, pm), A.sdMaxIn[kind === 'ft' ? 1 : jumper ? 0 : 2]), sdL = sdD * ratio;
    // the shot, given the result: a miss off the side of the rim its rebound comes off (Director.planRebound chose that first)
    // (and the choreographer's leaning, o.hint: its side of the rim half as likely again); off the ring it can only go where
    // the ring lets it: across the ring from where it touched only if it touched on top of the tube (a front rim that pops up
    // and over), out past the tube from the inside likewise
    const fit = (k, h) => {
      if (o.want) return k === o.want ? 1 : 0;
      const c = o.carom, hk = (o.hint && k === o.hint ? 1.5 : 1) / 1.5;
      if (!c || o.made) return hk;
      if (h && h.what === 'ring') {
        // (up under the ring from below it, a short one clipping it: it can only fall away, never up to a rebounder's hands)
        if (h.nz < -0.2) return 0.02 * hk;
        const out = Math.cos(Math.atan2(c.s, c.f) - h.phi);
        if (out * h.nr < 0 && h.nz < 0.6) return 0.03 * hk;
      }
      if (k === 'front') return (c.f < 2 ? 1 : 0.6) * hk;
      if (k === 'back' || k === 'board') return (c.f < 1.5 ? 1 : 0.3) * hk;
      if (k === 'left') return (c.s > -2 ? 1 : 0.25) * hk;
      if (k === 'right') return (c.s < 2 ? 1 : 0.25) * hk;
      return hk;
    };
    let d = muD, l = muL, cat = null, p = 1, best = null;
    if (o.force && o.force.d != null) {
      d = o.force.d; l = o.force.l || 0;
      const h = touch(d, l, th, kb, kl); cat = kindOf(h, d, l); p = pIn(d, l, th, kb, kl, h);
    } else {
      for (let it = 0; it < 600; it++) {
        const dd = muD + gauss() * sdD, ll = muL + gauss() * sdL;
        const h = touch(dd, ll, th, kb, kl), k = kindOf(h, dd, ll), q = pIn(dd, ll, th, kb, kl, h);
        const w = (o.made ? q : 1 - q) * (o.made ? 1 : fit(k, h));
        if (w > 0 && (!best || w > best.w)) best = { d: dd, l: ll, cat: k, p: q, w };
        if (Math.random() < w) { d = dd; l = ll; cat = k; p = q; best = null; break; }
      }
      // (none taken in 600 draws, a miss asked off a touch its scatter hardly reaches: the likeliest seen; with none at all, a
      // crossing that makes that touch: down the middle for a make)
      if (best) { d = best.d; l = best.l; cat = best.cat; p = best.p; }
      else if (cat == null) {
        const k = o.made ? 'clean' : o.want || 'front';
        const FB = { clean: [0, 0], front: [-(RC + 1.5), 0], back: [RC - 2, 0], left: [0, RC - 2], right: [0, -(RC - 2)], board: [11 * kb, 11 * kl], air: [-(RC + REFF + 2), 0] };
        const fb = FB[k] || FB.front;
        d = fb[0]; l = fb[1];
        const h = touch(d, l, th, kb, kl); cat = kindOf(h, d, l); p = pIn(d, l, th, kb, kl, h);
      }
    }
    return { d, l, th, deg, cat, pIn: p, sdD, sdL, muD, muL, arc: S.arc, arcSd, pm, hand, conf, kb, kl, seed: Math.floor(Math.random() * 4294967296), finish: !jumper };
  }

  /** a small seeded generator (a shot's own randomness at the rim, the same however often it is planned) */
  function rng(seed) {
    let s = (seed >>> 0) || 1;
    return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  /** words for the aim (the debug view and the audits): "2.1 in long, 0.6 in left, 44 deg: in off the back rim" */
  function words(aim, made) {
    const f = (v, pos, neg) => (Math.abs(v) < 0.25 ? '' : Math.abs(v).toFixed(1) + ' in ' + (v > 0 ? pos : neg));
    const where = [f(aim.d, 'long', 'short'), f(aim.l, 'left', 'right')].filter(Boolean).join(', ') || 'dead centre';
    const CAT = made
      ? { clean: 'nothing but net', front: 'in off the front rim', back: 'in off the back rim', left: 'rolled in off the left of the rim', right: 'rolled in off the right of the rim', board: 'in off the glass', air: 'in' }
      : { clean: 'out', front: 'short, off the front rim', back: 'long, off the back rim', left: 'off the left of the rim', right: 'off the right of the rim', board: 'long, off the glass', air: 'an air ball' };
    return where + ' at ' + aim.deg.toFixed(0) + ' deg: ' + (aim.tail === 'inOut' ? 'in and out' : aim.tail === 'rattle' ? 'rattled out' : aim.tail === 'roll' && made ? 'rolled round the rim and in' : (CAT[aim.cat] || aim.cat));
  }

  M.Aim = { plan, touch, kindOf, pIn, grid, oddsFor, spreadFor, shooter, rng, words, defaultPm, RIM, TUBE, BALL, RC, REFF };
})();
