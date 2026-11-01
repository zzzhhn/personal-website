"""Three existing camp families, meters, native Z-up / exported Y-up once.
No physics meshes are authored here. One GLB retains shared material/image identity.
"""
import bpy, bmesh, math, json, hashlib, sys
from pathlib import Path
from mathutils import Vector
import numpy as np

HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE))
REPO=HERE.parents[2]
OUT=REPO/'docs/world/phase-2-playground/camp-props-craft-20261101'
PUBLIC=REPO/'public/assets/world/camp/craft'
CAMERAS={'C05':((4,-5,4),(0,0,.2),4.2),'C06':((3,-5,3),(0,0,.3),5.9),'C07':((3,-4,2.8),(-.1,0,.4),2.6)}
LIGHTS=[('Key',(1,-4,7),1150,5),('Fill',(-5,-1,4),700,4),('Rim',(3,4,6),950,3)]
PHOTO=Path('/Users/a22309/Desktop/Side-projects/Artifacts/personal-world-phase2-integration/docs/world/phase-2-playground/djc-quality-pilot-20261101/textures')
sys.path.insert(0,'/Users/a22309/.codex/skills/blender-material-craft/scripts')
from craft_geometry import box as craft_box, beam as craft_beam
REFINE_C05='--c05-refine' in sys.argv
RENDER_FAMILIES={'C05'} if '--c05-only' in sys.argv else {'C05','C06','C07'}

def lin(v):return v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4
def rgb(h):return tuple(lin(int(h[k:k+2],16)/255) for k in (0,2,4))
def collection(name):
 c=bpy.data.collections.new(name);bpy.context.scene.collection.children.link(c);return c
def put(o,c):
 for old in list(o.users_collection):old.objects.unlink(o)
 c.objects.link(o);return o
def mesh(name,v,f,m,c):
 me=bpy.data.meshes.new(name);me.from_pydata(v,[],f);me.update()
 bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free()
 o=bpy.data.objects.new(name,me);c.objects.link(o)
 if m:me.materials.append(m)
 return o
def uv(o,axes=(0,1),tile=1.6):
 l=o.data.uv_layers.active or o.data.uv_layers.new(name='UVMap')
 for p in o.data.polygons:
  # Piece-local projection: the longest fabrication direction remains V.
  a,b=axes
  if abs(p.normal[a])>.85:a=next(k for k in range(3) if k not in (a,b))
  elif abs(p.normal[b])>.85:b=next(k for k in range(3) if k not in (a,b))
  for li in p.loop_indices:
   co=o.data.vertices[o.data.loops[li].vertex_index].co;l.data[li].uv=(co[a]/tile+.19,co[b]/tile+.37)
def box(name,center,size,m,c,bevel=.004,axes=(0,1)):
 o=put(craft_box(name,center,size,m,bevel,segments=2),c);uv(o,axes);return o
def beam(name,a,b,w,d,m,c,bevel=.003):
 o=put(craft_beam(name,a,b,w,d,m,bevel),c);uv(o,(0,2));return o
def tube(name,a,b,r,m,c,n=12,r2=None):
 a,b=Vector(a),Vector(b);axis=(b-a).normalized();ref=Vector((0,0,1)) if abs(axis.z)<.9 else Vector((0,1,0));u=axis.cross(ref).normalized();w=axis.cross(u);v=[]
 for p,rr in [(a,r),(b,r if r2 is None else r2)]:v.extend(p+(u*math.cos(k*math.tau/n)+w*math.sin(k*math.tau/n))*rr for k in range(n))
 f=[tuple(reversed(range(n))),tuple(n+k for k in range(n))]+[(k,(k+1)%n,(k+1)%n+n,k+n) for k in range(n)]
 o=mesh(name,v,f,m,c);uv(o,(0,2));return o
def material(name,h,rough=.8,metal=0):
 m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*rgb(h),1);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal;m.diffuse_color=(*rgb(h),1);return m
def image(name,values,data=False):
 h,w=values.shape[:2];im=bpy.data.images.new(name,width=w,height=h,alpha=True)
 if data:im.colorspace_settings.name='Non-Color'
 rgba=np.ones((h,w,4),np.float32);rgba[:,:,:3]=values;im.pixels.foreach_set(rgba.ravel());im.pack();return im
def connect(m,im,socket):
 n=m.node_tree.nodes.new('ShaderNodeTexImage');n.image=im;p=m.node_tree.nodes.get('Principled BSDF');m.node_tree.links.new(n.outputs['Color'],p.inputs[socket])
def normal(m,im,strength=.3):
 n=m.node_tree.nodes.new('ShaderNodeTexImage');n.image=im;q=m.node_tree.nodes.new('ShaderNodeNormalMap');q.inputs['Strength'].default_value=strength;m.node_tree.links.new(n.outputs['Color'],q.inputs['Color']);m.node_tree.links.new(q.outputs['Normal'],m.node_tree.nodes.get('Principled BSDF').inputs['Normal'])
def authored(m,name,base,pattern,height=.06,contrast=.06):
 values=np.array(rgb(base))[None,None,:]*(1-contrast+contrast*pattern[:,:,None]);connect(m,image(name+' color 512',values),'Base Color')
 gy,gx=np.gradient(pattern);n=np.dstack((-gx*height*512,-gy*height*512,np.ones_like(pattern)));n/=np.linalg.norm(n,axis=2)[:,:,None];normal(m,image(name+' normal 512',n*.5+.5,True),.28)
def palette():
 M={};sources=[]
 M['wood']=material('Camp cut timber | shared photographed grain','ffffff',.71)
 for fn,space,socket in [('wood_diff.jpg','sRGB','Base Color'),('wood_nor_gl.jpg','Non-Color',None)]:
  p=PHOTO/fn;im=bpy.data.images.load(str(p));im.colorspace_settings.name=space;im.scale(1024,1024);im.pack()
  if socket:connect(M['wood'],im,socket)
  else:normal(M['wood'],im,.23)
  sources.append(dict(file=str(p),sha256=hashlib.sha256(p.read_bytes()).hexdigest(),asset='https://polyhaven.com/a/wood_table_001',license='CC0',license_url='https://polyhaven.com/license',derivative='1024px, no second base-color tint'))
 y,x=np.mgrid[:512,:512]/512
 M['bark']=material('Camp ridged bark | authored longitudinal response','ffffff',.94)
 bark=.5+.24*np.sin(x*math.tau*17+.35*np.sin(y*math.tau*3))+.13*np.sin(x*math.tau*53+y*math.tau*2)+.08*np.sin(x*math.tau*91-y*math.tau*5)
 authored(M['bark'],'Authored bark','66503a',bark,.004)
 M['end']=material('Camp exposed end grain | authored cut rings','ffffff',.8)
 radius=np.sqrt((x-.48)**2+(y-.51)**2);rings=.5+.35*np.sin(radius*math.tau*33+.3*np.sin(np.arctan2(y-.51,x-.48)*5))
 authored(M['end'],'Authored endgrain','b58c58',rings,.001,contrast=.22)
 M['stone']=material('Camp sandstone | authored low contrast mineral','ffffff',.89)
 mineral=.5+.16*np.sin(x*math.tau*3+y*5)+.12*np.sin(y*math.tau*7-x*13)+.1*np.sin(x*81+y*93)
 authored(M['stone'],'Authored stone','92877a',mineral,.001)
 M['ash']=material('Camp ash and charred firewood','3d3832',.98)
 M['metal']=material('Camp forged drawer pull and pin','43423b',.5,.65)
 sources.append(dict(source='Deterministically authored by build.py',license='original task output',usage='512px bark, endgrain and stone maps, not scans; bark U wraps log circumference and V follows length'))
 (OUT/'texture-sources.json').write_text(json.dumps(sources,indent=2));return M

def log_profile(radius,cut,sides=16,phase=math.pi/16):
 raw=[(radius*math.cos(phase+k*math.tau/sides),radius*math.sin(phase+k*math.tau/sides)) for k in range(sides)];out=[]
 for p,q in zip(raw,raw[1:]+raw[:1]):
  if p[1]<=cut:out.append(p)
  if (p[1]-cut)*(q[1]-cut)<0:
   t=(cut-p[1])/(q[1]-p[1]);out.append((p[0]+t*(q[0]-p[0]),cut))
 return out
def bench(c,M):
 sec=log_profile(.3,.15);count=len(sec);v=[];stations=[(-2.4,.95),(-2.36,.96),(-1.7,.99),(-.8,1),(.2,.995),(.96,.98),(1.7,.96),(2.36,.935),(2.4,.93)]
 for y,scale in stations:
  for x,z in sec:v.append((x*scale,y,.6 if abs(z-.15)<1e-7 else .6-(.15-z)*scale))
 faces=[];tops=[]
 for j in range(len(stations)-1):
  for k in range(count):
   faces.append((j*count+k,j*count+(k+1)%count,(j+1)*count+(k+1)%count,(j+1)*count+k));tops.append(abs(sec[k][1]-.15)<1e-7 and abs(sec[(k+1)%count][1]-.15)<1e-7)
 faces.extend([tuple(reversed(range(count))),tuple((len(stations)-1)*count+k for k in range(count))]);tops.extend([False,False])
 o=mesh('C06 split log | flat continuous 600mm seat contact',v,faces,M['bark'],c);o.data.materials.append(M['wood']);o.data.materials.append(M['end']);l=o.data.uv_layers.new(name='UVMap')
 for i,p in enumerate(o.data.polygons):
  end=i>=len(faces)-2;p.material_index=2 if end else (1 if tops[i] else 0)
  for li in p.loop_indices:
   co=o.data.vertices[o.data.loops[li].vertex_index].co
   l.data[li].uv=(co.x/.62+.5,(co.z-.15)/.62+.5) if end else (co.x/1.6+.24,co.y/1.6+.35) if tops[i] else (math.atan2(co.z-.45,co.x)/math.tau+.5,co.y/1.6+.35)
 # Flat-bottom saddle logs. Their upper halves penetrate the seat, explaining support.
 for y in (-1.7,1.7):
  ss=[(x,-z) for x,z in reversed(log_profile(.2,.05,14,math.pi/14))];vv=[(x,y+yy,.05+zz) for x in (-.38,.38) for yy,zz in ss];n=len(ss)
  ff=[tuple(reversed(range(n))),tuple(n+k for k in range(n))]+[(k,(k+1)%n,(k+1)%n+n,k+n) for k in range(n)]
  o=mesh('C06 saddle %.1f | flattened ground and bedded seat'%y,vv,ff,M['bark'],c);o.data.materials.append(M['end']);uv(o,(1,0),.8)
  for p in o.data.polygons[:2]:p.material_index=1
 # Embedded branch knot, cut end, and bark fissures below the sitting plane.
 tube('C06 branch knot',(0.20,.70,.43),(.325,.77,.47),.052,M['bark'],c,10,r2=.043)
 for k in range(7):
  theta=(k/6)*math.pi+math.pi;pts=[]
  for j in range(8):
   y=-2.2+j*.62;rr=.294-.008*(abs(y)/2.4);pts.append((math.cos(theta)*rr,y,.45+math.sin(theta)*rr))
  for a,b in zip(pts,pts[1:]):tube('C06 recessed longitudinal bark ridge %02d'%k,a,b,.003,M['bark'],c,5)

def firepit(c,M):
 heights=[.4,.35,.39,.415,.365,.38,.41,.355,.395,.37,.405,.36]
 for k,h in enumerate(heights):
  a0=k*math.tau/12+.02793;a1=(k+1)*math.tau/12-.02793
  # Five circumferential stations and ten radial shoulders produce real chipped
  # corner facets. The crown is thick stone, not a second painted ring on a box.
  profile=[(1.12,0),(1.575,0),(1.6,.027),(1.6,h-.092),(1.565,h-.043),(1.51,h),(1.235,h),(1.195,h-.012),(1.135,h-.057),(1.12,.027)]
  angles=[a0,a0+.018,(a0+a1)/2,a1-.014,a1];v=[]
  for j,a in enumerate(angles):
   for i,(r,z) in enumerate(profile):
    rr=r-(.014+.003*(k%3) if j==2 and i in (3,4,5) else 0)
    zz=max(0,z-(.012 if j in (0,4) and z>h-.1 else 0))
    v.append((rr*math.cos(a),rr*math.sin(a),zz))
  n=len(profile);f=[tuple(reversed(range(n))),tuple((len(angles)-1)*n+i for i in range(n))]
  for j in range(len(angles)-1):
   for i in range(n):f.append((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i))
  o=mesh('C05 dressed stone %02d | open dry laid joint'%(k+1),v,f,M['stone'],c)
  if M.get('c05_photo'):
   from c05_surface import stone_uv
   stone_uv(o,k)
  else:uv(o,(0,1),.7)
 tube('C05 ash bed | under stone inner lip',(0,0,0),(0,0,.045),1.14,M['ash'],c,32)
 for k in range(5):
  a=k*math.tau/5+.3;d=Vector((math.cos(a),math.sin(a),0));outer=d*.74+Vector((0,0,.135));inner=d*.15+Vector((0,0,.5));o=tube('C05 charred radial log %02d | flame core kept open'%k,outer,inner,.085,M.get('char',M['ash']),c,11)
  if M.get('c05_photo'):
   from c05_surface import log_uv
   log_uv(o,outer,inner,.085,k)
  # A few broken charcoal facets remain below the existing flame base envelope.
  tip=outer+(inner-outer)*.08;tube('C05 charred cut end %02d'%k,outer,tip,.084,M['end'],c,11,r2=.082)
 for k,a in enumerate((.95,2.2)):
  d=Vector((math.cos(a),math.sin(a),0));tube('C05 dry kindling %d'%k,d*.6+Vector((0,0,.08)),d*.22+Vector((0,0,.16)),.035,M['bark'],c,7)

def desk(c,M):
 # Final original GLB has recenter offsets +.00201184 X,+.00204477 Z.
 dx,dz=.00201184,.00204477;top=.8520448207855225
 def B(name,p,s,key='wood',r=.004):return box('C07 '+name,(p[0]+dx,p[1],p[2]+dz),s,M[key],c,r)
 # Actual tabletop becomes four constructed boards; unobstructed landing rectangle stays fixed.
 for i in range(4):
  o=B('top board %d | long grain and exposed cut edge'%(i+1),(-.25-.3+i*.2,0,top-.038-dz),(.198,2,.076),r=.006);o.data.materials.append(M['end'])
  for p in o.data.polygons:
   if abs(p.normal.y)>.9:p.material_index=1
 for x in (-.53,.03):
  for y in (-.87,.87):
   beam('C07 tapered leg | mortised apron',(x+dx,y,.00204477),(x+dx,y,top-.06),.08,.08,M['wood'],c,.005)
 for x in (-.54,.04):B('long apron with inset shoulder',(x,0,.721),( .035,1.74,.13))
 for y in (-.87,.87):B('end apron meets legs',(-.25,y,.721),(.56,.035,.13))
 for y in (-.87,.87):B('lower cross stretcher',(-.25,y,.152),(.56,.047,.055))
 B('long H stretcher',(-.25,0,.152),(.047,1.74,.05))
 B('drawer dark recessed reveal',(.059,0,.721),(.018,.85,.112),'bark',.002)
 B('drawer panel within reveal',(.073,0,.721),(.025,.80,.090),r=.003)
 for y in (-.24,.24):B('drawer forged pull stand off',(.103,y,.721),(.047,.018,.018),'metal',.003)
 B('drawer forged pull grip',(.126,0,.721),(.018,.48,.019),'metal',.004)
 # Pegs are placed at apron/leg joints, perpendicular to the actual visible substrate.
 for y in (-.87,.87):
  for z in (.695,.747):tube('C07 end grain tenon peg',(.053+dx,y,z+dz),(.064+dx,y,z+dz),.011,M['end'],c,10)
 # Stool top and splayed legs preserve original working-side footprint.
 sx,sy=.49201184,.3;seat=.62204482
 tube('C07 stool round seat | substantial 60mm cut slab',(sx,sy,seat-.06),(sx,sy,seat),.155,M['wood'],c,24)
 points=[]
 for k in range(3):
  a=math.pi/2+k*math.tau/3;upper=(sx+.085*math.cos(a),sy+.085*math.sin(a),seat-.05);foot=(sx+.13*math.cos(a),sy+.13*math.sin(a),.00204477)
  tube('C07 stool splayed leg %d | embedded socket'%k,foot,upper,.03,M['wood'],c,10,r2=.033);t=.16/(seat-.05);r=.13+(.085-.13)*t;points.append((sx+r*math.cos(a),sy+r*math.sin(a),.16204477))
 for k in range(3):tube('C07 stool low rung %d'%k,points[k],points[(k+1)%3],.015,M['wood'],c,10)

def stats(objects,closed=False):
 bpy.context.view_layer.update()
 lo=Vector((math.inf,)*3);hi=-lo;tri=0;bad=0;nonfinite=0;boundary=0
 for o in objects:
  if o.type!='MESH':continue
  evaluated=o.evaluated_get(bpy.context.evaluated_depsgraph_get());me=evaluated.to_mesh();me.calc_loop_triangles();tri+=len(me.loop_triangles)
  for v in me.vertices:
   p=o.matrix_world@v.co
   nonfinite+=sum(not math.isfinite(k) for k in (*p,*v.normal))
   for k in range(3):lo[k]=min(lo[k],p[k]);hi[k]=max(hi[k],p[k])
  for t in me.loop_triangles:
   a,b,c=[me.vertices[i].co for i in t.vertices]
   if (b-a).cross(c-a).length<1e-12:bad+=1
  if closed:
   bm=bmesh.new();bm.from_mesh(me);boundary+=sum(not e.is_manifold for e in bm.edges);bm.free()
  evaluated.to_mesh_clear()
 assert nonfinite==0 and bad==0,'Nonfinite or degenerate authored geometry'
 if closed:assert boundary==0,'Native closed volume has a nonmanifold edge'
 return dict(triangles=tri,bounds_zup=[list(lo),list(hi)],degenerate=bad,nonfinite=nonfinite,native_nonmanifold_edges=boundary if closed else 'not applicable: material batches may have open boundaries',parts=len(objects))
def presentation():
 sc=bpy.context.scene;sc.render.engine='CYCLES';sc.cycles.samples=20;sc.cycles.use_denoising=True;sc.render.resolution_x=1000;sc.render.resolution_y=760;sc.render.resolution_percentage=100;sc.view_settings.view_transform='AgX';sc.view_settings.look='AgX - Medium High Contrast';sc.view_settings.exposure=0;sc.world.color=(.18,.18,.18)
 c=collection('PRESENTATION | excluded from export')
 for name,p,power,size in LIGHTS:
  d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;o=bpy.data.objects.new(name,d);c.objects.link(o);o.location=p;o.rotation_euler=(-o.location).to_track_quat('-Z','Y').to_euler()
 d=bpy.data.cameras.new('Matched 60mm equivalent camera');o=bpy.data.objects.new('Matched camera',d);c.objects.link(o);d.type='ORTHO';sc.camera=o
 floor=box('PRESENTATION contact floor',(0,0,-.016),(200,200,.02),material('Presentation warm gray','b5afa2',.95),c,.001)
 return sc,o
def render(sc,camera,family,kind,objects):
 if family not in RENDER_FAMILIES:return
 if '--fresh-only' in sys.argv and kind!='fresh-glb':return
 for o in bpy.data.objects:
  if o.type=='MESH':o.hide_render=o not in objects and o.name!='PRESENTATION contact floor'
 p,t,scale=CAMERAS[family];camera.location=p;camera.rotation_euler=(Vector(t)-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=scale
 suffix='-r2' if REFINE_C05 and family=='C05' else ''
 sc.render.filepath=str(OUT/(family+suffix+'-'+kind+'.png'));bpy.ops.render.render(write_still=True)
def main():
 OUT.mkdir(parents=True,exist_ok=True);PUBLIC.mkdir(parents=True,exist_ok=True);bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
 M=palette();C05M=M
 if REFINE_C05:
  from c05_surface import refine_materials
  C05M=refine_materials(M,sys.modules[__name__])
 families={};report={};baseline={}
 for id,fn in [('C05',firepit),('C06',bench),('C07',desk)]:
  c=collection('ASSET '+id+' | named editable construction');fn(c,C05M if id=='C05' else M);families[id]=list(c.objects);report[id]=stats(families[id],closed=True)
 # Capture actual current frozen original GLBs without reconstruction.
 for id in families:
  p=REPO/'public/assets/world/camp'/f'{id}.glb';before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(p));objects=[o for o in bpy.data.objects if o not in before];c=collection('BASELINE '+id+' | exact original GLB')
  for o in objects:put(o,c)
  baseline[id]=[o for o in objects if o.type=='MESH'];report[id]['baseline_sha256']=hashlib.sha256(p.read_bytes()).hexdigest()
  for o in objects:o.hide_render=True;o.hide_set(True)
 sc,camera=presentation();bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'camp-props-editable.blend'))
 for id,objects in families.items():
  if not REFINE_C05:render(sc,camera,id,'before',baseline[id])
  render(sc,camera,id,'after-native',objects)
 # Evaluated copies merged per material retain source native parts and UVs.
 export=[]
 for id,objects in families.items():
  c=collection('RUNTIME '+id+' | material batches');root=bpy.data.objects.new(id+'-CRAFT',None);c.objects.link(root);root['family']=id;export.append(root);by={}
  for o in objects:
   copy=o.copy();copy.data=o.data.copy();c.objects.link(copy);bpy.context.view_layer.objects.active=copy;copy.select_set(True)
   for mod in list(copy.modifiers):bpy.ops.object.modifier_apply(modifier=mod.name)
   # Multiple materials on the split log need separation before batching.
   bpy.ops.object.select_all(action='DESELECT');copy.select_set(True);bpy.context.view_layer.objects.active=copy
   bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.separate(type='MATERIAL');bpy.ops.object.mode_set(mode='OBJECT')
   for part in list(bpy.context.selected_objects):
    bpy.context.view_layer.objects.active=part;bpy.ops.object.material_slot_remove_unused();by.setdefault(part.data.materials[0],[]).append(part)
  for mat,parts in by.items():
   bpy.ops.object.select_all(action='DESELECT')
   for o in parts:o.select_set(True)
   bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();o=bpy.context.object;o.name=id+' batch '+mat.name;o.parent=root;export.append(o)
  # Root must be predictable and cannot collide with original GLB root names.
  for o in bpy.data.objects:
   if o.name==id:o.name='BASELINE '+id
  root.name=id
 bpy.ops.object.select_all(action='DESELECT')
 for o in export:o.hide_set(False);o.select_set(True)
 path=PUBLIC/'camp-props-v1.glb';bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_extras=True,export_animations=False,export_cameras=False,export_lights=False)
 before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(path));fresh=[o for o in bpy.data.objects if o not in before];clay=material('Roundtrip neutral clay','b3aaa0',.75)
 for id in families:
  root=next(o for o in fresh if o.get('family')==id);objects=[o for o in root.children_recursive if o.type=='MESH'];report[id]['roundtrip']=stats(objects)
  assert report[id]['roundtrip']['triangles']==report[id]['triangles'],'Roundtrip triangle mismatch'
  assert max(abs(a-b) for aa,bb in zip(report[id]['bounds_zup'],report[id]['roundtrip']['bounds_zup']) for a,b in zip(aa,bb))<.00001,'Roundtrip bound mismatch'
  render(sc,camera,id,'fresh-glb',objects)
  saved=[list(o.data.materials) for o in objects]
  for o in objects:
   for k in range(len(o.data.materials)):o.data.materials[k]=clay
  render(sc,camera,id,'clay-fresh-glb',objects)
  for o,materials in zip(objects,saved):
   for k,m in enumerate(materials):o.data.materials[k]=m
 data=dict(assets=report,artifact=dict(path=str(path),bytes=path.stat().st_size,sha256=hashlib.sha256(path.read_bytes()).hexdigest()),blender=bpy.app.version_string,units='meters; native Z-up / GLB Y-up',renderer=dict(engine='Cycles',samples=20,resolution=[1000,760],exposure=0,transform='AgX',look='AgX - Medium High Contrast',orthographic=True,cameras=CAMERAS,area_lights=LIGHTS),approval='technical candidate; runtime and user visual acceptance pending')
 data['editableSourceSha256']=hashlib.sha256((OUT/'camp-props-editable.blend').read_bytes()).hexdigest();data['generatorSha256']=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
 if REFINE_C05:data['c05SurfaceGeneratorSha256']=hashlib.sha256((HERE/'c05_surface.py').read_bytes()).hexdigest()
 (OUT/'manifest.json').write_text(json.dumps(data,indent=2))
 print('CAMP CRAFT COMPLETE',json.dumps(data['artifact']))
if __name__=='__main__':main()
