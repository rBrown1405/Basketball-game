/* Pro BBALL Coach — Game Impact Moments: PBC.Mini.gimChoose (pick the play) + PBC.Mini.shotMeter (take the shot).
   Needs core.js, court.js, meter.js. */
(function () {
  'use strict';
  const Mini = window.PBC.Mini, U = Mini.util, esc = U.esc;
  const safeColor = c => (typeof c === 'string' && /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%deg]+\)|[a-z]{3,20})$/i.test(c.trim()) ? c.trim() : '#ff6b1a');

  // =====================================================================================
  // gimChoose(container, ctx) → Promise<{ index, auto?, cancelled? }>
  // ctx: { situation, teams:[{abbr,score,color}×2], userTeam, options:[{label,player,num,detail,pct,pts,kind}], timeLimit, type }
  // =====================================================================================
  Mini.gimChoose = function (container, ctx) {
    ctx = ctx || {};
    const opts = (Array.isArray(ctx.options) ? ctx.options : []).filter(Boolean).slice(0, 4);
    return new Promise(resolve => {
      if (!opts.length) { resolve({ index: 0, cancelled: true, error: 'no options' }); return; }
      const s = new Mini.Session(container, { cls: 'pbc-mini--gim', label: 'Game Impact Moment', resolve, fallback: () => ({ index: 0 }) });
      const limit = U.clamp(U.num(ctx.timeLimit, 12), 3, 60);
      const teams = Array.isArray(ctx.teams) ? ctx.teams.slice(0, 2) : [];
      const ut = ctx.userTeam === 1 ? 1 : 0;
      const buzzer = ctx.type === 'buzzer';

      const teamHtml = (t, i) => `
        <div class="pm-team${i === ut ? ' is-user' : ''}" style="--tc:${safeColor(t && t.color)}">
          <span class="pm-team__bar"></span>
          <span class="pm-team__abbr">${esc((t && t.abbr) || (i ? 'AWAY' : 'HOME'))}</span>
          <span class="pm-team__score">${esc(t && t.score != null ? t.score : '')}</span>
          ${i === ut ? '<span class="pm-team__you">YOU</span>' : ''}
        </div>`;
      const cardHtml = (o, i) => {
        const pct = typeof o.pct === 'number' && isFinite(o.pct) ? U.clamp(o.pct > 1 ? o.pct / 100 : o.pct, 0, 1) : null;
        const pts = U.num(o.pts, 0);
        const tone = pct == null ? 'muted' : U.pctTone(pct);
        return `
        <button type="button" class="pm-opt pm-tone-${tone}" data-i="${i}" style="--d:${0.18 + i * 0.07}s">
          <span class="pm-opt__top"><span class="pm-opt__key">${i + 1}</span>${pts ? `<span class="pm-opt__pts">${pts} PTS</span>` : ''}</span>
          <span class="pm-opt__player">${o.num != null && o.num !== '' ? `<b>#${esc(o.num)}</b> ` : ''}${esc(o.player || '')}</span>
          <span class="pm-opt__label">${esc(o.label || 'Shot')}</span>
          <span class="pm-opt__detail">${esc(o.detail || '')}</span>
          <span class="pm-opt__pct">${pct == null ? '<b>—</b>' : `<b>${Math.round(pct * 100)}</b><i>%</i>`}<small>EST. MAKE</small></span>
          <span class="pm-opt__bar"><span style="width:${pct == null ? 0 : Math.round(pct * 100)}%"></span></span>
          ${pct != null && pts ? `<span class="pm-opt__ev">EXP ${(pct * pts).toFixed(2)} PTS</span>` : ''}
        </button>`;
      };

      const box = U.el('div', 'pm-gim');
      box.innerHTML = `
        <div class="pm-gim__bg"></div>
        <div class="pm-gim__streaks"><i></i><i></i><i></i></div>
        <div class="pm-gim__banner">
          <div class="pm-gim__kicker"><span class="pm-gim__bolt">⚡</span>${buzzer ? 'BUZZER BEATER' : 'GAME IMPACT MOMENT'}</div>
          <div class="pm-gim__sit">${esc(ctx.situation || '')}</div>
        </div>
        ${teams.length === 2 ? `<div class="pm-gim__score">${teamHtml(teams[0], 0)}<div class="pm-gim__vs">VS</div>${teamHtml(teams[1], 1)}</div>` : ''}
        <div class="pm-gim__prompt">CALL YOUR SHOT</div>
        <div class="pm-gim__cards pm-n${opts.length}">${opts.map(cardHtml).join('')}</div>
        <div class="pm-gim__foot">
          <div class="pm-gim__timer"><i></i></div>
          <div class="pm-gim__hint"><span>${U.isTouch() ? 'Tap a play' : 'Press <kbd>1</kbd>–<kbd>' + opts.length + '</kbd> or click a play'}</span><b class="pm-gim__secs">${Math.ceil(limit)}</b></div>
        </div>`;
      s.root.appendChild(box);
      const cards = Array.from(box.querySelectorAll('.pm-opt'));
      const fill = box.querySelector('.pm-gim__timer i'), secs = box.querySelector('.pm-gim__secs');
      let hi = -1, chosen = false, lastSec = Math.ceil(limit);
      const t0 = U.now();
      Mini.sfx('impact');

      const highlight = i => { hi = i; cards.forEach((c, j) => c.classList.toggle('is-hi', j === i)); };
      function choose(i, auto) {
        if (chosen || !(i >= 0 && i < opts.length)) return;
        chosen = true;
        box.classList.add('is-chosen');
        cards.forEach((c, j) => c.classList.add(j === i ? 'is-picked' : 'is-dim'));
        Mini.sfx(auto ? 'buzzer' : 'select');
        const res = { index: i };
        if (auto) res.auto = true;
        s.after(auto ? 750 : 560, () => s.finish(res));
      }
      s.onCancel = () => s.finish({ index: 0, cancelled: true });
      cards.forEach((c, i) => {
        s.on(c, 'click', e => { e.preventDefault(); choose(i); });
        s.on(c, 'pointerenter', e => { if (e.pointerType === 'mouse' && !chosen) highlight(i); });
        s.on(c, 'focus', () => { if (!chosen) highlight(i); });
      });
      s.key((e, k) => {
        if (chosen) return true;
        if (/^[1-9]$/.test(k)) { const i = +k - 1; if (i < opts.length) { if (!e.repeat) choose(i); return true; } return false; }
        const d = U.dirOf(k);
        if (d === 'left' || d === 'up') { highlight(hi <= 0 ? opts.length - 1 : hi - 1); Mini.sfx('hover'); return true; }
        if (d === 'right' || d === 'down') { highlight(hi < 0 || hi >= opts.length - 1 ? 0 : hi + 1); Mini.sfx('hover'); return true; }
        if ((k === 'enter' || k === 'space') && !e.repeat) {
          // a card reached with Tab wins over the arrow/hover highlight
          const f = cards.indexOf(document.activeElement);
          const i = f >= 0 ? f : hi;
          if (i >= 0) choose(i);
          return true;
        }
        return false;
      });
      s.loop((dt, now) => {
        if (chosen) return;
        const left = Math.max(0, limit - (now - t0) / 1000);
        fill.style.transform = `scaleX(${left / limit})`;
        const sec = Math.ceil(left);
        if (sec !== lastSec) {
          lastSec = sec; secs.textContent = sec;
          if (sec <= 3 && sec > 0) { box.classList.add('is-urgent'); Mini.sfx('tick'); U.restartAnim(secs, 'is-pulse'); }
        }
        if (left <= 0) choose(0, true);
      });
    });
  };

  // =====================================================================================
  // shotMeter(container, opts) → Promise<{ quality, score, error, pos, cancelled? }>
  // opts: { label, player, num, pts, windowSize .03–.16, speed .8–1.3, contest, pressure 0–1, timeLimit, showHelp, feedbackMs }
  // =====================================================================================
  const CONTEST = { open: ['OPEN LOOK', 'good'], contested: ['CONTESTED', 'warn'], tight: ['TIGHTLY GUARDED', 'bad'] };
  const HELP_KEY = 'pbc.mini.meterHelpSeen';

  Mini.shotMeter = function (container, opts) {
    opts = opts || {};
    return new Promise(resolve => {
      const NONE = () => ({ quality: 'no_release', score: 0, error: null });
      const s = new Mini.Session(container, { cls: 'pbc-mini--meter', label: 'Shot meter', resolve, fallback: NONE });
      const meter = new Mini.Meter(opts);
      const limit = U.clamp(U.num(opts.timeLimit, 8), 2, 30);
      const touch = U.isTouch();
      const help = opts.showHelp != null ? !!opts.showHelp : !U.lsGet(HELP_KEY);
      const ct = CONTEST[opts.contest] || CONTEST.open;
      const pressure = U.clamp(U.num(opts.pressure, 0), 0, 1);

      const wrap = U.el('div', 'pm-sm');
      wrap.innerHTML = `
        <div class="pm-sm__scrim"></div>
        <div class="pm-sm__plate">
          <div class="pm-sm__tags"><span class="pm-tag pm-tone-${ct[1]}">${ct[0]}</span>${pressure >= 0.5 ? '<span class="pm-tag pm-tone-gold">CLUTCH</span>' : ''}</div>
          <div class="pm-sm__name">${opts.num != null && opts.num !== '' ? `<b>#${esc(opts.num)}</b>` : ''}${esc(opts.player || 'Shooter')}</div>
          <div class="pm-sm__label">${esc(opts.label || 'Jump shot')}${opts.pts ? ` <span>· ${esc(opts.pts)} PTS</span>` : ''}</div>
          <div class="pm-sm__clock"><i></i></div>
          <div class="pm-sm__hint">${touch ? 'HOLD ANYWHERE · RELEASE AT THE TOP' : 'HOLD <kbd>SPACE</kbd> OR MOUSE · RELEASE AT THE TOP'}</div>
        </div>
        <div class="pm-sm__meterbox"></div>
        <div class="pm-sm__fb"></div>
        ${help ? `<div class="pm-sm__help"><b>${touch ? 'Press &amp; hold' : 'Hold SPACE'}</b> to rise into your shot, <b>release</b> when the bar reaches the <span class="pm-c-good">green window</span> near the top. Gold centre = <span class="pm-c-gold">PERFECT</span>.</div>` : ''}`;
      const flash = U.el('div', 'pm-flash');
      s.root.appendChild(flash);
      s.root.appendChild(wrap);
      wrap.querySelector('.pm-sm__meterbox').appendChild(meter.el);
      const plate = wrap.querySelector('.pm-sm__plate'), fb = wrap.querySelector('.pm-sm__fb');
      const clock = wrap.querySelector('.pm-sm__clock i');
      const helpEl = wrap.querySelector('.pm-sm__help');
      let finished = false;
      const t0 = U.now();

      s.onCancel = () => s.finish(Object.assign(NONE(), { cancelled: true }));
      s.hold(s.root, () => {
        if (finished || !meter.press(U.now())) return;
        Mini.sfx('hold'); plate.classList.add('is-shooting');
        if (helpEl) helpEl.classList.add('is-gone');
      }, () => { const r = meter.release(U.now()); if (r) done(r); });

      function done(res) {
        if (finished) return;
        finished = true;
        const lab = Mini.releaseLabel(res.quality);
        fb.innerHTML = `<div class="pm-sm__kick">${res.quality === 'no_release' ? 'SHOT CLOCK' : 'RELEASE!'}</div><div class="pm-sm__big pm-tone-${lab[1]}">${lab[0]}</div><div class="pm-sm__sub">${res.error != null ? U.ms(res.error) + ' · ' + lab[2] : lab[2]}</div>`;
        U.restartAnim(fb, 'is-on');
        flash.className = 'pm-flash pm-tone-' + lab[1];
        U.restartAnim(flash, 'is-on');
        if (res.quality === 'perfect') { Mini.sfx('perfect'); U.restartAnim(wrap, 'is-perfect'); }
        else if (res.quality === 'good') Mini.sfx('good');
        else if (res.quality === 'no_release') Mini.sfx('buzzer');
        else { Mini.sfx('bad'); U.restartAnim(wrap, 'pm-shake'); }
        if (res.quality !== 'no_release') U.lsSet(HELP_KEY, '1');
        s.after(U.num(opts.feedbackMs, res.quality === 'perfect' ? 1150 : 950), () => s.finish(res));
      }

      s.loop((dt, now) => {
        const auto = meter.tick(now);
        if (auto) done(auto);
        meter.draw(now);
        if (!finished && meter.state === 'idle') {
          const left = limit - (now - t0) / 1000;
          clock.style.transform = `scaleX(${U.sat(left / limit)})`;
          if (left <= 0) done(NONE());
        }
      });
    });
  };
})();
