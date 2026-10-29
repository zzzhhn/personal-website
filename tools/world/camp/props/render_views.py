"""Neutral six-view renders of the *exported GLB* (fresh import into an empty scene).

Run:  Blender -b --factory-startup -P render_views.py -- <repo_root> <out_dir> [C07 ...]
Writes <out_dir>/_tiles/<ID>_<view>.png; compose_sheets.py assembles contact sheets.
Studio floor, lights and cameras exist only in this render scene, never in the GLB.
"""
import bpy, sys, os, math
from mathutils import Vector

ARGS = sys.argv[sys.argv.index('--') + 1:]
REPO, OUT = os.path.abspath(ARGS[0]), os.path.abspath(ARGS[1])
IDS = ARGS[2:] or ['C07', 'C08', 'C09', 'C10']
TILES = os.path.join(OUT, '_tiles')
os.makedirs(TILES, exist_ok=True)

# (name, direction from target to camera in Blender coords; +X = asset front)
VIEWS = [
    ('front', Vector((1, 0, 0.0))),
    ('side', Vector((0, -1, 0.0))),
    ('back', Vector((-1, 0, 0.0))),
    ('top', Vector((0, 0, 1))),
    ('34_front', Vector((1, -1, 0.75))),
    ('34_back', Vector((-1, 1, 0.75))),
]

def setup_render(scene):
    try:
        scene.render.engine = 'BLENDER_EEVEE_NEXT'
    except TypeError:
        scene.render.engine = 'CYCLES'
    scene.render.resolution_x = scene.render.resolution_y = 720
    scene.render.film_transparent = False
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    scene.view_settings.exposure = 0.0
    if scene.render.engine == 'BLENDER_EEVEE_NEXT':
        scene.eevee.taa_render_samples = 32
        scene.eevee.use_shadows = True
    world = bpy.data.worlds.new('neutral')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.62, 0.62, 0.62, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.55
    scene.world = world

def studio(scene, size):
    bpy.ops.mesh.primitive_plane_add(size=max(12, size * 8), location=(0, 0, -0.0005))
    floor = bpy.context.object
    floor.name = 'studio_floor'
    m = bpy.data.materials.new('studio_floor_grey')
    m.use_nodes = True
    m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.42, 0.42, 0.42, 1)
    m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.95
    floor.data.materials.append(m)
    sun = bpy.data.lights.new('studio_key', 'SUN')
    sun.energy = 2.6
    sun.angle = math.radians(8)
    o = bpy.data.objects.new('studio_key', sun)
    o.rotation_euler = (math.radians(50), 0, math.radians(35))
    scene.collection.objects.link(o)
    fill = bpy.data.lights.new('studio_fill', 'SUN')
    fill.energy = 0.8
    o2 = bpy.data.objects.new('studio_fill', fill)
    o2.rotation_euler = (math.radians(60), 0, math.radians(215))
    scene.collection.objects.link(o2)

def asset_bounds(objs):
    dg = bpy.context.evaluated_depsgraph_get()
    pts = []
    for o in objs:
        if o.type != 'MESH':
            continue
        ev = o.evaluated_get(dg)
        pts += [ev.matrix_world @ v.co for v in ev.data.vertices]
    lo = Vector([min(p[i] for p in pts) for i in range(3)])
    hi = Vector([max(p[i] for p in pts) for i in range(3)])
    return lo, hi, pts

def frame(cam, d, pts, center):
    d = d.normalized()
    cam.location = center + d * 30
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y' if abs(d.z) < 0.99 else 'Y').to_euler()
    if abs(d.z) > 0.99:
        cam.rotation_euler = (0, 0, math.radians(-90))  # top: asset front (+X) points up the image
    inv = cam.matrix_world.inverted()
    bpy.context.view_layer.update()
    inv = cam.matrix_world.inverted()
    loc = [inv @ p for p in pts]
    w = max(p.x for p in loc) - min(p.x for p in loc)
    h = max(p.y for p in loc) - min(p.y for p in loc)
    cx = (max(p.x for p in loc) + min(p.x for p in loc)) / 2
    cy = (max(p.y for p in loc) + min(p.y for p in loc)) / 2
    cam.data.ortho_scale = max(w, h) * 1.15
    cam.data.shift_x = cx / cam.data.ortho_scale
    cam.data.shift_y = cy / cam.data.ortho_scale

for aid in IDS:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    bpy.ops.import_scene.gltf(filepath=os.path.join(REPO, 'public/assets/world/camp', f'{aid}.glb'))
    objs = list(scene.objects)
    lo, hi, pts = asset_bounds(objs)
    setup_render(scene)
    studio(scene, max(hi - lo))
    camd = bpy.data.cameras.new('cam')
    camd.type = 'ORTHO'
    camd.clip_end = 100
    cam = bpy.data.objects.new('cam', camd)
    scene.collection.objects.link(cam)
    scene.camera = cam
    center = (lo + hi) / 2
    for name, d in VIEWS:
        frame(cam, d, pts, center)
        scene.render.filepath = os.path.join(TILES, f'{aid}_{name}.png')
        bpy.ops.render.render(write_still=True)
    with open(os.path.join(TILES, f'{aid}_dims.txt'), 'w') as f:
        s = hi - lo
        f.write(f'{s.x:.3f} x {s.z:.3f} x {s.y:.3f} m (GLB x,y,z) | engine {scene.render.engine}')
    print('[render]', aid, scene.render.engine)
