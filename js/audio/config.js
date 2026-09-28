/* Pro BBALL Coach — every tunable audio value in one place (PBC.AudioConfig).
 * Levels are linear gain unless the name ends in Db. Times are seconds unless the name ends in Ms.
 * Game systems read these at the moment they need them, so a value changed from the console (or the debug overlay)
 * takes effect right away. Nothing else in js/audio or js/ui/arenaaudio.js should hold a magic number. */
(function () {
  'use strict';
  const PBC = window.PBC = window.PBC || {};

  PBC.AudioConfig = {
    // ------------------------------------------------------------ mixer
    buses: ['court', 'players', 'crowd', 'arena', 'commentary'],
    bus: {
      court: { level: 0.9, reverbSend: 1.0 },       // sneakers, ball, bodies, rim
      players: { level: 0.9, reverbSend: 0.6 },     // voices, grunts, chatter (Trial 6)
      crowd: { level: 0.9, reverbSend: 1.0 },       // bed, reactions, chants
      arena: { level: 0.9, reverbSend: 1.0 },       // PA, music, horns, whistles
      commentary: { level: 1.0, reverbSend: 0 },    // the booth stays dry and close
    },
    master: {
      level: 0.7,                 // overridden by the player's volume setting
      pausedLevel: 0.35,          // master level (as a fraction) while the game is paused
      levelSmoothing: 0.15,       // time constant for master level changes
      comp: { thresholdDb: -18, ratio: 3.5, attack: 0.01, release: 0.25, kneeDb: 6 },
      limiter: { thresholdDb: -1.5, ratio: 20, attack: 0.001, release: 0.1, kneeDb: 0 },
    },
    reverb: { seconds: 2.2, decay: 2.6, fadeInSamples: 400, returnLevel: 0.32 },
    muteRamp: 0.012,              // mute / solo fade so switching never clicks

    // ducking: while a commentator speaks, these buses dip smoothly; a big crowd moment can push back through
    duck: {
      targets: { crowd: -5.2, arena: -4 },   // dB of dip per bus
      attack: 0.18,               // time constant going down (gentle: a broadcast rides the crowd, it doesn't slam it)
      release: 0.8,               // time constant coming back up
      hold: 0.7,                  // stay dipped this long after a line ends, so back-to-back lines don't pump the crowd
      pushThroughMax: 1.0,        // 1 = a big moment can fully cancel the dip
      pushThroughDecay: 1.2,      // seconds for a push-through to fade away
      pushThroughRise: 0.1,       // time constant of the crowd rising back through the dip on a big moment
    },

    // ------------------------------------------------------------ voices (instance limiting and priority)
    voices: {
      maxTotal: 48,               // simultaneous one-shot voices across all buses
      maxPerBus: { court: 16, players: 6, crowd: 14, arena: 8, commentary: 3 },
      stealFade: 0.02,            // fade-out when a voice is stolen by a more important one
      // per sound: bus, priority (1 low .. 10 never cut), max voices of this sound, min retrigger gap in ms of real time
      // (the gap is scaled by game speed / 2, so fast playback never machine-guns). dropAtSpeed: silenced at or above
      // that playback speed. gain (optional, default 1): a per-sound volume trim.
      sounds: {
        dribble: { bus: 'court', pri: 3, max: 4, gapMs: 90, dropAtSpeed: 8 },
        bounce: { bus: 'court', pri: 3, max: 3, gapMs: 45 },
        squeak: { bus: 'court', pri: 2, max: 3, gapMs: 120, dropAtSpeed: 8 },
        rim: { bus: 'court', pri: 6, max: 3, gapMs: 45 },
        board: { bus: 'court', pri: 6, max: 2, gapMs: 45 },
        swish: { bus: 'court', pri: 7, max: 2, gapMs: 45 },
        net: { bus: 'court', pri: 7, max: 2, gapMs: 45 },
        dunk: { bus: 'court', pri: 8, max: 2, gapMs: 45 },
        block: { bus: 'court', pri: 7, max: 2, gapMs: 45 },
        whistle: { bus: 'arena', pri: 9, max: 2, gapMs: 45 },
        horn: { bus: 'arena', pri: 10, max: 2, gapMs: 45 },
        clap: { bus: 'crowd', pri: 4, max: 8, gapMs: 0 },
        roar: { bus: 'crowd', pri: 8, max: 3, gapMs: 0 },
        ooh: { bus: 'crowd', pri: 6, max: 2, gapMs: 0 },
        groan: { bus: 'crowd', pri: 6, max: 2, gapMs: 0 },
        boo: { bus: 'crowd', pri: 6, max: 2, gapMs: 0 },
        murmur: { bus: 'crowd', pri: 3, max: 2, gapMs: 0 },
        chant: { bus: 'crowd', pri: 5, max: 1, gapMs: 0 },
        voiceLine: { bus: 'commentary', pri: 9, max: 2, gapMs: 0 },
        testTone: { bus: 'court', pri: 5, max: 6, gapMs: 0 },     // bus self-test (debug and trace test only)
      },
    },

    // ------------------------------------------------------------ crowd (values carried over unchanged from the
    // original arena audio; Trial 3 replaces this model)
    crowd: {
      bedLayers: [                 // looping noise layers: [buffer, filter, frequency, Q, gain]
        ['pink', 'lowpass', 380, 0.7, 0.55],
        ['pink', 'bandpass', 900, 0.8, 0.28],
        ['white', 'bandpass', 1900, 1.2, 0.06],
      ],
      bedBase: 0.16, bedStakes: 0.14, bedLateClose: 0.14, bedExcite: 0.2, bedPausedMul: 0.75,
      bedFollow: 2,                // how fast the bed level follows its target (per second)
      bedWobble: [0.12, 0.08],     // slow random movement of each layer
      exciteDecay: 0.35, exciteMax: 1.4, exciteHomeBig: 0.5, exciteHomeScore: 0.25, exciteBlock: 0.35,
      reactionStakes: 0.35,        // how much playoff stakes scale every reaction
      roarPushThrough: 0.6,        // how far a roar pushes back through the commentary duck (x its size)
      booChance: 0.55, booDelayMs: 250, awayFtMurmurChance: 0.5,
      chant: { minGap: 9, randGap: 10, chanceBase: 0.18, chanceStakes: 0.2, stakesMin: 0.5, maxSpeed: 4, bars: 3, barLen: 1.1, beat2: 0.36 },
      squeakTimer: [0.7, 2.4],     // (random squeak timer, kept until Trial 2 ties squeaks to real plants)
      squeakVol: [0.6, 0.5],
    },

    // ------------------------------------------------------------ animation events published to the bus
    feet: {
      publish: true,               // foot plants and landings go on the bus
      cutMinTurnDeg: 35,           // change of travel direction between plants that counts as a cut
      cutMinSpeed: 8,              // ft/s
      hardPlantDecel: 10,          // ft/s lost into a plant that counts as a hard plant
    },

    // ------------------------------------------------------------ assets
    assets: {
      folders: ['court', 'crowd', 'chants', 'chatter', 'arena', 'commentary'],
      root: 'assets/audio',
      decodeBudgetMs: 6,           // max decode work started per frame so loading never stutters
    },

    // ------------------------------------------------------------ debug and proof tools
    debug: {
      logSize: 4000,               // events kept in memory for the overlay and traces
      overlayRows: 60,
      hideTypes: ['foot_plant'],   // hidden in the overlay by default (too many to read); still logged
      keys: ['F9', 'Backquote'],   // toggles the overlay (backquote is the key left of 1, easier on a Mac)
      meterFps: 20,
      longFrameMs: 25,             // a frame this long counts as a hitch
    },
    recorder: {
      enabled: true,               // keep a rolling buffer of the master output
      seconds: 30,
      channels: 2,
    },
  };
})();
