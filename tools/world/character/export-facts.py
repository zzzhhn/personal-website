"""Fresh-import facts for the actual final Draco GLB. Does not modify/export the scene."""
import bpy,sys,json,hashlib
from pathlib import Path
a=sys.argv[sys.argv.index('--')+1:];p=Path(a[0]);bpy.ops.wm.read_factory_settings(use_empty=True);bpy.context.scene.render.fps=60;bpy.ops.import_scene.gltf(filepath=str(p))
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH'];triangles=0
for o in meshes:o.data.calc_loop_triangles();triangles+=len(o.data.loop_triangles)
r={'path':str(p),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size,'blender':bpy.app.version_string,'triangles':triangles,'meshes':len(meshes),'bones':sum(len(o.data.bones)for o in bpy.context.scene.objects if o.type=='ARMATURE'),'actions':sorted(a.name for a in bpy.data.actions),'materials':sorted(m.name for m in bpy.data.materials)}
Path(a[1]).write_text(json.dumps(r,indent=1));print(json.dumps(r))
