/* Pro BBALL Coach: the halftime locker room (PBC.Locker). No DOM.
 *
 * At halftime of a game you coach live (js/ui/locker.js) your assistant reports on the first half (what is working, what
 * is hurting you, who is hot and who has gone cold, foul trouble, what their bench has done) and suggests a few changes
 * you can take with one tap: the defense (js/core/adjust.js reads the game), the play to open the half with, feeding
 * the hot hand, sitting a starter in foul trouble to start the third, the pace. Then you talk to the team (the
 * Football Manager team talk): stay calm, fire them up, praise them, demand more. How it lands depends on the score and
 * on each player (his personality, js/core/persona.js): a competitor wants to be pushed, a diva wants to be praised,
 * a hothead does not need more fire. It moves each player's confidence and gives the team an edge (or costs it one)
 * for the third quarter; your Motivator skill makes a good talk land harder and a bad one hurt less.
 * Every other bench gives its own talk at halftime, as well as its coach can (Locker.autoTalk; your staff's in a game
 * you sim, or when you skip the locker room).
 */
(function () {
  'use strict';
  const PBC = (window.PBC = window.PBC || {});
  const U = PBC.U, C = PBC.Config;
  const Locker = (PBC.Locker = {});

  // the talks: the team edge (shooting logit, the third quarter) by the score, and who it lands with (+1 / 0 / -1)
  const TALKS = {
    calm: {
      label: 'Stay calm', icon: '🧘', desc: 'Settle them down. Stick to the plan, one stop at a time.',
      sit: { bigLead: 0.01, lead: 0.02, close: 0.03, behind: 0.02, bigBehind: 0 },
      likes: { leader: 1, quiet: 1, cold: 1, humble: 1, easygoing: 1, hothead: -1 },
    },
    fire: {
      label: 'Fire them up', icon: '🔥', desc: 'Raise your voice. More energy and more edge in the third.',
      sit: { bigLead: -0.01, lead: 0.01, close: 0.03, behind: 0.04, bigBehind: 0.05 },
      likes: { competitor: 1, hothead: 1, enforcer: 1, showman: 1, quiet: -1 },
    },
    praise: {
      label: 'Praise them', icon: '👏', desc: 'Tell them what they are doing well and to keep it up.',
      sit: { bigLead: 0.03, lead: 0.03, close: 0.01, behind: -0.01, bigBehind: -0.03 },
      likes: { diva: 1, showman: 1, cocky: 1, easygoing: 1, goofball: 1 },
    },
    demand: {
      label: 'Demand more', icon: '😤', desc: 'Not good enough. You expect more from everybody.',
      sit: { bigLead: 0.02, lead: 0.02, close: 0.02, behind: 0.03, bigBehind: 0.03 },
      likes: { competitor: 1, leader: 1, humble: 1, enforcer: 1, easygoing: -1, showman: -1, cocky: -1, diva: -1, hothead: -1 },
    },
  };
  Locker.TALKS = TALKS;
  const SIT_TXT = { bigLead: 'up big', lead: 'ahead', close: 'in a close game', behind: 'behind', bigBehind: 'down big' };
  const sitOf = lead => (lead >= 10 ? 'bigLead' : lead >= 3 ? 'lead' : lead > -3 ? 'close' : lead > -10 ? 'behind' : 'bigBehind');
  Locker.sitOf = sitOf;
  Locker.SIT_TXT = SIT_TXT;
  const half = g => Math.floor(g.L.periods / 2);
  Locker.isHalftime = (g, period) => period === half(g);

  // ---------------------------------------------------------------------------
  // The report
  // ---------------------------------------------------------------------------
  function teamLine(g, T) {
    const s = { pts: g.score[T.idx], fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, tov: 0, orb: 0 };
    for (const c of T.players) for (const k of ['fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta', 'tov', 'orb']) s[k] += c.st[k];
    s.ppp = T.poss ? s.pts / T.poss : 0;
    return s;
  }
  const shooting = c => (c.st.fga ? `${c.st.fgm} of ${c.st.fga}` : 'no shots');
  /** the assistant's first half: { lead, sit, us, them, working, hurting, hot, cold, fouls, theirFouls, star, moves, def } */
  Locker.report = function (g, idx) {
    const T = g.t[idx], O = g.t[1 - idx];
    const lead = g.score[idx] - g.score[1 - idx];
    const A = PBC.Adjust ? PBC.Adjust.AVG[g.L.key === 'women' ? 'women' : 'men'] : null;
    const working = [];
    if (T.pb && A) {
      for (const f in T.pb.fam) {
        const r = T.pb.fam[f];
        if (r.n >= 4 && r.pts / r.n >= (A.fam[f] || 1) + 0.2) working.push({ k: f, ppp: r.pts / r.n, txt: `your ${PBC.Adjust.FAM_TXT[f]}: ${Math.round(r.pts)} points on ${Math.round(r.n)} trips` });
      }
      working.sort((a, b) => b.ppp - a.ppp);
    }
    const hurting = PBC.Adjust ? PBC.Adjust.read(g, idx).filter(p => p.pain >= 1.5).slice(0, 3) : [];
    const played = T.players.filter(c => c.sec > 0);
    const hot = U.sortBy(played.filter(c => c.conf >= 0.4 || (c.st.pts >= 12 && c.st.fgm >= c.st.fga * 0.5)), c => c.conf + c.st.pts / 30, true).slice(0, 2);
    const cold = U.sortBy(played.filter(c => c.conf <= -0.4 && c.st.fga >= 4), c => c.conf).slice(0, 2);
    const lim = Math.min(g.L.foulOut - 1, half(g) + 2);
    const fouls = U.sortBy(T.players.filter(c => c.pf >= 3 && !c.out), c => c.pf, true);
    const theirFouls = U.sortBy(O.players.filter(c => c.pf >= 3 && !c.out), c => c.pf, true);
    const star = U.maxBy(O.players, c => c.st.pts);
    const st = g.pstats ? g.pstats[idx] : null;
    const dr = st && st.d[T.strat.def];
    return {
      lead, sit: sitOf(lead), us: teamLine(g, T), them: teamLine(g, O), working: working.slice(0, 2), hurting, lim,
      hot: hot.map(c => ({ c, txt: `${c.last}: ${c.st.pts} points, ${shooting(c)}` })),
      cold: cold.map(c => ({ c, txt: `${c.last}: ${shooting(c)}` })),
      fouls: fouls.map(c => ({ c, txt: `${c.last} (${c.pf})` })), theirFouls: theirFouls.map(c => ({ c, txt: `${c.last} (${c.pf})` })),
      star: star && star.st.pts >= 8 ? { c: star, txt: `${star.name}: ${star.st.pts} points, ${shooting(star)}` } : null,
      moves: O.adj ? O.adj.log.map(e => e.text) : [],
      def: { label: C.DEFENSES[T.strat.def].label, ppp: dr && dr[0] >= 6 ? dr[1] / dr[0] : null, n: dr ? dr[0] : 0 },
    };
  };

  // ---------------------------------------------------------------------------
  // The suggestions
  // ---------------------------------------------------------------------------
  /** a few changes for the second half: [{ id, kind, icon, text, why, ... }] */
  Locker.suggestions = function (g, idx) {
    const T = g.t[idx], out = [];
    const lead = g.score[idx] - g.score[1 - idx];
    // the defense (and the glass), as your bench reads it
    for (const a of PBC.Adjust ? PBC.Adjust.advise(g, idx, 2) : []) {
      if (a.def) out.push({ id: 'def', kind: 'def', def: a.def, icon: '🛡️', text: `Defense: ${C.DEFENSES[a.def].label}${a.def === "boxone" && a.star ? " on " + a.star : ""}`, why: a.why });
      else if (a.crash) out.push({ id: 'crash', kind: 'crash', crash: a.crash, icon: '🏃', text: a.crash === 'getback' ? 'Send everyone back on defense' : 'Stop crashing the offensive glass', why: a.why });
    }
    // their star: deny a shooter the ball, double a scorer inside (your orders, the huddle's matchups)
    const O = g.t[1 - idx];
    const star = U.maxBy(O.on.filter(c => !c.out), c => c.st.pts);
    if (star && star.st.pts >= 14 && star.st.pts >= 0.3 * g.score[1 - idx] && !(T.orders && T.orders[star.id])) {
      const inside = star.r.post + star.r.close > star.r.three + star.r.mid;
      out.push({ id: 'order', kind: 'order', pid: star.id, order: inside ? 'double' : 'deny', icon: '🎯', text: inside ? `Double-team ${star.last}` : `Deny ${star.last} the ball`, why: `${star.st.pts} of their ${g.score[1 - idx]} points` });
    }
    // the play that has worked: open the half with it
    if (T.pb && PBC.Playbook) {
      let best = null;
      for (const id in T.pb.mem) {
        const r = T.pb.mem[id], p = PBC.Playbook.get(id);
        if (!p || p.inbound || r.n < 3 || r.pts < 6 || r.pts / r.n < 1.4) continue;
        if (!best || r.pts / r.n > best.ppp) best = { id, p, ppp: r.pts / r.n, r };
      }
      if (best) out.push({ id: 'play', kind: 'play', play: best.id, icon: '📋', text: `Open the half with ${best.p.name}`, why: `${Math.round(best.r.pts)} points in ${Math.round(best.r.n)} calls tonight` });
    }
    // the hot hand
    const hot = U.maxBy(T.players.filter(c => c.sec > 0 && !c.out && c.conf >= 0.4 && c.st.pts >= 8), c => c.conf + c.st.pts / 25);
    if (hot && T.strat.goTo1 !== hot.id) out.push({ id: 'feed', kind: 'feed', pid: hot.id, icon: '🔥', text: `Feed ${hot.last}`, why: `${hot.st.pts} points on ${shooting(hot)}` });
    // a starter in foul trouble sits the start of the third
    const ft = U.maxBy(T.players.filter(c => c.starter && !c.out && c.pf >= 3), c => c.pf * 100 + c.p.ovr);
    if (ft) out.push({ id: 'sit', kind: 'sit', pid: ft.id, icon: '🪑', text: `Start the third with ${ft.last} on the bench`, why: `${ft.pf} fouls: back in halfway through the quarter` });
    // the pace
    if (lead <= -10 && PACE[T.strat.tempo] < 1) out.push({ id: 'tempo', kind: 'tempo', tempo: 'fast', icon: '⏩', text: 'Push the pace', why: `down ${-lead}: more possessions` });
    else if (lead >= 14 && PACE[T.strat.tempo] > -1) out.push({ id: 'tempo', kind: 'tempo', tempo: 'slow', icon: '⏳', text: 'Slow it down', why: `up ${lead}: shorten the game` });
    return out.slice(0, 5);
  };
  const PACE = { vslow: -2, slow: -1, normal: 0, fast: 1, vfast: 2 };

  /** take a suggestion (the defense from now on, the play for the next two trips, the go-to player, the bench) */
  Locker.apply = function (g, idx, s) {
    const T = g.t[idx], Sim = PBC.Sim;
    if (!s) return false;
    if (s.kind === 'def') Sim.callDefense(g, idx, s.def, null, Infinity);
    else if (s.kind === 'crash') Sim.setStrategy(g, idx, { crash: s.crash });
    else if (s.kind === 'play') Sim.callPlay(g, idx, s.play, 2);
    else if (s.kind === 'feed') Sim.setStrategy(g, idx, { goTo1: s.pid, goTo2: T.strat.goTo1 && T.strat.goTo1 !== s.pid ? T.strat.goTo1 : T.strat.goTo2 });
    else if (s.kind === 'sit') { const c = T.players.find(x => x.id === s.pid); if (c) c.rest = { q: half(g) + 1, until: g.L.quarterLen * 0.5 }; }
    else if (s.kind === 'tempo') Sim.setStrategy(g, idx, { tempo: s.tempo });
    else if (s.kind === 'order') Sim.setOrders(g, idx, Object.assign({}, T.orders || {}, { [s.pid]: s.order }));
    else return false;
    return true;
  };

  // ---------------------------------------------------------------------------
  // The talk
  // ---------------------------------------------------------------------------
  const LINES = {
    1: ['Ready to run through a wall', 'Locked in', 'Fired up', 'Nodding along, eyes up', 'That landed'],
    0: ['Heard it', 'Shrugs it off', 'Business as usual', 'Taping up, listening'],
    '-1': ['Not having it', 'Takes it personally', 'Rolls the eyes', 'Tuned out'],
  };
  const typeOf = c => (PBC.Persona ? PBC.Persona.of(c.p) : 'quiet');
  /** the coach's Motivator level (yours) or style (the AI's): 0..5 */
  function motivator(g, idx) {
    const S = g.S, T = g.t[idx];
    if (idx === g.userIdx && PBC.Coach && PBC.Coach.skill) return PBC.Coach.skill(S, 'mot');
    const of = PBC.Staff && PBC.Staff.of && S.coaches ? PBC.Staff.of(S, T.tid) : null;
    return of && of.c && of.c.style === 'motivator' ? 3 : of && of.rating >= 75 ? 1 : 0;
  }
  /**
   * Give the talk: each player's reaction, his confidence, the team's edge in the third. Returns { key, sit, fx,
   * reactions: [{ c, r, type, line }], verdict }. quiet: no reactions kept (the other benches').
   */
  Locker.talk = function (g, idx, key, quiet) {
    const T = g.t[idx], tk = TALKS[key];
    if (!tk || (g.talked && g.talked[idx])) return null;
    const lead = g.score[idx] - g.score[1 - idx], sit = sitOf(lead);
    const mot = motivator(g, idx);
    const room = U.sortBy(T.players.filter(c => !c.out && !c.inj), c => (c.on ? 100 : 0) + c.sec / 60 + c.p.ovr / 10, true).slice(0, 9);
    const reactions = [];
    let sum = 0;
    for (const c of room) {
      const type = typeOf(c);
      let v = tk.likes[type] || 0;
      // (praise when you are getting beaten rings hollow with the ones who hate losing; fire when up big is noise)
      if (key === 'praise' && (sit === 'behind' || sit === 'bigBehind') && (type === 'competitor' || type === 'leader')) v -= 1;
      if (key === 'fire' && sit === 'bigLead') v -= 0.5;
      if (key === 'demand' && sit === 'bigLead' && type === 'competitor') v += 0.5;
      // (a player having a bad night wants to hear something; the coach's touch)
      if (c.conf <= -0.4 && (key === 'calm' || key === 'praise')) v += 0.5;
      v += U.gauss(0, 0.45) + 0.08 * mot;
      const r = v >= 0.5 ? 1 : v <= -0.5 ? -1 : 0;
      const d = r > 0 ? 0.15 * (1 + 0.15 * mot) : r < 0 ? -0.15 * (1 - 0.12 * mot) : 0;
      c.conf = U.clamp(c.conf + d, -1, 1);
      if (r) c.conf0 = U.clamp(c.conf0 + d * 0.3, -0.5, 0.5);
      sum += r;
      if (!quiet) reactions.push({ c, r, type, line: U.pick(LINES[r]) });
    }
    const mean = room.length ? sum / room.length : 0;
    let fx = tk.sit[sit] + 0.02 * mean;
    fx *= fx > 0 ? 1 + 0.15 * mot : 1 - 0.12 * mot;
    fx = U.round(fx, 4);
    // the third quarter: a little more at both ends (taken back at the start of the fourth, Locker.tick)
    const tf = g.talkFx || (g.talkFx = [null, null]);
    tf[idx] = { off: fx * 0.6, def: fx * 0.4 };
    g.shootAdj[idx] += tf[idx].off;
    g.shootAdj[1 - idx] -= tf[idx].def;
    (g.talked || (g.talked = [false, false]))[idx] = key;
    const up = reactions.filter(x => x.r > 0).length, down = reactions.filter(x => x.r < 0).length;
    const verdict = fx >= 0.035 ? 'The room is fired up. They come out of the tunnel locked in.'
      : fx >= 0.015 ? 'The message landed. They know what they need to do.'
        : fx > -0.005 ? 'Some of it got through. The rest is up to them.'
          : 'It did not land. A few of them are sulking on the way out.';
    return { key, sit, fx, mot, reactions, up, down, verdict };
  };

  /** the other benches' talk (and your staff's when you sim, or skip the locker room): the right one for the score,
   *  as often as the coach knows it */
  Locker.autoTalk = function (g, idx) {
    if (g.talked && g.talked[idx]) return null;
    const lead = g.score[idx] - g.score[1 - idx], sit = sitOf(lead);
    const mot = motivator(g, idx);
    const best = U.maxBy(Object.keys(TALKS), k => TALKS[k].sit[sit]);
    const key = U.chance(0.45 + 0.1 * mot) ? best : U.pick(Object.keys(TALKS));
    return Locker.talk(g, idx, key, true);
  };

  /** every possession (from Adjust.possession): the halftime talks at the start of the third, the edge taken back at
   *  the start of the fourth */
  Locker.tick = function (ctx) {
    const g = ctx.g, P = ctx.P;
    if (P.start !== 'period_start') return;
    if (g.period === half(g) + 1) {
      for (let i = 0; i < 2; i++) if (!(g.talked && g.talked[i])) Locker.autoTalk(g, i);
    } else if (g.period === half(g) + 2 && g.talkFx) {
      for (let i = 0; i < 2; i++) { const f = g.talkFx[i]; if (f) { g.shootAdj[i] -= f.off; g.shootAdj[1 - i] += f.def; g.talkFx[i] = null; } }
    }
  };
})();
