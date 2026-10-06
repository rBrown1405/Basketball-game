# Gameplay audit: Phase 5, the coach calling plays

52 full games of the Live view played headless (every possession from the tip to the final buzzer), players sampled every 0.1 s. Compared with: Phase 4, the coach calling plays.
Made by `node tools/audit/run.js` (see tools/audit/README.md).

## Game health (nothing broken)

| Metric | Before | Now | Change | Reference |
|---|---:|---:|---|---|
| Games played | 52 | 52 | same |  |
| Games that reached the final buzzer | 52 | 52 | same | all |
| Possessions per game | 198.8 | 198.8 | same |  |
| Stuck possessions (watchdog) | 0 | 0 | same | 0 |
| Script errors | 0 | 0 | same | 0 |
| Match warnings | 0 | 0 | same | 0 |
| Games where the court score differs from the engine | 0 | 0 | same | 0 |
| Points per game (both teams) | 227.4 | 227.4 | same | NBA ~228 |
| Wall time per game (ms) | 57238 | 63564 | +6326.7 |  |

## 1. On-ball defense (half court, ball in the handler's hands)

| Metric | Before | Now | Change | Reference |
|---|---:|---:|---|---|
| Defender between the ball handler and the basket | 90.4% | 90.4% | same | NBA tracking 94-98% |
| In a low defensive stance | 95.3% | 95.3% | same |  |
| Backing away from a handler who is not attacking | 2.2% | 2.2% | same | ~0 |
|   episodes per game (0.3 s or longer) | 44.6 | 44.6 | same |  |
|   of which walking backward facing him | 2.1% | 2.1% | same |  |
| Back turned to the ball handler and walking away (handler not attacking) | 0.4% | 0.4% | same | 0 unless beaten |
|   episodes per game | 8.8 | 8.8 | same |  |
| Back turned to the ball handler (any speed) | 1.5% | 1.5% | same |  |
| Running (feet crossing) within 10 ft while not beaten | 0.1% | 0.1% | same |  |
| More than 10 ft off the handler inside 28 ft | 1.7% | 1.7% | same |  |
| Beaten (handler past him toward the rim) | 4.3% | 4.3% | same |  |
| Gap at 22-30 ft: handler 3PT under 50 | 5.8 ft | 5.8 ft | same | should be the biggest |
| Gap at 22-30 ft: handler 3PT 50-69 | 5.5 ft | 5.5 ft | same |  |
| Gap at 22-30 ft: handler 3PT 70-79 | 4.7 ft | 4.7 ft | same |  |
| Gap at 22-30 ft: handler 3PT 80+ | 4.1 ft | 4.1 ft | same | should be the smallest |
| Extra cushion given to non-shooters vs elite shooters | 1.7 ft | 1.7 ft | same | 2-4 ft |

## 2. Off-ball defense (man schemes)

| Metric | Before | Now | Change | Reference |
|---|---:|---:|---|---|
| One pass away: in the passing lane (deny) | 70.1% | 70.1% | same |  |
| Two passes away: in help position (lane or ball-rim line) | 56.9% | 56.9% | same |  |
| Two passes away: sagged toward the rim from his man | 90.8% | 90.8% | same |  |
| Two passes away: can see man and ball | 69.4% | 69.4% | same |  |
| Two passes away: glued to a man outside the lane (no help) | 1.7% | 1.7% | same |  |
| Extra defender crowding a guarded ball 12+ ft from the rim, no drive (seconds per game) | 15.3 s | 15.3 s | same | ~0 |
|   share of half-court time | 0.9% | 0.9% | same |  |
|   episodes per game | 20.8 | 20.8 | same |  |
|   crowding time spent staying there (his own spot is on the ball; the rest is passing by on his way to a spot away from it) | 4.3 s | 4.3 s | same |  |
| Extra defender standing in the handler's path 12+ ft from the rim (seconds per game) | 13.1 s | 13.1 s | same |  |
| Two on the ball for the coverage of a ball screen or hand-off (hedge, show, blitz, ice) and getting back, 2.5 s after it: not counted above | 8.4 s | 8.4 s | same |  |
| Screened off his man (his man came off an off-ball screen in the last 2 s): not counted as lost | 0.0% | 0.0% | same |  |
| Help at the rim (an extra defender on the ball inside 12 ft; the right play), seconds per game | 58.7 s | 58.7 s | same |  |
| More than 12 ft from his man and not in a help spot | 0.4% | 0.4% | same |  |
|   episodes per game | 13.5 | 13.5 | same |  |
| Half-court time against zones (not in these numbers) | 9.6% | 9.6% | same |  |

## 3. Offense: moving with a purpose

| Metric | Before | Now | Change | Reference |
|---|---:|---:|---|---|
| Off-ball players standing still (under 1 ft/s) | 22.0% | 22.0% | same |  |
| Off-ball players: average speed | 5.5 ft/s | 5.5 ft/s | same |  |
| Off-ball players moving at a jog or faster (6+ ft/s) | 35.1% | 35.1% | same |  |
| Off-ball players who moved less than 3 ft in the last 3 s | 5.5% | 5.5% | same |  |
| Stand-stills of 3 s or longer per game | 3.8 | 3.8 | same |  |
| Stand-stills of 5 s or longer per game | 0.6 | 0.6 | same |  |
| Off-ball players within 6 ft of a teammate | 15.0% | 15.0% | same |  |
| No job: holding or drifting around a spot that is not spacing (mid-range, paint, too deep) | 1.6% | 1.6% | same |  |
|   of that time, in the mid-range | 40.9% | 40.9% | same |  |
| Spacing: holding a spot beyond the arc (a non-stretch big: by the rim) | 15.2% | 15.2% | same |  |
| In a called play: on or around his spot in it | 43.7% | 43.7% | same |  |
| Running a half-court action (screen away, cut, relocate, exchange, big flash) | 19.2% | 19.2% | same |  |
| Moving for the engine's next event (screen, cut, catch) | 20.1% | 20.1% | same |  |
| In an animation (catch, screen, pass, ...) | 0.2% | 0.2% | same |  |

## 4. Shot selection (engine)

| Metric | Before | Now | Change | Reference |
|---|---:|---:|---|---|
| Field goal attempts per game (both teams) | 188.9 | 188.9 | same | NBA ~178 |
| Three-point attempts per game | 72.8 | 72.8 | same | NBA ~75 |
| Threes by players rated under 50 (per game) | 0.1 | 0.1 | same | ~0 |
| Threes by players rated under 40 (per game) | 0 | 0 | same | 0 |
| Threes by centers (per game) | 2.0 | 2.0 | same |  |
| Threes by non-stretch bigs (per game) | 3 | 3 | same | ~0 |
| Share of all threes taken by players under 50 | 0.1% | 0.1% | same |  |
| "Open" shots: median nearest defender at release | 6.2 ft | 6.2 ft | same | 6+ ft |
| "Open" shots with a defender within 3 ft at release | 24.5% | 24.5% | same | ~0 |
|   threes with a defender within 4 ft | 3.1% | 3.1% | same | ~0 |
|   mid-range shots with a defender within 4 ft | 7.7% | 7.7% | same | ~0 |
|   shots at the rim / in the paint with a defender within 3 ft | 51.2% | 51.2% | same |  |
| "Contested" shots: median nearest defender | 4.1 ft | 4.1 ft | same | 2-4 ft |
| "Tight" shots: median nearest defender | 2.6 ft | 2.6 ft | same | 0-2 ft |
| "Tight" shots with nobody within 6 ft | 1.4% | 1.4% | same | 0 |
| Shot clock left at the shot (median) | 9.5 s | 9.5 s | same |  |
| Shots with under 4 s on the shot clock (shot clock on) | 10.3% | 10.3% | same | NBA ~7-9% |
| Shots with 18+ s on the shot clock (shot clock on) | 10.6% | 10.6% | same | NBA ~18-23% |

## 5. Open catches in the live game

| Metric | Before | Now | Change | Reference |
|---|---:|---:|---|---|
| Half-court catches per game | 371.0 | 371.0 | same |  |
| Wide-open catches (10+ ft) by a decent shooter for that spot (70+) within 26 ft, per game | 5.9 | 5.9 | same |  |
|   shot it | 53.1% | 53.1% | same | most |
|   passed it on | 45.9% | 45.9% | same | few |
|   wide-open shots passed up per game | 2.7 | 2.7 | same |  |
|   of those passes, flow swing passes (not the engine's) | 2.1% | 2.1% | same |  |
|   drove instead | 10.4% | 10.4% | same |  |
| Open catches (6-10 ft) by a decent shooter, per game | 31.8 | 31.8 | same |  |
|   shot it | 56.3% | 56.3% | same |  |
|   passed it on | 43.1% | 43.1% | same |  |
| Time a catcher holds the ball before passing (median) | 1.6 s | 1.6 s | same |  |
| Wide-open shooters off the ball (1 s or longer, 70+ from there, within 26 ft), per game | 53.6 | 53.6 | same |  |
|   the ball found him | 7.3% | 7.3% | same |  |
|   seconds per game someone like that stands wide open | 102.1 s | 102.1 s | same |  |

## 6. Spacing and positions

| Metric | Before | Now | Change | Reference |
|---|---:|---:|---|---|
| PF and C (not stretch) in the paint, at the rim or short corner | 63.4% | 63.4% | same |  |
| Five out: all five beyond the arc | 1.2% | 1.2% | same |  |
| Four or five beyond the arc | 8.0% | 8.0% | same |  |
| Two or fewer beyond the arc | 70.0% | 70.0% | same |  |
| Players beyond the arc on average | 2.0 | 2.0 | same |  |
| Nobody on offense within 12 ft of the rim | 28.1% | 28.1% | same |  |

## 7. Rebounding and the ball

| Metric | Before | Now | Change | Reference |
|---|---:|---:|---|---|
| Rebounds grabbed on court per game | 78.9 | 78.9 | same |  |
| Height of the grab (median) | 5.6 ft | 5.6 ft | same | many rebounds 5-9 ft |
| Rebounds grabbed above 10 ft | 35.1% | 35.1% | same |  |
| Carom bent in the air toward the rebounder's hands by more than 1 ft | 8.7% | 8.7% | same | 0 |
|   by more than 3 ft (looks like a teleport) | 0.0% | 0.0% | same | 0 |
|   biggest bend | 3.8 ft | 3.8 ft | same |  |
| Ball jumps more than 3 ft into the rebounder's hands | 0.4% | 0.4% | same | 0 |
| Ball hangs still in the air before the grab (0.2 s+) | 0.0% | 0.0% | same | 0 |
| Rebounds that hit the floor before anyone gets them | 7.9% | 7.9% | same | long rebounds do |
| Passes bent more than 2 ft in the air toward the receiver | 44.6% | 44.6% | same |  |
| Defenders boxing out on a miss | 1.5 | 1.5 | same |  |
|   boxing out a man 20+ ft from the rim | 0.4 | 0.4 | same | ~0 |
| Defenders within 10 ft of the rim on a miss | 1.7 | 1.7 | same |  |
| Offensive players within 10 ft of the rim on a miss | 1.1 | 1.1 | same |  |

## 8. Called plays (the playbook)

| Metric | Before | Now | Change | Reference |
|---|---:|---:|---|---|
| Half-court possessions per game (both teams) | 170.8 | 170.8 | same |  |
| Half-court possessions with a called play (the rest played in flow) | 84.5% | 84.5% | same | NBA: most flow, sets at dead balls and ATOs |
| Plays called per game (resets and inbound plays included) | 168 | 168 | same |  |
| Plays that reached a read (a shot, or the ball in on an inbound) | 81.4% | 81.4% | same |  |
|   taken early (an opening before the last step: the play working) | 11.7% | 11.7% | same |  |
| Steps run, of all the plays' steps | 90.8% | 90.8% | same |  |
| Plays whose look was passed up (reset into a new call) | 0.9% | 0.9% | same |  |
| Plays stopped by a turnover | 12.6% | 12.6% | same |  |
| Plays stopped by a foul (side-out or free throws) | 5.1% | 5.1% | same |  |
| Points per half-court possession (the whole possession: second chances and free throws included) | 1.14 | 1.14 | same |  |
|   with a called play | 1.13 | 1.13 | same |  |
|   in flow | 1.15 | 1.15 | same |  |
| Players within 2 ft of their play spot 1.2 s into a step | 52.7% | 52.7% | same |  |
|   within 5 ft | 87.3% | 87.3% | same |  |
|   more than 10 ft away | 4.9% | 4.9% | same |  |
| Inbound plays per game (under the basket, sideline) | 12.8 | 12.8 | same |  |
|   ball in to the safety, then the half-court call | 74.9% | 74.9% | same |  |
| Ball screens where the screener's man plays the called coverage (drop, level, hedge, blitz, switch, ice) | 93.9% | 93.9% | same |  |

## 9. The head coach's calls and the drawn plays (Phase 4: runs with --calls 1)

| Metric | Before | Now | Change | Reference |
|---|---:|---:|---|---|
| Plays the coach called per game (each for the next half-court possession) | 48.8 | 48.8 | same |  |
|   run by the engine on that possession | 97.4% | 97.4% | same | ~100 (a transition or putback possession waits for the next half-court one) |
| Coach-called plays run per game | 49.4 | 49.4 | same |  |
|   reached a read | 80.3% | 80.3% | same |  |
|   taken early | 22.0% | 22.0% | same |  |
|   stopped by a turnover | 13.0% | 13.0% | same |  |
|   points per call | 0.98 | 0.98 | same |  |
| Points per call on the staff's calls (both teams) | 0.97 | 0.97 | same |  |
| Drawn plays run per game (called by the coach or the staff) | 45.5 | 45.5 | same |  |
|   reached a read | 80.3% | 80.3% | same |  |
|   stopped by a turnover | 13.2% | 13.2% | same |  |
|   points per call | 1.00 | 1.00 | same |  |
|   players within 2 ft of the drawn spot 1.2 s into a step | 49.5% | 49.5% | same |  |
|   within 5 ft | 85.5% | 85.5% | same |  |
|   more than 10 ft away | 6.5% | 6.5% | same |  |
| Inbound calls run on the next throw-in under the basket | 54.9% | 54.9% | same |  |
| Defensive possessions under the coach's call played in the called scheme | 100.0% | 100.0% | same | 100 |
|   with the called pick-and-roll coverage | 100.0% | 100.0% | same | 100 |
| Defensive calls that went back to the team's own scheme when they ran out | 100.0% | 100.0% | same | 100 |

## 10. Play tracking and analytics (Phase 5: the numbers of the box score's Plays tab and the season screens)

| Metric | Before | Now | Change | Reference |
|---|---:|---:|---|---|
| Games whose play tallies add up (possessions and points equal the game's, calls equal the audit's own count, one log entry per possession) | n/a | 52 |  | all |
| Possessions tracked per game (both teams) | n/a | 198.8 |  |  |
| Points per possession | n/a | 1.14 |  | NBA ~1.14 |
| Possessions with a called play | n/a | 72.6% |  |  |
|   points per possession | n/a | 1.13 |  |  |
| Possessions in flow (no call) | n/a | 13.3% |  |  |
|   points per possession | n/a | 1.15 |  |  |
| Transition possessions | n/a | 12.4% |  | NBA (Synergy) ~13.8% |
|   points per possession | n/a | 1.33 |  | NBA (Synergy) ~1.10, best teams ~1.2 |
| Other possessions (no action run: a turnover or foul before the set, the period's end) | n/a | 1.7% |  |  |
|   points per possession | n/a | 0.18 |  |  |
| Calls tracked per game (both teams) | n/a | 168 |  | section 8 |
| Calls completed (to the read in time: a shot, or the ball in on an inbound) | n/a | 76.2% |  |  |
|   on an early read | n/a | 11.6% |  |  |
| Calls whose read the shot clock forced (a late shot: a shot-clock breakdown) | n/a | 5.2% |  |  |
| Calls that broke down | n/a | 18.7% |  |  |
|   of the breakdowns: turnover (lost ball, travel, offensive foul) | n/a | 50.0% |  |  |
|   shot clock | n/a | 23.6% |  |  |
|   denied pass | n/a | 14.2% |  |  |
|   blown screen (defended, or an illegal screen) | n/a | 3.4% |  |  |
|   defense switched | n/a | 0.3% |  |  |
|   help defense (help, double team, zone) | n/a | 4.4% |  |  |
|   well defended (look passed up) | n/a | 4.1% |  |  |
|   at the entry, before the first step | n/a | 24.2% |  |  |
| Calls cut short before the read (a foul: the side-out or free throws) | n/a | 5.1% |  | section 8 |
| Calls that drew a foul (on the shot or before it) | n/a | 9.8% |  |  |
| Calls ending on another read than the play's main option (a counter) | n/a | 43.2% |  |  |
| Shot quality of the calls' looks (expected points per shot, fouled shots included) | n/a | 1.14 |  |  |
|   open looks | n/a | 33.0% |  |  |
|   tightly contested looks | n/a | 19.8% |  |  |
| Field goal percentage on the calls' shots (a missed shot on a shooting foul is not an attempt) | n/a | 46.3% |  |  |
| Clutch calls per game (last 5 minutes of the 4th or overtime, within 5) | n/a | 3.7 |  |  |
| Points allowed per half-court possession (by scheme: table 10b) | n/a | 1.14 |  |  |
| Points allowed per transition possession | n/a | 1.33 |  |  |
| Play tallies kept with each box score (both teams) | n/a | 3.2 KB |  |  |
| Possession log of a live game | n/a | 26.5 KB |  |  |

## 3b. Standing around by position (share of off-ball time)

| Position | still (<1 ft/s) | moved <3 ft in 3 s | no job |
|---|---|---|---|
| PG | 25.4% (was 25.4%) | 5.3% (was 5.3%) | 1.5% (was 1.5%) |
| SG | 24.2% (was 24.2%) | 6.0% (was 6.0%) | 1.6% (was 1.6%) |
| SF | 22.6% (was 22.6%) | 5.8% (was 5.8%) | 1.9% (was 1.9%) |
| PF | 20.2% (was 20.2%) | 5.9% (was 5.9%) | 2.3% (was 2.3%) |
| PF (stretch) | 20.5% (was 20.5%) | 5.5% (was 5.5%) | 2.0% (was 2.0%) |
| C | 18.5% (was 18.5%) | 4.8% (was 4.8%) | 0.9% (was 0.9%) |
| C (stretch) | 17.7% (was 17.7%) | 3.9% (was 3.9%) | 2.1% (was 2.1%) |

## 6b. Where each position spends its half-court time (offense)

| Position | at rim (<4 ft) | paint | short corner / baseline | mid-range | corner 3 | above-break 3 | deep (28+ ft) |
|---|---|---|---|---|---|---|---|
| PG | 1.0% (was 1.0%) | 6.2% (was 6.2%) | 8.9% (was 8.9%) | 24.1% (was 24.1%) | 12.5% (was 12.5%) | 35.1% (was 35.1%) | 12.2% (was 12.2%) |
| SG | 1.5% (was 1.5%) | 8.7% (was 8.7%) | 12.9% (was 12.9%) | 25.3% (was 25.3%) | 17.0% (was 17.0%) | 29.7% (was 29.7%) | 4.8% (was 4.8%) |
| SF | 2.3% (was 2.3%) | 11.2% (was 11.2%) | 16.7% (was 16.7%) | 25.3% (was 25.3%) | 17.5% (was 17.5%) | 23.0% (was 23.0%) | 3.9% (was 3.9%) |
| PF | 4.4% (was 4.4%) | 23.6% (was 23.6%) | 31.3% (was 31.3%) | 24.7% (was 24.7%) | 4.3% (was 4.3%) | 10.2% (was 10.2%) | 1.5% (was 1.5%) |
| PF (stretch) | 3.0% (was 3.0%) | 14.4% (was 14.4%) | 21.8% (was 21.8%) | 26.0% (was 26.0%) | 14.6% (was 14.6%) | 16.2% (was 16.2%) | 4.1% (was 4.1%) |
| C | 4.8% (was 4.8%) | 28.7% (was 28.7%) | 33.0% (was 33.0%) | 24.2% (was 24.2%) | 1.7% (was 1.7%) | 6.3% (was 6.3%) | 1.3% (was 1.3%) |
| C (stretch) | 2.6% (was 2.6%) | 15.3% (was 15.3%) | 21.1% (was 21.1%) | 29.0% (was 29.0%) | 5.0% (was 5.0%) | 16.6% (was 16.6%) | 10.3% (was 10.3%) |

## 8b. Called plays by family

| Family | calls per game | share | points per call | reached a read | early read |
|---|---|---|---|---|---|
| Pick and roll | 34.3 | 20.4% | 0.99 | 80.3% | 10.6% |
| Horns | 25.3 | 15.1% | 1.06 | 80.6% | 20.2% |
| Cutting | 22.8 | 13.6% | 1.02 | 79.0% | 22.4% |
| Off-screen | 22.5 | 13.4% | 1.06 | 82.0% | 19.7% |
| Isolation | 14.8 | 8.8% | 0.95 | 77.6% | 0.0% |
| Motion | 13.8 | 8.2% | 1.02 | 83.4% | 0.0% |
| Post | 13.2 | 7.9% | 0.96 | 80.0% | 4.7% |
| Sideline inbound | 9.9 | 5.9% | 0.52 | 97.3% | 0.0% |
| Hand-off | 5.3 | 3.1% | 0.99 | 75.8% | 3.3% |
| Zone offense | 3.3 | 1.9% | 0.90 | 76.9% | 17.2% |
| Baseline inbound | 2.9 | 1.7% | 0.54 | 91.4% | 0.0% |

## 8c. The most-called plays

| Play | calls per game | points per call | reached a read | early read |
|---|---|---|---|---|
| Audit Floppy | 11.5 | 1.05 | 82.8% | 26.0% |
| Audit Give and Go | 11.3 | 1.00 | 78.1% | 33.8% |
| Audit Horns Twist | 10.9 | 1.00 | 79.0% | 44.4% |
| Audit Elbow Roll | 10.5 | 0.97 | 80.1% | 0.0% |
| Drive and Kick | 7.1 | 1.05 | 83.7% | 0.0% |
| Motion Swing | 6.7 | 0.99 | 82.9% | 0.0% |
| Chin Backdoor | 6.6 | 1.09 | 78.0% | 0.0% |
| Clear-Out at the Top | 5.5 | 0.92 | 79.4% | 0.0% |
| Elbow Isolation | 5.3 | 0.97 | 76.4% | 0.0% |
| Low Post Isolation | 5.2 | 0.94 | 79.1% | 0.0% |
| Zipper (SLOB) | 5.0 | 0.54 | 98.1% | 0.0% |
| Side Pick and Roll | 4.9 | 1.13 | 78.5% | 15.2% |
| Stack (SLOB) | 4.9 | 0.50 | 96.5% | 0.0% |
| High-Low | 4.7 | 1.04 | 80.9% | 13.0% |
| High Pick and Roll | 4.7 | 1.05 | 79.3% | 21.5% |
| Horns Twist | 4.6 | 1.09 | 83.6% | 0.0% |

## 8d. The defense's pick-and-roll coverage on called plays, and what the court shows 0.6 s after the ball screen

| Coverage | share of calls | screener's man: back in the lane | at the screen | on the ball | switched |
|---|---|---|---|---|---|
| drop | 44.7% | 93.3% | 6.0% | 0.7% | 0.0% |
| show | 15.8% | 0.5% | 15.2% | 84.3% | 0.0% |
| switch | 13.5% | 0.0% | 0.5% | 0.3% | 99.2% |
| zone | 9.7% | 82.4% | 5.8% | 11.9% | 0.0% |
| ice | 6.6% | 71.4% | 16.3% | 12.3% | 0.0% |
| blitz | 5.1% | 0.8% | 29.7% | 69.5% | 0.0% |
| hedge | 4.5% | 0.0% | 34.1% | 65.9% | 0.0% |

## 8e. The reads taken most often

| Read | per game |
|---|---|
| Kick to the open shooter | 8.9 |
| Kick out | 6.2 |
| Swing it to the open man | 5.6 |
| Open three off the swing | 4.5 |
| Safety, run offense | 4.1 |
| Catch and run offense | 4.0 |
| #1 creates a shot | 3.1 |
| One on one | 3.0 |
| Face-up jumper or drive | 2.9 |
| #1 comes off the ball screen | 2.9 |
| #2 catches and shoots | 2.8 |
| Kick to a corner | 2.7 |
| Post move | 2.4 |
| Backdoor layup | 2.3 |

## 10b. Points allowed per half-court possession by defensive scheme

| Scheme | possessions per game | share | points allowed per possession |
|---|---|---|---|
| Man-to-man | 56.1 | 32.9% | 1.11 |
| Drop coverage | 50.3 | 29.5% | 1.14 |
| Switch everything | 20.4 | 12.0% | 1.16 |
| 2-3 zone | 9.8 | 5.7% | 1.11 |
| Run shooters off the line | 9.3 | 5.4% | 1.28 |
| Ball pressure and deny | 7.9 | 4.6% | 1.00 |
| 3-2 zone | 7.4 | 4.3% | 1.20 |
| Hedge the pick and roll | 4.7 | 2.7% | 1.14 |
| Pack the paint | 3.1 | 1.8% | 1.16 |
| Blitz / trap | 1.8 | 1.0% | 1.26 |

## 10c. Called plays by the ball-screen coverage the defense played on them

| Coverage | calls per game | share | points per call |
|---|---|---|---|
| drop | 57.4 | 44.5% | 1.23 |
| show | 20.6 | 16.0% | 1.19 |
| switch | 17.4 | 13.5% | 1.19 |
| zone | 12.7 | 9.8% | 1.22 |
| ice | 8.5 | 6.6% | 1.20 |
| blitz | 6.6 | 5.1% | 1.32 |
| hedge | 5.9 | 4.6% | 1.26 |

## Low-rated three-point shooters who shot threes anyway

| Game seed | Player | Pos | Archetype | 3PT rating | 3PA | 3PM | Called open |
|---|---|---|---|---:|---:|---:|---:|
| 129 | Thomas Kowalski | PG | Slasher | 46 | 1 | 1 | 0 |
| 128 | Myles Singh | C | Playmaking Big | 47 | 1 | 0 | 1 |
| 135 | Tariq Ward | PF | Athletic Four | 47 | 1 | 1 | 0 |
| 125 | Julian Morris | PG | Slasher | 48 | 1 | 1 | 1 |
| 133 | Mamadou Montgomery | C | Playmaking Big | 49 | 1 | 1 | 0 |

## What was moving the flagged defenders

Share of the flagged samples (in 52 of the games) by the code path moving the defender, the engine beat under way and the handler's distance from the rim.

**Ball defender backing away**

- moved by: defensive tracker 61.8%, planner move (locked by a planner) 33.8%, other track (locked by a planner) 2.9%, idle (locked by a planner) 1.2%, idle 0.3%
- his defensive job (Phase 2 court roles): onBall 66.9%, closeout 19.7%, none 11.7%, deny 1.1%, post 0.2%, home 0.2%
- engine beat: shot 30.8%, pass 20.7%, move 16.7%, screen 11.7%, step 9.7%, set 8.1%
- during a shot beat, the engine called the shot: open (his man shoots) 49.4%, contested (his man shoots) 39.0%, tight (his man shoots) 11.7%
- handler from the rim: 23-28 ft 31.6%, 17-23 ft 27.0%, 10-17 ft 20.1%, under 10 ft 15.1%, 28-35 ft 6.2%
- defender clip: none 98.5%, fall 1.4%, turn 0.1%, contestJump 0.0%, wallUp 0.0%
- handler clip: none 74.7%, jumpshot 5.9%, pullup 4.1%, jumpStop 4.0%, turn 2.7%, jumpshot2 2.6%
- scheme: man 31.8%, drop 29.0%, switch 11.9%, zone23 6.7%, nothree 5.7%, zone32 4.5%

**Ball defender turning away**

- moved by: defensive tracker 83.9%, planner move (locked by a planner) 12.2%, other track (locked by a planner) 2.0%, idle 1.4%, idle (locked by a planner) 0.6%
- his defensive job (Phase 2 court roles): none 61.0%, onBall 29.6%, closeout 5.4%, deny 2.9%, help 0.4%, home 0.4%
- engine beat: set 34.1%, pass 26.3%, shot 11.9%, step 11.8%, move 8.2%, screen 5.5%
- during a shot beat, the engine called the shot: open (his man shoots) 53.5%, contested (his man shoots) 32.0%, tight (his man shoots) 14.5%
- handler from the rim: 23-28 ft 34.2%, 28-35 ft 25.7%, 17-23 ft 18.0%, under 10 ft 11.2%, 10-17 ft 10.9%
- defender clip: none 98.1%, turn 1.9%, fall 0.1%
- handler clip: none 84.2%, jumpStop 9.5%, pullup 0.9%, floater 0.9%, layup 0.7%, dunk 0.6%
- scheme: zone23 38.3%, zone32 22.2%, man 14.1%, drop 11.1%, switch 5.9%, nothree 3.8%

**Off-ball defender crowding the ball**

- moved by: defensive tracker 69.0%, planner move (locked by a planner) 30.4%, idle (locked by a planner) 0.4%, idle 0.1%
- his defensive job (Phase 2 court roles): deny 66.0%, none 10.7%, help 4.6%, sink 4.4%, home 3.6%, onBall 3.4%
- engine beat: shot 25.0%, set 23.7%, pass 19.5%, step 14.0%, move 9.3%, screen 6.7%
- during a shot beat, the engine called the shot: contested (his man shoots) 54.4%, tight (his man shoots) 24.2%, open (his man shoots) 21.4%, tight (another shooter) 0.1%
- handler from the rim: 10-17 ft 41.1%, 23-28 ft 23.4%, 17-23 ft 21.6%, 28-35 ft 12.0%, 35+ ft 2.0%
- defender clip: none 99.5%, contestJump 0.4%, turn 0.2%, block 0.0%
- handler clip: none 87.8%, jumpStop 3.8%, pullup 2.2%, jumpshot 2.0%, jumpshot2 0.8%, jab 0.7%
- scheme: man 34.6%, drop 28.9%, switch 19.2%, nothree 6.2%, pressure 5.3%, hedge 3.1%

**Off-ball defender lost his man**

- moved by: defensive tracker 86.5%, planner move (locked by a planner) 13.5%, other track (locked by a planner) 0.0%, idle (locked by a planner) 0.0%
- his defensive job (Phase 2 court roles): deny 37.3%, help 35.5%, home 22.3%, none 2.0%, closeout 1.5%, post 1.3%
- engine beat: shot 36.3%, set 25.8%, pass 15.7%, step 10.5%, move 6.4%, screen 4.6%
- during a shot beat, the engine called the shot: contested (his man shoots) 45.0%, open (his man shoots) 28.3%, tight (his man shoots) 26.7%, tight (another shooter) 0.0%
- handler from the rim: under 10 ft 28.2%, 23-28 ft 25.9%, 10-17 ft 18.4%, 17-23 ft 16.4%, 28-35 ft 10.5%, 35+ ft 0.6%
- defender clip: none 100.0%
- handler clip: none 73.5%, layup 5.3%, rebound 5.1%, jumpStop 2.6%, putback 2.0%, dunk 1.7%
- scheme: man 36.1%, drop 29.1%, switch 17.0%, pressure 6.1%, nothree 5.3%, hedge 3.0%

**Two passes away but glued to his man**

- moved by: defensive tracker 96.8%, planner move (locked by a planner) 2.1%, other track (locked by a planner) 1.1%
- his defensive job (Phase 2 court roles): home 53.1%, help 38.4%, closeout 2.7%, deny 2.5%, post 0.9%, sink 0.9%
- engine beat: set 41.7%, pass 21.8%, step 14.9%, shot 9.7%, screen 6.0%, move 5.2%
- during a shot beat, the engine called the shot: contested (his man shoots) 45.0%, open (his man shoots) 33.8%, tight (his man shoots) 21.2%, tight (another shooter) 0.1%
- handler from the rim: 28-35 ft 39.3%, 23-28 ft 35.7%, 17-23 ft 13.0%, 10-17 ft 5.8%, under 10 ft 5.2%, 35+ ft 1.0%
- defender clip: none 100.0%
- handler clip: none 87.4%, jumpStop 5.6%, jumpshot 2.1%, jumpshot2 0.8%, pivot 0.8%, rebound 0.7%
- scheme: man 37.6%, drop 32.5%, switch 12.5%, nothree 7.0%, pressure 5.1%, hedge 2.8%

## Examples to look at

- **Ball defender backing away** (game seed 101, possession 21, Q1 7:26): Daryl Crawford (C) backs away from Walker Haywood (C) for 0.7 s while the ball handler is not attacking (gap 4.8 -> 6.5 ft).
- **Ball defender backing away** (game seed 102, possession 12, Q1 9:13): Colby Richards (SG) backs away from Oscar Graves (C) for 0.4 s while the ball handler is not attacking (gap 3.7 -> 5 ft).
- **Ball defender backing away** (game seed 103, possession 10, Q1 9:43): Omar Armstrong (C) backs away from Shawn Adams (C) for 0.5 s while the ball handler is not attacking (gap 3.3 -> 4.7 ft).
- **Ball defender turns and walks away** (game seed 101, possession 92, Q2 1:25): Joel McKinney (PG) turns his back on the ball handler Markell Douglas (PG) and walks away for 0.6 s (gap 10 -> 16.6 ft).
- **Ball defender turns and walks away** (game seed 102, possession 98, Q2 3:29): Oumar Black (PG) turns his back on the ball handler Jackson Lamb (PG) and walks away for 0.4 s (gap 8.7 -> 13.4 ft).
- **Ball defender turns and walks away** (game seed 103, possession 102, Q3 11:15): Walker Kovac (PG) turns his back on the ball handler Ryan Rivers (PG) and walks away for 0.4 s (gap 8.8 -> 13.8 ft).
- **Off-ball defender crowding the ball** (game seed 101, possession 14, Q1 8:54): Jerome Payton (C) leaves his man Khalil Brewer (C) to crowd the ball handler Aaron Fox (PF) for 1.2 s (the ball is already guarded, 12+ ft from the rim, no drive).
- **Off-ball defender crowding the ball** (game seed 102, possession 8, Q1 10:35): Jackson Lamb (PG) leaves his man Oscar Graves (C) to crowd the ball handler Garrett Gibson (SF) for 0.4 s (the ball is already guarded, 12+ ft from the rim, no drive).
- **Off-ball defender crowding the ball** (game seed 103, possession 10, Q1 9:46): Fred Miles (PF) leaves his man Ryan Rivers (PG) to crowd the ball handler Shawn Adams (C) for 2.5 s (the ball is already guarded, 12+ ft from the rim, no drive).
- **Off-ball defender lost his man** (game seed 101, possession 93, Q2 0:50): Jesse Becker (SG) is more than 12 ft from his man Grant Isaac (PG) for 0.9 s without being in a help spot.
- **Off-ball defender lost his man** (game seed 102, possession 14, Q1 8:33): Amir Dixon (SF) is more than 12 ft from his man Garrett Gibson (SF) for 0.6 s without being in a help spot.
- **Off-ball defender lost his man** (game seed 103, possession 9, Q1 10:09): Shawn Adams (C) is more than 12 ft from his man Omar Armstrong (C) for 1.2 s without being in a help spot.
- **Offensive player standing still** (game seed 105, possession 153, Q4 9:40): Jace Wilkins (PG) stands still for 7 s at the arc while his team runs its half-court offense.
- **Offensive player standing still** (game seed 112, possession 114, Q3 8:17): Kam Page (SG) stands still for 5.3 s well beyond the arc while his team runs its half-court offense.
- **Offensive player standing still** (game seed 114, possession 48, Q1 0:10): Lucas Reese (SF) stands still for 6.8 s well beyond the arc while his team runs its half-court offense.
- **Wide-open shooter passes it up** (game seed 101, possession 96, Q2 0:02): Jay Daniels (PG, 3PT 73) catches with the nearest defender 15.2 ft away and 14.6 s on the shot clock, then passes it on after 6.5 s (the engine's next pass).
- **Wide-open shooter passes it up** (game seed 102, possession 92, Q2 4:36): Jackson Lamb (PG, mid-range 71) catches with the nearest defender 11.9 ft away and 15.7 s on the shot clock, then passes it on after 2.3 s (the engine's next pass).
- **Wide-open shooter passes it up** (game seed 103, possession 73, Q2 5:55): Eddie Walsh (SG, mid-range 72) catches with the nearest defender 11.8 ft away and 10.2 s on the shot clock, then passes it on after 1.9 s (the engine's next pass).
- **Wide-open shooter never gets the ball** (game seed 101, possession 66, Q2 7:46): Walker Haywood (C, rated 76 from there) is wide open (nobody within 10 ft) for 2 s and never gets the ball.
- **Wide-open shooter never gets the ball** (game seed 102, possession 28, Q1 4:53): Marvin Allen (SG, rated 86 from there) is wide open (nobody within 10 ft) for 3.1 s and never gets the ball.
- **Wide-open shooter never gets the ball** (game seed 103, possession 117, Q3 6:55): Rafael Black (PG, rated 86 from there) is wide open (nobody within 10 ft) for 2.7 s and never gets the ball.
- **Low-rated shooter takes a three** (game seed 125, possession 183, Q4 4:59): Julian Morris (PG, 3PT rating 48) takes a three (open, made).
- **Low-rated shooter takes a three** (game seed 128, possession 171, Q4 8:33): Myles Singh (C, 3PT rating 47) takes a three (open, missed).
- **Low-rated shooter takes a three** (game seed 129, possession 129, Q3 3:18): Thomas Kowalski (PG, 3PT rating 46) takes a three (contested, made).
- **Rebound pulled into the hands** (game seed 104, possession 103, Q3 9:45): Otto O'Brien secures the rebound: the ball jumps 15.1 ft into his hands (grabbed 0.7 ft up).
- **Rebound pulled into the hands** (game seed 106, possession 172, Q4 4:08): Isaiah Clarke secures the rebound: the ball jumps 3.9 ft into his hands (grabbed 2.6 ft up).
- **Rebound pulled into the hands** (game seed 113, possession 98, Q2 0:52): Tyler Waters secures the rebound: the ball jumps 3.7 ft into his hands (grabbed 1 ft up).
- **Ball defender too far off** (game seed 101, possession 28, Q1 5:32): Curtis Moses (PF) is more than 10 ft off the ball handler Ben Garland (SF) inside 28 ft for 1 s.
- **Ball defender too far off** (game seed 102, possession 29, Q1 4:37): Garrett Gibson (SF) is more than 10 ft off the ball handler Amir Dixon (SF) inside 28 ft for 3.5 s.
- **Ball defender too far off** (game seed 103, possession 56, Q2 11:00): Amari Norman (PG) is more than 10 ft off the ball handler Ryan Rivers (PG) inside 28 ft for 1.4 s.
- **Typical half-court moment** (game seed 101, possession 8, Q1 10:18): A half-court moment (man defense, pnrHeavy offense).
- **Typical half-court moment** (game seed 102, possession 8, Q1 10:28): A half-court moment (switch defense, balanced offense).
- **Typical half-court moment** (game seed 103, possession 8, Q1 10:16): A half-court moment (switch defense, pnrHeavy offense).
