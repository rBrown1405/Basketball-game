/* Pro BBALL Coach: the owner's office (PBC.Office): owners with personalities, and every team's facilities. No DOM.
 *
 * Every owner has a personality (owner.type): the Winner, the Dealmaker, the Promoter, the Builder or the Meddler, on
 * top of the patience and spending every owner already had. The type decides what the owner asks of you each season
 * (the Desk's owner meeting), how your season review weighs what happened (Coach.endSeason, through Office.review), and
 * how quickly an AI coach is shown the door (Staff.carousel, through Office.heat).
 *
 * Facilities (team.fac, levels 1 to 5): the training center grows players, the medical staff keeps them healthy and
 * gets them back sooner, the scouting department sees prospects better, and the arena fills up and impresses free
 * agents. Every summer each team gets facility points from its owner's spending and its season; an upgrade takes a
 * summer to build and opens at training camp. AI teams build by their owner's taste. Level 3 is the league's middle,
 * so the effects are centred on it.
 *
 *   team.owner = { patience, spend, name, type }
 *   team.fac   = { train, med, scout, arena, pts, build: { key, at } | null, hist: [{ season, key, lvl }] }
 */
(function () {
  'use strict';
  const PBC = (window.PBC = window.PBC || {});
  const U = PBC.U;
  const Office = (PBC.Office = PBC.Office || {});

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
    r.pickW = (arr, w) => { const ws = arr.map(w); let x = r() * ws.reduce((a, b) => a + b, 0); for (let i = 0; i < arr.length; i++) { x -= ws[i]; if (x <= 0) return arr[i]; } return arr[arr.length - 1]; };
    return r;
  }
  const rng = (S, salt) => makeRng(U.hash(`${S.saveId || 'save'}|office|${salt || ''}`));
  const userTid = S => (S.coach && S.coach.status === 'unemployed') ? -1 : (S.userTid == null ? -1 : S.userTid);

  // ---------------------------------------------------------------------------
  // Owners
  // ---------------------------------------------------------------------------
  const TYPES = {
    winner: { label: 'The Winner', icon: '🏆', blurb: 'Only one thing matters to this owner: winning. A good season is noticed fast, and so is a bad one.',
      wants: 'Wins, the playoffs, and a deep run.' },
    money: { label: 'The Dealmaker', icon: '💼', blurb: 'Watches the bottom line. Loves a bargain, hates the luxury tax, and wants the seats full.',
      wants: 'A payroll under the tax and a full building.' },
    showman: { label: 'The Promoter', icon: '🎤', blurb: 'Wants stars, headlines and a loud building. Being boring is the one sin.',
      wants: 'Stars, All-Stars and fans on their feet.' },
    builder: { label: 'The Builder', icon: '🧱', blurb: 'Believes in the draft, development and the long game. Patient with a young team that is growing.',
      wants: 'Young players getting better, and draft picks kept.' },
    meddler: { label: 'The Meddler', icon: '🕹️', blurb: 'Has opinions about everything, including your rotation, and expects to be listened to.',
      wants: 'To be heard. Especially about a favorite player.' },
  };
  Office.TYPES = TYPES;

  /** the owner of team tid, with a personality (made once per owner) */
  Office.owner = function (S, tid) {
    const o = PBC.Desk && PBC.Desk.owner ? PBC.Desk.owner(S, tid) : (S.teams[tid] && (S.teams[tid].owner || (S.teams[tid].owner = { patience: 60, spend: 50 })));
    if (!o) return { patience: 60, spend: 50, type: 'winner', name: 'The owner' };
    if (!o.type || !TYPES[o.type]) {
      const t = S.teams[tid];
      const R = rng(S, 'owner' + tid);
      // (about a quarter Winners, a fifth each Dealmakers, Promoters and Builders, the rest Meddlers)
      const w = { winner: 1.2 + (o.patience < 50 ? 1.2 : 0), money: 1 + (o.spend < 45 ? 1.6 : 0), showman: 0.8 + ((t.market || 3) >= 4 ? 0.8 : 0) + (o.spend > 70 ? 0.4 : 0),
        builder: 0.9 + (o.patience > 70 ? 1 : 0), meddler: 0.9 };
      o.type = R.pickW(Object.keys(TYPES), k => w[k]);
    }
    return o;
  };
  Office.type = (S, tid) => TYPES[Office.owner(S, tid).type];

  /** the owner's mood about your season review: extra security points by type (Coach.endSeason). ctx: { pct, exp,
   *  reached, rounds, champ, devGain, delta } */
  Office.review = function (S, tid, ctx) {
    const o = Office.owner(S, tid);
    const t = S.teams[tid];
    const L = PBC.League.cfg(S);
    const out = { d: 0, why: [] };
    const add = (d, why) => { if (!d) return; out.d += d; out.why.push(why); };
    if (o.type === 'winner') {
      add(Math.round(ctx.delta * 0.2), ctx.delta >= 0 ? 'The Winner loved the results' : 'The Winner hated the results');
    } else if (o.type === 'money') {
      const pay = PBC.Offseason ? PBC.Offseason.payroll(S, tid) : 0;
      if (pay > L.tax) add(-5, 'A payroll over the tax');
      else if (pay < L.cap) add(3, 'A payroll under the cap');
      if ((t.hype || 50) >= 70) add(2, 'A full building');
    } else if (o.type === 'showman') {
      const h = t.hype == null ? 50 : t.hype;
      if (h >= 75) add(4, 'The building was rocking');
      else if (h < 40) add(-4, 'Empty seats');
      if ((S.allStars || []).some(id => S.players[id] && S.players[id].tid === tid)) add(2, 'An All-Star in the building');
    } else if (o.type === 'builder') {
      add(Math.round(U.clamp(ctx.devGain * 0.3, -3, 6)), ctx.devGain >= 0 ? 'The young players grew' : 'The young players went backward');
    } else if (o.type === 'meddler') {
      const D = S.desk;
      const ignored = D && D.items ? D.items.filter(i => i.season === S.season && i.from && i.from.type === 'owner' && i.kind === 'decision' && i.auto).length : 0;
      if (ignored) add(-2 * Math.min(3, ignored), 'You ignored the owner');
    }
    return out;
  };
  /** extra patience in the review by type (Coach.endSeason multiplies the owner's patience by it) */
  Office.patience = function (S, tid) {
    const ty = Office.owner(S, tid).type;
    return ty === 'builder' ? 1.15 : ty === 'winner' ? 0.9 : ty === 'meddler' ? 0.95 : 1;
  };
  /** an AI owner's itch to fire the coach (Staff.carousel): heat points by type */
  Office.heat = function (S, tid, pct, R) {
    const o = Office.owner(S, tid);
    const t = S.teams[tid];
    if (o.type === 'winner') return pct < 0.5 ? 6 : 0;
    if (o.type === 'builder') { const top = PBC.League.roster(S, tid).slice(0, 8); return top.length && U.avg(top, p => p.age) <= 25.5 ? -8 : 0; }
    if (o.type === 'money') return -3;
    if (o.type === 'showman') return (t.hype == null ? 50 : t.hype) < 45 ? 5 : 0;
    if (o.type === 'meddler') return 3 + Math.floor((R ? R() : 0.5) * 7);
    return 0;
  };

  // ---------------------------------------------------------------------------
  // Facilities
  // ---------------------------------------------------------------------------
  const FAC = {
    train: { label: 'Training Center', icon: '🏋️', what: 'Players grow more in practice and every summer.',
      at: L => `Practice gains ${sgn(Math.round((L - 3) * 6))}%, summer growth ${sgn(U.round((L - 3) * 0.06, 2))} a rating for young players` },
    med: { label: 'Medical & Recovery', icon: '🩺', what: 'Fewer injuries, and players back sooner when they do get hurt.',
      at: L => `Injuries ${sgn(Math.round(-(L - 3) * 7))}%, time out ${sgn(Math.round(-(L - 3) * 8))}%` },
    scout: { label: 'Scouting Department', icon: '🔭', what: 'More scouting points every week, and a sharper read on the draft.',
      at: L => `Scouting points ${sgn(L - 3)} a week, bank ${sgn((L - 3) * 4)}` },
    arena: { label: 'Arena', icon: '🏟️', what: 'A fuller, louder building: the fans get behind you, and free agents notice.',
      at: L => `Fan excitement ${sgn((L - 3) * 3)}, free agent interest ${sgn(U.round((L - 3) * 1.2, 1))}` },
  };
  function sgn(v) { return (v > 0 ? '+' : v < 0 ? '' : '±') + v; }
  // (level 3 is the league's middle)
  for (const k in FAC) { const at = FAC[k].at; FAC[k].at = L => (L === 3 ? 'League average' : at(L)); }
  Office.FAC = FAC;
  Office.FAC_KEYS = Object.keys(FAC);
  Office.FAC_MAX = 5;
  /** facility points to go from level lvl to lvl + 1: 3, 5, 7, 9 */
  Office.facCost = lvl => lvl * 2 + 1;

  /** a team's facilities (made once: levels from the owner's spending) */
  Office.fac = function (S, tid) {
    const t = S.teams[tid];
    if (!t) return null;
    if (!t.fac) {
      const o = Office.owner(S, tid);
      const R = rng(S, 'fac' + tid);
      const lv = () => U.clamp(Math.round(1.6 + o.spend / 33 + (R() - 0.5) * 1.6), 1, 4);
      // (enough to start one project in the first preseason)
      t.fac = { train: lv(), med: lv(), scout: lv(), arena: lv(), pts: Math.round(4 + o.spend / 20), build: null, hist: [] };
    }
    return t.fac;
  };
  Office.level = (S, tid, key) => { const f = Office.fac(S, tid); return f ? f[key] || 3 : 3; };
  Office.ensure = function (S) { for (const t of S.teams) { Office.owner(S, t.id); Office.fac(S, t.id); } };

  /** start building an upgrade (it opens at the next training camp): { ok, msg } */
  Office.upgrade = function (S, tid, key) {
    const f = Office.fac(S, tid);
    const d = FAC[key];
    if (!f || !d) return { ok: false, msg: 'No such facility.' };
    if (f.build) return { ok: false, msg: `The ${FAC[f.build.key].label.toLowerCase()} is already being built.` };
    const lvl = f[key];
    if (lvl >= Office.FAC_MAX) return { ok: false, msg: `The ${d.label.toLowerCase()} is already the best in the league.` };
    const cost = Office.facCost(lvl);
    if (f.pts < cost) return { ok: false, msg: `That takes ${cost} facility points (you have ${f.pts}).` };
    f.pts -= cost;
    f.build = { key, at: S.season + 1, lvl: lvl + 1, started: S.season };
    if (tid === userTid(S) && PBC.Season) PBC.Season.news(S, `🏗️ Construction begins: the ${d.label.toLowerCase()} goes to level ${lvl + 1}. It opens at training camp.`, 'career', tid);
    return { ok: true, msg: `${d.label}: level ${lvl + 1} opens at training camp.` };
  };

  /** the summer (Off.begin, after the season's review): every team's facility points, and the AI teams' builds */
  Office.summer = function (S) {
    Office.ensure(S);
    const st = PBC.League.standings(S);
    const u = userTid(S);
    const R = rng(S, 'summer' + S.season);
    for (const t of S.teams) {
      const f = Office.fac(S, t.id), o = Office.owner(S, t.id);
      const res = PBC.League.playoffResult ? PBC.League.playoffResult(S, t.id) : {};
      const r = st[t.id] || { w: 0, l: 0 };
      let pts = 1 + o.spend / 30;
      if (res && res.round >= 1) pts += 1;
      if (res && res.champ) pts += 2;
      if ((t.hype || 50) >= 70) pts += 1;
      if (o.type === 'money') pts -= 0.5;
      if (o.type === 'showman') pts += 0.5;
      f.pts = Math.min(30, f.pts + Math.max(1, Math.round(pts)));
      f.lastPts = { season: S.season, n: Math.max(1, Math.round(pts)), w: r.w, l: r.l };
      if (t.id === u || f.build) continue;
      // the AI owner builds by taste: the owner's favorite facility, or the weakest one
      const fav = { winner: 'train', money: 'arena', showman: 'arena', builder: 'scout', meddler: R.pick(Office.FAC_KEYS) }[o.type] || 'train';
      const weakest = U.minBy(Office.FAC_KEYS, k => f[k] + R() * 0.5);
      const key = f[fav] < Office.FAC_MAX && R() < 0.6 ? fav : weakest;
      if (f[key] < Office.FAC_MAX && f.pts >= Office.facCost(f[key])) Office.upgrade(S, t.id, key);
    }
  };
  /** a new season (Off.finish, after S.season++): the builds that are done open */
  Office.newSeason = function (S) {
    for (const t of S.teams) {
      const f = t.fac;
      if (!f || !f.build || f.build.at > S.season) continue;
      const b = f.build;
      f[b.key] = Math.min(Office.FAC_MAX, Math.max(f[b.key], b.lvl));
      f.hist = (f.hist || []).concat([{ season: S.season, key: b.key, lvl: f[b.key] }]).slice(-20);
      f.build = null;
      if (t.id === userTid(S) && PBC.Season) PBC.Season.news(S, `🏗️ Ribbon cut: the new ${FAC[b.key].label.toLowerCase()} (level ${f[b.key]}) is open.`, 'career', t.id);
      if (t.id === userTid(S) && f[b.key] >= Office.FAC_MAX && PBC.Coach) PBC.Coach.unlock(S, 'facility_max');
    }
  };

  // the effects (centred on level 3)
  /** summer growth from the training center (rating points before the age weight, Staff.devBonus) */
  Office.devBonus = (S, tid) => (S.teams[tid] ? (Office.level(S, tid, 'train') - 3) * 0.06 : 0);
  /** practice gains (your practices, Season.applyPractice) */
  Office.practiceMult = (S, tid) => (S.teams[tid] ? 1 + (Office.level(S, tid, 'train') - 3) * 0.06 : 1);
  /** injuries in games (Sim) and how long they last */
  Office.injuryMult = (S, tid) => (S.teams[tid] ? 1 - (Office.level(S, tid, 'med') - 3) * 0.07 : 1);
  Office.recoveryMult = (S, tid) => (S.teams[tid] ? 1 - (Office.level(S, tid, 'med') - 3) * 0.08 : 1);
  /** your scouting points a week and your bank (Draft) */
  Office.scoutPoints = (S, tid) => (S.teams[tid] ? Office.level(S, tid, 'scout') - 3 : 0);
  Office.scoutBank = (S, tid) => (S.teams[tid] ? (Office.level(S, tid, 'scout') - 3) * 4 : 0);
  /** how sharp an AI team's draft board is (the noise on its read of a prospect) */
  Office.draftNoise = (S, tid) => (S.teams[tid] ? 1 + (3 - Office.level(S, tid, 'scout')) * 0.25 : 1);
  /** the fans (the weekly drift's target) and free agents (Off.appeal) */
  Office.fanBonus = (S, tid) => (S.teams[tid] ? (Office.level(S, tid, 'arena') - 3) * 3 : 0);
  Office.appeal = (S, tid) => (S.teams[tid] && S.teams[tid].fac ? U.round((Office.level(S, tid, 'arena') - 3) * 1.2 + (Office.level(S, tid, 'train') - 3) * 0.8, 1) : 0);
  /** the league's facilities, ranked (the screens): [{ t, f, sum, rank }] */
  Office.ranks = function (S) {
    Office.ensure(S);
    const rows = U.sortBy(S.teams.map(t => ({ t, f: t.fac, sum: Office.FAC_KEYS.reduce((a, k) => a + t.fac[k], 0) })), r => r.sum, true);
    rows.forEach((r, i) => { r.rank = i + 1; });
    return rows;
  };
})();
