"""Build one editable marine-equipment chest and its runtime GLB. No render."""
import argparse
import math
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[3]
parser = argparse.ArgumentParser()
parser.add_argument("--output", type=Path,
                    default=ROOT / "docs/world/phase-2-playground/coaster-chest-transfer-20261104")
args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
out = args.output.resolve()
out.mkdir(parents=True, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version = 0
scene = bpy.context.scene
scene.unit_settings.system = "METRIC"
asset = bpy.data.collections.new("AUTHOR | Intent coaster six-lock chest")
scene.collection.children.link(asset)
owners = {}


def native(p):
    # Authoring arguments and exported glTF: X across, +Y up, +Z toward player.
    return (p[0], -p[2], p[1])


def linear(hex_rgb):
    s = [int(hex_rgb[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in s)


def paint(name, color, roughness, metal=0, coat=0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes.get("Principled BSDF")
    p.inputs["Base Color"].default_value = (*linear(color), 1)
    m.diffuse_color = (*linear(color), 1)
    p.inputs["Roughness"].default_value = roughness
    p.inputs["Metallic"].default_value = metal
    p.inputs["Coat Weight"].default_value = coat
    p.inputs["Coat Roughness"].default_value = .24
    return m


M = {
    "body": paint("01 Petrol baked enamel", "42636d", .37, .16, .28),
    "panel": paint("02 Blue graphite panel", "304954", .43, .12, .16),
    "lid": paint("03 Copper satin powder coat", "ba814c", .33, .29, .34),
    "bright": paint("04 Brushed hardware", "b2c0c0", .34, .88),
    "rubber": paint("05 Graphite gasket and molded liner", "28353a", .73),
    "brass": paint("06 Warm lock alloy", "d4a362", .35, .68),
    "lens": paint("07 Neutral opal status lens", "687f81", .37),
}


def roughness_map(key, name, values):
    m = M[key]
    edge = values.shape[0]
    rgba = np.ones((edge, edge, 4), np.float32)
    rgba[:, :, :3] = values[:, :, None]
    image = bpy.data.images.new(name, width=edge, height=edge)
    image.colorspace_settings.name = "Non-Color"
    image.pixels.foreach_set(rgba.ravel())
    image.filepath_raw = str(out / (name.lower().replace(" ", "-") + ".png"))
    image.file_format = "PNG"
    image.save()
    image.pack()
    n = m.node_tree.nodes.new("ShaderNodeTexImage")
    n.image = image
    m.node_tree.links.new(n.outputs["Color"], m.node_tree.nodes.get("Principled BSDF").inputs["Roughness"])


rng = np.random.default_rng(61104)
y, x = np.mgrid[:256, :256]
roughness_map("lid", "Copper powder roughness 256",
              np.clip(.325 + .017 * np.sin(x * .16 + np.sin(y * .18)) + rng.normal(0, .014, x.shape), .26, .39))
roughness_map("bright", "Lengthwise brush roughness 256",
              np.clip(.34 + .035 * np.sin(y * math.tau * 81 / 256) + rng.normal(0, .013, x.shape), .25, .42))


def carrier(name, at=(0, 0, 0), parent=None):
    o = bpy.data.objects.new(name, None)
    asset.objects.link(o)
    o.parent = parent
    o.location = native(at)
    o.empty_display_type = "PLAIN_AXES"
    o.empty_display_size = .085
    owners[name] = o
    return o


def link(o, owner, mat):
    for c in list(o.users_collection):
        c.objects.unlink(o)
    asset.objects.link(o)
    o.parent = owner
    o.data.materials.append(M[mat])
    return o


def mapping(o):
    data = o.data
    uv = data.uv_layers.active or data.uv_layers.new(name="Fabrication UV")
    for p in data.polygons:
        # Keep the common long fabrication direction as U; use Z where the face is vertical.
        axis = max(range(3), key=lambda i: abs(p.normal[i]))
        u, v = [(1, 2), (0, 2), (0, 1)][axis]
        for i in p.loop_indices:
            co = data.vertices[data.loops[i].vertex_index].co
            uv.data[i].uv = (co[u] / .32, co[v] / .32)


def mesh(name, verts, faces, owner, mat, smooth=True):
    data = bpy.data.meshes.new(name)
    data.from_pydata([native(p) for p in verts], [], faces)
    data.update()
    o = link(bpy.data.objects.new(name, data), owner, mat)
    for p in data.polygons:
        p.use_smooth = smooth
    mapping(o)
    return o


def box(name, at, size, radius, owner, mat):
    bpy.ops.mesh.primitive_cube_add(size=1, location=native(at))
    o = bpy.context.object
    o.name = name
    o.scale = (size[0], size[2], size[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    link(o, owner, mat)
    bevel = o.modifiers.new("Eased manufacturing edges", "BEVEL")
    bevel.width, bevel.segments = radius, 3
    normal = o.modifiers.new("Face weighted normals", "WEIGHTED_NORMAL")
    normal.keep_sharp = True
    for p in o.data.polygons:
        p.use_smooth = True
    mapping(o)
    return o


def rectangle(y, hx, hz, r, zc=0, steps=7):
    ring = []
    for cx, cz, angle in ((hx-r, hz-r, 0), (-hx+r, hz-r, 90),
                          (-hx+r, -hz+r, 180), (hx-r, -hz+r, 270)):
        for i in range(steps):
            t = math.radians(angle + 90 * i / (steps - 1))
            ring.append((cx + r * math.cos(t), y, zc + cz + r * math.sin(t)))
    return ring


def skin(name, rings, owner, mat, hollow=False):
    n = len(rings[0])
    faces = []
    for j in range(len(rings) - (0 if hollow else 1)):
        a, b = j * n, (j + 1) % len(rings) * n
        faces.extend((a + i, b + i, b + (i + 1) % n, a + (i + 1) % n) for i in range(n))
    if not hollow:
        faces.extend([tuple(range(n)), tuple(reversed(range((len(rings) - 1) * n, len(rings) * n)))])
    o = mesh(name, sum(rings, []), faces, owner, mat)
    if not hollow:
        for p in list(o.data.polygons)[-2:]:
            p.use_smooth = False
    return o


def profile(name, rows, owner, mat, zc=0, hollow=False):
    return skin(name, [rectangle(*row, zc) for row in rows], owner, mat, hollow)


def tube(name, points, radius, owner, mat, sides=12):
    """Points use a planar path; orient sections consistently around its tangent."""
    path = [Vector(p) for p in points]
    verts, faces = [], []
    for i, p in enumerate(path):
        t = (path[min(i + 1, len(path) - 1)] - path[max(0, i - 1)]).normalized()
        ref = Vector((0, 1, 0)) if abs(t.y) < .97 and len(path) == 2 else Vector((0, 0, 1))
        if abs(t.dot(ref)) > .97:
            ref = Vector((1, 0, 0))
        a = t.cross(ref).normalized()
        b = t.cross(a).normalized()
        for k in range(sides):
            angle = math.tau * k / sides
            verts.append(tuple(p + radius * (math.cos(angle) * a + math.sin(angle) * b)))
    for i in range(len(path) - 1):
        for j in range(sides):
            a, b = i * sides + j, i * sides + (j + 1) % sides
            faces.append((a, b, b + sides, a + sides))
    faces.extend([tuple(reversed(range(sides))), tuple(range(len(verts) - sides, len(verts)))])
    o = mesh(name, verts, faces, owner, mat)
    for p in list(o.data.polygons)[-2:]:
        p.use_smooth = False
    return o


body = carrier("ChestBody")
lid = carrier("ChestLid", (0, 1.23, -1))

# Load path: two broad skids support the stepped pan; the wall closes from its
# molded outer side, over the top rolled shoulder, down into the lined well.
for side in (-1, 1):
    box(f"Load skid {side:+}", (side * 1.21, .126, 0), (.59, .102, 1.78), .033, body, "rubber")
profile("Tapered base pan", [(.154, 1.66, .895, .15), (.186, 1.73, .93, .16),
                              (.286, 1.81, .987, .185), (.343, 1.83, .997, .192)],
        body, "panel")
profile("Folded petrol shell with inner walls", [
    (.294, 1.72, .949, .175), (.324, 1.795, .986, .189),
    (.433, 1.853, 1.015, .201), (.489, 1.86, 1.024, .205),
    (1.10, 1.878, 1.025, .20), (1.153, 1.871, 1.019, .19),
    (1.187, 1.836, .99, .17), (1.187, 1.718, .878, .15),
    (1.158, 1.684, .85, .14), (.482, 1.611, .784, .14),
    (.44, 1.596, .77, .137), (.402, 1.596, .77, .137),
], body, "body", hollow=True)
profile("Continuous graphite gasket", [(1.177, 1.833, .986, .175), (1.202, 1.853, 1.005, .18),
                                         (1.229, 1.835, .99, .172), (1.229, 1.721, .886, .147),
                                         (1.206, 1.704, .872, .145), (1.177, 1.721, .887, .15)],
        body, "rubber", hollow=True)
profile("Inset deep liner floor", [(.406, 1.63, .804, .15), (.452, 1.62, .795, .145),
                                   (.475, 1.59, .767, .138)], body, "rubber")
for side in (-1, 1):
    box(f"End panel surround {side:+}", (side * 1.852, .758, 0), (.11, .512, 1.56), .05, body, "panel")
    box(f"Recessed grip pad {side:+}", (side * 1.908, .835, 0), (.013, .162, .656), .005, body, "rubber")
    tube(f"Side lifting grip {side:+}", [(side * 1.903, .835, -.315), (side * 1.927, .835, -.261),
                                        (side * 1.927, .835, .261), (side * 1.903, .835, .315)],
         .017, body, "bright")

# The tray offers a clear dark field behind the existing pickup location.
profile("Central key display pedestal", [(.459, .585, .39, .1), (.51, .585, .39, .1),
                                          (.93, .51, .346, .086), (1.025, .45, .31, .07)],
        body, "panel", .24)
profile("Soft key presentation insert", [(1.022, .471, .332, .07), (1.068, .48, .34, .075),
                                         (1.102, .44, .30, .067)], body, "rubber", .24)

# A broad blue-black lock cassette sits in the sloped shell, with a raised
# continuous upper pilot strip and copper cylinders set in guarded recesses.
box("Front recessed lock carrier", (0, .755, 1.014), (3.47, .535, .194), .077, body, "panel")
box("Front impact edge", (0, .493, 1.06), (3.40, .093, .099), .039, body, "body")
box("Continuous pilot strip", (0, 1.044, 1.027), (3.37, .169, .168), .038, body, "bright")
box("Black instrument inset", (0, 1.044, 1.108), (3.252, .105, .022), .010, body, "rubber")

# Hinged lid has a rolled rim, distinct inner plate, shallow pressed crown
# and two low profile protection runners that follow the cap's contour.
profile("Folded underside plate", [(.006, 1.81, 1.006, .16), (.025, 1.852, 1.044, .18),
                                   (.059, 1.861, 1.053, .181)], lid, "panel", 1)
profile("Satin copper lid crown", [(.043, 1.891, 1.069, .181), (.061, 1.944, 1.10, .205),
                                    (.090, 1.95, 1.10, .21), (.120, 1.92, 1.075, .198),
                                    (.159, 1.835, .995, .174), (.178, 1.694, .855, .158),
                                    (.190, 1.525, .712, .143)], lid, "lid", 1)
for side in (-1, 1):
    # A dark infill channels the broad reflection and defines the lid's slope.
    box(f"Deck protection runner {side:+}", (side * 1.27, .181, 1), (.15, .021, 1.40),
        .010, lid, "panel")
    box(f"Underside press rib {side:+}", (side * 1.24, .009, .999), (.095, .028, 1.61),
        .012, lid, "body")

for x in (-1.23, 1.23):
    box(f"Rear hinge pedestal {x:+}", (x, 1.146, -1.025), (.43, .16, .15), .028, body, "panel")
    for a, b in ((-.222, -.124), (.124, .222)):
        tube(f"Fixed hinge knuckle {x:+}/{a:+}", [(x + a, 1.23, -1), (x + b, 1.23, -1)],
             .052, body, "bright", 18)
    box(f"Moving hinge leaf {x:+}", (x, .041, .064), (.242, .073, .157), .021, lid, "panel")
    tube(f"Moving hinge barrel {x:+}", [(x - .115, 0, 0), (x + .115, 0, 0)], .052, lid, "bright", 18)
    tube(f"Hinge pin {x:+}", [(x - .236, 1.23, -1), (x + .236, 1.23, -1)], .029, body, "panel", 16)

for i in range(6):
    n = f"{i + 1:02}"
    x = -1.38 + i * .55
    z = 1.151
    box(f"Lock {n} guard", (x, .626, 1.085), (.389, .297, .115), .052, body, "rubber")
    box(f"Lock {n} rounded brass casting", (x, .625, 1.153), (.327, .255, .151), .049, body, "brass")
    tube(f"Lock {n} keyway socket", [(x, .628, 1.214), (x, .628, 1.238)], .053, body, "panel", 18)
    box(f"Lock {n} keyway slot", (x, .628, 1.239), (.019, .055, .008), .003, body, "rubber")

    # The upper horizontal shackle passes through an actual eye. The anchored
    # leg remains in its bore when lifted; the free end swings out toward +Z.
    lock = carrier(f"Lock{n}", (x, 0, 0))
    shackle = carrier(f"Shackle{n}", (-.108, .735, z), lock)
    path = [(0, -.095, 0), (0, .089, 0)]
    for k in range(1, 11):
        a = math.pi * (1 - k / 10)
        path.append((.108 + .108 * math.cos(a), .089 + .108 * math.sin(a), 0))
    path.append((.216, -.035, 0))
    tube(f"Lock {n} forged shackle", path, .024, shackle, "brass", 14)
    lens = carrier(f"LockLens{n}", (0, .549, 1.23), lock)
    box(f"Lock {n} state inset", (0, 0, 0), (.103, .023, .009), .004, lens, "lens")

    # Extruded annulus in YZ, centered on the shackle's midspan at y=.932.
    # A pressed lug attaches the eye to the front lip of the moving lid.
    box(f"Lid hasp {n} mounting tab", (x, -.103, 2.064), (.119, .265, .076), .025, lid, "panel")
    eye = []
    cy, cz = .932 - 1.23, z + 1
    for xpos, r in ((x - .032, .074), (x + .032, .074),
                    (x + .032, .039), (x - .032, .039)):
        eye.append([(xpos, cy + r * math.cos(a * math.tau / 18),
                     cz - r * math.sin(a * math.tau / 18)) for a in range(18)])
    skin(f"Lid hasp {n} forged eye", eye, lid, "bright", hollow=True)
    box(f"Lid hasp {n} shoulder", (x, -.239, 2.118), (.072, .094, .075), .021, lid, "bright")

for i in range(7):
    n = f"{i + 1:02}"
    x = -1.5 + i * .5
    signal = carrier(f"Signal{n}", (x, 1.044, 1.122))
    box(f"Pilot {n} replaceable lens", (0, 0, 0), (.142, .059, .014), .006, signal, "lens")

source_parts = sum(o.type == "MESH" for o in asset.objects)
bpy.ops.wm.save_as_mainfile(filepath=str(out / "coaster-chest-editable.blend"), compress=True)

# Optimize only the portable copy. Keep animation roots separate; within each
# root Blender emits a single mesh with one primitive per physical material.
for owner in owners.values():
    parts = [p for p in owner.children if p.type == "MESH"]
    if not parts:
        continue
    bpy.ops.object.select_all(action="DESELECT")
    for o in parts:
        bpy.context.view_layer.objects.active = o
        o.select_set(True)
        for mod in list(o.modifiers):
            bpy.ops.object.modifier_apply(modifier=mod.name)
        o.select_set(False)
    for o in parts:
        o.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    if len(parts) > 1:
        bpy.ops.object.join()
    bpy.context.object.name = f"{owner.name}Surfaces"

bpy.ops.object.select_all(action="DESELECT")
for o in asset.objects:
    o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(out / "coaster-chest.glb"), export_format="GLB",
                         use_selection=True, export_yup=True, export_animations=False,
                         export_cameras=False, export_lights=False)
print(f"Chest export complete: {source_parts} named editable parts; Blender {bpy.app.version_string}", flush=True)
