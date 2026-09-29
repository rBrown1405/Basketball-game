#!/usr/bin/env node
// Listen test: a live game with every audio bus event traced (the event, the sounds it played or why not, with real
// time, audio time and game clock), the first --rec seconds recorded at the speakers, the mixer's "last 30 s", and
// the crowd duck sampled every 100 ms (is the crowd down while the booth talks, does it pump between lines or get
// chopped after a roar).
//
//   node tools/audio/test/listen.js [--seed 21] [--secs 150] [--rec 60] [--speed 1] [--tag listen] [--out audit/audio1]
//
// Writes <tag>_trace.txt (every event but the foot plants), <tag>_trace_anim.txt (the first 300 body events),
// <tag>_summary.json, <tag>_result.txt, <tag>_<rec>s.wav and <tag>_last30.wav.
'use strict';
const fs = require('fs'), path = require('path');
const T = require('./common.js');
const o = T.args({ seed: 21, secs: 150, rec: 60, speed: 1, tag: 'listen', speech: 1 });
(async () => {
  const browser = await T.launch(o);
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.addInitScript(T.TAP);
  if (o.speech) await page.addInitScript(T.SPEECH);
  await T.openGame(page, o.repo, o.seed, { commentary: true, voice: true, arenaSound: true, volume: 0.8, simSpeed: o.speed });
  await page.evaluate(() => {
    PBC.AudioDebug.traceStart();
    window.__duck = [];
    setInterval(() => { const st = PBC.AudioDebug.state(); if (st) window.__duck.push([performance.now(), st.speaking ? 1 : 0, +st.duckDb.toFixed(2), +st.duckReactDb.toFixed(2), +st.buses.crowd.meter.rms.toFixed(1)]); }, 100);
  });
  await page.waitForTimeout(1000);
  // a player's first click on the game (it unlocks the booth's voice, as in the real game): on the court, where
  // nothing reacts to a click
  await page.mouse.click(400, 400);
  await page.waitForTimeout(500);
  const t0 = Date.now();
  if (o.rec > 0) {
    await page.evaluate(() => { window.__tap.rec = true; });
    await page.waitForTimeout(o.rec * 1000);
    await page.evaluate(() => { window.__tap.rec = false; });
    fs.writeFileSync(path.join(o.out, `${o.tag}_${o.rec}s.wav`), Buffer.from(await page.evaluate(() => window.__tapWav()), 'base64'));
  }
  await page.waitForTimeout(Math.max(0, o.secs * 1000 - (Date.now() - t0)));
  const last30 = await T.mixerWav(page, 30);
  if (last30) fs.writeFileSync(path.join(o.out, `${o.tag}_last30.wav`), Buffer.from(last30.b64, 'base64'));
  const out = await page.evaluate(() => {
    const list = PBC.AudioDebug.traceStop();
    const st = PBC.AudioDebug.state();
    const types = {}, snd = {};
    for (const e of list) { types[e.type] = (types[e.type] || 0) + 1; for (const s of e.sounds || []) { const k = s.n + ' ' + s.s; snd[k] = (snd[k] || 0) + 1; } }
    // each shot: from the release (game.shot) to the ball getting there (game.shotResult), and what that played
    const shots = [], rel = new Map();
    for (const e of list) {
      if (e.type === 'game.shot') rel.set(e.pid + ':' + e.e.t, e);
      if (e.type === 'game.shotResult') {
        const s0 = rel.get(e.pid + ':' + e.e.t);
        shots.push({ kind: e.e.kind, pts: e.e.pts, result: e.result, contact: e.contact, via: e.via, flightMs: s0 ? Math.round(e.rt - s0.rt) : null, atResult: (e.sounds || []).map((s) => s.n + (s.s !== 'play' && s.s !== 'queued' ? ' (' + s.s + ')' : '')), atRelease: s0 ? (s0.sounds || []).map((s) => s.n) : [] });
      }
    }
    const says = list.filter((e) => e.type === 'booth.say').map((e) => ({ who: e.who, text: e.text, waitedMs: e.waitedMs }));
    return {
      n: list.length, types, snd, shots, says, st, duck: window.__duck,
      text: PBC.AudioDebug.format(list.filter((e) => !e.type.startsWith('anim.'))),
      anim: PBC.AudioDebug.format(list.filter((e) => e.type.startsWith('anim.')).slice(0, 300)),
    };
  });
  await browser.close();
  fs.writeFileSync(path.join(o.out, `${o.tag}_trace.txt`), out.text + '\n');
  fs.writeFileSync(path.join(o.out, `${o.tag}_trace_anim.txt`), out.anim + '\n');
  fs.writeFileSync(path.join(o.out, `${o.tag}_summary.json`), JSON.stringify({ seed: o.seed, secs: o.secs, events: out.n, types: out.types, sounds: out.snd, shots: out.shots, says: out.says, state: out.st, duck: out.duck, errors: errs }, null, 1));

  // ---- the duck: level while talking and quiet, dips, surges between lines, chops after a push-through
  const D = out.duck, tt = D.length ? D[0][0] : 0;
  const talk = D.filter((d) => d[1]), quiet = D.filter((d) => !d[1]);
  const mean = (a, k) => a.reduce((s, d) => s + d[k], 0) / Math.max(1, a.length);
  let dips = 0, surges = 0, chops = 0, low = false, lastUp = -1e9;
  for (let i = 0; i < D.length; i++) {
    const [t, , db] = D[i];
    if (!low && db < -3) { low = true; dips++; if (t - lastUp < 1500) surges++; }
    else if (low && db > -1.5) { low = false; lastUp = t; }
    // a fall of 4 dB or more inside 0.2 s from full level while the booth has already been talking for 0.3 s: the
    // duck coming back down on a roar that was pushing through (the attack when a line starts is meant to be quick)
    if (i >= 3 && D[i][1] && D[i - 1][1] && D[i - 2][1] && D[i - 3][1] && D[i - 2][2] - db >= 4 && D[i - 2][2] > -1.5) chops++;
  }
  const L = [];
  L.push(`Listen test: seed ${o.seed}, ${o.speed}x, ${o.secs} s of a live game (booth on, arena sound on)${o.speech ? ', stand-in speech engine' : ''}`);
  L.push(`events on the bus: ${out.n} (${Object.entries(out.types).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' ' + v).join(', ')})`);
  L.push(`sound requests: ${Object.entries(out.snd).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' ' + v).join(', ')}`);
  L.push('');
  L.push('Shots: release (game.shot) to result (game.shotResult), and what each moment played');
  for (const s of out.shots) L.push(`  ${String(s.pts)}pt ${s.kind.padEnd(12)} ${s.result.padEnd(8)} at the ${String(s.contact).padEnd(5)} (${s.via}) after ${String(s.flightMs).padStart(5)} ms | at the release: ${s.atRelease.join(', ') || '-'} | at the result: ${s.atResult.join(', ') || '-'}`);
  L.push('');
  L.push('Booth lines as they started (waited = time in the queue)');
  for (const s of out.says) L.push(`  ${s.who.padEnd(5)} waited ${String(s.waitedMs).padStart(5)} ms  "${s.text}"`);
  L.push('');
  L.push(`Crowd duck (bed / reactions): while the booth talks ${mean(talk, 2).toFixed(2)} / ${mean(talk, 3).toFixed(2)} dB over ${talk.length} samples; while quiet ${mean(quiet, 2).toFixed(2)} / ${mean(quiet, 3).toFixed(2)} dB over ${quiet.length}`);
  L.push(`  dips below -3 dB: ${dips}; surges (back above -1.5 dB and down again within 1.5 s): ${surges}; chops (4+ dB down in 0.2 s from full level): ${chops}`);
  L.push('');
  L.push(`mixer: played ${out.st.stats.played}, stolen ${out.st.stats.stolen}, refused ${JSON.stringify(out.st.stats.suppressed)}, peak voices ${out.st.stats.peakTotal}/48, per bus ${JSON.stringify(out.st.stats.peakBus)}; audio main-thread time in the mixer ${out.st.cpuMs.toFixed(1)} ms in total`);
  L.push(`recordings: ${o.rec > 0 ? `${o.tag}_${o.rec}s.wav (the speakers, from the click)` : '-'}; ${last30 ? `${o.tag}_last30.wav (${last30.seconds.toFixed(1)} s from the mixer's recorder, ${last30.kind})` : 'no last 30 s'}`);
  L.push(`page errors: ${errs.length}${errs.length ? ' ' + errs.slice(0, 3).join(' | ') : ''}`);
  const txt = L.join('\n');
  fs.writeFileSync(path.join(o.out, `${o.tag}_result.txt`), txt + '\n');
  console.log(txt);
  void tt;
})();
