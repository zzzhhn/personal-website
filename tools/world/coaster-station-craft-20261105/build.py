"""Editable station craft pack; all arguments use engine local metres/Y-up.

Read the exported live contract before running. No renderer, lights or physics
are generated. Near, Far and Shadow have the same origin at coasterWorld(0).
"""
import bpy
import json
import math
from pathlib import Path
import numpy as np
from mathutils import Quaternion, Vector

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "docs/world/phase-2-playground/coaster-station-craft-20261105"
D = json.loads((OUT / "contract.json").read_text())
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version = 0
bpy.context.scene.unit_settings.system = "METRIC"
C = bpy.data.collections.new("AUTHOR | Station construction and retained datums")
bpy.context.scene.collection.children.link(C)
M = {}
parts = {}


def v(p):
    return (p[0], -p[2], p[1])


def linear(h):
    x = [int(h[i:i+2], 16) / 255 for i in (0, 2, 4)]
    return tuple(a / 12.92 if a <= .04045 else ((a + .055) / 1.055) ** 2.4 for a in x)


def material(key, name, color, rough, metal=0, coat=0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    m.use_backface_culling = True
    p = m.node_tree.nodes.get("Principled BSDF")
    p.inputs["Base Color"].default_value = (*linear(color), 1)
    p.inputs["Roughness"].default_value = rough
    p.inputs["Metallic"].default_value = metal
    p.inputs["Coat Weight"].default_value = coat
    p.inputs["Coat Roughness"].default_value = .24
    m.diffuse_color = (*linear(color), 1)
    M[key] = m
    return m


material("mineral", "01 Warm mineral cladding", "c0c3b9", .82)
material("paint", "02 Petrol structural enamel", "4d6873", .37, .18, .3)
material("copper", "03 Copper folded edge", "b98350", .34, .35, .28)
material("steel", "04 Machined galvanized steel", "b7c2c2", .37, .85)
material("soffit", "05 Warm matte soffit", "999f99", .78)
material("glazing", "06 Deep opaque architectural glass", "29454e", .22, .18, .48)
material("dark", "07 Graphite gaskets and recesses", "26363e", .76)


def map_image(name, value):
    size = value.shape[0]
    a = np.ones((size, size, 4), np.float32)
    a[:, :, :3] = value[:, :, None] if value.ndim == 2 else value
    image = bpy.data.images.new(name, width=size, height=size)
    image.colorspace_settings.name = "Non-Color"
    image.pixels.foreach_set(a.ravel())
    image.filepath_raw = str(OUT / (name + ".png"))
    image.file_format = "PNG"
    image.save()
    image.pack()
    return image


def texture(key, image, channel, normal_strength=0):
    m = M[key]
    n = m.node_tree.nodes.new("ShaderNodeTexImage")
    n.image = image
    target = m.node_tree.nodes.get("Principled BSDF").inputs[channel]
    if normal_strength:
        bump = m.node_tree.nodes.new("ShaderNodeNormalMap")
        bump.inputs["Strength"].default_value = normal_strength
        m.node_tree.links.new(n.outputs["Color"], bump.inputs["Color"])
        m.node_tree.links.new(bump.outputs["Normal"], target)
    else:
        m.node_tree.links.new(n.outputs["Color"], target)


rng = np.random.default_rng(51617)
y, x = np.mgrid[:256, :256]
grain = rng.normal(0, 1, (256, 256))
texture("mineral", map_image("authored-mineral-roughness256", np.clip(.8 + grain * .018, .72, .89)), "Roughness")
brush = .365 + .026 * np.sin(y * math.tau * 71 / 256) + rng.normal(0, .009, (256, 256))
texture("steel", map_image("authored-brush-roughness256", np.clip(brush, .3, .43)), "Roughness")
# Low, directional rolling marks belong to the coated roofing, not to mineral.
h = .006 * np.sin(x * math.tau * 7 / 256) + .001 * grain
dy, dx = np.gradient(h)
normal = np.stack((-dx * 5, -dy * 5, np.ones_like(x)), axis=2)
normal /= np.linalg.norm(normal, axis=2)[:, :, None]
texture("paint", map_image("authored-rolled-metal-normal256", normal * .5 + .5), "Normal", .35)


def root(name):
    o = bpy.data.objects.new(name, None)
    C.objects.link(o)
    o.empty_display_size = .4
    parts[o.name] = []
    return o


def attach(o, owner, key):
    for c in list(o.users_collection):
        c.objects.unlink(o)
    C.objects.link(o)
    o.parent = owner
    o.data.materials.append(M[key])
    parts.setdefault(owner.name, []).append(o)
    return o


def uv(o):
    layer = o.data.uv_layers.active or o.data.uv_layers.new(name="Fabrication UV")
    for face in o.data.polygons:
        axis = max(range(3), key=lambda i: abs(face.normal[i]))
        u, w = [(1, 2), (0, 2), (0, 1)][axis]
        for i in face.loop_indices:
            co = o.data.vertices[o.data.loops[i].vertex_index].co
            layer.data[i].uv = (co[u] / .8, co[w] / .8)


def mesh(name, vertices, faces, owner, key):
    data = bpy.data.meshes.new(name)
    data.from_pydata([v(p) for p in vertices], [], faces)
    data.update()
    o = attach(bpy.data.objects.new(name, data), owner, key)
    uv(o)
    return o


def box(name, at, size, owner, key, r=0, q=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=v(at))
    o = bpy.context.object
    o.name = name
    o.scale = (size[0], size[2], size[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    attach(o, owner, key)
    if q is not None:
        o.rotation_mode = "QUATERNION"
        o.rotation_quaternion = Quaternion((q[3], q[0], -q[2], q[1]))
    if r:
        bevel = o.modifiers.new("Contained manufactured edge", "BEVEL")
        bevel.width = r
        bevel.segments = 3 if owner.name == "Near" else 1
        for f in o.data.polygons:
            f.use_smooth = True
        weighted = o.modifiers.new("Face normals", "WEIGHTED_NORMAL")
        weighted.keep_sharp = True
    uv(o)
    return o


def prism(name, profile, za, zb, owner, key):
    n = len(profile)
    vertices = [(x, y, z) for z in (za, zb) for x, y in profile]
    faces = [tuple(reversed(range(n))), tuple(range(n, n * 2))]
    faces += [(i, (i+1) % n, n+(i+1) % n, n+i) for i in range(n)]
    return mesh(name, vertices, faces, owner, key)


def housing(name, at, size, owner, key):
    x, y, z = at
    w, h, d = size
    cut = min(.65, h * .2, w * .15)
    return prism(name, [(x-w/2,y-h/2), (x+w/2,y-h/2), (x+w/2,y+h/2-cut),
                        (x+w/2-cut,y+h/2), (x-w/2+cut,y+h/2), (x-w/2,y+h/2-cut)],
                 z-d/2, z+d/2, owner, key)


def beam(name, a, b, radius, owner, key):
    start, end = Vector(v(a)), Vector(v(b))
    direction = end-start
    bpy.ops.mesh.primitive_cylinder_add(vertices=16 if owner.name == "Near" else 8,
        radius=radius, depth=direction.length, location=(start+end)/2)
    o = bpy.context.object
    o.name = name
    o.rotation_mode = "QUATERNION"
    o.rotation_quaternion = Vector((0,0,1)).rotation_difference(direction.normalized())
    attach(o, owner, key)
    uv(o)
    return o


def tread(step, owner):
    # Every contact-top corner is exact. The metal nose shares the same plane;
    # it never raises the model above the established sole/ground-probe surface.
    at, size = step["at"], step["size"]
    w, h, d = size
    angle = step["yaw"]
    q = [0, math.sin(angle/2), 0, math.cos(angle/2)]
    top = at[1] + h/2
    def local_box(name, y, z, size, key, r=0):
        p = [at[0] + math.sin(angle)*z, y, at[2] + math.cos(angle)*z]
        return box(step["name"] + " " + name, p, size, owner, key, r, q)
    # Thick mineral riser sits flush with the low structural skin; no hollow
    # box replaces the existing full height collision volume.
    near = owner.name == "Near"
    # Side returns replace a slice of the core, rather than lying on its face.
    # Their top stops below the contact slab so neither region has two skins.
    local_box("riser", at[1] - .0275, 0, [w-.024 if near else w, h-.055, d], "mineral")
    local_box("contact slab", top-.0275, -.0275, [w, .055, d-.055], "mineral")
    local_box("folded tread nose", top-.0275, .5*d-.0275, [w, .055, .055], "steel")
    # Retain the old inherited front-lip envelope exactly, below contact height.
    local_box("vertical lip", top-.021, .01+.5*d, [w, .042, .02], "steel")
    if near:
        for side in (-1, 1):
            local_box("side return", at[1]-.0275, 0, [.012, h-.055, d], "paint")
            # The returns are offset along the tread's width axis, within its box.
            o = parts[owner.name][-1]
            o.location.x += side*(w/2-.006)*math.cos(angle)
            o.location.y += side*(w/2-.006)*math.sin(angle)


def make_station(owner, near):
    # Roof profile is fixed. The perimeter and top remain the old extrusion.
    profile = D["roof"]["profile"]
    # Set the vertical backing behind the 5cm edge returns. Reusing the old
    # full prism here would leave its face coplanar with the new copper fascia.
    core = [(-10.95,6.25),(6.95,6.25),(6.95,6.55),(7,6.55),
            (4.7,7.4),(-8.7,7.4),(-11,6.55),(-10.95,6.55)]
    prism("Retained roof silhouette", core, 30, 53, owner, "paint")
    if near:
        # Actual shallow cassette depth is inside the old 6.2..6.25 underside.
        for i in range(6):
            for j in range(8):
                box(f"Soffit cassette {i}/{j}", [-9.5+i*3, 6.225, 31.4375+j*2.875],
                    [2.962, .05, 2.835], owner, "soffit", .007)
    else:
        box("Continuous distant soffit", [-2, 6.225, 41.5], [18, .05, 23], owner, "soffit")
    # Deep folded side fascia provides an edge, underside and end return within
    # the retained prism, with no added overhang into the passenger aisle.
    for x in (-10.975, 6.975):
        box("Perimeter eave fascia", [x, 6.375, 41.5], [.05, .35, 23], owner, "copper")
    for z in (30.024, 52.976):
        box("Front and rear drip return", [-2, 6.225, z], [17.9, .05, .048], owner, "steel")
    for x in (-8.65, 4.65):
        box("Retained copper ridge edge", [x, 7.4, 41.5], [.12, .06, 22.8], owner, "copper", .009 if near else 0)
    # Four actual original columns, including their original top chamfer.
    for i, col in enumerate(D["columns"]):
        x, _, z = col["at"]
        housing(f"Column {i} exact envelope", col["at"], col["size"], owner, "mineral")
        housing(f"Column {i} plinth", [x,.55 if near else .5,z], [1.14,.9 if near else 1,1.14], owner, "paint")
        box(f"Column {i} capital", [x,5.8,z], [1.14,.7,1.14], owner, "copper", .018 if near else 0)
        beam(f"Column {i} retained lateral knee", [x,4.75,z],
             [x+(.42 if x<0 else -.42),6.15,z], .095, owner, "steel")
        box(f"Column {i} bearing plate", [x,5.91,z], [1.18,.14,1.18], owner, "steel", .012 if near else 0)
        if near:
            # Broad lower slip joint and recessed base plate, not bolt garnish.
            box(f"Column {i} machined base shoe", [x,.05,z], [1.14,.1,1.14], owner, "steel", .012)
            for side in (-1, 1):
                box(f"Column {i} reveal {side}", [x+side*.542,2.95,z], [.016,3.85,.074], owner, "dark")
    for i, member in enumerate(D["members"]):
        # Collision/contact members are full, unrounded original boxes.
        if near and i % 3 == 0:
            x, y, z = member["position"]
            w, h, d = member["size"]
            for offset in (-h/2+.03, h/2-.03):
                box(f"Contact member {i} flush flange", [x,y+offset,z], [w,.06,d], owner, "steel")
            box(f"Contact member {i} uninterrupted web", [x,y,z], [w,h-.12,d], owner, "paint")
        else:
            box(f"Contact member {i}", member["position"], member["size"], owner,
                "paint" if i % 3 == 0 else "copper", q=member["quaternion"])
    for x in (-10, 6):
        box("Retained eave bearing girder", [x,6.13,41.5], [.48,.38,21], owner, "paint")
    for z in (31.2, 42.8, 51.1):
        box("Cross roof ledger", [-2,6.24,z], [17.8,.28,.35], owner, "steel")
    for x in (-9, 5):
        housing("Chamfered front fascia end", [x,6.77,52.95], [3.6,1.05,.14], owner, "mineral")
    box("Retained upper copper fascia", [-2,7.2,52.98], [10.4,.32,.16], owner, "copper", .013 if near else 0)
    # The bilingual atlas plane remains at z=53.1 and is not part of this pack.
    box("Station sign backing", [-2,6.7,53.078], [8.64,1,.032], owner, "dark", .008 if near else 0)
    for x in (-6.285, 2.285):
        box("Sign vertical folded frame", [x,6.7,53.1], [.05,1,.018], owner, "steel", .004 if near else 0)
    for y in (6.2125, 7.1875):
        box("Sign horizontal folded frame", [-2,y,53.1], [8.62,.025,.018], owner, "steel", .003 if near else 0)
    # Existing rooftop plenum kept inside its 9 x .3 x 6 envelope.
    box("Roof equipment full plinth", [-2,7.433,40], [9,.066,6], owner, "dark")
    box("Roof equipment folded cap", [-2,7.683,40], [9,.034,6], owner, "paint", .012 if near else 0)
    for x in (-6.43, 2.43):
        box("Rooftop end enclosure", [x,7.55,40], [.14,.25,6], owner, "paint")
    for side in (-1, 1):
        z = 40+side*2.94
        box("Rooftop recessed intake", [-2,7.55,z], [8.72,.21,.08], owner, "dark")
        for y in (7.49, 7.59):
            box("Rooftop bent louvre", [-2,y,z+side*.018], [8.68,.032,.035], owner, "steel")
    for z in (34, 39, 44, 49):
        box("Waiting board structural back", [7.184,2.7,z], [.122,1.6,2.8], owner, "paint", .018 if near else 0)
        box("Waiting board recessed field", [7.104,2.7,z], [.012,1.43,2.61], owner, "glazing", .005 if near else 0)
        for dz in (-1.345, 1.345):
            box("Waiting board folded edge", [7.108,2.7,z+dz], [.025,1.51,.055], owner, "steel")
        for y in (1.935, 3.465):
            box("Waiting board head/sill", [7.11,y,z], [.03,.07,2.8], owner, "paint")
    # East/west cores and the original mineral frame dimensions.
    for building in D["buildings"]:
        housing(building["name"]+" core", building["at"], [s-.12 for s in building["size"]], owner, "paint")
    for z in (36.32, 40.7, 45.2, 49.68):
        box("East mineral pier", [10,3.15,z], [5.5,4.9,.64], owner, "mineral", .015 if near else 0)
    for y in (.4, 5.9):
        box("East mineral continuous sill", [10,y,43], [5.5,.6,14], owner, "mineral", .012 if near else 0)
    for z in (38.5, 43, 47.5):
        housing("East lower folded panel", [12.78,1.55,z], [.12,1.75,3.35], owner, "mineral")
        housing("East upper folded panel", [12.78,5.1,z], [.12,1,3.35], owner, "mineral")
        box("East sealed clerestory recess", [12.8,3.45,z], [.07,1.5,3.05], owner, "glazing", .012 if near else 0)
        for y in (2.64, 4.26):
            box("East copper sill/header", [12.84,y,z], [.12,.13,3.3], owner, "copper", .012 if near else 0)
        box("East window mullion", [12.87,3.45,z], [.08,1.55,.1], owner, "steel", .005 if near else 0)
        for dy in (-.43, .43):
            box("East folded panel course", [12.87,1.55+dy,z], [.12,.76,3.16], owner, "mineral", .012 if near else 0)
        box("East drip sill", [12.89,2.46,z], [.16,.1,3.28], owner, "steel", .006 if near else 0)
    housing("East closed service jamb", [10,2.35,50.06], [2.6,4.1,.14], owner, "paint")
    box("East inset service leaf", [10,2.35,50.15], [2.12,3.65,.08], owner, "dark", .015 if near else 0)
    if near:
        for y in (1.28, 3.05):
            box("East pressed service door field", [10,y,50.196], [1.81,1.33,.012], owner, "paint", .005)
    box("East lintel cap", [10,4.57,50.12], [3.8,.28,.22], owner, "copper", .014 if near else 0)
    box("East fixed pull handle", [10.72,2.15,50.23], [.1,.48,.1], owner, "steel", .025 if near else 0)
    for x in (8.85, 11.15):
        box("East door foot guard", [x,.5,50.14], [.32,.5,.14], owner, "copper", .012 if near else 0)
    for z in (31.35, 38.65):
        box("West end mineral panel", [-14.5,2.7,z], [5,4,.7], owner, "mineral", .015 if near else 0)
    for y in (.35, 5.05):
        box("West mineral sill/header", [-14.5,y,35], [5,.7,8], owner, "mineral", .014 if near else 0)
    for z in (33.2, 36.8):
        box("West louvre recess", [-17.04,2.7,z], [.1,3.3,2.5], owner, "dark")
        for y in (1.5, 2.7, 3.9):
            box("West continuous louvre rail", [-17.11,y,z], [.12,.12,2.5], owner, "steel", .005 if near else 0)
        if near:
            for y in (1.82, 2.07, 2.32, 3.02, 3.27, 3.52):
                box("West folded louvre blade", [-17.10,y,z], [.09,.09,2.35], owner, "paint", .01)
    # Existing east roof housing, opened into backed louvres in the same shell.
    housing("East roof services housing", [10,6.6,43], [3.68,.72,7.88], owner, "dark")
    box("East roof services base", [10,6.24,43], [3.8,.08,8], owner, "paint")
    box("East roof services cap", [10,6.98,43], [3.48,.04,7.98], owner, "paint")
    for z in (39.06, 46.94):
        box("East roof services endcap", [10,6.6,z], [3.74,.69,.12], owner, "paint", .02 if near else 0)
    for x in (8.12, 11.88):
        for y in (6.39, 6.59, 6.79):
            box("East roof services louvre", [x,y,43], [.035,.075,7.54], owner, "steel", .006 if near else 0)
    for i, vent in enumerate(D["eastRoofVents"]):
        box(f"East retained roof vent {i}", vent["at"], vent["size"], owner, "steel", .012 if near else 0)
    for step in D["steps"]:
        tread(step, owner)


near = root("Near")
far = root("Far")
make_station(near, True)
make_station(far, False)

# A deliberately separate opaque silhouette, using exact frozen contact and
# broad-shell geometry rather than casting all thin near-LOD cladding.
shadow = root("Shadow")
prism("Shadow original roof", D["roof"]["profile"], 30, 53, shadow, "dark")
for i, col in enumerate(D["columns"]):
    housing(f"Shadow column {i}", col["at"], col["size"], shadow, "dark")
for i, member in enumerate(D["members"]):
    box(f"Shadow contact member {i}", member["position"], member["size"], shadow, "dark", q=member["quaternion"])
for b in D["buildings"]:
    housing("Shadow "+b["name"], b["at"], b["size"], shadow, "dark")
box("Shadow main rooftop equipment", [-2,7.55,40], [9,.3,6], shadow, "dark")
housing("Shadow east roof equipment", [10,6.6,43], [3.8,.8,8], shadow, "dark")
for i, vent in enumerate(D["eastRoofVents"]):
    box(f"Shadow east roof vent {i}", vent["at"], vent["size"], shadow, "dark")
for step in D["steps"]:
    a = step["yaw"]
    box("Shadow "+step["name"], step["at"], step["size"], shadow, "dark", q=[0,math.sin(a/2),0,math.cos(a/2)])

native_count = sum(o.type == "MESH" for o in C.objects)
for o in (near, far, shadow):
    o["contract"] = "Preserve placement; never use this visual pack as physics."
far.hide_viewport = True
shadow.hide_viewport = True
bpy.ops.wm.save_as_mainfile(filepath=str(OUT / "station-editable.blend"), compress=True)
far.hide_viewport = False
shadow.hide_viewport = False

# Derive batched meshes only after saving all native, named construction parts.
for owner in (near, far, shadow):
    groups = {}
    for o in list(owner.children):
        if o.type != "MESH":
            continue
        bpy.context.view_layer.objects.active = o
        for mod in list(o.modifiers):
            bpy.ops.object.modifier_apply(modifier=mod.name)
        groups.setdefault(o.data.materials[0].name, []).append(o)
    for name, objects in groups.items():
        bpy.ops.object.select_all(action="DESELECT")
        for o in objects:
            o.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        if len(objects) > 1:
            bpy.ops.object.join()
        o = bpy.context.object
        o.name = owner.name + " | " + name
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

bpy.ops.object.select_all(action="DESELECT")
for o in C.objects:
    o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT / "station.glb"), export_format="GLB",
    use_selection=True, export_yup=True, export_animations=False, export_cameras=False,
    export_lights=False, export_extras=True)
print(f"STATION_RESULT editableParts={native_count} Blender={bpy.app.version_string}", flush=True)
