/* Pro BBALL Coach: every tunable number of the game's audio, in one place (PBC.AudioConfig).
 * Volumes are linear gains (1 = unchanged) unless a name ends in Db; times are in seconds unless they end in Ms;
 * chances are 0 to 1. The values here are the ones the audio used before this file existed (Trial 1 of the audio
 * gauntlet moved them out of js/ui/arenaaudio.js and js/ui/commentary.js), so changing nothing sounds the same.
 * The mixer, the voice manager, the crowd, the booth and the debug console all read from here. */
(function () {
  'use strict';
  const PBC = window.PBC = window.PBC || {};

  PBC.AudioConfig = {
    // ---------------------------------------------------------------- the mix
    master: {
      volume: 0.7,              // default master volume (the player's Volume slider overrides it)
      pausedLevel: 0.35,        // master level while the game is paused
      fadeTc: 0.15,             // time constant of master level changes (s)
      // the glue compressor the arena always had, then a limiter so the loudest moments never clip
      glue: { threshold: -18, knee: 30, ratio: 3.5, attack: 0.01, release: 0.25 },
      limiter: { threshold: -1.5, knee: 0, ratio: 20, attack: 0.001, release: 0.12 },
    },
    // the arena's reverb: a generated impulse (large room), fed by each bus's send
    reverb: { seconds: 2.2, decay: 2.6, fadeInSamples: 400, returnGain: 0.32 },
    // the buses: level (gain), how much goes to the reverb, how many sounds at once (cap)
    buses: {
      court: { label: 'Court', gain: 0.9, reverbSend: 1, cap: 16 },           // sneakers, ball, bodies, rim
      players: { label: 'Players', gain: 1, reverbSend: 0.6, cap: 8 },        // voices, grunts, chatter (Trial 6)
      crowd: { label: 'Crowd', gain: 0.9, reverbSend: 1, cap: 14 },           // the bed, reactions, chants
      arena: { label: 'Arena', gain: 0.9, reverbSend: 1, cap: 6 },            // whistles, horns, PA, music
      commentary: { label: 'Commentary', gain: 1, reverbSend: 0, cap: 2 },    // the booth
    },
    muteRampTc: 0.008,          // mute / solo ramps, fast but without a click (s)
    // the booth's browser voices are outside Web Audio: their volume is the master volume plus this, times the
    // Commentary bus level (0 when muted or when another bus is soloed)
    speechBoost: 0.3,
    // ---------------------------------------------------------------- voices (one-shot sounds)
    voices: {
      globalCap: 48,            // sounds playing at once, all buses
      stealFade: 0.015,         // a stolen voice fades out over this (s)
    },
    // per sound: bus, priority (0-100: a sound only steals from a lower one), cooldown between two of the same sound
    // (ms at 1x; at faster game speeds it is multiplied by speed / speedDiv, never less than 1x), most at once, and the
    // game speed at which it is left out
    sounds: {
      dribble: { bus: 'court', prio: 20, cooldownMs: 90, max: 4, cutAtSpeed: 8 },
      bounce: { bus: 'court', prio: 25, cooldownMs: 45, max: 3 },
      squeak: { bus: 'court', prio: 15, cooldownMs: 120, max: 3, cutAtSpeed: 8 },
      rim: { bus: 'court', prio: 60, cooldownMs: 45, max: 3 },
      board: { bus: 'court', prio: 55, cooldownMs: 45, max: 2 },
      swish: { bus: 'court', prio: 65, cooldownMs: 45, max: 2 },
      net: { bus: 'court', prio: 60, cooldownMs: 45, max: 2 },
      dunk: { bus: 'court', prio: 80, cooldownMs: 45, max: 2 },
      block: { bus: 'court', prio: 70, cooldownMs: 45, max: 2 },
      whistle: { bus: 'arena', prio: 90, cooldownMs: 45, max: 2 },
      horn: { bus: 'arena', prio: 95, cooldownMs: 45, max: 1 },
      'crowd.roar': { bus: 'crowd', prio: 70, cooldownMs: 0, max: 4 },
      'crowd.ooh': { bus: 'crowd', prio: 50, cooldownMs: 0, max: 3 },
      'crowd.groan': { bus: 'crowd', prio: 50, cooldownMs: 0, max: 3 },
      'crowd.boo': { bus: 'crowd', prio: 60, cooldownMs: 0, max: 2 },
      'crowd.murmur': { bus: 'crowd', prio: 30, cooldownMs: 0, max: 3 },
      'crowd.chant': { bus: 'crowd', prio: 40, cooldownMs: 0, max: 1 },
      'test.tone': { bus: 'court', prio: 50, cooldownMs: 0, max: 6 },
    },
    speedDiv: 2,                // cooldowns grow with game speed: x max(1, speed / speedDiv)
    // samples from the packs (js/audio/assets.js): a little pitch and level change on every play
    sampleJitter: { pitch: 0.04, gainDb: 1.5 },
    // ---------------------------------------------------------------- ducking
    // while the booth talks the crowd goes down a little (and later the arena music more); a big crowd reaction lifts
    // the duck while it lasts, so a roar can push back through the voice. Times in s, about 95 % of the way in that
    // long. (Voice-over ducking keeps the duck through a whole spoken passage and comes back slowly, and stays gentle:
    // past 6-8 dB it is heard as pumping.)
    duck: {
      crowdDb: -6,               // the crowd bed under the booth
      crowdReactDb: -3,          // crowd reactions (cheers, groans, "oohs", boos, chants) under the booth: less, so
                                 // a cheer keeps its punch under the call (Trial 0 did not duck them at all)
      arenaDb: -10, arenaBuses: [],                   // (no arena music yet: the whistle and horn are never ducked)
      attack: 0.08,              // down when the booth starts
      hold: 1.0,                 // stays down this long after a line ends (two lines of one exchange are 0.3-1 s
                                 // apart: with less the crowd surged up and back down between them)
      release: 1.0,              // then back up this slowly
      pushThrough: 0.9,          // a crowd reaction at least this big (its size in crowd.react, before the stakes)
      pushHold: 1.5,             // lifts the duck for this long (s): the swell of a big roar
      pushReturn: 0.8,           // and hands back to the voice this slowly (not the attack: that chopped the roar)
    },
    // ---------------------------------------------------------------- the crowd (js/ui/arenaaudio.js)
    crowd: {
      noiseSeconds: 3, pinkSeconds: 4,                  // the noise the crowd is made of
      // the bed: three looping filtered noise layers [noise, filter, Hz, Q, level]
      bedLayers: [['pink', 'lowpass', 380, 0.7, 0.55], ['pink', 'bandpass', 900, 0.8, 0.28], ['white', 'bandpass', 1900, 1.2, 0.06]],
      bedBase: 0.16, bedStakes: 0.14, bedLateClose: 0.14, bedExcite: 0.2, bedNotPlaying: 0.75,
      bedFollow: 2,              // how fast the bed follows its target (1/s)
      bedTc: 0.25,               // the bed layers' gain time constant (s)
      bedWobble: [0.12, 0.08],   // slow random-looking level movement of each layer
      exciteMax: 1.4, exciteDecay: 0.35,   // excitement (0..max) and how fast it fades (per s)
      exciteHomeScore: 0.25, exciteHomeBig: 0.5, exciteHomeBlock: 0.35, exciteFinalWin: 1.4,
      levelStakes: 0.35,         // a reaction's size grows with playoff stakes: x (0.8 + stakes x this)
      levelMin: 0.1, levelMax: 1.4,
      // reaction sizes by what happened
      react: {
        homeScore: 0.65, homeBig: 1.1, awayScore: 0.5, awayBig: 0.8,
        block: 0.9, missedThree: 0.6, steal: 0.7,
        booChance: 0.55, booDelay: 0.25, boo: 0.6, booStakes: 0.3,
        ftHomeMade: 0.35, ftAwayMurmurChance: 0.5, ftAway: 0.35,
        timeout: 0.5, finalWin: 1.35, finalWin2: 1.1, finalWin2Delay: 0.9, finalLoss: 1,
      },
    },
    // the home crowd's "DE-FENSE" claps (a timer: Trial 4 makes chants follow the game)
    chant: { gapMin: 9, gapRand: 10, chance: 0.18, chanceStakes: 0.2, stakesMin: 0.5, maxSpeed: 4, bars: 3, barGap: 1.1, clapGap: 0.36 },
    // sneaker squeaks (a timer until Trial 2 ties them to foot plants)
    squeak: { gapMin: 0.7, gapRand: 2.4, speedCap: 4, volMin: 0.6, volRand: 0.5 },
    // ---------------------------------------------------------------- the synthesized sounds (the fallback voices
    // until recordings replace them): levels, pitches and lengths of each recipe
    synth: {
      dribble: { hz: 120, hzEnd: 55, peak: 0.34, a: 0.004, hold: 0.01, rel: 0.12, clickHz: 900, clickQ: 1.1, clickPeak: 0.12, clickA: 0.002, clickHold: 0.005, clickRel: 0.05 },
      bounce: { hz: 110, hzEnd: 50, peak: 0.3, a: 0.004, hold: 0.01, rel: 0.14, clickHz: 700, clickQ: 1, clickPeak: 0.1, clickA: 0.002, clickHold: 0.005, clickRel: 0.06 },
      squeak: { hzMin: 1900, hzRand: 900, peak: 0.05, a: 0.01, holdMin: 0.04, holdRand: 0.05, rel: 0.03, glideMin: 1.1, glideRand: 0.25, wobbleHzMin: 45, wobbleHzRand: 30, wobbleDepth: 60, length: 0.25 },
      rim: { partials: [[520, 1], [1334, 0.7], [2130, 0.45], [3190, 0.3], [4270, 0.18]], detune: 0.02, peak: 0.13, a: 0.002, hold: 0.01, relMin: 0.35, relRand: 0.2, tickHz: 2500, tickQ: 0.7, tickPeak: 0.08, tickA: 0.002, tickHold: 0.01, tickRel: 0.12 },
      board: { hz: 170, hzEnd: 120, peak: 0.22, a: 0.004, hold: 0.02, rel: 0.25, thudHz: 420, thudQ: 1.4, thudPeak: 0.14, thudA: 0.003, thudHold: 0.02, thudRel: 0.2 },
      swish: { hz: 5200, hzEnd: 7200, q: 1.6, peak: 0.1, a: 0.03, hold: 0.08, rel: 0.22, airHz: 6500, airQ: 0.7, airPeak: 0.04, airA: 0.02, airHold: 0.06, airRel: 0.15 },
      net: { hz: 4200, hzEnd: 6000, q: 1.2, peak: 0.08, a: 0.02, hold: 0.05, rel: 0.18, rim: 0.35 },
      dunk: { rim: 1.5, board: 1.2, boomHz: 80, boomHzEnd: 45, boomPeak: 0.3, boomA: 0.005, boomHold: 0.03, boomRel: 0.35 },
      block: { hz: 140, hzEnd: 70, peak: 0.25, a: 0.003, hold: 0.01, rel: 0.12, slapHz: 1300, slapQ: 1.3, slapPeak: 0.2, slapA: 0.002, slapHold: 0.01, slapRel: 0.08 },
      whistle: { hzMin: 2950, hzRand: 120, detune: 1.012, trillHzMin: 28, trillHzRand: 8, trillDepth: 0.045, peak: 0.09, a: 0.02, rel: 0.05, lenMin: 0.34, lenRand: 0.14 },
      horn: { partials: [[233, 1], [466, 0.5], [349, 0.6]], cutoff: 1400, peak: 0.07, a: 0.03, hold: 1.05, rel: 0.2 },
      clap: { hzMin: 1500, hzRand: 600, q: 0.8, peak: 0.22, a: 0.004, hold: 0.02, rel: 0.09 },
      chantSyl: [[520, 2.4, 0.14, 0.04, 0.12, 0.2], [700, 2.4, 0.16, 0.04, 0.16, 0.25]],   // [Hz, Q, level, attack, hold, release]
      roar: [['bandpass', 1100, 0.55, 0.55, 0.12, 0.6, 0.8, 1.8], ['lowpass', 700, 0.6, 0.45, 0.1, 0.5, 0.8, 1.6], ['bandpass', 2600, 1.4, 0.12, 0.15, 0.4, 0, 1.2]],   // [filter, Hz, Q, level, attack, hold, hold x level, release]
      ooh: [[480, 3.5, 0.5, 380], [900, 4, 0.22, 700]], oohA: 0.12, oohHold: 0.35, oohRel: 0.8,    // [Hz, Q, level, end Hz]
      groan: { hz: 420, q: 3, peak: 0.35, a: 0.2, hold: 0.4, rel: 1.0, hzEnd: 260 },
      boo: [[300, 5, 0.4, 250], [620, 5, 0.18, 520]], booA: 0.3, booHold: 0.9, booRel: 1.2,
      murmur: { hz: 800, q: 1.2, peak: 0.18, a: 0.3, hold: 0.6, rel: 0.9 },
      testTone: { hz: 440, peak: 0.2, a: 0.01, hold: 0.3, rel: 0.1 },
    },
    // ---------------------------------------------------------------- game moments the bus works out (js/audio/tracker.js)
    moments: {
      runs: [8, 10, 12, 15, 20],         // unanswered points that make a run event
      milestones: [20, 30, 40, 50],      // a player's points
      clutchSecs: 120, clutchMargin: 5,  // the last two minutes of the fourth or overtime within five
      shotResultFallback: 2.5,           // a shot with no result from the court after this long gets one (s of game time)
    },
    // ---------------------------------------------------------------- debug console and tests (js/audio/debug.js)
    debug: {
      logSize: 400,              // events kept for the console and the trace
      recorderSeconds: 30,       // "Save last 30 s"
      meterFps: 20,
      logRows: 60,               // rows shown in the console
    },
  };
})();
