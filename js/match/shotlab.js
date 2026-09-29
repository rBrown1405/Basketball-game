/* Pro BBALL Coach: shot scenarios (Trial 9), shared by the Animation Lab (js/lab/lab.js, the "Shooting (the shot lab)"
 * group) and the shot audit (tools/audit/shot.js). Every shot is planned and thrown by the game's own code: the
 * choreographer's shot beat (Director.p_shot: the approach, the clip and the shooter's own form, the release on the
 * beat, the contest), its free throw beat (p_ft: the official's bounce pass, the routine at the line) and releaseShot
 * (the ball's flight to a real hoop); a catch-and-shoot's pass is staged the way the pass lab stages one
 * (M.PassLab.stagePass). The offense attacks the right-hand basket (x 88.75).
 *   M.ShotLab.director(W, now, at): a Director that only shoots, on a world W (given two hoops, a quiet arena and its
 *   officials), its clock now() and scheduler at(t, fn)
 *   M.ShotLab.stageShot(c, o), M.ShotLab.scenarios(): [{ id, name, T (s), bodies: [{ team, h, hand, form, ft, ref }], setup(c) }]
 *   (form: one of FORMS, the shooter's form; ft: the shooter's free throw routine, in M.Anims.ftRoutine's shape)
 *   c: { M, a: [the bodies], b (the ball), D, at(t, fn), hold(who, how), shoot(o), pass(from, to, o) } */
(function () {
  'use strict';
  const M = window.PBC.Match;
  const RIM = { x: 88.75, y: 25 };

  /** a Director that only shoots (and passes): the game's p_shot, p_ft, releaseShot and passBall on this world's clock */
  function director(W, now, at) {
    // (the world as the Director sees a view: actors by id, a hoop at each end, a quiet arena, its officials)
    if (!W.actor) W.actor = (id) => W.actors[id] || null;
    if (!W.hoops) W.hoops = [new M.Hoop(-1), new M.Hoop(1)];
    if (!W.arena) W.arena = { cheer() {}, setState() {} };
    if (!W.refs) W.refs = [];
    if (!W.nearestRef) W.nearestRef = (x, y) => { let best = null, bd = Infinity; for (const r of W.refs) { const d = Math.hypot(r.x - x, r.y - y); if (d < bd) { bd = d; best = r; } } return best; };
    if (!W.onEmit) W.onEmit = () => {};
    if (!W.look) W.look = (id) => { const a = W.actors[id]; return a ? { height: a.H * 12 } : null; };
    const D = Object.create(M.Director.prototype);
    D.v = W; D.beat = null; D.off = 0; D.def = 1; D.dir = 1; D.hoop = W.hoops[1]; D.rim = { x: D.hoop.rx, y: RIM.y };
    D.role = {}; D.dtask = {}; D.matchup = {}; D.events = []; D.ei = 0; D.cb = {}; D.jobs = []; D.period = 1;
    D.nextFor = () => null;
    D.flowOK = () => false;
    Object.defineProperty(D, 'T', { get: () => now(), set: () => {} });
    D.at = (t, fn) => at(t, fn);
    return D;
  }

  /**
   * one shot (or free throw) beat run the way the choreographer runs one (Director.nextBeat, update, fire): planned at
   * o.at, started at once (onStart) and fired at its time (onFire), waiting as the game's beat waits (beat.waitFor, up
   * to 3 s). o = { at (s), ev: the engine's event ({ type: 'shot' | 'ft', shooter, kind, x, y, made, pts, contest,
   * defender... }), gap (s of game clock to the event: the beat is at least that long) }
   */
  function stageShot(c, o) {
    const D = c.D, step = (M.Tune && M.Tune.clock.step) || 1 / 60;
    const ev = Object.assign({ type: 'shot', t: 0 }, o.ev);
    D.events.push(ev);
    for (const e of o.after || []) D.events.push(e);
    c.at(o.at, () => {
      D.ei = D.events.indexOf(ev) + 1;
      const beat = { ev, type: ev.type, t0: D.T, g0: 0, g1: 0, fired: false };
      const fn = D['p_' + ev.type];
      let need = 0.05;
      if (fn) { const r = fn.call(D, ev, beat, o.gap || 0); if (typeof r === 'number' && isFinite(r)) need = r; }
      beat.fireAt = D.T + Math.min(Math.max(need, o.gap || 0), beat.maxDur || 30);
      D.beat = beat;
      if (beat.onStart) beat.onStart(beat.fireAt);
      const fire = () => {
        if (beat.fired) return;
        if (beat.waitFor && !beat.waitFor() && D.T <= beat.fireAt + 3) { c.at(D.T + step, fire); return; }
        beat.fired = true;
        if (beat.onFire) beat.onFire();
        if (D.beat === beat) D.beat = null;
      };
      c.at(beat.fireAt, fire);
    });
  }

  // two shooters' forms for the side-by-side test (Trial 9: "two different shooters are recognizable by form alone"), the
  // same size and the same ratings: A shoots a quick one-motion shot with a high release, a straight elbow and a long
  // held follow-through; B a two-motion shot from a lower set with the elbow out a little, a bigger dip, a lower jump
  // and a leg kick, the arm down sooner. (A player's own form comes from M.Anims.shotForm; these replace it.)
  const FORMS = {
    A: { motion: 1, speed: 1.08, relH: 0.025, setH: 0.02, flareDeg: 0, jump: 1.18, dip: 0.85, holdS: 0.95, relApexS: 0.06, drift: 1.2, kick: 0, lean: 0 },
    B: { motion: 2, speed: 0.92, relH: -0.03, setH: -0.03, flareDeg: 12, jump: 0.8, dip: 1.3, holdS: 0.4, relApexS: 0.03, drift: 0.6, kick: 1, lean: 4 },
  };

  // { id, name, T (s), bodies, setup(c) }
  function scenarios() {
    const S = [];
    const add = (id, name, T, bodies, setup) => S.push({ id, name, T, bodies, setup });
    const rimA = (x, y) => Math.atan2(RIM.y - y, RIM.x - x);
    // (a spot d ft from the rim at the angle deg off the lane's axis, + to the right of a man facing the rim from half court)
    const spot = (d, deg) => { const a = Math.PI + deg * Math.PI / 180; return { x: RIM.x + Math.cos(a) * d, y: RIM.y + Math.sin(a) * d }; };
    const stand = (c, p, xy, face) => { p.place(xy.x, xy.y, face != null ? face : rimA(xy.x, xy.y)); p.setStance('ready'); p.setFace(face != null ? face : rimA(xy.x, xy.y)); };
    const one = (form) => [{ team: 0, h: 78, form }];
    // jump shots
    for (const f of ['A', 'B']) {
      add('spot' + f, `spot-up jumper from the right wing, 18 ft (shooter ${f})`, 3.4, one(f), (c) => {
        const p = c.a[0], s = spot(18, 40);
        stand(c, p, s); c.hold(p, 'pocket');
        c.shoot({ at: 0.6, ev: { shooter: p.id, kind: 'jumper', x: s.x, y: s.y, made: true, pts: 2, contest: 'open' } });
      });
    }
    for (const f of ['A', 'B']) {
      add('cns' + f, `catch and shoot on the wing, a chest pass from the top (shooter ${f})`, 4.0, [{ team: 0, h: 78, form: f }, { team: 0, h: 75 }], (c) => {
        const p = c.a[0], q = c.a[1], s = spot(22.5, 45), top = spot(26, -5);
        stand(c, p, s, rimA(top.x, top.y) * 0.5 + rimA(s.x, s.y) * 0.5);
        stand(c, q, top, Math.atan2(s.y - top.y, s.x - top.x)); c.hold(q, 'chest');
        c.pass(q, p, { kind: 'chest', at: 1.0, run: false, after: 'shoot' });
        c.shoot({ at: 1.0 + 1e-10, ev: { shooter: p.id, kind: 'catch_shoot', x: s.x, y: s.y, made: true, pts: 3, contest: 'open' } });
      });
    }
    add('twoForms', 'two shooters, the same jumper from the two wings (A on the right, then B on the left)', 5.6, [{ team: 0, h: 78, form: 'A' }, { team: 0, h: 78, form: 'B' }], (c) => {
      const A = c.a[0], B = c.a[1], sA = spot(18, 40), sB = spot(18, -40);
      stand(c, A, sA); stand(c, B, sB); c.hold(A, 'pocket');
      c.shoot({ at: 0.6, ev: { shooter: A.id, kind: 'jumper', x: sA.x, y: sA.y, made: true, pts: 2, contest: 'open' } });
      c.at(3.1, () => c.hold(B, 'pocket'));
      c.shoot({ at: 3.2, ev: { shooter: B.id, kind: 'jumper', x: sB.x, y: sB.y, made: true, pts: 2, contest: 'open' } });
    });
    add('pullup', 'pull-up jumper off the dribble at the elbow', 4.2, one(), (c) => {
      const p = c.a[0], s = spot(16, 30), st = spot(28, 10);
      stand(c, p, st); c.hold(p, 'chest');
      c.at(0.05, () => { c.b.dribble(p); p.setStance('dribble'); p.moveTo(s.x, s.y, { speed: 14, face: 'move' }); });
      c.shoot({ at: 0.9, ev: { shooter: p.id, kind: 'pullup', x: s.x, y: s.y, made: true, pts: 2 } });
    });
    add('stepback', 'step-back three on the left wing', 4.2, one(), (c) => {
      const p = c.a[0], s = spot(24, -35), st = spot(26, -35);
      stand(c, p, st); c.hold(p, 'chest');
      c.at(0.05, () => { c.b.dribble(p); p.setStance('dribble'); const t = spot(20, -35); p.moveTo(t.x, t.y, { speed: 8, face: rimA(t.x, t.y) }); });
      c.shoot({ at: 0.9, ev: { shooter: p.id, kind: 'stepback', x: s.x, y: s.y, made: true, pts: 3 } });
    });
    add('fadeaway', 'fadeaway from the right baseline, 14 ft', 3.6, one(), (c) => {
      const p = c.a[0], s = spot(14, 70);
      stand(c, p, s); c.hold(p, 'pocket');
      c.shoot({ at: 0.6, ev: { shooter: p.id, kind: 'fadeaway', x: s.x, y: s.y, made: true, pts: 2 } });
    });
    add('postFade', 'turnaround post fade from the left block, back to the basket', 3.8, one(), (c) => {
      const p = c.a[0], s = spot(9, -45);
      stand(c, p, s, rimA(s.x, s.y) + Math.PI); p.setStance('postUp'); c.hold(p, 'chest');
      c.shoot({ at: 0.6, ev: { shooter: p.id, kind: 'fadeaway', x: s.x, y: s.y, made: true, pts: 2 } });
    });
    // (shooter A both times, so the page and the audit, whose players' ids and so their drawn forms differ, show the same shot)
    add('open', 'open jumper, the defender back (to compare with the contested one)', 3.6, [{ team: 0, h: 78, form: 'A' }, { team: 1, h: 78 }], (c) => {
      const p = c.a[0], d = c.a[1], s = spot(19, 20), ds = spot(9, 20);
      stand(c, p, s); c.hold(p, 'pocket');
      stand(c, d, ds, Math.atan2(s.y - ds.y, s.x - ds.x)); d.setStance('defense');
      c.shoot({ at: 0.6, ev: { shooter: p.id, kind: 'jumper', x: s.x, y: s.y, made: true, pts: 2, contest: 'open', defender: d.id } });
    });
    add('contested', 'contested jumper, a defender closing out hard', 3.6, [{ team: 0, h: 78, form: 'A' }, { team: 1, h: 78 }], (c) => {
      const p = c.a[0], d = c.a[1], s = spot(19, 20), ds = spot(7, 20);
      stand(c, p, s); c.hold(p, 'pocket');
      stand(c, d, ds, Math.atan2(s.y - ds.y, s.x - ds.x)); d.setStance('defense');
      c.shoot({ at: 0.6, ev: { shooter: p.id, kind: 'jumper', x: s.x, y: s.y, made: true, pts: 2, contest: 'tight', defender: d.id } });
    });
    // the free throw: the official bounces it to the shooter at the line, the routine, the shot
    // (two routines: two dribbles and a deep breath; three dribbles, a spin of the ball and a deep breath)
    for (const [id, rt, words] of [['ft', { dribbles: 2, period: 0.63, spin: 0, breath: 1 }, 'two dribbles and a deep breath'], ['ft2', { dribbles: 3, period: 0.58, spin: 1, breath: 1 }, 'three dribbles, a spin of the ball and a deep breath']]) {
      add(id, `free throw: the bounce pass from the official, ${words}, the shot`, 9.5, [{ team: 0, h: 78, ft: rt }, { ref: true }], (c) => {
        const p = c.a[0], r = c.a[1], s = { x: RIM.x - 15 - 4.9, y: 25 };
        stand(c, p, { x: s.x - 6, y: 30 }); r.place(RIM.x - 4, 16, Math.PI * 0.7); r.setStance('refStand');
        c.hold(r, 'chest');
        c.shoot({ at: 0.3, ev: { type: 'ft', shooter: p.id, made: true, num: 1, of: 1 } });
      });
    }
    // finishes at the rim
    const drive = (c, p, from, to, speed) => {
      stand(c, p, from); c.hold(p, 'chest');
      c.at(0.05, () => { c.b.dribble(p); p.setStance('dribble'); p.moveTo(to.x, to.y, { speed, face: 'move' }); });
    };
    add('layupR', 'right-hand layup, a drive from the right wing', 4.0, one(), (c) => {
      const p = c.a[0]; drive(c, p, spot(26, 45), spot(8, 30), 17);
      c.shoot({ at: 0.6, ev: { shooter: p.id, kind: 'layup', x: RIM.x - 3, y: RIM.y - 1.5, made: true, pts: 2 } });
    });
    add('layupLefty', 'a left-hander\'s layup, a drive from the left wing', 4.0, [{ team: 0, h: 78, hand: 'L' }], (c) => {
      const p = c.a[0]; drive(c, p, spot(26, -45), spot(8, -30), 17);
      c.shoot({ at: 0.6, ev: { shooter: p.id, kind: 'layup', x: RIM.x - 3, y: RIM.y + 1.5, made: true, pts: 2 } });
    });
    add('layupLeftSide', 'a right-hander\'s layup from the left side', 4.0, one(), (c) => {
      const p = c.a[0]; drive(c, p, spot(26, -45), spot(8, -30), 17);
      c.shoot({ at: 0.6, ev: { shooter: p.id, kind: 'layup', x: RIM.x - 3, y: RIM.y + 1.5, made: true, pts: 2 } });
    });
    add('reverse', 'reverse layup along the baseline', 4.2, one(), (c) => {
      const p = c.a[0]; drive(c, p, spot(22, 75), spot(6, 80), 16);
      c.shoot({ at: 0.6, ev: { shooter: p.id, kind: 'reverse', x: RIM.x - 1, y: RIM.y + 2.5, made: true, pts: 2 } });
    });
    add('floater', 'floater in the lane', 3.6, one(), (c) => {
      const p = c.a[0]; drive(c, p, spot(24, 5), spot(10, 0), 15);
      c.shoot({ at: 0.6, ev: { shooter: p.id, kind: 'floater', x: RIM.x - 9, y: RIM.y, made: true, pts: 2 } });
    });
    add('hook', 'hook shot from the right block', 3.6, [{ team: 0, h: 83 }], (c) => {
      const p = c.a[0], s = spot(7, 50);
      stand(c, p, s, rimA(s.x, s.y) + Math.PI * 0.5); c.hold(p, 'chest');
      c.shoot({ at: 0.6, ev: { shooter: p.id, kind: 'hook', x: s.x, y: s.y, made: true, pts: 2 } });
    });
    add('dunk1', 'one-foot dunk on the break', 4.2, [{ team: 0, h: 79, vert: 90 }], (c) => {
      const p = c.a[0]; drive(c, p, spot(34, 15), spot(8, 10), 21);
      c.shoot({ at: 0.6, ev: { shooter: p.id, kind: 'dunk', twoHand: false, x: RIM.x - 2, y: RIM.y, made: true, pts: 2 } });
    });
    add('dunk2', 'two-foot power dunk', 4.2, [{ team: 0, h: 81, vert: 85 }], (c) => {
      const p = c.a[0]; drive(c, p, spot(30, -15), spot(8, -10), 18);
      c.shoot({ at: 0.6, ev: { shooter: p.id, kind: 'dunk', twoHand: true, x: RIM.x - 2, y: RIM.y, made: true, pts: 2 } });
    });
    add('putback', 'putback from under the rim', 3.2, [{ team: 0, h: 81 }], (c) => {
      const p = c.a[0], s = spot(4.5, 30);
      stand(c, p, s); c.hold(p, 'chest');
      c.shoot({ at: 0.4, ev: { shooter: p.id, kind: 'layup', x: s.x, y: s.y, made: true, pts: 2 } });
    });
    add('putbackDunk', 'putback dunk from under the rim', 3.2, [{ team: 0, h: 82, vert: 85 }], (c) => {
      const p = c.a[0], s = spot(4.5, -20);
      stand(c, p, s); c.hold(p, 'chest');
      c.shoot({ at: 0.4, ev: { shooter: p.id, kind: 'dunk', x: s.x, y: s.y, made: true, pts: 2 } });
    });
    add('tip', 'tip-in at the rim', 3.0, [{ team: 0, h: 81 }], (c) => {
      const p = c.a[0], s = spot(4, 10);
      stand(c, p, s); c.hold(p, 'chest');
      c.shoot({ at: 0.4, ev: { shooter: p.id, kind: 'tip', x: s.x, y: s.y, made: true, pts: 2 } });
    });
    add('alley', 'alley-oop from a lob at the top', 4.4, [{ team: 0, h: 80, vert: 90 }, { team: 0, h: 75 }], (c) => {
      const p = c.a[0], q = c.a[1], top = spot(27, -10);
      stand(c, q, top); c.hold(q, 'chest');
      stand(c, p, spot(20, 60));
      c.at(0.3, () => { const t = spot(6, 20); p.moveTo(t.x, t.y, { speed: 16, face: 'move' }); });
      c.pass(q, p, { kind: 'lob', at: 1.0, cs: spot(4, 10), run: false });
      c.shoot({ at: 1.0 + 1e-10, ev: { shooter: p.id, kind: 'alley', x: RIM.x - 2.5, y: RIM.y - 1, made: true, pts: 2 } });
    });
    return S;
  }

  M.ShotLab = { director, stageShot, scenarios, FORMS, RIM };
})();
