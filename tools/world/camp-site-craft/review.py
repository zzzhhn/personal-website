"""Same-rig Blender review of the reconstructed baseline, editable source and fresh GLB."""
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from build import SOURCE, RUNTIME, box, linear, material, bounds_of, tool

REVIEW = HERE / "review"
PAD_POSITION = (-1.24, -.18, .10)
POST_POSITION = (1.23, .38, 0)
CAMERA = (4.43, -7.92, 3.67)
TARGET = (-.07, .11, 1.0)
LENS = 53
SUN_ROTATION = (math.radians(31), math.radians(-35), math.radians(-33))


def aim(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def lamp(name, lamp_type, position, strength, color):
    light = bpy.data.lights.new(name, lamp_type)
    light.energy = strength
    light.color = color
    obj = bpy.data.objects.new(name, light)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = position
    return obj


def rig(night=False):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 12
    scene.cycles.use_denoising = True
    scene.render.threads_mode = "FIXED"
    scene.render.threads = 2
    scene.render.resolution_x = 960
    scene.render.resolution_y = 648
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.exposure = 0
    world = bpy.data.worlds.new("Review outdoor fill")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (.32, .43, .62, 1) if night else (.67, .77, .88, 1)
    bg.inputs["Strength"].default_value = .18 if night else .52
    scene.world = world
    sky_key = lamp("Review key", "SUN", (0, 0, 6), .25 if night else 2.1, (.65, .77, 1) if night else (1, .90, .76))
    sky_key.data.angle = math.radians(11)
    sky_key.rotation_euler = SUN_ROTATION
    # Shared world-rig bounce. The L01 asset carries no real light objects.
    if night:
        warm = lamp("Camp-side ambient spill", "AREA", (-3.9, -2.65, 3.4), 75, (1, .57, .29))
        warm.data.shape = "DISK"
        warm.data.size = 3.4
        aim(warm, (0, 0, 0))
    camera = bpy.data.objects.new("Encounter camera", bpy.data.cameras.new("Encounter camera"))
    scene.collection.objects.link(camera)
    camera.location = CAMERA
    camera.data.lens = LENS
    aim(camera, TARGET)
    scene.camera = camera
    floor = material("Review plaza", "9E947E", .95)
    box("Reference grade", (0, 0, -.064), (200, 200, .128), floor, radius=0)


def render(label, night=False, clay=False):
    clay_objects = list(bpy.context.scene.objects)
    rig(night)
    if clay:
        neutral = material("Neutral clay", "A5A39F", .79)
        for obj in clay_objects:
            if obj.type != "MESH":
                continue
            obj.data.materials.clear()
            obj.data.materials.append(neutral)
    scene = bpy.context.scene
    scene.render.filepath = str(REVIEW / (label + ".png"))
    bpy.ops.render.render(write_still=True)


def baseline(night=False):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(HERE / "baseline-L01.glb"))
    post = bpy.data.objects["L01"]
    post.location = POST_POSITION
    for name in ("L01_post", "L01_lens"):
        mesh = bpy.data.objects[name]
        attr = mesh.data.color_attributes[0].name
        m = material("Legacy " + name, "FFFFFF", .90 if name.endswith("lens") else .82)
        nt = m.node_tree
        p = nt.nodes.get("Principled BSDF")
        color = nt.nodes.new("ShaderNodeVertexColor")
        color.layer_name = attr
        nt.links.new(color.outputs["Color"], p.inputs["Base Color"])
        if name.endswith("lens"):
            nt.links.new(color.outputs["Color"], p.inputs["Emission Color"])
            p.inputs["Emission Strength"].default_value = 1.43 if night else .18
        else:
            for socket, matte, metal in (("Roughness", .82, .58), ("Metallic", 0, .35)):
                mix = nt.nodes.new("ShaderNodeMapRange")
                mix.inputs["To Min"].default_value, mix.inputs["To Max"].default_value = matte, metal
                nt.links.new(color.outputs["Alpha"], mix.inputs["Value"])
                nt.links.new(mix.outputs["Result"], p.inputs[socket])
        mesh.data.materials.clear()
        mesh.data.materials.append(m)

    x, y, z = PAD_POSITION
    base = material("Legacy C02 grout", "6A6560", 1)
    colors = [material("Legacy C02 tile " + c, c, 1) for c in ("8A8580", "97928B", "807B75")]
    box("Legacy C02 grout", (x, y, .035), (3.1, 2.5, .07), base, radius=0)
    x0 = -1.5
    for c, w in enumerate((1.1, .9, 1.0)):
        z0 = -1.2
        for r, d in enumerate((1.3, 1.1)):
            # World X/Z to Blender X/-Y. Pad index zero; yaw is zero on the isolated rig.
            tile = box(f"Legacy C02 slab {c}-{r}", (x + x0 + w / 2, y - z0 - d / 2, z - .035),
                       (w - .05, d - .05, .07), colors[(c + r * 2) % 3], radius=0)
            h = math.sin((c * 2 + r) * 12.9898 + 9 * 78.233) * 43758.5453
            tile.rotation_euler.z = .025 * ((h - math.floor(h)) * 2 - 1)
            z0 += d
        x0 += w


def arrange():
    bpy.data.objects["C02"].location = PAD_POSITION
    bpy.data.objects["L01"].location = POST_POSITION


def imported():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(RUNTIME))
    bpy.context.view_layer.update()


def snapshot(root, evaluated=False):
    objects = [o for o in root.children_recursive if o.type == "MESH"]
    meshes = [o.evaluated_get(bpy.context.evaluated_depsgraph_get()).data if evaluated else o.data for o in objects]
    for mesh in meshes:
        mesh.calc_loop_triangles()
    return {
        "boundsNative": bounds_of(objects),
        "triangles": sum(len(m.loop_triangles) for m in meshes),
        "materials": sorted({material.name for mesh in meshes for material in mesh.materials}),
    }


def main():
    REVIEW.mkdir(exist_ok=True)
    profile = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    baseline()
    render("01-baseline-day")

    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    native = {}
    for family in ("C02", "L01"):
        root = bpy.data.objects[family]
        root.location = (0, 0, 0)
        bpy.context.view_layer.update()
        native[family] = snapshot(root, evaluated=True)
    arrange()
    render("02-native-day")

    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    arrange()
    render("03-native-clay", clay=True)

    imported()
    round_trip = {family: snapshot(bpy.data.objects[family]) for family in native}
    for family, source in native.items():
        reread = round_trip[family]
        assert all(abs(a - b) < 1e-5 for v, w in zip(source["boundsNative"], reread["boundsNative"]) for a, b in zip(v, w))
        assert reread["triangles"] == source["triangles"]
        assert reread["materials"] == source["materials"]
    arrange()
    lens = bpy.data.materials["camp_exit_diffuser"].node_tree.nodes.get("Principled BSDF")
    lens.inputs["Emission Strength"].default_value = .18
    render("04-reimport-day")

    if "--night" in profile:
        baseline(night=True)
        render("05-baseline-night", night=True)
        imported()
        arrange()
        lens = bpy.data.materials["camp_exit_diffuser"].node_tree.nodes.get("Principled BSDF")
        lens.inputs["Emission Strength"].default_value = 1.43
        render("06-reimport-night", night=True)

    readback = {
        "native": native, "roundTrip": round_trip,
        "camera": {"position": CAMERA, "target": TARGET, "lens_mm": LENS},
        "arrangement": {"pad": PAD_POSITION, "post": POST_POSITION},
        "renderer": {"resolution": [960, 648], "engine": "Cycles CPU", "samples": 12, "threads": 2, "view": "AgX", "exposure": 0},
        "files": {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(REVIEW.glob("*.png"))},
    }
    (REVIEW / "readback.json").write_text(json.dumps(readback, indent=2) + "\n")


if __name__ == "__main__":
    main()
