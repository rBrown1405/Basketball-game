# Gameplay audit: Phase 2

52 full games of the Live view played headless (every possession from the tip to the final buzzer), players sampled every 0.1 s. Compared with: Phase 2 audit.
Made by `node tools/audit/run.js` (see tools/audit/README.md).

## Game health (nothing broken)

| Metric | Before | Now | Change | Reference |
|---|---:|---:|---|---|
| Games played | 52 | 52 | same |  |
| Games that reached the final buzzer | 52 | 52 | same | all |
| Possessions per game | 200.8 | 200.8 | same |  |
| Stuck possessions (watchdog) | 0 | 0 | same | 0 |
| Script errors | 0 | 0 | same | 0 |
| Match warnings | 0 | 0 | same | 0 |
| Games where the court score differs from the engine | 0 | 0 | same | 0 |
| Points per game (both teams) | 230.2 | 230.2 | same | NBA ~228 |
| Wall time per game (ms) | 48863 | 52403 | +3539.8 |  |

## 1. On-ball defense (half court, ball in the handler's hands)

| Metric | Before | Now | Change | Reference |
|---|---:|---:|---|---|
| Defender between the ball handler and the basket | 89.9% | 89.9% | same | NBA tracking 94-98% |
| In a low defensive stance | 94.2% | 94.2% | same |  |
| Backing away from a handler who is not attacking | 3.1% | 3.1% | same | ~0 |
|   episodes per game (0.3 s or longer) | 59.7 | 59.7 | same |  |
|   of which walking backward facing him | 3.0% | 3.0% | same |  |
| Back turned to the ball handler and walking away (handler not attacking) | 0.3% | 0.3% | same | 0 unless beaten |
|   episodes per game | 5.1 | 5.1 | same |  |
| Back turned to the ball handler (any speed) | 1.1% | 1.1% | same |  |
| Running (feet crossing) within 10 ft while not beaten | 0.1% | 0.1% | same |  |
| More than 10 ft off the handler inside 28 ft | 1.8% | 1.8% | same |  |
| Beaten (handler past him toward the rim) | 4.1% | 4.1% | same |  |
| Gap at 22-30 ft: handler 3PT under 50 | 5.4 ft | 5.4 ft | same | should be the biggest |
| Gap at 22-30 ft: handler 3PT 50-69 | 5.5 ft | 5.5 ft | same |  |
| Gap at 22-30 ft: handler 3PT 70-79 | 4.8 ft | 4.8 ft | same |  |
| Gap at 22-30 ft: handler 3PT 80+ | 4.3 ft | 4.3 ft | same | should be the smallest |
| Extra cushion given to non-shooters vs elite shooters | 1.0 ft | 1.0 ft | same | 2-4 ft |

## 2. Off-ball defense (man schemes)

| Metric | Before | Now | Change | Reference |
|---|---:|---:|---|---|
| One pass away: in the passing lane (deny) | 73.2% | 73.2% | same |  |
| Two passes away: in help position (lane or ball-rim line) | 63.3% | 63.3% | same |  |
| Two passes away: sagged toward the rim from his man | 91.6% | 91.6% | same |  |
| Two passes away: can see man and ball | 57.9% | 57.9% | same |  |
| Two passes away: glued to a man outside the lane (no help) | 1.7% | 1.7% | same |  |
| Extra defender crowding a guarded ball 12+ ft from the rim, no drive (seconds per game) | 13.6 s | 12.1 s | -1.6 (better) | ~0 |
|   share of half-court time | 0.9% | 0.8% | -0.1 (better) |  |
|   episodes per game | 18.0 | 15.7 | -2.3 (better) |  |
|   crowding time spent staying there (his own spot is on the ball; the rest is passing by on his way to a spot away from it) | n/a | 4.2 s |  |  |
| Extra defender standing in the handler's path 12+ ft from the rim (seconds per game) | 10.6 s | 9.2 s | -1.4 (better) |  |
| Two on the ball for the coverage of a ball screen or hand-off (hedge, show, blitz, ice) and getting back, 2.5 s after it: not counted above | n/a | 2.1 s |  |  |
| Screened off his man (his man came off an off-ball screen in the last 2 s): not counted as lost | n/a | 0.0% |  |  |
| Help at the rim (an extra defender on the ball inside 12 ft; the right play), seconds per game | 59.9 s | 59.9 s | same |  |
| More than 12 ft from his man and not in a help spot | 0.4% | 0.3% | 0.0 (better) |  |
|   episodes per game | 10.9 | 9.7 | -1.2 (better) |  |
| Half-court time against zones (not in these numbers) | 8.0% | 8.0% | same |  |

## 3. Offense: moving with a purpose

| Metric | Before | Now | Change | Reference |
|---|---:|---:|---|---|
| Off-ball players standing still (under 1 ft/s) | 20.1% | 20.1% | same |  |
| Off-ball players: average speed | 5.8 ft/s | 5.8 ft/s | same |  |
| Off-ball players moving at a jog or faster (6+ ft/s) | 42.2% | 42.2% | same |  |
| Off-ball players who moved less than 3 ft in the last 3 s | 2.8% | 2.8% | same |  |
| Stand-stills of 3 s or longer per game | 11.5 | 11.5 | same |  |
| Stand-stills of 5 s or longer per game | 1.8 | 1.8 | same |  |
| Off-ball players within 6 ft of a teammate | 18.3% | 18.3% | same |  |
| No job: holding or drifting around a spot that is not spacing (mid-range, paint, too deep) | 5.2% | 5.2% | same |  |
|   of that time, in the mid-range | 40.3% | 40.3% | same |  |
| Spacing: holding a spot beyond the arc (a non-stretch big: by the rim) | 37.0% | 37.0% | same |  |
| In a called play: on or around his spot in it | n/a | 0.0% |  |  |
| Running a half-court action (screen away, cut, relocate, exchange, big flash) | 42.1% | 42.1% | same |  |
| Moving for the engine's next event (screen, cut, catch) | 15.5% | 15.5% | same |  |
| In an animation (catch, screen, pass, ...) | 0.2% | 0.2% | same |  |

## 4. Shot selection (engine)

| Metric | Before | Now | Change | Reference |
|---|---:|---:|---|---|
| Field goal attempts per game (both teams) | 190.5 | 190.5 | same | NBA ~178 |
| Three-point attempts per game | 72.7 | 72.7 | same | NBA ~75 |
| Threes by players rated under 50 (per game) | 0.1 | 0.1 | same | ~0 |
| Threes by players rated under 40 (per game) | 0 | 0 | same | 0 |
| Threes by centers (per game) | 2.7 | 2.7 | same |  |
| Threes by non-stretch bigs (per game) | 2.3 | 2.3 | same | ~0 |
| Share of all threes taken by players under 50 | 0.1% | 0.1% | same |  |
| "Open" shots: median nearest defender at release | 6.3 ft | 6.3 ft | same | 6+ ft |
| "Open" shots with a defender within 3 ft at release | 24.2% | 24.2% | same | ~0 |
|   threes with a defender within 4 ft | 2.6% | 2.6% | same | ~0 |
|   mid-range shots with a defender within 4 ft | 4.6% | 4.6% | same | ~0 |
|   shots at the rim / in the paint with a defender within 3 ft | 49.3% | 49.3% | same |  |
| "Contested" shots: median nearest defender | 4.4 ft | 4.4 ft | same | 2-4 ft |
| "Tight" shots: median nearest defender | 2.6 ft | 2.6 ft | same | 0-2 ft |
| "Tight" shots with nobody within 6 ft | 1.0% | 1.0% | same | 0 |
| Shot clock left at the shot (median) | 9.5 s | 9.5 s | same |  |
| Shots with under 4 s on the shot clock (shot clock on) | 10.1% | 10.1% | same | NBA ~7-9% |
| Shots with 18+ s on the shot clock (shot clock on) | 11.1% | 11.1% | same | NBA ~18-23% |

## 5. Open catches in the live game

| Metric | Before | Now | Change | Reference |
|---|---:|---:|---|---|
| Half-court catches per game | 402.4 | 402.4 | same |  |
| Wide-open catches (10+ ft) by a decent shooter for that spot (70+) within 26 ft, per game | 4.5 | 4.5 | same |  |
|   shot it | 53.4% | 53.4% | same | most |
|   passed it on | 45.3% | 45.3% | same | few |
|   wide-open shots passed up per game | 2.1 | 2.1 | same |  |
|   of those passes, flow swing passes (not the engine's) | 12.1% | 12.1% | same |  |
|   drove instead | 5.5% | 5.5% | same |  |
| Open catches (6-10 ft) by a decent shooter, per game | 27.5 | 27.5 | same |  |
|   shot it | 55.3% | 55.3% | same |  |
|   passed it on | 44.1% | 44.1% | same |  |
| Time a catcher holds the ball before passing (median) | 2.1 s | 2.1 s | same |  |
| Wide-open shooters off the ball (1 s or longer, 70+ from there, within 26 ft), per game | 41.3 | 41.3 | same |  |
|   the ball found him | 4.4% | 4.4% | same |  |
|   seconds per game someone like that stands wide open | 76.3 s | 76.3 s | same |  |

## 6. Spacing and positions

| Metric | Before | Now | Change | Reference |
|---|---:|---:|---|---|
| PF and C (not stretch) in the paint, at the rim or short corner | 74.5% | 74.5% | same |  |
| Five out: all five beyond the arc | 0.8% | 0.8% | same |  |
| Four or five beyond the arc | 4.3% | 4.3% | same |  |
| Two or fewer beyond the arc | 80.4% | 80.4% | same |  |
| Players beyond the arc on average | 1.7 | 1.7 | same |  |
| Nobody on offense within 12 ft of the rim | 17.5% | 17.5% | same |  |

## 7. Rebounding and the ball

| Metric | Before | Now | Change | Reference |
|---|---:|---:|---|---|
| Rebounds grabbed on court per game | 78.2 | 78.2 | same |  |
| Height of the grab (median) | 5.6 ft | 5.6 ft | same | many rebounds 5-9 ft |
| Rebounds grabbed above 10 ft | 34.0% | 34.0% | same |  |
| Carom bent in the air toward the rebounder's hands by more than 1 ft | 9.0% | 9.0% | same | 0 |
|   by more than 3 ft (looks like a teleport) | 0.0% | 0.0% | same | 0 |
|   biggest bend | 3.4 ft | 3.4 ft | same |  |
| Ball jumps more than 3 ft into the rebounder's hands | 0.6% | 0.6% | same | 0 |
| Ball hangs still in the air before the grab (0.2 s+) | 0.0% | 0.0% | same | 0 |
| Rebounds that hit the floor before anyone gets them | 9.3% | 9.3% | same | long rebounds do |
| Passes bent more than 2 ft in the air toward the receiver | 49.5% | 49.5% | same |  |
| Defenders boxing out on a miss | 1.8 | 1.8 | same |  |
|   boxing out a man 20+ ft from the rim | 0.4 | 0.4 | same | ~0 |
| Defenders within 10 ft of the rim on a miss | 1.8 | 1.8 | same |  |
| Offensive players within 10 ft of the rim on a miss | 1.2 | 1.2 | same |  |

## 8. Called plays (the playbook)

| Metric | Before | Now | Change | Reference |
|---|---:|---:|---|---|
| Half-court possessions per game (both teams) | n/a | 0 |  |  |
| Half-court possessions with a called play (the rest played in flow) | n/a | 0.0% |  | NBA: most flow, sets at dead balls and ATOs |
| Plays called per game (resets and inbound plays included) | n/a | 0 |  |  |
| Plays that reached a read (a shot, or the ball in on an inbound) | n/a | 0.0% |  |  |
|   taken early (an opening before the last step: the play working) | n/a | 0.0% |  |  |
| Steps run, of all the plays' steps | n/a | 0.0% |  |  |
| Plays whose look was passed up (reset into a new call) | n/a | 0.0% |  |  |
| Plays stopped by a turnover | n/a | 0.0% |  |  |
| Plays stopped by a foul (side-out or free throws) | n/a | 0.0% |  |  |
| Points per half-court possession (the whole possession: second chances and free throws included) | n/a | n/a |  |  |
|   with a called play | n/a | n/a |  |  |
|   in flow | n/a | n/a |  |  |
| Players within 2 ft of their play spot 1.2 s into a step | n/a | 0.0% |  |  |
|   within 5 ft | n/a | 0.0% |  |  |
|   more than 10 ft away | n/a | 0.0% |  |  |
| Inbound plays per game (under the basket, sideline) | n/a | 0 |  |  |
|   ball in to the safety, then the half-court call | n/a | 0.0% |  |  |
| Ball screens where the screener's man plays the called coverage (drop, level, hedge, blitz, switch, ice) | n/a | n/a |  |  |

## 3b. Standing around by position (share of off-ball time)

| Position | still (<1 ft/s) | moved <3 ft in 3 s | no job |
|---|---|---|---|
| PG | 23.8% (was 23.8%) | 3.4% (was 3.4%) | 4.7% (was 4.7%) |
| SG | 23.0% (was 23.0%) | 3.4% (was 3.4%) | 5.3% (was 5.3%) |
| SF | 22.2% (was 22.2%) | 3.1% (was 3.1%) | 5.6% (was 5.6%) |
| PF | 16.6% (was 16.6%) | 2.2% (was 2.2%) | 6.4% (was 6.4%) |
| PF (stretch) | 20.6% (was 20.6%) | 3.0% (was 3.0%) | 6.5% (was 6.5%) |
| C | 14.5% (was 14.5%) | 2.0% (was 2.0%) | 3.4% (was 3.4%) |
| C (stretch) | 17.2% (was 17.2%) | 2.3% (was 2.3%) | 7.4% (was 7.4%) |

## 6b. Where each position spends its half-court time (offense)

| Position | at rim (<4 ft) | paint | short corner / baseline | mid-range | corner 3 | above-break 3 | deep (28+ ft) |
|---|---|---|---|---|---|---|---|
| PG | 1.0% (was 1.0%) | 8.8% (was 8.8%) | 8.0% (was 8.0%) | 28.8% (was 28.8%) | 7.2% (was 7.2%) | 35.1% (was 35.1%) | 11.0% (was 11.0%) |
| SG | 1.5% (was 1.5%) | 11.7% (was 11.7%) | 12.1% (was 12.1%) | 32.9% (was 32.9%) | 10.5% (was 10.5%) | 26.3% (was 26.3%) | 5.0% (was 5.0%) |
| SF | 2.4% (was 2.4%) | 11.7% (was 11.7%) | 15.1% (was 15.1%) | 29.8% (was 29.8%) | 12.2% (was 12.2%) | 24.7% (was 24.7%) | 4.0% (was 4.0%) |
| PF | 7.2% (was 7.2%) | 29.4% (was 29.4%) | 37.4% (was 37.4%) | 17.9% (was 17.9%) | 3.0% (was 3.0%) | 4.0% (was 4.0%) | 1.1% (was 1.1%) |
| PF (stretch) | 3.5% (was 3.5%) | 12.1% (was 12.1%) | 18.7% (was 18.7%) | 27.7% (was 27.7%) | 12.9% (was 12.9%) | 20.5% (was 20.5%) | 4.6% (was 4.6%) |
| C | 7.7% (was 7.7%) | 36.8% (was 36.8%) | 30.4% (was 30.4%) | 19.3% (was 19.3%) | 1.5% (was 1.5%) | 3.1% (was 3.1%) | 1.2% (was 1.2%) |
| C (stretch) | 3.8% (was 3.8%) | 14.3% (was 14.3%) | 16.6% (was 16.6%) | 29.0% (was 29.0%) | 7.0% (was 7.0%) | 18.8% (was 18.8%) | 10.4% (was 10.4%) |

## 8b. Called plays by family

| Family | calls per game | share | points per call | reached a read | early read |
|---|---|---|---|---|---|

## 8c. The most-called plays

| Play | calls per game | points per call | reached a read | early read |
|---|---|---|---|---|

## 8d. The defense's pick-and-roll coverage on called plays, and what the court shows 0.6 s after the ball screen

| Coverage | share of calls | screener's man: back in the lane | at the screen | on the ball | switched |
|---|---|---|---|---|---|

## 8e. The reads taken most often

| Read | per game |
|---|---|

## Low-rated three-point shooters who shot threes anyway

| Game seed | Player | Pos | Archetype | 3PT rating | 3PA | 3PM | Called open |
|---|---|---|---|---:|---:|---:|---:|
| 131 | Jaylen Porter | PF | Glue Defender | 46 | 1 | 1 | 0 |
| 122 | Travis Wheeler | PF | Post Scorer | 48 | 1 | 0 | 1 |
| 123 | Dennis Hawkins | C | Post Scorer | 49 | 1 | 0 | 0 |

## What was moving the flagged defenders

Share of the flagged samples (in 52 of the games) by the code path moving the defender, the engine beat under way and the handler's distance from the rim.

**Ball defender backing away**

- moved by: defensive tracker 56.6%, planner move (locked by a planner) 40.5%, other track (locked by a planner) 1.8%, idle 0.6%, idle (locked by a planner) 0.5%
- his defensive job (Phase 2 court roles): onBall 69.2%, closeout 21.0%, none 8.4%, deny 1.1%, post 0.2%, help 0.1%
- engine beat: shot 36.5%, move 27.9%, pass 22.9%, screen 9.7%, none 1.4%, set 1.1%
- during a shot beat, the engine called the shot: open (his man shoots) 44.7%, contested (his man shoots) 39.7%, tight (his man shoots) 15.6%
- handler from the rim: 17-23 ft 24.4%, 23-28 ft 24.3%, 10-17 ft 24.0%, under 10 ft 20.0%, 28-35 ft 7.3%
- defender clip: none 98.9%, fall 1.0%, turn 0.1%, wallUp 0.0%, contestJump 0.0%
- handler clip: none 86.5%, jumpshot 4.1%, jumpshot2 1.7%, jumpStop 1.5%, pullup 1.2%, turn 1.0%
- scheme: man 37.3%, drop 33.0%, switch 8.5%, nothree 5.6%, zone32 5.2%, pressure 4.5%

**Ball defender turning away**

- moved by: defensive tracker 84.5%, planner move (locked by a planner) 13.3%, other track (locked by a planner) 1.1%, idle 0.9%, idle (locked by a planner) 0.2%
- his defensive job (Phase 2 court roles): none 62.9%, onBall 30.1%, deny 3.2%, closeout 2.5%, post 0.8%, home 0.4%
- engine beat: pass 38.7%, set 17.6%, shot 16.9%, move 14.0%, screen 10.0%, handoff 1.8%
- during a shot beat, the engine called the shot: open (his man shoots) 45.4%, contested (his man shoots) 37.7%, tight (his man shoots) 16.6%, contested (another shooter) 0.3%
- handler from the rim: 28-35 ft 27.9%, 23-28 ft 24.1%, 17-23 ft 17.8%, under 10 ft 15.8%, 10-17 ft 14.4%
- defender clip: none 98.8%, turn 1.2%
- handler clip: none 89.0%, jumpStop 3.9%, layup 1.3%, putback 1.1%, dunk 0.8%, dunk2 0.7%
- scheme: zone32 32.4%, zone23 29.4%, man 14.0%, drop 13.8%, switch 4.3%, pressure 2.2%

**Off-ball defender crowding the ball**

- moved by: defensive tracker 80.7%, planner move (locked by a planner) 18.6%, idle (locked by a planner) 0.5%, idle 0.2%, other track (locked by a planner) 0.0%
- his defensive job (Phase 2 court roles): deny 67.7%, none 14.6%, post 6.1%, help 3.2%, sink 3.0%, closeout 2.4%
- engine beat: shot 36.1%, pass 29.7%, move 14.9%, set 11.5%, screen 5.7%, handoff 2.1%
- during a shot beat, the engine called the shot: contested (his man shoots) 52.7%, open (his man shoots) 23.9%, tight (his man shoots) 23.4%, contested (another shooter) 0.1%
- handler from the rim: 10-17 ft 48.4%, 17-23 ft 22.6%, 28-35 ft 17.3%, 23-28 ft 10.1%, 35+ ft 1.6%
- defender clip: none 99.3%, contestJump 0.6%, block 0.1%, turn 0.0%
- handler clip: none 90.0%, jumpStop 3.1%, jumpshot 2.3%, pullup 1.5%, jumpshot2 1.2%, turn 0.4%
- scheme: drop 36.7%, man 36.0%, switch 11.2%, pressure 5.7%, nothree 5.7%, packline 3.7%

**Off-ball defender lost his man**

- moved by: defensive tracker 90.2%, planner move (locked by a planner) 9.8%, other track (locked by a planner) 0.0%
- his defensive job (Phase 2 court roles): help 42.7%, deny 34.3%, home 19.7%, none 1.9%, post 0.7%, closeout 0.6%
- engine beat: shot 40.6%, pass 23.0%, set 14.5%, move 12.5%, screen 7.1%, handoff 1.5%
- during a shot beat, the engine called the shot: contested (his man shoots) 48.2%, open (his man shoots) 28.2%, tight (his man shoots) 23.6%, contested (another shooter) 0.1%
- handler from the rim: under 10 ft 29.7%, 10-17 ft 20.2%, 23-28 ft 20.1%, 17-23 ft 18.6%, 28-35 ft 10.3%, 35+ ft 1.1%
- defender clip: none 100.0%
- handler clip: none 76.1%, rebound 5.1%, layup 5.0%, putback 2.3%, dunk 1.9%, jumpStop 1.6%
- scheme: man 39.8%, drop 36.0%, switch 9.8%, pressure 5.6%, nothree 5.5%, packline 2.5%

**Two passes away but glued to his man**

- moved by: defensive tracker 96.0%, other track (locked by a planner) 2.1%, planner move (locked by a planner) 1.7%, idle 0.2%
- his defensive job (Phase 2 court roles): home 45.6%, help 40.0%, closeout 5.1%, post 3.6%, deny 2.0%, sink 1.3%
- engine beat: pass 29.8%, shot 23.0%, move 19.1%, set 14.3%, screen 13.0%, handoff 0.6%
- during a shot beat, the engine called the shot: contested (his man shoots) 46.0%, open (his man shoots) 28.2%, tight (his man shoots) 25.7%, contested (another shooter) 0.1%
- handler from the rim: 23-28 ft 28.8%, 28-35 ft 26.3%, 17-23 ft 17.2%, under 10 ft 15.2%, 10-17 ft 10.9%, 35+ ft 1.6%
- defender clip: none 99.8%, turn 0.2%
- handler clip: none 87.2%, jumpshot 1.8%, jumpStop 1.4%, pullup 1.1%, jumpshot2 1.1%, backdown 1.1%
- scheme: man 39.7%, drop 35.7%, switch 9.9%, nothree 6.9%, pressure 4.9%, packline 1.6%

## Examples to look at

- **Ball defender backing away** (game seed 101, possession 4, Q1 10:56): Taj Richards (SF) backs away from Ben Garland (SF) for 0.9 s while the ball handler is not attacking (gap 4.1 -> 6.3 ft).
- **Ball defender backing away** (game seed 102, possession 7, Q1 10:28): Oscar Graves (C) backs away from Earl Weaver (C) for 1.7 s while the ball handler is not attacking (gap 4.5 -> 13 ft).
- **Ball defender backing away** (game seed 103, possession 9, Q1 9:32): Ryan Rivers (PG) backs away from Walker Kovac (PG) for 0.4 s while the ball handler is not attacking (gap 2.5 -> 4.3 ft).
- **Ball defender turns and walks away** (game seed 102, possession 116, Q3 8:47): Colby Richards (SG) turns his back on the ball handler Amir Vaughn (C) and walks away for 0.5 s (gap 2 -> 2 ft).
- **Ball defender turns and walks away** (game seed 104, possession 184, Q4 2:37): Kellen Young (PG) turns his back on the ball handler Elijah Payne (PG) and walks away for 0.4 s (gap 4.4 -> 6.4 ft).
- **Ball defender turns and walks away** (game seed 106, possession 79, Q2 5:33): Kendrick Baker (C) turns his back on the ball handler Miles Kavanagh (C) and walks away for 0.6 s (gap 6.1 -> 10.4 ft).
- **Off-ball defender crowding the ball** (game seed 101, possession 4, Q1 11:03): Jerome Payton (C) leaves his man Khalil Brewer (C) to crowd the ball handler Joel Strong (PG) for 0.4 s (the ball is already guarded, 12+ ft from the rim, no drive).
- **Off-ball defender crowding the ball** (game seed 102, possession 3, Q1 11:14): Isaiah Olson (PG) leaves his man Jackson Lamb (PG) to crowd the ball handler Earl Weaver (C) for 0.5 s (the ball is already guarded, 12+ ft from the rim, no drive).
- **Off-ball defender crowding the ball** (game seed 103, possession 20, Q1 6:30): Amari Norman (PG) leaves his man Eric Graves (SF) to crowd the ball handler Keegan Horvat (SG) for 0.5 s (the ball is already guarded, 12+ ft from the rim, no drive).
- **Off-ball defender lost his man** (game seed 101, possession 2, Q1 11:29): Taj Richards (SF) is more than 12 ft from his man Ben Garland (SF) for 0.9 s without being in a help spot.
- **Off-ball defender lost his man** (game seed 102, possession 45, Q1 1:17): Isaiah Olson (PG) is more than 12 ft from his man Sterling Dawson (SG) for 0.8 s without being in a help spot.
- **Off-ball defender lost his man** (game seed 103, possession 34, Q1 3:21): Fred Miles (PF) is more than 12 ft from his man Jacob Hill (PF) for 0.7 s without being in a help spot.
- **Offensive player standing still** (game seed 101, possession 182, Q4 2:14): Chris Mbaye (SG) stands still for 5.6 s in the corner while his team runs its half-court offense.
- **Offensive player standing still** (game seed 102, possession 57, Q2 10:48): Marvin Allen (SG) stands still for 7.9 s in the short corner while his team runs its half-court offense.
- **Offensive player standing still** (game seed 103, possession 13, Q1 8:31): Walker Kovac (PG) stands still for 5.8 s in the corner while his team runs its half-court offense.
- **Wide-open shooter passes it up** (game seed 101, possession 37, Q1 2:00): Markell Douglas (PG, 3PT 82) catches with the nearest defender 21.9 ft away and 13.5 s on the shot clock, then passes it on after 3 s (the engine's next pass).
- **Wide-open shooter passes it up** (game seed 102, possession 109, Q3 10:11): Rudy Pritchard (SG, mid-range 72) catches with the nearest defender 10 ft away and 14.7 s on the shot clock, then passes it on after 0.4 s (the engine's next pass).
- **Wide-open shooter passes it up** (game seed 104, possession 31, Q1 4:22): Ike Gordon (PG, 3PT 83) catches with the nearest defender 12.7 ft away and 13.8 s on the shot clock, then passes it on after 6.1 s (the engine's next pass).
- **Wide-open shooter never gets the ball** (game seed 102, possession 44, Q1 1:44): Isaiah Olson (PG, rated 80 from there) is wide open (nobody within 10 ft) for 2.2 s and never gets the ball.
- **Wide-open shooter never gets the ball** (game seed 103, possession 103, Q3 10:27): Amari Norman (PG, rated 75 from there) is wide open (nobody within 10 ft) for 2.5 s and never gets the ball.
- **Wide-open shooter never gets the ball** (game seed 104, possession 51, Q2 11:36): Kellen Young (PG, rated 76 from there) is wide open (nobody within 10 ft) for 2 s and never gets the ball.
- **Low-rated shooter takes a three** (game seed 122, possession 117, Q3 7:11): Travis Wheeler (PF, 3PT rating 48) takes a three (open, missed).
- **Low-rated shooter takes a three** (game seed 123, possession 153, Q4 10:49): Dennis Hawkins (C, 3PT rating 49) takes a three (contested, missed).
- **Low-rated shooter takes a three** (game seed 131, possession 18, Q1 7:40): Jaylen Porter (PF, 3PT rating 46) takes a three (contested, made).
- **Rebound pulled into the hands** (game seed 103, possession 31, Q1 3:30): Shawn Adams secures the rebound: the ball jumps 9.6 ft into his hands (grabbed 2.6 ft up).
- **Rebound pulled into the hands** (game seed 105, possession 15, Q1 8:23): Harold Morgan secures the rebound: the ball jumps 16.7 ft into his hands (grabbed 0.4 ft up).
- **Rebound pulled into the hands** (game seed 110, possession 127, Q3 0:28): Maurice Cleveland secures the rebound: the ball jumps 5.2 ft into his hands (grabbed 0.7 ft up).
- **Ball defender too far off** (game seed 101, possession 30, Q1 4:11): Kevin Taylor (C) is more than 10 ft off the ball handler Demarcus Ferguson (PF) inside 28 ft for 1.1 s.
- **Ball defender too far off** (game seed 102, possession 7, Q1 10:27): Oscar Graves (C) is more than 10 ft off the ball handler Earl Weaver (C) inside 28 ft for 1.2 s.
- **Ball defender too far off** (game seed 103, possession 10, Q1 9:10): Omar Armstrong (C) is more than 10 ft off the ball handler Eric Graves (SF) inside 28 ft for 1.3 s.
- **Typical half-court moment** (game seed 101, possession 6, Q1 10:24): A half-court moment (man defense, pnrHeavy offense).
- **Typical half-court moment** (game seed 102, possession 8, Q1 10:16): A half-court moment (drop defense, balanced offense).
- **Typical half-court moment** (game seed 103, possession 6, Q1 10:18): A half-court moment (drop defense, pnrHeavy offense).
