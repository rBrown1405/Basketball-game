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
      let left = dt;
      let guard = 0;
      while (left > 1e-7 && guard++ < 200) {
        const h = Math.min(STEP, left);
        left -= h;
        U.safe(() => this.step(h), this, 'step');
      }
      U.safe(() => this.updateCamera(dt), this, 'camera');
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
      if (k === 'quality') { this.court = new M.Court(this.ctx, this.opts); this.arena = new M.Arena(this.ctx, this.opts); this.arena.setState({ score: this.score, period: this.period }); }
      if (k === 'pixelMode') this._pix = null;
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
    whistle() { this.whistleT = this.time; }
    horn() { this.hornT = this.time; }
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
          for (const id in this.actors) { const a = this.actors[id]; if (!a.hidden) a.update(h, this.time); }
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
      for (let i = 0; i < n; i++) {
        const a = list[i];
        const ra = a.H * 0.15;
        for (let j = i + 1; j < n; j++) {
          const b = list[j];
          const dx = b.x - a.x, dy = b.y - a.y;
          const minD = ra + b.H * 0.15;
          const d2 = dx * dx + dy * dy;
          if (d2 >= minD * minD) continue;
          const d = Math.sqrt(d2) || 0.01;
          const push = (minD - d);
          const nx = d > 0.011 ? dx / d : Math.cos(i + j), ny = d > 0.011 ? dy / d : Math.sin(i + j);
          // clips with root motion (shots, jumps) and ball handlers win; the other gives way
          const la = a.isBusy() ? 0 : a.hasBall ? 0.3 : 1, lb = b.isBusy() ? 0 : b.hasBall ? 0.3 : 1;
          const tot = la + lb;
          if (tot <= 0) continue;
          const k = Math.min(1, 12 * h) * push;
          a.x -= nx * k * la / tot; a.y -= ny * k * la / tot;
          b.x += nx * k * lb / tot; b.y += ny * k * lb / tot;
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
        if (r.isBusy() || (b.holder === r)) return;
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
      // sub-step so the camera keeps up at high playback speeds
      let left = Math.min(dt, 2);
      const f = { x: fx, vx: vx * 0.6 };
      do { const h = Math.min(0.05, left); this.camRig.update(h, f); left -= h; } while (left > 1e-6);
    }

    // ============================================================ rendering
    _render() {
      let g = this.g, cam = this.cam;
      const pix = !!this.opts.pixelMode;
      let W = this.cssW, H = this.cssH, dpr = this.dpr;
      if (pix) {
        const k = 3;
        const pw = Math.max(64, Math.round(W / k)), ph = Math.max(36, Math.round(H / k));
        if (!this._pix || this._pix.width !== pw || this._pix.height !== ph) { this._pix = U.makeCanvas(pw, ph); this._pixG = this._pix.getContext('2d'); }
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
      // solve all visible people once
      const people = [];
      for (const id in this.actors) { const a = this.actors[id]; if (!a.hidden) people.push(a); }
      for (const r of this.refs) people.push(r);
      for (const a of people) a.solve();
      if (q !== 'low') for (const a of people) this.fr.drawReflection(g, cam, a.sk, a.style, 0.11);
      for (const a of people) this.fr.drawShadow(g, cam, a.sk, 1);
      const b = this.ball;
      b.drawShadow(g, cam);
      // depth-sorted drawables
      const items = this.items; items.length = 0;
      const heldBy = (b.state === 'held' || b.state === 'dead') && b.holder ? b.holder : null;
      let ballInHoop = null;
      for (const ho of this.hoops) {
        const dx = b.x - ho.rx, dy = b.y - ho.ry;
        if (!heldBy && Math.hypot(dx, dy) < 1.25 && b.z > 7.8 && b.z < 11.2) ballInHoop = ho;
        items.push({ k: 1, o: ho, d: cam.depth(ho.ry, 10) });
      }
      for (const a of people) items.push({ k: 0, o: a, d: cam.depth(a.y, 3) });
      if (!heldBy && !ballInHoop) items.push({ k: 2, o: b, d: cam.depth(b.y, b.z) });
      items.sort((p1, p2) => p2.d - p1.d);
      const ballFn = () => b.draw(g, cam);
      for (const it of items) {
        if (it.k === 0) {
          const a = it.o;
          const o = { dpr };
          if (heldBy === a) o.extra = { d: cam.depth(b.y, b.z) + 0.05, fn: ballFn };
          else if (a.dribble && b.state === 'dribble' && b.dr && b.dr.actor === a) { /* dribbled ball sorted separately */ }
          this.fr.draw(g, cam, a.sk, a.style, o);
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
      if (this.opts.showNames) this.drawNames(g, cam, people);
      arena.drawOverlay(g, cam);
      if (pix) {
        cam.setSize(this.cssW, this.cssH); this.camRig.apply();
        const mg = this.g;
        mg.setTransform(1, 0, 0, 1, 0, 0);
        mg.imageSmoothingEnabled = false;
        mg.drawImage(this._pix, 0, 0, this.canvas.width, this.canvas.height);
        mg.imageSmoothingEnabled = true;
      }
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
