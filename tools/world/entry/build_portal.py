"""G28 A stone portal. Run via blender-run.sh park-integration tools/world/entry/build_portal.py.
Modes: build (default), qa (fresh GLB import), render [view names]. No world mounting/UI.
Blender +X front / YZ arch / Z up; exporter alone converts to glTF +Y up / +X front.
"""
import bpy, bmesh, math, json, os, sys, hashlib
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT = os.getcwd()
SOURCE = os.path.join(ROOT, 'tools/world/entry/build_portal.blend')
GLB = os.path.join(ROOT, 'public/assets/world/entry/G28.glb')
DOC = os.path.join(ROOT, 'docs/world/entry')
RAW = '/Users/bobby/Desktop/3D-personal-world/evidence/entry-G28'
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
MODE = ARGS[0] if ARGS else 'build'
CY = 1.88
RY, RZ, IY, IZ = 1.50, 1.88, 1.12, 1.47
START, SPAN, N = math.radians(-58), math.radians(296), 12
MATERIALS = {
 'G28_stone': ('#B4A896', 'stone', .92, 0),
 'G28_stone_base': ('#8C8276', 'stone', .94, 0),
 'G28_light_cyan': ('#4FD1C5', 'light', .75, .12),
}

def put(path, value):
 os.makedirs(os.path.dirname(path), exist_ok=True)
 with open(path, 'w') as f: json.dump(value, f, indent=1)

def lin(h):
 a = [int(h[i:i+2], 16)/255 for i in (1,3,5)]
 return tuple(c/12.92 if c <= .04045 else ((c+.055)/1.055)**2.4 for c in a)+(1,)

def material(name):
 m=bpy.data.materials.get(name)
 if m: return m
 hx, role, rough, emission=MATERIALS[name]
 m=bpy.data.materials.new(name); m.use_nodes=True
 bs=m.node_tree.nodes['Principled BSDF']
 bs.inputs['Base Color'].default_value=lin(hx)
 bs.inputs['Roughness'].default_value=rough
 bs.inputs['Metallic'].default_value=0
 if role=='light':
  bs.inputs['Emission Color'].default_value=lin(hx)
  bs.inputs['Emission Strength'].default_value=emission
 m.diffuse_color=lin(hx);m['materialRole']=role;m['srgbHex']=hx
 m.use_backface_culling=True
 if role=='light': m['duskEmission']=.12;m['nightEmissionRecommended']=1.2
 return m

def empty(name, parent=None):
 o=bpy.data.objects.new(name,None);bpy.context.scene.collection.objects.link(o);o.parent=parent
 return o

def mesh_obj(name, vertices, faces, mat, parent, bevel=0, smooth=False):
 me=bpy.data.meshes.new(name);me.from_pydata(vertices,[],faces);me.update()
 bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
 if bevel:
  edges=[e for e in bm.edges if e.is_manifold and e.calc_face_angle()>.20]
  bmesh.ops.bevel(bm,geom=edges,offset=bevel,segments=2,profile=.5,affect='EDGES',clamp_overlap=True)
  bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
 bm.to_mesh(me);bm.free()
 me.materials.append(material(mat))
 for p in me.polygons:p.use_smooth=smooth
 ob=bpy.data.objects.new(name,me);bpy.context.scene.collection.objects.link(ob);ob.parent=parent
 ob['assetId']='G28';ob['materialRole']=MATERIALS[mat][1]
 if smooth:
  mod=ob.modifiers.new('Broad stone faces with rounded chamfers','WEIGHTED_NORMAL')
  mod.keep_sharp=True;mod.weight=70
 return ob

def arc(name, a, b, r0y, r0z, r1y, r1z, back, front, parent, mat, bevel=0, face=None):
 # Closed curved voussoir: no cap under another continuous protrusion.
 verts=[];faces=[];segments=7
 for j in range(segments+1):
  t=a+(b-a)*j/segments
  y0,z0=r0y*math.cos(t),CY+r0z*math.sin(t);y1,z1=r1y*math.cos(t),CY+r1z*math.sin(t)
  def fx(y,z):return front+(face[0]+face[1]*y+face[2]*(z-CY) if face else 0)
  verts.extend([(fx(y0,z0),y0,z0),
                (fx(y1,z1),y1,z1),
                (back+(fx(y1,z1)-front if mat=='G28_light_cyan' else 0),y1,z1),
                (back+(fx(y0,z0)-front if mat=='G28_light_cyan' else 0),y0,z0)])
 for j in range(segments):
  for k in range(4):faces.append((j*4+k,j*4+(k+1)%4,(j+1)*4+(k+1)%4,(j+1)*4+k))
 faces += [(3,2,1,0),tuple(segments*4+k for k in range(4))]
 return mesh_obj(name,verts,faces,mat,parent,bevel,smooth=(mat!='G28_light_cyan'))

def block(name, y0,y1,z0,z1,x0,x1, inset, parent, side):
 # Each cut stone is a convex, tapered closed block with broad planar faces.
 vertices=[(x0+.035,y0,z0),(x1-.045,y0+.025,z0),(x1,y1-.018,z0),(x0+.018,y1,z0),
           (x0+inset,y0+inset,z1),(x1-inset-.055,y0+inset*.8,z1+.025),
           (x1-inset*.7,y1-inset-.015,z1-.018),(x0+inset+.045,y1-inset*.6,z1)]
 # Triangulate non-planar upper surface explicitly before beveling.
 faces=[(0,3,2,1),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7),(4,5,6),(4,6,7)]
 vertices=[(x,side*y,z) for x,y,z in vertices]
 return mesh_obj(name,vertices,faces,'G28_stone_base',parent,.026,True)

def asset_objects(): return [o for o in bpy.context.scene.objects if o.type=='MESH' and o.name.startswith('G28_')]

def topo(bm):
 bm.normal_update();seen=set();shells=[]
 for f0 in bm.faces:
  if f0 in seen:continue
  stack=[f0];seen.add(f0);vol=0;count=0;o=f0.verts[0].co.copy()
  while stack:
   f=stack.pop();count+=1;v=[x.co-o for x in f.verts]
   for j in range(1,len(v)-1):vol+=v[0].dot(v[j].cross(v[j+1]))/6
   for e in f.edges:
    for g in e.link_faces:
     if g not in seen:seen.add(g);stack.append(g)
  shells.append({'faces':count,'signedVolume':vol})
 return {'nonmanifoldEdges':sum(not e.is_manifold for e in bm.edges),
         'badWindingEdges':sum(e.is_manifold and not e.is_contiguous for e in bm.edges),
         'shells':shells,'negativeShells':sum(s['signedVolume']<=0 for s in shells)}

def qa(objects, label):
 dg=bpy.context.evaluated_depsgraph_get();points=[];rows=[];problems=[];mats={}
 for ob in objects:
  ev=ob.evaluated_get(dg);me=ev.to_mesh();me.calc_loop_triangles()
  coords=[ev.matrix_world@v.co for v in me.vertices];points+=coords
  areas=[(coords[t.vertices[1]]-coords[t.vertices[0]]).cross(coords[t.vertices[2]]-coords[t.vertices[0]]).length/2 for t in me.loop_triangles]
  bm=bmesh.new();bm.from_mesh(me);native=topo(bm)
  bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-5);weld=topo(bm);bm.free()
  cp=me.copy();repair=cp.validate(verbose=False);bpy.data.meshes.remove(cp)
  finite=all(math.isfinite(v) for p in coords for v in p)
  normalBad=sum(not all(math.isfinite(v) for v in n.vector) or abs(n.vector.length-1)>1e-4 for n in me.corner_normals)
  for p in me.polygons:
   m=me.materials[p.material_index];bs=m.node_tree.nodes.get('Principled BSDF')
   row=mats.setdefault(m.name,{'role':m.get('materialRole'),'hex':m.get('srgbHex'),'faces':0,'area':0,
    'baseColor':list(bs.inputs['Base Color'].default_value),'roughness':bs.inputs['Roughness'].default_value,
    'metallic':bs.inputs['Metallic'].default_value,'emissionStrength':bs.inputs['Emission Strength'].default_value,
    'emissionColor':list(bs.inputs['Emission Color'].default_value),
    'effectiveEmissionRGB':[v*bs.inputs['Emission Strength'].default_value for v in bs.inputs['Emission Color'].default_value[:3]]})
   row['faces']+=1;row['area']+=p.area
  row={'name':ob.name,'triangles':len(me.loop_triangles),'vertices':len(me.vertices),'finite':finite,
       'degenerateTriangles':sum(a<1e-12 for a in areas),'minTriangleArea':min(areas),'badNormals':normalBad,
       'copyValidateWouldRepair':repair,'rawTopology':native,'weldedDiagnostic':weld,'weldToleranceM':1e-5,
       'origin':list(ob.matrix_world.translation),'scale':list(ob.scale)}
  rows.append(row)
  if not finite or row['degenerateTriangles'] or repair or normalBad or weld['nonmanifoldEdges'] or weld['badWindingEdges'] or weld['negativeShells']:problems.append(ob.name)
  ev.to_mesh_clear()
 lo=[min(p[i] for p in points) for i in range(3)];hi=[max(p[i] for p in points) for i in range(3)]
 return {'label':label,'triangles':sum(x['triangles'] for x in rows),'meshCount':len(rows),'boundsMin':lo,'boundsMax':hi,
         'dimensionsBlenderXYZ':[hi[i]-lo[i] for i in range(3)],'objects':rows,'materials':mats,'problems':problems,
         'rawTopologyNote':'GLB raw vertices may split at normal seams; retain raw counts and inspect disposable 10um per-object weld, never weld different stones together.'}

def clearance(objects):
 # Cast from opening centre along +/- lateral Y, at 28 body-height samples, three X cross-sections.
 dg=bpy.context.evaluated_depsgraph_get();trees={}
 for o in objects:
  ev=o.evaluated_get(dg);me=ev.to_mesh();me.calc_loop_triangles()
  trees[o.name]=BVHTree.FromPolygons([ev.matrix_world@v.co for v in me.vertices],[tuple(t.vertices) for t in me.loop_triangles],all_triangles=True)
  ev.to_mesh_clear()
 samples=[]
 for x in (-.25,0,.25):
  for z in [0.03+i*.063 for i in range(28)]:
   distances=[]
   for side in (-1,1):
    hits=[t.ray_cast(Vector((x,0,z)),Vector((0,side,0)),5)[3] for t in trees.values()]
    hits=[v for v in hits if v is not None];distances.append(min(hits) if hits else None)
   samples.append({'x':x,'height':z,'left':distances[0],'right':distances[1],
                   'clearWidth':sum(distances) if None not in distances else None})
 vertical=[t.ray_cast(Vector((.05,y,.01)),Vector((0,0,1)),6)[3] for t in trees.values() for y in (-.10,.10)]
 vertical=[v+.01 for v in vertical if v is not None]
 overlaps=[]
 objects=sorted(objects,key=lambda o:o.name)
 for i,a in enumerate(objects):
  for b in objects[i+1:]:
   if not (a.name.startswith('G28_base_') and (b.name.startswith('G28_stone_') or b.name.startswith('G28_base_'))):continue
   pairs=trees[a.name].overlap(trees[b.name])
   if pairs:overlaps.append({'a':a.name,'b':b.name,'triangleOverlapPairs':len(pairs),'relationship':'intentional embedded load-bearing assembly'})
 light_checks=[]
 for ob in objects:
  if not ob.name.startswith('G28_light_'):continue
  target=trees['G28_stone_'+ob.name.rsplit('_',1)[1]];ev=ob.evaluated_get(dg);me=ev.to_mesh();me.calc_loop_triangles();distances=[];misses=0
  for tri in me.loop_triangles:
   if (ev.matrix_world.to_3x3()@tri.normal).normalized().x<.9:continue
   c=sum((ev.matrix_world@me.vertices[i].co for i in tri.vertices),Vector())/3
   hit=target.ray_cast(c+Vector((.0001,0,0)),Vector((-1,0,0)),.05)[3]
   if hit is None:misses+=1
   else:distances.append(hit-.0001)
  light_checks.append({'light':ob.name,'frontTriangleSamples':len(distances)+misses,'misses':misses,
     'minFrontProudM':min(distances) if distances else None,'maxFrontProudM':max(distances) if distances else None})
  ev.to_mesh_clear()
 return {'bodyHeightM':1.7,'bodyDiameterM':.60,'sweptWidthSamples':samples,
  'minBodyHeightClearWidth':min(s['clearWidth'] for s in samples if s['clearWidth'] is not None),
  'centreClearHeight':min(vertical) if vertical else None,'stoneBaseContacts':overlaps,'lightEmbedding':light_checks,
  'limit':'BVH surface-intersection and opening rays cover intended joints/opening; not an exhaustive global self-intersection certificate.'}

def build():
 bpy.ops.wm.read_factory_settings(use_empty=True);sc=bpy.context.scene;sc.unit_settings.system='METRIC';sc.unit_settings.scale_length=1
 root=empty('G28');root['assetId']='G28';root['frontAxis']='+X';root['gltfUpAxis']='+Y';root['origin']='bottom centre';root['status']='asset only; entrance UI semantics unresolved'
 stone=empty('G28_stones',root);base=empty('G28_bases',root);light=empty('G28_lights',root)
 weights=[.98,1.02,.96,1.04,.97,1.03,1.02,.97,1.04,.96,1.02,.99];total=sum(weights);theta=START
 for i,w in enumerate(weights):
  end=theta+SPAN*w/total;gap=0
  variation=.026*math.sin(i*1.71)
  face=(.018*math.sin(i*1.9),.025*math.cos(i*1.7),.020*math.sin(i*2.3))
  ob=arc('G28_stone_%02d'%(i+1),theta+gap,end-gap,IY,IZ,RY+variation,RZ+variation,-.28+variation,.28,stone,'G28_stone',.020,face)
  ob['assembly']='independent closed cut-stone voussoir; abutting radial caps with bevel reveal'
  # Strip lies on front planar stone area, 12mm buried, 0.5mm proud; cannot z-fight.
  gl=arc('G28_light_%02d'%(i+1),theta+.025,end-.025,IY+.05,IZ+.05,IY+.075,IZ+.075,.2685,.2805,light,'G28_light_cyan',face=face)
  gl['stripWidthM']=.025;gl['embeddingDepthM']=.0115
  theta=end
 for side,label in ((-1,'L'),(1,'R')):
  block('G28_base_'+label+'_foot',.60,1.65,0,.30,-.48,.48,.055,base,side)
  block('G28_base_'+label+'_outer',1.08,1.62,.23,.91,-.34,.34,.065,base,side)
  block('G28_base_'+label+'_toe',.62,1.23,.06,.58,-.36,.38,.045,base,side)
 bpy.context.view_layer.update()
 # Correct actual evaluated footprint, not the studio floor, to an exact bottom-centred root.
 pts=[v.co for o in asset_objects() for v in o.data.vertices]
 shift=Vector(((min(v.x for v in pts)+max(v.x for v in pts))/2,(min(v.y for v in pts)+max(v.y for v in pts))/2,min(v.z for v in pts)))
 for o in asset_objects():
  for v in o.data.vertices:v.co-=shift
 bpy.context.view_layer.update()
 native=qa(asset_objects(),'evaluated native after bevel and weighted normals');native['assembly']=clearance(asset_objects())
 root['dimensionsMetres']=json.dumps(native['dimensionsBlenderXYZ']);root['lightMaterial']='G28_light_cyan';root['lightWidthM']=.025
 os.makedirs(os.path.dirname(SOURCE),exist_ok=True);os.makedirs(os.path.dirname(GLB),exist_ok=True)
 bpy.ops.wm.save_as_mainfile(filepath=SOURCE,compress=True)
 props={p.identifier for p in bpy.ops.export_scene.gltf.get_rna_type().properties}
 opts=dict(export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_normals=True,
           export_materials='EXPORT',export_cameras=False,export_lights=False,export_animations=False,
           export_extras=True,export_texcoords=False,export_tangents=False,
           export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=6,
           export_draco_position_quantization=20,export_draco_normal_quantization=12)
 if any(k not in props for k in opts):raise RuntimeError('Exporter unsupported options '+str(set(opts)-props))
 bpy.ops.object.select_all(action='DESELECT')
 for o in [root]+list(root.children_recursive):o.select_set(True)
 bpy.ops.export_scene.gltf(filepath=GLB,**opts)
 bpy.ops.wm.open_mainfile(filepath=SOURCE)
 reopened=qa(asset_objects(),'reopened native BLEND')
 report={'asset':'G28','blenderVersion':bpy.app.version_string,'source':'tools/world/entry/build_portal.blend',
  'glb':'public/assets/world/entry/G28.glb','sha256':hashlib.sha256(open(GLB,'rb').read()).hexdigest(),'bytes':os.path.getsize(GLB),
  'exportOptions':opts,'native':native,'reopenedBlend':reopened,'geometryBaseline':'new L1 asset; image reference has no triangle baseline',
  'axes':'Blender +X front, YZ arch, Z up; glTF +X front, YZ arch, +Y up, exporter converts once',
  'budgetTargetTriangles':[5000,8000],'sourceModifiers':['geometry-applied 2-segment bevel','evaluated weighted normals'],
  'scope':'Asset QA only. No world placement, collider, trigger, UI, runtime lights or interaction approval.'}
 put(os.path.join(DOC,'qa-G28.json'),report)
 print('G28_NATIVE',native['triangles'],native['dimensionsBlenderXYZ'],native['problems'],report['bytes'])
 if native['problems'] or reopened['problems']:raise RuntimeError('Native topology failure')

def fresh():
 bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=GLB)
 imported=qa(asset_objects(),'fresh-process Draco GLB import');imported['assembly']=clearance(asset_objects())
 with open(os.path.join(DOC,'qa-G28.json')) as f:r=json.load(f)
 r['glbReadback']=imported
 r['roundTrip']={'triangleMatch':r['native']['triangles']==imported['triangles'],
  'maxBoundsDeltaM':max(abs(r['native'][key][i]-imported[key][i]) for key in ('boundsMin','boundsMax') for i in range(3)),
  'materialNamesMatch':set(r['native']['materials'])==set(imported['materials']),
  'maxEffectiveEmissionDelta':max(abs(r['native']['materials'][m]['effectiveEmissionRGB'][i]-imported['materials'][m]['effectiveEmissionRGB'][i]) for m in imported['materials'] for i in range(3)),
  'allNodes':sorted(o.name for o in bpy.context.scene.objects),
  'unwantedLights':sum(o.type=='LIGHT' for o in bpy.context.scene.objects),'unwantedCameras':sum(o.type=='CAMERA' for o in bpy.context.scene.objects)}
 put(os.path.join(DOC,'qa-G28.json'),r);print('G28_READBACK',r['roundTrip'],imported['problems'])
 if imported['problems'] or not r['roundTrip']['triangleMatch'] or r['roundTrip']['maxBoundsDeltaM']>1e-4:raise RuntimeError('GLB exchange failure')

VIEWS={'front':(1,0,.02),'three-quarter':(1,-1.35,.65),'rear':(-1,.65,.2),'side':(.03,-1,.12),'top':(.08,-.03,1),
       'near':(1,-.5,.35),'night':(1,-1.35,.5),'clay':(1,-1.35,.65)}

def render():
 bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=GLB)
 sc=bpy.context.scene;sc.render.engine='BLENDER_EEVEE_NEXT';sc.eevee.taa_render_samples=48
 sc.render.resolution_x=1600;sc.render.resolution_y=1200;sc.render.resolution_percentage=100
 sc.render.image_settings.file_format='PNG';sc.view_settings.view_transform='Standard';sc.view_settings.look='Medium High Contrast';sc.view_settings.exposure=0
 world=bpy.data.worlds.new('studio');world.use_nodes=True;sc.world=world
 bg=world.node_tree.nodes['Background'];bg.inputs['Color'].default_value=(.40,.47,.56,1);bg.inputs['Strength'].default_value=.55
 bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.002));floor=bpy.context.object;floor.name='studio_floor'
 fm=bpy.data.materials.new('studio_floor');fm.use_nodes=True;fbs=fm.node_tree.nodes['Principled BSDF'];fbs.inputs['Base Color'].default_value=lin('#9D9C91');fbs.inputs['Roughness'].default_value=.95;floor.data.materials.append(fm)
 for name,energy,color,rotation in [('key',2.6,(1,.82,.62),(math.radians(50),math.radians(5),math.radians(128))),('fill',.6,(.52,.65,.88),(math.radians(35),0,math.radians(-50)))]:
  dat=bpy.data.lights.new(name,'SUN');dat.energy=energy;dat.color=color;dat.angle=math.radians(7)
  ob=bpy.data.objects.new(name,dat);sc.collection.objects.link(ob);ob.rotation_euler=rotation
 camd=bpy.data.cameras.new('studio_camera');camd.type='ORTHO';camd.ortho_scale=5.15;camd.clip_end=300
 cam=bpy.data.objects.new('studio_camera',camd);sc.collection.objects.link(cam);sc.camera=cam
 # Actual guide GLB as a relative-scale studio figure, normalised to 1.7m and excluded from export/QA.
 old=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT,'public/assets/world/guide/G24.glb'));sc.frame_set(0);bpy.context.view_layer.update()
 imported_guide=[o for o in bpy.data.objects if o not in old];dg=bpy.context.evaluated_depsgraph_get();gp=[];guide=[]
 for ob in imported_guide:
  if ob.type=='MESH' and ob.name.startswith('G24_mesh'):
   ev=ob.evaluated_get(dg);me=bpy.data.meshes.new_from_object(ev,depsgraph=dg);me.transform(ev.matrix_world)
   baked=bpy.data.objects.new('studio_G24_baked_pose',me);sc.collection.objects.link(baked);guide.append(baked);gp.extend(v.co for v in me.vertices)
 lo=min(p.z for p in gp);hi=max(p.z for p in gp);scale=1.7/(hi-lo)
 cx=(min(p.x for p in gp)+max(p.x for p in gp))/2;cy=(min(p.y for p in gp)+max(p.y for p in gp))/2
 for ob in guide:
  for v in ob.data.vertices:v.co=Vector(((v.co.x-cx)*scale+.58,(v.co.y-cy)*scale,(v.co.z-lo)*scale))
 for ob in imported_guide:bpy.data.objects.remove(ob,do_unlink=True)
 bpy.context.view_layer.update()
 os.makedirs(RAW,exist_ok=True)
 selected=ARGS[1:] or list(VIEWS)
 for name in selected:
  night=name=='night';clay=name=='clay'
  for ob in guide:ob.hide_render=(name in ('side','top','near','rear','clay'))
  bg.inputs['Color'].default_value=(.045,.065,.12,1) if night else (.40,.47,.56,1);bg.inputs['Strength'].default_value=.20 if night else .55
  bpy.data.lights['key'].energy=.25 if night else 2.6;bpy.data.lights['key'].color=(.50,.61,.86) if night else (1,.82,.62)
  bpy.data.lights['fill'].energy=.10 if night else .6
  for m in bpy.data.materials:
   if m.get('materialRole')=='light' and m.name.startswith('G28_'):
    bs=m.node_tree.nodes['Principled BSDF'];bs.inputs['Emission Color'].default_value=lin('#4FD1C5');bs.inputs['Emission Strength'].default_value=1.2 if night else .12
  if name=='clay':
   cm=bpy.data.materials.new('studio_clay');cm.use_nodes=True;cm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=lin('#A0A0A0');cm.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.9
   for ob in asset_objects():ob.data.materials.clear();ob.data.materials.append(cm)
  sc.view_layers[0].material_override=None
  d=Vector(VIEWS[name]).normalized();center=Vector((0,0,1.82));camd.ortho_scale=6.5
  if name=='near':center=Vector((.05,-.75,2.70));camd.ortho_scale=2.05
  if name=='top':center=Vector((0,0,1.60));camd.ortho_scale=4.65
  cam.location=center+d*10;cam.rotation_euler=(-d).to_track_quat('-Z','Y').to_euler()
  sc.render.filepath=os.path.join(RAW,'G28-'+name+'.png');bpy.ops.render.render(write_still=True)
 put(os.path.join(RAW,'render-manifest.json'),{'glbSha256':hashlib.sha256(open(GLB,'rb').read()).hexdigest(),
  'views':selected,'resolution':[1600,1200],'source':'fresh imported GLB','scaleFigure':'G24 evaluated static pose baked to studio-only geometry, height exactly 1.7m, feet Z=0; bone display helpers excluded',
  'studioOnlyLighting':'two suns + world; no lights exported','nightMaterialEmission':1.2,'duskMaterialEmission':.12})
 print('G28_RENDERED',selected)

if MODE=='build':build()
elif MODE=='qa':fresh()
elif MODE=='render':render()
else:raise RuntimeError('Unknown mode '+MODE)
