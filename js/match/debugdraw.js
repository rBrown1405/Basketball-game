/* Pro BBALL Coach — match view: the coach's debug overlay (a testing aid for the gameplay AI).
 * Drawn over the live court when it is on (Live view: Broadcast settings, "Coach's debug view", or the D key), it
 * shows what every player is doing and why:
 *  - defense: a line from each defender to his man, a ring where his positioning rule wants him and his job: ON BALL
 *    (the cushion he keeps / the one he wants for this handler), CLOSEOUT, DENY (one pass away), HELP or HOME (two
 *    passes away: on the help line, or staying home on a shooter), LOW MAN and SINK on a drive, POST, BOX OUT, a
 *    planner running him through the play; in a zone, a press or transition the scheme's name;
 *  - offense: each off-ball player's job (spacing a spot, a cut, a screen, a relocation, moving for the engine's next
 *    event; NO JOB in red) with a dashed arrow to where he is going, and what the ball handler is doing;
 *  - the play: the engine's script of the possession (the set, screens, passes, moves, the shot) with the step under
 *    way and the time until it happens;
 *  - reads: the latest decisions (the shooter's read of his look: expected points a shot against what the time left
 *    on the shot clock asks for; a look passed up for a reset; the help rotation on a drive; the flow's swing passes
 *    and drive reactions), and where the next rebound comes down and who goes for it.
 * Layers: 'all' (everything), 'defense' (defense and the play), 'offense' (offense and the play).
 * It only draws: nothing in the game changes with it on or off.
 */
(function () {
  'use strict';
  const M = window.PBC.Match, U = M.U;
  const Dir = M.Director;
  if (!Dir) return;
  const P = Dir.prototype;
  const base = { nextBeat: P.nextBeat, defPlan: P.defPlan, startSwing: P.startSwing, flowDriveReact: P.flowDriveReact };

  const ROLE = {
    onBall: ['ON BALL', '#ff6b6b'], closeout: ['CLOSEOUT', '#ffa94d'], deny: ['DENY', '#ffd43b'], help: ['HELP', '#4dabf7'],
    home: ['HOME', '#3bc9db'], lowman: ['LOW MAN', '#da77f2'], sink: ['SINK', '#f783ac'], post: ['POST', '#8ce99a'],
  };
  const SCHEME = {
    man: 'man-to-man', switch: 'switch everything', drop: 'drop coverage', hedge: 'hedge the pick and roll', blitz: 'blitz the pick and roll', pressure: 'pressure man', packline: 'pack line',
    nothree: 'run them off the line', zone23: '2-3 zone', zone32: '3-2 zone', zone131: '1-3-1 zone', boxone: 'box-and-one',
    press: 'full-court press',
  };
  const PLAY = {
    pnr: 'pick and roll', iso: 'isolation', post: 'post up', spot: 'spot-up / drive and kick', offscreen: 'off-screen action',
    handoff: 'handoff', cut: 'cutting action', transition: 'transition', putback: 'putback', none: 'early offense',
  };
  const SYS = {
    balanced: 'balanced', paceSpace: 'pace and space', pnrHeavy: 'pick and roll', motion: 'motion', iso: 'isolation',
    postUp: 'post-up', princeton: 'Princeton', triangle: 'triangle', runGun: 'run and gun', gritGrind: 'grit and grind',
    dribbleDrive: 'dribble drive', heliocentric: 'heliocentric',
  };
  const PATH = {
    screener: 'SCREEN AWAY', offscreen: 'OFF A SCREEN', cut: 'CUT', fill: 'FILL THE SPOT', relocate: 'RELOCATE',
    exchange: 'EXCHANGE', big: 'BIG: SEAL / FLASH', driveReact: 'DRIVE REACTION', passReloc: 'PASS AND REPLACE', move: 'MOVE',
  };
  const ZONE = { rim: 'at the rim', paint: 'in the paint', mid: 'mid-range', c3: 'corner three', ab3: 'three' };
  const WHY = {
    late: 'late in the shot clock: the best look he has', milk: 'milking the clock', hurry3: 'needs a quick three',
    quick: 'a quick shot', twoForOne: 'two-for-one', lastShot: 'the last shot', putback: 'a putback', transition: 'in transition',
    heave: 'a heave', gim: "the coach's call", resets: 'no more resets',
  };
  const COL = { spacing: '#94d82d', action: '#66d9e8', engine: '#ffc078', none: '#ff8787', ball: '#ffffff', dim: '#adb5bd' };
  const PT = { x: 0, y: 0, s: 0, d: 0 }, PT2 = { x: 0, y: 0, s: 0, d: 0 };

  const nm = (d, id) => { if (id == null) return '?'; const l = d.v.look(id); return l ? (l.last || l.name || ('#' + l.num)) : '?'; };
  const pretty = (s) => String(s || '').replace(/_/g, ' ');

  // ------------------------------------------------------------ reads (recorded only while the overlay is on)
  P.dbgOn = function () { const o = this.v && this.v.opts; return !!(o && o.debug); };
  P.dbgRead = function (text, col) {
    const L = this._reads || (this._reads = []);
    const c = this.clock(), m = Math.floor(c / 60), s = Math.floor(c - m * 60);
    L.push({ T: this.T, when: 'Q' + (this.period || 1) + ' ' + m + ':' + String(s).padStart(2, '0'), text, col: col || '#e9ecef' });
    if (L.length > 7) L.shift();
  };
  /** the shooter's read of his look, from the engine (sim.js takeShot / passUp) */
  function shotRead(d, e) {
    const r = e.read, who = nm(d, e.shooter);
    const look = (ZONE[e.zone] || e.zone) + ', ' + e.contest;
    if (!r) return who + ' shoots: ' + look;
    if (r.why) return who + ' shoots: ' + look + ' (' + (WHY[r.why] || r.why) + ')';
    return who + ' shoots ' + look + ': worth ' + r.ep.toFixed(2) + ' pts, ' + r.bar.toFixed(2) + ' needed with ' + Math.round(r.sc) + ' s left';
  }
  P.nextBeat = function () {
    base.nextBeat.call(this);
    if (!this.dbgOn()) return;
    const bt = this.beat, e = bt && bt.ev;
    if (!e) return;
    U.safe(() => {
      if (e.type === 'shot') this.dbgRead(shotRead(this, e), '#ffe066');
      else if (e.type === 'pass' && e.reset) {
        const r = e.read;
        this.dbgRead(nm(this, e.from) + ' passes up ' + (r && r.zone ? (ZONE[r.zone] || r.zone) + ', ' + r.contest : 'his look') + (r && r.ep != null ? ': worth ' + r.ep.toFixed(2) + ' pts, ' + r.bar.toFixed(2) + ' needed with ' + Math.round(r.sc) + ' s left' : '') + '. Reset to ' + nm(this, e.to), '#ff8787');
      } else if (e.type === 'set' && e.pb) {
        const pb = e.pb, why = pb.why && pb.why.length ? ' (' + pb.why.join(', ') + ')' : '';
        this.dbgRead('Play call: ' + pb.name + why + '. Defense plays ' + covWord(pb.cov), '#66d9e8');
      } else if (e.type === 'set') this.dbgRead('Play call: ' + (e.setName || PLAY[e.play] || e.play) + (e.handler != null ? ' for ' + nm(this, e.handler) : ''), '#66d9e8');
      else if (e.type === 'inbound' && e.pb) {
        const pb = e.pb, o = pb.opt || {};
        this.dbgRead('Inbound play: ' + pb.name + '. Read: ' + (o.label || '?') + (o.read && o.read.length ? ' (' + o.read.join(', ') + ')' : ''), '#66d9e8');
      }
      if (e.type === 'shot' && e.pb) {
        const run = this.pbRun || this._pbLast;
        const o = run && run.pb && run.pb.opt;
        this.dbgRead('Read: ' + (e.pb.opt || '?') + (o && o.read && o.read.length ? ' (' + o.read.join(', ') + ')' : '') + (e.pb.early ? '. Early read: the play worked before its last step' : ''), '#b2f2bb');
      }
    }, this, 'debug read');
  };
  if (base.defPlan) P.defPlan = function () {
    const before = this._drv;
    const dp = base.defPlan.call(this);
    const drv = this._drv;
    if (drv && drv !== before && this.dbgOn()) {
      this.dbgRead('Drive by ' + nm(this, drv.h) + ': ' + (drv.low != null ? nm(this, drv.low) + ' steps up as the low man' : 'no low man free') + (drv.sink != null ? ', ' + nm(this, drv.sink) + ' sinks to ' + nm(this, drv.sinkMan) : ''), ROLE.lowman[1]);
    }
    return dp;
  };
  if (base.startSwing) P.startSwing = function (h, z, by) {
    const before = this.swing;
    base.startSwing.call(this, h, z, by);
    const sw = this.swing;
    if (sw && sw !== before && this.dbgOn()) this.dbgRead('Swing it: ' + sw.chain.map((a) => nm(this, a.id)).join(' → ') + ' (' + nm(this, z.id) + ' is guarded or no shooter)', COL.action);
  };
  if (base.flowDriveReact) P.flowDriveReact = function () {
    const t0 = this._driveReactT;
    base.flowDriveReact.call(this);
    if (this._driveReactT === t0 || !this.dbgOn()) return;
    const moves = [];
    for (const a of this.offActors()) {
      const r = this.role[a.id];
      if (r && r.path && r.pathKind === 'driveReact' && r.pathT0 === this.T && r.pathSpot) moves.push(nm(this, a.id) + ' to the ' + spotWord(this, r.pathSpot));
    }
    if (moves.length) this.dbgRead('Drive reads: ' + moves.join(', '), COL.action);
  };
  const COV = {
    drop: 'drop coverage', show: 'the big at the level of the screen', hedge: 'a hard hedge', blitz: 'a blitz on the ball',
    switch: 'a switch on screens', ice: 'ice (no middle on side screens)', zone: 'its zone',
  };
  const covWord = (c) => COV[c] || c || 'man-to-man';
  function spotWord(d, p) {
    const u = d.U_(p.x), v = p.y;
    if (u < 14 && Math.abs(v - 25) > 17) return 'corner';
    if (d.beyondArc && d.beyondArc(u, v, 0)) return Math.abs(v - 25) > 14 ? 'wing' : 'top';
    if (u < 8) return 'baseline';
    return 'mid-range';
  }

  // ------------------------------------------------------------ jobs
  function defJob(d, a) {
    const T = d.T;
    if (a.clip && !a.clip.done) {
      const n = a.clip.clip.name || '';
      if (/box/i.test(n)) return ['BOX OUT', ROLE.post[1]];
      if (/contest|block/i.test(n)) return ['CONTEST', ROLE.onBall[1]];
      if (/steal|reach|swipe/i.test(n)) return ['REACH', ROLE.closeout[1]];
    }
    if (a.stance === 'boxout') return ['BOX OUT', ROLE.post[1]];
    if (d.dtask[a.id] && d.dtask[a.id].until > T) return ['ON THE PLAY', COL.engine];
    const tracked = a.goal && a.goal.mode === 'track' && a.goal.track === a._defTrack;
    const r = tracked ? a._dRole : null;
    if (r && ROLE[r]) {
      if (r === 'onBall') {
        const m = d.A(d.matchup[a.id]);
        const gap = m ? Math.hypot(a.x - m.x, a.y - m.y) : 0;
        return ['ON BALL ' + gap.toFixed(1) + ' / ' + (a._gs ? a._gs.gap.toFixed(1) : '?') + ' ft', ROLE.onBall[1]];
      }
      return ROLE[r];
    }
    if (d.phase !== 'front') return ['GET BACK', COL.dim];
    return [(SCHEME[d.scheme] || d.scheme || 'D').toUpperCase(), COL.dim];
  }
  /** the engine's next job for an off-ball player (the next few events) */
  function engineJob(d, id) {
    const ev = d.events || [];
    for (let i = Math.max(0, d.ei - 1); i < Math.min(ev.length, d.ei + 5); i++) {
      const e = ev[i];
      if (!e || (d.beat && d.beat.ev === e && d.beat.fired)) continue;
      const is = (k) => e[k] != null && String(e[k]) === String(id);
      if (e.type === 'screen' && is('screener')) return 'SET A SCREEN';
      if (e.type === 'screen' && is('user')) return 'USE THE SCREEN';
      if ((e.type === 'pass' || e.type === 'handoff') && is('to')) return 'GET OPEN FOR THE BALL';
      if (e.type === 'move' && is('player')) return pretty(e.move).toUpperCase();
      if (e.type === 'shot' && is('shooter')) return 'THE SHOT';
    }
    return 'ON THE PLAY';
  }
  function spotJob(d, a, r) {
    const n = r.spotName || '';
    const su = d.U_(r.spot.x), sv = r.spot.y;
    const beyond = d.beyondArc ? d.beyondArc(su, sv, 0.5) : Math.hypot(su - 5.25, sv - 25) > 24;
    const inside = (su < 10 && Math.abs(sv - 25) < 22) || d.inPaint(r.spot, 0);
    const big = d.insideBig ? d.insideBig(a) : false, sp = d.spacer ? d.spacer(a) : true;
    const ok = beyond ? !big : inside ? !sp || /block/.test(n) : big && su > 15 && su < 22 && Math.abs(sv - 25) < 9;
    const name = /^corner/.test(n) ? 'SPACE: CORNER' : /^wing/.test(n) ? 'SPACE: WING' : /^slot/.test(n) ? 'SPACE: SLOT' : /^top/.test(n) ? 'SPACE: TOP'
      : /^dunker/.test(n) ? 'DUNKER SPOT' : /^short/.test(n) ? 'SHORT CORNER' : /^block/.test(n) ? 'BLOCK' : /^elbow/.test(n) ? 'ELBOW' : n === 'high' ? 'HIGH POST'
        : beyond ? 'SPACE' : inside ? 'INSIDE' : 'SPOT';
    return ok ? [name, COL.spacing] : ['NO JOB (' + (beyond ? 'spot' : inside ? 'inside' : 'mid-range') + ')', COL.none];
  }
  function offJob(d, a) {
    const b = d.v.ball, r = d.role[a.id], T = d.T;
    if (b.holder === a) return [d.driving(a) ? 'BALL: DRIVE' : r && r.probe ? 'BALL: PROBE' : 'BALL', COL.ball, null];
    if (!r) return ['', COL.dim, null];
    let dest = null;
    if (r.path && r.path.length) { const wp = r.path[r.path.length - 1]; dest = { x: wp.x, y: wp.y }; }
    else if (a.goal && a.goal.mode === 'move') dest = { x: a.goal.x, y: a.goal.y };
    else if (r.spot) dest = { x: r.spot.x + (r.jx || 0), y: r.spot.y + (r.jy || 0) };
    if (a.isBusy() && a.clip) return [pretty(a.clip.clip.name).toUpperCase(), COL.engine, dest];
    const run = d.pbRun;
    if (run && r.pb && run.pb && run.pb.roles) {
      // (his role in the called play, filled by how his ratings fit it)
      let role = null;
      for (const k in run.pb.roles) if (String(run.pb.roles[k]) === String(a.id)) role = k;
      if (role) return ['PLAY: ' + roleWord(run.pb.id, role), '#63e6be', dest];
    }
    if (r.mode === 'locked' || r.until > T || b.passTarget === a) return [engineJob(d, a.id), COL.engine, dest];
    if (r.path) return [PATH[r.pathKind] || 'ACTION', COL.action, dest];
    if (r.phase === 'out') return ['V-CUT', COL.action, dest];
    if (r.spot) { const j = spotJob(d, a, r); return [j[0], j[1], dest]; }
    return ['', COL.dim, dest];
  }

  /** a role of a play in words: its profile (screener, shooter, cutter, ...) */
  const ROLE_WORD = {
    handler: 'BALL HANDLER', pnr: 'BALL HANDLER', screener: 'SCREENER', popper: 'SCREEN AND POP', shooter: 'SHOOTER', spacer: 'SPACER',
    cutter: 'CUTTER', post: 'POST', passer: 'HUB / PASSER', scorer: 'SCORER', inbounder: 'INBOUNDER', dunker: 'DUNKER SPOT', screen2: 'SCREENER',
  };
  function roleWord(id, role) {
    const pl = window.PBC.Playbook && window.PBC.Playbook.get(id);
    const prof = pl && pl.roles[role];
    return ROLE_WORD[prof] || String(role).toUpperCase();
  }

  // ------------------------------------------------------------ drawing helpers
  function floorPt(cam, x, y, out) { return cam.project(x, y, 0.06, out); }
  function ring(g, cam, x, y, r, col, w, dash) {
    g.beginPath();
    for (let i = 0; i <= 24; i++) { const t = i / 24 * Math.PI * 2; const p = floorPt(cam, x + Math.cos(t) * r, y + Math.sin(t) * r, PT); if (i) g.lineTo(p.x, p.y); else g.moveTo(p.x, p.y); }
    g.setLineDash(dash || []); g.strokeStyle = col; g.lineWidth = w || 2; g.stroke(); g.setLineDash([]);
  }
  function line(g, cam, x0, y0, x1, y1, col, w, dash, arrow) {
    const a = floorPt(cam, x0, y0, PT), ax = a.x, ay = a.y;
    const b = floorPt(cam, x1, y1, PT2);
    g.beginPath(); g.moveTo(ax, ay); g.lineTo(b.x, b.y);
    g.setLineDash(dash || []); g.strokeStyle = col; g.lineWidth = w || 1.5; g.stroke(); g.setLineDash([]);
    if (arrow) {
      const ang = Math.atan2(b.y - ay, b.x - ax), s = 7;
      g.beginPath(); g.moveTo(b.x, b.y);
      g.lineTo(b.x - Math.cos(ang - 0.45) * s, b.y - Math.sin(ang - 0.45) * s);
      g.lineTo(b.x - Math.cos(ang + 0.45) * s, b.y - Math.sin(ang + 0.45) * s);
      g.closePath(); g.fillStyle = col; g.fill();
    }
  }
  function rrect(g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r); g.lineTo(x + w, y + h - r);
    g.quadraticCurveTo(x + w, y + h, x + w - r, y + h); g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r); g.lineTo(x, y + r);
    g.quadraticCurveTo(x, y, x + r, y); g.closePath();
  }
  function tag(g, x, y, txt, col) {
    if (!txt) return;
    g.font = '700 10px "Helvetica Neue", Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    const w = g.measureText(txt).width + 8;
    g.fillStyle = 'rgba(8,10,16,0.8)'; rrect(g, x - w / 2, y - 13, w, 13, 3); g.fill();
    g.fillStyle = col; g.fillText(txt, x, y - 3);
  }
  function headPt(cam, a, out) {
    const S = a.sk && a.sk.P;
    return S ? cam.project(S[18], S[19], S[20] + 0.6, out) : cam.project(a.x, a.y, 7.2, out);
  }
  function fit(g, s, w) {
    if (g.measureText(s).width <= w) return s;
    let lo = 0, hi = s.length;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (g.measureText(s.slice(0, mid) + '…').width <= w) lo = mid; else hi = mid - 1; }
    return s.slice(0, lo) + '…';
  }

  // ------------------------------------------------------------ the play and the reads
  function evText(d, e, done) {
    const n = (id) => nm(d, id);
    switch (e.type) {
      case 'set': return 'SET ' + (e.setName || PLAY[e.play] || e.play || '') + (e.handler != null ? ': ' + n(e.handler) + ' has it' : '');
      case 'advance': return 'BRING IT UP';
      case 'screen': return 'SCREEN ' + n(e.screener) + ' for ' + n(e.user) + (e.kind === 'ball' ? ' (on the ball)' : ' (off the ball)');
      case 'pass': return 'PASS ' + n(e.from) + ' → ' + n(e.to) + (e.reset ? ' (reset)' : '');
      case 'handoff': return 'HANDOFF ' + n(e.from) + ' → ' + n(e.to);
      case 'move': return pretty(e.move).toUpperCase() + ' ' + n(e.player);
      case 'shot': return 'SHOT ' + n(e.shooter) + ': ' + (ZONE[e.zone] || e.zone) + ', ' + pretty(e.kind) + ', ' + e.contest + (done ? (e.made ? ' · MADE' : e.blocked ? ' · BLOCKED' : ' · MISSED') : '');
      case 'rebound': return 'REBOUND ' + (e.player != null ? n(e.player) : '') + (e.off ? ' (offense)' : '');
      case 'turnover': return 'TURNOVER ' + (e.player != null ? n(e.player) : '') + (e.kind ? ' (' + pretty(e.kind) + ')' : '');
      case 'foul': return 'FOUL ' + (e.fouler != null ? n(e.fouler) : '');
      case 'ft': return 'FREE THROW ' + n(e.shooter) + (done ? (e.made ? ' · MADE' : ' · MISSED') : '');
      default: return pretty(e.type).toUpperCase();
    }
  }
  /** `s` in lines no wider than `w` (at most `max`) */
  function wrap(g, s, w, max) {
    const out = [], words = s.split(' ');
    let cur = '';
    for (const wd of words) {
      const t = cur ? cur + ' ' + wd : wd;
      if (g.measureText(t).width <= w || !cur) cur = t;
      else { out.push(cur); cur = '   ' + wd; if (out.length === max - 1) break; }
    }
    if (cur && out.length < max) out.push(cur);
    return out;
  }
  function panel(g, d, view, L, ballX) {
    const W = Math.min(430, view.cssW * 0.46), lh = 14;
    // (on the side of the screen away from the ball; on the left, clear of the animation tools' panel when they are
    // open, Shift+D, js/match/debug.js: it is 300 px wide at the top left)
    const x0 = ballX != null && ballX < view.cssW * 0.5 ? view.cssW - W - 10 : view.debug ? 316 : 10;
    const rows = [];
    const poss = d.poss || {};
    rows.push(['OFFENSE: ' + (SYS[poss.offSystem] || poss.offSystem || 'balanced') + '   DEFENSE: ' + (SCHEME[d.scheme] || d.scheme) + '   SHOT CLOCK ' + d.shotClock().toFixed(0), COL.dim, 1]);
    const setEv = (d.events || []).find((e) => e && e.type === 'set');
    const run = d.pbRun || d._pbLast;
    const play = run && window.PBC.Playbook ? window.PBC.Playbook.get(run.id) : null;
    if (play) {
      // the called play: its steps (done, under way, ahead), the reads open at this step, and the read taken
      const pb = run.pb, live = d.pbRun === run;
      rows.push(['PLAY: ' + play.name + (live ? '' : ' (over)') + '   COVERAGE: ' + covWord(pb.cov), '#63e6be', 1]);
      const k = run.k != null ? run.k : -1;
      play.steps.forEach((st, i) => {
        const cur = live && i === k, done = i < k || (!live && i <= k);
        rows.push([(cur ? '▶ ' : done ? '✓ ' : '   ') + (i + 1) + '. ' + st.text, cur ? '#63e6be' : done ? '#868e96' : '#dee2e6', 0]);
      });
      if (!run.inbound && live) {
        const open = play.opts.filter((o) => o.at === Math.max(0, k)).map((o) => o.label);
        if (open.length) rows.push(['   reads now: ' + open.join(' · '), '#a5d8ff', 0]);
      }
      const o = pb.opt;
      if (o && (!live || k >= o.at)) rows.push(['   READ: ' + o.label + (o.read && o.read.length ? ' (' + o.read.join(', ') + ')' : '') + (o.at < play.steps.length - 1 ? ', an early read' : ''), '#b2f2bb', 1]);
      // (play tracking, once the play is over: completed, or where and why it broke down)
      const rec = !live && d.poss && d.poss.pbs ? d.poss.pbs.find((r) => r.id === run.id && r.out) : null;
      if (rec) {
        const PS = window.PBC.PlayStats, why = rec.brk && PS ? (PS.BRK[rec.brk[1]] || [rec.brk[1]])[0] : null;
        // (the outcome once the court has shown it: no shot, foul or turnover still to come)
        const shown = !(d.events || []).some((e, i) => e && (e.type === 'shot' || e.type === 'foul' || e.type === 'ft' || e.type === 'turnover') && (i >= d.ei || (d.beat && d.beat.ev === e && !d.beat.fired)));
        const outW = shown ? (PS ? (PS.OUT[rec.out] || rec.out) : rec.out).toLowerCase() : '';
        rows.push([rec.brk ? '   BROKE DOWN ' + (rec.brk[0] >= 0 ? 'at step ' + (rec.brk[0] + 1) : 'at the entry') + ': ' + why + (outW ? ' (' + outW + ')' : '')
          : '   COMPLETED' + (rec.early ? ' on an early read' : '') + (outW ? ': ' + outW : '') + (rec.ctr ? ', a counter' : ''), rec.brk ? '#ffa8a8' : '#b2f2bb', 1]);
      }
      if (pb.why && pb.why.length) rows.push(['   why this call: ' + pb.why.join(', '), '#adb5bd', 0]);
    } else rows.push(['PLAY: ' + (PLAY[d.play] || d.play) + (setEv && setEv.setName ? ' · ' + setEv.setName : ' (flow, no call)'), '#ffffff', 1]);
    const ev = d.events || [];
    const i0 = Math.max(0, d.ei - 4), i1 = Math.min(ev.length, d.ei + 4);
    for (let i = i0; i < i1; i++) {
      const e = ev[i];
      if (!e || e.type === 'sub' || e.type === 'timeout') continue;
      const cur = d.beat && d.beat.ev === e && !d.beat.fired;
      const done = i < d.ei && !cur;
      rows.push([(cur ? '▶ ' : done ? '✓ ' : '   ') + evText(d, e, done) + (cur ? '   in ' + Math.max(0, d.beat.fireAt - d.T).toFixed(1) + ' s' : ''), cur ? '#ffe066' : done ? '#868e96' : '#dee2e6', 0]);
    }
    const reads = (d._reads || []).filter((r) => d.T - r.T < 14);
    if (reads.length) {
      rows.push(['READS', '#ffffff', 1]);
      g.font = '500 11px "Helvetica Neue", Arial, sans-serif';
      for (const r of reads.slice(-5)) for (const t of wrap(g, r.when + '  ' + r.text, W - 16, 2)) rows.push([t, r.col, 0, Math.max(0.35, 1 - (d.T - r.T) / 14)]);
    }
    if (L.def) rows.push(['legend', null, 2]);
    const h = rows.length * lh + 12;
    const y0 = Math.max(112, view.cssH * 0.14); // (below the TV graphics' play call at the top left)
    g.fillStyle = 'rgba(8,10,16,0.72)'; rrect(g, x0, y0, W, h, 6); g.fill();
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    let y = y0 + 6 + lh - 3;
    for (const [t, c, b, alpha] of rows) {
      if (b === 2) {
        // legend: the defensive jobs' colours
        let x = x0 + 8;
        g.font = '700 9px "Helvetica Neue", Arial, sans-serif';
        for (const k of Object.keys(ROLE)) {
          const [label, col] = ROLE[k];
          g.fillStyle = col; g.fillRect(x, y - 8, 8, 8);
          g.fillStyle = '#ced4da'; g.fillText(label, x + 11, y);
          x += g.measureText(label).width + 20;
          if (x > x0 + W - 40) break;
        }
        y += lh;
        continue;
      }
      g.font = (b ? '700 ' : '500 ') + '11px "Helvetica Neue", Arial, sans-serif';
      g.globalAlpha = alpha == null ? 1 : alpha;
      g.fillStyle = c; g.fillText(fit(g, t, W - 16), x0 + 8, y);
      g.globalAlpha = 1;
      y += lh;
    }
  }

  // ------------------------------------------------------------ the overlay
  M.DebugDraw = {
    draw(g, cam, view, layers) {
      const d = view.director;
      if (!d || !d.active || !d.role) return;
      const L = layers === 'defense' ? { def: 1 } : layers === 'offense' ? { off: 1 } : { def: 1, off: 1 };
      const nameUp = view.opts.showNames ? 16 : 0;
      g.save();
      g.lineCap = 'round';
      const b = d.v.ball, h = b.holder && b.holder.team === d.off ? b.holder : null;
      // the ball to the rim: the line the ball defender stays on
      if (L.def && h && d.phase === 'front') line(g, cam, h.x, h.y, d.rim.x, d.rim.y, 'rgba(255,255,255,0.35)', 1, [2, 5]);
      if (L.def) {
        for (const a of d.defActors()) {
          const m = d.A(d.matchup[a.id]);
          const [txt, col] = defJob(d, a);
          if (m && !ZONE_SCHEME(d)) line(g, cam, a.x, a.y, m.x, m.y, col, 1.4, [6, 4]);
          const t = a._dTgt;
          if (t && d.T - t.T < 0.3 && a._dRole) {
            ring(g, cam, t.x, t.y, 1.1, col, 2);
            if (Math.hypot(t.x - a.x, t.y - a.y) > 1.6) line(g, cam, a.x, a.y, t.x, t.y, col, 1, null, true);
          }
          const p = headPt(cam, a, PT);
          tag(g, p.x, p.y - nameUp, txt, col);
        }
      }
      if (L.off) {
        for (const a of d.offActors()) {
          const [txt, col, dest] = offJob(d, a);
          if (dest && Math.hypot(dest.x - a.x, dest.y - a.y) > 2) line(g, cam, a.x, a.y, dest.x, dest.y, col, 1.6, [3, 4], true);
          const p = headPt(cam, a, PT);
          tag(g, p.x, p.y - nameUp, txt, col);
        }
      }
      // the rebound: where it comes down and who goes for it
      const pr = d.pendingRebound;
      if (pr && pr.actor && isFinite(pr.x)) {
        ring(g, cam, pr.x, pr.y, 1.4, '#ff922b', 2, [4, 3]);
        const q = floorPt(cam, pr.x, pr.y, PT);
        tag(g, q.x, q.y + 16, 'REBOUND: ' + nm(d, pr.actor.id) + ' (' + (pr.style || 'jump') + ')', '#ff922b');
      }
      const bp = cam.project(b.x, b.y, b.z, PT);
      panel(g, d, view, L, bp.x);
      g.restore();
    },
  };
  function ZONE_SCHEME(d) { return /^zone|boxone/.test(d.scheme || '') || d.scheme === 'press'; }
})();
