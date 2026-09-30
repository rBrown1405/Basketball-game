# Trial 9: The Shot

**Result: PASS in the lab, every shot of its 25 scenarios; in three live quarters every free throw and every runner,
71 of 75 jump shots with every phase, 41 of 42 layups and 13 of 14 dunks with the right footwork (the misses carried,
see C1).** In the 25 scenarios of `tools/audit/shot.js` (also the Animation
Lab's "Shooting (the shot lab)" group: two shooters' forms, spot-ups and catch-and-shoots, the pull-up, step-back,
fadeaway and post fade, open against contested, two free throw routines, layups from both sides and a left-hander's, the
reverse, floater and hook, one- and two-foot dunks, putbacks, a tip and an alley-oop), measured by the game's own shot
meter:

- **Every jump shot has all five phases.** 12 of 12: the ball and the hips go down together (4.1 to 21.6 in and 2.8 to
  8.7 in, 0 to 0.1 s apart), the ball rises 64 to 74 in to the release, the release comes 0.017 to 0.067 s before the
  top of the jump, the follow-through is held 0.6 to 1.1 s (the gooseneck, the wrist at 78 to 85 degrees), and the
  landing gives 19 to 30 degrees at the knee, the shooter coming down 2.6 to 11.7 in further toward the rim (the
  fadeaway and the post fade 23 in back). On the code before this trial 0 of 12 had them all: 8 with no dip (the ball
  down 0 to 1.9 in), 3 with no follow-through held, 12 with no landing (0 to 2.4 degrees at the knee).
- **Layup footwork is correct every time.** All 9 finishes on the move go two steps after the gather. The layups, the
  reverse, the floater, the hook, the one-foot dunk and the alley-oop go up off the foot away from the shooting hand
  (the left-hander's off the right), the other knee driving to 94 to 99 degrees on a layup (a runner's 56 to 70, a
  dunk's 67 to 78); the power dunk goes up off two feet after a 1-2. Before: 0 of 9, 2 to 4 steps, all but the
  reverse off two feet with no knee drive.
- **Two shooters are told apart by form alone.** Shooter A and shooter B, the same height and the same shot from the
  same spot: one motion against two, the release 6.6 in higher and 0.30 s quicker, the set point 3.5 in higher, a jump
  4 in higher, the follow-through held 0.5 s longer, the elbow 0.8 in off the shot's line against 5.1, B leaning back 5
  degrees more and kicking a leg forward (images 1 to 10). Before, every player shot the same shot.

**In live 5-on-5** (three full quarters: seed 7, seed 21, the women's league seed 7) the same meter reads:
- **Jump shots with all five phases: 28 of 30, 22 of 24 and 21 of 21 (0 of 30, 0 of 24 and 0 of 21 on the code before
  this trial, the same meter).** The hips go down 5.2 to 5.9 in at the median (2.2 to 2.8 before), the follow-through is
  held 0.87 to 0.92 s (0 to 0.5), the landing gives 24 to 26 degrees at the knee (0). The four that miss one: two
  contested shots (a pull-up and a catch-and-shoot) whose ball and hips both go down but bottom 0.15 s apart, a
  catch-and-shoot whose ball dips 1 in (the hips 5.5), and an end-of-quarter heave let go 0.05 s after the top (C1).
- **Layups two steps after the gather and off the foot away from the ball: 9 of 9, 15 of 16 and 17 of 17** (2 of 9, 4 of
  14 and 0 of 12 before), the other knee driving to 99.5 to 99.6 degrees at the median (0 before); runners 8 of 8; dunks
  13 of 14 off the right feet with the hand on the rim 0.08 to 0.15 s (the medians).
- **Free throws: 28 of 28 with a routine, no jump and the follow-through held** (0 of 28 before, when every shooter took
  the same two dribbles and the dip was 0.5 in): a median of 1 to 2 dribbles, 12 spins and 22 deep breaths in 28.
- **Catch-and-shoot: 23 of 27 let go 0.5 to 0.8 s after the catch** (medians 0.57 to 0.65 s).
- **The contest**: by the engine's contest level (open, contested, tight) in seed 7 the release goes up (1.316, 1.329,
  1.334 heights), comes quicker (0.567, 0.55, 0.517 s) and leans further away (-7.2, -11.5, -18.3 degrees). In the other
  two quarters the contested and tight shots also go up higher and lean further away than the open ones, and the tight
  ones come 0.03 to 0.07 s quicker (few shots: 1 or 2 tight ones a quarter).

| Shooter A: the dip | Shooter A: the set | Shooter A: the release |
|---|---|---|
| ![A dip](img/t9_formA_1dip.png) | ![A set](img/t9_formA_2set.png) | ![A release](img/t9_formA_3release.png) |

| Shooter A: the follow-through held | Shooter A: the landing | |
|---|---|---|
| ![A follow-through](img/t9_formA_4follow.png) | ![A landing](img/t9_formA_5land.png) | |

| Shooter B: the dip | Shooter B: the set (over the forehead, legs still loaded) | Shooter B: the release |
|---|---|---|
| ![B dip](img/t9_formB_1dip.png) | ![B set](img/t9_formB_2set.png) | ![B release](img/t9_formB_3release.png) |

| Shooter B: the follow-through held | Shooter B: the landing | |
|---|---|---|
| ![B follow-through](img/t9_formB_4follow.png) | ![B landing](img/t9_formB_5land.png) | |

| Open | Contested (the same shooter) |
|---|---|
| ![Open release](img/t9_open_release.png) | ![Contested release](img/t9_contested_release.png) |

| The layup: the gather | The first step (right) | The second step (left) |
|---|---|---|
| ![Gather](img/t9_layup_1gather.png) | ![Right](img/t9_layup_2right.png) | ![Left](img/t9_layup_3left.png) |

| The take-off, the right knee driving | The release, extended toward the rim | A left-hander's take-off |
|---|---|---|
| ![Take-off](img/t9_layup_4takeoff.png) | ![Release](img/t9_layup_5release.png) | ![Lefty take-off](img/t9_layupLefty_4takeoff.png) |

| One-foot dunk: the take-off | Two-foot dunk: the load | The hand on the rim |
|---|---|---|
| ![Dunk take-off](img/t9_dunk1_takeoff.png) | ![Dunk load](img/t9_dunk2_load.png) | ![Rim](img/t9_dunk1_rim.png) |

| Free throw: a dribble | The spin | The deep breath |
|---|---|---|
| ![Dribble](img/t9_ft_1dribble.png) | ![Spin](img/t9_ft_2spin.png) | ![Breath](img/t9_ft_3breath.png) |

| Free throw: the release | The follow-through held | |
|---|---|---|
| ![FT release](img/t9_ft_4release.png) | ![FT follow-through](img/t9_ft_5follow.png) | |

Rendered from the Animation Lab's "Shooting (the shot lab)" scenarios with the game's own code, each at a clip event: the
dip, the set point, the release, 0.3 s after the release, 0.1 s after the landing; the layup at 0.02, 0.14, 0.42, 0.55 and
0.8 s into its move; the dunks at the take-off, the load and the rim; the free throw's routine as it happens.

## How to see it

- **Animation Lab** (`lab.html`), the **Shooting (the shot lab)** group, at 0.25x (the hoop is drawn; turn the camera
  to the side of the shooter to see the ball's path):
  - "spot-up jumper ... (shooter A)" and "(shooter B)", then "two shooters, the same jumper from the two wings": A shoots
    in one motion, the ball going up past the face to a high release on the way up, the follow-through held a second;
    B dips deeper, sets the ball over the forehead with the legs still loaded, then drives up, the elbow out a little,
    the body leaning back and a leg kicking forward, the follow-through dropped sooner;
  - "catch and shoot on the wing ...": the shooter goes up off the catch, the ball never leaving the shot pocket;
  - "open jumper" against "contested jumper": the contested one is released higher and quicker, leaning away;
  - "pull-up", "step-back three", "fadeaway", "turnaround post fade": the gather out of the dribble into the dip, the
    step back, the fade (the landing behind the take-off), the turn over the shoulder on the balls of the feet;
  - "free throw ..." (two routines): the official's bounce pass, the dribbles, the spin, the deep breath (the chest and
    shoulders rise and fall, the eyes up at the rim), the set, a shallow dip and no jump, the follow-through held;
  - "right-hand layup", "a left-hander's layup", "a right-hander's layup from the left side", "reverse layup": the ball
    picked up as it comes up into the hand with the zero-step foot down, then right, left, up (mirrored for the
    left-hander), the right knee driving with the ball, the arm extending toward the rim, the off hand up;
  - "floater", "hook shot", "one-foot dunk", "two-foot power dunk", "putback", "putback dunk", "tip-in", "alley-oop".
- **Debug tools** (Shift+D in `match_test.html` or the live game): the session lines count the shots, the jump shots
  with every phase, the finishes with the right footwork, the free throws' routines and the catch-and-shoot times.
- **Headless:**
  - `node tools/audit/shot.js [--only id] [--pops] [--json out.json]`: the 25 scenarios with the game's shot meter.
  - `node tools/audit/quarter.js --seed 7` has a `shot` block in its scorecard.
- **Tests:** `node tools/audit/check.js` (135 checks; 8 are this trial's).

## A. What changed

- **`js/match/tune.js`**: the `shot` group (every value below: each phase's time, depth and height, the landing, the
  drift, the waits, the per-player form ranges, the contest, the free throw and its routine), `limits.armStraightDeg`,
  `limits.armBlendLongK`, and the shot meter's thresholds in `debug`.
- **The jump shot, built from phases (`js/match/clips.js`, `jumperDef`).** Every jump shot (one and two motion, the
  pull-up, step-back, fadeaway, the post fades) and the free throw is built from phases, each a tunable: the gather (feet
  square, or the pull-up's plant, the step-back's push, the post fade's turn), the dip (the ball below the pocket with
  the knees and hips, ~0.13 s), the rise to the set point with the elbow under the ball, the push, the release timed
  against the top of the jump (the airtime from the jump's height and real gravity), the wrist's snap into the
  gooseneck, the follow-through held, the arms relaxing, the landing (the knees giving, the hips dropping and coming
  back up) a few inches further toward the rim. The arm keys are the fitted `SHOT_ARMS` poses; a reach clamp keeps
  every ball key within the arm's reach (a ball set past it had flipped the shoulder at the release).
- **Each player's own form (`shotForm`, `shotClip`).** Drawn once per player from `Tune.shot.form` by hashes of the
  id, the shooting ratings pulling toward the quicker, higher, cleaner end, size toward the slower, lower, two-motion
  end: the speed, release and set heights, elbow flare, jump, dip, hold, the release's timing, drift, lean, a leg kick,
  one motion or two. The clips are built per player and contest level and kept.
- **The contest.** Released higher, quicker, off a higher jump, leaning away and a little earlier before the top.
- **The shot in the game (`js/match/choreo.js`, `p_shot`).** The ball leaves the hand at the clip's own release (a
  clip started on a slow clock had let it go before the arm got there); a catch-and-shoot goes up off the catch with the
  ball kept in the shot pocket; a jumper straight off the dribble is a pull-up, its gather taking the ball up out of the
  dribble into the dip; a jump shot waits for its shooter to reach where it starts (the ball back on the floor to get
  there and taken up again as the spot nears) instead of sliding the body there; the handler starts no dribble move in
  the last 1.6 s before the handler's own shot; the post fades are the shooter's own.
- **The free throw (`p_ft`, `ftRoutineGo`, `clips.js` `ftRoutine`, `ftSpin`, `ftBreath`).** The official's bounce pass,
  then the shooter's own routine (0 to 4 dribbles at their own pace, a spin of the ball, a deep breath), each only if it
  fits, standing tall at the line (the shooter no longer faces up into the triple threat after the bounce pass, and
  the game's own dribble no longer takes over), then the set, a shallower dip, no jump, the follow-through held longer.
- **The finishes (`clips.js`, `choreo.js`, `actor.js`).** A layup or dunk off the dribble is gathered as the ball comes
  up into the hand with the zero-step foot down (the ball goes on bouncing until it is; a foot hovering in a walk's
  swing is put down first); that foot stays down until its own step and the first step's foot until the knee drive
  (`zeroHoldS`); then right, left, up off the foot away from the hand (the swing leg lifted off the floor early, the
  knee driven up), the arm extending toward the rim; the two-foot dunk a 1-2 into a two-foot take-off; the hand on the
  rim for a moment, the drop from the hang continuous (it had fallen ~1 ft in a frame as the hang ended), a landing that
  gives. A dunk only for a player whose reach with the arm up (`dunkReachH` x height) plus the dunk's own jump gets
  the hand to the rim (`dunkRimFt`, per dunk, set from where the Lab's dunks first touch it); anyone shorter lays it
  up (in the women's quarter most dunks had never reached the rim). A clip started from the run keeps the body's speed into its first steps (it had stopped dead for a frame).
- **The arms (`js/match/rig.js`).** A nearly straight animated arm (the release, the follow-through) takes its elbow's
  pole from the upper arm's own hinge axis instead of the side of the line its elbow is on, which flipped as the arm
  straightened (the forearm turning over, the hand flipping ~140 degrees in a frame); an arm letting go of the ball
  near full reach blends its wrist round the shoulder instead of along the straight line inside the reach (the elbow had
  bent ~10 degrees back for a frame at the release).
- **`js/match/ball.js`**: `spinHeld` (the ball spun in the hands), a gather that waits for a condition, and an outright
  hold that cancels a dribble still waiting for a catch to be secured (a jump shot off the catch had the ball dribbled
  out of the shooter's hands in the middle of it).
- **`js/match/flow.js`**: no dribble move right before the handler's own shot.
- **`js/match/debug.js`**: the shot meter (per shot: the dip of the ball and the hips and how far apart in time, the
  rise, the release's height, time and timing against the top of the jump, the elbow's place, the wrist's snap and
  the gooseneck, the follow-through held, the landing and the drift; a finish's steps after the gather, take-off foot
  and knee drive; a dunk's hand on the rim; a free throw's routine; the catch to the release), the session lines.
- **`js/match/shotlab.js`** (new): the 25 scenarios and their staging with a hoop, shared by the Animation Lab and the
  audit. **`js/lab/lab.js`, `lab.html`**: the "Shooting (the shot lab)" group, the hoop drawn. **`tools/audit/shot.js`**
  (new) and **`tools/audit/check.js`** (8 new checks).

**How it is measured.**

- The dip: the ball's biggest drop before its rise to the release (in) and the pelvis's drop about the ball's lowest
  point, and how far apart in time the two bottoms are (both at least 2 and 1 in, within 0.12 s). The rise: from the
  bottom of the dip to the release (at least 12 in).
- The release against the top: the release's time minus the time of the jump's highest point (0.15 s before to 0.04 s
  after counts as near the top).
- The follow-through held: from the wrist's snap, for as long as the upper arm stays up past 110 degrees, the elbow
  within 35 of straight and the hand bent over at least 20 (at least 0.35 s counts). The landing: the knee's extra bend
  over the 0.35 s after the feet come down (at least 5 degrees).
- A finish's steps: every foot put down between the gather (the ball held out of the dribble) and the take-off; the
  foot on the floor at the gather is the zero step. The take-off foot: the last one down before both are off the floor.
- A pop: a joint accelerating past 1,500 ft/s^2 in one step (Trial 1's meter).

## B. Scorecard

| Criterion | Grade | Evidence |
|---|---|---|
| Jump shot phases, each a tunable: gather, dip, rise to the set point, release near the top, elbow under the ball and wrist snap, follow-through held, landing with a slight forward drift | PASS | `Tune.shot`; in the lab every jumper has every phase (table below): elbows 0.4 to 5.1 in off the shot's line and 16.7 to 18.2 in under the ball at the set, the wrist snapping at 2,100 to 2,900 deg/s into a gooseneck of 78 to 85 degrees, landings 2.6 to 11.7 in further toward the rim; images 1 to 10 |
| Free throws: routine (dribbles, spin, deep breath), minimal jump, held follow-through | PASS | 2 dribbles and a breath in 3.03 s, 3 dribbles, a spin and a breath in 3.97 s, per player (0 to 4 dribbles); no jump (0 in); the follow-through held 1.18 s; in live play 28 of 28 (0 of 28 before); images 22 to 26 |
| Layups: two-step gather footwork, knee drive, extension toward the rim, off hand protecting | PASS (lab), 41 of 42 live | every lab finish two steps after the gather, off the foot away from the hand, the knee at 94 to 99 degrees; the release extended toward the rim at 110 to 117 in; the off hand up (images 13 to 18); in live play 41 of 42 (6 of 35 before); the one: a 6-0 player's drive in seed 21 (the engine's dunk, a layup for a player that size) went three steps (C1) |
| Floaters, hooks, fadeaways, step-backs, pull-ups | PASS | each thrown in the lab with its own footwork and every jump shot phase; runners off the foot away from the hand in the lab and in live play (8 of 8) |
| Dunks: gather, one- or two-foot take-off, hand on the rim, controlled landing | PASS | one-foot dunk off the left foot after a two-step gather, the knee at 67 degrees; power dunk off two feet; the hand on the rim 0.08 to 0.18 s; landings giving 31 to 42 degrees at the knee (images 19 to 21); in live play 13 of 14 off the right feet with the hand on the rim 0.08 to 0.15 s (the medians); a dunk only for a player whose reach and jump get the hand over the rim (in the women's quarter most dunks had never touched it: now layups); the one: a standing putback dunk taken on the run, off one foot (C1) |
| Tip-ins and putbacks | PASS | the tip, putback and putback dunk from under the rim: a quick second jump, the ball straight back up, landings giving 23 to 31 degrees |
| Contested shots change form | PASS | the same shooter contested against open: released 1.2 in higher (108.0 against 106.8 in), 0.033 s quicker, off a jump 1.2 in higher, leaning away 8 degrees more (-13.3 against -5.1; images 11 and 12); in live play by contest level (open, contested, tight): the release 1.316, 1.329, 1.334 heights, 0.567, 0.55, 0.517 s, leaning -7.2, -11.5, -18.3 degrees in seed 7; in seed 21 and the women's quarter the contested and tight shots also higher and leaning further away, the tight ones quicker |
| Per-player shot form (release height, speed, elbow, jump, follow-through) | PASS | `shotForm`, drawn per player; shooters A and B below |
| Starting value: catch-and-shoot released ~0.5 to 0.8 s after the catch | PASS | 0.55 s (one motion) and 0.85 s (two motion) in the lab; in live play 23 of 27 within 0.5 to 0.8 s, medians 0.57 to 0.65 s (the four: caught short of the spot and brought into it, or a two-motion shooter at ~1 s) |
| **PASS when:** every jump shot has visible dip, rise, release near the apex, follow-through and landing | **PASS** in the lab, 71 of 75 live | lab 12 of 12 (0 of 12 before); live 71 of 75 (0 of 75 before) (C1) |
| **PASS when:** layup footwork correct every time | **PASS** in the lab, 41 of 42 live | lab 9 of 9 (0 of 9 before); live 41 of 42 (6 of 35 before) (C1) |
| **PASS when:** two different shooters recognizable by form alone | **PASS** | A against B: one motion against two; release height 6.6 in apart, the set point 3.5 in, the jump 4 in, the release time 0.30 s, the follow-through held 0.5 s, the elbow 4.3 in; B leans back 5 degrees more and kicks a leg (images 1 to 10) |

### The shots (Animation Lab measures, 25 scenarios)

#### Jump shots

| Scenario | Shot | Dip: ball / hips (in), apart (s) | Rise (in) | Release: time (s), height (in), from the top (s) | Jump (in) | Elbow: off the line / under the ball (in) | Hold (s) | Landing: knees (deg), drift (in) | Lean (deg) | Pops |
|---|---|---|---|---|---|---|---|---|---|---|
| spot-up jumper from the right wing, 18 ft (shooter A) | jumpshot | 4.2 / 4.6, 0.017 | 69.7 | 0.550, 106.8, -0.050 | 12.4 | 0.8 / 18.2 | 1.100 | 18.9, 5.2 | -5.1 | 0 |
| spot-up jumper from the right wing, 18 ft (shooter B) | jumpshot2 | 6.0 / 5.9, 0.100 | 64.8 | 0.850, 100.2, -0.017 | 8.4 | 5.1 / 16.7 | 0.600 | 24.6, 2.6 | -10.2 | 0 |
| catch and shoot on the wing, a chest pass from the top (shooter A) | jumpshot | 18.1 / 5.5, 0.017 | 68.6 | 0.550, 106.8, -0.050 | 12.4 | 0.8 / 18.1 | 1.100 | 18.9, 5.1 | -5.1 | 6 |
| catch and shoot on the wing, a chest pass from the top (shooter B) | jumpshot2 | 20.5 / 6.9, 0.100 | 64.4 | 0.850, 100.1, -0.017 | 8.4 | 4.5 / 17.0 | 0.600 | 24.6, 2.6 | -10.2 | 8 |
| two shooters, the same jumper from the two wings (A on the right, then B on the left) | jumpshot | 4.2 / 4.6, 0.017 | 69.7 | 0.550, 106.8, -0.050 | 12.4 | 0.8 / 18.2 | 1.100 | 18.9, 5.2 | -5.1 | 0 |
| (the second shooter) | jumpshot2 | 6.0 / 5.9, 0.100 | 64.8 | 0.850, 100.2, -0.017 | 8.4 | 5.1 / 16.7 | 0.600 | 24.7, 2.6 | -10.2 |  |
| pull-up jumper off the dribble at the elbow | pullup | 21.6 / 4.3, 0.017 | 74.3 | 0.750, 105.8, -0.033 | 13.1 | 5.1 / 16.8 | 0.900 | 29.2, 3.6 | -14.4 | 12 |
| step-back three on the left wing | stepback | 10.7 / 7.6, 0.033 | 67.9 | 0.817, 104.8, -0.050 | 13.1 | 3.2 / 18.1 | 0.917 | 26.3, 11.7 | -14.4 | 11 |
| fadeaway from the right baseline, 14 ft | fadeaway | 7.7 / 8.7, 0.017 | 70.5 | 0.650, 105.3, -0.033 | 15.0 | 4.1 / 17.5 | 0.900 | 29.5, -23.2 | -31.0 | 13 |
| turnaround post fade from the left block, back to the basket | postFadeR | 9.0 / 2.8, 0.000 | 66.2 | 0.800, 105.3, -0.033 | 15.0 | 4.1 / 17.4 | 0.900 | 28.8, -23.4 | -31.1 | 38 |
| open jumper, the defender back (to compare with the contested one) | jumpshot | 4.2 / 4.6, 0.017 | 69.7 | 0.550, 106.8, -0.050 | 12.4 | 0.8 / 18.2 | 1.100 | 18.9, 5.2 | -5.1 | 0 |
| contested jumper, a defender closing out hard | jumpshot | 4.1 / 4.6, 0.033 | 70.8 | 0.517, 108.0, -0.067 | 13.6 | 0.4 / 17.4 | 1.117 | 25.8, 5.1 | -13.3 | 2 |

#### Finishes

| Scenario | Shot | Steps after the gather | Take-off foot (hand) | Knee drive (deg) | Release height (in) | Jump (in) | Hand on the rim (s) | Landing knees (deg) | Pops |
|---|---|---|---|---|---|---|---|---|---|
| right-hand layup, a drive from the right wing | layup | 2 | L (R) | 99.4 | 116.1 | 29.8 | - | 20.8 | 8 |
| a left-hander's layup, a drive from the left wing | layup | 2 | R (L) | 99.0 | 116.8 | 29.8 | - | 22.3 | 16 |
| a right-hander's layup from the left side | layup | 2 | L (R) | 99.4 | 116.2 | 29.8 | - | 22.7 | 10 |
| reverse layup along the baseline | reverse | 2 | L (R) | 93.5 | 110.0 | 29.8 | - | 22.4 | 22 |
| floater in the lane | floater | 2 | L (R) | 56.1 | 104.5 | 11.3 | - | 25.4 | 6 |
| hook shot from the right block | hook | 2 | L (R) | 69.7 | 106.4 | 11.1 | - | 23.8 | 10 |
| one-foot dunk on the break | dunk | 2 | L (R) | 66.8 | 120.5 | 35.2 | 0.167 | 34.1 | 19 |
| two-foot power dunk | dunk2 | 2 | both (R) | 0.0 | 125.3 | 33.6 | 0.117 | 40.9 | 11 |
| putback from under the rim | putback | - | - (-) | - | 114.1 | 25.1 | - | 24.4 | 2 |
| putback dunk from under the rim | putbackDunk | 1 | both (R) | 0.0 | 124.2 | 28.7 | 0.183 | 30.8 | 24 |
| tip-in at the rim | tip | - | - (-) | - | 119.1 | 20.9 | - | 22.8 | 9 |
| alley-oop from a lob at the top | alley | 2 | L (R) | 78.4 | 120.9 | 35.6 | 0.083 | 41.8 | 52 |

#### Free throws

| Scenario | Routine (s) | Dribbles | Spin | Deep breath | Dip: ball / hips (in) | Jump (in) | Release height (in) | Hold (s) | Pops |
|---|---|---|---|---|---|---|---|---|---|
| free throw: the bounce pass from the official, two dribbles and a deep breath, the shot | 3.03 | 2 | no | yes | 5.1 / 8.4 | 0.0 | 92.1 | 1.183 | 3 |
| free throw: the bounce pass from the official, three dribbles, a spin of the ball and a deep breath, the shot | 3.97 | 3 | yes | yes | 5.1 / 8.4 | 0.0 | 92.1 | 1.183 | 3 |

(`docs/gauntlet/baseline/trial09_shot_lab.json`.)

### Before and after

The Lab, the same 25 scenarios on the code before this trial (cc00417) and now:

| Measure | Before | After |
|---|---|---|
| Jump shots with every phase | 0 of 12 | 12 of 12 |
| The ball's dip (median) | 1.1 in (8 of 12 under 2 in) | 7.7 in (4.1 to 21.6) |
| The hips' dip (median) | 2.0 in | 5.5 in (2.8 to 8.7) |
| The follow-through held (median) | 0.62 s (3 at 0.02 s) | 0.92 s (0.6 to 1.12) |
| The landing's knee bend (median) | 0 deg (none) | 24.7 deg (18.9 to 29.5) |
| Jump (median) | 9.8 in | 12.4 in (8.4 to 15) |
| Two shooters' forms | the same shot | one motion against two, release 6.6 in and 0.30 s apart |
| Free throw routine | 1.68 s, 2 dribbles for everyone, no spin, no breath, dip 0.5 in | 3.03 and 3.97 s per player, dribbles, spin, breath, dip 5.1 in |
| Finishes: steps after the gather | 2 to 4, all but the reverse off both feet with no knee drive | 2, off the foot away from the hand (the power dunk off both), a layup's knee 94 to 99 deg |
| Dunks | 3 and 4 steps, off both feet, landing 0 deg | 2 steps, one foot (or two for the power dunk), landing 34 and 41 deg |
| Joint pops, all 25 scenarios | 357 | 285 |

Each scenario:

| Scenario | Before | After |
|---|---|---|
| spot-up jumper from the right wing, 18 ft (shooter A) | dip 1.1/2.0 in, hold 0.62 s, landing 0.0 deg (4 pops) | dip 4.2/4.6 in, hold 1.10 s, landing 18.9 deg (0 pops) |
| spot-up jumper from the right wing, 18 ft (shooter B) | dip 1.1/2.0 in, hold 0.62 s, landing 0.0 deg (4 pops) | dip 6.0/5.9 in, hold 0.60 s, landing 24.6 deg (0 pops) |
| catch and shoot on the wing, a chest pass from the top (shooter A) | dip 15.9/4.2 in, hold 0.62 s, landing 0.0 deg (14 pops) | dip 18.1/5.5 in, hold 1.10 s, landing 18.9 deg (6 pops) |
| catch and shoot on the wing, a chest pass from the top (shooter B) | dip 15.9/4.2 in, hold 0.62 s, landing 0.0 deg (14 pops) | dip 20.5/6.9 in, hold 0.60 s, landing 24.6 deg (8 pops) |
| two shooters, the same jumper from the two wings (A on the right, then B on the left) | dip 1.1/2.0 in, hold 0.62 s, landing 0.0 deg; dip 1.1/2.0 in, hold 0.60 s, landing 0.0 deg (8 pops) | dip 4.2/4.6 in, hold 1.10 s, landing 18.9 deg; dip 6.0/5.9 in, hold 0.60 s, landing 24.7 deg (0 pops) |
| pull-up jumper off the dribble at the elbow | dip 11.7/1.1 in, hold 0.58 s, landing 0.0 deg (6 pops) | dip 21.6/4.3 in, hold 0.90 s, landing 29.2 deg (12 pops) |
| step-back three on the left wing | dip 0.0/0.0 in, hold 0.02 s, landing 2.4 deg (19 pops) | dip 10.7/7.6 in, hold 0.92 s, landing 26.3 deg (11 pops) |
| fadeaway from the right baseline, 14 ft | dip 1.9/2.8 in, hold 0.02 s, landing 0.0 deg (9 pops) | dip 7.7/8.7 in, hold 0.90 s, landing 29.5 deg (13 pops) |
| turnaround post fade from the left block, back to the basket | dip 7.2/2.1 in, hold 0.02 s, landing 0.0 deg (24 pops) | dip 9.0/2.8 in, hold 0.90 s, landing 28.8 deg (38 pops) |
| open jumper, the defender back (to compare with the contested one) | dip 1.1/2.0 in, hold 0.62 s, landing 0.0 deg (4 pops) | dip 4.2/4.6 in, hold 1.10 s, landing 18.9 deg (0 pops) |
| contested jumper, a defender closing out hard | dip 1.1/2.0 in, hold 0.62 s, landing 0.0 deg (4 pops) | dip 4.1/4.6 in, hold 1.12 s, landing 25.8 deg (2 pops) |
| free throw: the bounce pass from the official, two dribbles and a deep breath, the shot | dip 0.5/0.0 in, dribbles 2, routine 1.68 s (5 pops) | dip 5.1/8.4 in, dribbles 2, routine 3.03 s (3 pops) |
| free throw: the bounce pass from the official, three dribbles, a spin of the ball and a deep breath, the shot | dip 0.5/0.0 in, dribbles 2, routine 1.68 s (5 pops) | dip 5.1/8.4 in, dribbles 3, routine 3.97 s (3 pops) |
| right-hand layup, a drive from the right wing | 3 steps, both feet, knee 0.0 deg, landing 0.0 deg (10 pops) | 2 steps, L foot, knee 99.4 deg, landing 20.8 deg (8 pops) |
| a left-hander's layup, a drive from the left wing | 4 steps, both feet, knee 0.0 deg, landing 0.0 deg (9 pops) | 2 steps, R foot, knee 99.0 deg, landing 22.3 deg (16 pops) |
| a right-hander's layup from the left side | 3 steps, both feet, knee 0.0 deg, landing 0.0 deg (9 pops) | 2 steps, L foot, knee 99.4 deg, landing 22.7 deg (10 pops) |
| reverse layup along the baseline | 3 steps, L foot, knee 85.9 deg, landing 0.0 deg (18 pops) | 2 steps, L foot, knee 93.5 deg, landing 22.4 deg (22 pops) |
| floater in the lane | 2 steps, both feet, knee 0.0 deg, landing 0.0 deg (8 pops) | 2 steps, L foot, knee 56.1 deg, landing 25.4 deg (6 pops) |
| hook shot from the right block | 2 steps, both feet, knee 0.0 deg, landing 0.0 deg (9 pops) | 2 steps, L foot, knee 69.7 deg, landing 23.8 deg (10 pops) |
| one-foot dunk on the break | 3 steps, both feet, knee 0.0 deg, landing 0.0 deg (47 pops) | 2 steps, L foot, knee 66.8 deg, landing 34.1 deg (19 pops) |
| two-foot power dunk | 4 steps, both feet, knee 0.0 deg, landing 0.0 deg (28 pops) | 2 steps, both feet, knee 0.0 deg, landing 40.9 deg (11 pops) |
| putback from under the rim | - steps, - foot, knee - deg, landing 0.0 deg (4 pops) | - steps, - foot, knee - deg, landing 24.4 deg (2 pops) |
| putback dunk from under the rim | 1 steps, both feet, knee 0.0 deg, landing 0.0 deg (28 pops) | 1 steps, both feet, knee 0.0 deg, landing 30.8 deg (24 pops) |
| tip-in at the rim | - steps, - foot, knee - deg, landing 0.0 deg (9 pops) | - steps, - foot, knee - deg, landing 22.8 deg (9 pops) |
| alley-oop from a lob at the top | 3 steps, both feet, knee 0.0 deg, landing 0.0 deg (58 pops) | 2 steps, L foot, knee 78.4 deg, landing 41.8 deg (52 pops) |


(Joint pops in all 25 scenarios: 357 before, 285 after.)

### In live games

Three full quarters (seed 7 / seed 21 / women's league seed 7), the same games on the code before this trial and now,
measured by the same shot meter (the engine's events are the same, so are the shots):

| Measure | Before (seed 7 / seed 21 / women 7) | After |
|---|---|---|
| Shots measured | 57 / 64 / 52 | 57 / 64 / 52 |
| Jump shots with every phase | 0 of 30 / 0 of 24 / 0 of 21 | 28 of 30 / 22 of 24 / 21 of 21 |
|   missing the dip / rise / top / hold / landing | 12-0-0-14-29 / 12-0-0-12-24 / 8-0-0-17-21 | 1-0-1-0-0 / 2-0-0-0-0 / 0-0-0-0-0 |
|   the ball's dip, median (in) | 10.1 / 12.3 / 10.1 | 11.7 / 14.7 / 11 |
|   the hips' dip, median (in) | 2.2 / 2.8 / 2.6 | 5.2 / 5.9 / 5.3 |
|   released before the top, median (s) | 0.05 / 0.05 / 0.05 | 0.067 / 0.067 / 0.05 |
|   follow-through held, median (s) | 0.5 / 0.417 / 0 | 0.917 / 0.883 / 0.867 |
|   landing, knee bend, median (deg) | 0 / 0 / 0 | 25.5 / 25.1 / 24 |
| Finishes two steps, off the right foot | 2 of 9 / 4 of 14 / 0 of 12 | 9 of 9 / 15 of 16 / 17 of 17 |
|   knee drive, median (deg) | 0 / 0 / 0 | 99.6 / 99.6 / 99.5 |
| Runners off the right foot | 2 of 4 / 0 of 3 / 1 of 1 | 4 of 4 / 3 of 3 / 1 of 1 |
| Dunks off the right feet | 6 of 6 / 8 of 9 / 7 of 7 | 6 of 6 / 6 of 6 / 1 of 2 |
|   hand on the rim, median (s) | 0.15 / 0.133 / 0 | 0.15 / 0.15 / 0.083 |
| Free throws with a routine, no jump, the hold | 0 of 4 / 0 of 13 / 0 of 11 | 4 of 4 / 13 of 13 / 11 of 11 |
|   dribbles, median | 2 / 2 / 2 | 1 / 1 / 2 |
|   spins | 0 / 0 / 0 | 1 / 4 / 7 |
|   deep breaths | 0 / 0 / 0 | 3 / 12 / 7 |
| Catch-and-shoot released 0.5-0.8 s after the catch | - / - / - | 11 of 14 / 9 of 9 / 3 of 4 |
|   catch to release, median (s) | - / - / - | 0.65 / 0.567 / 0.617 |

(`docs/gauntlet/baseline/trial09_seed7.json`, `trial09_seed21.json`, `trial09_seed7_women.json`. The catch-and-shoot's
kind was not passed to its clip before, so its time could not be read then.)

## C. Devil's advocate

1. **"The live game still has shots that miss."**
   - 4 of 75 jump shots miss a phase: two contested shots (a pull-up, a catch-and-shoot) where the ball and the hips both go
     down, 8 in and 3.4 to 6.5 in, but bottom 0.15 s apart (the hips still dropping from the stop into the shot after the
     ball has turned up); a catch-and-shoot whose ball dips 1 in (the catch's give ends low, and the shot's dip starts from
     there); an end-of-quarter heave, thrown as a pull-up, let go 0.05 s after the top of the jump (0.04 is the limit). 1
     of 42 layups goes three steps (a 6-0 player's drive that the engine called a dunk), and 1 of 14 dunks is off the wrong
     foot (a standing putback dunk taken on the run, where the running dunk is the right move).
   - Every live change in this trial reshuffled which shots the game throws (the release now waits for the clip, so the
     play after a shot runs a little later): over the eight rounds of three quarters run while fixing, the misses moved
     between 0 and 4 jump shots and 0 and 2 layups a quarter, never the same shot twice once fixed. The pattern left is the
     contested shot out of a stop: the next place to look is the braking hip drop (Trial 4's) under the dip.
2. **"Some of the Lab's shots have more pops than before."**
   - The total is down (357 to 285 in the 25 scenarios), but the pull-up (6 to 12), the fadeaway (9 to 13), the post fade
     (24 to 38), the left-hander's layup (9 to 16), the reverse (18 to 22), the right-hander's layup from the left side
     and the hook (9 to 10) went up. These
     are the new motions: a real dip and landing, a knee driven up, the ball coming up out of the dribble into the dip, the
     post fade's turn back to the play after a longer hold. They are hand, elbow and knee accelerations of one or two frames
     at the start and end of each phase; the Final Eye Test will look at them one by one.
   - In the game the joint pops per player-minute went down (29.5, 30.5 and 26.5 against 32.6, 34.1 and 30.7), but the
     locomotion pops per minute of movement went up (5.2, 5.4 and 5.4 against 5.0, 4.8 and 5.1), nearly all in defensive
     slides and backpedal-to-slide changes (D).
3. **"The forms are drawn, not taken from real shooters."**
   - Each player's form comes from hashes of the id inside ranges set from coaching and timing sources (the release 0.5 to
     0.85 s, one or two motion, the set point, the hold), pulled by the shooting ratings and size. Two shooters with
     opposite draws (A and B) are told apart at once; two random players in a game are closer, and nobody shoots like a
     particular real player. A form per real player (from film) is a data question beyond this trial.
   - Nor does the form change the result: the engine decides makes and misses, the view only shows the shot.
   - The dunk rule is calibrated on the Lab's own dunks (6-0 to 6-9, springs 40 to 95): a player just under the line lays
     it up where a real player that size might dunk it.

## D. Regression check

- **Trial 1:** check.js 135 of 135 (8 new); the determinism check gives 1500/1500 identical steps at 1x, 0.25x, 0.1x, 144 Hz
  and a jittery frame rate.
- **Trial 2:** 0 final poses past a joint limit in all three quarters; knees caving in 0.03, 0.03 and 0.04% of planted
  frames (0.03, 0.03, 0.05 at Trial 10); joints held at a limit 7.1, 6.9 and 7.0% (7.2, 6.9, 6.9); arms out of reach 1.33,
  1.10 and 1.27% (1.37, 1.06, 1.25); spine and neck pops 2.94, 2.39 and 2.38 a player-minute (3.10, 2.94, 2.89).
- **Trial 3:** no contact slid past 0.25 in (worst 0.09, 0.11 and 0.13 in; 0.11, 0.10, 0.11), nothing through the floor, no
  planted foot floating; 99.94, 99.95 and 99.92% of steps with a clear plant (99.94, 99.92, 99.93). One intermediate run had
  a single backpedal toe at 0.24 in (a transition get-back, no shot near it); the p99 stayed 0.01 in in every run.
- **Trial 4:** 0 acceleration snaps and 0 instant turns in all three quarters; one hip jump in seed 21 (0.01 a
  player-minute); every hard cut on a planted outside foot, brakes on a planted foot 99.5, 99.0 and 99.0% (99.8, 98.8, 98.7).
- **Trial 5:** all its checks pass. **Pops per minute of movement 5.20, 5.40 and 5.41 (4.97, 4.83 and 5.05), and pops after
  a change of gait 619, 563 and 486 (512, 538, 457)**: nearly all in defensive slides (the toes and knees) and in the
  changes into a slide from a backpedal or a stand, where the shooter's defender goes (the shot's release now waits for its
  clip, and the closeouts and contests planned for it land at slightly different moments). Carried as an open item with
  Trial 6. All joint pops, every body and every joint: 29.5, 30.5 and 26.5 a player-minute (32.6, 34.1, 30.7).
- **Trial 8:** the dribble lab is identical to its baseline (every scenario's contacts, frames of the ball in a body and
  pops); in games, dribble contacts off the ball 15.3, 17.2 and 14.4% (14.9, 17.5, 14.1), frames of the ball in a body 4,411,
  4,302 and 3,126 (4,441, 4,687, 3,298), jolts in the air 1,461, 1,743 and 1,277 (1,428, 1,534, 1,464).
- **Trial 10:** the pass lab is identical to its baseline (hands set, eyes on, palms at the catch, the ball in the hands,
  stops, flights, the passer's hands, releases, pops); in games, hands set late 1, 2 and 1 (0, 3, 0), eyes late 8, 10 and 6
  (10, 12, 10), passes with the ball in a hand before the catch 38, 37 and 22 (52, 30, 21) over 63, 72 and 27 frames (86, 51,
  49), release jolts 16, 28 and 14 (21, 33, 21), dead stops 30, 39 and 20 (42, 32, 23). An arm letting go of the ball near
  full reach now blends its wrist round the shoulder (C, A); taken round for every reach, not only letting go, it had the
  receivers' hands meet the ball's path early (46 passes with the ball in a hand in seed 21), so it is limited to letting go.
- **Cost:** one process at a time, 12,000 steps of seeds 7 and 21, twice each: 2.84 to 2.92 ms a step at the median and
  6.2 to 6.6 at p99, against 2.79 to 2.89 and 6.1 to 6.5 on the code before this trial (the same meters): within 0.06 ms,
  inside a 60 fps frame (16.7 ms).
- Scorecards: `docs/gauntlet/baseline/trial09_*.json`.

## E. What to watch for

- In the Lab, "Shooting (the shot lab)" at 0.25x, the camera beside the shooter:
  - shooter A against shooter B (the spot-ups, then "two shooters, the same jumper from the two wings"): the one-motion
    shot against the two-motion one, where the ball stops (the set point), how high it goes, how long the arm stays up;
  - every jump shot: the ball and the knees going down together, the rise, the ball gone just before the top, the
    gooseneck held, the knees giving on the landing a little in front of the take-off;
  - "contested jumper" against "open jumper": higher, quicker, leaning away;
  - the free throws: the bounce pass, the dribbles, the spin, the chest rising and falling with the breath, no jump;
  - the layups: count the steps after the ball is picked up (two), the take-off foot (the one away from the ball), the
    other knee coming up with the ball; the left-hander's is the mirror;
  - the dunks: the long last step and one-foot take-off, the power dunk's 1-2 and two-foot load, the hand on the rim for a
    moment, the landing.
- In a game at 0.25x: jump shots off the catch and off the dribble (a pull-up now), layups from a walk and from a sprint,
  free throws (each shooter's own routine). Shift+D: the shot lines.
- Still to come:
  - **Trial 6:** the defender's contest in time with the shot (the shape of the contested shot is here, the closeout is
    Trial 6's); **Trial 7:** the gather footwork out of every move, the hop and the 1-2 into a catch-and-shoot;
    **Trial 11:** the ball off the rim and the glass after the release; **Trial 13:** which shot, when, and the
    catch-and-shoot receiver's timing to the pass (a catch short of the spot is the source of most slow ones).
  - **Open items from this trial:** the live misses of C1 (the dip out of a stop and the catch's give, the three-step
    drive, the putback dunk on the run) with Trials 7 and 13; the defensive slide pops of C2 with Trial 6; the arm pops
    of the post fade and of the left-hander's layup with the Final Eye Test.
  - `Tune.shot` holds every value of this trial.

## Sources

- The jump shot's mechanics (the dip, the set point, the release near the top, the elbow under the ball, the follow-through):
  https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2021.658102/full ,
  https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8273237/ , https://www.physio-pedia.com/Biomechanics_of_the_Basketball_Jump_Shot ,
  https://www.researchgate.net/publication/240177823_Biomechanics_of_the_Basketball_Jump_Shot-Six_Key_Teaching_Points ,
  https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9465762/ , https://www.physicaleducationupdate.com/public/329.cfm
- Form and follow-through (BEEF, the gooseneck held until the ball reaches the rim):
  https://www.coachesclipboard.net/Shooting.html , https://hoopsking.com/blogs/default-blog/beef-method-of-shooting-the-basketball ,
  https://www.basketballforcoaches.com/how-to-shoot-a-basketball/ , https://www.breakthroughbasketball.com/fundamentals/shooting-technique ,
  https://factorybasketballacademy.com/teaching-proper-shooting-form-the-b-e-e-f-method/
- The catch-and-shoot's release time (NBA ~0.54 s on average; timed spot-up shooters 0.76 to 0.82 s) and the footwork into it
  (the hop and the 1-2): https://www.breakthroughbasketball.com/fundamentals/Shooting/three-components-of-a-quick-release.html ,
  https://en.siqbasketball.com/pages/release-time , https://blog.drdishbasketball.com/basketball-shooting-footwork-1-2-vs.-the-hop ,
  a video on the 1-2 against the hop: https://www.youtube.com/watch?v=6iMpVVIbMmc ,
  https://www.levelupbasket.com/blog/how-to-shoot-like-stephen-curry , https://coachhoops.substack.com/p/shooting-footwork
- The contested shot (released higher and faster, higher angle, quicker): https://pubmed.ncbi.nlm.nih.gov/11083144 ,
  https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2018.00706/full , https://www.mdpi.com/2076-3417/14/20/9582
- The free throw routine (a set number of dribbles, a breath, the same every time):
  https://www.sportplan.net/drills/Basketball/trends/free-throw-routine-consistency-2025-04.jsp ,
  https://www.coachkamilhoops.com/skills/shooting/free-throw/ft-routine , https://auralize.app/blog/breathing-basketball
- The layup and the gather step (right, left, jump off the left for a right-hander, the knee with the ball; the zero step
  and two steps after the gather): https://www.basketballforcoaches.com/how-to-do-a-layup/ ,
  https://www.breakthroughbasketball.com/fundamentals/layups , https://sportssteps.com/layup-step-wrong-foot-kids-coaching/ ,
  https://www.basketballforcoaches.com/gather-step/ , https://videorulebook.nba.com/archive/legal-play-gather-and-then-takes-2-steps
- The floater and the hook: https://onlinebasketballplaybook.com/floater-basketball/ ,
  https://hoopsking.com/blogs/default-blog/perfecting-the-art-how-to-shoot-a-floater-in-basketball ,
  https://www.coachesclipboard.net/HookShotWissel.html , https://www.basketballforcoaches.com/hook-shot/
- The step-back and the fadeaway: https://www.breakthroughbasketball.com/training/5-step-back-moves ,
  https://hoopsking.com/blogs/default-blog/how-to-shoot-a-fadeaway-like-michael-jordan , https://en.wikipedia.org/wiki/Fadeaway ,
  a video on the fadeaway's footwork: https://www.youtube.com/watch?v=Lv-o8H3Q9GU
- Dunks (one foot: the long penultimate step; two feet: the deep load; the rim held only to land safely):
  https://www.thehoopsgeek.com/how-to-dunk/ , https://basketballword.com/hang-on-rim-rule/ ,
  https://videorulebook.nba.com/archive/technical-foul-player-hangs-on-rim-following-dunk-2
- Putbacks and the two-foot power up: https://en.wikipedia.org/wiki/Basketball_moves , https://www.thehoopsgeek.com/jump-higher-off-two-feet/
