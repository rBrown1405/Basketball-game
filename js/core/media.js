/* Pro BBALL Coach — the Media: stories that build (PBC.Media). No DOM.
 *
 * Every day the league's writers look at what happened and open, follow and close stories: winning and losing streaks,
 * hot hands and slumps, the big nights, stars hurt and how their teams hold up without them, trade requests and the
 * rumors building to the deadline, the deals themselves (graded), the award races, the surprises and the
 * disappointments against the preseason projections, coaches on the hot seat, the playoff and lottery races, the
 * playoffs series by series, the awards, and in the summer the lottery, the draft, free agency and the farewells.
 * Weekly: power rankings with a line for every team, the award ladders and the rumor mill. Your beat writer covers
 * your team, and what you say at the podium (the Desk) makes the papers.
 *
 *   S.media = { v, seq, sseq, writers: [W], stories: [Story], arts: [Article], archive: [{ season, list }],
 *               form: { pid: [[pts, fgm, fga, tpm, reb, ast, min]] }, tst: { tid: streak }, rank, ladder, flags }
 *   W       = { id, name, outlet, role: 'insider' | 'numbers' | 'columnist' | 'oldschool' | 'beat', tid }
 *   Story   = { id, type, key, season, day, open, heat, tid, pid, data, arts: [ids] }
 *   Article = { id, sid, k (kind), w (writer id), season, day, phase, tid, tids, pid, pri, user, data, seen }
 *
 * Articles are stored as data (the numbers and ids of the moment) and written on demand by js/core/media_text.js
 * (Media.render), seeded by the article id, so a save always reads the same and stays small. The Media draws from its
 * own random stream; the season's games keep theirs. */
(function () {
  'use strict';
  const PBC = (window.PBC = window.PBC || {});
  const U = PBC.U;
  const M = (PBC.Media = PBC.Media || {});

  M.V = 1;
  // articles kept in the current season (the oldest, least important go first), and per past season in the archive
  M.KEEP = 320;
  M.ARCHIVE = 24;
  M.ARCHIVE_SEASONS = 40;
  // writing for the front page: at most this many story articles a day (the weekly pieces come on top)
  M.DAILY_MAX = 3;

  // ---------------------------------------------------------------------------
  // Random stream
  // ---------------------------------------------------------------------------
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
    r.chance = p => r() < p;
    return r;
  }
  M.makeRng = makeRng;
  const rng = (S, salt) => makeRng(U.hash(`${S.saveId || 'save'}|media|${S.season}|${S.day}|${S.phase}|${salt || ''}`));

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  const userTid = S => (S.coach && S.coach.status === 'unemployed') ? -1 : (S.userTid == null ? -1 : S.userTid);
  const SUMMER_PH = { awards: 1, draft_lottery: 1, draft: 1, resign: 1, freeagency: 1 };
  // (the summer's stories from the start of the offseason count too: the carousel, the Hall, the numbers)
  const LEAGUE_KIND = { rankings: 1, ladder: 1, rumors: 1, race: 1, tank: 1, allstar: 1, deadline: 1, awards_pre: 1, lottery: 1, draft: 1, fa: 1, retire: 1, hof: 1, carousel: 1 };
  const inSeason = S => S.phase === 'regular' || S.phase === 'playin' || S.phase === 'playoffs';
  M.ensure = function (S) {
    let m = S.media;
    if (!m || typeof m !== 'object' || m.v !== M.V) {
      m = S.media = Object.assign({ seq: 0, sseq: 0, writers: [], stories: [], arts: [], archive: [], form: {}, tst: {}, rank: null, ladder: null, flags: {} }, m && typeof m === 'object' ? m : {});
      m.v = M.V;
    }
    if (!m.writers.length) m.writers = makeWriters(S);
    // a new team for the coach: a beat writer who covers it
    const u = userTid(S);
    if (u >= 0 && !m.writers.some(w => w.role === 'beat' && w.tid === u)) m.writers.push(makeBeat(S, u, m.writers.length));
    return m;
  };

  // the league's writers (made once per save from their own stream)
  const OUTLETS = {
    insider: ['Hoops Insider', 'Courtside Wire', 'The League Report'],
    numbers: ['The Box Score', 'Net Rating', 'Pace & Space'],
    columnist: ['Full Court Press', 'The Hot Read', 'Take Machine'],
    oldschool: ['The Paint', 'Hardwood Classics', 'The Long Ball'],
  };
  const TITLES = { insider: 'National insider', numbers: 'Numbers columnist', columnist: 'Columnist', oldschool: 'Senior writer', beat: 'Beat writer' };
  M.TITLES = TITLES;
  function firstNames(N) {
    const all = [].concat(N.maleFirst || [], N.femaleFirst || [], N.coachFirst || []);
    return all.length ? all : ['Alex', 'Jordan', 'Sam', 'Pat', 'Casey', 'Morgan'];
  }
  function personName(R) {
    const N = PBC.Names || {};
    return `${R.pick(firstNames(N))} ${R.pick(N.last || ['Writer'])}`;
  }
  function makeWriters(S) {
    const R = makeRng(U.hash(`${S.saveId || 'save'}|media|writers`));
    const out = [];
    let id = 0;
    for (const role of ['insider', 'numbers', 'columnist', 'oldschool']) out.push({ id: ++id, name: personName(R), outlet: R.pick(OUTLETS[role]), role });
    // a second national voice for variety
    out.push({ id: ++id, name: personName(R), outlet: R.pick(OUTLETS.insider.filter(o => o !== out[0].outlet)), role: 'insider' });
    return out;
  }
  function makeBeat(S, tid, n) {
    const R = makeRng(U.hash(`${S.saveId || 'save'}|media|beat|${tid}`));
    const t = S.teams[tid];
    // the Desk's beat writer is the same person
    const D = S.desk;
    const name = D && D.staff && D.staff.beat && !(S.media && S.media.writers.some(w => w.role === 'beat')) ? D.staff.beat : personName(R);
    return { id: 100 + tid, name, outlet: `The ${t.city} ${R.pick(['Ledger', 'Herald', 'Tribune', 'Courier', 'Post'])}`, role: 'beat', tid };
  }
  M.writer = (S, id) => (M.ensure(S).writers.find(w => w.id === id) || null);
  M.beat = S => { const u = userTid(S); return u >= 0 ? M.ensure(S).writers.find(w => w.role === 'beat' && w.tid === u) : null; };
  /** a writer for the Desk's press room (the people asking the questions are the league's writers) */
  M.pickWriter = function (S, R, role) {
    const m = M.ensure(S);
    const pool = m.writers.filter(w => (role ? w.role === role : (w.role !== 'beat' || w.tid === userTid(S))));
    return pool[Math.floor((R ? R() : Math.random()) * pool.length)] || m.writers[0];
  };
  function byRole(S, role, R) {
    const m = M.ensure(S);
    const pool = role === 'beat' ? [M.beat(S)].filter(Boolean) : m.writers.filter(w => w.role === role);
    return pool.length ? pool[Math.floor(R() * pool.length)] : m.writers[0];
  }

  // ---------------------------------------------------------------------------
  // Stories and articles
  // ---------------------------------------------------------------------------
  M.story = (S, key) => M.ensure(S).stories.find(s => s.key === key && s.season === S.season) || null;
  function openStory(S, type, key, o) {
    const m = M.ensure(S);
    const st = Object.assign({ id: ++m.sseq, type, key, season: S.season, day: S.day, open: true, heat: 50, tid: -1, pid: null, data: {}, arts: [] }, o || {});
    m.stories.unshift(st);
    return st;
  }
  function closeStory(st) { if (st) st.open = false; }

  /** publish an article: kind k (media_text.js writes it), by role (or writer id), about a story */
  function publish(S, k, role, o, R) {
    const m = M.ensure(S);
    const w = typeof role === 'number' ? role : byRole(S, role, R || rng(S, k)).id;
    const u = userTid(S);
    const a = Object.assign({ id: ++m.seq, sid: null, k, w, season: S.season, day: S.day, phase: S.phase, tid: -1, tids: [], pid: null, pri: 2, data: {} }, o || {});
    if (a.tid >= 0 && !a.tids.includes(a.tid)) a.tids.unshift(a.tid);
    // about your team (the league-wide pieces only when they lead with it)
    a.user = u >= 0 && (a.tid === u || (!LEAGUE_KIND[k] && a.tids.includes(u)));
    if (a.sid) { const st = m.stories.find(s => s.id === a.sid); if (st) { st.arts.push(a.id); st.heat = Math.min(100, st.heat + 10); st.last = S.day; } }
    m.arts.unshift(a);
    m.today = (m.today && m.today.day === S.day && m.today.season === S.season) ? m.today : { season: S.season, day: S.day, n: 0 };
    m.today.n++;
    return a;
  }
  M.publish = publish;
  const roomToday = S => { const m = M.ensure(S); return !(m.today && m.today.season === S.season && m.today.day === S.day && m.today.n >= M.DAILY_MAX); };

  // ---------------------------------------------------------------------------
  // Every game: form, streaks, the big nights, injuries, milestones, records
  // ---------------------------------------------------------------------------
  const MILES = [['pts', [10000, 15000, 20000, 25000, 30000, 35000, 40000], 'points'], ['ast', [5000, 7500, 10000, 12500], 'assists'],
    ['reb', [7500, 10000, 12500, 15000], 'rebounds'], ['tpm', [1500, 2000, 2500, 3000, 3500], 'threes'], ['blk', [1500, 2000, 2500], 'blocks'], ['stl', [1500, 2000, 2500], 'steals']];
  M.game = function (S, sg, box) {
    const m = M.ensure(S);
    const u = userTid(S);
    const po = !!sg.playoff;
    // team streaks (regular season)
    if (!po) for (let i = 0; i < 2; i++) {
      const T = box.teams[i], O = box.teams[1 - i];
      const won = T.pts > O.pts;
      const cur = m.tst[T.tid] || 0;
      m.tst[T.tid] = won ? Math.max(1, cur + 1) : Math.min(-1, cur - 1);
      if (won && cur <= -STREAK_L(S, T.tid)) endStreak(S, T.tid, cur, O.tid, box);
      if (!won && cur >= STREAK_W(S, T.tid)) endStreak(S, T.tid, cur, O.tid, box);
    }
    for (const T of box.teams) {
      const opp = box.teams[0] === T ? box.teams[1].tid : box.teams[0].tid;
      for (const pl of T.players) {
        if (!(pl.min > 0)) continue;
        const p = S.players[pl.pid];
        if (!p) continue;
        // a rolling five-game window for the notable players (hot hands and slumps)
        if (!po && (p.ovr >= 72 || pl.pts >= 25)) {
          const f = m.form[p.id] || (m.form[p.id] = []);
          f.push([pl.pts, pl.fgm, pl.fga, pl.tpm, (pl.orb || 0) + (pl.drb || 0), pl.ast, Math.round(pl.min)]);
          if (f.length > 5) f.shift();
        }
        // the big nights (your own team's count from a lower bar)
        const reb = (pl.orb || 0) + (pl.drb || 0);
        const mine = T.tid === u;
        let score = 0;
        if (pl.pts >= 50) score = pl.pts;
        else if (pl.pts >= 40 && reb >= 10 && pl.ast >= 10) score = 49;
        else if (pl.pts >= 30 && reb >= 15 && pl.ast >= 15) score = 48;
        else if (pl.pts >= 25 && reb >= 25) score = 46;
        else if (pl.tpm >= 12) score = 45;
        else if (mine && (pl.pts >= 40 || (pl.pts >= 20 && reb >= 10 && pl.ast >= 10) || (pl.pts >= 20 && reb >= 20))) score = 30 + Math.min(15, pl.pts / 4);
        if (score) {
          const key = mine ? 'mine' : 'lg';
          const day = m.nights && m.nights.day === S.day && m.nights.season === S.season ? m.nights : (m.nights = { season: S.season, day: S.day });
          if (!day[key] || score > day[key].score) day[key] = { score, pid: p.id, tid: T.tid, opp, gid: box.gid, po, line: { pts: pl.pts, reb, ast: pl.ast, fgm: pl.fgm, fga: pl.fga, tpm: pl.tpm, tpa: pl.tpa, ftm: pl.ftm, fta: pl.fta, stl: pl.stl, blk: pl.blk }, won: T.pts > box.teams.find(t => t !== T).pts, score2: `${T.pts}-${box.teams.find(t => t !== T).pts}` };
        }
        // a star hurt tonight (the league's stars and a team's best; every rotation player of yours)
        if (pl.inj && p.injury && inSeason(S)) {
          const best = PBC.League.roster(S, T.tid)[0];
          if ((mine && p.ovr >= 70 && p.injury.days >= 10) || ((p.ovr >= 84 || (best === p && p.ovr >= 80)) && p.injury.days >= 14)) injuryOpen(S, p, T.tid);
        }
        // career milestones and league records (the regular season's)
        if (!po) milestones(S, p, pl, T.tid, opp, box);
      }
    }
  };

  // what counts as a streak worth a story (the user's team gets covered sooner)
  const STREAK_W = (S, tid) => (tid === userTid(S) ? 5 : 8);
  const STREAK_L = (S, tid) => (tid === userTid(S) ? 5 : 9);

  // the day's big nights: the best in the league, and your team's own
  function nights(S, m) {
    const n = m.nights;
    if (!n || n.season !== S.season || n.done) return;
    n.done = true;
    for (const b of [n.lg, n.mine]) {
      if (!b || (b === n.mine && n.lg && n.lg.pid === b.pid)) continue;
      const p = S.players[b.pid];
      if (!p) continue;
      const key = 'night:' + b.pid + ':' + b.gid;
      if (M.story(S, key)) continue;
      const st = openStory(S, 'night', key, { tid: b.tid, pid: b.pid, open: false });
      const mine = b === n.mine;
      publish(S, 'night', mine ? 'beat' : rng(S, 'nr' + b.gid)() < 0.5 ? 'oldschool' : 'columnist', {
        sid: st.id, tid: b.tid, tids: [b.tid, b.opp], pid: b.pid, pri: b.line.pts >= 60 ? 5 : mine ? 3 : 4,
        data: Object.assign({}, b.line, { won: b.won, score: b.score2, opp: b.opp, po: b.po, career: careerHigh(p, b.line.pts), gid: b.gid }),
      });
    }
  }
  // is tonight his career high in points (or a tie)? (the season rows already include tonight)
  function careerHigh(p, pts) {
    let hi = 0;
    for (const s of p.stats) hi = Math.max(hi, s.hiPts || 0);
    return pts >= hi;
  }

  function milestones(S, p, pl, tid, opp, box) {
    const c = PBC.Stats.career(p, false);
    c.reb = (c.orb || 0) + (c.drb || 0);
    const tonight = { pts: pl.pts, ast: pl.ast, reb: (pl.orb || 0) + (pl.drb || 0), blk: pl.blk, stl: pl.stl, tpm: pl.tpm };
    for (const [k, list, label] of MILES) for (const v of list) {
      const prev = (c[k] || 0) - (tonight[k] || 0);
      if (!(c[k] >= v && prev < v)) continue;
      const key = 'mile:' + p.id + ':' + k + v;
      if (M.story(S, key)) continue;
      // where that puts him on the all-time list (the regular season's career totals)
      const rank = allTimeRank(S, p, k, c[k]);
      const st = openStory(S, 'milestone', key, { tid, pid: p.id, open: false });
      publish(S, 'milestone', rank && rank <= 10 ? 'oldschool' : tid === userTid(S) ? 'beat' : 'numbers', { sid: st.id, tid, tids: [tid, opp], pid: p.id, pri: v >= 25000 || (rank && rank <= 5) ? 4 : 3, data: { stat: k, v, label, total: c[k], rank, age: p.age, gid: box.gid } });
    }
    // a new all-time leader (the career records, PBC.Legacy)
    if (PBC.Legacy && PBC.Legacy.passed) for (const x of PBC.Legacy.passed(S, p, tonight)) {
      const st = openStory(S, 'alltime', 'alltime:' + x.stat + ':' + p.id, { tid, pid: p.id, open: false });
      publish(S, 'alltime', 'oldschool', { sid: st.id, tid, tids: [tid, opp], pid: p.id, pri: 5, data: { stat: x.stat, val: x.val, prev: x.prev, age: p.age } });
    }
    // league single-game records set tonight (with a bar, so a brand-new league's record book is not news every night)
    const R = S.records;
    if (R && R.game && (S.history.length > 0 || S.day >= 40)) for (const k in R.game) {
      const top = R.game[k][0];
      if (!top || top.gid !== box.gid || top.pid !== p.id || R.game[k].length < 10 || top.val < (RECORD_BAR[k] || 0)) continue;
      const key = 'rec:' + k + ':' + box.gid;
      if (M.story(S, key)) continue;
      const st = openStory(S, 'record', key, { tid, pid: p.id, open: false });
      const prev = R.game[k][1];
      publish(S, 'record', 'oldschool', { sid: st.id, tid, tids: [tid, opp], pid: p.id, pri: 5, data: { stat: k, v: top.val, prev: prev ? { val: prev.val, pid: prev.pid, name: prev.name, season: prev.season } : null } });
    }
  }
  const RECORD_BAR = { pts: 65, reb: 28, ast: 22, stl: 9, blk: 11, tpm: 13 };
  function allTimeRank(S, p, k, total) {
    let better = 0;
    for (const id in S.players) {
      const q = S.players[id];
      if (q === p || !q.stats.length) continue;
      let t = 0;
      for (const s of q.stats) if (!s.po) t += k === 'reb' ? (s.orb || 0) + (s.drb || 0) : (s[k] || 0);
      if (t > total) { better++; if (better > 25) return null; }
    }
    return better + 1;
  }

  function injuryOpen(S, p, tid) {
    const key = 'inj:' + p.id + ':' + S.season + ':' + (p.injury ? p.injury.name : '');
    if (M.story(S, key)) return;
    const r = PBC.League.standings(S)[tid] || { w: 0, l: 0 };
    const st = openStory(S, 'injury', key, { tid, pid: p.id, data: { w0: r.w, l0: r.l, days: p.injury.days, name: p.injury.name } });
    if (!roomToday(S) && tid !== userTid(S)) return;
    publish(S, 'injury', tid === userTid(S) ? 'beat' : 'insider', { sid: st.id, tid, pid: p.id, pri: p.ovr >= 86 ? 4 : 3, data: { days: p.injury.days, name: p.injury.name, w: r.w, l: r.l, ovr: p.ovr } });
  }

  function endStreak(S, tid, cur, opp, box) {
    const key = (cur > 0 ? 'ws:' : 'ls:') + tid;
    const st = M.ensure(S).stories.find(s => s.key === key && s.open);
    if (!st) return;
    closeStory(st);
    const n = Math.abs(cur);
    if (n < 10 && tid !== userTid(S)) return;
    publish(S, cur > 0 ? 'streak_w_end' : 'streak_l_end', tid === userTid(S) ? 'beat' : 'columnist', { sid: st.id, tid, tids: [tid, opp], pri: 3, data: { n, opp, score: box ? `${box.hs}-${box.as}` : '' } });
  }

  // ---------------------------------------------------------------------------
  // Every day
  // ---------------------------------------------------------------------------
  M.daily = function (S) {
    if (!S.teams || !S.teams.length) return;
    const m = M.ensure(S);
    if (!inSeason(S)) return;
    const R = rng(S, 'daily');
    const st = PBC.League.standings(S);
    nights(S, m);
    if (S.phase === 'regular') {
      streaks(S, m, st);
      hands(S, m, R);
      injuriesBack(S, m, st);
      rivalryNights(S, m);
    } else {
      playoffs(S, m, R);
    }
  };

  function streaks(S, m, st) {
    const longest = Math.max(0, ...S.teams.map(t => m.tst[t.id] || 0));
    for (const t of S.teams) {
      const n = m.tst[t.id] || 0;
      const w = n > 0;
      const need = w ? STREAK_W(S, t.id) : STREAK_L(S, t.id);
      if (Math.abs(n) < need) continue;
      const key = (w ? 'ws:' : 'ls:') + t.id;
      let s = m.stories.find(x => x.key === key && x.open);
      const r = st[t.id];
      if (!s) {
        s = openStory(S, w ? 'streak_w' : 'streak_l', key, { tid: t.id, data: { last: Math.abs(n) } });
        publish(S, w ? 'streak_w' : 'streak_l', t.id === userTid(S) ? 'beat' : 'columnist', { sid: s.id, tid: t.id, pri: Math.abs(n) >= 10 ? 4 : 3, data: { n: Math.abs(n), w: r.w, l: r.l, best: w && n >= longest } });
      } else if (Math.abs(n) >= s.data.last + 4) {
        s.data.last = Math.abs(n);
        publish(S, w ? 'streak_w' : 'streak_l', w ? 'oldschool' : 'columnist', { sid: s.id, tid: t.id, pri: Math.abs(n) >= 12 ? 5 : 4, data: { n: Math.abs(n), w: r.w, l: r.l, again: true, best: w && n >= longest } });
      }
    }
  }

  // hot hands and slumps (the rolling five-game window)
  function hands(S, m, R) {
    if (!roomToday(S)) return;
    let hot = null, cold = null;
    for (const id in m.form) {
      const f = m.form[id];
      if (f.length < 5) continue;
      const p = S.players[id];
      if (!p || p.tid < 0) { delete m.form[id]; continue; }
      const s = PBC.Stats.season(p, S.season, false);
      if (!s || s.gp < 10) continue;
      const ppg = s.pts / s.gp;
      const pts5 = U.avg(f, x => x[0]), fgm = U.sum(f, x => x[1]), fga = U.sum(f, x => x[2]);
      if (pts5 >= Math.max(28, ppg + 7) && (!hot || pts5 - ppg > hot.d)) hot = { p, d: pts5 - ppg, pts5, ppg, fg: fga ? fgm / fga : 0, tpm: U.sum(f, x => x[3]) };
      if (p.ovr >= 80 && fga >= 60 && fgm / fga <= 0.34 && (!cold || fgm / fga < cold.fg)) cold = { p, fg: fgm / fga, pts5, ppg, sfg: s.fga ? s.fgm / s.fga : 0 };
    }
    if (hot && !recent(S, 'hot:' + hot.p.id, 30) && !recent(S, 'hot:', 4)) {
      const st = openStory(S, 'hot', 'hot:' + hot.p.id + ':' + S.day, { tid: hot.p.tid, pid: hot.p.id, open: false });
      publish(S, 'hot', hot.p.tid === userTid(S) ? 'beat' : 'numbers', { sid: st.id, tid: hot.p.tid, pid: hot.p.id, pri: 3, data: { pts5: U.round(hot.pts5, 1), ppg: U.round(hot.ppg, 1), fg: U.round(hot.fg, 3), tpm: hot.tpm } }, R);
    } else if (cold && !recent(S, 'cold:' + cold.p.id, 40) && !recent(S, 'cold:', 7) && R() < 0.6) {
      const st = openStory(S, 'cold', 'cold:' + cold.p.id + ':' + S.day, { tid: cold.p.tid, pid: cold.p.id, open: false });
      publish(S, 'cold', cold.p.tid === userTid(S) ? 'beat' : R() < 0.5 ? 'numbers' : 'columnist', { sid: st.id, tid: cold.p.tid, pid: cold.p.id, pri: 2, data: { fg: U.round(cold.fg, 3), sfg: U.round(cold.sfg, 3), pts5: U.round(cold.pts5, 1), ppg: U.round(cold.ppg, 1) } }, R);
    }
  }
  /** was a story with this key prefix opened in the last `days` days? */
  function recent(S, prefix, days) {
    return M.ensure(S).stories.some(s => s.season === S.season && s.key.startsWith(prefix) && S.day - s.day < days);
  }
  M.recent = recent;

  // a star back from injury: how his team did without him
  function injuriesBack(S, m, st) {
    for (const s of m.stories) {
      if (!s.open || s.type !== 'injury' || s.season !== S.season) continue;
      const p = S.players[s.pid];
      if (!p || p.tid !== s.tid) { closeStory(s); continue; }
      if (PBC.Player.isInjured(p)) continue;
      closeStory(s);
      {
        const r = st[s.tid];
        const w = r.w - s.data.w0, l = r.l - s.data.l0;
        if (w + l >= 4) publish(S, 'injury_back', s.tid === userTid(S) ? 'beat' : 'numbers', { sid: s.id, tid: s.tid, pid: s.pid, pri: 2, data: { w, l, games: w + l } });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Every week: power rankings, the award ladders, the rumor mill, the races
  // ---------------------------------------------------------------------------
  M.weekly = function (S) {
    if (!S.teams || !S.teams.length || S.phase !== 'regular') return;
    const m = M.ensure(S);
    if (PBC.Legacy && PBC.Legacy.refreshLeaders) PBC.Legacy.refreshLeaders(S);
    const R = rng(S, 'weekly');
    const st = PBC.League.standings(S);
    const gp = U.avg(S.teams, t => st[t.id].gp);
    if (gp >= 3) powerRankings(S, m, st, R);
    if (gp >= 10) ladders(S, m, st, R);
    if (gp >= 8 && !(S.flags && S.flags.tradeDeadlinePassed)) rumorMill(S, m, R);
    if (gp >= 20) surprises(S, m, st, R);
    if (gp >= 25) hotSeats(S, m, st, R);
    const left = S.seasonGames - gp;
    if (left <= 18 && left > 0) races(S, m, st, R);
    // your beat writer's notebook every three weeks
    const u = userTid(S);
    if (u >= 0 && gp >= 6 && !recent(S, 'beatnote:', 20)) {
      const s = openStory(S, 'beatnote', 'beatnote:' + S.day, { tid: u, open: false });
      publish(S, 'beatnote', 'beat', { sid: s.id, tid: u, pri: 2, data: beatData(S, u, st) }, R);
    }
  };

  function powerRankings(S, m, st, R) {
    const pr = PBC.League.powerRankings(S);
    const prev = m.rank && m.rank.season === S.season ? m.rank.list : null;
    const list = pr.map((x, i) => {
      const was = prev ? prev.findIndex(y => y.tid === x.tid) : -1;
      const r = st[x.tid];
      return { tid: x.tid, r: i + 1, prev: was >= 0 ? was + 1 : null, w: r.w, l: r.l, sk: m.tst[x.tid] || 0, diff: r.gp ? U.round(r.diff / r.gp, 1) : 0 };
    });
    const week = Math.floor(S.day / 7);
    m.rank = { season: S.season, week, day: S.day, list };
    publish(S, 'rankings', R() < 0.5 ? 'numbers' : 'columnist', { pri: 3, tids: list.slice(0, 3).map(x => x.tid), data: { week: week + 1, list } }, R);
  }

  // the award ladders: the same scoring as the awards (Stats.mvpScore and friends), with a smaller games bar
  M.ladders = function (S) {
    const st = PBC.League.standings(S);
    const rows = [];
    const teamGp = U.avg(S.teams, t => st[t.id].gp) || 1;
    for (const id in S.players) {
      const p = S.players[id];
      if (p.tid < 0) continue;
      const s = PBC.Stats.season(p, S.season, false);
      if (!s || s.gp < Math.max(3, teamGp * 0.5)) continue;
      rows.push({ p, s, gm: PBC.Stats.gmsc(s) / s.gp, mpg: s.min / s.gp });
    }
    const top = (arr, f, n) => U.sortBy(arr, f, true).slice(0, n).map(x => ({ pid: x.p.id, tid: x.p.tid, sc: U.round(f(x), 2), ppg: U.round(x.s.pts / x.s.gp, 1), rpg: U.round((x.s.orb + x.s.drb) / x.s.gp, 1), apg: U.round(x.s.ast / x.s.gp, 1) }));
    const mvp = top(rows, x => PBC.Stats.mvpScore(S, x, st), 10);
    const roy = top(rows.filter(x => x.p.rookieSeason === S.season), x => x.gm + x.mpg * 0.05, 5);
    const dScore = x => (x.s.stl * 1.3 + x.s.blk * 1.5 + x.s.drb * 0.28) / x.s.gp + (x.p.r.perD + x.p.r.intD + x.p.r.helpD) / 3 * 0.09 + x.mpg * 0.04;
    const dpoy = top(rows.filter(x => x.mpg >= 22), dScore, 5);
    const smoy = top(rows.filter(x => x.s.gs < x.s.gp * 0.35 && x.mpg >= 15), x => x.gm, 5);
    const proj = S.preseasonProj || {};
    const coy = U.sortBy(S.teams, t => { const r = st[t.id]; const pct = r.gp ? r.w / r.gp : 0; return (pct - (proj[t.id] != null ? proj[t.id] : 0.5)) + pct * 0.35; }, true).slice(0, 5).map(t => ({ tid: t.id, w: st[t.id].w, l: st[t.id].l, proj: proj[t.id] != null ? Math.round(proj[t.id] * S.seasonGames) : null }));
    return { mvp, roy, dpoy, smoy, coy };
  };
  function ladders(S, m, st, R) {
    const L = M.ladders(S);
    const prev = m.ladder && m.ladder.season === S.season ? m.ladder : null;
    m.ladder = Object.assign({ season: S.season, day: S.day }, L, { prevMvp: prev ? prev.mvp.map(x => x.pid) : null, prevRoy: prev ? prev.roy.map(x => x.pid) : null });
    publish(S, 'ladder', 'numbers', { pri: 3, tids: L.mvp.slice(0, 2).map(x => x.tid), pid: L.mvp[0] ? L.mvp[0].pid : null, data: { mvp: L.mvp.slice(0, 10), roy: L.roy, dpoy: L.dpoy, smoy: L.smoy.slice(0, 3), coy: L.coy.slice(0, 3), prevMvp: m.ladder.prevMvp, prevRoy: m.ladder.prevRoy } }, R);
    // a new MVP favorite is its own story
    if (prev && prev.mvp[0] && L.mvp[0] && prev.mvp[0].pid !== L.mvp[0].pid && S.day > 40) {
      const s = openStory(S, 'mvp_race', 'mvp:' + S.day, { tid: L.mvp[0].tid, pid: L.mvp[0].pid, open: false });
      publish(S, 'mvp_flip', R() < 0.5 ? 'columnist' : 'oldschool', { sid: s.id, tid: L.mvp[0].tid, tids: [L.mvp[0].tid, prev.mvp[0].tid], pid: L.mvp[0].pid, pri: 3, data: { now: L.mvp[0], was: prev.mvp[0] } }, R);
    }
  }

  // the rumor mill: trade requests, sellers' veterans, stars in a contract year
  function rumorMill(S, m, R) {
    const T = PBC.Trade;
    if (!T) return;
    const rumors = [];
    const left = (S.tradeDeadlineDay || 0) - S.day;
    const mode = {};
    for (const t of S.teams) mode[t.id] = T.teamMode ? T.teamMode(S, t.id) : 'middle';
    const contenders = S.teams.filter(t => mode[t.id] === 'contend');
    const bestAt = {};
    for (const t of contenders) for (const q of PBC.League.roster(S, t.id)) bestAt[t.id + q.pos] = Math.max(bestAt[t.id + q.pos] || 0, q.ovr);
    for (const id in S.players) {
      const p = S.players[id];
      if (p.tid < 0 || p.ovr < 74) continue;
      let why = null, heat = 0;
      if (p.tradeReq) { why = 'request'; heat = 90 + p.ovr - 74; }
      else if (mode[p.tid] === 'rebuild' && p.age >= 28 && p.ovr >= 78) { why = 'seller'; heat = 50 + p.ovr - 78; }
      else if (p.contract && p.contract.exp === S.season && p.ovr >= 80) { why = 'expiring'; heat = 40 + p.ovr - 80; }
      if (!why) continue;
      // the likeliest buyers: contenders with the biggest need at his position
      const buyers = U.sortBy(contenders.filter(t => t.id !== p.tid), t => (bestAt[t.id + p.pos] || 0) - R() * 6).slice(0, 2).map(t => t.id);
      rumors.push({ pid: p.id, tid: p.tid, why, heat: heat + R() * 10, buyers });
    }
    if (!rumors.length) return;
    const list = U.sortBy(rumors, x => x.heat, true).slice(0, 6);
    publish(S, 'rumors', 'insider', { pri: left <= 10 ? 4 : 3, tids: list.map(x => x.tid).slice(0, 4), pid: list[0].pid, data: { left, list } }, R);
  }

  // surprises and disappointments against the preseason projections
  function surprises(S, m, st, R) {
    const proj = S.preseasonProj || {};
    let best = null;
    for (const t of S.teams) {
      const r = st[t.id];
      if (!r.gp || proj[t.id] == null) continue;
      const pct = r.w / r.gp, d = pct - proj[t.id];
      if (Math.abs(d) < 0.17) continue;
      const key = (d > 0 ? 'surp:' : 'flop:') + t.id + ':' + S.season;
      if (M.story(S, key)) continue;
      if (!best || Math.abs(d) > Math.abs(best.d)) best = { t, d, pct, r, key };
    }
    if (!best) return;
    const s = openStory(S, best.d > 0 ? 'surprise' : 'flop', best.key, { tid: best.t.id, open: false });
    const star = PBC.League.roster(S, best.t.id)[0];
    publish(S, best.d > 0 ? 'surprise' : 'flop', best.t.id === userTid(S) ? 'beat' : 'columnist', { sid: s.id, tid: best.t.id, pid: star ? star.id : null, pri: 3, data: { w: best.r.w, l: best.r.l, proj: Math.round(proj[best.t.id] * S.seasonGames), pace: Math.round(best.pct * S.seasonGames) } }, R);
  }

  // coaches on the hot seat (the AI teams' coaches; your own when the owner is furious)
  function hotSeats(S, m, st, R) {
    const proj = S.preseasonProj || {};
    const u = userTid(S);
    let worst = null;
    for (const t of S.teams) {
      const r = st[t.id];
      if (!r.gp || proj[t.id] == null) continue;
      const pct = r.w / r.gp, d = pct - proj[t.id];
      const user = t.id === u;
      if (user ? !(S.coach && S.coach.mood === 'Furious') : !(d <= -0.15 && pct < 0.42)) continue;
      const key = 'seat:' + t.id + ':' + S.season;
      if (M.story(S, key)) continue;
      if (!worst || d < worst.d) worst = { t, d, r, key, user };
    }
    if (!worst) return;
    const s = openStory(S, 'hot_seat', worst.key, { tid: worst.t.id, open: false });
    publish(S, 'hot_seat', worst.user ? 'columnist' : 'insider', { sid: s.id, tid: worst.t.id, pri: worst.user ? 4 : 3, data: { w: worst.r.w, l: worst.r.l, proj: Math.round(proj[worst.t.id] * S.seasonGames), coach: coachName(S, worst.t.id), user: worst.user } }, R);
  }
  function coachName(S, tid) {
    if (tid === userTid(S) && S.coach) return S.coach.name;
    if (PBC.Staff && S.coaches) return PBC.Staff.of(S, tid).name;
    const t = S.teams[tid];
    if (t.coachName) return t.coachName;
    return PBC.Magazine && PBC.Magazine.aiCoachName ? PBC.Magazine.aiCoachName(S, t) : 'the head coach';
  }
  M.coachName = coachName;

  // the last weeks: the play-in bubble and the race to the bottom
  function races(S, m, st, R) {
    const L = PBC.League.cfg(S);
    if (!recent(S, 'race:', 10)) {
      const confs = L.playoffFormat === 'conference' ? [0, 1] : [null];
      const c = confs[Math.floor(R() * confs.length)];
      const list = PBC.League.sorted(S, c, st);
      const bubble = list.slice(5, 11).map(x => ({ tid: x.tid, seed: x.seed, w: x.w, l: x.l }));
      const s = openStory(S, 'race', 'race:' + S.day, { open: false });
      publish(S, 'race', R() < 0.5 ? 'columnist' : 'numbers', { sid: s.id, tids: bubble.map(x => x.tid).slice(0, 4), pri: 3, data: { conf: c, confName: c != null ? L.confs[c] : '', bubble } }, R);
    }
    if (!recent(S, 'tank:', 14)) {
      const all = U.sortBy(S.teams.map(t => ({ tid: t.id, w: st[t.id].w, l: st[t.id].l })), x => x.w / Math.max(1, x.w + x.l)).slice(0, 4);
      const s = openStory(S, 'tank', 'tank:' + S.day, { open: false });
      publish(S, 'tank', 'columnist', { sid: s.id, tids: all.map(x => x.tid), pri: 2, data: { list: all } }, R);
    }
  }

  function beatData(S, u, st) {
    const r = st[u];
    const roster = PBC.League.roster(S, u);
    const lines = roster.map(p => ({ p, s: PBC.Stats.season(p, S.season, false) })).filter(x => x.s && x.s.gp);
    const lead = U.maxBy(lines, x => x.s.pts / x.s.gp);
    const D = S.desk;
    const list = PBC.League.sorted(S, PBC.League.cfg(S).playoffFormat === 'conference' ? S.teams[u].conf : null, st);
    const me = list.find(x => x.tid === u);
    return {
      w: r.w, l: r.l, seed: me ? me.seed : null, lead: lead ? { pid: lead.p.id, ppg: U.round(lead.s.pts / lead.s.gp, 1) } : null,
      chem: PBC.Desk && D ? Math.round(PBC.Desk.chem(S, u)) : null, mood: S.coach ? S.coach.mood : '', media: D ? D.media : 50,
      hurt: roster.filter(p => PBC.Player.isInjured(p)).slice(0, 3).map(p => p.id), sk: (M.ensure(S).tst[u] || 0),
      req: roster.filter(p => p.tradeReq).map(p => p.id).slice(0, 2),
    };
  }

  // ---------------------------------------------------------------------------
  // Events from the rest of the game
  // ---------------------------------------------------------------------------
  /** a trade (Trade.execute): the deal, graded */
  M.trade = function (S, rec) {
    if (!rec || !rec.tids) return;
    const m = M.ensure(S);
    const T = PBC.Trade;
    const grade = [0, 1].map(i => {
      const tid = rec.tids[i];
      const getP = rec.give[1 - i].pids.map(id => S.players[id]).filter(Boolean);
      const giveP = rec.give[i].pids.map(id => S.players[id]).filter(Boolean);
      const v = arr => U.sum(arr, p => (T && T.playerValue ? T.playerValue(S, p, tid) : p.ovr / 10));
      const pk = keys => U.sum(keys, k => { const p = T && T.findPick ? T.findPick(S, k) : null; return p && T.pickValue ? T.pickValue(S, p, tid) : 2; });
      return v(getP) + pk(rec.give[1 - i].picks) - (v(giveP) + pk(rec.give[i].picks));
    });
    const best = U.maxBy(rec.give.flatMap(g => g.pids).map(id => S.players[id]).filter(Boolean), p => p.ovr);
    // a trade request that ended
    for (const s of m.stories) if (s.open && s.type === 'request' && rec.give.some(g => g.pids.includes(s.pid))) closeStory(s);
    const s = openStory(S, 'trade', 'trade:' + (m.sseq + 1), { tid: rec.tids[0], pid: best ? best.id : null, open: false, data: {} });
    const big = best && best.ovr >= 80;
    publish(S, 'trade', 'insider', { sid: s.id, tids: rec.tids.slice(), tid: rec.tids[0], pid: best ? best.id : null, pri: big ? 4 : rec.user ? 3 : 2,
      data: { give: rec.give.map(g => ({ pids: g.pids.slice(), picks: g.picks.slice(), names: g.names.slice() })), grade: grade.map(g => U.round(g, 1)), deadline: S.tradeDeadlineDay != null && Math.abs(S.day - S.tradeDeadlineDay) <= 3 && S.phase === 'regular' } });
  };
  /** a player asks out (Season.makeTradeRequest) */
  M.request = function (S, p) {
    if (!p || p.tid < 0 || (p.ovr < 74 && p.tid !== userTid(S))) return;
    const key = 'req:' + p.id + ':' + S.season;
    if (M.story(S, key)) return;
    const s = openStory(S, 'request', key, { tid: p.tid, pid: p.id, data: { day: S.day } });
    publish(S, 'request', p.tid === userTid(S) ? 'beat' : 'insider', { sid: s.id, tid: p.tid, pid: p.id, pri: p.ovr >= 82 ? 4 : 3, data: { why: p.tradeReq ? p.tradeReq.reason : 'unhappy', ovr: p.ovr, age: p.age, exp: p.contract ? p.contract.exp : null } });
  };
  /** what you said at the podium (the Desk's press room) makes the papers */
  M.quote = function (S, kind, data) {
    const u = userTid(S);
    if (u < 0) return null;
    const s = openStory(S, 'quote', 'quote:' + kind + ':' + S.day, { tid: u, open: false });
    return publish(S, 'quote', kind === 'boast' || kind === 'guarantee' || kind === 'refs' ? 'columnist' : 'beat', { sid: s.id, tid: u, pri: 3, data: Object.assign({ kind }, data || {}) });
  };
  /** the All-Star rosters (Season.allStar) */
  M.allStar = function (S) {
    const picked = (S.allStars || []).map(id => S.players[id]).filter(Boolean);
    if (!picked.length) return;
    const st = PBC.League.standings(S);
    // the snubs: the best scores left off
    const pool = [];
    for (const id in S.players) {
      const p = S.players[id];
      if (p.tid < 0 || picked.includes(p)) continue;
      const s = PBC.Stats.season(p, S.season, false);
      if (!s || s.gp < 8) continue;
      pool.push({ p, sc: PBC.Stats.mvpScore(S, { p, s, gm: PBC.Stats.gmsc(s) / s.gp }, st), ppg: s.pts / s.gp });
    }
    const snubs = U.sortBy(pool, x => x.sc, true).slice(0, 3).map(x => ({ pid: x.p.id, tid: x.p.tid, ppg: U.round(x.ppg, 1) }));
    const s = openStory(S, 'allstar', 'allstar:' + S.season, { open: false });
    publish(S, 'allstar', 'columnist', { sid: s.id, pri: 4, tids: snubs.map(x => x.tid), pid: snubs[0] ? snubs[0].pid : null, data: { n: picked.length, snubs, starters: U.sortBy(picked, p => p.ovr, true).slice(0, 6).map(p => p.id) } });
  };
  /** the trade deadline passed (Season.endDay) */
  M.deadline = function (S) {
    const recs = (S.trades || []).filter(r => r.season === S.season && r.phase === 'regular' && S.day - r.day <= 10);
    const s = openStory(S, 'deadline', 'deadline:' + S.season, { open: false });
    publish(S, 'deadline', 'insider', { sid: s.id, pri: 4, tids: U.sortBy(recs, r => r.day, true).slice(0, 3).flatMap(r => r.tids), data: { n: recs.length, deals: recs.slice(0, 5).map(r => ({ tids: r.tids.slice(), names: r.give.map(g => g.names.slice(0, 3)) })) } });
  };
  /** the regular season is over (Season.endRegularSeason): the awards as the writers see them */
  M.endRegular = function (S) {
    const aw = S.regularAwards;
    if (!aw) return;
    const s = openStory(S, 'awards_pre', 'awpre:' + S.season, { open: false });
    publish(S, 'awards_pre', 'numbers', { sid: s.id, pri: 4, pid: aw.mvp, tids: aw.mvp != null && S.players[aw.mvp] ? [S.players[aw.mvp].tid] : [], data: { mvp: aw.mvp, roy: aw.roy, dpoy: aw.dpoy, smoy: aw.smoy, mip: aw.mip, coy: aw.coyTid } });
  };
  /** the season's end (Season.endSeason): the champions */
  M.champion = function (S) {
    const P = S.playoffs;
    if (!P || P.champion == null) return;
    const fin = P.series.filter(x => x.done && x.winner === P.champion).slice(-1)[0];
    const s = openStory(S, 'champion', 'champ:' + S.season, { tid: P.champion, open: false });
    const titles = (S.history || []).filter(h => h.champion === P.champion).length + 1;
    publish(S, 'champion', 'oldschool', { sid: s.id, tid: P.champion, tids: [P.champion, fin ? (fin.hi === P.champion ? fin.lo : fin.hi) : -1].filter(x => x >= 0), pid: P.fmvp, pri: 5,
      data: { opp: fin ? (fin.hi === P.champion ? fin.lo : fin.hi) : null, w: fin ? Math.max(fin.w[0], fin.w[1]) : 4, l: fin ? Math.min(fin.w[0], fin.w[1]) : 0, fmvp: P.fmvp, titles, user: P.champion === userTid(S) } });
  };
  /** the coaching carousel (PBC.Staff, the offseason begins) */
  M.carousel = function (S, moves) {
    if (!moves || !(moves.fired.length + moves.retired.length)) return;
    const s = openStory(S, 'carousel', 'carousel:' + S.season, { open: false });
    publish(S, 'carousel', 'insider', { sid: s.id, pri: 3, tids: moves.hired.map(h => h.tid).slice(0, 4), data: { fired: moves.fired.slice(), retired: moves.retired.slice(), hired: moves.hired.map(h => ({ tid: h.tid, cid: h.cid })) } });
  };
  // ---------------------------------------------------------------------------
  // All-Star weekend (js/core/allstar.js): the game, then the contests
  // ---------------------------------------------------------------------------
  M.allStarWeekend = function (S, res) {
    if (!res) return;
    const s = openStory(S, 'allstar', 'asw:' + S.season, { open: false });
    const g = res.game;
    if (g) {
      const line = g.box.find(b => b.pid === g.mvp) || {};
      publish(S, 'asg', 'columnist', { sid: s.id, pid: g.mvp, tid: g.mvpTid, pri: 4,
        data: { teams: g.teams.map(t => ({ name: t.name, pts: t.pts })), winner: g.winner, line: { pts: line.pts, reb: line.reb, ast: line.ast, tpm: line.tpm },
          top: U.sortBy(g.box.filter(b => b.pid !== g.mvp), b => b.pts, true).slice(0, 3).map(b => ({ pid: b.pid, pts: b.pts, side: b.side })) } });
    }
    if (res.dunk) publish(S, 'dunk', 'oldschool', { sid: s.id, pid: res.dunk.winner, tid: res.dunk.wtid, pri: 3,
      data: { final: res.dunk.final.map(x => ({ pid: x.pid, total: x.total, dunks: x.dunks.map(d => ({ dunk: d.dunk, score: d.score, tries: d.tries, made: d.made })) })), perfect: res.dunk.perfect, dunkoff: !!res.dunk.dunkoff } });
    if (res.three) {
      const best = U.maxBy(res.three.r1, x => x.pts);
      publish(S, 'three', 'numbers', { sid: s.id, pid: res.three.winner, tid: res.three.wtid, pri: 3,
        data: { final: res.three.final.map(x => ({ pid: x.pid, pts: x.pts, racks: x.racks })), best: best ? { pid: best.pid, pts: best.pts } : null } });
    }
    if (res.skills) {
      const f = res.skills.rounds[res.skills.rounds.length - 1][0];
      publish(S, 'skills', 'insider', { sid: s.id, pid: res.skills.winner, tid: res.skills.wtid, pri: 2,
        data: { opp: f.w === f.a ? f.b : f.a, time: res.skills.time, otime: f.w === f.a ? f.tb : f.ta } });
    }
  };

  // ---------------------------------------------------------------------------
  // Rivalries (js/core/rivals.js): a rivalry is born or boils over; rivalry nights
  // ---------------------------------------------------------------------------
  M.rivalry = function (S, a, b, lv, why) {
    const m = M.ensure(S);
    const k = 'riv:' + PBC.Rivals.key(a, b) + ':' + lv.lvl;
    if (m.flags[k] != null && S.season - m.flags[k] < 3) return;
    m.flags[k] = S.season;
    const u = userTid(S);
    const mine = a === u || b === u;
    const lead = mine ? u : a, other = lead === a ? b : a;
    const p = PBC.Rivals.pair(S, a, b, false);
    const s = openStory(S, 'rivalry', k + ':' + S.season, { tid: lead, open: false });
    publish(S, 'rivalry', mine ? 'beat' : 'columnist', { sid: s.id, tid: lead, tids: [lead, other], pri: 2 + lv.lvl,
      data: { a: lead, b: other, lvl: lv.lvl, label: lv.label, why: why || '', h2h: PBC.Rivals.h2h(S, lead, other), po: p ? p.po.slice(-3) : [] } });
  };
  // tomorrow's rivalry games: yours (every meeting once it is bitter, the first one before that) and the league's
  // hottest (once a season per pair)
  function rivalryNights(S, m) {
    if (!PBC.Rivals || S.phase !== 'regular' || !roomToday(S)) return;
    const u = userTid(S);
    let best = null;
    for (const g of S.schedule) {
      if (g.day !== S.day + 1 || g.played) continue;
      const lv = PBC.Rivals.level(S, g.h, g.a);
      if (!lv) continue;
      const mine = g.h === u || g.a === u;
      if (!mine && lv.lvl < 2) continue;
      const fk = 'rn:' + S.season + ':' + PBC.Rivals.key(g.h, g.a) + (mine && lv.lvl >= 2 ? ':' + g.gid : '');
      if (m.flags[fk]) continue;
      const score = lv.heat + (mine ? 100 : 0);
      if (!best || score > best.score) best = { g, lv, fk, mine, score };
    }
    if (!best) return;
    m.flags[best.fk] = 1;
    const g = best.g, st = PBC.League.standings(S);
    const pair = PBC.Rivals.pair(S, g.h, g.a, false);
    const star = tid => { const r = PBC.League.roster(S, tid).filter(p => !PBC.Player.isInjured(p)); return r.length ? r[0].id : null; };
    const s = openStory(S, 'rivalry', best.fk, { tid: best.mine ? u : g.h, open: false });
    publish(S, 'rivalry_night', best.mine ? 'beat' : 'columnist', { sid: s.id, tid: best.mine ? u : g.h, tids: [g.h, g.a], pid: star(best.mine ? u : g.h), pri: best.mine ? 3 : 2,
      data: { h: g.h, a: g.a, lvl: best.lv.lvl, label: best.lv.label, h2h: PBC.Rivals.h2h(S, g.h, g.a), po: pair ? pair.po.slice(-3) : [], why: pair && pair.last ? pair.last.why : '',
        rh: [st[g.h].w, st[g.h].l], ra: [st[g.a].w, st[g.a].l], sh: star(g.h), sa: star(g.a) } });
  }

  /** the offseason's moments: 'lottery', 'draft', 'fa' (each week), 'retire', 'hof', 'number' */
  M.offseason = function (S, key, data) {
    const s = openStory(S, key, key + ':' + S.season + ':' + (M.ensure(S).sseq + 1), { open: false });
    return publish(S, key, key === 'draft' ? 'numbers' : key === 'retire' || key === 'hof' || key === 'number' ? 'oldschool' : 'insider', Object.assign({ sid: s.id, pri: 3 }, data || {}));
  };

  // the postseason: previews, the series that end, Game 7s
  function playoffs(S, m, R) {
    const P = S.playoffs;
    if (!P || S.phase !== 'playoffs') return;
    for (const x of P.series) {
      const k0 = 'ser:' + S.season + ':' + x.id;
      if (!x.done && x.w[0] + x.w[1] === 0 && !M.story(S, k0)) {
        // the preview: only the conference finals and the Finals, plus your own series
        const user = x.hi === userTid(S) || x.lo === userTid(S);
        if (x.round >= P.rounds - 1 || user) {
          const s = openStory(S, 'series', k0, { tid: x.hi, data: { round: x.round } });
          publish(S, 'preview', user ? 'beat' : R() < 0.5 ? 'numbers' : 'oldschool', { sid: s.id, tid: x.hi, tids: [x.hi, x.lo], pri: x.round === P.rounds ? 5 : 3, data: seriesData(S, x) }, R);
        } else openStory(S, 'series', k0, { tid: x.hi, open: false });
      }
      const k1 = 'serend:' + S.season + ':' + x.id;
      if (x.done && !M.story(S, k1)) {
        const s = openStory(S, 'series_end', k1, { tid: x.winner, open: false });
        const s0 = M.story(S, k0);
        closeStory(s0);
        const upset = x.winner === x.lo;
        const sweep = Math.min(x.w[0], x.w[1]) === 0;
        const user = x.hi === userTid(S) || x.lo === userTid(S);
        if (upset || sweep || user || x.round >= P.rounds - 1 || Math.min(x.w[0], x.w[1]) === 3) {
          publish(S, 'series_end', user ? 'beat' : upset ? 'columnist' : 'oldschool', { sid: s.id, tid: x.winner, tids: [x.winner, x.winner === x.hi ? x.lo : x.hi], pri: x.round >= P.rounds - 1 ? 4 : upset ? 4 : 3, data: Object.assign(seriesData(S, x), { upset, sweep }) }, R);
        }
      }
      const k7 = 'g7:' + S.season + ':' + x.id;
      if (!x.done && x.w[0] === 3 && x.w[1] === 3 && !M.story(S, k7)) {
        const s = openStory(S, 'game7', k7, { tid: x.hi, open: false });
        publish(S, 'game7', 'columnist', { sid: s.id, tid: x.hi, tids: [x.hi, x.lo], pri: 4, data: seriesData(S, x) }, R);
      }
    }
  }
  function seriesData(S, x) {
    const P = S.playoffs;
    const st = PBC.League.standings(S);
    const seed = tid => (P.seeds && P.seeds[tid] ? P.seeds[tid].seed : null);
    const star = tid => { const r = PBC.League.roster(S, tid)[0]; return r ? r.id : null; };
    return { id: x.id, round: x.round, rounds: P.rounds, hi: x.hi, lo: x.lo, w: x.w.slice(), winner: x.winner, hiSeed: seed(x.hi), loSeed: seed(x.lo),
      hiRec: `${st[x.hi].w}-${st[x.hi].l}`, loRec: `${st[x.lo].w}-${st[x.lo].l}`, hiStar: star(x.hi), loStar: star(x.lo) };
  }

  // ---------------------------------------------------------------------------
  // The season's turn: the archive, pruning
  // ---------------------------------------------------------------------------
  /** at the start of a new season: last season's best headlines go to the archive, the rest is dropped */
  M.newSeason = function (S) {
    const m = M.ensure(S);
    // (the summer's stories, carried into the preseason, were archived with their season already)
    m.arts = m.arts.filter(a => !a.carry);
    const old = m.arts.filter(a => a.season < S.season);
    if (old.length) {
      const bySeason = {};
      for (const a of old) (bySeason[a.season] = bySeason[a.season] || []).push(a);
      for (const k in bySeason) {
        // the season's biggest stories, three of a kind at most
        const perKind = {};
        const keep = U.sortBy(bySeason[k].filter(a => a.k !== 'rankings' && a.k !== 'ladder' && a.k !== 'rumors'), a => a.pri * 1000 + a.day, true)
          .filter(a => (perKind[a.k] = (perKind[a.k] || 0) + 1) <= 3).slice(0, M.ARCHIVE);
        const list = keep.map(a => { const t = M.render ? M.render(S, a) : null; return { id: a.id, k: a.k, day: a.day, phase: a.phase, tid: a.tid, pid: a.pid, pri: a.pri, h: t ? t.h : '', d: t ? t.d : '', w: a.w }; });
        m.archive.unshift({ season: +k, list });
      }
      if (m.archive.length > M.ARCHIVE_SEASONS) m.archive.length = M.ARCHIVE_SEASONS;
    }
    // the summer's stories stay on the front page through the preseason
    for (const a of old) if (SUMMER_PH[a.phase] && a.season === S.season - 1) a.carry = true;
    m.arts = m.arts.filter(a => a.season >= S.season || a.carry);
    m.stories = m.stories.filter(s => s.season >= S.season - 1).map(s => (s.season < S.season ? Object.assign(s, { open: false }) : s));
    m.form = {};
    m.tst = {};
    m.rank = null;
    m.ladder = null;
    // (last season's rivalry-night marks)
    for (const k in m.flags) if (k.startsWith('rn:') && !k.startsWith('rn:' + S.season + ':')) delete m.flags[k];
  };
  // keep the current season's articles bounded (the oldest weekly pieces and low-priority stories go first)
  const WEEKLY_KEEP = { rankings: 3, ladder: 3, rumors: 4, beatnote: 4 };
  // the closed stories that are only keys for a few weeks (the season-long ones stay: a surprise, a hot seat, a request)
  const SHORT = { night: 1, hot: 1, cold: 1, milestone: 1, record: 1, trade: 1, quote: 1, beatnote: 1, race: 1, tank: 1, mvp_race: 1, streak_w: 1, streak_l: 1, injury: 1, lottery: 1, draft: 1, fa: 1, retire: 1 };
  function prune(S, m) {
    // the weekly pieces: only the last few of each
    const seen = {};
    m.arts = m.arts.filter(a => { const n = WEEKLY_KEEP[a.k]; if (!n) return true; seen[a.k] = (seen[a.k] || 0) + 1; return seen[a.k] <= n; });
    if (m.stories.length > 120) {
      const live = new Set(m.arts.map(a => a.sid));
      m.stories = m.stories.filter(s => s.open || !SHORT[s.type] || s.season !== S.season || S.day - (s.last != null ? s.last : s.day) < 45 || live.has(s.id));
    }
    if (m.arts.length <= M.KEEP) return;
    const now = S.day;
    const score = a => a.pri * 30 + (a.user ? 40 : 0) - (now - a.day) * (a.k === 'rankings' || a.k === 'ladder' || a.k === 'rumors' ? 3 : 1);
    const keep = new Set(U.sortBy(m.arts, score, true).slice(0, M.KEEP).map(a => a.id));
    for (const k of ['rankings', 'ladder', 'rumors', 'beatnote']) { const a = m.arts.find(x => x.k === k); if (a) keep.add(a.id); }
    m.arts = m.arts.filter(a => keep.has(a.id));
  }
  M.prune = S => prune(S, M.ensure(S));

  // ---------------------------------------------------------------------------
  // Reading (screens, the booth)
  // ---------------------------------------------------------------------------
  /** the front page: the newest articles, the important ones first within a few days */
  M.front = function (S, n) {
    const m = S.media;
    if (!m) return [];
    const now = S.day;
    return U.sortBy(m.arts.filter(a => a.season === S.season || (a.carry && S.phase === 'preseason')), a => a.pri * 2 + (a.user ? 1.5 : 0) - (now - a.day) * 0.9 + a.id * 1e-6, true).slice(0, n || 12);
  };
  /** this week in league history: archived headlines from past seasons within a few days of today */
  M.onThisDay = function (S, n) {
    const m = S.media;
    if (!m || !m.archive || !inSeason(S)) return [];
    const out = [];
    for (const e of m.archive) for (const a of e.list) if (a.phase === S.phase && Math.abs(a.day - S.day) <= 3 && a.pri >= 3) out.push(Object.assign({ season: e.season }, a));
    return U.sortBy(out, a => a.pri * 10 - Math.abs(a.day - S.day), true).slice(0, n || 3);
  };
  M.unread = S => (S.media ? S.media.arts.filter(a => !a.seen && a.season === S.season).length : 0);
  M.storyArts = (S, sid) => (S.media ? S.media.arts.filter(a => a.sid === sid) : []);
  /** lines for the broadcast booth's intro (the storylines around tonight's teams) */
  M.boothLines = function (S, h, a) {
    const m = S.media;
    if (!m) return [];
    const out = [];
    const nick = tid => (S.teams[tid] ? S.teams[tid].name : '');
    for (const tid of [h, a]) {
      const n = m.tst[tid] || 0;
      if (n >= 4) out.push(`The ${nick(tid)} come in having won ${n} straight.`);
      else if (n <= -4) out.push(`The ${nick(tid)} have dropped ${-n} in a row and need this one badly.`);
    }
    for (const s of m.stories) {
      if (s.season !== S.season || out.length >= 3) break;
      if (S.day - s.day > 6) continue;
      const p = s.pid != null ? S.players[s.pid] : null;
      if (!p || (p.tid !== h && p.tid !== a)) continue;
      if (s.type === 'hot') { const f = m.form[p.id]; if (f && f.length) out.push(`${p.last} is on fire: ${U.round(U.avg(f, x => x[0]), 1)} points a night over his last ${f.length}.`.replace(' his ', p.gender === 'f' ? ' her ' : ' his ')); }
      else if (s.type === 'cold') out.push(`${p.last} has been in a shooting slump. Watch how ${p.gender === 'f' ? 'she' : 'he'} starts tonight.`);
      else if (s.type === 'request') out.push(`${p.last}'s trade request is still hanging over the ${nick(p.tid)}.`);
    }
    return out.slice(0, 2);
  };
})();
