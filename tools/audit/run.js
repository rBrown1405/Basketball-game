#!/usr/bin/env node
// Gameplay audit: plays whole games of the live court simulation headless (no rendering) and logs what the players
// actually do, then writes a report of bad behaviour with counts.
//
//   node tools/audit/run.js [--games 52] [--procs 4] [--seed 101] [--out audit/latest] [--label now] [--repo .]
//                           [--baseline audit/phase1/metrics.json] [--baseLabel "Phase 1"] [--calls 1]
// (--calls 1: the head coach calls plays, drawn plays, inbound plays and defensive schemes during the games)
//
// Needs Node and Playwright with Chromium (PLAYWRIGHT_BROWSERS_PATH or --chrome path). Each game is a fresh league
// made from its own seed, played from the opening tip to the final buzzer exactly as the Live view plays it; the
// sampler (sampler.js, loaded into the page) watches every player ~10 times a second. Results: <out>/games.json (one
// record per game), <out>/report.md (the metric tables) and <out>/report.html (the same with court diagrams of the
// flagged moments).
'use strict';
const fs = require('fs'), path = require('path');
const args = {};
for (let i = 2; i < process.argv.length; i++) { const k = process.argv[i]; if (k.startsWith('--')) { args[k.slice(2)] = process.argv[i + 1]; i++; } }
const games = +(args.games || 52), procs = +(args.procs || 4), seed0 = +(args.seed || 101);
const repo = path.resolve(args.repo || path.join(__dirname, '..', '..'));
const out = path.resolve(args.out || path.join(repo, 'audit', 'latest'));
const label = args.label || 'now';
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const chromePath = args.chrome || (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined);
const sampler = fs.readFileSync(path.join(__dirname, 'sampler.js'), 'utf8');
const report = require('./report.js');

async function playGame(browser, seed) {
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  // the same numbers every run for the same code and seed
  await page.addInitScript(() => { let s = 424242; Math.random = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 1000000) / 1000000; }; window.__reseed = (v) => { s = v | 0 || 1; }; });
  await page.goto('file://' + path.join(repo, 'index.html'));
  await page.waitForTimeout(600);
  await page.addScriptTag({ content: sampler });
  const t0 = Date.now();
  const res = await page.evaluate(([seed, calls]) => window.PBCAudit.playGame(seed, { calls }), [seed, !!+(args.calls || 0)]);
  res.wallMs = Date.now() - t0; res.errors = errs.slice(0, 5);
  await page.close();
  return res;
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch(chromePath ? { executablePath: chromePath } : {});
  const queue = []; for (let k = 0; k < games; k++) queue.push(seed0 + k);
  const results = [];
  let done = 0;
  const worker = async () => {
    while (queue.length) {
      const seed = queue.shift();
      try { results.push(await playGame(browser, seed)); }
      catch (e) { results.push({ seed, failed: String(e && e.message || e) }); }
      done++;
      process.stdout.write('\r' + done + '/' + games + ' games');
    }
  };
  await Promise.all(Array.from({ length: procs }, worker));
  process.stdout.write('\n');
  await browser.close();
  results.sort((a, b) => a.seed - b.seed);
  // games.json: the raw records (large, not committed); metrics.json: every number in the report (the baseline
  // the next phase compares with)
  fs.writeFileSync(path.join(out, 'games.json'), JSON.stringify({ label, games: results }));
  fs.writeFileSync(path.join(out, 'metrics.json'), JSON.stringify({ label, date: new Date().toISOString().slice(0, 10), metrics: report.metrics(results) }, null, 1));
  // with --baseline <games.json> every metric shows before / now / change
  // (a baseline is a metrics.json from an earlier run, or its games.json)
  const base = args.baseline ? JSON.parse(fs.readFileSync(path.resolve(args.baseline), 'utf8')) : null;
  const o = { label, baseline: base ? base.metrics || report.metrics(base.games) : null, baseLabel: args.baseLabel || (base && base.label) || 'baseline' };
  const r = report.html(results, o);
  fs.writeFileSync(path.join(out, 'report.md'), r.md);
  fs.writeFileSync(path.join(out, 'report.html'), r.html);
  console.log('wrote', path.join(out, 'report.md'), 'and report.html');
})();
