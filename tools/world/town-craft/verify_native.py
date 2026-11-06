"""Fresh-import evidence: collision and anchor identity, UVs, wind, finite meshes."""
import sys,json,math
from pathlib import Path
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE));sys.path.insert(0,str(HERE.parent/'town'))
import bpy
import build_town as base
from townlib import reset_scene

def run(repo,ids):
 report={}
 for aid in ids:
  reset_scene();A=base.BUILDERS[aid]()
  expected={name:[tuple(v.co) for v in bm.verts] for name,bm in A.cols}
  anchors={name:(tuple(loc),extras) for name,loc,extras in A.anchors}
  expected_parts=set(A.parts)
  for bm,_ in A.parts.values():bm.free()
  for _,bm in A.cols:bm.free()
  reset_scene();bpy.ops.import_scene.gltf(filepath=str(repo/'public/assets/world/town-craft'/f'{aid}.glb'))
  bpy.context.view_layer.update()
  cols={o.name:o for o in bpy.context.scene.objects if o.name.startswith('col_')}
  assert set(cols)==set(expected),(aid,'collider names changed',set(cols)^set(expected))
  maxerror=0
  for name,ob in cols.items():
   pts=[ob.matrix_world@v.co for v in ob.data.vertices]
   for point in expected[name]:
    error=min(math.dist(point,p) for p in pts);maxerror=max(maxerror,error);assert error<.002,(aid,name,error)
   for point in pts:
    assert min(math.dist(point,p) for p in expected[name])<.002,(aid,name,'unexpected collider vertex')
  for name,(point,extras) in anchors.items():
   ob=bpy.data.objects.get(name);assert ob is not None,(aid,name)
   assert math.dist(tuple(ob.matrix_world.translation),point)<.002
   for k,v in extras.items():assert ob.get(k)==v,(aid,name,k)
  visible=[o for o in bpy.context.scene.objects if o.type=='MESH' and not o.name.startswith('col_')]
  tris=0;wind=0;degenerate=0
  for ob in visible:
   assert len(ob.data.uv_layers)>0,(aid,ob.name,'no UV')
   ob.data.calc_loop_triangles();tris+=len(ob.data.loop_triangles)
   degenerate+=sum(t.area<1e-9 for t in ob.data.loop_triangles)
   for v in ob.data.vertices:assert all(math.isfinite(x) for x in v.co)
   if aid=='T12' and any(m and m.name.startswith('palm_leaf') for m in ob.data.materials):
    attribute=ob.data.attributes.get('_WIND') or ob.data.attributes.get('_wind')
    assert attribute is not None,(aid,ob.name,'wind lost');wind+=len(attribute.data)
  assert degenerate==0,(aid,'zero-area triangles',degenerate)
  report[aid]={'triangles':tris,'colliders':len(cols),'anchors':len(anchors),'maxColliderErrorMetres':maxerror,'uv':True,'windVertices':wind,'degenerate':degenerate}
  print('[verified]',aid,json.dumps(report[aid]),flush=True)
 out=repo/'docs/world/phase-2-playground/town-craft-20261107/native-verification.json'
 old=json.loads(out.read_text()) if out.exists() else {};old.update(report);out.write_text(json.dumps(old,indent=2)+'\n')
if __name__=='__main__':
 args=sys.argv[sys.argv.index('--')+1:];run(Path(args[0]).resolve(),args[1:])
