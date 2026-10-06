// Trial 11 proof: loose balls run down by hand. Random loose balls (thrown loose from 4 to 20 ft away at 2 to 14 ft/s along
// the floor and -2 to 14 ft/s up, from 1 to 7 ft high), each run down by one player who was already on the move (0 to 14
// ft/s some way) with the game's own Director.runDown (rebound.js: the gather planned on the ball's own way, a run onto it
// and a stop a reach short of it, a catch at a bounce or a pick-up off the floor, cut off from beside its way when it rolls
// on): how many are taken by hand within 5 s, how soon, both hands' gap to the ball as it is taken, their speed then, and the
// joint pops (Meters) from the moment it is loose to half a second after the take.
//   node tools/audit/chase.js [N (40)] [--json out.json]
// Used by check.js (a short run).
'use strict';
const { load, seedRandom } = require('./load');
const { world } = require('./shot');

function run(PBC, N) {
  const M = PBC.Match, J = M.Rig.J, dt = 1 / 60, T0 = 0.6;
  let rs = 12345;
  const rnd = () => ((rs = (rs * 1103515245 + 12345) >>> 0) / 4294967296);
  const out = [];
  for (let i = 0; i < N; i++) {
    seedRandom(1000 + i);
    const h = 72 + Math.floor(rnd() * 13);
    const { W, a, ball } = world(PBC, [{ team: 0, h }, { team: 1, h: 76 }]);
    const p = a[0], o = a[1];
    const clock = { t: 0 }, ev = [];
    const at = (t, fn) => { ev.push({ t, fn }); ev.sort((x, y) => x.t - y.t); };
    const D = M.GlassLab.director(W, () => clock.t, at);
    o.place(80, 45, 0); o.setStance('stand');
    const d0 = 4 + rnd() * 16, ang = rnd() * Math.PI * 2, px = 47, py = 25;
    p.place(px, py, rnd() * Math.PI * 2); p.setStance('ready');
    const va = rnd() * Math.PI * 2, vh = 2 + rnd() * 12, vz = rnd() * 16 - 2, z0 = 1 + rnd() * 6;
    ball.placeAt(px + Math.cos(ang) * d0, py + Math.sin(ang) * d0, z0);
    const pv = rnd() * 14, pa = rnd() * Math.PI * 2;
    let tTake = null, gap = null, spAt = null, kind = null, pops = 0;
    const mt = new M.Debug.Meters(() => ({ people: W.list, ball, time: W.time, view: null, dt, countAll: true }));
    at(0.01, () => { p.moveTo(px + Math.cos(pa) * 30, py + Math.sin(pa) * 30, { speed: Math.max(1, pv), face: 'move', stance: 'ready' }); });
    at(T0, () => { ball.loose([Math.cos(va) * vh, Math.sin(va) * vh, vz]); });
    const pk = {};
    const tick = () => {
      if (ball.holder) return;
      if (D.runDown(p, pk)) { tTake = clock.t - T0; return; }
      at(clock.t + (pk.t != null ? 1 / 60 : 0.05), tick);
    };
    at(T0 + 0.12, tick);
    for (let n = 1; n * dt <= T0 + 5; n++) {
      const t = Math.round(n * dt * 1200) / 1200;
      clock.t = t; W.time = t;
      while (ev.length && ev[0].t <= t + 1e-9) ev.shift().fn();
      for (const x of a) x.update(dt, t);
      ball.update(dt, t);
      for (const x of a) x.solve();
      mt.frame();
      const tr = mt.tr.get(p);
      if (t > T0 && tr && tr.popJ && (tTake == null || t - T0 - tTake < 0.5)) pops++;
      if (tTake != null && gap == null) {
        spAt = p.speed; kind = pk.low ? 'pick' : 'catch';
        const P = p.sk.P, pal = M.Tune.debug.palmOffsetH * p.H;
        const g = (j) => (Math.hypot(P[j * 3] - ball.x, P[j * 3 + 1] - ball.y, P[j * 3 + 2] - ball.z) - M.Ball.R - pal) * 12;
        gap = Math.max(g(J.L_HD), g(J.R_HD));
      }
    }
    out.push({ i, h, d0: +d0.toFixed(1), vh: +vh.toFixed(1), vz: +vz.toFixed(1), pv: +pv.toFixed(1), tTake: tTake == null ? null : +tTake.toFixed(2), gapIn: gap == null ? null : +gap.toFixed(1), speedAt: spAt == null ? null : +spAt.toFixed(1), kind, pops });
  }
  return out;
}

function summary(rows) {
  const ok = rows.filter(r => r.tTake != null), v = (k) => ok.map(r => r[k]).sort((x, y) => x - y);
  const q = (arr, f) => (arr.length ? arr[Math.min(arr.length - 1, Math.floor(arr.length * f))] : null);
  return { balls: rows.length, taken: ok.length, catches: ok.filter(r => r.kind === 'catch').length, pickups: ok.filter(r => r.kind === 'pick').length,
    takeS: { p50: q(v('tTake'), 0.5), p90: q(v('tTake'), 0.9), max: q(v('tTake'), 1) }, gapIn: { p50: q(v('gapIn'), 0.5), max: q(v('gapIn'), 1) },
    speedAtFtps: { p50: q(v('speedAt'), 0.5), max: q(v('speedAt'), 1) }, pops: rows.reduce((s, r) => s + r.pops, 0) };
}

module.exports = { run, summary };

if (require.main === module) {
  const { PBC } = load(3);
  const N = +(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 40);
  const rows = run(PBC, N);
  for (const r of rows) console.log(`ball ${String(r.i).padStart(2)}: ${r.d0} ft away, ${r.vh} ft/s along the floor, ${r.vz} up; they were going ${r.pv} ft/s: ` + (r.tTake == null ? 'not taken in 5 s' : `${r.kind === 'pick' ? 'picked up' : 'caught'} ${r.tTake} s on, hands within ${r.gapIn} in, going ${r.speedAt} ft/s`) + `; pops ${r.pops}`);
  const S = summary(rows);
  console.log(JSON.stringify(S));
  const i = process.argv.indexOf('--json');
  if (i > 0) require('fs').writeFileSync(process.argv[i + 1], JSON.stringify({ summary: S, rows }, null, 1));
}
