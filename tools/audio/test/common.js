// Shared by the audio tests (tools/audio/test/*.js): Chromium, a new league's first live game, a tap on everything the
// game sends to the speakers, a stand-in speech engine for headless runs, WAV files, and the command line.
'use strict';
const fs = require('fs'), path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

const REPO = path.resolve(__dirname, '..', '..', '..');

/** --key value pairs over the defaults (numbers stay numbers) */
function args(defaults) {
  const o = Object.assign({}, defaults);
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    if (!a[i].startsWith('--')) continue;
    const k = a[i].slice(2), v = a[i + 1];
    i++;
    o[k] = typeof defaults[k] === 'number' ? +v : v;
  }
  o.repo = path.resolve(o.repo || REPO);
  o.out = path.resolve(REPO, o.out || 'audit/audio1');
  fs.mkdirSync(o.out, { recursive: true });
  return o;
}

function launch(o) {
  const exe = (o && o.chrome) || (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined);
  // (sound starts without a click, as it does after the click on "Watch Live" in the game)
  return chromium.launch(Object.assign({ args: ['--autoplay-policy=no-user-gesture-required'] }, exe ? { executablePath: exe } : {}));
}

/** in the page: a new league from the seed, its first user game in the Live view with these settings */
async function openGame(page, repo, seed, settings, query) {
  await page.goto('file://' + path.join(repo, 'index.html') + (query == null ? '?low=1' : query));
  await page.waitForTimeout(700);
  await page.evaluate(([seed, settings]) => {
    // (with FIXED: the page's random numbers start from the same place whatever ran while the page loaded)
    if (window.__reseed) window.__reseed(424242);
    const S = PBC.League.create({ leagueKey: 'men', seed });
    S.userTid = 0; PBC.Coach.create(S, 'Test Coach', 0); PBC.League.preseasonProjections(S); PBC.AI.autoRotation(S, 0);
    S.teams[0].rot.auto = true; PBC.UI.setState(S); PBC.Season.startRegularSeason(S); PBC.Season.prepareToday(S);
    PBC.Season.userGameToday(S) || PBC.Season.advanceToUserGame(S);
    Object.assign(S.settings, { gameIntro: false, replays: false, lowQuality: true }, settings);
    PBC.UI.go('live', {});
  }, [seed, settings]);
}

/** init script: everything connected to an AudioContext's speakers is also recorded (window.__tap), for as long as
 *  window.__tap.rec is true; each block keeps its playbackTime so hits can be measured on the context's own clock */
function TAP() {
  const AC = window.AudioContext;
  window.__tap = { pcm: [[], []], times: [], rec: false, sr: 0, ctxs: [] };
  window.AudioContext = function (...a) {
    const c = new AC(...a);
    const tapIn = c.createGain(), sp = c.createScriptProcessor(4096, 2, 2);
    sp.onaudioprocess = (e) => {
      const T = window.__tap;
      if (!T.rec || (T.only && T.only !== c)) return;
      T.sr = c.sampleRate;
      T.times.push(e.playbackTime);
      for (let ch = 0; ch < 2; ch++) T.pcm[ch].push(new Float32Array(e.inputBuffer.getChannelData(ch)));
    };
    tapIn.connect(sp); sp.connect(c.destination);
    c.__tapIn = tapIn;
    window.__tap.ctxs.push(c);
    return c;
  };
  window.AudioContext.prototype = AC.prototype;
  const conn = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (target, ...rest) {
    const r = conn.call(this, target, ...rest);
    try { if (target && this.context && target === this.context.destination && this.context.__tapIn && this !== this.context.__tapIn && !(this instanceof ScriptProcessorNode)) conn.call(this, this.context.__tapIn); } catch (e) { /* ignore */ }
    return r;
  };
  // the tapped audio as a 16-bit stereo WAV, base64 (and the tap emptied)
  window.__tapWav = () => {
    const T = window.__tap, n = T.pcm[0].reduce((a, b) => a + b.length, 0);
    const buf = new ArrayBuffer(44 + n * 4), d = new DataView(buf), w = (o, s) => { for (let i = 0; i < s.length; i++) d.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); d.setUint32(4, 36 + n * 4, true); w(8, 'WAVE'); w(12, 'fmt '); d.setUint32(16, 16, true); d.setUint16(20, 1, true); d.setUint16(22, 2, true);
    d.setUint32(24, T.sr, true); d.setUint32(28, T.sr * 4, true); d.setUint16(32, 4, true); d.setUint16(34, 16, true); w(36, 'data'); d.setUint32(40, n * 4, true);
    let o = 44;
    for (let k = 0; k < T.pcm[0].length; k++) {
      const L = T.pcm[0][k], R = T.pcm[1][k];
      for (let i = 0; i < L.length; i++) { d.setInt16(o, Math.max(-1, Math.min(1, L[i])) * 32767, true); d.setInt16(o + 2, Math.max(-1, Math.min(1, R[i])) * 32767, true); o += 4; }
    }
    T.pcm = [[], []]; T.times = [];
    let s = ''; const u = new Uint8Array(buf);
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return btoa(s);
  };
}

/** init script: headless Chromium has no voices (speak() fails at once), so a stand-in engine with a real one's
 *  timeline: the line starts after ~40 ms and ends after ~0.33 s a word. The booth then talks, ducks the crowd, and
 *  its lines can be timed (window.__spoken) */
function SPEECH() {
  if (!window.speechSynthesis) return;
  let cur = null;
  speechSynthesis.speak = (u) => {
    const words = String(u.text || '').split(/\s+/).length, dur = Math.max(700, words * 330);
    cur = u;
    setTimeout(() => { if (cur === u && u.onstart) u.onstart({}); }, 40);
    setTimeout(() => { if (cur === u) { cur = null; if (u.onend) u.onend({}); } }, dur);
    (window.__spoken = window.__spoken || []).push({ at: performance.now(), dur, text: u.text });
  };
  speechSynthesis.cancel = () => { const u = cur; cur = null; if (u && u.onend) u.onend({}); };
  speechSynthesis.pause = () => {};
  speechSynthesis.resume = () => {};
}

/** init script: the page's random numbers and clock fixed, and the clock only moves when the test says (window.__adv) */
function FIXED() {
  let s = 424242;
  Math.random = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 1000000) / 1000000; };
  window.__reseed = (v) => { s = (v | 0) || 1; };
  let t = 1e6;
  performance.now = () => t; Date.now = () => Math.floor(t);
  window.__adv = (ms) => (t += ms);
}

/** in the page: the mixer's "last N s" as base64 WAV */
async function mixerWav(page, secs) {
  return page.evaluate((secs) => PBC.AudioDebug.saveWav(secs).then((r) => {
    if (!r) return null;
    let s = ''; const u = new Uint8Array(r.wav);
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return { b64: btoa(s), seconds: r.seconds, kind: r.kind };
  }), secs);
}

const pct = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p / 100 * s.length))] : NaN; };

module.exports = { REPO, args, launch, openGame, TAP, SPEECH, FIXED, mixerWav, pct };
