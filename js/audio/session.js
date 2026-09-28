/* Pro BBALL Coach — one live game's audio session (PBC.Audio).
 * Ties the pieces together for the live screen: the event bus, the mixer, the asset loader, the game watcher that
 * derives broadcast moments (runs, lead changes, ties, scoring milestones, possession changes) from the raw events,
 * and the debug overlay. PBC.Audio.current is the running session (handy from the console and for the trace test).
 *
 *   const A = PBC.Audio.create({ now, speed, stage });
 *   A.bus.emit('score', {...}); A.timed(() => arena.update(dt)); A.frame(dt);
 */
(function () {
  'use strict';
  const PBC = window.PBC = window.PBC || {};

  function create(opts) {
    opts = opts || {};
    const bus = PBC.AudioBus.create({ now: opts.now });
    const mixer = PBC.AudioMixer.create({ bus, speed: opts.speed });
    const A = { bus, mixer, assets: PBC.AudioAssets, ms: 0, destroyed: false };

    /** run per-frame audio work and count its cost for the frame monitor */
    A.timed = (fn) => {
      const t0 = performance.now();
      try { return fn(); } finally { A.ms += performance.now() - t0; }
    };
    A.frame = (dt) => A.timed(() => mixer.update(dt));
    A.unlock = () => {
      const t0 = performance.now(), had = !!mixer.ctx;
      const c = mixer.ensure();
      if (c && !had) A.unlockMs = performance.now() - t0;
      if (c) {
        mixer.resume();
        if (!A.assetsStarted) {
          A.assetsStarted = true;
          PBC.AudioAssets.load().then(() => PBC.AudioAssets.decodeAll(mixer.ctx)).then(n => { if (n) bus.emit('assets_ready', { detail: `${n} sounds` }); });
        }
      }
      return c;
    };

    // ---------------------------------------------------------- game watcher: derived broadcast moments
    const W = { lead: 0, off: -1, run: { team: -1, pts: 0 }, runSaid: 0, pts: {}, milestones: {} };
    const RUN_MIN = 8;
    bus.on('score', (e) => {
      const sc = e.score || [0, 0];
      const lead = sc[0] - sc[1];
      if (W.lead !== 0 && lead !== 0 && Math.sign(lead) !== Math.sign(W.lead)) bus.emit('lead_change', { team: lead > 0 ? 0 : 1, score: sc.slice(), detail: `${sc[0]}-${sc[1]}` });
      else if (lead === 0 && W.lead !== 0) bus.emit('tie', { score: sc.slice(), detail: `${sc[0]}-${sc[1]}` });
      W.lead = lead;
      if (W.run.team === e.team) W.run.pts += e.pts || 0; else W.run = { team: e.team, pts: e.pts || 0 };
      if (W.run.pts >= RUN_MIN && W.run.pts - (e.pts || 0) < RUN_MIN) bus.emit('run', { team: e.team, pts: W.run.pts, detail: `${W.run.pts}-0` });
      else if (W.run.pts >= 12 && Math.floor(W.run.pts / 4) > Math.floor((W.run.pts - (e.pts || 0)) / 4)) bus.emit('run', { team: e.team, pts: W.run.pts, detail: `${W.run.pts}-0` });
      if (e.player != null) {
        const before = W.pts[e.player] || 0, now = before + (e.pts || 0);
        W.pts[e.player] = now;
        for (const m of [20, 30, 40, 50]) if (before < m && now >= m && !W.milestones[e.player + ':' + m]) { W.milestones[e.player + ':' + m] = 1; bus.emit('milestone', { team: e.team, player: e.player, pts: now, detail: `${m} points` }); }
      }
    });
    bus.on('ft', (e) => {
      if (!e.made || e.player == null) return;
      const before = W.pts[e.player] || 0, now = before + 1;
      W.pts[e.player] = now;
      if (W.run.team === e.team) W.run.pts += 1; else W.run = { team: e.team, pts: 1 };
      for (const m of [20, 30, 40, 50]) if (before < m && now >= m && !W.milestones[e.player + ':' + m]) { W.milestones[e.player + ':' + m] = 1; bus.emit('milestone', { team: e.team, player: e.player, pts: now, detail: `${m} points` }); }
    });
    A.possession = (off, P) => {
      if (off !== W.off && off >= 0) bus.emit('possession_change', { team: off, detail: P && P.play ? P.play : '' });
      W.off = off;
    };

    A.debug = PBC.AudioDebug ? PBC.AudioDebug.create(A, opts.stage) : null;
    A.destroy = () => {
      A.destroyed = true;
      if (A.debug) A.debug.destroy();
      mixer.destroy();
      if (PBC.Audio.current === A) PBC.Audio.current = null;
    };
    PBC.Audio.current = A;
    return A;
  }

  PBC.Audio = { create, current: null };
})();
