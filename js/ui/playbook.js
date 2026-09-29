/* Pro BBALL Coach — the team's playbook: the plays it runs (drawn as X's and O's), who fills each role on this
 * roster, the reads, the inbound plays, and the pick-and-roll coverage the defense plays. Plays come from the
 * library in js/core/playbook.js; the AI coach calls them in games (js/core/playcall.js). */
(function () {
  'use strict';
  const PBC = window.PBC;
  const U = PBC.U, C = PBC.Config, UI = PBC.UI;

  const ROLE_NAME = {
    handler: 'Ball handler', pnr: 'Pick-and-roll handler', screener: 'Screener (rolls)', popper: 'Screener (pops)', shooter: 'Shooter',
    spacer: 'Spacer', cutter: 'Cutter', post: 'Post man', passer: 'Hub / passer', scorer: 'Scorer', inbounder: 'Inbounder',
    dunker: 'Dunker spot', screen2: 'Screener',
  };
  const TAG_NAME = { ato: 'After timeouts', eog: 'End of game', need3: 'Need a three', three: 'Threes', zone: 'Vs zone', early: 'Early offense', twoForOne: 'Two-for-one' };
  const STEP_COL = ['#4dabf7', '#63e6be', '#ffa94d', '#f783ac'];
  let tab = 'offense';
  let statsSel = null; // (the Play stats tab's team, season and playoffs choice)

  // ------------------------------------------------------------ the diagram
  /** a half court (baseline at the top), the alignment, then each step's moves, screens, passes and drives */
  function diagram(play, w) {
    // (a play drawn on the whiteboard: its own drawing, js/ui/playdesigner.js)
    if (play.custom && play._src && UI.customPlayDiagram) return UI.customPlayDiagram(play._src, w);
    const s = w / 50, h = Math.round(34 * s);
    const X = (v) => (v * s).toFixed(1), Y = (u) => (Math.max(-1.5, u) * s + 4).toFixed(1);
    const o = [];
    o.push(`<svg class="pb-dia" viewBox="0 0 ${w} ${h + 8}" width="${w}" height="${h + 8}">`);
    o.push(`<defs>${STEP_COL.map((c, i) => `<marker id="pbA${i}" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="${c}"/></marker>`).join('')}</defs>`);
    o.push(`<rect x="0" y="0" width="${w}" height="${h + 8}" rx="6" fill="#161b24"/>`);
    // lines: baseline, lane, free-throw circle, three-point line, rim
    const L = '#3a4558';
    o.push(`<line x1="0" y1="${Y(0)}" x2="${w}" y2="${Y(0)}" stroke="${L}"/>`);
    o.push(`<rect x="${X(17)}" y="${Y(0)}" width="${(16 * s).toFixed(1)}" height="${(19 * s).toFixed(1)}" fill="rgba(255,255,255,0.025)" stroke="${L}"/>`);
    o.push(`<path d="M ${X(19)} ${Y(19)} A ${(6 * s).toFixed(1)} ${(6 * s).toFixed(1)} 0 0 0 ${X(31)} ${Y(19)}" fill="none" stroke="${L}"/>`);
    o.push(`<path d="M ${X(3)} ${Y(0)} L ${X(3)} ${Y(14)} A ${(23.75 * s).toFixed(1)} ${(23.75 * s).toFixed(1)} 0 0 0 ${X(47)} ${Y(14)} L ${X(47)} ${Y(0)}" fill="none" stroke="${L}"/>`);
    o.push(`<circle cx="${X(25)}" cy="${Y(5.25)}" r="${(0.9 * s).toFixed(1)}" fill="none" stroke="#e8590c" stroke-width="1.4"/>`);
    const roles = Object.keys(play.roles);
    const num = {};
    roles.forEach((r, i) => { num[r] = i + 1; });
    let pos = {};
    for (const r of roles) pos[r] = play.align[r].slice();
    const holder0 = play.start || (play.roles.ball ? 'ball' : play.inbound ? 'inb' : roles[0]);
    let holder = holder0;
    play.steps.forEach((st, k) => {
      const col = STEP_COL[k % STEP_COL.length], mk = `url(#pbA${k % STEP_COL.length})`;
      const next = Object.assign({}, pos);
      if (st.pos) for (const r in st.pos) next[r] = st.pos[r];
      for (const e of st.ev || []) {
        if (e[0] === 'screen') {
          // the screener's T, square to the man he screens for
          const sp = pos[e[1]], up = pos[e[2]];
          if (!sp || !up) continue;
          const du = up[0] - sp[0], dv = up[1] - sp[1], dl = Math.hypot(du, dv) || 1;
          const pu = -dv / dl * 2.4, pv = du / dl * 2.4;
          const cu = sp[0] + du / dl * 2.2, cv = sp[1] + dv / dl * 2.2;
          o.push(`<line x1="${X(sp[1])}" y1="${Y(sp[0])}" x2="${X(cv)}" y2="${Y(cu)}" stroke="${col}" stroke-width="1.6"/>`);
          o.push(`<line x1="${X(cv - pv)}" y1="${Y(cu - pu)}" x2="${X(cv + pv)}" y2="${Y(cu + pu)}" stroke="${col}" stroke-width="3.2" stroke-linecap="round"/>`);
        } else if (e[0] === 'pass' || e[0] === 'handoff') {
          const a = pos[e[1]], b = next[e[2]];
          if (!a || !b) continue;
          o.push(`<line x1="${X(a[1])}" y1="${Y(a[0])}" x2="${X(b[1])}" y2="${Y(b[0])}" stroke="${col}" stroke-width="1.3" stroke-dasharray="${e[0] === 'pass' ? '3,3' : '1,2'}" marker-end="${mk}"/>`);
          if (e[0] === 'handoff') {
            // (a hand-off: a hash mark across the line at the giver)
            const du = b[0] - a[0], dv = b[1] - a[1], dl = Math.hypot(du, dv) || 1, mu = a[0] + du / dl * 2.2, mv = a[1] + dv / dl * 2.2, pu = -dv / dl * 1.6, pv = du / dl * 1.6;
            o.push(`<line x1="${X(mv - pv)}" y1="${Y(mu - pu)}" x2="${X(mv + pv)}" y2="${Y(mu + pu)}" stroke="${col}" stroke-width="2.2" stroke-linecap="round"/>`);
          }
          holder = e[2];
        } else if (e[0] === 'move' && (e[2] === 'drive' || e[2] === 'backdown')) {
          // a dribble: a zig-zag toward the rim
          const a = pos[e[1]];
          if (!a) continue;
          const du = 5.25 - a[0], dv = 25 - a[1], dl = Math.hypot(du, dv) || 1, len = Math.min(dl - 3, e[2] === 'drive' ? 11 : 5);
          if (len <= 1) continue;
          const pts = [];
          for (let i = 0; i <= 8; i++) { const t = i / 8, side = i % 2 ? 0.9 : -0.9; pts.push([a[0] + du / dl * len * t - dv / dl * side * (i && i < 8 ? 1 : 0), a[1] + dv / dl * len * t + du / dl * side * (i && i < 8 ? 1 : 0)]); }
          o.push(`<polyline points="${pts.map((p) => X(p[1]) + ',' + Y(p[0])).join(' ')}" fill="none" stroke="${col}" stroke-width="1.3" marker-end="${mk}"/>`);
          next[e[1]] = pts[pts.length - 1];
        }
      }
      // the cuts and moves of this step
      for (const r of roles) {
        const a = pos[r], b = next[r];
        if (!a || !b || (Math.abs(a[0] - b[0]) < 0.5 && Math.abs(a[1] - b[1]) < 0.5)) continue;
        if (st.pos && st.pos[r]) o.push(`<line x1="${X(a[1])}" y1="${Y(a[0])}" x2="${X(b[1])}" y2="${Y(b[0])}" stroke="${col}" stroke-width="1.6" marker-end="${mk}"/>`);
      }
      pos = next;
    });
    // the players where they line up (the ball with the first one)
    for (const r of roles) {
      const a = play.align[r];
      const hasBall = r === holder0;
      o.push(`<circle cx="${X(a[1])}" cy="${Y(a[0])}" r="${(1.9 * s).toFixed(1)}" fill="#0b0e14" stroke="${hasBall ? '#ffd43b' : '#dee2e6'}" stroke-width="1.5"/>`);
      o.push(`<text x="${X(a[1])}" y="${(+Y(a[0]) + 3.2).toFixed(1)}" text-anchor="middle" font-size="${Math.round(2.6 * s)}" font-weight="800" fill="#f1f3f5" font-family="Arial">${num[r]}</text>`);
    }
    o.push('</svg>');
    return o.join('');
  }

  UI.playDiagram = diagram;
  UI.PLAY_STEP_COL = STEP_COL;
  UI.PLAY_ROLE_NAME = ROLE_NAME;
  UI.PLAY_TAG_NAME = TAG_NAME;

  // ------------------------------------------------------------ the page
  function starters(S, tid) {
    const t = S.teams[tid];
    const roster = PBC.League.roster(S, tid).filter((p) => !PBC.Player.isInjured(p));
    let five = t.rot && t.rot.starters ? t.rot.starters.map((id) => S.players[id]).filter((p) => p && p.tid === tid && !PBC.Player.isInjured(p)) : [];
    if (five.length < 5) five = five.concat(U.sortBy(roster.filter((p) => !five.includes(p)), (p) => p.ovr, true)).slice(0, 5);
    return five;
  }
  function fitTag(f) {
    return f >= 76 ? ['Great fit', 'good'] : f >= 68 ? ['Good fit', 'good'] : f >= 60 ? ['OK fit', 'info'] : ['Poor fit', 'bad'];
  }
  function playCard(S, play, inBook, five) {
    const bf = five.length >= 5 ? PBC.Playbook.bestFit(play, five) : null;
    const ft = bf ? fitTag(bf.fit) : null;
    const roles = Object.keys(play.roles);
    const tags = play.tags.filter((t) => TAG_NAME[t]).map((t) => `<span class="tag ${t === 'ato' || t === 'eog' ? 'gold' : 'info'}">${TAG_NAME[t]}</span>`).join(' ');
    const who = roles.map((r, i) => {
      const p = bf && bf.roles[r];
      return `<div class="pb-role"><b>${i + 1}</b> <span class="muted">${U.esc(ROLE_NAME[play.roles[r]] || r)}</span>${p ? ' · ' + U.esc(PBC.Player.shortName(p)) : ''}</div>`;
    }).join('');
    const reads = play.opts.map((o) => `<li>${U.esc(o.label)}${o.safety ? '' : o.at < play.last ? ' <span class="tag good" title="An early read: taking it counts as the play working">early</span>' : ''}<span class="tiny dim"> · step ${o.at + 1}</span></li>`).join('');
    const steps = play.steps.map((st, i) => `<li><span class="pb-dot" style="background:${STEP_COL[i % STEP_COL.length]}"></span>${U.esc(st.text)}</li>`).join('');
    return `<div class="pb-card ${inBook ? 'on' : ''}">
      <div class="pb-top">${diagram(play, 176)}
        <div class="pb-info"><div class="pb-name">${U.esc(play.name)}</div>
          <div class="small muted">${U.esc(PBC.Playbook.FAMILY[play.family] || play.family)}${ft ? ` · <span class="tag ${ft[1]}">${ft[0]} ${Math.round(bf.fit)}</span>` : ''}</div>
          <div class="pb-tags">${tags}</div>
          <label class="chk small"><input type="checkbox" data-play="${play.id}" ${inBook ? 'checked' : ''}> In the playbook</label>
          <div class="row" style="gap:6px">${play.custom
            ? `<button class="btn sm" data-edit="${play.id}">✏️ Edit</button><button class="btn ghost sm" data-delplay="${play.id}" title="Delete this play">🗑</button>`
            : `<button class="btn ghost sm" data-from="${play.id}" title="Open a copy of it on the whiteboard to change it">✏️ Make it mine</button>`}</div>
        </div></div>
      <div class="small pb-desc">${U.esc(play.desc)}</div>
      <details class="pb-more"><summary class="small">Steps, reads and roles</summary>
        <ol class="pb-steps small">${steps}</ol>
        <div class="small muted up" style="margin:8px 0 4px">Reads</div><ul class="pb-reads small">${reads}</ul>
        <div class="small muted up" style="margin:8px 0 4px">Roles (your starters by fit)</div>${who}
      </details></div>`;
  }

  UI.register('playbook', {
    title: 'Playbook',
    render(root, params) {
      const S = UI.S;
      if (params && params.tab) { tab = params.tab; delete params.tab; }
      const team = S.teams[S.userTid];
      const book = PBC.Playbook.ensure(S, S.userTid);
      const five = starters(S, S.userTid);
      const all = Object.values(PBC.Playbook.PLAYS);
      const inBook = new Set(book.off);
      const isInb = (p) => p.family === 'blob' || p.family === 'slob';
      const sys = C.OFFENSES[team.strat.off] || C.OFFENSES.balanced;
      let body = '';
      if (tab === 'stats') {
        // each play's usage, points per possession, completion and breakdowns; the defense by scheme (js/ui/playstats.js)
        body = '<div data-ps-root></div>';
      } else if (tab === 'mine') {
        // the coach's own plays (the play designer), and any that need fixing before they can run
        const mine = all.filter((p) => p.custom);
        const broken = Object.values(S.customPlays || {}).filter((d) => !PBC.Playbook.PLAYS[d.id]);
        const fix = broken.map((d) => `<div class="pb-card"><div class="pb-name">${U.esc(d.name || 'Untitled play')}</div>
          <div class="small bad-t" style="margin:6px 0">Needs fixing before it can run: ${U.esc(PBC.Playbook.validateCustom(d)[0] || 'open it in the designer')}</div>
          <div class="row" style="gap:6px"><button class="btn sm" data-edit="${d.id}">✏️ Fix it</button><button class="btn ghost sm" data-delplay="${d.id}" title="Delete this play">🗑</button></div></div>`).join('');
        body = mine.length || broken.length
          ? `<div class="card"><div class="card-h"><h3>My plays</h3><div class="actions"><span class="small muted">${mine.length} play${mine.length > 1 ? 's' : ''} · ${mine.filter((p) => inBook.has(p.id)).length} in the playbook</span></div></div>
            <div class="card-b"><div class="pb-grid">${mine.map((p) => playCard(S, p, inBook.has(p.id), five)).join('')}${fix}</div></div></div>`
          : `<div class="card"><div class="card-b pb-empty"><div style="font-size:34px">📋</div><div class="pb-name">Draw your own plays</div>
              <div class="small muted" style="max-width:560px">On the whiteboard: line the five up, draw each step (cuts, screens, passes, hand-offs, drives), give every spot a role and pick the reads. Save it to your playbook and call it in a timeout; your staff can call it too. Or start from any play in the library and make it yours.</div>
              <button class="btn primary" data-act="design">✏️ Design a play</button></div></div>`;
      } else if (tab === 'offense' || tab === 'inbounds' || tab === 'library') {
        const list = all.filter((p) => (tab === 'inbounds' ? isInb(p) : !isInb(p)) && (tab === 'library' ? !inBook.has(p.id) : inBook.has(p.id)));
        const fams = {};
        for (const p of list) (fams[p.family] || (fams[p.family] = [])).push(p);
        const order = ['pnr', 'horns', 'offscreen', 'handoff', 'post', 'iso', 'cut', 'spot', 'zone', 'blob', 'slob'];
        body = order.filter((f) => fams[f]).map((f) => `<div class="card" style="margin-bottom:14px"><div class="card-h"><h3>${U.esc(PBC.Playbook.FAMILY[f] || f)}</h3><div class="actions"><span class="small muted">${fams[f].length} play${fams[f].length > 1 ? 's' : ''}</span></div></div>
          <div class="card-b"><div class="pb-grid">${fams[f].map((p) => playCard(S, p, inBook.has(p.id), five)).join('')}</div></div></div>`).join('')
          || `<div class="card"><div class="card-b muted">${tab === 'library' ? 'Every play in the library is already in your playbook.' : 'No plays here yet: add some from the Library tab.'}</div></div>`;
      } else {
        // defense: the scheme and the pick-and-roll coverage
        const def = C.DEFENSES[team.strat.def] || C.DEFENSES.man;
        const own = ['switch', 'drop', 'blitz', 'hedge'].includes(team.strat.def) ? team.strat.def : null;
        const zone = !!def.mods.isZone;
        const cov = PBC.Playbook.coverageFor(team.strat.def, book.def);
        const covFit = covFits(S, S.userTid);
        body = `<div class="card"><div class="card-h"><h3>Defensive scheme</h3><div class="actions"><button class="btn sm" data-go="strategy">Change it on the Strategy page</button></div></div>
            <div class="card-b"><div class="row" style="gap:10px;align-items:flex-start"><div style="font-size:28px">${def.icon || '🛡️'}</div><div><div class="pb-name">${U.esc(def.label)}</div><div class="small muted">${U.esc(def.desc)}</div></div></div></div></div>
          <div class="card" style="margin-top:14px"><div class="card-h"><h3>Pick-and-roll coverage</h3><div class="actions"><span class="small muted">${zone ? 'Your zone covers ball screens its own way' : own ? 'Set by your scheme: ' + U.esc(def.label) : 'Within your man-to-man'}</span></div></div>
            <div class="card-b"><p class="small muted" style="margin-top:0">How your two defenders play a ball screen. Every play the opponent runs is read against it: a drop gives up pull-up jumpers and protects the rim, a hedge or a blitz takes the ball out of the handler's hands but frees the roller and the weak side, a switch takes away the two-man game but can leave a big on a guard.</p>
            <div class="strat-grid">${Object.keys(PBC.Playbook.COVERAGES).map((k) => {
              const c = PBC.Playbook.COVERAGES[k], f = covFit[k];
              const locked = zone || own;
              return `<div class="strat-card ${cov === k ? 'on' : ''} ${locked ? 'locked' : ''}" data-cov="${k}"><div class="sc-t">${U.esc(c.label)}</div><div class="sc-d">${U.esc(c.desc)}</div>${f ? `<div class="fit"><span class="tag ${f[1]}">${f[0]}</span></div>` : ''}</div>`;
            }).join('')}</div></div></div>`;
      }
      const nOff = book.off.filter((id) => PBC.Playbook.PLAYS[id] && !isInb(PBC.Playbook.PLAYS[id])).length, nInb = book.off.length - nOff;
      root.innerHTML = `<div class="page">
        <div class="page-h"><div><h1>Playbook</h1><div class="sub">${nOff} half-court and late-game plays, ${nInb} inbound plays · ${U.esc(sys.label)} offense · ${book.auto ? 'built by your assistants for this roster' : 'your own selection'}</div></div>
          <div class="actions"><div class="tabs">${[['offense', 'Offense'], ['inbounds', 'Inbounds'], ['defense', 'Defense'], ['library', 'Library'], ['mine', 'My plays'], ['stats', '📊 Play stats']].map(([k, l]) => `<button class="tab ${tab === k ? 'active' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>
          <button class="btn primary" data-act="design">✏️ Design a play</button><button class="btn" data-act="rebuild">🤖 Rebuild for my roster</button></div></div>
        <div class="card pb-howto" style="margin-bottom:14px"><div class="card-b small muted">In games your coach calls plays from this book for each half-court possession: plays that fit the five on the floor, that the other team's defense opens up, that have been working tonight, and the right set for the moment (after a timeout, the last shot, a quick three, an inbound under the basket or from the sideline). Each play has reads: when the defense gives an opening before the last step, the players take it, and that counts as the play working. Some possessions are played in flow with no call. Diagrams: players numbered by role, the yellow circle has the ball; solid arrows are cuts, dashed ones passes, zig-zags dribbles, bars screens, two hash marks a hand-off; the colors follow the steps. Draw your own plays with ✏️ Design a play, or open any play here with ✏️ Make it mine and change it; call them in a timeout.</div></div>
        ${body}</div>`;
      UI.on(root, 'click', '[data-tab]', (e, el) => { tab = el.dataset.tab; UI.refresh(); });
      const psHost = root.querySelector('[data-ps-root]');
      if (psHost && UI.renderPlayStats) {
        const draw = () => UI.renderPlayStats(psHost, S, Object.assign({ tid: S.userTid }, statsSel, { onChange: (o) => { statsSel = o; draw(); } }));
        draw();
      }
      UI.on(root, 'click', '[data-go]', (e, el) => UI.go(el.dataset.go));
      UI.on(root, 'change', '[data-play]', (e, el) => {
        const id = el.dataset.play;
        const off = book.off.filter((x) => x !== id);
        if (el.checked) off.push(id);
        book.off = off; book.auto = false;
        UI.save(); UI.refresh();
        UI.toast(el.checked ? PBC.Playbook.PLAYS[id].name + ' is in your playbook' : PBC.Playbook.PLAYS[id].name + ' is out of your playbook', 'good');
      });
      UI.on(root, 'click', '[data-cov]', (e, el) => {
        if (el.classList.contains('locked')) { UI.toast('Your defensive scheme sets how you play ball screens: pick a man-to-man scheme on the Strategy page to choose one', 'warn'); return; }
        book.def = Object.assign({}, book.def, { pnr: el.dataset.cov }); book.auto = false;
        UI.save(); UI.refresh();
      });
      UI.on(root, 'click', '[data-act="rebuild"]', () => {
        // (the coach's own plays stay in the book)
        const mine = book.off.filter((id) => PBC.Playbook.PLAYS[id] && PBC.Playbook.PLAYS[id].custom);
        team.playbook = PBC.Playbook.build(S, S.userTid);
        for (const id of mine) if (!team.playbook.off.includes(id)) team.playbook.off.push(id);
        UI.save(); UI.refresh(); UI.toast('Your assistants rebuilt the playbook for this roster and system' + (mine.length ? ' (your own plays stay in it)' : ''), 'good');
      });
      UI.on(root, 'click', '[data-act="design"]', () => UI.designPlay({ kind: tab === 'inbounds' ? 'blob' : 'half', fresh: false }));
      UI.on(root, 'click', '[data-edit]', (e, el) => UI.designPlay({ id: el.dataset.edit }));
      UI.on(root, 'click', '[data-from]', (e, el) => UI.designPlay({ from: el.dataset.from }));
      UI.on(root, 'click', '[data-delplay]', async (e, el) => {
        const id = el.dataset.delplay, p = PBC.Playbook.PLAYS[id] || (S.customPlays || {})[id];
        if (!p || !(await UI.confirm(`Delete <b>${U.esc(p.name || 'this play')}</b>? It comes out of your playbook too.`, { ok: 'Delete', danger: true }))) return;
        UI.deleteCustomPlay(S, id);
        UI.refresh(); UI.toast(`${p.name} is deleted`, 'good');
      });
    },
  });

  /** how the roster suits each pick-and-roll coverage */
  function covFits(S, tid) {
    const top = PBC.League.roster(S, tid).filter((p) => !PBC.Player.isInjured(p)).slice(0, 8);
    if (!top.length) return {};
    const bigs = top.filter((p) => C.POS_NUM[p.pos] >= 4);
    const avg = (k, arr) => U.avg(arr && arr.length ? arr : top, (p) => p.r[k]);
    const best = (k, arr) => Math.max(...(arr && arr.length ? arr : top).map((p) => p.r[k]));
    const score = {
      drop: (best('block', bigs) - 74) / 5,
      show: 0.5,
      hedge: bigs.length ? ((avg('speed', bigs) + avg('agility', bigs)) / 2 - 60) / 5 : -1,
      blitz: (avg('steal') + avg('speed') - 128) / 7,
      switch: (Math.min(...top.slice(0, 6).map((p) => p.r.perD)) - 55) / 5,
      ice: (avg('perD') - 62) / 5,
    };
    const out = {};
    for (const k in score) { const v = U.clamp(score[k], -2, 2); out[k] = v >= 1 ? ['Great fit', 'good'] : v >= 0.2 ? ['Good fit', 'good'] : v >= -0.6 ? ['OK fit', 'info'] : ['Poor fit', 'bad']; }
    return out;
  }
})();
