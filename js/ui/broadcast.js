/* Pro BBALL Coach — TV graphics package for live games (PBC.Broadcast).
 * A DOM layer over the court canvas, styled like a national NBA broadcast: the score bug (with playoff series
 * strip, timeouts, bonus and shot clock), play-call tags, run graphics, lower-third player stat graphics with
 * pixel portraits, commentary captions, the opening "starting lineups" open, quarter / halftime cards,
 * instant-replay wipes and the final. */
(function () {
  'use strict';
  const PBC = window.PBC;
  const U = PBC.U, UI = PBC.UI;

  function create(host) {
    const S = host.S, g = host.g, T = host.teams, stakes = host.stakes;
    const layer = host.layer;
    if (!layer) return null;
    const on = () => S.settings.tvGraphics !== false;
    const live = layer.closest('.live');
    if (live) live.classList.add('has-bc');
    const col = i => T[i].colors.primary, col2 = i => T[i].colors.secondary;
    const tcss = i => `--c:${col(i)};--c2:${col2(i)};--ct:${U.textOn(col(i))}`;
    const esc = U.esc;
    layer.innerHTML = `
      <div class="bc-tag" id="bc-tag"></div>
      <div class="bc-run" id="bc-run"></div>
      <div class="bc-l3" id="bc-l3"></div>
      <div class="bc-cap" id="bc-cap"></div>
      <div class="bc-bug-wrap">
        ${stakes.playoff ? `<div class="bc-po ${stakes.roundName === 'Finals' ? 'finals' : ''}">${esc(stakes.label || 'PLAYOFFS')}</div>` : ''}
        <div class="bc-bug" id="bc-bug">
          ${[1, 0].map(i => `<div class="bb-team" style="${tcss(i)}"><span class="bb-badge">${UI.teamBadge(T[i], 30)}</span><span class="bb-ab">${esc(T[i].abbr)}</span><span class="bb-sc" id="bb-sc${i}">0</span><span class="bb-sub"><i class="bb-to" id="bb-to${i}"></i><i class="bb-bonus" id="bb-bo${i}">BONUS</i></span></div>`).join('')}
          <div class="bb-clock"><span class="bb-per" id="bb-per">1ST</span><span class="bb-clk" id="bb-clk">12:00</span><span class="bb-shot" id="bb-shot">24</span></div>
        </div>
      </div>
      <div class="bc-card" id="bc-card"></div>
      <div class="bc-replay" id="bc-replay"></div>`;
    const $ = id => layer.querySelector('#' + id);
    const B = { last: {}, tagT: 0, runT: 0, l3T: 0, capT: 0, l3Queue: [], lastL3: -99, possN: 0, scored: {}, streak: {}, view: host.view, final: false };

    // ---------------------------------------------------------- bug
    function setText(el, v) { if (el && el._v !== v) { el._v = v; el.textContent = v; } }
    function perLabel(p) { return p <= g.L.periods ? ['1ST', '2ND', '3RD', '4TH', '5TH'][p - 1] : (p - g.L.periods > 1 ? (p - g.L.periods) + 'OT' : 'OT'); }
    function clockTxt(c) { c = Math.max(0, c); if (c < 60) return c.toFixed(1); const s = Math.ceil(c - 1e-9), m = Math.floor(s / 60), r = s % 60; return m + ':' + (r < 10 ? '0' : '') + r; }
    function renderBug(s) {
      for (const i of [0, 1]) {
        setText($('bb-sc' + i), String(s.score[i]));
        const to = $('bb-to' + i);
        if (to && to._v !== s.timeouts[i]) { to._v = s.timeouts[i]; to.innerHTML = '<b></b>'.repeat(Math.max(0, Math.min(7, s.timeouts[i]))); }
        const bo = $('bb-bo' + i); if (bo) bo.classList.toggle('on', !!s.bonus[i]);
      }
      setText($('bb-per'), s.final ? 'FINAL' : perLabel(s.period));
      setText($('bb-clk'), s.final ? '' : clockTxt(s.clock));
      const sh = $('bb-shot');
      if (sh) {
        const v = s.shotClock == null || s.final ? '' : String(Math.ceil(Math.max(0, s.shotClock)));
        setText(sh, v);
        sh.classList.toggle('low', s.shotClock != null && s.shotClock <= 5 && s.shotClock > 0);
      }
      const bug = $('bc-bug');
      if (bug) bug.classList.toggle('poss0', s.off === 0), bug.classList.toggle('poss1', s.off === 1);
    }

    // ---------------------------------------------------------- tags, runs, lower thirds, captions
    function tag(html, i, secs) {
      if (!on()) return;
      const el = $('bc-tag');
      el.setAttribute('style', i != null ? tcss(i) : '');
      el.innerHTML = html;
      el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
      B.tagT = secs || 3.2;
    }
    function showRun(i, pts) {
      if (!on()) return;
      const el = $('bc-run');
      el.setAttribute('style', tcss(i));
      el.innerHTML = `<span class="rn-ab">${esc(T[i].abbr)}</span><span class="rn-n">${pts}-0</span><span class="rn-l">RUN</span>`;
      el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
      B.runT = 4.5;
    }
    function lowerThird(c, teamIdx, headline, secs) {
      if (!on() || !c) return;
      const p = c.p || S.players[c.id];
      const s = c.st, reb = s.orb + s.drb;
      const parts = [`<b>${s.pts}</b> PTS`, `${s.fgm}-${s.fga} FG`];
      if (s.tpa) parts.push(`${s.tpm}-${s.tpa} 3PT`);
      if (reb >= 3) parts.push(`<b>${reb}</b> REB`);
      if (s.ast >= 3) parts.push(`<b>${s.ast}</b> AST`);
      if (s.stl + s.blk >= 3) parts.push(`${s.stl} STL ${s.blk} BLK`);
      const per = p && PBC.Persona ? PBC.Persona.info(p) : null;
      const el = $('bc-l3');
      el.setAttribute('style', tcss(teamIdx));
      el.innerHTML = `<div class="l3-por">${UI.avatar(p, 64)}</div>
        <div class="l3-body"><div class="l3-top"><span class="l3-num">#${p ? p.num : ''}</span><span class="l3-name">${esc(p ? (p.first + ' ' + p.last) : c.name).toUpperCase()}</span>${headline ? `<span class="l3-hl">${esc(headline)}</span>` : ''}</div>
        <div class="l3-stats">${parts.join('<i>·</i>')}</div>${per ? `<div class="l3-pers">${per.icon} ${esc(per.label)}</div>` : ''}</div>`;
      el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
      B.l3T = secs || 5;
      B.lastL3 = B.possN;
    }
    const pcOf = id => { for (const Tm of g.t) { const c = Tm.players.find(x => x.id === id); if (c) return { c, i: Tm.idx }; } return null; };

    // ---------------------------------------------------------- cards
    function card(html, cls) {
      const el = $('bc-card');
      el.className = 'bc-card on ' + (cls || '');
      el.innerHTML = html + '<button class="bc-skip">Skip ▸</button>';
    }
    function hideCard() { const el = $('bc-card'); el.classList.remove('on'); setTimeout(() => { if (!el.classList.contains('on')) el.innerHTML = ''; }, 400); }
    function teamStats(bx, i) {
      const t = bx.teams[i];
      const pct = (m, a) => (a ? Math.round(m / a * 100) + '%' : '-');
      return { fg: pct(t.fgm, t.fga), tp: `${t.tpm}-${t.tpa}`, ft: `${t.ftm}-${t.fta}`, reb: t.orb + t.drb, ast: t.ast, tov: t.tov, stl: t.stl, blk: t.blk };
    }

    const api = {
      setView(v) { B.view = v; },
      update(dt, s) {
        renderBug(s);
        const tick = (k, el) => { if (B[k] > 0) { B[k] -= dt; if (B[k] <= 0) { const e = $(el); if (e) e.classList.remove('on'); } } };
        tick('tagT', 'bc-tag'); tick('runT', 'bc-run'); tick('l3T', 'bc-l3'); tick('capT', 'bc-cap');
        const rp = $('bc-replay');
        if (rp && rp.classList.contains('on') && B.view && B.view.replayProgress) {
          const bar = rp.querySelector('.rp-bar i'); if (bar) bar.style.width = Math.round(B.view.replayProgress() * 100) + '%';
        }
      },
      flash(i) { const el = $('bb-sc' + i); if (el) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); } },
      onPossession(P) {
        B.possN++;
        if (P.setName && P.play !== 'transition' && Math.random() < 0.55) tag(`<span class="tg-ab">${esc(T[P.off].abbr)}</span><span class="tg-t">${esc(P.setName)}</span>`, P.off, 2.8);
        else if (P.play === 'transition' && Math.random() < 0.25) tag(`<span class="tg-ab">${esc(T[P.off].abbr)}</span><span class="tg-t">FAST BREAK</span>`, P.off, 2);
      },
      onEvent(ev, P, sc) {
        if (!on()) return;
        if (ev.type === 'score') {
          const sh = ev.shotEvent || {};
          const x = pcOf(sh.shooter);
          if (x) {
            const c = x.c;
            B.streak[c.id] = (B.streak[c.id] || 0) + 1;
            for (const id in B.streak) if (+id !== c.id && pcOf(+id) && pcOf(+id).i === x.i) B.streak[id] = 0;
            const pts = c.st.pts, prev = B.scored[c.id] || 0;
            B.scored[c.id] = pts;
            const milestone = [10, 20, 30, 40, 50].find(m => pts >= m && prev < m);
            let hl = '';
            if (milestone >= 20) hl = milestone + ' POINT NIGHT';
            else if (B.streak[c.id] >= 3) hl = B.streak[c.id] + ' STRAIGHT BUCKETS';
            else if (c.st.tpm >= 4 && sh.pts === 3) hl = c.st.tpm + ' THREES';
            else if (sh.kind === 'dunk' || sh.kind === 'alley') hl = sh.kind === 'alley' ? 'ALLEY-OOP' : 'SLAM';
            else if (sh.andOne) hl = 'AND ONE';
            if ((hl && B.possN - B.lastL3 >= 2) || (milestone && B.possN - B.lastL3 >= 1)) lowerThird(c, x.i, hl, 5.5);
            else if (B.possN - B.lastL3 >= 9 && pts >= 8 && Math.random() < 0.35) lowerThird(c, x.i, '', 4.5);
          }
          const run = g.run || {};
          if (run.pts >= 8 && run.team === ev.team && (run.pts === 8 || run.pts % 4 === 0)) showRun(ev.team, run.pts);
        } else if (ev.type === 'timeout') {
          tag(`<span class="tg-ab">${esc(T[ev.team].abbr)}</span><span class="tg-t">TIMEOUT</span>`, ev.team, 3.5);
        } else if (ev.type === 'shot' && ev.blocked) {
          const x = pcOf(ev.blocker);
          if (x && x.c.st.blk >= 3 && B.possN - B.lastL3 >= 2) lowerThird(x.c, x.i, x.c.st.blk + ' BLOCKS', 4.5);
        } else if (ev.type === 'ft' && ev.num === 1 && B.possN - B.lastL3 >= 6 && Math.random() < 0.45) {
          const x = pcOf(ev.shooter);
          if (x && x.c.st.pts >= 6) lowerThird(x.c, x.i, '', 4.2);
        } else if (ev.type === 'sub') {
          const x = pcOf(ev.in);
          if (x && x.c.p && x.c.p.ovr >= 84 && x.c.sec > 60 && Math.random() < 0.4 && B.possN - B.lastL3 >= 4) lowerThird(x.c, x.i, 'CHECKS IN', 3.5);
        }
        void P; void sc;
      },
      caption(name, text, who, durMs) {
        const el = $('bc-cap');
        if (!name || !text) { el.classList.remove('on'); return; }
        el.className = 'bc-cap ' + (who === 'color' ? 'clr' : 'pbp');
        el.innerHTML = `<span class="cp-n">${esc(name)}</span><span class="cp-t">${esc(text)}</span>`;
        el.classList.add('on');
        B.capT = Math.max(2.2, (durMs || 2500) / 1000 + 0.6);
      },
      showIntro(gm, stk) {
        const five = i => gm.t[i].on.map(c => c.p);
        const st = PBC.League.standings(S);
        const rec = i => { const r = st[T[i].id]; return r ? `${r.w}-${r.l}` : ''; };
        const side = i => `<div class="in-team" style="${tcss(i)}">
            <div class="in-head">${UI.teamBadge(T[i], 64)}<div><div class="in-city">${esc(T[i].city)}</div><div class="in-name">${esc(T[i].name)}</div><div class="in-rec">${rec(i)}${i === 0 ? ' · HOME' : ' · AWAY'}</div></div></div>
            <div class="in-five">${five(i).map(p => `<div class="in-p">${UI.avatar(p, 72)}<div class="in-pn">${esc(p.last).toUpperCase()}</div><div class="in-pi">${p.pos} · #${p.num}</div></div>`).join('')}</div></div>`;
        card(`<div class="in-live"><span class="dot"></span>LIVE</div>
          ${stk.playoff ? `<div class="in-po">${esc(stk.label)}</div>` : `<div class="in-po reg">${esc((PBC.UI && PBC.UI.teamArena ? PBC.UI.teamArena(T[0]) : T[0].arena) || T[0].city)}</div>`}
          <div class="in-title">STARTING LINEUPS</div>
          <div class="in-teams">${side(1)}<div class="in-vs">AT</div>${side(0)}</div>`, 'intro');
      },
      hideIntro() { hideCard(); },
      showPeriodCard(per, bx) {
        if (!on()) return;
        const L = g.L;
        const title = per === 2 ? 'HALFTIME' : per >= L.periods && bx.hs === bx.as ? 'END OF REGULATION' : per > L.periods ? 'END OF OVERTIME' : `END OF THE ${['1ST', '2ND', '3RD', '4TH'][per - 1]} QUARTER`;
        const s0 = teamStats(bx, 0), s1 = teamStats(bx, 1);
        const rows = [['FG%', 'fg'], ['3PT', 'tp'], ['FT', 'ft'], ['REB', 'reb'], ['AST', 'ast'], ['TOV', 'tov']];
        const top = i => U.maxBy(bx.teams[i].players.filter(x => !x.dnp), x => x.pts + (x.orb + x.drb) * 0.5 + x.ast * 0.7);
        const perf = i => { const x = top(i); if (!x) return ''; const p = S.players[x.pid]; return `<div class="pc-top" style="${tcss(i)}">${UI.avatar(p, 58)}<div><div class="pc-tn">${esc(p.first[0] + '. ' + p.last).toUpperCase()}</div><div class="pc-ts">${x.pts} PTS · ${x.orb + x.drb} REB · ${x.ast} AST</div></div></div>`; };
        const periods = Math.max(L.periods, bx.q[0].length);
        card(`<div class="pc-title">${title}</div>
          <table class="pc-ls"><thead><tr><th></th>${Array.from({ length: periods }, (_, q) => `<th>${q < L.periods ? q + 1 : 'OT' + (q - L.periods ? q - L.periods + 1 : '')}</th>`).join('')}<th>T</th></tr></thead>
          <tbody>${[1, 0].map(i => `<tr style="${tcss(i)}"><td class="ab">${esc(T[i].abbr)}</td>${Array.from({ length: periods }, (_, q) => `<td>${bx.q[i][q] != null ? bx.q[i][q] : '-'}</td>`).join('')}<td class="tot">${i ? bx.as : bx.hs}</td></tr>`).join('')}</tbody></table>
          <div class="pc-cmp">${rows.map(([l, k]) => `<div class="pc-row"><span class="a">${s1[k]}</span><span class="l">${l}</span><span class="h">${s0[k]}</span></div>`).join('')}</div>
          <div class="pc-tops">${perf(1)}${perf(0)}</div>`, 'period');
      },
      hidePeriodCard() { hideCard(); },
      replayOn(hl) {
        const el = $('bc-replay');
        el.setAttribute('style', hl.team != null ? tcss(hl.team) : '');
        el.innerHTML = `<div class="rp-wipe"></div><div class="rp-bug"><span class="rp-r">REPLAY</span><span class="rp-l">${esc(hl.label || 'INSTANT REPLAY')}</span></div><div class="rp-bar"><i></i></div><button class="bc-skip">Skip ▸</button>`;
        el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
      },
      replayOff() { const el = $('bc-replay'); el.classList.remove('on'); el.classList.add('out'); setTimeout(() => { el.classList.remove('out'); if (!el.classList.contains('on')) el.innerHTML = ''; }, 500); },
      onFinal(box) {
        B.final = true;
        const bug = $('bc-bug'); if (bug) bug.classList.add('final');
        const w = box.hs > box.as ? 0 : 1;
        tag(`<span class="tg-ab">FINAL</span><span class="tg-t">${esc(T[w].name).toUpperCase()} WIN</span>`, w, 30);
      },
      destroy() { layer.innerHTML = ''; if (live) live.classList.remove('has-bc'); },
    };
    return api;
  }

  PBC.Broadcast = { create };
})();
