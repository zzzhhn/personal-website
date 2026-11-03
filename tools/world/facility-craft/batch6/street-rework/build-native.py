"""Turn each near runtime builder into an editable .blend and a portable GLB."""
from pathlib import Path
import hashlib
import importlib.util
import json
import sys
import bpy

root = Path.cwd()
directory = Path(sys.argv[sys.argv.index('--') + 1])
helper = root / 'tools/world/facility-craft/street/build_native.py'
spec = importlib.util.spec_from_file_location('street_archive', helper)
archive = importlib.util.module_from_spec(spec)
spec.loader.exec_module(archive)
base_material = archive.material


def physical_material(signature):
    material = base_material(signature)
    slot = round(-signature[3])
    if slot in (2, 3):
        principled = material.node_tree.nodes.get('Principled BSDF')
        principled.inputs['Roughness'].default_value = .43 if slot == 2 else .3
        principled.inputs['Metallic'].default_value = .08 if slot == 2 else .72
    return material


archive.material = physical_material
for family in ('roadblock', 'lamp', 'signal'):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    archive.MATERIALS = {}
    source = directory / (family + '.source.json')
    document = json.loads(source.read_text())
    collection = bpy.data.collections.new(family + '.editable')
    bpy.context.scene.collection.children.link(collection)
    node = document['nodes'][0]
    archive.add_nodes([node], collection, family)
    before = archive.bounds(collection)
    expected = len(node['index']) // 3
    bpy.context.scene['sourceSHA256'] = hashlib.sha256(source.read_bytes()).hexdigest()
    bpy.context.scene['archiveBoundary'] = document['archiveBoundary']
    bpy.ops.wm.save_as_mainfile(filepath=str(directory / (family + '.blend')), compress=True)
    target = directory / (family + '.glb')
    bpy.ops.export_scene.gltf(filepath=str(target), export_format='GLB', export_yup=True,
                             export_attributes=True, export_extras=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(target))
    meshes = [obj.data for obj in bpy.context.scene.objects if obj.type == 'MESH']
    for mesh in meshes:
        mesh.calc_loop_triangles()
    triangles = sum(len(mesh.loop_triangles) for mesh in meshes)
    after = archive.bounds(bpy.context.scene.collection)
    delta = max(abs(before[i][j] - after[i][j]) for i in range(2) for j in range(3))
    assert triangles == expected and delta < 1e-5, (family, triangles, expected, delta)
    print('NATIVE_CHECK', family, triangles, delta, flush=True)
