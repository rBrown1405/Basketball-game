/* Pro BBALL Coach — audio debug overlay (PBC.AudioDebug). Toggle with F9 or the backquote key (left of 1).
 * Shows: a live event log (each event with the sounds it triggered and timestamps), a meter per bus with mute and
 * solo buttons, the ducking amount, voices playing, a frame monitor (frame times, hitches, and how much of each frame
 * the audio and event code used), and "Save last 30 s", which downloads the master output as a WAV.
 * The frame monitor runs even while the overlay is hidden, so the numbers are there when you open it. */
(function () {
  'use strict';
  const PBC = window.PBC = window.PBC || {};

  const CSS = `
.pbc-adbg{position:fixed;right:8px;top:56px;z-index:9000;width:min(580px,calc(100vw - 16px));max-height:calc(100vh - 64px);display:flex;flex-direction:column;
 background:rgba(8,12,20,.92);color:#dfe6f2;font:11px/1.35 ui-monospace,Menlo,Consolas,monospace;border:1px solid #2c3a52;border-radius:8px;box-shadow:0 6px 24px rgba(0,0,0,.5);pointer-events:auto}
.pbc-adbg h4{margin:0;padding:6px 8px;font-size:12px;display:flex;gap:8px;align-items:center;border-bottom:1px solid #22304a}
.pbc-adbg h4 .sp{flex:1}
.pbc-adbg button{font:inherit;background:#1b2740;color:#dfe6f2;border:1px solid #33476b;border-radius:4px;padding:1px 6px;cursor:pointer}
.pbc-adbg button.on{background:#c0392b;border-color:#e74c3c}
.pbc-adbg button.solo.on{background:#d4a017;border-color:#f1c40f;color:#111}
.pbc-adbg .frm{padding:4px 8px;border-bottom:1px solid #22304a;white-space:pre-wrap}
.pbc-adbg .frm .bad{color:#ff7b6b}
.pbc-adbg .buses{padding:4px 8px;display:grid;grid-template-columns:78px 1fr 64px 26px 26px 52px;gap:3px 6px;align-items:center;border-bottom:1px solid #22304a}
.pbc-adbg .bar{height:8px;background:#141c2c;border-radius:2px;position:relative;overflow:hidden}
.pbc-adbg .bar i{position:absolute;left:0;top:0;bottom:0;background:linear-gradient(90deg,#2ecc71,#f1c40f 75%,#e74c3c)}
.pbc-adbg .bar b{position:absolute;top:0;bottom:0;width:2px;background:#fff}
.pbc-adbg .log{overflow:auto;padding:4px 8px;flex:1;min-height:80px}
.pbc-adbg .log div{white-space:nowrap}
.pbc-adbg .log .s{color:#8fd3ff}
.pbc-adbg .log .d{color:#ff9f7b}
.pbc-adbg .log .t{color:#7f8ea8}
.pbc-adbg label{display:flex;gap:4px;align-items:center}`;

  function create(A, stage) {
    const cfg = () => PBC.AudioConfig.debug;
    const D = { open: false, el: null, raf: 0, lastDraw: 0, showFeet: false, destroyed: false,
      frames: [], hitches: 0, audioMax: 0, audioHitch: 0, frameN: 0, last: 0, audioSum: 0 };
    const doc = typeof document !== 'undefined' ? document : null;

    // ---------------------------------------------------------- frame monitor (always on, very cheap)
    function tick(ts) {
      if (D.destroyed) return;
      if (D.last) {
        const dt = ts - D.last;
        const am = A.bus.ms + A.ms;
        A.bus.ms = 0; A.ms = 0;
        D.frames.push(dt); if (D.frames.length > 240) D.frames.shift();
        D.frameN++;
        D.audioSum += am;
        if (am > D.audioMax) D.audioMax = am;
        if (dt > cfg().longFrameMs) { D.hitches++; if (am > 4) D.audioHitch++; }
        D.lastAudio = am;
      }
      D.last = ts;
      if (D.open && ts - D.lastDraw > 1000 / cfg().meterFps) { D.lastDraw = ts; draw(); }
      D.raf = requestAnimationFrame(tick);
    }
    if (typeof requestAnimationFrame !== 'undefined') D.raf = requestAnimationFrame(tick);
    function frameStats() {
      const f = D.frames.slice().sort((a, b) => a - b);
      const q = p => (f.length ? f[Math.min(f.length - 1, Math.floor(p * f.length))] : 0);
      return { frames: D.frameN, fps: f.length ? 1000 / (D.frames.reduce((s, x) => s + x, 0) / f.length) : 0, p50: q(0.5), p99: q(0.99), max: f.length ? f[f.length - 1] : 0,
        hitches: D.hitches, audioHitches: D.audioHitch, audioMaxMs: D.audioMax, audioAvgMs: D.frameN ? D.audioSum / D.frameN : 0 };
    }

    // ---------------------------------------------------------- overlay
    function build() {
      if (!doc || D.el) return;
      if (!doc.getElementById('pbc-adbg-css')) { const s = doc.createElement('style'); s.id = 'pbc-adbg-css'; s.textContent = CSS; doc.head.appendChild(s); }
      const el = doc.createElement('div');
      el.className = 'pbc-adbg';
      const buses = PBC.AudioConfig.buses;
      el.innerHTML = `<h4>Audio debug <span class="sp"></span><label><input type="checkbox" data-a="feet"> foot plants</label>
        <button data-a="clear">Clear</button><button data-a="rec">Save last ${PBC.AudioConfig.recorder.seconds} s</button><button data-a="close">✕</button></h4>
        <div class="frm"></div>
        <div class="buses">${['master'].concat(buses).map(b => `<span>${b}</span><div class="bar" data-m="${b}"><i></i><b></b></div><span data-db="${b}"></span>${b === 'master' ? '<span></span><span></span><span></span>' : `<button data-mute="${b}">M</button><button class="solo" data-solo="${b}">S</button><span data-duck="${b}"></span>`}`).join('')}</div>
        <div class="log"></div>`;
      el.addEventListener('click', (e) => {
        const t = e.target.closest('button,input'); if (!t) return;
        e.stopPropagation();
        if (t.dataset.mute) { A.mixer.mute(t.dataset.mute); draw(); }
        else if (t.dataset.solo) { A.mixer.solo(t.dataset.solo); draw(); }
        else if (t.dataset.a === 'close') toggle(false);
        else if (t.dataset.a === 'clear') { A.bus.clear(); draw(); }
        else if (t.dataset.a === 'feet') { D.showFeet = t.checked; draw(); }
        else if (t.dataset.a === 'rec') saveClip();
      });
      el.addEventListener('pointerdown', e => e.stopPropagation());
      doc.body.appendChild(el);
      D.el = el;
    }
    const fmt = x => (x <= -100 ? ' -inf' : (x >= 0 ? ' ' : '') + x.toFixed(1)).padStart(6, ' ');
    const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    function draw() {
      if (!D.el) return;
      const fs = frameStats(), st = A.mixer.stats;
      D.el.querySelector('.frm').innerHTML = `frames ${fs.frames}  fps ${fs.fps.toFixed(0)}  frame p50 ${fs.p50.toFixed(1)} ms  p99 ${fs.p99.toFixed(1)}  max ${fs.max.toFixed(1)}\n` +
        `hitches (>${cfg().longFrameMs} ms) ${fs.hitches}  <span class="${fs.audioHitches ? 'bad' : ''}">caused by audio ${fs.audioHitches}</span>  audio/frame avg ${fs.audioAvgMs.toFixed(2)} ms  max ${fs.audioMaxMs.toFixed(2)} ms\n` +
        `voices ${st.voices}  played ${st.played}  stolen ${st.stolen}  dropped ${st.dropped}  talking ${A.mixer.talking ? 'yes' : 'no'}  recorder ${A.mixer.recorderKind() || 'off'}  ctx ${A.mixer.ctx ? A.mixer.ctx.state : 'none'}`;
      const m = A.mixer.meters(), bs = A.mixer.busState();
      for (const b of ['master'].concat(PBC.AudioConfig.buses)) {
        const v = m ? m[b] : { rms: -140, peak: -140 };
        const pct = x => Math.max(0, Math.min(100, (x + 60) / 60 * 100));
        const bar = D.el.querySelector(`[data-m="${b}"]`);
        bar.querySelector('i').style.width = pct(v.rms) + '%'; bar.querySelector('b').style.left = pct(v.peak) + '%';
        D.el.querySelector(`[data-db="${b}"]`).textContent = fmt(v.rms) + ' dB';
        if (b !== 'master') {
          D.el.querySelector(`[data-mute="${b}"]`).classList.toggle('on', bs[b].muted);
          D.el.querySelector(`[data-solo="${b}"]`).classList.toggle('on', bs[b].soloed);
          D.el.querySelector(`[data-duck="${b}"]`).textContent = m && m.duck[b] < -0.1 ? m.duck[b].toFixed(1) + 'dB' : '';
        }
      }
      const hide = D.showFeet ? [] : cfg().hideTypes;
      const log = A.bus.log();
      const rows = [];
      for (let i = log.length - 1; i >= 0 && rows.length < cfg().overlayRows; i--) {
        const e = log[i];
        if (hide.includes(e.type)) continue;
        const d = PBC.AudioBus.describe(e);
        const snd = (e.sounds || []).map(s => s.dropped ? `<span class="d">${esc(s.name)}✗${esc(s.dropped)}</span>` : `<span class="s">${esc(s.name)}→${esc(s.bus)}${s.stolen ? ' (stole ' + esc(s.stolen) + ')' : ''}</span>`).join(' ');
        rows.push(`<div><span class="t">${(d.wallMs / 1000).toFixed(2).padStart(8)}s g${String(d.gameT).padStart(7)} Q${d.period || '-'} ${d.clock != null ? String(d.clock).padStart(6) : '      '}</span> ${esc(d.text)} ${snd}</div>`);
      }
      D.el.querySelector('.log').innerHTML = rows.join('');
    }
    function toggle(on) {
      D.open = on == null ? !D.open : !!on;
      if (D.open) { build(); D.el.style.display = ''; draw(); } else if (D.el) D.el.style.display = 'none';
      return D.open;
    }
    function saveClip() {
      return A.mixer.grabClip().then(r => {
        const a = doc.createElement('a');
        a.href = URL.createObjectURL(r.blob);
        a.download = `pbc-audio-${new Date().toISOString().replace(/[:.]/g, '-')}.wav`;
        doc.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        A.bus.emit('clip_saved', { detail: `${r.seconds.toFixed(1)} s, peak ${r.peakDb.toFixed(1)} dBFS` });
        return r;
      }).catch(e => { console.warn('clip', e); A.bus.emit('clip_saved', { detail: 'failed: ' + e.message }); });
    }
    const onKey = (e) => {
      if (e.target && e.target.closest && e.target.closest('input,select,textarea')) return;
      if (cfg().keys.includes(e.code) || cfg().keys.includes(e.key)) { e.preventDefault(); toggle(); }
    };
    if (doc) doc.addEventListener('keydown', onKey);

    return {
      toggle, draw, saveClip, frameStats,
      get open() { return D.open; },
      resetFrames() { D.frames = []; D.hitches = 0; D.audioHitch = 0; D.audioMax = 0; D.frameN = 0; D.audioSum = 0; },
      destroy() {
        D.destroyed = true;
        if (typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(D.raf);
        if (doc) doc.removeEventListener('keydown', onKey);
        if (D.el) D.el.remove();
      },
    };
  }

  PBC.AudioDebug = { create };
})();
