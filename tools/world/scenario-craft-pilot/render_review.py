"""Matched offline baseline/export review, never production screenshot evidence."""
from pathlib import Path
import bpy,json,math
HERE=Path(__file__).resolve().parent
REPO=HERE.parents[2]
GLB=REPO/'public/assets/world/scenario-craft-pilot/C03-tent-v1.glb'
bpy.ops.wm.open_mainfile(filepath=str(HERE/'C03-tent-editable.blend'))
sc=bpy.context.scene;sc.render.threads_mode='FIXED';sc.render.threads=2
out=HERE/'qa';sc.render.image_settings.file_format='PNG'

def render(name):
    sc.render.filepath=str(out/f'{name}.png');bpy.ops.render.render(write_still=True)

render('author-source-ordinary')
bpy.data.collections['SOURCE | C03 crafted tent'].hide_render=True
before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(GLB));candidate=[o for o in bpy.data.objects if o not in before]
meshes=[o for o in candidate if o.type=='MESH']
rows=[]
for o in meshes:
    me=o.data;me.calc_loop_triangles()
    rows.append({'name':o.name,'triangles':len(me.loop_triangles),'uvLayers':[u.name for u in me.uv_layers], 'materials':[m.name for m in me.materials]})
root=next(o for o in candidate if o.get('assetId')=='C03')
base=json.loads((HERE/'first-complete-manifest.json').read_text())
assert list(root['doorProfile'])==base['contract']['doorProfile']
assert json.loads(root['tentParams'])==base['contract']['tentParams']
render('export-reimport-ordinary')
clay=bpy.data.materials.new('neutral clay');clay.diffuse_color=(.48,.48,.48,1);clay.use_nodes=True
clay.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.48,.48,.48,1)
clay.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.8
sc.view_layers[0].material_override=clay;render('export-reimport-clay');sc.view_layers[0].material_override=None
for o in candidate:o.hide_render=True
bpy.ops.import_scene.gltf(filepath=str(HERE/'baseline-C03.glb'))
render('baseline-exact-glb-ordinary')
(out/'roundtrip.json').write_text(json.dumps({'renderer':bpy.app.version_string,'scope':'matched offline only; engine view and actual collision not checked','meshes':rows,'doorProfileEqual':True,'tentParamsEqual':True,'camera':list(sc.camera.location),'lens':sc.camera.data.lens,'resolution':[sc.render.resolution_x,sc.render.resolution_y],'samples':sc.cycles.samples,'rig':'source .blend unchanged; imported candidate and exact old GLB same camera/lights/exposure'},indent=2))
print('REVIEW_DONE',len(rows),flush=True)
