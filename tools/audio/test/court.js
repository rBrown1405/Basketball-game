#!/usr/bin/env node
// Trial 2's listen test: a live game with every court sound traced next to what made it, and the proofs.
//  - The trace (court_trace.txt): every court sound with real time, audio time, the game clock, what made it (the
//    plant's speed, braking and turning for a squeak, the dribble's height and speed into the floor, the rim part...),
//    the game time of its contact (gt), how far ahead it was scheduled (dly) or how late it came (late), where it sits
//    (pan, dB) and what the mixer did with it. court_trace_anim.txt: the foot plants and landings it heard.
//  - Dribbles line up with the ball hitting the floor: every frame the page draws is logged (the game time it shows,
//    the audio clock); a contact's moment on screen is where the drawn game time crosses the contact's exact game time
//    (between two frames), and its sound is scheduled for (dly) against that moment; and the sound really starts then
//    (its onset found in the recording at the speakers, where the crowd leaves it clear).
//  - Squeaks: every one with its plant; how many a minute, how many a player and the floor made in any second, the
//    share of plants that squeaked; and that none came without a hard plant, a pivot, a slide, a jump stop or a jab.
//  - Footsteps, landings, catches, bodies: counts and what was held back.
//  - Recording: court_<rec>s.wav at the speakers from the start.
//   node tools/audio/test/court.js [--seed 21] [--secs 120] [--rec 60] [--speed 1] [--tag court] [--out audit/audio2]
'use strict';
const fs = require('fs'), path = require('path');
const T = require('./common.js');
const o = T.args({ seed: 21, secs: 120, rec: 60, speed: 1, tag: 'court', out: 'audit/audio2' });
(async () => {
  const browser = await T.launch(o);
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.addInitScript(T.TAP);
  await page.addInitScript(T.SPEECH);
  // (the mixer's recorder keeps the whole run, so the dribbles' onsets can be found on the audio clock)
  await T.openGame(page, o.repo, o.seed, { commentary: true, voice: true, arenaSound: true, volume: 0.8, simSpeed: o.speed }, null, `PBC.AudioConfig.debug.recorderSeconds = ${o.secs + 10}`);
  await page.evaluate(() => {
    PBC.AudioDebug.traceStart();
    // every drawn frame: the game time it shows (as the court's audio works it out) and the audio clock then
    const L = PBC.UI._liveDebug.state(), h = PBC.Match.Tune.clock.step;
    window.__frames = [];
    const f0 = L.ca.frame;
    L.ca.frame = (dt) => {
      f0(dt);
      const v = L.view;
      if (v && L.mx && L.mx.ctx) window.__frames.push([performance.now(), L.mx.ctx.currentTime, v.debug || v.replay ? v.time : v.time - h + Math.min(h, Math.max(0, v._acc || 0))]);
    };
  });
  await page.waitForTimeout(800);
  await page.mouse.click(400, 400);
  await page.waitForTimeout(400);
  const t0 = Date.now();
  if (o.rec > 0) {
    await page.evaluate(() => { const L = PBC.UI._liveDebug.state(); window.__tap.only = L.mx.ctx; window.__tap.rec = true; });
    await page.waitForTimeout(o.rec * 1000);
    await page.evaluate(() => { window.__tap.rec = false; });
  }
  // the dribbles' onsets in the mixer's recording (every sample on the audio clock): the first moment within 30 ms
  // before to 60 ms after the scheduled start where the slap (high-passed) reaches half its local peak
  const onsetsOf = () => page.evaluate(async () => {
    const L = PBC.UI._liveDebug.state(), d = await L.mx.recording();
    if (!d) return [];
    const tr = PBC.AudioBus.tracePeek(), sr = d.sampleRate, x = d.L, n = x.length;
    const hp = new Float32Array(n); for (let i = 2; i < n; i++) hp[i] = x[i] - 2 * x[i - 1] + x[i - 2];
    const court = tr.filter((e) => e.type && e.type.startsWith('court.') && e.when != null);
    const out = [];
    for (const e of court) {
      if (e.type !== 'court.dribble' || !(e.sounds || []).some((s) => s.s === 'play')) continue;
      // (no other sharp court sound near it: the onset has to be the dribble's own; thuds are low and do not count)
      if (court.some((f) => f !== e && !/^court\.(step|land|roll|body)$/.test(f.type) && Math.abs(f.when - e.when) < 0.08)) continue;
      const i0 = Math.floor((e.when - 0.03 - d.start) * sr), i1 = Math.floor((e.when + 0.06 - d.start) * sr);
      if (i0 < 0 || i1 >= n) continue;
      let pk = 0; for (let i = i0; i < i1; i++) pk = Math.max(pk, Math.abs(hp[i]));
      for (let i = i0; i < i1; i++) if (Math.abs(hp[i]) >= pk * 0.5) { out.push({ when: e.when, onset: d.start + i / sr }); break; }
    }
    return out;
  });
  if (o.rec > 0) fs.writeFileSync(path.join(o.out, `${o.tag}_${o.rec}s.wav`), Buffer.from(await page.evaluate(() => window.__tapWav()), 'base64'));
  await page.waitForTimeout(Math.max(0, o.secs * 1000 - (Date.now() - t0)));
  const onsets = await onsetsOf();
  const out = await page.evaluate(() => {
    const list = PBC.AudioDebug.traceStop();
    const L = PBC.UI._liveDebug.state();
    const court = list.filter((e) => e.type.startsWith('court.'));
    const anim = list.filter((e) => e.type === 'anim.plant' || e.type === 'anim.land');
    const pick = (e) => ({ type: e.type, rt: e.rt, at: e.at, gt: e.gt, when: e.when, dly: e.dly, late: e.late, kind: e.kind, pid: e.pid, v: e.v, src: e.src, sounds: (e.sounds || []).map((s) => ({ n: s.n, s: s.s })) });
    return {
      court: court.map(pick),
      animN: anim.length,
      animPlayers: anim.filter((e) => !e.ref).length,
      stats: L.ca.stats(), mx: L.mx.stats(),
      frames: window.__frames,
      text: PBC.AudioDebug.format(list.filter((e) => !e.type.startsWith('anim.') && !e.type.startsWith('booth.'))),
      animText: PBC.AudioDebug.format(anim.slice(0, 400)),
      gameSecs: L.view ? L.view.time : 0,
    };
  });
  await browser.close();
  fs.writeFileSync(path.join(o.out, `${o.tag}_trace.txt`), out.text + '\n');
  fs.writeFileSync(path.join(o.out, `${o.tag}_trace_anim.txt`), out.animText + '\n');

  // ---- the analysis
  const R = [], F = out.frames;
  const secs = F.length ? F[F.length - 1][0] / 1000 - F[0][0] / 1000 : 1;
  const fdt = F.slice(1).map((f, i) => f[0] - F[i][0]).sort((a, b) => a - b);
  const frameMs = fdt.length ? fdt[fdt.length >> 1] : 16.7;
  R.push(`Trial 2 court listen test: seed ${o.seed}, ${o.speed}x, ${o.secs} s (${F.length} frames drawn, median ${frameMs.toFixed(1)} ms apart${frameMs > 25 ? ': headless Chromium draws the court in software, slower than a browser; the timing below is against the frames it drew' : ''})`);
  const by = {};
  for (const e of out.court) { const k = e.type.slice(6) + (e.kind ? ' ' + e.kind : ''); (by[k] = by[k] || { n: 0, played: 0, not: {} }).n++; for (const s of e.sounds) { if (s.s === 'play') by[k].played++; else by[k].not[s.s] = (by[k].not[s.s] || 0) + 1; } }
  R.push('', 'Court sounds (heard → played; not played and why):');
  for (const k of Object.keys(by).sort()) R.push(`  ${k.padEnd(22)} ${String(by[k].n).padStart(5)} → ${String(by[k].played).padStart(5)}${Object.keys(by[k].not).length ? '   ' + JSON.stringify(by[k].not) : ''}`);
  R.push(`  held back before the mixer (court audio's own rules): ${JSON.stringify(out.stats.skip)}`);

  // dribble timing: the contact's moment on screen (the drawn game time crossing it) against when its sound starts
  const onScreen = (gt) => {
    for (let k = 1; k < F.length; k++) {
      if (F[k][2] >= gt) {
        const a = F[k - 1], b = F[k], f = b[2] > a[2] ? (gt - a[2]) / (b[2] - a[2]) : 1;
        return { at: a[1] + Math.max(0, Math.min(1, f)) * (b[1] - a[1]), frameAt: b[1], frameGap: b[1] - a[1] };
      }
    }
    return null;
  };
  const dr = out.court.filter((e) => e.type === 'court.dribble' && e.when != null && e.gt != null);
  const errs2 = [], errsFrame = [];
  let within1 = 0, within2 = 0, withinFrame = 0;
  for (const e of dr) {
    const s = onScreen(e.gt);
    if (!s) continue;
    const err = (e.when - s.at) * 1000, errF = (e.when - s.frameAt) * 1000, gap = Math.max(1, s.frameGap * 1000);
    errs2.push(err); errsFrame.push(errF);
    if (Math.abs(err) <= gap) within1++;
    if (Math.abs(err) <= 2 * gap) within2++;
    if (Math.abs(errF) <= gap) withinFrame++;
  }
  const st = (a) => { if (!a.length) return 'none'; const s = a.slice().sort((x, y) => x - y), abs = a.map(Math.abs).sort((x, y) => x - y); return `median ${s[s.length >> 1].toFixed(1)} ms, 95% within ${abs[Math.floor(abs.length * 0.95)].toFixed(1)} ms, worst ${abs[abs.length - 1].toFixed(1)} ms`; };
  R.push('', `Dribbles: ${dr.length} sounds, one for each time the ball met the floor in a dribble (they come from the dribble's own contact; the mixer played ${by.dribble ? by.dribble.played : 0})`);
  R.push(`  sound start against the contact's moment on screen (between two drawn frames): ${st(errs2)}; within one frame ${within1}/${errs2.length}, within two ${within2}/${errs2.length}`);
  R.push(`  against the first frame that shows the ball down: ${st(errsFrame)}; within one frame ${withinFrame}/${errsFrame.length}`);
  const od = onsets.map((x) => (x.onset - x.when) * 1000);
  R.push(`  the sound's onset in the recording against its scheduled start (${onsets.length} dribbles clear of other sharp court sounds; the master's two compressors look 6 ms ahead each): ${st(od)}`);
  const heard = [];
  for (const x of onsets) { const s = onScreen(dr.find((e) => e.when === x.when).gt); if (s) heard.push({ err: (x.onset - s.at) * 1000, gap: s.frameGap * 1000 }); }
  const heardIn2 = heard.filter((h) => Math.abs(h.err) <= 2 * Math.max(16.7, h.gap)).length;
  R.push(`  heard (the onset in the recording) against the moment on screen: ${st(heard.map((h) => h.err))}; within two frames ${heardIn2}/${heard.length}`);
  const dribOk = errs2.length > 0 && within2 === errs2.length && heard.length > 0 && heardIn2 === heard.length;

  // squeaks
  const sq = out.court.filter((e) => e.type === 'court.squeak');
  const played = sq.filter((e) => e.sounds.some((s) => s.s === 'play'));
  const perMin = played.length / Math.max(1, secs) * 60;
  let maxFloor = 0, maxPlayer = 0;
  for (const e of played) {
    const w = played.filter((f) => f.at >= e.at && f.at < e.at + 1);
    maxFloor = Math.max(maxFloor, w.length);
    maxPlayer = Math.max(maxPlayer, w.filter((f) => f.pid === e.pid).length);
  }
  const kinds = {}; for (const e of played) kinds[e.kind] = (kinds[e.kind] || 0) + 1;
  const sources = played.filter((e) => /brake|turn|jump stop|jab/.test(e.src || ''));
  const Q = require('vm').runInNewContext(fs.readFileSync(path.join(o.repo, 'js/audio/config.js'), 'utf8') + ';window.PBC.AudioConfig.court.squeak', { window: {} });
  R.push('', `Squeaks: ${played.length} played (${perMin.toFixed(1)} a minute), from ${out.animPlayers} foot plants and landings by players: ${(played.length / Math.max(1, out.animPlayers) * 100).toFixed(1)}% of them squeaked`);
  R.push(`  kinds: ${JSON.stringify(kinds)}`);
  R.push(`  most in any second: ${maxFloor} on the floor (the cap is ${Q.perSecond}), ${maxPlayer} by one player (one every ${Q.playerGapS} s at most)`);
  R.push(`  every squeak came from a plant, a landing or a jab with its numbers: ${sources.length}/${played.length}`);
  const hardOk = played.filter((e) => e.kind === 'cut' || e.kind === 'stop').every((e) => { const m = /speed ([\d.]+)(?: \(was ([\d.]+)\))? brake ([\d.]+) turn ([\d.]+)/.exec(e.src || ''); if (!m) return /jab/.test(e.src || ''); const sp = +m[1], was = m[2] ? +m[2] : sp, a = Math.hypot(+m[3], +m[4]); return a >= Q.minAccel - 0.15 && Math.max(sp, was) >= Q.minSpeed - 0.05; });
  R.push(`  every cut and stop was a hard push (${Q.minAccel} ft/s² or more) at jogging speed (${Q.minSpeed} ft/s) or faster: ${hardOk ? 'yes' : 'NO'}`);
  R.push('  the squeaks, one per line (audio time, player, kind, what the plant was):');
  for (const e of played.slice(0, 60)) R.push(`    ${e.at != null ? e.at.toFixed(2) : '-'}  #${e.pid}  ${(e.kind || '').padEnd(8)} v ${e.v}  ${e.src || ''}`);
  const squeakOk = played.length > 0 && maxFloor <= Math.ceil(Q.perSecond) && maxPlayer <= 2 && sources.length === played.length && hardOk;

  // the rest
  const cnt = (t) => out.court.filter((e) => e.type === 'court.' + t && e.sounds.some((s) => s.s === 'play')).length;
  R.push('', `Footsteps ${cnt('step')} (${(cnt('step') / secs).toFixed(1)} a second), landings ${cnt('land')}, catches ${cnt('catch')}, passes ${cnt('pass')}, bodies ${cnt('body')}, falls ${cnt('fall')}, floor bounces ${cnt('bounce')}, rolls ${cnt('roll')}, rim ${cnt('rim')}, glass ${cnt('board')}, swish ${cnt('swish')}, net ${cnt('net')}, dunks ${cnt('dunk')}, blocks ${cnt('block')}, whistles ${cnt('whistle')}, buzzers ${cnt('buzzer')}, horns ${cnt('horn')}`);
  R.push(`mixer: ${JSON.stringify(out.mx)}`);
  R.push(`page errors: ${errs.length}${errs.length ? ' ' + errs.slice(0, 3).join(' | ') : ''}`);
  R.push('');
  R.push(`dribbles on the contact (every one within two frames of its moment on screen, onsets where scheduled): ${dribOk ? 'PASS' : 'FAIL'}`);
  R.push(`squeaks only on real plants and never spam: ${squeakOk ? 'PASS' : 'FAIL'}`);
  R.push(dribOk && squeakOk && !errs.length ? 'RESULT: PASS' : 'RESULT: FAIL');
  const txt = R.join('\n');
  fs.writeFileSync(path.join(o.out, `${o.tag}_result.txt`), txt + '\n');
  console.log(txt.split('\n').filter((l) => !/^    \d/.test(l)).join('\n'));
})();
