/* Pro BBALL Coach: play styles (PBC.Style). No DOM.
 *
 * How a player plays (the user: "not every player plays the same; you're gonna have facilitators, deep range shooters,
 * explosive slashers..."): what he looks for with the ball, where his shots come from, how he moves without it and what he
 * does on defense. Every player has one style:
 *  - derived from his ratings and tendencies, how far he stands out from his position in the skills that make the style
 *    (the archetype he was generated as counts a little), with gates on the absolute skill a style needs (a Deep Range
 *    Shooter shoots 82 or better from three); a player who stands out in nothing is a Combo Guard, a Two-Way Wing or a
 *    Hustle Big;
 *  - or picked in the player editor (p.style + p.styleCustom); "Auto" follows the ratings again.
 * The engine (js/core/sim.js) reads Style.mods: the plays he is picked for, his usage, where his shots come from and how,
 * his passing and his shot selection; the live court (js/match) reads the court part through the player look (lk.sty):
 * how hard he attacks, how much he works the dribble, his passing flair, his off-ball movement, his rolls and pops.
 * Multipliers that change what the league does as a whole (zones, play types) are centered on the league's own mix of
 * styles (Style.leagueMean), so the league keeps its shooting numbers and the styles share them out differently. */
(function () {
  'use strict';
  const PBC = (window.PBC = window.PBC || {});
  const C = PBC.Config;

  const LIST = [
    { key: 'floorGeneral', label: 'Floor General', icon: '🧠', group: 'Playmaker', desc: 'Runs the offense: the pick-and-roll, the extra pass, the right read. Finds the open man before looking for a shot.' },
    { key: 'pointForward', label: 'Point Forward', icon: '👑', group: 'Playmaker', desc: "A forward's body with a point guard's eyes: brings it up, drives downhill and kicks, leads the break." },
    { key: 'playmakingBig', label: 'Playmaking Big', icon: '🎯', group: 'Playmaker', desc: 'The offense runs through this big at the elbow and on the block: hand-offs, cutters found, kick-outs.' },
    { key: 'deepRange', label: 'Deep Range Shooter', icon: '🌌', group: 'Shooter', desc: 'Pulls up from way beyond the line, off the dribble and on the break. Never afraid of the big shot.' },
    { key: 'movementShooter', label: 'Movement Shooter', icon: '🏃', group: 'Shooter', desc: 'Never stops moving without the ball: off screens, relocating, and the shot goes up on the catch.' },
    { key: 'explosiveSlasher', label: 'Explosive Slasher', icon: '⚡', group: 'Slasher', desc: 'A lightning first step straight to the rim: attacks every gap, finishes through traffic, runs the floor.' },
    { key: 'threeLevelScorer', label: 'Three-Level Scorer', icon: '🔥', group: 'Scorer', desc: 'A bucket from anywhere: the rim, the mid-range, the arc. Wants the ball when it matters.' },
    { key: 'shotCreator', label: 'Shot Creator', icon: '🎭', group: 'Scorer', desc: 'Creates a shot off the dribble against anyone: isolations, step-backs, pull-ups.' },
    { key: 'threeAndD', label: '3-and-D Wing', icon: '🛡️', group: 'Role', desc: "Spaces the floor for the open three, from the corner most of all, and guards the other team's best wing." },
    { key: 'lockdown', label: 'Lockdown Defender', icon: '🔒', group: 'Defender', desc: 'Picks up the ball and takes it away: tight on the ball, a hand in every shot.' },
    { key: 'stretchBig', label: 'Stretch Big', icon: '📏', group: 'Big', desc: 'A big who pops out to the arc after the screen and spaces the floor for the drivers.' },
    { key: 'postScorer', label: 'Post Scorer', icon: '🏋️', group: 'Big', desc: 'Back to the basket: seals deep, backs the defender down and works the moves on the block.' },
    { key: 'rimRunner', label: 'Rim Runner', icon: '🚀', group: 'Big', desc: 'Sets hard screens and dives to the rim: lobs, dunks, putbacks, the first big down the floor.' },
    { key: 'rimProtector', label: 'Rim Protector', icon: '🧱', group: 'Defender', desc: 'Anchors the defense at the rim: blocks, alters, owns the paint. Scores on putbacks and dump-offs.' },
    { key: 'glassCleaner', label: 'Glass Cleaner', icon: '🧲', group: 'Big', desc: 'Wants every rebound: crashes the offensive glass and boxes out.' },
    { key: 'comboGuard', label: 'Combo Guard', icon: '🔄', group: 'Scorer', desc: 'A bit of both guard spots: handles it, scores it, makes the simple play.' },
    { key: 'twoWayWing', label: 'Two-Way Wing', icon: '⚖️', group: 'Role', desc: 'Solid at both ends: takes what the defense gives and guards the matchup.' },
    { key: 'hustleBig', label: 'Hustle Big', icon: '💪', group: 'Big', desc: 'Screens, dives, rebounds, runs the floor: the dirty work.' },
  ];
  const KEYS = LIST.map(s => s.key);
  const BY_KEY = {};
  LIST.forEach(s => { BY_KEY[s.key] = s; });

  // what a style changes (1 = as the engine always did; 0 for the additive ones)
  const NEUTRAL = {
    use: 1,                                    // how many shots he takes
    iso: 1, pnr: 1, post: 1, offscreen: 1, cut: 1, dho: 1, spot: 1, finish: 1, // the plays and roles he is picked for
    passOut: 1, assist: 1,                     // the kick-out or the roll man rather than his own shot; the made shot he set up
    rim: 1, paint: 1, mid: 1, c3: 1, ab3: 1,   // where his shots come from
    deep: 0,                                   // the share of his threes above the break from deep (27 to 32 ft)
    step: 1, pull: 1, dunk: 1, floater: 1, lob: 1, pop: 1, // how: step-backs, pull-ups, dunks, floaters, lobs, the pick-and-pop
    push: 1, crash: 1,                         // the break, the offensive glass
    bar: 1,                                    // how good a look he waits for (higher: he passes up more)
    heat: 0,                                   // 0..1: takes the contested look when he is feeling it
    // the live court (through the player look): how hard he attacks a gap, how much he works the dribble, his passing flair
    // (added to his handle's), his off-ball relocations, cuts and screens, the roll after a screen, post moves, on-ball defense
    attack: 1, combo: 1, flair: 0, relocate: 1, cutK: 1, screenK: 1, roll: 1, postMove: 1, clamp: 1,
  };
  const MODS = {
    floorGeneral: { use: 0.88, pnr: 1.35, iso: 0.75, passOut: 1.4, assist: 1.3, bar: 1.15, rim: 0.92, mid: 1.05, step: 0.8, combo: 1.15, flair: 0.25, attack: 0.9 },
    pointForward: { use: 1.05, pnr: 1.25, post: 1.15, passOut: 1.25, assist: 1.2, rim: 1.15, ab3: 0.9, finish: 1.2, dunk: 1.15, push: 1.35, attack: 1.25, flair: 0.2 },
    playmakingBig: { use: 0.95, post: 1.25, dho: 1.8, passOut: 1.35, assist: 1.3, paint: 1.1, rim: 0.95, mid: 1.15, ab3: 1.1, pop: 1.3, bar: 1.1, flair: 0.3, roll: 0.8, postMove: 1.1 },
    deepRange: { use: 1.15, iso: 1.1, pnr: 1.15, ab3: 1.4, c3: 0.9, mid: 0.85, rim: 0.85, deep: 0.45, pull: 1.4, step: 1.25, heat: 0.8, bar: 0.9, combo: 1.2, attack: 0.9 },
    movementShooter: { offscreen: 1.8, spot: 1.35, iso: 0.7, pnr: 0.8, ab3: 1.2, c3: 1.25, mid: 1.05, rim: 0.75, pull: 0.75, deep: 0.12, heat: 0.5, relocate: 1.6, cutK: 1.2, screenK: 1.15 },
    explosiveSlasher: { use: 1.12, iso: 1.15, pnr: 1.1, cut: 1.35, finish: 1.4, rim: 1.4, paint: 1.1, mid: 0.85, c3: 0.7, ab3: 0.7, dunk: 1.35, floater: 1.2, pull: 0.8, push: 1.35, attack: 1.6, combo: 1.1 },
    threeLevelScorer: { use: 1.2, iso: 1.3, pnr: 1.05, post: 1.1, passOut: 0.85, rim: 1.05, mid: 1.3, ab3: 1.05, step: 1.2, pull: 1.15, heat: 0.6, bar: 0.92, combo: 1.15, attack: 1.15 },
    shotCreator: { use: 1.18, iso: 1.5, pnr: 1.05, passOut: 0.85, mid: 1.2, ab3: 1.1, rim: 0.95, step: 1.6, pull: 1.3, heat: 0.7, bar: 0.9, combo: 1.5 },
    threeAndD: { use: 0.82, spot: 1.4, iso: 0.6, pnr: 0.7, c3: 1.5, ab3: 1.15, mid: 0.75, rim: 0.85, pull: 0.7, bar: 1.05, relocate: 1.2, clamp: 1.12 },
    lockdown: { use: 0.85, iso: 0.75, spot: 1.1, c3: 1.15, mid: 0.95, clamp: 1.25 },
    stretchBig: { use: 0.95, post: 0.55, pop: 2.0, spot: 1.35, ab3: 1.5, c3: 1.3, rim: 0.75, paint: 0.85, mid: 1.15, crash: 0.7, roll: 0.6 },
    postScorer: { use: 1.1, post: 1.8, iso: 0.9, paint: 1.4, rim: 1.05, ab3: 0.6, c3: 0.6, step: 1.15, crash: 1.1, postMove: 1.4 },
    rimRunner: { use: 0.85, cut: 1.3, finish: 1.3, rim: 1.4, paint: 0.9, mid: 0.6, ab3: 0.4, c3: 0.4, dunk: 1.4, lob: 1.8, pop: 0.3, push: 1.2, crash: 1.3, roll: 1.4 },
    rimProtector: { use: 0.8, post: 0.8, rim: 1.2, mid: 0.75, ab3: 0.5, c3: 0.5, crash: 1.1, clamp: 1.05 },
    glassCleaner: { use: 0.8, rim: 1.2, paint: 1.05, mid: 0.7, ab3: 0.5, c3: 0.5, push: 0.9, crash: 1.6 },
    comboGuard: { pnr: 1.08, pull: 1.05 },
    twoWayWing: { clamp: 1.05 },
    hustleBig: { cut: 1.1, crash: 1.25, roll: 1.15, screenK: 1.2 },
  };
  // the multipliers centered on the league's mix of styles (Style.leagueMean)
  const CENTER = ['rim', 'paint', 'mid', 'c3', 'ab3', 'iso', 'pnr', 'post', 'offscreen', 'cut', 'dho', 'spot'];
  // the archetype a player was generated as (js/core/config.js ARCHETYPES) leans toward these styles
  const ARCH_HINT = {
    'Floor General': 'floorGeneral', 'Scoring Guard': 'threeLevelScorer', 'Slasher': 'explosiveSlasher', 'Two-Way Guard': 'lockdown',
    'Sharpshooter': 'movementShooter', '3&D Wing': 'threeAndD', 'Shot Creator': 'shotCreator', 'Athletic Wing': 'explosiveSlasher',
    'Point Forward': 'pointForward', 'Scoring Wing': 'threeLevelScorer', 'Stretch Four': 'stretchBig', 'Athletic Four': 'rimRunner',
    'Post Scorer': 'postScorer', 'Glue Defender': 'lockdown', 'Rim Protector': 'rimProtector', 'Stretch Big': 'stretchBig',
    'Rim Runner': 'rimRunner', 'Playmaking Big': 'playmakingBig',
  };
  const POS_OK = {
    floorGeneral: [1, 2], pointForward: [3, 4], playmakingBig: [4, 5], deepRange: [1, 2, 3], movementShooter: [1, 2, 3, 4],
    explosiveSlasher: [1, 2, 3], threeLevelScorer: [1, 2, 3, 4], shotCreator: [1, 2, 3], threeAndD: [2, 3, 4], lockdown: [1, 2, 3, 4],
    stretchBig: [4, 5], postScorer: [3, 4, 5], rimRunner: [4, 5], rimProtector: [4, 5], glassCleaner: [4, 5],
    comboGuard: [1, 2], twoWayWing: [2, 3, 4], hustleBig: [4, 5],
  };
  const FALLBACK = { 1: 'comboGuard', 2: 'comboGuard', 3: 'twoWayWing', 4: 'hustleBig', 5: 'hustleBig' };

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const posN = (p) => (C && C.POS_NUM[p.pos]) || 3;

  /** how well he fits each style (how far he stands out from his position in its skills, 0 when he misses its gates) */
  function scores(p) {
    const r = p.r || {}, pos = posN(p), base = (C && C.POS_BASE[p.pos]) || {};
    const t = (PBC.Tendency && PBC.Tendency.get ? PBC.Tendency.get(p) : p.tend) || {};
    const dv = (k) => (r[k] != null ? r[k] : 60) - (base[k] != null ? base[k] : 60);
    const tv = (k) => (t[k] != null ? t[k] : 50) - 50;
    const R = (k) => (r[k] != null ? r[k] : 60);
    const pv = (R('pass') + R('vision')) / 2;
    // (how much of a scorer he is beyond his position: a defender's or a role player's style is the one he plays when he is not
    // first a scorer or a playmaker)
    const off = Math.max(dv('three'), dv('mid'), dv('layup'), dv('post'), (dv('pass') + dv('vision')) / 2, 0);
    const S = {
      floorGeneral: pv >= 70 ? 0.5 * dv('pass') + 0.6 * dv('vision') + 0.25 * dv('handle') + 0.2 * dv('shotIQ') + 0.12 * tv('pass') : 0,
      pointForward: pv >= 64 && R('handle') >= 58 ? 0.5 * dv('pass') + 0.5 * dv('vision') + 0.3 * dv('handle') + 0.15 * dv('strength') + 0.1 * tv('pass') : 0,
      playmakingBig: pv >= 60 ? 0.55 * dv('pass') + 0.6 * dv('vision') + 0.15 * dv('post') + 0.1 * tv('pass') : 0,
      deepRange: R('three') >= 81 && R('handle') >= 66 ? 0.9 * dv('three') + 0.25 * dv('handle') + 0.1 * tv('three') + 0.1 * tv('pullup') : 0,
      movementShooter: R('three') >= 74 ? 0.85 * dv('three') + 0.15 * dv('mid') + 0.1 * dv('speed') - 0.15 * dv('handle') - 0.08 * tv('pullup') + 0.06 * tv('three') : 0,
      explosiveSlasher: Math.max(R('layup'), R('dunk')) >= 74 && R('speed') >= 74 ? 0.4 * dv('layup') + 0.35 * dv('dunk') + 0.35 * dv('speed') + 0.25 * dv('agility') + 0.2 * dv('vert') + 0.15 * dv('drawFoul') + 0.1 * tv('rim') - 0.15 * dv('three') : 0,
      threeLevelScorer: R('three') >= 70 && R('mid') >= 72 && Math.max(R('layup'), R('close')) >= 68 ? 0.3 * dv('three') + 0.35 * dv('mid') + 0.25 * dv('layup') + 0.1 * dv('close') + 0.1 * tv('iso') - 0.1 * dv('pass') + 2 : 0,
      shotCreator: R('handle') >= 74 && Math.max(R('mid'), R('three')) >= 70 ? 0.45 * dv('handle') + 0.3 * dv('mid') + 0.2 * dv('three') + 0.12 * tv('stepback') + 0.1 * tv('iso') + 0.1 * dv('agility') : 0,
      threeAndD: R('three') >= 68 && R('perD') >= 68 ? 0.4 * dv('three') + 0.45 * dv('perD') + 0.2 * dv('helpD') + 0.1 * dv('steal') - 0.15 * dv('handle') - 0.06 * tv('iso') : 0,
      lockdown: R('perD') >= 78 ? 0.7 * dv('perD') + 0.25 * dv('steal') + 0.15 * dv('agility') + 0.1 * dv('helpD') - 0.5 * off : 0,
      stretchBig: R('three') >= 66 ? 0.85 * dv('three') + 0.2 * dv('mid') : 0,
      postScorer: R('post') >= 70 ? 0.75 * dv('post') + 0.25 * dv('close') + 0.15 * dv('strength') + 0.1 * tv('post') : 0,
      rimRunner: R('dunk') >= 74 ? 0.45 * dv('dunk') + 0.35 * dv('vert') + 0.2 * dv('speed') + 0.1 * dv('oreb') - 0.1 * dv('mid') - 0.1 * dv('three') : 0,
      rimProtector: R('block') >= 74 ? 0.7 * dv('block') + 0.35 * dv('intD') + 0.1 * dv('helpD') - 0.3 * off : 0,
      glassCleaner: (R('oreb') + R('dreb')) / 2 >= 72 ? 0.45 * dv('oreb') + 0.45 * dv('dreb') + 0.15 * dv('hustle') + 0.08 * tv('crash') - 0.3 * off : 0,
      comboGuard: 1.2, twoWayWing: 1.2, hustleBig: 1.2,
    };
    // (a four who stands out in nothing: a wing if he guards the perimeter better than the paint, else a big)
    if (pos === 4) { if (R('perD') >= R('intD')) S.hustleBig = 0; else S.twoWayWing = 0; }
    const hint = ARCH_HINT[p.arch];
    for (const k of KEYS) {
      if (POS_OK[k].indexOf(pos) < 0) S[k] = 0;
      else if (k === hint && S[k] > 0) S[k] += 3;
    }
    return S;
  }
  /** the style that fits him best (not what he plays with when one was picked for him: Style.of) */
  function detect(p) {
    if (!p || !p.r) return FALLBACK[3];
    const S = scores(p);
    let best = null, bv = 0;
    for (const k of KEYS) if (S[k] > bv) { bv = S[k]; best = k; }
    return best || FALLBACK[posN(p)];
  }
  /** his style: the one picked for him in the editor, else the one his ratings fit */
  function of(p) {
    if (!p) return FALLBACK[3];
    if (p.styleCustom && BY_KEY[p.style]) return p.style;
    return detect(p);
  }
  /** keep p.style in step with his ratings (after progression, the editor, a new league): unless it was picked for him */
  function refresh(p) {
    if (!p || p.styleCustom) return p ? p.style : null;
    p.style = detect(p);
    return p.style;
  }
  /** pick his style (key) or go back to following his ratings (null / 'auto') */
  function set(p, key) {
    if (!p) return null;
    if (!key || key === 'auto' || !BY_KEY[key]) { delete p.styleCustom; p.style = detect(p); }
    else { p.style = key; p.styleCustom = true; }
    return p.style;
  }
  /** the style's changes, merged on the neutral values */
  function modsOf(key) {
    const m = Object.assign({}, NEUTRAL, MODS[key] || {});
    m.key = key;
    return m;
  }
  function mods(p) { return modsOf(of(p)); }

  /** the league's own mix of styles (players on a team), for centering: the mean of each centered multiplier. Kept on the
   *  league object until the day changes */
  function leagueMean(S) {
    const day = S ? (S.season || 0) * 1000 + (S.day || 0) : 0;
    if (S && S._styleMean && S._styleMean.day === day) return S._styleMean.m;
    const m = {};
    for (const k of CENTER) m[k] = 0;
    let n = 0;
    const players = S && S.players ? Object.values(S.players) : [];
    for (const p of players) {
      if (!p || p.tid == null || p.tid < 0) continue;
      const md = mods(p);
      for (const k of CENTER) m[k] += md[k];
      n++;
    }
    for (const k of CENTER) m[k] = n ? m[k] / n : 1;
    if (S) Object.defineProperty(S, '_styleMean', { value: { day, m }, configurable: true, enumerable: false, writable: true });
    return m;
  }

  /** what the live court reads from his style (through the player look, lk.sty): how he plays it on the floor */
  function court(p) {
    const m = mods(p);
    return { key: m.key, attack: m.attack, combo: m.combo, flair: m.flair, relocate: m.relocate, cutK: m.cutK, screenK: m.screenK, roll: m.roll, postMove: m.postMove, clamp: m.clamp, pop: m.pop, push: m.push, crash: m.crash, deep: m.deep, bar: m.bar, heat: m.heat };
  }

  PBC.Style = { LIST, KEYS, BY_KEY, NEUTRAL, MODS, CENTER, scores, detect, of, refresh, set, mods, modsOf, leagueMean, court, label: (k) => (BY_KEY[k] ? BY_KEY[k].label : '') };
})();
