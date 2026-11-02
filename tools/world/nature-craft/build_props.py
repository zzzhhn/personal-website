"""Batch4 stone / trophy cabinet / grass. Existing metres, Z up, +X front.
No collision export or layout edits. Native parts retained; derive material batches for GLB.
Run Blender -b -t 2 -P tools/world/nature-craft/build_props.py -- [G21 G22 G23 C09 grass] [--render]
"""
import bpy, bmesh, math, json, hashlib, importlib.util, sys
from pathlib import Path
from mathutils import Vector
import numpy as np

HERE=Path(__file__).resolve().parent; R=HERE.parents[2]
OUT=R/'docs/world/phase-2-playground/asset-batch4-20261102'
PUB=R/'public/assets/world/nature-craft'; NATIVE=HERE/'blend'
spec=importlib.util.spec_from_file_location('craft',R/'tools/world/djc-umbrella-craft/build.py')
U=importlib.util.module_from_spec(spec);spec.loader.exec_module(U)
spec=importlib.util.spec_from_file_location('scan',R/'tools/world/camp-props-craft/c05_surface.py')
S=importlib.util.module_from_spec(spec);spec.loader.exec_module(S)
sources=json.loads((OUT/'props-sources.json').read_text()) if (OUT/'props-sources.json').exists() else []
manifest=json.loads((OUT/'props-manifest.json').read_text()) if (OUT/'props-manifest.json').exists() else {}

def reset():
 bpy.ops.wm.read_factory_settings(use_empty=True)
 bpy.context.preferences.filepaths.save_version=0

def stats():
 rows=[]
 for o in bpy.context.scene.objects:
  if o.type!='MESH':continue
  o.data.calc_loop_triangles(); bm=bmesh.new();bm.from_mesh(o.data)
  pts=[o.matrix_world@v.co for v in o.data.vertices]
  raw=sum(not e.is_manifold for e in bm.edges)
  bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-5)
  rows.append(dict(name=o.name,triangles=len(o.data.loop_triangles),degenerate=sum(t.area<1e-10 for t in o.data.loop_triangles),nonmanifold=raw,weldedNonmanifold=sum(not e.is_manifold for e in bm.edges),bounds=[[min(p[k] for p in pts) for k in range(3)],[max(p[k] for p in pts) for k in range(3)]],materials=[m.name for m in o.data.materials]))
  bm.free()
 return rows

def rig_render(name,aim,span):
 c=bpy.context.scene; c.render.engine='CYCLES';c.cycles.samples=24;c.cycles.use_denoising=True
 c.render.resolution_x=1000;c.render.resolution_y=800;c.render.resolution_percentage=100
 c.view_settings.view_transform='AgX';c.view_settings.look='AgX - Medium High Contrast';c.view_settings.exposure=0
 if not c.world:c.world=bpy.data.worlds.new('Inspection world')
 c.world.use_nodes=True;c.world.node_tree.nodes['Background'].inputs[0].default_value=(.32,.36,.4,1);c.world.node_tree.nodes['Background'].inputs[1].default_value=.65
 rig=U.collection('REVIEW RIG | excluded from export')
 floor=U.put(U.craft_box('Review floor',(0,0,-.028),(200,200,.05),U.material('Review matte floor','c6c7bd',.95),0),rig)
 for p,power,size in [((span*.8,-span*.9,span*1.7),900,span*.8),((-span,span*.4,span*.9),600,span)]:
  data=bpy.data.lights.new('Review area','AREA');data.energy=power*(span/3.6)**2;data.shape='DISK';data.size=size
  o=bpy.data.objects.new('Review area',data);rig.objects.link(o);o.location=p;o.rotation_euler=(Vector(aim)-o.location).to_track_quat('-Z','Y').to_euler()
 data=bpy.data.cameras.new('Review camera');o=bpy.data.objects.new('Review camera',data);rig.objects.link(o)
 o.location=Vector(aim)+Vector((span*1.15,-span*1.35,span*.72));o.rotation_euler=(Vector(aim)-o.location).to_track_quat('-Z','Y').to_euler();data.type='ORTHO';data.ortho_scale=span;c.camera=o
 c.render.filepath=str(OUT/(name+'.png'));bpy.ops.render.render(write_still=True)
 for o in list(rig.objects):bpy.data.objects.remove(o,do_unlink=True)
 bpy.data.collections.remove(rig)

def uv_face(o,tile=.8):
 l=o.data.uv_layers.active or o.data.uv_layers.new(name='UVMap')
 for f in o.data.polygons:
  n=max(range(3),key=lambda k:abs(f.normal[k]));axes=[k for k in range(3) if k!=n]
  for li in f.loop_indices:
   p=o.data.vertices[o.data.loops[li].vertex_index].co;l.data[li].uv=(p[axes[0]]/tile+.17,p[axes[1]]/tile+.31)

def save_export(aid,root,objs):
 bpy.context.view_layer.update(); native=stats()
 bpy.ops.wm.save_as_mainfile(filepath=str(NATIVE/(aid+'.blend')),compress=True)
 # Keep all named objects in editable file. Join only compatible materials for runtime.
 for o in objs:
  if o.type!='MESH':continue
  bpy.context.view_layer.objects.active=o;o.select_set(True)
  for m in list(o.modifiers):bpy.ops.object.modifier_apply(modifier=m.name)
  o.select_set(False)
 if aid=='C09':
  bpy.ops.object.select_all(action='DESELECT')
  for o in objs:o.select_set(True)
  bpy.context.view_layer.objects.active=objs[0];bpy.ops.object.join()
  merged=bpy.context.view_layer.objects.active;merged.name='C09-runtime | shared physical materials';objs=[merged]
 bpy.ops.object.select_all(action='DESELECT')
 for o in [root]+objs:o.select_set(True)
 bpy.context.view_layer.objects.active=root
 bpy.ops.export_scene.gltf(filepath=str(PUB/(aid+'.glb')),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_extras=True,export_attributes=True,export_texcoords=True,export_normals=True,export_materials='EXPORT',export_vertex_color='ACTIVE',export_all_vertex_colors=False,export_animations=False,export_cameras=False,export_lights=False,export_skins=False,export_image_format='AUTO',export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=6,export_draco_position_quantization=20,export_draco_normal_quantization=12)
 path=PUB/(aid+'.glb');manifest[aid]=dict(native=native,bytes=path.stat().st_size,sha256=hashlib.sha256(path.read_bytes()).hexdigest())

def stone(aid,render):
 bpy.ops.wm.open_mainfile(filepath=str(R/f'tools/world/camp/nature-v4/blend/{aid}.blend'));bpy.context.preferences.filepaths.save_version=0
 root=bpy.data.objects[aid];o=bpy.data.objects['rock'];base=[v.co.copy() for v in o.data.vertices]
 if render:rig_render(aid+'-before',(0,0,float(o.dimensions.z)*.45),float(max(o.dimensions))*1.3)
 # The accepted rock already has real fractures/steps/bevels. Preserve those exact vertices.
 # Photographic microresponse follows every face's dominant plane; layer pigment follows Z.
 colour,record=S.photo('stone','color',512);sources.append(record)
 pix=S.pixels(colour);lum=pix@np.array([.2126,.7152,.0722]);lum=lum/max(float(lum.mean()),1e-5)
 ratio=np.clip(.83+.17*lum,.78,1.18); neutral=U.image('Rock mineral luminance | CC0 adapted 512',np.repeat(ratio[:,:,None],3,2))
 normal,record=S.photo('stone','normal',512);sources.append(record)
 arm,record=S.photo('stone','arm',256);sources.append(record)
 pigment=[]
 for m in o.data.materials:
  m=m # each opened file has task-local materials only
  m.use_nodes=True;bs=m.node_tree.nodes.get('Principled BSDF');basecol=tuple(bs.inputs['Base Color'].default_value)
  pigment.append(basecol)
  tex=m.node_tree.nodes.new('ShaderNodeTexImage');tex.image=neutral
  U.normal(m,normal,.32);S.roughness(U,m,arm,'Mineral roughness',.78,.18)
  vc=m.node_tree.nodes.new('ShaderNodeVertexColor');vc.layer_name='Bedding'
  mult=m.node_tree.nodes.new('ShaderNodeMixRGB');mult.blend_type='MULTIPLY';mult.inputs[0].default_value=1
  m.node_tree.links.new(tex.outputs['Color'],mult.inputs[1]);m.node_tree.links.new(vc.outputs['Color'],mult.inputs[2]);m.node_tree.links.new(mult.outputs[0],bs.inputs['Base Color'])
  m.use_backface_culling=True
 layer=o.data.color_attributes.new(name='Bedding',type='FLOAT_COLOR',domain='CORNER');o.data.color_attributes.active_color=layer
 for face in o.data.polygons:
  colour=pigment[face.material_index]
  if face.material_index==3:colour=tuple(.45*a+.55*b for a,b in zip(colour,pigment[0]))
  for li in face.loop_indices:
   x,y,z=o.data.vertices[o.data.loops[li].vertex_index].co;h=z+.035*math.sin(x*2.1+y*.7)
   narrow=math.exp(-((math.sin(h*math.tau/.24))/.24)**2)
   damp=(1-min(1,max(0,z)/.26))*.09;val=1-.055*narrow-damp
   layer.data[li].color=(colour[0]*val,colour[1]*val*.998,colour[2]*val*.99,1)
 uv_face(o,.85)
 assert all((a-v.co).length<1e-9 for a,v in zip(base,o.data.vertices))
 root['batch4']='Exact original fracture geometry; face oriented CC0 mineral maps; restrained bedding and damp foot'
 save_export(aid,root,[o]);manifest[aid]['geometryExact']=True
 if render:rig_render(aid+'-native',(0,0,float(o.dimensions.z)*.45),float(max(o.dimensions))*1.3)

def cabinet(render):
 aid='C09';bpy.ops.wm.open_mainfile(filepath=str(R/'tools/world/camp/props/blend/C09.blend'))
 old=stats();manifest['C09-baseline']=old
 if render:rig_render('C09-before',(0,0,.84),2.15)
 reset();c=U.collection('C09 | editable timber cabinet and hollow cups');root=bpy.data.objects.new('C09',None);c.objects.link(root)
 wood=U.material('C09 | fabrication aligned timber','ffffff',.78); back=U.material('C09 | recessed dark backing','66513d',.9)
 # Same approved photographed timber source as the preceding Camp table batch.
 for filename,space in [('wood_diff.jpg','sRGB'),('wood_nor_gl.jpg','Non-Color')]:
  path=U.TEXTURES/filename;im=bpy.data.images.load(str(path));im.colorspace_settings.name=space;im.scale(512,512);im.pack()
  if space=='sRGB':U.connect(wood,im,'Base Color')
  else:U.normal(wood,im,.2)
  sources.append(dict(file=str(path),sha256=hashlib.sha256(path.read_bytes()).hexdigest(),asset='https://polyhaven.com/a/wood_table_001',license='CC0',license_url='https://polyhaven.com/license',usage='512px fabrication-aligned cabinet timber'))
 brass=U.material('C09 | satin brass','b8975a',.34,.72);paper=U.material('C09 | warm page blocks','e6dccb',.92);slate=U.material('C09 | slate book cloth','4e647d',.88);orange=U.material('C09 | orange book cloth','e8803a',.88)
 def box(n,p,s,m=wood,r=.003):
  o=U.put(U.craft_box(n,p,s,m,r,segments=2),c)
  # The longest board axis carries the grain; face normals choose the other axis.
  l=o.data.uv_layers.new(name='UVMap');long=max(range(3),key=lambda k:s[k]);offset=(sum(map(ord,n))%23)/19
  for f in o.data.polygons:
   normal=max(range(3),key=lambda k:abs(f.normal[k]));axes=[k for k in range(3) if k!=normal]
   a=next((k for k in axes if k!=long),axes[0]);b=long if long in axes else axes[1]
   for li in f.loop_indices:
    co=o.data.vertices[o.data.loops[li].vertex_index].co;l.data[li].uv=(co[a]/1.6+offset,co[b]/1.6+.23)
  return o
 for y in [-.84,.84]:box('Side | continuous 40mm upright',(0,y,.5625),(.54,.04,1.125))
 box('Top | eased overhang',(.0125,0,1.14),(.585,1.77,.04))
 box('Plinth | recessed bearing',(-.01,0,.045),(.48,1.65,.09),back)
 for z in [.11,.6225]:box('Shelf | seated between uprights',(.006,0,z),(.528,1.648,.04 if z<.2 else .035))
 box('Divider | tenoned into shelves',(.0025,0,.6225),(.515,.04,.995))
 # Closed rear boards meet inside the original 24mm backing envelope.
 for j in range(4):box('Backing | tongue and groove board %d'%j,(-.262,.617-j*.411,.605),(.024,.409,1.03),back,.001)
 # Restrained shoulder joints explain how shelves are supported. Pegs stay flush at front.
 for y in [-.84,.84]:
  for z in [.15,.64,1.10]:
   pin=U.lathe('Cabinet | flush hardwood dowel',[(0,0),(.004,0),(.004,.002),(0,.002)],back,c,10);pin.rotation_euler[1]=math.pi/2;pin.location=(.268,y,z)
 def cup(cx,cy,z0,h,handles=True):
  s=h/.32;pw=.075*s;ph=.05*s
  box('Cup | timber plinth',(cx,cy,z0+ph/2),(pw*2,pw*2,ph),back,.003)
  profile=[(0,0),(.055,0),(.055,.006),(.05,.02),(.016,.045),(.016,.10),(.028,.115),(.018,.13),(.07,.19),(.088,.254),(.088,.262),(.074,.262),(.074,.25),(.056,.205),(0,.19)]
  o=U.lathe('Cup | closed foot stem bowl wall and rolled rim',[(r*s,z*s) for r,z in profile],brass,c,32);o.location=(cx,cy,z0+ph-.002)
  for f in o.data.polygons:f.use_smooth=True
  if handles:
   for sign in [-1,1]:
    pts=[(cx,cy+sign*r*s,z0+ph-.002+z*s) for r,z in [(.079,.244),(.105,.249),(.119,.236),(.122,.211),(.112,.189),(.092,.178),(.065,.179)]]
    U.tube('Cup | handle attached at bowl shoulder and base',pts,.006*s,brass,c,sides=8)
 for args in [(0,.05,1.158,.54,True),(0,-.52,1.158,.38,False),(.04,-.44,.638,.36,True),(.04,.46,.128,.34,False)]:cup(*args)
 for cx,cy,z0,h,ang in [(-.17,.44,.638,.36,-12),(-.1,.58,1.158,.30,-8)]:
  # Plaques have an inset metal face and a real timber back, no fabricated award text.
  plaque=box('Plaque | timber backing',(cx,cy,z0+h/2),(.03,.28,h),wood,.003)
  inset=box('Plaque | inset blank brass face',(cx+.019,cy,z0+h/2+.01),(.006,.20,h-.13),brass,.001)
  for o in [plaque,inset]:o.rotation_euler[1]=math.radians(ang)
 for j,(length,width,thick,mat) in enumerate([(.30,.22,.05,slate),(.27,.20,.045,orange)]):
  z=.129+j*.049
  for dz in [0,thick-.004]:box('Book | distinct cloth cover',(0,-.45,z+dz+.002),(width+.008,length+.008,.004),mat,.001)
  box('Book | inset page block',(.004,-.45,z+thick/2),(width-.01,length-.015,thick-.01),paper,.001)
  box('Book | cloth spine',(-width/2,-.45,z+thick/2),(.009,length+.008,thick),mat,.002)
 objs=list(c.objects)
 for o in objs:
  if o!=root:o.parent=root
 root['contract']='Original pad, collision and 0.585 x 1.77m carcass; 1.697m trophy top; blank plaques'
 if render:rig_render('C09-native',(0,0,.84),2.15)
 save_export(aid,root,[o for o in objs if o!=root])

def grass(render,legacy=False):
 reset();c=U.collection('Grass | editable cupped blade tuft');root=bpy.data.objects.new('grass',None);c.objects.link(root)
 for k in range(5):
  a=k/5*math.tau+.7*(k%2);r=.03+.05*((k*7)%3)/2;lean=.16+.1*((k*3)%2);h=.42*(.7+.3*((k*5)%4)/3);w=.035
  bx,bz=math.cos(a)*r,math.sin(a)*r;dx,dz=math.cos(a)*lean,math.sin(a)*lean;tx,tz=-math.sin(a)*w,math.cos(a)*w
  # Convert runtime (x,y,z) to native (x,-z,y), keeping both source formulae readable.
  p=[(bx-tx,0,bz-tz),(bx+tx,0,bz+tz),(bx-tx*.7+dx*.35,h*.55,bz-tz*.7+dz*.35),(bx+tx*.7+dx*.35,h*.55,bz+tz*.7+dz*.35),(bx+dx,h,bz+dz)] if legacy else [(bx-tx*.55,0,bz-tz*.55),(bx+tx*.55,0,bz+tz*.55),(bx-tx*.92+dx*.28,h*.55,bz-tz*.92+dz*.28),(bx+tx*.92+dx*.44,h*.59,bz+tz*.92+dz*.44),(bx+dx+tx*.8,h,bz+dz+tz*.8)]
  m=U.material('Grass | root to tip %d'%k,'8aa24a',.95)
  o=U.mesh('Blade %d | cupped shoulder, narrow root, swept tip'%k,[(x,-z,y) for x,y,z in p],[(0,1,3),(0,3,2),(2,3,4)],m,c);o.parent=root
  m.use_backface_culling=False
 if legacy:
  rig_render('grass-before',(0,0,.2),1.0);return
 save_export('grass',root,list(root.children))
 if render:rig_render('grass-native',(0,0,.2),1.0)

def main():
 OUT.mkdir(parents=True,exist_ok=True);PUB.mkdir(parents=True,exist_ok=True);NATIVE.mkdir(parents=True,exist_ok=True)
 args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
 render='--render' in args;ids=[s for s in args if not s.startswith('--')] or ['G21','G22','G23','C09','grass']
 if '--verify-only' in args:
  for aid in ids:
   reset();bpy.ops.wm.open_mainfile(filepath=str(NATIVE/(aid+'.blend')));manifest[aid]['nativeVerified']=stats()
   reset();bpy.ops.import_scene.gltf(filepath=str(PUB/(aid+'.glb')));manifest[aid]['fresh']=stats()
   if aid!='grass':assert all(o['weldedNonmanifold']==0 for o in manifest[aid]['fresh']),('nonclosed solid after seam welding',aid)
  (OUT/'props-manifest.json').write_text(json.dumps(manifest,indent=2));return
 for aid in ids:
  reset()
  if aid.startswith('G'):stone(aid,render)
  elif aid=='C09':cabinet(render)
  else:
   if render:grass(True,True)
   grass(render)
  if render:
   reset();bpy.ops.import_scene.gltf(filepath=str(PUB/(aid+'.glb')))
   manifest[aid]['fresh']=stats()
   if aid.startswith('G'):
    o=next(o for o in bpy.context.scene.objects if o.type=='MESH');rig_render(aid+'-fresh',(0,0,float(o.dimensions.z)*.45),float(max(o.dimensions))*1.3)
   else:rig_render(aid+'-fresh',(0,0,.84) if aid=='C09' else (0,0,.2),2.15 if aid=='C09' else 1.0)
  print('BATCH4',aid,json.dumps({k:v for k,v in manifest[aid].items() if k in ['bytes','sha256','geometryExact']}))
 (OUT/'props-manifest.json').write_text(json.dumps(manifest,indent=2))
 unique={json.dumps(s,sort_keys=True):s for s in sources}
 (OUT/'props-sources.json').write_text(json.dumps(list(unique.values()),indent=2))

if __name__=='__main__':main()
