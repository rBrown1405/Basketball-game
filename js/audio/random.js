/* Pro BBALL Coach: the audio's own random numbers (PBC.AudioRandom).
 * The crowd, the booth and the synthesized sounds pick variations and odds from here, never from Math.random, so
 * the sound never changes the game: the court and the engine draw from Math.random, and every number the audio took
 * from it used to shift what happened next (the same seeded game played differently with the sound on and off). */
(function () {
  'use strict';
  const PBC = window.PBC = window.PBC || {};
  // xorshift32, seeded from the clock (tests seed it for repeatable variations)
  let s = ((Date.now() ^ Math.floor(performance.now() * 1000)) >>> 0) || 1;
  function random() {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  }
  PBC.AudioRandom = {
    random,
    pick: (a) => a[Math.floor(random() * a.length)],
    chance: (p) => random() < p,
    range: (a, b) => a + (b - a) * random(),
    seed(v) { s = (v >>> 0) || 1; },
  };
})();
