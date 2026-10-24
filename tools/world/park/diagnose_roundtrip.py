"""Read-only native/Draco seam diagnosis; retain raw and diagnostic topology independently."""
import os,sys,json,bpy,bmesh
from mathutils import Vector
sys.path.insert(0,os.path.join(os.getcwd(),'tools/world/park'))
from parklib import reset_scene,inspect,write_json
OUT='/Users/bobby/Desktop/3D-personal-world/evidence/park-integration/topology'
os.makedirs(OUT,exist_ok=True)

def welded_edges(ob,tol):
 bm=bmesh.new();bm.from_mesh(ob.data)
 if tol:bmesh.ops.remove_doubles(bm,verts=bm.verts,dist=tol)
 bm.normal_update();edges=[]
 for e in bm.edges:
  if not e.is_manifold:
   edges.append({'endpoints':[[round(v,7) for v in p.co] for p in e.verts],'faces':len(e.link_faces),'length':e.calc_length()})
 deg=sum(f.calc_area()<1e-9 for f in bm.faces)
 bm.free();return {'tolerance':tol,'nonmanifold':len(edges),'degenerate':deg,'edges':edges}

def edge_match_delta(a,b):
 def d(p,q): return (Vector(p)-Vector(q)).length
 return max(min(min(max(d(v['endpoints'][0],u['endpoints'][0]),d(v['endpoints'][1],u['endpoints'][1])),max(d(v['endpoints'][0],u['endpoints'][1]),d(v['endpoints'][1],u['endpoints'][0])))for u in a)for v in b) if a and b else None

report=[]
for aid,node in [('P14','crate'),('P15','body'),('P18','board'),('hut','shell_A'),('hut','shell_B')]:
 bpy.ops.wm.open_mainfile(filepath=os.path.abspath(f'tools/world/park/blend/{aid}.blend'))
 ob=bpy.data.objects[node]
 native={'raw':inspect([ob]),'welds':[welded_edges(ob,t) for t in [1e-7,1e-6,1e-5]]}
 # Quantization displacement in local coordinates, compared to the original authored vertices.
 native_coords=[v.co.copy() for v in ob.data.vertices]
 reset_scene();bpy.ops.import_scene.gltf(filepath=os.path.abspath(f'public/assets/world/park/{aid}.glb'))
 ob=bpy.data.objects[node]
 imported={'raw':inspect([ob]),'welds':[welded_edges(ob,t) for t in [1e-7,1e-6,1e-5]]}
 worst=max(min((v.co-p).length for p in native_coords) for v in ob.data.vertices)
 row={'asset':aid,'node':node,'native':native,'draco':imported,'maxNearestVertexDisplacementM':worst,
     'conclusion':{'nativeUnweldedClosed':native['raw']['objects'][0]['nonmanifold_edges']==0,'nativeSameToleranceReproducesWarning':native['welds'][-1]['nonmanifold']==imported['welds'][-1]['nonmanifold'],'nativeAndImportedDegenerates':[native['welds'][-1]['degenerate'],imported['welds'][-1]['degenerate']], 'scope':'Whole-object diagnostic welding merges intentional touching independent structural shells; retain original warnings and raw authored shell topology.'}}
 row['conclusion']['maxMatchingProblemEdgeEndpointDifferenceM']=edge_match_delta(native['welds'][-1]['edges'],imported['welds'][-1]['edges'])
 row['conclusion']['classification']='touching independent closed structural shells reproduced before export' if row['conclusion']['nativeUnweldedClosed'] and row['conclusion']['nativeSameToleranceReproducesWarning'] and not any(row['conclusion']['nativeAndImportedDegenerates']) else 'requires further diagnosis'
 report.append(row)
 print(aid,node,'native',[(x['tolerance'],x['nonmanifold'])for x in native['welds']],'draco',[(x['tolerance'],x['nonmanifold'])for x in imported['welds']],'displacement',worst)
write_json(OUT+'/native-vs-draco.json',report)
compact=[]
for row in report:
 small={'asset':row['asset'],'node':row['node'],'rawEvidence':OUT+'/native-vs-draco.json','maxNearestVertexDisplacementM':row['maxNearestVertexDisplacementM'],'conclusion':row['conclusion']}
 for key in ['native','draco']:
  small[key]={'raw':row[key]['raw'],'welds':[{**{k:v for k,v in x.items() if k!='edges'},'problemEdgeSample':x['edges'][:4]} for x in row[key]['welds']]}
 compact.append(small)
write_json('docs/world/park/qa-topology-diagnostic.json',compact)
