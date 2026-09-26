/* Pro BBALL Coach — match view: possession choreography (PBC.Match.Director).
 * Turns the engine's event list into believable basketball:
 *  - every event becomes a "beat" whose visible moment (fire) is scheduled in presentation time;
 *    planners look ahead and plan backwards (shooter at the shot spot at release, receiver at the
 *    catch spot when the pass arrives, rebounder at the carom apex...);
 *  - the game clock is interpolated between event times (stretching slightly when the motion
 *    needs longer), dead balls insert presentation time without running the clock;
 *  - off-ball offense keeps moving to play spots, defense tracks man/zone positions, refs follow;
 *  - every possession ends with onDone, even for odd or broken sequences (watchdog + fallbacks). */
(function () {
  'use strict';
  const M = window.PBC.Match, U = M.U;
  const PASS_SPEED = { chest: 38, bounce: 30, overhead: 40, outlet: 44, entry: 32, kick: 40, swing: 36, lob: 30, alley: 30 };
  const PASS_CLIP = { chest: 'passChest', bounce: 'passBounce', overhead: 'passOverhead', outlet: 'passOutlet', entry: 'passBounce', kick: 'passPush', swing: 'passChest', lob: 'passLob', alley: 'passLob' };
  const SHOT_CLIP = { dunk: 'dunk', layup: 'layup', reverse: 'reverse', floater: 'floater', hook: 'hook', jumper: 'jumpshot', pullup: 'pullup', stepback: 'stepback', fadeaway: 'fadeaway', tip: 'tip', alley: 'alley', catch_shoot: 'jumpshot' };
  const RIM_SHOTS = { dunk: 1, layup: 1, reverse: 1, alley: 1, tip: 1 };

  class Director {
    constructor(view) {
      this.v = view;
      this.active = false;
      this.T = 0; this.g = 0;
      this.jobs = [];
      this.beat = null;
      this.frozen = false;
      this.role = {};
      this.dtask = {};
      this.matchup = {};
      this.poss = null;
      this.cb = null;
      this.idleMode = 'none';
      this.sc0 = 24; this.scT = 0;
      this.lastClock = 720;
      this.jiggleSeed = 1;
    }

    // ============================================================ public
    start(poss, cb) {
      const v = this.v;
      this.poss = poss; this.cb = cb || {};
      this.events = Array.isArray(poss.events) ? poss.events : [];
      this.ei = 0; this.T = v.time; this.T0 = v.time; this.g = 0; this.jobs = []; this.beat = null; this.wrap = null;
      this.done = false; this.frozen = false; this.resumeReq = false;
      this.active = true;
      this.off = poss.off === 1 ? 1 : 0; this.def = 1 - this.off;
      this.period = poss.period || 1;
      this.dir = v.attacksRight(this.off, this.period) ? 1 : -1;
      this.hoop = v.hoops[this.dir > 0 ? 1 : 0];
      this.rim = { x: this.hoop.rx, y: 25 };
      this.scheme = poss.defScheme || v.defScheme[this.def] || 'man';
      this.play = poss.play || 'none';
      this.clockStart = +poss.clockStart || 0;
      this.clockEnd = poss.clockEnd == null ? Math.max(0, this.clockStart - this.maxEventT()) : +poss.clockEnd;
      this.sc0 = 24; this.scT = 0; this.shotClockOn = true;
      this.lastShot = null; this.pendingRebound = null; this.madeShot = null;
      this.swing = null; this._soonAt = -1; this._driveReactT = 0; this._swingCheck = 0;
      this.watch = this.T0 + this.maxEventT() * 2 + 60;
      this.phase = 'start';
      this.tempo = this.play === 'transition' ? 'push' : 'normal';
      this.role = {}; this.dtask = {};
      this.setupMatchups();
      for (const id of v.onCourt[this.off]) this.role[id] = { mode: 'spot', spot: null, jx: 0, jy: 0, next: 0 };
      this.assignSpots(this.play === 'transition' ? 'transition' : 'advance');
      // live-ball starts: make sure the ball is with the right player
      if (poss.start === 'dreb' || poss.start === 'steal') {
        const h = v.ball.holder;
        if (!h || h.team !== this.off) {
          const first = this.events.find((e) => e.handler || e.from || e.player || e.shooter);
          const cand = first ? v.actor(first.handler || first.from || first.player || first.shooter) : null;
          const pick = cand && cand.team === this.off ? cand : this.nearestTo(this.off, v.ball.x, v.ball.y);
          if (pick) this.giveBall(pick, 'chest');
        }
      }
      v.arena.setState({ homeDefense: this.def === 0 });
      this.defenseOn();
      this.nextBeat();
    }
    resume() {
      if (this.frozen) { this.resumeReq = true; return; }
      this.resumeReq = true; // resolved early: won't freeze
    }
    isIdle() { return !this.active; }
    clock() {
      if (!this.active) return this.lastClock;
      return Math.max(0, this.clockStart - this.g);
    }
    shotClock() {
      if (!this.active) return this.lastShotClock == null ? 24 : this.lastShotClock;
      return U.clamp(this.sc0 - (this.g - this.scT), 0, 24);
    }
    maxEventT() { let m = 0; for (const e of this.events || []) if (e && e.t > m) m = e.t; return m; }

    // ============================================================ time / beats
    at(t, fn, tag) { this.jobs.push({ t, fn, tag }); }
    runJobs() {
      if (!this.jobs.length) return;
      // run in time order; jobs may add jobs
      for (let guard = 0; guard < 50; guard++) {
        let best = -1;
        for (let i = 0; i < this.jobs.length; i++) if (this.jobs[i].t <= this.T && (best < 0 || this.jobs[i].t < this.jobs[best].t)) best = i;
        if (best < 0) return;
        const j = this.jobs.splice(best, 1)[0];
        U.safe(j.fn, this, 'job ' + (j.tag || ''));
      }
    }
    update(dt) {
      if (!this.active) { this.idleUpdate(dt); return; }
      if (this.frozen) {
        if (this.resumeReq) this.unfreeze();
        else return;
      }
      this.T = this.v.time;
      // game clock interpolation
      const b = this.beat;
      if (b && b.clockRuns && !b.fired) {
        const u = U.clamp((this.T - b.t0) / Math.max(0.001, b.fireAt - b.t0), 0, 1);
        this.g = Math.max(this.g, b.g0 + (b.g1 - b.g0) * u);
      } else if (this.wrap && this.wrap.clockRuns) {
        const u = U.clamp((this.T - this.wrap.t0) / Math.max(0.001, this.wrap.dur), 0, 1);
        this.g = Math.max(this.g, this.wrap.g0 + (this.wrap.g1 - this.wrap.g0) * u);
      }
      this.runJobs();
      for (let guard = 0; guard < 20 && this.active && !this.frozen; guard++) {
        const bb = this.beat;
        if (bb && !bb.fired && this.T >= bb.fireAt && (!bb.waitFor || bb.waitFor() || this.T > bb.fireAt + 3)) {
          this.fire(bb);
          continue;
        }
        if (!this.beat && !this.wrap) { this.nextBeat(); continue; }
        break;
      }
      if (this.frozen) return;
      if (this.wrap && this.T >= this.wrap.t0 + this.wrap.dur && (!this.wrap.waitFor || this.wrap.waitFor() || this.T > this.wrap.t0 + this.wrap.dur + 4)) this.finish();
      U.safe(() => this.ambient(dt), this, 'ambient');
      if (this.T > this.watch && this.active) { U.warn('possession watchdog', this.poss && this.poss.n); this.forceFinish(); }
    }

    nextBeat() {
      if (this.ei >= this.events.length) { this.startWrap(); return; }
      const ev = this.events[this.ei++];
      if (!ev || typeof ev !== 'object') { this.beat = null; return; }
      const beat = { ev, type: ev.type, t0: this.T, g0: this.g, g1: Math.max(this.g, +ev.t || 0), fired: false };
      const gap = Math.max(0, beat.g1 - beat.g0);
      let need = 0.05;
      const fn = this['p_' + ev.type];
      if (fn) {
        try { const r = fn.call(this, ev, beat, gap); if (typeof r === 'number' && isFinite(r)) need = r; }
        catch (e) { U.warn('planner ' + ev.type, e); need = 0.05; beat.onStart = null; beat.onFire = null; beat.broken = true; }
      }
      beat.clockRuns = gap > 0.0005 && !beat.dead;
      const dur = Math.max(need, beat.clockRuns ? gap : 0);
      beat.fireAt = this.T + Math.min(dur, beat.maxDur || 30);
      this.beat = beat;
      if (beat.onStart) U.safe(() => beat.onStart(beat.fireAt), this, 'onStart ' + ev.type);
    }
    fire(beat) {
      beat.fired = true;
      this.g = Math.max(this.g, beat.g1);
      if (beat.onFire) U.safe(() => beat.onFire(), this, 'onFire ' + beat.type);
      if (!beat.noEmit) this.emit(beat.ev);
      if (this.beat === beat) this.beat = null;
    }
    emit(ev) {
      if (!ev || ev._emitted) return;
      ev._emitted = true;
      if (this.cb.onEvent) U.safe(() => this.cb.onEvent(ev), null, 'onEvent');
      this.v.onEmit(ev);
    }
    startWrap() {
      // presentation after the last event until the next offense has the ball
      const last = this.events[this.events.length - 1];
      const endG = Math.max(this.g, this.clockStart - this.clockEnd);
      const w = { t0: this.T, dur: 0.6, g0: this.g, g1: endG, clockRuns: endG > this.g + 0.001, waitFor: null };
      if (last) {
        if (last.type === 'shot' && last.made) { w.dur = 1.1; w.waitFor = () => this.scored; this.transitionAfterMake(); }
        else if (last.type === 'shot' && last.pending) { w.dur = 0.5; }
        else if (last.type === 'shot' && !last.made) { w.dur = 1.4; }
        else if (last.type === 'ft' && last.made) { w.dur = 1.0; this.transitionAfterMake(); }
        else if (last.type === 'rebound' && !last.off && last.player != null) w.dur = 0.5;
        else if (last.type === 'turnover' && last.stealer) w.dur = 0.5;
        else if (last.type === 'turnover' || last.type === 'foul' || (last.type === 'rebound' && last.player == null)) w.dur = 1.3;
        else if (last.type === 'period_end') w.dur = 1.8;
      }
      this.wrap = w;
    }
    finish() {
      if (!this.active) return;
      this.g = Math.max(this.g, this.clockStart - this.clockEnd);
      this.lastClock = Math.max(0, this.clockStart - this.g);
      this.lastShotClock = this.shotClock();
      // flush unemitted events (robustness)
      for (let i = 0; i < this.events.length; i++) {
        const e = this.events[i];
        if (e && !e._emitted && !(e.type === 'shot' && e.pending && e.made === undefined)) this.emit(e);
      }
      this.active = false; this.wrap = null; this.beat = null; this.jobs = [];
      this.idleMode = 'post';
      this.v.onPossessionDone(this.poss);
      const cb = this.cb;
      this.cb = {};
      if (cb.onDone) U.safe(() => cb.onDone(), null, 'onDone');
    }
    forceFinish() {
      this.frozen = false;
      // emit a score event if a made shot was not reported yet
      if (this.madeShot && !this.scored) this.reportScore(this.madeShot);
      this.finish();
    }

    /** 0 in a regular-season game, up to ~1.25 in a Game 7: players go harder, defense locks in */
    /** how hard the players go (the engine's playoff intensity when given, so the Playoff Intensity slider shows) */
    intensity() { const a = this.v.atm; if (!a || !a.playoff) return 0; return U.clamp(a.effort != null && isFinite(a.effort) ? +a.effort : +a.level || 0.6, 0, 1.25); }

    // ============================================================ geometry helpers
    X(u) { return this.dir > 0 ? 94 - u : u; }
    U_(x) { return this.dir > 0 ? 94 - x : x; }
    P(u, v) { return { x: this.X(u), y: v }; }
    rimAngleFrom(x, y) { return Math.atan2(this.rim.y - y, this.rim.x - x); }
    A(id) { return this.v.actor(id); }
    offActors() { return this.v.onCourt[this.off].map((id) => this.v.actor(id)).filter(Boolean); }
    defActors() { return this.v.onCourt[this.def].map((id) => this.v.actor(id)).filter(Boolean); }
    nearestTo(team, x, y, exclude) {
      let best = null, bd = 1e9;
      for (const id of this.v.onCourt[team]) {
        const a = this.v.actor(id);
        if (!a || a === exclude) continue;
        const d = Math.hypot(a.x - x, a.y - y);
        if (d < bd) { bd = d; best = a; }
      }
      return best;
    }
    clampCourt(p, m) { m = m == null ? 1 : m; p.x = U.clamp(p.x, m, 94 - m); p.y = U.clamp(p.y, m, 50 - m); return p; }

    setupMatchups() {
      const offs = this.v.onCourt[this.off], defs = this.v.onCourt[this.def];
      this.matchup = {};
      for (let i = 0; i < defs.length; i++) this.matchup[defs[i]] = offs[i] != null ? offs[i] : offs[0];
    }
    guardOf(offId) {
      for (const d in this.matchup) if (this.matchup[d] === offId) return this.v.actor(d);
      return null;
    }

    // ============================================================ spots / formations
    spotTable() {
      return {
        top: [29, 25], topL: [28, 20], topR: [28, 30], slotN: [26, 15], slotF: [26, 35],
        wingN: [21, 6.5], wingF: [21, 43.5], cornerN: [2.5, 2.5], cornerF: [2.5, 47.5],
        blockN: [7, 16.5], blockF: [7, 33.5], elbowN: [19, 17.5], elbowF: [19, 32.5], high: [18, 25],
        shortN: [5, 10], shortF: [5, 40], dunkerN: [3, 14.5], dunkerF: [3, 35.5],
      };
    }
    spotPt(name) { const s = this.spotTable()[name] || [25, 25]; return this.P(s[0], s[1]); }
    assignSpots(kind, ev) {
      const offs = this.v.onCourt[this.off];
      const handlerId = this.handlerId();
      let order;
      switch (kind) {
        case 'transition': order = ['top', 'cornerN', 'cornerF', 'blockF', 'slotF']; break;
        case 'advance': order = ['top', 'wingN', 'wingF', 'cornerF', 'dunkerN']; break;
        case 'pnr': order = ['top', 'cornerN', 'wingF', 'cornerF', 'elbowN']; break;
        case 'iso': order = ['wingN', 'cornerF', 'wingF', 'top', 'dunkerF']; break;
        case 'post': order = ['wingN', 'top', 'cornerF', 'wingF', 'blockN']; break;
        case 'spot': order = ['top', 'wingN', 'wingF', 'cornerN', 'cornerF']; break;
        case 'offscreen': order = ['top', 'blockN', 'wingF', 'cornerF', 'elbowN']; break;
        case 'handoff': order = ['wingN', 'cornerN', 'cornerF', 'wingF', 'high']; break;
        case 'cut': order = ['top', 'wingN', 'wingF', 'cornerF', 'high']; break;
        default: order = ['top', 'wingN', 'wingF', 'cornerN', 'dunkerF'];
      }
      // handler gets the first spot; bigs (C/PF, idx 3-4) prefer the last spot
      const list = offs.slice();
      const assigned = {};
      const rest = [];
      if (handlerId && list.includes(handlerId)) assigned[handlerId] = order[0];
      let oi = 1;
      const byBig = list.filter((id) => id !== handlerId).sort((a, b) => this.bigness(a) - this.bigness(b));
      for (const id of byBig) { if (oi < order.length) assigned[id] = order[oi++]; else rest.push(id); }
      // special roles (the player who had that spot takes the other's, so no two players share a spot)
      if (ev) {
        if (ev.screener && assigned[ev.screener] && kind === 'pnr') {
          const had = Object.keys(assigned).find((id) => assigned[id] === 'elbowN');
          if (had != null && had !== String(ev.screener)) assigned[had] = assigned[ev.screener];
          assigned[ev.screener] = 'elbowN';
        }
      }
      for (const id of offs) {
        const r = this.role[id] || (this.role[id] = { mode: 'spot', jx: 0, jy: 0, next: 0 });
        r.path = null; r.pathSpot = null; r.probe = null;
        r.spotName = assigned[id] || 'top';
        r.spot = this.spotPt(r.spotName);
        if (r.mode !== 'locked') r.mode = 'spot';
      }
    }
    /** move player `id` to the named spot; whoever stood there takes his old one */
    giveSpot(id, name) {
      const r = this.role[id];
      if (!r) return;
      for (const o of this.v.onCourt[this.off]) {
        const ro = this.role[o];
        if (String(o) !== String(id) && ro && ro.spotName === name) { ro.spotName = r.spotName; ro.spot = this.spotPt(r.spotName); ro.path = null; ro.pathSpot = null; }
      }
      r.spotName = name; r.spot = this.spotPt(name);
    }
    bigness(id) { const p = this.v.look(id); return p ? (+p.height || 78) : 78; }
    handlerId() { const h = this.v.ball.holder; return h && h.team === this.off ? h.id : null; }

    // ============================================================ ball helpers
    giveBall(actor, hold) {
      const b = this.v.ball;
      if (!actor) return;
      b.give(actor, hold || 'chest');
      if (actor.team === this.off && this.role[actor.id]) this.role[actor.id].hasBall = true;
    }
    /** ensure `actor` has the ball; returns extra presentation time needed (implicit pass) */
    ensureBall(actor, allowFlight) {
      const b = this.v.ball;
      if (!actor) return 0;
      if (b.holder === actor) return 0;
      if (allowFlight && b.state === 'flight' && b.passTarget === actor) return Math.max(0, b.flightEnd() - b.time);
      // a pass is still in the air: let it be caught, then move it on (never re-route the ball mid-flight)
      if (b.state === 'flight' && b.passTarget && b.passTarget !== actor && b.passTarget.team === actor.team) {
        const left = Math.max(0, b.flightEnd() - b.time) + 0.2;
        const via = b.passTarget;
        const dur = U.clamp(Math.hypot(actor.x - via.x, actor.y - via.y) / 36, 0.25, 1.2);
        this.at(this.T + left, () => {
          if (b.holder === actor) return;
          if (b.holder && b.holder.team === actor.team && !b.holder.isBusy()) this.passBall(b.holder, actor, 'chest', dur, null);
          else if (!(b.state === 'flight' && b.passTarget === actor)) this.giveBall(actor, 'chest');
        }, 'relay pass');
        return left + dur + 0.05;
      }
      if (b.state === 'flight' && b.passTarget === actor) return Math.max(0, b.flightEnd() - b.time);
      const h = b.holder;
      if (h && h !== actor && h.team === actor.team && h.isBusy() && h.clip) {
        // the holder is still finishing an action (landing, a catch): pass it as soon as he's free
        const left = Math.max(0.1, (h.clip.clip.dur - h.clip.t) / (h.clip.speed || 1) - 0.1);
        const dur = U.clamp(Math.hypot(actor.x - h.x, actor.y - h.y) / 36, 0.25, 1.2);
        this.at(this.T + left, () => {
          if (b.holder === actor) return;
          if (b.holder === h) { if (h.isBusy()) h.stopClip(); this.passBall(h, actor, 'chest', dur, null); }
          else if (!(b.state === 'flight' && b.passTarget === actor)) this.giveBall(actor, 'chest');
        }, 'pass when free');
        return left + dur + 0.05;
      }
      if (h && h.team === actor.team && !h.isBusy()) {
        // implicit quick pass
        const d = Math.hypot(actor.x - h.x, actor.y - h.y);
        const dur = U.clamp(d / 36, 0.25, 1.2);
        this.passBall(h, actor, 'chest', dur, null);
        return dur + 0.05;
      }
      // teleport-safe fallback: hand it over
      this.giveBall(actor, 'chest');
      return 0.1;
    }
    passBall(from, to, kind, dur, onCatch) {
      const b = this.v.ball;
      const tgt = () => { const p = to.heldBallPos(TMPA); return [p[0], p[1], p[2]]; };
      if (b.holder !== from) b.give(from, 'chest');
      const p1 = tgt();
      // lead the receiver: aim at the predicted position
      p1[0] += to.vx * dur * 0.9; p1[1] += to.vy * dur * 0.9;
      b.pass(p1, dur, { bounce: kind === 'bounce' || kind === 'entry', lob: kind === 'lob' || kind === 'alley', flat: kind === 'outlet' || kind === 'overhead', target: tgt, onArrive: () => {
        if (to.isBusy() && to.clip && to.clip.clip.name === 'alley') { b.give(to); if (onCatch) onCatch(); return; }
        b.give(to, 'chest');
        to.lookAt(null);
        if (onCatch) onCatch();
      } });
      b.passTarget = to;
      to.lookAt({ x: from.x, y: from.y });
      if (!to.isBusy()) {
        const t0 = this.T + dur - 0.22;
        this.at(t0, () => { if (!to.isBusy() && b.passTarget === to) to.play('catch', { mirror: false }); }, 'catch');
      }
    }

    // ============================================================ ambient behaviour
    ambient(dt) {
      const v = this.v, b = v.ball;
      const T = this.T;
      // offense
      const flow = this.flowOK ? this.flowOK() : false;
      if (flow) { this.flowBall(); this.flowDriveReact(); }
      for (const a of this.offActors()) {
        const r = this.role[a.id];
        if (!r || a.isBusy()) continue;
        if (r.mode === 'locked' || r.until > T) { r.path = null; continue; }
        if (b.holder === a) { r.path = null; if (flow && this.flowHandler(a, r)) continue; r.probe = null; this.handlerAmbient(a, r, dt); continue; }
        if (!r.spot) r.spot = this.spotPt('top');
        // half-court flow: scripted actions (screens, cuts, relocations) take over the player while they run
        if (r.path) { if (flow && this.flowPath(a, r)) continue; r.path = null; }
        if (T > r.next) {
          if (flow) this.flowOffBall(a, r); else this.offBallAction(a, r);
          if (r.path && this.flowPath(a, r)) continue;
        }
        // targets always stay in bounds (corners included)
        let tx = this.X(U.clamp(this.U_(r.spot.x + r.jx), 2.2, 91.8)), ty = U.clamp(r.spot.y + r.jy, 2.2, 47.8);
        // keep the floor spaced: drift away from a teammate who is too close (NBA spacing ~14 ft)
        if (flow) {
          let px = 0, py = 0;
          for (const o of this.offActors()) {
            if (o === a) continue;
            const ro = this.role[o.id];
            const ox = ro && ro.path && ro.pathSpot ? ro.pathSpot.x : o.x, oy = ro && ro.path && ro.pathSpot ? ro.pathSpot.y : o.y;
            const dx = tx - ox, dy = ty - oy, dd = Math.hypot(dx, dy);
            if (dd < 14 && dd > 0.01) { const k = (14 - dd) * 0.7; px += dx / dd * k; py += dy / dd * k; }
          }
          if (px || py) {
            const nu = U.clamp(this.U_(tx + px), 2.2, 30), nv = U.clamp(ty + py, 2.5, 47.5);
            tx = this.X(nu); ty = nv;
          }
        }
        // never crowd the ball: an off-ball spot whose target sits on top of the handler moves out to ~14 ft
        // (a pick-and-roll brings four players together; a fifth or sixth body there is broken spacing)
        const bh = b.holder;
        if (bh && bh !== a && bh.team === this.off && this.phase === 'front' && this.tempo !== 'push' && this.U_(bh.x) < 40) {
          let dx = tx - bh.x, dy = ty - bh.y, dd = Math.hypot(dx, dy);
          if (dd < 12) {
            if (dd < 0.5) { dx = a.x - bh.x; dy = a.y - bh.y; dd = Math.hypot(dx, dy); }
            if (dd < 0.5) { dx = this.X(this.U_(bh.x) + 1) - bh.x; dy = bh.y < 25 ? 1 : -1; dd = Math.hypot(dx, dy); }
            const nu = U.clamp(this.U_(bh.x + dx / dd * 14), 2.2, 32), nv = U.clamp(bh.y + dy / dd * 14, 2.5, 47.5);
            tx = this.X(nu); ty = nv;
          }
        }
        // up the floor (a fast break or a walked-up ball alike) the offense fills the lanes: the players headed for
        // the wings and corners run wide along the sidelines ahead of the ball, the rim runner takes the middle
        // to the basket, the trailer comes up behind the ball; each peels off to his half-court spot once level
        // with it (instead of the whole team jogging up the floor in one pack)
        let lane = false;
        if (this.tempo === 'push' || this.phase === 'start') {
          const u = this.U_(a.x), su = this.U_(r.spot.x), bu = this.U_(b.x);
          const sn = r.spotName || '', far = sn.slice(-1) === 'F';
          if (u > su + 10) {
            lane = true;
            if (sn.indexOf('corner') === 0 || sn.indexOf('wing') === 0) { tx = this.X(Math.max(su, u - 16)); ty = far ? 45.5 : 4.5; }
            else if (sn.indexOf('dunker') === 0 || sn.indexOf('block') === 0 || sn.indexOf('short') === 0) { tx = this.X(Math.max(su, u - 18)); ty = U.lerp(a.y, far ? 31 : 19, 0.35); }
            else { tx = this.X(Math.max(su, Math.min(u, Math.max(bu + 7, u - 14)))); ty = U.lerp(a.y, r.spot.y, 0.3); } // (never back up)
            tx = this.X(U.clamp(this.U_(tx), 2.2, 91.8));
          }
          // (behind the ball or still in the backcourt: run to get ahead of it)
          if (lane && (u > bu - 4 || u > 47)) lane = 'run';
        }
        const d = Math.hypot(tx - a.x, ty - a.y);
        const eff = 1 + this.intensity() * 0.14;
        const sp = this.tempo === 'push' ? a.maxSpeed * Math.min(1, 0.95 * eff) : lane === 'run' ? Math.min(a.maxSpeed * 0.8, 19) * eff : lane ? 14 * eff : (d > 14 ? 12 : d > 4 ? 8 : 5) * eff;
        a.moveTo(tx, ty, { speed: sp, face: d > 3 ? 'move' : { x: b.x, y: b.y }, stance: d > 5 ? 'stand' : 'ready' });
        a.lookAt({ x: b.x, y: b.y });
      }
      // defense: set tracking once, per-defender overrides
      for (const a of this.defActors()) {
        const t = this.dtask[a.id];
        if (a.isBusy()) continue;
        if (t && t.until > T) continue;
        if (a.goal.mode !== 'track' || a._trackOwner !== this) this.trackDefender(a);
      }
      // ball holder dribbles when moving
      if (b.holder && b.state === 'held' && !b.holder.isBusy() && b.holder.speed > 1.8 && b.holder.team === this.off) b.dribble(b.holder);
      // camera focus
      v.focus = { x: b.x, vx: b.vx };
    }
    /** pick the next off-ball action: v-cut, lift/drift toward the ball side, relocation, or a short hold */
    offBallAction(a, r) {
      const T = this.T, b = this.v.ball;
      if (this.tempo === 'push') { r.jx = (Math.random() - 0.5) * 2; r.jy = (Math.random() - 0.5) * 2; r.next = T + 1.2 + Math.random(); return; }
      const su = this.U_(r.spot.x), sv = r.spot.y;
      const roll = Math.random();
      const big = a.H > 6.75 && su < 12;
      if (r.phase === 'out') {
        // come back out to the spot (v-cut return / pop)
        r.jx = (Math.random() - 0.5) * 1.5; r.jy = (Math.random() - 0.5) * 1.5; r.phase = null;
        r.next = T + 0.9 + Math.random() * 1.4;
        return;
      }
      if (big) {
        // bigs: duck in toward the middle, drift to the short corner, or flash to the high post
        if (roll < 0.4) {
          r.jx = this.X(su + (Math.random() - 0.5) * 1.5) - r.spot.x; r.jy = (25 - sv) * (0.3 + Math.random() * 0.2);
        } else if (roll < 0.7) {
          r.jx = this.X(Math.max(3, su - 2.5)) - r.spot.x; r.jy = (sv < 25 ? -1 : 1) * (2.5 + Math.random() * 2.5);
        } else {
          r.jx = this.X(su + 6 + Math.random() * 4) - r.spot.x; r.jy = (25 - sv) * 0.35 + (b.y < 25 ? -1 : 1) * 2; r.phase = 'out';
        }
        r.next = T + 1.0 + Math.random() * 1.4;
        return;
      }
      if (roll < 0.4) {
        // v-cut: sink toward the basket then pop back out
        const dx = this.rim.x - r.spot.x, dy = this.rim.y - r.spot.y, dl = Math.hypot(dx, dy) || 1;
        const k = 4 + Math.random() * 3;
        r.jx = dx / dl * k; r.jy = dy / dl * k; r.phase = 'out';
        r.next = T + 0.7 + Math.random() * 0.4;
      } else if (roll < 0.7) {
        // lift / drift with the ball side
        const lift = su < 6 ? 8 : -3;
        r.jx = this.X(su + lift) - r.spot.x; r.jy = (b.y - sv) * 0.12 + (Math.random() - 0.5) * 3;
        r.next = T + 1.3 + Math.random() * 1.5;
      } else {
        // relocation along the arc / hold the spot ready to catch
        const ang = Math.random() * Math.PI * 2, k = 1.6 + Math.random() * 2.4;
        r.jx = Math.cos(ang) * k; r.jy = Math.sin(ang) * k;
        r.next = T + 0.9 + Math.random() * 1.4;
      }
    }
    /** release per-beat locks so nobody freezes after a dead ball / free throws */
    unlockAll(exceptIds) {
      for (const id in this.role) { if (exceptIds && exceptIds.indexOf(id) >= 0) continue; this.role[id].until = 0; }
      for (const id in this.dtask) { if (exceptIds && exceptIds.indexOf(id) >= 0) continue; this.dtask[id] = null; }
    }
    handlerAmbient(a, r, dt) {
      const b = this.v.ball;
      // wander near the handler spot while dribbling; face the basket
      if (!r.spot) r.spot = this.spotPt('top');
      if (this.T > r.next) { r.jx = (Math.random() - 0.5) * 6; r.jy = (Math.random() - 0.5) * 6; r.next = this.T + 1.5 + Math.random() * 1.5; }
      const tx = r.spot.x + r.jx, ty = U.clamp(r.spot.y + r.jy, 2, 48);
      const d = Math.hypot(tx - a.x, ty - a.y);
      a.moveTo(tx, ty, { speed: this.tempo === 'push' ? 20 : d > 8 ? 15 : 7, face: d > 6 ? 'move' : this.rim, stance: 'dribble' });
      if (b.state === 'held' && b.holder === a && (a.speed > 1 || Math.random() < 0.02)) b.dribble(a);
      a.lookAt(null);
    }
    trackDefender(a) {
      a._trackOwner = this;
      a.track(() => {
        const p = this.guardPos(a);
        // squared up a defender slides and backpedals (~13 ft/s at most); only once beaten (or sprinting back in
        // transition) does he turn and run
        a.goal.speed = a._dface && (a._dface.run || a._dface.back) ? a.maxSpeed : Math.min(a.maxSpeed, 13.5);
        return p;
      }, { speed: a.maxSpeed, stance: 'defense' });
      a.setFace((me) => this.defFacing(me));
      a.faceLock = true;
    }
    /**
     * Where a defender's chest points: always at his man (the ball handler squarely; off the ball mostly at
     * his man, opened a little toward the ball with the eyes on it). Zone defenders face the ball. Only a
     * defender who has been beaten (left well behind the spot he needs to be in) turns and runs to recover,
     * then squares up again.
     */
    defFacing(me) {
      const b = this.v.ball;
      const st = me._dface || (me._dface = { run: false, back: false });
      const lag = Math.hypot(me.goal.x - me.x, me.goal.y - me.y);
      if (!st.run && lag > 5 && me.speed > 9) st.run = true;
      else if (st.run && (lag < 2.2 || me.speed < 4)) st.run = false;
      const bx = b.holder ? b.holder.x : b.x, by = b.holder ? b.holder.y : b.y;
      // getting back in transition: sprint facing the basket he defends, eyes on the ball over the shoulder,
      // and square up to his man around the three-point line (nobody backpedals the length of the floor)
      const u = this.U_(me.x), toRim = Math.atan2(this.rim.y - me.y, this.rim.x - me.x);
      const headingHome = me.speed > 3 && Math.abs(U.wrapPi(Math.atan2(me.vy, me.vx) - toRim)) < 1.1;
      if (!st.back && this.phase === 'start' && u > 34 && me.speed > 8 && headingHome && Math.abs(me.goal.x - me.x) > 8) st.back = true;
      else if (st.back && (u < 29 || me.speed < 5 || this.phase !== 'start' || !headingHome)) st.back = false;
      if (st.back) { me.lookAt({ x: bx, y: by }); return Math.atan2(me.vy, me.vx); }
      if (st.run) return me.speed > 3 ? Math.atan2(me.vy, me.vx) : null;
      const zone = /zone|boxone/.test(this.scheme) && !(this.scheme === 'boxone' && this.v.onCourt[this.def].indexOf(me.id) === 0);
      const m = this.v.actor(this.matchup[me.id]);
      if (zone || !m) { me.lookAt(null); return Math.atan2(by - me.y, bx - me.x); }
      const toMan = Math.atan2(m.y - me.y, m.x - me.x);
      if (b.holder === m) { me.lookAt(null); return toMan; }
      me.lookAt({ x: bx, y: by });
      const toBall = Math.atan2(by - me.y, bx - me.x);
      return toMan + U.clamp(U.wrapPi(toBall - toMan) * 0.3, -0.55, 0.55);
    }
    guardPos(a) {
      const v = this.v, b = v.ball;
      const out = GP;
      const rim = this.rim;
      const bx = b.holder ? b.holder.x : b.x, by = b.holder ? b.holder.y : b.y;
      const scheme = this.scheme;
      const zone = scheme === 'zone23' || scheme === 'zone32' || scheme === 'zone131' || (scheme === 'boxone' && this.v.onCourt[this.def].indexOf(a.id) !== 0);
      // backcourt: sprint back unless pressing
      const ballU = this.U_(bx);
      if (zone && ballU < 40) {
        const zs = this.zoneSpot(a, bx, by);
        out.x = zs.x; out.y = zs.y; out.vx = 0; out.vy = 0;
        a.setStance(Math.hypot(bx - a.x, by - a.y) < 10 ? 'defense' : 'ready');
        return out;
      }
      const m = v.actor(this.matchup[a.id]);
      if (!m) { out.x = this.X(10); out.y = 25; out.vx = 0; out.vy = 0; return out; }
      const mu = this.U_(m.x);
      const hasBall = b.holder === m;
      let px, py;
      const hype = this.intensity();
      if (hasBall) {
        let gap = (scheme === 'pressure' ? 3.6 : scheme === 'packline' ? 5.6 : 4.6) - hype * 0.5;
        if (mu > 32 && scheme !== 'press') gap += U.clamp((mu - 32) * 0.35, 0, 8);
        const dx = rim.x - m.x, dy = rim.y - m.y, dl = Math.hypot(dx, dy) || 1;
        px = m.x + dx / dl * gap; py = m.y + dy / dl * gap;
        a.setStance(mu > 45 && scheme !== 'press' ? 'ready' : 'defense');
      } else {
        const dBall = Math.hypot(m.x - bx, m.y - by);
        let t = U.clamp(0.16 + dBall / 105, 0.16, 0.36);
        if (scheme === 'packline') t += 0.12;
        if (scheme === 'nothree' && mu > 21) t -= 0.1;
        px = m.x + (rim.x - m.x) * t; py = m.y + (rim.y - m.y) * t;
        const help = U.clamp((dBall - 14) / 30, 0, 0.4);
        px += (bx - px) * help * 0.3; py += (by - py) * help * 0.3;
        if (dBall < 21) { // deny one pass away
          const dx = bx - m.x, dy = by - m.y, dl = Math.hypot(dx, dy) || 1;
          px = U.lerp(px, m.x + dx / dl * 4.6, 0.38); py = U.lerp(py, m.y + dy / dl * 4.6, 0.38);
        }
        if (mu > 48 && scheme !== 'press') { px = this.X(Math.min(40, mu)); } // don't chase into the backcourt
        a.setStance(dBall < 18 + hype * 10 ? 'defense' : 'ready');
      }
      out.x = U.clamp(px, 0.5, 93.5); out.y = U.clamp(py, 0.5, 49.5);
      out.vx = m.vx * 0.6; out.vy = m.vy * 0.6;
      return out;
    }
    zoneSpot(a, bx, by) {
      const idx = Math.max(0, this.v.onCourt[this.def].indexOf(a.id));
      const tbl = {
        zone23: [[18, 17], [18, 33], [6, 9], [5, 25], [6, 41]],
        zone32: [[23, 25], [16, 10], [16, 40], [6, 18], [6, 32]],
        zone131: [[27, 25], [17, 8], [14, 25], [17, 42], [4, 25]],
        boxone: [[27, 25], [16, 17], [16, 33], [6, 17], [6, 33]],
      }[this.scheme] || [[18, 17], [18, 33], [6, 9], [5, 25], [6, 41]];
      const s = tbl[idx % tbl.length];
      const bu = this.U_(bx);
      const u = s[0] + U.clamp(bu - 22, -8, 10) * 0.18;
      const vv = s[1] + (by - 25) * 0.32;
      return { x: this.X(U.clamp(u, 2, 40)), y: U.clamp(vv, 2, 48) };
    }
    defenseOn() {
      for (const a of this.defActors()) { this.dtask[a.id] = null; this.trackDefender(a); }
    }
    lockDef(a, dur) { if (a) this.dtask[a.id] = { until: this.T + dur }; }
    lockOff(a, dur) { const r = this.role[a && a.id]; if (r) r.until = this.T + dur; }

    // ============================================================ idle between possessions
    idleUpdate(dt) {
      const v = this.v;
      v.focus = { x: v.ball.x, vx: v.ball.vx * 0.5 };
    }
    transitionAfterMake() {
      // the scoring team (current offense) retreats; the other team's big goes for the ball
      const v = this.v;
      const newDefDir = -this.dir; // they now defend the basket at the other end? No: scorers defend the far basket
      void newDefDir;
      // they get back spread across the floor (each keeps his side of the court, in order across it), the
      // guards stopping higher up to pick up the ball, the bigs running back to the paint
      const list = this.offActors().filter((a) => !a.isBusy()).sort((p, q) => p.y - q.y);
      list.forEach((a, i) => {
        const k = list.length > 1 ? i / (list.length - 1) : 0.5;
        const ty = U.lerp(9, 41, k) + (Math.random() - 0.5) * 3;
        const bx = this.X(a.H > 6.75 ? 72 + Math.random() * 6 : 60 + Math.random() * 8);
        this.at(this.T + 0.5 + Math.random() * 0.6, () => { if (!a.isBusy()) a.moveTo(bx, ty, { speed: 10 + Math.random() * 5 }); }, 'retreat');
      });
    }

    // ============================================================ planners
    // --- substitution (dead ball); consecutive subs at the same t are grouped
    p_sub(ev, beat) {
      beat.dead = true;
      const group = [ev];
      while (this.ei < this.events.length && this.events[this.ei].type === 'sub' && Math.abs(this.events[this.ei].t - ev.t) < 1e-6) group.push(this.events[this.ei++]);
      beat.noEmit = true;
      let i = 0;
      for (const e of group) {
        const k = i++;
        this.at(this.T + 0.2 + k * 0.35, () => this.v.doSub(e, () => { this.emit(e); this.subArrived(e); }), 'sub');
      }
      this.v.camHint = { x: 47, hold: 2.5 };
      beat.onFire = () => { for (const e of group) if (!e._emitted) { this.v.forceSub(e); this.emit(e); this.subArrived(e); } };
      return 1.9 + group.length * 0.35;
    }
    subArrived(e) {
      // incoming player inherits the outgoing player's role / matchup
      if (this.role[e.out]) { this.role[e.in] = this.role[e.out]; delete this.role[e.out]; }
      if (this.matchup[e.out] !== undefined) { this.matchup[e.in] = this.matchup[e.out]; delete this.matchup[e.out]; }
      for (const d in this.matchup) if (this.matchup[d] === e.out) this.matchup[d] = e.in;
      const a = this.A(e.in);
      if (a && e.team === this.def) this.trackDefender(a);
      if (a && !this.role[e.in] && e.team === this.off) this.role[e.in] = { mode: 'spot', spot: this.spotPt('wingF'), jx: 0, jy: 0, next: 0 };
    }
    // --- timeout: players walk toward their benches
    p_timeout(ev, beat) {
      beat.dead = true;
      beat.onStart = () => {
        const ref = this.v.nearestRef(this.v.ball.x, this.v.ball.y);
        if (ref) ref.play('refTimeout');
        for (const team of [0, 1]) {
          const bx = this.v.benchX(team);
          for (const a of this.v.onCourt[team].map((id) => this.v.actor(id)).filter(Boolean)) {
            const r = this.role[a.id]; if (r) r.until = this.T + 3;
            this.dtask[a.id] = { until: this.T + 3 };
            a.moveTo(bx + (Math.random() - 0.5) * 8, -2.5 - Math.random() * 1.5, { speed: 5, face: 'move', stance: 'stand' });
          }
        }
        if (this.v.ball.holder) this.v.ball.holder.ballHold = 'chest';
      };
      this.at(this.T + 0.2, () => this.emit(ev), 'timeout emit');
      beat.noEmit = true;
      return 2.6;
    }
    // --- jump ball / tip-off
    p_jump_ball(ev, beat) {
      beat.dead = true;
      const v = this.v;
      const [hj, aj] = ev.jumpers || [];
      const J0 = this.A(hj) || this.nearestTo(0, 47, 25), J1 = this.A(aj) || this.nearestTo(1, 47, 25);
      const homeRight = v.attacksRight(0, this.period);
      const hs = homeRight ? -1 : 1; // home jumper stands on the half nearest their own (defended) basket
      const ref = v.refs[0];
      const winnerTeam = ev.winner === 1 ? 1 : 0;
      const tipTo = this.A(ev.tipTo) || v.actor(v.onCourt[winnerTeam][0]);
      const pos = [];
      let setupT = 0;
      const place = (a, x, y, face) => {
        if (!a) return;
        const d = Math.hypot(a.x - x, a.y - y);
        setupT = Math.max(setupT, d / 9);
        a.moveTo(x, y, { speed: 9, face, stance: 'ready' });
        const r = this.role[a.id]; if (r) r.until = this.T + 60;
        this.dtask[a.id] = { until: this.T + 60 };
        pos.push(a);
      };
      beat.onStart = (fireAt) => {
        place(J0, 47 + hs * 1.25, 25, hs > 0 ? Math.PI : 0);
        place(J1, 47 - hs * 1.25, 25, hs > 0 ? 0 : Math.PI);
        for (const team of [0, 1]) {
          const side = team === 0 ? hs : -hs;
          const ids = v.onCourt[team].filter((id) => id !== (team === 0 ? hj : aj));
          ids.forEach((id, i) => {
            const ang = (side > 0 ? 0 : Math.PI) + (-0.9 + i * 0.6) * (side > 0 ? 1 : -1) + (i % 2 ? 0.15 : -0.15);
            const r = 9 + (i % 2) * 1.5;
            place(v.actor(id), 47 + Math.cos(ang) * r, 25 + Math.sin(ang) * r, Math.atan2(25 - (25 + Math.sin(ang) * r), 47 - (47 + Math.cos(ang) * r)));
          });
        }
        if (ref) { ref.moveTo(47, 21.5, { speed: 8, face: Math.PI / 2 }); }
        v.ball.give(ref, 'chest');
        const tossAt = fireAt - 0.72;
        this.at(tossAt - 0.42, () => { if (ref) ref.play('refToss'); }, 'toss');
        this.at(tossAt, () => {
          // ball tossed straight up
          const b = v.ball;
          const p0 = [47, 25, 6.3];
          b.x = 47; b.y = 25; b.z = 6.3;
          b.flight([M.Ball.seg(b.time, p0, M.Ball.aim(p0, [47, 25, 13.6], 0.72), 1.4)], null);
          if (ref) ref.moveTo(47, 17, { speed: 9 });
        }, 'toss ball');
        this.at(fireAt - 0.6, () => { if (J0) J0.play('jumpTip', { mirror: false }); if (J1) J1.play('jumpTip', { mirror: false }); }, 'jumpers');
      };
      beat.onFire = () => {
        const b = v.ball;
        // tip to the receiver
        const recv = tipTo;
        if (recv) {
          const r = this.role[recv.id];
          const p1 = recv.heldBallPos(TMPA);
          b.pass([p1[0], p1[1], p1[2]], 0.55, { lob: true, target: () => { const q = recv.heldBallPos(TMPB); return [q[0], q[1], q[2]]; }, onArrive: () => { b.give(recv, 'chest'); } });
          b.passTarget = recv;
          recv.moveTo(recv.x + (47 - recv.x) * 0.35, recv.y + (25 - recv.y) * 0.35, { speed: 10 });
        }
        for (const a of pos) { const r = this.role[a.id]; if (r) r.until = this.T + 0.9; this.dtask[a.id] = { until: this.T + 0.9 }; }
        v.arena.cheer(0, 0.4, 1.2);
        // clock starts at the tip; restart shot clock
        this.sc0 = 24; this.scT = beat.g1;
        this.at(this.T + 0.6, () => { this.defenseOn(); }, 'def on');
      };
      return Math.max(2.4, setupT + 1.4);
    }
    // --- inbound
    p_inbound(ev, beat, gap) {
      const v = this.v;
      const by = this.A(ev.by) || this.nearestTo(this.off, ev.x || 47, ev.y || 0);
      const to = this.A(ev.to) || v.actor(v.onCourt[this.off][0]);
      if (!by || !to) return 0.2;
      const start = this.poss.start;
      const baseline = ev.spot === 'baseline';
      let ix = +ev.x, iy = +ev.y;
      if (!isFinite(ix)) ix = baseline ? this.X(95) : 47;
      if (!isFinite(iy)) iy = baseline ? 25 : -1;
      if (baseline) {
        ix = ix < 47 ? -1.2 : 95.2;
        iy = U.clamp(iy, 12, 38);
        // step out beside the lane, not straight behind the backboard (the stanchion and the glass are in the way)
        if (Math.abs(iy - 25) < 7) iy = 25 + (iy < 25 ? -7 : 7);
      }
      else { iy = iy < 25 ? -1.4 : 51.4; ix = U.clamp(ix, 3, 91); }
      const dead = gap < 0.01 || start === 'dead_ball' || start === 'period_start';
      beat.dead = dead && gap < 0.01;
      const b = v.ball;
      const ballFree = !b.holder || b.holder.team !== this.off;
      const pickup = baseline && (start === 'made_basket' || start === 'ft_made') && ballFree;
      // receiver spot: step toward the ball
      const inDir = baseline ? (ix < 47 ? 1 : -1) : 0;
      // receiver comes back to the ball on the same side, 15-20 ft away (near the free throw line extended)
      const rcv = baseline
        ? { x: ix + inDir * (15 + Math.random() * 5), y: U.clamp(iy + (iy < 25 ? -4 : 4) + (Math.random() - 0.5) * 6, 5, 45) }
        : { x: ix + (Math.random() - 0.5) * 8, y: iy < 25 ? 9 : 41 };
      const tWalkBy = Math.hypot(by.x - ix, by.y - iy) / (dead ? 9 : 14);
      const tWalkTo = Math.hypot(to.x - rcv.x, to.y - rcv.y) / 14;
      const flight = Math.hypot(rcv.x - ix, rcv.y - iy) / 30;
      // after a made basket the inbounder has to reach the ball, pick it up and step back out of bounds before
      // the pass: budget each part (the pass used to fire from inside the court with the ball still loose)
      const ballSpot = { x: U.clamp(b.x, 1, 93), y: U.clamp(b.y, 2, 48) };
      const tToBall = pickup ? Math.hypot(by.x - ballSpot.x, by.y - ballSpot.y) / 13 + 0.1 : 0;
      const tOut = pickup ? Math.hypot(ballSpot.x - ix, ballSpot.y - iy) / 8 + 0.2 : 0;
      let need = pickup ? Math.max(tToBall + 0.55 + tOut + 0.35, tWalkTo + 0.4) : Math.max(tWalkBy + 0.6, tWalkTo) + 0.4;
      if (dead) need += 0.6;
      beat.onStart = (fireAt) => {
        this.unlockAll([by.id, to.id]);
        const rb = this.role[by.id]; if (rb) rb.until = fireAt + 0.8;
        const rt = this.role[to.id]; if (rt) rt.until = fireAt + flight + 0.3;
        // inbounder: get the ball
        if (pickup && b.state !== 'held') {
          const bx = ballSpot.x, byy = ballSpot.y;
          by.moveTo(bx, byy, { speed: 14, face: 'move' });
          const tPick = this.T + Math.min(fireAt - this.T - 0.35 - tOut - 0.5, tToBall);
          // after a make the ball is often still dropping out of the net or bouncing: go get it, catch it at chest
          // height on the way down, or bend and pick it up once it is on the floor (a floor pickup for a ball that
          // is still in the air had the hands jump from the floor to the ball)
          const tLast = fireAt - 0.35 - tOut;
          const grab = () => {
            if (b.holder && b.holder.team === this.off) return;
            const late = this.T > Math.min(tPick + 0.8, tLast - 0.35);
            const dh = Math.hypot(b.x - by.x, b.y - by.y);
            if (!late && (dh > 2.3 || b.z > 5.2)) {
              if (dh > 1.0) by.moveTo(U.clamp(b.x, 0.5, 93.5), U.clamp(b.y, 1, 49), { speed: 14, face: 'move' });
              this.at(this.T + 0.05, grab, 'pickup wait');
              return;
            }
            if (b.z > 1.8) { if (!by.isBusy()) by.play('catch', { mirror: false }); this.giveBall(by, 'chest'); return; }
            by.play('pickup', { onEvent: (n) => { if (n === 'grab') this.giveBall(by, 'chest'); } });
            this.at(this.T + 0.45, () => { if (b.holder !== by) this.giveBall(by, 'chest'); }, 'pickup safety');
          };
          this.at(tPick, grab, 'pickup');
          // once he has it: back out of bounds facing the court, then set up to pass
          const stepOut = () => {
            if (b.holder !== by && this.T < tLast) { this.at(this.T + 0.05, stepOut, 'step out wait'); return; }
            if (by.clip && by.clip.clip.name === 'pickup' && by.clip.t < 0.6 && this.T < tLast) { this.at(this.T + 0.05, stepOut, 'step out wait'); return; }
            by.stopClip();
            if (b.holder !== by) this.giveBall(by, 'chest');
            by.moveTo(ix, iy, { speed: 8, by: fireAt - 0.3, face: { x: rcv.x, y: rcv.y } });
          };
          this.at(Math.min(tPick + 0.5, tLast), stepOut, 'step out');
        } else {
          if (!b.holder || b.holder.team !== this.off) {
            // referee takes the ball to the spot and bounces it to the inbounder
            const ref = v.nearestRef(ix, iy);
            if (ref) {
              if (b.holder !== ref) this.giveBall(ref, 'chest');
              ref.moveTo(ix + (ix < 47 ? 4 : -4) * (baseline ? 0 : 1), U.clamp(iy + (baseline ? 4 : (iy < 25 ? 3 : -3)), -2, 52), { speed: 10 });
              this.at(Math.max(this.T + 0.3, fireAt - 1.3), () => {
                if (b.holder !== ref) this.giveBall(ref, 'chest');
                const d = Math.hypot(by.x - ref.x, by.y - ref.y);
                this.passBall(ref, by, 'bounce', U.clamp(d / 24, 0.35, 0.9), () => { by.ballHold = 'over'; });
              }, 'ref bounce to inbounder');
            } else this.at(Math.max(this.T + 0.3, fireAt - 1.0), () => this.giveBall(by, 'over'), 'hand ball');
          } else if (b.holder !== by) this.ensureBall(by);
          by.moveTo(ix, iy, { speed: dead ? 8 : 14, by: fireAt - 0.8, face: { x: rcv.x, y: rcv.y } });
          this.at(Math.max(this.T + 0.2, fireAt - 0.7), () => { if (b.holder === by) by.ballHold = 'over'; by.setStance('inbound'); }, 'overhead');
        }
        to.moveTo(rcv.x, rcv.y, { by: fireAt + flight * 0.6, speed: 15, face: 'move' });
        this.at(fireAt - 0.35, () => to.setFace({ x: ix, y: iy }), 'face inbounder');
        // defense picks up (press) or retreats
        if (this.scheme === 'press') { for (const a of this.defActors()) this.dtask[a.id] = null; }
        v.camHint = { x: ix, hold: 1.2 };
      };
      // the throw-in waits (up to 3 s) until the inbounder is really out of bounds with the ball in his hands
      const outside = () => (baseline ? (ix < 47 ? by.x <= 0.2 : by.x >= 93.8) : (iy < 25 ? by.y <= 0.2 : by.y >= 49.8));
      beat.waitFor = () => outside() && b.holder === by;
      beat.onFire = () => {
        if (b.holder !== by) this.giveBall(by, 'over');
        by.ballHold = 'chest';
        const dur = Math.max(0.35, Math.hypot(to.x - by.x, to.y - by.y) / 30);
        by.play(baseline ? 'passChest' : 'passInbound', { t0: 0.24, fadeIn: 0.05 });
        this.passBall(by, to, 'chest', dur, () => { to.ballHold = 'chest'; });
        by.setStance('ready');
        this.at(this.T + 0.5, () => { const r = this.role[by.id]; if (r) { r.until = 0; r.spot = this.spotPt(r.spotName || 'wingN'); } }, 'inbounder in');
        this.sc0 = Math.max(this.sc0 - (this.g - this.scT), 14) > 23.9 ? 24 : this.sc0; // shot clock starts when touched
      };
      return need;
    }
    // --- advance: handler crosses half court
    p_advance(ev, beat, gap) {
      const v = this.v;
      const h = this.A(ev.handler) || (v.ball.holder && v.ball.holder.team === this.off ? v.ball.holder : null);
      if (!h) return 0.2;
      let extra = this.ensureBall(h, true);
      const cross = { x: 47 + this.dir * 1.5, y: U.clamp(h.y + (25 - h.y) * 0.5, 10, 40) };
      const dist = Math.abs(h.x - cross.x);
      const push = this.play === 'transition' || this.tempo === 'push';
      const tNeed = dist / (push ? h.maxSpeed * 0.9 : 15) + extra;
      beat.onStart = (fireAt) => {
        this.tempo = push ? 'push' : 'normal';
        this.assignSpots(push ? 'transition' : 'advance');
        const r = this.role[h.id];
        if (r) r.until = fireAt;
        const go = () => {
          const eta = fireAt - this.T;
          h.moveTo(cross.x + this.dir * (push ? 8 : 4), cross.y, { by: this.T + eta * 1.1, speed: push ? h.maxSpeed : 17, face: 'move', stance: 'dribble', pace: 7 });
          if (v.ball.holder === h) v.ball.dribble(h);
        };
        if (extra > 0) this.at(this.T + extra, go, 'advance go'); else go();
        // everyone else runs to the frontcourt
        for (const a of this.offActors()) {
          if (a === h) continue;
          const rr = this.role[a.id]; if (rr) rr.until = 0;
        }
        v.camHint = null;
      };
      beat.onFire = () => { this.phase = 'front'; };
      return tNeed;
    }
    // --- set: formation for the play
    p_set(ev, beat, gap) {
      const v = this.v;
      const kind = ev.play || this.play;
      beat.onStart = (fireAt) => {
        this.tempo = 'normal';
        this.assignSpots(kind, ev);
        const h = this.A(ev.handler);
        if (h && v.ball.holder !== h) this.ensureBall(h);
        if (kind === 'post' && ev.target) this.giveSpot(ev.target, 'blockN');
        if (kind === 'offscreen' && ev.target) this.giveSpot(ev.target, 'blockN');
        if (kind === 'handoff' && ev.screener) this.giveSpot(ev.screener, 'high');
        if (kind === 'cut' && ev.target) this.giveSpot(ev.target, 'wingN');
      };
      const h = this.A(ev.handler);
      const d = h ? Math.hypot(h.x - this.spotPt('top').x, h.y - 25) : 0;
      return Math.min(2.5, d / 15);
    }
    // --- screen
    p_screen(ev, beat, gap) {
      const v = this.v;
      const scr = this.A(ev.screener), user = this.A(ev.user);
      if (!scr || !user) return 0.3;
      const onBall = ev.kind !== 'off_ball';
      const zoneD = /zone|boxone/.test(this.scheme);
      const nearD = this.nearestTo(this.def, user.x, user.y);
      const man = this.guardOf(user.id);
      const userDef = (zoneD || !man || Math.hypot(man.x - user.x, man.y - user.y) > 9) ? nearD : man;
      // screen spot: on the defender's hip, on the side the user will attack (toward the middle / top)
      const toMid = user.y < 25 ? 1 : -1;
      let spot;
      if (onBall) {
        const dx = this.rim.x - user.x, dy = this.rim.y - user.y, dl = Math.hypot(dx, dy) || 1;
        const px = -dy / dl * toMid, py = dx / dl * toMid; // lateral toward the middle
        if (userDef && Math.hypot(userDef.x - user.x, userDef.y - user.y) < 8) {
          spot = { x: userDef.x + px * 1.7 - dx / dl * 0.4, y: userDef.y + py * 1.7 - dy / dl * 0.4 };
        } else spot = { x: user.x + dx / dl * 3.2 + px * 2.2, y: user.y + dy / dl * 3.2 + py * 2.2 };
        // the defender of the user steps up to the ball as the screen comes
        if (userDef && zoneD) { this.dtask[userDef.id] = { until: this.T + 3 }; userDef.moveTo(user.x + dx / dl * 3.4, user.y + dy / dl * 3.4, { speed: 12, face: { x: user.x, y: user.y }, stance: 'defense' }); }
      } else {
        spot = userDef ? { x: userDef.x + (this.rim.x - userDef.x) * 0.12 + 1.5 * this.dir, y: userDef.y + (user.y < 25 ? -1.5 : 1.5) } : { x: user.x, y: user.y };
      }
      this.clampCourt(spot, 2);
      const tReach = Math.hypot(scr.x - spot.x, scr.y - spot.y) / 14;
      // what does the screener do next? roll or pop
      const nextSh = this.findNext((e) => (e.type === 'shot' && e.shooter === scr.id) || (e.type === 'pass' && e.to === scr.id));
      beat.onStart = (fireAt) => {
        const r = this.role[scr.id]; if (r) r.until = fireAt + 0.9;
        scr.moveTo(spot.x, spot.y, { by: fireAt - 0.3, speed: 16, face: userDef ? { x: userDef.x, y: userDef.y } : 'move', stance: 'screen', pace: 6 });
        this.at(fireAt - 0.25, () => scr.setFace(Math.atan2(user.y - scr.y, user.x - scr.x) + Math.PI * 0.5), 'screen face');
        if (onBall) {
          const ru = this.role[user.id]; if (ru) ru.until = fireAt + 0.4;
          user.moveTo(user.x, user.y, { speed: 4, face: this.rim, stance: 'dribble' });
        } else {
          const ru = this.role[user.id]; if (ru) ru.until = fireAt + 1.2;
          // user sets up his man then comes off the screen
          user.moveTo(this.X(6), user.y < 25 ? 12 : 38, { by: fireAt - 0.5, speed: 9, pace: 5 });
        }
      };
      beat.onFire = () => {
        // after the screen: roll or pop, user attacks/cuts
        const pop = nextSh && ((nextSh.type === 'shot' && !RIM_SHOTS[nextSh.kind] && nextSh.zone !== 'paint') || nextSh.type === 'pass' && nextSh.kind === 'kick');
        const r = this.role[scr.id];
        if (r) {
          r.until = this.T + 1.6;
          const dest = pop ? this.P(24, scr.y < 25 ? 14 : 36) : this.P(6, 25 + (Math.random() - 0.5) * 6);
          r.spot = dest;
          scr.setStance('ready');
          scr.moveTo(dest.x, dest.y, { speed: pop ? 13 : 17, face: 'move' });
        }
        if (onBall) {
          const ru = this.role[user.id];
          if (ru) { ru.until = this.T + 1.2; }
          const side = (spot.y - user.y) >= 0 ? 1 : -1;
          user.moveTo(user.x + (this.rim.x - user.x) * 0.3, U.clamp(user.y + side * 7, 3, 47), { speed: 15, face: 'move', stance: 'dribble' });
          if (v.ball.holder === user) v.ball.dribble(user);
          // coverage
          const sd = this.guardOf(scr.id);
          if (userDef && sd) {
            if (this.scheme === 'switch') { const a = this.matchup[userDef.id]; this.matchup[userDef.id] = this.matchup[sd.id]; this.matchup[sd.id] = a; }
            else if (this.scheme === 'blitz') { this.dtask[sd.id] = { until: this.T + 1.4 }; sd.track(() => ({ x: user.x + (this.rim.x - user.x) * 0.1 + 2, y: user.y + 2, vx: user.vx, vy: user.vy }), { stance: 'defenseWide' }); }
            else if (this.scheme === 'drop') { this.dtask[sd.id] = { until: this.T + 1.5 }; sd.moveTo(this.X(12), 25, { speed: 12, face: { x: user.x, y: user.y }, stance: 'defense' }); }
          }
          if (userDef) { this.dtask[userDef.id] = { until: this.T + 0.5 }; userDef.moveTo(userDef.x - this.dir * 2, userDef.y + (spot.y - user.y) * 0.5, { speed: 10, stance: 'defense' }); }
        } else {
          const ru = this.role[user.id];
          if (ru) { ru.until = this.T + 1.4; const dest = this.P(22, user.y < 25 ? 8 : 42); ru.spot = dest; user.moveTo(dest.x, dest.y, { speed: 17, face: 'move' }); }
        }
      };
      return tReach + 0.4;
    }
    // --- dribble hand-off
    p_handoff(ev, beat, gap) {
      const v = this.v;
      const from = this.A(ev.from), to = this.A(ev.to);
      if (!from || !to) return 0.3;
      const extra = this.ensureBall(from, true);
      const hoSpot = this.clampCourt({ x: this.X(26), y: U.clamp(from.y, 14, 36) }, 3);
      beat.onStart = (fireAt) => {
        const rf = this.role[from.id]; if (rf) rf.until = fireAt + 0.8;
        const rt = this.role[to.id]; if (rt) rt.until = fireAt + 0.8;
        from.moveTo(hoSpot.x, hoSpot.y, { by: fireAt - 0.4, speed: 8, face: { x: to.x, y: to.y }, stance: 'dribble', pace: 5 });
        // receiver curls toward the big, arriving at the handoff moment
        const side = to.y < hoSpot.y ? -1 : 1;
        to.moveTo(hoSpot.x + this.dir * 1.2, hoSpot.y + side * 2.2, { by: fireAt, speed: 16, face: 'move', pace: 6 });
      };
      beat.onFire = () => {
        // short toss
        const b = v.ball;
        if (b.holder !== from) this.giveBall(from, 'chest');
        b.give(from, 'chest');
        this.passBall(from, to, 'chest', 0.18, () => { b.dribble(to); });
        from.setStance('screen');
        const r = this.role[to.id]; if (r) { r.until = this.T + 1.0; }
        to.moveTo(to.x + (this.rim.x - to.x) * 0.25, to.y + (to.y < 25 ? -3 : 3), { speed: 16, face: 'move', stance: 'dribble' });
      };
      return Math.max(0.6 + extra, Math.hypot(to.x - hoSpot.x, to.y - hoSpot.y) / 16);
    }
    // --- dribble moves
    p_move(ev, beat, gap) {
      const v = this.v;
      const a = this.A(ev.player);
      if (!a) return 0.2;
      const extra = this.ensureBall(a, true);
      const mv = ev.move;
      const b = v.ball;
      beat.onStart = (fireAt) => {
        const r = this.role[a.id]; if (r) r.until = fireAt + 0.8;
        if (mv === 'size_up') {
          a.moveTo(a.x, a.y, { speed: 3, face: this.rim, stance: 'dribble' });
          this.at(Math.max(this.T + extra, fireAt - 0.8), () => { if (b.holder === a) { b.dribble(a); b.dribbleMove('btl'); } }, 'sizeup');
        } else if (mv === 'jab') {
          this.at(Math.max(this.T + extra, fireAt - 0.2), () => { if (b.holder === a && b.state === 'dribble') b.give(a, 'triple'); a.ballHold = 'triple'; a.setStance('triple'); a.play('jab', { facing: this.rimAngleFrom(a.x, a.y) }); }, 'jab');
        } else if (mv === 'spin' && M.Anims.get('spinMocap')) {
          // the motion-captured spin plays from the start of the beat and the move lands when it is done
          const sc = M.Anims.get('spinMocap');
          a.setStance('dribble');
          a.moveTo(a.x + (this.rim.x - a.x) * 0.08, a.y, { speed: 5, face: this.rim, stance: 'dribble' });
          this.at(Math.max(this.T + extra, fireAt - sc.dur), () => {
            if (b.holder === a && b.state !== 'dribble') b.dribble(a);
            a.play('spinMocap', { facing: this.rimAngleFrom(a.x, a.y), fadeIn: 0.12 });
            if (b.dr) b.dribbleMove('cross', { period: 0.62 });
          }, 'spin');
        } else if (mv === 'backdown') {
          a.setStance('postUp');
          a.setFace(this.rimAngleFrom(a.x, a.y) + Math.PI);
          const pd = this.guardOf(a.id);
          if (pd) { this.dtask[pd.id] = { until: fireAt + 1.5 }; pd.setStance('postD'); pd.track(() => { const dx = this.rim.x - a.x, dy = this.rim.y - a.y, dl = Math.hypot(dx, dy) || 1; return { x: a.x + dx / dl * 2.1, y: a.y + dy / dl * 2.1, vx: a.vx, vy: a.vy }; }, { stance: 'postD' }); pd.setFace(() => Math.atan2(a.y - pd.y, a.x - pd.x)); }
          this.at(Math.max(this.T + extra, fireAt - 0.8), () => { if (b.holder === a) b.dribble(a, a.lefty ? 0 : 1, { low: 1 }); a.play('backdown', { facing: this.rimAngleFrom(a.x, a.y) + Math.PI }); }, 'backdown');
        } else {
          a.setStance('dribble');
          a.moveTo(a.x + (this.rim.x - a.x) * 0.08, a.y, { speed: 5, face: this.rim, stance: 'dribble' });
        }
      };
      beat.onFire = () => {
        const d = this.guardOf(a.id);
        if (mv === 'crossover' || mv === 'btl' || mv === 'btb') {
          if (b.holder === a) { if (b.state !== 'dribble') b.dribble(a); b.dribbleMove(mv === 'crossover' ? 'cross' : mv); }
          const side = (b.dr && b.dr.hand === 1) ? -1 : 1;
          const c = Math.cos(a.facing), s = Math.sin(a.facing);
          a.moveTo(a.x + s * side * 4 + c * 5, a.y - c * side * 4 + s * 5, { speed: 15, face: this.rim, stance: 'dribble' });
          if (d) { this.dtask[d.id] = { until: this.T + 0.5 }; d.moveTo(d.x - s * side * 1.5, d.y + c * side * 1.5, { speed: 8, stance: 'defense' }); }
        } else if (mv === 'hesi') {
          a.play('hesi');
          a.moveTo(a.x + (this.rim.x - a.x) * 0.25, a.y + (this.rim.y - a.y) * 0.25, { speed: 17, face: 'move', stance: 'dribble' });
        } else if (mv === 'spin' && !M.Anims.get('spinMocap')) {
          if (b.holder === a && b.state !== 'dribble') b.dribble(a);
          a.play('spin', { facing: this.rimAngleFrom(a.x, a.y) });
          if (b.dr) b.dribbleMove('cross', { period: 0.6 });
        } else if (mv === 'drive') {
          if (b.holder === a && b.state !== 'dribble') b.dribble(a);
          const dx = this.rim.x - a.x, dy = this.rim.y - a.y, dl = Math.hypot(dx, dy) || 1;
          const nx = this.findNextAfter(ev, (e) => e.shooter === a.id || e.from === a.id);
          const stopAt = nx && nx.type === 'shot' && (RIM_SHOTS[nx.kind] || nx.kind === 'floater') ? 12.5 : 7;
          const go = Math.max(0, Math.min(dl - stopAt, 14));
          a.moveTo(a.x + dx / dl * go, a.y + dy / dl * go, { speed: a.maxSpeed * 0.9, face: 'move', stance: 'dribble' });
          if (d) { this.dtask[d.id] = { until: this.T + 1.0 }; d.track(() => ({ x: a.x + dx / dl * 2.5 + 1.2, y: a.y + dy / dl * 2.5, vx: a.vx * 0.9, vy: a.vy * 0.9 }), { stance: 'defense' }); }
          // help rotation
          const help = this.nearestTo(this.def, this.rim.x + (a.x - this.rim.x) * 0.4, this.rim.y + (a.y - this.rim.y) * 0.4, d);
          if (help) { this.dtask[help.id] = { until: this.T + 1.2 }; help.moveTo(this.rim.x + dx / dl * -6, this.rim.y + dy / dl * -6, { speed: 14, stance: 'defense' }); }
          v.arena.cheer(this.off, 0.3, 0.8);
        } else if (mv === 'stepback') {
          // handled by the following shot when it is a stepback; otherwise a quick retreat dribble
          a.moveTo(a.x - (this.rim.x - a.x) * 0.1, a.y, { speed: 8, face: this.rim, stance: 'dribble' });
        }
      };
      const spinC = mv === 'spin' ? M.Anims.get('spinMocap') : null;
      return Math.max(0.5, extra + (mv === 'size_up' ? 1.0 : spinC ? spinC.dur : 0.3));
    }
    // --- pass
    p_pass(ev, beat, gap) {
      const v = this.v;
      const from = this.A(ev.from), to = this.A(ev.to);
      if (!from || !to || from === to) return 0.2;
      const extra = this.ensureBall(from, true);
      const kind = ev.kind || 'chest';
      const clipName = PASS_CLIP[kind] || 'passChest';
      const clip = M.Anims.get(clipName);
      const windup = clip ? clip.events.release : 0.26;
      const cs = this.catchSpotFor(ev, to);
      const dist = Math.hypot(cs.x - from.x, cs.y - from.y);
      const flight = U.clamp(dist / (PASS_SPEED[kind] || 36) + (kind === 'lob' || kind === 'alley' ? 0.35 : 0), 0.25, 1.6);
      const tMove = Math.hypot(to.x - cs.x, to.y - cs.y) / (to.maxSpeed * 0.8);
      beat.onStart = (fireAt) => {
        const tCatch = fireAt + flight - 0.05;
        const rt = this.role[to.id]; if (rt) { rt.until = fireAt + flight + 0.5; rt.spot = { x: cs.x, y: cs.y }; rt.jx = 0; rt.jy = 0; }
        const rf = this.role[from.id];
        if (rf) {
          // the passer keeps working (probe dribbles, a swing and return) until shortly before the pass
          const tLock = fireAt - windup - 0.9;
          if (tLock - this.T > 1.0 && this.flowOK && this.flowOK()) {
            rf.until = 0;
            this.at(tLock, () => {
              rf.until = fireAt + 0.3; rf.probe = null; rf.path = null;
              if (!from.isBusy() && v.ball.holder === from) from.moveTo(from.x, from.y, { speed: 3, face: { x: to.x, y: to.y }, stance: 'dribble' });
            }, 'passer set');
          } else rf.until = fireAt + 0.3;
        }
        const d0 = Math.hypot(to.x - cs.x, to.y - cs.y);
        if (tCatch - this.T > 2.2 && d0 < 10 && !to.isBusy() && kind !== 'alley') {
          // get open instead of waiting on the spot: move freely around the catch spot, then a v-cut
          // (sink toward the rim, or step out if already close to it) and pop to the catch spot on time
          const dx = this.rim.x - cs.x, dy = this.rim.y - cs.y, dl = Math.hypot(dx, dy) || 1;
          const k = dl > 10 ? U.clamp(dl - 7, 3.5, 6) : -4;
          const px = cs.x + dx / dl * k, py = U.clamp(cs.y + dy / dl * k, 2.5, 47.5);
          const tPop = tCatch - (Math.abs(k) / 12 + 0.3);
          const tSink = Math.max(this.T + 0.3, tPop - Math.hypot(px - to.x, py - to.y) / 8 - 0.5);
          if (rt) { rt.until = tSink; rt.next = Math.min(rt.next || 0, this.T + 0.2); }
          this.at(tSink, () => {
            if (rt) rt.until = fireAt + flight + 0.5;
            if (!to.isBusy() && v.ball.holder !== to) to.moveTo(px, py, { by: tPop, speed: 13, face: 'move', stance: 'ready' });
          }, 'v-cut in');
          this.at(tPop, () => { if (v.ball.holder !== to) to.moveTo(cs.x, cs.y, { by: tCatch, speed: to.maxSpeed, face: 'move' }); }, 'v-cut out');
        } else {
          to.moveTo(cs.x, cs.y, { by: tCatch, speed: to.maxSpeed, face: 'move', pace: 5.5 });
        }
        this.at(fireAt + flight - 0.45, () => to.setFace({ x: from.x, y: from.y }), 'face passer');
        this.at(Math.max(this.T + extra, fireAt - windup - 0.02), () => {
          const b = v.ball;
          if (b.holder !== from) return;
          if (b.state === 'dribble') b.give(from, 'chest');
          from.setFace({ x: to.x, y: to.y });
          from.play(clipName, { speed: 1 });
          from.moveTo(from.x, from.y, { speed: 3 });
        }, 'pass windup');
        // defender of the receiver: deny/recover, or anticipate the closeout if a shot follows
        const d = this.guardOf(to.id);
        if (d) this.dtask[d.id] = null;
        const nxt = this.findNextAfter(ev, (e) => e.shooter === to.id);
        if (nxt && nxt.type === 'shot' && !RIM_SHOTS[nxt.kind]) {
          const df = this.A(nxt.defender) || d;
          if (df && df.team === this.def) {
            this.at(fireAt - 0.1, () => {
              if (df.isBusy()) return;
              this.dtask[df.id] = { until: fireAt + flight + 2 };
              const dx = this.rim.x - cs.x, dy = this.rim.y - cs.y, dl = Math.hypot(dx, dy) || 1;
              const gapC = nxt.contest === 'tight' ? 2.6 : nxt.contest === 'contested' ? 4 : 9;
              df.moveTo(cs.x + dx / dl * gapC, cs.y + dy / dl * gapC, { speed: df.maxSpeed, face: { x: cs.x, y: cs.y }, stance: 'defense' });
            }, 'closeout early');
          }
        }
      };
      beat.onFire = () => {
        const b = v.ball;
        if (b.holder !== from) { this.giveBall(from, 'chest'); }
        const afterNext = this.nextFor(to.id);
        this.passBall(from, to, kind, flight, () => {
          // hold style depending on what comes next
          if (afterNext && afterNext.type === 'shot' && (afterNext.kind === 'catch_shoot' || afterNext.kind === 'jumper')) to.ballHold = 'pocket';
          else if (afterNext && (afterNext.type === 'move' || (afterNext.type === 'shot' && !RIM_SHOTS[afterNext.kind]))) { b.dribble(to); }
          else to.ballHold = 'chest';
        });
        from.setFace('move');
        const rf = this.role[from.id]; if (rf) { rf.until = this.T + 0.6; }
        v.camHint = null;
      };
      return Math.max(windup + 0.05 + extra, tMove - flight + 0.05);
    }
    /** where should `to` catch the ball for pass `ev` */
    catchSpotFor(ev, to) {
      const nx = this.findNextAfter(ev, (e) => e.shooter === to.id || e.from === to.id || e.player === to.id || e.handler === to.id);
      if (nx && nx.type === 'shot') {
        const sx = +nx.x, sy = +nx.y;
        if (isFinite(sx) && isFinite(sy)) {
          if (RIM_SHOTS[nx.kind]) {
            if (nx.kind === 'alley' || nx.kind === 'tip') return { x: sx, y: sy };
            // catch on the way to the rim
            const dx = sx - this.rim.x, dy = sy - this.rim.y, dl = Math.hypot(dx, dy) || 1;
            return this.clampCourt({ x: sx + dx / dl * 8, y: sy + dy / dl * 8 }, 1.5);
          }
          if (nx.kind === 'catch_shoot' || nx.kind === 'jumper') return { x: sx, y: sy };
          const dx = sx - this.rim.x, dy = sy - this.rim.y, dl = Math.hypot(dx, dy) || 1;
          return this.clampCourt({ x: sx + dx / dl * 3, y: sy + dy / dl * 3 }, 1.5);
        }
      }
      const r = this.role[to.id];
      const base = r && r.spot ? r.spot : { x: to.x, y: to.y };
      // step toward the ball to meet the pass
      const b = this.v.ball;
      const dx = b.x - base.x, dy = b.y - base.y, dl = Math.hypot(dx, dy) || 1;
      return this.clampCourt({ x: base.x + dx / dl * 2, y: base.y + dy / dl * 2 }, 1.5);
    }
    findNext(pred) { for (let i = this.ei; i < this.events.length; i++) if (pred(this.events[i])) return this.events[i]; return null; }
    findNextAfter(ev, pred) {
      const i0 = this.events.indexOf(ev);
      for (let i = i0 + 1; i < this.events.length; i++) {
        const e = this.events[i];
        if (e.type === 'rebound' || e.type === 'turnover' || e.type === 'foul') return null;
        if (pred(e)) return e;
      }
      return null;
    }
    nextFor(id) { return this.findNext((e) => e.shooter === id || e.from === id || e.player === id); }

    // --- shot
    p_shot(ev, beat, gap) {
      const v = this.v;
      const sh = this.A(ev.shooter) || (v.ball.holder && v.ball.holder.team === this.off ? v.ball.holder : null);
      if (!sh) return 0.3;
      this.lastShot = ev;
      const kind = ev.kind || 'jumper';
      let clipName = SHOT_CLIP[kind] || 'jumpshot';
      if (kind === 'dunk' && sh.H < 6.2 && sh.rVert < 0.6) clipName = 'layup';
      if (kind === 'dunk' && Math.random() < 0.35) clipName = 'dunk2';
      const b = v.ball;
      const catchAndShoot = kind === 'catch_shoot' || (kind === 'jumper' && b.state === 'flight');
      // already under the basket (putbacks, short rolls): standing finish where he is
      const dRimNow = Math.hypot(sh.x - this.rim.x, sh.y - this.rim.y);
      let standFinish = false;
      if (kind === 'tip' && dRimNow > 6.5) clipName = dRimNow < 9.5 ? 'putback' : 'layup';
      // (a dunk is always thrown down at the rim: a standing putback dunk only from close in, otherwise a
      // short running dunk whose run-up absorbs the distance)
      if ((RIM_SHOTS[kind] && kind !== 'alley' && dRimNow < (kind === 'dunk' ? 5.5 : 9.5)) || (kind === 'tip' && dRimNow <= 6.5)) {
        if (kind !== 'tip') clipName = (kind === 'dunk') ? 'putbackDunk' : 'putback';
        standFinish = true;
      }
      const clip = M.Anims.get(clipName);
      // per-player form: a quicker or slower release and a little more or less lift
      const style = U.hashStr(String(sh.id)) / 4294967296;
      const jumper = /jumpshot|pullup|stepback|fadeaway/.test(clipName);
      const spk = jumper ? 0.93 + style * 0.14 : 1;
      const rel = clip.events.release / spk;
      let sx = +ev.x, sy = +ev.y;
      if (!isFinite(sx) || !isFinite(sy)) { sx = sh.x; sy = sh.y; }
      const spot = this.clampCourt({ x: sx, y: sy }, 0.6);
      if (standFinish) {
        // finish from where he is (within a couple of feet of the engine spot, close to the rim)
        const rp = this.clipRootAt(clip, clip.events.release);
        const a0 = Math.atan2(this.rim.y - sh.y, this.rim.x - sh.x);
        if (clipName === 'putbackDunk') {
          // the dunk goes down at the rim: release just in front of it, the gather and jump carry him there
          spot.x = this.rim.x - Math.cos(a0) * 1.3; spot.y = this.rim.y - Math.sin(a0) * 1.3;
        } else {
          const px = sh.x + Math.cos(a0) * rp.fwd, py = sh.y + Math.sin(a0) * rp.fwd;
          const dToRim = Math.hypot(px - this.rim.x, py - this.rim.y);
          if (dToRim > 1.0) { spot.x = px; spot.y = py; }
        }
      }
      const rimShot = !!RIM_SHOTS[kind] || clipName === 'layup' || clipName === 'floater';
      // facing at the start of the clip: toward the rim from the approach side
      let facing;
      const rootRel = this.clipRootAt(clip, rel);
      const mirror = sh.lefty;
      const lat = mirror ? -rootRel.lat : rootRel.lat;
      let origin;
      if (rimShot && rootRel.fwd > 1 && !standFinish) {
        // running finish: approach along the shooter's own line to the rim (curving toward the engine's
        // side of the rim only when there is room), release ~the engine's distance from the rim
        const aA = Math.atan2(this.rim.y - sh.y, this.rim.x - sh.x);
        const aB = Math.atan2(this.rim.y - spot.y, this.rim.x - spot.x);
        const far = U.clamp((dRimNow - (rootRel.fwd + 4)) / 14, 0, 1);
        facing = U.angLerp(aA, aB, 0.65 * far);
        const relD = U.clamp(Math.hypot(spot.x - this.rim.x, spot.y - this.rim.y), 1.8, 4.2);
        const c0 = Math.cos(facing), s0 = Math.sin(facing);
        const rx = this.rim.x - c0 * relD, ry = this.rim.y - s0 * relD;
        spot.x = rx; spot.y = ry;
        origin = { x: rx - (c0 * rootRel.fwd + s0 * lat), y: ry - (s0 * rootRel.fwd - c0 * lat) };
      } else {
        facing = Math.atan2(this.rim.y - spot.y, this.rim.x - spot.x);
        const c1 = Math.cos(facing), s1 = Math.sin(facing);
        origin = { x: spot.x - (c1 * rootRel.fwd + s1 * lat), y: spot.y - (s1 * rootRel.fwd - c1 * lat) };
      }
      const c = Math.cos(facing), s = Math.sin(facing);
      void c; void s;
      this.clampCourt(origin, -3);
      // time still owed to a clip he is in (landing from a rebound, finishing a catch...) before he can run
      const busyT = sh.clip && !sh.clip.done && !standFinish ? Math.max(0, (sh.clip.clip.dur - sh.clip.t) / (sh.clip.speed || 1) - 0.15) : 0;
      const dReach = Math.hypot(sh.x - origin.x, sh.y - origin.y);
      // momentum the wrong way (driving past the spot, drifting sideways) has to be killed first
      const ux = (origin.x - sh.x) / (dReach || 1), uy = (origin.y - sh.y) / (dReach || 1);
      const vAway = Math.max(0, -(sh.vx * ux + sh.vy * uy)), vSide = Math.abs(-sh.vx * uy + sh.vy * ux);
      const tTurn = dReach > 2 ? (vAway + vSide * 0.5) / (sh.decel || 25) : 0;
      const tReach = (dReach > 2 ? busyT : 0) + tTurn + dReach / (sh.maxSpeed * 0.85);
      let tBall = 0;
      if (b.holder !== sh) {
        if (b.state === 'flight' && b.passTarget === sh) tBall = Math.max(0, b.flightEnd() - b.time);
        else tBall = this.ensureBall(sh);
      }
      // (an alley-oop goes up before the lob gets there: the jump starts so the clip's catch moment meets the ball
      // in the air, instead of the catcher taking the lob on the floor and jumping with it)
      const catchT = kind === 'alley' && clip.events && clip.events.catch != null ? clip.events.catch / (spk || 1) : null;
      const clipLead = catchT != null && tBall > 0 ? Math.max(0, tBall - catchT) : catchAndShoot ? Math.max(0, tBall - 0.02) : tBall + 0.15;
      // (the lob sets an alley-oop's clock: the jump starts on time wherever the catcher is, re-anchored on him, and
      // the beat does not wait out a longer gap on the game clock, or the lob would land before he goes up)
      const alleyLob = catchT != null && tBall > 0;
      const need = (alleyLob ? clipLead : Math.max(tReach * 1.25 + 0.25, clipLead)) + rel;
      if (alleyLob) beat.maxDur = need;
      const pending = !!ev.pending;
      const result = this.shotResult(ev, sh, spot, kind);
      // rebound look-ahead
      beat.onStart = (fireAt) => {
        const clipStart = fireAt - rel;
        const r = this.role[sh.id]; if (r) r.until = fireAt + 2.5;
        const approach = () => {
          if (r) { r.until = fireAt + 2.5; r.probe = null; r.probeAnchor = null; r.path = null; }
          sh.moveTo(origin.x, origin.y, { by: clipStart, speed: sh.maxSpeed, face: rimShot ? 'move' : this.rim, stance: b.holder === sh ? 'dribble' : 'ready', pace: rimShot ? 8 : 5.5 });
          if (b.holder === sh && b.state === 'held' && !catchAndShoot && Math.hypot(sh.x - origin.x, sh.y - origin.y) > 2) b.dribble(sh);
        };
        // a long wait with the ball in his hands: he works it (probe dribbles around his spot) and only then
        // goes into the shot, instead of creeping to the spot in slow motion
        const tApp = clipStart - (Math.hypot(sh.x - origin.x, sh.y - origin.y) / (sh.maxSpeed * 0.7) + 0.7);
        if (r && b.holder === sh && !catchAndShoot && !standFinish && tApp - this.T > 1.2 && this.flowOK && this.flowOK()) {
          r.until = 0; r.probe = null; r.probeAnchor = { x: origin.x, y: origin.y };
          this.at(tApp, approach, 'shot approach');
        } else approach();
        this.at(clipStart, () => {
          if (b.holder !== sh && !(b.state === 'flight' && b.passTarget === sh)) this.giveBall(sh, 'pocket');
          sh.stopClip(0);
          if (b.holder === sh && b.state === 'dribble' && clip.name === 'jumpshot') b.give(sh, 'pocket');
          if (b.holder === sh && b.state === 'dribble') b.give(sh, 'low');
          // rim finishes re-anchor on the shooter if the approach plan slipped (no dragging)
          let ox = origin.x, oy = origin.y, of = facing;
          let blendT = null;
          const dunkClip = clipName === 'dunk' || clipName === 'dunk2' || clipName === 'putbackDunk';
          const slip = Math.hypot(sh.x - ox, sh.y - oy);
          if (dunkClip && slip > 1.5 && slip < (clipName === 'putbackDunk' ? 4.5 : 6.5)) {
            // dunks stay anchored at the rim: the run-up / gather absorbs the slip (steps stretch or shorten)
            blendT = clip.jump ? U.clamp(clip.jump.t0 + 0.15, 0.4, 0.65) : 0.5;
          } else if (rimShot || clipName === 'putback' || clipName === 'putbackDunk' || clipName === 'tip') {
            if (slip > 2.5) {
              ox = sh.x; oy = sh.y;
              of = Math.atan2(this.rim.y - oy, this.rim.x - ox);
              const r0 = this.clipRootAt(clip, 0);
              ox -= Math.cos(of) * r0.fwd; oy -= Math.sin(of) * r0.fwd;
            }
          }
          const lift = clip.jump ? clip.jump.h * sh.H * (0.85 + sh.rVert * 0.3) * (jumper ? 0.88 + ((style * 7.3) % 1) * 0.26 : 1) : null;
          const cs = sh.play(clipName, {
            x: ox, y: oy, facing: of, mirror, fadeIn: 0.08, speed: spk, jumpH: lift, blendT: blendT == null ? undefined : blendT,
            noHang: Math.random() < 0.6,
            hold: pending ? clip.events.set : null,
            onEvent: (name) => {
              if (name === 'set' && pending && !this.resumeReq) this.freeze(ev, sh);
            },
          });
          this.shotClipState = cs;
          if (b.holder === sh) b.give(sh);
        }, 'shot clip');
        this.planContest(ev, sh, spot, fireAt);
        this.planRebound(ev, sh, spot, fireAt, result);
        v.camHint = null;
      };
      beat.onFire = () => {
        this.releaseShot(ev, sh, spot, result, clipName);
        if (+ev.pts === 3) { const ref = v.nearestRef(sh.x, sh.y); if (ref && !ref.upper) { ref.play('refThree'); this.threeRef = ref; } }
      };
      if (pending) beat.noEmit = true; // emitted at the freeze
      return need;
    }
    clipRootAt(clip, t) {
      if (!clip.rootKeys) return { fwd: 0, lat: 0 };
      return { fwd: clip.rootKeys[0](t), lat: clip.rootKeys[1](t) };
    }
    shotResult(ev, sh, spot, kind) {
      if (ev.pending && ev.made === undefined) return null;
      const d = Math.hypot(spot.x - this.rim.x, spot.y - this.rim.y);
      const res = { made: !!ev.made, blocked: !!ev.blocked };
      if (res.blocked) res.type = 'blocked';
      else if (res.made) {
        const r = Math.random();
        const angle = Math.abs(Math.atan2(spot.y - 25, Math.abs(spot.x - this.rim.x)));
        if (RIM_SHOTS[kind] && (kind === 'dunk' || kind === 'alley')) res.type = 'dunk';
        else if (kind === 'layup' || kind === 'reverse') res.type = r < 0.55 ? 'bank' : 'rim_in';
        else if (d > 8 && d < 17 && angle > 0.5 && angle < 1.2 && r < 0.18) res.type = 'bank';
        else res.type = r < 0.62 ? 'swish' : 'rim_in';
      } else {
        const r = Math.random();
        res.type = (d > 22 && r < 0.03) ? 'airball' : 'miss';
        res.contact = r < 0.4 ? 'front' : r < 0.72 ? 'back' : r < 0.9 ? (Math.random() < 0.5 ? 'left' : 'right') : 'board';
        res.rattle = Math.random() < 0.3 && res.contact !== 'board';
      }
      return res;
    }
    planContest(ev, sh, spot, fireAt) {
      const v = this.v;
      const df = this.A(ev.defender) || this.guardOf(sh.id) || this.nearestTo(this.def, spot.x, spot.y);
      if (df && df.team === this.def) {
        const contest = ev.contest || 'contested';
        const gap = contest === 'tight' ? 2.4 : contest === 'contested' ? 3.8 : 7.5;
        const dx = this.rim.x - spot.x, dy = this.rim.y - spot.y, dl = Math.hypot(dx, dy) || 1;
        const cp = this.clampCourt({ x: spot.x + dx / dl * gap, y: spot.y + dy / dl * gap }, 0.5);
        const arrive = contest === 'open' ? fireAt + 0.35 : fireAt - 0.3;
        this.dtask[df.id] = { until: fireAt + 1.4 };
        df.moveTo(cp.x, cp.y, { by: arrive, speed: df.maxSpeed, face: { x: spot.x, y: spot.y }, stance: 'defense' });
        // closeout: sprint the first part, then short chop steps under control over the last ~8 ft, hand up
        const chop = () => {
          if (df.isBusy() || df.goal.mode !== 'move') return;
          const dd = Math.hypot(df.goal.x - df.x, df.goal.y - df.y);
          if (dd < 8 && df.speed > 8) { df.goal.speed = 9; df.goal.by = null; df.setStance('defense'); if (!df.upper) df.play('contestUp', { mirror: false }); return; }
          if (this.T < arrive + 0.3) this.at(this.T + 0.08, chop, 'chop');
        };
        this.at(this.T + 0.15, chop, 'chop');
        this.at(fireAt - (contest === 'tight' ? 0.22 : 0.3), () => {
          if (df.isBusy()) return;
          if (contest === 'tight' && Math.hypot(df.x - spot.x, df.y - spot.y) < 5) df.play('contestJump', { mirror: df.lefty, facing: Math.atan2(spot.y - df.y, spot.x - df.x) });
          else { df.setStance('ready'); df.play('contestUp', { mirror: false }); }
        }, 'contest');
      }
      if (ev.blocked) {
        const bl = this.A(ev.blocker) || df;
        if (bl && bl.team === this.def) {
          const dx = this.rim.x - spot.x, dy = this.rim.y - spot.y, dl = Math.hypot(dx, dy) || 1;
          const bp = this.clampCourt({ x: spot.x + dx / dl * 2.6, y: spot.y + dy / dl * 2.6 }, 0.5);
          this.dtask[bl.id] = { until: fireAt + 1.6 };
          bl.moveTo(bp.x, bp.y, { by: fireAt - 0.4, speed: bl.maxSpeed, face: { x: spot.x, y: spot.y } });
          this.at(fireAt - 0.2, () => { bl.stopClip(0); bl.play('block', { facing: Math.atan2(spot.y - bl.y, spot.x - bl.x), mirror: false }); }, 'block');
        }
      }
      if (ev.fouled) {
        const fo = this.A(ev.fouler) || df;
        if (fo && fo.team === this.def) {
          this.dtask[fo.id] = { until: fireAt + 1.2 };
          this.at(fireAt - 0.15, () => { if (!fo.isBusy()) fo.play('swipe', { mirror: false }); }, 'foul swipe');
        }
      }
      // everyone watches the shot
      for (const a of this.offActors().concat(this.defActors())) a.lookAt(null);
    }
    planRebound(ev, sh, spot, fireAt, result) {
      // find the rebound event this shot leads to (skip same-t fouls/FTs: those are handled by the FT path)
      const i0 = this.events.indexOf(ev);
      let reb = null, blocked = !!ev.blocked;
      for (let i = i0 + 1; i < this.events.length; i++) {
        const e = this.events[i];
        if (e.type === 'rebound') { reb = e; break; }
        if (e.type === 'foul' || e.type === 'ft' || e.type === 'shot' || e.type === 'turnover' || e.type === 'period_end') break;
      }
      this.pendingRebound = null;
      if (!reb || !result || result.made) return;
      const rbA = reb.player != null ? this.A(reb.player) : null;
      const d = Math.hypot(spot.x - this.rim.x, spot.y - this.rim.y);
      const gapG = Math.max(0, (+reb.t || 0) - (+ev.t || 0));
      // carom spot: long shots -> long rebounds, direction biased toward the rebounder
      let ang;
      if (rbA) ang = Math.atan2(rbA.y - this.rim.y, rbA.x - this.rim.x);
      else ang = Math.atan2(spot.y - this.rim.y, spot.x - this.rim.x) + (Math.random() - 0.5);
      const toCourt = Math.atan2(0, -this.dir); // direction from the rim toward half court
      ang = U.angLerp(ang, toCourt, 0.15);
      let cd = rbA ? U.clamp(Math.hypot(rbA.x - this.rim.x, rbA.y - this.rim.y) * 0.6 + (d > 20 ? 4 : 1), 3.5, 15) : 20;
      // an offensive rebound followed by a putback comes off short, near the rim
      const iR = this.events.indexOf(reb);
      const nxt = iR >= 0 ? this.events[iR + 1] : null;
      if (rbA && reb.off && nxt && nxt.type === 'shot' && nxt.shooter === reb.player && (RIM_SHOTS[nxt.kind] || nxt.kind === 'floater')) cd = U.clamp(cd, 3, 5.5);
      let tx = this.rim.x + Math.cos(ang) * cd, ty = this.rim.y + Math.sin(ang) * cd;
      if (!rbA) { // team rebound: out of bounds
        tx = this.rim.x + Math.cos(ang) * 14; ty = ty < 25 ? -3 : 53;
      }
      tx = U.clamp(tx, rbA ? 1 : -3, rbA ? 93 : 97); ty = U.clamp(ty, rbA ? 1 : -4, rbA ? 49 : 54);
      const H = rbA ? rbA.H : 6.6;
      const grabZ = rbA ? U.clamp(1.33 * H + 1.3 + rbA.rVert * 0.8, 8.2, 11.2) : 3;
      this.pendingRebound = { ev: reb, actor: rbA, x: tx, y: ty, z: grabZ, gapG, blocked };
    }
    releaseShot(ev, sh, spot, result, clipName) {
      const v = this.v, b = v.ball;
      if (!result) result = this.shotResult(ev, sh, spot, ev.kind);
      if (b.holder !== sh) this.giveBall(sh);
      b.release();
      b.state = 'flight';
      this.madeShot = result.made ? ev : null;
      this.scored = false;
      const pr = this.pendingRebound;
      const onScore = () => this.reportScore(ev);
      if (result.type === 'blocked') {
        // ball leaves the hand, meets the blocker's hand, deflects to the rebound spot / floor
        const p0 = [b.x, b.y, b.z];
        const dx = this.rim.x - p0[0], dy = this.rim.y - p0[1], dl = Math.hypot(dx, dy) || 1;
        const pHit = [p0[0] + dx / dl * 2.0, p0[1] + dy / dl * 2.0, p0[2] + 1.4];
        const s1 = M.Ball.seg(b.time, p0, M.Ball.aim(p0, pHit, 0.16), 0.16);
        const tgt = pr ? [pr.x, pr.y, pr.actor ? pr.z : 1] : [p0[0] - dx / dl * 10, p0[1] + (Math.random() - 0.5) * 16, 1];
        const T2 = pr ? this.caromTime(pr, 0.16) : 0.9;
        const s2 = M.Ball.seg(s1.t1, pHit, M.Ball.aim(pHit, tgt, T2), T2);
        s2.bounce = true;
        b.flight([s1, s2], null);
        b.passTarget = pr && pr.actor ? pr.actor : null;
        if (pr) this.scheduleRebounder(pr, b.time + 0.16 + T2);
        v.arena.cheer(this.def, 0.9, 2.2);
        if (v.sound) v.sound('block', 1);
        this.crashBoards(sh);
        return;
      }
      const dunkClip = clipName === 'dunk' || clipName === 'dunk2' || clipName === 'alley' || clipName === 'putbackDunk';
      if (dunkClip && !result.made) {
        // missed dunk: slammed off the back rim, carom to the rebounder
        const p0 = [b.x, b.y, b.z];
        const back = [this.rim.x + this.dir * 0.55, this.rim.y + (Math.random() - 0.5) * 0.6, 10.15];
        const s1 = M.Ball.seg(b.time, p0, M.Ball.aim(p0, back, 0.1, 0), 0.1, 0);
        const tgt = pr ? [pr.x, pr.y, pr.actor ? pr.z : 0.8] : [this.rim.x - this.dir * 6, 25 + (Math.random() - 0.5) * 10, 1];
        const T2 = pr ? this.caromTime(pr, 0.1) : 0.9;
        const s2 = M.Ball.seg(s1.t1, back, M.Ball.aim(back, tgt, T2), T2);
        s2.rim = true;
        b.flight([s1, s2], null);
        b.shotHoop = this.hoop; b.onScore = null;
        b.passTarget = pr && pr.actor ? pr.actor : null;
        if (pr) { this.scheduleRebounder(pr, b.time + 0.1 + T2); this.pendingRebound.tGrab = b.time + 0.1 + T2; }
        this.hoop.hitRim(2.5);
        v.arena.cheer(this.def, 0.8, 1.8);
        this.crashBoards(sh, true);
        return;
      }
      if (result.type === 'dunk' || dunkClip) {
        // ball stuffed through the rim
        const p0 = [b.x, b.y, b.z];
        const pr0 = [this.rim.x, this.rim.y, 10.25];
        const segs = [M.Ball.seg(b.time, p0, M.Ball.aim(p0, pr0, 0.12, 0), 0.12, 0)];
        b.flight(segs, null);
        b._throughNet(segs, [this.rim.x, this.rim.y, 10.0], segs[0].t1, this.hoop, {}, true);
        b.shotHoop = this.hoop; b.onScore = onScore; b.onRim = null;
        this.hoop.hang(1);
        if (!result.made) { /* dunk miss: treat as rim miss */ }
        v.arena.cheer(this.off, 1, 3);
        if (v.sound) v.sound('dunk', 1);
        this.at(this.T + 0.35, () => { this.hoop.hitRim(2); }, 'rim shake');
        this.crashBoards(sh, true);
        return;
      }
      const opts = { hoop: this.hoop, result: result.type, miss: { contact: result.contact, rattle: result.rattle }, onScore };
      const d = Math.hypot(spot.x - this.rim.x, spot.y - this.rim.y);
      if (clipName === 'floater') opts.angle = 62;
      if (d < 5) opts.angle = 60;
      if (pr && !result.made) {
        // carom timing to meet the rebounder at the apex of his jump
        opts.rebound = { x: pr.x, y: pr.y, z: pr.actor ? pr.z : 0.8, t: 0, floor: !pr.actor };
      }
      // preview time to contact to set the carom arrival
      const info = b.shoot(Object.assign({}, opts, { rebound: opts.rebound ? Object.assign({}, opts.rebound, { t: b.time + 5 }) : undefined }));
      if (pr && !result.made) {
        // rebuild with the proper carom time
        const tContact = info.tContact;
        const tCarom = this.caromTime(pr, tContact - b.time);
        b.x = info.segs[0].p0[0]; b.y = info.segs[0].p0[1]; b.z = info.segs[0].p0[2];
        const info2 = b.shoot(Object.assign({}, opts, { rebound: { x: pr.x, y: pr.y, z: pr.actor ? pr.z : 0.8, t: tContact + tCarom, floor: !pr.actor } }));
        b.passTarget = pr.actor;
        this.scheduleRebounder(pr, info2.tEnd && pr.actor ? tContact + tCarom : tContact + tCarom);
        this.pendingRebound.tGrab = tContact + tCarom;
      }
      if (result.made) {
        const three = (+ev.pts === 3);
        v.arena.cheer(this.off, three ? 0.95 : 0.7, three ? 3 : 2);
      }
      this.crashBoards(sh);
      // shooter reaction after landing
      const hype = this.intensity();
      this.at(this.T + 1.0, () => {
        if (!result.made || sh.isBusy() || Math.random() >= 0.4 + hype * 0.4) return;
        const big = hype > 0.55 && Math.random() < 0.5;
        sh.play((+ev.pts === 3) ? 'threeFingers' : big ? 'flex' : 'fistPump', { mirror: false });
      }, 'celebrate');
    }
    caromTime(pr, tToContact) {
      const want = pr.gapG > 0 ? pr.gapG - tToContact : 0.9;
      const dist = Math.hypot(pr.x - this.rim.x, pr.y - this.rim.y);
      return U.clamp(want, 0.45 + dist * 0.03, 1.5 + dist * 0.05);
    }
    reportScore(ev) {
      if (this.scored) return;
      this.scored = true;
      if (+ev.pts === 3 && this.threeRef) { const r = this.threeRef; r.upper = null; r.play('refThreeGood'); this.threeRef = null; }
      const e = { type: 'score', team: ev.team != null ? ev.team : this.off, pts: +ev.pts || 2, shotEvent: ev, t: ev.t };
      if (this.cb.onEvent) U.safe(() => this.cb.onEvent(e), null, 'onEvent score');
      this.v.onEmit(e);
    }
    scheduleRebounder(pr, tGrabBall) {
      const a = pr.actor;
      if (!a) return;
      const clip = M.Anims.get('rebound');
      const grabOff = clip.events.grab;
      // absolute presentation time of the grab (ball time is presentation time)
      const tGrab = this.T + (tGrabBall - this.v.ball.time);
      const clipStart = tGrab - grabOff;
      const lock = (d) => { if (a.team === this.off) this.lockOff(a, d); else this.lockDef(a, d); };
      lock(tGrab - this.T + 1.2);
      // stand under the carom spot, slightly back
      a.moveTo(pr.x, pr.y, { by: clipStart - 0.05, speed: a.maxSpeed, face: this.rim, stance: 'ready' });
      this.at(clipStart, () => {
        a.stopClip(0);
        // jump where he is if he could not get to the spot; the ball homes to his hands
        const far = Math.hypot(a.x - pr.x, a.y - pr.y) > 2.2;
        const ox = far ? a.x : pr.x, oy = far ? a.y : pr.y;
        a.play('rebound', { x: ox, y: oy, facing: Math.atan2(this.rim.y - oy, this.rim.x - ox), mirror: false, fadeIn: 0.06, blendT: far ? 0.05 : 0.2 });
        const b = this.v.ball;
        if (b.segs && b.segs.length) {
          const last = b.segs[b.segs.length - 1];
          last.target = () => { const p = a.heldBallPos(TMPB); return [p[0], p[1], p[2]]; };
          // the carom lands in his hands at the grab (clip ball key at grab ~ above the head)
        }
      }, 'rebound jump');
      pr.tGrabT = tGrab;
    }
    crashBoards(sh, quick) {
      // box-outs and crashing
      const T = this.T;
      const pr = this.pendingRebound;
      for (const d of this.defActors()) {
        if (d.isBusy() || (pr && pr.actor === d)) continue;
        const m = this.A(this.matchup[d.id]) || this.nearestTo(this.off, d.x, d.y);
        if (!m) continue;
        this.dtask[d.id] = { until: T + 2.2 };
        this.at(T + (quick ? 0.2 : 0.4), () => {
          if (d.isBusy() || (pr && pr.actor === d)) return;
          d.setStance('boxout');
          d.track(() => { const dx = m.x - this.rim.x, dy = m.y - this.rim.y, dl = Math.hypot(dx, dy) || 1; const k = Math.min(dl - 2.2, 6); return { x: this.rim.x + dx / dl * Math.max(3, dl - 2.4), y: this.rim.y + dy / dl * Math.max(3, dl - 2.4), vx: 0, vy: 0 }; void k; }, { stance: 'boxout' });
          d.setFace(() => Math.atan2(this.rim.y - d.y, this.rim.x - d.x));
        }, 'boxout');
      }
      for (const o of this.offActors()) {
        if (o === sh || o.isBusy() || (pr && pr.actor === o)) continue;
        const r = this.role[o.id]; if (!r) continue;
        const big = o.H > 6.7;
        if (big || Math.random() < 0.3) {
          r.until = T + 2.0;
          this.at(T + 0.3, () => { if (!o.isBusy() && !(pr && pr.actor === o)) o.moveTo(this.rim.x + (o.x - this.rim.x) * 0.35, 25 + (o.y - 25) * 0.4, { speed: 16, face: this.rim }); }, 'crash');
        } else {
          r.until = T + 2.0;
          this.at(T + 0.5, () => { if (!o.isBusy()) o.moveTo(this.X(40), o.y, { speed: 10 }); }, 'get back');
        }
      }
    }
    freeze(ev, sh) {
      if (this.resumeReq) return;
      this.frozen = true;
      this.freezeEv = ev;
      this.emit(ev);
    }
    unfreeze() {
      this.frozen = false;
      this.resumeReq = false;
      const ev = this.freezeEv;
      this.freezeEv = null;
      // the host resolved the shot: release the hold and re-plan the result/rebound with the new events
      const sh = ev ? this.A(ev.shooter) : null;
      if (this.shotClipState) this.shotClipState.hold = null;
      if (ev && this.beat && this.beat.ev === ev) {
        const clip = this.shotClipState ? this.shotClipState.clip : null;
        const rel = clip ? clip.events.release - (clip.events.set || 0) : 0.15;
        this.beat.fireAt = this.T + Math.max(0.05, rel);
        const spot = { x: +ev.x, y: +ev.y };
        const result = this.shotResult(ev, sh, spot, ev.kind);
        this.beat.onFire = () => this.releaseShot(ev, sh, spot, result, clip ? clip.name : 'jumpshot');
        this.planRebound(ev, sh, spot, this.beat.fireAt, result);
        if (ev.blocked || ev.fouled) this.planContest(Object.assign({}, ev, { contest: 'open' }), sh, spot, this.beat.fireAt);
      }
    }

    // --- rebound
    p_rebound(ev, beat, gap) {
      const v = this.v;
      const pr = this.pendingRebound && this.pendingRebound.ev === ev ? this.pendingRebound : null;
      const a = ev.player != null ? this.A(ev.player) : null;
      const b = v.ball;
      if (pr && pr.tGrabT != null) {
        const need = Math.max(0.05, pr.tGrabT - this.T);
        beat.onFire = () => this.secureRebound(ev, a);
        beat.waitFor = () => !a || b.state !== 'flight' || Math.hypot(b.x - a.x, b.y - a.y) < 4 || this.T > pr.tGrabT + 0.4;
        return need;
      }
      // unplanned rebound (e.g. after a free throw or a missing shot event): quick scramble
      if (b.state === 'flight' || b.state === 'loose') {
        const tEnd = Math.max(0, b.flightEnd() - b.time);
        if (a) {
          const p = b.posAt(b.flightEnd(), TMPA);
          a.moveTo(p[0], p[1], { by: this.T + tEnd, speed: a.maxSpeed, face: 'move' });
          if (a.team === this.off) this.lockOff(a, tEnd + 1); else this.lockDef(a, tEnd + 1);
        }
        beat.onFire = () => this.secureRebound(ev, a);
        return Math.max(0.4, Math.min(tEnd, 2.5));
      }
      beat.onFire = () => this.secureRebound(ev, a);
      return 0.4;
    }
    secureRebound(ev, a) {
      const v = this.v, b = v.ball;
      this.pendingRebound = null;
      if (!a) {
        // team rebound: ball out of bounds, dead
        const ref = v.nearestRef(b.x, b.y);
        if (ref) ref.play('refOut');
        b.placeAt(U.clamp(b.x, -2, 96), U.clamp(b.y, -2, 52), 0.4);
        return;
      }
      if (b.holder !== a) {
        if (b.holder) b.release();
        b.give(a, 'chest');
      }
      a.ballHold = 'chest';
      if (ev.off) {
        this.sc0 = 14; this.scT = this.g;
        this.at(this.T + 0.5, () => this.unlockAll([a.id]), 'oreb unlock');
        this.assignSpots(this.play === 'transition' ? 'spot' : (this.play || 'spot'));
        const r = this.role[a.id]; if (r) { r.until = this.T + 0.6; r.spot = { x: a.x, y: a.y }; }
        v.arena.cheer(this.off, 0.5, 1.2);
      } else {
        v.arena.cheer(this.def, 0.4, 1.0);
        // the new offense: defenders release; everyone starts heading the other way
        for (const d of this.defActors()) this.dtask[d.id] = { until: this.T + 5 };
        for (const o of this.offActors()) { const r = this.role[o.id]; if (r) r.until = this.T + 5; }
        this.flipAfterChange(a);
      }
    }
    /** after a change of possession inside this possession's tail: players start to transition */
    flipAfterChange(newHolder) {
      const v = this.v;
      const newOffDir = -this.dir;
      const X2 = (u) => newOffDir > 0 ? 94 - u : u;
      for (const d of this.defActors()) {
        if (d === newHolder || d.isBusy()) continue;
        this.at(this.T + 0.3 + Math.random() * 0.4, () => { if (!d.isBusy()) d.moveTo(X2(30 + Math.random() * 20), 6 + Math.random() * 38, { speed: 16 }); }, 'leak out');
      }
      for (const o of this.offActors()) {
        if (o.isBusy()) continue;
        this.at(this.T + 0.3 + Math.random() * 0.5, () => { if (!o.isBusy()) o.moveTo(X2(10 + Math.random() * 14), 12 + Math.random() * 26, { speed: 14 }); }, 'get back');
      }
    }
    // --- turnover
    p_turnover(ev, beat, gap) {
      const v = this.v, b = v.ball;
      const kind = ev.kind || 'lost_ball';
      const who = this.A(ev.player) || b.holder;
      const st = ev.stealer != null ? this.A(ev.stealer) : null;
      const ref = () => v.nearestRef(b.x, b.y);
      if (who && who.team === this.off && b.holder !== who) this.ensureBall(who);
      if (kind === 'bad_pass') {
        const tgt = this.pick(this.offActors().filter((a) => a !== who)) || who;
        const flight = who && tgt ? U.clamp(Math.hypot(tgt.x - who.x, tgt.y - who.y) / 36, 0.3, 1.2) : 0.5;
        if (st) {
          // stealer jumps the passing lane: intercept ~60% along the pass line
          beat.onStart = (fireAt) => {
            const f = 0.62;
            const ix = who.x + (tgt.x - who.x) * f, iy = who.y + (tgt.y - who.y) * f;
            this.lockDef(st, 4);
            st.moveTo(ix, iy, { by: fireAt - 0.02, speed: st.maxSpeed, face: { x: who.x, y: who.y } });
            this.at(fireAt - flight * f - 0.26, () => {
              if (b.holder !== who) return;
              if (b.state === 'dribble') b.give(who, 'chest');
              who.setFace({ x: tgt.x, y: tgt.y }); who.play('passChest');
            }, 'bad pass windup');
            this.at(fireAt - flight * f, () => {
              if (b.holder !== who) this.giveBall(who, 'chest');
              b.release();
              this.passBall(who, st, 'chest', flight * f, () => { st.ballHold = 'chest'; });
            }, 'bad pass release');
          };
          beat.onFire = () => { if (b.holder !== st) this.giveBall(st, 'chest'); v.arena.cheer(st.team, 0.8, 2); this.afterSteal(st); };
          return flight + 0.5;
        }
        // overthrown out of bounds
        beat.onStart = (fireAt) => {
          this.at(fireAt - flight - 0.26, () => { if (b.holder === who) { if (b.state === 'dribble') b.give(who, 'chest'); who.play('passChest'); } }, 'wild pass');
          this.at(fireAt - flight, () => {
            if (b.holder !== who) this.giveBall(who, 'chest');
            const oy = who.y < 25 ? -4 : 54;
            b.release();
            b.pass([who.x + (tgt.x - who.x) * 1.4, oy, 3], flight, { flat: true });
          }, 'wild pass release');
        };
        beat.onFire = () => { const r = ref(); if (r) r.play('refOut'); this.deadBall(); };
        return flight + 0.4;
      }
      if (kind === 'lost_ball') {
        if (st) {
          beat.onStart = (fireAt) => {
            this.lockDef(st, 4);
            st.track(() => ({ x: who.x + Math.cos(who.facing) * 2.3, y: who.y + Math.sin(who.facing) * 2.3, vx: who.vx, vy: who.vy }), { stance: 'defense' });
            this.at(fireAt - 0.22, () => { st.play('swipe', { mirror: false }); }, 'swipe');
          };
          beat.onFire = () => {
            // poke: ball squirts loose, stealer recovers
            const ang = who.facing + Math.PI + (Math.random() - 0.5) * 1.2;
            b.release();
            b.x = who.x + Math.cos(who.facing) * 1.2; b.y = who.y + Math.sin(who.facing) * 1.2; b.z = Math.max(1.2, b.z);
            b.loose([Math.cos(ang) * 9, Math.sin(ang) * 9, 3]);
            this.chaseLoose(st);
            v.arena.cheer(st.team, 0.7, 1.8);
          };
          return 0.7;
        }
        beat.onFire = () => {
          b.release();
          const oy = who.y < 25 ? -1 : 1;
          b.loose([(Math.random() - 0.5) * 6, oy * -11, 2]);
          this.at(this.T + 0.8, () => { const r = ref(); if (r) r.play('refOut'); this.deadBall(); }, 'oob');
        };
        return 0.4;
      }
      if (kind === 'offensive_foul') {
        const df = this.guardOf(who ? who.id : null) || this.nearestTo(this.def, who.x, who.y);
        beat.onStart = (fireAt) => {
          if (df) {
            const dx = this.rim.x - who.x, dy = this.rim.y - who.y, dl = Math.hypot(dx, dy) || 1;
            const set = { x: who.x + dx / dl * 7, y: who.y + dy / dl * 7 };
            this.lockDef(df, 5);
            df.moveTo(set.x, set.y, { by: fireAt - 0.45, speed: df.maxSpeed, face: { x: who.x, y: who.y }, stance: 'defense' });
            this.lockOff(who, 4);
            this.at(fireAt - 0.9, () => { if (b.holder === who && b.state !== 'dribble') b.dribble(who); who.moveTo(set.x, set.y, { speed: 16, face: 'move', stance: 'dribble' }); }, 'drive into');
          }
        };
        beat.onFire = () => {
          if (df) { df.stopClip(0); df.play('fall', { facing: Math.atan2(who.y - df.y, who.x - df.x), mirror: false }); }
          who.moveTo(who.x, who.y, { speed: 2 });
          if (b.holder === who) b.give(who, 'chest');
          const r = ref(); if (r) r.play('refCharge');
          v.whistle();
          this.deadBall(who);
        };
        return 1.0;
      }
      // violations: whistle / horn + signal
      beat.onFire = () => {
        const r = ref();
        const clip = kind === 'travel' ? 'refTravel' : kind === 'three_seconds' ? 'refThreeSec' : kind === 'shot_clock' ? 'refShotClock' : 'refOut';
        if (r) r.play(clip);
        if (kind === 'shot_clock') v.horn(); else v.whistle();
        if (b.holder) b.give(b.holder, 'chest');
        this.deadBall(b.holder);
      };
      if (kind === 'shot_clock') { beat.onStart = () => { this.sc0 = Math.max(0, ev.t - this.g) + 0.0; this.scT = this.g; }; }
      return 0.3;
    }
    pick(arr) { return arr.length ? arr[(Math.random() * arr.length) | 0] : null; }
    afterSteal(st) {
      for (const d of this.defActors()) this.dtask[d.id] = { until: this.T + 5 };
      for (const o of this.offActors()) { const r = this.role[o.id]; if (r) r.until = this.T + 5; }
      this.flipAfterChange(st);
      st.moveTo(st.x - this.dir * 12, st.y, { speed: st.maxSpeed, face: 'move' });
    }
    chaseLoose(st) {
      const b = this.v.ball;
      const p = b.posAt(b.time + 0.7, TMPA);
      st.moveTo(p[0], p[1], { speed: st.maxSpeed, face: 'move' });
      this.at(this.T + 0.75, () => { b.give(st, 'chest'); this.afterSteal(st); }, 'recover');
    }
    deadBall(holder) {
      // everyone relaxes
      for (const a of this.offActors().concat(this.defActors())) {
        if (a.isBusy()) continue;
        const r = this.role[a.id]; if (r) r.until = this.T + 6;
        this.dtask[a.id] = { until: this.T + 6 };
        a.moveTo(a.x + (Math.random() - 0.5) * 3, a.y + (Math.random() - 0.5) * 3, { speed: 4, stance: 'stand' });
      }
      this.refRetrieve(0.7);
      void holder;
    }
    /** nearest ref gets the dead ball: a player tosses it to him, or he picks it up */
    refRetrieve(delay) {
      const v = this.v, b = v.ball;
      this.at(this.T + (delay || 0.6), () => {
        const ref = v.nearestRef(b.x, b.y);
        if (!ref || b.holder === ref) return;
        const h = b.holder;
        if (h && h.kind === 'player') {
          if (b.state === 'dribble') b.give(h, 'chest');
          const d = Math.hypot(ref.x - h.x, ref.y - h.y);
          this.passBall(h, ref, 'chest', U.clamp(d / 22, 0.3, 1.2), null);
        } else {
          ref.moveTo(U.clamp(b.x, -1, 95), U.clamp(b.y, -1, 51), { speed: 10, face: 'move' });
          this.at(this.T + 0.9, () => { if (b.holder !== ref && (!b.holder || b.holder.kind !== 'player')) this.giveBall(ref, 'chest'); }, 'ref picks up');
        }
      }, 'ref retrieve');
    }
    // --- foul
    p_foul(ev, beat, gap) {
      const v = this.v;
      const fouler = this.A(ev.fouler), on = this.A(ev.on);
      const kind = ev.kind || 'personal';
      const shooting = kind === 'shooting';
      if (!shooting && kind !== 'offensive' && fouler && on && Math.hypot(fouler.x - on.x, fouler.y - on.y) > 3.5) {
        // get the fouler there first
        beat.onStart = (fireAt) => {
          this.dtask[fouler.id] = { until: fireAt + 1 };
          fouler.moveTo(on.x + Math.cos(on.facing) * 2.2, on.y + Math.sin(on.facing) * 2.2, { by: fireAt - 0.2, speed: fouler.maxSpeed, stance: 'defense' });
          this.at(fireAt - 0.2, () => { if (!fouler.isBusy()) fouler.play('swipe', { mirror: false }); }, 'foul swipe');
        };
      }
      beat.onFire = () => {
        const ref = v.nearestRef(on ? on.x : v.ball.x, on ? on.y : v.ball.y);
        if (ref) ref.play('refFoul');
        v.whistle();
        if (!shooting) {
          const b = v.ball;
          if (b.holder && b.state === 'dribble') b.give(b.holder, 'chest');
          if (kind !== 'offensive' && (+ev.fts || 0) === 0) { this.sc0 = Math.max(14, this.shotClock()); this.scT = this.g; }
          this.deadBall();
        }
        if (fouler && !fouler.isBusy() && Math.random() < 0.4) this.at(this.T + 0.6, () => { if (!fouler.isBusy()) fouler.play('dejected', { mirror: false }); }, 'foul reaction');
      };
      if (shooting) return Math.max(0.05, this.lastShot && this.lastShot.t === ev.t ? 0.3 : 0.2);
      return 0.35;
    }
    // --- free throw
    p_ft(ev, beat, gap) {
      const v = this.v, b = v.ball;
      beat.dead = true;
      beat.noEmit = true;
      const sh = this.A(ev.shooter) || this.nearestTo(this.off, this.rim.x, 25);
      if (!sh) return 0.3;
      const first = !this.ftSetup;
      const lineU = 19 + 0.9;
      const spot = this.P(lineU, 25);
      const facing = this.rimAngleFrom(spot.x, spot.y);
      const clip = M.Anims.get('freethrow');
      const rel = clip.events.release;
      let setup = 0;
      const busy = sh.clip ? Math.max(0, (sh.clip.clip.dur - sh.clip.t) / (sh.clip.speed || 1)) : 0;
      if (first) {
        this.ftSetup = true;
        setup = Math.max(this.placeForFT(sh), busy + Math.hypot(sh.x - spot.x, sh.y - spot.y) / 10 + 0.4);
        v.camHint = { x: this.rim.x - this.dir * 11.5, hold: 99, tight: true }; // shooter and basket both in the picture
      } else {
        // the last one has to come down through the net and the official has to get it back first
        setup = Math.max(1.5, busy);
      }
      const lead = v.nearestRef(this.rim.x, 25) || v.refs[0];
      const routine = 2.2;
      const tFlight = 1.05;
      const need = setup + routine + rel + tFlight;
      const made = !!ev.made;
      const lastOne = (+ev.num || 1) >= (+ev.of || 1);
      beat.onStart = (fireAt) => {
        const tRelease = fireAt - tFlight;
        const tClip = tRelease - rel;
        const r = this.role[sh.id]; if (r) r.until = fireAt + 1.5;
        sh.moveTo(spot.x, spot.y, { by: tClip - routine + 0.3, speed: 12, face: facing, stance: 'stand', pace: 4.4 });
        // ref bounces the ball to the shooter
        if (lead) {
          // the official bounces the ball to the shooter from beside the lane, then steps out to the baseline so
          // nobody but the lane players is near the lane when the ball is released
          const rp = this.P(15.5, 25 + (lead.y < 25 ? -9.5 : 9.5));
          const toLane = () => { if (!lead.isBusy()) lead.moveTo(rp.x, rp.y, { speed: 9, face: { x: spot.x, y: spot.y } }); };
          if (first) toLane(); else this.at(this.T + 1.0, toLane, 'ref to lane');
          this.at(tClip - routine + 0.1, () => {
            if (b.holder !== lead) this.giveBall(lead, 'chest');
            lead.ballHold = 'chest';
            const d = Math.hypot(sh.x - lead.x, sh.y - lead.y);
            this.passBall(lead, sh, 'bounce', U.clamp(d / 26, 0.4, 0.9), () => { b.dribble(sh, sh.lefty ? 0 : 1, { period: 0.62 }); sh.setFace(facing); });
          }, 'ref bounce');
          this.at(tClip - routine + 0.9, () => {
            const out = this.P(1.2, 25 + (lead.y < 25 ? -11 : 11));
            if (!lead.isBusy()) lead.moveTo(out.x, out.y, { speed: 8, face: { x: this.rim.x, y: 25 } });
          }, 'ref steps out');
        }
        this.at(tClip - 0.35, () => { if (b.holder === sh) b.give(sh, 'pocket'); }, 'ft set');
        this.at(tClip - routine + 0.35, () => {
          // safety: make sure he is heading to the line (and hurries if late)
          if (!sh.isBusy() && Math.hypot(sh.x - spot.x, sh.y - spot.y) > 0.8) sh.moveTo(spot.x, spot.y, { speed: 14, face: facing, stance: 'stand' });
        }, 'ft walk check');
        this.at(tClip, () => {
          if (b.holder !== sh) this.giveBall(sh, 'pocket');
          sh.stopClip(0);
          sh.play('freethrow', { x: spot.x, y: spot.y, facing, fadeIn: 0.15 });
        }, 'ft clip');
        this.at(tRelease, () => {
          if (b.holder !== sh) this.giveBall(sh, 'pocket');
          b.release(); b.state = 'flight';
          const res = made ? (Math.random() < 0.7 ? 'swish' : 'rim_in') : 'miss';
          const contact = Math.random() < 0.5 ? 'front' : 'back';
          let rebound;
          if (!made) {
            if (lastOne) {
              const nxt = this.findNext((e) => e.type === 'rebound');
              const ra = nxt && nxt.player != null ? this.A(nxt.player) : null;
              if (ra) {
                const ang = Math.atan2(ra.y - this.rim.y, ra.x - this.rim.x);
                rebound = { x: this.rim.x + Math.cos(ang) * 4.5, y: this.rim.y + Math.sin(ang) * 4.5, z: U.clamp(1.33 * ra.H + 1.2, 8.2, 10.8), t: 0 };
                this.pendingRebound = { ev: nxt, actor: ra, x: rebound.x, y: rebound.y, z: rebound.z, gapG: 0 };
              }
            }
            if (!rebound) rebound = { x: this.rim.x - this.dir * 3, y: 25 + (Math.random() - 0.5) * 6, z: 0.8, t: 0, floor: true };
          }
          const info = b.shoot({ hoop: this.hoop, result: res, miss: { contact, rattle: false }, angle: 52, rebound: rebound ? Object.assign({}, rebound, { t: b.time + 5 }) : undefined, onScore: () => {} });
          if (rebound) {
            const tC = info.tContact;
            b.x = info.segs[0].p0[0]; b.y = info.segs[0].p0[1]; b.z = info.segs[0].p0[2];
            b.shoot({ hoop: this.hoop, result: res, miss: { contact, rattle: false }, angle: 52, rebound: Object.assign({}, rebound, { t: tC + 0.8 }), onScore: () => {} });
            if (this.pendingRebound && this.pendingRebound.actor) {
              this.scheduleRebounder(this.pendingRebound, tC + 0.8);
              this.pendingRebound.tGrab = tC + 0.8;
            }
            if (lastOne) this.laneCrash();
          }
        }, 'ft release');
      };
      beat.onFire = () => {
        this.emit(ev);
        if (made) v.arena.cheer(this.off, 0.35, 0.8);
        if (lastOne) {
          this.ftSetup = false;
          v.camHint = null;
          const keep = this.pendingRebound && this.pendingRebound.actor ? [this.pendingRebound.actor.id] : [];
          this.at(this.T + (made ? 0.2 : 1.4), () => this.unlockAll(keep), 'ft unlock');
        }
        // between free throws: ref gets the ball back
        if (!lastOne) {
          const ref = v.nearestRef(this.rim.x, 25);
          if (ref) ref.moveTo(this.rim.x - this.dir * 3.5, 22 + Math.random() * 6, { speed: 12, face: { x: this.rim.x, y: 25 } });
          // catch it on the way down through the net / off the first bounce
          this.at(this.T + 0.9, () => { if (ref && b.holder !== ref) this.giveBall(ref, 'chest'); }, 'ref retrieves');
        }
      };
      return need;
    }
    placeForFT(shooter) {
      const v = this.v;
      // A missed shot before the whistle queued box-outs, crashes and get-backs, and set defenders to follow their
      // man. Those orders would drag players off their lane spots (a defender boxing out the shooter ends up
      // standing in front of him at the line), so the lineup replaces them all.
      const STALE = { boxout: 1, crash: 1, 'get back': 1, 'leak out': 1, retreat: 1, recover: 1, 'def on': 1, contest: 1, 'closeout early': 1 };
      this.jobs = this.jobs.filter((j) => !STALE[j.tag]);
      for (const a of this.offActors().concat(this.defActors())) {
        if (a === shooter) continue;
        if (a.goal && a.goal.mode === 'track') a.stop();
        a.setFace(() => Math.atan2(this.rim.y - a.y, this.rim.x - a.x));
      }
      const offs = this.offActors().filter((a) => a !== shooter), defs = this.defActors();
      const lane = [[7.6, 15.6], [7.6, 34.4], [14.5, 34.4], [11.5, 15.6], [11.5, 34.4], [14.5, 15.6]];
      const slots = [];
      // defense: both first spots + one third spot; offense: second spots
      const dSpots = [lane[0], lane[1], lane[2]], oSpots = [lane[3], lane[4]];
      const bigD = defs.slice().sort((a, b) => b.H - a.H);
      const bigO = offs.slice().sort((a, b) => b.H - a.H);
      let maxT = 0;
      const put = (a, u, vv, face, stance) => {
        if (!a) return;
        const p = this.P(u, vv);
        const d = Math.hypot(a.x - p.x, a.y - p.y);
        const sp = d > 18 ? 13 : 8;
        maxT = Math.max(maxT, d / (sp * 0.85));
        const r = this.role[a.id]; if (r) r.until = this.T + 60;
        this.dtask[a.id] = { until: this.T + 60 };
        a.moveTo(p.x, p.y, { speed: sp, face: face || { x: this.rim.x, y: 25 }, stance: stance || 'handsKnees' });
      };
      bigD.slice(0, 3).forEach((a, i) => put(a, dSpots[i][0], dSpots[i][1], { x: this.X(dSpots[i][0]), y: 25 }));
      bigO.slice(0, 2).forEach((a, i) => put(a, oSpots[i][0], oSpots[i][1], { x: this.X(oSpots[i][0]), y: 25 }));
      // everyone else behind the arc
      const rest = bigD.slice(3).concat(bigO.slice(2));
      const perims = [[30, 14], [30, 36], [33, 25], [28, 8]];
      // (NBA rule 9: players off the lane stay behind the 3-point line, above the free throw line extended)
      rest.forEach((a, i) => put(a, perims[i % perims.length][0], perims[i % perims.length][1], null, 'stand'));
      void slots;
      const ds = Math.hypot(shooter.x - this.X(19.9), shooter.y - 25);
      maxT = Math.max(maxT, ds / 10);
      return Math.min(6, maxT + 0.5);
    }
    laneCrash() {
      for (const a of this.offActors().concat(this.defActors())) {
        if (a.isBusy()) continue;
        const r = this.role[a.id]; if (r) r.until = this.T + 1.5;
        this.dtask[a.id] = { until: this.T + 1.5 };
        if (Math.abs(a.y - 25) < 12 && Math.abs(a.x - this.rim.x) < 16) {
          a.setStance(a.team === this.def ? 'boxout' : 'ready');
          a.moveTo(a.x + (this.rim.x - a.x) * 0.3, a.y + (25 - a.y) * 0.25, { speed: 10, face: this.rim });
        }
      }
    }
    // --- period end: horn
    p_period_end(ev, beat, gap) {
      const v = this.v;
      beat.onFire = () => {
        v.horn();
        for (const a of this.offActors().concat(this.defActors())) {
          if (a.isBusy()) continue;
          const r = this.role[a.id]; if (r) r.until = this.T + 99;
          this.dtask[a.id] = { until: this.T + 99 };
          a.moveTo(a.x + (47 - a.x) * 0.1, a.y + (-4 - a.y) * 0.25, { speed: 5, stance: 'stand', face: 'move' });
        }
        const b = v.ball;
        if (b.holder && b.state === 'dribble') b.give(b.holder, 'chest');
      };
      // if a shot is in the air, let it finish first
      const b = v.ball;
      if (b.state === 'flight') return Math.max(0.2, Math.min(2.5, b.flightEnd() - b.time));
      return 0.3;
    }
  }

  const TMPA = new Float64Array(3), TMPB = new Float64Array(3);
  const GP = { x: 0, y: 0, vx: 0, vy: 0 };

  M.Director = Director;
})();
