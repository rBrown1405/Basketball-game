# Match view — implementation notes (`js/match/*`, `PBC.Match`)

The visual match view acts out the engine's possessions on a fake-3D broadcast court (Canvas 2D only, no
images, no libraries, classic scripts). It follows `docs/MATCH_API.md` exactly; this file documents how it is
built, how to host it, what it does not do yet, and what would help from the engine.

## Script load order

Required (in this order, after the engine/UI scripts or before — the view has no dependency on them):

```html
<script src="js/match/util.js"></script>
<script src="js/match/tune.js"></script>     <!-- every animation tuning value (PBC.Match.Tune) -->
<script src="js/match/camera.js"></script>
<script src="js/match/court.js"></script>
<script src="js/match/arena.js"></script>
<script src="js/match/hoop.js"></script>
<script src="js/match/rig.js"></script>
<script src="js/match/poses.js"></script>
<script src="js/match/hair.js"></script>     <!-- hair that moves (figure.js, human_build.js, gl3d.js use it when loaded) -->
<script src="js/match/figure.js"></script>
<script src="js/match/body3d.js"></script>
<script src="js/match/body3d_parts.js"></script>
<script src="js/match/human_data.js"></script>
<script src="js/match/human.js"></script>
<script src="js/match/human_build.js"></script>
<script src="js/match/gl3d.js"></script>
<script src="js/match/anims.js"></script>
<script src="js/match/clips.js"></script>
<script src="js/match/actor.js"></script>
<script src="js/match/ball.js"></script>
<script src="js/match/aim.js"></script>      <!-- the shooter's aim: how a shot meets the rim (PBC.Match.Aim) -->
<script src="js/match/choreo.js"></script>
<script src="js/match/flow.js"></script>
<script src="js/match/defense.js"></script>  <!-- half-court man-to-man defense (extends the Director) -->
<script src="js/match/offense.js"></script>  <!-- half-court spacing and off-ball jobs (extends the Director) -->
<script src="js/match/plays.js"></script>    <!-- the called play on the court (extends the Director) -->
<script src="js/match/rebound.js"></script>  <!-- rebounds the rebounder really gets to (extends the Director) -->
<script src="js/match/debugdraw.js"></script> <!-- the coach's debug view (the D key in a live game) -->
<script src="js/match/playdraw.js"></script> <!-- the called play's paths on the court (the O key) -->
<script src="js/match/view.js"></script>
<script src="js/match/debug.js"></script>    <!-- animation debug tools and meters (Shift+D) -->
```

(`defense.js`, `offense.js`, `plays.js` and `rebound.js` read `js/core/playbook.js` and `playcall.js` when they are
loaded; the headless audits load the same files in the same order, `tools/audit/load.js`.)

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
| `arena.js` | far + baseline stands built row by row (risers, treads, seat backs, aisles), sprite-atlas crowd (44 looks × 10 poses, home colours weighted, idle motion; between plays each fan sits his own way, hands in the lap, a drink, a lit phone, arms folded or leaning in, the keen ones clap when something happens, and the building stands and cheers on big plays), courtside seats, animated LED ribbon + baseline boards, hanging jumbotron with live score/clock (its screen rectangle is kept so the TV graphics can keep clear of it), vignette |
| `hoop.js` | stanchion (team-colour padding), glass backboard with shooter's square, shot clock with live digits, rim front/back halves (drawn around the ball), verlet-cloth diamond-mesh net (12 strands x 7 knot rows, pushed and dragged by the ball, anti-whip top), breakaway rim that tips under a hanging dunker, rim wobble; `snapshot`/`restore` for replays |
| `rig.js` | 3D skeleton: segment lengths from height and wingspan (Drillis & Contini legs and trunk; shoulder joint at the glenohumeral centre ~0.80 H and ANSUR / MakeHuman arm segments 0.172 / 0.152 / 0.112 H at a 6'6" reference; longer legs and a relatively smaller head the taller the player, arms from his wingspan: `Tune.body`), build/weight thickness, pose channel vector (degrees → radians), joint ranges from `Tune.limits` (each spine and neck joint on its own, easing into its end), forward kinematics, analytic two-bone IK for legs (planted and stepping feet with the knee over the toes by a pole solve, soft near full extension; toes bend up at the ball instead of going through the floor) and arms (hands on the ball; limit-aware shoulder solution; partial weights blend the wrist position, round the shoulder where a straight path would pass close by it, Trial 10, or between two wrists both near full reach, Trial 9; a nearly straight animated arm takes its elbow pole from its own hinge, Trial 9; soft near full reach on the dribbling arms, Trial 8), `Inert` (inertialization: jumps become a decaying critically damped offset that keeps the old velocity) |
| `poses.js` | key poses: stand, ready, defensive stance, triple threat, shot pocket, set point, follow-through… |
| `hair.js` | hair that moves (see "Hair that moves" below): guide strands simulated every drawn frame on the game's clock (Verlet, global and local shape, follow-the-leader lengths, the skull, face, neck, upper arms and upper back as colliders), the 2D figures' own guides, the knots' frames the 3D renderer skins to; every number in `Hair.CFG` |
| `figure.js` | draws a solved skeleton: every limb is the projected silhouette of a tapered 3D shape with anatomical width profiles (deltoid, biceps, quads, calf…), cylindrical gradient shading, outline, per-part depth sort; tank-top jersey with trim and front/back numbers, baggy shorts with side stripes, socks, sneakers (hull), sleeves, tattoos, heads with spherical-cap hair (15 styles), beards, headbands, faces; hanging hair that moves (`hair.js`) drawn as ribbons through its simulated strands at its own depth; referee shirt stripes; contact shadows; floor reflections |
| `body3d.js` | the 3D people's 39-bone palette (17 rig frames, toes, two bones per finger), bone frames from a solved skeleton with twist split off (upper arm, forearm, thigh), MakeHuman finger layout, signed-distance primitives and a star-shaped mesher (shoes) |
| `body3d_parts.js` | value noise, vertex accumulator, mesh helpers, lofted tubes, basketball shoes around the rig's feet |
| `human_data.js` | generated by `tools/human/build.js`: MakeHuman 1.1 base mesh (CC0), gender and muscle x weight shapes, identity face shapes, skin weights on the palette, finger layout, jersey / shorts cut regions, UV face masks, per-vertex ambient occlusion (ray cast per body part), fitted bind pose |
| `human.js` | loads the data (async inflate), morphs a player's body and face (gender, build, PBC.Identity features), retargets it onto the rig's bind skeleton bone by bone |
| `human_build.js` | dresses and packs a player: skin, jersey and shorts as draped offset layers of the body with clean cut edges and even trim (outlines are distances along the body; the shorts hang from the belly, seat and thighs, the fork sits at the midline crotch and the leg tubes meet there; folds are untangled), socks and sleeves with clean cuffs, hair and beard shells over the scalp / jaw, hanging strands (for hair that moves laid over the body at rest and skinned to guide strands, `rigHair`), eyes, high-top shoes (`body3d_parts.js`); tattoo coordinates with seam copies; the baked ambient occlusion on skin, socks and sleeves (a softened copy on the jersey and shorts); one 44-byte-per-vertex GPU buffer |
| `gl3d.js` | WebGL2 renderer: per-person cells of an offscreen MSAA canvas with the broadcast camera's exact projection, skinning with per-vertex twist fractions in the vertex shader (and the knots of hair that moves as bones after the body's, stepped by `hair.js` each frame), skin (wrap + scatter, two-lobe specular with a pore micro normal in close-ups; baked occlusion dims ambient and fill lights; face colour zones, two-tone lips, hair-stroke brows) / cloth / hair (Kajiya-Kay, clump bumps for coily hair) / eye shading (veined sclera, fibred iris, lid shadow, two catchlights), key-light self-shadows (one 512 px tile per person in a depth atlas, 5-tap PCF), tattoo sleeves drawn procedurally in limb-wrapped coordinates, arena light rig, PBR Neutral tone map; cells composited into the 2D scene in depth order (also posterised in pixel mode) |
| `anims.js` | gait curves (walk/jog/sprint, phase 0 = right foot contact; Trial 5: the arm keys on their own clock, taken a little further round the cycle than the legs' so each arm swings with the opposite leg as the feet place it, backwards about half a cycle round; the trunk's turn on the arms' clock, the pelvis's height and sway on the stride's), gait parameters by speed (cadence, stance fraction, swing lift, reach, step width), stance table, clip format + Catmull-Rom sampler (a key's pose can be a finished channel vector, the jump shot builder's), the shooting arm's key poses (`SHOT_ARMS`, `SHOT_BALL`), chest pass |
| `clips.js` | the action library (see below) and extra stances; the jump shot builder (Trial 9: `jumperDef`, every jump shot, the post fades and the free throw built from the phases in `Tune.shot` and the shooter's own form, `shotForm`, kept per player and contest level, `shotClip`), the free throw routine (`ftRoutine`: dribbles, a spin, a deep breath, per player) |
| `actor.js` | a person: steering as a mass (Trial 4: a push by weight and ratings that builds up at a human rate, brakes harder than it pushes off and eases into the velocity wanted; the facing turns with an angular acceleration, less for a bigger body; a move's root motion followed at a body's push; contacts and knocks inside the same limit; collision avoidance looking as far ahead as two bodies close in 1.2 s) and timed arrivals, braking and cutting shapes (quick braking steps, the braking foot out ahead, a cut pushed off the outside foot, the hips dropping below where they rode and held through the stride), pivoting facing, foot controller (Trial 5: each gait its own signature and every change of gait without a pop: the walk, jog and sprint pose mixed on a spring, a backpedal's steps toes first, a slide's feet on their own side and the crossover step when beaten, a foot lifted late given 0.2 s for its swing, landings easing from the pitch and knee turn they had in the air, a planted heel rising for reach and the planted-leg guard moving the pelvis at a limited rate; gait-phase stepping with predicted landings, heel rise/toe-off with an early toe-off for a foot left out of reach, error-driven stance steps, recovery steps, lateral step-slide that never crosses the feet, toe-first landings), pose layering (stance with blended stance settings → gait → upper-body clip → full-body clip → look-at at a human pace → inertialization), the spine as a chain (lumbar and thoracic joints share each bend and twist), the planted-leg guard (a hip never passes its range: the pelvis goes over the foot, a heel rises or the toes lift, a strained foot steps, aimed where the body will face as it lands, Trial 8), swinging feet kept out of the floor (clear of it by ~1 in at mid-swing, Trial 8), pivots on the ball of the foot with the heel up (in a move too: a planted foot the move turns the hips more than 30 deg away from pivots with them, the merge with the gameplay AI branch), heel-to-toe walking and forefoot sprinting, landings aimed inside the leg's reach and planted where the leg put them, a pelvis that comes back up on a spring and never jumps (Trial 4: the pose's own height inertialized, the legs' reach pulling it down no faster than a body crouches, past that the heel up and then a quick step), dribble arm (Trial 8: the palm put on its spot every frame by damped Newton steps on the wrist target, the carry out of a hold with the palm sliding over the ball, the off arm between the ball and the nearest defender, the body's turn predicted for the dribble's plans, the chest turning back after a ball coming up behind the shoulder; merged in: moves in place with the weight and shoulders in them, a reach at the ball answered by an urgent move and the off arm up as a bar toward the reaching hand), ball grips (smoothed around the ball, pre-reach for catches), the catch (Trial 10: the hands up as a target from the moment a pass is coming, the eyes on the passer then the ball, the body turned to a pass in the air, the hands set where it will be caught before it arrives and onto its path at the last moment, a step to meet it standing, the give into the hold; the passer's palms kept on the ball through the windup), pelvis reach clamp, momentum carried into clips |
| `ball.js` | ball states (held with hand-over tosses, dribble synced to gait (Trial 8: at real gravity, the period met by bisecting the catch speed and the floor giving back FIBA's restitution; relaxed and high open, low and quick with a defender up close, the ball back and in; moving, a bounce every one or two steps steered onto the landing of the inside foot; the crossover, between the legs, behind the back, in and out, hesitation, retreat and spin as variations of the same cycle, each timed to a footfall, one after another through one queue (a combo, `dribbleCombo`, from hand to hand; an urgent one, away from a reach, goes first); in the air straight across the floor between spots fixed in the world, chosen against where the legs will be), flight as exact time-parameterised ballistic segments, loose bounces/rolls); passes (chest/bounce/lob…: Trial 10, planned as the passer's push begins and flown as a ballistic path with drag from the release to where the receiver's hands will be, never steered onto them; a catch keeps part of the ball's speed and gives with it into the hold; a dribble asked for as a pass is caught waits until the catch is secured), shots (swish / rim-in, some rolling around the rim / bank solved off the glass / miss front-back-side-board with rattles, carom timed to the rebounder, blocks); air drag on shots and passes, floor bounces with restitution by impact speed and spin-aware friction, rolling resistance, bounce passes solved for a real bounce; spin with rotating seams, squash, shadow |
| `aim.js` | `Match.Aim`: where a shot's ball crosses the rim's plane and the angle it comes down at, from the shooter's own arc and habits, the hand in their face and their confidence, its scatter set so that it goes in as often as the engine said it would, drawn given the result; the ring's and the glass's geometry for a ball coming down on a line, the odds a touch of the ring goes in, words for the debug view (see "The shot at the rim" below) |
| `choreo.js` | `Director`: possession → beats (a receiver caught on the run or into a dribble faces the way they are going after the catch, not the passer; Trial 10: a pass planned as its push begins, the passer's step into it, variations and pass fakes, a quick throw's receiver held for the catch). Each event gets a planner that plans backwards from its visible moment, runs the game/shot clock, keeps offense spots moving (one player per spot; lanes filled up the floor), man/zone/press defense tracking, closeouts, box-outs, refs, FT lane setup, subs, timeouts, tip-off, turnovers, GIM freeze/resume, watchdog |
| `defense.js`, `offense.js`, `plays.js`, `rebound.js` | the gameplay AI (docs/GAMEPLAY_AI_PLAN.md), each extending the `Director` after `flow.js`: man-to-man defense (matchups with the engine, the cushion on the ball, closeouts, help and recover), spacing behind the arc and a job for every off-ball player, the called play's alignment, steps, screens and reads, and rebounds (Trial 11: the carom's way off settled as it comes off the rim or the glass and flown on its own, read a reaction later; the rebounder's run and running jump with both hands on the ball at the top of it and the ball chinned; a long carom caught on the run; a loose or bouncing ball run down by `runDown`, the gather planned on the ball's own way, caught at a bounce or picked up; a free ball coming into someone's trunk or head comes off them, `ballBodies`) |
| `debugdraw.js`, `playdraw.js` | the coach's debug view (each player's job and target, the play's steps and reads; its panel moves clear of the animation tools when both are open) and the called play's paths drawn on the floor |
| `flow.js` | Half-court flow on top of the `Director`: off-ball actions by offensive system (screens away, basket and backdoor cuts with a teammate filling the spot, lifts and drifts on drives, weak-side exchanges, bigs flashing / sealing), handler probing, and ball swings between engine events that always return the ball to the player the next event needs |
| `lab.html`, `js/lab/lab.js` | the Animation Lab: one player on the game's own animation code, seeded scenarios for every move, play at any speed, pause and step frame by frame, four views at once (front, side, back, above) or a 360 orbit, overlays for foot locks and slide, gait phase and duty factor, joints at their limits, skeleton, onion skin; a copyable report replays the exact frame; the Gaits group scripts six changes of gait (Trial 5); the Dribbling group has a dribble with a defender up close, the in and out, the retreat and a dribble out of a catch (Trial 8); the Passing (two players) group has every pass kind and variation, from `passlab.js` (Trial 10); the Shooting (the shot lab) group every shot, from `shotlab.js`, with the hoop drawn (Trial 9); the Rebounds, blocks and steals (the glass lab) group, from `glasslab.js` (Trial 11) |
| `shotlab.js` | the shot lab (Trial 9): 25 shooting scenarios (two shooters' forms, spot-ups and catch-and-shoots, the pull-up, step-back, fadeaway and post fade, open against contested, two free throw routines, layups from both sides and a lefty's, the reverse, floater, hook, one- and two-foot dunks, putbacks, a tip and an alley-oop), staged the way the `Director` stages a shot, with a hoop; loaded by `lab.html` and `tools/audit/shot.js`, not by the game |
| `glasslab.js` | the glass lab (Trial 11): 15 scenarios (misses off the rim and the glass taken by either side, a long rebound, a weak-side carom, three box-outs at once, a miss nobody gets to in the air, a tight, a contested and a rim contest, a block at the rim and one on a jumper, a poke steal, a picked-off pass, a reach-in) staged with the engine's own events through the `Director`'s beats; loaded by `lab.html` and the headless audits (`tools/audit/glass.js`, `tools/audit/chase.js`), not by the game |
| `passlab.js` | the pass lab (Trial 10): 22 two-player passing scenarios (every pass kind and variation, standing and on the move, catches into a dribble and into a pass, passes back and forth), staged the way the `Director` stages a pass; loaded by `lab.html` and the headless audits (`tools/audit/pass.js`), not by the game |
| `view.js` | `PBC.Match.View` (public API), sub-stepped simulation, depth-sorted rendering (3D players by default, `opts.models = '2d'` or low quality for the 2D figures), subs bookkeeping, referee positioning, body contact (Trial 4: bodies push apart through their velocities, a spring and damper on the overlap inside a body's limit and a harder push for a deep one first; two about to run into each other by accident ease off, a move running at a man bends away while the man brakes; never moved apart in one step), pixel mode |
| `viewer.js` | turntable/filmstrip used by the harness animation viewer |
| `mock.js` | mock league context + endless contract-shaped possessions (every event type, GIM) + `resolvePending` |

`match_test.html` (project root) is the harness: mock or real-engine game, pause, 1–16×, forced play type,
camera preset, pixel mode, names, low quality, women's league, GIM auto-resume, and an **Animation viewer** mode
that shows one player (any look, or a referee) on a turntable cycling through every clip, gait and stance.

## Hair that moves (`hair.js`)

Longer hair (ponytails, long hair, braids, locs, twists, bobs) is simulated every drawn frame: a few guide strands
per player (the ponytail is one, the other styles 8 to 10, ten knots each in 3D; the 2D figures 7 or 8 of eight
knots), and every other strand follows them.

* The simulation (Müller et al. 2012, "Fast Simulation of Inextensible Hair and Fur", the way AMD's TressFX does
  it): Verlet with gravity, a little air drag and a damping of the swing against the head's own motion (a sprint
  does not blow the hair back like a gale, a swing dies out); the global shape (each knot pulled toward where the
  style puts it, strongly at the root, hardly at the tip); the local shape (each segment eased toward its rest
  angle to the one above: locs and braids bend like ropes, not string); follow-the-leader lengths with their
  velocity correction; collisions with the skull and the face (spheres), the neck and the upper arms (capsules)
  and the upper torso (a box with rounded edges on the chest), a knot that hits slides.
* Substeps of at most 1/60 s, and short enough that no knot (at the speed it has) or elbow moves more than ~5 cm
  against the head in one: a hard stop from a sprint carried the hair through the neck and the back in a single
  step. The body's colliders move through the frame with the hair (at 4x play, a whole frame ahead of it, the back
  pushed the braids out through the wrong side), and a velocity is rescaled whenever the substep length changes
  (Verlet keeps it as the last step's displacement: a swing pumped up at every change).
* The clock is the game's: `view.js` passes the moment drawn (between the last two steps as they are blended, a
  replay's own moment), so the hair runs at the game's speed and freezes with it (a GIM, a pause). A gap longer
  than 0.25 s, time going back, or the head moving further than 1.5 ft + 30 ft/s of the frame (a replay, a scrub,
  a player placed) starts it again at rest. The simulation is kept per person (`pp.a`; a replay's ghost passes its
  actor).
* 3D (`human_build.js`, `gl3d.js`): the mesh's hanging strands are laid over the body at rest against the same
  colliders, measured on the mesh (the neck's and the upper arms' radii, the chest box over the jersey, a sphere
  fitted to the scalp and one to the face and jaw); a few become guides (the strand furthest back first, then each
  furthest from those taken), and every strand is skinned to its two nearest guides' knots: ten bones a guide after
  the body's 39 (at most 100; the bone texture is uploaded only as wide as someone's bones go). A strand follows its
  guides the way TressFX's follow hairs do, moved with their knots with its offset from them kept on the head's
  axes (turning the offset with each bend of a guide threw strands a few cm off it into zig-zags); a ponytail, its
  own guide, turns with it. Hair that moves takes no velocity sway (`uSway`), and a cell grows to where it swings.
* 2D (`figure.js`): the figure's own guides (`Hair.flatGuides`: from the style and the rig's dimensions, draped over
  a standing body) drawn as ribbons through the simulated knots, a part of the figure at the hair's own depth
  (behind the head and the back while the player faces the camera, over them when they face away).
* Tuning: `Hair.CFG` (the per-style stiffness, damping, reach, collision radius; the body's shares of the height
  for the 2D figures; substeps). `Hair.CFG.on = false` keeps the hair still at its rest shape.

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

Actions: `jumpshot` (catch-and-shoot, one motion), `jumpshot2` (two-motion: the ball set over the forehead
before the legs drive; fixed per player, about one shooter in four, one in two from 6-9 up), `pullup`, `stepback`, `fadeaway`, `postFadeL` / `postFadeR`, `freethrow`
(the jump shot family and the free throw are built per player from `Tune.shot` and the shooter's form, Trial 9), `ftSpin`, `ftBreath` (the free throw routine), `layup`, `reverse`,
`floater`, `hook`, `dunk` (one hand, rim hang), `dunk2` (two hands), `alley`, `tip`, `putback`, `putbackDunk`,
`rebound` (grab at the apex, chin it), `contestUp`, `contestJump`, `block`, `swipe`, `intercept`, `fall`
(taking a charge), `passChest`, `passBounce`, `passOverhead`, `passPush`, `passLob`, `passOutlet`,
`passInbound`, `catch`, `pickup`, `jab`, `spin`, `hesi`, `backdown`, `jumpTip`, celebrations (`fistPump`, `flex`,
`threeFingers`, `point`, `clap`), `dejected`, referee signals (`refWhistle`, `refFoul`, `refThree`,
`refThreeGood`, `refTravel`, `refOut`, `refTimeout`, `refCharge`, `refThreeSec`, `refShotClock`, `refToss`,
`refTech`, `refDef3`, `refEight`, `refBackcourt`).
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

* Motion audit (scratchpad harness over real possessions, 60 fps): body interpenetration between players
  (torso or pelvis centres closer than 1.1 ft) went from thousands of pair-frames per stretch of play to ~1
  after the chest-aware separation with a hard floor and contact velocity; held-ball frames with the ball more
  than 0.9 ft from both hands dropped from ~19 % to ~8-11 % (the rest are pickups and the official's jump-ball
  hold); ball frames off screen during live play 1.2 % (only deliberate dead-ball shots).
* Dunk check: the ball peaks 10.2-11.5 ft within ~1.5 ft of the rim for every dunk clip (hands carry the ball
  when an overhead grip is out of reach; the shoulder girdle rises with arm elevation).
* Transition audit (same 20 possessions before and after, deterministic harness): joint jumps over 0.5 ft in a
  frame down 34 %, acceleration spikes down 14 %, the worst hand spike from ~33,000 to ~11,000 ft/s^2,
  planted-foot sliding down 58 %, held-ball frames with both hands away from the ball from 19.9 % to 9.1 %,
  ball jumps from 22 to 10; steady gaits unchanged (peak knee acceleration 250-733 ft/s^2).

* Hair that moves (`hair.js`): a Node harness on the rig's skeleton (standing, a 22 ft/s sprint, a dead stop, a 180
  deg turn in 0.3 s, a jump, 4x game speed; every style): no NaN, no knot left inside the head, a segment at most
  ~6 % (ponytail) to ~30 % (braids, locs) off its length for a frame in the hardest moves (before the substep rule a
  dead stop carried braids through the back, 119 %), back at rest 2 s after a stop and still there (0.00 mm a frame).
  Frame sequences from the 3D renderer (a sprint start, a hard stop, a turn in place) for every style: the strands
  trail and bounce while running, swing round the head on a turn and settle, stay off the face (the face collider)
  and on their guides (the follow strands). In a real game (the women's league, seven players with hair that
  moves, headless Chromium with software WebGL, 30 frames drawn a second): all of them together cost 0.7 ms a
  frame at the median at 1x (95th percentile 2.3 ms, ~3.8 substeps a player) and 1.7 ms at 4x (95th percentile
  4.2 ms, ~10 substeps: each frame is 0.13 s of play there; at 60 frames a second about half). The animation checks
  (`node tools/audit/check.js`): 144/144.

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
* Hair that moves: the strands that follow a guide keep their cross-section on the head's axes, so a strand swung
  flat reads as a ribbon; strands do not collide with each other or with other players, and the 2D figures' ribbons
  are sorted as one part of the figure (a side view can put the whole curtain in front of or behind the shoulder).
  The Animation Lab and the debug tools' orbit view draw people without the game's clock: there the hair moves by
  the page's clock, and in the Lab's four views at once (each its own turned copy of the world) it hangs at rest.

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

## Live Game AI sliders (League Settings)

Seven sliders (0-100, 50 = calibrated) shape how players read the floor and move in the live game; the results are still
set by the engine's own sliders. The director reads them through `Director.sliderK(key, lo, hi)` (0 -> lo, 50 -> 1,
100 -> hi):

| Slider | What it changes |
|---|---|
| Offensive Awareness (`offIQ`) | how often off-ball players act (rest between cuts and relocations), how often the handler probes, how soon a player clears the lane |
| Shoot When Open (`shootOpen`) | when the last pass reaches the shooter in the engine's play timeline (later = catch and fire); timing only |
| Floor Spacing (`spacing`) | how far apart off-ball players keep and how far they stay from the ball (~14 ft at 50) |
| Defensive Awareness (`defIQ`) | how much defenders anticipate their man's movement, how tight help stays |
| On-Ball Pressure (`defPressure`) | the cushion off the ball handler (NBA tracking by distance from the rim at 50) |
| Help Defense (`helpD`) | how far help defenders may sag off their man toward the ball |
| Player Speed (`moveSpeed`) | top speed, first-step push, braking and body turns of every player (0.8x to 1.25x), and the pace the director moves them at; read by the actor (`paceOf`) |

## Movement, handling, the post and contact

* **Strides**: a foot only lifts once the other one is planted, so players never hop on both feet while moving.
* **Shots** (Trial 9): every jump shot (catch-and-shoot one or two motion, pull-up, step-back, fadeaway, the post fades) and
  the free throw are built from phases, each a tunable in `Tune.shot`: the gather, the dip (the ball and the knees down
  together), the rise to the set point, the push and the release near the top of the jump (the elbow under the ball, the
  wrist snapping through), the follow-through held (the gooseneck), the landing absorbed with a slight drift forward
  (`M.Anims.jumperDef`). Each player shoots with their own form (`M.Anims.shotForm`, from a hash of the player's id,
  shooting ratings and height, or a `shotForm` set on the player: speed, release and set heights, elbow flare, jump, dip,
  hold, the release's timing against the top, drift, lean, a leg kick, one motion or two), and a contest shapes it (released
  higher and quicker, leaning away). A catch-and-shoot goes up off the catch (released ~0.5-0.8 s after it) with the
  ball kept in the shot pocket from the catch; a jumper taken straight off the dribble (or from more than
  `Tune.shot.pullUpFromFt` off its spot) is a pull-up, its gather taking the ball up out of the dribble into the dip; a
  jump shot waits for its shooter to get to where it starts (`jumpSlipFt`, `jumpWaitS`) instead of sliding the body
  there, and the ball leaves the hand at the clip's own release. The handler starts no dribble move in the last
  `noMoveBeforeShotS` before the handler's own shot. Free throws have a routine per player (the official's bounce pass,
  none to four dribbles, a spin of the ball, a deep breath), standing tall at the line, and no jump. Layups are gathered
  as the ball comes up into the hand with the zero-step foot down (the ball goes on bouncing until it is; the foot stays
  down until its own step, `zeroHoldS`), then two steps and a one-foot take-off off the foot opposite the shooting hand
  with the other knee driving; dunks one foot (the long penultimate step) or two (a 1-2 into a two-foot take-off), the
  hand on the rim for a moment and a landing absorbed, only for a player whose reach and jump get the hand over the rim
  (`dunkReachH`, `dunkRimFt`; anyone shorter lays it up); the whole arm stays in the vertical plane through the rim.
* **The glass and the contest** (Trial 11, `rebound.js`, `choreo.js`, `Tune.glass`): a miss's carom is the ball's own flight,
  never steered onto anyone's hands. Its way off is settled the frame before it comes off the rim or the glass
  (`settleCarom`: of the caroms a miss like it makes, about its shot's natural distance and off the side it was going,
  the one the engine's rebounder can get to from where the rebounder really is), and a reaction later (`readS`) the players
  near it read it (`readCarom`): the rebounder runs to where it will meet the hands and goes up in a running jump over what is
  left (`travelFt`), both hands onto the ball at the top of the jump (`reachFor`), then it is ripped down under the chin
  with the elbows out; a long carom is caught on the run; one nobody can get to in the air bounces and is run down.
  While the shot is up every defender finds their man and, if the man is coming to the glass, steps back into them, the
  bodies touching (`touchH`), the base wide and the arms out, facing the rim, the eyes going to the ball; nobody boxes
  out a blocked shot or one off the rim before a box-out could be made (`boxMinS`). A contest puts the hand nearer the
  ball up at the shooter's release point (`Actor.releasePoint`), timed to the shot's real release (`whenRelease`), and
  holds it there as the ball goes; at the rim both arms go straight up. A block is a running jump into the shooter's
  face and the hand onto the ball on the shot's own path (`blockHit`), the ball going off the way the swat goes. A poke
  steal or a reach-in swipes only once the ball is within reach (`swipeAt`, `swipeFt`; never in reach, the dribbler loses
  it toward the stealer instead). A loose or bouncing ball, a floor rebound and the inbounder's pickup after a make are all
  run down by `runDown`: the gather is planned on the ball's own way (`gatherPlan`: caught with both hands at a bounce,
  going with a ball moving away, or picked up off the floor, stopped a reach short of it or cut off from beside its way
  when it rolls on) and the ball is the player's only when both hands are on it (`takeGapIn`). Whoever runs at a free ball
  stops a reach short of it (`standOff`: the inbounder after a make, the scramblers on a loose ball); the inbounder keeps
  the ball in their hands until the throw-in, which waits until they are out of bounds and stopped, the receiver kept at
  their spot facing them. On a missed last free throw each lane defender boxes out the man beside them (`laneCrash`). A
  blocker aims at where the shooter's own move has them as the ball goes, once that move is under way. A free ball that comes into
  someone's trunk or head comes off them as a loose ball (`ballBodies`, `Actor.ballHit`, `bodyE`, `bodyMu`). A ball
  handler in the middle of a throw is left to finish it (`ambient`).
* **Passes**: the passer squares to the receiver before the throw; two-hand passes finish with the forearms
  turned in (thumbs down, palms out).
* **Handling**: `Director.handleBall` (flow.js) runs every frame for the dribbler. It moves the ball to the other
  hand when his man gets to the ball side (between the legs or behind the back when close in front), and works
  combos while sizing him up. How often and how fancy follows the `handle` rating. The off arm guards the ball
  toward the nearest defender, as much as the handle rating allows.
* **Catches**: after a catch with time to spare the receiver faces up into the triple threat, pivoting on a planted
  foot (`Actor.pivotTo`) when he caught it with his back or side to the basket; not for a post-up.
* **Post**: a back-down is two or three bumps that knock the defender back; a post jumper or fadeaway is the
  turnaround post fade (`postFadeL` / `postFadeR`); a post finish at the rim starts with a drop step.
* **Contact**: the view's body separation (feet and chest circles scaled by height) also produces impacts when
  bodies meet with speed (`Actor.impact`): each is knocked off his line and off balance by his share of the
  momentum, in the air too, without changing the engine's result. Rim defenders set up in the driver's path and go
  straight up with both arms (`wallUp`).
* **In-between frames**: clip grips are eased from key to key (`Anims.clipGripAt`: a hand moving round the ball goes round
  its surface, a hand coming on or off fades) and a hand held on the ball by IK bends its elbow toward the clip's own
  animated elbow (`armIK.fkPole`), so the arms keep the key poses' shape between keys. The layup, reverse, putback and
  one-hand dunk lift the ball outside the right shoulder with the left hand dropping off below the chin (`LAY.takeoff`,
  `LAY.lift`, grips `layLift`, `layLift2`, `layLiftR`); two-hand dunks, the putback dunk and the intercept take the ball
  up or catch it out in front; the rebound is chinned under the chin.
* **One connected body**: `Actor._bodyTurn` (the hips take about a third of any upper-body turn over planted feet, none
  boxing out, half on defense; while the body turns, the head and chest lead toward where the steering is taking it and
  the hips follow last),
  `Actor._followThrough` (`KChain` lag springs on the spine, neck, head, upper arm and forearm world angles, driven by
  their animated acceleration and the body's own: follow-through and overlap, capped at a few degrees), a weight
  shift over the standing foot on single steps, the hips going with a pass (and giving on a catch), and shoulder-blade
  protraction and retraction in `Rig._arm` (the shoulder joint slides with the arm's reach).
* **Triple threat and lefties**: the triple threat's arms are fitted to the rig (`Poses.lib.triple`, grip `hip`, ball at
  [0.13, 0.2, 0.53] H) and its elbows follow the pose (`armIK.fkPole`); stances with a ball side (`triple`,
  `shotPocket`) are mirrored for left-handers, pose and feet (`stanceOf`, `Poses.lib.tripleL` / `shotPocketL`), and so
  is the pivot (grip `hipL`).

## The gameplay pass: urgency, the dribble's rules, shifty handlers, the boards, the dribbling hand

Asked for by the user: players walked the ball up and moved slowly, double dribbled, rarely jumped for rebounds, the
guards made no space, and the dribbling hand went straight up and down like a paddle.

* **Urgency** (`Tune.urgency`, `Actor.setUrgency`, `Director.start`): in a game every order's speed goes `goalK` (1.22)
  times what it asks instead of the labs' `baseK` (1.1), and a start pushes off harder (`startFtps2` + `startPerFtps` per
  ft/s wanted, against the old 4.5 + 1.8; a defender sliding or backpedalling out of the stance keeps the old one, which
  his footwork was built on). The labs and the audits' scripted bodies keep the old pace, so their scenarios stay what
  they measure. A walked-up ball comes up at `advanceFtps` or more (a jog) to the top of the key (`advanceTopU`) instead of
  being timed to the engine's crossing at the 7 ft/s floor; off the ball in the half court the holds between cuts, lifts
  and relocations are `offHoldK` of what they were and the moves `offMoveK` longer, and the small moves go 9 and 13 ft/s
  (were 5 and 8).
* **The dribble's rules** (`Tune.rules`, `Ball.give`, `Ball.dribble`, `Actor._steer`): a dribble ended into the dribbler's
  own hands is used up until the ball leaves him (a pass, a shot, a fumble): `Ball.dribble` refuses to start it again
  (`rules.ddStopped` counts the tries; `o.free` for a scripted restart), and his feet get `gatherS` or `gatherFt`, whichever
  comes first, to stop (the gather and two steps), then he only pivots (`rules.travelStopped`). A ball that comes to someone
  new is theirs to dribble. The call sites know it too: a jab by a dribbler is a hesitation (the ball kept alive), a
  steal starts dribbling before the stealer runs, a jumper or layup waiting on its approach does not wait on a dead
  dribble, and the "holder dribbles when moving" rule skips a used one.
* **Shifty handlers** (`Tune.shifty`, `Director.shiftyK`, `_perceive`, `defBite` in `defense.js`; `flowHandler` in
  `flow.js`): the man on the ball used to stand on the handler's own spot and speed every frame, so nothing made space.
  He now follows the handler a reaction behind (`lagS`, by how good the handler's handle and quickness are against his
  perimeter defense, quickness and head), and every dribble move the ball makes (Ball tells the Director as its bounce
  starts) sells him the wrong way for a moment: a crossover, between the legs or behind the back the side the ball is
  leaving, an in and out the other side, a spin the way he was going, a hesitation stands him up (he gives ground and
  stops reading the handler's pace). A defender as good as the handler reads it now and then (`readP`). The handler's
  probes are quicker (`probeFtps`, `retreatFtps`, `swingFtps`), a good handler rests less between them (`restK`), sells the
  attack with a hesitation first, and at the turn works a move more often and more kinds of them (`moveP`: in and out,
  hesitation, between the legs, behind the back, the crossover).
* **The boards** (`Tune.glass`, `rebound.js`, `choreo.js chaseCarom`): a contested carom (anyone of the other side within
  `contestFt`, 10 ft, and nearer the rim than `highFt`) is taken at the top of a full jump, the rest with a real jump
  (`midJumpFt` 1.3 ft, was a 0.6 ft hop); long caroms start at `longFt` 10.5 ft (was 9); the carom may hang a little longer
  (`caromT`) so more are taken in the air. The nearest of the other side goes up with the rebounder `contestUpP` of the time
  (within `contestUpFt`) and the next nearest `contestUp2P`, and the crowd under the rim (`crowdFt`, up to `crowdMax`,
  `crowdP` each) goes up for it with a hand at it as it comes off, whether it comes their way or not.
* **The dribbling hand** (`Tune.handle.roll*`, `face*`, `snapDeg`; `palmDir` and `_dribble` in `ball.js`; `_faceBall`,
  `_forearmClear` in `actor.js`): the palm goes round the ball instead of pumping straight up and down on its top, the
  forearm turning in with it (skilled dribblers keep the ball in the hand longer with the forearm's turn and the shoulder's:
  ISBS 2008, "Comparison of the hand-dribbling motion between skilled and unskilled subjects"). The pads take the ball
  coming up on its upper outside (`rollCatchDeg`, a little further back on it, `rollBackCatchDeg`), roll in over the top as
  the hand rides it up (`rollTopDeg`) and push it down from the top (`rollRelDeg`), the wrist snapping `snapDeg` past the
  palm facing it; off the ball the hand swings back out round the outside (`rollArcH`) to the next catch, the palm turning
  from the way it faced at the release to the way it will face at the catch. The palm faces the ball: each frame the
  forearm's turn and the wrist's bend that face it are worked out from the arm as last solved (`_faceBall`, the wrist bent
  back no further than `faceWrFMinDeg`), and if that brings the forearm into the ball (a ball carried down from the chest)
  the wrist flexes on until it clears (`_forearmClear`, `faceClearIn`). Running with it the hand stays behind the ball: the
  catch rolls less (`rollFastDeg`) and the palm keeps more of the old pitch (`faceFastK`); a move from hand to hand is
  taken as it always was (`rollMoveDeg`) and an in and out's palm on the inside of the ball faces mostly down
  (`rollInDeg`, `rollInFaceDeg`). `faceBall: false` gives back the old fixed forearm (palm down) and wrist schedule.
* **Measured** (one real-engine quarter each of seeds 7 and 21 headless, the old code against the new): double dribbles
  that got through 33 and 25 against 0 (the rule stops the tries; the AI's "dribble when moving" no longer tries a used
  dribble); moves that sold the man on the ball 0 against 129 and 192; players going up at a carom 5 against 25 and 32
  (the rebounder's own jumps 4 and 3 against 5 and 6: many caroms still come down far from the engine's rebounder, 13 to
  22 ft away, and are run down off the floor or caught long); the handler bringing it up 9.3 and 10.2 ft/s against 10.9
  and 12.2, walking it 21 and 17 % of the way against 16 and 8.5 %; off the ball in the half court 5.0 and 5.4 ft/s against
  5.5 and 6.1, at a jog or faster 34 and 37 % of the time against 39 and 45 %. The handle audit (`tools/audit/handle.js`,
  14 scenarios): every contact on the ball, the ball through nobody, no hand or elbow pops but the spin's (fewer than
  before), on four other random states as well; the gauntlet (`tools/audit/check.js`) 144 of 144.

## The second gameplay pass: the rebounder, the lines, reading the defense, outlets, quicker jumpers, denial, the catch

Asked for by the user: the player the engine gives the board to rarely jumped for it, everyone off the ball still moved
below NBA pace, dribblers went out of bounds with no call, a handler with his man beaten behind him neither shot nor drove,
every outlet pass connected, the jump shots were slow, pass receivers were not ready for the ball, the off-ball defense
never took a pass away, and an open player did not look to score.

* **The rebounder goes up** (`Tune.glass.anticipate*`, `pullFromFt`; `Director.anticipateCarom` in `choreo.js`): the
  engine's rebounder further than `anticipateFt` from where the miss is planned to come down reads the shot and goes there
  `anticipateS` after the release, a step past the spot, facing the rim, instead of boxing out a man 20 ft away or crashing
  straight at the rim; he is left out of the box-out and crash lists. A carom is pulled toward him only when he is further
  than `pullFromFt` (15 ft, was 8) from every natural landing spot, since nearer he now gets there himself.
* **Off-ball pace** (`Tune.urgency.offHoldK`, `flowRestK`, `flowSpeedK`; `flow.js`): the holds between cuts, lifts and
  relocations are 0.4 of what they were (0.5 after the first pass), the half-court flow's rests `flowRestK` of each
  offense's own and its legs `flowSpeedK` quicker than written.
* **The lines** (`Tune.rules`; `Actor._steer`, `Actor._lineAware`, `Ball._inLines`, `Director.liveBall`): a dribbler's spot
  is kept `lineFt` inside the sidelines and baselines; a man with the ball, the ball in play, brakes in time to stop `stopFt`
  inside them (the part of his run toward a line held to what he can still stop from, on `brakeK` of his brake begun
  `brakeLagS` late, since a sprinter only brakes on a plant); and a dribble's bounce is kept `ballFt` inside them (the lines
  are drawn outside the playing floor, so a ball that lands on one is out). None of it applies while the ball is dead (a
  throw-in's set-up, a free throw, a foul, a timeout, a substitution: `liveBall`) or when the engine calls the dribbler out
  of bounds (`oobOK`: he now carries the ball to the nearest line and over it, the whistle as his foot comes down there,
  instead of the whistle going wherever he was). The sources of out-of-bounds dribbles were closed too: the handler's
  wander about a corner spot went past the baseline (`handlerAmbient`); a set play's alignment took the inbounder, still out
  of bounds with the throw on its way, for the handler and set him dribbling on the sideline (`plays.js pbAlign`); a poke
  steal could knock the ball toward a line (`Director.inCourtAngle`: its first `looseInFt` stays inside), a loose steal ball
  still going for a line dies short of it, the stealer is kept on the chase for as long as it runs (the steal's own 4 s hold
  ran out first and the defense sent him after his man, who was walking off the floor), and the chase's planned point stays
  within a few steps of the floor (`rebound.js runDown`).
* **Reading the defense** (`Tune.reads`; `P.readOpen` in `flow.js`, `Director.retime`): every frame the man with the ball
  knows how far the nearest defender is and whether his own man is still between him and the rim. Open (`openFt`) or past
  his man, and his own shot or attacking move (a drive, a hesitation, a crossover, a spin) is the engine's next play, it
  comes now: the beat is brought forward (`pullLeadS`, `moveLeadS`, at most `pullMaxS`; the game clock runs a little quick
  meanwhile). Past his man, or wide open (`wideFt`) inside `wideRangeFt`, with something else next (a set, a play's step, a
  screen coming, his own pass a while off), he attacks the gap: a drive at the rim to `attackStopFt`, and the next play
  (usually the kick-out) goes from wherever it leaves him. Not with the ball dead, in a push, on a path of a play, out of a
  used dribble, or with a play of his own due within `attackClearS`. The engine still decides every result: the court can
  only change when and from where.
* **Outlets can fail** (`Sim.K.outletTO`, `outletTOProb`, `outletTurnover` in `sim.js`; `p_turnover`): an outlet after a
  defensive rebound or a steal is now a turnover `outletTO` of the time, more with a poor passer and against a defense that
  steals and gambles (0.8 to 12 %), stolen by a defender or thrown away; the other turnovers were trimmed (`to`, `toW`) so
  the totals stay where they were. The court throws the bad pass at the receiver the engine named.
* **Quicker jump shots** (`Tune.shot.dipS`, `riseS`, `dip2S`, `set2S`, `drive2S`; the step-back's and post fade's timing in
  `clips.js`): the dip and the rise are shorter, so a catch and shoot releases in 0.47 to 0.50 s (was 0.55; the NBA's
  average is about 0.54 s, its quickest about 0.4 s).
* **Denial** (`Tune.deny`; `denyK`, `guardPos` in `defense.js`; `Actor._armTargets`): one pass away a defender denies as hard
  as the scheme asks (pressure and no-threes all the way, a pack line hardly) and his defense lets him (perimeter defense,
  head and quickness between `skillFrom` and `skillTo`), more on a shooter: nearer his man and further into the lane, with
  the ball-side hand out in it (thumb down, palm to the ball) from `armFrom` of it on. From `giveS` before a pass the engine
  has his man catch (or a swing of the half-court flow to him winding up) he eases back off the lane with the hand down: his
  man got open, and the ball is not thrown past a hand in it.
* **The catch** (`Actor.expectPass`, `Director.start`): a receiver's hands are free for the ball: a box-out's or a screen's
  arms give way to the ready stance as the passer turns to him, and a box-out's stance and contact are not carried into the
  next possession (an outlet's receiver ran the floor with his arms spread from the box-out and took the ball that way). A
  receiver reading the flight and running to meet it was tried and dropped: planned on a sprint, a long outlet came up to
  ~18 ft off. Not running on through a catch spot near a line was tried and dropped too: turned back to the passer in the
  middle of a sprint to the corner, the receiver slowed from ~27 to ~12 ft/s and the ball came ~8-11 ft ahead of him.
* **Measured** (one real-engine quarter each of seeds 7 and 21 headless, two runs of each, unless said; "old" is the build
  before the first gameplay pass): the engine's rebounder went up for his own board 15 times on seed 21 and 8 or 9 on seed 7,
  about 55 % of the rebounds taken (old: 3 on seed 21), and on 13 and 17 misses he read the shot and went to the spot. Off
  the ball in the half court 6.2 ft/s, at a jog or faster 44 % of the time (old 5.0 and 5.4 ft/s, 34 and 37 %); the ball
  brought up at 11.3 to 12.3 ft/s, walked 8 to 14 % of the way (old 9.3 and 10.2 ft/s, 21 and 17 %). The lines, a handler
  dribbling with the ball in play (seeds 3, 7 and 21): dribble bounces on or past a line 0, 0 and 0 (old 3, 3 and 1); planted
  feet on one 0, 4 and 3 of about 1,800 steps (old 15, 21 and 15); the handler's body at worst 0, 3.7 and 0.6 ft past a line
  (old 18, 9.6 and 33 ft: loose balls run down far out, inbounders set dribbling on the sideline). Reading the defense: 11 to
  18 attacks at the gap a quarter (old none), with 0 to 2 of the handler's own shots and 0 to 3 of his attacking moves
  brought forward. Denial: the hand out in the lane in 3 and 6 to 7 % of the off-ball defenders' half-court frames (old
  never). The catch: every pass caught (139 to 161 a quarter), the hands set a median 0.27 to 0.32 s before the ball got there,
  the far hand at the 99th percentile 25 to 38 in off the ball as it was caught (old 11 and 32). Outlets: 0.77 of a team's
  turnovers a game (120 games); the calibration's 1,230 games keep their totals (115.6 points, 14.9 turnovers, 8.9 steals a
  team a game against 115.2, 14.8 and 8.8). The shot lab: a catch and shoot releases in 0.47 to 0.50 s, a two-motion shot
  0.72, a pull-up 0.68, a step-back 0.73, a fadeaway 0.58, a post fade 0.72. Double dribbles and travels that got through:
  none but one travel (the rule stopped every other try). The handle audit (`tools/audit/handle.js`) is identical to the
  first pass's; the gauntlet (`tools/audit/check.js`) 144 of 144.
* **Limitations**: the engine still decides every result; the court only changes when and from where, so a shot or move
  brought forward runs the game clock a little quick until the event's time, and an open man whose next event is a pass
  still passes (after his drive). A loose ball the engine has live is stopped short of the line rather than going out, as
  no out-of-bounds call exists for it. A catch at a run toward a baseline can still put a foot on the line (3 or 4 steps a
  quarter), and a few standing catches from an odd angle (a lob, a whip) are still taken with a hand 2 to 3 ft off the ball
  (as in the old build).

## The shot at the rim: the aim, the arcs, the ways in and out (with confidence, putbacks and quicker finishes)

Asked for by the user: the ball went into the hoop the same way every time; a shooter should have their own arc (high or
flat) and an aim at the rim set by how well they shoot, moved by the defender's hand and by a confidence system to be
built; layups and dunks were too slow; an offensive rebounder open in the paint did not go straight back up with it.

* **Confidence** (the engine: `Sim.K.conf*`; `confBase`, `confSwing`, `confMove` in `sim.js`): every player carries a
  confidence from -1 (ice cold) to +1 (on fire). A game starts from their ego, their clutch rating and how their last games
  went (`p.conf`, carried `confCarry` of it by `Sim.finalize`); each shot moves it by how far the result beat what was
  expected of it (`confShot` x (made - the make's odds): a tough make lifts most, an easy miss hurts most, so it comes to
  nothing on average), a three a little more, a block, an and-one and a dunk on top; free throws, turnovers, steals and
  blocks move it too; a big ego swings further, a worker and a veteran stay level (`confSwing`); it settles back toward
  where they came in over their minutes (`confTau`). It moves the make's odds (`confMake` on the logit, a free throw's
  `confFtMake`) and how much they look for their shot (`confUse`); the play-by-play notes a player heating up or going
  cold, the live on-court and coach rows show a fire or ice tag. The old hot-hand counter (it only ever added) is gone;
  the zone adjustments (+0.02) and the shot time (+0.8 %) keep the league's scoring and pace where they were.
* **The aim** (`Match.Aim`, `aim.js`; `Tune.aim`; `Director.shotAim`, `handInFace`): as the ball leaves the hand, where it
  will cross the rim's plane (a depth along the shot, + long, and a lateral offset, inches from the middle of the ring) and
  the angle it comes down at. It is a scatter around the shooter's own aim point: their arc (`arcDeg`, drawn per player,
  a good shooter pulled toward `arcGood`; shot to shot `arcSdDeg`, steadier for a pure shooter), their habits (short or
  long `depthBiasIn`, left or right `latBiasIn`; a flat shooter long and a high one short, `flatLongIn`; left-right tighter
  than depth, `latRatio`), the hand in their face (the nearest defender's hand at the release: the scatter wider, above all
  in depth, the shot shorter and higher, `hand*`; tracking data has a tight contest's depth varying ~56 % more and its
  left-right ~38 % more) and how they feel (the engine's confidence: a cold shooter short, a hot one long, `conf*In`). The
  engine has already said whether it goes in and how likely that was (`ev.pm`, now on every shot and free throw): the
  scatter's size is solved so that the shot goes in exactly that often (`spreadFor`, capped at `sdMaxIn` so a poor look is
  still a shot at the rim), then the shot is drawn from it given the result. So a pure shooter's makes are mostly clean and
  their misses near misses; a poor or rushed shooter's makes come off the rim more and their misses are bigger. A miss is
  drawn off the part of the rim its rebound (planned first, `planRebound`) can come off (`fit`): never across the ring from
  a touch on its outside, never up from under it.
* **The geometry** (`Aim.touch`, `pIn`): a ball (4.7 in) coming down at the entry angle clears the ring (18 in inside, a
  5/8 in tube) when its line stays a ball's radius and the tube's off the tube all the way through: at 45 deg the middle
  ~4.4 in of depth and ~8 in across, at 35 deg ~1 in of depth, so a flat shot has far less room. A touch of the ring goes in
  with odds falling off with how far its centre crossed from the middle, later off the back of the ring than the front
  (`in50In`, Noah Basketball: a shot ~2 in long of the middle is the best, a short one the worst); a long one can meet the
  glass first; one that touches nothing and comes down outside the ring is an air ball.
* **The arcs** (`Ball._shootAim`): the flight's time is solved so that it comes down through its crossing point at its
  entry angle, with the air's drag: from the top of the key a 40 deg shooter's ball tops out at ~14.5 ft and is in the air
  1.12 s, a 45 deg one ~15.4 ft and 1.22 s, a 51 deg one ~16.7 ft and 1.34 s. Floaters come down at ~60 deg, hooks ~52,
  layups and putbacks ~61, tips ~63 (`floaterDeg`, `hookDeg`, `layupDeg`, `tipDeg`).
* **The ways in and out** (`Ball._firstTouch`, `_caromOff`, `_clearOfRim`): what the ball meets on its way in is found on
  the flight itself (the ring's tube or the glass, at 1 ms steps). A make that touched nothing goes on into the net; off the
  back iron it hops up and back (higher the harder it came in) and drops through, now and then onto the front of the ring
  first; off the front a short hop on and in; off the side (or now and then either) it rolls round the ring and falls in
  (`rollP`); off the glass first it comes back down off it and in. A miss comes off the ring or the glass to where the
  rebound is taken; one that nearly went in (`inOutPIn`) can roll round the ring to the side it comes off and out (in and
  out, `inOutP`); off the front or back, a near miss can rattle (the choreographer's draw, as before). Every carom is checked
  against the ring and the glass: one that would go through the tube, drop through the ring or into the glass pops up off
  the ring first and out over it on the rebound's side. A ball touching the ring settles onto its ride round it rather than
  jumping there (`ORBIT_SETTLE`).
* **Through the net** (`Ball._throughNet`, `NET_OMEGA`, `NET_DRAG`): a make goes on into the net at the speed it came through
  the ring (it used to stop dead at the rim and drop from there): the cords pull it back to the middle (a critically damped
  spring) and drag its fall, so a clean one drops out of the bottom ~0.15-0.2 s later; the cloth net is pushed by the ball
  as before, so a flat shot bellies the back of the net and a steep one pulls it straight down. A dunk's net pass starts where
  the throw-down ends.
* **Free throws** (`p_ft`): the same aim, from the shooter's own arc and habits and the engine's odds (`pm`, `conf` on the
  `ft` event), nobody's hand.
* **The debug view** (the D key): an AIM read for every shot (where it crossed, how it came down, how it went in or out, the
  look's odds, the scatter, the hand, the mood), and for a few seconds after it a small rim from above: the shooter's
  scatter (one and two spreads), this ball to scale (green in, red out), their last shots, the glass.
* **Quicker finishes** (`quick()` in `clips.js`): the layup, the reverse, the dunks and the putbacks played through a time
  map that keeps the jump's airtime (true to gravity) and takes the time out of the gather and the steps, the rear foot
  still leaving the floor ahead of the take-off: releases from the start of the move, layups 0.83-0.9 to 0.75-0.78 s, the
  reverse 0.92 to 0.8 s, the one-foot dunk 0.95 to 0.82 s, the two-foot dunk 0.95 to 0.85 s, putbacks 0.62 to 0.5 s; the
  dunk's ball starts up the outside through the last step, so the swing overhead is not all left to the take-off; the
  joint pops no more than before (dunk 19 to 16, the two-foot dunk 13 to 9, the reverse 24 to 18).
* **Putbacks** (the engine, `rebound()` in `sim.js`): an offensive rebound near the rim goes straight back up far more
  often (10 % plus up to 62 % by how near, more for a big and a good finisher, less off a free throw: 5 to 85 %).
* **Putbacks on the court** (`nextBeat`, `Tune.shot.putbackGoS`): the shot straight after its shooter's own offensive
  rebound goes up as soon as its move can be ready (plus 0.1 s), whatever time the engine gave it; the clock runs a little
  quick meanwhile. From the rebound in his hands to the ball leaving them: 0.87 s at the median in real games (it was
  1.37 s), and no post move first (`p_shot`: a putback is straight back up).

### The loose ball: go and get it

Asked for by the user: after a rebound hit the floor, players stood and watched the ball roll instead of going after it.

* **Run down flat out** (`Tune.glass.chaseK`; `arriveTime`, `gatherPlan`, `runDown` in `rebound.js`): the rebounder goes
  at a loose ball at a sprint, onto where it will be, caught at a bounce between the knees and the chest
  (`gatherCatchLoH`) or picked up off the floor once it is below the hips (`gatherPickHiH`), stopped on the spot a moment
  before the bend (`gatherEarlyS`, `gatherPickStopK`).
* **Where it goes** (`floorDistK`, `floorOthersK`): a carom to the floor is sent where the engine's rebounder is nearest
  against everyone else, from a few distances out, so the man who gets it is the one who can.
* **Fought for** (`Director.scrambleLoose`, `scramble*`): the two nearest of each side within 16 ft go after it too, onto
  the ball a moment ahead of where it is, a step behind the engine's rebounder (so they are right there when he takes it)
  and never on top of him.
* Measured: from the rim to the ball in someone's hands, 2.95 s at the median in real games before, 2.03 s after; the
  chase audit's 40 random loose balls all taken, 2.58 s at the median (it was 3.0 s); the gauntlet's 16 all taken by hand.

### The dribble breakdown: the size-up and the burst

Asked for by the user: a way for the ball handler to size his man up and break him down, then blow by for a layup, a drive
and kick, or a shot.

* **The size-up is a combo read move by move** (`Director.comboPlan` / `comboNext` / `comboDone`, `Ball.dribbleChain`,
  `Tune.combo`; it was a string drawn from a table, `Tune.shifty.sizeUp`): the handler makes a move, reads his man, and
  picks the next one. His man bought it: the counter straight back the other way (a crossover, between the legs or behind the
  back goes back to the side he just left), or a change of pace (a hesitation, an in and out) now and then. His man read it:
  a change of pace or an in and out, and a sharp man who has read two is left alone. A chain is 1 move for a 45 handle to 5
  for a 90 (`maxMoves`), never past the attacking move the engine has next; a shifty handler sizing his man up in flow
  (`handleBall`) strings a second move on the first 30 % of the time. Research: a move is set up by the one before it
  (Hardaway's between the legs one way and the crossover straight back; Iverson's fakes to get the man leaning).
* **His man's weight** (`defBite`, `pc.wob`, `Director.wobble`): each move he buys pulls his weight the way it sold him
  (`leanK` x the bite, ft), settling back with a time constant of 1.5 s for a stiff defender to 0.7 s for a sharp one
  (`leanTauS`, by agility and head). A move back against the way it went, the counter, sells him up to 60 % more and knocks
  him harder (`counterK`, `counterKnock`): the change of direction with his weight already committed is what breaks him
  (research: the ankle breaker's biomechanics, the center of mass outside the base of support). A big bite still knocks him
  off balance as before (`biteKnock`).
* **Broken** (`Director.ankleBreak`): his weight gone past `breakFt` (2.4 ft against a man the handler is much better than,
  3.6 against a lockdown defender; x the Defensive IQ slider), a stumble step the way it went (`knock`, 7.5 to 10 ft/s) or,
  now and then on a big break against a man the handler is much better than, the fall (the charge's fall clip, `fallP`), and
  for 0.6 to 1.1 s (`brokenS`) he reacts three times slower (`_perceive`) and runs at 55 % (`Actor.slow`); the handler reads
  him as beaten (`readOpen`) and goes. The live view hears of it (an `ankle` event from the court, `Director.emitExtra`): the
  play-by-play line with the moves, the lower third, the booth, the crowd's "oooh" (`game.ankle`), and a replay of it.
* **What the engine decided is what the combo plays out**: the engine has already drawn the handler's look (the contest,
  `openEdge`); the chain reads it (`a._comboLook` from the next shot's `contest` and its `edge`, now on the shot event): a
  look that came out open, his man can be broken sooner (`openK`); tight, his man reads most of the moves (`tightReadP`)
  and the bar is high (`tightK`). No result changes: the combo is how the look happened.
* **The burst** (`Director.breakdown`, `Actor.burst`): out of a move his man bought (or a step on a man he is much quicker
  than), the first steps past him come with a burst: up to 18 % more top speed and 90 % more push for 0.9 s, by how far his
  man was sold and how much better the handler is (`burst*`); his man stays sold a little longer and chases slower
  (`burstHoldS`, `soldSlowK`); a man sold that far counts as beaten for the handler's read (`Tune.reads.biteBeatFt`), so he
  goes now: the layup, the kick to the open man, or the pull-up.
* Measured (3 real quarters): 107 drives, 34 with a burst; his man beaten 0.7 s into the drive on 47 % of the bursts
  against 26 % without one.
* Measured with the combos (three full games headless through the court, seeds 3, 5 and 8; the audit's rows `cb*` carry
  the same counts): 48 to 108 chains a game at 1.2 to 1.3 moves each (the engine's attacking move follows most of them,
  so a size-up reads as two to four moves; completed chains run 1 to 3 moves, by handle), the man on the ball buys about
  two thirds of the moves made at him, 23 to 29 counters a game, and 3 to 6 men broken down a game (every one on a counter
  or a second bought move, none on a single move), with a fall in about one of three breaks before `fallP` was halved.
  The audit's own three games in the browser (`tools/audit/run.js --games 4`, the fourth cut off by the clock): 124
  chains a game at 1.5 moves, 60 counters, 3.7 men broken down, none put on the floor, no script errors, the court's
  score the engine's. The first cut had 22 breaks and 4 falls a game: one bought move at a big mismatch already crossed the bar, and a
  crossover made at the arc with the man 7 ft off counted the same as one squared up inside 3 ft; the bar went up, a move's
  pull was weighted by how close the man is (`wobFt`), and the decay was slowed so a second and third move stack.

### Post moves: working for an opening, with contact

Asked for by the user: players in the paint should use post moves and contact to get an opening to score.

* **Which move** (`Director.postPlan`, `Tune.post`): a post-up with his back to the basket (or a big squared up in the lane
  with his man in front of him) works a move before his shot. It is picked by the finish the engine gave the look (at the
  rim, a hook, the turnaround) and by how open the engine had it come out, since the move is how he got that look: open,
  the fake got his man off his feet or leaning; tight, his man stayed with it and he went up through him. A strong player
  leans to the drop step, a skilled and quick one to the fakes and the spin (x (0.5 + strength), x (0.5 + post craft and
  quickness)). A putback never works a move; a blocked shot never comes off a fake that got his man up.
* **The drop step** (`postBump`, `postDrop`): the ball chinned, a shoulder into his man's chest (`postBump`, the back-down's
  bump: his man knocked back toward the rim, harder for a stronger man, `bumpK` x the strength edge), then the drop step: a
  reverse pivot, the free foot swung back past his man's leg toward the baseline (the middle when his man plays the
  baseline side), the hips ~1.5 ft on toward the rim (`dropFt`), and the seal: his man knocked off the line round the hip
  (`sealK`) and kept there until the finish (`sealFt`, further on an open look). Then up strong off two feet (a power
  layup or, for a big who can get there, the two-hand power dunk), or into the hook.
* **The up and under** (`postPump`, `postStepThrough`, `Actor.stepThrough`, the `pumpFake` clip): squared up to the rim, the
  pump fake (the ball up the shooter's own jump shot line to his set point, the eyes on the rim, the legs kept loaded); his
  man jumps at it on an open look (the contest jump), rises into it with his hands up on a contested one, stays down on a
  tight one; then the step through, the free foot crossing over past his man's hip toward the rim, the ball ripped low
  across the body away from him, the shoulder under him as he comes down (`stepK`), and up under him.
* **The spin** (`postSpin`): a shoulder into his man, then a quick reverse spin off the contact round his hip toward the
  rim (`spinShiftFt`); his man, who was leaning on him, has nothing to lean on: out of his post stance and knocked into the
  space he left (`spinK`, a stumble step), left there a moment.
* **The shoulder fake** (`postShoulderFake`, the `postFake` clip): the head and shoulders snap round over one shoulder with
  the ball, the weight onto that leg; his man shifts to it and leans (`fakeBiteFt`, `fakeLeanK`); then the move goes the
  other way: the drop step into the finish or the hook, or the turnaround over the other shoulder into the post fade
  (Hakeem Olajuwon's dream shake).
* **His man's contest** (`planContest`, `this.postHold`): held off until the move has put the shot up (a little past its
  start, more on an open look), then contests from where the move left the two of them.
* **The body through it** (`Actor.pivotTo` with `dir`, `reverse`, `end`; `Actor.play`'s `ballFromPrev`): the pivots turn the
  way the move goes (a drop step or spin is a reverse pivot, a face-up a front one) and end the hips where the move takes
  them (a turn round one foot of a wide stance alone carried the hips 2-3 ft round it, off the move's way); each part takes
  over from the one before from that part's own pose, ball and hands (a new move used to fade in from the stance's pose,
  the knees ~30 deg and the hands ~0.5 ft off in a frame); with the ball in his hands on the block he stands in `postHold`
  (the post-up's base, the ball chinned, the elbows out).
* **The Animation Lab** (the shot lab, `js/match/shotlab.js`): seven post scenarios, each move on a big posted up on the
  block with his man on his back (the drop step, the up and under, the spin, the shoulder fake into the hook, the dream shake
  into the turnaround, the drop step into a power dunk, the up and under from a face-up in the lane); the debug view
  (the D key) shows a POST read for each move in a game.

### Measured (this pass)

* **The aim** (the gauntlet's 1,600 shots by four shooters from ten spots, flown frame by frame): every flight comes down
  through its crossing point at its entry angle; nothing goes through the ring's tube or the glass, no miss drops through
  the ring, every make does; every way in and out shows up (made: clean, off the back, off the front, rolled round,
  back-then-front; missed: front, back, left, right, glass, in and out, rattled, air ball). A pure shooter's makes are
  clean 55 % of the time against an average one's 33 %, their arc steadier (3.4 against 5.6 deg from the 10th to the 90th
  percentile); a hand in the face brings it in higher (45.1 against 43.7 deg) and shorter (0.49 against 0.96 in); cold
  shooters aim short (0.48 in), hot ones long (1.07 in); air balls 0.9 % of the shots.
* **Real games** (three quarters): jump shots come down at 43.5 / 46.8 / 49.6 deg (10th / 50th / 90th percentile), free
  throws 44.1 / 47.6 / 50.0; one air ball in 88 jump shots; no errors.
* **The rest**: the loose balls, the putbacks, the breakdown and the post moves, as measured in their own sections above.
* **The post moves**: in the shot lab every move plays into its shot and lets it go, the jump shot, hook and dunk checks
  still pass on the shots after them (the turnaround's dip, rise and follow-through, the hook's take-off foot and knee
  drive, the power dunk's hand on the rim), the contact knocks the man 6-7.5 ft/s (the drop step's seal, the spin, the power
  move, the bump before the hook), the pump fake gets him ~1.3 ft off the floor and the shoulder fake leans him; the
  shooter's joint pops are down to about what the plain finishes have (the drop step 60 to 6, the up and under 58 to 12,
  the spin 31 to 7, the fake into the hook 67 to 16). In real games (eight quarters): 22 post-ups got to their shot and 19
  worked a move first (7 drop steps, 6 up and unders, 6 fakes; the spin came up in the earlier runs), with 19 contacts on
  the man guarding them; the nearest defender at the release was 4-5 ft off after a fake on an open look against 2.3-3 ft
  on a contested or tight one; no errors, and the body never moved faster than a sprint.

### Limitations (this pass)

* The engine decides the make, the miss and how open the look was; the court's aim, arcs, ways in and out and post moves
  only show it. The engine does not know which post move was used (the play-by-play still says "hook", "layup"), and the
  post move is picked on the court from the look's kind and contest, not from a rating duel of its own.
* A big pivot (the drop step, the spin, a face-up from the post) still has a foot or knee pop or two as the free foot lands
  (the pivot's own, as the catch's face-up has); the post fade and the power dunk keep the arm pops they had before.
* The up and under goes up off two feet (the standing power layup), never a one-foot layup off the step through.
* A post-up whose shot comes quickly (the engine's time short) drops the shoulder bump, then the whole move, and goes
  straight up.
* The loose ball scramble is two of each side at most; nobody dives on the floor for it.

### Sources

Shot arcs and where the ball meets the rim: Noah Basketball's tracking (45 deg, ~11 in past the front of the ring, left to
right in the middle), its coverage of the science of the swish and the teams using it; Georgia Tech on Noah's arc; the
Spalding smart basketball on arc and accuracy; inpredictable's shot arc analysis; the Journal of Sports Analytics paper on
in-game shot trajectories and defensive impact (a contest's depth and left-right spread, short misses). Confidence: the hot
hand literature (Gilovich, Vallone and Tversky; the later streak mathematics). Putbacks: NBA.com's putback leaders. Loose
balls: Hoop Tactics on loose ball recovery, Coach's Clipboard on hustle. The contest and the shot timing: NBA 2K26's
courtside report. Post moves: Basketball For Coaches (post moves, the drop step, the dream shake), Breakthrough Basketball
(the drop step, power post moves), Hooper University (five post moves), Coach's Clipboard (post play), Jr. NBA (the drop
step layup with a defender), the NBPA's post moves with Bam Adebayo.

## Quicker decisions: the ball does not sit

Asked for by the user: the players have to make every decision faster (take the shot, drive, pass, the layup, the dunk).
Measured first: on the court the catch already went straight into the next thing (0.4-0.5 s from the catch to his first
action, the median 0.07 s); the waiting was in the engine's timelines, which the court plays. After the ball came up the
floor the handler stood with it 4.3 s on average (9.3 s at the 90th percentile) before anything happened, a called play's
steps were stretched out to fill the time to the shot, and a pass came 5.5 s after the catch on average: 1.9 passes a
possession, 4.9 s a touch (NBA tracking has ~2.8 s a touch across the league, the 2014-15 Warriors' 2.4 s the quickest,
and 270-330 passes a game, about 3 a possession).

* **Quick touches** (`flowTouches` in `sim.js`, `Sim.K.flow*`): the time between the ball coming up and the play, and the
  time a play would otherwise be stretched over, is played the way "0.5" teams play it (catch, read, and in about half a
  second shoot, drive or move it on): the ball goes from man to man, each touch 1.0-2.1 s from the release of the pass
  before (so ~0.5-1.5 s in his hands; the Shoot When Open slider makes them quicker still), the perimeter first, the bigs
  less, rarely straight back to the man who just passed it; now and then (`flowDriveP`, x how much of a driver he is) a
  hard drive at the gap and the kick out of it. The chain ends with the ball in the hands of the man the play starts with,
  as the play is called. With room for one touch only and the ball already his, the handler attacks his man with a move
  (a hesitation, a crossover, a drive) instead of standing. The first read comes 0.15-0.5 s after the ball is up
  (`flowLeadS`).
* **Plays at their own speed** (`Sim.K.playStretch`, `playCallS`, `spanMax`): a called play's steps are never stretched past
  0.9 x their drawn length (1.25 before), the call comes 1.4 s before its first step (1.8), and a generated play takes at
  most 4-5 s from its call to its shot; the time before it is the quick touches'.
* **Before turnovers too**: a possession that ends in a turnover moves the ball the same way before it, the ball ending with
  the man who loses it (after a reset, from where the new action starts, so the events stay in time order).
* **Only the live game**: the quick touches are events for the court; the engine draws the shot's time, its kind, the
  contest and the result as before, and the season's simulated games (no events) never run them, so the league's numbers
  do not move.
* **A second knock** (`Actor.impact`): a body knocked again while the first knock still pushed it had that push stopped in
  one step (a jump in his speed, the lean gone in a frame; the quicker ball movement brought one into the gauntlet's first
  minute). The knock under way now plays out under the new one, its push and its lean.

### Measured (this pass)

* **The engine** (16 games, the same seeds before and after): a touch (the catch to the ball leaving his hands) 4.9 s on
  average before, 2.9 s now (the median 2.9 to 1.8 s, the 90th percentile 12.7 to 6.6 s); a touch that ends in a pass 5.5
  to 3.0 s (the median 3.9 to 1.9 s); a touch that ends in a shot, the median 1.2 to 0.6 s. The wait after the ball comes up
  4.3 to 1.9 s (the 90th percentile 9.3 to 2.8 s). Passes a possession 1.9 to 3.9 (touches 3.0 to 5.0), a little more
  than the NBA's most passing teams. The time to the shot is drawn as before (14.7 s and 14.5 s over the 16 games).
* **The court** (a quarter each of two games): a touch 3.9 s on average before, 2.5 s now (the median 2.4 to 1.65 s, the
  90th percentile 9.6 to 6.0 s); a touch that ends in a pass 4.4 to 2.6 s (the median 3.0 to 1.7 s). The catch to his
  first action stays 0.4-0.5 s on average. A touch that ends in a shot is now 1.4-2.1 s at the median (0.8-1.2 s before):
  more of the shots come from the man the play is run for, who gets the ball as it is called and runs it (a pick and roll,
  an isolation) instead of having held it since the ball came up; a catch and shoot is as quick as before (0.5 s at the
  10th percentile).
* **Keeping up**: the court plays 86% of the passes in the time the engine gives them (80% before; the rest 0.75 s over, as
  before). The call of a play, now right after the last quick pass is caught, runs 0.35 s over on average while the players
  go to their spots; over a quarter the court needs about 2% longer than before.
* **Event order**: in four games (844 possessions) every possession's events are in time order but two heaves at the end
  of a quarter (their time drawn ahead of an outlet or an advance, as before this pass).
* **The gauntlet**: 152/152.

### Limitations (this pass)

* The quick touches are the court's picture of the possession: the engine does not count them (no assists or turnovers
  come of them, the box score's passes are not tracked) and the shot's openness is drawn as before, not from how the ball
  moved.
* The ball moves a little more than in the NBA (3.9 passes a possession against ~3): quicker decisions in the same length
  of possession mean more passes.
* The call of a play came as the last quick pass was caught, so the players walked to their spots while it started (the
  0.35 s above); the next pass calls it while that pass is in the air (below).

### Sources

The "0.5" rule (shoot, drive or pass within half a second of the catch): PGC Basketball (pass it or shoot it), KU Sports on
Bill Self's point-five approach, Hooper University (playing point five basketball). Touch time: NBA player tracking
(Wikipedia; NBA.com's touch time splits), Sheridan Hoops on the 2014-15 Warriors (2.39 s a touch, the league's lowest),
Coaching Toolbox on shooting by touch time (an effective field goal percentage of .54 under 2 s against .44 for 2-6 s),
Frontiers in Psychology (touch time and shooting success). Passes a game: PerThirtySix team passing (2024). The release:
the Spalding smart basketball (why release time matters). Pace: inpredictable.

## The open look: no play needed

Asked for by the user: the players got caught up when a play was called; they do not have to run the play when they have
an open look, and with a clear drive to the hoop they should just go get the bucket. Coaches say the same: a player should
know when his man is out of position and can be beaten by forgetting the play and ripping the ball to the rim, and a read
and react team is already set up to go again when an action fails, where a set play has to be set up again.

* **The look before the call** (`lookEvents` in `sim.js`, `Sim.K.look*`): a possession whose look the ball movement finds
  is played as it comes, with no play called: 85% of the open looks (his man beaten, or nobody there), 30% of the contested
  ones, none of the tight ones. The quick touches move the ball until the man who takes the look (or finds it) has it, and
  from the catch he goes: the drive at the rim (the pass to him released 1.8-2.4 s before the finish), the pull-up after a
  hesitation, a crossover or a jab (1.2-1.7 s), the drive and the kick to the open man (the driver has it 2.1-2.8 s before
  the shot), or the swing to the open shooter, who lets it fly (0.55-0.8 s after the catch, quicker with the Shoot When
  Open slider). A pick and roll only when it is the handler's own shot (he goes before the screen gets there); a post-up,
  an off-screen, a hand-off or a cut keeps its call, since the action is what makes the look.
* **Called plays too**: the coach's playbook call is not run when its read was open before it could be (the record keeps
  the play and its read, marked as a look); the coach's own call and a play drawn up in a timeout are always run.
* **A call that does not stop the game** (`pbEvents`, `Sim.K.callPassS`; `Director.p_set`, `assignSpots`, `pbAlign`): a
  called play is called 0.5 s before the last quick pass, to the man who starts it, so the five go to their spots while the
  ball is in the air and his first action comes about half a second after his catch. The ball handler keeps his side of the
  floor (the play's spots mirror to the side the ball is on, where he used to walk across the floor to them), dribbles into
  his spot at a game pace (it was a 9 ft/s walk), and the call no longer holds the play up while he gets there (it waited up
  to 2.5 s, the clock running slow); a pass already on its way to him is not doubled by the call.
* **Swing, swing, attack** (`Sim.K.flowDriveBuild`): the longer the ball has only been swung, the likelier the next man to
  catch it drives the gap (twice as likely after one swing, three times after two).
* **A look passed up** (flow possessions): the ball moves until the man who passes it up has it, instead of sitting until
  then.
* **Only the live game**: the engine draws every shot, its kind, its contest and its result as before; the season's
  simulated games come out exactly the same (checked on nine games against the build before).
* **Loose ends fixed on the way**: a play called with a second left (the end of a quarter) put its read ahead of the ball
  coming up; a last-second heave could be timed ahead of the throw-in or the advance. Both are kept in time order now.

### Measured (this pass)

* **The engine** (4 games, the same seeds, against the build before): half-court trips with no play call 9% to 22% of the
  shots (125 of 578: 46% of the spot-ups, 32% of the isolations, 21% of the pick and rolls; 57 of them open looks, 59
  contested); the call to the first thing after it 1.7 s to 0.8 s on average (the median 1.8 to 0.5 s); the ball coming up
  to the first action of a called play 5.5 to 4.5 s (the 90th percentile 11.3 to 8.7 s). Drives 0.74 to 0.91 a possession,
  runs of five or more passes with nothing else 18% of the possessions to 11%. Over 16 games a touch is 2.8 s on average,
  3.99 passes a possession, the time to the shot drawn as before (14.4 s).
* **The court** (a quarter each of two games): the call ran over the time the engine gave it 34 of 48 times (by 0.4 s)
  and 36 of 49 before; 2 of 37 (by 0.14 s) and 4 of 44 (by 0.22 s) now. A touch 2.5 to 2.1 s and 2.6 to 2.3 s on average
  (the median 1.7 to 1.5 s, 1.6 to 1.6 s). About one shot in six in a quarter comes off a look with no call; a drive's look
  was caught 17-23 ft out and taken to the rim; the moves themselves run a little over the engine's time more often (72%
  of them against 67% before, by 0.38 s against 0.32 s) since more of them come right off the catch.
* **Event order**: eight games (1,622 possessions, 17,481 events) all in time order, the end of quarter plays and heaves
  included.
* **The season's games**: nine simulated games identical to the build before, to the score and every box total.
* **The gauntlet**: 152/152.

### Limitations (this pass)

* The look is picked from the look the engine drew (how open it came out), not from the court's own positions: a lane the
  court opens up by itself (a defender's footwork) still gets the attack to 11 ft and the kick out of it (the reads from
  before), not a finish, when the engine has something else next.
* A called play taken as a look still counts as called in the box score's Plays tab (its read and its result), marked as a
  look in its record.

### Sources

Human Kinetics (six perimeter moves for reading the defense: forget the play and rip it to the rim when your man is out of
position), Breakthrough Basketball (make your opponent react: attack first), Better Basketball (read and react against set
plays), Hoop Tactics (early offense: attack before the defense is organized), Coaching Toolbox (gap drives), NBA 2K's
developer notes and its forums (teammates who would not take an open shot unless a play was run for them).
