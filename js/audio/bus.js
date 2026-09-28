/* Pro BBALL Coach — the audio event bus (PBC.AudioBus).
 * The sim, the court view and the animation publish what happens; audio systems (arena sound, commentary, the TV
 * package, the debug overlay) subscribe. Every event is stamped with game time, the game clock and real time, and
 * kept in a ring buffer with the sounds it triggered, so the overlay and the trace test can show
 * "event -> sounds" side by side.
 *
 *   const bus = PBC.AudioBus.create({ now: () => ({ t, clock, period }) });
 *   const off = bus.on('score', e => ...);   // a type, an array of types, '*' or a predicate
 *   bus.emit('score', { team: 0, sim: ev });
 *
 * Event types used across the gauntlet (a publisher may add fields):
 *   court:    dribble_contact, ball_bounce, rim_hit, board_hit, net, dunk_contact, block_contact, catch, pass
 *   bodies:   foot_plant, cut, landing
 *   sim:      jump_ball, inbound, advance, shot_release, score, rebound, turnover, foul, ft, timeout, sub,
 *             period_end, injury, possession_change
 *   refs:     whistle, horn
 *   derived:  run, lead_change, tie, milestone
 *   booth:    commentary_line
 * Handlers run synchronously in subscription order; one handler throwing never stops the others. */
(function () {
  'use strict';
  const PBC = window.PBC = window.PBC || {};

  function create(opts) {
    opts = opts || {};
    const cfg = () => (PBC.AudioConfig && PBC.AudioConfig.debug) || {};
    const subs = [];
    const log = [];
    let seq = 0, cur = null;
    const counts = {};
    const handlerMs = {};
    const typeMs = {};      // event type -> total ms spent emitting it   // label -> { calls, ms, max, maxType }: who costs time
    const wall0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const wall = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) - wall0;

    function match(f, type) {
      if (f === '*') return true;
      if (typeof f === 'string') return f === type;
      if (Array.isArray(f)) return f.includes(type);
      return false;
    }
    const bus = {
      on(filter, fn, label, o) {
        const s = { filter, fn, label: label || (typeof filter === 'string' ? filter : 'handler'), audio: !(o && o.audio === false) };
        subs.push(s);
        return () => { const i = subs.indexOf(s); if (i >= 0) subs.splice(i, 1); };
      },
      /** is anybody listening for this type (lets hot publishers like foot plants skip work) */
      wants(type) {
        for (const s of subs) if (typeof s.filter === 'function' || match(s.filter, type)) return true;
        return !!opts.logAll;
      },
      emit(type, data) {
        const st = opts.now ? opts.now() : {};
        const e = Object.assign({ id: ++seq, type, t: st.t != null ? st.t : null, clock: st.clock != null ? st.clock : null, period: st.period != null ? st.period : null, wall: wall(), sounds: null }, data || {});
        counts[type] = (counts[type] || 0) + 1;
        log.push(e);
        const max = cfg().logSize || 4000;
        if (log.length > max) log.splice(0, log.length - max);
        const prev = cur, t0 = prev ? 0 : wall();
        let nonAudio = 0;
        cur = e;
        try {
          for (const s of subs.slice()) {
            if (typeof s.filter === 'function' ? s.filter(e) : match(s.filter, type)) {
              const h0 = wall();
              try { s.fn(e); } catch (err) { console.error('audio bus handler', type, err); }
              const hd = wall() - h0;
              if (!s.audio) nonAudio += hd;
              const hs = handlerMs[s.label] || (handlerMs[s.label] = { calls: 0, ms: 0, max: 0, maxType: null });
              hs.calls++; hs.ms += hd; if (hd > hs.max) { hs.max = hd; hs.maxType = type; }
            }
          }
        } finally {
          cur = prev;
          // (time spent in subscribers that are not audio, such as the TV graphics, is not charged to audio)
          if (!prev) {
            const dt = wall() - t0 - nonAudio;
            bus.ms += dt; typeMs[type] = (typeMs[type] || 0) + dt;
            if (dt > bus.slowest.ms) bus.slowest = { type, ms: dt, id: e.id };
          }
        }
        return e;
      },
      /** emit, then run fn as if it were a handler of that event (sounds it plays are attached to the event) */
      emitWith(type, data, fn) {
        const e = bus.emit(type, data);
        const prev = cur; cur = e;
        try { fn(e); } catch (err) { console.error('audio bus emitWith', type, err); } finally { cur = prev; }
        return e;
      },
      /** the event being handled right now (a sound played inside a handler is attached to it) */
      current() { return cur; },
      /** attach a sound record to the current event, or log it on its own when nothing is being handled */
      noteSound(rec) {
        const e = cur || bus.emit('sound', { orphan: true });
        (e.sounds || (e.sounds = [])).push(rec);
      },
      log() { return log; },
      counts() { return Object.assign({}, counts); },
      typeStats() { return Object.assign({}, typeMs); },
      handlerStats() { return JSON.parse(JSON.stringify(handlerMs)); },
      clear() { log.length = 0; for (const k in counts) delete counts[k]; },
      wall,
      /** real time spent inside emit by the bus and its audio subscribers, accumulated; the frame monitor reads and resets it */
      ms: 0,
      /** the slowest single emit so far (type and time), to find what costs a frame */
      slowest: { type: null, ms: 0 },
      /** plain rows for traces: one line per event and one per sound it triggered */
      trace(fromId) {
        const rows = [];
        for (const e of log) {
          if (fromId && e.id <= fromId) continue;
          rows.push(describe(e));
        }
        return rows;
      },
    };
    return bus;
  }

  const r2 = v => (v == null ? '' : Math.round(v * 100) / 100);
  function describe(e) {
    const who = e.player != null ? ` p=${e.player}` : '';
    const team = e.team != null && e.team >= 0 ? ` team=${e.team}` : '';
    const pos = e.x != null ? ` at=(${r2(e.x)},${r2(e.y)})` : '';
    const extra = e.detail ? ' ' + e.detail : '';
    const sounds = (e.sounds || []).map(s => `${s.name}@${s.bus}${s.stolen ? ' stole:' + s.stolen : ''}${s.dropped ? ' DROPPED(' + s.dropped + ')' : ''}${s.lagMs != null ? ` lag=${s.lagMs}ms` : ''}`).join(', ');
    return { id: e.id, wallMs: Math.round(e.wall), gameT: r2(e.t), clock: r2(e.clock), period: e.period, type: e.type, text: `${e.type}${team}${who}${pos}${extra}`, sounds };
  }

  PBC.AudioBus = { create, describe };
})();
