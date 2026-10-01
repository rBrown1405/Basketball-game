/* Pro BBALL Coach — the Desk's situations (PBC.Desk.def). No DOM.
 *
 * Each situation is a template:
 *   { id, fam, kind: 'decision' | 'offer' | 'message', when, phases, w, cd, gcd, pri, due, block, def,
 *     find(S, X, extra) -> [{ key, w, ... }], build(S, c, X, extra) -> { title, text, from, opts, data },
 *     resolve(S, item, k, X) -> text | { text, nav }, follow(S, data, X) }
 * when: 'daily' (a daily budget picks one), 'game' (after one of your games, maybe one), 'gameAll' (after a game,
 * every one that applies: milestones), 'week' (every one that applies), 'series' (a playoff series of yours begins),
 * 'phase:<key>' (preseason, tipoff, allstar, deadline, postseason, season_end, offseason, draft, fa).
 * cd: days before the same template comes back for the same key (the player, the pair); gcd: for anyone.
 * fam: who it is from, for the Desk's filters: locker, owner, press, staff, league, community.
 * Effects go through PBC.Desk.fx (morale, chemistry, the owner's trust, the fans, the media, confidence, training,
 * promises). Words come from small banks with the Desk's own random stream, so a save always reads the same. */
(function () {
  'use strict';
  const PBC = (window.PBC = window.PBC || {});
  const U = PBC.U;
  const Desk = PBC.Desk;
  if (!Desk) return;
  const fx = Desk.fx;
  const def = Desk.def;
  const nm = Desk.nm, he = Desk.he, him = Desk.him, his = Desk.his, He = Desk.He, His = Desk.His;

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  const roster = (S, X) => (X.u >= 0 ? PBC.League.roster(S, X.u) : []);
  const team = (S, X) => S.teams[X.u];
  const healthy = p => !PBC.Player.isInjured(p);
  const type = p => Desk.persona(p);
  const pers = (p, k) => { const v = p && p.pers ? p.pers[k] : null; return v == null ? 50 : v; };
  const mor = p => (p.morale == null ? 70 : p.morale);
  const EGO = { diva: 1, cocky: 1, hothead: 1, showman: 0.6 };
  const CALM = { humble: 1, leader: 1, quiet: 1, easygoing: 1 };
  const pS = p => ({ type: 'player', pid: p.id, tid: p.tid, name: nm(p) });
  const pick = (R, arr) => arr[Math.floor(R() * arr.length)];
  /** fill {name}, {he}, {him}, {his}, {He}, {His}, {last} for a player, plus any extra keys */
  function fill(str, p, extra) {
    let s = str;
    if (p) {
      s = s.replace(/\{name\}/g, nm(p)).replace(/\{last\}/g, p.last).replace(/\{he\}/g, he(p)).replace(/\{him\}/g, him(p))
        .replace(/\{his\}/g, his(p)).replace(/\{He\}/g, He(p)).replace(/\{His\}/g, His(p));
    }
    if (extra) for (const k in extra) s = s.split('{' + k + '}').join(extra[k]);
    return s;
  }
  const say = (R, p, bank, extra) => fill(pick(R, bank), p, extra);
  const f1 = x => (Math.round(x * 10) / 10).toFixed(1);
  const inSeason = S => S.phase === 'regular' || S.phase === 'playin' || S.phase === 'playoffs';
  const staff = (S, role) => { const st = Desk.ensure(S).staff || {}; return st[role] || 'Your assistant'; };
  const STAFF_TITLE = { assistant: 'Lead assistant', trainer: 'Head trainer', scout: 'Director of scouting', pr: 'PR director', gm: 'Assistant GM' };
  const staffFrom = (S, role) => ({ type: 'staff', role: STAFF_TITLE[role] || 'Staff', name: staff(S, role) });
  const ownerFrom = (S, X) => ({ type: 'owner', tid: X.u, name: Desk.owner(S, X.u).name, role: 'Owner' });

  /** your rotation: give a player d more minutes (a manual rotation takes them from the end of the bench; an automatic
   *  one honours promises on its own, AI.autoRotation) */
  function bumpMinutes(S, X, p, d) {
    const t = team(S, X);
    if (!t || !t.rot || t.rot.auto !== false) { if (PBC.AI && t) PBC.AI.autoRotation(S, X.u); return; }
    const m = t.rot.minutes;
    m[p.id] = Math.max(0, (m[p.id] || 0) + d);
    let left = d;
    const others = U.sortBy(PBC.League.roster(S, X.u).filter(q => q !== p && (m[q.id] || 0) > 0), q => m[q.id] || 0);
    for (const q of others) { if (left <= 0) break; const take = Math.min(left, m[q.id], 4); m[q.id] -= take; left -= take; }
  }
  /** the rotation players (by minutes this season, else by rating) */
  function rotation(S, X, n) {
    const r = roster(S, X).filter(healthy);
    return U.sortBy(r, p => { const l = Desk.line(S, p); return (l ? l.mpg : 0) * 2 + p.ovr * 0.1; }, true).slice(0, n || 8);
  }
  const standing = (S, tid) => { const r = PBC.League.standings(S)[tid] || { w: 0, l: 0 }; return { w: r.w, l: r.l, gp: r.w + r.l, pct: r.w + r.l ? r.w / (r.w + r.l) : 0.5 }; };
  /** the next game of the user's on the schedule (regular season), or null */
  function nextGame(S, X) {
    if (S.phase !== 'regular') return null;
    return S.schedule.find(g => !g.played && g.day >= S.day && (g.h === X.u || g.a === X.u)) || null;
  }
  const oppOf = (g, u) => (g.h === u ? g.a : g.h);
  const teamName = (S, tid) => Desk.team(S, tid);
  const nickOf = (S, tid) => (S.teams[tid] ? S.teams[tid].name : '');
  // the press: the league's writers (PBC.Media), or a few made here when the media is not loaded
  const firstNames = Desk.firstNames;
  const OUTLETS = ['The Daily Dribble', 'Hoops Insider', 'Courtside Wire', 'The Paint', 'Full Court Press', 'Net Gains Radio', 'The Box Score', 'Baseline Report'];
  function reporter(S, R) {
    if (PBC.Media && PBC.Media.pickWriter) { const w = PBC.Media.pickWriter(S, R); if (w) return { name: w.name, outlet: w.outlet }; }
    const D = Desk.ensure(S);
    if (!D.press) {
      const r2 = Desk.makeRng(U.hash(`${S.saveId || 'save'}|desk|press`));
      const N = PBC.Names || {};
      D.press = OUTLETS.map(o => ({ name: `${r2.pick(firstNames(N))} ${r2.pick(N.last || ['Writer'])}`, outlet: o }));
      // your beat writer covers your team at home
      D.press.push({ name: D.staff ? D.staff.beat : 'Beat writer', outlet: `The ${S.teams[Desk.userTid(S)] ? S.teams[Desk.userTid(S)].city : 'Local'} Ledger`, beat: true });
    }
    return pick(R, D.press);
  }
  const pressFrom = r => ({ type: 'media', name: r.name, role: r.outlet });

  // ---------------------------------------------------------------------------
  // The locker room
  // ---------------------------------------------------------------------------
  def({
    id: 'pt_more', fam: 'locker', kind: 'decision', when: 'daily', phases: ['regular'], w: 1.3, cd: 30, gcd: 12, pri: 2, due: 3, def: 'role',
    find(S, X) {
      const out = [];
      for (const p of roster(S, X)) {
        if (!healthy(p) || p.promise) continue;
        const l = Desk.line(S, p);
        if (!l || l.gp < 6) continue;
        const exp = Desk.expectedMin(S, p);
        const short = exp - l.mpg;
        if (short < 4 || pers(p, 'pt') < 45 || mor(p) > 66) continue;
        out.push({ key: p.id, pid: p.id, w: (short / 4) * (pers(p, 'pt') / 50) * (0.6 + pers(p, 'ego') / 100), mpg: l.mpg });
      }
      return out;
    },
    build(S, c, X) {
      const p = S.players[c.pid], R = X.R;
      const ty = type(p);
      const quote = ty === 'diva' ? 'I\'m too good to be watching from the bench, Coach.' : ty === 'cocky' ? 'Give me the minutes and watch what happens.'
        : ty === 'hothead' ? 'I\'m not sitting there all night again. I\'m serious.' : CALM[ty] ? 'I\'ll do whatever you need. I just think I can help us more.'
        : pick(R, ['I can help this team more than this.', 'I need to get out there, Coach.', 'I\'m ready for a bigger role.']);
      const target = Math.round(c.mpg + 6);
      const roles = PBC.League.roster(S, X.u).indexOf(p);
      const opts = [
        { k: 'promise', label: 'Promise more minutes', hint: `${He(p)}'ll hold you to about ${target} a night over the next 10 games` },
        { k: 'role', label: 'Explain the role you see for ' + him(p), hint: 'Honest. Not everyone takes it well' },
        { k: 'earn', label: 'Tell ' + him(p) + ' to earn it in practice', hint: 'Workers respond; big egos sting' },
      ];
      if (roles >= 4 && roles <= 7) opts.push({ k: 'sixth', label: 'Make ' + him(p) + ' your sixth man', hint: 'A defined job off the bench' });
      return {
        title: `${nm(p)} wants more minutes`,
        text: say(R, p, [
          '{name} stopped by your office after practice. {He}\'s playing {mpg} minutes a night and thinks {he} has earned more. "{quote}"',
          '{name} asked for a word before shootaround. At {mpg} minutes a game {he} feels like an afterthought. "{quote}"',
          '{name}\'s agent called, then {name} came in himself. {mpg} minutes is not what {he} signed up for. "{quote}"',
        ], { mpg: f1(c.mpg), quote }).replace('himself', p.gender === 'f' ? 'herself' : 'himself'),
        from: pS(p), opts, data: { pid: p.id, target },
      };
    },
    resolve(S, it, k, X) {
      const p = S.players[it.data.pid];
      if (!p || p.tid !== X.u) return 'The moment passed.';
      const ty = type(p);
      if (k === 'promise') {
        fx.mor(S, p, 8);
        fx.promise(S, p, 'minutes', it.data.target, 10);
        bumpMinutes(S, X, p, 6);
        return `${nm(p)} leaves happy. ${He(p)} expects about ${it.data.target} minutes a night and will be counting over the next 10 games.`;
      }
      if (k === 'role') {
        if (EGO[ty] || pers(p, 'ego') >= 65) { fx.mor(S, p, -6); return `${nm(p)} didn't want to hear it. ${He(p)} walked out without a word.`; }
        if (CALM[ty]) { fx.mor(S, p, 1); return `${nm(p)} appreciated the honesty. "Understood, Coach. I'll be ready when you need me."`; }
        fx.mor(S, p, -2);
        return `${nm(p)} nodded, but ${he(p)} isn't happy about it.`;
      }
      if (k === 'earn') {
        if (pers(p, 'work') >= 65) { fx.mor(S, p, 2); fx.train(p, ['shotIQ', 'perD'], 0.5); return `${nm(p)} took it as a challenge and has been first in the gym every day since.`; }
        if (EGO[ty] || pers(p, 'ego') >= 65) { fx.mor(S, p, -7); fx.chem(S, X.u, -1); return `${nm(p)} took it personally. Teammates noticed the attitude at practice.`; }
        fx.mor(S, p, -3); fx.train(p, ['shotIQ'], 0.3);
        return `${nm(p)} said ${he(p)}'d keep working. ${He(p)} didn't sound convinced.`;
      }
      if (k === 'sixth') {
        if (pers(p, 'pt') >= 70 || EGO[ty]) { fx.mor(S, p, -2); return `${nm(p)} wanted to start, not a new title. ${He(p)}'ll take the role, grudgingly.`; }
        fx.mor(S, p, 5); bumpMinutes(S, X, p, 3);
        return `${nm(p)} likes having a clear job: first off the bench, finishing games.`;
      }
      return '';
    },
  });

  // the promise checked later (Desk.fx.promise schedules it)
  def({
    id: 'promise_check', fam: 'locker', kind: 'message', when: 'never',
    find: () => [], build: () => null,
    follow(S, d, X) {
      const p = S.players[d.pid];
      if (!p || !p.promise || !p.promise.desk) return;
      const s = PBC.Stats.season(p, S.season, false);
      if (p.tid !== X.u || !s) { p.promise = null; return; }
      const games = s.gp - (d.gp0 || 0);
      // too few games to judge: wait in the regular season; after it, the promise lapses
      if (games < 4) { if (S.phase === 'regular') Desk.follow(S, 5, 'promise_check', d); else p.promise = null; return; }
      let kept;
      if (d.type === 'starter') kept = games > 0 && (s.gs - (d.gs0 || 0)) / Math.max(1, games) >= 0.6;
      else {
        const mins = s.min - (d.min0 != null ? d.min0 : 0);
        kept = games > 0 && mins / games >= (d.min || 20) - 2;
      }
      p.promise = null;
      fx.credit(S, kept);
      if (kept) {
        fx.mor(S, p, 6);
        Desk.add(S, Desk.tpl('promise_check'), null, { kind: 'message', title: `You kept your word to ${nm(p)}`, text: `${nm(p)} got the ${d.type === 'starter' ? 'starting job' : 'minutes'} you promised. Word gets around a locker room: your players believe you.`, from: pS(p), data: { pid: p.id } });
      } else {
        fx.mor(S, p, -10); fx.chem(S, X.u, -1.5);
        Desk.add(S, Desk.tpl('promise_check'), null, { kind: 'message', pri: 2, title: `${nm(p)} says you broke your promise`, text: `You promised ${nm(p)} ${d.type === 'starter' ? 'a starting job' : `about ${d.min} minutes a night`}. It didn't happen, and ${he(p)} isn't keeping it to ${him(p)}self. Free agents hear about these things too.`.replace(him(p) + 'self', p.gender === 'f' ? 'herself' : 'himself'), from: pS(p), data: { pid: p.id } });
      }
    },
  });

  def({
    id: 'start_me', fam: 'locker', kind: 'decision', when: 'daily', phases: ['regular'], w: 0.9, cd: 60, gcd: 30, pri: 2, due: 3, def: 'keep',
    find(S, X) {
      const t = team(S, X);
      if (!t || !t.rot) return [];
      const st = new Set(t.rot.starters || []);
      const r = roster(S, X);
      const starters = r.filter(p => st.has(p.id));
      if (starters.length < 5) return [];
      const weakest = U.minBy(starters, p => p.ovr);
      const out = [];
      for (const p of r) {
        if (st.has(p.id) || !healthy(p) || p.promise) continue;
        const l = Desk.line(S, p);
        if (!l || l.gp < 8) continue;
        if (p.ovr < weakest.ovr - 1 || pers(p, 'ego') < 50 || mor(p) > 72) continue;
        out.push({ key: p.id, pid: p.id, vs: weakest.id, w: 1 + (p.ovr - weakest.ovr) * 0.2 });
      }
      return out;
    },
    build(S, c, X) {
      const p = S.players[c.pid], q = S.players[c.vs], R = X.R;
      return {
        title: `${nm(p)} wants to start`,
        text: say(R, p, [
          '{name} thinks {he} should be in the starting five. {He}\'s rated higher than {other} and wants you to see it the same way.',
          '{name} came to you directly: "I should be starting, Coach. You know it and the guys know it." {other} has the job right now.',
        ], { other: nm(q) }),
        from: pS(p),
        opts: [
          { k: 'start', label: `Promise ${him(p)} the starting job`, hint: `${nm(q)} won't love it` },
          { k: 'keep', label: 'Keep the starting five as it is', hint: `${He(p)} may sulk` },
          { k: 'later', label: 'Revisit it at the All-Star break', hint: 'Buys time' },
        ],
        data: { pid: p.id, vs: q.id },
      };
    },
    resolve(S, it, k, X) {
      const p = S.players[it.data.pid], q = S.players[it.data.vs];
      if (!p || p.tid !== X.u) return 'The moment passed.';
      const t = team(S, X);
      if (k === 'start') {
        fx.mor(S, p, 9);
        fx.promise(S, p, 'starter', 0, 10);
        if (t && t.rot && q) {
          const i = t.rot.starters.indexOf(q.id);
          if (i >= 0) t.rot.starters[i] = p.id;
          if (t.rot.auto !== false) PBC.AI.autoRotation(S, X.u);
        }
        if (q && q.tid === X.u) fx.mor(S, q, CALM[type(q)] ? -2 : -6);
        return `${nm(p)} is in the starting five.${q ? ` ${nm(q)} goes to the bench and isn't thrilled.` : ''}`;
      }
      if (k === 'keep') { fx.mor(S, p, EGO[type(p)] ? -7 : -4); return `${nm(p)} heard you. ${He(p)} didn't like it.`; }
      fx.mor(S, p, -1);
      Desk.follow(S, Math.max(10, (S.allStarDay || S.day + 30) - S.day), 'start_me_later', { pid: p.id });
      return `You told ${nm(p)} you'd revisit it at the All-Star break. ${He(p)}'ll remember.`;
    },
  });
  def({
    id: 'start_me_later', fam: 'locker', kind: 'message', when: 'never', find: () => [], build: () => null,
    follow(S, d, X) {
      const p = S.players[d.pid];
      if (!p || p.tid !== X.u) return;
      const t = team(S, X);
      if (t && t.rot && (t.rot.starters || []).includes(p.id)) return;
      fx.mor(S, p, -4);
      Desk.add(S, Desk.tpl('start_me_later'), null, { kind: 'message', title: `${nm(p)} is still waiting`, text: `You told ${nm(p)} you'd revisit ${his(p)} role at the break. ${He(p)} is still coming off the bench and ${he(p)} noticed.`, from: pS(p), data: { pid: p.id } });
    },
  });

  def({
    id: 'more_shots', fam: 'locker', kind: 'decision', when: 'daily', phases: ['regular'], w: 0.8, cd: 60, gcd: 30, pri: 1, due: 3, def: 'balance',
    find(S, X) {
      const t = team(S, X);
      if (!t) return [];
      const out = [];
      const r = roster(S, X).filter(healthy);
      const scorers = U.sortBy(r, p => { const l = Desk.line(S, p); return l ? l.ppg : 0; }, true).slice(0, 4);
      for (const p of scorers) {
        if (t.strat.goTo1 === p.id || pers(p, 'ego') < 60 || mor(p) > 74) continue;
        const l = Desk.line(S, p);
        if (!l || l.gp < 10 || l.ppg < 11) continue;
        out.push({ key: p.id, pid: p.id, w: pers(p, 'ego') / 60 });
      }
      return out;
    },
    build(S, c, X) {
      const p = S.players[c.pid], R = X.R, t = team(S, X);
      const star = t.strat.goTo1 != null ? S.players[t.strat.goTo1] : null;
      return {
        title: `${nm(p)} wants the ball more`,
        text: say(R, p, [
          '{name} feels the offense runs through everyone but {him}. "Put the ball in my hands at the end of games. I\'ll win them."',
          '{name} has been grumbling about touches. {He} wants to be a go-to option, not a spot-up shooter.',
        ]) + (star && star !== p ? ` ${nm(star)} is your go-to guy right now.` : ''),
        from: pS(p),
        opts: [
          { k: 'goto', label: `Make ${him(p)} your go-to option`, hint: star && star !== p ? `${nm(star)} may feel it` : 'Plays run for him' },
          { k: 'balance', label: 'Keep the offense balanced', hint: 'Fair, but he wanted more' },
          { k: 'defense', label: 'Earn it at the other end first', hint: 'He\'ll work on his defense' },
        ],
        data: { pid: p.id, star: star ? star.id : null },
      };
    },
    resolve(S, it, k, X) {
      const p = S.players[it.data.pid];
      if (!p || p.tid !== X.u) return 'The moment passed.';
      const t = team(S, X);
      if (k === 'goto') {
        const old = t.strat.goTo1;
        t.strat.goTo2 = old != null && old !== p.id ? old : t.strat.goTo2;
        t.strat.goTo1 = p.id;
        fx.mor(S, p, 7);
        const star = it.data.star != null ? S.players[it.data.star] : null;
        if (star && star !== p && star.tid === X.u) { fx.mor(S, star, CALM[type(star)] ? -1 : -5); fx.chem(S, X.u, -1); }
        return `${nm(p)} is now your first go-to option.${star && star !== p ? ` ${nm(star)} moves to second.` : ''}`;
      }
      if (k === 'balance') { fx.mor(S, p, -4); fx.chem(S, X.u, 1); return `The offense stays balanced. ${nm(p)} isn't happy, but the rest of the room likes it.`; }
      fx.mor(S, p, -2); fx.train(p, ['perD', 'helpD'], 0.5);
      return `${nm(p)} rolled ${his(p)} eyes, then started showing up early for defensive drills.`;
    },
  });

  // two players at each other's throats
  const BEEF_REASON = [
    '{a} called out {b}\'s defense in front of the whole team',
    '{a} and {b} got into it over touches in the second half',
    '{a} blew up at {b} over a missed rotation, and it carried into the locker room',
    '{a} said {b} plays for {his} stats. {b} heard about it',
  ];
  def({
    id: 'beef', fam: 'locker', kind: 'decision', when: 'daily', phases: ['regular', 'playin', 'playoffs'], w: 0.8, cd: 60, gcd: 40, pri: 2, due: 2, def: 'meeting',
    find(S, X) {
      const r = rotation(S, X, 10);
      const st = standing(S, X.u);
      const chem = Desk.chem(S, X.u);
      if (st.gp < 8 || (st.pct >= 0.55 && chem >= 55)) return [];
      const out = [];
      for (const a of r) {
        const ta = type(a);
        if (!(EGO[ta] || ta === 'competitor')) continue;
        for (const b of r) {
          if (b === a) continue;
          if (pers(b, 'ego') < 45 && !EGO[type(b)] && type(b) !== 'competitor') continue;
          out.push({ key: Math.min(a.id, b.id) + '-' + Math.max(a.id, b.id), a: a.id, b: b.id, w: (pers(a, 'ego') + pers(b, 'ego')) / 100 * (1 + (55 - chem) / 30) });
        }
      }
      return out;
    },
    build(S, c, X) {
      const a = S.players[c.a], b = S.players[c.b], R = X.R;
      const reason = pick(R, BEEF_REASON).replace(/\{a\}/g, nm(a)).replace(/\{b\}/g, nm(b)).replace(/\{his\}/g, his(b));
      return {
        title: `${a.last} and ${b.last} had to be separated`,
        text: `It happened at practice: ${reason}. Teammates stepped in, but the room is split and the beat writers are already asking.`,
        from: { type: 'staff', role: STAFF_TITLE.assistant, name: staff(S, 'assistant') },
        opts: [
          { k: 'a', label: `Back ${nm(a)}`, hint: `${b.last} won't forget it` },
          { k: 'b', label: `Back ${nm(b)}`, hint: `${a.last} won't forget it` },
          { k: 'meeting', label: 'Hold a team meeting', hint: 'Clear the air, if your leaders help' },
          { k: 'fine', label: 'Fine them both', hint: 'Order restored; the owner approves' },
        ],
        data: { a: a.id, b: b.id },
      };
    },
    resolve(S, it, k, X) {
      const a = S.players[it.data.a], b = S.players[it.data.b];
      if (!a || !b || a.tid !== X.u || b.tid !== X.u) return 'One of them is gone now. It sorted itself out.';
      if (k === 'a' || k === 'b') {
        const win = k === 'a' ? a : b, lose = k === 'a' ? b : a;
        fx.mor(S, win, 5); fx.mor(S, lose, -9); fx.chem(S, X.u, -3);
        Desk.follow(S, 10, 'beef_flare', { pid: lose.id, other: win.id });
        return `You sided with ${nm(win)}. ${nm(lose)} went quiet, which is never a good sign.`;
      }
      if (k === 'meeting') {
        const leaders = PBC.League.roster(S, X.u).filter(p => type(p) === 'leader' || (type(p) === 'humble' && p.age >= 29)).length;
        fx.chem(S, X.u, leaders ? 5 : 2); fx.mor(S, a, -1); fx.mor(S, b, -1);
        return leaders ? 'The veterans ran the meeting as much as you did. The air feels cleaner.' : 'Everyone said their piece. It helped a little.';
      }
      fx.mor(S, a, -4); fx.mor(S, b, -4); fx.chem(S, X.u, 2); fx.own(S, 1);
      return `Both were fined. The message landed: nobody is bigger than the team.`;
    },
  });
  def({
    id: 'beef_flare', fam: 'locker', kind: 'message', when: 'never', find: () => [], build: () => null,
    follow(S, d, X) {
      const p = S.players[d.pid];
      if (!p || p.tid !== X.u) return;
      if (mor(p) < 50 && !p.tradeReq && X.R() < 0.45 && PBC.Season.makeTradeRequest) {
        PBC.Season.makeTradeRequest(S, p, { reason: 'unhappy', text: 'is still upset about how the feud with a teammate was handled' });
        Desk.add(S, Desk.tpl('beef_flare'), null, { kind: 'message', pri: 2, title: `${nm(p)} has asked for a trade`, text: `The feud never really ended. ${nm(p)} feels you took sides against ${him(p)}, and now ${he(p)} wants out.`, from: pS(p), data: { pid: p.id } });
      }
    },
  });

  def({
    id: 'vet_mentor', fam: 'locker', kind: 'offer', when: 'daily', phases: ['regular'], w: 0.7, cd: 120, gcd: 30, pri: 1, due: 5, def: 'no', block: false,
    find(S, X) {
      const r = roster(S, X);
      const vets = r.filter(p => p.age >= 30 && pers(p, 'work') >= 55 && (CALM[type(p)] || type(p) === 'competitor'));
      const kids = r.filter(p => p.age <= 22 && p.pot - p.ovr >= 6);
      const out = [];
      for (const v of vets) for (const k of kids) if (v.pos === k.pos || Math.abs(PBC.Config.POS_NUM[v.pos] - PBC.Config.POS_NUM[k.pos]) <= 1) out.push({ key: v.id, v: v.id, k: k.id, w: 1 });
      return out;
    },
    build(S, c, X) {
      const v = S.players[c.v], k = S.players[c.k];
      return {
        title: `${nm(v)} wants to mentor ${nm(k)}`,
        text: `${nm(v)} has been in the league for ${v.yearsPro || v.age - 21} seasons and sees a lot of ${his(v)} younger self in ${nm(k)}. ${He(v)} offered to take ${k.last} under ${his(v)} wing: film after practice, extra work on the off days.`,
        from: pS(v),
        opts: [{ k: 'yes', label: 'Pair them up', hint: 'The kid develops faster; the room notices' }, { k: 'no', label: 'Not right now', hint: '' }],
        data: { v: v.id, kid: k.id },
      };
    },
    resolve(S, it, k, X) {
      const v = S.players[it.data.v], kid = S.players[it.data.kid];
      if (!v || !kid || v.tid !== X.u || kid.tid !== X.u) return 'One of them has moved on.';
      if (k === 'yes') {
        fx.mor(S, v, 4); fx.mor(S, kid, 3); fx.chem(S, X.u, 2);
        fx.train(kid, ['shotIQ', 'vision', 'helpD'], 0.6);
        Desk.follow(S, 14, 'mentor_tick', { v: v.id, kid: kid.id, n: 3 });
        return `${nm(v)} and ${nm(kid)} are inseparable now. ${kid.last}'s feel for the game is already growing.`;
      }
      fx.mor(S, v, -1);
      return 'You thanked him and passed. Maybe next season.'.replace('him', him(v));
    },
  });
  def({
    id: 'mentor_tick', fam: 'locker', kind: 'message', when: 'never', find: () => [], build: () => null,
    follow(S, d, X) {
      const v = S.players[d.v], kid = S.players[d.kid];
      if (!v || !kid || v.tid !== X.u || kid.tid !== X.u) return;
      const up = fx.train(kid, U.sortBy(['shotIQ', 'vision', 'helpD', 'perD', 'three', 'handle'], k => kid.r[k]).slice(0, 2), 0.5);
      if (up && d.n === 1) Desk.add(S, Desk.tpl('mentor_tick'), null, { kind: 'message', title: `${nm(kid)} is growing up fast`, text: `The sessions with ${nm(v)} are paying off: ${kid.last} is reading the floor like a veteran.`, from: pS(kid), data: { pid: kid.id } });
      if (d.n > 1) Desk.follow(S, 14, 'mentor_tick', { v: d.v, kid: d.kid, n: d.n - 1 });
    },
  });

  def({
    id: 'late_film', fam: 'locker', kind: 'decision', when: 'daily', phases: ['regular', 'playoffs', 'playin'], w: 0.8, cd: 70, gcd: 35, pri: 1, due: 2, def: 'talk',
    find(S, X) {
      return roster(S, X).filter(p => pers(p, 'work') <= 48 || type(p) === 'goofball' || type(p) === 'diva').map(p => ({ key: p.id, pid: p.id, w: (60 - pers(p, 'work')) / 20 + 0.3 }));
    },
    build(S, c, X) {
      const p = S.players[c.pid], R = X.R;
      return {
        title: `${nm(p)} skipped film`,
        text: say(R, p, [
          '{name} showed up 40 minutes late to film this morning. {His} excuse was traffic. The other players were on time.',
          '{name} missed the morning film session entirely and answered nobody\'s calls until noon.',
          '{name} walked into film halfway through, sunglasses on, coffee in hand.',
        ]),
        from: staffFrom(S, 'assistant'),
        opts: [
          { k: 'fine', label: 'Fine ' + him(p), hint: 'Standards matter; he won\'t like it' },
          { k: 'talk', label: 'Talk to ' + him(p) + ' privately', hint: 'Respectful. Might happen again' },
          { k: 'dawn', label: 'Dawn conditioning for a week', hint: 'Punishment that builds stamina' },
          { k: 'slide', label: 'Let it slide', hint: 'The room is watching' },
        ],
        data: { pid: p.id },
      };
    },
    resolve(S, it, k, X) {
      const p = S.players[it.data.pid];
      if (!p || p.tid !== X.u) return 'The moment passed.';
      if (k === 'fine') { fx.mor(S, p, -5); fx.chem(S, X.u, 1.5); fx.own(S, 1); return `${nm(p)} was fined. ${He(p)} was on time the next day, and the next.`; }
      if (k === 'talk') {
        fx.mor(S, p, 1);
        if (X.R() < 0.35) Desk.follow(S, 12, 'late_again', { pid: p.id });
        return `${nm(p)} apologized and promised it won't happen again.`;
      }
      if (k === 'dawn') { fx.mor(S, p, -3); fx.train(p, ['stamina'], 0.8); fx.chem(S, X.u, 1); return `Six a.m. sprints all week. ${nm(p)} hated it. ${His(p)} legs didn't.`; }
      fx.chem(S, X.u, -2.5);
      return 'Nothing happened. Some of your veterans noticed that nothing happened.';
    },
  });
  def({
    id: 'late_again', fam: 'locker', kind: 'message', when: 'never', find: () => [], build: () => null,
    follow(S, d, X) {
      const p = S.players[d.pid];
      if (!p || p.tid !== X.u) return;
      fx.chem(S, X.u, -1.5);
      Desk.add(S, Desk.tpl('late_again'), null, { kind: 'message', title: `${nm(p)} was late again`, text: `So much for the talk. ${nm(p)} missed the start of film again. Your assistants want to know what you'll do this time.`, from: staffFrom(S, 'assistant'), data: { pid: p.id } });
    },
  });

  def({
    id: 'contract_talk', fam: 'locker', kind: 'decision', when: 'daily', phases: ['regular'], w: 0.9, cd: 400, gcd: 15, pri: 2, due: 4, def: 'summer',
    find(S, X) {
      if (S.day < 25) return [];
      return roster(S, X).filter(p => p.contract && p.contract.exp === S.season && p.ovr >= 70 && !(p.deskTalk && p.deskTalk.season === S.season))
        .map(p => ({ key: p.id + ':' + S.season, pid: p.id, w: (p.ovr - 66) / 6 }));
    },
    build(S, c, X) {
      const p = S.players[c.pid], R = X.R;
      return {
        title: `${nm(p)} asks about ${his(p)} future`,
        text: say(R, p, [
          '{name} is in the last year of {his} contract. {He} wants to know where {he} stands: "Do you see me here next year, Coach?"',
          '{name}\'s agent called: {his} client is playing out the final year of {his} deal and would like to hear the team\'s plans.',
        ]),
        from: pS(p),
        opts: [
          { k: 'yes', label: 'Tell ' + him(p) + ' you want ' + him(p) + ' long-term', hint: 'He plays freer; he\'ll expect an offer' },
          { k: 'summer', label: 'Say you\'ll talk in the summer', hint: 'Noncommittal' },
          { k: 'no', label: 'Make no promises', hint: 'Honest. He may start looking around' },
        ],
        data: { pid: p.id },
      };
    },
    resolve(S, it, k, X) {
      const p = S.players[it.data.pid];
      if (!p || p.tid !== X.u) return 'The moment passed.';
      p.deskTalk = { season: S.season, k };
      if (k === 'yes') { fx.mor(S, p, 6); fx.conf(p, 0.04); return `${nm(p)} exhaled. "That's all I needed to hear." Now ${he(p)}'ll be expecting an offer this summer.`; }
      if (k === 'summer') { fx.mor(S, p, -2); return `${nm(p)} said ${he(p)} understood. ${His(p)} agent didn't sound like it.`; }
      fx.mor(S, p, -7);
      return `${nm(p)} took it badly. ${He(p)}'ll be weighing other offers this summer.`;
    },
  });

  def({
    id: 'trade_req_meet', fam: 'locker', kind: 'decision', when: 'daily', phases: ['regular'], w: 6, cd: 400, pri: 3, due: 2, def: 'explore',
    find(S, X) {
      return roster(S, X).filter(p => p.tradeReq && p.tradeReq.season === S.season && !p.tradeReq.met).map(p => ({ key: p.id + ':' + S.season, pid: p.id }));
    },
    build(S, c, X) {
      const p = S.players[c.pid];
      const why = (p.tradeReq.text || 'is unhappy').replace(/\bhis\b/g, his(p)).replace(/\bhim\b/g, him(p));
      return {
        title: `${nm(p)}'s agent wants a meeting`,
        text: `${nm(p)} has asked for a trade: ${he(p)} ${why}. ${His(p)} agent wants to hear what you plan to do about it, today.`,
        from: pS(p),
        opts: [
          { k: 'explore', label: 'Promise to explore trades', hint: 'He calms down; teams will call' },
          { k: 'talk', label: 'Try to talk ' + him(p) + ' out of it', hint: 'Loyal players listen; others don\'t' },
          { k: 'role', label: 'Promise ' + him(p) + ' a bigger role', hint: 'A promise you\'ll be held to' },
          { k: 'refuse', label: 'Refuse to deal ' + him(p), hint: 'Your call. The room feels it' },
        ],
        data: { pid: p.id },
      };
    },
    resolve(S, it, k, X) {
      const p = S.players[it.data.pid];
      if (!p || p.tid !== X.u || !p.tradeReq) return 'It worked itself out before the meeting.';
      p.tradeReq.met = true;
      if (k === 'explore') { fx.mor(S, p, 5); p.deskShop = S.season; return `${nm(p)}'s camp is satisfied for now. Expect calls from other front offices.`; }
      if (k === 'talk') {
        const ch = 0.25 + pers(p, 'loyal') / 220 + (Desk.chem(S, X.u) - 50) / 200;
        if (X.R() < ch) { PBC.Season.rescindTradeRequest(S, p); fx.mor(S, p, 6); return `It took two hours, but ${nm(p)} has taken back the trade request.`; }
        fx.mor(S, p, -3);
        return `${nm(p)} listened politely. The request stands.`;
      }
      if (k === 'role') {
        const l = Desk.line(S, p);
        fx.promise(S, p, 'minutes', Math.round((l ? l.mpg : 20) + 6), 10);
        fx.mor(S, p, 7);
        bumpMinutes(S, X, p, 6);
        if (X.R() < 0.4 + pers(p, 'loyal') / 300) { PBC.Season.rescindTradeRequest(S, p); return `${nm(p)} will give it a chance. The trade request is off the table, for now.`; }
        return `${nm(p)} likes the sound of a bigger role, but the request stands until ${he(p)} sees it.`;
      }
      fx.mor(S, p, -6); fx.chem(S, X.u, -2);
      return `${nm(p)} isn't going anywhere. ${He(p)} isn't happy about it either.`;
    },
  });

  def({
    id: 'slump', fam: 'locker', kind: 'decision', when: 'game', phases: ['regular', 'playin', 'playoffs'], w: 1.2, cd: 30, gcd: 6, pri: 1, due: 2, block: false, def: 'keep',
    find(S, X) {
      const out = [];
      for (const p of rotation(S, X, 8)) {
        const rec = Desk.recent(S, p, 3);
        if (rec.length < 3) continue;
        const fga = U.sum(rec, g => g.fga), fgm = U.sum(rec, g => g.fgm);
        const l = Desk.line(S, p);
        if (fga < 18 || !l || l.fg < 0.42 || fgm / fga > 0.33) continue;
        out.push({ key: p.id, pid: p.id, fg: fgm / fga, w: 1 + (0.33 - fgm / fga) * 6 });
      }
      return out;
    },
    build(S, c, X) {
      const p = S.players[c.pid];
      return {
        title: `${nm(p)} can't buy a bucket`,
        text: `${nm(p)} has shot ${Math.round(c.fg * 100)}% from the floor over the last three games. ${He(p)}'s pressing: rushing shots, staring at the rim after misses.`,
        from: staffFrom(S, 'assistant'),
        opts: [
          { k: 'keep', label: '"Keep shooting. You\'re our guy."', hint: 'Confidence up' },
          { k: 'simplify', label: 'Simplify ' + his(p) + ' role for a few games', hint: 'Fewer shots, less pressure' },
          { k: 'work', label: 'Extra shooting sessions', hint: 'Fix the mechanics' },
        ],
        data: { pid: p.id },
      };
    },
    resolve(S, it, k, X) {
      const p = S.players[it.data.pid];
      if (!p || p.tid !== X.u) return '';
      if (k === 'keep') { fx.conf(p, 0.09); fx.mor(S, p, 3); return `${nm(p)} needed to hear that. ${He(p)} walked out of your office standing taller.`; }
      if (k === 'simplify') { fx.conf(p, -0.02); fx.mor(S, p, EGO[type(p)] ? -4 : 0); return `${nm(p)} will be a decoy for a few nights while ${his(p)} shot comes back.`; }
      fx.train(p, ['three', 'mid'], 0.4); fx.conf(p, 0.03);
      return `${nm(p)} and the shooting coach were in the gym until midnight.`;
    },
  });

  def({
    id: 'big_night', fam: 'locker', kind: 'decision', when: 'game', phases: ['regular', 'playin', 'playoffs'], w: 2, cd: 25, pri: 1, due: 1, block: false, def: 'team',
    find(S, X, ex) {
      if (!ex || !ex.box) return [];
      const T = ex.box.teams.find(t => t.tid === X.u);
      if (!T) return [];
      return T.players.filter(pl => pl.pts >= 38 || (pl.pts >= 10 && pl.orb + pl.drb >= 10 && pl.ast >= 10)).map(pl => ({ key: pl.pid, pid: pl.pid, pts: pl.pts, reb: pl.orb + pl.drb, ast: pl.ast, w: 2 }));
    },
    build(S, c, X) {
      const p = S.players[c.pid];
      return {
        title: `${nm(p)}'s big night`,
        text: `${nm(p)} went for ${c.pts} points, ${c.reb} rebounds and ${c.ast} assists. The press wants your take after the game.`,
        from: pS(p),
        opts: [
          { k: 'praise', label: 'Praise ' + him(p) + ' to the press', hint: 'He loves it; some teammates roll their eyes' },
          { k: 'team', label: 'Keep it team-first', hint: 'The room likes it' },
        ],
        data: { pid: p.id },
      };
    },
    resolve(S, it, k, X) {
      const p = S.players[it.data.pid];
      if (!p) return '';
      if (k === 'praise') {
        fx.mor(S, p, 4); fx.fans(S, X.u, 1); fx.conf(p, 0.03);
        const egos = PBC.League.roster(S, X.u).filter(q => q !== p && pers(q, 'ego') >= 70).length;
        if (egos) fx.chem(S, X.u, -1);
        return `"Special player. Special night." ${nm(p)} posted the clip within the hour.`;
      }
      fx.chem(S, X.u, 2); fx.mor(S, p, EGO[type(p)] ? -1 : 1);
      return '"Everybody made the right play tonight." The bench loved it.';
    },
  });

  // career milestones of your players (every one, after your games)
  const MILES = [['pts', [5000, 10000, 15000, 20000, 25000, 30000, 35000], 'points'], ['ast', [2500, 5000, 7500, 10000], 'assists'],
    ['reb', [5000, 7500, 10000, 12500, 15000], 'rebounds'], ['blk', [1000, 1500, 2000], 'blocks'], ['stl', [1000, 1500, 2000], 'steals'],
    ['tpm', [1000, 1500, 2000, 2500, 3000], 'threes'], ['gp', [500, 750, 1000, 1250], 'games']];
  def({
    id: 'milestone', fam: 'locker', kind: 'decision', when: 'gameAll', w: 1, multi: true, pri: 1, due: 2, block: false, def: 'quiet',
    find(S, X, ex) {
      // only what was crossed tonight (a veteran who arrives with 20,000 points is not a milestone)
      const T = ex && ex.box && !(ex.sg && ex.sg.playoff) ? ex.box.teams.find(t => t.tid === X.u) : null;   // (career totals are the regular season's)
      if (!T) return [];
      const out = [];
      for (const pl of T.players) {
        const p = S.players[pl.pid];
        if (!p || !(pl.min > 0)) continue;
        const c = PBC.Stats.career(p, false);
        c.reb = (c.orb || 0) + (c.drb || 0);
        const tonight = { pts: pl.pts, ast: pl.ast, reb: (pl.orb || 0) + (pl.drb || 0), blk: pl.blk, stl: pl.stl, tpm: pl.tpm, gp: 1 };
        const got = p.miles || [];
        for (const [k, list, label] of MILES) for (const v of list) {
          const tag = k + v;
          const prev = (c[k] || 0) - (tonight[k] || 0);
          if (c[k] >= v && prev < v && !got.includes(tag)) out.push({ key: p.id + ':' + tag, pid: p.id, tag, v, label });
        }
      }
      return out;
    },
    build(S, c, X) {
      const p = S.players[c.pid];
      (p.miles || (p.miles = [])).push(c.tag);
      return {
        title: `${nm(p)}: ${c.v.toLocaleString('en-US')} career ${c.label}`,
        text: `${nm(p)} reached ${c.v.toLocaleString('en-US')} career ${c.label} tonight. The game ball is on your desk.`,
        from: pS(p),
        opts: [{ k: 'party', label: 'Celebrate it in the locker room', hint: 'A big moment for the room' }, { k: 'quiet', label: 'A quiet word of congratulations', hint: '' }],
        data: { pid: p.id },
      };
    },
    resolve(S, it, k, X) {
      const p = S.players[it.data.pid];
      if (!p) return '';
      if (k === 'party') { fx.mor(S, p, 4); fx.chem(S, X.u, 2); return 'The whole team doused him in water. Pure joy.'.replace('him', him(p)); }
      fx.mor(S, p, 1);
      return 'A handshake, a nod, back to work.';
    },
  });

  def({
    id: 'rookie_wall', fam: 'locker', kind: 'decision', when: 'daily', phases: ['regular'], w: 0.9, cd: 400, gcd: 20, pri: 1, due: 3, def: 'push',
    find(S, X) {
      if (S.day < 60) return [];
      return roster(S, X).filter(p => p.draft && p.draft.year === S.season && healthy(p)).map(p => {
        const l = Desk.line(S, p);
        if (!l || l.gp < 20 || l.mpg < 12) return null;
        const rec = Desk.recent(S, p, 5);
        if (rec.length < 4) return null;
        const rp = U.avg(rec, g => g.pts);
        if (rp > l.ppg * 0.75) return null;
        return { key: p.id + ':' + S.season, pid: p.id, rp, ppg: l.ppg };
      }).filter(Boolean);
    },
    build(S, c, X) {
      const p = S.players[c.pid];
      return {
        title: `${nm(p)} has hit the rookie wall`,
        text: `${nm(p)} is averaging ${f1(c.rp)} points over the last five, down from ${f1(c.ppg)}. Eighty-two games is a lot of basketball when you're used to thirty-five.`,
        from: staffFrom(S, 'trainer'),
        opts: [
          { k: 'rest', label: 'Lighter practices for a couple of weeks', hint: 'Fresh legs, fresh mind' },
          { k: 'film', label: 'Extra film with the coaches', hint: 'Learn the league faster' },
          { k: 'push', label: 'Keep pushing ' + him(p), hint: 'Rookies have to learn' },
        ],
        data: { pid: p.id },
      };
    },
    resolve(S, it, k, X) {
      const p = S.players[it.data.pid];
      if (!p || p.tid !== X.u) return '';
      if (k === 'rest') { fx.mor(S, p, 4); fx.conf(p, 0.05); return `${nm(p)} looks lighter already. ${He(p)} thanked you twice.`; }
      if (k === 'film') { fx.train(p, ['shotIQ', 'vision', 'helpD'], 0.5); return `${nm(p)} is learning the league one clip at a time.`; }
      fx.mor(S, p, -3); fx.train(p, ['stamina'], 0.4);
      return `${nm(p)} gritted ${his(p)} teeth and kept going.`;
    },
  });

  // ---------------------------------------------------------------------------
  // Season beats: the captain, exit interviews, a veteran's last year
  // ---------------------------------------------------------------------------
  def({
    id: 'captain', fam: 'locker', kind: 'decision', when: 'phase:preseason', w: 1, pri: 2, due: 10, def: 'c0',
    find(S, X) { return roster(S, X).length >= 8 ? [{ key: 'cap:' + S.season }] : []; },
    build(S, c, X) {
      const r = roster(S, X);
      const cands = U.sortBy(r, p => p.ovr * 0.6 + Math.min(p.age, 33) * 1.2 + (type(p) === 'leader' ? 12 : CALM[type(p)] ? 5 : EGO[type(p)] ? -4 : 0) + (p.yearsPro || 0), true).slice(0, 3);
      return {
        title: 'Name your captain',
        text: `Media day is tomorrow and the beat writers will ask who leads this team. It's your call, and the room will read a lot into it.`,
        from: staffFrom(S, 'pr'),
        opts: cands.map((p, i) => ({ k: 'c' + i, label: `${nm(p)} (${PBC.Persona ? PBC.Persona.info(type(p)).label : ''})`, hint: type(p) === 'leader' ? 'A natural leader' : EGO[type(p)] ? 'He\'ll love it; others may not' : 'Respected in the room' }))
          .concat([{ k: 'none', label: 'No captain this year', hint: 'Let leaders emerge' }]),
        data: { cands: cands.map(p => p.id) },
      };
    },
    resolve(S, it, k, X) {
      const D = Desk.ensure(S);
      if (k === 'none') { fx.chem(S, X.u, -1); return 'No captain. Some players liked that; the veterans expected one.'; }
      const p = S.players[it.data.cands[+k.slice(1)]];
      if (!p || p.tid !== X.u) return 'The roster changed; no captain this year.';
      (D.captain = D.captain || {})[S.season] = p.id;
      const ty = type(p);
      fx.mor(S, p, EGO[ty] ? 9 : 6);
      fx.chem(S, X.u, ty === 'leader' ? 5 : CALM[ty] || ty === 'competitor' ? 3 : EGO[ty] ? -2 : 1);
      for (const q of PBC.League.roster(S, X.u)) if (q !== p && pers(q, 'ego') >= 72) fx.mor(S, q, -2);
      return `${nm(p)} will wear the C this season.`;
    },
  });

  const FOCUS = {
    shooting: { label: 'Shooting', keys: ['three', 'mid', 'ft'] },
    finishing: { label: 'Strength and finishing', keys: ['strength', 'close', 'layup'] },
    handles: { label: 'Handles and playmaking', keys: ['handle', 'pass', 'vision'] },
    defense: { label: 'Defense', keys: ['perD', 'intD', 'helpD'] },
    body: { label: 'Rest and recovery', keys: ['stamina', 'durability'] },
  };
  function bestFocus(p) {
    let best = 'shooting', bv = 999;
    for (const k in FOCUS) { if (k === 'body') continue; const v = U.avg(FOCUS[k].keys, x => p.r[x]); if (v < bv) { bv = v; best = k; } }
    return p.age >= 32 ? 'body' : best;
  }
  def({
    id: 'exit_interview', fam: 'locker', kind: 'decision', when: 'phase:season_end', w: 1, multi: true, pri: 1, due: 14, block: false, def: 'auto',
    find(S, X) {
      return rotation(S, X, 5).map(p => ({ key: 'exit:' + p.id + ':' + S.season, pid: p.id }));
    },
    build(S, c, X) {
      const p = S.players[c.pid];
      const sug = bestFocus(p);
      return {
        title: `Exit interview: ${nm(p)}`,
        text: `The season is over and ${nm(p)} is in your office for ${his(p)} exit interview. What should ${he(p)} work on this summer? Your staff suggests ${FOCUS[sug].label.toLowerCase()}.`,
        from: pS(p),
        opts: Object.keys(FOCUS).map(k => ({ k, label: FOCUS[k].label, hint: k === sug ? 'Staff pick' : '' })).concat([{ k: 'auto', label: 'Whatever the staff suggests', hint: '' }]),
        data: { pid: p.id, sug },
      };
    },
    resolve(S, it, k, X) {
      const p = S.players[it.data.pid];
      if (!p) return '';
      const key = k === 'auto' ? it.data.sug : k;
      const f = FOCUS[key] || FOCUS.shooting;
      const amt = 0.5 * (0.7 + pers(p, 'work') / 100);
      const up = fx.train(p, f.keys, amt);
      if (key === 'body') fx.mor(S, p, p.age >= 30 ? 3 : -1);
      p.summer = { season: S.season, focus: key };
      return `${nm(p)}'s summer: ${f.label.toLowerCase()}.${up ? ' The early work already shows.' : ''}`;
    },
  });

  def({
    id: 'one_more_year', fam: 'locker', kind: 'decision', when: 'phase:season_end', w: 1, pri: 1, due: 14, block: false, def: 'respect',
    find(S, X) {
      return roster(S, X).filter(p => p.age >= 34 && p.ovr >= 64 && (!p.contract || p.contract.exp <= S.season)).map(p => ({ key: 'omy:' + p.id + ':' + S.season, pid: p.id }));
    },
    build(S, c, X) {
      const p = S.players[c.pid];
      return {
        title: `${nm(p)} is thinking about retiring`,
        text: `${nm(p)} is ${p.age} and ${his(p)} contract is up. ${He(p)} asked what you think: one more year, or go out on ${his(p)} own terms?`,
        from: pS(p),
        opts: [{ k: 'stay', label: 'Ask ' + him(p) + ' for one more year', hint: 'He may well stay' }, { k: 'respect', label: 'Respect whatever ' + he(p) + ' decides', hint: '' }],
        data: { pid: p.id },
      };
    },
    resolve(S, it, k, X) {
      const p = S.players[it.data.pid];
      if (!p) return '';
      if (k === 'stay') { p.deskOneMore = S.season; fx.mor(S, p, 5); return `${nm(p)} smiled. "Let me talk to my family." It sounded like a yes.`; }
      return `${nm(p)} thanked you for everything.`;
    },
  });

  // ---------------------------------------------------------------------------
  // The owner
  // ---------------------------------------------------------------------------
  const DEMANDS = {
    tax: (S, X) => ({ label: 'Keep the payroll under the luxury tax', check: () => (PBC.Offseason ? PBC.Offseason.payroll(S, X.u) : 0) <= PBC.League.cfg(S).tax }),
    wins: (S, X, d) => ({ label: `Win at least ${d.target} games`, check: () => standing(S, X.u).w >= d.target }),
    fans: (S, X, d) => ({ label: `Fill the building: fan excitement at ${d.target}+ by the end of the season`, check: () => (S.teams[X.u].hype || 0) >= d.target }),
    youth: (S, X, d) => { const p = S.players[d.pid]; return { label: `Give ${p ? nm(p) : 'the rookie'} real minutes (20+ a night)`, check: () => { const l = p && Desk.line(S, p); return !!(l && l.gp >= 20 && l.mpg >= 19); } }; },
    // (the owners' personalities, js/core/office.js, bring their own)
    playoffs: (S, X) => ({ label: 'Make the playoffs', check: () => { const r = PBC.League.playoffResult(S, X.u); return !!(r && (r.round >= 1 || r.champ)); } }),
    series: (S, X) => ({ label: 'Win a playoff series', check: () => { const r = PBC.League.playoffResult(S, X.u); return !!(r && (r.round >= 2 || r.champ)); } }),
    star: (S, X) => ({ label: 'Put one of our players in the All-Star Game', check: () => (S.allStars || []).some(id => S.players[id] && S.players[id].tid === X.u) }),
    picks: (S, X, d) => ({ label: 'Keep every first-round pick we own', check: () => firsts(S, X.u) >= (d.n0 || 0) }),
    favorite: (S, X, d) => { const p = S.players[d.pid]; return { label: `Play ${p ? nm(p) : 'my guy'} 24 minutes a night`, check: () => { const l = p && p.tid === X.u && Desk.line(S, p); return !!(l && l.gp >= 20 && l.mpg >= 23); } }; },
  };
  const firsts = (S, tid) => (PBC.Trade && PBC.Trade.teamPicks ? PBC.Trade.teamPicks(S, tid).filter(pk => pk.round === 1).length : 0);
  // what each kind of owner asks for first
  const TYPE_W = {
    winner: { wins: 2.5, playoffs: 2, series: 2.5 }, money: { tax: 3, fans: 1.5 }, showman: { fans: 2.5, star: 2.5 },
    builder: { youth: 3, picks: 2 }, meddler: { favorite: 3.5, wins: 1 },
  };
  function ownerDemand(S, X) {
    const o = PBC.Office ? PBC.Office.owner(S, X.u) : Desk.owner(S, X.u);
    const t = team(S, X);
    const L = PBC.League.cfg(S);
    const opts = [];
    const pay = PBC.Offseason ? PBC.Offseason.payroll(S, X.u) : 0;
    if ((o.spend < 45 || o.type === 'money') && pay > L.tax * 0.92) opts.push({ type: 'tax', w: 2 });
    const exp = S.coach && S.coach.expectation;
    if ((o.patience < 55 || o.type === 'winner' || o.type === 'meddler') && exp) opts.push({ type: 'wins', target: Math.min(S.seasonGames - 8, exp.wins + 3), w: 1.5 });
    if ((t.market || 3) >= 3 || o.type === 'money' || o.type === 'showman') opts.push({ type: 'fans', target: Math.min(90, Math.max(55, (t.hype || 50) + 8)), w: 1 });
    const kid = U.maxBy(roster(S, X).filter(p => p.age <= 22 && p.pot >= 70), p => p.pot);
    if (kid) opts.push({ type: 'youth', pid: kid.id, w: 1.2 });
    if (exp && exp.round >= 1 && exp.round < 2) opts.push({ type: 'playoffs', w: 0.8 });
    if (exp && exp.round >= 2) opts.push({ type: 'series', w: 0.8 });
    const best = roster(S, X)[0];
    if (best && best.ovr >= 78) opts.push({ type: 'star', w: 0.6 });
    const n0 = firsts(S, X.u);
    if (n0 >= 1) opts.push({ type: 'picks', n0, w: 0.5 });
    const fav = U.maxBy(roster(S, X).filter(p => { const l = Desk.line(S, p); const ten = p.stats.filter(x => x.tid === X.u && !x.po).length; return p.ovr >= 64 && p.ovr <= 79 && ten >= 1 && (!l || l.mpg < 24); }), p => p.ovr + p.stats.filter(x => x.tid === X.u).length * 2);
    if (fav) opts.push({ type: 'favorite', pid: fav.id, w: 0.4 });
    if (!opts.length) return null;
    const tw = TYPE_W[o.type] || {};
    return X.R.pickW(opts, d => d.w * (tw[d.type] || 1));
  }
  def({
    id: 'owner_goals', fam: 'owner', kind: 'decision', when: 'phase:preseason', w: 1, pri: 3, due: 10, def: 'accept',
    find(S, X) { return S.coach ? [{ key: 'goals:' + S.season }] : []; },
    build(S, c, X) {
      const C = S.coach;
      if (!C.expectation || C.expectation.season !== S.season) PBC.Coach.setExpectations(S);
      const o = Desk.owner(S, X.u);
      const d = ownerDemand(S, X);
      const dm = d ? DEMANDS[d.type](S, X, d) : null;
      const ty = PBC.Office ? PBC.Office.owner(S, X.u).type : null;
      const TONE = { winner: '"Winning is the only thing I care about. You know that."', money: '"And spend my money like it\'s yours."',
        showman: '"Give this city a show."', builder: '"Build it the right way. I\'m in this for the long run."', meddler: '"And I\'ll be watching. Closely."' };
      const tone = (ty && TONE[ty] ? TONE[ty] + ' ' : '') + (o.patience < 45 ? 'Patience is not part of the plan.' : o.patience > 70 ? 'There is time to do this right.' : 'Progress is expected.');
      return {
        title: `${o.name} sets the bar`,
        text: `${o.name} called you up to the owner's suite before training camp. "${C.expectation ? C.expectation.label : 'Compete'}. That's the goal." ${tone}${dm ? ` Then one more thing: "${dm.label}."` : ''}`,
        from: ownerFrom(S, X),
        opts: [
          { k: 'accept', label: 'Accept the goals', hint: 'You\'ll be judged on all of them' },
          { k: 'push', label: dm ? 'Push back on the extra demand' : 'Ask for patience', hint: 'Costs a little trust' },
          { k: 'more', label: 'Promise even more', hint: 'Big trust now, a big fall if you miss' },
        ],
        data: { demand: d },
      };
    },
    resolve(S, it, k, X) {
      const D = Desk.ensure(S);
      const d = it.data.demand;
      if (k === 'accept') { fx.own(S, 3); if (d) D.demand = Object.assign({ season: S.season, raised: false }, d); return 'The owner shook your hand. "Don\'t let me down."'; }
      if (k === 'push') { fx.own(S, -3); D.demand = null; return 'The owner let it go, with a look that said it would be remembered.'; }
      fx.own(S, 6);
      if (d) {
        const dd = Object.assign({ season: S.season, raised: true }, d);
        if (dd.type === 'wins') dd.target += 4; else if (dd.type === 'fans') dd.target = Math.min(95, dd.target + 6);
        D.demand = dd;
      }
      return 'The owner loved the confidence. Now you have to deliver.';
    },
  });
  /** this season's demand, as it stands (the Front Office screen): { label, ok, raised, done } or null */
  Desk.demandNow = function (S) {
    const D = S.desk;
    if (!D || !D.demand || D.demand.season !== S.season || Desk.userTid(S) < 0) return null;
    const dm = DEMANDS[D.demand.type] ? DEMANDS[D.demand.type](S, Desk.X(S, Desk.rng(S, 'dm')), D.demand) : null;
    return dm ? { label: dm.label, ok: !!dm.check(), raised: !!D.demand.raised, done: D.demand.done } : null;
  };
  /** the season's review of the owner's extra demand (Season.endSeason, before the coach's review) */
  Desk.review = function (S) {
    const D = S.desk;
    const u = Desk.userTid(S);
    if (!D || !D.demand || D.demand.season !== S.season || u < 0) return;
    const X = Desk.X(S, Desk.rng(S, 'review'));
    const dm = DEMANDS[D.demand.type] ? DEMANDS[D.demand.type](S, X, D.demand) : null;
    if (!dm) return;
    const met = dm.check();
    fx.own(S, met ? 6 : D.demand.raised ? -12 : -8);
    Desk.add(S, { id: 'owner_review', kind: 'message' }, null, {
      kind: 'message', pri: 2, title: met ? 'The owner\'s demand: met' : 'The owner\'s demand: missed',
      text: met ? `"${dm.label}." You did it, and the owner noticed.` : `"${dm.label}." It didn't happen, and the owner brought it up first thing in your review.`,
      from: ownerFrom(S, X), data: {},
    });
    D.demand.done = met;
    if (met) { D.demandsMet = (D.demandsMet || 0) + 1; if (D.demandsMet >= 3 && PBC.Coach) PBC.Coach.unlock(S, 'owner_demand_3'); }
  };

  def({
    id: 'owner_checkin', fam: 'owner', kind: 'decision', when: 'week', phases: ['regular'], w: 1, gcd: 35, pri: 2, due: 3, def: 'patience',
    find(S, X) {
      const st = standing(S, X.u);
      if (st.gp < 15 || !S.coach) return [];
      const m = S.coach.mood;
      if (m === 'Patient' || m === 'Optimistic') return [];
      return [{ key: 'chk:' + S.season + ':' + Math.floor(S.day / 35), mood: m }];
    },
    build(S, c, X) {
      const o = Desk.owner(S, X.u), st = standing(S, X.u);
      const good = c.mood === 'Thrilled' || c.mood === 'Pleased';
      if (good) {
        return {
          title: `${o.name} is enjoying this`,
          text: `You're ${st.w}-${st.l} and the owner is in a good mood. "Whatever you're doing, keep doing it. Anything you need?"`,
          from: ownerFrom(S, X),
          opts: [
            { k: 'extend', label: 'Ask about a contract extension', hint: 'Strike while it\'s hot' },
            { k: 'humble', label: '"Just keep believing in this group."', hint: '' },
            { k: 'budget', label: 'Ask for a bigger player development budget', hint: '' },
          ],
          data: { good: true },
        };
      }
      return {
        title: `${o.name} wants answers`,
        text: `You're ${st.w}-${st.l}. The owner called you in. "I didn't pay for this. Tell me why I should be patient."`,
        from: ownerFrom(S, X),
        opts: [
          { k: 'patience', label: 'Ask for patience', hint: 'Depends on the owner\'s patience' },
          { k: 'promise', label: 'Promise a turnaround in the next month', hint: 'Trust now; the owner will check' },
          { k: 'injuries', label: 'Point to the injuries', hint: 'Only works if it\'s true' },
          { k: 'shake', label: 'Offer to shake up the roster', hint: 'Owners like action' },
        ],
        data: { good: false },
      };
    },
    resolve(S, it, k, X) {
      const o = Desk.owner(S, X.u), C = S.coach;
      if (it.data.good) {
        if (k === 'extend') {
          if (X.R() < 0.45 && C.contract) { C.contract.years += 1; fx.own(S, 2); return `"Done." Your contract runs one more year now (${C.contract.years} left).`; }
          fx.own(S, -2); return '"Let\'s not get ahead of ourselves." The owner changed the subject.';
        }
        if (k === 'budget') { fx.own(S, -1); for (const p of PBC.League.roster(S, X.u).filter(p => p.age <= 24)) fx.train(p, ['shotIQ', 'three', 'perD'], 0.25); return 'The owner approved a modest bump. Your young players get extra coaching sessions.'; }
        fx.own(S, 2); return 'The owner liked that.';
      }
      if (k === 'patience') { fx.own(S, o.patience >= 60 ? 1 : -3); return o.patience >= 60 ? 'The owner gave you the benefit of the doubt.' : '"Patience is for teams that win." Not great.'; }
      if (k === 'promise') {
        fx.own(S, 3);
        const st = standing(S, X.u);
        Desk.follow(S, 28, 'owner_promise', { w0: st.w, gp0: st.gp });
        return 'The owner wrote the date down in front of you.';
      }
      if (k === 'injuries') {
        const hurt = PBC.League.roster(S, X.u).slice(0, 8).filter(p => !healthy(p)).length;
        fx.own(S, hurt >= 2 ? 1 : -4);
        return hurt >= 2 ? 'The owner looked at the injury report and nodded.' : '"Everyone has injuries." The owner didn\'t buy it.';
      }
      fx.own(S, 2); Desk.ensure(S).splash = { season: S.season, trades0: userTrades(S, X) };
      return 'The owner wants to see a move. The trade room is open.';
    },
  });
  def({
    id: 'owner_promise', fam: 'owner', kind: 'message', when: 'never', find: () => [], build: () => null,
    follow(S, d, X) {
      const st = standing(S, X.u);
      const gp = st.gp - d.gp0;
      if (gp < 5) return;
      const pct = (st.w - d.w0) / gp;
      const ok = pct >= 0.55;
      fx.own(S, ok ? 3 : -6);
      Desk.add(S, Desk.tpl('owner_promise'), null, { kind: 'message', pri: 2, title: ok ? 'The turnaround you promised' : 'The turnaround that wasn\'t', text: ok ? `${st.w - d.w0}-${gp - (st.w - d.w0)} since your talk. The owner sent a one-line text: "Good."` : `${st.w - d.w0}-${gp - (st.w - d.w0)} since you promised a turnaround. The owner hasn't forgotten.`, from: ownerFrom(S, X), data: {} });
    },
  });
  const userTrades = (S, X) => (S.trades || []).filter(r => r.season === S.season && r.tids.includes(X.u)).length;

  // the facilities budget (js/core/office.js): every preseason with points to spend and nothing being built
  const FAV_FAC = { winner: 'train', money: 'arena', showman: 'arena', builder: 'scout' };
  const facCan = (S, X) => { const O = PBC.Office, f = O.fac(S, X.u); return f && !f.build ? O.FAC_KEYS.filter(k => f[k] < O.FAC_MAX && f.pts >= O.facCost(f[k])) : []; };
  def({
    id: 'facilities', fam: 'owner', kind: 'decision', when: 'phase:preseason', w: 1, pri: 2, due: 10, def: 'bank',
    find(S, X) { return PBC.Office && facCan(S, X).length ? [{ key: 'fac:' + S.season }] : []; },
    build(S, c, X) {
      const O = PBC.Office, f = O.fac(S, X.u), o = Desk.owner(S, X.u);
      const pref = FAV_FAC[O.owner(S, X.u).type];
      const opts = U.sortBy(facCan(S, X), k => (k === pref ? 0 : 1) + f[k] * 0.1).slice(0, 3).map(k => {
        const d = O.FAC[k];
        return { k, label: `Build the ${d.label.toLowerCase()} up to level ${f[k] + 1}`, hint: `${O.facCost(f[k])} points. ${d.what}${k === pref ? ' The owner likes this one.' : ''}` };
      });
      opts.push({ k: 'bank', label: 'Save the points for something bigger', hint: `${f.pts} points in the bank` });
      return {
        title: 'The facilities budget',
        text: `${o.name} has ${f.pts} facility points for the building this year. "Where do you want them?" Whatever you pick is built over the season and opens at next year's training camp.`,
        from: ownerFrom(S, X), opts, data: {},
      };
    },
    resolve(S, it, k, X) {
      if (k === 'bank') return 'The points stay in the bank. "Your call," the owner said.';
      const r = PBC.Office.upgrade(S, X.u, k);
      if (r.ok && k === FAV_FAC[PBC.Office.owner(S, X.u).type]) fx.own(S, 2);
      return r.msg;
    },
  });

  def({
    id: 'owner_splash', fam: 'owner', kind: 'decision', when: 'week', phases: ['regular'], w: 1, gcd: 400, pri: 2, due: 4, def: 'trust',
    find(S, X) {
      const left = (S.tradeDeadlineDay || 0) - S.day;
      if (left < 7 || left > 24 || (S.flags && S.flags.tradeDeadlinePassed)) return [];
      const o = Desk.owner(S, X.u);
      if (o.patience >= 60 && o.spend < 60) return [];
      return [{ key: 'splash:' + S.season }];
    },
    build(S, c, X) {
      const o = Desk.owner(S, X.u), left = (S.tradeDeadlineDay || 0) - S.day;
      return {
        title: `${o.name} wants a splash`,
        text: `The deadline is ${left} days away. "Every team around us is making moves. What's ours?" The owner wants a trade.`,
        from: ownerFrom(S, X),
        opts: [{ k: 'deal', label: 'Promise to find a deal', hint: 'You\'ll need to actually make one' }, { k: 'trust', label: '"This group can win."', hint: 'Bold. The room hears it' }],
        data: {},
      };
    },
    resolve(S, it, k, X) {
      if (k === 'deal') { fx.own(S, 2); Desk.ensure(S).splash = { season: S.season, trades0: userTrades(S, X), promised: true }; return { text: 'The owner expects a trade by the deadline.', nav: { screen: 'trade' } }; }
      fx.own(S, -2); fx.chem(S, X.u, 3);
      return 'Your players heard you backed them. The owner heard it too.';
    },
  });
  def({
    id: 'deadline_owner', fam: 'owner', kind: 'message', when: 'phase:deadline', w: 1, pri: 2,
    find(S, X) { const sp = Desk.ensure(S).splash; return sp && sp.season === S.season ? [{ key: 'dl:' + S.season }] : []; },
    build(S, c, X) {
      const sp = Desk.ensure(S).splash;
      const made = userTrades(S, X) > sp.trades0;
      fx.own(S, made ? 4 : sp.promised ? -6 : -2);
      return { kind: 'message', title: made ? 'The owner liked your deadline' : 'The owner wanted more at the deadline', text: made ? 'The deal you made got the city talking. The owner called to say so.' : 'The deadline came and went without a move. The owner noticed.', from: ownerFrom(S, X), data: {} };
    },
    resolve: () => '',
  });

  def({
    id: 'owner_favorite', fam: 'owner', kind: 'decision', when: 'daily', phases: ['regular'], w: 0.6, gcd: 60, cd: 120, pri: 1, due: 3, def: 'explain',
    find(S, X) {
      const out = [];
      for (const p of roster(S, X)) {
        const tenure = p.stats.filter(s => s.tid === X.u && !s.po).length;
        const l = Desk.line(S, p);
        if (tenure < 3 || !l || l.gp < 10 || l.mpg >= 24 || p.ovr < 66 || !healthy(p)) continue;
        out.push({ key: p.id, pid: p.id, w: tenure });
      }
      return out;
    },
    build(S, c, X) {
      const p = S.players[c.pid], o = Desk.owner(S, X.u);
      return {
        title: `The owner asks about ${nm(p)}`,
        text: `${nm(p)} has been here for years and the fans love ${him(p)}. So does ${o.name}. "Why isn't ${p.last} playing more?"`,
        from: ownerFrom(S, X),
        opts: [{ k: 'play', label: 'Get ' + him(p) + ' more minutes', hint: 'The owner and the fans approve' }, { k: 'explain', label: 'Explain your rotation', hint: 'Owners don\'t like hearing no' }],
        data: { pid: p.id },
      };
    },
    resolve(S, it, k, X) {
      const p = S.players[it.data.pid];
      if (!p || p.tid !== X.u) return '';
      if (k === 'play') { fx.own(S, 2); fx.fans(S, X.u, 2); fx.mor(S, p, 5); bumpMinutes(S, X, p, 5); return `${nm(p)} gets more run. The owner sent a thumbs-up.`; }
      fx.own(S, -3);
      return 'You walked the owner through the rotation. Polite nods. No agreement.';
    },
  });

  // ---------------------------------------------------------------------------
  // The press
  // ---------------------------------------------------------------------------
  function gameView(S, X, ex) {
    if (!ex || !ex.sg || !ex.box) return null;
    const u = X.u, sg = ex.sg, box = ex.box;
    const home = sg.h === u, my = home ? box.hs : box.as, th = home ? box.as : box.hs;
    return { my, th, won: my > th, margin: my - th, opp: home ? sg.a : sg.h, playoff: !!sg.playoff, ot: box.ot };
  }
  def({
    id: 'press_post', fam: 'press', kind: 'decision', when: 'game', phases: ['regular', 'playin', 'playoffs'], w: 2.2, cd: 0, gcd: 3, pri: 1, due: 1, block: false, def: 'short',
    find(S, X, ex) {
      const g = gameView(S, X, ex);
      if (!g) return [];
      const streak = S.coach ? S.coach.streak : 0;
      const oppRank = PBC.League.powerRankings ? (PBC.League.powerRankings(S).findIndex(r => r.tid === g.opp) + 1) : 15;
      let why = null, w = 0;
      if (!g.won && g.margin <= -18) { why = 'blowout'; w = 3; }
      else if (!g.won && streak <= -4) { why = 'skid'; w = 3; }
      else if (g.won && g.margin >= 20) { why = 'rout'; w = 2; }
      else if (g.won && oppRank && oppRank <= 4) { why = 'statement'; w = 2.5; }
      else if (g.won && streak >= 6) { why = 'streak'; w = 2; }
      else if (g.playoff) { why = g.won ? 'po_win' : 'po_loss'; w = 3; }
      else if (g.ot) { why = 'ot'; w = 1.5; }
      return why ? [{ key: 'pp', why, w }] : [];
    },
    build(S, c, X, ex) {
      const g = gameView(S, X, ex), R = X.R, r = reporter(S, R);
      const opp = nickOf(S, g.opp), streak = S.coach ? S.coach.streak : 0;
      // the series score (playoffs)
      const sr = S.playoffs && g.playoff ? S.playoffs.series.filter(x => x.hi === X.u || x.lo === X.u).slice(-1)[0] : null;
      const ser = sr ? (sr.hi === X.u ? `${sr.w[0]}-${sr.w[1]}` : `${sr.w[1]}-${sr.w[0]}`) : '';
      const Q = {
        blowout: [`Coach, you lost by ${-g.margin} to the ${opp}. What happened out there?`, `That was a ${-g.margin}-point loss. Is this team quitting on you?`],
        skid: [`That's ${-streak} straight losses. How do you stop the bleeding?`, `${-streak} in a row now. Is your job safe?`],
        rout: [`A ${g.margin}-point win. Is this who this team really is?`, `You blew the ${opp} out. Statement game?`],
        statement: [`You just beat one of the best teams in the league. Are you a contender?`, `Big win over the ${opp}. Does this change your ceiling?`],
        streak: [`That's ${streak} in a row. What's clicking?`, `${streak} straight wins. Can anyone stop you right now?`],
        po_win: [`${ser ? `You lead the series ${ser}` : 'A big playoff win'}. What was the difference tonight?`, `Huge playoff win${ser ? `, ${ser} in the series` : ''}. How do you keep this group focused?`],
        po_loss: [`${ser ? `The series is ${ser}` : 'A tough playoff loss'}. What changes for the next game?`, `Your season is on the line${ser ? ` at ${ser}` : ''}. Are you worried?`],
        ot: ['An overtime thriller. How do you feel?', 'Five more minutes and a lot of drama. What did you see?'],
      };
      const bad = ['blowout', 'skid', 'po_loss'].includes(c.why);
      const opts = bad ? [
        { k: 'mine', label: '"That\'s on me. I didn\'t have them ready."', hint: 'The room rallies; the owner winces' },
        { k: 'callout', label: '"The effort wasn\'t there. Period."', hint: 'A wake-up call. Some won\'t like it' },
        { k: 'refs', label: 'Blame the officials', hint: 'The fans love it. The league fines you' },
        { k: 'credit', label: 'Credit the opponent', hint: 'Classy' },
        { k: 'short', label: 'Keep it short', hint: '' },
      ] : [
        { k: 'boast', label: '"We\'re the team to beat."', hint: 'Swagger. Back it up' },
        { k: 'humble', label: '"One game at a time."', hint: '' },
        { k: 'star', label: 'Praise your best player', hint: 'He loves it' },
        { k: 'role', label: 'Credit the role players', hint: 'The bench feels seen' },
        { k: 'short', label: 'Keep it short', hint: '' },
      ];
      return {
        title: bad ? 'A tough night at the podium' : 'Postgame presser',
        text: `${r.name} (${r.outlet}): "${pick(R, Q[c.why])}"`,
        from: pressFrom(r), opts, data: { why: c.why, bad, gid: ex.sg.gid },
        pri: g.playoff ? 2 : 1, block: g.playoff,
      };
    },
    resolve(S, it, k, X) {
      const u = X.u;
      const rot = rotation(S, X, 8);
      // the papers pick it up (the loud ones always, the rest sometimes)
      if (PBC.Media && PBC.Media.quote && (k === 'boast' || k === 'refs' || k === 'callout' || ((k === 'mine' || k === 'credit' || k === 'star' || k === 'role') && X.R() < 0.4))) {
        const box = it.data.gid != null && S.boxes ? S.boxes[it.data.gid] : null;
        PBC.Media.quote(S, k, { opp: box ? (box.h === u ? box.a : box.h) : null, pid: k === 'star' && rot[0] ? rot[0].id : null });
      }
      switch (k) {
        case 'mine': fx.chem(S, u, 2); fx.own(S, -1); fx.media(S, 2); for (const p of rot) fx.mor(S, p, 1); return 'The room appreciated you taking the hit.';
        case 'callout': fx.chem(S, u, -2); fx.own(S, 1); fx.media(S, 1); for (const p of rot) { if (pers(p, 'work') >= 60) fx.conf(p, 0.03); else fx.mor(S, p, -2); } return 'It was the headline. Your workers took it to heart; others took it personally.';
        case 'refs': fx.media(S, -2); fx.own(S, -2); fx.fans(S, u, 2); fx.news(S, '💸 The league fined you for your comments about the officiating.', 'desk', u); return 'The clip went everywhere. So did the fine.';
        case 'credit': fx.media(S, 2); return '"They were better tonight. We\'ll be better next time." The press liked it.';
        case 'boast': fx.fans(S, u, 2); fx.media(S, 1); for (const p of rot) fx.conf(p, 0.03); Desk.follow(S, 10, 'boast_check', { w0: standing(S, u).w, gp0: standing(S, u).gp }); return 'Bold words on every sports show tonight. Now back them up.';
        case 'humble': fx.media(S, 1); return 'Nothing to see here. Exactly how you wanted it.';
        case 'star': { const p = rot[0]; if (p) { fx.mor(S, p, 4); fx.conf(p, 0.03); } if (PBC.League.roster(S, u).some(q => q !== p && pers(q, 'ego') >= 72)) fx.chem(S, u, -1); return `${p ? nm(p) : 'Your star'} loved the shout-out.`; }
        case 'role': fx.chem(S, u, 2); for (const p of rot.slice(5)) fx.mor(S, p, 3); return 'The bench players reposted it with fire emojis.';
        default: fx.media(S, -1); return 'Two sentences and out the door. The press wanted more.';
      }
    },
  });
  def({
    id: 'boast_check', fam: 'press', kind: 'message', when: 'never', find: () => [], build: () => null,
    follow(S, d, X) {
      const st = standing(S, X.u);
      const gp = st.gp - d.gp0;
      if (gp < 3) return;
      const pct = (st.w - d.w0) / gp;
      if (pct < 0.45) { fx.media(S, -3); fx.fans(S, X.u, -2); Desk.add(S, Desk.tpl('boast_check'), null, { kind: 'message', title: '"The team to beat?"', text: `${st.w - d.w0}-${gp - (st.w - d.w0)} since you called your team the one to beat. The columnists have saved the clip.`, from: { type: 'media', name: 'The press', role: 'Columns' }, data: {} }); }
      else if (pct >= 0.65) { fx.media(S, 2); fx.fans(S, X.u, 2); }
    },
  });

  def({
    id: 'press_pre', fam: 'press', kind: 'decision', when: 'daily', phases: ['regular'], w: 1, gcd: 20, cd: 30, pri: 1, due: 1, block: false, def: 'respect',
    find(S, X) {
      const g = nextGame(S, X);
      if (!g || g.day !== S.day) return [];
      const opp = oppOf(g, X.u);
      const pr = PBC.League.powerRankings ? PBC.League.powerRankings(S) : [];
      const rank = pr.findIndex(r => r.tid === opp) + 1;
      if (!rank || rank > 4) return [];
      return [{ key: opp, opp, rank, gid: g.gid }];
    },
    build(S, c, X) {
      const r = reporter(S, X.R), opp = nickOf(S, c.opp);
      return {
        title: `Tonight: the ${opp}`,
        text: `${r.name} (${r.outlet}): "The ${opp} are number ${c.rank} in the power rankings. What's the plan tonight?"`,
        from: pressFrom(r),
        opts: [
          { k: 'guarantee', label: 'Guarantee a win', hint: 'Your players will feel it. So will you if you lose' },
          { k: 'respect', label: 'Show them respect', hint: '' },
          { k: 'crowd', label: 'Call on the crowd to be loud', hint: 'The fans love it' },
        ],
        data: { opp: c.opp, gid: c.gid },
      };
    },
    resolve(S, it, k, X) {
      if (k === 'guarantee') {
        if (PBC.Media && PBC.Media.quote) PBC.Media.quote(S, 'guarantee', { opp: it.data.opp });
        for (const p of rotation(S, X, 9)) fx.conf(p, 0.05);
        fx.fans(S, X.u, 1);
        Desk.follow(S, 1, 'guarantee_check', { gid: it.data.gid });
        return 'The quote is on every highlight show. Your players are fired up.';
      }
      if (k === 'crowd') { fx.fans(S, X.u, 3); return 'Expect a loud building tonight.'; }
      fx.media(S, 1);
      return '"They\'re good. We\'re good. Should be fun."';
    },
  });
  def({
    id: 'guarantee_check', fam: 'press', kind: 'message', when: 'never', find: () => [], build: () => null,
    follow(S, d, X) {
      const g = S.schedule.find(x => x.gid === d.gid);
      if (!g || !g.played) { if (g) Desk.follow(S, 1, 'guarantee_check', d); return; }
      const home = g.h === X.u, won = home ? g.hs > g.as : g.as > g.hs;
      fx.media(S, won ? 3 : -4); fx.fans(S, X.u, won ? 3 : -2); if (!won) fx.own(S, -1);
      Desk.add(S, Desk.tpl('guarantee_check'), null, { kind: 'message', title: won ? 'Guarantee delivered' : 'The guarantee that wasn\'t', text: won ? 'You called it and your team delivered. The city is buzzing.' : 'You guaranteed a win and lost. Every columnist in town has an opinion about it.', from: { type: 'media', name: 'The press', role: 'Headlines' }, data: {} });
    },
  });

  const QUOTES = [
    'said on a podcast that the team "needs more talent around me"',
    'told reporters {he} should be getting more touches',
    'took a shot at the officials after the game and called the league "a joke"',
    'said {he} "didn\'t come here to lose" when asked about the season',
    'posted a cryptic message after the loss that everyone read as a dig at the coaching staff',
  ];
  def({
    id: 'quote_storm', fam: 'press', kind: 'decision', when: 'daily', phases: ['regular', 'playoffs'], w: 0.8, cd: 70, gcd: 40, pri: 2, due: 2, def: 'distance',
    find(S, X) {
      return roster(S, X).filter(p => EGO[type(p)] && mor(p) < 70).map(p => ({ key: p.id, pid: p.id, w: pers(p, 'ego') / 60 }));
    },
    build(S, c, X) {
      const p = S.players[c.pid];
      const q = fill(pick(X.R, QUOTES), p);
      return {
        title: `${nm(p)} said what?`,
        text: `${nm(p)} ${q}. It's the top story on every sports site and your phone hasn't stopped.`,
        from: staffFrom(S, 'pr'),
        opts: [
          { k: 'back', label: 'Back ' + him(p) + ' publicly', hint: 'He loves you for it; the press doesn\'t' },
          { k: 'distance', label: 'Distance yourself from the comments', hint: '' },
          { k: 'fine', label: 'Fine ' + him(p), hint: 'Standards; he won\'t like it' },
        ],
        data: { pid: p.id },
      };
    },
    resolve(S, it, k, X) {
      const p = S.players[it.data.pid];
      if (!p) return '';
      if (k === 'back') { fx.mor(S, p, 6); fx.media(S, -2); fx.chem(S, X.u, -1); return `"${p.last} is a competitor. That's all that was." The press wasn't satisfied.`; }
      if (k === 'fine') { fx.mor(S, p, -7); fx.chem(S, X.u, 2); fx.own(S, 1); return `${nm(p)} was fined. The locker room got the message.`; }
      fx.mor(S, p, -3); fx.media(S, 2);
      return '"Those were his words, not ours." The story died down.'.replace('his', his(p));
    },
  });

  def({
    id: 'trash_talk', fam: 'press', kind: 'decision', when: 'daily', phases: ['regular'], w: 0.8, gcd: 30, cd: 60, pri: 1, due: 1, block: false, def: 'nocomment',
    find(S, X) {
      const g = nextGame(S, X);
      if (!g || g.day !== S.day) return [];
      const opp = oppOf(g, X.u);
      const star = PBC.League.roster(S, opp).filter(p => EGO[type(p)])[0];
      // (rivals talk more: js/core/rivals.js)
      const rv = PBC.Rivals ? PBC.Rivals.level(S, X.u, opp) : null;
      return star ? [{ key: opp, opp, pid: star.id, gid: g.gid, w: 1 + (rv ? rv.lvl * 1.5 : 0) }] : [];
    },
    build(S, c, X) {
      const p = S.players[c.pid], u = team(S, X);
      return {
        title: `${nm(p)} is talking trash`,
        text: `${nm(p)} of the ${nickOf(S, c.opp)} on tonight's game: "${pick(X.R, [`The ${u.name}? We'll see how soft they are.`, `I've been waiting for this one. They know what's coming.`, `Nobody on that team can guard me. Nobody.`])}"`,
        from: { type: 'team', tid: c.opp, name: nm(p), role: S.teams[c.opp].abbr },
        opts: [
          { k: 'fire', label: 'Fire back', hint: 'Your team gets an edge; the media eats it up' },
          { k: 'wall', label: 'Pin it on the locker room wall', hint: 'Quiet fuel' },
          { k: 'nocomment', label: 'No comment', hint: '' },
        ],
        data: { opp: c.opp },
      };
    },
    resolve(S, it, k, X) {
      if (k === 'fire') { for (const p of rotation(S, X, 9)) fx.conf(p, 0.04); fx.media(S, -1); fx.fans(S, X.u, 2); if (PBC.Rivals && it.data.opp != null) PBC.Rivals.trash(S, X.u, it.data.opp, 1); return '"Tell him to bring his best. He\'ll need it." Game on.'; }
      if (k === 'wall') { fx.chem(S, X.u, 2); for (const p of rotation(S, X, 9)) fx.conf(p, 0.02); if (PBC.Rivals && it.data.opp != null) PBC.Rivals.trash(S, X.u, it.data.opp, 0.4); return 'The quote is taped above every locker.'; }
      fx.media(S, 1); return 'You let your team do the talking.';
    },
  });

  def({
    id: 'feature', fam: 'press', kind: 'offer', when: 'daily', phases: ['regular'], w: 0.6, gcd: 40, cd: 120, pri: 1, due: 4, block: false, def: 'decline',
    find(S, X) {
      const p = rotation(S, X, 3)[0];
      return p && p.ovr >= 75 ? [{ key: p.id, pid: p.id }] : [];
    },
    build(S, c, X) {
      const p = S.players[c.pid], r = reporter(S, X.R);
      return {
        title: `${r.outlet} wants a feature on ${nm(p)}`,
        text: `${r.name} wants to spend a week with ${nm(p)} for a long feature: practice, film, dinner with ${his(p)} family.`,
        from: pressFrom(r),
        opts: [{ k: 'yes', label: 'Do it', hint: 'Great for the fans; some players hate the spotlight' }, { k: 'decline', label: 'Politely decline', hint: '' }],
        data: { pid: p.id },
      };
    },
    resolve(S, it, k, X) {
      const p = S.players[it.data.pid];
      if (!p) return '';
      if (k === 'yes') {
        fx.fans(S, X.u, 3); fx.media(S, 2);
        const ty = type(p);
        fx.mor(S, p, ty === 'showman' || ty === 'cocky' || ty === 'diva' ? 4 : ty === 'quiet' ? -3 : 1);
        return 'The piece ran and the city ate it up.';
      }
      fx.media(S, -1); return 'Maybe another time.';
    },
  });

  // ---------------------------------------------------------------------------
  // Your staff
  // ---------------------------------------------------------------------------
  def({
    id: 'trainer_warning', fam: 'staff', kind: 'decision', when: 'week', phases: ['regular'], w: 1, cd: 28, gcd: 14, pri: 2, due: 3, def: 'cut',
    find(S, X) {
      return rotation(S, X, 6).map(p => {
        const l = Desk.line(S, p);
        if (!l || l.gp < 12 || l.mpg < 34.5 || (p.age < 29 && p.r.stamina >= 70)) return null;
        return { key: p.id, pid: p.id, mpg: l.mpg };
      }).filter(Boolean);
    },
    build(S, c, X) {
      const p = S.players[c.pid];
      return {
        title: `${staff(S, 'trainer')} is worried about ${nm(p)}`,
        text: `"${p.last} is playing ${f1(c.mpg)} minutes a night and ${his(p)} legs are going. The numbers on the bike are down three weeks straight. I'd cut ${his(p)} minutes before something tears."`,
        from: staffFrom(S, 'trainer'),
        opts: [{ k: 'cut', label: 'Cut ' + his(p) + ' minutes', hint: 'Safer. He wants to play' }, { k: 'ride', label: 'Keep riding ' + him(p), hint: 'You need the wins. It\'s a risk' }],
        data: { pid: p.id },
      };
    },
    resolve(S, it, k, X) {
      const p = S.players[it.data.pid];
      if (!p || p.tid !== X.u) return '';
      if (k === 'cut') { bumpMinutes(S, X, p, -4); fx.mor(S, p, pers(p, 'pt') >= 60 ? -3 : 0); return `${nm(p)}'s minutes come down a little. ${staff(S, 'trainer')} is relieved.`; }
      fx.mor(S, p, 2);
      if (X.R() < 0.3) Desk.follow(S, X.R.int(2, 8), 'trainer_told_you', { pid: p.id });
      return `${nm(p)} keeps ${his(p)} minutes.`;
    },
  });
  def({
    id: 'trainer_told_you', fam: 'staff', kind: 'message', when: 'never', find: () => [], build: () => null,
    follow(S, d, X) {
      const p = S.players[d.pid];
      if (!p || p.tid !== X.u || PBC.Player.isInjured(p)) return;
      const inj = PBC.Player.genInjury(X.R() < 0.7 ? 1 : 2);
      if (!inj) return;
      p.injury = inj;
      if (PBC.AI && S.teams[X.u].rot && S.teams[X.u].rot.auto !== false) PBC.AI.autoRotation(S, X.u);
      fx.news(S, `🚑 ${nm(p)} (${S.teams[X.u].abbr}): ${PBC.Player.injuryLabel(inj)}`, 'injury', X.u);
      Desk.add(S, Desk.tpl('trainer_told_you'), null, { kind: 'message', pri: 2, title: `${nm(p)} is hurt`, text: `${nm(p)}: ${PBC.Player.injuryLabel(inj)}. ${staff(S, 'trainer')} didn't say "I told you so." ${He(p)} didn't have to.`.replace(He(p) + ' didn', 'The trainer didn'), from: staffFrom(S, 'trainer'), data: { pid: p.id } });
    },
  });

  def({
    id: 'scout_tip', fam: 'staff', kind: 'offer', when: 'week', phases: ['regular'], w: 1, gcd: 28, cd: 400, pri: 1, due: 6, block: false, def: 'pass',
    find(S, X) {
      const pros = Object.values(S.players).filter(p => p.tid === -2);
      if (pros.length < 10) return [];
      const ranked = U.sortBy(pros, p => p.ovr, true);
      // a sleeper: true potential well above where he is ranked
      const out = [];
      ranked.forEach((p, i) => { if (i >= 12 && p.pot >= 78 && (PBC.Draft ? PBC.Draft.known(S, p) : 0) < 50) out.push({ key: p.id, pid: p.id, w: (p.pot - 74) / 4 }); });
      return out.slice(0, 6);
    },
    build(S, c, X) {
      const p = S.players[c.pid];
      return {
        title: `${staff(S, 'scout')} found a sleeper`,
        text: `"Keep an eye on ${nm(p)} (${p.pos}, ${p.origin}). The mock drafts have ${him(p)} in the second round. I think they're wrong." Your director of scouting wants to send someone to see ${him(p)} up close.`,
        from: staffFrom(S, 'scout'),
        opts: [{ k: 'go', label: 'Send a scout', hint: 'Free: a long look at him' }, { k: 'pass', label: 'Not now', hint: '' }],
        data: { pid: p.id },
      };
    },
    resolve(S, it, k, X) {
      const p = S.players[it.data.pid];
      if (!p || p.tid !== -2) return 'He is off the board now.';
      if (k === 'go') { const s = p.scout || (p.scout = { pts: 0, known: 0 }); s.known = Math.min(100, (s.known || 0) + 18); return `The report on ${nm(p)} is in. You now know ${s.known}% of what there is to know.`; }
      return '';
    },
  });

  def({
    id: 'dev_report', fam: 'staff', kind: 'message', when: 'week', phases: ['regular'], w: 1, gcd: 42, pri: 1,
    find(S, X) { return S.day >= 20 ? [{ key: 'dev:' + S.season + ':' + Math.floor(S.day / 28) }] : []; },
    build(S, c, X) {
      const r = roster(S, X);
      const rows = r.map(p => { const h = (p.hist || []).filter(x => x.season === S.season - 1).slice(-1)[0]; return { p, d: h ? p.ovr - h.ovr : 0 }; });
      const up = U.sortBy(rows.filter(x => x.d > 0), x => x.d, true).slice(0, 3);
      const young = U.sortBy(r.filter(p => p.age <= 23), p => p.pot - p.ovr, true).slice(0, 2);
      return {
        kind: 'message', title: 'Player development report',
        text: `${up.length ? 'Up the most since last season: ' + up.map(x => `${nm(x.p)} (+${x.d})`).join(', ') + '. ' : 'Nobody has made a big jump yet. '}${young.length ? 'The most room to grow: ' + young.map(p => `${nm(p)} (${p.age})`).join(' and ') + '. Practice focus on them pays the most.' : ''}`,
        from: staffFrom(S, 'assistant'), data: {},
      };
    },
    resolve: () => '',
  });

  // ---------------------------------------------------------------------------
  // The other front offices
  // ---------------------------------------------------------------------------
  /** one AI team's best offer for one of your players (the trade-block logic, for that team only): at most two of
   *  their players plus picks, and nothing more asked of you (a salary filler from your side voids the offer) */
  function offerFor(S, X, aiTid, pid) {
    const T = PBC.Trade;
    if (!T || !T.status(S).open) return null;
    let cur = T.empty(X.u, aiTid);
    cur.give[0].pids = [pid];
    let ev = T.evaluate(S, cur);
    if (ev.errors.filter(e => !/Salaries don't match/.test(e) && !/would have/.test(e)).length) return null;
    for (let step = 0; step < 3; step++) {
      const without = cur.give[0].pids;
      const theirs = PBC.League.roster(S, aiTid).filter(p => !cur.give[1].pids.includes(p.id) && !T.playerBlock(S, p));
      const picks = (T.teamPicks ? T.teamPicks(S, aiTid) : []).filter(pk => !cur.give[1].picks.includes(T.pickKey(pk)));
      const opts = theirs.map(p => ({ kind: 'p', id: p.id, v: T.playerValue(S, p, X.u, { receiving: true, without }) }))
        .concat(picks.map(pk => ({ kind: 'k', id: T.pickKey(pk), v: T.pickValue(S, pk, X.u) }))).filter(x => x.v > 1);
      let best = null;
      for (const x of U.sortBy(opts, x => x.v, true).slice(0, 10)) {
        if (x.kind === 'p' && cur.give[1].pids.length >= 2) continue;
        const trial = T.clone(cur);
        if (x.kind === 'p') trial.give[1].pids.push(x.id); else trial.give[1].picks.push(x.id);
        let tev = T.evaluate(S, trial), fixed = trial;
        if (!tev.ok && tev.sides.some(s => !s.salaryOk)) {
          const b = T.balance(S, trial, 1, { maxAdd: 0 });
          if (b && b.offer.give[0].pids.length === 1 && !b.offer.give[0].picks.length && b.offer.give[1].pids.length <= 3) { fixed = b.offer; tev = b.ev; }
        }
        if (tev.ok && tev.sides[1].net >= tev.sides[1].need) { best = { offer: fixed, ev: tev }; break; }
      }
      if (!best) break;
      cur = best.offer; ev = best.ev;
    }
    if (!ev.ok || !(cur.give[1].pids.length + cur.give[1].picks.length)) return null;
    return { offer: cur, gain: ev.sides[0].net };
  }
  Desk.offerFor = (S, aiTid, pid) => offerFor(S, Desk.X(S, Desk.rng(S, 'offer')), aiTid, pid);
  function describeSide(S, give) {
    const T = PBC.Trade;
    const parts = give.pids.map(id => { const p = S.players[id]; return p ? `${nm(p)} (${p.pos}, ${p.ovr})` : ''; }).filter(Boolean);
    for (const key of give.picks) { const pk = T.findPick(S, key); if (pk) parts.push(T.pickLabel(S, pk) + ' pick'); }
    return parts.join(', ');
  }
  def({
    id: 'trade_call', fam: 'league', kind: 'offer', when: 'week', phases: ['regular', 'draft', 'resign', 'freeagency'], w: 1, gcd: 14, cd: 30, pri: 2, due: 3, block: false, def: 'no',
    find(S, X) {
      if (!PBC.Trade || !PBC.Trade.status(S).open) return [];
      if (S.phase === 'regular' && X.R() > 0.45 * Math.min(1.5, Desk.freq(S))) return [];
      const r = roster(S, X).filter(p => !PBC.Trade.playerBlock(S, p) && p.ovr >= 66);
      const out = [];
      for (const p of r) {
        const shop = p.deskShop === S.season || !!p.tradeReq;
        const corner = PBC.Trade.isCornerstone(S, p);
        if (corner && !shop) continue;
        out.push({ key: p.id, pid: p.id, w: (shop ? 4 : 1) * Math.max(0.3, (p.ovr - 64) / 8) });
      }
      return out;
    },
    build(S, c, X) {
      const p = S.players[c.pid];
      const buyers = S.teams.map(t => t.id).filter(tid => tid !== X.u && (p.age >= 27 ? PBC.Trade.teamMode(S, tid) !== 'rebuild' : true));
      const tries = [];
      for (let i = 0; i < 4 && buyers.length; i++) tries.push(buyers.splice(Math.floor(X.R() * buyers.length), 1)[0]);
      let deal = null, tid = null;
      for (const t of tries) { const o = offerFor(S, X, t, p.id); if (o) { deal = o; tid = t; break; } }
      if (!deal) return null;
      const gm = `${S.teams[tid].city}'s GM`;
      return {
        title: `The ${nickOf(S, tid)} are calling about ${nm(p)}`,
        text: `${gm} on line one: "We like ${p.last}. Here's what we can do." They offer ${describeSide(S, deal.offer.give[1])} for ${describeSide(S, deal.offer.give[0])}.`,
        from: { type: 'team', tid, name: gm, role: S.teams[tid].abbr },
        opts: [
          { k: 'yes', label: 'Accept the deal', hint: '' },
          { k: 'counter', label: 'Counter in the trade room', hint: 'Opens the offer' },
          { k: 'no', label: 'Not interested', hint: '' },
        ],
        data: { offer: deal.offer, pid: p.id, tid },
      };
    },
    resolve(S, it, k, X) {
      const offer = it.data.offer;
      const p = S.players[it.data.pid];
      if (k === 'yes') {
        const r = PBC.Trade.execute(S, offer);
        if (!r.ok) return `The deal fell through: ${r.msg}`;
        return { text: `Done. ${r.rec.text}`, nav: { screen: 'roster' } };
      }
      if (k === 'counter') return { text: 'The offer is waiting in the trade room.', nav: { screen: 'trade', offer } };
      if (p && p.tid === X.u && X.R() < 0.25 && !CALM[type(p)]) { fx.mor(S, p, -2); return `You passed. ${nm(p)} heard ${his(p)} name was out there, and didn't love it.`; }
      return 'You passed.';
    },
  });

  def({
    id: 'trade_shop', fam: 'league', kind: 'offer', when: 'week', phases: ['regular'], w: 1, gcd: 35, cd: 60, pri: 1, due: 5, block: false, def: 'pass',
    find(S, X) {
      if (!PBC.Trade || !PBC.Trade.status(S).open) return [];
      const out = [];
      for (const id in S.players) {
        const p = S.players[id];
        if (p.tid < 0 || p.tid === X.u || p.ovr < 76 || PBC.Trade.playerBlock(S, p)) continue;
        const sell = p.tradeReq || (PBC.Trade.teamMode(S, p.tid) === 'rebuild' && p.age >= 27);
        if (sell) out.push({ key: p.id, pid: p.id, w: (p.ovr - 72) / 4 * (p.tradeReq ? 2 : 1) });
      }
      return out;
    },
    build(S, c, X) {
      const p = S.players[c.pid];
      const why = p.tradeReq ? `${he(p)} has asked out` : `they're rebuilding and ${he(p)}'s ${p.age}`;
      return {
        title: `The ${nickOf(S, p.tid)} are shopping ${nm(p)}`,
        text: `Word around the league: the ${nickOf(S, p.tid)} will listen to offers for ${nm(p)} (${p.pos}, ${p.ovr} OVR) because ${why}.`,
        from: { type: 'league', name: staff(S, 'gm'), role: STAFF_TITLE.gm },
        opts: [{ k: 'call', label: 'Call them', hint: 'Opens the trade room' }, { k: 'pass', label: 'Pass', hint: '' }],
        data: { pid: p.id, tid: p.tid },
      };
    },
    resolve(S, it, k, X) {
      if (k !== 'call') return '';
      const p = S.players[it.data.pid];
      if (!p || p.tid < 0) return 'He has already been moved.';
      const offer = PBC.Trade.empty(X.u, p.tid);
      offer.give[1].pids.push(p.id);
      return { text: 'The trade room is set up with him.', nav: { screen: 'trade', offer } };
    },
  });

  def({
    id: 'fa_alert', fam: 'league', kind: 'offer', when: 'week', phases: ['regular'], w: 1, gcd: 42, cd: 60, pri: 1, due: 5, block: false, def: 'pass',
    find(S, X) {
      const fas = PBC.League.freeAgents(S).filter(p => p.ovr >= 67 && healthy(p));
      return fas.slice(0, 3).map(p => ({ key: p.id, pid: p.id, w: (p.ovr - 64) / 3 }));
    },
    build(S, c, X) {
      const p = S.players[c.pid];
      return {
        title: `${nm(p)} is still unsigned`,
        text: `${nm(p)} (${p.pos}, ${p.ovr} OVR, ${p.age}) is sitting at home without a team. ${His(p)} agent says ${he(p)}'d sign for a reasonable one-year deal.`,
        from: { type: 'league', name: staff(S, 'gm'), role: STAFF_TITLE.gm },
        opts: [{ k: 'look', label: 'Take a look', hint: 'Opens the player' }, { k: 'pass', label: 'Pass', hint: '' }],
        data: { pid: p.id },
      };
    },
    resolve(S, it, k) { return k === 'look' ? { text: '', nav: { screen: 'player', pid: it.data.pid } } : ''; },
  });

  // ---------------------------------------------------------------------------
  // All-Star, awards, the community, the fans
  // ---------------------------------------------------------------------------
  def({
    id: 'allstar_snub', fam: 'league', kind: 'decision', when: 'phase:allstar', w: 1, pri: 1, due: 3, block: false, def: 'fuel',
    find(S, X) {
      const picked = new Set(S.allStars || []);
      const r = rotation(S, X, 4).filter(p => !picked.has(p.id) && p.ovr >= 79);
      return r.slice(0, 1).map(p => ({ key: 'snub:' + p.id + ':' + S.season, pid: p.id }));
    },
    build(S, c, X) {
      const p = S.players[c.pid];
      return {
        title: `${nm(p)} was snubbed`,
        text: `The All-Star rosters are out and ${nm(p)} isn't on them. ${He(p)} hasn't said a word. ${His(p)} teammates have said plenty.`,
        from: pS(p),
        opts: [{ k: 'campaign', label: 'Say ' + he(p) + ' was robbed', hint: 'He appreciates it' }, { k: 'fuel', label: 'Tell ' + him(p) + ' to use it as fuel', hint: 'Competitors respond' }],
        data: { pid: p.id },
      };
    },
    resolve(S, it, k, X) {
      const p = S.players[it.data.pid];
      if (!p) return '';
      if (k === 'campaign') { fx.mor(S, p, 5); fx.media(S, -1); return `"${p.last} is an All-Star. Everybody in this league knows it." ${nm(p)} heard you.`; }
      fx.conf(p, 0.06); fx.mor(S, p, type(p) === 'competitor' ? 3 : -1);
      return `${nm(p)} wrote the names of everyone picked ahead of ${him(p)} on the whiteboard in ${his(p)} locker.`;
    },
  });
  def({
    id: 'allstar_pick', fam: 'league', kind: 'message', when: 'phase:allstar', w: 1, pri: 1,
    find(S, X) { const mine = (S.allStars || []).filter(id => S.players[id] && S.players[id].tid === X.u); return mine.length ? [{ key: 'as:' + S.season, ids: mine }] : []; },
    build(S, c, X) {
      for (const id of c.ids) fx.mor(S, S.players[id], 3);
      fx.fans(S, X.u, 2 * c.ids.length);
      return { kind: 'message', title: c.ids.length > 1 ? `${c.ids.length} All-Stars` : 'An All-Star in the house', text: `Congratulations to ${c.ids.map(id => nm(S.players[id])).join(' and ')} on making the All-Star team.`, from: { type: 'league', name: 'The league office', role: 'All-Star selections' }, data: {} };
    },
    resolve: () => '',
  });

  // All-Star weekend (js/core/allstar.js): your players invited to the contests
  const CONTEST = { three: 'the three-point contest', dunk: 'the dunk contest', skills: 'the skills challenge' };
  def({
    id: 'contest_invite', fam: 'league', kind: 'decision', when: 'phase:allstar', w: 1, pri: 2, due: 1, def: 'go',
    find(S, X) { const inv = PBC.AllStar ? PBC.AllStar.userInvites(S) : []; return inv.length ? [{ key: 'asw:' + S.season, inv }] : []; },
    build(S, c, X) {
      const who = c.inv.map(x => `${nm(S.players[x.pid])} (${CONTEST[x.k]})`);
      const dunker = c.inv.some(x => x.k === 'dunk');
      return {
        title: c.inv.length > 1 ? 'Your players are invited to the All-Star weekend' : `${nm(S.players[c.inv[0].pid])} is invited to the All-Star weekend`,
        text: `The league wants ${who.join(' and ')} on Saturday night. It is a showcase: the fans love it, and so do the players. It is also a night of work in the middle of a long season${dunker ? ', and dunk contests have hurt people before' : ''}.`,
        from: { type: 'league', name: 'The league office', role: 'All-Star weekend' },
        opts: [
          { k: 'go', label: c.inv.length > 1 ? 'Let them compete' : 'Let ' + him(S.players[c.inv[0].pid]) + ' compete', hint: 'Morale and the fans; a small risk' },
          { k: 'rest', label: 'Ask the league to find someone else', hint: 'Fresh legs; a disappointed player' },
        ],
        data: { inv: c.inv },
      };
    },
    resolve(S, it, k, X) {
      const inv = it.data.inv || [];
      if (k === 'rest') {
        for (const x of inv) { PBC.AllStar.holdOut(S, x.pid); fx.mor(S, S.players[x.pid], -4); }
        fx.fans(S, X.u, -1);
        return 'The league found replacements. Your players got a weekend off, and did not hide their disappointment.';
      }
      for (const x of inv) fx.mor(S, S.players[x.pid], 3);
      fx.fans(S, X.u, 2);
      return 'They are going. The fans back home are already talking about it.';
    },
  });

  def({
    id: 'award_push', fam: 'press', kind: 'decision', when: 'week', phases: ['regular'], w: 1, gcd: 400, pri: 1, due: 4, block: false, def: 'speak',
    find(S, X) {
      if (S.day < (S.numDays || 180) * 0.68) return [];
      const st = PBC.League.standings(S);
      const pool = [];
      for (const id in S.players) {
        const p = S.players[id];
        if (p.tid < 0) continue;
        const s = PBC.Stats.season(p, S.season, false);
        if (!s || s.gp < 30) continue;
        pool.push({ p, sc: PBC.Stats.mvpScore(S, { p, s, gm: PBC.Stats.gmsc(s) / s.gp }, st) });
      }
      const top = U.sortBy(pool, x => x.sc, true).slice(0, 3);
      const mine = top.find(x => x.p.tid === X.u);
      return mine ? [{ key: 'mvp:' + S.season, pid: mine.p.id, rank: top.indexOf(mine) + 1 }] : [];
    },
    build(S, c, X) {
      const p = S.players[c.pid];
      return {
        title: `${nm(p)} is in the MVP race`,
        text: `${nm(p)} is ${c.rank === 1 ? 'the favorite' : 'top three'} in the MVP race with a month to go. The press keeps asking whether you'll make ${his(p)} case.`,
        from: staffFrom(S, 'pr'),
        opts: [{ k: 'campaign', label: 'Campaign for ' + him(p), hint: 'He\'ll love it; some voters won\'t' }, { k: 'speak', label: 'Let the season speak for itself', hint: '' }],
        data: { pid: p.id },
      };
    },
    resolve(S, it, k, X) {
      const p = S.players[it.data.pid];
      if (!p) return '';
      if (k === 'campaign') { fx.mor(S, p, 4); fx.fans(S, X.u, 2); fx.media(S, -1); return `"${p.last} is the MVP. It isn't close." It made the rounds.`; }
      fx.media(S, 1); return 'You let the numbers make the case.';
    },
  });

  def({
    id: 'community', fam: 'community', kind: 'offer', when: 'daily', phases: ['regular'], w: 0.6, gcd: 45, pri: 1, due: 4, block: false, def: 'decline',
    find(S, X) { return roster(S, X).length >= 10 ? [{ key: 'com' }] : []; },
    build(S, c, X) {
      const t = team(S, X);
      const ev = pick(X.R, [`the ${t.city} Children's Hospital`, `a youth camp on the east side of ${t.city}`, `the food bank's holiday drive`, `a reading program at three ${t.city} schools`]);
      return {
        title: 'A community invitation',
        text: `The team's foundation has an invitation from ${ev}. They'd love to see some players there on the off day.`,
        from: staffFrom(S, 'pr'),
        opts: [{ k: 'stars', label: 'Send the stars', hint: 'The city loves it; quiet stars may not' }, { k: 'young', label: 'Send the young players', hint: '' }, { k: 'decline', label: 'Decline, they need the rest', hint: '' }],
        data: {},
      };
    },
    resolve(S, it, k, X) {
      const r = rotation(S, X, 10);
      if (k === 'stars') { fx.fans(S, X.u, 4); for (const p of r.slice(0, 2)) fx.mor(S, p, type(p) === 'quiet' ? -2 : type(p) === 'showman' ? 3 : 1); fx.chem(S, X.u, 1); return 'The pictures were everywhere the next morning.'; }
      if (k === 'young') { fx.fans(S, X.u, 2); for (const p of PBC.League.roster(S, X.u).filter(p => p.age <= 23)) fx.mor(S, p, 2); return 'The kids had a great time. So did the kids.'; }
      fx.fans(S, X.u, -1); return 'Maybe next time.';
    },
  });

  // ---------------------------------------------------------------------------
  // The postseason
  // ---------------------------------------------------------------------------
  def({
    id: 'playoff_speech', fam: 'locker', kind: 'decision', when: 'series', phases: ['playoffs'], w: 1, pri: 2, due: 1, def: 'expect',
    find(S, X) {
      const P = S.playoffs;
      if (!P) return [];
      const s = P.series.find(x => !x.done && (x.hi === X.u || x.lo === X.u) && (x.w[0] + x.w[1]) === 0);
      return s ? [{ key: 'ser:' + S.season + ':' + s.round, round: s.round, opp: s.hi === X.u ? s.lo : s.hi, under: s.lo === X.u }] : [];
    },
    build(S, c, X) {
      const rn = PBC.League.roundName ? PBC.League.roundName(S, c.round) : `Round ${c.round}`;
      return {
        title: `${rn}: the ${nickOf(S, c.opp)}`,
        text: `The series starts tomorrow. Your players are waiting for you in the locker room. What's the message?`,
        from: staffFrom(S, 'assistant'),
        opts: [
          { k: 'under', label: c.under ? '"Nobody believes in us. Good."' : '"Play like we have nothing to lose."', hint: c.under ? 'Underdogs bite' : '' },
          { k: 'expect', label: c.under ? '"We came here to win this."' : '"We expect to win this series."', hint: '' },
          { k: 'defense', label: '"Defense travels. Get stops."', hint: '' },
        ],
        data: { under: c.under },
      };
    },
    resolve(S, it, k, X) {
      const r = rotation(S, X, 9);
      const d = k === 'under' ? (it.data.under ? 0.07 : 0.03) : k === 'expect' ? (it.data.under ? 0.02 : 0.05) : 0.04;
      for (const p of r) fx.conf(p, d);
      if (k === 'under' && it.data.under) fx.chem(S, X.u, 2);
      return 'They broke the huddle loud.';
    },
  });

  // ---------------------------------------------------------------------------
  // The offseason
  // ---------------------------------------------------------------------------
  const PITCH = { win: 'Winning', role: 'A big role', city: 'The city and the market', dev: 'Player development' };
  def({
    id: 'fa_pitch', fam: 'league', kind: 'decision', when: 'phase:fa', w: 1, pri: 2, due: 3, def: 'win',
    find(S, X) { return [{ key: 'pitch:' + S.season }]; },
    build(S, c, X) {
      return {
        title: 'Your free agency pitch',
        text: 'Free agency is open. Your front office is putting together the pitch deck for this summer\'s meetings. What do you sell? Players who care most about it will listen harder.',
        from: { type: 'league', name: staff(S, 'gm'), role: STAFF_TITLE.gm },
        opts: Object.keys(PITCH).map(k => ({ k, label: PITCH[k], hint: '' })),
        data: {},
      };
    },
    resolve(S, it, k) { Desk.ensure(S).pitch = { season: S.season, k }; return `This summer you sell ${PITCH[k].toLowerCase()}.`; },
  });
  /** the free-agency appeal bonus of your pitch for a player (Offseason.appeal) */
  Desk.pitchBonus = function (S, p) {
    const D = S.desk;
    if (!D || !D.pitch || D.pitch.season !== S.season) return 0;
    const pe = p.pers || {};
    const v = { win: pe.win, role: pe.pt, city: pe.market, dev: p.age <= 25 ? 70 : 30 }[D.pitch.k];
    return v == null ? 0 : U.clamp((v - 50) * 0.1, -2, 5);
  };

  def({
    id: 'draft_workouts', fam: 'staff', kind: 'decision', when: 'phase:offseason', w: 1, pri: 1, due: 5, block: false, def: 'top',
    find(S, X) { return Object.values(S.players).some(p => p.tid === -2) ? [{ key: 'wo:' + S.season }] : []; },
    build(S, c, X) {
      return {
        title: 'Predraft workouts',
        text: `${staff(S, 'scout')} can bring in three prospects for private workouts before the draft. Who do you want in the gym?`,
        from: staffFrom(S, 'scout'),
        opts: [{ k: 'top', label: 'The top of the board', hint: '' }, { k: 'mine', label: 'Players around our pick', hint: '' }, { k: 'bigs', label: 'Big men', hint: '' }, { k: 'guards', label: 'Guards', hint: '' }],
        data: {},
      };
    },
    resolve(S, it, k, X) {
      let pros = U.sortBy(Object.values(S.players).filter(p => p.tid === -2), p => p.ovr, true);
      if (k === 'bigs') pros = pros.filter(p => p.pos === 'C' || p.pos === 'PF');
      else if (k === 'guards') pros = pros.filter(p => p.pos === 'PG' || p.pos === 'SG');
      else if (k === 'mine') {
        const rank = PBC.Draft && PBC.Draft.teamPickRank ? PBC.Draft.teamPickRank(S)[X.u] || 15 : 15;
        pros = pros.slice(Math.max(0, rank - 3), rank + 5);
      }
      const three = pros.slice(0, 3);
      for (const p of three) { const s = p.scout || (p.scout = { pts: 0, known: 0 }); s.known = Math.min(100, (s.known || 0) + 20); }
      return three.length ? `Workouts done: ${three.map(nm).join(', ')}. Your scouts know a lot more about all three.` : 'Nobody fit the bill.';
    },
  });
})();
