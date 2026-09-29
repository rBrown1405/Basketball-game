// Loads the game (engine + animation system) into Node with the few browser stubs it needs, for the headless audit
// tools in this folder. Nothing is drawn: the view runs with models:'2d' and no render() calls.
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');

/** seeded Math.random (the Animation Lab uses the same generator) */
function seedRandom(seed) {
  let rs = (seed >>> 0) || 1;
  Math.random = () => { rs = (rs + 0x6D2B79F5) | 0; let t = Math.imul(rs ^ (rs >>> 15), 1 | rs); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function stubs() {
  global.window = global;
  global.devicePixelRatio = 1;
  const noop = () => {};
  const ctx2d = () => {
    const grad = { addColorStop: noop };
    const base = {
      measureText: (s) => ({ width: String(s).length * 6, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 }),
      createLinearGradient: () => grad, createRadialGradient: () => grad, createConicGradient: () => grad, createPattern: () => ({}),
      getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }),
      createImageData: (w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }),
      getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }), isPointInPath: () => false, getLineDash: () => [],
    };
    return new Proxy(base, { get: (o, k) => (k in o ? o[k] : noop), set: (o, k, v) => { o[k] = v; return true; } });
  };
  const canvas = (w, h) => ({ width: w || 300, height: h || 150, clientWidth: w || 1600, clientHeight: h || 900, style: {}, getContext: () => ctx2d(), addEventListener: noop, removeEventListener: noop, toDataURL: () => '' });
  global.document = { createElement: (t) => (t === 'canvas' ? canvas() : { style: {}, appendChild: noop, setAttribute: noop }), body: { appendChild: noop }, addEventListener: noop };
  global.location = { href: 'file:///audit', search: '', protocol: 'file:' };
  global.localStorage = { getItem: () => null, setItem: noop, removeItem: noop };
  global.requestAnimationFrame = () => 0;
  return { canvas };
}

// the same order as match_test.html (the renderer's files load but are not used without render())
// (the half-court defense, offense, called plays and rebounds extend the Director after flow.js, as they do in the page)
const FILES = ['js/core/util', 'js/core/names', 'js/core/config', 'js/core/player', 'js/core/identity', 'js/core/persona', 'js/core/tendency', 'js/core/sliders', 'js/core/league', 'js/core/stats', 'js/core/ai', 'js/core/playbook', 'js/core/playcall', 'js/core/sim',
  'js/match/util', 'js/match/tune', 'js/match/camera', 'js/match/court', 'js/match/arena', 'js/match/hoop', 'js/match/rig', 'js/match/poses', 'js/match/figure', 'js/match/body3d', 'js/match/body3d_parts', 'js/match/human_data', 'js/match/human', 'js/match/human_build', 'js/match/gl3d',
  'js/match/anims', 'js/match/clips', 'js/match/actor', 'js/match/ball', 'js/match/choreo', 'js/match/passlab', 'js/match/shotlab', 'js/match/glasslab', 'js/match/flow', 'js/match/defense', 'js/match/offense', 'js/match/plays', 'js/match/rebound', 'js/match/debugdraw', 'js/match/view', 'js/match/debug', 'js/match/mock'];

function load(seed) {
  seedRandom(seed == null ? 1 : seed);
  const st = stubs();
  for (const f of FILES) {
    const p = path.join(ROOT, f + '.js');
    vm.runInThisContext(fs.readFileSync(p, 'utf8'), { filename: p });
  }
  return { PBC: global.PBC, canvas: st.canvas };
}

/** a real-engine game context, built exactly like js/ui/live.js (UI.matchContext) and match_test.html */
function engineGame(PBC, seed, women) {
  const S0 = PBC.League.create({ leagueKey: women ? 'women' : 'men', seed });
  S0.userTid = 0;
  const g = PBC.Sim.createGame(S0, 0, 1, {});
  const uniformFor = (t, home) => { const p = t.colors.primary, s = t.colors.secondary; return home ? { jersey: '#f4f6fa', number: p, trim: p, shorts: '#f4f6fa' } : { jersey: p, number: s, trim: s, shorts: p }; };
  const teamLook = (t, home) => ({ id: t.id, abbr: t.abbr, city: t.city, name: t.name, colors: Object.assign({}, t.colors), uniform: uniformFor(t, home), court: { paint: t.colors.primary, logoText: t.abbr, wood: t.wood || 'light' } });
  const playerLook = (p, teamIdx) => ({ id: p.id, teamIdx, first: p.first, last: p.last, num: p.num, pos: p.pos, height: p.hgt, wing: p.wing, weight: p.wgt, hand: p.hand, gender: p.gender, look: p.look, speed: p.r.speed, agility: p.r.agility, vert: p.r.vert, handle: p.r.handle,
    // (the court's defense and offense read these, js/match/defense.js and offense.js)
    three: p.r.three, mid: p.r.mid, close: p.r.close, post: p.r.post, perD: p.r.perD, helpD: p.r.helpD, intD: p.r.intD, arch: p.arch, expr: 'neutral' });
  const L = PBC.League.cfg(S0), players = {};
  g.t.forEach((T, i) => T.players.forEach((c) => { players[c.id] = playerLook(c.p, i); }));
  const ctx = { league: L.key, periodLen: L.quarterLen, otLen: L.otLen, threePt: L.threePt, home: teamLook(S0.teams[g.tids[0]], true), away: teamLook(S0.teams[g.tids[1]], false), players, lineups: [g.t[0].on.map((x) => x.id), g.t[1].on.map((x) => x.id)], defScheme: [g.t[0].strat.def, g.t[1].strat.def] };
  return { ctx, game: g, S: S0 };
}

/** drive a view through possessions: step(dt) advances; returns a controller */
function runner(PBC, view, game, opts) {
  opts = opts || {};
  // (the pause between possessions is counted in game time, so every playback speed starts the next possession on
  // the same simulation step)
  let idleFrom = view.time - 0.05, done = false, period = 1, poss = null, errors = 0, pending = null;
  const next = () => {
    if (game.final) { done = true; return; }
    try { poss = PBC.Sim.nextPossession(game); } catch (e) { errors++; done = true; return; }
    if (!poss) { done = true; return; }
    if (opts.periods && poss.period > opts.periods) { done = true; return; }
    period = poss.period;
    if (poss.defScheme) view.setDefScheme(1 - poss.off, poss.defScheme);
    view.period = poss.period;
    const theP = poss;
    view.play(poss, {
      onEvent: (ev) => { if (ev && ev.type === 'shot' && ev.pending) pending = theP; },
      onDone: () => { idleFrom = view.time; },
    });
  };
  next();
  return {
    get done() { return done; }, get period() { return period; },
    /** advance by dt of game presentation time (the view steps in fixed 1/60 s steps inside) */
    update(dt) {
      if (done) return;
      if (view.isIdle() && idleFrom != null && view.time - idleFrom >= 0.35 - 1e-9) { idleFrom = null; next(); }
      if (pending) { try { PBC.Sim.resolvePending(game, pending, { quality: 'good' }); } catch (e) { errors++; } pending = null; view.resume(); }
      view.update(dt);
    },
  };
}

module.exports = { load, engineGame, runner, seedRandom, ROOT };
