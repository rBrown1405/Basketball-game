#!/usr/bin/env node
// Trial 2's regression over the other ways to watch, each a live game for --secs with the arena's sound on (the booth
// off): the retro court and play-by-play only (the court's audio listens to the broadcast court: neither makes court
// sounds, and neither may make an error), every shot's result still heard (from the retro court's own ball, with the
// text in text mode), and the broadcast court with instant replays (no court sound while a replay runs, the court's
// sounds again after it). Whether a replay was running is taken as each court sound is decided (its bus event), not
// from the replay's span sampled every 50 ms: a sound in the first live frame after a replay fell inside the span's
// 50 ms margin and was counted as in it.
//   node tools/audio/test/modes.js [--seed 21] [--secs 70] [--speed 2] [--out audit/audio2]
'use strict';
const fs = require('fs'), path = require('path');
const T = require('./common.js');
const o = T.args({ seed: 21, secs: 70, speed: 2, out: 'audit/audio2' });
const MODES = [
  ['the retro court', { courtStyle: 'retro' }],
  ['play-by-play only', { showVisuals: false }],
  ['the broadcast court with instant replays', { replays: true }],
];
(async () => {
  const browser = await T.launch(o);
  const L = [`Trial 2: the other ways to watch (seed ${o.seed}, ${o.speed}x, ${o.secs} s each, the arena's sound on, the booth off)`, ''];
  let ok = true;
  for (const [label, settings] of MODES) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    await T.openGame(page, o.repo, o.seed, Object.assign({ commentary: false, voice: false, arenaSound: true, volume: 0.8, simSpeed: o.speed }, settings));
    await page.waitForTimeout(700);
    await page.mouse.click(400, 400);
    await page.evaluate(() => {
      PBC.AudioDebug.traceStart({ anim: false });
      // whether a replay is on the screen, on the audio clock, every 50 ms (its span, for the report)
      window.__rp = [];
      setInterval(() => { const LG = PBC.UI._liveDebug.state(), v = LG && LG.view; if (LG && LG.mx) window.__rp.push([LG.mx.now(), !!(v && v.replay)]); }, 50);
      // and at each court sound as it is decided: was a replay running?
      window.__crp = [];
      PBC.AudioBus.on('court.*', (ev) => { const LG = PBC.UI._liveDebug.state(), v = LG && LG.view; window.__crp.push([ev.at, ev.type, !!(v && v.replay)]); });
    });
    await page.waitForTimeout(o.secs * 1000);
    const r = await page.evaluate(() => {
      const list = PBC.AudioDebug.traceStop(), LG = PBC.UI._liveDebug.state();
      const court = list.filter((e) => e.type.startsWith('court.'));
      const results = list.filter((e) => e.type === 'game.shotResult').map((e) => e.via || '?');
      // replays: their spans on the audio clock, and the court sounds inside them and after them
      const spans = []; let cur = null;
      for (const [t, on] of window.__rp) { if (on && !cur) cur = [t, t]; else if (on) cur[1] = t; else if (cur) { spans.push(cur); cur = null; } }
      if (cur) spans.push(cur);
      const inReplay = window.__crp.filter((x) => x[2]).map(([at, type]) => ({ at, type }));
      const after = spans.length ? court.filter((e) => e.at > spans[spans.length - 1][1] + 0.05).length : 0;
      const kinds = {}; for (const e of court) kinds[e.type.slice(6)] = (kinds[e.type.slice(6)] || 0) + 1;
      return { view: LG && LG.view ? LG.view.constructor.name : 'none (text)', court: court.length, kinds, results, spans: spans.map(([a, b]) => [+a.toFixed(2), +b.toFixed(2)]), inReplay: inReplay.map((e) => e.type + ' at ' + e.at.toFixed(2)), after, played: LG && LG.mx ? LG.mx.stats().played : 0, poss: LG && LG.g ? LG.g.possN : null };
    });
    await page.close();
    let pass = !errs.length && r.results.length > 0;
    let what = '';
    if (settings.courtStyle === 'retro') { pass = pass && r.court === 0 && r.results.every((v) => v === 'court'); what = `court sounds ${r.court}; shot results ${r.results.length}, from the court ${r.results.filter((v) => v === 'court').length}`; }
    else if (settings.showVisuals === false) { pass = pass && r.court === 0 && r.results.every((v) => v === 'text'); what = `court sounds ${r.court}; shot results ${r.results.length}, with the text ${r.results.filter((v) => v === 'text').length}`; }
    else { pass = pass && r.spans.length > 0 && r.inReplay.length === 0 && r.after > 0; what = `replays ${r.spans.length} (${r.spans.map((s) => s[0] + '-' + s[1] + ' s').join(', ')}); court sounds ${r.court}, during a replay ${r.inReplay.length}${r.inReplay.length ? ' (' + r.inReplay.slice(0, 4).join(', ') + ')' : ''}, after it ${r.after}; shot results ${r.results.length}`; }
    ok = ok && pass;
    L.push(`${label.padEnd(42)} ${pass ? 'OK ' : 'NO '} view ${r.view}; ${what}; sounds played ${r.played}; page errors ${errs.length}${errs.length ? ' (' + errs.slice(0, 2).join(' | ') + ')' : ''}`);
    console.log(L[L.length - 1]);
  }
  await browser.close();
  L.push('', ok ? 'RESULT: PASS' : 'RESULT: FAIL');
  const txt = L.join('\n');
  fs.writeFileSync(path.join(o.out, 'modes_result.txt'), txt + '\n');
  console.log(txt.split('\n').slice(-1).join('\n'));
})();
