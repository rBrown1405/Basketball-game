# The NBA Animation Gauntlet

A series of trials to take the procedural player animation to broadcast quality. Every trial has pass or fail
criteria with measured proof, and every trial re-runs the earlier ones (regression check).

- Tools: Shift+D in `match_test.html` or the live game.
- Headless scorecard: `node tools/audit/quarter.js --seed 7`.
- Tests: `node tools/audit/check.js`.
- Tuning: every value lives in `js/match/tune.js` (`PBC.Match.Tune`).

| Trial | Result | Report |
|---|---|---|
| 0 The Audit | done | [TRIAL_00_AUDIT.md](TRIAL_00_AUDIT.md) |
| 1 The Tools | PASS | [TRIAL_01_TOOLS.md](TRIAL_01_TOOLS.md) |
| 2 The Body | PASS | [TRIAL_02_BODY.md](TRIAL_02_BODY.md) |
