#!/usr/bin/env node
// WAV recordings to small Opus WebM files (the browser's own encoder, in real time), so test clips can be kept and
// shared: a minute of stereo is ~0.7 MB instead of ~10 MB.
//   node tools/audio/webm.js audit/audio1/listen_60s.wav [more.wav ...] [--kbps 96]
'use strict';
const fs = require('fs'), path = require('path');
const T = require('./test/common.js');
const files = process.argv.slice(2).filter((a) => a.endsWith('.wav'));
const ki = process.argv.indexOf('--kbps'), kbps = ki > 0 ? +process.argv[ki + 1] : 96;
if (!files.length) { console.log('usage: node tools/audio/webm.js <file.wav> [...] [--kbps 96]'); process.exit(2); }
(async () => {
  const browser = await T.launch({});
  const page = await browser.newPage();
  await page.goto('about:blank');
  for (const f of files) {
    const b64 = fs.readFileSync(f).toString('base64');
    const t0 = Date.now();
    const out = await page.evaluate(([b64, kbps]) => new Promise((res, rej) => {
      const bin = atob(b64), u = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      const c = new AudioContext();
      c.decodeAudioData(u.buffer).then((buf) => {
        const src = c.createBufferSource(), dst = c.createMediaStreamDestination();
        src.buffer = buf; src.connect(dst);
        const rec = new MediaRecorder(dst.stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: kbps * 1000 });
        const chunks = [];
        rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
        rec.onstop = () => new Blob(chunks, { type: 'audio/webm' }).arrayBuffer().then((ab) => {
          let s = ''; const v = new Uint8Array(ab);
          for (let i = 0; i < v.length; i += 0x8000) s += String.fromCharCode.apply(null, v.subarray(i, i + 0x8000));
          c.close(); res({ b64: btoa(s), secs: buf.duration });
        });
        src.onended = () => setTimeout(() => rec.stop(), 150);
        rec.start(1000);
        src.start();
      }, rej);
    }), [b64, kbps]);
    const dest = f.replace(/\.wav$/, '.webm');
    fs.writeFileSync(dest, Buffer.from(out.b64, 'base64'));
    console.log(`${path.basename(f)} (${out.secs.toFixed(1)} s) → ${path.basename(dest)} ${(fs.statSync(dest).size / 1024).toFixed(0)} KB in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
  await browser.close();
})();
