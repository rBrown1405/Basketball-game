#!/usr/bin/env node
// Sound by sound, the arena audio of an earlier commit (default: Trial 0, 8baee19) against today's, each through its
// whole output chain and recorded at the speakers, with the same random numbers on both sides (the old code's
// Math.random calls are pointed at the same xorshift the new code's PBC.AudioRandom uses, same seed, same order), so
// both play exactly the same variations:
//  - one-shots (the crowd bed off in both): mean energy and peak of N hits of every court sound and crowd reaction
//  - the crowd bed once settled, then the duck while the booth talks for 3 s (depth, attack, release)
//   node tools/audio/test/ab.js [--rev 8baee19] [--nc 6] [--nr 4] [--out audit/audio1]
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const T = require('./common.js');
const o = T.args({ rev: '8baee19', nc: 6, nr: 4 });
const COURT = [['dribble', 0.7], ['bounce', 0.8], ['squeak', 0.8], ['rim', 0.8], ['board', 1], ['swish', 1], ['net', 1], ['dunk', 1], ['block', 1], ['whistle', 1], ['horn', 1]];
const ev = (type, team, pts, extra) => Object.assign({ type, team, pts }, extra || {});
const CROWD = [ // [label, the old onEvent call, the new bus event]
  ['roar 0.65 (home basket)', ev('score', 0, 2, { shotEvent: { kind: 'jumper' } }), ['game.score', { e: ev('score', 0, 2, { shotEvent: { kind: 'jumper' } }) }]],
  ['roar 1.1 (home three)', ev('score', 0, 3, { shotEvent: { kind: 'jumper' } }), ['game.score', { e: ev('score', 0, 3, { shotEvent: { kind: 'jumper' } }) }]],
  ['murmur 0.5 (away basket)', ev('score', 1, 2, { shotEvent: { kind: 'jumper' } }), ['game.score', { e: ev('score', 1, 2, { shotEvent: { kind: 'jumper' } }) }]],
  ['groan 0.8 (away three)', ev('score', 1, 3, { shotEvent: { kind: 'jumper' } }), ['game.score', { e: ev('score', 1, 3, { shotEvent: { kind: 'jumper' } }) }]],
  ['ooh 0.6 (home missed three)', ev('shot', 0, 3, { made: false }), ['game.shotResult', { e: ev('shot', 0, 3, { made: false }), made: false, blocked: false }]],
  ['roar 0.9 (home block)', ev('shot', 1, 2, { made: false, blocked: true }), ['game.shotResult', { e: ev('shot', 1, 2, { made: false, blocked: true }), made: false, blocked: true }]],
];
// the two versions of js/ui/arenaaudio.js, each twice (with and without the crowd bed), under their own names
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pbc-ab-'));
const oldSrc = cp.execSync(`git -C "${o.repo}" show ${o.rev}:js/ui/arenaaudio.js`, { encoding: 'utf8' }).replace(/Math\.random\(\)/g, 'window.__abR()');
const newSrc = fs.readFileSync(path.join(o.repo, 'js/ui/arenaaudio.js'), 'utf8');
const name = (src, n) => src.replace('PBC.ArenaAudio = { create };', `PBC.${n} = { create };`);
const noBedOld = (src) => src.replace('      startBed();\n      return c;', '      A.bed = [];\n      return c;');
const noBedNew = (src) => src.replace('        startBed(c);\n', '        A.bed = [];\n');
if (noBedOld(oldSrc) === oldSrc || noBedNew(newSrc) === newSrc) throw new Error('could not switch the crowd bed off in one of the versions');
fs.writeFileSync(path.join(tmp, 'old.js'), name(oldSrc, 'OldArena') + '\n' + name(noBedOld(oldSrc), 'OldArenaNoBed'));
fs.writeFileSync(path.join(tmp, 'new.js'), name(newSrc, 'NewArena') + '\n' + name(noBedNew(newSrc), 'NewArenaNoBed'));
function TAPM() {
  // like the common tap, per context, and measuring on the context's own clock
  const AC = window.AudioContext;
  window.__ctxs = [];
  window.AudioContext = function (...a) {
    const c = new AC(...a);
    const tapIn = c.createGain(), sp = c.createScriptProcessor(2048, 2, 2);
    c.__rec = { on: false, chunks: [] };
    sp.onaudioprocess = (e) => { if (c.__rec.on) c.__rec.chunks.push({ t: e.playbackTime, L: new Float32Array(e.inputBuffer.getChannelData(0)), R: new Float32Array(e.inputBuffer.getChannelData(1)) }); };
    tapIn.connect(sp); sp.connect(c.destination);
    c.__tapIn = tapIn; window.__ctxs.push(c);
    return c;
  };
  window.AudioContext.prototype = AC.prototype;
  const conn = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (target, ...rest) {
    const r = conn.call(this, target, ...rest);
    try { if (target && this.context && target === this.context.destination && this.context.__tapIn && this !== this.context.__tapIn && !(this instanceof ScriptProcessorNode)) conn.call(this, this.context.__tapIn); } catch (e) { /* ignore */ }
    return r;
  };
  window.__measure = (c, t, w) => {
    let ss = 0, n = 0, pk = 0;
    for (const ch of c.__rec.chunks) {
      const sr = c.sampleRate, len = ch.L.length, a = ch.t, b = a + len / sr;
      if (b < t || a > t + w) continue;
      const i0 = Math.max(0, Math.floor((t - a) * sr)), i1 = Math.min(len, Math.ceil((t + w - a) * sr));
      for (let i = i0; i < i1; i++) { const l = ch.L[i], r = ch.R[i]; ss += l * l + r * r; n += 2; const m = Math.max(Math.abs(l), Math.abs(r)); if (m > pk) pk = m; }
    }
    return { ms: n ? ss / n : 0, pk };
  };
}
async function side(browser, which) {
  const page = await browser.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.addInitScript(TAPM);
  await page.goto('file://' + path.join(o.repo, 'index.html') + '?low=1');
  await page.waitForTimeout(700);
  await page.addScriptTag({ path: path.join(tmp, which + '.js') });
  const res = await page.evaluate(async ([which, COURT, CROWD, NC, NR]) => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const host = { S: { settings: { arenaSound: true, volume: 0.7 } }, stakes: { level: 0 }, uIdx: 0, speed: () => 1 };
    const seed = (v) => { if (which === 'old') { let s = v >>> 0; window.__abR = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; } else PBC.AudioRandom.seed(v); };
    const make = (bed) => {
      seed(987654321);
      if (which === 'old') return { au: (bed ? PBC.OldArena : PBC.OldArenaNoBed).create(host) };
      PBC.AudioBus.reset();
      const mx = PBC.AudioMixer.create({ volume: 0.7 }); host.mx = mx;
      return { mx, au: (bed ? PBC.NewArena : PBC.NewArenaNoBed).create(host) };
    };
    const out = { court: {}, crowd: {} };
    let A = make(false);
    await sleep(800);
    let c = window.__ctxs[window.__ctxs.length - 1];
    c.__rec.on = true;
    await sleep(300);
    const hits = [];
    for (const [n, v] of COURT) for (let k = 0; k < NC; k++) { hits.push({ key: n, t: c.currentTime, w: n === 'horn' ? 1.5 : 0.8 }); A.au.play(n, v); await sleep(n === 'horn' ? 1700 : 1000); }
    for (const [label, oe, ne] of CROWD) for (let k = 0; k < NR; k++) {
      hits.push({ key: label, t: c.currentTime, w: 4.2, crowd: true });
      if (which === 'old') A.au.onEvent(JSON.parse(JSON.stringify(oe)), null); else PBC.AudioBus.emit(ne[0], JSON.parse(JSON.stringify(ne[1])));
      await sleep(4500);
    }
    await sleep(300);
    for (const h of hits) { const m = window.__measure(c, h.t, h.w); const d = h.crowd ? out.crowd : out.court; (d[h.key] || (d[h.key] = [])).push(m); }
    c.__rec.on = false; c.__rec.chunks = [];
    A.au.destroy(); if (A.mx) A.mx.destroy();
    await sleep(300);
    // the bed, then the booth talks from 8 s to 11 s
    A = make(true);
    await sleep(500);
    c = window.__ctxs[window.__ctxs.length - 1];
    c.__rec.on = true;
    const s = { stakes: 0, late: false, close: true, playing: true, speed: 0, off: 0 };
    const t0 = c.currentTime;
    const iv = setInterval(() => { A.au.update(0.05, s); if (A.mx) A.mx.update(); }, 50);
    await sleep(8000);
    const tDuck = c.currentTime;
    if (which === 'old') A.au.duck(true); else A.mx.speaking(true);
    await sleep(3000);
    const tUp = c.currentTime;
    if (which === 'old') A.au.duck(false); else A.mx.speaking(false);
    await sleep(4500);
    clearInterval(iv);
    const lvl = (a, b) => 10 * Math.log10(Math.max(1e-12, window.__measure(c, a, b - a).ms));
    const env = [];
    for (let t = tDuck - 0.5; t < tUp + 4; t += 0.1) env.push(+lvl(t, t + 0.1).toFixed(1));
    out.bed = { settled: lvl(t0 + 4, tDuck), ducked: lvl(tDuck + 1.5, tUp), after: lvl(tUp + 3.5, tUp + 4.4), env };
    return out;
  }, [which, COURT, CROWD, o.nc, o.nr]);
  res.errs = errs;
  await page.close();
  return res;
}
const db = (ms) => 10 * Math.log10(Math.max(1e-12, ms));
(async () => {
  const browser = await T.launch(o);
  const [A, B] = await Promise.all([side(browser, 'old'), side(browser, 'new')]);
  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  const L = [`A/B: the arena audio of ${o.rev} (old) against the working copy (new), the same random variations on both sides`, '', 'One-shots: mean energy of the hits in their window (dBFS), crowd bed off in both'];
  const diffs = [];
  const row = (k, a, b) => {
    const ea = a.reduce((s, m) => s + m.ms, 0) / a.length, eb = b.reduce((s, m) => s + m.ms, 0) / b.length;
    const pa = Math.max(...a.map((m) => m.pk)), pb = Math.max(...b.map((m) => m.pk)), d = db(eb) - db(ea);
    diffs.push(d);
    L.push(`${k.padEnd(28)} old ${db(ea).toFixed(1).padStart(6)}  new ${db(eb).toFixed(1).padStart(6)}  diff ${(d >= 0 ? '+' : '') + d.toFixed(2)} dB   peak old ${(20 * Math.log10(pa)).toFixed(1)} new ${(20 * Math.log10(pb)).toFixed(1)} dBFS  ${Math.abs(d) <= 1 ? 'OK' : 'OVER 1 dB'}`);
  };
  for (const k of Object.keys(A.court)) row(k, A.court[k], B.court[k]);
  for (const k of Object.keys(A.crowd)) row(k, A.crowd[k], B.crowd[k]);
  const worst = Math.max(...diffs.map(Math.abs));
  L.push(`largest difference: ${worst.toFixed(2)} dB over ${diffs.length} sounds`, '', 'Crowd bed and the duck while the booth talks (dBFS)');
  for (const [k, S] of [['old', A.bed], ['new', B.bed]]) L.push(`${k}: bed ${S.settled.toFixed(1)}, while the booth talks ${S.ducked.toFixed(1)} (${(S.ducked - S.settled).toFixed(1)} dB), 3.5 s after it stops ${S.after.toFixed(1)}`);
  L.push(`bed level, new minus old: ${(B.bed.settled - A.bed.settled).toFixed(2)} dB`);
  L.push('level every 0.1 s from 0.5 s before the booth starts to 4 s after it stops (it talks from the 6th value for 3 s):');
  L.push('old ' + A.bed.env.map((x) => x.toFixed(0)).join(' '));
  L.push('new ' + B.bed.env.map((x) => x.toFixed(0)).join(' '));
  L.push(`errors: old ${A.errs.length}, new ${B.errs.length}`);
  const pass = worst <= 1 && Math.abs(B.bed.settled - A.bed.settled) <= 1 && !A.errs.length && !B.errs.length;
  L.push(pass ? 'RESULT: PASS (every sound and the bed within 1 dB of the old code; only the duck differs)' : 'RESULT: FAIL');
  const txt = L.join('\n');
  fs.writeFileSync(path.join(o.out, 'ab_result.txt'), txt + '\n');
  console.log(txt);
  process.exit(pass ? 0 : 1);
})();
