/* Pro BBALL Coach: a player's in-game model on its own (UI.ModelView), for the player editor: the live game's own actor,
 * ball, rig, moves and 3D renderer (js/match) in a world of one, under a spotlight. Drag to turn him (or the arrow keys),
 * the wheel to zoom, a double click to reset; framed full body, upper body or face, in the home or away uniform, doing one
 * of a few moves (standing, the triple threat, dribbling, dribble moves, a jump shot, the defensive stance, a jog, a
 * celebration). Every move is a short loop played in the game's fixed steps. Without WebGL2 the 2D figure stands in.
 *
 *   const mv = new UI.ModelView(canvas, { look, team, move, view });   look: UI.playerLook(p), team: UI.teamLookOf(t, home)
 *   mv.setLook(look, team)  (rebuilt a beat later: sliders call it on every step)   mv.setMove(key)   mv.setView(key)
 *   mv.spin(on)   mv.destroy()   UI.ModelView.MOVES, UI.ModelView.VIEWS */
(function () {
  'use strict';
  const PBC = window.PBC, UI = PBC.UI;

  // the spot he stands on (mid court, away from the hoops) and the way he faces: the camera
  const X0 = 47, Y0 = 25, FRONT = -Math.PI / 2;

  /** the world of one the actor and the ball live in (what they ask of the game's view) */
  class World {
    constructor(team) { this.actors = {}; this.onCourt = [[], []]; this.list = []; this.ball = null; this.opts = { ai: { moveSpeed: 50 } }; this.tl = team; }
    teamLook() { return this.tl; }
    sound() {}
  }

  // the moves: dur (s, then it starts over), face (the way he faces), setup(c) at the start, tick(c, t) every step
  const MOVES = [
    { key: 'stand', label: 'Stand', icon: '🧍', dur: 9, setup: c => { c.a.setStance('stand'); } },
    { key: 'triple', label: 'Triple threat', icon: '🏀', dur: 9, setup: c => { c.b.give(c.a, 'triple'); c.a.setStance('triple'); } },
    { key: 'dribble', label: 'Dribble', icon: '⛹️', dur: 9, setup: c => { c.b.dribble(c.a); c.a.setStance('dribble'); } },
    { key: 'moves', label: 'Dribble moves', icon: '🌀', dur: 6.6, setup: c => {
      c.b.dribble(c.a); c.a.setStance('dribble'); c.a.setFace(c.f0);
      c.at(0.7, () => { if (c.b.dribbleCombo) c.b.dribbleCombo(['cross', 'cross', 'btl', 'btb', 'cross']); });
    } },
    { key: 'shot', label: 'Jump shot', icon: '🎯', face: FRONT + 0.75, dur: 3.4, setup: c => {
      c.b.give(c.a, 'pocket'); c.a.setStance('ready');
      c.at(0.5, () => c.a.play('jumpshot', {
        facing: c.f0, fadeIn: 0.1,
        onEvent: e => { if (e === 'release' && c.b.holder === c.a) c.b.pass([c.a.x + c.fx * 15, c.a.y + c.fy * 15, 10], 1.0, {}); },
      }));
    } },
    { key: 'defense', label: 'Defense', icon: '🛡️', dur: 6.4, setup: c => {
      c.a.setStance('defense'); c.a.setFace(c.f0);
      for (let k = 0; k < 4; k++) c.at(0.6 + k * 1.4, () => { c.a.moveTo(c.x0 + c.rx * (k % 2 ? -3 : 3), c.y0 + c.ry * (k % 2 ? -3 : 3), { speed: 9, stance: 'defense' }); c.a.setFace(c.f0); });
    } },
    { key: 'jog', label: 'Jog', icon: '🏃', dur: 12, setup: c => { c.a.setStance('stand'); }, tick: (c, t) => {
      if (t < 0.3) return;
      const k = Math.round(t * 20);
      if (c._k === k) return;
      c._k = k;
      const R = 7, w = 9 / R, ang = (t - 0.3) * w;
      c.a.moveTo(c.x0 + Math.cos(ang) * R - R, c.y0 + Math.sin(ang) * R, { speed: 9 });
    } },
    { key: 'cheer', label: 'Celebrate', icon: '🎉', dur: 3.6, setup: c => {
      const A = PBC.Match.Anims, list = ['flex', 'fistPump', 'threeFingers', 'clap'].filter(n => A && A.get && A.get(n));
      const n = list.length ? list[(c.loop || 0) % list.length] : null;
      c.a.setStance('stand');
      if (n) c.at(0.4, () => c.a.play(n, { facing: c.f0, fadeIn: 0.15 }));
    } },
  ];
  // the framings: how far the camera stands (x his height plus a margin), and where it looks (x his height)
  const VIEWS = [
    { key: 'full', label: 'Full body', short: 'Body', dist: (H) => (H + 2.4) * 1.22, look: 0.5, up: 0.12 },
    { key: 'upper', label: 'Upper body', short: 'Upper', dist: (H) => H * 0.62 + 1.2, look: 0.74, up: 0.05 },
    { key: 'face', label: 'Face', short: 'Face', dist: () => 2.5, look: 0.935, up: 0.0, head: true },
  ];

  class ModelView {
    constructor(canvas, o) {
      o = o || {};
      const M = PBC.Match;
      this.M = M;
      this.cv = canvas;
      this.g = canvas.getContext('2d');
      this.cam = new M.Camera();
      this.fr = M.Figure && M.Figure.FigureRenderer ? new M.Figure.FigureRenderer() : null;
      this.R3 = null;
      this.look = o.look || null; this.team = o.team || null;
      this.moveKey = o.move || 'stand'; this.viewKey = o.view || 'full';
      this.yaw = o.yaw != null ? o.yaw : -0.42; this.zoom = 1; this.spinning = !!o.spin;
      this.focus = { x: X0, y: Y0, z: 0 };
      this.alive = true; this.ready = false; this.loopN = 0;
      this.dpr = Math.min(2, window.devicePixelRatio || 1);
      this.STEP = (M.Tune && M.Tune.clock && M.Tune.clock.step) || 1 / 60;
      this.ds = null; this.dsFor = null;
      this.onState = o.onState || null;
      this.state = 'loading';
      this._bind();
      this._resize();
      this._init();
    }
    async _init() {
      const M = this.M;
      try {
        this.R3 = M.GL3D && M.GL3D.get ? M.GL3D.get() : null;
        if (this.R3 && M.Human && M.Human.load) await M.Human.load();
      } catch (e) { this.R3 = null; }
      if (!this.alive) return;
      this.ready = true;
      this.state = this.R3 && this.R3.ok ? '3d' : '2d';
      if (this.onState) this.onState(this.state);
      this._build();
      this.last = performance.now();
      const loop = (now) => { if (!this.alive) return; this._frame(now); this.raf = requestAnimationFrame(loop); };
      this.raf = requestAnimationFrame(loop);
    }

    // ---- what to show
    setLook(look, team) {
      this.look = look; if (team) this.team = team;
      if (!this.ready) return;
      clearTimeout(this._lt);
      this._lt = setTimeout(() => { if (this.alive) this._build(); }, 90);
    }
    setMove(key) { if (!MOVES.some(m => m.key === key)) return; this.moveKey = key; this.loopN = 0; if (this.ready) this._build(); }
    setView(key) { if (!VIEWS.some(v => v.key === key)) return; this.viewKey = key; this.snap = true; }
    spin(on) { this.spinning = on == null ? !this.spinning : !!on; return this.spinning; }
    reset() { this.yaw = -0.42; this.zoom = 1; this.snap = true; }
    destroy() {
      this.alive = false;
      cancelAnimationFrame(this.raf); clearTimeout(this._lt);
      if (this._ro) this._ro.disconnect();
      if (this._off) this._off();
    }

    // ---- the world and the move, from the start (each loop of the move starts over)
    _build() {
      const M = this.M, look = this.look;
      if (!look) return;
      const mv = MOVES.find(m => m.key === this.moveKey) || MOVES[0];
      const W = new World(this.team || ModelView.plainTeam());
      let a;
      try {
        a = new M.Actor(W, look, 0, 'player');
      } catch (e) { console.warn('model view: actor', e); return; }
      W.actors[a.id] = a; W.onCourt[0].push(a.id); W.list.push(a);
      if (M.Rig && M.Rig.NCH) a.sk.limHits = new Uint8Array(M.Rig.NCH);
      const f0 = mv.face != null ? mv.face : FRONT;
      a.place(X0, Y0, f0);
      const b = new M.Ball(W); W.ball = b;
      b.x = X0 + 3; b.y = Y0; b.z = 0.39; b.hidden = true;
      const c = { W, a, b, f0, fx: Math.cos(f0), fy: Math.sin(f0), rx: Math.sin(f0), ry: -Math.cos(f0), x0: X0, y0: Y0, ev: [], loop: this.loopN };
      c.at = (t, fn) => { c.ev.push({ t, fn }); c.ev.sort((p, q) => p.t - q.t); };
      try { mv.setup(c); } catch (e) { console.warn('model view: move', e); }
      if (b.holder || b.state === 'dribble') b.hidden = false;
      a.solve();
      this.W = W; this.c = c; this.mv = mv; this.t = 0; this.budget = 0;
      this.ds = null; this.dsFor = a;
      this.snap = true;
    }
    _step() {
      const c = this.c, W = this.W, dt = this.STEP;
      this.t = Math.round((this.t + dt) * 1200) / 1200;
      while (c.ev.length && c.ev[0].t <= this.t + 1e-9) { const e = c.ev.shift(); try { e.fn(); } catch (err) { console.warn('model view: event', err); } }
      if (this.mv.tick) this.mv.tick(c, this.t);
      for (const a of W.list) a.update(dt, this.t);
      if (W.ball) { W.ball.update(dt, this.t); if (W.ball.holder || W.ball.state === 'dribble' || W.ball.state === 'flight') W.ball.hidden = false; }
      for (const a of W.list) a.solve();
    }

    // ---- the frame
    _frame(now) {
      if (!this.cv.isConnected) { this.destroy(); return; }
      const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
      this.last = now;
      if (this.W) {
        this.budget += dt;
        let n = 0;
        while (this.budget >= this.STEP && n < 30) { try { this._step(); } catch (e) { console.warn('model view: step', e); this.budget = 0; break; } this.budget -= this.STEP; n++; }
        if (this.t >= this.mv.dur) { this.loopN++; this._build(); }
      }
      if (this.spinning && !this.drag) this.yaw += dt * 0.5;
      this._render(dt);
    }
    _xf(x, y, z, out) {
      const c = this.vc, s = this.vs, dx = x - this.focus.x, dy = y - this.focus.y;
      out[0] = this.focus.x + dx * c - dy * s; out[1] = this.focus.y + dx * s + dy * c; out[2] = z;
      return out;
    }
    _displaySk(a) {
      let ds = this.ds;
      if (!ds || this.dsFor !== a) { ds = this.ds = { P: new Float64Array(a.sk.P.length), R: new Float64Array(a.sk.R.length), dims: a.sk.dims, pose: a.sk.pose }; this.dsFor = a; }
      const P = a.sk.P, R = a.sk.R, c = this.vc, s = this.vs, q = [0, 0, 0];
      for (let j = 0; j < P.length; j += 3) { this._xf(P[j], P[j + 1], P[j + 2], q); ds.P[j] = q[0]; ds.P[j + 1] = q[1]; ds.P[j + 2] = q[2]; }
      for (let f = 0; f < R.length; f += 9) {
        for (let k = 0; k < 3; k++) {
          const r0 = R[f + k], r1 = R[f + 3 + k];
          ds.R[f + k] = c * r0 - s * r1; ds.R[f + 3 + k] = s * r0 + c * r1; ds.R[f + 6 + k] = R[f + 6 + k];
        }
      }
      ds.pose = a.sk.pose; ds.dims = a.sk.dims;
      return ds;
    }
    _render(dt) {
      const g = this.g, cam = this.cam, dpr = this.dpr, w = this.vw, h = this.vh;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      // the backdrop: a dark gym, the light from above
      const bg = g.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#16213a'); bg.addColorStop(0.62, '#0d1424'); bg.addColorStop(1, '#090d16');
      g.fillStyle = bg; g.fillRect(0, 0, w, h);
      if (!this.W) { this._msg(g, w, h, this.state === 'loading' ? 'Loading the model…' : ''); return; }
      const a = this.W.list[0], M = this.M, J = M.Rig.J, P = a.sk.P;
      const V = VIEWS.find(v => v.key === this.viewKey) || VIEWS[0];
      // focus: his middle (or his head, close up), eased; up with him when he jumps
      const fx = V.head ? P[J.HC * 3] : a.x, fy = V.head ? P[J.HC * 3 + 1] : a.y;
      const fz = V.head ? P[J.HC * 3 + 2] : a.H * V.look + Math.max(0, P[J.PEL * 3 + 2] - a.H * 0.53);
      const k = this.snap ? 1 : 1 - Math.exp(-dt / 0.14);
      this.focus.x += (fx - this.focus.x) * k; this.focus.y += (fy - this.focus.y) * k; this.focus.z += (fz - this.focus.z) * k;
      this.snap = false;
      this.vc = Math.cos(this.yaw); this.vs = Math.sin(this.yaw);
      const dist = V.dist(a.H) * this.zoom, camZ = this.focus.z + V.up * a.H + (V.head ? 0.15 : 0.4);
      cam.setSize(w, h);
      cam.setPose(this.focus.x, this.focus.y - dist, camZ, Math.atan2(camZ - this.focus.z, dist), 1.2 * Math.min(h, w * 1.45));
      // the floor under him: a pool of light
      this._floor(g, a);
      const sk = this._displaySk(a);
      const people = [{ sk, style: a.style, a }];
      const b = this.W.ball;
      let held = null;
      const hb = !b || b.hidden ? null : (b.state === 'held' || b.state === 'dead') && b.holder ? b.holder : b.state === 'dribble' && b.dr && b.dr.actor ? b.dr.actor : null;
      if (hb === a) {
        const q = this._xf(b.x, b.y, b.z, [0, 0, 0]);
        const rot = this._brot || (this._brot = new Float64Array(9));
        for (let i = 0; i < 3; i++) { const r0 = b.rot[i], r1 = b.rot[3 + i]; rot[i] = this.vc * r0 - this.vs * r1; rot[3 + i] = this.vs * r0 + this.vc * r1; rot[6 + i] = b.rot[6 + i]; }
        held = { sk, x: q[0], y: q[1], z: q[2], R: M.Ball.R, rot, squash: b.squash };
      }
      const R3 = this.R3 && this.R3.ok ? this.R3 : null;
      if (R3) R3.render(cam, people, { dpr, sync: true, detail: 'high', ball: held });
      if (this.fr) this.fr.drawShadow(g, cam, sk, 1);
      if (b && !b.hidden && !held) this._ballShadow(g, b);
      let drawn = false;
      if (R3) drawn = R3.blit(g, sk);
      if (!drawn && this.fr) this.fr.draw(g, cam, sk, a.style, { dpr });
      const cell = R3 && R3.cells && R3.cells.get(sk);
      if (b && !b.hidden && !(cell && cell.hasBall) && !(held && drawn)) this._ball(g, b);
    }
    _proj(x, y, z) { const q = this._xf(x, y, z, this._q || (this._q = [0, 0, 0])); this.cam.project(q[0], q[1], q[2], this._pt || (this._pt = { x: 0, y: 0, s: 0, d: 0 })); return this._pt; }
    _floor(g, a) {
      const R = 4.2;
      const c = this._proj(a.x, a.y, 0), cx = c.x, cy = c.y;
      const e = this._proj(a.x + R, a.y, 0), rx = Math.abs(e.x - cx) || R * c.s;
      const n = this._proj(a.x, a.y + R, 0), ry = Math.max(4, Math.abs(n.y - cy));
      g.save();
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, rx);
      gr.addColorStop(0, 'rgba(120,150,210,.30)'); gr.addColorStop(0.55, 'rgba(70,95,150,.16)'); gr.addColorStop(1, 'rgba(40,60,110,0)');
      g.fillStyle = gr;
      g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); g.fill();
      g.restore();
    }
    _ballShadow(g, b) {
      const p = this._proj(b.x, b.y, 0);
      const r = this.M.Ball.R * p.s * Math.max(0.4, 1 - b.z / 20);
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.beginPath(); g.ellipse(p.x, p.y, r * 1.1, r * 0.45, 0, 0, Math.PI * 2); g.fill();
    }
    _ball(g, b) {
      const p = this._proj(b.x, b.y, b.z);
      const r = this.M.Ball.R * p.s;
      if (!(r > 0.5) || p.x < -r || p.x > this.vw + r || p.y < -r || p.y > this.vh + r) return;
      const gr = g.createRadialGradient(p.x - r * 0.35, p.y - r * 0.35, r * 0.1, p.x, p.y, r);
      gr.addColorStop(0, '#ff9a4d'); gr.addColorStop(1, '#a8420c');
      g.fillStyle = gr; g.beginPath(); g.arc(p.x, p.y, r, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(30,10,0,0.7)'; g.lineWidth = Math.max(1, r * 0.08);
      g.beginPath(); g.arc(p.x, p.y, r, 0, Math.PI * 2); g.moveTo(p.x - r, p.y); g.lineTo(p.x + r, p.y); g.stroke();
    }
    _msg(g, w, h, text) {
      if (!text) return;
      g.fillStyle = '#8d99b0'; g.font = '600 13px system-ui, sans-serif'; g.textAlign = 'center';
      g.fillText(text, w / 2, h / 2); g.textAlign = 'left';
    }

    // ---- size and input
    _resize() {
      const r = this.cv.getBoundingClientRect();
      this.vw = Math.max(80, r.width || this.cv.width); this.vh = Math.max(80, r.height || this.cv.height);
      this.cv.width = Math.round(this.vw * this.dpr); this.cv.height = Math.round(this.vh * this.dpr);
    }
    _bind() {
      const cv = this.cv;
      if (typeof ResizeObserver !== 'undefined') { this._ro = new ResizeObserver(() => this._resize()); this._ro.observe(cv); }
      cv.tabIndex = 0;
      const down = e => { this.drag = { x: e.clientX, yaw: this.yaw, id: e.pointerId }; try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } cv.classList.add('drag'); };
      const move = e => { if (!this.drag || this.drag.id !== e.pointerId) return; this.yaw = this.drag.yaw + (e.clientX - this.drag.x) * 0.012; };
      const up = e => { if (this.drag && this.drag.id === e.pointerId) { this.drag = null; cv.classList.remove('drag'); } };
      const wheel = e => { e.preventDefault(); this.zoom = Math.max(0.55, Math.min(1.8, this.zoom * (e.deltaY > 0 ? 1.08 : 1 / 1.08))); };
      const dbl = () => this.reset();
      const key = e => {
        if (e.key === 'ArrowLeft') { this.yaw -= 0.18; e.preventDefault(); }
        if (e.key === 'ArrowRight') { this.yaw += 0.18; e.preventDefault(); }
        if (e.key === '+' || e.key === '=') this.zoom = Math.max(0.55, this.zoom / 1.1);
        if (e.key === '-') this.zoom = Math.min(1.8, this.zoom * 1.1);
      };
      cv.addEventListener('pointerdown', down); cv.addEventListener('pointermove', move);
      cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
      cv.addEventListener('wheel', wheel, { passive: false }); cv.addEventListener('dblclick', dbl); cv.addEventListener('keydown', key);
      this._off = () => {
        cv.removeEventListener('pointerdown', down); cv.removeEventListener('pointermove', move);
        cv.removeEventListener('pointerup', up); cv.removeEventListener('pointercancel', up);
        cv.removeEventListener('wheel', wheel); cv.removeEventListener('dblclick', dbl); cv.removeEventListener('keydown', key);
      };
    }
  }
  /** the uniform of a player without a team (a free agent, a prospect): plain grey */
  ModelView.plainTeam = () => ({ id: -1, abbr: '', colors: { primary: '#3b475f', secondary: '#8d99b0' }, uniform: { jersey: '#3b475f', number: '#ffffff', trim: '#8d99b0', shorts: '#3b475f' }, court: {} });
  ModelView.MOVES = MOVES.map(m => ({ key: m.key, label: m.label, icon: m.icon }));
  ModelView.VIEWS = VIEWS.map(v => ({ key: v.key, label: v.label, short: v.short }));
  /** is the in-game model there to show (the match code is loaded) */
  ModelView.available = () => !!(PBC.Match && PBC.Match.Actor && PBC.Match.Camera && PBC.Match.Ball && PBC.Match.Rig);
  UI.ModelView = ModelView;
})();
