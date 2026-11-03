"""Archive the exact selected runtime batches as editable meshes and verify portable readback."""
import hashlib
import gzip
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


directory = Path(sys.argv[sys.argv.index('--') + 1])
for family in ('pavilion', 'basin'):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version = 0
    source = directory / (family + '.source.json.gz')
    archive = json.loads(gzip.decompress(source.read_bytes()))
    scene = bpy.context.scene
    scene['runtimeSourceSHA256'] = hashlib.sha256(source.read_bytes()).hexdigest()
    scene['runtimeOriginMetresYUp'] = archive['origin']
    scene['archiveBoundary'] = 'Visible source and finish UV/role. Procedural shader, collision, lights and water execute in the game.'
    materials = {}
    total = 0
    for part in archive['meshes']:
        batch = part['batch']
        if batch not in materials:
            material = materials[batch] = bpy.data.materials.new(batch)
            material.use_nodes = True
            shader = material.node_tree.nodes.get('Principled BSDF')
            shader.inputs['Roughness'].default_value = part['roughness']
            vertex = material.node_tree.nodes.new('ShaderNodeVertexColor')
            vertex.layer_name = 'Col'
            material.node_tree.links.new(vertex.outputs['Color'], shader.inputs['Base Color'])
        name = part['part'] + '.' + batch
        mesh = bpy.data.meshes.new(name)
        positions = [convert(part['position'][i:i+3]) for i in range(0, len(part['position']), 3)]
        normals = [convert(part['normal'][i:i+3]) for i in range(0, len(part['normal']), 3)]
        mesh.from_pydata(positions, [], [(i, i+1, i+2) for i in range(0, len(positions), 3)])
        mesh.update()
        mesh.normals_split_custom_set_from_vertices(normals)
        for face in mesh.polygons:
            face.use_smooth = True
        color = mesh.color_attributes.new(name='Col', type='FLOAT_COLOR', domain='POINT')
        color.data.foreach_set('color', [v for i in range(0, len(part['color']), 3) for v in part['color'][i:i+3] + [1]])
        mesh.color_attributes.active_color_index = 0
        mesh.color_attributes.render_color_index = 0
        finish = mesh.attributes.new(name='_DJC_FINISH', type='FLOAT_VECTOR', domain='POINT')
        finish.data.foreach_set('vector', part['finish'])
        uv = mesh.uv_layers.new(name='DJC_Finish_Metres')
        uv.data.foreach_set('uv', [v for loop in mesh.loops
                                   for v in part['finish'][loop.vertex_index*3:loop.vertex_index*3+2]])
        mesh.materials.append(materials[batch])
        scene.collection.objects.link(bpy.data.objects.new(name, mesh))
        total += len(positions) // 3
    bpy.context.view_layer.update()
    baseline_bounds = bounds()
    bpy.ops.wm.save_as_mainfile(filepath=str(directory / (family + '.blend')), compress=True)
    target = directory / (family + '.glb')
    bpy.ops.export_scene.gltf(filepath=str(target), export_format='GLB', export_yup=True, export_extras=True, export_attributes=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(target))
    bpy.context.view_layer.update()
    meshes = [obj.data for obj in bpy.context.scene.objects if obj.type == 'MESH']
    for mesh in meshes:
        mesh.calc_loop_triangles()
    observed = sum(len(mesh.loop_triangles) for mesh in meshes)
    assert all(mesh.color_attributes and '_DJC_FINISH' in mesh.attributes for mesh in meshes)
    observed_bounds = bounds()
    delta = max(abs(observed_bounds[a][b] - baseline_bounds[a][b]) for a in range(2) for b in range(3))
    assert observed == total and delta < 1e-5, (family, observed, total, delta)
    print('NATIVE_CHECK', family, total, delta, len(meshes), flush=True)
