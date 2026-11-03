import bpy,json,sys
from pathlib import Path
from mathutils import Vector
mode,root,stem,out=sys.argv[sys.argv.index("--")+1:]
if mode=="glb":
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(Path(root)/f"{stem}.glb"))
meshes=[o for o in bpy.context.scene.objects if o.type=="MESH"]
bounds=[o.matrix_world@Vector(p) for o in meshes for p in o.bound_box]
data=dict(objects=len(meshes),triangles=sum(len(o.data.polygons) for o in meshes),
    materials=len({m.name for o in meshes for m in o.data.materials}),
    bounds=[[round(fn(p[i] for p in bounds),4) for i in range(3)] for fn in (min,max)])
Path(out).write_text(json.dumps(data,indent=2)+"\n")
