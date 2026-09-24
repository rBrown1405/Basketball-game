/* Pro BBALL Coach — drills: 'shooting' (Catch & Shoot) and 'freethrows' (Pressure Free Throws).
   Both use the hold/release shot meter over the fake-3D court. Needs core, court, meter, drills. */
(function () {
  'use strict';
  const Mini = window.PBC.Mini, U = Mini.util, K = Mini.court, C = Mini.color;
  const initials = name => String(name).replace(/[^A-Za-z .'-]/g, '').split(/[\s.]+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '•';
  const OUTCOME = { perfect: 'swish', good: 'make', early: 'front', late: 'back', very_early: 'air', very_late: 'brick' };
  const MISS = { early: ['SHORT', 'Front rim, a touch early'], late: ['LONG', 'Back rim, a touch late'], very_early: ['AIRBALL', 'Way early'], very_late: ['BRICK', 'Way late'], no_release: ['SHOT CLOCK', 'No release'] };
  const HOW_KEYS = '<b>Hold <kbd>SPACE</kbd></b> (or the mouse button) to rise into the shot and <b>release</b> in the <span class="pm-c-good">green window</span>. The gold centre is a perfect release.';
  const HOW_TOUCH = '<b>Press &amp; hold</b> anywhere to rise into the shot and <b>let go</b> in the <span class="pm-c-good">green window</span>. The gold centre is a perfect release.';

  /** Shared stage: court canvas + shot dots + nameplate + meter + cue. */
  function shootStage(api, proj, courtOpts) {
    const wrap = U.el('div', 'pm-shoot');
    wrap.innerHTML = '<div class="pm-shoot__court"></div><div class="pm-shoot__dots"></div><div class="pm-shoot__plate"><small></small><b></b><span></span></div><div class="pm-shoot__meter"></div><div class="pm-shoot__cue"></div>';
    api.stage.appendChild(wrap);
    const st = { wrap, meter: new Mini.Meter({}), P: null, layer: null };
    wrap.querySelector('.pm-shoot__meter').appendChild(st.meter.el);
    st.cv = api.canvas(wrap.querySelector('.pm-shoot__court'), (w, h, cv) => {
      st.P = new Mini.Projector(w, h, proj(w, h));
      st.layer = cv.layer(g => { K.drawCourt(g, st.P, api.theme, courtOpts); K.drawHoopBack(g, st.P); });
    });
    const plate = wrap.querySelector('.pm-shoot__plate'), cue = wrap.querySelector('.pm-shoot__cue'), dots = wrap.querySelector('.pm-shoot__dots');
    st.plate = (kick, name, sub) => { plate.children[0].textContent = kick; plate.children[1].textContent = name; plate.children[2].textContent = sub; };
    st.cue = (text, tone) => { cue.textContent = text || ''; cue.className = 'pm-shoot__cue' + (text ? ' is-on' : '') + (tone ? ' pm-tone-' + tone : ''); };
    st.dots = n => { dots.innerHTML = '<i></i>'.repeat(n); };
    st.dot = (i, cls) => { const d = dots.children[i]; if (d) d.className = cls; };
    /** Draw the hoop front + ball in the right order (ball inside the rim/net goes behind the front rim). */
    st.ballAndHoop = (g, b, rot, swish) => {
      const P = st.P, behind = b && Math.hypot(b.x - Mini.RIM.x, b.y - Mini.RIM.y) < 1.3 && b.z < 10.3 && b.z > 6;
      if (b && behind) { K.drawBall(g, P, b.x, b.y, b.z, { rot }); K.drawHoopFront(g, P, swish); }
      else { K.drawHoopFront(g, P, swish); if (b) K.drawBall(g, P, b.x, b.y, b.z, { rot }); }
    };
    return st;
  }
  const sidePad = w => (w < 560 ? 66 : 124);
  const meanAbs = a => (a.length ? a.reduce((s, v) => s + Math.abs(v), 0) / a.length : null);
  const msTxt = v => (v == null ? '—' : '±' + Math.round(v * 1000) + ' ms');

  function ballSound(api, ev) {
    if (ev === 'net') api.sfx('swish');
    else if (ev === 'rim' || ev === 'board' || ev === 'rim_in') api.sfx('clank');
    else if (ev === 'floor') api.sfx('bounce');
  }

  // =========================================================================== CATCH & SHOOT
  const SPOTS = [
    { n: 'LEFT CORNER', x: -22.4, y: 3.6, pts: 3 }, { n: 'LEFT WING', x: -17.6, y: 22.4, pts: 3 }, { n: 'TOP OF THE KEY', x: 0, y: 29.8, pts: 3 },
    { n: 'RIGHT WING', x: 17.6, y: 22.4, pts: 3 }, { n: 'RIGHT CORNER', x: 22.4, y: 3.6, pts: 3 }, { n: 'RIGHT ELBOW', x: 8.6, y: 19.4, pts: 2 },
    { n: 'LEFT ELBOW', x: -8.6, y: 19.4, pts: 2 }, { n: 'LEFT SLOT', x: -9.6, y: 27.6, pts: 3 }, { n: 'RIGHT SLOT', x: 9.6, y: 27.6, pts: 3 },
    { n: 'TOP OF THE KEY', x: 0, y: 30.2, pts: 3 },
  ];

  Mini.registerDrill('shooting', {
    how: HOW_KEYS + ' Ten shots: the window shrinks and the speed changes as you go. Makes in a row earn a streak bonus.',
    howTouch: HOW_TOUCH + ' Ten shots: the window shrinks as you go. Makes in a row earn a streak bonus.',
    start(api) {
      const T = api.theme, N = 10, d = api.difficulty, sc = api.scope, PASS_T = 0.55, MAXRAW = 124;
      const st = shootStage(api, w => ({ fit: [[-24.5, -1.5, 0], [24.5, -1.5, 0], [-21, 25, 0], [21, 25, 0], [0, 34, 0]], camBack: 28, camH: 30, pad: { l: 10, r: sidePad(w), t: 30, b: 62 } }), {});
      const meter = st.meter;
      let i = -1, state = 'wait', tState = 0, cur = null, flight = null, swishAt = -1e9, jumpZ = 0, relZ = 9;
      let raw = 0, makes = 0, perfects = 0, streak = 0, best = 0;
      const errs = [], shots = [];
      st.dots(N);
      api.foot(api.touch ? 'Press &amp; hold to shoot · let go in the green' : 'Hold <kbd>SPACE</kbd> or the mouse to shoot · release in the green · <kbd>ESC</kbd> quits');
      const hud = bump => {
        api.hud('a', 'SCORE', Math.round(raw / MAXRAW * 100), null, bump);
        api.hud('b', 'SHOT', `${U.clamp(i + 1, 1, N)}/${N}`);
        api.hud('c', 'STREAK', streak ? '×' + streak : '—', streak >= 3 ? 'gold' : null, bump);
      };
      hud();

      function next() {
        i++;
        if (i >= N) return end();
        const f = i / (N - 1), sp = SPOTS[i % SPOTS.length];
        meter.reset({
          windowSize: U.clamp(U.lerp(0.15, 0.065, f) * (1.2 - 0.45 * d), 0.035, 0.18),
          speed: U.clamp(0.9 + f * (0.08 + 0.25 * d) + U.rand(-0.1, 0.12), 0.8, 1.3),
          pressure: 0.05 + 0.3 * f * d, center: 0.8 + U.rand(-0.02, 0.05),
        });
        const top = Math.abs(sp.x) < 11 && sp.y > 24;
        cur = { sp, name: api.player(i), passer: top ? { x: sp.x <= 0 ? 16 : -16, y: 23 } : { x: sp.x < 0 ? -3 : 3, y: 32 } };
        state = 'pass'; tState = 0; flight = null; jumpZ = 0;
        st.plate(`SHOT ${i + 1} OF ${N} · ${sp.n}`, cur.name, sp.pts === 3 ? 'Catch & shoot three' : 'Catch & shoot jumper');
        st.dot(i, 'is-cur'); st.cue('');
        hud();
      }
      function shoot(res) {
        state = 'flight'; tState = 0; st.cue('');
        const q = res.quality, made = q === 'perfect' || q === 'good';
        shots.push({ spot: cur.sp.n, quality: q, score: res.score, error: res.error, made });
        if (res.error != null) errs.push(res.error);
        if (made) {
          makes++; streak++; best = Math.max(best, streak);
          if (q === 'perfect') perfects++;
          const bonus = Math.min(streak - 1, 3);
          raw += 6 + 4 * U.sat((res.score - 0.6) / 0.4) + bonus;
          st.dot(i, q === 'perfect' ? 'is-perfect' : 'is-make');
          api.toast(q === 'perfect' ? 'PERFECT' : 'GOOD', q === 'perfect' ? 'gold' : 'good', bonus ? `${streak} in a row · +${bonus} streak bonus` : U.ms(res.error));
          api.sfx(q === 'perfect' ? 'perfect' : 'good');
          if (q === 'perfect') api.flash('gold');
        } else {
          streak = 0;
          const m = MISS[q] || MISS.no_release;
          st.dot(i, 'is-miss');
          api.toast(m[0], q === 'early' || q === 'late' ? 'warn' : 'bad', res.error != null ? `${m[1]} · ${U.ms(res.error)}` : m[1]);
          api.sfx(q === 'no_release' ? 'buzzer' : 'bad');
          if (q !== 'early' && q !== 'late') api.shake();
        }
        Object.assign(api.live, { makes, attempts: i + 1, perfects });
        flight = q === 'no_release' ? null : K.shotFlight(cur.sp.x, cur.sp.y, relZ, OUTCOME[q]);
        hud(true);
      }
      function end() {
        state = 'done';
        const avg = meanAbs(errs);
        api.finish(raw / MAXRAW * 100,
          { makes, attempts: N, perfects, bestStreak: best, avgErrorMs: avg == null ? null : Math.round(avg * 1000), shots },
          [['MAKES', `${makes}/${N}`], ['PERFECT', String(perfects)], ['BEST STREAK', String(best)], ['AVG TIMING', msTxt(avg)]]);
      }

      const hold = sc.hold(api.stage, () => {
        if (state === 'ready' && meter.press(U.now())) { state = 'filling'; st.cue(''); api.sfx('hold'); }
      }, () => { if (state === 'filling') { const r = meter.release(U.now()); if (r) shoot(r); } });

      sc.loop((dt, now) => {
        tState += dt;
        const auto = meter.tick(now);
        if (state === 'filling') {
          if (auto) shoot(auto);
          else { jumpZ = 2.2 * U.easeOut(Math.min(1, meter.v / 0.9)); relZ = 0.9 + jumpZ + 4.5 * U.easeIn(U.sat(meter.v)); }
        } else if (state === 'pass' && tState >= PASS_T) {
          state = 'ready'; tState = 0; api.sfx('tock');
          if (hold.isDown() && meter.press(now)) { state = 'filling'; api.sfx('hold'); }  // caught while holding: straight into the shot
          else st.cue(api.touch ? 'HOLD' : 'HOLD SPACE', 'ok');
        } else if (state === 'ready' && tState > 6) shoot({ quality: 'no_release', score: 0, error: null });
        else if (state === 'flight') {
          jumpZ = Math.max(0, jumpZ - dt * 6);
          if (flight) for (const ev of flight.step(dt)) { if (ev === 'net') swishAt = now; ballSound(api, ev); }
          if ((flight && flight.done) || (!flight && tState > 0.9) || tState > 2.6) { state = 'post'; tState = 0; }
        } else if (state === 'post' && tState > 0.25) next();
        render(now);
      });

      st.cv.onRedraw = () => render(U.now());
      function render(now) {
        meter.draw(now);
        const P = st.P;
        if (!P) return;
        const g = st.cv.begin();
        st.cv.blit(st.layer);
        if (!cur) { K.drawHoopFront(g, P, 0); return; }
        const sp = cur.sp, ps = cur.passer;
        K.drawFloorRing(g, P, sp.x, sp.y, 2, { color: C.rgba(T.accent2, 0.55), dash: [3, 4] });
        [{ x: ps.x, y: ps.y, o: { fill: '#43557a', label: 'PASS', alpha: 0.9 } },
          { x: sp.x, y: sp.y, o: { fill: T.accent, text: initials(cur.name), label: api.last(cur.name), z: jumpZ, glow: state === 'filling' ? T.accent2 : null } }]
          .sort((a, b) => a.y - b.y).forEach(t => K.drawToken(g, P, t.x, t.y, t.o));
        let b = null;
        if (state === 'pass') { const u = U.sat(tState / PASS_T); b = { x: U.lerp(ps.x + 1.2, sp.x + 1.5, u), y: U.lerp(ps.y, sp.y - 0.4, u), z: 0.9 + 3.2 * u * (1 - u) }; }
        else if (state === 'ready') b = { x: sp.x + 1.5, y: sp.y - 0.4, z: 0.9 };
        else if (state === 'filling') b = { x: sp.x + U.lerp(1.5, 0.2, U.sat(meter.v)), y: sp.y - 0.4, z: relZ };
        else if (flight) b = flight.pos();
        st.ballAndHoop(g, b, flight ? flight.rot : 0, U.sat(1 - (now - swishAt) / 380));
      }
      sc.after(250, next);
    },
  });

  // =========================================================================== PRESSURE FREE THROWS
  function makeCrowd(T) {
    const pal = ['#26304a', '#322a40', '#1d3534', '#3b3144', '#262a35', '#433726', '#2c3448', '#373b4a', T.accent, '#d9dee8', '#2a3550', '#4a2530'];
    const fans = [];
    for (let r = 6; r >= 0; r--) {
      for (let x = -40; x <= 40; x += 2) {
        fans.push({ x: x + U.rand(-0.5, 0.5) + (r % 2), y: -12 - r * 2.6, z: 1.4 + r * 2.1, c: U.pick(pal), ph: Math.random() * 10, sp: U.rand(7, 12), stick: Math.random() < 0.08 });
      }
    }
    return fans;
  }
  /** Stands behind the basket: small muted fans that bounce with the noise, then a shadow pass to push them back. */
  function drawCrowd(g, P, fans, noise, t) {
    for (const f of fans) {
      const hop = Math.max(0, Math.sin(t * f.sp + f.ph)) * (0.1 + 0.8 * noise * noise);
      const body = P.p(f.x, f.y, f.z + 0.8 + hop), head = P.p(f.x, f.y, f.z + 1.75 + hop), s = body.s;
      g.fillStyle = f.c;
      g.beginPath(); g.ellipse(body.x, body.y, 0.72 * s, 0.5 * s, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#b48c6e';
      g.beginPath(); g.arc(head.x, head.y, 0.3 * s, 0, Math.PI * 2); g.fill();
      if (f.stick && noise > 0.55) {
        const a = Math.sin(t * 9 + f.ph) * 0.6;
        g.strokeStyle = 'rgba(255,176,32,0.8)'; g.lineWidth = Math.max(1, 0.14 * s);
        g.beginPath(); g.moveTo(head.x, head.y); g.lineTo(head.x + Math.sin(a) * 1.5 * s, head.y - Math.cos(a) * 1.5 * s); g.stroke();
      }
    }
    const top = P.p(0, -30, 18).y, bot = P.p(0, -11, 0).y, sh = g.createLinearGradient(0, top, 0, bot);
    sh.addColorStop(0, 'rgba(4,6,11,0.72)'); sh.addColorStop(1, 'rgba(4,6,11,0.42)');
    g.fillStyle = sh; g.fillRect(0, 0, P.w, bot);
  }

  Mini.registerDrill('freethrows', {
    how: HOW_KEYS + ' Ten free throws while the crowd behind the basket gets louder. The noise makes the window wobble.',
    howTouch: HOW_TOUCH + ' Ten free throws while the crowd behind the basket gets louder. The noise makes the window wobble.',
    start(api) {
      const T = api.theme, N = 10, d = api.difficulty, sc = api.scope;
      const SX = 0, SY = 19.6, SETUP_T = 1.1;
      const st = shootStage(api, w => ({ fit: [[-12, -2, 0], [12, -2, 0], [-9, 23, 0], [9, 23, 0]], camBack: 20, camH: 19, zTop: 14, extra: [[-15, -27, 15], [15, -27, 15]], pad: { l: 10, r: sidePad(w), t: 26, b: 62 } }), { noBg: true });
      const meter = st.meter, fans = makeCrowd(T), bed = Mini.crowd();
      sc.onCleanup(() => bed.stop());
      let i = -1, state = 'wait', tState = 0, flight = null, swishAt = -1e9, base = 0.25, noise = 0.25, relZ = 9, bedT = 0;
      let total = 0, made = 0, perfects = 0, clutchMade = 0, shooter = '';
      const errs = [], shots = [];
      st.dots(N);
      api.foot(api.touch ? 'Press &amp; hold · let go in the green · the window moves with the crowd' : 'Hold <kbd>SPACE</kbd> · release in the green · the window moves with the crowd · <kbd>ESC</kbd> quits');
      const hud = bump => {
        api.hud('a', 'SCORE', Math.round(total), null, bump);
        api.hud('b', 'MADE', `${made}/${Math.max(0, i + (state === 'post' || state === 'flight' ? 1 : 0))}`);
        api.hud('c', 'CROWD', Math.round(82 + noise * 34) + ' dB', noise > 0.75 ? 'bad' : noise > 0.5 ? 'warn' : null);
      };

      function next() {
        i++;
        if (i >= N) return end();
        const f = i / (N - 1), clutch = i >= N - 2;
        meter.reset({ windowSize: U.clamp(U.lerp(0.14, 0.085, f) * (1.15 - 0.4 * d), 0.04, 0.17), speed: U.clamp(0.95 + U.rand(-0.06, 0.06) + 0.1 * d, 0.8, 1.3), pressure: 0.1 + 0.25 * f, center: 0.8 });
        base = U.clamp(0.22 + 0.45 * f + (clutch ? 0.22 : 0), 0, 1);
        state = 'setup'; tState = 0; flight = null;
        shooter = api.player(Math.floor(i / 2));
        st.plate(`FREE THROW ${i + 1} OF ${N}${clutch ? ' · GAME ON THE LINE' : ''}`, shooter, `${(i % 2) + 1} of 2 at the line`);
        st.dot(i, 'is-cur'); st.cue('');
        if (i === N - 2) api.toast('GAME ON THE LINE', 'gold', 'Down one, 0.8 seconds left');
        hud();
      }
      function shoot(res) {
        state = 'flight'; tState = 0; st.cue('');
        const q = res.quality, ok = q === 'perfect' || q === 'good';
        shots.push({ quality: q, score: res.score, error: res.error, made: ok });
        if (res.error != null) errs.push(res.error);
        if (ok) {
          made++; if (q === 'perfect') perfects++; if (i >= N - 2) clutchMade++;
          total += 6 + 4 * U.sat((res.score - 0.6) / 0.4);
          st.dot(i, q === 'perfect' ? 'is-perfect' : 'is-make');
          api.toast(q === 'perfect' ? 'NOTHING BUT NET' : 'GOOD', q === 'perfect' ? 'gold' : 'good', U.ms(res.error));
          api.sfx(q === 'perfect' ? 'perfect' : 'good');
          if (q === 'perfect') api.flash('gold');
        } else {
          const m = MISS[q] || MISS.no_release;
          st.dot(i, 'is-miss');
          api.toast(m[0], q === 'early' || q === 'late' ? 'warn' : 'bad', res.error != null ? `${m[1]} · ${U.ms(res.error)}` : m[1]);
          api.sfx(q === 'no_release' ? 'whistle' : 'bad');
          api.shake();
        }
        Object.assign(api.live, { made, attempts: i + 1, perfects });
        flight = q === 'no_release' ? null : K.shotFlight(SX + 0.3, SY - 0.4, relZ, OUTCOME[q], 0.95);
        hud(true);
      }
      function end() {
        state = 'done';
        const avg = meanAbs(errs);
        api.finish(total,
          { made, attempts: N, pct: made / N, perfects, clutchMade, avgErrorMs: avg == null ? null : Math.round(avg * 1000), shots },
          [['MADE', `${made}/${N}`], ['PERFECT', String(perfects)], ['CLUTCH FTs', `${clutchMade}/2`], ['AVG TIMING', msTxt(avg)]]);
      }

      sc.hold(api.stage, () => {
        if (state === 'ready' && meter.press(U.now())) { state = 'filling'; st.cue(''); api.sfx('hold'); }
      }, () => { if (state === 'filling') { const r = meter.release(U.now()); if (r) shoot(r); } });

      sc.loop((dt, now) => {
        tState += dt;
        const t = now / 1000, focus = state === 'ready' || state === 'filling' ? 0.14 : 0;
        noise = U.clamp(base + focus + 0.1 * Math.sin(t * 2.1) + 0.07 * Math.sin(t * 5.3 + 1), 0, 1);
        meter.wobble = (0.012 + 0.05 * noise) * (0.7 + 0.6 * d);
        bedT += dt;
        if (bedT > 0.1) { bedT = 0; bed.level(state === 'done' ? 0 : noise); hud(); }
        const auto = meter.tick(now);
        if (state === 'setup') {
          if (tState >= SETUP_T) { state = 'ready'; tState = 0; st.cue(api.touch ? 'HOLD' : 'HOLD SPACE', 'ok'); }
        } else if (state === 'filling') {
          if (auto) shoot(auto); else relZ = 0.9 + 4.8 * U.easeIn(U.sat(meter.v));
        } else if (state === 'ready' && tState > 7) shoot({ quality: 'no_release', score: 0, error: null });
        else if (state === 'flight') {
          if (flight) for (const ev of flight.step(dt)) { if (ev === 'net') swishAt = now; ballSound(api, ev); }
          if ((flight && flight.done) || (!flight && tState > 0.9) || tState > 2.6) { state = 'post'; tState = 0; }
        } else if (state === 'post' && tState > 0.35) next();
        render(now, t);
      });

      let lastBounce = -1;
      st.cv.onRedraw = () => render(U.now(), U.now() / 1000);
      function render(now, t) {
        meter.draw(now);
        const P = st.P;
        if (!P) return;
        const g = st.cv.begin();
        K.drawBackdrop(g, P, T);
        drawCrowd(g, P, fans, noise, t);
        st.cv.blit(st.layer);
        K.drawToken(g, P, SX, SY, { fill: T.accent, text: initials(shooter || 'FT'), label: shooter ? api.last(shooter) : '', glow: state === 'filling' ? T.accent2 : null });
        let b = null;
        if (state === 'setup') {
          const u = tState / SETUP_T, k = Math.floor(u * 2.6), ph = (u * 2.6) % 1;
          if (k !== lastBounce && ph > 0.5 && k < 2) { lastBounce = k; api.sfx('bounce'); }
          b = { x: SX + 1.5, y: SY - 0.5, z: k < 2 ? 2.6 * Math.abs(Math.cos(ph * Math.PI)) : 0.9 };
        } else if (state === 'ready') { lastBounce = -1; b = { x: SX + 1.5, y: SY - 0.5, z: 0.9 }; }
        else if (state === 'filling') b = { x: SX + U.lerp(1.5, 0.2, U.sat(meter.v)), y: SY - 0.5, z: relZ };
        else if (flight) b = flight.pos();
        st.ballAndHoop(g, b, flight ? flight.rot : 0, U.sat(1 - (now - swishAt) / 380));
      }
      sc.after(250, next);
    },
  });
})();
