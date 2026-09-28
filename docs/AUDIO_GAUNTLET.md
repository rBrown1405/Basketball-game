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
