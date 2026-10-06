# Convert FBX animation files to BVH with Blender's own FBX importer and BVH exporter, one BVH per action, for
# tools/mocap/retarget.js. Either with Blender itself (the app from blender.org) or with bpy (Blender as a Python module,
# pip install bpy):
#   <Blender> --background --python tools/mocap/fbx2bvh.py -- <file.fbx | folder> <out folder>
#   python3 -I tools/mocap/fbx2bvh.py <file.fbx | folder> <out folder>
import os, sys

import bpy


def convert(src, outdir):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=src, ignore_leaf_bones=False, automatic_bone_orientation=False)
    arms = [o for o in bpy.context.scene.objects if o.type == 'ARMATURE']
    if not arms:
        print('no armature in', src)
        return []
    arm = arms[0]
    if arm.animation_data is None:
        arm.animation_data_create()
    base = os.path.splitext(os.path.basename(src))[0]
    acts = list(bpy.data.actions) or [None]
    out = []
    for act in acts:
        if act is not None:
            arm.animation_data.action = act
            f0, f1 = (int(round(v)) for v in act.frame_range)
        else:
            f0, f1 = bpy.context.scene.frame_start, bpy.context.scene.frame_end
        name = base if len(acts) == 1 else base + '__' + act.name.replace('|', '_')
        bpy.context.view_layer.objects.active = arm
        arm.select_set(True)
        dst = os.path.join(outdir, name + '.bvh')
        bpy.ops.export_anim.bvh(filepath=dst, frame_start=f0, frame_end=f1, root_transform_only=False, global_scale=1.0)
        out.append(dst)
        print(dst, f0, f1, 'fps', bpy.context.scene.render.fps)
    return out


def main():
    # (run inside Blender, the script's own arguments come after a '--')
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    src, outdir = args[0], args[1]
    os.makedirs(outdir, exist_ok=True)
    files = [src] if os.path.isfile(src) else sorted(os.path.join(dp, f) for dp, _, fs in os.walk(src) for f in fs if f.lower().endswith('.fbx'))
    for f in files:
        try:
            convert(f, outdir)
        except Exception as e:  # one bad file does not stop the rest
            print('failed', f, e)


main()
