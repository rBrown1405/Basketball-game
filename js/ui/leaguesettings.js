/* Pro BBALL Coach — League Settings: gameplay sliders, presets and league behaviour (PBC.Sliders). */
(function () {
  'use strict';
  const PBC = window.PBC;
  const U = PBC.U, UI = PBC.UI;
  const SL = () => PBC.Sliders;

  UI.addNav({ key: 'leaguesettings', label: 'League Settings', icon: '🎚️', group: 'Career' });

  function sliderRow(def, v) {
    const Sx = SL();
    const off = +v !== def.def;
    return `<div class="gsl-row ${off ? 'changed' : ''}" data-row="${def.key}">
      <div class="gsl-top"><span class="gsl-lab">${U.esc(def.label)}</span>
        <span class="gsl-eff" id="gsl-eff-${def.key}">${U.esc(Sx.describe(def.key, v))}</span>
        <b class="gsl-val" id="gsl-val-${def.key}">${v}</b>
        <button class="gsl-undo" data-undo="${def.key}" title="Back to 50" ${off ? '' : 'hidden'}>↺</button></div>
      <input type="range" class="gsl-range" min="0" max="100" step="1" value="${v}" data-sl="${def.key}" aria-label="${U.esc(def.label)}">
      <div class="gsl-ends"><span>${U.esc(def.lo || 'Less')}</span><span>${U.esc(def.hi || 'More')}</span></div>
      <div class="gsl-desc">${U.esc(def.desc || '')}</div></div>`;
  }

  function toggleRow(def, v) {
    return `<label class="gsl-row gsl-toggle" data-row="${def.key}"><input type="checkbox" data-tg="${def.key}" ${v ? 'checked' : ''}>
      <div><div class="gsl-lab">${U.esc(def.label)}</div><div class="gsl-desc">${U.esc(def.desc || '')}</div></div></label>`;
  }

  function groupCard(g, s, extra) {
    const defs = SL().DEFS.filter(d => d.group === g.key);
    return `<div class="card gsl-card" data-group="${g.key}"><div class="card-h"><h3>${g.icon} ${U.esc(g.label)}</h3>
      <div class="actions">${extra || ''}</div></div>
      <div class="card-b"><p class="gsl-gdesc">${U.esc(g.desc)}</p>${defs.map(d => (d.type === 'toggle' ? toggleRow(d, s[d.key]) : sliderRow(d, s[d.key]))).join('')}</div></div>`;
  }

  UI.register('leaguesettings', {
    title: 'League Settings',
    render(root) {
      const S = UI.S;
      if (!PBC.Sliders) { root.innerHTML = '<div class="page"><div class="card"><div class="empty">Sliders are not available.</div></div></div>'; return; }
      const Sx = SL();
      const s = Sx.get(S);
      const groups = Sx.GROUPS;
      const gameGroups = groups.filter(g => g.key !== 'user' && g.key !== 'league');
      const presetBtns = () => Sx.PRESET_KEYS.map(k => {
        const p = Sx.PRESETS[k];
        return `<button class="gsl-preset ${s.preset === k ? 'on' : ''}" data-preset="${k}"><span class="gsl-pi">${p.icon}</span><span><b>${U.esc(p.label)}</b><span class="gsl-pd">${U.esc(p.desc)}</span></span></button>`;
      }).join('');
      root.innerHTML = `<div class="page gsl-page">
        <div class="page-h"><div><h1>🎚️ League Settings</h1>
          <div class="sub">Tune how games are played and how players react to the league. 50 is the calibrated default. Changes apply from the next game.</div></div>
          <div class="actions"><button class="btn" data-reset="game">Reset gameplay</button><button class="btn" data-reset="league">Reset league behaviour</button><button class="btn danger" data-reset="all">Reset everything</button></div></div>
        <div class="card gsl-presets-card"><div class="card-h"><h3>Presets</h3><div class="actions"><span class="tag ${s.preset === 'custom' ? 'warn' : 'info'}" id="gsl-preset-tag">${s.preset === 'custom' ? 'Custom' : U.esc((Sx.PRESETS[s.preset] || {}).label || 'Custom')}</span></div></div>
          <div class="card-b"><div class="gsl-presets" id="gsl-presets">${presetBtns()}</div>
          <p class="small muted" style="margin:10px 0 0">Presets set the gameplay sliders. Your team difficulty handles and league behaviour stay as they are (Default also resets your team handles).</p></div></div>
        <h2 class="gsl-h2">Gameplay</h2>
        <div class="gsl-grid">${gameGroups.map(g => groupCard(g, s)).join('')}</div>
        <h2 class="gsl-h2">Difficulty</h2>
        <div class="gsl-grid">${groupCard(groups.find(g => g.key === 'user'), s)}
          <div class="card gsl-card gsl-note"><div class="card-h"><h3>💡 How it works</h3></div><div class="card-b small muted">
            <p>Every slider starts at <b>50</b>, the engine's calibrated setting (about 115 points, 100 possessions and 37 three-point attempts per team in the men's league).</p>
            <p><b>Upsets & Variance</b> gives every team a hidden form each night. Once in a while an underdog catches fire and can't miss, even against a far better team; favorites have the occasional off night.</p>
            <p><b>Playoff Intensity</b> grows every round: tighter rotations, stars on the floor longer, slower and more physical games. Elimination games and Game 7s go hardest.</p>
            <p>Player <b>tendencies</b> (how often a player shoots threes, posts up, crashes the glass...) are edited in the Player Editor.</p></div></div></div>
        <h2 class="gsl-h2">League</h2>
        <div class="gsl-grid gsl-grid-1">${groupCard(groups.find(g => g.key === 'league'), s)}</div>
      </div>`;

      const refreshPreset = () => {
        const tag = root.querySelector('#gsl-preset-tag');
        if (tag) { tag.textContent = s.preset === 'custom' ? 'Custom' : (Sx.PRESETS[s.preset] || {}).label || 'Custom'; tag.className = 'tag ' + (s.preset === 'custom' ? 'warn' : 'info'); }
        root.querySelectorAll('[data-preset]').forEach(b => b.classList.toggle('on', b.dataset.preset === s.preset));
      };
      const paintRow = key => {
        const d = Sx.BY_KEY[key];
        const v = s[key];
        const row = root.querySelector(`[data-row="${key}"]`);
        if (!row || d.type === 'toggle') return;
        const inp = row.querySelector('[data-sl]');
        if (inp && +inp.value !== v) inp.value = v;
        row.querySelector('.gsl-val').textContent = v;
        row.querySelector('.gsl-eff').textContent = Sx.describe(key, v);
        const off = v !== d.def;
        row.classList.toggle('changed', off);
        const u = row.querySelector('[data-undo]');
        if (u) u.hidden = !off;
      };
      const paintAll = () => { for (const d of Sx.DEFS) { if (d.type === 'toggle') { const c = root.querySelector(`[data-tg="${d.key}"]`); if (c) c.checked = !!s[d.key]; } else paintRow(d.key); } refreshPreset(); };

      UI.on(root, 'input', '[data-sl]', (e, el) => {
        const key = el.dataset.sl;
        Sx.set(S, key, +el.value);
        paintRow(key);
        refreshPreset();
      });
      UI.on(root, 'change', '[data-sl]', () => UI.save());
      UI.on(root, 'change', '[data-tg]', (e, el) => { Sx.set(S, el.dataset.tg, el.checked); UI.save(); });
      UI.on(root, 'click', '[data-undo]', (e, el) => { Sx.set(S, el.dataset.undo, 50); paintRow(el.dataset.undo); refreshPreset(); UI.save(); });
      UI.on(root, 'click', '[data-preset]', (e, el) => {
        Sx.applyPreset(S, el.dataset.preset);
        paintAll();
        UI.save();
        UI.toast(`${(Sx.PRESETS[el.dataset.preset] || {}).label || 'Preset'} preset applied`, 'good');
      });
      UI.on(root, 'click', '[data-reset]', async (e, el) => {
        const which = el.dataset.reset;
        const what = which === 'all' ? 'every gameplay slider and league behaviour setting' : which === 'league' ? 'the league behaviour settings' : 'the gameplay sliders (including your team handles)';
        if (!(await UI.confirm(`Reset ${what} to the defaults?`, { ok: 'Reset', danger: which === 'all' }))) return;
        Sx.reset(S, which);
        paintAll();
        UI.save();
        UI.toast('Back to the defaults', 'info');
      });
    },
  });
})();
