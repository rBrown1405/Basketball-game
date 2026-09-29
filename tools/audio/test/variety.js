#!/usr/bin/env node
// Trial 2: "the same sound played 10 times in a row never sounds identical", and each court sound's level.
//  1. Every court sound (every kind of squeak, every part of the rim, every body contact...) is played 10 times in a
//     row with exactly the same physics (how hard, how high, the same spot) into an offline audio context: the exact
//     samples, no room, no mixer. Each hit is compared with every other one. Two hits "sound identical" when their
//     waveforms correlate at 0.98 or more (the same samples, near enough), or when none of these differences a
//     listener can hear is there: 1 dB of level, 1% of pitch (a tonal sound's strongest frequency), 1.5 dB in some
//     third-octave band of the spectrum (timbre), 15% in how long it rings (to 20 dB down). It also lists the take
//     each hit used and the pitch and level it got on top.
//     Writes variety_<sound>.wav (the 10 in a row, 1 s apart: listen to them) and variety_result.txt.
//  2. Levels: each sound 4 times through the real mixer (as Trial 1's A/B measured them: at the speakers, volume 0.7,
//     not placed), mean energy in its window and peak (dBFS), next to what Trial 1 measured for that sound.
//   node tools/audio/test/variety.js [--only dribble,rim.front] [--out audit/audio2]
'use strict';
const fs = require('fs'), path = require('path');
const T = require('./common.js');
const o = T.args({ only: '', out: 'audit/audio2' });

// [label, sound, physics, spacing s, analysis window s]
const SOUNDS = [
  ['dribble', 'dribble', { e: 0.7, tight: 0.5 }, 1, 0.35],
  ['dribble low and quick', 'dribble', { e: 0.8, tight: 0.9 }, 1, 0.35],
  ['dribble high', 'dribble', { e: 0.8, tight: 0.1 }, 1, 0.35],
  ['bounce', 'bounce', { e: 0.7 }, 1, 0.35],
  ['squeak cut', 'squeak', { e: 0.6, kind: 'cut', variant: 'cut' }, 1, 0.3],
  ['squeak stop', 'squeak', { e: 0.6, kind: 'stop', variant: 'stop' }, 1, 0.4],
  ['squeak pivot', 'squeak', { e: 0.6, kind: 'pivot', variant: 'pivot' }, 1, 0.2],
  ['squeak slide', 'squeak', { e: 0.6, kind: 'slide', variant: 'slide' }, 1, 0.15],
  ['squeak jump stop', 'squeak', { e: 0.6, kind: 'jumpstop', variant: 'jumpstop' }, 1, 0.3],
  ['step', 'step', { e: 0.6, mass: 1 }, 1, 0.2],
  ['land', 'land', { e: 0.7, mass: 1 }, 1, 0.3],
  ['catch', 'catch', { e: 0.7 }, 1, 0.2],
  ['pass', 'pass', { e: 0.7, whoosh: true }, 1, 0.3],
  ['body bump', 'body', { e: 0.6, kind: 'bump', variant: 'bump' }, 1, 0.25],
  ['body screen', 'body', { e: 0.6, kind: 'screen', variant: 'screen' }, 1, 0.25],
  ['body box-out', 'body', { e: 0.6, kind: 'boxout', variant: 'boxout' }, 1, 0.3],
  ['body post-up', 'body', { e: 0.6, kind: 'post', variant: 'post' }, 1, 0.25],
  ['fall', 'fall', { e: 1, mass: 1 }, 1.2, 0.6],
  ['rim front', 'rim', { e: 0.9, part: 'front', variant: 'front' }, 1.5, 0.9],
  ['rim back', 'rim', { e: 0.9, part: 'back', variant: 'back' }, 1.5, 0.9],
  ['rim side', 'rim', { e: 0.9, part: 'side', variant: 'side' }, 1.5, 0.9],
  ['rim soft', 'rim', { e: 0.3, part: 'soft', variant: 'soft' }, 1, 0.5],
  ['rim rattle', 'rim', { e: 0.6, part: 'rattle', variant: 'rattle' }, 1, 0.6],
  ['board', 'board', { e: 0.9 }, 1.2, 0.6],
  ['swish', 'swish', { e: 1 }, 1, 0.6],
  ['net (in off the rim)', 'net', { e: 1 }, 1, 0.6],
  ['dunk', 'dunk', { e: 1 }, 2, 1.5],
  ['block', 'block', { e: 1 }, 1, 0.3],
  ['roll', 'roll', { e: 0.5, v0: 6, T: 1.5 }, 2.2, 1.6],
  ['rim roll', 'rimroll', { e: 0.8, T: 0.6 }, 1.2, 0.8],
  ['whistle', 'whistle', { e: 1, len: 0.6, variant: 'foul' }, 1.2, 0.8],
  ['shot clock buzzer', 'buzzer', { e: 1 }, 1.6, 1.2],
  ['horn', 'horn', { e: 1 }, 2.2, 1.8],
];
// Trial 1's levels for the sounds it had (audit/audio1/ab_result.txt, "new"): mean energy, peak (dBFS)
const TRIAL1 = { dribble: [-34.7, -14.7], bounce: [-34.4, -14.7], squeak: [-44.5, -30.1], rim: [-35.7, -13.9], board: [-32.6, -15.1], swish: [-45.9, -23.7], net: [-41.6, -20.5], dunk: [-25.3, -3.1], block: [-34.4, -13.2], whistle: [-27.0, -13.6], horn: [-32.1, -19.8] };

(async () => {
  const only = o.only ? String(o.only).split(',') : null;
  const list = SOUNDS.filter((s) => !only || only.includes(s[0]) || only.includes(s[1]) || only.includes(s[1] + '.' + (s[2].variant || '')));
  const browser = await T.launch(o);
  const page = await browser.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('file://' + path.join(o.repo, 'index.html') + '?low=1');
  await page.waitForTimeout(600);
  const L = ['Trial 2: each court sound 10 times in a row with the same physics (offline, the exact samples)', ''];
  L.push('sound                     takes used                        pitch range   level range   top corr  least band diff  identical pairs');
  const res = [];
  for (const [label, name, phys, S, W] of list) {
    const r = await page.evaluate(async ([name, phys, S, W]) => {
      PBC.AudioRandom.seed(20260929);
      const sr = 48000, N = 10, dur = S * N + 0.5;
      const off = new OfflineAudioContext(1, Math.ceil(sr * dur), sr);
      const fake = { ctx: off, now: () => 0, stop() {},
        play(n, v, build, oo) { const out = off.createGain(); out.connect(off.destination); const V = { t0: (oo && oo.when) || 0, out, end: 0, src(node, stop) { if (stop > this.end) this.end = stop; return node; } }; build(V, v); return V; } };
      const syn = PBC.CourtSynth.create(fake);
      const meta = [];
      for (let k = 0; k < N; k++) { const vo = syn.play(name, Object.assign({}, phys), { when: 0.05 + k * S }); meta.push(vo && vo.meta); }
      const buf = await off.startRendering(), d = buf.getChannelData(0);
      // each hit's window
      const w = Math.floor(W * sr), hits = [];
      for (let k = 0; k < N; k++) { const i0 = Math.floor((0.05 + k * S) * sr); hits.push(d.subarray(i0, i0 + w)); }
      // waveform correlation, best over +-1 ms
      const corr = (a, b) => {
        let ea = 0, eb = 0;
        for (let i = 0; i < a.length; i++) { ea += a[i] * a[i]; eb += b[i] * b[i]; }
        let best = 0;
        for (let lag = -48; lag <= 48; lag += 2) {
          let s = 0;
          const lo = Math.max(0, -lag), hi = Math.min(a.length, b.length - lag);
          for (let i = lo; i < hi; i++) s += a[i] * b[i + lag];
          const c = s / Math.sqrt(ea * eb || 1);
          if (c > best) best = c;
        }
        return best;
      };
      // third-octave band levels (dB) of the window, from an FFT
      const fftN = 1 << Math.ceil(Math.log2(Math.min(w, 32768)));
      const bands = (x) => {
        const re = new Float64Array(fftN), im = new Float64Array(fftN);
        for (let i = 0; i < Math.min(x.length, fftN); i++) re[i] = x[i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / Math.min(x.length, fftN)));
        for (let i = 1, j = 0; i < fftN; i++) { let bit = fftN >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { const t = re[i]; re[i] = re[j]; re[j] = t; } }
        for (let len = 2; len <= fftN; len <<= 1) {
          const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
          for (let i = 0; i < fftN; i += len) {
            let cr = 1, ci = 0;
            for (let k = 0; k < len / 2; k++) {
              const ur = re[i + k], ui = im[i + k], vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
              re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
              const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
            }
          }
        }
        const out = [];
        for (let fc = 50; fc < 16000; fc *= Math.pow(2, 1 / 3)) {
          const a = Math.floor(fc / Math.pow(2, 1 / 6) / sr * fftN), b = Math.ceil(fc * Math.pow(2, 1 / 6) / sr * fftN);
          let s = 0;
          for (let i = Math.max(1, a); i <= Math.min(fftN / 2 - 1, b); i++) s += re[i] * re[i] + im[i] * im[i];
          out.push(10 * Math.log10(s + 1e-12));
        }
        return out;
      };
      const B = hits.map(bands);
      const rms = hits.map((x) => { let s = 0; for (let i = 0; i < x.length; i++) s += x[i] * x[i]; return 10 * Math.log10(s / x.length + 1e-20); });
      // a tonal sound's strongest frequency (a parabola through the peak bin), or null when the spectrum is noise
      const peakHz = (x) => {
        const n = fftN, re = new Float64Array(n), im = new Float64Array(n);
        for (let i = 0; i < Math.min(x.length, n); i++) re[i] = x[i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / Math.min(x.length, n)));
        for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { const t = re[i]; re[i] = re[j]; re[j] = t; } }
        for (let len = 2; len <= n; len <<= 1) { const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang); for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) { const ur = re[i + k], ui = im[i + k], vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr; re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } } }
        const mag = new Float64Array(n / 2); let best = 1;
        for (let i = 1; i < n / 2; i++) { mag[i] = Math.hypot(re[i], im[i]); if (mag[i] > mag[best]) best = i; }
        const sorted = Array.from(mag.subarray(1)).sort((a, b) => a - b), med = sorted[sorted.length >> 1] || 1e-12;
        if (20 * Math.log10(mag[best] / med) < 30 || best < 2 || best > n / 2 - 2) return null;
        const a = Math.log(mag[best - 1] + 1e-20), b = Math.log(mag[best] + 1e-20), c = Math.log(mag[best + 1] + 1e-20);
        return (best + 0.5 * (a - c) / (a - 2 * b + c || 1)) * sr / n;
      };
      // how long it rings: from its loudest 5 ms to 20 dB below it
      const ring = (x) => {
        const fr = 240, lv = [];
        for (let i = 0; i + fr <= x.length; i += fr) { let s = 0; for (let k = 0; k < fr; k++) s += x[i + k] * x[i + k]; lv.push(10 * Math.log10(s / fr + 1e-20)); }
        let pi = 0; for (let i = 1; i < lv.length; i++) if (lv[i] > lv[pi]) pi = i;
        let j = pi; while (j < lv.length - 1 && lv[j] > lv[pi] - 20) j++;
        return (j - pi + 1) * fr / sr;
      };
      const pk = hits.map(peakHz), rg = hits.map(ring);
      // the loudest band of all hits: bands more than 40 dB under it are left out (only what can be heard counts)
      const top = Math.max(...B.flat());
      let topCorr = 0, leastDiff = 1e9, same = 0;
      const pairs = [], sameList = [];
      for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
        const c = corr(hits[i], hits[j]);
        let md = 0;
        for (let k = 0; k < B[i].length; k++) if (Math.max(B[i][k], B[j][k]) > top - 40) md = Math.max(md, Math.abs(B[i][k] - B[j][k]));
        const dl = Math.abs(rms[i] - rms[j]), df = pk[i] && pk[j] ? Math.abs(Math.log(pk[i] / pk[j])) * 100 : 0, dr = Math.abs(rg[i] - rg[j]) / Math.max(rg[i], rg[j]) * 100;
        topCorr = Math.max(topCorr, c); leastDiff = Math.min(leastDiff, md);
        const heard = md >= 1.5 || dl >= 1 || df >= 1 || dr >= 15;
        if (c >= 0.98 || !heard) { same++; sameList.push([i + 1, j + 1, +c.toFixed(3), +md.toFixed(1), +dl.toFixed(1), +df.toFixed(2), +dr.toFixed(0)]); }
        pairs.push([i, j, +c.toFixed(3), +md.toFixed(1)]);
      }
      // a 16-bit WAV of the whole run
      const n = d.length, wav = new ArrayBuffer(44 + n * 2), dv = new DataView(wav), str = (p, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(p + i, s.charCodeAt(i)); };
      let peak = 0; for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(d[i]));
      const g = peak > 0 ? 0.7 / peak : 1;   // (normalised to -3 dBFS for listening; the levels are in part 2)
      str(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
      dv.setUint32(24, sr, true); dv.setUint32(28, sr * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); str(36, 'data'); dv.setUint32(40, n * 2, true);
      for (let i = 0; i < n; i++) dv.setInt16(44 + i * 2, Math.max(-1, Math.min(1, d[i] * g)) * 32767, true);
      let s = ''; const u = new Uint8Array(wav);
      for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
      return { meta, topCorr, leastDiff, same, sameList, rms, pairs, wav: btoa(s) };
    }, [name, phys, S, W]);
    const file = 'variety_' + label.replace(/[^a-z0-9]+/gi, '_').replace(/_+$/, '').toLowerCase() + '.wav';
    fs.writeFileSync(path.join(o.out, file), Buffer.from(r.wav, 'base64'));
    const takes = r.meta.map((m) => (m ? m.take : '?')).join(' ');
    const pr = r.meta.map((m) => (m ? m.pitch : 1)), lv = r.meta.map((m) => (m ? 20 * Math.log10(m.level) : 0));
    const repeats = r.meta.filter((m, i) => i > 0 && m && r.meta[i - 1] && m.take === r.meta[i - 1].take).length;
    const ok = r.same === 0 && repeats === 0;
    res.push({ label, ok, file });
    L.push(`${label.padEnd(25)} ${takes.padEnd(33)} ${((Math.min(...pr) - 1) * 100).toFixed(1).padStart(5)}..${((Math.max(...pr) - 1) * 100).toFixed(1)}%   ${Math.min(...lv).toFixed(1).padStart(5)}..${Math.max(...lv).toFixed(1)} dB   ${r.topCorr.toFixed(3)}     ${r.leastDiff.toFixed(1).padStart(5)} dB        ${r.same}${repeats ? ' (take repeated ' + repeats + 'x)' : ''}  ${ok ? 'OK' : 'SAME'}`);
    if (r.sameList.length) L.push(`   pairs that could pass as the same (hit, hit, corr, band dB, level dB, pitch %, ring %): ${JSON.stringify(r.sameList.slice(0, 6))}`);
    console.log(L[L.length - 1]);
  }
  await page.close();

  // ---- 2. levels through the real mixer
  const lv = await browser.newPage();
  lv.on('pageerror', (e) => errs.push(e.message));
  await lv.addInitScript(T.TAP);
  await lv.goto('file://' + path.join(o.repo, 'index.html') + '?low=1');
  await lv.waitForTimeout(600);
  const levels = await lv.evaluate(async (list) => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    PBC.AudioBus.reset(); PBC.AudioRandom.seed(987654321);
    const mx = PBC.AudioMixer.create({ volume: 0.7 });
    mx.unlock();
    await sleep(700);
    const c = mx.ctx, syn = PBC.CourtSynth.create(mx);
    const out = {};
    window.__tap.rec = true; window.__tap.only = c;
    await sleep(200);
    const hits = [];
    for (const [label, name, phys, S] of list) {
      for (let k = 0; k < 4; k++) { const t = c.currentTime + 0.05; syn.play(name, Object.assign({}, phys), { when: t }); hits.push({ label, t, w: Math.min(S, 1.5) }); await sleep(Math.max(900, S * 1000)); }
    }
    await sleep(400);
    window.__tap.rec = false;
    const T = window.__tap, sr = T.sr;
    for (const h of hits) {
      let ss = 0, n = 0, pk = 0;
      for (let k = 0; k < T.times.length; k++) {
        const a = T.times[k], L = T.pcm[0][k], R = T.pcm[1][k], len = L.length;
        if (a + len / sr < h.t || a > h.t + h.w) continue;
        const i0 = Math.max(0, Math.floor((h.t - a) * sr)), i1 = Math.min(len, Math.ceil((h.t + h.w - a) * sr));
        for (let i = i0; i < i1; i++) { ss += L[i] * L[i] + R[i] * R[i]; n += 2; pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i])); }
      }
      const e = out[h.label] || (out[h.label] = { ms: [], pk: 0 });
      e.ms.push(n ? ss / n : 0); e.pk = Math.max(e.pk, pk);
    }
    return out;
  }, list);
  await browser.close();
  L.push('', 'Levels through the mixer (at the speakers, volume 0.7, not placed): mean energy in the window and peak, dBFS; Trial 1 for the sounds it had');
  const db = (x) => 10 * Math.log10(Math.max(1e-12, x));
  for (const [label, name] of list) {
    const e = levels[label];
    if (!e) continue;
    const m = db(e.ms.reduce((a, b) => a + b, 0) / e.ms.length), p = 20 * Math.log10(Math.max(1e-9, e.pk));
    const t1 = TRIAL1[name];
    L.push(`${label.padEnd(25)} mean ${m.toFixed(1).padStart(6)}  peak ${p.toFixed(1).padStart(6)}${t1 ? `      Trial 1: mean ${t1[0].toFixed(1)}  peak ${t1[1].toFixed(1)}` : ''}`);
  }
  const bad = res.filter((r) => !r.ok);
  L.push('', `errors: ${errs.length}${errs.length ? ' ' + errs.slice(0, 3).join(' | ') : ''}`);
  L.push(`never identical in 10 in a row (no two of the 10 correlating at 0.98+, every pair apart by a difference a listener can hear, no take twice running): ${res.length - bad.length}/${res.length} sounds${bad.length ? ' (not: ' + bad.map((b) => b.label).join(', ') + ')' : ''}`);
  L.push(bad.length || errs.length ? 'RESULT: FAIL' : 'RESULT: PASS');
  const txt = L.join('\n');
  fs.writeFileSync(path.join(o.out, 'variety_result.txt'), txt + '\n');
  console.log(txt.split('\n').slice(-(list.length + 6)).join('\n'));
})();
