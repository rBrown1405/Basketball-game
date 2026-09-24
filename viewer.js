/* Pro BBALL Coach — match view: pose/animation turntable (PBC.Match.Turntable).
 * A close camera on a patch of court; figures are either static poses or live Actors driven by
 * the animation system; the camera orbits slowly so motion quality can be judged from any side. */
(function () {
  'use strict';
  const M = window.PBC.Match, U = M.U;

  class Turntable {
    constructor(canvas, gctx, opts) {
      this.canvas = canvas;
      this.g = canvas.getContext('2d');
      this.gctx = gctx;
      this.opts = Object.assign({ quality: 'high' }, opts || {});
      this.cam = new M.Camera();
      this.court = new M.Court(gctx, this.opts);
      this.fr = new M.Figure.FigureRenderer();
      this.figs = [];
      this.actors = [];
      this.time = 0;
      this.spin = 0.25; // rad/s camera orbit for static figures
      this.angle = -Math.PI / 2;
      this.zoom = 1;
      this.center = { x: 47, y: 12 };
      this.ball = null;
      this.resize(canvas.clientWidth || 1600, canvas.clientHeight || 900);
    }
    teamLook(t) { return t === 1 ? this.gctx.away : this.gctx.home; }
    resize(w, h) {
      this.cssW = w; this.cssH = h;
      this.dpr = Math.min(2, window.devicePixelRatio || 1);
      this.canvas.width = Math.round(w * this.dpr); this.canvas.height = Math.round(h * this.dpr);
      this.cam.setSize(w, h);
    }
    setFigures(list) {
      this.figs = list.map((f) => {
        const look = f.look;
        const dims = M.Rig.makeDims(look);
        const sk = new M.Rig.Skeleton(dims);
        const st = M.Figure.makeStyle(look, f.team || null, f.kind);
        return Object.assign({ sk, st, dims, facing: 0, x: 47, y: 12 }, f);
      });
    }
    addActor(look, team, kind) {
      const a = new M.Actor(this, look, team, kind);
      this.actors.push(a);
      return a;
    }
    update(dt) {
      this.time += dt;
      this.angle += this.spin * dt;
      const step = 1 / 120;
      let left = dt;
      while (left > 1e-6) {
        const h = Math.min(step, left);
        left -= h;
        this.simT = (this.simT || 0) + h;
        if (this.script) U.safe(() => this.script(this, this.simT, h), this, 'script');
        for (const a of this.actors) a.update(h, this.simT);
        if (this.ball && this.ball.update) this.ball.update(h, this.simT);
        const fm = this.film;
        if (fm && fm.actor && this.simT >= fm.next && !fm.frozen) {
          fm.next = this.simT + fm.every;
          fm.actor.solve();
          const sk = fm.actor.sk;
          fm.frames.push({ P: Float64Array.from(sk.P), R: Float64Array.from(sk.R), x: fm.actor.x, y: fm.actor.y, t: this.simT });
          if (fm.frames.length > fm.max) fm.frames.shift();
        }
      }
    }
    /** record an actor every `every` seconds; show with showFilm=true */
    record(actor, every, max) {
      this.film = { actor, every: every || 0.05, max: max || 12, frames: [], next: 0, frozen: false };
    }
    drawFilm(g, cam) {
      const fm = this.film;
      if (!fm || !fm.frames.length) return;
      const n = fm.frames.length;
      const spacing = fm.spacing || 3.2;
      const x0 = this.center.x - (n - 1) * spacing / 2, y0 = fm.y0 != null ? fm.y0 : this.center.y - 6;
      const sk = { P: new Float64Array(fm.frames[0].P.length), R: null, dims: fm.actor.dims };
      for (let i = 0; i < n; i++) {
        const fr = fm.frames[i];
        const dx = x0 + i * spacing - fr.x, dy = y0 - fr.y;
        for (let j = 0; j < sk.P.length; j += 3) { sk.P[j] = fr.P[j] + dx; sk.P[j + 1] = fr.P[j + 1] + dy; sk.P[j + 2] = fr.P[j + 2]; }
        sk.R = fr.R;
        this.fr.drawShadow(g, cam, sk, 0.8);
        this.fr.draw(g, cam, sk, fm.actor.style, { dpr: this.dpr });
      }
    }
    render() {
      const g = this.g, cam = this.cam;
      const c = this.center;
      const z = this.zoom;
      const dist = 26 / z, ht = 7.5 / Math.sqrt(z);
      cam.setPose(c.x, c.y - dist, ht, Math.atan2(ht - 3, dist), 1.65 * cam.H);
      g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      const grd = g.createLinearGradient(0, 0, 0, cam.H);
      grd.addColorStop(0, '#0c0d12'); grd.addColorStop(1, '#1b1a20');
      g.fillStyle = grd; g.fillRect(0, 0, cam.W, cam.H);
      this.court.drawFloor(g, cam, 'high');
      this.court.drawLines(g, cam);
      this.court.drawSheen(g, cam);
      const items = [];
      for (const f of this.figs) {
        const facing = f.spin === false ? f.facing : f.facing + this.angle;
        if (!f.custom) f.sk.solve(f.pose, f.x, f.y, facing);
        items.push({ sk: f.sk, st: f.st, d: cam.depth(f.y, 3) });
      }
      for (const a of this.actors) {
        if (a.hidden || (this.showFilm && this.filmOnly)) continue;
        a.solve();
        items.push({ sk: a.sk, st: a.style, d: cam.depth(a.y, 3), a });
      }
      items.sort((p, q) => q.d - p.d);
      for (const it of items) {
        this.fr.drawReflection(g, cam, it.sk, it.st, 0.12);
        this.fr.drawShadow(g, cam, it.sk, 1);
      }
      if (this.ball && this.ball.drawShadow) this.ball.drawShadow(g, cam);
      for (const it of items) {
        this.fr.draw(g, cam, it.sk, it.st, { dpr: this.dpr });
      }
      if (this.ball && this.ball.draw) this.ball.draw(g, cam);
      if (this.showFilm) this.drawFilm(g, cam);
      if (this.overlay) this.overlay(g, cam, this);
    }
    destroy() { this.figs = []; this.actors = []; }
  }

  M.Turntable = Turntable;
})();
