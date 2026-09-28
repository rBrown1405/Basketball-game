/* Pro BBALL Coach: play tracking screens (Phase 5).
 * After a game, the box score's Plays tab: for each team how its possessions were played (called plays, flow,
 * transition) and what they scored, each play it ran (calls, points, points per possession, how the calls ended,
 * where and why they broke down, the shots they got), its defense by scheme, and for the coach's recent games (the
 * ones that keep their full play-by-play) every possession in order. Across the season (Playbook: Play stats, and
 * any team's page): each play's usage, points per possession against the league's for that kind of play, completion
 * rate, shot quality and most common breakdown point, the breakdowns by reason, points per call against each
 * ball-screen coverage, and the defense's points allowed per possession by scheme and coverage; past seasons from
 * each team's history. The numbers come from js/core/playstats.js. */
(function () {
  'use strict';
  const PBC = window.PBC;
  const U = PBC.U, UI = PBC.UI, C = PBC.Config;
  const PS = () => PBC.PlayStats;
  const PB = () => PBC.Playbook;

  const f2 = (x) => (x == null || !isFinite(x) ? '-' : x.toFixed(2));
  const f0 = (x) => (x == null || !isFinite(x) ? '-' : Math.round(x) + '%');
  const FAM = () => (PB() ? PB().FAMILY : {});
  const FLOW = { pnr: 'Pick and roll', iso: 'Isolation', post: 'Post up', spot: 'Spot-up, drive and kick', offscreen: 'Off screens', handoff: 'Hand-offs', cut: 'Cutting' };
  const COV = { drop: 'Drop', show: 'At the level', hedge: 'Hedge', blitz: 'Blitz', switch: 'Switch', ice: 'Ice', zone: 'Zone' };
  const schemeName = (k) => (C.DEFENSES[k] ? C.DEFENSES[k].label : k);
  // (what each way of playing a possession means: the tooltips)
  const KIND_TIP = {
    call: 'A play called by the coach or the staff (an inbound play and the call after it are two calls)',
    flow: 'No call: the offense flowed into an action (pick and roll, isolation, post-up, spot-up, off screens, hand-offs, cuts)',
    trans: 'A fast break or early offense before the defense set up',
    other: 'No action run: a turnover or a foul before the offense set up, or the period ended',
  };
  function playOf(id) { return PB() ? PB().get(id) : null; }
  function playName(id) { const p = playOf(id); return p ? (p.custom ? '✏️ ' : '') + p.name : id.replace(/^my_/, 'My play '); }
  function stepText(id, k) {
    if (k < 0) return 'the entry, before the first step';
    const p = playOf(id), st = p && p.steps[k];
    return st ? st.text : '';
  }
  /** "Step 2 (the screen text): Defense switched, 3 of 5" */
  function breakHtml(id, top, compact) {
    if (!top) return '<span class="dim">none</span>';
    const why = PS().BRK[top.why] || [top.why, ''];
    const step = top.step < 0 ? 'Entry' : 'Step ' + (top.step + 1);
    const st = stepText(id, top.step);
    return `<span title="${U.esc(step + ': ' + st + '. ' + why[1])}"><b>${step}</b>${compact ? '' : ` <span class="dim tiny">${U.esc(st)}</span>`} · ${U.esc(why[0])} <span class="dim">${top.stepN} of ${top.n}</span></span>`;
  }
  /** a play's points per call against the league's for its kind of play: +0.12 */
  function vsLeague(r) {
    if (r.lg == null || r.ppp == null) return '-';
    const d = Math.round((r.ppp - r.lg) * 100) / 100;
    return `<span class="${d > 0.03 ? 'good-t' : d < -0.03 ? 'bad-t' : 'dim'}">${d > 0 ? '+' : ''}${(d === 0 ? 0 : d).toFixed(2)}</span>`;
  }
  /** a bar with a value, for the small breakdowns */
  function bar(label, n, of, extra, col) {
    const w = of ? Math.round((100 * n) / of) : 0;
    return `<div class="ps-bar"><span class="ps-bl">${label}</span><span class="ps-bt"><i style="width:${w}%;${col ? 'background:' + col : ''}"></i></span><span class="ps-bv">${extra != null ? extra : w + '%'}</span></div>`;
  }

  // ------------------------------------------------------------ one game (the box score's Plays tab)
  function gameTeamHtml(S, box, i) {
    const T = box.teams[i], t = S.teams[T.tid], agg = box.plays && box.plays[i];
    if (!agg) return '';
    const sm = PS().summary(agg);
    const rows = PS().rows(agg);
    const kind = (k, label) => { const a = sm[k]; return a[0] ? `<span class="tag" title="${KIND_TIP[k]}">${label} ${a[0]} · ${f2(a[1] / a[0])}</span>` : ''; };
    const outs = (id) => {
      const a = agg.p[id], F = PS().F, sh = a[F.sh];
      const parts = [];
      if (sh) parts.push(`${a[F.made]}/${sh} FG`);
      if (a[F.to]) parts.push(`${a[F.to]} TO`);
      if (a[F.foul]) parts.push(`${a[F.foul]} fouled`);
      if (a[F.reset]) parts.push(`${a[F.reset]} reset`);
      if (a[F.safe]) parts.push(`${a[F.safe]} in safely`);
      return parts.join(' · ');
    };
    const defRows = Object.keys(agg.d).sort((a, b) => agg.d[b][0] - agg.d[a][0]).map((k) => `<tr><td>${U.esc(schemeName(k))}</td><td class="num">${agg.d[k][0]}</td><td class="num">${agg.d[k][1]}</td><td class="num bold">${f2(agg.d[k][1] / agg.d[k][0])}</td></tr>`).join('');
    return `<div class="card flat ps-g"><div class="card-h">${UI.teamBadge(t, 24)}<h3>${U.esc(t.city)} ${U.esc(t.name)}</h3>
        <div class="actions"><span class="small muted">${sm.poss} possessions · <b>${f2(sm.ppp)}</b> points per possession</span></div></div>
      <div class="card-b">
        <div class="row" style="gap:6px;margin-bottom:8px">${kind('call', 'Called plays')}${kind('flow', 'Flow')}${kind('trans', 'Transition')}${kind('other', 'Other')}
          ${sm.calls ? `<span class="tag ${sm.done >= 75 ? 'good' : sm.done >= 65 ? 'info' : 'warn'}">Completed ${f0(sm.done)}</span>` : ''}</div>
        ${rows.length ? `<div class="tbl-wrap"><table class="tbl compact"><thead><tr><th>Play</th><th class="num">Calls</th><th class="num">Pts</th><th class="num">PPP</th><th class="num">Done</th><th>How they ended</th><th>Breakdowns</th><th class="num" title="Expected points of the shots the play got (the shot's make chance times its points)">Shot quality</th></tr></thead><tbody>
          ${rows.map((r) => `<tr><td>${U.esc(playName(r.id))}${r.user ? ` <span class="tag gold" title="Called by the head coach">📋 ${r.user}</span>` : ''}</td><td class="num">${r.n}</td><td class="num">${r.pts}</td><td class="num bold">${f2(r.ppp)}</td><td class="num">${f0(r.done)}</td>
            <td class="small">${U.esc(outs(r.id))}</td><td class="small">${r.brk ? breakHtml(r.id, r.top, true) : '<span class="dim">none</span>'}</td><td class="num">${r.xps != null ? f2(r.xps) : '-'}</td></tr>`).join('')}
          </tbody></table></div>` : '<div class="small muted">No called plays.</div>'}
        ${defRows ? `<div class="small muted up" style="margin:10px 0 4px">Defense (half court)</div><div class="tbl-wrap"><table class="tbl compact"><thead><tr><th>Scheme</th><th class="num">Poss</th><th class="num">Pts allowed</th><th class="num">PPP</th></tr></thead><tbody>${defRows}
          ${agg.dt[0] ? `<tr><td class="dim">In transition</td><td class="num">${agg.dt[0]}</td><td class="num">${agg.dt[1]}</td><td class="num">${f2(agg.dt[1] / agg.dt[0])}</td></tr>` : ''}</tbody></table></div>` : ''}
      </div></div>`;
  }
  /** the pick-and-roll coverage after the scheme, unless the scheme already says it ("Hedge the Pick and Roll") */
  function covNote(e) {
    if (!e.v || e.v === 'zone' || e.k === 'trans') return '';
    const cv = COV[e.v] || e.v;
    return schemeName(e.d).toLowerCase().includes(cv.toLowerCase()) ? '' : ' · ' + U.esc(cv);
  }
  const OUT_ICON = { made: '✅', miss: '❌', ft: '🎯', foul: '🟨', to: '🔄', reset: '↩', safety: '🛟', end: '⏱', other: '·' };
  function logHtml(S, box) {
    const L = box.plog;
    if (!L || !L.length) return '';
    const th = box.teams.map((T) => S.teams[T.tid]);
    let lastQ = null;
    const rows = L.map((e) => {
      const head = e.q !== lastQ ? `<tr class="sep"><td colspan="6" class="small up muted">${U.periodName(e.q, true)}</td></tr>` : '';
      lastQ = e.q;
      const t = th[e.o];
      let how;
      if (e.k === 'call') {
        how = e.p.map((c) => {
          const brk = c.w ? ` <span class="bad-t">broke down${c.s >= 0 ? ' at step ' + (c.s + 1) : ' at the entry'}: ${U.esc((PS().BRK[c.w] || [c.w])[0].toLowerCase())}</span>` : '';
          const far = c.o === 'safety' ? 'the ball in' : c.s >= 0 ? `step ${c.s + 1} of ${c.l + 1}${c.e ? ', early read' : ''}` : 'no step';
          return `${c.u ? '📋 ' : ''}<b>${U.esc(playName(c.i))}</b> <span class="dim">${far}</span> ${OUT_ICON[c.o] || ''}${brk}`;
        }).join(' → ');
      } else if (e.k === 'flow') how = `<span class="muted">Flow: ${U.esc(FLOW[e.f] || e.f)}</span>`;
      else if (e.k === 'trans') how = '<span class="muted">Transition</span>';
      else how = '<span class="dim">Other</span>';
      const sq = e.sq ? `<span class="tag ${e.sq === 'open' ? 'good' : e.sq === 'tight' ? 'bad' : 'info'}">${e.sq}</span>` : e.to ? `<span class="tag warn">${U.esc(String(e.to).replace(/_/g, ' '))}</span>` : '';
      return head + `<tr><td class="small dim">${U.clock(e.c, true)}</td><td><b style="color:${U.shade(t.colors.primary, 0.35)}">${t.abbr}</b></td><td class="small">${how}</td><td>${sq}</td><td class="num bold">${e.pts || ''}</td><td class="small dim">${U.esc(schemeName(e.d))}${covNote(e)}</td></tr>`;
    }).join('');
    return `<div class="card flat" style="margin-top:12px"><div class="card-h"><h3>Every possession</h3><div class="actions"><span class="small muted">how it was played, how far the play got, the shot, the points, the defense</span></div></div>
      <div class="card-b flush"><div class="tbl-wrap ps-log"><table class="tbl compact"><thead><tr><th>Clock</th><th>Team</th><th>Play</th><th>Shot</th><th class="num">Pts</th><th>Defense</th></tr></thead><tbody>${rows}</tbody></table></div></div></div>`;
  }
  /** the Plays tab of a box score (both teams, then every possession of a live game) */
  UI.boxPlaysHtml = function (S, box) {
    if (!box.plays) return '<div class="card flat" style="margin-top:12px"><div class="card-b muted">Play tracking starts with games played from this version on.</div></div>';
    return `<div class="ps-game">${gameTeamHtml(S, box, 1)}${gameTeamHtml(S, box, 0)}${logHtml(S, box)}
      <p class="tiny muted" style="margin-top:8px">PPP: points per possession while the play was on (an inbound play that only got the ball in: the whole possession). Done: the play got to its read in time (a shot, or the ball in on an inbound). A play breaks down on a turnover, a look passed up, or a shot the clock forces; the step is where it happened, the reason what the defense did (a denied pass, a screen defended or an illegal one, a switch, the help) or the shot clock. Shot quality: the expected points of the shots it got.</p></div>`;
  };

  // ------------------------------------------------------------ the season
  function leagueNums(S, po) {
    const st = PS().season(S), bucket = po ? st.po : st.rs;
    let n = 0, p = 0;
    for (const tid in bucket) { n += bucket[tid].poss; p += bucket[tid].pts; }
    return { ppp: n ? p / n : null, lg: PS().league(S, po) };
  }
  /**
   * The season's play numbers of a team into root: o = { tid, season, po, onChange(o) } (the selects call onChange).
   */
  UI.renderPlayStats = function (root, S, o) {
    const tid = o.tid != null ? o.tid : S.userTid, t = S.teams[tid];
    const seasons = PS().seasons(S, tid);
    const season = o.season != null && seasons.includes(o.season) ? o.season : seasons[0];
    const cur = season === S.season, hasPo = PS().hasPo(S, tid, season);
    const po = !!o.po && hasPo;
    const agg = PS().team(S, tid, season, po);
    const L = cur ? leagueNums(S, po) : null;
    const head = `<div class="row ps-top">
        <select class="inp" data-ps="tid">${S.teams.map((x) => `<option value="${x.id}" ${x.id === tid ? 'selected' : ''}>${U.esc(x.city + ' ' + x.name)}${x.id === S.userTid ? ' (you)' : ''}</option>`).join('')}</select>
        <select class="inp" data-ps="season">${seasons.map((s) => `<option value="${s}" ${s === season ? 'selected' : ''}>${U.seasonLabel(s)}${s === S.season ? ' (this season)' : ''}</option>`).join('')}</select>
        ${hasPo ? `<div class="seg" data-ps-seg="po"><button data-v="0" class="${po ? '' : 'on'}">Regular season</button><button data-v="1" class="${po ? 'on' : ''}">Playoffs</button></div>` : ''}
      </div>`;
    if (!agg || !agg.poss) {
      root.innerHTML = head + `<div class="card" style="margin-top:12px"><div class="card-b muted">No games tracked ${po ? 'in the playoffs' : 'this season'} yet for the ${U.esc(t.name)}. The numbers fill in as games are played (quick-simmed games count too).</div></div>`;
      wire(root, o, { tid, season, po });
      return;
    }
    const sm = PS().summary(agg), rows = PS().rows(agg);
    const F = PS().F;
    const lgFam = L ? L.lg.fam : {};
    const lgPpp = (id) => { const p = playOf(id), a = p ? lgFam[p.family] : null; return a && a[0] ? a[1] / a[0] : null; };
    const kinds = [['call', 'Called plays'], ['flow', 'Flow (no call)'], ['trans', 'Transition'], ['other', 'Other']];
    const kindBars = kinds.filter(([k]) => sm[k][0]).map(([k, l]) => bar(`<span title="${KIND_TIP[k]}">${l}</span>`, sm[k][0], sm.poss, `${Math.round((100 * sm[k][0]) / sm.poss)}% · <b>${f2(sm[k][1] / sm[k][0])}</b>`)).join('');
    const whyN = Object.values(sm.why).reduce((a, b) => a + b, 0);
    const whyBars = Object.keys(sm.why).sort((a, b) => sm.why[b] - sm.why[a]).map((k) => bar(U.esc((PS().BRK[k] || [k])[0]), sm.why[k], whyN, `${sm.why[k]} · ${Math.round((100 * sm.why[k]) / whyN)}%`, '#ff8a5c')).join('');
    const vc = agg.vc || {};
    const vcBars = Object.keys(vc).sort((a, b) => vc[b][0] - vc[a][0]).map((k) => bar(U.esc(COV[k] || k), vc[k][0], sm.calls, `${vc[k][0]} · <b>${f2(vc[k][1] / vc[k][0])}</b>`, '#4dabf7')).join('');
    const flowRows = Object.keys(agg.fl || {}).sort((a, b) => agg.fl[b][0] - agg.fl[a][0]).map((k) => `<span class="tag">${U.esc(FLOW[k] || k)} ${agg.fl[k][0]} · ${f2(agg.fl[k][1] / agg.fl[k][0])}</span>`).join(' ');
    const lgDef = L ? L.lg.def : {};
    const defRows = Object.keys(agg.d).sort((a, b) => agg.d[b][0] - agg.d[a][0]).map((k) => {
      const a = agg.d[k], l = lgDef[k], lp = l && l[0] ? l[1] / l[0] : null, ppp = a[1] / a[0];
      return `<tr><td>${U.esc(schemeName(k))}</td><td class="num">${a[0]}</td><td class="num">${f0((100 * a[0]) / Math.max(1, sm.dHalf[0]))}</td><td class="num bold ${lp != null ? (ppp < lp - 0.02 ? 'good-t' : ppp > lp + 0.02 ? 'bad-t' : '') : ''}">${f2(ppp)}</td><td class="num dim">${lp != null ? f2(lp) : '-'}</td></tr>`;
    }).join('');
    const covRows = Object.keys(agg.c || {}).sort((a, b) => agg.c[b][0] - agg.c[a][0]).map((k) => `<tr><td>${U.esc(COV[k] || k)}</td><td class="num">${agg.c[k][0]}</td><td class="num bold">${f2(agg.c[k][1] / agg.c[k][0])}</td></tr>`).join('');
    root.innerHTML = head + `
      <div class="ps-cards">
        <div class="card"><div class="card-h"><h3>Offense</h3></div><div class="card-b">
          <div class="ps-big">${f2(sm.ppp)}<span class="small muted"> points per possession${L && L.ppp ? ` (league ${f2(L.ppp)})` : ''}</span></div>
          <div class="small muted" style="margin-bottom:6px">${agg.gp} games · ${Math.round(agg.poss / Math.max(1, agg.gp))} possessions a game</div>
          ${kindBars}
          ${flowRows ? `<div class="small muted" style="margin:6px 0 3px">In flow</div><div class="row" style="gap:4px">${flowRows}</div>` : ''}
        </div></div>
        <div class="card"><div class="card-h"><h3>Called plays</h3></div><div class="card-b">
          <div class="row" style="gap:6px;margin-bottom:8px"><span class="tag ${sm.done >= 75 ? 'good' : sm.done >= 65 ? 'info' : 'warn'}">Completed ${f0(sm.done)}</span><span class="tag">${sm.calls} calls</span>${sm.xps != null ? `<span class="tag info" title="Expected points of the shots the plays got">Shot quality ${f2(sm.xps)}</span>` : ''}</div>
          <div class="small muted" style="margin-bottom:3px">Why plays broke down (${whyN})</div>${whyBars || '<div class="small dim">None yet.</div>'}
        </div></div>
        <div class="card"><div class="card-h"><h3>Against ball-screen coverages</h3></div><div class="card-b">
          <div class="small muted" style="margin-bottom:3px">Called plays by the coverage the defense played on them, and points per call</div>${vcBars || '<div class="small dim">No ball screens faced yet.</div>'}
        </div></div>
      </div>
      <div class="card" style="margin-top:12px"><div class="card-h"><h3>Plays</h3><div class="actions"><span class="small muted">vs league: the league's points per call for that kind of play this season</span></div></div><div class="card-b flush" data-ps-plays></div></div>
      <div class="card" style="margin-top:12px"><div class="card-h"><h3>Defense: points allowed per possession</h3><div class="actions"><span class="small muted">half-court possessions${agg.dt[0] ? ` · in transition ${agg.dt[0]} possessions, ${f2(agg.dt[1] / agg.dt[0])} allowed` : ''}</span></div></div>
        <div class="card-b"><div class="ps-def"><div><table class="tbl compact"><thead><tr><th>Scheme</th><th class="num">Poss</th><th class="num">Share</th><th class="num">PPP allowed</th><th class="num">League</th></tr></thead><tbody>${defRows || '<tr><td colspan="5" class="dim">None yet.</td></tr>'}</tbody></table></div>
          ${covRows ? `<div><table class="tbl compact"><thead><tr><th>Ball-screen coverage (man)</th><th class="num">Poss</th><th class="num">PPP allowed</th></tr></thead><tbody>${covRows}</tbody></table></div>` : ''}</div></div></div>
      <p class="tiny muted">PPP: points per possession while the play was on (an inbound play that only got the ball in is credited with the whole possession). Completed: the play got to its read in time (a shot, or the ball in on an inbound); early: a read before the last step. A play breaks down on a turnover, a look passed up, or a shot the clock forces: the most common breakdown is the step where it happened most and the reason there (a denied pass, a screen defended or an illegal one, a switch, the help, the shot clock, a turnover). Counter: the offense went to another read than the play's main option. Shot quality: the expected points of the shots the play got. Clutch: the last 5 minutes of the fourth quarter or overtime, within 5 points.</p>`;
    UI.table(root.querySelector('[data-ps-plays]'), {
      compact: true, sort: 'n',
      rows: rows.map((r) => Object.assign({}, r, { lg: lgPpp(r.id), fam: playOf(r.id) ? playOf(r.id).family : '' })),
      columns: [
        { key: 'name', label: 'Play', value: (r) => playName(r.id), fmt: (r) => `${U.esc(playName(r.id))} <span class="dim tiny">${U.esc(FAM()[r.fam] || r.fam)}</span>` },
        { key: 'n', label: 'Calls', num: true, fmt: (r) => `${r.n} <span class="dim tiny">${(r.n / Math.max(1, agg.gp)).toFixed(1)}/g</span>`, title: 'Times called, and per game' },
        { key: 'use', label: 'Usage', num: true, value: (r) => r.n / Math.max(1, sm.calls), fmt: (r) => f0((100 * r.n) / Math.max(1, sm.calls)), title: 'Share of the team\'s calls' },
        { key: 'ppp', label: 'PPP', num: true, fmt: (r) => `<b>${f2(r.ppp)}</b>`, title: 'Points per possession while the play was on (an inbound play that only got the ball in: the whole possession)' },
        { key: 'lg', label: 'vs league', num: true, value: (r) => (r.lg != null && r.ppp != null ? r.ppp - r.lg : -9), fmt: (r) => vsLeague(r), title: 'Points per call against the league\'s for that kind of play' },
        { key: 'done', label: 'Completed', num: true, fmt: (r) => f0(r.done) },
        { key: 'early', label: 'Early', num: true, fmt: (r) => f0(r.early), title: 'A read before the last step (the play working)' },
        { key: 'ctr', label: 'Counter', num: true, fmt: (r) => f0(r.ctr), title: 'Went to another read than the play\'s main option' },
        { key: 'to', label: 'TO', num: true, fmt: (r) => f0(r.to) },
        { key: 'xps', label: 'Shot quality', num: true, fmt: (r) => (r.xps != null ? f2(r.xps) : '-'), title: 'Expected points of the shots the play got' },
        { key: 'brk', label: 'Most common breakdown', cls: 'ps-wrap', value: (r) => r.brk, fmt: (r) => (r.brk ? breakHtml(r.id, r.top) : '<span class="dim">none</span>') },
        { key: 'user', label: '📋', num: true, fmt: (r) => (r.user ? r.user : ''), title: 'Called by the head coach' },
        { key: 'cl', label: 'Clutch', num: true, fmt: (r) => (r.cl ? r.cl : ''), title: 'Calls in the last 5 minutes of the fourth quarter or overtime, within 5 points' },
      ],
    });
    wire(root, o, { tid, season, po });
  };
  function wire(root, o, now) {
    const go = (patch) => { if (o.onChange) o.onChange(Object.assign({}, now, patch)); };
    root.querySelectorAll('[data-ps]').forEach((el) => { el.onchange = () => go({ [el.dataset.ps]: +el.value, po: el.dataset.ps === 'tid' ? now.po : false }); });
    root.querySelectorAll('[data-ps-seg] button').forEach((el) => { el.onclick = () => go({ po: el.dataset.v === '1' }); });
  }

  /** the compact season card for a team page: the most-called plays and the defense */
  UI.teamPlaysCardHtml = function (S, tid) {
    const agg = PS() ? PS().team(S, tid, S.season, false) : null;
    if (!agg || !agg.poss) return '';
    const sm = PS().summary(agg), rows = PS().rows(agg).slice(0, 6);
    const defTop = Object.keys(agg.d).sort((a, b) => agg.d[b][0] - agg.d[a][0]).slice(0, 3);
    return `<div class="card"><div class="card-h"><h3>Plays this season</h3><div class="actions"><button class="btn ghost sm" data-go-playstats="${tid}">Full play stats ›</button></div></div><div class="card-b flush">
      <table class="tbl compact"><thead><tr><th>Play</th><th class="num">Calls</th><th class="num">PPP</th><th class="num">Done</th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td>${U.esc(playName(r.id))}</td><td class="num">${r.n}</td><td class="num bold">${f2(r.ppp)}</td><td class="num">${f0(r.done)}</td></tr>`).join('')}
      <tr class="sep"><td class="muted">All possessions</td><td class="num">${sm.poss}</td><td class="num bold">${f2(sm.ppp)}</td><td class="num">${f0(sm.done)}</td></tr>
      ${defTop.map((k) => `<tr><td class="muted">Defense: ${U.esc(schemeName(k))}</td><td class="num">${agg.d[k][0]}</td><td class="num">${f2(agg.d[k][1] / agg.d[k][0])}</td><td class="num dim">allowed</td></tr>`).join('')}
      </tbody></table></div></div>`;
  };

  // the season screen for any team (the Playbook page has the user's)
  let psState = null;
  UI.register('playstats', {
    title: 'Play stats', navKey: 'playbook',
    render(root, params) {
      const S = UI.S;
      if (!psState || params.tid != null) psState = { tid: params.tid != null ? params.tid : S.userTid, season: params.season != null ? params.season : S.season, po: false };
      if (params.tid != null) delete params.tid;
      const t = S.teams[psState.tid];
      root.innerHTML = `<div class="page"><div class="page-h"><div><h1>Play stats</h1><div class="sub">${U.esc(t.city + ' ' + t.name)}: each play's usage, points per possession, completion and breakdowns; the defense's points allowed by scheme</div></div>
        <div class="actions"><button class="btn" data-go="playbook">‹ Playbook</button></div></div><div data-ps-root></div></div>`;
      UI.on(root, 'click', '[data-go]', (e, el) => UI.go(el.dataset.go));
      const host = root.querySelector('[data-ps-root]');
      const draw = () => UI.renderPlayStats(host, S, Object.assign({}, psState, { onChange: (o) => { psState = o; UI.refresh(); } }));
      draw();
    },
  });

  // the box score's tabs (js/ui/cards.js: Box score, Plays)
  function bxTab(b) {
    const host = b.closest('.bx');
    if (!host) return;
    UI._bxTab = b.dataset.bxTab; // (a live game's box score is drawn again: it stays on the tab picked)
    host.querySelectorAll('[data-bx-tab]').forEach((x) => x.classList.toggle('active', x === b));
    host.querySelectorAll('[data-bx-panel]').forEach((p) => { p.hidden = p.dataset.bxPanel !== b.dataset.bxTab; });
  }
  // (on the press: a live game's box score can be drawn again between the press and the release)
  document.addEventListener('pointerdown', (ev) => {
    const b = ev.button === 0 && ev.target.closest && ev.target.closest('[data-bx-tab]');
    if (b) bxTab(b);
  });
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-bx-tab]');
    if (b) { bxTab(b); return; }
    const g = ev.target.closest('[data-go-playstats]');
    if (g) UI.go('playstats', { tid: +g.dataset.goPlaystats });
  });
})();
