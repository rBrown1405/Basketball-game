/* Pro BBALL Coach — the league's head coaches as people (PBC.Staff). No DOM.
 *
 * Every AI team has a head coach with a name, an age, a style and a rating (the rating is what free agents weigh as
 * "Head coach", team.coachRating). Each coach keeps a career: every season's record and result with the team, titles,
 * Finals, Coach of the Year. Every summer the carousel turns: coaches who missed badly (against the preseason
 * projection, with an impatient owner) or ran out of contract get fired, old ones retire, and the open jobs go to the
 * best available: coaches fired elsewhere, assistants getting their first shot, and former players who retired as
 * leaders. Your own coach (S.coach) sits on every list with them.
 *
 *   S.coaches = { seq, list: { [cid]: Coach } }
 *   Coach = { id, first, last, age, tid (-1 out of work, -3 retired), rating, style, from, hired, contract: years,
 *             seasons: [{ season, tid, w, l, result, champ, coy }], tot: { w, l, pw, pl, titles, finals, coy, seasons },
 *             fired, retired: season }
 * team.coachId, team.coachName and team.coachRating follow the current coach. */
(function () {
  'use strict';
  const PBC = (window.PBC = window.PBC || {});
  const U = PBC.U;
  const Staff = (PBC.Staff = PBC.Staff || {});

  const STYLES = {
    offense: 'Offensive mind', defense: 'Defensive specialist', development: 'Player developer', motivator: 'Motivator', tactician: 'Tactician',
  };
  Staff.STYLES = STYLES;
  const FROM = { assistant: 'Longtime assistant', college: 'College coach', player: 'Former player', retread: 'Veteran head coach' };
  Staff.FROM = FROM;

  function makeRng(seed) {
    let s = seed >>> 0;
    const r = function () {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    r.int = (a, b) => Math.floor(a + (b - a + 1) * r());
    r.pick = arr => arr[Math.floor(r() * arr.length)];
    return r;
  }
  const rng = (S, salt) => makeRng(U.hash(`${S.saveId || 'save'}|staff|${S.season}|${salt || ''}`));
  const userTid = S => (S.coach && S.coach.status === 'unemployed') ? -1 : (S.userTid == null ? -1 : S.userTid);

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  Staff.ensure = function (S) {
    let st = S.coaches;
    if (!st || typeof st !== 'object' || !st.list) st = S.coaches = { seq: 0, list: {} };
    const u = userTid(S);
    for (const t of S.teams) {
      if (t.id === u) continue;
      const c = t.coachId != null ? st.list[t.coachId] : null;
      if (c && c.tid === t.id) continue;
      // a team without a coach of its own (a new league, an old save, the job you left)
      hire(S, t, rng(S, 'init' + t.id), true);
    }
    return st;
  };
  const coachName = c => `${c.first} ${c.last}`;
  Staff.name = coachName;
  Staff.get = (S, cid) => (S.coaches && S.coaches.list[cid]) || null;
  /** the head coach of a team: { name, rating, user, c } */
  Staff.of = function (S, tid) {
    if (tid === userTid(S) && S.coach) return { name: S.coach.name, rating: null, user: true, c: S.coach };
    const t = S.teams[tid];
    const c = t && t.coachId != null && S.coaches ? S.coaches.list[t.coachId] : null;
    return c ? { name: coachName(c), rating: c.rating, user: false, c } : { name: t && t.coachName ? t.coachName : 'Head coach', rating: t ? t.coachRating : 60, user: false, c: null };
  };

  function newCoach(S, R, o) {
    const st = S.coaches;
    const N = PBC.Names || {};
    const pool = [].concat(N.maleFirst || [], N.coachFirst || [], N.femaleFirst || []);
    const c = Object.assign({
      id: ++st.seq, first: R.pick(pool.length ? pool : ['Pat']), last: R.pick(N.last || ['Smith']), age: R.int(38, 60), tid: -1,
      rating: R.int(48, 78), style: R.pick(Object.keys(STYLES)), from: R.pick(['assistant', 'assistant', 'college', 'retread']),
      hired: null, contract: 0, seasons: [], tot: { w: 0, l: 0, pw: 0, pl: 0, titles: 0, finals: 0, coy: 0, seasons: 0 }, fired: 0, retired: null,
    }, o || {});
    st.list[c.id] = c;
    return c;
  }

  /** put a coach in charge of team t (from the market, or a new one); init: the league's first coaches */
  function hire(S, t, R, init) {
    const st = S.coaches;
    let c = null;
    if (init) {
      // the coaches a new league starts with: the team's own rating, some experience behind them
      c = newCoach(S, R, { rating: t.coachRating != null ? t.coachRating : R.int(48, 82), age: R.int(40, 66), from: R.pick(['assistant', 'retread', 'college']) });
      if (t.coachName) { const parts = String(t.coachName).replace(/^Coach /, '').split(' '); if (parts.length >= 2) { c.first = parts[0]; c.last = parts.slice(1).join(' '); } else if (parts[0]) c.last = parts[0]; }
    } else {
      const pool = Staff.market(S);
      // the best candidate wins it, with some taste involved (owners like winners and names)
      const score = x => x.rating + (x.tot.titles || 0) * 4 + (x.tot.seasons ? (x.tot.w / Math.max(1, x.tot.w + x.tot.l) - 0.5) * 30 : 0) + R() * 12 - (x.age >= 66 ? 8 : 0);
      c = pool.length ? U.maxBy(pool, score) : null;
      // sometimes a fresh face (an assistant, or a former player) beats the retreads
      if (!c || R() < 0.45) {
        const formers = formerPlayers(S);
        const fresh = formers.length && R() < 0.35 ? fromPlayer(S, R, R.pick(formers)) : newCoach(S, R, { from: R() < 0.7 ? 'assistant' : 'college', age: R.int(36, 54) });
        if (!c || score(fresh) > score(c) - 6) c = fresh;
      }
    }
    c.tid = t.id;
    c.hired = S.season;
    c.contract = R.int(3, 5);
    t.coachId = c.id;
    t.coachName = coachName(c);
    t.coachRating = c.rating;
    void st;
    return c;
  }
  Staff.hire = (S, t) => hire(S, t, rng(S, 'hire' + t.id));

  /** coaches out of work and under 70 */
  Staff.market = function (S) {
    const st = S.coaches;
    return Object.values(st.list).filter(c => c.tid === -1 && c.retired == null && c.age < 70);
  };
  // retired players who would make a coach: leaders and smart players, a few seasons removed
  function formerPlayers(S) {
    const out = [];
    for (const id in S.players) {
      const p = S.players[id];
      if (p.tid !== -3 || !p.retired || p.coachId != null || S.season - p.retired.season < 2 || S.season - p.retired.season > 12) continue;
      const ty = PBC.Persona ? PBC.Persona.of(p) : '';
      if ((ty === 'leader' || ty === 'competitor' || ty === 'humble') && p.r && p.r.shotIQ >= 70) out.push(p);
    }
    return out;
  }
  function fromPlayer(S, R, p) {
    const c = newCoach(S, R, { first: p.first, last: p.last, age: p.age + 1 + (S.season - p.retired.season), from: 'player', pid: p.id,
      rating: U.clamp(Math.round(52 + (p.r.shotIQ - 70) * 0.6 + (p.r.vision || 60) * 0.1 + R.int(-6, 8)), 45, 85), style: p.r.perD >= 75 ? 'defense' : p.r.vision >= 75 ? 'tactician' : R.pick(['motivator', 'offense', 'development']) });
    p.coachId = c.id;
    return c;
  }

  // ---------------------------------------------------------------------------
  // The season's end (Season.endSeason): every AI coach's season on the record
  // ---------------------------------------------------------------------------
  Staff.endSeason = function (S) {
    Staff.ensure(S);
    const st = PBC.League.standings(S);
    const aw = S.regularAwards || {};
    const u = userTid(S);
    for (const t of S.teams) {
      if (t.id === u) continue;
      const c = Staff.get(S, t.coachId);
      if (!c) continue;
      const r = st[t.id];
      const res = PBC.League.playoffResult(S, t.id);
      const P = S.playoffs;
      let pw = 0, pl = 0;
      if (P) for (const x of P.series) if (x.hi === t.id || x.lo === t.id) { const mine = x.hi === t.id ? 0 : 1; pw += x.w[mine]; pl += x.w[1 - mine]; }
      const coy = aw.coyTid === t.id;
      c.seasons.push({ season: S.season, tid: t.id, w: r.w, l: r.l, result: res.label, champ: !!res.champ, coy, pw, pl });
      if (c.seasons.length > 40) c.seasons.shift();
      c.tot.w += r.w; c.tot.l += r.l; c.tot.pw += pw; c.tot.pl += pl; c.tot.seasons++;
      if (res.champ) c.tot.titles++;
      if (res.champ || (P && P.runnerUp === t.id)) c.tot.finals++;
      if (coy) c.tot.coy++;
    }
  };

  // ---------------------------------------------------------------------------
  // The carousel (the offseason begins): firings, retirements, hirings
  // ---------------------------------------------------------------------------
  Staff.carousel = function (S) {
    Staff.ensure(S);
    const R = rng(S, 'carousel');
    const u = userTid(S);
    const st = PBC.League.standings(S);
    const proj = S.preseasonProj || {};   // (still this season's: the new one is made at training camp)
    const moves = { fired: [], retired: [], hired: [] };
    for (const t of S.teams) {
      if (t.id === u) continue;
      const c = Staff.get(S, t.coachId);
      if (!c) continue;
      c.age++;
      c.contract = Math.max(0, (c.contract || 0) - 1);
      const r = st[t.id];
      const pct = r.gp ? r.w / r.gp : 0.5;
      const exp = proj[t.id] != null ? proj[t.id] : 0.5;
      const last2 = c.seasons.filter(x => x.tid === t.id).slice(-2);
      const tenure = c.seasons.filter(x => x.tid === t.id).length;
      const patience = t.owner && t.owner.patience != null ? t.owner.patience : 60;
      // the heat: missing the projection, losing, a short leash, nothing won lately
      let heat = (exp - pct) * 180 + (0.42 - pct) * 60 + (60 - patience) * 0.4 - Math.min(tenure, 6) * 2;
      if (last2.length === 2 && last2.every(x => x.w < x.l)) heat += 18;
      if (c.seasons.some(x => x.tid === t.id && x.champ && S.season - x.season <= 3)) heat -= 40;
      if (c.contract <= 0) heat += 12;
      // (about five to eight changes a summer across the league, as in the real one)
      const fire = heat > 18 ? R() < U.clamp((heat - 18) / 32, 0.15, 0.9) : false;
      const retire = c.age >= 70 || (c.age >= 64 && R() < (c.age - 62) * 0.08);
      if (retire) { c.retired = S.season; c.tid = -3; moves.retired.push(c.id); }
      else if (fire) { c.fired++; c.tid = -1; moves.fired.push(c.id); }
      else if (c.contract <= 0) c.contract = R.int(2, 4);   // extended
      if (retire || fire) {
        t.coachId = null;
        moves.vacant = (moves.vacant || []).concat([t.id]);
      }
    }
    // the free agents of the coaching world age too
    for (const c of Object.values(S.coaches.list)) if (c.tid === -1) { c.age++; if (c.age >= 72) { c.tid = -3; c.retired = S.season; } }
    for (const tid of moves.vacant || []) {
      const c = hire(S, S.teams[tid], R, false);
      moves.hired.push({ tid, cid: c.id });
    }
    S.coaches.lastMoves = Object.assign({ season: S.season }, moves);
    if (PBC.Media && PBC.Media.carousel) PBC.Media.carousel(S, moves);
    for (const id of moves.fired) { const c = Staff.get(S, id); if (c && PBC.Season) PBC.Season.news(S, `🪑 Coaching change: ${coachName(c)} is out after ${c.seasons.length ? c.seasons[c.seasons.length - 1].w + '-' + c.seasons[c.seasons.length - 1].l : 'a tough season'}.`, 'transaction', -1); }
    for (const h of moves.hired) { const c = Staff.get(S, h.cid), t = S.teams[h.tid]; if (c && t && PBC.Season) PBC.Season.news(S, `🤝 The ${t.city} ${t.name} hire ${coachName(c)} (${FROM[c.from] || 'coach'}) as head coach.`, 'transaction', t.id); }
    return moves;
  };

  /** your coach takes over team tid (Coach.acceptJob): its AI coach is let go */
  Staff.userTakes = function (S, tid) {
    const t = S.teams[tid];
    if (!t || !S.coaches) return;
    const c = Staff.get(S, t.coachId);
    if (c && c.tid === tid) { c.tid = -1; c.fired++; }
    t.coachId = null;
  };
  /** the job you left gets a coach */
  Staff.vacated = function (S, tid) {
    const t = S.teams[tid];
    if (!t || !S.coaches || tid === userTid(S)) return;
    if (t.coachId == null || !Staff.get(S, t.coachId) || Staff.get(S, t.coachId).tid !== tid) hire(S, t, rng(S, 'vac' + tid), false);
  };

  // ---------------------------------------------------------------------------
  // Reading: every coach, the all-time list
  // ---------------------------------------------------------------------------
  /** every head coach the league has had, plus you: [{ id, name, user, c, tot, tid, status, score }] */
  Staff.all = function (S) {
    const out = [];
    if (S.coaches) for (const c of Object.values(S.coaches.list)) {
      if (!c.tot.seasons) continue;
      out.push({ id: c.id, name: coachName(c), user: false, c, tot: c.tot, tid: c.tid, status: c.tid >= 0 ? 'active' : c.tid === -3 ? 'retired' : 'out of work', age: c.age });
    }
    const uc = S.coach;
    if (uc && uc.seasons && uc.seasons.length) {
      const tot = { w: uc.totals.w, l: uc.totals.l, pw: uc.totals.pw, pl: uc.totals.pl, titles: uc.titles || 0, finals: uc.finals || 0, coy: uc.coy || 0, seasons: uc.seasons.length };
      out.push({ id: 'you', name: uc.name, user: true, c: uc, tot, tid: uc.status === 'unemployed' ? -1 : uc.tid, status: uc.status === 'unemployed' ? 'out of work' : 'active', age: uc.age });
    }
    for (const x of out) x.score = Staff.score(x.tot);
    return U.sortBy(out, x => x.score, true);
  };
  /** the coach of team tid in a past season (the record books, the awards) */
  Staff.coachIn = function (S, season, tid) {
    const uc = S.coach;
    if (uc && uc.seasons && uc.seasons.some(x => x.season === season && x.tid === tid)) return uc.name;
    if (S.coaches) for (const c of Object.values(S.coaches.list)) if (c.seasons.some(x => x.season === season && x.tid === tid)) return coachName(c);
    return null;
  };
  /** a coach's legacy: titles, Finals, Coach of the Year, wins, playoff wins, and winning over a long career */
  Staff.score = function (tot) {
    const g = tot.w + tot.l;
    const pct = g ? tot.w / g : 0;
    return tot.titles * 10 + tot.finals * 3 + tot.coy * 4 + tot.w * 0.025 + tot.pw * 0.12 + (g >= 246 ? (pct - 0.5) * 40 : 0);
  };
})();
