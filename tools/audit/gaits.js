// Trial 5 proof: the gaits. Each gait at steady paces on four bodies, measured like a gait lab (cadence, step length,
// ground contact, flight, knee drive, arm swing, trunk lean, bob, which way the body travels against where it faces,
// feet crossing, each arm against the opposite leg); a blind naming test (each run named, with no label, by the gait
// whose runs on the OTHER bodies it is nearest to); and the scripted gait changes, every one watched by the game's own
// meters for pops, snaps and hip jumps.
//   node tools/audit/gaits.js [--json out.json]
// Used by check.js.
'use strict';
const { load } = require('./load');

const BODIES = [
  { name: 'guard 6-1 185', h: 73, lb: 185, g: 'm' },
  { name: 'wing 6-6 215', h: 78, lb: 215, g: 'm' },
  { name: 'center 7-0 255', h: 84, lb: 255, g: 'm' },
  { name: 'women 5-11 160', h: 71, lb: 160, g: 'f' },
];
// [gait, target speeds (ft/s), measured from, to (s)]
const PLAN = [
  ['walk', [3.5, 4.5, 5.5], 2, 5.5], ['jog', [8, 9.5, 11], 2, 5], ['run', [14, 16, 18], 2, 4.5], ['sprint', [22, 26, 30], 2.5, 4.5],
  ['backpedal', [5, 7, 9], 1.5, 4], ['slide', [4, 7, 10], 1.5, 4],
];
// what a viewer sees, for the naming test
const FEATURES = ['stepsPerS', 'stepH', 'duty', 'flightPct', 'hipFlexMax', 'kneeFlexMax', 'armSwingDeg', 'elbowDeg', 'leanDeg', 'bobIn', 'travelDeg', 'crossPct'];

function solo(PBC, body, id) {
  const M = PBC.Match;
  const w = { actors: {}, refs: [], onCourt: [[], []], opts: { ai: { moveSpeed: 50 } }, teamLook: () => ({}), sound() {}, time: 0 };
  const b = new M.Actor(w, { id: id || 'g', teamIdx: 0, height: body.h, weight: body.lb, hand: 'R', gender: body.g, look: { build: 0.5 }, speed: 80, agility: 80 }, 0, 'player');
  w.actors[b.id] = b; w.ball = { x: 0, y: 0, z: -50, state: 'dead', holder: null, rot: new Float64Array(9), hidden: true };
  return { w, b };
}
const corr = (a, b) => {
  const n = a.length; let ma = 0, mb = 0;
  for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
  ma /= n; mb /= n; let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; sab += x * y; saa += x * x; sbb += y * y; }
  return sab / Math.sqrt(saa * sbb || 1);
};
const mean = (a) => a.reduce((p, q) => p + q, 0) / Math.max(1, a.length);

/** each arm against the opposite leg, counted as the game's gait meter counts it (Debug.Meters._gait): where the gait
 *  swings the arms, is the arm forward the one opposite the thigh forward? The shoulders' flexion split (left minus
 *  right) against the hips' (right minus left), each about the middle of its swing over the last stride, with both past
 *  Tune.debug.gaitSyncBand of that swing's half-range */
function syncCounter(M) {
  const CH = M.Rig.CH, Tn = M.Tune.debug, U = M.U, dt = 1 / 60, NB = 120, bh = new Float32Array(NB), bf = new Float32Array(NB);
  const c = { n: 0, ok: 0, missAt: [], bi: 0, bn: 0 };
  c.push = (b, cls, t) => {
    const q = b.sk.pose, dh = q[CH.lShF] - q[CH.rShF], df = q[CH.rHipF] - q[CH.lHipF];
    bh[c.bi] = dh; bf[c.bi] = df; c.bi = (c.bi + 1) % NB; c.bn = Math.min(NB, c.bn + 1);
    const cyc = b.gaitDbg && b.gaitDbg.cycle > 0 ? b.gaitDbg.cycle : 1, nW = Math.min(NB, Math.round(U.clamp(cyc, 0.4, 1.9) / dt));
    if (c.bn < nW || !cls || cls === 'stand' || cls === 'slide' || b.speed < 3 || (b.gaitArmK || 0) < Tn.gaitSyncArmK) return;
    let h0 = Infinity, h1 = -Infinity, f0 = Infinity, f1 = -Infinity;
    for (let k = 1; k <= nW; k++) { const j = (c.bi - k + NB) % NB; if (bh[j] < h0) h0 = bh[j]; if (bh[j] > h1) h1 = bh[j]; if (bf[j] < f0) f0 = bf[j]; if (bf[j] > f1) f1 = bf[j]; }
    const xh = dh - (h0 + h1) / 2, xf = df - (f0 + f1) / 2, rh = (h1 - h0) / 2, rf = (f1 - f0) / 2;
    if (rh > Tn.gaitSyncArmDeg * U.DEG && rf > Tn.gaitSyncLegDeg * U.DEG && Math.abs(xh) > Tn.gaitSyncBand * rh && Math.abs(xf) > Tn.gaitSyncBand * rf) {
      c.n++; if (xh * xf > 0) c.ok++; else if (c.missAt.length < 12) c.missAt.push(+t.toFixed(2));
    }
  };
  c.pct = () => (c.n ? +(c.ok / c.n * 100).toFixed(2) : null);
  return c;
}

/** one gait at a steady pace: the gait lab's numbers */
function measureGait(PBC, body, gait, spd, T0, T1) {
  const M = PBC.Match, U = M.U, RG = M.Rig, J = RG.J, CH = RG.CH, D = Math.PI / 180, dt = 1 / 60, Tn = M.Tune.debug;
  const { w, b } = solo(PBC, body);
  const side = gait === 'backpedal' || gait === 'slide';
  const sync = syncCounter(M), clsOf = gait === 'slide' ? 'slide' : gait === 'backpedal' ? 'back' : 'fwd';
  b.place(10, 25, 0); b.setStance(side ? 'defense' : 'stand');
  const go = (dx, dy, o) => b.moveTo(b.x + dx, b.y + dy, Object.assign({ speed: spd / b.goalK }, o || {}));
  if (gait === 'backpedal') { b.setFace(0); go(-400, 0, { face: 0 }); } else if (gait === 'slide') { b.setFace(0); go(0, 400, { face: 0 }); } else go(600, 0);
  const POPJ = [J.L_HD, J.R_HD, J.L_TOE, J.R_TOE, J.HT, J.L_EL, J.R_EL, J.L_KN, J.R_KN];
  const S = { sh: [[], []], hip: [[], []], kn: [[], []], el: [[], []], lean: [], spd: [], trav: [], plant: [0, 0], both: 0, n: 0, steps: 0, tFirst: null, tLast: 0, cross: 0, pops: 0, stepZ: [], landPitch: [] };
  let prevSt = null, zSeg = [], t = 0;
  const loc = [];
  while (t < T1) {
    t += dt; w.time += dt;
    if (side) b.setFace(0);
    b.update(dt, w.time); b.solve();
    const P = b.sk.P, q = b.sk.pose, c = Math.cos(b.facing), s = Math.sin(b.facing);
    // (pops as the game's meter counts them: a joint's second difference in the body frame)
    const cur = new Float64Array(POPJ.length * 3);
    for (let i = 0; i < POPJ.length; i++) { const j = POPJ[i] * 3, rx = P[j] - b.x, ry = P[j + 1] - b.y; cur[i * 3] = rx * s - ry * c; cur[i * 3 + 1] = rx * c + ry * s; cur[i * 3 + 2] = P[j + 2]; }
    loc.push(cur); if (loc.length > 3) loc.shift();
    sync.push(b, t >= T0 ? clsOf : null, t);
    if (t < T0) { prevSt = b.feet.map(f => f.state); continue; }
    S.n++;
    if (loc.length === 3) for (let i = 0; i < POPJ.length; i++) {
      const k = i * 3, am = Math.hypot(loc[2][k] - 2 * loc[1][k] + loc[0][k], loc[2][k + 1] - 2 * loc[1][k + 1] + loc[0][k + 1], loc[2][k + 2] - 2 * loc[1][k + 2] + loc[0][k + 2]) / (dt * dt);
      if (am > Tn.jointSnapFtps2) S.pops++;
    }
    for (let sd = 0; sd < 2; sd++) {
      const pre = sd ? 'r' : 'l';
      S.sh[sd].push(q[CH[pre + 'ShF']] / D); S.hip[sd].push(q[CH[pre + 'HipF']] / D); S.kn[sd].push(q[CH[pre + 'Knee']] / D); S.el[sd].push(q[CH[pre + 'ElF']] / D);
      if (b.feet[sd].state === 'plant') S.plant[sd]++;
      if (prevSt && prevSt[sd] !== 'plant' && b.feet[sd].state === 'plant') {
        S.steps++; if (S.tFirst == null) S.tFirst = t; S.tLast = t;
        // (the foot's pitch as it lands: + heel up, toes first)
        S.landPitch.push(b.feet[sd].pitch / D);
        if (zSeg.length) { S.stepZ.push((Math.max(...zSeg) - Math.min(...zSeg)) * 12); zSeg = []; }
      }
    }
    if (b.feet[0].state !== 'plant' && b.feet[1].state !== 'plant') S.both++;
    zSeg.push(P[J.PEL * 3 + 2]);
    // trunk lean the way he goes (pelvis to neck, + forward), which way he goes against where he faces
    const tx = P[J.NCK * 3] - P[J.PEL * 3], ty = P[J.NCK * 3 + 1] - P[J.PEL * 3 + 1], tz = P[J.NCK * 3 + 2] - P[J.PEL * 3 + 2];
    const vs = Math.hypot(b.vx, b.vy), mx = vs > 0.5 ? b.vx / vs : c, my = vs > 0.5 ? b.vy / vs : s;
    S.lean.push(Math.atan2(tx * mx + ty * my, tz) / D);
    S.spd.push(b.speed);
    S.trav.push(Math.abs(U.wrapPi(Math.atan2(b.vy, b.vx) - b.facing)) / D);
    // feet crossing: the left ball of the foot to the right of the right one, in the body frame
    const lx = (P[J.L_BALL * 3] - b.x) * s - (P[J.L_BALL * 3 + 1] - b.y) * c, rx = (P[J.R_BALL * 3] - b.x) * s - (P[J.R_BALL * 3 + 1] - b.y) * c;
    if (lx > rx) S.cross++;
    prevSt = b.feet.map(f => f.state);
  }
  const v = mean(S.spd), cad = S.steps > 2 ? (S.steps - 1) / (S.tLast - S.tFirst) : S.steps / (S.n * dt), rng = (a) => Math.max(...a) - Math.min(...a);
  const med = (a) => { const q = a.slice().sort((x, y) => x - y); return q[Math.floor(q.length / 2)] || 0; };
  // each arm against the opposite leg, as a gait lab measures it: shoulder flexion against the other side's hip flexion
  // (their correlation, the phase of the best match, and, with both well off their middle, how often the arm is forward
  // while the opposite thigh is forward)
  const per = Math.max(2, Math.round(2 / cad / dt));
  let best = -2, lag = 0;
  for (let L = -Math.floor(per / 2); L <= Math.floor(per / 2); L++) {
    const a = [], a2 = [], c2 = [], c3 = [];
    for (let i = Math.max(0, -L); i < S.sh[0].length && i + L < S.sh[0].length; i++) { a.push(S.sh[0][i]); c2.push(S.hip[1][i + L]); a2.push(S.sh[1][i]); c3.push(S.hip[0][i + L]); }
    const cc = (corr(a, c2) + corr(a2, c3)) / 2; if (cc > best) { best = cc; lag = L; }
  }
  const agree = (A, B) => {
    const ma = mean(A), mb = mean(B), ra = rng(A) / 2, rb = rng(B) / 2; let n = 0, ok = 0;
    for (let i = 0; i < A.length; i++) { const x = A[i] - ma, y = B[i] - mb; if (Math.abs(x) > 0.25 * ra && Math.abs(y) > 0.25 * rb) { n++; if (x * y > 0) ok++; } }
    return n ? ok / n * 100 : null;
  };
  const aL = agree(S.sh[0], S.hip[1]), aR = agree(S.sh[1], S.hip[0]);
  return {
    body: body.name, gait, target: spd, speed: +v.toFixed(1), H: b.H,
    stepsPerS: +cad.toFixed(2), stepFt: +(v / cad).toFixed(2), stepH: +(v / cad / b.H).toFixed(3),
    duty: +((S.plant[0] + S.plant[1]) / 2 / S.n).toFixed(2), flightPct: +(S.both / S.n * 100).toFixed(0),
    hipFlexMax: +Math.max(...S.hip[0], ...S.hip[1]).toFixed(0), kneeFlexMax: +Math.max(...S.kn[0], ...S.kn[1]).toFixed(0),
    armSwingDeg: +((rng(S.sh[0]) + rng(S.sh[1])) / 2).toFixed(0), elbowDeg: +((mean(S.el[0]) + mean(S.el[1])) / 2).toFixed(0),
    leanDeg: +mean(S.lean).toFixed(1), bobIn: +med(S.stepZ).toFixed(2), travelDeg: +mean(S.trav).toFixed(0), crossPct: +(S.cross / S.n * 100).toFixed(0),
    landPitchDeg: +med(S.landPitch).toFixed(1),
    armLegR: +((corr(S.sh[0], S.hip[1]) + corr(S.sh[1], S.hip[0])) / 2).toFixed(3), armLegLagDeg: Math.round(lag / per * 360),
    armOppositePct: aL == null || aR == null ? null : +((aL + aR) / 2).toFixed(1), armOppositeGamePct: sync.pct(), armOppositeGameFrames: sync.n, pops: S.pops,
  };
}

/** every gait on every body at every pace */
function signatures(PBC) {
  const rows = [];
  for (const body of BODIES) for (const [g, sps, T0, T1] of PLAN) for (const s of sps) rows.push(measureGait(PBC, body, g, s, T0, T1));
  return rows;
}

/** the blind naming test: features z-scored over all runs, each run named by the nearest gait centroid of the other
 *  bodies' runs (leave one body out) */
function blind(rows, feats) {
  feats = feats || FEATURES;
  const gaits = [...new Set(rows.map(r => r.gait))];
  const mu = feats.map(k => mean(rows.map(r => r[k]))), sd = feats.map((k, i) => Math.sqrt(mean(rows.map(r => (r[k] - mu[i]) ** 2))) || 1);
  const z = (r) => feats.map((k, i) => (r[k] - mu[i]) / sd[i]);
  const conf = {}; for (const g of gaits) { conf[g] = {}; for (const h of gaits) conf[g][h] = 0; }
  const wrong = [];
  let ok = 0;
  for (const r of rows) {
    const train = rows.filter(q => q.body !== r.body), zr = z(r);
    let best = null, bd = Infinity;
    for (const g of gaits) {
      const tg = train.filter(q => q.gait === g).map(z), c = feats.map((_, i) => mean(tg.map(q => q[i])));
      const d = Math.hypot(...zr.map((x, i) => x - c[i]));
      if (d < bd) { bd = d; best = g; }
    }
    conf[r.gait][best]++;
    if (best === r.gait) ok++; else wrong.push(`${r.body} ${r.gait} at ${r.speed} ft/s named ${best}`);
  }
  return { ok, n: rows.length, conf, wrong };
}

/** the scripted gait changes (the Lab's own and more), each one a script on a single body */
function transitions(U) {
  const R = [];
  const add = (name, stance, T, script) => R.push({ name, stance, T, script });
  // walk, jog, run, sprint and back down (the Lab's ramp)
  add('speed ramp 0 to 26 ft/s and back', 'stand', 15, { tick(c, t) {
    if (Math.abs(t * 10 - Math.round(t * 10)) > 1e-6) return;
    const v = t < 1 ? 0 : t < 8 ? (t - 1) / 7 * 26 : t < 10 ? 26 : t < 14 ? (14 - t) / 4 * 26 : 0;
    if (v < 0.4) c.b.stop(); else c.b.moveTo(c.b.x + 200, 25, { speed: v / c.b.goalK });
  } });
  add('walk into an all-out sprint, then stop', 'stand', 7, { tick(c, t) {
    if (Math.abs(t - 0.2) < 1e-6) c.b.moveTo(400, 25, { speed: 4.5 / c.b.goalK });
    if (Math.abs(t - 2.0) < 1e-6) c.b.moveTo(400, 25, { speed: 30 / c.b.goalK });
    if (Math.abs(t - 4.5) < 1e-6) c.b.stop();
  } });
  // a defender runs forward with his man, who turns back: he stops and backpedals facing him
  add('run with his man, then backpedal', 'defense', 6, {
    init(c) { c.b.setFace(() => 0); c.b.faceLock = true; c.b.track(() => c.tgt); c.tgt.x = c.b.x + 3; },
    tick(c, t) { c.tgt.vx = t < 0.3 ? 0 : t < 2.5 ? 10 : -9; },
  });
  // backpedalling with his man, who blows by: he turns and runs
  add('backpedal, then turn and run', 'defense', 6, {
    init(c) { c.b.setFace(() => 0); c.b.faceLock = true; c.b.track(() => c.tgt); c.tgt.x = c.b.x - 3; },
    tick(c, t) { c.tgt.vx = t < 0.3 ? 0 : t < 2.5 ? -8 : -22; },
  });
  // sliding with his man, who blows by: he opens up (a crossover step) and sprints
  add('slide, then open up and sprint', 'defense', 6, {
    init(c) { c.b.setFace(() => 0); c.b.faceLock = true; c.b.track(() => c.tgt); },
    tick(c, t) { c.tgt.vy = t < 0.3 ? 0 : t < 2.5 ? 7 : 22; },
  });
  add('jog, slide across, jog on', 'defense', 6.5, {
    init(c) { c.b.setFace(() => 0); c.b.faceLock = true; c.b.track(() => c.tgt); c.tgt.x = c.b.x + 2; },
    tick(c, t) { if (t < 0.3) { c.tgt.vx = 0; c.tgt.vy = 0; } else if (t < 2.2) { c.tgt.vx = 9; c.tgt.vy = 0; } else if (t < 4.2) { c.tgt.vx = 0; c.tgt.vy = 7; } else { c.tgt.vx = 9; c.tgt.vy = 0; } },
  });
  add('stop and go: walk, jog, run, stop, run, stop', 'stand', 9, { tick(c, t) {
    const k = Math.round(t * 60), at = (s) => k === Math.round(s * 60);
    if (at(0.2)) c.b.moveTo(c.b.x + 200, 25, { speed: 6 / c.b.goalK });
    if (at(1.5)) c.b.moveTo(c.b.x + 200, 25, { speed: 14 / c.b.goalK });
    if (at(3.0)) c.b.stop();
    if (at(4.5)) c.b.moveTo(c.b.x + 200, 25, { speed: 22 / c.b.goalK });
    if (at(6.5)) c.b.stop();
  } });
  // a slide and a backpedal out of the defensive stance, led (with the man's speed) and followed (a spot that moves)
  add('slide out of the stance', 'defense', 3, {
    init(c) { c.b.setFace(() => 0); c.b.faceLock = true; c.b.track(() => c.tgt); },
    tick(c, t) { c.tgt.vy = 5 * U.smooth(t / 0.5); },
  });
  add('backpedal out of the stance', 'defense', 3, {
    init(c) { c.b.setFace(() => 0); c.b.faceLock = true; c.b.track(() => c.tgt); },
    tick(c, t) { c.tgt.vx = -6 * U.smooth(t / 0.5); },
  });
  add('slide out of the stance, following a spot', 'defense', 3, {
    init(c) { c.b.setFace(() => 0); c.b.faceLock = true; c.b.track(() => c.tgt); },
    tick(c, t) { c.tgt.y += 5 / 60 * U.smooth(t / 0.5); },
  });
  add('backpedal out of the stance, following a spot', 'defense', 3, {
    init(c) { c.b.setFace(() => 0); c.b.faceLock = true; c.b.track(() => c.tgt); },
    tick(c, t) { c.tgt.x -= 6 / 60 * U.smooth(t / 0.5); },
  });
  return R;
}

/** one scripted gait change, watched by the game's own meters; also where the feet cross (for the crossover step:
 *  the frames, in the body's starting frame, with the right foot over on the left of the left one and in front of it) */
function runTransition(PBC, sc, body) {
  const M = PBC.Match, J = M.Rig.J, dt = 1 / 60;
  const { w, b } = solo(PBC, body || BODIES[1]);
  b.place(0, 25, 0); b.setStance(sc.stance);
  const mt = new M.Debug.Meters(() => ({ people: [b], ball: w.ball, time: w.time, view: null, dt, countAll: true }));
  const tgt = { x: b.x, y: b.y, vx: 0, vy: 0 }, ctx = { b, tgt, t: 0 };
  sc.script.init && sc.script.init(ctx);
  const f0 = b.facing, c0 = Math.cos(f0), s0 = Math.sin(f0);
  let crossFrames = 0, crossInFront = 0, was = false;
  const crossAt = [];
  const sync = syncCounter(M);
  for (let t = 0; t < sc.T; t += dt) {
    ctx.t = t; w.time += dt;
    sc.script.tick && sc.script.tick(ctx, t);
    tgt.x += tgt.vx * dt; tgt.y += tgt.vy * dt;
    b.update(dt, w.time); b.solve(); mt.frame();
    const P = b.sk.P, lat = (j) => -((P[j * 3] - b.x) * s0 - (P[j * 3 + 1] - b.y) * c0), fwd = (j) => (P[j * 3] - b.x) * c0 + (P[j * 3 + 1] - b.y) * s0;
    // (+lat: to his left at the start; the right ball of the foot left of the left one is the right foot crossed over)
    sync.push(b, mt.gaitClass(b, w.ball), t);
    const x = lat(J.R_BALL) > lat(J.L_BALL) + 0.1;
    if (x) { crossFrames++; if (fwd(J.R_BALL) > fwd(J.L_BALL)) { crossInFront++; if (!was) crossAt.push(+t.toFixed(2)); } }
    was = x;
  }
  const sc2 = mt.summary();
  return {
    name: sc.name, T: sc.T, pops: sc2.motion.jointSnapsBy, popN: Object.values(sc2.motion.jointSnapsBy).reduce((p, q) => p + q, 0),
    spinePops: sc2.body.spinePopsBy.length, hipJumps: sc2.weight.hipJumps, accelSnaps: mt.S.accelSnaps, turnSnaps: mt.S.wt.turnSnaps,
    slideWorstIn: sc2.feet.slideWorst, sinkPct: sc2.feet.sinkPctPlayerFrames, hoverPct: sc2.feet.hoverPctPlantFrames, limitFrames: sc2.limits.badFrames,
    crossFrames, crossInFront, crossAt, armFrames: sync.n, armOppositePct: sync.pct(), armMissAt: sync.missAt,
  };
}

module.exports = { BODIES, PLAN, FEATURES, measureGait, signatures, blind, transitions, runTransition };

if (require.main === module) {
  const { PBC } = load(3);
  const rows = signatures(PBC);
  const pad = (x, n) => String(x).padEnd(n);
  console.log(pad('body', 16) + pad('gait', 10) + ['ft/s', 'steps/s', 'step/H', 'contact', 'flight%', 'hipF', 'knee', 'arm', 'elbow', 'lean', 'bob in', 'travel', 'cross%', 'land', 'arm-leg r', 'lag', 'opp%', 'opp% g', 'pops'].map(k => pad(k, 9)).join(''));
  for (const r of rows) console.log(pad(r.body, 16) + pad(r.gait, 10) + [r.speed, r.stepsPerS, r.stepH, r.duty, r.flightPct, r.hipFlexMax, r.kneeFlexMax, r.armSwingDeg, r.elbowDeg, r.leanDeg, r.bobIn, r.travelDeg, r.crossPct, r.landPitchDeg, r.armLegR, r.armLegLagDeg, r.armOppositePct, r.armOppositeGamePct, r.pops].map(k => pad(k, 9)).join(''));
  const bl = blind(rows);
  console.log(`\nblind naming (leave one body out): ${bl.ok}/${bl.n}` + (bl.wrong.length ? ' | missed: ' + bl.wrong.join('; ') : ''));
  const fwd = rows.filter(r => ['walk', 'jog', 'run', 'sprint'].includes(r.gait));
  const bl2 = blind(fwd, FEATURES.filter(k => k !== 'travelDeg' && k !== 'crossPct'));
  console.log(`forward gaits by their form alone: ${bl2.ok}/${bl2.n}` + (bl2.wrong.length ? ' | missed: ' + bl2.wrong.join('; ') : ''));
  const tr = transitions(PBC.Match.U).map(sc => runTransition(PBC, sc));
  console.log('\ngait changes:');
  for (const r of tr) console.log(`  ${pad(r.name, 50)} pops ${r.popN} spine ${r.spinePops} hip jumps ${r.hipJumps} snaps ${r.accelSnaps + r.turnSnaps} slide ${r.slideWorstIn} in sink ${r.sinkPct}% hover ${r.hoverPct}% limits ${r.limitFrames}` + ` arms opposite ${r.armOppositePct}% of ${r.armFrames}` + (r.armMissAt.length ? ` (misses at ${r.armMissAt.join(', ')})` : '') + (r.crossAt.length ? ` | the right foot crossed over in front of the left at ${r.crossAt.join(', ')} s` : ''));
  const i = process.argv.indexOf('--json');
  if (i > 0) require('fs').writeFileSync(process.argv[i + 1], JSON.stringify({ rows, blind: bl, blindForward: bl2, transitions: tr }, null, 1));
}
