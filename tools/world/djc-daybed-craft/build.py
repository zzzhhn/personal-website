"""Source-faithful first daybed refinement, meters Z-up, front +Y.

Preview saves native source and same-rig before/after. Finish opens that source,
exports a material-batched GLB, fresh-imports it, and renders close/clay proof.
"""
import bpy, bmesh, math, sys, json, hashlib
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
import numpy as np

TOOLS=Path(__file__).resolve().parent
REPO=TOOLS.parents[2]
OUT=REPO/'docs/world/phase-2-playground/djc-daybed-craft-20261101'
TEXTURES=Path('/Users/a22309/Desktop/Side-projects/Artifacts/personal-world-phase2-integration/docs/world/phase-2-playground/djc-quality-pilot-20261101/textures')
sys.path.insert(0,'/Users/a22309/.codex/skills/blender-material-craft/scripts')
from craft_geometry import box as craft_box, beam as craft_beam, closed_lathe

def linear(v):return v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4
def rgb(h):return tuple(linear(int(h[i:i+2],16)/255) for i in (0,2,4))
def mat(name,h,rough=.8,metal=0):
    m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(*rgb(h),1);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
    m.diffuse_color=(*rgb(h),1);return m
def collection(name):
    c=bpy.data.collections.new(name);bpy.context.scene.collection.children.link(c);return c
def put(o,c):
    for old in list(o.users_collection):old.objects.unlink(o)
    c.objects.link(o);return o
def mesh(name,v,f,m,c,smooth=False):
    me=bpy.data.meshes.new(name);me.from_pydata(v,[],f);me.update()
    bb=bmesh.new();bb.from_mesh(me);bmesh.ops.recalc_face_normals(bb,faces=list(bb.faces));bb.to_mesh(me);bb.free()
    o=bpy.data.objects.new(name,me);c.objects.link(o)
    if m:me.materials.append(m)
    for p in me.polygons:p.use_smooth=smooth
    return o
def uv(o,axes=(0,1),scale=.75,angle=0):
    layer=o.data.uv_layers.active or o.data.uv_layers.new(name='Fabrication UV')
    ca,sa=math.cos(angle),math.sin(angle)
    for p in o.data.polygons:
        for li in p.loop_indices:
            co=o.data.vertices[o.data.loops[li].vertex_index].co
            a,b=co[axes[0]],co[axes[1]]
            layer.data[li].uv=((a*ca+b*sa)/scale+.17,(-a*sa+b*ca)/scale+.31)
def round_side_uv(o,scale=.75):
    layer=o.data.uv_layers.active or o.data.uv_layers.new(name='Continuous round fabric UV')
    for p in o.data.polygons:
        center=sum((o.data.vertices[i].co for i in p.vertices),Vector())/len(p.vertices)
        ca=math.atan2(center.y,center.x)
        for li in p.loop_indices:
            co=o.data.vertices[o.data.loops[li].vertex_index].co
            if abs(p.normal.z)>.55:pair=(co.x/scale,co.y/scale)
            else:
                angle=ca+math.atan2(math.sin(math.atan2(co.y,co.x)-ca),math.cos(math.atan2(co.y,co.x)-ca))
                pair=(math.hypot(co.x,co.y)*angle/scale,co.z/scale)
            layer.data[li].uv=pair
def turned_board_uv(o,scale=1.6):
    layer=o.data.uv_layers.active or o.data.uv_layers.new(name='Turned board face and edge UV')
    for p in o.data.polygons:
        axis=max(range(3),key=lambda i:abs(p.normal[i]))
        axes={2:(0,1),0:(2,1),1:(0,2)}[axis]
        for li in p.loop_indices:
            co=o.data.vertices[o.data.loops[li].vertex_index].co
            layer.data[li].uv=(co[axes[0]]/scale+.17,co[axes[1]]/scale+.31)
def bx(name,loc,size,m,c,r=.004):
    o=put(craft_box(name,loc,size,m,r,3),c)
    long=max(range(3),key=lambda i:size[i]);other=next(i for i in (0,1,2) if i!=long)
    uv(o,(other,long),1.6);return o
def beam(name,a,b,w,d,m,c,r=.003):
    o=put(craft_beam(name,a,b,w,d,m,r),c);uv(o,(0,2),1.6);return o
def cyl(name,loc,r,h,m,c,n=64):
    bpy.ops.mesh.primitive_cylinder_add(vertices=n,radius=r,depth=h,location=loc)
    o=put(bpy.context.object,c);o.name=name;o.data.materials.append(m)
    for p in o.data.polygons:p.use_smooth=abs(p.normal.z)<.9
    uv(o);return o
def tube(name,points,r,m,c,cyclic=True,sides=8):
    v=[];f=[];n=len(points)
    for j,point in enumerate(points):
        a=Vector(points[(j-1)%n] if cyclic or j else points[j]);b=Vector(points[(j+1)%n] if cyclic or j<n-1 else points[j])
        t=(b-a).normalized();ref=Vector((0,0,1)) if abs(t.z)<.95 else Vector((0,1,0));u=t.cross(ref).normalized();w=t.cross(u).normalized()
        for k in range(sides):v.append(Vector(point)+r*(u*math.cos(k*math.tau/sides)+w*math.sin(k*math.tau/sides)))
    for j in range(n if cyclic else n-1):
        for k in range(sides):f.append((j*sides+k,j*sides+(k+1)%sides,((j+1)%n)*sides+(k+1)%sides,((j+1)%n)*sides+k))
    if not cyclic:f.extend([tuple(reversed(range(sides))),tuple((n-1)*sides+k for k in range(sides))])
    o=mesh(name,v,f,m,c,True);uv(o);return o
def annular(name,ri,ro,a,b,z0,z1,m,c,bevel=.002,segments=8):
    v=[];f=[]
    for z in (z0,z1):
        for r in (ri,ro):
            for j in range(segments+1):
                q=a+(b-a)*j/segments;v.append((r*math.cos(q),r*math.sin(q),z))
    n=segments+1
    for j in range(segments):
        f.extend([(j,j+1,n+j+1,n+j),(2*n+j,3*n+j,3*n+j+1,2*n+j+1),(j,2*n+j,2*n+j+1,j+1),(n+j,n+j+1,3*n+j+1,3*n+j)])
    f.extend([(0,n,3*n,2*n),(n-1,3*n-1,4*n-1,2*n-1)])
    o=mesh(name,v,f,m,c)
    # Curved stock retains grain along the segment. Side height must participate
    # in UVs; projecting only XY onto a vertical face creates a barcode.
    layer=o.data.uv_layers.new(name='Curved stock top side and crosscut UV')
    mid=(a+b)/2;ca,sa=math.cos(mid),math.sin(mid);scale=1.6 if m.name.startswith('01 ') else .8
    for p in o.data.polygons:
        radial_normal=p.normal.x*ca+p.normal.y*sa
        for li in p.loop_indices:
            co=o.data.vertices[o.data.loops[li].vertex_index].co
            radial=co.x*ca+co.y*sa;tangent=-co.x*sa+co.y*ca
            if abs(p.normal.z)>.6:u,v=radial,tangent
            elif abs(radial_normal)>.6:u,v=co.z,tangent
            else:u,v=radial,co.z
            layer.data[li].uv=(u/scale+.17,v/scale+.31)
    if bevel:
        mod=o.modifiers.new('Eased sawn edges','BEVEL');mod.width=bevel;mod.segments=3
        mod=o.modifiers.new('Weighted broad face normals','WEIGHTED_NORMAL');mod.keep_sharp=True
    return o
def apply_parts(c):
    for o in list(c.objects):
        if o.type!='MESH':continue
        bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
        for mod in list(o.modifiers):bpy.ops.object.modifier_apply(modifier=mod.name)
        assert len(o.data.uv_layers)==1,o.name
        o.data.uv_layers.active.name='UVMap'
    bpy.context.view_layer.update()

def map_image(name,arr,noncolor=False):
    h,w=arr.shape[:2];im=bpy.data.images.new(name,width=w,height=h,alpha=True)
    if noncolor:im.colorspace_settings.name='Non-Color'
    rgba=np.ones((h,w,4),dtype=np.float32);rgba[:,:,:3]=arr
    im.pixels.foreach_set(rgba.ravel());im.pack();return im
def image_node(m,im,socket):
    n=m.node_tree.nodes.new('ShaderNodeTexImage');n.image=im
    m.node_tree.links.new(n.outputs['Color'],m.node_tree.nodes.get('Principled BSDF').inputs[socket]);return n
def normal_node(m,im,strength):
    n=m.node_tree.nodes.new('ShaderNodeTexImage');n.image=im
    q=m.node_tree.nodes.new('ShaderNodeNormalMap');q.inputs['Strength'].default_value=strength
    m.node_tree.links.new(n.outputs['Color'],q.inputs['Color']);m.node_tree.links.new(q.outputs['Normal'],m.node_tree.nodes.get('Principled BSDF').inputs['Normal'])
def palette():
    wood=mat('01 Oiled timber | CC0 photographed grain','956a43',.64)
    for file,space,socket in [('wood_diff.jpg','sRGB','Base Color'),('wood_nor_gl.jpg','Non-Color',None)]:
        im=bpy.data.images.load(str(TEXTURES/file));im.colorspace_settings.name=space;im.scale(2048,2048);im.pack()
        if socket:image_node(wood,im,socket)
        else:normal_node(wood,im,.30)
    stone=mat('02 Honed limestone | shallow mineral pores','c4bda6',.82)
    N=1024;rng=np.random.default_rng(431)
    y,x=np.mgrid[:N,:N]/N
    grain=(rng.random((N,N))-.5)*.012;vein=.008*np.sin(y*32+np.sin(x*14))
    pores=np.zeros((N,N),np.float32)
    for j in range(1100):
        cx,cy=rng.integers(3,N-3,2);pores[cy-1:cy+2,cx-1:cx+2]+=rng.uniform(.01,.05)
    value=grain+vein-pores
    im=map_image('Authored limestone mineral color 1024',np.clip(np.array([.55,.51,.42])+value[:,:,None],0,1))
    image_node(stone,im,'Base Color')
    dx,dy=np.gradient(value);nn=np.dstack((-dy*3,-dx*3,np.ones_like(value)));nn/=np.linalg.norm(nn,axis=2)[:,:,None]
    normal_node(stone,map_image('Authored limestone pore normal 1024',nn*.5+.5,True),.65)
    rough=np.clip(.80+pores*4+grain*2,0,1)
    image_node(stone,map_image('Authored limestone pore roughness 1024',np.repeat(rough[:,:,None],3,2),True),'Roughness')
    teal=mat('03 Sea teal tailored mattress','3e8582',.91)
    deep=mat('04 Deep teal back cushions','31666a',.93)
    accent=mat('05 Lagoon accent cushions','254f55',.93)
    piping=mat('06 Seafoam upholstery welting','609792',.91)
    # Shared physical weave normal, approximately 1.6 mm thread pitch at 0.75 m UV scale.
    N=2048;y,x=np.mgrid[:N,:N]/N
    phase_u=x*math.tau*384;phase_v=y*math.tau*384
    warp=np.sin(phase_u);weft=np.sin(phase_v)
    weave_u=.16*np.cos(phase_u)*(.75+.25*weft)
    weave_v=.16*np.cos(phase_v)*(.75-.25*warp)
    nn=np.dstack((weave_u,weave_v,np.ones_like(warp)));nn/=np.linalg.norm(nn,axis=2)[:,:,None]
    weave=map_image('Shared authored woven fabric normal 2048',nn*.5+.5,True)
    checker=(np.floor(x*384)+np.floor(y*384))%2
    threads=np.where(checker<1,(warp*.5+.5)*.7+(weft*.5+.5)*.3,(weft*.5+.5)*.7+(warp*.5+.5)*.3)
    thread_color=.88+.12*threads
    threadmap=map_image('Shared authored woven fiber color 2048',np.repeat(thread_color[:,:,None],3,2))
    roughmap=map_image('Shared authored woven fiber roughness 2048',np.repeat((.84+.15*(1-threads))[:,:,None],3,2),True)
    for m in (teal,deep,accent,piping):
        normal_node(m,weave,.75);image_node(m,roughmap,'Roughness')
        nodes=m.node_tree.nodes;links=m.node_tree.links;p=nodes.get('Principled BSDF');tint=tuple(p.inputs['Base Color'].default_value)
        tex=nodes.new('ShaderNodeTexImage');tex.image=threadmap
        # Blender 5.1 glTF recognizes the current RGBA Mix node for texture *
        # factor. Legacy MixRGB looks right in Cycles but drops the tint on export.
        multiply=nodes.new('ShaderNodeMix');multiply.data_type='RGBA';multiply.blend_type='MULTIPLY';multiply.inputs[0].default_value=1;multiply.inputs[7].default_value=tint
        links.new(tex.outputs['Color'],multiply.inputs[6]);links.new(multiply.outputs[2],p.inputs['Base Color'])
    metal=mat('07 Aged marine metal | recesses and lantern','393d35',.48,.6)
    amber=mat('08 Opaque amber lantern diffuser','f3d3a1',.5)
    p=amber.node_tree.nodes.get('Principled BSDF');p.inputs['Emission Color'].default_value=(*rgb('ffd59b'),1);p.inputs['Emission Strength'].default_value=.08
    return dict(wood=wood,stone=stone,teal=teal,deep=deep,accent=accent,piping=piping,metal=metal,amber=amber)

def pillow(name,center,w,h,d,m,c,welting,phase=0):
    """Two inflated sewn panels, a shared perimeter seam, and localized tension folds."""
    sides=96;rings=15;v=[];f=[];lookup={};perimeter=[]
    def add(p):
        key=tuple(round(float(a),9) for a in p)
        if key not in lookup:lookup[key]=len(v);v.append(p)
        return lookup[key]
    sheets=[]
    for sign in (1,-1):
        centeridx=add((0,sign*d/2,0));prev=None
        for j in range(1,rings+1):
            r=j/rings;ring=[]
            for k in range(sides):
                t=math.tau*k/sides
                px=w/2*math.copysign(abs(math.cos(t))**.52,math.cos(t))*r
                pz=h/2*math.copysign(abs(math.sin(t))**.52,math.sin(t))*r
                bulge=d/2*max(0,1-r**3)**.48
                # A few folds originate at loaded bottom corners and die into the panel.
                fold=0
                for sx in (-1,1):
                    distance=((px-sx*w*.36)/(.13*w))**2+((pz+h*.35)/(.24*h))**2
                    fold+=.012*math.exp(-distance)*math.sin((px-sx*w*.36)*65+(pz+h*.35)*42+phase)
                py=sign*(bulge*(1+.025*r*math.sin(t+phase))+fold*(1-r))
                pz=max(pz,-h/2+.006*(1-r))
                upper=(pz/h+.5)**2
                px+=.012*math.sin(phase+.3)*upper
                pz-=.016*(.7+.3*math.cos(t+phase))*upper
                ring.append(add((px,py,pz)))
                if sign==1 and j==rings:perimeter.append((px,py,pz))
            if prev is None:
                for k in range(sides):f.append((centeridx,ring[k],ring[(k+1)%sides]))
            else:
                for k in range(sides):f.append((prev[k],ring[k],ring[(k+1)%sides],prev[(k+1)%sides]))
            prev=ring
    o=mesh(name,v,f,m,c,True);o.location=center;uv(o,(0,2),.75)
    tube(name+' sewn perimeter piping',[(x+center[0],y+center[1],z+center[2]) for x,y,z in perimeter],.003,welting,c,True,8)
    # Small closed stitches lie in the face beside the perimeter; not floating decoration.
    stitches=[]
    for k in range(0,len(perimeter),2):
        t=math.tau*k/len(perimeter);a=perimeter[k];b=perimeter[(k+1)%len(perimeter)]
        stitched_r=.98;front_y=d/2*(1-stitched_r**3)**.48+.0007
        points=[(center[0]+p[0]*stitched_r,center[1]+front_y,center[2]+p[2]*stitched_r) for p in (a,b)]
        stitches.append(points)
    for k,p in enumerate(stitches):tube(name+' saddle stitch %02d'%k,p,.00075,welting,c,False,5)
    return o

def clip_x(poly,bound,greater):
    out=[]
    for a,b in zip(poly,poly[1:]+poly[:1]):
        ina=a[0]>=bound if greater else a[0]<=bound;inb=b[0]>=bound if greater else b[0]<=bound
        if ina:out.append(a)
        if ina!=inb:
            t=(bound-a[0])/(b[0]-a[0]);out.append((bound,a[1]+(b[1]-a[1])*t))
    return out

def create_daybed(c,M):
    # Three shallow-jointed stone courses retain the exact original envelope.
    cyl('Limestone continuous structural core',(0,0,-.56),1.625,.88,M['stone'],c,192)
    for row in range(3):
        z0=-1+row*.88/3;z1=-1+(row+1)*.88/3
        for j in range(18):
            a=(j+(row%2)*.5)*math.tau/18
            annular('Stone course %d | fitted block %02d'%(row,j),1.615,1.65,a+.001,b:=a+math.tau/18-.001,z0+.0015,z1-.0015,M['stone'],c,.002,8)
    for j in range(28):
        a=j*math.tau/28
        annular('Radial timber rim | jointed segment %02d'%j,1.448,1.65,a+.0009,a+math.tau/28-.0009,-.12,0,M['wood'],c,.0025,8)
    # Individual boards continue under the cushion and explain its 25 mm support.
    disc=[(1.452*math.cos(j*math.tau/192),1.452*math.sin(j*math.tau/192)) for j in range(192)]
    for j in range(19):
        left=-1.452+j*2.904/19+.0015;right=-1.452+(j+1)*2.904/19-.0015
        poly=clip_x(clip_x(disc,left,True),right,False)
        n=len(poly);v=[(x,y,z) for z in (-.08,.025) for x,y in poly]
        f=[tuple(reversed(range(n))),tuple(n+i for i in range(n))]
        f.extend((k,(k+1)%n,(k+1)%n+n,k+n) for k in range(n))
        o=mesh('Under-pad support board %02d'%j,v,f,M['wood'],c);uv(o,(0,1),1.6)
        mod=o.modifiers.new('Drained board edge radius','BEVEL');mod.width=.0018;mod.segments=2
    # The occupied front remains open. Rear supports sit directly behind the pillows.
    for x in (-1.0,-.69,0,.69,1.0):
        bx('Rear cushion frame upright',(x,-1.115,.24),(.038,.036,.48),M['wood'],c,.004)
    bx('Rear frame lower rail',(0,-1.115,.10),(2.10,.045,.055),M['wood'],c)
    bx('Rear frame crest rail',(0,-1.115,.486),(2.13,.044,.038),M['wood'],c,.005)
    for x in (-1.0,1.0):
        beam('Rear frame foot tenon',(x,-1.115,-.05),(x,-1.115,.06),.048,.054,M['wood'],c)
        plug=cyl('Flush timber peg',(x,-1.09,.36),.008,.004,M['wood'],c,24);plug.rotation_euler[0]=math.pi/2
    # A continuous tailored mattress with an exactly flat functional sitting field.
    profile=[(0,.025),(1.415,.025),(1.447,.034),(1.458,.052),(1.46,.083),(1.452,.124),(1.452,.163),(1.46,.205),(1.455,.232),(1.442,.249),(1.425,.255),(0,.255)]
    o=put(closed_lathe('Sea teal circular mattress | sewn inflated shell',profile,(0,0,0),M['teal'],192),c);round_side_uv(o,.75)
    for rad,z in ((1.446,.246),(1.451,.045)):
        tube('Mattress continuous perimeter welting',[(rad*math.cos(j*math.tau/384),rad*math.sin(j*math.tau/384),z) for j in range(384)],.0032,M['piping'],c,True,8)
    # Short stitch dashes track the real upper seam. The seated patches do not cross it.
    for j in range(384):
        a=j*math.tau/384;b=a+.007
        tube('Upper mattress lock stitch %03d'%j,[(1.435*math.cos(q),1.435*math.sin(q),.252) for q in (a,b)],.00065,M['piping'],c,False,5)
    # Rear service zip lies in the lower side gusset, away from guests' legs.
    points=[(1.454*math.cos(q),1.454*math.sin(q),.114) for q in np.linspace(4.56,4.86,40)]
    tube('Hidden rear upholstery zipper tape',points,.0038,M['deep'],c,False,8)
    for j,q in enumerate(np.linspace(4.57,4.85,36)):
        bx('Zipper tooth %02d'%j,(1.456*math.cos(q),1.456*math.sin(q),.115),(.003,.004,.006),M['metal'],c,.0005)
    for j,x in enumerate((-.69,0,.69)):
        pillow('Back cushion %d | inflated sewn panels'%j,(x,-.92,.485),.66,.46,.36,M['deep'],c,M['piping'],j*.65)
    for j,x in enumerate((-.67,.67)):
        pillow('Loose lumbar cushion %d'%j,(x,-.637,.445),.48,.38,.20,M['accent'],c,M['piping'],j*.9+1)
    # Cantilever tray is carried by two posts outside the cushion and an upper arm.
    for y in (-.13,.03):
        bx('Side tray rim-mounted upright',(-1.542,y,.145),(.035,.035,.29),M['wood'],c,.004)
        beam('Side tray cantilever arm',(-1.542,y,.278),(-1.09,y,.278),.029,.022,M['wood'],c,.003)
    tray=put(closed_lathe('Solid timber side tray | turned edge',[(0,.275),(.315,.275),(.338,.288),(.338,.345),(.328,.37),(.30,.37),(.298,.358),(0,.358)],(-1.26,-.05,0),M['wood'],96),c);turned_board_uv(tray,1.6)
    tx,ty=-1.26,-.05
    bx('Lantern foot plinth',(tx,ty,.368),(.232,.232,.020),M['metal'],c,.003)
    cyl('Opaque amber lantern insert',(tx,ty,.505),.066,.232,M['amber'],c,32)
    for dx in (-.094,.094):
        for dy in (-.094,.094):bx('Lantern mortised corner post',(tx+dx,ty+dy,.507),(.018,.018,.278),M['wood'],c,.002)
    bx('Lantern solid cap',(tx,ty,.662),(.24,.24,.035),M['wood'],c,.004)
    for y in (ty-.093,ty+.093):
        bx('Lantern lower horizontal tie',(tx,y,.39),(.195,.012,.012),M['metal'],c,.002)
    for x in (tx-.068,tx+.068):bx('Lantern folding handle mount',(x,ty,.681),(.016,.027,.01),M['metal'],c,.002)
    beam('Lantern folded carry handle',(tx-.068,ty,.69),(tx+.068,ty,.69),.011,.011,M['metal'],c,.003)

def import_baseline(c):
    source=json.loads((OUT/'baseline-captured.json').read_text());cache={}
    rough={'wood':.85,'stone':.95,'fabric':.94,'amber':.65}
    for j,piece in enumerate(source['pieces']):
        key=(piece['kind'],piece['color'])
        if key not in cache:
            m=mat('SOURCE '+key[0]+' '+key[1],key[1].lstrip('#'),rough[key[0]])
            if key[0]=='amber':
                bsdf=m.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Emission Color'].default_value=(*rgb('ffcf8d'),1);bsdf.inputs['Emission Strength'].default_value=.08
            cache[key]=m
        a=piece['positions'];v=[(a[i]-62,42-a[i+2],a[i+1]-1.5) for i in range(0,len(a),3)]
        faces=[(i,i+1,i+2) for i in range(0,len(v),3)]
        # Keep exact source vertex and triangle ordering. bmesh reordering would
        # mismatch Three's captured split normals and manufacture a false before.
        me=bpy.data.meshes.new('Exact captured source triangles %02d'%j);me.from_pydata(v,[],faces);me.update()
        o=bpy.data.objects.new('Actual source piece %02d | '%j+piece['kind'],me);c.objects.link(o);me.materials.append(cache[key])
        for p in me.polygons:p.use_smooth=True
        n=piece['normals'];o.data.normals_split_custom_set([(n[i],-n[i+2],n[i+1]) for i in range(0,len(n),3)])
    return source

def geometry_stats(objects,volume=False):
    coords=[];triangles=0;degenerate=0;bad=0;open_parts=[];materials=set()
    for o in objects:
        if o.type!='MESH':continue
        me=o.data;me.calc_loop_triangles();triangles+=len(me.loop_triangles)
        coords.extend(tuple(o.matrix_world@v.co) for v in me.vertices)
        bad+=sum(not all(math.isfinite(n) for n in v.co) for v in me.vertices)
        degenerate+=sum(t.area<1e-12 for t in me.loop_triangles)
        materials.update(m.name for m in me.materials if m)
        if volume:
            bm=bmesh.new();bm.from_mesh(me)
            if any(not e.is_manifold for e in bm.edges):open_parts.append(o.name)
            bm.free()
    low=[min(v[i] for v in coords) for i in range(3)];high=[max(v[i] for v in coords) for i in range(3)]
    return dict(meshes=sum(o.type=='MESH' for o in objects),triangles=triangles,materials=sorted(materials),degenerate_triangles=degenerate,nonfinite_vertices=bad,nonmanifold_parts=open_parts,bounds_min=low,bounds_max=high,dimensions=[b-a for a,b in zip(low,high)],max_horizontal_radius=max(math.hypot(v[0],v[1]) for v in coords))
def seat_validation(objects):
    vs=[];faces=[]
    for o in objects:
        if o.type!='MESH':continue
        start=len(vs);vs.extend(o.matrix_world@v.co for v in o.data.vertices)
        faces.extend(tuple(start+i for i in p.vertices) for p in o.data.polygons)
    tree=BVHTree.FromPolygons(vs,faces,all_triangles=False)
    heights=[];samples=[]
    for x in (-.95,.95):
        for dx in np.linspace(-.10,.10,5):
            for dy in np.linspace(-.10,.10,5):
                p=Vector((x+dx,.85+dy,3));hit,normal,index,distance=tree.ray_cast(p,Vector((0,0,-1)),5)
                assert hit is not None,(x,dx,dy)
                heights.append(hit.z);samples.append([float(p.x),float(p.y),float(hit.z)])
    return dict(world_seat_y=1.755,local_seat_z=.255,samples=len(heights),sample_patch_size_m=.2,max_plane_deviation_m=max(abs(z-.255) for z in heights),height_min=min(heights),height_max=max(heights))
def set_visibility(baseline,asset,before):
    baseline.hide_render=not before;asset.hide_render=before
def configure_scene():
    scene=bpy.context.scene;scene.unit_settings.system='METRIC';scene.render.engine='CYCLES'
    scene.cycles.device='CPU';scene.cycles.samples=24;scene.cycles.use_denoising=True
    scene.render.threads_mode='FIXED';scene.render.threads=4
    scene.render.resolution_x=1440;scene.render.resolution_y=1080;scene.render.resolution_percentage=100
    scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast';scene.view_settings.exposure=0
    if not scene.world:scene.world=bpy.data.worlds.new('Neutral coast studio world')
    scene.world.color=(.22,.22,.22)
    return scene
def make_rig():
    scene=configure_scene();rig=collection('PRESENTATION | excluded from GLB')
    ground=bx('Neutral sand studio floor',(0,0,-1.012),(200,200,.02),mat('RIG warm grey','a6a99c',.9),rig,.001)
    for name,loc,power,size,col in [('Sea window',(0,3.8,5),760,4.2,(.87,.95,1)),('Warm side',(4,-1,3.4),550,3.5,(1,.85,.64)),('Soft rear rim',(-3,-3,3.5),650,3.2,(.83,.96,1))]:
        data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size;data.color=col
        o=bpy.data.objects.new(name,data);rig.objects.link(o);o.location=loc;o.rotation_euler=(Vector((0,0,-.1))-o.location).to_track_quat('-Z','Y').to_euler()
    data=bpy.data.cameras.new('Frozen review camera');cam=bpy.data.objects.new('Frozen review camera',data);rig.objects.link(cam);scene.camera=cam
    return rig
def set_camera(pos,target,scale):
    cam=bpy.context.scene.camera;cam.location=pos;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=scale
def render(name,samples=24):
    s=bpy.context.scene;s.cycles.samples=samples;s.render.filepath=str(OUT/name);bpy.ops.render.render(write_still=True)

def preview():
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    scene=configure_scene();baseline=collection('BASELINE | real source 62 42');asset=collection('ASSET | refined daybed | origin world 62 1.5 42')
    source=import_baseline(baseline);M=palette();create_daybed(asset,M);apply_parts(asset)
    native=geometry_stats(list(asset.objects),True);seats=seat_validation(list(asset.objects))
    assert native['degenerate_triangles']==0 and native['nonfinite_vertices']==0,native
    assert not native['nonmanifold_parts'],native['nonmanifold_parts']
    assert native['max_horizontal_radius']<1.651,native['max_horizontal_radius']
    assert seats['max_plane_deviation_m']<.0001,seats
    make_rig();set_camera((4.2,5.8,3.3),(-.02,0,-.12),4.38)
    scene.render.image_settings.file_format='PNG'
    scene.render.image_settings.color_mode='RGB'
    set_visibility(baseline,asset,False)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'daybed-editable.blend'))
    set_visibility(baseline,asset,True);render('daybed-before.png')
    set_visibility(baseline,asset,False);render('daybed-after.png')
    info=dict(source=source['description'],source_hashes=source['sourceHashes'],baseline_triangles=source['triangles'],native=native,seats=seats,origin_world=[62,1.5,42],front_world=[0,0,-1],front_blender=[0,1,0],blender=bpy.app.version_string,render=dict(engine='Cycles CPU',threads=4,resolution=[1440,1080],view_transform='AgX',look='AgX - Medium High Contrast',exposure=0,overview=dict(position=[4.2,5.8,3.3],target=[-.02,0,-.12],ortho_scale=4.38,samples=24)))
    (OUT/'preview-validation.json').write_text(json.dumps(info,indent=2))
    print('PREVIEW_OK',json.dumps({k:info[k] for k in ('native','seats')}))

def finish(verify_only=False):
    bpy.ops.wm.open_mainfile(filepath=str(OUT/'daybed-editable.blend'))
    asset=next(c for c in bpy.data.collections if c.name.startswith('ASSET |'))
    native=geometry_stats(list(asset.objects));native_seats=seat_validation(list(asset.objects))
    runtime=collection('RUNTIME | exactly one mesh per physical material')
    groups={}
    for original in asset.objects:
        if original.type!='MESH':continue
        m=original.data.materials[0];copy=original.copy();copy.data=original.data.copy();runtime.objects.link(copy)
        assert len(copy.data.uv_layers)==1,original.name
        copy.data.uv_layers.active.name='UVMap'
        groups.setdefault(m.name,[]).append(copy)
    for name,objects in groups.items():
        bpy.ops.object.select_all(action='DESELECT')
        for o in objects:o.select_set(True)
        bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join()
        bpy.context.object.name='DJC_Daybed_'+name.split(' ',1)[1].split(' |')[0].replace(' ','_')
    bpy.ops.object.select_all(action='DESELECT')
    for o in runtime.objects:o.select_set(True)
    batched=geometry_stats(list(runtime.objects))
    assert batched['meshes']==8 and batched['triangles']==native['triangles']
    if not verify_only:bpy.ops.export_scene.gltf(filepath=str(OUT/'daybed-v1.glb'),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_animations=False,export_cameras=False,export_lights=False)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(OUT/'daybed-v1.glb'))
    imported=[o for o in bpy.context.scene.objects if o.type=='MESH']
    fresh=geometry_stats(imported);fresh_seats=seat_validation(imported)
    assert fresh['triangles']==native['triangles'] and fresh['meshes']==8
    assert fresh['materials']==native['materials']
    assert fresh['degenerate_triangles']==0 and fresh['nonfinite_vertices']==0
    assert max(abs(a-b) for a,b in zip(native['dimensions'],fresh['dimensions']))<.0001
    assert fresh_seats['max_plane_deviation_m']<.0001
    fresh_images=[dict(name=i.name,size=list(i.size),colorspace=i.colorspace_settings.name) for i in bpy.data.images if i.size[0]>0]
    if not verify_only:
        make_rig();set_camera((-3.3,2.8,1.8),(-.85,-.20,.20),1.95)
        render('daybed-close-fresh-glb.png',32)
        clay=mat('RIG neutral clay','b8b3a6',.73)
        bpy.context.view_layer.material_override=clay
        set_camera((4.2,5.8,3.3),(-.02,0,-.12),4.38)
        render('daybed-clay.png',24)
    blob=(OUT/'daybed-v1.glb').read_bytes();length=int.from_bytes(blob[12:16],'little');gltf=json.loads(blob[20:20+length])
    assert not gltf.get('cameras')
    assert all(m.get('alphaMode','OPAQUE')=='OPAQUE' for m in gltf.get('materials',[]))
    assert 'KHR_materials_transmission' not in gltf.get('extensionsUsed',[])
    cloth=[m for m in gltf['materials'] if m['name'].startswith(('03 ','04 ','05 ','06 '))]
    expected={'03':'3e8582','04':'31666a','05':'254f55','06':'609792'}
    for m in cloth:
        actual=m['pbrMetallicRoughness']['baseColorFactor'][:3]
        assert max(abs(a-b) for a,b in zip(actual,rgb(expected[m['name'][:2]])))<1e-6,(m['name'],actual)
    shared=[]
    for m in cloth:
        ref=m['pbrMetallicRoughness']['baseColorTexture'];tex=gltf['textures'][ref['index']]
        shared.append((tex['source'],tex.get('sampler'),ref.get('texCoord',0)))
    assert len(set(shared))==1,shared
    assert all('metallicRoughnessTexture' in m['pbrMetallicRoughness'] and 'normalTexture' in m for m in cloth)
    for m in gltf['materials']:
        refs=[m.get('normalTexture'),m.get('emissiveTexture'),m.get('occlusionTexture')]
        refs.extend(m.get('pbrMetallicRoughness',{}).get(k) for k in ('baseColorTexture','metallicRoughnessTexture'))
        assert all(ref.get('texCoord',0)==0 for ref in refs if ref),m['name']
    info=json.loads((OUT/'preview-validation.json').read_text())
    files=['daybed-editable.blend','daybed-v1.glb','daybed-before.png','daybed-after.png','daybed-close-fresh-glb.png','daybed-clay.png','baseline-captured.json']
    info.update(runtime=batched,fresh_glb=fresh,fresh_seats=fresh_seats,glb_bytes=len(blob),embedded_images=len(gltf.get('images',[])),fresh_images=fresh_images,extensions=gltf.get('extensionsUsed',[]),hashes={f:hashlib.sha256((OUT/f).read_bytes()).hexdigest() for f in files},scripts={f:hashlib.sha256((TOOLS/f).read_bytes()).hexdigest() for f in ['build.py','capture-baseline.mjs','run.py']},close=dict(position=[-3.3,2.8,1.8],target=[-.85,-.20,.20],ortho_scale=1.95,samples=32),clay='Fresh GLB, neutral material override; same overview camera and lighting as before/after',verification_notes=['Native evaluated closed-volume check passed before export.','Fresh GLB compared bounds, triangles, material inventory, 50 seat-height ray samples, images and opaque material semantics.','Four cloth materials preserve distinct tint factors, one shared fiber color texture, a roughness texture and a normal texture.','glTF UV/normal vertex splitting is not interpreted as broken source volume.','No browser runtime or user visual acceptance claimed.'])
    (OUT/'manifest.json').write_text(json.dumps(info,indent=2))
    print('FINISH_OK',json.dumps(dict(triangles=fresh['triangles'],materials=len(fresh['materials']),meshes=fresh['meshes'],bytes=len(blob),seat_max_deviation=fresh_seats['max_plane_deviation_m'],images=fresh_images)))

if __name__=='__main__':
    phase=sys.argv[sys.argv.index('--')+1] if '--' in sys.argv else 'preview'
    if phase=='finish':finish()
    elif phase=='verify':finish(True)
    else:preview()
