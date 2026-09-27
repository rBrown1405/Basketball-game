/* Pro BBALL Coach — match view: half-court spacing and off-ball jobs (extends PBC.Match.Director, after flow.js).
 * Built on the Director's formations (choreo.js) and the half-court flow's actions (flow.js):
 *  - perimeter spots a step behind the three-point line (NBA spacing landmarks: corner, wing, slot, top ~1.5 ft
 *    behind the line), not on it or inside it where a catch is a long two;
 *  - every off-ball player has a job: spacing a spot beyond the arc, running an action, or moving for the next
 *    play; a player left holding a mid-range spot with nothing to do goes to the nearest open spot behind the line;
 *  - non-stretch bigs live inside (the dunker spot, the short corner, the block, the elbow to screen); a formation
 *    that hands one a perimeter spot gives him the nearest open big's spot instead; stretch bigs space like wings,
 *    and a non-shooting guard or wing can live at the dunker spot;
 *  - the small moves between actions (lifts, drifts, shuffles) keep a shooter behind the line; a v-cut still dips in
 *    and comes back out.
 * Research notes and sources: docs/GAMEPLAY_AI_PLAN.md ("Research behind Phase 2"). */
(function () {
  'use strict';
  const M = window.PBC.Match, U = M.U;
  const Dir = M.Director;
  if (!Dir) return;
  const P = Dir.prototype;
  const base = { spotTable: P.spotTable, assignSpots: P.assignSpots, offBallAction: P.offBallAction, ambient: P.ambient };
  const PERIM_NAMES = { top: 1, topL: 1, topR: 1, slotN: 1, slotF: 1, wingN: 1, wingF: 1, cornerN: 1, cornerF: 1 };
  const INSIDE_NAMES = { dunkerN: 1, dunkerF: 1, shortN: 1, shortF: 1, blockN: 1, blockF: 1 };
  const DEG = Math.PI / 180;

  P.threeLine = function () { const c = this.v.court; return (c && c.three) || { arc: 23.75, corner: 22 }; };
  /** (u, v) of a spot on a ray from the rim at `deg` (0 = straight out, negative = the near sideline side), `behind`
   *  feet behind the three-point line */
  P.arcSpot = function (deg, behind) {
    const r = this.threeLine().arc + behind;
    return [5.25 + Math.cos(deg * DEG) * r, 25 + Math.sin(deg * DEG) * r];
  };
  P.beyondArc = function (u, v, margin) {
    const t = this.threeLine(), mg = margin || 0;
    return u < 14 ? Math.abs(v - 25) >= t.corner + mg : Math.hypot(u - 5.25, v - 25) >= t.arc + mg;
  };
  /** a non-stretch big: a C or PF who is not a shooter (he lives inside) */
  P.insideBig = function (a) {
    const l = this.v.look(a.id) || {};
    if (l.pos !== 'C' && l.pos !== 'PF') return false;
    return !(/Stretch/.test(l.arch || '') || this.rating(a.id, 'three', 50) >= 66);
  };
  /** a player who spaces the floor from behind the line (everyone but inside bigs and non-shooters) */
  P.spacer = function (a) { return !this.insideBig(a) && this.rating(a.id, 'three', 60) >= 45; };

  // ------------------------------------------------------------ spots
  P.spotTable = function () {
    const t = base.spotTable.call(this);
    const c = this.threeLine().corner;
    const s = (deg) => this.arcSpot(deg, 1.5);
    t.cornerN = [2.5, 25 - (c + 1)]; t.cornerF = [2.5, 25 + (c + 1)];
    t.wingN = s(-45.4); t.wingF = s(45.4);
    t.slotN = s(-23.3); t.slotF = s(23.3);
    t.top = s(0); t.topL = s(-12); t.topR = s(12);
    t.dunkerN = [3, 14]; t.dunkerF = [3, 36]; t.shortN = [4, 10]; t.shortF = [4, 40];
    t.blockN = [7.5, 16]; t.blockF = [7.5, 34]; t.elbowN = [19, 17]; t.elbowF = [19, 33]; t.high = [19, 25];
    return t;
  };
  P.perimSpots = function () {
    const c = this.threeLine().corner, s = (deg) => this.arcSpot(deg, 1.5);
    return [[2.5, 25 - (c + 1)], [2.5, 25 + (c + 1)], s(-45.4), s(45.4), s(0), s(-23.3), s(23.3)];
  };
  /** after the Director's formation: inside bigs take inside spots, spacers take perimeter spots */
  P.assignSpots = function (kind, ev) {
    base.assignSpots.call(this, kind, ev);
    const offs = this.offActors();
    const handler = this.v.ball.holder;
    const used = {};
    for (const a of offs) { const r = this.role[a.id]; if (r && r.spotName) used[r.spotName] = a; }
    const free = (names) => names.find((n) => !used[n]);
    const ballSide = (this.v.ball.y < 25) ? 'N' : 'F';
    for (const a of offs) {
      if (a === handler) continue;
      const r = this.role[a.id];
      if (!r || !r.spotName) continue;
      if (this.insideBig(a) && PERIM_NAMES[r.spotName]) {
        // (the weak side's dunker spot first: it pulls the low man away from the drive)
        const weak = ballSide === 'N' ? 'F' : 'N';
        const n = free(['dunker' + weak, 'short' + weak, 'dunker' + ballSide, 'block' + weak, 'short' + ballSide, 'block' + ballSide]);
        if (n) { delete used[r.spotName]; r.spotName = n; r.spot = this.spotPt(n); used[n] = a; }
      } else if (this.spacer(a) && INSIDE_NAMES[r.spotName] && !(kind === 'post' && r.spotName.indexOf('block') === 0)) {
        const n = free(['corner' + (ballSide === 'N' ? 'F' : 'N'), 'wingF', 'wingN', 'corner' + ballSide, 'slotF', 'slotN']);
        if (n) { delete used[r.spotName]; r.spotName = n; r.spot = this.spotPt(n); used[n] = a; }
      }
    }
  };

  // ------------------------------------------------------------ jobs
  /** the nearest open spot for `a`: behind the line for a spacer, a big's spot for an inside big */
  P.jobSpot = function (a) {
    const me = this.uv(a), h = this.v.ball.holder;
    const mates = this.offActors().filter((m) => m !== a).map((m) => { const r = this.role[m.id]; const s = m === h ? m : r && r.path && r.pathSpot ? r.pathSpot : r && r.spot ? r.spot : m; return { u: this.U_(s.x), v: s.y }; });
    const cands = this.insideBig(a) ? [[3, 14], [3, 36], [4, 10], [4, 40], [7.5, 16], [7.5, 34]] : this.spacer(a) ? this.perimSpots() : [[3, 14], [3, 36], [2.5, 25 - (this.threeLine().corner + 1)], [2.5, 25 + (this.threeLine().corner + 1)]];
    let best = null, bs = -Infinity;
    for (const c of cands) {
      let sc = -Math.hypot(c[0] - me.u, c[1] - me.v) * 0.35;
      for (const m of mates) { const dm = Math.hypot(c[0] - m.u, c[1] - m.v); if (dm < 12) sc -= (12 - dm) * 2; }
      if (sc > bs) { bs = sc; best = c; }
    }
    return best;
  };
  /** a free off-ball player holding a spot that is no job (a mid-range spot, or a spacer inside) for more than a
   *  second moves to the nearest open spot where he spaces the floor */
  P.ambient = function (dt) {
    if (this.active && this.phase === 'front' && this.tempo !== 'push' && !this.frozen) {
      const b = this.v.ball, T = this.T;
      for (const a of this.offActors()) {
        const r = this.role[a.id];
        if (!r || !r.spot || b.holder === a || a.isBusy() || r.path || r.mode === 'locked' || r.until > T) { if (r) r.noJobT = 0; continue; }
        const su = this.U_(r.spot.x), sv = r.spot.y;
        const inside = su < 10 && Math.abs(sv - 25) < 22 || this.inPaint(r.spot, 0);
        const beyond = this.beyondArc(su, sv, 0.5);
        const big = this.insideBig(a), sp = this.spacer(a);
        const elbowOrHigh = su > 15 && su < 22 && Math.abs(sv - 25) < 9;
        let ok = beyond ? !big : inside ? !sp || /block/.test(r.spotName || '') : big && elbowOrHigh;
        // (the handler has come into his spot: a spacer slides to the next open spot along the arc instead of being
        // pushed off it toward the paint)
        const hh = b.holder;
        if (ok && beyond && hh && hh !== a && hh.team === this.off && Math.hypot(hh.x - r.spot.x, hh.y - r.spot.y) < 11) ok = false;
        if (ok) { r.noJobT = 0; continue; }
        r.noJobT = (r.noJobT || 0) + dt;
        if (r.noJobT < 1.0) continue;
        r.noJobT = 0;
        const s = this.jobSpot(a);
        if (s) { r.spot = this.ptUV(s[0], s[1]); r.spotName = 'job'; r.jx = 0; r.jy = 0; r.phase = null; r.next = T + 0.8; }
      }
    }
    return base.ambient.call(this, dt);
  };
  /** the small moves between actions: a spacer's lift, drift or shuffle stays behind the line (a v-cut dips in and
   *  comes back out) */
  P.offBallAction = function (a, r) {
    base.offBallAction.call(this, a, r);
    if (!r || !r.spot || r.phase === 'out' || !this.spacer(a)) return;
    const su = this.U_(r.spot.x), sv = r.spot.y;
    if (!this.beyondArc(su, sv, 0.5)) return;
    let tu = this.U_(r.spot.x + r.jx), tv = r.spot.y + r.jy;
    if (this.beyondArc(tu, tv, 0.8)) return;
    const t = this.threeLine();
    if (tu < 14) tv = 25 + Math.sign(tv - 25 || sv - 25 || 1) * (t.corner + 1);
    else { const du = tu - 5.25, dv = tv - 25, dl = Math.hypot(du, dv) || 1, R = t.arc + 1.2; tu = 5.25 + du / dl * R; tv = 25 + dv / dl * R; }
    r.jx = this.X(tu) - r.spot.x; r.jy = tv - r.spot.y;
  };
})();
