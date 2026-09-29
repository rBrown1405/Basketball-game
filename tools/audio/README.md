# Audio tools

## Sound packs

Recordings go in `assets/audio/<folder>/` (`court`, `crowd`, `chants`, `chatter`, `arena`, `commentary`, `test`), and
every file needs a row in that folder's `LICENSES.md`: the file, where it came from, who made it, and its license.
The packer refuses a file without a row, or with a license the game cannot ship (only CC0 or public domain, CC BY
with the author credited, or made by this project; no NC, ND or SA, no "personal use", no "royalty free but no
redistribution").

```
node tools/audio/pack.js court        # assets/audio/court/ → js/audio/packs/court.js (base64), rewrites js/audio/packs/index.js
node tools/audio/pack.js --all
node tools/audio/testpack.js          # the test pack's three tones (made here), then: node tools/audio/pack.js test
```

A pack is a script so a game opened by double-clicking `index.html` (a `file://` page, where `fetch` is blocked) can
load it. A file's sound name is its name without the take number (`rim_01.ogg`, `rim_02.ogg`: two takes of `rim`).
`js/audio/assets.js` loads the packs that exist when a live game's audio starts; until a pack is decoded, or when it
has no such sound, the synthesized sound plays.

## Tests

Headless Chromium through Playwright, like the gameplay audit (`tools/audit`). Each writes its result file (and any
recordings) to `--out`, `audit/audio1` by default.

| Test | What it proves | Result file |
|---|---|---|
| `node tools/audio/test/listen.js` | a live game with every bus event traced next to the sounds it played (real time, audio time, game clock), a recording at the speakers, the mixer's "last 30 s", the crowd duck sampled every 100 ms | `listen_result.txt`, `listen_trace.txt`, `listen_60s.wav`, `listen_last30.wav` |
| `node tools/audio/test/mutesolo.js` | every bus soloed and muted during a live game through the console's own buttons, with meters and a 30 s WAV per soloed bus | `mutesolo_result.txt`, `solo_<bus>.wav` |
| `node tools/audio/test/same.js` | the audio settings change nothing in the game or on the court (seeded games, frame by frame, audio all on / all off / arena only) | `same_result.txt` |
| `node tools/audio/test/ab.js --rev 8baee19` | every sound and the crowd bed within 1 dB of an earlier commit's audio (the same random variations on both sides); the duck compared | `ab_result.txt` |
| `node tools/audio/test/duck.js` | the crowd duck on a fixed script of booth lines and roars, with the old and new settings | `duck_result.txt` |
| `node tools/audio/test/voices.js` | voice limits and priority with the caps forced: a whistle or horn takes a lower sound's place, a dribble never displaces a roar, cooldowns and the 16x cut | `voices_result.txt` |
| `node tools/audio/test/perf.js` | frame times with the audio on and off at 1x and 4x (real frames), and the audio's own main-thread time per frame | `perf_result.txt` |
| `node tools/audio/test/perfsame.js` | the same seeded game frame for frame with the audio on and off, each frame's real work timed, two rounds each (the round-to-round spread is the noise) | `perfsame_result.txt` |
| `node tools/audio/test/cmp_audit.js A B` | two gameplay audit runs (`tools/audit/run.js ... --audio 0/1`) are the same games, field by field | (prints) |

Headless Chromium has no speech voices, so `listen.js` and `perf.js` stand in a speech engine with a real one's
timeline (a line starts after ~40 ms and lasts ~0.33 s a word); in a browser with voices the booth uses them.

The WAV recordings stay out of git (`audit/audio1/.gitignore`); `node tools/audio/webm.js <file.wav> ...` makes a
small Opus WebM of each (the browser's own encoder, ~0.7 MB a minute) to keep and share.
