"""Editable gate/portal/key craft; derive PBR material batches without rendering.

blender --background --factory-startup --threads 2 --python-exit-code 1 \
  --python tools/world/coaster-gate-craft-20261105/build.py

Design arguments use exported Three coordinates: X across, Y up, +Z player-facing.
GateStatic is local to coasterWorld([0, 0, COASTER_GATE_Z]); GateLeaf is +X from
the existing hinge; GateKey keeps createIntentKey's original local pickup origin.
No physics, text, lights, layout or motion is authored here.
"""
import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[3]
parser = argparse.ArgumentParser()
parser.add_argument("--output", type=Path,
                    default=ROOT / "docs/world/phase-2-playground/coaster-gate-craft-20261105")
args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
out = args.output.resolve()
out.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version = 0
scene = bpy.context.scene
scene.unit_settings.system = "METRIC"
asset = bpy.data.collections.new("AUTHOR | Coastal portal, hinged leaf and key")
scene.collection.children.link(asset)
owners = {}


def native(p):
    return (p[0], -p[2], p[1])


def linear(h):
    a = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in a)


def material(name, color, roughness, metal=0, coat=0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    m.use_backface_culling = True
    p = m.node_tree.nodes.get("Principled BSDF")
    p.inputs["Base Color"].default_value = (*linear(color), 1)
    m.diffuse_color = (*linear(color), 1)
    p.inputs["Roughness"].default_value = roughness
    p.inputs["Metallic"].default_value = metal
    p.inputs["Coat Weight"].default_value = coat
    p.inputs["Coat Roughness"].default_value = .24
    return m


M = {
    "paint": material("01 Petrol baked enamel", "45626c", .37, .16, .28),
    "copper": material("02 Copper satin powder coat", "ba814c", .34, .29, .30),
    "metal": material("03 Brushed gate hardware", "b2c0c0", .34, .88),
    "stone": material("04 Honed grey limestone", "b8bbb1", .76),
    "dark": material("05 Graphite gaskets and recesses", "283b44", .72),
    "brass": material("06 Forged warm key alloy", "d4a362", .33, .72),
}


def data_map(name, values):
    size = values.shape[0]
    rgba = np.ones((size, size, 4), np.float32)
    rgba[:, :, :3] = values[:, :, None]
    im = bpy.data.images.new(name, width=size, height=size)
    im.colorspace_settings.name = "Non-Color"
    im.pixels.foreach_set(rgba.ravel())
    im.filepath_raw = str(out / (name.lower().replace(" ", "-") + ".png"))
    im.file_format = "PNG"
    im.save()
    im.pack()
    return im


def roughness(m, image):
    node = m.node_tree.nodes.new("ShaderNodeTexImage")
    node.image = image
    m.node_tree.links.new(node.outputs["Color"], m.node_tree.nodes.get("Principled BSDF").inputs["Roughness"])


rng = np.random.default_rng(20261105)
yy, xx = np.mgrid[:256, :256]
brush = data_map("Directional hardware roughness 256", np.clip(
    .34 + .028 * np.sin(yy * math.tau * 71 / 256) + rng.normal(0, .011, xx.shape), .26, .42))
mineral = data_map("Honed mineral roughness 256", np.clip(
    .76 + .022 * np.sin(xx * .069 + np.sin(yy * .051)) + rng.normal(0, .014, xx.shape), .68, .84))
roughness(M["metal"], brush)
roughness(M["brass"], brush)
roughness(M["stone"], mineral)


def owner(name):
    o = bpy.data.objects.new(name, None)
    asset.objects.link(o)
    o.empty_display_type = "PLAIN_AXES"
    o.empty_display_size = .12
    owners[name] = o
    return o


def bind(o, root, mat):
    for c in list(o.users_collection):
        c.objects.unlink(o)
    asset.objects.link(o)
    o.parent = root
    o.data.materials.append(M[mat])
    return o


def uv(o, tile=.32):
    layer = o.data.uv_layers.active or o.data.uv_layers.new(name="Fabrication UV")
    for face in o.data.polygons:
        axis = max(range(3), key=lambda k: abs(face.normal[k]))
        u, v = [(1, 2), (0, 2), (0, 1)][axis]
        for i in face.loop_indices:
            p = o.data.vertices[o.data.loops[i].vertex_index].co
            layer.data[i].uv = (p[u] / tile, p[v] / tile)


def box(name, p, size, radius, root, mat):
    bpy.ops.mesh.primitive_cube_add(size=1, location=native(p))
    o = bpy.context.object
    o.name = name
    o.scale = (size[0], size[2], size[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bind(o, root, mat)
    bevel = o.modifiers.new("Manufactured edge radius", "BEVEL")
    # Keep a finite flat land on very thin inserts. Clamping exactly to half
    # thickness creates coincident bevel loops and zero-area export triangles.
    bevel.width, bevel.segments = min(radius, min(size) * .42), 3
    normal = o.modifiers.new("Weighted broad-face normals", "WEIGHTED_NORMAL")
    normal.keep_sharp = True
    for face in o.data.polygons:
        face.use_smooth = True
    uv(o)
    return o


def mesh(name, vertices, faces, root, mat, smooth=True):
    data = bpy.data.meshes.new(name)
    data.from_pydata([native(p) for p in vertices], [], faces)
    data.update()
    o = bind(bpy.data.objects.new(name, data), root, mat)
    for face in data.polygons:
        face.use_smooth = smooth
    uv(o)
    return o


def tube(name, path, radius, root, mat, sides=12, closed=False):
    path = [Vector(p) for p in path]
    verts, faces = [], []
    for i, p in enumerate(path):
        tangent = ((path[(i + 1) % len(path)] - path[(i - 1) % len(path)]) if closed else
                   path[min(i + 1, len(path) - 1)] - path[max(0, i - 1)]).normalized()
        ref = Vector((0, 1, 0)) if abs(tangent.y) < .95 else Vector((1, 0, 0))
        a = tangent.cross(ref).normalized()
        b = tangent.cross(a).normalized()
        for k in range(sides):
            angle = k * math.tau / sides
            verts.append(tuple(p + radius * (a * math.cos(angle) + b * math.sin(angle))))
    for i in range(len(path) if closed else len(path) - 1):
        for k in range(sides):
            a, b = i * sides + k, i * sides + (k + 1) % sides
            c, d = ((i + 1) % len(path)) * sides + k, ((i + 1) % len(path)) * sides + (k + 1) % sides
            faces.append((a, b, d, c))
    if not closed:
        faces.extend([tuple(reversed(range(sides))), tuple(range(len(verts) - sides, len(verts)))])
    o = mesh(name, verts, faces, root, mat)
    if not closed:
        o.data.polygons[-1].use_smooth = False
        o.data.polygons[-2].use_smooth = False
    return o


def bar(name, a, b, width, depth, root, mat):
    # Applied bevel on a rotated extrusion gives broad, readable fabricated members.
    start, end = Vector(native(a)), Vector(native(b))
    delta = end - start
    o = box(name, (0, 0, 0), (width, delta.length, depth), min(width, depth) * .13, root, mat)
    o.rotation_mode = "QUATERNION"
    o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(delta.normalized())
    o.location = (start + end) / 2
    return o


static = owner("GateStatic")
leaf = owner("GateLeaf")
key = owner("GateKey")

# STATIC PORTAL. The stone feet stop exactly at x=+-5; all side detailing stays
# outside that ten-metre clear opening. No new slab crosses the guest route.
for side in (-1, 1):
    x = side * 5.8
    label = "L" if side < 0 else "R"
    box(f"{label} pier | recessed structural core", (x, 3.25, -.02), (1.40, 6.50, 1.58), .07, static, "paint")
    box(f"{label} pier | mineral bearing plinth", (x, .43, 0), (1.60, .86, 1.80), .055, static, "stone")
    box(f"{label} pier | cap bearing ring", (x, 5.83, 0), (1.60, .23, 1.80), .035, static, "paint")
    box(f"{label} pier | weathered mineral cap", (x, 6.22, -.015), (1.60, .53, 1.77), .07, static, "stone")
    # Broad separate stone courses reveal real edge thickness and joints. The
    # front centre is reserved for the existing cyan light, not overwritten.
    for course, (bottom, top) in enumerate(((.88, 2.27), (2.32, 4.04), (4.09, 5.70))):
        cy, h = (bottom + top) / 2, top - bottom
        for edge in (-1, 1):
            box(f"{label} pier | front stone course {course}/{edge:+}",
                (x + edge * .425, cy, .805), (.39, h, .17), .022, static, "stone")
        box(f"{label} pier | rear stone course {course}", (x, cy, -.805), (1.32, h, .17), .025, static, "stone")
        for edge in (-1, 1):
            box(f"{label} pier | side return {course}/{edge:+}",
                (x + edge * .706, cy, 0), (.145, h, 1.41), .025, static, "stone")
    for bottom, top in ((.88, 2.23), (4.77, 5.70)):
        box(f"{label} pier | central stone infill {bottom}",
            (x, (bottom + top) / 2, .805), (.46, top - bottom, .17), .022, static, "stone")
    box(f"{label} pier | light channel", (x, 3.5, .82), (.36, 2.54, .12), .04, static, "dark")
    for edge in (-1, 1):
        box(f"{label} pier | light frame edge {edge:+}",
            (x + edge * .163, 3.5, .894), (.033, 2.48, .025), .009, static, "metal")
    # Recessed hardware at the old hinge height explains the load path into the
    # post. Fixed brackets stay outside the hinge; the rotating barrels belong to leaf.
    for y in (.47, 2.65):
        box(f"{label} pier | fixed hinge bearing plate {y}",
            (side * 5.025, y, 0), (.050, .34, .40), .018, static, "paint")
        for z in (-.145, .145):
            box(f"{label} pier | hinge plate return {y}/{z}",
                (side * 5.11, y, z), (.17, .29, .045), .012, static, "metal")

# Deep lintel and actual folded returns frame the unchanged live atlas face.
box("Header | recessed box girder", (0, 6.40, -.02), (13.0, 1.02, 1.68), .065, static, "paint")
box("Header | upper mineral weather cap", (0, 6.98, 0), (13.2, .14, 2.0), .035, static, "stone")
box("Header | folded lower bearing return", (0, 5.82, 0), (13.2, .14, 2.0), .025, static, "paint")
for x in (-5.38, 5.38):
    box("Header | independent end cassette", (x, 6.4, .88), (1.96, .84, .16), .05, static, "paint")
    box("Header | end cassette shadow joint", (x, 6.4, .971), (1.74, .60, .022), .026, static, "dark")
# Sign's live rectangle is x+-4.1, y6.4+-.36, z1.03. The four physical rails
# lie outside this exact rectangle; no new text plane or large solid covers it.
for y in (5.995, 6.805):
    box("Sign | rolled horizontal copper rail", (0, y, 1.005), (8.50, .075, .13), .025, static, "copper")
for x in (-4.215, 4.215):
    box("Sign | rolled vertical copper rail", (x, 6.4, 1.005), (.07, .74, .13), .023, static, "copper")
box("Sign | replaceable backing pan", (0, 6.4, .928), (8.36, .75, .11), .025, static, "dark")

# ONE +X LEAF. Keep its hinge at [0,0,0]; caller mirrors x by -leaf.side.
# A folded sill, open tubular top frame and inset lower cassette replace a
# solid flat box while retaining the original bars, diagonal and open upper field.
box("Leaf | folded load bearing sill", (2.5, .28, 0), (4.98, .31, .25), .045, leaf, "paint")
for x in (.08, 4.92):
    box("Leaf | eased hollow-section upright", (x, 1.63, 0), (.18, 3.06, .25), .035, leaf, "paint")
    box("Leaf | inset upright face", (x, 1.77, .136), (.085, 2.42, .024), .014, leaf, "metal")
box("Leaf | continuous crown rail", (2.5, 3.10, 0), (5.15, .18, .30), .055, leaf, "copper")
box("Leaf | lower cassette edge", (2.5, .86, 0), (4.72, .14, .25), .026, leaf, "metal")
box("Leaf | folded lower pan", (2.5, .575, 0), (4.72, .46, .17), .035, leaf, "paint")
for z in (-.101, .101):
    box("Leaf | inset gasket behind cassette", (2.5, .575, z), (4.46, .322, .026), .026, leaf, "dark")
    box("Leaf | recessed enamel cassette", (2.5, .575, z * 1.16), (4.32, .24, .018), .020, leaf, "paint")
    for x in (.28, 4.72):
        box("Leaf | removable cassette end fold", (x, .575, z), (.10, .39, .05), .016, leaf, "copper")
for i in range(10):
    x = .46 + i * .46
    box(f"Leaf | open upper picket {i:02}", (x, 1.975, 0), (.085, 2.12, .13), .018, leaf, "paint")
    for y in (.96, 2.985):
        box(f"Leaf | picket socket {i:02}/{y}", (x, y, 0), (.132, .09, .18), .018, leaf, "metal")
bar("Leaf | load bearing diagonal", (.09, .80, -.055), (4.91, 2.96, -.055), .105, .115, leaf, "paint")
for x, y in ((.26, .88), (4.74, 2.88)):
    box("Leaf | diagonal welded gusset", (x, y, -.133), (.32, .24, .035), .026, leaf, "metal")
for y in (.47, 2.65):
    tube("Leaf | turned hinge barrel", [(0, y - .115, 0), (0, y + .115, 0)], .12, leaf, "metal", 20)
    for dy in (-.123, .123):
        tube("Leaf | hinge thrust collar", [(0, y + dy - .013, 0), (0, y + dy + .013, 0)], .123, leaf, "copper", 20)
    box("Leaf | hinge weld tongue", (.15, y, 0), (.20, .15, .20), .025, leaf, "paint")
# A believable key receiver is mounted to the meeting stile. No new state or
# interactive target is introduced; the main session retains the original gate action.
box("Leaf | central latch pocket", (4.905, 1.47, .135), (.17, .35, .044), .020, leaf, "dark")
box("Leaf | key receiver escutcheon", (4.905, 1.47, .160), (.13, .28, .024), .011, leaf, "metal")
box("Leaf | keyway recess", (4.905, 1.47, .175), (.018, .075, .006), .002, leaf, "dark")

# KEY. The original hoop centre, shaft start and tooth datums are unchanged.
# Forge a flattened closed bow with rounded shoulders, then a stepped spine,
# recessed milling channel and separate functional bit. Nothing is pre-lit.
def key_ring():
    n, outer_x, outer_y, inner_x, inner_y = 32, .220, .205, .141, .128
    rings = []
    for z, rx, ry in ((-.044, outer_x - .014, outer_y - .014),
                      (-.026, outer_x, outer_y), (.026, outer_x, outer_y),
                      (.044, outer_x - .014, outer_y - .014),
                      (.044, inner_x, inner_y), (-.044, inner_x, inner_y)):
        rings.append([(-.18 + rx * math.cos(i * math.tau / n), ry * math.sin(i * math.tau / n), z) for i in range(n)])
    faces = []
    for j in range(len(rings)):
        for i in range(n):
            faces.append((j * n + i, j * n + (i + 1) % n,
                          ((j + 1) % len(rings)) * n + (i + 1) % n, ((j + 1) % len(rings)) * n + i))
    return mesh("Key | forged annular bow with eased shoulders", sum(rings, []), faces, key, "brass")


key_ring()
box("Key | reinforced bow shoulder", (.044, 0, 0), (.14, .145, .102), .035, key, "brass")
box("Key | forged shaft", (.358, 0, 0), (.624, .108, .097), .025, key, "brass")
for z in (-.051, .051):
    box("Key | recessed milling channel", (.355, .005, z), (.44, .029, .008), .009, key, "metal")
box("Key | functional cut bit", (.51, -.093, 0), (.115, .175, .095), .018, key, "brass")
box("Key | relieved bit shoulder", (.563, -.057, 0), (.065, .101, .095), .016, key, "brass")
box("Key | eased insertion tip", (.671, 0, 0), (.060, .085, .082), .023, key, "metal")

# SHADOW ONLY. Keep the visible roots above byte-for-byte unchanged. This
# separate assembly follows real frame/picket/diagonal/hinge members; no opaque
# slab spans the upper grille. Broad outside frame edges retain one bevel step.
shadow = owner("GateLeafShadow")


def shadow_box(name, p, size, radius=0):
    obj = box("SHADOW | " + name, p, size, radius, shadow, "dark")
    if radius:
        obj.modifiers["Manufactured edge radius"].segments = 1
    else:
        obj.modifiers.remove(obj.modifiers["Manufactured edge radius"])
    return obj


shadow_box("folded sill", (2.5, .28, 0), (4.98, .31, .25), .045)
for x in (.08, 4.92):
    shadow_box("upright", (x, 1.63, 0), (.18, 3.06, .25), .035)
shadow_box("crown rail", (2.5, 3.10, 0), (5.15, .18, .30), .055)
shadow_box("cassette rail", (2.5, .86, 0), (4.72, .14, .25))
shadow_box("opaque lower pan only", (2.5, .575, 0), (4.72, .46, .17))
for i in range(10):
    shadow_box(f"open picket {i:02}", (.46 + i * .46, 1.975, 0), (.085, 2.12, .13))
diagonal = bar("SHADOW | diagonal", (.09, .80, -.055), (4.91, 2.96, -.055), .105, .115, shadow, "dark")
diagonal.modifiers.remove(diagonal.modifiers["Manufactured edge radius"])
for x, y in ((.26, .88), (4.74, 2.88)):
    shadow_box("rear gusset", (x, y, -.133), (.32, .24, .035))
for y in (.47, 2.65):
    tube("SHADOW | hinge and thrust collar", [(0, y - .136, 0), (0, y + .136, 0)], .123, shadow, "dark", 8)
    shadow_box("hinge tongue", (.15, y, 0), (.20, .15, .20))
shadow_box("central key receiver", (4.905, 1.47, .1565), (.17, .35, .043))

# Native authoring always precedes the derived, joined runtime copy.
source_parts = {name: len([p for p in root.children if p.type == "MESH"]) for name, root in owners.items()}
bpy.ops.wm.save_as_mainfile(filepath=str(out / "coaster-gate-editable.blend"), compress=True)
for root in owners.values():
    parts = [p for p in root.children if p.type == "MESH"]
    for obj in parts:
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        for modifier in list(obj.modifiers):
            bpy.ops.object.modifier_apply(modifier=modifier.name)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in parts:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    if len(parts) > 1:
        bpy.ops.object.join()
    bpy.context.object.name = root.name + "Surfaces"
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

bpy.ops.object.select_all(action="DESELECT")
for obj in asset.objects:
    obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(out / "coaster-gate.glb"), export_format="GLB",
                         use_selection=True, export_yup=True, export_animations=False,
                         export_cameras=False, export_lights=False)
manifest = {
    "source_revision": "b75c474f73ffa186e7bbc5522e4656dcbbedf9c3",
    "blender": bpy.app.version_string,
    "units": "metres", "gltf_axes": "+X across / +Y up / +Z player-facing",
    "roots": {name: {"editable_parts": count, "origin": [0, 0, 0]} for name, count in source_parts.items()},
    "materials": [m.name for m in M.values()],
    "maps": {"count": 2, "size": [256, 256], "kind": "authored roughness, not photographed scans"},
    "gate_static_placement": "coasterWorld([0,0,COASTER_GATE_Z])",
    "gate_leaf_placement": "inside original kinematic hinge root, scale=[-leaf.side,1,1]",
    "key_placement": "original key mesh root, position/rotation unchanged",
    "generated_files": {name: {"bytes": (out / name).stat().st_size,
                                "sha256": hashlib.sha256((out / name).read_bytes()).hexdigest()}
                        for name in ("coaster-gate.glb", "coaster-gate-editable.blend")},
    "validation": "export only; run verify.py; runtime/visual/performance unverified",
}
(out / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
print(json.dumps({"done": "gate source and portable material batches", "editable_parts": source_parts,
                  "blender": bpy.app.version_string}), flush=True)
