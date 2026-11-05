"""Editable archival export of the exact runtime geometry, not a substitute runtime asset.
blender --background --factory-startup --threads 2 --python build-native.py -- source.json output.blend [output.glb]
No rendering, mesh repair, topology cleanup, or lighting changes are performed.
"""
import bpy
import json
import sys
from pathlib import Path

args = sys.argv[sys.argv.index('--') + 1:]
source_path, blend_path = map(Path, args[:2])
source = json.loads(source_path.read_text())
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
bpy.context.preferences.filepaths.save_version = 0
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1
collection = bpy.data.collections.new('CoasterRailCraft_RuntimeDerivedEditable')
scene.collection.children.link(collection)

settings = {
    'runningSteel': ((.48, .56, .60, 1), .90, .24),
    'coatedSteel': ((.065, .11, .15, 1), .32, .38),
    'jointSteel': ((.40, .35, .27, 1), .82, .30),
    'concrete': ((.43, .46, .43, 1), 0, .86),
}
materials = {}
for name, (color, metal, roughness) in settings.items():
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = color
    bsdf.inputs['Metallic'].default_value = metal
    bsdf.inputs['Roughness'].default_value = roughness
    materials[name] = mat

for part in source['parts']:
    coords = part['positions']
    # Three Y-up to native Blender Z-up once. Exporter converts back once.
    vertices = [(coords[i], -coords[i + 2], coords[i + 1]) for i in range(0, len(coords), 3)]
    idx = part['indices']
    faces = [idx[i:i + 3] for i in range(0, len(idx), 3)]
    mesh = bpy.data.meshes.new(part['name'])
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    uv = mesh.uv_layers.new(name='FabricationMetres')
    values = part['uv']
    for loop in mesh.loops:
        uv.data[loop.index].uv = values[loop.vertex_index * 2:loop.vertex_index * 2 + 2]
    normals = part['normals']
    mesh.normals_split_custom_set_from_vertices([(normals[i], -normals[i + 2], normals[i + 1]) for i in range(0, len(normals), 3)])
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    obj = bpy.data.objects.new(part['name'], mesh)
    obj.data.materials.append(materials[part['material']])
    obj['runtime_family'] = part['family']
    obj['runtime_source'] = str(source_path)
    collection.objects.link(obj)

scene['source_identity'] = 'Exact createCoasterRailVisualCraft runtime-generated representative; material constants are offline inspection defaults.'
scene['source_json'] = str(source_path)
scene['centre_u'] = source['centre']
scene['half_length_metres'] = source['halfLength']
blend_path.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
if len(args) > 2:
    bpy.ops.export_scene.gltf(filepath=args[2], export_format='GLB', use_selection=False, export_extras=True)
print(json.dumps({'blend': str(blend_path), 'objects': len(collection.objects), 'triangles': sum(len(o.data.polygons) for o in collection.objects), 'rendered': False}))
