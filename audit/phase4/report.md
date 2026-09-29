# Gameplay audit: Phase 4

52 full games of the Live view played headless (every possession from the tip to the final buzzer), players sampled every 0.1 s. Compared with: Phase 3.
Made by `node tools/audit/run.js` (see tools/audit/README.md).

## Game health (nothing broken)

| Metric | Before | Now | Change | Reference |
|---|---:|---:|---|---|
| Games played | 52 | 52 | same |  |
| Games that reached the final buzzer | 52 | 52 | same | all |
| Possessions per game | 201.7 | 201.7 | same |  |
| Stuck possessions (watchdog) | 0 | 0 | same | 0 |
| Script errors | 0 | 0 | same | 0 |
| Match warnings | 0 | 0 | same | 0 |
| Games where the court score differs from the engine | 0 | 0 | same | 0 |
| Points per game (both teams) | 228.5 | 228.5 | same | NBA ~228 |
| Wall time per game (ms) | 57123 | 56544 | -578.5 |  |

## 1. On-ball defense (half court, ball in the handler's hands)

| Metric | Before | Now | Change | Reference |
|---|---:|---:|---|---|
| Defender between the ball handler and the basket | 90.2% | 90.1% | -0.1 (worse) | NBA tracking 94-98% |
| In a low defensive stance | 95.4% | 95.4% | 0.0 (worse) |  |
| Backing away from a handler who is not attacking | 2.2% | 2.1% | 0.0 (better) | ~0 |
|   episodes per game (0.3 s or longer) | 42.3 | 42.1 | -0.2 (better) |  |
|   of which walking backward facing him | 2.1% | 2.1% | 0.0 (better) |  |
| Back turned to the ball handler and walking away (handler not attacking) | 0.3% | 0.3% | +0.0 (worse) | 0 unless beaten |
|   episodes per game | 6.6 | 6.8 | +0.2 (worse) |  |
| Back turned to the ball handler (any speed) | 1.3% | 1.4% | +0.0 (worse) |  |
| Running (feet crossing) within 10 ft while not beaten | 0.1% | 0.1% | +0.0 (worse) |  |
| More than 10 ft off the handler inside 28 ft | 1.3% | 1.3% | +0.0 (worse) |  |
| Beaten (handler past him toward the rim) | 4.6% | 4.6% | +0.0 |  |
| Gap at 22-30 ft: handler 3PT under 50 | 5.7 ft | 5.7 ft | +0.0 | should be the biggest |
| Gap at 22-30 ft: handler 3PT 50-69 | 5.5 ft | 5.5 ft | +0.0 |  |
| Gap at 22-30 ft: handler 3PT 70-79 | 4.6 ft | 4.6 ft | 0.0 |  |
| Gap at 22-30 ft: handler 3PT 80+ | 4.1 ft | 4.1 ft | +0.0 | should be the smallest |
| Extra cushion given to non-shooters vs elite shooters | 1.6 ft | 1.6 ft | 0.0 (worse) | 2-4 ft |

## 2. Off-ball defense (man schemes)

| Metric | Before | Now | Change | Reference |
|---|---:|---:|---|---|
| One pass away: in the passing lane (deny) | 69.8% | 69.8% | 0.0 (worse) |  |
| Two passes away: in help position (lane or ball-rim line) | 57.3% | 57.3% | +0.0 (better) |  |
| Two passes away: sagged toward the rim from his man | 90.9% | 90.9% | 0.0 (worse) |  |
| Two passes away: can see man and ball | 66.3% | 66.3% | +0.0 (better) |  |
| Two passes away: glued to a man outside the lane (no help) | 1.7% | 1.7% | 0.0 (better) |  |
| Extra defender crowding a guarded ball 12+ ft from the rim, no drive (seconds per game) | 15.0 s | 15.2 s | +0.2 (worse) | ~0 |
|   share of half-court time | 0.9% | 0.9% | +0.0 (worse) |  |
|   episodes per game | 19.5 | 19.5 | -0.1 (better) |  |
|   crowding time spent staying there (his own spot is on the ball; the rest is passing by on his way to a spot away from it) | 4.0 s | 3.9 s | -0.1 (better) |  |
| Extra defender standing in the handler's path 12+ ft from the rim (seconds per game) | 11.9 s | 11.9 s | 0.0 (better) |  |
| Two on the ball for the coverage of a ball screen or hand-off (hedge, show, blitz, ice) and getting back, 2.5 s after it: not counted above | 7.1 s | 7.6 s | +0.4 |  |
| Screened off his man (his man came off an off-ball screen in the last 2 s): not counted as lost | 0.0% | 0.0% | 0.0 |  |
| Help at the rim (an extra defender on the ball inside 12 ft; the right play), seconds per game | 67.1 s | 66.3 s | -0.8 |  |
| More than 12 ft from his man and not in a help spot | 0.4% | 0.4% | +0.0 (worse) |  |
|   episodes per game | 13.8 | 14.3 | +0.4 (worse) |  |
| Half-court time against zones (not in these numbers) | 7.7% | 7.7% | +0.0 |  |

## 3. Offense: moving with a purpose

| Metric | Before | Now | Change | Reference |
|---|---:|---:|---|---|
| Off-ball players standing still (under 1 ft/s) | 22.1% | 22.1% | 0.0 (better) |  |
| Off-ball players: average speed | 5.5 ft/s | 5.5 ft/s | 0.0 (worse) |  |
| Off-ball players moving at a jog or faster (6+ ft/s) | 35.0% | 35.0% | +0.0 (better) |  |
| Off-ball players who moved less than 3 ft in the last 3 s | 5.0% | 5.0% | 0.0 (better) |  |
| Stand-stills of 3 s or longer per game | 3.9 | 4.1 | +0.2 (worse) |  |
| Stand-stills of 5 s or longer per game | 0.7 | 0.6 | 0.0 (better) |  |
| Off-ball players within 6 ft of a teammate | 14.0% | 14.0% | -0.1 (better) |  |
| No job: holding or drifting around a spot that is not spacing (mid-range, paint, too deep) | 1.9% | 1.9% | +0.0 (worse) |  |
|   of that time, in the mid-range | 41.4% | 42.4% | +0.9 |  |
| Spacing: holding a spot beyond the arc (a non-stretch big: by the rim) | 17.2% | 17.1% | 0.0 |  |
| In a called play: on or around his spot in it | 40.3% | 40.3% | +0.0 |  |
| Running a half-court action (screen away, cut, relocate, exchange, big flash) | 21.3% | 21.3% | +0.0 (better) |  |
| Moving for the engine's next event (screen, cut, catch) | 19.1% | 19.1% | +0.0 |  |
| In an animation (catch, screen, pass, ...) | 0.1% | 0.1% | +0.0 |  |

## 4. Shot selection (engine)

| Metric | Before | Now | Change | Reference |
|---|---:|---:|---|---|
| Field goal attempts per game (both teams) | 189.9 | 189.9 | same | NBA ~178 |
| Three-point attempts per game | 71.4 | 71.4 | same | NBA ~75 |
| Threes by players rated under 50 (per game) | 0.1 | 0.1 | same | ~0 |
| Threes by players rated under 40 (per game) | 0 | 0 | same | 0 |
| Threes by centers (per game) | 2.5 | 2.5 | same |  |
| Threes by non-stretch bigs (per game) | 2.6 | 2.6 | same | ~0 |
| Share of all threes taken by players under 50 | 0.1% | 0.1% | same |  |
| "Open" shots: median nearest defender at release | 6.2 ft | 6.2 ft | same | 6+ ft |
| "Open" shots with a defender within 3 ft at release | 25.6% | 25.7% | +0.1 (worse) | ~0 |
|   threes with a defender within 4 ft | 2.9% | 3.2% | +0.3 (worse) | ~0 |
|   mid-range shots with a defender within 4 ft | 6.1% | 5.8% | -0.3 (better) | ~0 |
|   shots at the rim / in the paint with a defender within 3 ft | 52.7% | 52.8% | +0.1 (worse) |  |
| "Contested" shots: median nearest defender | 3.8 ft | 3.9 ft | +0.1 | 2-4 ft |
| "Tight" shots: median nearest defender | 2.5 ft | 2.6 ft | +0.1 | 0-2 ft |
| "Tight" shots with nobody within 6 ft | 1.0% | 1.0% | +0.1 (worse) | 0 |
| Shot clock left at the shot (median) | 9.5 s | 9.5 s | same |  |
| Shots with under 4 s on the shot clock (shot clock on) | 10.4% | 10.4% | same | NBA ~7-9% |
| Shots with 18+ s on the shot clock (shot clock on) | 11.4% | 11.4% | same | NBA ~18-23% |

## 5. Open catches in the live game

| Metric | Before | Now | Change | Reference |
|---|---:|---:|---|---|
| Half-court catches per game | 400.2 | 400.1 | -0.1 |  |
| Wide-open catches (10+ ft) by a decent shooter for that spot (70+) within 26 ft, per game | 4.6 | 4.4 | -0.2 |  |
|   shot it | 51.9% | 51.9% | +0.1 (better) | most |
|   passed it on | 47.3% | 47.2% | -0.1 (better) | few |
|   wide-open shots passed up per game | 2.2 | 2.1 | -0.1 (better) |  |
|   of those passes, flow swing passes (not the engine's) | 2.7% | 4.6% | +1.9 |  |
|   drove instead | 8.8% | 8.7% | -0.1 |  |
| Open catches (6-10 ft) by a decent shooter, per game | 30.0 | 30.0 | -0.1 |  |
|   shot it | 57.4% | 56.1% | -1.4 (worse) |  |
|   passed it on | 42.1% | 43.5% | +1.4 |  |
| Time a catcher holds the ball before passing (median) | 1.5 s | 1.5 s | same |  |
| Wide-open shooters off the ball (1 s or longer, 70+ from there, within 26 ft), per game | 51.8 | 52.2 | +0.4 |  |
|   the ball found him | 7.6% | 7.5% | -0.1 (worse) |  |
|   seconds per game someone like that stands wide open | 97.7 s | 98.3 s | +0.6 |  |

## 6. Spacing and positions

| Metric | Before | Now | Change | Reference |
|---|---:|---:|---|---|
| PF and C (not stretch) in the paint, at the rim or short corner | 65.0% | 65.0% | 0.0 (worse) |  |
| Five out: all five beyond the arc | 1.2% | 1.2% | +0.0 |  |
| Four or five beyond the arc | 7.9% | 7.9% | 0.0 |  |
| Two or fewer beyond the arc | 70.7% | 70.6% | -0.1 |  |
| Players beyond the arc on average | 1.9 | 1.9 | +0.0 |  |
| Nobody on offense within 12 ft of the rim | 25.5% | 25.6% | +0.0 |  |

## 7. Rebounding and the ball

| Metric | Before | Now | Change | Reference |
|---|---:|---:|---|---|
| Rebounds grabbed on court per game | 78.8 | 78.8 | same |  |
| Height of the grab (median) | 5.6 ft | 5.6 ft | same | many rebounds 5-9 ft |
| Rebounds grabbed above 10 ft | 33.4% | 33.4% | same |  |
| Carom bent in the air toward the rebounder's hands by more than 1 ft | 7.6% | 8.1% | +0.5 (worse) | 0 |
|   by more than 3 ft (looks like a teleport) | 0.0% | 0.0% | +0.0 (worse) | 0 |
|   biggest bend | 2.9 ft | 3.3 ft | +0.4 (worse) |  |
| Ball jumps more than 3 ft into the rebounder's hands | 0.3% | 0.2% | 0.0 (better) | 0 |
| Ball hangs still in the air before the grab (0.2 s+) | 0.0% | 0.0% | same | 0 |
| Rebounds that hit the floor before anyone gets them | 8.5% | 8.6% | +0.0 (better) | long rebounds do |
| Passes bent more than 2 ft in the air toward the receiver | 43.1% | 43.2% | +0.1 (worse) |  |
| Defenders boxing out on a miss | 1.5 | 1.5 | +0.0 (better) |  |
|   boxing out a man 20+ ft from the rim | 0.4 | 0.4 | 0.0 (better) | ~0 |
| Defenders within 10 ft of the rim on a miss | 1.7 | 1.7 | 0.0 |  |
| Offensive players within 10 ft of the rim on a miss | 1.1 | 1.1 | +0.0 |  |

## 8. Called plays (the playbook)

| Metric | Before | Now | Change | Reference |
|---|---:|---:|---|---|
| Half-court possessions per game (both teams) | 170.4 | 170.4 | same |  |
| Half-court possessions with a called play (the rest played in flow) | 77.1% | 77.1% | same | NBA: most flow, sets at dead balls and ATOs |
| Plays called per game (resets and inbound plays included) | 153.9 | 153.9 | same |  |
| Plays that reached a read (a shot, or the ball in on an inbound) | 81.0% | 81.0% | same |  |
|   taken early (an opening before the last step: the play working) | 6.0% | 6.0% | same |  |
| Steps run, of all the plays' steps | 93.6% | 93.6% | same |  |
| Plays whose look was passed up (reset into a new call) | 1.1% | 1.1% | same |  |
| Plays stopped by a turnover | 12.7% | 12.7% | same |  |
| Plays stopped by a foul (side-out or free throws) | 5.3% | 5.3% | same |  |
| Points per half-court possession (the whole possession: second chances and free throws included) | 1.1 | 1.1 | same |  |
|   with a called play | 1.1 | 1.1 | same |  |
|   in flow | 1.1 | 1.1 | same |  |
| Players within 2 ft of their play spot 1.2 s into a step | 54.2% | 54.2% | +0.0 (better) |  |
|   within 5 ft | 88.3% | 88.2% | -0.1 (worse) |  |
|   more than 10 ft away | 4.3% | 4.3% | +0.1 (worse) |  |
| Inbound plays per game (under the basket, sideline) | 12.8 | 12.8 | same |  |
|   ball in to the safety, then the half-court call | 73.2% | 73.2% | same |  |
| Ball screens where the screener's man plays the called coverage (drop, level, hedge, blitz, switch, ice) | 94.6% | 94.3% | -0.3 (worse) |  |

## 9. The head coach's calls and the drawn plays (Phase 4: runs with --calls 1)

| Metric | Before | Now | Change | Reference |
|---|---:|---:|---|---|
| Plays the coach called per game (each for the next half-court possession) | n/a | n/a |  |  |
|   run by the engine on that possession | n/a | n/a |  | ~100 (a transition or putback possession waits for the next half-court one) |
| Coach-called plays run per game | n/a | n/a |  |  |
|   reached a read | n/a | n/a |  |  |
|   taken early | n/a | n/a |  |  |
|   stopped by a turnover | n/a | n/a |  |  |
|   points per call | n/a | n/a |  |  |
| Points per call on the staff's calls (both teams) | n/a | n/a |  |  |
| Drawn plays run per game (called by the coach or the staff) | n/a | n/a |  |  |
|   reached a read | n/a | n/a |  |  |
|   stopped by a turnover | n/a | n/a |  |  |
|   points per call | n/a | n/a |  |  |
|   players within 2 ft of the drawn spot 1.2 s into a step | n/a | n/a |  |  |
|   within 5 ft | n/a | n/a |  |  |
|   more than 10 ft away | n/a | n/a |  |  |
| Inbound calls run on the next throw-in under the basket | n/a | n/a |  |  |
| Defensive possessions under the coach's call played in the called scheme | n/a | n/a |  | 100 |
|   with the called pick-and-roll coverage | n/a | n/a |  | 100 |
| Defensive calls that went back to the team's own scheme when they ran out | n/a | n/a |  | 100 |

## 3b. Standing around by position (share of off-ball time)

| Position | still (<1 ft/s) | moved <3 ft in 3 s | no job |
|---|---|---|---|
| PG | 25.0% (was 25.0%) | 4.5% (was 4.5%) | 1.8% (was 1.8%) |
| SG | 24.0% (was 24.0%) | 5.0% (was 5.1%) | 1.8% (was 1.9%) |
| SF | 22.9% (was 22.8%) | 5.3% (was 5.3%) | 2.1% (was 2.2%) |
| PF | 20.2% (was 20.3%) | 5.5% (was 5.4%) | 2.9% (was 2.8%) |
| PF (stretch) | 21.3% (was 21.4%) | 4.9% (was 4.9%) | 2.2% (was 2.2%) |
| C | 18.9% (was 19.0%) | 5.0% (was 5.1%) | 1.2% (was 1.2%) |
| C (stretch) | 17.7% (was 17.8%) | 3.9% (was 4.0%) | 2.3% (was 2.2%) |

## 6b. Where each position spends its half-court time (offense)

| Position | at rim (<4 ft) | paint | short corner / baseline | mid-range | corner 3 | above-break 3 | deep (28+ ft) |
|---|---|---|---|---|---|---|---|
| PG | 0.6% (was 0.6%) | 6.5% (was 6.6%) | 8.6% (was 8.6%) | 25.4% (was 25.4%) | 11.6% (was 11.5%) | 35.4% (was 35.4%) | 11.9% (was 11.9%) |
| SG | 1.2% (was 1.2%) | 8.5% (was 8.6%) | 13.4% (was 13.5%) | 25.9% (was 26.0%) | 17.8% (was 17.7%) | 28.3% (was 28.3%) | 4.8% (was 4.7%) |
| SF | 2.1% (was 2.1%) | 11.0% (was 11.0%) | 16.7% (was 16.8%) | 26.0% (was 26.1%) | 17.7% (was 17.7%) | 22.7% (was 22.6%) | 3.8% (was 3.8%) |
| PF | 4.6% (was 4.5%) | 23.6% (was 23.5%) | 32.9% (was 32.9%) | 23.6% (was 23.6%) | 3.9% (was 4.0%) | 9.9% (was 10.0%) | 1.5% (was 1.5%) |
| PF (stretch) | 2.6% (was 2.5%) | 13.3% (was 13.4%) | 20.6% (was 20.8%) | 26.6% (was 26.4%) | 15.6% (was 15.4%) | 16.9% (was 17.1%) | 4.5% (was 4.4%) |
| C | 4.7% (was 4.7%) | 29.0% (was 28.9%) | 34.3% (was 34.5%) | 23.5% (was 23.4%) | 1.4% (was 1.4%) | 5.8% (was 5.8%) | 1.3% (was 1.3%) |
| C (stretch) | 2.5% (was 2.5%) | 14.6% (was 14.9%) | 21.2% (was 21.1%) | 28.5% (was 28.4%) | 5.4% (was 5.5%) | 17.4% (was 17.2%) | 10.5% (was 10.4%) |

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
| drop | 46.4% | 92.9% | 6.8% | 0.3% | 0.0% |
| show | 16.8% | 0.0% | 10.5% | 89.5% | 0.0% |
| switch | 14.2% | 0.0% | 0.0% | 0.4% | 99.6% |
| zone | 8.1% | 79.8% | 8.5% | 11.7% | 0.0% |
| ice | 6.9% | 67.5% | 17.5% | 15.0% | 0.0% |
| hedge | 5.9% | 0.9% | 29.6% | 69.6% | 0.0% |
| blitz | 1.6% | 0.0% | 32.7% | 67.3% | 0.0% |

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

- moved by: defensive tracker 60.9%, planner move (locked by a planner) 34.6%, other track (locked by a planner) 3.2%, idle (locked by a planner) 1.1%, idle 0.3%
- his defensive job (Phase 2 court roles): onBall 67.3%, closeout 21.2%, none 9.9%, deny 1.0%, help 0.2%, post 0.2%
- engine beat: shot 31.1%, pass 21.8%, move 18.3%, step 10.5%, screen 8.7%, set 7.3%
- during a shot beat, the engine called the shot: open (his man shoots) 53.0%, contested (his man shoots) 34.7%, tight (his man shoots) 12.3%
- handler from the rim: 23-28 ft 29.3%, 17-23 ft 27.2%, 10-17 ft 20.8%, under 10 ft 16.7%, 28-35 ft 6.0%
- defender clip: none 98.6%, fall 1.2%, turn 0.1%, contestJump 0.1%, wallUp 0.0%, block 0.0%
- handler clip: none 75.2%, jumpshot 5.3%, pullup 4.6%, jumpStop 3.1%, turn 2.9%, jumpshot2 2.2%
- scheme: drop 31.5%, man 30.5%, switch 12.3%, nothree 6.2%, zone32 5.2%, pressure 4.5%

**Ball defender turning away**

- moved by: defensive tracker 82.7%, planner move (locked by a planner) 12.2%, idle 2.3%, other track (locked by a planner) 2.3%, idle (locked by a planner) 0.6%
- his defensive job (Phase 2 court roles): none 57.5%, onBall 32.6%, deny 4.5%, closeout 3.5%, post 1.0%, home 0.5%
- engine beat: set 33.6%, pass 26.6%, shot 14.0%, step 11.0%, move 8.2%, screen 5.1%
- during a shot beat, the engine called the shot: open (his man shoots) 51.5%, contested (his man shoots) 34.5%, tight (his man shoots) 14.0%
- handler from the rim: 23-28 ft 30.2%, 28-35 ft 26.4%, 17-23 ft 17.8%, under 10 ft 13.7%, 10-17 ft 12.0%
- defender clip: none 97.1%, turn 2.8%, fall 0.1%, wallUp 0.0%
- handler clip: none 84.2%, jumpStop 9.0%, dunk 1.1%, pullup 1.0%, rebound 0.8%, layup 0.8%
- scheme: zone32 28.6%, zone23 27.8%, man 15.8%, drop 13.5%, switch 5.9%, nothree 4.1%

**Off-ball defender crowding the ball**

- moved by: defensive tracker 69.9%, planner move (locked by a planner) 29.9%, idle (locked by a planner) 0.2%, idle 0.0%
- his defensive job (Phase 2 court roles): deny 65.7%, none 10.5%, home 5.0%, help 4.6%, sink 3.7%, closeout 3.7%
- engine beat: set 26.3%, shot 24.7%, pass 18.0%, step 13.8%, move 10.7%, screen 5.4%
- during a shot beat, the engine called the shot: contested (his man shoots) 47.4%, open (his man shoots) 27.7%, tight (his man shoots) 24.8%, tight (another shooter) 0.1%
- handler from the rim: 10-17 ft 44.9%, 23-28 ft 21.6%, 17-23 ft 21.5%, 28-35 ft 10.5%, 35+ ft 1.5%
- defender clip: none 99.8%, contestJump 0.1%, block 0.1%, turn 0.0%, wallUp 0.0%
- handler clip: none 89.5%, jumpStop 4.0%, jumpshot 1.2%, pullup 1.0%, turn 0.9%, pivot 0.8%
- scheme: drop 34.4%, man 33.6%, switch 15.8%, nothree 5.2%, pressure 4.4%, hedge 3.1%

**Off-ball defender lost his man**

- moved by: defensive tracker 89.7%, planner move (locked by a planner) 10.3%, idle (locked by a planner) 0.0%
- his defensive job (Phase 2 court roles): deny 40.2%, help 32.9%, home 23.0%, closeout 1.8%, none 1.1%, post 0.9%
- engine beat: shot 35.9%, set 26.0%, pass 17.0%, step 8.4%, move 7.6%, screen 4.0%
- during a shot beat, the engine called the shot: contested (his man shoots) 47.1%, open (his man shoots) 28.6%, tight (his man shoots) 24.3%
- handler from the rim: under 10 ft 30.0%, 23-28 ft 22.7%, 10-17 ft 21.8%, 17-23 ft 16.2%, 28-35 ft 8.9%, 35+ ft 0.4%
- defender clip: none 100.0%
- handler clip: none 73.4%, layup 6.5%, rebound 4.0%, jumpStop 2.8%, dunk 2.3%, putback 1.6%
- scheme: man 35.1%, drop 32.6%, switch 14.1%, nothree 6.8%, pressure 5.5%, hedge 3.2%

**Two passes away but glued to his man**

- moved by: defensive tracker 96.7%, planner move (locked by a planner) 2.2%, other track (locked by a planner) 1.0%, idle 0.0%, idle (locked by a planner) 0.0%
- his defensive job (Phase 2 court roles): home 53.3%, help 37.8%, closeout 3.1%, deny 2.6%, post 1.1%, sink 0.9%
- engine beat: set 38.9%, pass 22.8%, step 14.1%, shot 10.1%, screen 6.8%, move 6.0%
- during a shot beat, the engine called the shot: contested (his man shoots) 42.3%, open (his man shoots) 35.6%, tight (his man shoots) 22.2%
- handler from the rim: 28-35 ft 37.3%, 23-28 ft 34.9%, 17-23 ft 14.1%, under 10 ft 6.4%, 10-17 ft 6.0%, 35+ ft 1.3%
- defender clip: none 99.9%, turn 0.1%, fall 0.0%
- handler clip: none 87.6%, jumpStop 5.3%, jumpshot 1.8%, pivot 0.9%, jumpshot2 0.8%, rebound 0.7%
- scheme: man 36.0%, drop 33.9%, switch 12.5%, nothree 6.5%, pressure 5.4%, hedge 3.3%

## Examples to look at

- **Ball defender backing away** (game seed 101, possession 6, Q1 10:52): Jerome Payton (C) backs away from Khalil Brewer (C) for 0.4 s while the ball handler is not attacking (gap 5.3 -> 7 ft).
- **Ball defender backing away** (game seed 102, possession 3, Q1 11:20): Joel Wright (SG) backs away from Rudy Pritchard (SG) for 0.4 s while the ball handler is not attacking (gap 2.2 -> 3.3 ft).
- **Ball defender backing away** (game seed 103, possession 35, Q1 4:04): Sam Campbell (SG) backs away from Amari Norman (PG) for 0.7 s while the ball handler is not attacking (gap 2.3 -> 4.7 ft).
- **Ball defender turns and walks away** (game seed 101, possession 56, Q2 10:22): Walker Haywood (C) turns his back on the ball handler Joel McKinney (PG) and walks away for 0.4 s (gap 2 -> 2.7 ft).
- **Ball defender turns and walks away** (game seed 102, possession 173, Q4 6:21): Jackson Lamb (PG) turns his back on the ball handler Wade Hernandez (PG) and walks away for 0.4 s (gap 3.4 -> 2.7 ft).
- **Ball defender turns and walks away** (game seed 103, possession 96, Q2 1:06): Miles Dubois (SF) turns his back on the ball handler Ty Terry (SG) and walks away for 0.4 s (gap 2 -> 2.6 ft).
- **Off-ball defender crowding the ball** (game seed 101, possession 29, Q1 5:03): Khalil Brewer (C) leaves his man Walker Haywood (C) to crowd the ball handler Jay Daniels (PG) for 0.5 s (the ball is already guarded, 12+ ft from the rim, no drive).
- **Off-ball defender crowding the ball** (game seed 102, possession 28, Q1 4:38): Sterling Dawson (SG) leaves his man Amir Vaughn (C) to crowd the ball handler Tim Randolph (PF) for 0.5 s (the ball is already guarded, 12+ ft from the rim, no drive).
- **Off-ball defender crowding the ball** (game seed 103, possession 13, Q1 9:08): Kellen Sims (SG) leaves his man Eddie Walsh (SG) to crowd the ball handler Walker Kovac (PG) for 0.5 s (the ball is already guarded, 12+ ft from the rim, no drive).
- **Off-ball defender lost his man** (game seed 101, possession 25, Q1 6:03): Demarcus Ferguson (PF) is more than 12 ft from his man Walker Haywood (C) for 1.7 s without being in a help spot.
- **Off-ball defender lost his man** (game seed 102, possession 2, Q1 11:46): Rudy Pritchard (SG) is more than 12 ft from his man Joel Wright (SG) for 1.1 s without being in a help spot.
- **Off-ball defender lost his man** (game seed 103, possession 22, Q1 6:51): Ty Terry (SG) is more than 12 ft from his man Eric Graves (SF) for 0.6 s without being in a help spot.
- **Offensive player standing still** (game seed 101, possession 131, Q3 3:57): Taj Richards (SF) stands still for 6.4 s in the corner while his team runs its half-court offense.
- **Offensive player standing still** (game seed 102, possession 99, Q2 0:11): Amir Dixon (SF) stands still for 8 s in the corner while his team runs its half-court offense.
- **Offensive player standing still** (game seed 104, possession 189, Q4 1:15): Jabari Kavanagh (PF) stands still for 5.1 s in the corner while his team runs its half-court offense.
- **Wide-open shooter passes it up** (game seed 101, possession 44, Q1 1:06): Chris Mbaye (SG, 3PT 89) catches with the nearest defender 22.2 ft away and 13.8 s on the shot clock, then passes it on after 6.9 s (the engine's next pass).
- **Wide-open shooter passes it up** (game seed 106, possession 66, Q2 8:58): Ari Henry (PG, 3PT 77) catches with the nearest defender 10.3 ft away and 20.8 s on the shot clock, then passes it on after 9.4 s (the engine's next pass).
- **Wide-open shooter passes it up** (game seed 107, possession 46, Q1 0:53): Omar Smith (SF, mid-range 71) catches with the nearest defender 11 ft away and 10.1 s on the shot clock, then passes it on after 1.5 s (the engine's next pass).
- **Wide-open shooter never gets the ball** (game seed 101, possession 155, Q4 9:48): Chris Mbaye (SG, rated 89 from there) is wide open (nobody within 10 ft) for 3.2 s and never gets the ball.
- **Wide-open shooter never gets the ball** (game seed 102, possession 18, Q1 7:32): Garrett Gibson (SF, rated 71 from there) is wide open (nobody within 10 ft) for 2.2 s and never gets the ball.
- **Wide-open shooter never gets the ball** (game seed 103, possession 81, Q2 4:49): Keegan Horvat (SG, rated 74 from there) is wide open (nobody within 10 ft) for 2.1 s and never gets the ball.
- **Low-rated shooter takes a three** (game seed 120, possession 68, Q2 7:09): Jabari Simpson (PF, 3PT rating 49) takes a three (open, made).
- **Low-rated shooter takes a three** (game seed 128, possession 203, Q4 0:42): Myles Singh (C, 3PT rating 47) takes a three (contested, made).
- **Rebound pulled into the hands** (game seed 102, possession 195, Q4 0:50): Oscar Graves secures the rebound: the ball jumps 3.2 ft into his hands (grabbed 1.9 ft up).
- **Rebound pulled into the hands** (game seed 116, possession 193, Q4 0:07): Brendan Collins secures the rebound: the ball jumps 3.1 ft into his hands (grabbed 1.5 ft up).
- **Rebound pulled into the hands** (game seed 122, possession 120, Q3 6:36): Eddie Harper secures the rebound: the ball jumps 3.2 ft into his hands (grabbed 1.6 ft up).
- **Ball defender too far off** (game seed 101, possession 101, Q3 11:26): Chris Mbaye (SG) is more than 10 ft off the ball handler Jesse Becker (SG) inside 28 ft for 1.3 s.
- **Ball defender too far off** (game seed 102, possession 39, Q1 1:52): Joel Wright (SG) is more than 10 ft off the ball handler Sterling Dawson (SG) inside 28 ft for 1.7 s.
- **Ball defender too far off** (game seed 103, possession 53, Q1 0:17): Sam Campbell (SG) is more than 10 ft off the ball handler Rafael Black (PG) inside 28 ft for 3.6 s.
- **Typical half-court moment** (game seed 101, possession 10, Q1 10:14): A half-court moment (man defense, pnrHeavy offense).
- **Typical half-court moment** (game seed 102, possession 6, Q1 10:32): A half-court moment (switch defense, balanced offense).
- **Typical half-court moment** (game seed 103, possession 7, Q1 10:17): A half-court moment (man defense, postUp offense).
