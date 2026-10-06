/* Pro BBALL Coach: the head coaches' in-game adjustments (PBC.Adjust). No DOM.
 *
 * The play caller (js/core/playcall.js) already goes back to what works on offense. This is the other half: every bench
 * watches what the other team is doing to its defense and answers it at a dead ball, a timeout or a quarter break.
 *  - The read (Adjust.read): what is hurting the defense tonight, in points above what those possessions usually score
 *    in this league (their pick and roll, isolations, post-ups, spot-ups, off-screen action, hand-offs, cuts; threes;
 *    points at the rim and in the paint; one player going off; transition), shrunk toward nothing on a small sample.
 *  - The answer: a scheme that takes it away and that the five on the floor can play (switching needs versatile
 *    defenders, hedging mobile bigs, drop a rim protector), never one that opens up something else they are already
 *    hurting it with; stints of zone, box-and-one or a blitz; a surprise zone out of the other team's timeout (the NBA's
 *    zone possessions cluster there); everyone back on defense when the transition points pile up; staying home in foul
 *    trouble; the full-court press when behind late; the pace in the fourth; fouling a poor free throw shooter on purpose
 *    when in the penalty, never in the last two minutes of a quarter (and pulling your own player when it is done to you).
 *  - The judgment: a change that is not working goes back to what the team had (each scheme's points allowed tonight are
 *    tallied, js/core/playstats.js), a stint ends unless it is working, garbage time is left alone.
 * How quickly and how well a coach reads the game comes from him: his rating and style (a Tactician or a Defensive
 * specialist reads more; some coaches are stubborn). Your bench (your Tactician skill) makes the calls in a game you
 * sim; in a game you coach live it suggests (the Coach tab and the halftime locker room) unless you let it act, and it
 * never touches a defense you called.
 * Every change is a line in the play-by-play ('adjust' events) and in T.adj.log, for the broadcast and the reports. */
(function () {
  'use strict';
  const PBC = (window.PBC = window.PBC || {});
  const U = PBC.U, C = PBC.Config;
  const Adjust = (PBC.Adjust = {});

  // what a possession usually scores in this league (the calibrated engine, test/calibrate.js): half-court possessions by
  // the action they ended in (the play caller's tally), all half-court possessions, transition, field goals by zone
  const AVG = {
    men: { fam: { pnr: 1.07, iso: 1.03, post: 1.06, spot: 1.09, offscreen: 1.0, handoff: 1.05, cut: 1.31 }, hc: 1.146, trans: 1.22,
      zone: { rim: 0.656, paint: 0.431, mid: 0.409, c3: 0.376, ab3: 0.348 } },
    women: { fam: { pnr: 0.98, iso: 0.9, post: 0.95, spot: 0.96, offscreen: 0.89, handoff: 0.92, cut: 1.2 }, hc: 1.033, trans: 1.14,
      zone: { rim: 0.575, paint: 0.373, mid: 0.359, c3: 0.34, ab3: 0.326 } },
  };
  Adjust.AVG = AVG;
  const avgFor = g => (g.L && g.L.key === 'women' ? AVG.women : AVG.men);

  const FAM_TXT = { pnr: 'pick and roll', iso: 'isolations', post: 'post-ups', spot: 'spot-ups', offscreen: 'off-screen action', handoff: 'hand-offs', cut: 'cutters' };
  Adjust.FAM_TXT = FAM_TXT;
  // the answers to each problem (the coach weighs them by what they are worth, VAL, and what his five can play)
  const FIX = {
    pnr: ['drop', 'blitz', 'switch', 'hedge'],
    handoff: ['switch', 'packline', 'hedge'],
    offscreen: ['switch', 'pressure', 'packline'],
    spot: ['pressure', 'zone131', 'nothree'],
    cut: ['packline', 'zone23', 'man'],
    iso: ['packline', 'zone23', 'drop'],
    post: ['zone23', 'packline', 'drop'],
    three: ['pressure', 'nothree', 'zone131'],
    inside: ['packline', 'drop', 'zone23'],
    star: ['boxone', 'blitz'],
  };
  Adjust.FIX = FIX;
  // what each scheme is worth in this engine, points per 100 possessions against the average team's own (measured: one
  // team plays it all season, docs/ADJUST_NOTES.md; walling off the rim pays, chasing the three line costs). The coach
  // does not trade his defense for a counter that is clearly worse in general.
  const VAL = { packline: 1, drop: 1, zone131: 1, boxone: 0.8, pressure: 0.3, zone23: 0, zone32: -0.2, nothree: -0.2, blitz: -0.2, man: -0.4, switch: -0.4, hedge: -0.6, press: 0 };
  Adjust.VAL = VAL;
  // (how loud the three-point line and the paint are, against the plays: a hot night from three is mostly luck)
  const NOISY = { three: 25, inside: 18 };
  // schemes played in stints (the coach goes back to his own defense after a few trips unless it is working)
  const STINT = { zone23: 1, zone32: 1, zone131: 1, boxone: 1, blitz: 1, press: 1, pressure: 1 };
  const isZone = s => !!(C.DEFENSES[s] && C.DEFENSES[s].mods.isZone);
  // (team names are plural: "the Colonials go to a 2-3 zone")
  const GOES = {
    man: 'go back to man-to-man', switch: 'start switching everything', drop: 'drop the big back on the pick and roll',
    hedge: 'start hedging the pick and roll', blitz: 'start blitzing the pick and roll', zone23: 'go to a 2-3 zone',
    zone32: 'go to a 3-2 zone', zone131: 'go to a 1-3-1 zone', boxone: 'go to a box-and-one', press: 'pick up full court',
    packline: 'pack the paint', nothree: 'start running shooters off the line', pressure: 'get up into the ball',
  };
  const the = T => (T && T.team ? `The ${T.team.name}` : 'They');
  Adjust.GOES = GOES;
  const PACE = { vslow: -2, slow: -1, normal: 0, fast: 1, vfast: 2 };
  // (each part can be switched off, for the A/B measurements: tools in docs/ADJUST_NOTES.md)
  const ON = Adjust.on = { schemes: true, fouls: true, trans: true, pace: true, press: true, ato: true, hack: true };

  // ---------------------------------------------------------------------------
  // The coach
  // ---------------------------------------------------------------------------
  /** how well a bench reads the game (iq, 0..1) and how readily it changes (flex, 0..1) */
  function profile(g, T, user) {
    const S = g.S;
    if (user) {
      const L = PBC.Coach && PBC.Coach.skill ? PBC.Coach.skill(S, 'tac') : 0;
      return { iq: U.clamp(0.4 + 0.1 * L, 0, 1), flex: 0.7, style: 'staff' };
    }
    const of = PBC.Staff && PBC.Staff.of && S.coaches ? PBC.Staff.of(S, T.tid) : null;
    const rating = of && of.rating != null ? of.rating : (T.team && T.team.coachRating != null ? T.team.coachRating : 62);
    const style = of && of.c ? of.c.style : null;
    let iq = U.clamp((rating - 45) / 40, 0, 1);
    if (style === 'tactician') iq += 0.15; else if (style === 'defense') iq += 0.08;
    const h = (U.hash(`${T.tid}|${of && of.c ? of.c.id : 'x'}|flex`) % 1000) / 1000;
    let flex = 0.35 + 0.6 * h + (style === 'tactician' ? 0.15 : 0);
    return { iq: U.clamp(iq, 0, 1), flex: U.clamp(flex, 0.3, 1), style };
  }

  /** a new game: every bench's brain (T.adj). opts.live: a game the user coaches live (his bench then only suggests,
   *  unless S.settings.staffAdjust lets it act) */
  Adjust.setup = function (g, opts) {
    const S = g.S;
    g.live = !!(opts && opts.live);
    g.adj = true;
    for (const T of g.t) {
      const user = T.idx === g.userIdx;
      const pr = profile(g, T, user);
      T.adj = {
        user, on: !user || !g.live || !!(S.settings && S.settings.staffAdjust), iq: pr.iq, flex: pr.flex, style: pr.style,
        base: { def: T.strat.def, tempo: T.strat.tempo, crash: T.strat.crash, pressure: T.strat.pressure },
        cur: null, next: 8, last: -99, n: 0, log: [], hack: null, hacks: 0, tmp: null, manual: false, pressN: 0,
        trouble: false, sugg: null, back: false,
      };
    }
  };

  // ---------------------------------------------------------------------------
  // The read
  // ---------------------------------------------------------------------------
  /**
   * What is hurting team di's defense tonight, worst first: [{ k, pain, txt, ... }]. pain: points above what those
   * possessions usually score in this league, shrunk toward 0 on a small sample (k: an action of the play caller's,
   * 'three', 'inside', 'star' (c: the player), 'trans').
   */
  Adjust.read = function (g, di) {
    const O = g.t[1 - di], A = avgFor(g);
    const out = [];
    const fam = O.pb ? O.pb.fam : {};
    for (const f in A.fam) {
      const r = fam[f];
      if (!r || r.n < 3) continue;
      out.push({ k: f, pain: (r.pts - r.n * A.fam[f]) * r.n / (r.n + 6), n: r.n, pts: r.pts, txt: `their ${FAM_TXT[f]}: ${Math.round(r.pts)} points on ${Math.round(r.n)} trips` });
    }
    const zt = g.zt ? g.zt[1 - di] : null;
    if (zt) {
      let a3 = 0, m3 = 0, e3 = 0, ai = 0, mi = 0, ei = 0;
      for (const z of ['c3', 'ab3']) { const x = zt[z]; if (x) { a3 += x[0]; m3 += x[1]; e3 += x[0] * A.zone[z]; } }
      for (const z of ['rim', 'paint']) { const x = zt[z]; if (x) { ai += x[0]; mi += x[1]; ei += x[0] * A.zone[z]; } }
      if (a3 >= 5) out.push({ k: 'three', pain: 3 * (m3 - e3) * a3 / (a3 + NOISY.three), a: a3, m: m3, txt: `${m3} of ${a3} from three` });
      if (ai >= 6) out.push({ k: 'inside', pain: 2 * (mi - ei) * ai / (ai + NOISY.inside), a: ai, m: mi, txt: `${mi} of ${ai} at the rim and in the paint` });
    }
    // one player carrying them (a star takes about a quarter of his team's points)
    let star = null, second = 0;
    for (const c of O.players) {
      if (!star || c.st.pts > star.st.pts) { if (star) second = Math.max(second, star.st.pts); star = c; }
      else second = Math.max(second, c.st.pts);
    }
    if (star && star.st.pts >= 12) out.push({ k: 'star', pain: star.st.pts - 0.26 * g.score[1 - di] - 3, c: star, second, txt: `${star.last} has ${star.st.pts} points` });
    const st = g.pstats ? g.pstats[di] : null;
    if (st && st.dt[0] >= 3) {
      const n = st.dt[0], pts = st.dt[1];
      out.push({ k: 'trans', pain: (pts - n * A.trans) * n / (n + 6), n, pts, txt: `${pts} points in transition` });
    }
    return out.sort((a, b) => b.pain - a.pain);
  };

  /** points allowed per half-court possession in scheme s tonight (null before n trips), shrunk toward the league */
  function pppIn(g, T, s, n) {
    const st = g.pstats ? g.pstats[T.idx] : null;
    const r = st && st.d[s];
    if (!r || r[0] < (n || 1)) return null;
    const A = avgFor(g);
    return (r[1] + A.hc * 3) / (r[0] + 3);
  }
  Adjust.pppIn = pppIn;

  /** how well the five on the floor fit a scheme's needs (-1..1; 0 for a scheme with none) */
  function fitOf(T, s) {
    return PBC.Sim && PBC.Sim.defenseFitOf ? PBC.Sim.defenseFitOf(T, s) : 0;
  }
  /** one of his three best players on the floor with a foul to give before he fouls out, in the fourth or overtime (the
   *  substitutions already sit players in foul trouble earlier: the whole defense backs off only for that) */
  function inTrouble(g, T) {
    if (g.period < g.L.periods) return false;
    const top = T.adj.top || (T.adj.top = U.sortBy(T.players, c => c.p.ovr, true).slice(0, 3));
    return T.on.some(c => c.pf >= g.L.foulOut - 1 && top.includes(c));
  }

  /** what scheme s is worth to this bench now: its value in general, the five's fit, and the problem it answers */
  function worth(g, D, s, prob) {
    let v = (VAL[s] != null ? VAL[s] : 0) + 0.8 * fitOf(D, s);
    if (prob && prob.k === 'pnr' && (s === 'blitz' || s === 'switch' || s === 'hedge' || s === 'drop')) v += 0.6;
    if (prob && prob.k === 'star' && s === 'boxone') v += 0.6;
    return v;
  }
  Adjust.worth = worth;
  /** can this bench play scheme s against what is going on tonight */
  function okScheme(g, D, s, prob, list) {
    if (!C.DEFENSES[s] || s === D.strat.def) return false;
    const pn = k => { const x = list.find(p => p.k === k); return x ? x.pain : 0; };
    if (fitOf(D, s) < -0.25) return false;
    // (not a counter that is clearly worse than what it plays now)
    if (worth(g, D, s, prob) < worth(g, D, D.strat.def, null) - 0.3) return false;
    if (isZone(s) && pn('three') > 2.5 && prob.k !== 'post' && prob.k !== 'inside') return false;
    if (s === 'switch' && (pn('post') > 2 || pn('iso') > 2)) return false;
    if ((s === 'packline' || s === 'drop') && pn('three') > 2.5) return false;
    if (s === 'nothree' && pn('inside') > 2.5) return false;
    if ((s === 'blitz' || s === 'pressure' || s === 'press') && D.adj.trouble) return false;
    if (s === 'boxone') { const st = prob.c; if (!st || prob.second > st.st.pts * 0.6 || pn('three') > 3) return false; }
    if (s === 'blitz' && prob.k === 'star') { const c = prob.c; if (!c || c.posN > 3 || c.r.handle < 68) return false; }
    // (tried tonight and it got burned)
    const tried = pppIn(g, D, s, 6), base = pppIn(g, D, D.adj.base.def, 6);
    if (tried != null && tried > Math.max(base || 0, avgFor(g).hc) + 0.08) return false;
    return true;
  }

  // ---------------------------------------------------------------------------
  // Changes and the log
  // ---------------------------------------------------------------------------
  const label = s => (C.DEFENSES[s] ? C.DEFENSES[s].label : s);
  Adjust.label = label;
  function note(ctx, T, k, text, extra) {
    const g = ctx.g;
    const e = Object.assign({ k, q: g.period, c: Math.round(g.clock), text }, extra || {});
    T.adj.log.push(e);
    if (T.adj.log.length > 40) T.adj.log.shift();
    if (PBC.Sim && PBC.Sim.event) PBC.Sim.event(ctx, 'adjust', Object.assign({ team: T.idx, k, text: `🧠 ${text}` }, extra || {}));
  }
  function setDef(ctx, T, s, k, why, until) {
    const g = ctx.g, a = T.adj, from = T.strat.def;
    const oppPoss = g.t[1 - T.idx].poss;
    T.strat.def = s;
    a.cur = s === a.base.def ? null : { def: s, k, from: oppPoss, until: until != null ? until : STINT[s] ? oppPoss + U.int(7, 12) : null, why };
    a.last = oppPoss; a.n++;
    const who = the(T);
    const back = s === a.base.def;
    const what = back ? (s === 'man' ? GOES.man : `go back to their ${label(s)}`) : GOES[s] || `go to ${label(s)}`;
    const on = s === 'boxone' && k === 'star' && a.star ? ` on ${a.star}` : '';
    note(ctx, T, k, `${who} ${what}${on}${why ? ` (${why})` : ''}`, { def: s, from });
  }

  // ---------------------------------------------------------------------------
  // Every possession
  // ---------------------------------------------------------------------------
  /** at the start of a possession (Sim.nextPossession, after timeouts and substitutions): the defense's bench, then the
   *  offense's pace */
  Adjust.possession = function (ctx, dead) {
    const g = ctx.g;
    if (!g.adj) return;
    const D = ctx.D, O = ctx.O;
    if (D.adj) defense(ctx, D, O, dead);
    if (ON.pace && O.adj && O.adj.on && !(O.adj.user && g.live)) pace(ctx, O);
  };

  function garbage(g, lead) {
    const L = g.L;
    return (g.period >= L.periods && Math.abs(lead) >= 18) || (g.period === L.periods - 1 && Math.abs(lead) >= 28);
  }

  function defense(ctx, D, O, dead) {
    const g = ctx.g, a = D.adj, L = g.L, P = ctx.P;
    // (a one-possession press is over)
    if (a.tmp) { if (D.strat.def === 'press') D.strat.def = a.tmp.def; a.tmp = null; }
    const acting = a.on && !a.manual && !D.defCall;
    const oppPoss = O.poss;
    const lead = g.score[D.idx] - g.score[O.idx];
    const periodStart = P.start === 'period_start';
    const toNow = g.lastTO && g.lastTO.n === P.n;
    if (a.sugg && oppPoss - a.sugg.at > 10) a.sugg = null;
    // garbage time: back to what we play, nothing new
    if (garbage(g, lead)) {
      if (acting && a.cur) setDef(ctx, D, a.base.def, 'base', '');
      return;
    }
    if (acting) {
      // foul trouble: stay home (and back to normal pressure once it clears, at a quarter break)
      const tr = ON.fouls && inTrouble(g, D);
      if (tr && !a.trouble) { a.trouble = true; if (D.strat.pressure !== 'soft') { D.strat.pressure = 'soft'; note(ctx, D, 'fouls', `${the(D)} back off the ball: foul trouble`); } }
      else if (!tr && a.trouble && periodStart) { a.trouble = false; D.strat.pressure = a.base.pressure; }
      // the press, behind late, after a make
      if (ON.press && pressNow(ctx, D, lead) && U.chance(0.45 + 0.4 * a.flex)) {
        a.tmp = { def: D.strat.def };
        D.strat.def = 'press';
        if (!a.pressN++) note(ctx, D, 'press', `${the(D)} pick up full court, down ${-lead}`, { def: 'press' });
        return;
      }
    }
    // the hack (the CPU's own call; your bench never does it on its own)
    a.hack = !ON.hack ? null : a.user ? orderedHack(ctx, D, O) : acting ? hackTarget(ctx, D, O, lead) : null;
    // a surprise zone out of the other team's timeout (their play was drawn up against man)
    if (ON.ato && acting && toNow && g.lastTO.idx === O.idx && !a.cur && !isZone(D.strat.def) && oppPoss >= 6 && U.chance(0.22 * a.flex)) {
      const list = Adjust.read(g, D.idx);
      const s = U.chance(0.6) ? 'zone23' : 'zone32';
      if (okScheme(g, D, s, { k: 'ato' }, list)) { setDef(ctx, D, s, 'ato', 'out of the timeout', oppPoss + U.int(1, 3)); return; }
    }
    // a stint or a change that ran its course
    if (a.cur && acting) {
      const s = a.cur.def, ppp = pppIn(g, D, s, 6), A = avgFor(g);
      const base = pppIn(g, D, a.base.def, 6);
      const bad = ppp != null && ppp > Math.max(base || 0, A.hc) + 0.1;
      const good = ppp != null && ppp < A.hc - 0.12;
      if (a.cur.until != null && oppPoss >= a.cur.until) {
        if (good && a.cur.k !== 'ato' && U.chance(0.5)) a.cur.until = oppPoss + U.int(4, 8);
        else { setDef(ctx, D, a.base.def, 'base', bad ? `${label(s)} gave up ${ppp.toFixed(2)} points a trip` : ''); return; }
      } else if (bad && U.chance(0.5 + 0.5 * a.iq)) {
        setDef(ctx, D, a.base.def, 'base', `${label(s)} gave up ${ppp.toFixed(2)} points a trip`);
        return;
      }
    }
    // (a live game you coach: your own change is getting burned, or the press late, and your bench says so)
    if (!acting && a.user && !D.defCall) {
      const s = D.strat.def;
      if (s !== a.base.def) {
        const ppp = pppIn(g, D, s, 6), base = pppIn(g, D, a.base.def, 6);
        if (ppp != null && ppp > Math.max(base || 0, avgFor(g).hc) + 0.12) suggest(g, D, { def: a.base.def, k: 'base', why: `${label(s)} is giving up ${ppp.toFixed(2)} points a trip` });
      }
      if (!a.pressSug && s !== 'press' && pressNow(ctx, D, lead)) { a.pressSug = true; suggest(g, D, { def: 'press', k: 'press', why: `down ${-lead} with ${U.clock(g.clock)} left` }); }
    }
    // a read: every few trips, out of a timeout and at every quarter break (more at halftime)
    const halftime = periodStart && g.period === Math.floor(L.periods / 2) + 1;
    if (oppPoss < a.next && !periodStart && !toNow) return;
    a.next = oppPoss + Math.round(6 - 2 * a.iq);
    if (oppPoss < 8 && !toNow) return;
    if (oppPoss - a.last < (periodStart || toNow ? 3 : 6)) return;
    if (a.n >= 8) return;
    decide(ctx, D, O, acting, halftime);
  }

  /** the read and the answer (applied, or your bench's suggestion) */
  function decide(ctx, D, O, acting, halftime) {
    const g = ctx.g, a = D.adj;
    const list = Adjust.read(g, D.idx);
    if (!list.length) return;
    const I = Math.min(1.5, g.intensity || 0);
    const thr = (6.5 - 3 * a.iq) * (1 - 0.15 * I) * (halftime ? 0.8 : 1);
    const noise = 2.5 * (1 - a.iq);
    const seen = list.map(p => Object.assign({}, p, { felt: p.pain + U.gauss(0, noise) })).sort((x, y) => y.felt - x.felt);
    for (const prob of seen.slice(0, 3)) {
      if (prob.felt < thr) break;
      if (prob.k === 'trans') {
        const to = D.strat.crash === 'crash' ? 'balanced' : D.strat.crash === 'balanced' && prob.felt >= thr + 4 ? 'getback' : null;
        if (!to || !ON.trans) continue;
        if (acting) {
          if (U.chance(0.4 + 0.5 * a.flex)) {
            D.strat.crash = to; a.last = O.poss;
            note(ctx, D, 'trans', `${the(D)} ${to === 'getback' ? 'send everyone back on defense' : 'stop crashing the glass'} (${prob.txt})`);
          }
        } else suggest(g, D, { crash: to, k: 'trans', why: prob.txt });
        return;
      }
      const opts = ON.schemes ? (FIX[prob.k] || []).filter(s => okScheme(g, D, s, prob, list)) : [];
      if (!opts.length) continue;
      const best = U.maxBy(opts, x => worth(g, D, x, prob) + U.gauss(0, 0.6 * (1 - a.iq)));
      const s = U.chance(0.35 + 0.6 * a.iq) ? best : U.pick(opts);
      if (!acting) { suggest(g, D, { def: s, k: prob.k, why: prob.txt, star: prob.k === 'star' && prob.c ? prob.c.last : null }); return; }
      if (!U.chance(0.3 + 0.6 * a.flex)) return; // (a stubborn coach rides it out)
      a.star = prob.k === 'star' && prob.c ? prob.c.last : null;
      setDef(ctx, D, s, prob.k, prob.txt);
      return;
    }
    // nothing hurting: your bench says so when its last suggestion has gone stale (the halftime report reads the list)
  }

  /** your bench's suggestion (a live game you coach): one at a time, the newest */
  function suggest(g, D, o) {
    const a = D.adj;
    if (o.def && o.def === D.strat.def) return;
    if (a.sugg && a.sugg.def === o.def && a.sugg.crash === o.crash) return;
    a.sugg = Object.assign({ at: g.t[1 - D.idx].poss, id: (a.suggN = (a.suggN || 0) + 1) }, o);
  }

  function pressNow(ctx, D, lead) {
    const g = ctx.g, L = g.L, P = ctx.P;
    if (g.period < L.periods || D.adj.trouble) return false;
    if (P.start !== 'made_basket' && P.start !== 'ft_made') return false;
    if (g.period > L.periods) return lead <= -4 && lead >= -10 && g.clock <= 90;
    const t = g.clock;
    return (lead <= -6 && lead >= -16 && t <= 240) || (lead <= -10 && lead >= -18 && t <= 420 && D.adj.flex >= 0.6);
  }

  // ---------------------------------------------------------------------------
  // The hack
  // ---------------------------------------------------------------------------
  /** a free throw shooter's expected percentage (the engine's formula, without the moment) */
  function ftExpect(g, c) {
    return PBC.Sim && PBC.Sim.ftExpect ? PBC.Sim.ftExpect(g, c) : 0.25 + 0.0066 * c.r.ft;
  }
  Adjust.ftExpect = ftExpect;
  function hackTarget(ctx, D, O, lead) {
    const g = ctx.g, L = g.L, a = D.adj;
    if (a.hacks >= 8 || g.clock <= 135 || g.period > L.periods) return null;
    if (D.fouls + 1 < L.bonus) return null;              // (only when it sends him to the line)
    if (lead > 6 || lead < -14) return null;
    const half2 = g.period > L.periods / 2;
    const c = U.minBy(O.on.filter(x => !x.out && !x.inj), x => ftExpect(g, x));
    if (!c) return null;
    const ft = ftExpect(g, c);
    if (ft >= 0.55 || (!half2 && ft >= 0.46)) return null;
    if (!U.chance((ft < 0.46 ? 0.55 : 0.35) * a.flex)) return null;
    return c;
  }
  /** your order to hack a man (the huddle's matchups): when you are in the penalty, not in the last two minutes of a
   *  quarter, about every other trip he is on the floor */
  function orderedHack(ctx, D, O) {
    const g = ctx.g, L = g.L;
    if (!D.orders || g.clock <= 135 || g.period > L.periods || D.fouls + 1 < L.bonus) return null;
    const c = O.on.find(x => D.orders[x.id] === 'hack' && !x.out && !x.inj);
    return c && U.chance(0.55) ? c : null;
  }
  /** a hack happened (Sim's hackFoul): the first one is a story, the second in a quarter gets him pulled */
  Adjust.hacked = function (ctx, D, c) {
    const g = ctx.g, O = ctx.O;
    D.adj.hacks++;
    if (c.hackQ !== g.period) { c.hackQ = g.period; c.hackN = 0; }
    c.hackN++;
    if (D.adj.hacks === 1) note(ctx, D, 'hack', `Hack-a-${c.last}: ${the(D)} foul ${c.last} on purpose (${Math.round(ftExpect(g, c) * 100)}% at the line)`, { on: c.id });
    if (c.hackN >= 2 && (O.autoSubs || !O.adj || !O.adj.user)) c.hackRest = g.period;
  };
  /** this defense fouls this player on purpose now (Sim.segment, the first look of a possession) */
  Adjust.hackNow = function (ctx) {
    const D = ctx.D, a = D.adj, c = a && a.hack;
    if (!c || !ctx.O.on.includes(c) || ctx.g.clock - ctx.t <= 125) return null;
    return c;
  };

  /** fouling up three late: an analytics-minded bench does it more (Sim.shouldFoul) */
  Adjust.foulUp3P = function (g, D) {
    const a = D && D.adj;
    if (!a || a.user) return 0.25;
    return U.clamp(0.12 + 0.5 * a.iq * a.flex, 0.1, 0.6);
  };

  // ---------------------------------------------------------------------------
  // The pace
  // ---------------------------------------------------------------------------
  function pace(ctx, O) {
    const g = ctx.g, L = g.L, a = O.adj;
    const lead = g.score[O.idx] - g.score[1 - O.idx];
    let want = a.base.tempo;
    if (g.period === L.periods && !garbage(g, lead)) {
      if (lead <= -10 && g.clock <= 300) want = 'fast';
      else if (lead >= 12 && g.clock <= 240) want = 'slow';
    }
    if (lead < 0 && (PACE[want] || 0) < (PACE[a.base.tempo] || 0)) want = a.base.tempo;
    if (O.strat.tempo !== want) O.strat.tempo = want;
  }

  // ---------------------------------------------------------------------------
  // You
  // ---------------------------------------------------------------------------
  /** you took the defense (the Coach tab, the huddle, the locker room): your bench stops changing it */
  Adjust.userTook = function (g, idx) {
    const T = g && g.t && g.t[idx];
    if (!T || !T.adj) return;
    T.adj.manual = true;
    T.adj.sugg = null;
  };
  /** let your bench act (or only suggest) for the rest of a live game */
  Adjust.setStaff = function (g, idx, on) {
    const T = g && g.t && g.t[idx];
    if (!T || !T.adj) return;
    T.adj.on = !!on;
    if (on) { T.adj.manual = false; T.adj.base.def = T.strat.def; T.adj.cur = null; }
  };
  /** your bench's best answers right now, without acting (the halftime locker room): [{ def | crash, k, why, star }] */
  Adjust.advise = function (g, di, n) {
    const D = g.t[di];
    if (!D || !D.adj) return [];
    const list = Adjust.read(g, di);
    const out = [];
    for (const prob of list) {
      if (out.length >= (n || 2) || prob.pain < 2.5) break;
      if (prob.k === 'trans') {
        const to = D.strat.crash === 'crash' ? 'balanced' : D.strat.crash === 'balanced' && prob.pain >= 6 ? 'getback' : null;
        if (to && !out.some(o => o.crash)) out.push({ crash: to, k: 'trans', why: prob.txt });
        continue;
      }
      if (out.some(o => o.def)) continue;
      const opts = (FIX[prob.k] || []).filter(s => okScheme(g, D, s, prob, list));
      if (!opts.length) continue;
      out.push({ def: U.maxBy(opts, x => worth(g, D, x, prob)), k: prob.k, why: prob.txt, star: prob.k === 'star' && prob.c ? prob.c.last : null });
    }
    return out;
  };
  /** your bench's suggestion right now: { def | crash, k, why, star, id } or null */
  Adjust.suggestion = g => (g && g.userIdx >= 0 && g.t[g.userIdx].adj ? g.t[g.userIdx].adj.sugg : null);
  Adjust.dismiss = function (g) { const T = g && g.userIdx >= 0 ? g.t[g.userIdx] : null; if (T && T.adj) { T.adj.sugg = null; T.adj.next = T.adj.next + 4; } };
})();
