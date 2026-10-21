"""Renders of the FRESHLY IMPORTED final Draco GLBs (the deliverable, not the source).

Run: Blender -b --factory-startup -P tools/world/camp/nature/render_views.py [-- G16 ...] [--only gamecam]
Outputs (docs/world/quality-v2/nature/views/raw/):
  <ID>_color_<view>.png   six neutral views, EEVEE, 900 px
  <ID>_clay_<view>.png    front + q34 clay (Workbench, flat studio, outline, no shadow)
  <ID>_wind_<view>.png    front + q34 with RGB = _WIND bend/branch/leaf (mask check)
  <ID>_gamecam.png        1920x1080, game follow-camera geometry (zoom0: 12 m, fov 40,
                          offset dir (.6,1,.8)/sqrt2), warm dusk key from the game sun dir
Studio floor/lights/cameras exist only in this render scene, never in the GLB.
"""
import bpy, os, sys, math, hashlib, json
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '../../../..'))
GLB_DIR = os.path.join(REPO, 'public/assets/world/camp')
OUT = os.path.join(REPO, 'docs/world/quality-v2/nature/views/raw')
IDS = ['G16', 'G17', 'G18', 'G19', 'G20', 'G21', 'G22', 'G23']
VIEWS = [('front', 0, 6), ('side', 90, 6), ('back', 180, 6), ('top', 0, 89.9), ('q34_front', 45, 26), ('q34_back', 225, 26)]
RES = 900


def three_to_blender(v):   # three (x, y up, z) -> Blender (x, -z, y)
    return Vector((v[0], -v[2], v[1]))


def setup(aid):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(GLB_DIR, aid + '.glb'))
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    pts = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
    mn = Vector([min(p[i] for p in pts) for i in range(3)]); mx = Vector([max(p[i] for p in pts) for i in range(3)])
    s = bpy.context.scene
    bpy.ops.mesh.primitive_plane_add(size=80, location=(0, 0, -0.002))
    floor = bpy.context.object; floor.name = 'STUDIO_floor'
    fm = bpy.data.materials.new('STUDIO_floor'); fm.use_nodes = True
    fm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.42, 0.42, 0.42, 1)
    fm.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 1
    floor.data.materials.append(fm)
    w = bpy.data.worlds.new('STUDIO'); s.world = w; w.use_nodes = True
    w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.5, 0.5, 0.5, 1)
    w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.9
    sun = bpy.data.objects.new('STUDIO_key', bpy.data.lights.new('key', 'SUN'))
    sun.data.energy = 2.6; sun.data.angle = math.radians(8)
    sun.rotation_euler = (math.radians(50), 0, math.radians(35))
    s.collection.objects.link(sun)
    cam = bpy.data.objects.new('STUDIO_cam', bpy.data.cameras.new('cam'))
    s.collection.objects.link(cam); s.camera = cam
    s.view_settings.view_transform = 'Standard'; s.view_settings.look = 'None'
    s.render.engine = 'BLENDER_EEVEE_NEXT'; s.eevee.taa_render_samples = 48
    return mn, mx, cam, sun, meshes, w


def aim_ortho(cam, mn, mx, az, el):
    c = (mn + mx) / 2; r = (mx - mn).length / 2
    d = Vector((math.cos(math.radians(el)) * math.cos(math.radians(az)),
                math.cos(math.radians(el)) * math.sin(math.radians(az)), math.sin(math.radians(el))))
    cam.data.type = 'ORTHO'
    cam.location = c + d * (r * 4 + 5)
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    cam.data.ortho_scale = r * 2.1; cam.data.clip_end = r * 10 + 30


def render_to(path, x, y):
    s = bpy.context.scene
    s.render.resolution_x, s.render.resolution_y = x, y
    s.render.filepath = path
    bpy.ops.render.render(write_still=True)


def wind_materials(meshes):
    """Emission shader showing _WIND rgb (only on meshes that have it)."""
    saved = {}
    m = bpy.data.materials.new('WINDVIS'); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    a = nt.nodes.new('ShaderNodeAttribute'); a.attribute_name = '_WIND'
    e = nt.nodes.new('ShaderNodeEmission'); o = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(a.outputs['Color'], e.inputs['Color']); nt.links.new(e.outputs['Emission'], o.inputs['Surface'])
    any_wind = False
    for ob in meshes:
        saved[ob] = list(ob.data.materials)
        has = '_WIND' in ob.data.attributes
        any_wind |= has
        for i in range(len(ob.data.materials)):
            ob.data.materials[i] = m if has else ob.data.materials[i]
    return saved, any_wind


def render(aid, only=None):
    mn, mx, cam, sun, meshes, world = setup(aid)
    s = bpy.context.scene
    os.makedirs(OUT, exist_ok=True)
    if only in (None, 'views'):
        for name, az, el in VIEWS:
            aim_ortho(cam, mn, mx, az, el)
            render_to(os.path.join(OUT, f'{aid}_color_{name}.png'), RES, RES)
    if only in (None, 'gamecam'):
        # game follow-camera: offset = (.6, 1, .8)/sqrt2 * 12 m (three axes) from the target
        cam.data.type = 'PERSP'; cam.data.sensor_fit = 'VERTICAL'; cam.data.angle = math.radians(40)
        target = Vector((0, 0, min(1.2, (mx.z - mn.z) * 0.35)))
        off = three_to_blender((0.6 / math.sqrt(2) * 12, 1 / math.sqrt(2) * 12, 0.8 / math.sqrt(2) * 12))
        cam.location = target + off
        cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
        cam.data.clip_end = 200
        # warm dusk key from the game's sun position [-90, 40, 65] (three) + cool sky fill
        sd = three_to_blender((-90, 40, 65)).normalized()
        sun.rotation_euler = (-sd).to_track_quat('-Z', 'Y').to_euler()
        sun.data.color = (1.0, 0.85, 0.66); sun.data.energy = 3.4
        world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.28, 0.35, 0.46, 1)
        world.node_tree.nodes['Background'].inputs['Strength'].default_value = 1.0
        render_to(os.path.join(OUT, f'{aid}_gamecam.png'), 1920, 1080)
        sun.data.color = (1, 1, 1); sun.data.energy = 2.6; sun.rotation_euler = (math.radians(50), 0, math.radians(35))
        world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.5, 0.5, 0.5, 1)
        world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.9
    if only in (None, 'views'):
        saved, any_wind = wind_materials(meshes)
        if any_wind:
            for name, az, el in [VIEWS[0], VIEWS[4]]:
                aim_ortho(cam, mn, mx, az, el)
                render_to(os.path.join(OUT, f'{aid}_wind_{name}.png'), RES, RES)
        for ob, mats in saved.items():
            for i, mm in enumerate(mats):
                ob.data.materials[i] = mm
        s.render.engine = 'BLENDER_WORKBENCH'
        sh = s.display.shading
        sh.light = 'STUDIO'; sh.color_type = 'SINGLE'; sh.single_color = (0.72, 0.72, 0.72)
        sh.show_object_outline = True; sh.show_cavity = False; sh.show_shadows = False
        sh.show_backface_culling = False
        for name, az, el in [VIEWS[0], VIEWS[4]]:
            aim_ortho(cam, mn, mx, az, el)
            render_to(os.path.join(OUT, f'{aid}_clay_{name}.png'), RES, RES)
    with open(os.path.join(GLB_DIR, aid + '.glb'), 'rb') as f:
        h = hashlib.sha256(f.read()).hexdigest()
    with open(os.path.join(OUT, aid + '_rendered_from.json'), 'w') as f:
        json.dump(dict(glb=aid + '.glb', sha256=h), f)
    print('RENDERED', aid, h[:12])


argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
only = None
if '--only' in argv:
    only = argv[argv.index('--only') + 1]; argv = argv[:argv.index('--only')]
for aid in (argv or IDS):
    render(aid, only)
