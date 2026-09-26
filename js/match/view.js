/* Pro BBALL Coach — match view (PBC.Match.View): the public API used by the host.
 *   const view = new PBC.Match.View(canvas, ctx, { quality, pixelMode, camera });
 *   view.play(possession, { onEvent, onDone }); view.update(dt * speed); view.render();
 * See docs/MATCH_API.md and docs/MATCH_NOTES.md. */
(function () {
  'use strict';
  const M = window.PBC.Match, U = M.U;
  const STEP = 1 / 60;

  const REF_LOOKS = [
    { id: 'ref1', num: 14, height: 74, weight: 200, gender: 'm', look: { skin: 1, hair: 'bald', hairColor: '#2a1d14', beard: 'none', build: 0.4 } },
    { id: 'ref2', num: 36, height: 75, weight: 205, gender: 'm', look: { skin: 6, hair: 'buzz', hairColor: '#111', beard: 'stubble', build: 0.4 } },
    { id: 'ref3', num: 58, height: 72, weight: 190, gender: 'm', look: { skin: 3, hair: 'fade', hairColor: '#3a2a1c', beard: 'none', build: 0.35 } },
  ];

  class View {
    constructor(canvas, ctx, options) {
      this.canvas = canvas;
      this.g = canvas.getContext('2d');
      this.ctx = ctx || {};
      this.opts = Object.assign({ quality: 'high', pixelMode: false, camera: 'broadcast', showNames: false }, options || {});
      this.teamLooks = [this.ctx.home || {}, this.ctx.away || {}];
      this.players = this.ctx.players || {};
      this.defScheme = (this.ctx.defScheme || ['man', 'man']).slice();
      this.onCourt = [((this.ctx.lineups || [])[0] || []).slice(0, 5), ((this.ctx.lineups || [])[1] || []).slice(0, 5)];
      this.cam = new M.Camera();
      this.camRig = new M.CameraRig(this.cam);
      this.camRig.setPreset(this.opts.camera);
      this.court = new M.Court(this.ctx, this.opts);
      this.arena = new M.Arena(this.ctx, this.opts);
      const hc = (this.ctx.home && this.ctx.home.colors) || {};
      this.hoops = [new M.Hoop(-1, hc), new M.Hoop(1, hc)];
      for (const ho of this.hoops) ho.label = String((this.ctx.home && (this.ctx.home.abbr || this.ctx.home.name)) || '').toUpperCase().slice(0, 4);
      this.fr = new M.Figure.FigureRenderer();
      this.ball = new M.Ball(this);
      this.actors = {};
      this.leaving = [];
      this.arriving = [];
      this.refs = REF_LOOKS.map((l) => { const a = new M.Actor(this, l, -1, 'ref'); a.setStance('refStand'); return a; });
      this.time = 0;
      this.period = 1;
      this.score = [0, 0];
      this.focus = { x: 47, vx: 0 };
      this.camHint = null;
      this.director = new M.Director(this);
      this.lastOff = 0;
      this.destroyed = false;
      this._pt = { x: 0, y: 0, s: 0, d: 0 };
      this._tmp = new Float64Array(3);
      this.items = [];
      this.whistleT = -9; this.hornT = -9;
      this.initialLayout();
      // realistic players: load the body data and build everyone's mesh in the background before play starts
      if (M.GL3D && M.Human && this.opts.models !== '2d') {
        M.Human.load().then(ok => {
          if (!ok || this.destroyed) return;
          const R3 = M.GL3D.get(); if (!R3) return;
          const list = [];
          for (const id in this.actors) { const a = this.actors[id]; list.push({ style: a.style, dims: a.dims }); }
          for (const r of this.refs) list.push({ style: r.style, dims: r.dims });
          R3.warm(list);
        });
      }
      this.resize(canvas.clientWidth || canvas.width || 1600, canvas.clientHeight || canvas.height || 900);
      this.camRig.update(0.016, { x: 47, snap: true });
    }

    // ============================================================ host API
    play(poss, cb) {
      if (this.destroyed) return;
      cb = cb || {};
      if (!poss || typeof poss !== 'object') { if (cb.onDone) U.safe(cb.onDone, null, 'onDone'); return; }
      if (this.director.active) { U.warn('play() while a possession is running; finishing it'); this.director.forceFinish(); }
      this.period = poss.period || this.period;
      if (poss.endScore && poss.endScore.length === 2 && this._syncScore) { /* keep live score */ }
      this.lastOff = poss.off === 1 ? 1 : 0;
      this.director.ftSetup = false;
      U.safe(() => this.director.start(poss, cb), this, 'start possession');
      if (!this.director.active && !this.director._startedOk) {
        // start failed badly: never soft-lock
      }
      this.updateBoards();
    }
    update(dt) {
      if (this.destroyed) return;
      dt = +dt;
      if (!(dt > 0)) dt = 0;
      dt = Math.min(dt, 2); // hard cap per call (16x at ~8 fps)
      if (this.replay) {
        U.safe(() => this.updateReplay(dt), this, 'replay');
      } else {
        let left = dt;
        let guard = 0;
        while (left > 1e-7 && guard++ < 200) {
          const h = Math.min(STEP, left);
          left -= h;
          U.safe(() => this.step(h), this, 'step');
          if (h > 0 && this.opts.record !== false) U.safe(() => this.recordFrame(), this, 'record');
        }
        U.safe(() => this.updateCamera(dt), this, 'camera');
      }
      // crowd, LED and jumbotron run on wall-clock time: they keep moving during a GIM freeze
      // (the host calls update(0) while the shot meter is up) and stay calm at 16x
      const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      const real = this._wall ? Math.min(0.1, Math.max(0, (now - this._wall) / 1000)) : 0;
      this._wall = now;
      U.safe(() => this.arena.update(real > 0 ? real : Math.min(dt, 0.1)), this, 'arena');
    }
    render() {
      if (this.destroyed) return;
      U.safe(() => this._render(), this, 'render');
    }
    clock() { return this.director.clock(); }
    shotClock() { return this.director.shotClock(); }
    isIdle() { return !this.director.active; }
    resume() { this.director.resume(); }
    setOption(k, v) {
      this.opts[k] = v;
      if (k === 'camera') this.camRig.setPreset(v);
      if (k === 'quality') { this.court = new M.Court(this.ctx, this.opts); this.arena = new M.Arena(this.ctx, this.opts); this.arena.setState({ score: this.score, period: this.period }); if (this.atm) this.arena.setAtmosphere(this.atm); }
      if (k === 'pixelMode' || k === 'pixelSize') this._pix = null;
    }
    /** game atmosphere: { playoff, level 0..1.25, label ('WEST FINALS · G7'), finals } → crowd, towels, boards, court decals */
    setAtmosphere(atm) {
      this.atm = Object.assign({}, atm || {});
      this.ctx.atmosphere = this.atm;
      U.safe(() => { this.court = new M.Court(this.ctx, this.opts); }, this, 'court atmosphere');
      if (this.arena.setAtmosphere) this.arena.setAtmosphere(this.atm);
    }
    /** sound hook for the host (arena audio): name in 'dribble','bounce','rim','board','swish','net','whistle','horn','dunk' */
    sound(name, v) {
      if (!this.onSound || this.replay) return;
      try { this.onSound(name, v == null ? 1 : v); } catch (e) { /* audio must never break the view */ }
    }
    setDefScheme(team, scheme) {
      if (team !== 0 && team !== 1) return;
      this.defScheme[team] = scheme;
      if (this.director.active && this.director.def === team) this.director.scheme = scheme;
    }
    celebrate(team) {
      const ids = this.onCourt[team] || [];
      ids.forEach((id, i) => {
        const a = this.actor(id);
        if (!a) return;
        const clips = ['fistPump', 'flex', 'clap', 'point'];
        setTimeout(() => { if (!this.destroyed && !a.isBusy()) a.play(clips[i % clips.length], { mirror: false }); }, 0);
      });
      const other = this.onCourt[1 - team] || [];
      other.forEach((id) => { const a = this.actor(id); if (a && !a.isBusy()) a.play('dejected', { mirror: false }); });
      this.arena.cheer(team, 1, 6);
    }
    destroy() {
      this.destroyed = true;
      this.actors = {}; this.refs = []; this.items = [];
      this.director.active = false;
    }
    resize(w, h) {
      this.cssW = Math.max(200, Math.round(w)); this.cssH = Math.max(120, Math.round(h));
      this.dpr = Math.min(2, window.devicePixelRatio || 1);
      this.canvas.width = Math.round(this.cssW * this.dpr);
      this.canvas.height = Math.round(this.cssH * this.dpr);
      this.cam.setSize(this.cssW, this.cssH);
      this.camRig.apply();
      this._pix = null;
    }

    // ============================================================ helpers used by the director
    attacksRight(team, period) {
      const S = window.PBC && window.PBC.Sim;
      if (S && typeof S.attacksRight === 'function') { try { return !!S.attacksRight(team, period); } catch (e) { /* fall through */ } }
      return period <= 2 ? team === 0 : team === 1;
    }
    look(id) { return this.players[id] || null; }
    teamLook(t) { return t === 1 ? this.teamLooks[1] : this.teamLooks[0]; }
    actor(id) {
      if (id == null) return null;
      let a = this.actors[id];
      if (a) return a;
      const look = this.players[id];
      if (!look) return null;
      a = this.createActor(id);
      // appear at the bench if not on court
      const team = look.teamIdx === 1 ? 1 : 0;
      a.place(this.benchX(team), -7, Math.PI / 2);
      return a;
    }
    createActor(id) {
      const look = this.players[id];
      if (!look) return null;
      const team = look.teamIdx === 1 ? 1 : 0;
      const a = new M.Actor(this, Object.assign({}, look, { id }), team, 'player');
      this.actors[id] = a;
      return a;
    }
    benchX(team) { return team === 0 ? 30 : 64; }
    nearestRef(x, y) {
      let best = null, bd = 1e9;
      for (const r of this.refs) { const d = Math.hypot(r.x - x, r.y - y); if (d < bd) { bd = d; best = r; } }
      return best;
    }
    whistle() { this.whistleT = this.time; this.sound('whistle', 1); }
    horn() { this.hornT = this.time; this.sound('horn', 1); }
    onEmit(ev) {
      if (!ev) return;
      if (ev.type === 'score') { const t = ev.team === 1 ? 1 : 0; this.score[t] += +ev.pts || 0; this.updateBoards(); }
      else if (ev.type === 'ft' && ev.made) { const sh = this.players[ev.shooter]; const t = ev.team != null ? ev.team : (sh ? sh.teamIdx : this.director.off); this.score[t === 1 ? 1 : 0] += 1; this.updateBoards(); }
      else if (ev.type === 'shot' && !ev.made && !ev.pending) this.arena.cheer(this.director.def, 0.25, 0.6);
    }
    onPossessionDone(poss) {
      if (poss && Array.isArray(poss.endScore) && poss.endScore.length === 2) this.score = [+poss.endScore[0] || 0, +poss.endScore[1] || 0];
      this.updateBoards();
    }
    updateBoards() {
      const clk = this.director.clock();
      const m = Math.floor(clk / 60), s = clk - m * 60;
      const txt = clk >= 60 ? m + ':' + String(Math.floor(s)).padStart(2, '0') : s.toFixed(1);
      this.arena.setState({ score: this.score, period: this.period, clockText: txt, shotClock: this.director.shotClock() });
      const sc = Math.ceil(this.director.shotClock());
      for (const h of this.hoops) { h.shotClockText = String(Math.max(0, Math.min(24, sc))); h.gameClockText = txt; h.clockOn = sc > 0 || this.director.active; }
    }

    // ============================================================ substitutions
    doSub(e, onCheckIn) {
      const team = e.team === 1 ? 1 : 0;
      const outA = this.actors[e.out];
      const inA = this.actor(e.in);
      if (!inA) { if (onCheckIn) onCheckIn(); return; }
      const idx = this.onCourt[team].indexOf(e.out);
      if (idx >= 0) this.onCourt[team][idx] = e.in; else if (!this.onCourt[team].includes(e.in)) this.onCourt[team].push(e.in);
      if (this.ball.holder === outA && outA) this.ball.give(inA, 'chest');
      inA.hidden = false;
      inA.place(47 + (team === 0 ? -3.5 : 3.5), -8.5, Math.PI / 2);
      const dest = outA ? { x: outA.x, y: Math.max(3, outA.y) } : { x: 47, y: 12 };
      inA.moveTo(dest.x, dest.y, { speed: 11, face: 'move', stance: 'stand' });
      this.arriving.push({ a: inA, t: this.time, cb: onCheckIn, done: false });
      if (outA) {
        outA.moveTo(this.benchX(team) + (Math.random() - 0.5) * 10, -9, { speed: 10, face: 'move', stance: 'stand' });
        this.leaving.push({ a: outA, t: this.time, id: e.out });
      }
    }
    forceSub(e) {
      const team = e.team === 1 ? 1 : 0;
      const idx = this.onCourt[team].indexOf(e.out);
      if (idx >= 0) this.onCourt[team][idx] = e.in;
      const inA = this.actor(e.in);
      if (inA && inA.y < 0) inA.place(Math.max(3, Math.min(91, inA.x)), 3, Math.PI / 2);
      for (const r of this.arriving) if (r.a === inA && !r.done) { r.done = true; }
      const outA = this.actors[e.out];
      if (outA && !this.leaving.some((l) => l.a === outA)) this.leaving.push({ a: outA, t: this.time, id: e.out });
    }
    subBookkeeping() {
      for (const r of this.arriving) {
        if (r.done) continue;
        if (r.a.y > 0.3 || this.time - r.t > 3.2) { r.done = true; if (r.cb) U.safe(r.cb, null, 'sub check-in'); }
      }
      this.arriving = this.arriving.filter((r) => !r.done || this.time - r.t < 5);
      for (const l of this.leaving) {
        if (l.a.y < -7.5 || this.time - l.t > 6) {
          if (!this.onCourt[0].includes(l.id) && !this.onCourt[1].includes(l.id)) { l.a.hidden = true; delete this.actors[l.id]; }
          l.gone = true;
        }
      }
      this.leaving = this.leaving.filter((l) => !l.gone);
    }

    // ============================================================ simulation
    initialLayout() {
      for (const team of [0, 1]) {
        const side = this.attacksRight(team, 1) ? -1 : 1;
        this.onCourt[team].forEach((id, i) => {
          const a = this.createActor(id);
          if (!a) return;
          const ang = (side > 0 ? 0 : Math.PI) + (-0.9 + i * 0.45);
          a.place(47 + Math.cos(ang) * (8 + (i % 2) * 3), 25 + Math.sin(ang) * (9 + (i % 3)), side > 0 ? Math.PI : 0);
          a.setStance('stand');
        });
      }
      this.refs[0].place(47, 20, Math.PI / 2);
      this.refs[1].place(30, -2.5, Math.PI / 2);
      this.refs[2].place(64, 52.5, -Math.PI / 2);
      this.ball.give(this.refs[0], 'chest');
    }
    step(h) {
      const d = this.director;
      if (d.frozen) {
        d.update(0);
      }
      if (!d.frozen) {
        this.time += h;
        d.update(h);
        if (!d.frozen) {
          for (const id in this.actors) {
            const a = this.actors[id];
            if (a.hidden) continue;
            a.update(h, this.time);
            // players warm up with a light sheen and glisten more the longer (and harder) they play
            a.sweat = Math.min(0.92, (a.sweat == null ? 0.3 : a.sweat) + h * (0.0002 + 0.00005 * Math.min(25, a.speed || 0)));
          }
          this.refAmbient(h);
          for (const r of this.refs) r.update(h, this.time);
          this.separate(h);
          this.ball.update(h, this.time);
          this.subBookkeeping();
          this.idleBehaviour(h);
        }
      }
      const b = this.ball;
      const bs = { x: b.x, y: b.y, z: b.z, vx: b.vx, vy: b.vy, vz: b.vz };
      for (const ho of this.hoops) ho.update(h, bs);
      if ((this._boardT = (this._boardT || 0) + h) > 0.1) { this._boardT = 0; this.updateBoards(); }
    }
    /** soft body separation: people may touch but never walk through each other */
    separate(h) {
      const list = this._sepList || (this._sepList = []);
      list.length = 0;
      for (const id in this.actors) { const a = this.actors[id]; if (!a.hidden && a.y > -6) list.push(a); }
      for (const r of this.refs) list.push(r);
      const n = list.length;
      // torsos lean ahead of the feet (defensive stance, sprinting): test the chests too, from the last solve
      const CHS = M.Rig.J.CHS * 3;
      for (const a of list) {
        const P = a.sk && a.sk.P;
        a._chx = P ? U.clamp(P[CHS] - a.x, -1.2, 1.2) : 0; a._chy = P ? U.clamp(P[CHS + 1] - a.y, -1.2, 1.2) : 0;
      }
      for (let i = 0; i < n; i++) {
        const a = list[i];
        const ra = a.H * 0.15;
        for (let j = i + 1; j < n; j++) {
          const b = list[j];
          let dx = b.x - a.x, dy = b.y - a.y;
          let minD = ra + b.H * 0.15;
          let d2 = dx * dx + dy * dy;
          if (d2 > 36) continue;
          const cdx = dx + b._chx - a._chx, cdy = dy + b._chy - a._chy, minC = (a.H + b.H) * 0.125;
          const c2 = cdx * cdx + cdy * cdy;
          if (c2 < minC * minC && minC - Math.sqrt(c2) > minD - Math.sqrt(d2)) { dx = cdx; dy = cdy; d2 = c2; minD = minC; }
          if (d2 >= minD * minD) continue;
          const d = Math.sqrt(d2) || 0.01;
          const push = (minD - d);
          const nx = d > 0.011 ? dx / d : Math.cos(i + j), ny = d > 0.011 ? dy / d : Math.sin(i + j);
          // clips with root motion (shots, jumps) and ball handlers win; the other gives way
          const la = a.isBusy() ? 0 : a.hasBall ? 0.3 : 1, lb = b.isBusy() ? 0 : b.hasBall ? 0.3 : 1;
          const tot = la + lb;
          if (tot <= 0) continue;
          // soft push-out, and a hard floor: torsos never pass into each other (bodies ~1 ft deep)
          let k = Math.min(1, 30 * h) * push;
          const hard = push - minD * 0.2;
          if (hard > k) k = hard;
          a.x -= nx * k * la / tot; a.y -= ny * k * la / tot;
          b.x += nx * k * lb / tot; b.y += ny * k * lb / tot;
          // contact: stop pressing into each other (inelastic along the contact normal) so steering slides
          // them around one another instead of re-penetrating every frame; bodies are soft, so a light touch takes
          // the closing speed off over ~0.1 s (all at once, a runner lost half his speed in one frame and his stride
          // jumped), a deep one at once
          const rv = ((b.vx - a.vx) * nx + (b.vy - a.vy) * ny) * Math.max(1 - Math.exp(-h / 0.05), U.clamp(push / (0.3 * minD), 0, 1));
          if (rv < 0) {
            a.vx += nx * rv * la / tot; a.vy += ny * rv * la / tot;
            b.vx -= nx * rv * lb / tot; b.vy -= ny * rv * lb / tot;
          }
        }
      }
    }
    idleBehaviour(h) {
      if (this.director.active) return;
      // between possessions: ball holder keeps dribbling slowly; nothing else is required
      const b = this.ball;
      if (b.holder && b.holder.kind === 'player' && b.state === 'held' && b.holder.speed > 2) b.dribble(b.holder);
      this.focus = { x: b.x, vx: b.vx * 0.5 };
    }
    refAmbient(h) {
      this._refT = (this._refT || 0) - h;
      if (this._refT > 0) return;
      this._refT = 0.45;
      const d = this.director;
      const dir = d.active ? d.dir : (this.attacksRight(this.lastOff, this.period) ? 1 : -1);
      const X = (u) => dir > 0 ? 94 - u : u;
      const b = this.ball;
      const bu = dir > 0 ? 94 - b.x : b.x;
      const inFront = bu < 47;
      const targets = inFront
        ? [{ x: X(-2.2), y: 16 }, { x: X(U.clamp(bu + 10, 26, 48)), y: -2.4 }, { x: X(U.clamp(bu + 2, 18, 40)), y: 52.4 }]
        : [{ x: X(U.clamp(bu - 30, -2.2, 20)), y: 16 }, { x: X(U.clamp(bu + 12, 40, 70)), y: -2.4 }, { x: X(U.clamp(bu - 4, 28, 60)), y: 52.4 }];
      this.refs.forEach((r, i) => {
        // (an official the director has a job for: fetching the ball, administering a throw-in or a free throw)
        if (r.isBusy() || (b.holder === r) || (d.active && r.taskUntil > d.T)) return;
        const t = targets[i];
        const dd = Math.hypot(r.x - t.x, r.y - t.y);
        if (dd > 1.5) r.moveTo(t.x, t.y, { speed: dd > 12 ? 15 : 8, face: dd > 6 ? 'move' : { x: b.x, y: b.y }, stance: 'refStand' });
        else r.setFace({ x: b.x, y: b.y });
        r.lookAt({ x: b.x, y: b.y });
      });
    }
    updateCamera(dt) {
      const hint = this.camHint;
      let fx = this.focus ? this.focus.x : 47, vx = this.focus ? this.focus.vx : 0;
      if (hint && hint.x != null) { fx = hint.x; vx = 0; }
      this.camRig.tightTarget = hint && hint.tight ? 1 : 0;
      // auto broadcast camera: push in on half-court sets, pull back for transition and dead balls
      const dr = this.director;
      let zt = 0;
      if (dr.active && dr.tempo !== 'push' && dr.U_) { const u = dr.U_(this.ball.x); if (u < 44) zt = 1; }
      this.camRig.zoomTarget = zt;
      // Broadcast operators frame the formation, not just the ball (Disney Research's learned camera predicted the
      // pan from player positions): aim at a blend of the ten players' centroid and the ball, lead with the
      // group's velocity, and hold still inside a dead zone so a swing pass does not drag the shot around.
      if (!(hint && hint.x != null) && dr.active) {
        let sx = 0, svx = 0, n = 0;
        for (const id in this.actors) { const a = this.actors[id]; if (a.hidden || a.kind !== 'player') continue; sx += a.x; svx += a.vx || 0; n++; }
        if (n >= 6) {
          const w = dr.tempo === 'push' ? 0.3 : 0.55;
          let aim = w * (sx / n) + (1 - w) * fx, vaim = w * (svx / n) + (1 - w) * vx;
          // half-court sets: keep the basket in the shot (TV frames half court to the baseline)
          if (zt && dr.dir) { const hoopX = dr.dir > 0 ? 88.75 : 5.25; aim = aim * 0.65 + (hoopX - dr.dir * 16) * 0.35; }
          if (this._camAim == null || Math.abs(this._camAim - aim) > 30) this._camAim = aim;
          const dz = dr.tempo === 'push' ? 1.5 : 3.5;
          if (aim > this._camAim + dz) this._camAim = aim - dz; else if (aim < this._camAim - dz) this._camAim = aim + dz;
          fx = this._camAim; vx = vaim;
        }
      } else this._camAim = null;
      // whatever the framing, the ball stays well inside the picture: the aim gives way toward it, and the operator
      // whips the pan faster when it is running out of frame (an outlet pass, a fast break)
      const b = this.ball;
      let urgent = 0;
      if (!(hint && hint.x != null) && b && isFinite(b.x)) {
        const hw = this.camRig.halfWidthAt(U.clamp(b.y, 0, 50));
        const keep = hw * 0.62;
        if (b.x > fx + keep) fx = b.x - keep; else if (b.x < fx - keep) fx = b.x + keep;
        const off = Math.abs(b.x - this.cam.x);
        urgent = U.smooth((off - hw * 0.55) / (hw * 0.3));
      }
      // sub-step so the camera keeps up at high playback speeds
      let left = Math.min(dt, 2);
      const f = { x: fx, vx: vx * 0.6, urgent };
      do { const h = Math.min(0.05, left); this.camRig.update(h, f); left -= h; } while (left > 1e-6);
    }

    // ============================================================ rendering
    /** integer pixel scale for the pixel-art mode: the scene renders at roughly TARGET px wide, then scales up crisply */
    pixelScale() {
      const target = { chunky: 360, normal: 440, fine: 600 }[this.opts.pixelSize] || 440;
      return Math.max(2, Math.round(this.canvas.width / target));
    }
    /**
     * Pixel-art person: the vector figure is drawn into a small scratch sprite at the low-res scale, its alpha is
     * thresholded (hard edges, no anti-aliasing), shading is posterized into a few bands and a 1 px dark outline is
     * added around the silhouette, then the sprite is stamped into the frame in its depth-sorted slot.
     */
    drawPixelPerson(g, cam, sk, style, o, ballFn) {
      const P = sk.P, pt = this._pt;
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (let j = 0; j < 27; j++) {
        cam.project(P[j * 3], P[j * 3 + 1], P[j * 3 + 2], pt);
        if (pt.x < x0) x0 = pt.x; if (pt.x > x1) x1 = pt.x;
        if (pt.y < y0) y0 = pt.y; if (pt.y > y1) y1 = pt.y;
      }
      if (o.extra) { const b = this.ball; cam.project(b.x, b.y, b.z, pt); x0 = Math.min(x0, pt.x); x1 = Math.max(x1, pt.x); y0 = Math.min(y0, pt.y); y1 = Math.max(y1, pt.y); }
      if (x1 < -20 || x0 > cam.W + 20) return;
      const s = cam.scaleAt(P[1], 3);
      const m = Math.ceil(s * 0.75) + 3;
      const X0 = Math.floor(x0 - m), Y0 = Math.floor(y0 - m);
      const w = Math.min(360, Math.ceil(x1 - x0 + 2 * m)), h = Math.min(360, Math.ceil(y1 - y0 + 2 * m));
      if (w <= 2 || h <= 2) return;
      let sc = this._spr;
      if (!sc || sc.width < w || sc.height < h) {
        sc = this._spr = U.makeCanvas(Math.max(w, sc ? sc.width : 0, 96), Math.max(h, sc ? sc.height : 0, 160));
        this._sprG = sc.getContext('2d', { willReadFrequently: true });
      }
      const sg = this._sprG;
      sg.setTransform(1, 0, 0, 1, 0, 0);
      sg.clearRect(0, 0, w + 2, h + 2);
      const ox = cam.ox, oy = cam.oy;
      cam.ox = ox - X0; cam.oy = oy - Y0;
      // a ball held in the hands belongs to the sprite (drawn into the scratch canvas at its depth slot)
      const oo = o.extra ? Object.assign({}, o, { extra: { d: o.extra.d, fn: () => (ballFn ? ballFn(sg) : this.ball.draw(sg, cam)) } }) : o;
      try {
        const R3 = this._r3;
        if (R3 && R3.cells.has(sk)) {
          // the 3D cell was rendered at this (pixel) camera: shift it into the sprite canvas
          const c = R3.cells.get(sk);
          const exb = oo.extra && !c.hasBall ? oo.extra : null, behind = exb && exb.d > cam.depth(sk.P[1], 3) + 0.25;
          if (exb && behind) exb.fn();
          sg.drawImage(R3.cv, c.cx, c.cy, c.cw, c.ch, c.x0 - X0, c.y0 - Y0, c.x1 - c.x0, c.y1 - c.y0);
          if (exb && !behind) exb.fn();
        } else this.fr.draw(sg, cam, sk, style, oo);
      } finally { cam.ox = ox; cam.oy = oy; }
      sg.setTransform(1, 0, 0, 1, 0, 0);
      const img = sg.getImageData(0, 0, w, h), d = img.data;
      const n = w * h;
      const mask = this._mask && this._mask.length >= n ? this._mask : (this._mask = new Uint8Array(Math.max(n, 96 * 160)));
      const band = this.opts.pixelBands || 20;
      for (let i = 0, q = 0; i < n; i++, q += 4) {
        if (d[q + 3] >= 120) {
          mask[i] = 1; d[q + 3] = 255;
          // posterize into shading bands (keeps the palette tight, like hand-shaded sprites)
          d[q] = Math.min(255, Math.round(d[q] / band) * band);
          d[q + 1] = Math.min(255, Math.round(d[q + 1] / band) * band);
          d[q + 2] = Math.min(255, Math.round(d[q + 2] / band) * band);
        } else { mask[i] = 0; d[q + 3] = 0; }
      }
      // 1 px outline: transparent pixels touching the silhouette take a dark tint of the neighbouring colour
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          if (mask[i]) continue;
          let nb = -1;
          if (x > 0 && mask[i - 1]) nb = i - 1;
          else if (x < w - 1 && mask[i + 1]) nb = i + 1;
          else if (y > 0 && mask[i - w]) nb = i - w;
          else if (y < h - 1 && mask[i + w]) nb = i + w;
          if (nb < 0) continue;
          const q = i * 4, r = nb * 4;
          d[q] = 10 + d[r] * 0.18; d[q + 1] = 8 + d[r + 1] * 0.16; d[q + 2] = 14 + d[r + 2] * 0.2; d[q + 3] = 255;
        }
      }
      sg.putImageData(img, 0, 0);
      g.drawImage(this._spr, 0, 0, w, h, X0, Y0, w, h);
    }
    /** composite a 3D person's cell; a held ball goes in front of or behind the body by depth */
    blit3d(g, cam, R3, pp, o) {
      if (!R3.cells.has(pp.sk)) return false;
      const ex = o && o.extra && !R3.cells.get(pp.sk).hasBall ? o.extra : null;
      const behind = ex && ex.d > cam.depth(pp.sk.P[1], 3) + 0.25;
      if (ex && behind) ex.fn();
      R3.blit(g, pp.sk);
      if (ex && !behind) ex.fn();
      return true;
    }
    /** crisp pixel-art contact shadow (hard ellipse instead of a soft blob) */
    drawPixelShadow(g, cam, sk) {
      const P = sk.P;
      const cx = (P[19 * 3] + P[25 * 3] + P[0] * 2) * 0.25, cy = (P[19 * 3 + 1] + P[25 * 3 + 1] + P[1] * 2) * 0.25;
      const air = Math.max(0, Math.min(P[19 * 3 + 2], P[25 * 3 + 2]) - 0.05);
      const p = cam.project(cx, cy, 0, this._pt);
      const w = sk.dims.H * 0.3 * p.s * (1 + air * 0.06), h = Math.max(1, w * 0.3 * Math.max(0.35, cam.sp * 1.6));
      g.fillStyle = 'rgba(12,6,4,' + (0.34 * U.clamp(1 - air * 0.2, 0.3, 1)).toFixed(3) + ')';
      g.beginPath(); g.ellipse(Math.round(p.x), Math.round(p.y), Math.max(1, w), h, 0, 0, U.TAU); g.fill();
    }

    // ============================================================ instant replay
    makeRec(cap, maxP) {
      const frames = [];
      for (let i = 0; i < cap; i++) frames.push({ t: -1e9, n: 0, who: new Array(maxP), P: new Float32Array(maxP * 81), R: new Float32Array(maxP * 153), ball: new Float32Array(16), net: new Float32Array(64), pan: 47 });
      return { cap, maxP, frames, head: 0, count: 0, lastT: -1e9, tmp: [] };
    }
    /** snapshot everything a frame needs (30 Hz of presentation time, ring buffer of the last ~7 s) */
    recordFrame() {
      if (this.opts.record === false || this.replay) return;
      const R = this._rec || (this._rec = this.makeRec(215, 18));
      if (this.time - R.lastT < 1 / 30 - 1e-6) return;
      R.lastT = this.time;
      const people = R.tmp; people.length = 0;
      for (const id in this.actors) { const a = this.actors[id]; if (!a.hidden) people.push(a); }
      for (const r of this.refs) people.push(r);
      const f = R.frames[R.head];
      const n = Math.min(people.length, R.maxP);
      f.t = this.time; f.n = n;
      for (let i = 0; i < n; i++) {
        const a = people[i];
        a.solve();
        f.who[i] = a;
        f.P.set(a.sk.P, i * 81);
        f.R.set(a.sk.R, i * 153);
      }
      const b = this.ball;
      f.ball[0] = b.x; f.ball[1] = b.y; f.ball[2] = b.z; f.ball[3] = b.squash; f.ball[4] = b.hidden ? 1 : 0;
      for (let k = 0; k < 9; k++) f.ball[5 + k] = b.rot[k];
      let o = 0;
      for (const ho of this.hoops) {
        for (const L of ho.lv) { f.net[o++] = L.dr; f.net[o++] = L.dz; f.net[o++] = L.ox; f.net[o++] = L.oy; }
        f.net[o++] = ho.rimShake; f.net[o++] = ho.boardShake;
      }
      f.pan = this.camRig.pan.x;
      R.head = (R.head + 1) % R.cap; R.count = Math.min(R.cap, R.count + 1);
    }
    /** play back the recorded window [t - before, t + after] in slow motion with the replay camera. Returns false if not enough footage. */
    startReplay(o) {
      const R = this._rec;
      if (!R || !R.count || this.replay) return false;
      o = o || {};
      const t = o.t != null ? o.t : this.time, t0 = t - (o.before || 2.5), t1 = t + (o.after || 1);
      const list = [];
      for (let k = 0; k < R.count; k++) {
        const f = R.frames[(R.head - R.count + k + R.cap * 2) % R.cap];
        if (f.t >= t0 && f.t <= t1) list.push(f);
      }
      if (list.length < 20) return false;
      const rig = this.camRig;
      this.replay = {
        list, rt: list[0].t, t0: list[0].t, t1: list[list.length - 1].t, speed: o.speed || 0.45, hold: 0.5,
        cam: { preset: rig.preset, auto: rig.auto, p: Object.assign({}, rig.p), pan: Object.assign({}, rig.pan), zoom: rig.zoom, tight: rig.tight },
        ghosts: [], focus: o.focus || null, i: 0,
      };
      rig.setPreset('replay');
      rig.p = Object.assign({}, M.CAMERA_PRESETS.replay);
      rig.pan.x = list[0].ball[0]; rig.pan.v = 0;
      rig.apply();
      return true;
    }
    stopReplay() {
      const r = this.replay;
      if (!r) return;
      const rig = this.camRig;
      rig.preset = r.cam.preset; rig.auto = r.cam.auto; rig.p = r.cam.p; rig.pan = r.cam.pan; rig.zoom = r.cam.zoom; rig.tight = r.cam.tight;
      rig.apply();
      this.replay = null;
    }
    isReplaying() { return !!this.replay; }
    /** the arena's hanging scoreboard on screen ({x0, x1, y1} as fractions of the frame), or null */
    boardRect() { return (this.arena && this.arena.board) || null; }
    replayProgress() { const r = this.replay; return r ? U.clamp((r.rt - r.t0) / Math.max(0.01, r.t1 - r.t0), 0, 1) : 0; }
    updateReplay(dt) {
      const r = this.replay;
      r.rt += dt * r.speed;
      // replay camera: follow the ball closely
      const fr = this.replayFrame();
      if (fr) {
        const lim = this.camRig.panLimits();
        const fx = U.clamp(fr.bx, lim[0], lim[1]);
        let left = Math.min(dt, 0.5);
        do { const h = Math.min(0.05, left); U.spring(this.camRig.pan, fx, 3.2, h); left -= h; } while (left > 1e-6);
        this.camRig.apply();
      }
      if (r.rt > r.t1 + r.hold) this.stopReplay();
    }
    /** interpolated ghost skeletons of the replay moment */
    replayFrame() {
      const r = this.replay;
      const L = r.list;
      while (r.i < L.length - 2 && L[r.i + 1].t <= r.rt) r.i++;
      const a = L[r.i], b = L[Math.min(L.length - 1, r.i + 1)];
      const u = b.t > a.t ? U.clamp((r.rt - a.t) / (b.t - a.t), 0, 1) : 0;
      const ghosts = r.ghosts;
      let gi = 0;
      for (let i = 0; i < a.n; i++) {
        const who = a.who[i];
        let j = -1;
        for (let k = 0; k < b.n; k++) if (b.who[k] === who) { j = k; break; }
        const gh = ghosts[gi] || (ghosts[gi] = { P: new Float64Array(81), R: new Float64Array(153), dims: null, style: null, who: null });
        gh.dims = who.sk.dims; gh.style = who.style; gh.who = who;
        for (let k = 0; k < 81; k++) { const va = a.P[i * 81 + k]; gh.P[k] = j >= 0 ? va + (b.P[j * 81 + k] - va) * u : va; }
        for (let k = 0; k < 153; k++) { const va = a.R[i * 153 + k]; gh.R[k] = j >= 0 ? va + (b.R[j * 153 + k] - va) * u : va; }
        gi++;
      }
      ghosts.length = gi;
      const lerp = (k) => a.ball[k] + (b.ball[k] - a.ball[k]) * u;
      const out = this._rf || (this._rf = { ghosts: null, bx: 0, by: 0, bz: 0, sq: 0, hidden: 0, rot: new Float64Array(9), net: new Float32Array(64) });
      out.ghosts = ghosts; out.bx = lerp(0); out.by = lerp(1); out.bz = lerp(2); out.sq = lerp(3); out.hidden = a.ball[4];
      for (let k = 0; k < 9; k++) out.rot[k] = u < 0.5 ? a.ball[5 + k] : b.ball[5 + k];
      for (let k = 0; k < 64; k++) out.net[k] = a.net[k] + (b.net[k] - a.net[k]) * u;
      return out;
    }

    // ============================================================ frame
    _render() {
      let g = this.g, cam = this.cam;
      const pix = !!this.opts.pixelMode;
      let W = this.cssW, H = this.cssH, dpr = this.dpr;
      if (pix) {
        const k = this.pixelScale();
        const pw = Math.max(64, Math.ceil(this.canvas.width / k)), ph = Math.max(36, Math.ceil(this.canvas.height / k));
        if (!this._pix || this._pix.width !== pw || this._pix.height !== ph) { this._pix = U.makeCanvas(pw, ph); this._pixG = this._pix.getContext('2d'); }
        this._pixK = k;
        g = this._pixG; dpr = 1;
        cam.setSize(pw, ph); this.camRig.apply();
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.imageSmoothingEnabled = true;
      const q = this.opts.quality;
      const arena = this.arena, court = this.court;
      arena.drawBackground(g, cam);
      court.drawFloor(g, cam, q);
      court.drawLines(g, cam);
      arena.drawStands(g, cam);
      arena.drawLEDReflection(g, cam);
      court.drawSheen(g, cam);
      arena.drawCourtside(g, cam);
      arena.drawJumbotron(g, cam);
      for (const ho of this.hoops) ho.drawStanchion(g, cam);
      const b = this.ball;
      const rp = this.replay ? this.replayFrame() : null;
      // people to draw: live actors (solved now) or interpolated replay ghosts
      const people = this._people || (this._people = []);
      people.length = 0;
      if (rp) {
        for (const gh of rp.ghosts) people.push({ sk: gh, style: gh.style, y: gh.P[1], a: gh.who });
      } else {
        for (const id in this.actors) { const a = this.actors[id]; if (!a.hidden) { a.solve(); people.push({ sk: a.sk, style: a.style, y: a.y, a }); } }
        for (const r of this.refs) { r.solve(); people.push({ sk: r.sk, style: r.style, y: r.y, a: r }); }
      }
      // replay: apply the recorded ball and net state for this frame (restored after drawing)
      let saved = null;
      if (rp) {
        saved = { x: b.x, y: b.y, z: b.z, sq: b.squash, hidden: b.hidden, rot: Float64Array.from(b.rot), state: b.state, holder: b.holder, nets: this.hoops.map(ho => ({ lv: ho.lv.map(L => [L.dr, L.dz, L.ox, L.oy]), rs: ho.rimShake, bs: ho.boardShake })) };
        b.x = rp.bx; b.y = rp.by; b.z = rp.bz; b.squash = rp.sq; b.hidden = !!rp.hidden; b.rot.set(rp.rot); b.state = 'flight'; b.holder = null;
        let o = 0;
        for (const ho of this.hoops) { for (const L of ho.lv) { L.dr = rp.net[o++]; L.dz = rp.net[o++]; L.ox = rp.net[o++]; L.oy = rp.net[o++]; } ho.rimShake = rp.net[o++]; ho.boardShake = rp.net[o++]; }
      }
      // realistic 3D players: rendered into per-person cells now, composited below in depth order
      let R3 = null;
      if (this.opts.models !== '2d' && q !== 'low' && M.GL3D && M.Human) {
        R3 = M.GL3D.get();
        if (R3) {
          // the ball in someone's hands (held, or dribbled) is rendered inside that person's 3D cell
          const hb = rp || b.hidden ? null : (b.state === 'held' || b.state === 'dead') && b.holder ? b.holder : b.state === 'dribble' && b.dr && b.dr.actor ? b.dr.actor : null;
          const ball = hb ? { sk: hb.sk, x: b.x, y: b.y, z: b.z, R: M.Ball.R, rot: b.rot, squash: b.squash } : null;
          const n3 = U.safe(() => R3.render(cam, people, { dpr: pix ? 1 : dpr, ball }), this, '3d players');
          if (!n3) R3 = R3 && R3.cells.size ? R3 : null;
        }
      }
      this._r3 = R3;
      try {
        if (q !== 'low') for (const pp of people) { if (!(R3 && R3.reflect(g, cam, pp.sk, pix ? 0.07 : 0.1))) this.fr.drawReflection(g, cam, pp.sk, pp.style, pix ? 0.08 : 0.11); }
        if (pix) for (const pp of people) this.drawPixelShadow(g, cam, pp.sk);
        else for (const pp of people) this.fr.drawShadow(g, cam, pp.sk, 1);
        b.drawShadow(g, cam);
        // depth-sorted drawables
        const items = this.items; items.length = 0;
        const heldBy = !rp && (b.state === 'held' || b.state === 'dead') && b.holder ? b.holder : null;
        let ballInHoop = null;
        for (const ho of this.hoops) {
          const dx = b.x - ho.rx, dy = b.y - ho.ry;
          if (!heldBy && Math.hypot(dx, dy) < 1.25 && b.z > 7.8 && b.z < 11.2) ballInHoop = ho;
          items.push({ k: 1, o: ho, d: cam.depth(ho.ry, 10) });
        }
        for (const pp of people) items.push({ k: 0, o: pp, d: cam.depth(pp.y, 3) });
        const ballIn3d = R3 && [...R3.cells.values()].some(c => c.hasBall);
        if (!heldBy && !ballInHoop && !ballIn3d) items.push({ k: 2, o: b, d: cam.depth(b.y, b.z) });
        items.sort((p1, p2) => p2.d - p1.d);
        const ballFn = () => b.draw(g, cam);
        for (const it of items) {
          if (it.k === 0) {
            const pp = it.o;
            const o = { dpr };
            if (heldBy && heldBy === pp.a) o.extra = { d: cam.depth(b.y, b.z) + 0.05, fn: ballFn };
            if (pix) this.drawPixelPerson(g, cam, pp.sk, pp.style, o);
            else if (!(R3 && this.blit3d(g, cam, R3, pp, o))) this.fr.draw(g, cam, pp.sk, pp.style, o);
          } else if (it.k === 1) {
            const ho = it.o;
            ho.drawBoard(g, cam);
            ho.drawRim(g, cam, 1);
            ho.drawNet(g, cam, 1);
            if (ballInHoop === ho) b.draw(g, cam);
            ho.drawNet(g, cam, -1);
            ho.drawRim(g, cam, -1);
          } else b.draw(g, cam);
        }
        if (this.opts.showNames && !rp) this.drawNames(g, cam, people.map(pp => pp.a).filter(Boolean));
      } finally {
        if (saved) {
          b.x = saved.x; b.y = saved.y; b.z = saved.z; b.squash = saved.sq; b.hidden = saved.hidden; b.rot.set(saved.rot); b.state = saved.state; b.holder = saved.holder;
          this.hoops.forEach((ho, i) => { ho.lv.forEach((L, k) => { const v = saved.nets[i].lv[k]; L.dr = v[0]; L.dz = v[1]; L.ox = v[2]; L.oy = v[3]; }); ho.rimShake = saved.nets[i].rs; ho.boardShake = saved.nets[i].bs; });
        }
      }
      arena.drawOverlay(g, cam);
      if (rp) this.drawReplayFrame(g, cam);
      if (pix) {
        cam.setSize(this.cssW, this.cssH); this.camRig.apply();
        const mg = this.g, k = this._pixK || 3;
        mg.setTransform(1, 0, 0, 1, 0, 0);
        mg.imageSmoothingEnabled = false;
        // whole-pixel upscale (uniform square pixels); the buffer is sized to cover the canvas
        mg.drawImage(this._pix, 0, 0, this._pix.width * k, this._pix.height * k);
        mg.imageSmoothingEnabled = true;
      }
      void W; void H;
    }
    /** replay look: letterbox bars + a slight film tint */
    drawReplayFrame(g, cam) {
      const bar = Math.round(cam.H * 0.075);
      g.fillStyle = 'rgba(0,0,0,0.92)';
      g.fillRect(0, 0, cam.W, bar);
      g.fillRect(0, cam.H - bar, cam.W, bar);
      g.fillStyle = 'rgba(40,60,110,0.10)';
      g.fillRect(0, bar, cam.W, cam.H - bar * 2);
    }
    drawNames(g, cam, people) {
      g.font = '700 11px "Helvetica Neue", Arial, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'bottom';
      for (const a of people) {
        if (a.kind !== 'player') continue;
        const P = a.sk.P;
        const p = cam.project(P[18], P[19], P[20] + 0.6, this._pt);
        const txt = (a.look.num != null ? '#' + a.look.num + ' ' : '') + (a.look.last || '');
        const w = g.measureText(txt).width + 8;
        g.fillStyle = 'rgba(0,0,0,0.55)';
        g.fillRect(p.x - w / 2, p.y - 15, w, 14);
        g.fillStyle = a.team === 0 ? '#ffffff' : '#ffd0d0';
        g.fillText(txt, p.x, p.y - 2);
      }
    }
  }

  M.View = View;
})();
