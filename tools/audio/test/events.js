#!/usr/bin/env node
// Trial 2: the court's rarer moments, each made happen through the court's own calls and clips on a court of its own
// (the game's view, broadcast camera and bodies), with the court's audio listening as in a game: an official's
// signal and whistle for each kind of call, the shot clock running out (its buzzer over the basket), the period's
// end (the horn) and the game's end right after it (the same horn, not a second), a player going down (the charge's
// contact, then the floor), a post-up's bump, a jab step, a defender's slide, a closeout, a jump stop, and a loose ball
// bouncing out of bounds onto the apron and past it into the courtside seats, then rolling. For each: the court sounds
// it made (kind, what made it, the floor under it, where it sits). Writes events_result.txt and events.wav (everything
// in order).
//   node tools/audio/test/events.js [--seed 21] [--out audit/audio2]
'use strict';
const fs = require('fs'), path = require('path');
const T = require('./common.js');
const o = T.args({ seed: 21, out: 'audit/audio2' });
(async () => {
  const browser = await T.launch(o);
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await T.openGame(page, o.repo, o.seed, { commentary: false, voice: false, arenaSound: false, volume: 0.8, simSpeed: 1 });
  await page.waitForTimeout(1500);
  const r = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    const D = PBC.UI._liveDebug, LG = D.state();
    D.manual();
    if (LG.mx) LG.mx.setVolume(0);
    const M = PBC.Match, cv = document.createElement('canvas'); cv.width = 1280; cv.height = 720;
    const ctx = PBC.UI.matchContext(LG.S, LG.g);
    const view = new M.View(cv, ctx, { quality: 'low', models: '2d', camera: 'broadcast' });
    view.resize(1280, 720);
    PBC.AudioBus.reset(); PBC.AudioRandom.seed(31337);
    PBC.AudioConfig.debug.recorderSeconds = 60;
    PBC.AudioConfig.court.step.refs = 0;   // (the officials jog about the empty court: left out)
    const mx = PBC.AudioMixer.create({ volume: 0.7 }); mx.unlock();
    PBC.AudioBus.setAudioClock(() => (mx.ctx ? mx.ctx.currentTime : null));
    const ca = PBC.CourtAudio.create({ mx, view: () => view, speed: () => 1, teams: [LG.teams[0], LG.teams[1]] });
    view.onSound = (n, v, at, who) => ca.sound(n, v, at, who);
    view.onCue = (t, a, d) => ca.cue(t, a, d);
    let last = performance.now();
    const iv = setInterval(() => { const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now; view.update(dt); ca.frame(dt); mx.update(); }, 16);
    await sleep(800);
    PBC.AudioBus.traceStart({ anim: false });
    const marks = [];
    const mark = (label) => marks.push({ label, at: mx.now() });
    const ids = Object.keys(ctx.players);
    const A = view.actor(ids[0]), B = view.actor(ids[1]);
    A.hidden = false; B.hidden = false;
    A.place(40, 20, 0); B.place(60, 30, Math.PI);
    await sleep(600);
    // the officials: a signal, then the whistle
    for (const [sig, label] of [['refFoul', 'a foul'], ['refCharge', 'a charge'], ['refTravel', 'a travel'], ['refOut', 'out of bounds']]) {
      mark('whistle: ' + label);
      const ref = view.refs[marks.length % view.refs.length];
      ref.play(sig);
      view.whistle();
      await sleep(1600);
    }
    // the clocks: the shot clock with the game clock running, then the period's end, then the game's end
    const clock0 = view.clock.bind(view);
    mark('shot clock runs out'); view.clock = () => 8.4; view.horn(); await sleep(1800);
    mark('end of the period'); view.clock = () => 0; view.horn(); await sleep(600);
    mark('end of the game, 0.6 s after'); ca.finalHorn(); await sleep(4200);
    mark('end of the game on its own'); ca.finalHorn(); await sleep(2200);
    view.clock = clock0;
    // bodies
    mark('a player takes a charge: down he goes'); A.play('fall', { facing: 0 }); await sleep(2400);
    mark('a post-up bump'); B.place(30, 25, 0); B.play('backdown', { facing: 0 }); await sleep(1200);
    mark('a jab step'); A.place(40, 20, 0); A.play('jab', { facing: 0 }); await sleep(1200);
    // sneakers on the defensive moves and a jump stop, from the court's own gait and clips (the odds of a squeak set
    // to 1 here: what is tested is that these plants are found and heard; the odds are the listen test's)
    const Q = PBC.AudioConfig.court.squeak, q0 = Object.assign({}, Q);
    Object.assign(Q, { chanceMin: 1, chanceMax: 1, slideChance: 1, jumpStopChance: 1 });
    mark('a defender slides one way and back');
    B.place(47, 22, Math.PI / 2); B.setStance('defense');
    for (let k = 0; k < 4; k++) { B.moveTo(k % 2 ? 41 : 53, 22, { speed: 12, face: Math.PI / 2, stance: 'defense' }); await sleep(750); }
    B.stop(Math.PI / 2); await sleep(600);
    mark('a closeout: a sprint at the shooter, then the stop');
    // (as the court closes out: a sprint, then chop steps under control over the last 8 ft, choreo.js)
    B.place(47, 46, -Math.PI / 2); B.setStance('ready');
    B.moveTo(47, 24, { speed: B.maxSpeed, face: { x: 47, y: 20 }, stance: 'defense' });
    for (let k = 0; k < 40; k++) { await sleep(50); if (Math.hypot(B.goal.x - B.x, B.goal.y - B.y) < 8 && B.speed > 8) { B.goal.speed = 9; break; } }
    await sleep(1400);
    mark('a jump stop on the move');
    A.place(20, 30, 0); A.setStance('ready');
    A.moveTo(60, 30, { speed: 18, face: 0 }); await sleep(900);
    A.jumpStop(); await sleep(1200);
    Object.assign(Q, q0);
    // a loose ball over the near sideline: the apron, then the seats
    mark('a loose ball bounces out of bounds and rolls');
    view.ball.placeAt(40, 3, 3.5);
    view.ball.loose([1, -9, 4]);
    await sleep(5000);
    clearInterval(iv);
    await sleep(200);
    const tr = PBC.AudioBus.traceStop().filter((e) => e.type.startsWith('court.'));
    const res = marks.map((m, i) => {
      const next = marks[i + 1] ? marks[i + 1].at : 1e9;
      return { label: m.label, ev: tr.filter((e) => e.at >= m.at - 0.01 && e.at < next - 0.01).map((e) => ({ n: e.type.slice(6), kind: e.kind || '', src: e.src || '', floor: e.floor || '', pl: e.pl || null, played: (e.sounds || []).some((s) => s.s === 'play'), skip: (e.sounds || []).filter((s) => s.s !== 'play').map((s) => s.s) })) };
    });
    const rec = await mx.recording(), sr = rec.sampleRate;
    const i0 = Math.max(0, Math.floor((marks[0].at - 0.2 - rec.start) * sr)), n = rec.L.length - i0;
    const buf = new ArrayBuffer(44 + n * 4), d = new DataView(buf), w = (o, s) => { for (let i = 0; i < s.length; i++) d.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); d.setUint32(4, 36 + n * 4, true); w(8, 'WAVE'); w(12, 'fmt '); d.setUint32(16, 16, true); d.setUint16(20, 1, true); d.setUint16(22, 2, true); d.setUint32(24, sr, true); d.setUint32(28, sr * 4, true); d.setUint16(32, 4, true); d.setUint16(34, 16, true); w(36, 'data'); d.setUint32(40, n * 4, true);
    let q = 44; for (let i = 0; i < n; i++) { d.setInt16(q, Math.max(-1, Math.min(1, rec.L[i0 + i])) * 32767, true); d.setInt16(q + 2, Math.max(-1, Math.min(1, rec.R[i0 + i])) * 32767, true); q += 4; }
    let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return { res, wav: btoa(s), text: PBC.AudioDebug.format(tr) };
  });
  await browser.close();
  fs.writeFileSync(path.join(o.out, 'events.wav'), Buffer.from(r.wav, 'base64'));
  fs.writeFileSync(path.join(o.out, 'events_trace.txt'), r.text + '\n');
  const L = ['Trial 2: the court\'s rarer moments, made happen through its own calls and clips (a court of its own, the audio as in a game)', ''];
  const has = (res, n, kind) => res.ev.some((e) => e.n === n && (!kind || e.kind === kind) && e.played);
  const by = {}; for (const x of r.res) by[x.label] = x;
  const checks = [
    ['whistle: a foul', (x) => has(x, 'whistle', 'foul')],
    ['whistle: a charge', (x) => has(x, 'whistle', 'charge')],
    ['whistle: a travel', (x) => has(x, 'whistle', 'violation')],
    ['whistle: out of bounds', (x) => has(x, 'whistle', 'out')],
    ['shot clock runs out', (x) => has(x, 'buzzer') && !has(x, 'horn')],
    ['end of the period', (x) => has(x, 'horn') && !has(x, 'buzzer')],
    ['end of the game, 0.6 s after', (x) => !x.ev.some((e) => e.n === 'horn')],
    ['end of the game on its own', (x) => has(x, 'horn')],
    ['a player takes a charge: down he goes', (x) => has(x, 'fall') && has(x, 'body')],
    ['a post-up bump', (x) => has(x, 'body', 'post')],
    ['a jab step', (x) => has(x, 'step')],
    ['a defender slides one way and back', (x) => has(x, 'squeak', 'slide')],
    ['a closeout: a sprint at the shooter, then the stop', (x) => has(x, 'squeak', 'stop')],
    ['a jump stop on the move', (x) => has(x, 'squeak', 'jumpstop')],
    ['a loose ball bounces out of bounds and rolls', (x) => x.ev.some((e) => e.n === 'bounce' && e.floor === 'apron') && x.ev.some((e) => e.n === 'bounce' && e.floor === 'courtside') && has(x, 'roll')],
  ];
  let ok = true;
  for (const [label, f] of checks) {
    const x = by[label], pass = !!x && f(x);
    ok = ok && pass;
    L.push(`${label.padEnd(46)} ${pass ? 'OK ' : 'NO '} ${x ? x.ev.map((e) => `${e.n}${e.kind ? ' ' + e.kind : ''}${e.floor && e.floor !== 'wood' ? ' (' + e.floor + ')' : ''}${e.played ? '' : ' [' + e.skip.join(',') + ']'}`).join(', ') || 'nothing' : '?'}`);
  }
  L.push('', `errors: ${errs.length}${errs.length ? ' ' + errs.slice(0, 3).join(' | ') : ''}`);
  L.push(ok && !errs.length ? 'RESULT: PASS' : 'RESULT: FAIL');
  const txt = L.join('\n');
  fs.writeFileSync(path.join(o.out, 'events_result.txt'), txt + '\n');
  console.log(txt);
})();
