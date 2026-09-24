/* Pro BBALL Coach — static game configuration: leagues, teams, ratings, positions, strategies. */
(function () {
  'use strict';
  const PBC = (window.PBC = window.PBC || {});

  // ---------------------------------------------------------------------------
  // Ratings (27 visible ratings, 25–99)
  // ---------------------------------------------------------------------------
  const RATINGS = [
    { key: 'close', label: 'Close Shot', short: 'CLS', group: 'Scoring' },
    { key: 'layup', label: 'Driving Layup', short: 'LAY', group: 'Scoring' },
    { key: 'dunk', label: 'Dunk', short: 'DNK', group: 'Scoring' },
    { key: 'post', label: 'Post Moves', short: 'PST', group: 'Scoring' },
    { key: 'mid', label: 'Mid-Range', short: 'MID', group: 'Scoring' },
    { key: 'three', label: 'Three-Point', short: '3PT', group: 'Scoring' },
    { key: 'ft', label: 'Free Throw', short: 'FT', group: 'Scoring' },
    { key: 'drawFoul', label: 'Draw Foul', short: 'DRF', group: 'Scoring' },
    { key: 'shotIQ', label: 'Shot IQ', short: 'SIQ', group: 'Scoring' },
    { key: 'handle', label: 'Ball Handle', short: 'HND', group: 'Playmaking' },
    { key: 'pass', label: 'Pass Accuracy', short: 'PAS', group: 'Playmaking' },
    { key: 'vision', label: 'Court Vision', short: 'VIS', group: 'Playmaking' },
    { key: 'intD', label: 'Interior Defense', short: 'IDF', group: 'Defense' },
    { key: 'perD', label: 'Perimeter Defense', short: 'PDF', group: 'Defense' },
    { key: 'steal', label: 'Steal', short: 'STL', group: 'Defense' },
    { key: 'block', label: 'Block', short: 'BLK', group: 'Defense' },
    { key: 'helpD', label: 'Help Defense IQ', short: 'HLP', group: 'Defense' },
    { key: 'oreb', label: 'Offensive Rebound', short: 'ORB', group: 'Rebounding' },
    { key: 'dreb', label: 'Defensive Rebound', short: 'DRB', group: 'Rebounding' },
    { key: 'speed', label: 'Speed', short: 'SPD', group: 'Athleticism' },
    { key: 'agility', label: 'Agility', short: 'AGI', group: 'Athleticism' },
    { key: 'strength', label: 'Strength', short: 'STR', group: 'Athleticism' },
    { key: 'vert', label: 'Vertical', short: 'VRT', group: 'Athleticism' },
    { key: 'stamina', label: 'Stamina', short: 'STA', group: 'Athleticism' },
    { key: 'hustle', label: 'Hustle', short: 'HUS', group: 'Intangibles' },
    { key: 'clutch', label: 'Clutch', short: 'CLU', group: 'Intangibles' },
    { key: 'durability', label: 'Durability', short: 'DUR', group: 'Intangibles' },
  ];
  const RATING_KEYS = RATINGS.map(r => r.key);
  const RATING_GROUPS = ['Scoring', 'Playmaking', 'Defense', 'Rebounding', 'Athleticism', 'Intangibles'];
  const PHYSICAL = { speed: 1, agility: 1, strength: 1, vert: 1, stamina: 1 };

  const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'];
  const POS_NUM = { PG: 1, SG: 2, SF: 3, PF: 4, C: 5 };
  const POS_NAME = { PG: 'Point Guard', SG: 'Shooting Guard', SF: 'Small Forward', PF: 'Power Forward', C: 'Center' };

  // Base ratings of an average rotation player (talent 70) at each position.
  const POS_BASE = {
    PG: { close: 55, layup: 72, dunk: 40, post: 32, mid: 68, three: 72, ft: 80, drawFoul: 62, shotIQ: 70, handle: 80, pass: 76, vision: 76, intD: 38, perD: 68, steal: 66, block: 28, helpD: 60, oreb: 30, dreb: 44, speed: 82, agility: 82, strength: 45, vert: 65, stamina: 78, hustle: 68, clutch: 66, durability: 72 },
    SG: { close: 58, layup: 72, dunk: 52, post: 38, mid: 70, three: 74, ft: 79, drawFoul: 62, shotIQ: 68, handle: 70, pass: 64, vision: 62, intD: 42, perD: 68, steal: 62, block: 34, helpD: 60, oreb: 36, dreb: 48, speed: 78, agility: 76, strength: 52, vert: 70, stamina: 76, hustle: 66, clutch: 64, durability: 72 },
    SF: { close: 62, layup: 70, dunk: 62, post: 48, mid: 68, three: 70, ft: 76, drawFoul: 62, shotIQ: 66, handle: 62, pass: 60, vision: 58, intD: 55, perD: 68, steal: 58, block: 45, helpD: 64, oreb: 45, dreb: 58, speed: 72, agility: 70, strength: 62, vert: 70, stamina: 74, hustle: 68, clutch: 62, durability: 72 },
    PF: { close: 70, layup: 64, dunk: 70, post: 62, mid: 64, three: 62, ft: 72, drawFoul: 64, shotIQ: 64, handle: 50, pass: 55, vision: 54, intD: 68, perD: 58, steal: 50, block: 60, helpD: 66, oreb: 62, dreb: 70, speed: 64, agility: 60, strength: 74, vert: 68, stamina: 72, hustle: 70, clutch: 60, durability: 72 },
    C: { close: 75, layup: 58, dunk: 76, post: 66, mid: 56, three: 45, ft: 68, drawFoul: 66, shotIQ: 64, handle: 40, pass: 52, vision: 52, intD: 76, perD: 45, steal: 45, block: 72, helpD: 68, oreb: 72, dreb: 78, speed: 55, agility: 48, strength: 80, vert: 66, stamina: 70, hustle: 70, clutch: 58, durability: 70 },
  };

  // Archetypes: rating deltas on top of the position base.
  const ARCHETYPES = {
    PG: {
      'Floor General': { pass: 8, vision: 10, shotIQ: 5, handle: 4, three: -2, layup: -4, dunk: -8, speed: -2 },
      'Scoring Guard': { three: 6, mid: 7, drawFoul: 6, pass: -6, vision: -6, layup: 3, clutch: 4 },
      'Slasher': { layup: 8, dunk: 14, speed: 4, agility: 3, vert: 10, three: -8, mid: -4, drawFoul: 8 },
      'Two-Way Guard': { perD: 10, steal: 10, helpD: 6, strength: 6, three: -2, vision: -4, pass: -3 },
    },
    SG: {
      'Sharpshooter': { three: 10, mid: 6, ft: 8, shotIQ: 6, layup: -4, dunk: -10, perD: -4, vert: -6 },
      'Slasher': { layup: 8, dunk: 12, vert: 10, speed: 4, drawFoul: 8, three: -8 },
      '3&D Wing': { three: 5, perD: 10, steal: 6, helpD: 6, handle: -6, pass: -4, mid: -3 },
      'Shot Creator': { mid: 9, three: 4, handle: 9, drawFoul: 5, shotIQ: 4, perD: -6, helpD: -5, clutch: 4 },
    },
    SF: {
      '3&D Wing': { three: 6, perD: 10, steal: 6, helpD: 6, handle: -6, post: -6 },
      'Athletic Wing': { dunk: 12, layup: 8, vert: 12, speed: 5, oreb: 6, three: -6, shotIQ: -4 },
      'Point Forward': { pass: 12, vision: 14, handle: 12, shotIQ: 5, three: -3, block: -4 },
      'Scoring Wing': { mid: 8, three: 6, layup: 4, drawFoul: 6, perD: -5, helpD: -4, clutch: 3 },
    },
    PF: {
      'Stretch Four': { three: 14, mid: 8, ft: 6, post: -6, oreb: -8, block: -6, intD: -4, strength: -5 },
      'Athletic Four': { dunk: 10, vert: 12, oreb: 8, speed: 5, block: 4, three: -10, mid: -4 },
      'Post Scorer': { post: 14, close: 8, strength: 6, drawFoul: 6, three: -12, speed: -5 },
      'Glue Defender': { intD: 8, perD: 8, helpD: 10, block: 5, hustle: 10, steal: 4, post: -6, mid: -5, three: -4 },
    },
    C: {
      'Rim Protector': { block: 12, intD: 8, helpD: 6, dreb: 5, post: -8, mid: -8, three: -14, ft: -8 },
      'Post Scorer': { post: 14, close: 8, strength: 5, drawFoul: 5, block: -6, speed: -4, three: -10 },
      'Stretch Big': { three: 22, mid: 14, ft: 10, post: -4, block: -6, oreb: -8, strength: -6, intD: -5 },
      'Rim Runner': { dunk: 12, vert: 14, oreb: 8, speed: 6, block: 4, post: -8, mid: -10, three: -15, ft: -10 },
      'Playmaking Big': { pass: 14, vision: 16, handle: 8, post: 5, shotIQ: 6, block: -5, vert: -6 },
    },
  };

  // OVR weights by position (normalized in player.js)
  const OVR_W = {
    PG: { close: 2, layup: 4, dunk: 1, post: 0.5, mid: 4, three: 6, ft: 2, drawFoul: 2, shotIQ: 4, handle: 6, pass: 6, vision: 6, intD: 0.5, perD: 4, steal: 2, block: 0.5, helpD: 2, oreb: 0.5, dreb: 1, speed: 3, agility: 3, strength: 1, vert: 1, stamina: 1, hustle: 1, clutch: 1, durability: 0 },
    SG: { close: 2, layup: 4, dunk: 2, post: 0.5, mid: 5, three: 7, ft: 2, drawFoul: 2, shotIQ: 4, handle: 4, pass: 3, vision: 3, intD: 1, perD: 5, steal: 2, block: 1, helpD: 2, oreb: 1, dreb: 1.5, speed: 3, agility: 3, strength: 1, vert: 2, stamina: 1, hustle: 1, clutch: 1, durability: 0 },
    SF: { close: 3, layup: 4, dunk: 3, post: 1.5, mid: 4, three: 6, ft: 2, drawFoul: 2, shotIQ: 3, handle: 3, pass: 3, vision: 3, intD: 2.5, perD: 5, steal: 2, block: 1.5, helpD: 3, oreb: 1.5, dreb: 2.5, speed: 2.5, agility: 2.5, strength: 2, vert: 2, stamina: 1, hustle: 1, clutch: 1, durability: 0 },
    PF: { close: 5, layup: 3, dunk: 3, post: 3, mid: 3, three: 4, ft: 1.5, drawFoul: 2, shotIQ: 3, handle: 1.5, pass: 2, vision: 2, intD: 5, perD: 3, steal: 1, block: 3.5, helpD: 4, oreb: 3, dreb: 4.5, speed: 2, agility: 2, strength: 3, vert: 2, stamina: 1, hustle: 1.5, clutch: 1, durability: 0 },
    C: { close: 6, layup: 2, dunk: 4, post: 4, mid: 2, three: 2, ft: 1, drawFoul: 2, shotIQ: 3, handle: 0.5, pass: 2, vision: 2, intD: 7, perD: 2, steal: 1, block: 6, helpD: 4, oreb: 4, dreb: 6, speed: 1.5, agility: 1.5, strength: 4, vert: 2, stamina: 1, hustle: 1.5, clutch: 1, durability: 0 },
  };

  // ---------------------------------------------------------------------------
  // Teams (fictional nicknames in real markets)
  // ---------------------------------------------------------------------------
  // market: 1 (small) .. 5 (huge)
  const MEN_TEAMS = [
    // East — Atlantic
    { abbr: 'BOS', city: 'Boston', name: 'Colonials', conf: 0, div: 0, market: 4, colors: ['#0b6e4f', '#f2c14e', '#ffffff'], wood: 'medium' },
    { abbr: 'BKN', city: 'Brooklyn', name: 'Bolts', conf: 0, div: 0, market: 4, colors: ['#111111', '#c9c9c9', '#ffffff'], wood: 'dark' },
    { abbr: 'NYE', city: 'New York', name: 'Empire', conf: 0, div: 0, market: 5, colors: ['#1d4ed8', '#f97316', '#ffffff'], wood: 'light' },
    { abbr: 'PHI', city: 'Philadelphia', name: 'Founders', conf: 0, div: 0, market: 4, colors: ['#1e3a8a', '#dc2626', '#ffffff'], wood: 'light' },
    { abbr: 'TOR', city: 'Toronto', name: 'Blizzard', conf: 0, div: 0, market: 4, colors: ['#b91c1c', '#111827', '#e5e7eb'], wood: 'medium' },
    // East — Central
    { abbr: 'CHI', city: 'Chicago', name: 'Blaze', conf: 0, div: 1, market: 5, colors: ['#c8102e', '#111111', '#ffffff'], wood: 'light' },
    { abbr: 'CLE', city: 'Cleveland', name: 'Ironmen', conf: 0, div: 1, market: 2, colors: ['#6d1a36', '#f5b700', '#ffffff'], wood: 'medium' },
    { abbr: 'DET', city: 'Detroit', name: 'Gears', conf: 0, div: 1, market: 3, colors: ['#1d428a', '#9ea2a2', '#ffffff'], wood: 'light' },
    { abbr: 'IND', city: 'Indiana', name: 'Racers', conf: 0, div: 1, market: 2, colors: ['#002d62', '#fdbb30', '#ffffff'], wood: 'light' },
    { abbr: 'MIL', city: 'Milwaukee', name: 'Muskies', conf: 0, div: 1, market: 1, colors: ['#00471b', '#d9c8a6', '#ffffff'], wood: 'medium' },
    // East — Southeast
    { abbr: 'ATL', city: 'Atlanta', name: 'Firebirds', conf: 0, div: 2, market: 3, colors: ['#e03a3e', '#26282a', '#fdb927'], wood: 'light' },
    { abbr: 'CHA', city: 'Charlotte', name: 'Monarchs', conf: 0, div: 2, market: 2, colors: ['#4b2e83', '#00a3ad', '#ffffff'], wood: 'light' },
    { abbr: 'MIA', city: 'Miami', name: 'Surge', conf: 0, div: 2, market: 4, colors: ['#e11d74', '#06b6d4', '#111111'], wood: 'light' },
    { abbr: 'ORL', city: 'Orlando', name: 'Comets', conf: 0, div: 2, market: 2, colors: ['#0077c0', '#c4ced4', '#111111'], wood: 'light' },
    { abbr: 'WAS', city: 'Washington', name: 'Federals', conf: 0, div: 2, market: 3, colors: ['#0b2a5b', '#e31837', '#c4ced4'], wood: 'medium' },
    // West — Northwest
    { abbr: 'DEN', city: 'Denver', name: 'Summit', conf: 1, div: 3, market: 3, colors: ['#0e2240', '#fec524', '#8b2131'], wood: 'light' },
    { abbr: 'MIN', city: 'Minnesota', name: 'Lumberjacks', conf: 1, div: 3, market: 2, colors: ['#236192', '#78be20', '#0c2340'], wood: 'light' },
    { abbr: 'OKC', city: 'Oklahoma City', name: 'Twisters', conf: 1, div: 3, market: 1, colors: ['#007ac1', '#ef3b24', '#fdbb30'], wood: 'light' },
    { abbr: 'POR', city: 'Portland', name: 'Cascades', conf: 1, div: 3, market: 2, colors: ['#1f513f', '#e03a3e', '#e8e3d3'], wood: 'dark' },
    { abbr: 'UTA', city: 'Utah', name: 'Canyons', conf: 1, div: 3, market: 1, colors: ['#b8471c', '#f9a01b', '#2b1a12'], wood: 'light' },
    // West — Pacific
    { abbr: 'SF', city: 'San Francisco', name: 'Fog', conf: 1, div: 4, market: 5, colors: ['#1d428a', '#ffc72c', '#ffffff'], wood: 'light' },
    { abbr: 'LAS', city: 'Los Angeles', name: 'Stars', conf: 1, div: 4, market: 5, colors: ['#552583', '#fdb927', '#ffffff'], wood: 'medium' },
    { abbr: 'LAR', city: 'Los Angeles', name: 'Riptide', conf: 1, div: 4, market: 5, colors: ['#0ea5e9', '#0f172a', '#e2e8f0'], wood: 'light' },
    { abbr: 'PHX', city: 'Phoenix', name: 'Scorpions', conf: 1, div: 4, market: 3, colors: ['#e56020', '#1d1160', '#f9ad1b'], wood: 'light' },
    { abbr: 'SAC', city: 'Sacramento', name: 'Miners', conf: 1, div: 4, market: 2, colors: ['#5a2d81', '#c4ced4', '#111111'], wood: 'medium' },
    // West — Southwest
    { abbr: 'DAL', city: 'Dallas', name: 'Outlaws', conf: 1, div: 5, market: 4, colors: ['#00538c', '#b8c4ca', '#111111'], wood: 'light' },
    { abbr: 'HOU', city: 'Houston', name: 'Voyagers', conf: 1, div: 5, market: 4, colors: ['#ce1141', '#c4ced4', '#111111'], wood: 'light' },
    { abbr: 'MEM', city: 'Memphis', name: 'Blues', conf: 1, div: 5, market: 1, colors: ['#12173f', '#5d76a9', '#f5b112'], wood: 'dark' },
    { abbr: 'NOL', city: 'New Orleans', name: 'Krewe', conf: 1, div: 5, market: 1, colors: ['#4a1d6f', '#0f9d58', '#f4c542'], wood: 'medium' },
    { abbr: 'SA', city: 'San Antonio', name: 'Vaqueros', conf: 1, div: 5, market: 2, colors: ['#1f2937', '#d1d5db', '#ea580c'], wood: 'medium' },
  ];

  const WOMEN_TEAMS = [
    { abbr: 'ATL', city: 'Atlanta', name: 'Flame', conf: 0, div: 0, market: 3, colors: ['#c8102e', '#1f2937', '#fcd34d'], wood: 'light' },
    { abbr: 'CHI', city: 'Chicago', name: 'Gusts', conf: 0, div: 0, market: 5, colors: ['#0284c7', '#fde047', '#0f172a'], wood: 'light' },
    { abbr: 'CON', city: 'Connecticut', name: 'Tempest', conf: 0, div: 0, market: 2, colors: ['#0b3d91', '#f97316', '#ffffff'], wood: 'medium' },
    { abbr: 'IND', city: 'Indiana', name: 'Blaze', conf: 0, div: 0, market: 2, colors: ['#991b1b', '#fbbf24', '#0f172a'], wood: 'light' },
    { abbr: 'NYM', city: 'New York', name: 'Majesty', conf: 0, div: 0, market: 5, colors: ['#0f766e', '#111111', '#e5e7eb'], wood: 'dark' },
    { abbr: 'WAS', city: 'Washington', name: 'Monarchs', conf: 0, div: 0, market: 3, colors: ['#1e3a8a', '#e11d48', '#e5e7eb'], wood: 'light' },
    { abbr: 'DAL', city: 'Dallas', name: 'Stampede', conf: 1, div: 1, market: 4, colors: ['#1d4ed8', '#84cc16', '#0f172a'], wood: 'light' },
    { abbr: 'LVR', city: 'Las Vegas', name: 'Royals', conf: 1, div: 1, market: 3, colors: ['#111111', '#d4af37', '#e5e7eb'], wood: 'dark' },
    { abbr: 'LAS', city: 'Los Angeles', name: 'Starlights', conf: 1, div: 1, market: 5, colors: ['#6d28d9', '#fbbf24', '#ffffff'], wood: 'medium' },
    { abbr: 'MIN', city: 'Minnesota', name: 'Aurora', conf: 1, div: 1, market: 2, colors: ['#0c4a6e', '#22c55e', '#e5e7eb'], wood: 'light' },
    { abbr: 'PHX', city: 'Phoenix', name: 'Solstice', conf: 1, div: 1, market: 3, colors: ['#ea580c', '#4c1d95', '#fde68a'], wood: 'light' },
    { abbr: 'SEA', city: 'Seattle', name: 'Evergreens', conf: 1, div: 1, market: 3, colors: ['#14532d', '#facc15', '#e5e7eb'], wood: 'medium' },
  ];

  // ---------------------------------------------------------------------------
  // League configurations
  // ---------------------------------------------------------------------------
  const LEAGUES = {
    men: {
      key: 'men', gender: 'm', label: "Men's Pro League", short: 'PBL', teamsList: MEN_TEAMS,
      confs: ['East', 'West'], divs: ['Atlantic', 'Central', 'Southeast', 'Northwest', 'Pacific', 'Southwest'],
      seasonLengths: [82, 58, 29], quarterLen: 720, otLen: 300, periods: 4, shotClock: 24, orebShotClock: 14,
      paceBase: 99.5, foulOut: 6, bonus: 5, timeouts: 7,
      rosterMax: 15, rosterMin: 13, activeMax: 13, minutesTotal: 240,
      playoffTeams: 16, playIn: true, series: [7, 7, 7, 7], playoffFormat: 'conference',
      heightByPos: { PG: [74.5, 1.8], SG: [77, 1.6], SF: [79, 1.4], PF: [81, 1.3], C: [83.5, 1.5] },
      threePt: { arc: 23.75, corner: 22 },
      // money
      cap: 154.6e6, tax: 187.9e6, apron: 195.9e6, minSalary: 1.3e6, maxPct: [0.25, 0.30, 0.35], mle: 14.1e6,
      rookieTop: 12.5e6, rookieFirstRoundLow: 2.3e6, rookieSecond: 1.3e6,
      draftRounds: 2, lotteryTeams: 14,
      // shooting base make % per zone and 3pt share multiplier
      shotBase: { rim: 0.655, paint: 0.44, mid: 0.425, c3: 0.39, ab3: 0.355 },
      threeRate: 1.0, ftBase: 0.0,
      tradeDeadlineFrac: 0.58, allStarFrac: 0.62,
    },
    women: {
      key: 'women', gender: 'f', label: "Women's Pro League", short: 'WPL', teamsList: WOMEN_TEAMS,
      confs: ['East', 'West'], divs: ['East', 'West'],
      seasonLengths: [44, 22, 11], quarterLen: 600, otLen: 300, periods: 4, shotClock: 24, orebShotClock: 14,
      paceBase: 80.5, foulOut: 6, bonus: 5, timeouts: 6,
      rosterMax: 12, rosterMin: 11, activeMax: 12, minutesTotal: 200,
      playoffTeams: 8, playIn: false, series: [3, 5, 7], playoffFormat: 'league',
      heightByPos: { PG: [68.5, 1.8], SG: [71, 1.6], SF: [73, 1.4], PF: [75, 1.3], C: [77, 1.6] },
      threePt: { arc: 22.15, corner: 21.65 },
      cap: 1.51e6, tax: 1.8e6, apron: 1.9e6, minSalary: 66e3, maxPct: [0.16, 0.17, 0.18], mle: 110e3,
      rookieTop: 90e3, rookieFirstRoundLow: 70e3, rookieSecond: 66e3,
      draftRounds: 3, lotteryTeams: 4,
      shotBase: { rim: 0.55, paint: 0.385, mid: 0.378, c3: 0.365, ab3: 0.33 },
      threeRate: 0.56, ftBase: 0.012,
      tradeDeadlineFrac: 0.6, allStarFrac: 0.55,
    },
  };

  // ---------------------------------------------------------------------------
  // Strategies
  // ---------------------------------------------------------------------------
  // Play types: pnr, iso, post, spot, offscreen, handoff, cut (transition is decided separately)
  const OFFENSES = {
    balanced: {
      label: 'Balanced', icon: '⚖️',
      desc: 'A modern NBA mix: pick-and-roll, ball movement and a few post touches. No big strengths, no big holes.',
      plays: { pnr: 30, iso: 10, post: 8, spot: 22, offscreen: 8, handoff: 7, cut: 8 },
      mods: {},
    },
    paceSpace: {
      label: 'Pace & Space (5-Out)', icon: '🎯',
      desc: 'Five shooters spread the floor. Lots of threes and driving lanes; needs shooters at every spot or the lane clogs.',
      plays: { pnr: 30, iso: 8, post: 3, spot: 32, offscreen: 9, handoff: 8, cut: 6 },
      mods: { three: 1.28, transition: 1.2, pace: 2, needs: 'three' },
    },
    pnrHeavy: {
      label: 'Pick & Roll Heavy', icon: '🔁',
      desc: 'Relentless ball screens for your best handler with a rolling big. Deadly with a playmaking guard and a rim-running big.',
      plays: { pnr: 50, iso: 8, post: 4, spot: 18, offscreen: 6, handoff: 8, cut: 6 },
      mods: {},
    },
    motion: {
      label: 'Motion Offense', icon: '🔀',
      desc: 'Constant cutting, screening and passing. More assists and open looks for smart, unselfish teams; a bit more turnover risk.',
      plays: { pnr: 16, iso: 5, post: 8, spot: 26, offscreen: 18, handoff: 10, cut: 17 },
      mods: { assist: 1.1, to: 1.05, open: 0.06, needs: 'iq' },
    },
    iso: {
      label: 'Isolation (Hero Ball)', icon: '⭐',
      desc: 'Clear out and let your stars cook one-on-one. Great with elite scorers; fewer assists and easier to scheme against.',
      plays: { pnr: 24, iso: 36, post: 8, spot: 14, offscreen: 4, handoff: 6, cut: 3 },
      mods: { goTo: 1.2, assist: 0.82, pace: -2, open: -0.05 },
    },
    postUp: {
      label: 'Inside-Out Post', icon: '🏋️',
      desc: 'Pound the ball inside to your bigs, then kick out when the defense collapses. Draws fouls and crashes the glass.',
      plays: { pnr: 20, iso: 6, post: 28, spot: 22, offscreen: 6, handoff: 6, cut: 12 },
      mods: { three: 0.85, oreb: 1.08, drawFoul: 1.08, needs: 'post' },
    },
    princeton: {
      label: 'Princeton', icon: '🎓',
      desc: 'Slow, patient backdoor cuts and hand-offs from the high post. Efficient and low turnover, but it lowers the pace.',
      plays: { pnr: 10, iso: 4, post: 12, spot: 18, offscreen: 14, handoff: 20, cut: 22 },
      mods: { pace: -4, to: 0.93, open: 0.04, needs: 'iq' },
    },
    triangle: {
      label: 'Triangle', icon: '🔺',
      desc: 'Sideline triangles, post entries and reads. Produces mid-range and inside looks; rewards versatile, high-IQ players.',
      plays: { pnr: 10, iso: 12, post: 20, spot: 18, offscreen: 14, handoff: 8, cut: 18 },
      mods: { mid: 1.2, three: 0.88, needs: 'iq' },
    },
    runGun: {
      label: 'Run & Gun (7 Seconds)', icon: '🏃',
      desc: 'Push after every rebound and make, shoot early. Huge pace and transition scoring; more turnovers and tired legs.',
      plays: { pnr: 36, iso: 8, post: 3, spot: 30, offscreen: 6, handoff: 10, cut: 7 },
      mods: { transition: 1.9, pace: 6, three: 1.12, to: 1.08, fatigue: 1.12 },
    },
    gritGrind: {
      label: 'Grit & Grind', icon: '🧱',
      desc: 'Physical half-court basketball: slow it down, post up, crash the offensive glass and win ugly.',
      plays: { pnr: 24, iso: 10, post: 22, spot: 16, offscreen: 8, handoff: 10, cut: 10 },
      mods: { pace: -5, oreb: 1.15, transition: 0.65, three: 0.88 },
    },
    dribbleDrive: {
      label: 'Dribble Drive Motion', icon: '⚡',
      desc: 'Attack the rim off the bounce and kick to shooters. Lots of layups and free throws, almost no mid-range.',
      plays: { pnr: 22, iso: 18, post: 3, spot: 28, offscreen: 4, handoff: 6, cut: 19 },
      mods: { rim: 1.22, mid: 0.7, drawFoul: 1.1, needs: 'speed' },
    },
    heliocentric: {
      label: 'Heliocentric', icon: '☀️',
      desc: 'Everything runs through your superstar: ball screens and isolations every trip. Maximum usage for your go-to player.',
      plays: { pnr: 44, iso: 24, post: 4, spot: 18, offscreen: 3, handoff: 5, cut: 2 },
      mods: { goTo: 1.32, assist: 0.95 },
    },
  };

  // Defensive schemes. key matches the view's scheme keys.
  const DEFENSES = {
    man: {
      label: 'Man-to-Man', icon: '🛡️',
      desc: 'Standard man defense with help from the weak side. Solid against everything, elite against nothing.',
      mods: {},
    },
    switch: {
      label: 'Switch Everything', icon: '🔄',
      desc: 'Switch every screen. Kills pick-and-roll and off-screen actions if your defenders are versatile, but bigs get stuck on guards.',
      mods: { play: { pnr: -0.14, offscreen: -0.12, handoff: -0.1, post: 0.1, iso: 0.05 }, needs: 'versatile' },
    },
    drop: {
      label: 'Drop Coverage', icon: '⬇️',
      desc: 'Your big drops back to protect the rim. Great paint protection, but pull-up jumpers are wide open.',
      mods: { zone: { rim: -0.12, paint: -0.05, mid: 0.1, ab3: 0.03 }, freq: { rim: 0.9, mid: 1.18 }, needs: 'rim' },
    },
    blitz: {
      label: 'Blitz / Trap', icon: '🪤',
      desc: 'Double the ball handler on every pick-and-roll. Forces turnovers but leaves the roller and shooters open.',
      mods: { to: 1.14, play: { pnr: -0.12 }, open: 0.05, foul: 1.05, fatigue: 1.08, freq: { c3: 1.1 } },
    },
    zone23: {
      label: '2-3 Zone', icon: '🧊',
      desc: 'Pack the paint with a 2-3 zone. Protects the rim and saves legs, but gives up threes and offensive rebounds.',
      mods: { zone: { rim: -0.1, paint: -0.08, c3: 0.07, ab3: 0.04 }, freq: { rim: 0.84, paint: 0.9, c3: 1.25, ab3: 1.12 }, oreb: 1.12, fatigue: 0.9, foul: 0.9, isZone: true },
    },
    zone32: {
      label: '3-2 Zone', icon: '🧱',
      desc: 'Extend the zone to the arc. Contests threes but softer around the basket.',
      mods: { zone: { ab3: -0.08, c3: 0.02, paint: 0.06, rim: 0.05 }, freq: { ab3: 0.88, paint: 1.12, rim: 1.06 }, oreb: 1.08, fatigue: 0.92, isZone: true },
    },
    zone131: {
      label: '1-3-1 Zone', icon: '✴️',
      desc: 'A trapping zone that jumps passing lanes. Lots of steals, but the corners are open.',
      mods: { to: 1.15, stl: 1.2, zone: { c3: 0.1, rim: 0.03 }, freq: { c3: 1.35 }, oreb: 1.1, isZone: true },
    },
    boxone: {
      label: 'Box-and-One', icon: '🎯',
      desc: "Chase the opponent's top scorer with your best defender while four play zone. Slows a star; everyone else gets looks.",
      mods: { star: -0.18, starUsage: 0.72, open: 0.05, isZone: true },
    },
    press: {
      label: 'Full-Court Press', icon: '🔥',
      desc: 'Pressure the inbound and trap in the backcourt. Creates turnovers and chaos; gives up easy layups when broken and wears you out.',
      mods: { to: 1.18, stl: 1.2, pace: 4, fatigue: 1.25, transitionAgainst: 1.3, foul: 1.08 },
    },
    packline: {
      label: 'Pack the Paint', icon: '📦',
      desc: 'Sag off shooters and wall off the lane. Very few layups, lots of threes allowed.',
      mods: { zone: { rim: -0.08, paint: -0.06, ab3: 0.05, c3: 0.03 }, freq: { rim: 0.82, ab3: 1.18, c3: 1.12 }, foul: 0.9 },
    },
    nothree: {
      label: 'Run Shooters Off the Line', icon: '🚫',
      desc: 'Top-lock and fly at shooters. Takes away threes but opens driving lanes and fouls.',
      mods: { zone: { ab3: -0.1, c3: -0.1, rim: 0.07, paint: 0.04 }, freq: { ab3: 0.8, c3: 0.8, rim: 1.14 }, foul: 1.08, fatigue: 1.06 },
    },
    pressure: {
      label: 'Ball Pressure & Deny', icon: '✋',
      desc: 'Get up into the ball and deny every pass. More steals and turnovers, but backdoor cuts and fouls go up.',
      mods: { to: 1.1, stl: 1.15, play: { cut: 0.12 }, foul: 1.1, fatigue: 1.1 },
    },
  };

  const TEMPOS = {
    vslow: { label: 'Very Slow', pace: -8 },
    slow: { label: 'Slow', pace: -4 },
    normal: { label: 'Normal', pace: 0 },
    fast: { label: 'Fast', pace: 4 },
    vfast: { label: 'Very Fast', pace: 8 },
  };
  const FOCUS = {
    inside: { label: 'Attack Inside', freq: { rim: 1.18, paint: 1.12, mid: 0.92, c3: 0.85, ab3: 0.85 } },
    balanced: { label: 'Balanced', freq: {} },
    perimeter: { label: 'Bomb From Deep', freq: { rim: 0.9, paint: 0.88, mid: 0.9, c3: 1.18, ab3: 1.2 } },
  };
  const CRASH = {
    getback: { label: 'Get Back', oreb: 0.82, transAgainst: 0.8 },
    balanced: { label: 'Balanced', oreb: 1, transAgainst: 1 },
    crash: { label: 'Crash the Glass', oreb: 1.2, transAgainst: 1.25 },
  };
  const PRESSURE = {
    soft: { label: 'Stay Home', stl: 0.85, foul: 0.85, open: -0.02, fatigue: 0.95 },
    normal: { label: 'Normal', stl: 1, foul: 1, open: 0, fatigue: 1 },
    aggressive: { label: 'Aggressive', stl: 1.18, foul: 1.15, open: 0.03, fatigue: 1.07 },
  };

  // ---------------------------------------------------------------------------
  // Awards, achievements
  // ---------------------------------------------------------------------------
  const AWARDS = {
    mvp: 'Most Valuable Player', dpoy: 'Defensive Player of the Year', roy: 'Rookie of the Year',
    smoy: 'Sixth Player of the Year', mip: 'Most Improved Player', coy: 'Coach of the Year', fmvp: 'Finals MVP',
  };

  const ACHIEVEMENTS = [
    { id: 'first_win', label: 'First Win', desc: 'Win your first game as head coach.', pts: 1 },
    { id: 'win_streak_5', label: 'Heating Up', desc: 'Win 5 games in a row.', pts: 2 },
    { id: 'win_streak_10', label: 'On Fire', desc: 'Win 10 games in a row.', pts: 5 },
    { id: 'win_100', label: 'Century Mark', desc: 'Win 100 career games.', pts: 5 },
    { id: 'win_250', label: 'Quarter Thousand', desc: 'Win 250 career games.', pts: 8 },
    { id: 'win_500', label: 'Five Hundred Club', desc: 'Win 500 career games.', pts: 15 },
    { id: 'winning_season', label: 'Winning Season', desc: 'Finish a season above .500.', pts: 2 },
    { id: 'fifty_wins', label: 'Fifty Burger', desc: 'Win 50+ games in a full season (60% win rate).', pts: 5 },
    { id: 'sixty_wins', label: 'Juggernaut', desc: 'Win 60+ games in a full season (73% win rate).', pts: 8 },
    { id: 'playoffs', label: 'Postseason Bound', desc: 'Make the playoffs.', pts: 3 },
    { id: 'series_win', label: 'Advance', desc: 'Win a playoff series.', pts: 4 },
    { id: 'conf_title', label: 'Conference Champs', desc: 'Reach the Finals.', pts: 8 },
    { id: 'title', label: 'Champion', desc: 'Win the championship.', pts: 20 },
    { id: 'repeat', label: 'Back-to-Back', desc: 'Win two championships in a row.', pts: 20 },
    { id: 'dynasty', label: 'Dynasty', desc: 'Win three championships.', pts: 30 },
    { id: 'coy', label: 'Coach of the Year', desc: 'Win Coach of the Year.', pts: 6 },
    { id: 'turnaround', label: 'Turnaround Artist', desc: 'Improve your team by 15+ wins (18%+ win rate) in one season.', pts: 5 },
    { id: 'upset', label: 'Giant Killer', desc: 'Win a playoff series as the lower seed.', pts: 4 },
    { id: 'gim_hero', label: 'Ice in the Veins', desc: 'Hit a game-winning Game Impact Moment.', pts: 2 },
    { id: 'perfect_practice', label: 'Practice Makes Perfect', desc: 'Score an A+ in a practice drill.', pts: 1 },
    { id: 'mvp_player', label: 'MVP Maker', desc: 'Coach the league MVP.', pts: 4 },
    { id: 'draft_steal', label: 'Draft Whisperer', desc: 'Draft a player outside the top 10 who becomes an 80+ OVR player.', pts: 4 },
    { id: 'big_fa', label: 'Closer', desc: 'Sign a free agent rated 85+.', pts: 3 },
    { id: 'survivor', label: 'Survivor', desc: 'Coach 10 seasons.', pts: 6 },
    { id: 'hired_again', label: 'Second Act', desc: 'Get hired by a new team after being fired.', pts: 2 },
  ];

  PBC.Config = {
    RATINGS, RATING_KEYS, RATING_GROUPS, PHYSICAL, POSITIONS, POS_NUM, POS_NAME, POS_BASE, ARCHETYPES, OVR_W,
    MEN_TEAMS, WOMEN_TEAMS, LEAGUES, OFFENSES, DEFENSES, TEMPOS, FOCUS, CRASH, PRESSURE, AWARDS, ACHIEVEMENTS,
    SKIN_TONES: ['#f3d2b6', '#e8b995', '#d6a17a', '#c08560', '#a26a45', '#86532f', '#6a3f22', '#4a2a16'],
    HAIR_COLORS: ['#0e0b09', '#1b1410', '#2a1c12', '#3b2716', '#5a3a1e', '#7a5530', '#a8753d', '#d6b370', '#8e2b1a', '#b9b9b9'],
    SHOE_COLORS: ['#ffffff', '#111111', '#e11d48', '#2563eb', '#f59e0b', '#10b981', '#7c3aed', '#f97316', '#e5e7eb', '#0ea5e9'],
    SAVE_VERSION: 1,
  };
})();
