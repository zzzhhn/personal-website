"""Renders from a FRESH import of a G24 GLB (never the .blend).
Run: Blender -b --factory-startup --python-exit-code 1 -P render_guide.py -- GLB OUTDIR MODE
MODE: sixview | poses | wrist | extremes | video   (video = 10 s normal-speed playback, 1920x1080, H.264 mp4)
extremes = A6 close-ups (armpit, knee pit, hip/crotch) at the measured peak-flex frames of Run/Jump/Land.
"""
import bpy, hashlib, json, math, os, sys
from mathutils import Vector
argv = sys.argv[sys.argv.index('--') + 1:]
glb, out, mode = argv[0], argv[1], argv[2]
os.makedirs(out, exist_ok=True)
sha = hashlib.sha256(open(glb, 'rb').read()).hexdigest()
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.fps = 60   # clips are keyed at 60/s; importer converts seconds with scene fps
bpy.ops.import_scene.gltf(filepath=glb)
arm = next(o for o in sc.objects if o.type == 'ARMATURE')
meshes = [o for o in sc.objects if o.type == 'MESH' and o.find_armature() == arm]
for o in sc.objects:
    if o.type == 'MESH' and o not in meshes:
        o.hide_render = True   # importer bone-shape helpers, if any
ad = arm.animation_data or arm.animation_data_create()
for tr in list(ad.nla_tracks):
    ad.nla_tracks.remove(tr)
ACTS = {a.name.split('_')[0] if a.name.split('_')[0] in ('Idle', 'Walk', 'Run', 'Jump', 'Land') else a.name: a
        for a in bpy.data.actions}


def use(clip, t):
    a = ACTS[clip]
    ad.action = a
    f0, f1 = a.frame_range
    sc.frame_set(int(math.floor(f0 + t * 60 + 1e-6)), subframe=(f0 + t * 60 + 1e-6) % 1.0)


# studio (presentation only)
bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, 0))
floor = bpy.context.object
fm = bpy.data.materials.new('floor'); fm.use_nodes = True
fm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.36, 0.37, 0.36, 1)
fm.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 1
floor.data.materials.append(fm)
w = bpy.data.worlds.new('w'); w.use_nodes = True
w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.55, 0.58, 0.62, 1)
w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.8
sc.world = w
sun = bpy.data.objects.new('key', bpy.data.lights.new('key', 'SUN'))
sun.data.energy = 3.0; sun.data.angle = math.radians(6)
sun.rotation_euler = (math.radians(48), 0, math.radians(-40))
sc.collection.objects.link(sun)
sc.render.engine = 'BLENDER_EEVEE_NEXT'
sc.eevee.taa_render_samples = 32
sc.view_settings.view_transform = 'Standard'
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam


def aim(d, target, ortho, dist=8):
    d = Vector(d).normalized()
    cam.location = Vector(target) + d * dist
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = ortho


label = f'source=fresh import {os.path.basename(glb)} sha256={sha[:16]}'
open(os.path.join(out, 'source.json'), 'w').write(json.dumps(dict(glb=glb, sha256=sha)))
VIEWS = {'1_front_+X': (1, 0, 0.08), '2_right_-Y(glTF+Z)': (0, -1, 0.08), '3_back_-X': (-1, 0, 0.08),
         '4_left_+Y': (0, 1, 0.08), '5_34_front_right': (1, -0.9, 0.55), '6_top': (0.0001, 0, 1)}
if mode == 'sixview':
    use('Idle', 0.0)
    sc.render.resolution_x, sc.render.resolution_y = 900, 1100
    for n, d in VIEWS.items():
        aim(d, (0, 0, 0.88 if n != '6_top' else 0), 2.15)
        sc.render.filepath = os.path.join(out, f'G24_{n}.png'); bpy.ops.render.render(write_still=True)
elif mode == 'poses':
    sc.render.resolution_x, sc.render.resolution_y = 700, 900
    shots = [('Walk', t) for t in (0, 0.1, 0.2, 0.3, 0.4, 0.5)] + [('Run', t) for t in (0, 0.067, 0.133, 0.2, 0.267, 0.333)] + \
            [('Jump', 0), ('Jump', 0.13), ('Jump', 0.5), ('Land', 0.09), ('Idle', 0), ('Idle', 1.2)]
    for view, d in (('side', (0, -1, 0.05)), ('q34', (1, -1, 0.35))):
        for clip, t in shots:
            use(clip, t)
            aim(d, (0, 0, 0.85), 2.0)
            sc.render.filepath = os.path.join(out, f'{view}_{clip}_{int(round(t*1000)):04d}.png')
            bpy.ops.render.render(write_still=True)
elif mode == 'wrist':
    # close-ups of the right wrist (glove/sleeve junction) at rest and at the deepest elbow flex of Run
    sc.render.resolution_x, sc.render.resolution_y = 900, 900
    for clip, t in (('Idle', 0.0), ('Run', 0.2), ('Walk', 0.15)):
        use(clip, t)
        hb = arm.pose.bones['hand.R'] if 'hand.R' in arm.pose.bones else next(b for b in arm.pose.bones if b.name.startswith('hand') and b.name.endswith('R'))
        c = arm.matrix_world @ hb.head
        for vn, d in (('front', (1, -0.25, 0.1)), ('side', (0.15, -1, 0.1))):
            aim(d, c, 0.32, 3)
            sc.render.filepath = os.path.join(out, f'wrist_R_{clip}_{int(t*1000):04d}_{vn}.png')
            bpy.ops.render.render(write_still=True)
elif mode == 'extremes':
    sc.render.resolution_x, sc.render.resolution_y = 800, 800
    W = lambda n: (arm.matrix_world @ arm.pose.bones[n].head, arm.matrix_world @ arm.pose.bones[n].tail)

    def ang(a, b):
        (h1, t1), (h2, t2) = W(a), W(b)
        return math.degrees((t1 - h1).angle(t2 - h2))
    picks = {}
    for clip in ('Run', 'Jump', 'Land'):
        a = ACTS[clip]
        for f2 in range(2 * int(a.frame_range[0]), 2 * int(a.frame_range[1]) + 1):
            t = (f2 / 2 - a.frame_range[0]) / 60
            use(clip, t)
            for s in 'RL':
                m = dict(knee=ang(f'thigh.{s}', f'shin.{s}'), hip=ang('pelvis', f'thigh.{s}'),
                         armpit=ang('chest', f'upperarm.{s}'))
                for k, v in m.items():
                    key = (k, s, clip)
                    # knee: thigh/shin angle, max = deepest flex. hip: pelvis axis points UP and the thigh
                    # DOWN, so hip flexion lowers the angle: min = deepest flex. armpit: chest axis up, arm
                    # down; max = upper arm closest to the flank = tightest armpit.
                    if key not in picks or (v < picks[key][2] if k == 'hip' else v > picks[key][2]):
                        picks[key] = (clip, t, v)
    shots = []
    for (k, s, clip), (c_, t, v) in sorted(picks.items()):
        if clip != 'Run' and not (k == 'knee' and clip in ('Jump', 'Land')):
            continue
        shots.append((k, s, clip, t, v))
    log = []
    for k, s, clip, t, v in shots:
        use(clip, t)
        side = -1 if s == 'R' else 1
        if k == 'knee':
            c = W(f'shin.{s}')[0]; views = (('outside', (0.15, side, 0.1)), ('behind', (-1, side * 0.35, 0.15)))
        elif k == 'hip':
            c = W(f'thigh.{s}')[0]; views = (('front_low', (1, side * 0.4, -0.05)), ('outside', (0.1, side, 0.05)))
        else:
            c = W(f'upperarm.{s}')[0] + Vector((0, 0, -0.08)); views = (('back', (-1, side * 0.5, 0.2)), ('outside', (0.2, side, 0.05)))
        for vn, d in views:
            aim(d, c, 0.42, 3)
            fn = f'x_{k}_{s}_{clip}_{int(round(t * 1000)):04d}_{vn}.png'
            sc.render.filepath = os.path.join(out, fn); bpy.ops.render.render(write_still=True)
            log.append(dict(file=fn, joint=k, side=s, clip=clip, t_s=round(t, 4), angle_deg=round(v, 1)))
    json.dump(log, open(os.path.join(out, 'extremes.json'), 'w'), indent=1)
elif mode == 'video':
    # Normal speed: each clip is played at 30 fps in real time, concatenated via NLA strips.
    seq = [('Idle', 2.4), ('Walk', 2.4), ('Run', 2.4), ('Jump', 0.5), ('Jump_hold', 0.4), ('Land', 0.4), ('Idle', 1.5)]
    tr = ad.nla_tracks.new(); ad.action = None
    f = 0
    for clip, dur in seq:
        a = ACTS['Jump' if clip == 'Jump_hold' else clip]
        st = tr.strips.new(clip, int(round(f)), a)
        L = a.frame_range[1] - a.frame_range[0]
        if clip == 'Jump_hold':
            st.action_frame_start = st.action_frame_end = a.frame_range[1]   # hold last airborne frame
            st.frame_end = f + dur * 60
        else:
            st.repeat = max(1.0, dur * 60 / L)
        st.extrapolation = 'NOTHING'
        f = int(round(st.frame_end))
    # 60 anim frames/s mapped to 30 output fps (frame_map 2->1): real-time playback, 30 fps video
    sc.render.fps = 30
    sc.render.frame_map_old, sc.render.frame_map_new = 2, 1
    sc.frame_start, sc.frame_end = 0, int(f / 2) - 1
    sc.render.resolution_x, sc.render.resolution_y = 1920, 1080
    sc.eevee.taa_render_samples = 16
    aim((1, -1.35, 0.35), (0, 0, 0.88), 3.9)   # ortho scale spans the 16:9 width: 3.9 m wide = 2.19 m tall
    sc.render.image_settings.file_format = 'FFMPEG'
    sc.render.ffmpeg.format = 'MPEG4'; sc.render.ffmpeg.codec = 'H264'; sc.render.ffmpeg.constant_rate_factor = 'HIGH'
    sc.render.filepath = os.path.join(out, 'G24_10s_normal_speed.mp4')
    sc.render.use_stamp = True; sc.render.use_stamp_frame = True; sc.render.use_stamp_note = True
    sc.render.stamp_note_text = label + ' | Idle 2.4s, Walk 2.4s, Run 2.4s, Jump+hold, Land, Idle | 30fps realtime, in-place'
    sc.render.use_stamp_date = sc.render.use_stamp_time = sc.render.use_stamp_render_time = False
    sc.render.use_stamp_camera = sc.render.use_stamp_lens = sc.render.use_stamp_scene = sc.render.use_stamp_filename = False
    bpy.ops.render.render(animation=True)
open(os.path.join(out, 'source.txt'), 'w').write(label)
print('RENDER_DONE', mode, out)
