/* Pro BBALL Coach — the Desk: the front office inbox (PBC.Desk). No DOM.
 *
 * Every day or two something lands on your desk: a player who wants more minutes, two teammates at each other's
 * throats, the owner's goals for the season, a press conference after a big night, a call from another front office
 * with a trade. Some are decisions (the sim stops for them: Settings → The Desk), some are offers with a deadline,
 * some are messages to read. Every answer has consequences you live with: player morale, team chemistry, the owner's
 * trust (job security), the fans (team.hype), your standing with the media, development, and promises you are held to.
 *
 *   S.desk = { v, tick, seq, items: [Item], cd: { key: tick }, fu: [{ at, t, data }], chem: { [tid]: 0-100 },
 *              bond: { [tid]: ± }, media: 0-100, m0, c0, log: [...], last, flags: {} }
 *   Item   = { id, t, kind: 'decision' | 'offer' | 'message', season, day, phase, tick, title, text,
 *              from: { type: 'player' | 'owner' | 'media' | 'staff' | 'team' | 'league', pid, tid, name, role },
 *              opts: [{ k, label, hint }], due, block, pri, done, pick, out, data, seen }
 *
 * The situations themselves are templates (js/core/desk_events.js registers them with Desk.def). This file is the
 * engine: when items come (a daily budget, after your games, weekly, at the season's big moments), deadlines and the
 * default answer when you let one run out, follow-ups (a promise checked ten games later), the effects, and team
 * chemistry. The Desk draws from its own seeded random stream, so the season's games keep theirs.
 *
 * Team chemistry (every team, weekly): the rotation's morale, winning, continuity (who played together last season),
 * trade requests and the personalities in the room, plus a bond your decisions add to (fading over weeks). With the
 * League Setting on, chemistry and a player's morale nudge his confidence coming into a game (the engine's existing
 * confidence system), centred on the league average so the league's numbers do not move. */
(function () {
  'use strict';
  const PBC = (window.PBC = window.PBC || {});
  const U = PBC.U;
  const Desk = (PBC.Desk = PBC.Desk || {});

  Desk.V = 1;
  Desk.T = Desk.T || [];
  const BY_ID = {};
  /** register a situation template (desk_events.js) */
  Desk.def = function (tpl) { Desk.T.push(tpl); BY_ID[tpl.id] = tpl; return tpl; };
  Desk.tpl = id => BY_ID[id] || null;

  // how many open decisions can wait at once; beyond it nothing new piles up until you answer
  Desk.MAX_OPEN = 4;
  // the daily chance of a new situation (x the Desk frequency setting), and the extra pull after a quiet stretch
  Desk.DAILY_P = 0.28;
  Desk.QUIET_DAYS = 5;
  Desk.QUIET_P = 0.2;
  // after one of your games: the chance of a postgame situation (a big night, a bad loss, a streak)
  Desk.GAME_P = 0.28;
  // done items kept from earlier seasons (save size)
  Desk.KEEP_OLD = 30;
  // days before the same player is the subject of another situation (any template)
  Desk.PLAYER_REST = 18;
  // how far the Desk alone can move the owner's trust in a season before it moves less
  Desk.OWN_SOFT = 30;

  // ---------------------------------------------------------------------------
  // Random stream (the Desk's own: the games keep theirs)
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
    r.range = (a, b) => a + (b - a) * r();
    r.chance = p => r() < p;
    r.pick = arr => arr[Math.floor(r() * arr.length)];
    r.pickW = (arr, wf) => {
      let tot = 0;
      const w = arr.map(x => { const v = wf(x); const c = v > 0 && isFinite(v) ? v : 0; tot += c; return c; });
      if (tot <= 0) return arr[Math.floor(r() * arr.length)];
      let x = r() * tot;
      for (let i = 0; i < arr.length; i++) { x -= w[i]; if (x <= 0) return arr[i]; }
      return arr[arr.length - 1];
    };
    return r;
  }
  Desk.makeRng = makeRng;
  Desk.rng = (S, salt) => makeRng(U.hash(`${S.saveId || 'save'}|desk|${S.desk ? S.desk.tick : 0}|${salt || ''}`));

  // ---------------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------------
  const LB = S => (PBC.Sliders && PBC.Sliders.league ? PBC.Sliders.league(S) : {});
  /** how often situations come up (League Settings → Front Office Desk; 0 turns the Desk off) */
  Desk.freq = S => { const v = LB(S).desk; return v == null ? 1 : v; };
  /** how much chemistry and morale move players on the court (League Settings → Chemistry on the Court; 0 = off) */
  Desk.chemK = S => { const v = LB(S).chemistry; return v == null ? 1 : v; };
  /** when the sim stops for the Desk (Settings): 'important' (default), 'all', 'never' */
  Desk.stopMode = S => (S.settings && S.settings.deskStop) || 'important';
  const moraleSens = S => { const v = LB(S).morale; return v == null ? 1 : v; };

  Desk.userTid = S => (S.coach && S.coach.status === 'unemployed') ? -1 : (S.userTid == null ? -1 : S.userTid);
  Desk.active = S => Desk.userTid(S) >= 0 && Desk.freq(S) > 0;

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  Desk.ensure = function (S) {
    let D = S.desk;
    if (!D || typeof D !== 'object') D = S.desk = {};
    if (D.v !== Desk.V) {
      Object.assign(D, Object.assign({ tick: 0, seq: 0, items: [], cd: {}, fu: [], chem: {}, bond: {}, media: 50, log: [], last: -99, flags: {} }, D));
      D.v = Desk.V;
    }
    // (an early build named everyone Alex)
    if (!D.staff || Object.values(D.staff).every(n => /^Alex /.test(n))) D.staff = makeStaff(S);
    let fresh = false;
    for (const t of S.teams) if (D.chem[t.id] == null) { fresh = true; break; }
    if (fresh) {
      const st = PBC.League.standings(S);
      for (const t of S.teams) if (D.chem[t.id] == null) D.chem[t.id] = U.round(chemTarget(S, t.id, st), 1);
    }
    if (D.m0 == null || D.c0 == null) refreshCenters(S, D);
    return D;
  };

  // first names for the people around the game (staff, owners, writers: anyone, of any gender)
  function firstNames(N) {
    const all = [].concat(N.maleFirst || [], N.femaleFirst || [], N.coachFirst || []);
    return all.length ? all : ['Alex', 'Jordan', 'Sam', 'Pat', 'Casey', 'Morgan'];
  }
  Desk.firstNames = firstNames;
  // the people around you: an owner for every team, and your staff (generated once per save from its own stream)
  function makeStaff(S) {
    const R = makeRng(U.hash(`${S.saveId || 'save'}|desk|staff`));
    const N = PBC.Names || {};
    const nm = () => `${R.pick(firstNames(N))} ${R.pick(N.last || ['Smith'])}`;
    return { assistant: nm(), trainer: nm(), scout: nm(), pr: nm(), gm: nm(), beat: nm() };
  }
  /** the owner of team tid, with a name (made once) */
  Desk.owner = function (S, tid) {
    const t = S.teams[tid];
    if (!t) return { name: 'The owner' };
    const o = t.owner || (t.owner = { patience: 60, spend: 50 });
    if (!o.name || (!o.nm2 && /^Pat /.test(o.name))) {
      const R = makeRng(U.hash(`${S.saveId || 'save'}|owner|${tid}`));
      const N = PBC.Names || {};
      o.name = `${R.pick(firstNames(N))} ${R.pick(N.last || ['Owner'])}`;
      o.nm2 = true;
    }
    return o;
  };

  // ---------------------------------------------------------------------------
  // Team chemistry
  // ---------------------------------------------------------------------------
  const PERS_CHEM = { leader: 2.5, humble: 1.5, goofball: 1.5, easygoing: 1, quiet: 0.5, competitor: 0.5, enforcer: 0.5, cold: 0, showman: -0.5, cocky: -1, hothead: -2, diva: -2.5 };
  function chemTarget(S, tid, st) {
    const roster = PBC.League.roster(S, tid);
    if (!roster.length) return 50;
    const top = roster.slice(0, 9);
    const mor = U.avg(top, p => (p.morale == null ? 70 : p.morale));
    const rec = (st || PBC.League.standings(S))[tid] || { w: 0, l: 0 };
    const gp = rec.w + rec.l, wp = gp ? rec.w / gp : 0.5;
    // who played together here last season (a brand-new league: established rosters)
    const cont = S.history && S.history.length ? U.avg(top, p => (p.stats.some(s => s.season === S.season - 1 && s.tid === tid) ? 1 : 0)) : 0.6;
    const reqs = roster.filter(p => p.tradeReq).length;
    let pers = 0;
    for (const p of top) pers += PERS_CHEM[PBC.Persona ? PBC.Persona.of(p) : ''] || 0;
    return U.clamp(50 + (mor - 68) * 0.8 + (wp - 0.5) * Math.min(26, gp * 4) + (cont - 0.5) * 14 - reqs * 6 + pers, 8, 92);
  }
  Desk.chemTarget = chemTarget;
  /** a team's chemistry 0-100 (its room plus the bond your decisions built) */
  Desk.chem = function (S, tid) {
    const D = S.desk;
    if (!D || !D.chem) return 50;
    const base = D.chem[tid] == null ? 50 : D.chem[tid];
    return U.clamp(base + ((D.bond && D.bond[tid]) || 0), 0, 100);
  };
  Desk.chemLabel = c => (c >= 80 ? 'Brothers in arms' : c >= 66 ? 'Tight-knit' : c >= 54 ? 'Good' : c >= 44 ? 'Fine' : c >= 32 ? 'Strained' : c >= 20 ? 'Fractured' : 'Toxic');
  /** the league's centres (rotation morale, chemistry), so the on-court nudge keeps the league average where it was */
  function refreshCenters(S, D) {
    let ms = 0, mn = 0, cs = 0;
    for (const t of S.teams) {
      for (const p of PBC.League.roster(S, t.id).slice(0, 9)) { ms += p.morale == null ? 70 : p.morale; mn++; }
      cs += Desk.chem(S, t.id);
    }
    D.m0 = U.round(mn ? ms / mn : 70, 2);
    D.c0 = U.round(S.teams.length ? cs / S.teams.length : 50, 2);
  }
  /** weekly: every team's chemistry drifts toward its room; the bond from decisions fades */
  function chemWeek(S, D) {
    const st = PBC.League.standings(S);
    for (const t of S.teams) {
      const cur = D.chem[t.id] == null ? 50 : D.chem[t.id];
      D.chem[t.id] = U.round(cur + (chemTarget(S, t.id, st) - cur) * 0.3, 2);
      if (D.bond[t.id]) { D.bond[t.id] = U.round(D.bond[t.id] * 0.9, 2); if (Math.abs(D.bond[t.id]) < 0.2) delete D.bond[t.id]; }
    }
    refreshCenters(S, D);
  }

  /**
   * The engine's hook (Sim, makeTeamCtx): a team's players' confidence coming into a game, nudged by the room and by
   * each man's morale (both measured from the league's centre). Returns fn(p) -> offset, or null when it is off.
   */
  Desk.confMod = function (S, tid) {
    const k = Desk.chemK(S);
    const D = S.desk;
    if (!(k > 0) || !D || D.m0 == null) return null;
    const cTerm = 0.06 * U.clamp((Desk.chem(S, tid) - D.c0) / 30, -1, 1);
    return p => k * (cTerm + 0.06 * U.clamp(((p.morale == null ? 70 : p.morale) - D.m0) / 25, -1, 1));
  };

  // ---------------------------------------------------------------------------
  // Effects (the templates' vocabulary)
  // ---------------------------------------------------------------------------
  const fx = Desk.fx = {
    /** morale (scaled by the Morale Sensitivity setting) */
    mor(S, p, d) { if (!p || !d) return; p.morale = Math.round(U.clamp((p.morale == null ? 70 : p.morale) + d * moraleSens(S), 5, 100)); },
    /** every player on a team */
    morTeam(S, tid, d, except) { for (const p of PBC.League.roster(S, tid)) if (!except || !except.includes(p)) fx.mor(S, p, d); },
    /** the bond in a room (team chemistry on top of its room, fading over weeks) */
    chem(S, tid, d) { const D = Desk.ensure(S); if (!d) return; D.bond[tid] = U.round(U.clamp((D.bond[tid] || 0) + d, -30, 30), 2); },
    /** the owner's trust (your job security); a season of talks moves it less once it has already moved a lot */
    own(S, d) {
      const c = S.coach;
      if (!c || !d) return;
      const D = Desk.ensure(S);
      const acc = D.own && D.own.season === S.season ? D.own : (D.own = { season: S.season, v: 0 });
      const k = Math.sign(d) === Math.sign(acc.v) ? Math.max(0.25, 1 - Math.abs(acc.v) / Desk.OWN_SOFT) : 1;
      const dd = Math.sign(d) * Math.max(1, Math.round(Math.abs(d) * k));
      acc.v += dd;
      c.security = Math.round(U.clamp((c.security == null ? 60 : c.security) + dd, 0, 100));
    },
    /** the fans (team.hype) */
    fans(S, tid, d) { const t = S.teams[tid]; if (!t || !d) return; t.hype = Math.round(U.clamp((t.hype == null ? 50 : t.hype) + d, 0, 100)); },
    /** your standing with the media */
    media(S, d) { const D = Desk.ensure(S); if (!d) return; D.media = Math.round(U.clamp(D.media + d, 0, 100)); },
    /** confidence carried into his next games (the engine's p.conf) */
    conf(p, d) { if (!p || !d) return; p.conf = U.round(U.clamp((+p.conf || 0) + d, -0.3, 0.3), 3); },
    /** development: training points toward ratings (1 = a full point) */
    train(p, keys, amt) { if (!p) return 0; let up = 0; for (const k of [].concat(keys)) if (PBC.Player.addTraining(p, k, amt)) up++; return up; },
    /** a promise you are held to (the existing promise system: weekly morale and the summer review read it), checked by the
     *  Desk after `games` more games */
    promise(S, p, type, min, games) {
      if (!p) return;
      const s = PBC.Stats.season(p, S.season, false);
      const base = { gp0: s ? s.gp : 0, min0: s ? s.min : 0, gs0: s ? s.gs : 0 };
      p.promise = Object.assign({ type, min: min || 0, season: S.season, tid: p.tid, desk: true }, base);
      Desk.follow(S, games || 10, 'promise_check', Object.assign({ pid: p.id, type, min: min || 0 }, base));
    },
    /** your word with players (S.fo: kept and broken promises; free agents read it) */
    credit(S, kept) { const fo = S.fo || (S.fo = { kept: 0, broken: 0 }); if (kept) fo.kept++; else fo.broken++; },
    news(S, text, type, tid) { if (PBC.Season) PBC.Season.news(S, text, type || 'desk', tid != null ? tid : Desk.userTid(S)); },
  };

  // ---------------------------------------------------------------------------
  // Follow-ups (a promise checked later, a feud that flares again)
  // ---------------------------------------------------------------------------
  /** run template `t`'s follow(S, data) in `days` days (the follow can add an item or apply effects) */
  Desk.follow = function (S, days, t, data) {
    const D = Desk.ensure(S);
    D.fu.push({ at: D.tick + Math.max(1, Math.round(days)), t, data: data || {} });
  };
  function runFollows(S, D) {
    if (!D.fu.length) return;
    const due = D.fu.filter(f => f.at <= D.tick);
    if (!due.length) return;
    D.fu = D.fu.filter(f => f.at > D.tick);
    for (const f of due) {
      const tpl = BY_ID[f.t];
      if (!tpl || !tpl.follow) continue;
      try { tpl.follow(S, f.data, X(S, Desk.rng(S, 'fu' + f.t))); } catch (e) { warn('follow ' + f.t, e); }
    }
  }

  // ---------------------------------------------------------------------------
  // Items
  // ---------------------------------------------------------------------------
  function warn(what, e) { if (typeof console !== 'undefined') console.warn('[desk] ' + what, e); }
  // the women's league: the templates' fixed words about players read right (names and pronoun helpers already do)
  const isW = S => { const L = PBC.League.cfg(S); return !!(L && L.gender === 'f'); };
  function fem(s) {
    if (!s) return s;
    return String(s).replace(/\bgo-to guy\b/g, 'go-to player').replace(/\bour guy\b/g, 'our star')
      .replace(/\bhimself\b/g, 'herself').replace(/\bHimself\b/g, 'Herself').replace(/\bhe\b/g, 'she').replace(/\bHe\b/g, 'She')
      .replace(/\bhim\b/g, 'her').replace(/\bHim\b/g, 'Her').replace(/\bhis\b/g, 'her').replace(/\bHis\b/g, 'Her');
  }
  Desk.fem = fem;
  Desk.add = function (S, tpl, c, built) {
    const D = Desk.ensure(S);
    const it = Object.assign({
      id: ++D.seq, t: tpl.id, kind: tpl.kind || 'decision', season: S.season, day: S.day, phase: S.phase, tick: D.tick,
      block: tpl.block != null ? !!tpl.block : (tpl.kind || 'decision') === 'decision', pri: tpl.pri || 1,
      done: false, pick: null, out: null, seen: false, data: {}, opts: [],
    }, built);
    if (built.due != null) it.due = D.tick + built.due;
    else if (it.kind !== 'message' && tpl.due != null) it.due = D.tick + tpl.due;
    if (it.kind === 'message') { it.block = false; if (!it.opts.length) it.done = true; }
    if (isW(S)) {
      it.title = fem(it.title); it.text = fem(it.text);
      for (const o of it.opts) { o.label = fem(o.label); if (o.hint) o.hint = fem(o.hint); }
    }
    D.items.unshift(it);
    D.cd[tpl.id] = D.tick;
    if (c && c.key != null) D.cd[tpl.id + ':' + c.key] = D.tick;
    for (const pid of subjects(c)) D.cd['p:' + pid] = D.tick;
    if (it.kind !== 'message' || it.pri >= 2) D.last = D.tick;
    return it;
  };
  // the players a candidate is about (pid, or the pair in a feud)
  const subjects = c => (c ? [c.pid, c.a, c.b].filter(x => x != null) : []);
  const coolOk = (D, tpl, c) => {
    if (tpl.gcd && D.cd[tpl.id] != null && D.tick - D.cd[tpl.id] < tpl.gcd) return false;
    if (c && c.key != null && tpl.cd && D.cd[tpl.id + ':' + c.key] != null && D.tick - D.cd[tpl.id + ':' + c.key] < tpl.cd) return false;
    // (the scheduled ones, milestones and the season's meetings, always come)
    if (c && !tpl.multi && !String(tpl.when).startsWith('phase:')) for (const pid of subjects(c)) if (D.cd['p:' + pid] != null && D.tick - D.cd['p:' + pid] < Desk.PLAYER_REST) return false;
    return true;
  };
  /** the helpers a template gets: the random stream and the league's lookups */
  function X(S, R) { return { R, u: Desk.userTid(S), D: Desk.ensure(S), fx, S }; }
  Desk.X = X;
  const openDecisions = D => D.items.filter(i => !i.done && i.kind !== 'message').length;

  /**
   * Candidates from every eligible template of a trigger: [{ tpl, c, w }]. A template's find(S, X, extra) returns
   * [{ key, w, ... }] (key: what its cooldown is per, e.g. the player); its weight multiplies the template's own.
   */
  function candidates(S, D, when, extra, R) {
    const out = [];
    for (const tpl of Desk.T) {
      if (tpl.when !== when) continue;
      if (tpl.phases && !tpl.phases.includes(S.phase)) continue;
      if (!coolOk(D, tpl, null)) continue;
      let cs;
      try { cs = tpl.find(S, X(S, R), extra) || []; } catch (e) { warn('find ' + tpl.id, e); continue; }
      for (const c of cs) if (coolOk(D, tpl, c)) out.push({ tpl, c, w: (tpl.w || 1) * (c.w == null ? 1 : c.w) });
    }
    return out;
  }
  function make(S, pick, R, extra) {
    let built = null;
    try { built = pick.tpl.build(S, pick.c, X(S, R), extra); } catch (e) { warn('build ' + pick.tpl.id, e); }
    return built ? Desk.add(S, pick.tpl, pick.c, built) : null;
  }
  /** one situation from a trigger, by weight */
  function one(S, when, extra, salt) {
    const D = Desk.ensure(S);
    const R = Desk.rng(S, when + '|' + (salt || ''));
    const cs = candidates(S, D, when, extra, R);
    if (!cs.length) return null;
    return make(S, R.pickW(cs, x => x.w), R, extra);
  }
  /** every situation a trigger has (the scheduled ones: the owner's goals, a series speech, the weekly calls): one item per
   *  template, its candidate picked by weight; a template with multi (exit interviews, milestones) gets one per key */
  function all(S, when, extra) {
    const D = Desk.ensure(S);
    const R = Desk.rng(S, 'all|' + when);
    const out = [];
    const byTpl = new Map();
    for (const x of candidates(S, D, when, extra, R)) {
      if (!byTpl.has(x.tpl)) byTpl.set(x.tpl, []);
      byTpl.get(x.tpl).push(x);
    }
    for (const [tpl, xs] of byTpl) {
      const list = tpl.multi ? xs : [R.pickW(xs, x => x.w)];
      const seen = new Set();
      for (const x of list) {
        if (x.c.key != null && seen.has(x.c.key)) continue;
        seen.add(x.c.key);
        const it = make(S, x, R, extra);
        if (it) out.push(it);
        // a template that built nothing for its pick (a trade nobody would make) tries its next best once
        else if (!tpl.multi && xs.length > 1) {
          const next = R.pickW(xs.filter(y => y !== x), y => y.w);
          const it2 = next ? make(S, next, R, extra) : null;
          if (it2) out.push(it2);
        }
      }
    }
    return out;
  }

  // what an answer did: your room's numbers before and after it
  function snap(S) {
    const u = Desk.userTid(S);
    if (u < 0) return null;
    const c = S.coach;
    const o = { chem: Desk.chem(S, u), fans: S.teams[u].hype == null ? 50 : S.teams[u].hype, media: S.desk ? S.desk.media : 50, own: c ? c.security : 0, p: {} };
    for (const p of PBC.League.roster(S, u)) {
      let dev = 0;
      for (const k in p.r) dev += p.r[k];
      for (const k in (p.train || {})) dev += p.train[k];
      o.p[p.id] = { m: p.morale == null ? 70 : p.morale, c: +p.conf || 0, dev };
    }
    return o;
  }
  function delta(a, b) {
    if (!a || !b) return [];
    const out = [];
    const mor = [], conf = [], dev = [];
    for (const id in a.p) {
      const x = a.p[id], y = b.p[id];
      if (!y) continue;
      if (y.m !== x.m) mor.push({ pid: +id, d: y.m - x.m });
      if (Math.abs(y.c - x.c) >= 0.01) conf.push({ pid: +id, d: y.c - x.c });
      if (y.dev - x.dev >= 0.05) dev.push(+id);
    }
    U.sortBy(mor, m => -Math.abs(m.d)).slice(0, 4).forEach(m => out.push({ k: 'mor', pid: m.pid, d: m.d }));
    if (mor.length > 4) out.push({ k: 'morN', n: mor.length - 4, d: Math.sign(U.sum(mor.slice(4), m => m.d)) });
    const r1 = v => Math.round(v);
    if (Math.abs(b.chem - a.chem) >= 0.5) out.push({ k: 'chem', d: r1(b.chem - a.chem) || Math.sign(b.chem - a.chem) });
    if (b.fans !== a.fans) out.push({ k: 'fans', d: b.fans - a.fans });
    if (b.media !== a.media) out.push({ k: 'media', d: b.media - a.media });
    if (b.own !== a.own) out.push({ k: 'own', d: b.own - a.own });
    if (conf.length) out.push({ k: 'conf', pids: conf.map(x => x.pid).slice(0, 12), d: Math.sign(U.sum(conf, x => x.d)) });
    if (dev.length) out.push({ k: 'dev', pids: dev.slice(0, 12) });
    return out;
  }
  Desk.snap = snap;
  Desk.delta = delta;

  /** the answer you give (or the default when it ran out); returns { text, nav?, fx } (fx: what it changed) */
  Desk.answer = function (S, id, k, opts) {
    const D = Desk.ensure(S);
    const it = D.items.find(i => i.id === id);
    if (!it || it.done) return null;
    const tpl = BY_ID[it.t];
    const R = Desk.rng(S, 'ans|' + id + '|' + k);
    let res = null;
    const before = snap(S);
    try { res = tpl && tpl.resolve ? tpl.resolve(S, it, k, X(S, R), opts || {}) : null; } catch (e) { warn('resolve ' + it.t, e); }
    if (res == null) res = { text: '' };
    if (typeof res === 'string') res = { text: res };
    if (isW(S) && res.text) res.text = fem(res.text);
    res.fx = it.fx = delta(before, snap(S));
    it.done = true; it.pick = k; it.out = res.text || ''; it.seen = true; it.doneTick = D.tick;
    if (opts && opts.auto) it.auto = true;
    // done: the hints were for deciding (save size)
    for (const o of it.opts) delete o.hint;
    D.log.unshift({ s: S.season, d: S.day, t: it.t, k, a: it.auto ? 1 : 0 });
    if (D.log.length > 400) D.log.length = 400;
    return res;
  };
  /** read a message (or dismiss an offer you are not taking) */
  Desk.dismiss = function (S, id) {
    const D = Desk.ensure(S);
    const it = D.items.find(i => i.id === id);
    if (!it) return;
    it.seen = true;
    if (it.kind === 'message' && !it.opts.length) it.done = true;
  };
  Desk.markSeen = function (S) { const D = Desk.ensure(S); for (const it of D.items) it.seen = true; };

  /** items past their deadline: the default answer (each template names it), noted as yours by default */
  function expire(S, D) {
    for (const it of D.items) {
      if (it.done || it.due == null || it.due > D.tick) continue;
      const tpl = BY_ID[it.t];
      const k = tpl && tpl.def != null ? tpl.def : (it.opts[it.opts.length - 1] || {}).k;
      if (k == null) { it.done = true; continue; }
      Desk.answer(S, it.id, k, { auto: true });
    }
  }
  function prune(S, D) {
    const keep = [];
    let old = 0;
    for (const it of D.items) {
      if (!it.done || it.season === S.season) { keep.push(it); continue; }
      if (old++ < Desk.KEEP_OLD) keep.push(it);
    }
    D.items = keep;
  }

  // ---------------------------------------------------------------------------
  // Triggers (hooked from season.js, offseason.js and coach.js)
  // ---------------------------------------------------------------------------
  /** the end of every day (Season.endDay): follow-ups, deadlines, and maybe something new */
  Desk.daily = function (S) {
    const D = Desk.ensure(S);
    D.tick++;
    runFollows(S, D);
    expire(S, D);
    if (!Desk.active(S)) return;
    const inSeason = S.phase === 'regular' || S.phase === 'playin' || S.phase === 'playoffs';
    if (!inSeason) return;
    // the postseason: a word before each of your series (a team that is out has a quiet desk)
    if (S.phase !== 'regular') {
      if (PBC.Season.userInPostseason && !PBC.Season.userInPostseason(S)) return;
      all(S, 'series');
    }
    if (openDecisions(D) >= Desk.MAX_OPEN) return;
    const R = Desk.rng(S, 'daily');
    let p = Desk.DAILY_P * Desk.freq(S);
    if (D.tick - D.last >= Desk.QUIET_DAYS) p += Desk.QUIET_P;
    if (R() < p) one(S, 'daily');
  };
  /** the end of every week (Season.endWeek): chemistry, the fans, and the weekly ones (the owner, the staff, the phones) */
  Desk.weekly = function (S) {
    const D = Desk.ensure(S);
    chemWeek(S, D);
    fansWeek(S);
    D.media = Math.round(D.media + (50 - D.media) * 0.05);
    if (!Desk.active(S)) return;
    all(S, 'week');
  };
  /** after each of your games (Season.completeGame) */
  Desk.afterGame = function (S, sg, box) {
    if (!Desk.active(S)) return;
    const D = Desk.ensure(S);
    D.lastGame = { gid: sg.gid, tick: D.tick };
    all(S, 'gameAll', { sg, box });
    if (openDecisions(D) >= Desk.MAX_OPEN) return;
    const R = Desk.rng(S, 'game|' + sg.gid);
    if (R() < Desk.GAME_P * Math.min(1.5, Desk.freq(S))) one(S, 'game', { sg, box }, sg.gid);
  };
  /** the season's moments: 'preseason', 'tipoff', 'allstar', 'deadline', 'postseason', 'season_end', 'offseason', 'draft',
   *  'resign', 'fa' */
  Desk.phase = function (S, key) {
    const D = Desk.ensure(S);
    settle(S, D);
    if (key === 'season_end' || key === 'offseason') prune(S, D);
    if (!Desk.active(S)) return [];
    const done = D.flags[key + ':' + S.season];
    if (done) return [];
    D.flags[key + ':' + S.season] = true;
    return all(S, 'phase:' + key);
  };
  /** a week of the offseason (each week of free agency): the phones ring, deadlines run */
  Desk.offWeek = function (S) {
    const D = Desk.ensure(S);
    D.tick += 7;
    runFollows(S, D);
    expire(S, D);
    if (!Desk.active(S)) return;
    all(S, 'week');
  };
  // the offseason has no days: what was left open in an earlier phase gets its default when the next one begins (in
  // season, deadlines run in days; once the season is over, everything still open from it is settled)
  const SEASON_PH = { regular: 1, playin: 1, playoffs: 1 };
  function settle(S, D) {
    const offNow = !SEASON_PH[S.phase];
    for (const it of D.items) {
      if (it.done || it.kind === 'message' || it.phase === S.phase) continue;
      if (!offNow && SEASON_PH[it.phase]) continue;
      // the preseason's meetings wait for tip-off (they have deadlines in days once the season starts)
      if (it.phase === 'preseason' && S.phase === 'regular') continue;
      const tpl = BY_ID[it.t];
      const k = tpl && tpl.def != null ? tpl.def : (it.opts[it.opts.length - 1] || {}).k;
      if (k == null) it.done = true; else Desk.answer(S, it.id, k, { auto: true });
    }
  }
  /** cheap check from the screens: the preseason's items for a season that has not had them (a new career, an old save) */
  Desk.poke = function (S) {
    if (!Desk.active(S)) return;
    if (S.phase === 'preseason') Desk.phase(S, 'preseason');
  };

  // the fans: winning, the stars, the playoffs (every team, weekly; your decisions add to it)
  function fansWeek(S) {
    const st = PBC.League.standings(S);
    for (const t of S.teams) {
      const r = st[t.id] || { w: 0, l: 0 };
      const gp = r.w + r.l;
      if (!gp) continue;
      const best = PBC.League.roster(S, t.id)[0];
      const target = U.clamp(46 + (r.w / gp - 0.5) * 70 + (best ? (best.ovr - 80) * 0.8 : 0) + ((t.market || 3) - 3) * 3, 5, 95);
      const h = t.hype == null ? 50 : t.hype;
      t.hype = Math.round(U.clamp(h + (target - h) * 0.12, 0, 100));
    }
  }

  // ---------------------------------------------------------------------------
  // Reading the Desk (screens, the sim)
  // ---------------------------------------------------------------------------
  /** open items (not answered), the decisions first */
  Desk.open = function (S) {
    const D = S.desk;
    if (!D) return [];
    return D.items.filter(i => !i.done).sort((a, b) => (b.kind === 'decision') - (a.kind === 'decision') || b.pri - a.pri || b.id - a.id);
  };
  Desk.unseen = S => (S.desk ? S.desk.items.filter(i => !i.seen).length : 0);
  /** what stops the sim: open decisions that block (Settings: 'important' = priority 2+, 'all' = every decision, 'never') */
  Desk.stopping = function (S) {
    const mode = Desk.stopMode(S);
    if (mode === 'never' || !S.desk) return [];
    return S.desk.items.filter(i => !i.done && i.kind === 'decision' && i.block && (mode === 'all' || i.pri >= 2));
  };
  Desk.shouldStop = S => Desk.stopping(S).length > 0;
  /** answer everything open with each template's default (Settings: 'never', the assistant GM, the headless tools) */
  Desk.autoAll = function (S, chooser) {
    const D = Desk.ensure(S);
    for (const it of D.items.slice()) {
      if (it.done) continue;
      if (it.kind === 'message') { it.done = true; continue; }
      const tpl = BY_ID[it.t];
      const k = chooser ? chooser(S, it) : (tpl && tpl.def != null ? tpl.def : (it.opts[0] || {}).k);
      if (k != null) Desk.answer(S, it.id, k, { auto: !chooser });
      else it.done = true;
    }
  };

  // ---------------------------------------------------------------------------
  // Text helpers for templates
  // ---------------------------------------------------------------------------
  const nm = p => (p ? PBC.Player.name(p) : '');
  Desk.nm = nm;
  Desk.last = p => (p ? p.last : '');
  /** pronouns: Desk.he(p) 'he'/'she', him, his, He */
  Desk.he = p => (p && p.gender === 'f' ? 'she' : 'he');
  Desk.him = p => (p && p.gender === 'f' ? 'her' : 'him');
  Desk.his = p => (p && p.gender === 'f' ? 'her' : 'his');
  Desk.He = p => (p && p.gender === 'f' ? 'She' : 'He');
  Desk.His = p => (p && p.gender === 'f' ? 'Her' : 'His');
  Desk.guy = p => (p && p.gender === 'f' ? 'woman' : 'guy');
  Desk.team = (S, tid) => { const t = S.teams[tid]; return t ? `${t.city} ${t.name}` : ''; };
  Desk.persona = p => (PBC.Persona ? PBC.Persona.of(p) : 'easygoing');
  /** a player's season line so far */
  Desk.line = function (S, p) {
    const s = PBC.Stats.season(p, S.season, false);
    if (!s || !s.gp) return null;
    return { gp: s.gp, gs: s.gs, mpg: s.min / s.gp, ppg: s.pts / s.gp, rpg: (s.orb + s.drb) / s.gp, apg: s.ast / s.gp, fg: s.fga ? s.fgm / s.fga : 0, tp: s.tpa ? s.tpm / s.tpa : 0, s };
  };
  /** the minutes a roster spot expects (the morale model's own: starters 28, rotation 18, end of the bench 10) */
  Desk.expectedMin = function (S, p) {
    const roster = PBC.League.roster(S, p.tid);
    const rank = roster.indexOf(p);
    return rank < 5 ? 28 : rank < 8 ? 18 : rank < 10 ? 10 : 0;
  };
  /** the last n box lines of a player (the user's games keep their boxes this season) */
  Desk.recent = function (S, p, n) {
    const out = [];
    const ids = Object.keys(S.boxes || {}).map(Number).sort((a, b) => b - a);
    for (const gid of ids) {
      const box = S.boxes[gid];
      if (!box || !box.teams) continue;
      for (const T of box.teams) for (const pl of T.players) if (pl.pid === p.id && pl.min > 0) out.push(Object.assign({ gid }, pl));
      if (out.length >= n) break;
    }
    return out;
  };
})();
