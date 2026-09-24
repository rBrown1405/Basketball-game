/* Pro BBALL Coach — mini-games: hold/release shot meter component + release judge. Needs core.js, court.js. */
(function () {
  'use strict';
  const Mini = window.PBC.Mini, U = Mini.util, C = Mini.color;
  const EASE = 1.5;      // fill v = (t / fillT)^EASE → ease-in: the bar accelerates toward the top
  const BASE_T = 0.9;    // seconds to fill at speed 1 (speed 0.8 → 1.13 s, 1.3 → 0.69 s)
  const AUTO_V = 1.16;   // held way past the top → forced (very late) release

  /** Classify a release at meter value v for a window centred at c with size w (all 0..1 of the meter). */
  function judge(v, c, w) {
    const half = w / 2, dist = Math.abs(v - c), d = dist / half;
    if (d <= 1) return { quality: d <= 0.3 ? 'perfect' : 'good', score: 1 - 0.4 * Math.pow(d, 1.5) };
    const out = dist - half;
    const quality = v < c ? (out > Math.max(0.07, w) ? 'very_early' : 'early') : (out > Math.max(0.05, w * 0.8) ? 'very_late' : 'late');
    return { quality, score: 0.55 * Math.max(0, 1 - out / 0.16) };
  }
  Mini.judgeRelease = judge;

  const FEEDBACK = {
    perfect: ['PERFECT', 'gold', 'Perfect release'], good: ['GOOD', 'good', 'Good release'],
    early: ['EARLY', 'warn', 'Slightly early'], late: ['LATE', 'warn', 'Slightly late'],
    very_early: ['WAY EARLY', 'bad', 'Very early'], very_late: ['WAY LATE', 'bad', 'Very late'],
    no_release: ['NO RELEASE', 'bad', 'Shot clock'],
  };
  /** [big label, tone, sub-label] for a quality key. */
  Mini.releaseLabel = q => FEEDBACK[q] || FEEDBACK.no_release;
  Mini.toneColor = (T, tone) => ({ gold: T.gold, good: T.good, ok: T.accent2, warn: T.accent, bad: T.bad }[tone] || T.text);

  class Meter {
    /** opts: { windowSize, speed, contest, pressure, wobble (extra crowd wobble amplitude), center } */
    constructor(opts) {
      this.el = U.el('div', 'pm-meter');
      this.el.pbcMeter = this; // debug/test hook: element → component
      this.cv = U.el('canvas', 'pm-meter__cv');
      this.el.appendChild(this.cv);
      this.g = this.cv.getContext('2d');
      this.T = Mini.theme();
      this.cw = 0; this.ch = 0; this.dpr = 1;
      this.reset(opts);
    }
    reset(opts) {
      opts = opts || {};
      this.w = U.clamp(U.num(opts.windowSize, 0.09), 0.02, 0.3);
      this.speed = U.clamp(U.num(opts.speed, 1), 0.5, 1.6);
      this.fillT = BASE_T / this.speed;
      this.contest = opts.contest === 'tight' || opts.contest === 'contested' ? opts.contest : 'open';
      this.pressure = U.clamp(U.num(opts.pressure, 0), 0, 1);
      this.wobble = U.clamp(U.num(opts.wobble, 0), 0, 0.2);
      const half = this.w / 2;
      const c = U.num(opts.center, 0.8) + (Math.random() - 0.5) * 0.05 * this.pressure;
      this.c0 = U.clamp(c, 0.5 + half, 0.94 - half);
      this.c = this.c0;
      this.phase = Math.random() * 100;
      this.born = U.now();
      this.state = 'idle'; this.v = 0; this.tPress = 0; this.result = null; this.flashAt = -1e9; this.flashTone = 'good';
      return this;
    }
    /** Window centre at time `now` (pressure jitter + crowd wobble). */
    centerAt(now) {
      const s = (now - this.born) / 1000, ph = this.phase, half = this.w / 2;
      let c = this.c0;
      if (this.pressure) c += this.pressure * (0.02 * Math.sin(s * 6.9 + ph) + 0.011 * Math.sin(s * 17.3 + ph * 1.7));
      if (this.wobble) c += this.wobble * (0.65 * Math.sin(s * 4.1 + ph * 0.3) + 0.35 * Math.sin(s * 10.7 + ph));
      return U.clamp(c, 0.42 + half, 0.97 - half);
    }
    press(now) { if (this.state !== 'idle') return false; this.state = 'filling'; this.tPress = now; this.v = 0; return true; }
    /** Seconds of hold that land dead-centre for the current window position (tests / AI helpers). */
    idealHold() { return this.fillT * Math.pow(this.c, 1 / EASE); }
    /** Call every frame. Returns the result when a forced (held too long) release happens, else null. */
    tick(now) {
      this.c = this.centerAt(now);
      if (this.state === 'filling') {
        this.v = Math.pow((now - this.tPress) / 1000 / this.fillT, EASE);
        if (this.v >= AUTO_V) return this.release(now, true);
      }
      return null;
    }
    /** Release now → { quality, score 0..1, error (s, negative = early), pos }. */
    release(now, auto) {
      if (this.state !== 'filling') return null;
      const t = (now - this.tPress) / 1000, v = Math.pow(t / this.fillT, EASE);
      this.v = v; this.c = this.centerAt(now);
      const j = judge(v, this.c, this.w);
      const ideal = this.fillT * Math.pow(this.c, 1 / EASE);
      this.state = 'released';
      this.result = { quality: j.quality, score: Math.round(j.score * 1000) / 1000, error: Math.round((t - ideal) * 1000) / 1000, pos: Math.round(v * 1000) / 1000 };
      if (auto) this.result.auto = true;
      this.flash(FEEDBACK[j.quality][1]);
      return this.result;
    }
    flash(tone) { this.flashAt = U.now(); this.flashTone = tone; }
    _fit() {
      const w = this.cv.clientWidth, h = this.cv.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
      if (w < 2 || h < 2) return false;
      if (w !== this.cw || h !== this.ch || dpr !== this.dpr) {
        this.cw = w; this.ch = h; this.dpr = dpr;
        this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr);
      }
      return true;
    }
    draw(now) {
      if (!this._fit()) return;
      const g = this.g, T = this.T, w = this.cw, h = this.ch;
      now = now || U.now();
      g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      const amp = this.contest === 'tight' ? 2.8 : this.contest === 'contested' ? 1.1 : 0;
      if (amp && this.state !== 'released') {
        const s = now / 1000, k = this.state === 'filling' ? 1 : 0.45;
        g.translate(amp * k * Math.sin(s * 61 + this.phase), amp * 0.6 * k * Math.sin(s * 47 + this.phase * 2));
      }
      const bw = Math.max(12, Math.min(24, w * 0.34)), bx = w - bw - Math.max(6, w * 0.12), y0 = 12, y1 = h - 12;
      const yOf = v => y1 - U.clamp(v, 0, 1.03) * (y1 - y0);
      const rr = bw / 2;
      const track = () => { g.beginPath(); if (g.roundRect) g.roundRect(bx, y0 - 4, bw, y1 - y0 + 8, rr); else g.rect(bx, y0 - 4, bw, y1 - y0 + 8); };
      // track
      g.save();
      g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 14;
      track(); g.fillStyle = 'rgba(7,10,17,0.9)'; g.fill();
      g.restore();
      // ticks
      g.strokeStyle = 'rgba(255,255,255,0.2)'; g.lineWidth = 1;
      for (let i = 0; i <= 10; i++) { const y = Math.round(yOf(i / 10)) + 0.5, len = i % 5 === 0 ? 8 : 4; g.beginPath(); g.moveTo(bx - 4 - len, y); g.lineTo(bx - 4, y); g.stroke(); }
      g.save(); track(); g.clip();
      // window band
      const half = this.w / 2, wy0 = yOf(this.c + half), wy1 = yOf(this.c - half), py0 = yOf(this.c + half * 0.3), py1 = yOf(this.c - half * 0.3);
      g.fillStyle = C.rgba(T.good, 0.3); g.fillRect(bx, wy0, bw, wy1 - wy0);
      g.fillStyle = C.rgba(T.gold, 0.35); g.fillRect(bx, py0, bw, Math.max(1, py1 - py0));
      // fill
      const v = this.v, fy = yOf(Math.min(v, 1.03));
      if (v > 0) {
        let top = T.accent2, bottom = T.accent;
        if (this.state === 'released') { const col = Mini.toneColor(T, FEEDBACK[this.result.quality][1]); top = col; bottom = C.shade(col, -0.35); }
        else if (v >= this.c - half && v <= this.c + half) { top = T.good; bottom = C.shade(T.good, -0.4); }
        else if (v > this.c + half) { top = T.bad; bottom = C.shade(T.bad, -0.4); }
        const gr = g.createLinearGradient(0, y1, 0, fy);
        gr.addColorStop(0, C.rgba(bottom, 0.9)); gr.addColorStop(1, top);
        g.fillStyle = gr; g.fillRect(bx, fy, bw, y1 + 6 - fy);
        g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillRect(bx, fy - 1, bw, 2);
      }
      // flash overlay
      const fa = U.sat(1 - (now - this.flashAt) / 520);
      if (fa > 0) { g.fillStyle = C.rgba(Mini.toneColor(T, this.flashTone), 0.55 * fa); g.fillRect(bx, y0 - 6, bw, y1 - y0 + 12); }
      g.restore();
      // window edges (outside the clip so they extend past the track)
      g.strokeStyle = T.good; g.lineWidth = 2;
      g.beginPath(); g.moveTo(bx - 3, wy0); g.lineTo(bx + bw + 3, wy0); g.moveTo(bx - 3, wy1); g.lineTo(bx + bw + 3, wy1); g.stroke();
      g.strokeStyle = T.gold; g.lineWidth = 1.5;
      const cy = yOf(this.c); g.beginPath(); g.moveTo(bx + 2, cy); g.lineTo(bx + bw - 2, cy); g.stroke();
      // border + glow
      track(); g.lineWidth = 1.5;
      g.strokeStyle = fa > 0 ? C.rgba(Mini.toneColor(T, this.flashTone), 0.5 + 0.5 * fa) : 'rgba(255,255,255,0.28)';
      if (fa > 0) { g.shadowColor = Mini.toneColor(T, this.flashTone); g.shadowBlur = 22 * fa; }
      g.stroke(); g.shadowBlur = 0;
      // level arrow
      if (this.state !== 'idle') {
        const ay = this.state === 'released' ? yOf(Math.min(this.result.pos, 1.03)) : fy;
        g.fillStyle = this.state === 'released' ? Mini.toneColor(T, FEEDBACK[this.result.quality][1]) : '#fff';
        g.beginPath(); g.moveTo(bx - 3, ay); g.lineTo(bx - 12, ay - 6); g.lineTo(bx - 12, ay + 6); g.closePath(); g.fill();
        if (this.state === 'released') { g.fillRect(bx - 4, ay - 2, bw + 8, 4); }
      }
    }
  }
  Mini.Meter = Meter;
  Mini.Meter.EASE = EASE; Mini.Meter.BASE_T = BASE_T;
})();
