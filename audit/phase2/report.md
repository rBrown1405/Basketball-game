# Gameplay audit: Phase 2

52 full games of the Live view played headless (every possession from the tip to the final buzzer), players sampled every 0.1 s. Compared with: Phase 1.
Made by `node tools/audit/run.js` (see tools/audit/README.md).

## Game health (nothing broken)

| Metric | Before | Now | Change | Reference |
|---|---:|---:|---|---|
| Games played | 52 | 52 | same |  |
| Games that reached the final buzzer | 52 | 52 | same | all |
| Possessions per game | 200.8 | 200.8 | +0.0 |  |
| Stuck possessions (watchdog) | 0 | 0 | same | 0 |
| Script errors | 0 | 0 | same | 0 |
| Match warnings | 0 | 0 | same | 0 |
| Games where the court score differs from the engine | 0 | 0 | same | 0 |
| Points per game (both teams) | 230.5 | 230.2 | -0.3 | NBA ~228 |
| Wall time per game (ms) | 46461 | 48863 | +2402.0 |  |

## 1. On-ball defense (half court, ball in the handler's hands)

| Metric | Before | Now | Change | Reference |
|---|---:|---:|---|---|
| Defender between the ball handler and the basket | 90.4% | 89.9% | -0.5 (worse) | NBA tracking 94-98% |
| In a low defensive stance | 94.7% | 94.2% | -0.5 (worse) |  |
| Backing away from a handler who is not attacking | 4.2% | 3.1% | -1.1 (better) | ~0 |
|   episodes per game (0.3 s or longer) | 102.8 | 59.7 | -43.1 (better) |  |
|   of which walking backward facing him | 3.9% | 3.0% | -0.9 (better) |  |
| Back turned to the ball handler and walking away (handler not attacking) | 0.9% | 0.3% | -0.7 (better) | 0 unless beaten |
|   episodes per game | 16.7 | 5.1 | -11.6 (better) |  |
| Back turned to the ball handler (any speed) | 2.7% | 1.1% | -1.6 (better) |  |
| Running (feet crossing) within 10 ft while not beaten | 0.2% | 0.1% | -0.1 (better) |  |
| More than 10 ft off the handler inside 28 ft | 1.0% | 1.8% | +0.9 (worse) |  |
| Beaten (handler past him toward the rim) | 4.1% | 4.1% | +0.0 |  |
| Gap at 22-30 ft: handler 3PT under 50 | 4.8 ft | 5.4 ft | +0.5 | should be the biggest |
| Gap at 22-30 ft: handler 3PT 50-69 | 5.3 ft | 5.5 ft | +0.2 |  |
| Gap at 22-30 ft: handler 3PT 70-79 | 5.5 ft | 4.8 ft | -0.7 |  |
| Gap at 22-30 ft: handler 3PT 80+ | 5.5 ft | 4.3 ft | -1.2 | should be the smallest |
| Extra cushion given to non-shooters vs elite shooters | -0.7 ft | 1.0 ft | +1.7 (better) | 2-4 ft |

## 2. Off-ball defense (man schemes)

| Metric | Before | Now | Change | Reference |
|---|---:|---:|---|---|
| One pass away: in the passing lane (deny) | 70.0% | 73.2% | +3.2 (better) |  |
| Two passes away: in help position (lane or ball-rim line) | 61.0% | 63.3% | +2.3 (better) |  |
| Two passes away: sagged toward the rim from his man | 94.0% | 91.6% | -2.4 (worse) |  |
| Two passes away: can see man and ball | 47.7% | 57.9% | +10.2 (better) |  |
| Two passes away: glued to a man outside the lane (no help) | 0.9% | 1.7% | +0.8 (worse) |  |
| Extra defender crowding a guarded ball 12+ ft from the rim, no drive (seconds per game) | 32.5 s | 13.6 s | -18.8 (better) | ~0 |
|   share of half-court time | 2.2% | 0.9% | -1.2 (better) |  |
|   episodes per game | 37.3 | 18.0 | -19.3 (better) |  |
| Extra defender standing in the handler's path 12+ ft from the rim (seconds per game) | 38.9 s | 10.6 s | -28.3 (better) |  |
| Help at the rim (an extra defender on the ball inside 12 ft; the right play), seconds per game | 74.2 s | 59.9 s | -14.3 |  |
| More than 12 ft from his man and not in a help spot | 0.1% | 0.4% | +0.2 (worse) |  |
|   episodes per game | 4.6 | 10.9 | +6.3 (worse) |  |
| Half-court time against zones (not in these numbers) | 7.9% | 8.0% | +0.1 |  |

## 3. Offense: moving with a purpose

| Metric | Before | Now | Change | Reference |
|---|---:|---:|---|---|
| Off-ball players standing still (under 1 ft/s) | 19.7% | 20.1% | +0.4 (worse) |  |
| Off-ball players: average speed | 5.8 ft/s | 5.8 ft/s | 0.0 (worse) |  |
| Off-ball players moving at a jog or faster (6+ ft/s) | 42.3% | 42.2% | -0.1 (worse) |  |
| Off-ball players who moved less than 3 ft in the last 3 s | 2.5% | 2.8% | +0.3 (worse) |  |
| Stand-stills of 3 s or longer per game | 8.5 | 11.5 | +3.0 (worse) |  |
| Stand-stills of 5 s or longer per game | 1.5 | 1.8 | +0.3 (worse) |  |
| Off-ball players within 6 ft of a teammate | 17.8% | 18.3% | +0.5 (worse) |  |
| No job: holding or drifting around a spot that is not spacing (mid-range, paint, too deep) | 19.1% | 5.2% | -13.9 (better) |  |
|   of that time, in the mid-range | 47.2% | 40.3% | -7.0 |  |
| Spacing: holding a spot beyond the arc (a non-stretch big: by the rim) | 21.9% | 37.0% | +15.1 |  |
| Running a half-court action (screen away, cut, relocate, exchange, big flash) | 43.3% | 42.1% | -1.2 (worse) |  |
| Moving for the engine's next event (screen, cut, catch) | 15.5% | 15.5% | 0.0 |  |
| In an animation (catch, screen, pass, ...) | 0.2% | 0.2% | 0.0 |  |

## 4. Shot selection (engine)

| Metric | Before | Now | Change | Reference |
|---|---:|---:|---|---|
| Field goal attempts per game (both teams) | 190.8 | 190.5 | -0.3 | NBA ~178 |
| Three-point attempts per game | 73.6 | 72.7 | -1.0 | NBA ~75 |
| Threes by players rated under 50 (per game) | 0.3 | 0.1 | -0.2 (better) | ~0 |
| Threes by players rated under 40 (per game) | 0 | 0 | same | 0 |
| Threes by centers (per game) | 2.6 | 2.7 | +0.1 |  |
| Threes by non-stretch bigs (per game) | 2.9 | 2.3 | -0.5 (better) | ~0 |
| Share of all threes taken by players under 50 | 0.4% | 0.1% | -0.3 (better) |  |
| "Open" shots: median nearest defender at release | 6.0 ft | 6.3 ft | +0.3 (better) | 6+ ft |
| "Open" shots with a defender within 3 ft at release | 33.6% | 24.2% | -9.5 (better) | ~0 |
|   threes with a defender within 4 ft | 3.1% | 2.6% | -0.5 (better) | ~0 |
|   mid-range shots with a defender within 4 ft | 6.5% | 4.6% | -1.9 (better) | ~0 |
|   shots at the rim / in the paint with a defender within 3 ft | 71.3% | 49.3% | -22.0 (better) |  |
| "Contested" shots: median nearest defender | 3.8 ft | 4.4 ft | +0.6 | 2-4 ft |
| "Tight" shots: median nearest defender | 2.6 ft | 2.6 ft | same | 0-2 ft |
| "Tight" shots with nobody within 6 ft | 1.5% | 1.0% | -0.5 (better) | 0 |
| Shot clock left at the shot (median) | 10.2 s | 9.5 s | -0.7 |  |
| Shots with under 4 s on the shot clock (shot clock on) | 14.8% | 10.1% | -4.7 (better) | NBA ~7-9% |
| Shots with 18+ s on the shot clock (shot clock on) | 10.7% | 11.1% | +0.4 | NBA ~18-23% |

## 5. Open catches in the live game

| Metric | Before | Now | Change | Reference |
|---|---:|---:|---|---|
| Half-court catches per game | 401.2 | 402.4 | +1.2 |  |
| Wide-open catches (10+ ft) by a decent shooter for that spot (70+) within 26 ft, per game | 3.3 | 4.5 | +1.3 |  |
|   shot it | 46.5% | 53.4% | +6.9 (better) | most |
|   passed it on | 51.2% | 45.3% | -5.8 (better) | few |
|   wide-open shots passed up per game | 1.7 | 2.1 | +0.4 (worse) |  |
|   of those passes, flow swing passes (not the engine's) | 11.5% | 12.1% | +0.7 |  |
|   drove instead | 7.6% | 5.5% | -2.1 |  |
| Open catches (6-10 ft) by a decent shooter, per game | 24.1 | 27.5 | +3.3 |  |
|   shot it | 56.6% | 55.3% | -1.3 (worse) |  |
|   passed it on | 42.9% | 44.1% | +1.1 |  |
| Time a catcher holds the ball before passing (median) | 2.0 s | 2.1 s | +0.1 |  |
| Wide-open shooters off the ball (1 s or longer, 70+ from there, within 26 ft), per game | 44.7 | 41.3 | -3.4 |  |
|   the ball found him | 3.1% | 4.4% | +1.4 (better) |  |
|   seconds per game someone like that stands wide open | 87.8 s | 76.3 s | -11.5 |  |

## 6. Spacing and positions

| Metric | Before | Now | Change | Reference |
|---|---:|---:|---|---|
| PF and C (not stretch) in the paint, at the rim or short corner | 48.0% | 74.5% | +26.5 (better) |  |
| Five out: all five beyond the arc | 0.4% | 0.8% | +0.3 |  |
| Four or five beyond the arc | 2.1% | 4.3% | +2.2 |  |
| Two or fewer beyond the arc | 88.8% | 80.4% | -8.4 |  |
| Players beyond the arc on average | 1.3 | 1.7 | +0.4 |  |
| Nobody on offense within 12 ft of the rim | 30.0% | 17.5% | -12.5 |  |

## 7. Rebounding and the ball

| Metric | Before | Now | Change | Reference |
|---|---:|---:|---|---|
| Rebounds grabbed on court per game | 80.0 | 78.2 | -1.8 |  |
| Height of the grab (median) | 11.2 ft | 5.6 ft | -5.6 | many rebounds 5-9 ft |
| Rebounds grabbed above 10 ft | 97.8% | 34.0% | -63.7 (better) |  |
| Carom bent in the air toward the rebounder's hands by more than 1 ft | 27.6% | 9.0% | -18.6 (better) | 0 |
|   by more than 3 ft (looks like a teleport) | 20.1% | 0.0% | -20.0 (better) | 0 |
|   biggest bend | 32.2 ft | 3.4 ft | -28.8 (better) |  |
| Ball jumps more than 3 ft into the rebounder's hands | 6.8% | 0.6% | -6.2 (better) | 0 |
| Ball hangs still in the air before the grab (0.2 s+) | 3.9% | 0.0% | -3.9 (better) | 0 |
| Rebounds that hit the floor before anyone gets them | 0.0% | 9.3% | +9.3 (better) | long rebounds do |
| Passes bent more than 2 ft in the air toward the receiver | 59.9% | 49.5% | -10.4 (better) |  |
| Defenders boxing out on a miss | 2.1 | 1.8 | -0.3 (worse) |  |
|   boxing out a man 20+ ft from the rim | 0.7 | 0.4 | -0.3 (better) | ~0 |
| Defenders within 10 ft of the rim on a miss | 1.5 | 1.8 | +0.2 |  |
| Offensive players within 10 ft of the rim on a miss | 1.0 | 1.2 | +0.1 |  |

## 3b. Standing around by position (share of off-ball time)

| Position | still (<1 ft/s) | moved <3 ft in 3 s | no job |
|---|---|---|---|
| PG | 23.8% (was 22.0%) | 3.4% (was 2.7%) | 4.7% (was 21.2%) |
| SG | 23.0% (was 21.4%) | 3.4% (was 2.8%) | 5.3% (was 22.4%) |
| SF | 22.2% (was 20.9%) | 3.1% (was 2.7%) | 5.6% (was 24.8%) |
| PF | 16.6% (was 18.9%) | 2.2% (was 2.4%) | 6.4% (was 12.1%) |
| PF (stretch) | 20.6% (was 18.6%) | 3.0% (was 2.1%) | 6.5% (was 25.3%) |
| C | 14.5% (was 16.1%) | 2.0% (was 2.0%) | 3.4% (was 9.7%) |
| C (stretch) | 17.2% (was 15.9%) | 2.3% (was 1.9%) | 7.4% (was 28.7%) |

## 6b. Where each position spends its half-court time (offense)

| Position | at rim (<4 ft) | paint | short corner / baseline | mid-range | corner 3 | above-break 3 | deep (28+ ft) |
|---|---|---|---|---|---|---|---|
| PG | 1.0% (was 1.1%) | 8.8% (was 10.0%) | 8.0% (was 11.9%) | 28.8% (was 39.1%) | 7.2% (was 3.7%) | 35.1% (was 25.0%) | 11.0% (was 9.1%) |
| SG | 1.5% (was 1.7%) | 11.7% (was 13.0%) | 12.1% (was 16.4%) | 32.9% (was 42.0%) | 10.5% (was 5.2%) | 26.3% (was 17.5%) | 5.0% (was 4.2%) |
| SF | 2.4% (was 3.2%) | 11.7% (was 14.5%) | 15.1% (was 21.0%) | 29.8% (was 37.8%) | 12.2% (was 5.5%) | 24.7% (was 14.7%) | 4.0% (was 3.2%) |
| PF | 7.2% (was 5.0%) | 29.4% (was 19.7%) | 37.4% (was 23.9%) | 17.9% (was 32.8%) | 3.0% (was 4.4%) | 4.0% (was 10.3%) | 1.1% (was 4.0%) |
| PF (stretch) | 3.5% (was 5.2%) | 12.1% (was 18.0%) | 18.7% (was 26.1%) | 27.7% (was 31.7%) | 12.9% (was 5.2%) | 20.5% (was 10.7%) | 4.6% (was 3.2%) |
| C | 7.7% (was 5.7%) | 36.8% (was 23.9%) | 30.4% (was 18.0%) | 19.3% (was 32.3%) | 1.5% (was 1.9%) | 3.1% (was 10.2%) | 1.2% (was 8.1%) |
| C (stretch) | 3.8% (was 5.3%) | 14.3% (was 21.7%) | 16.6% (was 18.5%) | 29.0% (was 31.7%) | 7.0% (was 2.1%) | 18.8% (was 11.3%) | 10.4% (was 9.4%) |

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

- moved by: defensive tracker 80.0%, planner move (locked by a planner) 18.4%, other track (locked by a planner) 1.0%, idle (locked by a planner) 0.5%, idle 0.2%
- his defensive job (Phase 2 court roles): deny 66.3%, none 12.9%, post 9.7%, sink 2.9%, help 2.8%, closeout 2.1%
- engine beat: shot 34.9%, pass 27.8%, move 20.2%, set 10.2%, screen 5.1%, handoff 1.8%
- during a shot beat, the engine called the shot: contested (his man shoots) 51.3%, open (his man shoots) 25.2%, tight (his man shoots) 23.4%, contested (another shooter) 0.1%
- handler from the rim: 10-17 ft 47.4%, 17-23 ft 23.8%, 28-35 ft 16.0%, 23-28 ft 11.4%, 35+ ft 1.4%
- defender clip: none 99.4%, contestJump 0.5%, block 0.1%, turn 0.0%
- handler clip: none 90.5%, jumpStop 3.4%, jumpshot 2.0%, pullup 1.4%, jumpshot2 1.1%, turn 0.4%
- scheme: man 34.0%, drop 33.9%, switch 13.4%, pressure 6.3%, nothree 5.4%, packline 3.5%

**Off-ball defender lost his man**

- moved by: defensive tracker 90.8%, planner move (locked by a planner) 9.1%, other track (locked by a planner) 0.0%
- his defensive job (Phase 2 court roles): help 39.8%, deny 32.0%, home 18.3%, sink 6.0%, none 1.8%, post 0.6%
- engine beat: shot 41.9%, pass 23.8%, set 13.6%, move 11.9%, screen 6.7%, handoff 1.4%
- during a shot beat, the engine called the shot: contested (his man shoots) 48.1%, open (his man shoots) 28.6%, tight (his man shoots) 23.2%, contested (another shooter) 0.1%
- handler from the rim: under 10 ft 30.6%, 10-17 ft 21.3%, 23-28 ft 19.1%, 17-23 ft 18.5%, 28-35 ft 9.6%, 35+ ft 1.0%
- defender clip: none 100.0%
- handler clip: none 75.8%, layup 5.9%, rebound 4.8%, putback 2.2%, dunk 2.1%, jumpStop 1.6%
- scheme: man 39.8%, drop 35.7%, switch 9.9%, pressure 5.6%, nothree 5.5%, packline 2.6%

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
- **Off-ball defender lost his man** (game seed 103, possession 4, Q1 10:54): Rafael Black (PG) is more than 12 ft from his man Sam Campbell (SG) for 1 s without being in a help spot.
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
