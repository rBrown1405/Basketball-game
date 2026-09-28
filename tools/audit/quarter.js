// Headless quarter audit: plays a full simulated quarter of a real-engine game (seeded, so it repeats exactly) through
// the live match view in fixed 1/60 s steps and measures every body every step with the same meters the in-game debug
// overlay uses (PBC.Match.Debug.Meters). Prints the scorecard as JSON.
//   node tools/audit/quarter.js [--seed 7] [--periods 1] [--women] [--out file.json] [--frames N]
'use strict';
const { load, engineGame, runner } = require('./load');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : d; };
const seed = +opt('seed', 7), periods = +opt('periods', 1), women = !!opt('women', false), out = opt('out', null), maxFrames = +opt('frames', 60 * 60 * 40);

const { PBC, canvas } = load(seed);
const M = PBC.Match;
const G = engineGame(PBC, seed, women);
const view = new M.View(canvas(1600, 900), G.ctx, { models: '2d', quality: 'low', record: false });
const meters = new M.Debug.Meters(() => ({ people: view.bodies(), ball: view.ball, time: view.time, view, dt: M.Tune.clock.step }));
// measure after every fixed step, exactly where the in-game tools measure
const tick = view.tick.bind(view);
view.tick = (h) => { tick(h); if (!view.director.frozen) meters.frame(); };
const run = runner(PBC, view, G.game, { periods });
const t0 = Date.now();
const times = [];
let frames = 0;
while (!run.done && frames < maxFrames) {
  const a = process.hrtime.bigint();
  run.update(M.Tune.clock.step);
  times.push(Number(process.hrtime.bigint() - a) / 1e6);
  frames++;
}
const S = meters.summary();
times.sort((a, b) => a - b);
const res = {
  seed, periods, league: women ? 'women' : 'men', periodReached: run.period, wallSeconds: (Date.now() - t0) / 1000,
  msPerStep: { p50: +times[Math.floor(times.length * 0.5)].toFixed(3), p99: +times[Math.floor(times.length * 0.99)].toFixed(3), max: +times[times.length - 1].toFixed(2) },
  scorecard: S,
};
const txt = JSON.stringify(res, null, 1);
if (out && out !== true) require('fs').writeFileSync(out, txt);
console.log(txt);
