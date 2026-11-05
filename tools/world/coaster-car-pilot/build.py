"""A single authored coaster carriage. Metres; exported +X forward, +Y up.

Native parts stay editable. Runtime is a separate copy joined by physical material.
The six original contact panels are frozen; visual geometry never becomes physics.
All surface maps are deterministic authored textures, not photographic scans.
"""
import bpy, bmesh, math, json, hashlib
import numpy as np
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'docs/world/phase-2-playground/coaster-car-astra-pilot-20261104'
OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version=0
C=bpy.data.collections.new('AUTHOR | individually editable carriage parts')
bpy.context.scene.collection.children.link(C)
def v(p): return (p[0],-p[2],p[1])
def linear(h):
    a=[int(h[i:i+2],16)/255 for i in (0,2,4)]
    return tuple(x/12.92 if x<=.04045 else ((x+.055)/1.055)**2.4 for x in a)
def material(name,color,rough,metal=0,coat=0):
    m=bpy.data.materials.new(name);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*linear(color),1)
    p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
    p.inputs['Coat Weight'].default_value=coat;p.inputs['Coat Roughness'].default_value=.19
    return m
M={
 'paint':material('01 | Satin copper automotive enamel','b8763f',.29,.48,.42),
 'blue':material('02 | Deep petrol moulded shell','244952',.32,.28,.3),
 'metal':material('03 | Brushed stainless fittings','b7c3c5',.31,1),
 'leather':material('04 | Pebbled teal upholstery','244449',.69,0),
 'rubber':material('05 | Graphite elastomer and chassis','20282c',.79,.04),
 'trim':material('06 | Warm stitching and ceramic markings','c7c4ad',.61,0),
 'dark':material('07 | Recessed blackened steel','101c22',.46,.6),
 'light':material('08 | Cyan status diffuser','73c8cf',.36,.1),
}
p=M['light'].node_tree.nodes.get('Principled BSDF');p.inputs['Emission Color'].default_value=(*linear('69dbe2'),1);p.inputs['Emission Strength'].default_value=1.3

def image(name,a):
    h,w=a.shape[:2];rgba=np.ones((h,w,4),np.float32);rgba[:,:,:3]=a if a.ndim==3 else a[:,:,None]
    im=bpy.data.images.new(name,width=w,height=h);im.colorspace_settings.name='Non-Color'
    im.pixels.foreach_set(rgba.ravel());im.filepath_raw=str(OUT/(name+'.png'));im.file_format='PNG';im.save();im.pack();return im
def texture(m,im,inputname,normal=False,strength=.2):
    ns=m.node_tree.nodes;ls=m.node_tree.links;n=ns.new('ShaderNodeTexImage');n.image=im
    p=ns.get('Principled BSDF')
    if normal:
        n2=ns.new('ShaderNodeNormalMap');n2.inputs['Strength'].default_value=strength;ls.new(n.outputs['Color'],n2.inputs['Color']);ls.new(n2.outputs['Normal'],p.inputs['Normal'])
    else:ls.new(n.outputs['Color'],p.inputs[inputname])
rng=np.random.default_rng(714);y,x=np.mgrid[:512,:512]
# 24 cm UV tile. Sub-millimetre grain is only visible at grazing close range.
height=(np.sin(x*.83+np.sin(y*.47))*np.cos(y*.96+np.sin(x*.39))*.23+rng.normal(0,.12,(512,512)))
dy,dx=np.gradient(height);normal=np.stack((-dx*.18,-dy*.18,np.ones_like(dx)),2);normal/=np.linalg.norm(normal,axis=2)[:,:,None]
texture(M['leather'],image('authored-leather-normal512',normal*.5+.5),'Normal',True,.42)
texture(M['leather'],image('authored-leather-roughness512',np.clip(.7+height*.08,.5,.85)),'Roughness')
brush=np.repeat((.3+.045*np.sin(np.arange(512)*2.71)+rng.normal(0,.018,512))[:,None],512,1)
texture(M['metal'],image('authored-brush-roughness512',brush),'Roughness')

def uv(o,tile=.24):
    layer=o.data.uv_layers.new(name='UVMap')
    for f in o.data.polygons:
        ax=max(range(3),key=lambda i:abs(f.normal[i]));axes=[i for i in range(3) if i!=ax]
        for k in f.loop_indices:
            co=o.data.vertices[o.data.loops[k].vertex_index].co;layer.data[k].uv=(co[axes[0]]/tile,co[axes[1]]/tile)
def mesh(name,verts,faces,mat,smooth=True):
    me=bpy.data.meshes.new(name);me.from_pydata([v(p) for p in verts],[],faces);me.update()
    o=bpy.data.objects.new(name,me);C.objects.link(o);me.materials.append(M[mat])
    for f in me.polygons:f.use_smooth=smooth
    uv(o);return o
def box(name,p,s,mat,r=.008):
    bpy.ops.mesh.primitive_cube_add(size=1,location=v(p));o=bpy.context.object;o.name=name
    for c in list(o.users_collection):c.objects.unlink(o)
    C.objects.link(o);o.scale=(s[0],s[2],s[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    o.data.materials.append(M[mat]);b=o.modifiers.new('Manufactured edge radius','BEVEL');b.width=r;b.segments=3
    n=o.modifiers.new('Face weighted normals','WEIGHTED_NORMAL');n.keep_sharp=True;n.weight=50
    for f in o.data.polygons:f.use_smooth=True
    if o.data.uv_layers:o.data.uv_layers.remove(o.data.uv_layers.active)
    uv(o);return o
def outline(y,x0,x1,z0,z1,r,n=8):
    pts=[]
    for cx,cz,a in [(x1-r,z1-r,0),(x0+r,z1-r,90),(x0+r,z0+r,180),(x1-r,z0+r,270)]:
        for i in range(n):
            t=math.radians(a+i*90/(n-1));pts.append((cx+r*math.cos(t),y,cz+r*math.sin(t)))
    return pts
def loft(name,rings,mat):
    n=len(rings[0]);verts=[p for r in rings for p in r];faces=[]
    for j in range(len(rings)-1):
        for i in range(n):faces.append((j*n+i,(j+1)*n+i,(j+1)*n+(i+1)%n,j*n+(i+1)%n))
    faces.extend([tuple(range(n)),tuple(reversed(range((len(rings)-1)*n,len(rings)*n)))])
    o=mesh(name,verts,faces,mat)
    # Planar end caps should not pull smoothed bevel normals across broad faces.
    o.data.polygons[-1].use_smooth=False;o.data.polygons[-2].use_smooth=False
    return o
def tube(name,points,r,mat,sides=10,closed=False):
    P=[Vector(p) for p in points];verts=[];faces=[]
    for i,p in enumerate(P):
        t=P[(i+1)%len(P)]-P[(i-1)%len(P)] if closed else P[min(i+1,len(P)-1)]-P[max(0,i-1)]
        t.normalize();ref=Vector((0,1,0)) if abs(t.y)<.9 else Vector((1,0,0));a=t.cross(ref).normalized();b=t.cross(a).normalized()
        for k in range(sides):verts.append(tuple(p+r*(a*math.cos(k*math.tau/sides)+b*math.sin(k*math.tau/sides))))
    for i in range(len(P) if closed else len(P)-1):
        for k in range(sides):faces.append((i*sides+k,i*sides+(k+1)%sides,((i+1)%len(P))*sides+(k+1)%sides,((i+1)%len(P))*sides+k))
    if not closed:faces.extend([tuple(reversed(range(sides))),tuple(range((len(P)-1)*sides,len(P)*sides))])
    return mesh(name,verts,faces,mat)
def cylinder(name,a,b,r,mat,sides=24):return tube(name,[a,b],r,mat,sides)
def torus(name,center,r,t,mat,axis='z',segments=36):
    x,y,z=center
    p=[(x+r*math.cos(i*math.tau/segments),y+r*math.sin(i*math.tau/segments),z) if axis=='z' else (x,y+r*math.sin(i*math.tau/segments),z+r*math.cos(i*math.tau/segments)) for i in range(segments)]
    return tube(name,p,t,mat,8,True)

# Continuous hull with a real rolled crown and tucked underbody, not a bevelled box.
loft('Hull | tapered lower chassis',[outline(.11,-1.24,1.28,-.72,.72,.20),outline(.23,-1.40,1.42,-.83,.83,.18)],'dark')
loft('Hull | copper shell with continuous shoulder',[outline(.215,-1.39,1.41,-.83,.83,.18),outline(.275,-1.44,1.445,-.899,.899,.18),outline(.36,-1.45,1.45,-.925,.925,.16),outline(.41,-1.445,1.445,-.925,.925,.15),outline(.445,-1.425,1.425,-.905,.905,.15),outline(.445,-1.365,1.365,-.855,.855,.10),outline(.425,-1.365,1.365,-.855,.855,.10)],'paint')
tube('Hull | rubber separation bead',outline(.271,-1.441,1.443,-.899,.899,.18),.006,'rubber',8,True)
box('Deck | replaceable ribbed footwell',(0,.435,0),(2.73,.020,1.71),'rubber',.01)
for x in [.63,.74,.85,.96,1.07,1.18]:box('Deck | transverse anti slip rib',(x,.451,0),(.026,.008,1.49),'rubber',.003)

# The nose is a curved wall. Its inner surface leaves the original leg space.
loft('Nose | moulded petrol guard',[outline(.44,1.325,1.46,-.77,.77,.045),outline(.64,1.325,1.475,-.90,.90,.05),outline(.865,1.335,1.46,-.87,.87,.05),outline(.925,1.35,1.435,-.80,.80,.035)],'blue')
tube('Nose | bright upper safety edge',[(1.4,.919,z) for z in [-.77,-.5,0,.5,.77]],.015,'metal')
box('Nose | recessed identification panel',(1.477,.737,0),(.008,.20,.61),'dark',.018)
for z in [-.56,.56]:
    box('Nose | inset running light pocket',(1.466,.74,z),(.015,.079,.20),'dark',.017)
    box('Nose | opal cyan light lens',(1.476,.744,z),(.009,.028,.15),'light',.012)

# Fabricated side guards. Rider-right (+Z) is the live station boarding side.
for z,x0,x1 in [(.85,-1.40,.25),(-.85,-1.40,1.2)]:
    mid=(x0+x1)/2;length=x1-x0
    box('Guard | shaped copper outer belt',(mid,.735,z),(length,.32,.126),'paint',.048)
    box('Guard | recessed petrol service panel',(mid,.73,z+math.copysign(.067,z)),(length-.15,.196,.019),'blue',.028)
    box('Guard | protective shoulder roll',(mid,.908,z),(length-.07,.034,.124),'rubber',.014)
    for x in [x0+.10,x1-.10]:
        cylinder('Guard | flush quarter turn fastener',(x,.727,z+math.copysign(.077,z)),(x,.727,z+math.copysign(.083,z)),.014,'metal',12)
        box('Guard | fastening slot',(x,.727,z+math.copysign(.087,z)),(.016,.003,.002),'dark',.001)
    # Real vent recesses rather than random noisy texture.
    if z<0:
        for x in [.66,.75,.84,.93,1.02]:box('Guard | recessed cooling louvre',(x,.728,-.931),(.027,.11,.008),'dark',.01)
    tube('Guard | lower accent pinstripe',[(x0+.15,.63,z+math.copysign(.079,z)),(x1-.15,.63,z+math.copysign(.079,z))],.005,'trim',6)

# Seat: supporting shell, upholstered crown, side bolsters and inset stitched ribs.
box('Seat | structural pan',(0,.557,0),(1.12,.108,1.27),'blue',.047)
loft('Seat | tailored cushion crown',[outline(.59,-.53,.53,-.605,.605,.10),outline(.64,-.55,.55,-.61,.61,.10),outline(.697,-.53,.53,-.59,.59,.11),outline(.720,-.46,.46,-.51,.51,.10)],'leather')
tube('Seat | hand sewn perimeter welt',outline(.688,-.534,.534,-.595,.595,.10),.0045,'trim',6,True)
for z in [-.43,-.215,0,.215,.43]:
    # Shallow relief keeps the exact .72 m contact plane.
    box('Seat | stitched longitudinal fluting',(0,.716,z),(.81,.005,.006),'dark',.002)
for z in [-.565,.565]:
    loft('Seat | soft side bolster',[outline(.615,-.47,.48,z-.045,z+.045,.025),outline(.695,-.42,.43,z-.037,z+.037,.025),outline(.72,-.32,.33,z-.024,z+.024,.018)],'leather')
# The back's front plane remains at x=-.44, height1.475.
loft('Seat back | moulded shell',[
    [(x,y,z) for x,y,z in [( -.62,.62,-.62),(-.44,.62,-.62),(-.44,.62,.62),(-.62,.62,.62)]],
    [(x,y,z) for x,y,z in [(-.62,1.39,-.60),(-.44,1.39,-.60),(-.44,1.39,.60),(-.62,1.39,.60)]],
    [(x,y,z) for x,y,z in [(-.61,1.475,-.52),(-.46,1.475,-.52),(-.46,1.475,.52),(-.61,1.475,.52)]],
],'blue')
box('Seat back | upholstered central pad',(-.436,1.07,0),(.045,.70,1.06),'leather',.021)
for z in [-.43,-.215,0,.215,.43]:box('Seat back | recessed tailored seam',(-.412,1.07,z),(.003,.59,.007),'dark',.003)
for z in [-.55,.55]:box('Seat back | lateral soft bolster',(-.427,1.06,z),(.05,.64,.105),'leather',.024)
for z in [-.51,.51]:tube('Seat back | continuous edge stitching',[(-.408,.77,z),(-.408,1.33,z)],.0035,'trim',6)
box('Seat back | lumbar cushion',(-.407,.80,0),(.06,.13,1.0),'leather',.028)
box('Seat back | rear inset service panel',(-.628,1.04,0),(.016,.53,.83),'dark',.028)
for z in [-.31,0,.31]:box('Seat back | rear mould stiffening rib',(-.643,1.04,z),(.025,.41,.038),'blue',.009)

# Safety bar with positive pivot hardware, shaped grips and locking cam housings.
for z in [-.82,.82]:
    # Front-supported pivots leave the actual side boarding aisle unobstructed.
    box('Restraint | bolted pivot pedestal',(1.34,.53,z),(.22,.16,.14),'dark',.022)
    cylinder('Restraint | stainless pivot',(1.34,.61,z-.077),(1.34,.61,z+.077),.065,'metal')
    points=[(1.34,.61,z),(1.30,.70,z),(1.22,1.11,z),(1.21,1.20,z),(1.24,1.215,z)]
    tube('Restraint | bent tubular arm',points,.032,'metal',12)
    cylinder('Restraint | captive pivot bolt',(1.34,.61,z+math.copysign(.078,z)),(1.34,.61,z+math.copysign(.088,z)),.027,'paint',6)
tube('Restraint | continuous cross tube',[(1.24,1.215,-.82),(1.24,1.215,.82)],.032,'metal',16)
for z in [-.45,.45]:
    cylinder('Restraint | textured hand grip',(1.24,1.215,z-.19),(1.24,1.215,z+.19),.045,'rubber',20)
    for dz in [-.18,-.15,.15,.18]:torus('Restraint | grip retaining ribs',(1.24,1.215,z+dz),.045,.0035,'rubber',segments=20)
box('Restraint | lock indicator',(1.24,1.215,0),(.097,.10,.17),'blue',.028)
box('Restraint | secured status lens',(1.291,1.219,0),(.004,.023,.065),'light',.009)

# Paired wheel carriers, actual tyre sidewalls, concentric hub machining and fasteners.
for x in [-1.03,1.03]:
    box('Bogie | cross axle carrier',(x,.10,0),(.36,.13,1.76),'dark',.026)
    for z in [-.86,.86]:
        s=1 if z>0 else -1
        box('Bogie | bearing mount',(x,.15,z-s*.10),(.31,.24,.11),'blue',.027)
        cylinder('Wheel | polyurethane running tyre',(x,.08,z-.10),(x,.08,z+.10),.26,'rubber',40)
        cylinder('Wheel | recessed sidewall',(x,.08,z+s*.102),(x,.08,z+s*.11),.205,'dark',40)
        cylinder('Wheel | turned aluminium hub',(x,.08,z+s*.112),(x,.08,z+s*.125),.15,'metal',32)
        torus('Wheel | machined concentric rim',(x,.08,z+s*.129),.134,.008,'metal')
        cylinder('Wheel | centre bearing cap',(x,.08,z+s*.128),(x,.08,z+s*.142),.065,'paint',24)
        cylinder('Wheel | axle end bolt',(x,.08,z+s*.143),(x,.08,z+s*.148),.029,'metal',6)
        for i in range(5):
            a=i*math.tau/5;xx=x+.102*math.cos(a);yy=.08+.102*math.sin(a)
            cylinder('Wheel | recessed lug bolt',(xx,yy,z+s*.126),(xx,yy,z+s*.135),.013,'dark',6)

# Modest identity marks; no screen full of labels or invented brand.
def label(name,text,p,size,front=True):
    data=bpy.data.curves.new(name,'FONT');data.body=text;data.size=size;data.extrude=.0002;data.align_x='CENTER';data.align_y='CENTER';data.space_character=1.15
    o=bpy.data.objects.new(name,data);C.objects.link(o);o.location=v(p);o.rotation_euler=(math.pi/2,0,math.pi/2) if front else (math.pi/2,0,math.pi)
    data.materials.append(M['trim']);bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.convert(target='MESH');o.select_set(False)
label('Nose | ceramic unit mark','01',(1.484,.753,0),.115)
label('Nose | tiny fleet designation','I N T E N T',(1.484,.685,0),.025)
label('Side | moulded carriage badge','INTENT / 01',(-.58,.733,-.936),.059,False)

# Freeze native authoring file, then derive independent material batches for runtime.
native_count=len(C.objects)
bpy.context.view_layer.update()
for o in list(C.objects):
    if o.type!='MESH':continue
    bpy.context.view_layer.objects.active=o
    for m in list(o.modifiers):bpy.ops.object.modifier_apply(modifier=m.name)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'coaster-car-editable.blend'))
R=bpy.data.collections.new('EXPORT | shared physical material batches');bpy.context.scene.collection.children.link(R)
groups={}
for source in list(C.objects):
    o=source.copy();o.data=source.data.copy();R.objects.link(o);groups.setdefault(o.data.materials[0].name,[]).append(o)
for name,objects in groups.items():
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();o=bpy.context.object;o.name=name
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    # Very thin bevels can collapse to zero-area triangles in glTF float32.
    # Clean only the derived mesh; retain all named native authoring parts.
    bm=bmesh.new();bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-7)
    bmesh.ops.dissolve_degenerate(bm,edges=list(bm.edges),dist=1e-7)
    bm.to_mesh(o.data);bm.free();o.data.update()
bpy.ops.object.select_all(action='DESELECT')
for o in R.objects:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'coaster-car.glb'),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_animations=False,export_cameras=False,export_lights=False)
blob=(OUT/'coaster-car.glb').read_bytes();g=json.loads(blob[20:20+int.from_bytes(blob[12:16],'little')])
tri=sum(g['accessors'][p['indices']]['count']//3 for m in g['meshes'] for p in m['primitives'])
manifest={'source':'main agent single asset pilot, right boarding revision 2026-11-06','baselineCommit':'070de2fa47a9ba49239b0ac0e957326fae4ae665','units':'metres','runtimeAxes':'+X forward +Y up; +Z rider right','nativeParts':native_count,'runtimeMeshes':len(g['meshes']),'materials':len(g['materials']),'triangles':tri,'bytes':len(blob),'sha256':hashlib.sha256(blob).hexdigest(),'textures':'3 deterministic authored 512px material maps, not scans','contact':'rider-right opening synchronized with COASTER_CAR_PANELS; restraint pivots moved out of doorway','visualAcceptance':'pending actual renderer comparison of revised doorway; existing material approval retained'}
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');print('PILOT_RESULT '+json.dumps(manifest),flush=True)
