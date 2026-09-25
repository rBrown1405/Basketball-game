/* Pro BBALL Coach — player personalities (PBC.Persona). No DOM.
 * Every player has a personality type (Easygoing, Showman, Hothead, Cold-Blooded...). It is derived from the
 * existing personality traits (p.pers: money, win, loyal, pt, market, ego, work) plus a few ratings, unless it
 * was set explicitly in the player editor (p.pers.type). The type drives the portrait's facial expression
 * (unless p.look.face overrides it), commentary color and flavour text on the player card. */
(function () {
  'use strict';
  const PBC = (window.PBC = window.PBC || {});
  const U = PBC.U;

  const TYPES = {
    easygoing: { label: 'Easygoing', icon: '😊', face: 'smile', desc: 'Laid back and all smiles. Gets along with everybody in the locker room.' },
    leader: { label: 'Floor General', icon: '🧭', face: 'focused', desc: 'Vocal, steady and team first. The one teammates look to in a timeout.' },
    competitor: { label: 'Fierce Competitor', icon: '🔥', face: 'intense', desc: 'Hates losing more than anything. Plays every possession with an edge.' },
    showman: { label: 'Showman', icon: '🎭', face: 'grin', desc: 'Lives for the highlight, the big stage and the crowd.' },
    cocky: { label: 'Cocky', icon: '😏', face: 'cocky', desc: 'Talks trash all game long and usually backs it up.' },
    hothead: { label: 'Hothead', icon: '💢', face: 'mean', desc: 'Emotional and fiery. Quick to snap at refs and rivals.' },
    quiet: { label: 'Quiet Pro', icon: '🤫', face: 'neutral', desc: 'Lets the game do the talking. Shows up, does the job, goes home.' },
    goofball: { label: 'Goofball', icon: '🤪', face: 'grin', desc: 'The locker room jokester. Keeps everybody loose.' },
    enforcer: { label: 'Enforcer', icon: '🛡️', face: 'mean', desc: 'Physical and intimidating. Protects teammates and sets hard screens.' },
    humble: { label: 'Humble Grinder', icon: '🧱', face: 'smile', desc: 'Outworks everybody, never complains, always says "we".' },
    diva: { label: 'Diva', icon: '💅', face: 'smirk', desc: 'Wants the touches, the shots and the credit.' },
    cold: { label: 'Cold-Blooded', icon: '🧊', face: 'serious', desc: 'Ice in the veins. Never rattled, never smiles in a close game.' },
  };
  const TYPE_KEYS = Object.keys(TYPES);

  /** Facial expressions the pixel portraits can draw. 'auto' = from the personality (and mood). */
  const FACES = [
    ['auto', 'Auto (from personality)'], ['smile', 'Warm smile'], ['grin', 'Big grin'], ['smirk', 'Smirk'],
    ['cocky', 'Cocky'], ['neutral', 'Neutral'], ['focused', 'Locked in'], ['intense', 'Intense'],
    ['mean', 'Mean mug'], ['serious', 'Stone cold'], ['fired', 'Fired up'], ['annoyed', 'Annoyed'],
  ];
  const FACE_KEYS = FACES.map(f => f[0]);

  function hashN(p, salt) {
    const s = String(p && p.id != null ? p.id : (p && p.last) || 'x') + '|' + salt;
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0) / 4294967296;
  }

  // balances how often each type shows up across a league (tuned on generated leagues)
  const BIAS = { competitor: -4, leader: -3.5, humble: -2.5, enforcer: -2, showman: -1, cocky: -1, diva: 0.5, quiet: 1, easygoing: 4, cold: 4, goofball: 6.5, hothead: 13 };

  /** Personality type from traits + ratings (deterministic per player). */
  function derive(p) {
    const t = Object.assign({ money: 50, win: 50, loyal: 50, pt: 50, market: 50, ego: 50, work: 60 }, (p && p.pers) || {});
    const r = (p && p.r) || {};
    const rv = k => (r[k] == null ? 60 : r[k]);
    const big = p && (p.pos === 'C' || p.pos === 'PF');
    const sc = {
      easygoing: (100 - t.win) * 0.3 + (100 - t.ego) * 0.25 + t.loyal * 0.2 + (100 - t.money) * 0.25,
      leader: t.win * 0.33 + t.loyal * 0.3 + t.work * 0.22 + (100 - t.ego) * 0.15 + (p && p.pos === 'PG' ? 6 : 0) + (p && p.age >= 28 ? 5 : 0),
      competitor: t.win * 0.55 + t.work * 0.25 + rv('hustle') * 0.2,
      showman: t.ego * 0.45 + t.market * 0.35 + (rv('dunk') + rv('vert')) * 0.1 - 2,
      cocky: t.ego * 0.62 + (100 - t.loyal) * 0.18 + rv('clutch') * 0.2 - 3,
      hothead: t.ego * 0.3 + (100 - t.work) * 0.25 + t.win * 0.2 + 12 * hashN(p, 'temper') - 4,
      quiet: (100 - t.ego) * 0.48 + t.work * 0.27 + (100 - t.market) * 0.25,
      goofball: (100 - t.win) * 0.3 + t.market * 0.3 + t.ego * 0.15 + 18 * hashN(p, 'goof') - 6,
      enforcer: rv('strength') * 0.35 + rv('hustle') * 0.3 + t.win * 0.2 + (big ? 12 : -12) - 5,
      humble: (100 - t.ego) * 0.4 + t.work * 0.45 + t.loyal * 0.15,
      diva: t.ego * 0.45 + t.money * 0.3 + t.pt * 0.25 - t.work * 0.15 + 4,
      cold: rv('clutch') * 0.62 + (100 - t.ego) * 0.18 + t.work * 0.2 - 8,
    };
    let best = 'quiet', bv = -1e9;
    for (const k of TYPE_KEYS) {
      const v = sc[k] + (BIAS[k] || 0) + (hashN(p, k) - 0.5) * 16;
      if (v > bv) { bv = v; best = k; }
    }
    return best;
  }

  /** The player's personality type key (editor override first). */
  function of(p) {
    const k = p && p.pers && p.pers.type;
    return k && TYPES[k] ? k : derive(p);
  }
  const info = p => TYPES[of(p)];

  /** Expression for a portrait. ctx: { mood: 'win' | 'loss' | 'clutch' | null } */
  function face(p, ctx) {
    const o = p && p.look && p.look.face;
    if (o && o !== 'auto' && FACE_KEYS.includes(o)) return o;
    const type = of(p);
    let f = TYPES[type].face;
    const mood = ctx && ctx.mood;
    const morale = p && p.morale != null ? p.morale : 70;
    if (mood === 'win') f = type === 'cold' || type === 'quiet' ? 'smirk' : type === 'hothead' || type === 'competitor' || type === 'enforcer' ? 'fired' : 'grin';
    else if (mood === 'loss') f = type === 'easygoing' || type === 'goofball' || type === 'humble' ? 'neutral' : 'annoyed';
    else if (mood === 'clutch') f = type === 'showman' || type === 'cocky' ? 'cocky' : 'focused';
    else if (morale < 30 && p && p.tid >= 0) f = type === 'humble' || type === 'quiet' ? 'neutral' : 'annoyed';
    // a little variety inside a type
    if (!mood && f === 'smile' && hashN(p, 'var') < 0.3) f = type === 'humble' ? 'neutral' : 'grin';
    if (!mood && f === 'mean' && hashN(p, 'var') < 0.25) f = 'intense';
    return f;
  }

  /** A short color-commentary phrase for this personality (used by the broadcast booth). */
  const BLURB = {
    easygoing: ['always playing with a smile', 'just a joy to watch', 'loose, relaxed, having fun out there'],
    leader: ['the coach on the floor', 'everybody follows this guy', 'directing traffic all night'],
    competitor: ['you can see how badly this one wants it', 'plays every possession like it is Game 7', 'refuses to lose'],
    showman: ['this one loves the spotlight', 'always good for a highlight', 'playing to the crowd'],
    cocky: ['and you know he is going to let them hear about it', 'talking the whole way back up the floor', 'no shortage of confidence there'],
    hothead: ['emotions running hot', 'had a few words for the officials', 'wearing his heart on his sleeve'],
    quiet: ['never says a word, just produces', 'all business', 'the quiet assassin'],
    goofball: ['the life of the locker room', 'keeping the bench loose', 'you never know what you are going to get'],
    enforcer: ['nobody pushes his teammates around', 'setting the physical tone', 'the muscle of this team'],
    humble: ['the hardest worker on the floor', 'doing all the dirty work', 'never takes a play off'],
    diva: ['wants the ball in his hands', 'looking for his shots tonight', 'he likes the spotlight on himself'],
    cold: ['ice water in the veins', 'nothing rattles this one', 'stone cold in big moments'],
  };
  function blurb(p) {
    const list = BLURB[of(p)] || BLURB.quiet;
    const s = list[Math.floor(Math.random() * list.length)];
    return p && p.gender === 'f' ? s.replace(/\bguy\b/g, 'player').replace(/\bhis\b/g, 'her').replace(/\bhe\b/g, 'she').replace(/\bhim\b/g, 'her') : s;
  }

  PBC.Persona = { TYPES, TYPE_KEYS, FACES, FACE_KEYS, derive, of, info, face, blurb };
  void U;
})();
