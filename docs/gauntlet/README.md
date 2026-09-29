# The NBA Animation Gauntlet

A series of trials to take the procedural player animation to broadcast quality. Every trial has pass or fail
criteria with measured proof, and every trial re-runs the earlier ones (regression check).

- Tools: Shift+D in `match_test.html` or the live game.
- Headless scorecard: `node tools/audit/quarter.js --seed 7`.
- Gait lab (every gait on four bodies, blind naming, the scripted changes of gait): `node tools/audit/gaits.js`.
- Dribble lab (14 dribbling scenarios, the moves included, with the game's own meters): `node tools/audit/handle.js`.
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

Merges:

| Merged | Result | Notes |
|---|---|---|
| The gameplay AI and audio branch (`claude/awesome-einstein-v9bn0y`: the half-court AI, called plays, play tracking, the audio gauntlet's Trials 0 and 1, dribble moves in place and combos) | every earlier trial's checks pass; the headless audits now load the new AI | [MERGE_GAMEPLAY_AUDIO.md](MERGE_GAMEPLAY_AUDIO.md) |
