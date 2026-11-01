"""Pose sheet of the v3d extra clips (sit/turn/idle look) from a FRESH GLB import: JumpStart, JumpAir (rise/apex/fall),
RunJumpStart, RunJumpAir, Land, plus a helmet close-up. Workbench, side + 3/4.
Run: Blender -b --factory-startup --python-exit-code 1 -P render_extrasheet.py -- GLB OUTDIR"""
import bpy, hashlib, math, os, sys
from mathutils import Vector
argv = sys.argv[sys.argv.index('--') + 1:]
glb, out = argv[0], argv[1]; os.makedirs(out, exist_ok=True)
sha = hashlib.sha256(open(glb, 'rb').read()).hexdigest()[:12]
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene; sc.render.fps = 60
bpy.ops.import_scene.gltf(filepath=glb)
arm = next(o for o in sc.objects if o.type == 'ARMATURE')
for o in sc.objects:
    if o.type == 'MESH' and o.find_armature() != arm: o.hide_render = True
ad = arm.animation_data or arm.animation_data_create()
for tr in list(ad.nla_tracks): ad.nla_tracks.remove(tr)
ACT = {a.name.split('_')[0]: a for a in bpy.data.actions}
for mat in bpy.data.materials:
    if mat.use_nodes and 'Principled BSDF' in mat.node_tree.nodes:
        mat.diffuse_color = mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value
bpy.ops.mesh.primitive_plane_add(size=20); fl = bpy.context.object
fm = bpy.data.materials.new('fl'); fm.diffuse_color = (0.42, 0.43, 0.42, 1); fl.data.materials.append(fm)
sc.render.engine = 'BLENDER_WORKBENCH'; sc.display.shading.light = 'STUDIO'; sc.display.shading.color_type = 'MATERIAL'
sc.display.shading.show_shadows = True
w = bpy.data.worlds.new('w'); w.color = (0.62, 0.66, 0.70); sc.world = w
sc.view_settings.view_transform = 'Standard'
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = 'ORTHO'


def aim(d, target, scale):
    d = Vector(d).normalized(); cam.location = Vector(target) + d * 8
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler(); cam.data.ortho_scale = scale


def pose(clip, frac):
    a = ACT[clip]; ad.action = a
    f = a.frame_range[0] + frac * (a.frame_range[1] - a.frame_range[0])
    sc.frame_set(int(f), subframe=f - int(f))


shots = [('SitDown', 0.0), ('SitDown', 0.5), ('SitDown', 1.0), ('SitIdle', 0.5), ('StandUp', 0.4), ('StandUp', 1.0),
         ('TurnL', 0.0), ('TurnL', 0.35), ('TurnL', 0.65), ('TurnL', 1.0), ('TurnR', 0.5), ('IdleLook', 0.0), ('IdleLook', 0.45), ('IdleLook', 1.0)]
# 0.45 m seat block under the hips for the sit frames (a C06-like log bench, 0.6 m top would be higher)
bpy.ops.mesh.primitive_cube_add(size=1); seat = bpy.context.object; seat.scale = (0.35, 0.8, 0.45); seat.location = (-0.25, 0, 0.225)
sm = bpy.data.materials.new('seat'); sm.diffuse_color = (0.45, 0.32, 0.22, 1); seat.data.materials.append(sm)
sc.render.resolution_x, sc.render.resolution_y = 420, 520
for view, d in (('side', (0, -1, 0.08)), ('q34', (0.9, -1, 0.4))):
    for clip, fr in shots:
        seat.hide_render = not clip.startswith('Sit') and not clip.startswith('Stand')
        pose(clip, fr); aim(d, (0, 0, 0.8), 2.0)
        sc.render.filepath = os.path.join(out, f'{view}_{clip}_{int(fr * 100):03d}.png'); bpy.ops.render.render(write_still=True)
open(os.path.join(out, 'source.txt'), 'w').write(f'fresh import {os.path.basename(glb)} sha256={sha}')
print('EXTRASHEET', out)
