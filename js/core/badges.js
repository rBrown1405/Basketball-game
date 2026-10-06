/* Pro BBALL Coach: badges (PBC.Badges). No DOM.
 *
 * What a player does better than his ratings alone say (the user: "I want to add badge systems"), in tiers: Bronze, Silver,
 * Gold and Hall of Fame, earned from his ratings (and a few from his personality), the way basketball games hand them out
 * (NBA 2K: tiers by attribute thresholds). They follow his ratings as they change: progression, aging, the editor.
 *
 * Each badge does something in the engine (js/core/sim.js: a shot's make odds in its spot, a turnover, a steal, a block, a
 * rebound, his confidence, his legs) and several show on the live court (js/match: a deep range shooter's spots, a quicker
 * first step, more broken ankles, tighter on-ball defense, a quicker trigger on the catch). How much they count is the Badge
 * Impact slider in League Settings (0 off, 50 as tuned, 100 twice as much). The shooting and finishing boosts are centered on
 * the league's own badges (Badges.leagueMean), so the league keeps its shooting numbers and the badges share them out. */
(function () {
  'use strict';
  const PBC = (window.PBC = window.PBC || {});

  const TIERS = [null, { key: 'bronze', label: 'Bronze', color: '#c8834a' }, { key: 'silver', label: 'Silver', color: '#c5ccd6' }, { key: 'gold', label: 'Gold', color: '#f2c14e' }, { key: 'hof', label: 'Hall of Fame', color: '#b58cff' }];
  const CATS = ['Shooting', 'Finishing', 'Playmaking', 'Defense', 'Rebounding', 'Mental'];
  const R = (p, k, d) => (p && p.r && p.r[k] != null ? +p.r[k] : d == null ? 50 : d);
  const T = (p, k) => (p && p.pers && p.pers[k] != null ? +p.pers[k] : 50);
  const sty = (p) => (PBC.Style && PBC.Style.of ? PBC.Style.of(p) : '');
  // v: the badge's skill (a 25-99 composite), at: its Bronze, Silver, Gold and Hall of Fame thresholds; gate: what it needs
  const LIST = [
    // shooting
    { key: 'deadeye', label: 'Deadeye', cat: 'Shooting', icon: '🎯', desc: 'A hand in the face matters less: contested jumpers lose less.', v: p => Math.max(R(p, 'three'), R(p, 'mid')) * 0.7 + R(p, 'shotIQ') * 0.3, at: [76, 82, 88, 93] },
    { key: 'deepRange', label: 'Limitless Range', cat: 'Shooting', icon: '🌌', desc: 'Shoots threes from 27 to 32 feet as if they were at the line, and takes them.', v: p => R(p, 'three') + (sty(p) === 'deepRange' ? 3 : 0), at: [84, 89, 94, 98], gate: p => R(p, 'handle') >= 58 || sty(p) === 'deepRange', gateText: 'needs a 58 handle or the Deep Range Shooter style' },
    { key: 'catchShoot', label: 'Catch & Shoot', cat: 'Shooting', icon: '🏹', desc: 'Lets it fly the moment the ball arrives, and knocks it down.', v: p => R(p, 'three') * 0.75 + R(p, 'shotIQ') * 0.25, at: [75, 82, 88, 93] },
    { key: 'pullUp', label: 'Pull-Up Artist', cat: 'Shooting', icon: '🌀', desc: 'Pull-ups and step-backs off the dribble go in more.', v: p => (R(p, 'mid') + R(p, 'three')) / 2 * 0.6 + R(p, 'handle') * 0.4, at: [74, 81, 86, 91] },
    { key: 'midMaestro', label: 'Mid-Range Maestro', cat: 'Shooting', icon: '📐', desc: 'Lives in the mid-range: jumpers inside the arc go in more.', v: p => R(p, 'mid') * 0.85 + R(p, 'shotIQ') * 0.15, at: [74, 80, 85, 89] },
    { key: 'clutchShooter', label: 'Clutch Shooter', cat: 'Shooting', icon: '⏱️', desc: 'Better shooter in the last minutes of a close game.', v: p => R(p, 'clutch') * 0.7 + Math.max(R(p, 'three'), R(p, 'mid')) * 0.3, at: [71, 75, 78, 83] },
    { key: 'freeThrowAce', label: 'Free Throw Ace', cat: 'Shooting', icon: '🎳', desc: 'Free throws go in more, and the pressure ones too.', v: p => R(p, 'ft'), at: [82, 89, 93, 97] },
    // finishing
    { key: 'posterizer', label: 'Posterizer', cat: 'Finishing', icon: '💥', desc: 'Rises up in traffic and dunks through the contest.', v: p => R(p, 'dunk') * 0.6 + R(p, 'vert') * 0.4, at: [74, 79, 87, 91] },
    { key: 'acrobat', label: 'Acrobat', cat: 'Finishing', icon: '🤸', desc: 'Finishes around the defense: contested and reverse layups go in more.', v: p => R(p, 'layup') * 0.6 + R(p, 'agility') * 0.25 + R(p, 'handle') * 0.15, at: [76, 81, 86, 90] },
    { key: 'physicalFinisher', label: 'Physical Finisher', cat: 'Finishing', icon: '🦍', desc: 'Finishes through contact: more whistles at the rim and more and-ones.', v: p => R(p, 'layup') * 0.35 + R(p, 'strength') * 0.35 + R(p, 'drawFoul') * 0.3, at: [71, 75, 79, 82] },
    { key: 'floatGame', label: 'Float Game', cat: 'Finishing', icon: '🪶', desc: 'Floaters and runners go in more.', v: p => R(p, 'close') * 0.4 + R(p, 'mid') * 0.3 + R(p, 'layup') * 0.3, at: [71, 76, 81, 85] },
    { key: 'postPowerhouse', label: 'Post Powerhouse', cat: 'Finishing', icon: '🏋️', desc: 'Works the block: post moves, hooks and post fades go in more.', v: p => R(p, 'post') * 0.7 + R(p, 'strength') * 0.3, at: [66, 73, 82, 90] },
    { key: 'putbackBoss', label: 'Putback Boss', cat: 'Finishing', icon: '🔁', desc: 'Putbacks and tip-ins go in more.', v: p => R(p, 'oreb') * 0.5 + R(p, 'close') * 0.3 + R(p, 'vert') * 0.2, at: [68, 75, 80, 85] },
    // playmaking
    { key: 'floorGeneral', label: 'Table Setter', cat: 'Playmaking', icon: '🧭', desc: 'Teammates get better looks with this player on the floor.', v: p => R(p, 'vision') * 0.5 + R(p, 'pass') * 0.3 + R(p, 'shotIQ') * 0.2, at: [73, 78, 83, 86] },
    { key: 'dimer', label: 'Dimer', cat: 'Playmaking', icon: '💎', desc: 'Passes that put shooters in rhythm: they make more of those shots.', v: p => R(p, 'pass') * 0.6 + R(p, 'vision') * 0.4, at: [73, 78, 84, 87] },
    { key: 'needleThreader', label: 'Needle Threader', cat: 'Playmaking', icon: '🪡', desc: 'Threads it through tight windows: fewer bad passes.', v: p => R(p, 'pass') * 0.7 + R(p, 'vision') * 0.3, at: [73, 79, 84, 87] },
    { key: 'ankleBreaker', label: 'Ankle Breaker', cat: 'Playmaking', icon: '🦵', desc: 'Dribble moves that break defenders down: more blow-bys and more defenders on the floor.', v: p => R(p, 'handle') * 0.7 + R(p, 'agility') * 0.3, at: [77, 83, 90, 94] },
    { key: 'quickFirstStep', label: 'Quick First Step', cat: 'Playmaking', icon: '⚡', desc: 'Explodes past the defender off the dribble.', v: p => R(p, 'speed') * 0.5 + R(p, 'agility') * 0.3 + R(p, 'handle') * 0.2, at: [78, 84, 89, 92] },
    { key: 'unpluckable', label: 'Unpluckable', cat: 'Playmaking', icon: '🔐', desc: 'Hard to strip: fewer lost balls off the dribble.', v: p => R(p, 'handle') * 0.6 + R(p, 'strength') * 0.4, at: [68, 73, 77, 81] },
    // defense
    { key: 'clamps', label: 'Clamps', cat: 'Defense', icon: '🗜️', desc: 'Locks up the ball handler: fewer open looks and blow-bys.', v: p => R(p, 'perD') * 0.75 + R(p, 'agility') * 0.25, at: [73, 80, 85, 90] },
    { key: 'challenger', label: 'Challenger', cat: 'Defense', icon: '✋', desc: 'Contests every jumper: closeouts that cost the shooter.', v: p => R(p, 'perD') * 0.5 + R(p, 'helpD') * 0.3 + R(p, 'vert') * 0.2, at: [71, 77, 81, 85] },
    { key: 'interceptor', label: 'Interceptor', cat: 'Defense', icon: '🦅', desc: 'Jumps the passing lanes: more steals off passes.', v: p => R(p, 'steal') * 0.7 + R(p, 'helpD') * 0.3, at: [67, 72, 79, 85] },
    { key: 'rimProtector', label: 'Rim Protector', cat: 'Defense', icon: '🧱', desc: 'Blocks and alters shots at the rim.', v: p => R(p, 'block') * 0.7 + R(p, 'intD') * 0.3, at: [67, 75, 83, 88] },
    { key: 'pickpocket', label: 'Pickpocket', cat: 'Defense', icon: '🫳', desc: 'Pokes the ball loose from ball handlers.', v: p => R(p, 'steal') * 0.6 + R(p, 'perD') * 0.4, at: [68, 75, 84, 88] },
    // rebounding
    { key: 'reboundChaser', label: 'Rebound Chaser', cat: 'Rebounding', icon: '🧲', desc: 'Tracks down more rebounds at both ends.', v: p => Math.max(R(p, 'oreb'), R(p, 'dreb')) * 0.7 + R(p, 'hustle') * 0.3, at: [73, 79, 84, 88] },
    { key: 'boxoutBeast', label: 'Box-Out Beast', cat: 'Rebounding', icon: '📦', desc: 'Keeps the other team off the offensive glass.', v: p => R(p, 'dreb') * 0.6 + R(p, 'strength') * 0.4, at: [73, 79, 86, 92] },
    // mental
    { key: 'heatCheck', label: 'Heat Check', cat: 'Mental', icon: '🔥', desc: 'Gets hot fast and stays hot: confidence climbs quicker, and the tough shot goes up when it is falling.', v: p => Math.max(R(p, 'three'), R(p, 'mid')) * 0.55 + T(p, 'ego') * 0.45, at: [71, 77, 83, 88] },
    { key: 'iceVeins', label: 'Ice Veins', cat: 'Mental', icon: '🧊', desc: 'Misses do not rattle this player: confidence falls slower.', v: p => R(p, 'clutch') * 0.6 + T(p, 'work') * 0.4, at: [68, 73, 77, 81] },
    { key: 'tirelessMotor', label: 'Tireless Motor', cat: 'Mental', icon: '🔋', desc: 'Tires slower and plays hard all night.', v: p => R(p, 'stamina') * 0.7 + R(p, 'hustle') * 0.3, at: [76, 79, 82, 85] },
  ];
  const KEYS = LIST.map(b => b.key);
  const BY_KEY = {};
  LIST.forEach(b => { BY_KEY[b.key] = b; });

  /** the tier (0 none, 1 Bronze, 2 Silver, 3 Gold, 4 Hall of Fame) of one badge for a player */
  function tierOf(p, key) {
    const b = BY_KEY[key];
    if (!b || !p || !p.r || (b.gate && !b.gate(p))) return 0;
    const v = b.v(p);
    let t = 0;
    for (let i = 0; i < 4; i++) if (v >= b.at[i] - 1e-9) t = i + 1;
    return t;
  }
  /** all his badges: { key: tier } (only the ones he has), cached on the player until his ratings change */
  function of(p) {
    if (!p || !p.r) return {};
    const sig = sigOf(p);
    const c = p._bdg;
    if (c && c.sig === sig) return c.b;
    const b = {};
    for (const k of KEYS) { const t = tierOf(p, k); if (t) b[k] = t; }
    try { Object.defineProperty(p, '_bdg', { value: { sig, b }, configurable: true, enumerable: false, writable: true }); } catch (e) { /* frozen: no cache */ }
    return b;
  }
  // (what the badges depend on: his ratings, his ego and work ethic, his style)
  function sigOf(p) {
    let s = '';
    for (const k in p.r) s += p.r[k] + ',';
    return s + T(p, 'ego') + ',' + T(p, 'work') + ',' + (p.styleCustom ? p.style : '') + ',' + p.pos;
  }
  /** the badges as a list, best first: [{ key, tier, label, icon, cat, desc, tierLabel, color }] */
  function list(p) {
    const b = of(p);
    return Object.keys(b).map(k => Object.assign({ tier: b[k], tierLabel: TIERS[b[k]].label, color: TIERS[b[k]].color }, BY_KEY[k]))
      .sort((x, y) => y.tier - x.tier || CATS.indexOf(x.cat) - CATS.indexOf(y.cat));
  }
  /** a count of his badges by tier: [bronze, silver, gold, hof] */
  function counts(p) {
    const b = of(p), out = [0, 0, 0, 0];
    for (const k in b) out[b[k] - 1]++;
    return out;
  }
  /** what a tier would take next (for the player page): the skill value and the next threshold, or null at the top */
  function progress(p, key) {
    const b = BY_KEY[key];
    if (!b || !p || !p.r) return null;
    const v = b.v(p), t = tierOf(p, key);
    return { v: Math.round(v), next: t < 4 ? b.at[t] : null, tier: t, gated: !!(b.gate && !b.gate(p)) };
  }

  // what each badge does per tier in the engine (js/core/sim.js), always on his tier less the league's mean tier of it
  // (Badges.leagueMean), times the Badge Impact slider: the league's average player gets nothing from his badges, so the league
  // keeps its numbers and the badges share them out
  const K = {
    deadeye: 0.025,         // a contested or tight jumper (logit on the make odds)
    catchShoot: 0.025,      // a jumper on the catch
    pullUp: 0.025,          // a pull-up, step-back or fadeaway
    midMaestro: 0.025,      // a mid-range jumper
    clutchShooter: 0.04,    // a jumper in the clutch
    freeThrowAce: 0.008,    // a free throw (on the odds themselves)
    posterizer: 0.04,       // a contested dunk
    acrobat: 0.03,          // a contested layup
    physicalFinisher: 0.05, // shooting fouls drawn at the rim and in the paint (x 1 + K), and the and-one
    floatGame: 0.035,       // a floater
    postPowerhouse: 0.03,   // a hook or a shot out of the post
    putbackBoss: 0.04,      // a putback or a tip
    floorGeneral: 0.008,    // his teammates' looks: open more often (the contest odds, per tier)
    dimer: 0.02,            // a jumper off his pass
    needleThreader: 0.03,   // his team's turnovers while he has the ball (x e^-K)
    unpluckable: 0.025,     // the same, for the strips
    ankleBreaker: 1.2,      // his edge off the dribble (rating points)
    quickFirstStep: 1.5,    // his edge off the dribble (rating points)
    clamps: 1.5,            // the edge against him off the dribble (rating points)
    challenger: 0.025,      // a jumper he contests (logit off)
    rimProtector: 0.05,     // a shot he contests at the rim or in the paint: blocks x 1 + K, and 0.4 K off the make odds
    interceptor: 0.04,      // his share of the steals off bad passes (x 1 + K)
    pickpocket: 0.04,       // his share of the strips (x 1 + K)
    defHands: 0.008,        // (interceptor and pickpocket: the other team's turnovers, x e^K, for the five on the floor)
    reboundChaser: 0.05,    // his share of the rebounds (x 1 + K)
    boxoutBeast: 0.02,      // the other team's offensive rebounds (logit off, for the five on the floor)
    heatCheck: 0.1,         // a good play lifts his confidence more (x 1 + K, his tier, not centered)
    iceVeins: 0.09,         // a bad one drops it less (x 1 - K)
    tirelessMotor: 0.03,    // he tires slower (x 1 - K)
  };
  // who does what the badge acts on, for the league's mean tier: his minutes (his place in his team's rotation) times how much of
  // that thing he does
  const MIN_W = [32, 32, 31, 30, 29, 22, 18, 14, 10, 6, 2, 1];
  const vol = (p) => Math.pow(Math.max(R(p, 'three'), R(p, 'mid'), R(p, 'layup'), R(p, 'post')) / 70, 3);
  const WEIGHT = {
    deadeye: vol, clutchShooter: vol,
    catchShoot: p => Math.pow(R(p, 'three') / 65, 4),
    pullUp: p => vol(p) * Math.pow(R(p, 'handle') / 65, 2),
    midMaestro: p => vol(p) * Math.pow(R(p, 'mid') / 65, 2),
    freeThrowAce: p => vol(p) * Math.pow(R(p, 'drawFoul') / 60, 1.6),
    posterizer: p => Math.pow(R(p, 'dunk') / 60, 4),
    acrobat: p => Math.pow(R(p, 'layup') / 60, 2),
    physicalFinisher: p => Math.pow(R(p, 'layup') / 60, 2) * Math.pow(R(p, 'drawFoul') / 60, 1.6),
    floatGame: p => Math.pow((R(p, 'close') + R(p, 'mid')) / 120, 2) * (p.pos === 'PF' || p.pos === 'C' ? 0.3 : 1),
    postPowerhouse: p => Math.pow(R(p, 'post') / 60, 3),
    putbackBoss: p => Math.pow(R(p, 'oreb') / 60, 2),
    dimer: p => Math.pow(R(p, 'pass') / 65, 3),
    needleThreader: p => Math.pow((R(p, 'handle') + R(p, 'pass')) / 130, 4),
    unpluckable: p => Math.pow((R(p, 'handle') + R(p, 'pass')) / 130, 4),
    ankleBreaker: p => vol(p) * Math.pow(R(p, 'handle') / 65, 2),
    quickFirstStep: p => vol(p) * Math.pow(R(p, 'handle') / 65, 2),
    rimProtector: p => Math.pow((R(p, 'block') * 0.6 + R(p, 'intD') * 0.4) / 60, 3),
  };
  const CENTER = ['deadeye', 'catchShoot', 'pullUp', 'midMaestro', 'clutchShooter', 'freeThrowAce', 'posterizer', 'acrobat', 'physicalFinisher', 'floatGame', 'postPowerhouse', 'putbackBoss', 'floorGeneral', 'dimer', 'needleThreader', 'unpluckable', 'ankleBreaker', 'quickFirstStep', 'clamps', 'challenger', 'rimProtector', 'interceptor', 'pickpocket', 'boxoutBeast', 'tirelessMotor'];
  /** the league's mean tier of each badge, over the players on a team, weighted by their minutes and by how much of what the
   *  badge acts on they do (WEIGHT): what the engine takes off every player's tier. Kept until the day changes */
  function leagueMean(S) {
    const day = S ? (S.season || 0) * 1000 + (S.day || 0) : 0;
    if (S && S._bdgMean && S._bdgMean.day === day) return S._bdgMean.m;
    const m = {}, ws = {};
    for (const k of CENTER) { m[k] = 0; ws[k] = 0; }
    const teams = {};
    for (const p of S && S.players ? Object.values(S.players) : []) {
      if (!p || p.tid == null || p.tid < 0 || !p.r) continue;
      (teams[p.tid] || (teams[p.tid] = [])).push(p);
    }
    for (const tid in teams) {
      const ros = teams[tid].sort((a, b) => (b.ovr || 0) - (a.ovr || 0));
      ros.forEach((p, i) => {
        const mw = MIN_W[i] || 0;
        if (!mw) return;
        const b = of(p);
        for (const k of CENTER) {
          const w = mw * (WEIGHT[k] ? WEIGHT[k](p) : 1);
          m[k] += w * (b[k] || 0); ws[k] += w;
        }
      });
    }
    for (const k of CENTER) m[k] = ws[k] ? m[k] / ws[k] : 0;
    if (S) Object.defineProperty(S, '_bdgMean', { value: { day, m }, configurable: true, enumerable: false, writable: true });
    return m;
  }

  /** what the live court reads from his badges (through the player look): the tiers of the ones it acts on */
  function court(p) {
    const b = of(p);
    return { bdg: b, deepRange: b.deepRange || 0, catchShoot: b.catchShoot || 0, quickStep: b.quickFirstStep || 0, ankles: b.ankleBreaker || 0, clamps: b.clamps || 0, posterizer: b.posterizer || 0, postPower: b.postPowerhouse || 0, heatCheck: b.heatCheck || 0 };
  }

  PBC.Badges = { TIERS, CATS, LIST, KEYS, BY_KEY, K, tierOf, of, list, counts, progress, leagueMean, court };
})();
