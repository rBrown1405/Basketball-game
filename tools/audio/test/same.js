#!/usr/bin/env node
// The audio never changes the game: seeded live games driven frame by frame through the real live loop (the bus, the
// tracker, the mixer, the arena audio and the booth all running) on a clock the test controls, with the audio all on,
// all off, and arena sound on with the booth off. Compared: the play-by-play and box score (the game) and a
// fingerprint of the court every 10 frames (the ball's position and state, the play beat: the presentation).
//   node tools/audio/test/same.js [--seeds 21,33] [--poss 12] [--speed 4] [--out audit/audio1]
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const T = require('./common.js');
const o = T.args({ seeds: '21', poss: 12, speed: 4 });
const CONFIGS = [
  { name: 'all on', arenaSound: true, commentary: true, voice: true },
  { name: 'all off', arenaSound: false, commentary: false, voice: false },
  { name: 'arena on, booth off', arenaSound: true, commentary: false, voice: false },
];
async function run(browser, seed, cfg) {
  const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.addInitScript(T.FIXED);
  await T.openGame(page, o.repo, seed, { tvGraphics: false, gimEnabled: false, simSpeed: o.speed, volume: 0.8, arenaSound: cfg.arenaSound, commentary: cfg.commentary, voice: cfg.voice });
  const r = await page.evaluate((POSS) => {
    const D = PBC.UI._liveDebug;
    D.manual();
    let frames = 0;
    const court = [];
    while (frames < 200000) {
      const L = D.state(); if (!L || L.finished) break;
      if (L.P && L.P.n != null && L.P.n >= POSS && L.possDone) break;
      if (frames % 10 === 0 && L.view && L.view.ball) { const b = L.view.ball, d = L.view.director; court.push(b.x.toFixed(2) + ',' + b.y.toFixed(2) + ',' + b.z.toFixed(2) + ',' + b.state + ',' + (d && d.beat ? d.beat.type : '-')); }
      D.frame(window.__adv(1000 / 60)); frames++;
    }
    const L = D.state(), g = L.g;
    return {
      frames, poss: L.P ? L.P.n : null, score: g.score.slice(), period: g.period, clock: g.clock, pbpN: g.pbp.length,
      pbp: g.pbp.map((x) => `${x.q}|${x.clock != null ? (+x.clock).toFixed(2) : ''}|${x.text}`).join('\n'),
      box: JSON.stringify(PBC.Sim.box(g).teams.map((t) => t.players.map((p) => [p.pid, p.pts, p.fgm, p.fga, p.orb, p.drb, p.ast, p.stl, p.blk, p.tov, p.pf]))),
      court: court.join(';'), played: L.mx ? L.mx.stats().played : 0,
    };
  }, o.poss);
  await page.close();
  r.errs = errs;
  return r;
}
(async () => {
  const browser = await T.launch(o);
  const L = [];
  let all = true;
  for (const seed of String(o.seeds).split(',').map(Number)) {
    const res = [];
    for (const cfg of CONFIGS) {
      const r = await run(browser, seed, cfg);
      const game = crypto.createHash('sha1').update(r.pbp + '#' + r.box).digest('hex').slice(0, 12);
      const court = crypto.createHash('sha1').update(r.court + '#' + r.frames).digest('hex').slice(0, 12);
      res.push({ cfg: cfg.name, game, court, r });
      L.push(`seed ${seed} | ${cfg.name.padEnd(20)} | possessions ${r.poss}, ${r.frames} frames, Q${r.period} ${r.clock.toFixed(1)} s left, score ${r.score.join('-')}, ${r.pbpN} play-by-play lines | game ${game} | court ${court} | sounds played ${r.played} | errors ${r.errs.length}`);
      console.log(L[L.length - 1]);
    }
    const same = res.every((x) => x.game === res[0].game && x.court === res[0].court);
    all = all && same;
    L.push(`seed ${seed}: ${same ? 'IDENTICAL (the game and the court presentation)' : 'DIFFERENT'} with the ${res.length} audio settings`, '');
    console.log(L[L.length - 2]);
  }
  L.push(all ? 'RESULT: PASS (the audio settings change nothing in the game or on the court)' : 'RESULT: FAIL');
  const txt = L.join('\n');
  fs.writeFileSync(path.join(o.out, 'same_result.txt'), txt + '\n');
  console.log(txt.split('\n').pop());
  await browser.close();
  process.exit(all ? 0 : 1);
})();
