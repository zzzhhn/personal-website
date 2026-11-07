"""Builds the delivery-gate fixtures inside Blender and writes each verdict to JSON.

Run by test_live_gate.py:
  blender -b --factory-startup --python-exit-code 1 -P gate_cases.py -- <expert scripts> <out.json> <tmp dir>
"""

import json
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

SCRIPTS, OUT, TMP = sys.argv[sys.argv.index("--") + 1:][:3]
sys.path.insert(0, SCRIPTS)
import bx_audit  # noqa: E402


def empty():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def box(name, dims, loc, scale=(1, 1, 1), flip=False, uv=True, material=True, extra=None):
    """A UV'd box with its own material; extra adds a detached box to the same mesh."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    if uv:
        bm.loops.layers.uv.new("UVMap")
    bmesh.ops.create_cube(bm, size=1.0, calc_uvs=uv)
    bmesh.ops.scale(bm, vec=Vector(dims), verts=bm.verts)
    if extra:
        geom = bmesh.ops.create_cube(bm, size=1.0, calc_uvs=uv)["verts"]
        bmesh.ops.scale(bm, vec=Vector(extra[0]), verts=geom)
        bmesh.ops.translate(bm, vec=Vector(extra[1]), verts=geom)
    if flip:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    if material:
        me.materials.append(bpy.data.materials.new("M_" + name))
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    ob.location, ob.scale = loc, scale
    return ob


def crate(clean):
    """Body, label, handle, lid, bracket. Unclean: four planted defects, one per part."""
    empty()
    box("Body", (1.0, 0.7, 0.6), (0, 0, 0.3))
    if clean:
        box("Label", (0.44, 0.002, 0.16), (0, -0.3505, 0.32))
        box("Handle", (0.04, 0.30, 0.06), (0.51, 0, 0.42))
        box("Lid", (1.04, 0.74, 0.05), (0, 0, 0.623))
        box("Bracket", (0.12, 0.12, 0.06), (0.44, -0.29, 0.668))
    else:
        box("Label", (0.44, 0.002, 0.16), (0, -0.349, 0.32))  # front face on the body's
        box("Handle", (0.04, 0.30, 0.06), (0.54, 0, 0.42))  # 2 cm off the body
        box("Lid", (1, 1, 1), (0, 0, 0.623), scale=(1.04, 0.74, 0.05))  # scale left on
        box("Bracket", (0.12, 0.12, 0.06), (0.44, -0.29, 0.668), flip=True)  # inside out
    return [o.name for o in bpy.context.scene.objects]


def gate(names, profile="game"):
    return bx_audit.deliverable(names, profile=profile)


cases = {}
cases["crate_defects"] = gate(crate(clean=False))
cases["crate_clean"] = gate(crate(clean=True))

# The fixes SKILL.md documents, applied to the defect crate.
crate(clean=False)
lid = bpy.data.objects["Lid"]
lid.data.transform(Matrix.Diagonal(lid.scale).to_4x4())
lid.scale = (1, 1, 1)
bm = bmesh.new()
bm.from_mesh(bpy.data.objects["Bracket"].data)
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
bm.to_mesh(bpy.data.objects["Bracket"].data)
bm.free()
bpy.data.objects["Label"].location.y -= 0.0015
bpy.data.objects["Handle"].location.x = 0.51
cases["crate_fixed"] = gate([o.name for o in bpy.context.scene.objects])
for profile in ("render", "print", "roblox"):
    cases[f"crate_clean_{profile}"] = gate(crate(clean=True), profile)

# The clean crate after a GLB round trip: seams split every vertex, the gate must weld them.
crate(clean=True)
glb = os.path.join(TMP, "crate.glb")
bpy.ops.export_scene.gltf(filepath=glb, export_format="GLB")
empty()
bpy.ops.import_scene.gltf(filepath=glb)
cases["crate_glb"] = gate([o.name for o in bpy.context.scene.objects if o.type == "MESH"])


assert len(cases["crate_defects"]["errors"]) == 4, cases["crate_defects"]
for name in ("crate_clean", "crate_fixed", "crate_clean_render", "crate_clean_print", "crate_clean_roblox", "crate_glb"):
    assert cases[name]["pass"], (name, cases[name])
with open(OUT, "w") as f:
    json.dump({"blender": bpy.app.version_string, "upstream": "e7e19d5f7cf14f3b84a16a261dfb6f77724bd637", "fixture_cases": len(cases), "cases": cases}, f, indent=2)
print("SCENARIO_SMOKE_OK", bpy.app.version_string, len(cases), flush=True)
