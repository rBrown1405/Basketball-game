#!/usr/bin/env node
// The same game with the audio on and off, frame for frame: a seeded live game driven through the real live loop on
// a clock the test controls (so both runs play exactly the same frames), each frame's real work timed (the court's
// update and drawing, the broadcast, the audio). The audio thread renders in real time meanwhile, so what it takes
// from the page shows too. Paired frames: the difference is what the audio costs.
//   node tools/audio/test/perfsame.js [--seed 21] [--poss 6] [--speeds 1,4] [--rounds 2] [--out audit/audio1]
'use strict';
const fs = require('fs'), path = require('path');
const T = require('./common.js');
const o = T.args({ seed: 21, poss: 6, speeds: '1,4', rounds: 2 });
function REALCLOCK() { window.__realNow = performance.now.bind(performance); }
async function run(browser, speed, audio) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.addInitScript(REALCLOCK);
  await page.addInitScript(T.FIXED);
  if (audio) await page.addInitScript(T.SPEECH);
  await T.openGame(page, o.repo, o.seed, { tvGraphics: false, gimEnabled: false, simSpeed: speed, volume: 0.8, arenaSound: audio, commentary: audio, voice: audio });
  const r = await page.evaluate((POSS) => {
    const D = PBC.UI._liveDebug, now = window.__realNow;
    D.manual();
    const L0 = D.state(); if (L0.cm) L0.cm.unlock();
    const ms = [];
    let frames = 0;
    while (frames < 100000) {
      const L = D.state(); if (!L || L.finished) break;
      if (L.P && L.P.n != null && L.P.n >= POSS && L.possDone) break;
      const t0 = now();
      D.frame(window.__adv(1000 / 60));
      ms.push(now() - t0);
      frames++;
    }
    const L = D.state();
    return { ms, played: L && L.mx ? L.mx.stats().played : 0 };
  }, o.poss);
  await page.close();
  r.errs = errs;
  return r;
}
(async () => {
  const browser = await T.launch(o);
  const L = [`The same seeded game (seed ${o.seed}, ${o.poss} possessions) with the audio on and off, each frame's real work timed; ${o.rounds} rounds, on and off alternating`, ''];
  L.push('speed  audio  round  frames   mean ms  p50    p95    p99    max    frames over 16.7 ms  sounds');
  const pairs = {};
  for (const sp of String(o.speeds).split(',').map(Number)) {
    for (let k = 1; k <= o.rounds; k++) {
      for (const audio of [true, false]) {
        const r = await run(browser, sp, audio);
        const a = r.ms, mean = a.reduce((x, y) => x + y, 0) / a.length;
        const row = { n: a.length, mean, p50: T.pct(a, 50), p95: T.pct(a, 95), p99: T.pct(a, 99), max: Math.max(...a), over: a.filter((x) => x > 16.7).length };
        (pairs[sp] || (pairs[sp] = [])).push({ audio, k, row, ms: a });
        L.push(`${String(sp + 'x').padEnd(6)} ${(audio ? 'on' : 'off').padEnd(6)} ${String(k).padEnd(6)} ${String(row.n).padStart(6)}  ${row.mean.toFixed(2).padStart(7)} ${row.p50.toFixed(1).padStart(6)} ${row.p95.toFixed(1).padStart(6)} ${row.p99.toFixed(1).padStart(6)} ${row.max.toFixed(1).padStart(6)} ${String(row.over).padStart(20)}  ${r.played}`);
        console.log(L[L.length - 1]);
      }
    }
  }
  await browser.close();
  L.push('');
  // the audio's cost: on minus off, frame by frame, against the spread between two rounds of the same setting
  for (const sp of Object.keys(pairs)) {
    const on = pairs[sp].filter((x) => x.audio), off = pairs[sp].filter((x) => !x.audio);
    const avg = (arr, f) => arr.reduce((s, x) => s + f(x.row), 0) / arr.length;
    const d = (f) => avg(on, f) - avg(off, f);
    const spread = (arr, f) => Math.max(...arr.map((x) => f(x.row))) - Math.min(...arr.map((x) => f(x.row)));
    L.push(`${sp}x: audio on minus off (average of the rounds): mean ${d((r) => r.mean).toFixed(2)} ms, p95 ${d((r) => r.p95).toFixed(2)} ms, p99 ${d((r) => r.p99).toFixed(2)} ms, frames over 16.7 ms ${d((r) => r.over).toFixed(0)}; round-to-round spread with the same setting: mean ${Math.max(spread(on, (r) => r.mean), spread(off, (r) => r.mean)).toFixed(2)} ms, p95 ${Math.max(spread(on, (r) => r.p95), spread(off, (r) => r.p95)).toFixed(2)} ms, p99 ${Math.max(spread(on, (r) => r.p99), spread(off, (r) => r.p99)).toFixed(2)} ms`);
  }
  const txt = L.join('\n');
  fs.writeFileSync(path.join(o.out, 'perfsame_result.txt'), txt + '\n');
  console.log(txt.split('\n').slice(-3).join('\n'));
})();
