/* Pro BBALL Coach: the season documentary (PBC.Story). No DOM.
 *
 * Your season told in chapters, from what actually happened: training camp (the owner's goal and the projection), the
 * first month, the middle of the season and the All-Star break, the trade deadline, the stretch run, the postseason,
 * and the verdict (the owner's review, your players' awards, the achievements and skill points), with the season's
 * headlines about your team. Written from the record, read on the Season Recap.
 *
 *   Story.season(S) -> { title, chapters: [{ kick, h, p: [paragraphs], heads: [{ id, h }] }] } | null
 */
(function () {
  'use strict';
  const PBC = (window.PBC = window.PBC || {});
  const U = PBC.U;
  const Story = (PBC.Story = PBC.Story || {});

  const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
  const num = n => (n >= 0 && n < words.length ? words[n] : String(n));
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const nm = p => (p ? PBC.Player.name(p) : 'a player');

  /** the user's games this season, in order: [{ day, opp, home, us, them, won, ot }] */
  function results(S, tid) {
    return (S.schedule || []).filter(g => g.played && (g.h === tid || g.a === tid)).sort((a, b) => a.day - b.day).map(g => {
      const home = g.h === tid, us = home ? g.hs : g.as, them = home ? g.as : g.hs;
      return { day: g.day, opp: home ? g.a : g.h, home, us, them, won: us > them, ot: g.ot };
    });
  }
  function streaks(list) {
    let best = { n: 0, end: -1 }, worst = { n: 0, end: -1 }, cur = 0;
    list.forEach((g, i) => {
      cur = g.won ? Math.max(1, cur + 1) : Math.min(-1, cur - 1);
      if (cur > best.n) best = { n: cur, end: i };
      if (-cur > worst.n) worst = { n: -cur, end: i };
    });
    return { best, worst };
  }
  const rec = list => [list.filter(g => g.won).length, list.filter(g => !g.won).length];
  const recTxt = r => `${r[0]}-${r[1]}`;

  Story.season = function (S) {
    const c = S.coach;
    if (!c || !c.seasons || !c.seasons.length) return null;
    const cs = c.seasons[c.seasons.length - 1];
    if (cs.season !== S.season) return null;
    const tid = cs.tid, t = S.teams[tid];
    const L = PBC.League.cfg(S);
    const all = results(S, tid);
    if (!all.length) return null;
    const R = PBC.Desk && PBC.Desk.makeRng ? PBC.Desk.makeRng(U.hash(`${S.saveId || 'save'}|story|${S.season}`)) : Math.random;
    const pick = arr => arr[Math.floor(R() * arr.length)];
    const ch = [];
    const nick = t.name;
    const exp = c.expectation && c.expectation.season === S.season ? c.expectation : null;
    const st = streaks(all);
    const final = rec(all);

    // training camp
    {
      const p = [];
      const goal = cs.goal || (exp ? exp.label : '');
      const o = PBC.Office ? PBC.Office.owner(S, tid) : (t.owner || {});
      const ty = PBC.Office && o.type ? PBC.Office.TYPES[o.type] : null;
      p.push(`It began in the owner's suite. ${o.name || 'The owner'}${ty ? `, ${ty.label.replace(/^The /, 'the ')},` : ''} had one sentence for the ${nick}: ${goal ? goal.charAt(0).toLowerCase() + goal.slice(1) : 'compete'}.${cs.expWins ? ` The projections had them at ${cs.expWins} wins.` : ''}`);
      const best = PBC.League.roster(S, tid)[0];
      if (best) p.push(`Everything ran through ${nm(best)}. ${pick(['Nobody in the building doubted that.', 'That was the plan, anyway.', 'The rest of the roster would decide how far that went.'])}`);
      ch.push({ kick: 'Chapter one', h: 'Training camp', p });
    }
    // the first month
    {
      const first = all.slice(0, Math.min(15, all.length));
      const r = rec(first);
      const pace = Math.round(r[0] / first.length * S.seasonGames);
      const p = [`After ${num(first.length)} games, the ${nick} were ${recTxt(r)}, a ${pace}-win pace.`];
      if (exp) p.push(pace >= exp.wins + 6 ? pick(['Nobody had expected this. The phones in the front office started ringing for the right reasons.', 'Ahead of every projection, and starting to believe it.']) : pace <= exp.wins - 6 ? pick(['It was not the start anyone wanted, and the owner noticed first.', 'The questions came early, and they came loud.']) : pick(['About where everyone thought. The real season was still ahead.', 'No panic, no parade. Just the work.']));
      ch.push({ kick: 'Chapter two', h: 'The first month', p });
    }
    // the middle of the season and the All-Star break
    {
      const brk = S.allStarDay >= 0 ? S.allStarDay : Math.round((S.numDays || 160) / 2);
      const before = all.filter(g => g.day < brk);
      const p = [];
      if (before.length) p.push(`By the All-Star break the ${nick} were ${recTxt(rec(before))}.`);
      const stars = (S.allStars || []).filter(id => S.players[id] && S.players[id].tid === tid).map(id => S.players[id]);
      if (stars.length) p.push(`${stars.length === 1 ? nm(stars[0]) + ' was' : stars.map(nm).join(' and ') + ' were'} named ${stars.length === 1 ? 'an All-Star' : 'All-Stars'}.`);
      const asw = PBC.AllStar ? PBC.AllStar.latest(S) : null;
      if (asw && asw.season === S.season) {
        const mine = id => S.players[id] && S.players[id].tid === tid;
        if (asw.game && mine(asw.game.mvp)) p.push(`${nm(S.players[asw.game.mvp])} was the All-Star Game MVP.`);
        if (asw.three && mine(asw.three.winner)) p.push(`${nm(S.players[asw.three.winner])} won the three-point contest.`);
        if (asw.dunk && mine(asw.dunk.winner)) p.push(`${nm(S.players[asw.dunk.winner])} won the dunk contest.`);
      }
      if (st.best.n >= 5) p.push(`The best stretch of the year: ${num(st.best.n)} straight wins${st.best.end >= 0 ? `, ending ${PBC.League.dateLabel(S, all[st.best.end].day)}` : ''}.`);
      if (st.worst.n >= 5) p.push(`The low point: ${num(st.worst.n)} straight losses.`);
      if (p.length) ch.push({ kick: 'Chapter three', h: 'The middle of the season', p });
    }
    // the trade deadline
    {
      const trades = (S.trades || []).filter(r => r.season === S.season && r.tids && r.tids.includes(tid) && (r.phase === 'regular' || r.phase === 'preseason'));
      const p = [];
      if (trades.length) {
        p.push(trades.length === 1 ? 'There was one deal.' : `There were ${num(trades.length)} deals.`);
        for (const r of trades.slice(0, 3)) if (r.text) p.push(r.text.split(' · ').join('; ') + '.');
      } else p.push(pick(['The deadline came and went without a move. The ' + nick + ' bet on the group they had.', 'No trades. Whatever happened next, this group would own it.']));
      ch.push({ kick: 'Chapter four', h: 'The deadline', p });
    }
    // the stretch run
    {
      const brk = S.allStarDay >= 0 ? S.allStarDay : Math.round((S.numDays || 160) / 2);
      const after = all.filter(g => g.day >= brk);
      const p = [];
      if (after.length) p.push(`After the break: ${recTxt(rec(after))}.`);
      const row = PBC.League.sorted(S, L.playoffFormat === 'conference' ? t.conf : null).find(r => r.tid === tid);
      p.push(`The ${nick} finished ${recTxt(final)}${row ? `, ${U.ordinal(row.seed)} in ${L.playoffFormat === 'conference' ? 'the ' + L.confs[t.conf] : 'the league'}` : ''}.${exp ? (final[0] >= exp.wins + 5 ? ' Better than anyone had a right to expect.' : final[0] <= exp.wins - 5 ? ' Short of what was promised.' : '') : ''}`);
      const close = all.filter(g => Math.abs(g.us - g.them) <= 3);
      if (close.length >= 6) { const cr = rec(close); p.push(`In games decided by three points or fewer they went ${recTxt(cr)}.${cr[0] > cr[1] + 2 ? ' They knew how to finish.' : cr[1] > cr[0] + 2 ? ' The close ones got away.' : ''}`); }
      ch.push({ kick: 'Chapter five', h: 'The stretch run', p });
    }
    // the postseason
    {
      const P = S.playoffs;
      const res = PBC.League.playoffResult(S, tid);
      const p = [];
      const ser = P ? P.series.filter(x => x.done && (x.hi === tid || x.lo === tid)).sort((a, b) => a.round - b.round) : [];
      if (ser.length) {
        for (const x of ser) {
          const opp = x.hi === tid ? x.lo : x.hi, me = x.hi === tid ? 0 : 1;
          const won = x.winner === tid, g = x.w[0] + x.w[1];
          const rn = PBC.League.roundName(S, x.round);
          p.push(won ? `In the ${rn}, the ${nick} beat the ${S.teams[opp].name} in ${g}${g === 7 ? ', a Game 7' : x.w[1 - me] === 0 ? ', a sweep' : ''}.`
            : `In the ${rn}, the ${S.teams[opp].name} ended it in ${g}${g === 7 ? ', in a Game 7' : ''}.`);
        }
        if (res.champ) p.push(pick(['And then the confetti. Champions.', 'Champions. Nobody can take that away.']));
      } else if (res.round === 0) p.push('The season ended in the play-in.');
      else p.push(pick([`No playoffs this year. The ${nick} watched from home.`, 'The postseason went on without them.']));
      ch.push({ kick: 'Chapter six', h: res.champ ? 'The title' : 'The postseason', p });
    }
    // the verdict
    {
      const p = [];
      const rv = c.lastReview && c.lastReview.season === S.season ? c.lastReview : null;
      if (rv) {
        const v = { extended: 'gave you a contract extension', retained: 'kept you on', fired: 'let you go', expired: 'let your contract run out' }[rv.verdict] || 'reviewed the season';
        p.push(`The owner ${v}.${rv.owner && rv.owner.length ? ' ' + rv.owner.join('. ') + '.' : ''} Job security: ${rv.security} (${rv.delta >= 0 ? '+' : ''}${rv.delta}).`);
      }
      const aw = S.regularAwards || {};
      const mine = id => id != null && S.players[id] && S.players[id].tid === tid;
      const honors = [];
      if (mine(aw.mvp)) honors.push(`${nm(S.players[aw.mvp])} won the MVP`);
      if (mine(aw.dpoy)) honors.push(`${nm(S.players[aw.dpoy])} was Defensive Player of the Year`);
      if (mine(aw.roy)) honors.push(`${nm(S.players[aw.roy])} was Rookie of the Year`);
      if (mine(aw.smoy)) honors.push(`${nm(S.players[aw.smoy])} won Sixth Player of the Year`);
      if (mine(aw.mip)) honors.push(`${nm(S.players[aw.mip])} was the Most Improved Player`);
      if (aw.coyTid === tid) honors.push('you were Coach of the Year');
      if (honors.length) p.push(cap(honors.join('; ')) + '.');
      const ach = Object.keys(c.achievements).filter(id => c.achievements[id].season === S.season).map(id => (PBC.Config.ACHIEVEMENTS.find(a => a.id === id) || {}).label).filter(Boolean);
      if (ach.length) p.push(`Achievements this season: ${ach.join(', ')}.`);
      if (c.lastSP && c.lastSP.season === S.season && c.lastSP.n) p.push(`${cap(num(c.lastSP.n))} skill point${c.lastSP.n === 1 ? '' : 's'} for the season.`);
      if (p.length) ch.push({ kick: 'Epilogue', h: 'The verdict', p });
    }
    // the headlines
    const M = S.media;
    const heads = M && PBC.Media.render ? U.sortBy(M.arts.filter(a => a.season === S.season && (a.tid === tid || (a.tids || []).includes(tid))), a => a.pri * 1000 + a.day, true).slice(0, 5).map(a => { const r = PBC.Media.render(S, a); return r ? { id: a.id, h: r.h } : null; }).filter(Boolean) : [];
    return { title: `${U.seasonLabel(S.season)}: the ${t.city} ${t.name}`, chapters: ch, heads };
  };
})();
