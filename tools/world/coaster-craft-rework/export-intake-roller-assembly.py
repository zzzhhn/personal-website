"""Run in Blender background mode with arguments JSON_PATH OUTPUT_DIRECTORY."""
import json
import sys
from pathlib import Path

import bpy

source, output = (Path(arg).resolve() for arg in sys.argv[sys.argv.index("--") + 1:])
output.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.unit_settings.system = "METRIC"
collection = bpy.data.collections.new("Intake roller assembly")
bpy.context.scene.collection.children.link(collection)
finishes = {
    "Steel": ((0.408, 0.453, 0.478), 0.31, 0.64),
    "Copper coat": ((0.519, 0.209, 0.086), 0.76, 0.02),
    "Shaft steel": ((0.54, 0.60, 0.64), 0.65, 0.20),
    "Bearing steel": ((0.020, 0.048, 0.076), 0.65, 0.20),
}
materials = {}
for name, (rgb, roughness, metalness) in finishes.items():
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.diffuse_color = (*rgb, 1.0)
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = material.diffuse_color
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metalness
    materials[name] = material

for part in json.loads(source.read_text())["parts"]:
    vertices = list(zip(*[iter(part["vertices"])] * 3))
    normals = list(zip(*[iter(part["normals"])] * 3))
    faces = [(i, i + 1, i + 2) for i in range(0, len(vertices), 3)]
    mesh = bpy.data.meshes.new(part["name"])
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    for face in mesh.polygons:
        face.use_smooth = True
    mesh.normals_split_custom_set_from_vertices(normals)
    mesh.materials.append(materials[part["material"]])
    collection.objects.link(bpy.data.objects.new(part["name"], mesh))

bpy.ops.wm.save_as_mainfile(filepath=str(output / "intake-roller-assembly.blend"))
bpy.ops.export_scene.gltf(filepath=str(output / "intake-roller-assembly.glb"), export_format="GLB")
