#!/usr/bin/env node
// Trial 2: "sounds are panned and attenuated based on where they happen relative to the broadcast camera".
// A court of its own (the game's view and broadcast camera, the camera held on centre court), and exactly the same
// dribble (one take, no random pitch or level) played at spots around the floor through the real mixer, recorded in
// stereo from the mixer: for each spot, what the court's audio worked out from the camera (pan, level, the air's
// lowpass, extra room) and what came out (left against right and the level of the direct sound, the first 0.12 s,
// against centre court, with the room switched off; the room, switched on: the tail from 0.09 to 0.5 s against the
// first 0.12 s; the high end: the share of the direct sound's energy above 4 kHz).
// Writes place_result.txt and place.wav (the spots in order, 0.7 s apart: listen on headphones).
//   node tools/audio/test/place.js [--seed 21] [--out audit/audio2]
'use strict';
const fs = require('fs'), path = require('path');
const T = require('./common.js');
const o = T.args({ seed: 21, out: 'audit/audio2' });
const SPOTS = [
  ['centre court', 47, 25, 0],
  ['near sideline, centre', 47, 1, 0],
  ['far sideline, centre', 47, 49, 0],
  ['near sideline, left', 22, 3, 0],
  ['near sideline, right', 72, 3, 0],
  ['far corner, left', 6, 47, 0],
  ['far corner, right', 88, 47, 0],
  ['the right rim, 10 ft up', 88.75, 25, 10],
  ['off the picture, left', -20, 20, 0],
  ['off the picture, right', 114, 20, 0],
];
(async () => {
  const browser = await T.launch(o);
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.addInitScript(T.TAP);
  await T.openGame(page, o.repo, o.seed, { commentary: false, voice: false, arenaSound: false, volume: 0.8, simSpeed: 1 });
  await page.waitForTimeout(1500);
  const r = await page.evaluate(async (SPOTS) => {
    const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    const D = PBC.UI._liveDebug, LG = D.state();
    D.manual();
    if (LG.mx) LG.mx.setVolume(0);
    const M = PBC.Match, cv = document.createElement('canvas'); cv.width = 1280; cv.height = 720;
    const view = new M.View(cv, PBC.UI.matchContext(LG.S, LG.g), { quality: 'low', models: '2d', camera: 'broadcast' });
    view.resize(1280, 720);
    // the camera on centre court (the ball there, the view let settle)
    view.ball.placeAt(47, 25, 0.4);
    for (let i = 0; i < 240; i++) view.update(1 / 60);
    // twice: the room off (the direct sound alone: pan, level, the air on the high end), then on (how much room)
    const pass = async (room) => {
      const rg = PBC.AudioConfig.reverb.returnGain;
      if (!room) PBC.AudioConfig.reverb.returnGain = 0;
      PBC.AudioBus.reset(); PBC.AudioRandom.seed(777);
      // (quiet, under the master compressors' knee: at full level they squeeze a nearer, louder sound's transients,
      // where its high end is, and hide what the placement does)
      const mx = PBC.AudioMixer.create({ volume: 0.05 }); mx.unlock();
      PBC.AudioConfig.reverb.returnGain = rg;
      const ca = PBC.CourtAudio.create({ mx, view: () => view, speed: () => 1, teams: [LG.teams[0], LG.teams[1]] });
      await sleep(900);
      const hits = [];
      for (const [label, x, y, z] of SPOTS) {
        const pl = ca.place(x, y, z);
        const t = mx.now() + 0.05;
        ca.test('dribble', { e: 0.7, tight: 0.5, fixed: true }, x, y, z, { when: t });
        hits.push({ label, t, pl, cam: [view.cam.x, view.cam.y, view.cam.z] });
        await sleep(700);
      }
      await sleep(400);
      const rec = await mx.recording();
      mx.destroy();
      return { hits, rec };
    };
    const dry = await pass(false), wetP = await pass(true);
    const hits = dry.hits;
    let rec = dry.rec;
    const sr = rec.sampleRate;
    const grab = (t0, w) => {
      const i0 = Math.floor((t0 - rec.start) * sr), n = Math.floor(w * sr), L = new Float32Array(n), R = new Float32Array(n);
      for (let j = 0; j < n; j++) { const i = i0 + j; if (i >= 0 && i < rec.L.length) { L[j] = rec.L[i]; R[j] = rec.R[i]; } }
      return [L, R];
    };
    const centroid = (x) => {
      const n = 8192, re = new Float64Array(n), im = new Float64Array(n);
      for (let i = 0; i < Math.min(n, x.length); i++) re[i] = x[i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / Math.min(n, x.length)));
      for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { const t = re[i]; re[i] = re[j]; re[j] = t; } }
      for (let len = 2; len <= n; len <<= 1) { const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang); for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) { const ur = re[i + k], ui = im[i + k], vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr; re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } } }
      // the share of the energy above 4 kHz (the air takes the high end off first), in dB
      let hi = 0, all = 0; for (let i = 1; i < n / 2; i++) { const p = re[i] * re[i] + im[i] * im[i], f = i * sr / n; if (f > 100) { all += p; if (f > 4000) hi += p; } }
      return all ? 10 * Math.log10(hi / all + 1e-12) : -120;
    };
    const energy = (r, t0, w) => { rec = r; const [L, R] = grab(t0, w); let el = 0, er = 0; const mono = new Float32Array(L.length); for (let i = 0; i < L.length; i++) { el += L[i] * L[i]; er += R[i] * R[i]; mono[i] = (L[i] + R[i]) / 2; } return { el, er, n: L.length, mono }; };
    const res = hits.map((h, k) => {
      // the direct sound (the room off): the first 0.12 s (the master's compressors delay it 12 ms)
      const D = energy(dry.rec, h.t + 0.005, 0.12);
      // the room (on): the tail from 0.09 s against the whole of the first 0.12 s
      const h2 = wetP.hits[k], W = energy(wetP.rec, h2.t + 0.005, 0.12), Tl = energy(wetP.rec, h2.t + 0.09, 0.42);
      return { label: h.label, pl: h.pl, cam: h.cam, lr: 10 * Math.log10((D.er + 1e-20) / (D.el + 1e-20)), lvl: 10 * Math.log10((D.el + D.er) / (2 * D.n) + 1e-20), room: 10 * Math.log10((Tl.el + Tl.er + 1e-20) / (W.el + W.er + 1e-20)), cen: centroid(D.mono) };
    });
    rec = wetP.rec;
    // the WAV (stereo)
    const [L, R] = grab(wetP.hits[0].t - 0.1, wetP.hits[wetP.hits.length - 1].t + 0.8 - wetP.hits[0].t);
    const n = L.length, buf = new ArrayBuffer(44 + n * 4), d = new DataView(buf), w = (o, s) => { for (let i = 0; i < s.length; i++) d.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); d.setUint32(4, 36 + n * 4, true); w(8, 'WAVE'); w(12, 'fmt '); d.setUint32(16, 16, true); d.setUint16(20, 1, true); d.setUint16(22, 2, true); d.setUint32(24, sr, true); d.setUint32(28, sr * 4, true); d.setUint16(32, 4, true); d.setUint16(34, 16, true); w(36, 'data'); d.setUint32(40, n * 4, true);
    let pk = 0; for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i]));
    const gn = pk > 0 ? 0.7 / pk : 1;   // (the WAV brought up to -3 dBFS to listen to)
    let q = 44; for (let i = 0; i < n; i++) { d.setInt16(q, Math.max(-1, Math.min(1, L[i] * gn)) * 32767, true); d.setInt16(q + 2, Math.max(-1, Math.min(1, R[i] * gn)) * 32767, true); q += 4; }
    let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return { res, wav: btoa(s) };
  }, SPOTS);
  await browser.close();
  fs.writeFileSync(path.join(o.out, 'place.wav'), Buffer.from(r.wav, 'base64'));
  const L = ['Trial 2: the same dribble at spots around the floor, the broadcast camera on centre court (at ' + r.res[0].cam.map((v) => v.toFixed(0)).join(', ') + ' ft)', ''];
  L.push('spot                        worked out from the camera                      measured at the speakers (the first 0.12 s)');
  L.push('                            pan     level   air (lowpass)  extra room       right-left   level vs centre   room (tail/direct)   above 4 kHz');
  const c0 = r.res[0];
  for (const x of r.res) {
    const p = x.pl || { pan: 0, db: 0, lp: 20000, wet: 0 };
    L.push(`${x.label.padEnd(27)} ${(p.pan >= 0 ? '+' : '') + p.pan.toFixed(2)}  ${(p.db >= 0 ? '+' : '') + p.db.toFixed(1).padStart(4)} dB  ${String(Math.round(p.lp)).padStart(6)} Hz     ${p.wet.toFixed(2)}          ${(x.lr >= 0 ? '+' : '') + x.lr.toFixed(1).padStart(5)} dB   ${(x.lvl - c0.lvl >= 0 ? '+' : '') + (x.lvl - c0.lvl).toFixed(1).padStart(5)} dB      ${x.room.toFixed(1).padStart(6)} dB         ${x.cen.toFixed(1)} dB`);
  }
  const g = (k) => r.res.find((x) => x.label === k);
  const checks = [
    ['left of the picture comes out on the left, right on the right', g('near sideline, left').lr < -3 && g('near sideline, right').lr > 3 && g('far corner, left').lr < -3 && g('far corner, right').lr > 3],
    ['centre court and the sidelines\' middles are in the middle (within 1.5 dB)', Math.abs(c0.lr) < 1.5 && Math.abs(g('near sideline, centre').lr) < 1.5 && Math.abs(g('far sideline, centre').lr) < 1.5],
    ['the near sideline louder than centre court, the far sideline quieter', g('near sideline, centre').lvl > c0.lvl + 1 && g('far sideline, centre').lvl < c0.lvl - 1],
    ['further off is roomier and duller (the far corners: 3 dB more tail against the direct sound, and less of the high end, than the near sideline)', g('far corner, left').room > g('near sideline, centre').room + 3 && g('far corner, right').room > g('near sideline, centre').room + 3 && g('far corner, left').cen < g('near sideline, centre').cen - 1 && g('far corner, right').cen < g('near sideline, centre').cen - 1],
    ['off the picture is quieter than anything on it at the same side', g('off the picture, left').lvl < g('far corner, left').lvl && g('off the picture, right').lvl < g('far corner, right').lvl],
  ];
  L.push('');
  for (const [k, ok] of checks) L.push(`${k}: ${ok ? 'OK' : 'NO'}`);
  L.push(`errors: ${errs.length}`);
  L.push(checks.every((c) => c[1]) && !errs.length ? 'RESULT: PASS' : 'RESULT: FAIL');
  const txt = L.join('\n');
  fs.writeFileSync(path.join(o.out, 'place_result.txt'), txt + '\n');
  console.log(txt);
})();
