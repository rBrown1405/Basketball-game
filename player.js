/* Pro BBALL Coach — players: generation, overall rating, potential, looks, contracts, progression, injuries. */
(function () {
  'use strict';
  const PBC = (window.PBC = window.PBC || {});
  const U = PBC.U, C = PBC.Config;

  const REAL_NAME_BLOCK = new Set([
    'Stephen Curry', 'Kevin Durant', 'James Harden', 'Chris Paul', 'Anthony Davis', 'Paul George', 'Jimmy Butler', 'Devin Booker',
    'Jalen Brunson', 'Jaylen Brown', 'Donovan Mitchell', 'Jalen Green', 'Jalen Williams', 'Jalen Johnson', 'Jamal Murray', 'Josh Hart',
    'Josh Green', 'Myles Turner', 'Aaron Gordon', 'Brandon Ingram', 'Miles Bridges', 'Cameron Johnson', 'Marcus Smart', 'Tim Duncan',
    'Anthony Edwards', 'Keegan Murray', 'Isaiah Stewart', 'Andrew Wiggins', 'Klay Thompson', 'Kevin Love', 'Paul Pierce', 'Chris Webber',
    'Michael Jordan', 'Russell Westbrook', 'Kyle Anderson', 'Jordan Clarkson', 'Tyler Herro', 'Kevin Porter', 'Derrick Rose',
    'Caitlin Clark', 'Breanna Stewart', 'Candace Parker', 'Kelsey Plum', 'Alyssa Thomas', 'Jewell Loyd', 'Chelsea Gray', 'Jackie Young',
    'Kayla McBride', 'Aliyah Boston', 'Kelsey Mitchell', 'Natasha Cloud', 'Courtney Williams', 'Marina Mabrey', 'Tina Charles',
    'Angel Reese', 'Diana Taurasi', 'Sabrina Ionescu', 'Brittney Griner', 'Paige Bueckers', 'Cameron Brink', 'Kayla Thornton',
    'Deandre Ayton', 'Jarrett Allen', 'Evan Mobley', 'Dennis Smith', 'Mason Plumlee', 'Tobias Harris', 'Kevin Huerter', 'Isaac Okoro',
    'Kris Dunn', 'Jaden Ivey', 'Walker Kessler', 'Jalen Suggs', 'Cole Anthony', 'Trey Murphy', 'Herbert Jones', 'Julius Randle',
  ]);

  // ---------- names ----------
  function genName(gender) {
    const N = PBC.Names;
    for (let i = 0; i < 20; i++) {
      const first = U.pick(gender === 'f' ? N.femaleFirst : N.maleFirst);
      const last = U.pick(N.last);
      if (!REAL_NAME_BLOCK.has(first + ' ' + last)) return { first, last };
    }
    return { first: 'Sam', last: 'Rivers' };
  }

  // ---------- appearance ----------
  const HAIR_M = { fade: 26, buzz: 14, braids: 7, locs: 10, afro: 5, bald: 8, hightop: 3, curly: 10, waves: 9, mohawk: 2, twists: 6 };
  const HAIR_F = { ponytail: 28, bun: 14, braids: 16, locs: 8, long: 10, bob: 8, puffs: 5, curly: 6, twists: 5 };
  const BEARD = { none: 34, stubble: 26, full: 20, goatee: 12, mustache: 8 };

  function genLook(gender, hgt, wgt) {
    const skin = U.pickW([0, 1, 2, 3, 4, 5, 6, 7], [7, 7, 6, 9, 12, 16, 17, 14]);
    const hair = U.pickKey(gender === 'f' ? HAIR_F : HAIR_M);
    const light = skin <= 2;
    const hairColor = hair === 'bald' ? '#000000' : light
      ? U.pick(['#2a1c12', '#3b2716', '#5a3a1e', '#7a5530', '#a8753d', '#d6b370', '#8e2b1a'])
      : U.pickW(['#0e0b09', '#1b1410', '#2a1c12', '#3b2716', '#7a5530', '#d6b370'], [30, 34, 18, 8, 5, 3]);
    const bmi = (wgt * 703) / (hgt * hgt);
    const build = U.clamp((bmi - 21.5) / 7 + U.gauss(0, 0.12), 0, 1);
    const sleeveR = U.rand();
    const legR = U.rand();
    return {
      skin, hair, hairColor,
      beard: gender === 'f' ? 'none' : U.pickKey(BEARD),
      headband: U.chance(0.09) ? U.pick(['#ffffff', '#111111', 'team']) : null,
      armSleeve: sleeveR < 0.06 ? 'left' : sleeveR < 0.12 ? 'right' : sleeveR < 0.15 ? 'both' : 'none',
      legSleeve: legR < 0.08 ? 'left' : legR < 0.16 ? 'right' : legR < 0.22 ? 'both' : 'none',
      shoe: U.pick(C.SHOE_COLORS), shoeAccent: U.pick(C.SHOE_COLORS),
      build: U.round(build, 2),
      tattoo: U.pickKey({ none: 55, arms: 27, sleeve: 12, chest: 6 }),
    };
  }

  // ---------- ratings ----------
  const HEIGHT_FX = { block: 1.6, intD: 0.9, dreb: 1.1, oreb: 1.0, dunk: 0.8, close: 0.5, strength: 0.6, post: 0.4, speed: -1.2, agility: -1.4, handle: -0.8, perD: -0.4, steal: -0.3, three: -0.2 };

  function slopeFor(k) {
    if (k === 'durability') return 0.1;
    if (k === 'stamina') return 0.35;
    if (C.PHYSICAL[k]) return 0.55;
    if (k === 'clutch' || k === 'hustle') return 0.6;
    return 0.8;
  }

  function genRatings(pos, arch, talent, hgtDelta, age) {
    const base = C.POS_BASE[pos], d = (C.ARCHETYPES[pos] || {})[arch] || {};
    const r = {};
    for (const k of C.RATING_KEYS) {
      let v = base[k] + (d[k] || 0) + (talent - 70) * slopeFor(k) + (HEIGHT_FX[k] || 0) * hgtDelta;
      if (age >= 31 && (k === 'speed' || k === 'agility' || k === 'vert')) v -= (age - 30) * 1.8;
      if (age >= 31 && k === 'stamina') v -= (age - 30) * 1.0;
      if ((k === 'shotIQ' || k === 'vision' || k === 'helpD' || k === 'pass') ) v += U.clamp(age - 25, -4, 6) * 0.7;
      v += U.gauss(0, k === 'durability' ? 11 : 5.2);
      r[k] = Math.round(U.clamp(v, 25, 99));
    }
    return r;
  }

  const OVR_NORM = {};
  for (const pos of C.POSITIONS) {
    const w = C.OVR_W[pos];
    OVR_NORM[pos] = { total: U.sum(Object.values(w)), keys: Object.keys(w).filter(k => w[k] >= 3) };
  }

  function calcOvr(r, pos) {
    const w = C.OVR_W[pos], norm = OVR_NORM[pos];
    let s = 0;
    for (const k in w) s += w[k] * r[k];
    const wavg = s / norm.total;
    const top = norm.keys.map(k => r[k]).sort((a, b) => b - a);
    const top4 = (top[0] + top[1] + top[2] + top[3]) / 4;
    const raw = 0.72 * wavg + 0.28 * top4;
    const v = raw >= 60 ? raw * 1.2 - 9.8 : 62.2 - (60 - raw) * 0.6;
    return Math.round(U.clamp(v, 35, 99));
  }

  function ovrAt(p, pos) { return calcOvr(p.r, pos); }

  function bestPositions(p) {
    return U.sortBy(C.POSITIONS, pos => ovrAt(p, pos), true);
  }

  // expected OVR gain left before peak, by age
  function growthLeft(age) {
    const t = { 17: 16, 18: 14.5, 19: 12.5, 20: 10.5, 21: 8.5, 22: 6.5, 23: 4.5, 24: 3, 25: 1.8, 26: 0.8, 27: 0.3 };
    return t[age] != null ? t[age] : age < 17 ? 16 : 0;
  }

  function genPotential(ovr, age) {
    const g = growthLeft(age);
    if (g <= 0) return ovr;
    return Math.round(U.clamp(ovr + g + U.gauss(0, g * 0.45 + 1.2), ovr, 99));
  }

  // ---------- personality ----------
  function genPersonality() {
    const t = () => Math.round(U.clamp(U.gauss(55, 20), 1, 99));
    return { money: t(), win: t(), loyal: t(), pt: t(), market: t(), ego: t(), work: Math.round(U.clamp(U.gauss(62, 18), 5, 99)) };
  }

  // ---------- main generator ----------
  /**
   * opts: { league (cfg), pos, arch, talent, age, tid, gender, draftYear, prospect:boolean }
   */
  function create(S, opts) {
    const L = opts.league || PBC.League.cfg(S);
    const gender = L.gender;
    const pos = opts.pos || U.pick(C.POSITIONS);
    const arch = opts.arch || U.pick(Object.keys(C.ARCHETYPES[pos]));
    const [hMean, hSd] = L.heightByPos[pos];
    let hgt = U.clamp(Math.round(U.gauss(hMean, hSd)), hMean - 5, hMean + 6);
    if (arch === 'Stretch Big' || arch === 'Playmaking Big') hgt = Math.max(hgt, Math.round(hMean - 1));
    const hgtDelta = hgt - hMean;
    const wBase = gender === 'f' ? 5.3 * hgt - 208 : 6.5 * hgt - 305;
    let wgt = Math.round(U.gauss(wBase + (pos === 'C' || pos === 'PF' ? 10 : 0), gender === 'f' ? 10 : 13));
    const age = opts.age != null ? opts.age : U.int(20, 34);
    const talent = opts.talent != null ? opts.talent : U.gauss(66, 6);
    const r = genRatings(pos, arch, talent, hgtDelta, age);
    const { first, last } = genName(gender);
    const p = {
      id: S.nextPid++,
      first, last, gender, age, born: S.season - age,
      pos, arch, hgt, wgt, wing: Math.round(hgt + U.gauss(gender === 'f' ? 2 : 3.5, 2)),
      hand: U.chance(0.1) ? 'L' : 'R',
      num: 0,
      r, ovr: 0, pot: 0,
      tid: opts.tid != null ? opts.tid : -1,
      contract: null,
      look: genLook(gender, hgt, wgt),
      pers: genPersonality(),
      origin: '', draft: null,
      injury: null,
      stats: [], awards: [], hist: [],
      morale: 70, train: {}, yearsPro: 0, promise: null,
      born2: null,
    };
    p.ovr = calcOvr(r, pos);
    p.pot = genPotential(p.ovr, age);
    const college = U.chance(gender === 'f' ? 0.9 : 0.8);
    p.origin = college ? U.pick(PBC.Names.colleges) : U.pick(PBC.Names.countries);
    p.yearsPro = Math.max(0, age - (college ? 22 : 20) + U.int(-1, 1));
    if (opts.prospect) p.yearsPro = 0;
    delete p.born2;
    return p;
  }

  // ---------- contracts ----------
  function maxSalary(p, L) {
    const yrs = p.yearsPro || 0;
    const pct = yrs >= 10 ? L.maxPct[2] : yrs >= 7 ? L.maxPct[1] : L.maxPct[0];
    return Math.round(L.cap * pct);
  }

  /** Market value of a player's next contract (per season), rounded to $10K. */
  function marketValue(p, L) {
    let x = p.ovr;
    if (p.age <= 24 && p.pot > p.ovr) x += 0.35 * (p.pot - p.ovr);
    if (p.age >= 31) x -= (p.age - 30) * 1.3;
    const s = 1 / (1 + Math.exp(-(x - 82) * 0.26));
    const lo = L.minSalary, hi = maxSalary(p, L);
    const v = lo + (hi - lo) * s;
    return U.clamp(Math.round(v / 1e4) * 1e4, lo, hi);
  }

  function contractYears(p) {
    if (p.age >= 34) return 1;
    if (p.age >= 31) return U.int(1, 2);
    if (p.ovr >= 80) return U.int(3, 5);
    return U.int(1, 4);
  }

  function rookieSalary(pick, round, L) {
    if (round > 1) return L.rookieSecond;
    const teams = L.teamsList.length;
    const f = (pick - 1) / Math.max(1, teams - 1);
    return Math.round((L.rookieTop - (L.rookieTop - L.rookieFirstRoundLow) * Math.pow(f, 0.7)) / 1e4) * 1e4;
  }

  // ---------- injuries ----------
  const INJURIES = [
    { name: 'Ankle Sprain', days: [2, 12], w: 18 }, { name: 'Sore Knee', days: [2, 8], w: 10 }, { name: 'Back Spasms', days: [2, 9], w: 8 },
    { name: 'Hamstring Strain', days: [6, 24], w: 10 }, { name: 'Groin Strain', days: [6, 24], w: 6 }, { name: 'Calf Strain', days: [8, 28], w: 6 },
    { name: 'Concussion', days: [4, 14], w: 4 }, { name: 'Finger Fracture', days: [10, 35], w: 4 }, { name: 'Wrist Sprain', days: [4, 14], w: 5 },
    { name: 'Illness', days: [1, 5], w: 10 }, { name: 'Hip Contusion', days: [2, 8], w: 6 }, { name: 'Plantar Fasciitis', days: [10, 40], w: 3 },
    { name: 'Broken Hand', days: [28, 60], w: 2 }, { name: 'Torn Meniscus', days: [30, 75], w: 2 }, { name: 'High Ankle Sprain', days: [18, 45], w: 3 },
    { name: 'Torn ACL', days: [240, 330], w: 0.5 }, { name: 'Torn Achilles', days: [270, 360], w: 0.35 },
  ];

  function genInjury() {
    const inj = U.pickW(INJURIES, INJURIES.map(i => i.w));
    const days = U.int(inj.days[0], inj.days[1]);
    return { name: inj.name, days, total: days };
  }

  function injuryLabel(inj) {
    if (!inj) return '';
    const d = inj.days;
    const t = d <= 2 ? 'day-to-day' : d <= 7 ? `~${d} days` : d <= 30 ? `~${Math.round(d / 7)} wks` : d <= 120 ? `~${Math.round(d / 30)} mo` : 'out for season';
    return `${inj.name} (${t})`;
  }

  // ---------- training points from practice ----------
  /** Adds fractional progress to a rating; returns true if the rating ticked up. */
  function addTraining(p, key, amount) {
    if (!p.train) p.train = {};
    p.train[key] = (p.train[key] || 0) + amount;
    let ticked = false;
    while (p.train[key] >= 1) {
      p.train[key] -= 1;
      if (p.r[key] < 99) { p.r[key] += 1; ticked = true; }
    }
    if (ticked) p.ovr = calcOvr(p.r, p.pos);
    return ticked;
  }

  // ---------- progression (called once per offseason, after age += 1) ----------
  function progress(p, coachDev) {
    const age = p.age;
    let base;
    if (age <= 20) base = 4.2; else if (age <= 22) base = 3.2; else if (age <= 24) base = 2.1; else if (age <= 26) base = 1.0;
    else if (age <= 28) base = 0.2; else if (age <= 30) base = -0.9; else if (age <= 32) base = -2.1; else if (age <= 34) base = -3.3; else base = -4.6;
    const gap = p.pot - p.ovr;
    let growth = base + (age <= 26 ? gap * 0.16 : 0) + ((p.pers && p.pers.work) - 60) * 0.025 + (coachDev || 0) + U.gauss(0, 1.9);
    if (age >= 29) growth = Math.min(growth, 1.2);
    const before = p.ovr;
    const r = p.r;
    for (const k of C.RATING_KEYS) {
      let d = growth;
      if (k === 'speed' || k === 'agility' || k === 'vert') d = age < 25 ? growth * 0.6 : age < 28 ? growth * 0.3 - 0.3 : growth * 0.5 - (age - 27) * 0.55;
      else if (k === 'stamina') d = age < 30 ? growth * 0.4 : -(age - 29) * 0.8;
      else if (k === 'durability') d = age < 30 ? U.gauss(0, 1) : -(age - 29) * 0.9;
      else if (k === 'shotIQ' || k === 'vision' || k === 'helpD') d = growth * 0.7 + (age <= 32 ? 0.8 : 0);
      else if (k === 'three' || k === 'ft' || k === 'mid') d = growth + (age <= 31 ? 0.35 : 0);
      else if (k === 'strength') d = age < 28 ? growth * 0.5 + 0.6 : growth * 0.4;
      d += U.gauss(0, 1.3);
      r[k] = Math.round(U.clamp(r[k] + d, 25, 99));
    }
    p.ovr = calcOvr(r, p.pos);
    if (age <= 26) p.pot = Math.round(U.clamp(Math.max(p.ovr, p.pot + U.gauss(0, 1.6) + (p.ovr - before - base) * 0.4), p.ovr, 99));
    else p.pot = p.ovr;
    return p.ovr - before;
  }

  // ---------- helpers ----------
  function name(p) { return p ? `${p.first} ${p.last}` : ''; }
  function shortName(p) { return p ? `${p.first[0]}. ${p.last}` : ''; }
  function isInjured(p) { return !!(p.injury && p.injury.days > 0); }

  /** Choose an unused jersey number on a team. */
  function assignNumber(S, p) {
    const used = new Set(Object.values(S.players).filter(q => q.tid === p.tid && q.id !== p.id).map(q => q.num));
    const favs = [0, 1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12, 13, 14, 15, 20, 21, 22, 23, 24, 25, 30, 31, 32, 33, 34, 35, 41, 42, 44, 45, 50, 55];
    if (!used.has(p.num) && p.num) return p.num;
    const opts = U.shuffle(favs).filter(n => !used.has(n));
    p.num = opts.length ? opts[0] : U.int(0, 99);
    return p.num;
  }

  /** Short scouting-style blurb from ratings */
  function strengths(p, n = 3) {
    const r = p.r;
    const tags = [
      ['Elite shooter', r.three], ['Mid-range assassin', r.mid], ['Rim finisher', (r.layup + r.dunk) / 2], ['Post scorer', r.post],
      ['Playmaker', (r.pass + r.vision) / 2], ['Ball handler', r.handle], ['Lockdown defender', r.perD], ['Rim protector', (r.block + r.intD) / 2],
      ['Glass cleaner', (r.dreb + r.oreb) / 2], ['Athlete', (r.speed + r.vert + r.agility) / 3], ['Clutch', r.clutch], ['Pickpocket', r.steal],
      ['Free throw ace', r.ft], ['Iron man', (r.stamina + r.durability) / 2],
    ];
    return U.sortBy(tags, t => t[1], true).slice(0, n).filter(t => t[1] >= 70).map(t => t[0]);
  }

  function weaknesses(p, n = 2) {
    const r = p.r;
    const tags = [
      ['Poor shooter', r.three], ['Weak finisher', (r.layup + r.close) / 2], ['Loose handle', r.handle], ['Poor defender', (r.perD + r.intD) / 2],
      ['Undersized rebounder', (r.dreb + r.oreb) / 2], ['Poor FT shooter', r.ft], ['Slow feet', (r.speed + r.agility) / 2], ['Injury prone', r.durability],
    ];
    return U.sortBy(tags, t => t[1]).slice(0, n).filter(t => t[1] < 55).map(t => t[0]);
  }

  PBC.Player = {
    create, genName, genLook, genRatings, calcOvr, ovrAt, bestPositions, genPotential, growthLeft, genPersonality,
    marketValue, maxSalary, contractYears, rookieSalary, genInjury, injuryLabel, addTraining, progress,
    name, shortName, isInjured, assignNumber, strengths, weaknesses, INJURIES,
  };
})();
