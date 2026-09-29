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
//  2. Levels: each sound 4 times through the real mixer (volume 0.7, not placed), from the mixer's own recording (every
//     sample on the audio clock): mean energy in its window from the hit's start and peak (dBFS), next to what Trial 1
//     measured for the old sound (its A/B's tap windows started up to 0.3 s late: a reference, not a like for like).
//  3. The floor and the force: one take of the dribble on an arena's floor as the court's audio plays it (the field's
//     loudest and quietest wood, a painted lane, the logo, a dead spot, the apron, the courtside seats) and soft and
//     hard on plain wood: level, thump, ring and slap against plain wood (the paint's small difference for information).
//  The court pack's recordings play where it has them (the dribble, the bounce, the swish, the net, the glass, the pass),
//  as in the game; --synth 1 switches them off (the synthesized sounds only).
//   node tools/audio/test/variety.js [--only dribble,rim.front] [--synth 0] [--out audit/audio2]
'use strict';
const fs = require('fs'), path = require('path');
const T = require('./common.js');
const o = T.args({ only: '', synth: 0, out: 'audit/audio2' });
// in a page: the court pack decoded (or the recordings switched off with --synth 1) before anything plays
const PACKS = async (synth) => { if (synth) PBC.AudioConfig.court.rec.use = false; else await PBC.AudioAssets.loadAll(new OfflineAudioContext(1, 1, 48000)); };

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
  await page.evaluate(PACKS, o.synth);
  const L = [`Trial 2: each court sound 10 times in a row with the same physics (offline, the exact samples)${o.synth ? ', the synthesized sounds only' : ', the court pack\'s recordings where it has them (rec: take = recording/variant)'}`, ''];
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
    const takes = (r.meta[0] && r.meta[0].rec ? 'rec ' : '') + r.meta.map((m) => (m ? (m.rec ? m.file + (m.variant ? '/' + m.variant : '') : m.take) : '?')).join(' ');
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
  await lv.goto('file://' + path.join(o.repo, 'index.html') + '?low=1');
  await lv.waitForTimeout(600);
  await lv.evaluate(PACKS, o.synth);
  const levels = await lv.evaluate(async (list) => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    PBC.AudioBus.reset(); PBC.AudioRandom.seed(987654321);
    const out = {};
    // one sound at a time on a fresh mixer (its recorder keeps 30 s), measured from the mixer's own recording, every
    // sample on the audio clock: from each hit's start for its window, before the next
    for (const [label, name, phys, S] of list) {
      const mx = PBC.AudioMixer.create({ volume: 0.7 });
      mx.unlock();
      await sleep(700);
      const c = mx.ctx, syn = PBC.CourtSynth.create(mx), hits = [];
      for (let k = 0; k < 4; k++) { const vo = syn.play(name, Object.assign({}, phys), { when: c.currentTime + 0.05 }); hits.push({ t: vo ? vo.t0 : c.currentTime, w: Math.min(S, 1.5) }); await sleep(Math.max(900, S * 1000) + 100); }
      await sleep(300);
      const rec = await mx.recording(), sr = rec.sampleRate;
      const e = out[label] = { ms: [], pk: 0 };
      for (const h of hits) {
        let ss = 0, n = 0;
        const i0 = Math.max(0, Math.floor((h.t - rec.start) * sr)), i1 = Math.min(rec.L.length, i0 + Math.floor(h.w * sr));
        for (let i = i0; i < i1; i++) { ss += rec.L[i] * rec.L[i] + rec.R[i] * rec.R[i]; n += 2; e.pk = Math.max(e.pk, Math.abs(rec.L[i]), Math.abs(rec.R[i])); }
        e.ms.push(n ? ss / n : 0);
      }
      mx.destroy();
    }
    return out;
  }, list);

  // ---- 3. the floor under the ball, and how hard it comes down: one take of the dribble (no jitter) with the court's
  // own floor at a spot (an arena's field, a painted lane, the centre logo, a dead spot, the apron, the courtside
  // seats) and the floor's level and courtside muffle applied as the court's audio applies them, and on plain wood at
  // three speeds into the floor. Against plain wood: the level, the thump (below 250 Hz), the ring (the ball's cavity
  // modes, 900 Hz to 2.5 kHz) and the cover's slap (2.5 to 8 kHz), each band's energy, and the spectral centroid
  const fp = await browser.newPage();
  fp.on('pageerror', (e) => errs.push(e.message));
  await fp.goto('file://' + path.join(o.repo, 'index.html') + '?low=1');
  await fp.waitForTimeout(600);
  await fp.evaluate(PACKS, o.synth);
  const floor = await fp.evaluate(async () => {
    const sr = 48000, W = 0.35, S = 0.8;
    // an arena whose floor has a dead spot (a floor has none to two), its centre
    const quiet = { ctx: null, now: () => 0, play() { return null; }, stop() {} };
    let ca = null, dead = null, arena = null;
    for (const abbr of ['BOS', 'LAL', 'NYK', 'CHI', 'MIA', 'GSW', 'PHX', 'DEN', 'DAL', 'UTA', 'MIL', 'ATL', 'SAS', 'HOU']) {
      ca = PBC.CourtAudio.create({ mx: quiet, view: () => null, speed: () => 1, teams: [{ abbr }] });
      let best = 1;
      for (let x = 20; x <= 74; x += 0.25) for (let y = 4; y <= 46; y += 0.25) { const f = ca.floorAt(x, y); if (f.zone === 'dead' && f.ring < best) { best = f.ring; dead = [x, y]; } }
      if (dead) { arena = abbr; break; }
    }
    // plain wood: where the arena's field is at its middle (the reference), its loudest and its quietest
    let mid = null, hi = null, lo = null;
    for (let x = 22; x <= 72; x += 0.5) for (let y = 4; y <= 46; y += 0.5) {
      const f = ca.floorAt(x, y);
      if (f.zone !== 'wood') continue;
      if (!mid || Math.abs(f.db) < Math.abs(mid.f.db)) mid = { x, y, f };
      if (!hi || f.db > hi.f.db) hi = { x, y, f };
      if (!lo || f.db < lo.f.db) lo = { x, y, f };
    }
    const at = (x, y) => ({ x, y, f: ca.floorAt(x, y) });
    const cases = [
      ['plain wood (the reference)', mid, 0.7],
      ['plain wood, the field at its loudest', hi, 0.7],
      ['plain wood, the field at its quietest', lo, 0.7],
      ['a painted lane', at(8, 25), 0.7],
      ['the centre logo', at(47, 25), 0.7],
      ['a dead spot', dead ? at(dead[0], dead[1]) : null, 0.7],
      ['the apron (out of bounds)', at(47, -3), 0.7],
      ['the courtside seats', at(47, -9), 0.7],
      ['plain wood, a soft dribble', mid, 0.3],
      ['plain wood, a hard dribble', mid, 1.1],
    ].filter((c) => c[1]);
    const off = new OfflineAudioContext(1, Math.ceil(sr * (S * cases.length + 0.5)), sr);
    const fake = { ctx: off, now: () => 0, stop() {},
      play(n, v, build, oo) {
        const out = off.createGain(), P = oo && oo.place;
        let last = out;
        if (P) {
          const g = off.createGain(); g.gain.value = Math.pow(10, (P.db || 0) / 20); last.connect(g); last = g;
          if (P.lp && P.lp < 20000) { const f = off.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = P.lp; f.Q.value = -3.01; last.connect(f); last = f; }
        }
        last.connect(off.destination);
        const V = { t0: (oo && oo.when) || 0, out, end: 0, src(node, stop) { if (stop > this.end) this.end = stop; return node; } };
        build(V, v); return V;
      } };
    PBC.AudioRandom.seed(20260929);
    const syn = PBC.CourtSynth.create(fake);
    cases.forEach(([label, spot, e], k) => syn.play('dribble', { e, tight: 0.5, surf: spot.f, fixed: true }, { when: 0.05 + k * S, place: { pan: 0, db: spot.f.db, lp: spot.f.lp || 20000, wet: 0 } }));
    const d = (await off.startRendering()).getChannelData(0);
    const n = 16384, w = Math.floor(W * sr);
    return { arena, cases: cases.map(([label, spot, e], k) => {
      const i0 = Math.floor((0.05 + k * S) * sr), x = d.subarray(i0, i0 + w);
      let ms = 0; for (let i = 0; i < x.length; i++) ms += x[i] * x[i];
      const re = new Float64Array(n), im = new Float64Array(n);
      for (let i = 0; i < x.length; i++) re[i] = x[i];
      for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { const t = re[i]; re[i] = re[j]; re[j] = t; } }
      for (let len = 2; len <= n; len <<= 1) { const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang); for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let q = 0; q < len / 2; q++) { const ur = re[i + q], ui = im[i + q], vr = re[i + q + len / 2] * cr - im[i + q + len / 2] * ci, vi = re[i + q + len / 2] * ci + im[i + q + len / 2] * cr; re[i + q] = ur + vr; im[i + q] = ui + vi; re[i + q + len / 2] = ur - vr; im[i + q + len / 2] = ui - vi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } } }
      let all = 0, fw = 0; const band = [0, 0, 0];
      for (let i = 1; i < n / 2; i++) {
        const p = re[i] * re[i] + im[i] * im[i], f = i * sr / n;
        if (f < 30 || f > 16000) continue;
        all += p; fw += f * p;
        if (f < 250) band[0] += p; else if (f >= 900 && f < 2500) band[1] += p; else if (f >= 2500 && f < 8000) band[2] += p;
      }
      const dB = (v) => 10 * Math.log10(v + 1e-24);
      return { label, e, x: spot.x, y: spot.y, zone: spot.f.zone, floorDb: spot.f.db, level: dB(ms / x.length), thump: dB(band[0]), ring: dB(band[1]), slap: dB(band[2]), centroid: fw / all };
    }) };
  });
  await fp.close();
  await browser.close();
  L.push('', 'Levels through the mixer (volume 0.7, not placed, from the mixer\'s clock-stamped recording): mean energy over the window from each hit\'s start and peak, dBFS; Trial 1\'s old sound (from its A/B, measured with the tap: its window started up to 0.3 s late) for reference');
  const db = (x) => 10 * Math.log10(Math.max(1e-12, x));
  for (const [label, name] of list) {
    const e = levels[label];
    if (!e) continue;
    const m = db(e.ms.reduce((a, b) => a + b, 0) / e.ms.length), p = 20 * Math.log10(Math.max(1e-9, e.pk));
    const t1 = TRIAL1[name];
    L.push(`${label.padEnd(25)} mean ${m.toFixed(1).padStart(6)}  peak ${p.toFixed(1).padStart(6)}${t1 ? `      Trial 1: mean ${t1[0].toFixed(1)}  peak ${t1[1].toFixed(1)}` : ''}`);
  }
  L.push('', `The floor under the ball and how hard it comes down (one take of the dribble, no jitter, as the court's audio plays it on ${floor.arena}'s floor): against plain wood, dB`);
  L.push('spot                                       at (ft)       floor   level   thump <250 Hz   ring 0.9-2.5 kHz   slap 2.5-8 kHz   centroid');
  const F0 = floor.cases[0], Fb = {};
  for (const c of floor.cases) {
    Fb[c.label] = c;
    const r = (k) => { const v = c[k] - F0[k]; return (v >= 0 ? '+' : '') + v.toFixed(1); };
    L.push(`${(c.label + ' (' + c.e + ')').padEnd(42)} ${(c.x.toFixed(1) + ', ' + c.y.toFixed(1)).padEnd(13)} ${c.zone.padEnd(9)} ${r('level').padStart(5)}   ${r('thump').padStart(8)}        ${r('ring').padStart(8)}          ${r('slap').padStart(8)}       ${Math.round(c.centroid)} Hz`);
  }
  const fc = (k) => Fb[k] || null;
  const floorChecks = [
    ['the arena\'s field moves a dribble\'s level from spot to spot (1 dB or more between its loudest and quietest wood)', fc('plain wood, the field at its loudest') && fc('plain wood, the field at its quietest') && fc('plain wood, the field at its loudest').level - fc('plain wood, the field at its quietest').level >= 1],
    ['a dead spot is quieter and rings less (the ring 3 dB or more down, past its level)', !!fc('a dead spot') && fc('a dead spot').level < F0.level && fc('a dead spot').ring - fc('a dead spot').level - (F0.ring - F0.level) <= -3],
    ['the apron is the same wood (within 1.5 dB)', !!fc('the apron (out of bounds)') && Math.abs(fc('the apron (out of bounds)').level - F0.level - (fc('the apron (out of bounds)').floorDb - F0.floorDb)) < 1.5],
    ['the courtside seats are muffled (4 dB or more down, the centroid a third lower or more)', !!fc('the courtside seats') && fc('the courtside seats').level <= F0.level - 4 && fc('the courtside seats').centroid <= F0.centroid * 0.67],
    ['a hard dribble is louder than a soft one (6 dB or more)', !!fc('plain wood, a hard dribble') && fc('plain wood, a hard dribble').level - fc('plain wood, a soft dribble').level >= 6],
  ];
  L.push('');
  for (const [k, ok] of floorChecks) L.push(`${k}: ${ok ? 'OK' : 'NO'}`);
  // (the painted lanes and the logo: a harder slap of the cover, which the cavity's ring above 2.5 kHz all but hides)
  const paint = ['a painted lane', 'the centre logo'].filter(fc).map((k) => `${k} ${(fc(k).slap - F0.slap - (fc(k).floorDb - F0.floorDb) >= 0 ? '+' : '') + (fc(k).slap - F0.slap - (fc(k).floorDb - F0.floorDb)).toFixed(1)} dB`);
  L.push(`(for information: the paint's harder slap, the 2.5 to 8 kHz band past the field's level: ${paint.join(', ')}; too small to pick out)`);
  const floorOk = floorChecks.every((c) => c[1]);
  const bad = res.filter((r) => !r.ok);
  L.push('', `errors: ${errs.length}${errs.length ? ' ' + errs.slice(0, 3).join(' | ') : ''}`);
  L.push(`never identical in 10 in a row (no two of the 10 correlating at 0.98+, every pair apart by a difference a listener can hear, no take twice running): ${res.length - bad.length}/${res.length} sounds${bad.length ? ' (not: ' + bad.map((b) => b.label).join(', ') + ')' : ''}`);
  L.push(`the floor and the force change the dribble as they should: ${floorOk ? 'yes' : 'NO'}`);
  L.push(bad.length || errs.length || !floorOk ? 'RESULT: FAIL' : 'RESULT: PASS');
  const txt = L.join('\n');
  fs.writeFileSync(path.join(o.out, 'variety_result.txt'), txt + '\n');
  console.log(txt.split('\n').slice(-(list.length + 6)).join('\n'));
})();
