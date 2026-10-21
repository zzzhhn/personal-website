"""Neutral six-view renders of the FRESHLY IMPORTED GLBs (the deliverable, not the source).

Run: Blender -b --factory-startup -P tools/world/camp/nature/render_views.py [-- G16 ...]
Then: python3 tools/world/camp/nature/compose_sheets.py
Row 1 colour (EEVEE, neutral white key + grey world). Row 2 clay (Workbench, flat
grey studio light + outline) to expose floating/gaps without palette help.
The floor/lights/cameras exist only in this render scene, never in the GLB.
"""
import bpy, os, sys, math, hashlib, json
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '../../../..'))
GLB_DIR = os.path.join(REPO, 'public/assets/world/camp')
OUT = os.path.join(REPO, 'docs/world/camp-slice/nature/views/raw')
IDS = ['G16', 'G17', 'G18', 'G19', 'G20', 'G21', 'G22', 'G23']
# name: (azimuth deg from +X front, elevation deg). Blender Z-up after import.
VIEWS = [('front', 0, 6), ('side', 90, 6), ('back', 180, 6), ('top', 0, 89.9), ('q34_front', 45, 26), ('q34_back', 225, 26)]
RES = 560


def setup(aid):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(GLB_DIR, aid + '.glb'))
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    pts = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
    mn = Vector([min(p[i] for p in pts) for i in range(3)]); mx = Vector([max(p[i] for p in pts) for i in range(3)])
    s = bpy.context.scene
    bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, -0.001))
    floor = bpy.context.object; floor.name = 'STUDIO_floor'
    fm = bpy.data.materials.new('STUDIO_floor'); fm.use_nodes = True
    fm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.42, 0.42, 0.42, 1)
    fm.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 1
    floor.data.materials.append(fm)
    w = bpy.data.worlds.new('STUDIO'); s.world = w; w.use_nodes = True
    w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.5, 0.5, 0.5, 1)
    w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.9
    sun = bpy.data.objects.new('STUDIO_key', bpy.data.lights.new('key', 'SUN'))
    sun.data.energy = 2.6; sun.data.color = (1, 1, 1); sun.data.angle = math.radians(8)
    sun.rotation_euler = (math.radians(50), 0, math.radians(35))
    s.collection.objects.link(sun)
    cam = bpy.data.objects.new('STUDIO_cam', bpy.data.cameras.new('cam'))
    cam.data.type = 'ORTHO'
    s.collection.objects.link(cam); s.camera = cam
    s.render.resolution_x = s.render.resolution_y = RES
    s.view_settings.view_transform = 'Standard'   # neutral, palette reads as authored
    s.view_settings.look = 'None'
    return mn, mx, cam, floor


def aim(cam, mn, mx, az, el):
    c = (mn + mx) / 2
    r = (mx - mn).length / 2
    d = Vector((math.cos(math.radians(el)) * math.cos(math.radians(az)),
                math.cos(math.radians(el)) * math.sin(math.radians(az)), math.sin(math.radians(el))))
    cam.location = c + d * (r * 4 + 5)
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    cam.data.ortho_scale = r * 2.15
    cam.data.clip_end = r * 10 + 20


def render(aid):
    mn, mx, cam, floor = setup(aid)
    s = bpy.context.scene
    os.makedirs(OUT, exist_ok=True)
    for mode in ('color', 'clay'):
        if mode == 'color':
            s.render.engine = 'BLENDER_EEVEE_NEXT'
            s.eevee.taa_render_samples = 32
        else:
            s.render.engine = 'BLENDER_WORKBENCH'
            sh = s.display.shading
            sh.light = 'STUDIO'; sh.color_type = 'SINGLE'; sh.single_color = (0.72, 0.72, 0.72)
            # Shadow/cavity off: Workbench ortho shadow maps produced diagonal
            # streaks on the 60 m floor (main-session review). Facets read from
            # the studio light; outline exposes silhouette gaps.
            sh.show_object_outline = True; sh.show_cavity = False; sh.show_shadows = False
            sh.background_type = 'VIEWPORT'; sh.background_color = (0.5, 0.5, 0.5)
        for name, az, el in VIEWS:
            aim(cam, mn, mx, az, el)
            s.render.filepath = os.path.join(OUT, f'{aid}_{mode}_{name}.png')
            bpy.ops.render.render(write_still=True)
    with open(os.path.join(GLB_DIR, aid + '.glb'), 'rb') as f:
        h = hashlib.sha256(f.read()).hexdigest()
    with open(os.path.join(OUT, aid + '_rendered_from.json'), 'w') as f:
        json.dump(dict(glb=aid + '.glb', sha256=h), f)
    print('RENDERED', aid, h[:12])


argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
for aid in (argv or IDS):
    render(aid)
