import bpy, json, sys
from pathlib import Path
from mathutils import Vector
mode, folder, result = sys.argv[sys.argv.index("--") + 1:]
folder = Path(folder)
if mode == "glb":
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(folder / "intake-roller-assembly.glb"))
objects = sorted((o for o in bpy.context.scene.objects if o.type == "MESH"), key=lambda o: o.name)
assert len(objects) == 47
assert len({m.name for o in objects for m in o.data.materials}) == 4
assert sum(len(o.data.polygons) for o in objects) == 1496
bounds = [o.matrix_world @ Vector(p) for o in objects for p in o.bound_box]
out = dict(mode=mode, objects=len(objects), triangles=1496,
           materials=sorted({m.name for o in objects for m in o.data.materials}),
           bounds=[[round(fn(p[i] for p in bounds),5) for i in range(3)] for fn in (min,max)])
Path(result).write_text(json.dumps(out, indent=2)+"\n")
