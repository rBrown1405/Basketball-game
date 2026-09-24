/* Pro BBALL Coach — match view: mock data for the test harness (PBC.Match.Mock).
 * Builds two teams (men's or women's league) and an endless stream of contract-shaped possessions
 * covering every play type and event type (subs, timeouts, fouls/FTs, turnovers, OREB putbacks,
 * period ends, GIM pending shots). Not used by the real game. */
(function () {
  'use strict';
  const M = window.PBC.Match, U = M.U;

  const FIRST_M = ['Marcus', 'Jalen', 'Tyrese', 'DeAndre', 'Luka', 'Kevin', 'Andre', 'Isaiah', 'Malik', 'Jordan', 'Cam', 'Darius', 'Nikola', 'Trey', 'Zion', 'Evan', 'Chris', 'Bam', 'Victor', 'Jaylen', 'Scottie', 'Myles', 'Keon', 'Paolo', 'Josh', 'Tobias'];
  const FIRST_F = ['Aja', 'Breanna', 'Candace', 'Diana', 'Elena', 'Jewell', 'Kelsey', 'Napheesa', 'Sabrina', 'Arike', 'Alyssa', 'Jackie', 'Rhyne', 'Satou', 'Tina', 'Chelsea', 'Kahleah', 'Brionna', 'Natasha', 'Skylar', 'Dearica', 'Ezi', 'Marina', 'Allisha', 'Kayla', 'Jonquel'];
  const LAST = ['Hill', 'Brown', 'Carter', 'Washington', 'Johnson', 'Mitchell', 'Okafor', 'Petrovic', 'Silva', 'Walker', 'Reed', 'Hayes', 'Brooks', 'Coleman', 'Diallo', 'Evans', 'Foster', 'Grant', 'Harris', 'Jenkins', 'King', 'Lopez', 'Moore', 'Nance', 'Owens', 'Price', 'Quinn', 'Ross', 'Stone', 'Turner'];
  const HAIR_M = ['buzz', 'fade', 'fade', 'afro', 'braids', 'locs', 'bald', 'hightop', 'curly', 'waves', 'waves', 'mohawk', 'twists', 'buzz'];
  const HAIR_F = ['ponytail', 'ponytail', 'bun', 'braids', 'long', 'bob', 'puffs', 'locs', 'bun', 'twists', 'curly', 'fade'];
  const HAIRC = ['#15100d', '#1f1510', '#2b1d14', '#3d2a1a', '#6a4a2c', '#a07a4a', '#c7a064', '#5a2e1c'];
  const POS = ['PG', 'SG', 'SF', 'PF', 'C'];

  function makeTeam(seed, info, women) {
    const rnd = U.rng(seed);
    const pick = (a) => a[(rnd() * a.length) | 0];
    const players = [];
    const baseH = women ? { PG: 69, SG: 71, SF: 73, PF: 75, C: 77 } : { PG: 75, SG: 77, SF: 79, PF: 81, C: 83 };
    const used = {};
    for (let i = 0; i < 13; i++) {
      const pos = POS[i % 5];
      let num;
      do { num = (rnd() * 55) | 0; } while (used[num]);
      used[num] = 1;
      const h = Math.round(baseH[pos] + (rnd() - 0.5) * 4 + (i === 4 ? 2 : 0));
      const skin = (rnd() * 8) | 0;
      const p = {
        id: info.abbr + '-' + i, teamIdx: info.idx,
        first: pick(women ? FIRST_F : FIRST_M), last: pick(LAST), num, pos,
        height: h, weight: Math.round((women ? 120 : 150) + (h - (women ? 60 : 66)) * (women ? 4.3 : 5.2) + rnd() * 25),
        hand: (i === 1 || i === 7) ? 'L' : 'R', gender: women ? 'f' : 'm',
        look: {
          skin, hair: pick(women ? HAIR_F : HAIR_M), hairColor: skin < 2 && rnd() < 0.4 ? pick(['#8a5a2e', '#c7a064', '#3d2a1a']) : pick(HAIRC.slice(0, 5)),
          beard: women ? 'none' : pick(['none', 'none', 'stubble', 'full', 'goatee', 'mustache', 'none']),
          headband: rnd() < 0.15 ? pick(['#ffffff', '#111111', info.colors.primary]) : null,
          armSleeve: rnd() < 0.2 ? pick(['left', 'right', 'both']) : 'none',
          legSleeve: rnd() < 0.15 ? pick(['left', 'right', 'both']) : 'none',
          shoe: pick(['#f2f2f2', '#151515', info.colors.primary, '#f2f2f2']), shoeAccent: pick([info.colors.secondary, '#e8e8e8', '#c8102e']),
          build: rnd() * 0.8 + (pos === 'C' || pos === 'PF' ? 0.2 : 0), tattoo: pick(['none', 'none', 'arms', 'sleeve', 'chest']),
        },
        speed: 55 + (rnd() * 40 | 0) - (pos === 'C' ? 12 : 0), agility: 55 + (rnd() * 40 | 0), vert: 50 + (rnd() * 45 | 0), handle: 45 + (rnd() * 50 | 0) - (pos === 'C' ? 15 : 0),
      };
      players.push(p);
    }
    return players;
  }

  function makeContext(opts) {
    opts = opts || {};
    const women = !!opts.women;
    const home = {
      id: 1, abbr: 'HCS', city: 'Harbor City', name: 'Stallions',
      colors: { primary: '#123a7a', secondary: '#f2b632', trim: '#ffffff' },
      uniform: { jersey: '#ffffff', number: '#123a7a', trim: '#f2b632', shorts: '#ffffff' },
      court: { paint: '#123a7a', logoText: 'HCS', wood: 'light' },
    };
    const away = {
      id: 2, abbr: 'RVV', city: 'River Valley', name: 'Vipers',
      colors: { primary: '#9e1b24', secondary: '#111111', trim: '#ffffff' },
      uniform: { jersey: '#9e1b24', number: '#ffffff', trim: '#111111', shorts: '#9e1b24' },
      court: { paint: '#9e1b24', logoText: 'RVV', wood: 'medium' },
    };
    const hp = makeTeam(opts.seed || 11, { abbr: 'HCS', idx: 0, colors: home.colors }, women);
    const ap = makeTeam((opts.seed || 11) + 101, { abbr: 'RVV', idx: 1, colors: away.colors }, women);
    const players = {};
    for (const p of hp.concat(ap)) players[p.id] = p;
    return {
      league: women ? 'women' : 'men',
      periodLen: women ? 600 : 720,
      threePt: women ? { arc: 22.15, corner: 21.65 } : { arc: 23.75, corner: 22 },
      home, away, players,
      lineups: [hp.slice(0, 5).map((p) => p.id), ap.slice(0, 5).map((p) => p.id)],
      defScheme: ['man', 'zone23'],
      _rosters: [hp.map((p) => p.id), ap.map((p) => p.id)],
    };
  }

  function attacksRight(team, period) { return period <= 2 ? team === 0 : team === 1; }

  const PLAYS = ['pnr', 'iso', 'post', 'spot', 'offscreen', 'handoff', 'cut', 'none'];
  const SETNAMES = {
    pnr: ['SPAIN PICK & ROLL', 'HIGH PICK & ROLL', 'SIDE PNR', 'DRAG SCREEN'], iso: ['ISO WING', 'ISO TOP', 'CLEAR OUT'],
    post: ['POST UP', 'LOW POST ISO', 'ELBOW POST'], spot: ['SWING', 'DRIVE & KICK', '5-OUT MOTION'],
    offscreen: ['PIN DOWN', 'FLOPPY', 'STAGGER'], handoff: ['DHO', 'CHICAGO', 'GET ACTION'], cut: ['BACKDOOR', 'UCLA CUT', 'SPLIT ACTION'],
    none: ['MOTION', 'FREELANCE'], transition: ['TRANSITION', 'EARLY OFFENSE'],
  };
  const SCHEMES = ['man', 'man', 'man', 'switch', 'drop', 'blitz', 'zone23', 'zone32', 'zone131', 'boxone', 'press', 'packline', 'nothree', 'pressure'];

  class Game {
    constructor(ctx, opts) {
      this.ctx = ctx;
      this.opts = opts || {};
      this.rnd = U.rng(this.opts.seed || ((Date.now() & 0xffff) + 7));
      this.period = 1;
      this.clock = this.opts.periodLen || ctx.periodLen;
      this.score = [0, 0];
      this.lineups = [ctx.lineups[0].slice(), ctx.lineups[1].slice()];
      this.benches = [ctx._rosters[0].filter((id) => !this.lineups[0].includes(id)), ctx._rosters[1].filter((id) => !this.lineups[1].includes(id))];
      this.n = 0;
      this.next = { start: 'jump_ball', off: 0 };
      this.fouls = [0, 0];
      this.defScheme = ctx.defScheme.slice();
      this.gimEvery = this.opts.gimEvery || 11;
      this.forcePlay = null;
    }
    r() { return this.rnd(); }
    chance(p) { return this.rnd() < p; }
    pick(a) { return a[(this.rnd() * a.length) | 0]; }
    between(a, b) { return a + (b - a) * this.rnd(); }

    /** court point relative to the attacked basket: u = feet from baseline, v = y */
    pt(off, u, v) { const right = attacksRight(off, this.period); return { x: right ? 94 - u : u, y: v }; }

    nextPossession() {
      this.gameOver = false;
      const p = this._nextPossession();
      // never schedule an event after the period clock runs out (clamping keeps the order)
      for (const e of p.events) if (e.t > p.clockStart) e.t = p.clockStart;
      const last = p.events[p.events.length - 1];
      if (last && last.type === 'period_end') { last.t = p.clockStart; p.clockEnd = 0; }
      if (p.clockEnd < 0) p.clockEnd = 0;
      return p;
    }
    _nextPossession() {
      const nx = this.next;
      const off = nx.off;
      const def = 1 - off;
      const L = this.lineups[off], D = this.lineups[def];
      const ev = [];
      let t = 0;
      const poss = {
        n: this.n++, off, period: this.period, clockStart: +this.clock.toFixed(2), clockEnd: 0,
        start: nx.start, startSpot: nx.spot || { x: 47, y: 25 }, play: 'none', setName: '', defScheme: this.defScheme[def], events: ev, endScore: null,
      };
      const push = (e) => { e.t = +Math.max(0, t).toFixed(2); ev.push(e); return e; };
      const name = (id) => { const p = this.ctx.players[id]; return p ? p.last : '?'; };
      if (this.chance(0.08)) { this.defScheme[def] = this.pick(SCHEMES); poss.defScheme = this.defScheme[def]; }

      // ---------------- start
      if (nx.start === 'jump_ball') {
        const hj = this.lineups[0][4], aj = this.lineups[1][4];
        const winner = this.chance(0.5) ? 0 : 1;
        const tipTo = this.lineups[winner][this.chance(0.5) ? 0 : 1];
        poss.off = winner;
        push({ type: 'jump_ball', jumpers: [hj, aj], winner, tipTo, team: winner, text: 'Jump ball: ' + name(hj) + ' vs ' + name(aj) + ', tipped to ' + name(tipTo) });
        return this.halfCourt(poss, winner, tipTo, 1.5, 'jump_ball');
      }
      // dead-ball starts: timeouts / subs
      const deadStart = ['made_basket', 'ft_made', 'dead_ball', 'period_start'].includes(nx.start);
      if (deadStart) {
        if (this.chance(0.07) && nx.start !== 'period_start') push({ type: 'timeout', team: this.chance(0.5) ? off : def, text: 'Timeout' });
        if (this.chance(nx.start === 'period_start' ? 0.8 : 0.3)) {
          const nSub = 1 + ((this.r() * (nx.start === 'period_start' ? 3 : 2)) | 0);
          for (let i = 0; i < nSub; i++) {
            const team = this.chance(0.5) ? 0 : 1;
            const slot = (this.r() * 5) | 0;
            const out = this.lineups[team][slot];
            const bi = (this.r() * this.benches[team].length) | 0;
            const inn = this.benches[team][bi];
            if (!inn || out === inn) continue;
            this.lineups[team][slot] = inn; this.benches[team][bi] = out;
            push({ type: 'sub', team, out, in: inn, text: name(inn) + ' checks in for ' + name(out) });
          }
        }
      }
      const Lo = this.lineups[off];
      if (nx.start === 'made_basket' || nx.start === 'ft_made') {
        t += this.between(1.6, 3.2);
        const by = Lo[3 + ((this.r() * 2) | 0)], to = Lo[this.chance(0.8) ? 0 : 1];
        const right = attacksRight(off, this.period);
        push({ type: 'inbound', team: off, by, to, spot: 'baseline', x: right ? -1 : 95, y: 25 + this.between(-6, 4), text: name(by) + ' inbounds to ' + name(to) });
        return this.halfCourt(poss, off, to, t, nx.start);
      }
      if (nx.start === 'dead_ball' || nx.start === 'period_start') {
        const by = Lo[this.chance(0.5) ? 1 : 2], to = Lo[0];
        const spot = nx.start === 'period_start' ? { x: 47, y: -1 } : (nx.spot || { x: 60, y: -1 });
        push({ type: 'inbound', team: off, by, to, spot: 'sideline', x: spot.x, y: spot.y < 25 ? -1 : 51, text: name(by) + ' inbounds to ' + name(to) });
        t += 0.3;
        return this.halfCourt(poss, off, to, t, nx.start);
      }
      // dreb / steal: ball is live with the rebounder
      const holder = nx.holder || Lo[0];
      return this.halfCourt(poss, off, holder, 0, nx.start);
    }

    halfCourt(poss, off, handler0, t0, start) {
      const ev = poss.events;
      const L = this.lineups[off], D = this.lineups[1 - off];
      let t = t0;
      const push = (e) => { e.t = +Math.max(0, t).toFixed(2); e.team = e.team == null ? off : e.team; ev.push(e); return e; };
      const name = (id) => { const p = this.ctx.players[id]; return p ? p.last : '?'; };
      const pg = L[0];
      let handler = handler0;
      const transition = (start === 'dreb' || start === 'steal') && this.chance(start === 'steal' ? 0.8 : 0.45);
      let play = this.forcePlay || (transition ? 'transition' : this.pick(PLAYS));
      if (play === 'transition' && !(start === 'dreb' || start === 'steal')) play = 'pnr';
      poss.play = play;
      poss.setName = this.pick(SETNAMES[play] || SETNAMES.none);
      const shotClockAt = (tt) => 24 - tt;
      // outlet after rebounds
      if ((start === 'dreb') && handler !== pg && this.chance(0.7)) {
        t += this.between(0.4, 1.0);
        push({ type: 'pass', from: handler, to: pg, kind: 'outlet', text: name(handler) + ' outlet to ' + name(pg) });
        handler = pg;
      }
      // advance
      t += play === 'transition' ? this.between(1.2, 2.2) : this.between(2.5, 4.5);
      push({ type: 'advance', handler, text: name(handler) + ' brings it up' });
      const pts = {};
      let shooter, zone, kind, passer = null, x, y;
      const others = L.filter((id) => id !== handler);
      if (play === 'transition') {
        t += this.between(1.0, 2.5);
        if (this.chance(0.5)) { shooter = handler; zone = 'rim'; kind = this.pick(['layup', 'layup', 'dunk', 'floater']); }
        else {
          const wing = this.pick(others);
          passer = handler;
          push({ type: 'pass', from: handler, to: wing, kind: this.pick(['chest', 'bounce', 'lob']), text: name(handler) + ' hits ' + name(wing) + ' ahead' });
          t += this.between(0.8, 1.4);
          shooter = wing; zone = this.chance(0.6) ? 'rim' : this.pick(['c3', 'ab3']);
          kind = zone === 'rim' ? this.pick(['layup', 'dunk', 'dunk', 'reverse']) : 'catch_shoot';
        }
      } else {
        t += this.between(1.5, 3.5);
        let screener = L[this.chance(0.7) ? 4 : 3];
        if (screener === handler) screener = L[screener === L[4] ? 3 : 4];
        const tgt = this.pick(others.filter((id) => id !== screener)) || others[0];
        push({ type: 'set', play, setName: poss.setName, handler, screener: (play === 'pnr' || play === 'offscreen' || play === 'handoff') ? screener : undefined, target: tgt, text: poss.setName });
        t += this.between(1.5, 3.5);
        if (play === 'pnr') {
          push({ type: 'screen', screener, user: handler, kind: 'ball', text: name(screener) + ' sets a screen for ' + name(handler) });
          t += this.between(0.5, 1.2);
          push({ type: 'move', player: handler, move: this.pick(['hesi', 'crossover', 'drive']), text: name(handler) + ' uses the screen' });
          t += this.between(0.8, 1.6);
          const r = this.r();
          if (r < 0.45) { shooter = handler; zone = this.pick(['mid', 'ab3', 'paint', 'rim']); kind = zone === 'rim' ? 'layup' : zone === 'paint' ? 'floater' : 'pullup'; }
          else if (r < 0.72) {
            passer = handler;
            push({ type: 'pass', from: handler, to: screener, kind: this.pick(['bounce', 'lob', 'chest']), text: name(handler) + ' finds ' + name(screener) + ' rolling' });
            t += this.between(0.5, 1.0);
            shooter = screener; zone = 'rim'; kind = this.pick(['dunk', 'layup', 'dunk']);
          } else {
            const sp = this.pick(others.filter((id) => id !== screener)) || others[0];
            passer = handler;
            push({ type: 'pass', from: handler, to: sp, kind: 'kick', text: name(handler) + ' kicks to ' + name(sp) });
            t += this.between(0.6, 1.2);
            shooter = sp; zone = this.pick(['c3', 'ab3', 'ab3']); kind = 'catch_shoot';
          }
        } else if (play === 'iso') {
          push({ type: 'move', player: handler, move: 'size_up', text: name(handler) + ' sizes up' });
          t += this.between(1.2, 2.5);
          const mv = this.pick(['crossover', 'btl', 'btb', 'jab', 'hesi', 'spin', 'stepback', 'drive']);
          push({ type: 'move', player: handler, move: mv, text: name(handler) + ' ' + mv });
          t += this.between(0.6, 1.4);
          shooter = handler;
          if (mv === 'stepback') { zone = this.pick(['ab3', 'mid']); kind = 'stepback'; }
          else if (mv === 'drive' || mv === 'spin') { zone = this.pick(['rim', 'paint']); kind = zone === 'rim' ? this.pick(['layup', 'reverse', 'dunk']) : 'floater'; }
          else { zone = this.pick(['mid', 'ab3', 'mid']); kind = this.pick(['pullup', 'fadeaway', 'jumper']); }
        } else if (play === 'post') {
          const post = L[this.chance(0.6) ? 4 : 3];
          if (handler !== L[1]) { push({ type: 'pass', from: handler, to: L[1], kind: 'chest', text: name(handler) + ' swings to ' + name(L[1]) }); handler = L[1]; t += this.between(0.8, 1.6); }
          push({ type: 'pass', from: handler, to: post, kind: 'entry', text: name(handler) + ' enters to ' + name(post) });
          passer = handler;
          t += this.between(0.8, 1.5);
          push({ type: 'move', player: post, move: 'backdown', text: name(post) + ' backs down' });
          t += this.between(1.2, 2.2);
          if (this.chance(0.75)) { shooter = post; zone = this.pick(['paint', 'rim', 'paint']); kind = zone === 'rim' ? this.pick(['layup', 'dunk']) : this.pick(['hook', 'fadeaway', 'jumper']); passer = null; }
          else {
            const sp = this.pick(L.filter((id) => id !== post));
            push({ type: 'pass', from: post, to: sp, kind: 'kick', text: name(post) + ' kicks out to ' + name(sp) });
            passer = post; t += this.between(0.6, 1.1);
            shooter = sp; zone = this.pick(['c3', 'ab3']); kind = 'catch_shoot';
          }
        } else if (play === 'handoff') {
          const big = L[4];
          if (handler !== big) { push({ type: 'pass', from: handler, to: big, kind: 'chest', text: name(handler) + ' to ' + name(big) }); t += this.between(0.8, 1.4); }
          const g = this.pick(L.slice(0, 3));
          push({ type: 'handoff', from: big, to: g, text: name(big) + ' hands off to ' + name(g) });
          handler = g; t += this.between(0.6, 1.3);
          shooter = g; zone = this.pick(['ab3', 'mid', 'rim']); kind = zone === 'rim' ? 'layup' : 'pullup'; passer = big;
        } else if (play === 'offscreen') {
          const sh = this.pick(L.slice(1, 3));
          push({ type: 'screen', screener, user: sh, kind: 'off_ball', text: name(screener) + ' screens for ' + name(sh) });
          t += this.between(0.6, 1.1);
          push({ type: 'pass', from: handler, to: sh, kind: 'chest', text: name(handler) + ' finds ' + name(sh) });
          passer = handler; t += this.between(0.5, 0.9);
          shooter = sh; zone = this.pick(['ab3', 'mid', 'c3']); kind = 'catch_shoot';
        } else if (play === 'cut') {
          const cutter = this.pick(others);
          push({ type: 'pass', from: handler, to: cutter, kind: this.pick(['bounce', 'lob']), text: name(handler) + ' finds ' + name(cutter) + ' cutting' });
          passer = handler; t += this.between(0.5, 0.9);
          shooter = cutter; zone = 'rim'; kind = this.pick(['layup', 'dunk', 'layup', 'alley']);
        } else { // spot / none: ball reversal
          const n = 1 + ((this.r() * 3) | 0);
          let cur = handler;
          for (let i = 0; i < n; i++) {
            const to = this.pick(L.filter((id) => id !== cur));
            push({ type: 'pass', from: cur, to, kind: this.pick(['chest', 'swing', 'bounce', 'overhead']), text: name(cur) + ' swings to ' + name(to) });
            passer = cur; cur = to; t += this.between(0.9, 1.8);
            if (i === 0 && this.chance(0.3)) { push({ type: 'move', player: cur, move: 'drive', text: name(cur) + ' drives' }); t += this.between(0.8, 1.2); }
          }
          shooter = cur; zone = this.pick(['c3', 'ab3', 'mid', 'ab3']); kind = 'catch_shoot';
        }
      }
      if (t > 23) t = 23;

      // ---------------- clock / period end check: squeeze the events into the time left
      const clockLeft = this.clock;
      if (t >= clockLeft - 0.5) {
        const room = Math.max(0, clockLeft - 0.6);
        const k = t > 0 ? Math.min(1, room / t) : 1;
        for (const e of ev) e.t = +(e.t * k).toFixed(2);
        t = room;
        if (clockLeft < 3) { shooter = handler; zone = 'ab3'; kind = 'pullup'; passer = null; }
      }

      // ---------------- outcome
      const r = this.r();
      if (r < 0.1 && !this.opts.noTurnovers) return this.turnover(poss, off, handler, passer, t);
      if (r < 0.14) {
        // non-shooting foul on the floor, then inbound and a quick shot
        const fouler = this.pick(D);
        const bonus = this.fouls[1 - off] >= 4;
        this.fouls[1 - off]++;
        push({ type: 'foul', fouler, on: handler, kind: 'personal', fts: bonus ? 2 : 0, team: 1 - off, text: 'Foul on ' + name(fouler) });
        if (bonus) return this.freeThrows(poss, off, handler, 2, t, 0);
        const spot = this.pt(off, 30, -1);
        push({ type: 'inbound', by: L[2], to: L[0], spot: 'sideline', x: spot.x, y: -1, text: name(L[2]) + ' inbounds' });
        t += this.between(2, 4);
        shooter = L[this.chance(0.5) ? 0 : 1]; zone = this.pick(['ab3', 'mid']); kind = 'pullup'; passer = null;
      }
      return this.shotOutcome(poss, off, shooter, zone, kind, passer, t, 0);
    }

    shotLoc(off, zone, kind) {
      let u, v;
      const three = this.ctx.threePt;
      if (zone === 'rim') { const a = this.between(-1.3, 1.3), d = kind === 'dunk' || kind === 'alley' || kind === 'tip' ? this.between(1.2, 2.6) : this.between(2.2, 4.0); u = 5.25 + Math.cos(a) * d; v = 25 + Math.sin(a) * d; }
      else if (zone === 'paint') { const a = this.between(-0.9, 0.9), d = this.between(6, 11); u = 5.25 + Math.cos(a) * d; v = 25 + Math.sin(a) * d; }
      else if (zone === 'mid') { const a = this.between(-1.2, 1.2), d = this.between(13, 19.5); u = 5.25 + Math.cos(a) * d; v = 25 + Math.sin(a) * d; }
      else if (zone === 'c3') { u = this.between(1.5, 8); v = this.chance(0.5) ? 25 - three.corner - this.between(0.3, 1.2) : 25 + three.corner + this.between(0.3, 1.2); }
      else { const a = this.between(-1.05, 1.05), d = three.arc + this.between(0.6, 3.5); u = 5.25 + Math.cos(a) * d; v = 25 + Math.sin(a) * d; }
      u = U.clamp(u, 0.8, 46); v = U.clamp(v, 1.2, 48.8);
      return this.pt(off, u, v);
    }

    shotOutcome(poss, off, shooter, zone, kind, passer, t, depth) {
      const ev = poss.events;
      const D = this.lineups[1 - off], L = this.lineups[off];
      const push = (e) => { e.t = +Math.max(0, t).toFixed(2); e.team = e.team == null ? off : e.team; ev.push(e); return e; };
      const name = (id) => { const p = this.ctx.players[id]; return p ? p.last : '?'; };
      const loc = this.shotLoc(off, zone, kind);
      const pts = (zone === 'c3' || zone === 'ab3') ? 3 : 2;
      const pMake = { rim: 0.62, paint: 0.44, mid: 0.41, c3: 0.39, ab3: 0.35 }[zone];
      const defender = D[L.indexOf(shooter) >= 0 ? L.indexOf(shooter) : 0];
      const contest = this.pick(['open', 'contested', 'contested', 'tight']);
      const gim = !this.opts.noGim && (this.n % this.gimEvery === 0) && depth === 0;
      const shot = push({
        type: 'shot', shooter, pts, zone, kind, x: +loc.x.toFixed(1), y: +loc.y.toFixed(1),
        contest, defender, assist: null, pending: false, blocked: false, blocker: null, fouled: false, fouler: null, andOne: false,
      });
      const dist = Math.round(Math.hypot(loc.x - (attacksRight(off, this.period) ? 88.75 : 5.25), loc.y - 25));
      if (gim) {
        shot.pending = true;
        delete shot.made; delete shot.blocked;
        shot.text = name(shooter) + ' rises for a ' + dist + '-ft ' + (pts === 3 ? 'three' : 'shot') + '...';
        this._pending = { poss, off, shooter, pts, zone, kind, passer, t, dist };
        poss.clockEnd = +Math.max(0, this.clock - t).toFixed(1);
        poss.endScore = this.score.slice();
        return poss;
      }
      return this.resolveShot(poss, shot, { off, shooter, pts, zone, kind, passer, t, dist }, this.r() < pMake, depth);
    }

    resolveShot(poss, shot, info, made, depth) {
      const ev = poss.events;
      const { off, shooter, pts, zone, kind, passer, dist } = info;
      let t = info.t;
      const D = this.lineups[1 - off], L = this.lineups[off];
      const push = (e) => { e.t = +Math.max(0, t).toFixed(2); e.team = e.team == null ? off : e.team; ev.push(e); return e; };
      const name = (id) => { const p = this.ctx.players[id]; return p ? p.last : '?'; };
      const fouled = this.chance(zone === 'rim' ? 0.13 : 0.05);
      const blocked = !made && !fouled && (zone === 'rim' || zone === 'paint') && this.chance(0.18);
      shot.made = made; shot.blocked = blocked; shot.pending = false;
      shot.blocker = blocked ? this.pick(D) : null;
      shot.fouled = fouled; shot.fouler = fouled ? shot.defender : null; shot.andOne = fouled && made;
      shot.assist = made && passer && this.chance(0.8) ? passer : null;
      shot.text = name(shooter) + (made ? ' makes ' : blocked ? ' is blocked on ' : ' misses ') + dist + '-ft ' + (pts === 3 ? 'three' : kind) + (shot.assist ? ' (' + name(shot.assist) + ' assists)' : '');
      if (made) this.score[off] += pts;
      if (fouled) {
        this.fouls[1 - off]++;
        push({ type: 'foul', fouler: shot.fouler, on: shooter, kind: 'shooting', fts: made ? 1 : pts, team: 1 - off, text: 'Shooting foul on ' + name(shot.fouler) });
        return this.freeThrows(poss, off, shooter, made ? 1 : pts, t, depth);
      }
      if (made) { this.endMade(poss, off, t, 'made_basket'); return poss; }
      // rebound
      t += zone === 'c3' || zone === 'ab3' ? this.between(1.4, 2.2) : this.between(0.9, 1.6);
      return this.reboundAfter(poss, off, t, depth, shot);
    }

    reboundAfter(poss, off, t, depth, shot) {
      const ev = poss.events;
      const D = this.lineups[1 - off], L = this.lineups[off];
      const push = (e) => { e.t = +Math.max(0, t).toFixed(2); e.team = e.team == null ? off : e.team; ev.push(e); return e; };
      const name = (id) => { const p = this.ctx.players[id]; return p ? p.last : '?'; };
      if (t >= this.clock - 0.1) { t = this.clock; return this.endPeriod(poss, off, t); }
      const rr = this.r();
      if (rr < 0.03) {
        push({ type: 'rebound', player: null, team: 1 - off, off: false, text: 'Team rebound' });
        this.endDead(poss, off, t, 1 - off, { x: 47, y: -1 });
        return poss;
      }
      if (rr < 0.27 && depth < 2) {
        const rb = L[this.chance(0.6) ? 4 : 3];
        push({ type: 'rebound', player: rb, team: off, off: true, text: name(rb) + ' offensive rebound' });
        if (this.chance(0.55)) {
          t += this.between(0.4, 0.9);
          return this.shotOutcome(poss, off, rb, 'rim', this.pick(['tip', 'layup', 'dunk']), null, t, depth + 1);
        }
        t += this.between(1.0, 2.0);
        push({ type: 'pass', from: rb, to: L[0], kind: 'kick', text: name(rb) + ' resets to ' + name(L[0]) });
        t += this.between(2.0, 4.0);
        const sh = this.pick(L);
        return this.shotOutcome(poss, off, sh, this.pick(['ab3', 'mid', 'c3']), 'catch_shoot', null, t, depth + 1);
      }
      const rb = D[this.chance(0.55) ? 4 : this.chance(0.5) ? 3 : 2];
      push({ type: 'rebound', player: rb, team: 1 - off, off: false, text: name(rb) + ' defensive rebound' });
      return this.finish(poss, t, { start: 'dreb', off: 1 - off, holder: rb, spot: null });
    }

    freeThrows(poss, off, shooter, n, t, depth) {
      const ev = poss.events;
      const push = (e) => { e.t = +Math.max(0, t).toFixed(2); e.team = e.team == null ? off : e.team; ev.push(e); return e; };
      const name = (id) => { const p = this.ctx.players[id]; return p ? p.last : '?'; };
      let lastMade = false;
      for (let i = 1; i <= n; i++) {
        const made = this.chance(0.77);
        if (made) this.score[off] += 1;
        push({ type: 'ft', shooter, made, num: i, of: n, text: name(shooter) + (made ? ' makes' : ' misses') + ' free throw ' + i + ' of ' + n });
        lastMade = made;
      }
      if (lastMade) { this.endMade(poss, off, t, 'ft_made'); return poss; }
      t += this.between(0.8, 1.4);
      return this.reboundAfter(poss, off, t, depth + 1, null);
    }

    turnover(poss, off, handler, passer, t) {
      const ev = poss.events;
      const D = this.lineups[1 - off], L = this.lineups[off];
      const push = (e) => { e.t = +Math.max(0, t).toFixed(2); e.team = e.team == null ? off : e.team; ev.push(e); return e; };
      const name = (id) => { const p = this.ctx.players[id]; return p ? p.last : '?'; };
      const kind = this.pick(['bad_pass', 'bad_pass', 'lost_ball', 'lost_ball', 'offensive_foul', 'travel', 'out_of_bounds', 'shot_clock', 'three_seconds']);
      let stealer = null;
      if ((kind === 'bad_pass' || kind === 'lost_ball') && this.chance(0.7)) stealer = this.pick(D);
      let who = handler;
      if (kind === 'shot_clock') t = Math.min(Math.max(t, 24), Math.max(0, this.clock - 0.5));
      if (kind === 'three_seconds') who = L[4];
      if (kind === 'offensive_foul') {
        push({ type: 'turnover', player: who, kind, stealer: null, text: 'Offensive foul on ' + name(who) });
        const fouler = D[L.indexOf(who) >= 0 ? L.indexOf(who) : 0];
        push({ type: 'foul', fouler: who, on: fouler, kind: 'offensive', fts: 0, team: off, text: 'Charge drawn by ' + name(fouler) });
      } else {
        push({ type: 'turnover', player: who, kind, stealer, text: name(who) + ' turnover (' + kind.replace('_', ' ') + ')' + (stealer ? ', stolen by ' + name(stealer) : '') });
      }
      if (stealer) return this.finish(poss, t, { start: 'steal', off: 1 - off, holder: stealer });
      return this.finish(poss, t, { start: 'dead_ball', off: 1 - off, spot: { x: this.pt(off, 25, -1).x, y: -1 } });
    }

    /** close a possession at game time t; if the period clock runs out, end with period_end */
    finish(poss, t, next) {
      poss.endScore = this.score.slice();
      if (t >= this.clock - 0.4) {
        poss.events.push({ type: 'period_end', t: +Math.max(t, this.clock).toFixed(2), text: 'End of period ' + this.period });
        poss.clockEnd = 0;
        this.clock = 0;
        this.newPeriod();
        return poss;
      }
      poss.clockEnd = +(this.clock - t).toFixed(2);
      this.clock = Math.max(0, this.clock - t);
      this.next = next;
      return poss;
    }
    endMade(poss, off, t, kind) { return this.finish(poss, t, { start: kind, off: 1 - off }); }
    endDead(poss, off, t, newOff, spot) { return this.finish(poss, t, { start: 'dead_ball', off: newOff, spot }); }
    endPeriod(poss, off, t) { return this.finish(poss, Math.max(t, this.clock), null); }
    newPeriod() {
      if (this.period >= 4 && this.score[0] !== this.score[1]) {
        // endless harness: start a new game
        this.period = 0; this.score = [0, 0];
        this.period++;
        this.clock = this.opts.periodLen || this.ctx.periodLen;
        this.fouls = [0, 0];
        this.next = { start: 'jump_ball', off: 0 };
        this.gameOver = true;
        return;
      }
      this.period++;
      const len = this.opts.periodLen || this.ctx.periodLen;
      this.clock = this.period > 4 ? Math.min(300, len) : len;
      this.fouls = [0, 0];
      if (this.period > 4) this.next = { start: 'jump_ball', off: 0 };
      else this.next = { start: 'period_start', off: this.period % 2 === 0 ? 1 : 0 };
    }

    /** harness GIM: fill in the pending shot and append follow-up events */
    resolvePending(poss, quality) {
      const P = this._pending;
      if (!P || P.poss !== poss) return;
      this._pending = null;
      const shot = poss.events[poss.events.length - 1];
      const pMake = quality == null ? 0.5 : quality;
      this.resolveShot(poss, shot, P, this.r() < pMake, 1);
    }
  }

  M.Mock = { makeContext, Game, attacksRight };
})();
