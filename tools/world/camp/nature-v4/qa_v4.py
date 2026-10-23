"""nature-v4 QA (forked from nature/qa_v2.py): native blend + STAGED Draco GLB round trip.
Open leaf blades are intentional; closed wood/rock/core topology and embedded leaf roots are
checked separately. Baseline N = pre-v4 GLB reimport triangles (baseline_pre_v4/), spec 11.2.
Blender -b --factory-startup -P tools/world/camp/nature-v4/qa_v4.py [-- --glb-dir DIR]
"""
import bpy,bmesh,json,math,os,sys,hashlib,struct
from mathutils import Vector
from mathutils.bvhtree import BVHTree
HERE=os.path.dirname(os.path.abspath(__file__));REPO=os.path.abspath(os.path.join(HERE,'../../../..'))
sys.path.insert(0,HERE)
import vendor_inspect_connectivity as vic
IDS=['G16','G17','G18','G19','G20','G21','G22','G23']
OUT=os.path.join(REPO,'docs/world/quality-v3/nature-v4');os.makedirs(OUT,exist_ok=True)
argv=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
GLB_DIR=argv[argv.index('--glb-dir')+1] if '--glb-dir' in argv else os.path.join(HERE,'staging')
BASE_DIR=os.path.join(HERE,'baseline_pre_v4')
# Declared per asset: ~2N with a +/-30% band (strata/bevels land in steps). Not a skill hard cap.
BASE_N={'G16':4288,'G17':3190,'G18':3860,'G19':990,'G20':1744,'G21':244,'G22':222,'G23':162}
BUDGET={k:round(2*v*1.3) for k,v in BASE_N.items()}
def meshes():return [o for o in bpy.context.scene.objects if o.type=='MESH']
def bounds(objs):
 pts=[o.matrix_world@v.co for o in objs for v in o.data.vertices]
 return [[min(p[k] for p in pts) for k in range(3)],[max(p[k] for p in pts) for k in range(3)]]
def blade_contact(ob):
 me=ob.data;me.calc_loop_triangles();bm=bmesh.new();bm.from_mesh(me);bm.verts.ensure_lookup_table();bm.verts.index_update()
 groups=[];seen=set()
 for v in bm.verts:
  if v.index in seen:continue
  stack=[v];verts=[]
  while stack:
   w=stack.pop()
   if w.index in seen:continue
   seen.add(w.index);verts.append(w);stack.extend(e.other_vert(w) for e in w.link_edges)
  groups.append(verts)
 co=[o.co.copy() for o in me.vertices];attr=me.color_attributes.get('_WIND') or me.attributes.get('_WIND')
 solids=[];leaves=[]
 for g in groups:
  ids={v.index for v in g};faces=[list(t.vertices) for t in me.loop_triangles if t.vertices[0] in ids]
  closed=all(e.is_manifold for v in g for e in v.link_edges)
  if closed:solids.append(BVHTree.FromPolygons(co,faces,all_triangles=True))
  else:
   weights=lambda i:attr.data[i].color[2] if attr else 0
   root=min(ids,key=weights);leaves.append(root)
 distances=[];outside=[]
 for i in leaves:
  p=co[i];signed=[]
  for tree in solids:
   q,n,_,d=tree.find_nearest(p)
   if q is not None:signed.append((p-q).dot(n))
  value=min(signed) if signed else 1e9;distances.append(value)
  if value>0.002:outside.append({'vertex':i,'outside_m':value,'point':list(p)})
 bm.free()
 return {'leafComponents':len(leaves),'closedCores':len(solids),'rootsOutsideCore':len(outside),'maxRootOutside_m':max(distances,default=0),'outside':outside,'method':'Nearest oriented surface signed distance against each closed core; geometric contact diagnostic, not a general self-intersection proof.'}
report={};manifest={}
for aid in IDS:
 blend=os.path.join(HERE,'blend',aid+'.blend');glb=os.path.join(GLB_DIR,aid+'.glb')
 bpy.ops.wm.open_mainfile(filepath=blend);obs=meshes();native=vic.inspect_objects(obs);nb=bounds(obs)
 roots=[o for o in bpy.context.scene.objects if o.parent is None];meta={k:roots[0][k] for k in roots[0].keys() if not k.startswith('_')}
 proportion=None
 if aid in ('G16','G17','G18'):
  wood=next(o for o in obs if o.name=='trunk');crown=next(o for o in obs if o.name=='crown')
  cb=bounds([crown]);base=[wood.matrix_world@v.co for v in wood.data.vertices if (wood.matrix_world@v.co).z<.5]
  diameter=max(max(p[k]for p in base)-min(p[k]for p in base)for k in (0,1));width=max(cb[1][k]-cb[0][k]for k in (0,1))
  proportion={'baseDiameter_m':diameter,'crownBroadWidth_m':width,'ratio':diameter/width,'method':'Maximum horizontal base diameter below 0.5 m, including root flare; broad crown width in the native horizontal plane.'}
 contacts={o.name:blade_contact(o) for o in obs if o.name=='crown'}
 wind={o.name:{'present':bool(o.data.color_attributes.get('_WIND')),'vertices':len(o.data.vertices)} for o in obs}
 bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=glb);obs=meshes();imp=vic.inspect_objects(obs);ib=bounds(obs)
 data=open(glb,'rb').read();j=json.loads(data[20:20+struct.unpack_from('<I',data,12)[0]])
 maxdiff=max(abs(a-b) for ar,br in zip(nb,ib) for a,b in zip(ar,br))
 hard=[r for r in native['objects'] if r['name']!='crown']
 checks={'finite':all(r['finite_coordinates'] for r in native['objects']+imp['objects']),
  'noNativeRepair':not any(r['mesh_validate_would_repair'] for r in native['objects']),
  'noDegenerate':not any(r['zero_or_near_zero_area_triangles'] for r in native['objects']),
  'noDuplicateTriangles':not any(r['duplicate_triangle_index_sets'] for r in native['objects']),
  'hardPartsClosedManifold':all(r['boundary_edges']==0 and r['nonmanifold_edges']==0 and r['inconsistent_winding_edges']==0 for r in hard),
  'trunkCrownRatio':proportion is None or proportion['ratio']<=1/6,
  'treeWoodConnected':all(r['vertex_edge_components']==1 for r in hard if r['name']=='trunk'),
  'leafRootsEmbedded':all(r['rootsOutsideCore']==0 for r in contacts.values()),
  'roundtripTriangles':native['triangles']==imp['triangles'],'roundtripBounds':maxdiff<1e-4,
  'grounded':abs(nb[0][2])<1e-5 and abs(ib[0][2])<1e-4,
  'centered':max(abs(nb[0][0]+nb[1][0]),abs(nb[0][1]+nb[1][1]))<1e-4,
  'withinDeclaredBudget':native['triangles']<=BUDGET[aid],
  'nearTwoN':0.85<=native['triangles']/(2*BASE_N[aid])<=1.3,
  'noStudio':not j.get('cameras') and not j.get('images') and not j.get('animations'),
  'windSurvives':all('_WIND' in p['attributes'] for m in j['meshes'] for p in m['primitives']) if aid<'G21' else True}
 report[aid]={'checks':checks,'native':native,'imported':imp,'proportion':proportion,'nativeBounds':nb,'importedBounds':ib,'contact':contacts,'wind':wind,'metadata':meta,
 'notes':'Leaf blades deliberately have open boundaries. Raw imported seam splits retained; no post-import weld of deliverable.'}
 old=BASE_N[aid]
 bdata=open(os.path.join(BASE_DIR,aid+'.glb'),'rb').read()
 manifest[aid]={'baselineGLB':os.path.relpath(os.path.join(BASE_DIR,aid+'.glb'),REPO),'baselineSha256':hashlib.sha256(bdata).hexdigest(),'baselineGlbBytes':len(bdata),'targetTwoN':2*old,
 'glb':os.path.relpath(glb,REPO),'blend':os.path.relpath(blend,REPO),'sha256':hashlib.sha256(data).hexdigest(),'glbBytes':len(data),
 'trianglesEvaluated':native['triangles'],'trianglesGLBReimport':imp['triangles'],'declaredBudget':BUDGET[aid],'baselineTriangles':old,'multiplier':round(native['triangles']/old,3),
 'sizeGLB_xyz_m':[ib[1][0]-ib[0][0],ib[1][2]-ib[0][2],ib[1][1]-ib[0][1]],'roundtripBoundsMaxDiff_m':maxdiff,'leafCount':meta.get('leafCount',0),
 'drawCallsPrimitives':sum(len(m['primitives']) for m in j['meshes']),'machineChecksAllTrue':all(checks.values()),'failed':[k for k,v in checks.items() if not v]}
 print('QA',aid,manifest[aid]['trianglesEvaluated'],manifest[aid]['failed'],flush=True)
json.dump(report,open(os.path.join(OUT,'qa_report.json'),'w'),indent=1,default=str)
json.dump({'blender':bpy.app.version_string,'glbDir':os.path.relpath(GLB_DIR,REPO),'baselineRule':'N = pre-v4 published GLB reimport triangles; target ~2N (quality-v3 spec 11.2)','assets':manifest},open(os.path.join(OUT,'manifest.json'),'w'),indent=1)
