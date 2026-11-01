"""Relative-scale overview from fresh imports of the final Draco GLBs (not the .blend sources).
Run: Blender -b --factory-startup -P render_overview.py -- OUT.png"""
import bpy, math, sys
from mathutils import Vector
out = sys.argv[sys.argv.index('--') + 1]
GLB = '/Users/bobby/WorkBuddy/personal-website/personal-website/public/assets/world/camp'
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
place = {'C03': (0, 0), 'C04': (0, -5.2), 'C05': (5.2, -2.0), 'C06': (5.2, 2.6)}
for aid, (x, y) in place.items():
    before = set(sc.objects)
    bpy.ops.import_scene.gltf(filepath=f'{GLB}/{aid}.glb')
    for o in set(sc.objects) - before:
        if o.parent is None:
            o.location = (x, y, 0)
bpy.ops.mesh.primitive_plane_add(size=60, location=(2, -1, -0.001))
fm = bpy.data.materials.new('floor_preview'); fm.use_nodes = True
fm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.42, 0.42, 0.40, 1)
bpy.context.object.data.materials.append(fm)
w = bpy.data.worlds.new('n'); w.use_nodes = True
w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.55, 0.57, 0.6, 1)
sc.world = w
sun = bpy.data.objects.new('key', bpy.data.lights.new('key', 'SUN')); sun.data.energy = 2.6
sun.rotation_euler = (math.radians(50), 0, math.radians(35)); sc.collection.objects.link(sun)
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = 'ORTHO'; cam.data.ortho_scale = 15
ctr = Vector((2.4, -1.2, 1.0)); d = Vector((1, -0.9, 0.8)).normalized()
cam.location = ctr + d * 30; cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 32; sc.cycles.use_denoising = False
sc.view_settings.view_transform = 'Standard'
sc.render.resolution_x, sc.render.resolution_y = 1280, 820
sc.render.filepath = out
bpy.ops.render.render(write_still=True)
print('OVERVIEW', out)
