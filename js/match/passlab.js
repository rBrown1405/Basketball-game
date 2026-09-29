/* Pro BBALL Coach: two-player pass scenarios (Trial 10), shared by the Animation Lab (js/lab/lab.js, the "Passing (two
 * players)" group) and the pass audit (tools/audit/pass.js). Each pass is staged the way the choreographer stages one
 * (choreo.js p_pass): the receiver shows a target and turns to the passer, the passer turns to the catch spot, winds up,
 * steps in and lets it go at the clip's release; the throw and the catch are the game's own (Director.passBall,
 * planThrow, the receiver's catch in actor.js).
 *   M.PassLab.director(W, now, at): a Director that only passes, on a world W, its clock now() and scheduler at(t, fn)
 *   M.PassLab.stagePass(c, from, to, o), M.PassLab.scenarios(): [{ id, name, T (s), setup(c) }]
 *   c: { M, p (the passer), r (the receiver), b (the ball), D, at(t, fn), stage(from, to, o), hold(who) } */
(function () {
  'use strict';
  const M = window.PBC.Match;

  /** a Director that only passes: the game's passBall, catchLead and afterCatch, on this world's clock */
  function director(W, now, at) {
    const D = Object.create(M.Director.prototype);
    D.v = W; D.beat = null; D.rim = { x: 5.25, y: 25 };
    D.nextFor = () => null;
    Object.defineProperty(D, 'T', { get: () => now(), set: () => {} });
    D.at = (t, fn) => at(t, fn);
    return D;
  }

  /**
   * one pass staged as p_pass stages it: o = { kind, at (the release, s), cs (the catch spot; where the receiver is),
   * run (the receiver runs to the catch spot, true unless false), after: 'hold' | 'dribble' | 'shoot' }
   */
  function stagePass(c, from, to, o) {
    const b = c.b, kind = o.kind || 'chest';
    // (a variation, Trial 10: o.variant 'btb' | 'whip' | 'nolook' (o.decoy: where the eyes go), o.fake: a pass fake to that
    // point first)
    const side = o.variant === 'btb' || o.variant === 'whip';
    const clipName = o.variant === 'btb' ? 'passBehindBack' : o.variant === 'whip' ? 'passWhip' : M.Director.PASS_CLIP[kind] || 'passChest', clip = M.Anims.get(clipName);
    const windup = clip ? clip.events.release : 0.26;
    const fireAt = o.at;
    // (a pass fake first, as the choreographer puts it in: before the turn to the pass)
    if (o.fake && c.D.passFakeAt) c.D.passFakeAt(from, o.fake, fireAt - windup - 0.45 - (M.Anims.get('passFake').dur + 0.08), 0);
    c.at(fireAt - windup - 0.5, () => {
      // (planned half a second before the turn: where the ball goes, and how long it flies)
      const cs = o.cs ? { x: o.cs.x, y: o.cs.y } : { x: to.x, y: to.y };
      const dist = Math.hypot(cs.x - from.x, cs.y - from.y);
      const flight = Math.min(1.6, Math.max(0.25, dist / (M.Director.PASS_SPEED[kind] || 36) + (kind === 'lob' || kind === 'alley' ? 0.35 : 0)));
      const tCatch = fireAt + flight - 0.05;
      let through = false;
      if (o.run !== false && Math.hypot(to.x - cs.x, to.y - cs.y) > 0.3) through = c.D.toCatchSpot ? c.D.toCatchSpot(from, to, cs, kind, tCatch) : !!to.moveTo(cs.x, cs.y, { by: tCatch, speed: to.maxSpeed, face: 'move', pace: 5.5 }) && false;
      if (!through) c.at(fireAt + flight - 0.45, () => to.setFace({ x: from.x, y: from.y, passer: true }));
      c.at(fireAt - windup - 0.45, () => {
        if (to.expectPass) to.expectPass(from, { kind });
        if (b.holder === from && b.state === 'dribble' && b.gatherSoon) b.gatherSoon(from, 'chest');
        if (o.variant === 'nolook' && o.decoy) { from.lookAt(o.decoy, { hold: 0.45 + windup + 0.25 }); c.at(fireAt + 0.25, () => { if (from.look_ === o.decoy) from.lookAt(null, { hold: 1e-6 }); }); }
        if (b.holder !== from || (from.isBusy() && !(from.clip && from.clip.ending))) return;
        if (!side) { from.setFace({ x: cs.x, y: cs.y }); from.aimAt(cs, fireAt + 0.2); }
      });

      c.at(fireAt - windup - (M.Director.PASS_CLIP_LEAD != null ? M.Director.PASS_CLIP_LEAD : 0.02), () => {
        if (b.holder !== from) return;
        if (b.state === 'dribble') b.give(from, 'chest');
        if (!side) { from.setFace({ x: cs.x, y: cs.y }); from.aimAt(cs, fireAt + 0.2); }
        from.play(clipName, { speed: 1 });
        if (side) { /* (thrown out to the side, on the move or not) */ } else if (c.D.stepInto) c.D.stepInto(from, cs, kind, fireAt); else from.moveTo(from.x, from.y, { speed: 3 });
      });
      c.at(fireAt - (M.Director.pushLead ? M.Director.pushLead(clip) : 0.07), () => {
        if (b.holder !== from || !c.D.planThrow) return;
        c.D.planThrow(from, to, kind, flight, o.run !== false && Math.hypot(to.x - cs.x, to.y - cs.y) <= Math.max(1.5, to.maxSpeed * 0.85 * flight) ? cs : null, fireAt);
      });
      c.at(fireAt, () => {
        if (b.holder !== from) b.give(from, 'chest');
        const aim = o.run !== false && Math.hypot(to.x - cs.x, to.y - cs.y) <= Math.max(1.5, to.maxSpeed * 0.85 * flight) ? cs : null;
        c.D.passBall(from, to, kind, flight, () => {
          if (o.after === 'dribble') b.dribble(to);
          else to.ballHold = o.after === 'shoot' ? 'pocket' : 'chest';
        }, aim, o.variant ? { variant: o.variant } : null);
        from.setFace('move');
      });
    });
  }

  // { id, name, T (s), setup(c) }
  function scenarios() {
    const S = [];
    const add = (id, name, T, setup) => S.push({ id, name, T, setup });
    // (the passer at the middle of the court facing the receiver D ft away, the ball in the passer's hands at the chest)
    const face = (c, d, side) => {
      c.p.place(47, 25, 0); c.p.setStance('ready');
      c.r.place(47 + d, 25 + (side || 0), Math.PI); c.r.setStance('ready');
      c.p.setFace(0); c.r.setFace(Math.PI);
      c.hold(c.p);
    };
    for (const [kind, d] of [['chest', 15], ['bounce', 13], ['overhead', 20], ['lob', 18], ['kick', 16], ['entry', 12]]) {
      add(kind, `${kind} pass, ${d} ft, both standing`, 2.6, (c) => { face(c, d); c.stage(c.p, c.r, { kind, at: 1.0, run: false }); });
    }
    add('skip', 'skip pass, 34 ft across', 2.9, (c) => { face(c, 34); c.stage(c.p, c.r, { kind: 'overhead', at: 1.0, run: false }); });
    add('outlet', 'outlet, 44 ft, the receiver running up the floor', 3.2, (c) => {
      c.p.place(10, 20, 0); c.p.setStance('ready'); c.p.setFace(0); c.hold(c.p);
      c.r.place(30, 40, 0); c.r.setStance('ready');
      c.at(0.2, () => c.r.moveTo(80, 40, { speed: 18, face: 'move' }));
      c.stage(c.p, c.r, { kind: 'outlet', at: 1.2, cs: { x: 50, y: 40 } });
    });
    add('outletRun', 'outlet ahead of a sprinter, caught on the run', 3.4, (c) => {
      c.p.place(10, 20, 0); c.p.setStance('ready'); c.p.setFace(0); c.hold(c.p);
      c.r.place(20, 42, 0); c.r.setStance('ready');
      c.at(0.1, () => c.r.moveTo(90, 42, { speed: 26, face: 'move' }));
      c.stage(c.p, c.r, { kind: 'outlet', at: 1.2, cs: { x: 58, y: 42 } });
    });
    add('cutter', 'chest pass to a cutter, caught on the run', 3.0, (c) => {
      face(c, 16, 10);
      c.r.setFace('move');
      c.at(0.3, () => c.r.moveTo(63, 5, { speed: 14, face: 'move' }));
      c.stage(c.p, c.r, { kind: 'chest', at: 1.1, cs: { x: 63, y: 22 } });
    });
    add('popOut', 'chest pass to a man popping out to the wing', 3.0, (c) => {
      c.p.place(47, 25, 0); c.p.setStance('ready'); c.p.setFace(0); c.hold(c.p);
      c.r.place(64, 14, Math.PI * 0.5); c.r.setStance('ready');
      c.stage(c.p, c.r, { kind: 'chest', at: 1.2, cs: { x: 62, y: 22 } });
    });
    add('facingAway', 'chest pass to a man facing away (turned 120 deg)', 2.8, (c) => {
      face(c, 15); c.r.place(62, 25, Math.PI + 2.1); c.r.setFace(Math.PI + 2.1);
      c.stage(c.p, c.r, { kind: 'chest', at: 1.0, run: false });
    });
    add('kickOut', 'a pass off the dribble (kick-out)', 3.0, (c) => {
      face(c, 16);
      c.at(0.05, () => { c.b.dribble(c.p); c.p.setStance('dribble'); });
      c.stage(c.p, c.r, { kind: 'kick', at: 1.4, run: false });
    });
    add('catchDribble', 'the catch into a dribble', 2.8, (c) => { face(c, 15); c.stage(c.p, c.r, { kind: 'chest', at: 1.0, run: false, after: 'dribble' }); });
    add('catchDrive', 'caught on the move into a dribble drive', 3.0, (c) => {
      face(c, 16, 10);
      c.r.setFace('move');
      c.at(0.3, () => c.r.moveTo(63, 5, { speed: 12, face: 'move' }));
      c.stage(c.p, c.r, { kind: 'chest', at: 1.1, cs: { x: 63, y: 20 }, after: 'dribble' });
    });
    add('catchPass', 'caught and swung straight on (catch and pass)', 3.4, (c) => {
      face(c, 15);
      c.stage(c.p, c.r, { kind: 'chest', at: 1.0, run: false });
      c.stage(c.r, c.p, { kind: 'chest', at: 1.75, run: false });
    });
    // (the throw-in as the choreographer throws it, Director.p_inbound's onFire: the clip from its push, the pass planned at
    // once and let go at the clip's release)
    add('inbound', 'an inbound pass from out of bounds', 2.6, (c) => {
      c.p.place(47, -0.5, Math.PI / 2); c.p.setStance('inbound'); c.p.setFace(Math.PI / 2); c.p.ballHold = 'over'; c.hold(c.p); c.p.ballHold = 'over';
      c.r.place(49, 12, -Math.PI / 2); c.r.setStance('ready'); c.r.setFace({ x: 47, y: 0 });
      c.at(0.6, () => c.r.expectPass && c.r.expectPass(c.p, { kind: 'chest' }));
      c.at(1.0, () => {
        const by = c.p, to = c.r, b = c.b;
        by.ballHold = 'chest';
        const dur = Math.max(0.35, Math.hypot(to.x - by.x, to.y - by.y) / 30);
        by.aimAt(to, c.D.T + 0.4);
        const ic = M.Anims.get('passInbound'), ie = ic.events, t0 = ie.push, lead = ie.release - t0;
        by.play('passInbound', { t0, fadeIn: 0.05 });
        c.D.passSoon(by, to, 'chest', dur, ic, c.D.T - t0, c.D.T + lead, null);
        c.at(c.D.T + lead, () => { if (b.holder === by) c.D.passBall(by, to, 'chest', dur, () => { to.ballHold = 'chest'; }); });
      });
    });
    // (the variations, Trial 10)
    add('btb', 'behind the back to a man on the left, off the dribble', 3.0, (c) => {
      c.p.place(40, 25, 0); c.p.setStance('ready'); c.p.setFace(0); c.hold(c.p);
      c.r.place(44, 37, -Math.PI / 2); c.r.setStance('ready'); c.r.setFace({ x: 40, y: 25 });
      c.at(0.05, () => { c.b.dribble(c.p); c.p.setStance('dribble'); c.p.moveTo(56, 25, { speed: 9, face: 'move' }); });
      c.stage(c.p, c.r, { kind: 'chest', at: 1.3, run: false, variant: 'btb' });
    });
    add('whip', 'a one-handed whip to the corner on the right', 2.8, (c) => {
      c.p.place(40, 25, 0); c.p.setStance('ready'); c.p.setFace(0); c.hold(c.p);
      c.r.place(43, 11, Math.PI / 2); c.r.setStance('ready'); c.r.setFace({ x: 40, y: 25 });
      c.stage(c.p, c.r, { kind: 'kick', at: 1.0, run: false, variant: 'whip' });
    });
    add('noLook', 'a no-look pass (the eyes on the rim)', 2.8, (c) => {
      c.p.place(47, 25, 0); c.p.setStance('ready'); c.p.setFace(0); c.hold(c.p);
      c.r.place(60, 31, Math.PI); c.r.setStance('ready'); c.r.setFace({ x: 47, y: 25 });
      c.stage(c.p, c.r, { kind: 'chest', at: 1.0, run: false, variant: 'nolook', decoy: { x: 55, y: 10 } });
    });
    add('fake', 'a pass fake, then the pass the other way', 3.4, (c) => {
      c.p.place(47, 25, 0); c.p.setStance('ready'); c.p.setFace(0); c.hold(c.p);
      c.r.place(60, 33, Math.PI); c.r.setStance('ready'); c.r.setFace({ x: 47, y: 25 });
      c.stage(c.p, c.r, { kind: 'chest', at: 1.9, run: false, fake: { x: 58, y: 14 } });
    });
    add('backForth', 'passing back and forth, four passes', 6.2, (c) => {
      face(c, 14);
      c.stage(c.p, c.r, { kind: 'chest', at: 1.0, run: false });
      c.stage(c.r, c.p, { kind: 'chest', at: 2.3, run: false });
      c.stage(c.p, c.r, { kind: 'bounce', at: 3.6, run: false });
      c.stage(c.r, c.p, { kind: 'overhead', at: 4.9, run: false });
    });
    return S;
  }

  M.PassLab = { director, stagePass, scenarios };
})();
