/* Pro BBALL Coach: the game events the audio hears, and the moments it works out from them (PBC.AudioTracker).
 * The live view hands every court event to game(); it goes out on the bus as game.<type> with the event (e), the
 * possession (P), the score on screen (sc), the team, the main player (pid) and the spot (x, y).
 * It owns the shot split: game.shot goes out at the release with no result in it (made, blocked, the and-one, the
 * assist and the play-by-play text are left out), and game.shotResult when the court says the ball got there (the
 * rim, the glass, the net, the blocker's hand, or the floor on an air ball). A shot the court never reports (text
 * mode, a skipped presentation) gets its result from the next game event or after moments.shotResultFallback
 * seconds of game time.
 * From the scoring it works out runs (unanswered points), lead changes, ties, player milestones and clutch time,
 * published after the event that caused them as game.run, game.leadChange, game.tie, game.milestone, game.clutch. */
(function () {
  'use strict';
  const PBC = window.PBC;

  // what a shot event may carry at the release (the rest is its result)
  const SHOT_KEEP = ['t', 'team', 'shooter', 'pts', 'zone', 'kind', 'x', 'y', 'dist', 'contest', 'defender', 'pending', 'gim'];
  // events that mean a shot still in the air is over
  const AFTER_SHOT = { rebound: 1, score: 1, turnover: 1, foul: 1, ft: 1, jump_ball: 1, period_end: 1, timeout: 1, inbound: 1 };
  const mainPlayer = (e) => (e.shooter != null ? e.shooter : e.player != null ? e.player : e.fouler != null ? e.fouler : e.stealer != null ? e.stealer : e.in != null ? e.in : null);

  function create(host) {
    const Bus = PBC.AudioBus, C = PBC.AudioConfig.moments;
    const L = host.g.L;
    const T = {
      pending: null,          // { raw, age } the shot in the air
      run: { team: -1, pts: 0 },
      leader: 0,              // sign of the last lead (home minus away), 0 before anybody led
      pts: {},                // a player's points as the viewer has seen them
      clutch: {},             // periods whose clutch time was announced
    };
    const offs = [];

    function resultOf(raw) {
      if (raw.blocked) return 'blocked';
      if (raw.made) return raw.kind === 'dunk' || raw.kind === 'alley' ? 'dunk' : 'made';
      return raw.kind === 'dunk' || raw.kind === 'alley' ? 'missed dunk' : 'miss';
    }
    function sendResult(raw, d) {
      const p = T.pending;
      if (!p || p.raw !== raw) return null;
      T.pending = null;
      d = d || {};
      const ev = Bus.emit('game.shotResult', {
        e: raw, P: p.P, made: !!raw.made, blocked: !!raw.blocked, result: d.result || resultOf(raw), contact: d.contact || null,
        team: raw.team, pid: raw.shooter, x: d.x != null ? d.x : raw.x, y: d.y != null ? d.y : raw.y, z: d.z != null ? d.z : null,
        via: d.via || 'court', sc: d.sc || null,
      });
      // (text mode has no score event: the make counts here)
      if (d.text && raw.made) scored(raw.team, raw.pts, raw.shooter, d.sc);
      return ev;
    }
    function scored(team, pts, pid, sc) {
      if (!(team === 0 || team === 1) || !pts) return;
      // runs
      const before = T.run.team === team ? T.run.pts : 0;
      if (T.run.team === team) T.run.pts += pts; else T.run = { team, pts };
      let crossed = 0;
      for (const th of C.runs) if (T.run.pts >= th && before < th) crossed = th;
      if (crossed) Bus.emit('game.run', { team, pts: T.run.pts, mark: crossed, sc });
      // milestones
      if (pid != null) {
        const p0 = T.pts[pid] || 0, p1 = p0 + pts;
        T.pts[pid] = p1;
        let mark = 0;
        for (const m of C.milestones) if (p1 >= m && p0 < m) mark = m;
        if (mark) Bus.emit('game.milestone', { pid, team, pts: p1, mark, sc });
      }
      // leads and ties (from the score on screen)
      if (sc) {
        const d = sc[0] - sc[1], s = Math.sign(d);
        if (s === 0) Bus.emit('game.tie', { score: sc.slice(), team, sc });
        else {
          if (T.leader !== 0 && s !== T.leader) Bus.emit('game.leadChange', { team: s > 0 ? 0 : 1, score: sc.slice(), lead: Math.abs(d), sc });
          T.leader = s;
        }
      }
    }
    function checkClutch(per, gc, sc) {
      if (per == null || gc == null || per < L.periods || T.clutch[per] || !sc) return;
      if (gc <= C.clutchSecs && Math.abs(sc[0] - sc[1]) <= C.clutchMargin) {
        T.clutch[per] = 1;
        Bus.emit('game.clutch', { period: per, clock: gc, score: sc.slice(), sc });
      }
    }
    function shot(raw, P, sc) {
      const e = {};
      for (const k of SHOT_KEEP) if (raw[k] !== undefined) e[k] = raw[k];
      e.type = 'shot';
      // (a shot released while another waits: the first one is over)
      if (T.pending && T.pending.raw !== raw && T.pending.raw.made !== undefined) sendResult(T.pending.raw, { via: 'next shot' });
      T.pending = { raw, age: 0, P };
      return Bus.emit('game.shot', { e, P, sc, team: raw.team, pid: raw.shooter, x: raw.x, y: raw.y });
    }

    offs.push(Bus.on('live.possession', (ev) => {
      // the players' points as of this possession (the box the panels show: nothing from the trip about to be shown)
      const bx = host.boxSnap && host.boxSnap();
      if (bx && bx.teams) { T.pts = {}; for (const t of bx.teams) for (const p of t.players || []) T.pts[p.pid] = p.pts || 0; }
      checkClutch(ev.per, ev.gc, ev.sc);
    }));
    offs.push(Bus.on('live.jump', (ev) => {
      // jumped ahead: the run is unknown, the lead is whatever the score says now
      T.pending = null; T.run = { team: -1, pts: 0 }; T.clutch = {};
      const sc = ev.sc || [0, 0];
      T.leader = Math.sign(sc[0] - sc[1]);
    }));

    return {
      /** an event from the court (or the text feed) as it is shown; sc: the score on screen after it */
      game(raw, P, sc) {
        if (!raw || !raw.type) return null;
        const t = raw.type;
        if (t === 'shot') return shot(raw, P, sc);
        // a shot still waiting for its result gets it now (the court never reported the ball's arrival)
        if (T.pending && AFTER_SHOT[t] && T.pending.raw.made !== undefined) sendResult(T.pending.raw, { via: 'next event' });
        const ev = Bus.emit('game.' + t, { e: raw, P, sc, team: raw.team, pid: mainPlayer(raw), x: raw.x, y: raw.y });
        if (t === 'score') scored(raw.team, raw.pts, raw.shotEvent ? raw.shotEvent.shooter : null, sc);
        else if (t === 'ft' && raw.made) scored(raw.team, 1, raw.shooter, sc);
        checkClutch(ev.per, ev.gc, sc);
        return ev;
      },
      /** the court says the ball got there: d = { contact: 'rim'|'board'|'net'|'hand'|'floor', result, x, y, z } */
      shotResult(raw, d) { return sendResult(raw, d); },
      pendingShot() { return T.pending ? T.pending.raw : null; },
      /** dtGame: seconds of game presentation (real time x speed, 0 while stopped) */
      update(dtGame) {
        const p = T.pending;
        if (!p || p.raw.made === undefined) return;
        p.age += dtGame;
        if (p.age >= C.shotResultFallback) sendResult(p.raw, { via: 'timeout' });
      },
      state() { return { run: Object.assign({}, T.run), leader: T.leader, pending: !!T.pending }; },
      destroy() { offs.forEach((f) => f()); offs.length = 0; T.pending = null; },
    };
  }

  PBC.AudioTracker = { create, SHOT_KEEP };
})();
