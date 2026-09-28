/* Pro BBALL Coach — the play designer: a whiteboard where the head coach draws a play in X's and O's.
 * The five start in a set (a formation, or a play from the library to change), then each step is drawn on the board:
 * drag a player to open floor for a cut (a dribble when that player has the ball), onto a teammate for a screen (or a
 * pass, with the ball); the tools draw hand-offs, drives and post-ups too. Each player gets a role (what the play
 * needs from that spot: a handler, a roller, a shooter...), and the reads the play opens are worked out from what it
 * does (js/core/playbook.js: customReads), each one on or off and a first look or not. Saved plays go to the league
 * save (S.customPlays), compile into plays the engine and the court run like the library's, and can go into the
 * team's playbook, where the coach calls them in a timeout (js/ui/huddle.js) and the staff can call them too.
 * The drawing code here also draws the coach's plays in the Playbook page, the huddle and the live court's overlay. */
(function () {
  'use strict';
  const PBC = window.PBC;
  const U = PBC.U, UI = PBC.UI;
  const PB = () => PBC.Playbook;

  const KEYS = ['p1', 'p2', 'p3', 'p4', 'p5'];
  const RIM = [5.25, 25];
  // marker colors by step (the whiteboard) and the app's step colors (dark diagrams)
  const INK = ['#1864ab', '#c92a2a', '#2b8a3e', '#862e9c', '#d9480f'];
  const DARK = ['#4dabf7', '#63e6be', '#ffa94d', '#f783ac', '#b197fc'];
  const TOP = [30.5, 25], WING_L = [23, 7], WING_R = [23, 43], CORNER_L = [2.5, 2], CORNER_R = [2.5, 48];
  const ELBOW_L = [19, 17], ELBOW_R = [19, 33], BLOCK_L = [7.5, 17], BLOCK_R = [7.5, 33];
  const INB_SPOT = { blob: [-1.5, 17], slob: [28, -1.5] };
  const TOOLS = [
    ['draw', '✏️', 'Draw', 'Drag a player: to open floor for a cut (a dribble for the player with the ball), onto a teammate for a screen, or a pass from the player with the ball.'],
    ['cut', '➜', 'Cut', 'Drag a player to where they cut or relocate.'],
    ['dribble', '〰', 'Dribble', 'Drag the player with the ball to where they dribble.'],
    ['screen', '⊥', 'Screen', 'Drag the screener onto the teammate they screen for.'],
    ['pass', '⇢', 'Pass', 'Drag from the player with the ball to the teammate who catches it.'],
    ['handoff', '⇉', 'Hand-off', 'Drag from the player with the ball to the teammate who takes the hand-off.'],
    ['drive', '⚡', 'Drive', 'Tap the player with the ball: they attack the rim.'],
    ['post', '⤓', 'Post up', 'Tap the player with the ball: they back down in the post.'],
    ['erase', '🧽', 'Erase', 'Tap a line of this step to erase it.'],
  ];
  const INB_TOOLS = { draw: 1, cut: 1, screen: 1, erase: 1 };
  const TAGS = [['ato', 'After timeouts'], ['eog', 'End of game'], ['need3', 'Need a three'], ['early', 'Early offense']];
  const FEAT = { handle: 'handle', pass: 'passing', vision: 'vision', shotIQ: 'shot IQ', scorer: 'scoring', small: 'guard size', pull: 'pull-up shooting', speed: 'speed', big: 'size', strength: 'strength', finish: 'finishing', three: 'three-point shooting', post: 'post moves', close: 'close shots', mid: 'mid-range', agility: 'agility', oreb: 'offensive rebounding', vert: 'leaping' };
  const READ_ICON = { handler: '⚡', roller: '⤵', popper: '🎯', pnrKick: '↗', offCatch: '🎯', offCurl: '↩', offSlip: '⤵', post: '⤓', faceUp: '👀', postKick: '↗', catchShoot: '🎯', closeout: '⚡', dho: '⚡', dhoBig: '⤵', dhoKick: '↗', cut: '➜', relocate: '🎯', drive: '⚡', driveKick: '↗', endShot: '🏀', endSwing: '↗', inbCut: '➜', inbShot: '🎯', safety: '🛟' };
  const SETS = {
    half: [
      ['fiveOut', 'Five out', { p1: ['handler', TOP], p2: ['shooter', WING_R], p3: ['spacer', WING_L], p4: ['popper', CORNER_L], p5: ['spacer', CORNER_R] }],
      ['fourOut', 'Four out, one in', { p1: ['handler', TOP], p2: ['shooter', WING_R], p3: ['spacer', WING_L], p4: ['spacer', CORNER_R], p5: ['post', BLOCK_L] }],
      ['horns', 'Horns', { p1: ['pnr', TOP], p2: ['shooter', CORNER_R], p3: ['spacer', CORNER_L], p4: ['popper', ELBOW_L], p5: ['screener', ELBOW_R] }],
      ['oneFour', '1-4 high', { p1: ['handler', TOP], p2: ['shooter', [21, 44]], p3: ['spacer', [21, 6]], p4: ['screen2', ELBOW_L], p5: ['screener', ELBOW_R] }],
      ['box', 'Box', { p1: ['handler', TOP], p2: ['shooter', ELBOW_R], p3: ['cutter', ELBOW_L], p4: ['screen2', BLOCK_L], p5: ['post', BLOCK_R] }],
    ],
    blob: [
      ['box', 'Box', { p1: ['handler', ELBOW_L], p2: ['shooter', BLOCK_R], p3: ['inbounder', INB_SPOT.blob], p4: ['dunker', BLOCK_L], p5: ['screen2', ELBOW_R] }],
      ['stack', 'Stack', { p1: ['handler', [16, 19]], p2: ['shooter', [7, 19]], p3: ['inbounder', INB_SPOT.blob], p4: ['dunker', [13, 19]], p5: ['screen2', [10, 19]] }],
      ['line', 'Line', { p1: ['handler', [19, 10]], p2: ['shooter', [19, 20]], p3: ['inbounder', INB_SPOT.blob], p4: ['dunker', [19, 30]], p5: ['screen2', [19, 40]] }],
    ],
    slob: [
      ['box', 'Box', { p1: ['handler', ELBOW_L], p2: ['shooter', ELBOW_R], p3: ['inbounder', INB_SPOT.slob], p4: ['dunker', BLOCK_L], p5: ['screen2', BLOCK_R] }],
      ['stack', 'Stack', { p1: ['handler', TOP], p2: ['shooter', [19, 12]], p3: ['inbounder', INB_SPOT.slob], p4: ['cutter', [21, 13]], p5: ['screen2', ELBOW_R] }],
      ['spread', 'Spread', { p1: ['handler', TOP], p2: ['shooter', WING_R], p3: ['inbounder', INB_SPOT.slob], p4: ['dunker', BLOCK_L], p5: ['screener', ELBOW_R] }],
    ],
  };

  // ------------------------------------------------------------ geometry (feet: u from the baseline, v from the left sideline)
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const isInb = (def) => def.kind === 'blob' || def.kind === 'slob';
  /** where a player may stand: the inbounder out of bounds (under the basket or on the left sideline), everyone else in the half court */
  function clampSpot(def, k, p) {
    if (isInb(def) && k === def.ball) {
      if (def.kind === 'blob') return [-1.5, U.clamp(p[1], 3, 47)];
      return [U.clamp(p[0], 12, 44), -1.5];
    }
    return [U.clamp(p[0], 1.5, 44), U.clamp(p[1], 2, 48)];
  }
  /** a point on a polyline at a share s of its length */
  function along(pts, s) {
    if (pts.length < 2) return pts[0].slice();
    let L = 0;
    for (let i = 1; i < pts.length; i++) L += dist(pts[i - 1], pts[i]);
    let d = U.clamp(s, 0, 1) * L;
    for (let i = 1; i < pts.length; i++) {
      const l = dist(pts[i - 1], pts[i]);
      if (d <= l || i === pts.length - 1) { const t = l ? Math.min(1, d / l) : 1; return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t]; }
      d -= l;
    }
    return pts[pts.length - 1].slice();
  }
  /** a curve from a through w to b (a quadratic through w at its middle) */
  function curveVia(a, w, b) {
    const c = [2 * w[0] - (a[0] + b[0]) / 2, 2 * w[1] - (a[1] + b[1]) / 2], out = [];
    for (let i = 0; i <= 14; i++) { const t = i / 14, m = 1 - t; out.push([m * m * a[0] + 2 * m * t * c[0] + t * t * b[0], m * m * a[1] + 2 * m * t * c[1] + t * t * b[1]]); }
    return out;
  }
  /** the man coming off a screen rubs past the screener, on the side away from where the screener came from */
  function rubPoint(sp, from, to, sFrom) {
    const dx = to[0] - from[0], dy = to[1] - from[1], L = Math.hypot(dx, dy) || 1;
    let nx = -dy / L, ny = dx / L;
    if ((sFrom[0] - sp[0]) * nx + (sFrom[1] - sp[1]) * ny > 0) { nx = -nx; ny = -ny; }
    return [sp[0] + nx * 1.4, sp[1] + ny * 1.4];
  }
  /** a toward-the-rim run of length len from p */
  function rimward(p, len) {
    const dx = RIM[0] - p[0], dy = RIM[1] - p[1], L = Math.hypot(dx, dy) || 1, l = Math.max(0, Math.min(len, L - 2.5));
    return [p[0] + dx / L * l, p[1] + dy / L * l];
  }
  /** the polyline cut short at its start and end (circles around the players) */
  function trim(pts, a, b) {
    let out = pts.map((p) => p.slice());
    const cut = (arr, d) => {
      while (arr.length > 1 && d > 0) {
        const l = dist(arr[0], arr[1]);
        if (l > d) { const t = d / l; arr[0] = [arr[0][0] + (arr[1][0] - arr[0][0]) * t, arr[0][1] + (arr[1][1] - arr[0][1]) * t]; return arr; }
        d -= l; arr.shift();
      }
      return arr;
    };
    out = cut(out, a);
    out = cut(out.reverse(), b).reverse();
    return out;
  }
  /**
   * The drawing of each step: the lines of its actions in the order they were drawn, where each player is as they go
   * (a screener at the screen, a man coming off one rubs past it), and the ball's route. lines: { k, i (the action's
   * index in the step), t (cut, roll, dribble, screen, pass, handoff, drive, post), pts, bar (a screen's T) }.
   */
  function geometry(def) {
    const tr = PB().traceCustom(def);
    const steps = tr.steps.map((st) => {
      const where = Object.assign({}, st.from), lines = [], scr = {};
      const moveOf = {};
      for (const a of st.acts) if (a.t === 'move' || a.t === 'dribble') moveOf[a.p] = a;
      for (const a of st.acts) {
        if (a.t === 'screen') {
          const um = moveOf[a.on];
          const sp = PB().screenSpot(where[a.p], where[a.on], um ? st.to[a.on] : null, a.ball);
          const s0 = where[a.p];
          const dx = sp[0] - s0[0], dy = sp[1] - s0[1], L = Math.hypot(dx, dy);
          const ux = L > 0.5 ? dx / L : (where[a.on][0] - sp[0]) / (dist(where[a.on], sp) || 1), uy = L > 0.5 ? dy / L : (where[a.on][1] - sp[1]) / (dist(where[a.on], sp) || 1);
          lines.push({ k: st.k, i: a.i, t: 'screen', p: a.p, pts: [s0, sp], bar: [[sp[0] - uy * 1.3, sp[1] + ux * 1.3], [sp[0] + uy * 1.3, sp[1] - ux * 1.3]] });
          scr[a.on] = { sp, s0, ball: a.ball };
          where[a.p] = sp;
        } else if (a.t === 'move' || a.t === 'dribble') {
          const from = where[a.p], to = st.to[a.p];
          const sc = scr[a.p];
          const pts = sc && dist(from, to) > 3 ? curveVia(from, rubPoint(sc.sp, from, to, sc.s0), to) : [from, to];
          lines.push({ k: st.k, i: a.i, t: a.t === 'dribble' ? 'dribble' : where[a.p] !== st.from[a.p] ? 'roll' : 'cut', p: a.p, pts });
          where[a.p] = to;
        } else if (a.t === 'pass' || a.t === 'handoff') {
          lines.push({ k: st.k, i: a.i, t: a.t, p: a.p, to: a.to, pts: [where[a.p], where[a.to]] });
        } else if (a.t === 'drive' || a.t === 'post') {
          const from = where[a.p], sc = scr[a.p];
          const end = rimward(from, a.t === 'drive' ? 12 : 4.5);
          const pts = a.t === 'drive' && sc && sc.ball && dist(from, st.from[a.p]) < 0.5 ? curveVia(from, rubPoint(sc.sp, from, end, sc.s0), end) : [from, end];
          lines.push({ k: st.k, i: a.i, t: a.t, p: a.p, pts });
          where[a.p] = end;
        }
      }
      return { st, lines, end: where };
    });
    return { tr, steps };
  }

  // ------------------------------------------------------------ drawing
  const f1 = (x) => (Math.round(x * 100) / 100).toString();
  const P = (p) => f1(p[1]) + ',' + f1(p[0]); // (x = v, y = u)
  function arrowHead(pts, col, size) {
    const n = pts.length;
    if (n < 2) return '';
    const b = pts[n - 1];
    let a = pts[n - 2];
    for (let i = n - 2; i >= 0 && dist(a, b) < 0.4; i--) a = pts[i];
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
    const l = 1.25 * size, w = 0.62 * size;
    const p1 = [b[0] - ux * l - uy * w, b[1] - uy * l + ux * w], p2 = [b[0] - ux * l + uy * w, b[1] - uy * l - ux * w];
    return `<polygon points="${P(b)} ${P(p1)} ${P(p2)}" fill="${col}"/>`;
  }
  /** a zig-zag along the path (a dribble), straight for its last stretch */
  function zigzag(pts, amp) {
    let L = 0;
    for (let i = 1; i < pts.length; i++) L += dist(pts[i - 1], pts[i]);
    if (L < 2.5) return pts;
    const out = [pts[0]], n = Math.max(3, Math.floor((L - 1.6) / 0.85));
    for (let j = 1; j <= n; j++) {
      const s = (j / n) * (L - 1.6) / L, p = along(pts, s), q = along(pts, Math.min(1, s + 0.02));
      const dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1, side = j === n ? 0 : j % 2 ? 1 : -1;
      out.push([p[0] - dy / l * amp * side, p[1] + dx / l * amp * side]);
    }
    out.push(pts[pts.length - 1]);
    return out;
  }
  function lineSvg(l, col, o) {
    const sw = o.sw, rr = o.r + 0.25;
    const q = [];
    const poly = (pts, dash) => `<polyline points="${pts.map(P).join(' ')}" fill="none" stroke="${col}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
    if (l.t === 'screen') {
      const pts = trim(l.pts, rr, 0);
      if (pts.length > 1 && dist(pts[0], pts[pts.length - 1]) > 0.4) q.push(poly(pts));
      q.push(`<line x1="${f1(l.bar[0][1])}" y1="${f1(l.bar[0][0])}" x2="${f1(l.bar[1][1])}" y2="${f1(l.bar[1][0])}" stroke="${col}" stroke-width="${sw * 2.1}" stroke-linecap="round"/>`);
    } else if (l.t === 'pass' || l.t === 'handoff') {
      const pts = trim(l.pts, rr, rr + (o.ghost ? 0 : 0.1));
      if (pts.length < 2) return '';
      q.push(poly(pts, l.t === 'pass' ? `${f1(sw * 3.2)},${f1(sw * 2.6)}` : ''));
      if (l.t === 'handoff') {
        // (a hand-off: two hash marks across the line)
        const m = along(pts, 0.5), m2 = along(pts, 0.56), dx = m2[0] - m[0], dy = m2[1] - m[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
        for (const s of [-0.45, 0.45]) { const c = [m[0] + ux * s, m[1] + uy * s]; q.push(`<line x1="${f1(c[1] - ux * 1.1)}" y1="${f1(c[0] + uy * 1.1)}" x2="${f1(c[1] + ux * 1.1)}" y2="${f1(c[0] - uy * 1.1)}" stroke="${col}" stroke-width="${sw * 1.2}" stroke-linecap="round"/>`); }
      }
      q.push(arrowHead(pts, col, o.ah));
    } else {
      let pts = trim(l.pts, l.t === 'roll' ? 0.2 : rr, o.ghost && (l.t === 'cut' || l.t === 'roll' || l.t === 'dribble') ? rr : 0.1);
      if (pts.length < 2 || dist(pts[0], pts[pts.length - 1]) < 0.3) return '';
      if (l.t === 'dribble' || l.t === 'drive' || l.t === 'post') pts = zigzag(pts, l.t === 'post' ? 0.5 : 0.6);
      q.push(poly(pts));
      q.push(arrowHead(pts, col, o.ah));
    }
    return q.join('');
  }
  /** the half court, baseline at the top (x = v, y = u) */
  function courtSvg(o) {
    const L = o.line, w = o.lw;
    const s = (d, extra) => `<path d="${d}" fill="none" stroke="${L}" stroke-width="${w}"${extra || ''}/>`;
    return [
      `<rect x="17" y="0" width="16" height="19" fill="${o.paint}" stroke="${L}" stroke-width="${w}"/>`,
      s('M 0 0 L 50 0'), s('M 0 0 L 0 47 L 50 47 L 50 0'),
      s('M 3 0 L 3 14 A 23.75 23.75 0 0 0 47 14 L 47 0'),
      s('M 19 19 A 6 6 0 0 0 31 19'), s('M 19 19 A 6 6 0 0 1 31 19', ` stroke-dasharray="${f1(w * 4)},${f1(w * 4)}"`),
      s('M 21 5.25 A 4 4 0 0 0 29 5.25'), s('M 19 47 A 6 6 0 0 1 31 47'),
      `<line x1="22" y1="4" x2="28" y2="4" stroke="${o.board}" stroke-width="${w * 1.6}"/>`,
      `<circle cx="25" cy="5.25" r="0.75" fill="none" stroke="#e8590c" stroke-width="${w * 1.3}"/>`,
    ].join('');
  }
  function playerSvg(k, p, o, n) {
    const r = o.r;
    const cls = o.cls ? ` class="${o.cls}"` : '';
    const ring = o.ghost ? ` stroke-dasharray="${f1(r * 0.5)},${f1(r * 0.35)}"` : '';
    return `<g${cls} data-pk="${k}"><circle cx="${f1(p[1])}" cy="${f1(p[0])}" r="${r}" fill="${o.fill}" stroke="${o.hi ? o.hiCol : o.ghost ? o.ghostCol : o.stroke}" stroke-width="${o.hi ? o.sw * 1.6 : o.sw}"${ring}/>` +
      `<text x="${f1(p[1])}" y="${f1(p[0] + r * 0.45)}" text-anchor="middle" font-size="${f1(r * 1.25)}" font-weight="800" fill="${o.ghost ? o.ghostCol : o.text}" font-family="var(--font-display), Arial, sans-serif">${n}</text></g>`;
  }
  function ballSvg(p, o) {
    const c = [p[0] - o.r * 0.78, p[1] + o.r * 0.78], r = o.r * 0.46;
    return `<g class="pd-ball"><circle cx="${f1(c[1])}" cy="${f1(c[0])}" r="${f1(r)}" fill="#f76707" stroke="#5c2b0a" stroke-width="${f1(r * 0.22)}"/>` +
      `<path d="M ${f1(c[1] - r)} ${f1(c[0])} L ${f1(c[1] + r)} ${f1(c[0])} M ${f1(c[1])} ${f1(c[0] - r)} L ${f1(c[1])} ${f1(c[0] + r)}" stroke="#5c2b0a" stroke-width="${f1(r * 0.16)}"/></g>`;
  }
  /** a defender (X) between a player and the rim */
  function defenderSvg(p, o, inbK) {
    let d;
    if (inbK) d = p[0] < 0 ? [1.9, p[1]] : [p[0], 1.9];
    else { const dx = RIM[0] - p[0], dy = RIM[1] - p[1], L = Math.hypot(dx, dy) || 1, g = Math.min(3.4, L * 0.35); d = [p[0] + dx / L * g, p[1] + dy / L * g]; }
    const s = 0.95;
    return `<path d="M ${f1(d[1] - s)} ${f1(d[0] - s)} L ${f1(d[1] + s)} ${f1(d[0] + s)} M ${f1(d[1] + s)} ${f1(d[0] - s)} L ${f1(d[1] - s)} ${f1(d[0] + s)}" stroke="${o.xCol}" stroke-width="${o.sw * 1.1}" stroke-linecap="round"/>`;
  }
  const THEME = {
    board: { bg: '#fbfbf7', line: '#98a2b3', lw: 0.2, paint: 'rgba(24, 100, 171, 0.045)', board: '#495057', ink: INK, fill: '#ffffff', stroke: '#1d2433', text: '#1d2433', hiCol: '#f76707', ghostCol: '#868e96', xCol: 'rgba(201, 42, 42, 0.55)', sw: 0.3, r: 1.55, ah: 0.95 },
    dark: { bg: '#161b24', line: '#3a4558', lw: 0.32, paint: 'rgba(255,255,255,0.025)', board: '#5c677d', ink: DARK, fill: '#0b0e14', stroke: '#dee2e6', text: '#f1f3f5', hiCol: '#ffd43b', ring: '#ffd43b', ghostCol: '#868e96', xCol: 'rgba(255, 107, 107, 0.6)', sw: 0.6, r: 1.9, ah: 1.2 },
  };
  /**
   * The drawn play as SVG content (feet: x = v, y = u). o: { theme, step (-1: all steps at full color), ghosts (the
   * end spots of the selected step's moves), prev (earlier steps faded), showX, hi (a player to highlight) }.
   */
  function drawSvg(def, o) {
    const th = THEME[o.theme || 'dark'];
    const G = o.geo || geometry(def), tr = G.tr, keys = tr.keys;
    const num = (k) => keys.indexOf(k) + 1;
    const out = [courtSvg(th)];
    const step = o.step == null ? -1 : o.step;
    const lo = { sw: th.sw, r: th.r, ah: th.ah, ghost: !!o.ghosts };
    G.steps.forEach((s, k) => {
      let op = 1;
      if (step >= 0) { if (k > step) return; if (k < step) { if (!o.prev) return; op = 0.2; } }
      else if (o.faint) op = o.faint;
      const col = th.ink[k % th.ink.length];
      out.push(`<g opacity="${op}" data-sk="${k}">${s.lines.map((l) => lineSvg(l, col, lo)).join('')}</g>`);
    });
    // where the players are: at the start of the selected step (the setup: where they line up)
    const at = step >= 0 && G.steps[step] ? G.steps[step].st.from : (() => { const a = {}; for (const k of keys) a[k] = clampSpot(def, k, def.players[k].at); return a; })();
    const holder = step >= 0 && G.steps[step] ? G.steps[step].st.hStart : (def.ball && def.players[def.ball] ? def.ball : keys[0]);
    if (o.showX) out.push(`<g class="pd-x">${keys.map((k) => defenderSvg(at[k], th, isInb(def) && k === def.ball)).join('')}</g>`);
    if (o.ghosts && step >= 0 && G.steps[step]) {
      const st = G.steps[step].st;
      for (const k of keys) if (dist(st.from[k], st.to[k]) > 0.5) out.push(playerSvg(k, st.to[k], Object.assign({}, th, { ghost: true, cls: 'pd-ghost' }), num(k)));
    }
    const ring = th.ring;
    for (const k of keys) out.push(playerSvg(k, at[k], Object.assign({}, th, { hi: o.hi === k || (ring && k === holder), hiCol: ring && k === holder ? ring : th.hiCol, cls: 'pd-pl' }), num(k)));
    if (holder && at[holder] && !o.noBall && !ring) out.push(ballSvg(at[holder], th));
    return out.join('');
  }
  /** the view box around what is drawn (the court near the basket, down to the deepest spot) */
  function viewBox(def, G, pad) {
    let maxU = 30;
    for (const k of G.tr.keys) maxU = Math.max(maxU, clampSpot(def, k, def.players[k].at)[0]);
    for (const s of G.steps) for (const k in s.st.to) maxU = Math.max(maxU, s.st.to[k][0]);
    const y1 = Math.min(48, maxU + pad + 1.5);
    return [-3, -3, 56, y1 + 3];
  }
  /** a small diagram of a drawn play (the Playbook page, the huddle), in the app's dark diagram style */
  UI.customPlayDiagram = function (def, w) {
    let G;
    try { G = geometry(def); } catch (e) { return ''; }
    const vb = viewBox(def, G, 1);
    const h = Math.round(w * vb[3] / vb[2]);
    return `<svg class="pb-dia" viewBox="${vb.join(' ')}" width="${w}" height="${h}"><rect x="${vb[0]}" y="${vb[1]}" width="${vb[2]}" height="${vb[3]}" rx="1.6" fill="#161b24"/>${drawSvg(def, { theme: 'dark', geo: G })}</svg>`;
  };
  UI.playDrawing = { geometry, clampSpot, along, INK, DARK };

  // ------------------------------------------------------------ the preview (the play in motion on the whiteboard)
  const EV_F = { drive: 0.3, post: 0.3, pass: 0.45, handoff: 0.6, screen: 0.6 };
  /** the play's timeline: for each step its length and, for each player, where they go and when; the ball's route */
  function motion(def) {
    const G = geometry(def), tr = G.tr, keys = tr.keys;
    let comp = null;
    try { const r = PB().compileCustom(def); comp = r.play || null; } catch (e) { comp = null; }
    const steps = G.steps.map((s, k) => {
      const st = s.st, acts = st.acts;
      const evs = acts.filter((a) => EV_F[a.t] != null);
      const fOf = new Map();
      evs.forEach((a, j) => fOf.set(a, evs.length > 1 ? 0.2 + 0.65 * j / (evs.length - 1) : EV_F[a.t]));
      const segs = {}, ball = [];
      for (const kk of keys) segs[kk] = [];
      const lineOf = (a) => s.lines.find((l) => l.i === a.i);
      acts.forEach((a, idx) => {
        const l = lineOf(a) || { pts: [st.from[a.p], st.to[a.p]] };
        if (a.t === 'screen') {
          const f = fOf.get(a);
          segs[a.p].push({ t0: Math.max(0, f - 0.35), t1: f, pts: l.pts, hold: f + 0.08 });
          // (without a roll or pop drawn, the screener goes back to their spot)
          if (!acts.some((b) => (b.t === 'move' || b.t === 'dribble') && b.p === a.p)) segs[a.p].push({ t0: Math.min(0.95, f + 0.12), t1: Math.min(1, f + 0.45), to: st.to[a.p] });
        } else if (a.t === 'move' || a.t === 'dribble') {
          let t0 = 0, t1 = 1;
          const before = acts.slice(0, idx), after = acts.slice(idx + 1);
          const gave = before.filter((b) => (b.t === 'pass' || b.t === 'handoff' || b.t === 'screen') && b.p === a.p).pop();
          if (gave) t0 = fOf.get(gave) + 0.05;
          const offScr = before.filter((b) => b.t === 'screen' && b.on === a.p).pop();
          if (offScr) t0 = Math.max(t0, fOf.get(offScr) - (offScr.ball ? 0 : 0.12));
          const got = before.filter((b) => (b.t === 'pass' || b.t === 'handoff') && b.to === a.p).pop();
          if (got) t0 = Math.max(t0, fOf.get(got) + 0.05);
          const recv = after.find((b) => (b.t === 'pass' || b.t === 'handoff') && b.to === a.p);
          if (recv) t1 = fOf.get(recv);
          const next = after.find((b) => b.p === a.p && EV_F[b.t] != null);
          if (next && !recv) t1 = Math.min(t1, fOf.get(next));
          if (t1 < t0 + 0.12) t1 = Math.min(1, t0 + 0.3);
          segs[a.p].push({ t0, t1, pts: l.pts });
        } else if (a.t === 'drive' || a.t === 'post') {
          const f = fOf.get(a);
          segs[a.p].push({ t0: f, t1: Math.min(1, f + (a.t === 'drive' ? 0.35 : 0.3)), pts: l.pts });
        } else if (a.t === 'pass' || a.t === 'handoff') {
          ball.push({ f: fOf.get(a), from: a.p, to: a.to, w: a.t === 'pass' ? 0.07 : 0.04 });
        }
      });
      for (const kk of keys) segs[kk].sort((x, y) => x.t0 - y.t0);
      const d = comp && comp.steps[k] ? comp.steps[k].d : 1.4;
      return { k, d: Math.max(1.1, d * 1.25), segs, ball, st };
    });
    // the inbound pass at the end: to the first look (the read with the most weight)
    let inbTo = null;
    if (tr.inbK && comp) {
      const o = comp.opts.slice().sort((a, b) => b.w - a.w)[0];
      const who = o && (Array.isArray(o.who) ? o.who[0] : o.who);
      inbTo = who === 'inb' ? null : who;
    }
    return { G, keys, steps, inbTo, tr };
  }
  /** one step of the preview at share ff of it, from the start spots */
  function runStep(s, start, ff) {
    const pos = {};
    for (const kk in start) {
      let p = start[kk];
      for (const sg of s.segs[kk] || []) {
        if (ff <= sg.t0) break;
        const tt = Math.min(1, (ff - sg.t0) / Math.max(0.01, sg.t1 - sg.t0));
        const pts = sg.pts ? [p].concat(sg.pts.slice(1)) : [p, sg.to];
        if (tt < 1) { p = along(pts, tt); break; }
        p = pts[pts.length - 1];
      }
      pos[kk] = p;
    }
    let holder = s.st.hStart, ballAt = null;
    for (const b of s.ball) {
      if (ff < b.f - b.w) break;
      if (ff <= b.f + b.w) {
        const tt = (ff - (b.f - b.w)) / (2 * b.w), a = pos[b.from], c = pos[b.to];
        ballAt = [a[0] + (c[0] - a[0]) * tt, a[1] + (c[1] - a[1]) * tt];
        break;
      }
      holder = b.to;
    }
    return { pos, holder, ballAt };
  }
  const PRE = 0.6, GAP = 0.25;
  /** positions and the ball at time t of the preview (k: the step on, -1 before or after the steps) */
  function frameAt(M, def, t) {
    let start = {};
    for (const kk of M.keys) start[kk] = clampSpot(def, kk, def.players[kk].at);
    let R = { pos: start, holder: M.tr.steps.length ? M.tr.steps[0].hStart : def.ball, ballAt: null };
    if (t < PRE) return Object.assign(R, { k: -1, done: false });
    let acc = PRE;
    for (const s of M.steps) {
      if (t < acc + s.d) return Object.assign(runStep(s, start, (t - acc) / s.d), { k: s.k, done: false });
      R = runStep(s, start, 1);
      start = R.pos;
      acc += s.d;
      if (t < acc + GAP) return Object.assign(R, { k: s.k, done: false });
      acc += GAP;
    }
    // after the last step: the throw-in of an inbound play to its first look, then a moment to see it
    let holder = R.holder, ballAt = null;
    if (M.inbTo && R.pos[M.inbTo] && R.pos[def.ball]) {
      const tt = U.clamp((t - acc) / 0.45, 0, 1), a = R.pos[def.ball], c = R.pos[M.inbTo];
      if (tt < 1) ballAt = [a[0] + (c[0] - a[0]) * tt, a[1] + (c[1] - a[1]) * tt]; else holder = M.inbTo;
    }
    return { pos: R.pos, holder, ballAt, k: -1, done: t > acc + 1.4 };
  }

  // ------------------------------------------------------------ the editor
  let ed = null;
  const deepCopy = (x) => JSON.parse(JSON.stringify(x));
  function blankDef(S, kind, setKey) {
    const set = (SETS[kind] || SETS.half).find((s) => s[0] === setKey) || SETS[kind || 'half'][0];
    const players = {};
    let ball = 'p1';
    for (const k of KEYS) { const x = set[2][k]; players[k] = { role: x[0], at: x[1].slice() }; if (x[0] === 'inbounder') ball = k; }
    return { id: PB().newCustomId(S), name: '', desc: '', kind: kind || 'half', family: kind && kind !== 'half' ? kind : 'auto', tags: kind && kind !== 'half' ? [] : ['ato'], players, ball, steps: [{ acts: [] }], reads: {}, seq: 0 };
  }
  function startEditor(S, params) {
    const have = (S.customPlays || {})[params.id];
    let def, isNew = false;
    if (have) def = deepCopy(have);
    else if (params.from && PB().get(params.from)) { def = PB().defFromPlay(PB().get(params.from), PB().newCustomId(S)); isNew = true; }
    else { def = blankDef(S, params.kind || 'half'); isNew = true; }
    if (params.copy) { def.id = PB().newCustomId(S); def.name = (def.name + ' (copy)').slice(0, 40); isNew = true; }
    if (!def.steps || !def.steps.length) def.steps = [{ acts: [] }];
    if (def.seq == null) def.seq = 0;
    for (const st of def.steps) for (const a of st.acts || []) if (!a.id) a.id = 'a' + (++def.seq);
    const book = PB().ensure(S, S.userTid);
    return {
      def, isNew, step: have || params.from ? -1 : 0, tool: 'draw', undo: [], redo: [], saved: JSON.stringify(def),
      showX: true, showPrev: true, inBook: isNew ? true : book.off.includes(def.id), anim: null, hi: null,
    };
  }
  const dirty = () => ed && JSON.stringify(ed.def) !== ed.saved;

  UI.register('playdesigner', {
    title: 'Play Designer', navKey: 'playbook',
    render(root, params) {
      const S = UI.S;
      if (!params._ed || ed !== params._ed) {
        // (a draft left unsaved is picked up again when the coach comes back to the same play)
        const same = ed && dirty() && !params.fresh && !params.copy && !params.from && (params.id ? !ed.isNew && ed.def.id === params.id : ed.isNew);
        if (same) UI.toast('Picking up your unsaved changes where you left them', 'info');
        else ed = startEditor(S, params);
        params._ed = ed;
      }
      root.innerHTML = `<div class="page pd">
        <div class="page-h"><div><h1>Play designer</h1><div class="sub">Draw it on the whiteboard step by step, give each spot a role, pick the reads, save it to your playbook</div></div>
          <div class="actions"><button class="btn" data-act="back">‹ Playbook</button><button class="btn" data-act="new">＋ New play</button><button class="btn primary" data-act="save">💾 Save play</button></div></div>
        <div class="pd-grid">
          <div class="pd-main">
            <div class="card"><div class="card-b pd-bar">
              <div class="pd-steps" data-part="steps"></div>
              <div class="pd-toolrow"><div class="pd-tools" data-part="tools"></div><div class="pd-under" data-part="under"></div></div>
              <div class="pd-hint small muted" data-part="hint"></div>
              <div class="pd-boardwrap"><svg class="pd-board" data-board viewBox="-5 -5 60 50" preserveAspectRatio="xMidYMin meet"></svg></div>
              <div class="pd-stepinfo" data-part="stepinfo"></div>
            </div></div>
          </div>
          <div class="pd-side">
            <div class="card"><div class="card-h"><h3>The play</h3></div><div class="card-b" data-part="info"></div></div>
            <div class="card"><div class="card-h"><h3>Players and roles</h3></div><div class="card-b" data-part="roles"></div></div>
            <div class="card"><div class="card-h"><h3>Reads</h3><div class="actions"><span class="tiny muted" data-part="nreads"></span></div></div><div class="card-b" data-part="reads"></div></div>
            <div class="card"><div class="card-h"><h3>Save</h3></div><div class="card-b" data-part="save"></div></div>
          </div>
        </div></div>`;
      wire(root);
      paint(root, 'all');
    },
    onLeave() { stopAnim(); },
  });

  /** the coach's shortcut: open the designer (a new play, a play to edit, or a library play to start from) */
  UI.designPlay = function (o) { UI.go('playdesigner', Object.assign({ fresh: !!(o && o.fresh) }, o || {})); };

  // ------------------------------------------------------------ painting
  function paint(root, what) {
    const all = what === 'all', w = new Set(String(what).split(' '));
    const on = (k) => all || w.has(k);
    const $ = (k) => root.querySelector(`[data-part="${k}"]`);
    const G = geometry(ed.def);
    if (on('steps')) $('steps').innerHTML = stepsHtml();
    if (on('tools') || on('hint')) { $('tools').innerHTML = toolsHtml(); $('hint').innerHTML = hintHtml(); }
    if (on('board')) paintBoard(root, G);
    if (on('under')) $('under').innerHTML = underHtml();
    if (on('stepinfo')) $('stepinfo').innerHTML = stepInfoHtml(G);
    if (on('info')) $('info').innerHTML = infoHtml();
    if (on('roles')) $('roles').innerHTML = rolesHtml();
    if (on('reads')) { $('reads').innerHTML = readsHtml(); $('nreads').textContent = readsCount(); }
    if (on('save')) $('save').innerHTML = saveHtml();
  }
  function paintBoard(root, G) {
    const svg = root.querySelector('[data-board]');
    if (!svg) return;
    const def = ed.def;
    const th = THEME.board;
    const bg = `<rect x="-5" y="-5" width="60" height="50" rx="1.2" fill="${th.bg}"/><rect x="-4.6" y="-4.6" width="59.2" height="49.2" rx="1" fill="none" stroke="#dde1e7" stroke-width="0.25"/>`;
    if (ed.anim) { svg.innerHTML = bg + drawSvg(def, { theme: 'board', geo: G, step: -1, faint: 0.28, showX: false, noBall: true }) + '<g data-anim></g>'; return; }
    svg.innerHTML = bg + drawSvg(def, { theme: 'board', geo: G, step: ed.step, ghosts: ed.step >= 0, prev: ed.showPrev, showX: ed.showX, hi: ed.hi, faint: ed.step < 0 ? 0.55 : null }) + '<g data-rb></g>';
  }
  function stepsHtml() {
    const n = ed.def.steps.length;
    const chip = (k, label) => `<button class="pd-step ${ed.step === k ? 'on' : ''} ${ed.anim && ed.anim.k === k ? 'play' : ''}" data-step="${k}" ${k >= 0 ? `style="--ink:${INK[k % INK.length]}"` : ''}>${label}</button>`;
    return `${chip(-1, '🧍 Start')}${ed.def.steps.map((st, k) => chip(k, `Step ${k + 1}${st.acts && st.acts.length ? '' : ' <span class="tiny">·empty</span>'}`)).join('')}
      ${n < 5 ? '<button class="pd-step add" data-act="addstep">＋ Step</button>' : ''}
      <span class="pd-sp"></span>
      <button class="btn sm ${ed.undo.length ? '' : 'disabled'}" data-act="undo" title="Undo (Ctrl+Z)">↶</button><button class="btn sm ${ed.redo.length ? '' : 'disabled'}" data-act="redo" title="Redo (Ctrl+Y)">↷</button>
      <button class="btn sm ${ed.anim ? 'primary' : ''}" data-act="preview">${ed.anim ? '■ Stop' : '▶ Run it'}</button>`;
  }
  function toolsHtml() {
    if (ed.step < 0) {
      const sets = SETS[ed.def.kind] || SETS.half;
      const lib = Object.values(PB().PLAYS).filter((p) => !p.custom && (isInb(ed.def) ? p.family === ed.def.kind : !p.inbound));
      return `<span class="small muted">Set:</span>${sets.map((s) => `<button class="chip" data-set="${s[0]}">${s[1]}</button>`).join('')}
        <select class="inp pd-lib" data-lib><option value="">Start from a play in the library…</option>${lib.map((p) => `<option value="${p.id}">${U.esc(p.name)}</option>`).join('')}</select>`;
    }
    const inb = isInb(ed.def);
    return TOOLS.filter((t) => !inb || INB_TOOLS[t[0]]).map((t) => `<button class="pd-tool ${ed.tool === t[0] ? 'on' : ''}" data-tool="${t[0]}" title="${U.esc(t[3])}"><span class="pd-ti">${t[1]}</span>${t[2]}</button>`).join('');
  }
  function hintHtml() {
    if (ed.anim) return 'The play runs step by step: the players, the screens and the ball.';
    if (ed.step < 0) return isInb(ed.def)
      ? 'Drag the players to where they line up. The inbounder stays out of bounds; tap a player in the list to give them the ball.'
      : 'Drag the players to where they line up, or start from a set. The ball starts with the player marked 🏀 in the list.';
    const t = TOOLS.find((x) => x[0] === ed.tool);
    const inb = isInb(ed.def) ? ' In an inbound play the reads decide where the throw-in goes: draw the cuts and screens that get players open.' : '';
    return (t ? t[3] : '') + ' Drag the end of a line to change it.' + inb;
  }
  function underHtml() {
    return `<label class="chk small" title="Draw a defender for each player"><input type="checkbox" data-opt="showX" ${ed.showX ? 'checked' : ''}> X's</label>
      <label class="chk small" title="Show the lines of the earlier steps, faded"><input type="checkbox" data-opt="showPrev" ${ed.showPrev ? 'checked' : ''}> Earlier steps</label>`;
  }
  const ACT_ICON = { move: '➜', dribble: '〰', screen: '⊥', pass: '⇢', handoff: '⇉', drive: '⚡', post: '⤓' };
  function actText(a, keys, st) {
    const n = (k) => '#' + (keys.indexOf(k) + 1);
    switch (a.t) {
      case 'move': { const w = a.to ? PB().spotKind(a.to) : 'mid'; return `${n(a.p)} ${w === 'rim' ? 'cuts to the rim' : w === 'three' ? 'moves out behind the line' : w === 'post' ? 'cuts to the post' : 'moves into position'}`; }
      case 'dribble': return `${n(a.p)} dribbles ${a.to && PB().spotKind(a.to) === 'three' ? 'out behind the line' : 'over'}`;
      case 'screen': return `${n(a.p)} screens for ${n(a.on)}`;
      case 'pass': return `${n(a.p)} passes to ${n(a.to)}`;
      case 'handoff': return `${n(a.p)} hands off to ${n(a.to)}`;
      case 'drive': return `${n(a.p)} drives`;
      case 'post': return `${n(a.p)} backs down in the post`;
      default: return '';
    }
  }
  function stepInfoHtml(G) {
    const def = ed.def, keys = G.tr.keys;
    if (ed.step < 0) {
      const n = def.steps.length;
      return `<div class="pd-si-h"><b>Start</b><span class="small muted">${isInb(def) ? (def.kind === 'blob' ? 'An inbound under your basket' : 'A sideline inbound in the front court') : 'A half-court play'} · ${n} step${n > 1 ? 's' : ''}</span></div>
        <ol class="pd-steplist small">${def.steps.map((st, k) => `<li><span class="pb-dot" style="background:${INK[k % INK.length]}"></span>${U.esc((st.text && st.text.trim()) || PB().customStepText(def, st, keys))}</li>`).join('')}</ol>
        <div class="tiny muted">Pick a step above to draw it. The whole play runs in the order you draw it.</div>`;
    }
    const k = ed.step, st = def.steps[k], gs = G.steps[k];
    const skip = new Set(gs ? gs.st.skip : []);
    const auto = PB().customStepText(def, st, keys);
    const acts = (st.acts || []).map((a, i) => `<div class="pd-act ${skip.has(i) ? 'bad' : ''}"><span class="pd-ai" style="color:${INK[k % INK.length]}">${ACT_ICON[a.t] || '•'}</span>
      <span class="ellip">${U.esc(actText(a, keys, gs && gs.st))}${skip.has(i) ? ' <span class="tag bad">skipped</span> <span class="tiny muted">' + skipWhy(a, gs.st, keys) + '</span>' : ''}</span>
      <button class="btn ghost sm" data-actup="${i}" title="Earlier in the step" ${i ? '' : 'disabled'}>↑</button><button class="btn ghost sm" data-del="${i}" title="Erase">✕</button></div>`).join('');
    return `<div class="pd-si-h"><b style="color:${INK[k % INK.length]}">Step ${k + 1}</b>
        <input class="inp pd-text" data-steptext maxlength="90" placeholder="${U.esc(auto)}" value="${U.esc(st.text || '')}">
        <button class="btn ghost sm" data-act="clearstep" title="Erase every line of this step">Clear</button>
        <button class="btn ghost sm" data-act="delstep" ${def.steps.length > 1 ? '' : 'disabled'} title="Delete this step">🗑</button></div>
      <div class="pd-acts">${acts || '<div class="small muted">Nothing drawn yet in this step: pick a tool and drag a player.</div>'}</div>
      <div class="tiny muted" style="margin-top:6px">The actions happen in this order. The step's text is what your staff says in the huddle (leave it empty to write it from the drawing).</div>`;
  }
  function skipWhy(a, st, keys) {
    const n = (k) => '#' + (keys.indexOf(k) + 1);
    if (a.t === 'pass' || a.t === 'handoff' || a.t === 'drive' || a.t === 'post' || a.t === 'dribble') return n(a.p) + ' does not have the ball here';
    if ((a.t === 'move') && isInb(ed.def) && a.p === ed.def.ball) return 'the inbounder stays out of bounds';
    return 'this cannot happen here';
  }
  function infoHtml() {
    const def = ed.def;
    const fams = Object.keys(PB().FAMILY).filter((f) => f !== 'blob' && f !== 'slob');
    let autoFam = '';
    try { const r = PB().compileCustom(Object.assign({}, def, { name: def.name || 'x', family: 'auto' })); if (r.play) autoFam = PB().FAMILY[r.play.family] || ''; } catch (e) { autoFam = ''; }
    return `<label class="small muted">Name</label><input class="inp pd-in" data-f="name" maxlength="40" placeholder="Name your play" value="${U.esc(def.name || '')}">
      <label class="small muted" style="margin-top:8px;display:block">Kind</label>
      <div class="seg" data-seg="kind">${[['half', 'Half court'], ['blob', 'Under the basket'], ['slob', 'Sideline']].map(([k, l]) => `<button data-v="${k}" class="${def.kind === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      ${isInb(def) ? '' : `<label class="small muted" style="margin-top:8px;display:block">Family</label>
      <select class="inp pd-in" data-f="family"><option value="auto" ${def.family === 'auto' ? 'selected' : ''}>Auto${autoFam ? ': ' + U.esc(autoFam) : ''}</option>${fams.map((f) => `<option value="${f}" ${def.family === f ? 'selected' : ''}>${U.esc(PB().FAMILY[f])}</option>`).join('')}</select>
      <label class="small muted" style="margin-top:8px;display:block">When your staff likes to call it</label>
      <div class="pd-tags">${TAGS.map(([k, l]) => `<button class="chip ${(def.tags || []).includes(k) ? 'on' : ''}" data-tag="${k}">${l}</button>`).join('')}</div>`}
      <label class="small muted" style="margin-top:8px;display:block">What it is for (optional)</label>
      <textarea class="inp pd-in pd-desc" data-f="desc" maxlength="160" rows="2" placeholder="A quick note for your staff">${U.esc(def.desc || '')}</textarea>`;
  }
  function starters(S) {
    const t = S.teams[S.userTid];
    const roster = PBC.League.roster(S, S.userTid).filter((p) => !PBC.Player.isInjured(p));
    let five = t.rot && t.rot.starters ? t.rot.starters.map((id) => S.players[id]).filter((p) => p && p.tid === S.userTid && !PBC.Player.isInjured(p)) : [];
    if (five.length < 5) five = five.concat(U.sortBy(roster.filter((p) => !five.includes(p)), (p) => p.ovr, true)).slice(0, 5);
    return five;
  }
  function roleHint(role) {
    const pf = PB().PROFILES[role];
    if (!pf) return '';
    return 'Looks for ' + Object.keys(pf).filter((k) => pf[k] > 0).sort((a, b) => pf[b] - pf[a]).slice(0, 3).map((k) => FEAT[k] || k).join(', ');
  }
  function rolesHtml() {
    const S = UI.S, def = ed.def, inb = isInb(def);
    const five = starters(S);
    const roles = {};
    for (const k of KEYS) roles[k] = inb && k === def.ball ? 'inbounder' : def.players[k].role;
    const bf = five.length === 5 ? PB().bestFit({ roles }, five) : null;
    const names = UI.PLAY_ROLE_NAME || {};
    const opts = Object.keys(PB().PROFILES).filter((r) => r !== 'inbounder');
    let comp = null;
    try { const r = PB().compileCustom(Object.assign({}, def, { name: def.name || 'x' })); comp = r.play || null; } catch (e) { comp = null; }
    const primK = comp ? (comp.primary === 'inb' ? def.ball : comp.primary) : null;
    const rows = KEYS.map((k, i) => {
      const p = bf && bf.roles[k], f = p ? Math.round(PB().fit(p, roles[k])) : null;
      const ib = inb && k === def.ball;
      return `<div class="pd-role ${ed.hi === k ? 'hi' : ''}" data-hirow="${k}"><span class="pd-num">${i + 1}</span>
        ${ib ? '<span class="pd-inbr small">Inbounder</span>' : `<select class="inp pd-rsel" data-role="${k}" title="${U.esc(roleHint(roles[k]))}">${opts.map((r) => `<option value="${r}" ${roles[k] === r ? 'selected' : ''} title="${U.esc(roleHint(r))}">${U.esc(names[r] || r)}</option>`).join('')}</select>`}
        <button class="pd-ballbtn ${def.ball === k ? 'on' : ''}" data-ball="${k}" title="${inb ? 'The inbounder' : 'Starts with the ball'}">🏀</button>
        <span class="pd-who small ellip">${primK === k ? '<span class="pd-star" title="The play is run for this spot">★</span> ' : ''}${p ? U.esc(PBC.Player.shortName(p)) + ` <span class="tag ${f >= 72 ? 'good' : f >= 60 ? 'info' : 'bad'}">${f}</span>` : ''}</span></div>`;
    }).join('');
    const fit = bf ? Math.round(bf.fit) : null;
    const safety = inb ? `<label class="small muted" style="margin-top:8px;display:block">Safety (catches it if nothing opens and starts the offense)</label>
      <select class="inp pd-in" data-f="safety"><option value="">Auto: the player farthest from the basket</option>${KEYS.filter((k) => k !== def.ball).map((k) => `<option value="${k}" ${def.safety === k ? 'selected' : ''}>#${KEYS.indexOf(k) + 1}</option>`).join('')}</select>` : '';
    return `${rows}
      <div class="small muted" style="margin-top:8px">${primK ? `<span class="pd-star">★</span> The play is run for #${KEYS.indexOf(primK) + 1}. ` : ''}${fit != null ? `Your starters fill it at <span class="tag ${fit >= 72 ? 'good' : fit >= 60 ? 'info' : 'bad'}">fit ${fit}</span>: in games the staff puts the best player on the floor in each role.` : ''}</div>${safety}`;
  }
  function readsList() { try { return PB().customReads(ed.def); } catch (e) { return []; } }
  function readsCount() { const r = readsList(); const on = r.filter((x) => { const o = ed.def.reads && ed.def.reads[x.key]; return !o || o.on !== false; }).length; return r.length ? `${on} of ${r.length} on` : ''; }
  function readsHtml() {
    const reads = readsList(), def = ed.def;
    if (!reads.length) return `<div class="small muted">${isInb(def) ? 'Get players open: a cut to the rim, a shooter behind the line, a safety out top.' : 'Draw an action that gets someone a shot: a ball screen, an off-ball screen, a pass to a shooter or into the post, a cut, a drive.'}</div>`;
    const PRI = [['0', 'Low'], ['1', 'Normal'], ['2', 'First look']];
    return reads.map((r) => {
      const o = (def.reads && def.reads[r.key]) || {};
      const on = o.on !== false, pri = o.pri != null ? o.pri : 1;
      const col = INK[(r.at >= 0 ? r.at : 0) % INK.length];
      return `<div class="pd-read ${on ? '' : 'off'}"><label class="chk"><input type="checkbox" data-read="${U.esc(r.key)}" ${on ? 'checked' : ''}><span class="pd-ri">${READ_ICON[r.kind] || '•'}</span><span class="small">${U.esc(r.label)}</span></label>
        <span class="tiny" style="color:${col}">step ${r.at + 1}</span>
        <div class="seg pd-pri" data-pri="${U.esc(r.key)}">${PRI.map(([v, l]) => `<button data-v="${v}" class="${String(pri) === v ? 'on' : ''}" ${on ? '' : 'disabled'}>${l}</button>`).join('')}</div></div>`;
    }).join('') + '<div class="tiny muted" style="margin-top:6px">The players take a read when the defense gives it. A read before the last step counts as the play working. First look: they look for it before anything else.</div>';
  }
  function saveHtml() {
    const errs = PB().validateCustom(ed.def);
    const S = UI.S, have = !!(S.customPlays || {})[ed.def.id];
    return `${errs.length ? `<ul class="pd-errs small">${errs.map((e) => `<li>${U.esc(e)}</li>`).join('')}</ul>` : '<div class="small good-t" style="margin-bottom:6px">✓ Ready to run</div>'}
      <label class="chk small"><input type="checkbox" data-opt="inBook" ${ed.inBook ? 'checked' : ''}> In my playbook (your staff can call it, and you can call it in a timeout)</label>
      <div class="row" style="margin-top:10px"><button class="btn primary" data-act="save">💾 Save play</button>${have ? '<button class="btn" data-act="copy">Duplicate</button><button class="btn danger" data-act="delete">Delete</button>' : ''}</div>
      <div class="tiny muted" style="margin-top:6px">${dirty() ? 'Unsaved changes' : have ? 'Saved' : ''}</div>`;
  }

  // ------------------------------------------------------------ changes
  function commit(fn, parts) {
    const before = JSON.stringify(ed.def);
    fn(ed.def);
    if (JSON.stringify(ed.def) === before) return false;
    ed.undo.push(before);
    if (ed.undo.length > 80) ed.undo.shift();
    ed.redo.length = 0;
    repaint(parts);
    return true;
  }
  let rootEl = null;
  function repaint(parts) { if (rootEl && rootEl.isConnected) paint(rootEl, parts || 'all'); }
  function newAct(def, a) { a.id = 'a' + (++def.seq); return a; }
  function addAct(a) {
    const k = ed.step;
    if (k < 0) return;
    commit((def) => {
      const st = def.steps[k];
      st.acts = st.acts || [];
      // (one run and one screen per player in a step: a new one replaces the old)
      if (a.t === 'move' || a.t === 'dribble') {
        const old = st.acts.find((b) => (b.t === 'move' || b.t === 'dribble') && b.p === a.p);
        if (old) { old.t = a.t; old.to = a.to; return; }
      }
      if (a.t === 'screen') {
        const old = st.acts.find((b) => b.t === 'screen' && b.p === a.p);
        if (old) { old.on = a.on; return; }
      }
      if ((a.t === 'drive' || a.t === 'post') && st.acts.some((b) => b.t === a.t && b.p === a.p)) return;
      st.acts.push(newAct(def, a));
    });
  }
  function kindChange(kind) {
    const def = ed.def;
    if (def.kind === kind) return;
    commit((d) => {
      const wasInb = isInb(d);
      const empty = !d.steps.some((st) => st.acts && st.acts.length);
      d.kind = kind;
      if (empty) {
        const b = blankDef(UI.S, kind);
        d.players = b.players; d.ball = b.ball; d.family = b.family; d.tags = b.tags; d.safety = undefined;
        return;
      }
      if (kind === 'blob' || kind === 'slob') {
        const k = d.ball;
        d.players[k].role = 'inbounder';
        d.players[k].at = INB_SPOT[kind].slice();
        d.family = kind; d.tags = [];
        // (no dribbles, passes, drives or post-ups in an inbound play: the reads send the ball)
        for (const st of d.steps) st.acts = (st.acts || []).filter((a) => (a.t === 'move' || a.t === 'screen') && a.p !== k);
      } else if (wasInb) {
        d.players[d.ball].role = 'handler';
        d.players[d.ball].at = TOP.slice();
        d.family = 'auto'; d.safety = undefined;
      }
    });
    if (isInb(ed.def) && !INB_TOOLS[ed.tool]) { ed.tool = 'draw'; repaint('tools'); }
    UI.toast(kind === 'half' ? 'A half-court play: the inbounder is now the ball handler at the top' : 'An inbound play: the player with the ball takes it out of bounds', 'info');
  }
  function applySet(key) {
    const set = (SETS[ed.def.kind] || SETS.half).find((s) => s[0] === key);
    if (!set) return;
    commit((d) => {
      for (const k of KEYS) { const x = set[2][k]; d.players[k] = { role: x[0], at: x[1].slice() }; if (x[0] === 'inbounder') d.ball = k; }
      if (!isInb(d)) d.ball = 'p1';
    });
  }
  async function fromLibrary(id) {
    const p = PB().get(id);
    if (!p) return;
    const has = ed.def.steps.some((st) => st.acts && st.acts.length);
    if (has && !(await UI.confirm(`Start over from <b>${U.esc(p.name)}</b>? What is on the board now is replaced (you can undo it).`, { ok: 'Start from it' }))) { repaint('tools'); return; }
    commit((d) => {
      const n = PB().defFromPlay(p, d.id);
      for (const k in n) d[k] = n[k];
    });
    ed.step = -1;
    repaint();
    UI.toast(`${p.name} is on the board: change it and make it yours`, 'good');
  }

  // ------------------------------------------------------------ the board: drawing with the pointer
  function boardPt(svg, e) {
    const m = svg.getScreenCTM();
    if (!m) return [0, 0];
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const q = pt.matrixTransform(m.inverse());
    return [q.y, q.x]; // (u, v)
  }
  function shownAt(G) {
    const def = ed.def, at = {};
    if (ed.step >= 0 && G.steps[ed.step]) return G.steps[ed.step].st.from;
    for (const k of G.tr.keys) at[k] = clampSpot(def, k, def.players[k].at);
    return at;
  }
  function hitPlayer(G, p, not) {
    const at = shownAt(G);
    let best = null, bd = 2.6;
    for (const k in at) { if (k === not) continue; const d = dist(at[k], p); if (d < bd) { bd = d; best = k; } }
    return best;
  }
  function hitGhost(G, p) {
    if (ed.step < 0 || !G.steps[ed.step]) return null;
    const st = G.steps[ed.step].st;
    let best = null, bd = 2.2;
    for (const a of st.acts) {
      if (a.t !== 'move' && a.t !== 'dribble') continue;
      const d = dist(st.to[a.p], p);
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  }
  function segDist(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
    const t = L2 ? U.clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2, 0, 1) : 0;
    return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t);
  }
  function hitLine(G, p) {
    if (ed.step < 0 || !G.steps[ed.step]) return null;
    let best = null, bd = 1.6;
    for (const l of G.steps[ed.step].lines) {
      for (let i = 1; i < l.pts.length; i++) { const d = segDist(p, l.pts[i - 1], l.pts[i]); if (d < bd) { bd = d; best = l; } }
      if (l.bar) { const d = segDist(p, l.bar[0], l.bar[1]); if (d < bd) { bd = d; best = l; } }
    }
    return best;
  }
  /** what a drag from player k to point p draws with the current tool, or { why } when it draws nothing */
  function intended(G, k, p) {
    const def = ed.def, st = G.steps[ed.step] && G.steps[ed.step].st;
    if (!st) return null;
    const keys = G.tr.keys, n = (x) => '#' + (keys.indexOf(x) + 1);
    const h = st.hEnd, inb = isInb(def);
    const tgt = hitPlayer(G, p, k);
    const far = dist(st.from[k], p) >= 2;
    const toSpot = [U.round(U.clamp(p[0], 1.5, 44), 1), U.round(U.clamp(p[1], 2, 48), 1)];
    if (inb && k === def.ball) return { why: 'The inbounder stays out of bounds: the reads decide where the throw-in goes' };
    const t = ed.tool;
    if (t === 'draw') {
      if (tgt) return k === h ? (inb ? { why: 'In an inbound play the reads send the ball' } : { t: 'pass', p: k, to: tgt, label: `Pass to ${n(tgt)}` }) : { t: 'screen', p: k, on: tgt, label: `Screen for ${n(tgt)}` };
      if (!far) return null;
      return k === h && !inb ? { t: 'dribble', p: k, to: toSpot, label: 'Dribble' } : { t: 'move', p: k, to: toSpot, label: 'Cut' };
    }
    if (t === 'cut') { if (tgt || !far) return null; return k === h && !inb ? { t: 'dribble', p: k, to: toSpot, label: 'Dribble' } : { t: 'move', p: k, to: toSpot, label: 'Cut' }; }
    if (t === 'dribble') { if (k !== h) return { why: `${n(k)} does not have the ball: ${n(h)} does` }; if (!far || tgt) return null; return { t: 'dribble', p: k, to: toSpot, label: 'Dribble' }; }
    if (t === 'screen') {
      if (k === h && !inb) return { why: `${n(k)} has the ball: pass it before setting a screen` };
      if (!tgt) return { why: 'Drop the screener on the teammate they screen for' };
      return { t: 'screen', p: k, on: tgt, label: `Screen for ${n(tgt)}` };
    }
    if (t === 'pass' || t === 'handoff') {
      if (k !== h) return { why: `${n(k)} does not have the ball: ${n(h)} does` };
      if (!tgt) return { why: 'Drop it on the teammate who catches it' };
      return { t, p: k, to: tgt, label: `${t === 'pass' ? 'Pass' : 'Hand-off'} to ${n(tgt)}` };
    }
    return null;
  }
  let drag = null;
  function wire(root) {
    rootEl = root;
    const svg = root.querySelector('[data-board]');
    svg.addEventListener('pointerdown', (e) => {
      if (ed.anim) { stopAnim(); return; }
      const G = geometry(ed.def), p = boardPt(svg, e);
      if (ed.step < 0) {
        const k = hitPlayer(G, p);
        if (k) { drag = { kind: 'place', k, before: JSON.stringify(ed.def), moved: false }; ed.hi = k; svg.setPointerCapture(e.pointerId); e.preventDefault(); repaint('board roles'); }
        return;
      }
      if (ed.tool === 'erase') { const l = hitLine(G, p); if (l) delAct(l.i); return; }
      const k = hitPlayer(G, p);
      const gh = hitGhost(G, p);
      if (gh && (!k || dist(G.steps[ed.step].st.to[gh.p], p) < dist(shownAt(G)[k], p))) {
        drag = { kind: 'dest', id: gh.id, before: JSON.stringify(ed.def), moved: false };
        svg.setPointerCapture(e.pointerId); e.preventDefault();
        return;
      }
      if (!k) return;
      if (ed.tool === 'drive' || ed.tool === 'post') {
        const st = G.steps[ed.step].st;
        if (isInb(ed.def)) return;
        if (k !== st.hEnd) { UI.toast(`#${G.tr.keys.indexOf(k) + 1} does not have the ball: #${G.tr.keys.indexOf(st.hEnd) + 1} does`, 'warn'); return; }
        addAct({ t: ed.tool, p: k });
        return;
      }
      drag = { kind: 'draw', k, cur: p };
      ed.hi = k;
      svg.setPointerCapture(e.pointerId); e.preventDefault();
    });
    svg.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const p = boardPt(svg, e);
      if (drag.kind === 'place') {
        const def = ed.def;
        def.players[drag.k].at = clampSpot(def, drag.k, [U.round(p[0], 1), U.round(p[1], 1)]);
        drag.moved = true;
        paintBoard(root, geometry(def));
      } else if (drag.kind === 'dest') {
        const def = ed.def;
        for (const st of def.steps) for (const a of st.acts || []) if (a.id === drag.id) a.to = clampSpot(def, a.p, [U.round(p[0], 1), U.round(p[1], 1)]);
        drag.moved = true;
        paintBoard(root, geometry(def));
      } else {
        drag.cur = p;
        rubber(svg, geometry(ed.def));
      }
    });
    const up = (e) => {
      if (!drag) return;
      const d = drag;
      drag = null;
      try { svg.releasePointerCapture(e.pointerId); } catch (x) { /* already released */ }
      if (d.kind === 'place' || d.kind === 'dest') {
        if (d.moved && d.before !== JSON.stringify(ed.def)) { ed.undo.push(d.before); ed.redo.length = 0; }
        repaint();
        return;
      }
      if (e.type === 'pointercancel') { repaint('board'); return; }
      const G = geometry(ed.def);
      const it = intended(G, d.k, d.cur);
      if (it && it.why) UI.toast(it.why, 'warn');
      if (it && it.t) { const a = Object.assign({}, it); delete a.label; addAct(a); } else repaint('board roles');
    };
    svg.addEventListener('pointerup', up);
    svg.addEventListener('pointercancel', up);

    UI.on(root, 'click', '[data-step]', (e, el) => { stopAnim(); ed.step = +el.dataset.step; repaint(); });
    UI.on(root, 'click', '[data-tool]', (e, el) => { ed.tool = el.dataset.tool; repaint('tools'); });
    UI.on(root, 'click', '[data-set]', (e, el) => applySet(el.dataset.set));
    UI.on(root, 'change', '[data-lib]', (e, el) => { if (el.value) fromLibrary(el.value); });
    UI.on(root, 'click', '[data-act]', (e, el) => action(el.dataset.act));
    UI.on(root, 'click', '[data-del]', (e, el) => delAct(+el.dataset.del));
    UI.on(root, 'click', '[data-actup]', (e, el) => {
      const i = +el.dataset.actup;
      if (i > 0) commit((def) => { const acts = def.steps[ed.step].acts; const x = acts[i]; acts[i] = acts[i - 1]; acts[i - 1] = x; });
    });
    UI.on(root, 'change', '[data-opt]', (e, el) => { ed[el.dataset.opt] = el.checked; repaint(el.dataset.opt === 'inBook' ? 'save' : 'board'); });
    UI.on(root, 'input', '[data-steptext]', (e, el) => {
      const st = ed.def.steps[ed.step];
      if (!st) return;
      if (!ed._typing) { ed.undo.push(JSON.stringify(ed.def)); ed.redo.length = 0; ed._typing = true; }
      st.text = el.value;
      repaint('save');
    });
    UI.on(root, 'change', '[data-steptext]', () => { ed._typing = false; repaint('steps'); });
    UI.on(root, 'input', '[data-f]', (e, el) => {
      const f = el.dataset.f;
      if (f === 'name' || f === 'desc') { ed.def[f] = el.value; repaint('save'); }
    });
    UI.on(root, 'change', '[data-f]', (e, el) => {
      const f = el.dataset.f;
      if (f === 'family') commit((d) => { d.family = el.value; }, 'info roles save');
      else if (f === 'safety') commit((d) => { d.safety = el.value || undefined; }, 'reads save');
    });
    UI.on(root, 'click', '[data-seg="kind"] button', (e, el) => kindChange(el.dataset.v));
    UI.on(root, 'click', '[data-tag]', (e, el) => commit((d) => { const t = el.dataset.tag; d.tags = (d.tags || []).includes(t) ? d.tags.filter((x) => x !== t) : (d.tags || []).concat(t); }, 'info save'));
    UI.on(root, 'change', '[data-role]', (e, el) => commit((d) => { d.players[el.dataset.role].role = el.value; }, 'roles reads save'));
    UI.on(root, 'click', '[data-ball]', (e, el) => {
      const k = el.dataset.ball;
      if (ed.def.ball === k) return;
      commit((d) => {
        const was = d.ball;
        d.ball = k;
        if (isInb(d)) {
          // (the new inbounder takes the ball out; the old one comes into the court where the new one stood)
          const spot = d.players[k].at;
          d.players[was].at = spot[0] < 0 || spot[1] < 0 ? TOP.slice() : spot;
          d.players[was].role = d.players[was].role === 'inbounder' ? 'handler' : d.players[was].role;
          d.players[k].role = 'inbounder';
          d.players[k].at = INB_SPOT[d.kind].slice();
          d.safety = d.safety === k ? undefined : d.safety;
          for (const st of d.steps) st.acts = (st.acts || []).filter((a) => a.p !== k || a.t === 'screen');
        }
      });
    });
    UI.on(root, 'click', '[data-hirow]', (e, el) => { if (e.target.closest('select,button')) return; ed.hi = ed.hi === el.dataset.hirow ? null : el.dataset.hirow; repaint('board roles'); });
    UI.on(root, 'change', '[data-read]', (e, el) => commit((d) => { d.reads = d.reads || {}; const k = el.dataset.read; d.reads[k] = Object.assign({}, d.reads[k], { on: el.checked }); }, 'reads save'));
    UI.on(root, 'click', '[data-pri] button', (e, el) => commit((d) => { d.reads = d.reads || {}; const k = el.closest('[data-pri]').dataset.pri; d.reads[k] = Object.assign({}, d.reads[k], { pri: +el.dataset.v }); }, 'reads save'));
  }
  function rubber(svg, G) {
    const g = svg.querySelector('[data-rb]');
    if (!g || !drag || drag.kind !== 'draw') return;
    const st = G.steps[ed.step] && G.steps[ed.step].st;
    if (!st) return;
    const it = intended(G, drag.k, drag.cur);
    const a = st.from[drag.k];
    const tgt = hitPlayer(G, drag.cur, drag.k);
    const b = tgt ? st.from[tgt] : drag.cur;
    const col = it && it.t ? INK[ed.step % INK.length] : '#adb5bd';
    const dash = it && (it.t === 'pass' || it.t === 'handoff') ? ' stroke-dasharray="0.9,0.7"' : it && it.t ? '' : ' stroke-dasharray="0.5,0.5"';
    let h = `<line x1="${f1(a[1])}" y1="${f1(a[0])}" x2="${f1(b[1])}" y2="${f1(b[0])}" stroke="${col}" stroke-width="0.32" stroke-linecap="round"${dash} opacity="0.85"/>`;
    if (tgt) h += `<circle cx="${f1(b[1])}" cy="${f1(b[0])}" r="2.1" fill="none" stroke="${col}" stroke-width="0.25" stroke-dasharray="0.6,0.4"/>`;
    if (it && it.label) h += `<g transform="translate(${f1(drag.cur[1] + 1.2)} ${f1(drag.cur[0] - 1.6)})"><rect x="0" y="-1.5" width="${f1(it.label.length * 0.82 + 1.2)}" height="2.3" rx="0.6" fill="#1d2433" opacity="0.88"/><text x="0.6" y="0.2" font-size="1.45" fill="#fff" font-weight="700" font-family="Arial, sans-serif">${U.esc(it.label)}</text></g>`;
    g.innerHTML = h;
  }
  function delAct(i) {
    commit((def) => { const st = def.steps[ed.step]; if (st && st.acts) st.acts.splice(i, 1); });
  }
  async function action(a) {
    const S = UI.S;
    if (a === 'undo' || a === 'redo') {
      const from = a === 'undo' ? ed.undo : ed.redo, to = a === 'undo' ? ed.redo : ed.undo;
      if (!from.length) return;
      to.push(JSON.stringify(ed.def));
      ed.def = JSON.parse(from.pop());
      if (ed.step >= ed.def.steps.length) ed.step = ed.def.steps.length - 1;
      repaint();
    } else if (a === 'addstep') {
      if (ed.def.steps.length >= 5) return;
      commit((d) => { d.steps.push({ acts: [] }); });
      ed.step = ed.def.steps.length - 1;
      repaint();
    } else if (a === 'delstep') {
      if (ed.def.steps.length <= 1 || ed.step < 0) return;
      const k = ed.step;
      commit((d) => { d.steps.splice(k, 1); });
      ed.step = Math.min(k, ed.def.steps.length - 1);
      repaint();
    } else if (a === 'clearstep') {
      if (ed.step < 0) return;
      commit((d) => { d.steps[ed.step].acts = []; });
    } else if (a === 'preview') {
      if (ed.anim) stopAnim(); else startAnim();
    } else if (a === 'back') {
      if (dirty() && !(await UI.confirm('Leave the designer? Your changes to this play are not saved yet (they wait here until you come back).', { ok: 'Leave' }))) return;
      UI.go('playbook');
    } else if (a === 'new') {
      if (dirty() && !(await UI.confirm('Start a new play? The changes to this one are not saved.', { ok: 'New play', danger: true }))) return;
      ed = startEditor(S, { kind: 'half' });
      const cur = UI.current();
      if (cur.params) cur.params._ed = ed;
      repaint();
    } else if (a === 'save') save();
    else if (a === 'copy') {
      if (dirty()) { UI.toast('Save your changes first', 'warn'); return; }
      ed = startEditor(S, { id: ed.def.id, copy: true });
      const cur = UI.current();
      if (cur.params) cur.params._ed = ed;
      repaint();
      UI.toast('A copy: change it and save it as a new play', 'info');
    } else if (a === 'delete') {
      const id = ed.def.id, name = ed.def.name;
      if (!(await UI.confirm(`Delete <b>${U.esc(name)}</b>? It comes out of your playbook too.`, { ok: 'Delete', danger: true }))) return;
      deletePlay(S, id);
      ed = null;
      UI.go('playbook', { tab: 'mine' });
      UI.toast(`${name} is deleted`, 'good');
    }
  }
  /** a drawn play out of the league (and every playbook) */
  function deletePlay(S, id) {
    if (S.customPlays) delete S.customPlays[id];
    for (const t of S.teams) if (t.playbook && Array.isArray(t.playbook.off) && t.playbook.off.includes(id)) t.playbook.off = t.playbook.off.filter((x) => x !== id);
    PB().syncCustom(S);
    UI.save();
  }
  UI.deleteCustomPlay = deletePlay;
  function save() {
    const S = UI.S, def = ed.def;
    def.name = String(def.name || '').trim();
    const errs = PB().validateCustom(def);
    if (errs.length) { UI.toast(errs[0], 'bad'); repaint('save'); return; }
    const taken = Object.values(S.customPlays || {}).find((p) => p.id !== def.id && String(p.name || '').toLowerCase() === def.name.toLowerCase());
    if (taken) { UI.toast('You already have a play with that name', 'warn'); return; }
    S.customPlays = S.customPlays || {};
    const out = deepCopy(def);
    out.v = 1;
    S.customPlays[out.id] = out;
    PB().syncCustom(S);
    const book = PB().ensure(S, S.userTid);
    const inBook = book.off.includes(out.id);
    if (ed.inBook && !inBook) { book.off = book.off.concat(out.id); book.auto = false; }
    else if (!ed.inBook && inBook) { book.off = book.off.filter((x) => x !== out.id); book.auto = false; }
    ed.saved = JSON.stringify(def);
    ed.isNew = false;
    UI.save();
    repaint('save steps');
    UI.toast(`${out.name} is saved${ed.inBook ? ' and in your playbook: call it in a timeout, your staff can call it too' : ''}`, 'good');
  }

  // ------------------------------------------------------------ the preview
  function startAnim() {
    const errs = PB().validateCustom(Object.assign({}, ed.def, { name: ed.def.name || 'x' }));
    if (errs.length) { UI.toast(errs[0], 'warn'); return; }
    const M = motion(ed.def);
    ed.anim = { M, t0: performance.now(), k: -1, raf: 0 };
    repaint('steps board hint');
    const tick = () => {
      if (!ed || !ed.anim || !rootEl || !rootEl.isConnected) return;
      const t = (performance.now() - ed.anim.t0) / 1000;
      const F = frameAt(M, ed.def, t);
      const g = rootEl.querySelector('[data-anim]');
      if (g) {
        const th = THEME.board, keys = M.keys;
        let h = `<g class="pd-x">${keys.map((k) => defenderSvg(F.pos[k], th, isInb(ed.def) && k === ed.def.ball)).join('')}</g>`;
        h += keys.map((k) => playerSvg(k, F.pos[k], th, keys.indexOf(k) + 1)).join('');
        h += F.ballAt ? ballSvg([F.ballAt[0] + th.r * 0.78, F.ballAt[1] - th.r * 0.78], th) : ballSvg(F.pos[F.holder] || F.pos[keys[0]], th);
        g.innerHTML = h;
      }
      if (F.k !== ed.anim.k) { ed.anim.k = F.k; const s = rootEl.querySelector('[data-part="steps"]'); if (s) s.innerHTML = stepsHtml(); }
      if (F.done) { stopAnim(); return; }
      ed.anim.raf = requestAnimationFrame(tick);
    };
    ed.anim.raf = requestAnimationFrame(tick);
  }
  function stopAnim() {
    if (!ed || !ed.anim) return;
    cancelAnimationFrame(ed.anim.raf);
    ed.anim = null;
    repaint('steps board hint');
  }

  // keys: undo / redo, the tools, the steps
  document.addEventListener('keydown', (e) => {
    if (!ed || UI.current().key !== 'playdesigner' || !rootEl || !rootEl.isConnected) return;
    if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (document.querySelector('.modal-back')) return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); action(e.shiftKey ? 'redo' : 'undo'); return; }
    if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); action('redo'); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const hot = { d: 'draw', c: 'cut', b: 'dribble', s: 'screen', p: 'pass', h: 'handoff', v: 'drive', u: 'post', e: 'erase' };
    if (hot[k] && ed.step >= 0 && (!isInb(ed.def) || INB_TOOLS[hot[k]])) { ed.tool = hot[k]; repaint('tools'); return; }
    if (k === 'arrowright' && ed.step < ed.def.steps.length - 1) { ed.step++; repaint(); }
    else if (k === 'arrowleft' && ed.step > -1) { ed.step--; repaint(); }
    else if (k === ' ') { e.preventDefault(); action('preview'); }
  });
})();
