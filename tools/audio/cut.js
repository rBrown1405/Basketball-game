#!/usr/bin/env node
// Cuts a folder's recordings out of the downloads they come from, following assets/audio/<folder>/cuts.json, and
// writes them into assets/audio/<folder>/ for tools/audio/pack.js. The downloads themselves stay out of the
// repository (a license like Pixabay's lets a game ship its edited sounds, not the original files on their own).
//
//   node tools/audio/cut.js <folder> --src <folder with the downloads>     e.g.  node tools/audio/cut.js court --src ~/sfx
//
// A download is found by its file name (also with a prefix before it, like the "5904d8b4-" an upload gets).
//   hits   one-shots (a dribble, a swish): each take starts `pre` s before its onset (the first sample within a few
//          ms of `at` to reach onsetK of the hit's peak), fades in over that and out over its last fadeOut s, and is
//          levelled so the first normS s after the onset are at rmsDb (so the game's physics set how loud a hit
//          is, not how the recording happened to be made); an optional highpass (hp, Hz) takes out rumble. 16-bit
//          mono WAV at the recipe's rate: a hit must start on time, and an MP3 starts late by its encoder delay.
//   loops  a bed that plays for a whole game: its parts (stretches of the recording, [from, to] s) each levelled
//          by a slow gain that follows a flattenS s average (the stretch's own swells stay, its drift goes), joined
//          with xfade s equal-power crossfades, its end crossfaded into its start so it loops loopS s exactly,
//          then written with rollS s of its own end before it and of its start after it: the game loops
//          [rollS, rollS + loopS], so whatever delay an MP3 decoder adds only shifts where in the loop it starts.
//          Mono MP3 (lamejs, build time only: npm install in tools/audio). Each loop is then decoded as a browser
//          decodes it (at 48 and 44.1 kHz) and checked: the stretch before the loop's start must match the stretch
//          before its end (the file's lead-in is a copy of the loop's end), or the loop would jump where it wraps.
'use strict';
const fs = require('fs'), path = require('path');
const T = require('./test/common.js');

const repo = path.resolve(__dirname, '..', '..');
const argv = process.argv.slice(2);
const folder = argv.find((a, i) => !a.startsWith('--') && (i === 0 || !argv[i - 1].startsWith('--')));
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
if (!folder) { console.log('usage: node tools/audio/cut.js <folder> --src <folder with the downloads>'); process.exit(1); }
const dir = path.join(repo, 'assets', 'audio', folder);
const recipe = JSON.parse(fs.readFileSync(path.join(dir, 'cuts.json'), 'utf8'));
const srcDir = path.resolve(opt('src', path.join(repo, 'tools', 'audio', 'sources')));

/** the download for a source name: the file itself, or one that ends in "-" + its name */
function findSource(name) {
  const files = fs.existsSync(srcDir) ? fs.readdirSync(srcDir) : [];
  const f = files.find((x) => x === name) || files.find((x) => x.endsWith('-' + name));
  if (!f) throw new Error(`no download "${name}" in ${srcDir} (--src)`);
  return path.join(srcDir, f);
}

// ------------------------------------------------------------ decoding (Chromium's own decoders, mono at a rate)
async function decodeAll(list) {
  const browser = await T.launch({});
  const page = await browser.newPage();
  await page.goto('about:blank');
  const out = {};
  for (const { key, file, rate } of list) {
    const b64 = fs.readFileSync(file).toString('base64');
    const r = await page.evaluate(async ([b64, rate]) => {
      const bin = atob(b64), u = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      const buf = await new OfflineAudioContext(1, 1, rate).decodeAudioData(u.buffer);
      const n = buf.length, ch = buf.numberOfChannels, x = new Float32Array(n);
      for (let c = 0; c < ch; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) x[i] += d[i] / ch; }
      const b = new Uint8Array(x.buffer); let s = '';
      for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
      return { rate: buf.sampleRate, channels: ch, pcm: btoa(s) };
    }, [b64, rate]);
    const bytes = Buffer.from(r.pcm, 'base64');
    out[key] = { rate: r.rate, channels: r.channels, x: new Float32Array(bytes.buffer, bytes.byteOffset, bytes.length / 4).slice() };
  }
  await browser.close();
  return out;
}

// ------------------------------------------------------------ signal helpers
const db = (v) => 20 * Math.log10(v + 1e-12), undb = (d) => Math.pow(10, d / 20);
function rms(x, a, b) { let s = 0; a = Math.max(0, a); b = Math.min(x.length, b); for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / Math.max(1, b - a)); }
function peak(x) { let p = 0; for (let i = 0; i < x.length; i++) p = Math.max(p, Math.abs(x[i])); return p; }
/** a 2nd-order Butterworth highpass or lowpass (RBJ), in place */
function biquad(x, rate, type, f) {
  const w = 2 * Math.PI * f / rate, c = Math.cos(w), al = Math.sin(w) / (2 * Math.SQRT1_2);
  let b0, b1, b2;
  if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; } else { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; }
  const a0 = 1 + al, a1 = -2 * c, a2 = 1 - al;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = x[i], y = (b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = v; y2 = y1; y1 = y; x[i] = y;
  }
  return x;
}

// ------------------------------------------------------------ hits
function cutHit(src, g, at, o) {
  const x = src.x, sr = src.rate;
  // the onset: the first sample near `at` that reaches onsetK of the hit's peak
  const w0 = Math.max(0, Math.round((at - 0.02) * sr)), w1 = Math.min(x.length, Math.round((at + 0.08) * sr));
  let pk = 0; for (let i = w0; i < w1; i++) pk = Math.max(pk, Math.abs(x[i]));
  let on = w0; while (on < w1 && Math.abs(x[on]) < o.onsetK * pk) on++;
  const i0 = Math.max(0, on - Math.round(o.pre * sr)), n = Math.round(o.len * sr);
  const y = new Float32Array(n);
  for (let i = 0; i < n; i++) y[i] = x[i0 + i] || 0;
  const fi = Math.max(1, Math.round(o.fadeIn * sr)), fo = Math.max(1, Math.round(o.fadeOut * sr));
  for (let i = 0; i < fi && i < n; i++) y[i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / fi);
  for (let i = 0; i < fo && i < n; i++) y[n - 1 - i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / fo);
  // levelled on its body, never past maxPeakDb
  const onI = on - i0, body = rms(y, onI, onI + Math.round(o.normS * sr));
  let k = undb(o.rmsDb) / Math.max(1e-9, body);
  const p = peak(y) * k;
  if (p > undb(o.maxPeakDb)) k *= undb(o.maxPeakDb) / p;
  for (let i = 0; i < n; i++) y[i] *= k;
  return { y, onsetS: (on / sr), preS: onI / sr, gainDb: db(k), peakDb: db(peak(y)), bodyDb: db(body * k) };
}

function wav16(y, rate) {
  const n = y.length, b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(y[i] * 32767))), 44 + i * 2);
  return b;
}

// ------------------------------------------------------------ loops
/** a stretch levelled by a slow gain: target / (its rms over flattenS s around each point) */
function flattened(src, a, b, flattenS, target) {
  const x = src.x, sr = src.rate, i0 = Math.round(a * sr), i1 = Math.round(b * sr), h = Math.round(flattenS * sr / 2);
  const y = new Float32Array(i1 - i0);
  // running sum of squares over [i - h, i + h] (clamped to the recording)
  let s = 0, lo = Math.max(0, i0 - h), hi = Math.max(0, i0 - h);
  for (let i = i0; i < i1; i++) {
    const want0 = Math.max(0, i - h), want1 = Math.min(x.length, i + h);
    while (hi < want1) { s += x[hi] * x[hi]; hi++; }
    while (lo < want0) { s -= x[lo] * x[lo]; lo++; }
    const r = Math.sqrt(Math.max(1e-12, s / Math.max(1, hi - lo)));
    y[i - i0] = x[i] * (target / r);
  }
  return y;
}
function makeLoop(src, o) {
  const sr = src.rate, X = Math.round(o.xfade * sr), target = undb(o.rmsDb);
  // the parts, levelled and joined end to start with equal-power crossfades
  let j = null;
  for (const [a, b] of o.parts) {
    const p = flattened(src, a, b, o.flattenS, target);
    if (!j) { j = p; continue; }
    const m = new Float32Array(j.length + p.length - X);
    m.set(j.subarray(0, j.length - X));
    for (let i = 0; i < X; i++) { const t = (i + 0.5) / X; m[j.length - X + i] = j[j.length - X + i] * Math.cos(t * Math.PI / 2) + p[i] * Math.sin(t * Math.PI / 2); }
    m.set(p.subarray(X), j.length);
    j = m;
  }
  const L = Math.round(o.loopS * sr);
  if (j.length < L + X) throw new Error(`the parts make ${(j.length / sr).toFixed(2)} s with their crossfades: too short for a ${o.loopS} s loop (${((L + X) / sr).toFixed(2)} s needed)`);
  // the loop: its first X samples are the stretch after its end crossfaded into its start
  const B = new Float32Array(L);
  B.set(j.subarray(0, L));
  for (let i = 0; i < X; i++) { const t = (i + 0.5) / X; B[i] = j[L + i] * Math.cos(t * Math.PI / 2) + j[i] * Math.sin(t * Math.PI / 2); }
  // levelled as a whole, then rolled: [end rollS] + loop + [start rollS]
  const k = target / rms(B, 0, L);
  for (let i = 0; i < L; i++) B[i] *= k;
  const P = Math.round(o.rollS * sr), y = new Float32Array(P + L + P);
  y.set(B.subarray(L - P), 0); y.set(B, P); y.set(B.subarray(0, P), P + L);
  return { y, parts: (j.length / sr), peakDb: db(peak(B)), rmsDb: db(rms(B, 0, L)) };
}
/** the loops as a browser decodes them: the 0.1 s before the loop's start against the 0.1 s before its end */
async function checkLoops(list) {
  const browser = await T.launch({});
  const page = await browser.newPage();
  await page.goto('about:blank');
  const out = [];
  for (const { file, loopS, rollS } of list) {
    const r = await page.evaluate(async ([b64, loopS, rollS]) => {
      const bin = atob(b64), u = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      const res = [];
      for (const rate of [48000, 44100]) {
        const buf = await new OfflineAudioContext(1, 1, rate).decodeAudioData(u.buffer.slice(0));
        const x = buf.getChannelData(0), sr = buf.sampleRate, P = Math.round(rollS * sr), L = Math.round(loopS * sr), w = Math.round(0.1 * sr);
        let ab = 0, aa = 0, bb = 0;
        for (let k = 1; k <= w; k++) { const a = x[P - k], b = x[P + L - k]; ab += a * b; aa += a * a; bb += b * b; }
        res.push([rate, ab / Math.sqrt(aa * bb || 1)]);
      }
      return res;
    }, [fs.readFileSync(file).toString('base64'), loopS, rollS]);
    out.push({ file: path.basename(file), r });
  }
  await browser.close();
  return out;
}
async function mp3(y, rate, kbps) {
  const m = await import('@breezystack/lamejs');
  const lame = m.default || m;
  const enc = new lame.Mp3Encoder(1, rate, kbps), chunks = [];
  const pcm = new Int16Array(y.length);
  for (let i = 0; i < y.length; i++) pcm[i] = Math.max(-32768, Math.min(32767, Math.round(y[i] * 32767)));
  for (let i = 0; i < pcm.length; i += 1152) { const c = enc.encodeBuffer(pcm.subarray(i, i + 1152)); if (c.length) chunks.push(Buffer.from(c)); }
  const f = enc.flush(); if (f.length) chunks.push(Buffer.from(f));
  return Buffer.concat(chunks);
}

// ------------------------------------------------------------ the recipe
(async () => {
  const H = recipe.hits, Lp = recipe.loops, need = [];
  const want = (s, rate) => { const key = s + '@' + rate; if (!need.find((n) => n.key === key)) need.push({ key, file: findSource(recipe.sources[s]), rate }); return key; };
  if (H) for (const groups of Object.values(H.sounds)) for (const g of [].concat(groups)) want(g.src, H.rate);
  if (Lp) for (const l of Object.values(Lp.sounds)) want(l.src, Lp.rate);
  const dec = await decodeAll(need);
  const lines = [], wrote = [];
  if (H) {
    for (const [name, groups] of Object.entries(H.sounds)) {
      let k = 0;
      for (const g0 of [].concat(groups)) {
        const g = Object.assign({}, H.defaults, g0);
        const d = dec[g.src + '@' + H.rate];
        const src = g.hp ? { rate: d.rate, x: biquad(d.x.slice(), d.rate, 'hp', g.hp) } : d;
        for (const at of g.at) {
          const r = cutHit(src, g, at, g);
          const f = `${name}_${String(++k).padStart(2, '0')}.wav`;
          fs.writeFileSync(path.join(dir, f), wav16(r.y, src.rate));
          wrote.push(f);
          lines.push(`${f.padEnd(16)} ${recipe.sources[g.src]} at ${r.onsetS.toFixed(3)} s (asked ${at}), ${(r.y.length / src.rate).toFixed(3)} s, onset ${Math.round(r.preS * 1000)} ms in, gain ${r.gainDb.toFixed(1)} dB, body ${r.bodyDb.toFixed(1)} dBFS, peak ${r.peakDb.toFixed(1)} dBFS`);
        }
      }
    }
  }
  let seamOk = true;
  if (Lp) {
    const made = [];
    for (const [name, l0] of Object.entries(Lp.sounds)) {
      const l = Object.assign({}, Lp.defaults, l0);
      const src = dec[l.src + '@' + Lp.rate];
      const r = makeLoop(src, l);
      const f = `${name}_01.mp3`;
      fs.writeFileSync(path.join(dir, f), await mp3(r.y, src.rate, Lp.kbps));
      wrote.push(f);
      made.push({ file: path.join(dir, f), loopS: l.loopS, rollS: l.rollS });
      lines.push(`${f.padEnd(16)} ${recipe.sources[l.src]} parts ${l.parts.map((p) => p.join('-')).join(', ')} s (${r.parts.toFixed(2)} s joined), loop ${l.loopS} s + ${l.rollS} s each side, rms ${r.rmsDb.toFixed(1)} dBFS, peak ${r.peakDb.toFixed(1)} dBFS, ${Lp.kbps} kbps at ${src.rate} Hz`);
    }
    for (const c of await checkLoops(made)) {
      const ok = c.r.every(([, k]) => k >= 0.95);
      seamOk = seamOk && ok;
      lines.push(`${c.file.padEnd(16)} decoded, where it wraps: ${c.r.map(([rate, k]) => `${rate / 1000} kHz ${k.toFixed(3)}`).join(', ')} (the lead-in against the loop's end, 1 = the same): ${ok ? 'seamless' : 'NOT SEAMLESS'}`);
    }
  }
  // (files a recipe no longer makes are left for a person to remove: they may be from somewhere else)
  const stale = fs.readdirSync(dir).filter((f) => /\.(wav|mp3|ogg)$/i.test(f) && !wrote.includes(f));
  console.log(lines.join('\n'));
  if (stale.length) console.log('not made by this recipe (left as they are): ' + stale.join(', '));
  if (!seamOk) process.exit(1);
})().catch((e) => { console.error('cut: ' + e.message); process.exit(1); });
