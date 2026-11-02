"""Apply the R10 G21 pigment/image recipe to frozen editable R9 geometry.

Run only after calibrate_rock_material.mjs, in the serial heavy window.
Does not join, remesh, triangulate, unwrap, bake, export or recalculate normals.
"""
import hashlib
import json
import math
import struct
from pathlib import Path
import bpy

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
REPORT = ROOT / 'docs/world/phase-2-playground/asset-batch6-20261103/nature-camp'
CFG = json.loads((HERE / 'G21-material-r10.json').read_text())
PC = CFG['pigment']


def clamp(a, b, x):
    return max(a, min(b, x))


def smooth(a, b, x):
    t = clamp(0, 1, (x - a) / (b - a))
    return t * t * (3 - 2 * t)


def pigment(v, role):
    x, y, z = v
    dx, dy = x - PC['centerXY'][0], y - PC['centerXY'][1]
    f = PC['fault']
    fault = smooth(f[0], f[1], dx + f[2] * dy)
    q = (z - PC['bottom'] + PC['bedDip'][0] * dx + PC['bedDip'][1] * dy) / PC['height'] - f[3] * fault
    thick = PC['thickness'] * clamp(0, 1, (dx - dy + .6) / 1.2)
    e = PC['bedEdges']
    bed = smooth(e[0], e[1], q) * (1 - smooth(e[2] + thick, e[3] + thick, q))
    host = PC['friableHost' if role == 1 else 'cleavedHost' if role == 2 else 'host']
    mineral = PC['friableMineral' if role == 1 else 'cleavedMineral' if role == 2 else 'mineral']
    foot = (1 - smooth(*PC['footDepth'], (z - PC['bottom']) / PC['height'])) * PC['footMix']
    return tuple((host[k] * (1 - bed) + mineral[k] * bed) * (1 - foot) + PC['foot'][k] * foot for k in range(3))


def native_geometry(objects):
    rows = []
    for o in sorted(objects, key=lambda x: x.name):
        me = o.data
        rows.append({'name': o.name, 'matrix': [list(r) for r in o.matrix_world],
                     'vertices': [list(v.co) for v in me.vertices],
                     'normals': [list(n.vector) for n in me.corner_normals],
                     'polygons': [list(f.vertices) for f in me.polygons],
                     'roles': [f.material_index for f in me.polygons],
                     'uv': {uv.name: [list(c.uv) for c in uv.data] for uv in me.uv_layers}})
    return hashlib.sha256(json.dumps(rows, sort_keys=True).encode()).hexdigest()


path = HERE / 'blend/G21.blend'
before_native_sha = hashlib.sha256(path.read_bytes()).hexdigest()
bpy.ops.wm.open_mainfile(filepath=str(path))
bpy.context.preferences.filepaths.save_version = 0
parts = [o for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith('G21 | bed ')]
assert len(parts) == 3, [o.name for o in parts]
geometry = native_geometry(parts)
record = json.loads((REPORT / 'G21-material-r10.json').read_text())
assert record['nativePending'], 'Do not apply an archived calibration twice'
image = bpy.data.images.load(str(ROOT / 'public/assets/world/nature-camp-craft' / record['image']['uri']), check_existing=False)
image.colorspace_settings.name = 'sRGB'
image.name = 'B6 | linear-calibrated CC0 mineral photograph 512'
image.pack()
mats = {m for o in parts for m in o.data.materials}
assert len(mats) == 3
for m in mats:
    bs = m.node_tree.nodes.get('Principled BSDF')
    mult = bs.inputs['Base Color'].links[0].from_node
    assert mult.blend_type == 'MULTIPLY'
    color_node = mult.inputs[1].links[0].from_node
    assert color_node.type == 'TEX_IMAGE'
    color_node.image = image
for o in parts:
    attr = o.data.color_attributes.get('Mineral')
    assert attr and attr.domain == 'CORNER'
    for face in o.data.polygons:
        for li in face.loop_indices:
            v = o.data.vertices[o.data.loops[li].vertex_index].co
            attr.data[li].color = pigment(v, face.material_index) + (1,)
assert native_geometry(parts) == geometry, 'Native geometry/normal/UV/transform/role changed'

# Independently read the final GLB COLOR_0 values, including the Z-up -> Y-up
# conversion, rather than trusting a report from the JS writer.
glb = (ROOT / 'public/assets/world/nature-camp-craft/G21.glb').read_bytes()
n = struct.unpack_from('<I', glb, 12)[0]
doc = json.loads(glb[20:20 + n]); binary = glb[28 + n:]
max_error = 0.; checked = 0
for mesh in doc['meshes']:
    for p in mesh['primitives']:
        a = doc['accessors'][p['attributes']['POSITION']]; av = doc['bufferViews'][a['bufferView']]
        c = doc['accessors'][p['attributes']['COLOR_0']]; cv = doc['bufferViews'][c['bufferView']]
        for i in range(c['count']):
            pos = struct.unpack_from('<3f', binary, av.get('byteOffset', 0) + a.get('byteOffset', 0) + i * av.get('byteStride', 12))
            exported = struct.unpack_from('<4H', binary, cv.get('byteOffset', 0) + c.get('byteOffset', 0) + i * cv.get('byteStride', 8))
            expected = pigment((pos[0], -pos[2], pos[1]), p['material'])
            max_error = max(max_error, *(abs(expected[k] - exported[k] / 65535) for k in range(3)))
            assert exported[3] == 65535
            checked += 1
assert max_error <= .5 / 65535 + 1e-10, max_error
bpy.data.objects['G21']['batch6Material'] = CFG['revision']
bpy.ops.wm.save_as_mainfile(filepath=str(path), compress=True)
# Read back the saved native scene and verify the actual persisted state.
bpy.ops.wm.open_mainfile(filepath=str(path))
parts = [o for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith('G21 | bed ')]
assert native_geometry(parts) == geometry, 'Saved native geometry changed'
max_native_error = 0.
for o in parts:
    attr = o.data.color_attributes['Mineral']
    for face in o.data.polygons:
        for li in face.loop_indices:
            v = o.data.vertices[o.data.loops[li].vertex_index].co
            expected = pigment(v, face.material_index)
            max_native_error = max(max_native_error, *(abs(attr.data[li].color[k] - expected[k]) for k in range(3)))
assert max_native_error < 1e-6, max_native_error
native_maps = []
for m in {m for o in parts for m in o.data.materials}:
    bs = m.node_tree.nodes.get('Principled BSDF')
    tex = bs.inputs['Base Color'].links[0].from_node.inputs[1].links[0].from_node
    assert tex.type == 'TEX_IMAGE' and tex.image.colorspace_settings.name == 'sRGB'
    packed_sha = hashlib.sha256(bytes(tex.image.packed_file.data)).hexdigest()
    assert packed_sha == record['image']['sha256'], 'Saved native baseColor image differs from GLB'
    native_maps.append({'material': m.name, 'packedImageSHA': packed_sha, 'colorSpace': tex.image.colorspace_settings.name})

# A fresh importer must consume actual final geometry, quantized pigments and
# the same image, independent of the saved Blender scene and recipe writer.
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(ROOT / 'public/assets/world/nature-camp-craft/G21.glb'))
bpy.context.view_layer.update()
fresh_error = 0.; fresh_storage_error = 0.; fresh_corners = 0; fresh_maps = []
def linear_to_srgb(x):
    return 12.92*x if x <= .0031308 else 1.055*x**(1/2.4)-.055
for o in bpy.context.scene.objects:
    if o.type != 'MESH':
        continue
    attr = o.data.color_attributes.active_color
    assert attr and attr.domain in ['POINT', 'CORNER']
    expected_storage = o.data.color_attributes.new('__expected_import_BYTE_COLOR', 'BYTE_COLOR', attr.domain)
    for face in o.data.polygons:
        name = o.data.materials[face.material_index].name
        role = 1 if 'friable' in name else 2 if 'shoulders' in name else 0
        for li in face.loop_indices:
            vi = o.data.loops[li].vertex_index
            expected = pigment(o.matrix_world @ o.data.vertices[vi].co, role)
            data = attr.data[li if attr.domain == 'CORNER' else vi]
            got = data.color
            fresh_error = max(fresh_error, *(abs(got[k] - expected[k]) for k in range(3)))
            # Blender 5.1 importer mesh.py creates BYTE_COLOR and writes linear
            # `color`; this adds an sRGB-byte storage quantization. Verify that
            # exact conversion separately, without relaxing native FLOAT_COLOR
            # or final GLB normalized uint16 precision contracts above.
            assert attr.data_type == 'BYTE_COLOR'
            expected16 = [math.floor(v*65535+.5)/65535 for v in expected]
            # Use Blender's actual storage conversion, including its transfer
            # lookup approximation near byte thresholds. A hand-written sRGB
            # round() differs by one byte at a few thresholds. This temporary
            # reference layer exists only in the throwaway imported scene.
            expected_data = expected_storage.data[li if attr.domain == 'CORNER' else vi]
            expected_data.color = tuple(expected16) + (1,)
            expected_byte = expected_data.color_srgb
            fresh_storage_error = max(fresh_storage_error, *(abs(data.color_srgb[k] - expected_byte[k]) for k in range(3)))
            fresh_corners += 1
    for m in o.data.materials:
        base_images = [n.image for n in m.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image and 'linear-calibrated' in n.image.name]
        assert len(base_images) == 1, (m.name, [n.name for n in m.node_tree.nodes])
        im = base_images[0]
        assert im.colorspace_settings.name == 'sRGB'
        payload = bytes(im.packed_file.data) if im.packed_file else Path(bpy.path.abspath(im.filepath)).read_bytes()
        image_sha = hashlib.sha256(payload).hexdigest()
        assert image_sha == record['image']['sha256']
        fresh_maps.append({'material': m.name, 'imageSHA': image_sha, 'colorSpace': im.colorspace_settings.name})
assert fresh_corners == 5962 * 3 and fresh_storage_error < 1e-6, (fresh_corners, fresh_storage_error)
archived_native = json.loads((REPORT/'manifest-rocks.json').read_text())['assets']['G21']['artifacts']['native']['sha256']
record.update(nativePending=False, native={'archivedR9SHA': archived_native, 'beforeThisSyncSHA': before_native_sha, 'afterSHA': hashlib.sha256(path.read_bytes()).hexdigest(), 'geometryBeforeAndAfterHash': geometry, 'persistedGeometryUnchanged': True, 'GLBColorsChecked': checked, 'GLBMaxQuantizationError': max_error, 'persistedNativeMaxColorError': max_native_error, 'persistedNativeMaps': native_maps, 'freshImportCornersChecked': fresh_corners, 'freshImportMaxColorErrorFrom8BitStorage': fresh_error, 'freshImportStorage':'Blender 5.1 glTF importer mesh.py creates BYTE_COLOR and stores incoming linear normalized uint16 colors as sRGB bytes; final GLB remains uint16 and saved editable native remains FLOAT_COLOR', 'freshImportMaxErrorAgainstExact8BitConversion': fresh_storage_error, 'freshImportMaps': fresh_maps})
(REPORT / 'G21-material-r10.json').write_text(json.dumps(record, indent=2) + '\n')
print(json.dumps({'nativeSynced': True, **record['native']}))
