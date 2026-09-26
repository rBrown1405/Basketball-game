/* Pro BBALL Coach — gameplay sliders & league behaviour settings (PBC.Sliders). No DOM.
 *
 * Every slider runs 0..100 and 50 is the calibrated default: at 50 the engine behaves exactly as before sliders
 * existed. Values live on the save as a flat object (created lazily, so old saves simply get the defaults):
 *   S.sliders = { v: 1, preset: 'default' | 'simulation' | 'arcade' | 'highScoring' | 'grind' | 'chaos' | 'custom',
 *                 pace: 50, transition: 50, ..., tradeRequests: true }
 * Game sliders are read by Sim.createGame through Sliders.simMods(S) and cached on the game (g.sl).
 * League behaviour settings (group 'league') are read by Sliders.league(S) from season / offseason / trade code. */
(function () {
  'use strict';
  const PBC = (window.PBC = window.PBC || {});

  const GROUPS = [
    { key: 'pace', label: 'Pace & Flow', icon: '⏱️', desc: 'How fast games are played.' },
    { key: 'shooting', label: 'Shooting', icon: '🎯', desc: 'Shot selection and how often shots go in.' },
    { key: 'defense', label: 'Ball Security & Defense', icon: '🛡️', desc: 'Turnovers, steals, blocks, contests and fouls.' },
    { key: 'rebounding', label: 'Rebounding', icon: '🙌', desc: 'Battle on the glass.' },
    { key: 'players', label: 'Players', icon: '🏃', desc: 'Fatigue, injuries, stars and clutch play.' },
    { key: 'game', label: 'Game', icon: '🏟️', desc: 'Home court, upsets and how hard teams go in the playoffs.' },
    { key: 'user', label: 'User Team Difficulty', icon: '🎮', desc: 'Handicaps that only apply to your team (50 = fair).' },
    { key: 'league', label: 'League Behaviour', icon: '🏛️', desc: 'How players and front offices react to the league. (Injury frequency and severity are under Players.)' },
  ];

  // map: [kind, lo, hi]
  //   mult  geometric multiplier: 0 → lo, 50 → 1, 100 → hi
  //   mult0 like mult, but 0 turns the effect off (→ 0)
  //   add   additive offset:      0 → lo, 50 → 0, 100 → hi
  //   lin   linear multiplier:    0 → lo, 50 → 1, 100 → hi
  //   lin0  linear multiplier:    0 → 0,  50 → 1, 100 → hi
  // fmt: how the effect is described next to the slider ('x' multiplier, 'fg' logit on a base make %, 'pct' additive %)
  const DEFS = [
    // Pace & Flow
    { key: 'pace', group: 'pace', label: 'Pace', map: ['mult', 0.84, 1.18], fmt: 'poss', lo: 'Grind it out', hi: 'Track meet',
      desc: 'Possessions per game. Faster games mean more shots and more points for both teams.' },
    { key: 'transition', group: 'pace', label: 'Fast Breaks', map: ['mult', 0.35, 2.2], fmt: 'x', lo: 'Rare', hi: 'Constant',
      desc: 'How often teams push after rebounds and steals instead of setting up the half-court offense.' },
    // Shooting
    { key: 'threeRate', group: 'shooting', label: '3PT Attempt Rate', map: ['mult', 0.4, 2.6], fmt: 'x', lo: 'Old school', hi: 'Bombs away',
      desc: 'How often teams hunt three-pointers instead of mid-range and inside shots.' },
    { key: 'threePct', group: 'shooting', label: '3PT Shooting %', map: ['add', -0.4, 0.4], fmt: 'fg', base: 0.36,
      desc: 'Make percentage on three-point shots.' },
    { key: 'midPct', group: 'shooting', label: 'Mid-Range %', map: ['add', -0.4, 0.4], fmt: 'fg', base: 0.41,
      desc: 'Make percentage on jumpers inside the arc.' },
    { key: 'insidePct', group: 'shooting', label: 'Inside / Rim %', map: ['add', -0.4, 0.4], fmt: 'fg', base: 0.59,
      desc: 'Make percentage on layups, dunks, floaters and hooks.' },
    { key: 'dunkRate', group: 'shooting', label: 'Dunk Frequency', map: ['mult', 0.35, 2], fmt: 'x', lo: 'Below the rim', hi: 'Posterized',
      desc: 'How often players at the rim throw it down instead of laying it in.' },
    { key: 'ftPct', group: 'shooting', label: 'Free Throw %', map: ['add', -0.14, 0.1], fmt: 'pct',
      desc: 'Free throw make percentage.' },
    { key: 'shootingFouls', group: 'shooting', label: 'Shooting Fouls', map: ['mult', 0.45, 2], fmt: 'x', lo: 'Let them play', hi: 'Whistle happy',
      desc: 'How often shooters get fouled: controls free throw attempts and and-ones.' },
    // Ball Security & Defense
    { key: 'turnovers', group: 'defense', label: 'Turnovers', map: ['mult', 0.55, 1.7], fmt: 'x', lo: 'Sure-handed', hi: 'Sloppy',
      desc: 'How often possessions end in bad passes, lost balls, travels and offensive fouls.' },
    { key: 'steals', group: 'defense', label: 'Steals', map: ['mult', 0.45, 1.8], fmt: 'x', lo: 'Few', hi: 'Pickpockets',
      desc: 'How many turnovers are live-ball steals (and a few more turnovers from ball pressure).' },
    { key: 'blocks', group: 'defense', label: 'Blocks', map: ['mult', 0.35, 2.2], fmt: 'x', lo: 'Rare', hi: 'Swat city',
      desc: 'How often shots get blocked.' },
    { key: 'defense', group: 'defense', label: 'Defensive Intensity', map: ['add', -0.22, 0.22], fmt: 'contest', lo: 'Matador', hi: 'Lockdown',
      desc: 'How tightly shots are contested. Higher means fewer open looks.' },
    { key: 'fouls', group: 'defense', label: 'Personal Fouls', map: ['mult', 0.4, 2], fmt: 'x', lo: 'Few', hi: 'Physical',
      desc: 'Reach-ins, loose-ball fouls and hand-checks away from the shot (bonus free throws, foul trouble).' },
    // Rebounding
    { key: 'oreb', group: 'rebounding', label: 'Offensive Rebounding', map: ['add', -0.7, 0.7], fmt: 'fg', base: 0.24, lo: 'One and done', hi: 'Second chances',
      desc: 'Share of missed shots grabbed by the offense.' },
    // Players
    { key: 'fatigue', group: 'players', label: 'Fatigue Rate', map: ['mult', 0.3, 2.6], fmt: 'x', lo: 'Iron lungs', hi: 'Gassed',
      desc: 'How fast players tire on the floor. Tired players shoot worse and need more rest.' },
    { key: 'injuries', group: 'players', label: 'Injury Frequency', map: ['mult0', 0.25, 3], fmt: 'x0', lo: 'Off', hi: 'Brutal',
      desc: 'How often players get hurt during games. 0 turns injuries off.' },
    { key: 'injurySeverity', group: 'players', label: 'Injury Severity', map: ['mult', 0.35, 2.2], fmt: 'x', lo: 'Quick recovery', hi: 'Long layoffs',
      desc: 'How long injured players stay out.' },
    { key: 'starUsage', group: 'players', label: 'Star Usage', map: ['mult', 0.35, 2.2], fmt: 'x', lo: 'Balanced', hi: 'Hero ball',
      desc: 'How much the best scorers and go-to players dominate the shots.' },
    { key: 'clutch', group: 'players', label: 'Clutch Factor', map: ['mult0', 0.3, 3], fmt: 'x0', lo: 'Off', hi: 'Legends',
      desc: 'How much the Clutch rating matters in close games late.' },
    // Game
    { key: 'homeCourt', group: 'game', label: 'Home Court Advantage', map: ['lin0', 0, 3], fmt: 'x0', lo: 'Neutral', hi: 'Fortress',
      desc: 'Shooting, whistle and free throw edge for the home team.' },
    { key: 'upsets', group: 'game', label: 'Upsets & Variance', map: ['lin0', 0, 2.5], fmt: 'x0', lo: 'Chalk', hi: 'Anything goes',
      desc: 'Game-to-game form swings, rare "can\'t miss" nights for underdogs and off nights for favorites. 0 = the better team plays to its level every night.' },
    { key: 'playoffIntensity', group: 'game', label: 'Playoff Intensity', map: ['lin0', 0, 2], fmt: 'x0', lo: 'Like the regular season', hi: 'War',
      desc: 'How much harder teams go in the play-in and playoffs: tighter rotations, stars play more, slower pace, tougher defense. Grows every round and in elimination games.' },
    // User team
    { key: 'userShooting', group: 'user', label: 'Your Team: Shooting', map: ['add', -0.35, 0.35], fmt: 'fg', base: 0.47,
      desc: 'Make percentage for your team only. Higher makes the game easier.' },
    { key: 'userDefense', group: 'user', label: 'Your Team: Defense', map: ['add', -0.35, 0.35], fmt: 'fgNeg', base: 0.47,
      desc: 'Lowers (or raises) the opponent\'s make percentage when your team defends. Higher makes the game easier.' },
    { key: 'userBallSecurity', group: 'user', label: 'Your Team: Ball Security', map: ['mult', 1.6, 0.6], fmt: 'x', lo: 'Butterfingers', hi: 'Glue hands',
      desc: 'Turnover rate for your team only. Higher means fewer turnovers.' },
    // League behaviour
    { key: 'progression', group: 'league', label: 'Player Progression', map: ['mult', 0.4, 2.2], fmt: 'x', lo: 'Slow', hi: 'Fast',
      desc: 'How fast young players grow toward their potential each offseason.' },
    { key: 'rookieDev', group: 'league', label: 'Rookie Development', map: ['mult', 0.5, 2], fmt: 'x', lo: 'Raw', hi: 'NBA-ready',
      desc: 'Extra growth (or less) for players in their first three pro seasons, on top of Player Progression.' },
    { key: 'aging', group: 'league', label: 'Aging & Decline', map: ['mult', 0.4, 2.2], fmt: 'x', lo: 'Ageless', hi: 'Cliff dive',
      desc: 'How fast veterans lose their ratings after their prime.' },
    { key: 'morale', group: 'league', label: 'Morale Sensitivity', map: ['mult', 0.3, 2.5], fmt: 'x', lo: 'Thick skin', hi: 'Drama',
      desc: 'How strongly players react to minutes, winning and losing.' },
    { key: 'tradeRequests', group: 'league', label: 'Trade Requests', type: 'toggle', def: true,
      desc: 'Players who stay unhappy for weeks can publicly ask to be traded. Unhappy stars on AI teams become easier to pry loose.' },
    { key: 'tradeRequestFreq', group: 'league', label: 'Trade Request Frequency', map: ['mult', 0.3, 3], fmt: 'x', lo: 'Rare', hi: 'Constant',
      desc: 'How quickly unhappy players go public.' },
    { key: 'contractDemands', group: 'league', label: 'Contract Demands', map: ['lin', 0.75, 1.35], fmt: 'x', lo: 'Bargains', hi: 'Greedy',
      desc: 'Asking price of free agents and players re-signing.' },
    { key: 'loyalty', group: 'league', label: 'Loyalty & Hometown Discounts', map: ['lin0', 0, 2.5], fmt: 'x0', lo: 'Mercenaries', hi: 'Lifers',
      desc: 'How much players value staying with their team, and the discount happy players give to re-sign.' },
    { key: 'aiTrades', group: 'league', label: 'AI-to-AI Trades', map: ['lin0', 0, 3], fmt: 'x0', lo: 'None', hi: 'Frenzy',
      desc: 'How often computer teams trade with each other (in season and during the offseason).' },
    { key: 'tradeDifficulty', group: 'league', label: 'Trade Difficulty', map: ['add', -0.12, 0.15], fmt: 'margin', lo: 'Pushovers', hi: 'Sharks',
      desc: 'How much extra value AI teams demand in trades with you (on top of the career difficulty).' },
  ];
  const BY_KEY = {};
  DEFS.forEach(d => { if (d.def == null) d.def = 50; BY_KEY[d.key] = d; });
  const KEYS = DEFS.map(d => d.key);
  const GAME_KEYS = DEFS.filter(d => d.group !== 'league').map(d => d.key);
  const LEAGUE_KEYS = DEFS.filter(d => d.group === 'league').map(d => d.key);

  // Presets touch the gameplay sliders only (league behaviour stays). The user-team handles are left alone except by 'default'.
  const PRESETS = {
    default: { label: 'Default', icon: '⚖️', desc: 'The calibrated engine: modern pro averages.', vals: {} },
    simulation: {
      label: 'Simulation', icon: '📺', desc: 'NBA-like realism: grinding fatigue, real injuries, a bigger home edge and playoff games that feel different.',
      vals: { fatigue: 60, injuries: 58, injurySeverity: 55, homeCourt: 58, playoffIntensity: 62, starUsage: 55, transition: 46, clutch: 55, upsets: 55 },
    },
    arcade: {
      label: 'Arcade', icon: '🕹️', desc: 'More threes, more dunks, fewer whistles and fresh legs all game.',
      vals: { pace: 64, transition: 72, threeRate: 70, threePct: 62, insidePct: 60, dunkRate: 82, shootingFouls: 32, fouls: 28, blocks: 62, fatigue: 25, injuries: 15, clutch: 70, turnovers: 42 },
    },
    highScoring: {
      label: 'High Scoring', icon: '🔥', desc: 'Fast pace, hot shooting and soft defense. Expect 130-point nights.',
      vals: { pace: 68, transition: 62, threePct: 64, midPct: 62, insidePct: 60, ftPct: 60, defense: 32, turnovers: 40, shootingFouls: 56, blocks: 42 },
    },
    grind: {
      label: 'Defensive Grind', icon: '🧱', desc: 'Slow, physical and ugly. Every bucket is earned.',
      vals: { pace: 30, transition: 30, threePct: 40, midPct: 42, insidePct: 42, defense: 74, blocks: 64, steals: 60, fouls: 62, shootingFouls: 56, oreb: 56, turnovers: 56 },
    },
    chaos: {
      label: 'Chaos', icon: '🌪️', desc: 'High variance: hot streaks, cold nights, turnovers, injuries and upsets everywhere.',
      vals: { upsets: 100, pace: 62, transition: 70, turnovers: 68, steals: 70, blocks: 64, injuries: 70, injurySeverity: 60, clutch: 90, homeCourt: 70, starUsage: 65, fouls: 60 },
    },
  };
  const PRESET_KEYS = Object.keys(PRESETS);

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  /** Numeric effect of a slider value (see the map kinds above). */
  function mapVal(def, v) {
    if (!def || !def.map) return 1;
    v = clamp(+v, 0, 100);
    if (!(v === v)) v = 50;
    const kind = def.map[0], lo = def.map[1], hi = def.map[2];
    const t = (v - 50) / 50;
    switch (kind) {
      case 'mult': return t >= 0 ? Math.pow(hi, t) : Math.pow(lo, -t);
      case 'mult0': return v <= 0 ? 0 : t >= 0 ? Math.pow(hi, t) : Math.pow(lo, -t);
      case 'add': return t >= 0 ? hi * t : lo * -t;
      case 'lin': return t >= 0 ? 1 + (hi - 1) * t : 1 + (1 - lo) * t;
      case 'lin0': return t >= 0 ? 1 + (hi - 1) * t : 1 + t;
      default: return 1;
    }
  }

  function defaults() {
    const o = { v: 1, preset: 'default' };
    for (const d of DEFS) o[d.key] = d.def;
    return o;
  }

  /** The save's settings, filled with defaults for anything missing (safe for old saves). */
  function get(S) {
    if (!S) return defaults();
    let s = S.sliders;
    if (!s || typeof s !== 'object') s = S.sliders = defaults();
    for (const d of DEFS) {
      if (d.type === 'toggle') { if (typeof s[d.key] !== 'boolean') s[d.key] = d.def; continue; }
      const v = +s[d.key];
      s[d.key] = v === v && s[d.key] !== null && s[d.key] !== '' ? clamp(Math.round(v), 0, 100) : d.def;
    }
    if (!s.preset) s.preset = 'custom';
    if (!s.v) s.v = 1;
    return s;
  }

  function value(S, key) { return get(S)[key]; }

  /** Which preset the current gameplay values match ('custom' when none). */
  function detectPreset(s) {
    for (const k of PRESET_KEYS) {
      const vals = PRESETS[k].vals;
      const userToo = k === 'default';
      let ok = true;
      for (const key of GAME_KEYS) {
        if (!userToo && BY_KEY[key].group === 'user') continue;
        const want = vals[key] != null ? vals[key] : 50;
        if (s[key] !== want) { ok = false; break; }
      }
      if (ok) return k;
    }
    return 'custom';
  }

  function set(S, key, v) {
    const s = get(S);
    const d = BY_KEY[key];
    if (!d) return s;
    if (d.type === 'toggle') s[key] = !!v;
    else s[key] = clamp(Math.round(+v || 0), 0, 100);
    if (d.group !== 'league') s.preset = detectPreset(s);
    return s;
  }

  function applyPreset(S, key) {
    const p = PRESETS[key];
    const s = get(S);
    if (!p) return s;
    for (const k of GAME_KEYS) {
      if (key !== 'default' && BY_KEY[k].group === 'user') continue;
      s[k] = p.vals[k] != null ? p.vals[k] : 50;
    }
    s.preset = detectPreset(s);
    return s;
  }

  /** Reset everything ('all'), only the gameplay sliders ('game') or only league behaviour ('league'). */
  function reset(S, which) {
    const s = get(S);
    for (const d of DEFS) {
      const isLeague = d.group === 'league';
      if (which === 'game' && isLeague) continue;
      if (which === 'league' && !isLeague) continue;
      s[d.key] = d.def;
    }
    s.preset = detectPreset(s);
    return s;
  }

  const IDENTITY = {
    pace: 1, trans: 1, three: 1, dunk: 1, l3: 0, lMid: 0, lIn: 0, ft: 0, sfoul: 1,
    to: 1, stl: 1, blk: 1, contest: 0, nsfoul: 1, oreb: 0,
    fatigue: 1, inj: 1, injSev: 1, usage: 1, clutch: 1, home: 1, upset: 1, po: 1,
    uShoot: 0, uDef: 0, uTo: 1,
  };

  /** Multipliers/offsets for the game engine (cached by Sim.createGame on g.sl). All identity at the defaults. */
  function simMods(S) {
    const s = get(S);
    const m = k => mapVal(BY_KEY[k], s[k]);
    return {
      pace: m('pace'), trans: m('transition'), three: m('threeRate'), dunk: m('dunkRate'),
      l3: m('threePct'), lMid: m('midPct'), lIn: m('insidePct'), ft: m('ftPct'), sfoul: m('shootingFouls'),
      to: m('turnovers'), stl: m('steals'), blk: m('blocks'), contest: m('defense'), nsfoul: m('fouls'), oreb: m('oreb'),
      fatigue: m('fatigue'), inj: m('injuries'), injSev: m('injurySeverity'), usage: m('starUsage'), clutch: m('clutch'),
      home: m('homeCourt'), upset: m('upsets'), po: m('playoffIntensity'),
      uShoot: m('userShooting'), uDef: m('userDefense'), uTo: m('userBallSecurity'),
    };
  }

  /** League behaviour settings as numbers (and the trade-request toggle). */
  function league(S) {
    const s = get(S);
    const m = k => mapVal(BY_KEY[k], s[k]);
    return {
      progression: m('progression'), rookieDev: m('rookieDev'), aging: m('aging'), morale: m('morale'),
      tradeRequests: s.tradeRequests !== false, tradeRequestFreq: m('tradeRequestFreq'),
      contractDemands: m('contractDemands'), loyalty: m('loyalty'), aiTrades: m('aiTrades'),
      tradeDifficulty: m('tradeDifficulty'), injuries: m('injuries'), injurySeverity: m('injurySeverity'),
    };
  }

  const sig = x => 1 / (1 + Math.exp(-x));
  const logit = p => Math.log(p / (1 - p));
  const sgn = x => (x > 0 ? '+' : x < 0 ? '-' : '');
  /** Short readable effect for a slider value, e.g. "×1.40", "+4.8% FG", "Off", "Default". */
  function describe(key, v) {
    const d = BY_KEY[key];
    if (!d) return '';
    if (d.type === 'toggle') return v ? 'On' : 'Off';
    if (+v === 50) return 'Default';
    const x = mapVal(d, v);
    switch (d.fmt) {
      case 'x0': if (x === 0) return 'Off'; // falls through
      case 'x': return '×' + x.toFixed(2);
      case 'poss': return `${sgn(x - 1)}${Math.abs(Math.round((x - 1) * 100))}% possessions`;
      case 'fg': { const b = d.base || 0.45; const dd = (sig(logit(b) + x) - b) * 100; return `${sgn(dd)}${Math.abs(dd).toFixed(1)}%`; }
      case 'fgNeg': { const b = d.base || 0.45; const dd = (sig(logit(b) - x) - b) * 100; return `${sgn(dd)}${Math.abs(dd).toFixed(1)}% opp`; }
      case 'pct': return `${sgn(x)}${Math.abs(x * 100).toFixed(1)}%`;
      case 'contest': return x > 0 ? `${Math.round(x * 300)}% fewer open looks` : `${Math.round(-x * 300)}% more open looks`;
      case 'margin': return `${sgn(x)}${Math.abs(Math.round(x * 100))}% asking value`;
      default: return String(v);
    }
  }

  PBC.Sliders = {
    GROUPS, DEFS, BY_KEY, KEYS, GAME_KEYS, LEAGUE_KEYS, PRESETS, PRESET_KEYS, IDENTITY,
    mapVal, defaults, get, value, set, applyPreset, reset, detectPreset, simMods, league, describe,
  };
})();
