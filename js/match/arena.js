/* Pro BBALL Coach — match view: arena (PBC.Match.Arena).
 * Far-side and baseline stands with a dense sprite crowd (pre-rendered atlas, per-fan idle motion
 * and cheering), LED ribbon board, courtside seats, hanging jumbotron, lighting and vignette. */
(function () {
  'use strict';
  const M = window.PBC.Match, U = M.U;

  const SKIN = ['#f1d0b5', '#e5b692', '#d49c73', '#bd8456', '#a06a42', '#855233', '#673d26', '#472a1b'];
  const PANTS = ['#26344f', '#1d1f24', '#3a3f4a', '#6f6352', '#2f4a6b', '#141414', '#4a3b2f'];
  const HAIRC = ['#161210', '#231812', '#3b2618', '#5e4128', '#8a6a42', '#b89a64', '#8d8d8d', '#d8d3cc', '#6b2e1a'];
  const NEUTRAL_SHIRTS = ['#f2f2f2', '#1b1b1d', '#6d7178', '#2a3f6b', '#8a1c22', '#3f6b3a', '#c7c2b5', '#5a4a7a', '#d9822b', '#244b5a', '#e9d8a6', '#7a2e4d'];
  const APX = 26; // atlas pixels per foot
  const CELL_W = 52, CELL_H = 184; // pixels
  const SEAT_Y = 118; // seat point y inside cell (pixels from top)
  const NVAR = 44, NPOSE = 6;
  const FONT = '"Arial Black", "Helvetica Neue", Impact, Arial, sans-serif';

  // ---------------------------------------------------------------- fan sprite painter
  function drawFan(g, ox, oy, look, pose) {
    // ox, oy: seat point in pixels. Units: feet * APX, z up => y = oy - z*APX
    const P = (x, z) => [ox + x * APX, oy - z * APX];
    const standing = pose >= 3;
    const lift = standing ? 1.55 : 0;
    const lean = pose === 1 ? 0.22 : 0;
    const skin = look.skin, shirt = look.shirt, pants = look.pants;
    const dk = U.shade(shirt, -0.35), lt = U.shade(shirt, 0.18);
    g.lineCap = 'round'; g.lineJoin = 'round';
    // legs
    g.fillStyle = pants;
    g.strokeStyle = pants;
    if (standing) {
      g.lineWidth = 0.34 * APX;
      for (const s of [-1, 1]) {
        const a = P(0.2 * s, 1.55), b = P(0.24 * s, 0.25), c = P(0.26 * s, -1.3);
        g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(c[0], c[1]); g.stroke();
      }
    } else {
      // shins: knees forward of the seat, feet slightly splayed and forward
      g.lineWidth = 0.3 * APX;
      for (const s of [-1, 1]) {
        const b = P(0.33 * s, -0.42), c = P(0.42 * s, -1.32);
        g.beginPath(); g.moveTo(b[0], b[1]); g.lineTo(c[0], c[1]); g.stroke();
      }
      // lap: thighs pointing toward the camera, seen foreshortened from above
      const lg = g.createLinearGradient(0, oy - 0.25 * APX, 0, oy + 0.5 * APX);
      lg.addColorStop(0, U.shade(pants, 0.22)); lg.addColorStop(1, U.shade(pants, -0.25));
      g.fillStyle = lg;
      g.beginPath();
      const a0 = P(-0.42, 0.22), a1 = P(0.42, 0.22), k1 = P(0.5, -0.45), k0 = P(-0.5, -0.45);
      g.moveTo(a0[0], a0[1]); g.lineTo(a1[0], a1[1]);
      g.quadraticCurveTo(k1[0] + 0.08 * APX, (a1[1] + k1[1]) / 2, k1[0], k1[1]);
      g.quadraticCurveTo(ox, k1[1] + 0.12 * APX, k0[0], k0[1]);
      g.quadraticCurveTo(k0[0] - 0.08 * APX, (a0[1] + k0[1]) / 2, a0[0], a0[1]);
      g.fill();
      g.fillStyle = pants;
    }
    // shoes
    g.fillStyle = look.shoe;
    for (const s of [-1, 1]) {
      const f = P((standing ? 0.3 : 0.42) * s, -1.4);
      g.beginPath(); g.ellipse(f[0], f[1], 0.19 * APX, 0.1 * APX, 0, 0, U.TAU); g.fill();
    }
    // torso
    const hipZ = 0.1 + lift, shZ = 1.95 + lift - lean * 0.9;
    const hw = look.wide ? 0.44 : 0.38, sw = look.wide ? 0.52 : 0.47;
    const tb0 = P(-hw + lean * 0.1, hipZ), tb1 = P(hw + lean * 0.1, hipZ);
    const ts1 = P(sw, shZ), ts0 = P(-sw, shZ);
    const grd = g.createLinearGradient(tb0[0], 0, tb1[0], 0);
    grd.addColorStop(0, lt); grd.addColorStop(0.55, shirt); grd.addColorStop(1, dk);
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(tb0[0], tb0[1]);
    g.lineTo(tb1[0], tb1[1]);
    g.quadraticCurveTo(ts1[0] + 0.06 * APX, (tb1[1] + ts1[1]) / 2, ts1[0], ts1[1]);
    g.quadraticCurveTo(ox, ts1[1] - 0.16 * APX, ts0[0], ts0[1]);
    g.quadraticCurveTo(ts0[0] - 0.06 * APX, (tb0[1] + ts0[1]) / 2, tb0[0], tb0[1]);
    g.fill();
    if (look.stripe) { // jersey-style fan shirt with a number stripe
      g.fillStyle = U.rgba(look.stripe, 0.9);
      const c = P(0, (hipZ + shZ) / 2 + 0.1);
      g.fillRect(c[0] - 0.18 * APX, c[1] - 0.22 * APX, 0.36 * APX, 0.4 * APX);
    }
    // neck + head
    const headZ = shZ + 0.52, headX = lean * 0.35;
    g.fillStyle = U.shade(skin, -0.12);
    const nk = P(headX * 0.5, shZ + 0.1);
    g.fillRect(nk[0] - 0.11 * APX, nk[1] - 0.2 * APX, 0.22 * APX, 0.26 * APX);
    const hc = P(headX, headZ);
    const hr = 0.3 * APX;
    // hair behind (long)
    if (look.hair === 'long' || look.hair === 'pony') {
      g.fillStyle = look.hairC;
      g.beginPath(); g.ellipse(hc[0], hc[1] + 0.25 * APX, hr * 1.12, hr * 1.35, 0, 0, U.TAU); g.fill();
    }
    if (look.hair === 'afro') {
      g.fillStyle = look.hairC;
      g.beginPath(); g.arc(hc[0], hc[1] - 0.08 * APX, hr * 1.45, 0, U.TAU); g.fill();
    }
    const hg = g.createRadialGradient(hc[0] - hr * 0.35, hc[1] - hr * 0.4, hr * 0.2, hc[0], hc[1], hr * 1.2);
    hg.addColorStop(0, U.shade(skin, 0.12)); hg.addColorStop(1, U.shade(skin, -0.2));
    g.fillStyle = hg;
    g.beginPath(); g.ellipse(hc[0], hc[1], hr * 0.92, hr * 1.1, 0, 0, U.TAU); g.fill();
    // hair on top
    g.fillStyle = look.hairC;
    if (look.hair === 'cap') {
      g.fillStyle = look.cap;
      g.beginPath(); g.ellipse(hc[0], hc[1] - hr * 0.45, hr * 0.98, hr * 0.62, 0, Math.PI, 0); g.fill();
      g.fillRect(hc[0] - hr * 1.05, hc[1] - hr * 0.5, hr * 2.1, hr * 0.22);
    } else if (look.hair !== 'bald' && look.hair !== 'afro') {
      g.beginPath(); g.ellipse(hc[0], hc[1] - hr * 0.42, hr * 0.97, hr * 0.7, 0, Math.PI * 0.95, Math.PI * 2.05); g.fill();
      if (look.hair === 'pony') { g.beginPath(); g.ellipse(hc[0] + hr * 0.9, hc[1] + hr * 0.2, hr * 0.28, hr * 0.6, 0.3, 0, U.TAU); g.fill(); }
    }
    // face hint
    g.fillStyle = 'rgba(20,12,8,0.75)';
    const ey = hc[1] - hr * 0.02;
    g.fillRect(hc[0] - hr * 0.42, ey, hr * 0.2, hr * 0.14);
    g.fillRect(hc[0] + hr * 0.22, ey, hr * 0.2, hr * 0.14);
    if (pose >= 3) { g.fillStyle = 'rgba(60,10,10,0.8)'; g.beginPath(); g.ellipse(hc[0], hc[1] + hr * 0.5, hr * 0.2, hr * 0.17, 0, 0, U.TAU); g.fill(); }
    // arms
    const shL = P(-sw + 0.06, shZ - 0.1), shR = P(sw - 0.06, shZ - 0.1);
    let hands;
    if (pose === 0) hands = [[-0.3, 0.02, -0.56, 0.95], [0.3, 0.02, 0.56, 0.95]];
    else if (pose === 1) hands = [[-0.08, shZ + 0.2, -0.46, shZ - 0.55], [0.08, shZ + 0.2, 0.46, shZ - 0.55]];
    else if (pose === 2 || pose === 3) hands = [[-0.03, shZ - 0.35, -0.56, shZ - 0.6], [0.03, shZ - 0.3, 0.56, shZ - 0.6]];
    else if (pose === 4) hands = [[-0.78, shZ + 1.45, -0.72, shZ + 0.62], [0.78, shZ + 1.45, 0.72, shZ + 0.62]];
    else hands = [[-0.45, shZ - 1.0, -0.6, shZ - 0.55], [0.42, shZ + 1.55, 0.62, shZ + 0.72]];
    const shs = [shL, shR];
    for (let i = 0; i < 2; i++) {
      const h = hands[i];
      const el = P(h[2], h[3]), hd = P(h[0], h[1]), sh = shs[i];
      g.lineWidth = 0.24 * APX;
      g.strokeStyle = dk;
      g.beginPath(); g.moveTo(sh[0], sh[1]); g.lineTo(el[0], el[1]); g.stroke();
      g.strokeStyle = U.shade(skin, -0.08);
      g.lineWidth = 0.19 * APX;
      g.beginPath(); g.moveTo(el[0], el[1]); g.lineTo(hd[0], hd[1]); g.stroke();
      g.fillStyle = skin;
      g.beginPath(); g.arc(hd[0], hd[1], 0.12 * APX, 0, U.TAU); g.fill();
    }
    if (look.towel && pose >= 4) { // rally towel twirled overhead
      const hd = P(hands[1][0], hands[1][1]);
      g.fillStyle = look.towel;
      g.save(); g.translate(hd[0], hd[1]); g.rotate(pose === 4 ? -0.5 : 0.35);
      g.fillRect(-0.05 * APX, -1.05 * APX, 0.62 * APX, 0.95 * APX);
      g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(-0.05 * APX, -0.2 * APX, 0.62 * APX, 0.1 * APX);
      g.restore();
    } else if (look.finger && pose >= 4) { // foam finger
      const hd = P(hands[1][0], hands[1][1]);
      g.fillStyle = look.finger;
      g.fillRect(hd[0] - 0.14 * APX, hd[1] - 0.95 * APX, 0.28 * APX, 0.95 * APX);
    }
  }

  function buildAtlas(teams, atm) {
    atm = atm || {};
    const cv = U.makeCanvas(CELL_W * NVAR, CELL_H * NPOSE);
    const g = cv.getContext('2d');
    const rnd = U.rng(1234567);
    const looks = [];
    const hc = teams[0], ac = teams[1];
    for (let v = 0; v < NVAR; v++) {
      const r = rnd();
      let shirt, fanTeam = -1, stripe = null;
      if (r < 0.46) { // home fans
        fanTeam = 0;
        const q = rnd();
        shirt = q < 0.45 ? hc.primary : q < 0.72 ? hc.secondary : q < 0.86 ? '#f4f4f4' : U.shade(hc.primary, -0.3);
        if (rnd() < 0.3) stripe = q < 0.45 ? hc.secondary : hc.primary;
      } else if (r < 0.58) {
        fanTeam = 1;
        const q = rnd();
        shirt = q < 0.55 ? ac.primary : q < 0.8 ? ac.secondary : U.shade(ac.primary, -0.3);
      } else shirt = NEUTRAL_SHIRTS[(rnd() * NEUTRAL_SHIRTS.length) | 0];
      const hr = rnd();
      const hair = hr < 0.12 ? 'bald' : hr < 0.24 ? 'cap' : hr < 0.4 ? 'long' : hr < 0.47 ? 'pony' : hr < 0.55 ? 'afro' : 'short';
      const look = {
        fanTeam, shirt, stripe,
        skin: SKIN[(rnd() * SKIN.length) | 0],
        pants: PANTS[(rnd() * PANTS.length) | 0],
        hair, hairC: HAIRC[(rnd() * HAIRC.length) | 0],
        cap: fanTeam === 1 ? ac.primary : rnd() < 0.7 ? hc.primary : '#1a1a1a',
        shoe: rnd() < 0.5 ? '#f0f0f0' : '#1a1a1a',
        wide: rnd() < 0.25,
        finger: rnd() < 0.08 ? (fanTeam === 1 ? ac.secondary : hc.secondary) : null,
        towel: null,
      };
      // playoff nights: the home crowd wears the giveaway shirt and waves rally towels
      if (atm.playoff && fanTeam === 0) {
        if (rnd() < 0.7) { look.shirt = atm.shirt || hc.primary; look.stripe = null; }
        if (rnd() < 0.85) look.towel = rnd() < 0.8 ? (atm.towel || '#f7f7f2') : (hc.secondary || '#ffffff');
      } else if (atm.playoff && fanTeam < 0 && rnd() < 0.5) { look.shirt = atm.shirt || hc.primary; look.towel = rnd() < 0.6 ? (atm.towel || '#f7f7f2') : null; look.fanTeam = 0; }
      looks.push(look);
      for (let p = 0; p < NPOSE; p++) {
        g.save();
        g.beginPath(); g.rect(v * CELL_W, p * CELL_H, CELL_W, CELL_H); g.clip();
        drawFan(g, v * CELL_W + CELL_W / 2, p * CELL_H + SEAT_Y, look, p);
        g.restore();
      }
    }
    // dim copy for the stands (they sit outside the court lights)
    const dim = U.makeCanvas(cv.width, cv.height);
    const dg = dim.getContext('2d');
    dg.drawImage(cv, 0, 0);
    dg.globalCompositeOperation = 'source-atop';
    dg.fillStyle = 'rgba(8,8,16,0.42)';
    dg.fillRect(0, 0, dim.width, dim.height);
    return { bright: cv, dim, looks };
  }

  // ---------------------------------------------------------------- Arena
  class Arena {
    constructor(gctx, opts) {
      opts = opts || {};
      this.g = gctx;
      this.quality = opts.quality || 'high';
      const hc = (gctx.home && gctx.home.colors) || { primary: '#1d4e89', secondary: '#f2c14e', trim: '#fff' };
      const ac = (gctx.away && gctx.away.colors) || { primary: '#8a1c22', secondary: '#111111', trim: '#fff' };
      this.hc = hc; this.ac = ac;
      this.home = gctx.home || {}; this.away = gctx.away || {};
      this.atlas = buildAtlas([hc, ac]);
      this.atm = {};
      this.baseExcite = 0.08;
      this.excite = [0, 0];
      this.exciteT = [0, 0];
      this.time = 0;
      this.led = { mode: 0, t: 0, msg: null, msgT: 0 };
      this.score = [0, 0];
      this.period = 1;
      this.clockText = '12:00';
      this.shotClock = 24;
      this.buildStands();
      this._pt = { x: 0, y: 0, s: 0, d: 0 };
      this._sortKey = '';
    }

    buildStands() {
      const rnd = U.rng(98765);
      const fans = [];
      const low = this.quality === 'low';
      // far stands: rows along x
      this.farRows = [];
      const R = 24;
      for (let r = 0; r < R; r++) {
        const y = 58.6 + 2.75 * r, zf = 1.25 + 1.55 * r;
        const row = { y, zf, fans: [] };
        this.farRows.push(row);
        for (let x = -64; x <= 158; x += 1.78) {
          const aisle = ((x + 200) % 26.6) < 3.1;
          if (aisle) continue;
          if (low && rnd() < 0.5) continue;
          if (rnd() < 0.025) continue; // the odd empty seat
          row.fans.push(this.makeFan(rnd, x + (rnd() - 0.5) * 0.2, y + 1.0, zf + 1.45, false));
        }
      }
      // baseline stands (behind both baskets), rows along y
      this.endRows = [];
      for (const side of [-1, 1]) {
        for (let r = 0; r < 16; r++) {
          const x = side < 0 ? -20 - 2.75 * r : 114 + 2.75 * r;
          const zf = 1.25 + 1.55 * r;
          const row = { side, x, zf, r, fans: [] };
          this.endRows.push(row);
          for (let y = -34; y <= 56; y += 1.78) {
            if (((y + 200) % 24) < 3.1) continue;
            if (low && rnd() < 0.5) continue;
            if (rnd() < 0.03) continue;
            row.fans.push(this.makeFan(rnd, x + side * 1.0, y + (rnd() - 0.5) * 0.2, zf + 1.45, false));
          }
          // nearest rows first inside a row list: draw far (large y) first
          row.fans.sort((a, b) => b.y - a.y);
        }
      }
      // draw order for the ends: outer rows first
      this.endRows.sort((a, b) => b.r - a.r);
      // courtside seats on the far side
      this.courtside = [];
      for (let x = 1.5; x <= 92.5; x += 2.35) {
        if (Math.abs(x - 47) < 1.5) continue;
        const f = this.makeFan(rnd, x, 54.3, 1.45, true);
        this.courtside.push(f);
      }
    }
    makeFan(rnd, x, y, z, bright) {
      const v = (rnd() * NVAR) | 0;
      const look = this.atlas.looks[v];
      return {
        x, y, z, v, bright,
        team: look.fanTeam,
        ph: rnd() * 100, thr: 0.35 + rnd() * 0.55, delay: rnd() * 0.45, fidget: rnd(),
        alt: rnd() < 0.2, d: 0,
      };
    }

    /** playoff atmosphere: towel-waving home crowd in the giveaway shirt, a louder building, playoff boards */
    setAtmosphere(atm) {
      this.atm = Object.assign({}, atm || {});
      if (this.atm.playoff) {
        const lvl = U.clamp(+this.atm.level || 0.6, 0, 1.25);
        this.baseExcite = 0.18 + lvl * 0.2;
        this.atm.shirt = this.atm.shirt || (U.lum(this.hc.primary) < 0.12 ? '#f4f4f4' : this.hc.primary);
        this.atm.towel = this.atm.towel || (U.lum(this.atm.shirt) > 0.8 ? this.hc.primary : '#f7f7f2');
        this.atlas = buildAtlas([this.hc, this.ac], this.atm);
        // re-roll which fans belong to which variant so the look spreads through the building
        for (const row of this.farRows) for (const f of row.fans) f.team = this.atlas.looks[f.v].fanTeam;
        for (const row of this.endRows) for (const f of row.fans) f.team = this.atlas.looks[f.v].fanTeam;
        for (const f of this.courtside) f.team = this.atlas.looks[f.v].fanTeam;
        this.excite = [this.baseExcite, this.baseExcite * 0.6];
      } else this.baseExcite = 0.08;
    }
    cheer(team, level, dur) {
      if (team !== 0 && team !== 1) return;
      this.excite[team] = Math.max(this.excite[team], level);
      this.exciteT[team] = Math.max(this.exciteT[team], dur || 2.5);
      if (level > 0.7) this.led.msg = team === 0 ? 'home' : 'away', this.led.msgT = 3.5;
    }
    setState(s) {
      if (s.score) this.score = s.score;
      if (s.period != null) this.period = s.period;
      if (s.clockText != null) this.clockText = s.clockText;
      if (s.shotClock != null) this.shotClock = s.shotClock;
      if (s.homeDefense != null) this.homeDefense = s.homeDefense;
    }
    update(dt) {
      this.time += dt;
      for (let t = 0; t < 2; t++) {
        if (this.exciteT[t] > 0) this.exciteT[t] -= dt;
        else this.excite[t] = U.damp(this.excite[t], t === 0 ? this.baseExcite : Math.min(this.baseExcite, 0.2), 0.9, dt);
      }
      this.led.t += dt;
      if (this.led.msgT > 0) this.led.msgT -= dt; else this.led.msg = null;
    }

    // ---------------------------------------------------------------- draw
    drawBackground(g, cam) {
      const grd = g.createLinearGradient(0, 0, 0, cam.H);
      grd.addColorStop(0, '#06070b');
      grd.addColorStop(0.45, '#101018');
      grd.addColorStop(1, '#141218');
      g.fillStyle = grd;
      g.fillRect(0, 0, cam.W, cam.H);
    }

    fanPose(f) {
      const t = this.time;
      let e = f.team >= 0 ? this.excite[f.team] : Math.max(this.excite[0], this.excite[1]) * 0.45;
      const cycle = (t * 0.9 + f.ph) % 9;
      // playoff nights: the towel crowd is on its feet twirling towels
      if (this.atm && this.atm.playoff && f.team === 0 && this.atlas.looks[f.v].towel && e >= f.thr * 0.75) {
        return ((t * (1.4 + f.fidget) + f.ph) | 0) % 2 ? 4 : 5;
      }
      if (e < 0.25) {
        if (f.alt && cycle < 3) return 1;
        return e > 0.15 && f.fidget < 0.4 ? 2 : 0;
      }
      if (e < f.thr) return f.fidget < 0.55 ? 2 : (cycle < 4.5 ? 0 : 2);
      if (e > 0.72) {
        const k = ((t * 1.6 + f.ph) | 0) % 3;
        return k === 0 ? 4 : k === 1 ? (f.fidget < 0.5 ? 5 : 3) : 4;
      }
      return 3;
    }

    drawFanSprite(g, cam, f, atlasCanvas) {
      const pt = cam.project(f.x, f.y, f.z, this._pt);
      const k = pt.s / APX;
      const w = CELL_W * k;
      if (pt.x + w < 0 || pt.x - w > cam.W) return;
      const pose = this.fanPose(f);
      let bob = Math.sin(this.time * 1.3 + f.ph) * 0.35;
      if (pose >= 4) bob += Math.abs(Math.sin(this.time * 7 + f.ph)) * 5;
      else if (pose === 3 || pose === 2) bob += Math.abs(Math.sin(this.time * 9 + f.ph)) * 1.2;
      const h = CELL_H * k;
      g.drawImage(atlasCanvas, f.v * CELL_W, pose * CELL_H, CELL_W, CELL_H,
        pt.x - w * 0.5, pt.y - SEAT_Y * k - bob * k, w, h);
    }

    /** stands: structures + crowd, row by row from the back (drawn after the floor so their base hides the far floor edge) */
    drawStands(g, cam) {
      const W = cam.W;
      const dim = this.atlas.dim;
      const x0 = -64, x1 = 158;
      const sxa = Math.max(0, cam.sx(x0, 60, 0)), sxb = Math.min(W, cam.sx(x1, 60, 0));
      const aisleXs = [];
      for (let x = -200; x < 300; x += 26.6) if (x > x0 && x < x1) aisleXs.push(x + 0.2);
      for (let r = this.farRows.length - 1; r >= 0; r--) {
        const row = this.farRows[r];
        const next = this.farRows[r + 1];
        const yBack = next ? next.y : row.y + 2.75;
        const prevZ = r > 0 ? this.farRows[r - 1].zf : 0;
        const Ytop = cam.sy(yBack, row.zf), Ybot = cam.sy(row.y, row.zf);
        if (Ybot < -60) continue;
        const Yr1 = cam.sy(row.y, prevZ);
        const lightK = U.clamp(1 - r * 0.045, 0.3, 1);
        // tread + riser
        g.fillStyle = U.rgbToHex(34 * lightK, 33 * lightK, 40 * lightK);
        g.fillRect(sxa, Ytop, sxb - sxa, Ybot - Ytop + 0.5);
        g.fillStyle = U.rgbToHex(22 * lightK, 22 * lightK, 28 * lightK);
        g.fillRect(sxa, Ybot, sxb - sxa, Yr1 - Ybot + 0.5);
        // aisle steps
        g.fillStyle = U.rgbToHex(64 * lightK, 64 * lightK, 74 * lightK);
        for (const ax of aisleXs) {
          const Xa = cam.sx(ax, row.y, row.zf), Xb = cam.sx(ax + 3.1, row.y, row.zf);
          if (Xb < 0 || Xa > W) continue;
          g.fillRect(Xa, Ytop, Xb - Xa, Yr1 - Ytop);
          g.fillStyle = 'rgba(255,214,120,0.55)';
          g.fillRect(Xa, Ybot - 1, Xb - Xa, 1.2);
          g.fillStyle = U.rgbToHex(64 * lightK, 64 * lightK, 74 * lightK);
        }
        // seat backs of this row (behind its fans, in front of the row behind)
        const Ys0 = cam.sy(row.y + 1.9, row.zf + 2.55), Ys1 = cam.sy(row.y + 1.9, row.zf + 0.9);
        g.fillStyle = U.rgbToHex(62 * lightK, 22 * lightK, 28 * lightK);
        g.fillRect(sxa, Ys0, sxb - sxa, Ys1 - Ys0);
        for (let i = 0; i < row.fans.length; i++) this.drawFanSprite(g, cam, row.fans[i], dim);
      }
      // end stands structures (planes at constant x -> trapezoids), outer rows first
      for (const row of this.endRows) {
        const s = row.side;
        const xa = row.x, xb = row.x + s * 2.75;
        const Xn = cam.sx(xa, -34, row.zf), Xf = cam.sx(xa, 56, row.zf);
        if ((s < 0 && Math.max(Xn, Xf) < 0) || (s > 0 && Math.min(Xn, Xf) > W)) continue;
        const lightK = U.clamp(0.9 - row.r * 0.05, 0.3, 1);
        g.fillStyle = U.rgbToHex(30 * lightK, 29 * lightK, 36 * lightK);
        this._quad(g, cam, xa, -34, row.zf, xb, -34, row.zf, xb, 57, row.zf, xa, 57, row.zf);
        g.fillStyle = U.rgbToHex(20 * lightK, 20 * lightK, 26 * lightK);
        this._quad(g, cam, xa, -34, row.zf - 1.55, xa, -34, row.zf, xa, 57, row.zf, xa, 57, row.zf - 1.55);
        g.fillStyle = U.rgbToHex(62 * lightK, 22 * lightK, 28 * lightK);
        const xs = xa + s * 1.9;
        this._quad(g, cam, xs, -34, row.zf + 0.9, xs, 57, row.zf + 0.9, xs, 57, row.zf + 2.55, xs, -34, row.zf + 2.55);
        for (let i = 0; i < row.fans.length; i++) this.drawFanSprite(g, cam, row.fans[i], dim);
      }
      // depth haze over the far stands (back rows darker)
      const Yled = cam.sy(57.2, 3.2);
      if (Yled > 0) {
        const grd = g.createLinearGradient(0, 0, 0, Yled);
        grd.addColorStop(0, 'rgba(4,4,10,0.55)');
        grd.addColorStop(1, 'rgba(4,4,10,0.0)');
        g.fillStyle = grd;
        g.fillRect(0, 0, W, Yled);
      }
      this.drawEndBoards(g, cam);
      this.drawLED(g, cam);
    }

    _quad(g, cam, ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz) {
      const p = this._pt;
      g.beginPath();
      cam.project(ax, ay, az, p); g.moveTo(p.x, p.y);
      cam.project(bx, by, bz, p); g.lineTo(p.x, p.y);
      cam.project(cx, cy, cz, p); g.lineTo(p.x, p.y);
      cam.project(dx, dy, dz, p); g.lineTo(p.x, p.y);
      g.closePath(); g.fill();
    }

    drawEndBoards(g, cam) {
      // low padded wall/LED behind each baseline (plane x = const)
      for (const side of [-1, 1]) {
        const x = side < 0 ? -15.5 : 109.5;
        const Xnear = cam.sx(x, -14, 0);
        if ((side < 0 && Xnear < -50 && cam.sx(x, 57, 0) < -50) || (side > 0 && Xnear > cam.W + 50 && cam.sx(x, 57, 0) > cam.W + 50)) continue;
        g.fillStyle = '#0d0e14';
        this._quad(g, cam, x, -14, 0, x, 57, 0, x, 57, 3.2, x, -14, 3.2);
        // LED face strips
        const col = side < 0 ? this.hc.primary : this.hc.primary;
        const n = 18;
        for (let i = 0; i < n; i++) {
          const ya = -12 + i * 3.8, yb = ya + 3.5;
          const ph = (this.time * 0.6 + i * 0.13) % 1;
          g.fillStyle = U.rgba(i % 2 ? col : (this.hc.secondary || '#fff'), 0.35 + 0.35 * Math.abs(Math.sin((ph + i * 0.2) * Math.PI)));
          this._quad(g, cam, x, ya, 0.5, x, yb, 0.5, x, yb, 2.7, x, ya, 2.7);
        }
      }
    }

    drawLED(g, cam) {
      const y = 57.2, z0 = 0.15, z1 = 3.1;
      const Yt = cam.sy(y, z1), Yb = cam.sy(y, z0);
      const xa = -18, xb = 112;
      let Xa = cam.sx(xa, y, 0), Xb = cam.sx(xb, y, 0);
      const k = cam.scaleAt(y, 1.5);
      if (Xb < 0 || Xa > cam.W || Yb < 0) return;
      // housing
      g.fillStyle = '#07080c';
      g.fillRect(Math.max(0, Xa), cam.sy(y, 3.35), Math.min(cam.W, Xb) - Math.max(0, Xa), cam.sy(y, 0) - cam.sy(y, 3.35));
      g.save();
      g.beginPath();
      g.rect(Math.max(0, Xa), Yt, Math.min(cam.W, Xb) - Math.max(0, Xa), Yb - Yt);
      g.clip();
      const t = this.led.t;
      const hc = this.hc, ac = this.ac;
      const H = Yb - Yt;
      const home = this.home, away = this.away;
      const mode = this.led.msg ? (this.led.msg === 'home' ? 9 : 8) : Math.floor(t / 9) % 4;
      const seg = 22; // feet per panel
      const X = (x) => cam.ox + (x - cam.x) * k;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      const fs = Math.max(6, H * 0.62);
      g.font = '900 ' + Math.round(fs) + 'px ' + FONT;
      if (mode === 9 || mode === 8) {
        const tc = mode === 9 ? hc : ac;
        for (let x = xa; x < xb; x += seg) {
          const flash = Math.sin(t * 10 + x * 0.3) > 0;
          g.fillStyle = flash ? tc.primary : tc.secondary;
          g.fillRect(X(x), Yt, seg * k + 1, H);
          g.fillStyle = flash ? (tc.secondary || '#fff') : tc.primary;
          const word = mode === 9 ? (String(home.abbr || 'HOME') + '!') : String(away.abbr || 'AWAY');
          g.fillText(word, X(x + seg / 2), Yt + H / 2);
        }
      } else if (mode === 0) {
        // scrolling home team name
        const off = (t * 6) % seg;
        for (let x = xa - seg; x < xb + seg; x += seg) {
          const xx = x - off;
          g.fillStyle = hc.primary;
          g.fillRect(X(xx), Yt, seg * k + 1, H);
          g.fillStyle = U.contrast(hc.primary, '#ffffff', '#111111');
          g.fillText(String((home.city ? home.city + ' ' : '') + (home.name || '')).toUpperCase(), X(xx + seg / 2), Yt + H / 2);
        }
      } else if (mode === 1) {
        // DEFENSE / chevrons
        for (let x = xa; x < xb; x += seg) {
          g.fillStyle = '#050508';
          g.fillRect(X(x), Yt, seg * k + 1, H);
          const pulse = 0.5 + 0.5 * Math.sin(t * 5 + x * 0.2);
          g.fillStyle = U.mix(hc.primary, '#ffffff', pulse * 0.25);
          g.fillText(this.homeDefense ? 'DEFENSE' : 'LET\'S GO ' + String(home.abbr || ''), X(x + seg / 2), Yt + H / 2);
          // chevrons
          g.fillStyle = U.rgba(hc.secondary || '#ffffff', 0.7);
          for (let c = 0; c < 3; c++) {
            const cx = X(x + 1.4 + c * 1.1 + ((t * 3) % 1.1));
            g.beginPath(); g.moveTo(cx, Yt + H * 0.2); g.lineTo(cx + H * 0.3, Yt + H * 0.5); g.lineTo(cx, Yt + H * 0.8); g.lineTo(cx + H * 0.12, Yt + H * 0.5); g.fill();
          }
        }
      } else if (mode === 2) {
        // score panels
        for (let x = xa; x < xb; x += seg) {
          g.fillStyle = '#0a0c14';
          g.fillRect(X(x), Yt, seg * k + 1, H);
          g.fillStyle = hc.primary; g.fillRect(X(x + 0.6), Yt + H * 0.12, 6 * k, H * 0.76);
          g.fillStyle = ac.primary; g.fillRect(X(x + 15.4), Yt + H * 0.12, 6 * k, H * 0.76);
          g.fillStyle = '#ffffff';
          g.fillText(String(home.abbr || 'HOME'), X(x + 3.6), Yt + H / 2);
          g.fillText(String(away.abbr || 'AWAY'), X(x + 18.4), Yt + H / 2);
          g.fillStyle = '#ffd24a';
          g.fillText(this.score[0] + ' - ' + this.score[1], X(x + 11), Yt + H / 2);
        }
      } else {
        // generic arena boards (playoff nights get their own)
        const a = this.atm || {};
        const words = a.playoff
          ? ['PLAYOFFS', String(a.label || 'PLAYOFF BASKETBALL'), 'LET\'S GO ' + String(home.abbr || ''), 'MAKE SOME NOISE', a.finals ? 'THE FINALS' : 'DEFENSE', 'EVERY POSSESSION']
          : ['PRO BBALL COACH', 'MAKE SOME NOISE', 'COURTSIDE CLUB', 'HOOPS ALL NIGHT', 'FAN ZONE', 'GAME NIGHT'];
        let i = 0;
        for (let x = xa; x < xb; x += seg, i++) {
          const col = i % 2 ? hc.primary : '#101422';
          g.fillStyle = col;
          g.fillRect(X(x), Yt, seg * k + 1, H);
          g.fillStyle = U.contrast(col, '#ffffff', '#111111');
          g.fillText(words[(i + Math.floor(t / 9)) % words.length], X(x + seg / 2), Yt + H / 2);
        }
      }
      // LED pixel grid + glow
      g.globalAlpha = 0.18;
      g.fillStyle = '#000';
      const pitch = Math.max(2, k * 0.12);
      for (let yy = Yt; yy < Yb; yy += pitch) g.fillRect(Math.max(0, Xa), yy, Math.min(cam.W, Xb) - Math.max(0, Xa), pitch * 0.35);
      g.globalAlpha = 1;
      g.restore();
    }

    /** reflection of the LED board on the glossy apron */
    drawLEDReflection(g, cam) {
      const y = 57.2;
      const Yt = cam.sy(y, 0), Yb = cam.sy(y, -2.2);
      const Xa = Math.max(0, cam.sx(-18, y, 0)), Xb = Math.min(cam.W, cam.sx(112, y, 0));
      if (Xb <= Xa) return;
      const grd = g.createLinearGradient(0, Yt, 0, Yb);
      grd.addColorStop(0, U.rgba(this.hc.primary, 0.28));
      grd.addColorStop(1, U.rgba(this.hc.primary, 0));
      g.fillStyle = grd;
      g.fillRect(Xa, Yt, Xb - Xa, Yb - Yt);
    }

    drawCourtside(g, cam) {
      const P = this._pt;
      const bright = this.atlas.bright;
      const chair = U.shade(this.hc.primary, -0.35);
      for (const f of this.courtside) {
        cam.project(f.x, f.y + 0.55, 1.45, P);
        if (P.x < -40 || P.x > cam.W + 40) continue;
        const k = P.s;
        // chair back
        g.fillStyle = chair;
        g.fillRect(P.x - 0.95 * k, P.y - 1.9 * k, 1.9 * k, 1.9 * k);
        g.fillStyle = '#111217';
        g.fillRect(P.x - 1.0 * k, P.y - 0.05 * k, 2.0 * k, 0.28 * k);
        g.fillRect(P.x - 0.85 * k, P.y + 0.2 * k, 0.12 * k, 1.2 * k);
        g.fillRect(P.x + 0.73 * k, P.y + 0.2 * k, 0.12 * k, 1.2 * k);
        this.drawFanSprite(g, cam, f, bright);
      }
    }

    /** stylised centre-hung scoreboard hanging into the top of the frame */
    drawJumbotron(g, cam) {
      const kd = cam.f / 150;
      const cx = cam.ox + (47 - cam.x) * kd;
      const w = 23 * kd, h = 10.5 * kd;
      if (cx + w < 0 || cx - w > cam.W) { this.board = null; return; }
      const top = -0.34 * h, bot = top + h;
      const x0 = cx - w / 2;
      // where it hangs, as fractions of the frame (the TV graphics keep clear of it)
      this.board = { x0: x0 / cam.W, x1: (x0 + w) / cam.W, y1: (bot + h * 0.07) / cam.H };
      // cables
      g.strokeStyle = 'rgba(40,42,50,0.9)';
      g.lineWidth = Math.max(1, kd * 0.12);
      g.beginPath(); g.moveTo(x0 + w * 0.2, 0); g.lineTo(x0 + w * 0.2, top); g.moveTo(x0 + w * 0.8, 0); g.lineTo(x0 + w * 0.8, top); g.stroke();
      // underside (seen from below-ish)
      g.fillStyle = '#0b0c10';
      g.beginPath();
      g.moveTo(x0, bot); g.lineTo(x0 + w, bot); g.lineTo(x0 + w * 0.94, bot + h * 0.07); g.lineTo(x0 + w * 0.06, bot + h * 0.07); g.closePath(); g.fill();
      // ring LED
      const ringY = bot - h * 0.1;
      const grdR = g.createLinearGradient(x0, 0, x0 + w, 0);
      const ph = (this.time * 0.25) % 1;
      grdR.addColorStop(0, this.hc.primary);
      grdR.addColorStop(U.sat(ph), this.hc.secondary || '#fff');
      grdR.addColorStop(1, this.hc.primary);
      // body
      g.fillStyle = '#15161c';
      g.fillRect(x0, top, w, h);
      g.fillStyle = '#23252e';
      g.fillRect(x0, top, w, h * 0.04);
      // screen
      const sx = x0 + w * 0.04, sy = top + h * 0.06, sw = w * 0.92, sh = h * 0.74;
      const sg = g.createLinearGradient(0, sy, 0, sy + sh);
      sg.addColorStop(0, '#0c1224'); sg.addColorStop(1, '#070a14');
      g.fillStyle = sg;
      g.fillRect(sx, sy, sw, sh);
      // teams + scores
      const home = this.home, away = this.away;
      const pw = sw * 0.36;
      g.fillStyle = this.hc.primary; g.fillRect(sx + sw * 0.02, sy + sh * 0.12, pw, sh * 0.3);
      g.fillStyle = this.ac.primary; g.fillRect(sx + sw * 0.62, sy + sh * 0.12, pw, sh * 0.3);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = '900 ' + Math.round(sh * 0.2) + 'px ' + FONT;
      g.fillStyle = U.contrast(this.hc.primary);
      g.fillText(String(home.abbr || 'HOME'), sx + sw * 0.02 + pw / 2, sy + sh * 0.275);
      g.fillStyle = U.contrast(this.ac.primary);
      g.fillText(String(away.abbr || 'AWAY'), sx + sw * 0.62 + pw / 2, sy + sh * 0.275);
      g.font = '900 ' + Math.round(sh * 0.36) + 'px ' + FONT;
      g.fillStyle = '#ffe070';
      g.fillText(String(this.score[0]), sx + sw * 0.02 + pw / 2, sy + sh * 0.66);
      g.fillText(String(this.score[1]), sx + sw * 0.62 + pw / 2, sy + sh * 0.66);
      g.font = '900 ' + Math.round(sh * 0.19) + 'px ' + FONT;
      g.fillStyle = '#ff5a3c';
      g.fillText(this.clockText, sx + sw * 0.5, sy + sh * 0.3);
      g.fillStyle = '#ffffff';
      const per = this.period <= 4 ? 'Q' + this.period : 'OT' + (this.period - 4 > 1 ? this.period - 4 : '');
      g.font = '800 ' + Math.round(sh * 0.14) + 'px ' + FONT;
      g.fillText(per, sx + sw * 0.5, sy + sh * 0.56);
      g.fillStyle = '#ffb000';
      g.fillText(String(Math.max(0, Math.ceil(this.shotClock))), sx + sw * 0.5, sy + sh * 0.78);
      // ring
      g.fillStyle = grdR;
      g.fillRect(x0, ringY, w, h * 0.08);
      // glare
      g.fillStyle = 'rgba(255,255,255,0.05)';
      g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + sw * 0.5, sy); g.lineTo(sx + sw * 0.3, sy + sh); g.lineTo(sx, sy + sh); g.fill();
    }

    /** vignette + light falloff, pre-rendered per size */
    drawOverlay(g, cam) {
      const key = cam.W + 'x' + cam.H;
      if (this._vigKey !== key) {
        this._vigKey = key;
        const c = U.makeCanvas(Math.ceil(cam.W / 2), Math.ceil(cam.H / 2));
        const vg = c.getContext('2d');
        const w = c.width, h = c.height;
        const grd = vg.createRadialGradient(w * 0.5, h * 0.56, Math.min(w, h) * 0.35, w * 0.5, h * 0.52, Math.max(w, h) * 0.75);
        grd.addColorStop(0, 'rgba(0,0,0,0)');
        grd.addColorStop(0.7, 'rgba(0,0,6,0.18)');
        grd.addColorStop(1, 'rgba(0,0,6,0.5)');
        vg.fillStyle = grd;
        vg.fillRect(0, 0, w, h);
        this._vig = c;
      }
      g.drawImage(this._vig, 0, 0, cam.W, cam.H);
    }
  }

  M.Arena = Arena;
  M.ARENA_SKIN = SKIN;
})();
