"""C04 canvas shelter and C10 pennant mast. Blender 5.1.2, m, Z-up, +X tent door."""
from pathlib import Path
import hashlib, json, math, struct, sys, zlib
import bpy, bmesh
import numpy as np
from mathutils import Vector

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
OUT = REPO / 'public/assets/world/camp-shelter-craft'
MAPS = OUT / 'maps'
SKILL = Path.home() / '.codex/skills/blender-material-craft'
sys.path.insert(0, str(SKILL/'scripts'))
from scenario_tools import tool

REV = '3c66e8da538e83a9bbc56aa65592251b87764cca'
FROZEN = {'C04': '0d4b22d1836247b54393ec67e1c01e6c516296a14061e3c00abb76b3553f3f94',
          'C10': 'abc8d47e2e3525412f495f0b1285c2cb70b9a6002c9405f72e10e175a79c6f32'}
MATS = {}
IMAGES = {}

def digest(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()

def read_glb(p):
    d = p.read_bytes()
    return json.loads(d[20:20+struct.unpack_from('<I',d,12)[0]])

def png(name, rgb, color=False):
    a = np.uint8(np.clip(rgb,0,1)*255+.5)
    h,w,_ = a.shape
    def ch(t,d):
        return struct.pack('>I',len(d))+t+d+struct.pack('>I',zlib.crc32(t+d)&0xffffffff)
    p = MAPS/f'{name}.png'
    p.write_bytes(b'\x89PNG\r\n\x1a\n'+ch(b'IHDR',struct.pack('>IIBBBBB',w,h,8,2,0,0,0))+
                  ch(b'IDAT',zlib.compress(b''.join(b'\0'+row.tobytes() for row in a),9))+ch(b'IEND',b''))
    im = bpy.data.images.load(str(p))
    im.colorspace_settings.name = 'sRGB' if color else 'Non-Color'
    im.pack()
    IMAGES[name] = im

def make_maps():
    MAPS.mkdir(parents=True,exist_ok=True)
    y,x = np.mgrid[0:256,0:256]/256
    tau = math.tau
    warp,weft = np.cos(x*tau*32),np.cos(y*tau*32)
    fiber = .55*warp+.45*weft
    mottling = .026*np.sin(tau*(x*2+y))*np.cos(tau*(y*3-x))+.014*np.cos(tau*(x*5-y*4))
    canvas = np.array([.905,.493,.258])*(1+mottling[:,:,None]+.012*fiber[:,:,None])
    png('canvas-color',canvas,True)
    rough = .84+.046*fiber+mottling*.4
    png('canvas-rough',np.repeat(rough[:,:,None],3,axis=2))
    n = np.stack((.065*np.sin(tau*32*x),.07*np.sin(tau*32*y),np.ones_like(x)),axis=2)
    png('canvas-normal',n/np.linalg.norm(n,axis=2)[:,:,None]*.5+.5)
    # Longitudinal tool marks and growth lines, sampled on the axial UVs.
    grain = .066*np.cos(tau*x*12+.68*np.sin(tau*y))+.036*np.sin(tau*x*33+.3*np.cos(tau*y*2))
    wood = np.array([.643,.461,.302])*(1+grain[:,:,None])
    png('timber-color',wood,True)
    rough = .73-.35*grain
    png('timber-rough',np.repeat(rough[:,:,None],3,axis=2))
    # Four dyed flags in one 512px atlas. The v-axis is subdivided at fabric
    # widths. Map includes slightly darker turned edges and broad sun fading.
    Y,X = np.mgrid[0:512,0:512]/512
    band = np.minimum(3,(Y*4).astype(int))
    v = Y*4-band
    # Leave a small duplicated margin for the per-band UV inset.
    V = np.clip((v-.06)/.88,0,1)
    edge = np.minimum.reduce([X,1-X,V*.55,(1-V)*.55])
    hem = np.exp(-((edge-.017)/.017)**2)
    weave = np.cos(tau*X*72)*np.cos(tau*V*27)
    drape = .036*np.sin(tau*(X*.9+V*.45))+.018*np.sin(tau*(X*3.1-V*1.4))
    palette = np.array([[.886,.376,.163],[.894,.826,.687],[.887,.507,.234],[.542,.633,.278]])
    png('flag-dye-atlas',palette[band]*(1+(.013*weave+drape-.12*hem)[:,:,None]),True)

def linear(h):
    c=[int(h[i:i+2],16)/255 for i in (0,2,4)]
    return tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in c)+(1,)

def material(key,name,color,rough,metal=0,base=None,roughmap=None,normal=None):
    m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=linear(color)
    nodes=m.node_tree.nodes;links=m.node_tree.links
    bs=nodes.get('Principled BSDF')
    for s,v in [('Base Color',linear(color)),('Roughness',rough),('Metallic',metal)]:
        bs.inputs[s].default_value=v
    uv=nodes.new('ShaderNodeUVMap');uv.uv_map='UVMap'
    for image,target in ((base,'Base Color'),(roughmap,'Roughness'),(normal,'Normal')):
        if not image:continue
        tx=nodes.new('ShaderNodeTexImage');tx.image=IMAGES[image]
        links.new(uv.outputs['UV'],tx.inputs['Vector'])
        if target=='Normal':
            nm=nodes.new('ShaderNodeNormalMap');nm.uv_map='UVMap';nm.inputs['Strength'].default_value=.32
            links.new(tx.outputs['Color'],nm.inputs['Color']);links.new(nm.outputs['Normal'],bs.inputs[target])
        else:links.new(tx.outputs['Color'],bs.inputs[target])
    MATS[key]=m

def mesh(name, verts, faces, key, uv=None, smooth=False, owner=None):
    me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update()
    bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=bm.faces[:]);bm.to_mesh(me);bm.free()
    o=bpy.data.objects.new(name,me);SOURCE.objects.link(o);o.parent=owner or ROOT;me.materials.append(MATS[key])
    layer=me.uv_layers.new(name='UVMap')
    for p in me.polygons:
        p.use_smooth=smooth
        ax=max(range(3),key=lambda i:abs(p.normal[i]));axes=[i for i in range(3)if i!=ax]
        for li in p.loop_indices:
            vi=me.loops[li].vertex_index;co=me.vertices[vi].co
            layer.data[li].uv=uv[vi] if uv is not None else (co[axes[0]]*2,co[axes[1]]*2)
    o['semantic']=name;o['materialFamily']=key
    return o

def grid(name, fn, nu, nv, key, offset, uvfn, smooth=True):
    verts=[tuple(Vector(fn(i/nu,j/nv))+k*Vector(offset))
           for k in (0,1) for i in range(nu+1) for j in range(nv+1)]
    uv=[uvfn(i/nu,j/nv) for _ in (0,1) for i in range(nu+1) for j in range(nv+1)]
    n=(nu+1)*(nv+1);f=[]
    at=lambda i,j:i*(nv+1)+j
    for i in range(nu):
        for j in range(nv):
            a,b,c,d=at(i,j),at(i+1,j),at(i+1,j+1),at(i,j+1)
            f.extend(((a,b,c,d),(d+n,c+n,b+n,a+n)))
    edges=[(at(i,k),at(i+1,k)) for i in range(nu) for k in (0,nv)]
    edges += [(at(k,j),at(k,j+1)) for j in range(nv) for k in (0,nu)]
    f.extend((a,b,b+n,a+n) for a,b in edges)
    return mesh(name,verts,f,key,uv,smooth)

def tube(name, points, radii, key, sides=8, ripple=0):
    pts=[Vector(p) for p in points];verts=[];uv=[];distance=0
    if isinstance(radii,(int,float)):radii=[radii]*len(pts)
    for i,p in enumerate(pts):
        direction=(pts[min(i+1,len(pts)-1)]-pts[max(0,i-1)]).normalized()
        axis=Vector((1,0,0)) if abs(direction.z)>.95 else Vector((0,0,1))
        u=direction.cross(axis).normalized();w=direction.cross(u).normalized()
        if i:distance+=(p-pts[i-1]).length
        for j in range(sides):
            a=j*math.tau/sides
            r=radii[i]*(1+ripple*math.cos(3*a+.3*distance))
            verts.append(p+r*(math.cos(a)*u+math.sin(a)*w));uv.append((j/sides*math.tau*r*2,distance*2))
    f=[tuple(reversed(range(sides))),tuple((len(pts)-1)*sides+j for j in range(sides))]
    for i in range(len(pts)-1):
        for j in range(sides):f.append((i*sides+j,i*sides+(j+1)%sides,(i+1)*sides+(j+1)%sides,(i+1)*sides+j))
    return mesh(name,verts,f,key,uv,True)

def prism(name, poly, offset, key):
    n=len(poly);v=list(poly)+[Vector(p)+Vector(offset) for p in poly]
    f=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    return mesh(name,v,f,key)

def box(name,lo,hi,key,r=.02,angle=0,dy=0):
    x0,y0,z0=lo;x1,y1,z1=hi
    o=prism(name,[(x0,y0,z0),(x1,y0,z0),(x1,y1,z0),(x0,y1,z0)],(0,0,z1-z0),key)
    for v in o.data.vertices:
        x,y=v.co.x,v.co.y;v.co.x=math.cos(angle)*x-math.sin(angle)*y;v.co.y=math.sin(angle)*x+math.cos(angle)*y+dy
    bevel=o.modifiers.new('Eased edge with flat face','BEVEL');bevel.width=r;bevel.segments=2
    return o

def build_tent(p):
    L,W,hw,hr,ovs,ovx=(p[k] for k in ('L','W','hw','hr','ovs','ovx'))
    A=L/2+ovx;E=W+ovs;slope=(hr-hw)/W
    def roof(x,v,s):
        u=(x+A)/(2*A)
        # Gable and ridge stay taut, two lapped cloth bays show restraint
        # and the fore and aft eave corners pull out the curled edges.
        z=hr-slope*E*v+.062-.055*math.sin(math.pi*v)-.032*math.sin(3*math.pi*u)**2*math.sin(math.pi*v)
        z+=.025*math.sin(math.pi*u)**2*v**5
        return (x,s*E*v,z)
    for s in (-1,1):
        side='north' if s==1 else 'south'
        grid(f'{side}_cut_tensioned_rain_fly',lambda u,v:roof((2*u-1)*A,v,s),24,12,'canvas',(0,0,-.027),lambda u,v:(u*2*A*2,v*4.52))
        for x,tag in ((-A,'rear'),(A,'door')):
            tube(f'{tag}_{side}_folded_selvedge',[roof(x,i/12,s) for i in range(13)],.017,'binding')
        tube(f'{side}_rolled_eave',[roof((2*i/24-1)*A,1,s) for i in range(25)],.027,'binding')
        for x in (-A/3,A/3):
            grid(f'{side}_overlap_seam_{x:+.2f}',lambda u,v:(lambda q:(q[0],q[1],q[2]+.004+.005*math.sin(math.pi*u)))(roof(x+(u-.5)*.043,v,s)),2,12,'binding',(0,0,-.01),lambda u,v:(u*.086,v*4.52))
        grid(f'{side}_sidewall_drawn_up_at_ridge',lambda u,v:(L*(u-.5),s*(W-.026*math.sin(3*math.pi*u)**2*math.sin(v*math.pi)),v*.685),18,4,'canvas',(0,-s*.026,0),lambda u,v:(u*L*2,v*1.37))
        grid(f'{side}_turned_weather_apron',lambda u,v:(L*(u-.5),s*(W+.009-.01*math.sin(3*math.pi*u)**2*v),.018+v*(.11+.024*math.sin(3*math.pi*u)**2)),18,2,'binding',(0,-s*.021,0),lambda u,v:(u*L*2,v*.25))
    tube('ridge_lapped_cord',[(x,0,hr+.060) for x in (-A,-.83,0,.83,A)],.021,'binding',10)
    top=[(W,.694),(W/2,1.52),(0,hr+.036),(-W/2,1.52),(-W,.694)]
    door=list(zip(DOOR[0::2],DOOR[1::2]))
    prism('front_gable_cut_around_door',[(L/2-.041,y,z) for y,z in [(-W,0)]+door+[(W,0)]+top],(.041,0,0),'canvas')
    prism('rear_gable_canvas',[(-L/2,y,z) for y,z in [(-W,0),(W,0)]+top],(.041,0,0),'canvas')
    trim=[(1.207,y+math.copysign(.017,y),z+.019 if .01<z else .025) for y,z in door]
    tube('doorway_turned_brown_hem',trim,.016,'binding',8)
    for s in (-1,1):
        points=[];radii=[]
        for j in range(17):
            t=j/16;z=.067+(p['jamb']-.067)*t
            bell=math.exp(-((z-p['jamb']*.5)/.16)**2)
            points.append((1.218+.011*math.sin(math.pi*t),s*(.739-.019*bell),z))
            radii.append(.063-.025*bell+.004*math.cos(2*math.pi*t))
        tube(f'hand_gathered_door_curtain_{s}',points,radii,'canvas',12,.13)
        c=Vector(points[8]);c.z=p['jamb']*.5
        tube(f'woven_tie_wrap_{s}',[c-Vector((0,0,.022)),c,c+Vector((0,0,.022))],[.048,.052,.048],'hemp',10)
        tube(f'tie_hanging_tail_{s}',[c+Vector((.043,0,0)),c+Vector((.062,s*.018,-.044)),c+Vector((.053,s*.024,-.113))],.009,'hemp',6)
    box('groundsheet_under_canvas',(-1.18,-1.255,0),(1.30,1.255,.024),'dark',.012)
    tube('ridge_pole',[(-1.395,0,2.306),(1.395,0,2.306)],.047,'wood',10)
    tube('rear_ridge_upright',[(-1.09,0,.021),(-1.09,0,2.345)],.052,'wood',10)
    for s in (-1,1):
        y=s*.775
        tube(f'door_jamb_{s}',[(1.06,y,.021),(1.06,y,1.31)],.043,'wood',10)
        tube(f'door_jamb_angled_brace_{s}',[(1.06,y,1.285),(1.06,0,2.303)],.038,'wood',10)
        tube(f'brace_sewn_lashing_{s}',[(1.06,y,1.235),(1.06,y,1.295)],.050,'hemp',8)
    for x in (-1.09,1.06):
        tube(f'stitched_ridge_tenon_{x}',[(x,0,2.30),(x,0,2.47),(x,0,2.50)],[.028,.016,.006],'wood',10)
    prism('rear_vent_under_folded_flap',[(-1.211,y,z) for y,z in ((-.28,1),(.28,1),(.28,1.30),(-.28,1.30))],(.018,0,0),'dark')
    prism('rear_vent_folded_canvas_cowl',[(x,y,z) for x,y,z in ((-1.247,-.32,1.22),(-1.247,.32,1.22),(-1.206,.32,1.34),(-1.206,-.32,1.34))],(.012,0,0),'binding')
    for sx in (-1,1):
        for sy in (-1,1):
            base=Vector((sx*1.54,sy*2.035,.012));tip=Vector((sx*1.59,sy*2.081,.285))
            knot=base.lerp(tip,.78);a=Vector(roof(sx*1.25,1,sy));a.z-=.007
            tube(f'leaning_wooden_peg_{sx}_{sy}',[base,tip],[.031,.027],'wood',8)
            tube(f'looped_guy_line_{sx}_{sy}',[a,a.lerp(knot,.47)+Vector((0,0,-.013)),knot],.014,'hemp',6)
            tube(f'knotted_peg_hitch_{sx}_{sy}',[knot-Vector((0,0,.017)),knot+Vector((0,0,.016))],.038,'hemp',8)
            tube(f'canvas_guy_eye_{sx}_{sy}',[a-Vector((.045,0,0)),a+Vector((.045,0,0))],.028,'binding',8)

def flag(name,index,node):
    e=node['extras'];L,h=e['lengthM'],e['hoistHeightM'];gap=-e['hoistTopLocalGLB'][2]
    n,k=18,6;swallow=e['shape']=='swallow'
    def field(u,v):
        # Swallow-tail notch is cut into the cloth grid, with clear separation
        # of tips. The pennant terminates at a single vertex on each sheet.
        lead=u*(1-.24*(1-abs(2*v-1))*u**3) if swallow else u
        half=h*.5*(1-.09*u if swallow else 1-u)
        sag=.039*math.sin(math.pi*u)*(.7+.3*v)+.028*u
        x=(.095+.009*index)*u**1.17*(math.sin((2.52*u-.14*v)*math.pi+.2*index)+.27*math.sin((5.1*u+.45*v)*math.pi))
        return x,gap+L*lead,-h*.5+half*(1-2*v)-sag
    verts=[];uv=[];face=[];sheets=[]
    for sign in (1,-1):
        rows=[]
        for i in range(n+1):
            row=[];u=i/n
            for v in ([.5] if i==n and not swallow else [j/k for j in range(k+1)]):
                x,y,z=field(u,v)
                # A reinforced hoist and thinner sewn fly edge on a closed shell.
                edge=max(0,1-min(u,1-u,v,1-v)*12)
                t=.003+.004*edge+.005*math.exp(-u*30)
                row.append(len(verts));verts.append((x+sign*t*.5,y,z))
                uv.append((.004+.992*u,1-(index+.06+.88*v)/4))
            rows.append(row)
        sheets.append(rows)
        for a,b in zip(rows[:-1],rows[1:]):
            for j in range(k):
                face.append((a[j],b[0],a[j+1]) if len(b)==1 else (a[j],b[j],b[j+1],a[j+1]))
    outlines=[]
    for rows in sheets:
        outlines.append([r[0] for r in rows[:-1]]+rows[-1]+[r[-1] for r in reversed(rows[:-1])]+list(reversed(rows[0][1:-1])))
    a,b=outlines
    face += [(a[i-1],a[i],b[i],b[i-1]) for i in range(len(a))]
    ob=mesh(name+'_sewn_cloth_source',verts,face,'flag',uv,True)
    ob.location=(node['translation'][0],-node['translation'][2],node['translation'][1])
    return ob

def build_mast(base):
    nodes=[next(n for n in base['nodes'] if n['name']==f'flag_{i:02}') for i in range(1,5)]
    axis=-nodes[0]['translation'][2]
    def pt(x,y,z):return x,y+axis,z
    tube('lathe_tapered_timber_mast',[pt(0,0,.12),pt(0,0,.66),pt(0,0,1.7),pt(0,0,3.104)],[.05,.048,.044,.038],'wood',12)
    box('oak_ground_hub',(-.094,-.094,0),(.094,.094,.313),'dark',.014,dy=axis)
    tube('cast_socket_top_band',[pt(0,0,.283),pt(0,0,.295),pt(0,0,.323),pt(0,0,.331)],[.103,.108,.099,.092],'iron',12)
    for i in range(4):
        angle=i*math.pi/2;C,S=math.cos(angle),math.sin(angle)
        def rt(x,y,z):return pt(C*x-S*y,S*x+C*y,z)
        box(f'{i}_rebated_oak_foot',(.055,-.049,0),(.5,.049,.091),'dark',.012,angle,axis)
        tube(f'{i}_mast_diagonal_stay',[rt(.413,0,.066),rt(.348,0,.166),rt(.045,0,.69)],[.033,.027,.027],'wood',8)
        box(f'{i}_stay_heel_strap',(.385,-.052,.068),(.425,.052,.104),'iron',.006,angle,axis)
    tube('gilt_crown_spun_over_pole',[pt(0,0,z) for z in (3.070,3.079,3.103,3.124,3.152,3.179,3.205)],
         [.04,.047,.047,.048,.06,.039,.005],'brass',12)
    for i,node in enumerate(nodes):
        e=node['extras'];zt=node['translation'][1];gap=-e['hoistTopLocalGLB'][2]
        for j,z in enumerate((zt,zt-e['hoistHeightM'])):
            tube(f'flag_{i+1}_split_hoist_collar_{j}',[pt(0,0,z-.014),pt(0,0,z-.010),pt(0,0,z+.011),pt(0,0,z+.014)],
                 [gap+.004,gap+.009,gap+.009,gap+.004],'iron',12)
    return [flag(n['name'],i,n) for i,n in enumerate(nodes)],nodes

def col(name):
    c=bpy.data.collections.new(name);bpy.context.scene.collection.children.link(c);return c

def empty(name,collection,extras=None):
    o=bpy.data.objects.new(name,None);collection.objects.link(o)
    for k,v in (extras or {}).items():o[k]=v
    return o

def export(asset,base,parts,flags=(),nodes=()):
    runtime=col(f'RUNTIME | {asset} material batches')
    extras=next(n['extras'] for n in base['nodes'] if n['name']==asset)
    root=empty(asset,runtime,extras)
    root['craftVersion']='camp-shelter-v1'
    if asset=='C10':
        mast=empty('C10_pole',runtime);mast.parent=root
    else:mast=root
    def copy(o):
        c=o.copy();runtime.objects.link(c)
        c.data=bpy.data.meshes.new_from_object(o.evaluated_get(bpy.context.evaluated_depsgraph_get()),preserve_all_data_layers=True,
                                               depsgraph=bpy.context.evaluated_depsgraph_get())
        c.modifiers.clear()
        return c
    batches=[]
    for key,mat in MATS.items():
        sources=[o for o in parts if o.data.materials[0]==mat and o not in flags]
        if not sources:continue
        bpy.ops.object.select_all(action='DESELECT')
        copies=[copy(o) for o in sources]
        for o in copies:o.select_set(True)
        bpy.context.view_layer.objects.active=copies[0]
        if len(copies)>1:bpy.ops.object.join()
        o=bpy.context.object;o.name=f'{asset}_craft_{key}';o.parent=mast
        o['sourceParts']=[p.name for p in sources];batches.append(o)
    for source,node in zip(flags,nodes):
        o=copy(source);o.parent=root;o.name=node['name']
        for k,v in node['extras'].items():o[k]=v
        batches.append(o)
    bpy.ops.object.select_all(action='DESELECT')
    for o in [root,mast,*batches]:o.select_set(True)
    target=OUT/f'{asset}.glb'
    bpy.ops.export_scene.gltf(filepath=str(target),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,
                             export_extras=True,export_normals=True,export_animations=False,export_cameras=False,export_lights=False)
    runtime.hide_viewport=True;runtime.hide_render=True
    return target

def audit_geometry(parts):
    rows={}
    for o in parts:
        bm=bmesh.new();bm.from_mesh(o.data)
        nm=sum(not e.is_manifold for e in bm.edges)
        zero=sum(f.calc_area()<1e-10 for f in bm.faces)
        bm.free()
        rows[o.name]={'vertices':len(o.data.vertices),'closed':nm==0,'degenerateFaces':zero}
    return rows

def rig():
    sc=bpy.context.scene
    rc=col('REVIEW | shared offline neutral rig')
    cam=bpy.data.objects.new('Review camera',bpy.data.cameras.new('Review camera'));rc.objects.link(cam);sc.camera=cam
    sun=bpy.data.objects.new('Soft afternoon',bpy.data.lights.new('Soft afternoon','SUN'));rc.objects.link(sun)
    sun.rotation_euler=(.51,-.50,-.50);sun.data.energy=2.4;sun.data.angle=math.radians(12)
    fill=bpy.data.objects.new('Sky bounce',bpy.data.lights.new('Sky bounce','AREA'));rc.objects.link(fill)
    fill.location=(4,-4,7);fill.rotation_euler=(Vector((0,0,1))-fill.location).to_track_quat('-Z','Y').to_euler()
    fill.data.energy=220;fill.data.shape='DISK';fill.data.size=6
    if sc.world is None:sc.world=bpy.data.worlds.new('Neutral sky')
    sc.world.use_nodes=True;sc.world.node_tree.nodes.get('Background').inputs['Color'].default_value=(.32,.36,.39,1)
    sc.world.node_tree.nodes.get('Background').inputs['Strength'].default_value=.38
    sc.render.engine='CYCLES';sc.cycles.samples=14;sc.cycles.use_denoising=True
    sc.render.threads_mode='FIXED';sc.render.threads=2
    sc.render.resolution_x=800;sc.render.resolution_y=700;sc.render.resolution_percentage=100
    sc.view_settings.view_transform='AgX';sc.view_settings.exposure=0

def main():
    global SOURCE,ROOT,DOOR
    OUT.mkdir(parents=True,exist_ok=True);(HERE/'qa').mkdir(exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system='METRIC'
    make_maps()
    material('canvas','camp_canvas_orange','E78042',.85,base='canvas-color',roughmap='canvas-rough',normal='canvas-normal')
    material('binding','shelter_woven_selvedge','B26034',.87,roughmap='canvas-rough',normal='canvas-normal')
    material('hemp','shelter_flax_cord','D9BE95',.90)
    material('wood','shelter_axial_grain_timber','A4764F',.72,base='timber-color',roughmap='timber-rough')
    material('dark','shelter_waxed_walnut_and_ground','5B4031',.92)
    material('iron','mast_oiled_iron','55504A',.61,.47)
    material('brass','mast_turned_brass','B59152',.44,.62)
    material('flag','mast_yarn_dyed_cloth','E8CFA6',.82,base='flag-dye-atlas')
    material_qa=tool('materials');uvtool=tool('uv');exporttool=tool('export')
    manifest={'sourceRevision':REV,'generatorSha256':digest(__file__),'blender':bpy.app.version_string,'assets':{},'firstCompleteFrozen':True}
    qa={'materials':{m.name:material_qa.audit_material(m) for m in MATS.values()},'assets':{}}
    for aid in ('C04','C10'):
        baseline=HERE/f'baseline-{aid}.glb'
        assert digest(baseline)==FROZEN[aid]
        base=read_glb(baseline);extras=next(n['extras'] for n in base['nodes'] if n['name']==aid)
        SOURCE=col(f'SOURCE | {aid}')
        ROOT=empty(f'{aid}_editable',SOURCE,extras)
        if aid=='C04':
            p=json.loads(extras['tentParams']);DOOR=extras['doorProfile'];build_tent(p)
            flags,nodes=[],[]
            contract={'placements':[[-51,4.8,12.5],[-33,4.8,12.5]],'yaw':-math.pi/2,'front':'+X',
                      'doorProfile':DOOR,'tentParams':p}
        else:
            flags,nodes=build_mast(base)
            contract={'poleAxisGLB_xz':extras['poleAxisGLB_xz'],'yaw':2.6,
                      'pivots':{n['name']:n['translation'] for n in nodes},'hoist':{n['name']:n['extras'] for n in nodes}}
        bpy.context.view_layer.update()
        parts=[o for o in SOURCE.objects if o.type=='MESH']
        report=audit_geometry(parts)
        assert all(p['closed'] and not p['degenerateFaces'] for p in report.values()),report
        sample=next(o for o in parts if o.name in ('north_cut_tensioned_rain_fly','lathe_tapered_timber_mast'))
        path=export(aid,base,parts,flags,nodes)
        exported=exporttool.glb_summary(str(path))
        qa['assets'][aid]={'nativeGeometry':report,'representativeUvDensity':uvtool.texel_density(sample,tex_res=256),'glbSummary':exported}
        contract['physics']='Original camp GLB fitted collider and placement are unchanged'
        manifest['assets'][aid]={'baselineSha256':FROZEN[aid],'glbSha256':digest(path),'runtime':exported,'contract':contract}
    rig()
    bpy.context.preferences.filepaths.save_version=0
    blend=HERE/'camp-shelter-editable.blend'
    bpy.ops.wm.save_as_mainfile(filepath=str(blend),compress=True)
    manifest['blendSha256']=digest(blend)
    manifest['maps']=[{'name':p.name,'sha256':digest(p),'size':[512,512] if 'atlas' in p.name else [256,256],
                       'source':'Original deterministic procedural, CC0'} for p in sorted(MAPS.glob('*.png'))]
    manifest['verification']={'nativeExport':'complete; see qa/export-audit.json',
                              'runtime':'separate coordinator integration and fixed-camera browser review'}
    for path in (HERE/'first-complete-manifest.json',OUT/'manifest.json'):
        path.write_text(json.dumps(manifest,indent=2)+'\n')
    (HERE/'qa'/'export-audit.json').write_text(json.dumps(qa,indent=2)+'\n')
    print('CAMP_SHELTER_FIRST_COMPLETE',[(a,m['glbSha256']) for a,m in manifest['assets'].items()],flush=True)

if __name__=='__main__':main()
