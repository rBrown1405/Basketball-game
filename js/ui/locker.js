/* Pro BBALL Coach: the halftime locker room (js/core/locker.js). The live game opens it at halftime: your assistant's
 * report on the first half and a few changes to take with one tap on the left and right, then your talk to the team and
 * how each player takes it. Nothing is applied until you send them back out (the talk lands when you give it). */
(function () {
  'use strict';
  const PBC = window.PBC;
  const U = PBC.U, C = PBC.Config, UI = PBC.UI;
  const R_ICON = { 1: '🔥', 0: '😐', '-1': '😒' };

  /** o: { g, idx (your team), S, teams }. Resolves with { talk, verdict, applied: [what you changed] } */
  UI.lockerRoom = function (o) {
    const g = o.g, idx = o.idx, L = PBC.Locker;
    const rep = L.report(g, idx);
    const sugs = L.suggestions(g, idx);
    const st = { on: {}, res: null };
    const T = o.teams[idx], OT = o.teams[1 - idx];
    const A = PBC.Adjust ? PBC.Adjust.AVG[g.L.key === 'women' ? 'women' : 'men'] : { hc: 1.1 };
    const pct = (m, a) => (a ? Math.round(m / a * 100) + '%' : '-');

    function summary() {
      const lead = rep.lead;
      const head = lead > 0 ? `Up ${lead} at the half.` : lead < 0 ? `Down ${-lead} at the half.` : 'All tied at the half.';
      const prob = rep.hurting[0];
      if (prob) return `${head} The problem: ${prob.txt}.`;
      if (rep.def.ppp != null && rep.def.ppp < A.hc - 0.05) return `${head} Your ${rep.def.label} is holding them to ${rep.def.ppp.toFixed(2)} points a trip.`;
      if (rep.working[0]) return `${head} What is working: ${rep.working[0].txt}.`;
      return `${head} Nothing is breaking either way. It comes down to who makes shots.`;
    }
    function statRows() {
      const u = rep.us, t = rep.them;
      const rows = [
        ['Field goals', `${u.fgm}-${u.fga} <span class="dim">${pct(u.fgm, u.fga)}</span>`, `${t.fgm}-${t.fga} <span class="dim">${pct(t.fgm, t.fga)}</span>`],
        ['Threes', `${u.tpm}-${u.tpa} <span class="dim">${pct(u.tpm, u.tpa)}</span>`, `${t.tpm}-${t.tpa} <span class="dim">${pct(t.tpm, t.tpa)}</span>`],
        ['Free throws', `${u.ftm}-${u.fta}`, `${t.ftm}-${t.fta}`],
        ['Turnovers', u.tov, t.tov],
        ['Points a trip', u.ppp.toFixed(2), t.ppp.toFixed(2)],
      ];
      return `<table class="lk-tbl"><thead><tr><th></th><th>${U.esc(T.abbr)}</th><th>${U.esc(OT.abbr)}</th></tr></thead><tbody>${rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('')}</tbody></table>`;
    }
    const cap = (t) => String(t).charAt(0).toUpperCase() + String(t).slice(1);
    const li = (icon, txt) => `<div class="lk-li"><span>${icon}</span><span>${U.esc(cap(txt))}</span></div>`;
    function reportHtml() {
      const work = rep.working.map(w => li('✅', w.txt)).concat(rep.hot.map(h => li('🔥', h.txt)));
      const hurt = rep.hurting.map(h => li('⚠️', h.txt)).concat(rep.cold.map(c => li('🧊', c.txt + ', gone cold')));
      if (rep.star && !rep.hurting.some(h => h.k === 'star')) hurt.push(li('🎯', 'Their best tonight: ' + rep.star.txt));
      const fouls = rep.fouls.length || rep.theirFouls.length
        ? `<div class="lk-sec"><div class="lk-h">Foul trouble</div>${rep.fouls.length ? `<div class="small">Yours: ${U.esc(rep.fouls.map(f => f.txt).join(', '))}</div>` : ''}${rep.theirFouls.length ? `<div class="small">Theirs: ${U.esc(rep.theirFouls.map(f => f.txt).join(', '))}</div>` : ''}</div>` : '';
      const moves = rep.moves.length ? `<div class="lk-sec"><div class="lk-h">Their bench</div>${rep.moves.slice(-4).map(m => li('🧠', m)).join('')}</div>` : '';
      return `${statRows()}
        <div class="lk-sec"><div class="lk-h">Working</div>${work.join('') || '<div class="small muted">Nothing standing out.</div>'}</div>
        <div class="lk-sec"><div class="lk-h">Hurting you</div>${hurt.join('') || '<div class="small muted">Nothing they are doing is beating you.</div>'}</div>
        ${fouls}${moves}`;
    }
    function sugHtml() {
      if (!sugs.length) return '<div class="small muted">No changes. Keep doing what you are doing.</div>';
      return sugs.map(s => `<label class="lk-sug ${st.on[s.id] ? 'on' : ''}"><input type="checkbox" data-sug="${s.id}" ${st.on[s.id] ? 'checked' : ''}>
        <span class="lk-si">${s.icon}</span><span class="lk-st"><b>${U.esc(s.text)}</b><span class="tiny muted">${U.esc(cap(s.why))}</span></span></label>`).join('');
    }
    function talkHtml() {
      if (st.res) {
        const r = st.res, tk = L.TALKS[r.key];
        return `<div class="lk-verdict ${r.fx >= 0.015 ? 'good' : r.fx > -0.005 ? '' : 'bad'}">${tk.icon} <b>${U.esc(tk.label)}.</b> ${U.esc(r.verdict)}</div>
          <div class="lk-reacts">${r.reactions.map(x => `<div class="lk-r r${x.r}">${UI.avatar(x.c.p, 28)}<div class="lk-rt"><b>${U.esc(x.c.last)}</b><span class="tiny">${R_ICON[x.r]} ${U.esc(x.line)}</span></div></div>`).join('')}</div>`;
      }
      return `<div class="tiny muted" style="margin-bottom:6px">You are ${U.esc(L.SIT_TXT[rep.sit])}. How each player takes it depends on who they are.</div>
        <div class="lk-talks">${Object.keys(L.TALKS).map(k => { const t = L.TALKS[k]; return `<button class="lk-talk" data-talk="${k}"><span class="lk-ti">${t.icon}</span><b>${U.esc(t.label)}</b><span class="tiny muted">${U.esc(t.desc)}</span></button>`; }).join('')}</div>`;
    }

    return new Promise(resolve => {
      const body = UI.h('<div class="lk"></div>');
      const render = () => {
        body.innerHTML = `<div class="lk-score"><div class="lk-tm">${UI.teamBadge(T, 30)}<b>${U.esc(T.abbr)}</b><span class="lk-pts">${g.score[idx]}</span></div>
            <div class="lk-mid">HALFTIME</div><div class="lk-tm"><span class="lk-pts">${g.score[1 - idx]}</span><b>${U.esc(OT.abbr)}</b>${UI.teamBadge(OT, 30)}</div></div>
          <div class="lk-sum">📋 ${U.esc(summary())}</div>
          <div class="lk-grid"><div class="lk-col"><h4>The first half</h4>${reportHtml()}</div>
            <div class="lk-col"><h4>Your assistant suggests</h4><div class="lk-sugs">${sugHtml()}</div>
              <h4 style="margin-top:14px">Your halftime talk</h4>${talkHtml()}</div></div>`;
        body.querySelectorAll('[data-sug]').forEach(cb => { cb.onchange = () => { st.on[cb.dataset.sug] = cb.checked; render(); }; });
        body.querySelectorAll('[data-talk]').forEach(b => { b.onclick = () => { if (st.res) return; st.res = L.talk(g, idx, b.dataset.talk); render(); }; });
      };
      render();
      UI.modal({
        title: '🏟️ The locker room', body, xwide: true,
        actions: [{ label: 'Back to the floor ▶', cls: 'primary', onClick: close => close() }],
        onClose: () => {
          const applied = [];
          for (const s of sugs) if (st.on[s.id] && L.apply(g, idx, s)) applied.push(s.text);
          // (no talk from you: your staff gives one)
          let res = st.res;
          if (!res) res = L.autoTalk(g, idx);
          resolve({ talk: res ? res.key : null, verdict: st.res ? st.res.verdict : null, mine: !!st.res, applied });
        },
      });
    });
  };
})();
