// Audio proof run (gauntlet Trial 1): plays a real live game in headless Chromium and checks the audio foundation.
//   node test/audio_trace.js [--seconds=45] [--speed=2] [--out=test/out] [--feet]
// Needs Playwright (npm i -D playwright, or a global install). Writes to --out:
//   trial1_trace.txt   every event with game time, clock and the sounds it triggered
//   trial1_clip.wav    the "last 30 seconds" recorder output
//   trial1_report.json all measurements
// Prints PASS / FAIL for: bus solo + mute during a live game, event log with sounds, voice priority,
// smooth ducking, the recorder, and audio cost per frame.
const fs = require('fs'), path = require('path'), cp = require('child_process');

function loadPlaywright() {
  try { return require('playwright'); } catch (e) { /* try the global install */ }
  const g = cp.execSync('npm root -g').toString().trim();
  return require(path.join(g, 'playwright'));
}
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k)); return a ? (a.includes('=') ? a.split('=')[1] : true) : d; };
const SECONDS = +arg('seconds', 45), SPEED = +arg('speed', 2), OUT = path.resolve(arg('out', path.join(__dirname, 'out'))), FEET = !!arg('feet', false);
const root = path.join(__dirname, '..');

(async () => {
  const { chromium } = loadPlaywright();
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('file://' + path.join(root, 'index.html'));
  await page.waitForTimeout(800);
  await page.evaluate((speed) => {
    const S = PBC.League.create({ leagueKey: 'men', seed: 7 });
    S.userTid = 0; S.settings.lowQuality = true; S.settings.simSpeed = speed;
    PBC.Coach.create(S, 'Test', 0); PBC.League.preseasonProjections(S); PBC.AI.autoRotation(S, 0);
    PBC.UI.setState(S); PBC.Season.startRegularSeason(S); PBC.Season.advanceToUserGame(S, 30);
    // like pressing Watch Live: the click is the user gesture that unlocks audio as the game screen is built
    const btn = document.createElement('button'); btn.id = 'go-live'; btn.textContent = 'Watch Live';
    btn.style.cssText = 'position:fixed;left:10px;top:10px;z-index:9999';
    btn.onclick = () => { btn.remove(); PBC.UI.go('live'); };
    document.body.appendChild(btn);
  }, SPEED);
  await page.click('#go-live');
  console.log(`playing ${SECONDS}s of a live game at ${SPEED}x ...`);
  await page.waitForTimeout(SECONDS * 1000);

  // cost per frame, measured over the play window only (before the self-tests below add their own load)
  const perf = await page.evaluate(() => {
    const A = PBC.Audio.current;
    return { frames: A.debug.frameStats(), slowestEmit: A.bus.slowest, handlers: A.bus.handlerStats(), byType: A.bus.typeStats(), unlockMs: A.unlockMs, arenaInitMs: A.arenaInitMs, mixer: Object.assign({}, A.mixer.stats) };
  });
  const results = {};
  const check = (name, pass, evidence) => { results[name] = { pass: !!pass, evidence }; console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}: ${typeof evidence === 'string' ? evidence : JSON.stringify(evidence)}`); };

  // ---- the recorder (grab first, so the clip is pure game audio)
  const clip = await page.evaluate(async () => {
    const r = await PBC.Audio.current.mixer.grabClip();
    const buf = new Uint8Array(await r.blob.arrayBuffer());
    let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    // loudness of the clip (mono sum RMS) to show it is not silent
    return { b64: btoa(s), seconds: r.seconds, peakDb: r.peakDb, sampleRate: r.sampleRate, kind: PBC.Audio.current.mixer.recorderKind() };
  });
  fs.writeFileSync(path.join(OUT, 'trial1_clip.wav'), Buffer.from(clip.b64, 'base64'));
  check('recorder saves the last 30 s', clip.seconds > 25 && clip.peakDb < 0 && clip.peakDb > -60, { seconds: +clip.seconds.toFixed(2), peakDb: +clip.peakDb.toFixed(1), via: clip.kind, file: path.join(OUT, 'trial1_clip.wav') });

  // ---- the event log (taken now, before the self-tests add their own entries)
  const logData = await page.evaluate((feet) => {
    const A = PBC.Audio.current;
    const rows = A.bus.trace().filter(r => feet || r.type !== 'foot_plant');
    return { rows, counts: A.bus.counts(), withSounds: A.bus.log().filter(e => e.sounds && e.sounds.some(s => !s.dropped)).length, total: A.bus.log().length,
      latency: { base: A.mixer.ctx.baseLatency, output: A.mixer.ctx.outputLatency, sampleRate: A.mixer.ctx.sampleRate } };
  }, FEET);
  const lines = [`# Trial 1 audio event trace (${new Date().toISOString()})`, `# ${SECONDS}s of a live game at ${SPEED}x. Columns: real ms since audio start | game time (s) | game clock | period | event | sounds it triggered`,
    `# foot_plant rows ${FEET ? 'included' : 'hidden (run with --feet to include them)'}; counts: ${JSON.stringify(logData.counts)}`, ''];
  for (const r of logData.rows) lines.push(`${String(r.wallMs).padStart(7)} ms | g ${String(r.gameT).padStart(6)} | ${String(r.clock).padStart(6)} | Q${r.period || '-'} | ${r.text}${r.sounds ? '  =>  ' + r.sounds : ''}`);
  fs.writeFileSync(path.join(OUT, 'trial1_trace.txt'), lines.join('\n') + '\n');
  const needTypes = ['dribble_contact', 'foot_plant', 'shot_release', 'score', 'catch', 'pass'];
  const missing = needTypes.filter(t => !logData.counts[t]);
  const court = logData.rows.filter(r => r.type === 'dribble_contact');
  check('event log shows events and the sounds they triggered, with timestamps', !missing.length && logData.withSounds > 10 && court.every(r => /dribble@court/.test(r.sounds) || /DROPPED/.test(r.sounds)),
    { events: logData.total, eventsWithSounds: logData.withSounds, missingTypes: missing, dribbles: court.length, file: path.join(OUT, 'trial1_trace.txt') });

  // ---- every bus soloed and muted during the live game (a test tone per bus, read on the bus meters)
  const busTest = await page.evaluate(async () => {
    const A = PBC.Audio.current, m = A.mixer, buses = PBC.AudioConfig.buses;
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const tones = () => buses.forEach((b, i) => m.testTone(b, 0.9, 300 + i * 110));
    const out = { solo: {}, mute: {} };
    for (const b of buses) {
      m.clearSolo(); m.solo(b, true); tones(); await wait(450);
      const mt = m.meters();
      out.solo[b] = { self: mt[b].rms, others: Math.max(...buses.filter(x => x !== b).map(x => mt[x].rms)), master: mt.master.rms };
      m.solo(b, false); await wait(600);
    }
    m.clearSolo();
    for (const b of buses) {
      m.mute(b, true); tones(); await wait(450);
      const mt = m.meters();
      out.mute[b] = { self: mt[b].rms, othersMin: Math.min(...buses.filter(x => x !== b).map(x => mt[x].rms)), master: mt.master.rms };
      m.mute(b, false); await wait(600);
    }
    return out;
  });
  const soloOk = Object.values(busTest.solo).every(r => r.self > -50 && r.others < -100 && r.master > -50);
  const muteOk = Object.values(busTest.mute).every(r => r.self < -100 && r.othersMin > -50 && r.master > -50);
  const fmt = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).map(([a, x]) => [a, +x.toFixed(1)]))]));
  check('every bus can be soloed during a live game', soloOk, fmt(busTest.solo));
  check('every bus can be muted during a live game', muteOk, fmt(busTest.mute));

  // ---- voice limiting and priority
  const pri = await page.evaluate(() => {
    const A = PBC.Audio.current, m = A.mixer, vs = PBC.AudioConfig.voices.sounds;
    const saved = JSON.parse(JSON.stringify(vs));
    const res = {};
    // 1) a flood of dribbles: never more than its voice limit at once
    vs.dribble.gapMs = 0; vs.dribble.dropAtSpeed = 0;
    for (let i = 0; i < 40; i++) A.bus.emit('dribble_contact', { vol: 0.5, detail: 'stress' });
    res.dribbleActive = m.activeVoices().filter(v => v.name === 'dribble').length; res.dribbleMax = vs.dribble.max;
    // 2) fill every voice with minor sounds, then an important one arrives: it plays by stealing a minor one
    vs.testTone.pri = 1; vs.testTone.max = 999;
    for (const b of PBC.AudioConfig.buses) for (let i = 0; i < 20; i++) m.testTone(b, 2, 200);
    res.totalActive = m.activeVoices().length; res.maxTotal = PBC.AudioConfig.voices.maxTotal;
    const e1 = A.bus.emit('whistle', { kind: 'stress', detail: 'important sound into a full mixer' });
    res.whistle = e1.sounds && e1.sounds[0];
    // 3) fill the arena bus with top-priority voices, then a lesser arena sound arrives: it is the one dropped
    vs.testTone.pri = 10;
    for (let i = 0; i < 10; i++) m.testTone('arena', 2, 250);
    vs.whistle.gapMs = 0;
    const e2 = A.bus.emit('whistle', { kind: 'stress', detail: 'lesser sound into a bus full of priority 10' });
    res.whistleVsTop = e2.sounds && e2.sounds[0];
    Object.assign(vs, saved); for (const k in saved) vs[k] = saved[k];
    return res;
  });
  check('voice limiting: a flood never exceeds the limit', pri.dribbleActive <= pri.dribbleMax && pri.totalActive <= pri.maxTotal, pri);
  check('priority: an important sound steals from minor ones', pri.whistle && !pri.whistle.dropped && pri.whistle.stolen, pri.whistle);
  check('priority: a minor sound never cuts an important one', pri.whistleVsTop && pri.whistleVsTop.dropped === 'full', pri.whistleVsTop);

  // ---- ducking: smooth dip while talking, push-through, smooth recovery
  const duck = await page.evaluate(async () => {
    const A = PBC.Audio.current, m = A.mixer;
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const g = () => m.duckNow().crowd;
    const samples = [];
    const sample = async (ms) => { const n = ms / 50; for (let i = 0; i < n; i++) { samples.push(g()); await wait(50); } };
    m.setTalking(false); await wait(600);
    const before = g();
    m.setTalking(true); await sample(1000);
    const talking = g();
    m.pushThrough(1); await sample(250);
    const pushed = Math.max(...samples.slice(-5));
    await sample(1500);
    m.setTalking(false); await sample(3500);
    const after = g();
    let maxStep = 0; for (let i = 1; i < samples.length; i++) maxStep = Math.max(maxStep, Math.abs(samples[i] - samples[i - 1]));
    return { beforeDb: before, talkingDb: talking, pushedDb: pushed, afterDb: after, maxStepDbPer50ms: maxStep, targetDb: PBC.AudioConfig.duck.targets.crowd };
  });
  check('ducking: commentary dips the crowd smoothly, big moments push through, then it recovers',
    Math.abs(duck.talkingDb - duck.targetDb) < 1 && duck.pushedDb > duck.talkingDb + 1.5 && Math.abs(duck.afterDb) < 0.5 && duck.maxStepDbPer50ms < 2.5,
    Object.fromEntries(Object.entries(duck).map(([k, v]) => [k, +v.toFixed(2)])));

  const fsx = perf.frames;
  const handlerMax = Math.max(...Object.entries(perf.handlers).filter(([k]) => /arena|mixer/.test(k)).map(([, v]) => v.max), 0);
  // (unlockMs is the browser starting its audio device, once, inside the Watch Live click while the game screen is
  // built, before the first frame of play; it is reported but not a gameplay frame)
  check('audio never costs a frame during play', fsx.audioHitches === 0 && fsx.audioMaxMs < 4 && handlerMax < 4,
    { framesSeen: fsx.frames, audioAvgMsPerFrame: +fsx.audioAvgMs.toFixed(3), audioMaxMsPerFrame: +fsx.audioMaxMs.toFixed(2), hitchesCausedByAudio: fsx.audioHitches, arenaHandlerMaxMs: +handlerMax.toFixed(2), slowestEmit: perf.slowestEmit, oneTimeAudioStartMs: perf.unlockMs && +perf.unlockMs.toFixed(1) });
  // (the overlay: open it, check it drew, close it)
  const overlay = await page.evaluate(() => { const d = PBC.Audio.current.debug; d.toggle(true); const el = document.querySelector('.pbc-adbg'); const ok = !!el && el.querySelectorAll('[data-mute]').length === PBC.AudioConfig.buses.length && el.querySelector('.log').children.length > 0; return ok; });
  await page.screenshot({ path: path.join(OUT, 'trial1_overlay.png') });
  check('debug overlay shows the log, meters and mute/solo per bus', overlay, path.join(OUT, 'trial1_overlay.png'));

  check('no page errors', !errors.length, errors.slice(0, 5));
  fs.writeFileSync(path.join(OUT, 'trial1_report.json'), JSON.stringify({ seconds: SECONDS, speed: SPEED, results, clip: { seconds: clip.seconds, peakDb: clip.peakDb }, busTest, pri, duck, perf, latency: logData.latency, counts: logData.counts }, null, 1));
  await browser.close();
  const failed = Object.entries(results).filter(([, r]) => !r.pass).map(([k]) => k);
  console.log(failed.length ? `\n${failed.length} FAILED: ${failed.join('; ')}` : '\nALL PASS');
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
