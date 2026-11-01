"""Normal-speed locomotion animatic: the in-place clips are given their design speed as root
travel (v * t) over a 0.5 m checker floor so foot contact / slip is visible, side + 3/4 views.
Run:  Blender -b --factory-startup --python-exit-code 1 -P render_animatic.py -- SRC OUT.mp4 [CLIPS] [SECONDS_EACH]
SRC is a .glb (fresh import, preferred) or a .blend. CLIPS default Walk,Run,Sprint.
Workbench (cheap review render), 1280x720, 30 fps output from 60 fps clips (real time).
"""
import bpy, hashlib, json, math, os, sys
from mathutils import Vector
argv = sys.argv[sys.argv.index('--') + 1:]
src, out = argv[0], argv[1]
clips = (argv[2] if len(argv) > 2 else 'Walk,Run,Sprint').split(',')
each = float(argv[3]) if len(argv) > 3 else 3.0
sha = hashlib.sha256(open(src, 'rb').read()).hexdigest()[:12]
if src.endswith('.glb'):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = 60
    bpy.ops.import_scene.gltf(filepath=src)
else:
    bpy.ops.wm.open_mainfile(filepath=src)
sc = bpy.context.scene
sc.render.fps = 60
arm = next(o for o in sc.objects if o.type == 'ARMATURE')
meshes = [o for o in sc.objects if o.type == 'MESH' and o.find_armature() == arm]
for o in sc.objects:
    if o.type == 'MESH' and o not in meshes: o.hide_render = True
ad = arm.animation_data or arm.animation_data_create()
for tr in list(ad.nla_tracks): ad.nla_tracks.remove(tr)
ACT = {}
for a in bpy.data.actions:
    ACT[a.name.split('_')[0]] = a
speeds = {}
try:
    speeds = json.loads(arm.get('clipDesignSpeedMps', '{}'))
except Exception:
    pass
for c in clips:
    if c not in speeds:
        speeds[c] = float(ACT[c].get('designSpeedMps', 0.0))
# root motion: parent the armature to an empty that travels along +X (Blender) at v
mover = bpy.data.objects.new('mover', None); sc.collection.objects.link(mover)
arm.parent = mover
rotY = arm.rotation_euler.copy()
tr = ad.nla_tracks.new(); ad.action = None
f = 0; x = 0.0
mover.location = (0, 0, 0); mover.keyframe_insert('location', frame=0)
segs = []
for c in clips:
    a = ACT[c]; L = a.frame_range[1] - a.frame_range[0]
    st = tr.strips.new(c, int(f), a); st.repeat = max(1.0, each * 60 / L); st.extrapolation = 'NOTHING'
    f1 = int(round(st.frame_end))
    v = speeds.get(c, 0.0)
    mover.location = (x, 0, 0); mover.keyframe_insert('location', frame=f)
    x += v * (f1 - f) / 60
    mover.location = (x, 0, 0); mover.keyframe_insert('location', frame=f1)
    segs.append((c, f, f1, v)); f = f1
for fc in mover.animation_data.action.fcurves:
    for kp in fc.keyframe_points: kp.interpolation = 'LINEAR'
# glTF import is Y-up converted; the armature object holds the conversion, travel is +X in both
# checker floor
bpy.ops.mesh.primitive_plane_add(size=1, location=(x / 2, 0, 0))
fl = bpy.context.object; fl.scale = (x + 20, 8, 1)
m = bpy.data.materials.new('chk'); m.use_nodes = True
nt = m.node_tree; bs = nt.nodes['Principled BSDF']
ck = nt.nodes.new('ShaderNodeTexChecker'); ck.inputs['Scale'].default_value = 1.0
tc = nt.nodes.new('ShaderNodeTexCoord'); mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (2, 2, 2)
nt.links.new(tc.outputs['Object'] if False else tc.outputs['Generated'], mp.inputs['Vector'])
ck.inputs['Color1'].default_value = (0.55, 0.56, 0.55, 1); ck.inputs['Color2'].default_value = (0.42, 0.43, 0.42, 1)
nt.links.new(mp.outputs['Vector'], ck.inputs['Vector']); nt.links.new(ck.outputs['Color'], bs.inputs['Base Color'])
fl.data.materials.append(m)
# world-space 0.5 m checker regardless of plane scale: drive mapping scale
mp.inputs['Scale'].default_value = ((x + 20) * 2, 16, 1)
sc.render.engine = 'BLENDER_WORKBENCH'
sc.display.shading.background_type = 'VIEWPORT' if False else 'WORLD'
w = bpy.data.worlds.new('w'); w.color = (0.62, 0.66, 0.70); sc.world = w
for mat in bpy.data.materials:
    if mat.use_nodes and 'Principled BSDF' in mat.node_tree.nodes and mat.name != 'chk':
        mat.diffuse_color = mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value
sc.display.shading.light = 'STUDIO'; sc.display.shading.color_type = 'MATERIAL'
sc.display.shading.show_shadows = True; sc.display.shading.show_cavity = False
sc.view_settings.view_transform = 'Standard'
sc.render.resolution_x, sc.render.resolution_y = 1280, 720
sc.render.fps = 30; sc.render.frame_map_old, sc.render.frame_map_new = 2, 1
sc.frame_start, sc.frame_end = 0, int(f / 2) - 1
# two cameras via two passes (side, 3/4): render side then 3/4 as separate mp4 segments concatenated by markers
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = 'ORTHO'; cam.data.ortho_scale = 2.6
con = cam.constraints.new('CHILD_OF'); con.target = mover; con.use_rotation_x = con.use_rotation_y = con.use_rotation_z = False
sc.render.image_settings.file_format = 'FFMPEG'
sc.render.ffmpeg.format = 'MPEG4'; sc.render.ffmpeg.codec = 'H264'; sc.render.ffmpeg.constant_rate_factor = 'HIGH'
sc.render.use_stamp = True; sc.render.use_stamp_frame = True; sc.render.use_stamp_note = True
sc.render.use_stamp_date = sc.render.use_stamp_time = sc.render.use_stamp_render_time = False
sc.render.use_stamp_camera = sc.render.use_stamp_lens = sc.render.use_stamp_scene = sc.render.use_stamp_filename = False
note = f'{os.path.basename(src)} {sha} | ' + ' '.join(f'{c} {v:.2f}m/s' for c, a_, b_, v in segs) + ' | 0.5 m checker, real time'
base, ext = os.path.splitext(out)
for view, d in (('side', Vector((0, -1, 0.12))), ('q34', Vector((0.9, -1, 0.45)))):
    d.normalize()
    cam.location = Vector((0.3, 0, 0.82)) + d * 8
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    sc.render.stamp_note_text = note + f' | {view}'
    sc.render.filepath = f'{base}_{view}{ext}'
    bpy.ops.render.render(animation=True)
json.dump(dict(src=src, sha256_12=sha, segments=segs), open(base + '.json', 'w'))
print('ANIMATIC', base, segs)
