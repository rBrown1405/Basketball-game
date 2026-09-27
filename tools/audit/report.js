// Gameplay audit report: turns the per-game records from sampler.js into the metric tables (markdown for the repo,
// HTML with court diagrams of the flagged moments). With a baseline (an earlier games.json) every metric shows
// before / now / change, so each phase can prove what improved and that nothing else broke.
'use strict';

const pct = (a, b) => (b > 0 ? (100 * a) / b : 0);
const sum = (l, f) => l.reduce((s, x) => s + (f ? f(x) : x), 0);
const median = (l) => { if (!l.length) return 0; const s = l.slice().sort((a, b) => a - b); return s[s.length >> 1]; };
const f1 = (x) => (x == null || !isFinite(x) ? 'n/a' : (Math.round(x * 10) / 10).toFixed(1));
const POS_ORDER = ['PG', 'SG', 'SF', 'PF', 'PF (stretch)', 'C', 'C (stretch)'];
const ZONES = ['rim', 'paint', 'short', 'mid', 'corner3', 'arc3', 'deep'];
const ZONE_LABEL = { rim: 'at rim (<4 ft)', paint: 'paint', short: 'short corner / baseline', mid: 'mid-range', corner3: 'corner 3', arc3: 'above-break 3', deep: 'deep (28+ ft)' };

/** every number the report shows, as { key: value }, from the raw game records */
function metrics(games) {
  const G = games.filter((g) => !g.failed), n = G.length || 1;
  const m = {};
  const tot = (f) => sum(G, f);
  // ---- health
  m.games = G.length; m.failed = games.length - G.length;
  m.finished = tot((g) => (g.final ? 1 : 0));
  m.possPerGame = tot((g) => g.poss) / n;
  m.stuck = tot((g) => g.stuck);
  m.errors = tot((g) => (g.errors || []).length + (g.samplerErrors || 0));
  m.warnings = tot((g) => sum(Object.values(g.warns || {})));
  m.msPerGame = tot((g) => g.ms) / n;
  m.ptsPerGame = tot((g) => (g.engineScore ? g.engineScore[0] + g.engineScore[1] : 0)) / n;
  m.scoreMismatch = tot((g) => (g.score && g.engineScore && (g.score[0] !== g.engineScore[0] || g.score[1] !== g.engineScore[1]) ? 1 : 0));
  const hcN = tot((g) => g.hc.n);
  m.hcSecPerGame = (hcN * 0.1) / n;
  // ---- on-ball defense
  const ob = (k) => tot((g) => g.onball[k]);
  const obN = ob('n');
  m.obBetween = pct(ob('between'), obN);
  m.obLow = pct(ob('lowStance'), obN);
  m.obRetreat = pct(ob('retreat'), obN);
  m.obBackpedal = pct(ob('backpedal'), obN);
  m.obTurnAway = pct(ob('turnAway'), obN);
  m.obBackTurned = pct(ob('backTurned'), obN);
  m.obRunClose = pct(ob('runClose'), obN);
  m.obFar = pct(ob('far'), obN);
  m.obBeaten = pct(ob('beaten'), obN);
  const eps = (k) => G.flatMap((g) => g.onball.eps[k] || []);
  m.obRetreatEps = eps('retreat').length / n; m.obRetreatSec = sum(eps('retreat')) / n;
  m.obTurnAwayEps = eps('turnAway').length / n; m.obTurnAwaySec = sum(eps('turnAway')) / n;
  const cush = {};
  for (const g of G) for (const k in g.onball.cushion) { const c = cush[k] || (cush[k] = [0, 0]); c[0] += g.onball.cushion[k][0]; c[1] += g.onball.cushion[k][1]; }
  const cu = (keys) => { let a = 0, b = 0; for (const k of keys) if (cush[k]) { a += cush[k][0]; b += cush[k][1]; } return b ? a / b : null; };
  m.cushionNon = cu(['<40', '40-49']); m.cushionMid = cu(['50-59', '60-69']); m.cushionGood = cu(['70-79']); m.cushionElite = cu(['80+']);
  m.cushionGap = m.cushionNon != null && m.cushionElite != null ? m.cushionNon - m.cushionElite : null;
  // ---- off-ball defense
  const of = (k) => tot((g) => g.offball[k] || 0);
  m.denyOne = pct(of('deny'), of('one'));
  m.helpTwo = pct(of('help'), of('two'));
  m.sagTwo = pct(of('sag'), of('two'));
  m.seesTwo = pct(of('sees'), of('two'));
  m.tightTwo = pct(of('tightTwo'), of('two'));
  m.crowdSec = (of('crowd') * 0.1) / n; m.crowdPct = pct(of('crowd'), hcN);
  m.crowdEps = G.flatMap((g) => g.offball.eps.crowd).length / n;
  m.pathSec = (of('path') * 0.1) / n;
  m.rimHelpSec = (of('rimHelp') * 0.1) / n;
  m.abandoned = pct(of('abandoned'), of('n'));
  m.abandonedEps = G.flatMap((g) => g.offball.eps.abandoned).length / n;
  m.zoneShare = pct(of('zoneN'), hcN);
  // ---- offense movement
  const offSec = tot((g) => g.idle.offSec);
  m.still = pct(tot((g) => g.idle.stillSec), offSec);
  const hasSpeed = G.some((g) => g.idle.speedSum != null); // (records from before this metric have none)
  m.offSpeed = hasSpeed && offSec ? tot((g) => g.idle.speedSum || 0) / offSec : null;
  m.offJog = hasSpeed ? pct(tot((g) => g.idle.jogSec || 0), offSec) : null;
  m.loiter = pct(tot((g) => g.idle.loiterSec || 0), offSec);
  m.clumped = pct(tot((g) => g.idle.pairClose * 2), offSec);
  m.still3Eps = tot((g) => g.idle.eps['3-5'] + g.idle.eps['5-8'] + g.idle.eps['8+']) / n;
  m.still5Eps = tot((g) => g.idle.eps['5-8'] + g.idle.eps['8+']) / n;
  const jobs = {}; for (const g of G) for (const k in (g.idle.jobs || {})) jobs[k] = (jobs[k] || 0) + g.idle.jobs[k];
  const jobT = sum(Object.values(jobs));
  if (jobT) { m.jobEngine = pct(jobs.engine || 0, jobT); m.jobFlow = pct(jobs.flow || 0, jobT); m.jobClip = pct(jobs.clip || 0, jobT); m.jobSpacing = pct(jobs.spacing || 0, jobT); m.jobNone = pct(jobs.none || 0, jobT); }
  const nz = {}; for (const g of G) for (const k in (g.idle.noJobZone || {})) nz[k] = (nz[k] || 0) + g.idle.noJobZone[k];
  const nzT = sum(Object.values(nz)); if (nzT) for (const z of ZONES) m['noJob_' + z] = pct(nz[z] || 0, nzT);
  const jbp = {}; for (const g of G) for (const k in (g.idle.jobByPos || {})) { const a = jbp[k] || (jbp[k] = {}); for (const j in g.idle.jobByPos[k]) a[j] = (a[j] || 0) + g.idle.jobByPos[k][j]; }
  for (const k of POS_ORDER) if (jbp[k]) { const t = sum(Object.values(jbp[k])); m['noJob_pos_' + k] = pct(jbp[k].none || 0, t); }
  const idlePos = {};
  for (const g of G) for (const k in g.idle.byPos) { const a = idlePos[k] || (idlePos[k] = [0, 0, 0]); const b = g.idle.byPos[k]; a[0] += b[0]; a[1] += b[1]; a[2] += b[2] || 0; }
  for (const k of POS_ORDER) if (idlePos[k]) { m['still_' + k] = pct(idlePos[k][0], idlePos[k][1]); m['loiter_' + k] = pct(idlePos[k][2], idlePos[k][1]); }
  // ---- spacing by position
  const sp = {};
  for (const g of G) for (const k in g.spacing.byPos) { const a = sp[k] || (sp[k] = { n: 0 }); const b = g.spacing.byPos[k]; a.n += b.n; for (const z of ZONES) a[z] = (a[z] || 0) + (b[z] || 0); }
  for (const k of POS_ORDER) if (sp[k]) { for (const z of ZONES) m['sp_' + k + '_' + z] = pct(sp[k][z] || 0, sp[k].n); m['sp_' + k + '_inside'] = pct((sp[k].rim || 0) + (sp[k].paint || 0) + (sp[k].short || 0), sp[k].n); }
  const bigIn = ['PF', 'C'].reduce((s, k) => s + (sp[k] ? (sp[k].rim || 0) + (sp[k].paint || 0) + (sp[k].short || 0) : 0), 0), bigN = ['PF', 'C'].reduce((s, k) => s + (sp[k] ? sp[k].n : 0), 0);
  m.bigsInside = pct(bigIn, bigN);
  const spN = tot((g) => g.spacing.n);
  const nOut = [0, 1, 2, 3, 4, 5].map((i) => tot((g) => g.spacing.nOut[i]));
  m.fiveOut = pct(nOut[5], spN); m.fourPlusOut = pct(nOut[4] + nOut[5], spN); m.twoOrLessOut = pct(nOut[0] + nOut[1] + nOut[2], spN);
  m.noInside = pct(tot((g) => g.spacing.noInside), spN);
  m.avgOut = sum(nOut.map((c, i) => c * i)) / Math.max(1, spN);
  // ---- shots (the engine's choices, measured where the live view shows them)
  const shots = G.flatMap((g) => g.shots);
  const three = shots.filter((s) => s.pts === 3 && s.kind !== 'heave');
  m.fgaPerGame = shots.length / n; m.tpaPerGame = three.length / n;
  m.tpaLow50 = three.filter((s) => s.three < 50).length / n;
  m.tpaLow40 = three.filter((s) => s.three < 40).length / n;
  m.tpaCenters = three.filter((s) => s.pos === 'C').length / n;
  m.tpaBigsNonStretch = three.filter((s) => s.big && !s.stretch).length / n;
  m.tpaShareLow50 = pct(three.filter((s) => s.three < 50).length, three.length);
  const openL = shots.filter((s) => s.contest === 'open' && s.live != null), contL = shots.filter((s) => s.contest === 'contested' && s.live != null), tightL = shots.filter((s) => s.contest === 'tight' && s.live != null);
  m.openShotDefClose = pct(openL.filter((s) => s.live < 3).length, openL.length);
  m.openShotMedian = median(openL.map((s) => s.live));
  m.open3DefClose = pct(openL.filter((s) => s.pts === 3 && s.live < 4).length, openL.filter((s) => s.pts === 3).length);
  const rimZ = (s) => s.zone === 'rim' || s.zone === 'paint';
  m.openRimDefClose = pct(openL.filter((s) => rimZ(s) && s.live < 3).length, openL.filter(rimZ).length);
  m.openMidDefClose = pct(openL.filter((s) => s.zone === 'mid' && s.live < 4).length, openL.filter((s) => s.zone === 'mid').length);
  m.contShotMedian = median(contL.map((s) => s.live));
  m.tightShotMedian = median(tightL.map((s) => s.live));
  m.tightShotWide = pct(tightL.filter((s) => s.live > 6).length, tightL.length);
  // (with the shot clock on: the NBA's shot clock splits leave out shots when the game clock is under the shot clock)
  const scOn = shots.filter((s) => s.clk == null || s.clk > s.sc + 0.5);
  m.shotClockLate = pct(scOn.filter((s) => s.sc < 4).length, scOn.length);
  m.shotClockEarly = pct(scOn.filter((s) => s.sc >= 18).length, scOn.length);
  m.shotClockMedian = median(scOn.map((s) => s.sc));
  // ---- catches (what an open shooter does with the ball)
  const catches = G.flatMap((g) => g.catches);
  m.catchesPerGame = catches.length / n;
  // (in shooting range: within 26 ft of the rim, like the wide-open shooters off the ball; a catch near half court is
  // not a shot for anyone)
  const wo = catches.filter((c) => c.open >= 10 && c.rating >= 70 && c.sc > 4 && !(c.rim > 26));
  const op = catches.filter((c) => c.open >= 6 && c.open < 10 && c.rating >= 70 && c.sc > 4 && !(c.rim > 26));
  const outs = (l, o) => pct(l.filter((c) => c.out === o).length, l.length);
  m.wideOpenCatches = wo.length / n; m.wideOpenShot = outs(wo, 'shot'); m.wideOpenPass = outs(wo, 'pass'); m.wideOpenDrive = pct(wo.filter((c) => c.drove && c.out !== 'shot').length, wo.length);
  m.wideOpenPassedPerGame = wo.filter((c) => c.out === 'pass').length / n;
  m.wideOpenPassSwing = pct(wo.filter((c) => c.out === 'pass' && c.swing).length, wo.filter((c) => c.out === 'pass').length);
  m.openCatches = op.length / n; m.openShot = outs(op, 'shot'); m.openPass = outs(op, 'pass');
  m.catchHeldMedian = median(catches.filter((c) => c.out === 'pass').map((c) => c.held));
  const oo = G.map((g) => g.openOff || { n: 0, found: 0, sec: 0 });
  m.openOffPerGame = sum(oo, (x) => x.n) / n; m.openOffFound = pct(sum(oo, (x) => x.found), sum(oo, (x) => x.n));
  m.openOffSecPerGame = sum(oo, (x) => x.sec) / n;
  // ---- rebounding and the ball
  const reb = G.flatMap((g) => g.rebounds);
  m.rebPerGame = reb.length / n;
  m.rebGrabZ = median(reb.map((r) => r.z));
  m.rebAbove10 = pct(reb.filter((r) => r.z > 10).length, reb.length);
  m.rebBend1 = pct(reb.filter((r) => (r.bend || 0) > 1).length, reb.length);
  m.rebBend3 = pct(reb.filter((r) => (r.bend || 0) > 3).length, reb.length);
  m.rebBendMax = reb.length ? Math.max(...reb.map((r) => r.bend || 0)) : 0;
  m.rebJump3 = pct(reb.filter((r) => r.jump > 3).length, reb.length);
  m.rebHang = pct(reb.filter((r) => r.hang > 0.2).length, reb.length);
  m.rebFloor = pct(reb.filter((r) => r.floor > 0).length, reb.length);
  const catchG = G.flatMap((g) => g.gives.catch);
  m.passBend2 = pct(catchG.filter((x) => (Array.isArray(x) ? x[1] : 0) > 2).length, catchG.length);
  const bo = G.flatMap((g) => g.boxouts);
  m.boxingPerMiss = sum(bo, (b) => b.boxing) / Math.max(1, bo.length);
  m.perimBoxPerMiss = sum(bo, (b) => b.perim) / Math.max(1, bo.length);
  m.defNearRimPerMiss = sum(bo, (b) => b.nearRim) / Math.max(1, bo.length);
  m.offNearRimPerMiss = sum(bo, (b) => b.offNear) / Math.max(1, bo.length);
  // ---- called plays (games from before the playbooks have none)
  const PB = G.filter((g) => g.pb);
  if (PB.length) {
    const pt = (f) => sum(PB, f), pn = PB.length;
    const calls = pt((g) => g.pb.calls), poss = pt((g) => g.pb.poss);
    m.pbHalfPoss = poss / pn;
    m.pbCallShare = pct(pt((g) => g.pb.withCall), poss);
    m.pbCallsPerGame = calls / pn;
    m.pbDone = pct(pt((g) => g.pb.done), calls);
    m.pbEarly = pct(pt((g) => g.pb.early), calls);
    m.pbSteps = pct(pt((g) => g.pb.steps), pt((g) => g.pb.stepsOf));
    const end = (k) => pct(pt((g) => g.pb.ends[k] || 0), calls);
    m.pbEndReset = end('reset'); m.pbEndTo = end('turnover'); m.pbEndFoul = end('foul') + end('def3');
    const allN = pt((g) => g.pb.all.n), allP = pt((g) => g.pb.all.pts), flN = pt((g) => g.pb.flow.n), flP = pt((g) => g.pb.flow.pts);
    m.pbPppHalf = allN ? allP / allN : null;
    m.pbPppCalled = allN - flN ? (allP - flP) / (allN - flN) : null;
    m.pbPppFlow = flN ? flP / flN : null;
    const sp = (k) => pt((g) => g.pb.spot[k] || 0), spN = sp('n');
    m.pbSpot2 = pct(sp('lt2'), spN); m.pbSpot5 = pct(sp('lt2') + sp('lt5'), spN); m.pbSpotFar = pct(sp('far'), spN);
    m.pbInbPerGame = pt((g) => g.pb.inb.n) / pn;
    m.pbInbSafety = pct(pt((g) => g.pb.inb.safety), pt((g) => g.pb.inb.n));
    // the court's coverage against the coverage the engine called (0.6 s after the screen)
    const EXPECT = { drop: ['back in the lane'], blitz: ['on the ball'], switch: ['switched'], show: ['at the screen', 'on the ball'], hedge: ['at the screen', 'on the ball'], ice: ['back in the lane', 'at the screen'] };
    let cm = 0, cn = 0;
    const seen = {};
    for (const g of PB) for (const c in g.pb.covSeen) { const o = seen[c] || (seen[c] = {}); for (const k in g.pb.covSeen[c]) { o[k] = (o[k] || 0) + g.pb.covSeen[c][k]; cn += g.pb.covSeen[c][k]; if ((EXPECT[c] || []).includes(k)) cm += g.pb.covSeen[c][k]; } }
    m.pbCovMatch = cn ? pct(cm, cn) : null;
    m._pbCovSeen = seen;
    // by family and by play
    const fam = {}, play = {}, base = {}, reads = {}, cov = {};
    for (const g of PB) {
      for (const k in g.pb.byFam) { const f = fam[k] || (fam[k] = { n: 0, pts: 0, early: 0, done: 0 }); const x = g.pb.byFam[k]; f.n += x.n; f.pts += x.pts; f.early += x.early; f.done += x.done; }
      for (const k in g.pb.byPlay) { const f = play[k] || (play[k] = { n: 0, pts: 0, early: 0, done: 0, name: g.pb.byPlay[k].name, fam: g.pb.byPlay[k].fam }); const x = g.pb.byPlay[k]; f.n += x.n; f.pts += x.pts; f.early += x.early; f.done += x.done; }
      for (const k in g.pb.byBase) { const f = base[k] || (base[k] = { n: 0, pts: 0 }); f.n += g.pb.byBase[k].n; f.pts += g.pb.byBase[k].pts; }
      for (const k in g.pb.reads) reads[k] = (reads[k] || 0) + g.pb.reads[k];
      for (const k in g.pb.cov) cov[k] = (cov[k] || 0) + g.pb.cov[k];
    }
    m._pbFam = fam; m._pbPlay = play; m._pbBase = base; m._pbReads = reads; m._pbCov = cov; m._pbGames = pn;
  }
  return m;
}

// the report rows: [key, label, unit, better ('down' | 'up' | ''), reference]
const SECTIONS = [
  ['Game health (nothing broken)', [
    ['games', 'Games played', '', '', ''], ['finished', 'Games that reached the final buzzer', '', 'up', 'all'], ['possPerGame', 'Possessions per game', '', '', ''],
    ['stuck', 'Stuck possessions (watchdog)', '', 'down', '0'], ['errors', 'Script errors', '', 'down', '0'], ['warnings', 'Match warnings', '', 'down', '0'],
    ['scoreMismatch', 'Games where the court score differs from the engine', '', 'down', '0'], ['ptsPerGame', 'Points per game (both teams)', '', '', 'NBA ~228'], ['msPerGame', 'Wall time per game (ms)', 'ms', '', ''],
  ]],
  ['1. On-ball defense (half court, ball in the handler\'s hands)', [
    ['obBetween', 'Defender between the ball handler and the basket', '%', 'up', 'NBA tracking 94-98%'],
    ['obLow', 'In a low defensive stance', '%', 'up', ''],
    ['obRetreat', 'Backing away from a handler who is not attacking', '%', 'down', '~0'],
    ['obRetreatEps', '  episodes per game (0.3 s or longer)', '', 'down', ''],
    ['obBackpedal', '  of which walking backward facing him', '%', 'down', ''],
    ['obTurnAway', 'Back turned to the ball handler and walking away (handler not attacking)', '%', 'down', '0 unless beaten'],
    ['obTurnAwayEps', '  episodes per game', '', 'down', ''],
    ['obBackTurned', 'Back turned to the ball handler (any speed)', '%', 'down', ''],
    ['obRunClose', 'Running (feet crossing) within 10 ft while not beaten', '%', 'down', ''],
    ['obFar', 'More than 10 ft off the handler inside 28 ft', '%', 'down', ''],
    ['obBeaten', 'Beaten (handler past him toward the rim)', '%', '', ''],
    ['cushionNon', 'Gap at 22-30 ft: handler 3PT under 50', 'ft', '', 'should be the biggest'],
    ['cushionMid', 'Gap at 22-30 ft: handler 3PT 50-69', 'ft', '', ''],
    ['cushionGood', 'Gap at 22-30 ft: handler 3PT 70-79', 'ft', '', ''],
    ['cushionElite', 'Gap at 22-30 ft: handler 3PT 80+', 'ft', '', 'should be the smallest'],
    ['cushionGap', 'Extra cushion given to non-shooters vs elite shooters', 'ft', 'up', '2-4 ft'],
  ]],
  ['2. Off-ball defense (man schemes)', [
    ['denyOne', 'One pass away: in the passing lane (deny)', '%', 'up', ''],
    ['helpTwo', 'Two passes away: in help position (lane or ball-rim line)', '%', 'up', ''],
    ['sagTwo', 'Two passes away: sagged toward the rim from his man', '%', 'up', ''],
    ['seesTwo', 'Two passes away: can see man and ball', '%', 'up', ''],
    ['tightTwo', 'Two passes away: glued to a man outside the lane (no help)', '%', 'down', ''],
    ['crowdSec', 'Extra defender crowding a guarded ball 12+ ft from the rim, no drive (seconds per game)', 's', 'down', '~0'],
    ['crowdPct', '  share of half-court time', '%', 'down', ''],
    ['crowdEps', '  episodes per game', '', 'down', ''],
    ['pathSec', 'Extra defender standing in the handler\'s path 12+ ft from the rim (seconds per game)', 's', 'down', ''],
    ['rimHelpSec', 'Help at the rim (an extra defender on the ball inside 12 ft; the right play), seconds per game', 's', '', ''],
    ['abandoned', 'More than 12 ft from his man and not in a help spot', '%', 'down', ''],
    ['abandonedEps', '  episodes per game', '', 'down', ''],
    ['zoneShare', 'Half-court time against zones (not in these numbers)', '%', '', ''],
  ]],
  ['3. Offense: moving with a purpose', [
    ['still', 'Off-ball players standing still (under 1 ft/s)', '%', 'down', ''],
    ['offSpeed', 'Off-ball players: average speed', 'ft/s', 'up', ''],
    ['offJog', 'Off-ball players moving at a jog or faster (6+ ft/s)', '%', 'up', ''],
    ['loiter', 'Off-ball players who moved less than 3 ft in the last 3 s', '%', 'down', ''],
    ['still3Eps', 'Stand-stills of 3 s or longer per game', '', 'down', ''],
    ['still5Eps', 'Stand-stills of 5 s or longer per game', '', 'down', ''],
    ['clumped', 'Off-ball players within 6 ft of a teammate', '%', 'down', ''],
    ['jobNone', 'No job: holding or drifting around a spot that is not spacing (mid-range, paint, too deep)', '%', 'down', ''],
    ['noJob_mid', '  of that time, in the mid-range', '%', '', ''],
    ['jobSpacing', 'Spacing: holding a spot beyond the arc (a non-stretch big: by the rim)', '%', '', ''],
    ['jobFlow', 'Running a half-court action (screen away, cut, relocate, exchange, big flash)', '%', 'up', ''],
    ['jobEngine', 'Moving for the engine\'s next event (screen, cut, catch)', '%', '', ''],
    ['jobClip', 'In an animation (catch, screen, pass, ...)', '%', '', ''],
  ]],
  ['4. Shot selection (engine)', [
    ['fgaPerGame', 'Field goal attempts per game (both teams)', '', '', 'NBA ~178'],
    ['tpaPerGame', 'Three-point attempts per game', '', '', 'NBA ~75'],
    ['tpaLow50', 'Threes by players rated under 50 (per game)', '', 'down', '~0'],
    ['tpaLow40', 'Threes by players rated under 40 (per game)', '', 'down', '0'],
    ['tpaCenters', 'Threes by centers (per game)', '', '', ''],
    ['tpaBigsNonStretch', 'Threes by non-stretch bigs (per game)', '', 'down', '~0'],
    ['tpaShareLow50', 'Share of all threes taken by players under 50', '%', 'down', ''],
    ['openShotMedian', '"Open" shots: median nearest defender at release', 'ft', 'up', '6+ ft'],
    ['openShotDefClose', '"Open" shots with a defender within 3 ft at release', '%', 'down', '~0'],
    ['open3DefClose', '  threes with a defender within 4 ft', '%', 'down', '~0'],
    ['openMidDefClose', '  mid-range shots with a defender within 4 ft', '%', 'down', '~0'],
    ['openRimDefClose', '  shots at the rim / in the paint with a defender within 3 ft', '%', 'down', ''],
    ['contShotMedian', '"Contested" shots: median nearest defender', 'ft', '', '2-4 ft'],
    ['tightShotMedian', '"Tight" shots: median nearest defender', 'ft', '', '0-2 ft'],
    ['tightShotWide', '"Tight" shots with nobody within 6 ft', '%', 'down', '0'],
    ['shotClockMedian', 'Shot clock left at the shot (median)', 's', '', ''],
    ['shotClockLate', 'Shots with under 4 s on the shot clock (shot clock on)', '%', 'down', 'NBA ~7-9%'],
    ['shotClockEarly', 'Shots with 18+ s on the shot clock (shot clock on)', '%', '', 'NBA ~18-23%'],
  ]],
  ['5. Open catches in the live game', [
    ['catchesPerGame', 'Half-court catches per game', '', '', ''],
    ['wideOpenCatches', 'Wide-open catches (10+ ft) by a decent shooter for that spot (70+) within 26 ft, per game', '', '', ''],
    ['wideOpenShot', '  shot it', '%', 'up', 'most'],
    ['wideOpenPass', '  passed it on', '%', 'down', 'few'],
    ['wideOpenPassedPerGame', '  wide-open shots passed up per game', '', 'down', ''],
    ['wideOpenPassSwing', '  of those passes, flow swing passes (not the engine\'s)', '%', '', ''],
    ['wideOpenDrive', '  drove instead', '%', '', ''],
    ['openCatches', 'Open catches (6-10 ft) by a decent shooter, per game', '', '', ''],
    ['openShot', '  shot it', '%', 'up', ''],
    ['openPass', '  passed it on', '%', '', ''],
    ['catchHeldMedian', 'Time a catcher holds the ball before passing (median)', 's', '', ''],
    ['openOffPerGame', 'Wide-open shooters off the ball (1 s or longer, 70+ from there, within 26 ft), per game', '', '', ''],
    ['openOffFound', '  the ball found him', '%', 'up', ''],
    ['openOffSecPerGame', '  seconds per game someone like that stands wide open', 's', '', ''],
  ]],
  ['6. Spacing and positions', [
    ['bigsInside', 'PF and C (not stretch) in the paint, at the rim or short corner', '%', 'up', ''],
    ['fiveOut', 'Five out: all five beyond the arc', '%', '', ''],
    ['fourPlusOut', 'Four or five beyond the arc', '%', '', ''],
    ['twoOrLessOut', 'Two or fewer beyond the arc', '%', '', ''],
    ['avgOut', 'Players beyond the arc on average', '', '', ''],
    ['noInside', 'Nobody on offense within 12 ft of the rim', '%', '', ''],
  ]],
  ['7. Rebounding and the ball', [
    ['rebPerGame', 'Rebounds grabbed on court per game', '', '', ''],
    ['rebGrabZ', 'Height of the grab (median)', 'ft', '', 'many rebounds 5-9 ft'],
    ['rebAbove10', 'Rebounds grabbed above 10 ft', '%', 'down', ''],
    ['rebBend1', 'Carom bent in the air toward the rebounder\'s hands by more than 1 ft', '%', 'down', '0'],
    ['rebBend3', '  by more than 3 ft (looks like a teleport)', '%', 'down', '0'],
    ['rebBendMax', '  biggest bend', 'ft', 'down', ''],
    ['rebJump3', 'Ball jumps more than 3 ft into the rebounder\'s hands', '%', 'down', '0'],
    ['rebHang', 'Ball hangs still in the air before the grab (0.2 s+)', '%', 'down', '0'],
    ['rebFloor', 'Rebounds that hit the floor before anyone gets them', '%', 'up', 'long rebounds do'],
    ['passBend2', 'Passes bent more than 2 ft in the air toward the receiver', '%', 'down', ''],
    ['boxingPerMiss', 'Defenders boxing out on a miss', '', 'up', ''],
    ['perimBoxPerMiss', '  boxing out a man 20+ ft from the rim', '', 'down', '~0'],
    ['defNearRimPerMiss', 'Defenders within 10 ft of the rim on a miss', '', '', ''],
    ['offNearRimPerMiss', 'Offensive players within 10 ft of the rim on a miss', '', '', ''],
  ]],
  ['8. Called plays (the playbook)', [
    ['pbHalfPoss', 'Half-court possessions per game (both teams)', '', '', ''],
    ['pbCallShare', 'Half-court possessions with a called play (the rest played in flow)', '%', '', 'NBA: most flow, sets at dead balls and ATOs'],
    ['pbCallsPerGame', 'Plays called per game (resets and inbound plays included)', '', '', ''],
    ['pbDone', 'Plays that reached a read (a shot, or the ball in on an inbound)', '%', 'up', ''],
    ['pbEarly', '  taken early (an opening before the last step: the play working)', '%', '', ''],
    ['pbSteps', 'Steps run, of all the plays\' steps', '%', '', ''],
    ['pbEndReset', 'Plays whose look was passed up (reset into a new call)', '%', '', ''],
    ['pbEndTo', 'Plays stopped by a turnover', '%', 'down', ''],
    ['pbEndFoul', 'Plays stopped by a foul (side-out or free throws)', '%', '', ''],
    ['pbPppHalf', 'Points per half-court possession', '', '', 'NBA ~0.97-1.0'],
    ['pbPppCalled', '  with a called play', '', '', ''],
    ['pbPppFlow', '  in flow', '', '', ''],
    ['pbSpot2', 'Players within 2 ft of their play spot 1.2 s into a step', '%', 'up', ''],
    ['pbSpot5', '  within 5 ft', '%', 'up', ''],
    ['pbSpotFar', '  more than 10 ft away', '%', 'down', ''],
    ['pbInbPerGame', 'Inbound plays per game (under the basket, sideline)', '', '', ''],
    ['pbInbSafety', '  ball in to the safety, then the half-court call', '%', '', ''],
    ['pbCovMatch', 'Ball screens where the screener\'s man plays the called coverage (drop, level, hedge, blitz, switch, ice)', '%', 'up', ''],
  ]],
];

function fmtVal(v, unit) {
  if (v == null || !isFinite(v)) return 'n/a';
  if (unit === 'ms' || (!unit && Number.isInteger(v))) return String(Math.round(v));
  return f1(v) + (unit === '%' ? '%' : unit ? ' ' + unit : '');
}
function change(now, was, better) {
  if (now == null || was == null || !isFinite(now) || !isFinite(was)) return '';
  const d = now - was;
  if (Math.abs(d) < 1e-9) return 'same';
  const good = better === 'down' ? d < 0 : better === 'up' ? d > 0 : null;
  return (d > 0 ? '+' : '') + f1(d) + (good == null ? '' : good ? ' (better)' : ' (worse)');
}

function tables(m, base) {
  const out = [];
  for (const [title, rows] of SECTIONS) {
    out.push({ title, rows: rows.map(([k, label, unit, better, ref]) => ({ k, label, unit, better, ref, now: m[k], was: base ? base[k] : undefined })) });
  }
  // spacing by position (a table of its own)
  const pos = { title: '6b. Where each position spends its half-court time (offense)', head: ['Position'].concat(ZONES.map((z) => ZONE_LABEL[z])), rows: [] };
  for (const p of POS_ORDER) if (m['sp_' + p + '_rim'] != null) pos.rows.push([p].concat(ZONES.map((z) => f1(m['sp_' + p + '_' + z]) + '%' + (base && base['sp_' + p + '_' + z] != null ? ' (was ' + f1(base['sp_' + p + '_' + z]) + '%)' : ''))));
  const was = (k) => (base && base[k] != null ? ' (was ' + f1(base[k]) + '%)' : '');
  const idle = { title: '3b. Standing around by position (share of off-ball time)', head: ['Position', 'still (<1 ft/s)', 'moved <3 ft in 3 s', 'no job'], rows: [] };
  for (const p of POS_ORDER) if (m['still_' + p] != null) idle.rows.push([p, f1(m['still_' + p]) + '%' + was('still_' + p), f1(m['loiter_' + p]) + '%' + was('loiter_' + p), m['noJob_pos_' + p] != null ? f1(m['noJob_pos_' + p]) + '%' + was('noJob_pos_' + p) : 'n/a']);
  const extra = [idle, pos];
  if (m._pbFam) {
    const FAM = { pnr: 'Pick and roll', horns: 'Horns', offscreen: 'Off-screen', handoff: 'Hand-off', post: 'Post', iso: 'Isolation', cut: 'Cutting', spot: 'Motion', zone: 'Zone offense', blob: 'Baseline inbound', slob: 'Sideline inbound' };
    const tot = sum(Object.values(m._pbFam), (f) => f.n);
    const fam = { title: '8b. Called plays by family', head: ['Family', 'calls per game', 'share', 'points per call', 'reached a read', 'early read'], rows: [] };
    for (const k of Object.keys(m._pbFam).sort((a, b) => m._pbFam[b].n - m._pbFam[a].n)) { const f = m._pbFam[k]; fam.rows.push([FAM[k] || k, f1(f.n / m._pbGames), f1(pct(f.n, tot)) + '%', (f.pts / f.n).toFixed(2), f1(pct(f.done, f.n)) + '%', f1(pct(f.early, f.n)) + '%']); }
    const pl = { title: '8c. The most-called plays', head: ['Play', 'calls per game', 'points per call', 'reached a read', 'early read'], rows: [] };
    for (const k of Object.keys(m._pbPlay).sort((a, b) => m._pbPlay[b].n - m._pbPlay[a].n).slice(0, 16)) { const f = m._pbPlay[k]; pl.rows.push([f.name || k, f1(f.n / m._pbGames), (f.pts / f.n).toFixed(2), f1(pct(f.done, f.n)) + '%', f1(pct(f.early, f.n)) + '%']); }
    const ct = sum(Object.values(m._pbCov));
    const cv = { title: '8d. The defense\'s pick-and-roll coverage on called plays, and what the court shows 0.6 s after the ball screen', head: ['Coverage', 'share of calls', 'screener\'s man: back in the lane', 'at the screen', 'on the ball', 'switched'], rows: [] };
    for (const k of Object.keys(m._pbCov).sort((a, b) => m._pbCov[b] - m._pbCov[a])) {
      const o = (m._pbCovSeen || {})[k] || {}, on = sum(Object.values(o));
      const sh = (x) => (on ? f1(pct(o[x] || 0, on)) + '%' : 'n/a');
      cv.rows.push([k, f1(pct(m._pbCov[k], ct)) + '%', sh('back in the lane'), sh('at the screen'), sh('on the ball'), sh('switched')]);
    }
    const rd = { title: '8e. The reads taken most often', head: ['Read', 'per game'], rows: [] };
    for (const k of Object.keys(m._pbReads).sort((a, b) => m._pbReads[b] - m._pbReads[a]).slice(0, 14)) rd.rows.push([k, f1(m._pbReads[k] / m._pbGames)]);
    extra.push(fam, pl, cv, rd);
  }
  return { sections: out, extra };
}

/** players with a low 3PT rating who shot threes anyway, across all games */
function offenders(games) {
  const by = {};
  for (const g of games) {
    if (g.failed) continue;
    for (const s of g.shots) {
      if (s.pts !== 3 || s.three >= 50 || s.kind === 'heave') continue;
      const p = g.players[s.id] || {};
      const k = g.seed + ':' + s.id, o = by[k] || (by[k] = { seed: g.seed, name: p.name || s.id, pos: s.pos, arch: p.arch || '', three: s.three, tpa: 0, tpm: 0, open: 0 });
      o.tpa++; if (s.made) o.tpm++; if (s.contest === 'open') o.open++;
    }
  }
  return Object.values(by).sort((a, b) => b.tpa - a.tpa || a.three - b.three).slice(0, 12);
}

function build(games, o) {
  o = o || {};
  const m = metrics(games), base = o.baseline || null;
  const T = tables(m, base);
  const L = [];
  L.push('# Gameplay audit: ' + (o.label || 'now'));
  L.push('');
  L.push(`${m.games} full games of the Live view played headless (every possession from the tip to the final buzzer), players sampled every 0.1 s. ` + (base ? `Compared with: ${o.baseLabel || 'baseline'}.` : 'This run is the baseline the later phases are compared with.'));
  L.push('Made by `node tools/audit/run.js` (see tools/audit/README.md).');
  L.push('');
  for (const s of T.sections) {
    L.push('## ' + s.title, '');
    L.push(base ? '| Metric | Before | Now | Change | Reference |' : '| Metric | Value | Reference |');
    L.push(base ? '|---|---:|---:|---|---|' : '|---|---:|---|');
    for (const r of s.rows) L.push(base ? `| ${r.label} | ${fmtVal(r.was, r.unit)} | ${fmtVal(r.now, r.unit)} | ${change(r.now, r.was, r.better)} | ${r.ref} |` : `| ${r.label} | ${fmtVal(r.now, r.unit)} | ${r.ref} |`);
    L.push('');
  }
  for (const t of T.extra) {
    L.push('## ' + t.title, '');
    L.push('| ' + t.head.join(' | ') + ' |'); L.push('|' + t.head.map(() => '---').join('|') + '|');
    for (const r of t.rows) L.push('| ' + r.join(' | ') + ' |');
    L.push('');
  }
  const off = offenders(games);
  if (off.length) {
    L.push('## Low-rated three-point shooters who shot threes anyway', '');
    L.push('| Game seed | Player | Pos | Archetype | 3PT rating | 3PA | 3PM | Called open |'); L.push('|---|---|---|---|---:|---:|---:|---:|');
    for (const p of off) L.push(`| ${p.seed} | ${p.name} | ${p.pos} | ${p.arch} | ${p.three} | ${p.tpa} | ${p.tpm} | ${p.open} |`);
    L.push('');
  }
  const cz = causes(games);
  if (cz.length) {
    L.push('## What was moving the flagged defenders', '', `Share of the flagged samples (in ${cz.games} of the games) by the code path moving the defender, the engine beat under way and the handler's distance from the rim.`, '');
    for (const c of cz) { L.push(`**${c.title}**`, ''); for (const [k, rows] of c.parts) L.push(`- ${k}: ` + rows.map(([n, v]) => `${n} ${f1(v)}%`).join(', ')); L.push(''); }
  }
  const ex = pickExamples(games);
  if (ex.length) {
    L.push('## Examples to look at', '');
    for (const e of ex) L.push(`- **${EX_TITLE[e.kind] || e.kind}** (game seed ${e.seed}, possession ${e.poss}, ${e.when}): ${e.text}`);
    L.push('');
  }
  return L.join('\n');
}

const CAUSE_TITLE = { retreat: 'Ball defender backing away', turnAway: 'Ball defender turning away', crowd: 'Off-ball defender crowding the ball', abandoned: 'Off-ball defender lost his man', tightTwo: 'Two passes away but glued to his man' };
const CAUSE_PART = { mover: 'moved by', job: 'his defensive job (Phase 2 court roles)', beat: 'engine beat', shotCall: 'during a shot beat, the engine called the shot', handlerDist: 'handler from the rim', clip: 'defender clip', handlerClip: 'handler clip', scheme: 'scheme' };
function causes(games) {
  const out = [];
  for (const tag of Object.keys(CAUSE_TITLE)) {
    const acc = {};
    for (const g of games) { const c = g.causes && g.causes[tag]; if (!c) continue; for (const part in c) { const a = acc[part] || (acc[part] = {}); for (const k in c[part]) a[k] = (a[k] || 0) + c[part][k]; } }
    if (!Object.keys(acc).length) continue;
    const parts = [];
    for (const part of Object.keys(CAUSE_PART)) {
      const a = acc[part]; if (!a) continue;
      const t = sum(Object.values(a));
      parts.push([CAUSE_PART[part], Object.entries(a).sort((x, y) => y[1] - x[1]).slice(0, 6).map(([k, v]) => [k, pct(v, t)])]);
    }
    out.push({ title: CAUSE_TITLE[tag], parts });
  }
  out.games = games.filter((g) => g.causes && Object.keys(g.causes).length).length;
  return out;
}

const EX_TITLE = {
  retreat: 'Ball defender backing away', turn_away: 'Ball defender turns and walks away', far: 'Ball defender too far off', crowd: 'Off-ball defender crowding the ball',
  abandoned: 'Off-ball defender lost his man', still: 'Offensive player standing still', bad_three: 'Low-rated shooter takes a three', open_pass: 'Wide-open shooter passes it up',
  rebound_teleport: 'Rebound pulled into the hands', moment: 'Typical half-court moment', open_ignored: 'Wide-open shooter never gets the ball',
};
const EX_ORDER = ['retreat', 'turn_away', 'crowd', 'abandoned', 'still', 'open_pass', 'open_ignored', 'bad_three', 'rebound_teleport', 'far', 'moment'];
function pickExamples(games, per) {
  per = per || 3;
  const out = [];
  for (const k of EX_ORDER) {
    const l = games.filter((g) => !g.failed).flatMap((g) => g.examples.filter((e) => e.kind === k));
    // spread over different games
    const seen = {};
    for (const e of l) { if (out.filter((x) => x.kind === k).length >= per) break; if (seen[e.seed]) continue; seen[e.seed] = 1; out.push(e); }
  }
  return out;
}

// ------------------------------------------------------------ HTML (court diagrams)
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
/** half court with the basket at the top: x = v (feet from the sideline), y = u (feet from the baseline) */
function courtSVG(snap, S) {
  S = S || 7;
  const W = 50 * S, H = 47 * S, P = (u, v) => [v * S, u * S];
  const el = [];
  el.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="#f3e6cf" stroke="#8a6d45" stroke-width="2"/>`);
  const [lx, ly] = P(0, 17);
  el.push(`<rect x="${lx}" y="${ly}" width="${16 * S}" height="${19 * S}" fill="#e8d2ad" stroke="#8a6d45" stroke-width="1.5"/>`);
  const [fx, fy] = P(19, 25); el.push(`<circle cx="${fx}" cy="${fy}" r="${6 * S}" fill="none" stroke="#8a6d45" stroke-width="1.2"/>`);
  const [rx, ry] = P(5.25, 25); el.push(`<circle cx="${rx}" cy="${ry}" r="${0.75 * S}" fill="none" stroke="#d2551e" stroke-width="2"/>`);
  el.push(`<line x1="${P(4, 22)[0]}" y1="${P(4, 22)[1]}" x2="${P(4, 28)[0]}" y2="${P(4, 28)[1]}" stroke="#333" stroke-width="2"/>`);
  // three-point line: corners, then the arc
  const a0 = Math.asin((22) / 23.75), cu = 5.25 + 23.75 * Math.cos(a0);
  const [c1x, c1y] = P(0, 3), [c2x, c2y] = P(cu, 3), [c3x, c3y] = P(cu, 47), [c4x, c4y] = P(0, 47);
  el.push(`<path d="M${c1x},${c1y} L${c2x},${c2y} A${23.75 * S},${23.75 * S} 0 0 0 ${c3x},${c3y} L${c4x},${c4y}" fill="none" stroke="#8a6d45" stroke-width="1.5"/>`);
  const byId = {};
  for (const p of snap.players) byId[p[0]] = p;
  const flagIds = new Set(Object.values(snap.flags || {}).map(String));
  // matchup lines for the flagged defenders
  for (const p of snap.players) {
    if (p[1] !== 'd' || !flagIds.has(p[0])) continue;
    const m = byId[String(snap.matchup[p[0]])]; if (!m) continue;
    const [x1, y1] = P(p[2], p[3]), [x2, y2] = P(m[2], m[3]);
    el.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#c0392b" stroke-width="1.2" stroke-dasharray="4 3"/>`);
  }
  for (const p of snap.players) {
    const [x, y] = P(p[2], p[3]);
    const off = p[1] === 'o', flag = flagIds.has(p[0]);
    // velocity (ft/s scaled to 0.35 s of travel)
    const vu = -p[4], vv = p[5];
    if (Math.hypot(vu, vv) > 1) { const [x2, y2] = P(p[2] + vu * 0.35, p[3] + vv * 0.35); el.push(`<line x1="${x}" y1="${y}" x2="${x2}" y2="${y2}" stroke="${off ? '#1f5fa8' : '#b03a2e'}" stroke-width="2" marker-end="url(#ah)"/>`); }
    // facing tick
    const fa = (p[6] * Math.PI) / 180, du = snap.dir > 0 ? -Math.cos(fa) : Math.cos(fa), dv = Math.sin(fa);
    const [tx, ty] = P(p[2] + du * 2.2, p[3] + dv * 2.2);
    if (flag) el.push(`<circle cx="${x}" cy="${y}" r="${1.9 * S}" fill="none" stroke="#f1c40f" stroke-width="3"/>`);
    el.push(`<circle cx="${x}" cy="${y}" r="${1.2 * S}" fill="${off ? '#2e86de' : '#e74c3c'}" stroke="#fff" stroke-width="1.5"/>`);
    el.push(`<line x1="${x}" y1="${y}" x2="${tx}" y2="${ty}" stroke="#111" stroke-width="2"/>`);
    el.push(`<text x="${x}" y="${y + 3.5}" font-size="${S * 1.25}" text-anchor="middle" fill="#fff" font-family="sans-serif" font-weight="700">${esc(p[7] || '')}</text>`);
  }
  const [bx, by] = P(snap.ball[0], snap.ball[1]);
  el.push(`<circle cx="${bx}" cy="${by}" r="${0.6 * S}" fill="#e67e22" stroke="#6e3b0a" stroke-width="1"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><defs><marker id="ah" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="#333"/></marker></defs>${el.join('')}</svg>`;
}

function html(games, o) {
  o = o || {};
  const md = build(games, o);
  const m = metrics(games), base = o.baseline || null;
  const T = tables(m, base);
  const H = [];
  H.push(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Gameplay Audit</title><style>
  body{font:15px/1.45 -apple-system,Segoe UI,Roboto,sans-serif;margin:0;padding:16px;background:#fbfaf7;color:#222;max-width:1100px}
  h1{font-size:24px;margin:8px 0}h2{font-size:18px;margin:28px 0 8px;border-bottom:2px solid #ddd;padding-bottom:4px}
  table{border-collapse:collapse;width:100%;margin:6px 0 10px;font-size:14px}td,th{border-bottom:1px solid #e3e0da;padding:5px 8px;text-align:left;vertical-align:top}
  td.n{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}.better{color:#1e8449}.worse{color:#b03a2e}.ref{color:#777}
  .ex{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px}.card{background:#fff;border:1px solid #e3e0da;border-radius:8px;padding:10px}
  .card svg{width:100%;height:auto}.card p{margin:6px 0 0;font-size:13px}.k{font-weight:700}.legend{font-size:13px;color:#555}
  .wrap{overflow-x:auto}td.sub{padding-left:26px;color:#444}</style></head><body>`);
  H.push(`<h1>Gameplay audit: ${esc(o.label || 'now')}</h1>`);
  H.push(`<p>${m.games} full games of the Live view played headless, every possession from the tip to the final buzzer, players sampled every 0.1 s. ${base ? 'Compared with: ' + esc(o.baseLabel || 'baseline') + '.' : 'This run is the baseline the later phases are compared with.'}</p>`);
  for (const s of T.sections) {
    H.push(`<h2>${esc(s.title)}</h2><div class="wrap"><table><tr><th>Metric</th>${base ? '<th>Before</th><th>Now</th><th>Change</th>' : '<th>Value</th>'}<th>Reference</th></tr>`);
    for (const r of s.rows) {
      const ch = base ? change(r.now, r.was, r.better) : '';
      const cls = /better/.test(ch) ? 'better' : /worse/.test(ch) ? 'worse' : '';
      H.push(`<tr><td${/^\s/.test(r.label) ? ' class="sub"' : ''}>${esc(r.label.trim())}</td>${base ? `<td class="n">${fmtVal(r.was, r.unit)}</td>` : ''}<td class="n">${fmtVal(r.now, r.unit)}</td>${base ? `<td class="n ${cls}">${esc(ch)}</td>` : ''}<td class="ref">${esc(r.ref)}</td></tr>`);
    }
    H.push('</table></div>');
  }
  for (const t of T.extra) {
    H.push(`<h2>${esc(t.title)}</h2><div class="wrap"><table><tr>${t.head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr>`);
    for (const r of t.rows) H.push(`<tr>${r.map((c, i) => `<td${i ? ' class="n"' : ''}>${esc(c)}</td>`).join('')}</tr>`);
    H.push('</table></div>');
  }
  const off = offenders(games);
  if (off.length) {
    H.push('<h2>Low-rated three-point shooters who shot threes anyway</h2><div class="wrap"><table><tr><th>Game seed</th><th>Player</th><th>Pos</th><th>Archetype</th><th>3PT</th><th>3PA</th><th>3PM</th><th>Called open</th></tr>');
    for (const p of off) H.push(`<tr><td>${p.seed}</td><td>${esc(p.name)}</td><td>${p.pos}</td><td>${esc(p.arch)}</td><td class="n">${p.three}</td><td class="n">${p.tpa}</td><td class="n">${p.tpm}</td><td class="n">${p.open}</td></tr>`);
    H.push('</table></div>');
  }
  const cz = causes(games);
  if (cz.length) {
    H.push(`<h2>What was moving the flagged defenders</h2><p class="legend">Share of the flagged samples (in ${cz.games} of the games) by the code path moving the defender, the engine beat under way and the handler's distance from the rim.</p>`);
    for (const c of cz) { H.push(`<p class="k">${esc(c.title)}</p><ul>`); for (const [k, rows] of c.parts) H.push(`<li>${esc(k)}: ${rows.map(([n, v]) => esc(n) + ' ' + f1(v) + '%').join(', ')}</li>`); H.push('</ul>'); }
  }
  const ex = pickExamples(games);
  if (ex.length) {
    H.push('<h2>Examples to look at</h2><p class="legend">Basket at the top. Blue = offense, red = defense, orange = ball. The black tick is where each player faces, the arrow is where he is moving (0.35 s ahead). Yellow ring = the player the example is about; the dashed red line joins a flagged defender to his man.</p><div class="ex">');
    for (const e of ex) H.push(`<div class="card">${courtSVG(e.snap)}<p><span class="k">${esc(EX_TITLE[e.kind] || e.kind)}</span> (seed ${e.seed}, possession ${e.poss}, ${esc(e.when)})</p><p>${esc(e.text)}</p></div>`);
    H.push('</div>');
  }
  H.push('</body></html>');
  return { md, html: H.join('\n') };
}

module.exports = { metrics, build, html, courtSVG, SECTIONS };
