#!/usr/bin/env node
// Voice limits and priority, forced: the caps are lowered for the test so they are hit on purpose, then sounds are
// played in an order that makes the mixer choose. Each request's outcome is read from the bus event that asked for
// it (played, took the place of which sound, or refused and why).
//   node tools/audio/test/voices.js [--out audit/audio1]
'use strict';
const fs = require('fs'), path = require('path');
const T = require('./common.js');
const o = T.args({});
(async () => {
  const browser = await T.launch(o);
  const page = await browser.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('file://' + path.join(o.repo, 'index.html') + '?low=1');
  await page.waitForTimeout(700);
  const r = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    const C = PBC.AudioConfig, Bus = PBC.AudioBus;
    Bus.reset();
    const host = { S: { settings: { arenaSound: true, volume: 0.5 } }, stakes: { level: 0 }, uIdx: 0, speed: () => 1 };
    const mx = PBC.AudioMixer.create({ volume: 0.5 }); host.mx = mx;
    const au = PBC.ArenaAudio.create(host);
    await sleep(500);
    const out = [];
    // one request, as its own bus event, and what the mixer did with it
    const ask = (label, fn) => { const ev = Bus.emit('live.test', { label }, fn); const s = (ev.sounds || [])[0] || {}; out.push({ label, sound: s.n, prio: s.p, result: s.s, took: s.stole || null, voices: mx.voiceCount() }); };
    // 1. a sound's own limit: crowd.roar allows 4 at once; the 5th takes the place of the oldest roar
    for (let i = 1; i <= 5; i++) ask(`roar ${i} (limit 4 roars)`, () => au.crowd('roar', 0.7));
    await sleep(4500);
    // 2. the bus cap: Court lowered to 3 voices
    const cap0 = C.buses.court.cap; C.buses.court.cap = 3;
    ask('squeak (p15)', () => au.play('squeak', 1));
    ask('dribble (p20)', () => au.play('dribble', 1));
    ask('bounce (p25)', () => au.play('bounce', 1));
    ask('rim (p60): court full', () => au.play('rim', 1));
    ask('board (p55): court full', () => au.play('board', 1));
    ask('swish (p65): court full', () => au.play('swish', 1));
    await sleep(120);
    ask('dribble (p20): court full of higher ones', () => au.play('dribble', 1));
    C.buses.court.cap = cap0;
    await sleep(2500);
    // 3. the global cap lowered to 4: four roars on the Crowd bus fill it
    const g0 = C.voices.globalCap; C.voices.globalCap = 4;
    for (let i = 1; i <= 4; i++) ask(`roar ${i} (p70)`, () => au.crowd('roar', 0.7));
    ask('dribble (p20): all voices taken by roars', () => au.play('dribble', 1));
    ask('whistle (p90): all voices taken by roars', () => au.play('whistle', 1));
    ask('horn (p95)', () => au.play('horn', 1));
    C.voices.globalCap = g0;
    await sleep(300);
    // 4. cooldowns: two dribbles 30 ms apart (the dribble's cooldown is 90 ms at 1x), and at 16x the dribble is left out
    await sleep(3000);
    ask('dribble', () => au.play('dribble', 1));
    await sleep(30);
    ask('dribble 30 ms later', () => au.play('dribble', 1));
    mx.setSpeed(16);
    await sleep(200);
    ask('dribble at 16x', () => au.play('dribble', 1));
    mx.setSpeed(1);
    const st = mx.stats();
    mx.destroy();
    return { out, st };
  });
  await browser.close();
  const L = ['Voice limits and priority (caps lowered on purpose; outcome of each request as the mixer logged it)', ''];
  for (const x of r.out) L.push(`${x.label.padEnd(44)} ${String(x.sound).padEnd(12)} p${String(x.prio).padEnd(3)} ${x.result.padEnd(9)}${x.took ? ' took the place of ' + x.took : ''}   (voices now ${x.voices})`);
  const res = Object.fromEntries(r.out.map((x) => [x.label, x]));
  const checks = [
    ['the 5th roar takes the oldest roar\'s place', res['roar 5 (limit 4 roars)'].result === 'play' && res['roar 5 (limit 4 roars)'].took === 'crowd.roar'],
    ['a rim hit takes the squeak\'s place on a full Court bus', res['rim (p60): court full'].took === 'squeak'],
    ['a board hit takes the dribble\'s place', res['board (p55): court full'].took === 'dribble'],
    ['a swish takes the bounce\'s place', res['swish (p65): court full'].took === 'bounce'],
    ['a dribble never displaces higher sounds', res['dribble (p20): court full of higher ones'].result === 'bus cap'],
    ['a dribble never displaces a roar', res['dribble (p20): all voices taken by roars'].result === 'voice cap'],
    ['a whistle takes a roar\'s place when every voice is taken', res['whistle (p90): all voices taken by roars'].took === 'crowd.roar'],
    ['the horn takes a roar\'s place', res['horn (p95)'].took === 'crowd.roar'],
    ['a second dribble inside the cooldown is left out', res['dribble 30 ms later'].result === 'cooldown'],
    ['dribbles are left out at 16x', res['dribble at 16x'].result === 'speed'],
  ];
  L.push('');
  let pass = !errs.length;
  for (const [label, ok] of checks) { pass = pass && ok; L.push(`${ok ? 'PASS' : 'FAIL'}  ${label}`); }
  L.push('', `mixer: ${JSON.stringify(r.st)}`, `page errors: ${errs.length}`, pass ? 'RESULT: PASS' : 'RESULT: FAIL');
  const txt = L.join('\n');
  fs.writeFileSync(path.join(o.out, 'voices_result.txt'), txt + '\n');
  console.log(txt);
  process.exit(pass ? 0 : 1);
})();
