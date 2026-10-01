/* Pro BBALL Coach — match view: half-court man-to-man defense (extends PBC.Match.Director, like flow.js).
 * Built on the Director's own defense (choreo.js), which still runs zones, presses, transition and every planner
 * (screens, drives, traps, contests); in the half court a man-to-man defender now plays the way coaches teach it and
 * NBA tracking measures it (research and sources: docs/GAMEPLAY_AI_PLAN.md, "Research behind Phase 2"):
 *  - one set of matchups with the engine: the possession carries the engine's pairing, so the defender the engine
 *    credits with a contest, a block or a foul is the one standing on that player;
 *  - on the ball: between his man and the rim, squared up, with a cushion from the handler's shooting and quickness
 *    (crowd shooters, sag off non-shooters) instead of his distance alone; he gives ground only as fast as ~1.5 ft/s
 *    when the handler is not coming at him, so he never walks away from him;
 *  - a pass to his man is a closeout: sprint, then chop steps under control to the cushion, never a walk back;
 *  - off the ball: one pass away in the passing lane, two passes away on the help line (a foot in the lane, eyes on
 *    man and ball), less help off good shooters, attached to a strong-side corner man, 3/4 fronting the post on the
 *    ball side; nobody but the man on the ball goes near a handler who is not attacking;
 *  - on a drive the low man steps in front of the rim, the nearest man sinks to his man, the rest sag, and everyone
 *    recovers once the ball is out;
 *  - off-ball defenders react to the ball a moment late (0.15 to 0.35 s by help-defense rating), each on his own;
 *  - a contest faces the shooter all the way in; on a miss only defenders whose man can get to the glass box out,
 *    the rest take a step toward the long rebound. */
(function () {
  'use strict';
  const M = window.PBC.Match, U = M.U;
  const Dir = M.Director;
  if (!Dir) return;
  const P = Dir.prototype;
  const base = {
    setupMatchups: P.setupMatchups, guardPos: P.guardPos, trackDefender: P.trackDefender, defFacing: P.defFacing,
    planContest: P.planContest, crashBoards: P.crashBoards, passBall: P.passBall,
  };
  const ZONE = { zone23: 1, zone32: 1, zone131: 1, boxone: 1 };
  const RIM_SHOTS = { dunk: 1, layup: 1, reverse: 1, alley: 1, tip: 1 };
  const OUT = { x: 0, y: 0, vx: 0, vy: 0 };
  const TMP = new Float64Array(3);
  /** a rating of a player from the Live view's player info (ratings 25-99), or `d` */
  P.rating = function (id, k, d) { const l = this.v.look(id); const x = l ? +l[k] : NaN; return isFinite(x) ? x : d; };

  // ------------------------------------------------------------ matchups
  /** the engine's pairing (P.matchups: defender id -> his man's id) where both are on the floor, lineup order for the
   *  rest (a substitution the engine had not made yet) */
  P.setupMatchups = function () {
    base.setupMatchups.call(this);
    const mm = this.poss && this.poss.matchups;
    if (!mm) return;
    const offs = this.v.onCourt[this.off], defs = this.v.onCourt[this.def];
    const byKey = {};
    for (const o of offs) byKey[String(o)] = o;
    const out = {}, taken = {};
    for (const d of defs) {
      const o = mm[String(d)], oo = o != null ? byKey[String(o)] : undefined;
      if (oo !== undefined && !taken[String(oo)]) { out[d] = oo; taken[String(oo)] = 1; }
    }
    const left = offs.filter((o) => !taken[String(o)]);
    for (const d of defs) if (out[d] === undefined) out[d] = left.length ? left.shift() : offs[0];
    this.matchup = out;
    // (a new possession: every defender picks up his cushion and help spot afresh)
    for (const d of defs) { const a = this.v.actors[d]; if (a) { a._gs = null; a._os = null; a._dRole = null; } }
  };

  // ------------------------------------------------------------ passes in the air
  /** remember where a pass is going and when it gets there: the defense moves on the pass, not on the catch */
  P.passBall = function (from, to, kind, dur, onCatch, aim, o) {
    const r = base.passBall.call(this, from, to, kind, dur, onCatch, aim, o);
    const b = this.v.ball;
    if (b.state === 'flight' && b.segs) {
      const e = b.posAt(b.flightEnd(), TMP);
      this._pass = { to, x: e[0], y: e[1], t1: this.T + dur };
    }
    return r;
  };
  P.passInAir = function () {
    const p = this._pass, b = this.v.ball;
    if (p && b.state === 'flight' && b.passTarget === p.to && this.T <= p.t1 + 0.15) return p;
    // (the passer has turned to throw it, ~0.45 s before the release: the defense reads him and moves already, to
    // the spot the receiver is running to)
    const bt = this.beat;
    if (bt && bt.type === 'pass' && !bt.fired && bt.ev && this.T > bt.fireAt - 0.45) {
      const to = this.A(bt.ev.to);
      if (to && to.team === this.off && b.holder && b.holder !== to) {
        const e = this._passSoon || (this._passSoon = {}), rt = this.role[to.id], sp = rt && rt.until > this.T && rt.spot;
        e.to = to; e.x = sp ? sp.x : to.x + to.vx * 0.4; e.y = sp ? sp.y : to.y + to.vy * 0.4; e.t1 = bt.fireAt + 0.6;
        return e;
      }
    }
    // (the same for a swing pass of the half-court flow: the receiver steps to meet it)
    const sw = this.swing;
    if (sw && sw.state === 'windup') {
      const to = sw.chain[sw.i + 1], g = to && to.goal;
      if (to && to.team === this.off && b.holder && b.holder !== to) {
        const e = this._passSoon || (this._passSoon = {}), mv = g && g.mode === 'move';
        e.to = to; e.x = mv ? g.x : to.x; e.y = mv ? g.y : to.y; e.t1 = this.T + 1;
        return e;
      }
    }
    return null;
  };

  /**
   * The engine's next few events tell which players are about to catch the ball without shooting it (a swing, a
   * handoff, a drive after the catch): their defenders stay home on them instead of helping deep, so the court never
   * shows a wide-open shooter catching it only to move it on (the engine decided the defense had him covered).
   * Returns { id: true } for those players.
   */
  P.coveredCatchers = function () {
    if (this._ccAt === this.ei && this._cc) return this._cc;
    const cc = {}, ev = this.events || [];
    for (let i = Math.max(0, this.ei - 1); i < Math.min(ev.length, this.ei + 6); i++) {
      const e = ev[i];
      if (!e || e.type !== 'pass' || e.to == null) continue;
      let shoots = false;
      for (let j = i + 1; j < ev.length; j++) {
        const f = ev[j];
        if (!f) continue;
        if (f.type === 'shot' && String(f.shooter) === String(e.to)) { shoots = true; break; }
        if ((f.type === 'pass' || f.type === 'handoff') && String(f.from) === String(e.to)) break;
        if (f.type === 'move' && String(f.player) === String(e.to)) break;
        if (f.type === 'turnover' || f.type === 'foul' || f.type === 'rebound' || f.type === 'period_end') break;
      }
      if (!shoots) cc[String(e.to)] = true;
    }
    this._ccAt = this.ei; this._cc = cc;
    return cc;
  };

  /** the head coach's order on an offensive player this possession (the engine's P.dOrders: deny, sag, double, force,
   *  hack), or null */
  P.order = function (id) {
    const o = this.poss && this.poss.dOrders;
    return o ? o[id] || o[String(id)] || null : null;
  };

  // ------------------------------------------------------------ on-ball cushion
  /**
   * How far off the ball handler the defender plays (ft), squared up between him and the rim:
   *  - by his distance from the rim: about an arm's length inside the arc on an average handler (2.4 ft at the rim,
   *    3 ft at 17 ft), ~3.8 ft at the arc, picking him up looser the further out he is (NBA tracking has the nearest
   *    defender at 4.3 ft at 17-23 ft, 5.7 at 23-27, 6.4 at 27-32, 10 at 40);
   *  - by his shooting: crowd a shooter (x0.72 for an elite shooter from three), sag off a non-shooter (x1.45) and
   *    dare him to shoot; the same from the mid-range, milder;
   *  - by quickness: a quicker handler gets a little more room, a slower one less;
   *  - scheme, the Defensive Pressure slider and playoff intensity as before.
   */
  P.onBallGap = function (a, m, dl) {
    let gap = dl < 10 ? 2.4 : dl < 17 ? U.lerp(2.4, 3.0, (dl - 10) / 7) : dl < 23 ? U.lerp(3.0, 3.8, (dl - 17) / 6)
      : dl < 28 ? U.lerp(3.8, 4.8, (dl - 23) / 5) : dl < 35 ? U.lerp(4.8, 8, (dl - 28) / 7) : U.lerp(8, 14, U.clamp((dl - 35) / 12, 0, 1));
    if (dl > 12) {
      const three = dl > 21;
      const r = this.rating(m.id, three ? 'three' : 'mid', 60);
      const thr = U.clamp((r - 55) / 30, 0, 1);
      gap *= three ? U.lerp(1.45, 0.72, thr) : U.lerp(1.2, 0.85, thr);
    }
    const dq = ((m.rSpeed || 0.6) + (m.rAgi || 0.6) - (a.rSpeed || 0.6) - (a.rAgi || 0.6)) / 2;
    gap += U.clamp(dq, -0.3, 0.4) * 2.5;
    const sc = this.scheme;
    gap *= sc === 'pressure' ? 0.85 : sc === 'packline' && dl < 24 ? 1.2 : sc === 'nothree' && dl > 21 ? 0.85 : 1;
    gap *= this.sliderK('defPressure', 1.25, 0.8) * (1 - this.intensity() * 0.1);
    // (the coach's order on him: sag off and dare him to shoot, or get up into him)
    const od = this.order(m.id);
    if (od === 'sag' && dl > 12) gap *= 1.45; else if (od === 'deny') gap *= 0.85;
    return U.clamp(gap, 2, 16);
  };

  // ------------------------------------------------------------ team plan (drives)
  /**
   * What the five do together this frame: is the handler attacking the rim (a drive, or going at it inside ~24 ft),
   * and if so who is the low man (steps in front of the rim) and who sinks to the low man's man. The low man is
   * kept for the whole drive; never the defender of a strong-side corner man (help comes from the weak side).
   */
  P.defPlan = function () {
    const dp = this._dp || (this._dp = { T: -1 });
    if (dp.T === this.T) return dp;
    dp.T = this.T; dp.attack = false; dp.low = null; dp.sink = null; dp.sinkMan = null;
    const v = this.v, b = v.ball, rim = this.rim;
    const h = b.holder && b.holder.team === this.off && b.holder.kind === 'player' ? b.holder : null;
    dp.h = h;
    if (!h || ZONE[this.scheme]) { this._drv = null; return dp; }
    const dx = rim.x - h.x, dy = rim.y - h.y, dl = Math.hypot(dx, dy) || 1;
    const vIn = (h.vx * dx + h.vy * dy) / dl;
    dp.attack = this.driving(h) || (vIn > 8.5 && dl < 21 && dl > 4);
    if (!dp.attack) { this._drv = null; return dp; }
    const onBall = this.guardOf(h.id);
    const hSide = Math.sign(h.y - 25) || 1;
    const corner = (m) => m && this.U_(m.x) < 12 && Math.abs(m.y - 25) > 17 && (Math.sign(m.y - 25) || 1) === hSide;
    const hx = rim.x + dx / dl * -Math.min(5, dl * 0.5), hy = rim.y + dy / dl * -Math.min(5, dl * 0.5); // in front of the rim
    let drv = this._drv;
    if (!drv || drv.h !== h.id) {
      drv = this._drv = { h: h.id, low: null, sink: null, sinkMan: null };
      let best = null, bd = Infinity;
      for (const d of this.defActors()) {
        if (d === onBall || d.isBusy()) continue;
        const m = this.A(this.matchup[d.id]);
        if (!m || m === h || corner(m)) continue;
        const dd = Math.hypot(d.x - hx, d.y - hy) + (Math.sign(d.y - 25) === hSide ? 3 : 0);
        if (dd < bd) { bd = dd; best = d; }
      }
      if (best) {
        drv.low = best.id;
        const lm = this.A(this.matchup[best.id]);
        drv.sinkMan = lm ? lm.id : null;
        let s = null, sd = Infinity;
        if (lm) for (const d of this.defActors()) {
          if (d === onBall || d === best || d.isBusy()) continue;
          const m = this.A(this.matchup[d.id]);
          if (!m || m === h || corner(m)) continue;
          const dd = Math.hypot(d.x - lm.x, d.y - lm.y);
          if (dd < sd) { sd = dd; s = d; }
        }
        drv.sink = s ? s.id : null;
      }
    }
    dp.low = drv.low; dp.sink = drv.sink; dp.sinkMan = drv.sinkMan; dp.hx = hx; dp.hy = hy;
    return dp;
  };

  // ------------------------------------------------------------ the man on the ball against a shifty handler
  // (a gameplay pass: he stood on the handler's own spot and speed every frame, so no probe, crossover or hesitation ever
  // made an inch of space, and the offense never had any)
  /** how good the handler is against him: 0 (a lockdown defender on a big who can't dribble) to 1 (the other way) */
  P.shiftyK = function (h, d) {
    const hd = this.rating(h.id, 'handle', 55), ag = this.rating(h.id, 'agility', 65);
    const pd = this.rating(d.id, 'perD', 55), da = this.rating(d.id, 'agility', 65), iq = this.rating(d.id, 'defIQ', 55);
    return U.clamp(0.5 + ((hd * 0.7 + ag * 0.3) - (pd * 0.6 + da * 0.25 + iq * 0.15)) / 50, 0, 1);
  };
  /** where the man on the ball sees the handler: followed a reaction behind (Tune.shifty.lagS, by shiftyK), and pulled the
   *  way a move he bought sold him (defBite) while it lasts. Kept on the defender (a._pc) */
  P._perceive = function (a, m, T, dt) {
    const TS = M.Tune.shifty;
    let pc = a._pc;
    if (!pc || pc.man !== m || !(dt > 0) || T - pc.t > 0.25) pc = a._pc = { man: m, x: m.x, y: m.y, vx: m.vx, vy: m.vy, t: T, antK: 1, bite: null };
    pc.t = T;
    const k = this.shiftyK(m, a), lag = U.lerp(TS.lagS[0], TS.lagS[1], k) / this.sliderK('defIQ', 0.8, 1.2);
    const e = 1 - Math.exp(-dt / Math.max(0.01, lag));
    pc.vx += (m.vx - pc.vx) * e; pc.vy += (m.vy - pc.vy) * e;
    pc.x += (m.x - pc.x) * e; pc.y += (m.y - pc.y) * e;
    pc.antK = 1;
    let x = pc.x, y = pc.y;
    const bt = pc.bite;
    if (bt && T < bt.until) {
      // (sold: pulled the fake's way, easing in over its first fifth and back out by its end; his read of the handler's pace
      // gone meanwhile, a hesitation's above all: he stands up)
      const u = (T - bt.t0) / (bt.until - bt.t0), w = U.smooth(Math.min(1, u / 0.2)) * (1 - U.smooth((u - 0.45) / 0.55));
      x += bt.dx * w; y += bt.dy * w; pc.antK = 1 - bt.antCut * w;
    } else if (bt) pc.bite = null;
    return { x, y };
  };
  /** a dribble move is made (Ball, as its bounce starts): the man on the ball buys it as much as the handler is better than
   *  him (shiftyK; Tune.shifty): a crossover, between the legs or behind the back sells the side the ball is leaving, an in
   *  and out the other side, a spin the way he was going, a hesitation stands him up (he gives a step and stops reading the
   *  handler's pace). Research: space comes from a change of pace or direction the defender has to react to (coaching:
   *  hesitation, in and out, crossover after two or three hard dribbles) */
  P.defBite = function (h, mv, hand, toHand) {
    if (!this.active || this.phase !== 'front' || !h || h.team !== this.off) return;
    const d = this.guardOf(h.id);
    if (!d || d.isBusy() || Math.hypot(d.x - h.x, d.y - h.y) > M.Tune.shifty.nearFt) return;
    const TS = M.Tune.shifty, k = this.shiftyK(h, d), T = this.T;
    // (a heady defender reads it now and then anyway)
    if (Math.random() < TS.readP * (1 - k)) return;
    const c = Math.cos(h.facing), s = Math.sin(h.facing);
    // the handler's right (x toward his right hand side), his forward
    const rx = s, ry = -c;
    let dx = 0, dy = 0, ft = U.lerp(TS.biteFt[0], TS.biteFt[1], k), dur = U.lerp(TS.biteS[0], TS.biteS[1], k), antCut = 0.6;
    const sideOf = (hh) => (hh ? 1 : -1);
    if (mv === 'cross' || mv === 'btl' || mv === 'btb') { const sd = sideOf(hand); dx = rx * sd * ft; dy = ry * sd * ft; }
    else if (mv === 'inout') { const sd = -sideOf(hand); dx = rx * sd * ft; dy = ry * sd * ft; }
    else if (mv === 'spin') { const sd = sideOf(hand); dx = rx * sd * ft * 0.8; dy = ry * sd * ft * 0.8; dur *= 1.2; }
    else if (mv === 'hesi') { const f = U.lerp(TS.hesiFt[0], TS.hesiFt[1], k); dx = -c * f; dy = -s * f; dur = U.lerp(TS.hesiS[0], TS.hesiS[1], k); antCut = 0.9; }
    else return;
    const pc = d._pc || (d._pc = { man: h, x: h.x, y: h.y, vx: h.vx, vy: h.vy, t: T, antK: 1, bite: null });
    pc.bite = { t0: T, until: T + dur, dx, dy, antCut, mv };
    this.bites = (this.bites || 0) + 1;
    // (a big bite leaves him off balance: his weight goes the way it sold him, a stumble step to catch it when it is big)
    const bl = Math.hypot(dx, dy), knock = U.lerp(TS.biteKnock[0], TS.biteKnock[1], k * Math.min(1, bl / TS.biteFt[1]));
    if (bl > 0.3 && knock > 3) d.impact(dx / bl, dy / bl, knock);
  };

  /** how hard an off-ball defender one pass away denies his man (0 sagging off, 1 all over the lane): the scheme (Tune.deny.scheme)
   *  times his defense (perimeter defense, head, quickness against Tune.deny.skillFrom/To), and more on a shooter */
  P.denyK = function (a, m, threat) {
    const TD = M.Tune.deny, sk = TD.scheme[this.scheme] != null ? TD.scheme[this.scheme] : TD.scheme.man;
    const q = this.rating(a.id, 'perD', 55) * 0.5 + this.rating(a.id, 'defIQ', 55) * 0.3 + this.rating(a.id, 'agility', 65) * 0.2;
    const ab = U.clamp((q - TD.skillFrom) / (TD.skillTo - TD.skillFrom), TD.skillMin, 1);
    const k = U.clamp(sk * ab * U.lerp(TD.shooterMin, 1, threat) * this.sliderK('defIQ', 0.8, 1.15), 0, 1);
    // (the coach's order: deny him the ball everywhere, or sag off him to help)
    const od = this.order(m.id);
    return od === 'deny' ? Math.max(k, 0.95) : od === 'sag' ? Math.min(k, 0.12) : k;
  };
  /** the double team (the coach's order on a man with the ball within ~18 ft of the rim): the defender whose own man is
   *  nearest him comes; kept for the frame */
  P.doubler = function (h) {
    const dd = this._dbl || (this._dbl = { T: -1, id: null });
    if (dd.T === this.T) return dd.id;
    dd.T = this.T; dd.id = null;
    if (!h || this.order(h.id) !== 'double') return null;
    const rim = this.rim;
    if (Math.hypot(h.x - rim.x, h.y - rim.y) > 18) return null;
    let best = null, bd = 1e9;
    for (const d in this.matchup) {
      const mid = this.matchup[d];
      if (String(mid) === String(h.id)) continue;
      const m = this.v.actor(mid);
      if (!m) continue;
      const dist = Math.hypot(m.x - h.x, m.y - h.y);
      if (dist < bd) { bd = dist; best = d; }
    }
    dd.id = best;
    return best;
  };

  // ------------------------------------------------------------ where a defender stands
  P.guardPos = function (a) {
    const v = this.v, b = v.ball, rim = this.rim;
    if (ZONE[this.scheme] || this.scheme === 'press' || this.phase !== 'front') { a._dRole = null; return base.guardPos.call(this, a); }
    const m = v.actor(this.matchup[a.id]);
    if (!m) { a._dRole = null; return base.guardPos.call(this, a); }
    const mu = this.U_(m.x);
    const pf = this.passInAir();
    const h = b.holder && b.holder.team === this.off ? b.holder : null;
    // (off the ball the defense moves on the flight of the pass; only the receiver's man reads the passer before it)
    const inAir = pf && b.state === 'flight';
    const bx = inAir ? pf.x : h ? h.x : b.x, by = inAir ? pf.y : h ? h.y : b.y;
    if (mu > 44 || this.U_(bx) > 44) { a._dRole = null; return base.guardPos.call(this, a); }
    const out = OUT;
    const T = this.T;
    let px, py, role;
    // (the man with the ball keeps his defender until the pass is out of his hands; the receiver's closes out)
    const closing = !!pf && pf.to === m;
    const withBall = closing || h === m;
    const gs = a._gs || (a._gs = { gap: 4, t: T, on: false });
    const dtg = U.clamp(T - gs.t, 0, 0.1); gs.t = T;
    if (withBall) {
      // on the ball, or closing out to where the pass to his man is going
      let cx = closing ? pf.x : m.x, cy = closing ? pf.y : m.y;
      const dx = rim.x - cx, dy = rim.y - cy, dl = Math.hypot(dx, dy) || 1;
      // (he reads the handler a moment late, the better the handle against his feet the later, and a move he bought
      // takes him the wrong way for a moment: _perceive, defBite; closing out he runs at the catch)
      if (!closing) { const pc = this._perceive(a, m, T, dtg); cx = pc.x; cy = pc.y; }
      const want = this.onBallGap(a, m, dl);
      if (!gs.on) { gs.on = true; gs.gap = closing ? want : U.clamp(Math.hypot(a.x - cx, a.y - cy), 2, 30); }
      // (closing in is free, a closeout goes straight for its spot; giving ground only ~1.5 ft/s unless the handler
      // comes at him, which moves the spot itself)
      gs.gap = want < gs.gap || closing ? want : Math.min(want, gs.gap + 1.5 * dtg);
      px = cx + dx / dl * gs.gap; py = cy + dy / dl * gs.gap;
      role = closing ? 'closeout' : 'onBall';
      a.setStance('defense');
      const ant = 0.9 * this.sliderK('defIQ', 0.7, 1.15) * (closing ? 1 : a._pc ? a._pc.antK : 1);
      out.vx = closing ? 0 : (a._pc ? a._pc.vx : m.vx) * ant; out.vy = closing ? 0 : (a._pc ? a._pc.vy : m.vy) * ant;
    } else if (h && String(this.doubler(h)) === String(a.id)) {
      // the double team: up on the man with the ball from the baseline side, hands up (his own man is left open)
      gs.on = false;
      const dx = rim.x - h.x, dy = rim.y - h.y, dl = Math.hypot(dx, dy) || 1;
      const side = Math.sign(a.y - h.y) || 1;
      px = h.x + dx / dl * 2.2 + (-dy / dl) * side * 2.2; py = h.y + dy / dl * 2.2 + (dx / dl) * side * 2.2;
      role = 'double';
      a.setStance('defense');
      out.vx = h.vx || 0; out.vy = h.vy || 0;
    } else {
      gs.on = false;
      const dp = this.defPlan();
      const dBallM = Math.hypot(m.x - bx, m.y - by) || 1;
      const hSide = Math.sign(by - 25) || 1, mSide = Math.sign(m.y - 25) || 1;
      const bu = this.U_(bx);
      const dRimM = Math.hypot(m.x - rim.x, m.y - rim.y) || 1;
      // his threat from where he stands: his three-point rating behind the line, his mid-range rating inside it
      const behind = this.beyondArc ? this.beyondArc(mu, m.y, 0) : dRimM >= 23.75;
      const threat = U.clamp((this.rating(m.id, behind ? 'three' : dRimM > 11 ? 'mid' : 'close', 60) - 55) / 30, 0, 1);
      const rx = (rim.x - m.x) / dRimM, ry = (rim.y - m.y) / dRimM;
      const ux = (bx - m.x) / dBallM, uy = (by - m.y) / dBallM;
      // (the strong-side corner with the ball on his wing; with the ball up top both corners are two passes away)
      const strongCorner = mu < 12 && Math.abs(m.y - 25) > 17 && mSide === hSide && Math.abs(by - 25) > 12;
      const opposite = Math.abs(by - 25) > 4 && mSide !== hSide; // (the ball in the middle: both wings are one pass away)
      const twoAway = !strongCorner && (dBallM > 28 || (opposite && Math.abs(m.y - 25) > 6 && dBallM > 16));
      // the average NBA defender (Franks et al.): 0.62 of the way his man, 0.11 the ball, 0.27 the hoop
      px = 0.62 * m.x + 0.11 * bx + 0.27 * rim.x; py = 0.62 * m.y + 0.11 * by + 0.27 * rim.y;
      let leash = 16;
      if (strongCorner) {
        // strong-side corner: attached (no help comes from there), a step toward the ball and the rim
        px = m.x + ux * 2.2 + rx * 1.4; py = m.y + uy * 2.2 + ry * 1.4; role = 'deny'; leash = 5;
      } else if (dRimM < 11 && dBallM < 22 && (mSide === hSide || dBallM < 18)) {
        // post (ball side): 3/4 front with the ball on his side below the top, else behind him, on the rim side; a
        // weak-side post man is guarded from the help line like any man two passes away
        if (mSide === hSide && bu < 26) { px = m.x + ux * 1.9 + rx * 0.9; py = m.y + uy * 1.9 + ry * 0.9; } else { px = m.x + rx * 2.3; py = m.y + ry * 2.3; }
        role = 'post'; leash = 4;
      } else if (!twoAway) {
        // one pass away: a hand and a foot in the passing lane, a step off toward the rim; a pack line sags instead,
        // and a non-shooter far out is left to sag toward the help
        const sc = this.scheme;
        let w = sc === 'packline' ? 0.15 : sc === 'pressure' || sc === 'nothree' ? 1 : 0.8;
        if (dRimM > 21) w *= U.lerp(0.35, 1, threat);
        if (this.coveredCatchers()[String(m.id)]) w = Math.max(w, 0.8);
        // (how hard he denies, the gameplay pass: as much as the scheme asks and his defense lets him, Tune.deny: nearer his
        // man and further into the lane, the hand on the ball's side out in it)
        // (a pass to his man coming, Tune.deny.giveS before the throw, or the half-court flow's swing to him winding up: his man
        // has got open, and he is back off the lane with the hand down, the closeout coming from there; he stayed in the lane
        // until the passer turned and the ball went past his hand to a man he was all over)
        const bt = this.beat, TD = M.Tune.deny, sw = this.swing;
        let give = 1;
        if (bt && bt.type === 'pass' && !bt.fired && bt.ev && this.A(bt.ev.to) === m) give = U.smooth((bt.fireAt - T) / TD.giveS);
        if (sw && sw.state === 'windup' && sw.chain && sw.chain[sw.i + 1] === m) give = 0;
        const dk = this.denyK(a, m, threat) * w * give;
        const dd = U.lerp(3.2, M.Tune.deny.nearFt, dk), dr = U.lerp(1.2, 0.5, dk);
        px = U.lerp(px, m.x + ux * dd + rx * dr, w); py = U.lerp(py, m.y + uy * dd + ry * dr, w);
        role = 'deny'; leash = 8;
        if (dk > M.Tune.deny.armFrom) {
          const f = a.facing, side = (bx - a.x) * Math.sin(f) - (by - a.y) * Math.cos(f) > 0 ? 1 : 0;
          const dn = a._deny || (a._deny = { x: 0, y: 0, w: 0, side: 1, t: 0 });
          dn.x = bx; dn.y = by; dn.w = U.clamp((dk - M.Tune.deny.armFrom) / (1 - M.Tune.deny.armFrom), 0, 1); dn.side = side; dn.t = T;
        }
      } else {
        // two passes away: the help line, a foot in the lane with the ball above the free-throw line, on the rim line
        // with it on the wing or in the corner, about as deep as his man; a real shooter (70+) is not left: his man
        // stays home, a step off him toward the rim and the ball
        const hp = this.P(U.clamp(mu * 0.6, 4, 17), 25 + mSide * (bu > 19 ? 7.5 : 3));
        const home = { x: m.x + rx * 4 + ux * 1.8, y: m.y + ry * 4 + uy * 1.8 };
        const kh = this.coveredCatchers()[String(m.id)] ? 0 : U.clamp((0.6 - threat) / 0.3, 0, 1); // (3PT up to 64: full help, 73 and up: home; home on a man the ball is coming to who will not shoot it)
        const sx = U.lerp(home.x, hp.x, kh), sy = U.lerp(home.y, hp.y, kh);
        px = U.lerp(px, sx, 0.9); py = U.lerp(py, sy, 0.9);
        role = kh > 0.5 ? 'help' : 'home';
      }
      // a drive: the low man steps in front of the rim, the nearest man sinks to the low man's man, the rest sag
      if (dp.attack && role !== 'post' && !strongCorner) {
        if (dp.low === a.id) { px = dp.hx; py = dp.hy; role = 'lowman'; leash = 40; }
        else if (dp.sink === a.id && dp.sinkMan != null) {
          const sm = this.A(dp.sinkMan);
          if (sm) { const k2 = 0.38; const mx = U.lerp(px, sm.x + (rim.x - sm.x) * k2, 0.75), my = U.lerp(py, sm.y + (rim.y - sm.y) * k2, 0.75); px = mx; py = my; role = 'sink'; leash = 30; }
        } else { px += (rim.x - px) * 0.15; py += (rim.y - py) * 0.15; }
      }
      // never so far from his man that he cannot close out on the pass; in help, either in the lane or within 12 ft of
      // him (not stranded in between, too far to close out and helping nobody)
      if ((role === 'help' || role === 'home') && !(Math.abs(py - 25) <= 10 && this.U_(px) <= 21)) leash = Math.min(leash, 11.5);
      const gx = px - m.x, gy = py - m.y, gl = Math.hypot(gx, gy);
      if (gl > leash) { px = m.x + gx / gl * leash; py = m.y + gy / gl * leash; }
      // he reacts to the ball a moment late (by his help-defense rating), each defender on his own clock; he follows
      // his man at once, only the part of his spot that depends on the ball lags
      const os = a._os || (a._os = { x: a.x - m.x, y: a.y - m.y, t: T, m: m.id, role: null });
      if (os.m !== m.id || os.role === 'onBall' || os.role === 'closeout' || os.role == null) { os.x = a.x - m.x; os.y = a.y - m.y; os.m = m.id; }
      const help01 = U.clamp((this.rating(a.id, 'helpD', 60) - 25) / 74, 0, 1);
      const tau = role === 'lowman' || role === 'sink' ? 0.12 : 0.15 + (1 - help01) * 0.2;
      const dts = U.clamp(T - os.t, 0, 0.1); os.t = T;
      const kk = 1 - Math.exp(-dts / tau);
      os.x += (px - m.x - os.x) * kk; os.y += (py - m.y - os.y) * kk;
      px = m.x + os.x; py = m.y + os.y;
      // nobody but the man on him (and the low man on a drive) leaves his man to go near the handler: no doubling a
      // contained ball (a defender whose own man is next to the ball stays with him)
      if (h && role !== 'lowman' && Math.hypot(m.x - h.x, m.y - h.y) > 10) {
        const ex = px - h.x, ey = py - h.y, el = Math.hypot(ex, ey);
        if (el < 7) { const e = el > 0.01 ? 7 / el : 0; px = h.x + (el > 0.01 ? ex * e : rx * -7); py = h.y + (el > 0.01 ? ey * e : ry * -7); }
      }
      a.setStance((role === 'help' || role === 'home') && dBallM > 20 && !dp.attack ? 'ready' : 'defense');
      const ant = 0.6 * this.sliderK('defIQ', 0.55, 1.3);
      out.vx = role === 'lowman' ? 0 : m.vx * ant; out.vy = role === 'lowman' ? 0 : m.vy * ant;
    }
    // defensive three seconds (the Director's rule): not guarding anyone within arm's length, he steps out of the
    // lane before his third second, then back in
    if (!withBall && role !== 'lowman' && role !== 'double') {
      const inLane = this.inPaint({ x: px, y: py }, 0) && Math.hypot(m.x - px, m.y - py) > 4.5;
      const dt3 = U.clamp(T - (a._laneT0 != null ? a._laneT0 : T), 0, 0.1); a._laneT0 = T;
      a._laneT = inLane && this.inPaint(a, 0) ? (a._laneT || 0) + dt3 : 0;
      if (a._laneT > 2.3) { a._laneOut = T + 0.9; a._laneT = 0; }
      if (a._laneOut && T < a._laneOut && inLane) {
        const bl = rim.x < 47 ? 0 : 94, side = m.y >= 25 ? 1 : -1;
        const u = Math.abs(px - bl), vy = Math.abs(py - 25);
        if (8.8 - vy < 19.8 - u) py = 25 + side * 8.8; else px = bl + (rim.x < 47 ? 1 : -1) * 19.8;
      }
    }
    // a shot about to go up: only the contester and the shooter's own man stay near him
    const sa = this.shotAvoid;
    if (sa && T < sa.until && a !== sa.except && !(sa.shooter && String(this.matchup[a.id]) === String(sa.shooter.id))) {
      const ex = px - sa.x, ey = py - sa.y, el = Math.hypot(ex, ey);
      if (el < sa.r) { const k = sa.r / Math.max(el, 0.01); px = sa.x + (el > 0.01 ? ex : a.x - sa.x) * k; py = sa.y + (el > 0.01 ? ey : a.y - sa.y) * k; }
    }
    if (a._os) a._os.role = role;
    a._dRole = role;
    out.x = U.clamp(px, 0.5, 93.5); out.y = U.clamp(py, 0.5, 49.5);
    return out;
  };

  /** the Director's tracker with speeds by job: squared-up slides and backpedals (~13.5 ft/s at most) on the ball and
   *  in help; a closeout sprints, then chops the last ~8 ft under control; the low man and the sink go all out */
  P.trackDefender = function (a) {
    a._trackOwner = this;
    a._defTrack = null;
    const e0 = { t: this.T, x: a.x + a.vx * 0.3, y: a.y + a.vy * 0.3 };
    a.track(() => {
      const p = this.guardPos(a);
      const ke = U.smooth((this.T - e0.t) / 0.5);
      if (ke < 1) { p.x = U.lerp(e0.x, p.x, ke); p.y = U.lerp(e0.y, p.y, ke); }
      const role = a._dRole, lag = Math.hypot(p.x - a.x, p.y - a.y);
      const tg = a._dTgt || (a._dTgt = { x: 0, y: 0, T: 0 }); tg.x = p.x; tg.y = p.y; tg.T = this.T; // (for the debug overlay)
      let sp = Math.min(a.maxSpeed, 13.5);
      if (a._dface && (a._dface.run || a._dface.back)) sp = a.maxSpeed;
      else if (role === 'closeout') sp = lag > 8 ? a.maxSpeed : 9;
      else if (role === 'lowman' || role === 'sink') sp = a.maxSpeed;
      a.goal.speed = sp;
      return p;
    }, { speed: a.maxSpeed, stance: 'defense' });
    a._defTrack = a.goal.track;
    a.setFace((me) => this.defFacing(me));
    a.faceLock = true;
  };
  /** the low man on a drive squares up to the driver */
  P.defFacing = function (me) {
    const h = this.v.ball.holder;
    if (me._dRole === 'lowman' && h && h.team === this.off) { me.lookAt(null); return Math.atan2(h.y - me.y, h.x - me.x); }
    return base.defFacing.call(this, me);
  };

  // ------------------------------------------------------------ shots
  /** the contest: the shooter's own man takes it (the engine names him now that the matchups are shared; after a
   *  switch it is whoever the court has on him), a help defender only at the rim; he faces the shooter all the way */
  P.planContest = function (ev, sh, spot, fireAt) {
    const atRim = !!RIM_SHOTS[ev.kind] || ev.kind === 'floater';
    const own = sh ? this.guardOf(sh.id) : null;
    let e = ev;
    if (!atRim && own && String(ev.defender) !== String(own.id) && !ev.blocked && !ev.fouled) e = Object.assign({}, ev, { defender: own.id });
    base.planContest.call(this, e, sh, spot, fireAt);
    // (an open finish at the rim: the help is late, nobody but the contest in the finisher's space; jump shots have
    // this from the Director)
    if (atRim && !this.shotAvoid && (ev.contest || 'contested') === 'open' && !ev.fouled && !ev.blocked) this.shotAvoid = { x: spot.x, y: spot.y, r: 4.5, until: fireAt + 0.3, except: this.A(e.defender) || own };
    if (this.shotAvoid) this.shotAvoid.shooter = sh;
    const df = this.A(e.defender) || own;
    if (df && df.team === this.def && sh && !df.isBusy()) { df.setFace((me) => Math.atan2(sh.y - me.y, sh.x - me.x)); df.faceLock = true; }
  };
  /** on a miss a defender boxes out a man who can get to the glass (inside ~17 ft or coming in); on a man who stays
   *  out he takes a step toward where a long rebound comes instead of boxing out 25 ft from the rim */
  P.crashBoards = function (sh, quick, blocked) {
    // (all of it passed on: a blocked shot has no box-out, Trial 11; dropped here, its defenders boxed out anyway)
    base.crashBoards.call(this, sh, quick, blocked);
    const pr = this.pendingRebound;
    this.at(this.T + (quick ? 0.25 : 0.45), () => {
      const rim = this.rim;
      for (const d of this.defActors()) {
        if (d.isBusy() || (pr && pr.actor === d)) continue;
        const m = this.A(this.matchup[d.id]);
        if (!m) continue;
        const dx = m.x - rim.x, dy = m.y - rim.y, dm = Math.hypot(dx, dy) || 1;
        const vIn = -(m.vx * dx + m.vy * dy) / dm;
        if (dm < 17 || vIn > 4) continue;
        const k = 13 / dm;
        d.setStance('ready');
        d.moveTo(rim.x + dx * k, rim.y + dy * k, { speed: 10, face: this.rim });
      }
    }, 'long rebound spot');
  };
})();
