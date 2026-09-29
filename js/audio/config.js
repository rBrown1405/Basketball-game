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
    reverb: { seconds: 2.2, decay: 2.6, fadeInSamples: 400, returnGain: 0.32, hzStart: 9000, hzEnd: 1200 },
    // the buses: level (gain), how much goes to the reverb, how many sounds at once (cap)
    buses: {
      court: { label: 'Court', gain: 0.9, reverbSend: 0.55, cap: 16 },        // sneakers, ball, bodies, rim (each placed
                                                                              // sound adds its own room: court.place.wetFar)
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
    // (Trial 2: the court sounds are gated where they come from, js/audio/court.js, per player and per second, so
    // their cooldowns here only stop a double trigger of one contact)
    sounds: {
      dribble: { bus: 'court', prio: 20, cooldownMs: 60, max: 4, cutAtSpeed: 8 },
      bounce: { bus: 'court', prio: 25, cooldownMs: 30, max: 4 },
      squeak: { bus: 'court', prio: 18, cooldownMs: 0, max: 3, cutAtSpeed: 8 },
      step: { bus: 'court', prio: 10, cooldownMs: 0, max: 6, cutAtSpeed: 8 },
      land: { bus: 'court', prio: 28, cooldownMs: 0, max: 4, cutAtSpeed: 8 },
      catch: { bus: 'court', prio: 35, cooldownMs: 30, max: 2 },
      pass: { bus: 'court', prio: 22, cooldownMs: 30, max: 2, cutAtSpeed: 8 },
      body: { bus: 'court', prio: 30, cooldownMs: 0, max: 4, cutAtSpeed: 8 },
      fall: { bus: 'court', prio: 55, cooldownMs: 0, max: 2 },
      roll: { bus: 'court', prio: 12, cooldownMs: 0, max: 1, cutAtSpeed: 8 },
      rimroll: { bus: 'court', prio: 58, cooldownMs: 0, max: 1 },
      rim: { bus: 'court', prio: 60, cooldownMs: 30, max: 3 },
      board: { bus: 'court', prio: 55, cooldownMs: 30, max: 2 },
      swish: { bus: 'court', prio: 65, cooldownMs: 45, max: 2 },
      net: { bus: 'court', prio: 60, cooldownMs: 45, max: 2 },
      dunk: { bus: 'court', prio: 80, cooldownMs: 45, max: 2 },
      block: { bus: 'court', prio: 70, cooldownMs: 45, max: 2 },
      whistle: { bus: 'arena', prio: 90, cooldownMs: 45, max: 2 },
      buzzer: { bus: 'arena', prio: 92, cooldownMs: 300, max: 1 },
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
    // ---------------------------------------------------------------- the crowd's synthesized sounds (until
    // recordings replace them): levels, pitches and lengths of each recipe
    synth: {
      clap: { hzMin: 1500, hzRand: 600, q: 0.8, peak: 0.22, a: 0.004, hold: 0.02, rel: 0.09 },
      chantSyl: [[520, 2.4, 0.14, 0.04, 0.12, 0.2], [700, 2.4, 0.16, 0.04, 0.16, 0.25]],   // [Hz, Q, level, attack, hold, release]
      roar: [['bandpass', 1100, 0.55, 0.55, 0.12, 0.6, 0.8, 1.8], ['lowpass', 700, 0.6, 0.45, 0.1, 0.5, 0.8, 1.6], ['bandpass', 2600, 1.4, 0.12, 0.15, 0.4, 0, 1.2]],   // [filter, Hz, Q, level, attack, hold, hold x level, release]
      ooh: [[480, 3.5, 0.5, 380], [900, 4, 0.22, 700]], oohA: 0.12, oohHold: 0.35, oohRel: 0.8,    // [Hz, Q, level, end Hz]
      groan: { hz: 420, q: 3, peak: 0.35, a: 0.2, hold: 0.4, rel: 1.0, hzEnd: 260 },
      boo: [[300, 5, 0.4, 250], [620, 5, 0.18, 520]], booA: 0.3, booHold: 0.9, booRel: 1.2,
      murmur: { hz: 800, q: 1.2, peak: 0.18, a: 0.3, hold: 0.6, rel: 0.9 },
      testTone: { hz: 440, peak: 0.2, a: 0.01, hold: 0.3, rel: 0.1 },
    },
    // ---------------------------------------------------------------- the court (Trial 2: js/audio/court.js hears
    // the court and decides what sounds, js/audio/courtsynth.js makes the sounds). Speeds in ft/s, accelerations in
    // ft/s² (32.2 = 1 g), distances in ft, like the court itself.
    court: {
      // when: a court sound starts when its contact is on screen. The court runs fixed 1/60 s steps and the picture
      // is drawn between the last two, so the moment a contact shows is known to the step; a sound is scheduled that
      // far ahead (never more than maxAheadS) and never left later than staleS (then it is dropped: late is worse)
      // avOffsetMs moves every court sound scheduled ahead later (+) or earlier (-): -12 takes back the master's two
      // compressors' look-ahead (6 ms each, measured: tools/audio/test/court.js)
      sync: { maxAheadS: 0.1, staleS: 0.25, avOffsetMs: -12 },
      // where: the broadcast camera. A sound pans with where it is in the picture, and gets quieter, duller and
      // roomier the further it is from the camera (a TV mix follows the play: sounds off the picture drop more)
      place: {
        panWidth: 0.62,          // a sound at the edge of the picture pans this far (1 = all the way to one speaker)
        panMax: 0.8,             // off the picture
        refFt: 98,               // at this distance from the camera a sound is at its own level (the middle of the floor)
        rolloff: 0.9,            // level x (refFt / distance) ^ rolloff (1 would be the inverse distance law)
        minDb: -9, maxDb: 3,
        offDb: -5, offSpan: 0.35,  // off the picture: down to offDb once it is offSpan of the picture's width outside
        nearFt: 68, farFt: 125,  // the air and the room: from the near sideline to the far corner
        airNearHz: 18000, airFarHz: 5500,   // the high end falls off with distance (a lowpass)
        wetFar: 1.0,             // extra reverb send at farFt, from none at nearFt (the Court bus's own send is on top)
        height: 1,               // how much a sound's height counts in its distance (the rim is 10 ft up)
      },
      // the floor: every spot sounds a little different (a smooth random field, the same for an arena every game),
      // the paint and the centre logo are painted (a brighter slap), an arena can have dead spots (the ball bounces
      // hollow and dull there), and out of bounds the wood runs on for apronFt before the courtside seats and carpet
      floor: {
        fieldScaleFt: 11, fieldPitch: 0.035, fieldDb: 1.2,
        paintClick: 1.2, paintHz: 1.12,
        deadSpots: 2, deadRadiusFt: 2.2, deadThump: 0.9, deadRing: 0.45, deadDb: -2.5, deadDecay: 1.5,
        apronFt: 6, sideLpHz: 1300, sideDb: -6, sideRing: 0.25,
      },
      // dribbles: how hard (the ball's speed into the floor, time-scaled with the dribble) and how high and quick
      dribble: {
        vMin: 10, vMax: 32,      // impact speed range → energy 0.3..1.1
        eMin: 0.3, eMax: 1.1,
        topLow: 1.7, topHigh: 3.2,          // a dribble topping out at topLow ft is tight, at topHigh open
        periodQuick: 0.42, periodSlow: 0.8, // and a quick one (s per bounce) tighter than a slow one
        heightShare: 0.6,                   // tightness = heightShare x how low + the rest x how quick
      },
      bounce: { vMin: 3, vMax: 30, eMin: 0.08, eMax: 1.2, airZ: 1.6 },   // a "bounce" above airZ ft is not the floor (a block)
      // squeaks: a hard plant only, the animation's own "hard push" (Trial 4 of the animation gauntlet: 18 ft/s² or more
      // across or against the way the body goes, from jogging speed, 10 ft/s, up): a cut (turning), a stop (braking);
      // and a pivot (turning on the spot), a defender's slide step at speed, a jump stop (landing on the move). The
      // harder, the more likely, louder and longer; a player and the floor each only so often
      squeak: {
        minAccel: 18, fullAccel: 50,         // ft/s²: ~0.55 g .. 1.55 g
        minSpeed: 10, recentS: 0.35,         // jogging speed or faster within the last recentS (a stop is slowing down)
        chanceMin: 0.25, chanceMax: 0.8,     // odds at minAccel .. fullAccel (a hard plant does not always squeak)
        slideMinSpeed: 8, slideChance: 0.15, slideMinAccel: 12, slideSideways: 0.6,   // a defender sliding (moving sideways to his facing) at speed
        pivotYawRate: 5, pivotMaxSpeed: 2.5, pivotChance: 0.35,   // turning on the spot faster than this (rad/s)
        jumpStopSpeed: 9, jumpStopChance: 0.6,
        playerGapS: 0.6,                     // one player squeaks at most this often (game time)
        perSecond: 2.5,                      // and the floor at most this many a second (a sliding second of audio time)
        eMin: 0.15,                          // the quietest squeak played
        massK: 0.35,                         // a heavier body plants harder: energy x (mass ratio ^ massK)
        refs: false,                         // officials' shoes (they do not cut hard)
      },
      // footsteps: soft thuds from running bodies, heavier for bigger players; walking and the half-court shuffle are
      // left silent (the court mics pick up running and the stampede of a fast break)
      step: {
        minSpeed: 12, fullSpeed: 26,         // running .. sprinting
        eMin: 0.12, eMax: 1,
        perSecond: 5,                        // at most this many a second over the whole floor (the loudest go first)
        massK: 0.6,                          // level x mass ratio ^ massK, and a lower thud
        refs: 0.5,                           // officials' steps at this share (0 = none)
        minE: 0.1,                           // quieter than this is not played
      },
      land: { hMin: 0.4, hMax: 3.5, eMin: 0.2, eMax: 1.1, pairS: 0.09, massK: 0.6, airZ: 0.15 },   // landing from a jump of hMin..hMax ft; the other foot within pairS is the same landing
      catch: { vMin: 6, vMax: 44, eMin: 0.15, eMax: 1.1, looseSoft: 0.45 },   // the ball's speed into the hands; a loose ball picked up softer
      pass: { vMin: 14, vMax: 46, level: 0.55, whooshSpeed: 34 },
      // bodies: two players coming into contact (torsos closer than their radii) with closing speed past minClosing,
      // or a hit hard enough to knock one off balance; screens thud, box-outs and post-ups push
      body: {
        minClosing: 4, fullClosing: 15, radiusK: 1.08,   // contact when closer than radiusK x (0.15 H + 0.15 H)
        pairGapS: 0.7, playerGapS: 0.25,
        screenK: 1.2, boxoutK: 0.75, postK: 0.9,
      },
      fall: { level: 1 },
      roll: { minSpeed: 0.8, fullSpeed: 14 },
      // the rim: which part the ball hit, from the shot's line (front: the near side, back: the far side, else the side)
      rim: { frontFt: -0.3, backFt: 0.3, vMin: 6, vMax: 32, eMin: 0.25, eMax: 1.25, softE: 0.3, rattleE: 0.7 },
      board: { vMin: 8, vMax: 36, eMin: 0.3, eMax: 1.2 },
      // the officials: a whistle's length by the call (the ref's signal says which), the shot clock's buzzer at the
      // basket the offense attacks, the period horn over the arena
      whistle: {
        len: { foul: [0.48, 0.75], charge: [0.55, 0.8], violation: [0.32, 0.46], out: [0.28, 0.4], other: [0.3, 0.5] },
        mouthZ: 6.2,
      },
      buzzer: { z: 13.3 },
      hornFinalS: 4,             // a game-end horn this soon after the period horn is the same horn
      // sounds a pack can hold instead of the synthesized ones (assets/audio/court/<name>_01.ogg ...)
      takes: 12,                 // how many synthesized takes each sound has (fixed per sound, like recorded takes)
      noRepeat: 9,               // a take is not played again until this many others have (a shuffled round robin)
      jitter: { pitch: 0.025, gainDb: 1.5 },   // every hit: a little change of pitch and level on top of its take
    },
    // the models the court's sounds are made from (js/audio/courtsynth.js): frequencies in Hz, times in s, levels
    // linear. Each take draws its own share of every random range once (fixed), each hit adds the jitter above.
    courtSynth: {
      // a basketball (size 7, radius 0.119 m): a thump as it hits (the floor's give and the ball's squash), then its
      // pressurised air cavity rings (Russell, "Basketballs as spherical acoustic cavities": the modes of a sphere,
      // x c / 2 pi a); the pebbled cover slaps
      ball: {
        modes: [956, 1536, 2069, 2595, 2730, 3105, 3608, 4450],
        modeAmp: [1, 0.55, 0.8, 0.45, 0.35, 0.3, 0.22, 0.15],
        modeTau: [0.05, 0.04, 0.045, 0.03, 0.028, 0.024, 0.02, 0.016],
        ampRand: 0.45, tauRand: 0.3, detune: 0.008,
        thumpHz: [165, 62], thumpS: 0.045, thumpTau: 0.022,
        floorHz: 230, floorTau: 0.011, floorAmp: 0.35,
        clickHz: 3100, clickQ: 0.9, clickTau: 0.0035, clickAmp: 0.5,
        slapHz: 6500, slapTau: 0.002, slapAmp: 0.18,
        peak: 0.19, ringShare: 0.55, thumpShare: 0.9,
        seamShare: 0.3, seamRing: 0.6, seamClick: 1.35, seamClickHz: 0.75,   // a seam hitting the floor, not the pebbled panel
      },
      dribble: { level: 1, tightRing: [1.35, 0.55], tightThump: [1.15, 0.75], tightClick: [0.9, 1.2] },
      bounce: { level: 1.05 },
      catch: { slapHz: 1650, slapQ: 1.1, slapTau: 0.008, slapAmp: 1, thumpHz: 135, thumpTau: 0.016, thumpAmp: 0.5, ring: 0.3, ringTau: 0.45, peak: 0.22 },
      pass: { slapHz: 950, slapQ: 1, slapTau: 0.009, thumpHz: 120, thumpTau: 0.012, whooshHz: [700, 320], whooshQ: 0.8, whooshS: 0.16, whooshAmp: 0.18, peak: 0.1 },
      // a sneaker squeak: the sole sticks and slips over and over (Harvard, Nature 2026: detachment pulses at a few
      // kHz; the tread and the rubber set the pitch), a pulse train through the sole's resonance
      squeak: {
        harmonics: [1, 0.62, 0.42, 0.3, 0.22, 0.16, 0.12, 0.09],
        hz: [1650, 3000],        // the pulse rate from a light to a hard plant
        takePitch: 0.14,         // each take's sole: ± this share
        resHz: 3600, resQ: 2.2, hpHz: 900,
        jitterHz: [17, 41], jitterDepth: 0.035, rough: [48, 95], roughDepth: 0.35,
        cut: { s: [0.1, 0.2], shape: [1, 1.22, 0.92] },       // length, pitch at the start, middle and end
        stop: { s: [0.16, 0.32], shape: [1.12, 1, 0.74] },
        pivot: { s: [0.06, 0.11], shape: [1.2, 1.32, 1.18] },
        slide: { s: [0.045, 0.085], shape: [0.92, 0.98, 0.9] },
        jumpstop: { s: [0.08, 0.14], shape: [1.05, 1.02, 0.85], gap: 0.035 },
        a: 0.008, rel: 0.03, peak: 0.07,
      },
      // a rubber sole on a sprung wood floor: a low thud (lower and louder for a heavier body) and the sole's tap
      step: { thumpHz: [96, 58], thumpS: 0.05, thumpTau: 0.026, tapHz: 1150, tapQ: 1.2, tapTau: 0.006, tapAmp: 0.35, scuffHz: 3200, scuffTau: 0.01, scuffAmp: 0.08, peak: 0.09,
        gap: [0.008, 0.032], second: [0, 0.85],            // heel then forefoot: the gap, and the second's share (none below 0.1)
        knockHz: [260, 620], knockAmp: 0.35, knockTau: 0.012 },   // the floor board under the foot
      land: { thumpHz: [82, 44], thumpS: 0.09, thumpTau: 0.045, floorHz: 165, floorTau: 0.025, floorAmp: 0.45, slapHz: 720, slapQ: 1, slapTau: 0.01, slapAmp: 0.4, second: [0.005, 0.045], secondAmp: 0.7, peak: 0.16 },
      // bodies: a muffled thud of torsos and a jersey's rustle
      body: { thumpHz: [118, 70], thumpS: 0.05, thumpTau: 0.028, fleshHz: 480, fleshTau: 0.024, fleshAmp: 0.55, clothHz: 3000, clothQ: 0.7, clothTau: 0.04, clothAmp: 0.22, second: [0, 0.6], peak: 0.12 },
      fall: { thumpHz: [72, 38], thumpS: 0.12, thumpTau: 0.07, rumbleHz: 300, rumbleTau: 0.08, rumbleAmp: 0.6, handsHz: 1500, handsQ: 1, handsTau: 0.012, handsAmp: 0.45, handsAt: 0.04, skidHz: [2600, 1700], skidTau: 0.06, skidAmp: 0.15, second: [0.35, 0.8], secondAt: [0.05, 0.12], peak: 0.2 },
      // the rim: a steel ring (5/8 in rod, 18 in across) rings in its bending modes, n(n²-1)/√(n²+1) x 61 Hz; clamped
      // at the back, so each mode is split in two (the shimmer); the back of the rim is near the mount (stiffer:
      // shorter, more of the high modes, the board and the support thunk with it)
      rim: {
        modes: [164, 463, 888, 1436, 2106, 2900, 3815],
        split: [0.012, 0.03],
        front: { amp: [0.55, 1, 0.8, 0.55, 0.4, 0.28, 0.18], tau: [0.4, 0.34, 0.26, 0.19, 0.14, 0.1, 0.075], mount: 0.25, level: 1 },
        back: { amp: [0.25, 0.6, 0.72, 0.62, 0.5, 0.36, 0.25], tau: [0.2, 0.18, 0.15, 0.12, 0.09, 0.07, 0.055], mount: 0.85, level: 0.95 },
        side: { amp: [0.4, 0.85, 0.8, 0.6, 0.45, 0.3, 0.2], tau: [0.3, 0.26, 0.2, 0.15, 0.11, 0.085, 0.065], mount: 0.45, level: 0.95 },
        soft: { amp: [0.08, 0.35, 0.5, 0.45, 0.35, 0.25, 0.15], tau: [0.12, 0.11, 0.1, 0.08, 0.06, 0.05, 0.04], mount: 0.1, level: 1.6 },
        rattle: { amp: [0.2, 0.7, 0.75, 0.55, 0.4, 0.28, 0.18], tau: [0.16, 0.14, 0.12, 0.1, 0.08, 0.06, 0.045], mount: 0.3, level: 0.75 },
        ampRand: 0.3, tauRand: 0.2, detune: 0.015,
        tickHz: 3400, tickQ: 0.8, tickTau: 0.003, tickAmp: 0.35,
        mountHz: [125, 88], mountTau: 0.04, ball: 0.45,
        peak: 0.075,
      },
      // the glass: a tempered plate (72 x 42 x 1/2 in) in its frame, low plate modes (a thwack), the frame's rattle,
      // and the ball's own ring
      board: {
        modes: [37, 65, 111, 118, 146, 183, 255, 330], amp: [0.5, 0.8, 1, 0.7, 0.8, 0.55, 0.45, 0.3], tau: [0.14, 0.12, 0.1, 0.1, 0.085, 0.07, 0.06, 0.05],
        ampRand: 0.6, tauRand: 0.25, detune: 0.08,   // where the ball hits the glass: which modes it drives
        frame: [760, 1180, 1730], frameAmp: 0.12, frameTau: 0.05,
        clickHz: 2100, clickQ: 0.9, clickTau: 0.003, clickAmp: 0.6, ball: 0.75,
        peak: 0.07,
      },
      // the net: nylon cord dragged over the ball (a swish sweeps up as the ball speeds through), then the net whips
      // (a snap); a ball dropping in off the rim goes through slower and lower
      swish: { hz: [3300, 6400], q: 1.25, a: 0.03, hold: [0.06, 0.1], rel: [0.12, 0.2], airHz: 7200, airAmp: 0.3, snapHz: 1900, snapQ: 2, snapTau: 0.009, snapAt: [0.15, 0.22], snapAmp: 0.55, peak: 0.12 },
      net: { hz: [2300, 3900], q: 1.1, a: 0.05, hold: [0.05, 0.09], rel: [0.1, 0.16], airHz: 6000, airAmp: 0.15, snapAmp: 0.12, peak: 0.085 },
      // a dunk: the rim slammed (a front-iron ring, shortened by the hands), the breakaway rim's rattle against its
      // stops (the real modes are ~24 and ~33 Hz), the glass and stanchion shaking (the plate's lowest modes), the
      // net whipped
      dunk: { slamE: 1.3, slamTau: 0.6, rattle: { n: [5, 8], hz: [24, 33], decay: 0.62, amp: 0.55 }, rattle2: { at: 0.23, amp: 0.35 }, shake: { hz: [37, 65], tau: 0.38, amp: 0.8, frameHz: [150, 290], frameAm: 12, frameAmp: 0.18 }, net: 1.25, peak: 1 },
      block: { slapHz: 1400, slapQ: 1, slapTau: 0.009, slapAmp: 1, thumpHz: 150, thumpTau: 0.012, thumpAmp: 0.5, ring: 0.8, peak: 0.2 },
      // rolling: the floor (a low rumble, the seams) and the rim (the ring's modes, rubbed)
      roll: { lpHz: 650, bpHz: 170, bpQ: 1.2, seams: 2, amDepth: 0.55, peak: 0.05 },
      rimroll: { modes: [463, 888, 1436], q: 28, am: [13, 21], amDepth: 0.6, peak: 0.07 },
      // a referee's whistle: pealess (three chambers a little apart beat against each other: the harsh warble), a
      // breath, a quick chirp as it starts
      whistle: { hz: [2880, 3060], chambers: [1, 1.017, 1.034], chamberAmp: [1, 0.7, 0.5], h2: 0.14, breathHz: 3000, breathQ: 1.5, breathAmp: 0.12, chirp: [0.93, 0.02], wobble: [4, 7], wobbleDepth: 0.08, a: 0.008, rel: 0.035, peak: 0.085,
        sagShare: 0.45, sag: [0.02, 0.07], sagS: 0.08 },   // some blasts sag in pitch at the end as the breath runs out
      // the shot clock: a rough square buzzer (two a few Hz apart, mains hum on it)
      buzzer: { hz: [575, 610], beat: 5.5, am: 120, amDepth: 0.4, harmonics: [1, 0, 0.33, 0, 0.2, 0, 0.14, 0, 0.11], lpHz: 4800, s: [0.95, 1.1], a: 0.012, rel: 0.06, peak: 0.05 },
      // the arena horn: a brassy chord, the pitch swelling up as the air comes in
      horn: { hz: [[220, 1], [277, 0.75], [330, 0.6], [440, 0.3]], take: 0.03, lpHz: 1700, swell: [0.94, 0.06], vib: [5.2, 0.005], a: 0.04, s: [0.95, 1.6], rel: 0.25, peak: 0.05, topShare: 0.5,
        swellDepth: [0.88, 0.97], attack: [0.02, 0.08] },   // one horn: the operator's hold, and how the air swells in
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
