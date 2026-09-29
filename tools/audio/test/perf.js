#!/usr/bin/env node
// Frame times of the live view with the audio on and off (the same seeded game setup), --dur seconds each at every
// speed asked for, and the audio's own main-thread time per frame: the bus and everything it calls (the arena audio,
// the booth, the tracker, the mixer's play), the court's sound and cue hooks, and the per-frame updates of the arena
// audio, the mixer, the tracker and the booth.
//   node tools/audio/test/perf.js [--dur 120] [--runs 1:on,1:off,4:on,4:off] [--out audit/audio1]
'use strict';
const fs = require('fs'), path = require('path');
const T = require('./common.js');
const o = T.args({ dur: 120, warm: 5, runs: '1:on,1:off,4:on,4:off', seed: 21 });
const RUNS = String(o.runs).split(',').map((s) => { const [sp, a] = s.split(':'); return { speed: +sp, audio: a === 'on' }; });
(async () => {
  const browser = await T.launch(o);
  const rows = [];
  for (const R of RUNS) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errs = []; page.on('pageerror', (e) => errs.push(e.message));
    if (R.audio) await page.addInitScript(T.SPEECH);
    await T.openGame(page, o.repo, o.seed, { simSpeed: R.speed, volume: 0.8, arenaSound: R.audio, commentary: R.audio, voice: R.audio });
    await page.mouse.click(400, 400);
    await page.evaluate(() => {
      const LG = PBC.UI._liveDebug.state();
      // time in audio code, counted once however deep the calls go
      let depth = 0, acc = 0;
      const wrap = (obj, k) => {
        const f = obj && obj[k];
        if (typeof f !== 'function') return;
        obj[k] = function (...a) {
          if (depth++) { try { return f.apply(this, a); } finally { depth--; } }
          const t = performance.now();
          try { return f.apply(this, a); } finally { depth--; acc += performance.now() - t; }
        };
      };
      wrap(PBC.AudioBus, 'emit');
      for (const k of ['au', 'mx', 'at', 'cm']) wrap(LG[k], 'update');
      if (LG.view) { wrap(LG.view, 'onSound'); wrap(LG.view, 'onCue'); }
      const P = window.__perf = { on: false, dts: [], audio: [], last: 0 };
      const tick = (ts) => { if (P.on && P.last) { P.dts.push(ts - P.last); P.audio.push(acc); } acc = 0; P.last = ts; requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    });
    await page.waitForTimeout(o.warm * 1000);
    await page.evaluate(() => { window.__perf.on = true; window.__perf.last = 0; });
    await page.waitForTimeout(o.dur * 1000);
    const P = await page.evaluate(() => { window.__perf.on = false; const LG = PBC.UI._liveDebug.state(); return { dts: window.__perf.dts, audio: window.__perf.audio, stats: LG && LG.mx ? LG.mx.stats() : null }; });
    await page.close();
    const dts = P.dts.slice(1), au = P.audio.slice(1);
    const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
    const row = { run: `${R.speed}x audio ${R.audio ? 'on' : 'off'}`, frames: dts.length, fps: 1000 / mean(dts), p50: T.pct(dts, 50), p95: T.pct(dts, 95), p99: T.pct(dts, 99), over33: dts.filter((d) => d > 33.4).length, over50: dts.filter((d) => d > 50).length, audioMean: mean(au), audioP99: T.pct(au, 99), audioMax: Math.max(0, ...au), played: P.stats ? P.stats.played : 0, peakVoices: P.stats ? P.stats.peakTotal : 0, errs: errs.length };
    rows.push(row);
    console.log(JSON.stringify(row));
  }
  await browser.close();
  const f = (x) => x.toFixed(1);
  const L = [`Frame times of the live view, ${o.dur} s per run after ${o.warm} s of warm-up (headless Chromium, software rendering)`, '',
    'run              frames   fps  p50 ms  p95 ms  p99 ms  >33 ms  >50 ms | audio ms/frame: mean   p99    max | sounds  peak voices'];
  for (const r of rows) L.push(`${r.run.padEnd(16)} ${String(r.frames).padStart(6)} ${f(r.fps).padStart(5)} ${f(r.p50).padStart(7)} ${f(r.p95).padStart(7)} ${f(r.p99).padStart(7)} ${String(r.over33).padStart(7)} ${String(r.over50).padStart(7)} | ${r.audioMean.toFixed(3).padStart(19)} ${r.audioP99.toFixed(2).padStart(6)} ${r.audioMax.toFixed(1).padStart(6)} | ${String(r.played).padStart(6)} ${String(r.peakVoices).padStart(12)}`);
  const txt = L.join('\n');
  fs.writeFileSync(path.join(o.out, 'perf_result.txt'), txt + '\n');
  console.log(txt);
})();
