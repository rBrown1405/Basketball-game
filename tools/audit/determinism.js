// Prints one hash per simulation step (every body's solved skeleton and the ball) for a seeded engine game, driven by
// a chosen host frame pattern. Used by check.js to prove the motion is identical at any playback speed or frame rate.
//   node tools/audit/determinism.js --mode 1x|0.25x|0.1x|jitter|144hz --steps 1200 [--seed 7]
'use strict';
const { load, engineGame, runner } = require('./load');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const mode = opt('mode', '1x'), steps = +opt('steps', 1200), seed = +opt('seed', 7);
const { PBC, canvas } = load(seed);
const M = PBC.Match;
const G = engineGame(PBC, seed);
const view = new M.View(canvas(1600, 900), G.ctx, { models: '2d', quality: 'low', record: false });
const out = [];
const tick = view.tick.bind(view);
view.tick = (h) => {
  tick(h);
  let hsh = 2166136261;
  const mix = (v) => { const q = Math.round(v * 1e5) | 0; hsh ^= q; hsh = Math.imul(hsh, 16777619) >>> 0; };
  for (const a of view.bodies()) { const P = a.sk.P; for (let i = 0; i < P.length; i++) mix(P[i]); }
  mix(view.ball.x); mix(view.ball.y); mix(view.ball.z);
  out.push((hsh >>> 0).toString(16));
};
const run = runner(PBC, view, G.game, { periods: 1 });
// the host's frame pattern (its own generator, so it never touches the game's random numbers)
let js = 99991;
const jr = () => { js = (Math.imul(js, 1103515245) + 12345) >>> 0; return js / 4294967296; };
const H = M.Tune.clock.step;
let guard = 0;
while (out.length < steps && !run.done && guard++ < steps * 40) {
  const dt = mode === '0.25x' ? H * 0.25 : mode === '0.1x' ? H * 0.1 : mode === '144hz' ? 1 / 144 : mode === 'jitter' ? 0.006 + jr() * 0.026 : H;
  run.update(dt);
}
console.log(JSON.stringify({ mode, steps: out.length, hashes: out }));
