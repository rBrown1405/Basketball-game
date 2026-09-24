# Match view — implementation notes (`js/match/*`, `PBC.Match`)

The visual match view acts out the engine's possessions on a fake-3D broadcast court (Canvas 2D only, no
images, no libraries, classic scripts). It follows `docs/MATCH_API.md` exactly; this file documents how it is
built, how to host it, what it does not do yet, and what would help from the engine.

## Script load order

Required (in this order, after the engine/UI scripts or before — the view has no dependency on them):

```html
<script src="js/match/util.js"></script>
<script src="js/match/camera.js"></script>
<script src="js/match/court.js"></script>
<script src="js/match/arena.js"></script>
<script src="js/match/hoop.js"></script>
<script src="js/match/rig.js"></script>
<script src="js/match/poses.js"></script>
<script src="js/match/figure.js"></script>
<script src="js/match/anims.js"></script>
<script src="js/match/clips.js"></script>
<script src="js/match/actor.js"></script>
<script src="js/match/ball.js"></script>
<script src="js/match/choreo.js"></script>
<script src="js/match/view.js"></script>
```

Optional (test harness only, not needed by `index.html`):

```html
<script src="js/match/viewer.js"></script>   <!-- animation turntable used by match_test.html -->
<script src="js/match/mock.js"></script>     <!-- mock teams + possession generator -->
```

If `PBC.Sim.attacksRight` exists the view uses it for the attack direction; otherwise it uses the rule from the
contract (home attacks right in periods 1–2).

## Files

| file | what it does |
|---|---|
| `util.js` | math, easing, Catmull-Rom curves (periodic LUTs for gait), seeded RNG, colour helpers, `safe()` wrapper |
| `camera.js` | perspective camera (no yaw/roll → every constant-y line is horizontal) + `CameraRig` presets (`broadcast`, `wide`, `close`, automatic free-throw close-up) and smoothed ball-following pan with lead |
| `court.js` | pre-rendered top-down hardwood texture (per-pixel planks, grain, seams), paint, apron text, centre logo from `court.logoText`; floor drawn as perspective scanline strips; all court lines as crisp projected polygons (arc/corners from `ctx.threePt`) |
| `arena.js` | far + baseline stands built row by row (risers, treads, seat backs, aisles), sprite-atlas crowd (44 looks × 6 poses, home colours weighted, idle motion, standing/cheering on big plays), courtside seats, animated LED ribbon + baseline boards, hanging jumbotron with live score/clock, vignette |
| `hoop.js` | stanchion (team-colour padding), glass backboard with shooter's square, shot clock with live digits, rim front/back halves (drawn around the ball), spring-driven diamond-mesh net (swish whip, rim shake, hang) |
| `rig.js` | 3D skeleton: Drillis & Contini segment lengths from height, build/weight thickness, pose channel vector (degrees → radians), forward kinematics, analytic two-bone IK for legs (planted feet) and arms (hands on the ball) |
| `poses.js` | key poses: stand, ready, defensive stance, triple threat, shot pocket, set point, follow-through… |
| `figure.js` | draws a solved skeleton: every limb is the projected silhouette of a tapered 3D shape with anatomical width profiles (deltoid, biceps, quads, calf…), cylindrical gradient shading, outline, per-part depth sort; tank-top jersey with trim and front/back numbers, baggy shorts with side stripes, socks, sneakers (hull), sleeves, tattoos, heads with spherical-cap hair (15 styles), beards, headbands, faces; referee shirt stripes; contact shadows; floor reflections |
| `anims.js` | gait curves (walk/jog/sprint, phase 0 = right foot contact), gait parameters by speed (cadence, stance fraction, swing lift, reach, step width), stance table, clip format + Catmull-Rom sampler, jump shot / free throw / chest pass |
| `clips.js` | the action library (see below) and extra stances |
| `actor.js` | a person: steering with accel limits and timed arrivals, pivoting facing, foot controller (gait-phase stepping with predicted landings, heel rise/toe-off, error-driven stance steps, recovery steps, lateral step-slide that never crosses the feet), pose layering (stance → gait → upper-body clip → full-body clip → look-at), dribble arm, ball grips, pelvis reach clamp, momentum carried into clips |
| `ball.js` | ball states (held with hand-over tosses, dribble synced to gait, flight as exact time-parameterised ballistic segments, loose bounces/rolls); passes (chest/bounce/lob…, homing to the receiver's hands), shots (swish / rim-in / bank / miss front-back-side-board with rattles, carom timed to the rebounder, blocks), spin with rotating seams, squash, shadow |
| `choreo.js` | `Director`: possession → beats. Each event gets a planner that plans backwards from its visible moment, runs the game/shot clock, keeps offense spots moving, man/zone/press defense tracking, closeouts, box-outs, refs, FT lane setup, subs, timeouts, tip-off, turnovers, GIM freeze/resume, watchdog |
| `view.js` | `PBC.Match.View` (public API), sub-stepped simulation, depth-sorted rendering, subs bookkeeping, referee positioning, body separation, pixel mode |
| `viewer.js` | turntable/filmstrip used by the harness animation viewer |
| `mock.js` | mock league context + endless contract-shaped possessions (every event type, GIM) + `resolvePending` |

`match_test.html` (project root) is the harness: mock or real-engine game, pause, 1–16×, forced play type,
camera preset, pixel mode, names, low quality, women's league, GIM auto-resume, and an **Animation viewer** mode
that shows one player (any look, or a referee) on a turntable cycling through every clip, gait and stance.

## Hosting the view

```js
const view = new PBC.Match.View(canvas, ctx, { quality: 'high', pixelMode: false, camera: 'broadcast' });
view.resize(cssWidth, cssHeight);             // call on layout changes; DPR handled internally (capped at 2)
view.play(possession, {
  onEvent(ev) { /* engine events at their visible moment, plus {type:'score', team, pts, shotEvent} */ },
  onDone()    { /* possession fully shown: queue the next one */ },
});
// every animation frame:
view.update(dtSeconds * speed);               // any speed; internally sub-stepped at 1/60 s (hard cap 2 s per call)
view.render();
view.clock(); view.shotClock(); view.isIdle();
```

* `play()` while another possession is still running finishes the old one first (its remaining events are
  emitted and its `onDone` fires) — the view never soft-locks.
* Event timing: `pass` when the ball leaves the hand, `shot` at release (GIM: at the set point, then the view
  freezes), `score` when the ball drops through the net (field goals only), `rebound` when secured, `ft` when the
  free throw drops or misses (made free throws are **not** repeated as `score`), `sub` when the player crosses
  the sideline, `turnover` at the steal/whistle/horn, `foul` at the whistle, `period_end` at the horn,
  `jump_ball` at the tip, `inbound` when the pass leaves the inbounder, `advance` when the handler crosses half
  court, `set`/`screen`/`handoff`/`move` at the action. Each engine event object is emitted exactly once.
* The game clock shown is `clockStart − t` interpolated between event times, so every event fires with the clock
  at exactly its `t`. When the motion needs longer than the engine's gap the clock runs slightly slower for that
  stretch (stretching, never jumping); dead balls (same `t`) insert presentation time with the clock stopped.
* GIM: when the pending shot reaches the set point the players freeze (crowd keeps moving, even if the host
  keeps calling `update(0)`), `onEvent(shotEvent)` fires; after `PBC.Sim.resolvePending(...)` call
  `view.resume()`; the view re-reads the event (mutated in place) and the appended events and continues.
  Calling `resume()` before the freeze is also safe (it then won't freeze).
* `view.setDefScheme(team, scheme)` any time; `view.period = n` may be set directly; `view.celebrate(team)` at the
  final buzzer; `view.setOption('camera'|'pixelMode'|'quality'|'showNames', value)`; `view.destroy()`.
* The view keeps its own score for the jumbotron (from `score`/`ft` events) and re-syncs to `endScore` on `onDone`.

## Clip library (right-handed, mirrored for lefties)

Locomotion: walk, jog, sprint (blended by speed, stride = speed / cadence so feet never skate), backpedal,
defensive step-slide, stationary stance stepping. Stances: stand, ready, defense (high/low hands), defense wide,
triple threat, hold chest, shot pocket, screen, box-out, post-up, post defense, inbound (ball overhead), hands on
knees (FT lane), dribble, referee.

Actions: `jumpshot` (catch-and-shoot), `pullup`, `stepback`, `fadeaway`, `freethrow`, `layup`, `reverse`,
`floater`, `hook`, `dunk` (one hand, rim hang), `dunk2` (two hands), `alley`, `tip`, `putback`, `putbackDunk`,
`rebound` (grab at the apex, chin it), `contestUp`, `contestJump`, `block`, `swipe`, `intercept`, `fall`
(taking a charge), `passChest`, `passBounce`, `passOverhead`, `passPush`, `passLob`, `passOutlet`,
`passInbound`, `catch`, `pickup`, `jab`, `spin`, `hesi`, `backdown`, `jumpTip`, celebrations (`fistPump`, `flex`,
`threeFingers`, `point`, `clap`), `dejected`, referee signals (`refWhistle`, `refFoul`, `refThree`,
`refThreeGood`, `refTravel`, `refOut`, `refTimeout`, `refCharge`, `refThreeSec`, `refShotClock`, `refToss`).
Dribble moves (crossover, between the legs, behind the back) are driven by the ball's dribble state; the
dribble hand follows the ball by IK and the bounce is synced to the footfalls when moving.

## Verification done

* `node --check` on every file.
* Headless stress tests (Node + fake canvas, in the author's scratchpad): thousands of mock possessions at 1×,
  2×, 4×, 16× and two full real-engine games per league (`League.create` → `Sim.createGame` → every
  possession, engine GIMs resolved with `Sim.resolvePending`): 0 soft-locks, 0 un-emitted events, 0 clock
  reversals, 0 events off their `t`, 0 score mismatches vs `endScore`. Animation-glitch counters (pelvis
  collapse, IK misses on planted feet, actor/ball teleports, clips starting away from their origin) are down to
  well under 0.1 % of sampled frames.
* Performance (MacBook, Chrome, 1600×900 CSS @ DPR 2): ~6–7 ms CPU per `render()`, ~0.06 ms per `update()` at
  1× and ~1 ms at 16×.

## Known limitations

* No audio — the host can play whistle/horn/swish sounds from `onEvent`.
* The set-name TV graphic is left to the host (`onEvent({type:'set'})` carries `setName`).
* The jumbotron is a stylised overlay hanging into the top of the frame (a real centre-hung board is outside a
  broadcast camera's view).
* Rim finishes (layup/dunk/tip/putback) may release up to ~3 ft away from the engine's `x/y` when the
  choreography cannot line up the running approach in time (the ball still goes to the rim); jump shots always
  plan for the exact spot (a very tight engine timing can make the shooter slide the last few feet).
* Referees position as lead/trail/slot and follow the play, but do not run full NBA rotation mechanics.
* Zones are shifted zone spots (2-3, 3-2, 1-3-1, box-and-one), not true match-up zones; `press` is full-court
  man pickup.
* Fans are billboards (always face the camera); no aisle walkers, vendors or mascot yet.
* Bench players, coaches and the scorer's table are off-screen below the near sideline.

## Requests for engine

None are required — the view works with the current contract and the current `js/core/sim.js`. Things that
would make the view more faithful if they ever become available (all optional, the view handles their absence):

* `rebound.x / rebound.y` — where the ball was secured (the view currently chooses a carom spot near the
  rebounder, short when a putback follows).
* `pass.x / pass.y` — the catch spot (the view derives it from the receiver's next action).
* For shots created by `Sim.startGimPossession`, keeping `x`, `y`, `kind` and `shooter` filled while `pending`
  (they are today) is important: the view poses the freeze from them.
* Engine values the view already tolerates beyond the contract text: `play: 'pop' | 'putback'`, shot
  `kind: 'heave'`, `look.headband: 'team'`, `ctx.otLen`, `clockEnd: null` before the possession is finished.
