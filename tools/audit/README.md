# Gameplay audit

Plays whole games of the Live view headless and reports what the players actually do: on-ball and off-ball
defense, standing around, open shooters, who shoots threes, where each position spends its time, rebounds and the
ball. It is rerun after every gameplay phase to show what improved and that nothing broke.

```
node tools/audit/run.js --games 52 --procs 4 --seed 101 --out audit/phase1 --label "Phase 1 baseline"
node tools/audit/run.js --games 52 --out audit/phase2 --label "Phase 2" --baseline audit/phase1/metrics.json --baseLabel "Phase 1"
```

Needs Node and Playwright with Chromium (the cloud image has both; locally `npm i -g playwright` and pass
`--chrome <path>` if Chromium is somewhere else). About 45 s of wall time per game per process.

- `run.js` opens `index.html` once per game in a fresh page, seeds `Math.random`, loads `sampler.js` and calls
  `PBCAudit.playGame(seed)`. Each seed makes its own league, so the games cover many rosters, offensive systems and
  defensive schemes. The same code and seed always give the same game.
- `sampler.js` plays the user's first game of that league from the tip to the final buzzer exactly as the Live view
  plays it (no rendering), watching the ball every frame and every player every 0.1 s. It changes nothing in the
  game: the ball's give / pass / shoot are wrapped on that one ball only to see when they happen.
- `rebuild.js` regenerates the report files from a saved `games.json` after a change to `report.js`
  (`node tools/audit/rebuild.js audit/phase1`), without playing the games again.
- `report.js` turns the per-game records into the metric tables. Output in `--out`:
  - `report.md`: the tables (committed with each phase),
  - `report.html`: the same with half-court diagrams of flagged moments,
  - `metrics.json`: every number in the report (the `--baseline` of the next run),
  - `games.json`: the raw records (large, not committed).

What the sections measure (half court = the offense set up in the front court with the ball in a player's hands,
outside free throws, timeouts and dead balls):

1. **On-ball defense**: the defender of the ball handler (his assigned man in man schemes, the nearest defender in
   zones): between the handler and the basket, low stance, backing away from a handler who is not attacking, back
   turned while walking away, running with crossed feet while not beaten, cushion by the handler's 3PT rating.
2. **Off-ball defense** (man schemes): one pass away in the passing lane, two passes away in help position (in or
   next to the lane, or on the line from the ball to the rim), extra defenders crowding a ball that is already
   guarded with no drive to help on, defenders far from their man and not helping.
3. **Offense movement**: off-ball players standing still (under 1 ft/s), not having moved 3 ft in 3 s, long
   stand-stills, clumping, and each player's job (moving for the engine's next event, running a half-court action,
   holding a spacing spot, or no job).
   The report also breaks down what was moving each flagged defender (his own positioning rule, a planner for the
   engine's next event, a clip), the engine beat under way and the handler's distance from the rim.
4. **Shot selection**: the engine's shots as the Live view shows them: threes by rating and position, the engine's
   open / contested / tight call against the real distance of the nearest defender at the release, shot clock.
5. **Open catches**: what a decent shooter (70+ for a shot from where he is) does after catching it with nobody
   within 10 ft, and whether the ball finds wide-open shooters off the ball.
6. **Spacing**: where each position spends its half-court time (rim, paint, short corner, mid-range, corner 3,
   above-break 3, deep), players beyond the arc, bigs inside.
7. **Rebounding and the ball**: grab height, how far a carom bends in the air toward the rebounder's hands, balls
   that jump or hang, floor bounces, box-outs.
