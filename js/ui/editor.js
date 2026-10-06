/* Pro BBALL Coach: player editor (Hoop Land-style full customization).
 * Edit any player: all 27 ratings + potential, identity, body and appearance, play-style tendencies (PBC.Tendency),
 * personality type / facial expression / traits / morale (PBC.Persona), contract and injury status.
 * The left column is the player as the game shows him: the in-game 3D model (UI.ModelView, js/ui/model3d.js: drag to
 * turn him, pick a framing and a move, home or away), the portrait and the retro court's pixel sprite, the live OVR
 * against what he was, the badges his ratings give him (new ones and lost ones marked) and the changes so far (undo, reset
 * all). Every changed field shows what it was; a rating goes back with its ↺. Nothing is saved until Save. */
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
  const cap = s => String(s).charAt(0).toUpperCase() + String(s).slice(1);

  // the list screen's filters, and the preview's choices (kept while the game is open)
  let edTeam = 'mine', edQ = '', edSort = 'ovr';
  const pv = { move: 'stand', view: 'full', home: false, spin: false };

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
      const SORTS = [['ovr', 'OVR'], ['pos', 'Position'], ['age', 'Age'], ['name', 'Name']];
      root.innerHTML = `<div class="page"><div class="page-h"><div><h1>✏️ Player Editor</h1>
        <div class="sub">Edit any player: ratings, looks and body, tendencies, personality, contract and health. The editor shows him as the game does: the 3D model, the portrait and the pixel sprite.</div></div>
        <div class="actions row"><select class="inp" id="ed-team" style="min-width:220px">
          ${opt('mine', 'My team: ' + teams[S.userTid].abbr)}
          ${opt('all', 'Every team')}${teams.map(t => opt('t' + t.id, t.city + ' ' + t.name)).join('')}
          ${opt('fa', 'Free agents')}${opt('prospects', 'Draft prospects')}
        </select><input class="inp" id="ed-q" placeholder="Search name…" value="${U.esc(edQ)}" style="min-width:180px">
        <div class="seg" id="ed-sort">${SORTS.map(([k, l]) => `<button class="${edSort === k ? 'on' : ''}" data-sort="${k}">${l}</button>`).join('')}</div></div></div>
        <div class="ed-list" id="ed-list"></div></div>`;
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
        if (edSort === 'name') arr = U.sortBy(arr, p => (p.last + ' ' + p.first).toLowerCase());
        else if (edSort === 'age') arr = U.sortBy(arr, p => p.age * 1000 - p.ovr);
        else if (edSort === 'pos') arr = U.sortBy(arr, p => C.POSITIONS.indexOf(p.pos) * 1000 - p.ovr);
        else arr = U.sortBy(arr, p => p.ovr, true);
        arr = arr.slice(0, 150);
        list.innerHTML = arr.length ? arr.map(p => {
          const t = p.tid >= 0 ? S.teams[p.tid] : null;
          return `<div class="ed-pc" data-edit="${p.id}" title="Edit ${U.esc(p.first + ' ' + p.last)}">${UI.avatar(p, 46)}
            <div class="ed-pc-t"><b>${U.esc(p.first)} ${U.esc(p.last)}</b>
              <div class="tiny dim">#${p.num} · ${p.pos} · ${t ? U.esc(t.abbr) : p.tid === -1 ? 'Free agent' : 'Prospect'} · ${p.age} yrs · ${U.height(p.hgt)}</div>
              <div class="tiny">${UI.styleTag ? UI.styleTag(p, 3) : U.esc(p.arch || '')}</div></div>
            ${UI.ovr(p.ovr)}<span class="ed-pc-go">✏️</span></div>`;
        }).join('') : '<div class="empty">No players match.</div>';
      };
      draw();
      root.querySelector('#ed-team').onchange = e => { edTeam = e.target.value; draw(); };
      root.querySelector('#ed-q').oninput = e => { edQ = e.target.value; draw(); };
      UI.on(root, 'click', '[data-sort]', (e, el) => { edSort = el.dataset.sort; root.querySelectorAll('[data-sort]').forEach(b => b.classList.toggle('on', b === el)); draw(); });
      UI.on(root, 'click', '[data-edit]', (e, el) => UI.openPlayerEditor(+el.dataset.edit));
    },
  });

  // ---------------------------------------------------------------------------
  // Editor modal
  // ---------------------------------------------------------------------------
  function teamLookFor(S, p) {
    const t = p.tid >= 0 && S.teams[p.tid] ? S.teams[p.tid] : null;
    if (!t) return { uniform: { jersey: '#3b475f', number: '#ffffff', trim: '#8d99b0', shorts: '#3b475f' } };
    if (UI.teamUniform) return { uniform: Object.assign({}, UI.teamUniform(t, false)) }; // the team's away set (Team Editor colors)
    const pri = t.colors.primary, sec = t.colors.secondary;
    return { uniform: { jersey: pri, number: U.textOn(pri) === '#ffffff' ? '#ffffff' : sec, trim: sec, shorts: pri } };
  }

  const TABS = [['ratings', 'Ratings'], ['looks', 'Looks & Body'], ['tend', 'Tendencies'], ['pers', 'Personality'], ['char', 'Contract & Health']];
  const TRAITS = [
    ['money', 'Money', 'How much salary matters in free agency.'], ['win', 'Winning', 'Wants to win now; unhappy on losing teams.'],
    ['loyal', 'Loyalty', 'Likes to stay put; gives hometown discounts.'], ['pt', 'Playing time', 'Needs minutes to stay happy.'],
    ['market', 'Big market', 'Wants the bright lights of a big city.'], ['ego', 'Ego', 'Wants the spotlight, the shots and the credit.'],
    ['work', 'Work ethic', 'Improves faster in practice and in the offseason.'],
  ];
  const IN_SEASON = { regular: 1, preseason: 1, playin: 1, playoffs: 1 };
  // the looks that change the model (the 3D one is rebuilt; the portrait and sprite repainted)
  const LOOK_KEYS = ['skin', 'hair', 'hairColor', 'beard', 'headband', 'tattoo', 'armSleeve', 'legSleeve', 'shoe', 'shoeAccent', 'build', 'face'];

  /** opts: { tab: 'ratings' | 'looks' | 'tend' | 'pers' | 'char' } ('main' is the ratings) */
  UI.openPlayerEditor = function (pid, opts) {
    const S = UI.S;
    const p = S.players[pid];
    if (!p || p.tid === -3) { UI.toast('Retired players cannot be edited.', 'bad'); return; }
    const L = PBC.League.cfg(S);
    const TD = PBC.Tendency, PS = PBC.Persona;
    const inSeason = !!IN_SEASON[S.phase];
    const yearsLeft = p.contract ? Math.max(1, p.contract.exp - S.season + (inSeason ? 1 : 0)) : 1;
    const team = p.tid >= 0 ? S.teams[p.tid] : null;
    // draft working copy
    const d = {
      first: p.first, last: p.last, num: p.num, pos: p.pos, arch: p.arch,
      hgt: p.hgt, wgt: p.wgt, wing: p.wing, hand: p.hand, age: p.age, gender: p.gender,
      r: Object.assign({}, p.r), pot: p.pot, look: JSON.parse(JSON.stringify(p.look)),
      nickname: p.nickname || '', origin: p.origin || '',
      pers: Object.assign({ money: 50, win: 50, loyal: 50, pt: 50, market: 50, ego: 50, work: 60 }, p.pers || {}),
      persType: (p.pers && p.pers.type && PS && PS.TYPES[p.pers.type]) ? p.pers.type : 'auto',
      style: p.styleCustom && PBC.Style && PBC.Style.BY_KEY[p.style] ? p.style : 'auto',
      morale: p.morale != null ? p.morale : 70,
      tend: TD ? Object.assign({}, TD.get(p)) : null, tendTouched: false, tendReset: false,
      contract: p.contract && p.tid !== -2 ? { amt: p.contract.amt, years: yearsLeft } : null,
      injury: p.injury ? Object.assign({}, p.injury) : null,
    };
    delete d.pers.type;
    if (!d.look.face) d.look.face = 'auto';
    // (what he was: every change is measured against it)
    const d0 = JSON.parse(JSON.stringify(d));
    let tab = (opts && opts.tab) || 'ratings';
    if (tab === 'main') tab = 'ratings';
    if (!TABS.some(t => t[0] === tab)) tab = 'ratings';
    const body = UI.h('<div class="ed2"></div>');
    const archOpts = () => Object.keys(C.ARCHETYPES[d.pos] || {}).map(a => `<option ${d.arch === a ? 'selected' : ''}>${U.esc(a)}</option>`).join('');
    // (his play style, js/core/style.js: Auto follows his ratings as they are in the editor; or one picked for him)
    const autoStyle = () => (PBC.Style ? PBC.Style.detect(Object.assign({}, p, { r: d.r, pos: d.pos, arch: d.arch })) : '');
    const styleOpts = () => {
      if (!PBC.Style) return '';
      const au = PBC.Style.BY_KEY[autoStyle()];
      return `<option value="auto" ${d.style === 'auto' ? 'selected' : ''}>Auto${au ? ' (' + U.esc(au.label) + ')' : ''}</option>` + PBC.Style.LIST.map(st => `<option value="${st.key}" ${d.style === st.key ? 'selected' : ''}>${st.icon} ${U.esc(st.label)}</option>`).join('');
    };
    const hairOpts = () => (HAIR[d.gender === 'f' ? 'f' : 'm']).map(h => `<option value="${h}" ${d.look.hair === h ? 'selected' : ''}>${HAIR_LABEL[h] || h}</option>`).join('');
    const swatches = (colors, cur, key) => colors.map(c => `<button class="sw ${String(cur).toLowerCase() === String(c).toLowerCase() ? 'on' : ''}" data-sw="${key}" data-v="${c}" style="background:${c}" title="${c}"></button>`).join('');
    const skinSw = () => C.SKIN_TONES.map((c, i) => `<button class="sw ${d.look.skin === i ? 'on' : ''}" data-sw="skin" data-v="${i}" style="background:${c}" title="tone ${i}"></button>`).join('');
    const persObj = () => { const o = Object.assign({}, d.pers); if (d.persType !== 'auto') o.type = d.persType; return o; };
    // the player as he would look / behave with the current draft
    const ghost = () => Object.assign({}, p, {
      first: d.first, last: d.last, num: d.num, look: d.look, gender: d.gender, pos: d.pos, arch: d.arch, age: d.age,
      hgt: d.hgt, wgt: d.wgt, wing: d.wing, hand: d.hand,
      r: d.r, pers: persObj(), morale: d.morale, nickname: d.nickname,
      style: d.style === 'auto' ? p.style : d.style, styleCustom: d.style !== 'auto',
    });
    const autoType = () => (PS ? PS.derive(Object.assign({}, p, { pers: Object.assign({}, d.pers), r: d.r, pos: d.pos, age: d.age })) : null);
    const curType = () => (d.persType !== 'auto' ? d.persType : autoType());
    const liveOvr = () => PBC.Player.calcOvr(d.r, d.pos);

    // ---- changes: what differs from d0, the undo stack
    const undo = [];
    // (the draft as a snapshot, without the renderers' caches on the look)
    const json = () => JSON.stringify(d, (k, v) => (k && k[0] === '_' ? undefined : v));
    let snap = json();
    /** after a change is done (a slider let go, a field left, a swatch picked): the step before it goes on the undo stack */
    function commit() {
      const now = json();
      if (now === snap) return;
      undo.push(snap);
      if (undo.length > 60) undo.shift();
      snap = now;
      paintChanges();
    }
    // (every change as a line: "Three-Point 79 to 91")
    const FIELD = { first: 'First name', last: 'Last name', num: 'Jersey #', pos: 'Position', arch: 'Archetype', hgt: 'Height', wgt: 'Weight', wing: 'Wingspan', hand: 'Shooting hand', age: 'Age', gender: 'League', pot: 'Potential', nickname: 'Nickname', origin: 'Origin', persType: 'Personality type', style: 'Play style', morale: 'Morale' };
    const LOOK = { skin: 'Skin', hair: 'Hair', hairColor: 'Hair color', beard: 'Beard', headband: 'Headband', tattoo: 'Tattoo', armSleeve: 'Arm sleeve', legSleeve: 'Leg sleeve', shoe: 'Shoes', shoeAccent: 'Shoe accent', build: 'Build', face: 'Facial expression' };
    const TRAIT = {};
    for (const [k, l] of TRAITS) TRAIT[k] = l;
    function changeList() {
      const out = [];
      const show = (k, v) => (k === 'hgt' || k === 'wing' ? U.height(v) : k === 'build' ? Math.round((v || 0) * 100) : v == null || v === '' ? 'none' : v);
      for (const r of C.RATINGS) if (d.r[r.key] !== d0.r[r.key]) out.push(`${r.label} ${d0.r[r.key]} to ${d.r[r.key]}`);
      for (const k in FIELD) if (d[k] !== d0[k]) out.push(`${FIELD[k]} ${show(k, d0[k])} to ${show(k, d[k])}`);
      // (keys with an underscore are the renderers' caches, not looks)
      for (const k of new Set(Object.keys(d.look).concat(Object.keys(d0.look)))) if (k[0] !== '_' && JSON.stringify(d.look[k]) !== JSON.stringify(d0.look[k])) out.push(`${LOOK[k] || k}${/color|skin|shoe/i.test(k) ? '' : ' ' + show(k, d0.look[k]) + ' to ' + show(k, d.look[k])}`);
      for (const k in d.pers) if (d.pers[k] !== d0.pers[k]) out.push(`${TRAIT[k] || k} ${d0.pers[k]} to ${d.pers[k]}`);
      if (d.tendTouched) out.push('Tendencies edited'); else if (d.tendReset) out.push('Tendencies regenerated');
      if (JSON.stringify(d.contract) !== JSON.stringify(d0.contract)) out.push('Contract');
      if (JSON.stringify(d.injury) !== JSON.stringify(d0.injury)) out.push(d.injury ? 'Injury set' : 'Healed');
      return out;
    }
    const was = (cur, old, fmt) => (cur !== old ? ` <span class="ed-was" title="Was ${U.esc(fmt ? fmt(old) : old)}">was ${U.esc(fmt ? fmt(old) : old)}</span>` : '');
    const chg = (cur, old) => (JSON.stringify(cur) !== JSON.stringify(old) ? ' chg' : '');

    // ---- the ratings
    const delta = (k) => {
      const v = d.r[k] - d0.r[k];
      return v ? `<span class="edr-d ${v > 0 ? 'gain' : 'loss'}">${v > 0 ? '+' : ''}${v}</span>` : '<span class="edr-d"></span>';
    };
    const groupAvg = g => Math.round(U.avg(C.RATINGS.filter(r => r.group === g).map(r => d.r[r.key])));
    function ratingsHtml() {
      const potD = d.pot - d0.pot;
      return `<div class="ed2-tools">
          <input class="inp" id="ed-rq" placeholder="Find a rating…" autocomplete="off">
          <span class="tiny dim">All ratings</span><button class="btn sm" data-allshift="-1" title="Every rating 1 lower">-1</button><button class="btn sm" data-allshift="1" title="Every rating 1 higher">+1</button>
          <span class="spacer"></span><span class="tiny dim">Shift + arrow keys: 5 at a time</span></div>
        <div class="edr edr-pot${potD ? ' chg' : ''}" data-row="pot" data-lab="potential"><span class="edr-l"><b>Potential</b></span><input type="range" min="25" max="99" value="${d.pot}" id="ed-pot">
          <input class="edr-n" type="number" min="25" max="99" value="${d.pot}" id="ed-potn">${potD ? `<span class="edr-d ${potD > 0 ? 'gain' : 'loss'}">${potD > 0 ? '+' : ''}${potD}</span>` : '<span class="edr-d"></span>'}<button class="edr-x" data-rr="pot" title="Back to ${d0.pot}" ${potD ? '' : 'hidden'}>↺</button></div>
        <div class="ed2-groups">${C.RATING_GROUPS.map(g => `<div class="ed-group ed2-g" data-group="${U.esc(g)}"><h4><span>${g}</span><span class="edg-avg" data-gavg="${U.esc(g)}">${groupAvg(g)}</span>
            <span class="spacer"></span><button class="edg-b" data-gshift="${U.esc(g)}" data-d="-1" title="Every ${U.esc(g.toLowerCase())} rating 1 lower">-</button><button class="edg-b" data-gshift="${U.esc(g)}" data-d="1" title="Every ${U.esc(g.toLowerCase())} rating 1 higher">+</button></h4>
          ${C.RATINGS.filter(r => r.group === g).map(r => {
            const ch = d.r[r.key] !== d0.r[r.key];
            return `<div class="edr${ch ? ' chg' : ''}" data-row="${r.key}" data-lab="${U.esc(r.label.toLowerCase())}"><span class="edr-l" title="${U.esc(r.label)}">${U.esc(r.label)}</span>
              <input type="range" min="25" max="99" value="${d.r[r.key]}" data-r="${r.key}"><input class="edr-n" type="number" min="25" max="99" value="${d.r[r.key]}" data-rn="${r.key}">
              ${delta(r.key)}<button class="edr-x" data-rr="${r.key}" title="Back to ${d0.r[r.key]}" ${ch ? '' : 'hidden'}>↺</button></div>`;
          }).join('')}</div>`).join('')}</div>`;
    }
    /** one rating's row after it changed (the slider, the number, what it was) */
    function paintRating(k) {
      const row = body.querySelector(`[data-row="${k}"]`);
      if (!row) return;
      const v = k === 'pot' ? d.pot : d.r[k], v0 = k === 'pot' ? d0.pot : d0.r[k];
      const rng = row.querySelector('input[type=range]'), num = row.querySelector('.edr-n');
      if (rng && +rng.value !== v) rng.value = v;
      if (num && +num.value !== v && document.activeElement !== num) num.value = v;
      const dd = row.querySelector('.edr-d');
      const diff = v - v0;
      if (dd) { dd.className = 'edr-d' + (diff ? (diff > 0 ? ' gain' : ' loss') : ''); dd.textContent = diff ? (diff > 0 ? '+' : '') + diff : ''; }
      row.classList.toggle('chg', !!diff);
      const x = row.querySelector('.edr-x'); if (x) x.hidden = !diff;
      if (k !== 'pot') { const g = (C.RATINGS.find(r => r.key === k) || {}).group; const ga = g && body.querySelector(`[data-gavg="${g}"]`); if (ga) ga.textContent = groupAvg(g); }
    }
    const setRating = (k, v) => {
      v = U.clamp(Math.round(+v || 0), 25, 99);
      if (k === 'pot') d.pot = v; else d.r[k] = v;
      paintRating(k);
      liveStats();
    };

    // ---- looks and body
    const ftIn = v => U.height(v);
    function looksHtml() {
      return `<div class="ed2-cols">
        <div class="ed-group ed-form"><h4>Identity</h4>
          <div class="row"><label class="${chg(d.first, d0.first)}">First${was(d.first, d0.first)}<input class="inp" id="ed-first" maxlength="18" value="${U.esc(d.first)}"></label>
            <label class="${chg(d.last, d0.last)}">Last${was(d.last, d0.last)}<input class="inp" id="ed-last" maxlength="20" value="${U.esc(d.last)}"></label></div>
          <div class="row"><label class="${chg(d.num, d0.num)}" style="max-width:90px">Jersey #<input class="inp" id="ed-num" type="number" min="0" max="99" value="${d.num}"></label>
            <label class="${chg(d.pos, d0.pos)}">Position${was(d.pos, d0.pos)}<select class="inp" id="ed-pos">${C.POSITIONS.map(x => `<option ${d.pos === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
            <label class="${chg(d.arch, d0.arch)}">Archetype<select class="inp" id="ed-arch">${archOpts()}</select></label></div>
          ${PBC.Style ? `<label class="${chg(d.style, d0.style)}" title="How this player plays: what to look for with the ball, where the shots come from, the movement without it. Auto follows the ratings">Play style<select class="inp" id="ed-style">${styleOpts()}</select></label>` : ''}
          <div class="row"><label class="${chg(d.nickname, d0.nickname)}">Nickname<input class="inp" id="ed-nick" maxlength="24" placeholder="e.g. The Iceman" value="${U.esc(d.nickname)}"></label>
            <label class="${chg(d.origin, d0.origin)}">Origin (college or country)<input class="inp" id="ed-origin" maxlength="40" value="${U.esc(d.origin)}"></label></div>
        </div>
        <div class="ed-group ed-form"><h4>Body</h4>
          <div class="row"><label class="${chg(d.age, d0.age)}">Age${was(d.age, d0.age)}<input class="inp" id="ed-age" type="number" min="17" max="45" value="${d.age}"></label>
            <label class="${chg(d.gender, d0.gender)}">League<select class="inp" id="ed-gender"><option value="m" ${d.gender !== 'f' ? 'selected' : ''}>Men's</option><option value="f" ${d.gender === 'f' ? 'selected' : ''}>Women's</option></select></label>
            <label class="${chg(d.hand, d0.hand)}">Shooting hand<select class="inp" id="ed-hand"><option value="R" ${d.hand !== 'L' ? 'selected' : ''}>Right</option><option value="L" ${d.hand === 'L' ? 'selected' : ''}>Left</option></select></label></div>
          <label class="ed-rate${chg(d.hgt, d0.hgt)}"><span>Height <b class="ed-unit" id="edu-hgt">${ftIn(d.hgt)}</b>${was(d.hgt, d0.hgt, ftIn)}</span><input type="range" min="64" max="90" value="${d.hgt}" data-body="hgt"><b id="edv-hgt">${d.hgt}"</b></label>
          <label class="ed-rate${chg(d.wing, d0.wing)}"><span>Wingspan <b class="ed-unit" id="edu-wing">${ftIn(d.wing)}</b>${was(d.wing, d0.wing, ftIn)}</span><input type="range" min="64" max="96" value="${d.wing}" data-body="wing"><b id="edv-wing">${d.wing}"</b></label>
          <label class="ed-rate${chg(d.wgt, d0.wgt)}"><span>Weight${was(d.wgt, d0.wgt, v => v + ' lbs')}</span><input type="range" min="140" max="330" value="${d.wgt}" data-body="wgt"><b id="edv-wgt">${d.wgt}</b></label>
          <label class="ed-rate${chg(d.look.build, d0.look.build)}"><span>Build (slim to big)</span><input type="range" min="0" max="100" value="${Math.round((d.look.build != null ? d.look.build : 0.5) * 100)}" id="ed-build"><b id="edv-build">${Math.round((d.look.build != null ? d.look.build : 0.5) * 100)}</b></label>
        </div>
        <div class="ed-group ed-form ed2-wide"><h4>Appearance</h4>
          <div class="ed-sub">Skin</div><div class="swrow">${skinSw()}</div>
          <div class="row"><label class="${chg(d.look.hair, d0.look.hair)}">Hair<select class="inp" id="ed-hair">${hairOpts()}</select></label>
            <label class="${chg(d.look.beard, d0.look.beard)}">Beard<select class="inp" id="ed-beard">${BEARDS.map(b => `<option value="${b}" ${d.look.beard === b ? 'selected' : ''}>${cap(b)}</option>`).join('')}</select></label>
            <label class="${chg(d.look.headband, d0.look.headband)}">Headband<select class="inp" id="ed-hb">${HB.map(([v, l]) => `<option value="${v}" ${String(d.look.headband || 'none') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
          <div class="ed-sub">Hair color</div><div class="swrow">${swatches(C.HAIR_COLORS, d.look.hairColor, 'hairColor')}</div>
          <div class="row"><label class="${chg(d.look.tattoo, d0.look.tattoo)}">Tattoo<select class="inp" id="ed-tat">${TATS.map(t => `<option value="${t}" ${d.look.tattoo === t ? 'selected' : ''}>${cap(t)}</option>`).join('')}</select></label>
            <label class="${chg(d.look.armSleeve, d0.look.armSleeve)}">Arm sleeve<select class="inp" id="ed-as">${SLEEVES.map(s => `<option value="${s}" ${d.look.armSleeve === s ? 'selected' : ''}>${cap(s)}</option>`).join('')}</select></label>
            <label class="${chg(d.look.legSleeve, d0.look.legSleeve)}">Leg sleeve<select class="inp" id="ed-ls">${SLEEVES.map(s => `<option value="${s}" ${d.look.legSleeve === s ? 'selected' : ''}>${cap(s)}</option>`).join('')}</select></label></div>
          <div class="row"><div style="flex:1;min-width:200px"><div class="ed-sub">Shoes</div><div class="swrow">${swatches(C.SHOE_COLORS, d.look.shoe, 'shoe')}</div></div>
            <div style="flex:1;min-width:200px"><div class="ed-sub">Shoe accent</div><div class="swrow">${swatches(C.SHOE_COLORS, d.look.shoeAccent, 'shoeAccent')}</div></div></div>
          ${PS ? `<label class="${chg(d.look.face, d0.look.face)}" style="max-width:280px">Facial expression<select class="inp" id="ed-face">${PS.FACES.map(([k, l]) => `<option value="${k}" ${(d.look.face || 'auto') === k ? 'selected' : ''}>${U.esc(l)}</option>`).join('')}</select></label>` : ''}
          <div class="row" style="margin-top:4px"><button class="btn sm" data-act="rand-look" title="A new random look for his body (keeps his skin)">🎲 Random look</button><button class="btn sm" data-act="reset-look" title="Every look back to what he had">↺ Looks as they were</button></div>
        </div></div>`;
    }

    // ---- tendencies
    function syncTend() {
      // untouched, non-custom tendencies follow the (possibly edited) ratings
      if (TD && !d.tendTouched && !d.tendReset && !p.tendCustom) d.tend = TD.generate(ghost());
    }
    const tendStatus = () => (d.tendTouched ? '<span class="tag warn">Custom (edited)</span>' : d.tendReset || !p.tendCustom ? '<span class="tag info">Generated: follows his ratings</span>' : '<span class="tag warn">Custom</span>');
    function tendHtml() {
      if (!TD || !d.tend) return '<div class="empty">Tendencies are not available.</div>';
      return `<div class="ed-tend-h"><div class="small muted">What he likes to do on the floor (his ratings decide how well it works). 50 is average.</div>
          <div class="row" style="margin-top:6px"><span id="ed-tstat">${tendStatus()}</span><div class="spacer"></div><button class="btn sm" data-act="tend-reset">↺ Reset to generated</button></div></div>
        <div class="ed-tgrid">${TD.GROUPS.map(g => `<div class="ed-group"><h4>${g}</h4>${TD.LIST.filter(x => x.group === g).map(x => {
          const v = d.tend[x.key];
          return `<div class="ed-trow"><label class="ed-rate"><span title="${U.esc(x.desc)}">${U.esc(x.label)}</span><input type="range" min="0" max="100" value="${v}" data-tend="${x.key}"><b id="edt-${x.key}">${v}</b></label>
            <div class="ed-tdesc"><i id="edtw-${x.key}">${TD.word(v)}</i> · ${U.esc(x.desc)}</div></div>`;
        }).join('')}</div>`).join('')}</div>`;
    }
    function paintTend() {
      if (!TD || !d.tend) return;
      for (const k of TD.KEYS) {
        const inp = body.querySelector(`[data-tend="${k}"]`);
        if (inp) inp.value = d.tend[k];
        const b = body.querySelector('#edt-' + k); if (b) b.textContent = d.tend[k];
        const w = body.querySelector('#edtw-' + k); if (w) w.textContent = TD.word(d.tend[k]);
      }
      const st = body.querySelector('#ed-tstat'); if (st) st.innerHTML = tendStatus();
    }

    // ---- personality
    function typeCard() {
      if (!PS) return '';
      const k = curType();
      const t = PS.TYPES[k];
      if (!t) return '';
      return `<div class="ed-ptype"><span class="ed-pico">${t.icon}</span><div><b>${U.esc(t.label)}</b>${d.persType === 'auto' ? ' <span class="tag">Auto</span>' : ''}<div class="small muted">${U.esc(t.desc)}</div></div></div>`;
    }
    function persHtml() {
      if (!PS) return '<div class="empty">Personalities are not available.</div>';
      const auto = PS.TYPES[autoType()] || {};
      return `<div class="ed-pgrid">
        <div class="ed-group ed-form"><h4>Personality type</h4>
          <label>Type<select class="inp" id="ed-ptype"><option value="auto" ${d.persType === 'auto' ? 'selected' : ''}>Auto from traits (${auto.icon || ''} ${U.esc(auto.label || '')})</option>
            ${PS.TYPE_KEYS.map(k => `<option value="${k}" ${d.persType === k ? 'selected' : ''}>${PS.TYPES[k].icon} ${U.esc(PS.TYPES[k].label)}</option>`).join('')}</select></label>
          <div id="ed-pcard">${typeCard()}</div>
          <h4 style="margin-top:14px">Morale</h4>
          <label class="ed-rate"><span>Morale</span><input type="range" min="0" max="100" value="${d.morale}" id="ed-morale"><b id="edv-morale">${d.morale}</b></label>
          <div class="tiny muted">Below 50 for weeks and he may ask for a trade (League Settings). The facial expression is on Looks & Body.</div>
        </div>
        <div class="ed-group"><h4>Traits</h4>
          ${TRAITS.map(([k, l, hint]) => `<div class="ed-trow"><label class="ed-rate"><span title="${U.esc(hint)}">${l}</span><input type="range" min="1" max="99" value="${d.pers[k]}" data-trait="${k}"><b id="edp-${k}">${d.pers[k]}</b></label>
            <div class="ed-tdesc">${U.esc(hint)}</div></div>`).join('')}
        </div></div>`;
    }
    function paintPers() {
      const c = body.querySelector('#ed-pcard'); if (c) c.innerHTML = typeCard();
      const sel = body.querySelector('#ed-ptype');
      if (sel && PS) { const a = PS.TYPES[autoType()] || {}; sel.options[0].textContent = `Auto from traits (${a.icon || ''} ${a.label || ''})`; }
      paintWho();
    }
    const personaBadge = () => { if (!PS) return ''; const t = PS.TYPES[curType()]; return t ? `${t.icon} ${U.esc(t.label)}` : ''; };

    // ---- contract and health
    const moneyStep = L.minSalary >= 5e5 ? 10000 : 1000;
    const contractLine = () => {
      if (!d.contract) return '';
      const mv = PBC.Player.marketValue(ghost(), L);
      return p.tid >= 0 ? `${U.money(d.contract.amt)}/yr · ${d.contract.years} yr${d.contract.years === 1 ? '' : 's'} left · market value ${U.money(mv)}` : `Asking ${U.money(d.contract.amt)}/yr · market value ${U.money(mv)}`;
    };
    const injLine = () => (d.injury && d.injury.days > 0 ? `<span class="tag bad">🚑 ${U.esc(PBC.Player.injuryLabel(d.injury))}</span>` : '<span class="tag good">✅ Healthy</span>');
    function charHtml() {
      const INJ = PBC.Player.INJURIES || [];
      return `<div class="ed-cgrid">
        <div class="ed-group ed-form"><h4>Contract</h4>
          ${d.contract ? `<div class="row"><label>${p.tid >= 0 ? 'Salary per season' : 'Asking price'}<input class="inp" id="ed-amt" type="number" min="${L.minSalary}" max="${L.cap}" step="${moneyStep}" value="${d.contract.amt}"></label>
            ${p.tid >= 0 ? `<label>Years left<input class="inp" id="ed-yrs" type="number" min="1" max="6" value="${d.contract.years}"></label>` : ''}</div>
            <div class="small muted" id="ed-cline">${contractLine()}</div>` : '<div class="small muted">Draft prospects sign their rookie deal when they are drafted.</div>'}
        </div>
        <div class="ed-group ed-form"><h4>Health</h4>
          <div class="row"><span id="ed-injstat">${injLine()}</span><div class="spacer"></div><button class="btn sm good" data-act="heal">Heal now</button></div>
          <div class="row"><label>Injury<select class="inp" id="ed-injname">${INJ.map(i => `<option value="${U.esc(i.name)}">${U.esc(i.name)} (${i.days[0]}-${i.days[1]} days)</option>`).join('')}</select></label>
            <label>Days out<input class="inp" id="ed-injdays" type="number" min="1" max="400" value="${INJ[0] ? Math.round((INJ[0].days[0] + INJ[0].days[1]) / 2) : 7}"></label></div>
          <button class="btn sm danger" data-act="injure">🚑 Set injury</button>
        </div></div>`;
    }

    // ---- the side: the model, who he is, OVR, badges, changes
    const MV = UI.ModelView;
    const has3d = !!(MV && MV.available());
    const sideHtml = () => `<div class="ed2-side">
        ${has3d ? `<div class="ed2-stage"><canvas id="ed-3d" aria-label="The player's in-game model: drag to turn him"></canvas>
          <div class="ed2-ov tl"><div class="seg sm">${MV.VIEWS.map(v => `<button class="${pv.view === v.key ? 'on' : ''}" data-view="${v.key}" title="${U.esc(v.label)}">${U.esc(v.short || v.label)}</button>`).join('')}</div></div>
          <div class="ed2-ov tr">${team ? `<div class="seg sm"><button class="${pv.home ? 'on' : ''}" data-uni="home" title="Home uniform">Home</button><button class="${pv.home ? '' : 'on'}" data-uni="away" title="Away uniform">Away</button></div>` : ''}
            <button class="ed2-ib ${pv.spin ? 'on' : ''}" data-spin title="Turn slowly">⟳</button></div>
          <div class="ed2-hint">Drag to turn · wheel to zoom · double click to reset</div>
          <div class="ed2-st" id="ed-3dst"></div></div>
        <div class="ed2-moves">${MV.MOVES.map(m => `<button class="ed2-mv ${pv.move === m.key ? 'on' : ''}" data-move="${m.key}" title="${U.esc(m.label)}"><span>${m.icon}</span>${U.esc(m.label)}</button>`).join('')}</div>` : ''}
        <div class="ed2-card"><div id="ed-who"></div><div id="ed-ovrbox"></div><div id="ed-bdgs"></div><div id="ed-chg"></div></div>
      </div>`;
    function paintWho() {
      const el = body.querySelector('#ed-who');
      if (!el) return;
      const g = ghost();
      el.innerHTML = `<div class="ed2-who"><div id="ed-avatar">${UI.avatar(g, 60)}</div><canvas id="ed-pixel" width="60" height="70" title="On the retro court"></canvas>
        <div class="ed2-nm"><b>${U.esc(d.first)} ${U.esc(d.last)}</b><div class="tiny dim">#${d.num} · ${d.pos} · ${U.height(d.hgt)}${team ? ' · ' + U.esc(team.abbr) : ''}</div><div class="ed-persona" id="ed-persona">${personaBadge()}</div></div></div>`;
      drawPixel();
    }
    function paintOvr() {
      const el = body.querySelector('#ed-ovrbox');
      if (!el) return;
      const o = liveOvr(), dv = o - p.ovr;
      const best = PBC.Player.bestPositions ? PBC.Player.bestPositions({ r: d.r }).slice(0, 3) : [];
      const sty = PBC.Style ? PBC.Style.BY_KEY[d.style === 'auto' ? autoStyle() : d.style] : null;
      el.innerHTML = `<div class="ed2-ovr"><div><div class="tiny dim up">OVR</div>${UI.ovr(o, 'lg')}</div>
        <div class="ed2-ovr-t"><div class="${dv > 0 ? 'good-t' : dv < 0 ? 'bad-t' : 'dim'} bold">${dv ? `${dv > 0 ? '+' : ''}${dv} from ${p.ovr}` : 'Unchanged'}</div>
          <div class="tiny dim">POT <b>${d.pot}</b>${d.pot !== d0.pot ? ` (was ${d0.pot})` : ''} · ${best.map(x => `${x} ${PBC.Player.calcOvr(d.r, x)}`).join(' · ')}</div>
          ${sty ? `<div class="tiny" title="${U.esc(sty.desc)}">${sty.icon} ${U.esc(sty.label)}${d.style === 'auto' ? ' <span class="dim">(auto)</span>' : ''}</div>` : ''}</div></div>`;
    }
    // (the badges with the draft ratings, against the ones he had)
    const bdg0 = PBC.Badges ? PBC.Badges.of(p) : {};
    function paintBadges() {
      const el = body.querySelector('#ed-bdgs');
      if (!el || !PBC.Badges) return;
      const B = PBC.Badges, now = B.list(ghost());
      const have = {};
      for (const b of now) have[b.key] = b.tier;
      const lost = Object.keys(bdg0).filter(k => !have[k]).map(k => B.BY_KEY[k]).filter(Boolean);
      const mark = b => (bdg0[b.key] == null ? '<i class="ed2-bn" title="New">new</i>' : have[b.key] > bdg0[b.key] ? '<i class="ed2-bn" title="Up a tier">▲</i>' : have[b.key] < bdg0[b.key] ? '<i class="ed2-bl" title="Down a tier">▼</i>' : '');
      el.innerHTML = `<div class="ed2-bh"><span class="tiny dim up">Badges</span><span class="tiny dim">${now.length}${now.length !== Object.keys(bdg0).length ? ` (was ${Object.keys(bdg0).length})` : ''}</span></div>
        <div class="ed2-bdg">${now.slice(0, 12).map(b => `<span class="ed2-bw">${UI.badgeChip(b, true)}${mark(b)}</span>`).join('')}${now.length > 12 ? `<span class="tiny dim">+${now.length - 12}</span>` : ''}
        ${lost.map(b => `<span class="ed2-bw lost" title="Lost: ${U.esc(b.label)}"><span class="bdg-chip sm" style="--bc:#5c6680"><span class="bi">${b.icon}</span></span></span>`).join('')}${!now.length && !lost.length ? '<span class="tiny dim">None yet</span>' : ''}</div>`;
    }
    function paintChanges() {
      const el = body.querySelector('#ed-chg');
      if (!el) return;
      const list = changeList(), n = list.length;
      el.innerHTML = `<div class="ed2-chg"><span class="${n ? 'accent-t bold' : 'dim'}" ${n ? `title="${U.esc(list.join('\n'))}"` : ''}>${n ? U.plural(n, 'change') : 'No changes yet'}</span><span class="spacer"></span>
        <button class="btn sm ghost" data-act="undo" ${undo.length ? '' : 'disabled'} title="Undo (Ctrl+Z)">↶ Undo</button><button class="btn sm ghost" data-act="reset-all" ${n ? '' : 'disabled'} title="Everything back to what he was">Reset all</button></div>`;
    }
    let liveQueued = false;
    /** the numbers that follow the ratings (OVR, badges, changes), once a frame while a slider moves */
    function liveStats() {
      if (liveQueued) return;
      liveQueued = true;
      requestAnimationFrame(() => { liveQueued = false; paintOvr(); paintBadges(); paintChanges(); });
    }

    function drawPixel() {
      const cv = body.querySelector('#ed-pixel');
      if (!cv) return;
      const tl = teamLookFor(S, p);
      try {
        if (PBC.Match && PBC.Match.Pixel && PBC.Match.Pixel.preview) PBC.Match.Pixel.preview(cv, ghost(), tl, 'stand');
        else { const g = cv.getContext('2d'); g.clearRect(0, 0, cv.width, cv.height); }
      } catch (e) { /* preview is best-effort */ }
    }

    // ---- the 3D model
    let mv = null;
    const teamLook = () => (team && UI.teamLookOf ? UI.teamLookOf(team, pv.home) : MV ? MV.plainTeam() : null);
    const modelLook = () => { if (mv && UI.playerLook) mv.setLook(UI.playerLook(ghost(), 0), teamLook()); };
    function startModel() {
      const cv = body.querySelector('#ed-3d');
      if (!cv || !MV || !UI.playerLook) return;
      try {
        mv = new MV(cv, {
          look: UI.playerLook(ghost(), 0), team: teamLook(), move: pv.move, view: pv.view, spin: pv.spin,
          onState: st => { const s = body.querySelector('#ed-3dst'); if (s) s.textContent = st === '2d' ? '2D figure (no WebGL2 here)' : ''; },
        });
      } catch (e) { console.warn('editor: model view', e); mv = null; }
    }
    /** a look or body change: the portrait, the sprite and the model */
    function refreshChrome() {
      paintWho();
      modelLook();
      paintChanges();
    }

    function paneHtml(k) {
      if (k === 'ratings') return ratingsHtml();
      if (k === 'looks') return looksHtml();
      if (k === 'tend') return tendHtml();
      if (k === 'pers') return persHtml();
      return charHtml();
    }
    function render() {
      syncTend();
      body.innerHTML = `<div class="ed2-shell">${sideHtml()}
          <div class="ed2-main">
            <div class="tabs ed-tabs">${TABS.map(([k, l]) => `<button class="tab ${tab === k ? 'active' : ''}" data-edtab="${k}">${l}</button>`).join('')}</div>
            <div class="ed-pane" id="ed-pane"></div>
          </div></div>`;
      renderPane();
      paintWho(); paintOvr(); paintBadges(); paintChanges();
    }
    function renderPane() {
      if (tab === 'tend') syncTend();
      const el = body.querySelector('#ed-pane');
      if (el) el.innerHTML = paneHtml(tab);
      body.querySelectorAll('[data-edtab]').forEach(b => b.classList.toggle('active', b.dataset.edtab === tab));
      if (tab === 'tend') paintTend();
    }
    function showTab(k) { tab = k; renderPane(); }

    // ---- input
    UI.on(body, 'click', '[data-edtab]', (e, el) => showTab(el.dataset.edtab));
    // ratings: the slider, the number, ↺, the group and all shifts, the search
    UI.on(body, 'input', '[data-r]', (e, el) => setRating(el.dataset.r, el.value));
    UI.on(body, 'change', '[data-r],#ed-pot', () => commit());
    UI.on(body, 'input', '#ed-pot', (e, el) => setRating('pot', el.value));
    UI.on(body, 'change', '[data-rn],#ed-potn', (e, el) => { setRating(el.dataset.rn || 'pot', el.value); el.value = el.dataset.rn ? d.r[el.dataset.rn] : d.pot; commit(); });
    UI.on(body, 'keydown', 'input[type=range][data-r],#ed-pot', (e, el) => {
      if (!e.shiftKey) return;
      const step = { ArrowLeft: -5, ArrowDown: -5, ArrowRight: 5, ArrowUp: 5 }[e.key];
      if (!step) return;
      e.preventDefault();
      const k = el.dataset.r || 'pot';
      setRating(k, (k === 'pot' ? d.pot : d.r[k]) + step);
      commit();
    });
    UI.on(body, 'click', '[data-rr]', (e, el) => { const k = el.dataset.rr; setRating(k, k === 'pot' ? d0.pot : d0.r[k]); commit(); });
    UI.on(body, 'click', '[data-gshift],[data-allshift]', (e, el) => {
      const dv = +(el.dataset.d || el.dataset.allshift);
      const g = el.dataset.gshift;
      for (const r of C.RATINGS) if (!g || r.group === g) { d.r[r.key] = U.clamp(d.r[r.key] + dv, 25, 99); paintRating(r.key); }
      liveStats(); commit();
    });
    UI.on(body, 'input', '#ed-rq', (e, el) => {
      const q = el.value.trim().toLowerCase();
      body.querySelectorAll('.ed2-g').forEach(g => {
        let any = false;
        g.querySelectorAll('[data-row]').forEach(r => { const on = !q || r.dataset.lab.includes(q) || g.dataset.group.toLowerCase().includes(q); r.hidden = !on; any = any || on; });
        g.hidden = !any;
      });
    });
    // identity and body
    UI.on(body, 'change', '#ed-first,#ed-last', (e, el) => { const k = el.id === 'ed-first' ? 'first' : 'last'; d[k] = el.value.trim().slice(0, k === 'first' ? 18 : 20) || d[k]; el.value = d[k]; refreshChrome(); commit(); });
    UI.on(body, 'change', '#ed-num', (e, el) => { d.num = U.clamp(Math.round(+el.value || 0), 0, 99); el.value = d.num; refreshChrome(); commit(); });
    UI.on(body, 'change', '#ed-pos', (e, el) => {
      d.pos = el.value;
      const archs = Object.keys(C.ARCHETYPES[d.pos] || {});
      if (!archs.includes(d.arch)) d.arch = archs[0];
      renderPane(); paintWho(); paintOvr(); paintBadges(); commit();
    });
    UI.on(body, 'change', '#ed-arch', (e, el) => { d.arch = el.value; paintOvr(); commit(); });
    UI.on(body, 'change', '#ed-style', (e, el) => { d.style = el.value; paintOvr(); paintBadges(); modelLook(); commit(); });
    UI.on(body, 'change', '#ed-age', (e, el) => { d.age = U.clamp(Math.round(+el.value || d.age), 17, 45); el.value = d.age; commit(); });
    UI.on(body, 'input', '[data-body]', (e, el) => {
      const k = el.dataset.body;
      d[k] = Math.round(+el.value);
      const v = body.querySelector('#edv-' + k); if (v) v.textContent = k === 'wgt' ? d[k] : d[k] + '"';
      const u = body.querySelector('#edu-' + k); if (u) u.textContent = U.height(d[k]);
      modelLook();
    });
    UI.on(body, 'change', '[data-body]', () => { paintWho(); commit(); });
    UI.on(body, 'input', '#ed-build', (e, el) => { d.look.build = (+el.value) / 100; body.querySelector('#edv-build').textContent = el.value; modelLook(); });
    UI.on(body, 'change', '#ed-build', () => { paintWho(); commit(); });
    UI.on(body, 'change', '#ed-hand', (e, el) => { d.hand = el.value; modelLook(); commit(); });
    UI.on(body, 'change', '#ed-gender', (e, el) => {
      d.gender = el.value;
      const hairs = HAIR[d.gender === 'f' ? 'f' : 'm'];
      if (!hairs.includes(d.look.hair)) d.look.hair = hairs[0];
      if (d.gender === 'f') d.look.beard = 'none';
      renderPane(); refreshChrome(); commit();
    });
    UI.on(body, 'input', '#ed-nick', (e, el) => { d.nickname = el.value; });
    UI.on(body, 'input', '#ed-origin', (e, el) => { d.origin = el.value; });
    UI.on(body, 'change', '#ed-nick,#ed-origin', () => commit());
    // appearance
    const lookSel = { 'ed-hair': 'hair', 'ed-beard': 'beard', 'ed-hb': 'headband', 'ed-tat': 'tattoo', 'ed-as': 'armSleeve', 'ed-ls': 'legSleeve', 'ed-face': 'face' };
    UI.on(body, 'change', '#ed-hair,#ed-beard,#ed-hb,#ed-tat,#ed-as,#ed-ls,#ed-face', (e, el) => {
      const k = lookSel[el.id];
      d.look[k] = k === 'headband' && el.value === 'none' ? null : el.value;
      if (k === 'hair' && d.look.hair === 'bald') d.look.hairColor = '#000000';
      el.closest('label').classList.toggle('chg', JSON.stringify(d.look[k]) !== JSON.stringify(d0.look[k]));
      refreshChrome(); commit();
    });
    UI.on(body, 'click', '[data-sw]', (e, el) => {
      const k = el.dataset.sw, v = el.dataset.v;
      if (k === 'skin') d.look.skin = +v;
      else d.look[k] = v;
      body.querySelectorAll(`[data-sw="${k}"]`).forEach(b => b.classList.toggle('on', b === el));
      refreshChrome(); commit();
    });
    UI.on(body, 'click', '[data-act="rand-look"]', () => {
      const nl = PBC.Player.genLook(d.gender, d.hgt, d.wgt);
      for (const k of LOOK_KEYS) if (k !== 'skin' && k !== 'face' && nl[k] !== undefined) d.look[k] = nl[k];
      renderPane(); refreshChrome(); commit();
    });
    UI.on(body, 'click', '[data-act="reset-look"]', () => { d.look = JSON.parse(JSON.stringify(d0.look)); renderPane(); refreshChrome(); commit(); });
    // tendencies
    UI.on(body, 'input', '[data-tend]', (e, el) => {
      const k = el.dataset.tend;
      d.tend[k] = +el.value;
      d.tendTouched = true;
      const b = body.querySelector('#edt-' + k); if (b) b.textContent = el.value;
      const w = body.querySelector('#edtw-' + k); if (w) w.textContent = TD.word(+el.value);
      const st = body.querySelector('#ed-tstat'); if (st) st.innerHTML = tendStatus();
    });
    UI.on(body, 'change', '[data-tend]', () => commit());
    UI.on(body, 'click', '[data-act="tend-reset"]', () => {
      if (!TD) return;
      d.tend = TD.generate(ghost());
      d.tendTouched = false; d.tendReset = true;
      paintTend(); commit();
      UI.toast('Tendencies regenerated from his ratings and personality', 'info');
    });
    // personality
    UI.on(body, 'change', '#ed-ptype', (e, el) => { d.persType = el.value; paintPers(); commit(); });
    UI.on(body, 'input', '[data-trait]', (e, el) => {
      d.pers[el.dataset.trait] = +el.value;
      const b = body.querySelector('#edp-' + el.dataset.trait); if (b) b.textContent = el.value;
      if (d.persType === 'auto') paintPers();
    });
    UI.on(body, 'change', '[data-trait]', () => { paintBadges(); commit(); });
    UI.on(body, 'input', '#ed-morale', (e, el) => { d.morale = +el.value; body.querySelector('#edv-morale').textContent = el.value; });
    UI.on(body, 'change', '#ed-morale', () => { paintWho(); commit(); });
    // contract and health
    UI.on(body, 'change', '#ed-amt,#ed-yrs', (e, el) => {
      if (!d.contract) return;
      if (el.id === 'ed-amt') d.contract.amt = U.clamp(Math.round((+el.value || L.minSalary) / moneyStep) * moneyStep, L.minSalary, L.cap);
      else d.contract.years = U.clamp(Math.round(+el.value || 1), 1, 6);
      el.value = el.id === 'ed-amt' ? d.contract.amt : d.contract.years;
      const c = body.querySelector('#ed-cline'); if (c) c.textContent = contractLine();
      commit();
    });
    UI.on(body, 'change', '#ed-injname', (e, el) => {
      const inj = (PBC.Player.INJURIES || []).find(i => i.name === el.value);
      const di = body.querySelector('#ed-injdays');
      if (inj && di) di.value = Math.round((inj.days[0] + inj.days[1]) / 2);
    });
    UI.on(body, 'click', '[data-act="heal"]', () => { d.injury = null; body.querySelector('#ed-injstat').innerHTML = injLine(); commit(); });
    UI.on(body, 'click', '[data-act="injure"]', () => {
      const name = body.querySelector('#ed-injname').value;
      const days = U.clamp(Math.round(+body.querySelector('#ed-injdays').value || 1), 1, 400);
      d.injury = { name, days, total: days };
      body.querySelector('#ed-injstat').innerHTML = injLine();
      commit();
    });
    // the model's controls
    UI.on(body, 'click', '[data-move]', (e, el) => { pv.move = el.dataset.move; body.querySelectorAll('[data-move]').forEach(b => b.classList.toggle('on', b === el)); if (mv) mv.setMove(pv.move); });
    UI.on(body, 'click', '[data-view]', (e, el) => { pv.view = el.dataset.view; body.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('on', b === el)); if (mv) mv.setView(pv.view); });
    UI.on(body, 'click', '[data-uni]', (e, el) => { pv.home = el.dataset.uni === 'home'; body.querySelectorAll('[data-uni]').forEach(b => b.classList.toggle('on', b === el)); modelLook(); });
    UI.on(body, 'click', '[data-spin]', (e, el) => { pv.spin = mv ? mv.spin() : !pv.spin; el.classList.toggle('on', pv.spin); });
    // undo and reset all
    function restore(json) {
      const o = JSON.parse(json);
      for (const k in d) delete d[k];
      Object.assign(d, o);
      snap = json;
      renderPane(); paintWho(); paintOvr(); paintBadges(); paintChanges(); modelLook();
    }
    UI.on(body, 'click', '[data-act="undo"]', () => { if (undo.length) restore(undo.pop()); });
    UI.on(body, 'click', '[data-act="reset-all"]', () => { undo.push(json()); restore(JSON.stringify(d0)); paintChanges(); });
    const onKey = e => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z' || e.shiftKey) return;
      const t = e.target;
      if (t && (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && /text|search|number/.test(t.type)))) return; // (a text field's own undo)
      if (!body.isConnected) return;
      e.preventDefault();
      if (undo.length) restore(undo.pop());
    };
    document.addEventListener('keydown', onKey);

    render();
    const m = UI.modal({
      title: `Edit player: ${U.esc(p.first)} ${U.esc(p.last)}`, body, xwide: true,
      onClose: () => { document.removeEventListener('keydown', onKey); if (mv) mv.destroy(); },
      actions: [
        { label: 'Cancel', cls: 'ghost' },
        {
          label: '💾 Save', cls: 'primary', onClick: close => {
            const fi = body.querySelector('#ed-first'), la = body.querySelector('#ed-last');
            d.first = ((fi ? fi.value.trim() : '') || d.first).slice(0, 18);
            d.last = ((la ? la.value.trim() : '') || d.last).slice(0, 20);
            const wasInjured = PBC.Player.isInjured(p);
            Object.assign(p, {
              first: d.first, last: d.last, pos: d.pos, arch: d.arch,
              hgt: U.clamp(d.hgt, 64, 90), wgt: U.clamp(d.wgt, 140, 330), wing: U.clamp(d.wing, 64, 96),
              hand: d.hand === 'L' ? 'L' : 'R', age: U.clamp(d.age, 17, 45), gender: d.gender,
              r: d.r, look: d.look,
            });
            p.pot = U.clamp(Math.round(d.pot), 25, 99);
            // jersey number (keep unique on the team)
            p.num = U.clamp(Math.round(d.num), 0, 99);
            const dupe = Object.values(S.players).some(q => q.id !== p.id && q.tid === p.tid && q.num === p.num);
            if (dupe) PBC.Player.assignNumber(S, p);
            p.ovr = PBC.Player.calcOvr(p.r, p.pos);
            if (p.age <= 26 && p.pot < p.ovr) p.pot = p.ovr;
            // characteristics
            const nick = String(d.nickname || '').trim().slice(0, 24);
            if (nick) p.nickname = nick; else delete p.nickname;
            const origin = String(d.origin || '').trim().slice(0, 40);
            if (origin) p.origin = origin;
            if (!p.look.face || p.look.face === 'auto') delete p.look.face;
            // personality
            const pers = Object.assign({}, p.pers || {});
            for (const [k] of TRAITS) pers[k] = U.clamp(Math.round(d.pers[k]), 1, 99);
            if (d.persType !== 'auto' && PS && PS.TYPES[d.persType]) pers.type = d.persType; else delete pers.type;
            p.pers = pers;
            p.morale = U.clamp(Math.round(d.morale), 0, 100);
            // contract
            if (d.contract && p.contract) {
              if (p.tid >= 0) p.contract = Object.assign({}, p.contract, { amt: d.contract.amt, exp: S.season + d.contract.years - (inSeason ? 1 : 0) });
              else p.contract = Object.assign({}, p.contract, { amt: d.contract.amt });
            }
            // health
            p.injury = d.injury && d.injury.days > 0 ? { name: d.injury.name, days: d.injury.days, total: d.injury.total || d.injury.days } : null;
            if (wasInjured !== PBC.Player.isInjured(p) && p.tid >= 0) {
              const t = S.teams[p.tid];
              if (t && (p.tid !== S.userTid || t.rot.auto !== false)) PBC.AI.autoRotation(S, p.tid);
            }
            // play style: the one picked, or Auto (follows the ratings)
            if (PBC.Style) PBC.Style.set(p, d.style);
            // tendencies: custom when edited, otherwise they follow the new ratings / personality
            if (TD) {
              if (d.tendTouched) { p.tend = Object.assign({}, d.tend); p.tendCustom = true; }
              else if (d.tendReset) TD.reset(p);
              else TD.refresh(p);
            }
            UI.save(); close();
            UI.toast(`Saved ${PBC.Player.name(p)}: OVR ${p.ovr}`, 'good');
            UI.refresh();
          },
        },
      ],
    });
    startModel();
    return m;
  };
})();
