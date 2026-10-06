#!/usr/bin/env node
// The recorded sounds against the synthesized ones they replaced, through the real mixer, one clip to listen to:
// each sound a few times synthesized, then a few times recorded (the dribble, the swish, the net off the rim, the
// glass, a fast pass), then the crowd bed synthesized and recorded, at a regular season's level and at a playoff
// game's late and close (where the cheering crowd comes in). Same physics on both sides, the recordings at the levels
// the config gives them. Writes recab.wav and recab_result.txt (where each part starts).
//   node tools/audio/test/recab.js [--out audit/audio2rec]
'use strict';
const fs = require('fs'), path = require('path');
const T = require('./common.js');
const o = T.args({ out: 'audit/audio2rec' });
const PLAN = [   // [sound, physics, hits, s between them]
  ['dribble', { e: 0.7, tight: 0.5 }, 8, 0.42],
  ['swish', { e: 1 }, 3, 1.0],
  ['net', { e: 1 }, 3, 1.0],
  ['board', { e: 0.9 }, 3, 0.9],
  ['pass', { e: 0.9, whoosh: true, level: 0.55 }, 3, 0.8],
];
const BEDS = [[0.16, 6], [0.6, 6]];   // [crowd level, s]
(async () => {
  const browser = await T.launch(o);
  const page = await browser.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('file://' + path.join(o.repo, 'index.html') + '?low=1');
  await page.waitForTimeout(700);
  const r = await page.evaluate(async ([PLAN, BEDS]) => {
    const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    PBC.AudioConfig.debug.recorderSeconds = 120;
    PBC.AudioBus.reset(); PBC.AudioRandom.seed(20260929);
    const mx = PBC.AudioMixer.create({ volume: 0.7 }); mx.unlock();
    await sleep(800);
    await PBC.AudioAssets.loadAll(mx.ctx);
    const REC = PBC.AudioConfig.court.rec, CR = PBC.AudioConfig.crowd.rec, marks = [];
    const syn = PBC.CourtSynth.create(mx);
    const t0 = mx.now();
    for (const [name, phys, n, gap] of PLAN) {
      for (const use of [false, true]) {
        REC.use = use;
        marks.push([mx.now() - t0, name + (use ? ', recorded' : ', synthesized')]);
        for (let k = 0; k < n; k++) { syn.play(name, Object.assign({}, phys), { when: mx.now() + 0.05 }); await sleep(gap * 1000); }
        await sleep(900);
      }
    }
    REC.use = true;
    // the bed: the arena's own crowd at a level (stakes set to reach it), synthesized, then recorded (in at once here)
    const fade = CR.fadeIn; CR.fadeIn = 0.05;
    for (const [lvl, secs] of BEDS) for (const use of [false, true]) {
      CR.use = use;
      const host = { S: { settings: { arenaSound: true, volume: 0.7 } }, stakes: { level: 0 }, uIdx: 0, speed: () => 1, mx };
      const au = PBC.ArenaAudio.create(host), CC = PBC.AudioConfig.crowd;
      const s = { stakes: (lvl - CC.bedBase) / CC.bedStakes, late: false, close: false, playing: true, speed: 1, off: 0 };
      au.update(0, s);
      marks.push([mx.now() - t0, `the crowd bed at level ${lvl}, ${use ? 'recorded' : 'synthesized'}`]);
      const iv = setInterval(() => { au.update(0.05, s); mx.update(); }, 50);
      await sleep(secs * 1000);
      clearInterval(iv);
      au.destroy();
      await sleep(200);
    }
    CR.fadeIn = fade; CR.use = true;
    const secs = mx.now() - t0 + 0.5;
    const rec = await mx.recording(secs);   // (the mixer's own recording, every sample on the audio clock)
    // a 16-bit stereo WAV of it
    const n = rec.L.length, buf = new ArrayBuffer(44 + n * 4), dv = new DataView(buf), str = (p, x) => { for (let i = 0; i < x.length; i++) dv.setUint8(p + i, x.charCodeAt(i)); };
    str(0, 'RIFF'); dv.setUint32(4, 36 + n * 4, true); str(8, 'WAVE'); str(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 2, true);
    dv.setUint32(24, rec.sampleRate, true); dv.setUint32(28, rec.sampleRate * 4, true); dv.setUint16(32, 4, true); dv.setUint16(34, 16, true); str(36, 'data'); dv.setUint32(40, n * 4, true);
    for (let i = 0; i < n; i++) { dv.setInt16(44 + i * 4, Math.max(-1, Math.min(1, rec.L[i])) * 32767, true); dv.setInt16(46 + i * 4, Math.max(-1, Math.min(1, rec.R[i])) * 32767, true); }
    let b = ''; const u = new Uint8Array(buf);
    for (let i = 0; i < u.length; i += 0x8000) b += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    const start = rec.start - t0;
    mx.destroy();
    return { wav: btoa(b), marks: marks.map(([t, l]) => [+(t - start).toFixed(2), l]), seconds: n / rec.sampleRate };
  }, [PLAN, BEDS]);
  await browser.close();
  fs.writeFileSync(path.join(o.out, 'recab.wav'), Buffer.from(r.wav, 'base64'));
  const L = [`The recorded sounds against the synthesized ones, through the mixer (volume 0.7): recab.wav, ${r.seconds.toFixed(1)} s`, ''];
  for (const [t, l] of r.marks) L.push(`${t.toFixed(1).padStart(6)} s  ${l}`);
  L.push('', `errors: ${errs.length}${errs.length ? ' ' + errs.slice(0, 3).join(' | ') : ''}`);
  fs.writeFileSync(path.join(o.out, 'recab_result.txt'), L.join('\n') + '\n');
  console.log(L.join('\n'));
})();
