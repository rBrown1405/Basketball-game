/* Pro BBALL Coach — match view: the called play on the court (extends PBC.Match.Director, after offense.js).
 * The engine calls a play from the team's playbook (js/core/playbook.js, playcall.js) and sends it with the
 * possession: the call ('set': the play, who fills each role, the alignment, the pick-and-roll coverage the defense
 * plays, the read it will take), then each step ('step': where the other roles go, who comes off a screen), the
 * screens, passes, hand-offs and moves, and the read at the end. Here:
 *  - at the call the five go to the play's alignment and stay out of the half-court flow (no swings, cuts or
 *    relocations of their own) until the play is over;
 *  - each step moves the players it names to their spots; a player coming off an off-ball screen waits for it and
 *    runs off it (choreo.js p_screen), the screener goes back to his spot in the play;
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
  const base = { start: P.start, p_set: P.p_set, p_inbound: P.p_inbound, fire: P.fire, flowBall: P.flowBall, finish: P.finish, flowFree: P.flowFree, flowHandler: P.flowHandler };

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
      r.pb = false; r.pbDest = null;
      if (r.next > this.T + 1) r.next = this.T + 0.4 + Math.random() * 0.8;
    }
  };

  /** put a player on his spot in the play and keep the flow's own actions off him until the play is over */
  P.pbHold = function (id, spot, hold) {
    const a = this.A(id), r = this.role[id];
    if (!a || !r) return;
    r.spot = spot; r.spotName = 'play'; r.path = null; r.jx = 0; r.jy = 0; r.pb = true;
    r.next = this.T + 60;
    if (hold) r.until = Math.max(r.until || 0, this.T + hold);
    if (this.v.ball.holder === a || a.isBusy()) return;
    const d = Math.hypot(spot.x - a.x, spot.y - a.y);
    const b = this.v.ball;
    a.moveTo(spot.x, spot.y, { speed: d > 16 ? 16 : d > 6 ? 12 : 7, face: d > 3 ? 'move' : { x: b.x, y: b.y }, stance: d > 5 ? 'stand' : 'ready' });
  };

  // ------------------------------------------------------------ the call
  P.p_set = function (ev, beat, gap) {
    if (!ev.pb) { this.pbEnd(); return base.p_set.call(this, ev, beat, gap); }
    const pb = ev.pb;
    beat.onStart = () => {
      this.pbEnd();
      this.tempo = 'normal';
      const run = this.pbRun = { id: pb.id, pb, ids: {}, t0: this.T, k: -1 };
      const b = this.v.ball, h = b.holder;
      for (const id in pb.align) {
        run.ids[id] = 1;
        const a = this.A(id);
        if (!a) continue;
        const sp = this.pbPt(pb.align[id]);
        if (a === h) {
          // the handler dribbles into his spot for the play
          const r = this.role[id];
          if (r) { r.spot = sp; r.spotName = 'play'; r.pb = true; r.next = this.T + 60; r.until = this.T + 1.2; }
          if (!a.isBusy() && Math.hypot(sp.x - a.x, sp.y - a.y) > 2) {
            if (b.state !== 'dribble') b.dribble(a);
            a.moveTo(sp.x, sp.y, { speed: 9, face: 'move', stance: 'dribble' });
          }
        } else this.pbHold(id, sp, 1.1);
      }
    };
    return 0.3;
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
        if (users[id]) { r.pbDest = sp; r.pb = true; r.next = this.T + 60; continue; }
        // (a screener in this step sets his screen first, then goes there)
        if (screeners[id]) { r.spot = sp; r.spotName = 'play'; r.pb = true; r.next = this.T + 60; continue; }
        // (the ball handler goes with his own moves and passes)
        if (a === h) { r.spot = sp; continue; }
        this.pbHold(id, sp, 0.9);
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
        this.pbHold(id, this.pbPt(pb.align[id]), Math.max(0.5, fireAt - seqDur - this.T));
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
            this.pbHold(id, this.pbPt(st.pos[id]), st.d * 0.9);
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
