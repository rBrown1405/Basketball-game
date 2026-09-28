# Audio architecture

The live broadcast's sound is built from a few small modules in `js/audio/`, plus the arena sounds
(`js/ui/arenaaudio.js`) and the commentary booth (`js/ui/commentary.js`) that plug into them.

| File | What it is |
|---|---|
| `js/audio/config.js` | `PBC.AudioConfig`: every tunable value (bus levels, ducking, voice limits and priorities, crowd numbers, recorder, debug keys). Change a value from the console and it takes effect right away. |
| `js/audio/bus.js` | `PBC.AudioBus`: the event bus. Publishers emit, audio systems subscribe. Every event is stamped with game time, clock, period and real time, and keeps the sounds it triggered. |
| `js/audio/mixer.js` | `PBC.AudioMixer`: one AudioContext, the buses, the master chain, ducking, the voice manager, meters and the rolling recorder. |
| `js/audio/assets.js` | `PBC.AudioAssets`: loads packed sound folders and decodes them a few at a time. |
| `js/audio/debug.js` | `PBC.AudioDebug`: the overlay (F9 or the backquote key) and the frame monitor. |
| `js/audio/session.js` | `PBC.Audio`: one live game's session; also derives runs, lead changes, ties, milestones and possession changes from the raw events. `PBC.Audio.current` is the running one. |

## Signal flow

```
voice slot -> bus input -> duck -> fader -> mute/solo -> meter ------------------> master in
                                                     \-> reverb send -> reverb -> return -> master in
master in -> glue compressor -> limiter -> out -> speakers
                                            \-> master meter, rolling recorder
```

Buses: `court` (sneakers, ball, bodies, rim), `players` (voices, grunts, chatter), `crowd`, `arena` (PA, music,
horns, whistles), `commentary`.

## Events

Publishers: `js/ui/live.js` (sim events, as they happen on screen), `js/match/view.js` and `js/match/ball.js`
(court sounds, catches, passes), `js/match/actor.js` (foot plants, landings, cuts), `js/audio/session.js` (derived).

| Group | Types |
|---|---|
| court | `dribble_contact`, `ball_bounce`, `rim_hit`, `board_hit`, `net` (`swish: true` for a clean make), `dunk_contact`, `block_contact`, `catch`, `pass` |
| bodies | `foot_plant` (`kind`: gait, step, landing; `speed`, `turn`, `decel`), `cut`, `landing` |
| refs | `whistle` (`kind`: foul, charge, def3, travel, ...), `horn` (`kind`: period_end, shot_clock) |
| sim | `jump_ball`, `inbound`, `advance`, `set`, `shot_release`, `score`, `rebound`, `turnover`, `foul`, `ft`, `timeout`, `sub`, `period_end`, `injury`, `possession_change` |
| derived | `run`, `lead_change`, `tie`, `milestone` |
| booth | `commentary_line` |

Sim events carry the original engine event as `e.sim`. Careful: the engine decides a shot's result before the
ball is released, so `shot_release` already knows `made`. Anything that should react to the result (crowd, calls)
must wait for `rim_hit`, `net`, `score` or the miss, not react at release.

## Playing a sound

```js
const slot = mixer.voice('rim', { dur: 0.6 });   // null when it should not play
if (slot) someNode.connect(slot.out);
```

Limits come from `AudioConfig.voices` (per sound, per bus, total). When a pool is full the least important, then
oldest, voice is faded and stolen; if everything playing matters more, the new sound is dropped. The event log shows
each sound, what it stole and anything dropped.

## Adding sound files

Opening `index.html` by double click blocks `fetch()` of local files, so sounds are packed into scripts:

1. Put `.wav`, `.ogg`, `.mp3` or `.m4a` files in `assets/audio-src/<folder>/` (court, crowd, chants, chatter,
   arena, commentary).
2. Add each file's license to that folder's `LICENSES.json`:
   `{ "dribble_01.ogg": { "license": "CC0", "source": "https://...", "author": "..." } }`.
   Files without a free license entry are refused.
3. Run `node tools/audio/pack.js`. It writes `assets/audio/<folder>/pack.js` and `assets/audio/manifest.js`.
4. In code: `PBC.AudioAssets.variants('court/dribble_')` returns the decoded buffers; fall back to a synth when
   it is empty.

## Proof tests

`node test/audio_trace.js [--seconds=45] [--speed=2] [--feet]` plays a real live game in headless Chromium
(Playwright) and checks bus solo and mute, the event log, voice limits and priority, ducking, the recorder and
audio cost per frame. It writes a trace, a WAV clip, an overlay screenshot and a JSON report to `test/out/`.
