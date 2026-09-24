/* Pro BBALL Coach — weekly practice drills: catalog (PBC.Mini.DRILLS) + PBC.Mini.runDrill framework
   (intro card, live HUD, results card). Drill bodies live in drills_*.js and register via Mini.registerDrill. */
(function () {
  'use strict';
  const Mini = window.PBC.Mini, U = Mini.util, esc = U.esc;

  Mini.DRILLS = [
    { key: 'shooting', name: 'Catch & Shoot', icon: '🎯', secs: 35, trains: ['three', 'mid', 'shotIQ'],
      desc: 'Ten catch-and-shoot jumpers around the arc. The green window shrinks and the release speed changes as you go; chain makes for a streak bonus.' },
    { key: 'freethrows', name: 'Pressure Free Throws', icon: '🧊', secs: 35, trains: ['ft', 'clutch'],
      desc: 'Ten free throws while the crowd behind the basket goes wild. The noise makes the green window wobble.' },
    { key: 'finishing', name: 'Attack the Rim', icon: '🏀', secs: 30, trains: ['layup', 'close', 'dunk'],
      desc: 'Drive to the basket. Time the gather step, then release at the top of the jump.' },
    { key: 'passing', name: 'Find the Open Man', icon: '👀', secs: 30, trains: ['pass', 'vision'],
      desc: 'Read the defense and hit the teammate who breaks open before the window closes. A pass to a covered man is a turnover.' },
    { key: 'ballhandling', name: 'Combo Dribble', icon: '🌀', secs: 30, trains: ['handle', 'agility'],
      desc: 'Hit the arrow combos on the beat to chain crossovers, hesitations and spin moves. A miss breaks the combo.' },
    { key: 'defense', name: 'Slide Drill', icon: '🛡️', secs: 30, trains: ['perD', 'agility', 'steal'],
      desc: 'Mirror the ball handler: slide with his drives and contest the pull-up. Guessing early on a fake gets you burned.' },
    { key: 'rebounding', name: 'Box Out & Board', icon: '🙌', secs: 30, trains: ['dreb', 'oreb', 'hustle'],
      desc: 'Read the miss off the rim and call the landing spot before the ball comes down. The closer your call, the better.' },
    { key: 'conditioning', name: 'Suicides', icon: '🏃', secs: 25, trains: ['stamina', 'speed', 'hustle'],
      desc: 'Alternate left and right to keep your pace in the moving green zone for 20 seconds. Too fast and you gas out; too slow and you fall behind.' },
  ];

  const VERDICT = {
    'A+': 'Flawless. The whole gym stopped to watch.', A: 'Elite session. The staff is impressed.', 'A-': 'Sharp work. Nearly spotless.',
    'B+': 'Strong practice. Good habits showing.', B: 'Solid work. A few reps to clean up.', 'B-': 'Decent session with some rough edges.',
    'C+': 'Average day. There is room to grow.', C: 'Middle of the pack. Keep grinding.', 'C-': 'Sloppy in spots. Run it back.',
    D: 'Rough day at the office.', F: 'Back to fundamentals.',
  };

  /**
   * runDrill(container, key, opts) → Promise<{ score 0–100, grade, details, cancelled? }>
   * opts: { difficulty 0..1 (default .5), players: ['M. Hill', ...] }
   */
  Mini.runDrill = function (container, key, opts) {
    opts = opts || {};
    const info = Mini.DRILLS.find(d => d.key === key), impl = Mini._drills[key];
    return new Promise(resolve => {
      if (!info || !impl) {
        console.warn('[PBC.Mini] unknown drill:', key);
        resolve({ score: 0, grade: 'F', details: { error: 'unknown drill: ' + key }, cancelled: true });
        return;
      }
      const live = {};
      const s = new Mini.Session(container, { cls: 'pbc-mini--drill', label: info.name + ' drill', resolve, fallback: () => ({ score: 0, grade: 'F', details: Object.assign({}, live) }) });
      const difficulty = U.clamp(U.num(opts.difficulty, 0.5), 0, 1);
      const players = (Array.isArray(opts.players) && opts.players.length ? opts.players : ['Your Player']).map(p => String(p));
      const touch = U.isTouch();

      const box = U.el('div', 'pm-drill');
      box.innerHTML = `
        <div class="pm-drill__top">
          <div class="pm-drill__title"><span class="pm-drill__icon">${info.icon}</span><div><small>PRACTICE DRILL</small><b>${esc(info.name)}</b></div></div>
          <div class="pm-hud">
            <div class="pm-hud__cell" data-slot="a"><small></small><b></b></div>
            <div class="pm-hud__cell" data-slot="b"><small></small><b></b></div>
            <div class="pm-hud__cell" data-slot="c"><small></small><b></b></div>
          </div>
          <button type="button" class="pm-drill__x" data-pm-nohold aria-label="Skip drill">✕</button>
        </div>
        <div class="pm-drill__stage">
          <div class="pm-drill__play"></div>
          <div class="pm-flash"></div>
          <div class="pm-toast"></div>
        </div>
        <div class="pm-drill__foot"></div>`;
      s.root.appendChild(box);
      const stage = box.querySelector('.pm-drill__stage'), play = box.querySelector('.pm-drill__play');
      const flashEl = box.querySelector('.pm-flash'), toastEl = box.querySelector('.pm-toast'), foot = box.querySelector('.pm-drill__foot');
      const cells = {};
      box.querySelectorAll('.pm-hud__cell').forEach(c => { cells[c.getAttribute('data-slot')] = c; });
      let phase = 'intro';
      s.on(box.querySelector('.pm-drill__x'), 'click', e => { e.preventDefault(); s.cancel(); });
      s.onCancel = () => s.finish({ score: 0, grade: 'F', details: Object.assign({}, live), cancelled: true });

      const api = {
        info, difficulty, players, touch, live, session: s, scope: null, stage: play, root: box,
        player: i => players[(((i || 0) % players.length) + players.length) % players.length],
        last: name => { const p = String(name).trim().split(/\s+/); return p[p.length - 1]; },
        sfx: n => Mini.sfx(n),
        theme: Mini.theme(),
        /** HUD cell: slot 'a'|'b'|'c'. */
        hud(slot, label, value, tone, bump) {
          const c = cells[slot];
          if (!c) return;
          const l = c.firstElementChild, v = c.lastElementChild, sv = String(value);
          if (label != null && l.textContent !== label) l.textContent = label;
          if (v.textContent !== sv) { v.textContent = sv; if (bump) U.restartAnim(v, 'is-bump'); }
          const cls = 'pm-hud__cell is-on' + (tone ? ' pm-tone-' + tone : '');
          if (c.className !== cls) c.className = cls;
        },
        toast(text, tone, sub) {
          toastEl.innerHTML = `<b class="pm-tone-${tone || 'text'}">${esc(text)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}`;
          U.restartAnim(toastEl, 'is-on');
        },
        flash(tone) { flashEl.className = 'pm-flash pm-tone-' + (tone || 'good'); U.restartAnim(flashEl, 'is-on'); },
        shake() { U.restartAnim(stage, 'pm-shake'); },
        foot(html) { foot.innerHTML = html || ''; },
        canvas(parent, onResize) { return new Mini.Canvas2D(parent || play, api.scope, onResize); },
        /** Test/debug hook: exposes read-only drill internals as stage.pbcDebug (removed with the DOM). */
        debug(o) { play.pbcDebug = o; },
        /** End of drill → results card → resolve. summary: [[label, value], ...] */
        finish(score, details, summary) {
          if (phase !== 'play') return;
          phase = 'results';
          const sc = Math.round(U.clamp(U.num(score, 0), 0, 100));
          if (api.scope) api.scope.dispose();
          showResults({ score: sc, grade: U.grade(sc), details: details || {} }, summary || []);
        },
      };

      function cardLayer(card) {
        const layer = U.el('div', 'pm-cardlayer');
        layer.appendChild(card);
        stage.appendChild(layer);
        return layer;
      }
      function dropLayer(layer) { layer.classList.add('is-out'); layer.style.pointerEvents = 'none'; s.after(320, () => layer.remove()); }

      function showIntro() {
        const card = U.el('div', 'pm-card pm-card--intro');
        const nd = 1 + Math.round(difficulty * 4);
        card.innerHTML = `
          <div class="pm-card__kicker">PRACTICE DRILL · ~${info.secs} SEC</div>
          <div class="pm-card__icon">${info.icon}</div>
          <div class="pm-card__title">${esc(info.name)}</div>
          <div class="pm-card__how">${(touch && impl.howTouch) || impl.how || esc(info.desc)}</div>
          <div class="pm-card__chips">${(info.trains || []).map(k => `<span>${esc(Mini.RATING_LABELS[k] || k)}</span>`).join('')}</div>
          <div class="pm-card__meta"><span>${esc(players.slice(0, 3).join(' · '))}${players.length > 3 ? ' +' + (players.length - 3) : ''}</span>
            <span class="pm-diff">DIFFICULTY ${[1, 2, 3, 4, 5].map(i => `<i class="${i <= nd ? 'on' : ''}"></i>`).join('')}</span></div>
          <button type="button" class="pm-cta" data-pm-nohold>${touch ? 'TAP TO START' : 'PRESS <kbd>SPACE</kbd> OR TAP TO START'}</button>
          <div class="pm-card__esc">${touch ? 'Tap ✕ to skip' : '<kbd>ESC</kbd> to skip'}</div>`;
        const layer = cardLayer(card), sc = s.scope();
        const go = () => {
          if (phase !== 'intro') return;
          phase = 'play';
          sc.dispose(); dropLayer(layer);
          api.scope = s.scope();
          Mini.sfx('start');
          s.guard(() => impl.start(api));
        };
        sc.key((e, k) => { if ((k === 'space' || k === 'enter') && !e.repeat) { go(); return true; } return false; });
        sc.on(layer, 'click', e => { e.preventDefault(); go(); });
        foot.innerHTML = esc(info.desc);
      }

      function showResults(res, summary) {
        const tone = U.gradeTone(res.grade);
        const card = U.el('div', 'pm-card pm-card--results');
        card.innerHTML = `
          <div class="pm-card__kicker">DRILL COMPLETE · ${esc(info.name)}</div>
          <div class="pm-grade pm-tone-${tone}">${res.grade}</div>
          <div class="pm-card__score"><b>${res.score}</b><span>/ 100</span></div>
          <div class="pm-card__verdict">${esc(VERDICT[res.grade] || '')}</div>
          ${summary.length ? `<div class="pm-stats">${summary.map(x => `<div><small>${esc(x[0])}</small><b>${esc(x[1])}</b></div>`).join('')}</div>` : ''}
          <button type="button" class="pm-cta" data-pm-nohold>${touch ? 'TAP TO CONTINUE' : 'PRESS <kbd>SPACE</kbd> TO CONTINUE'}</button>`;
        const layer = cardLayer(card);
        layer.classList.add('is-results');
        s.onCancel = () => s.finish(res);           // Esc after the drill keeps the earned grade
        Mini.sfx(res.grade === 'A+' ? 'perfect' : tone === 'bad' ? 'bad' : 'grade');
        if (tone === 'gold' || tone === 'good') api.flash(tone);
        let armed = false;
        s.after(700, () => { armed = true; layer.classList.add('is-armed'); });
        s.key((e, k) => { if ((k === 'space' || k === 'enter') && !e.repeat && armed) { s.finish(res); return true; } return k === 'space' || k === 'enter'; });
        s.on(layer, 'click', e => { e.preventDefault(); if (armed) s.finish(res); });
      }

      s.guard(showIntro);
    });
  };
})();
