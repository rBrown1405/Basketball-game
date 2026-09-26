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
    usageExp: 0.9, to: 0.183, toW: 0.205, stlBad: 0.72, stlLost: 0.85, shotTime: 13.6, shotTimeW: 14.1,
    zoneAdj: { rim: -0.38, paint: 0.02, mid: -0.12, c3: -0.3, ab3: -0.15 }, sfoul: 1.4, ftA: 0.25, nsfoul: 1.1, threeFreq: 1.08,
    coast: 1, // how much a team with a big lead lets up (shooting focus, glass, pressure); 0 = never
  };
  Sim.debug = null;

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

  function mkPc(p) {
    return {
      p, id: p.id, r: p.r, pos: p.pos, posN: C.POS_NUM[p.pos], energy: 100, sec: 0, pf: 0, on: false, starter: false,
      target: 0, hot: 0, out: false, inj: false, injNew: null, st: PBC.Stats.emptyLine(), last: p.last, name: PBC.Player.name(p),
      hgt: p.hgt, tn: tendProfile(p),
    };
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
    const players = active.map(p => { const c = mkPc(p); c.target = rot.minutes[p.id] || 0; return c; });
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
      fouls: 0, fouls2: 0, timeouts: L.timeouts, qs: [0], toRequest: false, autoSubs: true, autoTO: true,
      manualSubs: [], poss: 0, lastTimeoutClock: 9999,
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
    };
    const sl = g.sl = PBC.Sliders && PBC.Sliders.simMods ? PBC.Sliders.simMods(S) : Object.assign({}, SL_DEFAULT);
    const st = Sim.stakesFor(S, opts);
    g.stakes = st.stakes;
    g.stakesInfo = st.info;
    g.intensity = U.round(g.stakes * sl.po, 3);
    const I = Math.min(1.5, g.intensity);
    g.timeMult = 1 / sl.pace;
    g.usageExp = sl.usage * (1 + 0.35 * I);
    g.homeMult = sl.home * (1 + 0.5 * I);
    g.clutchMult = sl.clutch * (1 + 0.8 * I);
    g.t = [makeTeamCtx(S, g, homeTid, 0), makeTeamCtx(S, g, awayTid, 1)];
    if (g.userIdx >= 0) {
      const ut = g.t[g.userIdx];
      ut.autoTO = S.settings.autoTimeouts !== false;
    }
    setupForm(g);
    // per-team shooting (logit) and turnover adjustments: form, user-team handles, playoff defense
    g.shootAdj = [0, 1].map(i => g.form[i] + (i === g.userIdx ? sl.uShoot : 0) - (1 - i === g.userIdx ? sl.uDef : 0) - 0.03 * I);
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
    w *= 1 + c.hot * 0.08;
    w *= fatigueMult(c);
    // teammates get involved once someone has jacked up a lot of shots (later / softer with the star usage slider)
    w /= 1 + Math.max(0, c.st.fga + c.st.fta * 0.44 - (us === 1 ? 15 : 15 * Math.sqrt(us))) * (us === 1 ? 0.085 : 0.085 / us);
    // box-and-one on the opponent's top scorer
    if (ctx.D.strat.def === 'boxone' && ctx.starId === c.id) w *= C.DEFENSES.boxone.mods.starUsage;
    return w;
  }

  function starOf(T) { return U.maxBy(T.on, c => scoreSkill(c.r) + (T.strat.goTo1 === c.id ? 6 : 0)).id; }

  function name(c) { return c ? c.last : 'Team'; }

  function matchupDefender(D, off) {
    // closest position, tie → random
    let best = null, bd = 99;
    for (const d of U.shuffle(D.on)) { const dd = Math.abs(d.posN - off.posN); if (dd < bd) { bd = dd; best = d; } }
    return best;
  }

  function locFor(ctx, zone, kind) {
    const g = ctx.g, idx = ctx.O.idx;
    const bx = basketX(idx, g.period), dir = dirX(idx, g.period);
    const L = g.L;
    let d, a, x, y;
    const side = U.chance(0.5) ? 1 : -1;
    if (zone === 'rim') { d = kind === 'dunk' || kind === 'alley' || kind === 'tip' ? U.range(0.5, 2.5) : U.range(1.5, 4); a = U.range(-1.3, 1.3); }
    else if (zone === 'paint') { d = U.range(4.5, 12.5); a = U.range(-0.95, 0.95); }
    else if (zone === 'mid') { d = U.range(10, 21.5); a = U.range(-1.35, 1.35); }
    else if (zone === 'ab3') { d = U.range(L.threePt.arc + 0.3, L.threePt.arc + (kind === 'heave' ? 40 : U.chance(0.15) ? 5.5 : 2.6)); a = U.range(-1.1, 1.1); }
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
      if (andOne) s += ' — AND ONE!';
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
    return { g, P, O: g.t[P.off], D: g.t[1 - P.off], t: 0, scStart: 0, scLen: g.L.shotClock, done: false, segN: 0, transition: false, info: null, newPlay: true, advT: 0, frontcourt: false, periodOver: false, starId: null };
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
      events: [], endScore: null, gim: opts.gim || null,
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
    P.defScheme = ctx.D.strat.def;
    P.offSystem = ctx.O.strat.off; // the live view shapes its off-ball movement and ball movement on it
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
        ev(ctx, 'timeout', { team: T.idx, text: `Timeout: ${T.team.city} ${T.team.name}` });
        for (const c of T.on) c.energy = Math.min(100, c.energy + 5);
        if (g.run.team !== T.idx) g.run = { team: -1, pts: 0 };
        ctx.timeoutCalled = true;
      }
    }
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
      o.on = false; i.on = true;
      ev(ctx, 'sub', { team: idx, out: o.id, in: i.id, text: `${i.name} checks in for ${o.last}${o.out ? ' (fouled out)' : o.inj ? ' (injured)' : ''}` });
    }
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
        if (outlet) { ctx.t = U.range(0.4, 1.0); ev(ctx, 'pass', { from: reb.id, to: handler.id, kind: 'outlet', team: O.idx }); }
        ctx.transitionCandidate = true;
        break;
      }
      case 'steal': {
        const st = O.on.find(c => c.id === g.lastStealer) || handler;
        ctx.stealer = st;
        transP = 0.62;
        if (st.r.handle < 55 && st !== handler) { ctx.t = U.range(0.4, 0.9); ev(ctx, 'pass', { from: st.id, to: handler.id, kind: 'outlet', team: O.idx }); }
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
      ctx.transition = U.chance(U.clamp(transP * m, 0, 0.9));
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
      turnover(ctx, { play: 'none', handler: h, noSet: true }, t0 + 8.05, 'eight_seconds');
      return;
    }
    const tb = ctx.advT + U.range(0.4, 2.4);
    if (tb < g.clock - 0.3 && tb < t0 + 22 && U.chance(0.00095 * k)) turnover(ctx, { play: 'none', handler: h, noSet: true }, tb, 'backcourt');
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
    ev(ctx, 'inbound', { by: pickInbounder(O, ctx.handler).id, to: ctx.handler.id, spot: 'sideline', x: U.round(bx - dir * 13.75, 1), y: U.chance(0.5) ? -1 : 51, team: O.idx });
    const scLeft = ctx.scStart + ctx.scLen - ctx.t;
    ctx.scStart = ctx.t; ctx.scLen = Math.max(L.orebShotClock, Math.min(L.shotClock, scLeft));
    ctx.advT = ctx.t; ctx.newPlay = true; ctx.transition = false; ctx.putbackBy = null;
  }

  function heave(ctx) {
    const g = ctx.g, O = ctx.O;
    const sh = ctx.handler;
    const plan = { branch: 'heave', shooter: sh, assister: null, zone: 'ab3', kind: 'heave', cKey: 'lastShot', passKind: null };
    const info = { play: ctx.transition ? 'transition' : 'none', handler: sh, setName: '' };
    ctx.t = Math.max(0.2, g.clock - U.range(0.1, 0.45));
    takeShot(ctx, info, ctx.t, 'lastShot', {}, plan);
  }

  // ---- main loop ----
  function runSegments(ctx, opts) {
    let guard = 0;
    while (!ctx.done && !ctx.pendingShot && guard++ < 14) segment(ctx, opts);
    if (!ctx.done && !ctx.pendingShot) { // safety: end possession with a turnover (shot clock)
      turnover(ctx, { play: 'none', handler: ctx.handler }, Math.min(ctx.g.clock, ctx.t + 1), 'shot_clock');
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
    if (deficit <= 3 && clockLeft <= scLeft + 0.3 && clockLeft <= 24) return deficit === 3 ? ctx.foulUp3 != null ? ctx.foulUp3 : (ctx.foulUp3 = U.chance(0.25)) : true;
    return false;
  }

  function segment(ctx, opts) {
    const g = ctx.g, O = ctx.O, D = ctx.D;
    const clockLeft = g.clock - ctx.t;
    if (clockLeft <= 0.1) { endPeriod(ctx); return; }
    const scLeft = ctx.scStart + ctx.scLen - ctx.t;
    const mode = lateMode(ctx, clockLeft, scLeft);
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
    if (ctx.putbackBy) info = { play: 'putback', handler: ctx.putbackBy };
    else if (ctx.newPlay || !ctx.info) info = choosePlay(ctx, mode, opts);
    else info = ctx.info;
    ctx.info = info; ctx.newPlay = false;
    const tAct = actionTime(ctx, info, mode, clockLeft, scLeft);
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
      const mean = ((g.L.key === 'women' ? Sim.K.shotTimeW : Sim.K.shotTime) - paceAdj * 0.36) * g.timeMult + 0.45 * Math.min(1.5, g.intensity);
      const target = U.clamp(U.gauss(mean, 4.1 * g.timeMult), 2.5, ctx.scLen - 0.3);
      dt = Math.max(ctx.scStart + target - ctx.t, U.range(1.6, 3.2));
    }
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
    p *= C.DEFENSES[D.strat.def].mods.to || 1;
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
  function defenseFit(T) {
    const need = C.DEFENSES[T.strat.def].mods.needs;
    if (!need) return 0;
    if (need === 'versatile') return U.clamp((Math.min(...T.on.map(c => c.r.perD)) - 52) / 10, -1, 1);
    if (need === 'rim') return U.clamp((Math.max(...T.on.map(c => c.r.block)) - 74) / 8, -1, 1);
    return 0;
  }

  // ---- choose play & actors ----
  function choosePlay(ctx, mode, opts) {
    const O = ctx.O, D = ctx.D;
    const gim = ctx.P.gim;
    if (ctx.transition && ctx.segN === 0 && !gim) {
      const handler = ctx.handler;
      return { play: 'transition', handler, setName: U.pick(SET_NAMES.transition) };
    }
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
    let play = gim ? gim.play : U.pickKey(w);
    if (mode === 'hurry3' && !gim) play = U.pickKey({ pnr: 30, spot: 40, offscreen: 20, iso: 10 });
    const info = { play, setName: '' };
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

  function chooseZone(ctx, c, base, hint) {
    const O = ctx.O, D = ctx.D, g = ctx.g, L = g.L;
    const off = C.OFFENSES[O.strat.off].mods, dm = C.DEFENSES[D.strat.def].mods, fo = C.FOCUS[O.strat.focus].freq;
    const offDribble = hint === 'offDribble' || hint === 'iso' || hint === 'transition';
    const w = {};
    for (const z in base) {
      let v = base[z] * zoneTendency(c, z);
      if (is3(z)) v *= (off.three || 1) * L.threeRate * Sim.K.threeFreq * g.sl.three;
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
      return { branch, shooter, assister, zone: z, kind: gim.kind || chooseKind(ctx, z, hint, shooter, false), cKey, passKind };
    }
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
    if (!shooter) shooter = pickShooter(ctx, [], 'usage');
    if (assister === shooter) assister = null;
    if (force3) {
      // late game: need a three — best shooter, off the dribble or catch
      shooter = U.maxBy(O.on, c => c.r.three + usageW(ctx, c) * 6 + U.rand() * 4);
      base = { ab3: 75, c3: 25 }; hint = assister ? 'catch' : 'offDribble'; cKey = assister ? 'kick' : 'pnr_handler';
      if (assister === shooter) assister = null;
    }
    const zone = mode === 'lastShot' && ctx.heave ? 'ab3' : chooseZone(ctx, shooter, base, hint);
    let kind = chooseKind(ctx, zone, hint, shooter, lob);
    if (zone === 'rim' && kind !== 'alley' && lob) lob = false;
    if (kind === 'alley' && !assister) kind = 'dunk';
    if (mode === 'lastShot') cKey = 'lastShot';
    return { branch, shooter, assister, zone, kind, cKey, passKind, lob };
  }

  // ---- narrative events before the shot (for the live view) ----
  function playEvents(ctx, info, plan, tShot) {
    const g = ctx.g;
    if (g.lite) return;
    const O = ctx.O, idx = O.idx;
    const t0 = Math.max(ctx.t, ctx.advT);
    const span = Math.max(0.3, tShot - t0);
    const at = f => U.round(t0 + span * f, 2);
    const handler = info.handler || ctx.handler;
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
        evAt(ctx, at(0.3), 'screen', { screener: info.screener.id, user: handler.id, kind: 'ball', team: idx });
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
          const chain = U.shuffle(perimeter).slice(0, nPass - 1);
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
  function contestLevel(ctx, cKey, plan) {
    const O = ctx.O, D = ctx.D;
    const w = (CONTEST[cKey] || CONTEST.iso).slice();
    let open = (C.OFFENSES[O.strat.off].mods.open || 0) + (C.DEFENSES[D.strat.def].mods.open || 0) + C.PRESSURE[D.strat.pressure].open;
    open += (avgOn(O, 'vision') - 64) * 0.004 - ((avgOn(D, 'perD') + avgOn(D, 'helpD')) / 2 - 63) * 0.006;
    open += offenseFit(O) * 0.05 - defenseFit(D) * 0.05;
    if (ctx.transition && ctx.segN <= 1) open += 0.05;
    // defensive intensity slider, playoff effort, gamblers getting beaten
    const g = ctx.g;
    open += -g.sl.contest - 0.035 * Math.min(1.5, g.intensity) + 0.03 * avgDev(D, 'gamble');
    w[0] *= 1 + open * 3; w[2] *= 1 - open * 3;
    const i = U.pickW([0, 1, 2], w.map(x => Math.max(0.5, x)));
    return ['open', 'contested', 'tight'][i];
  }

  function shotDefender(ctx, shooter, zone) {
    const D = ctx.D;
    let d = matchupDefender(D, shooter);
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
    x += sh.hot * 0.03;
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
    if (ctx.O.idx === 1) p -= 0.004 * g.homeMult;
    return U.clamp(p, 0.3, g.sl.ft > 0 ? 0.96 + g.sl.ft * 0.25 : 0.96);
  }

  function takeShot(ctx, info, tShot, mode, opts, forcePlan) {
    const g = ctx.g, O = ctx.O, D = ctx.D;
    const plan = forcePlan || planShot(ctx, info, mode);
    const sh = plan.shooter;
    const zone = plan.zone;
    const kind = plan.kind;
    if (!ctx.P.play || ctx.P.play === 'none') { ctx.P.play = info.play; ctx.P.setName = info.setName || ''; }
    if (!forcePlan) playEvents(ctx, info, plan, tShot);
    ctx.t = tShot;
    const contest = kind === 'heave' ? 'tight' : contestLevel(ctx, plan.cKey, plan);
    const d = shotDefender(ctx, sh, zone);
    const loc = locFor(ctx, zone, kind);
    if (kind === 'heave') {
      const bx = basketX(O.idx, g.period), dir = dirX(O.idx, g.period);
      loc.x = U.round(U.clamp(bx - dir * U.range(35, 70), 2, 92), 1); loc.y = U.round(U.range(12, 38), 1); loc.d = Math.round(Math.hypot(loc.x - bx, loc.y - 25));
    }
    const pts = is3(zone) || kind === 'heave' ? 3 : 2;
    const shot = {
      type: 'shot', t: U.round(ctx.t, 2), team: O.idx, shooter: sh.id, pts, zone, kind, x: loc.x, y: loc.y, dist: loc.d,
      contest, defender: d.id, assist: plan.assister ? plan.assister.id : null, made: undefined, blocked: false, blocker: null,
      fouled: false, fouler: null, andOne: false, pending: false,
    };
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
    if (Sim.debug) { const z = Sim.debug[zone] || (Sim.debug[zone] = [0, 0, 0, 0]); if (made || !fouled) z[1]++; if (made) z[0]++; if (blocked) z[2]++; if (fouled) z[3]++; }
    shot.pending = false;
    // stats (a missed shot on a shooting foul is not a field-goal attempt)
    if (made || !fouled) { sh.st.fga++; if (pts === 3) sh.st.tpa++; }
    if (made) {
      sh.st.fgm++; sh.st.pts += pts; if (pts === 3) sh.st.tpm++;
      if (plan.assister) plan.assister.st.ast++;
      sh.hot = Math.min(3, sh.hot + 1);
    } else {
      shot.assist = null;
      sh.hot = Math.max(0, sh.hot - (U.chance(0.6) ? 1 : 0));
    }
    if (blocked) { d.st.blk++; shot.blocker = d.id; }
    if (fouled) { shot.fouler = d.id; }
    const dist = shot.dist;
    if (blocked) shot.text = U.pick([`${d.last} BLOCKS ${sh.last}!`, `Rejected! ${d.last} swats ${sh.last}'s shot`, `${d.last} with the block on ${sh.last}`]);
    else shot.text = made ? TXT.made(sh, kind, zone, dist, plan.assister, shot.andOne) : TXT.missed(sh, kind, zone, dist);
    if (!g.lite) {
      if (!ctx.P.events.includes(shot)) ctx.P.events.push(shot);
      g.pbp.push({ q: g.period, clock: Math.max(0, g.clock - shot.t), team: O.idx, text: shot.text, type: 'shot', score: null, possN: ctx.P.n, made, pts });
    }
    if (made) addPoints(ctx, O.idx, pts);
    if (sh.hot === 3 && made && !g.lite && U.chance(0.5)) g.pbp.push({ q: g.period, clock: Math.max(0, g.clock - shot.t), team: O.idx, text: `🔥 ${sh.last} is heating up!`, type: 'note', score: g.score.slice(), possN: ctx.P.n });
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
    const label = { shooting: 'Shooting foul', personal: 'Personal foul', loose_ball: 'Loose ball foul', offensive: 'Offensive foul', intentional: 'Take foul' }[kind] || 'Foul';
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
      const made = U.chance(ftProb(ctx, c));
      c.st.fta++;
      if (made) { c.st.ftm++; c.st.pts++; }
      evAt(ctx, t, 'ft', { shooter: c.id, made, num: i, of: n, team: O.idx, text: `${c.last} ${made ? 'makes' : 'misses'} free throw ${i} of ${n}` });
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
      ev(ctx, 'rebound', { player: null, team: O.idx, off: true, text: `Ball out of bounds — ${O.team.name} ball` });
      const scLeft = ctx.scStart + ctx.scLen - ctx.t;
      ev(ctx, 'inbound', { by: pickInbounder(O, ctx.handler).id, to: ctx.handler.id, spot: 'baseline', x: dir > 0 ? 95 : -1, y: U.round(U.range(18, 32), 1), team: O.idx });
      ctx.scStart = ctx.t; ctx.scLen = Math.max(5, Math.min(24, scLeft));
      ctx.newPlay = true; ctx.putbackBy = null;
      ctx.advT = ctx.t;
      return;
    }
    if (U.chance(0.03)) {
      // out of bounds off the offense → defense ball
      ev(ctx, 'rebound', { player: null, team: D.idx, off: false, text: `Out of bounds — ${D.team.name} ball` });
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
      const pbP = 0.26 + (reb.posN >= 4 ? 0.16 : 0) + (zone === 'rim' || zone === 'paint' ? 0.1 : 0) - (zone === 'ft' ? 0.1 : 0);
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

  function turnover(ctx, info, t, forceKind) {
    const g = ctx.g, O = ctx.O, D = ctx.D;
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
    if (who) who.st.tov++;
    if (!ctx.P.play || ctx.P.play === 'none') { ctx.P.play = info.play === 'putback' ? 'none' : info.play; ctx.P.setName = info.setName || ''; }
    if (info.play && !info.noSet && info.play !== 'transition' && info.play !== 'putback' && !g.lite && ctx.t - Math.max(ctx.t, ctx.advT) >= 0) {
      if (ctx.t - ctx.advT > 1.5) evAt(ctx, U.round(ctx.advT + 0.4, 2), 'set', { play: info.play, setName: info.setName, handler: handler.id, team: O.idx });
    }
    const ss = g.sl.stl;   // steals slider: share of live-ball turnovers that are steals
    const stolen = (kind === 'bad_pass' && U.chance(ss === 1 ? Sim.K.stlBad : 1 - Math.pow(1 - Sim.K.stlBad, ss))) || (kind === 'lost_ball' && U.chance(ss === 1 ? Sim.K.stlLost : 1 - Math.pow(1 - Sim.K.stlLost, ss)));
    const bx = basketX(O.idx, g.period), dir = dirX(O.idx, g.period);
    const spotX = ctx.press && ctx.segN <= 1 ? U.clamp(bx - dir * U.range(50, 75), 3, 91) : U.clamp(bx - dir * U.range(10, 30), 3, 91);
    const spot = { x: U.round(spotX, 1), y: U.round(U.range(6, 44), 1) };
    // (an 8-second violation happens in the backcourt, a backcourt violation just behind the half-court line)
    if (kind === 'eight_seconds') spot.x = U.round(47 - dir * U.range(6, 16), 1);
    if (kind === 'backcourt') spot.x = U.round(47 - dir * U.range(1, 4), 1);
    const label = { bad_pass: 'bad pass', lost_ball: 'lost ball', offensive_foul: 'offensive foul', travel: 'traveling', out_of_bounds: 'stepped out of bounds', shot_clock: 'shot clock violation', three_seconds: '3-second violation', eight_seconds: '8-second violation', backcourt: 'backcourt violation' }[kind];
    let stealer = null;
    if (stolen) {
      stealer = U.pickW(D.on, c => Math.pow(c.r.steal / 55, 1.5) * (c.r.agility / 70) * c.tn.f.gamble);
      stealer.st.stl++;
    }
    if (kind === 'offensive_foul' && who) {
      who.pf++; who.st.pf++;
      if (who.pf >= g.L.foulOut) who.out = true;
    }
    let text;
    if (stolen) text = kind === 'bad_pass' ? `${who.last} bad pass — stolen by ${stealer.last}` : `${stealer.last} strips ${who.last}!`;
    else if (kind === 'shot_clock') text = `Shot clock violation on the ${O.team.name}`;
    else if (kind === 'eight_seconds') text = `8-second violation on the ${O.team.name}: couldn't get it past half court`;
    else if (kind === 'offensive_foul') { const taker = matchupDefender(D, who); text = `Offensive foul on ${who.last} — ${taker.last} takes the charge`; }
    else text = `Turnover: ${who.last} (${label})`;
    ev(ctx, 'turnover', Object.assign({ player: who ? who.id : null, kind, stealer: stealer ? stealer.id : undefined, team: O.idx, text }, spot));
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
    // is this foul in the bonus? (counts the foul itself)
    const willBonus = D.fouls + 1 >= L.bonus || (clockLeft <= 120 && D.fouls2 + 1 >= 2);
    const kind = U.chance(0.75) ? 'personal' : 'loose_ball';
    if (!ctx.P.play || ctx.P.play === 'none') { ctx.P.play = info.play; ctx.P.setName = info.setName || ''; }
    commitFoul(ctx, fouler, fouled, kind, willBonus ? 2 : 0, ctx.t);
    if (willBonus) { freeThrows(ctx, fouled, 2, ctx.t); return; }
    // side out, possession continues
    const bx = basketX(O.idx, g.period), dir = dirX(O.idx, g.period);
    const x = U.round(U.clamp(bx - dir * U.range(18, 32), 3, 91), 1);
    ev(ctx, 'inbound', { by: pickInbounder(O, ctx.handler).id, to: ctx.handler.id, spot: 'sideline', x, y: U.chance(0.5) ? -1 : 51, team: O.idx });
    const scLeft = ctx.scStart + ctx.scLen - ctx.t;
    ctx.scStart = ctx.t; ctx.scLen = Math.max(L.orebShotClock, Math.min(L.shotClock, scLeft));
    ctx.advT = ctx.t; ctx.newPlay = true; ctx.transition = false; ctx.putbackBy = null;
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
    ev(ctx, 'inbound', { by: pickInbounder(O, ctx.handler).id, to: ctx.handler.id, spot: 'sideline', x: U.round(bx - dir * 28, 1), y: -1, team: O.idx });
    const scLeft = ctx.scStart + ctx.scLen - ctx.t;
    ctx.scStart = ctx.t; ctx.scLen = Math.max(L.orebShotClock, Math.min(L.shotClock, scLeft));
    ctx.advT = ctx.t; ctx.newPlay = true;
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
      const p = 0.0000105 * dt * (1.65 - c.r.durability / 100) * (c.energy < 50 ? 1.4 : 1) * im;
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
  Sim.queueSub = (g, idx, outId, inId) => { g.t[idx].manualSubs.push({ out: outId, in: inId }); };
  Sim.setAutoSubs = (g, idx, on) => { g.t[idx].autoSubs = !!on; };
  Sim.setStrategy = (g, idx, patch) => { Object.assign(g.t[idx].strat, patch); };
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
    return box;
  };

  /** Final box + side effects on players (injuries). Returns box. */
  Sim.finalize = function (g) {
    const box = Sim.box(g);
    for (const T of g.t) for (const c of T.players) {
      if (c.injNew) c.p.injury = c.injNew;
    }
    if (!g.lite) box.pbp = g.pbp;
    return box;
  };

  Sim.scoreSkill = scoreSkill;
  PBC.Sim = Sim;
})();
