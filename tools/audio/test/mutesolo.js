#!/usr/bin/env node
// Mute and solo every bus during a live game, through the audio console's own buttons (opened with the A key): the
// meters of every bus and the master read every 100 ms, a test tone on every bus every 0.4 s (so each bus has
// something to play), and a WAV from the mixer's recorder for each soloed bus.
// PASS: a soloed bus is the only one with signal and the master carries it; a muted bus is silent while the others play.
//   node tools/audio/test/mutesolo.js [--solo 30] [--mute 6] [--out audit/audio1]
'use strict';
const fs = require('fs'), path = require('path');
const T = require('./common.js');
const o = T.args({ solo: 30, mute: 6, seed: 21 });
const BUSES = ['court', 'players', 'crowd', 'arena', 'commentary'];
(async () => {
  const browser = await T.launch(o);
  const page = await browser.newPage({ viewport: { width: 1400, height: 860 } });
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await T.openGame(page, o.repo, o.seed, { commentary: true, voice: true, arenaSound: true, volume: 0.8, simSpeed: 1 });
  await page.waitForTimeout(1500);
  await page.keyboard.press('a');   // the console, like a player opens it
  await page.waitForTimeout(400);
  const open = await page.evaluate(() => PBC.AudioDebug.isOpen());
  await page.evaluate((BUSES) => {
    const LG = PBC.UI._liveDebug.state();
    window.__tones = setInterval(() => { for (const b of BUSES) LG.au.testTone(b); }, 400);
    window.__samples = []; window.__mark = 'start';
    window.__sampler = setInterval(() => {
      const st = PBC.AudioDebug.state();
      const s = { mark: window.__mark, master: st.master.rms };
      for (const b of BUSES) s[b] = st.buses[b].meter.rms;
      window.__samples.push(s);
    }, 100);
  }, BUSES);
  const click = (bus, what) => page.click(`.aud-console [data-bus="${bus}"] [data-${what}]`);
  const mark = (m) => page.evaluate((m) => { window.__mark = m; }, m);
  const wavs = {};
  for (const b of BUSES) {
    await click(b, 'solo'); await mark('settle'); await page.waitForTimeout(300); await mark('solo ' + b);
    if (b === 'court') await page.screenshot({ path: path.join(o.out, 'console_solo.png') });
    await page.waitForTimeout(o.solo * 1000);
    await mark('saving');   // (the window closes before anything else happens on the page)
    const w = await T.mixerWav(page, o.solo);
    if (w) { fs.writeFileSync(path.join(o.out, `solo_${b}.wav`), Buffer.from(w.b64, 'base64')); wavs[b] = `${w.seconds.toFixed(1)} s (${w.kind})`; }
    await mark('settle'); await click(b, 'solo'); await page.waitForTimeout(500);
  }
  for (const b of BUSES) {
    await click(b, 'mute'); await mark('settle'); await page.waitForTimeout(300); await mark('mute ' + b);
    if (b === 'crowd') await page.screenshot({ path: path.join(o.out, 'console_mute.png') });
    await page.waitForTimeout(o.mute * 1000);
    await mark('settle'); await click(b, 'mute'); await page.waitForTimeout(500);
  }
  const res = await page.evaluate(() => { clearInterval(window.__tones); clearInterval(window.__sampler); return { samples: window.__samples, st: PBC.AudioDebug.state() }; });
  await browser.close();
  const SIL = -100, SIG = -80;   // silence: under -100 dBFS RMS in every reading; signal: over -80 in some
  const fmt = (x) => (x <= -139 ? '-inf' : x.toFixed(1));
  const by = {};
  for (const s of res.samples) (by[s.mark] || (by[s.mark] = [])).push(s);
  const L = [`console opened with the A key: ${open}`, `meter readings: ${res.samples.length} (every 100 ms)`, ''];
  let pass = open;
  for (const b of BUSES) {
    const S = by['solo ' + b] || [];
    const own = Math.max(...S.map((s) => s[b])), others = BUSES.filter((x) => x !== b).map((x) => [x, Math.max(...S.map((s) => s[x]))]);
    const master = S.filter((s) => s.master > -140).length;
    const ok = S.length > 0 && own > SIG && others.every(([, v]) => v < SIL) && master > 0;
    pass = pass && ok;
    L.push(`SOLO ${b.padEnd(10)} ${S.length} readings | ${b} loudest ${fmt(own)} dB | others loudest: ${others.map(([x, v]) => x + ' ' + fmt(v)).join(', ')} | master has signal in ${master}/${S.length} | WAV ${wavs[b] || 'none'} | ${ok ? 'PASS' : 'FAIL'}`);
  }
  for (const b of BUSES) {
    const S = by['mute ' + b] || [];
    const own = Math.max(...S.map((s) => s[b])), others = BUSES.filter((x) => x !== b).map((x) => [x, Math.max(...S.map((s) => s[x]))]);
    const ok = S.length > 0 && own < SIL && others.every(([, v]) => v > SIG);
    pass = pass && ok;
    L.push(`MUTE ${b.padEnd(10)} ${S.length} readings | ${b} loudest ${fmt(own)} dB | others loudest: ${others.map(([x, v]) => x + ' ' + fmt(v)).join(', ')} | ${ok ? 'PASS' : 'FAIL'}`);
  }
  const st = res.st.stats;
  L.push('', `mixer: played ${st.played}, took the place of ${st.stolen} (test tones replacing finished or older test tones), refused ${JSON.stringify(st.suppressed)}, peak voices ${st.peakTotal}/48, per bus ${JSON.stringify(st.peakBus)}`);
  L.push(`page errors: ${errs.length}${errs.length ? ' ' + errs.slice(0, 3).join(' | ') : ''}`);
  L.push(pass ? 'RESULT: PASS (every bus soloed and muted during a live game)' : 'RESULT: FAIL');
  const txt = L.join('\n');
  fs.writeFileSync(path.join(o.out, 'mutesolo_result.txt'), txt + '\n');
  console.log(txt);
  process.exit(pass ? 0 : 1);
})();
