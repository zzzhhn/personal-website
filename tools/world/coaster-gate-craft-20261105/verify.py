"""Inspect the exported GLB using only Python's stdlib. No Blender or rendering.

Checks actual root datums, bounds, normals, UVs, triangles, material/image inventory,
static clear corridor and live-sign rectangle. Records closed/open leaf envelopes.
These are geometry contracts, not visual, collision sweep or performance acceptance.
"""
import argparse
import hashlib
import json
import math
import struct
from pathlib import Path
from visible_signature import signature

ROOT = Path(__file__).resolve().parents[3]
parser = argparse.ArgumentParser()
parser.add_argument('--output', type=Path,
                    default=ROOT / 'docs/world/phase-2-playground/coaster-gate-craft-20261105')
args = parser.parse_args()
out = args.output.resolve()
path = out / 'coaster-gate.glb'
blob = path.read_bytes()
assert struct.unpack_from('<III', blob) == (0x46546c67, 2, len(blob))
json_size, chunk_type = struct.unpack_from('<II', blob, 12)
assert chunk_type == 0x4e4f534a
doc = json.loads(blob[20:20 + json_size])
bin_offset = 20 + json_size
bin_size, bin_type = struct.unpack_from('<II', blob, bin_offset)
assert bin_type == 0x004e4942
binary = blob[bin_offset + 8:bin_offset + 8 + bin_size]


def accessor(index):
    a = doc['accessors'][index]
    view = doc['bufferViews'][a['bufferView']]
    formats = {5126: 'f', 5125: 'I', 5123: 'H', 5121: 'B'}
    channels = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}
    fmt = '<' + formats[a['componentType']] * channels[a['type']]
    stride = view.get('byteStride', struct.calcsize(fmt))
    start = view.get('byteOffset', 0) + a.get('byteOffset', 0)
    return [struct.unpack_from(fmt, binary, start + i * stride) for i in range(a['count'])]


def descendants(index):
    node = doc['nodes'][index]
    yield index
    for child in node.get('children', []):
        yield from descendants(child)


def bound(points):
    return {'min': [min(p[k] for p in points) for k in range(3)],
            'max': [max(p[k] for p in points) for k in range(3)]}


report = {'asset': 'coaster-gate.glb', 'sha256': hashlib.sha256(blob).hexdigest(),
          'bytes': len(blob), 'roots': {}, 'materials': [], 'images': [],
          'scope': 'static exported geometry; runtime, visual uplift and performance unverified'}
for name in ('GateStatic', 'GateLeaf', 'GateKey', 'GateLeafShadow'):
    ids = [i for i, node in enumerate(doc['nodes']) if node.get('name') == name]
    assert len(ids) == 1, (name, ids)
    points, faces, primitive_count, materials = [], [], 0, set()
    for i in descendants(ids[0]):
        node = doc['nodes'][i]
        assert not node.get('matrix'), (name, 'unexpected node matrix')
        assert all(abs(v) < 1e-6 for v in node.get('translation', [0, 0, 0])), (name, 'translation')
        assert all(abs(a - b) < 1e-6 for a, b in zip(node.get('rotation', [0, 0, 0, 1]), [0, 0, 0, 1])), (name, 'rotation')
        assert all(abs(v - 1) < 1e-6 for v in node.get('scale', [1, 1, 1])), (name, 'scale')
        if 'mesh' not in node:
            continue
        for primitive in doc['meshes'][node['mesh']]['primitives']:
            assert primitive.get('mode', 4) == 4
            attrs = primitive['attributes']
            for required in ('POSITION', 'NORMAL', 'TEXCOORD_0'):
                assert required in attrs, (name, required)
            p, n, uv = [accessor(attrs[k]) for k in ('POSITION', 'NORMAL', 'TEXCOORD_0')]
            assert len(p) == len(n) == len(uv)
            assert all(math.isfinite(v) for values in (p, n, uv) for row in values for v in row)
            assert all(abs(sum(v * v for v in row) - 1) < .005 for row in n), name
            indices = [v[0] for v in accessor(primitive['indices'])]
            assert len(indices) % 3 == 0 and all(0 <= j < len(p) for j in indices)
            for j in range(0, len(indices), 3):
                triangle = [p[k] for k in indices[j:j + 3]]
                a, b, c = triangle
                u, v = [b[k] - a[k] for k in range(3)], [c[k] - a[k] for k in range(3)]
                cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
                assert sum(t * t for t in cross) > 1e-19, (name, 'degenerate triangle')
                faces.append(triangle)
            points.extend(p)
            primitive_count += 1
            materials.add(primitive['material'])
    assert points
    report['roots'][name] = {**bound(points), 'triangles': len(faces), 'primitives': primitive_count,
                             'materials': len(materials), 'vertices': len(points)}
    if name == 'GateStatic':
        # Anything below the lintel remains outside the unchanged open corridor.
        assert all(abs(x) >= 4.999 for x, y, z in points if y < 5.70), 'Ten metre passage narrowed'
        # Physical sign rails stay outside the live atlas face. Backing pan may
        # occupy the same x/y, but must stay behind z=1.03.
        assert all(not (abs(x) < 4.10 and 6.04 < y < 6.76 and z >= 1.029)
                   for x, y, z in points), 'Atlas rectangle obstructed'
    if name in ('GateLeaf', 'GateLeafShadow'):
        b = bound(points)
        assert b['min'][0] >= -.13 and b['max'][0] <= 5.076
        assert b['min'][1] >= .09 and b['max'][1] <= 3.191
        assert b['min'][2] >= -.181 and b['max'][2] <= .181
        # Existing mirrored leaf is transformed by parent -side before its ±1.45
        # Y rotation. Save both articulated envelopes for coordinator review.
        poses = {}
        for side in (-1, 1):
            for opened in (False, True):
                angle = side * 1.45 if opened else 0
                co, si = math.cos(angle), math.sin(angle)
                transformed = []
                for x, y, z in points:
                    x *= -side
                    transformed.append((side * 5 + co * x + si * z, y, -si * x + co * z))
                poses[f'{side}:{"open" if opened else "closed"}'] = bound(transformed)
        report['leafPoses' if name == 'GateLeaf' else 'shadowLeafPoses'] = poses
    if name == 'GateLeafShadow':
        assert len(faces) < 1200, 'shadow leaf exceeds the bounded complexity target'
        assert primitive_count == 1
        # Runtime only borrows this authored source and derives position/index.
        report['shadowCarrierBufferBytes'] = len(points) * 12 + len(faces) * 3 * 2
    if name == 'GateKey':
        b = bound(points)
        assert b['min'][0] >= -.406 and b['max'][0] <= .712
        assert b['min'][1] >= -.226 and b['max'][1] <= .226
        assert max(abs(b['min'][2]), abs(b['max'][2])) < .08

for material in doc['materials']:
    pbr = material['pbrMetallicRoughness']
    assert material.get('alphaMode', 'OPAQUE') == 'OPAQUE'
    assert not material.get('doubleSided', False)
    assert not material.get('emissiveFactor') or max(material['emissiveFactor']) == 0
    report['materials'].append({'name': material['name'], 'roughness': pbr.get('roughnessFactor', 1),
                                'metallic': pbr.get('metallicFactor', 1),
                                'extensions': list(material.get('extensions', {}))})
for image in doc.get('images', []):
    assert 'bufferView' in image and 'uri' not in image, 'Textures must be embedded'
    view = doc['bufferViews'][image['bufferView']]
    data = binary[view.get('byteOffset', 0):view.get('byteOffset', 0) + view['byteLength']]
    assert data.startswith(b'\x89PNG\r\n\x1a\n')
    w, h = struct.unpack_from('>II', data, 16)
    assert (w, h) == (256, 256)
    report['images'].append({'name': image.get('name'), 'width': w, 'height': h, 'bytes': len(data)})
assert len(doc['materials']) <= 6
assert len(doc.get('images', [])) <= 2
assert 'animations' not in doc and 'cameras' not in doc and 'KHR_lights_punctual' not in doc.get('extensionsUsed', [])
assert report['roots']['GateStatic']['primitives'] <= 5
assert report['roots']['GateLeaf']['primitives'] <= 4
assert report['roots']['GateKey']['primitives'] <= 2
for axis in ('min', 'max'):
    assert all(abs(a-b) < 1e-5 for a, b in zip(report['roots']['GateLeaf'][axis], report['roots']['GateLeafShadow'][axis])), 'shadow outer envelope changed'
baseline = json.loads((ROOT / 'docs/world/phase-2-playground/coaster-gate-craft-20261105/visible-before-shadow.json').read_text())
current = signature(path)
assert current['roots'] == baseline['roots'], 'Visible geometry/material/texture signature changed'
report['visibleInvariance'] = {'beforeGlbSha256': baseline['glbSha256'], 'afterGlbSha256': current['glbSha256'],
                              'beforeVisibleSha256': baseline['visibleSha256'], 'afterVisibleSha256': current['visibleSha256'],
                              'allVisibleRootsEqual': True}
report['totalTriangles'] = sum(v['triangles'] for v in report['roots'].values())
report['drawPrimitivesOneStaticTwoLeavesOneKey'] = sum(
    report['roots'][name]['primitives'] * count for name, count in [('GateStatic', 1), ('GateLeaf', 2), ('GateKey', 1)])
(out / 'export-check.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'verified': True, 'triangles': report['totalTriangles'],
                  'roots': report['roots'], 'images': len(report['images']),
                  'materials': len(report['materials']),
                  'drawPrimitives': report['drawPrimitivesOneStaticTwoLeavesOneKey'],
                  'shadowCarrierBufferBytes': report['shadowCarrierBufferBytes'],
                  'visibleInvariance': report['visibleInvariance']}))
