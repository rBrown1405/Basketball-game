#!/usr/bin/env node
// The duck on a fixed script (no game): booth lines and crowd reactions at set times, the crowd bus's two ducks (the
// bed and the reactions) read every 20 ms, run with the ducking settings of the config (after the Trial 1 critique)
// and with the first Trial 1 settings (before it), so both are measured on exactly the same timeline.
//   node tools/audio/test/duck.js [--out audit/audio1]
// The script: a 1.5 s line; 0.7 s later a 1 s line; 0.35 s later a 2 s line (one exchange: the crowd must stay down);
// a home dunk roar while a 4 s line is going (the roar pushes through, then the voice takes over again: no chop);
// a regular home basket cheer under a 1.2 s line (the cheer keeps more of its level than the bed); a line, then 6 s
// with nothing playing on the crowd's reaction path, then a cheer with the booth quiet (both ducks back at 0 dB: a
// path left idle must not keep an old duck).
'use strict';
const fs = require('fs'), path = require('path');
const T = require('./common.js');
const o = T.args({});
const BEFORE = { crowdDb: -6, crowdReactDb: -6, hold: 0.35, release: 0.45, attack: 0.08, pushHold: 1.2, pushReturn: 0.08 };
const SCRIPT = [
  [0.5, 'talk', 1], [2.0, 'talk', 0], [2.7, 'talk', 1], [3.7, 'talk', 0], [4.05, 'talk', 1], [6.05, 'talk', 0],
  [9.0, 'talk', 1], [9.3, 'roar', 1.1], [13.0, 'talk', 0],
  [16.0, 'roar', 0.65], [16.2, 'talk', 1], [17.4, 'talk', 0],
  [21.0, 'talk', 1], [22.0, 'talk', 0], [29.0, 'roar', 0.65],
];
async function run(browser, override) {
  const page = await browser.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('file://' + path.join(o.repo, 'index.html') + '?low=1');
  await page.waitForTimeout(700);
  const r = await page.evaluate(async ([override, SCRIPT]) => {
    if (override) Object.assign(PBC.AudioConfig.duck, override);
    const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    PBC.AudioBus.reset();
    const host = { S: { settings: { arenaSound: true, volume: 0.7 } }, stakes: { level: 0 }, uIdx: 0, speed: () => 1 };
    const mx = PBC.AudioMixer.create({ volume: 0.7 }); host.mx = mx;
    const au = PBC.ArenaAudio.create(host);
    await sleep(600);
    const t0 = mx.now(), samples = [];
    const upd = setInterval(() => { mx.update(); au.update(0.02, { stakes: 0, late: false, close: true, playing: true, speed: 0, off: 0 }); samples.push([+(mx.now() - t0).toFixed(3), mx.isSpeaking() ? 1 : 0, +mx.duckDb().toFixed(2), +mx.duckDb(true).toFixed(2)]); }, 20);
    const marks = [];
    for (const [at, what, v] of SCRIPT) {
      while (mx.now() - t0 < at) await sleep(5);
      marks.push([+(mx.now() - t0).toFixed(3), what, v]);
      if (what === 'talk') mx.speaking(!!v); else au.crowd('roar', v);
    }
    await sleep(3500);
    clearInterval(upd);
    return { samples, marks };
  }, [override, SCRIPT]);
  await page.close();
  r.errs = errs;
  return r;
}
(async () => {
  const browser = await T.launch(o);
  const after = await run(browser, null), before = await run(browser, BEFORE);
  await browser.close();
  const at = (S, t) => { let best = S[0]; for (const s of S) if (Math.abs(s[0] - t) < Math.abs(best[0] - t)) best = s; return best; };
  const L = [];
  L.push('Crowd duck on a fixed script, bed / reactions in dB (before: the first Trial 1 settings, after: the config now)');
  L.push(`before: ${JSON.stringify(BEFORE)}`);
  const cfg = require('vm').runInNewContext(fs.readFileSync(path.join(o.repo, 'js/audio/config.js'), 'utf8') + ';window.PBC.AudioConfig.duck', { window: {} });
  L.push(`after:  ${JSON.stringify(cfg)}`);
  L.push('');
  const checks = [
    ['between line 1 and 2 (gap 0.7 s), at 2.6 s', 2.6], ['between line 2 and 3 (gap 0.35 s), at 3.95 s', 3.95],
    ['4 s line: before the roar, at 9.25 s', 9.25], ['roar pushing through, at 9.8 s', 9.8], ['roar pushing through, at 10.6 s', 10.6],
    ['after the push (1.5 s / 1.2 s), at 10.75 s', 10.75], ['at 11.0 s', 11.0], ['at 11.4 s', 11.4], ['at 12.0 s', 12.0],
    ['home cheer under a line, at 16.8 s', 16.8], ['1 s after the last line, at 18.4 s', 18.4], ['2 s after, at 19.4 s', 19.4],
    ['a line at 21-22 s, then nothing on the reaction path: at 28.5 s', 28.5], ['a cheer, booth quiet, at 29.3 s', 29.3],
  ];
  L.push('moment                                              before            after');
  for (const [label, t] of checks) { const b = at(before.samples, t), a = at(after.samples, t); L.push(`${label.padEnd(50)} ${(b[2].toFixed(1) + ' / ' + b[3].toFixed(1)).padStart(14)}  ${(a[2].toFixed(1) + ' / ' + a[3].toFixed(1)).padStart(14)}`); }
  // the steepest fall of the bed duck while the booth had been talking for 0.3 s (a chop), and surges between lines
  const stats = (S) => {
    let chop = 0, surge = 0, low = false, up = -1e9;
    for (let i = 15; i < S.length; i++) {
      if (S[i][1] && S[i - 15][1]) { const f = S[i - 10][2] - S[i][2]; if (f > chop && S[i - 10][2] > -1.5) chop = f; }
      if (!low && S[i][2] < -3) { low = true; if (S[i][0] - up < 1.5) surge++; } else if (low && S[i][2] > -1.5) { low = false; up = S[i][0]; }
    }
    return { chop, surge };
  };
  const sb = stats(before.samples), sa = stats(after.samples);
  L.push('');
  L.push(`surges (the crowd back up and down again within 1.5 s): before ${sb.surge}, after ${sa.surge}`);
  L.push(`steepest fall of the bed in 0.2 s once the booth had been talking 0.3 s (a chop after a push-through): before ${sb.chop.toFixed(1)} dB, after ${sa.chop.toFixed(1)} dB`);
  L.push(`errors: ${before.errs.length + after.errs.length}`);
  L.push('');
  const idle = at(after.samples, 28.5), cheer = at(after.samples, 29.3);
  const idleOk = Math.abs(idle[2]) < 0.2 && Math.abs(idle[3]) < 0.2 && Math.abs(cheer[3]) < 0.2;
  const shapeOk = sa.surge === 0 && sa.chop <= 3 && at(after.samples, 16.8)[3] > at(after.samples, 16.8)[2];
  L.push(`after a quiet spell both ducks are back at 0 dB (bed ${idle[2].toFixed(2)}, reactions ${idle[3].toFixed(2)}; the cheer at ${cheer[3].toFixed(2)}): ${idleOk ? 'PASS' : 'FAIL'}`);
  L.push(`no surges, no chop over 3 dB after a push-through, cheers ducked less than the bed: ${shapeOk ? 'PASS' : 'FAIL'}`);
  L.push(idleOk && shapeOk && !before.errs.length && !after.errs.length ? 'RESULT: PASS' : 'RESULT: FAIL', '');
  L.push('bed duck every 0.1 s, 0-20 s (before, then after):');
  const row = (S) => { const out = []; for (let t = 0; t <= 20; t += 0.1) out.push(at(S, t)[2].toFixed(0)); return out.join(' '); };
  L.push(row(before.samples)); L.push(row(after.samples));
  const txt = L.join('\n');
  fs.writeFileSync(path.join(o.out, 'duck_result.txt'), txt + '\n');
  console.log(txt);
})();
