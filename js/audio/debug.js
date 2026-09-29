/* Pro BBALL Coach: the audio console (PBC.AudioDebug), opened in a live game with the A key or the 🎚️ button.
 *  - the event log: every event on the audio bus (newest first) with its real time, audio time and game clock, and
 *    the sounds it played (bus, priority) or why a sound did not play (cooldown, cap, muted, paused, speed)
 *  - a strip per bus and the master: meter (RMS bar, peak line), fader, mute, solo, a test tone, voices / cap;
 *    the limiter's gain reduction, the crowd duck (the bed / the reactions), and whether the booth is talking
 *  - "Save last 30 s": a WAV of the master from the mixer's rolling recorder (browser speech is outside Web Audio,
 *    so it is not in the file until Trial 7 moves the booth into the mixer)
 * For tests: PBC.AudioDebug.traceStart() / traceStop() (every event, anim.* included), format(list) (one text line
 * per event and sound), state() (buses, meters, voices), saveWav(secs). */
(function () {
  'use strict';
  const PBC = window.PBC;
  const FAM = ['game', 'court', 'anim', 'live', 'timer', 'booth'];
  let A = null;            // { mx, au, at, root, host, button }
  let el = null, open = false, raf = 0, lastMeter = 0, lastLog = 0, lastId = -1;
  const filt = { game: true, court: true, anim: false, live: true, timer: true, booth: true, soundsOnly: false };
  const t0 = performance.now();

  // ------------------------------------------------------------ text
  const r1 = (x) => (x == null || !isFinite(x) ? '' : Math.round(x * 10) / 10);
  const r2 = (x) => (x == null || !isFinite(x) ? '' : Math.round(x * 100) / 100);
  function clock(per, gc) {
    if (per == null || gc == null) return '';
    const m = Math.floor(gc / 60), s = gc - m * 60;
    return 'Q' + per + ' ' + m + ':' + (s < 10 ? '0' : '') + s.toFixed(1);
  }
  function describe(ev) {
    const host = A && A.host;
    const nm = (id) => { const p = id != null && host && host.S.players[id]; return p ? p.last : id != null ? '#' + id : '?'; };
    const tm = (i) => (host && host.teams[i] ? host.teams[i].abbr : i === 0 ? 'home' : i === 1 ? 'away' : '');
    const e = ev.e || {};
    const t = ev.type;
    if (t === 'game.shot') return `${nm(e.shooter)} ${e.pts}pt ${e.kind || ''}${e.pending ? ' (shot meter)' : ''} ${tm(e.team)}`;
    if (t === 'game.shotResult') return `${nm(e.shooter)} ${ev.result}${ev.contact ? ', ' + ev.contact : ''} (${ev.via})`;
    if (t === 'game.score') return `${tm(e.team)} +${e.pts}${ev.sc ? ' → ' + ev.sc[0] + '-' + ev.sc[1] : ''}`;
    if (t === 'game.ft') return `${nm(e.shooter)} FT ${e.num || ''}/${e.of || ''} ${e.made ? 'good' : 'no good'}`;
    if (t === 'game.foul') return `${e.kind || ''} foul ${nm(e.fouler)} (${tm(e.team)})`;
    if (t === 'game.turnover') return `${e.kind || ''} ${nm(e.player)}${e.stealer ? ' stolen by ' + nm(e.stealer) : ''}`;
    if (t === 'game.rebound') return `${e.off ? 'off.' : 'def.'} ${nm(e.player)}`;
    if (t === 'game.run') return `${tm(ev.team)} ${ev.pts}-0 run`;
    if (t === 'game.leadChange') return `${tm(ev.team)} lead by ${ev.lead}`;
    if (t === 'game.tie') return `tied ${ev.score ? ev.score[0] : ''}`;
    if (t === 'game.milestone') return `${nm(ev.pid)} ${ev.pts} pts`;
    if (t === 'game.clutch') return `clutch time Q${ev.period} ${r1(ev.clock)}s`;
    if (t.startsWith('game.')) return [e.player != null ? nm(e.player) : '', e.team != null ? tm(e.team) : '', e.kind || ''].filter(Boolean).join(' ');
    if (t.startsWith('court.')) return `v ${r2(ev.v)}${ev.pid != null ? ' ' + nm(ev.pid) : ''}${ev.x != null ? ` at ${r1(ev.x)}, ${r1(ev.y)}${ev.z != null ? ', ' + r1(ev.z) : ''} ft` : ''}`;
    if (t === 'anim.plant' || t === 'anim.land') return `${ev.ref ? 'ref' : nm(ev.pid)} ${ev.foot} ${ev.mode || ''} speed ${r1(ev.speed)} brake ${r1(ev.brake)} turn ${r1(ev.turn)}`;
    if (t.startsWith('anim.')) return `${nm(ev.pid)}${ev.from ? ' from ' + ev.from : ''}${ev.dur ? ' ' + r2(ev.dur) + ' s' : ''}${ev.bounce ? ' bounce' : ''}`;
    if (t === 'live.possession') return ev.P ? `${tm(ev.P.off)} ball, ${ev.P.play || ''}` : '';
    if (t === 'live.final') return `${tm(ev.winner)} win`;
    if (t === 'live.speed') return ev.speed + 'x';
    if (t === 'live.pause') return ev.paused ? 'paused' : 'playing';
    if (t === 'timer.squeak') return `v ${r2(ev.v)}`;
    if (t === 'booth.say') return `${ev.who}: "${ev.text}" (${ev.voice}, waited ${ev.waitedMs} ms)`;
    return '';
  }
  const played = (s) => s.s === 'play' || s.s === 'queued';
  function soundText(s) { return `${s.n}→${s.b} p${s.p}${s.s === 'play' ? '' : s.s === 'queued' ? ' queued' : ' ✗ ' + s.s}${s.stole ? ' (took ' + s.stole + ')' : ''}${s.at ? ' +' + s.at + 'ms' : ''}`; }
  /** one line per event: real time (s since load), audio time, game clock, type, description, sounds */
  function format(list) {
    return list.map((ev) => {
      const snd = (ev.sounds || []).map(soundText).join('; ');
      return [((ev.rt - t0) / 1000).toFixed(3).padStart(8), ev.at != null ? ev.at.toFixed(3).padStart(8) : '       -', clock(ev.per, ev.gc).padEnd(11), ev.type.padEnd(18), describe(ev), snd ? '| ' + snd : ''].join(' ');
    }).join('\n');
  }

  // ------------------------------------------------------------ the panel
  function build() {
    const live = A.root.querySelector('.live') || A.root;
    el = document.createElement('div');
    el.className = 'aud-console';
    const strip = (name, label) => `<div class="aud-bus" data-bus="${name}">
        <div class="aud-name">${label}</div>
        <div class="aud-meter"><i class="rms"></i><b class="pk"></b></div><div class="aud-db">-</div>
        ${name === 'master' ? '<div class="aud-extra" data-extra></div>' : `<input type="range" min="0" max="150" value="100" data-fader title="Fader (% of the bus level)">
        <button class="aud-b" data-mute title="Mute">M</button><button class="aud-b" data-solo title="Solo">S</button><button class="aud-b" data-tone title="Test tone on this bus">▶</button>
        <div class="aud-v" data-v></div>`}</div>`;
    el.innerHTML = `<div class="aud-head"><b>🎚️ Audio console</b><span class="aud-status" data-status></span>
        <button class="aud-b wide" data-save title="Save the last 30 seconds of the master as a WAV file">⬇ Save last 30 s</button><button class="aud-b" data-close title="Close (A)">✕</button></div>
      <div class="aud-buses">${PBC.AudioMixer.BUSES.map((n) => strip(n, PBC.AudioConfig.buses[n].label)).join('')}${strip('master', 'Master')}</div>
      <div class="aud-filt">${FAM.map((f) => `<label><input type="checkbox" data-f="${f}" ${filt[f] ? 'checked' : ''}> ${f}</label>`).join('')}<label><input type="checkbox" data-f="soundsOnly" ${filt.soundsOnly ? 'checked' : ''}> with sounds only</label></div>
      <div class="aud-log" data-log></div>`;
    live.appendChild(el);
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const busEl = b.closest('[data-bus]'), bus = busEl && busEl.dataset.bus;
      if (b.hasAttribute('data-close')) toggle(false);
      else if (b.hasAttribute('data-save')) download();
      else if (b.hasAttribute('data-mute')) A.mx.mute(bus);
      else if (b.hasAttribute('data-solo')) A.mx.solo(bus);
      else if (b.hasAttribute('data-tone') && A.au) PBC.AudioBus.emit('live.test', { bus }, () => A.au.testTone(bus));
      paintButtons();
    });
    el.addEventListener('input', (e) => {
      const f = e.target.closest('[data-fader]');
      if (f) A.mx.setFader(f.closest('[data-bus]').dataset.bus, (+f.value) / 100);
    });
    el.addEventListener('change', (e) => {
      const f = e.target.closest('[data-f]');
      if (!f) return;
      filt[f.dataset.f] = f.checked;
      PBC.AudioBus.logAnim = filt.anim;
      lastId = -1;
    });
    // (the console's own keys and clicks stay out of the game's shortcuts)
    el.addEventListener('keydown', (e) => { e.stopPropagation(); if ((e.key === 'a' || e.key === 'A') && !e.target.closest('input')) toggle(false); });
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    paintButtons();
  }
  function paintButtons() {
    if (!el || !A) return;
    for (const b of el.querySelectorAll('[data-bus]')) {
      const st = A.mx.busState(b.dataset.bus);
      if (!st) continue;
      const m = b.querySelector('[data-mute]'), s = b.querySelector('[data-solo]');
      if (m) m.classList.toggle('on', st.mute);
      if (s) s.classList.toggle('on', st.solo);
      b.classList.toggle('silent', !st.audible);
    }
  }
  const pct = (db) => Math.max(0, Math.min(100, (db + 60) / 60 * 100));
  function paintMeters() {
    const mx = A.mx;
    for (const b of el.querySelectorAll('[data-bus]')) {
      const name = b.dataset.bus;
      let m = mx.meter(name);
      // (the browser voice is outside Web Audio: while it talks the Commentary strip shows its set level)
      const speech = name === 'commentary' && mx.isSpeaking() && m.rms < -60;
      if (speech) { const v = 20 * Math.log10(Math.max(1e-4, mx.speechVolume() * 0.3)); m = { rms: v, peak: v + 6 }; }
      b.querySelector('.rms').style.width = pct(m.rms) + '%';
      b.querySelector('.pk').style.left = pct(m.peak) + '%';
      b.querySelector('.aud-db').textContent = m.rms > -99 ? m.rms.toFixed(0) + (speech ? ' (voice)' : '') : '-∞';
      const st = mx.busState(name), v = b.querySelector('[data-v]');
      if (st && v) v.textContent = st.voices + '/' + st.cap;
      if (name === 'master') b.querySelector('[data-extra]').textContent = `limiter ${mx.limiterDb().toFixed(1)} dB · crowd duck ${mx.duckDb().toFixed(1)} / ${mx.duckDb(true).toFixed(1)} dB`;
    }
    const c = mx.ctx;
    el.querySelector('[data-status]').textContent = `${c ? c.state : 'no audio'} · voices ${mx.voiceCount()}/${PBC.AudioConfig.voices.globalCap} · booth ${mx.isSpeaking() ? 'talking' : 'quiet'} · recorder ${mx.recorderKind() || 'off'}`;
  }
  function paintLog() {
    const Bus = PBC.AudioBus;
    const list = Bus.recent(0, (ev) => filt[ev.type.slice(0, ev.type.indexOf('.'))] !== false && (!filt.soundsOnly || (ev.sounds && ev.sounds.length)));
    const top = list.length ? list[list.length - 1].id : 0;
    if (top === lastId) return;
    lastId = top;
    const rows = list.slice(-PBC.AudioConfig.debug.logRows).reverse().map((ev) => {
      const fam = ev.type.slice(0, ev.type.indexOf('.'));
      const snd = (ev.sounds || []).map((s) => `<span class="${played(s) ? 'ok' : 'no'}">${esc(soundText(s))}</span>`).join(' ');
      return `<div class="aud-row f-${fam}"><span class="t">${((ev.rt - t0) / 1000).toFixed(2)}</span><span class="a">${ev.at != null ? ev.at.toFixed(2) : '-'}</span><span class="c">${clock(ev.per, ev.gc)}</span><span class="e">${esc(ev.type)}</span><span class="d">${esc(describe(ev))}</span><span class="s">${snd}</span></div>`;
    });
    el.querySelector('[data-log]').innerHTML = `<div class="aud-row hd"><span class="t">real s</span><span class="a">audio s</span><span class="c">clock</span><span class="e">event</span><span class="d"></span><span class="s">sounds</span></div>` + rows.join('');
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function tick(ts) {
    if (!open || !A || !el) return;
    const C = PBC.AudioConfig.debug;
    if (ts - lastMeter >= 1000 / C.meterFps) { lastMeter = ts; try { paintMeters(); } catch (e) { /* ignore */ } }
    if (ts - lastLog >= 200) { lastLog = ts; try { paintLog(); } catch (e) { /* ignore */ } }
    raf = requestAnimationFrame(tick);
  }
  function download() {
    if (!A) return;
    A.mx.saveWav().then((r) => {
      if (!r) { if (PBC.UI && PBC.UI.toast) PBC.UI.toast('Nothing recorded yet', 'info'); return; }
      const url = URL.createObjectURL(new Blob([r.wav], { type: 'audio/wav' }));
      const a = document.createElement('a');
      a.href = url; a.download = `pbc-audio-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.wav`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      if (PBC.UI && PBC.UI.toast) PBC.UI.toast(`Saved the last ${r.seconds.toFixed(0)} s of the arena audio`, 'info');
    });
  }
  function toggle(on) {
    if (!A) return;
    open = on == null ? !open : !!on;
    if (open && !el) build();
    if (el) el.classList.toggle('on', open);
    if (A.button) A.button.classList.toggle('on', open);
    PBC.AudioBus.logAnim = open && filt.anim;
    cancelAnimationFrame(raf);
    if (open) { lastId = -1; raf = requestAnimationFrame(tick); }
  }

  PBC.AudioDebug = {
    attach(o) { PBC.AudioDebug.detach(); A = o; },
    detach() { cancelAnimationFrame(raf); if (el) el.remove(); el = null; open = false; A = null; },
    toggle,
    isOpen: () => open,
    traceStart: (opts) => PBC.AudioBus.traceStart(opts),
    traceStop: () => PBC.AudioBus.traceStop(),
    format,
    describe,
    /** buses (state and meter), master meter, voices, limiter, duck, booth */
    state() {
      if (!A) return null;
      const mx = A.mx, o = { ctx: mx.ctx ? mx.ctx.state : null, buses: {}, master: mx.meter('master'), voices: mx.voiceCount(), limiterDb: mx.limiterDb(), duckDb: mx.duckDb(), duckReactDb: mx.duckDb(true), speaking: mx.isSpeaking(), stats: mx.stats(), cpuMs: mx.cpuMs(), recorder: mx.recorderKind() };
      for (const n of PBC.AudioMixer.BUSES) o.buses[n] = Object.assign(mx.busState(n), { meter: mx.meter(n) });
      return o;
    },
    saveWav: (secs) => (A ? A.mx.saveWav(secs) : Promise.resolve(null)),
  };
})();
