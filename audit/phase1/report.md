# Gameplay audit: Phase 1 baseline (before any gameplay AI change)

52 full games of the Live view played headless (every possession from the tip to the final buzzer), players sampled every 0.1 s. This run is the baseline the later phases are compared with.
Made by `node tools/audit/run.js` (see tools/audit/README.md).

## Game health (nothing broken)

| Metric | Value | Reference |
|---|---:|---|
| Games played | 52 |  |
| Games that reached the final buzzer | 52 | all |
| Possessions per game | 200.8 |  |
| Stuck possessions (watchdog) | 0 | 0 |
| Script errors | 0 | 0 |
| Match warnings | 0 | 0 |
| Games where the court score differs from the engine | 0 | 0 |
| Points per game (both teams) | 230.5 | NBA ~228 |
| Wall time per game (ms) | 49476 |  |

## 1. On-ball defense (half court, ball in the handler's hands)

| Metric | Value | Reference |
|---|---:|---|
| Defender between the ball handler and the basket | 90.4% | NBA tracking 94-98% |
| In a low defensive stance | 94.7% |  |
| Backing away from a handler who is not attacking | 4.2% | ~0 |
|   episodes per game (0.3 s or longer) | 102.9 |  |
|   of which walking backward facing him | 3.9% |  |
| Back turned to the ball handler and walking away | 2.0% | 0 unless beaten |
|   episodes per game | 39.2 |  |
| Back turned to the ball handler (any speed) | 2.7% |  |
| Running (feet crossing) within 10 ft while not beaten | 0.2% |  |
| More than 10 ft off the handler inside 28 ft | 1.0% |  |
| Beaten (handler past him toward the rim) | 4.1% |  |
| Gap at 22-30 ft: handler 3PT under 50 | 4.8 ft | should be the biggest |
| Gap at 22-30 ft: handler 3PT 50-69 | 5.3 ft |  |
| Gap at 22-30 ft: handler 3PT 70-79 | 5.5 ft |  |
| Gap at 22-30 ft: handler 3PT 80+ | 5.5 ft | should be the smallest |
| Extra cushion given to non-shooters vs elite shooters | -0.7 ft | 2-4 ft |

## 2. Off-ball defense (man schemes)

| Metric | Value | Reference |
|---|---:|---|
| One pass away: in the passing lane (deny) | 70.1% |  |
| Two passes away: in help position (lane or ball-rim line) | 59.0% |  |
| Two passes away: sagged toward the rim from his man | 93.2% |  |
| Two passes away: can see man and ball | 51.3% |  |
| Two passes away: glued to his man (no help) | 3.9% |  |
| Extra defender crowding a guarded ball 12+ ft from the rim, no drive (seconds per game) | 32.5 s | ~0 |
|   share of half-court time | 2.2% |  |
|   episodes per game | 37.3 |  |
| Extra defender standing in the handler's path 12+ ft from the rim (seconds per game) | 38.9 s |  |
| Help at the rim (an extra defender on the ball inside 12 ft; the right play), seconds per game | 74.2 s |  |
| More than 12 ft from his man and not in a help spot | 0.1% |  |
|   episodes per game | 4.6 |  |
| Half-court time against zones (not in these numbers) | 7.9% |  |

## 3. Offense: moving with a purpose

| Metric | Value | Reference |
|---|---:|---|
| Off-ball players standing still (under 1 ft/s) | 19.7% |  |
| Off-ball players who moved less than 3 ft in the last 3 s | 2.5% |  |
| Stand-stills of 3 s or longer per game | 8.5 |  |
| Stand-stills of 5 s or longer per game | 1.5 |  |
| Off-ball players within 6 ft of a teammate | 17.8% |  |
| No job: holding or drifting around a spot that is not spacing (mid-range, paint, too deep) | 30.1% |  |
|   of that time, in the mid-range | 50.5% |  |
| Spacing: holding a spot beyond the arc (a non-stretch big: by the rim) | 20.5% |  |
| Running a half-court action (screen away, cut, relocate, exchange, big flash) | 33.6% |  |
| Moving for the engine's next event (screen, cut, catch) | 15.5% |  |
| In an animation (catch, screen, pass, ...) | 0.2% |  |

## 4. Shot selection (engine)

| Metric | Value | Reference |
|---|---:|---|
| Field goal attempts per game (both teams) | 190.8 | NBA ~178 |
| Three-point attempts per game | 73.6 | NBA ~75 |
| Threes by players rated under 50 (per game) | 0.3 | ~0 |
| Threes by players rated under 40 (per game) | 0 | 0 |
| Threes by centers (per game) | 2.6 |  |
| Threes by non-stretch bigs (per game) | 2.9 | ~0 |
| Share of all threes taken by players under 50 | 0.4% |  |
| "Open" shots: median nearest defender at release | 6.0 ft | 6+ ft |
| "Open" shots with a defender within 3 ft at release | 33.6% | ~0 |
|   threes with a defender within 4 ft | 3.1% | ~0 |
|   mid-range shots with a defender within 4 ft | 6.5% | ~0 |
|   shots at the rim / in the paint with a defender within 3 ft | 71.3% |  |
| "Contested" shots: median nearest defender | 3.8 ft | 2-4 ft |
| "Tight" shots: median nearest defender | 2.6 ft | 0-2 ft |
| "Tight" shots with nobody within 6 ft | 1.5% | 0 |
| Shot clock left at the shot (median) | 10.3 s |  |
| Shots with under 4 s on the shot clock | 14.6% | NBA ~7% |

## 5. Open catches in the live game

| Metric | Value | Reference |
|---|---:|---|
| Half-court catches per game | 401.4 |  |
| Wide-open catches (10+ ft) by a decent shooter for that spot (70+), per game | 3.8 |  |
|   shot it | 48.5% | most |
|   passed it on | 49.5% | few |
|   wide-open shots passed up per game | 1.9 |  |
|   of those passes, flow swing passes (not the engine's) | 14.4% |  |
|   drove instead | 7.7% |  |
| Open catches (6-10 ft) by a decent shooter, per game | 26.9 |  |
|   shot it | 57.6% |  |
|   passed it on | 41.9% |  |
| Time a catcher holds the ball before passing (median) | 2.0 s |  |
| Wide-open shooters off the ball (1 s or longer, 70+ from there, within 26 ft), per game | 44.7 |  |
|   the ball found him | 3.1% |  |
|   seconds per game someone like that stands wide open | 87.9 s |  |

## 6. Spacing and positions

| Metric | Value | Reference |
|---|---:|---|
| PF and C (not stretch) in the paint, at the rim or short corner | 48.0% |  |
| Five out: all five beyond the arc | 0.4% |  |
| Four or five beyond the arc | 2.1% |  |
| Two or fewer beyond the arc | 88.8% |  |
| Players beyond the arc on average | 1.3 |  |
| Nobody on offense within 12 ft of the rim | 30.0% |  |

## 7. Rebounding and the ball

| Metric | Value | Reference |
|---|---:|---|
| Rebounds grabbed on court per game | 80.0 |  |
| Height of the grab (median) | 11.2 ft | many rebounds 5-9 ft |
| Rebounds grabbed above 10 ft | 97.8% |  |
| Carom bent in the air toward the rebounder's hands by more than 1 ft | 27.6% | 0 |
|   by more than 3 ft (looks like a teleport) | 20.1% | 0 |
|   biggest bend | 32.2 ft |  |
| Ball jumps more than 3 ft into the rebounder's hands | 6.8% | 0 |
| Ball hangs still in the air before the grab (0.2 s+) | 3.9% | 0 |
| Rebounds that hit the floor before anyone gets them | 0.0% | long rebounds do |
| Passes bent more than 2 ft in the air toward the receiver | 59.9% |  |
| Defenders boxing out on a miss | 2.1 |  |
|   boxing out a man 20+ ft from the rim | 0.7 | ~0 |
| Defenders within 10 ft of the rim on a miss | 1.5 |  |
| Offensive players within 10 ft of the rim on a miss | 1.0 |  |

## 3b. Standing around by position (share of off-ball time)

| Position | still (<1 ft/s) | moved <3 ft in 3 s | no job |
|---|---|---|---|
| PG | 22.0% | 2.8% | 32.9% |
| SG | 21.4% | 2.8% | 36.2% |
| SF | 20.9% | 2.8% | 38.8% |
| PF | 18.9% | 2.4% | 16.8% |
| PF (stretch) | 18.6% | 2.1% | 40.6% |
| C | 16.1% | 2.0% | 18.0% |
| C (stretch) | 15.8% | 1.9% | 41.9% |

## 6b. Where each position spends its half-court time (offense)

| Position | at rim (<4 ft) | paint | short corner / baseline | mid-range | corner 3 | above-break 3 | deep (28+ ft) |
|---|---|---|---|---|---|---|---|
| PG | 1.1% | 10.0% | 11.9% | 39.1% | 3.7% | 25.1% | 9.1% |
| SG | 1.7% | 13.0% | 16.4% | 42.0% | 5.3% | 17.5% | 4.2% |
| SF | 3.2% | 14.5% | 21.0% | 37.8% | 5.6% | 14.7% | 3.2% |
| PF | 5.0% | 19.7% | 23.9% | 32.8% | 4.4% | 10.3% | 3.9% |
| PF (stretch) | 5.1% | 18.0% | 26.1% | 31.7% | 5.2% | 10.7% | 3.2% |
| C | 5.7% | 23.9% | 18.0% | 32.3% | 1.9% | 10.2% | 8.1% |
| C (stretch) | 5.3% | 21.7% | 18.5% | 31.7% | 2.1% | 11.3% | 9.4% |

## Low-rated three-point shooters who shot threes anyway

| Game seed | Player | Pos | Archetype | 3PT rating | 3PA | 3PM | Called open |
|---|---|---|---|---:|---:|---:|---:|
| 113 | Trent Gray | PG | Slasher | 48 | 2 | 0 | 1 |
| 106 | Emeka Ndiaye | PF | Glue Defender | 49 | 2 | 1 | 2 |
| 150 | Nathan Mbaye | C | Rim Protector | 40 | 1 | 1 | 0 |
| 101 | Khalil Brewer | C | Playmaking Big | 41 | 1 | 0 | 0 |
| 117 | Armando Olson | PF | Glue Defender | 45 | 1 | 1 | 0 |
| 132 | Damon Francis | C | Rim Runner | 45 | 1 | 0 | 1 |
| 139 | Jaxon Tate | PF | Glue Defender | 45 | 1 | 1 | 1 |
| 129 | Thomas Kowalski | PG | Slasher | 46 | 1 | 0 | 1 |
| 131 | Jaylen Porter | PF | Glue Defender | 46 | 1 | 1 | 1 |
| 139 | Keon Davis | C | Playmaking Big | 46 | 1 | 0 | 0 |
| 109 | Sam Ford | C | Post Scorer | 49 | 1 | 0 | 1 |
| 121 | Antoine Bolden | SG | Slasher | 49 | 1 | 1 | 0 |

## What was moving the flagged defenders

Share of the flagged samples (in 52 of the games) by the code path moving the defender, the engine beat under way and the handler's distance from the rim.

**Ball defender backing away**

- moved by: defensive tracker 84.3%, planner move (locked by a planner) 13.1%, other track (locked by a planner) 1.8%, idle 0.6%, idle (locked by a planner) 0.4%
- engine beat: pass 36.8%, shot 23.8%, move 23.7%, screen 11.9%, set 2.1%, none 1.0%
- during a shot beat, the engine called the shot: contested (his man shoots) 44.1%, open (his man shoots) 37.0%, tight (his man shoots) 18.9%, open (another shooter) 0.0%
- handler from the rim: 17-23 ft 38.7%, 23-28 ft 29.0%, 10-17 ft 15.7%, under 10 ft 12.4%, 28-35 ft 4.2%
- defender clip: none 99.1%, fall 0.8%, turn 0.1%, wallUp 0.0%, contestJump 0.0%
- handler clip: none 86.1%, jumpshot 4.3%, jumpshot2 1.9%, pivot 1.4%, rebound 1.4%, pullup 1.3%
- scheme: man 37.7%, drop 33.7%, switch 9.2%, nothree 6.7%, zone32 3.8%, pressure 3.8%

**Ball defender turning away**

- moved by: planner move (locked by a planner) 62.9%, defensive tracker 35.9%, other track (locked by a planner) 0.6%, idle 0.3%, idle (locked by a planner) 0.3%
- engine beat: shot 69.5%, set 12.6%, pass 10.4%, move 3.4%, screen 3.3%, none 0.7%
- during a shot beat, the engine called the shot: contested (his man shoots) 46.7%, tight (his man shoots) 28.8%, open (his man shoots) 24.4%
- handler from the rim: under 10 ft 27.8%, 10-17 ft 26.6%, 17-23 ft 20.7%, 23-28 ft 12.5%, 28-35 ft 12.4%
- defender clip: none 99.4%, turn 0.4%, wallUp 0.2%, fall 0.0%, contestJump 0.0%
- handler clip: none 84.1%, layup 5.2%, dunk 2.7%, rebound 2.5%, dunk2 1.7%, jumpStop 0.8%
- scheme: man 32.0%, drop 30.3%, zone32 10.3%, zone23 7.9%, switch 7.4%, nothree 5.9%

**Off-ball defender crowding the ball**

- moved by: planner move (locked by a planner) 69.9%, defensive tracker 25.5%, idle (locked by a planner) 4.2%, other track (locked by a planner) 0.3%, idle 0.1%
- engine beat: shot 74.7%, pass 10.0%, move 8.2%, set 4.3%, screen 2.3%, handoff 0.3%
- during a shot beat, the engine called the shot: contested (his man shoots) 54.2%, tight (his man shoots) 35.3%, open (his man shoots) 10.5%, open (another shooter) 0.0%
- handler from the rim: 23-28 ft 31.9%, 10-17 ft 30.6%, 17-23 ft 30.0%, 28-35 ft 7.0%, 35+ ft 0.6%
- defender clip: none 95.7%, contestJump 4.1%, block 0.1%, turn 0.1%
- handler clip: none 62.7%, pullup 14.2%, jumpshot 9.8%, stepback 3.7%, jumpshot2 3.5%, rebound 2.0%
- scheme: man 39.2%, drop 35.5%, switch 11.5%, pressure 5.6%, nothree 5.1%, packline 1.6%

**Off-ball defender lost his man**

- moved by: planner move (locked by a planner) 64.7%, defensive tracker 34.5%, other track (locked by a planner) 0.5%, idle (locked by a planner) 0.2%, idle 0.0%
- engine beat: shot 70.0%, pass 13.4%, set 8.6%, move 3.4%, screen 3.2%, handoff 1.4%
- during a shot beat, the engine called the shot: contested (his man shoots) 44.0%, open (his man shoots) 29.6%, tight (his man shoots) 26.4%
- handler from the rim: 17-23 ft 30.0%, 23-28 ft 23.6%, 10-17 ft 17.4%, under 10 ft 15.1%, 28-35 ft 11.3%, 35+ ft 2.5%
- defender clip: none 100.0%, turn 0.0%
- handler clip: none 76.2%, rebound 7.9%, jumpshot 5.2%, jumpshot2 2.9%, pullup 2.2%, layup 1.4%
- scheme: drop 38.2%, man 35.4%, switch 12.2%, pressure 6.4%, nothree 4.5%, packline 1.7%

## Examples to look at

- **Ball defender backing away** (game seed 101, possession 1, Q1 11:24): Curtis Moses (PF) backs away from Keon Novak (C) for 0.8 s while the ball handler is not attacking (gap 2.6 -> 4.6 ft).
- **Ball defender backing away** (game seed 102, possession 1, Q1 11:49): Isaiah Olson (PG) backs away from Jackson Lamb (PG) for 0.4 s while the ball handler is not attacking (gap 4.9 -> 6.4 ft).
- **Ball defender backing away** (game seed 103, possession 2, Q1 11:37): Sam Campbell (SG) backs away from Rafael Black (PG) for 0.4 s while the ball handler is not attacking (gap 3.9 -> 5.2 ft).
- **Ball defender turns and walks away** (game seed 101, possession 1, Q1 11:26): Curtis Moses (PF) turns his back on the ball handler Keon Novak (C) and walks away for 0.8 s (gap 4.1 -> 3.5 ft).
- **Ball defender turns and walks away** (game seed 102, possession 4, Q1 11:28): Jackson Lamb (PG) turns his back on the ball handler Isaiah Olson (PG) and walks away for 1.1 s (gap 6.7 -> 6 ft).
- **Ball defender turns and walks away** (game seed 103, possession 13, Q1 8:59): Walker Kovac (PG) turns his back on the ball handler Ryan Rivers (PG) and walks away for 0.7 s (gap 5.1 -> 1.8 ft).
- **Off-ball defender crowding the ball** (game seed 101, possession 18, Q1 6:51): Aaron Fox (PF) leaves his man Julius Thomas (SG) to crowd the ball handler Jay Daniels (PG) for 0.4 s (the ball is already guarded, 12+ ft from the rim, no drive).
- **Off-ball defender crowding the ball** (game seed 102, possession 9, Q1 10:22): Oscar Graves (C) leaves his man Earl Weaver (C) to crowd the ball handler Jackson Lamb (PG) for 1.4 s (the ball is already guarded, 12+ ft from the rim, no drive).
- **Off-ball defender crowding the ball** (game seed 103, possession 4, Q1 11:03): Shawn Adams (C) leaves his man Omar Armstrong (C) to crowd the ball handler Rafael Black (PG) for 0.4 s (the ball is already guarded, 12+ ft from the rim, no drive).
- **Off-ball defender lost his man** (game seed 101, possession 31, Q1 2:56): Jesse Becker (SG) is more than 12 ft from his man Grant Isaac (PG) for 0.7 s without being in a help spot.
- **Off-ball defender lost his man** (game seed 102, possession 75, Q2 7:09): Amir Vaughn (C) is more than 12 ft from his man Colby Richards (SG) for 0.9 s without being in a help spot.
- **Off-ball defender lost his man** (game seed 104, possession 39, Q1 3:05): Cam Malone (PG) is more than 12 ft from his man Karl Hall (PG) for 1.1 s without being in a help spot.
- **Offensive player standing still** (game seed 101, possession 50, Q2 10:29): Joel Strong (PG) stands still for 5.3 s in the mid-range while his team runs its half-court offense.
- **Offensive player standing still** (game seed 102, possession 84, Q2 4:45): Joel Wright (SG) stands still for 5.2 s at the arc while his team runs its half-court offense.
- **Offensive player standing still** (game seed 104, possession 111, Q3 9:12): Jabari Kavanagh (PF) stands still for 5.1 s well beyond the arc while his team runs its half-court offense.
- **Wide-open shooter passes it up** (game seed 102, possession 11, Q1 9:38): Jackson Lamb (PG, mid-range 71) catches with the nearest defender 10.9 ft away and 14.1 s on the shot clock, then passes it on after 2.7 s (the engine's next pass).
- **Wide-open shooter passes it up** (game seed 103, possession 137, Q3 4:42): Miles Dubois (SF, 3PT 75) catches with the nearest defender 15.2 ft away and 9.8 s on the shot clock, then passes it on after 2.9 s (the engine's next pass).
- **Wide-open shooter passes it up** (game seed 107, possession 136, Q3 1:05): Chris Blair (SG, 3PT 87) catches with the nearest defender 11.7 ft away and 13.1 s on the shot clock, then passes it on after 3.1 s (the engine's next pass).
- **Wide-open shooter never gets the ball** (game seed 101, possession 23, Q1 5:15): Joel Strong (PG, rated 89 from there) is wide open (nobody within 10 ft) for 2.6 s and never gets the ball.
- **Wide-open shooter never gets the ball** (game seed 102, possession 33, Q1 3:50): Colby Richards (SG, rated 78 from there) is wide open (nobody within 10 ft) for 2.1 s and never gets the ball.
- **Wide-open shooter never gets the ball** (game seed 103, possession 12, Q1 9:14): Andrew Garland (SF, rated 79 from there) is wide open (nobody within 10 ft) for 2.5 s and never gets the ball.
- **Low-rated shooter takes a three** (game seed 101, possession 84, Q2 1:39): Khalil Brewer (C, 3PT rating 41) takes a three (tight, missed).
- **Low-rated shooter takes a three** (game seed 106, possession 188, Q4 2:09): Emeka Ndiaye (PF, 3PT rating 49) takes a three (open, missed).
- **Low-rated shooter takes a three** (game seed 109, possession 177, Q4 1:46): Sam Ford (C, 3PT rating 49) takes a three (open, missed).
- **Rebound pulled into the hands** (game seed 101, possession 4, Q1 10:30): Khalil Brewer secures the rebound: the carom bends 4 ft in the air to reach his hands (grabbed 11.6 ft up).
- **Rebound pulled into the hands** (game seed 102, possession 20, Q1 7:03): Carlos Hampton secures the rebound: the ball jumps 3.2 ft into his hands (grabbed 10.9 ft up).
- **Rebound pulled into the hands** (game seed 103, possession 16, Q1 7:54): Jamison Holland secures the rebound: the carom bends 5.5 ft in the air to reach his hands (grabbed 11.5 ft up).
- **Ball defender too far off** (game seed 102, possession 42, Q1 1:56): Rudy Pritchard (SG) is more than 10 ft off the ball handler Oumar Black (PG) inside 28 ft for 1.3 s.
- **Ball defender too far off** (game seed 103, possession 11, Q1 9:25): Walker Kovac (PG) is more than 10 ft off the ball handler Ryan Rivers (PG) inside 28 ft for 1.1 s.
- **Ball defender too far off** (game seed 104, possession 5, Q1 10:43): Lorenzo Neal (PF) is more than 10 ft off the ball handler Jabari Kavanagh (PF) inside 28 ft for 1 s.
- **Typical half-court moment** (game seed 101, possession 6, Q1 10:07): A half-court moment (nothree defense, motion offense).
- **Typical half-court moment** (game seed 102, possession 10, Q1 10:04): A half-court moment (drop defense, balanced offense).
- **Typical half-court moment** (game seed 103, possession 6, Q1 10:28): A half-court moment (man defense, postUp offense).
