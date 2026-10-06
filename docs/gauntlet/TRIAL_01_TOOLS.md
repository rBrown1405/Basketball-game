# Trial 1: The Tools

**Result: PASS.** Every tool toggles on and off during a live simulated game (the harness in engine mode and the
real Live Game screen), and the meters pass known-answer tests.

## How to use

- **Open:** Shift+D in `match_test.html` (or its "Debug tools" button) and in the real Live Game. `match_test.html?mode=engine&seed=7` repeats the same game every time.
- **Playback:**
  - 0.1x, 0.25x, 0.5x, 1x, 2x, 4x; Space pauses.
  - `,` and `.` step one frame back or forward; hold Shift to step 10. "Live" returns to the present.
  - Debug speed multiplies the game's own speed setting, so set the game to 1x for a true 0.25x.
- **Overlays**, each with its own key:
  - F: heel/ball/toe contacts, green locked, yellow sliding, red past 0.83 in; purple is through the floor, blue ring is a floating planted foot
  - M: centre of mass, its floor shadow and the base of support
  - V: velocity (orange) and acceleration (blue)
  - A: hips (white), chest (orange) and wanted facing (grey)
  - L: head look ray; red dot means no target, amber means a stale target
  - B: state label
  - J: joint limits, red past a human limit, amber clamped, yellow out of reach
  - H: hand to ball gap in inches
  - K: skeleton
- **Players:** click a player or press Tab to select; the panel shows his live numbers. I cycles isolate: off, dim, hide.
- **Orbit:** O orbits the selected player. Drag or use the arrow keys to turn, wheel or +/- to zoom, O to exit.
- **Report:** "Copy report" puts the seed, frame, selected player and scorecard (JSON) on the clipboard.
- **Headless:**
  - `node tools/audit/quarter.js --seed 7 [--periods 1] [--women] [--out f.json]` plays a full quarter and prints the scorecard.
  - `node tools/audit/check.js` runs the known-answer and determinism tests.

## A. What changed

- `js/match/tune.js` (new): the one config, `PBC.Match.Tune`. It has groups `clock` (fixed step 1/60 s, step cap), `debug` (every meter threshold, colors, recorder length, arrow scales) and `segMass` (Dempster/Winter segment masses). Later trials add their groups here.
- `js/match/debug.js` (new): `Meters` (shared by the overlay, the Lab and the headless audit), `Recorder` (12 s rewind at the sim step, with overlay data per frame), `Session` (panel, keys, overlays, isolate, orbit, report), `install` (Shift+D).
- `js/match/view.js`:
  - **fixed-step clock:** the simulation only advances in whole 1/60 s steps at every speed and refresh rate;
  - every body is solved once per step, in `tick()`, not at draw time;
  - between steps the renderer blends the last two steps when the tools are closed (smooth on 144 Hz screens), and shows exact steps when they are open;
  - rewound frames, isolation dimming/hiding, orbit rendering and the overlay hooks.
  - The replay recorder now stores the pose too, so replays keep forearm twist and finger curl (this fixes the corkscrew forearms).
- `js/match/actor.js`: `_note()` remembers why the director last commanded each player (for the state label).
- `js/match/choreo.js`: reason tags (`_why`) around jobs, beat planners, beat firing and the ambient sections. Labels only, no behavior change.
- `js/match/rig.js`: exports `TORSO_PAIRS` and `FING_CH` for the limit meter.
- `js/lab/lab.js`: the Lab now uses the game's step (1/60, solved every step; it used to step at 1/120) and the shared meters (heel, ball and toe, not just the ball).
- `match_test.html`: `?seed=` for engine games, 0.25x and 0.5x buttons, the Debug tools button.
- `index.html`, `lab.html`: load `tune.js` and `debug.js`. `js/ui/live.js`: Shift+D in the live game.
- `tools/audit/` (new): `load.js` (runs the game in Node), `quarter.js` (scorecard), `determinism.js`, `check.js`.

## B. Scorecard

| Criterion | Grade | Evidence |
|---|---|---|
| Overlay: foot contacts (colored when planted) | PASS | toggles with F live; known-answer: a foot pushed 1.00 in reads 1.001 in; flat-footed turn flags the heel sweep (3.85 in); a heel-up pivot reads 0.00 |
| Overlay: centre of mass | PASS | standing CoM 0.577 H high, 0.54 in off the midline, over the base of support |
| Overlay: velocity and acceleration vectors | PASS | toggles with V; values in the panel (ft/s, ft/s^2, g) |
| Overlay: facing direction | PASS | toggles with A: hips, chest and wanted facing arrows from the solved skeleton |
| Overlay: head look target | PASS | toggles with L: ray to the target, red "none", amber "stale" |
| Overlay: animation state label | PASS | toggles with B, e.g. "OFF · slide 8.8 ft/s · ready · why: jump_ball" (live game) |
| Playback 0.1x / 0.25x / 0.5x / 1x | PASS | 60 display frames advanced exactly 6 / 15 / 30 / 60 steps |
| Pause and frame by frame | PASS | paused: 0 steps in 30 frames; `.` +1 step; Shift+. +10; `,` rewinds 30 recorded frames and `.` returns to the identical live frame |
| Isolate one player | PASS | I cycles dim then hide (screenshots 04, 05) |
| Free orbit camera | PASS | O, drag, arrows, zoom (screenshots 06-08) |
| Foot slide meter | PASS | heel/ball/toe contact meter, known-answer tests above |
| Hand to ball meter | PASS | known-answer: 3.00 in reads 3.000, touching reads 0.000; dribble, hold, shot, pass and catch gaps |
| Joint limit warning | PASS | knee 160 deg warns, 150 deg does not, knee bent back 8 deg warns, elbow hyperextended warns |
| Toggle on and off during a live game | PASS | harness engine game and the real Live Game (Shift+D open and close), no page errors |
| Honest slow motion (same frames at every speed) | PASS | 1500/1500 steps identical at 1x, 0.25x, 0.1x, 144 Hz and a jittery frame rate |
| Cost | PASS | overlays with every layer for every player 0.48 ms per frame (browser); meters 0.16 ms per step; zero when closed |

`node tools/audit/check.js` shows 24/24 checks passed.

## Baseline (the numbers every later trial must beat)

Full first quarter, real engine, fixed 1/60 s steps (files in `docs/gauntlet/baseline/`):

| Metric | Seed 7 | Seed 21 |
|---|---|---|
| Foot contacts sliding over 0.25 in / over 0.83 in | 8.77% / 6.28% | 9.11% / 6.55% |
| Heel contacts over 0.83 in | 11.68% | 12.14% |
| Ball of the foot p99 slide | 0.17 in | 0.16 in |
| Foot points below the floor (per 100 player-frames) | 9.06 | 9.49 |
| Final pose past a human joint limit | 0.73% of player-frames | 0.80% |
| Body acceleration snaps (over 60 ft/s^2) | 36.6 per player-minute | 35.0 |
| Turns that start at full speed in one frame | 59.0% | 61.4% |
| No look target / stale look target | 15.4% / 9.5% | 15.6% / 11.9% |
| Catch gap p90 | 10.8 in | 15.6 in |
| Torso overlaps (pair-frames) / hands inside another body | 128 / 3,168 | 287 / 2,767 |

## C. Devil's advocate

1. **"The overlay is a mess of text when ten players bunch up."** Fixed: everyone but the selected player now gets a short label (side and gait). Isolate dims or hides the rest.
2. **"Slow motion in the old game already existed, so what changed?"** Before, 0.25x ran different, smaller physics steps. The same quarter at 0.25x on the old code measured catch gaps of 23.7 in instead of 10.8 in, and 49% instant turns instead of 59%. So slow motion showed a different animation than the game plays. Fixed: whole steps at every speed. The determinism test proves the frames are identical.
3. **"The Lab and the game disagree."** They did: 1/120 s steps and a ball-only slide meter. Fixed: the Lab uses the game's step and the same meters.

## D. Regression check

No earlier trials to break. The new clock at 1x reproduces the pre-gauntlet animation exactly, with every metric identical over a full quarter (seed 7). The replay recorder now keeps the pose, which fixes replays' forearm twist.

## E. What to watch for

- Open `match_test.html?mode=engine&seed=7`, press Shift+D, click a player, set **0.25x**, and turn on F.
  - Watch heels turn yellow and red when a planted foot swivels (Trial 3's target).
  - Watch purple dots when swinging toes dip through the floor.
- Press `.` repeatedly while paused and watch each frame. `,` goes back up to 12 s.
- Press O to orbit a player and check the knees and feet from the side.
- In the real game, set the game speed to 1x before using 0.25x (the debug speed multiplies the game speed).
