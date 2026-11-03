"""Run in Blender background mode with arguments JSON_PATH OUTPUT_DIRECTORY."""
import json
import sys
from pathlib import Path

import bpy

source, output = (Path(arg).resolve() for arg in sys.argv[sys.argv.index("--") + 1:])
output.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.unit_settings.system = "METRIC"
data = json.loads(source.read_text())
stem = data.get("name", "intake-bench")
collection = bpy.data.collections.new(stem)
bpy.context.scene.collection.children.link(collection)
parts = data["parts"]
finishes = {part["material"]: part["finish"] for part in parts}
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

for part in parts:
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

bpy.ops.wm.save_as_mainfile(filepath=str(output / f"{stem}.blend"))
bpy.ops.export_scene.gltf(filepath=str(output / f"{stem}.glb"), export_format="GLB")
