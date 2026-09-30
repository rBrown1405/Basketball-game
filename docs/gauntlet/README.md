# The NBA Animation Gauntlet

A series of trials to take the procedural player animation to broadcast quality. Every trial has pass or fail
criteria with measured proof, and every trial re-runs the earlier ones (regression check).

- Tools: Shift+D in `match_test.html` or the live game.
- Headless scorecard: `node tools/audit/quarter.js --seed 7`.
- Gait lab (every gait on four bodies, blind naming, the scripted changes of gait): `node tools/audit/gaits.js`.
- Dribble lab (14 dribbling scenarios, the moves included, with the game's own meters): `node tools/audit/handle.js`.
- Pass lab (22 two-player passing scenarios, every pass kind and variation, with the game's own pass meter): `node tools/audit/pass.js`.
- Shot lab (25 shooting scenarios: two shooters' forms, every kind of jump shot, free throw routines, layups, runners, dunks, putbacks and a tip, with the game's own shot meter): `node tools/audit/shot.js`.
- Glass lab (15 scenarios: misses off the rim and the glass, box-outs, a long and a weak-side rebound, a miss run down off the floor, contests, blocks, a poke steal, an interception and a reach-in, with the game's own glass meter): `node tools/audit/glass.js`.
- Loose balls (random loose balls, each run down by a player already on the move): `node tools/audit/chase.js`.
- Tests: `node tools/audit/check.js`.
- Tuning: every value lives in `js/match/tune.js` (`PBC.Match.Tune`).

| Trial | Result | Report |
|---|---|---|
| 0 The Audit | done | [TRIAL_00_AUDIT.md](TRIAL_00_AUDIT.md) |
| 1 The Tools | PASS | [TRIAL_01_TOOLS.md](TRIAL_01_TOOLS.md) |
| 2 The Body | PASS | [TRIAL_02_BODY.md](TRIAL_02_BODY.md) |
| 3 The Floor | PASS | [TRIAL_03_FLOOR.md](TRIAL_03_FLOOR.md) |
| 4 The Weight | PASS | [TRIAL_04_WEIGHT.md](TRIAL_04_WEIGHT.md) |
| 5 The Gaits | PASS (live-game slide transitions and forced steps carried to Trial 6) | [TRIAL_05_GAITS.md](TRIAL_05_GAITS.md) |
| 8 The Handle | PASS in the lab (live-game contacts off the ball and the ball in a body carried to Trials 6, 7, 10 and 13) | [TRIAL_08_HANDLE.md](TRIAL_08_HANDLE.md) |
| 9 The Shot | PASS in the lab (live: 71 of 75 jump shots with every phase, 41 of 42 layups and 13 of 14 dunks with the right footwork, 28 of 28 free throws with a routine; the live misses carried to Trials 7 and 13, the defensive slide pops to Trial 6) | [TRIAL_09_SHOT.md](TRIAL_09_SHOT.md) |
| 10 The Pass and the Catch | PASS in the lab (live-game items carried to Trials 6, 13 and the Final Eye Test; arm pops while moving and head and neck pops in games above Trial 8's, open) | [TRIAL_10_PASS.md](TRIAL_10_PASS.md) |
| 11 The Glass and the Contest | PASS (lab: 15 of 15 scenarios; live: 0 caroms steered or pulled in three quarters, 95 of 96 contests and 7 of 7 blocks toward the ball, box-outs in contact 76 of 88; open: live blocks mostly short of the ball, carried to Trial 6; 5 to 13 % more frames of the ball in a body, carried to Trial 12) | [TRIAL_11_GLASS.md](TRIAL_11_GLASS.md) |

Merges:

| Merged | Result | Notes |
|---|---|---|
| The gameplay AI and audio branch (`claude/awesome-einstein-v9bn0y`: the half-court AI, called plays, play tracking, the audio gauntlet's Trials 0 and 1, dribble moves in place and combos) | every earlier trial's checks pass; the headless audits now load the new AI | [MERGE_GAMEPLAY_AUDIO.md](MERGE_GAMEPLAY_AUDIO.md) |
