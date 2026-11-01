#!/usr/bin/env python3
"""Derive repeatable runtime assets without resaving the approved native/GLB.

python3 tools/world/djc-quality-pilot/runtime-assets.py
python3 tools/world/djc-quality-pilot/runtime-assets.py --verify-only
The orchestrator owns the shared heavy lock only during its single Blender job.
"""
import argparse
import collections
import copy
import hashlib
import json
import math
import os
from pathlib import Path
import re
import struct
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / 'docs/world/phase-2-playground/djc-quality-pilot-20261101'
OUT = ROOT / 'public/assets/world/club/bar'
REPORT = ROOT / 'docs/world/phase-2-playground/djc-runtime-20261101/asset-report.json'
LOCK = Path('/tmp/bobby-world-phase2-heavy.lock')
BLENDER = Path('/Applications/Blender.app/Contents/MacOS/Blender')
LIMIT = 25 * 1024 * 1024


def digest(data):
    return hashlib.sha256(data).hexdigest()


def file_record(path):
    return {'path': str(path.relative_to(ROOT)), 'bytes': path.stat().st_size, 'sha256': digest(path.read_bytes())}


def read_glb(path):
    raw = path.read_bytes()
    magic, version, length = struct.unpack_from('<III', raw)
    assert magic == 0x46546C67 and version == 2 and length == len(raw), path
    offset, chunks = 12, {}
    while offset < len(raw):
        size, kind = struct.unpack_from('<II', raw, offset)
        chunks[kind] = raw[offset + 8:offset + 8 + size]
        offset += size + 8
    assert offset == len(raw)
    return json.loads(chunks[0x4E4F534A]), chunks[0x004E4942]


def write_glb(path, doc, binary):
    encoded = json.dumps(doc, ensure_ascii=False, separators=(',', ':')).encode()
    encoded += b' ' * (-len(encoded) % 4)
    binary += b'\0' * (-len(binary) % 4)
    raw = struct.pack('<III', 0x46546C67, 2, 28 + len(encoded) + len(binary))
    raw += struct.pack('<II', len(encoded), 0x4E4F534A) + encoded
    raw += struct.pack('<II', len(binary), 0x004E4942) + binary
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix('.glb.tmp')
    temporary.write_bytes(raw)
    temporary.replace(path)


def view_bytes(doc, binary, index):
    view = doc['bufferViews'][index]
    assert view.get('buffer', 0) == 0
    start = view.get('byteOffset', 0)
    assert 0 <= start <= start + view['byteLength'] <= doc['buffers'][0]['byteLength'] <= len(binary)
    return binary[start:start + view['byteLength']]


def remap_views(value, mapping):
    if isinstance(value, dict):
        for key, item in value.items():
            if key == 'bufferView':
                value[key] = mapping[item]
            else:
                remap_views(item, mapping)
    elif isinstance(value, list):
        for item in value:
            remap_views(item, mapping)


def externalize(source, destination):
    original, binary = read_glb(source)
    doc = copy.deepcopy(original)
    assert len(doc['buffers']) == 1 and 'uri' not in doc['buffers'][0]
    images, image_views = [], set()
    for image in doc.get('images', []):
        assert 'bufferView' in image and 'uri' not in image, 'Expected embedded approved images'
        index = image.pop('bufferView')
        data = view_bytes(original, binary, index)
        extension = { 'image/png': '.png', 'image/jpeg': '.jpg' }[image['mimeType']]
        name = re.sub(r'[^A-Za-z0-9_-]+', '-', image.get('name', 'image')).strip('-')
        relative = Path('textures') / f'{name}-{digest(data)[:16]}{extension}'
        target = destination.parent / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists():
            assert target.read_bytes() == data, 'Hash-named texture collision'
        else:
            target.write_bytes(data)
        image['uri'] = relative.as_posix()
        image_views.add(index)
        images.append({**file_record(target), 'imageName': image.get('name'), 'uri': image['uri']})
    # Preserve every non-image view, including extension/accessor views.
    referenced = set()
    def refs(value):
        if isinstance(value, dict):
            for key, item in value.items():
                if key == 'bufferView': referenced.add(item)
                else: refs(item)
        elif isinstance(value, list):
            for item in value: refs(item)
    refs(doc)
    removed = image_views - referenced
    rebuilt, mapping, views = bytearray(), {}, []
    for index, view in enumerate(original['bufferViews']):
        if index in removed: continue
        rebuilt.extend(b'\0' * (-len(rebuilt) % 4))
        mapping[index] = len(views)
        rewritten = copy.deepcopy(view)
        rewritten['byteOffset'] = len(rebuilt)
        rebuilt.extend(view_bytes(original, binary, index))
        views.append(rewritten)
    doc['bufferViews'] = views
    remap_views(doc, mapping)
    doc['buffers'][0]['byteLength'] = len(rebuilt)
    write_glb(destination, doc, bytes(rebuilt))
    return {'images': images, 'removedImageBufferViews': len(removed), 'geometryBufferBytes': len(rebuilt)}


COMPONENTS = {5120: ('b', 1), 5121: ('B', 1), 5122: ('h', 2), 5123: ('H', 2), 5125: ('I', 4), 5126: ('f', 4)}
ELEMENTS = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def accessor_data(doc, binary, index):
    accessor = doc['accessors'][index]
    assert 'sparse' not in accessor, 'Sparse accessors need an explicit validator'
    view = doc['bufferViews'][accessor['bufferView']]
    data = view_bytes(doc, binary, accessor['bufferView'])
    fmt, size = COMPONENTS[accessor['componentType']]
    element_size = size * ELEMENTS[accessor['type']]
    stride = view.get('byteStride', element_size)
    offset, count = accessor.get('byteOffset', 0), accessor['count']
    assert count >= 0 and stride >= element_size and offset % size == 0
    assert count == 0 or offset + (count - 1) * stride + element_size <= len(data)
    if stride == element_size:
        return data[offset:offset + count * element_size], fmt
    return b''.join(data[offset + i * stride:offset + i * stride + element_size] for i in range(count)), fmt


def validate_asset(path):
    doc, binary = read_glb(path)
    for index in range(len(doc['bufferViews'])): view_bytes(doc, binary, index)
    accessor_hashes = []
    for index, accessor in enumerate(doc['accessors']):
        data, fmt = accessor_data(doc, binary, index)
        if fmt == 'f':
            assert all(math.isfinite(item[0]) for item in struct.iter_unpack('<f', data)), (path, index)
        accessor_hashes.append(digest(data))
    triangles = 0
    for mesh in doc['meshes']:
        for primitive in mesh['primitives']:
            assert primitive.get('mode', 4) == 4
            position = doc['accessors'][primitive['attributes']['POSITION']]
            assert position['type'] == 'VEC3' and position['componentType'] == 5126
            assert all(math.isfinite(v) for key in ['min', 'max'] for v in position[key])
            if 'indices' in primitive:
                data, fmt = accessor_data(doc, binary, primitive['indices'])
                indices = doc['accessors'][primitive['indices']]
                assert indices['count'] % 3 == 0
                assert all(item[0] < position['count'] for item in struct.iter_unpack('<' + fmt, data))
                triangles += indices['count'] // 3
            else:
                assert position['count'] % 3 == 0
                triangles += position['count'] // 3
    textures = []
    for image in doc['images']:
        assert 'bufferView' not in image and not image['uri'].startswith(('/', 'http:', 'https:', 'data:'))
        target = (path.parent / image['uri']).resolve()
        assert target.is_relative_to(OUT.resolve()) and target.is_file()
        textures.append(file_record(target))
    assert path.stat().st_size < LIMIT, f'Cloudflare per-file limit exceeded: {path}'
    transmission = [m['name'] for m in doc['materials'] if m.get('extensions', {}).get('KHR_materials_transmission', {}).get('transmissionFactor', 0) > 0]
    return {**file_record(path), 'triangles': triangles, 'meshes': len(doc['meshes']), 'materials': len(doc['materials']),
            'textures': textures, 'accessorDataSHA256': accessor_hashes, 'transmissionMaterials': transmission,
            'bufferViewAndAccessorRangesValid': True, 'indicesInRange': True, 'finiteAccessorFloats': True,
            'singleFileBelow25MiB': True, 'boundsYUp': glb_bounds(doc)}


def glb_bounds(doc):
    def matrix(node):
        if 'matrix' in node: return node['matrix']
        x, y, z, w = node.get('rotation', [0, 0, 0, 1])
        sx, sy, sz = node.get('scale', [1, 1, 1]); tx, ty, tz = node.get('translation', [0, 0, 0])
        return [(1-2*(y*y+z*z))*sx, 2*(x*y+z*w)*sx, 2*(x*z-y*w)*sx, 0,
                2*(x*y-z*w)*sy, (1-2*(x*x+z*z))*sy, 2*(y*z+x*w)*sy, 0,
                2*(x*z+y*w)*sz, 2*(y*z-x*w)*sz, (1-2*(x*x+y*y))*sz, 0, tx, ty, tz, 1]
    def multiply(a, b): return [sum(a[k*4+r]*b[c*4+k] for k in range(4)) for c in range(4) for r in range(4)]
    minimum, maximum = [math.inf]*3, [-math.inf]*3
    def visit(index, parent):
        node = doc['nodes'][index]; transform = multiply(parent, matrix(node))
        if 'mesh' in node:
            for primitive in doc['meshes'][node['mesh']]['primitives']:
                accessor = doc['accessors'][primitive['attributes']['POSITION']]
                for x in [accessor['min'][0], accessor['max'][0]]:
                    for y in [accessor['min'][1], accessor['max'][1]]:
                        for z in [accessor['min'][2], accessor['max'][2]]:
                            for axis in range(3):
                                v = transform[axis]*x+transform[4+axis]*y+transform[8+axis]*z+transform[12+axis]
                                minimum[axis] = min(minimum[axis], v); maximum[axis] = max(maximum[axis], v)
        for child in node.get('children', []): visit(child, transform)
    identity = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]
    for root in doc['scenes'][doc.get('scene', 0)]['nodes']: visit(root, identity)
    return {'min': minimum, 'max': maximum}


def verify_lossless(source, output):
    before, raw_before = read_glb(source); after, raw_after = read_glb(output)
    for key in ['meshes', 'nodes', 'materials', 'textures', 'samplers', 'scenes', 'scene', 'animations', 'extensionsUsed', 'extensionsRequired']:
        assert before.get(key) == after.get(key), f'Near asset changed {key}'
    assert len(before['accessors']) == len(after['accessors'])
    for index, original in enumerate(before['accessors']):
        expected, actual = copy.deepcopy(original), copy.deepcopy(after['accessors'][index])
        expected.pop('bufferView', None); actual.pop('bufferView', None)
        assert expected == actual
        assert accessor_data(before, raw_before, index)[0] == accessor_data(after, raw_after, index)[0]
        assert view_bytes(before, raw_before, original['bufferView']) == view_bytes(after, raw_after, after['accessors'][index]['bufferView'])
    for a, b in zip(before['images'], after['images']):
        assert view_bytes(before, raw_before, a['bufferView']) == (output.parent / b['uri']).read_bytes()
    return {'accessorBytesExact': True, 'allGeometryBufferViewsExact': True, 'nodesMaterialsTexturesSamplersExact': True,
            'externalImageBytesExact': True, 'accessorsVerified': len(before['accessors'])}


def blender_phase(output, stats_path):
    import bpy
    from mathutils import Vector
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE / 'djc-bar-pilot.blend'), load_ui=False, use_scripts=False)
    source = bpy.data.collections['02 · Refined bar pilot']
    working = bpy.data.collections.new('Runtime LOD1 disposable copies')
    bpy.context.scene.collection.children.link(working)
    def family(name): return re.sub(r'\.\d{3,}$', '', name)
    def triangles(obj):
        obj.data.calc_loop_triangles()
        return len(obj.data.loop_triangles)
    categories = collections.defaultdict(lambda: {'sourceObjects': 0, 'sourceTriangles': 0, 'removedObjects': 0, 'removedTriangles': 0, 'outputTriangles': 0})
    seen = collections.Counter()
    copies = []
    # Remove only sub-pixel details. Keep all glass/water and major props.
    drop_all = {'Dry palm eave fibre', 'Countersunk deck screw', 'Towel woven border'}
    thin = {'Rattan lamp rib': 3, 'Rattan lamp weave': 3, 'Woven seat warp': 2, 'Woven seat weft': 2, 'Hemp tie': 2}
    simplify = {'Curved palm leaflet': .45, 'Folded linen bar towel': .25}
    source_materials = set()
    for original in sorted(source.objects, key=lambda o: o.name):
        if original.type != 'MESH': continue
        kind = family(original.name); row = categories[kind]; count = triangles(original)
        row['sourceObjects'] += 1; row['sourceTriangles'] += count
        ordinal = seen[kind]; seen[kind] += 1
        source_materials.update(m.name for m in original.data.materials if m)
        if kind in drop_all or (kind in thin and ordinal % thin[kind] != 0):
            row['removedObjects'] += 1; row['removedTriangles'] += count
            continue
        obj = original.copy(); obj.data = original.data.copy(); working.objects.link(obj)
        obj.hide_viewport = False; obj.hide_render = False; obj.hide_set(False)
        if kind in simplify:
            modifier = obj.modifiers.new('Distant detail reduction', 'DECIMATE'); modifier.ratio = simplify[kind]
            bpy.context.view_layer.objects.active = obj
            bpy.ops.object.select_all(action='DESELECT'); obj.select_set(True)
            bpy.ops.object.modifier_apply(modifier=modifier.name)
        row['outputTriangles'] += triangles(obj)
        copies.append(obj)
    assert len(copies) > 18
    bounds_min, bounds_max = [math.inf]*3, [-math.inf]*3
    feet = []
    for obj in copies:
        points = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
        for axis in range(3):
            bounds_min[axis] = min(bounds_min[axis], min(p[axis] for p in points))
            bounds_max[axis] = max(bounds_max[axis], max(p[axis] for p in points))
        if family(obj.name) in ('Stool floor foot', 'Post stone foot'):
            feet.append({'name': obj.name, 'minZ': min(p.z for p in points)})
    assert len(feet) == 20 and all(abs(f['minZ']) < 1e-5 for f in feet), feet
    by_material = collections.defaultdict(list)
    for obj in copies:
        assert len(obj.data.materials) == 1 and obj.data.materials[0], obj.name
        by_material[obj.data.materials[0].name].append(obj)
    assert set(by_material) == source_materials, 'LOD must retain every material role'
    export_objects = []
    for name, objects in sorted(by_material.items()):
        bpy.ops.object.select_all(action='DESELECT')
        for obj in objects: obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        bpy.ops.object.join(); objects[0].name = 'DJC · ' + name
        export_objects.append(objects[0])
    bpy.ops.object.select_all(action='DESELECT')
    for obj in export_objects: obj.select_set(True)
    bpy.context.view_layer.objects.active = export_objects[0]
    bpy.ops.export_scene.gltf(filepath=str(output), export_format='GLB', use_selection=True,
        export_extras=True, export_materials='EXPORT', export_yup=True)
    stats = {'blender': bpy.app.version_string, 'sourceCollection': source.name,
        'sourceObjects': sum(r['sourceObjects'] for r in categories.values()),
        'sourceTriangles': sum(r['sourceTriangles'] for r in categories.values()),
        'derivedTriangles': sum(r['outputTriangles'] for r in categories.values()),
        'retainedObjectsBeforeMaterialMerge': len(copies), 'mergedMeshes': len(export_objects),
        'categories': dict(sorted(categories.items())), 'removedFamilies': sorted(drop_all),
        'periodicRetention': thin, 'decimationRatios': simplify, 'nativeBoundsZUp': {'min': bounds_min, 'max': bounds_max},
        'groundWitnesses': feet, 'materialNames': sorted(by_material), 'nativeSaved': False,
        'originPolicy': 'No object/root recentering; standard glTF Y-up export from native coordinates'}
    stats_path.write_text(json.dumps(stats, ensure_ascii=False, indent=2) + '\n')
    print('DJC_RUNTIME_LOD1 ' + json.dumps({k: stats[k] for k in ['sourceObjects', 'sourceTriangles', 'derivedTriangles', 'mergedMeshes']}), flush=True)


def material_contract(doc):
    def normalized(value):
        if isinstance(value, dict):
            result = {key: normalized(item) for key, item in value.items() if key != 'index'}
            if 'index' in value:
                texture = doc['textures'][value['index']]
                image = doc['images'][texture['source']]
                result['resolvedTexture'] = {'uri': image['uri'], 'sampler': doc.get('samplers', [])[texture['sampler']] if 'sampler' in texture else None}
            return result
        if isinstance(value, list): return [normalized(item) for item in value]
        return value
    return {material['name']: normalized(material) for material in doc['materials']}


def verify_outputs(native_source, original_source):
    near_path, far_path = OUT / 'djc-north-bar-v1.glb', OUT / 'djc-north-bar-lod1-v1.glb'
    near, far = validate_asset(near_path), validate_asset(far_path)
    exact = verify_lossless(original_source, near_path)
    near_doc, _ = read_glb(near_path); far_doc, _ = read_glb(far_path)
    near_uris = {image['uri'] for image in near_doc['images']}
    far_uris = {image['uri'] for image in far_doc['images']}
    assert near_uris == far_uris, 'LODs must share exactly the same unchanged external images'
    assert material_contract(near_doc) == material_contract(far_doc), 'LOD material behavior changed'
    assert far['triangles'] < near['triangles'] and far['meshes'] == near['meshes'] == 18
    assert near['transmissionMaterials'] and sorted(near['transmissionMaterials']) == sorted(far['transmissionMaterials'])
    return {'near': near, 'far': far, 'nearLosslessVerification': exact,
            'sharedImageUris': sorted(near_uris), 'sharedExternalImageBytes': sum((OUT / uri).stat().st_size for uri in near_uris),
            'lodMaterialBehaviorExact': True, 'texturesDownsampled': False, 'worldOrigin': [40.75, 1.2, 40],
            'nativeSource': file_record(native_source), 'approvedGlbSource': file_record(original_source)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--verify-only', action='store_true')
    parser.add_argument('--blender', type=Path, default=BLENDER)
    parser.add_argument('--blender-phase', type=Path)
    parser.add_argument('--stats', type=Path)
    arguments = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else None)
    if arguments.blender_phase:
        blender_phase(arguments.blender_phase, arguments.stats)
        return
    native_source, original_source = SOURCE / 'djc-bar-pilot.blend', SOURCE / 'djc-bar-pilot.glb'
    frozen = {path: digest(path.read_bytes()) for path in [native_source, original_source]}
    if arguments.verify_only:
        report = verify_outputs(native_source, original_source)
        print(json.dumps({'verified': True, 'nearTriangles': report['near']['triangles'], 'farTriangles': report['far']['triangles'], 'sharedImages': len(report['sharedImageUris'])}))
        return
    # Exclusive file creation never deletes or replaces another task's lock.
    token = json.dumps({'owner': 'djc-runtime-assets', 'pid': os.getpid(), 'startedUnix': time.time()})
    with LOCK.open('x') as handle: handle.write(token)
    try:
        OUT.mkdir(parents=True, exist_ok=True)
        near_externalization = externalize(original_source, OUT / 'djc-north-bar-v1.glb')
        with tempfile.TemporaryDirectory(prefix='djc-runtime-assets-') as temporary:
            temp = Path(temporary); far_path, stats_path = temp / 'lod1-embedded.glb', temp / 'lod1-native.json'
            command = [str(arguments.blender), '--background', '--factory-startup', '--threads', '2', '--python', str(Path(__file__).resolve()),
                       '--', '--blender-phase', str(far_path), '--stats', str(stats_path)]
            log_path = temp / 'blender.log'
            with log_path.open('w') as log:
                process = subprocess.run(command, stdout=log, stderr=subprocess.STDOUT, check=False)
            if process.returncode:
                print('\n'.join(log_path.read_text().splitlines()[-24:]), file=sys.stderr)
                raise RuntimeError(f'Blender export failed: {process.returncode}')
            lod = json.loads(stats_path.read_text())
            far_externalization = externalize(far_path, OUT / 'djc-north-bar-lod1-v1.glb')
        assert all(digest(path.read_bytes()) == sha for path, sha in frozen.items()), 'Approved sources changed'
        report = verify_outputs(native_source, original_source)
        report.update({'generatedUnix': time.time(), 'generator': file_record(Path(__file__).resolve()),
            'nearExternalization': near_externalization, 'farExternalization': far_externalization,
            'lodDerivation': lod, 'approvedSourcesUnchanged': True,
            'licenses': {'photographedWood': {'asset': 'Poly Haven Wood Table 001', 'license': 'CC0',
                'assetUrl': 'https://polyhaven.com/a/wood_table_001', 'licenseUrl': 'https://polyhaven.com/license',
                'sourceManifest': file_record(SOURCE / 'textures/sources.json')},
                'remainingTexturesAndModels': 'Authored for this DJC pilot; extracted unchanged from approved GLB'},
            'limits': {'maxSingleAssetBytesExclusive': LIMIT, 'renderedOrBrowserTested': False,
                'lodCreativeApproval': 'Pending runtime review; near asset preserves already approved geometry/materials'}})
        REPORT.parent.mkdir(parents=True, exist_ok=True)
        REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
        print(json.dumps({'report': str(REPORT.relative_to(ROOT)), 'near': {k: report['near'][k] for k in ['bytes', 'triangles', 'sha256']},
            'far': {k: report['far'][k] for k in ['bytes', 'triangles', 'sha256']}, 'sharedImages': len(report['sharedImageUris'])}))
    finally:
        if LOCK.exists() and LOCK.read_text() == token: LOCK.unlink()


if __name__ == '__main__': main()
