"""Blender background arguments: STRUCTURE_SOURCE_JSON OUTPUT_DIRECTORY."""
import json
import sys
from array import array
from pathlib import Path

import bpy

source, output = (Path(arg).resolve() for arg in sys.argv[sys.argv.index("--") + 1:])
output.mkdir(parents=True, exist_ok=True)
stem = source.name.removesuffix(".source.json")
data = json.loads(source.read_text())
assert data["units"] == "metres" and data["up"] == "Y"
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.unit_settings.system = "METRIC"
collection = bpy.data.collections.new(stem)
bpy.context.scene.collection.children.link(collection)

for part in data["parts"]:
    name = part["part"]
    position, normal, rgb = (part[channel] for channel in ("position", "normal", "color"))
    assert len(position) == len(normal) == len(rgb)
    vertices = [(x - 50, -195 - z, y - 1) for x, y, z in zip(*[iter(position)] * 3)]
    normals = [(x, -z, y) for x, y, z in zip(*[iter(normal)] * 3)]
    faces = list(zip(*[iter(part["index"])] * 3))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    mesh.polygons.foreach_set("use_smooth", [True] * len(faces))
    mesh.normals_split_custom_set_from_vertices(normals)
    tint = mesh.color_attributes.new(name="Runtime base pigment", type="FLOAT_COLOR", domain="POINT")
    rgba = array("f")
    for r, g, b in zip(*[iter(rgb)] * 3):
        rgba.extend((r, g, b, 1))
    tint.data.foreach_set("color", rgba)

    material = bpy.data.materials.new(name)
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Roughness"].default_value = part["roughness"]
    shader.inputs["Metallic"].default_value = part["metalness"]
    base = material.node_tree.nodes.new("ShaderNodeVertexColor")
    base.layer_name = tint.name
    material.node_tree.links.new(base.outputs["Color"], shader.inputs["Base Color"])
    mesh.materials.append(material)
    collection.objects.link(bpy.data.objects.new(name, mesh))

bpy.ops.wm.save_as_mainfile(filepath=str(output / f"{stem}.blend"), compress=True)
bpy.ops.export_scene.gltf(filepath=str(output / f"{stem}.glb"), export_format="GLB")
