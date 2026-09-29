# The NBA audio gauntlet

The plan to make a live game sound like an NBA broadcast (the court, the crowd, the arena, the players and a two
person commentary team), run as trials with pass/fail criteria. Each trial: plan (approved before any code), build,
listen test (a log of every sound with the game event that triggered it), devil's advocate critique, fix, grade,
regression check. Ground rules: build on the existing audio system; everything free (license of every model,
library and sound pack checked and recorded); no real person's voice cloned or imitated; every sound driven by a
game or animation event; every tunable in one config; no PASS without proof; audio never costs a frame.

## Trial 0: the audit

### The platform and the audio system today

- **Platform**: a browser game, plain JavaScript with no build step and no dependencies. It runs by double-clicking
  `index.html` (a `file://` page, no server, no internet), or from a local web server. The court is drawn by the
  game's own Canvas 2D and WebGL renderer (`js/match/*`); the live screen is `js/ui/live.js`.
- **Audio**: the Web Audio API, all of it synthesized in code. There is not a single audio file in the project.
  - `js/ui/arenaaudio.js` (`PBC.ArenaAudio`, 289 lines): one `AudioContext` created on the first click; a master
    gain into a `DynamicsCompressor` (threshold -18 dB, ratio 3.5) into the speakers; two submixes, `sfx` (court
    sounds) and `crowdBus`, each sent dry and into a convolution reverb built from a generated noise impulse
    (2.2 s). Oscillators, white and pink noise buffers and biquad filters make every sound.
  - `js/ui/commentary.js` (`PBC.Commentary`, 687 lines): the two person booth. Lines are spoken by the browser's
    own speech engine (the Web Speech API, `speechSynthesis`), which plays through the operating system, outside Web
    Audio. Optional paid voices (OpenAI or ElevenLabs with the player's own key) decode into a second, separate
    `AudioContext` wired straight to the speakers.
  - `js/mini/core.js` has a third small Web Audio setup for the practice mini-games (beeps and a crowd); it is not
    part of the live broadcast.

### Every sound that exists now

Court sounds are requested by the court through `view.sound(name, volume)` (`js/match/view.js:131`), which
`live.js:283` forwards to `ArenaAudio.play`. Only a name and a volume travel: no position, no player, no time.
During instant replays the court is silent (`view.js:132` returns early).

| Sound | Triggered by | How it is made (`arenaaudio.js`) | How it sounds |
|---|---|---|---|
| Dribble | the ball touching the floor on a dribble (`ball.js:766`), volume from the dribbler's speed | a 120 Hz sine thump sliding to 55 Hz plus a band-passed noise click (`:123`) | a soft synthetic thud; every bounce the same recipe, only the volume changes |
| Loose ball bounce | the ball bouncing off the floor (`ball.js:630`), volume from its vertical speed | the dribble recipe, a little lower (`:127`) | same thud |
| Sneaker squeak | **a random timer**: every 0.7 to 3.1 s while the game runs (`:262`) | a 1.9 to 2.8 kHz sine gliding up with a 45 to 75 Hz wobble (`:128`) | a chirpy beep, like a toy; nothing to do with anyone's feet |
| Rim | the ball touching the rim in flight (`ball.js:636`), softer for a soft roll | five inharmonic sines (520 Hz to 4.3 kHz) plus a noise tick (`:134`) | a bell-like clank |
| Backboard | the ball hitting the board (`ball.js:638`) | a 170 Hz sine plus band noise (`:138`) | a dull thump |
| Swish / net | the ball through the net (`ball.js:646`): swish if clean, net (with a small rim) if not | high band-passed noise sweeps (`:139`, `:140`) | a hiss; readable as a swish |
| Dunk | the dunk hitting the rim (`choreo.js:2078`) | a loud rim, a board and an 80 Hz boom together (`:141`) | a big clank; no rattle or ring-out of a real rim |
| Block | the blocker's hand meeting the ball (`choreo.js:2042`) | a 140 Hz thump and a noise slap (`:142`) | a pop |
| Whistle | fouls (`choreo.js:2553`) and turnovers that stop play: violations, out of bounds, charges (`:2401`, `:2475`) | two detuned 3 kHz sines with a 28 to 36 Hz tremolo (`:143`) | a convincing pea whistle, the best sound in the set |
| Horn | end of a period (`choreo.js:2775`), shot clock violation (`:2475`), final (`live.js:1211`) | three filtered sawtooth tones for 1.3 s (`:153`) | a synth horn; the same sound for the shot clock and the period |
| Crowd bed | always on | three looping filtered noise layers (380 Hz low-pass, 900 Hz and 1.9 kHz band-pass) with slow wobble (`:74`); level from playoff stakes, "close and late" and a decaying excitement value (`:246`) | a steady wind or air-conditioning rumble; no voices, no chatter |
| Crowd roar / ooh / groan / boo / murmur | game events (`:212`): home scores roar (bigger for dunks, threes and and-ones), away scores murmur or groan, blocks, steals, **missed threes (at the release)**, fouls on the home team boo 55% of the time, free throws, timeouts | swells of band-passed noise with envelopes (`:166`); "ooh", "groan" and "boo" are the same noise through narrower filters | noise swells; the roar is surf or wind, the boo a low hum |
| "DE-FENSE" | every 9 to 19 s while the away team has the ball in a close or big game, with an 18% to 38% chance (`:256`) | three bars of claps (noise bursts) with two noise "syllables" (`:186`) | rhythmic clapping with no voices |
| Game end | the final (`live.js:1211`) | the horn, then one or two roars for a home win, a groan for a loss (`:266`) | noise swell |

Not in the game at all: footsteps, landings, catches, passes, body contact on screens and box-outs, players hitting
the floor, the ball rolling or bouncing out of bounds, a rim rattle or backboard shake, the shot clock buzzer (the
period horn is reused), any public address announcer, any arena music, organ or stingers, any player voices, any
crowd voices or chants with words.

### How the commentary works

- **Who**: two named announcers per league (`commentary.js:47`): the men's league has "Marv Delaney" (play-by-play)
  and "Reggie Knox" (analyst), the women's "Ann Kessler" and "Tasha Monroe". Captions show on the broadcast
  graphics.
- **What they say**: `onEvent` (`:467`) turns each court event into a line: the shot setup at the release ("Collins
  for two..."), the result (the miss at the release, the make when the ball goes through), rebounds, steals and
  other turnovers, fouls, free throws, timeouts, substitutions; the analyst adds a line after some scores (a
  milestone of 20, 30 or 40 points, a dunk, an and-one, a hot three-point night, an assist leader, a personality
  "blurb", a stat line), a run of 8 or more points, foul trouble, "the story of the night" once per game (a hot or
  cold shooting team or an upset brewing), a halftime and end of quarter summary, the intro (the arena, records,
  the stars' averages), playoff stakes, replays and the final.
- **How lines are chosen**: `pick()` takes one phrasing at random from a small list per situation (a made two has 6,
  a made three 8, a missed three 7, a dunk 6, a layup 5, a hook 2); there is no memory of what was said except a
  few once-per-game flags. Numbers and names come from the live box score.
- **Timing**: a priority queue (`say`, `:226`): priorities 1 to 10, a time-to-live per line (stale lines are
  dropped), at most 3 lines waiting, a big call (priority 8 and up) cuts off minor chatter (4 and below), 220 ms
  between lines. At 4x speed only priority 7 and up is said, at 8x only 9 and up.
- **Voices**: the browser's speech voices. The code scores the installed voices (Edge "Natural" neural voices and
  Apple Premium voices first) and gives the two announcers different ones with a different rate and pitch; if the
  machine has only one good voice, the analyst is the same voice pitched down. "Excitement" is a flag that speeds
  the play-by-play up from 1.06 to 1.14 and raises the pitch from 1.0 to 1.08. Optional paid voices (OpenAI
  `gpt-4o-mini-tts` with a written delivery instruction, or ElevenLabs) use the player's own API key; a line waits up
  to 1.4 s for its audio, then falls back to the browser voice. The file's header says the audio for a possession is
  requested when the possession starts; the code requests it only when the line is queued, so it is not prefetched.
- **Ducking**: while a line plays, the crowd bed's target level drops by 45% (`arenaaudio.js:248`, `:265`); crowd
  reactions are not ducked.

### Listen test of the current audio

A live game (Boston home against Utah) played in a headless Chrome at 1x for 150 s with every court sound request,
every event the audio system received and every commentary line logged with its time, and the game's own audio
output tapped and recorded for 60 s (`current_audio.wav`, `current_audio_trace.txt`; browser speech cannot be
captured by a page, so the recording has no commentary). No game code was changed for the test.

- **Commentary spoils the result**: a missed home three was called "Rattles out." at the release (72.20 s), 1.23 s
  before the ball reached the rim (73.43 s). The crowd's "ooh" for a missed home three also fires at the release
  (`arenaaudio.js:223`; the court sends the shot event the moment the ball leaves the hand, `choreo.js:1865` and
  `:166`).
- **Commentary says what did not happen**: a made away three hit the rim (145.78 s) and dropped; the call was
  "Nothing but net!" (146.42 s). The made-shot lines are picked at random, whatever the ball did.
- **A broken line**: "Mills he likes the spotlight on himself." (a name glued to a personality blurb).
- **Late calls**: "Collins knocks it down." came 0.65 s after the swish because it waited behind the setup line.
- **Squeaks are random**: 74 squeaks in 151 s, one every 2.1 s (median), 11 of them during dead balls with nobody
  moving (from 46.8 s to 55.7 s after a turnover, while the ball was being taken out).
- **Dribbles are in sync** (they come from the ball's floor contact) but identical apart from volume: 117 dribbles,
  a bounce every 0.67 s.
- **The mix** (60 s): -33.3 dBFS RMS and peaks at -9.9 dBFS, about 15 to 18 dB quieter than streaming loudness;
  left and right correlate at 0.984 (almost mono); 65% of the energy is below 300 Hz and only 10% between 300 Hz and
  3 kHz, where human voices (and so a real crowd) live; nothing above 8 kHz.

A second run logged a whole first quarter at 1x (another league, 16.6 minutes of real time, the game clock from
12:00 to 1:07):
- **The booth is one voice**: 69 lines, 64 from the play-by-play and 5 from the analyst (one every 3 minutes), and
  the two never talk to each other. Exact repeats were rare in one quarter (3 lines said twice), but the calls are
  short templates ("Name for two...", "Name knocks it down.").
- **Misses called early, every time**: 22 missed shots, 4 of them called, all 4 before the ball reached the rim
  (0.95 s early at the median).
- **Squeaks**: 521 in the quarter, 31 a minute.

### The top 10 things that make it sound fake (worst first)

1. **The announcers sound like a computer reading a script.** Browser speech is flat or robotic on many setups
   (the older Windows voices, Chrome's own voices, Linux); only Edge's "Natural" voices and Apple's Premium voices
   come close, and even they read every line in the same calm tone. Both announcers are often the same voice pitched
   differently; "excitement" is an 8% speed-up. It sits outside Web Audio, so it cannot be EQ'd, compressed, ducked
   properly, metered or recorded.
2. **The crowd is not people.** Every crowd sound is filtered noise: the bed is wind, the roar is surf, the boo a
   hum, "DE-FENSE" is claps with no voices. No chatter, no individual yells, no words.
3. **The commentary gets the timing and the facts wrong**: misses called before the ball reaches the rim (and the
   crowd groans early too), "Nothing but net" on a make off the rim, made calls late behind setup lines.
4. **The commentary is thin and one-sided**: the analyst speaks once every few minutes (5 of 69 lines in a
   quarter) and the two voices never talk to each other; 2 to 8 short phrasings per situation with no memory,
   occasional broken lines, a handful of storylines, nothing that makes one game sound different from another.
5. **Squeaks come from a timer**, not from feet: a steady squeak every two seconds, including dead balls. The
   animation already knows every foot plant (`actor.js:1081`, `:1257`, `:1413`) but tells nobody.
6. **There is no arena**: no PA announcer, no music, organ or stingers in timeouts and dead balls, one synth horn for
   everything; timeouts are a murmur.
7. **The crowd does not follow the game**: it only swells for home baskets and a few big plays; no rise while a
   big shot is in the air, no hush at the free throw line, no silence during an away run, no chants with words
   (MVP, LET'S GO, AIR BALL).
8. **Court sounds are thin, incomplete and all in one place**: one synthesized recipe per sound; no footsteps,
   catches, passes, contact or falls; nothing is panned or placed by where it happens on the floor.
9. **The mix is quiet and flat**: 15 to 18 dB under broadcast loudness, almost mono, commentary level set by the
   speech engine on its own, ducking an on/off dip of the bed only.
10. **The players are silent**: no screen calls, no "shot!", no grunts, no and-one yells.

Also against the ground rules: the men's booth names ("Marv" and "Reggie") point at a real network pairing, and the
calls borrow at least one real announcer's signature call ("BANG!"). Both should become original. The paid voice
services are optional and not free, so they cannot be the answer for the voice trial.

### What will block the later trials

1. **No event bus.** Events travel by direct calls (`live.js:705` hands each court event to the graphics, the booth
   and the arena audio); court sounds carry only a name and a volume; the animation's foot plants, landings,
   catches and contacts are not published at all; replays suppress all court sound.
2. **Two audio worlds and no mixer.** Browser speech plays outside Web Audio (no web standard lets a page route or
   capture it), paid voices use a second `AudioContext`, the arena has two submixes; there are no Court, Players,
   Crowd, Arena and Commentary buses, no master limiter, no way to mute, solo, meter or record them.
3. **No voice limiting or priority.** Every sound builds new nodes; the only guard is a per-name cooldown (90 ms
   dribble, 120 ms squeak, 45 ms others); nothing caps voices or protects important sounds.
4. **Timing on page timers.** Boos (`setTimeout` 250 ms), commentary pacing and watchdogs run on `setTimeout`, not on
   the audio clock or the game clock, so pausing and 2x to 16x speeds bend them.
5. **No assets and a `file://` game.** Double-click play means `fetch` and `XMLHttpRequest` of local files are
   blocked and a media element's audio reads as silence (CORS), so sound files and voice models cannot simply be
   loaded; they have to be embedded in script files (as the 3D body data already is) or read from a local server.
6. **No single config**: gains, probabilities, cooldowns and thresholds are numbers scattered through the two files.
7. **No debug tools**: no event log, meters, mute/solo or recorder.
8. **Game speed and pause are handled ad hoc** in each file (squeaks and dribbles off at 8x, commentary filtered
   by priority, master at 35% while paused, scheduled one-shots keep playing).

### Proposed plan for Trial 1: the foundation

Build the plumbing everything else plugs into, on top of `arenaaudio.js` and `commentary.js` (their sounds stay as
the default voices until recordings replace them in later trials). Double-click play keeps working, no third-party
assets or libraries are added, and the game should sound the same as today apart from smoother ducking and the miss
reactions waiting for the ball to arrive, so the trial can be checked side by side with the recording above.

1. **One config** (`js/audio/config.js`, `PBC.AudioConfig`): every tunable with a name and a comment: bus levels,
   the limiter, ducking amounts and times, voice caps, per-sound cooldowns and priorities, and today's crowd levels,
   reaction sizes, chant timing and odds, pause level and speed thresholds, moved out of the two files at the same
   values.
2. **The event bus** (`js/audio/bus.js`, `PBC.AudioBus`): `on`, `off`, `emit`, every event stamped with real time,
   audio time, period and game clock, and where known a court position, a player and a team. Publishers:
   - `game.*`: every event the court already hands on (tip, inbound, pass, screen, shot at the release, score,
     rebound, turnover, foul, free throw, timeout, substitution, end of period), plus derived ones worked out from
     them: a run, a lead change, a tie, a player milestone, clutch time. The shot is split in two: `game.shot` at the
     release carries no result, and a new `game.shotResult` comes when the ball reaches the rim or the net (made or
     missed, swish, in off the rim, air ball, blocked), so nothing can react before the ball gets there. The booth's
     miss call and the crowd's "ooh" move to it (with the ducking, the only audible change in Trial 1);
   - `court.*`: dribble, bounce, rim, board, swish, net, dunk, block, whistle, horn, now carrying the ball's or the
     player's position;
   - `anim.*`: foot plants (with the foot's speed, the body's braking and turning), jump landings, catches and pass
     releases, taken from the three places the animation plants a foot. Trial 1 only logs these; Trial 2 gives them
     sounds.
   The arena audio and the booth subscribe through the bus instead of being called directly from `live.js`.
3. **The mixer** (`js/audio/mixer.js`, `PBC.AudioMixer`): one shared `AudioContext` with Court, Players, Crowd,
   Arena and Commentary buses into a Master bus, then a limiter, then the speakers. Each bus has a fader, mute,
   solo, a meter and a send to the arena reverb (today's generated impulse). Court sounds go to Court, the crowd to
   Crowd, the whistle and horn to Arena, the optional paid voices to Commentary in the same context (no second
   context). Browser speech cannot enter any web audio graph, so until Trial 7 replaces it the Commentary bus drives
   it from outside: its fader, mute and solo set the speech volume, its meter shows when it speaks, and ducking keys
   off it.
4. **Voice limits and priority** (in the mixer): every one-shot goes through one `play()` that checks the sound's
   cooldown and instance limit, the bus cap and a global cap (48 voices to start); each sound has a priority, and when
   a cap is hit the lowest priority voice fades out in 15 ms to make room, so a whistle, a horn or a big crowd
   reaction is never cut off by a dribble. Today's synthesized sounds are wrapped so the manager can count and stop
   them.
5. **Ducking**: while commentary speaks the Crowd bus drops a set number of decibels (a start of -6 dB, attack 80 ms,
   release 450 ms, smoothed so it does not pump) and future arena music drops more; a crowd reaction marked big lifts
   the duck while it lasts, so a roar can push back through the voice. This replaces the on/off 45% dip of the bed.
6. **Audio clock timing**: delayed sounds (the boo after a call, the chant claps) are scheduled on the audio clock
   instead of `setTimeout`; pause and game speed go through the mixer.
7. **Debug tools** (a 🎚️ button and the A key in the live view): an audio console with the event log (each event,
   the sounds it triggered with their bus and priority, and any it suppressed and why: cooldown, voice cap, muted),
   meters per bus, mute and solo buttons, voice counts and the current duck; "Save last 30 s" writes a WAV of the
   master from a rolling recorder (browser speech not included until Trial 7); and `PBC.AudioDebug.trace()` for the
   automated listen tests.
8. **Asset loader** (`js/audio/assets.js`) and packer (`tools/audio/pack.js`): folders
   `assets/audio/{court,crowd,chants,chatter,arena,commentary}/`, each with a `LICENSES.md` listing every file's
   source, author and license. The packer turns a folder into a script file (`js/audio/packs/<folder>.js`, the audio
   base64-encoded) so double-click play can load it the same way the 3D body data loads; packs load on first use,
   variations are grouped by name and never repeat back to back, with pitch and volume jitter from the config. A
   missing pack or sound falls back to today's synthesized sound. Trial 1 ships only a tiny test pack made from our
   own generated tones (no outside license); real recordings start in Trial 2, each license checked first.

How Trial 1 will be proven:
- **Mute and solo**: an automated browser test mutes and solos each bus during a live game and reads the meters
  (signal only on the soloed bus, silence on a muted one), with a 30 s recording per bus; the same buttons are in the
  console for you.
- **Event log**: a saved trace from a live game with every event and the sounds it triggered or suppressed, stamped
  with real time, audio time and game clock.
- **No frame drops**: frame times of the live view with the new audio on and off, same game, 2 minutes at 1x and at
  4x: the 95th and 99th percentile frame times and the count of frames over 33 ms must match within noise; the
  audio's own main-thread time per frame measured (target under 0.5 ms); voice counts never over their caps.
- **Nothing broken**: the engine is untouched (same games); today's recording and a Trial 1 recording of the same
  moments compared sound by sound (same sounds, loudness within 1 dB, only the duck changed).

### Research behind the audit

- No web standard lets a page route or record the browser's speech output; it plays through the operating system.
  ([WICG speech API issue 69](https://github.com/WICG/speech-api/issues/69),
  [Web Audio API issue 1764](https://github.com/WebAudio/web-audio-api/issues/1764),
  [MDN: Using the Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API/Using_the_Web_Speech_API))
- A page opened from a `file://` address cannot `fetch` files next to it (CORS needs http or https), and a media
  element's audio reads as silence in Web Audio for the same reason, so audio for double-click play has to be
  embedded in script files. ([MDN: CORS request not HTTP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS/Errors/CORSRequestNotHttp),
  [MDN: decodeAudioData](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/decodeAudioData))
- Ducking that moves over longer times (past about 200 ms) is heard as the background pumping, so the duck needs a
  fast attack, a smooth release and a modest depth. ([Automixer](https://en.wikipedia.org/wiki/Automixer))
- Free sound sources for the later trials, licenses checked: the BBC Sound Effects archive is personal, educational
  and research use only (RemArc licence), so it is out; the Sonniss GDC bundles are royalty free for commercial use
  with no attribution, but the sounds may not be resold or handed out as sound files on their own, so raw files
  should not sit in a public repository; CC0 recordings (Freesound's CC0 filter, Kenney) are the safest.
  ([Avosound: RemArc licence](https://www.avosound.com/en-us/licensing/remarc-license),
  [Sonniss GDC bundle license](https://sonniss.com/gdc-bundle-license/))
- A free voice that runs inside the browser exists: Kokoro (82M parameters, Apache 2.0, 54 preset voices) runs
  through kokoro-js on WebAssembly or WebGPU, about 86 MB quantized; it is a candidate for Trial 7, along with
  pre-generating the stock calls and every name in the game's name pools (373 last names) ahead of time.
  ([kokoro-js on npm](https://www.npmjs.com/package/kokoro-js),
  [Kokoro.js announcement](https://huggingface.co/posts/Xenova/503648859052804))

## Trial 1: the foundation

Built on the existing `arenaaudio.js` and `commentary.js` (their sounds and lines are unchanged): one event bus
everything publishes to, one mixer with the five buses, voice limits with priorities, ducking, a debug console with a
rolling recorder, and a loader for licensed sound packs. The only intended audible changes: the crowd's and the
booth's reactions to a miss or a block wait for the ball to get there, and the ducking.

### What was built

```
 court (view.js, ball.js, choreo.js, retro.js, actor.js)       live view (live.js)
   court.* sounds + position    anim.* plants, landings,          game.* events ──> tracker.js ── game.shot (no result)
   and player                   catches, passes                                                  game.shotResult (at the rim)
          │                          │  (built only when                                         game.run / leadChange / tie /
          │                          │   someone listens)                                        milestone / clutch
          ▼                          ▼                           live.* intro, possession, break, replay, jump, final...
 ┌──────────────────────── PBC.AudioBus: every event stamped with real time, audio time, period, game clock ────────┐
 └──────────┬───────────────────────────────┬────────────────────────────────────┬─────────────────────────────────┘
      arenaaudio.js                    commentary.js                       debug.js (console, traces)
            │ play() each sound             │ premium voices; browser speech (outside Web Audio: the
            ▼                               ▼  Commentary bus sets its volume, and it keys the duck)
 PBC.AudioMixer: Court | Players | Crowd | Arena | Commentary
   each bus: bed/continuous input + one-shot input (each with its own duck) → fader → mute/solo gate → meter
            └─ send → arena reverb ─┐
 Master: volume (x0.35 paused) → the arena's glue compressor → limiter (-1.5 dB, its makeup gain taken back) → speakers
                                                                            └─ rolling recorder (last 30 s)
```

- **The event bus** (`js/audio/bus.js`): `game.*` (every event the court shows, plus the moments the tracker works out:
  a run of 8, 10, 12, 15 or 20 unanswered points, a lead change, a tie, a player reaching 20, 30, 40 or 50, clutch
  time), `court.*` (the court's sounds, now with the ball's or the player's position and the player), `anim.*` (foot
  plants with speed, braking and turning, jump landings, catches, pass releases: logged for Trial 2, built only when
  someone listens), `live.*` (the broadcast around the game), `timer.*` (the two sounds still on a timer: squeaks,
  Trial 2; the DE-FENSE claps, Trial 4) and `booth.say` (each line as it starts). Every sound request is written into
  the event that asked for it, with its bus and priority, or why it did not play.
- **The shot split** (`js/audio/tracker.js`): `game.shot` goes out at the release with no result in it;
  `game.shotResult` when the court says the ball got there: a make at the net, a miss at its first contact with the
  rim or the glass, an air ball as it passes the rim, a block at the blocker's hand (`ball.js` `shotCue`,
  `choreo.js reportScore`, `retro.js`). A shot the court never reports (text mode, a skipped presentation) gets its
  result from the next event or after 2.5 s. The crowd's "ooh" and the booth's miss and block calls moved to it.
- **The mixer** (`js/audio/mixer.js`): one AudioContext for the arena and the premium voices (the second context is
  gone), the five buses into the master with the arena's compressor and a limiter. Mute and solo ramp in 8 ms.
- **Voices**: every one-shot goes through `play()`: its cooldown, its own limit, the bus's cap, the global cap of
  48. When a cap is hit a sound only takes the place of a lower-priority one, faded out in 15 ms; a sound can never
  displace an equal or higher one.
- **Ducking**: while the booth talks the crowd bed drops 6 dB and crowd reactions 3 dB (attack 80 ms), held through
  the whole exchange (1 s after a line) and back up over 1 s; a big reaction (a home dunk, three, and-one, a block,
  the final) lifts the duck for 1.5 s and hands back to the voice over 0.8 s.
- **Audio clock**: the delayed boo after a call against the home team, the second roar at a home win and the chant's
  claps are scheduled on the audio clock (no `setTimeout`); game speed and pause go through the mixer.
- **The audio's own random numbers** (`js/audio/random.js`): the crowd, the booth, the synthesized sounds and the
  personality lines (`persona.js blurb`, which now takes a random source) no longer draw from `Math.random`, which
  the court also uses. Before, switching the arena sound on changed how the court played every seeded game.
- **One config** (`js/audio/config.js`, `PBC.AudioConfig`): bus levels, reverb, limiter, voice caps, every sound's
  bus, priority, cooldown and limit, the duck, the crowd levels and reaction sizes, chant and squeak timing, every
  synthesized recipe's numbers, the moment thresholds, the console. Moved out of the two files at the same values.
- **The audio console** (`js/audio/debug.js`, the A key or the 🎚️ button in a live game): the event log with the
  sounds each event played or refused, filters, meters per bus and master, faders, mute, solo, a test tone per bus,
  voice counts, the limiter and the duck, and "Save last 30 s" (a WAV of the master from a recorder that always
  keeps the last 30 s, in an AudioWorklet so it costs the page nothing until it is saved). Browser speech is not in
  the WAV: it plays outside Web Audio until Trial 7.
- **Sound packs** (`js/audio/assets.js`, `tools/audio/pack.js`): `assets/audio/{court,crowd,chants,chatter,arena,
  commentary,test}/`, each with a `LICENSES.md` table; the packer refuses any file without a row or with a license
  the game cannot ship (only CC0 / public domain, CC BY with the credit, or made by this project) and writes a script
  the game loads even from `file://`. Takes are grouped by name, never repeat back to back, and get a little pitch
  and level jitter; a missing sound falls back to the synthesized one. The only pack is `test`: three tones made by
  `tools/audio/testpack.js` (no outside material), used by the console's test buttons.
- **Tests anyone can run**: `tools/audio/test/*.js` (see `tools/audio/README.md`), results in `audit/audio1/`.

New assets and their licenses: `assets/audio/test/tone_01.wav` to `tone_03.wav`, generated by this project. No
libraries, models or recordings from anywhere else.

### Listen test

`node tools/audio/test/listen.js`: seed 21 (the same game as Trial 0's recording), 1x, 150 s, booth on (headless
Chromium has no voices, so a stand-in speech engine with a real one's timing), arena sound on. Every event on the bus
with the sounds it played, stamped with real time, audio time and game clock: `audit/audio1/listen_trace.txt` (5,716
events, the 5,323 foot plants in `listen_trace_anim.txt`), the summary in `listen_result.txt`, and the recordings
`listen_60s.webm` (the speakers) and `listen_last30.webm` (the mixer's own "last 30 s"). A missed three, as logged:

```
 real s  audio s  clock        event              what                        | sounds
 71.725   70.621  Q1 11:12.4   game.shot          Jenkins 3pt catch_shoot BOS |
 72.951   71.851  Q1 11:11.5   court.rim          v 1 at 88.5, 25.7, 10.4 ft  | rim→court p60
 72.952   71.851  Q1 11:11.5   game.shotResult    Jenkins miss, rim (court)   | crowd.ooh→crowd p50; booth.pbp→commentary p4 queued
 72.953   71.851  Q1 11:11.5   booth.say          pbp: "Front rim." (browser, waited 0 ms)
 73.379   72.272  Q1 11:11.2   court.rim          v 0.6 at 88.9, 24.5, 10.4 ft | rim→court p60
 73.642   72.542  Q1 11:11.1   game.rebound       def. Dunn                   | booth.pbp→commentary p3 queued
```

The "ooh" and "Front rim." now come with the rim hit, 1.2 s after the release; in Trial 0 they came at the release.
All six shots in the test got their result from the court at the moment the ball arrived (makes at the net after
0.3 s for dunks and 0.9 to 2.0 s for jumpers, misses at the rim after 1.2 s). The mixer played 219 sounds, never more
than 3 at once, stole nothing and refused nothing; the crowd sat 5.5 dB down (the bed) and 2.8 dB (reactions) while
the booth talked and within 0.7 dB of full level while it was quiet, with no chops.

### Devil's advocate: what a fan would say, and the fixes

The first listen test of the finished build (the booth talking through a stand-in speech engine, the crowd duck
read every 100 ms) and a scripted test of the duck (`tools/audio/test/duck.js`, the same timeline of lines and
roars with the first settings and the fixed ones, `audit/audio1/duck_result.txt`) found three things:

1. **"The crowd keeps surging between the announcer's sentences."** Two lines 0.7 s apart: the crowd came back up to
   -1 dB and went down again in under a second (the duck held only 0.35 s and came back in 0.45 s). Fixed: the duck
   holds 1 s after a line and comes back over 1 s, so one exchange keeps the crowd down (voice-over ducking holds
   through the spoken passage and releases slowly: a common setting is 1.5 s hold, 1 s release). Surges on the
   script: 2 before, 0 after.
2. **"The roar on that dunk just cut off."** A big reaction lifted the duck for 1.2 s, then the duck snapped back
   down in 80 ms while the roar was still ringing: a 6 dB drop inside 0.2 s in the middle of the cheer. Fixed: the
   lift lasts 1.5 s (the swell of a big roar) and hands back to the voice over 0.8 s. Steepest fall on the script:
   6.0 dB in 0.2 s before, 2.7 dB after.
3. **"The cheers are smaller than they used to be."** Trial 0 ducked only the bed; the first Trial 1 build ducked
   the whole Crowd bus, so a regular home basket's cheer sat 6 dB lower under the call. Fixed: the Crowd bus has two
   inputs with their own duck, the bed 6 dB, the reactions 3 dB (past 6 to 8 dB ducking is heard as pumping; 2 to
   4 dB is the gentle range).

Found while checking the fixes: the reactions' duck could stay at its old level after a quiet spell. When the last
sound leaves a path Chrome switches that path off and its gain automation stops, so the next cheer started from
wherever the duck had been left (the console showed -3 dB for 20 s with the booth silent). Fixed with a silent
source into every bus input that keeps the paths running; on the script, after 6 s with nothing on the path both
ducks read 0.00 dB and the next cheer plays at full level.

Also heard, and left to the trial that owns them (each is noted where it belongs):
- the sneaker squeaks still come from a timer, not from feet (`timer.squeak` in the log): Trial 2, which now has
  every foot plant with its speed, braking and turning on the bus;
- the block sound plays at the release, 0.16 s before the ball meets the blocker's hand, and the ball's deflection
  plays a floor bounce: Trial 2 (ball sounds);
- the DE-FENSE claps are still a timer: Trial 4;
- the booth's set calls can come 1 to 1.5 s late when the queue is busy: Trial 8;
- the whole mix is quiet (about -38 dBFS RMS, far under broadcast loudness): Trial 9.

### Scorecard

| Criterion | Result | Evidence |
|---|---|---|
| Every bus can be soloed and muted during a live game | PASS | `mutesolo.js` clicks the console's own S and M buttons in a live game, a test tone on every bus: soloed, a bus is the only one with signal (every other bus -inf dB in all ~300 readings) and the master carries it; muted, a bus reads -inf while the others play. 10 of 10 (`audit/audio1/mutesolo_result.txt`), a 30 s recording per soloed bus (`solo_<bus>.webm`) |
| The event log shows events and the sounds they triggered, with timestamps | PASS | the console (A key) and `listen_trace.txt`: every event with real time, audio time and game clock and the sounds it played (bus, priority), queued (the booth) or refused (why) |
| No audio causes a frame drop | PASS | the audio's own main-thread time per frame: mean 0.03 ms at 1x and 0.06 ms at 4x, 99th percentile 0.3 and 0.5 ms (`perf_result.txt`); the same seeded game frame for frame with the audio on and off, two rounds each: on minus off at 4x +0.14 ms mean and +1.5 ms at the 99th percentile against a round-to-round spread of 1.6 and 7.2 ms with the same setting (at 1x the frames with audio were 1.1 ms faster, which is the noise), `perfsame_result.txt` |
| Audio event bus: the sim and animation publish, the audio subscribes | PASS | game.*, court.* (with positions), anim.* (plants, landings, catches, passes), live.*, and runs, lead changes, ties, milestones, clutch: counts in `listen_result.txt` |
| Buses Court, Players, Crowd, Arena, Commentary, Master | PASS | `js/audio/mixer.js`; the solo recordings |
| Voice limits and priority: minor sounds never cut off important ones | PASS | `voices.js` with the caps forced: a rim, board or swish takes a lower sound's place, a whistle and the horn take a roar's, a dribble never displaces a higher sound (refused: bus cap, voice cap), cooldowns, the 16x cut: 10 of 10 (`voices_result.txt`) |
| Ducking: the booth ducks the crowd gently, big moments push through | PASS | `duck.js` on a fixed script: bed -6 dB, cheers -3 dB, no surges between lines, a roar lifts the duck and eases back (`duck_result.txt`); in the live game -5.5 / -2.8 dB while the booth talks |
| Debug tools: log, meters, mute/solo, "last 30 s" recorder | PASS | the console (screenshots `console_solo.png`, `console_mute.png`); `listen_last30.webm` is the recorder's file |
| Asset loader from organized folders, licenses checked | PASS | `assets/audio/*/LICENSES.md`, the packer refuses unlisted or unshippable files; the test pack loads and plays through the console's test buttons |
| Every tunable in one config | PASS | `js/audio/config.js`; the A/B shows the move changed nothing |
| The game is untouched | PASS | `same.js`: seeds 21 and 33, audio all on / all off / arena only: the same play-by-play, box score and court fingerprint (`same_result.txt`); the gameplay audit (8 games, every field): Trial 1 with the sound on or off is the same games as the Phase 5 code (`audit_identity.txt`) |
| It sounds the same as Trial 0 apart from the planned changes | PASS | `ab.js` against commit 8baee19 with the same random variations: 17 sounds within 0.24 dB, the bed within 0.01 dB; only the duck differs (`ab_result.txt`) |

### Regression check

- **Trial 0** (the audit): still accurate as a record of the old code; its findings that Trial 1 changed are marked
  above (the shot reactions, the ducking, the second AudioContext, the config). Everything else it lists still holds
  and belongs to later trials.
- **Earlier game phases**: the engine and the court are unchanged: the gameplay audit plays the same 8 games as the
  Phase 5 code, field for field, frame counts included (`audit_identity.txt`, rerun on the final code:
  `8 the same, 0 different`). The old code itself did not pass this with its sound on: its audio drew from
  `Math.random` and every audited game played differently on the court.
- **Other ways to watch**: the retro court and the play-by-play only mode run with no errors; on the retro court
  every shot's result comes from the court (17 of 17), in text mode with the shot. Instant replays: no court, body
  or game audio events while a replay runs, the booth's replay lines still come.

### What to listen for

- **The console**: in a live game press **A** (or the 🎚️ button). Events scroll in with the sounds they played in
  green and the ones they did not in red with the reason. Press **S** on Crowd: only the crowd. **M** on Court: no
  dribbles, rims or squeaks. **▶** plays a test tone on that bus. "⬇ Save last 30 s" downloads a WAV of the arena
  sound (the browser voice is not in it).
- **A missed three**: the "ooh" (or the murmur when it is the away team's) and the booth's "Front rim" now come when
  the ball hits the rim, about a second after the release, not at the release. A blocked shot's crowd reaction comes
  when the ball meets the blocker's hand.
- **The booth talking**: the crowd dips gently (the bed 6 dB, cheers 3 dB), stays down through back-to-back lines
  instead of bobbing up between them, and eases back up about 2 s after the booth stops.
- **A home dunk, three or block**: the roar comes through the call at full level, then settles under the voice over
  about a second instead of being cut.
- **Everything else should sound exactly as before**: the same sounds at the same levels (the A/B in
  `audit/audio1/ab_result.txt`).
- **Still to come** (not this trial): squeaks that follow the feet, block and ball contact sounds at the right moment
  (Trial 2), the crowd bed (Trial 3), chants that follow the game (Trial 4), new voices (Trial 7).

## Trial 2: the court

Every sound the floor makes, from the court's own contacts, placed where it happens as the broadcast camera sees it.
Built on Trial 1 (the bus, the mixer, the voices, the config, the console) and on the court exactly as the animation
branch leaves it: no animation, ball or court file was changed. The court's audio hears what the court already reports
(`view.sound`, `view.cue`) and reads, never writes, the rest of what it needs from the view each frame.

No free sound library could be reached from where this was built (freesound, OpenGameArt, Kenney, Wikimedia Commons,
archive.org, Sonniss, Pixabay and ZapSplat all refused the connection), so every court sound is made by this project
from a small physical model of what makes it: the license is the game's own and nothing from anywhere else is in it.
The sound packs Trial 1 built take over any sound they have (CC0 or CC BY recordings, each license checked by the
packer), through the same path: a recording plays as a take, with the same jitter, physics and placement.

### What was built

```
 court (untouched)                         js/ui/live.js (the hookup: 3 lines to the court's audio, 1 per frame)
   view.sound: dribble, bounce, rim,         view.cue: plant, land,        every frame, read only: the ball's flight
   board, swish/net, dunk, block,            catch, pass (shotResult       segments, bodies in contact, jump heights,
   whistle, horn                             still goes to the tracker)    clip events (fall, bump, jab, jump stop), refs
          │                                          │                                   │
          ▼                                          ▼                                   ▼
 ┌──────────────────────────── PBC.CourtAudio (js/audio/court.js) ──────────────────────────────────────────────┐
 │  decides: a dribble's height, speed and floor spot; a squeak only on a hard plant; footsteps from running;    │
 │  the rim's front, back or side; the net as the ball enters it; the block at the hand; the dunk at the rim ... │
 │  when: the contact's exact game time → the audio time that moment is on screen (queued in the steps, played │
 │  at the frame); where: the camera → pan, level, air, room                                                    │
 └───────────────┬──────────────────────────────────────────────────────────────────────────────────────────────┘
                 │ court.<sound> on the bus, with what made it, where, and when
                 ▼
 PBC.CourtSynth (js/audio/courtsynth.js): a take (12 per sound, a shuffled round robin) + pitch and level jitter +
 the hit's physics → the model (or a pack's recording) → mixer voice → placement (level, air lowpass, pan, extra
 room) → Court or Arena bus
```

- **When it plays.** The court runs fixed 1/60 s steps and draws the picture blended between the last two, so a
  contact's moment on screen is known: the court's audio takes the contact's exact game time (a ball segment's start;
  for a dribble, the step's time less the part of the step after the phase crossed the floor) and schedules the sound
  for the audio time the drawn picture reaches it. A contact that is already on screen when its frame is drawn (at
  high speed, or on a slow frame) plays at once; anything more than 0.25 s old is dropped rather than played late. The
  master's two compressors delay everything 12 ms (6 ms look-ahead each, measured), which the scheduled sounds take
  back (`sync.avOffsetMs`).
- **Where it plays.** Each sound is projected through the broadcast camera: its pan follows where it is in the picture
  (the edge of the picture pans 0.62 of the way, off the picture up to 0.8), its level the distance from the camera
  (inverse distance to the 0.9, from +3 to -9 dB, centre court at 0 dB), 5 dB more off once it is off the picture, the
  air takes the high end off further away (a lowpass from 18 kHz near to 5.5 kHz far) and the room comes up (an extra
  reverb send, none at the near sideline, full at the far corners). The Court bus's own reverb send went down to 0.55
  so distance can bring it up. A placed sound is as loud in the middle of the picture as it was unplaced (the panner's
  3 dB is given back).
- **Variation.** Every sound has 12 takes: each a fixed draw of every random part of its model (the same every game,
  like a set of recordings), played in a shuffled round robin (a take does not come back until 9 others have played,
  so any 10 in a row are 10 different takes), then a random ±2.5% of pitch and ±1.5 dB of level, a different stretch
  of noise, and the hit's own physics.
- **The ball** (dribble, bounce): a thump (the floor's give and the ball's squash, 165 falling to 62 Hz), the floor
  under it (a board's resonance near 230 Hz), the pressurised air cavity ringing in the modes of a sphere (956, 1536,
  2069, 2595, 2730, 3105, 3608, 4450 Hz for a 0.119 m ball; Russell, "Basketballs as spherical acoustic cavities") and
  the pebbled cover's slap; 30% of the takes land on a seam (rings less, slaps lower and harder). A dribble's energy
  comes from the ball's speed into the floor (time-scaled with the dribble, 10 to 32 ft/s), and its tightness from how
  low and how quick it is (a low quick dribble rings shorter with less thump and more slap). A loose ball's bounce
  from its speed down.
- **The floor.** Every arena's floor has its own smooth field (±3.5% of pitch, ±1.2 dB over about 11 ft), an arena can
  have up to two dead spots (a duller, hollow bounce: 4 dB down, the ring 10 dB down), out of bounds the wood runs on
  for 6 ft (the apron) and past that the ball is in the courtside seats (muffled, 6 dB down, little ring), a roll
  there too. The painted lanes and the logo give the cover's slap a little more bite, too little to pick out (the
  ball's ring covers it: measured and left as it is).
- **Sneakers.** A squeak is a stick-slip pulse train (the sole sticks and slips a few thousand times a second:
  Harvard, Nature 2026) through the sole's resonance near 3.6 kHz, its rate wandering and its level chattering; a cut
  glides up and back, a stop skids down, a pivot is a short high "eek", a slide a short chirp, a jump stop two quick
  skids. It sounds only on a hard plant, the animation's own hard push (Trial 4 of the animation gauntlet: 18 ft/s² or
  more across or against the way the body goes, from jogging speed, 10 ft/s, up, judged against the body's top speed
  over the last 0.35 s so a stop counts), with odds rising from 25% to 80% with the force, a pivot turning faster than
  5 rad/s on the spot, a defender's slide (a stride going sideways to the way the body faces, at 8 ft/s or more) at
  15% (a hard change of direction in a slide as likely as a hard cut), a jump stop (its clip's own landing, by the
  speed going into it); one player at most every 0.6 s, the floor at most 3 in any second. A heavier body plants
  harder.
- **Footsteps and landings.** A rubber sole on sprung wood: a low thud (heel then forefoot a few ms apart in most
  takes), the board's knock, the sole's tap; lower and louder the heavier the body (mass from height cubed and build).
  Only running bodies (12 ft/s up), at most 5 a second over the floor with the loudest and nearest first; walking and
  the half-court shuffle stay silent, and at 4x and faster the footsteps drop out (only a patter at that pace). A
  landing's size comes from how high the jump went (the peak the audio saw), both feet in one landing; a landing on
  the move (a layup) adds a skid.
- **Hands on the ball.** A catch is a slap of skin on leather with the ball's damped ring, as hard as the ball came in
  (a loose ball scooped up softer); a pass release is a softer push, with a little air for a hard one (34 ft/s up).
- **The rim.** A steel ring's bending modes (5/8 in rod, 18 in across: 164, 463, 888, 1436, 2106, 2900, 3815 Hz),
  split in two by the clamp at the back (the shimmer), the tick of contact, the mount's thunk and the ball's own ring.
  The part comes from the shot's line: in front of the rim's centre by 0.3 ft or more the front iron (rings longest),
  behind it the back iron (near the mount: shorter, more of the high modes, the support thunking), else the side; a
  soft touch; a second and later hit in one flight is a rattle. A ball rolling round the rim is the ring's modes
  rubbed, as long as the roll and slowing with it, then the net as it drops.
- **The glass.** The tempered plate's low modes (72 x 42 x 1/2 in: 37 to 330 Hz, a thwack; where on the glass the ball
  hits sets which ones it drives), the frame's rattle and the ball's ring.
- **The net.** A swish is only the net: nylon dragged over the ball (a band of noise sweeping up from 3.3 to 6.4 kHz)
  and the net whipping at the end (a snap); it starts as the ball enters the net (the court announces a make as the
  ball leaves it, 0.2 s later: the audio finds the moment in the ball's flight). A make off the rim is the rim's hit
  and then a lower, slower brush with no snap. An air ball makes nothing at the hoop: the next sound is the floor.
- **A dunk** plays as the ball goes through the rim (the court's call comes 0.12 s before, as the slam starts): the
  front iron slammed and cut short by the hands, the breakaway rim rattling on its spring (5 to 8 taps at 24 to 33 Hz,
  then 3 more 0.23 s later as the rim springs back), the glass and stanchion shaking (the plate's two lowest modes,
  the frame's buzz), and the net whipped.
- **A block** is the slap of the hand on the ball, at the moment the ball meets the blocker's hand (the court's call
  comes at the release, 0.16 s early; the deflection it sounded as a floor bounce is not a floor contact any more).
- **Bodies.** Two players' torsos coming within their radii with 4 ft/s or more of closing speed (a box-out, a slow
  push into the man, from 2 ft/s), or a hit hard enough to knock one off balance (the court's collision response),
  make one thud for the two of them: a bump, a screen (heavier, lower), a box-out (a longer push and a jersey's
  rustle) or a post-up (a shoulder); a pair at most every 0.7 s. A charge's fall is the contact, then the body on the
  floor at the fall's floor event (the seat, then the back, the hands slapping); a post-up's backing-down bump and a
  jab step come from their moves' own events.
- **The officials and the clocks.** The whistle comes from the official whose signal just started, as long as the call
  (a foul 0.48 to 0.75 s, a charge a little longer, a violation 0.32 to 0.46 s, out of bounds shorter): a pealess
  whistle's three chambers beating against each other, a breath, a chirp in, and in some blasts the pitch sags as the
  breath runs out. The horn the court sounds with the game clock still running is the shot clock's buzzer (a rough
  square buzz over the basket the offense attacks); with it at zero, the period's horn over the arena; the game's end
  right after it is the same horn, not a second one.
- **Rolling.** A ball rolling on the floor rumbles with its seams, slowing and stopping with the roll, and stops at
  once when somebody picks it up.
- **The mix around it.** The mixer (`js/audio/mixer.js`) places each voice (level, lowpass, pan, its own reverb send
  through its bus's fader and mute / solo gate), can stop a voice early (a rolling ball picked up), and its recorder
  now stamps every sample with the audio clock (`recording()`), so the tests line sounds up to the sample. The arena's
  reverb got darker as it decays (an arena's air and seats take the highs first: from 9 kHz to 1.2 kHz over its 2.2 s,
  the lows at their old level: the crowd's A/B is unchanged).
- **The config** (`PBC.AudioConfig`): `court` (sync, place, floor, and every rule: dribble, bounce, squeak, step,
  land, catch, pass, body, fall, roll, rim, board, whistle, buzzer, the horn's window, takes, jitter) and `courtSynth`
  (every model's numbers); the sounds' buses, priorities, cooldowns and limits in `sounds`; the reverb's colour in
  `reverb`. The squeak timer is gone.
- **The console** shows each court sound with what made it (the plant's speed, braking and turning; the dribble's
  tightness; the rim's part; the call), where it is, how far ahead it was scheduled or how late it came, the take it
  played and its pan and level.
- **Tests anyone can run**: `tools/audio/test/court.js`, `variety.js`, `shots.js`, `place.js`, `events.js`, `modes.js`
  (see `tools/audio/README.md`), results in `audit/audio2/`.

New parameters: everything under `court` and `courtSynth` in `js/audio/config.js`, `reverb.hzStart` / `hzEnd`, the new
sounds in `sounds` (step, land, catch, pass, body, fall, roll, rimroll, buzzer). New assets: none. Every sound is
generated at play time by the project's own code; no model, library or recording from anywhere else.

### Listen test

`node tools/audio/test/court.js`: seed 21 (the game Trials 0 and 1 listened to), 1x, 120 s, the arena's sound and the
booth on (the stand-in speech engine, as in Trial 1). Every court sound on the bus next to what made it, when and
where: `audit/audio2/court_trace.txt` (726 events), the first 400 foot plants and landings it heard in
`court_trace_anim.txt`, the proofs in `court_result.txt` and the first minute at the speakers in `court_60s.webm`.
Headless Chromium draws this court in software, about 23 frames a second (43 ms apart), so the timing below is against
the frames it really drew. A possession in the far corner, a lob and a pull-up that swishes, as logged (real s, audio
s, game clock, the event, what made it and where; then the sound: the take, the pan and the level):

```
 real s  audio s  clock        event            what (and where, ft)                               | sound
 17.632   16.390  Q1 11:49.1  court.dribble    v 0.55 Mills tight 0.61 at 5.9, 47.7            | dribble [take 4] pan -0.24 -1.5dB
 18.077   16.834  Q1 11:48.7  court.dribble    v 0.62 Mills tight 0.61 at 6, 47.7              | dribble [take 10] pan -0.24 -1.5dB
 18.500   17.261  Q1 11:48.3  court.dribble    v 0.62 Mills tight 0.61 at 6.1, 47.2            | dribble [take 5] pan -0.23 -1.6dB
 19.170   17.932  Q1 11:47.6  game.pass        UTA lob
 19.196   17.952  Q1 11:47.6  court.pass       v 0.48 Mills (ball 22 ft/s) at 5.8, 44.4, 6.6   | pass [take 4] pan -0.24 -0.6dB
 19.957   18.721  Q1 11:47.0  court.catch      v 0.53 Collins (ball 21 ft/s) at 13.3, 32.9, 6  | catch [take 9] pan -0.12 +0.2dB
 20.865   19.621  Q1 11:46.2  game.shot        Collins 2pt pullup UTA
 21.292   20.050  Q1 11:46.2  court.land       v 0.28 Collins (jump 0.9 ft) at 11.7, 29.5      | land [take 2] pan -0.14 +0.3dB
 21.342   20.103  Q1 11:46.2  court.land       v 0.35 Payton (jump 1.2 ft) at 9.4, 27.9        | land [take 10] pan -0.19 +0.5dB
 21.525   20.283  Q1 11:46.2  court.swish      v 1 (nothing but net) at 5.3, 25, 10            | swish [take 1] pan -0.3 +0.9dB
 21.671   20.431  Q1 11:46.2  game.shotResult  Collins swish, net (court)
 21.671   20.431  Q1 11:46.2  game.score       UTA +2, 0-2                                     | crowd.murmur
 22.465   21.220  Q1 11:45.9  court.bounce     v 0.9 (down at 22.7 ft/s) at 4.7, 26 paint     | bounce [take 5] pan -0.26 +1.1dB
```

The dribbles in the far corner sit left of centre and a little down (pan -0.24, -1.5 dB), each a different take; the
lob is a soft pass (22 ft/s) and the catch as hard as the ball came in; the shooter's landing and the contesting
defender's are as big as their jumps (0.9 and 1.2 ft); the swish plays as the ball enters the net, 0.15 s before the
court calls the make; the ball's first bounce after it is on the paint under the basket. (Headless Chromium drew this
court about 23 times a second, so most sounds are a few tens of ms late against the step they came from, each within a
frame of the moment the picture shows it: below.)

What the 120 s made: 117 dribbles, 385 footsteps (3.2 a second), 77 squeaks, 28 catches, 24 passes, 9 landings, 12
body contacts (10 bumps and 2 box-outs), 7 loose-ball bounces, 3 rim hits, a swish, a dunk and 2 whistles. The mixer
played 671 sounds, never more than 7 at once, stole nothing and refused nothing. The court's audio held back, by its
own rules, 348 footsteps over the floor's budget and 20 too quiet, 198 hard plants that did not squeak (the odds, one
player's gap, the floor's window) and 82 contacts too soft to hear.

Every dribble's sound was scheduled within one drawn frame of the moment its contact is on screen (117 of 117; median
18 ms after it, the frames 43 ms apart) and started with the first frame that shows the ball down (median 0 ms); at
the speakers the 114 dribbles clear of other sharp sounds began 17 ms after their scheduled start (the compressors'
look-ahead and the hit's own rise), every one within two frames of the picture. The 77 squeaks (38 a minute, from 2.0%
of 3,770 foot plants and landings) were 39 stops, 20 slides, 11 cuts and 7 pivots, each with its plant's speed,
braking and turning in the trace, never more than 3 in any second on the floor or 2 by one player.

### Devil's advocate: what a fan would say, and the fixes

The first runs of the finished build (a live game with every court sound traced next to what made it, and the variety
test) found three things a fan would say at once:

1. **"The sneakers never stop squeaking."** 79 squeaks a minute in the first run. The first rule squeaked on any plant
   with 18 ft/s² of braking or turning, whatever the speed, so a player easing out of a walk squeaked like a hard cut.
   Fixed: a squeak needs the animation's own hard push from jogging speed (10 ft/s) up, a stop judged by how fast the
   body was going over the last 0.35 s (by the plant it has already slowed), with odds rising from 25% to 80% with the
   force (a hard plant does not always squeak), one player at most every 0.6 s and the floor at most 3 in any second.
   On the final listen test: 38 a minute, from 2.0% of the foot plants, in bursts on cuts, closeouts and stops, and
   none while players walk or stand.
2. **"The footsteps sound like rain."** 12 footsteps a second in the first run: every jogging plant of ten players and
   three officials, a patter under everything. Fixed: running bodies only (12 ft/s up; walking, the jog back and the
   half-court shuffle stay silent, as the court mics on a broadcast mostly catch the running), at most 5 a second over
   the floor with the loudest and nearest first, the officials at half level. On the final listen test: 3.2 a second.
3. **"It's the same dribble over and over."** On the first variety test 17 of the 33 sounds had two hits among ten in
   a row that a listener could not tell apart (the dribble, the bounce, the footstep, the landing, the pass, the body
   contacts, the fall, the glass, the roll, the whistle, the buzzer and the horn). Each hit took a fresh stretch of
   noise but the same shape, and fresh noise alone is not a different sound. Fixed: 12 takes a sound, each a fixed
   draw of every part of its model (a panel or a seam meeting the floor; heel then forefoot, or flat; where on the
   glass; how the whistle's blast starts and sags; how long the horn holds and swells), in a shuffled round robin so a
   take is not heard again for 9 others, with ±2.5% of pitch and ±1.5 dB on top. Final: 33 of 33. The test's first
   rule only counted a change in the spectrum's shape (1.5 dB in some third-octave band); a whistle or a horn is one
   strong tone whose takes differ in pitch and length rather than shape, so the rule now counts any difference past
   what a listener can hear (1 dB of level, 1% of pitch, 1.5 dB in a band, 15% in how long it rings) and still fails
   any two hits whose waveforms correlate at 0.98 or more. The smallest band difference of each sound is still in the
   result.

Also found while proving the rest, and fixed:
- **A sound in the middle of the picture was 3 dB louder than one just beside it.** A sound panned dead centre skipped
  the panner, and Web Audio's equal-power panner puts a centred sound 3 dB down in each ear. Every placed sound now
  goes through the panner, with the 3 dB given back.
- **The far end sounded as dry as the near sideline.** The Court bus sent everything to the arena's reverb at one
  level, so distance added little room. The bus's own send went down to 0.55 and the placement's extra send goes from
  none at the near sideline to full at the far corners: now 4.3 to 4.9 dB more tail against the direct sound there.
- **The far end sounded brighter, not duller.** More room meant more of a reverb tail as bright as the sound itself,
  and the air's lowpass had a small bump at its corner (Web Audio reads a lowpass's Q in dB; 0.55 was meant as a plain
  Q). The tail now darkens as it decays (9 kHz to 1.2 kHz over its 2.2 s, the lows untouched, so the crowd's A/B is
  unchanged) and the lowpass is flat (Q -3.01 dB, a Butterworth).
- **Two thuds for one collision.** Both players of a contact reported it: now one thud a pair.
- **A defender's slide never squeaked.** The gait tells a slide from a run by its stride going sideways, not by a mode
  of its own, so the rule never saw one: a stride 60% or more sideways to the facing, at 8 ft/s or more, is a slide.
  The final review's test of a defender sliding one way and back found the next thing: each hard change of direction
  came out as a stop's long skid, as the stop rule was asked first. A hard push going sideways in a defensive stance
  is now a slide's short chirp (as likely as a hard cut); a slide step at speed still chirps now and then (15%).
- **A jump stop never squeaked** (found in the final review, by a test that makes one): the jump stop's hop lands as
  two steps of its own clip, not as a jump's landing, so the landing rule never saw it, and the two plants looked like
  running steps (12 ft/s, the braking still to come). The court's audio now hears the clip's own landing, as it hears
  a charge's fall or a jab, and skids it by the speed going into it.
- **Some hits ticked and others did not** (found in the final review, by the floor test: the same take measured
  differently at different spots). Every envelope started from 0 at the hit's time, but a Web Audio gain sits at 1
  until its first event, and when a hit started between two samples a noise burst's first sample went through at full
  level: the same dribble, started at different moments, came out with or without a hard tick above 5 kHz (16 to 19 dB
  more energy up there) about half the time. Every envelope now starts its gain at its first value, and the same
  dribble started anywhere is the same to the sample's rounding. The crowd's reactions (Trial 1's arena audio) had the
  same fault and have the same fix (their A/B levels below).
- **The retro court was being listened to as well** (found in the final review, by reading the code): the court's
  audio read its bodies every frame, but the retro court keeps no game time, so their speed history grew with every
  frame and nothing could ever be heard from it. The court's audio now listens to the broadcast court only (the retro
  court and text mode have no court sounds; `modes.js` checks both).
- **The first court sound of a game cost up to 9.8 ms of the main thread** (building the shared noise and waveforms):
  they are built when the court's audio starts.
- **Every scheduled sound came 12 ms late at the speakers.** The master's two compressors look 6 ms ahead each
  (measured on the recorder: 12.07 ms). A sound scheduled ahead now starts 12 ms earlier (`sync.avOffsetMs`); one that
  is already late plays at once.
- **At 4x the court cost frames.** The same seeded game frame for frame with the audio on and off (`perfsame.js`): at
  1x the audio added 0.3 ms a frame, inside the 1.0 ms that the same setting varies from round to round, but at 4x it
  added 1.8 ms, past the 1.2 ms spread. Each court sound takes 0.5 to 0.7 ms of the main thread to build (a rim 1.3
  ms, a dunk 3 ms: 20 to 180 Web Audio nodes), and at 1x over half of them are footsteps. The footsteps now drop out
  at 4x and faster, where the running is only a patter: the same test on the final code at 4x shows +0.5 ms a frame
  (+1.3 ms at the 99th percentile), inside that run's round-to-round spread (4.0 ms), with half as many sounds (310 a
  run instead of 652).

### Scorecard

| Criterion | Result | Evidence |
|---|---|---|
| Every dribble sound plays within a frame or two of the ball's contact | PASS | `court.js`, 120 s of a live game: all 117 dribbles scheduled within one drawn frame of the moment the contact is on screen (median 18 ms after it, the frames 43 ms apart in headless Chromium), starting with the first frame that shows the ball down (median 0 ms); their onsets found in the recording at the speakers within two frames of that moment, 114 of the 114 clear of other sharp sounds (`court_result.txt`) |
| Squeaks only on real plants and cuts, never spam | PASS | `court.js`: 77 squeaks (38 a minute) from 3,770 foot plants and landings (2.0%), each with its plant's speed, braking and turning in the trace; every cut and stop a hard push (18 ft/s² or more from 10 ft/s or faster); never more than 3 in any second as heard, 2 by one player; none from a timer. `events.js`: a defender's slide, a closeout and a jump stop each squeak |
| The same sound played 10 times in a row never sounds identical | PASS | `variety.js`: 33 of 33 sounds, ten in a row with the same physics, the exact samples: no two hits correlating at 0.98 or more, every pair apart by a difference a listener can hear, no take twice running (`variety_result.txt`; four of them as `variety_*.webm`) |
| Swish, rim-in and air ball clearly different | PASS | `shots.js`, the court's own ball physics: at the hoop the swish is the net alone (1.6% rim metal, 78% of its energy in the net's 3 to 9 kHz), the make off the rim is the iron and then the net (85% rim metal), the air ball makes nothing there (-88 dB, 50 dB under the others) (`shots_result.txt`, `swish_rimin_airball.webm`) |
| Dribbles: level and tone from the height, the force, the camera's distance and the floor; a low quick one tighter; every bounce different | PASS | each dribble's energy from the ball's speed into the floor and its tightness from how low and quick it is (both in the trace); `variety.js`: a hard dribble 11 dB over a soft one, the low quick one 3.1 dB less energy than a high one at the same peak (a shorter ring, less thump), on an arena's floor the field moves the level 2.1 dB from spot to spot, a dead spot is 4 dB down with its ring 10 dB down, the seats 9 dB down and muffled (the centroid from 989 to 159 Hz); `place.js`: the distance (below); ten in a row never alike (above) |
| Squeaks on hard cuts, plants, pivots, closeouts and slides, by the plant's force | PASS | the listen test's squeaks by kind (39 stops, 20 slides, 11 cuts, 7 pivots), each with its plant; `events.js`: a slide, a closeout, a jump stop, a jab; the level, length and odds rise with the force (`court.squeak`) |
| Footsteps: soft thuds, heavier for bigger players, landings | PASS | 3.2 a second from running bodies only, lower and louder with the body's mass; each landing as big as its jump (0.9 ft: v 0.28, 1.2 ft: v 0.35 in the excerpt above) |
| The ball: catches, passes, the rim's front and back, a soft roll, the glass, the net, out of bounds, rolling | PASS | the listen test's 28 catches and 24 passes (as hard as the ball's speed); `shots.js`: front, back and side iron, a rattle, a roll round the rim and in, the glass in and out; `events.js`: a loose ball on the apron and into the seats, then rolling |
| Dunks: the rim's rattle and the glass shaking | PASS | the dunk: the iron slammed, the breakaway rim's spring taps and its rebound, the glass's two lowest modes and the frame's buzz, the net whipped; `shots.js`: it plays as the ball goes through the rim (0.12 s after the court's call), 69% rim metal at the hoop; `variety_dunk` |
| Body contact: screens, box-outs, post-ups, falls | PASS | the listen test: 10 bumps and 2 box-outs (a box-out heard from 2 ft/s of closing speed); `events.js`: a charge (the contact, then the floor), a post-up's bump; `variety.js`: a screen, a box-out and a post-up each ten times |
| Whistles, the shot clock's buzzer, the end of quarter horn | PASS | `events.js`: a whistle for a foul, a charge, a violation and out of bounds, each from the official signalling and as long as the call; the buzzer with the game clock running, over the basket; the period's horn at 0:00 over the arena; the game's end right after it the same horn, not a second; the game's end alone its own horn |
| Everything panned and attenuated from the broadcast camera | PASS | `place.js`, the same dribble at ten spots measured in stereo at the speakers: the near sideline's ends 8.9 dB and the far corners 9.6 dB to their side, centre court and the sidelines' middles centred (0.0 dB), the near sideline 2.0 dB louder and the far one 1.7 dB quieter than centre court, off the picture 16 dB to its side and 6.4 dB down; the far corners 4.3 to 4.9 dB more room and 1.1 dB less above 4 kHz than the near sideline |
| Audio never costs a frame | PARTIAL | the main thread: the same seeded game frame for frame with the audio on and off (`perfsame_before_result.txt`, before the merge and the fix) adds 0.3 ms a frame at 1x, inside the 1.0 ms round-to-round spread; at 4x it added 1.8 ms until the footsteps dropped out there, and on the final code 0.5 ms, inside that run's 4.0 ms spread (`perfsame_result.txt`); the audio's own work each frame (`perf_result.txt`: the bus, the court's audio, the mixer, the booth) is 0.35 ms on average and 1.8 ms at the 99th percentile at 1x, 0.72 and 2.6 ms at 4x. Not proven: headless Chromium draws the court in software on the same 4 cores as the audio thread, and in two of three unpaired runs it drew about 8% fewer frames with the audio on (20.4 against 22.1 a second at 1x in the last; 22.7 against 22.6 in the first); a GPU-drawn browser was not measured here |
| Every tunable in one config | PASS | `court` and `courtSynth` in `js/audio/config.js` (every rule and every model's numbers), the sounds' buses, priorities and caps in `sounds`, the reverb's colour in `reverb` |
| Everything free and licensed | PASS | nothing from outside: every court sound is generated by the project's own code (Trial 1's packs can bring in CC0 or CC BY recordings, licenses checked by the packer) |
| Earlier trials still pass | PASS | the regression check below |

### Regression check

Everything Trial 1 proved, rerun on the final code, merged with the animation session's latest work (results in
`audit/audio2/`):
- **The audio never changes the game** (`same.js`): seeds 21 and 33 with the audio all on, all off and the arena only:
  the same play-by-play, box score and court fingerprint (`same_result.txt`: IDENTICAL, both seeds). The court's audio
  reads the view and never writes to it, and draws only from the audio's own random numbers.
- **The duck** (`duck.js`): PASS with the same numbers as Trial 1 (bed -6 dB, cheers -3 dB, no surges, no chop).
- **Voice limits and priority** (`voices.js`): 10 of 10, with the court's new sounds in the caps.
- **Mute and solo on every bus in a live game** (`mutesolo.js`): 10 of 10.
- **The A/B against Trial 0's code** (`ab.js`, the same random variations on both sides): every crowd sound within
  0.12 dB and the bed within 0.10 dB, with the envelope fix in the crowd's reactions. The court's sounds are new by
  design (their levels next to the old ones are in `variety_result.txt`: the dribble sits 4 to 7 dB under the old one
  on average with the same peak, a sharper hit with less boom; the squeak is louder, as it now only comes on a real
  plant).
- **Trial 1's listen test** (`listen.js`, the same game as Trials 0 and 1): all six shots' results came from the court
  when the ball got there (the misses at the rim after 1.2 and 1.3 s, the makes at the net after 0.3 to 2.0 s) and the
  crowd's "ooh" and murmur came with the rim; no `timer.squeak`; the crowd sat 5.6 dB down (the bed) and 2.8 dB
  (reactions) while the booth talked, with no surges and no chops; 781 sounds, never more than 7 at once; the mixer's
  own time building and playing them 458 ms over the 150 s (0.3% of the main thread); no errors (`listen_result.txt`).
- **Frame time**: on the main thread the audio's work fits (the scorecard's row: paired frames within the
  round-to-round spread at 1x and, since the footsteps drop out there, at 4x; 0.35 ms a frame on average at 1x). What
  is not proven is the whole pipeline in headless Chromium, which draws in software on the cores the audio thread also
  uses: two of three unpaired runs drew about 8% fewer frames with the audio on. Left open for the next trial that
  touches performance: fewer Web Audio nodes a hit (a court sound builds 12 to 180 of them; takes rendered once and
  replayed would build 2 or 3) and a measurement in a browser that draws with its GPU.
- **Trial 1's list for Trial 2** is done: the squeaks come from the feet (no `timer.squeak` anywhere in the logs), the
  block sounds at the blocker's hand and its deflection makes no floor sound.
- **The animation branch's court is untouched**: this trial changed `js/audio/`, `js/ui/arenaaudio.js`, the hookup
  lines in `js/ui/live.js` and two script tags in `index.html`, nothing else. The animation session kept pushing to
  this branch while these tests ran; the results above are on the code merged with its Trial 10 commits up to
  fe46b85, and after merging its two later ones (9502760, 9684b47) the court listen test (119 of 119 dribbles within
  a frame, 32 squeaks a minute, no errors) and the events test (15 of 15) passed again, as did the animation
  gauntlet's own checks (`tools/audit/check.js`: 127 of 127, its new ones included).
- **Other ways to watch**: `modes.js` (seed 21 at 2x, 70 s each, the arena's sound on): the retro court and
  play-by-play only make no court sounds and no errors, and every shot's result is still heard (the retro court's 13
  from its own ball, text mode's 8 with the text); on the broadcast court an instant replay (52 to 60 s) had no court
  sound in it, and the court's sounds came back after it (73) (`modes_result.txt`).

### What to listen for

- **The clips** in `audit/audio2/` (headphones):
  - `court_60s.webm`: the first minute of the listen test at the speakers (dribbles, squeaks on the cuts and stops,
    the running, passes and catches, the rim, the crowd).
  - `swish_rimin_airball.webm`: a swish (the net alone), a make off the rim (the iron, then a slower brush of the
    net), an air ball (nothing until the floor).
  - `shots_all.webm`: every kind of shot in turn (front, back and side iron, a rattle, the glass, a roll round the
    rim, a dunk, a block).
  - `place.webm`: the same dribble at ten spots, centre court first, then the near and far sidelines, the corners, the
    rim and off the picture: it moves across, gets quieter, duller and roomier as it goes away.
  - `events.webm`: a whistle for each kind of call, the shot clock's buzzer, the period's horn (and no second horn for
    the game's end right after it), a charge, a post-up, a jab, a defender's slide, a closeout, a jump stop and a
    loose ball into the seats.
  - `variety_dribble.webm`, `variety_squeak_cut.webm`, `variety_rim_front.webm`, `variety_whistle.webm`: one sound ten
    times in a row, the same physics each time.
- **In a game**:
  - a dribble lands when the ball does. A low, quick crossover is tighter and slappier than a high dribble bringing
    the ball up; every bounce is a little different; the floor changes from spot to spot, and a dead spot thuds.
  - squeaks come in bursts where the play is hard (a cut off a screen, a closeout, a stop at the elbow, a pivot, a
    defender's slide, a jump stop) and not while players walk or stand.
  - the running: a fast break thuds, a big man's steps are lower and heavier, a rebound's landing is as big as the
    jump.
  - the rim: the front iron rings long, the back iron is shorter with the support's thunk, a ball rolling round the
    rim rubs, then drops through. A swish is only the net; an air ball is silent until the floor.
  - a dunk: the iron slammed, the rim rattling on its spring, the glass shaking, the net whipped.
  - the whistle comes as the official signals and lasts as long as the call; the shot clock's buzzer sits over the
    basket; the period's horn fills the arena; the game's end is one horn.
  - everything sits where it is in the picture: from the near sideline the ball is close and dry, in the far corner it
    is small, dull and roomy.
- **The console** (A): each court sound's line says what made it (the plant's speed, braking and turning; the
  dribble's tightness; the rim's part; the call), where it is, how far ahead it was scheduled or how late it came, and
  the take, pan and level it played with.
- **Still to come** (not this trial): the crowd bed (Trial 3), chants that follow the game (Trial 4), the booth's new
  voices (Trial 7) and set calls on time (Trial 8), the whole mix's loudness (Trial 9). Recorded sound packs (CC0) can
  replace any of the modelled sounds through the packer when a library can be reached.

## Between Trials 2 and 3: the recorded sounds

The court's modelled sounds were built because no sound library could be reached from here. Then the owner found
recordings online and brought them in: a ball dribbling, a net swish, a crowd at a game, three sounds generated with
ElevenLabs (the ball on the backboard, a net swoosh, a pass) and a crossover beat. They now play in the game where they
fit, and the crowd recording is the crowd bed's base now, ahead of Trial 3 (asked for: "use the crowd now"). Nothing
the animation session owns was touched.

### Where they come from, and their licenses

| Download | From | License | In the game as |
|---|---|---|---|
| "basketball" (12 bounces and a blip) | Pixabay, uploaded by freesound_community (basketball-99685) | Pixabay Content License | `dribble_01` to `_12`, also the loose ball's `bounce` |
| "basketball net swish sound" (8 swishes) | Pixabay, freesound_community (basketball-net-swish-sound-40170) | Pixabay Content License | `swish_01` to `_08`, also the `net` off the rim |
| "fans at basketball game crowd" (112 s) | Pixabay, freesound_community (fans-at-basketball-game-crowd-5859) | Pixabay Content License | the crowd bed's loops `bed.murmur` and `bed.cheer` |
| "Swoosh of a basketball net, satisfying and crisp" | ElevenLabs Sound Effects, free, without an account | non-commercial only, credit "elevenlabs.io" | `swish_09` |
| "Sound of a basketball hitting the backboard, echoing impact" | ElevenLabs, the same | the same | `board_01` |
| "Sound of a basketball being passed, quick whoosh through the air" | ElevenLabs, the same | the same | `pass_01`, `pass_02` |
| "crossover" (phantasticbeats) | Pixabay music | Pixabay Content License | not used: it is music, kept for the arena's music (Trial 5) |

- **Pixabay's license**: free, commercial use allowed, no credit needed; the sound may be edited and used in a game, but
  not handed on as the file itself. So the downloads are not in the repository: `tools/audio/cut.js` makes the game's
  edited takes from them, following `cuts.json` in each folder (anyone with the downloads can make them again).
- **ElevenLabs' free plan** (the owner made these without signing in): its help centre says content made on a free plan
  or without an account may be published with "elevenlabs.io" (or "11.ai") credited, and may not be used for any
  commercial purpose. The rows in `assets/audio/court/LICENSES.md` credit it; the packer lets them in only with that
  credit, lists them every time it packs, and the pack carries the list (`nonCommercial`). **Before the game is ever
  sold these four files must be replaced** (or made again on a paid plan, whose license is commercial).
- Every file's row (its download, the time of the hit in it, the author, the license) is in the folder's `LICENSES.md`.

### What was built

- **Cutting** (`tools/audio/cut.js`): a hit is found by its onset (the first sample near it to reach a share of its
  peak), cut from 3 to 5 ms before it, faded in over that and out over its last 0.1 to 0.3 s, a highpass under the
  ball's thump (35 to 60 Hz) takes out the room's rumble, and it is levelled on its body, every take the same level,
  so the game's physics decide how loud a hit is, not how near the microphone was. 16-bit mono WAV at 48 kHz: an MP3
  starts late by its encoder's delay, and a dribble must land on the frame. The dribbles file has 13 onsets: 12
  bounces and a blip, left out. The swish file's last swish is cut short of a click after it. The backboard's long echo
  is trimmed to 0.6 s. 24 takes, 757 KB.
- **The crowd's loops**: the recording is 112 s of one microphone (mono) with a loud cheering crowd at the start, a quiet
  murmur between, and things that must not come round every loop: a horn or whistle (72 s), people shouting, a chant
  with claps (29 to 44 s), a ball being dribbled (77 to 86 s), a squeak (47.6 s). The murmur is made of the clean
  stretches (44.5 to 47.4, 48.2 to 54, 66 to 71.8 and 92.4 to 102.4 s), the cheer of two (0.5 to 16.5 and 55.5 to
  64.8 s), each levelled by a slow gain (its swells stay, its drift goes), crossfaded into the next and its end into its
  start: loops of exactly 20 and 22 s. Each file carries a quarter second of its own end before the loop and of its
  start after it, and the game loops the middle, so whatever delay an MP3 decoder adds only moves where the loop
  starts. Mono MP3, 64 kbps at 24 kHz, 345 KB for both (lamejs, needed only to cut).
- **The packer** (`tools/audio/pack.js`) accepts the Pixabay Content License, and ElevenLabs' free plan with its credit
  (listed as non-commercial). The packs load in file-name order now (`js/audio/assets.js`): take 3 is always the same
  recording, and `takes()` hands a sound's recordings to the court.
- **The court plays them** (`js/audio/courtsynth.js`, `AudioConfig.court.rec`). A sound still has 12 takes, the shuffled
  round robin and the jitter: take i of a sound with n recordings is recording i % n, changed a little when there are
  fewer than 12 (a variant: pitch x 0.925 to 1.075 and a high shelf of up to 3 dB), so the glass's one recording is 12
  takes, the pass's two are 6 each, the nine swishes are 12 with three of them changed. A sound can borrow another's:
  the loose ball's bounce plays the dribbles, and the make off the rim plays the swishes softer, slower and duller
  (6 dB down, pitch 0.94, a 4.2 kHz lowpass) after the modelled rim. The hit's physics set the level (x hit ^ curve:
  1 for the ball, the net and the glass, 1.3 for the pass, so a slow pass is only a breath). A tight dribble's tail is
  cut sooner and it is 1.75 dB quieter than an open one (the model's high dribble rang longer and louder). The floor
  still counts: its field's level and pitch, the paint's slap and the seats' as a high shelf, a dead spot's dull ball as
  a lowpass (900 Hz at its heart), the seats' muffle, and the camera's placement as before. A recording is 2 to 4 Web
  Audio nodes a hit where a model built 20 to 180.
- **Levels**: each recording's gain puts it where the modelled sound was with the same physics, by loudness as the ear
  hears it (the BS.1770 K weighting over 0.4 s from the hit, 24 hits on each side):

  | Sound (physics) | Modelled | Recorded |
  |---|---|---|
  | dribble (0.3 / 0.7 / 1.1) | -38.9 / -32.0 / -28.0 | -39.3 / -32.0 / -28.0 |
  | dribble low and quick / high (0.8) | -32.8 / -29.3 | -32.2 / -29.4 |
  | bounce (0.2 / 0.7 / 1.1) | -40.6 / -30.9 / -27.0 | -41.7 / -30.9 / -26.9 |
  | swish | -31.2 | -31.0 |
  | net, off the rim | -36.6 | -36.4 |
  | glass (0.4 / 0.9) | -34.3 / -27.5 | -34.4 / -27.4 |
  | pass (slow / fast / hardest) | -57.4 / -52.6 / -50.0 | -60.1 / -53.0 / -49.8 |

- **The crowd bed** (`js/ui/arenaaudio.js`, `AudioConfig.crowd.rec`): once the crowd pack is ready (in the game's first
  second) the murmur fades in under everything, and the cheering crowd comes in as the crowd's level climbs (from 0.25,
  all of it from 0.6: the stakes, a close game late, a home team's run), the murmur easing to half under it. Each loop
  plays twice, half a loop apart and panned apart (the recording is mono): a wide crowd (the two speakers correlate
  0.56, the synthesized bed 0.97), 20 and 22 s before either comes round. The synthesized bed stays under it at 0.35 of its
  level for the arena's low rumble. Until the pack is ready, or with none, the synthesized bed is the bed. Its loudness
  (K-weighted) is within 0.9 dB of the synthesized bed's at the crowd's quietest, a late close game, the playoffs and
  its loudest (-43.4, -38.4, -35.3 and -29.3 dB against -43.3, -37.8, -34.5 and -30.2 dB).
- **A burst at the start of the bed**, found listening to the new clip: the synthesized layers started at their full
  gain and took a second to settle to the crowd's level, about 10 dB over it. They start at it now.
- **Tests**: every Trial 2 test plays the recordings where the game would (the offline ones load the pack first);
  `variety.js --synth 1` and `rec.use = false` switch them off; `ab.js` compares the bed by its loudness (K-weighted:
  the recording's spectrum differs by design); `recab.js` is new: each sound modelled then recorded through the mixer,
  then the crowd bed both ways, one clip to listen to. `cut.js` checks every loop as a browser decodes it (at 48 and
  44.1 kHz): the lead-in must match the loop's end where it wraps (0.991 and 0.995 for the two, 1 would be the same
  samples; MP3 coding is the difference).

New parameters: `court.rec` (which recordings, gains, curves, variants, the tight dribble's cut and level, the dead
spot's lowpass, the floor's shelf) and `crowd.rec` (the loops, their levels, the cheer's range, the murmur under it,
the pan, the fade in, the synthesized bed's share). New assets: 24 court takes and 2 crowd loops, licenses above.

### Every Trial 2 and Trial 1 test, rerun with the recordings

Results in `audit/audio2rec/` (Trial 2's own stay in `audit/audio2/`), on the code merged with the animation session's
Trial 10 commits up to cc00417; its Trial 9 commit (3d65fd9: the shot, the layup, the ball) came in as they finished,
and the court, shots, events and modes tests were run again on the merge (their files and the numbers below are from
that run):

| Test | Result | What it showed |
|---|---|---|
| Dribbles on the contact (`court.js`, 120 s of seed 21) | PASS | 106 of 106 dribbles scheduled within one drawn frame of the moment the contact is on screen (median 16 ms after it); their onsets at the speakers 20 ms after the scheduled start at the median, 95% within 21 ms (the model's in Trial 2: 17 and 30 ms; a recorded hit starts 3 ms into its take), all 94 clear of other sharp sounds within two frames of the picture; 73 squeaks (36 a minute), every one from a plant, never more than 3 in a second (before the merge: 113 of 113, 99 of 99, 85 squeaks) |
| Never the same twice (`variety.js`) | PASS | 33 of 33 sounds ten in a row with the same physics: no two alike, no take twice running; the dribbles are recordings 2 8 7 1 9 6 3 11 12 4, the glass its one recording in ten variants (the closest two correlate 0.74), the pass its two in five each (0.95 at most); the floor and the force: see below |
| The floor under a recorded dribble (`variety.js`) | PASS, after one fix | the field moves its level 1.8 dB, a dead spot is 2.6 dB down with its ring 5.9 dB down, the seats 6.6 dB down and muffled (the centroid from 369 to 226 Hz), a hard dribble 11.3 dB over a soft one. The first run failed the dead spot: at a 1.5 kHz lowpass the ring (0.9 to 2.5 kHz) went down less than the level; at 900 Hz it goes down 3.3 dB more |
| Swish, rim-in, air ball (`shots.js`) | PASS | at the hoop the swish is the net alone (6.5% rim metal), the make off the rim the iron then the net (91.5%), the air ball nothing (-91.2 dB against -34.8 and -33.3). The recorded swish is darker than the model's: its energy is mostly 0.5 to 3 kHz, 0.4% in the 3 to 9 kHz band the model's filled (78%), so what now tells the swish from the rim-in is the rim's metal, 14 times as much |
| Placement (`place.js`) | PASS | the near sideline's ends 8.9 dB and the far corners 9.6 dB to their side, the middle centred, the near sideline 2.6 dB louder and the far one 1.1 dB quieter than centre court, off the picture 16 dB to its side and 5.8 dB down, the far corners 6 dB more room and 1.8 dB less above 4 kHz than the near sideline |
| The rarer moments (`events.js`) | PASS | 15 of 15; the loose ball bouncing out on the apron and into the seats is the recorded ball now |
| Other ways to watch (`modes.js`) | PASS, after a fix to the test | the retro court and text mode: no court sounds, no errors, every result heard. The first run failed the replay: a body contact at 59.62 s, 0.05 s after the replay was last seen running, counted as in it by the test's 50 ms margin; the court's audio cannot decide a sound during a replay (it returns before it listens), so the test now asks at each court sound whether a replay is running: none during it (54.5 to 62.6 s), 68 after |
| The crowd against Trial 0 (`ab.js`) | PASS | every crowd reaction within 0.09 dB; the bed's loudness 0.08 dB under the old one (its plain energy 2.7 dB under: the recording has less of the synthesized rumble) |
| The audio never changes the game (`same.js`) | PASS | seeds 21 and 33, audio all on, all off and the arena only: the same play-by-play, box score and court |
| The duck, voice limits, mute and solo (`duck.js`, `voices.js`, `mutesolo.js`) | PASS | as before |
| Trial 1's listen test (`listen.js`, 150 s) | PASS | 791 sounds, never more than 8 at once, no errors; every shot's result from the court; the crowd 5.4 dB down (the bed) and 2.7 dB (reactions) while the booth talked, no surges, no chops; the mixer's own time 311 ms over the 150 s (Trial 2's: 458 ms) |
| Audio never costs a frame (`perfsame.js`, `perf.js`) | PARTIAL, as in Trial 2 | the same seeded game frame for frame with the audio on and off: +0.51 ms a frame at 1x and +0.56 ms at 4x, inside the round-to-round spread (1.81 and 0.97 ms); the audio's own work a frame down about 40% with the recordings (1x: 0.21 ms on average and 1.1 ms at the 99th percentile, Trial 2's 0.35 and 1.8; 4x: 0.43 and 1.6, Trial 2's 0.72 and 2.6). Unpaired, headless Chromium drew 3% fewer frames with the audio on at 1x (28.9 against 29.8 a second) and 4% more at 4x (16.3 against 15.6), its software drawing's noise either way. A browser that draws with its GPU is still not measured here |

### Still synthesized

The rim (every part), a ball rolling round the rim, the catch, the squeaks, footsteps and landings, bodies, falls,
rolling, the dunk, the block, the whistles, the buzzer and the horn, and the crowd's reactions (the roar, "ooh",
groan, boos, murmur and the chant): there is no recording of them yet. A rim hit and sneaker squeaks would be the most
useful next downloads, then a real catch, a whistle and cheers (Pixabay or CC0, or ElevenLabs on a paid plan).

### What to listen for

- **The clips** in `audit/audio2rec/` (headphones):
  - `recab.webm`: each recorded sound against the modelled one it replaced, same physics: eight dribbles modelled then
    recorded, three swishes, three nets off the rim, three hits on the glass, three fast passes, then the crowd bed at a
    regular season's level and at a big game's, synthesized then recorded (`recab_result.txt` says where each starts).
  - `court_60s.webm`: the first minute of the court listen test at the speakers with the recordings and the recorded
    crowd.
  - `swish_rimin_airball.webm`: a swish, a make off the rim, an air ball.
  - `variety_dribble.webm`, `variety_swish.webm`, `variety_board.webm`: one sound ten times in a row with the same
    physics.
- **In a game**: the dribbles are real bounces, each a little different, softer or harder with the ball's speed, duller
  on a dead spot and muffled in the seats; the swish is a real net; a make off the rim is the modelled iron and then a
  softer brush of the net; the glass booms; a hard pass whooshes and a soft one barely breathes. Under it all a real
  crowd murmurs, wide across the speakers, and in a close game late or in the playoffs a cheering crowd comes in; the
  booth still pushes the crowd down while it talks.
