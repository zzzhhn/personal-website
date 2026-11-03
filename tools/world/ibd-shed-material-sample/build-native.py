"""Archive selected visible coil-bay parts from the exact game builder."""
import hashlib
import json
from pathlib import Path
import sys

import bpy
from mathutils import Vector


def convert(coords):
    x, y, z = coords
    return x, -z, y


def bounds():
    points = [obj.matrix_world @ Vector(p) for obj in bpy.context.scene.objects
              if obj.type == 'MESH' for p in obj.bound_box]
    return [[fn(p[k] for p in points) for k in range(3)] for fn in (min, max)]


bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version = 0
directory = Path(sys.argv[sys.argv.index('--') + 1])
source = directory / 'coil-bay.source.json'
data = json.loads(source.read_text())
scene = bpy.context.scene
scene['gameSourceSHA256'] = hashlib.sha256(source.read_bytes()).hexdigest()
scene['archiveBoundary'] = 'Selected visible yard-local parts. Game owns procedural finish, night bake and collision.'
total = 0
for part in data['parts']:
    name = part['part']
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    shader = material.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Roughness'].default_value = part['roughness']
    shader.inputs['Metallic'].default_value = part['metalness']
    vertex = material.node_tree.nodes.new('ShaderNodeVertexColor')
    vertex.layer_name = 'Col'
    material.node_tree.links.new(vertex.outputs['Color'], shader.inputs['Base Color'])
    mesh = bpy.data.meshes.new(name)
    positions = [convert(part['position'][i:i+3]) for i in range(0, len(part['position']), 3)]
    normals = [convert(part['normal'][i:i+3]) for i in range(0, len(part['normal']), 3)]
    indices = [part['index'][i:i+3] for i in range(0, len(part['index']), 3)]
    mesh.from_pydata(positions, [], indices)
    mesh.update()
    mesh.normals_split_custom_set_from_vertices(normals)
    for face in mesh.polygons:
        face.use_smooth = True
    color = mesh.color_attributes.new(name='Col', type='FLOAT_COLOR', domain='POINT')
    color.data.foreach_set('color', [v for i in range(0, len(part['color']), 3) for v in part['color'][i:i+3] + [1]])
    mesh.color_attributes.active_color_index = 0
    mesh.color_attributes.render_color_index = 0
    mesh.materials.append(material)
    obj = bpy.data.objects.new(name, mesh)
    obj['surfaceRole'] = part['role']
    scene.collection.objects.link(obj)
    total += len(indices)
bpy.context.view_layer.update()
initial = bounds()
bpy.ops.wm.save_as_mainfile(filepath=str(directory / 'coil-bay.blend'), compress=True)
target = directory / 'coil-bay.glb'
bpy.ops.export_scene.gltf(filepath=str(target), export_format='GLB', export_yup=True, export_extras=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(target))
bpy.context.view_layer.update()
objects = [o for o in bpy.context.scene.objects if o.type == 'MESH']
for obj in objects:
    obj.data.calc_loop_triangles()
assert sum(len(o.data.loop_triangles) for o in objects) == total
assert {o['surfaceRole'] for o in objects} == {1, 2, 3, 4, 5}
assert all(o.data.color_attributes for o in objects)
actual = bounds()
delta = max(abs(actual[a][b] - initial[a][b]) for a in range(2) for b in range(3))
assert delta < 1e-5, (delta, initial, actual)
print('NATIVE_CHECK', len(objects), total, delta, flush=True)
