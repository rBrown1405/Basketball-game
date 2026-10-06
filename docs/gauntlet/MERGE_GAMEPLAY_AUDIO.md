# Merge: the gameplay AI and audio branch into the animation gauntlet

`claude/awesome-einstein-v9bn0y` (26 commits past their common point) merged into `claude/new-session-at9s3k` (the
animation gauntlet, Trials 1 to 8) on 2026-09-29.

**Result: merged, every earlier trial's checks still pass** (`tools/audit/check.js` 116/116, the Trial 8 dribble
checks at all 10 actor ids, the pages load with no errors, the audio branch's own "audio never changes the game"
test passes), with the other branch's AI now also loaded by the headless audits so they measure the game as it is
played. Items still open are listed at the end.

## What came in

- **The gameplay AI program** (`docs/GAMEPLAY_AI_PLAN.md`, Phases 1 to 5): half-court man-to-man defense
  (`js/match/defense.js`), spacing and off-ball jobs (`offense.js`), called plays on the court (`plays.js`),
  rebounds the rebounder really gets to (`rebound.js`), playbooks and play calling (`js/core/playbook.js`,
  `playcall.js`), play tracking (`js/core/playstats.js`), the timeout huddle, the play designer, the Playbook and
  Play stats pages (`js/ui/huddle.js`, `playdesigner.js`, `playbook.js`, `playstats.js`), the coach's debug view
  (`js/match/debugdraw.js`, the D key) and the play paths on the court (`js/match/playdraw.js`, the O key), and the
  52-game gameplay audit (`tools/audit/run.js`, `sampler.js`, `report.js`, `anim.js`, with every phase's results in
  `audit/`).
- **The audio gauntlet, Trials 0 and 1** (`docs/AUDIO_GAUNTLET.md`): an event bus, mixer buses, voice limits,
  ducking, an audio console and sound packs (`js/audio/*`, `assets/audio/*`, `tools/audio/*`), with the court's
  events sent to it through `view.cue()` (a foot planting, a landing, a catch, a pass, a shot's result).
- **Dribble moves in place and combos** (`Ball.dribbleCombo`): crossovers, between the legs, behind the back and a
  hesitation chained from hand to hand, a reach at the ball answered with an urgent crossover or between the legs,
  the off arm up as a bar toward a reaching hand, and five new Lab scenarios (crossovers, between the legs and behind
  the back in place, a hesitation then go, and a combo into a drive past a defender who mirrors the ball).

## How the conflicts were resolved

| File | Both sides | Kept |
|---|---|---|
| `js/match/ball.js` | Trial 8's move queue (a move asked for while one waits goes after it, each started on a footfall at the start of a bounce) and the other branch's combos and urgent moves | one queue (`_queueMove`): a combo's moves go through it one after another, an urgent move goes to the front and skips the wait for a footfall (still at the start of a bounce), a move asked for on its own replaces what is left of a combo. The combo's move lengths moved into `Tune.handle.comboPeriodS`; a hesitation in a combo lasts as long as one on its own (`hesiPeriodS`, 0.8 s, not 0.62) |
| `js/match/actor.js` | Trial 8's foot landings (`_plantHere`, `_landFoot`) and the audio cues on the same lines | both: the landing code as Trial 8 left it, with the 'plant' and 'land' cues after it |
| `js/match/actor.js` | the off arm | Trial 8's guard pose (the hand at ~0.59 H, chest height in the stance): the other branch's lower bar was fitted to the stance before Trial 2 and held the hand at ~0.29 H, knee height, below the hips, in the Trial 8 stance. Their reach bar is kept, and never takes a hand that is reaching for a move's catch |
| `js/match/actor.js` | standing moves | the other branch's weight shift for between the legs now fades out by 2.5 ft/s, the speed its front-foot step stops at (walking with the feet square, the hips forward over them put the ball through a thigh, 1 frame in Trial 8's check), and so does their shoulder turn behind the back (on the move it put a hand or elbow pop back into Trial 8's walking move); their hesitation rise is used only by a combo's hesitation (a hesitation from `hesitate()` rises with the Trial 8 clip, and the two added together). On the move the merged code dribbles every move exactly as Trial 8 did: the crossover, between the legs and behind the back three times each at 3.3, 8, 12 and 16 ft/s give the same contacts, gaps and pops as the Trial 8 code |
| `js/match/view.js` | the overlays | all three, in this order: the play paths, the coach's debug view, then the Shift+D animation tools on top |
| `js/ui/live.js` | the player info the court reads | both: Trial 8's wingspan and the other branch's ratings for the defense and offense |

## Fixes the merge needed

- **The headless audits played a different game than the page.** `tools/audit/load.js` did not load the new defense,
  offense, plays and rebounds, so every quarter, check and sweep ran the old AI. It now loads the same files in the
  same order as `match_test.html`, and gives each player the same ratings as the live view (so does
  `match_test.html`).
- **A catch on the run turned the receiver to face the passer.** The pass leads the receiver now (the other branch),
  so more catches happen at a run; the receiver was turned to the passer 0.45 s before the catch and stayed turned
  after it, so a receiver caught at a sprint (12.7 ft/s) turned ~130 degrees while braking, and pulled up for a
  jumper over a foot left ~80 degrees off the hips (the knee caved in 36 degrees; the first-minute knee check failed
  at 0.10%). Caught at more than 4.5 ft/s or into a dribble, the receiver now faces the way they are going and the next
  move turns them (`choreo.js`, `afterCatch`; the turn to the passer and the eyes on the ball before the catch are
  Trial 10's).
- **A move's turn left the planted feet behind.** A move (a clip) turned the hips over a planted foot without turning
  it: a pull-up turned to the rim out of a run, or a wall-up turned to the shooter, left the foot up to ~90 degrees off
  the hips and the knee caved in 25 to 45 degrees over it. Past `Tune.floor.pivot.clipFreeDeg` (30 degrees) a planted
  foot now pivots on its ball as a standing turn's does (the heel up first), unless the move has pivots of its own.
- **Two overlays, one corner.** The coach's debug panel moves right of the animation tools' panel when both are open,
  and in the live view D (the coach's view) no longer fires on Shift+D (the animation tools).

## Proof

- `node tools/audit/check.js`: **116/116** (every trial's known-answer tests, the Trial 8 dribble lab, the first minute
  of seed 7 with the new AI: sliding worst 0.10 in, 1895 steps, 99.89% clear, knees caving in 0.04%, no instant starts,
  turns or hip jumps, determinism at every playback speed).
- The Trial 8 dribble checks at actor ids 0 to 9: **10/10 pass** (the hand on the ball at every contact, worst 0.02 to
  0.04 in; the ball through nobody; the off arm up 98.3 to 98.6% standing, 91 to 94% retreating).
- The pages in Chromium, **no page errors**: the game's start screen, a live game (D and Shift+D, both overlays on),
  `match_test.html` with the play paths, the coach's debug view and the animation tools all on, and the Lab with the
  new scenarios.
- The audio branch's own test (`tools/audio/test/same.js`, seed 21, 12 possessions, the audio all on, all off, arena
  only): **PASS**, the same game and the same court frame for frame.
- The gameplay branch's own animation checks (`tools/audit/anim.js`, its 4 seeds x 20 possessions, against its Phase 5
  numbers, the same tool on both sides), per 10,000 player-frames:

  | | the other branch | merged |
  |---|---|---|
  | body contacts, all | 213.3 | 184.8 |
  | the ball in a thigh | 10.1 | 2.0 |
  | foot through foot | 78.4 | 63.3 |
  | knee through knee | 27.1 | 23.1 |
  | shin through shin | 85.1 | 80.4 |
  | the ball in the torso / head | 3.6 / 0.8 | 3.4 / 0.4 |
  | a hand / forearm in the torso | 4.1 / 2.1 | 5.7 / 4.1 |
  | an arm in the head | 1.9 | 2.5 |
  | feet stuck behind (per 10,000 running frames) | 26.9 (445 times) | 3.0 (71 times) |

- The other branch's five new Lab scenarios, both sides measured with the same joint-pop meter (a hand or elbow
  over 1500 ft/s^2 in the body's frame): **224 pops on the other branch's own code, 69 merged** (crossovers in place 50
  to 20, between the legs 42 to 14, behind the back 30 to 12, the hesitation 22 to 0, the combo 80 to 23).
- Cost: three minutes of seed 7 alone on the machine, 3.05 ms a step at the median and 6.4 ms at the 99th percentile
  (2.86 and 6.9 before the merge): the new AI costs ~0.2 ms a step.

Three full quarters with the new AI against the Trial 8 baselines (the Trial 8 ones played the old AI: different
games, so a guide rather than a like-for-like test):

| | Trial 8, seed 7 | merged | Trial 8, seed 21 | merged | Trial 8, women's seed 7 | merged |
|---|---|---|---|---|---|---|
| sliding over 0.25 in / worst (in) | 0 / 0.11 | 0 / 0.10 | 0 / 0.08 | 0 / 0.11 | 0 / 0.04 | 0 / 0.13 |
| clear steps | 99.94% | 99.90% | 99.92% | 99.92% | 99.91% | 99.92% |
| knees caving in | 0.04% | 0.02% | 0.04% | 0.04% | 0.06% | 0.04% |
| instant starts, turns, turn snaps, hip jumps | 0 | 0 | 0 | 0 | 0 | 0 |
| hard cuts on the outside foot, hips dropping | 100%, 100% | 100%, 100% | 100%, 100% | 100%, 100% | 100%, 100% | 100%, 100% |
| joint pops per player-minute | 39.0 | 36.0 | 45.0 | 38.0 | 34.4 | 36.1 |
| locomotion pops per minute | 3.27 | 2.78 | 3.53 | 3.62 | 2.92 | 3.58 |
| dribble contacts off the ball | 12.2% | 16.2% | 17.7% | 17.7% | 10.1% | 15.3% |
| dribble moves | 117 | 122 | 153 | 138 | 118 | 123 |

## Still open

- **Standing and back-to-back moves** (the new Lab scenarios): 69 hand and elbow pops in the five, where Trial 8's
  walking moves have none. With the other branch's standing poses turned off 62 are left, so they come from Trial 8's
  moves at a standstill, which its lab never tried. Next, before Trial 10 goes on (the scenarios go into `handle.js`
  and `check.js`, and the standing moves' numbers into `tune.js`).
- **Dribble contacts in live games**: 15 to 18% of contacts have a frame with the hand over 0.25 in off the ball (10 to
  18% in Trial 8's quarters). Not the merged animation: on the move it dribbles every move as Trial 8 did (above), and
  the urgent moves happen once a quarter (turned off, the same 15.5%). The women's seed 7 gives 10.1% on the Trial 8
  code, 12.6% on the Trial 8 game with the merged animation and 16.2% with the other branch's game but its new AI
  files left out (both measured before the last change, the behind-the-back turn made standing only), and 15.3% with
  everything: most of it follows the other branch's game (more catches on the move, the passes led to the receiver),
  and a single seed moves by a few points with any change. Carried with Trial 8's live-game
  items to Trials 6, 7, 10 and 13.
- **A hand or forearm in the torso** in the other branch's check (4.1 and 2.1 per 10,000 frames to 5.7 and 4.1): the
  holds and the catch, Trial 10.
- **Knees caving in slides and backpedals** (most of what is left of the knee numbers): Trial 6.
