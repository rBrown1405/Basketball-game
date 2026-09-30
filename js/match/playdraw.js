/* Pro BBALL Coach, match view: the called play's intended paths on the court (the play overlay).
 * While a play is on (plays.js: the Director's pbRun), its drawing is laid on the floor where it is run, like a
 * telestrator: the same lines as the whiteboard and the playbook diagrams (js/ui/playdesigner.js: cuts, dribbles,
 * screens, passes, hand-offs, drives), mirrored to the side the play is run on, toward the basket being attacked.
 * The step under way is bright, the next ones dimmer, the steps done fade out; the spots each player is heading to
 * get a dashed ring, each player in the play a number over the head (the play's numbering), and a card in the corner
 * names the play and the step. Modes (Broadcast settings, the 📋 button or the O key): 'mine' (the plays the head
 * coach called, the default), 'ours' (every play the coach's team runs), 'all' (both teams), 'off'.
 * The floor lines are drawn under the players; the numbers and the card on top. It only draws. */
(function () {
  'use strict';
  const M = window.PBC.Match;
  const COL = ['#4dabf7', '#63e6be', '#ffa94d', '#f783ac', '#b197fc'];
  const cache = new Map();
  const PT = { x: 0, y: 0, s: 0, d: 0 };

  /** the drawing of a play (a library play drawn from its steps; the coach's from the whiteboard), cached */
  function drawingOf(play, PD) {
    const src = play._src || play;
    const c = cache.get(play.id);
    if (c && c.src === src) return c;
    const PB = window.PBC.Playbook;
    let def;
    const keyToRole = {};
    if (play._src) {
      def = play._src;
      const inb = def.kind === 'blob' || def.kind === 'slob';
      for (const k in def.players) keyToRole[k] = inb && k === def.ball ? 'inb' : k;
    } else {
      def = PB.defFromPlay(play, play.id);
      Object.keys(play.roles).forEach((r, i) => { keyToRole['p' + (i + 1)] = r; });
    }
    let G = null;
    try { G = PD.geometry(def); } catch (e) { G = null; }
    const out = { src, def, G, keyToRole };
    cache.set(play.id, out);
    return out;
  }
  /** is this run shown in this mode? */
  function shown(d, view, mode) {
    const run = d.pbRun;
    if (!run || !run.pb || !mode || mode === 'off') return false;
    const user = view.opts.userTeam;
    if (mode === 'all') return true;
    if (user == null || d.off !== user) return false;
    return mode === 'ours' || !!run.pb.user;
  }
  function setup(view) {
    const d = view.director, PBC = window.PBC;
    const PD = PBC.UI && PBC.UI.playDrawing;
    const run = d.pbRun, play = PBC.Playbook && PBC.Playbook.get(run.id);
    if (!PD || !play) return null;
    const D = drawingOf(play, PD);
    if (!D.G) return null;
    const side = run.pb.side || 1;
    // (a drawn spot on the court: mirrored to the side it is run on, toward the basket attacked)
    const C = (p) => ({ x: d.X(p[0]), y: side > 0 ? p[1] : 50 - p[1] });
    const n = run.inbound && run.pb.seq ? Math.min(run.pb.seq.length, D.G.steps.length) : D.G.steps.length;
    return { d, run, play, D, PD, C, n, k: run.k != null ? run.k : -1 };
  }
  function proj(cam, c, out) { return cam.project(c.x, c.y, 0.06, out); }
  /** one line of the drawing on the floor, with a dark edge so it reads on the wood */
  function strokePath(g, pts, col, w, dash) {
    g.setLineDash(dash || []);
    g.beginPath();
    pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
    g.strokeStyle = 'rgba(10, 12, 18, 0.5)'; g.lineWidth = w + 2.6; g.stroke();
    g.beginPath();
    pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
    g.strokeStyle = col; g.lineWidth = w; g.stroke();
    g.setLineDash([]);
  }
  function arrow(g, pts, col, s) {
    const n = pts.length;
    if (n < 2) return;
    const b = pts[n - 1];
    let a = pts[n - 2];
    for (let i = n - 2; i >= 0 && Math.hypot(b.x - a.x, b.y - a.y) < 2; i--) a = pts[i];
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    g.beginPath(); g.moveTo(b.x, b.y);
    g.lineTo(b.x - Math.cos(ang - 0.42) * s, b.y - Math.sin(ang - 0.42) * s);
    g.lineTo(b.x - Math.cos(ang + 0.42) * s, b.y - Math.sin(ang + 0.42) * s);
    g.closePath();
    g.fillStyle = 'rgba(10, 12, 18, 0.55)'; g.fill();
    g.save(); g.translate(-Math.cos(ang) * 1.2, -Math.sin(ang) * 1.2); g.fillStyle = col; g.fill(); g.restore();
  }
  function ringAt(g, cam, c, r, col, w, dash) {
    g.beginPath();
    for (let i = 0; i <= 28; i++) { const t = i / 28 * Math.PI * 2; const p = cam.project(c.x + Math.cos(t) * r, c.y + Math.sin(t) * r, 0.06, PT); if (i) g.lineTo(p.x, p.y); else g.moveTo(p.x, p.y); }
    g.setLineDash(dash || []); g.strokeStyle = col; g.lineWidth = w; g.stroke(); g.setLineDash([]);
  }

  M.PlayDraw = {
    /** the paths on the floor (drawn before the players) */
    floor(g, cam, view, mode) {
      const d = view.director;
      if (!d || !d.active || !shown(d, view, mode)) return;
      const Z = setup(view);
      if (!Z) return;
      const { D, PD, C, n, k } = Z;
      // (the size of a foot on the screen here: line widths and arrowheads scale with the camera)
      const a0 = proj(cam, C([15, 25]), { x: 0, y: 0 }), a1 = proj(cam, C([15, 26]), { x: 0, y: 0 });
      const ft = Math.max(1.5, Math.hypot(a1.x - a0.x, a1.y - a0.y));
      const w = Math.max(2.5, ft * 0.45), ah = Math.max(8, ft * 1.6);
      g.save();
      g.lineCap = 'round'; g.lineJoin = 'round';
      const cur = Math.max(0, k);
      for (let j = 0; j < n; j++) {
        const s = D.G.steps[j];
        const alpha = j < cur ? 0.16 : j === cur ? 1 : j === cur + 1 ? 0.55 : 0.32;
        if (j < cur - 1) continue;
        const col = COL[j % COL.length];
        g.globalAlpha = alpha;
        for (const l of s.lines) {
          const r = 1.5;
          let pts = l.pts;
          if (l.t === 'screen') {
            const tp = PD.trim(pts, r, 0);
            if (tp.length > 1) strokePath(g, tp.map((p) => proj(cam, C(p), {})), col, w);
            const b0 = proj(cam, C(l.bar[0]), {}), b1 = proj(cam, C(l.bar[1]), {});
            strokePath(g, [b0, b1], col, w * 2.1);
            continue;
          }
          if (l.t === 'pass' || l.t === 'handoff') {
            pts = PD.trim(pts, r, r);
            if (pts.length < 2) continue;
            const sp = pts.map((p) => proj(cam, C(p), {}));
            strokePath(g, sp, col, w * 0.9, l.t === 'pass' ? [w * 2.6, w * 2.2] : null);
            arrow(g, sp, col, ah);
            continue;
          }
          pts = PD.trim(pts, l.t === 'roll' ? 0.2 : r, 0.2);
          if (pts.length < 2) continue;
          if (l.t === 'dribble' || l.t === 'drive' || l.t === 'post') pts = PD.zigzag(pts, l.t === 'post' ? 0.5 : 0.6);
          const sp = pts.map((p) => proj(cam, C(p), {}));
          strokePath(g, sp, col, w);
          arrow(g, sp, col, ah);
        }
        // setting up: the spots of the alignment
        if (j === 0 && k < 0) for (const kk in s.st.from) ringAt(g, cam, C(s.st.from[kk]), 1.3, 'rgba(255, 255, 255, 0.85)', Math.max(1.2, w * 0.6));
        // where the players of the step under way (or the next one) are heading
        if (j === cur) {
          for (const kk in s.st.to) {
            const a = s.st.from[kk], b = s.st.to[kk];
            if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1) continue;
            ringAt(g, cam, C(b), 1.5, col, Math.max(1.2, w * 0.8), [w * 2, w * 1.6]);
          }
        }
      }
      g.globalAlpha = 1;
      g.restore();
    },
    /** the players' numbers and the card (drawn on top, at full resolution) */
    top(g, cam, view, mode) {
      const d = view.director;
      if (!d || !d.active || !shown(d, view, mode)) return;
      const Z = setup(view);
      if (!Z) return;
      const { run, play, D, n, k } = Z;
      const cur = Math.max(0, k), col = COL[cur % COL.length];
      g.save();
      // each player in the play: the play's number over the head
      const keys = D.G.tr.keys;
      const up = view.opts.showNames ? 18 : 2;
      keys.forEach((kk, i) => {
        const id = run.pb.roles[D.keyToRole[kk]];
        const a = id != null ? d.A(id) : null;
        if (!a) return;
        const S = a.sk && a.sk.P;
        const p = S ? cam.project(S[18], S[19], S[20] + 0.75, PT) : cam.project(a.x, a.y, 7.4, PT);
        const x = p.x, y = p.y - up - 9;
        g.beginPath(); g.arc(x, y, 8.5, 0, Math.PI * 2);
        g.fillStyle = 'rgba(10, 12, 18, 0.82)'; g.fill();
        g.lineWidth = 2; g.strokeStyle = col; g.stroke();
        g.fillStyle = '#fff'; g.font = '800 11px "Helvetica Neue", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(String(i + 1), x, y + 0.5);
      });
      // the card: the play, whose call, the step
      const st = play.steps[cur];
      const title = '📋 ' + play.name.toUpperCase() + (run.pb.user ? '  ·  YOUR CALL' : '');
      const line = n ? 'Step ' + (k < 0 ? 1 : cur + 1) + ' of ' + n + (k < 0 ? ' (setting up)' : '') + ': ' + (st ? st.text : '') : '';
      g.font = '800 12px "Helvetica Neue", Arial, sans-serif';
      const tw = g.measureText(title).width;
      g.font = '500 11.5px "Helvetica Neue", Arial, sans-serif';
      const W = Math.min(view.cssW * 0.46, Math.max(tw, g.measureText(line).width) + 22);
      const x0 = 12, h = 42, y0 = view.cssH - h - Math.max(96, view.cssH * 0.13);
      g.fillStyle = 'rgba(8, 10, 16, 0.78)';
      g.beginPath();
      if (g.roundRect) g.roundRect(x0, y0, W, h, 7); else g.rect(x0, y0, W, h);
      g.fill();
      g.fillStyle = col; g.fillRect(x0, y0 + 6, 3, h - 12);
      g.textAlign = 'left'; g.textBaseline = 'alphabetic';
      g.fillStyle = '#fff'; g.font = '800 12px "Helvetica Neue", Arial, sans-serif';
      g.fillText(title, x0 + 12, y0 + 17);
      g.fillStyle = '#ced4da'; g.font = '500 11.5px "Helvetica Neue", Arial, sans-serif';
      let t = line;
      while (t.length > 8 && g.measureText(t).width > W - 20) t = t.slice(0, -2);
      g.fillText(t === line ? t : t + '…', x0 + 12, y0 + 33);
      g.restore();
    },
  };
})();
