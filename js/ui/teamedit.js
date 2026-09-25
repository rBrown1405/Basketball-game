/* Pro BBALL Coach — Team Editor: rebrand any franchise with a live preview.
 * Writes these team fields (the live game view reads them, keep the shapes exact):
 *   t.city, t.name, t.abbr (2-4 chars, unique), t.colors = { primary, secondary, trim }, t.badge = { shape },
 *   t.arena = 'Arena name', t.court = { wood: 'light'|'medium'|'dark', paint, logoText, apron } (t.wood mirrors t.court.wood),
 *   t.uniforms = { home: { jersey, number, trim, shorts }, away: {...} }, t.market (1-5), t.owner.patience / .spend (0-100),
 *   t.strat.off / .def / .tempo, plus t.defaultStrat = { off, def, tempo } when an AI team should keep its systems.
 * The league-generated originals are stored in t.orig on the first edit ("Reset to original" restores them). */
(function () {
  'use strict';
  const PBC = window.PBC;
  const U = PBC.U, C = PBC.Config, UI = PBC.UI;

  UI.addNav({ key: 'teamedit', label: 'Team Editor', icon: '🎨', group: 'Front Office' });

  const HEX = /^#[0-9a-f]{6}$/;
  const PIXEL_CHARS = /[A-Z0-9 :.\-/!+()?]/g; // glyphs the retro court font can draw
  const SHAPES = [['shield', 'Shield'], ['circle', 'Circle'], ['diamond', 'Diamond'], ['hexagon', 'Hexagon'], ['rounded', 'Rounded']];
  const WOODS = [['light', 'Light maple', '#e5ad5e'], ['medium', 'Medium oak', '#c9823e'], ['dark', 'Dark walnut', '#9a572c']];
  const UNI_PARTS = [['jersey', 'Jersey'], ['number', 'Number'], ['trim', 'Trim'], ['shorts', 'Shorts']];
  const MARKET = ['', 'Small', 'Modest', 'Mid-size', 'Large', 'Huge'];
  const PALETTES = [
    ['Royal & Gold', '#1d4ed8', '#fbbf24', '#ffffff'], ['Crimson & Black', '#c8102e', '#111111', '#ffffff'],
    ['Forest & Cream', '#14532d', '#e8dcb5', '#ffffff'], ['Navy & Orange', '#0b2a5b', '#f97316', '#ffffff'],
    ['Purple & Gold', '#552583', '#fdb927', '#ffffff'], ['Teal & Black', '#0f766e', '#0b0f17', '#e5e7eb'],
    ['Sky & Navy', '#38bdf8', '#0c2340', '#ffffff'], ['Wine & Gold', '#6d1a36', '#f5b700', '#ffffff'],
    ['Black & Silver', '#111111', '#c4ced4', '#ffffff'], ['Kelly & White', '#15803d', '#ffffff', '#111111'],
    ['Sunset', '#ea580c', '#7c3aed', '#fde68a'], ['Neon Beach', '#e11d74', '#06b6d4', '#111111'],
    ['Desert', '#b8471c', '#f9a01b', '#2b1a12'], ['Glacier', '#0e7490', '#e0f2fe', '#0f172a'],
    ['Maroon & Sky', '#7f1d1d', '#7dd3fc', '#ffffff'], ['Slate & Lime', '#374151', '#a3e635', '#f9fafb'],
  ];
  const FONT = 'Avenir Next Condensed, Barlow Condensed, Arial Narrow, sans-serif';

  // AI coaches re-pick their systems every offseason (PBC.AI.chooseStrategy). Teams given a default
  // strategy in this editor keep it: wrap the chooser without touching the AI module.
  if (PBC.AI && PBC.AI.chooseStrategy && !PBC.AI.chooseStrategy._teamEditor) {
    const base = PBC.AI.chooseStrategy;
    const wrapped = function (S, tid) {
      const out = base.apply(this, arguments);
      const t = S && S.teams ? S.teams[tid] : null;
      const ds = t && t.defaultStrat;
      if (ds && tid !== S.userTid) {
        if (C.OFFENSES[ds.off]) t.strat.off = ds.off;
        if (C.DEFENSES[ds.def]) t.strat.def = ds.def;
        if (C.TEMPOS[ds.tempo]) t.strat.tempo = ds.tempo;
        return t.strat;
      }
      return out;
    };
    wrapped._teamEditor = true;
    PBC.AI.chooseStrategy = wrapped;
  }

  let ed = null; // { S, tid, draft, base, side }

  // ---------------------------------------------------------------------------
  // Draft helpers
  // ---------------------------------------------------------------------------
  const lc = h => String(h || '').toLowerCase();
  const pickUni = u => ({ jersey: lc(u.jersey), number: lc(u.number), trim: lc(u.trim), shorts: lc(u.shorts) });
  const sameUni = (a, b) => UNI_PARTS.every(([k]) => lc(a[k]) === lc(b[k]));
  const apronFor = primary => U.shade(primary, -0.18);
  function normHex(v) {
    v = String(v || '').trim().toLowerCase();
    if (/^[0-9a-f]{6}$/.test(v) || /^[0-9a-f]{3}$/.test(v)) v = '#' + v;
    if (/^#[0-9a-f]{3}$/.test(v)) v = '#' + v.slice(1).split('').map(c => c + c).join('');
    return HEX.test(v) ? v : null;
  }
  function getPath(o, path) { return path.split('.').reduce((a, k) => (a == null ? a : a[k]), o); }
  function setPath(o, path, v) { const ks = path.split('.'); const last = ks.pop(); ks.reduce((a, k) => a[k], o)[last] = v; }
  const cleanAbbr = v => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
  const cleanLogo = v => (String(v || '').toUpperCase().match(PIXEL_CHARS) || []).join('').slice(0, 4);

  function draftFrom(t) {
    const court = UI.teamCourt(t);
    return {
      city: t.city, name: t.name, abbr: t.abbr, arena: t.arena || '',
      colors: { primary: lc(t.colors.primary), secondary: lc(t.colors.secondary), trim: lc(t.colors.trim) },
      badge: t.badge && UI.BADGE_SHAPES.includes(t.badge.shape) ? t.badge.shape : 'shield',
      court: { wood: WOODS.some(w => w[0] === court.wood) ? court.wood : 'medium', paint: lc(court.paint), logoText: cleanLogo(court.logoText || t.abbr), apron: lc(court.apron) },
      uniforms: { home: pickUni(UI.teamUniform(t, true)), away: pickUni(UI.teamUniform(t, false)) },
      market: t.market || 3, patience: t.owner ? t.owner.patience : 50, spend: t.owner ? t.owner.spend : 50,
      off: t.strat.off, def: t.strat.def, tempo: t.strat.tempo, lock: !!t.defaultStrat,
    };
  }

  /** New team colors; uniforms and court pieces still on their defaults follow along. */
  function setColors(d, colors) {
    const oldU = UI.defaultUniforms(d.colors), newU = UI.defaultUniforms(colors);
    for (const side of ['home', 'away']) if (sameUni(d.uniforms[side], oldU[side])) d.uniforms[side] = pickUni(newU[side]);
    if (lc(d.court.paint) === lc(d.colors.primary)) d.court.paint = colors.primary;
    if (lc(d.court.apron) === lc(apronFor(d.colors.primary))) d.court.apron = apronFor(colors.primary);
    d.colors = colors;
  }

  function snapshot(t) {
    return {
      city: t.city, name: t.name, abbr: t.abbr, colors: Object.assign({}, t.colors), wood: t.wood, market: t.market,
      owner: { patience: t.owner.patience, spend: t.owner.spend }, strat: { off: t.strat.off, def: t.strat.def, tempo: t.strat.tempo },
      court: t.court ? Object.assign({}, t.court) : null, arena: t.arena || null, badge: t.badge ? Object.assign({}, t.badge) : null,
      uniforms: t.uniforms ? JSON.parse(JSON.stringify(t.uniforms)) : null, defaultStrat: t.defaultStrat ? Object.assign({}, t.defaultStrat) : null,
    };
  }

  function applyDraft(S, t, d) {
    if (!t.orig) t.orig = snapshot(t);
    t.city = d.city.trim();
    t.name = d.name.trim();
    t.abbr = d.abbr;
    t.colors = { primary: d.colors.primary, secondary: d.colors.secondary, trim: d.colors.trim };
    t.badge = { shape: d.badge };
    t.arena = d.arena.trim() || UI.defaultArena(t);
    t.court = { wood: d.court.wood, paint: d.court.paint, logoText: d.court.logoText || t.abbr.slice(0, 4), apron: d.court.apron };
    t.wood = t.court.wood;
    t.uniforms = { home: pickUni(d.uniforms.home), away: pickUni(d.uniforms.away) };
    t.market = d.market;
    t.owner = Object.assign({}, t.owner, { patience: d.patience, spend: d.spend });
    t.strat = Object.assign({}, t.strat, { off: d.off, def: d.def, tempo: d.tempo });
    if (t.id !== S.userTid) {
      if (d.lock) t.defaultStrat = { off: d.off, def: d.def, tempo: d.tempo }; else delete t.defaultStrat;
    }
  }

  function restoreOriginal(t) {
    const o = t.orig;
    if (!o) return;
    Object.assign(t, { city: o.city, name: o.name, abbr: o.abbr, colors: Object.assign({}, o.colors), wood: o.wood, market: o.market });
    t.owner = Object.assign({}, t.owner, o.owner);
    t.strat = Object.assign({}, t.strat, o.strat);
    for (const k of ['court', 'arena', 'badge', 'uniforms', 'defaultStrat']) { if (o[k] == null) delete t[k]; else t[k] = JSON.parse(JSON.stringify(o[k])); }
    delete t.orig;
  }

  function validate(S, d, tid) {
    const err = {}, warn = {};
    const city = d.city.trim(), name = d.name.trim();
    if (!city) err.city = 'Enter a city.';
    if (!name) err.name = 'Enter a nickname.';
    if (!/^[A-Z0-9]{2,4}$/.test(d.abbr)) err.abbr = 'Use 2 to 4 letters or digits.';
    else {
      const dup = S.teams.find(x => x.id !== tid && String(x.abbr).toUpperCase() === d.abbr);
      if (dup) err.abbr = `The ${dup.city} ${dup.name} already use ${d.abbr}.`;
    }
    if (!err.name && city && name && S.teams.some(x => x.id !== tid && x.city.trim().toLowerCase() === city.toLowerCase() && x.name.trim().toLowerCase() === name.toLowerCase())) err.name = 'Another team already has this exact name.';
    if (!d.court.logoText) err.logoText = 'Enter 1 to 4 characters.';
    const odd = s => [...new Set(String(s).toUpperCase().replace(PIXEL_CHARS, '').split(''))].filter(Boolean).join(' ');
    const o1 = odd(city + name);
    if (o1 && !err.name && !err.city) warn.name = `The retro court font draws these as "?": ${o1}`;
    const o2 = odd(d.arena);
    if (o2) warn.arena = `The retro court font draws these as "?": ${o2}`;
    const lum = hex => { const c = U.hexToRgb(hex); return (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255; };
    for (const side of ['home', 'away']) {
      const u = d.uniforms[side];
      if (Math.abs(lum(u.jersey) - lum(u.number)) < 0.16) warn['uni_' + side] = 'The number is hard to read on this jersey.';
    }
    return { err, warn, ok: !Object.keys(err).length };
  }

  const draftTeam = d => ({ id: 'te' + (ed ? ed.tid : 0), abbr: d.abbr || '?', city: d.city, name: d.name, colors: d.colors, badge: { shape: d.badge } });
  function bestPlayer(S, tid) { return PBC.League.roster(S, tid)[0] || null; }
  const isDirty = () => !!ed && JSON.stringify(ed.draft) !== ed.base;

  // ---------------------------------------------------------------------------
  // Preview pieces
  // ---------------------------------------------------------------------------
  function jerseySvg(u, num, label) {
    const out = U.shade(u.jersey, -0.5), sOut = U.shade(u.shorts, -0.5);
    return `<figure class="te-jersey"><svg viewBox="0 0 60 78" width="74" height="96" role="img" aria-label="${label} uniform">
      <path d="M14 3 H20 Q30 17 40 3 H46 Q46.5 14 53 19.5 V50 H7 V19.5 Q13.5 14 14 3 Z" fill="${u.jersey}" stroke="${out}" stroke-width="1"/>
      <path d="M20 3 Q30 17 40 3" fill="none" stroke="${u.trim}" stroke-width="2.6"/>
      <path d="M14 3 Q13.5 14 7 19.5 M46 3 Q46.5 14 53 19.5" fill="none" stroke="${u.trim}" stroke-width="2.6"/>
      <text x="30" y="40" text-anchor="middle" font-family="${FONT}" font-weight="900" font-size="17" fill="${u.number}" stroke="${u.trim}" stroke-width="1" paint-order="stroke">${U.esc(num)}</text>
      <path d="M7 52 H53 L55 76 H35 L30 66 L25 76 H5 Z" fill="${u.shorts}" stroke="${sOut}" stroke-width="1"/>
      <path d="M7.2 54.3 H52.8" stroke="${u.trim}" stroke-width="2.4"/>
      <path d="M8.8 57 L7.4 74 M51.2 57 L52.6 74" stroke="${u.trim}" stroke-width="2"/>
    </svg><figcaption>${label}</figcaption></figure>`;
  }

  function courtSvg(d) {
    const wood = (WOODS.find(w => w[0] === d.court.wood) || WOODS[1])[2];
    const paint = d.court.paint, apron = d.court.apron, line = '#fff4dc';
    const logo = (d.court.logoText || d.abbr || '').slice(0, 4);
    const planks = Array.from({ length: 14 }, (_, i) => `<line x1="${22 + i * 12}" y1="10" x2="${22 + i * 12}" y2="102"/>`).join('');
    const band = `${d.city} ${d.name}`.trim().toUpperCase();
    return `<svg class="te-court" viewBox="0 0 200 112" role="img" aria-label="Court preview">
      <rect x="0" y="0" width="200" height="112" rx="6" fill="${apron}"/>
      <rect x="10" y="10" width="180" height="92" fill="${wood}"/>
      <g stroke="${U.shade(wood, -0.35)}" stroke-opacity=".35" stroke-width=".6">${planks}</g>
      <rect x="10" y="41.3" width="36.4" height="29.4" fill="${paint}"/><rect x="153.6" y="41.3" width="36.4" height="29.4" fill="${paint}"/>
      <circle cx="100" cy="56" r="11.4" fill="${paint}"/>
      <g fill="none" stroke="${line}" stroke-width="1.1">
        <rect x="10" y="10" width="180" height="92"/><line x1="100" y1="10" x2="100" y2="102"/><circle cx="100" cy="56" r="11.4"/>
        <rect x="10" y="41.3" width="36.4" height="29.4"/><rect x="153.6" y="41.3" width="36.4" height="29.4"/>
        <path d="M46.4 44.6 A11.4 11.4 0 0 1 46.4 67.4"/><path d="M153.6 44.6 A11.4 11.4 0 0 0 153.6 67.4"/>
        <path d="M10 15.5 H36.8 A44 44 0 0 1 36.8 96.5 H10"/><path d="M190 15.5 H163.2 A44 44 0 0 0 163.2 96.5 H190"/>
      </g>
      <g fill="none" stroke="#ff7a2e" stroke-width="1"><circle cx="20" cy="56" r="1.8"/><circle cx="180" cy="56" r="1.8"/></g>
      <text x="100" y="${logo.length >= 4 ? 59 : 59.8}" text-anchor="middle" font-family="${FONT}" font-weight="900" font-size="${logo.length >= 4 ? 8 : 10}" fill="${U.textOn(paint)}">${U.esc(logo)}</text>
      <text x="100" y="7.3" text-anchor="middle" font-family="${FONT}" font-weight="800" font-size="5.4" letter-spacing="1" fill="${U.textOn(apron)}" opacity=".92">${U.esc(band)}</text>
      <text x="100" y="108.6" text-anchor="middle" font-family="${FONT}" font-weight="800" font-size="5.4" letter-spacing="1" fill="${U.textOn(apron)}" opacity=".92">${U.esc(String(d.name || '').toUpperCase())}</text>
    </svg>`;
  }

  function previewHtml(S, d) {
    const tt = draftTeam(d);
    const best = bestPlayer(S, ed.tid);
    const num = best && best.num != null ? best.num : 0;
    const arena = d.arena.trim() || UI.defaultArena({ city: d.city, name: d.name });
    const hasPixel = !!(PBC.Match && PBC.Match.Pixel && PBC.Match.Pixel.preview);
    return `<div class="te-hero" style="--p:${d.colors.primary};--s:${d.colors.secondary};--tr:${d.colors.trim}">
        ${UI.teamBadge(tt, 70)}<div class="te-hero-t"><div class="te-hero-city">${U.esc(d.city.trim() || 'City')}</div><div class="te-hero-name">${U.esc(d.name.trim() || 'Nickname')}</div>
        <div class="te-hero-meta">${U.esc(d.abbr || '?')} · 🏟️ ${U.esc(arena)}</div></div></div>
      <div class="te-pv-sec"><div class="te-lbl">Badge</div><div class="te-badges">${[64, 44, 28, 20].map(s => UI.teamBadge(tt, s)).join('')}
        <span class="te-chip" style="background:${d.colors.primary};color:${U.textOn(d.colors.primary)};border-color:${d.colors.secondary}">${U.esc(d.abbr || '?')}</span></div></div>
      <div class="te-pv-sec"><div class="te-lbl">Uniforms</div><div class="te-kit">${jerseySvg(d.uniforms.home, num, 'Home')}${jerseySvg(d.uniforms.away, num, 'Away')}
        ${hasPixel ? `<figure class="te-sprite"><canvas id="te-sprite" width="120" height="150"></canvas><figcaption><span class="seg te-sidesel">${['home', 'away'].map(s => `<button class="${ed.side === s ? 'on' : ''}" data-side="${s}">${s === 'home' ? 'Home' : 'Away'}</button>`).join('')}</span></figcaption></figure>` : ''}</div>
        ${best && hasPixel ? `<div class="tiny dim">On court: #${U.esc(num)} ${U.esc(PBC.Player.name(best))}</div>` : ''}</div>
      <div class="te-pv-sec"><div class="te-lbl">Court</div>${courtSvg(d)}</div>`;
  }

  function drawSprite(root, S) {
    const cv = root.querySelector('#te-sprite');
    if (!cv) return;
    const best = bestPlayer(S, ed.tid) || { look: {}, num: 0, gender: S.leagueKey === 'women' ? 'f' : 'm' };
    try { PBC.Match.Pixel.preview(cv, best, { uniform: Object.assign({}, ed.draft.uniforms[ed.side]) }, 'stand'); } catch (e) { console.error(e); }
  }

  // ---------------------------------------------------------------------------
  // Form
  // ---------------------------------------------------------------------------
  const colorRow = (path, label) => `<div class="te-color"><span class="te-cl">${label}</span>
    <input type="color" data-f="${path}" aria-label="${U.esc(label)} color"><input class="inp te-hex" data-f="${path}" data-hex maxlength="7" spellcheck="false" aria-label="${U.esc(label)} hex"></div>`;
  const field = (key, label, extra, o) => `<label class="te-f"><span>${label}</span><input class="inp${o && o.cls ? ' ' + o.cls : ''}" data-f="${key}" ${extra || ''}><em data-err="${(o && o.err) || key}"></em></label>`;

  function pageHtml(S, t) {
    const user = t.id === S.userTid;
    const teams = [S.teams[S.userTid]].filter(Boolean).concat(U.sortBy(S.teams.filter(x => x.id !== S.userTid), x => x.city + ' ' + x.name));
    return `<div class="page te">
      <div class="page-h"><div><h1>🎨 Team Editor</h1><div class="sub">Rebrand any franchise: name, colors, badge, arena, court and uniforms, plus market size, owner and systems.</div></div>
        <div class="actions"><select class="inp te-pick" id="te-team" aria-label="Team to edit">${teams.map(x => `<option value="${x.id}" ${x.id === t.id ? 'selected' : ''}>${U.esc(x.city + ' ' + x.name)}${x.id === S.userTid ? ' (your team)' : ''}</option>`).join('')}</select></div></div>
      <div class="te-bar"><div class="te-bar-t">${UI.teamBadge(t, 30)}<div><div class="bold ellip">${U.esc(t.city + ' ' + t.name)}${user ? ' <span class="tag accent">Your team</span>' : ''}</div><div class="tiny muted" id="te-state"></div></div></div>
        <div class="te-bar-a"><button class="btn sm ghost" data-act="reset" ${t.orig ? '' : 'disabled'} title="Back to the team the league created"><span>↺ Reset<span class="te-long"> to original</span></span></button>
        <button class="btn sm" data-act="revert"><span>Discard<span class="te-long"> edits</span></span></button><button class="btn sm primary" data-act="save"><span>💾 Save<span class="te-long"> team</span></span></button></div></div>
      <div class="te-layout">
        <div class="te-form">
          <div class="card"><div class="card-h"><h3>Identity</h3></div><div class="card-b te-grid2">
            ${field('city', 'City', 'maxlength="24" autocomplete="off"')}${field('name', 'Nickname', 'maxlength="24" autocomplete="off"')}
            ${field('abbr', 'Abbreviation <i>2 to 4, unique</i>', 'maxlength="4" autocomplete="off"', { cls: 'te-up' })}
            ${field('arena', 'Arena', `maxlength="40" autocomplete="off" placeholder="${U.esc(UI.defaultArena(t))}"`)}
          </div></div>
          <div class="card"><div class="card-h"><h3>Team colors</h3><div class="actions"><button class="btn sm ghost" data-swap>⇄ Swap primary & secondary</button></div></div><div class="card-b">
            <div class="te-colors te-c3">${colorRow('colors.primary', 'Primary')}${colorRow('colors.secondary', 'Secondary')}${colorRow('colors.trim', 'Trim')}</div>
            <div class="te-lbl" style="margin-top:12px">Preset palettes</div>
            <div class="te-pals">${PALETTES.map((p, i) => `<button class="te-pal" data-palette="${i}" title="${U.esc(p[0])}"><span class="te-pal-sw"><i style="background:${p[1]}"></i><i style="background:${p[2]}"></i><i style="background:${p[3]}"></i></span><span class="te-pal-n">${U.esc(p[0])}</span></button>`).join('')}
              ${t.orig ? `<button class="te-pal" data-palette="orig" title="Original colors"><span class="te-pal-sw"><i style="background:${t.orig.colors.primary}"></i><i style="background:${t.orig.colors.secondary}"></i><i style="background:${t.orig.colors.trim}"></i></span><span class="te-pal-n">Original</span></button>` : ''}</div>
          </div></div>
          <div class="card"><div class="card-h"><h3>Badge</h3></div><div class="card-b"><div class="te-shapes" id="te-shapes"></div></div></div>
          <div class="card"><div class="card-h"><h3>Court</h3><div class="actions"><button class="btn sm ghost" data-court-default>Match team colors</button></div></div><div class="card-b col">
            <div class="te-lbl">Hardwood</div>
            <div class="seg te-woods">${WOODS.map(w => `<button data-set="court.wood" data-v="${w[0]}"><i class="te-wood" style="background:${w[2]}"></i>${w[1]}</button>`).join('')}</div>
            <div class="te-colors te-c3">${colorRow('court.paint', 'Paint')}${colorRow('court.apron', 'Sideline apron')}</div>
            ${field('court.logoText', 'Center-court logo <i>up to 4 characters</i>', 'maxlength="4" autocomplete="off"', { cls: 'te-up', err: 'logoText' })}
          </div></div>
          <div class="card"><div class="card-h"><h3>Uniforms</h3></div><div class="card-b te-grid2">
            ${['home', 'away'].map(side => `<div class="te-uni"><div class="row nowrap"><b class="up">${side === 'home' ? 'Home' : 'Away'}</b><div class="spacer"></div><button class="btn sm ghost" data-uni-default="${side}" title="Colors derived from the team colors">Default</button></div>
              <div class="te-colors">${UNI_PARTS.map(([k, l]) => colorRow(`uniforms.${side}.${k}`, l)).join('')}</div><em class="te-warn" data-err="uni_${side}"></em></div>`).join('')}
          </div></div>
          <div class="card"><div class="card-h"><h3>Front office</h3></div><div class="card-b col">
            <div class="te-mkt"><span class="te-lbl">Market size</span><span class="te-stars">${[1, 2, 3, 4, 5].map(n => `<button data-set="market" data-v="${n}" aria-label="${n} star market">★</button>`).join('')}</span><span class="small muted" data-out="market"></span></div>
            <label class="te-range"><span>Owner patience</span><input type="range" min="0" max="100" data-f="patience"><b data-out="patience"></b></label>
            <label class="te-range"><span>Owner spending</span><input type="range" min="0" max="100" data-f="spend"><b data-out="spend"></b></label>
            <div class="tiny muted">Patient owners give a coach more time; big spenders are happier to pay the luxury tax.</div>
          </div></div>
          <div class="card"><div class="card-h"><h3>Default systems</h3></div><div class="card-b col">
            <div class="te-grid2">
              <label class="te-f"><span>Offense</span><select class="inp" data-f="off">${Object.keys(C.OFFENSES).map(k => `<option value="${k}">${C.OFFENSES[k].icon || ''} ${U.esc(C.OFFENSES[k].label)}</option>`).join('')}</select></label>
              <label class="te-f"><span>Defense</span><select class="inp" data-f="def">${Object.keys(C.DEFENSES).map(k => `<option value="${k}">${C.DEFENSES[k].icon || ''} ${U.esc(C.DEFENSES[k].label)}</option>`).join('')}</select></label>
            </div>
            <div class="te-lbl">Tempo</div>
            <div class="seg">${Object.keys(C.TEMPOS).map(k => `<button data-set="tempo" data-v="${k}">${U.esc(C.TEMPOS[k].label)}</button>`).join('')}</div>
            ${user ? '<div class="tiny muted">This is your team: you can also change systems any time on the Strategy screen.</div>'
              : '<label class="chk small"><input type="checkbox" data-f="lock"> Keep these systems every season (otherwise the AI coach picks new ones for the roster each offseason)</label>'}
          </div></div>
        </div>
        <div class="te-side"><div class="card te-preview"><div class="card-h"><h3>Live preview</h3></div><div class="card-b" id="te-preview"></div></div></div>
      </div></div>`;
  }

  let raf = 0, shapesSig = '', previewSig = '';
  function sync(root, S) {
    const d = ed.draft;
    // re-render the badge picker / preview only when what they show changed: replacing buttons while
    // the mouse is down (blur -> change -> sync) would swallow the click
    const shapes = root.querySelector('#te-shapes');
    const sSig = JSON.stringify([d.colors, d.abbr]);
    if (shapes && (sSig !== shapesSig || !shapes.firstChild)) {
      shapesSig = sSig;
      const tt = draftTeam(d);
      shapes.innerHTML = SHAPES.map(([k, l]) => `<button class="te-shape" data-set="badge" data-v="${k}">${UI.teamBadge(Object.assign({}, tt, { badge: { shape: k } }), 46)}<span>${l}</span></button>`).join('');
    }
    root.querySelectorAll('[data-f]').forEach(el => {
      if (el === document.activeElement && el.type !== 'checkbox') return;
      const v = getPath(d, el.dataset.f);
      if (el.type === 'checkbox') el.checked = !!v;
      else if (el.dataset.hex != null) el.value = String(v || '').toUpperCase();
      else el.value = v == null ? '' : v;
      el.classList.remove('bad');
    });
    root.querySelectorAll('[data-set]').forEach(el => {
      const cur = getPath(d, el.dataset.set);
      el.classList.toggle('on', el.dataset.set === 'market' ? +el.dataset.v <= +cur : String(cur) === el.dataset.v);
    });
    const out = (k, html) => { const el = root.querySelector(`[data-out="${k}"]`); if (el) el.innerHTML = html; };
    out('market', `${MARKET[d.market] || ''} market`);
    out('patience', `${d.patience} <span class="dim">${d.patience >= 65 ? 'Patient' : d.patience >= 45 ? 'Average' : 'Impatient'}</span>`);
    out('spend', `${d.spend} <span class="dim">${d.spend >= 70 ? 'Big spender' : d.spend >= 40 ? 'Moderate' : 'Frugal'}</span>`);
    const v = validate(S, d, ed.tid);
    root.querySelectorAll('[data-err]').forEach(el => {
      const k = el.dataset.err, msg = v.err[k] || v.warn[k] || '';
      el.textContent = msg;
      el.classList.toggle('bad-t', !!v.err[k]);
      el.classList.toggle('warn-t', !v.err[k] && !!v.warn[k]);
      const inp = el.parentElement && el.parentElement.querySelector('input');
      if (inp && el.parentElement.classList.contains('te-f')) inp.classList.toggle('bad', !!v.err[k]);
    });
    const dirty = isDirty();
    const st = root.querySelector('#te-state');
    if (st) st.innerHTML = !v.ok ? '<span class="bad-t">Fix the highlighted fields to save</span>' : dirty ? '<span class="warn-t">● Unsaved edits</span>' : (S.teams[ed.tid].orig ? 'Customized team · all changes saved' : 'Original league look');
    const saveBtn = root.querySelector('[data-act="save"]'), revBtn = root.querySelector('[data-act="revert"]');
    if (saveBtn) saveBtn.disabled = !dirty || !v.ok;
    if (revBtn) revBtn.disabled = !dirty;
    const pSig = JSON.stringify(d) + '|' + ed.side + '|' + ed.tid;
    if (pSig === previewSig) return;
    previewSig = pSig;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const pv = root.querySelector('#te-preview');
      if (!pv || !ed) return;
      pv.innerHTML = previewHtml(S, ed.draft);
      drawSprite(root, S);
    });
  }

  function onField(root, S, el, committed) {
    const d = ed.draft;
    const path = el.dataset.f;
    let v = el.type === 'checkbox' ? el.checked : el.type === 'range' ? +el.value : el.value;
    if (/^(colors|uniforms)\.|^court\.(paint|apron)$/.test(path)) {
      const hex = normHex(v);
      if (!hex) { if (committed) { el.value = String(getPath(d, path) || '').toUpperCase(); el.classList.remove('bad'); } else el.classList.add('bad'); return; }
      el.classList.remove('bad');
      if (path.indexOf('colors.') === 0) setColors(d, Object.assign({}, d.colors, { [path.split('.')[1]]: hex }));
      else setPath(d, path, hex);
    } else if (path === 'abbr') {
      v = cleanAbbr(v);
      if (el.value !== v) el.value = v;
      if (d.court.logoText === d.abbr.slice(0, 4)) d.court.logoText = cleanLogo(v);
      d.abbr = v;
    } else if (path === 'court.logoText') {
      v = cleanLogo(v);
      if (el.value !== v) el.value = v;
      d.court.logoText = v;
    } else {
      setPath(d, path, v);
      if ((path === 'off' || path === 'def') && ed.tid !== S.userTid) d.lock = true;
    }
    sync(root, S);
  }

  function wire(root, S) {
    root.addEventListener('input', e => { const el = e.target.closest('[data-f]'); if (el && el.type !== 'checkbox' && el.tagName !== 'SELECT') onField(root, S, el, false); });
    root.addEventListener('change', e => {
      if (e.target.id === 'te-team') { switchTeam(root, S, +e.target.value); return; }
      const el = e.target.closest('[data-f]');
      if (el) onField(root, S, el, true);
    });
    UI.on(root, 'click', '[data-set]', (e, el) => {
      const k = el.dataset.set, raw = el.dataset.v;
      setPath(ed.draft, k, k === 'market' ? +raw : raw);
      if (k === 'tempo' && ed.tid !== S.userTid) ed.draft.lock = true;
      sync(root, S);
    });
    UI.on(root, 'click', '[data-palette]', (e, el) => {
      const t = S.teams[ed.tid];
      const p = el.dataset.palette === 'orig' ? (t.orig ? [0, t.orig.colors.primary, t.orig.colors.secondary, t.orig.colors.trim] : null) : PALETTES[+el.dataset.palette];
      if (!p) return;
      setColors(ed.draft, { primary: lc(p[1]), secondary: lc(p[2]), trim: lc(p[3]) });
      sync(root, S);
    });
    UI.on(root, 'click', '[data-swap]', () => { const c = ed.draft.colors; setColors(ed.draft, { primary: c.secondary, secondary: c.primary, trim: c.trim }); sync(root, S); });
    UI.on(root, 'click', '[data-uni-default]', (e, el) => { const side = el.dataset.uniDefault; ed.draft.uniforms[side] = pickUni(UI.defaultUniforms(ed.draft.colors)[side]); sync(root, S); });
    UI.on(root, 'click', '[data-court-default]', () => {
      const d = ed.draft;
      d.court = Object.assign({}, d.court, { paint: d.colors.primary, apron: apronFor(d.colors.primary), logoText: cleanLogo(d.abbr) || d.court.logoText });
      sync(root, S);
    });
    UI.on(root, 'click', '[data-side]', (e, el) => { ed.side = el.dataset.side; sync(root, S); });
    UI.on(root, 'click', '[data-act]', async (e, el) => {
      const a = el.dataset.act;
      if (a === 'save') saveTeam(root, S);
      if (a === 'revert') { ed.draft = JSON.parse(ed.base); sync(root, S); }
      if (a === 'reset') resetTeam(S);
    });
  }

  async function switchTeam(root, S, tid) {
    if (isDirty() && !(await UI.confirm(`Discard your unsaved edits to the ${U.esc(S.teams[ed.tid].city + ' ' + S.teams[ed.tid].name)}?`, { ok: 'Discard edits', danger: true, title: 'Unsaved edits' }))) {
      const sel = root.querySelector('#te-team'); if (sel) sel.value = String(ed.tid);
      return;
    }
    ed = null;
    UI.go('teamedit', { tid });
  }

  function saveTeam(root, S) {
    const t = S.teams[ed.tid], d = ed.draft;
    const v = validate(S, d, ed.tid);
    if (!v.ok) {
      UI.toast('Fix the highlighted fields first.', 'bad');
      sync(root, S);
      const bad = root.querySelector('input.bad');
      if (bad) bad.focus();
      return;
    }
    const before = { city: t.city, name: t.name, abbr: t.abbr };
    applyDraft(S, t, d);
    if (before.city !== t.city || before.name !== t.name || before.abbr !== t.abbr) {
      if (PBC.Season && PBC.Season.news) PBC.Season.news(S, `🎨 Rebrand: the ${before.city} ${before.name} are now the ${t.city} ${t.name} (${t.abbr}).`, 'league', t.id);
    }
    ed = null;
    if (t.id === S.userTid) UI.applyTeamColors();
    UI.save();
    UI.refresh();
    UI.toast(`🎨 Saved the ${U.esc(t.city + ' ' + t.name)}`, 'good');
  }

  async function resetTeam(S) {
    const t = S.teams[ed.tid];
    if (!t.orig) { UI.toast('This team still has its original look.', 'info'); return; }
    const o = t.orig;
    if (!(await UI.confirm(`Reset the ${U.esc(t.city + ' ' + t.name)} to the original <b>${U.esc(o.city + ' ' + o.name)}</b>? Name, colors, badge, arena, court, uniforms, market, owner and systems go back to how the league created them.`, { ok: 'Reset team', danger: true, title: 'Reset to original' }))) return;
    restoreOriginal(t);
    ed = null;
    if (t.id === S.userTid) UI.applyTeamColors();
    UI.save();
    UI.refresh();
    UI.toast(`↺ The ${U.esc(t.city + ' ' + t.name)} are back to their original look`, 'good');
  }

  UI.register('teamedit', {
    title: 'Team Editor',
    render(root, params) {
      const S = UI.S;
      if (ed && ed.S !== S) ed = null;
      let tid = params && params.tid != null && S.teams[+params.tid] ? +params.tid : ed && isDirty() ? ed.tid : S.userTid;
      if (!S.teams[tid]) tid = 0;
      const t = S.teams[tid];
      const base = JSON.stringify(draftFrom(t));
      if (!ed || ed.tid !== tid || ed.base !== base) ed = { S, tid, draft: JSON.parse(base), base, side: ed && ed.tid === tid ? ed.side : 'away' };
      root.innerHTML = pageHtml(S, t);
      shapesSig = previewSig = '';
      wire(root, S);
      sync(root, S);
    },
  });

  /** Opens the editor on a team (other screens can link here, e.g. a team page's "Edit team" button). */
  UI.openTeamEditor = tid => UI.go('teamedit', tid != null ? { tid } : null);

  PBC.TeamEditor = { draftFrom, applyDraft, restoreOriginal, validate, PALETTES };
})();
