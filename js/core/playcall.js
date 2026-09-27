/* Pro BBALL Coach — the AI coach's play calling.
 *
 * Every half-court possession the engine first draws the kind of action the offense runs (pick and roll, isolation,
 * post-up, spot-up, off-screen, hand-off, cut) from the team's system, as it always has, so the league's shot mix
 * stays calibrated. Then the coach calls one of the playbook's plays for that action, scored on:
 *  - the situation: the score and the clock (last shot, need a three, two-for-one, early offense), right after a
 *    timeout (after-timeout sets), an inbound under the basket or from the sideline;
 *  - the lineup: how well the five on the floor fit the play's roles (a post play with nobody who can post up is
 *    rarely called);
 *  - the opponent: the defense's scheme and pick-and-roll coverage (plays whose reads that coverage opens up are
 *    favored; zone offense against a zone, never against man);
 *  - what is working: the points per possession of each play and each kind of action in this game, shrunk toward the
 *    team's average (a play that scored twice is not a sure thing yet), so the coach goes back to what works and
 *    moves off what does not;
 *  - variety: the same play is rarely called twice in a row.
 * Some possessions are played in flow with no call (more in motion and read-and-react systems).
 */
(function () {
  'use strict';
  const PBC = (window.PBC = window.PBC || {});
  const U = PBC.U, C = PBC.Config;
  const PlayCall = (PBC.PlayCall = {});

  // share of half-court possessions played without a called set, by offensive system
  const FLOW = {
    balanced: 0.16, paceSpace: 0.2, pnrHeavy: 0.1, motion: 0.3, iso: 0.14, postUp: 0.14, princeton: 0.3, triangle: 0.28,
    runGun: 0.22, gritGrind: 0.14, dribbleDrive: 0.24, heliocentric: 0.1,
  };
  const ZONES = { zone23: 1, zone32: 1, zone131: 1, boxone: 1 };

  /** the engine family (base play type) a play mostly ends in, by the weight of its reads */
  function baseOf(play) {
    if (play._base) return play._base;
    const s = {};
    for (const o of play.opts) if (o.base) s[o.base] = (s[o.base] || 0) + o.w;
    let best = null;
    for (const k in s) if (!best || s[k] > s[best]) best = k;
    play._base = best || 'spot';
    return play._base;
  }
  PlayCall.baseOf = baseOf;

  /** Attach both teams' playbooks to a new game: the plays (by engine family), inbound plays, coverage, memory. */
  PlayCall.setup = function (g) {
    const PB = PBC.Playbook;
    if (!PB || !g || !g.S) return;
    for (const T of g.t) {
      let book = null;
      try { book = PB.ensure(g.S, T.tid); } catch (e) { book = null; }
      if (!book) { T.pb = null; continue; }
      const plays = PB.plays(book);
      const byBase = {}, inb = { blob: [], slob: [] };
      for (const p of plays) {
        if (p.family === 'blob' || p.family === 'slob') { inb[p.family].push(p); continue; }
        const b = baseOf(p);
        (byBase[b] || (byBase[b] = [])).push(p);
      }
      T.pb = {
        book, plays, byBase, inb, mem: {}, fam: {}, recent: [], calls: 0, fitCache: {},
        cov: PB.coverageFor(T.strat.def, book.def),
      };
    }
  };

  /** the pick-and-roll coverage a team plays on defense right now (its scheme can change during the game) */
  PlayCall.coverage = function (T) {
    const PB = PBC.Playbook;
    if (!PB || !T) return 'show';
    return PB.coverageFor(T.strat.def, T.pb && T.pb.book && T.pb.book.def);
  };

  /**
   * chance this half-court possession is played without a called set: more after a defensive rebound or a steal (the
   * offense flows into its spacing and early actions; called sets cluster at dead balls and after timeouts) and on a
   * second action after the first one was passed up
   */
  PlayCall.flowShare = function (T, second, live) {
    const f = (FLOW[T.strat.off] != null ? FLOW[T.strat.off] : 0.16) + (live ? 0.2 : 0);
    return second ? Math.min(0.65, f + 0.3) : f;
  };

  // ---------------------------------------------------------------- what is working
  const PRIOR_N = 4;
  function teamPpp(g, T) {
    const n = T.poss || 0;
    const base = g.L && g.L.key === 'women' ? 0.98 : 1.12;
    return n >= 12 ? (g.score[T.idx] + base * 10) / (n + 10) : base;
  }
  /** points per possession of a record { n, pts } shrunk toward the team's average */
  function shrunk(rec, avg) { return rec ? (rec.pts + avg * PRIOR_N) / (rec.n + PRIOR_N) : avg; }
  PlayCall.ppp = shrunk;

  /** a multiplier on a family's weight from how it has scored this game (0.75 .. 1.35) */
  PlayCall.familyBoost = function (g, T, base) {
    if (!T.pb) return 1;
    const rec = T.pb.fam[base];
    if (!rec || rec.n < 2) return 1;
    const avg = teamPpp(g, T);
    return U.clamp(Math.exp(0.9 * (shrunk(rec, avg) - avg)), 0.75, 1.35);
  };

  // ---------------------------------------------------------------- scoring the plays
  /** how much the defense's known coverage opens up a play's reads (a weighted average of its triggers) */
  /** the tags of a play as bits (checked on every call) */
  const TAG = { half: 1, eog: 2, need3: 4, three: 8, twoForOne: 16, early: 32, ato: 64, zone: 128 };
  function tagBits(p) {
    if (p._tb != null) return p._tb;
    let b = 0;
    for (const t of p.tags) b |= TAG[t] || 0;
    return (p._tb = b);
  }
  PlayCall.tagBits = tagBits;
  PlayCall.TAG = TAG;
  function coverageMatch(play, cov, zone) {
    const key = zone ? 'zone' : cov;
    const cache = play._cm || (play._cm = {});
    if (cache[key] != null) return cache[key];
    let s = 0, n = 0;
    for (const o of play.opts) {
      if (o.safety) continue;
      let m = 1;
      if (o.trig) { if (zone && o.trig.zone) m *= o.trig.zone; else if (!zone && o.trig[cov]) m *= o.trig[cov]; }
      s += o.w * m; n += o.w;
    }
    const v = n ? s / n : 1;
    return (cache[key] = { v, k: Math.pow(v, 0.8) });
  }
  PlayCall.coverageMatch = coverageMatch;

  /**
   * Pick one of the candidate plays. cands: [{ play, fit }]; sit: { mode, ato, early, zone, cov, second }.
   * Returns the candidate with .score and .why (the main reasons, for the debug view and the play log).
   */
  PlayCall.pick = function (g, T, cands, sit) {
    if (!cands.length) return null;
    const avg = teamPpp(g, T);
    const mem = T.pb ? T.pb.mem : {};
    const recent = T.pb ? T.pb.recent : [];
    const mode = sit.mode;
    for (const c of cands) {
      const p = c.play, tb = tagBits(p);
      let m = 1, f = 0;
      // lineup: how well the five fit the roles
      const fitK = c.fitK != null ? c.fitK : Math.pow(U.clamp(c.fit, 35, 95) / 65, 2.5);
      m *= fitK;
      if (fitK >= 1.3) f |= 1; else if (fitK <= 0.7) f |= 2;
      // situation
      if (mode !== 'normal') {
        if (mode === 'lastShot' && tb & TAG.eog) { m *= 5; f |= 4; }
        if (mode === 'hurry3') {
          if (tb & TAG.need3) { m *= 5; f |= 8; }
          else if (tb & TAG.three) { m *= 2.5; f |= 8; }
          else m *= 0.35;
        }
        if (mode === 'twoForOne' && tb & TAG.twoForOne) { m *= 4; f |= 16; }
      }
      if (sit.early && tb & TAG.early) { m *= 3; f |= 32; }
      if (sit.ato && tb & TAG.ato) { m *= 2.5; f |= 64; }
      // the opponent: zone offense against a zone; plays the coverage opens up
      if (sit.zone) {
        if (tb & TAG.zone) { m *= 2.2; f |= 128; }
        else if (p.family !== 'iso' && p.family !== 'post') m *= 0.75;
      }
      const cm = coverageMatch(p, sit.cov, sit.zone);
      m *= cm.k;
      if (!sit.zone && cm.v >= 1.12) f |= 256;
      // what is working
      const rec = mem[p.id];
      if (rec && rec.n >= 1) {
        const k = U.clamp(Math.exp(1.2 * (shrunk(rec, avg) - avg)), 0.55, 1.7);
        m *= k;
        if (k >= 1.15) f |= 512; else if (k <= 0.85) f |= 1024;
      }
      // variety
      const ri = recent.indexOf(p.id);
      if (ri === 0) m *= 0.4; else if (ri > 0) m *= 0.75;
      c.score = m; c.flags = f;
    }
    const pick = U.pickW(cands, (c) => Math.pow(Math.max(1e-4, c.score), 1.4));
    if (pick) pick.why = reasons(pick, sit, mem);
    return pick;
  };
  /** the main reasons behind a call, in words (the debug view and the play log) */
  function reasons(c, sit, mem) {
    const f = c.flags || 0, out = [];
    const rec = mem[c.play.id];
    if (f & 4) out.push('last shot');
    if (f & 8) out.push('needs a three');
    if (f & 16) out.push('two-for-one');
    if (f & 32) out.push('early offense');
    if (f & 64) out.push('after the timeout');
    if (f & 128) out.push('against the zone');
    if (f & 256) { const cv = PBC.Playbook.COVERAGES[sit.cov]; out.push('beats ' + (cv ? cv.label.toLowerCase() : sit.cov) + ' coverage'); }
    if (f & 512 && rec) out.push('working: ' + rec.pts + ' pts in ' + rec.n);
    if (f & 1024 && rec) out.push('not working: ' + rec.pts + ' pts in ' + rec.n);
    if (f & 1) out.push('fits this five');
    if (f & 2) out.push('a poor fit for this five');
    return out;
  }

  // ---------------------------------------------------------------- memory
  /**
   * After the possession: each call and the points scored while it was on (a play whose shot was missed and put back
   * gets the putback). A call that ended in a reset or a side-out counts half; getting an inbound in to the safety is
   * not scored (the play that follows is).
   */
  PlayCall.remember = function (g, T, calls) {
    if (!T.pb || !calls || !calls.length) return;
    const pb = T.pb;
    for (const c of calls) {
      if (c.end === 'safety') continue;
      const n = c.end === 'reset' || (c.end === 'foul' && !c.pts) ? 0.5 : 1;
      const p = c.pts || 0;
      const rec = pb.mem[c.id] || (pb.mem[c.id] = { n: 0, pts: 0 });
      rec.n += n; rec.pts += p;
      if (c.base) { const fr = pb.fam[c.base] || (pb.fam[c.base] = { n: 0, pts: 0 }); fr.n += n; fr.pts += p; }
      pb.recent.unshift(c.id);
    }
    if (pb.recent.length > 3) pb.recent.length = 3;
  };
  /** the called plays' records for a freelance possession (no call): only the family memory */
  PlayCall.rememberFlow = function (g, T, base, pts) {
    if (!T.pb || !base) return;
    const fr = T.pb.fam[base] || (T.pb.fam[base] = { n: 0, pts: 0 });
    fr.n += 1; fr.pts += pts;
  };

  PlayCall.ZONES = ZONES;
})();
