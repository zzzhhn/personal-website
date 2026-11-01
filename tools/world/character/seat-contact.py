"""Check actual recorded rigid boots against the actual C06/P16 GLB surfaces; no proxy boxes.
Usage: blender-run.sh character-close tools/world/character/seat-contact.py RUNDIR LABEL OUT.json
Finite recorded SitIdle frames; triangle surface crossing only, not a continuous collision proof.
"""
import bpy, json, sys, math, ast
import numpy as np
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
args=sys.argv[sys.argv.index('--')+1:];folder=Path(args[0]);label=args[1];out=Path(args[2])
here=Path(__file__).resolve().parent
module=ast.parse((here/'runtime-a6.py').read_text())
exec(compile(ast.Module(body=[n for n in module.body if isinstance(n,ast.FunctionDef) and n.name in ('matrix','deform')],type_ignores=[]),'runtime-a6.py','exec'))
data=json.loads((folder/'runtime-skin.json').read_text());view=next(v for v in data['views'] if v['label']==label);topo=view['skinTopology']
report=json.loads((folder/'report.json').read_text());seat=next(c for c in report['cases'] if c['label']==label)['seat'];yaw=seat['yaw']
repo=here.parents[2];asset=repo/('public/assets/world/camp/C06.glb' if label=='C06' else 'public/assets/world/park/P16.glb')
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(asset))
if label=='P16':
 theta=yaw-math.pi/2;local_seat=np.array([0,.43,.75])
else:
 theta=-math.pi/4-math.pi;local_seat=np.array([0,.6,-1])
R=np.array([[math.cos(theta),0,math.sin(theta)],[0,1,0],[-math.sin(theta),0,math.cos(theta)]])
origin=np.array(seat['position'])-R@local_seat
verts=[];tris=[]
for o in bpy.context.scene.objects:
 if o.type!='MESH':continue
 o.data.calc_loop_triangles();offset=len(verts)
 for v in o.data.vertices:
  p=o.matrix_world@v.co;p=np.array([p.x,p.z,-p.y]);verts.append(Vector(R@p+origin))
 tris += [tuple(offset+i for i in t.vertices) for t in o.data.loop_triangles]
furniture=BVHTree.FromPolygons(verts,tris,all_triangles=True)
boottris=[];offset=0
for mesh in topo['meshes']:
 ids=np.array(mesh['skinIndex']).reshape(-1,4);ws=np.array(mesh['skinWeight']).reshape(-1,4);bones=mesh['bones']
 foot=np.array([sum(w for i,w in zip(ii,ww) if bones[i].startswith('foot'))>.98 for ii,ww in zip(ids,ws)])
 boottris += [tuple(int(i)+offset for i in t) for t in np.array(mesh['indices']).reshape(-1,3) if all(foot[t])]
 offset += len(ids)
rows=[]
for f in view['samples']:
 if f['anim']!='SitIdle':continue
 pts=deform(topo,f['skin']);W=matrix(f['skin']['guideToWorld']);pts=np.einsum('ij,nj->ni',W,np.c_[pts,np.ones(len(pts))])[:,:3]
 assert np.isfinite(pts).all(), 'Nonfinite world skin coordinates'
 if len(args)>3: pts += np.array([math.cos(yaw),0,-math.sin(yaw)])*float(args[3])
 tree=BVHTree.FromPolygons([Vector(p)for p in pts],boottris,all_triangles=True)
 rows.append({'t':f['t'],'crossingPairs':len(tree.overlap(furniture))})
res={'asset':str(asset),'label':label,'seat':seat,'samples':len(rows),'bootTriangles':len(boottris),'proposedForwardOffset_m':float(args[3])if len(args)>3 else 0,'maxBootFurnitureSurfaceCrossingPairs':max((r['crossingPairs']for r in rows),default=None),'failedSamples':sum(r['crossingPairs']>0 for r in rows),'method':__doc__,'rows':rows}
out.write_text(json.dumps(res,indent=1));print(json.dumps({k:v for k,v in res.items()if k!='rows'}))
