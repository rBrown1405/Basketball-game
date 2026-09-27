#!/usr/bin/env node
// Animation checks: plays real possessions of the Live view headless and counts what the procedural animation work
// fixed, so a gameplay change can show it broke none of it:
//  - body contact: the ball, hands or forearms inside the player's own body, knees, shins or feet of the two legs
//    crossing through each other (capsules from the skeleton);
//  - feet stuck behind: a planted foot far behind the hip while the body runs on.
//
//   node tools/audit/anim.js [--repo .] [--seeds 5,9,13,17] [--poss 20] [--out audit/latest/anim.json]
//                            [--baseline audit/phase1/anim.json]
//
// The same code and seed always give the same numbers (the page's random numbers and clock are fixed).
'use strict';
const fs = require('fs'), path = require('path');
const args = {};
for (let i = 2; i < process.argv.length; i++) { const k = process.argv[i]; if (k.startsWith('--')) { args[k.slice(2)] = process.argv[i + 1]; i++; } }
const repo = path.resolve(args.repo || path.join(__dirname, '..', '..'));
const seeds = String(args.seeds || '5,9,13,17').split(',').map(Number);
const N = +(args.poss || 20);
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const chromePath = args.chrome || (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined);

async function one(browser, seed) {
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('file://' + path.join(repo, 'index.html'));
  await page.waitForTimeout(800);
  const r = await page.evaluate(([N, seed]) => {
    { let s = 424242; Math.random = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 1000000) / 1000000; }; let t = 1e6; performance.now = () => (t += 0.5); Date.now = () => Math.floor(t); }
    const S = PBC.League.create({ leagueKey: 'men', seed });
    S.userTid = 0; PBC.Coach.create(S, 'Test Coach', 0); PBC.League.preseasonProjections(S); PBC.AI.autoRotation(S, 0);
    S.teams[0].rot.auto = true; PBC.UI.setState(S); PBC.Season.startRegularSeason(S); PBC.Season.prepareToday(S);
    const ug = PBC.Season.userGameToday(S) || PBC.Season.advanceToUserGame(S);
    S.settings.gameIntro = false; S.settings.replays = false; S.settings.commentary = false; S.settings.tvGraphics = false; S.settings.gimEnabled = false;
    PBC.UI.go('live', { gid: ug.gid });
    const LG = PBC.UI._liveDebug.state();
    LG.alive = false; cancelAnimationFrame(LG.raf);
    const v = LG.view, M = PBC.Match, J = M.Rig.J;
    // distance from a point to the segment a-b (joint indices), and between two segments (sampled)
    const seg = (P, a, b, x, y, z) => {
      const ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2], bx = P[b * 3] - ax, by = P[b * 3 + 1] - ay, bz = P[b * 3 + 2] - az;
      const l2 = bx * bx + by * by + bz * bz || 1e-9;
      const t = Math.max(0, Math.min(1, ((x - ax) * bx + (y - ay) * by + (z - az) * bz) / l2));
      return Math.hypot(x - ax - bx * t, y - ay - by * t, z - az - bz * t);
    };
    const segseg = (P, a, b, c, d) => { let m = 1e9; for (let i = 0; i <= 8; i++) { const t = i / 8; const x = P[a * 3] + (P[b * 3] - P[a * 3]) * t, y = P[a * 3 + 1] + (P[b * 3 + 1] - P[a * 3 + 1]) * t, z = P[a * 3 + 2] + (P[b * 3 + 2] - P[a * 3 + 2]) * t; m = Math.min(m, seg(P, c, d, x, y, z)); } return m; };
    const contact = {};
    let frames = 0, runFrames = 0, stuck = 0;
    const ep = {}, epLen = [];
    const add = (k) => { contact[k] = (contact[k] || 0) + 1; };
    for (let k = 0; k < N; k++) {
      const P0 = PBC.Sim.nextPossession(LG.g); if (!P0) break;
      if (LG.g.pending) PBC.Sim.resolvePending(LG.g, P0, { quality: 'good' });
      let done = false; v.play(P0, { onEvent() {}, onDone() { done = true; } });
      for (let i = 0; i < 60 * 60 && !done; i++) {
        v.update(1 / 60);
        if (i % 3) continue;
        const b = v.ball;
        for (const id in v.actors) {
          const a = v.actors[id]; a.solve();
          const P = a.sk.P, H = a.H;
          frames++;
          const rT = 0.075 * H, rHead = 0.068 * H, rB = 0.39, rFa = 0.024 * H, rHd = 0.02 * H, rTh = 0.048 * H;
          // the ball against his own body (held or dribbled by him)
          if (b.holder === a || (b.dr && b.dr.actor === a)) {
            if (Math.min(seg(P, J.PEL, J.CHS, b.x, b.y, b.z), seg(P, J.CHS, J.NCK, b.x, b.y, b.z)) < rT + rB - 0.02 * H) add('ball-torso');
            if (seg(P, J.HC, J.HC, b.x, b.y, b.z) < rHead + rB - 0.02 * H) add('ball-head');
            for (const s of [[J.L_HIP, J.L_KN], [J.R_HIP, J.R_KN]]) if (seg(P, s[0], s[1], b.x, b.y, b.z) < rTh + rB - 0.02 * H) { add('ball-thigh'); break; }
          }
          // forearms and hands against the torso and head
          for (const s of [[J.L_EL, J.L_WR, J.L_HD], [J.R_EL, J.R_WR, J.R_HD]]) {
            if (Math.min(segseg(P, s[0], s[1], J.PEL, J.CHS), segseg(P, s[0], s[1], J.CHS, J.NCK)) < rT + rFa - 0.02 * H) add('forearm-torso');
            if (Math.min(segseg(P, s[1], s[2], J.PEL, J.CHS), segseg(P, s[1], s[2], J.CHS, J.NCK)) < rT + rHd - 0.02 * H) add('hand-torso');
            if (Math.min(segseg(P, s[0], s[1], J.HC, J.HC), segseg(P, s[1], s[2], J.HC, J.HC)) < rHead + rFa - 0.015 * H) add('arm-head');
          }
          // the two legs through each other (knees ~4.5 in wide, calves and feet ~4 in)
          if (Math.hypot(P[J.L_KN * 3] - P[J.R_KN * 3], P[J.L_KN * 3 + 1] - P[J.R_KN * 3 + 1], P[J.L_KN * 3 + 2] - P[J.R_KN * 3 + 2]) < 0.052 * H) add('knee-knee');
          if (segseg(P, J.L_KN, J.L_AN, J.R_KN, J.R_AN) < 0.044 * H) add('shin-shin');
          if (segseg(P, J.L_HEEL, J.L_TOE, J.R_HEEL, J.R_TOE) < 0.04 * H) add('foot-foot');
          // a planted foot stuck far behind the hip while he runs on (outside clips)
          if (a.speed < 4 || (a.clip && !a.clip.done)) { if (ep[id] > 0) epLen.push(ep[id]); ep[id] = 0; continue; }
          runFrames++;
          const ux = a.vx / a.speed, uy = a.vy / a.speed;
          let worst = 0;
          for (const f of a.feet) {
            if (f.state !== 'plant') continue;
            const h = (f.side ? J.R_HIP : J.L_HIP) * 3, an = (f.side ? J.R_AN : J.L_AN) * 3;
            const behind = -((P[an] - P[h]) * ux + (P[an + 1] - P[h + 1]) * uy) / H;
            if (behind > worst) worst = behind;
          }
          if (worst > 0.34) { stuck++; ep[id] = (ep[id] || 0) + 1; } else { if (ep[id] > 0) epLen.push(ep[id]); ep[id] = 0; }
        }
      }
    }
    return { frames, runFrames, contact, stuck, stuckEpisodes: epLen.length, longestStuck: epLen.length ? Math.max(...epLen) : 0 };
  }, [N, seed]);
  r.seed = seed; r.errors = errs.slice(0, 5);
  await page.close();
  return r;
}

(async () => {
  const browser = await chromium.launch(chromePath ? { executablePath: chromePath } : {});
  const runs = await Promise.all(seeds.map((s) => one(browser, s)));
  await browser.close();
  const sum = { frames: 0, runFrames: 0, stuck: 0, stuckEpisodes: 0, contact: {}, errors: 0 };
  for (const r of runs) {
    sum.frames += r.frames; sum.runFrames += r.runFrames; sum.stuck += r.stuck; sum.stuckEpisodes += r.stuckEpisodes; sum.errors += r.errors.length;
    for (const k in r.contact) sum.contact[k] = (sum.contact[k] || 0) + r.contact[k];
  }
  // rates: per 10,000 player-frames (sampled every 3rd frame at 60 fps), stuck feet per 10,000 running frames
  const rates = { contactPer10k: {}, stuckPer10k: +(1e4 * sum.stuck / Math.max(1, sum.runFrames)).toFixed(1), stuckEpisodes: sum.stuckEpisodes, errors: sum.errors };
  let tot = 0;
  for (const k in sum.contact) { rates.contactPer10k[k] = +(1e4 * sum.contact[k] / sum.frames).toFixed(1); tot += sum.contact[k]; }
  rates.contactAllPer10k = +(1e4 * tot / sum.frames).toFixed(1);
  const res = { seeds, poss: N, sum, rates, runs };
  if (args.out) { fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true }); fs.writeFileSync(path.resolve(args.out), JSON.stringify(res, null, 1)); }
  const base = args.baseline ? JSON.parse(fs.readFileSync(path.resolve(args.baseline), 'utf8')).rates : null;
  const row = (label, now, was) => console.log(label.padEnd(34) + (base ? String(was == null ? '-' : was).padStart(10) : '') + String(now).padStart(10));
  console.log(`${seeds.length} games x ${N} possessions, ${sum.frames} player-frames` + (base ? '   (before / now)' : ''));
  row('body contact, all (per 10k)', rates.contactAllPer10k, base && base.contactAllPer10k);
  const keys = [...new Set(Object.keys(rates.contactPer10k).concat(base ? Object.keys(base.contactPer10k) : []))].sort();
  for (const k of keys) row('  ' + k, rates.contactPer10k[k] || 0, base && (base.contactPer10k[k] || 0));
  row('feet stuck behind (per 10k running)', rates.stuckPer10k, base && base.stuckPer10k);
  row('  episodes', rates.stuckEpisodes, base && base.stuckEpisodes);
  row('script errors', rates.errors, base && base.errors);
})();
