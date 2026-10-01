/* Pro BBALL Coach — the Media's words: every article written on demand from its data (PBC.Media.render). No DOM.
 *
 * Each kind of article has banks of headlines, decks and paragraphs; the writer's role gives the voice (the insider's
 * sources, the numbers columnist's stats, the columnist's takes, the senior writer's history, the beat writer's
 * locker room). The words are drawn from a stream seeded by the article id, so an article always reads the same.
 * Players get their pronouns from the player; coaches, owners and writers are named, never pronouned. */
(function () {
  'use strict';
  const PBC = (window.PBC = window.PBC || {});
  const U = PBC.U;
  const M = PBC.Media;
  if (!M) return;

  // ---------------------------------------------------------------------------
  // The writing desk: helpers for one article
  // ---------------------------------------------------------------------------
  function desk(S, a) {
    const R = M.makeRng(U.hash(`${S.saveId || 'save'}|art|${a.id}|${a.k}`));
    const w = M.writer(S, a.w) || { name: 'Staff report', outlet: 'The League Report', role: 'insider' };
    const used = new Set();
    const pick = arr => {
      const idx = [];
      for (let i = 0; i < arr.length; i++) if (!used.has(arr[i])) idx.push(i);
      const i = idx.length ? idx[Math.floor(R() * idx.length)] : Math.floor(R() * arr.length);
      used.add(arr[i]);
      return arr[i];
    };
    const fill = (s, v) => String(s).replace(/\{(\w+)\}/g, (m0, k) => (v && v[k] != null ? String(v[k]) : m0));
    const say = (bank, v) => fill(pick(bank), v);
    const T = tid => S.teams[tid] || null;
    const full = tid => (T(tid) ? `${T(tid).city} ${T(tid).name}` : 'the league');
    const nick = tid => (T(tid) ? T(tid).name : 'them');
    const city = tid => (T(tid) ? T(tid).city : '');
    const P = pid => (pid != null ? S.players[pid] : null);
    const pn = pid => (P(pid) ? PBC.Player.name(P(pid)) : 'a player');
    const ln = pid => (P(pid) ? P(pid).last : 'him');
    const f = pid => !!(P(pid) && P(pid).gender === 'f');
    const he = pid => (f(pid) ? 'she' : 'he'), He = pid => (f(pid) ? 'She' : 'He');
    const his = pid => (f(pid) ? 'her' : 'his'), His = pid => (f(pid) ? 'Her' : 'His'), him = pid => (f(pid) ? 'her' : 'him');
    const pos = pid => (P(pid) ? P(pid).pos : '');
    const f1 = x => (Math.round(x * 10) / 10).toFixed(1);
    const pct = x => (Math.round(x * 1000) / 10).toFixed(1) + '%';
    const ord = n => U.ordinal ? U.ordinal(n) : n + 'th';
    const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen'];
    const num = n => (n >= 0 && n < words.length ? words[n] : String(n));
    const Num = n => { const s = num(n); return s.charAt(0).toUpperCase() + s.slice(1); };
    const coach = tid => M.coachName(S, tid);
    const rec = (w2, l2) => `${w2}-${l2}`;
    const userT = S.userTid;
    const round = r => (PBC.League.roundName ? PBC.League.roundName(S, r) : 'Round ' + r);
    // a player's line this season
    const line = pid => { const p = P(pid); const s = p ? PBC.Stats.season(p, S.season, false) : null; return s && s.gp ? { ppg: s.pts / s.gp, rpg: (s.orb + s.drb) / s.gp, apg: s.ast / s.gp, gp: s.gp, fg: s.fga ? s.fgm / s.fga : 0, tp: s.tpa ? s.tpm / s.tpa : 0 } : null; };
    const lineTxt = pid => { const l = line(pid); return l ? `${f1(l.ppg)} points, ${f1(l.rpg)} rebounds and ${f1(l.apg)} assists a night` : ''; };
    const list = arr => (arr.length <= 1 ? arr.join('') : arr.length === 2 ? `${arr[0]} and ${arr[1]}` : `${arr.slice(0, -1).join(', ')} and ${arr[arr.length - 1]}`);
    const poss = s => s + (/s$/.test(s) ? '\'' : '\'s');
    return { S, a, R, w, role: w.role, pick, say, fill, full, nick, city, pn, ln, he, He, his, His, him, pos, f1, pct, ord, num, Num, coach, rec, userT, round, line, lineTxt, list, poss, P };
  }

  // the writer's voice: a closing paragraph by role and mood (+1 good news, -1 bad, 0 either)
  function voice(c, mood, v) {
    const banks = {
      insider: {
        1: ['Around the league, front offices have noticed. "That is a real problem for the rest of us," one rival executive said.', 'Scouts who have seen it up close are not calling it a fluke. "This is who they are now," one said.'],
        '-1': ['Rival executives are already circling. Per league sources, at least two teams have made calls to gauge the mood.', 'League sources describe a group that is searching for answers, and a front office that has started to ask questions.'],
        0: ['Per people around the league, nobody is reading too much into it yet. The next two weeks will say more.', 'The calls have started around the league. Whether anything comes of them is another matter.'],
      },
      numbers: {
        1: ['The underlying numbers back it up, which is the part that should worry everyone else.', 'Strip out the noise and the profile still holds: this is not shooting luck.'],
        '-1': ['The numbers say it is not just bad luck, and the numbers do not get tired of saying it.', 'Look past the record and it gets worse: they are being outscored by more than the record says.'],
        0: ['Small samples lie, but not forever. We will check back when there is more to measure.', 'Treat the early numbers with care. The trend line matters more than the dot.'],
      },
      columnist: {
        1: ['Say it with me: this is real. Stop waiting for the drop. It is not coming.', 'Everyone who wrote them off in October owes them an apology. I will go first.'],
        '-1': ['Somebody has to say it, so here it is: this is not a slump anymore. It is who they are.', 'Patience is a virtue. It is also, eventually, an excuse.'],
        0: ['Make of it what you will. I know what I make of it.', 'Remember this one. We will be talking about it in April.'],
      },
      oldschool: {
        1: ['The old heads will tell you this is how it starts. They are usually right.', 'It has the feel of something the league will remember. Those who were there will say so for years.'],
        '-1': ['Every franchise has these stretches. The good ones remember them as the moment they turned it around.', 'The game has a long memory for nights like this. So do the people who pay to watch it.'],
        0: ['There is a long season left, and a longer history behind it.', 'Seasons are long. Legacies are longer.'],
      },
      beat: {
        1: ['Inside the locker room, the mood has changed. The music is louder, the jokes are longer, and nobody wants to leave early.', 'You can feel it at shootaround: a group that expects to win now.'],
        '-1': ['The locker room was quiet afterward. A few players stayed at their stalls long after the media left.', 'Practice ran long the next day. Nobody had to explain why.'],
        0: ['Practice is at 11 tomorrow. We will be there.', 'The road trip starts this week. We will see what this group is made of.'],
      },
    };
    const b = (banks[c.role] || banks.insider)[String(mood)] || banks.insider[0];
    return c.say(b, v);
  }

  const out = (h, d, b) => ({ h, d, b: b.filter(Boolean) });
  const K = {};

  // ---------------------------------------------------------------------------
  // Nights, milestones, records
  // ---------------------------------------------------------------------------
  K.night = (c, d, a) => {
    const p = a.pid, opp = c.nick(d.opp), tm = c.nick(a.tid);
    const reb = d.reb, stat = `${d.pts} points${reb >= 10 ? `, ${reb} rebounds` : ''}${d.ast >= 10 ? ` and ${d.ast} assists` : ''}`;
    const v = { p: c.pn(p), last: c.ln(p), pts: d.pts, reb, ast: d.ast, opp, tm, score: d.score, fg: `${d.fgm}-of-${d.fga}`, tp: d.tpm, he: c.he(p), He: c.He(p), his: c.his(p), His: c.His(p), stat };
    const h = d.pts >= 60 ? c.say(['{last} drops {pts}', 'Sixty-plus: {last} goes off for {pts}', '{pts}. Write it down. {last} did that.'], v)
      : d.tpm >= 11 ? c.say(['{last} rains {tp} threes on the {opp}', 'From everywhere: {last} hits {tp} from deep'], v)
        : reb >= 20 ? c.say(['{last} owns the glass: {pts} and {reb}', 'A 20-20 night for {last}'], v)
          : d.ast >= 10 && reb >= 10 ? c.say(['{last} fills it up: {stat}', 'Triple-double, and then some, for {last}'], v)
            : c.say(['{last} erupts for {pts} against the {opp}', '{last} scores {pts} in a night to remember', 'The {last} show: {pts} points against the {opp}'], v);
    const dk = c.say(d.won ? ['{p} finished with {stat} as the {tm} beat the {opp} {score}.', 'The {tm} won {score}, and {p} was the reason: {stat}.'] : ['{p} had {stat}. It was not enough: the {opp} won {score}.', 'A monster line for {p} ({stat}) in a {score} loss to the {opp}.'], v);
    const b1 = c.say(['{p} went {fg} from the floor{tpTxt}{ftTxt}. {He} had the {opp} switching, doubling and finally just hoping.', '{He} shot {fg}{tpTxt}{ftTxt}, and by the fourth quarter the {opp} were sending two at {him} the moment {he} crossed half court.'], Object.assign({}, v, { him: c.him(p), tpTxt: d.tpm ? `, ${d.tpm} of ${d.tpa} from three` : '', ftTxt: d.fta ? ` and ${d.ftm} of ${d.fta} at the line` : '' }));
    const b2 = d.career ? c.say(['It is a career high for {last}, and it did not feel like a ceiling.', 'A new career high. {He} had never scored that many in a game, at any level of the pro game.'], v) : (c.line(p) ? `${c.He(p)} is averaging ${c.lineTxt(p)} this season.` : '');
    const b3 = d.po ? `In the playoffs, of all places. Nights like this are why the postseason gets remembered.` : voice(c, d.won ? 1 : 0, v);
    return out(h, dk, [b1, b2, b3]);
  };

  const STAT_WORD = { pts: 'points', ast: 'assists', reb: 'rebounds', tpm: 'threes', blk: 'blocks', stl: 'steals' };
  K.milestone = (c, d, a) => {
    const p = a.pid;
    const v = { p: c.pn(p), last: c.ln(p), n: d.v.toLocaleString('en-US'), label: d.label, age: d.age, tm: c.nick(a.tid), rank: d.rank ? c.ord(d.rank) : '', He: c.He(p), he: c.he(p), his: c.his(p) };
    const h = c.say(['{last} reaches {n} career {label}', '{n} {label}: {last} joins the club', 'Milestone night: {last} passes {n} {label}'], v);
    const dk = c.say(['{p} of the {tm} became the latest player to reach {n} career {label}{rankTxt}.', 'At {age}, {p} has {n} career {label}{rankTxt}.'], Object.assign({}, v, { rankTxt: d.rank ? `, ${v.rank} on the league's all-time list` : '' }));
    const b1 = d.rank && d.rank <= 10 ? c.say(['Only {k} players in league history have more. The ones ahead of {last} are the names on the banners.', 'That puts {last} {rank} all time. The list above {him} is short and famous.'], Object.assign({}, v, { k: c.num(d.rank - 1), him: c.him(p) }))
      : c.say(['It came quietly, the way milestones usually do, on an ordinary {play} in an ordinary game.', 'The crowd got the announcement during a timeout and stood up for it.'], Object.assign({}, v, { play: d.stat === 'pts' ? 'basket' : 'play' }));
    const b2 = c.say(['"I don\'t think about numbers," {last} said afterward. "But my mom does. She\'ll be happy."', '"Just means I\'ve been around a while," {last} said, smiling.', '"I\'m grateful," {last} said. "A lot of people helped me get here."'], v);
    return out(h, dk, [b1, b2, c.role === 'oldschool' ? voice(c, 1, v) : '']);
  };

  K.record = (c, d, a) => {
    const p = a.pid;
    const word = STAT_WORD[d.stat] || d.stat;
    const v = { p: c.pn(p), last: c.ln(p), v: d.v, word, tm: c.nick(a.tid), prev: d.prev ? d.prev.name : '', pv: d.prev ? d.prev.val : '', ps: d.prev ? U.seasonLabel(d.prev.season) : '' };
    const h = c.say(['History: {last} sets the league record with {v} {word}', 'The record falls: {v} {word} for {last}', '{last} breaks the single-game record'], v);
    const dk = c.say(['{p} of the {tm} had {v} {word}, the most in a game in league history.', 'No one in league history had ever had {v} {word} in a game. {p} just did.'], v);
    const b1 = d.prev ? c.say(['The old mark of {pv} belonged to {prev} ({ps}). It had stood as the standard since.', '{prev} had held the record with {pv} since {ps}.'], v) : '';
    const b2 = voice(c, 1, v);
    return out(h, dk, [b1, b2]);
  };

  // ---------------------------------------------------------------------------
  // Injuries
  // ---------------------------------------------------------------------------
  K.injury = (c, d, a) => {
    const p = a.pid;
    const wk = Math.max(1, Math.round(d.days / 7));
    const v = { p: c.pn(p), last: c.ln(p), tm: c.nick(a.tid), full: c.full(a.tid), inj: String(d.name || 'injury').toLowerCase(), wk: wk === 1 ? 'about a week' : `${c.num(wk)} weeks`, rec: c.rec(d.w, d.l), He: c.He(p), he: c.he(p), his: c.his(p), coach: c.coach(a.tid) };
    const h = c.say(['{last} out {wk} with a {inj}', 'Blow for the {tm}: {last} sidelined {wk}', '{tm} lose {last} to a {inj}'], v);
    const dk = c.say(['{p} will miss {wk} with a {inj}. The {tm} are {rec}.', 'The {full} will be without {p} for {wk}.'], v);
    const b1 = c.line(p) ? `${c.He(p)} is averaging ${c.lineTxt(p)}. Those minutes and those shots have to go somewhere now.` : '';
    const b2 = c.say(['{coach} did not sound worried, or at least did not let it show: "Next man up. We\'ve got guys ready."', 'The question in {city} is simple: who takes the big shots now?', 'How the {tm} hold up over the next {wk} may decide where they finish.'], Object.assign({}, v, { city: c.city(a.tid) }));
    return out(h, dk, [b1, b2, c.role === 'insider' ? voice(c, -1, v) : '']);
  };
  K.injury_back = (c, d, a) => {
    const p = a.pid;
    const v = { p: c.pn(p), last: c.ln(p), tm: c.nick(a.tid), w: d.w, l: d.l, n: d.games, He: c.He(p) };
    const good = d.w >= d.l;
    const h = c.say(good ? ['{last} returns to a team that held the fort', 'The {tm} went {w}-{l} without {last}. Now {last} is back'] : ['{last} is back, and the {tm} need it: {w}-{l} without', 'Without {last}, the {tm} went {w}-{l}. Help has arrived'], v);
    const dk = c.say(['{p} is cleared to return after missing {n} games.', 'After {n} games out, {p} is back in the lineup.'], v);
    const b1 = good ? c.say(['The supporting cast did more than survive. That depth will matter in April.', 'The scare turned into an audition, and several role players passed it.'], v) : c.say(['The {tm} found out the hard way how much {last} means to them.', 'The stretch without {last} showed how thin the margins are.'], v);
    return out(h, dk, [b1]);
  };

  // ---------------------------------------------------------------------------
  // Streaks, hot hands, slumps
  // ---------------------------------------------------------------------------
  K.streak_w = (c, d, a) => {
    const v = { tm: c.nick(a.tid), full: c.full(a.tid), n: d.n, N: c.Num(d.n), nw: c.num(d.n), rec: c.rec(d.w, d.l), coach: c.coach(a.tid) };
    const h = d.again ? c.say(['{N} straight: the {tm} cannot be stopped', 'The streak hits {n}', '{N} in a row, and counting'], v) : c.say(['The {tm} have won {nw} straight', 'Hot streak: {tm} reel off {n} in a row', '{N} straight wins for the {full}'], v);
    const dk = d.best ? c.say(['At {rec}, the {tm} are the hottest team in the league.', 'The {full} are {rec} and have not lost in {nw} games.'], v) : c.say(['The {full} are {rec} and rolling.', 'The {full} are {rec} and have not lost in {nw} games.'], v);
    const b1 = c.say(['They have won close games and blowouts, at home and on the road. The common thread is a defense that has not blinked.', 'It started quietly. It is not quiet anymore: the {tm} have won {nw} in a row, and the building is sold out again.', 'Ask the players and they will tell you nothing has changed. Ask the opponents and they will tell you everything has.'], v);
    const b2 = c.say(['"We\'re not thinking about the streak," {coach} said. "We\'re thinking about Thursday."', '{coach} has kept the message simple: one game, then the next one.'], v);
    return out(h, dk, [b1, b2, voice(c, 1, v)]);
  };
  K.streak_l = (c, d, a) => {
    const v = { tm: c.nick(a.tid), full: c.full(a.tid), n: d.n, N: c.Num(d.n), nw: c.num(d.n), rec: c.rec(d.w, d.l), coach: c.coach(a.tid) };
    const h = d.again ? c.say(['{N} straight losses and no end in sight for the {tm}', 'The skid reaches {n}'] , v) : c.say(['The {tm} have lost {nw} straight', 'Free fall: {tm} drop {n} in a row', 'What is wrong with the {tm}?'], v);
    const dk = c.say(['At {rec}, the {full} are searching for answers.', 'The {tm} are {rec} and have not won in {nw} games.'], v);
    const b1 = c.say(['The losses have come every way: blown leads, cold shooting, fourth quarters that slip away possession by possession.', 'The defense has not held anyone under 110 in a week, and the offense has stopped moving the ball when it matters.', 'It is the kind of stretch that tests a locker room, and this one is being tested.'], v);
    const b2 = c.say(['"We\'ll get out of it," {coach} said. "We have to want it more than we\'ve shown."', '{coach} called a players-only meeting. The players called it productive. The scoreboard has yet to agree.'], v);
    return out(h, dk, [b1, b2, voice(c, -1, v)]);
  };
  K.streak_w_end = (c, d, a) => {
    const v = { tm: c.nick(a.tid), n: d.n, nw: c.num(d.n), opp: c.nick(d.opp) };
    return out(c.say(['The {opp} end the {tm}\' {n}-game streak', 'Streak over: {tm} fall to the {opp}'].map(x => x.replace('{tm}\'', c.poss(v.tm))), v), c.say(['The {tm} had won {nw} straight. The {opp} did not care.'], v), [voice(c, 0, v)]);
  };
  K.streak_l_end = (c, d, a) => {
    const v = { tm: c.nick(a.tid), n: d.n, nw: c.num(d.n), opp: c.nick(d.opp) };
    return out(c.say(['Finally: the {tm} snap their {n}-game skid', 'The {tm} win one, and breathe'], v), c.say(['After {nw} straight losses, the {tm} beat the {opp}.'], v), [c.say(['Nobody in the locker room pretended it fixed everything. Nobody pretended it did not feel good, either.', 'One win does not make a season. It does make a better flight home.'], v)]);
  };
  K.hot = (c, d, a) => {
    const p = a.pid;
    const v = { p: c.pn(p), last: c.ln(p), tm: c.nick(a.tid), pts5: d.pts5, ppg: d.ppg, fg: c.pct(d.fg), tpm: d.tpm, He: c.He(p), he: c.he(p), his: c.his(p) };
    const h = c.say(['{last} is on fire', 'Nobody can guard {last} right now', '{last} has found another gear'], v);
    const dk = c.say(['{p} is averaging {pts5} points over the last five games, up from {ppg} on the season.', 'Five games, {pts5} points a night, {fg} from the field: {p} is cooking.'], v);
    const b1 = c.say(['{He} is getting to {his} spots earlier in the clock, and the {tm} have started running more for {him}.', 'It is not just the volume. {He} is shooting {fg} over the stretch, with {tpm} threes.'], Object.assign({}, v, { him: c.him(p) }));
    return out(h, dk, [b1, voice(c, 1, v)]);
  };
  K.cold = (c, d, a) => {
    const p = a.pid;
    const v = { p: c.pn(p), last: c.ln(p), tm: c.nick(a.tid), fg: c.pct(d.fg), sfg: c.pct(d.sfg), pts5: d.pts5, ppg: d.ppg, He: c.He(p), he: c.he(p), his: c.his(p) };
    const h = c.say(['{last} is stuck in a slump', 'What is going on with {last}?', 'The rim has a lid on it for {last}'], v);
    const dk = c.say(['{p} is shooting {fg} over the last five games, well under {sfg} on the season.', 'Five games, {fg} from the floor: {p} cannot find it.'], v);
    const b1 = c.say(['The shots are the same shots. They are just not falling, and {he} has started pressing.', 'Defenses are crowding {his} drives and daring {him} to beat them from outside. So far {he} has not.'], Object.assign({}, v, { him: c.him(p) }));
    return out(h, dk, [b1, voice(c, -1, v)]);
  };

  // ---------------------------------------------------------------------------
  // The weekly pieces
  // ---------------------------------------------------------------------------
  function prLine(c, x, n) {
    const tm = c.nick(x.tid);
    const mv = x.prev == null ? '' : x.prev > x.r ? ` (up ${x.prev - x.r})` : x.prev < x.r ? ` (down ${x.r - x.prev})` : '';
    const star = PBC.League.roster(c.S, x.tid)[0];
    const sl = star ? c.line(star.id) : null;
    const v = { tm, star: star ? star.last : 'the stars', ppg: sl ? c.f1(sl.ppg) : '', sk: Math.abs(x.sk), diff: x.diff > 0 ? '+' + x.diff : String(x.diff) };
    let note;
    if (x.sk >= 4) note = c.say(['Winners of {sk} straight.', '{sk} in a row and rolling.'], v);
    else if (x.sk <= -4) note = c.say(['Lost {sk} straight.', '{sk} straight losses and counting.'], v);
    else if (x.r <= 3) note = c.say(['The standard. {star} ({ppg} a night) is playing like an MVP.', 'Point differential of {diff} a night. That is not luck.', 'Nobody has found the answer for {star} yet.'], v);
    else if (x.r <= 10) note = c.say(['Good, maybe very good. The next month will tell.', '{star} carries them, and some nights that is enough.', 'A {diff} point differential says they are better than their record.'], v);
    else if (x.r <= 20) note = c.say(['Stuck in the middle, which is the hardest place to be.', 'Too good to tank, not good enough to scare anyone yet.', 'A run would change everything. So far, no run.'], v);
    else note = c.say(['The lottery balls are already warming up.', 'Patience, development, and a lot of losses.', 'Somewhere a scout is watching a college game for them.'], v);
    return `${x.r}. ${c.full(x.tid)} (${x.w}-${x.l})${mv}: ${note}`;
  }
  K.rankings = (c, d) => {
    const top = d.list[0];
    const v = { wk: d.week, tm: c.nick(top.tid) };
    const climber = U.maxBy(d.list.filter(x => x.prev != null), x => x.prev - x.r);
    const faller = U.minBy(d.list.filter(x => x.prev != null), x => x.prev - x.r);
    const h = c.say(['Power rankings, week {wk}: the {tm} on top', 'Week {wk} power rankings', 'Power rankings: who is for real in week {wk}?'], v);
    const dk = climber && climber.prev - climber.r >= 3 ? `The ${c.nick(climber.tid)} climb ${climber.prev - climber.r} spots${faller && faller.prev - faller.r <= -3 ? `; the ${c.nick(faller.tid)} tumble ${faller.r - faller.prev}` : ''}.` : `The ${c.nick(top.tid)} hold the top spot.`;
    return out(h, dk, d.list.map(x => prLine(c, x)));
  };
  K.ladder = (c, d) => {
    const L = d.mvp;
    if (!L.length) return out('The award races', '', []);
    const lead = L[0];
    const moved = d.prevMvp && d.prevMvp[0] !== lead.pid;
    const v = { last: c.ln(lead.pid), p: c.pn(lead.pid), tm: c.nick(lead.tid), ppg: c.f1(lead.ppg), rpg: c.f1(lead.rpg), apg: c.f1(lead.apg) };
    const h = moved ? c.say(['MVP ladder: {last} takes over the top spot', 'A new name atop the MVP ladder: {last}'], v) : c.say(['MVP ladder: {last} still leads the way', 'The award races: {last} holds on', 'MVP ladder: is anyone catching {last}?'], v);
    const dk = `${v.p} (${v.tm}) leads at ${v.ppg} points, ${v.rpg} rebounds and ${v.apg} assists a night.`;
    const rows = ['MVP: ' + L.slice(0, 10).map((x, i) => `${i + 1}. ${c.pn(x.pid)} (${c.nick(x.tid)}, ${c.f1(x.ppg)}/${c.f1(x.rpg)}/${c.f1(x.apg)})`).join('; ') + '.'];
    if (d.roy && d.roy.length) rows.push('Rookie of the Year: ' + d.roy.map((x, i) => `${i + 1}. ${c.pn(x.pid)} (${c.nick(x.tid)}, ${c.f1(x.ppg)} ppg)`).join('; ') + '.');
    if (d.dpoy && d.dpoy.length) rows.push('Defensive Player of the Year: ' + d.dpoy.map((x, i) => `${i + 1}. ${c.pn(x.pid)} (${c.nick(x.tid)})`).join('; ') + '.');
    if (d.smoy && d.smoy.length) rows.push('Sixth Man: ' + d.smoy.map((x, i) => `${i + 1}. ${c.pn(x.pid)} (${c.nick(x.tid)}, ${c.f1(x.ppg)} ppg)`).join('; ') + '.');
    if (d.coy && d.coy.length) rows.push('Coach of the Year: ' + d.coy.map((x, i) => `${i + 1}. ${c.coach(x.tid)} (${c.nick(x.tid)}, ${x.w}-${x.l}${x.proj != null ? `, picked for ${x.proj} wins` : ''})`).join('; ') + '.');
    return out(h, dk, rows);
  };
  K.mvp_flip = (c, d) => {
    const v = { now: c.pn(d.now.pid), nl: c.ln(d.now.pid), was: c.pn(d.was.pid), wl: c.ln(d.was.pid), tm: c.nick(d.now.tid), ppg: c.f1(d.now.ppg) };
    return out(c.say(['{nl} is the new MVP favorite', 'Move over, {wl}: {nl} leads the MVP race', 'The MVP race has a new leader'], v),
      c.say(['{now} has passed {was} at the top of the MVP race.', 'With {ppg} points a night and a winning team behind {pr}, {now} has taken over.'].map(x => x.replace('{pr}', c.him(d.now.pid))), v),
      [c.say(['It is a race now. It was not two weeks ago.', '{wl} still has the résumé. {nl} has the momentum, and voters remember the last month best.'], v), voice(c, 0, v)]);
  };
  K.rumors = (c, d) => {
    const v = { left: d.left };
    const h = d.left <= 10 && d.left > 0 ? c.say(['Rumor mill: {left} days to the deadline', 'Deadline watch: what we are hearing'], v) : c.say(['The rumor mill', 'Trade talk: who is available, who is buying', 'What we are hearing around the league'], v);
    const rows = d.list.map(x => {
      const p = x.pid;
      const buyers = (x.buyers || []).map(t => c.nick(t));
      const w = { p: c.pn(p), last: c.ln(p), tm: c.nick(x.tid), pos: c.pos(p), b: buyers.length ? c.list(buyers.map(b => 'the ' + b)) : 'contenders', he: c.he(p), his: c.his(p) };
      if (x.why === 'request') return c.say(['{p} ({tm}): the trade request is real, and so is the market. Per sources, {b} have checked in.', '{p} wants out of {city}. The {tm} want a lot. Watch {b}.'].map(s => s.replace('{city}', c.city(x.tid))), w);
      if (x.why === 'seller') return c.say(['{p} ({tm}): the {tm} are listening on their veterans, and {last} is the prize. {b} make sense.', 'Rebuilding teams sell, and the {tm} are rebuilding. {p} could be the biggest name moved.'], w);
      return c.say(['{p} ({tm}) is in the last year of {his} deal. If the {tm} fade, {b} will call.', 'Contract year for {p}. A team like {b} could use a {pos} like {last}.'], w);
    });
    const dk = d.list[0] ? `${c.pn(d.list[0].pid)} leads the list.` : '';
    return out(h, dk, rows);
  };

  // ---------------------------------------------------------------------------
  // Surprises, disappointments, hot seats, the races
  // ---------------------------------------------------------------------------
  K.surprise = (c, d, a) => {
    const v = { tm: c.nick(a.tid), full: c.full(a.tid), rec: c.rec(d.w, d.l), proj: d.proj, pace: d.pace, star: a.pid != null ? c.pn(a.pid) : 'the stars', coach: c.coach(a.tid) };
    return out(c.say(['Believe it: the {tm} are for real', 'Nobody saw the {tm} coming', 'The surprise of the season: the {full}'], v),
      c.say(['Picked for {proj} wins, the {tm} are on pace for {pace}.', 'At {rec}, the {full} are blowing past every preseason projection.'], v),
      [c.say(['The preseason magazines had them in the lottery conversation. The standings have them somewhere much nicer.', '{coach} has them defending, sharing the ball and closing games. That travels.'], v), voice(c, 1, v)]);
  };
  K.flop = (c, d, a) => {
    const v = { tm: c.nick(a.tid), full: c.full(a.tid), rec: c.rec(d.w, d.l), proj: d.proj, pace: d.pace, star: a.pid != null ? c.pn(a.pid) : 'the stars', coach: c.coach(a.tid) };
    return out(c.say(['What happened to the {tm}?', 'The {tm} are the season\'s biggest disappointment', 'Picked to contend, the {tm} are sinking'], v),
      c.say(['Projected for {proj} wins, the {full} are on pace for {pace}.', 'At {rec}, the {tm} are nowhere near where anyone expected.'], v),
      [c.say(['The talent is still there on paper. Paper does not play defense.', 'Injuries explain some of it. They do not explain all of it, and the questions are getting louder.'], v), voice(c, -1, v)]);
  };
  K.hot_seat = (c, d, a) => {
    const v = { tm: c.nick(a.tid), full: c.full(a.tid), rec: c.rec(d.w, d.l), proj: d.proj, coach: d.coach || c.coach(a.tid), city: c.city(a.tid) };
    const h = d.user ? c.say(['Is {coach} coaching for {pr} job?', 'The heat is on {coach}', 'How much longer for {coach} in {city}?'].map(x => x.replace(' {pr}', ' a')), v) : c.say(['{coach} is on the hot seat', 'The clock is ticking on {coach}', 'Change could be coming in {city}'], v);
    const dk = c.say(['The {tm} are {rec}, far from the {proj} wins they were picked for.', 'At {rec}, the {full} have the owner asking questions.'], v);
    const b1 = d.user ? c.say(['Per people close to the owner, patience is running thin. The next stretch of games matters.', 'The owner has not said anything publicly. Owners rarely do, until they do.'], v) : c.say(['Per league sources, ownership has started quietly gauging the coaching market.', 'Nobody in the front office will say it out loud. Everyone around the league is saying it anyway.'], v);
    return out(h, dk, [b1, voice(c, -1, v)]);
  };
  K.race = (c, d) => {
    const conf = d.confName ? `the ${d.confName}` : 'the league';
    const rows = d.bubble.map(x => `${x.seed}. ${c.full(x.tid)} (${x.w}-${x.l})`);
    const v = { conf, a: d.bubble[2] ? c.nick(d.bubble[2].tid) : '', b: d.bubble[4] ? c.nick(d.bubble[4].tid) : '' };
    return out(c.say(['The race for the play-in in {conf}', 'Bubble watch: {conf}\'s scramble', 'Down the stretch: who gets in out of {conf}?'], v),
      c.say(['With weeks to go, the {a} and the {b} are separated by a few games, and every night moves the line.', 'Six teams, four spots that matter, and not much time.'], v),
      [rows.join('; ') + '.', c.say(['Tiebreakers will decide at least one of these spots. Somebody is going to be furious about it.', 'Check the schedule: the teams with the softest finish have a real edge.'], v)]);
  };
  K.tank = (c, d) => {
    const rows = d.list.map((x, i) => `${i + 1}. ${c.full(x.tid)} (${x.w}-${x.l})`);
    const v = { a: c.nick(d.list[0].tid) };
    return out(c.say(['The race to the bottom', 'Lottery watch: the worst records in the league', 'Ping-pong season is coming'], v),
      c.say(['Nobody admits to tanking. The {a} are not admitting anything either.', 'The draft is months away, but the standings at the bottom already matter.'], v),
      [rows.join('; ') + '.', voice(c, 0, v)]);
  };

  // ---------------------------------------------------------------------------
  // Your beat writer
  // ---------------------------------------------------------------------------
  K.beatnote = (c, d, a) => {
    const tm = c.nick(a.tid);
    const v = { tm, rec: c.rec(d.w, d.l), seed: d.seed ? c.ord(d.seed) : '', lead: d.lead ? c.pn(d.lead.pid) : '', ppg: d.lead ? c.f1(d.lead.ppg) : '', coach: c.coach(a.tid), sk: Math.abs(d.sk || 0) };
    const h = c.say(['Notebook: where the {tm} stand at {rec}', 'The {tm} at {rec}: what we have learned', 'Inside the {tm}: a {rec} check-in'], v);
    const dk = d.seed ? `The ${tm} sit ${v.seed} in the standings.` : `The ${tm} are ${v.rec}.`;
    const paras = [];
    if (d.lead) paras.push(c.say(['{lead} leads the way at {ppg} points a night, and the offense still runs through {pr} in the fourth quarter.', 'Start with {lead}: {ppg} points a night and the trust of the coaching staff.'].map(x => x.replace('{pr}', c.him(d.lead.pid))), v));
    if (d.chem != null) paras.push(d.chem >= 66 ? c.say(['The room is as good as it has been in years. Players hang around after practice; the bench celebrates like the starters.', 'Chemistry is not a stat, but you can see it here: the extra pass, the help defense, the bench on its feet.'], v)
      : d.chem < 40 ? c.say(['Behind the scenes, things are tense. Not every conversation in this locker room is a friendly one right now.', 'The body language has not been great. Some of the frustration has spilled into practice.'], v)
        : c.say(['The locker room is fine: not a problem, not a strength yet.', 'Nobody is complaining publicly. Nobody is celebrating either.'], v));
    if (d.hurt && d.hurt.length) paras.push(`On the injury report: ${c.list(d.hurt.map(id => c.pn(id)))}.`);
    if (d.req && d.req.length) paras.push(`${c.pn(d.req[0])}'s trade request is still the elephant in the room.`);
    if (d.mood) paras.push(/Thrilled|Pleased/.test(d.mood) ? 'Upstairs, the owner is happy, which in this business is the most important review of all.' : /Concerned|Furious/.test(d.mood) ? 'Upstairs, the owner is not happy. Everyone in the building knows it.' : 'Upstairs, the owner is watching closely and saying little.');
    if (d.media != null) paras.push(d.media >= 62 ? `${v.coach} has been open with us all season, and it shows in how this team is covered.` : d.media <= 38 ? `${v.coach} has not made this an easy team to cover, and the relationship with the press has gone cold.` : '');
    return out(h, dk, paras);
  };

  // ---------------------------------------------------------------------------
  // Trades and requests
  // ---------------------------------------------------------------------------
  const gradeOf = g => (g >= 6 ? 'A' : g >= 3 ? 'A-' : g >= 1.5 ? 'B+' : g >= 0.3 ? 'B' : g >= -0.5 ? 'B-' : g >= -1.5 ? 'C+' : g >= -3 ? 'C' : g >= -6 ? 'D' : 'F');
  K.trade = (c, d, a) => {
    const [A, B] = a.tids;
    const names = i => (d.give[i].names || []);
    const v = { a: c.nick(A), b: c.nick(B), fa: c.full(A), fb: c.full(B), ga: c.list(names(0)) || 'nothing', gb: c.list(names(1)) || 'nothing', A: gradeOf(d.grade[0]), B: gradeOf(d.grade[1]) };
    const star = a.pid != null ? c.pn(a.pid) : null;
    const h = star ? c.say([`${star} traded to the {to}`, `Blockbuster: ${star} is on the move`, `The {to} land ${star}`].map(x => x.replace('{to}', d.give[0].pids.includes(a.pid) ? v.b : v.a)), v) : c.say(['The {a} and {b} make a deal', 'Trade: {a} and {b} swap pieces'], v);
    const dk = `The ${v.fa} send ${v.ga} to the ${v.fb} for ${v.gb}.`;
    const b1 = c.say(['Per league sources, talks picked up in the last 48 hours and moved fast once both sides agreed on the money.', 'Sources say the deal came together quickly, with both front offices eager to get it done.', 'It had been discussed for weeks, per people familiar with the talks. It got done this morning.'], v);
    const b2 = `Grades: ${v.a} ${v.A}, ${v.b} ${v.B}. ${d.grade[0] > d.grade[1] + 2 ? `The ${v.a} won this one, on paper.` : d.grade[1] > d.grade[0] + 2 ? `The ${v.b} won this one, on paper.` : 'A fair deal, which is rarer than it sounds.'}`;
    const b3 = d.deadline ? 'A deadline deal, with all the urgency that implies.' : voice(c, 0, v);
    return out(h, dk, [b1, b2, b3]);
  };
  const WHY = { minutes: 'unhappy with his role', losing: 'tired of losing', promise: 'convinced the team broke a promise', unhappy: 'unhappy with his situation' };
  K.request = (c, d, a) => {
    const p = a.pid;
    const why = (WHY[d.why] || WHY.unhappy).replace('his', c.his(p));
    const v = { p: c.pn(p), last: c.ln(p), tm: c.nick(a.tid), full: c.full(a.tid), why, age: d.age, city: c.city(a.tid), He: c.He(p), he: c.he(p) };
    const h = c.say(['{last} requests a trade', '{last} wants out of {city}', 'Trade request: {last} asks the {tm} to move {pr}'].map(x => x.replace('{pr}', c.him(p))), v);
    const dk = c.say(['{p} has asked the {full} for a trade, {why}.', 'Per sources, {p} wants a fresh start: {he} is {why}.'], v);
    const b1 = c.say(['The {tm} have no obligation to grant it, and their first call will be to try to repair the relationship.', 'Requests like this rarely go back in the bottle. The {tm} now have to decide whether to wait for the best offer or the first good one.'], v);
    const b2 = c.line(p) ? `${c.He(p)} is averaging ${c.lineTxt(p)}.` : '';
    return out(h, dk, [b1, b2, voice(c, 0, v)]);
  };

  // what you said at the podium (the Desk)
  K.quote = (c, d, a) => {
    const coach = c.coach(a.tid), tm = c.nick(a.tid);
    const v = { coach, tm, opp: d.opp != null ? c.nick(d.opp) : 'them' };
    const Q = {
      boast: [['{coach}: "We\'re the team to beat"', 'Bold words from {coach}'], ['{coach} did not hedge after the win: the {tm} are the team to beat. Now they have to prove it.'], ['It is the kind of quote that ends up on a locker room wall somewhere else.']],
      guarantee: [['{coach} guarantees a win over the {opp}', 'The guarantee'], ['{coach} said the {tm} would beat the {opp}. Not hoped. Said.'], ['Guarantees age fast. This one has about a day to age well.']],
      refs: [['{coach} unloads on the officials', '{coach} blasts the refs'], ['{coach} was not happy with the whistle, and said so at length. A fine is expected.'], ['The fans loved it. The league office did not.']],
      callout: [['{coach} calls out the {tm}', '"The effort wasn\'t there": {coach} goes public'], ['{coach} questioned the effort after the loss, in public, with the cameras rolling.'], ['How the room responds will say a lot about this group.']],
      mine: [['{coach}: "That\'s on me"', '{coach} takes the blame'], ['After the loss, {coach} pointed the finger in one direction: at the head coach.'], ['Players noticed. Coaches who protect their teams usually get it back.']],
      credit: [['{coach} tips the cap', '"They were better tonight"'], ['{coach} credited the opponent after the loss. No excuses, no officials, no injuries.'], ['Classy, and probably smart.']],
      star: [['{coach} on {pl}: "Special"', 'High praise from {coach}'], ['{coach} saved the biggest compliments for {pl}.'], ['It is not often a coach gushes like that in public. It said something.']],
      role: [['{coach} credits the bench', 'The unsung heroes'], ['{coach} spent the postgame talking about the role players, not the stars.'], ['The bench has been carrying more than its share. It is nice to hear someone say so.']],
      humble: [['{coach}: one game at a time', 'No victory laps for {coach}'], ['{coach} would not take the bait after the win.'], ['Boring? Maybe. Effective? Usually.']],
    };
    const q = Q[d.kind] || Q.humble;
    if (d.pid != null) v.pl = c.pn(d.pid);
    return out(c.say(q[0], v), c.say(q[1], v), [c.say(q[2], v)]);
  };

  // ---------------------------------------------------------------------------
  // The season's moments
  // ---------------------------------------------------------------------------
  K.allstar = (c, d) => {
    const snub = d.snubs[0];
    const v = { s: snub ? c.pn(snub.pid) : '', sl: snub ? c.ln(snub.pid) : '', stm: snub ? c.nick(snub.tid) : '', ppg: snub ? c.f1(snub.ppg) : '', n: d.n, star: d.starters[0] != null ? c.pn(d.starters[0]) : '' };
    return out(c.say(['All-Star rosters: the picks and the snubs', 'The biggest All-Star snub: {sl}', 'All-Stars are in. So are the complaints'], v),
      c.say(['{n} players made it. {s} of the {stm} did not, at {ppg} a night.', 'The rosters are set, headlined by {star}. The snubs are where the conversation is.'], v),
      [d.snubs.length ? 'Left off: ' + d.snubs.map(x => `${c.pn(x.pid)} (${c.nick(x.tid)}, ${c.f1(x.ppg)} ppg)`).join(', ') + '.' : '', voice(c, 0, v)]);
  };
  K.deadline = (c, d) => {
    const v = { n: d.n };
    const rows = d.deals.map(x => `${c.nick(x.tids[0])} and ${c.nick(x.tids[1])}: ${c.list(x.names[0] || [])} for ${c.list(x.names[1] || [])}.`);
    return out(d.n ? c.say(['Deadline day: winners and losers', 'The deadline has passed: {n} deals in the final days'], v) : c.say(['A quiet deadline', 'The deadline passes without a splash'], v),
      d.n ? c.say(['Rosters are set for the stretch run. Here is what changed.', 'The phones went quiet at the buzzer. Here is what got done.'], v) : 'Rosters are set for the stretch run, and they look a lot like they did a week ago.',
      rows.concat([voice(c, 0, v)]));
  };
  const AW = { mvp: 'MVP', roy: 'Rookie of the Year', dpoy: 'Defensive Player of the Year', smoy: 'Sixth Man of the Year', mip: 'Most Improved Player' };
  K.awards_pre = (c, d) => {
    const v = { mvp: d.mvp != null ? c.pn(d.mvp) : '', ml: d.mvp != null ? c.ln(d.mvp) : '' };
    const rows = Object.keys(AW).filter(k => d[k] != null).map(k => `${AW[k]}: ${c.pn(d[k])} (${c.nick(c.P(d[k]) ? c.P(d[k]).tid : -1)}).`);
    if (d.coy != null) rows.push(`Coach of the Year: ${c.coach(d.coy)} (${c.nick(d.coy)}).`);
    return out(c.say(['Our awards ballot: {ml} for MVP', 'The season in awards: {ml} is our MVP', 'Ballots are in: {ml} leads our picks'], v),
      c.say(['The regular season is over. These are the players who defined it.', 'Before the playoffs begin, the regular season deserves its due.'], v), rows);
  };
  K.champion = (c, d, a) => {
    const v = { tm: c.nick(a.tid), full: c.full(a.tid), opp: d.opp != null ? c.nick(d.opp) : 'their opponent', w: d.w, l: d.l, fm: d.fmvp != null ? c.pn(d.fmvp) : '', city: c.city(a.tid), n: d.titles, coach: c.coach(a.tid), ord: c.ord(d.titles) };
    const h = d.titles > 1 ? c.say(['Champions again: the {tm} win title number {n}', 'The {tm} are champions for the {ord} time'], v) : c.say(['The {full} are champions', 'Champions: the {tm} win it all', 'On top of the world: the {tm}'], v);
    const dk = c.say(['The {tm} beat the {opp} {w}-{l} in the Finals{fmTxt}.', '{w} games to {l} over the {opp}, and the trophy goes to {city}{fmTxt}.'], Object.assign({}, v, { fmTxt: v.fm ? `; ${v.fm} is the Finals MVP` : '' }));
    const b1 = c.say(['The confetti fell for a long time. Nobody on the floor seemed to mind.', 'They will hold a parade in {city} this week, and the whole city will be there.'], v);
    const b2 = d.user ? `For ${v.coach}, it is the kind of night a career is measured by.` : c.say(['{coach} called it the best group ever coached, and nobody argued.'], v);
    return out(h, dk, [b1, b2, voice(c, 1, v)]);
  };

  // ---------------------------------------------------------------------------
  // The playoffs
  // ---------------------------------------------------------------------------
  function serV(c, d) {
    return { hi: c.nick(d.hi), lo: c.nick(d.lo), fhi: c.full(d.hi), flo: c.full(d.lo), hs: d.hiSeed, ls: d.loSeed, hr: d.hiRec, lr: d.loRec, rd: c.round(d.round), sh: d.hiStar != null ? c.pn(d.hiStar) : '', sl: d.loStar != null ? c.pn(d.loStar) : '' };
  }
  K.preview = (c, d) => {
    const v = serV(c, d);
    const fin = d.round === d.rounds;
    return out(fin ? c.say(['The Finals: {hi} vs. {lo}', 'Finals preview: the {hi} and the {lo}'], v) : c.say(['{rd} preview: {hi} vs. {lo}', 'Series preview: the {hi} and the {lo}'], v),
      `The ${v.fhi}${v.hs ? ` (${v.hs})` : ''}, ${v.hr}, against the ${v.flo}${v.ls ? ` (${v.ls})` : ''}, ${v.lr}.`,
      [c.say(['The matchup to watch is {sh} against {sl}. Whoever wins it probably wins the series.', 'Home court belongs to the {hi}. History says that matters. The {lo} would like a word.'], v), c.role === 'numbers' ? 'Our pick: the higher seed in six, with less confidence than the seeds suggest.' : voice(c, 0, v)]);
  };
  K.series_end = (c, d, a) => {
    const v = serV(c, d);
    const win = c.nick(d.winner), lose = c.nick(d.winner === d.hi ? d.lo : d.hi);
    const ww = Math.max(d.w[0], d.w[1]), ll = Math.min(d.w[0], d.w[1]);
    Object.assign(v, { win, lose, ww, ll, games: ww + ll });
    const h = d.upset ? c.say(['Upset! The {win} knock out the {lose}', 'Stunner: the {win} send the {lose} home'], v) : d.sweep ? c.say(['Sweep: the {win} dispatch the {lose}', '4-0: the {win} roll past the {lose}'], v) : ll === 3 ? c.say(['The {win} survive the {lose} in seven', 'Seven games, one winner: the {win}'], v) : c.say(['The {win} advance past the {lose} in {games}', '{win} close out the {lose}'], v);
    const dk = `The ${win} win the ${v.rd} series ${ww}-${ll}.`;
    return out(h, dk, [d.upset ? 'Nobody outside their locker room picked this. Everyone inside it did.' : d.sweep ? 'It was never close, and by the end the other side looked like it knew.' : 'It was not always pretty. It rarely is at this time of year.', voice(c, 0, v)]);
  };
  K.game7 = (c, d) => {
    const v = serV(c, d);
    return out(c.say(['Game 7: {hi} vs. {lo}', 'Two of the best words in sports: Game 7'], v), `The ${v.rd} series between the ${v.fhi} and the ${v.flo} goes the distance.`, [c.say(['Win and advance. Lose and go home. It does not get simpler, or harder, than that.', 'Stars make their names in games like this. So do role players nobody had heard of.'], v)]);
  };

  // ---------------------------------------------------------------------------
  // The offseason
  // ---------------------------------------------------------------------------
  K.lottery = (c, d) => {
    const v = { a: d.order && d.order[0] != null ? c.nick(d.order[0]) : '', full: d.order && d.order[0] != null ? c.full(d.order[0]) : '' };
    return out(c.say(['Lottery luck: the {a} win the top pick', 'The {a} land the No. 1 pick'], v), c.say(['The ping-pong balls fell for the {full}.'], v),
      [d.order ? 'The top of the draft: ' + d.order.slice(0, 5).map((t, i) => `${i + 1}. ${c.nick(t)}`).join(', ') + '.' : '', voice(c, 0, v)]);
  };
  K.draft = (c, d) => {
    const top = d.picks || [];
    const v = { p: top[0] ? c.pn(top[0].pid) : '', tm: top[0] ? c.nick(top[0].tid) : '' };
    return out(c.say(['Draft night: {p} goes first to the {tm}', 'The {tm} take {p} with the first pick'], v), 'The first names off the board, and what they mean.',
      [top.slice(0, 8).map((x, i) => `${i + 1}. ${c.nick(x.tid)}: ${c.pn(x.pid)} (${c.pos(x.pid)})`).join('; ') + '.', d.mine ? `Your pick: ${c.pn(d.mine.pid)} at No. ${d.mine.n}.` : '', voice(c, 0, v)]);
  };
  K.fa = (c, d) => {
    const s = d.signed || [];
    if (!s.length) return out('Free agency: a quiet week', 'Teams are waiting each other out.', [voice(c, 0, {})]);
    const v = { p: c.pn(s[0].pid), tm: c.nick(s[0].tid), wk: d.week };
    return out(c.say(['Free agency week {wk}: {p} signs with the {tm}', 'The {tm} land {p}', 'Free agency tracker: {p} picks the {tm}'], v), `The week's biggest signings, starting with ${v.p}.`,
      [s.slice(0, 6).map(x => `${c.pn(x.pid)} to the ${c.nick(x.tid)}${x.amt ? ` (${x.years} year${x.years === 1 ? '' : 's'}, ${U.money(x.amt)} a season)` : ''}`).join('; ') + '.']);
  };
  K.retire = (c, d) => {
    const list = d.list || [];
    if (!list.length) return out('Farewells', '', []);
    const x = list[0];
    const v = { p: c.pn(x.pid), last: c.ln(x.pid), pts: (x.pts || 0).toLocaleString('en-US'), seasons: x.seasons };
    return out(c.say(['{last} retires after {seasons} seasons', 'A legend walks away: {p} retires', 'Farewell, {last}'], v),
      c.say(['{p} is calling it a career with {pts} points.', 'After {seasons} seasons and {pts} points, {p} is done.'], v),
      [list.slice(1, 6).length ? 'Also retiring: ' + list.slice(1, 6).map(r => `${c.pn(r.pid)} (${(r.pts || 0).toLocaleString('en-US')} points)`).join(', ') + '.' : '', voice(c, 1, v)]);
  };

  // ---------------------------------------------------------------------------
  // The league's history (PBC.Staff, PBC.Legacy)
  // ---------------------------------------------------------------------------
  const cname = (c, cid) => { const x = PBC.Staff ? PBC.Staff.get(c.S, cid) : null; return x ? PBC.Staff.name(x) : 'a coach'; };
  K.carousel = (c, d) => {
    const fired = (d.fired || []).map(id => cname(c, id)), retired = (d.retired || []).map(id => cname(c, id));
    const hires = (d.hired || []).map(h => `the ${c.full(h.tid)} hire ${cname(c, h.cid)}`);
    const v = { n: fired.length + retired.length, f0: fired[0] || retired[0] || '' };
    return out(c.say(['The coaching carousel: {n} new faces on the bench', 'Musical chairs: {n} head coaching jobs change hands', 'The carousel turns: {f0} out'], v),
      c.say(['The offseason started the way it usually does: with phone calls nobody wanted to take.', 'Owners made their decisions quickly this summer.'], v),
      [fired.length ? `Fired: ${c.list(fired)}.` : '', retired.length ? `Retiring: ${c.list(retired)}.` : '', hires.length ? `Hired: ${hires.join('; ')}.` : '', voice(c, 0, v)]);
  };
  K.hof = (c, d) => {
    const list = d.list || [];
    const first = list[0];
    const v = { n: list.length, N: c.Num(list.length), a: first ? first.name : '' };
    const rows = list.map(e => {
      if (e.kind === 'coach') return `${e.name}, coach: ${e.coach ? `${e.coach.w}-${e.coach.l}, ${e.coach.titles} title${e.coach.titles === 1 ? '' : 's'}${e.coach.coy ? `, ${e.coach.coy} Coach of the Year` : ''}` : ''}${e.first ? ', in on the first try' : ''}.`;
      const h = e.honors || {}, l = e.line || {};
      const bits = [];
      if (h.champion) bits.push(`${h.champion} title${h.champion === 1 ? '' : 's'}`);
      if (h.mvp) bits.push(`${h.mvp} MVP${h.mvp === 1 ? '' : 's'}`);
      if (h.allStar) bits.push(`${h.allStar} All-Star pick${h.allStar === 1 ? '' : 's'}`);
      return `${e.name} (${c.nick(e.tid)}): ${l.pts ? `${l.pts.toLocaleString('en-US')} points, ${l.ppg} a game` : ''}${bits.length ? '; ' + bits.join(', ') : ''}${e.first ? '. First ballot.' : '.'}`;
    });
    return out(c.say(['The Hall of Fame class of {season}', 'Enshrined: the Hall welcomes {n}', '{a} leads the Hall of Fame class'].map(x => x.replace('{season}', c.S.season)), v),
      c.say(['{N} new names go into the Hall this summer.', 'The league\'s highest honor, and {n} new members.'], v),
      rows.concat([c.say(['Induction night is the one night a year when the league stops arguing and simply remembers.', 'Their numbers, their nights, their rings: all of it in one room now.'], v)]));
  };
  K.number = (c, d, a) => {
    const p = a.pid;
    const v = { p: c.pn(p), last: c.ln(p), num: d.num, tm: c.nick(a.tid), full: c.full(a.tid), n: d.seasons, city: c.city(a.tid) };
    return out(c.say(['The {tm} will retire No. {num} for {last}', 'No. {num} goes to the rafters in {city}', 'Forever {num}: the {tm} honor {last}'], v),
      c.say(['After {n} seasons in {city}, {p} will have {his} number raised to the rafters.', 'Nobody in a {tm} uniform will wear No. {num} again.'].map(x => x.replace('{his}', c.his(p))), v),
      [c.say(['The ceremony will come next season, with the whole building on its feet.', 'Every franchise has a few names that belong to it. {last} is one of the {tm}\'s.'], v), voice(c, 1, v)]);
  };
  const ALLTIME_WORD = { pts: 'points', reb: 'rebounds', ast: 'assists', tpm: 'three-pointers', stl: 'steals', blk: 'blocks' };
  K.alltime = (c, d, a) => {
    const p = a.pid;
    const v = { p: c.pn(p), last: c.ln(p), word: ALLTIME_WORD[d.stat] || d.stat, val: d.val.toLocaleString('en-US'), prev: d.prev ? c.pn(d.prev.pid) : '', pv: d.prev ? d.prev.val.toLocaleString('en-US') : '', tm: c.nick(a.tid), age: d.age };
    return out(c.say(['{last} is the all-time leader in {word}', 'The new king: {last} passes {prev}', 'History: {last} becomes the league\'s all-time {word} leader'], v),
      c.say(['{p} passed {prev} ({pv}) and now has more career {word} than anyone in league history.', 'At {age}, {p} has {val} career {word}. Nobody has ever had more.'], v),
      [c.say(['The record had belonged to {prev}. It belongs to {last} now, and it may for a long time.', 'The game was stopped. The crowd stood. The ball went to the {tm} bench, and then to a display case.'], v), voice(c, 1, v)]);
  };

  // ---------------------------------------------------------------------------
  // All-Star weekend (PBC.AllStar)
  // ---------------------------------------------------------------------------
  K.asg = (c, d, a) => {
    const p = a.pid, l = d.line || {};
    const W = d.teams[d.winner], Lz = d.teams[1 - d.winner];
    const v = { p: c.pn(p), last: c.ln(p), pts: l.pts || 0, reb: l.reb || 0, ast: l.ast || 0, W: W.name, L: Lz.name, ws: W.pts, ls: Lz.pts, his: c.his(p) };
    const others = (d.top || []).map(b => `${c.pn(b.pid)} (${b.pts})`);
    return out(c.say(['{last} steals the show at the All-Star Game', 'All-Star MVP: {p}', '{W} wins a {ws}-{ls} All-Star shootout'], v),
      c.say(['{p} had {pts} points, {reb} rebounds and {ast} assists as {W} beat {L} {ws}-{ls}.', '{W} {ws}, {L} {ls}, and the MVP trophy went to {p} ({pts} points).'], v),
      [others.length ? `Also scoring big: ${c.list(others)}.` : '',
        c.say(['Nobody played much defense, which is the point. Everybody played hard in the last five minutes, which is the tradition.', 'The first three quarters were a dunk contest with a scoreboard. The fourth was a basketball game.', 'It was loud, it was fun, and for one night the league\'s stars were on the same side.'], v),
        voice(c, 1, v)]);
  };
  K.three = (c, d, a) => {
    const p = a.pid, fin = d.final || [];
    const me = fin.find(x => x.pid === p) || { pts: 0 };
    const rest = fin.filter(x => x.pid !== p).map(x => `${c.pn(x.pid)} ${x.pts}`);
    const v = { p: c.pn(p), last: c.ln(p), pts: me.pts, rest: c.list(rest) };
    return out(c.say(['{last} wins the three-point contest', 'Splash: {last} takes the three-point crown', '{last} catches fire to win the three-point contest'], v),
      c.say(['{p} scored {pts} in the final round.', 'A {pts} in the final was enough for {p}.'], v),
      [rest.length ? `The rest of the final: ${v.rest}.` : '', d.best && d.best.pid !== p ? `The best first round belonged to ${c.pn(d.best.pid)}, with ${d.best.pts}.` : '',
        c.say(['The money balls decided it, as they usually do.', 'Five racks, a lot of nerve, and one shooter who did not miss when it counted.'], v)]);
  };
  K.dunk = (c, d, a) => {
    const p = a.pid, fin = d.final || [];
    const me = fin.find(x => x.pid === p) || { total: 0, dunks: [] };
    const opp = fin.find(x => x.pid !== p);
    const best = U.maxBy(me.dunks, x => x.score) || { dunk: 'a big one', score: 0 };
    const v = { p: c.pn(p), last: c.ln(p), dunk: best.dunk, sc: best.score, total: me.total, opp: opp ? c.pn(opp.pid) : 'the field', ot: opp ? opp.total : 0 };
    return out(c.say(['{last} wins the dunk contest', '{last} brings the house down', 'Liftoff: {last} takes the dunk title'], v),
      d.dunkoff ? c.say(['{p} and {opp} were tied at {total} after the final. {p} won the dunk-off.', 'It took a dunk-off: {p} and {opp} finished the final tied at {total}.'], v)
        : c.say(['The winning moment: {dunk}, for a {sc}.', '{p} beat {opp} {total}-{ot} in the final, and {dunk} was the one people will remember.'], v),
      [d.perfect ? 'At least one dunk in the final drew a perfect 50 from the judges.' : '', d.dunkoff ? `The winning moment came before that: ${v.dunk}, for a ${v.sc}.` : '',
        (me.dunks || []).some(x => x.tries > 1) ? 'Not everything went down on the first try. The judges forgave it.' : '',
        c.say(['The building was on its feet before the ball came through the net.', 'Some contests are about the score. This one was about the noise.'], v)]);
  };
  K.skills = (c, d, a) => {
    const p = a.pid;
    const v = { p: c.pn(p), last: c.ln(p), t: d.time, opp: c.pn(d.opp), ot: d.otime };
    return out(c.say(['{last} wins the skills challenge', 'Fastest through the course: {last}'], v),
      c.say(['{p} ran the final course in {t} seconds, beating {opp} ({ot}).', 'Dribble, pass, shoot: {p} did all three faster than anyone, {t} seconds in the final.'], v),
      [c.say(['The course rewards hands, feet and a steady last shot. {last} had all three.', 'It is the quietest event of the weekend. Nobody told {last}.'], v)]);
  };

  // ---------------------------------------------------------------------------
  // Rivalries (PBC.Rivals)
  // ---------------------------------------------------------------------------
  // the playoff history between two teams, in a sentence
  function poLine(c, po) {
    if (!po || !po.length) return '';
    const last = po[po.length - 1];
    const g = last.w[0] + last.w[1];
    const n = po.length;
    return `They have met ${n === 1 ? 'once' : c.num(n) + ' times'} in the playoffs, most recently in ${U.seasonLabel(last.season)}, when the ${c.nick(last.winner)} won in ${g}${last.g7 ? ', a Game 7 nobody in either city has forgotten' : ''}.`;
  }
  function h2hLine(c, a, b, h) {
    if (!h || h[0] + h[1] === 0) return '';
    if (h[0] === h[1]) return `The regular-season series since this league began is dead even at ${h[0]}-${h[1]}.`;
    const lead = h[0] > h[1] ? a : b;
    return `The ${c.nick(lead)} lead the regular-season series ${Math.max(h[0], h[1])}-${Math.min(h[0], h[1])}.`;
  }
  K.rivalry = (c, d) => {
    const v = { A: c.nick(d.a), B: c.nick(d.b), fa: c.full(d.a), fb: c.full(d.b), why: d.why || 'one game too many' };
    const H = {
      1: ['{A} and {B}: this is a rivalry now', 'The {A}-{B} rivalry is officially on', 'Bad blood is brewing between the {A} and the {B}'],
      2: ['There is no love lost between the {A} and the {B}', 'The {A} and the {B} have turned bitter', 'This one is personal: {A} vs. {B}'],
      3: ['{A} and {B}: a blood feud', 'The league\'s nastiest rivalry: {A} vs. {B}', 'They cannot stand each other: inside {A} vs. {B}'],
    };
    return out(c.say(H[d.lvl] || H[1], v),
      c.say(['It started with {why}. It has not cooled down since.', 'Ask anyone in either locker room. They will tell you about {why}.', 'Nobody in {fa} colors will say it out loud, but {why} changed things.'], v),
      [h2hLine(c, d.a, d.b, d.h2h), poLine(c, d.po),
        c.say(['Circle the next meeting. The players already have.', 'The schedule makers could not have planned it better. The next one should be loud.', 'Expect a full building and short tempers the next time these two meet.'], v),
        voice(c, 0, v)]);
  };
  K.rivalry_night = (c, d) => {
    const v = { H: c.nick(d.h), A: c.nick(d.a), city: c.city(d.h), rh: c.rec(d.rh[0], d.rh[1]), ra: c.rec(d.ra[0], d.ra[1]), sh: c.pn(d.sh), sa: c.pn(d.sa), label: (d.label || 'rivalry').toLowerCase(), why: d.why || '' };
    return out(c.say(['Rivalry night: {A} at {H}', 'Circle it: the {A} come to {city}', '{H} vs. {A}, and nobody is calling it just another game'], v),
      c.say(['The {H} ({rh}) host the {A} ({ra}) in the latest chapter of a {label}.', 'A {label} renews in {city}: the {H} ({rh}) against the {A} ({ra}).'], v),
      [d.sh != null && d.sa != null ? c.say(['{sh} against {sa} is the matchup everyone will be watching.', 'All eyes on {sh} and {sa}.'], v) : '',
        h2hLine(c, d.h, d.a, d.h2h), poLine(c, d.po),
        v.why ? c.say(['The last time these two made news, it was {why}.', 'Nobody has forgotten {why}.'], v) : '',
        c.say(['Expect the building to be loud from the opening tip.', 'The crowd will be on its feet early, and so will both benches.'], v)]);
  };

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------
  const cache = new Map();
  /** an article's words: { h: headline, d: deck, b: [paragraphs], by: writer } */
  M.render = function (S, a) {
    if (!a) return null;
    const key = (S.saveId || 'save') + '|' + a.id + '|' + a.k;
    const hit = cache.get(key);
    if (hit) return hit;
    const fn = K[a.k];
    let r;
    try {
      const c = desk(S, a);
      r = fn ? fn(c, a.data || {}, a) : { h: a.k, d: '', b: [] };
      r.by = c.w;
    } catch (e) {
      if (typeof console !== 'undefined') console.warn('[media] render ' + a.k, e);
      r = { h: 'The League Report', d: '', b: [], by: M.writer(S, a.w) };
    }
    cache.set(key, r);
    if (cache.size > 800) cache.delete(cache.keys().next().value);
    return r;
  };
  M.KINDS = Object.keys(K);
})();
