/* Pro BBALL Coach — player tendencies (PBC.Tendency). No DOM.
 *
 * p.tend = { three, mid, rim, post, iso, pnr, pass, dunk, pullup, stepback, drawFoul, crash, push, gamble, block, foul }
 * (0..100). Tendencies describe what a player LIKES to do; ratings decide how well it works.
 *
 * Generation: neutral value from ratings + position (Tendency.neutral) + archetype and personality style
 * (PBC.Persona) + a little per-player noise. The noise is hash-based (deterministic per player id), so generating
 * tendencies never consumes the game's seeded RNG and "reset to generated" always gives the same answer.
 *
 * Engine use (Tendency.sim → cached per player per game by Sim):
 *  - three / mid / rim / dunk are absolute "how often" knobs: the engine converts them back into the effective rating
 *    its frequency formulas always used (x3, xMid, xRim, xDunk), so a generated tendency reproduces the old rating-driven
 *    shot selection exactly, while an edited one (a center set to 90 threes) really changes it.
 *  - the others act relative to the neutral value implied by the ratings (d = (t − neutral) / 50): generated values
 *    average out to the old behaviour, edits swing it a lot.
 * p.tendCustom = true once the user edits them in the editor; otherwise they follow the ratings
 * (regenerated after ratings edits and every offseason, see Tendency.refresh). */
(function () {
  'use strict';
  const PBC = (window.PBC = window.PBC || {});
  const C = PBC.Config;

  const LIST = [
    { key: 'three', label: 'Three-Point Shots', short: '3PT', group: 'Shooting', desc: 'How often he hunts threes.', hi: 'lets it fly from deep', lo: 'rarely shoots threes' },
    { key: 'mid', label: 'Mid-Range Shots', short: 'MID', group: 'Shooting', desc: 'Jumpers and pull-ups inside the arc.', hi: 'lives in the mid-range', lo: 'skips the mid-range' },
    { key: 'rim', label: 'Attack the Rim', short: 'RIM', group: 'Shooting', desc: 'Drives, cuts and finishes at the basket.', hi: 'attacks the rim', lo: 'stays on the perimeter' },
    { key: 'dunk', label: 'Dunk vs Layup', short: 'DNK', group: 'Shooting', desc: 'Throws it down whenever he can.', hi: 'throws it down every chance he gets', lo: 'lays it in instead of dunking' },
    { key: 'pullup', label: 'Pull-Up Jumpers', short: 'PUL', group: 'Shooting', desc: 'Shoots off the dribble instead of waiting for the catch.', hi: 'pulls up off the dribble', lo: 'waits for catch-and-shoot looks' },
    { key: 'stepback', label: 'Step-Backs & Fadeaways', short: 'STB', group: 'Shooting', desc: 'Creates space with step-backs and fadeaways.', hi: 'loves the step-back', lo: 'keeps his jumpers simple' },
    { key: 'drawFoul', label: 'Seek Contact', short: 'CON', group: 'Shooting', desc: 'Initiates contact to get to the line.', hi: 'hunts contact and free throws', lo: 'avoids contact' },
    { key: 'iso', label: 'Isolation', short: 'ISO', group: 'Playmaking', desc: 'Wants the ball to go one-on-one.', hi: 'wants the ball in isolation', lo: 'rarely goes one-on-one' },
    { key: 'pnr', label: 'Pick & Roll Ball Handler', short: 'P&R', group: 'Playmaking', desc: 'Calls for ball screens and runs the pick-and-roll.', hi: 'runs pick-and-roll all night', lo: 'stays off the ball' },
    { key: 'post', label: 'Post-Ups', short: 'PST', group: 'Playmaking', desc: 'Calls for the ball on the block.', hi: 'backs defenders down in the post', lo: 'never posts up' },
    { key: 'pass', label: 'Pass First', short: 'PAS', group: 'Playmaking', desc: 'Looks for teammates before his own shot (low = shoot first).', hi: 'looks to pass first', lo: 'is a shoot-first player' },
    { key: 'push', label: 'Push in Transition', short: 'PSH', group: 'Hustle', desc: 'Runs the floor and leaks out for easy baskets.', hi: 'pushes the pace in transition', lo: 'walks it up the floor' },
    { key: 'crash', label: 'Crash the Glass', short: 'CRS', group: 'Hustle', desc: 'Goes after offensive rebounds instead of getting back.', hi: 'crashes the offensive glass', lo: 'gets back on defense instead of crashing' },
    { key: 'gamble', label: 'Gamble for Steals', short: 'GMB', group: 'Defense', desc: 'Jumps passing lanes and reaches. More steals, more open looks allowed.', hi: 'gambles for steals', lo: 'stays home on defense' },
    { key: 'block', label: 'Go for Blocks', short: 'BLK', group: 'Defense', desc: 'Contests everything at the rim. More blocks, a few more fouls.', hi: 'goes for every block', lo: 'stays grounded on contests' },
    { key: 'foul', label: 'Foul Tendency', short: 'FOU', group: 'Defense', desc: 'Plays physical and fouls more.', hi: 'plays physical and fouls a lot', lo: 'rarely fouls' },
  ];
  const KEYS = LIST.map(x => x.key);
  const BY_KEY = {};
  LIST.forEach(x => { BY_KEY[x.key] = x; });
  const GROUPS = ['Shooting', 'Playmaking', 'Hustle', 'Defense'];

  // absolute tendencies: t = 50 + (x − X0) · K  ⇔  x = X0 + (t − 50) / K   (x = the effective rating the engine uses)
  const ABS = { three: [62, 1.4], mid: [64, 1.4], rim: [72, 1.6], dunk: [60, 1.4] };
  const effective = (key, t) => ABS[key][0] + (t - 50) / ABS[key][1];

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const pn = p => (C && C.POS_NUM[p.pos]) || 3;
  const byPos = (p, arr) => arr[pn(p) - 1];
  function scoreSkill(r) {
    const inside = Math.max(r.layup, r.close, r.dunk * 0.95, r.post * 0.95);
    const outside = Math.max(r.three, r.mid * 0.97);
    return 0.42 * outside + 0.38 * inside + 0.1 * r.drawFoul + 0.1 * r.shotIQ;
  }

  /** Neutral (rating-implied) value of every tendency, unclamped. */
  function neutral(p) {
    const r = p.r;
    const ss = scoreSkill(r), jump = (r.mid + r.three) / 2;
    return {
      three: 50 + (r.three - 62) * 1.4,
      mid: 50 + (r.mid - 64) * 1.4,
      rim: 50 + (Math.max(r.layup, r.dunk, r.close) - 72) * 1.6,
      dunk: 50 + (r.dunk - 60) * 1.4,
      pullup: 50 + (jump - 66) * 0.8 + (r.handle - 66) * 0.6 + byPos(p, [4, 6, 0, -10, -16]),
      stepback: 50 + (r.handle - 66) * 0.6 + (jump - 66) * 0.5 + (r.agility - 70) * 0.2 + byPos(p, [2, 4, 0, -10, -16]),
      drawFoul: 50 + (r.drawFoul - 63) * 1.3,
      iso: 50 + (ss - 68) * 1.3 + (r.handle - 65) * 0.35 + byPos(p, [3, 3, 0, -6, -12]),
      pnr: 50 + (r.handle - 68) * 0.9 + (r.pass - 64) * 0.5 + byPos(p, [14, 6, -2, -18, -26]),
      post: 50 + (r.post - 55) * 1.3 + byPos(p, [-16, -10, -2, 8, 12]),
      pass: 50 + ((r.pass + r.vision) / 2 - 62) * 1.1 - (ss - 68) * 0.35 + byPos(p, [10, -2, 0, -4, -6]),
      push: 50 + (r.speed - 70) * 1.0 + byPos(p, [4, 6, 4, -4, -10]),
      crash: 50 + (r.oreb - 52) * 1.0 + (r.hustle - 68) * 0.35 + byPos(p, [-12, -8, 0, 8, 12]),
      gamble: 50 + (r.steal - 58) * 1.0 + (r.agility - 70) * 0.2,
      block: 50 + (r.block - 52) * 1.0 + (r.vert - 68) * 0.2,
      foul: 50 + (60 - r.helpD) * 0.4 + (r.strength - 62) * 0.2 + byPos(p, [-3, -2, 0, 3, 5]),
    };
  }

  // ---- style: archetype & personality (mean-centered so the league as a whole keeps its old habits) ----
  const ARCH = {
    'Floor General': { pass: 8, pnr: 6, iso: -5, stepback: -3 },
    'Scoring Guard': { iso: 6, pullup: 6, stepback: 5, pass: -6 },
    'Slasher': { push: 6, drawFoul: 4, pullup: -6, dunk: 3 },
    'Two-Way Guard': { gamble: 6, iso: -3 },
    'Sharpshooter': { pullup: -4, iso: -4, push: -2, stepback: 2 },
    '3&D Wing': { gamble: 4, iso: -6, pullup: -6 },
    'Shot Creator': { iso: 8, stepback: 8, pullup: 8, pass: -4 },
    'Athletic Wing': { push: 8, crash: 5, dunk: 4 },
    'Point Forward': { pass: 10, pnr: 10, iso: -2 },
    'Scoring Wing': { iso: 6, pullup: 5, stepback: 5, pass: -4 },
    'Stretch Four': { post: -8, crash: -6, pullup: 2 },
    'Athletic Four': { crash: 6, push: 5, dunk: 4 },
    'Post Scorer': { post: 10, crash: 2, iso: 2 },
    'Glue Defender': { gamble: 2, block: 2, foul: 3, iso: -6, crash: 3 },
    'Rim Protector': { block: 8, foul: 3, post: -5 },
    'Stretch Big': { post: -8, crash: -6 },
    'Rim Runner': { crash: 6, dunk: 5, post: -8, push: 2 },
    'Playmaking Big': { pass: 10, post: 2 },
  };
  const PERS = {
    easygoing: { pass: 6, iso: -5, foul: -6, gamble: -3, stepback: -3, push: 3 },
    leader: { pass: 10, iso: -4, pnr: 4, foul: -3 },
    competitor: { crash: 8, block: 5, drawFoul: 5, foul: 3, push: 3, gamble: 3 },
    showman: { dunk: 12, stepback: 10, iso: 6, three: 3, pass: -4, push: 6 },
    cocky: { iso: 8, stepback: 8, pullup: 6, pass: -6, three: 3 },
    hothead: { foul: 12, gamble: 8, iso: 4, pass: -4, drawFoul: 2 },
    quiet: { iso: -4, pass: 2, stepback: -4, foul: -2 },
    goofball: { stepback: 5, three: 3, gamble: 4, pass: 2, dunk: 4 },
    enforcer: { foul: 10, crash: 8, post: 6, block: 6, pass: -2, three: -4 },
    humble: { crash: 6, pass: 6, iso: -6, stepback: -6, foul: -2, dunk: -3 },
    diva: { iso: 10, pass: -10, stepback: 6, pullup: 5, crash: -8, push: 2 },
    cold: { pullup: 8, iso: 3, stepback: 4, drawFoul: -2, foul: -4 },
  };
  // centering: archetypes per position (uniform pick in Player.create), personality types (roughly uniform league-wide)
  const ARCH_MEAN = {};
  if (C) for (const pos of C.POSITIONS) {
    const names = Object.keys(C.ARCHETYPES[pos] || {});
    const m = {};
    for (const k of KEYS) m[k] = names.length ? names.reduce((s, a) => s + ((ARCH[a] || {})[k] || 0), 0) / names.length : 0;
    ARCH_MEAN[pos] = m;
  }
  const PERS_MEAN = {};
  for (const k of KEYS) { const t = Object.keys(PERS); PERS_MEAN[k] = t.reduce((s, x) => s + (PERS[x][k] || 0), 0) / t.length; }
  // personality types are not spread evenly over positions (enforcers and competitors are mostly bigs): residual
  // per-position means of the generated deviations, measured on 16 generated leagues (minutes-weighted), removed here
  const POS_FIX = {
    PG: { rim: -0.5, pullup: 0.5, post: -1, pass: -0.5, foul: 1.5 },
    SG: { mid: 0.5, pullup: 1, stepback: -0.5, crash: -1, gamble: -0.5, foul: 1 },
    SF: { rim: -1, stepback: -0.5, iso: -0.5, pass: 0.5, push: -0.5, gamble: -0.5, foul: 1 },
    PF: { three: 1.5, rim: -0.5, dunk: 0.5, pullup: 1.5, post: -1, crash: -2.5, gamble: -0.5, block: -2, foul: -2.5 },
    C: { dunk: 0.5, pullup: 0.5, stepback: -1, pnr: -0.5, pass: 1, crash: -1.5, block: -2.5, foul: -2 },
  };

  // ---- deterministic per-player noise ----
  function hash01(p, salt) {
    const s = String(p && p.id != null ? p.id : (p && p.last) || 'x') + '|tend|' + salt;
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
    return ((h >>> 0) + 0.5) / 4294967297;
  }
  function hashGauss(p, salt) {
    const u1 = hash01(p, salt + ':a'), u2 = hash01(p, salt + ':b');
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
  const NOISE = 5;

  /** Style shift (archetype + personality), centered. */
  function style(p) {
    const out = {};
    const a = ARCH[p.arch] || {}, am = ARCH_MEAN[p.pos] || {};
    const type = PBC.Persona && PBC.Persona.of ? PBC.Persona.of(p) : null;
    const pe = (type && PERS[type]) || {};
    const fix = POS_FIX[p.pos] || {};
    for (const k of KEYS) out[k] = ((a[k] || 0) - (am[k] || 0)) * 0.8 + (type ? (pe[k] || 0) - PERS_MEAN[k] : 0) + (fix[k] || 0);
    return out;
  }

  /** Fresh generated tendencies for a player (does not store them). */
  function generate(p) {
    if (!p || !p.r) return null;
    const n = neutral(p), st = style(p);
    const out = {};
    for (const k of KEYS) out[k] = Math.round(clamp(n[k] + st[k] + hashGauss(p, k) * NOISE, 0, 100));
    return out;
  }

  /** The player's tendencies (generated and stored on p.tend the first time). */
  function get(p) {
    if (!p) return null;
    let t = p.tend;
    if (!t || typeof t !== 'object') { t = p.tend = generate(p); return t; }
    let gen = null;
    for (const k of KEYS) {
      const v = +t[k];
      if (!(v === v) || t[k] === null) { gen = gen || generate(p); t[k] = gen[k]; }
      else t[k] = clamp(Math.round(v), 0, 100);
    }
    return t;
  }

  /** Regenerate from the current ratings unless the user customized them (offseason, ratings edits). */
  function refresh(p) {
    if (!p || !p.r || p.tendCustom) return p ? p.tend : null;
    p.tend = generate(p);
    return p.tend;
  }

  /** Throw away custom tendencies and follow the ratings again. */
  function reset(p) {
    if (!p) return null;
    delete p.tendCustom;
    p.tend = generate(p);
    return p.tend;
  }

  /** Engine profile: effective ratings for the absolute tendencies + relative deviations d[k] = (t − neutral) / 50. */
  function sim(p) {
    const t = get(p), n = neutral(p);
    const d = {};
    for (const k of KEYS) d[k] = (t[k] - clamp(n[k], 0, 100)) / 50;
    return { x3: effective('three', t.three), xMid: effective('mid', t.mid), xRim: effective('rim', t.rim), xDunk: effective('dunk', t.dunk), d };
  }

  /** Words for a value (UI). */
  function word(v) {
    return v >= 85 ? 'Always' : v >= 68 ? 'Often' : v >= 45 ? 'Sometimes' : v >= 25 ? 'Rarely' : 'Almost never';
  }

  /** The strongest habits of a player, for flavour text: [{ key, label, v, text }] (top n by distance from 50). */
  function signature(p, n) {
    const t = get(p);
    if (!t) return [];
    return KEYS.map(k => ({ key: k, label: BY_KEY[k].label, v: t[k], text: t[k] >= 50 ? BY_KEY[k].hi : BY_KEY[k].lo }))
      .sort((a, b) => Math.abs(b.v - 50) - Math.abs(a.v - 50)).slice(0, n || 3);
  }

  PBC.Tendency = { LIST, KEYS, BY_KEY, GROUPS, ABS, neutral, style, generate, get, refresh, reset, sim, effective, word, signature };
})();
