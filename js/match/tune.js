/* Pro BBALL Coach: match view tuning (PBC.Match.Tune).
 * The one config for the animation system. Every tunable value lives here, grouped by the system that uses it
 * (and the gauntlet trial that introduced it, see docs/gauntlet). Values are starting points tuned against NBA
 * references; units are in the names or the comments (ft, s, deg, ft/s, ft/s^2, in). Loaded right after util.js.
 * Later groups are added trial by trial as each system's numbers move out of the code. */
(function () {
  'use strict';
  const PBC = (window.PBC = window.PBC || {});
  const M = (PBC.Match = PBC.Match || {});

  const Tune = {
    // ---------------------------------------------------------------- simulation clock (Trial 1)
    clock: {
      // fixed simulation step (s): every playback speed runs whole steps of this size, so 0.25x shows exactly the
      // frames 1x shows, and the motion never depends on the screen's refresh rate
      step: 1 / 60,
      // most steps one update() may run (2 s of game time); a longer gap (a stalled tab) is dropped, not replayed
      maxStepsPerUpdate: 120,
    },

    // ---------------------------------------------------------------- debug tools and meters (Trial 1)
    debug: {
      speeds: [0.1, 0.25, 0.5, 1, 2, 4],
      recorderSeconds: 12,          // rewind buffer length (s of game time, recorded at the sim step)
      // foot contact: a heel / ball / toe point is on the floor below this height (ft; 0.3 in) and leaves it above
      // the exit height (0.5 in); while on the floor a loaded point must not move
      contactEnterFt: 0.025,
      contactExitFt: 0.042,
      // a pivot is legal only on the ball of the foot with the heel off the floor (coaching: rotate on the ball, a
      // heel that turns on the floor slides); heel height (ft) that counts as "up" for the rotation exemption
      pivotHeelUpFt: 0.03,
      // slide thresholds (in): viewers notice foot sliding under 21 mm (Prazak, Hoyet, O'Sullivan, SCA 2011)
      slideOkIn: 0.25,
      slideBadIn: 0.83,
      sinkIn: 0.25,                 // a foot point further below the floor than this is "through the floor"
      hoverIn: 0.5,                 // a planted foot whose lowest point is higher than this is floating
      // hand on the ball: the palm sits ~0.01 H off the ball surface (skin and fingers); gaps are measured past it
      palmOffsetH: 0.01,
      handGapOkIn: 0.5,
      handGapBadIn: 1.5,
      limitTolDeg: 0.5,             // a final joint angle past its human range by more than this is a violation
      accelSnapFtps2: 60,           // body acceleration past this (~1.9 g) in one step is a snap
      turnStillRadps: 0.5,          // a turn "starts" from below this rate...
      turnSnapRadps: 4,             // ...and is instant if it passes this rate within one step (~230 deg/s)
      jointSnapFtps2: 1500,         // a joint accelerating past this in the body frame in one step is a pop
      staleLookSec: 0.5,            // a look target that has not moved for this long while the ball moved...
      staleLookFt: 3,               // ...this far is stale
      torsoOverlapFt: 0.75,         // two torso axes closer than this are inside each other
      handInBodyFt: 0.3,            // a hand this close to another player's torso axis is inside him
      velArrowS: 0.25,              // velocity arrow = where the body will be in this many seconds
      accArrowS2: 0.02,             // acceleration arrow length = accel x this (ft per ft/s^2)
      lookRayFt: 30,                // longest drawn look ray (ft)
      colors: {
        ok: '#3ecf8e', warn: '#f2c14e', bad: '#ff4d5a', sink: '#b46bff', hover: '#5ad1ff',
        vel: '#f07a1a', acc: '#39c6ff', face: '#ffffff', chest: '#ffb86b', want: 'rgba(255,255,255,0.35)',
        com: '#ffe14d', support: 'rgba(62,207,142,0.18)', supportOff: 'rgba(255,77,90,0.18)',
        look: 'rgba(120,220,255,0.9)', lookNone: '#ff4d5a', lookStale: '#f2c14e',
        limitBad: '#ff3b45', limitClamp: '#f2a33a', limitReach: '#f2e24e', label: '#e8ecf5', labelBg: 'rgba(8,10,16,0.72)',
      },
    },

    // ---------------------------------------------------------------- body segment masses (center of mass)
    // Dempster via Winter (Biomechanics and Motor Control of Human Movement, 4th ed., table 4.1): fraction of body
    // mass and centre of mass position from the proximal end, per segment [from joint, to joint, mass, com]
    segMass: [
      ['HC', 'NCK', 0.081, 0.5],        // head and neck (centre between the neck base and the head centre)
      ['NCK', 'PEL', 0.497, 0.5],       // trunk
      ['L_SH', 'L_EL', 0.028, 0.436], ['R_SH', 'R_EL', 0.028, 0.436],
      ['L_EL', 'L_WR', 0.016, 0.43], ['R_EL', 'R_WR', 0.016, 0.43],
      ['L_WR', 'L_HD', 0.006, 0.506], ['R_WR', 'R_HD', 0.006, 0.506],
      ['L_HIP', 'L_KN', 0.1, 0.433], ['R_HIP', 'R_KN', 0.1, 0.433],
      ['L_KN', 'L_AN', 0.0465, 0.433], ['R_KN', 'R_AN', 0.0465, 0.433],
      ['L_HEEL', 'L_TOE', 0.0145, 0.5], ['R_HEEL', 'R_TOE', 0.0145, 0.5],
    ],
  };

  /** read a value by path ('debug.slideOkIn'), with a fallback */
  Tune.get = function (path, fallback) {
    let o = Tune;
    for (const k of String(path).split('.')) { if (o == null || !(k in o)) return fallback; o = o[k]; }
    return o;
  };

  M.Tune = Object.assign(M.Tune || {}, Tune);
})();
