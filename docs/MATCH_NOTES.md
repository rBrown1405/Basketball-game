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
