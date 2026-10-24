"""Neutral six-view renders of a shelters asset; presentation objects are never saved.
Final evidence (default): fresh factory scene + import of the final Draco GLB:
  Blender -b --factory-startup -P render_views.py -- C03 OUTDIR --glb
Native preview (clay only): Blender -b blend/C03.blend -P render_views.py -- C03 OUTDIR clay
Writes OUTDIR/source.txt so compose_sheets.py can label the sheet with its true source.
Views: front(+X), side(-Y looking +Y... right side), back(-X), top, 3/4 front-left, 3/4 back-right.
"""
import bpy, hashlib, math, os, sys
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
asset, out = argv[0], argv[1]
clay = 'clay' in argv[2:]
os.makedirs(out, exist_ok=True)
if '--glb' in argv[2:]:
    glb = f'/Users/bobby/WorkBuddy/personal-website/personal-website/public/assets/world/camp/{asset}.glb'
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=glb)
    sha = hashlib.sha256(open(glb, 'rb').read()).hexdigest()
    source = f'source=final Draco GLB fresh import  {os.path.basename(glb)}  sha256={sha[:16]}'
    with open(os.path.join(out, 'source.json'), 'w') as fh:
        fh.write('{"source": "final Draco GLB fresh import", "glb": "%s", "sha256": "%s"}' % (glb, sha))
else:
    source = f'source=native .blend {os.path.basename(bpy.data.filepath)} (not GLB)'
with open(os.path.join(out, 'source.txt'), 'w') as fh:
    fh.write(source)
sc = bpy.context.scene
geo = [o for o in sc.objects if o.type == 'MESH']
pts = [o.matrix_world @ Vector(c) for o in geo for c in o.bound_box]
lo = Vector([min(p[i] for p in pts) for i in range(3)])
hi = Vector([max(p[i] for p in pts) for i in range(3)])
ctr = (lo + hi) / 2
size = (hi - lo).length

if clay:
    m = bpy.data.materials.new('clay_preview')
    m.use_nodes = True
    m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.6, 0.6, 0.6, 1)
    for o in geo:
        for i in range(len(o.material_slots)):
            o.material_slots[i].link = 'OBJECT'
            o.material_slots[i].material = m

# presentation floor (never exported; this file is not saved)
bpy.ops.mesh.primitive_plane_add(size=size * 6, location=(ctr.x, ctr.y, -0.001))
floor = bpy.context.object
fm = bpy.data.materials.new('floor_preview')
fm.use_nodes = True
fm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.42, 0.42, 0.40, 1)
fm.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 1.0
floor.data.materials.append(fm)

world = bpy.data.worlds.new('neutral')
world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.55, 0.57, 0.6, 1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.9
sc.world = world
sun = bpy.data.objects.new('key', bpy.data.lights.new('key', 'SUN'))
sun.data.energy = 2.6
sun.data.angle = math.radians(8)
sun.rotation_euler = (math.radians(50), 0, math.radians(35))
sc.collection.objects.link(sun)

sc.render.engine = 'CYCLES'
sc.cycles.device = 'CPU'
sc.cycles.samples = 24
sc.cycles.use_denoising = False
sc.cycles.max_bounces = 4
sc.view_settings.view_transform = 'Standard'
sc.view_settings.look = 'None'
sc.render.resolution_x = 640
sc.render.resolution_y = 520
sc.render.film_transparent = False

cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
sc.collection.objects.link(cam)
sc.camera = cam
cam.data.type = 'ORTHO'
cam.data.ortho_scale = size * 1.08
views = {
    '1_front_+X': Vector((1, 0, 0.12)),
    '2_side_-Y': Vector((0, -1, 0.12)),
    '3_back_-X': Vector((-1, 0, 0.12)),
    '4_top': Vector((0.0001, 0, 1)),
    '5_34_front': Vector((1, -0.85, 0.75)),
    '6_34_back': Vector((-0.9, 0.9, 0.75)),
}
for name, d in views.items():
    d = d.normalized()
    cam.location = ctr + d * size * 3
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    cam.data.clip_end = size * 10
    sc.render.filepath = os.path.join(out, f'{asset}_{name}.png')
    bpy.ops.render.render(write_still=True)
    print('RENDERED', sc.render.filepath)
