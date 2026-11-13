"""Editable metre sources for Alpha cable cabin, alpine sled and passenger ferry.
Blender Z-up source: game (X,Y,Z) -> native (X,-Z,Y); game +X bow.
No external textures; physical materials remain separate in runtime exports.
"""
import bpy, math, os, sys, json
from mathutils import Vector
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'../../../..'))
OUT=os.path.join(ROOT,'public/assets/world/alpha-island/transports')
SRC=os.path.dirname(__file__)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def mat(name,color,rough=.5,metal=0):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal;return m
wood=mat('oiled-ash',(.43,.23,.095),.63);lightwood=mat('cut-ash',(.61,.39,.19),.65)
paint=mat('deep-petrol-enamel',(.045,.21,.25),.3,.12);cream=mat('warm-ivory-enamel',(.78,.73,.58),.35,.08)
steel=mat('galvanised-steel',(.28,.34,.37),.32,.8);rubber=mat('rubber-gaskets',(.026,.034,.038),.91)
cloth=mat('seat-woven-rust',(.45,.12,.07),.86);rope=mat('hemp-rope',(.57,.46,.28),.94)
glass=mat('smoked-cabin-glass',(.18,.36,.4),.18,.08);glass.diffuse_color=(.18,.36,.4,.22);glass.node_tree.nodes['Principled BSDF'].inputs['Alpha'].default_value=.22;glass.surface_render_method='DITHERED'
def xyz(p):return (p[0],-p[2],p[1])
def box(name,p,size,material,bevel=.025):
 bpy.ops.mesh.primitive_cube_add(size=1,location=xyz(p));o=bpy.context.object;o.name=name;o.dimensions=(size[0],size[2],size[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 o.data.materials.append(material)
 if bevel:
  mod=o.modifiers.new('manufactured edge radii','BEVEL');mod.width=min(bevel,min(size)*.22);mod.segments=3
  mod=o.modifiers.new('weighted corner normals','WEIGHTED_NORMAL')
 return o

def beam(name,a,b,r,material,vertices=16):
 a=Vector(xyz(a));b=Vector(xyz(b));d=b-a;bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=r,depth=d.length,location=(a+b)/2);o=bpy.context.object;o.name=name;o.rotation_euler=d.to_track_quat('Z','Y').to_euler();o.data.materials.append(material)
 for f in o.data.polygons:f.use_smooth=True
 return o

def cabin():
 box('floor structural tray',(0,-.126,0),(3.2,.2,2.4),paint,.07)
 for j in range(10):box('floor ash slat', (0,-.012,-1.08+j*.24),(3,.024,.22),wood,.008)
 for x in [-1.5,1.5]:
  for z in [-1.1,1.1]:box('corner post',(x,1.1,z),(.1,2.2,.1),cream)
 box('roof weather cap',(0,2.25,0),(3.45,.2,2.65),cream,.09)
 # Positive-Z opening faces both scene aprons and is clear; no fake closed door crossing the boarding path.
 for x in [-1.5,1.5]:
  box('end sill',(x,.38,0),(.12,.7,2.2),paint)
  box('end windscreen',(x,1.35,0),(.025,1.15,2.08),glass,.004)
 box('starboard sill',(0,.36,-1.12),(3,.66,.1),paint)
 box('starboard glazing',(0,1.35,-1.12),(2.92,1.15,.025),glass,.004)
 box('seat cushion',(0,.42,0),(.72,.12,1.05),cloth,.06)
 box('seat back',(-.4,.76,0),(.12,.7,1.06),cloth,.05)
 box('measured boot support',(.51,.11,0),(.4,.04,.68),steel,.01)
 for z in [-.6,.6]:beam('seat leg',[-.12,.02,z],[-.12,.37,z],.035,steel)
 for z in [-.75,.75]:beam('suspension yoke',[0,2.35,z],[0,3.25,.35],.055,steel)
 beam('hinge hanger',[0,3.25,.35],[0,3.5,.17],.055,steel)
 beam('hinge axle',[0,3.5,.1],[0,3.5,.21],.035,steel)
 for z in [-.075,.075]:box('grip cable jaw',(0,3.5,z),(.5,.12,.08),steel,.008)
 box('grip upper bridge',(0,3.59,0),(.12,.05,.23),steel,.008)
 box('grip lower bridge',(0,3.4,0),(.12,.06,.23),steel,.008)
 for x in [-1.35,1.35]:beam('open-side grab rail',[x,.5,1.1],[x,1.5,1.1],.035,steel)

def sled():
 for z in [-.43,.43]:
  beam('tempered runner',[-1.2,-.125,z],[1.05,-.125,z],.035,steel)
  beam('upturned runner tip',[1.05,-.125,z],[1.4,.14,z],.035,steel)
  for x in [-.75,.55]:beam('runner stanchion',[x,-.12,z],[x,.37,z],.045,paint)
 for i in range(6):box('flexed seat plank',(-.62+i*.23,.42,0),(.21,.12,1.0),wood,.025)
 box('rear backrest',(-.93,.75,0),(.13,.66,1.05),wood,.035)
 box('measured boot support',(.51,.11,0),(.4,.04,.68),lightwood,.01)
 for z in [-.51,.51]:beam('hand grip',[-.7,.64,z],[.35,.64,z],.035,steel)
 beam('brake lever',[.25,.48,.4],[.5,.85,.4],.024,steel)

def ferry():
 # Closed hull profile with longitudinal chines, rather than a chassis under a boat shell.
 rings=[(-4.1,.12),(-3.7,.7),(-2.5,1),(2.6,1),(3.8,.45),(4.25,.02)]
 verts=[]
 for x,w in rings:
  for z,y in [(-1.62*w,-.18),(-1.34*w,-1.55),(0,-1.85),(1.34*w,-1.55),(1.62*w,-.18)]:verts.append(xyz((x,y,z)))
 faces=[]
 for i in range(len(rings)-1):
  for j in range(4):a=i*5+j;faces.append((a,a+1,a+6,a+5))
 faces.extend([tuple(range(4,-1,-1)),tuple(range((len(rings)-1)*5,len(rings)*5))]);faces.append(tuple([i*5 for i in range(len(rings))]+[i*5+4 for i in reversed(range(len(rings)))]))
 me=bpy.data.meshes.new('closed displacement hull');me.from_pydata(verts,[],faces);me.update();o=bpy.data.objects.new('closed petrol hull',me);bpy.context.collection.objects.link(o);o.data.materials.append(paint);m=o.modifiers.new('hull softened chines','BEVEL');m.width=.04;m.segments=3
 box('deck',(0,-.094,0),(7.2,.14,2.9),cream,.07)
 for j in range(13):box('deck boards',(-.25,-.012,-1.32+j*.22),(6.45,.024,.2),wood,.008)
 for x in [-2.5,2.5]:
  for z in [-1.3,1.3]:beam('canopy stanchion',[x,0,z],[x,2.15,z],.05,cream)
 box('passenger canopy',(0,2.24,0),(5.8,.16,3.25),cream,.09)
 # Mid-port gangway opening remains 1.6m clear.
 for z in [-1.38,1.38]:
  for a,b in ([(-3.25,-1.4),(1.4,3.25)] if z<0 else [(-3.25,3.25)]):
   for x in [a,b]:beam('rail post',[x,0,z],[x,.95,z],.035,steel)
   beam('handrail',[a,.95,z],[b,.95,z],.032,steel)
 box('passenger seat cushion',(0,.42,0),(.75,.12,1.2),cloth,.045);box('passenger back',(-.44,.8,0),(.12,.8,1.2),wood)
 box('measured boot support',(.51,.11,0),(.4,.04,.68),steel,.01)
 box('helm console',(2.4,.52,0),(.65,1.04,1.1),cream,.07)
 for x in [-2.6,2.6]:
  for z in [-1.65,1.65]:
   beam('rope fender', [x,-.1,z],[x,-.65,z],.13,rope)
 for z in [-1.46,1.46]:beam('rubber rubbing strake',[-2.9,-.23,z],[2.9,-.23,z],.07,rubber)

reports=[]
for name,build in [('cable',cabin),('sled',sled),('ferry',ferry)]:
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);build()
 # Editable native source retains bevel modifiers and named construction parts.
 bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SRC,name+'.blend'))
 bpy.ops.object.select_all(action='SELECT')
 for obj in list(bpy.context.selected_objects):
  bpy.context.view_layer.objects.active=obj
  for mod in list(obj.modifiers):bpy.ops.object.modifier_apply(modifier=mod.name)
  # Ensure closed hull outward winding after authoring cross-axis conversion.
  if obj.type=='MESH':
   bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.normals_make_consistent(inside=False);bpy.ops.object.mode_set(mode='OBJECT')
 bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,name+'.glb'),export_format='GLB',use_selection=True,export_yup=True)
 tris=sum(len(o.data.loop_triangles) for o in bpy.context.selected_objects if o.type=='MESH' for _ in [o.data.calc_loop_triangles()])
 coords=[o.matrix_world@v.co for o in bpy.context.selected_objects if o.type=='MESH' for v in o.data.vertices]
 bounds=[[min(p[i] for p in coords),max(p[i] for p in coords)] for i in range(3)]
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);bpy.ops.import_scene.gltf(filepath=os.path.join(OUT,name+'.glb'))
 fresh=[o.matrix_world@v.co for o in bpy.context.scene.objects if o.type=='MESH' for v in o.data.vertices]
 fresh_bounds=[[min(p[i] for p in fresh),max(p[i] for p in fresh)] for i in range(3)]
 reports.append(dict(name=name,triangles=tris,nativeBounds=bounds,reimportBounds=fresh_bounds,maxBoundsDelta=max(abs(bounds[i][j]-fresh_bounds[i][j]) for i in range(3) for j in range(2))))
with open(os.path.join(SRC,'export-report.json'),'w') as f:json.dump(reports,f,indent=2)
