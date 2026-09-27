/* Pro BBALL Coach: Animation Lab (lab.html).
 * A test bench for the player animation: pick a scenario (walking, jogging, sprinting, cuts, turns, the defensive
 * slide, dribbling and dribble moves, every shot, finish, pass and defensive move), play it at any speed, pause and
 * step frame by frame (forward and back), orbit the camera, and turn on debug overlays: planted-foot locks with a
 * slide meter, gait phase, duty factor, cadence and stride, joints held at a limit, the skeleton, onion skin.
 * Everything runs on the game's own animation code (rig, poses, clips, actors, ball); every scenario is seeded and
 * simulated in fixed steps, so a moment is reproducible exactly: "Copy report" gives scenario, frame and settings. */
(function () {
  'use strict';
  const M = window.PBC.Match, U = M.U, RG = M.Rig, A = M.Anims, CH = RG.CH, J = RG.J;
  const D = Math.PI / 180;
  const FRAME = 1 / 60, SUB = 1 / 120;

  // ------------------------------------------------------------ seeded random: a scenario replays exactly
  let rs = 1;
  const seeded = () => {
    rs = (rs + 0x6D2B79F5) | 0;
    let t = Math.imul(rs ^ (rs >>> 15), 1 | rs);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const reseed = (s) => { rs = (s >>> 0) || 1; };
  Math.random = seeded;

  // ------------------------------------------------------------ storage (per-viewer conveniences only)
  const store = {
    get(k, d) { try { const v = localStorage.getItem('pbcLab.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('pbcLab.' + k, JSON.stringify(v)); } catch (e) { /* private window */ } },
  };

  // ------------------------------------------------------------ teams and players
  const HOME = { colors: { primary: '#1d6fd1', secondary: '#f4f6fa' }, uniform: { jersey: '#f4f6fa', number: '#1d6fd1', trim: '#1d6fd1', shorts: '#f4f6fa' }, court: {} };
  const AWAY = { colors: { primary: '#b0282e', secondary: '#f4f6fa' }, uniform: { jersey: '#b0282e', number: '#ffffff', trim: '#1b1b1b', shorts: '#b0282e' }, court: {} };
  const leagues = {};
  function playerPool(gender) {
    const key = gender === 'F' ? 'women' : 'men';
    if (!leagues[key]) {
      reseed(4);
      let S = null;
      try { S = PBC.League.create({ leagueKey: key, seed: 4 }); } catch (e) { console.warn('lab: league', e); }
      leagues[key] = S ? Object.values(S.players) : [];
    }
    return leagues[key];
  }
  /** a player look near the lab's settings (height, hand), from a generated league for a real face and body */
  function makeLook(set, idx) {
    const pool = playerPool(set.gender);
    let best = null, bd = 1e9;
    for (const p of pool) {
      if (!p.look) continue;
      const d = Math.abs((p.hgt || 78) - set.height) + (idx ? ((p.id || 0) % 7) * 0.01 : 0) + (best && idx && p === best ? 1 : 0);
      if (d < bd && !(idx && lastPick[0] === p)) { bd = d; best = p; }
    }
    if (idx === 0) lastPick[0] = best;
    const p = best || {};
    return {
      id: 'lab' + idx, teamIdx: idx ? 1 : 0, first: p.first || 'Lab', last: p.last || 'Player' + idx, num: idx ? 21 : 15, pos: p.pos || 'G',
      height: idx ? set.height2 : set.height, weight: Math.round(215 * Math.pow((idx ? set.height2 : set.height) / 78, 2.2)),
      hand: idx ? 'R' : set.hand, gender: set.gender, look: p.look, speed: set.speed, agility: set.agility,
      vert: (p.r && p.r.vert) || 65, handle: (p.r && p.r.handle) || 60,
    };
  }
  const lastPick = [null];

  // ------------------------------------------------------------ the lab's world (stands in for the game view)
  class World {
    constructor() {
      this.actors = {}; this.onCourt = [[], []]; this.list = [];
      this.ball = null; this.opts = { ai: { moveSpeed: 50 } };
    }
    teamLook(t) { return t === 1 ? AWAY : HOME; }
    sound() {}
    add(look, team) {
      const a = new M.Actor(this, look, team, 'player');
      this.actors[a.id] = a; this.onCourt[team].push(a.id); this.list.push(a);
      a.sk.limHits = new Uint8Array(RG.NCH);
      return a;
    }
  }

  // ------------------------------------------------------------ scenarios
  // ctx: { W, a (the player), d (a second player, when asked for), b (ball), f0 (start facing), fx, fy (forward),
  // rx, ry (right), x0, y0, at(t, fn), tick }
  const SCN = [];
  const add = (group, id, name, dur, setup, extra) => SCN.push(Object.assign({ group, id, name, dur, setup, loop: true }, extra || {}));
  const ahead = (ctx, dist, side) => [ctx.a.x + ctx.fx * dist + ctx.rx * (side || 0), ctx.a.y + ctx.fy * dist + ctx.ry * (side || 0)];
  const go = (ctx, dist, speed, side, o) => { const p = ahead(ctx, dist, side); ctx.a.moveTo(p[0], p[1], Object.assign({ speed }, o || {})); };

  add('Locomotion', 'stand', 'Standing', 6, (c) => { c.a.setStance('stand'); });
  add('Locomotion', 'ready', 'Ready stance', 6, (c) => { c.a.setStance('ready'); });
  add('Locomotion', 'walk', 'Walk', 8, (c) => { c.a.setStance('stand'); c.at(0.3, () => go(c, 300, 4.5)); });
  add('Locomotion', 'jog', 'Jog', 7, (c) => { c.a.setStance('stand'); c.at(0.3, () => go(c, 300, 10)); });
  add('Locomotion', 'run', 'Run', 7, (c) => { c.a.setStance('stand'); c.at(0.3, () => go(c, 300, 14)); });
  add('Locomotion', 'sprint', 'Sprint', 7, (c) => { c.a.setStance('stand'); c.at(0.3, () => go(c, 400, 26)); });
  add('Locomotion', 'ramp', 'Speed ramp 0 to top and back', 15, (c) => { c.a.setStance('stand'); }, {
    tick(c, t) {
      if (Math.abs(t * 10 - Math.round(t * 10)) > 1e-6) return;
      const v = t < 1 ? 0 : t < 8 ? (t - 1) / 7 * 26 : t < 10 ? 26 : t < 14 ? (14 - t) / 4 * 26 : 0;
      if (v < 0.4) { if (c.a.speed > 0.4 || c._moving) { c.a.stop(); c._moving = false; } } else { go(c, 200, v); c._moving = true; }
    },
  });
  add('Locomotion', 'startstop', 'Start and stop', 9, (c) => {
    c.a.setStance('ready');
    c.at(0.5, () => go(c, 36, 24));
    c.at(4.6, () => c.a.moveTo(c.x0, c.y0, { speed: 24, face: c.f0 + Math.PI }));
  });
  add('Locomotion', 'cut', 'Run and cut 90 degrees', 7, (c) => {
    c.a.setStance('stand');
    c.at(0.3, () => go(c, 80, 15));
    c.at(2.4, () => go(c, 0, 15, 60));
    c.at(4.4, () => go(c, 80, 15));
  });
  add('Locomotion', 'turn', 'Turn in place 180', 5.2, (c) => {
    c.a.setStance('ready');
    c.at(0.6, () => c.a.setFace(c.f0 + Math.PI));
    c.at(2.2, () => c.a.setFace(c.f0));
    c.at(3.8, () => c.a.setFace(c.f0 + Math.PI));
  });
  add('Locomotion', 'sidestep', 'Sidestep in the ready stance', 5, (c) => {
    c.a.setStance('ready'); c.a.setFace(c.f0);
    for (let k = 0; k < 3; k++) c.at(0.4 + k * 1.5, () => { go(c, 0, 4, k % 2 ? -5 : 5); c.a.setFace(c.f0); });
  });
  add('Locomotion', 'help', 'Help defender recovers 16 ft (turns, runs, squares up)', 4, (c) => {
    c.a.setStance('ready'); c.a.setFace(() => c.f0); c.a.faceLock = true;
    c.at(0.4, () => go(c, 0, 14, 16));
  });
  // (his man cuts 14 ft across at ~7 ft/s, stops, drifts back at ~5 ft/s: the defender follows him, eyes on the ball)
  add('Locomotion', 'shadow', 'Help defender shadows his man across and back', 6.6, (c) => {
    c.a.setStance('ready'); c.a.setFace(() => c.f0); c.a.faceLock = true;
    c.m = { x: c.x0, y: c.y0, vx: 0, vy: 0 };
    c.a.track(() => c.m);
  }, {
    tick(c, t) {
      const s = t < 0.4 ? 0 : t < 2.4 ? 7 * (t - 0.4) : t < 3.4 ? 14 : Math.max(0, 14 - 5 * (t - 3.4));
      const v = t < 0.4 ? 0 : t < 2.4 ? 7 : t < 3.4 || s <= 0 ? 0 : -5;
      c.m.x = c.x0 + c.rx * s; c.m.y = c.y0 + c.ry * s; c.m.vx = c.rx * v; c.m.vy = c.ry * v;
    },
  });
  add('Locomotion', 'jumpstop', 'Jump stop from a run', 3.4, (c) => {
    c.a.setStance('ready');
    c.at(0.3, () => go(c, 60, 12));
    c.at(1.7, () => c.a.jumpStop());
  });
  // (in the defensive stance: out of any other a player going back that far turns and runs)
  add('Locomotion', 'backpedal', 'Backpedal', 5, (c) => {
    c.a.setStance('defense'); c.a.setFace(c.f0);
    c.at(0.4, () => { go(c, -60, 9); c.a.setFace(c.f0); });
  });
  add('Locomotion', 'circle', 'Jog a circle', 10, (c) => { c.a.setStance('stand'); }, {
    tick(c, t) {
      if (t < 0.3 || Math.abs(t * 20 - Math.round(t * 20)) > 1e-6) return;
      const R = 14, w = 11 / R, ang = (t - 0.3) * w + 0.6;
      const cx = c.x0 - c.rx * R, cy = c.y0 - c.ry * R;
      c.a.moveTo(cx + Math.cos(ang) * R * c.rx + Math.sin(ang) * R * c.fx, cy + Math.cos(ang) * R * c.ry + Math.sin(ang) * R * c.fy, { speed: 11 });
    },
  });
  // (a real slide's pace: elite players cover a 5 m out-and-back shuffle in ~3.6-3.9 s, peaking ~11-12 ft/s)
  add('Locomotion', 'slide', 'Defensive slide', 7.0, (c) => {
    c.a.setStance('defense'); c.a.setFace(c.f0);
    for (let k = 0; k < 4; k++) c.at(0.4 + k * 1.6, () => { go(c, 0, 10, k % 2 ? -12 : 12); c.a.setFace(c.f0); });
  });
  add('Dribbling', 'dwalk', 'Dribble walking', 7, (c) => { c.b.dribble(c.a); c.a.setStance('dribble'); c.at(0.4, () => go(c, 200, 5)); });
  add('Dribbling', 'djog', 'Dribble jogging', 7, (c) => { c.b.dribble(c.a); c.a.setStance('dribble'); c.at(0.4, () => go(c, 200, 11)); });
  add('Dribbling', 'dsprint', 'Speed dribble', 7, (c) => { c.b.dribble(c.a); c.a.setStance('dribble'); c.at(0.4, () => go(c, 300, 19)); });
  add('Dribbling', 'dstand', 'Dribble in place', 6, (c) => { c.b.dribble(c.a); c.a.setStance('dribble'); });
  for (const [id, name] of [['cross', 'Crossover'], ['btl', 'Between the legs'], ['btb', 'Behind the back']]) {
    add('Dribbling', id, name, 4.6, (c) => {
      c.b.dribble(c.a); c.a.setStance('dribble');
      c.at(0.3, () => go(c, 60, 3));
      for (const t of [0.9, 2.1, 3.3]) c.at(t, () => c.b.dribbleMove(id));
    });
  }
  add('Dribbling', 'spinmove', 'Spin move', 3.4, (c) => {
    c.b.dribble(c.a); c.a.setStance('dribble');
    c.at(0.3, () => go(c, 40, 5));
    c.at(1.0, () => c.a.spinMove({ exitFacing: c.f0, exitTo: { x: c.x0 + c.fx * 40, y: c.y0 + c.fy * 40 } }));
  });
  add('Dribbling', 'hesimove', 'Hesitation', 3.4, (c) => {
    c.b.dribble(c.a); c.a.setStance('dribble');
    c.at(0.3, () => go(c, 60, 10));
    c.at(1.2, () => c.a.play('hesi'));
  });
  // moves in place, sizing up a defender who stays in front of the ball: he slides toward the hand it goes to a
  // beat after it gets there, and a combo ends in a drive past him (the moves chain from hand to hand)
  const faceUp = (c) => {
    c.b.dribble(c.a); c.a.setStance('dribble'); c.a.setFace(c.f0);
    c.d.place(c.x0 + c.fx * 5.2, c.y0 + c.fy * 5.2, c.f0 + Math.PI); c.d.setStance('defense');
    c.d.setFace(() => Math.atan2(c.a.y - c.d.y, c.a.x - c.d.x));
    c.mir = null;
  };
  const mirror = (c, t) => {
    const dr = c.b.dr;
    if (!dr || c.drove) return;
    const side = (dr.move && dr.moveStarted && dr.move.type !== 'hesi' ? dr.move.toHand : dr.hand) ? 1 : -1;
    if (!c.mir) c.mir = { side, t: -9 };
    if (side !== c.mir.side) { c.mir.side = side; c.mir.t = t + 0.18; }
    if (c.mir.t > 0 && t >= c.mir.t) {
      c.mir.t = -9;
      c.d.moveTo(c.x0 + c.fx * 5.2 + c.rx * side * 0.8, c.y0 + c.fy * 5.2 + c.ry * side * 0.8, { speed: 9, stance: 'defense' });
      c.d.setFace(() => Math.atan2(c.a.y - c.d.y, c.a.x - c.d.x));
    }
  };
  // the drive off the last move: past the defender on the ball's side, low, then at the basket; he turns and chases
  const drive = (c) => {
    const side = c.b.dr && c.b.dr.hand ? 1 : -1;
    c.drove = true;
    c.a.moveTo(c.x0 + c.fx * 34 + c.rx * side * 3.2, c.y0 + c.fy * 34 + c.ry * side * 3.2, { speed: 19, face: 'move', stance: 'dribble' });
    c.at(c.T + 0.28, () => c.d.moveTo(c.x0 + c.fx * 30 + c.rx * side * 1.2, c.y0 + c.fy * 30 + c.ry * side * 1.2, { speed: 17, face: 'move', stance: 'ready' }));
  };
  add('Dribbling', 'crossIn', 'Crossovers in place', 4.4, (c) => {
    faceUp(c); c.at(0.7, () => c.b.dribbleCombo(['cross', 'cross', 'cross', 'cross']));
  }, { two: true, tick: mirror });
  add('Dribbling', 'btlIn', 'Between the legs in place', 4.6, (c) => {
    faceUp(c); c.at(0.7, () => c.b.dribbleCombo(['btl', 'btl', 'btl', 'btl']));
  }, { two: true, tick: mirror });
  add('Dribbling', 'btbIn', 'Behind the back in place', 4.2, (c) => {
    faceUp(c); c.at(0.7, () => c.b.dribbleCombo(['btb', 'btb', 'btb']));
  }, { two: true, tick: mirror });
  add('Dribbling', 'hesiIn', 'Hesitation, then go', 3.6, (c) => {
    faceUp(c); c.at(0.9, () => c.b.dribbleCombo(['hesi'], { onDone: () => { c.T = c.b.time; drive(c); } }));
  }, { two: true, tick: mirror });
  add('Dribbling', 'combo', 'Combo: crossover, crossover, behind the back, between the legs twice, hesitation, drive', 6.4, (c) => {
    faceUp(c);
    c.at(0.7, () => c.b.dribbleCombo(['cross', 'cross', 'btb', 'btl', 'btl', 'hesi'], { onDone: () => { c.T = c.b.time; drive(c); } }));
  }, { two: true, tick: mirror });
  add('Ball', 'triple', 'Triple threat', 5, (c) => { c.b.give(c.a, 'triple'); c.a.setStance('triple'); });
  // contact: the body reacting to other bodies (the lab has no collisions of its own, so the pushes are applied here)
  add('Contact', 'reach', 'Reach for a steal (the dribbler protects)', 3.2, (c) => {
    c.b.dribble(c.a); c.a.setStance('dribble');
    c.d.place(c.x0 + c.fx * 4.4 + c.rx * 0.6, c.y0 + c.fy * 4.4 + c.ry * 0.6, c.f0 + Math.PI); c.d.setStance('defense');
    c.d.setFace(() => Math.atan2(c.a.y - c.d.y, c.a.x - c.d.x));
    c.at(1.0, () => c.d.play('swipe', { mirror: false }));
    c.at(2.2, () => c.d.play('swipe', { mirror: false }));
  }, { two: true });
  add('Contact', 'reachHold', 'Reach at a held ball (he rips it away)', 2.6, (c) => {
    c.b.give(c.a, 'triple'); c.a.setStance('triple');
    c.d.place(c.x0 + c.fx * 4.2 - c.rx * 0.4, c.y0 + c.fy * 4.2 - c.ry * 0.4, c.f0 + Math.PI); c.d.setStance('defense');
    c.d.setFace(() => Math.atan2(c.a.y - c.d.y, c.a.x - c.d.x));
    c.at(1.0, () => c.d.play('swipe', { mirror: false }));
  }, { two: true });
  add('Contact', 'bump', 'Bumped from the side, then the front', 4, (c) => {
    c.a.setStance('ready');
    c.at(1.0, () => c.a.impact(-c.rx, -c.ry, 10));
    c.at(2.6, () => c.a.impact(-c.fx, -c.fy, 9));
  });
  add('Contact', 'airhit', 'Hit in the air (rebound jump)', 2.8, (c) => {
    c.a.setStance('ready');
    c.at(0.4, () => c.a.play('rebound'));
    c.at(1.0, () => c.a.impact(c.rx, c.ry, 11));
  });
  add('Ball', 'djumpstop', 'Drive into a jump stop, face the pass', 3.6, (c) => {
    c.b.dribble(c.a); c.a.setStance('dribble');
    c.at(0.3, () => go(c, 60, 14));
    c.at(1.5, () => c.a.jumpStop({ faceTo: { x: c.a.x + c.rx * 12 + c.fx * 4, y: c.a.y + c.ry * 12 + c.fy * 4 } }));
  });
  add('Ball', 'pivot', 'Pivot 180 from triple threat', 4.8, (c) => {
    c.b.give(c.a, 'triple'); c.a.setStance('triple');
    c.at(0.8, () => c.a.pivotTo(c.f0 + Math.PI));
    c.at(2.8, () => c.a.pivotTo(c.f0));
  });
  add('Ball', 'pocket', 'Shot pocket hold', 4, (c) => { c.b.give(c.a, 'pocket'); c.a.setStance('shotPocket'); });
  add('Ball', 'chest', 'Chest hold', 4, (c) => { c.b.give(c.a, 'chest'); c.a.setStance('holdChest'); });

  // every clip in the library, grouped
  const GROUPS = {
    Shooting: ['jumpshot', 'jumpshot2', 'pullup', 'stepback', 'fadeaway', 'freethrow', 'floater', 'hook', 'postFadeL', 'postFadeR'],
    Finishing: ['layup', 'reverse', 'dunk', 'dunk2', 'alley', 'putback', 'putbackDunk', 'tip'],
    Passing: ['passChest', 'passBounce', 'passOverhead', 'passPush', 'passLob', 'passOutlet', 'passInbound', 'catch', 'pickup'],
    'Defense and boards': ['rebound', 'contestJump', 'contestUp', 'wallUp', 'block', 'swipe', 'intercept', 'jumpTip', 'fall'],
    'Handling and post': ['jab', 'hesi', 'backdown'],
    Emotes: ['fistPump', 'flex', 'threeFingers', 'point', 'clap', 'dejected'],
  };
  const LABEL = {
    jumpshot: 'Jump shot', jumpshot2: 'Two-motion jumper', pullup: 'Pull-up', stepback: 'Step-back', fadeaway: 'Fadeaway', freethrow: 'Free throw',
    floater: 'Floater', hook: 'Hook shot', postFadeL: 'Post fade (left)', postFadeR: 'Post fade (right)', layup: 'Layup', reverse: 'Reverse layup',
    dunk: 'One-hand dunk', dunk2: 'Two-hand dunk', alley: 'Alley-oop', putback: 'Putback', putbackDunk: 'Putback dunk', tip: 'Tip-in',
    passChest: 'Chest pass', passBounce: 'Bounce pass', passOverhead: 'Overhead pass', passPush: 'One-hand push pass', passLob: 'Lob pass',
    passOutlet: 'Outlet pass', passInbound: 'Inbound pass', catch: 'Catch', pickup: 'Pick up', rebound: 'Rebound', contestJump: 'Contest (jump)',
    contestUp: 'Contest (vertical)', wallUp: 'Wall up', block: 'Block', swipe: 'Swipe', intercept: 'Intercept', jumpTip: 'Jump ball tip',
    fall: 'Charge (fall)', jab: 'Jab step', hesi: 'Hesitation (clip only)', backdown: 'Post back down',
    fistPump: 'Fist pump', flex: 'Flex', threeFingers: 'Three fingers', point: 'Point', clap: 'Clap', dejected: 'Dejected',
  };
  const CATCHES = { catch: 'catch', rebound: 'grab', intercept: 'catch', alley: 'catch', tip: 'tip', jumpTip: 'tip' };
  // how the ball comes to a player who catches it: [height (x player height, + ft), flight time, from (ft ahead, ft up)]
  const INCOMING = { catch: [0.62, 0, 0.7, 20, 4.5], intercept: [0.62, 0, 0.6, 18, 4.5], rebound: [1, 1.1, 0.9, 6, 12], alley: [1.08, 1.6, 1.0, 22, 9],
    tip: [1, 1.6, 0.8, 5, 11], jumpTip: [1, 2.2, 1.0, 0.7, 6] };
  function holdFor(name) {
    if (/^pass|^catch|^pickup|rebound|intercept/.test(name)) return 'chest';
    if (/jab|pivot/.test(name)) return 'triple';
    if (/layup|reverse|dunk|putback|floater|hook|backdown|spin|hesi/.test(name)) return 'chest';
    return 'pocket';
  }
  function clipScenario(name, group) {
    const c = A.get(name);
    if (!c) return;
    add(group, 'clip:' + name, LABEL[name] || name, 0.5 + c.dur + 1.0, (ctx) => {
      const ev = c.events || {};
      const gets = CATCHES[name] !== undefined;
      const firstBall = c.keys.find(k => k.ball);
      const holdAtStart = c.ballKeys && !gets && firstBall && firstBall.t <= 0.12;
      if (holdAtStart) ctx.b.give(ctx.a, holdFor(name));
      const inc = gets && INCOMING[name];
      if (inc) {
        // the ball arrives on time for the catch (or the tip) from a teammate, the rim or the referee's toss
        const H = ctx.a.H, te = ev[CATCHES[name]] || 0.3, fl = inc[2];
        const ax = ctx.x0 + ctx.fx * 0.9, ay = ctx.y0 + ctx.fy * 0.9;
        ctx.b.hidden = false; ctx.b.placeAt(ctx.x0 + ctx.fx * inc[3], ctx.y0 + ctx.fy * inc[3], inc[4]);
        ctx.at(Math.max(0.05, 0.5 + te - fl), () => {
          ctx.b.pass([ax, ay, inc[0] * H + inc[1]], fl, {});
          ctx.b.passTarget = ctx.a;
        });
      }
      ctx.a.setStance(/^pass|catch/.test(name) ? 'ready' : /jab/.test(name) ? 'triple' : /backdown/.test(name) ? 'ready' : 'ready');
      if (/backdown|spin|hesi/.test(name) && !holdAtStart) ctx.b.dribble(ctx.a);
      ctx.at(0.5, () => ctx.a.play(name, {
        facing: ctx.f0, fadeIn: 0.1,
        onEvent: (e) => {
          const hand = ctx.a;
          if (e === 'tip') { ctx.b.passTarget = null; ctx.b.pass([hand.x + ctx.fx * 14, hand.y + ctx.fy * 14, 6], 0.9, {}); return; }
          if ((e === 'catch' || e === 'grab') && gets && ctx.b.holder !== hand) { ctx.b.passTarget = null; ctx.b.give(hand, 'chest'); }
          if (e === 'release' && ctx.b.holder === hand) {
            const pass = /^pass/.test(name);
            const tx = hand.x + ctx.fx * (pass ? 20 : 15), ty = hand.y + ctx.fy * (pass ? 20 : 15);
            ctx.b.pass([tx, ty, pass ? 4.2 : 10], pass ? 0.6 : 1.0, {});
          }
        },
      }));
    });
  }
  const listed = new Set();
  for (const g in GROUPS) for (const n of GROUPS[g]) { if (A.get(n)) { clipScenario(n, g); listed.add(n); } }
  for (const n in A.CLIPS) {
    if (listed.has(n) || /^_/.test(n)) continue;
    const words = n.replace(/([a-z])([A-Z0-9])/g, '$1 $2').toLowerCase();
    LABEL[n] = words.charAt(0).toUpperCase() + words.slice(1);
    clipScenario(n, /^ref/.test(n) ? 'Referee signals' : 'Other moves');
  }

  // ------------------------------------------------------------ the lab
  const SET0 = { scenario: 'jog', height: 78, height2: 77, hand: 'R', gender: 'M', speed: 80, agility: 80, rate: 1, cam: -40, camH: 5.4, dist: 15,
    follow: true, faceLock: false, quad: false, orbit: false, loop: true, seed: 1,
    ov: { hud: true, skel: false, locks: true, limits: true, trails: true, ghost: false, vel: true, targets: false } };
  const set = Object.assign({}, SET0, store.get('set', {}));
  set.ov = Object.assign({}, SET0.ov, (store.get('set', {}) || {}).ov || {});
  if (!SCN.find(s => s.id === set.scenario)) set.scenario = 'jog';
  const save = () => store.set('set', set);

  class Lab {
    constructor() {
      this.cv = document.getElementById('cv');
      this.g = this.cv.getContext('2d');
      this.cam = new M.Camera();
      this.fr = new M.Figure.FigureRenderer();
      this.R3 = null;
      this.playing = true;
      this.budget = 0;
      this.lastReal = 0;
      this.ds = new WeakMap(); // display skeletons (per actor)
      this.focus = { x: 47, y: 25 };
      this.drag = null;
      this.pt = { x: 0, y: 0, s: 0, d: 0 };
      this.resize();
      window.addEventListener('resize', () => this.resize());
    }
    resize() {
      const r = this.cv.getBoundingClientRect();
      this.dpr = Math.min(2, window.devicePixelRatio || 1);
      this.vw = Math.max(200, r.width); this.vh = Math.max(200, r.height);
      this.cv.width = Math.round(this.vw * this.dpr); this.cv.height = Math.round(this.vh * this.dpr);
      this.cam.setSize(this.vw, this.vh);
    }

    // ---- simulation (fixed steps: exact replays)
    scenario() { return SCN.find(s => s.id === set.scenario) || SCN[0]; }
    rebuild(tTarget) {
      const sc = this.scenario();
      reseed(set.seed * 7919 + 13);
      const W = new World();
      const f0 = 0, x0 = 47, y0 = 25;
      const a = W.add(makeLook(set, 0), 0);
      a.place(x0, y0, f0);
      const b = new M.Ball(W); W.ball = b;
      b.x = x0 + 3; b.y = y0; b.z = 0.39;
      const ctx = { W, a, b, f0, fx: Math.cos(f0), fy: Math.sin(f0), rx: Math.sin(f0), ry: -Math.cos(f0), x0, y0, ev: [] };
      if (sc.two) { ctx.d = W.add(makeLook(set, 1), 1); }
      ctx.at = (t, fn) => { ctx.ev.push({ t, fn }); ctx.ev.sort((p, q) => p.t - q.t); };
      this.world = W; this.ctx = ctx; this.sc = sc;
      this.simT = 0; this.sub = 0; this.frame = 0;
      this.snapFocus = true; this.snapUp = true;
      this.track = new Map();
      reseed(set.seed * 104729 + 7);
      b.hidden = true; // (shown when the scenario hands it out, dribbles or passes it)
      U.safe ? U.safe(() => sc.setup(ctx), this, 'scenario') : sc.setup(ctx);
      if (b.holder || b.state === 'dribble') b.hidden = false;
      this.solveAll();
      if (tTarget > 0) this.advanceTo(tTarget);
    }
    advanceTo(t) {
      const n = Math.max(0, Math.round((t - this.simT) / SUB));
      for (let i = 0; i < n; i++) this.substep();
    }
    substep() {
      const ctx = this.ctx, sc = this.sc;
      this.simT = Math.round((this.simT + SUB) * 1200) / 1200; this.sub++;
      while (ctx.ev.length && ctx.ev[0].t <= this.simT + 1e-9) { const e = ctx.ev.shift(); e.fn(); }
      if (sc.tick) sc.tick(ctx, this.simT);
      for (const a of this.world.list) a.update(SUB, this.simT);
      if (this.world.ball) this.world.ball.update(SUB, this.simT);
      if (this.sub % 2 === 0) { this.frame++; this.solveAll(); this.measure(); }
    }
    solveAll() { for (const a of this.world.list) a.solve(); }
    /** per frame bookkeeping for the overlays: planted-foot slide, footprints, support state, onion skin */
    measure() {
      for (const a of this.world.list) {
        let tr = this.track.get(a);
        if (!tr) { tr = { feet: [{ lock: null, slide: 0 }, { lock: null, slide: 0 }], maxSlide: 0, prints: [], support: [], ghost: [] }; this.track.set(a, tr); }
        const P = a.sk.P;
        a.feet.forEach((f, i) => {
          const t = tr.feet[i], j = (i ? J.R_BALL : J.L_BALL) * 3;
          if (f.state === 'plant') {
            if (!t.lock) { t.lock = [P[j], P[j + 1]]; t.slide = 0; tr.prints.push({ x: P[j], y: P[j + 1], yaw: f.yaw, side: i, t: this.simT }); if (tr.prints.length > 40) tr.prints.shift(); }
            t.slide = Math.max(t.slide, Math.hypot(P[j] - t.lock[0], P[j + 1] - t.lock[1]));
            tr.maxSlide = Math.max(tr.maxSlide, t.slide);
          } else { t.lock = null; t.slide = 0; }
        });
        const pl = a.feet.map(f => f.state === 'plant');
        tr.support.push(pl[0] && pl[1] ? 2 : pl[0] || pl[1] ? 1 : 0);
        if (tr.support.length > 120) tr.support.shift();
        tr.ghost.push(Float64Array.from(P));
        if (tr.ghost.length > 8) tr.ghost.shift();
      }
    }
    stepFrames(n) {
      this.playing = false;
      if (n > 0) this.advanceTo(this.simT + n * FRAME);
      else this.rebuild(Math.max(0, Math.round((this.simT + n * FRAME) * 60) / 60));
      this.ui.sync();
    }
    seek(t) { this.rebuild(Math.max(0, Math.min(this.sc.dur, t))); }
    /** paused, step on frame by frame to the gait's next key pose (contact, down, passing or push-off, up) */
    nextKeyPose() {
      const a = this.ctx && this.ctx.a, A = M.Anims;
      if (!a || !A.keyPoseAt) return;
      this.playing = false;
      const at = () => a.gaitOn ? A.keyPoseAt(a.speed, a.phase || 0, a.gaitDbg && a.gaitDbg.beta) : null;
      const k0 = at(), id = (k) => k ? k.name + k.side : '-';
      for (let i = 0; i < 180 && this.simT < this.sc.dur - FRAME; i++) {
        this.advanceTo(this.simT + FRAME);
        const k = at();
        if (k && id(k) !== id(k0)) break;
      }
      this.ui.sync();
    }

    // ---- main loop
    loop(now) {
      const dt = Math.min(0.1, (now - (this.lastReal || now)) / 1000);
      this.lastReal = now;
      this.renderDt = dt;
      // orbit: the camera goes slowly round the player (a 360 look at the move, paused or playing)
      if (set.orbit && !this.ui.drag) { set.cam = ((set.cam + 40 * dt + 180) % 360 + 360) % 360 - 180; this.ui.orbitTick = (this.ui.orbitTick || 0) + 1; if (this.ui.orbitTick % 10 === 0) this.ui.syncSliders(); }
      if (this.playing) {
        this.budget += dt * set.rate;
        let n = 0;
        while (this.budget >= SUB && n < 240) { this.substep(); this.budget -= SUB; n++; }
        if (this.simT >= this.sc.dur - 1e-6) {
          if (set.loop) { this.rebuild(0); this.budget = 0; } else { this.playing = false; this.ui.sync(); }
        }
      }
      this.render();
      this.ui.tick();
      requestAnimationFrame((t) => this.loop(t));
    }

    // ---- view: the camera looks along +y; orbiting turns the world (display only) about the focus point
    viewAngle() {
      const a = this.ctx && this.ctx.a;
      return set.cam * D + (set.faceLock && a ? -(a.facing - this.ctx.f0) : 0);
    }
    xf(x, y, z, out) {
      const c = this.vc, s = this.vs, dx = x - this.focus.x, dy = y - this.focus.y;
      out[0] = this.focus.x + dx * c - dy * s; out[1] = this.focus.y + dx * s + dy * c; out[2] = z;
      return out;
    }
    proj(x, y, z) { const q = this.xf(x, y, z, this._q || (this._q = [0, 0, 0])); this.cam.project(q[0], q[1], q[2], this.pt); return this.pt; }
    displaySk(a) {
      let ds = this.ds.get(a);
      if (!ds) { ds = { P: new Float64Array(a.sk.P.length), R: new Float64Array(a.sk.R.length), dims: a.sk.dims, pose: a.sk.pose }; this.ds.set(a, ds); }
      const P = a.sk.P, R = a.sk.R, c = this.vc, s = this.vs, q = [0, 0, 0];
      for (let j = 0; j < P.length; j += 3) { this.xf(P[j], P[j + 1], P[j + 2], q); ds.P[j] = q[0]; ds.P[j + 1] = q[1]; ds.P[j + 2] = q[2]; }
      for (let f = 0; f < R.length; f += 9) {
        for (let k = 0; k < 3; k++) {
          const r0 = R[f + k], r1 = R[f + 3 + k];
          ds.R[f + k] = c * r0 - s * r1; ds.R[f + 3 + k] = s * r0 + c * r1; ds.R[f + 6 + k] = R[f + 6 + k];
        }
      }
      ds.pose = a.sk.pose;
      return ds;
    }

    render() {
      const g = this.g, W = this.world, dpr = this.dpr;
      if (!W) return;
      const a = this.ctx.a;
      // focus: follow the player (eased in real time; snapped after a restart, a seek or a step back), else the start spot
      const fx = set.follow ? a.x : this.ctx.x0, fy = set.follow ? a.y : this.ctx.y0;
      const k = 1 - Math.exp(-(this.renderDt || 0) / 0.12);
      if (this.snapFocus || !this.playing || Math.hypot(fx - this.focus.x, fy - this.focus.y) > 6) { this.focus.x = fx; this.focus.y = fy; this.snapFocus = false; }
      else { this.focus.x += (fx - this.focus.x) * k; this.focus.y += (fy - this.focus.y) * k; }
      // look at the player's middle; in the air the camera rises with the body (eased) so a dunk stays in the frame
      const up = set.follow ? Math.max(0, a.sk.P[2] - a.H * 0.53) : 0;
      if (this.snapUp || !this.playing) this.focusUp = up; else this.focusUp = (this.focusUp || 0) + (up - (this.focusUp || 0)) * (1 - Math.exp(-(this.renderDt || 0) / 0.15));
      this.snapUp = false;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const grd = g.createLinearGradient(0, 0, 0, this.vh);
      grd.addColorStop(0, '#0b0d12'); grd.addColorStop(1, '#171a22');
      g.fillStyle = grd; g.fillRect(0, 0, this.vw, this.vh);
      if (set.quad) {
        // four cameras on the same frame, turned with the player: front, his right side, back, and from above
        const face = -(a.facing - this.ctx.f0);
        const h = Math.max(120, this.vh - (this.barH || 0)), hw = this.vw / 2, hh = h / 2;
        const dq = set.dist * 0.72;
        const views = [['FRONT', -90, set.camH, dq], ['RIGHT SIDE', 0, set.camH, dq], ['BACK', 90, set.camH, dq], ['FROM ABOVE', -90, 13, 3.5]];
        views.forEach(([name, deg, ch, dist], i) => {
          const x0 = (i % 2) * hw, y0 = Math.floor(i / 2) * hh;
          g.save(); g.translate(x0, y0);
          g.beginPath(); g.rect(0, 0, hw, hh); g.clip();
          this.renderView(g, hw, hh, deg * D + face, ch, dist);
          g.fillStyle = 'rgba(8,10,14,0.7)'; g.fillRect(hw - 118, 6, 112, 22);
          g.fillStyle = '#f06a1a'; g.font = 'bold 12px system-ui, sans-serif'; g.textAlign = 'right'; g.fillText(name, hw - 12, 21); g.textAlign = 'left';
          g.restore();
        });
        g.strokeStyle = '#262b38'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(hw, 0); g.lineTo(hw, h); g.moveTo(0, hh); g.lineTo(this.vw, hh); g.stroke();
        this.cam.setSize(this.vw, this.vh);
      } else {
        this.renderView(g, this.vw, this.vh, this.viewAngle(), set.camH, set.dist);
      }
      if (set.ov.hud) this.drawPhaseDial(g, a);
    }
    /** one camera's picture of the frame into a w x h view (the context already placed and clipped to it) */
    renderView(g, w, h, ang, camH, dist) {
      const cam = this.cam, W = this.world, dpr = this.dpr, a = this.ctx.a;
      cam.setSize(w, h);
      this.vc = Math.cos(ang); this.vs = Math.sin(ang);
      const lookH = 0.45 * a.H + (this.focusUp || 0), camZ = camH + (this.focusUp || 0);
      cam.setPose(this.focus.x, this.focus.y - dist, camZ, Math.atan2(camZ - lookH, dist), 1.25 * cam.H);
      this.drawFloor(g);
      if (set.ov.trails) this.drawPrints(g);
      // people, farthest first
      const people = W.list.map(p => ({ sk: this.displaySk(p), style: p.style, a: p }));
      people.sort((p, q) => cam.depth(q.sk.P[1], 3) - cam.depth(p.sk.P[1], 3));
      const b = W.ball;
      let heldBall = null;
      // the ball in someone's hands, held or dribbled, renders inside that person's 3D cell (as in the game)
      const hb = !b || b.hidden ? null : (b.state === 'held' || b.state === 'dead') && b.holder ? b.holder : b.state === 'dribble' && b.dr && b.dr.actor ? b.dr.actor : null;
      if (hb) {
        const hp = people.find(p => p.a === hb);
        if (hp) {
          const q = this.xf(b.x, b.y, b.z, [0, 0, 0]);
          const rot = this._brot || (this._brot = new Float64Array(9));
          for (let k = 0; k < 3; k++) { const r0 = b.rot[k], r1 = b.rot[3 + k]; rot[k] = this.vc * r0 - this.vs * r1; rot[3 + k] = this.vs * r0 + this.vc * r1; rot[6 + k] = b.rot[6 + k]; }
          heldBall = { sk: hp.sk, x: q[0], y: q[1], z: q[2], R: M.Ball.R, rot, squash: b.squash };
        }
      }
      const R3 = this.R3;
      if (R3 && R3.ok) R3.render(cam, people, { dpr, sync: true, detail: 'high', ball: heldBall });
      for (const p of people) this.fr.drawShadow(g, cam, p.sk, 1);
      if (b && !b.hidden && !heldBall) this.drawBallShadow(g, b);
      let ballDrawn = false;
      for (const p of people) {
        if (R3 && R3.ok) R3.blit(g, p.sk); else this.fr.draw(g, cam, p.sk, p.style, { dpr });
        const c = R3 && R3.cells && R3.cells.get(p.sk);
        if (c && c.hasBall) ballDrawn = true;
      }
      if (b && !b.hidden && !ballDrawn) this.drawBall(g, b);
      // overlays
      for (const p of W.list) {
        if (set.ov.ghost) this.drawGhost(g, p);
        if (set.ov.skel) this.drawSkeleton(g, p.sk.P, 'rgba(120,200,255,0.9)', 1.6);
        if (set.ov.locks) this.drawLocks(g, p);
        if (set.ov.limits) this.drawLimits(g, p);
        if (set.ov.vel) this.drawVel(g, p);
        if (set.ov.targets) this.drawTargets(g, p);
      }
    }
    drawFloor(g) {
      const cam = this.cam, F = this.focus;
      const R = 34, x0 = Math.floor(F.x - R), x1 = Math.ceil(F.x + R), y0 = Math.floor(F.y - R), y1 = Math.ceil(F.y + R);
      g.save();
      // wood tone under the grid, a soft radial fade
      g.fillStyle = '#1d1a17';
      const corners = [[F.x - R, F.y - R], [F.x + R, F.y - R], [F.x + R, F.y + R], [F.x - R, F.y + R]];
      g.beginPath();
      corners.forEach((c, i) => { const p = this.clipFloor(c[0], c[1]); if (i) g.lineTo(p.x, p.y); else g.moveTo(p.x, p.y); });
      g.closePath(); g.fill();
      const line = (xa, ya, xb, yb, col, w) => {
        g.strokeStyle = col; g.lineWidth = w; g.beginPath();
        const n = 24;
        let started = false;
        for (let i = 0; i <= n; i++) {
          const x = xa + (xb - xa) * i / n, y = ya + (yb - ya) * i / n;
          const q = this.xf(x, y, 0, [0, 0, 0]);
          if (cam.depth(q[1], 0) < 1.2) { started = false; continue; }
          cam.project(q[0], q[1], 0, this.pt);
          if (!started) { g.moveTo(this.pt.x, this.pt.y); started = true; } else g.lineTo(this.pt.x, this.pt.y);
        }
        g.stroke();
      };
      for (let x = x0; x <= x1; x++) line(x, y0, x, y1, x % 5 === 0 ? 'rgba(255,255,255,0.13)' : 'rgba(255,255,255,0.045)', x % 5 === 0 ? 1.2 : 1);
      for (let y = y0; y <= y1; y++) line(x0, y, x1, y, y % 5 === 0 ? 'rgba(255,255,255,0.13)' : 'rgba(255,255,255,0.045)', y % 5 === 0 ? 1.2 : 1);
      // the scenario's start spot and direction
      const s = this.ctx;
      const p0 = this.proj(s.x0, s.y0, 0), px = p0.x, py = p0.y;
      const p1 = this.proj(s.x0 + s.fx * 3, s.y0 + s.fy * 3, 0);
      g.strokeStyle = 'rgba(240,106,26,0.55)'; g.lineWidth = 2; g.beginPath(); g.moveTo(px, py); g.lineTo(p1.x, p1.y); g.stroke();
      g.restore();
    }
    clipFloor(x, y) {
      const q = this.xf(x, y, 0, [0, 0, 0]);
      const minY = this.cam.y + 1.2 / Math.max(0.2, this.cam.cp);
      if (q[1] < minY) q[1] = minY;
      this.cam.project(q[0], q[1], 0, this.pt);
      return { x: this.pt.x, y: this.pt.y };
    }
    drawPrints(g) {
      for (const a of this.world.list) {
        const tr = this.track.get(a); if (!tr) continue;
        const n = tr.prints.length;
        tr.prints.forEach((p, i) => {
          const al = 0.15 + 0.5 * (i / Math.max(1, n - 1));
          const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
          const pts = [[-0.08, 0.3], [0.08, 0.3], [0.07, -0.55], [-0.07, -0.55]].map(([u, v]) => this.proj(p.x + c * v + s * u, p.y + s * v - c * u, 0.01));
          g.fillStyle = p.side ? `rgba(255,140,90,${al * 0.55})` : `rgba(110,170,255,${al * 0.55})`;
          g.beginPath(); pts.forEach((q, k) => (k ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y))); g.closePath(); g.fill();
        });
      }
    }
    drawBallShadow(g, b) {
      const p = this.proj(b.x, b.y, 0);
      const r = M.Ball.R * p.s * Math.max(0.4, 1 - b.z / 20);
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.beginPath(); g.ellipse(p.x, p.y, r * 1.1, r * 0.45, 0, 0, Math.PI * 2); g.fill();
    }
    drawBall(g, b) {
      const p = this.proj(b.x, b.y, b.z);
      const r = M.Ball.R * p.s;
      const gr = g.createRadialGradient(p.x - r * 0.35, p.y - r * 0.35, r * 0.1, p.x, p.y, r);
      gr.addColorStop(0, '#ff9a4d'); gr.addColorStop(1, '#a8420c');
      g.fillStyle = gr; g.beginPath(); g.arc(p.x, p.y, r, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(30,10,0,0.7)'; g.lineWidth = Math.max(1, r * 0.08);
      g.beginPath(); g.arc(p.x, p.y, r, 0, Math.PI * 2); g.moveTo(p.x - r, p.y); g.lineTo(p.x + r, p.y); g.stroke();
    }
    drawSkeleton(g, P, col, w) {
      const bones = [[J.PEL, J.SPN], [J.SPN, J.CHS], [J.CHS, J.NCK], [J.NCK, J.HC], [J.L_SH, J.L_EL], [J.L_EL, J.L_WR], [J.L_WR, J.L_HD], [J.R_SH, J.R_EL], [J.R_EL, J.R_WR], [J.R_WR, J.R_HD],
        [J.CHS, J.L_SH], [J.CHS, J.R_SH], [J.PEL, J.L_HIP], [J.PEL, J.R_HIP], [J.L_HIP, J.L_KN], [J.L_KN, J.L_AN], [J.L_AN, J.L_HEEL], [J.L_HEEL, J.L_BALL], [J.L_BALL, J.L_TOE],
        [J.R_HIP, J.R_KN], [J.R_KN, J.R_AN], [J.R_AN, J.R_HEEL], [J.R_HEEL, J.R_BALL], [J.R_BALL, J.R_TOE]];
      g.save(); g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round';
      g.beginPath();
      for (const [i, k] of bones) {
        const p = this.proj(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]), x = p.x, y = p.y;
        const q = this.proj(P[k * 3], P[k * 3 + 1], P[k * 3 + 2]);
        g.moveTo(x, y); g.lineTo(q.x, q.y);
      }
      g.stroke(); g.restore();
    }
    drawGhost(g, a) {
      const tr = this.track.get(a); if (!tr) return;
      tr.ghost.forEach((P, i) => { if (i < tr.ghost.length - 1) this.drawSkeleton(g, P, `rgba(255,255,255,${0.08 + 0.05 * i})`, 1.2); });
    }
    drawLocks(g, a) {
      const tr = this.track.get(a);
      a.feet.forEach((f, i) => {
        if (f.state === 'plant') {
          const t = tr && tr.feet[i], sl = t ? t.slide * 12 : 0;
          const col = sl < 0.12 ? '#3ecf8e' : sl < 0.5 ? '#f2c14e' : '#ff5a5f';
          const p = this.proj(f.x, f.y, 0), x = p.x, y = p.y, top = this.proj(f.x, f.y, 1.1);
          g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y); g.lineTo(top.x, top.y); g.stroke();
          g.fillStyle = col; g.beginPath(); g.arc(top.x, top.y, 4.5, 0, Math.PI * 2); g.fill();
          g.beginPath(); g.ellipse(x, y, 9, 3.5, 0, 0, Math.PI * 2); g.stroke();
          if (sl >= 0.05) { g.font = '11px ui-monospace, monospace'; g.fillText(sl.toFixed(2) + '"', top.x + 7, top.y + 4); }
        } else if (f.state === 'swing' && f.tx != null) {
          const p = this.proj(f.tx, f.ty, 0);
          g.strokeStyle = 'rgba(160,200,255,0.8)'; g.setLineDash([4, 3]); g.lineWidth = 1.5;
          g.beginPath(); g.ellipse(p.x, p.y, 9, 3.5, 0, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
        }
      });
    }
    drawLimits(g, a) {
      const hits = a.sk.limHits; if (!hits) return;
      const P = a.sk.P;
      const seen = new Map();
      for (let i = 0; i < hits.length; i++) {
        if (!hits[i]) continue;
        const j = JOINT_OF[i]; if (j == null) continue;
        seen.set(j, Math.max(seen.get(j) || 0, hits[i]));
      }
      for (const [j, h] of seen) {
        const p = this.proj(P[j * 3], P[j * 3 + 1], P[j * 3 + 2]);
        g.strokeStyle = h === 2 ? '#f2c14e' : '#ff3b45'; g.lineWidth = 2.5;
        g.beginPath(); g.arc(p.x, p.y, 8, 0, Math.PI * 2); g.stroke();
        g.fillStyle = h === 2 ? 'rgba(242,193,78,0.25)' : 'rgba(255,59,69,0.3)'; g.fill();
      }
    }
    drawVel(g, a) {
      if (a.speed < 0.3) return;
      const p = this.proj(a.x, a.y, 0.02), q = this.proj(a.x + a.vx * 0.25, a.y + a.vy * 0.25, 0.02);
      g.strokeStyle = 'rgba(240,106,26,0.9)'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y); g.stroke();
      const hx = q.x - p.x, hy = q.y - p.y, hl = Math.hypot(hx, hy) || 1, ux = hx / hl, uy = hy / hl;
      g.beginPath(); g.moveTo(q.x, q.y); g.lineTo(q.x - ux * 9 - uy * 5, q.y - uy * 9 + ux * 5); g.lineTo(q.x - ux * 9 + uy * 5, q.y - uy * 9 - ux * 5); g.closePath();
      g.fillStyle = 'rgba(240,106,26,0.9)'; g.fill();
    }
    drawTargets(g, a) {
      for (let side = 0; side < 2; side++) {
        const ik = a.sk.armIK[side]; if (!(ik.on > 0.01)) continue;
        const p = this.proj(ik.x, ik.y, ik.z);
        g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(p.x - 6, p.y); g.lineTo(p.x + 6, p.y); g.moveTo(p.x, p.y - 6); g.lineTo(p.x, p.y + 6); g.stroke();
      }
    }
    drawPhaseDial(g, a) {
      // (above the transport bar, which wraps to two rows on a phone; smaller on a small view)
      const bar = this.barH || 0, r = this.vw < 520 ? 26 : 38;
      const cx = this.vw - r - 26, cy = this.vh - bar - r - 34;
      g.save();
      g.fillStyle = 'rgba(8,10,14,0.72)'; g.strokeStyle = '#262b38'; g.lineWidth = 1;
      g.beginPath(); g.arc(cx, cy, r + 14, 0, Math.PI * 2); g.fill(); g.stroke();
      const beta = a.gp && a.gp.beta != null ? a.gp.beta : 0.5;
      // each foot's contact window on the ring: right from phase 0, left from 0.5
      const arc = (from, len, col) => { g.strokeStyle = col; g.lineWidth = 6; g.beginPath(); g.arc(cx, cy, r, -Math.PI / 2 + from * Math.PI * 2, -Math.PI / 2 + (from + len) * Math.PI * 2); g.stroke(); };
      if (a.gaitOn) { arc(0, beta, 'rgba(255,140,90,0.85)'); arc(0.5, beta, 'rgba(110,170,255,0.85)'); }
      g.strokeStyle = 'rgba(255,255,255,0.15)'; g.lineWidth = 1; g.beginPath(); g.arc(cx, cy, r - 7, 0, Math.PI * 2); g.stroke();
      const ph = a.phase || 0, ang = -Math.PI / 2 + ph * Math.PI * 2;
      g.strokeStyle = a.gaitOn ? '#fff' : 'rgba(255,255,255,0.3)'; g.lineWidth = 2.5;
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(ang) * (r - 4), cy + Math.sin(ang) * (r - 4)); g.stroke();
      g.fillStyle = '#8d95a8'; g.font = '10px ui-monospace, monospace'; g.textAlign = 'center';
      g.fillText('gait phase', cx, cy + r + 26);
      g.fillStyle = 'rgba(255,140,90,1)'; g.fillText('R', cx + r + 8, cy - r + 6);
      g.fillStyle = 'rgba(110,170,255,1)'; g.fillText('L', cx - r - 8, cy + r - 2);
      g.restore();
    }
  }

  // which joint lights up for a channel held at its limit
  const JOINT_OF = {};
  (function () {
    const m = (ch, j) => { if (CH[ch] != null) JOINT_OF[CH[ch]] = j; };
    for (const s of ['l', 'r']) {
      const L = s === 'l';
      m(s + 'ClvE', L ? J.L_SH : J.R_SH); m(s + 'ClvP', L ? J.L_SH : J.R_SH);
      m(s + 'ShF', L ? J.L_SH : J.R_SH); m(s + 'ShA', L ? J.L_SH : J.R_SH); m(s + 'ShT', L ? J.L_SH : J.R_SH);
      m(s + 'ElF', L ? J.L_EL : J.R_EL); m(s + 'Pro', L ? J.L_EL : J.R_EL);
      m(s + 'WrF', L ? J.L_WR : J.R_WR); m(s + 'WrD', L ? J.L_WR : J.R_WR); m(s + 'Fing', L ? J.L_HD : J.R_HD);
      m(s + 'HipF', L ? J.L_HIP : J.R_HIP); m(s + 'HipA', L ? J.L_HIP : J.R_HIP); m(s + 'HipT', L ? J.L_HIP : J.R_HIP);
      m(s + 'Knee', L ? J.L_KN : J.R_KN); m(s + 'Ank', L ? J.L_AN : J.R_AN); m(s + 'Toe', L ? J.L_BALL : J.R_BALL);
    }
    for (const k of ['spFlex', 'spLat', 'spTwist']) m(k, J.SPN);
    for (const k of ['chFlex', 'chLat', 'chTwist']) m(k, J.CHS);
    for (const k of ['nkFlex', 'nkLat', 'nkTwist']) m(k, J.NCK);
    for (const k of ['hdFlex', 'hdLat', 'hdTwist']) m(k, J.HC);
  })();
  const CH_NAME = {};
  (function () {
    const nice = { ShF: 'shoulder (forward/back)', ShA: 'shoulder (out/in)', ShT: 'shoulder (twist)', ElF: 'elbow', Pro: 'forearm twist', WrF: 'wrist (bend)', WrD: 'wrist (side)',
      Fing: 'fingers', HipF: 'hip (forward/back)', HipA: 'hip (out/in)', HipT: 'hip (twist)', Knee: 'knee', Ank: 'ankle', Toe: 'toes', ClvE: 'shoulder shrug', ClvP: 'shoulder blade' };
    for (const k in CH) {
      const m = /^([lr])([A-Z].*)$/.exec(k);
      if (m && nice[m[2]]) CH_NAME[CH[k]] = (m[1] === 'l' ? 'Left ' : 'Right ') + nice[m[2]];
      else CH_NAME[CH[k]] = { spFlex: 'lower back (bend)', spLat: 'lower back (side)', spTwist: 'lower back (twist)', chFlex: 'upper back (bend)', chLat: 'upper back (side)',
        chTwist: 'upper back (twist)', nkFlex: 'neck (bend)', nkLat: 'neck (side)', nkTwist: 'neck (turn)', hdFlex: 'head (nod)', hdLat: 'head (tilt)', hdTwist: 'head (turn)' }[k] || k;
    }
  })();

  // ------------------------------------------------------------ UI
  class UI {
    constructor(lab) {
      this.lab = lab;
      this.panel = document.getElementById('panel');
      this.hud = document.getElementById('hud');
      this.lim = document.getElementById('limits');
      this.bar = document.getElementById('bar');
      this.build();
      this.keys();
      this.mouse();
    }
    el(tag, attrs, kids) {
      const e = document.createElement(tag);
      for (const k in attrs || {}) { if (k === 'text') e.textContent = attrs[k]; else if (k === 'html') e.innerHTML = attrs[k]; else if (k.startsWith('on')) e.addEventListener(k.slice(2), attrs[k]); else e.setAttribute(k, attrs[k]); }
      for (const c of kids || []) if (c) e.appendChild(c);
      return e;
    }
    slider(label, key, min, max, step, fmt, onChange) {
      const val = this.el('span', { class: 'val', text: fmt(set[key]) });
      const inp = this.el('input', { type: 'range', min, max, step, value: set[key] });
      inp.addEventListener('input', () => { set[key] = +inp.value; val.textContent = fmt(set[key]); save(); if (onChange) onChange(); });
      this['s_' + key] = { inp, val, fmt };
      return this.el('div', { class: 'row' }, [this.el('label', { text: label }), inp, val]);
    }
    build() {
      const L = this.lab, P = this.panel;
      P.appendChild(this.el('h1', { html: 'Animation <span>Lab</span>' }));
      P.appendChild(this.el('div', { class: 'sub', text: 'Pick a scenario, pause where it looks wrong, step frame by frame, then copy the report.' }));
      // scenarios
      const sec = this.el('div', { class: 'sec' }, [this.el('h2', { text: 'Scenario' })]);
      const groups = [];
      for (const s of SCN) if (groups.indexOf(s.group) < 0) groups.push(s.group);
      this.scnButtons = [];
      for (const gname of groups) {
        sec.appendChild(this.el('div', { class: 'group-title', text: gname }));
        const box = this.el('div', { class: 'scn' });
        for (const s of SCN.filter(x => x.group === gname)) {
          const b = this.el('button', { text: s.name, onclick: () => { set.scenario = s.id; save(); L.rebuild(0); L.playing = true; this.sync(); } });
          b.dataset.id = s.id; this.scnButtons.push(b); box.appendChild(b);
        }
        sec.appendChild(box);
      }
      P.appendChild(sec);
      // player
      const pl = this.el('div', { class: 'sec' }, [this.el('h2', { text: 'Player' })]);
      const inch = (v) => Math.floor(v / 12) + "'" + (v % 12) + '"';
      pl.appendChild(this.slider('Height', 'height', 68, 88, 1, inch, () => this.restartSoon()));
      pl.appendChild(this.slider('Speed', 'speed', 30, 99, 1, (v) => String(v), () => this.restartSoon()));
      pl.appendChild(this.slider('Agility', 'agility', 30, 99, 1, (v) => String(v), () => this.restartSoon()));
      const hand = this.el('select', { onchange: (e) => { set.hand = e.target.value; save(); L.rebuild(0); this.sync(); } }, [this.el('option', { value: 'R', text: 'Right-handed' }), this.el('option', { value: 'L', text: 'Left-handed' })]);
      hand.value = set.hand;
      const gen = this.el('select', { onchange: (e) => { set.gender = e.target.value; save(); L.rebuild(0); this.sync(); } }, [this.el('option', { value: 'M', text: "Men's league body" }), this.el('option', { value: 'F', text: "Women's league body" })]);
      gen.value = set.gender;
      pl.appendChild(this.el('div', { class: 'row' }, [hand, gen]));
      P.appendChild(pl);
      // camera
      const cm = this.el('div', { class: 'sec' }, [this.el('h2', { text: 'Camera' })]);
      cm.appendChild(this.slider('Angle', 'cam', -180, 180, 1, (v) => Math.round(v) + '°'));
      cm.appendChild(this.slider('Height', 'camH', 0.5, 14, 0.1, (v) => v.toFixed(1) + ' ft'));
      cm.appendChild(this.slider('Distance', 'dist', 5, 45, 0.5, (v) => v.toFixed(1) + ' ft'));
      const presets = [['Right side', 0, 5.4], ['Front', -90, 5.4], ['3/4 front', -40, 5.4], ['Left side', 180, 5.4], ['Back', 90, 5.4], ['Low', -60, 1.2], ['High', -40, 12]];
      cm.appendChild(this.el('div', { class: 'chips' }, presets.map(([n, ang, h], i) => this.el('button', { text: (i + 1) + ' ' + n, onclick: () => this.preset(ang, h) }))));
      const follow = this.toggle('Follow the player', () => set.follow, (v) => { set.follow = v; });
      const lock = this.toggle('Turn with the player', () => set.faceLock, (v) => { set.faceLock = v; });
      const quad = this.toggle('4 views at once: front, side, back, above (Q)', () => set.quad, (v) => { set.quad = v; });
      const orbit = this.toggle('Orbit: the camera circles the player, 360 (T)', () => set.orbit, (v) => { set.orbit = v; });
      cm.appendChild(this.el('div', { class: 'checks' }, [quad, orbit, follow, lock]));
      P.appendChild(cm);
      // overlays
      const ov = this.el('div', { class: 'sec' }, [this.el('h2', { text: 'Debug overlays' })]);
      const items = [['hud', 'Readout and gait phase dial (H)'], ['locks', 'Foot locks and slide meter (K)'], ['limits', 'Joints at a limit (L)'], ['skel', 'Skeleton (G)'],
        ['ghost', 'Onion skin, last frames (O)'], ['trails', 'Footprints'], ['vel', 'Velocity arrow'], ['targets', 'Hand IK targets']];
      ov.appendChild(this.el('div', { class: 'checks' }, items.map(([k, n]) => this.toggle(n, () => set.ov[k], (v) => { set.ov[k] = v; }))));
      ov.appendChild(this.el('div', { class: 'note', html: 'Foot pins: <b style="color:#3ecf8e">green</b> locked, <b style="color:#f2c14e">yellow</b> drifted a little, <b style="color:#ff5a5f">red</b> sliding. Joint rings: <b style="color:#ff3b45">red</b> held at its limit, <b style="color:#f2c14e">yellow</b> limb out of reach (straightened).' }));
      P.appendChild(ov);
      // report
      const rp = this.el('div', { class: 'sec' }, [this.el('h2', { text: 'Report a problem' })]);
      this.notes = this.el('textarea', { placeholder: 'What looks wrong at this frame? (optional)' });
      rp.appendChild(this.notes);
      this.copyBtn = this.el('button', { class: 'primary', text: 'Copy report (C)', onclick: () => this.copyReport() });
      rp.appendChild(this.el('div', { class: 'row' }, [this.copyBtn]));
      rp.appendChild(this.el('div', { class: 'note', text: 'Paste the report in chat: it has the scenario, the exact frame and your settings, so the moment can be replayed exactly.' }));
      P.appendChild(rp);
      // keys
      const ks = this.el('div', { class: 'sec' }, [this.el('h2', { text: 'Keys' })]);
      ks.appendChild(this.el('div', { class: 'note', html: '<kbd>Space</kbd> play / pause &nbsp; <kbd>←</kbd><kbd>→</kbd> one frame &nbsp; <kbd>Shift</kbd>+arrows 10 frames<br><kbd>[</kbd><kbd>]</kbd> slower / faster &nbsp; <kbd>R</kbd> restart &nbsp; <kbd>1</kbd>-<kbd>7</kbd> camera<br><kbd>Q</kbd> 4 views &nbsp; <kbd>T</kbd> orbit 360 &nbsp; <kbd>F</kbd> follow<br><kbd>P</kbd> next gait key pose (contact, down, passing or push-off, up)<br>drag to turn the camera, wheel or pinch to zoom' }));
      P.appendChild(ks);
      // transport bar
      const B = this.bar;
      this.btnRestart = this.el('button', { text: '⏮', title: 'Restart (R)', onclick: () => { L.rebuild(0); this.sync(); } });
      this.btnBack = this.el('button', { text: '◀|', title: 'Back one frame (←)', onclick: () => L.stepFrames(-1) });
      this.btnPlay = this.el('button', { class: 'primary', text: '⏸', title: 'Play / pause (Space)', onclick: () => this.togglePlay() });
      this.btnFwd = this.el('button', { text: '|▶', title: 'Forward one frame (→)', onclick: () => L.stepFrames(1) });
      this.btnPose = this.el('button', { text: 'pose ▶', title: 'Step to the next gait key pose: contact, down, passing or push-off, up (P)', onclick: () => L.nextKeyPose() });
      this.rateSel = this.el('select', { title: 'Playback speed ([ and ])', onchange: (e) => { set.rate = +e.target.value; save(); } }, [2, 1, 0.5, 0.25, 0.1, 0.05].map(r => this.el('option', { value: r, text: r + 'x' })));
      this.rateSel.style.flex = '0 0 auto';
      this.rateSel.value = String(set.rate);
      this.scrub = this.el('input', { type: 'range', min: 0, max: 1000, step: 1, value: 0 });
      this.scrub.style.flex = '1';
      this.scrub.addEventListener('input', () => { L.playing = false; L.seek(+this.scrub.value / 1000 * L.sc.dur); this.sync(); });
      this.timeTxt = this.el('span', { class: 'time' });
      this.loopBtn = this.el('button', { text: 'Loop', onclick: () => { set.loop = !set.loop; save(); this.sync(); } });
      [this.btnRestart, this.btnBack, this.btnPlay, this.btnFwd, this.btnPose, this.rateSel, this.scrub, this.timeTxt, this.loopBtn].forEach(e => B.appendChild(e));
      this.sync();
    }
    toggle(label, get, setv) {
      const cb = this.el('input', { type: 'checkbox' });
      cb.checked = !!get();
      cb.addEventListener('change', () => { setv(cb.checked); save(); });
      (this.toggles || (this.toggles = [])).push({ cb, get });
      return this.el('label', {}, [cb, document.createTextNode(label)]);
    }
    restartSoon() { clearTimeout(this._rt); this._rt = setTimeout(() => { this.lab.rebuild(0); this.sync(); }, 180); }
    preset(ang, h) { set.cam = ang; set.camH = h; save(); this.syncSliders(); }
    syncSliders() { for (const k of ['cam', 'camH', 'dist', 'height', 'speed', 'agility']) { const s = this['s_' + k]; if (s) { s.inp.value = set[k]; s.val.textContent = s.fmt(set[k]); } } }
    togglePlay() {
      const L = this.lab;
      if (!L.playing && L.simT >= L.sc.dur - 1e-6) L.rebuild(0);
      L.playing = !L.playing; L.budget = 0; this.sync();
    }
    sync() {
      const L = this.lab;
      for (const b of this.scnButtons) b.classList.toggle('on', b.dataset.id === set.scenario);
      this.btnPlay.textContent = L.playing ? '⏸' : '▶';
      this.loopBtn.classList.toggle('on', !!set.loop);
      this.rateSel.value = String(set.rate);
      if (this.toggles) for (const t of this.toggles) t.cb.checked = !!t.get();
      this.syncSliders();
    }
    tick() {
      const L = this.lab; if (!L.sc) return;
      L.barH = this.bar.offsetHeight;
      if (document.activeElement !== this.scrub) this.scrub.value = Math.round(L.simT / L.sc.dur * 1000);
      this.timeTxt.innerHTML = (L.playing ? '' : '<span class="paused">PAUSED</span> ') + 't ' + L.simT.toFixed(3) + ' s &nbsp;frame ' + L.frame;
      this.drawHud();
    }
    gaitText(a) {
      const gd = a.gaitDbg || {};
      const leg = a.dims.th + a.dims.sh;
      const tr = this.lab.track.get(a);
      let fl = 0, db = 0;
      if (tr && tr.support.length) { for (const s of tr.support) { if (s === 0) fl++; else if (s === 2) db++; } fl /= tr.support.length; db /= tr.support.length; }
      const lines = [];
      lines.push('speed   ' + a.speed.toFixed(2) + ' ft/s  (' + (a.speed * 0.6818).toFixed(1) + ' mph)');
      if (a.gaitOn) {
        const step = gd.stride ? gd.stride / 2 : 0;
        lines.push('gait    phase ' + (a.phase || 0).toFixed(2) + '  duty ' + (gd.beta != null ? gd.beta.toFixed(2) : '-') + '  cadence ' + (gd.sps ? gd.sps.toFixed(2) : '-') + ' steps/s');
        const kp = M.Anims.keyPoseAt ? M.Anims.keyPoseAt(a.speed, a.phase || 0, gd.beta) : null;
        if (kp) lines.push('pose    ' + kp.name.toUpperCase() + ', ' + (kp.side === 'R' ? 'right' : 'left') + ' foot  <span class="dim">(' + kp.gait + ' key poses; P steps to the next)</span>');
        lines.push('step    ' + step.toFixed(2) + ' ft = ' + (step / leg).toFixed(2) + ' x leg (' + leg.toFixed(2) + ' ft)');
        lines.push('support flight ' + Math.round(fl * 100) + '%  double ' + Math.round(db * 100) + '%  (last 2 s)');
      } else lines.push('gait    <span class="dim">off (standing)</span>');
      const fs = a.feet.map((f, i) => {
        const t = tr && tr.feet[i];
        if (f.state === 'plant') {
          const sl = t ? t.slide * 12 : 0;
          return (i ? 'R' : 'L') + ' <span class="' + (sl < 0.12 ? 'ok' : sl < 0.5 ? 'warn' : 'bad') + '">planted ' + sl.toFixed(2) + '"</span>';
        }
        return (i ? 'R' : 'L') + ' ' + f.state + (f.mode ? '/' + f.mode : '') + (f.sw != null && f.state === 'swing' ? ' ' + Math.round(f.sw * 100) + '%' : '');
      });
      lines.push('feet    ' + fs.join('   '));
      if (tr) lines.push('slide   worst so far ' + '<span class="' + (tr.maxSlide * 12 < 0.12 ? 'ok' : tr.maxSlide * 12 < 0.5 ? 'warn' : 'bad') + '">' + (tr.maxSlide * 12).toFixed(2) + ' in</span>');
      const cl = a.clip ? a.clip.clip.name + ' ' + Math.min(a.clip.t, a.clip.clip.dur).toFixed(2) + ' / ' + a.clip.clip.dur.toFixed(2) : '-';
      const up = a.upper ? a.upper.clip.name + ' ' + a.upper.t.toFixed(2) : '-';
      lines.push('clip    ' + cl + '   upper ' + up);
      lines.push('stance  ' + a.stance + (a.hasBall ? '   ball ' + (a.dribble ? 'dribble' : (a.ballHold || 'held')) : ''));
      return lines;
    }
    drawHud() {
      const L = this.lab, a = L.ctx && L.ctx.a; if (!a) return;
      if (!set.ov.hud) { this.hud.style.display = 'none'; } else {
        this.hud.style.display = '';
        const head = L.sc.name + '   <span class="dim">t ' + L.simT.toFixed(3) + ' s  frame ' + L.frame + '  ' + set.rate + 'x' + (L.playing ? '' : '  paused') + '</span>';
        this.hud.innerHTML = [head].concat(this.gaitText(a)).join('\n');
      }
      // joints at their limits, by name
      const hits = a.sk.limHits;
      const rows = [];
      if (set.ov.limits && hits) for (let i = 0; i < hits.length; i++) if (hits[i]) rows.push((hits[i] === 2 ? '<span style="color:#f2c14e">' : '<span style="color:#ff5a5f">') + (CH_NAME[i] || i) + (hits[i] === 2 ? ': out of reach, straight' : ': at its limit') + '</span>');
      this.lim.innerHTML = rows.length ? 'Joints at a limit\n' + rows.join('\n') : '';
    }
    report() {
      const L = this.lab, a = L.ctx.a;
      const inch = (v) => Math.floor(v / 12) + "'" + (v % 12) + '"';
      const hits = a.sk.limHits, lim = [];
      if (hits) for (let i = 0; i < hits.length; i++) if (hits[i]) lim.push((CH_NAME[i] || i) + (hits[i] === 2 ? ' (out of reach)' : ' (limit)'));
      const txt = [
        'Animation Lab report',
        'scenario: ' + L.sc.name + ' [' + L.sc.id + ']',
        'time: ' + L.simT.toFixed(3) + ' s, frame ' + L.frame + ' (60 fps), seed ' + set.seed,
        'player: ' + inch(set.height) + ', ' + (set.hand === 'L' ? 'left' : 'right') + '-handed, ' + (set.gender === 'F' ? "women's" : "men's") + ' body, speed ' + set.speed + ', agility ' + set.agility,
        'camera: angle ' + Math.round(set.cam) + ' deg, height ' + set.camH.toFixed(1) + ' ft, distance ' + set.dist.toFixed(1) + ' ft' + (set.quad ? ', 4 views' : ''),
      ].concat(this.gaitText(a).map(s => s.replace(/<[^>]+>/g, ''))).concat([
        'joints at a limit: ' + (lim.length ? lim.join(', ') : 'none'),
        'notes: ' + (this.notes.value || '-'),
      ]).join('\n');
      return txt;
    }
    copyReport() {
      const txt = this.report();
      const done = () => { this.copyBtn.textContent = 'Copied'; setTimeout(() => { this.copyBtn.textContent = 'Copy report (C)'; }, 1400); };
      const fallback = () => { const t = this.el('textarea'); t.value = txt; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch (e) { /* ignore */ } t.remove(); done(); };
      try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, fallback); else fallback(); } catch (e) { fallback(); }
    }
    keys() {
      const L = this.lab;
      window.addEventListener('keydown', (e) => {
        const tag = (e.target && e.target.tagName) || '';
        if (tag === 'TEXTAREA' || tag === 'INPUT' && e.target.type === 'text') return;
        const k = e.key;
        if (k === ' ') { e.preventDefault(); this.togglePlay(); }
        else if (k === 'ArrowRight') { e.preventDefault(); L.stepFrames(e.shiftKey ? 10 : 1); }
        else if (k === 'ArrowLeft') { e.preventDefault(); L.stepFrames(e.shiftKey ? -10 : -1); }
        else if (k === 'r' || k === 'R') { L.rebuild(0); this.sync(); }
        else if (k === '[' || k === ']') {
          const rates = [0.05, 0.1, 0.25, 0.5, 1, 2];
          let i = rates.indexOf(set.rate); if (i < 0) i = 4;
          i = U.clamp(i + (k === ']' ? 1 : -1), 0, rates.length - 1);
          set.rate = rates[i]; save(); this.sync();
        }
        else if (k >= '1' && k <= '7') { const pr = [[0, 5.4], [-90, 5.4], [-40, 5.4], [180, 5.4], [90, 5.4], [-60, 1.2], [-40, 12]][+k - 1]; this.preset(pr[0], pr[1]); }
        else if (k === 'f' || k === 'F') { set.follow = !set.follow; save(); this.sync(); }
        else if (k === 'h' || k === 'H') { set.ov.hud = !set.ov.hud; save(); this.sync(); }
        else if (k === 'k' || k === 'K') { set.ov.locks = !set.ov.locks; save(); this.sync(); }
        else if (k === 'l' || k === 'L') { set.ov.limits = !set.ov.limits; save(); this.sync(); }
        else if (k === 'g' || k === 'G') { set.ov.skel = !set.ov.skel; save(); this.sync(); }
        else if (k === 'o' || k === 'O') { set.ov.ghost = !set.ov.ghost; save(); this.sync(); }
        else if (k === 'c' || k === 'C') { this.copyReport(); }
        else if (k === 'q' || k === 'Q') { set.quad = !set.quad; save(); this.sync(); }
        else if (k === 't' || k === 'T') { set.orbit = !set.orbit; save(); this.sync(); }
        else if (k === 'p' || k === 'P') { L.nextKeyPose(); }
      });
    }
    mouse() {
      const cv = this.lab.cv, pts = new Map();
      cv.style.touchAction = 'none';
      cv.addEventListener('pointerdown', (e) => {
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        cv.setPointerCapture(e.pointerId);
        if (pts.size === 1) { this.drag = { x: e.clientX, y: e.clientY, cam: set.cam, camH: set.camH }; cv.classList.add('drag'); }
        else if (pts.size === 2) { const [p, q] = [...pts.values()]; this.pinch = { d: Math.hypot(p.x - q.x, p.y - q.y) || 1, dist: set.dist }; this.drag = null; }
      });
      cv.addEventListener('pointermove', (e) => {
        if (pts.has(e.pointerId)) pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (this.pinch && pts.size >= 2) {
          // two fingers: pinch to zoom
          const [p, q] = [...pts.values()];
          set.dist = U.clamp(this.pinch.dist * this.pinch.d / (Math.hypot(p.x - q.x, p.y - q.y) || 1), 5, 45);
          this.syncSliders();
          return;
        }
        const d = this.drag; if (!d) return;
        let ang = d.cam + (e.clientX - d.x) * 0.4;
        ang = ((ang + 180) % 360 + 360) % 360 - 180;
        set.cam = Math.round(ang); set.camH = U.clamp(d.camH + (e.clientY - d.y) * 0.03, 0.5, 14);
        this.syncSliders();
      });
      const end = (e) => {
        pts.delete(e.pointerId);
        if (pts.size < 2) this.pinch = null;
        if (this.drag || !pts.size) { this.drag = null; cv.classList.remove('drag'); save(); }
      };
      cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
      cv.addEventListener('wheel', (e) => { e.preventDefault(); set.dist = U.clamp(set.dist * (e.deltaY > 0 ? 1.08 : 1 / 1.08), 5, 45); this.syncSliders(); save(); }, { passive: false });
    }
  }

  // ------------------------------------------------------------ start
  async function start() {
    const lab = new Lab();
    window.PBC.Lab = lab; // (for scripted checks)
    lab.set = set; lab.SCN = SCN;
    lab.ui = new UI(lab);
    try {
      lab.R3 = M.GL3D && M.GL3D.get ? M.GL3D.get() : null;
      if (M.Human && M.Human.load) await M.Human.load();
    } catch (e) { console.warn('lab: 3D players unavailable, using the 2D figures', e); lab.R3 = null; }
    document.getElementById('loading').classList.add('gone');
    lab.rebuild(0);
    lab.ui.sync();
    requestAnimationFrame((t) => lab.loop(t));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
