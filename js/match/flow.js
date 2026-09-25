/* Pro BBALL Coach — match view: half-court flow (extends PBC.Match.Director).
 * Between the engine's events the offense keeps working the way real half-court offense does:
 *  - off-ball players run actions instead of standing on spots: screens away (pin-downs / flares), basket and
 *    backdoor cuts with a teammate filling the vacated spot, lifts / drifts / "shake" relocations, weak-side
 *    exchanges, bigs flashing to the elbow or sealing at the dunker spot;
 *  - the ball handler probes (attack a gap and retreat, change direction with a crossover);
 *  - in long waits the ball is swung around the perimeter and back ("swing and return", reversals) so the
 *    passes the engine asks for come out of a moving offense;
 *  - how much of each depends on the team's offensive system (motion and Princeton move the ball and cut
 *    constantly; isolation and heliocentric offenses space the floor and let the star work).
 * Nothing here changes the engine's outcome: the ball is always back with the player the next event needs. */
(function () {
  'use strict';
  const M = window.PBC.Match, U = M.U;
  const D = M.Director;
  if (!D) return;
  const P = D.prototype;

  // per offensive system: swing = chance to swing the ball in a long enough wait; hops = passes per swing
  // chain; act = weights of the off-ball actions; rest = pause between a player's actions (s);
  // probe = how busy the handler is; busy = most players running an action at once.
  // (Motion / Princeton teams average ~4 passes per half-court trip in the NBA, isolation-heavy teams ~2.)
  const FLOW = {
    balanced: { swing: 0.45, hops: 2, act: { screen: 2.2, cut: 1.2, relocate: 4, exchange: 0.6, hold: 2.2 }, rest: [0.9, 2.0], probe: 0.55, busy: 2 },
    paceSpace: { swing: 0.5, hops: 2, act: { screen: 1, cut: 1.1, relocate: 5.5, exchange: 0.72, hold: 2 }, rest: [0.8, 1.8], probe: 0.65, busy: 2 },
    pnrHeavy: { swing: 0.3, hops: 1, act: { screen: 0.8, cut: 0.7, relocate: 4.5, exchange: 0.6, hold: 3 }, rest: [1.0, 2.2], probe: 0.75, busy: 2 },
    motion: { swing: 0.9, hops: 3, act: { screen: 3.6, cut: 2.2, relocate: 2.5, exchange: 1.08, hold: 0.8 }, rest: [0.5, 1.3], probe: 0.3, busy: 3 },
    iso: { swing: 0.1, hops: 1, act: { screen: 0.4, cut: 0.35, relocate: 3, exchange: 0.36, hold: 5 }, rest: [1.4, 2.8], probe: 0.95, busy: 1 },
    postUp: { swing: 0.5, hops: 2, act: { screen: 2.4, cut: 1.8, relocate: 2, exchange: 0.6, hold: 2.2 }, rest: [0.9, 1.8], probe: 0.4, busy: 2 },
    princeton: { swing: 0.85, hops: 3, act: { screen: 2.4, cut: 3.2, relocate: 1.5, exchange: 1.08, hold: 1 }, rest: [0.6, 1.4], probe: 0.3, busy: 3 },
    triangle: { swing: 0.7, hops: 2, act: { screen: 2.4, cut: 2.4, relocate: 1.6, exchange: 1.08, hold: 1.3 }, rest: [0.7, 1.5], probe: 0.4, busy: 2 },
    runGun: { swing: 0.45, hops: 2, act: { screen: 0.8, cut: 1.1, relocate: 5.5, exchange: 0.6, hold: 2 }, rest: [0.8, 1.6], probe: 0.65, busy: 2 },
    gritGrind: { swing: 0.5, hops: 2, act: { screen: 3, cut: 1.6, relocate: 1.5, exchange: 0.6, hold: 2.4 }, rest: [1.0, 2.0], probe: 0.45, busy: 2 },
    dribbleDrive: { swing: 0.3, hops: 1, act: { screen: 0.4, cut: 1.6, relocate: 5.5, exchange: 0.6, hold: 2 }, rest: [0.8, 1.7], probe: 0.9, busy: 2 },
    heliocentric: { swing: 0.12, hops: 1, act: { screen: 0.8, cut: 0.35, relocate: 3.5, exchange: 0.6, hold: 4 }, rest: [1.2, 2.6], probe: 0.95, busy: 1 },
  };
  // perimeter / interior spots in (u = feet from the attacked baseline, v = feet from the near sideline)
  // 5-out landmarks ~18-20 ft apart: corners, wings (45s), top, and slots as in-between options
  const PERIM = [[2.5, 3], [2.5, 47], [22, 6], [22, 44], [30, 25], [27.5, 14], [27.5, 36]];
  const PASS_CLIPS = { chest: 'passChest', overhead: 'passOverhead', bounce: 'passBounce' };
  const LIVE_BEATS = { pass: 1, set: 1, screen: 1, move: 1, handoff: 1, shot: 1, advance: 1 };

  P.flowProfile = function () { return FLOW[(this.poss && this.poss.offSystem) || 'balanced'] || FLOW.balanced; };
  P.uv = function (a) { return { u: this.U_(a.x), v: a.y }; };
  P.ptUV = function (u, v) { return { x: this.X(U.clamp(u, 1.5, 44)), y: U.clamp(v, 2, 48) }; };

  /** is the offense set up in the half court with a live ball in the handler's hands? */
  P.flowOK = function () {
    if (!this.active || this.frozen || this.phase !== 'front' || this.tempo === 'push') return false;
    const b = this.v.ball, h = b.holder;
    if (!h || h.team !== this.off) return false;
    if (this.U_(h.x) > 38) return false;
    const bt = this.beat;
    if (bt && !LIVE_BEATS[bt.type]) return false;
    return true;
  };
  /** players the next couple of engine events will need (kept close to where the planners expect them) */
  P.flowSoon = function () {
    if (this._soonAt === this.ei) return this._soon;
    const s = {};
    for (let i = Math.max(0, this.ei - 1); i < Math.min(this.events.length, this.ei + 2); i++) {
      const e = this.events[i];
      if (!e) continue;
      for (const k of ['from', 'to', 'shooter', 'screener', 'user', 'handler', 'player', 'target']) if (e[k] != null) s[e[k]] = 1;
    }
    this._soon = s; this._soonAt = this.ei;
    return s;
  };
  P.flowFree = function (a) {
    const r = this.role[a.id];
    return r && !a.isBusy() && r.mode !== 'locked' && !(r.until > this.T) && !r.path && this.v.ball.holder !== a && this.v.ball.passTarget !== a;
  };
  P.flowBusyCount = function () { let n = 0; for (const a of this.offActors()) { const r = this.role[a.id]; if (r && r.path) n++; } return n; };
  /** best open perimeter spot for `a` among candidates (u, v): away from teammates, not too far */
  P.openSpot = function (a, cands, o) {
    o = o || {};
    const me = this.uv(a);
    let best = null, bs = -1e9;
    const mates = this.offActors().filter((m) => m !== a).map((m) => { const r = this.role[m.id]; const s = r && r.path && r.pathSpot ? r.pathSpot : r && r.spot ? r.spot : m; return { u: this.U_(s.x), v: s.y }; });
    for (const c of cands) {
      const d = Math.hypot(c[0] - me.u, c[1] - me.v);
      if (d < (o.min || 6) || d > (o.max || 24)) continue;
      let sc = -Math.abs(d - (o.ideal || 13)) * 0.3;
      for (const m of mates) { const dm = Math.hypot(c[0] - m.u, c[1] - m.v); if (dm < 16) sc -= (16 - dm) * 1.4; }
      if (o.ballSide) { const b = this.v.ball; sc -= Math.abs(c[1] - b.y) * 0.08 * o.ballSide; }
      sc += Math.random() * 1.5;
      if (sc > bs) { bs = sc; best = c; }
    }
    return best;
  };
  P.setPath = function (a, path, spotUV, rest, kind) {
    const r = this.role[a.id];
    if (!r) return;
    r.path = path; r.pi = 0; r.pathT0 = this.T; r.pathKind = kind || 'move';
    r.pathSpot = spotUV ? this.ptUV(spotUV[0], spotUV[1]) : null;
    r.pathRest = rest;
  };
  P.endPath = function (a, r) {
    if (r.pathSpot) { r.spot = r.pathSpot; r.spotName = 'flow'; }
    r.path = null; r.pathSpot = null; r.jx = 0; r.jy = 0;
    const pr = this.flowProfile();
    r.next = this.T + (r.pathRest != null ? r.pathRest : U.lerp(pr.rest[0], pr.rest[1], Math.random()));
  };
  /** drive `a` along its action path; returns true while the path is in control */
  P.flowPath = function (a, r) {
    const b = this.v.ball;
    for (let guard = 0; guard < 4; guard++) {
      const wp = r.path && r.path[r.pi];
      if (!wp) { this.endPath(a, r); return false; }
      if (this.T - r.pathT0 > 9) { this.endPath(a, r); return false; } // never stuck in an action
      const face = wp.face === 'ball' ? { x: b.x, y: b.y } : wp.face || 'move';
      if (wp.wait != null && this.T < wp.wait) {
        a.moveTo(wp.wx != null ? wp.wx : a.x, wp.wy != null ? wp.wy : a.y, { speed: 5, face: { x: b.x, y: b.y }, stance: wp.wstance || 'ready' });
        a.lookAt({ x: b.x, y: b.y });
        return true;
      }
      const d = Math.hypot(wp.x - a.x, wp.y - a.y);
      if (d < (wp.tol || 1.1) || (wp.until != null && this.T > wp.until)) {
        if (wp.hold) {
          if (wp.holdUntil == null) { wp.holdUntil = this.T + wp.hold; if (wp.onArrive) U.safe(() => wp.onArrive(a), this, 'flow arrive'); }
          if (this.T < wp.holdUntil) {
            a.moveTo(wp.x, wp.y, { speed: 3, face: wp.hface ? (typeof wp.hface === 'function' ? wp.hface() : wp.hface) : { x: b.x, y: b.y }, stance: wp.stance || 'ready' });
            return true;
          }
        } else if (wp.onArrive) U.safe(() => wp.onArrive(a), this, 'flow arrive');
        r.pi++;
        continue;
      }
      a.moveTo(wp.x, wp.y, { speed: wp.speed || 12, face, stance: wp.stance || (wp.speed > 9 ? 'stand' : 'ready') });
      a.lookAt({ x: b.x, y: b.y });
      return true;
    }
    return true;
  };

  // ------------------------------------------------------------ off-ball actions
  P.flowOffBall = function (a, r) {
    const pr = this.flowProfile();
    const T = this.T;
    if (this.flowBusyCount() >= pr.busy) { r.next = T + 0.5 + Math.random() * 0.6; return this.offBallAction(a, r); }
    const soon = this.flowSoon()[a.id];
    const me = this.uv(a);
    const big = a.H > 6.75;
    const w = Object.assign({}, pr.act);
    if (soon) { w.screen *= 0.2; w.cut *= 0.25; w.exchange *= 0.3; } // keep him near where the next play wants him
    if (big) { w.screen *= 1.6; w.relocate *= 0.6; w.big = 2.2; } else { w.big = 0; }
    if (me.u < 9 && !big) w.cut *= 0.4; // already at the rim area
    const pick = U.pickKey ? U.pickKey(w) : pickKey(w);
    let ok = false;
    switch (pick) {
      case 'screen': ok = this.flowScreenAway(a); break;
      case 'cut': ok = this.flowCut(a); break;
      case 'relocate': ok = this.flowRelocate(a); break;
      case 'exchange': ok = this.flowExchange(a); break;
      case 'big': ok = this.flowBig(a); break;
      default: ok = false;
    }
    if (!ok) { this.offBallAction(a, r); r.next = T + U.lerp(pr.rest[0], pr.rest[1], Math.random()); }
    return ok;
  };
  function pickKey(w) {
    let s = 0; for (const k in w) s += Math.max(0, w[k]);
    let x = Math.random() * s;
    for (const k in w) { x -= Math.max(0, w[k]); if (x <= 0) return k; }
    return Object.keys(w)[0];
  }

  /** screen away: `a` walks over and sets a pin-down / flare for a teammate, who sets his man up and comes
   *  off it to an open spot; the screener then slips to the rim and replaces the user's spot */
  P.flowScreenAway = function (a) {
    const b = this.v.ball, T = this.T;
    const soon = this.flowSoon();
    const cands = this.offActors().filter((m) => m !== a && this.flowFree(m) && !soon[m.id]);
    if (!cands.length) return false;
    // screen away from the ball: prefer a teammate on the far side, 10-26 ft away
    let user = null, bs = -1e9;
    for (const m of cands) {
      const d = Math.hypot(m.x - a.x, m.y - a.y);
      if (d < 8 || d > 28) continue;
      const sc = -Math.abs(d - 15) * 0.3 + Math.hypot(m.x - b.x, m.y - b.y) * 0.08 + Math.random() * 2;
      if (sc > bs) { bs = sc; user = m; }
    }
    if (!user) return false;
    const mu = this.uv(user);
    const rimU = this.U_(this.rim.x);
    // screen on the user's defender, on the rim side: the screener's back to the basket
    const du = rimU - mu.u, dv = 25 - mu.v, dl = Math.hypot(du, dv) || 1;
    const S = { u: mu.u + du / dl * 3.2, v: mu.v + dv / dl * 3.2 };
    // the user comes off toward the ball / the top: open perimeter spot
    const E = this.openSpot(user, PERIM, { min: 7, max: 22, ideal: 12, ballSide: 1 }) || [Math.min(28, mu.u + 9), U.lerp(mu.v, b.y, 0.35)];
    const sPt = this.ptUV(S.u, S.v);
    const tArrive = T + Math.hypot(sPt.x - a.x, sPt.y - a.y) / 9 + 0.35;
    const faceUser = () => ({ x: user.x, y: user.y });
    const roll = this.ptUV(Math.max(6, rimU + 1.5), U.lerp(mu.v, 25, 0.6));
    this.setPath(a, [
      { x: sPt.x, y: sPt.y, speed: 9, stance: 'screen', face: 'move', hold: 1.1, hface: faceUser, tol: 1.2 },
      { x: roll.x, y: roll.y, speed: 10, tol: 2.5 },
      { x: this.X(mu.u), y: mu.v, speed: 8.5 },
    ], [mu.u, mu.v], null, 'screener');
    // user: set the defender up toward the baseline, then come hard off the screen (shoulder to shoulder)
    const setup = this.ptUV(mu.u - 2.2 * Math.sign(mu.u - rimU || 1), mu.v + (mu.v < 25 ? -1.2 : 1.2));
    const brush = { x: sPt.x + (this.X(E[0]) - sPt.x) * 0.12, y: sPt.y + (E[1] - sPt.y) * 0.12 };
    const ePt = this.ptUV(E[0], E[1]);
    this.setPath(user, [
      { x: setup.x, y: setup.y, speed: 7, wait: tArrive - 0.25, wx: setup.x, wy: setup.y, tol: 1.3 },
      { x: brush.x, y: brush.y, speed: 14, tol: 1.6 },
      { x: ePt.x, y: ePt.y, speed: 12.5, stance: 'ready', hold: 0.5, face: 'move' },
    ], E, null, 'offscreen');
    return true;
  };
  /** basket cut (or backdoor when denied), exit to the weak side; the nearest teammate fills the spot */
  P.flowCut = function (a) {
    const b = this.v.ball;
    const me = this.uv(a);
    const rimU = this.U_(this.rim.x);
    const dBall = Math.hypot(a.x - b.x, a.y - b.y);
    if (me.u < 8 || dBall > 34) return false;
    // exit: the far corner / dunker spot away from the ball
    const far = b.y < 25 ? 1 : -1;
    const exits = [[2.5, far > 0 ? 47 : 3], [3.5, far > 0 ? 36 : 14], [5, far > 0 ? 40 : 10]];
    const ex = this.openSpot(a, exits, { min: 6, max: 40, ideal: 20 }) || exits[0];
    const denied = (() => { const g = this.guardOf(a.id); if (!g) return false; return Math.hypot(g.x - b.x, g.y - b.y) < Math.hypot(a.x - b.x, a.y - b.y) - 1; })();
    // a jab step away (to sell it), then the cut at full speed right at the rim
    const away = this.ptUV(me.u + 2.5, me.v + (me.v < 25 ? -1 : 1));
    const rimPt = this.ptUV(rimU + 3.5, 25 + (me.v < 25 ? -2.5 : 2.5));
    const exPt = this.ptUV(ex[0], ex[1]);
    this.setPath(a, [
      { x: away.x, y: away.y, speed: denied ? 9 : 7, tol: 1.2 },
      { x: rimPt.x, y: rimPt.y, speed: 14, tol: 2.2 },
      { x: exPt.x, y: exPt.y, speed: 10.5 },
    ], ex, null, 'cut');
    // fill the vacated spot: the nearest free perimeter teammate rotates over
    const fill = this.offActors().filter((m) => m !== a && this.flowFree(m) && !this.flowSoon()[m.id])
      .sort((p, q) => Math.hypot(p.x - a.x, p.y - a.y) - Math.hypot(q.x - a.x, q.y - a.y))[0];
    if (fill && Math.hypot(fill.x - a.x, fill.y - a.y) < 24) {
      const pt = this.ptUV(me.u, me.v);
      this.setPath(fill, [{ x: fill.x, y: fill.y, wait: this.T + 0.5, speed: 3, tol: 0.1 }, { x: pt.x, y: pt.y, speed: 10, stance: 'ready', hold: 0.4 }], [me.u, me.v], null, 'fill');
    }
    return true;
  };
  /** relocate along the arc: lift from the corner, drift to the corner, slot to wing... with a jab to sell it */
  P.flowRelocate = function (a) {
    const me = this.uv(a);
    const spot = this.openSpot(a, PERIM, { min: 6, max: 18, ideal: 10 });
    if (!spot) return false;
    const du = spot[0] - me.u, dv = spot[1] - me.v, dl = Math.hypot(du, dv) || 1;
    const jab = this.ptUV(me.u - du / dl * 1.8, me.v - dv / dl * 1.8);
    const pt = this.ptUV(spot[0], spot[1]);
    this.setPath(a, [
      { x: jab.x, y: jab.y, speed: 8, tol: 0.9 },
      { x: pt.x, y: pt.y, speed: 10, stance: 'ready', hold: 0.3 },
    ], spot, null, 'relocate');
    return true;
  };
  /** weak-side exchange: two players swap spots, one going low as the other comes high */
  P.flowExchange = function (a) {
    const b = this.v.ball;
    const me = this.uv(a);
    const mate = this.offActors().filter((m) => m !== a && this.flowFree(m) && !this.flowSoon()[m.id] && Math.hypot(m.x - a.x, m.y - a.y) > 9 && Math.hypot(m.x - a.x, m.y - a.y) < 24)
      .sort((p, q) => Math.hypot(q.x - b.x, q.y - b.y) - Math.hypot(p.x - b.x, p.y - b.y))[0];
    if (!mate) return false;
    const mu = this.uv(mate);
    const midU = (me.u + mu.u) / 2, midV = (me.v + mu.v) / 2;
    // the lower player crosses underneath (closer to the rim), the higher one over the top
    const low = me.u < mu.u ? a : mate;
    const lo = low === a ? me : mu, hi = low === a ? mu : me;
    const hiA = low === a ? mate : a;
    const under = this.ptUV(midU - 3, midV), over = this.ptUV(midU + 3, midV);
    const pHi = this.ptUV(hi.u, hi.v), pLo = this.ptUV(lo.u, lo.v);
    this.setPath(low, [{ x: under.x, y: under.y, speed: 10, tol: 2 }, { x: pHi.x, y: pHi.y, speed: 10, stance: 'ready', hold: 0.3 }], [hi.u, hi.v], null, 'exchange');
    this.setPath(hiA, [{ x: over.x, y: over.y, speed: 9.5, tol: 2 }, { x: pLo.x, y: pLo.y, speed: 9.5, stance: 'ready', hold: 0.3 }], [lo.u, lo.v], null, 'exchange');
    return true;
  };
  /** bigs: flash to the elbow / high post when the ball is on the wing, or seal at the dunker spot */
  P.flowBig = function (a) {
    const b = this.v.ball;
    const bu = this.U_(b.x);
    const me = this.uv(a);
    const side = b.y < 25 ? -1 : 1;
    let spot;
    if (bu < 26 && Math.random() < 0.55) spot = [19, 25 + side * 7.5]; // ball-side elbow
    else if (Math.random() < 0.5) spot = [3.5, 25 - side * 10.5]; // weak-side dunker spot
    else spot = [6, 25 + side * 9.5]; // ball-side block / short corner
    if (Math.hypot(spot[0] - me.u, spot[1] - me.v) < 4) return false;
    const pt = this.ptUV(spot[0], spot[1]);
    this.setPath(a, [{ x: pt.x, y: pt.y, speed: 10, stance: spot[0] < 8 ? 'postUp' : 'ready', hold: 1.0 }], spot, null, 'big');
    return true;
  };

  /** the handler drives: corner on the drive side lifts, weak-side wing drifts to the corner */
  P.flowDriveReact = function () {
    const b = this.v.ball, h = b.holder, T = this.T;
    if (!h || h.team !== this.off || T < (this._driveReactT || 0)) return;
    const toRim = Math.atan2(this.rim.y - h.y, this.rim.x - h.x);
    const vr = h.vx * Math.cos(toRim) + h.vy * Math.sin(toRim);
    if (vr < 9 || this.U_(h.x) > 30) return;
    this._driveReactT = T + 2.5;
    const hv = h.y;
    for (const a of this.offActors()) {
      if (a === h || !this.flowFree(a)) continue;
      const me = this.uv(a);
      const sameSide = (me.v < 25) === (hv < 25);
      let spot = null;
      if (me.u < 6 && me.v < 10 || me.u < 6 && me.v > 40) spot = sameSide ? [14, me.v < 25 ? 5 : 45] : null; // corner: lift if the drive comes his way
      else if (me.u > 15 && me.u < 24 && !sameSide) spot = [3, me.v < 25 ? 3 : 47]; // weak wing: drift to the corner
      else if (me.u > 24) spot = [me.u - 2, U.lerp(me.v, 25 + (hv < 25 ? 10 : -10), 0.5)]; // top: slide to the open slot
      if (!spot) continue;
      const pt = this.ptUV(spot[0], spot[1]);
      this.setPath(a, [{ x: pt.x, y: pt.y, speed: 11, stance: 'ready', hold: 0.6 }], spot, 0.8, 'driveReact');
    }
  };

  // ------------------------------------------------------------ handler probing
  P.flowHandler = function (a, r) {
    const b = this.v.ball, T = this.T;
    const pr = this.flowProfile();
    if (!r.probe || T > r.probe.end) {
      r.probe = null;
      if (T < (r.probeNext || 0)) return false;
      if (Math.random() > pr.probe) { r.probeNext = T + 1 + Math.random(); return false; }
      // around his shot spot when a shot is coming, else around where he is
      const me = r.probeAnchor ? { u: this.U_(r.probeAnchor.x), v: r.probeAnchor.y } : this.uv(a);
      const rimU = this.U_(this.rim.x);
      const kind = Math.random();
      if (kind < 0.55 && me.u > 16) {
        // attack a gap two or three dribbles, then retreat dribble back out
        const du = rimU - me.u, dv = 25 - me.v, dl = Math.hypot(du, dv) || 1;
        const side = (Math.random() - 0.5) * 8;
        const go = r.probeAnchor ? 3 + Math.random() * 3 : 5 + Math.random() * 4;
        const inPt = this.ptUV(me.u + du / dl * go, me.v + dv / dl * go + side);
        const outPt = this.ptUV(me.u + du / dl * (go - 5), me.v + dv / dl * (go - 5) + side * 0.5);
        r.probe = { pts: [[inPt, 11, 'move'], [outPt, 6.5, 'rim']], i: 0, end: T + 3.4, cross: Math.random() < 0.6 };
      } else {
        // change sides along the arc with a crossover
        const sw = r.probeAnchor ? 3 + Math.random() * 3 : 7 + Math.random() * 5;
        const tv = me.v < 25 ? me.v + sw : me.v - sw;
        const pt = this.ptUV(Math.max(22, me.u + (Math.random() - 0.5) * 4), tv);
        r.probe = { pts: [[pt, 8.5, 'rim']], i: 0, end: T + 2.6, cross: true };
      }
    }
    const pb = r.probe;
    const cur = pb.pts[pb.i];
    if (!cur) { r.probe = null; r.probeNext = T + U.lerp(pr.rest[0], pr.rest[1], Math.random()); return false; }
    const [pt, sp, face] = cur;
    if (Math.hypot(pt.x - a.x, pt.y - a.y) < 1.2) {
      pb.i++;
      if (pb.cross && b.holder === a && b.state === 'dribble' && b.dr && !b.dr.move && !b.dr.pendingMove) b.dribbleMove('cross');
      return true;
    }
    a.moveTo(pt.x, pt.y, { speed: sp, face: face === 'rim' ? this.rim : 'move', stance: 'dribble' });
    if (b.state === 'held' && b.holder === a) b.dribble(a);
    a.lookAt(null);
    return true;
  };

  // ------------------------------------------------------------ ball movement (cosmetic swings)
  /** who must hold the ball when the current beat's key moment comes, and by when */
  P.flowBallNeed = function () {
    const bt = this.beat;
    if (!bt || bt.fired) return null;
    const ev = bt.ev;
    if (bt.type === 'pass') return { id: ev.from, by: bt.fireAt - 0.8, avoid: [ev.to] };
    // an off-ball screen: the handler waits for the cutter anyway, so the ball can move around meanwhile
    if (bt.type === 'screen' && ev.kind === 'off_ball') {
      const nx = this.events[this.ei];
      const h = this.v.ball.holder;
      if (h && nx && nx.type === 'pass' && nx.from === h.id) return { id: h.id, by: bt.fireAt + 0.2, avoid: [ev.screener, ev.user, nx.to] };
    }
    return null;
  };
  P.flowBall = function () {
    const T = this.T, b = this.v.ball;
    if (this.swing) { this.swingUpdate(); return; }
    if (T < (this._swingCheck || 0)) return;
    this._swingCheck = T + 0.4;
    if (!this.flowOK()) return;
    const need = this.flowBallNeed();
    if (!need) return;
    const h = b.holder;
    if (!h || h.id !== need.id || b.state === 'flight' || h.isBusy()) return;
    const left = need.by - T;
    if (left < 2.3) return;
    const pr = this.flowProfile();
    if (Math.random() > pr.swing * (left > 5 ? 1.25 : 1)) { this._swingCheck = T + 1.4; return; }
    const partner = this.swingPartner(h, need.avoid);
    if (!partner) return;
    this.startSwing(h, partner, need.by);
  };
  P.swingPartner = function (h, avoid) {
    const soon = this.flowSoon();
    let best = null, bs = -1e9;
    for (const m of this.offActors()) {
      if (m === h || (avoid && avoid.indexOf(m.id) >= 0) || m.isBusy()) continue;
      const r = this.role[m.id];
      if (!r || r.until > this.T) continue;
      const d = Math.hypot(m.x - h.x, m.y - h.y);
      if (d < 9 || d > 30) continue;
      const mu = this.U_(m.x);
      if (mu < 12) continue; // swing to the perimeter, not into the paint
      const g = this.guardOf(m.id);
      const open = g ? Math.min(8, Math.hypot(g.x - m.x, g.y - m.y)) : 8;
      const sc = open * 0.8 - Math.abs(d - 16) * 0.2 + (soon[m.id] ? -3 : 0) + (r.path ? -1.5 : 0) + Math.random() * 2;
      if (sc > bs) { bs = sc; best = m; }
    }
    return best;
  };
  P.startSwing = function (h, z, by) {
    const pr = this.flowProfile();
    const hops = [];
    // windup + flight + a quick look (the "0.5-second rule": catch, decide, move it)
    const tHop = (a, c) => 0.28 + U.clamp(Math.hypot(a.x - c.x, a.y - c.y) / 37, 0.3, 0.85) + 0.45;
    let t = tHop(h, z) + tHop(z, h);
    // a longer chain (reversal around the horn) when there is time and the system likes to move it
    let w = null;
    if (pr.hops >= 3 && by - this.T > t + 2.6) {
      w = this.swingPartner(z, [h.id]);
      if (w && Math.hypot(w.x - h.x, w.y - h.y) < 30 && w !== h) t += tHop(z, w) + tHop(w, h) - tHop(z, h);
      else w = null;
    }
    if (by - this.T < t + 0.25) return;
    const chain = w ? [h, z, w, h] : [h, z, h];
    this.swing = { chain, i: 0, by, holdUntil: 0, state: 'pass', owner: h };
    for (const a of chain) { const r = this.role[a.id]; if (r) { r.path = null; } }
    this.swingPass();
  };
  P.swingPass = function () {
    const sw = this.swing, b = this.v.ball, T = this.T;
    const from = sw.chain[sw.i], to = sw.chain[sw.i + 1];
    if (!from || !to || b.holder !== from || from.isBusy()) { this.swingAbort(); return; }
    const d = Math.hypot(to.x - from.x, to.y - from.y);
    const kind = d > 22 && Math.random() < 0.5 ? 'overhead' : Math.random() < 0.18 ? 'bounce' : 'chest';
    const clip = M.Anims.get(PASS_CLIPS[kind]);
    const windup = clip ? clip.events.release : 0.26;
    const flight = U.clamp(d / (kind === 'bounce' ? 30 : 37), 0.3, 0.9);
    const rf = this.role[from.id], rt = this.role[to.id];
    if (rf) rf.until = T + windup + 0.5;
    if (rt) { rt.until = T + windup + flight + 0.6; rt.path = null; }
    // receiver steps to meet the pass, showing a target
    const toward = { x: to.x + (from.x - to.x) / (d || 1) * 1.5, y: to.y + (from.y - to.y) / (d || 1) * 1.5 };
    to.moveTo(toward.x, toward.y, { speed: 6, face: { x: from.x, y: from.y }, stance: 'ready' });
    if (b.state === 'dribble') b.give(from, 'chest');
    from.setFace({ x: to.x, y: to.y });
    from.moveTo(from.x, from.y, { speed: 3 });
    from.play(PASS_CLIPS[kind], { speed: 1 });
    sw.state = 'windup';
    this.at(T + windup, () => {
      if (this.swing !== sw) return;
      if (b.holder !== from) { this.swingAbort(); return; }
      sw.state = 'flight';
      this.passBall(from, to, kind, flight, () => {
        if (this.swing !== sw) return;
        sw.i++;
        sw.state = 'hold';
        // the catcher squares up (triple threat), looks, then moves it on
        to.ballHold = 'triple';
        to.setFace(this.rim);
        sw.holdUntil = this.T + 0.25 + Math.random() * (this.flowProfile().hops >= 3 ? 0.3 : 0.5);
        const r2 = this.role[to.id]; if (r2) r2.until = sw.holdUntil + 0.4;
        // the passer relocates: pass and replace (a v-cut back out) to get it back
        if (sw.i < sw.chain.length - 1) this.passerRelocate(from, sw);
      });
      from.setFace('move');
    }, 'swing pass');
  };
  P.passerRelocate = function (a, sw) {
    const r = this.role[a.id];
    if (!r) return;
    const me = this.uv(a);
    const rimU = this.U_(this.rim.x);
    const du = rimU - me.u, dv = 25 - me.v, dl = Math.hypot(du, dv) || 1;
    const k = me.u > 12 ? 4.5 : -3;
    const inPt = this.ptUV(me.u + du / dl * k, me.v + dv / dl * k);
    const outPt = this.ptUV(me.u + (Math.random() - 0.5) * 3, me.v + (Math.random() - 0.5) * 4);
    r.until = 0;
    this.setPath(a, [{ x: inPt.x, y: inPt.y, speed: 11, tol: 1.4 }, { x: outPt.x, y: outPt.y, speed: 13, stance: 'ready', hold: 3, face: 'move' }], [this.U_(outPt.x), outPt.y], 0.3, 'passReloc');
  };
  P.swingUpdate = function () {
    const sw = this.swing, b = this.v.ball, T = this.T;
    if (!sw) return;
    const bt = this.beat;
    if (!bt || bt.fired || !this.flowOK()) {
      // the play moved on: make sure the ball ends up where it has to be
      if (sw.state === 'hold') this.swingAbort(true); else this.swingAbort();
      return;
    }
    if (sw.state !== 'hold') return;
    if (sw.i >= sw.chain.length - 1) { this.swingEnd(); return; }
    const holder = sw.chain[sw.i];
    if (b.holder !== holder) { this.swingAbort(); return; }
    // time's nearly up: skip ahead to the last pass (back to the player the engine needs)
    const lastLeg = T > sw.by - 1.6;
    if (lastLeg && sw.i < sw.chain.length - 2) sw.chain.splice(sw.i + 1, sw.chain.length - sw.i - 2);
    if (T >= sw.holdUntil || lastLeg) this.swingPass();
  };
  P.swingEnd = function () {
    const sw = this.swing;
    this.swing = null;
    if (!sw) return;
    const h = sw.chain[sw.chain.length - 1];
    const r = this.role[h.id];
    if (r) { r.path = null; r.until = 0; }
    const b = this.v.ball;
    if (b.holder === h) { h.ballHold = 'chest'; }
  };
  P.swingAbort = function (returnBall) {
    const sw = this.swing;
    this.swing = null;
    if (!sw) return;
    const b = this.v.ball;
    const owner = sw.owner;
    if (returnBall && owner && b.holder && b.holder !== owner && b.holder.team === this.off && b.state !== 'flight') {
      const d = Math.hypot(owner.x - b.holder.x, owner.y - b.holder.y);
      this.passBall(b.holder, owner, 'chest', U.clamp(d / 38, 0.25, 0.8), null);
    }
  };
})();
