/* Pro BBALL Coach: the audio event bus (PBC.AudioBus).
 * Everything the audio reacts to arrives here as a named event, stamped with when it happened: real time (rt, ms of
 * performance.now()), audio time (at, seconds on the mixer's clock), the period and the game clock (per, gc), and
 * where known a court position (x, y, z in feet), a player (pid) and a team (0 home, 1 away).
 *   game.*   what the game does: every event the court shows (game.shot at the release, with no result in it;
 *            game.shotResult when the ball reaches the rim, the net or the blocker's hand; game.score; ...) and the
 *            moments worked out from them (js/audio/tracker.js: game.run, game.leadChange, game.tie,
 *            game.milestone, game.clutch)
 *   court.*  the court's sounds (js/audio/court.js): dribble, bounce, squeak, step, land, catch, pass, body, fall,
 *            roll, rimroll, rim, board, swish, net, dunk, block, whistle, buzzer, horn; each with what made it, where it
 *            is, the game time of its contact (gt) and how far ahead it was scheduled to be heard as it shows (dly)
 *   anim.*   the bodies: foot plants, jump landings, catches, pass releases (the court's audio hears all of them and
 *            decides the squeaks, footsteps and slaps; logged here when the console or a trace asks)
 *   live.*   the broadcast around the game: intro, possession start, quarter break, replay, crunch time, final
 *   timer.*  sounds still run by a timer instead of the game (the chant until Trial 4)
 *   booth.*  the booth: booth.say when a line starts (the event that queued it lists it among its sounds)
 * Subscribe with on('game.score', fn), on('game.*', fn) or on('*', fn). The sounds an event plays are written into
 * it (ev.sounds, by the mixer: each with its bus and priority, or why it did not play), so the debug console and the
 * traces show every event next to what it triggered. */
(function () {
  'use strict';
  const PBC = window.PBC = window.PBC || {};
  const subs = Object.create(null);    // 'game.score', 'game.*' or '*' → [fn]
  let clockFn = null, audioFn = null;
  let seq = 0;
  let ring = [], ringAt = 0, ringSize = 400;
  let trace = null, traceAnim = true;

  const familyOf = (type) => { const i = type.indexOf('.'); return i < 0 ? type : type.slice(0, i); };
  function deliver(list, ev) {
    if (!list) return;
    for (let i = 0; i < list.length; i++) {
      try { list[i](ev); } catch (e) { console.error('audio bus ' + ev.type, e); }
    }
  }
  function record(ev, anim) {
    if (trace && (traceAnim || !anim)) trace.push(ev);
    if (anim && !Bus.logAnim) return;
    if (ring.length < ringSize) ring.push(ev);
    else { ring[ringAt] = ev; ringAt = (ringAt + 1) % ringSize; }
  }

  const Bus = {
    /** the event being handed out right now (the mixer credits the sounds it plays to it) */
    current: null,
    /** keep anim.* events in the log (the console turns this on when it shows them; traces always keep them) */
    logAnim: false,
    on(type, fn) { (subs[type] = subs[type] || []).push(fn); return () => Bus.off(type, fn); },
    off(type, fn) { const a = subs[type]; if (!a) return; const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); },
    /** anybody listening to this type (or keeping it)? publishers of busy events (anim.*) check before building
     *  them; everything else is always kept in the log */
    wants(type) {
      const fam = familyOf(type);
      if (fam !== 'anim' || Bus.logAnim || (trace && traceAnim)) return true;
      return !!((subs[type] && subs[type].length) || (subs['anim.*'] && subs['anim.*'].length) || (subs['*'] && subs['*'].length));
    },
    /** publish: data becomes the event (pass a fresh object); fn(ev), if given, runs first, inside the event */
    emit(type, data, fn) {
      const ev = data || {};
      ev.type = type;
      ev.id = ++seq;
      ev.rt = performance.now();
      ev.at = null; ev.per = null; ev.gc = null;
      if (audioFn) { try { ev.at = audioFn(); } catch (e) { /* no audio clock yet */ } }
      if (clockFn) { try { const c = clockFn(); if (c) { ev.per = c.per; ev.gc = c.gc; } } catch (e) { /* no game clock */ } }
      const fam = familyOf(type);
      record(ev, fam === 'anim');
      const prev = Bus.current;
      Bus.current = ev;
      try {
        if (fn) { try { fn(ev); } catch (e) { console.error('audio bus ' + type, e); } }
        deliver(subs[type], ev);
        deliver(subs[fam + '.*'], ev);
        deliver(subs['*'], ev);
      } finally { Bus.current = prev; }
      return ev;
    },
    /** run fn with ev as the current event (a sound decided now for an earlier event is credited to that event) */
    within(ev, fn) {
      const prev = Bus.current;
      Bus.current = ev;
      try { return fn(); } finally { Bus.current = prev; }
    },
    /** note a sound's outcome on the current event (the mixer calls this for every play request) */
    note(rec) {
      const ev = Bus.current;
      if (!ev) return;
      (ev.sounds || (ev.sounds = [])).push(rec);
    },
    setClock(fn) { clockFn = fn; },
    setAudioClock(fn) { audioFn = fn; },
    /** the latest logged events, oldest first (filter(ev) → keep it) */
    recent(n, filter) {
      const all = ring.length < ringSize ? ring.slice() : ring.slice(ringAt).concat(ring.slice(0, ringAt));
      const out = filter ? all.filter(filter) : all;
      return n ? out.slice(-n) : out;
    },
    /** record every event from now (anim.* too unless opts.anim === false) until traceStop(), which returns them */
    traceStart(opts) { trace = []; traceAnim = !(opts && opts.anim === false); },
    traceStop() { const t = trace || []; trace = null; return t; },
    /** the trace so far, without stopping it */
    tracePeek() { return trace ? trace.slice() : []; },
    tracing() { return !!trace; },
    /** a new game: no subscribers carried over, an empty log */
    reset(size) {
      for (const k in subs) delete subs[k];
      ring = []; ringAt = 0; ringSize = size || (PBC.AudioConfig ? PBC.AudioConfig.debug.logSize : 400);
      clockFn = null; audioFn = null; Bus.current = null;
    },
  };
  PBC.AudioBus = Bus;
})();
