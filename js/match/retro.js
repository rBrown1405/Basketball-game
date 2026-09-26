/* Pro BBALL Coach — retro pixel court view (PBC.Match.RetroView).
 *
 * A Hoop Land / Full Court Heroes-style watch-sim: flat 2D side-view court,
 * chibi procedural pixel sprites (PBC.Match.Pixel), simple rim physics arcs,
 * LED boards + pixel crowd. Implements the SAME host API as PBC.Match.View
 * (see docs/MATCH_API.md §4) so live.js can swap it in with zero sim changes:
 *   play(possession, {onEvent, onDone}), update(dt), render(),
 *   clock(), shotClock(), isIdle(), resume(), setOption(), setDefScheme(),
 *   celebrate(), destroy(), resize().
 */
(function () {
  'use strict';
  const M = (window.PBC = window.PBC || {});
  M.Match = M.Match || {};
  const PX = M.Match.Pixel;

  const RIM_L = { x: 5.25, y: 25 }, RIM_R = { x: 88.75, y: 25 };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = t => t * t * (3 - 2 * t);
  const dist = (a, b, c, d) => Math.hypot(a - c, b - d);
  function shade(hex, f) {
    const n = parseInt(String(hex).slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    if (f >= 0) { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
    else { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
    return `rgb(${r | 0},${g | 0},${b | 0})`;
  }

  function attacksRight(teamIdx, period) {
    try {
      if (window.PBC && PBC.Sim && PBC.Sim.attacksRight) return PBC.Sim.attacksRight(teamIdx, period);
    } catch (e) { /* fall through */ }
    // default: home (0) attacks right in periods 1-2, left after
    const homeAttR = period <= 2;
    return teamIdx === 0 ? homeAttR : !homeAttR;
  }

  // display seconds per event type at 1x (host multiplies dt by speed)
  const DUR = {
    jump_ball: 1.6, sub: 0.7, timeout: 1.0, inbound: 1.2, advance: 1.5, set: 1.0,
    pass: 0.6, screen: 0.7, handoff: 0.7, move: 0.8, shot: 1.9, rebound: 1.0,
    turnover: 1.1, foul: 1.4, ft: 1.5, period_end: 1.4,
  };

  class RetroView {
    constructor(canvas, ctx, options) {
      this.canvas = canvas;
      this.g = canvas.getContext('2d');
      this.ctx = ctx || {};
      this.opts = Object.assign({ quality: 'high' }, options || {});
      this.teamLooks = [ctx.home || {}, ctx.away || {}];
      this.players = ctx.players || {};
      this.onCourt = [((ctx.lineups || [])[0] || []).slice(0, 5), ((ctx.lineups || [])[1] || []).slice(0, 5)];
      this.defScheme = ((ctx.defScheme || []).slice());
      this.actors = {};
      this.crowdSeed = [];
      for (let i = 0; i < 420; i++) this.crowdSeed.push(Math.random());
      this.wallT = 0; this.swishT = -9; this.swishSide = 1; this.flashT = -9;
      this.pending = null; this.frozen = false; this._resumeArmed = false;
      // broadcast camera: Hoop Land-style half-court follow cam (x = center ft, w = visible width ft)
      this.cam = { x: 47, w: 100 };
      this.score = [0, 0]; this.startScore = [0, 0];
      this.refX = 47;
      this.active = false; this.cb = null; this.P = null;
      this.evIdx = 0; this.evT = 0; this.evDur = 1; this.released = false; this.releaseT = 0.5; this.scored = false;
      this.elapsed = 0; this.totalDur = 1;
      this.clockV = (ctx.periodLen) || 720; this.scV = 24;
      this.ball = { x: 47, y: 25, z: 0, state: 'dead', holder: null, x0: 47, y0: 25, x1: 47, y1: 25, t: 0, dur: 0.5, made: false, kind: null, ev: null };
      this.cheer = 0;
      this._off = null; // offscreen buffer for chunky pixels
      this.resize(canvas.clientWidth || canvas.width || 960, canvas.clientHeight || canvas.height || 540);
      this.resetActors(47);
    }

    // ---------------- host API ----------------
    play(poss, cb) {
      this.P = poss || {}; this.cb = cb || {};
      this.evIdx = 0; this.evT = 0; this.released = false; this.scored = false;
      this.frozen = false; this.pending = null; this._resumeArmed = false;
      this.active = true;
      this.clockV = poss.clockStart != null ? poss.clockStart : 720;
      this.clockEnd = poss.clockEnd != null ? poss.clockEnd : 0;
      this.scV = 24;
      const evs = poss.events || [];
      this.totalDur = Math.max(1, evs.reduce((s, e) => s + (DUR[e.type] || 0.8), 0));
      this.elapsed = 0;
      // apply opening subs/timeouts instantly so lineups are right
      this.ensureActors();
      // scorebug: rewind from endScore by this possession's points (syncs exactly at onDone)
      let p0 = 0, p1 = 0;
      for (const e of evs) {
        if (e.type === 'shot' && e.made) { if (e.team === 0) p0 += e.pts; else p1 += e.pts; }
        else if (e.type === 'ft' && e.made) { const t = this.teamOf(e.shooter, null); if (t === 0) p0 += 1; else if (t === 1) p1 += 1; }
      }
      const es = poss.endScore || [0, 0];
      this.startScore = [Math.max(0, es[0] - p0), Math.max(0, es[1] - p1)];
      this.score = this.startScore.slice();
      this.refX = 47;
      // snap the broadcast camera to the opening frame, then glide
      const t = this.camTarget();
      this.cam = { x: t.x, w: t.w };
      this.beginEvent(0);
    }
    isIdle() { return !this.active; }
    clock() { return Math.max(0, this.clockV); }
    shotClock() { return Math.max(0, this.scV); }
    resume() {
      // GIM resolved: host appended result events after the pending shot.
      // Safe to call before the freeze too (then it just arms and won't stick).
      if (this.pending && this.frozen) this.doResume();
      else this._resumeArmed = true;
    }
    doResume() {
      this.frozen = false; this.pending = null; this._resumeArmed = false;
      // re-time the remainder (the events array grew)
      const evs = (this.P && this.P.events) || [];
      this.totalDur = Math.max(this.elapsed + 0.5, evs.reduce((s, e) => s + (DUR[e.type] || 0.8), 0));
      // continue the shot event's flight with the real result
      const shot = evs[this.evIdx];
      if (shot && shot.type === 'shot') {
        this.startBallFlight(shot, true);
        this.evDur = DUR.shot + 0.6;
      }
    }
    setOption() { /* retro view is always pixel; camera/quality accepted silently */ }
    setDefScheme(team, scheme) { this.defScheme[team] = scheme; }
    celebrate(team) {
      for (const id in this.actors) { const a = this.actors[id]; if (a.team === team) a.celebrateT = 3; }
      this.cheer = 3;
    }
    destroy() { this.active = false; this.cb = null; }
    resize(w, h) {
      this.cssW = Math.max(320, w | 0); this.cssH = Math.max(200, h | 0);
      const dpr = 1;
      this.canvas.width = this.cssW * dpr; this.canvas.height = this.cssH * dpr;
      // Higher internal resolution keeps the larger arcade sprites crisp without looking blocky.
      const bw = Math.max(240, Math.round(this.cssW / 2)), bh = Math.max(150, Math.round(this.cssH / 2));
      if (!this._off || this._off.width !== bw || this._off.height !== bh) {
        this._off = document.createElement('canvas'); this._off.width = bw; this._off.height = bh;
      }
      this.layout();
    }

    // ---------------- setup ----------------
    layout() {
      const W = this._off.width, H = this._off.height;
      // stands top ~20%, LED strip, bench band, court, bottom crowd strip
      this.standH = Math.round(H * 0.27);
      this.cx0 = Math.round(W * 0.10); this.cx1 = Math.round(W * 0.90);
      this.cy0 = this.standH + 9 + 26;
      this.cy1 = H - 12;
    }
    actorLook(id) { return this.players[id] || { id, num: 0, last: '?', look: { skin: 3, hair: 'fade' }, speed: 70, agility: 70 }; }
    ensureActors() {
      for (let t = 0; t < 2; t++) {
        for (const id of this.onCourt[t] || []) {
          if (!this.actors[id]) {
            const lk = this.actorLook(id);
            this.actors[id] = {
              id, team: t, x: 47 + (t ? 3 : -3), y: 25, tx: 47, ty: 25,
              face: t === 0 ? 1 : -1, animT: Math.random() * 2, moving: false,
              pose: 'stand', frame: 0, hasBall: false, celebrateT: 0,
              speed: 11 + (((lk.speed | 0) || 70) - 70) * 0.05,
            };
          } else this.actors[id].team = t;
        }
      }
    }
    resetActors(x) {
      this.ensureActors();
      for (const id in this.actors) { const a = this.actors[id]; a.x = x; a.y = 25; a.tx = x; a.ty = 25; }
    }
    basketX(teamIdx) {
      const per = (this.P && this.P.period) || 1;
      return attacksRight(teamIdx, per) ? RIM_R.x : RIM_L.x;
    }
    basketSide(teamIdx) { return this.basketX(teamIdx) > 47 ? 1 : -1; }
    teamOf(id, fb) {
      const a = id != null ? this.actors[id] : null;
      if (a && (a.team === 0 || a.team === 1)) return a.team;
      return fb;
    }
    /** Broadcast camera target: full court for tips/dead balls, half-court follow otherwise. */
    camTarget() {
      const evs = (this.P && this.P.events) || [];
      const ev = evs[this.evIdx];
      if (!ev || ev.type === 'jump_ball') return { x: 47, w: 100 };
      const b = this.ball;
      let bx = 47;
      if ((b.state === 'held' || b.state === 'gather') && b.holder != null && this.actors[b.holder]) bx = this.actors[b.holder].x;
      else bx = b.x;
      if (ev.type === 'inbound' && Math.abs(bx - 47) < 12) return { x: 47, w: 84 };
      if (bx >= 47) return { x: 68, w: 58 };
      return { x: 26, w: 58 };
    }
    sprScale() { return this.cam.w > 80 ? 2 : 3; }

    halfcourtSpots(off) {
      // 5 offensive spots vs the basket off attacks, keyed like a real set
      const bx = this.basketX(off), s = bx > 47 ? -1 : 1; // direction from basket to halfcourt
      return [
        { x: bx + s * 19, y: 25 },   // PG top
        { x: bx + s * 13, y: 12 },   // wing
        { x: bx + s * 13, y: 38 },   // wing
        { x: bx + s * 8, y: 19 },    // big elbow/block
        { x: bx + s * 8, y: 31 },    // big elbow/block
      ];
    }
    defSpot(manId, offPos, scheme, ballX, ballY, basketX) {
      if (scheme === 'zone23' || scheme === 'zone32' || scheme === 'zone131') {
        // zone spots shift toward the ball
        const spots = [{ x: basketX, y: 25 }, { x: basketX + (47 - basketX) * 0.12, y: 14 }, { x: basketX + (47 - basketX) * 0.12, y: 36 }, { x: basketX + (47 - basketX) * 0.22, y: 21 }, { x: basketX + (47 - basketX) * 0.22, y: 29 }];
        return spots[manId % 5];
      }
      // man: between your man and the basket, shaded to ball
      const bx = basketX;
      return { x: lerp(offPos.x, bx, 0.35) * 0.8 + ballX * 0.2, y: lerp(offPos.y, 25, 0.25) * 0.8 + ballY * 0.2 };
    }

    ballHandler() {
      const b = this.ball;
      if (b.holder != null && this.actors[b.holder]) return this.actors[b.holder];
      return null;
    }

    // ---------------- events ----------------
    beginEvent(i) {
      const evs = (this.P && this.P.events) || [];
      if (i >= evs.length) { this.finish(); return; }
      this.evIdx = i; this.evT = 0; this.released = false; this.scored = false;
      const ev = evs[i];
      this.evDur = DUR[ev.type] || 0.8;
      this.setTargets(ev);
      // fire-on-entry events (pass release, whistles, tips...)
      const fireNow = ['pass', 'handoff', 'turnover', 'foul', 'timeout', 'sub', 'inbound', 'advance', 'set', 'move', 'screen', 'period_end'].includes(ev.type);
      if (ev.type === 'sub') this.applySub(ev);
      if (ev.type === 'rebound') { /* fired on secure (end) */ }
      else if (ev.type === 'shot') { this.releaseT = 0.55; /* fired at release */ }
      else if (ev.type === 'ft') { this.releaseT = this.evDur * 0.55; /* fired at rim */ }
      else if (fireNow) this.fire(ev);
      if (ev.type === 'rebound' && ev.off === false) this.scV = 24;
      if (ev.type === 'rebound' && ev.off === true) this.scV = 14;
    }

    fire(ev) {
      try { if (this.cb && this.cb.onEvent) this.cb.onEvent(ev); } catch (e) { console.error(e); }
      // keep the canvas scorebug live (field goals + free throws; syncs to endScore at onDone)
      if (ev.type === 'score') { if (ev.team === 0 || ev.team === 1) this.score[ev.team] += ev.pts; }
      else if (ev.type === 'ft' && ev.made) { const t = this.teamOf(ev.shooter, ev.team); if (t === 0 || t === 1) this.score[t] += 1; }
      if (ev && ev.text) this.cheer = ev.type === 'shot' ? this.cheer : this.cheer;
    }
    fireScore(shotEv) {
      this.swishT = 0; this.swishSide = (shotEv.x > 47 ? 1 : -1);
      this.cheer = 2.5; this.flashT = 0;
      try { if (this.cb && this.cb.onEvent) this.cb.onEvent({ type: 'score', team: shotEv.team, pts: shotEv.pts, shotEvent: shotEv }); } catch (e) { console.error(e); }
    }
    finish() {
      this.active = false;
      if (this.P && this.P.endScore) this.score = this.P.endScore.slice();
      try { if (this.cb && this.cb.onDone) this.cb.onDone(); } catch (e) { console.error(e); }
    }

    applySub(ev) {
      const t = ev.team;
      const oc = this.onCourt[t] || [];
      const ix = oc.indexOf(ev.out);
      if (ix >= 0) oc[ix] = ev.in; else { oc.push(ev.in); oc.shift(); }
      this.ensureActors();
      // sub runs to center, replaced player jogs off (fade to bench = sideline)
      if (this.actors[ev.in]) { this.actors[ev.in].x = clamp((this.actors[ev.out] || {}).x || 47, 2, 92); this.actors[ev.in].y = 4; }
    }

    setTargets(ev) {
      const P = this.P, off = P.off | 0, def = 1 - off;
      const bx = this.basketX(off);
      const spots = this.halfcourtSpots(off);
      const ocO = this.onCourt[off] || [], ocD = this.onCourt[def] || [];
      const put = (id, x, y) => { const a = this.actors[id]; if (a) { a.tx = clamp(x, 1, 93); a.ty = clamp(y, 3, 47); } };
      const scheme = this.defScheme[def] || 'man';
      const ball = this.ballHolderPos();
      switch (ev.type) {
        case 'jump_ball': {
          const j = ev.jumpers || [];
          if (this.actors[j[0]]) { const a = this.actors[j[0]]; a.tx = 46; a.ty = 23; }
          if (this.actors[j[1]]) { const a = this.actors[j[1]]; a.tx = 48; a.ty = 27; }
          ocO.concat(ocD).forEach((id, k) => { if (id !== j[0] && id !== j[1]) put(id, 47 + (k % 2 ? 5 : -5), 15 + (k * 7) % 22); });
          this.ball.state = 'loose'; this.ball.x0 = 47; this.ball.y0 = 25; this.ball.x1 = 47; this.ball.y1 = 25; this.ball.t = 0; this.ball.dur = this.evDur * 0.7; this.ball.z = 6;
          break;
        }
        case 'inbound': {
          const sx = clamp(ev.x != null ? ev.x : (bx > 47 ? 90 : 4), 1, 93), sy = clamp(ev.y != null ? ev.y : 25, 3, 47);
          if (this.actors[ev.by]) { const a = this.actors[ev.by]; a.tx = sx; a.ty = ev.spot === 'sideline' ? (sy < 25 ? 2 : 48) : sy; }
          if (this.actors[ev.to]) put(ev.to, sx + (47 - sx > 0 ? 4 : -4), sy);
          this.sendToSpots(off, spots, ev.to, 0.4);
          this.sendDefense(def, ocD, ocO, spots, scheme, sx, sy, this.basketX(def));
          this.ball.state = 'held'; this.ball.holder = ev.by;
          break;
        }
        case 'advance': {
          const h = ev.handler;
          put(h, bx + (bx > 47 ? -20 : 20), 25);
          this.sendToSpots(off, spots, h, 1);
          this.sendDefense(def, ocD, ocO, spots, scheme, 47, 25, this.basketX(def));
          this.ball.state = 'held'; this.ball.holder = h;
          break;
        }
        case 'set': {
          this.sendToSpots(off, this.playSpots(P.play, off, ev), null, 1);
          this.sendDefense(def, ocD, ocO, this.playSpots(P.play, off, ev), scheme, ball.x, ball.y, this.basketX(def));
          break;
        }
        case 'pass': {
          if (this.actors[ev.to]) { const a = this.actors[ev.to]; a.tx = a.x; a.ty = a.y; }
          this.launchPass(ev.from, ev.to);
          this.nudgeDefense(def, ev.to);
          break;
        }
        case 'handoff': {
          if (this.actors[ev.to]) put(ev.to, (this.actors[ev.from] || { x: 60 }).x + 2, (this.actors[ev.from] || { y: 25 }).y);
          this.ball.state = 'held'; this.ball.holder = ev.to;
          break;
        }
        case 'screen': case 'move': {
          const m = ev.player || ev.user;
          if (m && this.actors[m]) { const a = this.actors[m]; a.tx = clamp(a.x + (bx - a.x) * 0.15, 2, 92); a.ty = clamp(a.y + (a.y < 25 ? 2 : -2), 3, 47); }
          break;
        }
        case 'shot': {
          const s = ev.shooter;
          if (s && this.actors[s]) { const a = this.actors[s]; a.tx = ev.x; a.ty = ev.y; a.x = lerp(a.x, ev.x, 0.35); a.y = lerp(a.y, ev.y, 0.35); }
          if (ev.defender && this.actors[ev.defender]) { const d = this.actors[ev.defender]; d.tx = ev.x + (this.actors[s] ? Math.sign(d.x - ev.x) * 1.5 : 0); d.ty = ev.y; }
          // crash vs retreat
          ocO.forEach((id, k) => { if (id !== s) put(id, k < 2 ? bx + (bx > 47 ? -3 : 3) : this.actors[id].tx, k < 2 ? 22 + k * 6 : this.actors[id].ty); });
          ocD.forEach((id) => { const a = this.actors[id]; if (a && id !== ev.defender) { a.tx = lerp(a.x, bx, 0.25); a.ty = lerp(a.y, 25, 0.2); } });
          this.ball.state = 'gather'; this.ball.holder = s;
          this.scV = Math.min(this.scV, 3);
          break;
        }
        case 'rebound': {
          const r = this.ballLanding();
          if (ev.player && this.actors[ev.player]) put(ev.player, r.x, r.y);
          break;
        }
        case 'turnover': {
          if (ev.stealer && this.actors[ev.stealer]) { const a = this.actors[ev.stealer]; a.tx = a.x; a.ty = a.y; this.ball.state = 'held'; this.ball.holder = ev.stealer; }
          else { this.ball.state = 'loose'; const r = this.ballLanding(); this.ball.x0 = this.ball.x; this.ball.y0 = this.ball.y; this.ball.x1 = r.x; this.ball.y1 = r.y; this.ball.t = 0; this.ball.dur = this.evDur * 0.8; }
          break;
        }
        case 'foul': {
          if (ev.fouler && this.actors[ev.fouler] && ev.on && this.actors[ev.on]) {
            const v = this.actors[ev.on]; this.actors[ev.fouler].tx = v.x + 1.5; this.actors[ev.fouler].ty = v.y;
          }
          this.ball.state = 'dead';
          break;
        }
        case 'ft': {
          const fbx = this.basketX(ev.team != null ? ev.team : off);
          const fx = fbx > 47 ? 75 : 19, fy = 25;
          if (this.actors[ev.shooter]) { const a = this.actors[ev.shooter]; a.tx = fx; a.ty = fy; a.x = lerp(a.x, fx, 0.6); a.y = lerp(a.y, fy, 0.6); }
          // (a technical free throw: nobody lines up on the lane)
          if (!ev.tech) ocO.concat(ocD).forEach((id, k) => { if (id !== ev.shooter && this.actors[id]) { const a = this.actors[id]; const lane = k % 2 ? 1 : -1; a.tx = fbx + (fbx > 47 ? -6 - (k >> 1) * 2 : 6 + (k >> 1) * 2); a.ty = 25 + lane * (5 + (k % 3)); } });
          this.ball.state = 'gather'; this.ball.holder = ev.shooter;
          break;
        }
        case 'period_end': this.ball.state = 'dead'; break;
        default: break;
      }
      void ball;
    }

    sendToSpots(team, spots, skipId, k) {
      (this.onCourt[team] || []).forEach((id, i) => {
        if (id === skipId) return;
        const a = this.actors[id]; if (!a) return;
        const s = spots[i % spots.length];
        a.tx = lerp(a.tx, s.x, k); a.ty = lerp(a.ty, s.y, k);
      });
    }
    sendDefense(def, ocD, ocO, offSpots, scheme, ballX, ballY, basketX) {
      ocD.forEach((id, i) => {
        const a = this.actors[id]; if (!a) return;
        const man = this.actors[ocO[i % ocO.length]];
        const mp = man ? { x: man.tx, y: man.ty } : offSpots[i % offSpots.length];
        const s = this.defSpot(i, mp, scheme, ballX, ballY, basketX);
        a.tx = s.x; a.ty = s.y;
      });
    }
    nudgeDefense(def, towardId) {
      const t = this.actors[towardId];
      if (!t) return;
      for (const id of this.onCourt[def] || []) { const a = this.actors[id]; if (a) { a.tx = lerp(a.tx, t.x, 0.2); a.ty = lerp(a.ty, t.y, 0.2); } }
    }
    playSpots(play, off, ev) {
      const base = this.halfcourtSpots(off);
      const bx = this.basketX(off), s = bx > 47 ? -1 : 1;
      switch (play) {
        case 'post': return [base[0], base[1], base[2], { x: bx + s * 4, y: 19 }, base[4]];
        case 'pnr': return [base[0], base[1], base[2], { x: bx + s * 14, y: 22 }, base[4]];
        case 'iso': return [{ x: bx + s * 15, y: 30 }, { x: bx + s * 6, y: 8 }, { x: bx + s * 6, y: 42 }, { x: bx + s * 10, y: 25 }, base[4]];
        case 'spot': return [{ x: bx + s * 17, y: 25 }, { x: bx + s * 5, y: 6 }, { x: bx + s * 5, y: 44 }, base[3], base[4]];
        case 'transition': return base.map(p => ({ x: p.x + s * -4, y: p.y }));
        default: return base;
      }
    }
    ballHolderPos() {
      const h = this.ballHandler();
      if (h) return { x: h.x, y: h.y };
      return { x: this.ball.x, y: this.ball.y };
    }
    ballLanding() {
      const evs = (this.P && this.P.events) || [];
      const shot = evs[this.evIdx - 1];
      if (shot && shot.type === 'shot') return { x: clamp(shot.x + (Math.random() * 6 - 3), 2, 92), y: clamp(25 + (Math.random() * 10 - 5), 4, 46) };
      return { x: clamp(this.ball.x + (Math.random() * 8 - 4), 2, 92), y: clamp(this.ball.y + (Math.random() * 8 - 4), 4, 46) };
    }
    launchPass(from, to) {
      const a = this.actors[from], b = this.actors[to];
      this.ball.state = 'pass';
      this.ball.x0 = a ? a.x : 47; this.ball.y0 = a ? a.y : 25;
      this.ball.x1 = b ? b.tx : 60; this.ball.y1 = b ? b.ty : 25;
      this.ball.t = 0; this.ball.dur = Math.max(0.25, this.evDur * 0.8);
      this.ball.holder = null;
      this.ball.arriveHolder = to;
    }
    startBallFlight(shot, resolved) {
      // called at release (or at resume with the true result)
      const made = !!shot.made;
      const rim = shot.x > 47 ? RIM_R : RIM_L;
      this.ball.state = 'shot';
      this.ball.x0 = shot.x; this.ball.y0 = shot.y;
      this.ball.x1 = rim.x; this.ball.y1 = rim.y;
      this.ball.t = 0; this.ball.dur = 0.75; this.ball.z = 0;
      this.ball.made = made; this.ball.ev = shot;
      this.ball.holder = null;
      void resolved;
    }

    // ---------------- tick ----------------
    update(dt) {
      dt = clamp(+dt || 0, 0, 2);
      this.wallT += dt;
      if (this.swishT < 5) this.swishT += dt;
      if (this.flashT < 5) this.flashT += dt;
      if (this.cheer > 0) this.cheer -= dt;
      // sub-step so 16x stays stable
      let left = dt;
      let guard = 0;
      while (left > 1e-6 && guard++ < 40) {
        const h = Math.min(0.05, left); left -= h;
        this.step(h);
      }
    }
    step(h) {
      // celebrations decay
      for (const id in this.actors) { const a = this.actors[id]; if (a.celebrateT > 0) a.celebrateT -= h; }
      if (!this.active || this.frozen) { this.animIdle(h); return; }
      const evs = (this.P && this.P.events) || [];
      const ev = evs[this.evIdx];
      if (!ev) { this.finish(); return; }
      this.evT += h; this.elapsed += h;
      // glide the broadcast camera (snaps faster at high playback speeds)
      const ct = this.camTarget(), ck = Math.min(1, h * 2.4);
      this.cam.x += (ct.x - this.cam.x) * ck;
      this.cam.w += (ct.w - this.cam.w) * ck;
      this.cam.x = clamp(this.cam.x, this.cam.w / 2 - 10, 94 - this.cam.w / 2 + 10);
      this.cam.w = clamp(this.cam.w, 40, 104);
      // referee trails the ball up the sideline
      const bp = this.ballHolderPos();
      this.refX += (clamp(bp.x, 12, 82) - this.refX) * Math.min(1, h * 1.2);
      // clocks
      const f = clamp(this.elapsed / this.totalDur, 0, 1);
      this.clockV = lerp(this.P.clockStart, this.P.clockEnd != null ? this.P.clockEnd : 0, f);
      if (ev.type !== 'shot' && ev.type !== 'ft') this.scV = Math.max(0, this.scV - h * (this.evDur > 0 ? 24 / this.totalDur * (this.totalDur / Math.max(1, this.totalDur)) : 0) - h * 0.4);
      // move actors
      for (const id in this.actors) {
        const a = this.actors[id];
        const d = dist(a.x, a.y, a.tx, a.ty);
        a.moving = d > 0.15;
        if (a.moving) {
          const stepLen = Math.min(d, a.speed * h * (d > 12 ? 1.6 : 1));
          a.x += (a.tx - a.x) / d * stepLen; a.y += (a.ty - a.y) / d * stepLen;
          a.face = (a.tx - a.x) !== 0 ? Math.sign(a.tx - a.x) || a.face : a.face;
        }
        a.animT += h * (a.moving ? 1.6 : 1);
      }
      // offense faces the rim, ball-handler faces target
      const off = this.P.off | 0, bx = this.basketX(off);
      for (const id of this.onCourt[off] || []) { const a = this.actors[id]; if (a && !a.moving) a.face = bx > a.x ? 1 : -1; }
      this.stepBall(h, ev);
      // timed fires inside the event
      if (ev.type === 'shot' && !this.released && this.evT >= this.releaseT) {
        this.released = true;
        if (ev.pending) {
          // GIM: freeze like the contract §6 — arm the freeze BEFORE firing,
          // so a host that resolves synchronously inside onEvent can't soft-lock.
          this.pending = ev; this.frozen = true;
          this.ball.state = 'gather'; this.ball.holder = ev.shooter;
          this.fire(ev);
          if (this._resumeArmed) this.doResume(); // host already resolved during onEvent
          return;
        }
        this.fire(ev);
        this.startBallFlight(ev, true);
      }
      if (ev.type === 'ft' && !this.released && this.evT >= this.releaseT) {
        this.released = true;
        // ball leaves the hand; the ft event itself fires when it drops/misses
        const rim = ev.team === 0 || ev.team === 1 ? (this.basketX(ev.team) > 47 ? RIM_R : RIM_L) : (bx > 47 ? RIM_R : RIM_L);
        this.ball.state = 'shot'; this.ball.x0 = this.ballHolderPos().x; this.ball.y0 = this.ballHolderPos().y;
        this.ball.x1 = rim.x; this.ball.y1 = rim.y; this.ball.t = 0; this.ball.dur = 0.6; this.ball.made = !!ev.made; this.ball.ev = ev;
      }
      if (ev.type === 'shot' && this.released && !this.scored && this.ball.state === 'done') {
        this.scored = true;
        if (this.ball.made) this.fireScore(ev);
      }
      if (ev.type === 'ft' && this.released && this.ball.state === 'done' && !this.scored) {
        this.scored = true;
        this.fire(ev); // ft fires at the drop/miss, per the contract
        // NOTE: no {type:'score'} here — the contract says made FTs are reported
        // by the ft event alone (the host adds +1 itself). Just swish the net.
        if (this.ball.made) this.swishT = 0;
      }
      if (ev.type === 'jump_ball' && !this.released && this.evT >= this.evDur * 0.7) {
        this.released = true; this.fire(ev);
        const tip = ev.tipTo;
        if (tip && this.actors[tip]) { this.ball.state = 'held'; this.ball.holder = tip; }
      }
      // end of event
      if (this.evT >= this.evDur) {
        if (ev.type === 'pass' && this.ball.arriveHolder) { this.ball.state = 'held'; this.ball.holder = this.ball.arriveHolder; this.ball.arriveHolder = null; }
        if (ev.type === 'rebound') { this.ball.state = 'held'; this.ball.holder = ev.player; this.fire(ev); }
        else if (ev.type === 'shot' && !this.ball.made && this.ball.state === 'done') {
          // missed shot with no rebound event yet (shouldn't happen, but never soft-lock)
          this.ball.state = 'loose';
        }
        if (ev.type !== 'rebound') this.clockTick(ev);
        this.beginEvent(this.evIdx + 1);
      }
    }
    clockTick(ev) {
      if (ev.type === 'shot' || ev.type === 'turnover' || ev.type === 'period_end') this.scV = 24;
      void ev;
    }
    animIdle(h) {
      for (const id in this.actors) { const a = this.actors[id]; a.animT += h; a.moving = false; }
      if (this.ball.state === 'shot' || this.ball.state === 'pass') { /* frozen mid-flight during GIM */ }
    }
    stepBall(h, ev) {
      const b = this.ball;
      if (b.state === 'held' || b.state === 'gather' || b.state === 'dead') {
        const hh = this.ballHandler();
        if (hh) { b.x = hh.x; b.y = hh.y; }
        return;
      }
      if (b.state === 'pass' || b.state === 'shot' || b.state === 'loose') {
        b.t += h;
        const t = clamp(b.t / Math.max(0.05, b.dur), 0, 1);
        b.x = lerp(b.x0, b.x1, ease(t));
        b.y = lerp(b.y0, b.y1, ease(t));
        b.z = b.state === 'shot' ? Math.sin(t * Math.PI) * 9 : b.state === 'pass' ? Math.sin(t * Math.PI) * 2 : Math.max(0, (b.z || 0) - h * 20);
        if (t >= 1) {
          if (b.state === 'shot') {
            if (b.made) { b.state = 'done'; }
            else {
              // clank off the rim toward a loose spot (rebound event secures it)
              b.state = 'loose';
              b.x0 = b.x1; b.y0 = b.y1;
              const r = this.ballLanding();
              b.x1 = r.x; b.y1 = r.y; b.t = 0; b.dur = 0.55; b.z = 3;
            }
          } else if (b.state === 'loose') {
            if (ev && ev.type === 'rebound') { b.state = 'held'; b.holder = ev.player; }
            else b.state = 'done';
          } else b.state = 'done';
        }
      }
    }

    /** Hoop Land-style pixel scorebug: [HOME 00] [AWAY 00] [4TH 1:23] [11] */
    drawBug(g, W) {
      const Hh = this.teamLooks[0] || {}, Aa = this.teamLooks[1] || {};
      const f = 2, pad = 6;
      const per = (this.P && this.P.period) || 1;
      const perLbl = per <= 4 ? ['1ST', '2ND', '3RD', '4TH'][per - 1] : 'OT' + (per - 4 > 1 ? per - 4 : '');
      const c = Math.max(0, this.clockV);
      const clk = `${Math.floor(c / 60)}:${String(Math.floor(c % 60)).padStart(2, '0')}`;
      const sc = String(clamp(Math.ceil(this.scV), 0, 99));
      const blocks = [
        [`${Hh.abbr || 'HOME'} ${this.score[0]}`, (Hh.colors || {}).primary || '#123a7a'],
        [`${Aa.abbr || 'AWAY'} ${this.score[1]}`, (Aa.colors || {}).primary || '#7a1222'],
        [`${perLbl} ${clk}`, '#0a0f1e'],
        [sc, '#c8102e'],
      ];
      const bw = (t) => PX.textW(t, f) + pad * 2;
      const h = 7 * f + 8, y = 2, gap = 3;
      const total = blocks.reduce((s, b) => s + bw(b[0]), 0) + gap * (blocks.length - 1);
      let x = Math.round(W / 2 - total / 2);
      g.fillStyle = 'rgba(2,4,10,.85)'; g.fillRect(x - 2, y - 2, total + 4, h + 4);
      blocks.forEach(([t, bg], i) => {
        const w = bw(t);
        g.fillStyle = bg; g.fillRect(x, y, w, h);
        PX.pixText(g, t, x + w / 2, y + 4, f, '#fff', 'c', true);
        x += w + (i < blocks.length - 1 ? gap : 0);
      });
    }

    /** Near-side crowd strip along the bottom (screen-anchored). */
    bottomCrowd(g, W, H) {
      const cols = ['#7a2530', '#274a7a', '#8a6f2f', '#9aa3b2', '#2a6a6a', '#5a3a7a', '#3a3f4d', '#83502f'];
      const y0 = H - 10;
      for (let x = 2, i = 0; x < W - 2; x += 5, i++) {
        const n = this.crowdSeed[(x * 11 + i * 37) % this.crowdSeed.length];
        g.fillStyle = cols[(n * 89 + i * 7) % cols.length | 0];
        g.fillRect(x, y0 + 3, 3, 3); // head
        g.fillStyle = '#14161e';
        g.fillRect(x - 1, y0 + 6, 5, 4); // shoulders
      }
    }

    // ---------------- render ----------------
    render() {
      const buf = this._off, g = buf.getContext('2d');
      const W = buf.width, H = buf.height;
      g.imageSmoothingEnabled = false;
      this.drawArena(g, W, H);
      this.drawSidelines(g);
      this.drawCourt(g);
      this.drawHoop(g, -1); this.drawHoop(g, 1);
      // depth sort by y
      const list = Object.values(this.actors).sort((a, b) => a.y - b.y);
      for (const a of list) this.drawActor(g, a);
      this.drawBall(g);
      // The application header carries the broadcast score bug; leaving the
      // canvas clear lets the physical center-hung board own the arena view.
      this.bottomCrowd(g, W, H);
      // blit chunky
      const mg = this.g;
      mg.setTransform(1, 0, 0, 1, 0, 0);
      mg.imageSmoothingEnabled = false;
      mg.clearRect(0, 0, this.canvas.width, this.canvas.height);
      mg.drawImage(buf, 0, 0, this.canvas.width, this.canvas.height);
      mg.imageSmoothingEnabled = true;
    }

    map(x, y) {
      const W = this._off.width;
      const zoom = W / this.cam.w;
      return {
        // Shallow oblique skew gives a 2.5D arcade broadcast angle while
        // retaining the side-to-side readability essential to a watch sim.
        x: (x - this.cam.x) * zoom + W / 2 + (clamp(y, -4, 58) - 25) * zoom * .16,
        y: this.cy1 - (clamp(y, -4, 58) / 50) * (this.cy1 - this.cy0),
      };
    }

    drawArena(g, W, H) {
      g.fillStyle = '#02040a'; g.fillRect(0, 0, W, H);
      // Layered upper bowl: each fan has a head + jersey pixel, making the crowd
      // read as people instead of a flat texture when the camera moves.
      const rows = 7;
      const cols = ['#d84b4b', '#4f86d9', '#e1b64d', '#d7dce6', '#55a696', '#936cc7', '#526176', '#c87d48'];
      for (let r = 0; r < rows; r++) {
        const y0 = 2 + r * ((this.standH - 4) / rows), rh = (this.standH - 4) / rows;
        g.fillStyle = r % 2 ? '#121a2b' : '#18233a'; g.fillRect(0, y0, W, rh);
        for (let yy = Math.round(y0) + 1; yy < y0 + rh - 1; yy += 4) {
          for (let x = (r % 2) * 2; x < W - 1; x += 4) {
            const n = this.crowdSeed[(x * 13 + yy * 7 + r * 131) % this.crowdSeed.length];
            const jump = this.cheer > 0 && ((x + yy + r) % 3 !== 0) ? -2 : (Math.sin(this.wallT * 2 + n * 20) > .8 ? -1 : 0);
            g.fillStyle = '#d49a76'; g.fillRect(x + 1, yy + jump, 2, 2);
            g.fillStyle = cols[(n * 97 + r * 13 + x) % cols.length | 0];
            g.fillRect(x, yy + 2 + jump, 3, 2);
          }
        }
      }
      // LED strip: one seamless right-to-left scroll (no overlapping copies)
      const home = this.teamLooks[0] || {}, away = this.teamLooks[1] || {};
      const ly = this.standH;
      g.fillStyle = '#02040a'; g.fillRect(0, ly, W, 9);
      const msg = `  ${(home.abbr || 'HOME')} vs ${(away.abbr || 'AWAY')}   •   PRO BBALL COACH   •  `;
      g.font = '8px monospace'; g.textBaseline = 'top'; g.textAlign = 'left';
      const tw = Math.max(40, g.measureText(msg).width);
      const ox = W - ((this.wallT * 22) % (tw + 24));
      g.fillStyle = '#ffcf5a';
      g.fillText(msg, ox, ly + 1);
      g.fillStyle = (home.colors || {}).primary || '#333';
      g.fillRect(0, ly + 8, W, 1);
      // Hanging center-hung scoreboard, deliberately part of the arena rather
      // than another UI panel. It remains visible through side-scrolling play.
      const sw = Math.min(112, Math.round(W * .27)), sx = Math.round(W / 2 - sw / 2), sy = 4;
      g.fillStyle = '#05070d'; g.fillRect(sx - 3, sy - 2, sw + 6, 28);
      g.fillStyle = '#76839a'; g.fillRect(sx - 3, sy - 2, sw + 6, 2); g.fillRect(sx - 3, sy + 24, sw + 6, 2);
      g.fillStyle = (home.colors || {}).primary || '#1d4ed8'; g.fillRect(sx, sy, Math.floor(sw / 2) - 1, 22);
      g.fillStyle = (away.colors || {}).primary || '#be123c'; g.fillRect(sx + Math.ceil(sw / 2) + 1, sy, Math.floor(sw / 2) - 1, 22);
      const per = (this.P && this.P.period) || 1, clk = `${Math.floor(Math.max(0, this.clockV) / 60)}:${String(Math.floor(Math.max(0, this.clockV) % 60)).padStart(2, '0')}`;
      PX.pixText(g, `${home.abbr || 'H'} ${this.score[0]}`, sx + sw * .25, sy + 3, 2, '#fff', 'c', true);
      PX.pixText(g, `${away.abbr || 'A'} ${this.score[1]}`, sx + sw * .75, sy + 3, 2, '#fff', 'c', true);
      PX.pixText(g, `${per <= 4 ? per + 'Q' : 'OT'} ${clk}`, sx + sw / 2, sy + 15, 1, '#ffcf5a', 'c', true);
      // team-color apron everywhere around the court (Hoop Land style)
      g.fillStyle = shade((home.colors || {}).primary || '#1d4ed8', -0.18);
      g.fillRect(0, ly + 9, W, H - ly - 9);
    }

    /** Far-sideline dressing: benches, arena banner, apron lettering, cameras, ref. */
    drawSidelines(g) {
      const W = this._off.width;
      const home = this.teamLooks[0] || {};
      const vis = (wx) => { const p = this.map(wx, 25); return p.x > -40 && p.x < W + 40; };
      // --- benches: real roster bodies in team jerseys, world-anchored ---
      const benchRow = (team, x0, x1) => {
        const tl = this.teamLooks[team] || {};
        const jer = (tl.uniform || {}).jersey || '#888888';
        const oc = ((this.onCourt[team] || []).map(String));
        const ids = Object.keys(this.players).filter(id => this.players[id].teamIdx === team && !oc.includes(id)).slice(0, 7);
        // coach in a suit at the end
        const all = [{ suit: true }].concat(ids.map(id => ({ id }))).concat([{ suit: true }]);
        all.forEach((s, i) => {
          const x = x0 + (x1 - x0) * (all.length === 1 ? 0.5 : i / (all.length - 1));
          const p = this.map(x, 54.5);
          if (p.x < -12 || p.x > W + 12) return;
          g.fillStyle = '#20242e'; g.fillRect(p.x - 4, p.y - 9, 8, 9); // chair
          g.fillStyle = '#313a4e'; g.fillRect(p.x - 4, p.y - 9, 8, 2);
          const lk = (s.id != null && this.players[s.id] && this.players[s.id].look) || {};
          const skin = PX.SKIN[clamp((lk.skin == null ? 3 : lk.skin) | 0, 0, 7)];
          g.fillStyle = skin; g.fillRect(p.x - 2, p.y - 15, 4, 4); // head
          g.fillStyle = s.suit ? '#3a2c1c' : (lk.hairColor || '#16110e'); g.fillRect(p.x - 2, p.y - 15, 4, 2);
          g.fillStyle = s.suit ? '#23232c' : jer; g.fillRect(p.x - 3, p.y - 11, 6, 5); // torso
        });
      };
      benchRow(0, 28, 43);
      benchRow(1, 51, 66);
      // --- arena banner (Hoop Land's "KOALITY GAME" board) ---
      const btxt = `${(home.city || '').toUpperCase()} ${(home.name || '').toUpperCase()}`.trim() || 'PRO BBALL';
      const bw = PX.textW(btxt, 1) + 16;
      const bp = this.map(47, 57.6);
      if (bp.x + bw / 2 > -30 && bp.x - bw / 2 < W + 30) {
        g.fillStyle = '#0a0f1e'; g.fillRect(bp.x - bw / 2, bp.y - 7, bw, 14);
        g.fillStyle = 'rgba(255,255,255,.3)'; g.fillRect(bp.x - bw / 2, bp.y - 7, bw, 1); g.fillRect(bp.x - bw / 2, bp.y + 6, bw, 1);
        PX.pixText(g, btxt, bp.x, bp.y - 4, 1, '#ffcf5a', 'c');
      }
      // --- vertical apron lettering ("NEW YORK EMPIRE" style) ---
      const vtxt = `${(home.city || '')} ${(home.name || '')}`.trim().toUpperCase();
      if (vtxt) {
        const vp = this.map(-0.5, 25), tw = PX.textW(vtxt, 1);
        if (vp.x > -6 && vp.x < W * 0.5 && tw < (this.cy1 - this.cy0) * 0.92) {
          g.save();
          g.translate(Math.round(vp.x), Math.round(vp.y + tw / 2));
          g.rotate(-Math.PI / 2);
          PX.pixText(g, vtxt, 0, -3, 1, '#ffffff', null, 'rgba(0,0,0,.45)');
          g.restore();
        }
      }
      // --- baseline cameramen ---
      for (const wx of [1.5, 92.5]) {
        const p = this.map(wx, -2.5);
        if (p.x < -10 || p.x > W + 10) continue;
        g.fillStyle = '#14161c'; g.fillRect(p.x - 2, p.y - 9, 4, 6);
        g.fillRect(p.x - 2, p.y - 3, 1, 3); g.fillRect(p.x + 1, p.y - 3, 1, 3);
        g.fillStyle = '#2a2f3a'; g.fillRect(p.x + (wx < 47 ? 1 : -6), p.y - 12, 5, 4);
        g.fillStyle = '#c8102e'; g.fillRect(p.x + (wx < 47 ? 4 : -4), p.y - 11, 1, 1);
      }
      // --- referee trailing the play ---
      {
        const p = this.map(this.refX, 3.5);
        if (p.x > -12 && p.x < W + 12) {
          g.fillStyle = 'rgba(0,0,0,.3)';
          g.beginPath(); g.ellipse(p.x, p.y + 1, 5, 2, 0, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#16161a'; g.fillRect(p.x - 2, p.y - 8, 2, 6); g.fillRect(p.x, p.y - 8, 2, 6);
          g.fillStyle = '#dedede'; g.fillRect(p.x - 3, p.y - 16, 6, 8);
          g.fillStyle = '#161616'; g.fillRect(p.x - 1, p.y - 16, 1, 8); g.fillRect(p.x + 1, p.y - 16, 1, 8);
          g.fillStyle = '#a26a45'; g.fillRect(p.x - 2, p.y - 20, 4, 4);
        }
      }
      void vis;
    }

    drawCourt(g) {
      const home = this.teamLooks[0] || {}, court = home.court || {};
      const wood = court.wood === 'dark' ? '#9a572c' : court.wood === 'medium' ? '#c9823e' : '#e5ad5e';
      const paint = court.paint || ((home.colors || {}).primary) || '#1d4ed8';
      const P = (x, y) => this.map(x, y);
      const poly = (pts, fill, stroke) => {
        g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); g.closePath();
        if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.stroke(); }
      };
      const line = (pts, col, w) => { g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); g.strokeStyle = col; g.lineWidth = w || 1; g.stroke(); };
      const floor = [P(0, 0), P(94, 0), P(94, 50), P(0, 50)];
      poly(floor, '#07101a');
      // The court is a shallow 2.5D diamond rather than a flat rectangle.
      const inset = [P(1, 1), P(93, 1), P(93, 49), P(1, 49)];
      poly(inset, wood);
      // Warm maple planks, with a highlight and seam every few feet.
      for (let y = 3; y < 50; y += 4) line([P(1, y), P(93, y)], 'rgba(78,36,14,.25)');
      for (let x = 4; x < 94; x += 9) line([P(x, 1), P(x, 49)], 'rgba(255,238,192,.10)');
      g.lineWidth = 1; poly(inset, null, '#fff0d0');
      line([P(47, 1), P(47, 49)], '#fff0d0');
      // Paints and keys follow the court perspective instead of screen rectangles.
      [[1, 17, 17, 33], [77, 17, 93, 33]].forEach(k => {
        poly([P(k[0], k[1]), P(k[2], k[1]), P(k[2], k[3]), P(k[0], k[3])], paint, '#fff0d0');
        line([P(k[0], 18), P(k[2], 18)], 'rgba(255,255,255,.25)');
      });
      const circle = (cx, cy, r, col, dash) => {
        const pts = []; for (let i = 0; i <= 24; i++) { const a = i / 24 * Math.PI * 2; pts.push(P(cx + Math.cos(a) * r, cy + Math.sin(a) * r)); }
        if (dash) { g.save(); g.setLineDash([2, 2]); } line(pts, col); if (dash) g.restore();
      };
      circle(47, 25, 6, '#fff0d0'); circle(19, 25, 6, '#fff0d0', true); circle(75, 25, 6, '#fff0d0', true);
      // Segmented three-point arcs look clean after pixel scaling and preserve the angled perspective.
      const arc = (rim, left) => { const pts = []; for (let i = 0; i <= 20; i++) { const a = -1.16 + i / 20 * 2.32; const x = rim.x + Math.cos(a) * 23.2, y = rim.y + Math.sin(a) * 23.2; if ((left && x <= 29) || (!left && x >= 65)) pts.push(P(x, y)); } line(pts, '#fff0d0', 1); };
      arc(RIM_L, true); arc(RIM_R, false);
      const c = P(47, 25), logo = (court.logoText || home.abbr || 'PBC').slice(0, 4);
      PX.pixText(g, logo, c.x, c.y - 12, 3, shade(paint, -0.2), 'c', '#fff0d0');
    }

    drawHoop(g, side) {
      const rim = side < 0 ? RIM_L : RIM_R;
      const p = this.map(rim.x, rim.y);
      const dir = side < 0 ? -1 : 1;
      const pad = ((this.teamLooks[0] || {}).colors || {}).primary || '#1b2233';
      // stanchion arm + padded base behind the backboard
      g.fillStyle = '#10141f';
      g.fillRect(p.x + dir * 11, p.y - 22, 4, 26);
      g.fillStyle = pad;
      g.fillRect(p.x + dir * 7, p.y - 10, 5, 12);
      g.fillStyle = 'rgba(255,255,255,.25)';
      g.fillRect(p.x + dir * 7, p.y - 10, 5, 2);
      // glass backboard with dark frame
      g.fillStyle = '#0b0f18';
      g.fillRect(p.x + dir * 5 - 1, p.y - 16, 4, 16);
      g.fillStyle = 'rgba(225,232,245,.92)';
      g.fillRect(p.x + dir * 5, p.y - 15, 2, 14);
      // shooter's square
      g.fillStyle = 'rgba(226,84,11,.9)';
      g.fillRect(p.x + dir * 5, p.y - 9, 2, 5);
      // rim (orange, wider than the net)
      g.fillStyle = '#e2540b';
      g.fillRect(p.x - 4, p.y - 1, 8, 2);
      g.fillStyle = '#ff8a3d';
      g.fillRect(p.x - 4, p.y - 1, 8, 1);
      // net (whips on a swish)
      const sw = clamp(1 - this.swishT / 0.9, 0, 1) * (this.swishSide === side ? 1 : 0);
      g.strokeStyle = '#e8edf5'; g.lineWidth = 1;
      g.beginPath();
      g.moveTo(p.x - 4, p.y + 1); g.lineTo(p.x - 2 + sw * 1.5, p.y + 8);
      g.moveTo(p.x + 4, p.y + 1); g.lineTo(p.x + 2 - sw * 1.5, p.y + 8);
      g.moveTo(p.x - 2, p.y + 1); g.lineTo(p.x - 1, p.y + 8 + sw * 2);
      g.moveTo(p.x + 2, p.y + 1); g.lineTo(p.x + 1, p.y + 8 + sw * 2);
      g.moveTo(p.x - 3, p.y + 4); g.lineTo(p.x + 3, p.y + 4);
      g.stroke();
    }

    drawActor(g, a) {
      const s = this.sprScale();
      const p = this.map(a.x, a.y);
      // shadow
      g.fillStyle = 'rgba(0,0,0,.32)';
      g.beginPath(); g.ellipse(p.x, p.y + 1, 3 + 4 * s, 1.5 + s, 0, 0, Math.PI * 2); g.fill();
      const tl = this.teamLooks[a.team] || {};
      const pl = this.actorLook(a.id);
      let pose = 'stand', frame = (a.animT * 2 | 0) % 2;
      if (a.celebrateT > 0) { pose = 'celebrate'; frame = (a.animT * 4 | 0) % 2; }
      else if (this.ball.holder === a.id && (this.ball.state === 'held')) { pose = a.moving ? 'run' : 'stand'; frame = (a.animT * 8 | 0) % 4; }
      else if (a.moving) { pose = 'run'; frame = (a.animT * 8 | 0) % 4; }
      else {
        // off-ball defense stance when guarding the ball
        const bh = this.ballHolderPos();
        if (dist(a.x, a.y, bh.x, bh.y) < 6 && a.team !== ((this.P || {}).off | 0)) pose = 'defend';
      }
      // shooter pops to shoot pose around release
      const evs = (this.P && this.P.events) || [];
      const ev = evs[this.evIdx];
      if (ev && ev.type === 'shot' && ev.shooter === a.id && this.evT > this.releaseT - 0.45) {
        pose = (ev.kind === 'dunk' || ev.kind === 'alley') ? 'dunk' : 'shoot'; frame = 0;
      }
      if (ev && ev.type === 'ft' && ev.shooter === a.id && this.evT > this.releaseT - 0.4) { pose = 'shoot'; frame = 0; }
      const held = this.ball.holder === a.id && (this.ball.state === 'held' || this.ball.state === 'gather');
      const featured = held || (ev && (ev.type === 'shot' || ev.type === 'ft') && ev.shooter === a.id);
      // Hoop Land selection ring under the ball-handler / shooter
      if (featured) {
        g.strokeStyle = ((tl.colors || {}).primary) || '#ffcf5a';
        g.lineWidth = 2;
        g.beginPath(); g.ellipse(p.x, p.y + 1, 7 * s, 3 * s, 0, 0, Math.PI * 2); g.stroke();
      }
      const isDunk = pose === 'dunk';
      const dunkLift = isDunk ? Math.round(Math.sin(clamp(this.evT / Math.max(.1, this.evDur), 0, 1) * Math.PI) * 9 * s) : 0;
      PX.draw(g, pl, tl, p.x, p.y - 26 * s - dunkLift, { pose, frame, dir: a.face, scale: s, hasBall: held || isDunk });
      // name tag for the featured player ("J. ALEXANDER" style)
      if (featured && pl.last) {
        const nm = `${(pl.first || '').charAt(0)}. ${pl.last}`.toUpperCase();
        const ty = p.y - 26 * s - 11;
        g.font = '5px monospace'; // measured with the same advance as the pixel font
        const tw = nm.length * 6 + 4;
        g.fillStyle = 'rgba(0,0,0,.65)'; g.fillRect(p.x - tw / 2, ty, tw, 8);
        PX.pixText(g, nm, p.x, ty + 1, 1, '#fff', 'c');
      } else if (this.opts.showNames && (this.ball.holder === a.id || (ev && ev.shooter === a.id))) {
        g.font = '5px monospace'; g.textAlign = 'center';
        const txt = `#${pl.num != null ? pl.num : ''} ${(pl.last || '').slice(0, 8)}`;
        const w = g.measureText(txt).width + 4;
        g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(p.x - w / 2, p.y - 36, w, 7);
        g.fillStyle = '#fff'; g.fillText(txt, p.x, p.y - 30);
      }
    }

    drawBall(g) {
      const b = this.ball;
      const s = this.sprScale();
      const p = this.map(b.x, b.y);
      const zPx = (b.z || 0) * 1.1 + (b.state === 'shot' ? Math.sin(clamp(b.t / Math.max(0.05, b.dur), 0, 1) * Math.PI) * 10 : 0);
      // shadow
      g.fillStyle = 'rgba(0,0,0,.3)';
      g.beginPath(); g.ellipse(p.x, p.y + 1, 3, 1.5, 0, 0, Math.PI * 2); g.fill();
      if (b.state === 'held' || b.state === 'gather') {
        // drawn in the handler's hands by the sprite; add dribble bounce dot when moving
        const h = this.ballHandler();
        if (h && h.moving && b.state === 'held') {
          const bounce = Math.abs(Math.sin(h.animT * 9)) * 6 * s;
          PX.drawLooseBall(g, p.x + 6 * h.face * s, p.y - bounce, s);
        }
        return;
      }
      if (b.state === 'dead') return;
      PX.drawLooseBall(g, p.x, p.y - zPx, s);
    }
  }

  M.Match.RetroView = RetroView;
})();
