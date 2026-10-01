# Gameplay audit: Phase 3 code

52 full games of the Live view played headless (every possession from the tip to the final buzzer), players sampled every 0.1 s. This run is the baseline the later phases are compared with.
Made by `node tools/audit/run.js` (see tools/audit/README.md).

## Game health (nothing broken)

| Metric | Value | Reference |
|---|---:|---|
| Games played | 52 |  |
| Games that reached the final buzzer | 52 | all |
| Possessions per game | 201.7 |  |
| Stuck possessions (watchdog) | 0 | 0 |
| Script errors | 0 | 0 |
| Match warnings | 0 | 0 |
| Games where the court score differs from the engine | 0 | 0 |
| Points per game (both teams) | 228.5 | NBA ~228 |
| Wall time per game (ms) | 57123 |  |

## 1. On-ball defense (half court, ball in the handler's hands)

| Metric | Value | Reference |
|---|---:|---|
| Defender between the ball handler and the basket | 90.2% | NBA tracking 94-98% |
| In a low defensive stance | 95.4% |  |
| Backing away from a handler who is not attacking | 2.2% | ~0 |
|   episodes per game (0.3 s or longer) | 42.3 |  |
|   of which walking backward facing him | 2.1% |  |
| Back turned to the ball handler and walking away (handler not attacking) | 0.3% | 0 unless beaten |
|   episodes per game | 6.6 |  |
| Back turned to the ball handler (any speed) | 1.3% |  |
| Running (feet crossing) within 10 ft while not beaten | 0.1% |  |
| More than 10 ft off the handler inside 28 ft | 1.3% |  |
| Beaten (handler past him toward the rim) | 4.6% |  |
| Gap at 22-30 ft: handler 3PT under 50 | 5.7 ft | should be the biggest |
| Gap at 22-30 ft: handler 3PT 50-69 | 5.5 ft |  |
| Gap at 22-30 ft: handler 3PT 70-79 | 4.6 ft |  |
| Gap at 22-30 ft: handler 3PT 80+ | 4.1 ft | should be the smallest |
| Extra cushion given to non-shooters vs elite shooters | 1.6 ft | 2-4 ft |

## 2. Off-ball defense (man schemes)

| Metric | Value | Reference |
|---|---:|---|
| One pass away: in the passing lane (deny) | 69.8% |  |
| Two passes away: in help position (lane or ball-rim line) | 57.3% |  |
| Two passes away: sagged toward the rim from his man | 90.9% |  |
| Two passes away: can see man and ball | 66.3% |  |
| Two passes away: glued to a man outside the lane (no help) | 1.7% |  |
| Extra defender crowding a guarded ball 12+ ft from the rim, no drive (seconds per game) | 15.0 s | ~0 |
|   share of half-court time | 0.9% |  |
|   episodes per game | 19.5 |  |
|   crowding time spent staying there (his own spot is on the ball; the rest is passing by on his way to a spot away from it) | 4.0 s |  |
| Extra defender standing in the handler's path 12+ ft from the rim (seconds per game) | 11.9 s |  |
| Two on the ball for the coverage of a ball screen or hand-off (hedge, show, blitz, ice) and getting back, 2.5 s after it: not counted above | 7.1 s |  |
| Screened off his man (his man came off an off-ball screen in the last 2 s): not counted as lost | 0.0% |  |
| Help at the rim (an extra defender on the ball inside 12 ft; the right play), seconds per game | 67.1 s |  |
| More than 12 ft from his man and not in a help spot | 0.4% |  |
|   episodes per game | 13.8 |  |
| Half-court time against zones (not in these numbers) | 7.7% |  |

## 3. Offense: moving with a purpose

| Metric | Value | Reference |
|---|---:|---|
| Off-ball players standing still (under 1 ft/s) | 22.1% |  |
| Off-ball players: average speed | 5.5 ft/s |  |
| Off-ball players moving at a jog or faster (6+ ft/s) | 35.0% |  |
| Off-ball players who moved less than 3 ft in the last 3 s | 5.0% |  |
| Stand-stills of 3 s or longer per game | 3.9 |  |
| Stand-stills of 5 s or longer per game | 0.7 |  |
| Off-ball players within 6 ft of a teammate | 14.0% |  |
| No job: holding or drifting around a spot that is not spacing (mid-range, paint, too deep) | 1.9% |  |
|   of that time, in the mid-range | 41.4% |  |
| Spacing: holding a spot beyond the arc (a non-stretch big: by the rim) | 17.2% |  |
| In a called play: on or around his spot in it | 40.3% |  |
| Running a half-court action (screen away, cut, relocate, exchange, big flash) | 21.3% |  |
| Moving for the engine's next event (screen, cut, catch) | 19.1% |  |
| In an animation (catch, screen, pass, ...) | 0.1% |  |

## 4. Shot selection (engine)

| Metric | Value | Reference |
|---|---:|---|
| Field goal attempts per game (both teams) | 189.9 | NBA ~178 |
| Three-point attempts per game | 71.4 | NBA ~75 |
| Threes by players rated under 50 (per game) | 0.1 | ~0 |
| Threes by players rated under 40 (per game) | 0 | 0 |
| Threes by centers (per game) | 2.5 |  |
| Threes by non-stretch bigs (per game) | 2.6 | ~0 |
| Share of all threes taken by players under 50 | 0.1% |  |
| "Open" shots: median nearest defender at release | 6.2 ft | 6+ ft |
| "Open" shots with a defender within 3 ft at release | 25.6% | ~0 |
|   threes with a defender within 4 ft | 2.9% | ~0 |
|   mid-range shots with a defender within 4 ft | 6.1% | ~0 |
|   shots at the rim / in the paint with a defender within 3 ft | 52.7% |  |
| "Contested" shots: median nearest defender | 3.8 ft | 2-4 ft |
| "Tight" shots: median nearest defender | 2.5 ft | 0-2 ft |
| "Tight" shots with nobody within 6 ft | 1.0% | 0 |
| Shot clock left at the shot (median) | 9.5 s |  |
| Shots with under 4 s on the shot clock (shot clock on) | 10.4% | NBA ~7-9% |
| Shots with 18+ s on the shot clock (shot clock on) | 11.4% | NBA ~18-23% |

## 5. Open catches in the live game

| Metric | Value | Reference |
|---|---:|---|
| Half-court catches per game | 400.2 |  |
| Wide-open catches (10+ ft) by a decent shooter for that spot (70+) within 26 ft, per game | 4.6 |  |
|   shot it | 51.9% | most |
|   passed it on | 47.3% | few |
|   wide-open shots passed up per game | 2.2 |  |
|   of those passes, flow swing passes (not the engine's) | 2.7% |  |
|   drove instead | 8.8% |  |
| Open catches (6-10 ft) by a decent shooter, per game | 30.0 |  |
|   shot it | 57.4% |  |
|   passed it on | 42.1% |  |
| Time a catcher holds the ball before passing (median) | 1.5 s |  |
| Wide-open shooters off the ball (1 s or longer, 70+ from there, within 26 ft), per game | 51.8 |  |
|   the ball found him | 7.6% |  |
|   seconds per game someone like that stands wide open | 97.7 s |  |

## 6. Spacing and positions

| Metric | Value | Reference |
|---|---:|---|
| PF and C (not stretch) in the paint, at the rim or short corner | 65.0% |  |
| Five out: all five beyond the arc | 1.2% |  |
| Four or five beyond the arc | 7.9% |  |
| Two or fewer beyond the arc | 70.7% |  |
| Players beyond the arc on average | 1.9 |  |
| Nobody on offense within 12 ft of the rim | 25.5% |  |

## 7. Rebounding and the ball

| Metric | Value | Reference |
|---|---:|---|
| Rebounds grabbed on court per game | 78.8 |  |
| Height of the grab (median) | 5.6 ft | many rebounds 5-9 ft |
| Rebounds grabbed above 10 ft | 33.4% |  |
| Carom bent in the air toward the rebounder's hands by more than 1 ft | 7.6% | 0 |
|   by more than 3 ft (looks like a teleport) | 0.0% | 0 |
|   biggest bend | 2.9 ft |  |
| Ball jumps more than 3 ft into the rebounder's hands | 0.3% | 0 |
| Ball hangs still in the air before the grab (0.2 s+) | 0.0% | 0 |
| Rebounds that hit the floor before anyone gets them | 8.5% | long rebounds do |
| Passes bent more than 2 ft in the air toward the receiver | 43.1% |  |
| Defenders boxing out on a miss | 1.5 |  |
|   boxing out a man 20+ ft from the rim | 0.4 | ~0 |
| Defenders within 10 ft of the rim on a miss | 1.7 |  |
| Offensive players within 10 ft of the rim on a miss | 1.1 |  |

## 8. Called plays (the playbook)

| Metric | Value | Reference |
|---|---:|---|
| Half-court possessions per game (both teams) | 170.4 |  |
| Half-court possessions with a called play (the rest played in flow) | 77.1% | NBA: most flow, sets at dead balls and ATOs |
| Plays called per game (resets and inbound plays included) | 153.9 |  |
| Plays that reached a read (a shot, or the ball in on an inbound) | 81.0% |  |
|   taken early (an opening before the last step: the play working) | 6.0% |  |
| Steps run, of all the plays' steps | 93.6% |  |
| Plays whose look was passed up (reset into a new call) | 1.1% |  |
| Plays stopped by a turnover | 12.7% |  |
| Plays stopped by a foul (side-out or free throws) | 5.3% |  |
| Points per half-court possession (the whole possession: second chances and free throws included) | 1.1 |  |
|   with a called play | 1.1 |  |
|   in flow | 1.1 |  |
| Players within 2 ft of their play spot 1.2 s into a step | 54.2% |  |
|   within 5 ft | 88.3% |  |
|   more than 10 ft away | 4.3% |  |
| Inbound plays per game (under the basket, sideline) | 12.8 |  |
|   ball in to the safety, then the half-court call | 73.2% |  |
| Ball screens where the screener's man plays the called coverage (drop, level, hedge, blitz, switch, ice) | 94.6% |  |

## 9. The head coach's calls and the drawn plays (Phase 4: runs with --calls 1)

| Metric | Value | Reference |
|---|---:|---|
| Plays the coach called per game (each for the next half-court possession) | n/a |  |
|   run by the engine on that possession | n/a | ~100 (a transition or putback possession waits for the next half-court one) |
| Coach-called plays run per game | n/a |  |
|   reached a read | n/a |  |
|   taken early | n/a |  |
|   stopped by a turnover | n/a |  |
|   points per call | n/a |  |
| Points per call on the staff's calls (both teams) | n/a |  |
| Drawn plays run per game (called by the coach or the staff) | n/a |  |
|   reached a read | n/a |  |
|   stopped by a turnover | n/a |  |
|   points per call | n/a |  |
|   players within 2 ft of the drawn spot 1.2 s into a step | n/a |  |
|   within 5 ft | n/a |  |
|   more than 10 ft away | n/a |  |
| Inbound calls run on the next throw-in under the basket | n/a |  |
| Defensive possessions under the coach's call played in the called scheme | n/a | 100 |
|   with the called pick-and-roll coverage | n/a | 100 |
| Defensive calls that went back to the team's own scheme when they ran out | n/a | 100 |

## 3b. Standing around by position (share of off-ball time)

| Position | still (<1 ft/s) | moved <3 ft in 3 s | no job |
|---|---|---|---|
| PG | 25.0% | 4.5% | 1.8% |
| SG | 24.0% | 5.1% | 1.9% |
| SF | 22.8% | 5.3% | 2.2% |
| PF | 20.3% | 5.4% | 2.8% |
| PF (stretch) | 21.4% | 4.9% | 2.2% |
| C | 19.0% | 5.1% | 1.2% |
| C (stretch) | 17.8% | 4.0% | 2.2% |

## 6b. Where each position spends its half-court time (offense)

| Position | at rim (<4 ft) | paint | short corner / baseline | mid-range | corner 3 | above-break 3 | deep (28+ ft) |
|---|---|---|---|---|---|---|---|
| PG | 0.6% | 6.6% | 8.6% | 25.4% | 11.5% | 35.4% | 11.9% |
| SG | 1.2% | 8.6% | 13.5% | 26.0% | 17.7% | 28.3% | 4.7% |
| SF | 2.1% | 11.0% | 16.8% | 26.1% | 17.7% | 22.6% | 3.8% |
| PF | 4.5% | 23.5% | 32.9% | 23.6% | 4.0% | 10.0% | 1.5% |
| PF (stretch) | 2.5% | 13.4% | 20.8% | 26.4% | 15.4% | 17.1% | 4.4% |
| C | 4.7% | 28.9% | 34.5% | 23.4% | 1.4% | 5.8% | 1.3% |
| C (stretch) | 2.5% | 14.9% | 21.1% | 28.4% | 5.5% | 17.2% | 10.4% |

## 8b. Called plays by family

| Family | calls per game | share | points per call | reached a read | early read |
|---|---|---|---|---|---|
| Pick and roll | 29.2 | 19.0% | 0.99 | 79.1% | 15.4% |
| Motion | 23.4 | 15.2% | 1.05 | 81.2% | 0.0% |
| Isolation | 19.0 | 12.4% | 0.94 | 79.2% | 0.0% |
| Post | 17.9 | 11.6% | 0.98 | 79.1% | 3.8% |
| Horns | 17.0 | 11.0% | 1.00 | 79.2% | 2.0% |
| Cutting | 13.9 | 9.1% | 1.04 | 77.0% | 10.3% |
| Off-screen | 11.3 | 7.4% | 1.05 | 81.7% | 15.3% |
| Sideline inbound | 9.6 | 6.2% | 0.52 | 97.4% | 0.0% |
| Hand-off | 7.4 | 4.8% | 0.94 | 79.5% | 5.4% |
| Baseline inbound | 3.2 | 2.1% | 0.58 | 93.9% | 0.0% |
| Zone offense | 1.8 | 1.2% | 1.00 | 83.3% | 12.5% |

## 8c. The most-called plays

| Play | calls per game | points per call | reached a read | early read |
|---|---|---|---|---|
| Motion Swing | 11.8 | 1.10 | 83.3% | 0.0% |
| Drive and Kick | 11.6 | 1.00 | 79.1% | 0.0% |
| Chin Backdoor | 8.1 | 0.99 | 76.0% | 0.0% |
| Clear-Out at the Top | 7.6 | 0.96 | 78.6% | 0.0% |
| Low Post Isolation | 7.1 | 0.92 | 79.8% | 0.0% |
| Elbow Isolation | 6.6 | 0.95 | 80.3% | 0.0% |
| High-Low | 6.0 | 1.04 | 80.6% | 11.1% |
| High Pick and Roll | 6.0 | 1.05 | 82.1% | 20.4% |
| Side Pick and Roll | 5.7 | 0.94 | 78.3% | 13.2% |
| Pick and Pop | 5.6 | 0.98 | 79.0% | 0.0% |
| Horns Twist | 5.3 | 1.01 | 80.2% | 0.0% |
| Spain Pick and Roll | 5.2 | 1.00 | 78.3% | 47.8% |
| Zipper (SLOB) | 5.0 | 0.53 | 97.7% | 0.0% |
| Duck-In | 4.8 | 0.98 | 76.3% | 0.0% |
| Wing Isolation | 4.8 | 0.90 | 78.6% | 0.0% |
| Horns | 4.8 | 1.05 | 83.1% | 0.0% |

## 8d. The defense's pick-and-roll coverage on called plays, and what the court shows 0.6 s after the ball screen

| Coverage | share of calls | screener's man: back in the lane | at the screen | on the ball | switched |
|---|---|---|---|---|---|
| drop | 46.4% | 93.4% | 6.3% | 0.2% | 0.0% |
| show | 16.8% | 0.4% | 8.9% | 90.7% | 0.0% |
| switch | 14.2% | 0.0% | 0.4% | 0.4% | 99.3% |
| zone | 8.1% | 79.8% | 8.0% | 12.2% | 0.0% |
| ice | 6.9% | 71.3% | 17.5% | 11.3% | 0.0% |
| hedge | 5.9% | 0.9% | 27.8% | 71.3% | 0.0% |
| blitz | 1.6% | 0.0% | 34.7% | 65.3% | 0.0% |

## 8e. The reads taken most often

| Read | per game |
|---|---|
| Kick to the open shooter | 10.7 |
| Kick out | 8.0 |
| Open three off the swing | 8.0 |
| One on one | 4.6 |
| Safety, run offense | 4.2 |
| Catch and run offense | 3.9 |
| Face-up jumper or drive | 3.8 |
| Post move | 3.3 |
| Backdoor layup | 2.9 |
| One on one on the wing | 2.7 |
| Seal and score | 2.5 |
| Finish at the rim | 2.5 |
| Kick out of the double | 2.4 |
| Kick to a corner | 2.4 |

## Low-rated three-point shooters who shot threes anyway

| Game seed | Player | Pos | Archetype | 3PT rating | 3PA | 3PM | Called open |
|---|---|---|---|---:|---:|---:|---:|
| 120 | Jabari Simpson | PF | Athletic Four | 49 | 2 | 1 | 1 |
| 128 | Myles Singh | C | Playmaking Big | 47 | 1 | 1 | 0 |

## What was moving the flagged defenders

Share of the flagged samples (in 52 of the games) by the code path moving the defender, the engine beat under way and the handler's distance from the rim.

**Ball defender backing away**

- moved by: defensive tracker 61.2%, planner move (locked by a planner) 34.3%, other track (locked by a planner) 3.1%, idle (locked by a planner) 1.1%, idle 0.3%
- his defensive job (Phase 2 court roles): onBall 67.5%, closeout 21.2%, none 9.9%, deny 0.8%, help 0.3%, home 0.2%
- engine beat: shot 30.9%, pass 21.7%, move 18.3%, step 10.3%, screen 8.8%, set 7.6%
- during a shot beat, the engine called the shot: open (his man shoots) 54.0%, contested (his man shoots) 33.8%, tight (his man shoots) 12.2%
- handler from the rim: 23-28 ft 29.5%, 17-23 ft 27.1%, 10-17 ft 20.8%, under 10 ft 16.8%, 28-35 ft 5.8%
- defender clip: none 98.5%, fall 1.3%, turn 0.1%, contestJump 0.1%, wallUp 0.0%, block 0.0%
- handler clip: none 75.1%, jumpshot 5.4%, pullup 4.6%, jumpStop 3.2%, turn 2.8%, jumpshot2 2.3%
- scheme: man 31.1%, drop 30.8%, switch 12.1%, nothree 6.1%, zone32 5.2%, pressure 4.6%

**Ball defender turning away**

- moved by: defensive tracker 83.3%, planner move (locked by a planner) 12.4%, other track (locked by a planner) 2.0%, idle 1.6%, idle (locked by a planner) 0.7%
- his defensive job (Phase 2 court roles): none 57.6%, onBall 32.8%, closeout 4.0%, deny 3.4%, post 0.8%, home 0.8%
- engine beat: set 33.2%, pass 26.3%, shot 14.1%, step 11.5%, move 8.3%, screen 4.8%
- during a shot beat, the engine called the shot: open (his man shoots) 52.3%, contested (his man shoots) 34.0%, tight (his man shoots) 13.7%
- handler from the rim: 23-28 ft 30.3%, 28-35 ft 26.1%, 17-23 ft 17.7%, under 10 ft 14.1%, 10-17 ft 11.8%
- defender clip: none 97.6%, turn 2.2%, fall 0.1%, wallUp 0.1%
- handler clip: none 84.3%, jumpStop 8.8%, layup 1.0%, dunk 1.0%, pullup 0.9%, floater 0.7%
- scheme: zone32 28.8%, zone23 28.1%, man 15.5%, drop 13.3%, switch 5.8%, nothree 3.7%

**Off-ball defender crowding the ball**

- moved by: defensive tracker 70.9%, planner move (locked by a planner) 28.7%, idle (locked by a planner) 0.3%, idle 0.1%
- his defensive job (Phase 2 court roles): deny 66.3%, none 10.5%, home 5.1%, help 4.5%, sink 3.7%, post 3.5%
- engine beat: shot 25.6%, set 25.3%, pass 19.0%, step 13.5%, move 10.2%, screen 5.3%
- during a shot beat, the engine called the shot: contested (his man shoots) 49.4%, open (his man shoots) 27.3%, tight (his man shoots) 23.3%
- handler from the rim: 10-17 ft 45.0%, 17-23 ft 21.5%, 23-28 ft 21.1%, 28-35 ft 10.8%, 35+ ft 1.6%
- defender clip: none 99.7%, contestJump 0.2%, block 0.1%, turn 0.0%, wallUp 0.0%
- handler clip: none 89.4%, jumpStop 3.3%, jumpshot 1.4%, turn 1.1%, pullup 1.1%, jumpshot2 0.8%
- scheme: man 34.6%, drop 34.3%, switch 16.0%, nothree 4.6%, pressure 4.4%, hedge 2.2%

**Off-ball defender lost his man**

- moved by: defensive tracker 90.0%, planner move (locked by a planner) 9.9%, idle (locked by a planner) 0.1%
- his defensive job (Phase 2 court roles): deny 40.0%, help 34.5%, home 22.2%, closeout 1.8%, none 0.9%, post 0.4%
- engine beat: shot 35.4%, set 25.9%, pass 18.1%, step 8.5%, move 7.2%, screen 3.8%
- during a shot beat, the engine called the shot: contested (his man shoots) 46.3%, open (his man shoots) 28.8%, tight (his man shoots) 24.8%
- handler from the rim: under 10 ft 30.2%, 23-28 ft 22.9%, 10-17 ft 20.9%, 17-23 ft 15.9%, 28-35 ft 9.7%, 35+ ft 0.4%
- defender clip: none 100.0%
- handler clip: none 73.5%, layup 6.0%, rebound 4.6%, jumpStop 2.8%, dunk 2.3%, putback 1.6%
- scheme: man 35.9%, drop 32.5%, switch 14.4%, nothree 6.3%, pressure 5.5%, hedge 2.7%

**Two passes away but glued to his man**

- moved by: defensive tracker 96.7%, planner move (locked by a planner) 2.3%, other track (locked by a planner) 1.0%, idle 0.0%, idle (locked by a planner) 0.0%
- his defensive job (Phase 2 court roles): home 53.8%, help 37.2%, closeout 2.9%, deny 2.7%, post 1.1%, sink 1.0%
- engine beat: set 39.0%, pass 22.8%, step 14.6%, shot 9.6%, screen 6.4%, move 6.2%
- during a shot beat, the engine called the shot: contested (his man shoots) 43.4%, open (his man shoots) 32.5%, tight (his man shoots) 23.9%, tight (another shooter) 0.1%
- handler from the rim: 28-35 ft 37.3%, 23-28 ft 34.9%, 17-23 ft 13.9%, 10-17 ft 6.4%, under 10 ft 6.1%, 35+ ft 1.2%
- defender clip: none 99.9%, turn 0.1%, fall 0.0%
- handler clip: none 88.1%, jumpStop 5.3%, jumpshot 1.6%, pivot 0.9%, jumpshot2 0.8%, pullup 0.6%
- scheme: man 36.6%, drop 33.3%, switch 12.5%, nothree 6.8%, pressure 5.5%, hedge 3.0%

## Examples to look at

- **Ball defender backing away** (game seed 101, possession 6, Q1 10:52): Jerome Payton (C) backs away from Khalil Brewer (C) for 0.4 s while the ball handler is not attacking (gap 5.3 -> 7 ft).
- **Ball defender backing away** (game seed 102, possession 3, Q1 11:20): Joel Wright (SG) backs away from Rudy Pritchard (SG) for 0.4 s while the ball handler is not attacking (gap 2.2 -> 3.3 ft).
- **Ball defender backing away** (game seed 103, possession 35, Q1 4:04): Sam Campbell (SG) backs away from Amari Norman (PG) for 0.7 s while the ball handler is not attacking (gap 2.3 -> 4.7 ft).
- **Ball defender turns and walks away** (game seed 102, possession 173, Q4 6:21): Jackson Lamb (PG) turns his back on the ball handler Wade Hernandez (PG) and walks away for 0.4 s (gap 3.4 -> 2.7 ft).
- **Ball defender turns and walks away** (game seed 103, possession 96, Q2 1:06): Miles Dubois (SF) turns his back on the ball handler Ty Terry (SG) and walks away for 0.4 s (gap 2 -> 2.6 ft).
- **Ball defender turns and walks away** (game seed 104, possession 150, Q4 11:34): Omar Dunn (C) turns his back on the ball handler Kelvin Dubois (C) and walks away for 0.5 s (gap 2.7 -> 2.1 ft).
- **Off-ball defender crowding the ball** (game seed 101, possession 31, Q1 4:28): Daryl Crawford (C) leaves his man Jerome Payton (C) to crowd the ball handler Jesse Becker (SG) for 0.6 s (the ball is already guarded, 12+ ft from the rim, no drive).
- **Off-ball defender crowding the ball** (game seed 102, possession 28, Q1 4:38): Sterling Dawson (SG) leaves his man Amir Vaughn (C) to crowd the ball handler Tim Randolph (PF) for 0.5 s (the ball is already guarded, 12+ ft from the rim, no drive).
- **Off-ball defender crowding the ball** (game seed 103, possession 13, Q1 9:08): Kellen Sims (SG) leaves his man Eddie Walsh (SG) to crowd the ball handler Walker Kovac (PG) for 0.5 s (the ball is already guarded, 12+ ft from the rim, no drive).
- **Off-ball defender lost his man** (game seed 101, possession 23, Q1 6:32): Joel McKinney (PG) is more than 12 ft from his man Jesse Becker (SG) for 0.8 s without being in a help spot.
- **Off-ball defender lost his man** (game seed 102, possession 2, Q1 11:46): Rudy Pritchard (SG) is more than 12 ft from his man Joel Wright (SG) for 1.1 s without being in a help spot.
- **Off-ball defender lost his man** (game seed 103, possession 22, Q1 6:51): Ty Terry (SG) is more than 12 ft from his man Eric Graves (SF) for 0.6 s without being in a help spot.
- **Offensive player standing still** (game seed 101, possession 131, Q3 3:57): Taj Richards (SF) stands still for 6.3 s in the corner while his team runs its half-court offense.
- **Offensive player standing still** (game seed 102, possession 99, Q2 0:11): Amir Dixon (SF) stands still for 8 s in the corner while his team runs its half-court offense.
- **Offensive player standing still** (game seed 104, possession 189, Q4 1:15): Jabari Kavanagh (PF) stands still for 5.1 s in the corner while his team runs its half-court offense.
- **Wide-open shooter passes it up** (game seed 106, possession 111, Q3 9:59): Evan Chambers (SG, 3PT 82) catches with the nearest defender 10.2 ft away and 13.4 s on the shot clock, then passes it on after 5.7 s (the engine's next pass).
- **Wide-open shooter passes it up** (game seed 107, possession 46, Q1 0:53): Omar Smith (SF, mid-range 71) catches with the nearest defender 11 ft away and 10.1 s on the shot clock, then passes it on after 1.5 s (the engine's next pass).
- **Wide-open shooter passes it up** (game seed 108, possession 141, Q3 1:04): Jaden Horvat (PG, mid-range 82) catches with the nearest defender 11.5 ft away and 13.8 s on the shot clock, then passes it on after 3.2 s (the engine's next pass).
- **Wide-open shooter never gets the ball** (game seed 101, possession 155, Q4 9:48): Chris Mbaye (SG, rated 89 from there) is wide open (nobody within 10 ft) for 3.3 s and never gets the ball.
- **Wide-open shooter never gets the ball** (game seed 102, possession 18, Q1 7:32): Garrett Gibson (SF, rated 71 from there) is wide open (nobody within 10 ft) for 2.2 s and never gets the ball.
- **Wide-open shooter never gets the ball** (game seed 103, possession 81, Q2 4:49): Keegan Horvat (SG, rated 74 from there) is wide open (nobody within 10 ft) for 2.1 s and never gets the ball.
- **Low-rated shooter takes a three** (game seed 120, possession 68, Q2 7:09): Jabari Simpson (PF, 3PT rating 49) takes a three (open, made).
- **Low-rated shooter takes a three** (game seed 128, possession 203, Q4 0:42): Myles Singh (C, 3PT rating 47) takes a three (contested, made).
- **Rebound pulled into the hands** (game seed 102, possession 195, Q4 0:50): Oscar Graves secures the rebound: the ball jumps 3.2 ft into his hands (grabbed 1.9 ft up).
- **Rebound pulled into the hands** (game seed 106, possession 136, Q3 3:58): Ismael Foster secures the rebound: the ball jumps 4.1 ft into his hands (grabbed 0.8 ft up).
- **Rebound pulled into the hands** (game seed 115, possession 85, Q2 1:26): Tyler Payne secures the rebound: the ball jumps 3.6 ft into his hands (grabbed 1.1 ft up).
- **Ball defender too far off** (game seed 101, possession 138, Q3 1:46): Julius Thomas (SG) is more than 10 ft off the ball handler Grant Isaac (PG) inside 28 ft for 1.1 s.
- **Ball defender too far off** (game seed 102, possession 39, Q1 1:52): Joel Wright (SG) is more than 10 ft off the ball handler Sterling Dawson (SG) inside 28 ft for 1.7 s.
- **Ball defender too far off** (game seed 103, possession 53, Q1 0:17): Sam Campbell (SG) is more than 10 ft off the ball handler Rafael Black (PG) inside 28 ft for 3.6 s.
- **Typical half-court moment** (game seed 101, possession 10, Q1 10:14): A half-court moment (man defense, pnrHeavy offense).
- **Typical half-court moment** (game seed 102, possession 6, Q1 10:32): A half-court moment (switch defense, balanced offense).
- **Typical half-court moment** (game seed 103, possession 7, Q1 10:17): A half-court moment (man defense, postUp offense).
