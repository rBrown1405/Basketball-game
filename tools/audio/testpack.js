#!/usr/bin/env node
// The test pack: three short tones made here (no recording, no outside license) in assets/audio/test/, used by the
// audio console's test buttons to prove that packs load, decode and play on every bus. Then pack it:
//   node tools/audio/testpack.js && node tools/audio/pack.js test
'use strict';
const fs = require('fs'), path = require('path');
const dir = path.resolve(__dirname, '..', '..', 'assets', 'audio', 'test');
fs.mkdirSync(dir, { recursive: true });
const SR = 22050, SECS = 0.35, PEAK = 0.4;
// three takes of "tone": A4, C#5 and E5 (an A major chord, one note per take)
const takes = [['tone_01.wav', 440], ['tone_02.wav', 554.37], ['tone_03.wav', 659.26]];
for (const [file, hz] of takes) {
  const n = Math.round(SR * SECS), data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    const t = i / SR, fade = Math.min(1, t / 0.01, (SECS - t) / 0.06);
    data.writeInt16LE(Math.round(Math.sin(2 * Math.PI * hz * t) * PEAK * Math.max(0, fade) * 32767), i * 2);
  }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 2, 28); h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  fs.writeFileSync(path.join(dir, file), Buffer.concat([h, data]));
  console.log(file, hz + ' Hz', (44 + data.length) + ' bytes');
}
