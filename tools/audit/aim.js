// The aim (Match.Aim) and the ball at the rim (Ball._shootAim, _throughNet): thousands of shots thrown by the game's own
// ball from spots all round the floor (threes, mid-range, the free throw line, floaters, hooks, layups), by shooters from
// pure to poor, open and with a hand in the face, cold and hot, made and missed as often as the engine's odds say, each
// flown frame by frame and measured:
//  - the flight comes down through its crossing point at its entry angle;
//  - a make that touched nothing never comes within a ball's radius of the ring or the glass on its way through; nothing
//    ever goes through the ring's tube or the glass (a make's hops and rolls, a miss's carom all stay outside them);
//  - a miss never drops through the ring (it may dip into it and come back out: in and out);
//  - the ball goes on into the net at the speed it came through the ring (no jolt at the rim);
//  - the shares: clean makes by the shooter, the misses' touches, the entry angles by shooter and shot, air balls.
//   node tools/audit/aim.js [--n 300] [--json out.json]
// Used by check.js.
'use strict';
const { load, seedRandom } = require('./load');

const SHOTS = [
  // name, kind, distance (ft), angle off the lane's axis (deg), the engine's odds, three?
  ['top three', 'jumper', 24.5, 0, 0.37],
  ['wing three', 'catch_shoot', 23.9, 45, 0.38],
  ['corner three', 'catch_shoot', 22.2, 88, 0.39],
  ['long two', 'pullup', 19, -30, 0.41],
  ['elbow', 'jumper', 15.5, 35, 0.43],
  ['baseline', 'fadeaway', 13, -75, 0.4],
  ['free throw', 'ft', 15, 0, 0.77],
  ['floater', 'floater', 9, 10, 0.44],
  ['hook', 'hook', 6.5, 50, 0.5],
  ['layup', 'layup', 3, 30, 0.62],
];
const SHOOTERS = [
  // id, three, mid, ft, close, layup
  ['pure', 94, 92, 92, 70, 70], ['good', 82, 80, 84, 70, 72], ['average', 70, 70, 76, 68, 70], ['poor', 48, 52, 62, 60, 62],
];

function run(PBC, o) {
  const M = PBC.Match, U = M.U, Aim = M.Aim, B = M.Ball, R = B.R, RZ = B.RIM_Z;
  const n = (o && o.n) || 120;
  seedRandom(11);
  const W = { actors: {}, list: [], ball: null, time: 0, sound() {}, opts: {} };
  const hoop = new M.Hoop(1, null);
  const ball = new B(W);
  W.ball = ball;
  const RC = 0.75 + 0.3125 / 12, RE = R + 0.3125 / 12, zc = RZ - 0.3125 / 12, bxF = hoop.bx - R;
  const recs = [];
  const bad = { angle: [], cleanNear: [], ringThrough: [], boardThrough: [], missThrough: [], jolt: [] };
  for (const [sid, three, mid, ft, close, layup] of SHOOTERS) {
    const a = { id: 'aud-' + sid, look: { three, mid, ft, close, layup }, H: 6.5 };
    for (const [name, kind, dist, deg, pm0] of SHOTS) {
      // (a shooter's own odds: better than the average look, worse)
      const sk = kind === 'ft' ? (ft - 76) / 100 : kind === 'layup' || kind === 'hook' || kind === 'floater' ? (close - 68) / 150 : (three * 0.6 + mid * 0.4 - 70) / 120;
      for (let i = 0; i < n; i++) {
        const hand = kind === 'ft' ? 0 : Math.random() < 0.45 ? Math.random() : 0;
        const conf = (Math.random() - 0.5) * 1.4;
        const pm = U.clamp(pm0 + sk - hand * 0.1 + conf * 0.03, 0.05, 0.97), made = Math.random() < pm;
        const ang = Math.PI + deg * U.DEG, x0 = hoop.rx + Math.cos(ang) * dist, y0 = hoop.ry + Math.sin(ang) * dist;
        const z0 = kind === 'layup' ? 9.6 : kind === 'ft' ? 7.7 : kind === 'hook' ? 8.9 : 8.8 + Math.random() * 0.4;
        const rim = { x: hoop.rx, y: hoop.ry };
        // (a miss's rebound: off to a side of the rim, as the choreographer plans one)
        const ra = ang + (Math.random() - 0.5) * 2.6, rd = 3 + Math.random() * 7;
        const rb = { x: hoop.rx + Math.cos(ra) * rd, y: hoop.ry + Math.sin(ra) * rd, z: 9 + Math.random(), t: 0 };
        if ((rb.x - hoop.rx) > 0.6) rb.x = hoop.rx - 0.6;
        const ux = hoop.rx - x0, uy = hoop.ry - y0, ul = Math.hypot(ux, uy), cx = rb.x - hoop.rx, cy = rb.y - hoop.ry;
        const carom = made ? null : { f: (cx * ux + cy * uy) / ul, s: (-cx * uy + cy * ux) / ul };
        const aim = Aim.plan({ a, made, pm, conf, kind, p0: [x0, y0, z0], rim, side: 1, hand, carom });
        ball.state = 'flight'; ball.holder = null; ball.x = x0; ball.y = y0; ball.z = z0; ball.time = 0; W.time = 0;
        const res = made ? 'aim' : 'miss';
        const info = ball.shoot({ hoop, result: res, aim, rebound: made ? undefined : Object.assign({}, rb, { t: 5 }) });
        // (the carom's time: ~0.9 s off the rim, as a rebounder at the top of their jump would have it)
        if (!made) { ball.x = x0; ball.y = y0; ball.z = z0; ball.time = 0; ball.shoot({ hoop, result: res, aim, rebound: Object.assign({}, rb, { t: info.tContact + 0.9 }) }); }
        const segs = ball.segs, s0 = segs[0];
        // the entry angle where it came down to the rim's plane (a touch before it: the flight's angle there)
        const p = [0, 0, 0], v = [0, 0, 0];
        const Tp = s0.t1 - s0.t0;
        ball._segVel(s0, s0.t1, v);
        const touch = aim.touch, entry = Math.atan2(-v[2], Math.hypot(v[0], v[1])) / U.DEG;
        if (!touch && Math.abs(entry - aim.deg) > 0.6) bad.angle.push(name + ' ' + entry.toFixed(1) + ' vs ' + aim.deg.toFixed(1));
        // fly it frame by frame (120 per second): the ring, the glass, through the ring
        let minClean = Infinity, ringIn = 0, ringAt = '', boardIn = 0, droppedIn = false, dropAt = '', prevZ = null, prevR = null, joltV = 0;
        const tEnd = Math.min(segs[segs.length - 1].t1, info.tContact + 3);
        let segI = 0;
        for (let t = 0; t <= tEnd; t += 1 / 120) {
          while (segI < segs.length - 1 && t > segs[segI].t1) segI++;
          const s = segs[segI];
          ball._segPos(s, t, p);
          const dr = Math.hypot(p[0] - hoop.rx, p[1] - hoop.ry), gap = Math.hypot(dr - RC, p[2] - zc) - RE;
          // (a touch is the ball against the ring; into it by more than an inch is through the tube)
          if (gap < -1 / 12 && !s.orbit && -gap * 12 > ringIn) { ringIn = -gap * 12; ringAt = segI + '/' + segs.length + (s.rim ? ' rim' : s.board ? ' board' : s.net ? ' net' : s.shot ? ' flight' : '') + ' at ' + (t - s.t0).toFixed(3) + ' of ' + (s.t1 - s.t0).toFixed(3) + ' s'; }
          if (!touch && made) minClean = Math.min(minClean, gap);
          if (p[0] > bxF + 0.08 && Math.abs(p[1] - hoop.ry) < 3 && p[2] > RZ - 0.5 && p[2] < RZ + 3.5) boardIn = Math.max(boardIn, (p[0] - bxF) * 12);
          // (through the ring: its centre down past the ring by most of its radius while inside it; a miss can dip into the
          // ring and come back out, an in and out)
          if (prevZ != null && prevZ >= RZ - R * 0.8 && p[2] < RZ - R * 0.8 && dr < RC - R * 0.5 && !droppedIn) { droppedIn = true; dropAt = segI + '/' + segs.length + (s.orbit ? ' orbit' : s.rim ? ' rim' : s.board ? ' board' : s.net ? ' net' : '') + ' at ' + (t - s.t0).toFixed(2) + ' of ' + (s.t1 - s.t0).toFixed(2) + ' s, ' + (dr * 12).toFixed(1) + ' in out'; }
          prevZ = p[2]; prevR = dr;
        }
        // (no jolt going into the net: the net's first velocity against the flight's last)
        const ni = segs.findIndex(q => q.net);
        if (ni > 0) {
          const va = ball._segVel(segs[ni - 1], segs[ni - 1].t1, [0, 0, 0]), vb = ball._segVel(segs[ni], segs[ni].t0, [0, 0, 0]);
          joltV = Math.hypot(va[0] - vb[0], va[1] - vb[1], va[2] - vb[2]);
          // (a make off the rim comes into the net off its hop: only a clean one is checked for the same speed)
          if (aim.tail === 'clean' && joltV > 1.6) bad.jolt.push(name + ' ' + joltV.toFixed(1) + ' ft/s');
        }
        if (made && !touch && minClean < -0.01) bad.cleanNear.push(name + ' ' + (minClean * 12).toFixed(2) + ' in');
        if (ringIn > 0) bad.ringThrough.push(`${name} (${made ? 'make' : 'miss'} ${aim.tail}) ${ringIn.toFixed(1)} in: ${ringAt}`);
        if (boardIn > 1) bad.boardThrough.push(`${name} (${made ? 'make' : 'miss'} ${aim.tail}) ${boardIn.toFixed(1)} in`);
        if (!made && droppedIn) bad.missThrough.push(`${name} ${aim.tail}: ${dropAt}`);
        if (made && !droppedIn) bad.missThrough.push(`${name} a make that never dropped through (${aim.tail})`);
        recs.push({ sid, name, kind, made, tail: aim.tail, cat: aim.cat, touch, deg: aim.deg, arc: aim.arc, d: aim.d, l: aim.l, muD: aim.muD, sdD: aim.sdD, hand, conf, Tp, joltV });
      }
    }
  }
  return { recs, bad };
}

function summary(r) {
  const pct = (a, b) => (b ? Math.round(a / b * 1000) / 10 : 0);
  const S = { shooters: {}, shots: {}, tails: { made: {}, miss: {} }, bad: {} };
  for (const k in r.bad) S.bad[k] = { n: r.bad[k].length, eg: r.bad[k].slice(0, 4) };
  for (const x of r.recs) (S.tails[x.made ? 'made' : 'miss'][x.tail] = (S.tails[x.made ? 'made' : 'miss'][x.tail] || 0) + 1);
  for (const sid of new Set(r.recs.map(x => x.sid))) {
    const J = r.recs.filter(x => x.sid === sid && !/layup|hook|floater/.test(x.kind)), mk = J.filter(x => x.made), ms = J.filter(x => !x.made);
    const degs = J.map(x => x.deg).sort((a, b) => a - b);
    S.shooters[sid] = { arc: +J[0].arc.toFixed(1), degP10: +degs[Math.floor(degs.length * 0.1)].toFixed(1), degP90: +degs[Math.floor(degs.length * 0.9)].toFixed(1), cleanOfMakes: pct(mk.filter(x => x.tail === 'clean').length, mk.length), airOfShots: pct(ms.filter(x => x.tail === 'air').length, J.length), nearMissOfMisses: pct(ms.filter(x => x.tail === 'inOut' || x.tail === 'rattle').length, ms.length), shortOfMisses: pct(ms.filter(x => x.cat === 'front').length, ms.length), longOfMisses: pct(ms.filter(x => x.cat === 'back' || x.cat === 'board').length, ms.length) };
  }
  for (const nm of new Set(r.recs.map(x => x.name))) {
    const J = r.recs.filter(x => x.name === nm), mk = J.filter(x => x.made);
    const degs = J.map(x => x.deg).sort((a, b) => a - b);
    S.shots[nm] = { n: J.length, deg: +degs[Math.floor(degs.length / 2)].toFixed(1), flightS: +(J.map(x => x.Tp).sort((a, b) => a - b)[Math.floor(J.length / 2)]).toFixed(2), cleanOfMakes: pct(mk.filter(x => x.tail === 'clean').length, mk.length) };
  }
  // the hand in the face: its shots against the open ones (all shooters, jumpers)
  const Jh = r.recs.filter(x => !/layup|hook|floater|ft/.test(x.kind));
  const hi = Jh.filter(x => x.hand > 0.6), lo = Jh.filter(x => x.hand === 0);
  const mean = (a, k) => a.reduce((p, x) => p + x[k], 0) / (a.length || 1);
  // (where they aim, muD: the crossings themselves, given the result, are spread too wide to show a bias of an inch)
  S.hand = { contested: hi.length, open: lo.length, degContested: +mean(hi, 'deg').toFixed(1), degOpen: +mean(lo, 'deg').toFixed(1), depthContested: +mean(hi, 'muD').toFixed(2), depthOpen: +mean(lo, 'muD').toFixed(2) };
  const cold = Jh.filter(x => x.conf < -0.4), hot = Jh.filter(x => x.conf > 0.4);
  S.conf = { cold: cold.length, hot: hot.length, depthCold: +mean(cold, 'muD').toFixed(2), depthHot: +mean(hot, 'muD').toFixed(2) };
  return S;
}

module.exports = { run, summary };

if (require.main === module) {
  const { PBC } = load(3);
  const i = process.argv.indexOf('--n'), n = i > 0 ? +process.argv[i + 1] : 120;
  const t0 = Date.now();
  const r = run(PBC, { n });
  const S = summary(r);
  console.log(JSON.stringify(S, null, 1));
  console.log(`${r.recs.length} shots in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  const j = process.argv.indexOf('--json');
  if (j > 0) require('fs').writeFileSync(process.argv[j + 1], JSON.stringify({ S, recs: r.recs }, null, 1));
}
