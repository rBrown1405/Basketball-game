/* Pro BBALL Coach — rhythm / reaction drills: 'ballhandling' (Combo Dribble), 'defense' (Slide Drill),
   'conditioning' (Suicides). Needs core, court, drills. */

// =============================================================================== COMBO DRIBBLE
(function () {
  'use strict';
  const Mini = window.PBC.Mini, U = Mini.util, C = Mini.color;
  const LANE = { L: 0, D: 1, U: 2, R: 3 }, DIRS = ['left', 'down', 'up', 'right'];
  const LCOL = ['#ff6b1a', '#29d17d', '#5aa9ff', '#b67cff'];
  const MOVES = [
    { n: 'CROSSOVER', s: 'LR' }, { n: 'STEP-BACK', s: 'DU' }, { n: 'BETWEEN THE LEGS', s: 'DL' }, { n: 'BEHIND THE BACK', s: 'DR' },
    { n: 'DOUBLE CROSS', s: 'LRL' }, { n: 'IN & OUT', s: 'RRL' }, { n: 'HESITATION', s: 'U-U' }, { n: 'SHAMGOD', s: 'RLU' },
    { n: 'SPIN MOVE', s: 'LDRU' }, { n: 'KILLER CROSS', s: 'RLDR' },
  ];
  const JUDGE = [['PERFECT', 'gold', 1], ['GREAT', 'good', 0.8], ['GOOD', 'ok', 0.5]];

  function arrow(g, cx, cy, s, lane) {
    g.save(); g.translate(cx, cy); g.rotate([-Math.PI / 2, Math.PI, 0, Math.PI / 2][lane]);
    g.beginPath();
    g.moveTo(0, -s); g.lineTo(s * 0.82, -s * 0.02); g.lineTo(s * 0.32, -s * 0.02); g.lineTo(s * 0.32, s * 0.82);
    g.lineTo(-s * 0.32, s * 0.82); g.lineTo(-s * 0.32, -s * 0.02); g.lineTo(-s * 0.82, -s * 0.02); g.closePath();
    g.restore();
  }

  Mini.registerDrill('ballhandling', {
    how: 'Arrows fall toward the targets on the beat. Hit <kbd>←</kbd> <kbd>↓</kbd> <kbd>↑</kbd> <kbd>→</kbd> (or <kbd>A</kbd> <kbd>S</kbd> <kbd>W</kbd> <kbd>D</kbd>) as each one lands to chain dribble moves. Misses and stray presses break the combo.',
    howTouch: 'Arrows fall toward the targets on the beat. <b>Tap the lane</b> as each arrow lands to chain dribble moves. Misses and stray taps break the combo.',
    start(api) {
      const T = api.theme, d = api.difficulty, sc = api.scope, me = api.player(0);
      const bpm = Math.round(96 + 30 * d), beat = 60 / bpm, travel = 1.6 - 0.35 * d, kW = 1.1 - 0.2 * d;
      const PW = 0.05 * kW, GTW = 0.1 * kW, GW = 0.15 * kW;
      const wrap = U.el('div', 'pm-rhythm');
      api.stage.appendChild(wrap);
      let geo = null;
      const cv = api.canvas(wrap, (w, h) => {
        const laneW = Math.min(82, (w * 0.86) / 4), hw = laneW * 4, side = w > 640;
        geo = { w, h, laneW, hw, hx: side ? Math.max(w * 0.58 - hw / 2, 190) : (w - hw) / 2, top: 8, ry: h - 64, side };
      });
      // ---- chart (times in seconds from song start)
      const pool = U.shuffle(MOVES), order = pool.filter(m => m.s.length <= 2).slice(0, 2).concat(U.shuffle(pool.filter(m => m.s.length > 2)), U.shuffle(pool));
      const notes = [], moves = [];
      let bp = 4, mi = 0;
      while (bp * beat < 27 && mi < order.length) {
        const M = order[mi++], step = d > 0.55 && M.s.length <= 3 && mi % 2 === 0 ? 0.5 : 1;
        const mv = { n: M.n, notes: [], failed: false, done: false };
        let b = bp;
        for (const ch of M.s) { if (ch !== '-') { const nt = { lane: LANE[ch], t: b * beat, j: null, mv }; notes.push(nt); mv.notes.push(nt); } b += step; }
        moves.push(mv);
        bp = Math.ceil(b) + 1;
      }
      const songEnd = notes[notes.length - 1].t + 1.2;
      let t0 = null, sum = 0, judged = 0, combo = 0, maxCombo = 0, strays = 0, movesDone = 0, lastBeat = -1, lastLane = 0, done = false;
      const counts = { PERFECT: 0, GREAT: 0, GOOD: 0, MISS: 0 };
      const flashes = [0, 0, 0, 0], jtxt = { text: '', tone: 'text', at: -9 };
      api.foot(api.touch ? 'Tap the lane as the arrow lands on the target' : '<kbd>←</kbd> <kbd>↓</kbd> <kbd>↑</kbd> <kbd>→</kbd> / <kbd>WASD</kbd> on the beat · <kbd>ESC</kbd> quits');
      const hud = bump => {
        api.hud('a', 'ACCURACY', judged ? Math.round(sum / judged * 100) + '%' : '—', null, bump);
        api.hud('b', 'COMBO', '×' + combo, combo >= 10 ? 'gold' : null, bump);
        api.hud('c', 'MOVES', `${movesDone}/${moves.length}`);
      };
      hud();

      function judge(nt, idx, err) {
        nt.j = JUDGE[idx][0];
        sum += JUDGE[idx][2]; judged++; combo++; maxCombo = Math.max(maxCombo, combo); counts[nt.j]++;
        flashes[nt.lane] = 1; lastLane = nt.lane;
        Object.assign(jtxt, { text: nt.j, tone: JUDGE[idx][1], at: now(), err });
        api.sfx(idx === 0 ? 'bounce' : 'step');
        const mv = nt.mv;
        if (!mv.failed && mv.notes.every(x => x.j && x.j !== 'MISS')) {
          mv.done = true; movesDone++;
          api.toast(mv.n, 'gold', `Move complete · ×${combo} combo`); api.sfx('combo');
        }
        hud(true);
      }
      function miss(nt) {
        nt.j = 'MISS'; judged++; counts.MISS++;
        if (combo >= 8) api.shake();
        combo = 0; nt.mv.failed = true;
        Object.assign(jtxt, { text: 'MISS', tone: 'bad', at: now() });
        hud(true);
      }
      const now = () => (t0 == null ? -99 : (U.now() - t0) / 1000);
      function hit(lane) {
        if (t0 == null || done) return;
        const tn = now();
        let best = null, be = 1e9;
        for (const nt of notes) {
          if (nt.j || nt.lane !== lane) continue;
          const e = tn - nt.t;
          if (Math.abs(e) <= GW && Math.abs(e) < Math.abs(be)) { best = nt; be = e; }
          if (nt.t - tn > GW) break;
        }
        flashes[lane] = Math.max(flashes[lane], 0.45); lastLane = lane;
        if (!best) {  // stray press: breaks the combo
          strays++; combo = 0;
          Object.assign(jtxt, { text: 'OFF BEAT', tone: 'warn', at: tn });
          api.sfx('tick'); hud(true);
          return;
        }
        const a = Math.abs(be);
        judge(best, a <= PW ? 0 : a <= GTW ? 1 : 2, be);
      }
      function end() {
        done = true;
        const acc = Math.max(0, (sum - strays * 0.25) / notes.length);
        const score = 100 * (0.8 * acc + 0.1 * (maxCombo / notes.length) + 0.1 * (movesDone / moves.length));
        api.finish(score, { notes: notes.length, perfect: counts.PERFECT, great: counts.GREAT, good: counts.GOOD, miss: counts.MISS, strays, maxCombo, moves: moves.length, movesDone, bpm },
          [['PERFECT', `${counts.PERFECT}/${notes.length}`], ['MAX COMBO', '×' + maxCombo], ['MOVES', `${movesDone}/${moves.length}`], ['MISSES', String(counts.MISS + strays)]]);
      }

      sc.key((e, k) => {
        const dir = U.dirOf(k);
        if (!dir) return false;
        if (!e.repeat) hit(DIRS.indexOf(dir));
        return true;
      });
      sc.on(wrap, 'pointerdown', e => {
        if ((e.pointerType === 'mouse' && e.button !== 0) || !geo) return;
        e.preventDefault();
        const p = cv.local(e), lane = Math.floor((p.x - geo.hx) / geo.laneW);
        if (lane >= 0 && lane < 4) hit(lane);
      });

      sc.loop((dt, nowMs) => {
        if (t0 == null) return;
        const tn = (nowMs - t0) / 1000;
        const bi = Math.floor(tn / beat);
        if (bi !== lastBeat && bi >= 0) { lastBeat = bi; if (bi < 4) { api.sfx(bi === 3 ? 'start' : 'tick'); } else if (!done) api.sfx('tock'); }
        for (const nt of notes) { if (!nt.j && tn - nt.t > GW) miss(nt); if (nt.t > tn) break; }
        for (let l = 0; l < 4; l++) flashes[l] = Math.max(0, flashes[l] - dt * 4);
        if (!done && tn > songEnd) end();
        render(tn);
      });
      cv.onRedraw = () => render(now());
      api.debug({ notes, beat, get t0() { return t0; } });

      function render(tn) {
        if (!geo) return;
        const g = cv.begin(), { w, h, laneW, hw, hx, ry, top } = geo;
        const bg = g.createLinearGradient(0, 0, 0, h);
        bg.addColorStop(0, '#070a12'); bg.addColorStop(1, '#101727');
        g.fillStyle = bg; g.fillRect(0, 0, w, h);
        // highway
        const hg = g.createLinearGradient(0, top, 0, ry + 40);
        hg.addColorStop(0, 'rgba(24,32,51,0.25)'); hg.addColorStop(1, 'rgba(24,32,51,0.95)');
        g.fillStyle = hg; g.fillRect(hx, top, hw, h - top);
        g.strokeStyle = 'rgba(255,255,255,0.07)'; g.lineWidth = 1;
        for (let l = 1; l < 4; l++) { g.beginPath(); g.moveTo(hx + l * laneW, top); g.lineTo(hx + l * laneW, h); g.stroke(); }
        const yOf = t => ry - (t - tn) / travel * (ry - top);
        // beat lines
        for (let b = Math.max(0, Math.floor(tn / beat)); b * beat < tn + travel; b++) {
          const y = yOf(b * beat);
          g.strokeStyle = b % 4 === 0 ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)';
          g.beginPath(); g.moveTo(hx, y); g.lineTo(hx + hw, y); g.stroke();
        }
        // combo watermark
        if (combo >= 3) {
          g.font = `900 ${Math.round(Math.min(90, hw * 0.3))}px ${Mini.court.font()}`; g.textAlign = 'center'; g.textBaseline = 'middle';
          g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillText('×' + combo, hx + hw / 2, (top + ry) / 2);
        }
        // receptors
        const s = laneW * 0.34;
        for (let l = 0; l < 4; l++) {
          const cx = hx + laneW * (l + 0.5), f = flashes[l];
          if (f > 0) { g.fillStyle = C.rgba(LCOL[l], 0.22 * f); g.fillRect(hx + laneW * l, top, laneW, ry - top + 40); }
          arrow(g, cx, ry, s * (1 + 0.15 * f), l);
          g.fillStyle = C.rgba(LCOL[l], 0.12 + 0.5 * f); g.fill();
          g.strokeStyle = C.rgba(LCOL[l], 0.75); g.lineWidth = 2; g.stroke();
        }
        // notes + move labels
        g.textAlign = 'right'; g.textBaseline = 'middle';
        for (const mv of moves) {
          const first = mv.notes[0], y = yOf(first.t);
          if (y < top - 20 || y > h + 20 || mv.notes.every(x => x.j)) continue;
          g.font = `800 ${Math.round(Math.max(11, laneW * 0.17))}px ${Mini.court.font()}`;
          g.fillStyle = mv.failed ? 'rgba(255,77,94,0.6)' : 'rgba(232,237,245,0.8)';
          if (hx > 90) g.fillText(mv.n, hx - 10, y);
        }
        for (const nt of notes) {
          if (nt.j && nt.j !== 'MISS') continue;
          const y = yOf(nt.t);
          if (y < top - s || y > h + s) continue;
          const cx = hx + laneW * (nt.lane + 0.5);
          arrow(g, cx, y, s, nt.lane);
          g.fillStyle = nt.j === 'MISS' ? 'rgba(120,120,130,0.5)' : LCOL[nt.lane]; g.fill();
          g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 1.5; g.stroke();
        }
        // judgement text
        const age = tn - jtxt.at;
        if (age < 0.55 && jtxt.text) {
          g.globalAlpha = U.sat(1 - age / 0.55);
          g.font = `900 italic ${Math.round(Math.max(20, laneW * 0.36))}px ${Mini.court.font()}`; g.textAlign = 'center';
          g.fillStyle = Mini.toneColor(T, jtxt.tone); g.fillText(jtxt.text, hx + hw / 2, ry - s * 2.4 - age * 30);
          g.globalAlpha = 1;
        }
        // count-in
        if (tn < 4 * beat) {
          const n = 3 - Math.floor(tn / beat);
          g.font = `900 ${Math.round(Math.min(120, hw * 0.45))}px ${Mini.court.font()}`; g.textAlign = 'center';
          g.fillStyle = n > 0 ? T.text : T.good; g.fillText(n > 0 ? String(n) : 'GO!', hx + hw / 2, (top + ry) / 2);
        }
        if (geo.side) dribbler(g, tn);
      }
      function dribbler(g, tn) {  // fake-3D dribble: ball + shadow switch hands with your last input
        const { hx, h } = geo, cx = hx / 2, fy = h * 0.66, sx = [-38, 0, 0, 38][lastLane];
        g.fillStyle = 'rgba(255,255,255,0.04)'; g.beginPath(); g.ellipse(cx, fy, 84, 22, 0, 0, Math.PI * 2); g.fill();
        g.strokeStyle = 'rgba(255,255,255,0.12)'; g.stroke();
        const ph = tn > 0 ? (tn / beat) % 1 : 0, hgt = (lastLane === 2 ? 120 : lastLane === 1 ? 60 : 92) * Math.abs(Math.cos(Math.PI * ph));
        const bx = cx + sx, by = fy - 8 - hgt, r = 17;
        const k = 1 - hgt / 180;
        g.fillStyle = `rgba(0,0,0,${0.45 * k})`; g.beginPath(); g.ellipse(bx, fy, r * (0.6 + 0.5 * k), r * 0.32, 0, 0, Math.PI * 2); g.fill();
        const gr = g.createRadialGradient(bx - r * 0.35, by - r * 0.4, 2, bx, by, r);
        gr.addColorStop(0, '#ffb57a'); gr.addColorStop(0.55, '#f0661a'); gr.addColorStop(1, '#9c3b0a');
        g.fillStyle = gr; g.beginPath(); g.arc(bx, by, r, 0, Math.PI * 2); g.fill();
        g.strokeStyle = 'rgba(40,14,2,0.7)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(bx - r, by); g.lineTo(bx + r, by); g.moveTo(bx, by - r); g.lineTo(bx, by + r); g.stroke();
        g.font = `800 13px ${Mini.court.font()}`; g.textAlign = 'center'; g.textBaseline = 'top';
        g.fillStyle = 'rgba(232,237,245,0.8)'; g.fillText(String(me).toUpperCase(), cx, fy + 30);
        g.fillStyle = 'rgba(138,150,171,0.9)'; g.fillText(`${bpm} BPM`, cx, fy + 48);
      }
      sc.after(350, () => { t0 = U.now(); });
    },
  });
})();

// =============================================================================== SLIDE DRILL
(function () {
  'use strict';
  const Mini = window.PBC.Mini, U = Mini.util, K = Mini.court, C = Mini.color;
  const AX = 0, AY = 27.5, DY = 20.5;   // attacker at the top of the key, you between him and the rim

  Mini.registerDrill('defense', {
    how: 'Stay in front of the ball handler. When he drives, slide the same way with <kbd>←</kbd> / <kbd>→</kbd> (or <kbd>A</kbd> / <kbd>D</kbd>); when he stops for a pull-up, contest with <kbd>↑</kbd> (<kbd>W</kbd>). React fast, but a jab fake punishes early guesses.',
    howTouch: 'Stay in front of the ball handler. Tap the <b>left</b> or <b>right</b> side of the court to slide with his drive, or the <b>middle</b> to contest a pull-up. React fast, but a jab fake punishes early guesses.',
    start(api) {
      const T = api.theme, N = 12, d = api.difficulty, sc = api.scope;
      const st = K.courtStage(api, () => ({ fit: [[-12, 12, 0], [12, 12, 0], [-12, 30, 0], [12, 30, 0]], camBack: 12, camH: 14, zTop: 13.2, pad: { l: 10, r: 10, t: 16, b: 66 } }), {});
      const pads = U.el('div', 'pm-zones', '<span>◀ SLIDE</span><span>▲ CONTEST</span><span>SLIDE ▶</span>');
      st.wrap.appendChild(pads);
      let rep = -1, R = null, phase = 'wait', t = 0, total = 0, locks = 0;
      const rts = [], log = [];
      const A = { x: AX, y: AY, z: 0 }, D = { x: 0, y: DY, z: 0 };
      api.foot(api.touch ? 'Tap left / right to slide · middle to contest the pull-up' : '<kbd>←</kbd> <kbd>→</kbd> slide · <kbd>↑</kbd> contest · don\'t bite on fakes · <kbd>ESC</kbd> quits');
      const hud = bump => {
        api.hud('a', 'SCORE', Math.round(total / (10 * N) * 100), null, bump);
        api.hud('b', 'REP', `${U.clamp(rep + 1, 1, N)}/${N}`);
        api.hud('c', 'REACTION', rts.length ? (rts.reduce((a, b) => a + b, 0) / rts.length).toFixed(2) + 's' : '—');
      };
      hud();

      function next() {
        rep++;
        if (rep >= N) return end();
        const move = U.pick(['left', 'right', 'left', 'right', 'stop']);
        const fake = Math.random() < 0.2 + 0.3 * d ? (Math.random() < 0.5 ? 'left' : 'right') : null;
        R = { move, fake, idle: U.rand(0.7, 1.8), fakeT: null, moveT: null, resp: null, rt: null, done: false, beat: false,
          speed: 0.5 - 0.12 * d, name: api.player(rep) };
        phase = 'idle'; t = 0;
        Object.assign(A, { x: AX, y: AY, z: 0 }); Object.assign(D, { x: 0, y: DY, z: 0 });
        st.plate(`REP ${rep + 1} OF ${N} · ON THE BALL`, R.name, 'Mirror the drive · contest the pull-up');
        st.cue('');
        hud();
      }
      function input(dir) {
        if (!R || R.done || phase === 'wait' || phase === 'done') return;
        if (phase === 'idle' || phase === 'fake' || phase === 'pause') {  // guessed before the real move
          R.resp = dir; R.done = true;
          const bit = phase === 'fake' || phase === 'pause';
          slide(dir);
          return result(0, bit ? 'BIT ON THE FAKE' : 'FLINCHED', 'bad', bit ? 'He jabbed and went the other way' : 'Wait for his move', true);
        }
        if (phase !== 'move') return;
        R.resp = dir; R.done = true; R.rt = t;
        slide(dir);
        const want = R.move === 'stop' ? 'up' : R.move;
        if (dir !== want) return result(0, 'WRONG WAY', 'bad', R.move === 'stop' ? 'He pulled up — contest with ↑' : `He went ${R.move}`, true);
        const rt = t, pts = rt <= 0.3 ? 10 : rt <= 0.8 ? 10 - 7 * (rt - 0.3) / 0.5 : Math.max(0, 3 - 3 * (rt - 0.8) / 0.2);
        rts.push(rt);
        const stop = R.move === 'stop';
        const title = pts >= 9 ? (stop ? 'HAND IN HIS FACE' : 'LOCKED UP') : pts >= 6 ? (stop ? 'CONTESTED' : 'STAYED IN FRONT') : pts >= 3 ? 'LATE' : (stop ? 'WIDE OPEN' : 'BLOW-BY');
        result(pts, title, pts >= 9 ? 'gold' : pts >= 6 ? 'good' : pts >= 3 ? 'warn' : 'bad', `${rt.toFixed(2)} s reaction`, pts < 3);
      }
      function slide(dir) { R.slide = dir; R.slideT = 0; }
      function result(pts, title, tone, sub, beat) {
        total += pts; if (pts >= 9) locks++;
        R.beat = beat; R.done = true;
        log.push({ rep: rep + 1, move: R.move, fake: R.fake, response: R.resp, rt: R.rt == null ? null : Math.round(R.rt * 1000), points: +pts.toFixed(1) });
        Object.assign(api.live, { reps: log.length, lockdowns: locks });
        api.toast(title, tone, sub);
        if (tone === 'gold') { api.flash('gold'); api.sfx('perfect'); } else if (tone === 'good') api.sfx('good'); else { api.sfx(tone === 'bad' ? 'whistle' : 'bad'); if (tone === 'bad') api.shake(); }
        if (beat && phase !== 'move') { R.move = R.resp === 'left' ? 'right' : 'left'; phase = 'move'; t = 0; }  // punish: he goes the other way
        R.endAt = t + (phase === 'move' ? Math.max(0.55, R.speed + 0.25) : 0.6);
        hud(true);
      }
      function end() {
        phase = 'done';
        const avg = rts.length ? rts.reduce((a, b) => a + b, 0) / rts.length : null;
        api.finish(total / (10 * N) * 100, { reps: N, lockdowns: locks, avgReactionMs: avg == null ? null : Math.round(avg * 1000), bitOnFakes: log.filter(l => l.fake && l.points === 0 && l.rt == null).length, log },
          [['LOCKDOWNS', `${locks}/${N}`], ['AVG REACTION', avg == null ? '—' : avg.toFixed(2) + ' s'], ['BEATEN', String(log.filter(l => l.points < 3).length)], ['FAKES', String(log.filter(l => l.fake).length)]]);
      }

      sc.key((e, k) => {
        const dir = U.dirOf(k);
        if (dir === 'left' || dir === 'right' || dir === 'up') { if (!e.repeat) input(dir); return true; }
        return false;
      });
      sc.on(api.stage, 'pointerdown', e => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        e.preventDefault();
        const r = api.stage.getBoundingClientRect(), fx = (e.clientX - r.left) / r.width;
        input(fx < 0.36 ? 'left' : fx > 0.64 ? 'right' : 'up');
      });

      sc.loop((dt, now) => {
        t += dt;
        if (R) {
          if (R.slide) R.slideT += dt;
          if (phase === 'idle' && t >= R.idle) {
            if (R.fake) { phase = 'fake'; t = 0; } else { phase = 'move'; t = 0; api.sfx('tick'); }
          } else if (phase === 'fake' && t >= 0.5) { phase = 'pause'; t = 0; R.idle2 = U.rand(0.25, 0.6); }
          else if (phase === 'pause' && t >= R.idle2) { phase = 'move'; t = 0; api.sfx('tick'); }
          else if (phase === 'move' && !R.done && t >= 1.0) { R.resp = null; result(0, R.move === 'stop' ? 'WIDE OPEN' : 'BLOW-BY', 'bad', 'Too slow to react', true); }
          else if (phase === 'move' && R.done && t >= R.endAt) { phase = 'reset'; t = 0; }
          else if ((phase === 'idle' || phase === 'fake' || phase === 'pause') && R.done && t >= R.endAt) { phase = 'reset'; t = 0; }
          else if (phase === 'reset' && t >= 0.45) next();
          animate();
        }
        render(now);
      });
      st.cv.onRedraw = () => render(U.now());
      api.debug({ get R() { return R; }, get phase() { return phase; }, get t() { return t; } });

      function animate() {
        const sway = Math.sin(U.now() / 1000 * 3.1) * 0.35;
        if (phase === 'idle') { A.x = AX + sway; A.y = AY; A.z = 0; }
        else if (phase === 'fake') { const u = t / 0.5, j = u < 0.35 ? U.easeOut(u / 0.35) : 1 - U.smooth((u - 0.35) / 0.65); A.x = AX + (R.fake === 'left' ? -1 : 1) * 2.2 * j; A.y = AY - 0.6 * j; }
        else if (phase === 'move') {
          const u = U.sat(t / R.speed);
          if (R.move === 'stop') { A.x = AX; A.y = AY - 1.2 * U.easeOut(u); A.z = 2.6 * Math.sin(Math.PI * Math.min(1, t / 0.7)); }
          else { A.x = AX + (R.move === 'left' ? -1 : 1) * 8 * U.easeIn(u) * (R.beat ? 1.3 : 1); A.y = AY - (R.beat ? 9 : 4) * U.easeIn(u); A.z = 0; }
        } else if (phase === 'reset') { const k = U.sat(t / 0.45); A.x += (AX - A.x) * k; A.y += (AY - A.y) * k; A.z *= 1 - k; D.x += (0 - D.x) * k; D.z *= 1 - k; }
        if (R.slide && phase !== 'reset') {
          const u = U.easeOut(U.sat(R.slideT / 0.3));
          if (R.slide === 'up') { D.z = 1.8 * Math.sin(Math.PI * U.sat(R.slideT / 0.6)); }
          else D.x = (R.slide === 'left' ? -1 : 1) * 6.5 * u;
        }
      }
      function render(now) {
        const P = st.P;
        if (!P) return;
        const g = st.cv.begin();
        st.cv.blit(st.layer);
        if (!R) return;
        if (phase === 'move' && R.move !== 'stop') {  // drive trail
          const dir = R.move === 'left' ? -1 : 1;
          for (let k = 1; k <= 4; k++) K.drawFloorRing(g, P, A.x - dir * k * 1.1, A.y + k * 0.5, 1.2 - k * 0.15, { fill: C.rgba(T.bad, 0.16 - k * 0.03) });
        }
        const items = [
          { y: D.y, draw: () => K.drawToken(g, P, D.x, D.y, { fill: T.accent, r: 1.5, z: D.z, text: U.initials(R.name), label: U.lastName(R.name), glow: R.slide ? T.accent2 : null }) },
          { y: A.y, draw: () => K.drawToken(g, P, A.x, A.y, { fill: T.bad, r: 1.5, z: A.z, label: 'BALL', alpha: 0.96 }) },
        ].sort((a, b) => a.y - b.y);
        items.forEach(it => it.draw());
        const bz = R.move === 'stop' && phase === 'move' ? A.z + 3.4 : 0.3 + 1.9 * Math.abs(Math.cos(now / 1000 * Math.PI * 2.4));
        K.drawBall(g, P, A.x + (phase === 'move' && R.move === 'left' ? -1.4 : 1.4), A.y + 0.4, bz, { rot: now / 200 });
        if (phase === 'move' && R.move === 'stop' && t < 0.8) K.drawTag(g, P, A.x, A.y, 6.5, 'PULL-UP', { bg: T.gold, color: '#1a1200', size: 12 });
        K.drawHoopFront(g, P, 0);
      }
      sc.after(250, next);
    },
  });
})();

// =============================================================================== SUICIDES
(function () {
  'use strict';
  const Mini = window.PBC.Mini, U = Mini.util, C = Mini.color;
  const LEGS = [19, 0, 47, 0, 75, 0, 94, 0], TOTAL = 470, PACE = TOTAL / 20;
  const CENT = [0.5, 0.6, 0.7, 0.56, 0.66, 0.74, 0.58, 0.68, 0.62];
  const DUR = 20, COUNT = 2.4, DECAY = 0.85, K_TAP = 0.095;
  function posAt(dd) {
    let p = 0, rem = dd;
    for (let k = 0; k < LEGS.length; k++) { const tg = LEGS[k], len = Math.abs(tg - p); if (rem <= len) return { x: p + Math.sign(tg - p) * rem, leg: k }; rem -= len; p = tg; }
    return { x: 0, leg: LEGS.length };
  }

  Mini.registerDrill('conditioning', {
    how: 'Alternate <kbd>←</kbd> <kbd>→</kbd> (or <kbd>A</kbd> <kbd>D</kbd>) to run. Your pace needle must stay in the <span class="pm-c-good">green zone</span>, which moves between jogs and sprints. Mash too fast and you get <b class="pm-c-bad">gassed</b>; too slow and the pace runner leaves you behind. 20 seconds.',
    howTouch: 'Tap <b>L</b> and <b>R</b> alternately to run. Keep the pace needle in the <span class="pm-c-good">green zone</span> as it moves between jogs and sprints. Too fast and you get <b class="pm-c-bad">gassed</b>; too slow and you fall behind. 20 seconds.',
    start(api) {
      const T = api.theme, d = api.difficulty, sc = api.scope, me = api.player(0);
      const HW = (0.22 - 0.07 * d) / 2;
      const wrap = U.el('div', 'pm-cond', '<div class="pm-cond__cv"></div><div class="pm-lr"><button type="button" class="pm-lr__b" data-side="L" data-pm-nohold>◀ <b>L</b></button><button type="button" class="pm-lr__b" data-side="R" data-pm-nohold><b>R</b> ▶</button></div>');
      api.stage.appendChild(wrap);
      const btns = { L: wrap.querySelector('[data-side="L"]'), R: wrap.querySelector('[data-side="R"]') };
      const cv = api.canvas(wrap.firstChild);
      let clock = -COUNT, E = 0.3, pool = 0, last = null, gassedT = 0, overT = 0, inZone = 0, dist = 0, stumbles = 0, taps = 0, gassed = 0, done = false, lastCount = 4;
      api.foot(api.touch ? 'Tap L / R alternately · keep the needle in the green' : 'Alternate <kbd>←</kbd> <kbd>→</kbd> or <kbd>A</kbd> <kbd>D</kbd> · keep the needle in the green · <kbd>ESC</kbd> quits');
      const zoneC = tt => { const i = U.clamp(Math.floor(tt / 2.5), 0, CENT.length - 1); return i === 0 ? CENT[0] : U.lerp(CENT[i - 1], CENT[i], U.smooth((tt - i * 2.5) / 0.7)); };
      const hud = () => {
        const run = Math.max(0, clock);
        api.hud('a', 'IN ZONE', run > 0.2 ? Math.round(inZone / run * 100) + '%' : '—');
        api.hud('b', 'TIME', clock < 0 ? '20.0' : Math.max(0, DUR - clock).toFixed(1));
        api.hud('c', 'LEGS', `${Math.min(8, posAt(dist).leg)}/8`);
      };
      hud();
      const pulse = (side, cls) => { const b = btns[side]; b.classList.remove('is-hit', 'is-bad'); void b.offsetWidth; b.classList.add(cls); };
      function tap(side) {
        if (done) return;
        if (clock < 0) { pulse(side, 'is-hit'); return; }
        if (gassedT > 0) { pulse(side, 'is-bad'); return; }
        if (side === last) { stumbles++; E = Math.max(0, E - 0.02); pulse(side, 'is-bad'); api.sfx('tick'); return; }
        last = side; taps++; pool += K_TAP; pulse(side, 'is-hit'); api.sfx('step');
      }
      function end() {
        done = true;
        const zonePct = inZone / DUR, dr = Math.min(1, dist / TOTAL);
        api.finish(100 * (0.8 * zonePct + 0.2 * dr), { inZonePct: Math.round(zonePct * 100), distanceFt: Math.round(dist), legs: Math.min(8, posAt(dist).leg), gassed, stumbles, taps },
          [['IN ZONE', Math.round(zonePct * 100) + '%'], ['DISTANCE', `${Math.round(dist)} / ${TOTAL} ft`], ['GASSED', gassed + '×'], ['STUMBLES', String(stumbles)]]);
      }
      sc.key((e, k) => { const dir = U.dirOf(k); if (dir === 'left' || dir === 'right') { if (!e.repeat) tap(dir === 'left' ? 'L' : 'R'); return true; } return false; });
      Object.keys(btns).forEach(side => sc.on(btns[side], 'pointerdown', e => { e.preventDefault(); tap(side); }));

      let hudT = 0;
      sc.loop(dt => {
        if (done) return;
        const prev = clock;
        clock += dt;
        if (clock < 0) {
          const n = Math.ceil(-clock / (COUNT / 3));
          if (n !== lastCount) { lastCount = n; api.sfx('tick'); }
        } else {
          if (prev < 0) api.sfx('start');
          const mv = pool * Math.min(1, dt * 12); pool -= mv; E += mv;
          E = U.clamp(E - (gassedT > 0 ? 1.5 : DECAY) * E * dt, 0, 1.05);
          const c = zoneC(clock), lo = c - HW, hi = c + HW;
          if (gassedT > 0) { gassedT -= dt; if (gassedT <= 0) { api.toast('BACK IN IT', 'good', 'Find the rhythm again'); } }
          else {
            overT = E > hi + 0.1 ? overT + dt : 0;
            if (overT > 0.5 || E >= 0.98) { gassedT = 1.4; gassed++; overT = 0; api.toast('GASSED!', 'bad', 'Too fast — legs are gone'); api.sfx('gassed'); api.flash('bad'); api.shake(); }
            else if (E >= lo && E <= hi) inZone += dt;
          }
          dist += PACE * U.clamp(E / c, 0, 1.35) * (gassedT > 0 ? 0.35 : 1) * dt;
          Object.assign(api.live, { inZonePct: Math.round(inZone / Math.max(0.1, clock) * 100), distanceFt: Math.round(dist), gassed });
          if (clock >= DUR) { end(); return; }
        }
        hudT += dt; if (hudT > 0.1) { hudT = 0; hud(); }
        render();
      });
      cv.onRedraw = () => render();
      api.debug({ get E() { return E; }, get clock() { return clock; }, zone: () => zoneC(Math.max(0, clock)), HW });

      function render() {
        const g = cv.begin(), w = cv.w, h = cv.h;
        const bg = g.createLinearGradient(0, 0, 0, h);
        bg.addColorStop(0, '#070a12'); bg.addColorStop(1, '#0f1626');
        g.fillStyle = bg; g.fillRect(0, 0, w, h);
        // --- full-court strip in fake 3D
        const top = h * 0.07, bot = h * 0.47, cx = w / 2, wNear = w * 0.94, wFar = w * 0.74;
        const pr = (x, dp) => { const k = dp / 50, ww = U.lerp(wNear, wFar, k); return { x: cx + (x / 94 - 0.5) * ww, y: U.lerp(bot, top, k) }; };
        const quad = (x0, d0, x1, d1) => { const a = pr(x0, d0), b = pr(x1, d0), c2 = pr(x1, d1), e = pr(x0, d1); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.lineTo(c2.x, c2.y); g.lineTo(e.x, e.y); g.closePath(); };
        quad(0, 0, 94, 50); const fl = g.createLinearGradient(0, top, 0, bot); fl.addColorStop(0, '#1a2336'); fl.addColorStop(1, '#27324b'); g.fillStyle = fl; g.fill();
        g.strokeStyle = 'rgba(232,237,245,0.5)'; g.lineWidth = 1.5; g.stroke();
        quad(0, 17, 19, 33); g.fillStyle = C.rgba(T.accent, 0.16); g.fill(); g.stroke();
        quad(75, 17, 94, 33); g.fillStyle = C.rgba(T.accent, 0.16); g.fill(); g.stroke();
        const run = clock >= 0 ? posAt(dist) : { x: 0, leg: 0 }, ghost = posAt(Math.max(0, clock) * PACE), target = LEGS[Math.min(run.leg, LEGS.length - 1)];
        for (const x of [0, 19, 47, 75, 94]) {
          const a = pr(x, 0), b = pr(x, 50), hot = x === target && clock >= 0 && run.leg < 8;
          g.strokeStyle = hot ? T.accent2 : 'rgba(232,237,245,0.45)'; g.lineWidth = hot ? 4 : 1.5;
          if (hot) { g.shadowColor = T.accent2; g.shadowBlur = 12; }
          g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); g.shadowBlur = 0;
        }
        const cc = pr(47, 25); g.strokeStyle = 'rgba(232,237,245,0.35)'; g.lineWidth = 1.5; g.beginPath(); g.ellipse(cc.x, cc.y, 6 / 94 * U.lerp(wNear, wFar, 0.5), 6 / 50 * (bot - top), 0, 0, Math.PI * 2); g.stroke();
        const tok = (x, dp, fill, label, ghostTok) => {
          const p = pr(x, dp), r = Math.max(8, w * 0.016);
          g.fillStyle = 'rgba(0,0,0,0.45)'; g.beginPath(); g.ellipse(p.x, p.y + r * 0.35, r * 1.1, r * 0.45, 0, 0, Math.PI * 2); g.fill();
          g.globalAlpha = ghostTok ? 0.45 : 1;
          g.fillStyle = fill; g.beginPath(); g.ellipse(p.x, p.y - r * 0.35, r, r * 0.62, 0, 0, Math.PI * 2); g.fill();
          g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 1.2; g.stroke(); g.globalAlpha = 1;
          g.font = `800 ${Math.max(10, r * 0.85)}px ${Mini.court.font()}`; g.textAlign = 'center'; g.textBaseline = 'top';
          g.fillStyle = ghostTok ? 'rgba(232,237,245,0.55)' : T.text; g.fillText(label, p.x, p.y + r * 0.6);
        };
        tok(ghost.x, 36, '#8a96ab', 'PACE', true);
        tok(run.x, 20, gassedT > 0 ? T.bad : T.accent, U.lastName(me).toUpperCase(), false);
        // --- pace bar
        const bx = w * 0.07, bw = w * 0.86, by = h * 0.6, bh = Math.max(26, h * 0.075);
        const X = v => bx + U.clamp(v, 0, 1.05) / 1.05 * bw;
        g.fillStyle = 'rgba(7,10,17,0.95)'; g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = 1.5;
        g.beginPath(); if (g.roundRect) g.roundRect(bx, by, bw, bh, bh / 2); else g.rect(bx, by, bw, bh); g.fill(); g.stroke();
        const c = zoneC(Math.max(0, clock));
        g.fillStyle = C.rgba(T.bad, 0.22); g.fillRect(X(Math.min(1.05, c + HW + 0.1)), by + 2, X(1.05) - X(Math.min(1.05, c + HW + 0.1)) - 2, bh - 4);
        g.fillStyle = C.rgba(T.good, 0.35); g.fillRect(X(c - HW), by + 2, X(c + HW) - X(c - HW), bh - 4);
        g.strokeStyle = T.good; g.lineWidth = 2; g.strokeRect(X(c - HW), by + 1, X(c + HW) - X(c - HW), bh - 2);
        const inz = E >= c - HW && E <= c + HW && gassedT <= 0, mx = X(E);
        g.fillStyle = gassedT > 0 ? T.bad : inz ? '#fff' : T.accent2; g.shadowColor = g.fillStyle; g.shadowBlur = 14;
        g.fillRect(mx - 3, by - 8, 6, bh + 16); g.shadowBlur = 0;
        g.font = `900 ${Math.round(Math.max(14, bh * 0.55))}px ${Mini.court.font()}`; g.textBaseline = 'bottom'; g.textAlign = 'center';
        const zl = gassedT > 0 ? ['GASSED', T.bad] : c >= 0.68 ? ['SPRINT!', T.gold] : c <= 0.55 ? ['SETTLE', T.blue] : ['PUSH', T.accent2];
        g.fillStyle = zl[1]; g.fillText(zl[0], X(c), by - 12);
        g.font = `700 11px ${Mini.court.font()}`; g.textBaseline = 'top'; g.fillStyle = 'rgba(138,150,171,0.9)';
        g.textAlign = 'left'; g.fillText('EASY', bx, by + bh + 18); g.textAlign = 'right'; g.fillText('GASSED', bx + bw, by + bh + 18);
        g.textAlign = 'center'; g.fillStyle = T.text; g.fillText(`♥ ${Math.round(88 + E * 104)} BPM`, bx + bw / 2, by + bh + 18);
        if (clock < 0) {
          const n = Math.ceil(-clock / (COUNT / 3));
          g.font = `900 ${Math.round(Math.min(110, h * 0.22))}px ${Mini.court.font()}`; g.textBaseline = 'middle';
          g.fillStyle = 'rgba(232,237,245,0.92)'; g.fillText(String(n), w / 2, (top + bot) / 2);
        }
      }
    },
  });
})();
