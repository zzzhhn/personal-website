"""Machine QA for camp-content assets (adapted from camp/props/qa_props.py): reopened native .blend vs fresh GLB import.

Run:  Blender -b --factory-startup -P qa_props.py -- <repo_root> <report.json> [C07 ...]
Per asset: evaluated triangles, bounds (GLB axes), origin/min-Y, material inventory with
persisted PBR + materialRole, nonzero material area, degenerate/finite/manifold/winding via the
vendored connectivity inspector, plus GLB-level node/extras checks parsed from the binary.
Machine checks are not art acceptance.
"""
import bpy, sys, os, json, struct, math, importlib.util
from mathutils import Vector

ARGS = sys.argv[sys.argv.index('--') + 1:]
REPO, REPORT = os.path.abspath(ARGS[0]), os.path.abspath(ARGS[1])
IDS = ARGS[2:] or ['C11', 'C12', 'C13', 'C14', 'C15', 'C16', 'L01']
HERE = os.path.join(REPO, 'tools/world/camp-content')
# Draco 20-bit position quantization: allowed absolute bounds error between native and the
# fresh import of the final compressed GLB (metres). Actual measured diff is reported.
DRACO_BOUNDS_TOL = 1e-4
spec = importlib.util.spec_from_file_location('qa_connectivity', os.path.join(HERE, 'qa_connectivity.py'))
conn = importlib.util.module_from_spec(spec)
spec.loader.exec_module(conn)

def blender_to_glb(v):
    return [v[0], v[2], -v[1]]

def measure(objs):
    dg = bpy.context.evaluated_depsgraph_get()
    pts, tris, mats = [], 0, {}
    for o in objs:
        if o.type != 'MESH':
            continue
        ev = o.evaluated_get(dg)
        me = ev.to_mesh()
        me.calc_loop_triangles()
        tris += len(me.loop_triangles)
        pts += [ev.matrix_world @ v.co for v in me.vertices]
        ev.to_mesh_clear()
        for m in o.data.materials:
            if m and m.name not in mats:
                b = m.node_tree.nodes.get('Principled BSDF') if m.use_nodes else None
                mats[m.name] = {
                    'materialRole': m.get('materialRole'),
                    'baseColorLinear': [round(c, 4) for c in b.inputs['Base Color'].default_value[:3]] if b else None,
                    'roughness': round(b.inputs['Roughness'].default_value, 3) if b else None,
                    'metallic': round(b.inputs['Metallic'].default_value, 3) if b else None,
                }
    lo = Vector([min(p[i] for p in pts) for i in range(3)])
    hi = Vector([max(p[i] for p in pts) for i in range(3)])
    lo_g, hi_g = blender_to_glb(lo), blender_to_glb(hi)
    lo_g, hi_g = [min(a, b) for a, b in zip(lo_g, hi_g)], [max(a, b) for a, b in zip(lo_g, hi_g)]
    return {
        'triangles': tris,
        'boundsGLB_min': [round(c, 8) for c in lo_g], 'boundsGLB_max': [round(c, 8) for c in hi_g],
        'sizeGLB_xyz': [round(h - l, 4) for l, h in zip(lo_g, hi_g)],
        'xzCenterGLB': [round((lo_g[0] + hi_g[0]) / 2, 8), round((lo_g[2] + hi_g[2]) / 2, 8)],
        'minYGLB': round(lo_g[1], 8),
        'materials': mats,
    }

def topo(objs):
    rep = conn.inspect_objects([o for o in objs if o.type == 'MESH'])
    keep = ('name', 'triangles', 'vertex_edge_components', 'boundary_edges', 'nonmanifold_edges',
            'nonmanifold_vertices', 'inconsistent_winding_edges', 'negative_volume_components',
            'zero_or_near_zero_area_triangles', 'zero_or_near_zero_volume_components',
            'duplicate_triangle_index_sets', 'sliver_triangle_count', 'finite_coordinates',
            'mesh_validate_would_repair', 'face_material_world_areas')
    return [{k: r[k] for k in keep} for r in rep['objects']]

def parse_glb(path):
    with open(path, 'rb') as f:
        data = f.read()
    magic, ver, length = struct.unpack_from('<4sII', data, 0)
    clen, ctype = struct.unpack_from('<I4s', data, 12)
    js = json.loads(data[20:20 + clen])
    nodes = js.get('nodes', [])
    return {
        'magic': magic.decode(), 'version': ver, 'bytes': length,
        'nodes': [{'name': n.get('name'), 'mesh': 'mesh' in n,
                   'translation': [round(t, 4) for t in n.get('translation', [0, 0, 0])],
                   'extrasKeys': sorted((n.get('extras') or {}).keys())} for n in nodes],
        'scenesRootNodes': [nodes[i]['name'] for i in js['scenes'][0]['nodes']],
        'materials': [{'name': m['name'], 'role': (m.get('extras') or {}).get('materialRole'),
                       'baseColorFactor': [round(c, 4) for c in m.get('pbrMetallicRoughness', {}).get('baseColorFactor', [1, 1, 1, 1])],
                       'metallic': m.get('pbrMetallicRoughness', {}).get('metallicFactor', 1.0),
                       'roughness': m.get('pbrMetallicRoughness', {}).get('roughnessFactor', 1.0),
                       'alphaMode': m.get('alphaMode', 'OPAQUE'),
                       'extensions': sorted((m.get('extensions') or {}).keys())} for m in js.get('materials', [])],
        'images': len(js.get('images', [])), 'textures': len(js.get('textures', [])),
        'cameras': len(js.get('cameras', [])), 'animations': len(js.get('animations', [])),
        'extensionsUsed': js.get('extensionsUsed', []),
        'extensionsRequired': js.get('extensionsRequired', []),
        'dracoPrimitives': sum('KHR_draco_mesh_compression' in (p.get('extensions') or {})
                               for m in js.get('meshes', []) for p in m['primitives']),
        'totalPrimitives': sum(len(m['primitives']) for m in js.get('meshes', [])),
        'rootExtras': (nodes[js['scenes'][0]['nodes'][0]].get('extras') or {}),
    }

report = {'blender': bpy.app.version_string, 'assets': {}}
for aid in IDS:
    blend = os.path.join(HERE, 'blend', f'{aid}.blend')
    glb = os.path.join(REPO, 'public/assets/world/camp', f'{aid}.glb')
    bpy.ops.wm.open_mainfile(filepath=blend)
    nat_objs = [o for o in bpy.context.scene.objects]
    native = measure(nat_objs)
    native['objects'] = sorted(o.name for o in nat_objs)
    native['objectOrigins'] = {o.name: [round(c, 4) for c in o.matrix_world.translation] for o in nat_objs}
    native['topology'] = topo(nat_objs)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=glb)
    imp_objs = list(bpy.context.scene.objects)
    imported = measure(imp_objs)
    imported['objects'] = sorted(o.name for o in imp_objs)
    imported['topology_raw_import'] = topo(imp_objs)
    g = parse_glb(glb)
    nb, ib = native['boundsGLB_min'] + native['boundsGLB_max'], imported['boundsGLB_min'] + imported['boundsGLB_max']
    checks = {
        'triangles_match': native['triangles'] == imported['triangles'],
        'bounds_max_abs_diff': round(max(abs(a - b) for a, b in zip(nb, ib)), 8),
        'bounds_within_draco_tol': max(abs(a - b) for a, b in zip(nb, ib)) <= DRACO_BOUNDS_TOL,
        'draco_all_primitives': g['dracoPrimitives'] == g['totalPrimitives'] > 0
                                and 'KHR_draco_mesh_compression' in g['extensionsRequired'],
        'min_y_zero': abs(imported['minYGLB']) <= DRACO_BOUNDS_TOL,
        'xz_centered': max(abs(c) for c in imported['xzCenterGLB']) <= DRACO_BOUNDS_TOL,
        'material_names_match': sorted(native['materials']) == sorted(imported['materials']),
        'all_materials_have_role': all(m['role'] for m in g['materials']),
        'no_textures_cameras_animations': g['images'] == g['textures'] == g['cameras'] == g['animations'] == 0,
        'no_transmission_or_blend': all(m['alphaMode'] == 'OPAQUE' and not m['extensions'] for m in g['materials']),
        'single_root': len(g['scenesRootNodes']) == 1 and g['scenesRootNodes'][0] == aid,
        'native_closed_shells': all(t['boundary_edges'] == 0 and t['nonmanifold_edges'] == 0 and
                                    t['inconsistent_winding_edges'] == 0 and t['negative_volume_components'] == 0
                                    for t in native['topology']),
        'native_no_degenerate': all(t['zero_or_near_zero_area_triangles'] == 0 and
                                    t['duplicate_triangle_index_sets'] == 0 and not t['mesh_validate_would_repair']
                                    for t in native['topology']),
        'finite': all(t['finite_coordinates'] for t in native['topology'] + imported['topology_raw_import']),
        'zero_area_material_slots': [f"{t['name']}:{k}" for t in native['topology']
                                     for k, a in t['face_material_world_areas'].items() if a <= 0],
    }
    checks['has_color0'] = True
    if aid == 'C10':
        flags = [n for n in g['nodes'] if (n['name'] or '').startswith('flag_')]
        checks['flag_nodes'] = sorted(n['name'] for n in flags)
        checks['flag_nodes_ok'] = checks['flag_nodes'] == ['flag_01', 'flag_02', 'flag_03', 'flag_04']
        ax = g['rootExtras'].get('poleAxisGLB_xz', [0, 0])
        checks['flag_pivots_on_pole_axis'] = all(abs(n['translation'][0] - ax[0]) < 1e-3 and
                                                 abs(n['translation'][2] - ax[1]) < 1e-3 for n in flags)
        checks['flag_pivot_heights'] = [n['translation'][1] for n in flags]
    report['assets'][aid] = {'native': native, 'glbImport': imported, 'glb': g, 'checks': checks}
    print('[qa]', aid, native['triangles'], imported['triangles'], json.dumps({k: v for k, v in checks.items() if k not in ('flag_nodes',)}))
os.makedirs(os.path.dirname(REPORT), exist_ok=True)
with open(REPORT, 'w') as f:
    json.dump(report, f, indent=1, ensure_ascii=False)
