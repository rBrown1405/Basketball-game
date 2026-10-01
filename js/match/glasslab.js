/* Pro BBALL Coach: the glass and the contest (Trial 11): rebounds and box-outs, contests, blocks, steals, a reach-in and
 * loose balls, shared by the Animation Lab (js/lab/lab.js, the "Rebounds, blocks and steals (the glass lab)" group) and the
 * glass audit (tools/audit/glass.js). Everything is planned and played by the game's own code, beat after beat as the
 * choreographer runs them: the shot beat (Director.p_shot: the release, the contest, a block, the miss's carom off the rim
 * or the glass: planRebound, releaseShot), the box-outs and the crash (crashBoards, chaseCarom), the rebound beat
 * (rebound.js: the rebounder's read, run, jump and take; a carom nobody gets, run down off the floor), the turnover beat
 * (p_turnover: a poke and the loose ball, an interception) and the foul beat (p_foul: a reach-in). The offense attacks the
 * right-hand basket (x 88.75).
 *   M.GlassLab.director(W, now, at): the shot lab's Director (M.ShotLab.director) with what a rebound, a steal and a foul
 *   also use on a world with no half-court offense running (no play to go back into after an offensive rebound)
 *   M.GlassLab.stage(c, o): the engine's events o.evs ({ type: 'shot' | 'rebound' | 'turnover' | 'foul', t (s of game clock),
 *   ... }) from o.at (s), each beat started as the one before it fires, as the choreographer's beat loop does
 *   M.GlassLab.scenarios(): [{ id, name, T (s), bodies: [{ team, h, vert }], setup(c) }]
 *   c: { M, a: [the bodies], b (the ball), D, at(t, fn), hold(who, how) } */
(function () {
  'use strict';
  const M = window.PBC.Match;
  const RIM = { x: 88.75, y: 25 };

  function director(W, now, at) {
    const D = M.ShotLab.director(W, now, at);
    if (!W.whistle) W.whistle = () => {};
    // (no half-court offense to go back into after an offensive rebound, and nothing to unlock)
    D.assignSpots = () => {};
    D.unlockAll = () => {};
    // (a free ball off whoever is in its way, once a step, as Director.update has it in the game)
    const step = (M.Tune && M.Tune.clock.step) || 1 / 60;
    const bodies = () => { if (D.ballBodies) D.ballBodies(); at(now() + step, bodies); };
    at(now() + step, bodies);
    return D;
  }

  /** the engine's events, one beat after another: each started as the one before it fires (Director.update's beat loop),
   *  planned at least its gap of game clock after the one before (o.gap for the first), fired when its time comes and what it
   *  waits for is there (beat.waitFor, up to beat.maxWait or 3 s) */
  function stage(c, o) {
    const D = c.D, step = (M.Tune && M.Tune.clock.step) || 1 / 60;
    const evs = o.evs.map((e) => Object.assign({ t: 0 }, e));
    for (const e of evs) D.events.push(e);
    const start = (i) => {
      const ev = evs[i];
      D.ei = D.events.indexOf(ev) + 1;
      const beat = { ev, type: ev.type, t0: D.T, g0: 0, g1: 0, fired: false };
      const gap = i ? Math.max(0, (+ev.t || 0) - (+evs[i - 1].t || 0)) : (o.gap || 0);
      const fn = D['p_' + ev.type];
      let need = 0.05;
      if (fn) { const r = fn.call(D, ev, beat, gap); if (typeof r === 'number' && isFinite(r)) need = r; }
      beat.fireAt = D.T + Math.min(Math.max(need, gap), beat.maxDur || 30);
      D.beat = beat;
      if (beat.onStart) beat.onStart(beat.fireAt);
      const fire = () => {
        if (beat.fired) return;
        if (beat.waitFor && !beat.waitFor() && D.T <= beat.fireAt + (beat.maxWait || 3)) { c.at(D.T + step, fire); return; }
        beat.fired = true;
        if (beat.onFire) beat.onFire();
        if (D.beat === beat) D.beat = null;
        if (i + 1 < evs.length) start(i + 1);
      };
      c.at(beat.fireAt, fire);
    };
    c.at(o.at, () => start(0));
  }

  // { id, name, T (s), bodies, setup(c) }
  function scenarios() {
    const S = [];
    const add = (id, name, T, bodies, setup) => S.push({ id, name, T, bodies, setup });
    const rimA = (x, y) => Math.atan2(RIM.y - y, RIM.x - x);
    // (a spot d ft from the rim at the angle deg off the lane's axis, + to the right of a man facing the rim from half court)
    const spot = (d, deg) => { const a = Math.PI + deg * Math.PI / 180; return { x: RIM.x + Math.cos(a) * d, y: RIM.y + Math.sin(a) * d }; };
    const face = (p, q) => Math.atan2(q.y - p.y, q.x - p.x);
    const stand = (p, xy, f, stance) => { const fa = f != null ? f : rimA(xy.x, xy.y); p.place(xy.x, xy.y, fa); p.setStance(stance || 'ready'); p.setFace(fa); };
    // (a defender between their man and the rim, gap ft off them, in their stance, facing them)
    const guard = (d, m, gap) => { const a = rimA(m.x, m.y), xy = { x: m.x + Math.cos(a) * gap, y: m.y + Math.sin(a) * gap }; stand(d, xy, face(xy, m), 'defense'); };
    // (the choreographer's own bookkeeping for the bodies: every offensive player has a role, which the crash reads; every
    // defender a man)
    const roles = (c) => { for (const p of c.a) { if (p.team === 0) c.D.role[p.id] = { until: 0 }; } };
    const man = (c, d, m) => { c.D.matchup[d.id] = m.id; };
    // (a miss off the given contact, for a scenario about it: the choreographer's own draw otherwise; its arc a typical one,
    // 48 deg, and off the front or the back of the ring a typical depth, so that the ball comes off the rim when and where
    // the scenario has it, whatever the shooter's own aim would make of it)
    const AT = { front: -7.4, back: 7.9 };
    const miss = (c, contact) => { const f = c.D.shotResult; c.D.shotResult = function (ev, sh, spot, kind) { const r = f.call(this, ev, sh, spot, kind); if (r && !r.made && !r.blocked && contact) { r.type = 'miss'; r.contact = contact; r.rattle = false; r.aimArc = 48; r.aimAt = AT[contact]; } return r; }; };

    // --- rebounds and box-outs
    // a missed jumper from the right wing: the defense's big boxes out the offense's big on the weak side and takes it
    const bigs = (c) => {
      const [p, d, o, b] = c.a, s = spot(18, 40);
      stand(p, s); c.hold(p, 'pocket');
      guard(d, s, 4.5); man(c, d, p);
      const ob = spot(7, -35); stand(o, ob, rimA(ob.x, ob.y));
      guard(b, ob, 2.6); man(c, b, o);
      roles(c);
      return s;
    };
    const B4 = [{ team: 0, h: 76 }, { team: 1, h: 76 }, { team: 0, h: 82 }, { team: 1, h: 83 }];
    add('rebDef', 'a missed jumper from the wing: the bigs box out, the defense\'s big takes it under the rim', 4.6, B4, (c) => {
      const s = bigs(c), [p, d, , b] = c.a;
      stage(c, { at: 0.6, evs: [{ type: 'shot', shooter: p.id, kind: 'jumper', x: s.x, y: s.y, made: false, pts: 2, contest: 'contested', defender: d.id, t: 0 }, { type: 'rebound', player: b.id, off: false, t: 1.5 }] });
    });
    add('rebOff', 'the same miss: the offense\'s big beats the box-out for it', 4.6, B4, (c) => {
      const s = bigs(c), [p, d, o] = c.a;
      stage(c, { at: 0.6, evs: [{ type: 'shot', shooter: p.id, kind: 'jumper', x: s.x, y: s.y, made: false, pts: 2, contest: 'contested', defender: d.id, t: 0 }, { type: 'rebound', player: o.id, off: true, t: 1.5 }] });
    });
    add('rebGlass', 'a miss off the glass from the left baseline, taken by the defense\'s big', 4.6, B4, (c) => {
      const [p, d, o, b] = c.a, s = spot(13, -70);
      stand(p, s); c.hold(p, 'pocket'); guard(d, s, 4.5); man(c, d, p);
      const ob = spot(6, 30); stand(o, ob); guard(b, ob, 2.6); man(c, b, o);
      roles(c); miss(c, 'board');
      stage(c, { at: 0.6, evs: [{ type: 'shot', shooter: p.id, kind: 'jumper', x: s.x, y: s.y, made: false, pts: 2, contest: 'contested', defender: d.id, t: 0 }, { type: 'rebound', player: b.id, off: false, t: 1.5 }] });
    });
    // a missed three from the top: it comes off long, and the guard at the elbow catches it on the way down
    add('rebLong', 'a missed three from the top: a long rebound, caught by the guard at the free throw line', 4.8, [{ team: 0, h: 75 }, { team: 1, h: 75 }, { team: 1, h: 77 }, { team: 0, h: 78 }], (c) => {
      const [p, d, g, w] = c.a, s = spot(24.5, 0);
      stand(p, s); c.hold(p, 'pocket'); guard(d, s, 5); man(c, d, p);
      const ws = spot(20, 50); stand(w, ws); guard(g, ws, 5); man(c, g, w);
      roles(c); miss(c, 'front');
      stage(c, { at: 0.6, evs: [{ type: 'shot', shooter: p.id, kind: 'jumper', x: s.x, y: s.y, made: false, pts: 3, contest: 'contested', defender: d.id, t: 0 }, { type: 'rebound', player: g.id, off: false, t: 1.9 }] });
    });
    // a missed corner three comes off to the far side (NBA tracking: misses from the wing and corner favour the weak side)
    add('rebWeak', 'a missed corner three: it comes off the far side to the weak-side defender', 4.8, [{ team: 0, h: 77 }, { team: 1, h: 77 }, { team: 0, h: 81 }, { team: 1, h: 81 }], (c) => {
      const [p, d, o, b] = c.a, s = spot(22.3, 86);
      stand(p, s); c.hold(p, 'pocket'); guard(d, s, 5); man(c, d, p);
      const ob = spot(9, -60); stand(o, ob); guard(b, ob, 2.8); man(c, b, o);
      roles(c); miss(c, 'back');
      stage(c, { at: 0.6, evs: [{ type: 'shot', shooter: p.id, kind: 'jumper', x: s.x, y: s.y, made: false, pts: 3, contest: 'contested', defender: d.id, t: 0 }, { type: 'rebound', player: b.id, off: false, t: 1.7 }] });
    });
    // three on three: every defender finds their man and boxes them out; the one under the rim takes it
    add('box3', 'three on three: every defender boxes out their man, the middle one takes it', 5.0, [{ team: 0, h: 76 }, { team: 1, h: 76 }, { team: 0, h: 80 }, { team: 1, h: 80 }, { team: 0, h: 82 }, { team: 1, h: 83 }], (c) => {
      const [p, d, o1, d1, o2, d2] = c.a, s = spot(19, 25);
      stand(p, s); c.hold(p, 'pocket'); guard(d, s, 4.5); man(c, d, p);
      const q1 = spot(10, -50), q2 = spot(8, 70);
      stand(o1, q1); guard(d1, q1, 3); man(c, d1, o1);
      stand(o2, q2); guard(d2, q2, 3); man(c, d2, o2);
      roles(c);
      stage(c, { at: 0.6, evs: [{ type: 'shot', shooter: p.id, kind: 'jumper', x: s.x, y: s.y, made: false, pts: 2, contest: 'contested', defender: d.id, t: 0 }, { type: 'rebound', player: d2.id, off: false, t: 1.6 }] });
    });
    // a miss the rebounder cannot get to in the air: it comes down, bounces, and they run it down off the floor
    add('rebFloor', 'a miss nobody gets to in the air: it bounces and the guard runs it down', 6.0, [{ team: 0, h: 75 }, { team: 1, h: 75 }, { team: 1, h: 76 }], (c) => {
      const [p, d, g] = c.a, s = spot(23.8, -40);
      stand(p, s); c.hold(p, 'pocket'); guard(d, s, 5.5); man(c, d, p);
      stand(g, spot(30, 30), rimA(spot(30, 30).x, spot(30, 30).y), 'defense');
      roles(c); miss(c, 'front');
      stage(c, { at: 0.6, evs: [{ type: 'shot', shooter: p.id, kind: 'jumper', x: s.x, y: s.y, made: false, pts: 3, contest: 'open', defender: d.id, t: 0 }, { type: 'rebound', player: g.id, off: false, t: 1.4 }] });
    });

    // --- contests
    add('contestTight', 'a tight closeout on a jumper: the high hand up at the ball as it goes', 3.4, [{ team: 0, h: 77 }, { team: 1, h: 77 }], (c) => {
      const [p, d] = c.a, s = spot(19, -20), ds = spot(9, -20);
      stand(p, s); c.hold(p, 'pocket'); stand(d, ds, face(ds, s), 'defense');
      stage(c, { at: 0.6, evs: [{ type: 'shot', shooter: p.id, kind: 'jumper', x: s.x, y: s.y, made: true, pts: 2, contest: 'tight', defender: d.id, t: 0 }] });
    });
    add('contestMid', 'a contested three: the closeout, the hand up toward the release', 3.6, [{ team: 0, h: 76 }, { team: 1, h: 78 }], (c) => {
      const [p, d] = c.a, s = spot(23.8, 45), ds = spot(12, 45);
      stand(p, s); c.hold(p, 'pocket'); stand(d, ds, face(ds, s), 'defense');
      stage(c, { at: 0.6, evs: [{ type: 'shot', shooter: p.id, kind: 'jumper', x: s.x, y: s.y, made: true, pts: 3, contest: 'contested', defender: d.id, t: 0 }] });
    });
    add('contestRim', 'verticality at the rim: the big goes straight up with both hands at the ball', 4.0, [{ team: 0, h: 77 }, { team: 1, h: 83 }], (c) => {
      const [p, d] = c.a, st = spot(26, 30), to = spot(8, 20), ds = spot(3.5, 5);
      stand(p, st); c.hold(p, 'chest'); stand(d, ds, face(ds, st), 'defense');
      c.at(0.05, () => { c.b.dribble(p); p.setStance('dribble'); p.moveTo(to.x, to.y, { speed: 16, face: 'move' }); });
      stage(c, { at: 0.6, evs: [{ type: 'shot', shooter: p.id, kind: 'layup', x: RIM.x - 3, y: RIM.y - 1.5, made: true, pts: 2, contest: 'tight', defender: d.id, t: 0 }] });
    });

    // --- blocks
    add('blockRim', 'a layup blocked at the rim by the help big: the hand meets the ball, it is swatted away', 6.0, [{ team: 0, h: 76 }, { team: 1, h: 84, vert: 80 }, { team: 1, h: 77 }], (c) => {
      const [p, b, g] = c.a, st = spot(26, -30), to = spot(8, -20), bs = spot(5, 25), gs = spot(16, 60);
      stand(p, st); c.hold(p, 'chest'); stand(b, bs, face(bs, st), 'defense'); stand(g, gs, face(gs, st), 'defense');
      c.at(0.05, () => { c.b.dribble(p); p.setStance('dribble'); p.moveTo(to.x, to.y, { speed: 16, face: 'move' }); });
      roles(c);
      stage(c, { at: 0.6, evs: [{ type: 'shot', shooter: p.id, kind: 'layup', x: RIM.x - 3, y: RIM.y + 1.5, made: false, blocked: true, blocker: b.id, pts: 2, contest: 'tight', defender: b.id, t: 0 }, { type: 'rebound', player: g.id, off: false, t: 1.3 }] });
    });
    add('blockJumper', 'a jumper blocked by the closeout: the hand up to the ball just after it leaves', 6.0, [{ team: 0, h: 75 }, { team: 1, h: 80, vert: 80 }, { team: 1, h: 79 }], (c) => {
      const [p, d, g] = c.a, s = spot(16, 15), ds = spot(8, 15), gs = spot(6, -50);
      stand(p, s); c.hold(p, 'pocket'); stand(d, ds, face(ds, s), 'defense'); stand(g, gs, face(gs, s), 'defense');
      roles(c);
      stage(c, { at: 0.6, evs: [{ type: 'shot', shooter: p.id, kind: 'jumper', x: s.x, y: s.y, made: false, blocked: true, blocker: d.id, pts: 2, contest: 'tight', defender: d.id, t: 0 }, { type: 'rebound', player: g.id, off: false, t: 1.3 }] });
    });

    // --- steals, a reach-in, the loose ball
    add('stealPoke', 'a poke steal: the ball knocked loose off the dribble, the defender runs it down', 4.4, [{ team: 0, h: 75 }, { team: 1, h: 76 }], (c) => {
      const [p, d] = c.a, s = spot(26, 20), ds = spot(21, 20);
      stand(p, s); c.hold(p, 'chest'); stand(d, ds, face(ds, s), 'defense');
      c.at(0.05, () => { c.b.dribble(p); p.setStance('dribble'); });
      stage(c, { at: 0.5, evs: [{ type: 'turnover', kind: 'lost_ball', player: p.id, stealer: d.id, t: 0 }] });
    });
    add('stealPass', 'a bad pass read and picked off in the lane', 4.0, [{ team: 0, h: 75 }, { team: 0, h: 78 }, { team: 1, h: 77 }], (c) => {
      const [p, q, d] = c.a, s = spot(25, -10), qs = spot(12, 60), ds = spot(17, 25);
      stand(p, s, face(s, qs)); c.hold(p, 'chest'); stand(q, qs, face(qs, s)); stand(d, ds, face(ds, s), 'defense');
      stage(c, { at: 0.5, evs: [{ type: 'turnover', kind: 'bad_pass', player: p.id, stealer: d.id, t: 0 }] });
    });
    add('reachIn', 'a reach-in on the dribbler: the hand at the ball, the whistle', 3.6, [{ team: 0, h: 75 }, { team: 1, h: 76 }], (c) => {
      const [p, d] = c.a, s = spot(24, -30), ds = spot(17, -45);
      stand(p, s); c.hold(p, 'chest'); stand(d, ds, face(ds, s), 'defense');
      c.at(0.05, () => { c.b.dribble(p); p.setStance('dribble'); });
      stage(c, { at: 0.5, evs: [{ type: 'foul', kind: 'personal', fouler: d.id, on: p.id, t: 0 }] });
    });
    return S;
  }

  M.GlassLab = { director, stage, scenarios, RIM };
})();
