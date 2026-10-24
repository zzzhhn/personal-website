"""Fresh-scene GLB readback + preview renders for town assets.

Run: tools/blender-run.sh town tools/world/town/qa_town.py <repo_root> <out_dir> T01 [...]
Writes <out_dir>/<ID>_q34.png, <ID>_close.png, <ID>_back.png and <out_dir>/<ID>_qa.json.
"""
import bpy, bmesh, sys, os, json, math
from mathutils import Vector

ARGS = sys.argv[sys.argv.index('--') + 1:]
REPO, OUT = os.path.abspath(ARGS[0]), os.path.abspath(ARGS[1])
IDS = ARGS[2:]
os.makedirs(OUT, exist_ok=True)

def readback(aid):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    path = os.path.join(REPO, 'public/assets/world/town', f'{aid}.glb')
    bpy.ops.import_scene.gltf(filepath=path)
    dg = bpy.context.evaluated_depsgraph_get()
    vis, cols, anchors = [], [], []
    for o in bpy.context.scene.objects:
        if o.type == 'MESH':
            (cols if o.name.startswith('col_') else vis).append(o)
        elif o.type == 'EMPTY' and o.name.startswith('anchor_'):
            anchors.append(o.name)
    tris, degen, mats, lo, hi = 0, 0, {}, Vector((1e9,) * 3), Vector((-1e9,) * 3)
    per_obj = {}
    for o in vis:
        me = o.evaluated_get(dg).to_mesh()
        me.calc_loop_triangles()
        n = len(me.loop_triangles)
        tris += n
        olo, ohi = Vector((1e9,) * 3), Vector((-1e9,) * 3)
        for t in me.loop_triangles:
            if t.area < 1e-7:
                degen += 1
            m = o.material_slots[t.material_index].name if o.material_slots else '-'
            mats[m] = mats.get(m, 0) + 1
        for v in me.vertices:
            w = o.matrix_world @ v.co
            olo = Vector(map(min, olo, w)); ohi = Vector(map(max, ohi, w))
        lo = Vector(map(min, lo, olo)); hi = Vector(map(max, hi, ohi))
        per_obj[o.name] = dict(tris=n, lo=[round(x, 3) for x in olo], hi=[round(x, 3) for x in ohi])
        o.evaluated_get(dg).to_mesh_clear()
    colinfo = {}
    for o in cols:
        ws = [o.matrix_world @ v.co for v in o.data.vertices]
        clo = Vector([min(w[i] for w in ws) for i in range(3)]); chi = Vector([max(w[i] for w in ws) for i in range(3)])
        colinfo[o.name] = dict(points=len(ws), lo=[round(x, 3) for x in clo], hi=[round(x, 3) for x in chi])
    return dict(id=aid, glbBytes=os.path.getsize(path), tris=tris, degenerate=degen, materials=mats,
                lo=[round(x, 3) for x in lo], hi=[round(x, 3) for x in hi], objects=per_obj, colliders=colinfo, anchors=anchors), vis, cols, lo, hi

def render(aid, vis, cols, lo, hi):
    sc = bpy.context.scene
    for o in cols:
        o.hide_render = True
    try:
        sc.render.engine = 'BLENDER_EEVEE_NEXT'
        sc.eevee.taa_render_samples = 24
    except TypeError:
        sc.render.engine = 'CYCLES'
    sc.render.resolution_x, sc.render.resolution_y = 1280, 960
    sc.view_settings.view_transform = 'AgX'
    w = bpy.data.worlds.new('w'); w.use_nodes = True
    w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.55, 0.62, 0.75, 1)
    w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.6
    sc.world = w
    size = hi - lo
    bpy.ops.mesh.primitive_plane_add(size=max(size) * 6, location=((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, -0.002))
    fl = bpy.context.object
    m = bpy.data.materials.new('floor'); m.use_nodes = True
    m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.5, 0.45, 0.38, 1)
    fl.data.materials.append(m)
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
    sun.data.energy = 3.2; sun.data.color = (1.0, 0.86, 0.68); sun.data.angle = math.radians(3)
    sun.rotation_euler = (math.radians(62), 0, math.radians(-125))
    sc.collection.objects.link(sun)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    sc.collection.objects.link(cam); sc.camera = cam
    c = (lo + hi) / 2
    R = max(size) * 1.25
    views = {
        'q34': (Vector((1.0, -0.8, 0.55)), c, 40),
        'back': (Vector((-0.9, 0.9, 0.6)), c, 40),
        'close': (Vector((1.0, -0.35, 0.18)), Vector((hi.x, c.y, lo.z + 2.2)), 55),
    }
    files = []
    for name, (d, tgt, lens) in views.items():
        dist = R if name != 'close' else max(size.y, 6) * 0.95
        cam.data.lens = 35 if name != 'close' else 24
        cam.location = tgt + d.normalized() * dist * (1.6 if name != 'close' else 1.0)
        cam.rotation_euler = (tgt - cam.location).to_track_quat('-Z', 'Y').to_euler()
        f = os.path.join(OUT, f'{aid}_{name}.png')
        sc.render.filepath = f
        bpy.ops.render.render(write_still=True)
        files.append(f)
    return files

for aid in IDS:
    rep, vis, cols, lo, hi = readback(aid)
    rep['renders'] = render(aid, vis, cols, lo, hi)
    with open(os.path.join(OUT, f'{aid}_qa.json'), 'w') as fh:
        json.dump(rep, fh, indent=1)
    print('[qa]', aid, json.dumps({k: rep[k] for k in ('tris', 'degenerate', 'glbBytes', 'lo', 'hi')}), 'cols', len(rep['colliders']), 'anchors', rep['anchors'])
