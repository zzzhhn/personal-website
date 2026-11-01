"""Read-only QA for G16-G23: reopened native .blend vs fresh GLB import.

Run: Blender -b --factory-startup -P tools/world/camp/nature/inspect_nature.py
Writes docs/world/camp-slice/nature/qa_report.json and manifest.json.
"""
import bpy, json, os, sys, math, hashlib
from mathutils import Vector
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
sys.dont_write_bytecode = True
sys.path.insert(0, HERE)
import vendor_inspect_connectivity as vic

REPO = os.path.abspath(os.path.join(HERE, '../../../..'))
GLB_DIR = os.path.join(REPO, 'public/assets/world/camp')
DOC_DIR = os.path.join(REPO, 'docs/world/camp-slice/nature')
IDS = ['G16', 'G17', 'G18', 'G19', 'G20', 'G21', 'G22', 'G23']

# Declared targets, GLB axes (x = front/back depth, y = up, z = width), metres.
# Triangle budgets are this group's own declarations (not inherited) - see README.
TARGET = {
    'G16': dict(size=(3.8, 5.4, 3.8), budget=900),
    'G17': dict(size=(3.8, 4.8, 3.8), budget=900),
    'G18': dict(size=(3.8, 6.3, 3.8), budget=900),
    'G19': dict(size=(1.4, 1.0, 1.3), budget=300),
    'G20': dict(size=(1.4, 1.05, 2.1), budget=300),
    'G21': dict(size=(2.2, 1.5, 2.8), budget=120),
    'G22': dict(size=(1.3, 0.85, 1.6), budget=120),
    'G23': dict(size=(0.65, 0.4, 0.8), budget=120),
}
LEGACY = {'G16': 900, 'G17': 900, 'G18': 900, 'G19': 300, 'G20': 300, 'G21': 100, 'G22': 100, 'G23': 100}


def mesh_objects():
    return [o for o in bpy.context.scene.objects if o.type == 'MESH']


def world_bounds(objs):
    dg = bpy.context.evaluated_depsgraph_get()
    pts = []
    for o in objs:
        ev = o.evaluated_get(dg)
        me = ev.to_mesh()
        pts += [ev.matrix_world @ v.co for v in me.vertices]
        ev.to_mesh_clear()
    mn = [min(p[i] for p in pts) for i in range(3)]
    mx = [max(p[i] for p in pts) for i in range(3)]
    return mn, mx


def material_info(objs):
    out = {}
    for o in objs:
        for m in o.data.materials:
            if not m:
                continue
            b = m.node_tree.nodes.get('Principled BSDF') if m.use_nodes else None
            out[m.name] = dict(
                materialRole=m.get('materialRole'),
                baseColorLinear=[round(c, 5) for c in b.inputs['Base Color'].default_value[:3]] if b else None,
                roughness=round(b.inputs['Roughness'].default_value, 4) if b else None,
                metallic=round(b.inputs['Metallic'].default_value, 4) if b else None,
                emission=round(b.inputs['Emission Strength'].default_value, 4) if b else None,
            )
    return out


def component_contacts(objs):
    """Split every mesh object into vertex-connected components and BVH-overlap
    each pair (also across objects). Overlap = embedded/interpenetrating
    contact between distinct shells, not shared topology."""
    dg = bpy.context.evaluated_depsgraph_get()
    comps = []
    for obj in objs:
        ev = obj.evaluated_get(dg)
        me = ev.to_mesh()
        me.calc_loop_triangles()
        n = len(me.vertices)
        parent = list(range(n))

        def find(a):
            while parent[a] != a:
                parent[a] = parent[parent[a]]; a = parent[a]
            return a
        for e in me.edges:
            a, b = find(e.vertices[0]), find(e.vertices[1])
            if a != b:
                parent[a] = b
        co = [ev.matrix_world @ v.co for v in me.vertices]
        local = {}
        for t in me.loop_triangles:
            r = find(t.vertices[0])
            c = local.setdefault(r, dict(object=obj.name, tris=[], mats=set(), zmin=1e9, zmax=-1e9))
            c['tris'].append(tuple(t.vertices))
            c['mats'].add(me.materials[me.polygons[t.polygon_index].material_index].name)
            c['zmin'] = min(c['zmin'], *(co[i].z for i in t.vertices))
            c['zmax'] = max(c['zmax'], *(co[i].z for i in t.vertices))
        for c in local.values():
            c['bvh'] = BVHTree.FromPolygons(co, c['tris'])
            comps.append(c)
        ev.to_mesh_clear()
    edges = []
    for i in range(len(comps)):
        for j in range(i + 1, len(comps)):
            k = len(comps[i]['bvh'].overlap(comps[j]['bvh']))
            if k:
                edges.append([i, j, k])
    adj = {i: set() for i in range(len(comps))}
    for i, j, _ in edges:
        adj[i].add(j); adj[j].add(i)
    seen, stack = set(), [0]
    while stack:
        a = stack.pop()
        if a in seen:
            continue
        seen.add(a); stack += list(adj[a] - seen)
    return dict(
        components=[dict(index=i, object=c['object'], triangles=len(c['tris']), materials=sorted(c['mats']),
                         minZ=round(c['zmin'], 5), maxZ=round(c['zmax'], 5)) for i, c in enumerate(comps)],
        contact_pairs_overlapping_triangle_pairs=edges,
        contact_graph_connected=len(seen) == len(comps),
        isolated_components=[i for i in range(len(comps)) if not adj[i]] if len(comps) > 1 else [],
        method='BVHTree.overlap between vertex-connected components (incl. across nodes); overlap = embedded contact, not shared topology.',
    )


def summarize(conn):
    keys = ['boundary_edges', 'wire_edges', 'nonmanifold_edges', 'nonmanifold_vertices', 'inconsistent_winding_edges',
            'zero_or_near_zero_area_triangles', 'duplicate_triangle_index_sets', 'negative_volume_components',
            'zero_or_near_zero_volume_components', 'sliver_triangle_count']
    rows = conn['objects']
    s = {k: sum(r[k] for r in rows) for k in keys}
    s['finite_coordinates'] = all(r['finite_coordinates'] for r in rows)
    s['mesh_validate_would_repair'] = any(r['mesh_validate_would_repair'] for r in rows)
    s['min_triangle_shape_quality'] = round(min(r['min_triangle_shape_quality'] for r in rows), 5)
    s['components'] = sum(r['vertex_edge_components'] for r in rows)
    s['triangles'] = conn['triangles']
    s['face_material_world_areas'] = {k: round(v, 4) for r in rows for k, v in r['face_material_world_areas'].items()}
    return s


def gltf_json(path):
    import struct
    with open(path, 'rb') as f:
        data = f.read()
    ln = struct.unpack('<I', data[12:16])[0]
    j = json.loads(data[20:20 + ln])
    prims = sum(len(m['primitives']) for m in j.get('meshes', []))
    return dict(nodes=[n.get('name') for n in j.get('nodes', [])], meshes=len(j.get('meshes', [])), primitives=prims,
                materials=[dict(name=m['name'], extras=m.get('extras', {}),
                                baseColorFactor=[round(x, 5) for x in m.get('pbrMetallicRoughness', {}).get('baseColorFactor', [])],
                                roughness=m.get('pbrMetallicRoughness', {}).get('roughnessFactor'),
                                metallic=m.get('pbrMetallicRoughness', {}).get('metallicFactor', 1.0),
                                emissive=m.get('emissiveFactor')) for m in j.get('materials', [])],
                images=len(j.get('images', [])), textures=len(j.get('textures', [])),
                cameras=len(j.get('cameras', [])), lights=len(j.get('extensions', {}).get('KHR_lights_punctual', {}).get('lights', [])),
                animations=len(j.get('animations', [])),
                extensionsUsed=j.get('extensionsUsed', []), extensionsRequired=j.get('extensionsRequired', []),
                dracoPrimitives=sum('KHR_draco_mesh_compression' in p.get('extensions', {}) for m in j.get('meshes', []) for p in m['primitives']),
                sha256=hashlib.sha256(data).hexdigest(), bytes=len(data))


def main():
    report, manifest = {}, {}
    for aid in IDS:
        blend = os.path.join(HERE, 'blend', aid + '.blend')
        glb = os.path.join(GLB_DIR, aid + '.glb')
        bpy.ops.wm.open_mainfile(filepath=blend)
        objs = mesh_objects()
        root = [o for o in bpy.context.scene.objects if o.parent is None][0]
        meta = {k: root[k] for k in root.keys() if not k.startswith('_')}
        if root.type == 'EMPTY':
            for o in objs:
                meta[o.name] = {k: o[k] for k in o.keys() if not k.startswith('_')}
        nat_mn, nat_mx = world_bounds(objs)
        nat_conn = vic.inspect_objects(objs)
        nat_contacts = component_contacts(objs)
        nat_mats = material_info(objs)
        origins = [list(o.matrix_world.translation) for o in bpy.context.scene.objects]
        node_names = sorted(o.name for o in objs)
        per_node_tris = {o.name: vic.inspect_object(o)['triangles'] for o in objs}
        # fresh import
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=glb)
        all_objs = list(bpy.context.scene.objects)
        iobjs = mesh_objects()
        imn, imx = world_bounds(iobjs)
        imp_conn = vic.inspect_objects(iobjs)
        imp_mats = material_info(iobjs)
        # Disposable tolerance-welded diagnostic (GLB splits vertices at flat
        # normals/material seams). Weld copies only; the deliverable is untouched.
        import bmesh
        WELD = 1e-4
        weld_objs = []
        for o in iobjs:
            bmw = bmesh.new(); bmw.from_mesh(o.data)
            bmesh.ops.remove_doubles(bmw, verts=bmw.verts, dist=WELD)
            mw = bpy.data.meshes.new(o.name + '_WELDDIAG'); bmw.to_mesh(mw); bmw.free()
            for m in o.data.materials:
                mw.materials.append(m)
            ow = bpy.data.objects.new(o.name + '_WELDDIAG', mw); ow.matrix_world = o.matrix_world
            bpy.context.scene.collection.objects.link(ow); weld_objs.append(ow)
        weld_s = summarize(vic.inspect_objects(weld_objs))
        weld_s['weld_tolerance_m'] = WELD
        gj = gltf_json(glb)
        # Blender Z-up (x, y, z) -> GLB (x, z, -y)
        size_glb = [imx[0] - imn[0], imx[2] - imn[2], imx[1] - imn[1]]
        nat_s, imp_s = summarize(nat_conn), summarize(imp_conn)
        bdiff = max(max(abs(a - b) for a, b in zip(nat_mn, imn)), max(abs(a - b) for a, b in zip(nat_mx, imx)))
        tgt = TARGET[aid]
        checks = {
            'minZ_is_0': abs(nat_mn[2]) < 1e-6 and abs(imn[2]) < 1e-4,
            'xy_center_is_0': max(abs(nat_mn[0] + nat_mx[0]), abs(nat_mn[1] + nat_mx[1])) / 2 < 1e-5,
            'origins_at_0': all(max(abs(c) for c in o) < 1e-9 for o in origins),
            'roundtrip_bounds_maxdiff_m': round(bdiff, 7),
            # Draco 20-bit position quantization: step = extent/2^20 (< 1e-5 m here)
            'roundtrip_bounds_ok': bdiff < 1e-4,
            'draco_all_primitives': gj['dracoPrimitives'] == gj['primitives'] and 'KHR_draco_mesh_compression' in gj['extensionsRequired'],
            'roundtrip_triangles_equal': nat_s['triangles'] == imp_s['triangles'],
            'within_declared_budget': nat_s['triangles'] <= tgt['budget'],
            'finite': nat_s['finite_coordinates'] and imp_s['finite_coordinates'],
            'no_degenerate_or_duplicate': nat_s['zero_or_near_zero_area_triangles'] == 0 and nat_s['duplicate_triangle_index_sets'] == 0,
            'native_closed_manifold_shells': nat_s['boundary_edges'] == 0 and nat_s['nonmanifold_edges'] == 0 and nat_s['nonmanifold_vertices'] == 0,
            'native_consistent_winding_positive_volumes': nat_s['inconsistent_winding_edges'] == 0 and nat_s['negative_volume_components'] == 0,
            'contact_graph_connected': nat_contacts['contact_graph_connected'],
            'material_roles_in_glb_extras': all(m['extras'].get('materialRole') for m in gj['materials']),
            'no_emission_no_metal_no_textures': gj['images'] == 0 and all((m['metallic'] or 0) == 0 and not any(m['emissive'] or [0]) for m in gj['materials']),
            'tree_has_crown_and_trunk_nodes': (node_names == ['crown', 'trunk']) if meta.get('kind') == 'tree' else True,
            'welded_import_closed_like_native': weld_s['boundary_edges'] == 0 and weld_s['nonmanifold_edges'] == 0 and weld_s['components'] == nat_s['components'] and weld_s['triangles'] == nat_s['triangles'],
            'no_presentation_objects': gj['cameras'] == 0 and gj['lights'] == 0 and all(o.type in ('MESH', 'EMPTY') for o in all_objs) and len(iobjs) == len(objs),
        }
        report[aid] = dict(meta=meta, checks=checks, native=nat_s, imported=imp_s, imported_welded_diagnostic=weld_s,
                           native_bounds=[nat_mn, nat_mx], imported_bounds=[imn, imx],
                           contacts=nat_contacts, native_materials=nat_mats, imported_materials=imp_mats, glb=gj,
                           imported_object_names=[o.name for o in all_objs])
        manifest[aid] = dict(
            title=meta.get('title'), kind=meta.get('kind'),
            glb=os.path.relpath(glb, REPO), blend=os.path.relpath(blend, REPO),
            sizeGLB_xyz_m=[round(v, 4) for v in size_glb], targetGLB_xyz_m=list(tgt['size']),
            trianglesEvaluated=nat_s['triangles'], trianglesGLBReimport=imp_s['triangles'],
            declaredBudget=tgt['budget'], legacyEstimate=LEGACY[aid],
            ratioToLegacyEstimate=round(nat_s['triangles'] / LEGACY[aid], 2),
            drawCallsPrimitives=gj['primitives'], nodes=gj['nodes'], trianglesPerNode=per_node_tris,
            materials={m['name']: m['extras'].get('materialRole') for m in gj['materials']},
            nativeComponents=nat_s['components'], roundtripBoundsMaxDiff_m=checks['roundtrip_bounds_maxdiff_m'], glbBytes=gj['bytes'], sha256=gj['sha256'],
            machineChecksAllTrue=all(v for k, v in checks.items() if isinstance(v, bool)),
        )
        if meta.get('kind') == 'tree':
            manifest[aid]['trunkAxisXY_blender'] = json.loads(meta.get('trunkAxisXY_blender', '[0,0]'))
            manifest[aid]['clumpCount'] = meta.get('clumpCount')
    os.makedirs(DOC_DIR, exist_ok=True)
    json.dump(report, open(os.path.join(DOC_DIR, 'qa_report.json'), 'w'), indent=1, default=str)
    json.dump(dict(blender=bpy.app.version_string, axes='GLB metres, +Y up, +X front; size = [x depth, y height, z width]',
                   compression='KHR_draco_mesh_compression (Blender bundled libextern_draco), position 20 bit, normal 10 bit, level 6',
                   assets=manifest), open(os.path.join(DOC_DIR, 'manifest.json'), 'w'), indent=1)
    for aid, m in manifest.items():
        bad = [k for k, v in report[aid]['checks'].items() if v is False]
        print('QA', aid, m['sizeGLB_xyz_m'], m['trianglesEvaluated'], m['trianglesGLBReimport'], 'prims', m['drawCallsPrimitives'],
              'comps', m['nativeComponents'], 'FAIL' if bad else 'ok', bad)


main()
