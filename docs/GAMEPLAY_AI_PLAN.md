# Gameplay AI: how it works now, and the plan

Ground rule for every phase: nothing that works is rewritten or replaced. New behaviour is added on top of the
existing systems (new modules that extend them, the way `flow.js` already extends the Director, plus small hooks in
the existing files), and the procedural animation (gait, slides, turn-and-run, dribble moves, contact reactions)
stays exactly as it is: the AI only decides where players go, which way they face, their stance and what they do.
Each phase ends with the audit (`tools/audit`) rerun against the phase before, the animation regression checks and a
stop for testing.

## How it works now

This is the game as Phase 1 found it. What Phase 2 changed is listed under "Phase 2: what was built" below; the
Phase 2 modules extend these systems, and the code described here is still the fallback (zones, presses,
transition, and every planner for screens, drives, passes and shots).

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

## Phase 1: simulate and audit (done)

Files: `tools/audit/run.js`, `tools/audit/sampler.js`, `tools/audit/report.js`, `tools/audit/README.md`; results in
`audit/phase1/` (`report.md`, `report.html`, `metrics.json`). The findings are summarised below.

### What the Phase 1 audit found (52 games, 10,442 possessions, 21.8 hours of half-court play)

Full tables, the players involved and court diagrams of flagged moments: `audit/phase1/report.md` and
`audit/phase1/report.html`. Nothing is broken: all 52 games reached the final buzzer, no script errors, no stuck
possessions, and the court score matched the engine in every game.

**Ball defender walking backward / turning away**
- Backing away from a handler who is not attacking: 4.2 % of on-ball time, 5,350 episodes (103 a game).
  84 % of it comes from the defender's own positioning rule (`guardPos`), 37 % right after a catch: the defender
  walks back from his deny spot to the on-ball cushion instead of closing out.
- Back turned while walking away from the ball handler: 2,036 episodes (39 a game). 63 % happens while the shot
  is being set up: the contest planner walks him toward the spot the shot will go up from, facing that spot instead
  of the shooter.
- The cushion ignores shooting: non-shooters (3PT under 50) get 4.8 ft at the arc, elite shooters 5.5 ft (backwards).
- Good: between the handler and the basket 90.4 % (NBA tracking 94 to 98 %), low stance 94.7 %, running with
  crossed feet while guarding only 0.2 %.

**Off-ball defenders crowding the ball**
- An extra defender on a ball that is already guarded, 12+ ft from the rim, no drive: 1,942 episodes (37 a game,
  33 s a game). Help at the rim on drives and finishes (the right play) is counted apart: 74 s a game.
- Root cause: the engine picks the shot's defender by position number, the court pairs defenders by lineup order,
  and on 50 to 54 % of jump shots they are different players. That defender leaves his own man to contest while the
  shooter's own defender is pushed out of the shooter's space.
- Off-ball positions are otherwise reasonable: one pass away in the passing lane 70 %, two passes away in help
  position 59 %, far from his man without helping only 0.1 %.

**Offensive players standing still with no purpose**
- Long stand-stills are not the main problem (443 of 3 s or longer, 80 of 5 s or longer in 52 games; players
  shuffle a little all the time).
- The real problem is no job: 30 % of off-ball time a player holds or drifts around a spot that is not spacing, half
  of it in the mid-range. Wings are the worst (SG 36 %, SF 39 %); stretch bigs 41 to 42 %.

**Wide-open players not shooting**
- A decent shooter (70+ for a shot from where he is) catching it with nobody within 10 ft shoots only 48 % of the
  time (196 such catches, 97 passed on, mostly the engine's scripted next pass).
- Wide-open decent shooters off the ball: 2,325 stretches of 1 s or more (45 a game, 88 s a game), and the ball
  found them 71 times (3 %).

**Low 3PT players shooting threes**
- Rare already: 16 of 3,829 threes (0.4 %) by players rated under 50, 2 by players under 45, none under 40; the
  rest of the big men's threes come from bigs rated 50 to 69. The rule to add is a firm gate, not a big change.
- Shots in the last 4 s of the shot clock: 14.6 % (the NBA is about 7 to 8 %): the shot clock plays no part in shot
  selection.
- The engine's "open" label does not match the court at the rim: 71 % of "open" shots at the rim or in the paint
  have a defender within 3 ft (for threes it matches: 3 %).

**Spacing by position (are bigs ever in the paint?)**
- Not five out at all: 1.3 players beyond the arc on average, two or fewer 89 % of the time, five out 0.4 %.
- Most players stand 18 to 24 ft from the rim, on or just inside the line; guards and wings spend about 40 % of
  their time in the mid-range, corners are nearly empty (2 to 6 %).
- Non-stretch PFs and Cs are at the rim, in the paint or the short corner 48 % of the time; 30 % of the time nobody
  on offense is within 12 ft of the rim.

**Rebounds and the ball (your earlier report)**
- Caught at the top of a jump above the rim: median grab height 11.2 ft, 98 % above 10 ft.
- The "teleport": 20 % of rebounds (834) bend more than 3 ft through the air into the rebounder's hands, up to
  32 ft; 7 % jump more than 3 ft into the hands at the grab; 4 % hang still in the air first.
- No rebound ever hits the floor.
- Box-outs: 2.1 defenders per miss, 0.7 of them boxing out a man 20+ ft from the rim.
- Ball and rim are life-size in the code (ball 9.4 in, rim 18 in, the real ratio); how they are drawn on screen is
  checked in Phase 2.

## Testing after every phase

- Rerun the audit against the previous phase and commit its report:
  `node tools/audit/run.js --out audit/phaseN --baseline audit/phase(N-1)/metrics.json`. Every metric shows before,
  now and the change, marked better or worse.
- Nothing broken: the audit's health section (every game reaches the final buzzer, no script errors, no stuck
  possessions, court score equals the engine score), the engine's league numbers (points, shooting, threes,
  turnovers, pace) in `test/harness.js`, the animation checks used for the procedural animation work (body contact and
  feet stuck behind: `tools/audit/anim.js`, moved into the repo in Phase 2) and a game watched in the browser.
- Debug overlays (the Live view's coach's debug view, Phase 2): defensive positioning, offensive jobs, the play's
  steps and read decisions; later phases add their own layers to it.

## Phase 2: core basketball AI

First, the root causes the audit found:
- One set of matchups: the engine sets who guards whom once per possession (by position and size, kept stable),
  passes it with the possession, and the court uses it (`sim.js` `matchupDefender` / `shotDefender`, `choreo.js`
  `setupMatchups`). The shot's defender is the shooter's own defender, or a real help defender on a drive.
- The contest (`choreo.js` `planContest`): the defender faces the shooter all the way, closes out from where he is
  with chop steps and a high hand, and the "stay out of the shooter's space" rule no longer pushes away the
  shooter's own defender.
- A catch is a closeout: the defender of the catcher comes out to him from his deny or help spot, never walks back.

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
  or elbow (to screen); shooters beyond the arc (a step behind the line, not on it) with the corners filled; spots
  mirror to the ball side. No more drifting in the mid-range with no job.
- No standing around: every off-ball player has a job (space, relocate when the ball moves, cut when his man turns
  his head, screen away, crash on a shot); a player stays on a spot only while it is the right spot.
- Open teammates: when an off-ball shooter is wide open in range, the ball goes to him if the engine's timeline
  allows it (Phase 3 makes this a real read).

Debug overlays (new `js/match/debugdraw.js`, drawn from `view.js` over the court, toggled in the Live view): each
defender's man, target spot and job (on ball, deny, help, box out); each offensive player's job; the play's steps;
read decisions.

### Phase 2: what was built

All of it sits on top of the existing systems: three new modules extend the Director the way `flow.js` does, the
engine gets a few functions, and nothing in the procedural animation changed (the AI only decides where players go,
which way they face, their stance and what they do).

- **One set of matchups** (`js/core/sim.js`: `pairLineups`, `matchupsOf`, `matchupDefender`, `shotDefender`): the
  engine pairs the five defenders with the five offensive players once per lineup (by position and size, kept
  stable) and hands the pairing to the court with each possession. The defender the engine credits with a contest,
  a block or a foul is the one standing on that player; a switch on a pick and roll swaps the two.
- **On-ball defense** (`js/match/defense.js`): between the handler and the rim, squared up, with a cushion from the
  handler's shooting and quickness (an elite shooter at the arc gets about 0.7 times the room, a non-shooter about
  1.45 times: crowd shooters, dare non-shooters), tighter inside the arc; he gives ground only as fast as about
  1.5 ft a second unless the handler comes at him, so he never walks away from him. The man with the ball keeps his
  defender until the pass is out of his hands.
- **Closeouts**: the receiver's defender reads the passer (from about 0.45 s before the throw) and closes out to the
  spot the receiver is running to: a sprint, then chop steps to the cushion. Passes are now aimed at that spot (the
  catch spot the planner sent the receiver to, or where his run takes him), so the ball bends less in the air and
  the closeout goes to the right place.
- **Off the ball**: one pass away in the passing lane (a hand and a foot in the lane), two passes away on the help
  line (a foot in the lane with the ball above the free-throw line, on the rim line with the ball on the wing); a
  real shooter is not left (his man stays home, a step off him); attached to a strong-side corner man when the ball
  is on that wing; 3/4 fronting a post man on the ball side. Help defenders are either in the lane or within 12 ft
  of their man, never stranded in between. Each defender reacts to the ball a moment late (0.15 to 0.35 s by his
  help-defense rating), each on his own clock. Nobody but the man on the ball goes near a handler who is not
  attacking.
- **Drives**: the low man (never the strong-side corner's defender) steps in front of the rim, the nearest defender
  sinks to the low man's man, the rest sag; everyone recovers when the ball is kicked out.
- **Shots and the glass**: the contest is the shooter's own defender (a help defender only at the rim), facing the
  shooter all the way; on a miss only defenders whose man can get to the glass box out, the rest take a step toward
  the long rebound.
- **Offense on the court** (`js/match/offense.js`): perimeter spots 1.5 ft behind the line (corner, wing, slot, top);
  non-stretch bigs (C and PF under 66 3PT) live at the dunker spot, the short corner, the block and the elbow;
  stretch bigs space like wings; every off-ball player has a job (spacing a spot behind the line, running an action,
  moving for the engine's next event), and one left holding a spot with no job for a second moves to the nearest
  open spot; the small moves between actions keep shooters behind the line.
- **Shot decisions** (`js/core/sim.js`): a player under 45 3PT almost never takes a three (45 to 60 fades in); a look
  worth less than the time on the shot clock asks for (about 0.86 points a shot early, 0.78 from 14 s) can be passed
  up for a reset (more often by high shot-IQ players, at most twice, never late in the clock); actions run faster
  when the shot clock is short. League numbers are unchanged (see the results).
- **Rebounds and the ball** (`js/match/rebound.js`): the carom comes down where the rebounder can get to it in
  time; he goes up and takes it with two hands (contested), with a hop (uncontested), or runs to a long carom and
  catches it on the way down; the ball is his the moment his hands meet it. If his hands are not there, it goes on
  down and bounces (off his fingertips it is a tip that drops near him), and he runs it down at full speed to where
  he meets it and picks it up off the bounce. It is never pulled through the air to him, and a ball never stops in
  the air. On screen the rim is 1.96 ball widths across (a real rim is 1.92).
- **Coach's debug view** (`js/match/debugdraw.js`; the D key or the 🧠 button in the Live view, or Broadcast
  settings; layers: all, defense, offense): each defender's man (a line), the spot his rule wants (a ring) and his
  job (ON BALL with the cushion he has and wants, CLOSEOUT, DENY, HELP, HOME, LOW MAN, SINK, POST, BOX OUT); each
  offensive player's job with an arrow to where he is going (NO JOB in red); the possession's script from the
  engine with the step under way; the reads (the shooter's expected points against what the shot clock asks for, a
  look passed up, the help on a drive, swing passes and drive reactions); where the rebound comes down and who goes
  for it.

### What the Phase 2 audit shows (52 games, the same 52 as Phase 1)

Full tables: `audit/phase2/report.md` and `report.html`. The Phase 1 code was measured again with this audit
(`audit/phase2/phase1-code/`) so both sides are counted the same way; the numbers below compare the two.

Nothing broken: all 52 games reached the final buzzer, no script errors, no stuck possessions, the court score
matched the engine in every game, 230 points and 201 possessions a game (231 and 201 before). The engine's own
league numbers over a season are unchanged (men 115.1 points a team game, 99.9 possessions, 36.4 % from three;
before 115.2, 100.9, 35.7; women 84.6 points, 81.3 possessions; before 85.4, 82.4).

| | Phase 1 | Phase 2 |
|---|---:|---:|
| Ball defender backing away from a handler who is not attacking | 4.2 % (103 a game) | 3.1 % (60 a game) |
| Ball defender turning his back and walking away | 0.9 % (16.7 a game) | 0.3 % (5.1 a game) |
| Extra cushion for a non-shooter over an elite shooter at the arc | -0.7 ft (backwards) | +1.0 ft |
| Extra defender crowding a guarded ball, no drive | 32.5 s a game | 13.6 s a game |
| Extra defender standing in the handler's path | 38.9 s a game | 10.6 s a game |
| Two passes away: sees man and ball | 48 % | 58 % |
| One pass away in the passing lane | 70 % | 73 % |
| Off-ball players with no job | 19 % | 5 % |
| Off-ball players spacing a spot (behind the arc, or a big by the rim) | 22 % | 37 % |
| Non-stretch bigs in the paint, at the rim or short corner | 48 % | 75 % |
| Nobody on offense within 12 ft of the rim | 30 % | 18 % |
| Threes by players under 50 3PT (a game) | 0.3 | 0.1 |
| "Open" shots with a defender within 3 ft at the release | 34 % | 24 % |
| Shots with under 4 s on the shot clock | 15 % | 10 % |
| Wide-open catch by a decent shooter within 26 ft: shot it | 47 % | 53 % |
| Rebounds grabbed above 10 ft | 98 % | 34 % |
| Carom bending 3+ ft through the air into his hands | 20 % | 0 % |
| Ball jumping 3+ ft into his hands at the grab | 6.8 % | 0.6 % |
| Ball hanging still in the air before the grab | 3.9 % | 0 % |
| Rebounds that hit the floor first | 0 % | 9 % |
| Passes bending 2+ ft in the air | 60 % | 50 % |
| Box-outs of a man 20+ ft from the rim (per miss) | 0.7 | 0.4 |

The animation work is untouched (`tools/audit/anim.js`, 4 games x 20 possessions, `audit/phase2/anim.json`): body
contact 202 per 10,000 player-frames (208 before), feet stuck behind 31 per 10,000 running frames (29; within the
noise of different movement), no script errors.

Worse or not better yet (for the next phases):
- Wide-open catches by decent shooters: 4.5 a game (3.3 before), 2.1 of them passed up (1.7 before). Most are
  the court's own bookkeeping passes right after the ball comes up (the play's handler gets the ball while his
  defender is still getting back) and passes on the engine's script; the engine does not know how open the catch
  is on the court. Phase 3's playbook makes the court's plays and the engine's the same, and the catch a real read.
- Help defenders more than 12 ft from their man outside a help spot: 11 short episodes a game (4.6 before); two
  passes away but glued to the man: 1.7 % (0.9 %); more than 10 ft off the handler inside 28 ft: 1.8 % (1.0 %).
  Mostly defenders lagging a hard cut or the ball's move, not their target spots.
- Off-ball players standing still: 20 % either way (holding a spacing spot counts), average speed 5.8 ft/s either
  way; stand-stills of 3 s or more 11.5 a game (8.5).
- Between the ball handler and the basket: 89.9 % (90.4 %); NBA tracking has 94 to 98 %.

### Research behind Phase 2

Coaching material, NBA tracking studies and how NBA 2K describes its AI (numbers to confirm while building; a few
came from search excerpts):
- On-ball gap: about an arm's length (2.5 to 3 ft) on an average handler, about 4 ft on a quick one, tighter on
  shooters, sagging (and going under screens) on non-shooters; a hand's length once the dribble is picked up.
  Beaten means hip to hip: then turn and sprint. A sidestep starts about 0.3 s after the cue, so defenders react late
  by a varying amount and never move in lockstep. ([coach Lynch](https://www.coachlynchbasketball.com/post/three-methods-guarding-the-ball),
  [reaction study](https://www.sciencedirect.com/science/article/abs/pii/S1050641113001855))
- Off-ball: tracking puts the average defender at 0.62 of his man, 0.11 of the ball and 0.27 of the hoop; one pass
  away a hand and a foot in the lane; two passes away "ball-you-man", one foot in the lane with the ball above the
  free-throw line, on the rim line with the ball on the wing. Help comes from the weak side, never from the
  strong-side corner; the low man protects the rim; the rotation chain is low man, sink, fill, then X-out on the
  swing. Closeout: sprint two thirds to three quarters of the way, chop the rest with a high hand, stop at arm's
  length; a short closeout on drivers and non-shooters. Never double a contained ball and leave a shooter one pass
  away. ([Franks et al.](https://arxiv.org/abs/2007.10550), [Cleaning the Glass](https://cleaningtheglass.com/how-do-nba-defensive-rotations-work/),
  [Breakthrough Basketball](https://www.breakthroughbasketball.com/defense/help-positioning))
- NBA 2K builds its offense and help decisions on 20+ dynamic spacing spots, lets help awareness ratings set how
  fast help commits, and in 2K27 moved to a rotation engine that scores matchups and help targets instead of fixed
  spots; RoboCup teams interpolate hand-placed ideal positions between sample ball locations.
  ([2K25](https://nba.2k.com/2k25/courtside-report/gameplay/), [2K27](https://nba.2k.com/2k27/features/gameplay/),
  [HELIOS](https://wrighteagle2d.github.io/robocup/2010/2D_TDP_HELIOS.pdf))
- Spacing spots (feet from the baseline, from the sideline): corner (3, 2), wing (23, 7), slot (28.5, 15), top
  (30.5, 25), elbow (19, 17), nail (19, 25), block (7 to 8, 16), dunker (2 to 4, 13 to 15), short corner (4, 9 to
  11); perimeter spots 1 to 1.5 ft behind the line. Phase 1 found ours 1.5 to 2.5 ft closer in (wing 21, slot 26,
  top 29); Phase 2 puts them 1.5 ft behind the line. Drive rules: baseline drive, the weak-side wing drifts to the corner;
  middle drive, the corner lifts; someone fills behind; the "0.5 second" rule on the catch. Off-ball movers average
  about 5 mph, ball-dominant players about 4. ([NBA rule 1](https://official.nba.com/rule-no-1-court-dimensions-equipment/),
  [drive spacing rules](https://coachingtoolbox.net/offense/coaching-basketball-penetration-bailout-spacing-rules.html),
  [NBA speed](https://www.thespax.com/nba/speed-and-distance-traveled-in-the-nba/))
- Shots: about 39 % of NBA threes are wide open (6+ ft) and 42 % open (4 to 6 ft); shots in the last 4 s of the shot
  clock are about 7 to 9 %; efficiency falls as the clock runs down; non-shooting centers almost never shoot threes.
  ([NBA.com closest defender](https://www.nba.com/stats/players/shots-closest-defender), [shot clock](https://www.nba.com/stats/teams/shots-shotclock))
- Rebounds: misses at the rim come off within 4 ft about half the time; long rebounds (7 to 21 ft) follow about
  20 % of missed twos and 41 % of missed threes, mostly to the side away from the shooter (corner threes to the
  opposite side); average rebound distance tops out near 8 ft. The floor bounce restitution is about 0.75, the rim
  absorbs 35 to 50 % of the impact (deader than the board). Even heavy-crashing teams send three or more to the glass
  on under a fifth of shots; each defender hits his own man, then goes to the ball.
  ([Nylon Calculus](https://fansided.com/2020/01/28/nylon-calculus-nba-rebound-tracking/), [Grantland](https://grantland.com/features/how-rebounds-work/),
  [Okubo and Hubbard](https://link.springer.com/article/10.1007/s12283-014-0165-z))

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
