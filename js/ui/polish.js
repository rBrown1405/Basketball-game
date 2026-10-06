/* Pro BBALL Coach: help for a new career. A tip at the top of a screen the first time you open it (remembered per
 * save; "Hide tips" turns them off), and a getting-started checklist on Home through your first season. */
(function () {
  'use strict';
  const PBC = window.PBC;
  const U = PBC.U, UI = PBC.UI;

  const TIPS = {
    desk: ['📥', '<b>The Desk is your inbox.</b> Your players, the owner, the press, your staff and other teams bring you decisions. Every answer has consequences: morale, team chemistry, the owner\'s trust, the fans. Some decisions stop the sim until you answer (Settings decide which); offers run out if you wait.'],
    media: ['🗞️', '<b>The League Report follows the league\'s stories:</b> streaks and slumps, award races, rumors, rivalries, the big nights. Stories about your team are marked, and what you say at a press conference on the Desk can end up in the paper.'],
    legacy: ['🏛️', '<b>The Hall keeps the league\'s history:</b> the greatest players and coaches of all time, a Hall of Fame class every summer, banners and retired numbers, the rivalries, the decades and your own legacy. It starts with your first season and grows every year.'],
    office: ['🏢', '<b>The Front Office:</b> your owner\'s personality and this season\'s demand, your facilities (spend facility points; a project opens at the next training camp) and your rivals.'],
    career: ['🎖️', '<b>Coaching skills.</b> Good seasons and the bigger achievements earn skill points; spend them on Player Development, Motivator, Tactician, Recruiter or Media Savvy. Mastering one takes 30 points, so choose the coach you want to be.'],
    calendar: ['🗓️', '<b>Your month at a glance:</b> home and road games, results, rivalry nights, back-to-backs, and the year\'s key dates from opening night to free agency.'],
    practice: ['🏋️', '<b>One practice a week.</b> Pick a drill and up to three focus players: they gain the most. Skip it and your assistants run a lighter session at the end of the week.'],
    trade: ['🔄', '<b>Build a deal and read the room:</b> the other team says what it thinks of the value and what it needs. Teams also call you with offers on the Desk, and stars traded between two teams can start a rivalry.'],
    freeagency: ['🖊️', '<b>Free agents weigh</b> money, their role, winning, the market, your facilities and your reputation as a recruiter. Make offers, pitch them, and watch the end of each week: that is when they sign.'],
    scouting: ['🔭', '<b>Scouting points</b> turn a prospect\'s rating range into a number. A better scouting department (the Front Office) gives you more points every week.'],
    allstar: ['⭐', '<b>All-Star weekend</b> comes at the break: the three-point contest, the dunk contest, the skills challenge and the game. The Desk asks whether your invited players go.'],
    lineup: ['📋', '<b>Starters and minutes.</b> Players notice their minutes; promises about minutes are checked, and a broken promise costs morale and your word around the league.'],
    strategy: ['🧠', '<b>Systems that fit your players win.</b> A system your roster cannot run hurts you, whatever it looks like on paper.'],
  };
  UI.TIPS = TIPS;
  const tipsOn = S => !!S && !(S.settings && S.settings.tips === false);
  const seen = S => (S.tips = S.tips || { seen: {}, visited: {} });

  function addTip(key) {
    const S = UI.S;
    if (!S || !S.teams || !S.coach) return;
    const st = seen(S);
    st.visited[key] = 1;
    if (!tipsOn(S) || !TIPS[key] || st.seen[key]) return;
    const page = UI.$('#screen .screen-root .page');
    if (!page || page.querySelector('.tip')) return;
    const [icon, html] = TIPS[key];
    const el = UI.h(`<div class="tip"><span class="tip-i">${icon}</span><div class="tip-b">${html}</div>
      <div class="tip-x"><button class="btn sm" data-tip-ok>Got it</button><div><a class="link tiny" data-tip-off>Hide tips</a></div></div></div>`);
    const head = page.querySelector('.page-h');
    if (head && head.nextSibling) page.insertBefore(el, head.nextSibling); else page.insertBefore(el, page.firstChild);
    el.querySelector('[data-tip-ok]').onclick = () => { st.seen[key] = 1; el.remove(); UI.markDirty(); };
    el.querySelector('[data-tip-off]').onclick = () => { S.settings.tips = false; el.remove(); UI.markDirty(); UI.toast('Tips are off. Turn them back on in Settings.'); };
  }
  // after every screen draws
  const go0 = UI.go, refresh0 = UI.refresh;
  UI.go = function () { const r = go0.apply(this, arguments); try { addTip(UI.current().key); } catch (e) { console.error(e); } return r; };
  UI.refresh = function () { const r = refresh0.apply(this, arguments); try { addTip(UI.current().key); } catch (e) { console.error(e); } return r; };

  // ---------------------------------------------------------------------------
  // Getting started (Home, your first season)
  // ---------------------------------------------------------------------------
  UI.startCard = function (S) {
    const c = S.coach;
    if (!c || !tipsOn(S)) return '';
    const st = seen(S);
    if (st.startDone || (c.seasons && c.seasons.length >= 1)) return '';
    const D = S.desk || {};
    const steps = [
      ['Play your first game (Play Game, or Quick Sim)', (c.totals.w + c.totals.l) > 0],
      ['Answer something on the Desk', (D.answered || 0) > 0],
      ['Set your starters and minutes (Lineup & Minutes)', !!st.visited.lineup],
      ['Run a practice', !!(S.practice && S.practice.log && S.practice.log.some(x => !x.auto))],
      ['Read a story in the Media', !!(S.media && S.media.arts.some(a => a.seen))],
      ['Learn a coaching skill (My Career)', !!(c.skills && Object.values(c.skills).some(v => v > 0))],
      ['Meet your owner (Front Office)', !!st.visited.office],
      ['Look at the calendar', !!st.visited.calendar],
    ];
    const done = steps.filter(s => s[1]).length;
    if (done === steps.length) { st.startDone = true; return ''; }
    return `<div class="card"><div class="card-h"><h3>Getting started</h3><div class="actions"><span class="small muted">${done}/${steps.length}</span><button class="btn sm ghost" data-start-hide>Hide</button></div></div>
      <div class="card-b"><div class="gs-list">${steps.map(s => `<div class="gs-item ${s[1] ? 'done' : ''}"><span class="gs-ck">${s[1] ? '✓' : ''}</span>${U.esc(s[0])}</div>`).join('')}</div></div></div>`;
  };
  // the Hide button (Home redraws through UI.go / UI.refresh)
  document.addEventListener('click', ev => {
    const b = ev.target.closest && ev.target.closest('[data-start-hide]');
    if (!b || !UI.S) return;
    seen(UI.S).startDone = true;
    UI.markDirty();
    UI.refresh();
  });
})();
