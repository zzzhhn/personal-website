"""Editable C02/L01 source and batched runtime export. Blender 5.1.2; meters, native Z-up."""
import hashlib
import json
import math
import os
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
PUBLIC = REPO / "public/assets/world/camp-site-craft"
SKILL = Path(os.environ.get("BLENDER_MATERIAL_CRAFT", Path.home() / ".codex/skills/blender-material-craft"))
sys.path[:0] = [str(HERE), str(SKILL / "scripts")]
from craft_geometry import box
from scenario_tools import tool
from surfaces import write_maps

SOURCE = HERE / "camp-site-v1.blend"
RUNTIME = PUBLIC / "camp-site-v1.glb"
BASE_COMMIT = "3c66e8da538e83a9bbc56aa65592251b87764cca"
PAD_SIZE = (3.1, 2.5)
FOOT_EXTENT = (.2458282709121704, .23925752937793732)
LENS_CENTER = (-.0083728152513504, .001736642718315125, 2.41)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def linear(hex_color):
    srgb = [int(hex_color[i:i+2], 16) / 255 for i in (0, 2, 4)]
    return tuple(c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4 for c in srgb)


def material(name, color, roughness, metalness=0, maps=None, tint=False, emission=0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    m.use_backface_culling = True
    m.diffuse_color = (*linear(color), 1)
    nodes, links = m.node_tree.nodes, m.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = m.diffuse_color
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metalness
    if emission:
        bsdf.inputs["Emission Color"].default_value = m.diffuse_color
        bsdf.inputs["Emission Strength"].default_value = emission
    if not maps:
        return m

    uv = nodes.new("ShaderNodeUVMap")
    uv.uv_map = "FabricationUV"
    uv.location = (-900, 40)

    def texture(suffix, y):
        node = nodes.new("ShaderNodeTexImage")
        node.image = bpy.data.images.load(str(HERE / "textures" / f"{maps}-{suffix}.png"), check_existing=True)
        node.image.colorspace_settings.name = "sRGB" if suffix == "color" else "Non-Color"
        node.image.pack()
        node.location = (-670, y)
        links.new(uv.outputs["UV"], node.inputs["Vector"])
        return node.outputs["Color"]

    color_out = texture("color", 300)
    if tint:
        # glTF exports this multiply as standard baseColorTexture * COLOR_0.
        vertex = nodes.new("ShaderNodeVertexColor")
        vertex.layer_name = "StoneTint"
        vertex.location = (-675, 565)
        multiply = nodes.new("ShaderNodeMixRGB")
        multiply.blend_type = "MULTIPLY"
        multiply.inputs[0].default_value = 1
        multiply.location = (-320, 320)
        links.new(color_out, multiply.inputs[1])
        links.new(vertex.outputs["Color"], multiply.inputs[2])
        color_out = multiply.outputs["Color"]
    links.new(color_out, bsdf.inputs["Base Color"])
    links.new(texture("roughness", 20), bsdf.inputs["Roughness"])
    normal = nodes.new("ShaderNodeNormalMap")
    normal.uv_map = "FabricationUV"
    normal.location = (-330, -270)
    links.new(texture("normal", -270), normal.inputs["Color"])
    links.new(normal.outputs["Normal"], bsdf.inputs["Normal"])
    return m


def collection(name):
    result = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(result)
    return result


def put(obj, group):
    group.objects.link(obj)
    for other in list(obj.users_collection):
        if other != group:
            other.objects.unlink(obj)
    return obj


def empty(name, group, parent=None):
    root = bpy.data.objects.new(name, None)
    group.objects.link(root)
    root.empty_display_size = .12
    root.parent = parent
    return root


def ring_mesh(name, rings, mat, group, parent):
    """All rings run CCW in plan, from lowest to highest."""
    n = len(rings[0])
    vertices = [v for ring in rings for v in ring]
    faces = [tuple(reversed(range(n)))]
    for k in range(len(rings) - 1):
        for i in range(n):
            a, b = k * n + i, k * n + (i + 1) % n
            faces.append((a, b, b + n, a + n))
    faces.append(tuple(range(len(vertices) - n, len(vertices))))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    group.objects.link(obj)
    obj.parent = parent
    mesh.materials.append(mat)
    return obj


def ring(points, z):
    return [(p[0], p[1], z) for p in points]


def clipped_rect(x, y, trim):
    return [(-x + trim, -y), (x - trim, -y), (x, -y + trim), (x, y - trim),
            (x - trim, y), (-x + trim, y), (-x, y - trim), (-x, -y + trim)]


def inset(points, distance):
    """Translate each cut line inward and intersect adjacent lines."""
    pts = [Vector(p) for p in points]
    result = []
    for i, p in enumerate(pts):
        before = (p - pts[i - 1]).normalized()
        after = (pts[(i + 1) % len(pts)] - p).normalized()
        bisector = Vector((-before.y - after.y, before.x + after.x))
        result.append(p + bisector * (distance / (1 + before.dot(after))))
    return result


def clip_corners(points, trims):
    result = []
    for i, point in enumerate(points):
        p = Vector(point)
        previous = Vector(points[i - 1])
        following = Vector(points[(i + 1) % len(points)])
        cut = trims[i % len(trims)]
        result.extend([p + (previous - p).normalized() * cut, p + (following - p).normalized() * cut * .78])
    return result


def surface_uv(obj, scale, offset=(0, 0), wood=False, tint=None):
    mesh = obj.data
    layer = mesh.uv_layers.new(name="FabricationUV")
    colors = mesh.color_attributes.new(name="StoneTint", type="FLOAT_COLOR", domain="CORNER") if tint is not None else None
    for face in mesh.polygons:
        n = face.normal
        if wood and abs(n.z) < .6:
            u = Vector((-n.y, n.x, 0)).normalized()
        elif abs(n.z) < .95:
            u = Vector((0, 0, 1)).cross(n).normalized()
        else:
            u = (Vector((1, 0, 0)) - n * n.x).normalized()
        v = n.cross(u)
        tone = (1 if n.z > .68 else .90) * tint if colors else 1
        for i in face.loop_indices:
            p = mesh.vertices[mesh.loops[i].vertex_index].co
            layer.data[i].uv = (p.dot(u) / scale[0] + offset[0], p.dot(v) / scale[1] + offset[1])
            if colors:
                colors.data[i].color = (tone, tone, tone, 1)


def make_pad(group, stone):
    root = empty("C02", group)
    root["anchorGLB"] = "top centre; world Y=4.9"
    root["footprintXZ_m"] = PAD_SIZE
    # The bedding reaches the original perimeter at its base. Its narrow rim falls away from the cap.
    footprint = [(-1.55, -1.25), (1.55, -1.25), (1.55, 1.25), (-1.55, 1.25)]
    bed = ring_mesh("C02_compacted_bedding", [ring(footprint, -.10), ring(footprint, -.056),
                    ring(inset(footprint, .010), -.032)], stone, group, root)
    surface_uv(bed, (1.3, 1.3), offset=(.04, .22), tint=.59)
    # Two runs of three slabs. Stepped centre seam and offset end joints identify a laid bond.
    middle = [(-1.55, .075), (-.62, .035), (.42, -.055), (1.55, .010)]
    low = [(-1.55, -1.25), (-.53, -1.25), (.54, -1.25), (1.55, -1.25)]
    high = [(-1.55, 1.25), (-.28, 1.25), (.67, 1.25), (1.55, 1.25)]
    tones = (.87, .96, .89, .96, .88, .94)
    for row, bounds in enumerate(((low, middle), (middle, high))):
        a, b = bounds
        for c in range(3):
            idx = row * 3 + c
            if row == 0:
                shape = [a[c], a[c + 1], b[c + 1], b[c]]
            else:
                # Offset the north end of each shared split by sliding its inner end along the seam.
                # Intermediate points keep every slab on the same zigzag centreline.
                left = Vector(bond_point(middle, c))
                right = Vector(bond_point(middle, c + 1))
                trace = [middle[k] for k in range(1, 3) if left.x < middle[k][0] < right.x]
                shape = [left, *trace, right, b[c + 1], b[c]]
            raw = inset(shape, .011)
            chipped = clip_corners(raw, [.021 + .006 * ((idx + i * 2) % 4) for i in range(len(raw))])
            # A rough, split arris drops 11–16 mm to a fuller stone flank. Flat tops preserve supports.
            cut = [(.010 + .003 * ((j + idx) % 3)) for j in range(len(chipped))]
            lower = [(x, y, -.078 + .004 * ((j + idx) % 3)) for j, (x, y) in enumerate(inset(chipped, .004))]
            side = [(x, y, -cut[j]) for j, (x, y) in enumerate(chipped)]
            cap = ring(inset(chipped, .011), 0)
            slab = ring_mesh(f"C02_cleft_flagstone_{idx + 1:02}", [lower, side, cap], stone, group, root)
            surface_uv(slab, (1.3, 1.3), offset=(.14 + idx * .29, .33 + idx * .17), tint=tones[idx])
    return root


def bond_point(seam, i):
    if i == 0 or i == len(seam) - 1:
        return seam[i]
    return Vector(seam[i]).lerp(Vector(seam[i + 1]), .20 if i == 1 else .18)


def make_post(group, stone, timber, iron, fitting, diffuser):
    root = empty("L01", group)
    root["lightCentreGLB_y"] = 2.41
    root["collision"] = "legacy L01_post supplied by WorldCampContent"
    structure = empty("L01_post", group, root)

    def bevel_box(name, c, size, mat, radius):
        part = put(box("L01_" + name, c, size, mat, radius=radius, segments=2), group)
        part.parent = structure
        return part

    def profile(name, widths, mat):
        return ring_mesh("L01_" + name, [ring(clipped_rect(x, y, trim), z) for z, x, y, trim in widths],
                         mat, group, structure)

    footing = profile("split_stone_socket", [
        (0, .237, .229, .057), (.035, *FOOT_EXTENT, .041), (.111, .234, .225, .047), (.159, .207, .208, .041),
        (.176, .192, .195, .035),
    ], stone)
    surface_uv(footing, (1.3, 1.3), offset=(.61, .42), tint=.80)
    bevel_box("anchored_shoe_plate", (0, 0, .187), (.282, .282, .025), iron, .008)
    profile("cast_post_shoe", [
        (.196, .113, .113, .011), (.214, .113, .113, .013), (.234, .099, .099, .014),
        (.315, .095, .095, .013), (.326, .092, .092, .011),
    ], iron)
    shaft = profile("tapered_oiled_timber", [
        (.198, .087, .087, .012), (.326, .087, .087, .012), (2.151, .077, .077, .011),
    ], timber)
    surface_uv(shaft, (.48, 2.2), offset=(.42, .13), wood=True)

    def bolt(name, center, radius, depth):
        bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=radius, depth=depth, location=center)
        part = put(bpy.context.object, group)
        part.name = "L01_" + name
        part.parent = structure
        part.data.materials.append(fitting)
        return part

    for i, (sx, sy) in enumerate(((-1, -1), (-1, 1), (1, -1), (1, 1))):
        bolt(f"foot_anchor_{i}", (sx * .111, sy * .111, .203), .0105, .009)
        bevel_box(f"recessed_window_mullion_{i}", (sx * .073, sy * .073, 2.368), (.026, .026, .318), iron, .004)
    bevel_box("rail_band", (0, 0, 1.717), (.174, .174, .059), iron, .006)
    for sign in (-1, 1):
        pin = bolt(f"band_pin_{sign}", (sign * .088, 0, 1.717), .009, .008)
        pin.rotation_euler.y = math.pi / 2
    profile("socket_and_lower_window_seat", [
        (2.126, .083, .083, .012), (2.150, .087, .087, .012), (2.181, .102, .102, .013), (2.216, .102, .102, .012),
    ], iron)
    bevel_box("lower_retaining_ring", LENS_CENTER[:2] + (2.244,), (.108, .108, .060), fitting, .007)
    bevel_box("upper_retaining_ring", LENS_CENTER[:2] + (2.548,), (.104, .104, .027), fitting, .005)
    profile("seamed_head_collar", [(2.515, .102, .102, .011), (2.550, .104, .104, .012),
                                  (2.568, .112, .112, .014)], iron)
    profile("drip_edge", [(2.552, .123, .123, .014), (2.566, .129, .129, .015), (2.579, .128, .128, .014)], fitting)
    profile("pressed_rain_hood", [(2.572, .124, .124, .014), (2.597, .123, .123, .014),
                                  (2.682, .036, .036, .008), (2.689, .025, .025, .005)], iron)
    bevel_box("finial_socket", (0, 0, 2.698), (.037, .037, .027), fitting, .005)
    profile("folded_finial_stem", [(2.701, .010, .010, .003), (2.744, .010, .010, .003)], iron)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=10, ring_count=6, radius=.020, location=(0, 0, 2.757))
    finial = put(bpy.context.object, group)
    finial.name = "L01_rain_hood_finial"
    finial.parent = structure
    finial.data.materials.append(fitting)
    lens = put(box("L01_lens", LENS_CENTER, (.09, .09, .28), diffuser, radius=.009, segments=2), group)
    lens.parent = root
    return root


def bounds_of(objects):
    points = [obj.matrix_world @ Vector(corner) for obj in objects for corner in obj.bound_box]
    return [[round(fn(v[i] for v in points), 7) for i in range(3)] for fn in (min, max)]


def batch(root, group, parent, names):
    result = []
    original = {}
    for part in root.children_recursive:
        if part.type == "MESH":
            original.setdefault(part.data.materials[0].name, []).append(part)
    deps = bpy.context.evaluated_depsgraph_get()
    for name, objects in original.items():
        copies = []
        for obj in objects:
            mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(deps), preserve_all_data_layers=True, depsgraph=deps)
            duplicate = bpy.data.objects.new(names[name], mesh)
            group.objects.link(duplicate)
            duplicate.matrix_world = obj.matrix_world.copy()
            copies.append(duplicate)
        bpy.ops.object.select_all(action="DESELECT")
        for obj in copies:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = copies[0]
        if len(copies) > 1:
            bpy.ops.object.join()
        merged = copies[0]
        world = merged.matrix_world.copy()
        merged.parent = parent
        merged.matrix_parent_inverse = Matrix.Identity(4)
        merged.matrix_world = world
        result.append(merged)
    return result


def glb_json(path):
    raw = path.read_bytes()
    return json.loads(raw[20:20 + int.from_bytes(raw[12:16], "little")])


def check_primitives(path):
    doc = glb_json(path)
    materials = {m["name"]: m for m in doc["materials"]}
    assert len(doc["meshes"]) == 6
    assert {n["name"] for n in doc["nodes"]} >= {"C02", "L01", "L01_post", "L01_lens"}
    triangles = {}
    for mesh in doc["meshes"]:
        (primitive,) = mesh["primitives"]
        mat = doc["materials"][primitive["material"]]["name"]
        triangles[mesh["name"]] = doc["accessors"][primitive["indices"]]["count"] // 3
        assert {"POSITION", "NORMAL"} <= primitive["attributes"].keys()
        if mat in ("camp_quarry_stone", "camp_exit_timber"):
            assert "TEXCOORD_0" in primitive["attributes"]
            if mat == "camp_quarry_stone":
                assert "COLOR_0" in primitive["attributes"]
    for name in ("camp_quarry_stone", "camp_exit_timber"):
        mat = materials[name]
        assert "normalTexture" in mat
        assert {"baseColorTexture", "metallicRoughnessTexture"} <= mat["pbrMetallicRoughness"].keys()
    lens = materials["camp_exit_diffuser"]
    assert max(abs(a - b) for a, b in zip(lens["emissiveFactor"], lens["pbrMetallicRoughness"]["baseColorFactor"][:3])) < 1e-6
    return triangles


def run():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.context.scene.unit_settings.system = "METRIC"
    bpy.context.scene.render.threads_mode = "FIXED"
    bpy.context.scene.render.threads = 2
    write_maps(HERE / "textures")
    native = collection("Editable camp site | C02 + L01")
    stone = material("camp_quarry_stone", "9A9188", .82, maps="quarry-stone", tint=True)
    timber = material("camp_exit_timber", "7D6048", .68, maps="exit-timber")
    iron = material("camp_exit_coated_iron", "514941", .66)
    fitting = material("camp_exit_exposed_fittings", "756759", .56)
    diffuser = material("camp_exit_diffuser", "4FD1C5", .9, emission=.18)
    pad = make_pad(native, stone)
    post = make_post(native, stone, timber, iron, fitting, diffuser)
    bpy.context.view_layer.update()

    for obj in native.objects:
        if obj.type == "MESH" and not obj.data.uv_layers.get("FabricationUV"):
            while obj.data.uv_layers:
                obj.data.uv_layers.remove(obj.data.uv_layers[0])

    # Save the local assets side by side for editing; runtime export restores both roots to origin.
    pad.location.x = -1.83
    post.location.x = 1.18
    bpy.context.view_layer.update()
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE), compress=True)
    pad.location.x = post.location.x = 0
    bpy.context.view_layer.update()
    assert bounds_of([o for o in pad.children_recursive if o.type == "MESH"]) == [[-1.55, -1.25, -.1], [1.55, 1.25, 0]]
    assert bounds_of([o for o in post.children_recursive if o.type == "MESH"]) == [
        [-.2458283, -.2392575, 0], [.2458283, .2392575, 2.777]
    ]
    uv = tool("uv")
    audit = tool("materials")
    uv_report = {}
    for obj in native.objects:
        if obj.type != "MESH" or not obj.data.uv_layers:
            continue
        result = uv.uv_qa(obj, tex_res=512, analysis_res=128)
        assert result["zero_area_faces"] == 0 and result["flipped_faces"] == 0, result
        uv_report[obj.name] = {k: result[k] for k in ("td_px_per_m", "td_face_spread_p95_p05", "angle_err_p95_deg",
                                                      "flipped_faces", "zero_area_faces", "overlap_px_pct",
                                                      "faces_crossing_tiles")}
    material_report = {m.name: audit.audit_material(m) for m in (stone, timber, iron, fitting, diffuser)}
    assert not [issue for issues in material_report.values() for issue in issues if issue[0] == "error"], material_report

    runtime = collection("Derived runtime")
    c02 = empty("Export_C02", runtime)
    l01 = empty("Export_L01", runtime)
    l01["lightCentreGLB_y"] = 2.41
    post_group = empty("Export_L01_post", runtime, l01)
    pad_batch = batch(pad, runtime, c02, {stone.name: "C02_stone_batch"})
    post_batch = batch(bpy.data.objects["L01_post"], runtime, post_group, {
        stone.name: "L01_footing_batch", timber.name: "L01_timber_batch", iron.name: "L01_coated_iron_batch",
        fitting.name: "L01_fittings_batch",
    })
    lens = next(part for part in post.children if part.type == "MESH")
    copy = lens.copy()
    copy.data = bpy.data.meshes.new_from_object(lens.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    copy.modifiers.clear()
    runtime.objects.link(copy)
    copy.parent = l01
    for original in list(native.objects):
        bpy.data.objects.remove(original, do_unlink=True)
    c02.name, l01.name, post_group.name, copy.name = "C02", "L01", "L01_post", "L01_lens"
    for obj in [*pad_batch, *post_batch, copy]:
        obj.data.name = obj.name
    bpy.ops.object.select_all(action="DESELECT")
    for obj in runtime.objects:
        obj.select_set(True)
    # Export unit-strength emissive color; the runtime applies the existing clock curve.
    diffuser.node_tree.nodes.get("Principled BSDF").inputs["Emission Strength"].default_value = 1
    bpy.ops.export_scene.gltf(filepath=str(RUNTIME), export_format="GLB", use_selection=True,
                              export_extras=True, export_vertex_color="ACTIVE", export_yup=True)
    triangles = check_primitives(RUNTIME)
    report = {
        "export": tool("export").glb_summary(str(RUNTIME)),
        "trianglesByBatch": triangles,
        "tilingUV0": {"note": "Deliberately repeated UV0. Overlap and tile crossings are expected; no unique bake atlas.",
                      "parts": uv_report},
        "materialAudit": material_report,
    }
    (HERE / "scenario-report.json").write_text(json.dumps(report, indent=2) + "\n")

    manifest = {
        "sourceRevision": BASE_COMMIT,
        "blender": bpy.app.version_string,
        "generator": {"build.py": sha(HERE / "build.py"), "surfaces.py": sha(HERE / "surfaces.py")},
        "baseline": {p.name: sha(p) for p in sorted(HERE.glob("baseline-*"))},
        "families": {
            "C02": {"dimensionsXYZ_m": [3.1, .1, 2.5], "origin": "top centre, Y=4.9 in camp", "instances": 8},
            "L01": {"dimensionsXYZ_m": [.4916565, 2.777, .4785151], "origin": "foot centre, Y=4.8 in camp",
                    "instances": [[-30, 4.8, 31], [-30, 4.8, 37]], "lensCentreXYZ_m": [LENS_CENTER[0], 2.41, -LENS_CENTER[1]]},
        },
        "materials": ["quarry sandstone", "oiled timber", "powder-coated iron", "warm iron fittings", "cyan diffuser"],
        "maps": {p.name: {"sha256": sha(p), "size": [512, 512], "source": "original procedural"}
                 for p in sorted((HERE / "textures").glob("*.png"))},
        "firstCompleteHashes": {SOURCE.name: sha(SOURCE), RUNTIME.name: sha(RUNTIME)},
        "trianglesByBatch": triangles,
    }
    (HERE / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps({"triangles": triangles, "sha256": manifest["firstCompleteHashes"]}))


if __name__ == "__main__":
    run()
