"""Batch 4: editable, topology-preserving leaf craft from actual accepted trees.

Blender -b --factory-startup -P tools/world/nature-craft/build_trees.py -- --ids G17 ST1 --render
No baseline files/materials are overwritten. --render only renders G17/ST1.
"""
import argparse
import hashlib
import json
import math
from itertools import product
import struct
from pathlib import Path
import sys

import bpy
from mathutils import Matrix, Quaternion, Vector

REPO = Path(__file__).resolve().parents[3]
OUT = REPO / 'docs/world/phase-2-playground/asset-batch4-20261102'
BLEND = REPO / 'tools/world/nature-craft/blend'
GLB = REPO / 'public/assets/world/nature-craft'
IDS = ('G16', 'G17', 'G18', 'ST1', 'ST2')
COLOR = 'TreePigment'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def digest(value):
    return hashlib.sha256(json.dumps(value, separators=(',', ':')).encode()).hexdigest()


def source(aid):
    folder = 'street' if aid.startswith('ST') else 'camp/nature-v4'
    return REPO / 'tools/world' / folder / 'blend' / (aid + '.blend')


def objects():
    return sorted((o for o in bpy.context.scene.objects if o.type == 'MESH'), key=lambda o: o.name)


def bounds(ob):
    pts = [ob.matrix_world @ v.co for v in ob.data.vertices]
    return [[min(p[k] for p in pts) for k in range(3)], [max(p[k] for p in pts) for k in range(3)]]


def snapshot():
    bpy.context.view_layer.update()
    rows = {}
    for ob in objects():
        me = ob.data
        me.calc_loop_triangles()
        wind = me.attributes.get('_WIND') or me.attributes.get('_wind')
        if wind is None or wind.domain != 'POINT':
            raise RuntimeError('Missing POINT wind: ' + ob.name)
        coords = [list(v.co) for v in me.vertices]
        faces = [list(p.vertices) for p in me.polygons]
        referenced = {i for face in faces for i in face}
        weights = [list(v.color) for v in wind.data]
        rows[ob.name] = dict(vertices=len(coords), triangles=len(me.loop_triangles),
                             geometryHash=digest([coords, faces]), windHash=digest(weights),
                             faceReferencedVertices=len(referenced), unreferencedVertices=len(coords) - len(referenced),
                             bounds=bounds(ob), degenerate=sum(t.area < 1e-12 for t in me.loop_triangles),
                             rootHash=digest([list(r) for r in ob.matrix_world]),
                             parent=ob.parent.name if ob.parent else None,
                             materials=[m.name for m in me.materials],
                             windRange=[[min(w[k] for w in weights), max(w[k] for w in weights)] for k in range(4)])
    return rows


def check_native(before, after):
    assert before.keys() == after.keys(), 'Object hierarchy changed'
    checks = {}
    for name, old in before.items():
        new = after[name]
        exact = ('vertices', 'triangles', 'faceReferencedVertices', 'unreferencedVertices', 'windHash', 'bounds', 'rootHash', 'parent')
        for key in exact:
            assert old[key] == new[key], (name, key, old[key], new[key])
        trunk = 'trunk' in name.lower()
        if trunk:
            assert old['geometryHash'] == new['geometryHash'], 'Trunk/collider changed: ' + name
        if name.startswith('L1'):
            assert old['geometryHash'] == new['geometryHash'], 'Authored L1 geometry changed: ' + name
        assert new['degenerate'] <= old['degenerate'], 'New degenerate faces: ' + name
        checks[name] = dict(topologyCountExact=True, rootAndParentExact=True, windAllFourChannelsExact=True,
                            envelopeExact=True, trunkEveryVertexAndFaceExact=trunk,
                            originalGeometryHash=old['geometryHash'], candidateGeometryHash=new['geometryHash'])
    return checks


def leaf_material():
    # Single reusable opaque double-sided physical response. Full pigment lives in COLOR_0.
    mat = bpy.data.materials.new('nature-craft-leaf-pigment')
    mat.use_nodes = True
    mat.diffuse_color = (1, 1, 1, 1)
    mat.use_backface_culling = False
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (1, 1, 1, 1)
    bsdf.inputs['Roughness'].default_value = .87
    bsdf.inputs['Metallic'].default_value = 0
    vc = mat.node_tree.nodes.new('ShaderNodeVertexColor')
    vc.layer_name = COLOR
    vc.label = 'Authored leaf pigment; linear RGB, no baked lighting'
    mat.node_tree.links.new(vc.outputs['Color'], bsdf.inputs['Base Color'])
    mat['materialRole'] = 'foliage'
    mat['batch4'] = 'rolled midrib; buried petiole pigment; original palette'
    return mat


def refine(ob, mat):
    me = ob.data
    wind = me.attributes.get('_WIND') or me.attributes.get('_wind')
    part = me.attributes.get('part_kind')
    if part is None or part.domain != 'FACE':
        raise RuntimeError('Missing native FACE part_kind: ' + ob.name)
    original_bounds = [[min(v.co[k] for v in me.vertices), max(v.co[k] for v in me.vertices)] for k in range(3)]
    original_co = [v.co.copy() for v in me.vertices]
    # Derive independent blades from the native face tag, never from GLB split vertex order.
    leaf_faces = [p for p in me.polygons if part.data[p.index].value == 2]
    adj = {}
    for p in leaf_faces:
        for vi in p.vertices:
            adj.setdefault(vi, set()).update(p.vertices)
    visited, changed = set(), 0
    for seed in adj:
        if seed in visited:
            continue
        pending, component = [seed], []
        while pending:
            vi = pending.pop()
            if vi in visited:
                continue
            visited.add(vi)
            component.append(vi)
            pending.extend(adj[vi] - visited)
        # L1's authored decimation remains exactly as authored; only color is refined there.
        if len(component) != 7 or ob.name.startswith('L1'):
            continue
        by_flutter = sorted(component, key=lambda i: wind.data[i].color[2])
        p, mid, tip = by_flutter[0], by_flutter[3], by_flutter[-1]
        if abs(wind.data[mid].color[2] - .45) > .01:
            continue
        axis = (original_co[tip] - original_co[p]).normalized()
        offset = original_co[mid] - original_co[p]
        normal = offset - axis * offset.dot(axis)
        if normal.length < 1e-7:
            continue
        normal.normalize()
        width = (original_co[by_flutter[4]] - original_co[by_flutter[5]]).length
        # Roll the existing central rachis and cup the broad shoulders. Same seven points,
        # six triangles, buried petiole and tip; this changes reflected facets, not resolution.
        for vi, amount in [(mid, .14), (by_flutter[4], -.025), (by_flutter[5], -.025)]:
            co = original_co[vi].copy()
            # Freeze any original extremal point so the original culling/canopy envelope is exact.
            if any(abs(co[k] - q) < 1e-8 for k in range(3) for q in original_bounds[k]):
                continue
            co += normal * width * amount
            for k in range(3):
                co[k] = min(original_bounds[k][1], max(original_bounds[k][0], co[k]))
            me.vertices[vi].co = co
        changed += 1
    if me.color_attributes.get(COLOR):
        me.color_attributes.remove(me.color_attributes[COLOR])
    colors = me.color_attributes.new(name=COLOR, type='FLOAT_COLOR', domain='CORNER')
    me.color_attributes.active_color = colors
    # Adding a CustomData layer can relocate layer storage; reacquire the native tags.
    part = me.attributes['part_kind']
    wind = me.attributes.get('_WIND') or me.attributes.get('_wind')
    old_mats = list(me.materials)
    for poly in me.polygons:
        old_mat = old_mats[poly.material_index]
        bsdf = old_mat.node_tree.nodes.get('Principled BSDF') if old_mat.use_nodes else None
        base = tuple(bsdf.inputs['Base Color'].default_value[:3]) if bsdf else tuple(old_mat.diffuse_color[:3])
        is_leaf = part.data[poly.index].value == 2
        for li in poly.loop_indices:
            vi = me.loops[li].vertex_index
            flutter = wind.data[vi].color[2]
            if is_leaf:
                # Buried petiole is darker, blade opens into the original pigment, midrib
                # carries a quiet paler streak. No world-facing lighting is baked into color.
                factor = .78 + .24 * min(1, flutter / .6)
                if abs(flutter - .45) < .025:
                    factor += .09
            else:
                factor = .94  # cores recede slightly behind the unchanged attached sprigs
            colors.data[li].color = (*[min(1.0, max(0.0, c * factor)) for c in base], 1)
        poly.material_index = 0
    me.materials.clear()
    me.materials.append(mat)
    me.update()
    protected = [v.index for v in me.vertices if wind.data[v.index].color[2] in (0.0, 1.0)]
    assert all(me.vertices[i].co == original_co[i] for i in protected), 'Leaf petiole/tip/core moved: ' + ob.name
    if ob.name.startswith('L1'):
        assert all(v.co == original_co[v.index] for v in me.vertices), 'Authored L1 geometry moved'
    ob['natureCraft'] = 'batch4-preserved-wind'
    return dict(rolledBlades=changed, originalLeafVertices=len(adj), colors=len(colors.data),
                lodGeometryRetained=ob.name.startswith('L1'), petioleTipAndCoreVerticesExact=len(protected))


def export(aid):
    bpy.ops.object.select_all(action='DESELECT')
    for ob in bpy.context.scene.objects:
        if ob.type in {'MESH', 'EMPTY'}:
            ob.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(GLB / (aid + '.glb')), export_format='GLB', use_selection=True,
                              export_apply=True, export_yup=True, export_normals=True,
                              export_materials='EXPORT', export_extras=True, export_attributes=True,
                              export_vertex_color='NAME', export_vertex_color_name=COLOR, export_all_vertex_colors=False,
                              export_texcoords=False, export_tangents=False, export_animations=False,
                              export_cameras=False, export_lights=False, export_skins=False,
                              export_morph=False, export_image_format='NONE',
                              export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
                              export_draco_position_quantization=20, export_draco_normal_quantization=10,
                              export_draco_color_quantization=12, export_draco_generic_quantization=16)


def rig(aid):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 24
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 768
    scene.render.resolution_y = 768
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.film_transparent = False
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    scene.view_settings.exposure = 0
    scene.view_settings.gamma = 1
    scene.world = bpy.data.worlds.new('TreeReviewWorld')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.22, .25, .29, 1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value = .45
    # Fixed metre-space rig per representative, shared baseline/native/fresh. L1 is
    # deliberately hidden for presentation only; all authored LODs remain exported.
    for ob in objects():
        ob.hide_render = ob.name.startswith('L1')
    target = Vector((0, 0, 3.0))
    camdata = bpy.data.cameras.new('TreeReviewCamera')
    cam = bpy.data.objects.new('TreeReviewCamera', camdata)
    scene.collection.objects.link(cam)
    cam.location = (8.0, -11.0, 6.3)
    cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
    camdata.type = 'ORTHO'
    camdata.ortho_scale = 7.3
    scene.camera = cam
    for name, pos, power, size in [('Key', (3, -4, 9), 1050, 5), ('Fill', (-4, -1, 5), 450, 5), ('Rim', (1, 5, 7), 700, 4)]:
        data = bpy.data.lights.new('TreeReview' + name, 'AREA')
        data.energy, data.shape, data.size = power, 'DISK', size
        ob = bpy.data.objects.new(data.name, data)
        scene.collection.objects.link(ob)
        ob.location = pos
        ob.rotation_euler = (target - ob.location).to_track_quat('-Z', 'Y').to_euler()
    return dict(camera=list(cam.location), target=list(target), orthoScale=camdata.ortho_scale,
                resolution=[768, 768], samples=24, renderer='Cycles CPU', exposure=0,
                viewTransform=scene.view_settings.view_transform, look=scene.view_settings.look,
                environmentStrength=.45, keyFillRimWatts=[1050, 450, 700], lod='L0 only')


def render(aid, stage):
    setup = rig(aid)
    path = OUT / f'trees-{aid}-{stage}.png'
    bpy.context.scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    # Remove only this function's named rig. Never save it into the editable source.
    for ob in list(bpy.context.scene.objects):
        if ob.name.startswith('TreeReview'):
            bpy.data.objects.remove(ob, do_unlink=True)
    return dict(path=str(path.relative_to(REPO)), sha256=sha(path), rig=setup)


def vertex_contract():
    out = {}
    for ob in objects():
        attr = ob.data.attributes.get('_WIND') or ob.data.attributes.get('_wind')
        pigment = ob.data.color_attributes.get(COLOR)
        per_vertex = {}
        if pigment:
            for loop in ob.data.loops:
                per_vertex.setdefault(loop.vertex_index, []).append(list(pigment.data[loop.index].color))
        referenced = {i for p in ob.data.polygons for i in p.vertices}
        # The original Street DECIMATE leaves loose source vertices. glTF triangle
        # primitives correctly omit them. Preserve them in native, record their count,
        # and require complete round-trip coverage of every actually referenced vertex.
        out[ob.name] = [(list(ob.matrix_world @ v.co), list(attr.data[v.index].color), per_vertex.get(v.index, []))
                        for v in ob.data.vertices if v.index in referenced]
    return out


def root_contract():
    bpy.context.view_layer.update()
    return {ob.name: dict(parent=ob.parent.name if ob.parent else None,
                          local=[list(r) for r in ob.matrix_local], world=[list(r) for r in ob.matrix_world])
            for ob in bpy.context.scene.objects if ob.type == 'EMPTY'}


def check_roots(expected, actual, tolerance=0):
    assert expected.keys() == actual.keys(), ('Root hierarchy changed', list(expected), list(actual))
    for name, root in expected.items():
        assert root['parent'] == actual[name]['parent'], ('Root parent', name)
        for frame in ('local', 'world'):
            error = max(abs(root[frame][i][k] - actual[name][frame][i][k]) for i in range(4) for k in range(4))
            assert error <= tolerance, ('Root transform', name, frame, error)
    return dict(allRootParentsAndTransformsMatched=True, tolerance=tolerance, roots=actual)


def glb_root_check(aid, expected):
    raw = (GLB / (aid + '.glb')).read_bytes()
    json_length = struct.unpack_from('<I', raw, 12)[0]
    data = json.loads(raw[20:20 + json_length])
    matches = [(i, n) for i, n in enumerate(data['nodes']) if n.get('name') == aid]
    assert len(matches) == 1, ('GLB asset root missing', aid)
    index, node = matches[0]
    assert index in data['scenes'][data.get('scene', 0)]['nodes'], ('GLB asset root is not scene root', aid)
    if 'matrix' in node:
        matrix = Matrix([node['matrix'][i:i + 4] for i in range(0, 16, 4)]).transposed()
    else:
        q = node.get('rotation', [0, 0, 0, 1])
        matrix = Matrix.LocRotScale(Vector(node.get('translation', [0, 0, 0])),
                                   Quaternion((q[3], q[0], q[1], q[2])), Vector(node.get('scale', [1, 1, 1])))
    up = Matrix.Rotation(-math.pi / 2, 4, 'X')
    desired = up @ Matrix(expected[aid]['local']) @ up.inverted()
    error = max(abs(matrix[i][k] - desired[i][k]) for i in range(4) for k in range(4))
    assert error < 1e-6, ('Exported GLB root transform changed', aid, error)
    return dict(sceneRoot=aid, matrix=[list(r) for r in matrix], maxError=error, nativeZToGlbYAppliedOnce=True)


def fresh_check(aid, native, authored, roots):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(GLB / (aid + '.glb')))
    root_validation = check_roots(roots, root_contract(), tolerance=1e-6)
    fresh = snapshot()
    assert fresh.keys() == native.keys(), ('Fresh hierarchy changed', list(fresh), list(native))
    for name, old in native.items():
        new = fresh[name]
        assert new['triangles'] == old['triangles'], ('Fresh triangles', name)
        error = max(abs(new['bounds'][i][k] - old['bounds'][i][k]) for i in range(2) for k in range(3))
        assert error < 5e-5, ('Fresh bounds', name, error)
        for k in range(4):
            assert max(abs(new['windRange'][k][j] - old['windRange'][k][j]) for j in range(2)) < .001, ('Fresh wind range', name, k)
        assert new['degenerate'] <= old['degenerate'], ('Fresh degenerates', name)
        # Import can split vertices at normal/color seams and Draco reorders them.
        # Check every imported position AND all four wind channels against the actual
        # authored vertex, rather than comparing only extrema or vertex indices.
        cell = 1e-4
        bins = {}
        for index, (co, weight, color) in enumerate(authored[name]):
            key = tuple(math.floor(v / cell) for v in co)
            bins.setdefault(key, []).append((index, co, weight, color))
        ob = bpy.data.objects[name]
        wind = ob.data.attributes.get('_WIND') or ob.data.attributes.get('_wind')
        covered, max_position_error, max_wind_error = set(), 0, 0
        for vertex in ob.data.vertices:
            co = ob.matrix_world @ vertex.co
            weights = list(wind.data[vertex.index].color)
            key = tuple(math.floor(v / cell) for v in co)
            candidates = [entry for delta in product((-1, 0, 1), repeat=3)
                          for entry in bins.get(tuple(key[k] + delta[k] for k in range(3)), [])]
            matches = [(idx, p, w, c) for idx, p, w, c in candidates
                       if max(abs(co[k] - p[k]) for k in range(3)) < 5e-5
                       and max(abs(weights[k] - w[k]) for k in range(4)) < .001]
            assert matches, ('Fresh position/wind correspondence', name, list(co), weights)
            for index, p, w, color in matches:
                covered.add(index)
            _, point, weight, _ = min(matches, key=lambda e: sum((co[k] - e[1][k]) ** 2 for k in range(3)))
            max_position_error = max(max_position_error, max(abs(co[k] - point[k]) for k in range(3)))
            max_wind_error = max(max_wind_error, max(abs(weights[k] - weight[k]) for k in range(4)))
        assert len(covered) == len(authored[name]), ('Fresh lost face-referenced authored vertices', name, len(covered), len(authored[name]))
        new['vertexContract'] = dict(allFaceReferencedAuthoredVerticesCovered=True, everyImportedWindMatched=True,
                                     coverageScope='all face-referenced source vertices; original loose native vertices retained but not exported',
                                     originalUnreferencedVertices=old['unreferencedVertices'],
                                     maxPositionErrorMetres=max_position_error, maxWindError=max_wind_error,
                                     trunkColliderUnchangedWithinExportPrecision='trunk' in name.lower())
        if 'crown' in name.lower():
            ob = bpy.data.objects[name]
            # _WIND is itself FLOAT_COLOR; its mere existence does not prove COLOR_0.
            pigment = next((a for a in ob.data.color_attributes if a.name not in ('_WIND', '_wind')), None)
            assert pigment is not None, 'GLB lost leaf COLOR_0'
            max_color_error = 0
            for loop in ob.data.loops:
                co = ob.matrix_world @ ob.data.vertices[loop.vertex_index].co
                key = tuple(math.floor(v / cell) for v in co)
                candidates = [entry for delta in product((-1, 0, 1), repeat=3)
                              for entry in bins.get(tuple(key[k] + delta[k] for k in range(3)), [])]
                expected = [c for _, p, _, colors in candidates
                            if max(abs(co[k] - p[k]) for k in range(3)) < 5e-5 for c in colors]
                actual = pigment.data[loop.index if pigment.domain == 'CORNER' else loop.vertex_index].color
                error = min((max(abs(actual[k] - c[k]) for k in range(4)) for c in expected), default=1)
                # glTF importer commonly stores display color in BYTE_COLOR; account for
                # its 8-bit sRGB conversion as well as 12-bit Draco color quantization.
                assert error < .008, ('Fresh leaf pigment', name, error)
                max_color_error = max(max_color_error, error)
            new['vertexContract']['maxLinearColorError'] = max_color_error
    return fresh, root_validation


def render_overview():
    """One bounded native-only family image; no extra export and no native mutation."""
    missing = [aid for aid in IDS if not (BLEND / (aid + '.blend')).exists()]
    assert not missing, ('--render-all requires generated native files for all five trees', missing)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for index, aid in enumerate(IDS):
        with bpy.data.libraries.load(str(BLEND / (aid + '.blend')), link=False) as (available, loaded):
            loaded.objects = list(available.objects)
        for ob in loaded.objects:
            bpy.context.scene.collection.objects.link(ob)
        for root in (ob for ob in loaded.objects if ob.parent is None):
            root.location.x += (index - 2) * 6.2
    setup = rig('G17')
    scene = bpy.context.scene
    cam = scene.camera
    target = Vector((0, 0, 3))
    cam.location = (0, -25, 10)
    cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
    cam.data.ortho_scale = 33
    scene.render.resolution_x, scene.render.resolution_y = 1536, 640
    # An overview uses a uniform directional key so the two end trees do not lose
    # exposure merely because they are farther from the representative's area rig.
    for light in (o for o in scene.objects if o.type == 'LIGHT'):
        light.hide_render = True
    data = bpy.data.lights.new('TreeReviewOverviewSun', 'SUN')
    data.energy, data.angle = 2.0, .35
    sun = bpy.data.objects.new(data.name, data)
    scene.collection.objects.link(sun)
    sun.rotation_euler = (math.radians(28), math.radians(-25), math.radians(-32))
    for index, aid in enumerate(IDS):
        data = bpy.data.curves.new('TreeReviewLabel' + aid, 'FONT')
        data.body, data.align_x, data.size = aid, 'CENTER', .45
        label = bpy.data.objects.new(data.name, data)
        scene.collection.objects.link(label)
        label.location = ((index - 2) * 6.2, -1.4, .1)
        label.rotation_euler = cam.rotation_euler
    scene.render.filepath = str(OUT / 'trees-native-overview.png')
    bpy.ops.render.render(write_still=True)
    setup.update(camera=list(cam.location), target=list(target), orthoScale=33, resolution=[1536, 640],
                 placementsX=[(i - 2) * 6.2 for i in range(5)], note='Native family review; same source dimensions; L0 only')
    setup.pop('keyFillRimWatts')
    setup['sun'] = dict(energy=2.0, angle=.35, rotationDegrees=[28, -25, -32])
    return dict(path=str((OUT / 'trees-native-overview.png').relative_to(REPO)),
                sha256=sha(OUT / 'trees-native-overview.png'), rig=setup)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ids', nargs='+', choices=IDS, default=list(IDS))
    parser.add_argument('--render', action='store_true', help='Same-rig baseline/native/fresh for selected G17/ST1 only')
    parser.add_argument('--render-all', action='store_true', help='One overview of all five generated native trees after this invocation')
    parser.add_argument('--verify-only', action='store_true', help='Recheck saved native and GLB against actual baseline; no export or render')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    for path in (BLEND, GLB, OUT):
        path.mkdir(parents=True, exist_ok=True)
    manifest_path = OUT / 'trees-manifest.json'
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {'assets': {}}
    manifest.update(generator=str(Path(__file__).relative_to(REPO)), units='metres', nativeUp='Z', glbUp='Y',
                    sourceLicense='Existing project-authored nature-v4/street assets; no external maps',
                    imageMaps=0, runtime='one merged draw per species/LOD, existing wind shader',
                    visualAcceptance='pending primary review and actual day/night runtime comparison')
    for aid in args.ids:
        bpy.ops.wm.open_mainfile(filepath=str(source(aid)))
        bpy.context.preferences.filepaths.save_version = 0
        before = snapshot()
        baseline_roots = root_contract()
        if args.verify_only:
            bpy.ops.wm.open_mainfile(filepath=str(BLEND / (aid + '.blend')))
            native = snapshot()
            roots = root_contract()
            validations = check_native(before, native)
            native_root_validation = check_roots(baseline_roots, roots)
            exported_root_validation = glb_root_check(aid, roots)
            fresh, fresh_roots = fresh_check(aid, native, vertex_contract(), roots)
            row = manifest['assets'].setdefault(aid, {})
            row.update(baseline=before, native=native, freshGLB=fresh, invariants=validations,
                       nativeRoots=native_root_validation, glbRoot=exported_root_validation, freshRoots=fresh_roots)
            manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
            print('TREE_CRAFT_VERIFIED', aid, flush=True)
            continue
        images = {}
        do_render = args.render and aid in ('G17', 'ST1')
        if do_render:
            images['baseline'] = render(aid, 'baseline')
        mat = leaf_material()
        edits = {ob.name: refine(ob, mat) for ob in objects() if 'crown' in ob.name.lower()}
        native = snapshot()
        authored = vertex_contract()
        roots = root_contract()
        native_root_validation = check_roots(baseline_roots, roots)
        validations = check_native(before, native)
        # Undo presentation-only visibility before save/export. Runtime owns the LOD choice.
        for ob in objects():
            ob.hide_render = False
        bpy.ops.wm.save_as_mainfile(filepath=str(BLEND / (aid + '.blend')))
        export(aid)
        exported_root_validation = glb_root_check(aid, roots)
        if do_render:
            images['native'] = render(aid, 'native')
        fresh, fresh_roots = fresh_check(aid, native, authored, roots)
        if do_render:
            images['freshGLB'] = render(aid, 'fresh')
        manifest['assets'][aid] = dict(source=str(source(aid).relative_to(REPO)), sourceSha256=sha(source(aid)),
                                      nativeFile=str((BLEND / (aid + '.blend')).relative_to(REPO)),
                                      nativeSha256=sha(BLEND / (aid + '.blend')),
                                      glb=str((GLB / (aid + '.glb')).relative_to(REPO)),
                                      glbSha256=sha(GLB / (aid + '.glb')), glbBytes=(GLB / (aid + '.glb')).stat().st_size,
                                      baseline=before, native=native, freshGLB=fresh, invariants=validations,
                                      nativeRoots=native_root_validation, glbRoot=exported_root_validation, freshRoots=fresh_roots,
                                      edits=edits, renders=images,
                                      roundTripToleranceMetres=5e-5, roundTripWindRangeTolerance=.001)
        manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
        print('TREE_CRAFT_OK', aid, json.dumps(edits), flush=True)
    if args.render_all:
        manifest['nativeFamilyOverview'] = render_overview()
        manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')


if __name__ == '__main__':
    main()
