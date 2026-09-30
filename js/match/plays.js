/* Pro BBALL Coach — match view: the called play on the court (extends PBC.Match.Director, after offense.js).
 * The engine calls a play from the team's playbook (js/core/playbook.js, playcall.js) and sends it with the
 * possession: the call ('set': the play, who fills each role, the alignment, the pick-and-roll coverage the defense
 * plays, the read it will take), then each step ('step': where the other roles go, who comes off a screen), the
 * screens, passes, hand-offs and moves, and the read at the end. Here:
 *  - the half-court flow runs up to the call; in its last seconds the five go to the play's alignment and from then on
 *    stay out of the flow's own actions (no swings, cuts or relocations of their own) until the play is over;
 *  - each step moves the players it names to their spots; a player coming off an off-ball screen waits for it and
 *    runs off it (choreo.js p_screen), the screener goes back to his spot in the play; a player waiting for his part
 *    makes the small moves of a set around his spot (pbShake) instead of standing on it;
 *  - the play ends with the shot, a turnover, a foul, a reset pass or the next call, and the flow takes over again;
 *  - an inbound play under the basket or from the sideline is acted out while the ball is dead: the alignment, the
 *    screens and cuts, then the throw-in to the man the read found.
 * Nothing here changes the engine's outcome. */
(function () {
  'use strict';
  const M = window.PBC.Match, U = M.U;
  const Dir = M.Director;
  if (!Dir) return;
  const P = Dir.prototype;
  const base = { start: P.start, p_set: P.p_set, p_inbound: P.p_inbound, fire: P.fire, flowBall: P.flowBall, finish: P.finish, flowFree: P.flowFree, flowHandler: P.flowHandler, flowOffBall: P.flowOffBall, ambient: P.ambient };

  P.start = function (poss, cb) { this.pbRun = null; this._pbLast = null; return base.start.call(this, poss, cb); };

  /** a play spot (u = feet from the attacked baseline, v = feet from the sideline, already mirrored) on the court */
  P.pbPt = function (uv) { return { x: this.X(U.clamp(uv[0], 1.5, 44)), y: U.clamp(uv[1], 2, 48) }; };

  /** the play is over: everyone back to the half-court flow */
  P.pbEnd = function () {
    const run = this.pbRun;
    if (!run) return;
    this.pbRun = null;
    this._pbLast = run; // (the debug view shows how it went)
    for (const id in run.ids) {
      const r = this.role[id];
      if (!r) continue;
      r.pb = false; r.pbDest = null; r.shakeTo = null;
      if (r.next > this.T + 1) r.next = this.T + 0.4 + Math.random() * 0.8;
    }
  };

  /** put a player on his spot in the play and keep the flow's own actions off him until the play is over (the small
   *  moves of a set, a v-cut, a lift or drift, a short relocation, go on around the spot: pbShake) */
  P.pbHold = function (id, spot, hold, fast) {
    const a = this.A(id), r = this.role[id];
    if (!a || !r) return;
    // (the same spot as before in this play: he goes on with his small moves around it)
    if (r.pb && this.pbRun && r.spotName === 'play' && r.spot && !r.path && Math.hypot(r.spot.x - spot.x, r.spot.y - spot.y) < 1.5) { r.spot = spot; return; }
    r.spot = spot; r.spotName = 'play'; r.path = null; r.jx = 0; r.jy = 0; r.pb = true; r.phase = null; r.shakeTo = null;
    // (into the alignment at a jog; a step of the play at a run)
    const d = Math.hypot(spot.x - a.x, spot.y - a.y), sp = Math.min(fast ? 15 : 12.5, d > 16 ? 16 : d > 6 ? 12 : 7);
    // (held on his way there: the run to the spot is his; then the small moves start)
    const t = Math.min(hold || 0.8, d / sp + 0.25);
    r.until = Math.max(r.until || 0, this.T + t);
    r.next = this.T + t + 0.15 + Math.random() * 0.45;
    if (this.v.ball.holder === a || a.isBusy()) return;
    const b = this.v.ball;
    a.moveTo(spot.x, spot.y, { speed: sp, face: d > 3 ? 'move' : { x: b.x, y: b.y }, stance: d > 5 ? 'stand' : 'ready' });
  };

  // ------------------------------------------------------------ the call
  /* The set beat is everything from the last event up to the call (often 5 to 10 s of half court after the ball comes
   * up): the half-court flow runs through it (swings, screens away, cuts, relocations) and the five get into the play's
   * alignment only in its last seconds, the time the farthest of them needs to get to his spot. */
  P.p_set = function (ev, beat, gap) {
    if (!ev.pb) { this.pbEnd(); return base.p_set.call(this, ev, beat, gap); }
    const pb = ev.pb;
    beat.onStart = (fireAt) => {
      this.pbEnd();
      this.tempo = 'normal';
      const check = () => {
        if (this.beat !== beat || beat.fired) return;
        const t = this.pbAlignTime(pb);
        if (fireAt - this.T > t + 0.3) this.at(fireAt - t, () => { if (this.beat === beat && !beat.fired) this.pbAlign(pb); }, 'play alignment');
        else this.pbAlign(pb);
      };
      if (fireAt - this.T > 3.8) this.at(fireAt - 3.6, check, 'play alignment check'); else check();
    };
    return 0.3;
  };
  /** the time the five need to get into the play's alignment from where they are */
  P.pbAlignTime = function (pb) {
    let far = 0;
    for (const id in pb.align) {
      const a = this.A(id);
      if (!a) continue;
      const sp = this.pbPt(pb.align[id]);
      far = Math.max(far, Math.hypot(sp.x - a.x, sp.y - a.y));
    }
    return U.clamp(far / 13 + 0.9, 1.4, 3.2);
  };
  /** the call: the five go to the play's alignment and stay out of the half-court flow until the play is over */
  P.pbAlign = function (pb) {
    if (this.pbRun && this.pbRun.pb === pb) return;
    this.pbEnd();
    const run = this.pbRun = { id: pb.id, pb, ids: {}, t0: this.T, k: -1 };
    const b = this.v.ball, h = b.holder;
    for (const id in pb.align) {
      run.ids[id] = 1;
      const a = this.A(id);
      if (!a) continue;
      const sp = this.pbPt(pb.align[id]);
      // (not the inbounder, the ball still in his hands out of bounds with the throw on its way: he was set dribbling on the
      // sideline, the gameplay pass)
      if (a === h && a.x > 0 && a.x < 94 && a.y > 0 && a.y < 50) {
        // the handler dribbles into his spot for the play
        const r = this.role[id];
        if (r) { r.spot = sp; r.spotName = 'play'; r.pb = true; r.next = this.T + 1.5; r.until = this.T + 1.2; r.path = null; }
        if (!a.isBusy() && Math.hypot(sp.x - a.x, sp.y - a.y) > 2) {
          if (b.state !== 'dribble') b.dribble(a);
          a.moveTo(sp.x, sp.y, { speed: 9, face: 'move', stance: 'dribble' });
        }
      } else this.pbHold(id, sp, 1.1);
    }
  };

  // ------------------------------------------------------------ a step of the play
  P.p_step = function (ev, beat, gap) {
    beat.onFire = () => {
      const run = this.pbRun;
      if (!run || run.id !== ev.pb) return;
      run.k = ev.k;
      const users = {}, screeners = {};
      for (const s of ev.scr || []) { users[s[1]] = 1; screeners[s[0]] = 1; }
      const h = this.v.ball.holder;
      for (const id in ev.pos || {}) {
        const r = this.role[id], a = this.A(id);
        if (!r || !a) continue;
        const sp = this.pbPt(ev.pos[id]);
        // (off an off-ball screen: the screen planner sends him when it is set)
        if (users[id]) { r.pbDest = sp; r.pb = true; r.next = this.T + 0.4 + Math.random() * 0.4; continue; }
        // (a screener in this step sets his screen first, then goes there)
        if (screeners[id]) { r.spot = sp; r.spotName = 'play'; r.pb = true; r.next = this.T + 2; continue; }
        // (the ball handler goes with his own moves and passes)
        if (a === h) { r.spot = sp; continue; }
        this.pbHold(id, sp, 0.9, true);
      }
    };
    return 0.05;
  };

  // ------------------------------------------------------------ the end of the play
  P.fire = function (beat) {
    base.fire.call(this, beat);
    if (!this.pbRun) return;
    const t = beat.type, ev = beat.ev;
    if (t === 'shot' || t === 'turnover' || t === 'foul' || t === 'rebound' || t === 'period_end' || t === 'timeout' || (t === 'pass' && ev && ev.reset)) this.pbEnd();
  };
  P.finish = function () { this.pbEnd(); return base.finish.call(this); };
  /** no swings of the ball around the perimeter while a play is on (the play moves it) */
  P.flowBall = function () {
    if (this.pbRun && !this.swing) return;
    return base.flowBall.call(this);
  };
  /** the players in a play are not free for the flow's cuts, relocations and drive reactions */
  P.flowFree = function (a) {
    const r = this.role[a.id];
    if (this.pbRun && r && r.pb) return false;
    return base.flowFree.call(this, a);
  };
  /** a player in a play waiting for his part: the small moves around his spot, never the flow's own actions */
  P.flowOffBall = function (a, r) {
    if (this.pbRun && r && r.pb) { this.pbShake(a, r); return false; }
    return base.flowOffBall.call(this, a, r);
  };
  /* The small moves of a player waiting for his part in a play (coaches: stay alive off the ball, a player changes what
   * he is doing every couple of seconds): a shooter behind the line slides a step or two along the arc (a corner
   * shooter lifts a step, the "shake") or dips in and pops back out (a v-cut); a big inside seals a step toward the lane
   * or slides along the baseline; anyone else takes a step or two around his spot; a man about to come off a screen
   * walks his defender down a step toward the rim. Then back to the spot. Moves of 2 to 4 ft at a walk, short pauses. */
  P.pbShake = function (a, r) {
    const T = this.T;
    if (!r.spot) return;
    const su = this.U_(r.spot.x), sv = r.spot.y;
    const au = this.U_(a.x), av = a.y;
    const off = Math.hypot(r.jx || 0, r.jy || 0);
    const beyond = this.beyondArc(su, sv, 0.5);
    let ju = 0, jv = 0, phase = null;
    if (r.pbDest) {
      if (off < 0.5) { const du = 5.25 - su, dv = 25 - sv, dl = Math.hypot(du, dv) || 1; ju = du / dl * 2.2; jv = dv / dl * 2.2; }
    } else if (r.phase === 'out' || off > 1.2) {
      // back to the spot
      ju = (Math.random() - 0.5) * 0.8; jv = (Math.random() - 0.5) * 0.8;
    } else {
      // a move that goes somewhere (not into the sideline or the baseline, not where he already is)
      for (let k = 0; k < 4; k++) {
        phase = null;
        const m = this.pbShakeMove(a, su, sv, beyond);
        ju = m[0]; jv = m[1]; if (m[2]) phase = 'out';
        const tu = U.clamp(su + ju, 2.2, 44), tv = U.clamp(sv + jv, 2.2, 47.8);
        ju = tu - su; jv = tv - sv;
        if (Math.hypot(tu - au, tv - av) >= 1.5) break;
      }
    }
    r.phase = phase;
    r.jx = this.X(su + ju) - r.spot.x; r.jy = jv;
    // (the next move comes after a short pause once he gets there: pbArrive)
    r.shakeTo = { x: this.X(U.clamp(this.U_(r.spot.x + r.jx), 2.2, 91.8)), y: U.clamp(r.spot.y + r.jy, 2.2, 47.8), pause: 0.12 + Math.random() * 0.33 };
    r.next = T + 2.5;
  };
  /** a player in a play who got to where his small move was taking him pauses a moment, then makes the next one */
  P.pbArrive = function () {
    const T = this.T;
    for (const a of this.offActors()) {
      const r = this.role[a.id];
      if (!r || !r.pb || !r.shakeTo) continue;
      const s = r.shakeTo;
      if (Math.hypot(s.x - a.x, s.y - a.y) < 0.6 && a.speed < 1.5) { r.next = Math.min(r.next, T + s.pause); r.shakeTo = null; }
    }
  };
  P.ambient = function (dt) {
    if (this.pbRun) this.pbArrive();
    return base.ambient.call(this, dt);
  };
  /** one small move from the spot (u, v offsets; a third item true for a v-cut that comes back out) */
  P.pbShakeMove = function (a, su, sv, beyond) {
    let ju = 0, jv = 0;
    if (this.insideBig(a) || (su < 10 && Math.abs(sv - 25) < 14)) {
      // a big inside: a step toward the lane (a seal), or along the baseline toward the short corner
      const s = sv < 25 ? 1 : -1;
      if (Math.random() < 0.5) { jv = s * (1.2 + Math.random() * 1.3); ju = (Math.random() - 0.5) * 1.5; }
      else { jv = -s * (1.5 + Math.random() * 1.5); ju = -Math.min(Math.max(0, su - 3), 1 + Math.random()); }
      return [ju, jv, false];
    }
    if (beyond && Math.random() < 0.35) {
      // a v-cut: a dip toward the rim, then back out behind the line
      const du = 5.25 - su, dv = 25 - sv, dl = Math.hypot(du, dv) || 1, k = 2.5 + Math.random() * 1.2;
      return [du / dl * k, dv / dl * k, true];
    }
    if (beyond) {
      // a slide along the arc; in the corner a lift up the sideline (the "shake") or back down
      const k = 2 + Math.random() * 1.8;
      if (su < 14) ju = su < 6 || Math.random() < 0.6 ? Math.min(k, 12 - su) : -Math.min(k, su - 2.5);
      else { const s = Math.random() < 0.5 ? 1 : -1, du = su - 5.25, dv = sv - 25, dl = Math.hypot(du, dv) || 1; ju = -dv / dl * s * k; jv = du / dl * s * k; }
      // (it ends behind the line)
      if (!this.beyondArc(su + ju, sv + jv, 0.8)) {
        const t = this.threeLine(), tu = su + ju, tv = sv + jv;
        if (tu < 14) jv = 25 + Math.sign(tv - 25 || sv - 25 || 1) * (t.corner + 1) - sv;
        else { const du = tu - 5.25, dv = tv - 25, dl = Math.hypot(du, dv) || 1, R = t.arc + 1.2; ju = 5.25 + du / dl * R - su; jv = 25 + dv / dl * R - sv; }
      }
      return [ju, jv, false];
    }
    // anywhere else (an elbow, a slot inside the line): a step or two around the spot
    const ang = Math.random() * Math.PI * 2, k = 1.4 + Math.random() * 1.4;
    return [Math.cos(ang) * k, Math.sin(ang) * k, false];
  };
  /** the handler sizes up his man at his spot instead of probing a gap (his drives come with the play's moves) */
  P.flowHandler = function (a, r) {
    if (this.pbRun && r && r.pb) { r.probe = null; return false; }
    return base.flowHandler.call(this, a, r);
  };

  // ------------------------------------------------------------ inbound plays
  P.p_inbound = function (ev, beat, gap) {
    this.pbEnd();
    const need = base.p_inbound.call(this, ev, beat, gap);
    const pb = ev.pb;
    if (!pb || !pb.seq) return need;
    const by = beat.by || this.A(ev.by), to = this.A(ev.to);
    // the play takes its steps while the ball is dead, then the throw-in; first everyone gets to the alignment
    const seqDur = pb.seq.reduce((s, st) => s + st.d * 0.9, 0);
    let far = 0;
    for (const id in pb.align) { const a = this.A(id); if (!a || a === by) continue; const sp = this.pbPt(pb.align[id]); far = Math.max(far, Math.hypot(sp.x - a.x, sp.y - a.y)); }
    const tAlign = far / 14 + 0.5;
    const onStart0 = beat.onStart;
    beat.onStart = (fireAt) => {
      if (onStart0) onStart0(fireAt);
      const run = this.pbRun = { id: pb.id, pb, ids: {}, t0: this.T, k: -1, inbound: true };
      // the alignment (everyone but the inbounder)
      for (const id in pb.align) {
        const a = this.A(id);
        if (!a || a === by) continue;
        run.ids[id] = 1;
        this.pbHold(id, this.pbPt(pb.align[id]), Math.max(0.5, fireAt - seqDur - this.T), true);
      }
      // the steps: moves and screens, the last one timed to the throw-in
      let t = fireAt - seqDur;
      pb.seq.forEach((st, k) => {
        const tk = t;
        this.at(Math.max(this.T + 0.1, tk), () => {
          if (this.pbRun !== run) return;
          run.k = k;
          const users = {};
          for (const s of st.scr || []) {
            users[s[1]] = 1;
            const sa = this.A(s[0]), ua = this.A(s[1]), dest = st.pos[s[1]] ? this.pbPt(st.pos[s[1]]) : null;
            if (!sa || !ua) continue;
            const ud = this.guardOf(ua.id);
            const from = ud && Math.hypot(ud.x - ua.x, ud.y - ua.y) < 9 ? ud : ua;
            const dx = dest ? dest.x - ua.x : 0, dy = dest ? dest.y - ua.y : 0, dl = Math.hypot(dx, dy) || 1;
            const sp = this.clampCourt({ x: from.x + dx / dl * 2.2, y: from.y + dy / dl * 2.2 }, 2);
            const rs = this.role[sa.id]; if (rs) rs.until = this.T + st.d * 0.9 + 0.3;
            sa.moveTo(sp.x, sp.y, { speed: 14, face: { x: ua.x, y: ua.y }, stance: 'screen', by: this.T + st.d * 0.45 });
            if (dest) {
              const ru = this.role[ua.id]; if (ru) { ru.spot = dest; ru.spotName = 'play'; ru.pb = true; ru.until = this.T + st.d * 0.9 + 0.4; }
              this.at(this.T + st.d * 0.45, () => { if (this.pbRun === run) ua.moveTo(dest.x, dest.y, { speed: 18, face: 'move' }); }, 'inbound play cut');
            }
          }
          for (const id in st.pos) {
            if (users[id]) continue;
            const a = this.A(id);
            if (!a || a === by) continue;
            this.pbHold(id, this.pbPt(st.pos[id]), st.d * 0.9, true);
          }
        }, 'inbound play step');
        t += st.d * 0.9;
      });
      // the receiver comes to the ball at the end of the play from his spot in it (not the generic step back)
      if (to && to !== by) {
        const last = pb.seq.length ? pb.seq[pb.seq.length - 1].pos[to.id] : null;
        const sp = this.pbPt(last || pb.align[to.id] || [this.U_(to.x), to.y]);
        const rt = this.role[to.id]; if (rt) { rt.spot = sp; rt.pb = true; }
        this.at(Math.max(this.T + 0.1, fireAt - seqDur), () => { if (!last) to.moveTo(sp.x, sp.y, { speed: 12, face: 'move' }); }, 'inbound receiver');
      }
    };
    return Math.max(need, tAlign) + seqDur + 0.5;
  };
})();
