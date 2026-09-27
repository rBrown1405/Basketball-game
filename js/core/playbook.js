/* Pro BBALL Coach — playbooks: plays as data, roles filled by ratings, and each team's playbook.
 *
 * A play is a sequence of steps run by roles (ball handler, screener, shooter, cutter, post, ...):
 *  - `align`: where each role starts ([u, v] = feet from the baseline, feet from the ball-side sideline; the rim is at
 *    (5.25, 25)). Plays are drawn with the ball on the v < 25 side and mirrored for the other side.
 *  - `steps`: what happens, in order: screens (on or off the ball), passes, hand-offs, the ball handler's moves, and
 *    where the other roles go (`pos`). `d` is the step's length in seconds at game speed.
 *  - `opts` (the reads): where the play can end, at which step, who shoots and who passes, which engine branch it
 *    is (the shot model the league is calibrated on), and the defensive reactions that open it up (`trig`: a
 *    multiplier when that reaction happens: the pick-and-roll coverage drop / hedge / blitz / switch / ice / show,
 *    how an off-ball screen is played trail / under / top / obswitch, help on a drive, denial, a post double team, a
 *    zone). An option before the last step is an early read: taking it is the play working, not failing.
 *  - `roles`: the rating profile each role wants; `primary` is the role the play is run for (picked the way the
 *    engine always picked its actors, so the league's usage stays as it was), the other roles go to the best fits.
 * Library: pick and roll (high, side, Spain, pop, drag), horns (base, flare, twist, elbow hand-off), floppy, pin-down,
 * stagger, hammer, Chicago, dribble hand-off, Iverson, post (low post, high-low, duck-in, elbow), isolation (top,
 * wing), flex, UCLA, backdoor, motion swing, drive and kick, zone offense (overload, high post), inbound plays under
 * the basket (BLOB) and from the sideline (SLOB), end-of-game and after-timeout plays.
 * Sources: docs/GAMEPLAY_AI_PLAN.md ("Research behind Phase 3").
 */
(function () {
  'use strict';
  const PBC = (window.PBC = window.PBC || {});
  const U = PBC.U, C = PBC.Config;
  const Playbook = (PBC.Playbook = {});
  Playbook.VERSION = 1;

  // ---------------------------------------------------------------- role profiles
  // weights on ratings and a few derived features (0-100): big = how much of a big he is (PG 0 .. C 100), small = 100
  // - big, finish = his best finishing rating, pull = his best pull-up jumper, scorer = scoring skill
  const PROFILES = {
    handler: { handle: 3, pass: 2, vision: 1.5, shotIQ: 1, scorer: 1.5, small: 1 },
    pnr: { handle: 3, pass: 2, pull: 2, speed: 1, scorer: 2, small: 1 },
    screener: { big: 3, strength: 2, finish: 2.5, pass: 0.5 },
    popper: { big: 2, three: 3.5, strength: 1 },
    shooter: { three: 4, shotIQ: 1, speed: 0.5, scorer: 1 },
    spacer: { three: 3, small: 1 },
    cutter: { speed: 2, finish: 2.5, agility: 1, small: 0.5 },
    post: { post: 4, strength: 2, close: 2, big: 1.5 },
    passer: { pass: 3, vision: 2, big: 1.5, mid: 1 },
    scorer: { scorer: 4, handle: 1.5, mid: 1, three: 1 },
    inbounder: { pass: 3, vision: 2, big: 0.5 },
    dunker: { big: 3, finish: 2, oreb: 1.5, vert: 1 },
    screen2: { big: 2, strength: 2, small: -0.5 },
  };
  Playbook.PROFILES = PROFILES;
  const posNOf = (x) => x.posN || C.POS_NUM[x.pos] || 3;
  function feature(x, k) {
    const r = x.r;
    switch (k) {
      case 'big': return (posNOf(x) - 1) * 25;
      case 'small': return 100 - (posNOf(x) - 1) * 25;
      case 'finish': return Math.max(r.dunk, r.close, r.layup);
      case 'pull': return Math.max(r.mid, r.three);
      case 'scorer': return 0.42 * Math.max(r.three, r.mid * 0.97) + 0.38 * Math.max(r.layup, r.close, r.dunk * 0.95, r.post * 0.95) + 0.1 * r.drawFoul + 0.1 * r.shotIQ;
      default: return r[k] != null ? r[k] : 50;
    }
  }
  /** how well a player (a roster player or an in-game player) fits a role profile, 0-100 */
  Playbook.fit = function (x, profile) {
    const pf = PROFILES[profile] || profile;
    let s = 0, n = 0;
    for (const k in pf) { s += pf[k] * feature(x, k); n += Math.abs(pf[k]); }
    return n ? s / n : 50;
  };

  // ---------------------------------------------------------------- the plays
  // step events: ['screen', screener, user, 'ball' | 'off_ball'], ['pass', from, to, kind], ['handoff', from, to],
  // ['move', role, move] (the ball handler only: drive, hesi, crossover, size_up, backdown, ...), ['step'] (only
  // off-ball positions). opts: { at, base, br (branch), who, from, w, trig, zk (zone multipliers), label }
  const TOP = [30.5, 25], SLOT_L = [28.5, 15], SLOT_R = [28.5, 35], WING_L = [23, 7], WING_R = [23, 43];
  const CORNER_L = [2.5, 2], CORNER_R = [2.5, 48], ELBOW_L = [19, 17], ELBOW_R = [19, 33], BLOCK_L = [7.5, 17], BLOCK_R = [7.5, 33];
  const DUNK_L = [3, 14], DUNK_R = [3, 36], SHORT_L = [4, 9], SHORT_R = [4, 41], NAIL = [19, 25], RIM = [5.5, 25];

  const PLAYS = {
    // ---------------------------------------------------------- pick and roll
    highPnr: {
      name: 'High Pick and Roll', family: 'pnr', tags: ['half'],
      desc: 'The big comes up to screen at the top, four around him: roll, pull up, or kick to a corner when the help comes.',
      roles: { ball: 'pnr', screen: 'screener', dunker: 'dunker', left: 'spacer', right: 'spacer' },
      primary: 'ball', pick: 'pnr', map: { handler: 'ball', screener: 'screen' },
      align: { ball: TOP, screen: ELBOW_R, dunker: DUNK_R, left: CORNER_L, right: WING_R },
      steps: [
        { d: 1.5, text: 'The big comes up and sets the ball screen', ev: [['screen', 'screen', 'ball', 'ball']] },
        { d: 1.2, text: 'The handler comes off it going left, the big rolls, the dunker holds', ev: [['move', 'ball', 'drive']], pos: { dunker: DUNK_R, left: CORNER_L, right: WING_R } },
        { d: 0.8, text: 'Read the help: the roller, a corner, or finish' },
      ],
      opts: [
        { at: 1, base: 'pnr', br: 'handler', who: 'ball', w: 18, zk: { mid: 1.6, ab3: 1.3, rim: 0.5, paint: 0.8 }, trig: { drop: 1.7, show: 1.1, hedge: 0.6, blitz: 0.35, ice: 1.2 }, label: 'Pull-up over the screen' },
        { at: 2, base: 'pnr', br: 'handler', who: 'ball', w: 22, zk: { rim: 1.5, paint: 1.3, mid: 0.6, ab3: 0.4 }, trig: { switch: 1.5, ice: 0.6, drop: 0.8, blitz: 0.4 }, label: 'Turn the corner to the rim' },
        { at: 2, base: 'pnr', br: 'roller', who: 'screen', from: 'ball', w: 18, trig: { hedge: 1.5, blitz: 1.8, show: 1.3, drop: 0.6, switch: 0.7 }, label: 'Hit the roller' },
        { at: 2, base: 'pnr', br: 'roller', who: 'dunker', from: 'ball', w: 6, trig: { help: 1.8, drop: 0.6 }, label: 'Dump-off to the dunker spot' },
        { at: 2, base: 'pnr', br: 'kick', who: ['left', 'right'], from: 'ball', w: 36, trig: { help: 1.5, blitz: 1.6, drop: 0.9 }, label: 'Kick to the open shooter' },
      ],
    },
    sidePnr: {
      name: 'Side Pick and Roll', family: 'pnr', tags: ['half'],
      desc: 'A side ball screen on the wing with the weak side loaded: attack the middle, or the baseline against ice.',
      roles: { ball: 'pnr', screen: 'screener', dunker: 'dunker', slot: 'spacer', corner: 'spacer' },
      primary: 'ball', pick: 'pnr', map: { handler: 'ball', screener: 'screen' },
      align: { ball: WING_L, screen: ELBOW_L, dunker: DUNK_R, slot: SLOT_R, corner: CORNER_R },
      steps: [
        { d: 1.4, text: 'The big sets the side ball screen on the wing', ev: [['screen', 'screen', 'ball', 'ball']] },
        { d: 1.2, text: 'The handler attacks the middle, the big rolls', ev: [['move', 'ball', 'drive']], pos: { slot: SLOT_R, corner: CORNER_R } },
        { d: 0.8, text: 'Read the tag man: the roller, the skip pass, or finish' },
      ],
      opts: [
        { at: 1, base: 'pnr', br: 'handler', who: 'ball', w: 16, zk: { mid: 1.6, ab3: 1.2, rim: 0.5 }, trig: { drop: 1.6, ice: 1.4, hedge: 0.6, blitz: 0.35 }, label: 'Pull-up at the elbow' },
        { at: 2, base: 'pnr', br: 'handler', who: 'ball', w: 24, zk: { rim: 1.4, paint: 1.4, mid: 0.7, ab3: 0.4 }, trig: { switch: 1.5, ice: 0.8, drop: 0.8, blitz: 0.4 }, label: 'Drive the middle' },
        { at: 2, base: 'pnr', br: 'roller', who: 'screen', from: 'ball', w: 20, trig: { hedge: 1.5, blitz: 1.8, ice: 1.2, drop: 0.6, switch: 0.7 }, label: 'Pocket pass to the roller' },
        { at: 2, base: 'pnr', br: 'kick', who: ['corner', 'slot'], from: 'ball', w: 34, trig: { help: 1.6, blitz: 1.6 }, label: 'Skip to the weak side' },
        { at: 2, base: 'pnr', br: 'roller', who: 'dunker', from: 'ball', w: 6, trig: { help: 1.8 }, label: 'Dump-off to the dunker spot' },
      ],
    },
    spainPnr: {
      name: 'Spain Pick and Roll', family: 'pnr', tags: ['half', 'ato'],
      desc: 'A high pick and roll where a shooter back-screens the roller\'s defender, then pops for three.',
      roles: { ball: 'pnr', screen: 'screener', back: 'shooter', left: 'spacer', right: 'spacer' },
      primary: 'ball', pick: 'pnr', map: { handler: 'ball', screener: 'screen' },
      align: { ball: TOP, screen: ELBOW_R, back: NAIL, left: CORNER_L, right: CORNER_R },
      steps: [
        { d: 1.5, text: 'The big sets the ball screen, a shooter waits at the nail', ev: [['screen', 'screen', 'ball', 'ball']] },
        { d: 1.0, text: 'The big rolls and the shooter back-screens his defender', ev: [['screen', 'back', 'screen', 'off_ball'], ['move', 'ball', 'drive']] },
        { d: 1.0, text: 'The back-screener pops to the top', ev: [['step']], pos: { back: TOP, left: CORNER_L, right: CORNER_R } },
      ],
      opts: [
        { at: 1, base: 'pnr', br: 'roller', who: 'screen', from: 'ball', w: 30, trig: { drop: 1.6, hedge: 1.3, show: 1.3, switch: 0.6 }, label: 'Lob to the roller' },
        { at: 2, base: 'pnr', br: 'kick', who: 'back', from: 'ball', w: 25, trig: { switch: 1.5, drop: 1.2, help: 1.3 }, label: 'Pop three for the back-screener' },
        { at: 1, base: 'pnr', br: 'handler', who: 'ball', w: 30, zk: { mid: 1.3, rim: 1.1 }, trig: { drop: 1.3, blitz: 0.5 }, label: 'Handler keeps it' },
        { at: 2, base: 'pnr', br: 'kick', who: ['left', 'right'], from: 'ball', w: 15, trig: { help: 1.5, blitz: 1.5 }, label: 'Kick to a corner' },
      ],
    },
    pickPop: {
      name: 'Pick and Pop', family: 'pnr', tags: ['half', 'three'],
      desc: 'A shooting big sets the ball screen and pops behind the line instead of rolling.',
      roles: { ball: 'pnr', screen: 'popper', dunker: 'dunker', left: 'spacer', right: 'spacer' },
      primary: 'ball', pick: 'pnr', map: { handler: 'ball', screener: 'screen' },
      align: { ball: TOP, screen: ELBOW_L, dunker: DUNK_R, left: CORNER_L, right: WING_R },
      steps: [
        { d: 1.5, text: 'The big sets the ball screen', ev: [['screen', 'screen', 'ball', 'ball']] },
        { d: 1.2, text: 'He pops to the slot, the handler attacks the space', ev: [['move', 'ball', 'drive']], pos: { screen: SLOT_L } },
      ],
      opts: [
        { at: 1, base: 'pnr', br: 'roller', pop: true, who: 'screen', from: 'ball', w: 30, trig: { drop: 1.8, blitz: 1.4, hedge: 0.9, switch: 0.8 }, label: 'Pop three for the big' },
        { at: 1, base: 'pnr', br: 'handler', who: 'ball', w: 36, zk: { rim: 1.2, mid: 1.1 }, trig: { switch: 1.4, blitz: 0.4, hedge: 1.1 }, label: 'Handler attacks the space' },
        { at: 1, base: 'pnr', br: 'kick', who: ['left', 'right'], from: 'ball', w: 34, trig: { help: 1.4, blitz: 1.5 }, label: 'Kick to the open shooter' },
      ],
    },
    drag: {
      name: 'Drag Screen', family: 'pnr', tags: ['early', 'twoForOne'],
      desc: 'Early offense: the trailing big sets a drag screen before the defense is set.',
      roles: { ball: 'pnr', trail: 'screener', runner: 'dunker', left: 'spacer', right: 'spacer' },
      primary: 'ball', pick: 'pnr', map: { handler: 'ball', screener: 'trail' },
      align: { ball: [33, 18], trail: [38, 28], runner: DUNK_R, left: CORNER_L, right: CORNER_R },
      steps: [
        { d: 1.0, text: 'The trailer drags a screen at the arc', ev: [['screen', 'trail', 'ball', 'ball']] },
        { d: 1.0, text: 'The handler attacks before the defense is set', ev: [['move', 'ball', 'drive']] },
      ],
      opts: [
        { at: 1, base: 'pnr', br: 'handler', who: 'ball', w: 42, zk: { rim: 1.3, ab3: 1.1 }, trig: { drop: 1.3, switch: 1.3, blitz: 0.4 }, label: 'Attack the drag' },
        { at: 1, base: 'pnr', br: 'roller', who: 'trail', from: 'ball', w: 20, trig: { hedge: 1.5, blitz: 1.6 }, label: 'Trailer rolls' },
        { at: 1, base: 'pnr', br: 'kick', who: ['left', 'right'], from: 'ball', w: 38, trig: { help: 1.5 }, label: 'Kick to the corner' },
      ],
    },
    // ---------------------------------------------------------- horns
    horns: {
      name: 'Horns', family: 'horns', tags: ['half'],
      desc: 'Both bigs at the elbows, shooters in the corners: a ball screen from one elbow, the other big pops.',
      roles: { ball: 'pnr', big1: 'screener', big2: 'popper', left: 'spacer', right: 'spacer' },
      primary: 'ball', pick: 'pnr', map: { handler: 'ball', screener: 'big1' },
      align: { ball: TOP, big1: ELBOW_L, big2: ELBOW_R, left: CORNER_L, right: CORNER_R },
      steps: [
        { d: 1.3, text: 'Horns set: bigs at the elbows, shooters in the corners', ev: [['step']], pos: { big1: ELBOW_L, big2: ELBOW_R, left: CORNER_L, right: CORNER_R } },
        { d: 1.2, text: 'The left elbow big sets the ball screen', ev: [['screen', 'big1', 'ball', 'ball']] },
        { d: 1.2, text: 'He rolls, the other big pops to the top', ev: [['move', 'ball', 'drive']], pos: { big2: SLOT_R } },
      ],
      opts: [
        { at: 2, base: 'pnr', br: 'handler', who: 'ball', w: 38, trig: { drop: 1.4, switch: 1.3, blitz: 0.4 }, label: 'Handler reads the screen' },
        { at: 2, base: 'pnr', br: 'roller', who: 'big1', from: 'ball', w: 20, trig: { hedge: 1.5, blitz: 1.7, drop: 0.6 }, label: 'Hit the roller' },
        { at: 2, base: 'pnr', br: 'kick', who: 'big2', from: 'ball', w: 14, trig: { drop: 1.3, help: 1.4 }, label: 'Pop big at the top' },
        { at: 2, base: 'pnr', br: 'kick', who: ['left', 'right'], from: 'ball', w: 28, trig: { help: 1.5, blitz: 1.4 }, label: 'Kick to a corner' },
      ],
    },
    hornsFlare: {
      name: 'Horns Flare', family: 'horns', tags: ['half', 'ato', 'three'],
      desc: 'The guard passes to an elbow and gets a flare screen from the other big for a three on the wing.',
      roles: { ball: 'shooter', big1: 'passer', big2: 'screen2', left: 'spacer', right: 'spacer' },
      primary: 'ball', pick: 'shooter', map: { handler: 'ball', shooter: 'ball', screener: 'big2' },
      align: { ball: TOP, big1: ELBOW_L, big2: ELBOW_R, left: CORNER_L, right: CORNER_R },
      steps: [
        { d: 1.2, text: 'Entry to the left elbow', ev: [['pass', 'ball', 'big1', 'chest']] },
        { d: 1.2, text: 'The right elbow big flares the guard to the wing', ev: [['screen', 'big2', 'ball', 'off_ball']], pos: { ball: WING_R } },
        { d: 1.0, text: 'Skip it back to the flare', ev: [['step']] },
      ],
      opts: [
        { at: 2, base: 'offscreen', br: 'shooter', who: 'ball', from: 'big1', w: 45, zk: { ab3: 1.6, mid: 0.6 }, trig: { under: 1.4, trail: 0.9, top: 0.6, obswitch: 0.7 }, label: 'Flare three' },
        { at: 1, base: 'post', br: 'self', who: 'big1', w: 14, zk: { mid: 2, paint: 1.1, rim: 0.7 }, trig: { help: 0.8 }, label: 'Elbow big faces up' },
        { at: 2, base: 'pnr', br: 'roller', who: 'big2', from: 'big1', w: 14, trig: { obswitch: 2.2 }, label: 'Screener slips to the rim' },
        { at: 2, base: 'offscreen', br: 'kick', who: ['left', 'right'], from: 'big1', w: 27, trig: { help: 1.3 }, label: 'Corner cuts or kick' },
      ],
    },
    hornsTwist: {
      name: 'Horns Twist', family: 'horns', tags: ['half'],
      desc: 'A ball screen from one elbow, then the other big re-screens the other way (the twist).',
      roles: { ball: 'pnr', big1: 'screen2', big2: 'screener', left: 'spacer', right: 'spacer' },
      primary: 'ball', pick: 'pnr', map: { handler: 'ball', screener: 'big2' },
      align: { ball: TOP, big1: ELBOW_L, big2: ELBOW_R, left: CORNER_L, right: CORNER_R },
      steps: [
        { d: 1.2, text: 'The left big sets the first ball screen', ev: [['screen', 'big1', 'ball', 'ball']] },
        { d: 1.2, text: 'The right big twists and re-screens the other way', ev: [['screen', 'big2', 'ball', 'ball']], pos: { big1: SLOT_L } },
        { d: 1.0, text: 'The handler attacks, the big rolls', ev: [['move', 'ball', 'drive']] },
      ],
      opts: [
        { at: 2, base: 'pnr', br: 'handler', who: 'ball', w: 40, trig: { switch: 1.5, drop: 1.3, blitz: 0.5 }, label: 'Handler off the twist' },
        { at: 2, base: 'pnr', br: 'roller', who: 'big2', from: 'ball', w: 24, trig: { hedge: 1.6, blitz: 1.6, switch: 1.2 }, label: 'Roller off the twist' },
        { at: 2, base: 'pnr', br: 'kick', who: ['left', 'right', 'big1'], from: 'ball', w: 36, trig: { help: 1.5 }, label: 'Kick out' },
      ],
    },
    hornsElbow: {
      name: 'Horns Elbow Hand-off', family: 'horns', tags: ['half'],
      desc: 'Entry to the elbow, the guard gets it back on a hand-off and turns the corner behind the big.',
      roles: { ball: 'pnr', big1: 'passer', big2: 'dunker', left: 'spacer', right: 'spacer' },
      primary: 'ball', pick: 'dho', map: { handler: 'ball', big: 'big1' },
      align: { ball: TOP, big1: ELBOW_L, big2: ELBOW_R, left: CORNER_L, right: CORNER_R },
      steps: [
        { d: 1.2, text: 'Entry to the elbow', ev: [['pass', 'ball', 'big1', 'chest']], pos: { big2: DUNK_R } },
        { d: 1.2, text: 'The guard runs by for the hand-off', ev: [['handoff', 'big1', 'ball']] },
        { d: 0.9, text: 'Turn the corner; the big rolls', ev: [['move', 'ball', 'drive']] },
      ],
      opts: [
        { at: 2, base: 'handoff', br: 'receiver', who: 'ball', w: 62, trig: { drop: 1.3, switch: 1.2, hedge: 0.8 }, label: 'Turn the corner off the hand-off' },
        { at: 2, base: 'handoff', br: 'big', who: 'big1', from: 'ball', w: 12, trig: { hedge: 1.5, switch: 1.4 }, label: 'Big rolls after the hand-off' },
        { at: 2, base: 'handoff', br: 'kick', who: ['left', 'right'], from: 'ball', w: 26, trig: { help: 1.5 }, label: 'Kick to a corner' },
      ],
    },
    // ---------------------------------------------------------- off-screen actions
    floppy: {
      name: 'Floppy', family: 'offscreen', tags: ['half', 'ato', 'three'],
      desc: 'The shooter starts under the rim and picks a side: a single screen or a double stagger.',
      roles: { ball: 'handler', shooter: 'shooter', single: 'screener', dbl1: 'screen2', dbl2: 'screen2' },
      primary: 'shooter', pick: 'shooter', map: { handler: 'ball', shooter: 'shooter', screener: 'dbl1' },
      align: { ball: TOP, shooter: RIM, single: BLOCK_L, dbl1: BLOCK_R, dbl2: [10, 38] },
      steps: [
        { d: 1.4, text: 'Floppy set: the shooter under the rim, a single on one side and a double on the other', ev: [['step']], pos: { single: BLOCK_L, dbl1: BLOCK_R, dbl2: [10, 38] } },
        { d: 1.4, text: 'The shooter reads his man and comes off the double', ev: [['screen', 'dbl1', 'shooter', 'off_ball']], pos: { shooter: WING_R } },
        { d: 1.0, text: 'The catch on the wing', ev: [['step']] },
      ],
      opts: [
        { at: 2, base: 'offscreen', br: 'shooter', who: 'shooter', from: 'ball', w: 40, zk: { ab3: 1.4, mid: 0.8 }, trig: { under: 1.4, trail: 0.8, obswitch: 0.8 }, label: 'Catch and shoot' },
        { at: 2, base: 'offscreen', br: 'shooter', who: 'shooter', from: 'ball', w: 18, zk: { mid: 1.6, rim: 6, ab3: 0.3, c3: 0.2 }, trig: { trail: 2.2, under: 0.4 }, label: 'Curl to the rim' },
        { at: 2, base: 'offscreen', br: 'shooter', who: 'shooter', from: 'ball', w: 12, zk: { c3: 3, ab3: 1.2, mid: 0.6 }, trig: { under: 1.8, trail: 0.5 }, label: 'Fade to the corner' },
        { at: 2, base: 'post', br: 'self', who: 'dbl1', from: 'ball', w: 8, trig: { obswitch: 2.5 }, label: 'Screener seals the switch' },
        { at: 2, base: 'offscreen', br: 'kick', who: ['single', 'dbl2'], from: 'shooter', w: 14, trig: { help: 1.3 }, label: 'Shooter drives and dishes' },
        { at: 1, base: 'iso', br: 'self', who: 'ball', w: 8, trig: { deny: 1.5 }, label: 'Handler goes alone' },
      ],
    },
    pindown: {
      name: 'Pin-Down', family: 'offscreen', tags: ['half'],
      desc: 'A big screens down on the shooter at the block; he pops to the wing for the catch.',
      roles: { ball: 'handler', shooter: 'shooter', screen: 'screen2', corner: 'spacer', dunker: 'dunker' },
      primary: 'shooter', pick: 'shooter', map: { handler: 'ball', shooter: 'shooter', screener: 'screen' },
      align: { ball: SLOT_R, shooter: BLOCK_L, screen: ELBOW_L, corner: CORNER_R, dunker: DUNK_R },
      steps: [
        { d: 1.3, text: 'The big screens down for the shooter', ev: [['screen', 'screen', 'shooter', 'off_ball']], pos: { shooter: WING_L } },
        { d: 1.0, text: 'The reversal pass to the wing', ev: [['step']] },
      ],
      opts: [
        { at: 1, base: 'offscreen', br: 'shooter', who: 'shooter', from: 'ball', w: 42, zk: { ab3: 1.3 }, trig: { under: 1.4, trail: 0.8 }, label: 'Catch and shoot' },
        { at: 1, base: 'offscreen', br: 'shooter', who: 'shooter', from: 'ball', w: 16, zk: { mid: 1.6, rim: 6, ab3: 0.3, c3: 0.2 }, trig: { trail: 2.2, under: 0.4 }, label: 'Curl' },
        { at: 1, base: 'offscreen', br: 'shooter', who: 'shooter', from: 'ball', w: 10, zk: { c3: 3, ab3: 1.2 }, trig: { under: 1.8 }, label: 'Fade' },
        { at: 0, base: 'cut', br: 'cutter', who: 'shooter', from: 'ball', w: 6, trig: { top: 3, deny: 2 }, label: 'Backdoor on the top lock' },
        { at: 1, base: 'pnr', br: 'roller', who: 'screen', from: 'ball', w: 8, trig: { obswitch: 2.5 }, label: 'Screener slips' },
        { at: 1, base: 'offscreen', br: 'kick', who: ['corner', 'dunker'], from: 'shooter', w: 18, trig: { help: 1.3 }, label: 'Shooter drives and dishes' },
      ],
    },
    stagger: {
      name: 'Stagger Screens', family: 'offscreen', tags: ['half', 'three', 'need3'],
      desc: 'Two screens in a row free the shooter coming from the block to the top.',
      roles: { ball: 'handler', shooter: 'shooter', s1: 'screen2', s2: 'screen2', corner: 'spacer' },
      primary: 'shooter', pick: 'shooter', map: { handler: 'ball', shooter: 'shooter', screener: 's2' },
      align: { ball: WING_R, shooter: BLOCK_L, s1: [9, 20], s2: [18, 22], corner: CORNER_R },
      steps: [
        { d: 1.2, text: 'The shooter comes off the first screen', ev: [['screen', 's1', 'shooter', 'off_ball']] },
        { d: 1.2, text: 'and the second one to the top', ev: [['screen', 's2', 'shooter', 'off_ball']], pos: { shooter: TOP } },
        { d: 0.9, text: 'The pass to the top', ev: [['step']] },
      ],
      opts: [
        { at: 2, base: 'offscreen', br: 'shooter', who: 'shooter', from: 'ball', w: 48, zk: { ab3: 1.5, mid: 0.7 }, trig: { under: 1.4, trail: 0.9 }, label: 'Catch and shoot at the top' },
        { at: 2, base: 'offscreen', br: 'shooter', who: 'shooter', from: 'ball', w: 14, zk: { mid: 1.5, rim: 5, ab3: 0.3 }, trig: { trail: 2 }, label: 'Curl off the second screen' },
        { at: 2, base: 'pnr', br: 'roller', who: 's2', from: 'ball', w: 10, trig: { obswitch: 2.4 }, label: 'Second screener slips' },
        { at: 2, base: 'offscreen', br: 'kick', who: ['corner', 's1'], from: 'shooter', w: 28, trig: { help: 1.4 }, label: 'Shooter moves it on' },
      ],
    },
    hammer: {
      name: 'Hammer', family: 'offscreen', tags: ['half', 'ato', 'three'],
      desc: 'A baseline drive from the wing while a big flare-screens the weak-side shooter into the corner for a skip pass.',
      roles: { ball: 'pnr', shooter: 'shooter', hammer: 'screen2', dunker: 'dunker', top: 'spacer' },
      primary: 'ball', pick: 'pnr', map: { handler: 'ball', shooter: 'shooter', screener: 'hammer' },
      align: { ball: WING_R, shooter: [10, 5], hammer: SHORT_L, dunker: DUNK_R, top: TOP },
      steps: [
        { d: 1.2, text: 'The wing drives baseline', ev: [['move', 'ball', 'drive']] },
        { d: 1.0, text: 'The hammer screen flares the shooter into the corner', ev: [['screen', 'hammer', 'shooter', 'off_ball']], pos: { shooter: CORNER_L } },
        { d: 0.7, text: 'The skip pass', ev: [['step']] },
      ],
      opts: [
        { at: 2, base: 'pnr', br: 'kick', who: 'shooter', from: 'ball', w: 40, zk: { c3: 1.5 }, trig: { help: 2, under: 1.2 }, label: 'Hammer corner three' },
        { at: 1, base: 'iso', br: 'self', who: 'ball', w: 30, zk: { rim: 1.5, paint: 1.3, ab3: 0.3 }, trig: { help: 0.6 }, label: 'Finish the baseline drive' },
        { at: 2, base: 'pnr', br: 'roller', who: 'dunker', from: 'ball', w: 12, trig: { help: 1.8 }, label: 'Dump-off' },
        { at: 2, base: 'pnr', br: 'kick', who: 'top', from: 'ball', w: 18, trig: { help: 1.3 }, label: 'Kick to the top' },
      ],
    },
    chicago: {
      name: 'Chicago', family: 'handoff', tags: ['half', 'ato'],
      desc: 'A pin-down for the wing flowing straight into a dribble hand-off from the big.',
      roles: { ball: 'handler', wing: 'scorer', hub: 'passer', corner: 'spacer', dunker: 'dunker' },
      primary: 'wing', pick: 'dho', map: { handler: 'wing', big: 'hub' },
      align: { ball: SLOT_L, wing: BLOCK_R, hub: [26, 30], corner: CORNER_L, dunker: DUNK_L },
      steps: [
        { d: 1.1, text: 'The guard passes to the big at the slot', ev: [['pass', 'ball', 'hub', 'chest']], pos: { ball: [20, 30] } },
        { d: 1.1, text: 'and pins down for the wing', ev: [['screen', 'ball', 'wing', 'off_ball']], pos: { ball: CORNER_R } },
        { d: 1.0, text: 'The wing comes off it into the hand-off', ev: [['handoff', 'hub', 'wing']] },
        { d: 0.8, text: 'Turn the corner or pull up', ev: [['move', 'wing', 'drive']] },
      ],
      opts: [
        { at: 3, base: 'handoff', br: 'receiver', who: 'wing', w: 58, zk: { ab3: 1.3 }, trig: { under: 1.3, drop: 1.2, switch: 1.1 }, label: 'Wing off the hand-off' },
        { at: 3, base: 'handoff', br: 'big', who: 'hub', from: 'wing', w: 12, trig: { hedge: 1.5, obswitch: 1.5 }, label: 'Big rolls' },
        { at: 3, base: 'handoff', br: 'kick', who: ['ball', 'corner'], from: 'wing', w: 22, trig: { help: 1.5 }, label: 'Kick to the pin-down screener' },
        { at: 2, base: 'cut', br: 'cutter', who: 'wing', from: 'hub', w: 8, trig: { top: 3, deny: 2 }, label: 'Backdoor off the hand-off' },
      ],
    },
    dho: {
      name: 'Dribble Hand-off', family: 'handoff', tags: ['half'],
      desc: 'The big dribbles at a guard and hands it off, screening his man.',
      roles: { ball: 'pnr', big: 'passer', left: 'spacer', right: 'spacer', dunker: 'dunker' },
      primary: 'ball', pick: 'dho', map: { handler: 'ball', big: 'big' },
      align: { ball: WING_L, big: SLOT_L, left: CORNER_L, right: WING_R, dunker: DUNK_R },
      steps: [
        { d: 1.1, text: 'The big gets it at the slot', ev: [['pass', 'ball', 'big', 'chest']] },
        { d: 1.1, text: 'and hands it back on the move', ev: [['handoff', 'big', 'ball']] },
        { d: 0.8, text: 'Attack off the hand-off', ev: [['move', 'ball', 'drive']] },
      ],
      opts: [
        { at: 2, base: 'handoff', br: 'receiver', who: 'ball', w: 66, trig: { drop: 1.3, switch: 1.2, hedge: 0.8 }, label: 'Attack off the hand-off' },
        { at: 2, base: 'handoff', br: 'big', who: 'big', from: 'ball', w: 10, trig: { hedge: 1.5, switch: 1.4 }, label: 'Big rolls' },
        { at: 2, base: 'handoff', br: 'kick', who: ['left', 'right'], from: 'ball', w: 24, trig: { help: 1.5 }, label: 'Kick out' },
      ],
    },
    iverson: {
      name: 'Iverson Cut', family: 'offscreen', tags: ['half'],
      desc: 'The wing runs over the top off both elbow screens to the other wing, then a ball screen or a drive.',
      roles: { ball: 'handler', wing: 'scorer', big1: 'screener', big2: 'screen2', corner: 'spacer' },
      primary: 'wing', pick: 'shooter', map: { handler: 'ball', shooter: 'wing', screener: 'big1' },
      align: { ball: SLOT_L, wing: WING_R, big1: ELBOW_L, big2: ELBOW_R, corner: CORNER_L },
      steps: [
        { d: 1.2, text: 'The wing runs off the right elbow', ev: [['screen', 'big2', 'wing', 'off_ball']] },
        { d: 1.1, text: 'and the left elbow to the wing', ev: [['screen', 'big1', 'wing', 'off_ball']], pos: { wing: WING_L } },
        { d: 1.0, text: 'The pass to the wing', ev: [['pass', 'ball', 'wing', 'chest']] },
        { d: 0.9, text: 'Attack or the ball screen', ev: [['move', 'wing', 'drive']] },
      ],
      opts: [
        { at: 2, base: 'offscreen', br: 'shooter', who: 'wing', from: 'ball', w: 38, trig: { under: 1.4, trail: 1 }, label: 'Catch and shoot on the wing' },
        { at: 3, base: 'iso', br: 'self', who: 'wing', w: 22, zk: { rim: 1.3 }, trig: { trail: 1.4 }, label: 'Catch and drive' },
        { at: 3, base: 'pnr', br: 'roller', who: 'big1', from: 'wing', w: 14, trig: { obswitch: 1.8, hedge: 1.3 }, label: 'Big rolls' },
        { at: 3, base: 'offscreen', br: 'kick', who: ['corner', 'ball'], from: 'wing', w: 26, trig: { help: 1.4 }, label: 'Kick out' },
      ],
    },
    // ---------------------------------------------------------- post
    postIso: {
      name: 'Low Post Isolation', family: 'post', tags: ['half'],
      desc: 'The post man seals on the block with the strong side cleared; kick out when the double comes.',
      roles: { feeder: 'handler', post: 'post', slot: 'spacer', wing: 'spacer', corner: 'spacer' },
      primary: 'post', pick: 'post', map: { handler: 'feeder', poster: 'post' },
      align: { feeder: WING_L, post: BLOCK_L, slot: SLOT_R, wing: WING_R, corner: CORNER_R },
      steps: [
        { d: 1.3, text: 'The post man seals on the block', ev: [['step']], pos: { post: BLOCK_L } },
        { d: 1.0, text: 'The entry pass', ev: [['pass', 'feeder', 'post', 'entry']] },
        { d: 1.4, text: 'He goes to work', ev: [['move', 'post', 'backdown']] },
      ],
      opts: [
        { at: 2, base: 'post', br: 'self', who: 'post', w: 66, trig: { double: 0.5, obswitch: 1.2 }, label: 'Post move' },
        { at: 2, base: 'post', br: 'kick', who: ['slot', 'wing', 'corner', 'feeder'], from: 'post', w: 34, trig: { double: 2.4 }, label: 'Kick out of the double' },
      ],
    },
    highLow: {
      name: 'High-Low', family: 'post', tags: ['half', 'zone'],
      desc: 'A big at the free-throw line feeds the other big sealing low.',
      roles: { ball: 'handler', high: 'passer', low: 'post', left: 'spacer', right: 'spacer' },
      primary: 'low', pick: 'post', map: { handler: 'ball', poster: 'low' },
      align: { ball: SLOT_L, high: NAIL, low: BLOCK_R, left: CORNER_L, right: WING_R },
      steps: [
        { d: 1.2, text: 'The ball goes to the high post', ev: [['pass', 'ball', 'high', 'chest']] },
        { d: 1.0, text: 'The low big seals his man', ev: [['step']], pos: { low: [6, 28] } },
        { d: 1.0, text: 'The high-low pass', ev: [['pass', 'high', 'low', 'lob']] },
      ],
      opts: [
        { at: 2, base: 'post', br: 'self', who: 'low', w: 50, zk: { rim: 1.4 }, trig: { zone: 1.3, double: 0.6 }, label: 'Seal and score' },
        { at: 1, base: 'post', br: 'self', who: 'high', w: 16, zk: { mid: 2.5, rim: 0.5 }, trig: { zone: 1.4 }, label: 'High post jumper' },
        { at: 2, base: 'post', br: 'kick', who: ['left', 'right', 'ball'], from: 'high', w: 34, trig: { double: 2, zone: 1.3 }, label: 'Kick out' },
      ],
    },
    duckIn: {
      name: 'Duck-In', family: 'post', tags: ['half', 'zone'],
      desc: 'A ball reversal while the post man ducks into the lane and seals.',
      roles: { ball: 'handler', post: 'post', wing: 'spacer', wing2: 'spacer', corner: 'spacer' },
      primary: 'post', pick: 'post', map: { handler: 'ball', poster: 'post' },
      align: { ball: SLOT_R, post: BLOCK_R, wing: WING_L, wing2: WING_R, corner: CORNER_L },
      steps: [
        { d: 1.1, text: 'Reverse the ball', ev: [['pass', 'ball', 'wing', 'swing']] },
        { d: 1.0, text: 'The post man ducks in and seals', ev: [['step']], pos: { post: [7, 22] } },
        { d: 1.0, text: 'The entry', ev: [['pass', 'wing', 'post', 'entry']] },
      ],
      opts: [
        { at: 2, base: 'post', br: 'self', who: 'post', w: 64, zk: { rim: 1.5, paint: 1.2 }, trig: { zone: 1.2, double: 0.5 }, label: 'Duck-in finish' },
        { at: 2, base: 'post', br: 'kick', who: ['ball', 'wing2', 'corner'], from: 'post', w: 36, trig: { double: 2.2 }, label: 'Kick out' },
      ],
    },
    elbowIso: {
      name: 'Elbow Isolation', family: 'iso', tags: ['half'],
      desc: 'A scorer catches at the elbow with room to face up.',
      roles: { scorer: 'scorer', ball: 'handler', left: 'spacer', right: 'spacer', dunker: 'dunker' },
      primary: 'scorer', pick: 'iso', map: { handler: 'scorer' },
      align: { scorer: [12, 18], ball: WING_L, left: CORNER_L, right: WING_R, dunker: DUNK_R },
      steps: [
        { d: 1.1, text: 'The scorer flashes to the elbow', ev: [['step']], pos: { scorer: ELBOW_L } },
        { d: 1.0, text: 'The catch at the elbow', ev: [['pass', 'ball', 'scorer', 'chest']] },
        { d: 1.4, text: 'Face up and go', ev: [['move', 'scorer', 'jab']] },
      ],
      opts: [
        { at: 2, base: 'iso', br: 'self', who: 'scorer', w: 78, zk: { mid: 1.6, paint: 1.2, ab3: 0.5 }, trig: { switch: 1.3, help: 0.8 }, label: 'Face-up jumper or drive' },
        { at: 2, base: 'iso', br: 'kick', who: ['left', 'right', 'ball'], from: 'scorer', w: 22, trig: { help: 1.8, double: 2 }, label: 'Kick out' },
      ],
    },
    // ---------------------------------------------------------- isolation
    isoTop: {
      name: 'Clear-Out at the Top', family: 'iso', tags: ['half', 'eog'],
      desc: 'Four spot up around the arc and the scorer goes one on one from the top.',
      roles: { ball: 'scorer', wl: 'spacer', wr: 'spacer', cl: 'spacer', cr: 'spacer' },
      primary: 'ball', pick: 'iso', map: { handler: 'ball' },
      align: { ball: TOP, wl: WING_L, wr: WING_R, cl: CORNER_L, cr: CORNER_R },
      steps: [
        { d: 1.4, text: 'Clear out: four spot up', ev: [['move', 'ball', 'size_up']], pos: { wl: WING_L, wr: WING_R, cl: CORNER_L, cr: CORNER_R } },
        { d: 1.4, text: 'Break him down', ev: [['move', 'ball', 'crossover']] },
      ],
      opts: [
        { at: 1, base: 'iso', br: 'self', who: 'ball', w: 80, trig: { switch: 1.4, help: 0.7 }, label: 'One on one' },
        { at: 1, base: 'iso', br: 'kick', who: ['wl', 'wr', 'cl', 'cr'], from: 'ball', w: 20, trig: { help: 1.8, double: 2 }, label: 'Kick out of the help' },
      ],
    },
    isoWing: {
      name: 'Wing Isolation', family: 'iso', tags: ['half'],
      desc: 'The scorer on the wing, everyone else on the weak side.',
      roles: { ball: 'scorer', slot: 'spacer', wing: 'spacer', corner: 'spacer', dunker: 'dunker' },
      primary: 'ball', pick: 'iso', map: { handler: 'ball' },
      align: { ball: WING_L, slot: SLOT_R, wing: WING_R, corner: CORNER_R, dunker: DUNK_R },
      steps: [
        { d: 1.3, text: 'Clear the strong side', ev: [['move', 'ball', 'size_up']] },
        { d: 1.4, text: 'Attack his man', ev: [['move', 'ball', 'hesi']] },
      ],
      opts: [
        { at: 1, base: 'iso', br: 'self', who: 'ball', w: 80, zk: { rim: 1.1, mid: 1.1 }, trig: { switch: 1.4, help: 0.7 }, label: 'One on one on the wing' },
        { at: 1, base: 'iso', br: 'kick', who: ['slot', 'wing', 'corner'], from: 'ball', w: 20, trig: { help: 1.8 }, label: 'Kick to the weak side' },
      ],
    },
    // ---------------------------------------------------------- cutting
    flex: {
      name: 'Flex', family: 'cut', tags: ['half'],
      desc: 'A baseline cut off a back screen, then the screener comes off a down screen.',
      roles: { ball: 'handler', cutter: 'cutter', back: 'screen2', down: 'screen2', wing: 'spacer' },
      primary: 'cutter', pick: 'cutter', map: { handler: 'ball', cutter: 'cutter', shooter: 'back', screener: 'down' },
      align: { ball: SLOT_L, cutter: SHORT_R, back: BLOCK_R, down: ELBOW_R, wing: WING_L },
      steps: [
        { d: 1.3, text: 'The flex cut off the back screen', ev: [['screen', 'back', 'cutter', 'off_ball']], pos: { cutter: [6, 18] } },
        { d: 1.2, text: 'The down screen for the back-screener', ev: [['screen', 'down', 'back', 'off_ball']], pos: { back: SLOT_R } },
        { d: 0.9, text: 'Hit the cutter or the man off the down screen', ev: [['step']] },
      ],
      opts: [
        { at: 1, base: 'cut', br: 'cutter', who: 'cutter', from: 'ball', w: 34, trig: { top: 1.3, trail: 1.3, zone: 0.5 }, label: 'Flex cut layup' },
        { at: 2, base: 'offscreen', br: 'shooter', who: 'back', from: 'ball', w: 40, zk: { mid: 1.5 }, trig: { under: 1.4 }, label: 'Jumper off the down screen' },
        { at: 2, base: 'offscreen', br: 'kick', who: ['wing', 'down'], from: 'ball', w: 26, trig: { help: 1.3 }, label: 'Swing it' },
      ],
    },
    ucla: {
      name: 'UCLA Cut', family: 'cut', tags: ['half', 'ato'],
      desc: 'The guard passes to the wing and cuts off the big\'s back screen at the high post.',
      roles: { ball: 'cutter', wing: 'handler', big: 'screener', corner: 'spacer', dunker: 'dunker' },
      primary: 'ball', pick: 'cutter', map: { handler: 'wing', cutter: 'ball', screener: 'big' },
      align: { ball: SLOT_L, wing: WING_L, big: ELBOW_L, corner: CORNER_R, dunker: DUNK_R },
      steps: [
        { d: 1.1, text: 'Pass to the wing', ev: [['pass', 'ball', 'wing', 'chest']] },
        { d: 1.1, text: 'The UCLA cut off the high-post back screen', ev: [['screen', 'big', 'ball', 'off_ball']], pos: { ball: [6, 20] } },
        { d: 1.1, text: 'The big pops up to screen for the wing', ev: [['screen', 'big', 'wing', 'ball']] },
      ],
      opts: [
        { at: 1, base: 'cut', br: 'cutter', who: 'ball', from: 'wing', w: 34, trig: { top: 1.4, deny: 1.5, zone: 0.4 }, label: 'UCLA cut layup' },
        { at: 2, base: 'pnr', br: 'handler', who: 'wing', w: 24, trig: { drop: 1.3, switch: 1.2 }, label: 'Wing off the ball screen' },
        { at: 2, base: 'pnr', br: 'roller', who: 'big', from: 'wing', w: 16, trig: { hedge: 1.5 }, label: 'Big rolls' },
        { at: 2, base: 'pnr', br: 'kick', who: ['corner', 'ball'], from: 'wing', w: 26, trig: { help: 1.4 }, label: 'Kick out' },
      ],
    },
    backdoor: {
      name: 'Chin Backdoor', family: 'cut', tags: ['half'],
      desc: 'A high-post entry; the denied wing cuts backdoor behind his defender.',
      roles: { ball: 'handler', high: 'passer', wing: 'cutter', corner: 'spacer', wing2: 'spacer' },
      primary: 'wing', pick: 'cutter', map: { handler: 'ball', cutter: 'wing', big: 'high' },
      align: { ball: SLOT_L, high: NAIL, wing: WING_L, corner: CORNER_R, wing2: WING_R },
      steps: [
        { d: 1.1, text: 'Entry to the high post', ev: [['pass', 'ball', 'high', 'chest']] },
        { d: 1.0, text: 'The denied wing goes backdoor', ev: [['step']], pos: { wing: [6, 20] } },
        { d: 0.8, text: 'The bounce pass', ev: [['step']] },
      ],
      opts: [
        { at: 2, base: 'cut', br: 'cutter', who: 'wing', from: 'high', w: 44, trig: { deny: 2.2, top: 2, zone: 0.4 }, label: 'Backdoor layup' },
        { at: 2, base: 'handoff', br: 'receiver', who: 'ball', from: 'high', w: 30, trig: { drop: 1.2 }, label: 'Hand-off back to the guard' },
        { at: 2, base: 'post', br: 'self', who: 'high', w: 26, zk: { mid: 2 }, trig: { help: 0.8 }, label: 'High post jumper' },
      ],
    },
    // ---------------------------------------------------------- motion / spot-up
    swing: {
      name: 'Motion Swing', family: 'spot', tags: ['half', 'zone'],
      desc: 'Swing-swing: the ball moves around the arc until a shooter is open.',
      roles: { ball: 'handler', a: 'spacer', b: 'spacer', c: 'spacer', d: 'dunker' },
      primary: 'ball', pick: 'handler', map: { handler: 'ball' },
      align: { ball: TOP, a: WING_L, b: WING_R, c: CORNER_L, d: DUNK_R },
      steps: [
        { d: 1.2, text: 'Swing it to the wing', ev: [['pass', 'ball', 'a', 'swing']] },
        { d: 1.2, text: 'and around', ev: [['pass', 'a', 'c', 'swing']] },
      ],
      opts: [
        { at: 1, base: 'spot', br: 'shooter', who: ['a', 'b', 'c'], from: 'ball', w: 76, trig: { zone: 1.4, help: 1.2 }, label: 'Open three off the swing' },
        { at: 1, base: 'spot', br: 'drive', who: ['a', 'b', 'c', 'ball'], w: 24, trig: { zone: 0.6 }, label: 'Attack the closeout' },
      ],
    },
    driveKick: {
      name: 'Drive and Kick', family: 'spot', tags: ['half'],
      desc: 'Attack the gap, draw the help, kick it to the open shooter.',
      roles: { ball: 'pnr', a: 'spacer', b: 'spacer', c: 'spacer', d: 'dunker' },
      primary: 'ball', pick: 'handler', map: { handler: 'ball' },
      align: { ball: TOP, a: CORNER_L, b: CORNER_R, c: WING_R, d: DUNK_R },
      steps: [
        { d: 1.2, text: 'Attack the gap', ev: [['move', 'ball', 'drive']] },
        { d: 0.8, text: 'Kick when the help comes', ev: [['step']] },
      ],
      opts: [
        { at: 1, base: 'spot', br: 'shooter', who: ['a', 'b', 'c'], from: 'ball', w: 64, trig: { help: 1.6, zone: 1.2 }, label: 'Kick to the open shooter' },
        { at: 1, base: 'spot', br: 'drive', who: 'ball', w: 36, trig: { help: 0.6, switch: 1.2 }, label: 'Finish at the rim' },
      ],
    },
    // ---------------------------------------------------------- zone offense
    zoneOverload: {
      name: 'Zone Overload', family: 'zone', tags: ['zone'],
      desc: 'Against a zone: a shooter in the corner, a man in the short corner, a flash to the high post.',
      roles: { ball: 'handler', corner: 'shooter', short: 'dunker', high: 'passer', weak: 'spacer' },
      primary: 'corner', pick: 'shooter', map: { handler: 'ball', shooter: 'corner', poster: 'short' },
      align: { ball: WING_L, corner: CORNER_L, short: SHORT_L, high: NAIL, weak: WING_R },
      steps: [
        { d: 1.2, text: 'Overload the strong side', ev: [['pass', 'ball', 'high', 'chest']] },
        { d: 1.1, text: 'Flash, skip, attack the gaps', ev: [['pass', 'high', 'ball', 'chest']] },
      ],
      opts: [
        { at: 1, base: 'spot', br: 'shooter', who: 'corner', from: 'ball', w: 30, zk: { c3: 1.6 }, trig: { zone: 1.3 }, label: 'Corner three' },
        { at: 1, base: 'spot', br: 'shooter', who: 'weak', from: 'high', w: 22, trig: { zone: 1.4 }, label: 'Skip to the weak side' },
        { at: 0, base: 'post', br: 'self', who: 'high', w: 16, zk: { mid: 2.4, rim: 0.4 }, trig: { zone: 1.3 }, label: 'High post jumper' },
        { at: 1, base: 'post', br: 'self', who: 'short', from: 'ball', w: 12, zk: { paint: 1.6, rim: 1.2 }, trig: { zone: 1.2 }, label: 'Short corner' },
        { at: 1, base: 'spot', br: 'drive', who: 'ball', w: 20, trig: { zone: 0.8 }, label: 'Attack the gap' },
      ],
    },
    zoneHigh: {
      name: 'High Post Attack', family: 'zone', tags: ['zone'],
      desc: 'Against a 2-3: get the ball to the free-throw line and play off it.',
      roles: { ball: 'handler', high: 'passer', low: 'post', left: 'spacer', right: 'spacer' },
      primary: 'high', pick: 'post', map: { handler: 'ball', poster: 'high' },
      align: { ball: TOP, high: [15, 25], low: DUNK_R, left: CORNER_L, right: WING_R },
      steps: [
        { d: 1.2, text: 'Flash to the free-throw line', ev: [['pass', 'ball', 'high', 'chest']] },
        { d: 1.0, text: 'Turn and read the bottom of the zone', ev: [['step']] },
      ],
      opts: [
        { at: 1, base: 'post', br: 'self', who: 'high', w: 30, zk: { mid: 2.4, paint: 1.2, rim: 0.4 }, trig: { zone: 1.3 }, label: 'Turn and shoot' },
        { at: 1, base: 'post', br: 'self', who: 'low', from: 'high', w: 24, zk: { rim: 1.5 }, trig: { zone: 1.3 }, label: 'High-low to the baseline' },
        { at: 1, base: 'post', br: 'kick', who: ['left', 'right'], from: 'high', w: 46, trig: { zone: 1.3 }, label: 'Kick to the corner' },
      ],
    },
    // ---------------------------------------------------------- inbound plays under the basket (BLOB)
    blobBox: {
      name: 'Box Stagger (BLOB)', family: 'blob', tags: ['blob'],
      desc: 'Box set under the basket: a stagger for the shooter to the corner, the big seals, a guard pops to safety.',
      roles: { inb: 'inbounder', shooter: 'shooter', big: 'dunker', s1: 'screen2', safety: 'handler' },
      primary: 'shooter', pick: 'shooter', map: { handler: 'safety', shooter: 'shooter', screener: 's1' },
      align: { inb: [-1.5, 17], shooter: BLOCK_R, big: BLOCK_L, s1: ELBOW_R, safety: ELBOW_L },
      steps: [
        { d: 1.2, text: 'Box: blocks and elbows', ev: [['step']], pos: { shooter: BLOCK_R, big: BLOCK_L, s1: ELBOW_R, safety: ELBOW_L } },
        { d: 1.2, text: 'The shooter comes off the stagger to the corner, the big seals, the safety pops out', ev: [['screen', 's1', 'shooter', 'off_ball']], pos: { shooter: CORNER_L, safety: TOP } },
      ],
      inbound: true,
      opts: [
        { at: 1, base: 'spot', br: 'shooter', who: 'shooter', from: 'inb', w: 20, zk: { c3: 2 }, trig: { under: 1.4, zone: 1.3 }, label: 'Corner three off the inbound' },
        { at: 1, base: 'cut', br: 'cutter', who: 'big', from: 'inb', w: 12, trig: { obswitch: 1.8, zone: 0.6 }, label: 'Big seals for the layup' },
        { at: 1, safety: true, who: 'safety', from: 'inb', w: 68, label: 'Safety to the top, run offense' },
      ],
    },
    blobStack: {
      name: 'Stack (BLOB)', family: 'blob', tags: ['blob'],
      desc: 'Four in a line at the ball-side block peel off: to the corner, to the rim, to the top.',
      roles: { inb: 'inbounder', first: 'shooter', second: 'cutter', third: 'dunker', last: 'handler' },
      primary: 'first', pick: 'shooter', map: { handler: 'last', shooter: 'first', cutter: 'second' },
      align: { inb: [-1.5, 17], first: [7, 18], second: [10, 18], third: [13, 18], last: [16, 18] },
      steps: [
        { d: 1.2, text: 'Stack at the block', ev: [['step']] },
        { d: 1.2, text: 'Peel: the first to the corner, the second to the rim, the last to the top', ev: [['step']], pos: { first: CORNER_L, second: [5, 24], third: BLOCK_R, last: TOP } },
      ],
      inbound: true,
      opts: [
        { at: 1, base: 'spot', br: 'shooter', who: 'first', from: 'inb', w: 18, zk: { c3: 2 }, trig: { zone: 1.3 }, label: 'Corner three' },
        { at: 1, base: 'cut', br: 'cutter', who: 'second', from: 'inb', w: 14, trig: { zone: 0.6, top: 1.3 }, label: 'Cut to the rim' },
        { at: 1, safety: true, who: 'last', from: 'inb', w: 68, label: 'Safety to the top, run offense' },
      ],
    },
    blobLob: {
      name: 'Back Screen Lob (BLOB)', family: 'blob', tags: ['blob', 'ato'],
      desc: 'A guard back-screens for the big, who goes up for the lob at the rim.',
      roles: { inb: 'inbounder', big: 'dunker', screen: 'screen2', corner: 'shooter', safety: 'handler' },
      primary: 'big', pick: 'cutter', map: { handler: 'safety', cutter: 'big', screener: 'screen' },
      align: { inb: [-1.5, 17], big: ELBOW_R, screen: BLOCK_R, corner: CORNER_L, safety: SLOT_L },
      steps: [
        { d: 1.1, text: 'The big sets up at the elbow', ev: [['step']] },
        { d: 1.1, text: 'The back screen and the lob', ev: [['screen', 'screen', 'big', 'off_ball']], pos: { big: [5, 26], safety: TOP } },
      ],
      inbound: true,
      opts: [
        { at: 1, base: 'cut', br: 'cutter', who: 'big', from: 'inb', w: 18, trig: { obswitch: 1.6, zone: 0.5 }, label: 'Lob to the big' },
        { at: 1, base: 'spot', br: 'shooter', who: 'corner', from: 'inb', w: 14, zk: { c3: 2 }, trig: { help: 1.4 }, label: 'Corner three' },
        { at: 1, safety: true, who: 'safety', from: 'inb', w: 68, label: 'Safety, run offense' },
      ],
    },
    // ---------------------------------------------------------- inbound plays from the sideline (SLOB)
    slobZipper: {
      name: 'Zipper (SLOB)', family: 'slob', tags: ['slob'],
      desc: 'A guard zippers up the lane off a screen to catch at the top and start the offense.',
      roles: { inb: 'inbounder', guard: 'handler', screen: 'screener', shooter: 'shooter', corner: 'spacer' },
      primary: 'guard', pick: 'handler', map: { handler: 'guard', screener: 'screen', shooter: 'shooter' },
      align: { inb: [28, -1.5], guard: BLOCK_L, screen: [14, 20], shooter: WING_R, corner: CORNER_R },
      steps: [
        { d: 1.2, text: 'The guard zippers up off the screen', ev: [['screen', 'screen', 'guard', 'off_ball']], pos: { guard: [30, 16] } },
        { d: 0.9, text: 'The catch at the top', ev: [['step']] },
      ],
      inbound: true,
      opts: [
        { at: 1, safety: true, who: 'guard', from: 'inb', w: 82, label: 'Catch and run offense' },
        { at: 1, base: 'offscreen', br: 'shooter', who: 'shooter', from: 'inb', w: 10, zk: { ab3: 1.4 }, trig: { under: 1.3 }, label: 'Quick three' },
        { at: 1, base: 'cut', br: 'cutter', who: 'screen', from: 'inb', w: 8, trig: { obswitch: 2 }, label: 'Screener slips to the rim' },
      ],
    },
    slobStack: {
      name: 'Stack (SLOB)', family: 'slob', tags: ['slob', 'ato'],
      desc: 'A stack at the elbow: one pops out to catch, one cuts to the rim.',
      roles: { inb: 'inbounder', pop: 'shooter', cut: 'cutter', big: 'screen2', safety: 'handler' },
      primary: 'pop', pick: 'shooter', map: { handler: 'safety', shooter: 'pop', cutter: 'cut' },
      align: { inb: [28, -1.5], pop: [19, 12], cut: [21, 13], big: ELBOW_R, safety: TOP },
      steps: [
        { d: 1.1, text: 'Stack at the elbow', ev: [['step']] },
        { d: 1.1, text: 'One pops to the wing, one cuts to the rim', ev: [['step']], pos: { pop: WING_L, cut: [6, 20], safety: [34, 20] } },
      ],
      inbound: true,
      opts: [
        { at: 1, base: 'spot', br: 'shooter', who: 'pop', from: 'inb', w: 13, trig: { under: 1.3 }, label: 'Pop three on the wing' },
        { at: 1, base: 'cut', br: 'cutter', who: 'cut', from: 'inb', w: 9, trig: { top: 1.5, deny: 1.5 }, label: 'Cut to the rim' },
        { at: 1, safety: true, who: 'safety', from: 'inb', w: 78, label: 'Safety, run offense' },
      ],
    },
    // ---------------------------------------------------------- end of game and after timeouts
    lastShotPnr: {
      name: 'Last Shot: High Pick and Roll', family: 'pnr', tags: ['eog'],
      desc: 'Run the clock down, then the best player uses a high screen for the last shot.',
      roles: { ball: 'scorer', screen: 'screener', left: 'spacer', right: 'spacer', dunker: 'dunker' },
      primary: 'ball', pick: 'iso', map: { handler: 'ball', screener: 'screen' },
      align: { ball: [33, 25], screen: ELBOW_R, left: CORNER_L, right: CORNER_R, dunker: DUNK_R },
      steps: [
        { d: 1.5, text: 'Hold it at the top as the clock runs', ev: [['move', 'ball', 'size_up']] },
        { d: 1.2, text: 'The late ball screen', ev: [['screen', 'screen', 'ball', 'ball']] },
        { d: 0.9, text: 'The last shot', ev: [['move', 'ball', 'drive']] },
      ],
      opts: [
        { at: 2, base: 'pnr', br: 'handler', who: 'ball', w: 70, trig: { switch: 1.3, blitz: 0.4 }, label: 'Star takes the last shot' },
        { at: 2, base: 'pnr', br: 'roller', who: 'screen', from: 'ball', w: 12, trig: { blitz: 2, hedge: 1.4 }, label: 'Roller when they trap' },
        { at: 2, base: 'pnr', br: 'kick', who: ['left', 'right'], from: 'ball', w: 18, trig: { blitz: 2, help: 1.5 }, label: 'Kick when they help' },
      ],
    },
    elevator: {
      name: 'Elevator Doors', family: 'offscreen', tags: ['need3', 'ato', 'three'],
      desc: 'The shooter runs up through two bigs, who close the doors behind him, for a three at the top.',
      roles: { ball: 'handler', shooter: 'shooter', door1: 'screen2', door2: 'screen2', corner: 'spacer' },
      primary: 'shooter', pick: 'shooter', map: { handler: 'ball', shooter: 'shooter', screener: 'door1' },
      align: { ball: WING_R, shooter: RIM, door1: [21, 22], door2: [21, 28], corner: CORNER_L },
      steps: [
        { d: 1.2, text: 'The shooter runs up the lane toward the doors', ev: [['step']], pos: { shooter: [15, 25] } },
        { d: 1.0, text: 'The doors close behind him', ev: [['screen', 'door1', 'shooter', 'off_ball']], pos: { shooter: TOP } },
        { d: 0.8, text: 'The pass to the top', ev: [['step']] },
      ],
      opts: [
        { at: 2, base: 'offscreen', br: 'shooter', who: 'shooter', from: 'ball', w: 80, zk: { ab3: 3, mid: 0.2, rim: 0.1 }, trig: { under: 1.2 }, label: 'Three at the top' },
        { at: 2, base: 'offscreen', br: 'kick', who: ['corner'], from: 'ball', w: 20, zk: { c3: 3 }, trig: { help: 1.4 }, label: 'Corner three' },
      ],
    },
  };
  // (keys as ids; the last step index is the end of the play)
  for (const id in PLAYS) { const p = PLAYS[id]; p.id = id; p.last = p.steps.length - 1; }
  Playbook.PLAYS = PLAYS;
  Playbook.get = (id) => PLAYS[id] || null;
  Playbook.FAMILY = {
    pnr: 'Pick and roll', horns: 'Horns', offscreen: 'Off-screen', handoff: 'Hand-off', post: 'Post', iso: 'Isolation',
    cut: 'Cutting', spot: 'Motion', zone: 'Zone offense', blob: 'Baseline inbound', slob: 'Sideline inbound',
  };

  // ---------------------------------------------------------------- defense
  // pick-and-roll coverages (within man-to-man schemes)
  Playbook.COVERAGES = {
    drop: { label: 'Drop', desc: 'The big sits back near the free-throw line to protect the rim; pull-up jumpers are open.' },
    show: { label: 'At the level', desc: 'The big shows at the level of the screen and gets back; a middle ground.' },
    hedge: { label: 'Hedge', desc: 'The big jumps out above the screen to stop the ball, then recovers; the roller gets free.' },
    blitz: { label: 'Blitz', desc: 'Two trap the ball handler; four on three behind it: the short roll and the kick-out.' },
    switch: { label: 'Switch', desc: 'The two defenders swap men; the mismatch is the risk.' },
    ice: { label: 'Ice', desc: 'A side pick and roll is forced to the baseline, away from the screen, into the big.' },
  };
  const ZONE_DEF = { zone23: 1, zone32: 1, zone131: 1, boxone: 1 };
  /** the pick-and-roll coverage a scheme plays (man schemes: from the team's playbook) */
  Playbook.coverageFor = function (def, pbDef) {
    if (def === 'switch') return 'switch';
    if (def === 'drop') return 'drop';
    if (def === 'blitz') return 'blitz';
    if (def === 'hedge') return 'hedge';
    if (ZONE_DEF[def]) return 'zone';
    return (pbDef && pbDef.pnr) || 'show';
  };
  /** the coverage that suits a team's bigs and perimeter defenders */
  function pickCoverage(roster, def) {
    if (def === 'switch' || def === 'drop' || def === 'blitz' || def === 'hedge') return def;
    const bigs = roster.filter((p) => posNOf(p) >= 4);
    const big = bigs.length ? U.maxBy(bigs, (p) => p.r.block + p.r.intD) : null;
    const perD = U.avg(roster, (p) => p.r.perD);
    if (big && big.r.block >= 78 && big.r.speed < 60) return 'drop';
    if (perD >= 70 && roster.every((p) => p.r.perD >= 55)) return 'switch';
    if (big && big.r.speed >= 66 && big.r.agility >= 64) return U.chance(0.5) ? 'hedge' : 'show';
    if (U.avg(roster, (p) => p.r.steal) >= 66) return 'blitz';
    return U.pick(['drop', 'show', 'show', 'ice']);
  }

  // ---------------------------------------------------------------- team playbooks
  // how much each offensive system likes each family (1 = neutral)
  const SYS_FAMILY = {
    balanced: { pnr: 1.2, horns: 1.1, offscreen: 1, handoff: 1, post: 0.9, iso: 0.9, cut: 0.9, spot: 1, zone: 1 },
    paceSpace: { pnr: 1.3, horns: 1, offscreen: 1.1, handoff: 1.1, post: 0.5, iso: 0.9, cut: 0.8, spot: 1.4, zone: 1 },
    pnrHeavy: { pnr: 1.8, horns: 1.3, offscreen: 0.7, handoff: 1.1, post: 0.6, iso: 0.8, cut: 0.6, spot: 0.9, zone: 1 },
    motion: { pnr: 0.8, horns: 1, offscreen: 1.5, handoff: 1.2, post: 0.9, iso: 0.5, cut: 1.5, spot: 1.3, zone: 1 },
    iso: { pnr: 1.1, horns: 0.8, offscreen: 0.6, handoff: 0.8, post: 1, iso: 2, cut: 0.5, spot: 0.8, zone: 1 },
    postUp: { pnr: 0.9, horns: 1, offscreen: 0.9, handoff: 0.9, post: 2, iso: 0.8, cut: 1.1, spot: 1, zone: 1 },
    princeton: { pnr: 0.6, horns: 1.1, offscreen: 1.2, handoff: 1.6, post: 1.1, iso: 0.4, cut: 2, spot: 1, zone: 1 },
    triangle: { pnr: 0.6, horns: 0.9, offscreen: 1.3, handoff: 1, post: 1.6, iso: 1.2, cut: 1.5, spot: 1, zone: 1 },
    runGun: { pnr: 1.4, horns: 1, offscreen: 0.9, handoff: 1.1, post: 0.5, iso: 0.9, cut: 0.9, spot: 1.4, zone: 1 },
    gritGrind: { pnr: 1.1, horns: 1.1, offscreen: 0.9, handoff: 1.1, post: 1.7, iso: 0.9, cut: 1, spot: 0.8, zone: 1 },
    dribbleDrive: { pnr: 1.1, horns: 0.8, offscreen: 0.6, handoff: 0.9, post: 0.5, iso: 1.5, cut: 1.3, spot: 1.5, zone: 1 },
    heliocentric: { pnr: 1.8, horns: 1.1, offscreen: 0.6, handoff: 0.9, post: 0.6, iso: 1.6, cut: 0.4, spot: 0.8, zone: 1 },
  };
  Playbook.SYS_FAMILY = SYS_FAMILY;
  /**
   * The best assignment of players to role profiles (the highest total fit): exact, over subsets of the players
   * (a few hundred steps for five). Returns { order: the player for each profile, total } or null.
   */
  const A_BEST = new Float64Array(1 << 12), A_FROM = new Int32Array(1 << 12);
  Playbook.assign = function (profiles, players, fitFn) {
    const n = players.length, m = profiles.length;
    if (n < m || n > 12) return null;
    const fit = fitFn || Playbook.fit;
    const F = profiles.map((pf) => players.map((x) => fit(x, pf)));
    const a = Playbook.assignF(F, n);
    return a ? { order: a.idx.map((i) => players[i]), total: a.total } : null;
  };
  /** the same on a fit table: F[role][player] (the player indices 0..n-1, an optional mask of players left out) */
  Playbook.assignF = function (F, n, skip) {
    const m = F.length;
    if (n > 12) return null;
    const size = 1 << n;
    const best = A_BEST, from = A_FROM;
    const excl = skip || 0;
    best.fill(-1, 0, size); from.fill(-1, 0, size);
    best[0] = 0;
    let top = -1, topMask = 0;
    for (let mask = 0; mask < size; mask++) {
      if (best[mask] < 0) continue;
      let k = 0;
      for (let x = mask; x; x &= x - 1) k++;
      if (k === m) { if (best[mask] > top) { top = best[mask]; topMask = mask; } continue; }
      const row = F[k];
      for (let i = 0; i < n; i++) {
        if ((mask | excl) & (1 << i)) continue;
        const nm = mask | (1 << i), v = best[mask] + row[i];
        if (v > best[nm]) { best[nm] = v; from[nm] = i; }
      }
    }
    if (top < 0) return null;
    const idx = new Array(m);
    let mask = topMask;
    for (let k = m - 1; k >= 0; k--) { const i = from[mask]; idx[k] = i; mask &= ~(1 << i); }
    return { idx, total: top };
  };
  /** the best filling of a play's roles by the given players (ratings only, no usage): { roles, fit } */
  Playbook.bestFit = function (play, five, fitFn) {
    const roles = Object.keys(play.roles);
    const a = Playbook.assign(roles.map((r) => play.roles[r]), five, fitFn);
    if (!a) return null;
    const out = {};
    roles.forEach((r, i) => { out[r] = a.order[i]; });
    return { roles: out, fit: a.total / roles.length };
  };
  /** the five a team usually starts (its rotation's starters, else its best five by position) */
  function startersOf(S, tid) {
    const t = S.teams[tid];
    const roster = PBC.League.roster(S, tid).filter((p) => !(PBC.Player.isInjured && PBC.Player.isInjured(p)));
    let five = t.rot && t.rot.starters ? t.rot.starters.map((id) => S.players[id]).filter((p) => p && p.tid === tid) : [];
    if (five.length < 5) five = five.concat(U.sortBy(roster.filter((p) => !five.includes(p)), (p) => p.ovr, true)).slice(0, 5);
    return { five, roster };
  }
  /**
   * A playbook for a team: the half-court plays its system likes and its players fit (12 to 14), two or three plays
   * each for inbounds under the basket and from the sideline, the end-of-game plays, and its defensive coverage.
   */
  Playbook.build = function (S, tid) {
    const team = S.teams[tid];
    const { five, roster } = startersOf(S, tid);
    const sys = SYS_FAMILY[(team.strat && team.strat.off) || 'balanced'] || SYS_FAMILY.balanced;
    const score = {};
    for (const id in PLAYS) {
      const p = PLAYS[id];
      const bf = five.length >= 5 ? Playbook.bestFit(p, five) : null;
      const fit = bf ? bf.fit : 60;
      score[id] = (sys[p.family] || 1) * Math.pow(Math.max(30, fit) / 65, 3) * U.range(0.85, 1.15);
    }
    const pickTop = (ids, n) => U.sortBy(ids, (id) => score[id], true).slice(0, n);
    const all = Object.keys(PLAYS);
    const half = all.filter((id) => PLAYS[id].tags.includes('half'));
    const chosen = new Set(pickTop(half, 12));
    // at least one of each core family the half court needs
    for (const fam of ['pnr', 'iso', 'spot']) if (![...chosen].some((id) => PLAYS[id].family === fam)) chosen.add(pickTop(half.filter((id) => PLAYS[id].family === fam), 1)[0]);
    if (Math.max(...roster.map((p) => p.r.post)) >= 72 && ![...chosen].some((id) => PLAYS[id].family === 'post')) chosen.add('postIso');
    for (const id of pickTop(all.filter((id) => PLAYS[id].tags.includes('zone') && !chosen.has(id)), 2)) chosen.add(id);
    for (const id of pickTop(all.filter((id) => PLAYS[id].family === 'blob'), 2)) chosen.add(id);
    for (const id of pickTop(all.filter((id) => PLAYS[id].family === 'slob'), 2)) chosen.add(id);
    for (const id of ['lastShotPnr', 'isoTop', 'elevator', 'drag']) chosen.add(id);
    const def = (team.strat && team.strat.def) || 'man';
    return {
      v: Playbook.VERSION, season: S.season, sys: (team.strat && team.strat.off) || 'balanced', auto: true,
      off: [...chosen].filter(Boolean),
      def: { pnr: pickCoverage(roster.slice(0, 8), def) },
    };
  };
  /** the team's playbook, built when missing or out of date (older saves, a new season, a new system) */
  Playbook.ensure = function (S, tid) {
    const team = S.teams[tid];
    if (!team) return null;
    const pb = team.playbook;
    const sys = (team.strat && team.strat.off) || 'balanced';
    if (!pb || pb.v !== Playbook.VERSION || !Array.isArray(pb.off) || !pb.off.length || (pb.auto && (pb.season !== S.season || pb.sys !== sys))) {
      const keep = pb && !pb.auto ? pb : null;
      team.playbook = keep && keep.v === Playbook.VERSION ? keep : Playbook.build(S, tid);
    }
    team.playbook.off = team.playbook.off.filter((id) => PLAYS[id]);
    return team.playbook;
  };
  /** the plays of a playbook, resolved */
  Playbook.plays = function (pb) { return pb && Array.isArray(pb.off) ? pb.off.map((id) => PLAYS[id]).filter(Boolean) : []; };
})();
