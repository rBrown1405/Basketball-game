/* Pro BBALL Coach — court drills: 'finishing' (Attack the Rim), 'passing' (Find the Open Man),
   'rebounding' (Box Out & Board). Fake-3D court diagrams with player tokens. Needs core, court, drills. */

// =============================================================================== ATTACK THE RIM
(function () {
  'use strict';
  const Mini = window.PBC.Mini, U = Mini.util, K = Mini.court, C = Mini.color, RIM = Mini.RIM;
  // a: start, c: curve control, g: gather spot, t: take-off spot
  const LANES = [
    { n: 'LEFT WING DRIVE', a: [-17, 27], c: [-11, 17], g: [-6.5, 11.8], t: [-3.2, 8.4], kind: 'LAYUP', dunk: true },
    { n: 'RIGHT WING DRIVE', a: [17, 27], c: [11, 17], g: [6.5, 11.8], t: [3.2, 8.4], kind: 'LAYUP', dunk: true },
    { n: 'MIDDLE DRIVE', a: [0, 32], c: [1.5, 21], g: [0.5, 12.8], t: [0, 8.8], kind: 'FINGER ROLL', dunk: true },
    { n: 'BASELINE DRIVE', a: [-21, 13], c: [-15, 4.5], g: [-9.5, 4.3], t: [-4.4, 4.7], kind: 'REVERSE LAYUP', dunk: false },
    { n: 'BASELINE DRIVE', a: [21, 13], c: [15, 4.5], g: [9.5, 4.3], t: [4.4, 4.7], kind: 'REVERSE LAYUP', dunk: false },
    { n: 'EURO STEP', a: [15, 28], c: [8, 17], g: [4, 12], t: [-1.8, 8.6], kind: 'EURO STEP FINISH', dunk: false, euro: true },
  ];
  const bez = (a, c, g, u) => { const v = 1 - u; return [v * v * a[0] + 2 * v * u * c[0] + u * u * g[0], v * v * a[1] + 2 * v * u * c[1] + u * u * g[1]]; };

  Mini.registerDrill('finishing', {
    how: 'Six drives to the rim. Press <kbd>SPACE</kbd> (or click / tap) when the shrinking ring hits the <b>GATHER</b> spot, then press again as the second ring closes at the <b>top of your jump</b>. Nail both for the finish (and maybe a dunk).',
    howTouch: 'Six drives to the rim. <b>Tap</b> when the shrinking ring hits the <b>GATHER</b> spot, then tap again as the second ring closes at the <b>top of your jump</b>.',
    start(api) {
      const T = api.theme, N = 6, d = api.difficulty, sc = api.scope;
      const kW = 1.15 - 0.35 * d, PW = 0.045 * kW, GW = 0.1 * kW, OKW = 0.17 * kW;
      const st = K.courtStage(api, () => ({ fit: [[-22.5, 0, 0], [22.5, 0, 0], [-19, 28, 0], [19, 28, 0], [0, 33, 0]], camBack: 28, camH: 30, pad: { l: 10, r: 10, t: 24, b: 62 } }), {});
      const lanes = U.shuffle(LANES);
      const qOf = err => { const a = Math.abs(err); return a <= PW ? 1 : Math.max(0, 1 - (a - PW) / (OKW - PW)); };
      const lab = err => { const a = Math.abs(err); return a <= PW ? 'perfect' : a <= GW ? 'good' : a <= OKW ? 'ok' : 'miss'; };
      let i = -1, R = null, phase = 'wait', t = 0, total = 0, made = 0, perfects = 0, swishAt = -1e9, shakeAt = -1e9;
      const reps = [], e1 = [], e2 = [];
      api.foot(api.touch ? 'Tap to gather · tap again at the top of the jump' : 'Press <kbd>SPACE</kbd> / click to gather · again at the top of the jump · <kbd>ESC</kbd> quits');
      const hud = bump => {
        api.hud('a', 'SCORE', reps.length ? Math.round(total / reps.length) : 0, null, bump);
        api.hud('b', 'DRIVE', `${U.clamp(i + 1, 1, N)}/${N}`);
        api.hud('c', 'MADE', `${made}/${reps.length}`, null, bump);
      };
      hud();

      function next() {
        i++;
        if (i >= N) return end();
        const L = lanes[i % lanes.length];
        const side = L.t[0] < 0 ? 1 : -1;
        R = { L, name: api.player(i), A: U.rand(1.05, 1.45) * (1.1 - 0.25 * d), G: L.euro ? 0.44 : 0.34, J: 0.64, H: 3.3,
          err1: null, err2: null, q1: 0, q2: 0, gpos: null, hand: null, flight: null, airT: null, stop: null, def0: [side * 7, 6.5] };
        phase = 'approach'; t = 0;
        st.plate(`DRIVE ${i + 1} OF ${N} · ${L.n}`, R.name, L.dunk ? 'Finish strong' : L.kind.toLowerCase());
        st.cue('');
        hud();
      }
      function fail(title, sub) { R.stop = runnerPos(); finishRep(false, title, sub, 'bad'); }
      function press() {
        if (!R) return;
        if (phase === 'approach') {
          const err = t - R.A;
          if (err < -OKW) { R.err1 = err; return fail('TRAVEL', 'Gathered way too early'); }
          R.err1 = err; R.q1 = qOf(err); R.gpos = runnerPos(); phase = 'steps'; t = 0;
          const l1 = lab(err);
          api.sfx(l1 === 'perfect' ? 'good' : l1 === 'miss' ? 'bad' : 'ok');
          st.cue(l1 === 'perfect' ? 'PERFECT GATHER' : l1.toUpperCase() + ' GATHER', l1 === 'perfect' ? 'gold' : l1 === 'good' ? 'good' : 'warn');
        } else if (phase === 'steps' || phase === 'air') {
          const err = phase === 'steps' ? -(R.G - t) - R.J / 2 : t - R.J / 2;
          R.err2 = err; R.q2 = qOf(err); R.hand = runnerPos(); R.hand[2] = 7.2 + jumpZ() + 1.3;
          release();
        }
      }
      function runnerPos() {
        const L = R.L;
        if (phase === 'approach') {
          const u = t / R.A;
          if (u <= 1) { const p = bez(L.a, L.c, L.g, U.easeIn(u) * 0.35 + u * 0.65); return [p[0], p[1], 0]; }
          const k = Math.min(1, (u - 1) * R.A / R.G * 0.6);
          return [U.lerp(L.g[0], L.t[0], k), U.lerp(L.g[1], L.t[1], k), 0];
        }
        if (phase === 'steps') {
          const u = U.smooth(t / R.G), g = R.gpos;
          const lat = L.euro ? Math.sin(u * Math.PI) * 2.2 : 0;
          return [U.lerp(g[0], L.t[0], u) + lat, U.lerp(g[1], L.t[1], u), 0];
        }
        if (R.airT != null) {  // in the air (and landing after the release)
          const u = U.sat(R.airT / R.J), to = [RIM.x + (L.t[0] - RIM.x) * 0.45, RIM.y + (L.t[1] - RIM.y) * 0.45];
          return [U.lerp(L.t[0], to[0], u), U.lerp(L.t[1], to[1], u), 0];
        }
        return R.stop || [L.a[0], L.a[1], 0];
      }
      function jumpZ() { if (R.airT == null) return 0; const u = U.sat(R.airT / R.J); return 4 * R.H * u * (1 - u); }
      function release() {
        const good = R.q1 > 0 && R.q2 >= 0.35, dunk = good && R.L.dunk && R.q1 >= 0.85 && R.q2 >= 0.85;
        const h = R.hand, a = { x: h[0], y: h[1], z: h[2] };
        const top = { x: RIM.x, y: RIM.y, z: RIM.z + (dunk ? 0.6 : 0.4) }, low = { x: RIM.x, y: RIM.y, z: 6.6 };
        const fl = { x: RIM.x + U.rand(-1, 1), y: RIM.y + U.rand(0.8, 2.2), z: 0 };
        if (dunk) R.flight = new K.Flight([{ a, b: top, h: 0.3, d: 0.16, ev: 'dunk' }, { a: top, b: low, h: 0, d: 0.12, ev: 'net' }, { a: low, b: fl, h: 0.3, d: 0.38, ev: 'floor' }]);
        else if (good) R.flight = new K.Flight([{ a, b: top, h: 1.5, d: 0.34, ev: 'rim_in' }, { a: top, b: low, h: 0, d: 0.15, ev: 'net' }, { a: low, b: fl, h: 0.4, d: 0.42, ev: 'floor' }]);
        else {
          const ang = U.rand(0, Math.PI * 2), hit = { x: RIM.x + Math.cos(ang) * RIM.r, y: RIM.y + Math.abs(Math.sin(ang)) * RIM.r, z: RIM.z + 0.3 };
          const land = { x: RIM.x + Math.cos(ang) * U.rand(4, 8), y: RIM.y + Math.abs(Math.sin(ang)) * U.rand(3, 7), z: 0 };
          R.flight = new K.Flight([{ a, b: hit, h: 1.5, d: 0.34, ev: 'rim' }, { a: hit, b: land, h: U.rand(2.5, 4), d: 0.6, ev: 'floor' }]);
        }
        R.dunk = dunk; R.made = good;
        phase = 'finish'; t = 0; st.cue('');
        const l1 = lab(R.err1), l2 = lab(R.err2), sub = `Gather ${U.ms(R.err1)} · release ${U.ms(R.err2)}`;
        if (!good) finishRep(false, R.err2 < -OKW ? 'BLOCKED' : R.err2 > OKW ? 'TOO LATE' : 'RIMMED OUT', sub, R.q2 < 0.2 ? 'bad' : 'warn', true);
        else finishRep(true, dunk ? 'SLAM DUNK!' : l1 === 'perfect' && l2 === 'perfect' ? 'PERFECT FINISH' : R.L.kind, sub, dunk || (l1 === 'perfect' && l2 === 'perfect') ? 'gold' : 'good', true);
      }
      function finishRep(ok, title, sub, tone, shot) {
        if (!shot) { phase = 'post'; t = 0; R.flight = null; }
        const pts = shot ? 100 * (0.45 * R.q1 + 0.55 * R.q2) : 0;  // travel / charge = no points
        total += pts; if (ok) made++;
        if (R.err1 != null && lab(R.err1) === 'perfect') perfects++;
        if (R.err2 != null && lab(R.err2) === 'perfect') perfects++;
        if (R.err1 != null) e1.push(R.err1);
        if (R.err2 != null && Math.abs(R.err2) < 1) e2.push(R.err2);
        reps.push({ lane: R.L.n, made: ok, dunk: !!R.dunk, gather: R.err1, release: R.err2, points: Math.round(pts) });
        Object.assign(api.live, { made, drives: reps.length });
        api.toast(title, tone, sub);
        if (tone === 'gold') { api.flash('gold'); api.sfx('perfect'); } else if (tone === 'good') api.sfx('good'); else { api.sfx(tone === 'bad' ? 'whistle' : 'bad'); api.shake(); }
        hud(true);
      }
      function end() {
        phase = 'done';
        const avg = a => (a.length ? a.reduce((s, v) => s + Math.abs(v), 0) / a.length : null);
        const ms = v => (v == null ? '—' : '±' + Math.round(v * 1000) + ' ms');
        api.finish(total / N, { made, drives: N, perfectSteps: perfects, avgGatherMs: avg(e1) == null ? null : Math.round(avg(e1) * 1000), avgReleaseMs: avg(e2) == null ? null : Math.round(avg(e2) * 1000), reps },
          [['MADE', `${made}/${N}`], ['PERFECT STEPS', `${perfects}/${N * 2}`], ['GATHER', ms(avg(e1))], ['RELEASE', ms(avg(e2))]]);
      }

      sc.key((e, k) => { if ((k === 'space' || k === 'enter') && !e.repeat) { press(); return true; } return false; });
      sc.on(api.stage, 'pointerdown', e => { if (e.pointerType === 'mouse' && e.button !== 0) return; e.preventDefault(); press(); });

      sc.loop((dt, now) => {
        t += dt;
        if (R && R.airT != null) R.airT += dt;
        if (phase === 'approach') {
          const left = R.A - t;
          if (left < 0.55 && left > -OKW) st.cue('GATHER', 'ok');
          if (left < -OKW) { R.err1 = null; fail('CHARGE', 'Gathered too late, ran into the help'); }
        } else if (phase === 'steps') { if (t >= R.G) { phase = 'air'; t -= R.G; R.airT = t; } }  // keep the frame overshoot: exact apex timing
        else if (phase === 'air') {
          if (t > R.J * 0.2) st.cue('RELEASE', 'ok');
          if (t >= R.J) { R.q2 = 0; R.err2 = R.J / 2 + 0.2; R.hand = runnerPos(); R.hand[2] = 7.5; release(); }
        } else if (phase === 'finish') {
          if (R.flight) {
            for (const ev of R.flight.step(dt)) {
              if (ev === 'net') { swishAt = now; api.sfx('swish'); }
              else if (ev === 'dunk') { shakeAt = now; api.sfx('clank'); api.shake(); }
              else if (ev === 'rim' || ev === 'rim_in') api.sfx('clank');
              else if (ev === 'floor') api.sfx('bounce');
            }
            if (R.flight.done) { phase = 'post'; t = 0; }
          } else { phase = 'post'; t = 0; }
        } else if (phase === 'post' && t > 0.55) next();
        render(now);
      });
      st.cv.onRedraw = () => render(U.now());
      api.debug({ get R() { return R; }, get phase() { return phase; }, get t() { return t; }, PW, GW, OKW });

      function render(now) {
        const P = st.P;
        if (!P) return;
        const g = st.cv.begin();
        const shake = U.sat(1 - (now - shakeAt) / 300);
        if (shake && !U.reducedMotion()) g.translate(Math.sin(now / 18) * 3 * shake, 0);
        st.cv.blit(st.layer);
        if (!R) { K.drawHoopFront(g, P, 0); return; }
        const L = R.L, pos = runnerPos(), jz = jumpZ();
        // gather marker + shrinking ring
        if (phase === 'approach' || (phase === 'steps' && t < 0.15)) {
          K.drawFloorRing(g, P, L.g[0], L.g[1], 1.7, { color: 'rgba(255,255,255,0.7)', dash: [4, 4], width: 2, fill: 'rgba(255,255,255,0.05)' });
          const left = R.A - t;
          if (phase === 'approach' && left < 0.95 && left > -OKW) {
            const r = 1.7 + 6 * Math.max(0, left) / 0.95;
            K.drawFloorRing(g, P, L.g[0], L.g[1], r, { color: left < GW && left > -GW ? T.good : T.accent2, width: 3 });
          }
        }
        // help defender slides over
        const prog = phase === 'approach' ? U.sat(t / R.A) : 1;
        const dx = U.lerp(R.def0[0], Math.sign(R.def0[0]) * 1.5, prog), dy = U.lerp(R.def0[1], 6.2, prog);
        const dz = phase === 'finish' && !R.made ? 2.4 : phase === 'air' ? jz * 0.6 : 0;
        const toks = [{ x: dx, y: dy, o: { fill: T.bad, z: dz, alpha: 0.95, label: 'HELP', r: 1.5 } },
          { x: pos[0], y: pos[1], o: { fill: T.accent, z: jz, r: 1.55, text: U.initials(R.name), label: U.lastName(R.name), glow: phase === 'air' ? T.accent2 : null } }]
          .sort((a, b) => a.y - b.y);
        toks.forEach(o => K.drawToken(g, P, o.x, o.y, o.o));
        // release ring (screen space) closing on the apex
        if (phase === 'steps' || phase === 'air') {
          const lead = R.G + R.J / 2, rem = phase === 'steps' ? R.J / 2 + (R.G - t) : R.J / 2 - t;
          const top = P.p(pos[0], pos[1], jz + 1), base = 1.9 * top.s;
          if (rem > -OKW) {
            g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 2; g.setLineDash([4, 4]);
            g.beginPath(); g.arc(top.x, top.y, base, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
            g.strokeStyle = Math.abs(rem) < GW ? T.good : T.accent2; g.lineWidth = 3;
            g.beginPath(); g.arc(top.x, top.y, base * (1 + 2.6 * Math.max(0, rem) / lead), 0, Math.PI * 2); g.stroke();
          }
        }
        // ball
        let b = null;
        if (phase === 'approach') b = { x: pos[0] + 1.3, y: pos[1] + 0.3, z: 0.3 + 2.1 * Math.abs(Math.cos(t * Math.PI * 2.7)) };
        else if (phase === 'steps') b = { x: pos[0] + 1.0, y: pos[1] + 0.2, z: 2.4 };
        else if (phase === 'air') b = { x: pos[0] + 0.6, y: pos[1], z: 2.4 + jz + 2.4 * U.sat(t / (R.J / 2)) };
        else if (R.flight) b = R.flight.pos();
        const sw = U.sat(1 - (now - swishAt) / 380);
        const behind = b && Math.hypot(b.x - RIM.x, b.y - RIM.y) < 1.3 && b.z < 10.6 && b.z > 6;
        if (b && behind) { K.drawBall(g, P, b.x, b.y, b.z, { rot: R.flight ? R.flight.rot : t * 8 }); K.drawHoopFront(g, P, sw); }
        else { K.drawHoopFront(g, P, sw); if (b) K.drawBall(g, P, b.x, b.y, b.z, { rot: R.flight ? R.flight.rot : t * 8 }); }
      }
      sc.after(250, next);
    },
  });
})();

// =============================================================================== FIND THE OPEN MAN
(function () {
  'use strict';
  const Mini = window.PBC.Mini, U = Mini.util, K = Mini.court, RIM = Mini.RIM;
  const SPOTS = [{ n: 'LEFT CORNER', x: -21, y: 4.5 }, { n: 'LEFT WING', x: -17, y: 21 }, { n: 'RIGHT WING', x: 17, y: 21 }, { n: 'RIGHT CORNER', x: 21, y: 4.5 }];
  const HX = 0, HY = 30.5;

  Mini.registerDrill('passing', {
    how: 'You have the ball up top. When a teammate <b class="pm-c-good">breaks open</b>, hit him fast: press his number <kbd>1</kbd>–<kbd>4</kbd> or click him. The quicker the read, the more points. A pass to a covered man is a <b class="pm-c-bad">turnover</b>.',
    howTouch: 'You have the ball up top. When a teammate <b class="pm-c-good">breaks open</b>, tap him fast. The quicker the read, the more points. A pass to a covered man is a <b class="pm-c-bad">turnover</b>.',
    start(api) {
      const T = api.theme, N = 12, d = api.difficulty, sc = api.scope;
      const st = K.courtStage(api, () => ({ fit: [[-23.5, 0, 0], [23.5, 0, 0], [-19.5, 24, 0], [19.5, 24, 0], [0, 34, 0]], camBack: 28, camH: 32, pad: { l: 10, r: 10, t: 24, b: 62 } }), {});
      const mates = SPOTS.map((sp, k) => ({ k, sp, name: api.player(k + 1), x: sp.x, y: sp.y, ph: Math.random() * 10, gap: 0, dx: sp.x, dy: sp.y }));
      const me = api.player(0);
      let rep = 0, phase = 'idle', t = 0, wait = 1.1, open = null, lastOpen = null, W = 1, clock = 0, total = 0, ast = 0, tov = 0, late = 0, pass = null;
      const rts = [], log = [];
      api.foot(api.touch ? 'Tap the open teammate · covered = turnover' : 'Press <kbd>1</kbd>–<kbd>4</kbd> or click the open teammate · covered = turnover · <kbd>ESC</kbd> quits');
      st.plate('READ THE DEFENSE', me, 'Point guard · ball at the top');
      const hud = bump => {
        api.hud('a', 'SCORE', Math.max(0, Math.round(total / (10 * N) * 100)), null, bump);
        api.hud('b', 'READ', `${U.clamp(rep + 1, 1, N)}/${N}`);
        api.hud('c', 'AST · TO', `${ast} · ${tov}`, tov > ast ? 'bad' : null, bump);
      };
      hud();

      function nextRep() {
        rep++; open = null; pass = null;
        if (rep >= N) return end();
        phase = 'idle'; t = 0; wait = U.rand(0.7, 1.6) * (1.05 - 0.2 * d);
        hud();
      }
      function throwTo(m) {
        if (phase === 'pass' || phase === 'done' || !m) return;
        const isOpen = open === m && phase === 'open';
        const rt = clock;
        pass = { to: m, t: 0, dur: isOpen ? 0.34 : 0.3, ok: isOpen, from: { x: HX + 1.2, y: HY - 0.3 } };
        if (isOpen) {
          const quick = U.clamp((W - rt) / Math.max(0.05, W - 0.28), 0, 1), pts = 5 + 5 * Math.pow(quick, 0.7);
          total += pts; ast++; rts.push(rt);
          log.push({ read: rep + 1, to: m.name, result: 'assist', rt: Math.round(rt * 1000), points: +pts.toFixed(1) });
          api.toast(pts >= 9.3 ? 'DIME!' : 'ASSIST', pts >= 9.3 ? 'gold' : 'good', `${m.name} · ${rt.toFixed(2)} s read`);
          api.sfx(pts >= 9.3 ? 'perfect' : 'good');
          if (pts >= 9.3) api.flash('gold');
        } else {
          total -= 4; tov++;
          log.push({ read: rep + 1, to: m.name, result: 'turnover' });
          api.toast('PICKED OFF!', 'bad', open ? `${m.name} was covered — ${open.name} was open` : `${m.name} was covered`);
          api.sfx('whistle'); api.flash('bad'); api.shake();
        }
        Object.assign(api.live, { assists: ast, turnovers: tov, reads: rep + 1 });
        phase = 'pass'; t = 0;
        hud(true);
      }
      function end() {
        phase = 'done';
        const avg = rts.length ? rts.reduce((a, b) => a + b, 0) / rts.length : null;
        api.finish(total / (10 * N) * 100, { assists: ast, turnovers: tov, late, reads: N, avgReadMs: avg == null ? null : Math.round(avg * 1000), log },
          [['ASSISTS', `${ast}/${N}`], ['TURNOVERS', String(tov)], ['TOO LATE', String(late)], ['AVG READ', avg == null ? '—' : avg.toFixed(2) + ' s']]);
      }

      sc.key((e, k) => {
        if (/^[1-4]$/.test(k)) { if (!e.repeat) throwTo(mates[+k - 1]); return true; }
        return false;
      });
      sc.on(api.stage, 'pointerdown', e => {
        if ((e.pointerType === 'mouse' && e.button !== 0) || !st.P) return;
        const p = st.cv.local(e);
        let best = null, bd = 1e9;
        for (const m of mates) { const s = st.P.p(m.x, m.y, 0.6), dd = Math.hypot(s.x - p.x, s.y - p.y); if (dd < Math.max(30, 2.8 * s.s) && dd < bd) { best = m; bd = dd; } }
        if (best) { e.preventDefault(); throwTo(best); }
      });

      sc.loop((dt, now) => {
        t += dt; clock += dt;
        const time = now / 1000;
        for (const m of mates) {
          const corner = m.sp.y < 10;
          m.x = m.sp.x + (corner ? 1.2 : 2.2) * Math.sin(time * 0.8 + m.ph);
          m.y = m.sp.y + (corner ? 0.8 : 1.6) * Math.sin(time * 1.1 + m.ph * 1.3);
          const tgt = m === open && phase === 'open' ? 7.5 : 0;
          m.gap += (tgt - m.gap) * Math.min(1, dt * (tgt ? 6 : 9));
          // defender: denial position between man and the ball/rim, sagging toward the paint when beaten
          const ax = (HX + RIM.x) / 2 - m.x, ay = (HY * 0.4 + RIM.y * 0.6) - m.y, al = Math.hypot(ax, ay) || 1;
          m.dx = m.x + ax / al * (2.4 + m.gap) + 0.4 * Math.sin(time * 2.3 + m.ph);
          m.dy = m.y + ay / al * (2.4 + m.gap);
        }
        if (phase === 'idle' && t >= wait) {
          const pool = mates.filter(m => m !== lastOpen);
          open = lastOpen = U.pick(pool); phase = 'open'; t = 0; clock = 0; api.sfx('tick');
          W = U.lerp(1.15, 0.72, rep / (N - 1)) * (1.15 - 0.3 * d);
        } else if (phase === 'open' && clock > W) {
          late++;
          log.push({ read: rep + 1, to: open.name, result: 'late' });
          api.toast('TOO LATE', 'warn', `${open.name} was open for ${W.toFixed(2)} s`);
          api.sfx('bad');
          phase = 'closing'; t = 0; open = null;
          Object.assign(api.live, { late });
        } else if (phase === 'closing' && t > 0.5) nextRep();
        else if (phase === 'pass') {
          pass.t += dt;
          if (pass.t >= pass.dur + (pass.ok ? 0.35 : 0.65)) nextRep();
        }
        render(now);
      });
      st.cv.onRedraw = () => render(U.now());
      api.debug({ mates, get open() { return open; }, get phase() { return phase; }, get W() { return W; } });

      function render(now) {
        const P = st.P;
        if (!P) return;
        const g = st.cv.begin();
        st.cv.blit(st.layer);
        const pulse = 0.5 + 0.5 * Math.sin(now / 90);
        const items = [{ y: HY, draw: () => K.drawToken(g, P, HX, HY, { fill: T.accent, text: U.initials(me), label: U.lastName(me) }) }];
        for (const m of mates) {
          const isOpen = m === open && phase === 'open';
          items.push({ y: m.dy, draw: () => K.drawToken(g, P, m.dx, m.dy, { fill: T.bad, alpha: 0.92, r: 1.25 }) });
          items.push({ y: m.y, draw: () => {
            K.drawToken(g, P, m.x, m.y, { fill: isOpen ? T.good : T.blue, text: m.k + 1, label: U.lastName(m.name), glow: isOpen ? T.good : null,
              ring: isOpen ? 2.2 + 0.5 * pulse : null, ringColor: T.good, ringW: 3 });
            if (isOpen) K.drawTag(g, P, m.x, m.y, 3.6, 'OPEN', { bg: T.good, color: '#06140c', size: 12 });
          } });
        }
        items.sort((a, b) => a.y - b.y).forEach(it => it.draw());
        if (phase === 'open' && open) {  // read window countdown arc over the open man
          const s = P.p(open.x, open.y, 8.6), r = Math.max(9, 1.0 * s.s), f = U.sat(1 - clock / W);
          g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 3; g.beginPath(); g.arc(s.x, s.y, r, 0, Math.PI * 2); g.stroke();
          g.strokeStyle = T.good; g.beginPath(); g.arc(s.x, s.y, r, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2); g.stroke();
        }
        K.drawHoopFront(g, P, 0);
        if (pass) {
          const m = pass.to, u = U.sat(pass.t / pass.dur), stopAt = pass.ok ? 1 : 0.78;
          const tx = pass.ok ? m.x - 0.8 : m.dx, ty = pass.ok ? m.y + 0.5 : m.dy, k = Math.min(u, stopAt) / stopAt;
          K.drawBall(g, P, U.lerp(pass.from.x, tx, k), U.lerp(pass.from.y, ty, k), 1.6 + 2.4 * k * (1 - k), { rot: pass.t * 10 });
        } else K.drawBall(g, P, HX + 1.3, HY - 0.3, 0.3 + 1.9 * Math.abs(Math.cos(now / 1000 * Math.PI * 2.2)), { rot: 0 });
      }
      sc.after(250, () => { phase = 'idle'; t = 0; });
    },
  });
})();

// =============================================================================== BOX OUT & BOARD
(function () {
  'use strict';
  const Mini = window.PBC.Mini, U = Mini.util, K = Mini.court, C = Mini.color, RIM = Mini.RIM;
  const SHOTS = [
    { n: 'LEFT CORNER THREE', x: -22, y: 4, three: true }, { n: 'LEFT WING THREE', x: -17.5, y: 22.5, three: true },
    { n: 'TOP OF THE KEY THREE', x: 0, y: 29.5, three: true }, { n: 'RIGHT WING THREE', x: 17.5, y: 22.5, three: true },
    { n: 'RIGHT CORNER THREE', x: 22, y: 4, three: true }, { n: 'LEFT ELBOW JUMPER', x: -8.5, y: 19, three: false },
    { n: 'RIGHT ELBOW JUMPER', x: 8.5, y: 19, three: false }, { n: 'BASELINE JUMPER', x: 14, y: 3, three: false },
  ];

  Mini.registerDrill('rebounding', {
    how: 'A shot goes up and misses. Watch the ball and its shadow off the rim, then <b>click the spot where it will land</b> before the read window closes, or press <kbd>SPACE</kbd> when the sliding marker sits on that spot. Closer calls and earlier reads score more.',
    howTouch: 'A shot goes up and misses. Watch the ball and its shadow off the rim and <b>tap the spot where it will land</b> before the read window closes. Closer calls and earlier reads score more.',
    start(api) {
      const T = api.theme, N = 8, d = api.difficulty, sc = api.scope;
      const st = K.courtStage(api, () => ({ fit: [[-21, -1, 0], [21, -1, 0], [-19, 23, 0], [19, 23, 0], [0, 31, 0]], camBack: 28, camH: 32, pad: { l: 10, r: 10, t: 24, b: 62 } }), {});
      let i = -1, R = null, phase = 'wait', t = 0, total = 0, boards = 0;
      const reps = [];
      api.foot(api.touch ? 'Tap where the rebound will land' : 'Click where the rebound will land, or <kbd>SPACE</kbd> on the sliding marker · <kbd>ESC</kbd> quits');
      const hud = bump => {
        api.hud('a', 'SCORE', Math.round(total / (10 * N) * 100), null, bump);
        api.hud('b', 'REBOUND', `${U.clamp(i + 1, 1, N)}/${N}`);
        api.hud('c', 'BOARDS', String(boards), null, bump);
      };
      hud();

      function next() {
        i++;
        if (i >= N) return end();
        const S = U.pick(SHOTS), away = Math.atan2(RIM.y - S.y, RIM.x - S.x);
        const mode = U.pick(['long', 'long', 'side', 'short']);
        const ang = mode === 'long' ? away + U.rand(-0.6, 0.6) : mode === 'side' ? away + (Math.random() < 0.5 ? 1 : -1) * U.rand(1, 1.6) : away + Math.PI + U.rand(-0.5, 0.5);
        let dist = (S.three ? U.rand(8, 14.5) : U.rand(5, 10)) * (mode === 'short' ? 0.7 : 1);
        const land = { x: U.clamp(RIM.x + Math.cos(ang) * dist, -23, 23), y: U.clamp(RIM.y + Math.sin(ang) * dist, 2.5, 29), z: 0 };
        const dir = Math.atan2(land.y - RIM.y, land.x - RIM.x);
        const hit = { x: RIM.x + Math.cos(dir) * RIM.r, y: RIM.y + Math.sin(dir) * RIM.r, z: RIM.z + 0.25 };
        const from = { x: S.x, y: S.y, z: 7.5 }, rattle = d > 0.35 && Math.random() < 0.2 + 0.3 * d;
        const segs = [{ a: from, b: hit, h: U.clamp(4 + Math.hypot(S.x, S.y - RIM.y) * 0.2, 5, 9.5), d: 0.95, ev: 'rim' }];
        let caromFrom = hit, rd = 0;
        if (rattle) {
          const other = { x: RIM.x - Math.cos(dir) * RIM.r * 0.8, y: RIM.y - Math.sin(dir) * RIM.r * 0.8, z: RIM.z + 0.25 };
          segs.push({ a: hit, b: other, h: 0.7, d: 0.26, ev: 'rim' }, { a: other, b: hit, h: 0.5, d: 0.22, ev: 'rim' });
          rd = 0.48;
        }
        const cd = U.rand(0.78, 1.02) * (1.08 - 0.18 * d);
        segs.push({ a: caromFrom, b: land, h: U.rand(3.5, 6.5), d: cd, ev: 'land' });
        const rest = { x: land.x + Math.cos(dir) * 2.2, y: U.clamp(land.y + Math.sin(dir) * 2.2, 1.5, 32), z: 0 };
        segs.push({ a: land, b: rest, h: 1.6, d: 0.42, ev: 'floor' });
        const side = land.x < 0 ? -1 : 1;
        R = { S, land, dir, rattle, flight: new K.Flight(segs), tContact: 0.95, tOpen: 0.95, tClose: 0.95 + rd + cd * 0.55, tLand: 0.95 + rd + cd,
          commit: null, commitT: null, me: { x: side * 3.6, y: 9.5 }, opp: { x: -side * 2.6, y: 12.5 }, winner: null, shooter: U.pick(['#12', '#3', '#30', '#8', '#21']) };
        phase = 'shot'; t = 0;
        st.plate(`REBOUND ${i + 1} OF ${N} · ${S.n}`, api.player(i), 'Box out · read the carom');
        st.cue('');
        hud();
      }
      function sweepPos() {
        const u = Math.max(0, t - R.tOpen), r = 3 + 14 * (0.5 - 0.5 * Math.cos(u / 1.15 * Math.PI * 2));
        return { x: U.clamp(RIM.x + Math.cos(R.dir) * r, -24, 24), y: U.clamp(RIM.y + Math.sin(R.dir) * r, 1, 32) };
      }
      function commit(p) {
        if (!R || phase !== 'shot' || R.commit) return;
        if (t < R.tOpen) { st.cue('WAIT FOR THE MISS', 'warn'); return; }
        if (t > R.tClose) return;
        R.commit = { x: U.clamp(p.x, -24.5, 24.5), y: U.clamp(p.y, 0.5, 34) }; R.commitT = t;
        api.sfx('tock'); st.cue('');
      }
      function resolve() {
        const L = R.land, c = R.commit;
        let pts = 0, dist = null, early = false, bonus = false;
        if (c) {
          dist = Math.hypot(c.x - L.x, c.y - L.y);
          pts = dist <= 1.3 ? 10 : 10 * Math.pow(Math.max(0, 1 - (dist - 1.3) / 6), 1.2);
          early = (R.commitT - R.tOpen) / (R.tClose - R.tOpen) <= 0.35 && pts >= 6;  // early-read bonus only on a good call
          if (early && pts < 10) { pts = Math.min(10, pts + 1); bonus = true; }
        }
        total += pts;
        R.winner = pts >= 6 ? 'me' : 'opp';
        if (pts >= 6) boards++;
        reps.push({ shot: R.S.n, rattle: R.rattle, missBy: dist == null ? null : +dist.toFixed(1), early, points: +pts.toFixed(1) });
        Object.assign(api.live, { boards, rebounds: reps.length });
        const tone = pts >= 9 ? 'gold' : pts >= 6 ? 'good' : pts >= 3 ? 'warn' : 'bad';
        const title = !c ? 'NO BOX OUT' : pts >= 9 ? 'BOARD!' : pts >= 6 ? 'GOT A HAND ON IT' : pts >= 3 ? 'LOOSE BALL' : 'OUT-REBOUNDED';
        api.toast(title, tone, c ? `Off by ${dist.toFixed(1)} ft${bonus ? ' · early read +1' : early ? ' · early read' : ''}` : 'Call the spot before the window closes');
        if (tone === 'gold') { api.sfx('perfect'); api.flash('gold'); } else if (tone === 'good') api.sfx('good'); else { api.sfx('bad'); if (tone === 'bad') api.shake(); }
        hud(true);
      }
      function end() {
        phase = 'done';
        const miss = reps.filter(r => r.missBy != null), avg = miss.length ? miss.reduce((a, r) => a + r.missBy, 0) / miss.length : null;
        api.finish(total / (10 * N) * 100, { boards, rebounds: N, avgMissFt: avg == null ? null : +avg.toFixed(1), reps },
          [['BOARDS', `${boards}/${N}`], ['AVG MISS', avg == null ? '—' : avg.toFixed(1) + ' ft'], ['EARLY READS', String(reps.filter(r => r.early).length)], ['NO CALL', String(reps.filter(r => r.missBy == null).length)]]);
      }

      sc.on(api.stage, 'pointerdown', e => {
        if ((e.pointerType === 'mouse' && e.button !== 0) || !st.P || !R) return;
        e.preventDefault();
        const p = st.cv.local(e);
        commit(st.P.inv(p.x, p.y));
      });
      sc.key((e, k) => { if ((k === 'space' || k === 'enter') && !e.repeat) { if (R && phase === 'shot' && t >= R.tOpen) commit(sweepPos()); return true; } return false; });

      sc.loop((dt, now) => {
        t += dt;
        if (phase === 'shot') {
          for (const ev of R.flight.step(dt)) { if (ev === 'rim') api.sfx('clank'); else if (ev === 'land' || ev === 'floor') api.sfx('bounce'); }
          if (t >= R.tOpen && t <= R.tClose && !R.commit) st.cue('READ IT!', 'ok');
          if (t > R.tClose && !R.commit) st.cue('');
          const mv = (o, tx, ty, sp) => { const dx = tx - o.x, dy = ty - o.y, l = Math.hypot(dx, dy); if (l > 0.05) { const s = Math.min(l, sp * dt); o.x += dx / l * s; o.y += dy / l * s; } };
          if (R.commit) mv(R.me, R.commit.x, R.commit.y, 22);
          if (t > R.tContact) mv(R.opp, R.land.x - Math.cos(R.dir) * 0.8, R.land.y - Math.sin(R.dir) * 0.8, 13);
          if (t >= R.tLand) { resolve(); phase = 'post'; t = 0; st.cue(''); }
        } else if (phase === 'post') {
          R.flight.step(dt);
          const w = R.winner === 'me' ? R.me : R.opp, l = R.land;
          w.x += (l.x - w.x) * Math.min(1, dt * 10); w.y += (l.y - w.y) * Math.min(1, dt * 10);
          if (t > 1.05) next();
        }
        render(now);
      });
      st.cv.onRedraw = () => render(U.now());
      api.debug({ get R() { return R; }, get phase() { return phase; }, get t() { return t; }, get P() { return st.P; }, canvas: st.cv });

      function render(now) {
        const P = st.P;
        if (!P) return;
        const g = st.cv.begin();
        st.cv.blit(st.layer);
        if (!R) { K.drawHoopFront(g, P, 0); return; }
        const open = phase === 'shot' && t >= R.tOpen && t <= R.tClose;
        if (open && !R.commit) {  // sweep marker + read-window ring around the rim
          const sp = sweepPos();
          K.drawFloorRing(g, P, sp.x, sp.y, 1.3, { color: C.rgba(T.accent2, 0.9), width: 2, fill: C.rgba(T.accent2, 0.12) });
          if (!api.touch) K.drawTag(g, P, sp.x, sp.y, 0.2, 'SPACE', { size: 10, bg: 'rgba(8,12,20,0.75)', color: T.accent2, dy: 6 });
          const f = U.sat((R.tClose - t) / (R.tClose - R.tOpen));
          K.drawFloorRing(g, P, RIM.x, RIM.y, 3 + 9 * f, { color: C.rgba(T.text, 0.28), width: 2, dash: [6, 6] });
        }
        if (R.commit) {
          const c = R.commit, col = phase === 'post' ? (R.winner === 'me' ? T.good : T.bad) : T.gold;
          K.drawFloorRing(g, P, c.x, c.y, 1.3, { color: col, width: 3, fill: C.rgba(col, 0.15) });
          const a = P.p(c.x - 0.9, c.y - 0.9, 0), b = P.p(c.x + 0.9, c.y + 0.9, 0), a2 = P.p(c.x + 0.9, c.y - 0.9, 0), b2 = P.p(c.x - 0.9, c.y + 0.9, 0);
          g.strokeStyle = col; g.lineWidth = 2.5; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.moveTo(a2.x, a2.y); g.lineTo(b2.x, b2.y); g.stroke();
        }
        if (phase === 'post') K.drawFloorRing(g, P, R.land.x, R.land.y, 0.9, { color: 'rgba(255,255,255,0.8)', width: 2, dash: [3, 3] });
        const held = phase === 'post' && t > 0.25;
        const w = held ? (R.winner === 'me' ? R.me : R.opp) : null;
        const toks = [
          { x: R.S.x, y: R.S.y, o: { fill: '#6b3440', label: 'SHOOTER', text: R.shooter, alpha: 0.85 } },
          { x: R.opp.x, y: R.opp.y, o: { fill: T.bad, label: 'OPP', z: held && w === R.opp ? 1.2 : 0 } },
          { x: R.me.x, y: R.me.y, o: { fill: T.accent, text: U.initials(api.player(i)), label: U.lastName(api.player(i)), z: held && w === R.me ? 1.6 : 0, glow: R.commit && phase === 'shot' ? T.accent2 : null } },
        ].sort((a, b) => a.y - b.y);
        toks.forEach(o => K.drawToken(g, P, o.x, o.y, o.o));
        let b = R.flight.pos();
        if (w) b = { x: w.x + 0.6, y: w.y + 0.2, z: 3.4 + (w === R.me ? 1.6 : 1.2) };
        const behind = Math.hypot(b.x - RIM.x, b.y - RIM.y) < 1.2 && b.z < 10.5 && b.z > 6;
        if (behind) { K.drawBall(g, P, b.x, b.y, b.z, { rot: R.flight.rot, shadow: 1.9 }); K.drawHoopFront(g, P, 0); }
        else { K.drawHoopFront(g, P, 0); K.drawBall(g, P, b.x, b.y, b.z, { rot: R.flight.rot, shadow: 1.9 }); }
      }
      sc.after(250, next);
    },
  });
})();
