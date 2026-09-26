/* Pro BBALL Coach — player editor (Hoop Land-style full customization).
 * Edit any player: identity, all 27 ratings + potential, appearance (tab 1), play-style tendencies (PBC.Tendency),
 * personality type / facial expression / traits / morale (PBC.Persona) and characteristics (nickname, origin, hand,
 * contract, injury status).
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
        <div class="sub">Edit any player: ratings, tendencies, personality, appearance, contract and health. Previews use the same avatar and pixel sprite the game draws.</div></div>
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
    if (UI.teamUniform) return { uniform: Object.assign({}, UI.teamUniform(t, false)) }; // the team's away set (Team Editor colors)
    const pri = t.colors.primary, sec = t.colors.secondary;
    return { uniform: { jersey: pri, number: U.textOn(pri) === '#ffffff' ? '#ffffff' : sec, trim: sec, shorts: pri } };
  }

  const TABS = [['main', 'Ratings & Looks'], ['tend', 'Tendencies'], ['pers', 'Personality'], ['char', 'Characteristics']];
  const TRAITS = [
    ['money', 'Money', 'How much salary matters in free agency.'], ['win', 'Winning', 'Wants to win now; unhappy on losing teams.'],
    ['loyal', 'Loyalty', 'Likes to stay put; gives hometown discounts.'], ['pt', 'Playing time', 'Needs minutes to stay happy.'],
    ['market', 'Big market', 'Wants the bright lights of a big city.'], ['ego', 'Ego', 'Wants the spotlight, the shots and the credit.'],
    ['work', 'Work ethic', 'Improves faster in practice and in the offseason.'],
  ];
  const IN_SEASON = { regular: 1, preseason: 1, playin: 1, playoffs: 1 };

  /** opts: { tab: 'main' | 'tend' | 'pers' | 'char' } */
  UI.openPlayerEditor = function (pid, opts) {
    const S = UI.S;
    const p = S.players[pid];
    if (!p || p.tid === -3) { UI.toast('Retired players cannot be edited.', 'bad'); return; }
    const L = PBC.League.cfg(S);
    const TD = PBC.Tendency, PS = PBC.Persona;
    const inSeason = !!IN_SEASON[S.phase];
    const yearsLeft = p.contract ? Math.max(1, p.contract.exp - S.season + (inSeason ? 1 : 0)) : 1;
    // draft working copy
    const d = {
      first: p.first, last: p.last, num: p.num, pos: p.pos, arch: p.arch,
      hgt: p.hgt, wgt: p.wgt, wing: p.wing, hand: p.hand, age: p.age, gender: p.gender,
      r: Object.assign({}, p.r), pot: p.pot, look: JSON.parse(JSON.stringify(p.look)),
      nickname: p.nickname || '', origin: p.origin || '',
      pers: Object.assign({ money: 50, win: 50, loyal: 50, pt: 50, market: 50, ego: 50, work: 60 }, p.pers || {}),
      persType: (p.pers && p.pers.type && PS && PS.TYPES[p.pers.type]) ? p.pers.type : 'auto',
      morale: p.morale != null ? p.morale : 70,
      tend: TD ? Object.assign({}, TD.get(p)) : null, tendTouched: false, tendReset: false,
      contract: p.contract && p.tid !== -2 ? { amt: p.contract.amt, years: yearsLeft } : null,
      injury: p.injury ? Object.assign({}, p.injury) : null,
    };
    delete d.pers.type;
    if (!d.look.face) d.look.face = 'auto';
    let tab = (opts && opts.tab) || 'main';
    const body = UI.h('<div class="ed"></div>');
    const archOpts = () => Object.keys(C.ARCHETYPES[d.pos] || {}).map(a => `<option ${d.arch === a ? 'selected' : ''}>${U.esc(a)}</option>`).join('');
    const hairOpts = () => (HAIR[d.gender === 'f' ? 'f' : 'm']).map(h => `<option value="${h}" ${d.look.hair === h ? 'selected' : ''}>${HAIR_LABEL[h] || h}</option>`).join('');
    const swatches = (colors, cur, key) => colors.map(c => `<button class="sw ${String(cur).toLowerCase() === String(c).toLowerCase() ? 'on' : ''}" data-sw="${key}" data-v="${c}" style="background:${c}" title="${c}"></button>`).join('');
    const skinSw = () => C.SKIN_TONES.map((c, i) => `<button class="sw ${d.look.skin === i ? 'on' : ''}" data-sw="skin" data-v="${i}" style="background:${c}" title="tone ${i}"></button>`).join('');
    const persObj = () => { const o = Object.assign({}, d.pers); if (d.persType !== 'auto') o.type = d.persType; return o; };
    // the player as he would look / behave with the current draft
    const ghost = () => Object.assign({}, p, {
      first: d.first, last: d.last, num: d.num, look: d.look, gender: d.gender, pos: d.pos, arch: d.arch, age: d.age,
      r: d.r, pers: persObj(), morale: d.morale, nickname: d.nickname,
    });
    const autoType = () => (PS ? PS.derive(Object.assign({}, p, { pers: Object.assign({}, d.pers), r: d.r, pos: d.pos, age: d.age })) : null);
    const curType = () => (d.persType !== 'auto' ? d.persType : autoType());

    function ratingsHtml() {
      return C.RATING_GROUPS.map(g => `<div class="ed-group"><h4>${g}</h4>${C.RATINGS.filter(r => r.group === g).map(r =>
        `<label class="ed-rate"><span>${r.label}</span><input type="range" min="25" max="99" value="${d.r[r.key]}" data-r="${r.key}"><b id="edv-${r.key}">${d.r[r.key]}</b></label>`
      ).join('')}</div>`).join('');
    }

    function mainHtml() {
      return `<div class="ed-id">
            <div class="row"><label>First<input class="inp" id="ed-first" value="${U.esc(d.first)}"></label>
              <label>Last<input class="inp" id="ed-last" value="${U.esc(d.last)}"></label></div>
            <div class="row">
              <label>#<input class="inp" id="ed-num" type="number" min="0" max="99" value="${d.num}"></label>
              <label>Pos<select class="inp" id="ed-pos">${C.POSITIONS.map(x => `<option ${d.pos === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
              <label>Archetype<select class="inp" id="ed-arch">${archOpts()}</select></label></div>
            <div class="row">
              <label>Age<input class="inp" id="ed-age" type="number" min="17" max="45" value="${d.age}"></label>
              <label>Ht (in)<input class="inp" id="ed-hgt" type="number" min="64" max="90" value="${d.hgt}"></label>
              <label>Wt<input class="inp" id="ed-wgt" type="number" min="140" max="330" value="${d.wgt}"></label>
              <label>Wing<input class="inp" id="ed-wing" type="number" min="64" max="96" value="${d.wing}"></label>
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
              <label class="ed-rate"><span>Build (slim to big)</span><input type="range" min="0" max="100" value="${Math.round((d.look.build || 0.5) * 100)}" id="ed-build"><b id="edv-build">${Math.round((d.look.build || 0.5) * 100)}</b></label>
            </div>
          </div>
          <div class="ed-ratings">${ratingsHtml()}</div>`;
    }

    // ---- tendencies ----
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

    // ---- personality ----
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
          <h4 style="margin-top:14px">Facial expression</h4>
          <label>Expression<select class="inp" id="ed-face">${PS.FACES.map(([k, l]) => `<option value="${k}" ${(d.look.face || 'auto') === k ? 'selected' : ''}>${U.esc(l)}</option>`).join('')}</select></label>
          <div class="tiny muted" style="margin-top:4px">Auto follows the personality type and his mood.</div>
          <h4 style="margin-top:14px">Morale</h4>
          <label class="ed-rate"><span>Morale</span><input type="range" min="0" max="100" value="${d.morale}" id="ed-morale"><b id="edv-morale">${d.morale}</b></label>
          <div class="tiny muted">Below 50 for weeks and he may ask for a trade (League Settings).</div>
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
      const pb = body.querySelector('#ed-persona'); if (pb) pb.innerHTML = personaBadge();
    }
    const personaBadge = () => { if (!PS) return ''; const t = PS.TYPES[curType()]; return t ? `${t.icon} ${U.esc(t.label)}` : ''; };

    // ---- characteristics ----
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
        <div class="ed-group ed-form"><h4>Identity</h4>
          <label>Nickname<input class="inp" id="ed-nick" maxlength="24" placeholder="e.g. The Iceman" value="${U.esc(d.nickname)}"></label>
          <label>Origin (college or country)<input class="inp" id="ed-origin" maxlength="40" value="${U.esc(d.origin)}"></label>
          <div class="row"><label>Shooting hand<select class="inp" id="ed-hand"><option value="R" ${d.hand !== 'L' ? 'selected' : ''}>Right</option><option value="L" ${d.hand === 'L' ? 'selected' : ''}>Left</option></select></label>
            <label>Jersey #<input class="inp" id="ed-num2" type="number" min="0" max="99" value="${d.num}"></label></div>
        </div>
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

    function render() {
      syncTend();
      const liveOvr = PBC.Player.calcOvr(d.r, d.pos);
      body.innerHTML = `
        <div class="ed-shell">
          <div class="ed-prev"><div id="ed-avatar">${UI.avatar(ghost(), 104)}</div>
            <canvas id="ed-pixel" width="120" height="140"></canvas>
            <div class="center"><div class="tiny dim up">OVR (live)</div><div id="ed-ovr">${UI.ovr(liveOvr, 'lg')}</div>
            <div class="tiny dim" style="margin-top:4px">was ${p.ovr} · POT <b id="ed-pot-lbl">${d.pot}</b></div>
            <div class="ed-persona" id="ed-persona">${personaBadge()}</div></div></div>
          <div class="ed-main">
            <div class="tabs ed-tabs">${TABS.map(([k, l]) => `<button class="tab ${tab === k ? 'active' : ''}" data-edtab="${k}">${l}</button>`).join('')}</div>
            <div class="ed-pane" data-pane="main" ${tab === 'main' ? '' : 'hidden'}>${mainHtml()}</div>
            <div class="ed-pane" data-pane="tend" ${tab === 'tend' ? '' : 'hidden'}>${tendHtml()}</div>
            <div class="ed-pane" data-pane="pers" ${tab === 'pers' ? '' : 'hidden'}>${persHtml()}</div>
            <div class="ed-pane" data-pane="char" ${tab === 'char' ? '' : 'hidden'}>${charHtml()}</div>
          </div>
        </div>`;
      drawPixel();
    }

    function drawPixel() {
      const cv = body.querySelector('#ed-pixel');
      if (!cv) return;
      const tl = teamLookFor(S, p);
      try {
        if (PBC.Match && PBC.Match.Pixel && PBC.Match.Pixel.preview) PBC.Match.Pixel.preview(cv, ghost(), tl, 'stand');
        else { const g = cv.getContext('2d'); g.clearRect(0, 0, cv.width, cv.height); }
      } catch (e) { /* preview is best-effort */ }
      const ov = body.querySelector('#ed-ovr');
      if (ov) ov.innerHTML = UI.ovr(PBC.Player.calcOvr(d.r, d.pos), 'lg');
    }

    function refreshChrome() {
      const av = body.querySelector('#ed-avatar');
      if (av) av.innerHTML = UI.avatar(ghost(), 104);
      drawPixel();
    }

    function showTab(k) {
      tab = k;
      if (k === 'tend') { syncTend(); paintTend(); }
      if (k === 'pers') paintPers();
      body.querySelectorAll('[data-edtab]').forEach(b => b.classList.toggle('active', b.dataset.edtab === k));
      body.querySelectorAll('[data-pane]').forEach(el => { el.hidden = el.dataset.pane !== k; });
    }

    UI.on(body, 'click', '[data-edtab]', (e, el) => showTab(el.dataset.edtab));
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
    UI.on(body, 'change', '#ed-num,#ed-num2', (e, el) => {
      d.num = U.clamp(Math.round(+el.value || 0), 0, 99);
      body.querySelectorAll('#ed-num,#ed-num2').forEach(x => { x.value = d.num; });
      refreshChrome();
    });
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
    // tendencies
    UI.on(body, 'input', '[data-tend]', (e, el) => {
      const k = el.dataset.tend;
      d.tend[k] = +el.value;
      d.tendTouched = true;
      const b = body.querySelector('#edt-' + k); if (b) b.textContent = el.value;
      const w = body.querySelector('#edtw-' + k); if (w) w.textContent = TD.word(+el.value);
      const st = body.querySelector('#ed-tstat'); if (st) st.innerHTML = tendStatus();
    });
    UI.on(body, 'click', '[data-act="tend-reset"]', () => {
      if (!TD) return;
      d.tend = TD.generate(ghost());
      d.tendTouched = false; d.tendReset = true;
      paintTend();
      UI.toast('Tendencies regenerated from his ratings and personality', 'info');
    });
    // personality
    UI.on(body, 'change', '#ed-ptype', (e, el) => { d.persType = el.value; paintPers(); refreshChrome(); });
    UI.on(body, 'change', '#ed-face', (e, el) => { d.look.face = el.value; refreshChrome(); });
    UI.on(body, 'input', '[data-trait]', (e, el) => {
      d.pers[el.dataset.trait] = +el.value;
      const b = body.querySelector('#edp-' + el.dataset.trait); if (b) b.textContent = el.value;
      if (d.persType === 'auto') paintPers();
    });
    UI.on(body, 'change', '[data-trait]', () => { if (d.persType === 'auto') refreshChrome(); });
    UI.on(body, 'input', '#ed-morale', (e, el) => { d.morale = +el.value; body.querySelector('#edv-morale').textContent = el.value; });
    UI.on(body, 'change', '#ed-morale', () => refreshChrome());
    // characteristics
    UI.on(body, 'input', '#ed-nick', (e, el) => { d.nickname = el.value; });
    UI.on(body, 'input', '#ed-origin', (e, el) => { d.origin = el.value; });
    UI.on(body, 'change', '#ed-amt,#ed-yrs', (e, el) => {
      if (!d.contract) return;
      if (el.id === 'ed-amt') d.contract.amt = U.clamp(Math.round((+el.value || L.minSalary) / moneyStep) * moneyStep, L.minSalary, L.cap);
      else d.contract.years = U.clamp(Math.round(+el.value || 1), 1, 6);
      el.value = el.id === 'ed-amt' ? d.contract.amt : d.contract.years;
      const c = body.querySelector('#ed-cline'); if (c) c.textContent = contractLine();
    });
    UI.on(body, 'change', '#ed-injname', (e, el) => {
      const inj = (PBC.Player.INJURIES || []).find(i => i.name === el.value);
      const di = body.querySelector('#ed-injdays');
      if (inj && di) di.value = Math.round((inj.days[0] + inj.days[1]) / 2);
    });
    UI.on(body, 'click', '[data-act="heal"]', () => { d.injury = null; body.querySelector('#ed-injstat').innerHTML = injLine(); });
    UI.on(body, 'click', '[data-act="injure"]', () => {
      const name = body.querySelector('#ed-injname').value;
      const days = U.clamp(Math.round(+body.querySelector('#ed-injdays').value || 1), 1, 400);
      d.injury = { name, days, total: days };
      body.querySelector('#ed-injstat').innerHTML = injLine();
    });

    render();
    const m = UI.modal({
      title: `Edit player: ${U.esc(p.first)} ${U.esc(p.last)}`, body, wide: true,
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
            if (p.age <= 26 && p.pot < 0) p.pot = 0;
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
    return m;
  };
})();
