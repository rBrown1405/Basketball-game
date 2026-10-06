# Motion capture on our players

Real motion capture, played on the game's own skeleton (`js/match/rig.js`). The procedural layers that make players
react to the game (feet held on the floor, IK, the ball in the hands) stay on top of it.

## The pipeline

1. **A take** comes in as BVH (the CMU database) or FBX (marketplace packs). FBX goes through Blender first (one
   BVH per action, Blender's own importer and exporter): with the app,
   `<Blender> --background --python tools/mocap/fbx2bvh.py -- <file.fbx | folder> <out folder>`, or with bpy
   (`pip install bpy`), `python3 tools/mocap/fbx2bvh.py <file.fbx | folder> <out folder>`.
2. **Retarget** (`tools/mocap/retarget.js`). Our rig is posed like the take's rest pose, with its elbow and knee
   hinges measured from the take itself (where they bend) and the thumbs where the take's are. Every part of our
   body then turns, frame by frame, the way the take's matching joint turned from rest, and the rig's angles are read
   off joint by joint from our own solved parents. Lengths never carry over: the take is scaled to our leg, the
   hips go where the take's go, the feet are put on the floor where the take's are on it, and the frames each foot
   is planted (low and still) are recorded. Which joints are which per skeleton: `tools/mocap/maps.js` (`cmu`, `ue4`,
   `ue5`, `mixamo` (not yet tried on a real file); `auto` reads it off the joints' names; the up axis is read off
   the rest pose).
3. **Pack** (`tools/mocap/pack.js <list.json> <takes folder> <out.js>`): a list of takes (file, name, label, trim)
   becomes a script under `js/mocap/` (30 frames a second, integers).
4. **Play** (`js/match/mocap.js`, `PBC.Match.Mocap`): the pose comes from the frames (cubic between them), the body
   follows the clip's track scaled to the player's height, and each foot on the floor is held where it landed by
   the legs' IK: on its heel during a clear heel strike, on its ball otherwise (pivots turn on the ball), let go over
   `Tune.mocap.liftS` as it lifts. Tunables: `Tune.mocap`.
5. **The ball** of a dribbling clip (`ball: "dribble"` in the pack list): worked out on the player's own body when the
   clip starts. A push is a hand dropping faster than `Tune.mocap.pushFtps` at its fastest; the ball leaves there and
   flies, one bounce at the floor's real restitution for its impact speed (`Ball.eFloor`), to the hand that takes it
   next, `Tune.mocap.catchLeadS` before that hand's highest point, its launch speed solved so it gets there; in
   between it rides a radius out from the palm. The CMU dribbles come out at 10 to 16 ft/s launches and 0.2 to 0.6 s
   flights, the range of real dribbles.

Check a retarget: every bone's direction against the take's (`node tools/mocap/verify.js <take.bvh> [map] [from s]`),
and the Animation Lab's planted-foot slide meter on every clip.

## Convert a pack on your own computer (one command)

For a licensed pack whose files must stay private. Needs Node.js and Blender (the free app from blender.org; or
`pip install bpy`).

1. Get this repository onto the computer (clone it, or download it from GitHub), on the branch with this file.
2. In its folder, run:
   `node tools/mocap/convert.js <folder with the pack's .fbx files> --name animo --label "Animo"`
   It finds Blender (on a Mac at `/Applications/Blender.app`; or pass `--blender <path>`), converts every FBX to
   BVH, reads which skeleton it is (UE4 or UE5 mannequin, Mixamo, CMU), retargets every clip and writes the lab's
   private pack, `js/mocap/private/packs.js`.
3. Run `python3 -m http.server 8765` in the folder and open `http://localhost:8765/lab.html`: the clips are in the
   "Motion capture (Animo)" group.

The clip list it writes (`tools/mocap/private/animo.json`) can be edited (labels, `from` and `to` in seconds to
trim, `"ball": "dribble"` for clips that dribble; file names with "dribble" in them are marked already) and the
command run again; new files are added and the edits kept. If the pack's files are Unreal `.uasset` files, export
the animations to FBX from the Unreal editor first. Nothing under `tools/mocap/private/` or `js/mocap/private/` goes
into git.

## Packs

| Pack | Clips | Source and terms | In the repository |
|---|---|---|---|
| CMU basketball (`js/mocap/cmu_bball.js`, list `tools/mocap/cmu_bball.json`) | 42: dribbling (forward, back, sideways, turns, crossovers, low freestyle, through the legs), shots (set, jump, free throw, layup, crossover into a shot), game-speed moves (spins, go left and right, feints, shot fakes, drives, pivots, tight turns) and defense (slides, zigzag, stop and go) | CMU Graphics Lab Motion Capture Database, mocap.cs.cmu.edu, created with funding from NSF EIA-0196217; free for research and commercial use; BVH conversion by B. Hahne, no added restrictions | yes |
| Animo "Basketball" (Fab), 167 clips on the UE4 mannequin | bought by the owner | licensed: the files and anything converted from them must not be public | **no**: kept in a private repository; this repository is public (`js/mocap/private/` and `tools/mocap/private/` are ignored by git) |

In the lab: the "Motion capture (CMU)" group, one scenario per clip. A licensed pack is packed to
`js/mocap/private/packs.js` (ignored by git), which the lab loads when it is there, its clips in their own group.

## First results (CMU, a 6'6" player)

- Bone directions against the take, 06_14 (crossover then a shot, from 0.3 s): upper arms, forearms, thighs and
  shanks within 0.2 deg (median), 0.7 deg (90th percentile), 4.8 deg at worst.
- The CMU elbows and knees are exact hinges (0.0 deg spread over every bent frame); the elbow's hinge sits 30 deg off
  where a T-pose's is usually assumed, which is why the hinges are measured from the take instead of assumed.
- Planted feet in the lab, every clip (Animation Lab slide meter): under 1 in in 41 of 42; 1.5 in on one push-off in
  the turning dribble. (Before pivots were held on the ball of the foot, the take's few degrees of toes-up on our
  body pivoted that foot on its heel and it slid 6.5 in.)
- One take (06_02) starts with its ankles at their rest angles for 0.7 s (the toes through the floor): frames with
  no ankle rotation at all are skipped by the importer.
- An FBX round trip through Blender keeps every joint within 0.02 units (about a tenth of an inch); a skeleton whose
  bind pose is not a person's neutral posture (Blender rebuilding CMU's zero-length neck bone) moves the head's
  neutral with it, so a new pack's rest pose is checked by eye on its idle.

## Open

- The ball rides with the dribbling clips only; the shots, passes and layups do not release one yet (their release
  frames are not marked).
- In the game itself the players still use the procedural animation; the mocap clips play in the lab only.
