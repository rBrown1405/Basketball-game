/* Pro BBALL Coach: the timeout huddle, the head coach's calls for the next possessions.
 * The live game opens it when the coach's timeout is granted at a dead ball, before the next possession is played
 * (and from the Coach tab at any time: a call from the sideline, no timeout needed). Three columns:
 *  - Offense: a play from the playbook for the next 1, 2, 3 or 5 half-court possessions (the staff calls the rest), each
 *    with who it is run for, how well the five on the floor fit it and what it has scored tonight; an inbound play for
 *    the next throw-in under the basket and from the sideline in the front court.
 *  - Defense: the scheme and, within man-to-man, the pick-and-roll coverage for the next 3, 5 or 10 defensive
 *    possessions or the rest of the game (then back to what the team played before).
 *  - Lineup: substitutions (they check in at this dead ball).
 * Nothing goes to the engine until the coach goes back to the game (js/core/sim.js: callPlay, callInbound,
 * callDefense). */
(function () {
  'use strict';
  const PBC = window.PBC;
  const U = PBC.U, C = PBC.Config, UI = PBC.UI;
  const NS = [1, 2, 3, 5];
  const DNS = [[3, 'Next 3'], [5, 'Next 5'], [10, 'Next 10'], [Infinity, 'Rest of game']];
  const SCHEME_COV = { switch: 1, drop: 1, blitz: 1, hedge: 1 };
  // the coach's orders on a man (js/core/sim.js setOrders)
  const ORD = [['', 'Normal'], ['deny', 'Deny the ball'], ['sag', 'Sag off'], ['double', 'Double team'], ['force', 'Force the weak hand'], ['hack', 'Hack: foul on purpose']];
  const ORD_LABEL = { deny: 'Deny', sag: 'Sag off', double: 'Double', force: 'Force weak hand', hack: 'Hack' };
  const FILTERS = [['all', 'All'], ['mine', 'My plays'], ['pnr', 'Pick and roll'], ['horns', 'Horns'], ['offscreen', 'Off-screen'], ['handoff', 'Hand-off'], ['post', 'Post'], ['iso', 'Isolation'], ['cut', 'Cutting'], ['spot', 'Motion'], ['zone', 'Vs zone'], ['late', 'Late game']];
  let filter = 'all';

  /** what a play has scored tonight (the staff's calls and the coach's) */
  function tonight(T, id) {
    const r = T.pb && T.pb.mem[id];
    if (!r || !r.n) return '';
    return `${r.pts} pts in ${Math.round(r.n)}`;
  }
  function fitTag(f) { return f >= 76 ? 'good' : f >= 68 ? 'good' : f >= 60 ? 'info' : 'bad'; }

  /**
   * Opens the huddle. o: { g, idx (the coach's team), S, teams, mode: 'timeout' | 'bench', score: [a, b], clock,
   * period }. Resolves when the coach goes back to the game, with a short summary of the calls (or null: none).
   */
  UI.huddle = function (o) {
    const g = o.g, idx = o.idx, T = g.t[idx], OPP = g.t[1 - idx];
    const PB = PBC.Playbook;
    const calls = PBC.Sim.calls(g, idx);
    const st = {
      play: calls.play ? calls.play.id : null, n: calls.play ? Math.min(5, Math.max(1, calls.play.left)) : 1,
      blob: calls.inb.blob, slob: calls.inb.slob,
      def: T.strat.def, cov: calls.cov, dn: calls.def ? calls.def.left : 5, defDirty: false,
      subPick: null,
      // who guards whom (their man -> your defender) and your orders on their men
      mm: PBC.Sim.matchupsFor ? Object.assign({}, PBC.Sim.matchupsFor(g, idx)) : {}, mm0: null, mmDirty: false,
      ord: Object.assign({}, T.orders || {}), ordDirty: false,
    };
    st.mm0 = Object.assign({}, st.mm);
    const half = (T.pb ? T.pb.plays : []).filter((p) => !p.inbound);
    const inb = { blob: T.pb ? T.pb.inb.blob : [], slob: T.pb ? T.pb.inb.slob : [] };
    const five = T.on.slice();
    const fits = {};
    for (const p of half) { const bf = five.length === 5 ? PB.bestFit(p, five) : null; fits[p.id] = bf; }
    const ppp = (Ti) => (Ti.poss ? g.score[Ti.idx] / Ti.poss : 0);
    const best = (() => {
      const m = T.pb ? T.pb.mem : {};
      let b = null;
      for (const id in m) if (m[id].n >= 1 && PB.get(id) && (!b || m[id].pts / m[id].n > m[b].pts / m[b].n)) b = id;
      return b ? `${PB.get(b).name} (${tonight(T, b)})` : '';
    })();

    return new Promise((resolve) => {
      const sc = o.score || g.score;
      const title = o.mode === 'timeout' ? '⏱ Timeout' : '📋 Call a play';
      const body = UI.h('<div class="hd"></div>');
      const m = UI.modal({
        title: title + ' · ' + U.esc(o.teams[idx].city + ' ' + o.teams[idx].name), body, xwide: true, noBackdropClose: true,
        actions: [{ label: 'Clear my calls', cls: 'ghost', onClick: () => { st.play = null; st.blob = null; st.slob = null; if (calls.def) { st.def = calls.def.prev.def; st.cov = calls.def.prev.cov; st.defDirty = true; } render(); } },
          { label: 'Back to the game ▶', cls: 'primary', onClick: (close) => close() }],
        onClose: () => resolve(apply()),
      });
      function apply() {
        const out = [];
        const was = calls.play ? calls.play.id + '|' + calls.play.left : '';
        if ((st.play ? st.play + '|' + st.n : '') !== was) PBC.Sim.callPlay(g, idx, st.play, st.n);
        if (st.play) out.push(`📋 ${PB.get(st.play).name}: next ${st.n > 1 ? st.n + ' possessions' : 'possession'}`);
        PBC.Sim.callInbound(g, idx, 'blob', st.blob);
        PBC.Sim.callInbound(g, idx, 'slob', st.slob);
        if (st.blob) out.push(`Under the basket: ${PB.get(st.blob).name}`);
        if (st.slob) out.push(`Sideline: ${PB.get(st.slob).name}`);
        if (st.mmDirty) {
          PBC.Sim.setMatchups(g, idx, st.mm);
          const ch = Object.keys(st.mm).filter((k) => +st.mm[k] !== +st.mm0[k]).map((k) => { const d = T.players.find((c) => c.id === +st.mm[k]), o2 = OPP.players.find((c) => c.id === +k); return d && o2 ? `${d.last} on ${o2.last}` : ''; }).filter(Boolean);
          if (ch.length) out.push(`🔒 ${ch.join(', ')}`);
        }
        if (st.ordDirty) {
          PBC.Sim.setOrders(g, idx, st.ord);
          const list = Object.keys(st.ord).map((id) => { const o2 = OPP.players.find((c) => c.id === +id); return o2 ? `${ORD_LABEL[st.ord[id]]}: ${o2.last}` : ''; }).filter(Boolean);
          out.push(list.length ? `🎯 ${list.join(', ')}` : '🎯 No special orders');
        }
        if (st.defDirty) {
          PBC.Sim.callDefense(g, idx, st.def, covAllowed(st.def) ? st.cov : null, st.dn);
          const cv = covAllowed(st.def) && st.cov ? ' (' + PB.COVERAGES[st.cov].label + ')' : '';
          out.push(`🛡️ ${C.DEFENSES[st.def].label}${cv}: ${st.dn === Infinity ? 'rest of the game' : 'next ' + st.dn + ' defensive possessions'}`);
        }
        return out.length ? out : null;
      }
      const covAllowed = (def) => !SCHEME_COV[def] && !(C.DEFENSES[def] && C.DEFENSES[def].mods && C.DEFENSES[def].mods.isZone) && def !== 'press';

      function playCard(p) {
        const bf = fits[p.id], f = bf ? Math.round(bf.fit) : null;
        const who = bf && bf.roles[p.primary] ? bf.roles[p.primary] : null;
        const on = st.play === p.id;
        const tn = tonight(T, p.id);
        const tags = p.tags.filter((t) => UI.PLAY_TAG_NAME[t]).slice(0, 2).map((t) => `<span class="tag ${t === 'ato' || t === 'eog' ? 'gold' : 'info'}">${UI.PLAY_TAG_NAME[t]}</span>`).join('');
        return `<button class="hd-play ${on ? 'on' : ''}" data-play="${p.id}">${UI.playDiagram(p, 118)}
          <div class="hd-pi"><div class="hd-pn">${p.custom ? '✏️ ' : ''}${U.esc(p.name)}</div>
          <div class="tiny muted">${U.esc(PB.FAMILY[p.family] || p.family)}${who ? ' · for ' + U.esc(who.last) : ''}</div>
          <div class="hd-pt">${f != null ? `<span class="tag ${fitTag(f)}">fit ${f}</span>` : ''}${tn ? `<span class="tag">${tn}</span>` : ''}${tags}</div></div></button>`;
      }
      function listPlays() {
        return half.filter((p) => {
          if (filter === 'all') return true;
          if (filter === 'mine') return !!p.custom;
          if (filter === 'late') return p.tags.includes('eog') || p.tags.includes('need3') || p.tags.includes('ato');
          if (filter === 'zone') return p.family === 'zone' || p.tags.includes('zone');
          return p.family === filter;
        }).sort((a, b) => (b.custom ? 1 : 0) - (a.custom ? 1 : 0) || ((fits[b.id] ? fits[b.id].fit : 0) - (fits[a.id] ? fits[a.id].fit : 0)));
      }
      /** their five, who guards each and how (the hack only for a poor free throw shooter) */
      function mmRows() {
        return OPP.on.map((o2) => {
          const ft = PBC.Adjust ? Math.round(PBC.Adjust.ftExpect(g, o2) * 100) : null;
          const od = st.ord[o2.id] || '';
          return `<div class="hd-mmr ${od ? 'on' : ''}"><span class="hd-mmo">${UI.avatar(o2.p, 24)}<span class="ellip"><b>${U.esc(o2.last)}</b> <span class="tiny dim">${o2.pos} · ${o2.st.pts}p${ft != null && ft < 65 ? ' · FT ' + ft + '%' : ''}</span></span></span>
            <select class="inp" data-mmd="${o2.id}" title="Who guards this player">${T.on.map((d) => `<option value="${d.id}" ${+st.mm[o2.id] === d.id ? 'selected' : ''}>${U.esc(d.last)}</option>`).join('')}</select>
            <select class="inp" data-mmo="${o2.id}">${ORD.filter(([k]) => k !== 'hack' || (ft != null && ft < 65) || od === 'hack').map(([k, l]) => `<option value="${k}" ${od === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`;
        }).join('');
      }
      function row(c, where) {
        const pick = st.subPick === c.id;
        return `<div class="cp-row ${pick ? 'pick' : ''} ${c.out || c.inj ? 'dis' : ''}" data-pc="${c.id}" data-where="${where}">
          ${UI.avatar(c.p, 26)}<span class="ellip" style="flex:1">${U.esc(c.last)} <span class="dim tiny">${c.pos}</span></span>
          <span class="tiny ${c.pf >= 4 ? 'bad-t' : 'dim'}">${c.pf}PF</span><span class="tiny">${c.st.pts}p</span>
          <span class="en"><i style="width:${Math.round(c.energy)}%;background:${c.energy > 70 ? 'var(--good)' : c.energy > 50 ? 'var(--warn)' : 'var(--bad)'}"></i></span></div>`;
      }
      function render() {
        const per = o.period || g.period, clock = o.clock != null ? o.clock : g.clock;
        const lead = sc[idx] - sc[1 - idx];
        const inbSel = (fam, label) => {
          const list = inb[fam];
          if (!list.length) return '';
          return `<div><label class="small muted">${label}</label><select class="inp" data-inb="${fam}"><option value="">Staff's choice</option>${list.map((p) => `<option value="${p.id}" ${st[fam] === p.id ? 'selected' : ''}>${p.custom ? '✏️ ' : ''}${U.esc(p.name)}</option>`).join('')}</select></div>`;
        };
        const dm = C.DEFENSES;
        const covOk = covAllowed(st.def);
        const queued = T.manualSubs.map((q) => { const a = T.players.find((c) => c.id === q.in), b = T.players.find((c) => c.id === q.out); return a && b ? `${a.last} for ${b.last}` : ''; }).filter(Boolean);
        body.innerHTML = `
          <div class="hd-top small">
            <span class="hd-sc"><b>${U.esc(o.teams[idx].abbr)} ${sc[idx]}</b> · ${U.esc(o.teams[1 - idx].abbr)} ${sc[1 - idx]}</span>
            <span>${U.periodName(per, true)} ${U.clock(clock, true)}</span>
            <span class="${lead > 0 ? 'good-t' : lead < 0 ? 'bad-t' : ''}">${lead > 0 ? 'Up ' + lead : lead < 0 ? 'Down ' + -lead : 'Tied'}</span>
            ${o.mode === 'timeout' ? `<span class="muted">${Math.max(0, T.timeouts - 1)} timeout${T.timeouts - 1 === 1 ? '' : 's'} left after this one</span>` : '<span class="muted">From the sideline: no timeout used</span>'}
          </div>
          <div class="hd-grid">
            <div class="hd-col hd-off"><div class="hd-h">Offense <span class="tiny muted">${T.poss ? ppp(T).toFixed(2) + ' points per possession tonight' : ''}${best ? ' · best: ' + U.esc(best) : ''}</span></div>
              <div class="row hd-n"><span class="small muted">Run it for the next</span><div class="seg" data-seg="n">${NS.map((k) => `<button data-v="${k}" class="${st.n === k ? 'on' : ''}">${k === 1 ? '1 possession' : k}</button>`).join('')}</div></div>
              <div class="hd-filters">${FILTERS.filter(([k]) => k !== 'mine' || half.some((p) => p.custom)).map(([k, l]) => `<button class="chip ${filter === k ? 'on' : ''}" data-filter="${k}">${l}</button>`).join('')}</div>
              <div class="hd-plays"><button class="hd-play hd-staff ${!st.play ? 'on' : ''}" data-play=""><div class="hd-staff-i">🤖</div><div class="hd-pi"><div class="hd-pn">Staff's choice</div><div class="tiny muted">Your assistants call each possession: what fits, what the defense gives, what is working</div></div></button>
                ${listPlays().map(playCard).join('')}</div>
              <div class="hd-inb">${inbSel('blob', 'Next inbound under the basket')}${inbSel('slob', 'Next sideline inbound in the front court')}</div>
            </div>
            <div class="hd-col hd-def"><div class="hd-h">Defense <span class="tiny muted">${OPP.poss ? 'they score ' + ppp(OPP).toFixed(2) + ' per possession' : ''}</span></div>
              <div class="hd-schemes">${Object.keys(dm).map((k) => `<button class="hd-scheme ${st.def === k ? 'on' : ''}" data-def="${k}" title="${U.esc(dm[k].desc || '')}">${dm[k].icon || '🛡️'} ${U.esc(dm[k].label)}</button>`).join('')}</div>
              <div class="small muted" style="margin-top:10px">Pick-and-roll coverage ${covOk ? '' : '<span class="tiny">(set by this scheme)</span>'}</div>
              <div class="hd-covs">${[['', 'Team default']].concat(Object.keys(PB.COVERAGES).map((k) => [k, PB.COVERAGES[k].label])).map(([k, l]) => `<button class="chip ${(st.cov || '') === k ? 'on' : ''} ${covOk ? '' : 'dis'}" data-cov="${k}" title="${k ? U.esc(PB.COVERAGES[k].desc) : 'What your playbook plays'}">${l}</button>`).join('')}</div>
              <div class="small muted" style="margin-top:10px">For</div>
              <div class="seg" data-seg="dn">${DNS.map(([k, l]) => `<button data-v="${k}" class="${st.dn === k ? 'on' : ''}">${l}</button>`).join('')}</div>
              <p class="tiny muted">${st.defDirty ? 'Starts on their next possession' + (st.dn === Infinity ? '.' : ', then back to ' + U.esc(dm[calls.def ? calls.def.prev.def : T.strat.def].label) + '.') : 'Now: ' + U.esc(dm[T.strat.def].label) + (PBC.PlayCall ? ' · ' + U.esc((PB.COVERAGES[PBC.PlayCall.coverage(T)] || { label: 'zone' }).label) + ' on ball screens' : '')}</p>
            </div>
            <div class="hd-col hd-mmc"><div class="hd-h">Matchups <span class="tiny muted">who guards whom, and how</span></div>
              <div class="hd-mm">${mmRows()}</div>
              <p class="tiny muted">Deny: fewer touches and threes for that player, harder work for your defender. Sag off: more help in the paint, open jumpers for that player. Double: fewer shots and touches for that player, someone else is open. Hack: only when you are in the penalty, never in the last two minutes of a quarter.</p>
            </div>
            <div class="hd-col hd-line"><div class="hd-h">Lineup <span class="tiny muted">${st.subPick ? 'now tap the player to replace' : 'tap a bench player, then who comes out'}</span></div>
              ${T.on.map((c) => row(c, 'on')).join('')}
              <div class="small muted" style="margin:8px 0 4px">Bench</div>
              ${T.players.filter((c) => !c.on).map((c) => row(c, 'bench')).join('')}
              ${queued.length ? `<div class="tag warn" style="margin-top:6px">Checking in: ${U.esc(queued.join(', '))} <button class="btn ghost sm" data-undo-subs>undo</button></div>` : ''}
            </div>
          </div>`;
      }
      render();
      UI.on(body, 'click', '[data-play]', (e, el) => { st.play = el.dataset.play || null; render(); });
      UI.on(body, 'click', '[data-filter]', (e, el) => { filter = el.dataset.filter; render(); });
      UI.on(body, 'click', '[data-seg] button', (e, el) => {
        const k = el.closest('[data-seg]').dataset.seg, v = el.dataset.v === 'Infinity' ? Infinity : +el.dataset.v;
        if (k === 'n') st.n = v; else { st.dn = v; st.defDirty = true; }
        render();
      });
      UI.on(body, 'click', '[data-def]', (e, el) => { st.def = el.dataset.def; st.defDirty = true; if (!covAllowed(st.def)) st.cov = null; render(); });
      UI.on(body, 'click', '[data-cov]', (e, el) => { if (el.classList.contains('dis')) { UI.toast('This scheme decides how ball screens are played: pick a man-to-man scheme to choose a coverage', 'info'); return; } st.cov = el.dataset.cov || null; st.defDirty = true; render(); });
      UI.on(body, 'change', '[data-inb]', (e, el) => { st[el.dataset.inb] = el.value || null; });
      UI.on(body, 'change', '[data-mmd]', (e, el) => {
        const oid = el.dataset.mmd, did = +el.value;
        // (a defender guards one man: the one he had takes this man's old defender)
        const prev = Object.keys(st.mm).find((k) => +st.mm[k] === did && k !== oid);
        if (prev != null) st.mm[prev] = st.mm[oid];
        st.mm[oid] = did; st.mmDirty = true; render();
      });
      UI.on(body, 'change', '[data-mmo]', (e, el) => { const oid = el.dataset.mmo; if (el.value) st.ord[oid] = el.value; else delete st.ord[oid]; st.ordDirty = true; render(); });
      UI.on(body, 'click', '[data-undo-subs]', () => { T.manualSubs.length = 0; render(); });
      UI.on(body, 'click', '[data-pc]', (e, el) => {
        const id = +el.dataset.pc, c = T.players.find((x) => x.id === id);
        if (!c || c.out || c.inj) return;
        if (!c.on) { st.subPick = st.subPick === id ? null : id; render(); return; }
        if (st.subPick) { PBC.Sim.queueSub(g, idx, id, st.subPick); st.subPick = null; render(); }
      });
      void m;
    });
  };
})();
