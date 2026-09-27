# Gameplay AI: how it works now, and the plan

Ground rule for every phase: nothing that works is rewritten or replaced. New behaviour is added on top of the
existing systems (new modules that extend them, the way `flow.js` already extends the Director, plus small hooks in
the existing files), and the procedural animation (gait, slides, turn-and-run, dribble moves, contact reactions)
stays exactly as it is: the AI only decides where players go, which way they face, their stance and what they do.
Each phase ends with the audit (`tools/audit`) rerun against the phase before, the animation regression checks and a
stop for testing.

## How it works now

### Two layers

1. **The engine** (`js/core/sim.js`) decides what happens in a possession: which play, who handles, who shoots, from
   where, how contested, made or missed, rebounds, turnovers, fouls. It produces the possession as a list of timed
   events (`set`, `screen`, `pass`, `move`, `shot`, `rebound`, `turnover`, `foul`, `ft`, ...). Games you do not
   watch are simulated the same way without the events (lite mode).
2. **The live court** (`js/match/`) shows those events: the Director (`choreo.js`) turns each event into a beat and
   places the ten players around it; `flow.js` fills the time between events with half-court movement; `actor.js`
   moves the bodies (the procedural animation) and `ball.js` moves the ball. Nothing on the court changes the
   engine's outcome: where a defender stands does not decide whether the shot goes in.

### The engine (`js/core/sim.js`)

- A possession runs in segments (normally one; offensive rebounds and resets add more, up to 14). Each segment:
  `choosePlay` picks a play type (pnr, iso, post, spot, offscreen, handoff, cut, or transition) by the weights of the
  team's offensive system (`C.OFFENSES[team.strat.off].plays`), bent by the five on the floor; the roles (handler,
  screener, shooter, cutter, poster) are drawn at random weighted by ratings and tendencies, fresh each segment.
- `actionTime` draws when the play ends in a shot (a bell curve around the league's average shot time); the shot
  clock only matters in end-of-clock and end-of-period modes (`lateMode`: milk, last shot, hurry up, 2-for-1).
- Then a turnover, a non-shooting foul or a defensive three may happen; otherwise `takeShot`: one "read" per play
  (`BRANCHES`, for example pick and roll: handler 40 / roller 24 / kick-out 36) picks who shoots, `chooseZone` picks
  rim / paint / mid / corner 3 / above-break 3 from his tendencies, the system and the defense, `chooseKind` the
  shot type, and `contestLevel` draws open / contested / tight from team averages (the defense's scheme and ratings
  shift the odds; no defender's position is modelled). `makeProb` then decides make or miss.
- The play's screens, passes and moves (`playEvents`) are written after the shot is decided, to lead up to it.
- Threes by poor shooters are already rare: the three-point weight falls off steeply below a 3PT tendency of ~40.
  The ways around it are the pick-and-pop (screeners rated 70+), hurry-up threes late in games, heaves and the shot
  meter (GIM) plays.
- Hook points for the plan: `choosePlay`, `BRANCHES` / `branchWeights`, `planShot`, `chooseZone`, `pickShooter`,
  `contestLevel`, `playEvents`, `segment`, `resolveShot`, `rebound`, `turnover`, `timeouts`.

### Teams, players and coaches

- Players (`js/core/player.js`, `config.js`): 27 ratings from 25 to 99 (close, layup, dunk, post, mid, three, ft,
  draw foul, shot IQ, handle, pass, vision, interior / perimeter / help defense, steal, block, offensive and
  defensive rebounding, speed, agility, strength, vertical, stamina, hustle, clutch, durability), a position (PG to
  C), an archetype (for bigs: Stretch Four, Athletic Four, Post Scorer, Glue Defender, Rim Protector, Stretch Big,
  Rim Runner, Playmaking Big) and 16 tendencies (`tendency.js`: three, mid, rim, dunk, pull-up, step-back, draw
  foul, iso, pnr, post, pass, push, crash, gamble, block, foul) that bend shot selection, passing and pace.
- Teams: `team.strat` = offensive system (12: balanced, pace and space, pnr heavy, motion, iso, post up, Princeton,
  triangle, run and gun, grit and grind, dribble drive, heliocentric), defensive scheme (12: man, switch, drop,
  blitz, zone 2-3, zone 3-2, 1-3-1, box and one, press, pack line, no threes, pressure), tempo, focus, crash,
  pressure and two go-to players. AI teams pick them from their roster (`ai.js`, `chooseStrategy`).
- There is no playbook: the set names in the play-by-play (HORNS, FLOPPY, ...) are labels on the play types above.
- The coach (`coach.js`) has a reputation but no skill ratings; there are no assistant coaches; scouting exists only
  for the draft.
- In a live game the Coach tab can sub, change the strategy for this game and ask for a timeout, which is taken at
  the next dead ball but does not pause the game or call a play. The shot meter (GIM) is the only play call.

### The live court (`js/match/choreo.js`, `flow.js`)

- **Formations**: each play type has a list of spots (`assignSpots`); the handler gets the first, the rest go by
  height so the biggest player gets the last spot (the dunker spot when bringing the ball up, the elbow in a pick
  and roll). Only the `spot` play is five out. The spots never mirror to the ball side.
- **Between events** (`ambient`, `flow.js`): off-ball players screen away, cut, relocate, exchange and flash, more or
  less by offensive system; the handler probes; the ball is swung around the perimeter in long waits. Idle players
  shuffle a little so nobody is frozen.
- **Matchups**: defender *i* guards offensive player *i* in lineup order (no cross-matching by size).
- **On-ball defense** (`guardPos`): on the line from the handler to the rim, with a cushion from NBA tracking by the
  handler's distance from the rim (2.5 ft inside 10 ft up to 18 ft near half court). The cushion is the same for a
  great shooter and a non-shooter and grows quickly past the arc; near half court the defender stands up out of his
  stance.
- **Off-ball defense**: a point between his man and the rim (16 to 36 % of the way), pulled a little toward the ball
  when far, a deny point when his man is within 21 ft of the ball, and a leash to his man. Nothing models "two
  passes away" help-side position, and the deny point can land on top of the ball handler.
- **Zones**: fixed spots by lineup order that shift with the ball.
- **Drives**: one defender helps; there are no rotations behind him and no closeouts.
- **Shots and rebounds**: on every shot every defender boxes out his man 2.4 ft on the rim side, even 25 ft from
  the basket. The miss is a scripted arc from the rim to a spot next to the engine's rebounder, and in the last part
  of the flight the ball is pulled toward his hands wherever he is. Rebounds never touch the floor.

## Phase 1: simulate and audit (this phase)

Files: `tools/audit/run.js`, `tools/audit/sampler.js`, `tools/audit/report.js`, `tools/audit/README.md`; results in
`audit/phase1/` (`report.md`, `report.html`, `metrics.json`). The findings are summarised below.

<!-- FINDINGS -->

## Testing after every phase

- Rerun the audit against the previous phase and commit its report:
  `node tools/audit/run.js --out audit/phaseN --baseline audit/phase(N-1)/metrics.json`. Every metric shows before,
  now and the change, marked better or worse.
- Nothing broken: the audit's health section (every game reaches the final buzzer, no script errors, no stuck
  possessions, court score equals the engine score), the engine's league numbers (points, shooting, threes,
  turnovers, pace) in `test/harness.js`, the animation checks used for the procedural animation work (foot sliding,
  body contact, stability; moved into `tools/audit` in Phase 2) and a game watched in the browser.
- Debug overlays: defensive positioning (Phase 2), read decisions (Phase 2 and 3), play steps (Phase 3).

## Phase 2: core basketball AI

Defense, new `js/match/defense.js` (extends the Director like `flow.js`; `choreo.js` gets hooks, its code stays as the
fallback for zones and presses):
- On-ball: stays between the handler and the basket, faces him, low stance in the front court, slides (the existing
  slide gait, feet never crossing) and backpedals only as fast as the handler attacks; the cushion comes from the
  handler's shooting and quickness (crowd shooters, sag off non-shooters) instead of growing with distance; turns and
  sprints only when beaten, then squares up again.
- Off-ball: one pass away denies the passing lane (a step off, never on top of the ball); two passes away sits on the
  help line in a flat triangle (sees man and ball); on a drive the low man helps, the next defender rotates behind
  him, and when the ball is kicked out the nearest defender closes out and the rest recover to their men. No
  defender steps into the handler's path or doubles a guarded ball unless the scheme calls a trap or he is helping.
- Box-outs: defenders whose man is near the rim or crashing box out and then go get the ball; perimeter defenders do
  not box out a man 25 ft away.
- Rebounds and the ball (`ball.js`, `choreo.js`: `planRebound`, `scheduleRebounder`, `secureRebound`, `chaseCarom`):
  misses come off the rim or board with real angles and speed; the rebounder goes to where the ball will be and
  grabs it within his reach (the ball is no longer pulled to his hands through the air); long rebounds can bounce on
  the floor; grabs happen at the height where he meets the ball. The ball and rim sizes are checked against the real
  ratio on screen (ball 9.4 in, rim 18 in).

Offense, engine (`js/core/sim.js`):
- Shot decisions weigh shot quality: the player's rating for that shot, how open the look is, the shot clock and his
  role. A decent shooter who gets a wide-open look shoots it; early in the clock only good looks are taken, late in
  the clock the best available one.
- Threes: players under ~45 3PT take them only at the buzzer; 45 to 55 only when wide open; the pick-and-pop and
  hurry-up paths respect the same rule.
- Bigs: centers and power forwards (not stretch bigs) screen, roll, post up and crash the glass.

Offense, court (`js/match/flow.js`, `choreo.js` `assignSpots`):
- Spots come from the play and the system, with roles: non-stretch bigs at the dunker spot, short corner, low post
  or elbow (to screen); shooters beyond the arc (a step behind the line, not on it); spots mirror to the ball side.
- No standing around: every off-ball player has a job (space, relocate when the ball moves, cut when his man turns
  his head, screen away, crash on a shot); a player stays on a spot only while it is the right spot.
- Open teammates: when an off-ball shooter is wide open in range, the ball goes to him if the engine's timeline
  allows it (Phase 3 makes this a real read).

Debug overlays (new `js/match/debugdraw.js`, drawn from `view.js` next to the names, toggled in the Live view): each
defender's man, target spot and job (on ball, deny, help, box out); each offensive player's job; read decisions.

## Phase 3: playbook

- New `js/core/playbook.js`: plays as data. A play has roles (ball handler, screener, shooter, cutter, post,
  spacer), steps (where each role goes and what it does: screen, cut, pass, dribble handoff, post up, pop, roll) and
  reads on each step (a trigger such as "his man goes under the screen" or "the help commits" and the action it
  opens: shoot, drive, pass to a role). Library: pick and roll (high, side, Spain), horns (flare, twist, elbow),
  floppy, pin-downs, flex, UCLA, post entry, isolation, dribble handoffs, hammer, stagger, BLOB and SLOB inbound
  plays, after-timeout and end-of-game plays. Defensive schemes: the 12 existing ones plus pick-and-roll coverages
  (drop, hedge, blitz, switch, ice).
- Every team gets a playbook that fits its roster and coach style (saved with the team; older saves get one when
  loaded). Roles are filled by matching the five on the floor to each role's ratings.
- New `js/core/playcall.js`: the AI coach calls plays by score, time, lineup, opponent and what has worked this game.
- `sim.js`: a possession runs the called play step by step; a read that opens up before the end is taken, and
  taking a good early read counts as the play succeeding. The existing plays remain as generic plays so the league's
  scoring stays calibrated.
- New `js/match/plays.js` (extends the Director): players follow the play's spots and paths on the court, and the
  defense plays its coverage on the screens.
- Team page: a Playbook tab to see the plays.

## Phase 4: play drawing and timeout calls

- New `js/ui/playdesigner.js`: a whiteboard half court; draw each step's moves, cuts, screens, passes and dribbles,
  assign roles, add reads, name and save the play to the team playbook.
- `js/ui/live.js`: a timeout pauses the game at the next dead ball and opens a panel to call a play for the next
  possessions or change the defensive scheme. `sim.js` gets the calls (`Sim.callPlay`, scheme for N possessions).
- `view.js` / `plays.js`: an optional overlay of the play's intended paths on the court.

## Phase 5: play tracking and analytics

- `sim.js`: every possession records the play, how far into it the offense got, where it broke down and why
  (denied pass, blown screen, switch, shot clock, turnover) and the outcome (points, shot quality, turnover, foul).
- `stats.js`, `season.js`: per game and per season (archived when a season ends), plus points allowed per
  possession by defensive scheme.
- UI: a Plays tab in the box score and in the team page (usage, points per possession, completion rate, most common
  breakdown).

## Phase 6: assistant coaches and scouting reports

- New `js/core/staff.js`: assistants with ratings (scouting, offense, defense, player development, ...), a market,
  hire and fire, salaries.
- New `js/core/scouting.js`: before each game the assistants scout the opponent; the report (favourite plays, clutch
  plays, defensive tendencies, each player's hand, spots and shot habits) is as complete and accurate as their
  scouting rating and the time spent allow.
- Fog of war on the court: poor scouting shows only players moving, average shows the play type once it develops,
  excellent recognises the play early and shows its paths.
- Knowing the play helps the defense a little (anticipation, quicker rotations, a scheme that takes away the go-to
  play) through the read and contest odds, never a guaranteed stop; talent still decides, and it matters most
  between even teams. When their go-to plays stop working the AI coach switches plays or schemes.
