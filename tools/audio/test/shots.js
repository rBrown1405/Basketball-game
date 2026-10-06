#!/usr/bin/env node
// Trial 2: "swish, rim-in and air ball are clearly different" (and every other way a ball meets the hoop).
// A court of its own (the game's view: its ball physics, hoops and broadcast camera, no players), the court's audio
// listening to it exactly as in a live game, and shots with forced results from the same spot, one after another:
// a swish, in off the front rim, rolling round the rim and in, off the glass and in, an air ball, misses off the
// front, the back and the side of the rim, a rattle, off the glass, a dunk and a block. For each one: every court
// sound it made with its time from the release (from the bus trace), and at the hoop (from where the ball gets there
// to 0.4 s later) how much of the sound is the rim's metal (energy within 4% of the rim's modes, against the rest),
// how much is the net (3-9 kHz noise) and the level.
// Writes shots_result.txt, shots_all.wav (every shot, 3.5 s apart) and swish_rimin_airball.wav (the three to compare).
//   node tools/audio/test/shots.js [--seed 21] [--out audit/audio2]
'use strict';
const fs = require('fs'), path = require('path');
const T = require('./common.js');
const o = T.args({ seed: 21, out: 'audit/audio2' });
const SHOTS = [
  ['swish', { result: 'swish' }],
  ['in off the rim', { result: 'rim_in', roll: false }],
  ['rolls round the rim and in', { result: 'rim_in', roll: true }],
  ['off the glass and in', { result: 'bank' }],
  ['air ball', { result: 'airball' }],
  ['front iron miss', { result: 'miss', miss: { contact: 'front' } }],
  ['back iron miss', { result: 'miss', miss: { contact: 'back' } }],
  ['side of the rim miss', { result: 'miss', miss: { contact: 'left' } }],
  ['rattle and out', { result: 'miss', miss: { contact: 'front', rattle: true } }],
  ['off the glass, no good', { result: 'miss', miss: { contact: 'board' } }],
  ['dunk', { dunk: true }],
  ['block', { block: true }],
];
(async () => {
  const browser = await T.launch(o);
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.addInitScript(T.TAP);
  await T.openGame(page, o.repo, o.seed, { commentary: false, voice: false, arenaSound: false, volume: 0.8, simSpeed: 1 });
  await page.waitForTimeout(1500);
  const r = await page.evaluate(async (SHOTS) => {
    const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    // the live game stops (its loop and its sound); a court of our own from the same game
    const D = PBC.UI._liveDebug, LG = D.state();
    D.manual();
    if (LG.mx) LG.mx.setVolume(0);
    const M = PBC.Match, cv = document.createElement('canvas'); cv.width = 1280; cv.height = 720;
    const view = new M.View(cv, PBC.UI.matchContext(LG.S, LG.g), { quality: 'low', models: '2d', camera: 'broadcast' });
    PBC.AudioBus.reset(); PBC.AudioRandom.seed(424242);
    PBC.AudioConfig.debug.recorderSeconds = 60;   // (the mixer's recorder keeps the whole run)
    const mx = PBC.AudioMixer.create({ volume: 0.7 }); mx.unlock();
    PBC.AudioBus.setAudioClock(() => (mx.ctx ? mx.ctx.currentTime : null));
    // (the officials jog about the empty court: their footsteps are left out of this test)
    PBC.AudioConfig.court.step.refs = 0;
    const ca = PBC.CourtAudio.create({ mx, view: () => view, speed: () => 1, teams: [LG.teams[0], LG.teams[1]] });
    view.onSound = (n, v, at, who) => ca.sound(n, v, at, who);
    view.onCue = (t, a, d) => ca.cue(t, a, d);
    await sleep(600);
    PBC.AudioBus.traceStart({ anim: false });
    let last = performance.now();
    // (the game time each frame reached, against the audio clock: a busy page runs the court slower than real time)
    const tm = [];
    const iv = setInterval(() => { const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now; view.update(dt); ca.frame(dt); mx.update(); tm.push([view.time, mx.now()]); }, 16);
    const audioAt = (g) => { for (const [gt, at] of tm) if (gt >= g) return at; return tm.length ? tm[tm.length - 1][1] : 0; };
    await sleep(400);
    const hoop = view.hoops[1], b = view.ball, out = [];
    for (const [label, sh] of SHOTS) {
      const a0 = mx.now(), g0 = view.time;
      let tHoop = null;
      if (sh.dunk) {
        // as the court throws one down (js/match/choreo.js): the ball from above the rim through it in 0.12 s
        b.placeAt(hoop.rx - 1.2, hoop.ry, 11.2);
        const p0 = [b.x, b.y, b.z], pr0 = [hoop.rx, hoop.ry, 10.25];
        const segs = [M.Ball.seg(b.time, p0, M.Ball.aim(p0, pr0, 0.12, 0), 0.12, 0)];
        b.flight(segs, null); b._throughNet(segs, [hoop.rx, hoop.ry, 10.0], segs[0].t1, hoop, {}, true);
        b.shotHoop = hoop; view.sound('dunk', 1, b, null);
        tHoop = 0.12;
      } else if (sh.block) {
        // as the court blocks one: the ball meets the blocker's hand 0.16 s after it leaves, then deflects to the floor
        b.placeAt(hoop.rx - 9, hoop.ry, 8);
        const p0 = [b.x, b.y, b.z], pHit = [p0[0] + 2, p0[1], p0[2] + 1.4];
        const s1 = M.Ball.seg(b.time, p0, M.Ball.aim(p0, pHit, 0.16), 0.16), tgt = [p0[0] - 10, p0[1] + 4, 1];
        const s2 = M.Ball.seg(s1.t1, pHit, M.Ball.aim(pHit, tgt, 0.9), 0.9); s2.bounce = true;
        const segsB = [s1, s2]; b._bounceTail(segsB);
        b.flight(segsB, null); b.shotCue = { ev: { t: 0 }, blocked: true };
        view.sound('block', 1, b, null);
        tHoop = 0.16;
      } else {
        b.placeAt(hoop.rx - 17, hoop.ry + 3, 8.2);
        const q = b.shoot(Object.assign({ hoop, rebound: { x: hoop.rx - 7, y: hoop.ry + 5, z: 1, t: b.time + 2.2, floor: true } }, sh));
        tHoop = q.tContact - g0;
      }
      out.push({ label, a0, g0, tHoop });
      await sleep(3500);
    }
    clearInterval(iv);
    await sleep(300);
    const tr = PBC.AudioBus.traceStop().filter((e) => e.type.startsWith('court.'));
    // per shot: its court sounds, and at the hoop: the rim's metal, the net, the level (from the mixer's own
    // recording, every sample on the audio clock)
    const rec = await mx.recording(), sr = rec.sampleRate;
    const grab = (t0, w) => {
      const i0 = Math.floor((t0 - rec.start) * sr), n = Math.floor(w * sr), x = new Float32Array(n);
      for (let j = 0; j < n; j++) { const i = i0 + j; if (i >= 0 && i < rec.L.length) x[j] = (rec.L[i] + rec.R[i]) / 2; }
      return x;
    };
    const spec = (x) => {
      const n = 16384, re = new Float64Array(n), im = new Float64Array(n);
      for (let i = 0; i < Math.min(n, x.length); i++) re[i] = x[i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / Math.min(n, x.length)));
      for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { const t = re[i]; re[i] = re[j]; re[j] = t; } }
      for (let len = 2; len <= n; len <<= 1) { const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang); for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) { const ur = re[i + k], ui = im[i + k], vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr; re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } } }
      const p = new Float64Array(n / 2); for (let i = 0; i < n / 2; i++) p[i] = re[i] * re[i] + im[i] * im[i];
      return { p, hz: sr / n };
    };
    const band = (S, a, b) => { let s = 0; for (let i = Math.floor(a / S.hz); i <= Math.ceil(b / S.hz); i++) s += S.p[i] || 0; return s; };
    const modes = PBC.AudioConfig.courtSynth.rim.modes.slice(1, 5);
    const res = out.map((s, i) => {
      const next = out[i + 1] ? out[i + 1].a0 : s.a0 + 3.5;
      const ev = tr.filter((e) => e.at >= s.a0 - 0.01 && e.at < next - 0.01).map((e) => ({ n: e.type.slice(6), kind: e.kind || '', t: +(e.gt - s.g0).toFixed(3), src: e.src || '' }));
      const tH = audioAt(s.g0 + s.tHoop), x = grab(tH, 0.4);
      let ss = 0; for (let k = 0; k < x.length; k++) ss += x[k] * x[k];
      const S = spec(x), all = band(S, 60, 16000) || 1e-20;
      let metal = 0; for (const f of modes) metal += band(S, f * 0.96, f * 1.04);
      // (the same width around the rim's modes in plain noise would hold ~6% of the energy: 4 bands x 8% of 60 Hz-16 kHz on a log scale ~ 0.08 x 4 / 8 octaves)
      return { label: s.label, ev, lvl: 10 * Math.log10(ss / x.length + 1e-20), metal: metal / all, net: band(S, 3000, 9000) / all, a0: s.a0, tHoop: s.tHoop, first: ev.length ? ev[0] : null };
    });
    // the WAVs: the whole run, and swish / rim-in / air ball back to back
    const wavOf = (parts) => {
      const n = parts.reduce((a, p) => a + p.length, 0), buf = new ArrayBuffer(44 + n * 2), d = new DataView(buf), w = (o, s) => { for (let i = 0; i < s.length; i++) d.setUint8(o + i, s.charCodeAt(i)); };
      w(0, 'RIFF'); d.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); d.setUint32(16, 16, true); d.setUint16(20, 1, true); d.setUint16(22, 1, true); d.setUint32(24, sr, true); d.setUint32(28, sr * 2, true); d.setUint16(32, 2, true); d.setUint16(34, 16, true); w(36, 'data'); d.setUint32(40, n * 2, true);
      let o = 44; for (const p of parts) for (let i = 0; i < p.length; i++) { d.setInt16(o, Math.max(-1, Math.min(1, p[i])) * 32767, true); o += 2; }
      let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
      return btoa(s);
    };
    const all = grab(out[0].a0 - 0.2, mx.now() - out[0].a0);
    const three = [0, 1, 4].map((i) => grab(audioAt(out[i].g0) - 0.1, 2.6));
    window.__dbg = { rec: [rec.start, rec.L.length / sr], shots: out.map((s) => [s.label, s.a0, s.tHoop]) };
    return { res, dbg: window.__dbg, wavAll: wavOf([all]), wavThree: wavOf(three), text: PBC.AudioDebug.format(tr) };
  }, SHOTS);
  await browser.close();
  if (process.env.SHOTS_DEBUG) console.log(JSON.stringify(r.dbg), JSON.stringify(r.res.map((x) => [x.label, x.a0, x.tHoop, x.first])));
  fs.writeFileSync(path.join(o.out, 'shots_all.wav'), Buffer.from(r.wavAll, 'base64'));
  fs.writeFileSync(path.join(o.out, 'swish_rimin_airball.wav'), Buffer.from(r.wavThree, 'base64'));
  fs.writeFileSync(path.join(o.out, 'shots_trace.txt'), r.text + '\n');
  const L = ['Trial 2: the ball at the hoop, shot by shot (forced results from one spot, the court\'s own ball physics, its audio as in a game)', ''];
  L.push('shot                         at the hoop (0.4 s from the ball getting there)       court sounds (s from the release; kind)');
  L.push('                             level dB   rim metal   net 3-9 kHz');
  const by = {};
  for (const s of r.res) {
    by[s.label] = s;
    const evs = s.ev.map((e) => `${e.n}${e.kind ? ' ' + e.kind : ''} ${e.t.toFixed(2)}`).join(', ');
    L.push(`${s.label.padEnd(28)} ${s.lvl.toFixed(1).padStart(7)}   ${(s.metal * 100).toFixed(1).padStart(6)}%   ${(s.net * 100).toFixed(1).padStart(6)}%     ${evs}`);
  }
  // the three the gauntlet names
  const sw = by['swish'], ri = by['in off the rim'], ab = by['air ball'];
  const hoopSounds = (s) => s.ev.filter((e) => /^(rim|board|swish|net|rimroll|dunk)$/.test(e.n)).map((e) => e.n + (e.kind ? ' ' + e.kind : ''));
  const swOk = hoopSounds(sw).join() === 'swish';
  const riOk = hoopSounds(ri).length === 2 && /^rim /.test(hoopSounds(ri)[0]) && hoopSounds(ri)[1] === 'net';
  const abOk = hoopSounds(ab).length === 0 && ab.lvl < sw.lvl - 20 && ab.lvl < ri.lvl - 20;
  const specOk = ri.metal > sw.metal * 3 && sw.net > ri.net;
  L.push('');
  L.push(`swish: at the hoop only the net (${hoopSounds(sw).join(', ') || 'nothing'}), rim metal ${(sw.metal * 100).toFixed(1)}%: ${swOk ? 'OK' : 'NO'}`);
  L.push(`rim-in: the rim then the net (${hoopSounds(ri).join(', ') || 'nothing'}), rim metal ${(ri.metal * 100).toFixed(1)}%: ${riOk ? 'OK' : 'NO'}`);
  L.push(`air ball: nothing at the hoop (${hoopSounds(ab).join(', ') || 'nothing'}), level there ${ab.lvl.toFixed(1)} dB against ${sw.lvl.toFixed(1)} (swish) and ${ri.lvl.toFixed(1)} (rim-in): ${abOk ? 'OK' : 'NO'}`);
  L.push(`measured apart: rim-in has ${(ri.metal / Math.max(1e-6, sw.metal)).toFixed(1)}x the swish's rim metal, the swish ${(sw.net / Math.max(1e-6, ri.net)).toFixed(1)}x the rim-in's share of net noise: ${specOk ? 'OK' : 'NO'}`);
  L.push(`errors: ${errs.length}${errs.length ? ' ' + errs.slice(0, 3).join(' | ') : ''}`);
  L.push(swOk && riOk && abOk && specOk && !errs.length ? 'RESULT: PASS' : 'RESULT: FAIL');
  const txt = L.join('\n');
  fs.writeFileSync(path.join(o.out, 'shots_result.txt'), txt + '\n');
  console.log(txt);
})();
