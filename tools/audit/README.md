# Gameplay audit

Plays whole games of the Live view headless and reports what the players actually do: on-ball and off-ball
defense, standing around, open shooters, who shoots threes, where each position spends its time, rebounds and the
ball. It is rerun after every gameplay phase to show what improved and that nothing broke.

```
node tools/audit/run.js --games 52 --procs 4 --seed 101 --out audit/phase1 --label "Phase 1 baseline"
node tools/audit/run.js --games 52 --out audit/phase2 --label "Phase 2" --baseline audit/phase1/metrics.json --baseLabel "Phase 1"
node tools/audit/run.js --repo /tmp/phase2 --games 52 --out audit/phase3/phase2-code --label "Phase 2 code"
node tools/audit/run.js --games 52 --out audit/phase3 --label "Phase 3" --baseline audit/phase3/phase2-code/metrics.json --baseLabel "Phase 2"
node tools/audit/run.js --repo /tmp/phase3 --games 52 --out audit/phase4/phase3-code --label "Phase 3 code"
node tools/audit/run.js --games 52 --out audit/phase4 --label "Phase 4" --baseline audit/phase4/phase3-code/metrics.json --baseLabel "Phase 3"
node tools/audit/run.js --games 52 --out audit/phase4/calls --label "Phase 4, the coach calling plays" --calls 1 --baseline audit/phase4/metrics.json --baseLabel "Phase 4, no calls"
```

When the audit itself gained metrics since the last phase, measure the last phase's code again with this audit
first (`--repo` plays the games from another copy of the game, e.g. a checkout of the last phase's commit), and use
that as the baseline, so both sides are measured the same way (Phase 2 did this: `audit/phase2/phase1-code/`):

```
git worktree add /tmp/phase1 <phase 1 commit>
node tools/audit/run.js --repo /tmp/phase1 --games 52 --out audit/phase2/phase1-code --label "Phase 1 code"
node tools/audit/run.js --games 52 --out audit/phase2 --baseline audit/phase2/phase1-code/metrics.json --baseLabel "Phase 1"
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
   guarded with no drive to help on (and how much of that is a defender whose own spot is on the ball, against one
   passing by on his way to a spot away from it), defenders far from their man and not helping (a drive's rotation,
   the low man or the man sinking to the low man's man, is help). The two defenders of a ball screen or a hand-off
   are counted apart for 2.5 s after it: two on the ball there is the coverage (a hedge, a show, a blitz, ice) and
   the recovery, not crowding.
3. **Offense movement**: off-ball players standing still (under 1 ft/s), their average speed and time at a jog or
   faster, not having moved 3 ft in 3 s, long stand-stills, clumping, and each player's job (moving for the engine's
   next event, running a half-court action, on or around his spot in a called play, holding a spacing spot, or no
   job).
   The report also breaks down what was moving each flagged defender (his own positioning rule, a planner for the
   engine's next event, a clip), the engine beat under way and the handler's distance from the rim.
4. **Shot selection**: the engine's shots as the Live view shows them: threes by rating and position, the engine's
   open / contested / tight call against the real distance of the nearest defender at the release, shot clock.
5. **Open catches**: what a decent shooter (70+ for a shot from where he is, within 26 ft of the rim) does after
   catching it with nobody within 10 ft, and whether the ball finds wide-open shooters off the ball.
6. **Spacing**: where each position spends its half-court time (rim, paint, short corner, mid-range, corner 3,
   above-break 3, deep), players beyond the arc, bigs inside.
7. **Rebounding and the ball**: grab height, how far a carom bends in the air toward the rebounder's hands, balls
   that jump or hang, floor bounces, box-outs.
8. **Called plays** (Phase 3 on; earlier code shows n/a): half-court possessions with a call or in flow, plays per
   game, plays that reached a read (early reads counted as the play working), steps run, why plays ended (a reset,
   a turnover, a foul), points per half-court possession with a call and in flow, how close the players are to the
   play's spots 1.2 s into each step, inbound plays, and the pick-and-roll coverage: what the screener's man is
   doing 0.6 s after a ball screen (back in the lane, at the screen, on the ball, switched) against the coverage the
   engine called. Tables by play family, the most-called plays and the reads taken.

9. **The head coach's calls and the drawn plays** (Phase 4, runs with `--calls 1`; other runs show n/a): in each
   game the user's playbook gets four plays drawn in the play designer's format and a library play made the coach's
   own, and the coach calls a play for the next half-court possession every few possessions (the drawn ones and the
   book's), an inbound play for the next throw-in under the basket, and two defensive calls (man-to-man with a blitz
   on ball screens, then a 2-3 zone, six defensive possessions each). The report shows how many calls the engine ran,
   how the coach's calls and the drawn plays ended (a read, a turnover), their points, how close the players get to
   a drawn play's spots, and whether the defense played the called scheme and coverage and went back to its own
   when the call ran out.

```
node tools/audit/run.js --games 52 --out audit/phase4/calls --label "Phase 4, the coach calling plays" --calls 1 --baseline audit/phase4/metrics.json --baseLabel "Phase 4, no calls"
```

10. **Play tracking and analytics** (Phase 5 on; earlier code shows n/a): the tallies the engine keeps for the box
   score's Plays tab and the season screens (`js/core/playstats.js`), checked against the game itself: the
   possessions and points of each team equal the game's, the calls equal the audit's own count (section 8), and a
   live game's possession log has one entry per possession. Then what the screens show, over all the games:
   possessions by how they were played (a called play, flow, transition, other) with their points per possession,
   calls completed, calls the shot clock forced, calls that broke down and why (a turnover, the shot clock, a denied
   pass, a blown screen, a switch, the help, well defended) and at the entry, counters, the shot quality of the calls'
   shots, points allowed per possession by defensive scheme (table 10b) and the calls by the ball-screen coverage the
   defense played (table 10c), and the size of the tallies kept with a box score.

```
node tools/audit/run.js --games 52 --out audit/phase5 --label "Phase 5" --baseline audit/phase4/metrics.json --baseLabel "Phase 4"
node tools/audit/run.js --games 52 --out audit/phase5/calls --label "Phase 5, the coach calling plays" --calls 1 --baseline audit/phase4/calls/metrics.json --baseLabel "Phase 4, the coach calling plays"
```

**Animation checks** (`anim.js`): the procedural animation work's regression checks, run on real possessions:
body contact (the ball, hands or forearms inside the player's own body; knees, shins or feet of the two legs through
each other) and feet stuck far behind the hip while running, per 10,000 player-frames:

```
node tools/audit/anim.js --out audit/phase2/anim.json --baseline audit/phase2/phase1-code/anim.json
node tools/audit/anim.js --repo /tmp/phase1 --out audit/phase2/phase1-code/anim.json
node tools/audit/anim.js --repo /tmp/phase2 --out audit/phase3/phase2-code/anim.json
node tools/audit/anim.js --out audit/phase3/anim.json --baseline audit/phase3/phase2-code/anim.json
node tools/audit/anim.js --out audit/phase5/anim.json --baseline audit/phase4/anim.json
```

The Live view's coach's debug view (`js/match/debugdraw.js`: the D key or the 🧠 button in a game, or Broadcast
settings) shows the same things live: each defender's man, spot and job, each offensive player's job, the play's
steps and the players' reads.
