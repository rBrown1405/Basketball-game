/* Pro BBALL Coach — possession-based game simulation engine.
 * Produces stats-accurate results plus a rich event stream (see docs/MATCH_API.md) for the live view. */
(function () {
  'use strict';
  const PBC = (window.PBC = window.PBC || {});
  const U = PBC.U, C = PBC.Config;
  const Sim = {};

  const is3 = z => z === 'c3' || z === 'ab3';
  // tunable constants (calibrated with test/calibrate.js)
  Sim.K = {
    usageExp: 0.9, to: 0.175, toW: 0.196, stlBad: 0.72, stlLost: 0.85, outletTO: 0.035, shotTime: 14.72, shotTimeW: 15.12,
    // (each +0.02 with the confidence system: the old hot-hand counter only ever added, ~0.02 on average, where confidence comes
    // to nothing on average; the shot time +0.8 % against the quicker putbacks, so the pace and the scoring stay where they were)
    zoneAdj: { rim: -0.36, paint: 0.04, mid: -0.1, c3: -0.2925, ab3: -0.1425 }, sfoul: 1.4, ftA: 0.25, nsfoul: 1.1, threeFreq: 1.08,
    coast: 1, // how much a team with a big lead lets up (shooting focus, glass, pressure); 0 = never
    // confidence (a player's, this game, -1 ice cold to +1 on fire): what it does to his shooting (logit at the extremes) and
    // how much he looks for his shot, how far a shot moves it (times how far the result beat what was expected of it), a
    // free throw, a turnover, a steal or a block, and how quickly it settles back to where he came in (s of his minutes)
    confMake: 0.14, confFtMake: 0.1, confUse: 0.22, confShot: 0.42, confFt: 0.14, confTo: 0.07, confStl: 0.05, confBlk: 0.05,
    confTau: 360, confCarry: 0.35,
    // the ball does not sit (the user: "the players need to make all decisions faster"; the "0.5" game: catch, read, and in
    // about half a second shoot, drive or move it on): the time between the ball coming up the floor and the play, and the
    // time a play would otherwise be stretched over, is played as quick touches of flowTouchS each (s, from the release of
    // the pass before; the Shoot When Open slider quickens them), a quick drive and kick in flowDriveP of them (x how much
    // of a driver he is, x (1 + flowDriveBuild for every touch since the last drive)), the first read flowLeadS after the ball
    // is up; only when there is flowMinS of room. A called
    // play's steps at most playStretch x their drawn length (was 1.25), called playCallS before its first step (was 1.8), a
    // generated play at most spanMax s from its call to its shot. Live games only: the events are the court's, the results
    // and the season's numbers are not touched
    flowTouchS: [1.0, 2.1], flowMinS: 1.5, flowLeadS: [0.15, 0.5], flowDriveP: 0.2, flowDriveBuild: 1.0, playStretch: 0.9, playCallS: 1.4,
    spanMax: { pnr: 4.5, iso: 4.5, post: 4.5, spot: 4, offscreen: 5, handoff: 4.5, cut: 4 },
    // the look before the call (the user: "the players don't have to run the play all the time if they have an open look; a
    // clear drive to the hoop, they can just go get the bucket"; coaches: forget the play and rip it to the rim when your man
    // is out of position): a flow possession (no play from the playbook) whose look the ball movement finds is taken as it
    // comes, with no call: lookP of them by how open the look was (open: his man beaten or nobody there; the shot, its kind,
    // its contest and its result are the engine's as before). His own look: the last pass released lookDriveS before a drive's
    // finish, lookPullS before a pull-up; a teammate's: the man who finds him has it lookKickS before the shot off a drive and
    // kick, lookSwingS before a catch and shoot off the swing (the kick or the swing itself lookCatchS before the shot, over
    // the Shoot When Open slider). A pick and roll's only when it is the handler's own shot (he goes before the screen gets
    // there); a post-up, an off-screen, a hand-off or a cut keeps its call. Live games only, like the quick touches
    lookP: { open: 0.85, contested: 0.3, tight: 0 }, lookFam: { iso: 1, spot: 1, pnr: 1 },
    lookDriveS: [1.8, 2.4], lookPullS: [1.2, 1.7], lookKickS: [2.1, 2.8], lookSwingS: [1.3, 1.8], lookCatchS: [0.55, 0.8],
    // (a called play's call comes callPassS before the last quick pass, to the man the play starts with: the five go to
    // their spots while the ball is on its way to him)
    callPassS: 0.5,
  };
  Sim.debug = null;
  Sim.debugConf = null; // ([sum, n, sum of squares] of the shooters' confidence as they shoot, when set)

  Sim.attacksRight = (teamIdx, period) => (period <= 2) === (teamIdx === 0);
  const basketX = (idx, period) => (Sim.attacksRight(idx, period) ? 88.75 : 5.25);
  const dirX = (idx, period) => (Sim.attacksRight(idx, period) ? 1 : -1);

  const SET_NAMES = {
    pnr: ['HIGH PICK & ROLL', 'SPAIN PICK & ROLL', 'SIDE PICK & ROLL', 'DRAG SCREEN', 'HORNS TWIST', 'STEP-UP SCREEN', '1-5 PICK & ROLL', 'SHORT ROLL'],
    pop: ['PICK & POP', 'HORNS POP', 'SLIP & POP'],
    iso: ['ISO TOP', 'ISO WING', 'CLEAR-OUT', 'ELBOW ISO', 'MISMATCH HUNT'],
    post: ['POST ENTRY', 'LOW-POST ISO', 'HIGH-LOW', 'ELBOW POST', 'DUCK-IN'],
    spot: ['SWING-SWING', 'DRIVE & KICK', 'BALL REVERSAL', 'EXTRA PASS', '5-OUT MOTION'],
    offscreen: ['FLOPPY', 'PIN-DOWN', 'STAGGER SCREEN', 'FLARE SCREEN', 'ZIPPER CUT', 'HAMMER'],
    handoff: ['DRIBBLE HAND-OFF', 'CHICAGO ACTION', 'GET ACTION', 'ELBOW HAND-OFF'],
    cut: ['BACKDOOR CUT', 'UCLA CUT', 'BASKET CUT', 'SPLIT ACTION', 'FLEX CUT'],
    transition: ['FAST BREAK', 'EARLY OFFENSE', 'PUSH', 'SECONDARY BREAK'],
    putback: ['PUTBACK'],
  };

  const BRANCHES = {
    pnr: { handler: 40, roller: 24, kick: 36 },
    iso: { self: 80, kick: 20 },
    post: { self: 66, kick: 34 },
    spot: { shooter: 76, drive: 24 },
    offscreen: { shooter: 86, kick: 14 },
    handoff: { receiver: 68, big: 10, kick: 22 },
    cut: { cutter: 100 },
    transition: { handler: 32, finisher: 42, trailer3: 26 },
    putback: { self: 100 },
  };

  // contest weights [open, contested, tight]
  const CONTEST = {
    pnr_handler: [20, 52, 28], roller: [36, 44, 20], kick: [50, 40, 10], iso: [11, 50, 39], post: [16, 50, 34],
    spot: [44, 44, 12], drive: [22, 50, 28], offscreen: [40, 46, 14], handoff: [30, 50, 20], cut: [56, 34, 10],
    transition: [46, 40, 14], trailer3: [52, 38, 10], putback: [22, 46, 32], big: [30, 50, 20], lastShot: [6, 40, 54],
  };
  const CONTEST_LOGIT = { rim: [0.3, 0, -0.34], paint: [0.3, 0, -0.34], mid: [0.3, 0, -0.36], c3: [0.34, 0, -0.44], ab3: [0.34, 0, -0.44] };
  const SKILL_K = { rim: 0.2, paint: 0.17, mid: 0.16, c3: 0.16, ab3: 0.16 };
  // Openness: a look is open only when the shooter earned it against the man guarding him. How each kind of look is
  // created: beating him off the dribble (handle, burst, change of direction), getting open without the ball
  // (moving, reading the defense, a passer who finds him), sealing or out-muscling him inside. Ratings are taken
  // as distances from the league average (league means of the generated players) so an average matchup changes
  // nothing and the league's open / contested / tight mix stays where it was.
  const R_AVG = { handle: 59, speed: 68, agility: 64, shotIQ: 65, perD: 59, helpD: 62.5, intD: 54, strength: 61, post: 46, vision: 60, pass: 60 };
  const dv = (c, k) => ((c && c.r && c.r[k]) != null ? c.r[k] : R_AVG[k]) - R_AVG[k];
  const OPEN_K = 0.07;       // contest shift per rating-SD of edge (≈ ±20 % open looks, ∓20 % tight ones per SD)
  // the average edge of each kind over a league season (subtracted, so only a real mismatch moves the needle)
  const OPEN_MEAN = { dribble: 0.54, catch: 0.22, inside: -0.53, drive: 0.13 };
  const DEF_K = { rim: 0.1, paint: 0.1, mid: 0.07, c3: 0.07, ab3: 0.07 };
  const KIND_LOGIT = { dunk: 1.45, alley: 1.05, layup: 0, reverse: -0.12, tip: -0.35, floater: -0.05, hook: 0.02, jumper: 0.03, pullup: -0.05, stepback: -0.1, fadeaway: -0.12, catch_shoot: 0.05, heave: -4 };
  const BLOCK_BASE = { rim: 0.085, paint: 0.07, mid: 0.022, c3: 0.01, ab3: 0.012 };
  const SFOUL_BASE = { rim: 0.175, paint: 0.1, mid: 0.036, c3: 0.012, ab3: 0.014 };

  // ---------------------------------------------------------------------------
  // Setup
  // ---------------------------------------------------------------------------
  // identity slider values (used when js/core/sliders.js is not loaded)
  const SL_DEFAULT = {
    pace: 1, trans: 1, three: 1, dunk: 1, l3: 0, lMid: 0, lIn: 0, ft: 0, sfoul: 1, to: 1, stl: 1, blk: 1, contest: 0, nsfoul: 1, oreb: 0,
    fatigue: 1, inj: 1, injSev: 1, usage: 1, clutch: 1, home: 1, upset: 1, po: 1, uShoot: 0, uDef: 0, uTo: 1, quick: 1,
  };
  const TEND_KEYS = ['three', 'mid', 'rim', 'dunk', 'pullup', 'stepback', 'drawFoul', 'iso', 'pnr', 'post', 'pass', 'push', 'crash', 'gamble', 'block', 'foul'];
  const NO_DEV = {};
  TEND_KEYS.forEach(k => { NO_DEV[k] = 0; });

  /** Tendency profile (js/core/tendency.js) + the multipliers the engine uses, cached per player per game. */
  function tendProfile(p) {
    const r = p.r;
    const tn = PBC.Tendency && PBC.Tendency.sim ? PBC.Tendency.sim(p)
      : { x3: r.three, xMid: r.mid, xRim: Math.max(r.layup, r.dunk, r.close), xDunk: r.dunk, d: NO_DEV };
    const d = tn.d;
    // exp(b·d), minus the small lift the spread of generated tendencies (sd ≈ 0.15) would add on average
    const e = (b, x) => (x === 0 && d === NO_DEV ? 1 : Math.exp(b * x - 0.0112 * b * b));
    tn.f = {
      iso: e(1.2, d.iso), isoTeam: e(0.9, d.iso), pnr: e(1.2, d.pnr), pnrTeam: e(0.7, d.pnr), post: e(1.4, d.post), postTeam: e(1.1, d.post),
      use: e(-0.5, d.pass), passOut: e(0.8, d.pass), keep: e(-0.4, d.pass), assist: e(0.5, d.pass),
      pull: e(0.5, d.pullup), pullJump: e(0.4, d.pullup), pullRim: e(-0.3, d.pullup), step: e(1.2, d.stepback),
      drawFoul: e(0.6, d.drawFoul), crash: e(1.0, d.crash), push: e(0.8, d.push), cut: e(0.8, d.rim),
      gamble: e(1.0, d.gamble), block: e(0.7, d.block), foul: e(1.0, d.foul), sfoulDef: e(0.35, d.foul) * e(0.15, d.block),
    };
    return tn;
  }

  function mkPc(p, confAdd) {
    const c = {
      p, id: p.id, r: p.r, pos: p.pos, posN: C.POS_NUM[p.pos], energy: 100, sec: 0, pf: 0, on: false, starter: false,
      target: 0, out: false, inj: false, injNew: null, st: PBC.Stats.emptyLine(), last: p.last, name: PBC.Player.name(p),
      hgt: p.hgt, tn: tendProfile(p), pbFit: null,
      // confidence (Sim.K.conf*): where he comes into the game, how far a play moves him, where it is now; confAdd: the
      // room's chemistry and his morale (PBC.Desk.confMod, a League Setting)
      conf0: U.clamp(confBase(p) + (confAdd || 0), -0.5, 0.5), confK: confSwing(p), conf: 0, confS: 0, confNote: 0,
    };
    c.conf = c.conf0;
    return c;
  }
  /** a player's confidence coming into a game: his swagger (ego), how he takes the big moments (clutch), and how his last
   *  games went (p.conf, carried over from them, Sim.finalize) */
  function confBase(p) {
    const t = p.pers || {}, r = p.r || {};
    const ego = t.ego != null ? t.ego : 50;
    return U.clamp(0.25 * (ego - 50) / 50 + 0.15 * ((r.clutch != null ? r.clutch : 60) - 60) / 40 + (+p.conf || 0), -0.5, 0.5);
  }
  /** how far one play moves him: a big ego rides the waves, a worker and a veteran stay level */
  function confSwing(p) {
    const t = p.pers || {};
    return U.clamp(1 + 0.35 * ((t.ego != null ? t.ego : 50) - 50) / 50 - 0.25 * ((t.work != null ? t.work : 60) - 60) / 40 - (p.age >= 30 ? 0.12 : 0), 0.6, 1.4);
  }
  /** his confidence settles back toward where he came in over his minutes on the floor (Sim.K.confTau), then moves by d
   *  (times how much a play moves him); a note in the play-by-play the first time he gets hot or goes cold */
  function confMove(ctx, c, d) {
    const dt = c.sec - c.confS; c.confS = c.sec;
    if (dt > 0) c.conf = c.conf0 + (c.conf - c.conf0) * Math.exp(-dt / Sim.K.confTau);
    c.conf = U.clamp(c.conf + d * c.confK, -1, 1);
    const g = ctx.g;
    if (g.lite) return;
    if (c.conf >= 0.55 && c.confNote <= 0) { c.confNote = 1; g.pbp.push({ q: g.period, clock: Math.max(0, g.clock - ctx.t), team: ctx.O.players.includes(c) ? ctx.O.idx : ctx.D.idx, text: `🔥 ${c.last} is heating up!`, type: 'note', score: g.score.slice(), possN: ctx.P.n }); }
    else if (c.conf <= -0.55 && c.confNote >= 0) { c.confNote = -1; g.pbp.push({ q: g.period, clock: Math.max(0, g.clock - ctx.t), team: ctx.O.players.includes(c) ? ctx.O.idx : ctx.D.idx, text: `🧊 ${c.last} has gone cold`, type: 'note', score: g.score.slice(), possN: ctx.P.n }); }
    else if (c.conf < 0.3 && c.conf > -0.3) c.confNote = 0;
  }
  const avgDev = (T, k) => { let s = 0; for (const c of T.on) s += c.tn.d[k]; return T.on.length ? s / T.on.length : 0; };

  /** Playoff rotations: starters and the top 7 play more, the deep bench less (scaled by g.intensity). */
  function tightenRotation(players, L, I) {
    const k = Math.min(1.6, I);
    const ranked = U.sortBy(players.filter(c => c.target > 0), c => c.target, true);
    const f = [0.1, 0.1, 0.1, 0.1, 0.1, 0.04, 0.04, -0.35, -0.35];
    ranked.forEach((c, i) => { c.target *= Math.max(0.05, 1 + (i < f.length ? f[i] : -0.8) * k); });
    const sum = U.sum(players, c => c.target);
    if (sum > 0) for (const c of players) c.target = Math.min(44, c.target * (L.minutesTotal / sum));
  }

  function defaultTargets(L) {
    return L.key === 'women' ? [33, 31, 30, 29, 27, 20, 15, 10, 5, 0, 0, 0] : [34, 33, 32, 31, 30, 24, 20, 16, 12, 8, 0, 0, 0, 0, 0];
  }

  function makeTeamCtx(S, g, tid, idx) {
    const L = g.L;
    const team = S.teams[tid];
    const rot = team.rot || { starters: [], minutes: {} };
    const healthy = PBC.League.roster(S, tid).filter(p => !PBC.Player.isInjured(p));
    const order = U.sortBy(healthy, p => (rot.starters.includes(p.id) ? 1000 : 0) + (rot.minutes[p.id] || 0) * 10 + p.ovr, true);
    const active = order.slice(0, L.activeMax);
    const cm = PBC.Desk && PBC.Desk.confMod ? PBC.Desk.confMod(S, tid) : null;
    const players = active.map(p => { const c = mkPc(p, cm ? cm(p) : 0); c.target = rot.minutes[p.id] || 0; return c; });
    let starters = rot.starters.map(id => players.find(c => c.id === id)).filter(Boolean);
    if (starters.length < 5) {
      const need = C.POSITIONS.filter(pos => !starters.some(s => s.pos === pos));
      for (const pos of need) {
        if (starters.length >= 5) break;
        const cand = U.maxBy(players.filter(c => !starters.includes(c)), c => PBC.Player.ovrAt(c.p, pos) + (c.pos === pos ? 3 : 0));
        if (cand) starters.push(cand);
      }
      for (const c of U.sortBy(players, c => c.p.ovr, true)) { if (starters.length >= 5) break; if (!starters.includes(c)) starters.push(c); }
    }
    starters = starters.slice(0, 5);
    starters.forEach(c => { c.on = true; c.starter = true; c.st.gs = 1; });
    // targets: if missing or not summing properly, fill from defaults
    const total = U.sum(players, c => c.target);
    if (total < L.minutesTotal * 0.8) {
      const tmpl = defaultTargets(L);
      const ordered = starters.concat(U.sortBy(players.filter(c => !c.starter), c => c.target * 100 + c.p.ovr, true));
      ordered.forEach((c, i) => { c.target = Math.max(c.target, tmpl[i] || 0); });
    }
    const sum2 = U.sum(players, c => c.target);
    if (sum2 > 0) for (const c of players) c.target = Math.min(44, c.target * (L.minutesTotal / sum2));
    if (g.intensity > 0.01) tightenRotation(players, L, g.intensity);
    return {
      tid, idx, team, players, on: starters, strat: Object.assign({}, team.strat),
      fouls: 0, fouls2: 0, timeouts: L.timeouts, qs: [0], toRequest: false, autoSubs: true, autoTO: true, userCall: null, userInb: null, defCall: null,
      manualSubs: [], poss: 0, lastTimeoutClock: 9999, pb: null, lineupV: 0,
      // (the medical staff: how often players get hurt and how long they are out, js/core/office.js)
      medInj: PBC.Office && PBC.Office.injuryMult ? PBC.Office.injuryMult(S, tid) : 1,
      medDur: PBC.Office && PBC.Office.recoveryMult ? PBC.Office.recoveryMult(S, tid) : 1,
    };
  }

  /**
   * opts: { gid, playoff, lite, sg }. sg (the schedule / postseason game object) is optional: without it a postseason
   * game is looked up by gid in S.todayPost, the play-in and S.playoffs.games.
   * Adds to the game: g.sl (slider multipliers), g.stakes (0 regular season … 1.25 Game 7 of the Finals), g.intensity
   * (stakes × playoff-intensity slider), g.stakesInfo (null in the regular season, else { round, roundName, gameNum,
   * seriesW: [homeWins, awayWins], elimination, game7, clinch: [home, away], decider, len, playIn }), g.form = [home, away]
   * (hidden shooting form, logit), g.formTo (turnover multipliers), g.magic (null | team index having a "can't miss"
   * night) and g.offNight (null | team index of a favorite having an off night).
   */
  Sim.createGame = function (S, homeTid, awayTid, opts) {
    opts = opts || {};
    const L = PBC.League.cfg(S);
    const g = {
      S, L, gid: opts.gid, playoff: !!opts.playoff, day: S.day, lite: !!opts.lite, noInjuries: !!opts.noInjuries,
      tids: [homeTid, awayTid], t: null,
      period: 1, clock: L.quarterLen, poss: -1, nextStart: 'jump_ball', nextSpot: { x: 47, y: 25 },
      possN: 0, score: [0, 0], final: false, pbp: [], userIdx: S.userTid === homeTid ? 0 : S.userTid === awayTid ? 1 : -1,
      gimCount: 0, gimLog: [], run: { team: -1, pts: 0 }, tipWinner: -1, lastStealer: null, lastRebounder: null,
      pending: null, elapsedReg: 0, lastGimClock: 99999, buzzerGim: false,
      pstats: null, plog: null, // (play tracking: js/core/playstats.js; declared here so the game object keeps one shape)
      zt: null, adj: null, // (shots by zone and the coaches' adjustments: js/core/adjust.js)
      coachEdge: null, rivalry: 0,
    };
    const sl = g.sl = PBC.Sliders && PBC.Sliders.simMods ? PBC.Sliders.simMods(S) : Object.assign({}, SL_DEFAULT);
    const st = Sim.stakesFor(S, opts);
    g.stakes = st.stakes;
    g.stakesInfo = st.info;
    // a rivalry game (js/core/rivals.js): a little of the playoffs' edge in a regular-season night
    const rv = !opts.playoff && PBC.Rivals ? PBC.Rivals.level(S, homeTid, awayTid) : null;
    g.rivalry = rv ? rv.lvl : 0;
    if (rv) g.stakes = Math.max(g.stakes, 0.08 * rv.lvl);
    g.intensity = U.round(g.stakes * sl.po, 3);
    const I = Math.min(1.5, g.intensity);
    g.timeMult = 1 / sl.pace;
    g.usageExp = sl.usage * (1 + 0.35 * I);
    g.homeMult = sl.home * (1 + 0.5 * I);
    g.clutchMult = sl.clutch * (1 + 0.8 * I);
    g.t = [makeTeamCtx(S, g, homeTid, 0), makeTeamCtx(S, g, awayTid, 1)];
    // each team's playbook, the coach's play-calling memory and its pick-and-roll coverage (js/core/playcall.js)
    if (PBC.PlayCall) PBC.PlayCall.setup(g);
    // each bench's in-game adjustments (js/core/adjust.js)
    if (PBC.Adjust) PBC.Adjust.setup(g, opts);
    if (g.userIdx >= 0) {
      const ut = g.t[g.userIdx];
      ut.autoTO = S.settings.autoTimeouts !== false;
    }
    setupForm(g);
    // per-team shooting (logit) and turnover adjustments: form, user-team handles, playoff defense
    // (the benches: each coach's edge at both ends, js/core/staff.js, centred on the league)
    const ce = PBC.Staff && PBC.Staff.gameEdge ? [0, 1].map(i => PBC.Staff.gameEdge(S, g.tids[i], g.playoff)) : null;
    g.coachEdge = ce ? [0, 1].map(i => U.round(ce[i].off - ce[1 - i].def, 4)) : [0, 0];
    g.shootAdj = [0, 1].map(i => g.form[i] + g.coachEdge[i] + (i === g.userIdx ? sl.uShoot : 0) - (1 - i === g.userIdx ? sl.uDef : 0) - 0.03 * I);
    g.toMult = [0, 1].map(i => sl.to * (1 + (sl.stl - 1) * 0.35) * g.formTo[i] * (i === g.userIdx ? sl.uTo : 1) * (1 - 0.06 * I));
    return g;
  };

  // ---------------------------------------------------------------------------
  // Stakes (play-in / playoffs) and game-to-game form
  // ---------------------------------------------------------------------------
  function findPostGame(S, gid) {
    if (gid == null) return null;
    const P = S.playoffs;
    const inList = arr => (arr || []).find(x => x && x.gid === gid) || null;
    return inList(S.todayPost) || (P && P.playIn ? inList(P.playIn.map(x => x.game)) : null) || (P ? inList(P.games) : null);
  }

  /** How much a game matters: { stakes, info } (see Sim.createGame). */
  Sim.stakesFor = function (S, opts) {
    opts = opts || {};
    if (!opts.playoff) return { stakes: 0, info: null };
    const P = S.playoffs;
    const sg = opts.sg || findPostGame(S, opts.gid);
    const info = { round: P ? P.round : 1, roundName: 'Playoffs', gameNum: 1, seriesW: [0, 0], elimination: false, game7: false, clinch: [false, false], decider: false, len: 0, playIn: null };
    let stakes = 0.75;
    if (sg && sg.playIn && P && P.playIn) {
      const x = P.playIn.find(y => y.id === sg.playIn);
      const stage = x ? x.stage : 'A';
      info.round = 0; info.roundName = 'Play-In Tournament'; info.playIn = stage; info.len = 1;
      info.elimination = stage !== 'A';                       // B (9 vs 10) and C: the loser goes home
      info.clinch = stage === 'B' ? [false, false] : [true, true];   // A and C: the winner clinches a playoff seed
      stakes = 0.55 + (info.elimination ? 0.1 : 0);
    } else if (sg && sg.series && P) {
      const s = P.series.find(y => y.id === sg.series);
      if (s) {
        const need = Math.ceil(s.len / 2);
        const hiHome = sg.h === s.hi;
        const wH = hiHome ? s.w[0] : s.w[1], wA = hiHome ? s.w[1] : s.w[0];
        const fromEnd = Math.max(0, (P.rounds || s.round) - s.round);     // 0 = Finals, 1 = conference finals / semis …
        info.round = s.round; info.roundName = PBC.League.roundName(S, s.round);
        info.gameNum = sg.gameNum || wH + wA + 1; info.len = s.len;
        info.seriesW = [wH, wA];
        info.clinch = [wH >= need - 1, wA >= need - 1];
        info.elimination = info.clinch[0] || info.clinch[1];
        info.decider = info.clinch[0] && info.clinch[1];
        info.game7 = info.decider && s.len === 7;
        stakes = [1, 0.9, 0.75, 0.6][Math.min(3, fromEnd)] + (info.elimination ? 0.1 : 0) + (info.decider ? 0.12 : 0) + (info.game7 ? 0.05 : 0);
      }
    }
    return { stakes: U.round(Math.min(1.25, stakes), 3), info };
  };

  /** Rotation strength: OVR weighted by planned minutes (what actually takes the floor tonight). */
  function rotStrength(T) {
    let s = 0, w = 0;
    for (const c of T.players) { s += c.p.ovr * c.target; w += c.target; }
    return w > 0 ? s / w : U.avg(T.players, c => c.p.ovr);
  }

  /**
   * Hidden per-game form. Everyday: a small shooting / turnover wobble for each team. Rarely: a "can't miss" night
   * (more likely for the underdog, sized so that it can swing even a lopsided game) or an off night for the favorite.
   * All of it scales with the Upsets slider (0 = off); the playoffs have fewer of both (everybody is locked in).
   */
  function setupForm(g) {
    const up = g.sl.upset;
    g.form = [0, 0]; g.formTo = [1, 1]; g.magic = null; g.offNight = null;
    if (!(up > 0)) return;
    const I = Math.min(1.25, g.intensity || 0);
    const str = g.t.map(rotStrength);
    const dog = str[0] < str[1] ? 0 : 1, fav = 1 - dog;
    const gap = Math.abs(str[0] - str[1]);
    const sd = Math.sqrt(up);
    for (let i = 0; i < 2; i++) { g.form[i] = U.gauss(0, 0.035 * sd); g.formTo[i] = Math.exp(U.gauss(0, 0.04 * sd)); }
    const perLogit = 0.62 * g.L.paceBase;          // margin swing of +1 logit for one team and −0.35 for the other
    const expMargin = (g.L.key === 'women' ? 2.8 : 3) * gap;   // ≈ points per OVR point of rotation strength
    const pMagic = U.clamp(up * (0.008 + 0.022 * U.clamp(gap / 15, 0, 1)) * (1 - 0.45 * I), 0, 0.3);
    const pFavMagic = U.clamp(up * 0.006 * (1 - 0.45 * I), 0, 0.1);
    const pOff = U.clamp(up * (0.012 + 0.008 * U.clamp(gap / 10, 0, 1)) * (1 - 0.6 * I), 0, 0.15);
    if (U.chance(pMagic)) {
      const m = U.clamp((expMargin + 6) / perLogit, 0.15, 1.3);
      g.magic = dog;
      g.form[dog] += m; g.form[fav] -= 0.35 * m;
      g.formTo[dog] *= 0.85; g.formTo[fav] *= 1.1;
    } else if (U.chance(pFavMagic)) {
      g.magic = fav;
      g.form[fav] += 0.25; g.formTo[fav] *= 0.9;
    }
    if (g.magic !== fav && U.chance(pOff)) {
      g.offNight = fav;
      g.form[fav] -= U.clamp((0.4 * expMargin + 4) / perLogit, 0.08, 0.5);
      g.formTo[fav] *= 1.08;
    }
    g.form = g.form.map(x => U.round(x, 3));
    g.formTo = g.formTo.map(x => U.round(x, 3));
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  const avgOn = (T, k) => U.avg(T.on, c => c.r[k]);
  const avgEnergy = T => U.avg(T.on, c => c.energy);
  const fatigueMult = c => 1 - Math.max(0, 72 - c.energy) * 0.012;
  const inBonus = (T, clockLeft, L) => T.fouls >= L.bonus || (clockLeft <= 120 && T.fouls2 >= 2);

  function scoreSkill(r) {
    const inside = Math.max(r.layup, r.close, r.dunk * 0.95, r.post * 0.95);
    const outside = Math.max(r.three, r.mid * 0.97);
    return 0.42 * outside + 0.38 * inside + 0.1 * r.drawFoul + 0.1 * r.shotIQ;
  }

  function usageW(ctx, c) {
    const T = ctx.O, g = ctx.g;
    // star usage slider and playoff intensity sharpen the curve; pass-first players shoot less
    let w = Math.pow(scoreSkill(c.r) / 70, Sim.K.usageExp * g.usageExp) * c.tn.f.use;
    const goToMod = C.OFFENSES[T.strat.off].mods.goTo || 1;
    const goToI = 1 + 0.1 * Math.min(1.5, g.intensity);
    const us = g.sl.usage, hero = us > 1 ? us : 1;     // star usage slider above default feeds the go-to players
    if (T.strat.goTo1 === c.id) w *= 1.1 * goToMod * goToI * (hero === 1 ? 1 : Math.pow(hero, 1.3));
    else if (T.strat.goTo2 === c.id) w *= 1.08 * (goToMod > 1 ? 1 + (goToMod - 1) * 0.4 : 1) * goToI * (hero === 1 ? 1 : Math.pow(hero, 0.8));
    else if (hero > 1 && !T.strat.goTo1 && ctx.starId === c.id) w *= hero;
    w *= 1 + c.conf * Sim.K.confUse; // (a confident player looks for his shot, a cold one moves it on)
    w *= fatigueMult(c);
    // teammates get involved once someone has jacked up a lot of shots (later / softer with the star usage slider)
    w /= 1 + Math.max(0, c.st.fga + c.st.fta * 0.44 - (us === 1 ? 15 : 15 * Math.sqrt(us))) * (us === 1 ? 0.085 : 0.085 / us);
    // box-and-one on the opponent's top scorer
    if (ctx.D.strat.def === 'boxone' && ctx.starId === c.id) w *= C.DEFENSES.boxone.mods.starUsage;
    return w;
  }

  function starOf(T) { return U.maxBy(T.on, c => scoreSkill(c.r) + (T.strat.goTo1 === c.id ? 6 : 0)).id; }

  function name(c) { return c ? c.last : 'Team'; }

  // who guards whom: one pairing of the two lineups (closest position, then size), kept while neither lineup
  // changes. The live court is handed the same pairing with the possession (P.matchups), so the defender the engine
  // credits with a contest, a block or a foul is the one standing on that player.
  const PERMS5 = (() => { const out = [], a = [0, 1, 2, 3, 4]; const go = (k) => { if (k === 5) { out.push(a.slice()); return; } for (let i = k; i < 5; i++) { [a[k], a[i]] = [a[i], a[k]]; go(k + 1); [a[k], a[i]] = [a[i], a[k]]; } }; go(0); return out; })();
  function pairLineups(offs, defs) {
    const mm = {};
    if (offs.length !== 5 || defs.length !== 5) { offs.forEach((o, i) => { mm[o.id] = defs[Math.min(i, defs.length - 1)]; }); return mm; }
    const cost = (o, d) => Math.abs(d.posN - o.posN) + Math.abs((d.hgt || 78) - (o.hgt || 78)) / 4;
    let best = null, bc = Infinity;
    for (const p of PERMS5) { let c = 0; for (let i = 0; i < 5 && c < bc; i++) c += cost(offs[i], defs[p[i]]); if (c < bc - 1e-9) { bc = c; best = p; } }
    offs.forEach((o, i) => { mm[o.id] = defs[best[i]]; });
    return mm;
  }
  function matchupsOf(ctx) {
    const g = ctx.g, O = ctx.O, D = ctx.D;
    const key = O.idx + ':' + O.on.map(c => c.id).join(',') + '|' + D.on.map(c => c.id).join(',');
    const cache = g.mm || (g.mm = {});
    if (!cache[O.idx] || cache[O.idx].key !== key) cache[O.idx] = { key, mm: pairLineups(O.on, D.on) };
    return cache[O.idx].mm;
  }
  function matchupDefender(D, off, ctx) {
    const m = ctx && ctx.O && ctx.O.on.includes(off) ? matchupsOf(ctx)[off.id] : null;
    if (m && D.on.includes(m)) return m;
    // (not in the offense's lineup: closest position, tie → random)
    let best = null, bd = 99;
    for (const d of U.shuffle(D.on)) { const dd = Math.abs(d.posN - off.posN); if (dd < bd) { bd = dd; best = d; } }
    return best;
  }

  // near: the shooter's spot in a called play ([u, v]: feet from the baseline, from the sideline): the shot goes up
  // on that side of the floor, at about that angle (the zone, and so the make probability, is the same)
  function locFor(ctx, zone, kind, near) {
    const g = ctx.g, idx = ctx.O.idx;
    const bx = basketX(idx, g.period), dir = dirX(idx, g.period);
    const L = g.L;
    let d, a, x, y;
    const side = near && Math.abs(near[1] - 25) > 2.5 ? (near[1] > 25 ? 1 : -1) : U.chance(0.5) ? 1 : -1;
    const aim = (lo, hi) => {
      if (!near) return U.range(lo, hi);
      // (the court's angle of that spot, measured the way this function measures it: y = 25 + d sin a)
      const a0 = Math.atan2(near[1] - 25, Math.max(0.5, near[0] - 5.25));
      return U.clamp(a0 + U.range(-0.25, 0.25), lo, hi);
    };
    if (zone === 'rim') { d = kind === 'dunk' || kind === 'alley' || kind === 'tip' ? U.range(0.5, 2.5) : U.range(1.5, 4); a = aim(-1.3, 1.3); }
    else if (zone === 'paint') { d = U.range(4.5, 12.5); a = aim(-0.95, 0.95); }
    else if (zone === 'mid') { d = U.range(10, 21.5); a = aim(-1.35, 1.35); }
    else if (zone === 'ab3') { d = U.range(L.threePt.arc + 0.3, L.threePt.arc + (kind === 'heave' ? 40 : U.chance(0.15) ? 5.5 : 2.6)); a = aim(-1.1, 1.1); }
    if (zone === 'c3') {
      y = 25 + side * U.range(L.threePt.corner + 0.2, Math.min(24.2, L.threePt.corner + 1.8));
      x = bx - dir * U.range(-4.2, 8.5);
      d = Math.hypot(x - bx, y - 25);
      return { x: U.round(x, 1), y: U.round(y, 1), d: Math.round(d) };
    }
    x = bx - dir * d * Math.cos(a);
    y = 25 + d * Math.sin(a);
    if (zone === 'paint') y = U.clamp(y, 17.5, 32.5);
    if (zone === 'mid') {
      // keep inside the 3pt line
      if (Math.abs(y - 25) > L.threePt.corner - 0.8) y = 25 + Math.sign(y - 25) * (L.threePt.corner - 0.8);
    }
    x = U.clamp(x, 0.8, 93.2); y = U.clamp(y, 0.8, 49.2);
    return { x: U.round(x, 1), y: U.round(y, 1), d: Math.max(0, Math.round(Math.hypot(x - bx, y - 25))) };
  }

  // ---------------------------------------------------------------------------
  // Play-by-play text
  // ---------------------------------------------------------------------------
  const TXT = {
    made(sh, kind, zone, d, ast, andOne) {
      const S = sh.last;
      let s;
      switch (kind) {
        case 'dunk': s = U.pick([`${S} throws it down!`, `${S} slams it home`, `${S} with the two-handed jam`, `${S} hammers the dunk`, `${S} flushes it`]); break;
        case 'alley': s = `${S} finishes the alley-oop!`; break;
        case 'tip': s = U.pick([`${S} tips it in`, `${S} with the putback`]); break;
        case 'layup': s = U.pick([`${S} lays it in`, `${S} finishes at the rim`, `${S} scores on the layup`, `${S} kisses it off the glass`]); break;
        case 'reverse': s = `${S} with the reverse layup`; break;
        case 'floater': s = `${S} floats one in from ${d} ft`; break;
        case 'hook': s = `${S} hits the hook shot`; break;
        case 'fadeaway': s = `${S} drills the ${d}-ft fadeaway`; break;
        case 'stepback': s = is3(zone) ? U.pick([`${S} step-back three... GOT IT!`, `${S} steps back and buries a ${d}-footer`]) : `${S} step-back jumper is good`; break;
        case 'pullup': s = is3(zone) ? `${S} pulls up from ${d} ft... BANG!` : `${S} pulls up and hits from ${d} ft`; break;
        case 'catch_shoot': s = zone === 'c3' ? U.pick([`${S} buries the corner three`, `${S} catches and fires from the corner... good!`]) : U.pick([`${S} drains a ${d}-ft three`, `${S} catches and splashes it from ${d}`]); break;
        case 'heave': s = `${S} HEAVES IT... AND IT'S GOOD! UNBELIEVABLE!`; break;
        default: s = is3(zone) ? `${S} hits a ${d}-ft three` : `${S} knocks down a ${d}-ft jumper`;
      }
      if (ast) s += ` (${ast.last} assists)`;
      if (andOne) s += ', AND ONE!';
      return s;
    },
    missed(sh, kind, zone, d) {
      const S = sh.last;
      switch (kind) {
        case 'dunk': case 'alley': return `${S} misses the dunk!`;
        case 'tip': return `${S} can't get the tip to fall`;
        case 'layup': case 'reverse': return U.pick([`${S} misses the layup`, `${S} can't finish at the rim`]);
        case 'floater': return `${S} misses the floater`;
        case 'hook': return `${S} misses the hook`;
        case 'heave': return `${S}'s heave is no good`;
        default: return is3(zone) ? U.pick([`${S} misses a ${d}-ft three`, `${S}'s three rims out`, `${S} misfires from deep`]) : U.pick([`${S} misses a ${d}-ft jumper`, `${S} misses from ${d} ft`]);
      }
    },
  };

  // ---------------------------------------------------------------------------
  // Possession
  // ---------------------------------------------------------------------------
  function ev(ctx, type, fields) {
    if (ctx.g.lite) return null;
    const e = Object.assign({ type, t: U.round(Math.min(ctx.t, ctx.g.clock), 2) }, fields);
    ctx.P.events.push(e);
    if (e.text) ctx.g.pbp.push({ q: ctx.g.period, clock: Math.max(0, ctx.g.clock - e.t), team: e.team, text: e.text, type, score: null, possN: ctx.P.n });
    return e;
  }
  function evAt(ctx, t, type, fields) { const keep = ctx.t; ctx.t = t; const e = ev(ctx, type, fields); ctx.t = keep; return e; }
  function stampScore(ctx) {
    if (ctx.g.lite) return;
    const last = ctx.g.pbp[ctx.g.pbp.length - 1];
    if (last) last.score = ctx.g.score.slice();
  }

  function addPoints(ctx, idx, pts) {
    const g = ctx.g;
    g.score[idx] += pts;
    const T = g.t[idx];
    T.qs[g.period - 1] = (T.qs[g.period - 1] || 0) + pts;
    for (const c of g.t[idx].on) c.st.pm += pts;
    for (const c of g.t[1 - idx].on) c.st.pm -= pts;
    if (g.run.team === idx) g.run.pts += pts; else g.run = { team: idx, pts };
    stampScore(ctx);
  }

  function newCtx(g, P) {
    return { g, P, O: g.t[P.off], D: g.t[1 - P.off], t: 0, scStart: 0, scLen: g.L.shotClock, done: false, segN: 0, transition: false, info: null, newPlay: true, advT: 0, frontcourt: false, periodOver: false, starId: null, inbound: null, pbCalls: 0, score0: g.score[P.off], tActPre: null, userCalled: false };
  }

  Sim.nextPossession = function (g, opts) {
    opts = opts || {};
    if (g.final) return null;
    if (g.pending) throw new Error('Pending GIM shot must be resolved first');
    const L = g.L;
    let jump = null;
    if (g.nextStart === 'jump_ball') jump = jumpBall(g);
    const P = {
      n: g.possN++, off: g.poss, period: g.period, clockStart: U.round(g.clock, 2), clockEnd: null,
      start: g.nextStart, startSpot: g.nextSpot, play: 'none', setName: '', defScheme: g.t[1 - g.poss].strat.def,
      events: [], endScore: null, gim: opts.gim || null, pbs: [], pb: null, userCall: null, defCov: null,
      sq: null, tok: undefined, log: null, // (play tracking: the first shot, the turnover's kind, the log entry)
    };
    const ctx = newCtx(g, P);
    ctx.starId = starOf(ctx.O);
    g.t[P.off].poss++;
    // dead-ball management
    const dead = P.start !== 'dreb' && P.start !== 'steal';
    ctx.scStart = 0;
    if (jump) {
      ev(ctx, 'jump_ball', { jumpers: [jump.a.id, jump.b.id], winner: jump.winner, tipTo: jump.tipTo.id, team: jump.winner, text: `${jump.w.last} wins the tip over ${jump.l.last}` });
    }
    if (dead) { timeouts(ctx, P.start !== 'made_basket'); subs(ctx, 0, P.start); subs(ctx, 1, P.start); }
    if (g.adj && PBC.Adjust) PBC.Adjust.possession(ctx, dead);
    defenseCall(ctx.D);
    P.defScheme = ctx.D.strat.def;
    if (PBC.PlayCall) P.defCov = PBC.PlayCall.coverage(ctx.D);
    P.offSystem = ctx.O.strat.off; // the live view shapes its off-ball movement and ball movement on it
    { const mm = matchupsOf(ctx); P.matchups = {}; for (const o of ctx.O.on) if (mm[o.id]) P.matchups[mm[o.id].id] = o.id; } // defender id -> his man's id
    initiate(ctx, opts);
    if (!ctx.done) backcourtRules(ctx);
    runSegments(ctx, opts);
    if (ctx.pendingShot) { g.pending = { P, ctx }; P.pendingShot = ctx.pendingShot; return P; }
    finishPossession(ctx);
    return P;
  };

  function jumpBall(g) {
    const pickJumper = T => U.maxBy(T.on, c => c.hgt * 2 + c.r.vert * 0.3);
    const a = pickJumper(g.t[0]), b = pickJumper(g.t[1]);
    const sa = a.hgt * 2 + a.r.vert * 0.35 + U.gauss(0, 6), sb = b.hgt * 2 + b.r.vert * 0.35 + U.gauss(0, 6);
    const winner = sa >= sb ? 0 : 1;
    const W = g.t[winner];
    const tipTo = U.maxBy(W.on.filter(c => c !== (winner === 0 ? a : b)), c => c.r.handle + (c.posN <= 2 ? 10 : 0) + U.rand() * 8);
    if (g.period === 1) g.tipWinner = winner;
    g.poss = winner;
    g.nextStart = 'jump_ball';
    g.nextSpot = { x: 47, y: 25 };
    return { a, b, winner, tipTo, w: winner === 0 ? a : b, l: winner === 0 ? b : a };
  }

  // ---- timeouts ----
  function timeouts(ctx, dead) {
    const g = ctx.g;
    for (const T of g.t) {
      if (T.timeouts <= 0) continue;
      let call = false;
      if (T.toRequest && (dead || T === ctx.O)) { call = true; T.toRequest = false; }
      else if (T.autoTO && T.timeouts > (g.period >= g.L.periods ? 0 : 2) && g.run.team !== T.idx && g.run.pts >= 9 && T.lastTimeoutClock !== g.period * 10000 + Math.round(g.clock)) {
        if (T === ctx.O || dead) call = U.chance(0.7);
      }
      if (call) {
        T.timeouts--;
        T.lastTimeoutClock = g.period * 10000 + Math.round(g.clock);
        g.lastTO = { idx: T.idx, n: ctx.P.n };
        ev(ctx, 'timeout', { team: T.idx, text: `Timeout: ${T.team.city} ${T.team.name}` });
        for (const c of T.on) c.energy = Math.min(100, c.energy + 5);
        if (g.run.team !== T.idx) g.run = { team: -1, pts: 0 };
        ctx.timeoutCalled = true;
      }
    }
  }

  /**
   * The head coach's defense for a number of defensive possessions (Sim.callDefense in a timeout): counted down at
   * the start of each one, then back to the scheme and coverage the team had before (unless the coach changed it again meanwhile).
   */
  function defenseCall(D) {
    const dc = D.defCall;
    if (!dc) return;
    if (dc.left > 0) { dc.left--; return; }
    if (D.strat.def === dc.def) D.strat.def = dc.prev.def;
    if (D.pb && D.pb.covCall === dc.cov) D.pb.covCall = dc.prev.cov;
    D.defCall = null;
  }

  // ---- substitutions ----
  function foulLimit(period, L) { return period >= L.periods ? L.foulOut - 1 : Math.min(L.foulOut - 1, period + 1); }

  function lineupOk(set) {
    const guards = set.filter(c => c.posN <= 2).length;
    const bigs = set.filter(c => c.posN >= 4).length;
    const centers = set.filter(c => c.posN === 5).length;
    const handle = Math.max(...set.map(c => c.r.handle));
    return (guards >= 1 || handle >= 72) && bigs >= 1 && centers <= 2 && guards <= 3 && handle >= 60;
  }

  function subs(ctx, idx, start) {
    const g = ctx.g, L = g.L, T = g.t[idx];
    const periodStart = start === 'period_start' || start === 'jump_ball';
    const clockLeft = g.clock;
    const isEnd = g.period >= L.periods;
    const lead = g.score[idx] - g.score[1 - idx];
    // high-stakes games: closers come in earlier, garbage time needs a real blowout, stars play through fatigue
    const I = Math.min(1.5, g.intensity);
    const gb = 1 + 0.4 * I;
    const crunch = (isEnd && clockLeft <= 300 + 150 * Math.min(1.25, I) && Math.abs(lead) <= 10 + 4 * I) || g.period > L.periods;
    const garbage = (isEnd && g.period === L.periods && ((Math.abs(lead) >= 20 * gb && clockLeft <= 420 / gb) || (Math.abs(lead) >= 27 * gb && clockLeft <= 700 / gb) || Math.abs(lead) >= 34 * gb))
      || (g.period === L.periods - 1 && Math.abs(lead) >= 36 * gb && clockLeft <= L.quarterLen * 0.4); // runaway games empty the benches early
    const tireK = 6.5 * (1 + 0.5 * I);
    const totalReg = L.periods * L.quarterLen;
    const elapsed = Math.min(totalReg, g.elapsedReg);
    const frac = elapsed / totalReg;
    const avail = T.players.filter(c => !c.out && !c.inj);
    if (avail.length < 5) return;
    const forced = T.on.filter(c => c.out || c.inj);
    const madeBasket = start === 'made_basket';
    if (madeBasket && !forced.length && !(isEnd && clockLeft <= 120)) return; // clock running
    if (!T.autoSubs && !forced.length && !T.manualSubs.length) return;

    // manual subs from the coach
    let manual = [];
    if (T.manualSubs.length) {
      for (const ms of T.manualSubs) {
        const out = T.on.find(c => c.id === ms.out), inn = avail.find(c => c.id === ms.in && !c.on);
        if (out && inn) manual.push([out, inn]);
      }
      T.manualSubs = [];
    }
    let desired;
    if (manual.length) {
      desired = T.on.slice();
      for (const [o, i] of manual) desired[desired.indexOf(o)] = i;
    } else if (!T.autoSubs) {
      desired = T.on.slice();
    } else {
      const closers = U.sortBy(avail, c => (c.starter ? 8 : 0) + c.target * 0.6 + c.p.ovr * 0.4, true).slice(0, 5);
      const pri = c => {
        let v;
        if (garbage) v = -c.target * 0.35 + (c.target <= 0 ? 6 : 0) + (c.energy - 80) / 10;
        else {
          v = (c.target * 60 * frac - c.sec) / 60 + (c.energy - 80) / tireK;
          if (c.target <= 0) v -= 40;
          if (c.pf >= foulLimit(g.period, L) && !crunch) v -= 12;
          if (c.hackRest === g.period && !crunch) v -= 25; // (they keep fouling him on purpose: sit him for the quarter)
          if (periodStart && (g.period === 1 || g.period === 3) && c.starter) v += 30;
          if (crunch && closers.includes(c)) v += 16;
        }
        if (c.on) v += 1.7;
        return v;
      };
      const sorted = U.sortBy(avail, pri, true);
      desired = sorted.slice(0, 5);
      if (!lineupOk(desired)) {
        for (let k = 5; k < sorted.length && !lineupOk(desired); k++) {
          for (let j = 4; j >= 0; j--) {
            const trial = desired.slice(); trial[j] = sorted[k];
            if (lineupOk(trial)) { desired = trial; break; }
          }
        }
      }
    }
    // limit changes when not at a natural break
    const outs = T.on.filter(c => !desired.includes(c));
    const ins = desired.filter(c => !T.on.includes(c));
    const maxSwaps = periodStart || ctx.timeoutCalled || manual.length ? 5 : Math.max(forced.length, 2);
    const n = Math.min(outs.length, ins.length, maxSwaps);
    // pair by position similarity
    const outSorted = U.sortBy(outs, c => (c.out || c.inj ? -100 : 0) + (desired.includes(c) ? 100 : 0));
    const usedIns = new Set();
    for (let k = 0; k < n; k++) {
      const o = outSorted[k];
      const i = U.minBy(ins.filter(x => !usedIns.has(x)), x => Math.abs(x.posN - o.posN));
      if (!i) break;
      usedIns.add(i);
      T.on[T.on.indexOf(o)] = i;
      T.lineupV = (T.lineupV || 0) + 1;
      o.on = false; i.on = true;
      ev(ctx, 'sub', { team: idx, out: o.id, in: i.id, text: `${i.name} checks in for ${o.last}${o.out ? ' (fouled out)' : o.inj ? ' (injured)' : ''}` });
    }
  }

  /** a lineup's open-court awareness, in team-average rating SDs (~5 points) from the league average */
  function openCourtAware(T, side) {
    let s = 0;
    for (const c of T.on) s += side === 'off' ? dv(c, 'shotIQ') * 0.4 + dv(c, 'vision') * 0.3 + dv(c, 'speed') * 0.3
      : dv(c, 'helpD') * 0.45 + ((c.r.hustle != null ? c.r.hustle : 68) - 68) * 0.3 + dv(c, 'speed') * 0.25;
    return s / Math.max(1, T.on.length) / 5;
  }

  // ---- start of possession ----
  function pickHandler(T) {
    return U.maxBy(T.on, c => c.r.handle * 0.55 + c.r.pass * 0.3 + c.r.vision * 0.15 + (c.posN === 1 ? 8 : c.posN === 2 ? 3 : 0) + U.rand() * 6);
  }
  function pickInbounder(T, handler) {
    return U.maxBy(T.on.filter(c => c !== handler), c => c.posN * 3 + U.rand() * 6);
  }

  function tempoFactor(T) {
    const p = C.TEMPOS[T.strat.tempo].pace + (C.OFFENSES[T.strat.off].mods.pace || 0);
    return 1 - p * 0.028;
  }

  function initiate(ctx, opts) {
    const { g, P, O, D } = ctx;
    const L = g.L;
    const dir = dirX(O.idx, g.period);
    const bx = basketX(O.idx, g.period);
    const stopped = g.period >= L.periods && g.clock <= 120;
    const leadingLate = g.period >= L.periods && g.clock <= 140 && g.score[O.idx] > g.score[D.idx];
    let transP = 0;
    const handler = pickHandler(O);
    ctx.handler = handler;
    const backBaseX = dir > 0 ? -1 : 95;
    const I = Math.min(1.5, g.intensity);
    const tf = tempoFactor(O) * g.timeMult * (1 + 0.03 * I);
    const press = D.strat.def === 'press';
    switch (P.start) {
      case 'jump_ball': {
        ctx.t = U.range(1.5, 2.5);
        ctx.advT = ctx.t;
        ev(ctx, 'advance', { handler: handler.id, team: O.idx });
        transP = 0.05;
        break;
      }
      case 'period_start': {
        const inb = pickInbounder(O, handler);
        ctx.t = 0.3;
        ev(ctx, 'inbound', { by: inb.id, to: handler.id, spot: 'sideline', x: 47 - dir * 2, y: 51, team: O.idx });
        ctx.t = U.range(1.5, 3);
        ctx.advT = ctx.t;
        ev(ctx, 'advance', { handler: handler.id, team: O.idx });
        break;
      }
      case 'made_basket': case 'ft_made': {
        const inb = pickInbounder(O, handler);
        ctx.t = stopped ? 0 : U.range(1.2, 2.3);
        if (ctx.t >= g.clock) { ctx.t = g.clock; endPeriod(ctx); return; }
        ev(ctx, 'inbound', { by: inb.id, to: handler.id, spot: 'baseline', x: backBaseX, y: U.round(25 + U.range(-7, 7), 1), team: O.idx });
        ctx.scStart = ctx.t;
        if (press && !leadingLate && U.chance(0.95)) {
          ctx.press = true;
        }
        ctx.t += U.range(3.4, 5.6) * tf + (ctx.press ? U.range(1, 2.5) : 0);
        if (ctx.t < g.clock - 0.3) { ctx.advT = ctx.t; ev(ctx, 'advance', { handler: handler.id, team: O.idx }); }
        transP = 0.045 * (ctx.press ? 2.4 * (C.DEFENSES.press.mods.transitionAgainst || 1) : 1);
        break;
      }
      case 'dreb': {
        const reb = O.on.find(c => c.id === g.lastRebounder) || handler;
        ctx.rebounder = reb;
        transP = 0.2;
        const outlet = reb !== handler && reb.posN >= 3 && U.chance(0.75);
        if (outlet) {
          ctx.t = U.range(0.4, 1.0);
          // (an outlet can go wrong: outletTOProb; the possession ends in the backcourt, jumped or thrown away)
          if (U.chance(outletTOProb(ctx, reb))) { outletTurnover(ctx, reb, handler); return; }
          ev(ctx, 'pass', { from: reb.id, to: handler.id, kind: 'outlet', team: O.idx });
        }
        ctx.transitionCandidate = true;
        break;
      }
      case 'steal': {
        const st = O.on.find(c => c.id === g.lastStealer) || handler;
        ctx.stealer = st;
        transP = 0.62;
        if (st.r.handle < 55 && st !== handler) {
          ctx.t = U.range(0.4, 0.9);
          if (U.chance(outletTOProb(ctx, st))) { outletTurnover(ctx, st, handler); return; }
          ev(ctx, 'pass', { from: st.id, to: handler.id, kind: 'outlet', team: O.idx });
        }
        else ctx.handler = st;
        break;
      }
      case 'dead_ball': default: {
        const inb = pickInbounder(O, handler);
        const spot = P.startSpot || {};
        ctx.t = 0.2;
        ev(ctx, 'inbound', { by: inb.id, to: handler.id, spot: spot.kind || 'sideline', x: spot.x != null ? spot.x : 47, y: spot.y != null ? spot.y : -1, team: O.idx });
        if (spot.front) { ctx.frontcourt = true; ctx.advT = ctx.t; if (spot.sc) { ctx.scLen = spot.sc; } }
        else { ctx.t += U.range(3.2, 5.2) * tf; ctx.advT = ctx.t; ev(ctx, 'advance', { handler: ctx.handler.id, team: O.idx }); }
        break;
      }
    }
    // transition chance
    if (transP > 0 && !leadingLate) {
      let m = { vslow: 0.55, slow: 0.78, normal: 1, fast: 1.3, vfast: 1.6 }[O.strat.tempo] || 1;
      m *= C.OFFENSES[O.strat.off].mods.transition || 1;
      m *= 1 + (avgOn(O, 'speed') - 72) * 0.02;
      m *= C.CRASH[D.strat.crash].transAgainst || 1;
      // sliders, players who love to run (push), crashers caught up the floor, playoff half-court basketball
      m *= g.sl.trans * Math.exp(0.5 * avgDev(O, 'push')) * (1 - 0.12 * I);
      if (P.start === 'dreb') m *= Math.exp(0.3 * avgDev(D, 'crash'));
      // awareness in the open court: an offense that reads it (shot IQ, vision) and runs sees the numbers and
      // pushes; a defense that sees it (help IQ, hustle) gets back, finds men and stops the ball
      const oa = openCourtAware(O, 'off'), da = openCourtAware(D, 'def');
      // (0.22: the average matchup of the two, so an average one changes nothing)
      const edgeOC = U.clamp(oa - da - 0.22, -2, 2);
      m *= Math.exp(edgeOC * 0.22);
      ctx.transition = U.chance(U.clamp(transP * m, 0, 0.9));
      // no full break, but an aware offense still attacks before the defense is set: early offense (a drag screen,
      // a trailer, a quick drive) in the first seconds of the shot clock
      if (!ctx.transition && (P.start === 'dreb' || P.start === 'steal')) ctx.early = U.chance(U.clamp(0.07 * Math.exp(edgeOC * 0.35) * m, 0, 0.3));
    }
    if (P.start === 'dreb' || P.start === 'steal') {
      if (ctx.transition) ctx.t += U.range(1.3, 2.6);
      else ctx.t += U.range(3.4, 5.6) * tf;
      if (ctx.t < g.clock - 0.3) {
        ctx.advT = ctx.t;
        ev(ctx, 'advance', { handler: ctx.handler.id, team: O.idx });
      }
    }
    if (ctx.t >= g.clock - 0.3) {
      // not enough time to get into the frontcourt: heave it or let the clock run out
      if (g.clock >= 0.7 && ctx.P.start !== 'period_start') heave(ctx);
      else { ctx.t = g.clock; endPeriod(ctx); }
    }
  }

  // Eight seconds to get the ball over half court, and once over it may not go back (NBA rule 10, sections VIII and
  // IX). The count runs with the shot clock from the throw-in or the change of possession; a press and a shaky
  // handler make both far more likely. League rates: about 0.03 eight-second and 0.06 backcourt violations per team
  // per game.
  function backcourtRules(ctx) {
    const g = ctx.g, P = ctx.P, h = ctx.handler;
    if (ctx.transition || ctx.frontcourt || ctx.advT == null || !h) return;
    const t0 = ctx.scStart || 0;
    if (ctx.advT <= t0) return;
    const k = (ctx.press ? 5 : 1) * Math.pow(1.045, (72 - ((h.r && h.r.handle) || 70)) / 2) * ((g.sl && g.sl.to) || 1);
    if (t0 + 8.05 < g.clock - 0.3 && U.chance(0.0004 * k)) {
      // never got it across: the advance never happened
      if (!g.lite) { for (let i = P.events.length - 1; i >= 0; i--) if (P.events[i].type === 'advance') { P.events.splice(i, 1); break; } }
      { const ni = mkInfo('none', '', h); ni.noSet = true; turnover(ctx, ni, t0 + 8.05, 'eight_seconds'); }
      return;
    }
    const tb = ctx.advT + U.range(0.4, 2.4);
    if (tb < g.clock - 0.3 && tb < t0 + 22 && U.chance(0.00095 * k)) { const ni = mkInfo('none', '', h); ni.noSet = true; turnover(ctx, ni, tb, 'backcourt'); }
  }

  // Defensive three seconds: a defender in the lane for three seconds without actively guarding anyone. A team
  // technical (no personal foul, not a team foul): one free throw by any player on the floor, and the offense keeps
  // the ball on the sideline at the free throw line extended with the shot clock where it was, 14 at the least (NBA
  // rule 12). About 0.17 per team per game in recent seasons, more against zones and sagging defenses.
  function def3Prob(ctx) {
    const D = ctx.D, sch = D.strat.def;
    const zone = /zone|boxone/.test(sch);
    return 0.00235 * (zone ? 1.8 : sch === 'packline' ? 1.3 : 1);
  }
  function defensiveThree(ctx, info, t) {
    const g = ctx.g, O = ctx.O, D = ctx.D, L = g.L;
    ctx.t = Math.min(t, g.clock - 0.05);
    if (info.pb) pbCut(ctx, info, ctx.t, 'def3');
    const who = U.pickW(D.on, c => 0.4 + c.posN * 0.3 + (100 - c.r.perD) / 100);
    D.techs = (D.techs || 0) + 1;
    if (!ctx.P.play || ctx.P.play === 'none') { ctx.P.play = info.play; ctx.P.setName = info.setName || ''; }
    evAt(ctx, ctx.t, 'foul', { fouler: who.id, on: null, kind: 'def3', fts: 1, tech: true, team: D.idx, text: `Defensive 3 seconds on ${who.last}: technical foul` });
    const sh = U.maxBy(O.on, c => c.r.ft + U.rand() * 3);
    const made = U.chance(ftProb(ctx, sh));
    sh.st.fta++;
    if (made) { sh.st.ftm++; sh.st.pts++; }
    evAt(ctx, ctx.t, 'ft', { shooter: sh.id, made, num: 1, of: 1, tech: true, team: O.idx, text: `${sh.last} ${made ? 'makes' : 'misses'} the technical free throw` });
    if (made) addPoints(ctx, O.idx, 1);
    // the offense keeps it
    const bx = basketX(O.idx, g.period), dir = dirX(O.idx, g.period);
    const ie = ev(ctx, 'inbound', { by: pickInbounder(O, ctx.handler).id, to: ctx.handler.id, spot: 'sideline', x: U.round(bx - dir * 13.75, 1), y: U.chance(0.5) ? -1 : 51, team: O.idx });
    const scLeft = ctx.scStart + ctx.scLen - ctx.t;
    ctx.scStart = ctx.t; ctx.scLen = Math.max(L.orebShotClock, Math.min(L.shotClock, scLeft));
    ctx.advT = ctx.t; ctx.newPlay = true; ctx.transition = false; ctx.putbackBy = null;
    ctx.inbound = { kind: 'sideline', ev: ie };
  }

  function heave(ctx) {
    const g = ctx.g, O = ctx.O;
    const sh = ctx.handler;
    const plan = { branch: 'heave', shooter: sh, assister: null, zone: 'ab3', kind: 'heave', cKey: 'lastShot', passKind: null };
    const info = mkInfo(ctx.transition ? 'transition' : 'none', '', sh);
    const tNow = ctx.t;
    ctx.t = Math.max(0.2, g.clock - U.range(0.1, 0.45));
    // (not before the ball is in his hands: a heave drawn ahead of the throw-in or the advance, in a live game's events)
    if (!g.lite && ctx.t < tNow) ctx.t = Math.min(g.clock, tNow + 0.05);
    takeShot(ctx, info, ctx.t, 'lastShot', {}, plan);
  }

  // ---- main loop ----
  function runSegments(ctx, opts) {
    let guard = 0;
    while (!ctx.done && !ctx.pendingShot && guard++ < 14) segment(ctx, opts);
    if (!ctx.done && !ctx.pendingShot) { // safety: end possession with a turnover (shot clock)
      turnover(ctx, mkInfo('none', '', ctx.handler), Math.min(ctx.g.clock, ctx.t + 1), 'shot_clock');
    }
  }

  function lateMode(ctx, clockLeft, scLeft) {
    const g = ctx.g, L = g.L;
    const isEnd = g.period >= L.periods;
    const lead = g.score[ctx.O.idx] - g.score[ctx.D.idx];
    if (clockLeft <= scLeft + 0.3) {
      if (isEnd && lead > 0) return 'milk';
      return 'lastShot';
    }
    if (isEnd && clockLeft < 40 && lead < 0 && lead >= -3) return lead === -3 ? 'hurry3' : 'quick';
    if (isEnd && clockLeft < 75 && lead < -3) return lead >= -9 ? 'hurry3' : 'quick';
    if (!isEnd && clockLeft > 28 && clockLeft < 38) return 'twoForOne';
    return 'normal';
  }

  function shouldFoul(ctx, clockLeft, scLeft) {
    const g = ctx.g;
    if (g.period < g.L.periods) return false;
    const deficit = g.score[ctx.O.idx] - g.score[ctx.D.idx];
    if (deficit <= 0) return false;
    if (deficit >= 4 && deficit <= 9 && clockLeft <= 50) return true;
    if (deficit <= 3 && clockLeft <= scLeft + 0.3 && clockLeft <= 24) return deficit === 3 ? ctx.foulUp3 != null ? ctx.foulUp3 : (ctx.foulUp3 = U.chance(PBC.Adjust ? PBC.Adjust.foulUp3P(g, ctx.D) : 0.25)) : true;
    return false;
  }

  function segment(ctx, opts) {
    const g = ctx.g, O = ctx.O, D = ctx.D;
    const clockLeft = g.clock - ctx.t;
    if (clockLeft <= 0.1) { endPeriod(ctx); return; }
    const scLeft = ctx.scStart + ctx.scLen - ctx.t;
    const mode = lateMode(ctx, clockLeft, scLeft);
    // (a poor free throw shooter fouled on purpose, away from the ball, as the offense sets up: js/core/adjust.js)
    if (!ctx.gimForced && ctx.segN === 0 && D.adj && D.adj.hack && !ctx.transition) { const c = PBC.Adjust.hackNow(ctx); if (c) { hackFoul(ctx, c); return; } }
    if (!ctx.gimForced && shouldFoul(ctx, clockLeft, scLeft)) { intentionalFoul(ctx, clockLeft); return; }
    if (mode === 'milk') {
      // defense not fouling → run out the clock
      if (clockLeft <= scLeft + 0.3) {
        ctx.t = g.clock;
        endPeriod(ctx);
        return;
      }
    }
    let info;
    if (ctx.putbackBy) info = mkInfo('putback', '', ctx.putbackBy);
    else if (ctx.newPlay || !ctx.info) info = choosePlay(ctx, mode, opts);
    else info = ctx.info;
    ctx.info = info; ctx.newPlay = false;
    // (the action time is drawn once: by the play call when there was one, so a possession played in flow keeps the
    // time drawn for it and the calls do not bend the league's shot timing)
    let tAct;
    if (info.pb && info.pb.tAct != null) { tAct = info.pb.tAct; info.pb.tAct = null; }
    else if (ctx.tActPre != null && info.play !== 'putback' && info.play !== 'transition') tAct = ctx.tActPre;
    else tAct = actionTime(ctx, info, mode, clockLeft, scLeft);
    ctx.tActPre = null;
    // (a quick hitter off an inbound: the catch and the shot)
    if (info.pb && info.pb.inbound) tAct = Math.min(tAct, ctx.t + U.range(0.9, 1.9), ctx.g.clock - 0.05);
    ctx.segN++;
    if (ctx.gimForced) { takeShot(ctx, info, tAct, mode, opts); return; }
    const pTO = toProb(ctx, info) * (tAct - ctx.t < 1 ? 0.3 : 1);
    if (U.chance(pTO)) { turnover(ctx, info, U.range(ctx.t + (tAct - ctx.t) * 0.3, tAct)); return; }
    if (info.play !== 'putback' && U.chance(nsFoulProb(ctx))) { nonShootingFoul(ctx, info, U.range(ctx.t + (tAct - ctx.t) * 0.2, tAct)); return; }
    if (info.play !== 'putback' && info.play !== 'transition' && tAct - ctx.t > 3.5 && U.chance(def3Prob(ctx))) { defensiveThree(ctx, info, U.range(ctx.t + 3, tAct - 0.3)); return; }
    takeShot(ctx, info, tAct, mode, opts);
  }

  function actionTime(ctx, info, mode, clockLeft, scLeft) {
    const g = ctx.g, O = ctx.O, D = ctx.D;
    const paceAdj = C.TEMPOS[O.strat.tempo].pace + (C.OFFENSES[O.strat.off].mods.pace || 0) + (C.DEFENSES[D.strat.def].mods.pace || 0) * 0.6;
    let dt;
    if (info.play === 'putback') dt = U.range(0.4, 1.5);
    else if (info.play === 'transition') dt = U.range(0.8, 2.6);
    else {
      // (a reset shot clock, 14 s after an offensive rebound: the offense times its shot to the clock it has, instead
      // of aiming at the full clock's ~13.6 s and ending up forcing half of them at the buzzer)
      const k = U.clamp(ctx.scLen / (g.L.shotClock || 24), 0.4, 1);
      const mean = (((g.L.key === 'women' ? Sim.K.shotTimeW : Sim.K.shotTime) - paceAdj * 0.36) * g.timeMult + 0.45 * Math.min(1.5, g.intensity)) * k;
      const target = U.clamp(U.gauss(mean, 3.7 * g.timeMult * k), 2.5, ctx.scLen - 0.3);
      dt = Math.max(ctx.scStart + target - ctx.t, U.range(1.6, 3.2));
    }
    if (ctx.early && ctx.segN === 0 && info.play !== 'putback') dt = Math.min(dt, U.range(2.5, 6.5));
    if (mode === 'hurry3' || mode === 'quick') dt = Math.min(dt, U.range(2.2, mode === 'quick' ? 7 : 5));
    else if (mode === 'twoForOne') dt = Math.min(dt, Math.max(1.5, clockLeft - 30 + U.range(-3, 0)));
    else if (mode === 'lastShot') dt = Math.max(0.3, clockLeft - U.range(0.6, 3.2));
    dt = Math.min(dt, scLeft - 0.15, clockLeft - 0.05);
    dt = Math.max(Math.min(0.3, clockLeft * 0.5), dt);
    return ctx.t + dt;
  }

  function toProb(ctx, info) {
    const g = ctx.g, O = ctx.O, D = ctx.D;
    if (info.play === 'putback') return 0.025;
    let p = g.L.key === 'women' ? Sim.K.toW : Sim.K.to;
    if (info.play === 'transition') p += 0.02;
    const h = info.handler || ctx.handler;
    const skill = h.r.handle * 0.45 + h.r.pass * 0.3 + h.r.shotIQ * 0.25;
    p *= Math.pow(0.978, (skill - 75) / 2);
    p *= Math.pow(1.028, (avgOn(D, 'steal') - 62) / 2);
    p *= C.OFFENSES[O.strat.off].mods.to || 1;
    // (a trap or a hedge forces turnovers on the ball screens it is played on, not on every trip: toOn)
    { const dm = C.DEFENSES[D.strat.def].mods; if (dm.to && (!dm.toOn || dm.toOn[info.play])) p *= dm.to; }
    p *= C.PRESSURE[D.strat.pressure].stl;
    p *= { vslow: 0.92, slow: 0.96, normal: 1, fast: 1.05, vfast: 1.1 }[O.strat.tempo] || 1;
    p *= 1 + (1 - avgEnergy(O) / 100) * 0.25;
    if (ctx.press && ctx.segN === 0) p *= 1.25;
    if (ctx.segN > 0) p *= 0.72;
    const fit = offenseFit(O);
    p *= 1 - fit * 0.07;
    // sliders (turnovers, steals, user ball security), form, playoff focus; defenders who gamble force more
    p *= g.toMult[O.idx] * Math.exp(0.25 * avgDev(D, 'gamble'));
    const exPress = coastExcess(g, g.score[D.idx] - g.score[O.idx]); // a defense up big stops pressing and gambling
    if (exPress > 2) p *= 1 - Math.min(0.3, (exPress - 2) * 0.011) * Sim.K.coast;
    return U.clamp(p, 0.03, 0.32 * Math.max(1, g.sl.to));
  }

  function nsFoulProb(ctx) {
    const D = ctx.D, g = ctx.g;
    let p = (ctx.g.L.key === 'women' ? 0.06 : 0.056) * Sim.K.nsfoul;
    p *= C.DEFENSES[D.strat.def].mods.foul || 1;
    p *= C.PRESSURE[D.strat.pressure].foul;
    p *= Math.pow(0.985, (avgOn(D, 'helpD') - 64) / 2);
    p *= g.sl.nsfoul * (1 + 0.1 * Math.min(1.5, g.intensity)) * Math.exp(0.3 * avgDev(D, 'foul') + 0.2 * avgDev(D, 'gamble'));
    return p;
  }

  function offenseFit(T) {
    const need = C.OFFENSES[T.strat.off].mods.needs;
    if (!need) return 0;
    let v;
    if (need === 'three') v = (avgOn(T, 'three') - 68) / 8;
    else if (need === 'iq') v = ((avgOn(T, 'shotIQ') + avgOn(T, 'vision') + avgOn(T, 'pass')) / 3 - 66) / 7;
    else if (need === 'post') v = (Math.max(...T.on.map(c => c.r.post)) - 72) / 8;
    else if (need === 'speed') v = (avgOn(T, 'speed') - 72) / 7;
    return U.clamp(v, -1, 1);
  }
  function defenseFit(T) { return defenseFitOf(T, T.strat.def); }
  /** how well a lineup fits a scheme's needs (-1..1), for any scheme (the coaches' adjustments weigh their options) */
  function defenseFitOf(T, def) {
    const need = C.DEFENSES[def] && C.DEFENSES[def].mods.needs;
    if (!need) return 0;
    if (need === 'versatile') return U.clamp((Math.min(...T.on.map(c => c.r.perD)) - 52) / 10, -1, 1);
    if (need === 'rim') return U.clamp((Math.max(...T.on.map(c => c.r.block)) - 74) / 8, -1, 1);
    if (need === 'mobile') {
      // (hedging: the bigs on the floor have to get out to the ball and back; small-ball lineups use their two tallest)
      const bigs = U.sortBy(T.on, c => c.hgt || c.posN * 2 + 76, true).slice(0, 2);
      return U.clamp((Math.min(...bigs.map(c => (c.r.speed + c.r.agility) / 2)) - 58) / 8, -1, 1);
    }
    return 0;
  }

  // ---- choose play & actors ----
  /** a play in the engine: its type, name and actors (one object shape for every kind, the hot paths read it) */
  function mkInfo(play, setName, handler) {
    return { play, setName: setName || '', handler: handler || null, screener: null, poster: null, shooter: null, cutter: null, big: null, pop: false, noSet: false, pb: null };
  }
  function choosePlay(ctx, mode, opts) {
    const O = ctx.O, D = ctx.D;
    const gim = ctx.P.gim;
    if (ctx.transition && ctx.segN === 0 && !gim) {
      const handler = ctx.handler;
      return mkInfo('transition', U.pick(SET_NAMES.transition), handler);
    }
    // a throw-in in the frontcourt: the coach's inbound play (a quick hitter, or the ball in to the safety and then
    // the half-court call below)
    if (ctx.inbound) { const ib = !gim && O.pb ? pbInbound(ctx, mode) : null; ctx.inbound = null; if (ib) return ib; }
    // the coach's own call (in a timeout or from the bench): a play for the team's next half-court possessions
    if (O.userCall && O.pb && !gim && !ctx.userCalled) { const called = pbUserCall(ctx, mode); if (called) return called; }
    const off = C.OFFENSES[O.strat.off];
    const w = Object.assign({}, off.plays);
    const on = O.on;
    const avg3 = avgOn(O, 'three');
    const handlerW = c => usageW(ctx, c) * Math.pow(c.r.handle / 70, 1.5) * (c.posN <= 2 ? 1 : c.posN === 3 ? 0.55 : 0.12);
    // the five on the floor bend the system toward what they like to do (tendencies; 1.0 for generated ones)
    const wavg = (wf, vf) => { let s = 0, n = 0; for (const c of on) { const x = wf(c); s += x * vf(c); n += x; } return n > 0 ? s / n : 1; };
    w.post *= Math.max(...on.map(c => U.clamp((c.r.post - 58) / 18, 0.25, 1.6) * c.tn.f.postTeam));
    w.spot *= U.clamp((avg3 - 58) / 14, 0.5, 1.5);
    w.cut *= U.clamp((avgOn(O, 'speed') - 60) / 14, 0.6, 1.4);
    w.iso *= wavg(c => usageW(ctx, c), c => c.tn.f.isoTeam);
    w.pnr *= wavg(handlerW, c => c.tn.f.pnrTeam);
    const dm = C.DEFENSES[D.strat.def].mods;
    if (dm.isZone) { w.iso *= 0.7; w.pnr *= 0.8; w.spot *= 1.35; w.post *= 1.1; w.cut *= 0.8; }
    if (D.strat.def === 'switch') { w.iso *= 1.25; w.post *= 1.15; }
    // what is working this game: the coach leans on the kinds of action that have been scoring
    if (O.pb && !gim) for (const k in w) w[k] *= PBC.PlayCall.familyBoost(ctx.g, O, k);
    let play = gim ? gim.play : U.pickKey(w);
    if (mode === 'hurry3' && !gim) play = U.pickKey({ pnr: 30, spot: 40, offscreen: 20, iso: 10 });
    // the coach calls a play from the playbook for that kind of action (or it is played in flow: below)
    if (O.pb && !gim) { const called = pbCall(ctx, play, mode); if (called) return called; }
    const info = mkInfo(play, '');
    const pickFrom = (list, fn) => U.pickW(list, c => Math.max(0.0001, fn(c)));
    const others = arr => on.filter(c => !arr.includes(c));
    switch (play) {
      case 'pnr': {
        const pnrW = c => handlerW(c) * c.tn.f.pnr;
        info.handler = gim && gim.handler ? on.find(c => c.id === gim.handler) || pickFrom(on, pnrW) : pickFrom(on, pnrW);
        const bigs = others([info.handler]);
        info.screener = gim && gim.screener ? on.find(c => c.id === gim.screener) || bigs[0] : pickFrom(bigs, c => Math.pow(c.posN, 1.8) * (c.r.strength / 70));
        info.pop = info.screener.r.three >= 70 && U.chance(0.25 + (info.screener.r.three - 70) / 60);
        info.setName = U.pick(info.pop ? SET_NAMES.pop : SET_NAMES.pnr);
        break;
      }
      case 'iso': {
        info.handler = gim && gim.shooter ? on.find(c => c.id === gim.shooter) : pickFrom(on, c => Math.pow(usageW(ctx, c), 1.25) * (c.posN <= 3 ? 1 : 0.55) * c.tn.f.iso);
        info.setName = U.pick(SET_NAMES.iso);
        break;
      }
      case 'post': {
        info.poster = gim && gim.shooter ? on.find(c => c.id === gim.shooter) : pickFrom(on, c => Math.pow(c.r.post / 60, 2.5) * (c.posN >= 3 ? 1 : 0.3) * usageW(ctx, c) * c.tn.f.post);
        info.handler = pickFrom(others([info.poster]), c => c.r.pass * (c.posN <= 3 ? 1 : 0.3));
        info.setName = U.pick(SET_NAMES.post);
        break;
      }
      case 'spot': {
        info.handler = pickFrom(on, handlerW);
        info.setName = U.pick(SET_NAMES.spot);
        break;
      }
      case 'offscreen': {
        info.handler = pickFrom(on, handlerW);
        info.shooter = gim && gim.shooter ? on.find(c => c.id === gim.shooter) : pickFrom(others([info.handler]), c => Math.pow(Math.max(c.tn.x3, c.tn.xMid) / 65, 5) * usageW(ctx, c) * (c.posN <= 3 ? 1 : 0.3));
        info.screener = pickFrom(others([info.handler, info.shooter]), c => c.posN);
        info.setName = U.pick(SET_NAMES.offscreen);
        break;
      }
      case 'handoff': {
        info.big = pickFrom(on, c => (c.posN >= 4 ? 1 : 0.1) * c.r.pass);
        info.handler = pickFrom(others([info.big]), c => usageW(ctx, c) * (c.posN <= 3 ? 1 : 0.2));
        info.setName = U.pick(SET_NAMES.handoff);
        break;
      }
      case 'cut': {
        info.handler = pickFrom(on, c => c.r.pass * c.r.vision / 100 * (c.posN <= 2 ? 1.3 : c.posN >= 5 ? 0.9 : 0.7));
        info.cutter = pickFrom(others([info.handler]), c => Math.pow((c.r.layup + c.r.dunk + c.r.speed) / 3 / 65, 4) * usageW(ctx, c) * c.tn.f.cut);
        info.setName = U.pick(SET_NAMES.cut);
        break;
      }
      default: {
        info.play = 'spot';
        info.handler = pickFrom(on, handlerW);
        info.setName = U.pick(SET_NAMES.spot);
      }
    }
    if (!info.handler) info.handler = ctx.handler;
    return info;
  }

  // ---- playbook plays (js/core/playbook.js; the coach's call: js/core/playcall.js) ----
  // A called play keeps the engine's shot model: its reads end in the same families and branches the league is
  // calibrated on (a pick-and-roll read is a pnr handler / roller / kick shot, an off-screen read an offscreen shot).
  // What the play adds: who fills each role (the primary by the usage weights the engine always used, the rest by how
  // their ratings fit the roles), the defense's reactions and the read they open, and the steps the court acts out.
  const handlerWOf = (ctx, c) => usageW(ctx, c) * Math.pow(c.r.handle / 70, 1.5) * (c.posN <= 2 ? 1 : c.posN === 3 ? 0.55 : 0.12);
  /** hunting the mismatch against a switching defense: scorers who have a weak defender to go at */
  function mismatchK(ctx, c) {
    const D = ctx.D;
    if (D.strat.def !== 'switch' || !D.on.length) return 1;
    const weak = Math.min(...D.on.map(d => d.r.perD));
    return 1 + U.clamp((scoreSkill(c.r) - weak - 5) / 40, 0, 0.5);
  }
  function pbPickPrimary(ctx, play) {
    const on = ctx.O.on;
    const W = fn => U.pickW(on, c => Math.max(0.0001, fn(c)));
    switch (play.pick) {
      case 'pnr': return W(c => handlerWOf(ctx, c) * c.tn.f.pnr);
      case 'iso': return W(c => Math.pow(usageW(ctx, c), 1.25) * (c.posN <= 3 ? 1 : 0.55) * c.tn.f.iso * mismatchK(ctx, c));
      case 'post': return W(c => Math.pow(c.r.post / 60, 2.5) * (c.posN >= 3 ? 1 : 0.3) * usageW(ctx, c) * c.tn.f.post * mismatchK(ctx, c));
      case 'shooter': return W(c => Math.pow(Math.max(c.tn.x3, c.tn.xMid) / 65, 5) * usageW(ctx, c) * (c.posN <= 3 ? 1 : 0.3));
      case 'dho': return W(c => usageW(ctx, c) * (c.posN <= 3 ? 1 : 0.2));
      case 'cutter': return W(c => Math.pow((c.r.layup + c.r.dunk + c.r.speed) / 3 / 65, 4) * usageW(ctx, c) * c.tn.f.cut);
      default: return W(c => handlerWOf(ctx, c));
    }
  }
  function pbFit(ctx, c, prof) {
    // (cached on the game's player object: ratings do not change during a game)
    const fc = c.pbFit || (c.pbFit = {});
    const v = fc[prof];
    return v != null ? v : (fc[prof] = PBC.Playbook.fit(c, prof));
  }
  /** the other roles by the best fit of ratings to roles (kept while the lineup is the same) */
  /** the role fits of the five on the floor, kept until the lineup changes (a sub, a foul-out, an injury) */
  function lineupCache(T) {
    const v = T.lineupV || 0;
    if (!T.pb.lc || T.pb.lcV !== v) {
      // (lineups come back during a game: the fits are kept by the five, in any order)
      const players = T.on.slice().sort((a, b) => a.id - b.id);
      const key = players.map(c => c.id).join(',');
      const all = T.pb.lcAll || (T.pb.lcAll = {});
      T.pb.lc = all[key] || (all[key] = { fit: {}, fill: {}, rows: {}, players });
      T.pb.lcV = v;
    }
    return T.pb.lc;
  }
  /** one role profile's fit for each of the five (in the lineup cache's order) */
  function lineupRow(ctx, lc, prof) {
    return lc.rows[prof] || (lc.rows[prof] = lc.players.map(c => pbFit(ctx, c, prof)));
  }
  function pbFill(ctx, play, primary) {
    const O = ctx.O;
    const key = play.id + '|' + primary.id;
    const lc = lineupCache(O), cache = lc.fill;
    if (cache[key]) return cache[key];
    const pi = lc.players.indexOf(primary);
    const roles = play._others || (play._others = Object.keys(play.roles).filter(r => r !== play.primary));
    const a = pi >= 0 ? PBC.Playbook.assignF(roles.map(r => lineupRow(ctx, lc, play.roles[r])), lc.players.length, 1 << pi) : null;
    const out = { [play.primary]: primary };
    const rest = lc.players.filter(c => c !== primary);
    roles.forEach((r, i) => { out[r] = a ? lc.players[a.idx[i]] : rest[i]; });
    const fit = ((a ? a.total : 0) + pbFit(ctx, primary, play.roles[play.primary])) / (roles.length + 1);
    return (cache[key] = { roles: out, fit });
  }
  function pbSituation(ctx, mode, tAct) {
    const D = ctx.D, P = ctx.P;
    const t0 = Math.max(ctx.t, ctx.advT || 0);
    const early = ctx.segN === 0 && !ctx.resets && (P.start === 'dreb' || P.start === 'steal' || P.start === 'made_basket' || P.start === 'ft_made') && tAct != null && tAct - t0 < 5.5;
    return { mode, ato: !!ctx.timeoutCalled && !ctx.pbCalls, early, zone: !!C.DEFENSES[D.strat.def].mods.isZone, cov: PBC.PlayCall.coverage(D), second: (ctx.resets || 0) > 0 };
  }
  /** the call: a play of that kind of action (or one the situation asks for) for the five on the floor */
  function pbCall(ctx, family, mode) {
    const O = ctx.O, g = ctx.g, bk = O.pb;
    if (!bk || O.on.length !== 5) return null;
    const clockLeft = g.clock - ctx.t, scLeft = ctx.scStart + ctx.scLen - ctx.t;
    const tAct = ctx.tActPre = actionTime(ctx, { play: family }, mode, clockLeft, scLeft);
    const sit = pbSituation(ctx, mode, tAct);
    // some possessions are played in flow, without a call
    const live = ctx.P.start === 'dreb' || ctx.P.start === 'steal';
    if (mode === 'normal' && !sit.ato && !sit.early && U.chance(PBC.PlayCall.flowShare(O, sit.second, live))) return null;
    const ck = family + '|' + mode + '|' + (sit.ato ? 1 : 0) + (sit.early ? 1 : 0) + (sit.zone ? 1 : 0);
    const cc = bk.candCache || (bk.candCache = {});
    let ok = cc[ck];
    if (!ok) {
      const seen = {}, list = [];
      const add = p => { if (!seen[p.id]) { seen[p.id] = 1; list.push(p); } };
      for (const p of bk.byBase[family] || []) add(p);
      for (const p of bk.plays) {
        const t = p.tags;
        if ((mode === 'lastShot' && t.includes('eog')) || (mode === 'hurry3' && (t.includes('need3') || t.includes('three'))) || (mode === 'twoForOne' && t.includes('twoForOne')) || (sit.ato && t.includes('ato'))) add(p);
      }
      ok = cc[ck] = list.filter(p => {
        const t = p.tags;
        if (p.family === 'blob' || p.family === 'slob') return false;
        if (p.family === 'zone' && !sit.zone) return false;
        if (t.includes('half') || t.includes('zone')) return true;
        // the special-situation sets only in their situation
        return (t.includes('eog') && mode === 'lastShot') || (t.includes('need3') && mode === 'hurry3') || (t.includes('ato') && sit.ato) ||
          (t.includes('early') && (sit.early || mode === 'quick')) || (t.includes('twoForOne') && mode === 'twoForOne');
      });
    }
    if (!ok.length) return null;
    const c = pbChoose(ctx, ok, sit);
    if (!c) return null;
    const info = pbInfo(ctx, c, sit);
    info.pb.tAct = tAct; info.pb.tAct0 = tAct;
    return info;
  }
  /**
   * The head coach's own call (Sim.callPlay): the play runs this possession whatever the staff would have called, for
   * the number of half-court possessions asked for (a possession's first action; a second action after a reset is
   * the staff's again). The roles are filled the usual way: the player it is run for by the engine's usage weights,
   * the rest by fit.
   */
  function pbUserCall(ctx, mode) {
    const O = ctx.O, g = ctx.g, uc = O.userCall;
    const play = PBC.Playbook.get(uc.id);
    if (!play || play.inbound || O.on.length !== 5) { O.userCall = null; return null; }
    const family = PBC.PlayCall.baseOf(play);
    const clockLeft = g.clock - ctx.t, scLeft = ctx.scStart + ctx.scLen - ctx.t;
    const tAct = ctx.tActPre = actionTime(ctx, { play: family }, mode, clockLeft, scLeft);
    const sit = pbSituation(ctx, mode, tAct);
    const c = pbChoose(ctx, [play], sit);
    if (!c) return null;
    c.why = ['called by the coach'];
    ctx.userCalled = true;
    uc.left--;
    if (uc.left <= 0) O.userCall = null;
    const info = pbInfo(ctx, c, sit);
    info.pb.rec.user = true;
    info.pb.tAct = tAct; info.pb.tAct0 = tAct;
    ctx.P.userCall = play.id;
    return info;
  }
  /** the coach's pick among plays (scored on the lineup's best fit), then who it is run for and who fills the rest */
  function pbChoose(ctx, plays, sit) {
    const O = ctx.O, lc = lineupCache(O);
    const lf = lc.fit;
    const cands = plays.map(play => {
      let f = lf[play.id];
      if (f == null) {
        const pr = play._profs || (play._profs = Object.keys(play.roles).map(r => play.roles[r]));
        const a = PBC.Playbook.assignF(pr.map(pf => lineupRow(ctx, lc, pf)), lc.players.length);
        const fit = a ? a.total / pr.length : 60;
        f = lf[play.id] = { fit, k: Math.pow(U.clamp(fit, 35, 95) / 65, 2.5) };
      }
      return { play, fit: f.fit, fitK: f.k };
    });
    const c = PBC.PlayCall.pick(ctx.g, O, cands, sit);
    if (!c) return null;
    c.primary = pbPickPrimary(ctx, c.play);
    const fill = pbFill(ctx, c.play, c.primary);
    c.roles = fill.roles; c.fit = fill.fit;
    return c;
  }
  function pbInfo(ctx, c, sit) {
    const play = c.play, R = c.roles;
    const info = mkInfo(PBC.PlayCall.baseOf(play), play._up || (play._up = play.name.toUpperCase()));
    for (const k in play.map) if (R[play.map[k]]) info[k] = R[play.map[k]];
    if (!info.handler) info.handler = R.ball || ctx.handler;
    const g = ctx.g;
    const rec = {
      id: play.id, name: play.name, family: play.family, base: info.play, fit: U.round(c.fit, 1), why: (c.why || []).slice(0, 3),
      roles: {}, ato: !!sit.ato, mode: sit.mode, opt: null, optI: -1, at: -1, step: -1, last: play.last, early: false, end: null,
      cov: null, s0: g.score[ctx.O.idx], pts: 0, t: U.round(ctx.t, 2),
      // (play tracking: clutch time, and the shot, the shot clock and the breakdown, filled in as the play goes;
      // every field declared here so the records keep one shape)
      cl: g.period >= g.L.periods && g.clock - ctx.t <= 300 && Math.abs(g.score[0] - g.score[1]) <= 5,
      sc: null, q: null, xp: 0, made: false, fouledShot: false, zone: null, away: null, ctr: false,
      tok: null, toScr: false, passStep: false, out: null, done: false, brk: null, spts: 0,
      // (a live game's look taken before the play could be run: Sim.K.look*)
      look: false,
    };
    for (const r in R) rec.roles[r] = R[r].id;
    info.pb = { play, roles: R, side: U.chance(0.5) ? 1 : -1, sit, rec, t0: Math.max(ctx.t, ctx.advT || 0), tAct: null, tAct0: null };
    ctx.P.pbs.push(rec);
    ctx.pbCalls = (ctx.pbCalls || 0) + 1;
    return info;
  }
  /**
   * The defense's reactions on this call: its pick-and-roll coverage (the scheme's, or the playbook's within man),
   * how the shooter's man plays off-ball screens (trail, under, top-lock, switch), whether help comes on the drive,
   * denial on the wings, a double team on the post, a zone.
   */
  function pbReactions(ctx, info) {
    const D = ctx.D, sch = D.strat.def;
    const zone = !!C.DEFENSES[sch].mods.isZone;
    let cov = zone ? 'zone' : PBC.PlayCall.coverage(D);
    // (most teams switch a guard's ball screen far more often than a big's, and switch more late in the clock)
    if (!zone && cov !== 'switch' && sch !== 'blitz' && sch !== 'hedge' && sch !== 'drop') {
      const scLeft = ctx.scStart + ctx.scLen - ctx.t;
      if ((info.screener && info.screener.posN <= 2 && U.chance(0.4)) || (scLeft < 7 && U.chance(0.25))) cov = 'switch';
    }
    const sh = info.shooter || info.cutter;
    let ob = null;
    if (!zone) {
      if (sch === 'switch') ob = U.chance(0.8) ? 'obswitch' : 'trail';
      else if (sch === 'nothree' || sch === 'pressure') ob = U.chance(0.6) ? 'top' : 'trail';
      else {
        const d = sh ? matchupDefender(D, sh, ctx) : null;
        const t3 = sh ? sh.r.three : 70, dq = d ? (d.r.perD + d.r.agility) / 2 : 65;
        ob = t3 < 62 ? (U.chance(0.7) ? 'under' : 'trail') : U.pickKey({ trail: Math.max(5, 40 + (dq - 65)), under: Math.max(5, 25 - (t3 - 70) * 0.8), top: 10, obswitch: 8 });
      }
    }
    const drv = info.handler;
    const threat = drv ? scoreSkill(drv.r) / 72 : 1;
    const helpK = { packline: 1.4, zone23: 1.3, zone32: 1.1, zone131: 1.1, boxone: 1.2, nothree: 0.75, switch: 0.85 }[sch] || 1;
    const help = U.chance(U.clamp(0.45 * threat * threat * helpK * (avgOn(D, 'helpD') / 64), 0.1, 0.85));
    const deny = U.chance(sch === 'pressure' ? 0.55 : sch === 'nothree' ? 0.35 : sch === 'press' ? 0.3 : 0.1);
    const post = info.poster;
    const double = post ? U.chance(U.clamp(0.15 * Math.pow(post.r.post / 72, 4) * (zone ? 0.6 : 1), 0.02, 0.5)) : false;
    return { cov, ob, help, deny, double, zone };
  }
  const RX_WORD = {
    drop: 'the big dropped', show: 'the big showed', hedge: 'the big hedged', blitz: 'they blitzed the ball', switch: 'they switched', ice: 'they iced it',
    zone: 'the zone', trail: 'his man trailed', under: 'his man went under', top: 'his man top-locked', obswitch: 'they switched the screen',
    help: 'the help came', deny: 'they denied the pass', double: 'they doubled the post',
  };
  /** how open a read is against these reactions (and the decision maker's own habits: keep it or move it) */
  function pbOptW(ctx, pb, o, rx) {
    let w = o.w;
    const tr = o.trig;
    if (tr) {
      if (rx.zone) { if (tr.zone) w *= tr.zone; }
      else if (tr[rx.cov]) w *= tr[rx.cov];
      if (rx.ob && tr[rx.ob]) w *= tr[rx.ob];
      if (rx.help && tr.help) w *= tr.help;
      if (rx.deny && tr.deny) w *= tr.deny;
      if (rx.double && tr.double) w *= tr.double;
    }
    const R = pb.roles;
    const who = Array.isArray(o.who) ? null : R[o.who];
    const from = o.from ? R[o.from] : null;
    const f = (from || who) && (from || who).tn ? (from || who).tn.f : null;
    if (f && !o.safety) {
      if (from && o.br !== 'shooter') w *= f.passOut;
      else if (o.br === 'handler' || o.br === 'receiver') w *= f.keep * f.pull;
      else if (o.br === 'self') w *= f.keep;
      else if (o.br === 'shooter' && who && who.tn) w *= who.tn.f.keep;
    }
    return w;
  }
  /** the triggers of a read that fired (for the play log and the debug view) */
  function pbWhy(o, rx) {
    const out = [];
    const tr = o.trig || {};
    const on = k => { if (tr[k] && tr[k] > 1.05) out.push(RX_WORD[k] || k); };
    if (rx.zone) on('zone'); else on(rx.cov);
    if (rx.ob) on(rx.ob);
    if (rx.help) on('help');
    if (rx.deny) on('deny');
    if (rx.double) on('double');
    return out;
  }
  const KICK_T = {
    pnr: { c3: 36, ab3: 48, mid: 8, rim: 8 }, iso: { c3: 40, ab3: 50, rim: 10 }, post: { c3: 40, ab3: 48, mid: 7, rim: 5 },
    handoff: { c3: 40, ab3: 45, mid: 10, rim: 5 },
  };
  /** the read: which option, who shoots, who passes, and the shot model of that branch */
  function pbPlan(ctx, info, mode, force3) {
    const pb = info.pb, play = pb.play, R = pb.roles, rec = pb.rec;
    const rx = pb.rx || (pb.rx = pbReactions(ctx, info));
    let o = pb.preset;
    if (!o) o = U.pickW(play.opts.filter(x => !x.safety), x => Math.max(1e-4, pbOptW(ctx, pb, x, rx)));
    pb.opt = o;
    info.play = o.base;
    const from = o.from ? R[o.from] : null;
    let shooter;
    if (Array.isArray(o.who)) {
      const cands = o.who.map(r => R[r]).filter(c => c && c !== from);
      shooter = !cands.length ? null : o.br === 'drive' ? U.pickW(cands, c => usageW(ctx, c)) : U.pickW(cands, c => Math.pow(U.clamp((c.tn.x3 - 35) / 35, 0.05, 2), 3) * Math.sqrt(usageW(ctx, c)));
    } else shooter = R[o.who];
    if (!shooter) shooter = info.handler || ctx.handler;
    let assister = from && from !== shooter ? from : null, base, hint, cKey, lob = false, passKind = null;
    switch (o.base + ':' + o.br) {
      case 'pnr:handler': base = { rim: 30, paint: 21, mid: 20, c3: 1, ab3: 28 }; hint = 'offDribble'; cKey = 'pnr_handler'; assister = null; break;
      case 'pnr:roller':
        cKey = 'roller';
        if (o.pop) { base = { mid: 25, ab3: 68, c3: 7 }; hint = 'catch'; passKind = 'kick'; }
        else { base = { rim: 80, paint: 17, mid: 3 }; hint = 'roll'; lob = U.chance(0.3); passKind = lob ? 'lob' : 'bounce'; }
        if (!assister) assister = info.handler !== shooter ? info.handler : null;
        break;
      case 'iso:self': base = { rim: 30, paint: 15, mid: 27, ab3: 28 }; hint = 'iso'; cKey = 'iso'; assister = null; break;
      case 'post:self': base = { rim: 38, paint: 46, mid: 14, ab3: 2 }; hint = 'post'; cKey = 'post'; assister = U.chance(0.26) ? (from || (info.handler !== shooter ? info.handler : null)) : null; break;
      case 'spot:shooter': base = { c3: 32, ab3: 50, mid: 14, rim: 4 }; hint = 'catch'; cKey = 'spot'; passKind = 'swing'; if (!assister && info.handler !== shooter) assister = info.handler; break;
      case 'spot:drive': base = { rim: 58, paint: 26, mid: 16 }; hint = 'offDribble'; cKey = 'drive'; assister = shooter !== info.handler && U.chance(0.6 * info.handler.tn.f.assist) ? info.handler : null; break;
      case 'offscreen:shooter': base = { ab3: 56, c3: 12, mid: 30, rim: 2 }; hint = 'catch'; cKey = 'offscreen'; passKind = 'chest'; if (!assister && info.handler !== shooter) assister = info.handler; break;
      case 'offscreen:kick': base = { rim: 45, paint: 25, mid: 15, ab3: 15 }; hint = 'catch'; cKey = 'kick'; passKind = 'chest'; break;
      case 'handoff:receiver': base = { rim: 26, paint: 12, mid: 20, ab3: 42 }; hint = 'offDribble'; cKey = 'handoff'; assister = U.chance(0.5) && info.big && info.big !== shooter ? info.big : null; break;
      case 'handoff:big': base = { rim: 60, paint: 25, mid: 15 }; hint = 'roll'; cKey = 'big'; passKind = 'bounce'; if (!U.chance(0.5)) assister = null; break;
      case 'cut:cutter': base = { rim: 86, paint: 14 }; hint = 'cut'; cKey = 'cut'; lob = U.chance(0.2); passKind = lob ? 'lob' : 'bounce'; if (!assister && info.handler !== shooter) assister = info.handler; break;
      default:
        if (o.br === 'kick' && KICK_T[o.base]) { base = Object.assign({}, KICK_T[o.base]); hint = 'catch'; cKey = 'kick'; passKind = 'kick'; }
        else { base = { rim: 30, paint: 12, mid: 20, c3: 10, ab3: 28 }; hint = 'offDribble'; cKey = 'iso'; }
    }
    if (o.zk) for (const z in base) if (o.zk[z] != null) base[z] *= o.zk[z];
    const plan = planTail(ctx, mode, force3, { branch: o.br, shooter, assister, base, hint, cKey, lob, passKind, keep: true });
    rec.opt = o.label; rec.optI = play.opts.indexOf(o); rec.at = o.at; rec.early = o.at < play.last; rec.base = o.base;
    rec.cov = rx.cov; rec.read = pbWhy(o, rx); rec.shooter = plan.shooter.id;
    // where the shooter is in the play when he gets the ball (the shot goes up there)
    if (!ctx.g.lite) {
      let role = null;
      for (const r in R) if (R[r] === plan.shooter) role = r;
      let at = role ? play.align[role] : null;
      if (role) for (let k = 0; k <= o.at; k++) { const ps = play.steps[k].pos; if (ps && ps[role]) at = ps[role]; }
      if (at) plan.near = [at[0], pb.side > 0 ? at[1] : 50 - at[1]];
    }
    return plan;
  }
  /** the play's timeline: steps 0..k1 end at tEnd, the call and the set before them */
  function pbTimeline(pb, k1, tEnd) {
    const play = pb.play, t0 = pb.t0;
    let dSum = 0;
    for (let k = 0; k <= k1; k++) dSum += play.steps[k].d;
    const room = Math.max(0.2, tEnd - t0 - 0.9);
    const s = U.clamp(room / dSum, 0.2, Sim.K.playStretch);
    const tStart = Math.max(t0 + 0.2, tEnd - dSum * s);
    const T = [];
    let acc = tStart;
    for (let k = 0; k <= k1; k++) { T.push(acc); acc += play.steps[k].d * s; }
    return { s, T, tStart, tEnd: acc, tSet: Math.max(t0 + 0.05, tStart - Sim.K.playCallS) };
  }
  /**
   * Quick touches (Sim.K.flow*): from `from` at tFrom, the ball moved on from man to man, each catch read and the ball
   * passed on within a touch (now and then a hard drive at the gap and the kick out of it), ending with the ball in `to`'s
   * hands at tTo. The perimeter gets it first, the bigs less, and rarely straight back to the man who just passed it.
   * Live games only; returns who has the ball after (`from` when there is not the room). `at` ({ t, fn }): fn() is called
   * once, in time order with the touches' own events, as their time passes t (a play called while the ball is on its way).
   */
  function flowTouches(ctx, from, tFrom, tTo, to, at) {
    const g = ctx.g, O = ctx.O, idx = O.idx, K = Sim.K;
    if (g.lite || !from || !to || O.on.length < 2) return from;
    const room = tTo - tFrom;
    if (!(room >= K.flowMinS)) return from;
    const cue = (t) => { if (at && !at.done && t > at.t) { at.done = true; at.fn(); } };
    const quick = (g.sl && g.sl.quick) || 1;
    const lo = K.flowTouchS[0] / quick, hi = K.flowTouchS[1] / quick;
    let n = Math.max(1, Math.floor(room / ((lo + hi) / 2)));
    // (the ball has to end with `to`: from him and back to him takes two; with the room for one only, he keeps it and
    // attacks his man with a move instead of standing with it)
    if (to === from && n < 2) {
      const tm = U.round(tFrom + room * U.range(0.25, 0.5), 2);
      cue(tm);
      evAt(ctx, tm, 'move', { player: from.id, move: U.pick(['hesi', 'crossover', 'hesi', 'drive']), team: idx });
      return from;
    }
    const lens = [];
    let sum = 0;
    for (let i = 0; i < n; i++) { const d = U.range(lo, hi); lens.push(d); sum += d; }
    const k = room / sum;
    const W = (c, h, prev) => c === h ? 0 : (c.posN <= 3 ? 1 : c.posN === 4 ? 0.55 : 0.3) * (c === prev ? 0.35 : 1);
    let h = from, prev = null, t = tFrom, drove = false, since = 0;
    for (let i = 0; i < n; i++) {
      const last = i === n - 1;
      // (the man before the last pass is not `to` himself: the last pass goes to him)
      const r = last ? to : U.pickW(O.on, c => W(c, h, prev) * (i === n - 2 && c === to ? 0 : 1));
      const dur = lens[i] * k;
      if (!r || r === h) { t += dur; continue; }
      // a hard drive at the gap and the kick out of it, by a man who can put it on the floor
      const dk = h.posN >= 4 ? 0.25 : U.clamp(((h.r.handle + h.r.speed) / 2 - 50) / 30, 0.2, 1);
      // (more likely the longer the ball has only been swung: swing, swing, attack)
      drove = !last && dur > 1.1 && U.chance(K.flowDriveP * dk * (1 + K.flowDriveBuild * since));
      since = drove ? 0 : since + 1;
      if (drove) { const tm = U.round(t + dur * 0.3, 2); cue(tm); evAt(ctx, tm, 'move', { player: h.id, move: 'drive', team: idx }); }
      const tp = U.round(t + dur, 2);
      cue(tp);
      evAt(ctx, tp, 'pass', { from: h.id, to: r.id, kind: drove ? 'kick' : 'swing', team: idx });
      prev = h; h = r; t += dur;
    }
    return h;
  }
  const EV_FRAC = { move: 0.3, pass: 0.45, handoff: 0.6, screen: 0.6 };
  const KICKS = { kick: 1 };
  /**
   * The play on the court (live games): the call and the alignment ('set'), each step ('step': where the other roles
   * go) with its screens, passes, hand-offs and moves, then the read (the pass to the shooter, the drive). end:
   * 'shot', 'reset' (the look was passed up: steps only), or { cut: t } (a turnover or a foul stops the play at t).
   * Returns who has the ball after the steps.
   */
  function pbEvents(ctx, info, plan, tShot, end) {
    const g = ctx.g, pb = info.pb, play = pb.play, R = pb.roles, idx = ctx.O.idx;
    if (g.lite || pb.inbound) return null;
    const o = pb.opt;
    const cut = end && typeof end === 'object' ? end.cut : Infinity;
    const k1 = o ? o.at : play.last;
    const sh = plan ? plan.shooter : null, as = plan ? plan.assister : null;
    const kickFin = !!(o && as && KICKS[o.br] && o.base !== 'offscreen');
    const fin = end === 'shot' ? (kickFin ? 1.1 : as ? 0.7 : plan.zone === 'rim' || plan.zone === 'paint' ? 0.8 : 0.45) : end === 'reset' ? 0.45 : 0;
    // (not before the play's own start: a play called with a second left, at the end of a quarter, put its read ahead of the
    // ball coming up)
    const tEnd = Math.max(pb.t0 + 0.1, (typeof end === 'object' ? (end.tAct || tShot) : tShot) - fin);
    const tl = pbTimeline(pb, k1, tEnd);
    const rx = pb.rx || null;
    const mir = p => [U.round(p[0], 1), U.round(pb.side > 0 ? p[1] : 50 - p[1], 1)];
    const ids = {}, align = {};
    for (const r in R) ids[r] = R[r].id;
    for (const r in play.align) if (R[r]) align[R[r].id] = mir(play.align[r]);
    const startRole = play.start || (play.roles.ball ? 'ball' : Object.keys(play.roles)[0]);
    const first = R[startRole];
    let holder = ctx.handler;
    const tSet = U.round(Math.min(tl.tSet, cut - 0.1), 2);
    if (tSet < pb.t0) return holder;
    // (the time before the call is played as quick touches, the ball ending with the man the play starts with; the call
    // comes callPassS before the last of them, so the five go to their spots while the ball is on its way to him, instead
    // of the ball stopping for it; before a turnover or a foul too, when the play gets that far)
    const call = { t: tSet, done: false, fn: () => evAt(ctx, tSet, 'set', {
      play: info.play, setName: info.setName, handler: first ? first.id : ctx.handler.id, screener: info.screener ? info.screener.id : undefined, target: sh ? sh.id : undefined, team: idx,
      pb: { id: play.id, name: play.name, side: pb.side, roles: ids, align, cov: rx ? rx.cov : PBC.PlayCall.coverage(ctx.D), opt: o ? { label: o.label, at: o.at, i: play.opts.indexOf(o), read: pb.rec.read } : null, last: play.last, why: pb.rec.why, user: pb.rec.user ? true : undefined },
    }) };
    if (first) {
      const tf = Math.max(pb.t0, ctx.advT || 0) + U.range(Sim.K.flowLeadS[0], Sim.K.flowLeadS[1]);
      holder = flowTouches(ctx, holder, tf, Math.min(tSet + Sim.K.callPassS, tl.T[0] - 0.6, cut - 0.4), first, call);
    }
    if (!call.done) { call.done = true; call.fn(); }
    // the entry: the ball to the player the play starts with
    const tEntry = U.round((tSet + tl.T[0]) / 2, 2);
    if (first && holder && first !== holder && tEntry < cut && tl.T[0] - tSet > 0.5) { evAt(ctx, tEntry, 'pass', { from: holder.id, to: first.id, kind: 'chest', team: idx }); holder = first; }
    let lastDrive = -9;
    for (let k = 0; k <= k1; k++) {
      const Tk = tl.T[k];
      if (Tk >= cut || Tk > tEnd) break;
      const st = play.steps[k], dk = st.d * tl.s;
      const pos = {};
      if (st.pos) for (const r in st.pos) if (R[r]) pos[R[r].id] = mir(st.pos[r]);
      // (who comes off an off-ball screen in this step: he runs off it to his spot instead of walking there)
      const scr = (st.ev || []).filter(e => e[0] === 'screen' && e[3] !== 'ball' && R[e[1]] && R[e[2]] && R[e[1]] !== R[e[2]]).map(e => [R[e[1]].id, R[e[2]].id]);
      evAt(ctx, U.round(Tk, 2), 'step', { pb: play.id, k, n: play.steps.length, pos, scr, team: idx });
      // (a drawn play's events keep the order they were drawn in: evF)
      const evs = [];
      (st.ev || []).forEach((e, i) => { if (EV_FRAC[e[0]] != null) evs.push({ e, t: Tk + dk * (st.evF && st.evF[i] != null ? st.evF[i] : EV_FRAC[e[0]]) }); });
      evs.sort((a, b) => a.t - b.t);
      for (const x of evs) {
        if (x.t >= cut) break;
        const e = x.e, tt = U.round(x.t, 2);
        if (e[0] === 'screen') {
          const s = R[e[1]], u = R[e[2]];
          if (s && u && s !== u) evAt(ctx, tt, 'screen', { screener: s.id, user: u.id, kind: e[3] === 'ball' && u === holder ? 'ball' : 'off_ball', cov: e[3] === 'ball' ? (rx ? rx.cov : undefined) : (rx && rx.ob) || undefined, team: idx });
        } else if (e[0] === 'pass' || e[0] === 'handoff') {
          const f = R[e[1]], to = R[e[2]];
          if (f && to && f !== to) {
            if (holder && f !== holder && holder !== to) { evAt(ctx, U.round(Math.max(Tk, tt - 0.5), 2), 'pass', { from: holder.id, to: f.id, kind: 'chest', team: idx }); holder = f; }
            evAt(ctx, tt, e[0], e[0] === 'pass' ? { from: f.id, to: to.id, kind: e[3] || 'chest', team: idx } : { from: f.id, to: to.id, team: idx });
            holder = to;
          }
        } else if (e[0] === 'move') {
          const a = R[e[1]];
          if (a && a === holder) { evAt(ctx, tt, 'move', { player: a.id, move: e[2], team: idx }); if (e[2] === 'drive') lastDrive = x.t; }
        }
      }
    }
    if (end !== 'shot' || !sh || tEnd >= cut) return holder;
    // the read: the ball to the shooter
    const quick = (g.sl && g.sl.quick) || 1;
    const tLast = U.round(Math.max(tEnd + 0.05, tShot - Math.max(0.22, 0.45 / quick)), 2);
    if (as) {
      if (holder !== as && holder !== sh) { evAt(ctx, U.round(tEnd, 2), 'pass', { from: holder.id, to: as.id, kind: 'chest', team: idx }); holder = as; }
      if (holder === as) {
        if (kickFin && tEnd - lastDrive > 1.2) evAt(ctx, U.round(tEnd + 0.05, 2), 'move', { player: as.id, move: 'drive', team: idx });
        evAt(ctx, tLast, 'pass', { from: as.id, to: sh.id, kind: plan.passKind || 'chest', team: idx });
        holder = sh;
      }
    } else {
      if (holder !== sh) { evAt(ctx, U.round(tEnd, 2), 'pass', { from: holder.id, to: sh.id, kind: o && o.base === 'post' ? 'entry' : 'chest', team: idx }); holder = sh; }
      if (plan.kind === 'stepback') evAt(ctx, U.round(Math.max(tEnd + 0.05, tShot - 0.35), 2), 'move', { player: sh.id, move: 'stepback', team: idx });
      else if (o && o.base === 'post' && o.br === 'self') evAt(ctx, U.round(tEnd + 0.1, 2), 'move', { player: sh.id, move: 'backdown', team: idx });
      else if ((plan.zone === 'rim' || plan.zone === 'paint') && tEnd - lastDrive > 1.2) evAt(ctx, U.round(tEnd + 0.1, 2), 'move', { player: sh.id, move: 'drive', team: idx });
    }
    return holder;
  }
  /** how far the play got at time t (-1: it had not started) */
  function pbStepAt(pb, t) {
    const tl = pbTimeline(pb, pb.play.last, pb.tAct0 != null ? pb.tAct0 : t);
    let k = -1;
    for (let i = 0; i < tl.T.length; i++) if (tl.T[i] <= t) k = i;
    return k;
  }
  /** a turnover or a foul stops the play: its steps up to then, and the record */
  function pbCut(ctx, info, t, why) {
    const pb = info.pb;
    if (!ctx.g.lite) pbEvents(ctx, info, null, t, { cut: t, tAct: pb.tAct0 });
    pb.rec.end = why; pb.rec.step = pbStepAt(pb, t);
  }
  function pbEnd(ctx, info, end, plan) {
    const rec = info.pb.rec;
    rec.end = end;
    rec.step = rec.at;
    // (play tracking: if the play breaks down here, a look passed up or a shot the clock forces, the defense's reaction
    // that took its main option away, or the read's own, says where and why)
    if (end === 'reset' || end === 'shot') {
      rec.away = pbTakenAway(info.pb);
      // (the offense went to a counter: not the play's main option)
      rec.ctr = !!(info.pb.opt && info.pb.opt !== pbMain(info.pb.play));
    }
  }
  /** a play's main option: its biggest read */
  function pbMain(play) {
    let main = null;
    for (const x of play.opts) if (!x.safety && (!main || x.w > main.w)) main = x;
    return main;
  }
  /** does step k of a play pass the ball (k = -1: the entry pass before the first step)? */
  function pbPassStep(play, k) {
    if (k < 0) return true;
    const st = play.steps[k];
    return !!(st && st.ev && st.ev.some(e => e[0] === 'pass' || e[0] === 'handoff'));
  }
  /** of the defense's reactions on the call, the one that took the most from read o (a trigger under 1), or null */
  function pbHurt(o, rx) {
    const tr = (o && o.trig) || {};
    let why = null, low = 0.95;
    const t = (k, w) => { const v = tr[k]; if (v != null && v < low) { low = v; why = w; } };
    if (rx.zone) t('zone', 'help');
    else if (rx.cov) t(rx.cov, rx.cov === 'switch' ? 'switch' : 'screen');
    if (rx.ob) t(rx.ob, rx.ob === 'obswitch' ? 'switch' : 'screen');
    if (rx.help) t('help', 'help');
    if (rx.deny) t('deny', 'deny');
    if (rx.double) t('double', 'help');
    return why;
  }
  /**
   * What the defense took away (play tracking): the play's main option (its biggest read) when the offense had to go
   * elsewhere and the defense's reaction hurt it (a switch; a screen defended: over, under, top-locked, iced, dropped,
   * hedged or blitzed; a denied pass; the help, a double, the zone), else the read it took if a reaction hurt that one.
   * { at: the step, why } or null.
   */
  function pbTakenAway(pb) {
    const rx = pb.rx, o = pb.opt;
    if (!rx || !o) return null;
    const main = pbMain(pb.play);
    if (main && main !== o) { const w = pbHurt(main, rx); if (w) return { at: main.at, why: w }; }
    const w = pbHurt(o, rx);
    return w ? { at: o.at, why: w } : null;
  }
  /** a throw-in from under the basket (BLOB) or the sideline (SLOB) in the frontcourt */
  function pbInbound(ctx, mode) {
    const O = ctx.O, ib = ctx.inbound, g = ctx.g;
    ctx.inbound = null;
    if (!O.pb || O.on.length !== 5 || !ib) return null;
    const fam = ib.kind === 'baseline' ? 'blob' : 'slob';
    let list = O.pb.inb[fam] || [];
    // (the coach's call for this throw-in, when it is the kind of inbound it was drawn for)
    const uId = O.userInb && O.userInb[fam];
    const uIb = uId ? PBC.Playbook.get(uId) : null;
    const called = !!(uIb && uIb.family === fam);
    if (uId) O.userInb[fam] = null;
    if (called) list = [uIb];
    if (!list.length) return null;
    const sit = pbSituation(ctx, mode, null);
    const c = pbChoose(ctx, list, sit);
    if (!c) return null;
    if (called) c.why = ['called by the coach'];
    const info = pbInfo(ctx, c, sit);
    if (called) { info.pb.rec.user = true; ctx.P.userCall = uIb.id; }
    const pb = info.pb, play = c.play, R = c.roles, rec = pb.rec;
    pb.inbound = true;
    const rx = pb.rx = pbReactions(ctx, info);
    const scLeft = ctx.scStart + ctx.scLen - ctx.t;
    const o = U.pickW(play.opts, x => Math.max(1e-4, pbOptW(ctx, pb, x, rx) * (x.safety ? 1 : scLeft < 10 ? 1.6 : 1)));
    const to = (Array.isArray(o.who) ? R[o.who[0]] : R[o.who]) || ctx.handler;
    rec.opt = o.label; rec.optI = play.opts.indexOf(o); rec.at = o.at; rec.step = o.at; rec.cov = rx.cov; rec.read = pbWhy(o, rx);
    if (ib.ev) {
      // the throw-in: from the play's inbounder to the man the read finds, after the play's action (dead ball)
      const side = ib.ev.y > 25 ? -1 : 1;
      pb.side = side;
      const mir = p => [U.round(p[0], 1), U.round(side > 0 ? p[1] : 50 - p[1], 1)];
      const ids = {}, align = {};
      for (const r in R) ids[r] = R[r].id;
      for (const r in play.align) if (R[r]) align[R[r].id] = mir(play.align[r]);
      const seq = play.steps.slice(0, o.at + 1).map(st => {
        const pos = {};
        if (st.pos) for (const r in st.pos) if (R[r]) pos[R[r].id] = mir(st.pos[r]);
        const scr = (st.ev || []).filter(e => e[0] === 'screen' && R[e[1]] && R[e[2]]).map(e => [R[e[1]].id, R[e[2]].id]);
        return { d: st.d, pos, scr };
      });
      ib.ev.by = R.inb.id; ib.ev.to = to.id;
      ib.ev.pb = { id: play.id, name: play.name, side, roles: ids, align, seq, opt: { label: o.label, at: o.at, safety: !!o.safety, read: rec.read }, why: rec.why, user: rec.user ? true : undefined };
    }
    if (o.safety) {
      // the ball is in to the safety: the offense runs its half-court call
      rec.end = 'safety';
      ctx.handler = to;
      return null;
    }
    pb.preset = o;
    info.play = o.base;
    return info;
  }
  /** end of the possession: each call's points (until the next call), the coach's memory */
  function pbPossessionDone(ctx) {
    const P = ctx.P, g = ctx.g;
    if (!ctx.O.pb) return;
    const pbs = P.pbs;
    if (pbs && pbs.length) {
      for (let i = 0; i < pbs.length; i++) {
        const next = pbs[i + 1];
        pbs[i].pts = (next ? next.s0 : g.score[P.off]) - pbs[i].s0;
      }
      P.pb = pbs[pbs.length - 1];
      PBC.PlayCall.remember(g, ctx.O, pbs);
    } else if (P.play && P.play !== 'transition' && P.play !== 'putback' && P.play !== 'none') {
      PBC.PlayCall.rememberFlow(g, ctx.O, P.play, g.score[P.off] - ctx.score0);
    }
  }

  // ---- play tracking (js/core/playstats.js) ----
  // Every possession is logged: how it was played, each call closed with its outcome and, when it broke down, the step
  // and the reason; the game's tallies for the box score and the season. Nothing here draws a random number: the game
  // plays the same with it.
  const FLOW_FAM = { pnr: 1, iso: 1, post: 1, spot: 1, offscreen: 1, handoff: 1, cut: 1 };
  function closeCall(ctx, r) {
    const g = ctx.g;
    let out, done = false, brk = null;
    const at = r.step;
    switch (r.end) {
      case 'shot':
        out = r.q == null ? 'other' : r.fouledShot ? 'ft' : r.made ? 'made' : 'miss';
        // (the read came so late the clock forced the shot: the play broke down, where the defense took its main
        // option away, or on the shot clock)
        if (r.mode === 'normal' && !r.early && r.sc != null && r.sc < 4) brk = r.away ? [r.away.at, r.away.why] : [at, 'clock'];
        else done = true;
        break;
      case 'safety': out = 'safety'; done = true; break;
      case 'reset': out = 'reset'; brk = r.away ? [r.away.at, r.away.why] : [at, 'contest']; break;
      case 'turnover': out = 'to'; brk = [at, r.tok === 'shot_clock' ? 'clock' : r.toScr ? 'screen' : r.tok === 'bad_pass' && r.passStep ? 'deny' : 'to']; break;
      case 'foul': case 'def3': out = 'foul'; break;
      default:
        // (the period ran out on it, or the possession ended some other way: a held ball, an intentional foul)
        out = g.clock - U.clamp(ctx.endT != null ? ctx.endT : ctx.t, 0, g.clock) <= 0.05 ? 'end' : 'other';
        if (out === 'end') brk = [Math.max(-1, at), 'clock'];
    }
    r.out = out; r.done = done; r.brk = brk;
    // (an inbound play that only got the ball in is credited with the whole possession, the way out-of-bounds
    // possessions are counted; any other call with the points while it was on)
    r.spts = out === 'safety' ? g.score[ctx.P.off] - r.s0 : r.pts;
  }
  function logPossession(ctx) {
    const g = ctx.g, P = ctx.P, PS = PBC.PlayStats;
    if (!PS) return;
    const pts = g.score[P.off] - ctx.score0;
    for (const r of P.pbs) closeCall(ctx, r);
    const kind = P.pbs.length ? 'call' : P.play === 'transition' ? 'trans' : FLOW_FAM[P.play] ? 'flow' : 'other';
    const e = { k: kind, f: kind === 'flow' ? P.play : undefined, pts, d: P.defScheme, v: P.defCov };
    const st = g.pstats || (g.pstats = [PS.empty(), PS.empty()]);
    PS.addPoss(st[P.off], st[1 - P.off], e);
    for (const r of P.pbs) PS.addCall(st[P.off], r);
    if (g.lite) return;
    // the possession log of a live game (the box score's list): who, when, how it was played, each call, the outcome
    P.log = {
      o: P.off, q: P.period, c: Math.round(P.clockStart), k: kind, f: e.f, pts, d: P.defScheme, v: P.defCov,
      sq: P.sq ? P.sq.q : undefined, xp: P.sq ? Math.round(P.sq.xp * 100) : undefined, to: P.tok,
      p: P.pbs.map(r => ({ i: r.id, s: r.step, l: r.last, o: r.out, w: r.brk ? r.brk[1] : undefined, e: r.early && r.done ? 1 : undefined, u: r.user ? 1 : undefined, pts: r.spts })),
    };
    (g.plog || (g.plog = [])).push(P.log);
  }

  // ---- shot planning ----
  // shot-zone frequencies: the rating formulas the engine always used, fed with the player's tendencies
  // (tn.x3 / xMid / xRim are the effective ratings of his three / mid / rim tendencies, = the ratings when generated)
  function zoneTendency(c, zone) {
    const r = c.r, tn = c.tn;
    switch (zone) {
      case 'rim': return Math.pow(tn.xRim / 70, 2);
      case 'paint': return Math.pow(Math.max(r.close, r.post, (r.mid + r.layup) / 2) / 70, 2);
      case 'mid': return Math.pow(Math.max(1, tn.xMid) / 70, 2.2);
      default: return Math.pow(U.clamp((tn.x3 - 38) / 32, 0.03, 2.2), 1.6);
    }
  }

  // a firm gate on threes by the shooter's own 3PT rating (his tendency already makes them rare): under 45 he takes
  // one only when the clock or the score forces it (the hurry-up and last-shot paths pick the best shooter anyway),
  // from 45 to 60 fewer the lower he is
  const gate3 = r => { if (r >= 60) return 1; if (r < 45) return 0.02; const t = (r - 45) / 15; return 0.1 + 0.9 * t * t * (3 - 2 * t); };

  function chooseZone(ctx, c, base, hint) {
    const O = ctx.O, D = ctx.D, g = ctx.g, L = g.L;
    const off = C.OFFENSES[O.strat.off].mods, dm = C.DEFENSES[D.strat.def].mods, fo = C.FOCUS[O.strat.focus].freq;
    const offDribble = hint === 'offDribble' || hint === 'iso' || hint === 'transition';
    const w = {};
    for (const z in base) {
      let v = base[z] * zoneTendency(c, z);
      if (is3(z)) v *= (off.three || 1) * L.threeRate * Sim.K.threeFreq * g.sl.three * gate3(c.r.three);
      if (z === 'rim') v *= off.rim || 1;
      if (z === 'mid') v *= off.mid || 1;
      v *= (dm.freq && dm.freq[z]) || 1;
      v *= fo[z] || 1;
      if (offDribble) v *= z === 'rim' ? c.tn.f.pullRim : z === 'paint' ? 1 : c.tn.f.pullJump;
      w[z] = v;
    }
    return U.pickKey(w);
  }

  function pickShooter(ctx, exclude, kind) {
    const cands = ctx.O.on.filter(c => !exclude.includes(c));
    if (kind === 'spot') return U.pickW(cands, c => Math.pow(U.clamp((c.tn.x3 - 35) / 35, 0.05, 2), 3) * Math.sqrt(usageW(ctx, c)));
    if (kind === 'finisher') return U.pickW(cands, c => Math.pow((c.r.layup + c.r.dunk + c.r.speed) / 3 / 65, 3) * (c.posN >= 2 ? 1 : 0.6) * c.tn.f.push);
    return U.pickW(cands, c => usageW(ctx, c));
  }

  // step-back / fadeaway share scaled by the stepback tendency (fs = 1 keeps the old odds exactly)
  const stepP = (p, fs) => (p * fs) / (p * fs + 1 - p);
  // catch-and-shoot players with a pull-up habit put it on the floor for one dribble now and then
  const pullOff = c => c.tn.d.pullup > 0 && U.chance(Math.min(0.35, 0.3 * c.tn.d.pullup));

  function chooseKind(ctx, zone, hint, c, lob) {
    const tn = c.tn, fs = tn.f.step, dk = ctx.g.sl.dunk;
    if (zone === 'rim') {
      if (hint === 'putback') return U.chance(0.4) ? 'tip' : (tn.xDunk >= 65 && U.chance(0.35 * dk) ? 'dunk' : 'layup');
      const m = hint === 'roll' || hint === 'cut' || hint === 'transition' ? 1.35 : hint === 'offDribble' ? 0.6 : 1;
      if (U.chance(U.clamp((tn.xDunk - 46) / 52, 0, 0.9) * m * dk)) return lob && U.chance(0.55) ? 'alley' : 'dunk';
      return U.chance(0.12) ? 'reverse' : 'layup';
    }
    if (zone === 'paint') {
      if (c.posN >= 4) return U.pickKey({ hook: 55, jumper: 22, layup: 23 });
      return U.pickKey({ floater: 55, pullup: 25, layup: 20 });
    }
    if (zone === 'mid') {
      if (hint === 'catch') return pullOff(c) ? 'pullup' : 'jumper';
      if (hint === 'post') return U.chance(stepP(0.55, fs)) ? 'fadeaway' : 'jumper';
      if (hint === 'iso') return U.pickKey({ pullup: 45, stepback: 25 * fs, fadeaway: 30 * fs });
      return 'pullup';
    }
    if (hint === 'catch') return pullOff(c) ? 'pullup' : 'catch_shoot';
    if (hint === 'iso') return U.chance(stepP(0.42, fs)) ? 'stepback' : 'pullup';
    if (hint === 'offDribble' || hint === 'transition') return U.chance(stepP(0.18, fs)) ? 'stepback' : 'pullup';
    return 'catch_shoot';
  }

  /** Branch odds of a play, bent by the decision maker's pass / pull-up tendencies (unchanged for generated ones). */
  function branchWeights(info) {
    const b = BRANCHES[info.play] || { self: 1 };
    const who = info.play === 'post' ? info.poster : info.play === 'offscreen' ? info.shooter : info.handler;
    const f = who && who.tn ? who.tn.f : null;
    if (!f) return b;
    switch (info.play) {
      case 'pnr': return { handler: b.handler * f.keep * f.pull, roller: b.roller * f.passOut, kick: b.kick * f.passOut };
      case 'iso': case 'post': return { self: b.self * f.keep, kick: b.kick * f.passOut };
      case 'offscreen': return { shooter: b.shooter * f.keep, kick: b.kick * f.passOut };
      case 'handoff': return { receiver: b.receiver * f.keep * f.pull, big: b.big, kick: b.kick * f.passOut };
      case 'transition': return { handler: b.handler * f.keep, finisher: b.finisher * f.passOut, trailer3: b.trailer3 * f.passOut };
      default: return b;
    }
  }

  function planShot(ctx, info, mode) {
    const O = ctx.O;
    const gim = ctx.P.gim;
    const on = O.on;
    let branch = U.pickKey(branchWeights(info));
    let shooter, assister = null, base, hint, cKey, lob = false, passKind = null;
    const force3 = mode === 'hurry3' || (mode === 'lastShot' && ctx.g.period >= ctx.g.L.periods && ctx.g.score[O.idx] - ctx.g.score[ctx.D.idx] === -3);
    if (gim) {
      // GIM overrides: the chosen shooter takes the chosen shot
      shooter = on.find(c => c.id === gim.shooter) || info.handler;
      const z = gim.zone;
      base = { [z]: 1 };
      hint = gim.hint || 'offDribble';
      assister = gim.assist ? on.find(c => c.id === gim.assist) || null : null;
      if (assister === shooter) assister = null;
      cKey = gim.contestKey || 'iso';
      passKind = assister ? (z === 'rim' ? 'bounce' : 'kick') : null;
      branch = 'gim';
      return { branch, shooter, assister, zone: z, kind: gim.kind || chooseKind(ctx, z, hint, shooter, false), cKey, passKind, hint };
    }
    // a called play: its reads decide who shoots and how
    if (info.pb) return pbPlan(ctx, info, mode, force3);
    switch (info.play) {
      case 'pnr':
        if (branch === 'handler') { shooter = info.handler; base = { rim: 30, paint: 21, mid: 20, c3: 1, ab3: 28 }; hint = 'offDribble'; cKey = 'pnr_handler'; }
        else if (branch === 'roller') {
          shooter = info.screener; assister = info.handler; cKey = 'roller';
          if (info.pop) { base = { mid: 25, ab3: 68, c3: 7 }; hint = 'catch'; passKind = 'kick'; }
          else { base = { rim: 80, paint: 17, mid: 3 }; hint = 'roll'; lob = U.chance(0.3); passKind = lob ? 'lob' : 'bounce'; }
        } else { shooter = pickShooter(ctx, [info.handler, info.screener], 'spot'); assister = info.handler; base = { c3: 36, ab3: 48, mid: 8, rim: 8 }; hint = 'catch'; cKey = 'kick'; passKind = 'kick'; }
        break;
      case 'iso':
        if (branch === 'self') { shooter = info.handler; base = { rim: 30, paint: 15, mid: 27, ab3: 28 }; hint = 'iso'; cKey = 'iso'; }
        else { shooter = pickShooter(ctx, [info.handler], 'spot'); assister = info.handler; base = { c3: 40, ab3: 50, rim: 10 }; hint = 'catch'; cKey = 'kick'; passKind = 'kick'; }
        break;
      case 'post':
        if (branch === 'self') { shooter = info.poster; base = { rim: 38, paint: 46, mid: 14, ab3: 2 }; hint = 'post'; cKey = 'post'; assister = U.chance(0.26) ? info.handler : null; }
        else { shooter = pickShooter(ctx, [info.poster], 'spot'); assister = info.poster; base = { c3: 40, ab3: 48, mid: 7, rim: 5 }; hint = 'catch'; cKey = 'kick'; passKind = 'kick'; }
        break;
      case 'spot':
        if (branch === 'shooter') { shooter = pickShooter(ctx, [info.handler], 'spot'); assister = info.handler; base = { c3: 32, ab3: 50, mid: 14, rim: 4 }; hint = 'catch'; cKey = 'spot'; passKind = 'swing'; }
        else { shooter = pickShooter(ctx, [], 'usage'); assister = shooter !== info.handler && U.chance(0.6 * info.handler.tn.f.assist) ? info.handler : null; base = { rim: 58, paint: 26, mid: 16 }; hint = 'offDribble'; cKey = 'drive'; }
        break;
      case 'offscreen':
        if (branch === 'shooter') { shooter = info.shooter; assister = info.handler; base = { ab3: 56, c3: 12, mid: 30, rim: 2 }; hint = 'catch'; cKey = 'offscreen'; passKind = 'chest'; }
        else { shooter = pickShooter(ctx, [info.shooter], 'usage'); assister = info.shooter; base = { rim: 45, paint: 25, mid: 15, ab3: 15 }; hint = 'catch'; cKey = 'kick'; passKind = 'chest'; }
        break;
      case 'handoff':
        if (branch === 'receiver') { shooter = info.handler; assister = U.chance(0.5) ? info.big : null; base = { rim: 26, paint: 12, mid: 20, ab3: 42 }; hint = 'offDribble'; cKey = 'handoff'; }
        else if (branch === 'big') { shooter = info.big; base = { rim: 60, paint: 25, mid: 15 }; hint = 'roll'; cKey = 'big'; assister = U.chance(0.5) ? info.handler : null; passKind = 'bounce'; }
        else { shooter = pickShooter(ctx, [info.handler, info.big], 'spot'); assister = info.handler; base = { c3: 40, ab3: 45, mid: 10, rim: 5 }; hint = 'catch'; cKey = 'kick'; passKind = 'kick'; }
        break;
      case 'cut':
        shooter = info.cutter; assister = info.handler; base = { rim: 86, paint: 14 }; hint = 'cut'; cKey = 'cut'; lob = U.chance(0.2); passKind = lob ? 'lob' : 'bounce';
        break;
      case 'transition':
        if (branch === 'handler') { shooter = info.handler; base = { rim: 68, paint: 10, mid: 6, ab3: 16 }; hint = 'transition'; cKey = 'transition'; }
        else if (branch === 'finisher') { shooter = pickShooter(ctx, [info.handler], 'finisher'); assister = info.handler; base = { rim: 90, paint: 10 }; hint = 'transition'; cKey = 'transition'; lob = U.chance(0.15); passKind = lob ? 'lob' : 'chest'; }
        else { shooter = pickShooter(ctx, [info.handler], 'spot'); assister = info.handler; base = { ab3: 70, c3: 30 }; hint = 'catch'; cKey = 'trailer3'; passKind = 'kick'; }
        break;
      case 'putback':
        shooter = info.handler; base = { rim: 86, paint: 14 }; hint = 'putback'; cKey = 'putback';
        break;
      default:
        shooter = info.handler || pickShooter(ctx, [], 'usage'); base = { rim: 30, paint: 12, mid: 20, c3: 10, ab3: 28 }; hint = 'offDribble'; cKey = 'iso';
    }
    return planTail(ctx, mode, force3, { branch, shooter, assister, base, hint, cKey, lob, passKind });
  }
  /** the end of every shot plan: the late-game three, the shot's zone and type */
  function planTail(ctx, mode, force3, p) {
    const O = ctx.O;
    let { branch, shooter, assister, base, hint, cKey, lob, passKind } = p;
    if (!shooter) shooter = pickShooter(ctx, [], 'usage');
    if (assister === shooter) assister = null;
    if (force3) {
      // late game: need a three — best shooter, off the dribble or catch (a called play keeps its own shooter when
      // he is about as good a shooter)
      const best = U.maxBy(O.on, c => c.r.three + usageW(ctx, c) * 6 + U.rand() * 4);
      if (!(p.keep && shooter.r.three >= best.r.three - 5)) shooter = best;
      base = { ab3: 75, c3: 25 }; hint = assister ? 'catch' : 'offDribble'; cKey = assister ? 'kick' : 'pnr_handler';
      if (assister === shooter) assister = null;
    }
    let zb = base;
    if ((hint === 'iso' || hint === 'offDribble') && !force3 && mode !== 'lastShot') {
      // off the dribble a handler who can beat his man gets to the basket (and one who can't settles for jumpers)
      const e = openEdge(ctx, { hint, kind: 'pullup' }, shooter, matchupDefender(ctx.D, shooter, ctx)) - OPEN_MEAN.drive;
      if (Sim.edgeLog) Sim.edgeLog.push(['drive', e + OPEN_MEAN.drive]);
      zb = Object.assign({}, base);
      if (zb.rim) zb.rim *= Math.exp(U.clamp(e, -2, 2) * 0.16);
      if (zb.paint) zb.paint *= Math.exp(U.clamp(e, -2, 2) * 0.06);
    }
    const zone = mode === 'lastShot' && ctx.heave ? 'ab3' : chooseZone(ctx, shooter, zb, hint);
    let kind = chooseKind(ctx, zone, hint, shooter, lob);
    if (zone === 'rim' && kind !== 'alley' && lob) lob = false;
    if (kind === 'alley' && !assister) kind = 'dunk';
    if (mode === 'lastShot') cKey = 'lastShot';
    return { branch, shooter, assister, zone, kind, cKey, passKind, lob, hint };
  }

  // ---- narrative events before the shot (for the live view) ----
  /**
   * The look before the call (Sim.K.look*): a flow possession whose look the ball movement finds is played as it comes, with
   * no play called. The quick touches move the ball until the man who takes the look (or finds it) has it, and from the
   * catch he goes: his drive at the rim or his pull-up, the drive and the kick to the open man, or the swing to him, who
   * lets it fly. Live games only; false (nothing emitted) when it is not such a look or there is not the time for it.
   */
  function lookEvents(ctx, info, plan, tShot, contest, mode) {
    const g = ctx.g, O = ctx.O, idx = O.idx, K = Sim.K;
    if (g.lite || mode !== 'normal' || !K.lookFam[info.play] || plan.branch === 'gim' || !ctx.handler || O.on.length < 2) return false;
    // (a pick and roll: only the handler's own shot, taken before the screen gets there; the roll and the kick come out of it)
    if (info.play === 'pnr' && plan.branch !== 'handler') return false;
    if (!U.chance(K.lookP[contest] || 0)) return false;
    const R = (r) => U.range(r[0], r[1]);
    const quick = (g.sl && g.sl.quick) || 1;
    const t0 = Math.max(ctx.t, ctx.advT), sh = plan.shooter, as = plan.assister && plan.assister !== sh ? plan.assister : null;
    if (tShot - t0 < 0.9) return false;
    const rim = plan.zone === 'rim' || plan.zone === 'paint';
    const kick = !!as && (plan.passKind === 'kick' || plan.branch === 'kick');
    // (the times, back from the shot: tRel the release of the pass that gets the ball to the man who starts it, his catch
    // ~0.35 s after; the 0.5 s after that is his read)
    const man = as || sh;
    let tRel, tPass = null, tDrive = null, driver = null, pullMove = null;
    if (!as) {
      tRel = tShot - R(rim ? K.lookDriveS : K.lookPullS);
      if (rim) { driver = sh; tDrive = tRel + 0.35 + U.range(0.15, 0.35); }
      else if (plan.kind === 'stepback') pullMove = { t: tShot - 0.45, move: 'stepback' };
      else if (tShot - tRel > 1.35) pullMove = { t: tRel + 0.35 + U.range(0.1, 0.3), move: U.pick(['hesi', 'crossover', 'jab', 'hesi']) };
    } else if (kick) {
      tPass = tShot - R(K.lookCatchS) / quick;
      tRel = Math.min(tShot - R(K.lookKickS), tPass - 1.1);
      driver = as; tDrive = tRel + 0.35 + U.range(0.15, 0.35);
    } else if (rim) {
      tPass = tShot - R(K.lookDriveS);
      tRel = tPass - U.range(0.55, 0.9);
      driver = sh; tDrive = tPass + 0.35 + U.range(0.15, 0.35);
    } else {
      tPass = tShot - R(K.lookCatchS) / quick;
      tRel = Math.min(tShot - R(K.lookSwingS), tPass - 0.5);
    }
    // (a look right away: no pass needed when he has it, he goes from where he is; with one needed, not before the ball is up)
    const has = ctx.handler === man;
    if (!has && tRel < t0 + 0.15) return false;
    if (has && tRel < t0) { const dt = t0 - tRel; tRel = t0; if (tDrive != null) tDrive += dt; if (pullMove && pullMove.move !== 'stepback') pullMove.t += dt; }
    // the ball moves until the look: quick touches, the last one to the man who starts it (from him and back, when he has it)
    let holder = flowTouches(ctx, ctx.handler, t0 + U.range(K.flowLeadS[0], K.flowLeadS[1]), tRel, man);
    if (holder !== man) { evAt(ctx, U.round(tRel, 2), 'pass', { from: holder.id, to: man.id, kind: 'swing', team: idx }); holder = man; }
    // and he goes: the drive at the rim (the drive and the kick, the catch and attack), the pull-up's move, the kick or the swing
    const evs = [];
    if (driver && tDrive != null) evs.push([tDrive, 'move', { player: driver.id, move: 'drive', team: idx }]);
    if (pullMove) evs.push([pullMove.t, 'move', { player: sh.id, move: pullMove.move, team: idx }]);
    if (as && tPass != null) evs.push([tPass, 'pass', { from: as.id, to: sh.id, kind: kick ? 'kick' : rim ? 'chest' : (plan.passKind || 'swing'), team: idx }]);
    evs.sort((a, b) => a[0] - b[0]);
    let tl = tRel;
    for (const e of evs) { tl = Math.max(tl + 0.05, Math.min(e[0], tShot - 0.3)); if (tl < tShot - 0.05) evAt(ctx, U.round(tl, 2), e[1], e[2]); }
    return true;
  }
  function playEvents(ctx, info, plan, tShot, contest, mode) {
    const g = ctx.g;
    if (g.lite) return;
    if (lookEvents(ctx, info, plan, tShot, contest, mode)) return;
    const O = ctx.O, idx = O.idx;
    let t0 = Math.max(ctx.t, ctx.advT);
    const handler = info.handler || ctx.handler;
    // (the play itself at most spanMax from its call to its shot: the time before it is played as quick touches, the ball
    // ending with the man the play is run for as it is called; a transition or a putback is its own quick thing)
    const sMax = Sim.K.spanMax[info.play];
    if (sMax && tShot - t0 > sMax + Sim.K.flowMinS && handler && ctx.handler) {
      const tf = t0 + U.range(Sim.K.flowLeadS[0], Sim.K.flowLeadS[1]), tp = tShot - sMax;
      const h = flowTouches(ctx, ctx.handler, tf, tp - 0.1, handler);
      if (h === handler) t0 = tp;
    }
    const span = Math.max(0.3, tShot - t0);
    const at = f => U.round(t0 + span * f, 2);
    const setEv = f => evAt(ctx, at(f), 'set', { play: info.play, setName: info.setName, handler: handler.id, screener: info.screener ? info.screener.id : undefined, target: plan.shooter.id, team: idx });
    // the last pass reaches the shooter later with a quicker trigger (Shoot When Open slider): he catches and lets it
    // fly instead of holding it while the defense recovers (timing only, the shot itself is already decided)
    const quick = (g.sl && g.sl.quick) || 1;
    const pass = (f, from, to, kind) => { if (from && to && from !== to) evAt(ctx, at(to === plan.shooter ? 1 - (1 - f) / quick : f), 'pass', { from: from.id, to: to.id, kind: kind || 'chest', team: idx }); };
    const move = (f, c, m) => evAt(ctx, at(f), 'move', { player: c.id, move: m, team: idx });
    const perimeter = O.on.filter(c => c !== handler && c !== plan.shooter);
    switch (info.play) {
      case 'pnr': {
        setEv(0.05);
        evAt(ctx, at(0.3), 'screen', { screener: info.screener.id, user: handler.id, kind: 'ball', cov: PBC.PlayCall ? PBC.PlayCall.coverage(ctx.D) : undefined, team: idx });
        move(0.4, handler, U.pick(['hesi', 'crossover', 'drive']));
        if (plan.branch === 'roller') pass(0.82, handler, plan.shooter, plan.passKind);
        else if (plan.branch === 'kick') { move(0.65, handler, 'drive'); pass(0.85, handler, plan.shooter, 'kick'); }
        else if (plan.zone === 'rim' || plan.zone === 'paint') move(0.75, handler, 'drive');
        break;
      }
      case 'iso': {
        setEv(0.05);
        move(0.2, handler, 'size_up');
        move(0.45, handler, U.pick(['crossover', 'btl', 'hesi', 'jab', 'btb']));
        if (span > 4) move(0.62, handler, U.pick(['crossover', 'btl', 'spin', 'hesi']));
        if (plan.kind === 'stepback') move(0.9, handler, 'stepback');
        else if (plan.zone === 'rim' || plan.zone === 'paint') move(0.78, handler, U.chance(0.2) ? 'spin' : 'drive');
        if (plan.branch === 'kick') pass(0.86, handler, plan.shooter, 'kick');
        break;
      }
      case 'post': {
        setEv(0.05);
        pass(0.3, info.handler, info.poster, 'entry');
        move(0.5, info.poster, 'backdown');
        if (plan.branch === 'kick') pass(0.85, info.poster, plan.shooter, 'kick');
        break;
      }
      case 'spot': {
        setEv(0.05);
        if (plan.branch === 'shooter') {
          const nPass = span > 7 ? 3 : span > 4 ? 2 : 1;
          let from = handler;
          // (the ball swings through the teammates who are not the shooters: a good shooter who catches it open lets
          // it fly, so the swing ends with him)
          const pool = perimeter.slice(), chain = [];
          for (let k = 0; k < nPass - 1 && pool.length; k++) {
            const c = U.pickW(pool, c => Math.pow(U.clamp((82 - c.r.three) / 30, 0.08, 1.4), 2));
            chain.push(c); pool.splice(pool.indexOf(c), 1);
          }
          chain.forEach((c, i) => { pass(0.2 + i * 0.25, from, c, 'swing'); from = c; });
          pass(0.88, from, plan.shooter, 'swing');
        } else {
          pass(0.35, handler, plan.shooter, 'swing');
          move(0.65, plan.shooter, 'drive');
        }
        break;
      }
      case 'offscreen': {
        setEv(0.05);
        evAt(ctx, at(0.45), 'screen', { screener: info.screener.id, user: info.shooter.id, kind: 'off_ball', team: idx });
        pass(0.8, handler, info.shooter, 'chest');
        if (plan.branch === 'kick') { move(0.88, info.shooter, 'drive'); pass(0.93, info.shooter, plan.shooter, 'kick'); }
        break;
      }
      case 'handoff': {
        setEv(0.05);
        pass(0.25, handler, info.big, 'chest');
        evAt(ctx, at(0.55), 'handoff', { from: info.big.id, to: handler.id, team: idx });
        if (plan.branch === 'big') pass(0.85, handler, info.big, 'bounce');
        else if (plan.branch === 'kick') { move(0.7, handler, 'drive'); pass(0.88, handler, plan.shooter, 'kick'); }
        else if (plan.zone === 'rim') move(0.75, handler, 'drive');
        break;
      }
      case 'cut': {
        setEv(0.05);
        const swing = perimeter.find(c => c !== info.cutter);
        if (swing && span > 3) { pass(0.3, handler, swing, 'swing'); pass(0.55, swing, handler, 'swing'); }
        pass(0.88, handler, info.cutter, plan.passKind || 'bounce');
        break;
      }
      case 'transition': {
        if (plan.assister) pass(0.75, plan.assister, plan.shooter, plan.passKind || 'chest');
        break;
      }
      default: break;
    }
    // GIM / generic: a pass from the assister right before the shot if not already produced
    if (plan.branch === 'gim' && plan.assister) pass(0.85, plan.assister, plan.shooter, plan.passKind || 'chest');
  }

  // ---- shot resolution ----
  /** how the look was created: 'dribble' (off the bounce), 'catch' (without the ball), 'inside' (post, roll, cut) */
  function lookKind(plan) {
    const h = plan.hint;
    if (h === 'iso' || h === 'offDribble' || h === 'transition') return 'dribble';
    if (h === 'catch') return 'catch';
    return 'inside';
  }
  /**
   * The shooter's edge over his defender, in rating standard deviations (~12 points), + = he gets himself open.
   * Beating a man off the dribble takes handle, burst and shiftiness against the defender's on-ball defense and
   * feet; a step-back or fadeaway makes its own space. Off the ball it is movement and feel (and the passer's eyes)
   * against the defender's awareness and help. Inside it is strength and post craft against interior defense.
   */
  function openEdge(ctx, plan, sh, d) {
    const k = lookKind(plan);
    let off, def;
    if (k === 'dribble') {
      off = dv(sh, 'handle') * 0.4 + dv(sh, 'speed') * 0.25 + dv(sh, 'agility') * 0.2 + dv(sh, 'shotIQ') * 0.15;
      def = dv(d, 'perD') * 0.6 + dv(d, 'agility') * 0.25 + dv(d, 'speed') * 0.15;
      if (plan.kind === 'stepback' || plan.kind === 'fadeaway') off += 4 + dv(sh, 'handle') * 0.15;
    } else if (k === 'catch') {
      const ps = plan.assister;
      off = dv(sh, 'shotIQ') * 0.45 + dv(sh, 'speed') * 0.25 + dv(sh, 'agility') * 0.1 + (ps ? dv(ps, 'vision') * 0.2 : dv(sh, 'shotIQ') * 0.2);
      def = dv(d, 'helpD') * 0.5 + dv(d, 'perD') * 0.3 + dv(d, 'speed') * 0.2;
    } else {
      off = dv(sh, 'strength') * 0.4 + dv(sh, 'post') * 0.25 + dv(sh, 'speed') * 0.2 + dv(sh, 'shotIQ') * 0.15;
      def = dv(d, 'intD') * 0.5 + dv(d, 'strength') * 0.35 + dv(d, 'helpD') * 0.15;
    }
    return U.clamp((off - def) / 12, -2.5, 2.5);
  }

  function contestLevel(ctx, cKey, plan, sh, d) {
    const O = ctx.O, D = ctx.D;
    const w = (CONTEST[cKey] || CONTEST.iso).slice();
    let open = (C.OFFENSES[O.strat.off].mods.open || 0) + (C.DEFENSES[D.strat.def].mods.open || 0) + C.PRESSURE[D.strat.pressure].open;
    open += (avgOn(O, 'vision') - 64) * 0.004 - ((avgOn(D, 'perD') + avgOn(D, 'helpD')) / 2 - 63) * 0.006;
    open += offenseFit(O) * 0.05 - defenseFit(D) * 0.05;
    if (ctx.transition && ctx.segN <= 1) open += 0.05;
    else if (ctx.early && ctx.segN <= 1) open += 0.025; // (the defense is not set yet)
    // defensive intensity slider, playoff effort, gamblers getting beaten
    const g = ctx.g;
    open += -g.sl.contest - 0.035 * Math.min(1.5, g.intensity) + 0.03 * avgDev(D, 'gamble');
    // the man guarding him: open looks come from beating him, not from the defense wandering off
    if (sh && d && cKey !== 'lastShot') {
      const e = openEdge(ctx, plan, sh, d);
      plan.edge = e;
      if (Sim.edgeLog) Sim.edgeLog.push([lookKind(plan), e]);
      open += (e - OPEN_MEAN[lookKind(plan)]) * OPEN_K;
    }
    w[0] *= 1 + open * 3; w[2] *= 1 - open * 3;
    const i = U.pickW([0, 1, 2], w.map(x => Math.max(0.5, x)));
    return ['open', 'contested', 'tight'][i];
  }

  function shotDefender(ctx, shooter, zone, info) {
    const D = ctx.D;
    let d = matchupDefender(D, shooter, ctx);
    // switching every screen: off a pick and roll the handler and the screener have each other's defender (the live
    // court swaps them the same way)
    if (D.strat.def === 'switch' && info && info.play === 'pnr' && info.handler && info.screener) {
      if (shooter === info.handler) d = matchupDefender(D, info.screener, ctx) || d;
      else if (shooter === info.screener) d = matchupDefender(D, info.handler, ctx) || d;
    }
    if (zone === 'rim' || zone === 'paint') {
      const rp = U.maxBy(D.on, c => c.r.block * 0.6 + c.r.intD * 0.4);
      if (rp !== d && rp.r.block * 0.6 + rp.r.intD * 0.4 > d.r.block * 0.6 + d.r.intD * 0.4 && U.chance(0.45)) d = rp;
    }
    if (D.strat.def === 'boxone' && ctx.starId === shooter.id) d = U.maxBy(D.on, c => c.r.perD);
    return d;
  }

  function isClutch(g) { return (g.period >= g.L.periods && g.clock <= 300 && Math.abs(g.score[0] - g.score[1]) <= 6) || g.period > g.L.periods; }

  /**
   * How far a lead is past "safe" for the time left (in men's-league points; <= 0 = the game is still live).
   * Safe grows with the square root of the time remaining, like the analysts' safe-lead rule, so coasting only
   * starts once a comeback is out of reach and never decides a competitive game.
   */
  function coastExcess(g, lead) {
    const L = g.L, cs = L.key === 'women' ? 0.74 : 1; // lead sizes scale with the league's scoring
    const reg = L.periods * L.quarterLen;
    const left = g.period <= L.periods ? (L.periods - g.period) * L.quarterLen + g.clock : g.clock;
    const safe = 12 + 0.45 * Math.sqrt(Math.max(0, left) * 2880 / reg);
    return lead / cs - safe;
  }

  function makeProb(ctx, sh, zone, kind, contest, d, info) {
    const g = ctx.g, O = ctx.O, D = ctx.D, L = g.L;
    const r = sh.r;
    let x = U.logit(L.shotBase[zone] / (1 - BLOCK_BASE[zone] * 0.9)) + Sim.K.zoneAdj[zone];
    let skill;
    if (zone === 'rim') skill = kind === 'dunk' || kind === 'alley' ? r.dunk * 0.55 + r.vert * 0.2 + r.strength * 0.25 : r.layup * 0.55 + r.close * 0.3 + r.vert * 0.08 + r.strength * 0.07;
    else if (zone === 'paint') skill = kind === 'hook' ? r.post * 0.5 + r.close * 0.5 : kind === 'floater' ? r.layup * 0.3 + r.close * 0.3 + r.mid * 0.4 : r.close * 0.6 + r.mid * 0.25 + r.post * 0.15;
    else if (zone === 'mid') skill = r.mid * 0.85 + r.shotIQ * 0.15;
    else skill = r.three * 0.9 + r.shotIQ * 0.1;
    if (skill > 82) skill = 82 + (skill - 82) * 0.55; // diminishing returns at the top end
    x += (skill - 70) / 10 * SKILL_K[zone];
    const dSkill = zone === 'rim' || zone === 'paint' ? d.r.intD * 0.6 + d.r.block * 0.25 + d.r.strength * 0.15 : d.r.perD * 0.75 + d.r.agility * 0.25;
    x -= (dSkill - 64) / 10 * DEF_K[zone];
    if (zone === 'rim' || zone === 'paint') x -= (avgOn(D, 'helpD') - 64) / 10 * 0.07;
    x += CONTEST_LOGIT[zone][['open', 'contested', 'tight'].indexOf(contest)];
    // tough-shot makers: a smart, skilled scorer loses less to a hand in his face (and a poor one more)
    if (contest === 'tight') x += U.clamp((r.shotIQ - 65) / 10 * 0.04 + (skill - 70) / 10 * 0.03, -0.12, 0.14);
    x += KIND_LOGIT[kind] || 0;
    if (ctx.transition && ctx.segN <= 1 && zone === 'rim') x += 0.12;
    const scLeft = ctx.scStart + ctx.scLen - ctx.t;
    if (scLeft < 2.5 && kind !== 'tip') x -= 0.25;
    x -= Math.max(0, 72 - sh.energy) * 0.012;
    if (O.idx === 0) x += 0.025 * g.homeMult;
    if (isClutch(g)) x += (r.clutch - 70) / 10 * 0.07 * g.clutchMult;
    // sliders (zone shooting), per-game form, user-team handles and playoff defense
    x += (is3(zone) ? g.sl.l3 : zone === 'mid' ? g.sl.lMid : g.sl.lIn) + g.shootAdj[O.idx];
    // Game Impact Moments: the defense is locked in and loads up on drives
    if (ctx.gimDefense || (ctx.P && ctx.P.gim)) x -= zone === 'rim' || zone === 'paint' ? 0.5 : 0.15;
    x += sh.conf * Sim.K.confMake;
    if (g.run.team === O.idx && g.run.pts >= 8) x += 0.03;
    // big leads: the team ahead coasts and the team behind plays for pride (real games rarely end 50+ apart)
    const margin = g.score[O.idx] - g.score[1 - O.idx];
    const exUp = coastExcess(g, margin), exDown = coastExcess(g, -margin);
    if (exUp > 0) x -= Math.min(0.45, exUp * 0.016) * Sim.K.coast;
    else if (exDown > 0) x += Math.min(0.2, exDown * 0.007) * Sim.K.coast;
    const dm = C.DEFENSES[D.strat.def].mods;
    const dfit = defenseFit(D);
    if (dm.zone && dm.zone[zone]) x += dm.zone[zone] * (dm.needs ? 0.6 + 0.4 * (dfit + 1) / 2 * 2 : 1);
    if (dm.play && info && dm.play[info.play]) x += dm.play[info.play] * (dm.needs ? 0.5 + 0.5 * (dfit + 1) / 2 * 2 : 1);
    if (D.strat.def === 'boxone' && ctx.starId === sh.id) x += dm.star;
    if (is3(zone)) {
      const ofit = C.OFFENSES[O.strat.off].mods.needs === 'three' ? offenseFit(O) : 0;
      x += ofit * 0.05;
    }
    return U.sigmoid(x);
  }

  function blockProb(ctx, zone, sh, d) {
    const b = d.r.block * 0.7 + d.r.vert * 0.15 + (d.hgt - sh.hgt) * 1.2 + 10;
    let p = BLOCK_BASE[zone] * Math.pow(Math.max(20, b) / 64, 3);
    p *= 1 - (sh.r.shotIQ - 65) * 0.006;
    const sb = ctx.g.sl.blk;
    p *= sb * d.tn.f.block;
    return U.clamp(p, 0.002, Math.min(0.45, 0.3 * Math.max(1, sb)));
  }

  function shootingFoulProb(ctx, zone, sh, d, kind) {
    const D = ctx.D, g = ctx.g;
    let p = SFOUL_BASE[zone];
    if (kind === 'heave') return 0.005;
    p *= Math.pow(sh.r.drawFoul / 69, 1.6) * Sim.K.sfoul;
    p *= (C.OFFENSES[ctx.O.strat.off].mods.drawFoul || 1);
    p *= C.DEFENSES[D.strat.def].mods.foul || 1;
    p *= C.PRESSURE[D.strat.pressure].foul;
    p *= Math.pow(0.99, (d.r.helpD - 64) / 2);
    if (ctx.O.idx === 0) p *= 1 + 0.03 * g.homeMult; else p *= 1 - 0.03 * g.homeMult;
    if (ctx.transition && ctx.segN <= 1) p *= 1.15;
    // sliders, the shooter's contact seeking, the defender's foul / block habits, physical playoff games
    p *= g.sl.sfoul * sh.tn.f.drawFoul * d.tn.f.sfoulDef * (1 + 0.08 * Math.min(1.5, g.intensity));
    return U.clamp(p, 0.003, 0.45);
  }

  function ftProb(ctx, c) {
    const g = ctx.g;
    let p = Sim.K.ftA + 0.0066 * c.r.ft + g.L.ftBase + g.sl.ft;
    if (isClutch(g)) p += (c.r.clutch - 70) * 0.0012 * g.clutchMult;
    p -= Math.max(0, 68 - c.energy) * 0.001;
    p += (c.conf || 0) * Sim.K.confFtMake * 0.25; // (confidence: ~0.025 either way at the extremes, the logit's slope near 0.77)
    if (ctx.O.idx === 1) p -= 0.004 * g.homeMult;
    return U.clamp(p, 0.3, g.sl.ft > 0 ? 0.96 + g.sl.ft * 0.25 : 0.96);
  }

  /**
   * Is this look worth taking? Its expected points (the make probability for this shooter, spot, shot type and
   * contest, times the points) against the time left: early in the shot clock only a good look is taken (a tight
   * long two by a poor shooter is passed up and the ball reset), from ~9 s left the best available one. A wide-open
   * look for a decent shooter is always taken. Heady players (shot IQ) pass up bad looks more often. Never in the
   * end-of-clock and end-of-game modes, on putbacks, in transition or on shot-meter plays.
   */
  function passUp(ctx, plan, contest, d, info, tShot, mode) {
    // (ctx.read: the read behind the decision, for the Live view's debug overlay; live games only)
    const why = mode !== 'normal' ? mode : ctx.P.gim ? 'gim' : info.play === 'putback' || info.play === 'transition' ? info.play : plan.kind === 'heave' ? 'heave' : (ctx.resets || 0) >= 2 ? 'resets' : null;
    ctx.read = why && !ctx.g.lite ? { why } : null;
    if (why) return false;
    const scLeft = ctx.scStart + ctx.scLen - tShot;
    if (scLeft < 9) { if (!ctx.g.lite) ctx.read = { why: 'late', sc: U.round(scLeft, 1) }; return false; }
    const ep = makeProb(ctx, plan.shooter, plan.zone, plan.kind, contest, d, info) * (is3(plan.zone) ? 3 : 2);
    const bar = scLeft > 14 ? 0.86 : 0.78;
    if (!ctx.g.lite) ctx.read = { ep: U.round(ep, 3), bar, sc: U.round(scLeft, 1), zone: plan.zone, contest, kind: plan.kind };
    if (ep >= bar) return false;
    const iq = U.clamp((plan.shooter.r.shotIQ - 50) / 40, 0, 1);
    return U.chance(U.clamp((bar - ep) / 0.3, 0, 1) * (0.3 + 0.45 * iq));
  }
  /** the look is passed up: the ball is swung to a teammate and the offense runs something new */
  // (the roles of a play that live outside: a reset from a called play swings the ball out to one of them)
  const PERIM_ROLE = { handler: 1, pnr: 1, spacer: 1, shooter: 1, scorer: 1 };
  function resetPossession(ctx, info, plan, tShot, holder) {
    const O = ctx.O;
    const from = holder || plan.shooter;
    let pool = O.on.filter(c => c !== from);
    if (info.pb) {
      const play = info.pb.play, R = info.pb.roles, out = [];
      for (const r in R) if (PERIM_ROLE[play.roles[r]] && R[r] !== from && R[r] !== plan.shooter) out.push(R[r]);
      if (out.length) pool = out;
    }
    const to = U.pickW(pool, c => usageW(ctx, c) * Math.pow(c.r.handle / 70, 1.2) * (c.posN <= 3 ? 1 : 0.4));
    ctx.resets = (ctx.resets || 0) + 1;
    if (to && !ctx.g.lite) evAt(ctx, tShot, 'pass', { from: from.id, to: to.id, kind: 'chest', team: O.idx, reset: true, read: ctx.read || undefined });
    ctx.t = tShot;
    if (to) ctx.handler = to;
    ctx.newPlay = true;
  }

  function takeShot(ctx, info, tShot, mode, opts, forcePlan) {
    const g = ctx.g, O = ctx.O, D = ctx.D;
    const plan = forcePlan || planShot(ctx, info, mode);
    const sh = plan.shooter;
    const zone = plan.zone;
    const kind = plan.kind;
    const d = shotDefender(ctx, sh, zone, info);
    const contest = kind === 'heave' ? 'tight' : contestLevel(ctx, plan.cKey, plan, sh, d);
    // (play tracking: the shot clock when the called play got to its read)
    if (info.pb && info.pb.rec.sc == null) info.pb.rec.sc = U.round(ctx.scStart + ctx.scLen - tShot, 1);
    if (forcePlan) ctx.read = null;
    else if (passUp(ctx, plan, contest, d, info, tShot, mode)) {
      // (a called play ran to its read, the look was not good enough: the ball is swung and the next call comes)
      // (a flow possession: the quick touches find the man who passes it up, instead of the ball sitting until then)
      const holder = info.pb ? pbEvents(ctx, info, plan, tShot, 'reset') : g.lite ? null : flowTouches(ctx, ctx.handler, Math.max(ctx.t, ctx.advT) + U.range(Sim.K.flowLeadS[0], Sim.K.flowLeadS[1]), tShot - U.range(0.8, 1.3), plan.shooter);
      if (info.pb) pbEnd(ctx, info, 'reset', plan);
      resetPossession(ctx, info, plan, tShot, holder);
      return;
    }
    if (!ctx.P.play || ctx.P.play === 'none') { ctx.P.play = info.play; ctx.P.setName = info.setName || ''; }
    if (!forcePlan) {
      // (a called play too: its read open before it could be run, the look is taken and the play is not; not the coach's own
      // call nor one drawn up in a timeout, which are run)
      if (info.pb) {
        const r = info.pb.rec;
        if (!r.user && !r.ato && !info.pb.inbound && lookEvents(ctx, info, plan, tShot, contest, mode)) r.look = true;
        else pbEvents(ctx, info, plan, tShot, 'shot');
        pbEnd(ctx, info, 'shot', plan);
      } else playEvents(ctx, info, plan, tShot, contest, mode);
    }
    ctx.t = tShot;
    const loc = locFor(ctx, zone, kind, plan.near);
    if (kind === 'heave') {
      const bx = basketX(O.idx, g.period), dir = dirX(O.idx, g.period);
      loc.x = U.round(U.clamp(bx - dir * U.range(35, 70), 2, 92), 1); loc.y = U.round(U.range(12, 38), 1); loc.d = Math.round(Math.hypot(loc.x - bx, loc.y - 25));
    }
    const pts = is3(zone) || kind === 'heave' ? 3 : 2;
    const shot = {
      type: 'shot', t: U.round(ctx.t, 2), team: O.idx, shooter: sh.id, pts, zone, kind, x: loc.x, y: loc.y, dist: loc.d,
      contest, defender: d.id, assist: plan.assister ? plan.assister.id : null, made: undefined, blocked: false, blocker: null,
      fouled: false, fouler: null, andOne: false, pending: false,
      // how he got the look (for the live view and the broadcast): beat his man, got open, or a tough shot over him
      created: contest === 'open' ? (lookKind(plan) === 'dribble' ? 'beat' : lookKind(plan) === 'catch' ? 'open' : 'inside') : contest === 'tight' ? 'tough' : null,
    };
    if (ctx.read && !g.lite) shot.read = ctx.read;
    if (info.pb && info.pb.rec && !g.lite) { const r = info.pb.rec; shot.pb = { id: r.id, opt: r.opt, at: r.at, early: r.early }; }
    const pending = { plan, sh, d, zone, kind, contest, info, pts, loc };
    if (ctx.P.gim && !ctx.gimShotDone) {
      shot.pending = true;
      shot.gim = true;
      ctx.pendingShot = shot;
      ctx.pendingData = pending;
      if (!g.lite) ctx.P.events.push(shot);
      return;
    }
    resolveShot(ctx, shot, pending, null);
  }

  /** quality: null (normal) or {quality, score} from the GIM shot meter */
  function resolveShot(ctx, shot, data, quality) {
    const g = ctx.g, O = ctx.O, D = ctx.D;
    const { sh, d, zone, kind, contest, info, pts, plan } = data;
    let pMake = makeProb(ctx, sh, zone, kind, contest, d, info);
    const xpMake = pMake;
    let pBlock = kind === 'heave' ? 0 : blockProb(ctx, zone, sh, d);
    let pFoul = shootingFoulProb(ctx, zone, sh, d, kind);
    if (quality) {
      const q = quality.quality;
      if (q === 'perfect') { pMake = Math.min(0.96, pMake + 0.42); pBlock *= 0.2; }
      else if (q === 'good') { pMake = Math.min(0.9, pMake + 0.17); pBlock *= 0.6; }
      else if (q === 'early' || q === 'late') { pMake = pMake * 0.72; }
      else if (q === 'very_early' || q === 'very_late') { pMake = pMake * 0.3; pBlock *= 1.5; }
      else { pMake = 0.02; pFoul = 0; }
      shot.gimQuality = q;
    }
    const blocked = U.chance(pBlock);
    const fouled = !blocked && U.chance(pFoul);
    let made = !blocked && U.chance(fouled ? pMake * 0.5 : pMake);
    shot.made = made; shot.blocked = blocked; shot.fouled = fouled; shot.andOne = made && fouled;
    // (for the court's aim, Match.Aim: how likely the make was, and how he felt taking it)
    shot.pm = U.round(pMake, 3); shot.conf = U.round(sh.conf, 2);
    // (play tracking: the first shot of the possession and of a called play, with its expected points)
    {
      const xp = U.round(xpMake * pts, 3);
      if (!ctx.P.sq) ctx.P.sq = { q: contest, xp, zone };
      const r = info && info.pb && info.pb.rec;
      if (r && r.q == null) { r.q = contest; r.xp = xp; r.made = made; r.fouledShot = fouled && !made; r.zone = zone; }
    }
    // (each team's field goal attempts and makes by zone tonight, for the coaches' reads, js/core/adjust.js; a missed
    // shot on a shooting foul is not an attempt)
    if (made || !fouled) { const zt = g.zt || (g.zt = [{}, {}]); const a = zt[O.idx][zone] || (zt[O.idx][zone] = [0, 0]); a[0]++; if (made) a[1]++; }
    if (Sim.debug) { const z = Sim.debug[zone] || (Sim.debug[zone] = [0, 0, 0, 0]); if (made || !fouled) z[1]++; if (made) z[0]++; if (blocked) z[2]++; if (fouled) z[3]++; }
    if (Sim.debugConf) { const cf = Sim.debugConf; cf[0] += sh.conf; cf[1]++; cf[2] += sh.conf * sh.conf; }
    shot.pending = false;
    // stats (a missed shot on a shooting foul is not a field-goal attempt)
    if (made || !fouled) { sh.st.fga++; if (pts === 3) sh.st.tpa++; }
    if (made) {
      sh.st.fgm++; sh.st.pts += pts; if (pts === 3) sh.st.tpm++;
      if (plan.assister) plan.assister.st.ast++;
    } else {
      shot.assist = null;
    }
    // confidence: by how far the result beat what was expected of it (a make he was expected to miss lifts him most, a miss
    // he should have made hurts most; on average it comes to nothing), a three more, a block and an and-one on top
    if (kind !== 'heave' && !(fouled && !made)) {
      const dm = ((made ? 1 : 0) - pMake) * Sim.K.confShot * (pts === 3 ? 1.2 : 1) + (blocked ? -0.08 : 0) + (made && fouled ? 0.08 : 0) + (made && (kind === 'dunk' || kind === 'alley') ? 0.04 : 0);
      confMove(ctx, sh, dm);
    }
    if (blocked) { d.st.blk++; shot.blocker = d.id; confMove(ctx, d, Sim.K.confBlk); }
    if (fouled) { shot.fouler = d.id; }
    const dist = shot.dist;
    if (blocked) shot.text = U.pick([`${d.last} BLOCKS ${sh.last}!`, `Rejected! ${d.last} swats ${sh.last}'s shot`, `${d.last} with the block on ${sh.last}`]);
    else shot.text = made ? TXT.made(sh, kind, zone, dist, plan.assister, shot.andOne) : TXT.missed(sh, kind, zone, dist);
    if (!g.lite) {
      if (!ctx.P.events.includes(shot)) ctx.P.events.push(shot);
      g.pbp.push({ q: g.period, clock: Math.max(0, g.clock - shot.t), team: O.idx, text: shot.text, type: 'shot', score: null, possN: ctx.P.n, made, pts });
    }
    if (made) addPoints(ctx, O.idx, pts);
    if (ctx.P.gim && quality) {
      g.gimLog.push({ q: g.period, clock: g.clock - shot.t, shooter: sh.id, kind, zone, quality: quality.quality, made, scoreAfter: g.score.slice() });
    }
    // foul handling
    if (fouled) {
      const n = made ? 1 : pts;
      commitFoul(ctx, d, sh, 'shooting', n, shot.t);
      freeThrows(ctx, sh, n, shot.t);
      return;
    }
    if (made) {
      ctx.done = true; ctx.endT = shot.t;
      g.nextStart = 'made_basket';
      return;
    }
    rebound(ctx, shot, zone);
  }

  function commitFoul(ctx, fouler, fouled, kind, fts, t) {
    const g = ctx.g;
    const team = ctx.O.on.includes(fouler) ? ctx.O : ctx.D;
    fouler.pf++; fouler.st.pf++;
    const clockLeft = g.clock - t;
    if (kind !== 'offensive') {
      team.fouls++;
      if (clockLeft <= 120) team.fouls2++;
    }
    const label = { shooting: 'Shooting foul', personal: 'Personal foul', loose_ball: 'Loose ball foul', offensive: 'Offensive foul', intentional: 'Take foul', hack: 'Foul on purpose' }[kind] || 'Foul';
    evAt(ctx, t, 'foul', { fouler: fouler.id, on: fouled ? fouled.id : null, kind, fts, team: team.idx, text: `${label} on ${fouler.last} (${fouler.pf} PF)` });
    if (fouler.pf >= g.L.foulOut) {
      fouler.out = true;
      if (!g.lite) g.pbp.push({ q: g.period, clock: Math.max(0, g.clock - t), team: team.idx, text: `${fouler.name} has fouled out`, type: 'note', score: g.score.slice(), possN: ctx.P.n });
    }
  }

  function freeThrows(ctx, c, n, t) {
    const g = ctx.g, O = ctx.O;
    let lastMade = false;
    for (let i = 1; i <= n; i++) {
      const pFt = ftProb(ctx, c), made = U.chance(pFt), cf = c.conf || 0;
      confMove(ctx, c, ((made ? 1 : 0) - pFt) * Sim.K.confFt);
      c.st.fta++;
      if (made) { c.st.ftm++; c.st.pts++; }
      evAt(ctx, t, 'ft', { shooter: c.id, made, num: i, of: n, team: O.idx, pm: U.round(pFt, 3), conf: U.round(cf, 2), text: `${c.last} ${made ? 'makes' : 'misses'} free throw ${i} of ${n}` });
      if (made) addPoints(ctx, O.idx, 1);
      lastMade = made;
    }
    if (lastMade) {
      ctx.done = true; ctx.endT = t;
      g.nextStart = 'ft_made';
      return;
    }
    // missed last FT → rebound (mostly defense)
    rebound(ctx, { t, ft: true }, 'ft');
  }

  function teamReb(T, key) {
    const vals = T.on.map(c => c.r[key]).sort((a, b) => b - a);
    const w = [0.32, 0.26, 0.2, 0.13, 0.09];
    return U.sum(vals, (v, i) => v * w[i]);
  }

  function rebound(ctx, shot, zone) {
    const g = ctx.g, O = ctx.O, D = ctx.D, L = g.L;
    const tReb = Math.min(g.clock, shot.t + (shot.ft ? 0.6 : shot.blocked ? U.range(0.5, 1.1) : U.range(1.1, 2.0)));
    if (tReb >= g.clock - 0.05) {
      ctx.t = g.clock;
      endPeriod(ctx);
      return;
    }
    ctx.t = tReb;
    const bx = basketX(O.idx, g.period), dir = dirX(O.idx, g.period);
    // blocked out of bounds → offense keeps it
    if (shot.blocked && U.chance(0.32)) {
      ev(ctx, 'rebound', { player: null, team: O.idx, off: true, text: `Ball out of bounds, ${O.team.name} ball` });
      const scLeft = ctx.scStart + ctx.scLen - ctx.t;
      const ie = ev(ctx, 'inbound', { by: pickInbounder(O, ctx.handler).id, to: ctx.handler.id, spot: 'baseline', x: dir > 0 ? 95 : -1, y: U.round(U.range(18, 32), 1), team: O.idx });
      ctx.scStart = ctx.t; ctx.scLen = Math.max(5, Math.min(24, scLeft));
      ctx.newPlay = true; ctx.putbackBy = null;
      ctx.advT = ctx.t;
      ctx.inbound = { kind: 'baseline', ev: ie };
      return;
    }
    if (U.chance(0.03)) {
      // out of bounds off the offense → defense ball
      ev(ctx, 'rebound', { player: null, team: D.idx, off: false, text: `Out of bounds, ${D.team.name} ball` });
      ctx.done = true; ctx.endT = ctx.t;
      g.nextStart = 'dead_ball';
      g.nextSpot = { kind: 'baseline', x: bx + dir * 6.5, y: U.round(U.range(18, 32), 1), front: false };
      return;
    }
    let x = U.logit(L.key === 'women' ? 0.262 : 0.262);
    x += (teamReb(O, 'oreb') - 60) / 10 * 0.32 - (teamReb(D, 'dreb') - 68) / 10 * 0.32;
    x += Math.log(C.CRASH[O.strat.crash].oreb) + Math.log(C.OFFENSES[O.strat.off].mods.oreb || 1) + Math.log(C.DEFENSES[D.strat.def].mods.oreb || 1);
    if (is3(zone)) x += 0.08;
    if (zone === 'ft') x -= 1.25;
    const exGlass = coastExcess(g, g.score[O.idx] - g.score[1 - O.idx]); // a team up big stops crashing the glass
    if (exGlass > 2) x -= Math.min(0.6, (exGlass - 2) * 0.022) * Sim.K.coast;
    x -= (1 - avgEnergy(O) / 100) * 0.2;
    x += g.sl.oreb + 0.3 * avgDev(O, 'crash');       // slider + how hard this five crashes the glass
    const off = U.chance(U.sigmoid(x));
    const T = off ? O : D;
    const key = off ? 'oreb' : 'dreb';
    const posF = { 1: 0.72, 2: 0.8, 3: 0.95, 4: 1.1, 5: 1.22 };
    const reb = U.pickW(T.on, c => Math.pow(c.r[key] / 50, 1.15) * posF[c.posN] * (0.7 + c.r.hustle / 230) * (c.id === shot.shooter ? 0.8 : 1) * (off ? c.tn.f.crash : 1));
    reb.st[off ? 'orb' : 'drb']++;
    const rd = zone === 'ft' ? U.range(3, 7) : is3(zone) ? U.range(5, 14) : zone === 'mid' ? U.range(4, 11) : U.range(2, 8);
    const ra = U.range(-1.3, 1.3);
    const spot = { x: U.round(U.clamp(bx - dir * rd * Math.cos(ra), 1, 93), 1), y: U.round(U.clamp(25 + rd * Math.sin(ra), 2, 48), 1) };
    ev(ctx, 'rebound', Object.assign({ player: reb.id, team: T.idx, off, text: off ? `${reb.last} offensive rebound` : `${reb.last} defensive rebound` }, spot));
    if (off) {
      ctx.scStart = ctx.t; ctx.scLen = Math.min(L.orebShotClock, Math.max(1, g.clock - ctx.t));
      ctx.putbackBy = null; ctx.newPlay = true;
      // the putback (the gameplay pass: an offensive rebounder open in the paint kicked it back out): taken straight back up
      // by how close to the rim he got it (all the way from ~4 ft, none from ~11), a big and a finisher more (NBA tracking: about
      // half of the possessions after an offensive rebound end in a shot at the rim, most of them putbacks)
      const near = U.clamp((11 - rd) / 7, 0, 1), fin = (reb.r.close * 0.5 + reb.r.layup * 0.3 + reb.r.dunk * 0.2 - 60) / 100;
      const pbP = U.clamp(0.1 + 0.62 * near + (reb.posN >= 4 ? 0.08 : 0) + fin - (zone === 'ft' ? 0.1 : 0), 0.05, 0.85);
      if (U.chance(pbP)) ctx.putbackBy = reb;
      ctx.handler = ctx.putbackBy ? reb : pickHandler(O);
      ctx.advT = ctx.t;
      ctx.transition = false;
      return;
    }
    ctx.done = true; ctx.endT = ctx.t;
    g.lastRebounder = reb.id;
    g.nextStart = 'dreb';
    g.nextSpot = spot;
  }

  /** an outlet pass going wrong (the gameplay pass: every outlet connected): Sim.K.outletTO a pass, less for a passer who
   *  sees the floor and throws it well, more against a defense with quick hands that gambles on the lanes (research: live-ball
   *  turnovers in transition are the costly ones; a pass back up the floor with the momentum going the other way is the one a
   *  guard sitting in the lane jumps); the turnovers slider scales it with the rest */
  function outletTOProb(ctx, passer) {
    const g = ctx.g, D = ctx.D;
    let p = Sim.K.outletTO;
    p *= Math.pow(0.96, ((passer.r.pass * 0.6 + passer.r.vision * 0.4) - 60) / 5);
    p *= Math.pow(1.03, (avgOn(D, 'steal') - 62) / 2);
    p *= Math.exp(0.25 * avgDev(D, 'gamble'));
    p *= g.toMult[ctx.O.idx];
    return U.clamp(p, 0.008, 0.12);
  }
  /** the outlet turned over: a bad pass by the one throwing it, meant for the handler, in the backcourt (stolen by a guard in the
   *  lane, or away out of bounds) */
  function outletTurnover(ctx, passer, handler) {
    const bx = basketX(ctx.O.idx, ctx.g.period), dir = dirX(ctx.O.idx, ctx.g.period);
    const info = mkInfo('transition', '', handler);
    info.noSet = true; info.toBy = passer; info.toTo = handler; info.outlet = true;
    info.spotX = U.clamp(bx - dir * U.range(55, 72), 3, 91);
    turnover(ctx, info, ctx.t, 'bad_pass');
  }
  function turnover(ctx, info, t, forceKind) {
    const g = ctx.g, O = ctx.O, D = ctx.D;
    // (where this part of the possession began: after a reset, the play before it already has its events up to here)
    const tSeg = Math.max(ctx.t, ctx.advT || 0);
    ctx.t = Math.min(t, g.clock);
    // (offensive three seconds: ~0.07 per team per game in recent seasons, about 0.5% of turnovers)
    const kinds = { bad_pass: 40, lost_ball: 33, offensive_foul: 11, travel: 7, out_of_bounds: 5, shot_clock: 2.5, three_seconds: 0.5 };
    if (ctx.press && ctx.segN <= 1) { kinds.bad_pass += 10; kinds.lost_ball += 10; }
    const kind = forceKind || U.pickKey(kinds);
    const handler = info.handler || ctx.handler;
    let who;
    switch (kind) {
      case 'bad_pass': who = U.pickW(O.on, c => (c === handler ? 3 : 1) * (100 - c.r.pass) * (c.r.vision / 60)); break;
      case 'lost_ball': who = U.chance(0.6) ? handler : U.pickW(O.on, c => (100 - c.r.handle) * usageW(ctx, c)); break;
      case 'offensive_foul': who = U.pickW(O.on, c => (c === handler ? 2 : 1) * (c.r.strength / 60) * (info.screener === c ? 2 : 1)); break;
      case 'three_seconds': who = U.pickW(O.on, c => c.posN); break;
      case 'shot_clock': case 'eight_seconds': who = null; break;
      case 'backcourt': who = handler; break;
      default: who = U.pickW(O.on, c => (c === handler ? 2 : 1) * (100 - c.r.handle));
    }
    if (info.toBy) who = info.toBy;
    if (who) { who.st.tov++; confMove(ctx, who, -Sim.K.confTo); }
    if (!ctx.P.play || ctx.P.play === 'none') { ctx.P.play = info.play === 'putback' ? 'none' : info.play; ctx.P.setName = info.setName || ''; }
    ctx.P.tok = kind;
    if (info.pb) {
      pbCut(ctx, info, ctx.t, 'turnover');
      // (play tracking: a bad pass on a step that passes the ball was a pass the defense denied; an offensive foul on
      // the play's screener, an illegal screen)
      const r = info.pb.rec;
      r.tok = kind; r.toScr = kind === 'offensive_foul' && !!who && who === info.screener; r.passStep = pbPassStep(info.pb.play, r.step);
    }
    else if (info.play && !info.noSet && info.play !== 'transition' && info.play !== 'putback' && !g.lite && ctx.t - Math.max(ctx.t, ctx.advT) >= 0) {
      if (ctx.t - tSeg > 1.5) {
        evAt(ctx, U.round(tSeg + 0.4, 2), 'set', { play: info.play, setName: info.setName, handler: handler.id, team: O.idx });
        // (the ball moved on quickly meanwhile, ending with the man who loses it: Sim.K.flow*)
        if (who) flowTouches(ctx, ctx.handler, tSeg + 0.4 + U.range(Sim.K.flowLeadS[0], Sim.K.flowLeadS[1]), ctx.t - 0.5, who);
      }
    }
    const ss = g.sl.stl;   // steals slider: share of live-ball turnovers that are steals
    const stolen = (kind === 'bad_pass' && U.chance(ss === 1 ? Sim.K.stlBad : 1 - Math.pow(1 - Sim.K.stlBad, ss))) || (kind === 'lost_ball' && U.chance(ss === 1 ? Sim.K.stlLost : 1 - Math.pow(1 - Sim.K.stlLost, ss)));
    const bx = basketX(O.idx, g.period), dir = dirX(O.idx, g.period);
    const spotX = info.spotX != null ? info.spotX : ctx.press && ctx.segN <= 1 ? U.clamp(bx - dir * U.range(50, 75), 3, 91) : U.clamp(bx - dir * U.range(10, 30), 3, 91);
    const spot = { x: U.round(spotX, 1), y: U.round(U.range(6, 44), 1) };
    // (an 8-second violation happens in the backcourt, a backcourt violation just behind the half-court line)
    if (kind === 'eight_seconds') spot.x = U.round(47 - dir * U.range(6, 16), 1);
    if (kind === 'backcourt') spot.x = U.round(47 - dir * U.range(1, 4), 1);
    const label = { bad_pass: 'bad pass', lost_ball: 'lost ball', offensive_foul: 'offensive foul', travel: 'traveling', out_of_bounds: 'stepped out of bounds', shot_clock: 'shot clock violation', three_seconds: '3-second violation', eight_seconds: '8-second violation', backcourt: 'backcourt violation' }[kind];
    let stealer = null;
    if (stolen) {
      stealer = U.pickW(D.on, c => Math.pow(c.r.steal / 55, 1.5) * (c.r.agility / 70) * c.tn.f.gamble);
      stealer.st.stl++;
      confMove(ctx, stealer, Sim.K.confStl);
    }
    if (kind === 'offensive_foul' && who) {
      who.pf++; who.st.pf++;
      if (who.pf >= g.L.foulOut) who.out = true;
    }
    let text;
    if (stolen) text = info.outlet ? `${stealer.last} picks off the outlet from ${who.last}!` : kind === 'bad_pass' ? `${who.last} bad pass, stolen by ${stealer.last}` : `${stealer.last} strips ${who.last}!`;
    else if (info.outlet) text = `Turnover: ${who.last} throws the outlet away`;
    else if (kind === 'shot_clock') text = `Shot clock violation on the ${O.team.name}`;
    else if (kind === 'eight_seconds') text = `8-second violation on the ${O.team.name}: couldn't get it past half court`;
    else if (kind === 'offensive_foul') { const taker = matchupDefender(D, who, ctx); text = `Offensive foul on ${who.last}: ${taker.last} takes the charge`; }
    else text = `Turnover: ${who.last} (${label})`;
    ev(ctx, 'turnover', Object.assign({ player: who ? who.id : null, kind, stealer: stealer ? stealer.id : undefined, team: O.idx, text, to: info.toTo ? info.toTo.id : undefined, outlet: info.outlet || undefined }, spot));
    ctx.done = true; ctx.endT = ctx.t;
    if (stolen) {
      g.lastStealer = stealer.id;
      g.nextStart = 'steal'; g.nextSpot = spot;
    } else {
      g.nextStart = 'dead_ball';
      // inbound for the other team: sideline near the spot (their backcourt if in their defensive end)
      const side = spot.y > 25 ? 51 : -1;
      g.nextSpot = { kind: 'sideline', x: spot.x, y: side, front: false };
      if (kind === 'shot_clock' || kind === 'three_seconds') g.nextSpot = { kind: 'baseline', x: dir > 0 ? 95 : -1, y: U.round(U.range(18, 32), 1), front: false };
      // backcourt and 8-second violations: the other team takes it out at the half-court line, in its frontcourt
      if (kind === 'eight_seconds' || kind === 'backcourt') g.nextSpot = { kind: 'sideline', x: basketX(D.idx, g.period) > 47 ? 48.5 : 45.5, y: U.chance(0.5) ? -1 : 51, front: true };
    }
  }

  function nonShootingFoul(ctx, info, t) {
    const g = ctx.g, O = ctx.O, D = ctx.D, L = g.L;
    ctx.t = Math.min(t, g.clock - 0.05);
    const fouler = U.pickW(D.on, c => (100 - c.r.helpD) * (0.6 + c.r.steal / 150) * (c.pf >= foulLimit(g.period, L) ? 0.4 : 1) * c.tn.f.foul);
    const fouled = U.chance(0.55) ? (info.handler || ctx.handler) : U.pickW(O.on, c => c.r.drawFoul);
    const clockLeft = g.clock - ctx.t;
    if (info.pb) pbCut(ctx, info, ctx.t, 'foul');
    // is this foul in the bonus? (counts the foul itself)
    const willBonus = D.fouls + 1 >= L.bonus || (clockLeft <= 120 && D.fouls2 + 1 >= 2);
    const kind = U.chance(0.75) ? 'personal' : 'loose_ball';
    if (!ctx.P.play || ctx.P.play === 'none') { ctx.P.play = info.play; ctx.P.setName = info.setName || ''; }
    commitFoul(ctx, fouler, fouled, kind, willBonus ? 2 : 0, ctx.t);
    if (willBonus) { freeThrows(ctx, fouled, 2, ctx.t); return; }
    // side out, possession continues
    const bx = basketX(O.idx, g.period), dir = dirX(O.idx, g.period);
    const x = U.round(U.clamp(bx - dir * U.range(18, 32), 3, 91), 1);
    const ie = ev(ctx, 'inbound', { by: pickInbounder(O, ctx.handler).id, to: ctx.handler.id, spot: 'sideline', x, y: U.chance(0.5) ? -1 : 51, team: O.idx });
    const scLeft = ctx.scStart + ctx.scLen - ctx.t;
    ctx.scStart = ctx.t; ctx.scLen = Math.max(L.orebShotClock, Math.min(L.shotClock, scLeft));
    ctx.advT = ctx.t; ctx.newPlay = true; ctx.transition = false; ctx.putbackBy = null;
    ctx.inbound = { kind: 'sideline', ev: ie };
  }

  function intentionalFoul(ctx, clockLeft) {
    const g = ctx.g, O = ctx.O, D = ctx.D, L = g.L;
    ctx.t = Math.min(ctx.t + U.range(0.6, 2.4), g.clock - 0.1);
    const fouler = U.minBy(D.on, c => c.pf * 10 + c.p.ovr / 10 + U.rand());
    const fouled = U.chance(0.6) ? U.maxBy(O.on, c => c.r.ft + U.rand() * 5) : ctx.handler;
    const willBonus = D.fouls + 1 >= L.bonus || (g.clock - ctx.t <= 120 && D.fouls2 + 1 >= 2);
    commitFoul(ctx, fouler, fouled, 'intentional', willBonus ? 2 : 0, ctx.t);
    if (willBonus) { freeThrows(ctx, fouled, 2, ctx.t); return; }
    const bx = basketX(O.idx, g.period), dir = dirX(O.idx, g.period);
    const ie = ev(ctx, 'inbound', { by: pickInbounder(O, ctx.handler).id, to: ctx.handler.id, spot: 'sideline', x: U.round(bx - dir * 28, 1), y: -1, team: O.idx });
    const scLeft = ctx.scStart + ctx.scLen - ctx.t;
    ctx.scStart = ctx.t; ctx.scLen = Math.max(L.orebShotClock, Math.min(L.shotClock, scLeft));
    ctx.advT = ctx.t; ctx.newPlay = true;
    ctx.inbound = { kind: 'sideline', ev: ie };
  }

  /** the hack: a foul on purpose on a poor free throw shooter away from the ball, in the penalty (he shoots two) */
  function hackFoul(ctx, c) {
    const g = ctx.g, D = ctx.D;
    ctx.t = Math.min(ctx.t + U.range(1.2, 3.5), g.clock - 0.1);
    const fouler = U.minBy(D.on, x => x.pf * 10 + x.p.ovr / 10 + U.rand());
    commitFoul(ctx, fouler, c, 'hack', 2, ctx.t);
    D.adj.hack = null;
    PBC.Adjust.hacked(ctx, D, c);
    freeThrows(ctx, c, 2, ctx.t);
  }

  function endPeriod(ctx) {
    const g = ctx.g;
    ctx.t = g.clock;
    const last = g.period >= g.L.periods && g.score[0] !== g.score[1];
    const label = last ? 'Final' : g.period === 2 ? 'Halftime' : g.period >= g.L.periods ? (g.period === g.L.periods ? 'End of regulation' : 'End of overtime') : `End of the ${U.ordinal(g.period)} quarter`;
    ev(ctx, 'period_end', { text: label });
    stampScore(ctx);
    ctx.done = true; ctx.periodOver = true; ctx.endT = g.clock;
  }

  // ---- finishing a possession ----
  function tick(g, dt) {
    for (const T of g.t) {
      const own = C.DEFENSES[T.strat.def].mods;
      const offF = C.OFFENSES[T.strat.off].mods.fatigue || 1;
      const presF = C.PRESSURE[T.strat.pressure].fatigue;
      const paceF = 1 + C.TEMPOS[T.strat.tempo].pace * 0.012;
      for (const c of T.players) {
        if (c.on) {
          c.sec += dt;
          const drain = 0.03 * (1.36 - c.r.stamina / 140) * (own.fatigue || 1) * offF * presF * paceF * g.sl.fatigue;
          c.energy = Math.max(15, c.energy - drain * dt);
        } else {
          c.energy = Math.min(100, c.energy + 0.05 * dt);
        }
      }
    }
  }

  function injuryCheck(ctx, dt) {
    const g = ctx.g;
    if (g.noInjuries) return;
    const im = g.sl.inj;
    if (!(im > 0)) return;          // injuries slider at 0: nobody gets hurt
    for (const T of g.t) for (const c of T.on) {
      if (c.inj) continue;
      const p = 0.0000105 * dt * (1.65 - c.r.durability / 100) * (c.energy < 50 ? 1.4 : 1) * im * T.medInj;
      if (U.chance(p)) {
        c.inj = true;
        c.injNew = PBC.Player.genInjury(g.sl.injSev);
        if (!g.lite) g.pbp.push({ q: g.period, clock: Math.max(0, g.clock - ctx.t), team: T.idx, text: `🚑 ${c.name} is hurt (${c.injNew.name}) and heads to the locker room`, type: 'injury', score: g.score.slice(), possN: ctx.P.n });
      }
    }
  }

  function finishPossession(ctx) {
    const g = ctx.g, P = ctx.P, L = g.L;
    let elapsed = U.clamp(ctx.endT != null ? ctx.endT : ctx.t, 0, g.clock);
    if (g.clock - elapsed <= 0.05 && !ctx.periodOver) { endPeriod(ctx); elapsed = g.clock; }
    tick(g, elapsed);
    injuryCheck(ctx, elapsed);
    g.clock = U.round(g.clock - elapsed, 3);
    if (g.period <= L.periods) g.elapsedReg += elapsed;
    if (g.clock <= 0.05) g.clock = 0;
    P.clockEnd = g.clock;
    P.endScore = g.score.slice();
    if (!P.play || P.play === 'none') P.play = ctx.transition ? 'transition' : ctx.info ? ctx.info.play : 'none';
    if (!P.setName && ctx.info) P.setName = ctx.info.setName || '';
    pbPossessionDone(ctx);
    logPossession(ctx);
    if (g.clock <= 0) {
      advancePeriod(g);
    } else {
      g.poss = 1 - P.off;
      if (g.nextStart === 'made_basket' || g.nextStart === 'ft_made') g.nextSpot = { x: dirX(g.poss, g.period) > 0 ? -1 : 95, y: 25 };
    }
    return P;
  }

  function advancePeriod(g) {
    const L = g.L;
    if (g.period >= L.periods && g.score[0] !== g.score[1]) { g.final = true; return; }
    g.period++;
    g.clock = g.period > L.periods ? L.otLen : L.quarterLen;
    for (const T of g.t) {
      T.fouls = 0; T.fouls2 = 0; T.qs[g.period - 1] = 0;
      const rest = g.period === 3 ? 32 : 9;
      for (const c of T.players) c.energy = Math.min(100, c.energy + rest);
    }
    if (g.period > L.periods) {
      g.nextStart = 'jump_ball';
      g.nextSpot = { x: 47, y: 25 };
      for (const T of g.t) T.timeouts = Math.max(T.timeouts, 2);
    } else {
      // Q2 & Q3: team that lost the tip; Q4: tip winner
      const loser = 1 - Math.max(0, g.tipWinner);
      g.poss = g.period === 4 ? Math.max(0, g.tipWinner) : loser;
      g.nextStart = 'period_start';
      g.nextSpot = { x: 47, y: 51 };
    }
    g.run = { team: -1, pts: 0 };
  }

  // ---------------------------------------------------------------------------
  // Game Impact Moments
  // ---------------------------------------------------------------------------
  Sim.gimCheck = function (g) {
    const S = g.S;
    if (g.final || g.pending || g.userIdx < 0 || g.poss !== g.userIdx) return null;
    if (!S.settings.gimEnabled) return null;
    if (g.nextStart === 'jump_ball') return null;
    const L = g.L;
    const lead = g.score[g.userIdx] - g.score[1 - g.userIdx];
    const clock = g.clock;
    let type = null;
    if (g.period >= L.periods && clock <= 120 && lead <= 2 && lead >= -5 && g.gimCount < 3 && g.lastGimClock - clock >= 25) type = 'clutch';
    if (g.period >= L.periods && clock <= 24 && lead <= 0 && lead >= -3 && g.gimCount < 4) type = 'clutch';
    if (!type && (g.period === 2 || g.period === 3) && clock <= 12 && clock >= 3 && !g.buzzerGim && U.chance(0.5)) type = 'buzzer';
    if (!type) return null;
    // leading and can run out the clock → no GIM
    if (lead > 0 && clock <= L.shotClock) return null;
    return Sim.gimOptions(g, type);
  };

  Sim.gimOptions = function (g, type) {
    const T = g.t[g.userIdx], D = g.t[1 - g.userIdx];
    const on = T.on;
    const lead = g.score[g.userIdx] - g.score[1 - g.userIdx];
    const need3 = lead === -3 || (lead <= -4 && g.clock <= 30);
    const ctx = { g, O: T, D, P: { gim: null }, t: 0, scStart: 0, scLen: 24, transition: false, segN: 1, starId: starOf(T), gimDefense: true };
    const est = (c, zone, kind, cKey, info) => {
      const d = shotDefender(ctx, c, zone);
      const w = CONTEST[cKey] || CONTEST.iso;
      const ps = ['open', 'contested', 'tight'].map(cl => makeProb(ctx, c, zone, kind, cl, d, info));
      const tot = w[0] + w[1] + w[2];
      const p = (ps[0] * w[0] + ps[1] * w[1] + ps[2] * w[2]) / tot;
      return p * (1 - blockProb(ctx, zone, c, d));
    };
    const star = on.find(c => c.id === T.strat.goTo1) || U.maxBy(on, c => scoreSkill(c.r));
    const shooter = U.maxBy(on.filter(c => c !== star), c => c.r.three);
    const big = U.maxBy(on.filter(c => c !== star), c => c.posN * 10 + (c.r.dunk + c.r.close) / 2);
    const handler = U.maxBy(on, c => c.r.handle + c.r.pass);
    const opts = [];
    const starBig = star.posN >= 4;
    if (starBig && star.r.three >= 80) {
      opts.push({ label: 'Pick & pop three', player: star.last, num: star.p.num, shooter: star.id, assist: handler !== star ? handler.id : null,
        detail: `${star.last} pops after the screen`, zone: 'ab3', kind: 'catch_shoot', hint: 'catch', contestKey: 'kick', play: 'pnr', handler: handler.id, screener: star.id, pts: 3 });
    } else if (starBig && star.r.post >= 62) {
      opts.push({ label: 'Post-up hook', player: star.last, num: star.p.num, shooter: star.id, assist: handler !== star ? handler.id : null,
        detail: `Feed ${star.last} on the block`, zone: 'paint', kind: 'hook', hint: 'post', contestKey: 'post', play: 'post', pts: 2 });
    } else {
      const starThree = star.r.three >= star.r.mid - 4;
      opts.push({
        label: starThree ? 'Pull-up three' : 'Mid-range pull-up', player: star.last, num: star.p.num, shooter: star.id,
        detail: `Isolation for ${star.name}`, zone: starThree ? 'ab3' : 'mid', kind: 'pullup', hint: 'iso', contestKey: 'iso', play: 'iso', pts: starThree ? 3 : 2,
      });
    }
    if (!need3) {
      const driver = U.maxBy(on.filter(c => c.posN <= 3), c => c.r.layup + c.r.handle * 0.6 + (c === star ? 6 : 0)) || star;
      opts.push({
        label: 'Attack the rim', player: driver.last, num: driver.p.num, shooter: driver.id,
        detail: `${driver.last} drives off a high screen`, zone: 'rim', kind: driver.r.dunk >= 92 ? 'dunk' : 'layup', hint: 'offDribble', contestKey: 'iso', play: 'pnr', handler: driver.id, screener: big.id, pts: 2,
      });
      if (big !== star) opts.push({
        label: 'Pick & roll lob', player: big.last, num: big.p.num, shooter: big.id, assist: handler !== big ? handler.id : null,
        detail: `${handler.last} hits ${big.last} rolling to the rim`, zone: 'rim', kind: big.r.dunk >= 80 ? 'alley' : 'layup', hint: 'roll', contestKey: 'post', play: 'pnr', handler: handler.id, screener: big.id, pts: 2,
      });
    }
    if (shooter && shooter !== star) opts.push({
      label: 'Corner three', player: shooter.last, num: shooter.p.num, shooter: shooter.id, assist: star.id,
      detail: `${star.last} draws two, kicks to ${shooter.last}`, zone: 'c3', kind: 'catch_shoot', hint: 'catch', contestKey: 'kick', play: 'spot', pts: 3,
    });
    if (need3 && opts.length < 3) {
      const s2 = U.maxBy(on.filter(c => c !== star && c !== shooter), c => c.r.three);
      if (s2) opts.push({ label: 'Stagger screen three', player: s2.last, num: s2.p.num, shooter: s2.id, assist: handler.id !== s2.id ? handler.id : null, detail: `${s2.last} comes off a stagger`, zone: 'ab3', kind: 'catch_shoot', hint: 'catch', contestKey: 'offscreen', play: 'offscreen', pts: 3 });
    }
    for (const o of opts) {
      const c = on.find(x => x.id === o.shooter);
      o.pct = U.round(est(c, o.zone, o.kind, o.contestKey, { play: o.play }), 3);
      o.pts = is3(o.zone) ? 3 : 2;
    }
    const q = g.period > g.L.periods ? 'OT' : U.periodName(g.period, true).replace('Q', '') + (g.period <= 4 ? (g.period === 1 ? 'ST' : g.period === 2 ? 'ND' : g.period === 3 ? 'RD' : 'TH') + ' QTR' : '');
    const situation = `${U.clock(g.clock, true)} · ${q} · ${lead > 0 ? 'UP ' + lead : lead < 0 ? 'DOWN ' + -lead : 'TIED'}`;
    return {
      type, situation, options: opts.slice(0, 4), userTeam: g.userIdx,
      teams: g.t.map(t => ({ abbr: t.team.abbr, score: g.score[t.idx], color: t.team.colors.primary })),
    };
  };

  /** Start a GIM possession with the chosen option; returns the possession (with a pending shot). */
  Sim.startGimPossession = function (g, option) {
    g.gimCount++;
    g.lastGimClock = g.clock;
    if (g.period === 2 || g.period === 3) g.buzzerGim = true;
    return Sim.nextPossession(g, { gim: option });
  };

  /** Resolve the pending GIM shot with the shot-meter result, then finish the possession. */
  Sim.resolvePending = function (g, P, quality) {
    const pend = g.pending;
    if (!pend) return P;
    const ctx = pend.ctx;
    g.pending = null;
    ctx.pendingShot = null;
    ctx.gimShotDone = true;
    const shot = P.pendingShot;
    resolveShot(ctx, shot, ctx.pendingData, quality || { quality: 'good' });
    if (!ctx.done) runSegments(ctx, {});
    finishPossession(ctx);
    P.pendingShot = null;
    return P;
  };

  // ---------------------------------------------------------------------------
  // Coach controls during a game
  // ---------------------------------------------------------------------------
  Sim.callTimeout = (g, idx) => { if (g.t[idx].timeouts > 0) g.t[idx].toRequest = true; };
  /** will the team's timeout request be granted when the next possession starts? (at a dead ball) */
  Sim.timeoutComing = (g, idx) => {
    const T = g.t[idx];
    return !!(T.toRequest && T.timeouts > 0 && !g.final && !g.pending && g.nextStart !== 'dreb' && g.nextStart !== 'steal');
  };
  /** the head coach's call: a play from the book for the team's next `n` half-court possessions (null: the staff calls
   *  them again) */
  Sim.callPlay = (g, idx, playId, n) => {
    const T = g.t[idx], PB = PBC.Playbook;
    const k = Math.max(1, Math.min(99, Math.round(n || 1)));
    T.userCall = playId && PB && PB.get(playId) ? { id: playId, left: k, n: k } : null;
  };
  /** the head coach's inbound play for the team's next throw-in under the basket ('blob') or from the sideline ('slob') in
   *  the front court (null: the staff's) */
  Sim.callInbound = (g, idx, fam, playId) => {
    const T = g.t[idx], PB = PBC.Playbook;
    if (fam !== 'blob' && fam !== 'slob') return;
    const p = playId && PB ? PB.get(playId) : null;
    T.userInb = Object.assign({ blob: null, slob: null }, T.userInb);
    T.userInb[fam] = p && p.family === fam ? playId : null;
  };
  /**
   * The head coach's defense: a scheme and a pick-and-roll coverage within man-to-man (null: the team's own) for the
   * next `n` defensive possessions, then back to what it played before (n = Infinity: from now on).
   */
  Sim.callDefense = (g, idx, def, cov, n) => {
    const T = g.t[idx];
    if (!C.DEFENSES[def]) return;
    if (PBC.Adjust && idx === g.userIdx) PBC.Adjust.userTook(g, idx);
    const prev = T.defCall ? T.defCall.prev : { def: T.strat.def, cov: T.pb ? T.pb.covCall || null : null };
    T.strat.def = def;
    if (T.pb) T.pb.covCall = cov || null;
    T.defCall = n === Infinity || n == null ? null : { def, cov: cov || null, left: Math.max(1, Math.round(n)), n: Math.round(n), prev };
  };
  /** the coach's calls in force: { play: { id, left, n }, inb, def: { def, cov, left, n } } */
  Sim.calls = (g, idx) => { const T = g.t[idx]; return { play: T.userCall || null, inb: Object.assign({ blob: null, slob: null }, T.userInb), def: T.defCall || null, cov: T.pb ? T.pb.covCall || null : null }; };
  Sim.queueSub = (g, idx, outId, inId) => { g.t[idx].manualSubs.push({ out: outId, in: inId }); };
  Sim.setAutoSubs = (g, idx, on) => { g.t[idx].autoSubs = !!on; };
  Sim.setStrategy = (g, idx, patch) => {
    Object.assign(g.t[idx].strat, patch);
    if (patch.def && PBC.Adjust && idx === g.userIdx) PBC.Adjust.userTook(g, idx);
  };
  // (for the coaches' adjustments, js/core/adjust.js: a line in a possession's events, a scheme's fit, a free throw
  // shooter's expected percentage)
  Sim.event = (ctx, type, fields) => ev(ctx, type, fields);
  Sim.defenseFitOf = (T, def) => defenseFitOf(T, def);
  Sim.ftExpect = (g, c) => U.clamp(Sim.K.ftA + 0.0066 * c.r.ft + g.L.ftBase + g.sl.ft, 0.3, 0.96);
  Sim.setTarget = (g, idx, pid, minutes) => { const c = g.t[idx].players.find(x => x.id === pid); if (c) c.target = minutes; };
  Sim.onCourt = (g, idx) => g.t[idx].on.map(c => c.id);

  // ---------------------------------------------------------------------------
  // Whole-game helpers
  // ---------------------------------------------------------------------------
  /** Simulate to the end (GIMs auto-resolved with an average release). */
  Sim.simulate = function (g) {
    let guard = 0;
    while (!g.final && guard++ < 2000) {
      const P = Sim.nextPossession(g);
      if (g.pending) Sim.resolvePending(g, P, { quality: 'good' });
    }
    return g;
  };

  function lineFromPc(c) {
    const s = c.st;
    return {
      pid: c.id, name: c.name, last: c.last, pos: c.pos, num: c.p.num, gs: s.gs ? 1 : 0, min: Math.round(c.sec / 60), sec: Math.round(c.sec),
      pts: s.pts, fgm: s.fgm, fga: s.fga, tpm: s.tpm, tpa: s.tpa, ftm: s.ftm, fta: s.fta, orb: s.orb, drb: s.drb,
      ast: s.ast, stl: s.stl, blk: s.blk, tov: s.tov, pf: s.pf, pm: s.pm, dnp: c.sec < 1 ? 1 : 0, energy: Math.round(c.energy),
      on: c.on ? 1 : 0, out: c.out ? 1 : 0, inj: c.inj ? 1 : 0,
    };
  }

  Sim.box = function (g) {
    const S = g.S, L = g.L;
    const box = {
      gid: g.gid, season: S.season, day: g.day, playoff: g.playoff, h: g.tids[0], a: g.tids[1], hs: g.score[0], as: g.score[1],
      ot: Math.max(0, g.period - L.periods), q: [g.t[0].qs.slice(), g.t[1].qs.slice()], teams: [], pog: null, gims: g.gimLog.slice(), final: g.final,
      period: g.period, clock: g.clock,
    };
    for (const T of g.t) {
      const players = T.players.map(lineFromPc);
      const tot = { tid: T.tid, pts: g.score[T.idx], fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, orb: 0, drb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0, poss: T.poss, players, timeouts: T.timeouts, fouls: T.fouls };
      for (const pl of players) for (const k of ['fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta', 'orb', 'drb', 'ast', 'stl', 'blk', 'tov', 'pf']) tot[k] += pl[k];
      box.teams.push(tot);
    }
    const w = g.score[0] >= g.score[1] ? 0 : 1;
    const best = U.maxBy(box.teams[w].players.filter(p => !p.dnp), p => PBC.Stats.gmsc(p));
    box.pog = best ? best.pid : null;
    if (g.stakesInfo) { box.stakes = g.stakes; box.stakesInfo = g.stakesInfo; }
    if (g.magic != null) box.magic = g.magic;
    // play tracking: each team's plays, how its possessions were played, its defense (js/core/playstats.js); copies,
    // so a box taken during a game (the live view's, before a possession is shown) keeps the numbers of that moment
    if (g.pstats) box.plays = JSON.parse(JSON.stringify(g.pstats));
    if (g.plog && !g.lite) box.plog = g.plog.slice();
    return box;
  };

  /** Final box + side effects on players (injuries). Returns box. */
  Sim.finalize = function (g) {
    const box = Sim.box(g);
    for (const T of g.t) for (const c of T.players) {
      if (c.injNew) {
        if (T.medDur !== 1 && c.injNew.days > 1) { c.injNew.days = Math.max(1, Math.round(c.injNew.days * T.medDur)); c.injNew.total = c.injNew.days; }
        c.p.injury = c.injNew;
      }
      // (confidence carried into the next game: a share of how far this one left him from where he came in, and some of
      // what he brought, so a hot week builds and a slump lingers a little)
      if (c.sec > 0) c.p.conf = U.round(U.clamp((c.conf - c.conf0) * Sim.K.confCarry + (+c.p.conf || 0) * 0.5, -0.3, 0.3), 3);
    }
    if (!g.lite) box.pbp = g.pbp;
    return box;
  };

  Sim.scoreSkill = scoreSkill;
  PBC.Sim = Sim;
})();
