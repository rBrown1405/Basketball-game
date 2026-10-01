# Trial 0: The Audit

Measured on the code at `de8e739` (before the gauntlet), by reading every animation file and by running the real
engine headless for two full first quarters (seeds 7 and 21, about 600,000 player-frames each). The Trial 1 tools
now reproduce these measurements: `node tools/audit/quarter.js --seed 7`.

## How it works (before the gauntlet)

1. **The engine decides, the Director stages it.** `js/core/sim.js` hands over a possession as timed events. The
   Director (`js/match/choreo.js`, `js/match/flow.js`) turns each event into a beat planned backwards from its
   visible moment and tells each player where to go, when to arrive, which stance, what to look at, which move.
2. **Each player steers like a point** with a top speed and an acceleration limit from his ratings, and turns his
   body at a fixed rate (`js/match/actor.js`).
3. **A foot controller walks the body:** a stride clock tied to speed and height lifts each foot and predicts where
   it lands; planted feet are pinned to the floor with heel strike, roll and toe-off.
4. **The pose is a stack of layers:** stance, breathing and idle sway, walk/jog/sprint curves, lean from
   acceleration, upper-body moves, full-body moves (hand-keyed poses on fixed timelines), landing absorb, head turn,
   contact reactions.
5. **IK and cleanup:** legs to the feet (hips drop if they can't reach), arms to the ball or grips, the ball pushed
   out of the body, joints clamped to human ranges, inertialization and lag springs against pops (`js/match/rig.js`).
6. **Render:** the skeleton drives a MakeHuman 3D mesh skinned on the GPU (`js/match/gl3d.js`), pasted into a 2D
   painted arena under a fixed-angle camera that slides along the sideline.
7. **The ball is not simulated:** its path is exact curves planned to end in the right hands or rim spot.

## Keep

Rig (anatomical lengths, analytic two-bone IK, soft IK, elbow swivel limit, arm-through-body avoidance, scapula),
joint-limit table, inertialization, the foot controller (planted ball of the foot measured p99 0.12 in over a
quarter), gait curves with bob, sway and counter-rotation, lean and follow-through springs, contact reactions, the
research doc, the Animation Lab, CPU headroom, the physically solved bank shot and bounce pass, the verlet net.

## Top 10 realism killers (worst first)

1. **The ball cheats.** 1 in 10 catches had the hands a foot or more from the ball on the catch frame; dribble push
   gap p90 4 in; passes steer mid-air with no limit (`ball.js:583-590`); dribble gravity rescaled 0.64 g to 4 g
   (`ball.js:835-840`); scripted rim; airballs through the glass (`ball.js:320`); lost balls out of bounds rolled
   back in (`choreo.js:2226-2227`); the ball swapped 3D/2D renderers at each catch and release.
2. **Dead heads.** Eyes never moved (`gl3d.js:1355`); heads turned sideways only; every shot cleared all ten look
   targets (`choreo.js:1811-1812`); 15.4% of player-frames had no look target.
3. **Canned identical moves, fake gravity.** About 60 hand-keyed clips on fixed timelines; fixed air time with height
   scaled by body height made gravity 17 to 56 ft/s^2 instead of 32.2.
4. **No mass.** 59 to 61% of turns went from still to over 230 deg/s in one frame; about 32 body accelerations over
   1.9 g per player per minute; move starts cut speed to 30% (`actor.js:238`); height and weight unused.
5. **Feet.** Ball of the foot locked, but 10 to 11% of heel and 16 to 17% of toe contacts slid over 1 in (viewers
   notice 21 mm), almost all while a planted foot turned flat on the floor (`actor.js:1056`, `actor.js:1289`);
   swinging toes through the floor in 3.6% of player-frames (worst 16 in). The Lab's meter only watched the ball
   of the foot.
6. **Scripted, psychic team play.** Rebounders ran to the carom at the release; box-outs without contact;
   closeouts without chop steps; contests aimed at the feet; screens a 2 ft step, instant switches.
7. **Bodies drew through each other.** One depth per person (`view.js:734-745`); about 3,000 hand-in-torso frames
   and 123 to 319 torso overlaps per quarter.
8. **One body template, no fatigue, dead dead-balls.** Same proportions and wingspan (1.096 H) for everyone.
9. **Rigid clothes, rubber joints, frozen fingers.** Jersey sway 0.13 in; knees collapse when bent; one curl per
   hand; subs appeared as 2D figures after a 150 to 500 ms stall.
10. **Side-scroller camera, broken replays.** No yaw; replays dropped forearm twist.

## Architecture problems

1. Motion depended on frame rate and playback speed (partial steps, solve at draw time).
2. No committed measurement harness; `test/procanim.js` covered only an orphaned module.
3. No central config (about 3,800 inline tuning numbers in gameplay code).
4. No animation state or labels.
5. No mass model; clips overwrote velocity.
6. Moves were fixed timelines, not generators.
7. Foot contact per foot, not per heel/ball/toe; the same slide bug patched in 8 commits.
8. No shared depth between players.
9. No camera yaw by construction.
10. Missing inputs: body profile, fatigue, gaze, cloth state, off-thread mesh builds and LOD.

## Sources

- Pražák, Hoyet, O'Sullivan, "Perceptual evaluation of footskate cleanup", SCA 2011: https://dl.acm.org/doi/10.1145/2019406.2019444
- Unreal Engine Animation Rewind Debugger: https://dev.epicgames.com/documentation/en-us/unreal-engine/animation-rewind-debugger-in-unreal-engine
- David Rosen, "An Indie Approach to Procedural Animation", GDC 2014: https://www.youtube.com/watch?v=LNidsMesxSE
- Coach's Clipboard, footwork and pivots: https://www.coachesclipboard.net/Footwork.html
