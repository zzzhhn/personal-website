"""Shelters QA: reopened native .blend vs fresh import of the final Draco GLB.
Run: Blender -b --factory-startup -P qa_shelters.py -- OUT.json [C03 ...]
GLB axes: x = Blender X, y = Blender Z, z = -Blender Y. Draco quantisation (20 bit) allows tiny
bounds error; tolerance 2 mm is declared below and every delta is reported.
"""
import bpy, json, math, os, struct, sys
from mathutils import Vector
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vendor_inspect_connectivity as vic

REPO = '/Users/bobby/WorkBuddy/personal-website/personal-website'
TOOLS = f'{REPO}/tools/world/camp/shelters-v2'
GLB = f'{REPO}/public/assets/world/camp'
TARGET = {'C03': (4.2, 3.3, 5.5), 'C04': (3.4, 2.5, 4.4), 'C05': (3.2, 0.6, 3.2), 'C06': (0.8, 0.6, 4.8)}
BASELINE = {'C03': 792, 'C04': 792, 'C05': 576, 'C06': 240}  # legacy estimates in assets-v1.json
TOL = 0.002


def glb_json(path):
    with open(path, 'rb') as fh:
        data = fh.read()
    magic, ver, length = struct.unpack('<4sII', data[:12])
    clen, ctype = struct.unpack('<II', data[12:20])
    return json.loads(data[20:20 + clen]), len(data)


def bounds(objs):
    pts = []
    dg = bpy.context.evaluated_depsgraph_get()
    tris = 0
    for o in objs:
        ev = o.evaluated_get(dg)
        me = ev.to_mesh()
        me.calc_loop_triangles()
        tris += len(me.loop_triangles)
        pts += [ev.matrix_world @ v.co for v in me.vertices]
        ev.to_mesh_clear()
    lo = [min(p[i] for p in pts) for i in range(3)]
    hi = [max(p[i] for p in pts) for i in range(3)]
    return lo, hi, tris


def to_glb_axes(lo, hi):
    # Blender (x, y, z) -> glTF (x, z, -y)
    return [lo[0], lo[2], -hi[1]], [hi[0], hi[2], -lo[1]]


def material_area(objs):
    out = {}
    for o in objs:
        me = o.data
        for p in me.polygons:
            m = me.materials[p.material_index] if p.material_index < len(me.materials) else None
            k = m.name if m else '<none>'
            out[k] = out.get(k, 0) + p.area * (o.matrix_world.to_scale()[0] ** 2)
    return {k: round(v, 4) for k, v in sorted(out.items())}


def check(aid):
    r = {'id': aid}
    bpy.ops.wm.open_mainfile(filepath=f'{TOOLS}/blend/{aid}.blend')
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    others = [o.name for o in bpy.context.scene.objects if o.type not in ('MESH', 'EMPTY')]
    lo, hi, tris = bounds(meshes)
    conn = vic.inspect_objects(meshes)
    rows = conn['objects']
    r['native'] = dict(
        triangles=tris, bounds_min_blender=lo, bounds_max_blender=hi,
        dims_glb_xyz=[hi[0] - lo[0], hi[2] - lo[2], hi[1] - lo[1]],
        min_z=lo[2], xy_center=[(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2],
        object_origins={o.name: list(o.matrix_world.translation) for o in bpy.context.scene.objects},
        non_asset_objects=others,
        components=sum(x['vertex_edge_components'] for x in rows),
        boundary_edges=sum(x['boundary_edges'] for x in rows),
        nonmanifold_edges=sum(x['nonmanifold_edges'] for x in rows),
        nonmanifold_vertices=sum(x['nonmanifold_vertices'] for x in rows),
        inconsistent_winding_edges=sum(x['inconsistent_winding_edges'] for x in rows),
        negative_volume_components=sum(x['negative_volume_components'] for x in rows),
        zero_volume_components=sum(x['zero_or_near_zero_volume_components'] for x in rows),
        zero_area_triangles=sum(x['zero_or_near_zero_area_triangles'] for x in rows),
        duplicate_triangles=sum(x['duplicate_triangle_index_sets'] for x in rows),
        min_triangle_quality=min(x['min_triangle_shape_quality'] for x in rows),
        finite=all(x['finite_coordinates'] for x in rows),
        validate_would_repair=any(x['mesh_validate_would_repair'] for x in rows),
        material_area_m2=material_area(meshes),
        materials={m.name: dict(role=m.get('materialRole'), hex=m.get('srgbHex'),
                                base_linear=[round(c, 5) for c in m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value],
                                roughness=round(m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value, 3),
                                metallic=m.node_tree.nodes['Principled BSDF'].inputs['Metallic'].default_value)
                   for o in meshes for m in o.data.materials},
    )
    # final compressed GLB: binary JSON inspection
    path = f'{GLB}/{aid}.glb'
    js, size = glb_json(path)
    r['glb_file'] = dict(path=path, bytes=size, extensionsUsed=js.get('extensionsUsed', []),
                         extensionsRequired=js.get('extensionsRequired', []),
                         nodes=[n.get('name') for n in js.get('nodes', [])],
                         cameras=len(js.get('cameras', [])), lights='KHR_lights_punctual' in json.dumps(js.get('extensions', {})),
                         animations=len(js.get('animations', [])), images=len(js.get('images', [])),
                         textures=len(js.get('textures', [])),
                         draco_primitives=sum('KHR_draco_mesh_compression' in p.get('extensions', {}) for m in js.get('meshes', []) for p in m['primitives']),
                         primitives=sum(len(m['primitives']) for m in js.get('meshes', [])),
                         materials=[dict(name=m['name'], role=(m.get('extras') or {}).get('materialRole'),
                                         baseColorFactor=[round(c, 5) for c in m.get('pbrMetallicRoughness', {}).get('baseColorFactor', [1, 1, 1, 1])],
                                         roughness=m.get('pbrMetallicRoughness', {}).get('roughnessFactor', 1),
                                         metallic=m.get('pbrMetallicRoughness', {}).get('metallicFactor', 1))
                                    for m in js.get('materials', [])],
                         root_extras=(js['nodes'][js['scenes'][0]['nodes'][0]].get('extras')))
    # fresh scene import of the final GLB
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    im = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    ilo, ihi, itris = bounds(im)
    iconn = vic.inspect_objects(im)
    glo, ghi = to_glb_axes(ilo, ihi)
    dims = [ghi[i] - glo[i] for i in range(3)]
    r['glb_reimport'] = dict(
        triangles=itris, bounds_min_glb=glo, bounds_max_glb=ghi, dims_glb_xyz=dims,
        objects=[(o.name, o.type) for o in bpy.context.scene.objects],
        materials=sorted({m.name for o in im for m in o.data.materials if m}),
        material_area_m2=material_area(im),
        raw_components_after_import=iconn['sum_native_components'],
        raw_boundary_edges_after_import=sum(x['boundary_edges'] for x in iconn['objects']),
        finite=all(x['finite_coordinates'] for x in iconn['objects']),
        zero_area_triangles=sum(x['zero_or_near_zero_area_triangles'] for x in iconn['objects']),
    )
    nd = r['native']['dims_glb_xyz']
    r['compare'] = dict(
        triangles_equal=itris == tris,
        bounds_delta_max_m=max(abs(a - b) for a, b in zip(to_glb_axes(lo, hi)[0] + to_glb_axes(lo, hi)[1], glo + ghi)),
        tolerance_m=TOL,
        materials_equal=sorted(r['native']['materials']) == r['glb_reimport']['materials'],
        target_dims=TARGET[aid], dims_minus_target=[round(nd[i] - TARGET[aid][i], 4) for i in range(3)],
        within_target_footprint=nd[0] <= TARGET[aid][0] + TOL and nd[2] <= TARGET[aid][2] + TOL,
        baseline_estimate=BASELINE[aid], ratio_vs_legacy_estimate=round(tris / BASELINE[aid], 2),
    )
    n = r['native']
    fails = []
    if not r['compare']['triangles_equal']: fails.append('triangle mismatch')
    if r['compare']['bounds_delta_max_m'] > TOL: fails.append('bounds delta > tol')
    if not r['compare']['materials_equal']: fails.append('material mismatch')
    if not r['compare']['within_target_footprint']: fails.append('footprint exceeds target')
    if abs(n['min_z']) > 1e-6 or max(map(abs, n['xy_center'])) > 1e-6: fails.append('origin contract')
    for k in ('boundary_edges', 'nonmanifold_edges', 'nonmanifold_vertices', 'inconsistent_winding_edges',
              'negative_volume_components', 'zero_volume_components', 'zero_area_triangles', 'duplicate_triangles'):
        if n[k]: fails.append(k)
    if not n['finite'] or n['validate_would_repair']: fails.append('finite/validate')
    g = r['glb_file']
    if g['cameras'] or g['lights'] or g['animations'] or g['images'] or g['textures']: fails.append('presentation/texture data in glb')
    if g['draco_primitives'] != g['primitives'] or 'KHR_draco_mesh_compression' not in g['extensionsRequired']: fails.append('not fully draco')
    if any(not m['role'] for m in g['materials']): fails.append('materialRole missing')
    if any(m['metallic'] not in (0, 0.0) for m in g['materials']): fails.append('metallic')
    r['machine_failures'] = fails
    r['machine_pass'] = not fails
    return r


argv = sys.argv[sys.argv.index('--') + 1:]
out, ids = argv[0], argv[1:] or ['C03', 'C04', 'C05', 'C06']
res = dict(blender=bpy.app.version_string, note='Machine checks only; not art approval. Self-intersection between separate shells is not proven by these checks.',
           assets=[check(a) for a in ids])
with open(out, 'w') as fh:
    json.dump(res, fh, ensure_ascii=False, indent=1)
for a in res['assets']:
    print('QA', a['id'], a['native']['triangles'], a['glb_reimport']['triangles'], [round(x, 3) for x in a['native']['dims_glb_xyz']],
          'delta', round(a['compare']['bounds_delta_max_m'], 5), 'comp', a['native']['components'], a['machine_failures'])
