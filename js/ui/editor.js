/* Pro BBALL Coach — player editor (Hoop Land-style full customization).
 * Edit any player: identity, all 27 ratings + potential, appearance.
 * Previews reuse the in-game assets: UI.avatar (SVG portrait) and
 * PBC.Match.Pixel (the same procedural chibi sprite the retro court draws),
 * plus the player's real team colors. */
(function () {
  'use strict';
  const PBC = window.PBC;
  const U = PBC.U, C = PBC.Config, UI = PBC.UI;

  const HAIR = {
    m: ['fade', 'buzz', 'braids', 'locs', 'afro', 'bald', 'hightop', 'curly', 'waves', 'mohawk', 'twists'],
    f: ['ponytail', 'bun', 'braids', 'locs', 'long', 'bob', 'puffs', 'curly', 'twists', 'fade', 'buzz'],
  };
  const HAIR_LABEL = { fade: 'Fade', buzz: 'Buzz', braids: 'Braids', locs: 'Locs', afro: 'Afro', bald: 'Bald', hightop: 'High-top', curly: 'Curly', waves: 'Waves', mohawk: 'Mohawk', twists: 'Twists', ponytail: 'Ponytail', bun: 'Bun', long: 'Long', bob: 'Bob', puffs: 'Puffs' };
  const BEARDS = ['none', 'stubble', 'full', 'goatee', 'mustache'];
  const SLEEVES = ['none', 'left', 'right', 'both'];
  const TATS = ['none', 'arms', 'sleeve', 'chest'];
  const HB = [['none', 'None'], ['team', 'Team color'], ['#ffffff', 'White'], ['#111111', 'Black']];

  let edTeam = 'mine', edQ = '';

  UI.addNav({ key: 'editor', label: 'Player Editor', icon: '✏️', group: 'Front Office' });

  // ---------------------------------------------------------------------------
  // Editor browser screen
  // ---------------------------------------------------------------------------
  UI.register('editor', {
    title: 'Player Editor',
    render(root) {
      const S = UI.S;
      const teams = S.teams;
      const opt = (v, l) => `<option value="${v}" ${edTeam === v ? 'selected' : ''}>${l}</option>`;
      root.innerHTML = `<div class="page"><div class="page-h"><div><h1>✏️ Player Editor</h1>
        <div class="sub">Edit any player — ratings, appearance, jersey number. Previews use the same avatar and pixel sprite the game draws.</div></div>
        <div class="actions row"><select class="inp" id="ed-team" style="min-width:220px">
          ${opt('mine', 'My team — ' + teams[S.userTid].abbr)}
          ${opt('all', 'Every team')}${teams.map(t => opt('t' + t.id, t.city + ' ' + t.name)).join('')}
          ${opt('fa', 'Free agents')}${opt('prospects', 'Draft prospects')}
        </select><input class="inp" id="ed-q" placeholder="Search name…" value="${U.esc(edQ)}" style="min-width:180px"></div></div>
        <div class="card"><div class="card-b flush" id="ed-list"></div></div></div>`;
      const list = root.querySelector('#ed-list');
      const draw = () => {
        const q = edQ.trim().toLowerCase();
        let arr = Object.values(S.players).filter(p => p.tid !== -3);
        if (edTeam === 'mine') arr = arr.filter(p => p.tid === S.userTid);
        else if (edTeam === 'fa') arr = arr.filter(p => p.tid === -1);
        else if (edTeam === 'prospects') arr = arr.filter(p => p.tid === -2);
        else if (edTeam === 'all') { /* everyone */ }
        else if (edTeam[0] === 't') arr = arr.filter(p => p.tid === +edTeam.slice(1));
        if (q) arr = arr.filter(p => (p.first + ' ' + p.last).toLowerCase().includes(q));
        arr = U.sortBy(arr, p => p.ovr, true).slice(0, 120);
        list.innerHTML = arr.length ? arr.map(p => {
          const t = p.tid >= 0 ? S.teams[p.tid] : null;
          return `<div class="li ed-row"><span class="row nowrap" style="flex:1;min-width:0">${UI.avatar(p, 34)}
            <span class="ellip"><b>${U.esc(p.first)} ${U.esc(p.last)}</b> <span class="dim tiny">#${p.num} · ${p.pos} · ${U.esc(p.arch || '')}</span>
            <div class="tiny dim">${t ? U.esc(t.abbr) : p.tid === -1 ? 'FA' : 'Prospect'} · ${p.age}y · ${U.height(p.hgt)}</div></span></span>
            ${UI.ovr(p.ovr)}<button class="btn sm" data-edit="${p.id}">✏️ Edit</button></div>`;
        }).join('') : '<div class="empty">No players match.</div>';
      };
      draw();
      root.querySelector('#ed-team').onchange = e => { edTeam = e.target.value; draw(); };
      root.querySelector('#ed-q').oninput = e => { edQ = e.target.value; draw(); };
      UI.on(root, 'click', '[data-edit]', (e, el) => UI.openPlayerEditor(+el.dataset.edit));
    },
  });

  // ---------------------------------------------------------------------------
  // Editor modal
  // ---------------------------------------------------------------------------
  function teamLookFor(S, p) {
    const t = p.tid >= 0 && S.teams[p.tid] ? S.teams[p.tid] : null;
    if (!t) return { uniform: { jersey: '#3b475f', number: '#ffffff', trim: '#8d99b0', shorts: '#3b475f' } };
    const pri = t.colors.primary, sec = t.colors.secondary;
    return { uniform: { jersey: pri, number: U.textOn(pri) === '#ffffff' ? '#ffffff' : sec, trim: sec, shorts: pri } };
  }

  UI.openPlayerEditor = function (pid) {
    const S = UI.S;
    const p = S.players[pid];
    if (!p || p.tid === -3) { UI.toast('Retired players cannot be edited.', 'bad'); return; }
    // draft working copy
    const d = {
      first: p.first, last: p.last, num: p.num, pos: p.pos, arch: p.arch,
      hgt: p.hgt, wgt: p.wgt, wing: p.wing, hand: p.hand, age: p.age, gender: p.gender,
      r: Object.assign({}, p.r), pot: p.pot, look: JSON.parse(JSON.stringify(p.look)),
    };
    const body = UI.h('<div class="ed"></div>');
    const archOpts = () => Object.keys(C.ARCHETYPES[d.pos] || {}).map(a => `<option ${d.arch === a ? 'selected' : ''}>${U.esc(a)}</option>`).join('');
    const hairOpts = () => (HAIR[d.gender === 'f' ? 'f' : 'm']).map(h => `<option value="${h}" ${d.look.hair === h ? 'selected' : ''}>${HAIR_LABEL[h] || h}</option>`).join('');
    const swatches = (colors, cur, key) => colors.map(c => `<button class="sw ${String(cur).toLowerCase() === String(c).toLowerCase() ? 'on' : ''}" data-sw="${key}" data-v="${c}" style="background:${c}" title="${c}"></button>`).join('');
    const skinSw = () => C.SKIN_TONES.map((c, i) => `<button class="sw ${d.look.skin === i ? 'on' : ''}" data-sw="skin" data-v="${i}" style="background:${c}" title="tone ${i}"></button>`).join('');

    function ratingsHtml() {
      return C.RATING_GROUPS.map(g => `<div class="ed-group"><h4>${g}</h4>${C.RATINGS.filter(r => r.group === g).map(r =>
        `<label class="ed-rate"><span>${r.label}</span><input type="range" min="25" max="99" value="${d.r[r.key]}" data-r="${r.key}"><b id="edv-${r.key}">${d.r[r.key]}</b></label>`
      ).join('')}</div>`).join('');
    }

    function render() {
      const liveOvr = PBC.Player.calcOvr(d.r, d.pos);
      body.innerHTML = `
        <div class="ed-top">
          <div class="ed-prev"><div id="ed-avatar">${UI.avatar(Object.assign({}, p, { first: d.first, last: d.last, num: d.num, look: d.look, gender: d.gender }), 104)}</div>
            <canvas id="ed-pixel" width="120" height="140"></canvas>
            <div class="center"><div class="tiny dim up">OVR (live)</div><div id="ed-ovr">${UI.ovr(liveOvr, 'lg')}</div>
            <div class="tiny dim" style="margin-top:4px">was ${p.ovr} · POT <b id="ed-pot-lbl">${d.pot}</b></div></div></div>
          <div class="ed-id">
            <div class="row"><label>First<input class="inp" id="ed-first" value="${U.esc(d.first)}"></label>
              <label>Last<input class="inp" id="ed-last" value="${U.esc(d.last)}"></label></div>
            <div class="row">
              <label>#<input class="inp" id="ed-num" type="number" min="0" max="99" value="${d.num}"></label>
              <label>Pos<select class="inp" id="ed-pos">${C.POSITIONS.map(x => `<option ${d.pos === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
              <label>Archetype<select class="inp" id="ed-arch">${archOpts()}</select></label></div>
            <div class="row">
              <label>Age<input class="inp" id="ed-age" type="number" min="17" max="45" value="${d.age}"></label>
              <label>Ht (in)<input class="inp" id="ed-hgt" type="number" min="64" max="90" value="${d.hgt}"></label>
              <label>Wt<input class="inp" id="ed-wgt" type="number" min="140" max="330" value="${d.wgt}"></label></div>
            <div class="row">
              <label>Wing<input class="inp" id="ed-wing" type="number" min="64" max="96" value="${d.wing}"></label>
              <label>Hand<select class="inp" id="ed-hand"><option ${d.hand === 'R' ? 'selected' : ''}>R</option><option ${d.hand === 'L' ? 'selected' : ''}>L</option></select></label>
              <label>Gender<select class="inp" id="ed-gender"><option value="m" ${d.gender !== 'f' ? 'selected' : ''}>Men's</option><option value="f" ${d.gender === 'f' ? 'selected' : ''}>Women's</option></select></label></div>
            <label class="ed-rate"><span>Potential</span><input type="range" min="25" max="99" value="${d.pot}" id="ed-pot"><b id="edv-pot">${d.pot}</b></label>
            <div class="ed-group"><h4>Appearance</h4>
              <div class="ed-sub">Skin</div><div class="swrow">${skinSw()}</div>
              <div class="row"><label>Hair<select class="inp" id="ed-hair">${hairOpts()}</select></label>
                <label>Beard<select class="inp" id="ed-beard">${BEARDS.map(b => `<option ${d.look.beard === b ? 'selected' : ''}>${b}</option>`).join('')}</select></label></div>
              <div class="ed-sub">Hair color</div><div class="swrow">${swatches(C.HAIR_COLORS, d.look.hairColor, 'hairColor')}</div>
              <div class="row"><label>Headband<select class="inp" id="ed-hb">${HB.map(([v, l]) => `<option value="${v}" ${String(d.look.headband) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
                <label>Tattoo<select class="inp" id="ed-tat">${TATS.map(t => `<option ${d.look.tattoo === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label></div>
              <div class="row"><label>Arm sleeve<select class="inp" id="ed-as">${SLEEVES.map(s => `<option ${d.look.armSleeve === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
                <label>Leg sleeve<select class="inp" id="ed-ls">${SLEEVES.map(s => `<option ${d.look.legSleeve === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label></div>
              <div class="ed-sub">Shoes</div><div class="swrow">${swatches(C.SHOE_COLORS, d.look.shoe, 'shoe')}</div>
              <div class="ed-sub">Shoe accent</div><div class="swrow">${swatches(C.SHOE_COLORS, d.look.shoeAccent, 'shoeAccent')}</div>
              <label class="ed-rate"><span>Build (slim → big)</span><input type="range" min="0" max="100" value="${Math.round((d.look.build || 0.5) * 100)}" id="ed-build"><b id="edv-build">${Math.round((d.look.build || 0.5) * 100)}</b></label>
            </div>
          </div>
        </div>
        <div class="ed-ratings">${ratingsHtml()}</div>`;
      drawPixel();
    }

    function drawPixel() {
      const cv = body.querySelector('#ed-pixel');
      if (!cv) return;
      const ghost = Object.assign({}, p, { first: d.first, last: d.last, num: d.num, look: d.look, gender: d.gender });
      const tl = teamLookFor(S, p);
      try {
        if (PBC.Match && PBC.Match.Pixel) PBC.Match.Pixel.preview(cv, ghost, tl, 'stand');
        else { const g = cv.getContext('2d'); g.clearRect(0, 0, cv.width, cv.height); }
      } catch (e) { /* preview is best-effort */ }
      const ov = body.querySelector('#ed-ovr');
      if (ov) ov.innerHTML = UI.ovr(PBC.Player.calcOvr(d.r, d.pos), 'lg');
    }

    function refreshChrome() {
      const av = body.querySelector('#ed-avatar');
      if (av) av.innerHTML = UI.avatar(Object.assign({}, p, { first: d.first, last: d.last, num: d.num, look: d.look, gender: d.gender }), 104);
      drawPixel();
    }

    UI.on(body, 'input', '[data-r]', (e, el) => {
      d.r[el.dataset.r] = +el.value;
      const b = body.querySelector('#edv-' + el.dataset.r); if (b) b.textContent = el.value;
      drawPixel();
    });
    UI.on(body, 'input', '#ed-pot', (e, el) => {
      d.pot = +el.value;
      body.querySelector('#edv-pot').textContent = el.value;
      const l = body.querySelector('#ed-pot-lbl'); if (l) l.textContent = el.value;
    });
    UI.on(body, 'input', '#ed-build', (e, el) => {
      d.look.build = (+el.value) / 100;
      body.querySelector('#edv-build').textContent = el.value;
    });
    UI.on(body, 'change', '#ed-first,#ed-last', (e, el) => { d[el.id === 'ed-first' ? 'first' : 'last'] = el.value.trim() || d[el.id === 'ed-first' ? 'first' : 'last']; refreshChrome(); });
    UI.on(body, 'change', '#ed-num', (e, el) => { d.num = U.clamp(Math.round(+el.value || 0), 0, 99); el.value = d.num; refreshChrome(); });
    UI.on(body, 'change', '#ed-pos', (e, el) => {
      d.pos = el.value;
      const archs = Object.keys(C.ARCHETYPES[d.pos] || {});
      if (!archs.includes(d.arch)) d.arch = archs[0];
      render();
    });
    UI.on(body, 'change', '#ed-arch', (e, el) => { d.arch = el.value; });
    UI.on(body, 'change', '#ed-age,#ed-hgt,#ed-wgt,#ed-wing', (e, el) => {
      const k = { 'ed-age': 'age', 'ed-hgt': 'hgt', 'ed-wgt': 'wgt', 'ed-wing': 'wing' }[el.id];
      d[k] = Math.round(+el.value || d[k]);
    });
    UI.on(body, 'change', '#ed-hand', (e, el) => { d.hand = el.value; });
    UI.on(body, 'change', '#ed-gender', (e, el) => {
      d.gender = el.value;
      const hairs = HAIR[d.gender === 'f' ? 'f' : 'm'];
      if (!hairs.includes(d.look.hair)) d.look.hair = hairs[0];
      if (d.gender === 'f') d.look.beard = 'none';
      render();
    });
    UI.on(body, 'change', '#ed-hair', (e, el) => { d.look.hair = el.value; if (d.look.hair === 'bald') d.look.hairColor = '#000000'; refreshChrome(); });
    UI.on(body, 'change', '#ed-beard', (e, el) => { d.look.beard = el.value; refreshChrome(); });
    UI.on(body, 'change', '#ed-hb', (e, el) => { d.look.headband = el.value === 'none' ? null : el.value; refreshChrome(); });
    UI.on(body, 'change', '#ed-tat', (e, el) => { d.look.tattoo = el.value; refreshChrome(); });
    UI.on(body, 'change', '#ed-as', (e, el) => { d.look.armSleeve = el.value; refreshChrome(); });
    UI.on(body, 'change', '#ed-ls', (e, el) => { d.look.legSleeve = el.value; refreshChrome(); });
    UI.on(body, 'click', '[data-sw]', (e, el) => {
      const k = el.dataset.sw, v = el.dataset.v;
      if (k === 'skin') d.look.skin = +v;
      else d.look[k] = v;
      body.querySelectorAll(`[data-sw="${k}"]`).forEach(b => b.classList.toggle('on', b === el));
      refreshChrome();
    });

    render();
    const m = UI.modal({
      title: `Edit player — ${U.esc(p.first)} ${U.esc(p.last)}`, body, wide: true,
      actions: [
        { label: 'Cancel', cls: 'ghost' },
        {
          label: '💾 Save', cls: 'primary', onClick: close => {
            d.first = (body.querySelector('#ed-first').value.trim() || d.first).slice(0, 18);
            d.last = (body.querySelector('#ed-last').value.trim() || d.last).slice(0, 20);
            Object.assign(p, {
              first: d.first, last: d.last, pos: d.pos, arch: d.arch,
              hgt: U.clamp(d.hgt, 64, 90), wgt: U.clamp(d.wgt, 140, 330), wing: U.clamp(d.wing, 64, 96),
              hand: d.hand, age: U.clamp(d.age, 17, 45), gender: d.gender,
              r: d.r, look: d.look,
            });
            p.pot = U.clamp(Math.round(d.pot), 25, 99);
            if (p.age <= 26 && p.pot < 0) p.pot = 0;
            // jersey number (keep unique on the team)
            p.num = U.clamp(Math.round(d.num), 0, 99);
            const dupe = Object.values(S.players).some(q => q.id !== p.id && q.tid === p.tid && q.num === p.num);
            if (dupe) PBC.Player.assignNumber(S, p);
            p.ovr = PBC.Player.calcOvr(p.r, p.pos);
            if (p.age <= 26 && p.pot < p.ovr) p.pot = p.ovr;
            UI.save(); close();
            UI.toast(`Saved ${PBC.Player.name(p)} — OVR ${p.ovr}`, 'good');
            UI.refresh();
          },
        },
      ],
    });
    return m;
  };
})();
